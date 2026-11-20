/**
 * Long-gap 归位: after a ka, a rest longer than the REST window parks both
 * hands on the centered opening idle (singleIdlePose shift 0) and holds still.
 * Short gaps must not park there. Next-note kas slide out only after the rest.
 *
 *   node tests/long-rest-idle.test.js
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));

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
  const { server, port } = await startStaticServer(ROOT);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chrome,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:" + port + "/index.html?export=1&paused=1&loop=0", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await page.waitForFunction(() => typeof window.startEngine === "function", { timeout: 15000 });
    const result = await page.evaluate(() => {
      const fails = [];
      const note = (ok, msg) => { if (!ok) fails.push(msg); };
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      function load(events) {
        window.startEngine({ events }, { mode: "long-rest-idle" });
        if (typeof window.setPlaying === "function") window.setPlaying(false);
        return window.taikoAnim;
      }
      function pose(api, hand, t) {
        return api.poseAt(hand, api.state.tracks[hand], t, { noKick: true });
      }
      function opening(hand) {
        return singleIdlePose(hand, 0, "don").tip;
      }
      function kaReady(hand) {
        return singleIdlePose(hand, 0, "ka").tip;
      }
      function maxStep(api, hand, t0, t1) {
        let max = 0;
        const dt = 1 / 60;
        let prev = pose(api, hand, t0).tip;
        for (let t = t0 + dt; t <= t1 + 1e-9; t += dt) {
          const tip = pose(api, hand, t).tip;
          max = Math.max(max, dist(tip, prev));
          prev = tip;
        }
        return max;
      }
      const cfg = CONFIG;
      note(cfg.LIFT_PX_SPARSE === 130, "LIFT_PX_SPARSE changed: " + cfg.LIFT_PX_SPARSE);
      note(cfg.LIFT_PX_LONG === 185, "LIFT_PX_LONG changed: " + cfg.LIFT_PX_LONG);
      note(cfg.LIFT_PX_DENSE === 36, "LIFT_PX_DENSE changed: " + cfg.LIFT_PX_DENSE);
      note(cfg.LIFT_PX_8TH === 85, "LIFT_PX_8TH changed: " + cfg.LIFT_PX_8TH);
      note(Math.abs((cfg.LIFT_COMPOUND_LIGHT_RATIO || 0) - 0.75) < 1e-9, "light ratio changed");
      note(cfg.LIFT_PX_COMPOUND_HEAVY === 188, "heavy lift changed: " + cfg.LIFT_PX_COMPOUND_HEAVY);
      note((cfg.LIFT_DT_DENSE || 0) === 0.10, "dense threshold changed");

      // Singles: phrase ends on a left ka, long gap, next phrase is kas.
      {
        const api = load([
          { t: 0.00, hand: "R", face: "don", grip: "single" },
          { t: 0.20, hand: "L", face: "don", grip: "single" },
          { t: 0.40, hand: "R", face: "don", grip: "single" },
          { t: 0.60, hand: "L", face: "ka", grip: "single" },
          { t: 3.00, hand: "R", face: "ka", grip: "single" },
          { t: 3.20, hand: "L", face: "ka", grip: "single" },
        ]);
        const openT = -0.5;
        const mid = 1.70;
        for (const h of ["L", "R"]) {
          const idle = opening(h);
          const atOpen = pose(api, h, openT).tip;
          const atMid = pose(api, h, mid).tip;
          note(dist(atOpen, idle) < 1.5, h + " opening is not centered idle, d=" + dist(atOpen, idle).toFixed(1));
          note(dist(atMid, idle) < 1.5, h + " single mid-gap is not centered idle, d=" + dist(atMid, idle).toFixed(1) + " tip=" + atMid.x.toFixed(1) + "," + atMid.y.toFixed(1));
          note(dist(atMid, kaReady(h)) > 40, h + " single mid-gap is ka-ready");
          note(maxStep(api, h, 1.2, 2.3) <= 0.5, h + " single mid-gap still moving, step=" + maxStep(api, h, 1.2, 2.3).toFixed(2));
        }
        // After the rest window, the hand whose next note is ka may leave center.
        const lLate = pose(api, "L", 3.00).tip;
        note(dist(lLate, kaReady("L")) < dist(lLate, opening("L")), "left did not leave center after the rest window");
        const lEarly = pose(api, "L", 2.50).tip;
        note(dist(lEarly, opening("L")) < 1.5, "left slid toward ka before the rest window ended");
      }

      // Rolls ending on a left ka, then a long gap into single kas.
      {
        const api = load([
          { t: 0.00, hand: "R", face: "don", grip: "roll" },
          { t: 0.05, hand: "R", face: "don", grip: "roll" },
          { t: 0.10, hand: "L", face: "ka", grip: "roll" },
          { t: 0.15, hand: "L", face: "ka", grip: "roll" },
          { t: 0.20, hand: "R", face: "don", grip: "roll" },
          { t: 0.25, hand: "R", face: "don", grip: "roll" },
          { t: 0.30, hand: "L", face: "ka", grip: "roll" },
          { t: 0.35, hand: "L", face: "ka", grip: "roll" },
          { t: 2.80, hand: "R", face: "ka", grip: "single" },
          { t: 3.00, hand: "L", face: "ka", grip: "single" },
        ]);
        const mid = 1.50;
        for (const h of ["L", "R"]) {
          const idle = opening(h);
          const atMid = pose(api, h, mid).tip;
          const settledT = h === "L" ? 0.35 + 0.36 : 0.25 + 0.36;
          const atSettled = pose(api, h, settledT).tip;
          note(dist(atSettled, idle) < 1.5, h + " roll→ka not centered by REST_AFTER, d=" + dist(atSettled, idle).toFixed(1));
          note(dist(atMid, idle) < 1.5, h + " roll→ka mid-gap is not centered idle, d=" + dist(atMid, idle).toFixed(1) + " tip=" + atMid.x.toFixed(1) + "," + atMid.y.toFixed(1));
          note(dist(atMid, kaReady(h)) > 40, h + " roll→ka mid-gap parked on ka-ready");
          note(maxStep(api, h, 1.1, 2.1) <= 0.5, h + " roll→ka mid-gap still moving");
        }
        const lBefore = pose(api, "L", 2.55).tip;
        note(dist(lBefore, opening("L")) < 1.5, "left roll hand slid to ka during the mid-gap");
        const lAfter = pose(api, "L", 2.82).tip;
        note(dist(lAfter, kaReady("L")) < dist(lAfter, opening("L")), "left did not slide to ka-ready after the rest");
      }

      // Other hand's ka stream overlaps this hand's rest start, then goes quiet.
      {
        const api = load([
          { t: 0.00, hand: "R", face: "don", grip: "single" },
          { t: 0.10, hand: "L", face: "ka", grip: "single" },
          { t: 0.25, hand: "L", face: "ka", grip: "single" },
          { t: 0.40, hand: "L", face: "ka", grip: "single" },
          { t: 3.00, hand: "R", face: "don", grip: "single" },
          { t: 3.20, hand: "L", face: "don", grip: "single" },
        ]);
        const mid = 1.70;
        for (const h of ["L", "R"]) {
          const idle = opening(h);
          const atMid = pose(api, h, mid).tip;
          note(dist(atMid, idle) < 1.5, h + " stayed ka-shifted through the empty gap, d=" + dist(atMid, idle).toFixed(1) + " tip=" + atMid.x.toFixed(1));
          note(maxStep(api, h, 1.2, 2.3) <= 0.5, h + " shift-return gap still moving");
        }
      }

      // Other hand keeps playing kas across our whole wait: dodge stays.
      {
        const ev = [{ t: 0.00, hand: "R", face: "don", grip: "single" }];
        for (let t = 0.20; t <= 2.80 + 1e-9; t += 0.20) {
          ev.push({ t: +t.toFixed(2), hand: "L", face: "ka", grip: "single" });
        }
        ev.push({ t: 3.20, hand: "R", face: "don", grip: "single" });
        const api = load(ev);
        const shifted = singleIdlePose("R", 1, "don").tip;
        const atMid = pose(api, "R", 1.50).tip;
        note(dist(atMid, shifted) < 2, "ongoing other-hand ka stream lost the idle dodge, d=" + dist(atMid, shifted).toFixed(1));
        note(maxStep(api, "R", 1.2, 2.2) <= 0.5, "ongoing ka-shift rest is moving");
      }

      // Short same-hand gap must not park on the centered idle.
      {
        const api = load([
          { t: 0.00, hand: "R", face: "don", grip: "single" },
          { t: 0.20, hand: "L", face: "ka", grip: "single" },
          { t: 0.40, hand: "R", face: "don", grip: "single" },
          { t: 0.60, hand: "L", face: "don", grip: "single" },
        ]);
        const at = pose(api, "L", 0.40).tip;
        note(dist(at, opening("L")) > 25, "short gap returned to centered idle, d=" + dist(at, opening("L")).toFixed(1));
      }

      return fails;
    });
    if (result.length) {
      for (const f of result) console.error("FAIL " + f);
      console.error(result.length + " assertion(s) failed");
      process.exit(1);
    }
    console.log("ok  long-rest idle parks on the centered opening pose");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
