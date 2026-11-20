"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const batch = require("./batch-queue.js");
const jobs = require("./render-jobs.js");

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
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".md": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const SONG_EXT = {
  ".wav": true, ".mp3": true, ".ogg": true, ".flac": true,
  ".m4a": true, ".aac": true, ".opus": true,
};

function sendJson(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  });
  res.end(buf);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("上传太大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function optionalSeconds(value) {
  if (value == null || value === "") return null;
  const n = +value;
  return Number.isFinite(n) ? n : null;
}

function songExt(name) {
  const ext = path.extname(String(name || "")).toLowerCase();
  return SONG_EXT[ext] ? ext : ".bin";
}

function materializeJobs(specJobs, dir) {
  return specJobs.map((job, i) => {
    const tjaText = String(job.tjaText || "");
    const tja = path.join(dir, i + ".tja");
    fs.writeFileSync(tja, tjaText);
    let song = null;
    if (job.songBase64) {
      song = path.join(dir, i + "-song" + songExt(job.songName));
      fs.writeFileSync(song, Buffer.from(String(job.songBase64), "base64"));
    }
    let sticking = null;
    if (job.stickingText) {
      sticking = path.join(dir, i + ".handorder.json");
      fs.writeFileSync(sticking, String(job.stickingText));
    }
    const label = job.name || ("谱面 " + (i + 1));
    return {
      tja: tja,
      tjaText: tjaText,
      song: song,
      sticking: sticking,
      out: path.join(dir, i + ".mp4"),
      label: label,
      audio: !!job.hits,
      course: job.course || null,
      measures: job.measures || null,
      rate: job.rate == null ? 1 : Number(job.rate),
      technique: job.technique,
      hand: job.hand || "R",
      roll: job.roll || "自动滚奏",
      bignote: job.bignote || "single",
      fps: job.fps == null ? 60 : Number(job.fps),
      size: job.size || "1080p",
      workers: job.workers == null ? jobs.defaultWorkers() : Number(job.workers),
      sectionStart: optionalSeconds(job.sectionStart),
      sectionEnd: optionalSeconds(job.sectionEnd),
    };
  });
}

function writeEvent(res, snap) {
  if (!res || res.writableEnded || res.destroyed) return;
  res.write("data: " + JSON.stringify(snap) + "\n\n");
}

function clientSnap(record, snap) {
  const files = snap.done ? (snap.files || []).map((file, i) => {
    const stored = record.outputs[i] || {};
    return {
      index: file.index,
      ok: file.ok,
      error: file.error,
      name: stored.name || ("bachi-" + (i + 1) + ".mp4"),
      url: file.ok ? ("/api/batch/" + record.id + "/file/" + file.index) : null,
    };
  }) : [];
  return {
    total: snap.total,
    currentIndex: snap.currentIndex,
    currentLabel: snap.currentLabel,
    itemFraction: snap.itemFraction,
    overallFraction: snap.overallFraction,
    positionLabel: snap.positionLabel,
    frame: snap.frame,
    frameCount: snap.frameCount,
    done: snap.done,
    failed: snap.failed,
    succeeded: snap.succeeded,
    plans: record.plans,
    files: files,
  };
}

function publish(record, snap) {
  if (snap.done) {
    record.outputs = (snap.files || []).map((file, i) => ({
      out: file.out || null,
      name: downloadName((record.jobs[i] && record.jobs[i].label) || ("bachi-" + (i + 1))),
    }));
  }
  const client = clientSnap(record, snap);
  record.snaps.push(client);
  for (const res of record.listeners) writeEvent(res, client);
}

function downloadName(label) {
  const base = String(label || "bachi").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
  return /\.mp4$/i.test(base) ? base : (base + ".mp4");
}

function serveStatic(root, req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(root, rel));
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (file !== root && !file.startsWith(rootWithSep)) {
    res.writeHead(403); res.end("forbidden"); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}

function startRenderServer(opts) {
  opts = opts || {};
  const root = opts.root || path.join(__dirname, "..");
  const batches = new Map();
  const tempDirs = [];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    try {
      if (req.method === "GET" && url.pathname === "/api/render-info") {
        sendJson(res, 200, { ok: true, local: true });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/batch") {
        const raw = await readBody(req, 256 * 1024 * 1024);
        let body;
        try { body = JSON.parse(raw.toString("utf8") || "{}"); }
        catch (err) { sendJson(res, 400, { error: "请求不是 JSON" }); return; }
        if (!body || !Array.isArray(body.jobs) || !body.jobs.length) {
          sendJson(res, 400, { error: "队列是空的" });
          return;
        }
        const id = crypto.randomBytes(8).toString("hex");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-batch-"));
        tempDirs.push(dir);
        let list;
        try { list = materializeJobs(body.jobs, dir); }
        catch (err) {
          fs.rmSync(dir, { recursive: true, force: true });
          sendJson(res, 400, { error: err.message || String(err) });
          return;
        }
        let plans;
        try { plans = list.map((job) => jobs.planForJob(job)); }
        catch (err) {
          fs.rmSync(dir, { recursive: true, force: true });
          sendJson(res, 400, { error: err.message || String(err) });
          return;
        }
        const record = {
          id: id,
          dir: dir,
          jobs: list,
          plans: plans,
          snaps: [],
          listeners: new Set(),
          outputs: [],
        };
        batches.set(id, record);
        sendJson(res, 200, { id: id });
        setImmediate(() => {
          batch.runBatch(list, {
            renderJob: (job, ctx) => opts.renderJob(job, ctx),
            onProgress(snap) { publish(record, snap); },
          }).catch((err) => {
            publish(record, {
              total: list.length,
              currentIndex: 0,
              currentLabel: "",
              itemFraction: 1,
              overallFraction: 1,
              positionLabel: list.length + "/" + list.length,
              frame: 0,
              frameCount: 0,
              done: true,
              failed: list.length,
              succeeded: 0,
              files: list.map((_, i) => ({ index: i, ok: false, error: err.message || String(err), out: null })),
            });
          });
        });
        return;
      }
      const events = url.pathname.match(/^\/api\/batch\/([a-f0-9]+)\/events$/);
      if (req.method === "GET" && events) {
        const record = batches.get(events[1]);
        if (!record) { sendJson(res, 404, { error: "没有这批任务" }); return; }
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });
        record.listeners.add(res);
        for (const snap of record.snaps) writeEvent(res, snap);
        req.on("close", () => record.listeners.delete(res));
        return;
      }
      const fileRoute = url.pathname.match(/^\/api\/batch\/([a-f0-9]+)\/file\/(\d+)$/);
      if (req.method === "GET" && fileRoute) {
        const record = batches.get(fileRoute[1]);
        const index = +fileRoute[2];
        const stored = record && record.outputs[index];
        if (!stored || !stored.out || !fs.existsSync(stored.out)) {
          sendJson(res, 404, { error: "文件还没准备好" });
          return;
        }
        res.writeHead(200, {
          "Content-Type": "video/mp4",
          "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(stored.name),
        });
        fs.createReadStream(stored.out).pipe(res);
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        sendJson(res, 404, { error: "没有这个接口" });
        return;
      }
      serveStatic(root, req, res);
    } catch (err) {
      if (!res.headersSent) sendJson(res, 500, { error: err.message || String(err) });
      else res.end();
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port || 0, "127.0.0.1", () => {
      resolve({
        port: server.address().port,
        close() {
          for (const record of batches.values()) {
            for (const res of record.listeners) {
              try { res.end(); } catch (err) { /* ignore */ }
            }
          }
          return new Promise((done) => {
            server.close(() => {
              for (const dir of tempDirs) {
                try { fs.rmSync(dir, { recursive: true, force: true }); } catch (err) { /* ignore */ }
              }
              done();
            });
          });
        },
      });
    });
  });
}

module.exports = { startRenderServer: startRenderServer };
