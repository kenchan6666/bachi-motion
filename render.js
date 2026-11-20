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
const { spawn, spawnSync } = require("node:child_process");

const TaikoParser = require("./js/parser.js");

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
};

function defaultWorkers() {
  return Math.max(1, Math.min(6, os.cpus().length - 2));
}

const HELP = `bachi-motion — render a 手元 (first-person hand-cam) mp4

Usage:
  node render.js --tja 谱.tja --course Oni --measures 119-120 --rate 0.5 --out 手元.mp4
  npm run render -- --tja 谱.tja --out 手元.mp4

Flags:
  --tja <path>         Input TJA chart (read from local disk only; do not commit user charts)
  --course <name>      COURSE/difficulty to render if the TJA has several (default: first / only)
  --measures <A-B>     Inclusive 1-based measure range (default: whole chart)
  --rate <n>           Slow-motion factor applied to the video timeline (default 1).
                       0.5 → video is 2× longer. renderAt still receives real chart time.
  --sticking <path>    Optional 手顺 JSON (溯月 mode). If omitted, auto 1-1 手顺 is used.
  --bignote <mode>     Big-note handling: single (default) / both / small
  --fps <n>            Frames per second (default 60)
  --size <1080p|720p|WxH>  Output resolution (default 1080p)
  --workers <n>        Parallel render workers (default: min(6, cpus-2) = ${defaultWorkers()};
                       1 = legacy single-page PNG-to-disk path)
  --audio              Mix bundled don/ka hits (assets/sounds/*.wav, synthesized, not official)
  --out <path>         Output mp4 path (required)

Requires: Node, ffmpeg on PATH, and a Chrome/Chromium that puppeteer-core can launch
(set CHROME_PATH or PUPPETEER_EXECUTABLE_PATH if it is not found automatically).
`;

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    tja: null,
    course: null,
    measures: null,
    rate: 1,
    sticking: null,
    bignote: "single",
    fps: 60,
    size: "1080p",
    workers: defaultWorkers(),
    audio: false,
    out: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => {
      const v = argv[++i];
      if (v == null || v.startsWith("--")) throw new Error("缺少参数值：" + a);
      return v;
    };
    switch (a) {
      case "--tja": args.tja = need(); break;
      case "--course": args.course = need(); break;
      case "--measures": args.measures = need(); break;
      case "--rate": args.rate = Number(need()); break;
      case "--sticking": args.sticking = need(); break;
      case "--bignote": args.bignote = need(); break;
      case "--fps": args.fps = Number(need()); break;
      case "--size": args.size = need(); break;
      case "--workers": args.workers = Number(need()); break;
      case "--audio": args.audio = true; break;
      case "--out": args.out = need(); break;
      case "--help":
      case "-h": args.help = true; break;
      default: throw new Error("未知参数：" + a + "\n" + HELP);
    }
  }
  return args;
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
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
  ].filter(Boolean);
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  return null;
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

function readWavPcm(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("不是 WAV：" + file);
  }
  let off = 12, sr = 44100, bits = 16, ch = 1, data, dataLen;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      ch = buf.readUInt16LE(off + 10);
      sr = buf.readUInt32LE(off + 12);
      bits = buf.readUInt16LE(off + 22);
    } else if (id === "data") {
      data = off + 8;
      dataLen = size;
      break;
    }
    off += 8 + size;
  }
  if (data == null || bits !== 16) throw new Error("需要 16-bit PCM WAV：" + file);
  const samples = new Int16Array(dataLen / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(data + i * 2);
  return { sampleRate: sr, channels: ch, samples };
}

function writeWavPcm(file, sampleRate, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  fs.writeFileSync(file, buf);
}

function mixHitAudio(events, { start, end, rate, don, ka, bigBoost = 1.25 }) {
  const sr = don.sampleRate;
  if (ka.sampleRate !== sr) throw new Error("don.wav 和 ka.wav 的采样率不一致");
  const videoDur = (end - start) / rate;
  const total = Math.max(1, Math.ceil(videoDur * sr) + Math.max(don.samples.length, ka.samples.length));
  const mix = new Float64Array(total);
  const seen = new Set();
  for (const e of events) {
    const key = e.t.toFixed(6) + ":" + e.face;
    if (seen.has(key)) continue;
    seen.add(key);
    const videoT = (e.t - start) / rate;
    if (videoT < -0.05 || videoT > videoDur + 0.05) continue;
    const clip = e.face === "ka" ? ka.samples : don.samples;
    const gain = e.big ? bigBoost : 1;
    const at = Math.round(videoT * sr);
    for (let i = 0; i < clip.length; i++) {
      const j = at + i;
      if (j >= 0 && j < mix.length) mix[j] += (clip[i] / 32768) * gain;
    }
  }
  let peak = 1;
  for (const x of mix) peak = Math.max(peak, Math.abs(x));
  const out = new Int16Array(Math.ceil(videoDur * sr));
  const norm = peak > 1 ? 0.95 / peak : 0.95;
  for (let i = 0; i < out.length; i++) {
    const x = (mix[i] || 0) * norm;
    out[i] = Math.max(-32767, Math.min(32767, Math.round(x * 32767)));
  }
  return { sampleRate: sr, samples: out };
}

function buildPayload(args) {
  const tjaText = fs.readFileSync(path.resolve(args.tja), "utf8");
  const opts = { course: args.course, measures: args.measures, bigNote: args.bignote };
  if (args.sticking) {
    const base = TaikoParser.eventsFromTja(tjaText, opts);
    const jsonText = fs.readFileSync(path.resolve(args.sticking), "utf8");
    const hands = TaikoParser.loadHandJson(jsonText, {
      measures: args.measures,
      rangeStart: base.rangeStart,
      rangeEnd: base.rangeEnd,
      timeShift: base.timeShift || 0,
      chartMeasures: base.chartMeasures,
      bigNote: args.bignote,
    });
    return Object.assign({}, base, hands, {
      rangeStart: base.rangeStart,
      rangeEnd: base.rangeEnd,
      timeShift: base.timeShift || 0,
      source: "hand-json",
    });
  }
  return TaikoParser.eventsFromTja(tjaText, opts);
}

function runFfmpeg(argv) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", argv, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => { err += d; });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("ffmpeg 失败 (exit " + code + ")\n" + err.slice(-2000)));
    });
  });
}

function spawnFfmpegPipe(argv) {
  const proc = spawn("ffmpeg", argv, { stdio: ["pipe", "pipe", "pipe"] });
  let err = "";
  let exited = false;
  let exitCode = null;
  proc.stderr.on("data", (d) => { err += d; });
  const done = new Promise((resolve, reject) => {
    proc.on("error", (e) => { exited = true; reject(e); });
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

function buildAudioWavIfNeeded(args, data, chartStart, chartEnd, work) {
  if (!args.audio) return null;
  const donPath = path.join(ROOT, "assets/sounds/don.wav");
  const kaPath = path.join(ROOT, "assets/sounds/ka.wav");
  if (!fs.existsSync(donPath) || !fs.existsSync(kaPath)) {
    throw new Error("缺少 assets/sounds/don.wav 或 ka.wav");
  }
  const mixed = mixHitAudio(data.events || [], {
    start: chartStart,
    end: chartEnd,
    rate: args.rate,
    don: readWavPcm(donPath),
    ka: readWavPcm(kaPath),
  });
  const wavPath = path.join(work, "hits.wav");
  writeWavPcm(wavPath, mixed.sampleRate, mixed.samples);
  return wavPath;
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

  if (preloadAssets) {
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
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

async function renderSingleWorker(browser, url, size, data, args, work, outPath) {
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
  const wavPath = buildAudioWavIfNeeded(args, data, chartStart, chartEnd, work);
  if (wavPath) {
    ff.push("-i", wavPath, "-c:a", "aac", "-shortest");
  }
  ff.push(
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outPath,
  );
  console.log("[bachi-motion] ffmpeg …");
  await runFfmpeg(ff);
}

async function renderParallelWorkers(launchOpts, puppeteer, url, size, data, args, work, outPath) {
  const browsers = [];
  let timing;
  let segments;
  let workerCount;
  const activePipes = [];
  try {
    const pages = await Promise.all(Array.from({ length: args.workers }, async () => {
      let b;
      try {
        b = await puppeteer.launch(launchOpts);
      } catch (err) {
        throw new Error(
          "无法启动 headless Chrome（" + (err.message || err) + "）。\n" +
          "请在有图形/浏览器环境的机器上安装 Chrome 或 Chromium，并设置 CHROME_PATH。",
        );
      }
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

    await Promise.all(segments.map(async (seg, idx) => {
      const page = pages[idx];
      const pipe = spawnFfmpegPipe([
        "-y",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "-framerate", String(args.fps),
        "-i", "pipe:0",
        "-vf", "scale=in_range=pc:out_range=tv,format=yuv420p",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-threads", String(ffThreads),
        "-video_track_timescale", String(Math.round(args.fps * 256)),
        seg.segPath,
      ]);
      activePipes.push(pipe);
      // Attach early rejection guard while rendering
      pipe.done.catch(() => {});

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
        completed++;
        if (completed === 1 || completed === frameCount || completed % logEvery === 0) {
          console.log("[bachi-motion] progress " + completed + "/" + frameCount +
            "  (worker " + idx + " frame " + (f + 1) + " t=" + t.toFixed(3) + "s)");
        }
      }
      pipe.end();
      await pipe.done;
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
  const wavPath = buildAudioWavIfNeeded(args, data, timing.start, timing.end, work);
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

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (err) { die(err.message); }
  if (args.help) { process.stdout.write(HELP); return; }
  if (!args.tja) die("请用 --tja 指定谱面文件。\n" + HELP);
  if (!args.out) die("请用 --out 指定输出 mp4 路径。\n" + HELP);
  if (!isFinite(args.rate) || args.rate <= 0) die("--rate 必须是正数");
  if (!isFinite(args.fps) || args.fps <= 0) die("--fps 必须是正数");
  if (!Number.isInteger(args.workers) || args.workers < 1) die("--workers 必须是正整数");
  const size = parseSize(args.size);
  if (!fs.existsSync(path.resolve(args.tja))) die("找不到谱面文件：" + args.tja);
  if (args.sticking && !fs.existsSync(path.resolve(args.sticking))) {
    die("找不到手顺 JSON：" + args.sticking);
  }
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).error) {
    die("找不到 ffmpeg，请先把它安装到 PATH");
  }

  let puppeteer;
  try {
    puppeteer = require("puppeteer-core");
  } catch {
    try { puppeteer = require("puppeteer"); }
    catch {
      die("找不到 puppeteer-core。请在项目根目录运行 npm install");
    }
  }
  const chrome = findChrome();
  if (!chrome && !puppeteer.executablePath) {
    die("找不到 Chrome / Chromium。请安装浏览器，或设置环境变量 CHROME_PATH");
  }

  const data = buildPayload(args);
  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const { server, port } = await startStaticServer(ROOT);
  // Pass --rate so the page's rate-dependent roll blur (扇形模糊 at rate==1) stays off during slow-mo.
  const url = "http://127.0.0.1:" + port + "/index.html?export=1&rate=" + encodeURIComponent(String(args.rate));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-frames-"));
  let singleBrowser = null;
  try {
    const launchOpts = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--font-render-hinting=none",
        "--hide-scrollbars",
      ],
    };
        if (chrome) launchOpts.executablePath = chrome;

    if (args.workers === 1) {
      try {
        singleBrowser = await puppeteer.launch(launchOpts);
      } catch (err) {
        throw new Error(
          "无法启动 headless Chrome（" + (err.message || err) + "）。\n" +
          "请在有图形/浏览器环境的机器上安装 Chrome 或 Chromium，并设置 CHROME_PATH。",
        );
      }
      await renderSingleWorker(singleBrowser, url, size, data, args, work, outPath);
      singleBrowser = null;
    } else {
      await renderParallelWorkers(launchOpts, puppeteer, url, size, data, args, work, outPath);
    }

    const stat = fs.statSync(outPath);
    console.log("[bachi-motion] wrote " + outPath + "  (" + Math.round(stat.size / 1024) + " KB)");
  } finally {
    if (singleBrowser) {
      try { await singleBrowser.close(); } catch { /* ignore */ }
    }
    server.close();
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
