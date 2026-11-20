/**
 * rollDotPos / ellipseMinDist cache must match the uncached 720-sample path
 * bit-for-bit, including after many repeated calls (simulating frames).
 *
 *   node tests/roll-dot-cache.test.js
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
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* next */ }
  }
  throw new Error("Cannot find puppeteer-core");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".tja": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

function startStaticServer(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/") rel = "/index.html";
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

(async () => {
  const puppeteer = loadPuppeteer();
  const chrome = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome";
  const tja = fs.readFileSync(path.join(ROOT, "samples/suyue_demo.tja"), "utf8");
  const data = TaikoParser.eventsFromTja(tja, { course: "Oni" });
  const { server, port } = await startStaticServer(ROOT);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chrome,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:" + port + "/index.html?export=1", { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => typeof window.startEngine === "function" && typeof window.renderAt === "function", { timeout: 15000 });
    await page.evaluate((payload) => {
      document.body.classList.add("export");
      window.startEngine(payload, { mode: "test" });
    }, data);
    await page.waitForFunction(() => {
      const a = window.taikoAnim;
      return a && typeof a.rollDotPos === "function" && typeof a.rollDotPosUncached === "function"
        && typeof a.ellipseMinDist === "function" && typeof a.ellipseMinDistUncached === "function";
    }, { timeout: 10000 });

    const result = await page.evaluate(() => {
      const api = window.taikoAnim;
      api.clearRollGeomCache();
      const F = api.GEOM.face;
      const n = api.ROLL_DOT.rimSamples;
      const hands = ["R", "L"];
      const pos = {};
      const mismatches = [];

      for (const hand of hands) {
        const raw = api.rollDotPosUncached(hand);
        const first = api.rollDotPos(hand);
        if (raw.x !== first.x || raw.y !== first.y) {
          mismatches.push({ kind: "pos-first", hand, raw, first });
        }
        for (let i = 0; i < 240; i++) {
          const again = api.rollDotPos(hand);
          if (again.x !== raw.x || again.y !== raw.y) {
            mismatches.push({ kind: "pos-repeat", hand, i, raw, again });
            break;
          }
        }
        pos[hand] = { x: raw.x, y: raw.y };
      }

      // ellipseMinDist vs uncached, at the roll-dot centers and a few offsets.
      const probes = [];
      for (const hand of hands) {
        probes.push({ x: pos[hand].x, y: pos[hand].y });
        probes.push({ x: pos[hand].x, y: pos[hand].y + 4 });
        probes.push({ x: pos[hand].x, y: F.cy });
      }
      probes.push({ x: F.cx, y: F.cy });
      probes.push({ x: F.cx + F.rx, y: F.cy });
      let distChecks = 0;
      for (const p of probes) {
        const a = api.ellipseMinDistUncached(F.cx, F.cy, F.rx, F.ry, p.x, p.y, n);
        const b = api.ellipseMinDist(F.cx, F.cy, F.rx, F.ry, p.x, p.y, n);
        distChecks += 1;
        if (a !== b) mismatches.push({ kind: "dist", p, uncached: a, cached: b });
      }

      return {
        ok: mismatches.length === 0,
        mismatches: mismatches.slice(0, 8),
        pos,
        samples: n,
        repeats: 240,
        distChecks,
        face: { cx: F.cx, cy: F.cy, rx: F.rx, ry: F.ry },
      };
    });

    if (!result.ok) {
      console.error("FAIL: roll-dot cache mismatch", JSON.stringify(result, null, 2));
      process.exit(1);
    }
    const fmt = (p) => "(" + p.x + ", " + p.y + ")";
    console.log("roll-dot cache: ok");
    console.log("  R " + fmt(result.pos.R) + "  L " + fmt(result.pos.L));
    console.log("  uncached vs cached: exact match, " + result.repeats + " repeats/hand, "
      + result.distChecks + " ellipseMinDist probes, " + result.samples + " rim samples");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
