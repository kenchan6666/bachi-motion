#!/usr/bin/env node
/**
 * bachi-motion headless 「手元」renderer.
 *
 *   node render.js --tja 谱.tja --course Oni --measures 119-120 --rate 0.5 --out 手元.mp4
 *
 * Time convention (--rate):
 *   renderAt(t) always takes real chart time (seconds, same units as event.t).
 *   A rate of 0.5 makes the video twice as long:
 *     videoDuration = (chartDuration - chartStart) / rate
 *     frame f (0..F-1) is shown at wall time f/fps
 *     and is rendered with  t = chartStart + (f / fps) * rate
 *   F = ceil(videoDuration * fps). The last frame is clamped to chartDuration.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const jobs = require("./js/render-jobs.js");
const audio = require("./js/audio-mux.js");
const batch = require("./js/batch-queue.js");
const accel = require("./js/render-accel.js");
const { startRenderServer } = require("./js/render-server.js");

const ROOT = __dirname;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".tja": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".md": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function parseSize(s) {
  const key = String(s).toLowerCase();
  if (key === "1080p") return { width: 1920, height: 1080, label: "1080p" };
  if (key === "720p") return { width: 1280, height: 720, label: "720p" };
  const m = String(s).match(/^(\d+)\s*x\s*(\d+)$/i);
  if (m) return { width: +m[1], height: +m[2], label: m[1] + "x" + m[2] };
  throw new Error("--size 应为 1080p、720p 或 WxH，例如 1920x1080");
}

function findChrome() {
  return accel.findChrome();
}

function startStaticServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/") rel = "/index.html";
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) {
        res.writeHead(403); res.end("forbidden"); return;
      }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
    server.on("error", reject);
  });
}

function runFfmpeg(argv) {
  return new Promise((resolve, reject) => {
    const proc = spawn(accel.ffmpegBin(), argv, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let err = "";
    proc.stderr.on("data", (d) => { err += d; });
    proc.on("error", (error) => {
      if (error && error.code === "ENOENT") reject(new Error(accel.missingFfmpegMessage()));
      else reject(error);
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("ffmpeg 失败 (exit " + code + ")\n" + err.slice(-2000)));
    });
  });
}

function spawnFfmpegPipe(argv) {
  const proc = spawn(accel.ffmpegBin(), argv, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let err = "";
  let exited = false;
  let exitCode = null;
  proc.stderr.on("data", (d) => { err += d; });
  const done = new Promise((resolve, reject) => {
    proc.on("error", (e) => {
      exited = true;
      if (e && e.code === "ENOENT") reject(new Error(accel.missingFfmpegMessage()));
      else reject(e);
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
      const onErr = (e) => { cleanup(); reject(e); };
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
    if (proc.stdin && !proc.stdin.destroyed && !proc.stdin.writableEnded) {
      proc.stdin.end();
    }
  }
  function kill() {
    if (!exited) {
      try { proc.kill("SIGKILL"); } catch { /* ignore */ }
    }
  }
  return { proc, done, write, end, kill };
}

let activeEncoder = null;
async function currentEncoder() {
  if (!activeEncoder) {
    activeEncoder = await accel.resolveVideoEncoder();
    console.log("[bachi-motion] 编码：" + activeEncoder.label);
  }
  return activeEncoder;
}

function useCpuEncoder() {
  activeEncoder = accel.useEncoder(accel.encoderByName("libx264"));
  console.warn("[bachi-motion] 硬件编码失败，改用 libx264（CPU）。");
  return activeEncoder;
}

async function prepareExportAudio(args, data, chartStart, chartEnd, work) {
  let hits = null;
  if (args.audio) {
    const donPath = path.join(ROOT, "assets/sounds/don.wav");
    const kaPath = path.join(ROOT, "assets/sounds/ka.wav");
    if (!fs.existsSync(donPath) || !fs.existsSync(kaPath)) {
      throw new Error("缺少 assets/sounds/don.wav 或 ka.wav");
    }
    hits = {
      events: data.events || [],
      don: audio.readWavPcm(donPath),
      ka: audio.readWavPcm(kaPath),
    };
  }
  return audio.prepareExportWav({
    song: args.song || null,
    audio: !!args.audio,
    rate: args.rate,
    timeShift: data.timeShift || 0,
    hits: hits,
  }, chartStart, chartEnd, work);
}

async function setupExportPage(page, url, size, data, rate, preloadAssets) {
  await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForFunction(() => typeof window.renderAt === "function" && typeof window.startEngine === "function", { timeout: 15000 });

  await page.evaluate((payload, r) => {
    document.body.classList.add("export");
    if (typeof window.setRate === "function") window.setRate(r);
    window.startEngine(payload, { mode: payload.source || "cli" });
    if (typeof window.setPlaying === "function") window.setPlaying(false);
  }, data, rate);

  // Wait for the title-bar slices that cover the current song name +
  // second line. fonts.ready alone does not guarantee those files are in.
  await page.evaluate(async () => {
    if (typeof window.prepareTitleBarFonts === "function") {
      await window.prepareTitleBarFonts();
    } else {
      const title = (document.getElementById("titlebarTitle") || {}).textContent || "";
      const meta = (document.getElementById("titlebarMeta") || {}).textContent || "";
      const text = title + meta;
      const specs = (window.TitleFit && window.TitleFit.titleFontLoadSpecs)
        ? window.TitleFit.titleFontLoadSpecs()
        : ['bold 1em "Bachi Serif CJK"', 'bold 1em "Noto Serif SC"', 'bold 1em "Noto Serif TC"'];
      if (document.fonts && document.fonts.load) {
        await Promise.all(specs.map((spec) => document.fonts.load(spec, text).catch(() => [])));
      }
    }
    if (typeof window.layoutTitleBar === "function") window.layoutTitleBar();
  });

  if (preloadAssets) {
    await page.evaluate(async () => {
      const hrefs = new Set();
      if (typeof CONFIG !== "undefined" && CONFIG.HAND_IMG) {
        for (const side of Object.values(CONFIG.HAND_IMG)) {
          for (const grip of Object.values(side)) {
            if (grip && grip.href) hrefs.add(grip.href);
          }
        }
      }
      await Promise.all([...hrefs].map((src) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          if (typeof img.decode === "function") img.decode().then(resolve, resolve);
          else resolve();
        };
        img.onerror = resolve;
        img.src = src;
      })));
    });
  }
}

function logJobHeader(args, data, chartStart, chartEnd, chartLen, videoDur, frameCount, size, workerCount) {
  console.log("[bachi-motion] " + (data.song || path.basename(args.tja)) +
    (data.course ? "  " + data.course : "") +
    (data.measureFrom ? "  小节 " + data.measureFrom + "-" + data.measureTo : "") +
    "  events " + (data.events || []).length);
  console.log("[bachi-motion] chart " + chartStart.toFixed(3) + "s .. " + chartEnd.toFixed(3) +
    "s  (len " + chartLen.toFixed(3) + "s)  rate " + args.rate +
    "  → video " + videoDur.toFixed(3) + "s  " + args.fps + "fps  " +
    frameCount + " frames  " + size.label +
    (workerCount > 1 ? "  workers " + workerCount + " (jpeg pipe)" : "  workers 1 (png)"));
}

function noteFrame(hooks, frame, frameCount) {
  if (!hooks || typeof hooks.onFrame !== "function") return;
  if (frame === 1 || frame === frameCount || frame % 5 === 0) hooks.onFrame(frame, frameCount);
}

async function renderSingleWorker(browser, url, size, data, args, work, outPath, hooks) {
  const page = await browser.newPage();
  await setupExportPage(page, url, size, data, args.rate, false);

  const timing = await page.evaluate(() => ({
    start: window.chartStart,
    end: window.chartDuration,
    ready: window.__BACHI_READY__,
  }));
  const chartStart = timing.start;
  const chartEnd = timing.end;
  const chartLen = chartEnd - chartStart;
  const videoDur = chartLen / args.rate;
  const frameCount = Math.ceil(videoDur * args.fps);

  logJobHeader(args, data, chartStart, chartEnd, chartLen, videoDur, frameCount, size, 1);

  const pad = Math.max(5, String(frameCount).length);
  for (let f = 0; f < frameCount; f++) {
    const t = Math.min(chartEnd, chartStart + (f / args.fps) * args.rate);
    await page.evaluate((t) => window.renderAt(t), t);
    const framePath = path.join(work, "frame_" + String(f).padStart(pad, "0") + ".png");
    await page.screenshot({ path: framePath, type: "png", captureBeyondViewport: false });
    noteFrame(hooks, f + 1, frameCount);
    if (f === 0 || f + 1 === frameCount || (f + 1) % Math.max(1, Math.round(args.fps)) === 0) {
      console.log("[bachi-motion] frame " + (f + 1) + "/" + frameCount + "  t=" + t.toFixed(3) + "s");
    }
  }

  await browser.close();

  const pattern = path.join(work, "frame_%0" + pad + "d.png");
  const ff = [
    "-y",
    "-framerate", String(args.fps),
    "-i", pattern,
  ];
  const wavPath = await prepareExportAudio(args, data, chartStart, chartEnd, work);
  if (wavPath) {
    ff.push("-i", wavPath, "-c:a", "aac", "-shortest");
  }
  const encoder = await currentEncoder();
  function withCodec(enc) {
    const args = ff.slice();
    // PNG input is the first -i. Hardware init flags belong before that input.
    if (enc.beforeInput && enc.beforeInput.length) args.splice(1, 0, ...enc.beforeInput);
    args.push.apply(args, enc.args);
    args.push("-movflags", "+faststart", outPath);
    return args;
  }
  console.log("[bachi-motion] ffmpeg …");
  try {
    await runFfmpeg(withCodec(encoder));
  } catch (err) {
    if (encoder.name === "libx264") throw err;
    await runFfmpeg(withCodec(useCpuEncoder()));
  }
}

async function renderParallelWorkers(openBrowser, url, size, data, args, work, outPath, hooks) {
  const browsers = [];
  let timing;
  let segments;
  let workerCount;
  const activePipes = [];
  try {
    const pages = await Promise.all(Array.from({ length: args.workers }, async () => {
      const b = await openBrowser();
      browsers.push(b);
      const p = await b.newPage();
      await setupExportPage(p, url, size, data, args.rate, true);
      return p;
    }));

    timing = await pages[0].evaluate(() => ({
      start: window.chartStart,
      end: window.chartDuration,
      ready: window.__BACHI_READY__,
    }));

    const chartStart = timing.start;
    const chartEnd = timing.end;
    const chartLen = chartEnd - chartStart;
    const videoDur = chartLen / args.rate;
    const frameCount = Math.ceil(videoDur * args.fps);
    workerCount = Math.min(args.workers, Math.max(1, frameCount));

    if (browsers.length > workerCount) {
      const extra = browsers.splice(workerCount);
      pages.splice(workerCount);
      await Promise.all(extra.map((b) => b.close().catch(() => {})));
    }

    logJobHeader(args, data, chartStart, chartEnd, chartLen, videoDur, frameCount, size, workerCount);

    segments = [];
    const base = Math.floor(frameCount / workerCount);
    const rem = frameCount % workerCount;
    let cursor = 0;
    for (let w = 0; w < workerCount; w++) {
      const count = base + (w < rem ? 1 : 0);
      if (count > 0) {
        segments.push({
          index: w,
          startFrame: cursor,
          endFrame: cursor + count,
          segPath: path.join(work, "seg_" + String(w).padStart(3, "0") + ".mp4"),
        });
        cursor += count;
      }
    }

    const ffThreads = Math.max(1, Math.floor(os.cpus().length / segments.length));
    let completed = 0;
    const logEvery = Math.max(1, Math.round(args.fps));
    let encoder = await currentEncoder();

    async function pipeSegment(seg, idx, enc) {
      const page = pages[idx];
      const argsForPipe = ["-y"].concat(enc.beforeInput || []).concat([
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "-framerate", String(args.fps),
        "-i", "pipe:0",
        "-vf", enc.vf,
      ]);
      argsForPipe.push.apply(argsForPipe, enc.args);
      if (enc.name === "libx264") argsForPipe.push("-threads", String(ffThreads));
      argsForPipe.push("-video_track_timescale", String(Math.round(args.fps * 256)), seg.segPath);
      const pipe = spawnFfmpegPipe(argsForPipe);
      activePipes.push(pipe);
      pipe.done.catch(() => {});
      let local = 0;
      try {
        for (let f = seg.startFrame; f < seg.endFrame; f++) {
          const t = Math.min(chartEnd, chartStart + (f / args.fps) * args.rate);
          await page.evaluate((t) => window.renderAt(t), t);
          const buf = await page.screenshot({
            type: "jpeg",
            quality: 90,
            optimizeForSpeed: true,
            captureBeyondViewport: false,
          });
          await pipe.write(Buffer.from(buf));
          local++;
          completed++;
          noteFrame(hooks, completed, frameCount);
          if (completed === 1 || completed === frameCount || completed % logEvery === 0) {
            console.log("[bachi-motion] progress " + completed + "/" + frameCount +
              "  (worker " + idx + " frame " + (f + 1) + " t=" + t.toFixed(3) + "s)");
          }
        }
        pipe.end();
        await pipe.done;
      } catch (err) {
        pipe.kill();
        completed -= local;
        throw err;
      }
    }

    await Promise.all(segments.map(async (seg, idx) => {
      try {
        await pipeSegment(seg, idx, encoder);
      } catch (err) {
        if (encoder.name === "libx264") throw err;
        encoder = useCpuEncoder();
        await pipeSegment(seg, idx, encoder);
      }
    }));
  } catch (err) {
    for (const pipe of activePipes) pipe.kill();
    throw err;
  } finally {
    await Promise.all(browsers.map((b) => b.close().catch(() => {})));
  }

  const concatListPath = path.join(work, "concat.txt");
  const concatBody = segments
    .map((s) => "file '" + s.segPath.replace(/'/g, "'\\''") + "'")
    .join("\n") + "\n";
  fs.writeFileSync(concatListPath, concatBody, "utf8");

  const ff = [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatListPath,
  ];
  const wavPath = await prepareExportAudio(args, data, timing.start, timing.end, work);
  if (wavPath) {
    ff.push("-i", wavPath, "-c:a", "aac", "-shortest");
  }
  ff.push(
    "-c:v", "copy",
    "-movflags", "+faststart",
    outPath,
  );
  console.log("[bachi-motion] ffmpeg concat" + (wavPath ? " + audio" : "") + " …");
  await runFfmpeg(ff);
}

function singleJobFromArgs(args) {
  return {
    tja: path.resolve(args.tja),
    song: args.song ? path.resolve(args.song) : null,
    out: path.resolve(args.out),
    course: args.course,
    measures: args.measures,
    rate: args.rate,
    sticking: args.sticking ? path.resolve(args.sticking) : null,
    technique: args.technique,
    hand: args.hand,
    roll: args.roll,
    bignote: args.bignote,
    fps: args.fps,
    size: args.size,
    workers: args.workers,
    audio: args.audio,
    sectionStart: args.sectionStart,
    sectionEnd: args.sectionEnd,
    label: path.basename(args.tja),
  };
}

async function renderOne(args, ctx) {
  ctx = ctx || {};
  if (!args.tja) throw new Error("请用 --tja 指定谱面文件。");
  if (!args.out) throw new Error("请用 --out 指定输出 mp4 路径。");
  if (!isFinite(args.rate) || args.rate <= 0) throw new Error("--rate 必须是正数");
  if (!isFinite(args.fps) || args.fps <= 0) throw new Error("--fps 必须是正数");
  if (!Number.isInteger(args.workers) || args.workers < 1) throw new Error("--workers 必须是正整数");
  const size = parseSize(args.size);
  if (!fs.existsSync(path.resolve(args.tja))) throw new Error("找不到谱面文件：" + args.tja);
  if (args.song && !fs.existsSync(path.resolve(args.song))) throw new Error("找不到原曲：" + args.song);
  if (args.sticking && !fs.existsSync(path.resolve(args.sticking))) {
    throw new Error("找不到手顺 JSON：" + args.sticking);
  }
  accel.prepareFfmpeg();

  let puppeteer;
  try {
    puppeteer = require("puppeteer-core");
  } catch {
    try { puppeteer = require("puppeteer"); }
    catch {
      throw new Error("找不到 puppeteer-core。请在项目根目录运行 npm install");
    }
  }
  const chrome = findChrome();
  if (!chrome) throw new Error(accel.missingChromeMessage());

  const data = jobs.buildPayload(args);
  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const { server, port } = await startStaticServer(ROOT);
  // Pass --rate so the page's rate-dependent roll blur (扇形模糊 at rate==1) stays off during slow-mo.
  const url = "http://127.0.0.1:" + port + "/index.html?export=1&rate=" + encodeURIComponent(String(args.rate));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-frames-"));
  const hooks = {
    onFrame(frame, frameCount) {
      if (typeof ctx.onItemProgress === "function") {
        ctx.onItemProgress(frameCount ? frame / frameCount : 0, { frame: frame, frameCount: frameCount });
      }
    },
  };
  let singleBrowser = null;
  try {
    const plan = accel.createLaunchPlan(chrome);
    const launchHooks = {
      log: (msg) => console.log("[bachi-motion] " + msg),
      warn: (msg) => console.warn("[bachi-motion] " + msg),
    };
    const openBrowser = () => accel.launchBrowser(puppeteer, plan, launchHooks);

    if (args.workers === 1) {
      singleBrowser = await openBrowser();
      await renderSingleWorker(singleBrowser, url, size, data, args, work, outPath, hooks);
      singleBrowser = null;
    } else {
      await renderParallelWorkers(openBrowser, url, size, data, args, work, outPath, hooks);
    }

    const stat = fs.statSync(outPath);
    console.log("[bachi-motion] wrote " + outPath + "  (" + Math.round(stat.size / 1024) + " KB)");
    return outPath;
  } finally {
    if (singleBrowser) {
      try { await singleBrowser.close(); } catch { /* ignore */ }
    }
    server.close();
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

async function main() {
  let args;
  try { args = jobs.parseArgs(process.argv.slice(2)); }
  catch (err) { die(err.message); }
  if (args.help) { process.stdout.write(jobs.HELP); return; }

  if (args.serve) {
    if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535) die("--port 无效");
    const server = await startRenderServer({
      port: args.port,
      root: ROOT,
      renderJob: (job, ctx) => renderOne(job, ctx),
    });
    console.log("[bachi-motion] 本机批量出片 http://127.0.0.1:" + server.port + "/");
    console.log("[bachi-motion] 渲染在这台电脑上。GitHub Pages 不能出片。按 Ctrl+C 停止。");
    return;
  }

  if (args.batch) {
    let list;
    try { list = jobs.loadBatchFile(args.batch); }
    catch (err) { die(err.message); }
    let lastLog = 0;
    const result = await batch.runBatch(list, {
      renderJob: (job, ctx) => renderOne(job, ctx),
      onProgress(snap) {
        const now = Date.now();
        const edge = snap.done || snap.itemFraction === 0 || snap.itemFraction === 1;
        if (!edge && now - lastLog < 250) return;
        lastLog = now;
        const text = batch.formatProgress(snap);
        console.log("[bachi-motion] " + batch.bar(snap.overallFraction) + " " + text.overall + "  " + text.item);
      },
    });
    if (result.failed) {
      die("批量出片有 " + result.failed + " 条失败");
    }
    return;
  }

  if (!args.tja) die("请用 --tja 指定谱面文件。\n" + jobs.HELP);
  if (!args.out) die("请用 --out 指定输出 mp4 路径。\n" + jobs.HELP);
  await renderOne(singleJobFromArgs(args));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
