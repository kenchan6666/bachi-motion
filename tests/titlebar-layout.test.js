/**
 * Webpage title bar stays above the note highway:
 *   left edge on the highway's painted left edge,
 *   16px gap (20px when the viewport is at least 1920 wide),
 *   stage pushed down when that gap would clip the title,
 *   12px right of the header monogram when the two would overlap.
 * body.export keeps the left-of-track plate when the beige margin is wide.
 *
 *   node tests/titlebar-layout.test.js
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));
const VIEW_W = 800, VIEW_H = 860, TRACK_Y = 28;
const LANE_X = 30, LANE_STROKE = 3;
const TITLE_GAP = 16, TITLE_GAP_WIDE = 20, WIDE_AT = 1920;
const LOGO_CLEAR = 12;

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

function trackTop(r) {
  return r.top + (TRACK_Y / VIEW_H) * r.height;
}

function titleGapFor(width) {
  return width >= WIDE_AT ? TITLE_GAP_WIDE : TITLE_GAP;
}

function laneEdges(stage) {
  const sx = stage.width / VIEW_W;
  const sy = stage.height / VIEW_H;
  const out = LANE_STROKE / 2;
  return {
    left: stage.left + (LANE_X - out) * sx,
    top: stage.top + (TRACK_Y - out) * sy,
  };
}

function titleWidthFor(stageW) {
  return Math.min(stageW * 0.62, Math.max(200, stageW - 24));
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function exportLeftOfTrack(r) {
  const s = r.height / VIEW_H;
  const padL = Math.max(16, Math.min(44, 28 * s));
  const gap = Math.max(10, Math.min(22, 16 * s));
  const left = Math.max(12, Math.min(padL, r.left * 0.12));
  return {
    left,
    width: Math.max(120, r.left - left - gap),
    top: trackTop(r),
  };
}

function exportCramped(r) {
  return {
    left: 8,
    width: Math.max(100, r.left - 16),
    top: trackTop(r),
  };
}

function near(actual, expected, tol, label) {
  const d = Math.abs(actual - expected);
  if (d > tol) {
    throw new Error(label + " expected " + expected.toFixed(2) + " got " + actual.toFixed(2) + " (Δ " + d.toFixed(2) + ")");
  }
}

function assertBox(box, expected, label) {
  near(box.left, expected.left, 1, label + " left");
  near(box.top, expected.top, 1, label + " top");
  near(box.width, expected.width, 1, label + " width");
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
  let passed = 0;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => {
      const bar = document.getElementById("titlebar");
      return bar && bar.classList.contains("is-on");
    }, { timeout: 15000 });

    async function measure() {
      await page.evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }));
      return page.evaluate(() => {
        const svg = document.getElementById("stage");
        svg.style.maxHeight = "";
        svg.style.transform = "";
        svg.style.marginTop = "";
        const natural = svg.getBoundingClientRect();
        if (typeof window.layoutTitleBar === "function") window.layoutTitleBar();
        const stage = svg.getBoundingClientRect();
        const bar = document.getElementById("titlebar").getBoundingClientRect();
        const well = document.querySelector(".stage-well").getBoundingClientRect();
        const frame = document.querySelector(".stage-frame").getBoundingClientRect();
        const logoEl = document.querySelector(".brand .mon");
        const logo = logoEl ? logoEl.getBoundingClientRect() : null;
        const pad = getComputedStyle(document.getElementById("titlebar")).padding;
        return {
          exporting: document.body.classList.contains("export"),
          stage: { left: stage.left, top: stage.top, width: stage.width, height: stage.height, right: stage.right, bottom: stage.bottom },
          natural: { left: natural.left, top: natural.top, width: natural.width, height: natural.height, right: natural.right, bottom: natural.bottom },
          bar: { left: bar.left, top: bar.top, width: bar.width, height: bar.height, right: bar.right, bottom: bar.bottom },
          well: { left: well.left, top: well.top, width: well.width, height: well.height, right: well.right },
          frame: { left: frame.left, top: frame.top, width: frame.width, height: frame.height, right: frame.right, bottom: frame.bottom },
          logo: logo ? { left: logo.left, top: logo.top, width: logo.width, height: logo.height, right: logo.right, bottom: logo.bottom } : null,
          padding: pad,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        };
      });
    }

    // 1080x860 is a desktop width where the highway-aligned title would cover
    // the header monogram, so the 12px logo clearance has to kick in.
    const webSizes = [[1920, 1080], [1600, 900], [1440, 900], [1280, 900], [1280, 800], [1080, 860], [840, 900], [400, 800]];
    let sawPush = false;
    let sawLogoShift = false;
    for (const [w, h] of webSizes) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      const m = await measure();
      if (m.exporting) throw new Error(w + "x" + h + " webpage picked up body.export");
      const gapNeed = titleGapFor(w);
      const lane = laneEdges(m.stage);
      const naturalLane = laneEdges(m.natural);
      const gap = lane.top - m.bar.bottom;
      if (gap < gapNeed - 0.75) {
        throw new Error("webpage " + w + "x" + h + " gap " + gap.toFixed(2) + " < " + gapNeed);
      }
      if (gap > gapNeed + 1.25) {
        throw new Error("webpage " + w + "x" + h + " gap " + gap.toFixed(2) + " exceeds " + gapNeed + " by too much");
      }
      if (m.bar.top < -0.75) {
        throw new Error("webpage " + w + "x" + h + " title clips the viewport (top " + m.bar.top.toFixed(2) + ")");
      }
      if (m.bar.bottom > lane.top - gapNeed + 0.75) {
        throw new Error("webpage " + w + "x" + h + " title overlaps the highway");
      }
      near(m.bar.width, titleWidthFor(m.stage.width), 1.25, "webpage " + w + "x" + h + " width");
      const aligned = {
        left: lane.left,
        top: m.bar.top,
        right: lane.left + m.bar.width,
        bottom: m.bar.bottom,
      };
      const logoHit = m.logo && overlaps(aligned, m.logo);
      if (logoHit) {
        near(m.bar.left, m.logo.right + LOGO_CLEAR, 1.25, "webpage " + w + "x" + h + " logo clearance");
        if (overlaps(m.bar, m.logo)) {
          throw new Error("webpage " + w + "x" + h + " title still overlaps the logo");
        }
        sawLogoShift = true;
      } else {
        near(m.bar.left, lane.left, 1.25, "webpage " + w + "x" + h + " left edge");
      }
      if (m.stage.left >= 180) {
        const legacy = exportLeftOfTrack(m.stage);
        if (Math.abs(m.bar.left - legacy.left) < 8 && Math.abs(m.bar.top - legacy.top) < 8) {
          throw new Error("webpage " + w + "x" + h + " still uses the left-of-track title");
        }
      }
      const naturalNeed = m.bar.height + gapNeed;
      if (naturalLane.top < naturalNeed - 0.5) {
        if (m.stage.top <= m.natural.top + 0.5 && m.stage.height >= m.natural.height - 0.5) {
          throw new Error("webpage " + w + "x" + h + " did not push the stage down");
        }
        const limit = Math.min(m.frame.bottom, m.innerHeight);
        if (m.stage.bottom > limit + 1.5) {
          throw new Error("webpage " + w + "x" + h + " stage clips the frame (bottom " + m.stage.bottom.toFixed(2) + " limit " + limit.toFixed(2) + ")");
        }
        sawPush = true;
      } else if (Math.abs(m.stage.top - m.natural.top) > 1.5 || Math.abs(m.stage.height - m.natural.height) > 1.5) {
        throw new Error("webpage " + w + "x" + h + " moved the stage without needing to");
      }
      const contentLeft = m.well.left + (w <= 840 ? 8 : 18);
      const contentRight = m.well.right - (w <= 840 ? 8 : 6);
      const contentMid = (contentLeft + contentRight) / 2;
      const stageMid = m.stage.left + m.stage.width / 2;
      near(stageMid, contentMid, 2, "webpage " + w + "x" + h + " stage stays centered in the well");
      passed++;
      console.log("ok webpage " + w + "x" + h + " title above track gap " + gap.toFixed(1));
    }
    if (!sawPush) throw new Error("no webpage size required the stage to move down");
    if (!sawLogoShift) throw new Error("no webpage size required the logo clearance");

    await page.evaluate(() => document.body.classList.add("export"));

    for (const [w, h] of [[1920, 1080], [1280, 720]]) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      const m = await measure();
      if (!m.exporting) throw new Error("export class missing at " + w + "x" + h);
      if (m.stage.left < 180) throw new Error("export " + w + "x" + h + " lost the wide left margin (" + m.stage.left + ")");
      const expected = exportLeftOfTrack(m.stage);
      assertBox(m.bar, expected, "export " + w + "x" + h + " left of track");
      if (m.bar.right > m.stage.left + 1) {
        throw new Error("export " + w + "x" + h + " title overlaps the stage");
      }
      const s = m.stage.height / VIEW_H;
      const padY = Math.max(8, 11 * s);
      const padX = Math.max(10, 14 * s);
      const parts = m.padding.split(" ").map((p) => parseFloat(p));
      const py = parts.length === 1 ? parts[0] : parts[0];
      const px = parts.length === 1 ? parts[0] : (parts.length === 2 ? parts[1] : parts[1]);
      near(py, padY, 0.6, "export " + w + "x" + h + " padding-y");
      near(px, padX, 0.6, "export " + w + "x" + h + " padding-x");
      const stageMid = m.stage.left + m.stage.width / 2;
      near(stageMid, w / 2, 2, "export " + w + "x" + h + " stage stays centered");
      passed++;
      console.log("ok export " + w + "x" + h + " title left of track");
    }

    await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
    const cramped = await measure();
    if (cramped.stage.left >= 180 || cramped.stage.top >= 56) {
      throw new Error("export 900x900 was not the cramped fallback (left " + cramped.stage.left + " top " + cramped.stage.top + ")");
    }
    assertBox(cramped.bar, exportCramped(cramped.stage), "export 900x900 cramped left fallback");
    passed++;
    console.log("ok export 900x900 cramped fallback unchanged");

    console.log("titlebar-layout: " + passed + " passed");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
