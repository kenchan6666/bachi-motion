"use strict";

/**
 * Frame-accurate export inside the desktop window's own Chromium.
 * The page, renderAt, and audio alignment are the same ones node render.js uses.
 * This file does not open a browser and does not change sticking or animation.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const accel = require("../js/render-accel");
const jobs = require("../js/render-jobs");
const audio = require("../js/audio-mux");

function parseSize(size) {
  const key = String(size || "1080p").toLowerCase();
  if (key === "1080p") return { width: 1920, height: 1080, label: "1080p" };
  if (key === "720p") return { width: 1280, height: 720, label: "720p" };
  const match = String(size).match(/^(\d+)\s*x\s*(\d+)$/i);
  if (match) return { width: +match[1], height: +match[2], label: match[1] + "x" + match[2] };
  throw new Error("分辨率应为 1080p、720p 或 WxH");
}

function appRootFromHere() {
  return path.join(__dirname, "..");
}

async function loadExportPage(win, rate) {
  const target = "bachi://app/index.html?export=1&rate=" + encodeURIComponent(String(rate));
  await win.loadURL(target);
  await win.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const start = Date.now();
      (function tick() {
        if (typeof window.renderAt === "function" && typeof window.startEngine === "function") resolve(true);
        else if (Date.now() - start > 15000) reject(new Error("页面没有准备好"));
        else setTimeout(tick, 30);
      })();
    })
  `);
}

async function setupExportPage(win, data, rate) {
  const payload = JSON.stringify(data).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const source = JSON.stringify(data.source || "cli");
  const rateJson = JSON.stringify(rate);
  await win.webContents.executeJavaScript(`
    document.body.classList.add("export");
    if (typeof window.setRate === "function") window.setRate(${rateJson});
    window.startEngine(${payload}, { mode: ${source} });
    if (typeof window.setPlaying === "function") window.setPlaying(false);
  `);
  await win.webContents.executeJavaScript(`
    (async () => {
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
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()
  `);
}

async function paintFrame(win, t) {
  const time = JSON.stringify(t);
  await win.webContents.executeJavaScript(`
    (async () => {
      window.renderAt(${time});
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()
  `);
  const image = await win.webContents.capturePage();
  if (!image || image.isEmpty()) throw new Error("截不到画面，出片停住了。");
  return image.toJPEG(90);
}

function createWindow(BrowserWindow, size) {
  return new BrowserWindow({
    show: false,
    frame: false,
    skipTaskbar: true,
    width: size.width,
    height: size.height,
    useContentSize: true,
    backgroundColor: "#ecebe6",
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
        sandbox: false,
    },
  });
}

async function openReadyPage(BrowserWindow, size, data, rate) {
  const win = createWindow(BrowserWindow, size);
  try {
    await loadExportPage(win, rate);
    await setupExportPage(win, data, rate);
    const timing = await win.webContents.executeJavaScript(`({
      start: window.chartStart,
      end: window.chartDuration,
    })`);
    return { win: win, timing: timing };
  } catch (err) {
    if (!win.isDestroyed()) win.destroy();
    throw err;
  }
}

async function prepareExportAudio(args, data, chartStart, chartEnd, work, root) {
  let hits = null;
  if (args.audio) {
    const donPath = path.join(root, "assets/sounds/don.wav");
    const kaPath = path.join(root, "assets/sounds/ka.wav");
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

function pipeArgs(encoder, fps, output, wavPath, width, height, threads) {
  const vf = "scale=" + width + ":" + height + ":flags=lanczos:in_range=pc:out_range=tv,format=" +
    (encoder.name === "h264_qsv" ? "nv12" : "yuv420p");
  const args = ["-y"].concat(encoder.beforeInput || []).concat([
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-framerate", String(fps),
    "-i", "pipe:0",
  ]);
  if (wavPath) args.push("-i", wavPath);
  args.push("-vf", vf);
  args.push.apply(args, encoder.args);
  if (encoder.name === "libx264" && threads) args.push("-threads", String(threads));
  args.push("-video_track_timescale", String(Math.round(fps * 256)));
  if (wavPath) args.push("-c:a", "aac", "-shortest");
  args.push("-movflags", "+faststart", output);
  return args;
}

async function writeSegment(win, seg, encoder, plan, fps, rate, output, wavPath, size, threads, onFrame) {
  const pipe = accel.spawnFfmpegPipe(pipeArgs(encoder, fps, output, wavPath, size.width, size.height, threads));
  pipe.done.catch(() => {});
  try {
    for (let frame = seg.startFrame; frame < seg.endFrame; frame++) {
      const t = accel.frameTime(plan, frame, fps, rate);
      const jpeg = await paintFrame(win, t);
      await pipe.write(jpeg);
      if (onFrame) onFrame(frame);
    }
    pipe.end();
    await pipe.done;
  } catch (err) {
    pipe.kill();
    throw err;
  }
}

async function renderJob(BrowserWindow, job, hooks) {
  hooks = hooks || {};
  const root = appRootFromHere();
  const size = parseSize(job.size || "1080p");
  const fps = job.fps;
  const rate = job.rate;
  if (!isFinite(rate) || rate <= 0) throw new Error("倍率必须是正数");
  if (!isFinite(fps) || fps <= 0) throw new Error("帧率必须是正数");
  const data = jobs.buildPayload(job);
  const outPath = job.out;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-frames-"));
  const windows = [];
  try {
    let encoder = await accel.resolveVideoEncoder();
    const first = await openReadyPage(BrowserWindow, size, data, rate);
    windows.push(first.win);
    const chartStart = first.timing.start;
    const chartEnd = first.timing.end;
    const plan = accel.framePlan(chartStart, chartEnd, fps, rate);
    const frameCount = plan.frameCount;
    if (!frameCount) throw new Error("这段谱面没有可以出的画面。");
    // One offscreen window keeps the encode path on a single ffmpeg process.
    // A hardware-encoder failure can then retry the whole clip with libx264
    // without mixing codecs in a concat.
    let workerCount = 1;
    while (windows.length < workerCount) {
      const opened = await openReadyPage(BrowserWindow, size, data, rate);
      windows.push(opened.win);
    }
    if (windows.length > workerCount) {
      const extra = windows.splice(workerCount);
      for (const win of extra) { if (!win.isDestroyed()) win.destroy(); }
    }
    workerCount = windows.length;
    const segments = [];
    const base = Math.floor(frameCount / workerCount);
    const rem = frameCount % workerCount;
    let cursor = 0;
    for (let w = 0; w < workerCount; w++) {
      const count = base + (w < rem ? 1 : 0);
      if (count <= 0) continue;
      segments.push({
        index: w,
        startFrame: cursor,
        endFrame: cursor + count,
        segPath: path.join(work, "seg_" + String(w).padStart(3, "0") + ".mp4"),
      });
      cursor += count;
    }
    const wavPath = await prepareExportAudio(job, data, chartStart, chartEnd, work, root);
    const direct = segments.length === 1;
    const ffThreads = Math.max(1, Math.floor(os.cpus().length / Math.max(1, segments.length)));
    let completed = 0;
    const note = () => {
      if (hooks.onItemProgress) {
        hooks.onItemProgress(frameCount ? completed / frameCount : 0, {
          frame: completed,
          frameCount: frameCount,
        });
      }
    };
    note();

    async function runSegment(seg, enc) {
      const output = direct ? outPath : seg.segPath;
      const audioPath = direct ? wavPath : null;
      let local = 0;
      try {
        await writeSegment(windows[seg.index], seg, enc, plan, fps, rate, output, audioPath, size, ffThreads, () => {
          local += 1;
          completed += 1;
          note();
        });
      } catch (err) {
        completed -= local;
        note();
        throw err;
      }
    }

    await Promise.all(segments.map(async (seg) => {
      try {
        await runSegment(seg, encoder);
      } catch (err) {
        if (encoder.name === "libx264") throw err;
        console.warn("[bachi-motion] 硬件编码失败，改用 libx264（CPU）。");
        encoder = accel.useEncoder(accel.encoderByName("libx264"));
        await runSegment(seg, encoder);
      }
    }));

    if (!direct) {
      const concatListPath = path.join(work, "concat.txt");
      const concatBody = segments
        .map((seg) => "file '" + seg.segPath.replace(/'/g, "'\\''") + "'")
        .join("\n") + "\n";
      fs.writeFileSync(concatListPath, concatBody, "utf8");
      const ff = ["-y", "-f", "concat", "-safe", "0", "-i", concatListPath];
      if (wavPath) ff.push("-i", wavPath, "-c:a", "aac", "-shortest");
      ff.push("-c:v", "copy", "-movflags", "+faststart", outPath);
      await accel.runFfmpeg(ff);
    }
    return outPath;
  } finally {
    for (const win of windows) {
      try { if (win && !win.isDestroyed()) win.destroy(); } catch { /* ignore */ }
    }
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

module.exports = {
  parseSize: parseSize,
  renderJob: renderJob,
};
