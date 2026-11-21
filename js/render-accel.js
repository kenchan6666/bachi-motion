"use strict";

/**
 * GPU-first rendering and encoding, with an automatic CPU fallback.
 *
 * Chrome / Electron must not be launched with --disable-gpu when a real GPU
 * is available. If that launch or GPU init fails, the same job is retried
 * with a software path. ffmpeg tries NVENC, then AMF, then QSV, then libx264.
 * A failed hardware encoder never aborts the render by itself: the caller
 * retries the frames with libx264.
 */

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const SOFTWARE_ADAPTER = /microsoft basic|basic display|basic render|standard vga|remote display adapter|llvmpipe|softpipe|lavapipe|microsoft hyper-v video|aspeed|matrox g200|qxl|virtualbox|vmware svga|virtual (display|adapter)/i;
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|lavapipe|microsoft basic render|software rasterizer|disabled/i;
const GPU_CRASH = /GPU process isn't usable|GPU process exited unexpectedly|GPU process launch failed|Failed to initialize GPU process|Exiting GPU process due to errors/i;

const ENCODER_ORDER = ["h264_nvenc", "h264_amf", "h264_qsv", "libx264"];

function missingFfmpegMessage() {
  if (process.env.BACHI_DESKTOP === "1") {
    return [
      "找不到 ffmpeg，没法出片。",
      "bachi-motion 0.2.2 的 Windows 安装包里已经带了 ffmpeg，不需要另外下载，也不需要联网。",
      "请重新解压完整的 zip，确认 resources\\ffmpeg\\ffmpeg.exe 还在。不要只拷贝 bachi-motion.exe。",
      "预览谱面仍然可以。出片要等 ffmpeg 就位。",
    ].join("\n");
  }
  return [
    "找不到 ffmpeg，出片停住了。",
    "命令行 node render.js 使用本机的 ffmpeg。请把它加入 PATH，或设置环境变量 FFMPEG_PATH 指向 ffmpeg。",
    "Windows 安装包 0.2.2 自带 ffmpeg。双击 bachi-motion.exe 时不用另外安装。",
  ].join("\n");
}

function missingChromeMessage() {
  return [
    "找不到 Chrome，出片停住了。",
    "命令行 node render.js 使用本机的 Chrome 或 Edge，仓库本身不附带浏览器。",
    "请安装 Google Chrome，或设置环境变量 CHROME_PATH 指向 chrome.exe 或 msedge.exe。",
    "Windows 安装包 0.2.2 自带窗口和浏览器内核。双击 bachi-motion.exe 时不用另外安装 Chrome，也不会打开浏览器。",
  ].join("\n");
}

function chromeStartError(err) {
  const detail = err && err.message ? err.message : String(err || "");
  return new Error("无法启动浏览器（" + detail + "）。\n" + missingChromeMessage());
}

function bundledFfmpegCandidates() {
  const list = [];
  if (process.resourcesPath) {
    list.push(path.join(process.resourcesPath, "ffmpeg", "ffmpeg.exe"));
    list.push(path.join(process.resourcesPath, "ffmpeg", "ffmpeg"));
  }
  if (process.execPath) {
    const dir = path.dirname(process.execPath);
    list.push(path.join(dir, "ffmpeg", "ffmpeg.exe"));
    list.push(path.join(dir, "ffmpeg", "ffmpeg"));
  }
  return list;
}

function findFfmpeg() {
  const env = process.env.FFMPEG_PATH;
  if (env && fs.existsSync(env)) return path.resolve(env);
  for (const candidate of bundledFfmpegCandidates()) {
    try { if (fs.existsSync(candidate)) return candidate; } catch { /* ignore */ }
  }
  const which = process.platform === "win32" ? "where.exe" : "which";
  const located = spawnSync(which, ["ffmpeg"], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  if (!located.error && located.status === 0) {
    const line = String(located.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    if (line && fs.existsSync(line)) return line;
  }
  const probe = spawnSync("ffmpeg", ["-version"], {
    stdio: "ignore",
    timeout: 5000,
    windowsHide: true,
  });
  if (!probe.error && probe.status === 0) return "ffmpeg";
  return null;
}

function prepareFfmpeg() {
  const found = findFfmpeg();
  if (!found) {
    const err = new Error(missingFfmpegMessage());
    err.code = "FFMPEG_MISSING";
    throw err;
  }
  if (path.isAbsolute(found) || found !== "ffmpeg") process.env.FFMPEG_PATH = found;
  return process.env.FFMPEG_PATH || found;
}

function ffmpegBin() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

function findChrome() {
  const list = [];
  if (process.env.CHROME_PATH) list.push(process.env.CHROME_PATH);
  if (process.env.PUPPETEER_EXECUTABLE_PATH) list.push(process.env.PUPPETEER_EXECUTABLE_PATH);
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || "";
    const pf = process.env.ProgramFiles || "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    list.push(
      path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(local, "Microsoft", "Edge", "Application", "msedge.exe"),
    );
  } else if (process.platform === "darwin") {
    list.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else {
    list.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
      "/usr/bin/microsoft-edge",
    );
  }
  for (const candidate of list) {
    try { if (candidate && fs.existsSync(candidate)) return candidate; } catch { /* ignore */ }
  }
  return null;
}

function classifyGpuNames(names) {
  const cleaned = [];
  for (const raw of names || []) {
    const name = String(raw || "").trim();
    if (!name || SOFTWARE_ADAPTER.test(name)) continue;
    cleaned.push(name);
  }
  return { available: cleaned.length > 0, names: cleaned };
}

function readWindowsGpuNames() {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
  ], { encoding: "utf8", timeout: 15000, windowsHide: true });
  if (result.error || result.status !== 0) return [];
  return String(result.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function readLinuxGpuNames() {
  const names = [];
  const drm = "/sys/class/drm";
  if (fs.existsSync(drm)) {
    let entries = [];
    try { entries = fs.readdirSync(drm); } catch { entries = []; }
    for (const ent of entries) {
      if (!/^card\d+$/.test(ent)) continue;
      let vendor = "";
      try { vendor = fs.readFileSync(path.join(drm, ent, "device", "vendor"), "utf8").trim(); } catch { vendor = ""; }
      if (vendor === "0x10de") names.push("NVIDIA");
      else if (vendor === "0x1002" || vendor === "0x1022") names.push("AMD");
      else if (vendor === "0x8086") names.push("Intel");
      else if (vendor) names.push("GPU " + vendor);
    }
  }
  if (!names.length && (fs.existsSync("/dev/nvidia0") || fs.existsSync("/proc/driver/nvidia/version"))) {
    names.push("NVIDIA");
  }
  return names;
}

function readGpuNames() {
  if (process.platform === "darwin") return ["Apple GPU"];
  if (process.platform === "win32") return readWindowsGpuNames();
  return readLinuxGpuNames();
}

function detectGpu() {
  if (process.env.BACHI_RENDER === "cpu" || process.env.BACHI_FORCE_CPU === "1") {
    return { available: false, names: [], reason: "forced-cpu" };
  }
  if (process.env.BACHI_RENDER === "gpu") {
    return { available: true, names: ["forced"], reason: "forced-gpu" };
  }
  try {
    const found = classifyGpuNames(readGpuNames());
    found.reason = found.available ? "detected" : "none";
    return found;
  } catch (err) {
    return { available: false, names: [], reason: "detect-failed" };
  }
}

function chromeArgs(mode, platform) {
  platform = platform || process.platform;
  const base = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--font-render-hinting=none",
    "--hide-scrollbars",
    "--disable-background-networking",
    "--disable-sync",
  ];
  if (mode === "cpu-minimal") return base.concat(["--disable-gpu"]);
  if (mode === "cpu") {
    return base.concat([
      "--disable-gpu",
      "--disable-gpu-compositing",
      "--use-gl=swiftshader",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ]);
  }
  const gpu = [
    "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization",
    "--disable-gpu-sandbox",
  ];
  if (platform === "win32") gpu.push("--use-angle=d3d11");
  else if (platform === "darwin") gpu.push("--use-angle=metal");
  else gpu.push("--use-gl=angle", "--use-angle=gl");
  return base.concat(gpu);
}

function electronSwitches(useGpu, platform) {
  platform = platform || process.platform;
  const common = [
    ["disable-background-networking"],
    ["disable-component-update"],
    ["disable-domain-reliability"],
    ["disable-sync"],
    ["no-pings"],
    ["disable-breakpad"],
    ["autoplay-policy", "no-user-gesture-required"],
  ];
  if (!useGpu) {
    return common.concat([
      ["disable-gpu"],
      ["disable-gpu-compositing"],
      ["use-gl", "swiftshader"],
      ["use-angle", "swiftshader"],
      ["enable-unsafe-swiftshader"],
    ]);
  }
  const gpu = [
    ["ignore-gpu-blocklist"],
    ["enable-gpu-rasterization"],
    ["disable-gpu-sandbox"],
  ];
  if (platform === "win32") gpu.push(["use-angle", "d3d11"]);
  else if (platform === "darwin") gpu.push(["use-angle", "metal"]);
  else gpu.push(["use-gl", "angle"], ["use-angle", "gl"]);
  return common.concat(gpu);
}

function switchDisablesGpu(switches) {
  return (switches || []).some((item) => item && item[0] === "disable-gpu");
}

function launchOptions(chromePath, mode, platform) {
  const opts = {
    headless: true,
    args: chromeArgs(mode, platform),
  };
  if (chromePath) opts.executablePath = chromePath;
  return opts;
}

function createLaunchPlan(chromePath, platform) {
  const gpu = detectGpu();
  const mode = gpu.available ? "gpu" : "cpu";
  return {
    chromePath: chromePath || null,
    platform: platform || process.platform,
    mode: mode,
    startedMode: mode,
    gpuNames: gpu.names,
    verifyGpu: mode === "gpu",
    launchOpts: launchOptions(chromePath, mode, platform || process.platform),
  };
}

function applyLaunchMode(plan, mode) {
  plan.mode = mode === "cpu-minimal" ? "cpu" : mode;
  plan.cpuMinimal = mode === "cpu-minimal";
  plan.launchOpts = launchOptions(plan.chromePath, mode, plan.platform);
}

function isSoftwareRenderer(renderer) {
  return SOFTWARE_RENDERER.test(String(renderer || ""));
}

function classifyGpuPage(text) {
  const body = String(text || "");
  if (!body.trim()) return "unknown";
  const pick = (label) => {
    const match = body.match(new RegExp(label + "\\s*:\\s*([^\\n]+)", "i"));
    return match ? match[1].trim() : "";
  };
  const line = pick("Compositing") || pick("Canvas") || pick("WebGL");
  if (/hardware accelerated/i.test(line)) return "hardware";
  if (/software only|unavailable|disabled/i.test(line)) return "software";
  if (isSoftwareRenderer(body) && !/hardware accelerated/i.test(body)) return "software";
  return "unknown";
}

function featureStatusIsSoftware(status) {
  if (!status || typeof status !== "object") return false;
  const compositing = String(status.gpu_compositing || "");
  if (!compositing || compositing === "enabled" || compositing === "disabled_off_ok") return false;
  return compositing === "disabled_software" || compositing === "unavailable" || compositing === "software_only";
}

function gpuLogLooksFailed(text) {
  return GPU_CRASH.test(String(text || ""));
}

function framePlan(chartStart, chartEnd, fps, rate) {
  const chartLen = chartEnd - chartStart;
  const videoDur = chartLen / rate;
  const frameCount = Math.max(0, Math.ceil(videoDur * fps));
  return {
    chartStart: chartStart,
    chartEnd: chartEnd,
    chartLen: chartLen,
    videoDur: videoDur,
    frameCount: frameCount,
  };
}

function frameTime(plan, frameIndex, fps, rate) {
  return Math.min(plan.chartEnd, plan.chartStart + (frameIndex / fps) * rate);
}

function encoderByName(name, extra) {
  extra = extra || {};
  if (name === "h264_nvenc") {
    return {
      name: name,
      label: "h264_nvenc（NVIDIA）",
      beforeInput: extra.beforeInput || [],
      vf: "scale=in_range=pc:out_range=tv,format=yuv420p",
      args: ["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "20", "-pix_fmt", "yuv420p"],
    };
  }
  if (name === "h264_amf") {
    return {
      name: name,
      label: "h264_amf（AMD）",
      beforeInput: extra.beforeInput || [],
      vf: "scale=in_range=pc:out_range=tv,format=yuv420p",
      args: ["-c:v", "h264_amf", "-usage", "transcoding", "-quality", "balanced", "-pix_fmt", "yuv420p"],
    };
  }
  if (name === "h264_qsv") {
    return {
      name: name,
      label: "h264_qsv（Intel）",
      beforeInput: extra.beforeInput || [],
      vf: "scale=in_range=pc:out_range=tv,format=nv12",
      args: ["-c:v", "h264_qsv", "-pix_fmt", "nv12"],
    };
  }
  return {
    name: "libx264",
    label: "libx264（CPU）",
    beforeInput: [],
    vf: "scale=in_range=pc:out_range=tv,format=yuv420p",
    args: ["-c:v", "libx264", "-pix_fmt", "yuv420p"],
  };
}

function probeVariants(name) {
  const spec = encoderByName(name);
  if (name === "h264_qsv") {
    return [
      { beforeInput: [], args: spec.args },
      {
        beforeInput: ["-init_hw_device", "qsv=hw", "-filter_hw_device", "hw"],
        args: spec.args,
      },
    ];
  }
  return [{ beforeInput: spec.beforeInput, args: spec.args }];
}

function listEncoderNames(bin) {
  const result = spawnSync(bin || ffmpegBin(), ["-hide_banner", "-encoders"], {
    encoding: "utf8",
    timeout: 20000,
    windowsHide: true,
  });
  const text = String(result.stdout || "") + "\n" + String(result.stderr || "");
  const names = new Set();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*[A-Z.]{6}\s+([A-Za-z0-9_]+)/);
    if (match) names.add(match[1]);
  }
  return names;
}

function probeEncoder(bin, name, variant) {
  const spec = variant || probeVariants(name)[0];
  const args = ["-hide_banner", "-loglevel", "error"]
    .concat(spec.beforeInput || [])
    .concat(["-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.08:r=25", "-frames:v", "2"])
    .concat(spec.args)
    .concat(["-f", "null", "-"]);
  const result = spawnSync(bin || ffmpegBin(), args, {
    encoding: "utf8",
    timeout: 20000,
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

function pickEncoder(listedNames, probe) {
  const have = listedNames instanceof Set ? listedNames : new Set(listedNames || []);
  for (const name of ENCODER_ORDER) {
    if (name !== "libx264" && !have.has(name)) continue;
    const variants = probeVariants(name);
    for (const variant of variants) {
      let ok = false;
      try { ok = probe(name, variant); } catch { ok = false; }
      if (ok) return encoderByName(name, { beforeInput: variant.beforeInput || [] });
    }
    if (name === "libx264") return encoderByName("libx264");
  }
  return encoderByName("libx264");
}

let cachedEncoder = null;

async function resolveVideoEncoder(opts) {
  opts = opts || {};
  if (!opts.force && cachedEncoder) return cachedEncoder;
  const bin = opts.bin || ffmpegBin();
  const listed = opts.encoders || listEncoderNames(bin);
  const probe = opts.probe || ((name, variant) => probeEncoder(bin, name, variant));
  const chosen = await Promise.resolve(pickEncoder(listed, probe));
  if (!opts.force) cachedEncoder = chosen;
  return chosen;
}

function resetEncoderCache() {
  cachedEncoder = null;
}

function useEncoder(encoder) {
  cachedEncoder = encoder;
  return encoder;
}

function runFfmpeg(argv, bin) {
  const command = bin || ffmpegBin();
  return new Promise((resolve, reject) => {
    const proc = spawn(command, argv, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let err = "";
    if (proc.stderr) proc.stderr.on("data", (d) => { err += d; });
    proc.on("error", (error) => {
      if (error && error.code === "ENOENT") reject(new Error(missingFfmpegMessage()));
      else reject(error);
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("ffmpeg 失败 (exit " + code + ")\n" + err.slice(-2000)));
    });
  });
}

function spawnFfmpegPipe(argv, bin) {
  const command = bin || ffmpegBin();
  const proc = spawn(command, argv, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let err = "";
  let exited = false;
  let exitCode = null;
  if (proc.stderr) proc.stderr.on("data", (d) => { err += d; });
  const done = new Promise((resolve, reject) => {
    proc.on("error", (error) => {
      exited = true;
      if (error && error.code === "ENOENT") reject(new Error(missingFfmpegMessage()));
      else reject(error);
    });
    proc.on("close", (code) => {
      exited = true;
      exitCode = code;
      if (code === 0) resolve();
      else reject(new Error("ffmpeg 失败 (exit " + code + ")\n" + err.slice(-2000)));
    });
  });
  function write(buf) {
    return new Promise((resolve, reject) => {
      if (exited) {
        return reject(new Error("ffmpeg 提前退出 (exit " + exitCode + ")\n" + err.slice(-2000)));
      }
      const stream = proc.stdin;
      if (!stream || stream.destroyed || stream.writableEnded) {
        return reject(new Error("ffmpeg stdin 不可写"));
      }
      const onErr = (error) => { cleanup(); reject(error); };
      const onClose = () => { cleanup(); reject(new Error("ffmpeg stdin 意外关闭")); };
      const cleanup = () => {
        stream.off("error", onErr);
        stream.off("close", onClose);
      };
      stream.once("error", onErr);
      stream.once("close", onClose);
      const ok = stream.write(buf);
      if (ok) {
        cleanup();
        resolve();
      } else {
        stream.once("drain", () => {
          cleanup();
          resolve();
        });
      }
    });
  }
  function end() {
    if (proc.stdin && !proc.stdin.destroyed && !proc.stdin.writableEnded) proc.stdin.end();
  }
  function kill() {
    if (!exited) {
      try { proc.kill("SIGKILL"); } catch { /* ignore */ }
    }
  }
  return { proc: proc, done: done, write: write, end: end, kill: kill };
}

function attachGpuLog(browser) {
  let text = "";
  try {
    const proc = browser && typeof browser.process === "function" ? browser.process() : null;
    if (proc && proc.stderr) {
      proc.stderr.on("data", (chunk) => {
        text += chunk.toString();
        if (text.length > 30000) text = text.slice(-30000);
      });
    }
  } catch { /* ignore */ }
  return () => text;
}

async function readGpuPage(browser) {
  let page = null;
  try {
    page = await browser.newPage();
    await page.goto("chrome://gpu", { waitUntil: "domcontentloaded", timeout: 8000 });
    return await page.evaluate(() => (document.body && document.body.innerText) || "");
  } catch (err) {
    return "";
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

async function readWebglRenderer(browser) {
  let page = null;
  try {
    page = await browser.newPage();
    return await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return "";
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const value = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      return String(value || "");
    });
  } catch (err) {
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

async function inspectBrowserGpu(browser) {
  const fromPage = classifyGpuPage(await readGpuPage(browser));
  if (fromPage === "hardware" || fromPage === "software") return fromPage;
  const renderer = await readWebglRenderer(browser);
  if (renderer == null) return "unknown";
  if (!renderer) return "unknown";
  if (isSoftwareRenderer(renderer)) return "software";
  return "hardware";
}

async function verifyLaunchPlan(puppeteer, plan, hooks) {
  hooks = hooks || {};
  const log = hooks.log || (() => {});
  const warn = hooks.warn || log;
  const attempts = [];
  if (plan.startedMode === "gpu") attempts.push("gpu");
  attempts.push("cpu", "cpu-minimal");
  let lastErr = null;
  for (const mode of attempts) {
    applyLaunchMode(plan, mode);
    let browser = null;
    try {
      browser = await puppeteer.launch(plan.launchOpts);
      const gpuLog = attachGpuLog(browser);
      if (mode === "gpu") {
        let status = "unknown";
        try { status = await inspectBrowserGpu(browser); } catch { status = "unknown"; }
        if (status === "unknown" && gpuLogLooksFailed(gpuLog())) status = "software";
        if (status === "software") {
          await browser.close().catch(() => {});
          browser = null;
          lastErr = new Error("显卡初始化失败");
          continue;
        }
      }
      await browser.close().catch(() => {});
      plan.verifyGpu = false;
      if (mode === "gpu") {
        const names = plan.gpuNames && plan.gpuNames.length ? "（" + plan.gpuNames.join("、") + "）" : "";
        log("画面使用显卡" + names);
      } else if (plan.startedMode === "gpu") {
        warn("显卡不可用，已改用 CPU 渲染。" + (lastErr ? " " + lastErr.message : ""));
      } else {
        log("没有检测到可用显卡，画面使用 CPU。");
      }
      return plan;
    } catch (err) {
      if (browser) await browser.close().catch(() => {});
      lastErr = err;
    }
  }
  throw chromeStartError(lastErr);
}

async function launchBrowser(puppeteer, plan, hooks) {
  if (!plan._verify) plan._verify = verifyLaunchPlan(puppeteer, plan, hooks);
  await plan._verify;
  try {
    return await puppeteer.launch(plan.launchOpts);
  } catch (err) {
    if (plan.mode === "gpu") {
      applyLaunchMode(plan, "cpu");
      if (hooks && hooks.warn) hooks.warn("显卡模式启动失败，已改用 CPU。");
      try {
        return await puppeteer.launch(plan.launchOpts);
      } catch (err2) {
        throw chromeStartError(err2);
      }
    }
    throw chromeStartError(err);
  }
}

module.exports = {
  SOFTWARE_ADAPTER: SOFTWARE_ADAPTER,
  ENCODER_ORDER: ENCODER_ORDER,
  missingFfmpegMessage: missingFfmpegMessage,
  missingChromeMessage: missingChromeMessage,
  chromeStartError: chromeStartError,
  bundledFfmpegCandidates: bundledFfmpegCandidates,
  findFfmpeg: findFfmpeg,
  prepareFfmpeg: prepareFfmpeg,
  ffmpegBin: ffmpegBin,
  findChrome: findChrome,
  classifyGpuNames: classifyGpuNames,
  detectGpu: detectGpu,
  chromeArgs: chromeArgs,
  electronSwitches: electronSwitches,
  switchDisablesGpu: switchDisablesGpu,
  launchOptions: launchOptions,
  createLaunchPlan: createLaunchPlan,
  applyLaunchMode: applyLaunchMode,
  isSoftwareRenderer: isSoftwareRenderer,
  classifyGpuPage: classifyGpuPage,
  featureStatusIsSoftware: featureStatusIsSoftware,
  gpuLogLooksFailed: gpuLogLooksFailed,
  framePlan: framePlan,
  frameTime: frameTime,
  encoderByName: encoderByName,
  probeVariants: probeVariants,
  listEncoderNames: listEncoderNames,
  probeEncoder: probeEncoder,
  pickEncoder: pickEncoder,
  resolveVideoEncoder: resolveVideoEncoder,
  resetEncoderCache: resetEncoderCache,
  useEncoder: useEncoder,
  runFfmpeg: runFfmpeg,
  spawnFfmpegPipe: spawnFfmpegPipe,
  launchBrowser: launchBrowser,
};
