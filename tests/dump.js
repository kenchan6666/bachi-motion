#!/usr/bin/env node
/**
 * Headless-Chrome dumper: serve the repo statically and emit per-frame hand data.
 * Usage: BM_ROOT=<clone> node tests/dump.js <tja> [measures] > o.json
 *
 * Output: { ev, out, start, end }
 *   ev  = [t, hand, face, grip]
 *   out = [t, hand, tipDisp, gripDisp, lift, tip.y]
 */
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));
const TaikoParser = require(path.join(ROOT, "js/parser.js"));

function loadPuppeteer() {
  const candidates = [
    path.join(ROOT, "node_modules", "puppeteer-core"),
    "puppeteer-core",
    "puppeteer",
  ];
  const errors = [];
  for (const c of candidates) {
    try {
      return require(c);
    } catch (e) {
      errors.push(c + ": " + (e && e.message ? e.message : e));
    }
  }
  throw new Error(
    "Cannot find puppeteer-core (run npm install in the repo root).\n" + errors.join("\n")
  );
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".tja": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
};

function startStaticServer(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/") rel = "/index.html";
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(file, (err, buf) => {
        if (err) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function resolveChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const defaults = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];
  for (const p of defaults) {
    if (fs.existsSync(p)) return p;
  }
  return "/usr/bin/google-chrome";
}

(async () => {
  const tjaPath = process.argv[2];
  if (!tjaPath) {
    console.error("Usage: node tests/dump.js <tja> [measures]");
    process.exit(2);
  }
  const tja = fs.readFileSync(tjaPath, "utf8");
  const measures = process.argv[3] || "1-10";
  const data = TaikoParser.eventsFromTja(tja, { course: "Oni", measures });
  const puppeteer = loadPuppeteer();
  const chrome = resolveChrome();
  const { server, port } = await startStaticServer(ROOT);
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: chrome,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:" + port + "/index.html?export=1&rate=0.3", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await page.waitForFunction(
      () => typeof window.renderAt === "function" && typeof window.startEngine === "function",
      { timeout: 15000 }
    );
    await page.evaluate((payload) => {
      if (typeof window.setRate === "function") window.setRate(0.3);
      window.startEngine(payload, { mode: "dump" });
      if (typeof window.setPlaying === "function") window.setPlaying(false);
    }, data);
    const info = await page.evaluate(() => {
      const api = window.taikoAnim;
      const st = api.state;
      const ev = st.events.map((e) => [+e.t.toFixed(3), e.hand, e.face, e.grip]);
      const dt = 1 / 60,
        out = [];
      let prev = {};
      for (let t = st.start; t <= st.end; t += dt) {
        for (const h of ["L", "R"]) {
          const p = api.poseAt(h, st.tracks[h], t);
          const q = prev[h];
          if (q) {
            const d = Math.hypot(p.tip.x - q.tip.x, p.tip.y - q.tip.y);
            const g = Math.hypot(p.grip.x - q.grip.x, p.grip.y - q.grip.y);
            out.push([
              +t.toFixed(4),
              h,
              +d.toFixed(1),
              +g.toFixed(1),
              +(+p.lift).toFixed(3),
              +p.tip.y.toFixed(1),
            ]);
          }
          prev[h] = p;
        }
      }
      return { ev, out, start: st.start, end: st.end };
    });
    console.log(JSON.stringify(info, null, 2));
  } finally {
    if (browser) try { await browser.close(); } catch (e) { /* ignore */ }
    server.close();
  }
})().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
