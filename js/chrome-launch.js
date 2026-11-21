"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const BASE_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--font-render-hinting=none",
  "--hide-scrollbars",
];

const SOFTWARE_GPU = [
  /microsoft basic display/i,
  /microsoft basic render/i,
  /standard vga/i,
  /microsoft remote display/i,
  /hyper-v video/i,
  /llvmpipe/i,
  /softpipe/i,
  /swrast/i,
  /swiftshader/i,
  /simple-framebuffer/i,
  /simpledrm/i,
  /efifb/i,
  /\bbochs\b/i,
  /\b0x1234\b/i,
];

function existsSync(file) {
  try { return !!file && fs.existsSync(file); }
  catch (err) { return false; }
}

function splitNames(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^name$/i.test(line));
}

function isSoftwareGpuName(name) {
  const text = String(name || "").trim();
  if (!text) return true;
  return SOFTWARE_GPU.some((re) => re.test(text));
}

// true: hardware GPU, false: only software adapters, null: unknown.
function hasHardwareGpu(names) {
  const list = Array.isArray(names) ? names : splitNames(names);
  const cleaned = list.map((name) => String(name || "").trim()).filter(Boolean);
  if (!cleaned.length) return null;
  return cleaned.some((name) => !isSoftwareGpuName(name));
}

// GPU attempt first unless we already know there is no hardware GPU.
function gpuAttemptOrder(hardware) {
  if (hardware === false) return [true];
  return [false, true];
}

function electronGpuSwitches(disableGpu) {
  return disableGpu ? ["disable-gpu"] : [];
}

function buildLaunchOptions(opts) {
  opts = opts || {};
  const disableGpu = !!opts.disableGpu;
  const platform = opts.platform || process.platform;
  const args = BASE_ARGS.slice();
  if (disableGpu) {
    args.push("--disable-gpu");
  } else if (platform === "win32") {
    // Headless Chrome on Windows otherwise stays on software GL.
    args.push("--use-gl=angle", "--use-angle=d3d11");
  }
  const launchOpts = {
    headless: true,
    args: args,
  };
  if (!disableGpu) {
    // puppeteer-core has added this flag itself in some versions.
    launchOpts.ignoreDefaultArgs = ["--disable-gpu"];
  }
  if (opts.executablePath) launchOpts.executablePath = opts.executablePath;
  return launchOpts;
}

function chromeCandidates(env, platform) {
  env = env || {};
  const list = [env.CHROME_PATH, env.PUPPETEER_EXECUTABLE_PATH];
  if (platform === "win32") {
    const pf = env.PROGRAMFILES || "C:\\Program Files";
    const pf86 = env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const local = env.LOCALAPPDATA;
    list.push(
      path.win32.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
      path.win32.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
    );
    if (local) {
      list.push(path.win32.join(local, "Google", "Chrome", "Application", "chrome.exe"));
    }
  } else if (platform === "darwin") {
    list.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  } else {
    list.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
    );
  }
  return list.filter(Boolean);
}

function findChrome(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const exists = opts.exists || existsSync;
  const candidates = opts.candidates || chromeCandidates(env, platform);
  for (const candidate of candidates) {
    try { if (exists(candidate)) return candidate; }
    catch (err) { /* ignore */ }
  }
  return null;
}

function linuxGpuNames(fsImpl) {
  const drm = "/sys/class/drm";
  if (!fsImpl.existsSync(drm)) return [];
  const names = [];
  for (const entry of fsImpl.readdirSync(drm)) {
    if (!/^card\d+$/.test(entry)) continue;
    const dev = path.join(drm, entry, "device");
    let driver = "";
    let vendor = "";
    try { driver = path.basename(fsImpl.readlinkSync(path.join(dev, "driver"))); }
    catch (err) { driver = ""; }
    try { vendor = String(fsImpl.readFileSync(path.join(dev, "vendor"), "utf8")).trim(); }
    catch (err) { vendor = ""; }
    const name = (driver + " " + vendor).trim();
    if (name) names.push(name);
  }
  return names;
}

function probeGpuNames(opts) {
  opts = opts || {};
  const platform = opts.platform || process.platform;
  const run = opts.spawnSync || spawnSync;
  const fsImpl = opts.fs || fs;
  if (platform === "win32") {
    let result;
    try {
      result = run("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
      ], { encoding: "utf8", timeout: 8000, windowsHide: true });
    } catch (err) {
      return [];
    }
    if (!result || result.error || result.status) return [];
    return splitNames(result.stdout);
  }
  if (platform === "linux") return linuxGpuNames(fsImpl);
  if (platform === "darwin") return ["gpu"];
  return [];
}

function resolveFfmpeg(opts) {
  opts = opts || {};
  const env = opts.env || {};
  const exists = opts.exists || existsSync;
  if (env.BACHI_FFMPEG) {
    if (exists(env.BACHI_FFMPEG)) return { ok: true, command: env.BACHI_FFMPEG, bundled: true };
    return { ok: false, error: "找不到包里的 ffmpeg：" + env.BACHI_FFMPEG };
  }
  if (env.FFMPEG_PATH) {
    if (exists(env.FFMPEG_PATH)) return { ok: true, command: env.FFMPEG_PATH, bundled: true };
    return { ok: false, error: "找不到 FFMPEG_PATH：" + env.FFMPEG_PATH };
  }
  return { ok: true, command: "ffmpeg", bundled: false };
}

function launchModeLabel(disableGpu, hardware, attemptIndex) {
  if (!disableGpu) return "渲染使用 GPU";
  if (attemptIndex > 0) return "GPU 启动失败，渲染退回 CPU";
  if (hardware === false) return "未检测到显卡，渲染使用 CPU";
  return "渲染使用 CPU";
}

module.exports = {
  BASE_ARGS: BASE_ARGS,
  splitNames: splitNames,
  isSoftwareGpuName: isSoftwareGpuName,
  hasHardwareGpu: hasHardwareGpu,
  gpuAttemptOrder: gpuAttemptOrder,
  electronGpuSwitches: electronGpuSwitches,
  buildLaunchOptions: buildLaunchOptions,
  chromeCandidates: chromeCandidates,
  findChrome: findChrome,
  linuxGpuNames: linuxGpuNames,
  probeGpuNames: probeGpuNames,
  resolveFfmpeg: resolveFfmpeg,
  launchModeLabel: launchModeLabel,
};
