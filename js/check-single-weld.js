#!/usr/bin/env node
/**
 * Sample single-hit poses on suyue_demo measure 1 and assert the weld:
 *   handDeg === stickDeg, grip→棒尾 and grip→tip lengths drift ≤ 1px.
 * Usage: node js/check-single-weld.js
 */
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TaikoParser = require("./parser.js");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".tja": "text/plain; charset=utf-8",
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

async function main() {
  const tja = fs.readFileSync(path.join(ROOT, "samples/suyue_demo.tja"), "utf8");
  const data = TaikoParser.eventsFromTja(tja, { course: "Oni", measures: "1-1" });
  let puppeteer;
  try { puppeteer = require("puppeteer-core"); }
  catch (e) { throw new Error("需要 puppeteer-core"); }
  const chrome = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome";
  const { server, port } = await startStaticServer(ROOT);
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: chrome,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:" + port + "/index.html?export=1&rate=0.3", { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => typeof window.renderAt === "function" && typeof window.startEngine === "function", { timeout: 15000 });
    await page.evaluate((payload) => {
      if (typeof window.setRate === "function") window.setRate(0.3);
      window.startEngine(payload, { mode: "weld-check" });
      if (typeof window.setPlaying === "function") window.setPlaying(false);
    }, data);

    const report = await page.evaluate(() => {
      const api = window.taikoAnim || {};
      const poseAt = api.poseAt || window.poseAt;
      const check = api.checkSingleWeld;
      const tracks = api.state.tracks;
      if (!poseAt || !check || !tracks) return { ok: false, errors: ["poseAt/checkSingleWeld/tracks not exported"] };
      const step = 1 / 120;
      const t0 = -0.2, t1 = 0.6; // covers first 咚 (t=0) and first 咔 (t=0.375)
      const samples = { R: [], L: [] };
      const donR = [];
      for (let t = t0; t <= t1 + 1e-9; t += step) {
        for (const hand of ["R", "L"]) {
          const pose = poseAt(hand, tracks[hand], t);
          samples[hand].push({ t, pose });
          if (hand === "R" && pose.gripType === "single" && t >= -0.16 && t <= 0.005) donR.push({ t, pose });
        }
      }
      const all = samples.R.concat(samples.L);
      const result = check(all);
      const donCheck = check(donR);
      const degs = donR.map((s) => s.pose.handDeg);
      const tips = donR.map((s) => s.pose.tip.y);
      const grips = donR.map((s) => s.pose.grip.y);
      result.donLift = {
        n: donR.length,
        ok: donCheck.ok,
        errors: donCheck.errors,
        handDeg: degs.length ? { min: Math.min.apply(null, degs), max: Math.max.apply(null, degs), span: Math.max.apply(null, degs) - Math.min.apply(null, degs) } : null,
        tipY: tips.length ? { min: Math.min.apply(null, tips), max: Math.max.apply(null, tips), span: Math.max.apply(null, tips) - Math.min.apply(null, tips) } : null,
        gripY: grips.length ? { min: Math.min.apply(null, grips), max: Math.max.apply(null, grips), span: Math.max.apply(null, grips) - Math.min.apply(null, grips) } : null,
        stats: donCheck.stats,
      };
      return result;
    });

    console.log("single-weld check:", report.ok ? "ok" : "FAILED");
    if (report.errors && report.errors.length) report.errors.forEach((e) => console.log("  -", e));
    if (report.stats) {
      const s = report.stats;
      console.log("  samples", s.n);
      if (s.stub) console.log("  grip→棒尾  min", s.stub.min.toFixed(3), "max", s.stub.max.toFixed(3), "span", s.stub.span.toFixed(4), "px");
      if (s.gripTip) console.log("  grip→tip   min", s.gripTip.min.toFixed(3), "max", s.gripTip.max.toFixed(3), "span", s.gripTip.span.toFixed(4), "px");
    }
    if (report.donLift) {
      const d = report.donLift;
      console.log("  咚 lift→contact (R, t=-0.16..0):");
      if (d.handDeg) console.log("    handDeg", d.handDeg.min.toFixed(4), "→", d.handDeg.max.toFixed(4), "span", d.handDeg.span.toFixed(4), "deg");
      if (d.tipY) console.log("    tip Y  ", d.tipY.max.toFixed(2), "→", d.tipY.min.toFixed(2), "Δ", d.tipY.span.toFixed(2), "px");
      if (d.gripY) console.log("    grip Y ", d.gripY.max.toFixed(2), "→", d.gripY.min.toFixed(2), "Δ", d.gripY.span.toFixed(2), "px (wrist rises with the stick)");
      if (!d.ok) d.errors.forEach((e) => console.log("    !", e));
    }
    if (!report.ok) process.exitCode = 1;
  } finally {
    if (browser) try { await browser.close(); } catch (e) { /* ignore */ }
    server.close();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
