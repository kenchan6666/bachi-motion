/**
 * Measure overview marks: one gold "!" per measure that already contains
 * 待确认 / 拿不准 notes. Clearing that flag removes the mark.
 *
 *   node tests/overview-marks.test.js
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

function tja(title, bars) {
  return [
    "TITLE:" + title,
    "BPM:120",
    "OFFSET:0",
    "COURSE:Oni",
    "LEVEL:1",
    "",
    "#START",
    bars.join("\n"),
    "#END",
    "",
  ].join("\n");
}

// Measure 1 has three 待确认 notes, measure 3 has eight, and the run
// spills one note into measure 4. Measures 2 and 5 stay clean.
const UNCERTAIN_TJA = tja("总览待确认", [
  "1111100011100000,",
  "1000100010001000,",
  "1111100011111111,",
  "1000100010001000,",
  "1000100010001000,",
]);

const CLEAN_TJA = tja("总览干净", [
  "1000100010001000,",
  "1000100010001000,",
  "1000100010001000,",
  "1000100010001000,",
  "1000100010001000,",
  "1000100010001000,",
]);

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
  const fail = (msg) => fails.push(msg);

  async function loadChart(page, text, measures) {
    await page.evaluate((src) => {
      window.BachiApp.setTja(src);
      window.BachiApp.setMode("zhuren");
      window.BachiEditor.open();
      window.BachiApp.generate(false);
    }, text);
    await page.waitForFunction((n) => {
      return document.querySelectorAll("#editorMeasures .editor-measure").length >= n;
    }, { timeout: 10000 }, measures);
  }

  async function readOverview(page) {
    return page.evaluate(() => {
      const track = document.getElementById("editorOverviewTrack");
      const overview = document.getElementById("editorOverview");
      const tag = document.querySelector(".editor-string-tag.is-warn");
      const tagCs = tag ? getComputedStyle(tag) : null;
      const notes = (window.BachiEditor.getState() && window.BachiEditor.getState().rawNotes) || [];
      const warnings = (window.BachiEditor.getResolved() && window.BachiEditor.getResolved().warnings) || [];
      const counts = Object.create(null);
      warnings.forEach((w) => {
        for (let i = w[0]; i <= w[1]; i++) {
          const note = notes[i];
          if (!note) continue;
          const key = String(note.measure);
          counts[key] = (counts[key] || 0) + 1;
        }
      });
      const marks = Array.from(document.querySelectorAll(".editor-overview-mark")).map((el) => {
        const cell = document.querySelector('.editor-overview-cell[data-index="' + el.dataset.measure + '"]');
        const num = cell && cell.querySelector("span");
        const mr = el.getBoundingClientRect();
        const cr = cell ? cell.getBoundingClientRect() : null;
        const nr = num && !num.hidden ? num.getBoundingClientRect() : null;
        const cs = getComputedStyle(el);
        const hitsNumber = nr ? (
          mr.left < nr.right - 0.5 && mr.right > nr.left + 0.5 &&
          mr.top < nr.bottom - 0.5 && mr.bottom > nr.top + 0.5
        ) : false;
        return {
          measure: el.dataset.measure,
          text: el.textContent,
          color: cs.color,
          bg: cs.backgroundColor,
          border: cs.borderTopColor,
          hitsNumber: hitsNumber,
          belowNumber: !nr || mr.top >= nr.bottom - 1,
          centerInCell: cr ? ((mr.left + mr.right) / 2 >= cr.left - 0.5 && (mr.left + mr.right) / 2 <= cr.right + 0.5) : false,
          w: mr.width,
          h: mr.height,
          number: num ? num.textContent : "",
        };
      });
      return {
        hidden: overview.hidden,
        trackH: track.getBoundingClientRect().height,
        label: (document.querySelector(".editor-overview-label span") || {}).textContent || "",
        standing: overview.innerText,
        cells: document.querySelectorAll(".editor-overview-cell").length,
        marks: marks,
        counts: counts,
        warnings: warnings,
        tagColor: tagCs && tagCs.color,
        tagBg: tagCs && tagCs.backgroundColor,
        tagBorder: tagCs && tagCs.borderTopColor,
        hint: document.getElementById("overviewHint").textContent,
      };
    });
  }

  function assertMarks(info, label) {
    if (info.hidden) fail(label + ": overview hidden");
    if (Math.abs(info.trackH - 44) > 1) fail(label + ": track height " + info.trackH);
    if (info.standing.includes("拖谱面") || info.standing.includes("金色叹号")) {
      fail(label + ": standing explanation on the overview");
    }
    const seen = Object.create(null);
    info.marks.forEach((mark) => {
      if (mark.text !== "!") fail(label + ": mark text " + JSON.stringify(mark.text));
      if (seen[mark.measure]) fail(label + ": measure " + mark.measure + " has more than one mark");
      seen[mark.measure] = true;
      if (!mark.centerInCell) fail(label + ": mark " + mark.measure + " is not centered in its cell");
      if (mark.hitsNumber) fail(label + ": mark covers measure number " + mark.number);
      if (!mark.belowNumber) fail(label + ": mark is not below measure number " + mark.number);
      if (mark.w < 6 || mark.h < 8) fail(label + ": mark too small " + mark.w + "x" + mark.h);
      if (mark.w > 18 || mark.h > 16) fail(label + ": mark too large " + mark.w + "x" + mark.h);
    });
    const want = Object.keys(info.counts).sort();
    const got = Object.keys(seen).sort();
    if (want.join(",") !== got.join(",")) {
      fail(label + ": marks " + got.join(",") + " != uncertain measures " + want.join(","));
    }
    return seen;
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:" + port + "/index.html?editor=1", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await page.waitForFunction(() => window.BachiApp && window.BachiEditor, { timeout: 15000 });

    await loadChart(page, CLEAN_TJA, 6);
    const clean = await readOverview(page);
    if (clean.marks.length) fail("clean chart shows " + clean.marks.length + " marks");
    if (Object.keys(clean.counts).length) fail("clean chart has warnings " + JSON.stringify(clean.warnings));
    assertMarks(clean, "clean");
    if (clean.cells !== 6) fail("clean cells " + clean.cells);

    await loadChart(page, UNCERTAIN_TJA, 5);
    const marked = await readOverview(page);
    assertMarks(marked, "uncertain");
    if (marked.cells !== 5) fail("uncertain cells " + marked.cells);
    if (marked.counts["1"] !== 3) fail("measure 1 uncertain notes " + marked.counts["1"]);
    if (marked.counts["3"] < 3) fail("measure 3 should hold several uncertain notes, got " + marked.counts["3"]);
    if (marked.marks.filter((m) => m.measure === "3").length !== 1) fail("dense measure has more than one mark");
    if (!marked.counts["4"]) fail("spill into measure 4 was not flagged");
    if (marked.counts["2"] || marked.counts["5"]) fail("clean measures were flagged " + JSON.stringify(marked.counts));
    if (!marked.tagColor) fail("page has no 拿不准 tag to match");
    marked.marks.forEach((mark) => {
      if (mark.color !== marked.tagColor || mark.bg !== marked.tagBg || mark.border !== marked.tagBorder) {
        fail("mark gold " + [mark.color, mark.bg, mark.border].join(" / ") +
          " != 拿不准 " + [marked.tagColor, marked.tagBg, marked.tagBorder].join(" / "));
      }
    });
    if (!marked.hint.includes("金色叹号")) fail("overview hint does not mention the mark");
    if (marked.hint.includes("\u5495") || marked.hint.includes("\u5503") || marked.hint.includes("\u549e")) {
      fail("overview hint uses a forbidden syllable");
    }

    await page.setViewport({ width: 390, height: 780, deviceScaleFactor: 1 });
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    const narrow = await readOverview(page);
    assertMarks(narrow, "narrow");
    if (narrow.marks.length < 2) fail("narrow overview lost marks");

    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    const hit = await page.evaluate(() => {
      const mark = document.querySelector(".editor-overview-mark");
      const r = mark.getBoundingClientRect();
      const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return {
        blocked: !!(top && top.closest && top.closest(".editor-overview-mark")),
      };
    });
    if (hit.blocked) fail("mark intercepts overview clicks");
    await page.evaluate(() => { document.getElementById("editorScroll").scrollLeft = 0; });
    const beforeJump = await page.evaluate(() => document.getElementById("editorScroll").scrollLeft);
    const jumpAt = await page.evaluate(() => {
      const track = document.getElementById("editorOverviewTrack").getBoundingClientRect();
      return { x: track.right - 24, y: track.top + track.height / 2 };
    });
    await page.mouse.click(jumpAt.x, jumpAt.y);
    const afterJump = await page.evaluate(() => document.getElementById("editorScroll").scrollLeft);
    if (afterJump < beforeJump + 80) fail("overview click did not jump the chart: " + afterJump);

    const onlyMeasure1 = await page.evaluate(() => {
      const notes = window.BachiEditor.getState().rawNotes;
      const warnings = window.BachiEditor.getResolved().warnings;
      return warnings.find((w) => {
        const measures = {};
        for (let i = w[0]; i <= w[1]; i++) measures[notes[i].measure] = true;
        return Object.keys(measures).join(",") === "1";
      });
    });
    if (!onlyMeasure1) fail("could not find the measure-1 warning");
    await page.evaluate((range) => {
      window.BachiEditor.selectRange(range[0], range[1]);
      document.querySelector('#editorRangePop [data-ed-action="roll"]').click();
    }, onlyMeasure1);
    const clearedOne = await readOverview(page);
    assertMarks(clearedOne, "cleared measure 1");
    if (clearedOne.counts["1"]) fail("measure 1 still 待确认 after 滚奏");
    if (!clearedOne.counts["3"]) fail("other measures lost their flag");
    if (clearedOne.marks.some((m) => m.measure === "1")) fail("measure 1 mark stayed after the flag cleared");

    await page.evaluate((range) => {
      window.BachiEditor.selectRange(range[0], range[1]);
      document.querySelector('#editorRangePop [data-ed-action="restore"]').click();
    }, onlyMeasure1);
    const restored = await readOverview(page);
    assertMarks(restored, "restored measure 1");
    if (restored.counts["1"] !== 3) fail("restore did not bring measure 1 back");
    if (!restored.marks.some((m) => m.measure === "1")) fail("measure 1 mark did not return");

    const ranges = restored.warnings.map((w) => [w[0], w[1]]);
    for (const range of ranges) {
      await page.evaluate((item) => {
        window.BachiEditor.selectRange(item[0], item[1]);
        document.querySelector('#editorRangePop [data-ed-action="roll"]').click();
      }, range);
    }
    const none = await readOverview(page);
    if (none.marks.length) fail("marks left after every 待确认 range was confirmed: " + none.marks.map((m) => m.measure).join(","));
    if (Object.keys(none.counts).length) fail("warnings left after confirm " + JSON.stringify(none.warnings));
    assertMarks(none, "all clear");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  if (fails.length) {
    console.error("FAIL overview marks\n" + fails.join("\n"));
    process.exit(1);
  }
  console.log("ok: overview marks one gold ! per 待确认 measure");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
