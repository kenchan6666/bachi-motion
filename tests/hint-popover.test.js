/**
 * Settings ! hints must open next to their buttons, including on the same
 * turn as the click. The popover UA rule is inset:0; margin:auto. Author
 * margin:0 pins an unpositioned hint to the viewport origin, and Chrome
 * queues the toggle event, so placement has to happen in beforetoggle.
 *
 *   node tests/hint-popover.test.js
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

function assertNear(fails, id, phase, pop, btn) {
  const gap = 10;
  const below = Math.abs(pop.y - (btn.bottom + gap));
  const above = Math.abs(pop.bottom + gap - btn.top);
  const vertical = Math.min(below, above);
  const coversX = pop.x < btn.x + btn.w && pop.x + pop.w > btn.x;
  if (pop.x < 40 || pop.y < 40) {
    fails.push(id + " " + phase + " stuck at viewport origin " + JSON.stringify(pop));
  }
  if (vertical > 1.5) {
    fails.push(id + " " + phase + " not beside button (vertical gap " + vertical.toFixed(1) + ") pop=" + JSON.stringify(pop) + " btn=" + JSON.stringify(btn));
  }
  if (!coversX) {
    fails.push(id + " " + phase + " does not overlap the ! button horizontally");
  }
  if (pop.x < 8 || pop.y < 8 || pop.x + pop.w > 1280 - 8 || pop.y + pop.h > 900 - 8) {
    fails.push(id + " " + phase + " escapes the 1280x900 viewport " + JSON.stringify(pop));
  }
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
  const fails = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:" + port + "/index.html", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    const hints = ["routeHint", "chartHint", "batchHint"];
    for (const id of hints) {
      const measured = await page.evaluate((hintId) => {
        const settings = document.getElementById("settings");
        settings.open = true;
        const btn = document.getElementById(hintId + "Btn");
        const pop = document.getElementById(hintId);
        if (pop.matches(":popover-open")) pop.hidePopover();
        const br = btn.getBoundingClientRect();
        const sr = settings.getBoundingClientRect();
        if (br.bottom > sr.bottom - 8 || br.top < sr.top + 40) {
          settings.scrollTop += br.top - sr.top - 120;
        }
        btn.click();
        const r = pop.getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        const box = (rect) => ({
          x: rect.x, y: rect.y, w: rect.width, h: rect.height,
          bottom: rect.bottom, top: rect.top,
        });
        return {
          sync: { pop: box(r), btn: box(b), open: pop.matches(":popover-open"), style: pop.getAttribute("style") },
          text: pop.textContent,
        };
      }, id);
      assertNear(fails, id, "sync", measured.sync.pop, measured.sync.btn);
      if (!measured.sync.open) fails.push(id + " did not open on click");
      if (id === "chartHint") {
        if (!measured.text.includes("2 咔")) fails.push("chart hint dropped 咔: " + measured.text);
        if (measured.text.includes("咕")) fails.push("chart hint typo 咕");
      }
      const settled = await page.evaluate((hintId) => {
        const pop = document.getElementById(hintId);
        const btn = document.getElementById(hintId + "Btn");
        const r = pop.getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        const box = (rect) => ({
          x: rect.x, y: rect.y, w: rect.width, h: rect.height,
          bottom: rect.bottom, top: rect.top,
        });
        return { pop: box(r), btn: box(b), open: pop.matches(":popover-open"), style: pop.getAttribute("style") };
      }, id);
      assertNear(fails, id, "settled", settled.pop, settled.btn);
      await page.evaluate((hintId) => {
        const pop = document.getElementById(hintId);
        if (pop.matches(":popover-open")) pop.hidePopover();
      }, id);
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  if (fails.length) {
    console.error("FAIL hint popovers\n" + fails.join("\n"));
    process.exit(1);
  }
  console.log("ok: three hint popovers anchor to their ! buttons");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
