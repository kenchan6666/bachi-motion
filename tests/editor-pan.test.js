/**
 * Editor panning: measure overview, hidden scrollbar, empty-track drag,
 * wheel pan, measure jump, and zoomed-string pan. Explanation copy lives
 * in the ! popover.
 * In 全部谱面, a click must not scroll; only a hold-drag or the wheel may.
 *
 *   node tests/editor-pan.test.js
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

function buildLongTja() {
  const bars = [];
  for (let i = 1; i <= 48; i++) {
    if (i === 20) bars.push("1111000000000000,");
    else bars.push("1000100010001000,");
  }
  return [
    "TITLE:换行平移",
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

function buildTja() {
  const bars = [];
  for (let i = 1; i <= 14; i++) {
    if (i === 2) bars.push("1111000000000000,");
    else if (i === 8) bars.push("111111111111111111111111,");
    else bars.push("1000100010001000,");
  }
  return [
    "TITLE:平移测试",
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

function assertNear(fails, id, pop, btn) {
  const gap = 10;
  const below = Math.abs(pop.y - (btn.bottom + gap));
  const above = Math.abs(pop.bottom + gap - btn.top);
  const vertical = Math.min(below, above);
  const coversX = pop.x < btn.x + btn.w && pop.x + pop.w > btn.x;
  if (pop.x < 40 || pop.y < 40) fails.push(id + " stuck at viewport origin " + JSON.stringify(pop));
  if (vertical > 2) fails.push(id + " not beside button (vertical " + vertical.toFixed(1) + ")");
  if (!coversX) fails.push(id + " does not overlap the ! button horizontally");
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
  const fail = (msg) => fails.push(msg);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:" + port + "/index.html?editor=1", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await page.waitForFunction(() => window.BachiApp && window.BachiEditor, { timeout: 15000 });
    await page.evaluate((tja) => {
      window.BachiApp.setTja(tja);
      window.BachiApp.setMode("zhuren");
      window.BachiEditor.open();
      window.BachiApp.generate(false);
    }, buildTja());
    await page.waitForFunction(() => document.querySelectorAll("#editorMeasures .editor-measure").length >= 14, { timeout: 10000 });

    const layout = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll");
      const track = document.getElementById("editorOverviewTrack");
      const win = document.getElementById("editorOverviewWindow");
      const overview = document.getElementById("editorOverview");
      const label = document.querySelector(".editor-overview-label span");
      const hint = document.getElementById("overviewHint");
      const chartHint = document.getElementById("editorChartHint");
      const cs = getComputedStyle(scroll);
      const border = getComputedStyle(win).borderTopColor;
      const rgb = border.match(/\d+/g) || ["0", "0", "0"];
      return {
        measures: document.querySelectorAll("#editorMeasures .editor-measure").length,
        strings: document.querySelectorAll("#editorMeasures .editor-string").length,
        scrollbarWidth: cs.scrollbarWidth,
        gutter: scroll.offsetHeight - scroll.clientHeight,
        scrollW: scroll.scrollWidth,
        clientW: scroll.clientWidth,
        overviewHidden: overview.hidden,
        label: label ? label.textContent.trim() : "",
        overviewText: overview.innerText,
        chartHint: chartHint ? chartHint.textContent : "",
        hintOpen: hint.matches(":popover-open"),
        hintH: hint.getBoundingClientRect().height,
        trackH: track.getBoundingClientRect().height,
        winH: win.getBoundingClientRect().height,
        winW: win.getBoundingClientRect().width,
        border: rgb.map(Number),
        cells: document.querySelectorAll(".editor-overview-cell").length,
      };
    });

    if (layout.measures < 14) fail("expected 14 measures, got " + layout.measures);
    if (layout.strings < 2) fail("expected a short string and a long string, got " + layout.strings);
    if (layout.scrollbarWidth !== "none") fail("scrollbar-width is " + layout.scrollbarWidth);
    if (layout.gutter > 2) fail("horizontal scrollbar still takes " + layout.gutter + "px");
    if (!(layout.scrollW > layout.clientW + 80)) fail("chart does not overflow: " + layout.scrollW + " vs " + layout.clientW);
    if (layout.overviewHidden) fail("overview is hidden");
    if (layout.label !== "小节总览") fail("overview label is " + JSON.stringify(layout.label));
    if (layout.overviewText.includes("滚轮") || layout.overviewText.includes("拖谱面")) fail("overview shows standing explanation: " + layout.overviewText);
    if (layout.chartHint.includes("小节总览") || layout.chartHint.includes("滚轮")) fail("chart hint gained pan copy: " + layout.chartHint);
    if (layout.hintOpen || layout.hintH > 2) fail("explanation popover is standing text");
    if (layout.trackH < 40) fail("overview track is only " + layout.trackH + "px tall");
    if (layout.winH < 32) fail("overview window is only " + layout.winH + "px tall");
    if (layout.winW < 48) fail("overview window is only " + layout.winW + "px wide");
    if (layout.cells !== 14) fail("overview cells " + layout.cells);
    if (!(layout.border[2] < layout.border[0])) fail("overview window uses a purple border " + layout.border.join(","));

    async function metrics() {
      return page.evaluate(() => {
        const scroll = document.getElementById("editorScroll");
        const track = document.getElementById("editorOverviewTrack");
        const win = document.getElementById("editorOverviewWindow");
        const max = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
        const travel = Math.max(0, track.clientWidth - win.offsetWidth);
        const expectedLeft = max > 0 && travel > 0 ? (scroll.scrollLeft / max) * travel : 0;
        const st = window.BachiEditor.getState();
        return {
          scrollLeft: scroll.scrollLeft,
          max: max,
          winLeft: win.offsetLeft,
          winW: win.offsetWidth,
          expectedLeft: expectedLeft,
          panX: st.expanded ? st.expanded.panX : null,
          zoom: !!(document.querySelector(".editor-zoom") && !document.querySelector(".editor-zoom").hidden),
          swap: !document.getElementById("editorSwapPop").hidden,
          range: !document.getElementById("editorRangePop").hidden,
        };
      });
    }

    function synced(m) {
      if (Math.abs(m.winLeft - m.expectedLeft) > 2) {
        fail("overview window left " + m.winLeft.toFixed(1) + " != " + m.expectedLeft.toFixed(1));
      }
    }

    async function reset() {
      await page.keyboard.press("Escape");
      await page.evaluate(() => {
        const scroll = document.getElementById("editorScroll");
        scroll.scrollLeft = 0;
        scroll.dispatchEvent(new Event("scroll"));
      });
    }

    async function drag(x1, y1, x2, y2) {
      await page.mouse.move(x1, y1);
      await page.mouse.down();
      await page.mouse.move(x2, y2, { steps: 8 });
      await page.mouse.up();
    }

    await reset();
    const lane = await page.evaluate(() => {
      const measure = document.querySelector('.editor-measure[data-index="1"]');
      const rect = measure.querySelector(".editor-lane").getBoundingClientRect();
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const y = rect.top + 8;
      const x1 = Math.min(rect.right - 24, scroll.right - 24);
      const x0 = x1 - 150;
      const el = document.elementFromPoint(x1, y);
      return {
        x0: x0, y: y, x1: x1,
        empty: !!(el && el.closest(".editor-lane") && !el.closest(".editor-note, .editor-zoom, .editor-string")),
      };
    });
    if (!lane.empty) fail("lane drag point is not empty track");
    const beforeDrag = await metrics();
    await drag(lane.x1, lane.y, lane.x0, lane.y);
    const afterDrag = await metrics();
    const dragged = afterDrag.scrollLeft - beforeDrag.scrollLeft;
    if (dragged < 110 || dragged > 190) fail("empty-track drag scrolled " + dragged.toFixed(1) + "px, want about 150");
    synced(afterDrag);
    if (afterDrag.zoom) fail("empty-track drag opened the zoom card");

    await reset();
    const wheelPt = await page.evaluate(() => {
      const rect = document.querySelector('.editor-measure[data-index="1"] .editor-lane').getBoundingClientRect();
      return { x: rect.left + 80, y: rect.top + 8 };
    });
    await page.mouse.move(wheelPt.x, wheelPt.y);
    await page.mouse.wheel({ deltaY: 320 });
    const afterWheel = await metrics();
    if (afterWheel.scrollLeft < 200) fail("wheel pan only moved " + afterWheel.scrollLeft.toFixed(1) + "px");
    synced(afterWheel);

    await reset();
    const overviewClick = await page.evaluate(() => {
      const track = document.getElementById("editorOverviewTrack").getBoundingClientRect();
      return { x: track.right - 8, y: track.top + track.height / 2 };
    });
    await page.mouse.click(overviewClick.x, overviewClick.y);
    const afterOverviewClick = await metrics();
    if (afterOverviewClick.scrollLeft < afterOverviewClick.max * 0.65) {
      fail("overview click did not jump toward the end: " + afterOverviewClick.scrollLeft.toFixed(1) + " / " + afterOverviewClick.max.toFixed(1));
    }
    synced(afterOverviewClick);

    await reset();
    const overviewDrag = await page.evaluate(() => {
      const win = document.getElementById("editorOverviewWindow").getBoundingClientRect();
      return { x: win.left + win.width / 2, y: win.top + win.height / 2, w: win.width };
    });
    await drag(overviewDrag.x, overviewDrag.y, overviewDrag.x + 180, overviewDrag.y);
    const afterOverviewDrag = await metrics();
    if (afterOverviewDrag.scrollLeft < 80) fail("overview drag only moved " + afterOverviewDrag.scrollLeft.toFixed(1) + "px");
    if (afterOverviewDrag.winLeft <= 8) fail("overview window did not move");
    synced(afterOverviewDrag);

    await reset();
    const bar = await page.evaluate(() => {
      const el = document.querySelector('.editor-measure[data-index="3"] .editor-barnum');
      const r = el.getBoundingClientRect();
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const x = Math.min(Math.max(r.left + 12, scroll.left + 4), Math.min(r.right - 4, scroll.right - 8));
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x: x, y: y, onBar: !!(hit && hit.closest(".editor-barnum")) };
    });
    if (!bar.onBar) fail("measure number is not clickable");
    await page.mouse.click(bar.x, bar.y);
    const afterBar = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const measure = document.querySelector('.editor-measure[data-index="3"]').getBoundingClientRect();
      return { gap: measure.left - scroll.left, zoom: !!(document.querySelector(".editor-zoom") && !document.querySelector(".editor-zoom").hidden) };
    });
    if (Math.abs(afterBar.gap) > 6) fail("measure number jump left gap " + afterBar.gap.toFixed(1));
    if (afterBar.zoom) fail("measure number click opened a zoom card");
    synced(await metrics());

    await reset();
    const empty = await page.evaluate(() => {
      const measure = document.querySelector('.editor-measure[data-index="2"]');
      const rect = measure.querySelector(".editor-lane").getBoundingClientRect();
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const y = rect.top + 8;
      let x = null;
      const right = Math.min(rect.right - 4, scroll.right - 4);
      for (let px = Math.max(rect.left + 4, scroll.left + 4); px < right; px += 10) {
        const el = document.elementFromPoint(px, y);
        if (el && el.closest(".editor-lane") && !el.closest(".editor-note, .editor-string, .editor-zoom, .editor-barnum")) {
          x = px;
          break;
        }
      }
      return { x: x, y: y };
    });
    if (empty.x == null) fail("no empty point inside measure 2");
    await page.mouse.click(empty.x, empty.y);
    const afterEmpty = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const measure = document.querySelector('.editor-measure[data-index="2"]').getBoundingClientRect();
      const zoom = document.querySelector(".editor-zoom");
      return {
        gap: measure.left - scroll.left,
        zoom: !!(zoom && !zoom.hidden),
      };
    });
    if (Math.abs(afterEmpty.gap) > 6) fail("empty-space jump left gap " + afterEmpty.gap.toFixed(1));
    if (afterEmpty.zoom) fail("empty space inside a measure stole the 密串 click");
    synced(await metrics());

    await reset();
    const note = await page.evaluate(() => {
      const el = document.querySelector('#editorMeasures .editor-measure[data-index="1"] .editor-note');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const scrollBeforeNote = (await metrics()).scrollLeft;
    const handBefore = await page.evaluate(() => {
      const el = document.querySelector('#editorMeasures .editor-measure[data-index="1"] .editor-note');
      const index = +el.dataset.index;
      return { index: index, hand: window.BachiEditor.getResolved().hands[index] };
    });
    await page.mouse.click(note.x, note.y);
    const afterNote = await metrics();
    const flipped = await page.evaluate((index) => {
      const st = window.BachiEditor.getState();
      return {
        hand: window.BachiEditor.getResolved().hands[index],
        selection: st.selection,
        playing: !!(window.taikoAnim && window.taikoAnim.state && window.taikoAnim.state.playing),
      };
    }, handBefore.index);
    if (afterNote.swap) fail("clicking a note opened the hand-swap popup");
    if (flipped.hand === handBefore.hand) fail("clicking a note did not swap the hand");
    if (!flipped.selection || flipped.selection.type !== "note" || flipped.selection.index !== handBefore.index) {
      fail("clicking a note did not keep that note selected");
    }
    if (flipped.playing) fail("clicking a note started playback");
    if (Math.abs(afterNote.scrollLeft - scrollBeforeNote) > 2) fail("clicking a note panned the chart");
    if (afterNote.zoom) fail("clicking a single note opened the zoom card");

    await reset();
    const pair = await page.evaluate(() => {
      const notes = [...document.querySelectorAll('#editorMeasures .editor-measure[data-index="1"] .editor-note')];
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      return { a: box(notes[0]), b: box(notes[2]) };
    });
    await drag(pair.a.x, pair.a.y, pair.b.x, pair.b.y);
    const afterRange = await metrics();
    if (!afterRange.range) fail("drag-select did not show the track actions");
    const rangeLabels = await page.evaluate(() => {
      return [...document.querySelectorAll("#editorRangePop button")].map((b) => b.textContent.trim()).join(",");
    });
    if (rangeLabels !== "1-2,2-1,2-2,循环试听") fail("drag-select actions are " + rangeLabels);
    if (afterRange.scrollLeft > 30) fail("drag-select panned the chart by " + afterRange.scrollLeft.toFixed(1));

    await reset();
    const shortString = await page.evaluate(() => {
      const el = document.querySelector('.editor-measure[data-index="2"] .editor-string');
      const r = el.getBoundingClientRect();
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const x = Math.min(Math.max(r.left + 8, scroll.left + 4), Math.min(r.right - 8, scroll.right - 8));
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x: x, y: y, onString: !!(hit && hit.closest(".editor-string")) };
    });
    if (!shortString.onString) fail("short 密串 is not clickable");
    await page.mouse.click(shortString.x, shortString.y);
    const afterShort = await metrics();
    if (!afterShort.zoom) fail("clicking a 密串 did not zoom");
    if (afterShort.scrollLeft > 24) fail("clicking a 密串 jumped the viewport");

    const visible = await page.evaluate(() => {
      const notes = [...document.querySelectorAll("#editorMeasures .editor-note")];
      const out = [];
      for (const n of notes) {
        const r = n.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const el = document.elementFromPoint(x, y);
        if (el && el.closest("#editorMeasures .editor-note") === n) out.push({ x: x, y: y, index: +n.dataset.index });
      }
      return out;
    });
    if (visible.length < 1) fail("zoomed view covered every main-chart note");
    const panWhileClick = (await metrics()).panX;
    const scrollWhileClick = (await metrics()).scrollLeft;
    await page.mouse.click(visible[0].x, visible[0].y);
    const afterZoomNote = await metrics();
    if (!afterZoomNote.swap && !afterZoomNote.zoom) fail("main-chart note click did nothing while zoomed");
    if (Math.abs(afterZoomNote.scrollLeft - scrollWhileClick) > 2) fail("main-chart note click panned while zoomed");
    if (afterZoomNote.panX != null && panWhileClick != null && Math.abs(afterZoomNote.panX - panWhileClick) > 0.5) {
      fail("main-chart note click changed zoom pan");
    }

    if (visible.length >= 2) {
      await page.keyboard.press("Escape");
      await page.evaluate(() => { document.getElementById("editorSwapPop").hidden = true; });
      await page.mouse.click(shortString.x, shortString.y);
      const again = await page.evaluate(() => {
        const notes = [...document.querySelectorAll("#editorMeasures .editor-note")];
        const out = [];
        for (const n of notes) {
          const r = n.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          const el = document.elementFromPoint(x, y);
          if (el && el.closest("#editorMeasures .editor-note") === n) out.push({ x: x, y: y });
        }
        return out;
      });
      if (again.length >= 2) {
        const scrollAt = (await metrics()).scrollLeft;
        await drag(again[0].x, again[0].y, again[1].x, again[1].y);
        const ranged = await metrics();
        if (!ranged.range) fail("drag-select failed while the zoom card is open");
        if (Math.abs(ranged.scrollLeft - scrollAt) > 8) fail("drag-select panned while zoomed");
      }
    }

    const chartWheel = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const lanes = [...document.querySelectorAll("#editorMeasures .editor-lane")];
      for (const laneEl of lanes) {
        const r = laneEl.getBoundingClientRect();
        const y = r.top + 8;
        const right = Math.min(r.right - 4, scroll.right - 4);
        for (let x = Math.max(r.left + 4, scroll.left + 4); x < right; x += 14) {
          const el = document.elementFromPoint(x, y);
          if (el && el.closest(".editor-lane") && !el.closest(".editor-zoom, .editor-note, .editor-string")) return { x: x, y: y };
        }
      }
      return null;
    });
    if (!chartWheel) fail("no empty chart point beside the zoom card");
    else {
      const before = await metrics();
      await page.mouse.move(chartWheel.x, chartWheel.y);
      await page.mouse.wheel({ deltaY: 240 });
      const after = await metrics();
      if (after.scrollLeft < before.scrollLeft + 120) fail("wheel beside the zoom card did not pan the chart");
      if (before.panX != null && after.panX != null && Math.abs(after.panX - before.panX) > 0.5) {
        fail("wheel beside the zoom card panned inside the card");
      }
      synced(after);
    }

    await reset();
    const longJump = await page.evaluate(() => {
      const cell = document.querySelector('.editor-overview-cell[data-index="8"]');
      const r = cell.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(longJump.x, longJump.y);
    const longString = await page.evaluate(() => {
      const el = document.querySelector('.editor-measure[data-index="8"] .editor-string');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const x = Math.min(Math.max(r.left + 16, scroll.left + 8), Math.min(r.right - 16, scroll.right - 8));
      const y = r.top + r.height / 2;
      if (x < scroll.left || x > scroll.right) return null;
      const hit = document.elementFromPoint(x, y);
      return { x: x, y: y, onString: !!(hit && hit.closest(".editor-string")) };
    });
    if (!longString || !longString.onString) fail("long 密串 is not on screen after overview jump");
    else {
      await page.mouse.click(longString.x, longString.y);
      const opened = await metrics();
      if (!opened.zoom) fail("long 密串 did not zoom");
      const room = await page.evaluate(() => {
        const st = window.BachiEditor.getState();
        const inner = document.querySelector(".editor-zoom-inner");
        const view = document.querySelector(".editor-zoom-viewport");
        const viewW = Math.max(0, view.clientWidth - 24);
        const min = viewW - inner.scrollWidth;
        return { pan: st.expanded.panX, min: min, viewW: viewW, inner: inner.scrollWidth };
      });
      if (!(room.inner > room.viewW + 40)) fail("long zoom does not overflow: inner " + room.inner + " view " + room.viewW);
      const viewBox = await page.evaluate(() => {
        const r = document.querySelector(".editor-zoom-viewport").getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 4, left: r.left, right: r.right };
      });
      const pan0 = (await metrics()).panX;
      if (pan0 > room.min + 50) {
        await drag(viewBox.x, viewBox.y, viewBox.x - 90, viewBox.y);
      } else {
        await drag(viewBox.x, viewBox.y, viewBox.x + 90, viewBox.y);
      }
      const afterZoomDrag = await metrics();
      if (afterZoomDrag.panX == null || Math.abs(afterZoomDrag.panX - pan0) < 30) {
        fail("zoom background drag did not pan (" + pan0 + " → " + afterZoomDrag.panX + ")");
      }
      if (!afterZoomDrag.zoom) fail("zoom background drag closed the card");

      const pan1 = afterZoomDrag.panX;
      await page.mouse.move(viewBox.x, viewBox.y);
      await page.mouse.wheel({ deltaY: pan1 > room.min + 80 ? 160 : -160 });
      const afterZoomWheel = await metrics();
      if (afterZoomWheel.panX == null || Math.abs(afterZoomWheel.panX - pan1) < 30) {
        fail("zoom wheel did not pan (" + pan1 + " → " + afterZoomWheel.panX + ")");
      }

      const zoomNote = await page.evaluate(() => {
        const view = document.querySelector(".editor-zoom-viewport").getBoundingClientRect();
        const notes = [...document.querySelectorAll(".editor-zoom .editor-note")];
        for (const el of notes) {
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          if (x < view.left + 6 || x > view.right - 6 || y < view.top + 2 || y > view.bottom - 2) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && hit.closest(".editor-zoom .editor-note") === el) return { x: x, y: y };
        }
        return null;
      });
      if (!zoomNote) fail("zoom note is off screen");
      else {
        const panBefore = (await metrics()).panX;
        const zoomHand = await page.evaluate((pt) => {
          const hit = document.elementFromPoint(pt.x, pt.y);
          const el = hit && hit.closest(".editor-zoom .editor-note");
          const index = el ? +el.dataset.index : -1;
          return { index: index, hand: index >= 0 ? window.BachiEditor.getResolved().hands[index] : "" };
        }, zoomNote);
        await page.mouse.click(zoomNote.x, zoomNote.y);
        const swapped = await metrics();
        const zoomAfter = await page.evaluate((index) => {
          return index >= 0 ? window.BachiEditor.getResolved().hands[index] : "";
        }, zoomHand.index);
        if (swapped.swap) fail("zoom note click opened the hand-swap popup");
        if (!zoomAfter || zoomAfter === zoomHand.hand) fail("zoom note click did not swap the hand");
        if (Math.abs(swapped.panX - panBefore) > 0.5) fail("zoom note click changed pan");
        if (!swapped.zoom) fail("zoom note click closed the card");
        await page.evaluate(() => { document.getElementById("editorSwapPop").hidden = true; });
        const panBeforeDrag = (await metrics()).panX;
        await drag(zoomNote.x, zoomNote.y, zoomNote.x + 36, zoomNote.y);
        const noteDrag = await metrics();
        if (Math.abs(noteDrag.panX - panBeforeDrag) > 0.5) fail("dragging a zoom note panned the card");
        if (!noteDrag.zoom) fail("dragging a zoom note closed the card");
      }
    }

    await page.setViewport({ width: 1100, height: 820, deviceScaleFactor: 1 });
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    const resized = await metrics();
    synced(resized);
    if (resized.winW < 48) fail("resized overview window is only " + resized.winW + "px");

    await page.evaluate(() => {
      const pop = document.getElementById("overviewHint");
      if (pop.matches(":popover-open")) pop.hidePopover();
    });
    await page.click("#overviewHintBtn");
    const hinted = await page.evaluate(() => {
      const pop = document.getElementById("overviewHint");
      const btn = document.getElementById("overviewHintBtn");
      const box = (rect) => ({
        x: rect.x, y: rect.y, w: rect.width, h: rect.height,
        bottom: rect.bottom, top: rect.top,
      });
      return {
        pop: box(pop.getBoundingClientRect()),
        btn: box(btn.getBoundingClientRect()),
        open: pop.matches(":popover-open"),
        text: pop.textContent,
      };
    });
    if (!hinted.open) fail("overview hint did not open");
    if (!hinted.text.includes("小节") || !hinted.text.includes("滚轮")) fail("overview hint missing explanation");
    if (hinted.text.includes("咕")) fail("overview hint uses 咕");
    assertNear(fails, "overviewHint", hinted.pop, hinted.btn);

    // 全部谱面: a click must not move the wrapped view. Hold-drag and the
    // wheel still scroll vertically. The chart is long enough to scroll.
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.evaluate((tja) => {
      window.BachiApp.setTja(tja);
      window.BachiApp.setMode("zhuren");
      window.BachiApp.generate(false);
    }, buildLongTja());
    await page.waitForFunction(() => document.querySelectorAll("#editorMeasures .editor-measure").length >= 48, { timeout: 10000 });
    const wrapChecks = await page.evaluate(() => ({
      full: document.getElementById("editorFullChart").checked,
      split: document.getElementById("editorSplitMeasures").checked,
    }));
    if (!wrapChecks.full) await page.click("#editorFullChart");
    if (!wrapChecks.split) await page.click("#editorSplitMeasures");
    await page.waitForFunction(() => {
      const root = document.getElementById("editor");
      return root.classList.contains("is-full-chart") && !root.classList.contains("is-continuous");
    }, { timeout: 5000 });

    async function wrapScroll() {
      return page.evaluate(() => {
        const scroll = document.getElementById("editorScroll");
        const anim = window.taikoAnim.state;
        return {
          top: scroll.scrollTop,
          left: scroll.scrollLeft,
          max: Math.max(0, scroll.scrollHeight - scroll.clientHeight),
          now: anim.now,
          end: anim.end,
          playing: !!anim.playing,
        };
      });
    }

    const wrapRoom = await wrapScroll();
    if (wrapRoom.max < 500) fail("全部谱面 fixture only scrolls " + wrapRoom.max.toFixed(0) + "px");

    async function park(top) {
      await page.evaluate((y) => {
        const scroll = document.getElementById("editorScroll");
        scroll.scrollTop = y;
        scroll.scrollLeft = 0;
      }, top);
    }

    function sameView(before, after, label) {
      if (Math.abs(after.top - before.top) > 2) {
        fail(label + " changed scrollTop " + before.top.toFixed(1) + " → " + after.top.toFixed(1));
      }
      if (Math.abs(after.left - before.left) > 2) {
        fail(label + " changed scrollLeft " + before.left.toFixed(1) + " → " + after.left.toFixed(1));
      }
      if (after.playing) fail(label + " started playback");
    }

    async function stayed(after, label) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      const later = await wrapScroll();
      sameView(after, later, label + " kept scrolling");
    }

    await park(720);
    const lanePt = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const lanes = [...document.querySelectorAll("#editorMeasures .editor-lane")];
      for (const laneEl of lanes) {
        const r = laneEl.getBoundingClientRect();
        if (r.top < scroll.top + 30 || r.bottom > scroll.bottom - 8) continue;
        const y = r.top + r.height / 2;
        const x = r.left + 3;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !hit.closest(".editor-lane") || hit.closest(".editor-note, .editor-string, .editor-barnum, button")) continue;
        const measure = hit.closest(".editor-measure");
        return { x: x, y: y, index: measure ? +measure.dataset.index : 0 };
      }
      return null;
    });
    if (!lanePt) fail("no empty left-edge lane in 全部谱面");
    else {
      const before = await wrapScroll();
      await page.mouse.click(lanePt.x, lanePt.y);
      const after = await wrapScroll();
      sameView(before, after, "全部谱面 empty-lane click");
      const measureT = await page.evaluate((index) => {
        const measures = window.BachiEditor.getState().measures || [];
        const m = measures.find((it) => it.index === index);
        return m ? { t: m.t, dur: m.duration || 0 } : null;
      }, lanePt.index);
      if (measureT && (after.now < measureT.t - 0.05 || after.now > measureT.t + measureT.dur + 0.05)) {
        fail("全部谱面 empty-lane click seeked outside measure " + lanePt.index + " (" + after.now.toFixed(2) + ")");
      }
      if (after.now > after.end - 1) fail("全部谱面 empty-lane click seeked to the end");
      await stayed(after, "全部谱面 empty-lane click");
    }

    await park(720);
    const handsPt = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const hands = [...document.querySelectorAll("#editorMeasures .editor-hands")];
      for (const el of hands) {
        const r = el.getBoundingClientRect();
        if (r.top < scroll.top + 8 || r.bottom > scroll.bottom - 4) continue;
        const y = r.top + r.height / 2;
        for (let x = r.left + 8; x < r.right - 8; x += 16) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || !hit.closest(".editor-hands") || hit.closest(".editor-string, .editor-note, button")) continue;
          return { x: x, y: y };
        }
      }
      return null;
    });
    if (!handsPt) fail("no empty hands point in 全部谱面");
    else {
      const before = await wrapScroll();
      await page.mouse.click(handsPt.x, handsPt.y);
      const after = await wrapScroll();
      sameView(before, after, "全部谱面 empty-track click");
      await stayed(after, "全部谱面 empty-track click");
    }

    await park(720);
    const barPt = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const bars = [...document.querySelectorAll("#editorMeasures .editor-barnum")];
      for (const el of bars) {
        const r = el.getBoundingClientRect();
        const x = r.left + 14;
        const y = r.top + r.height / 2;
        if (y < scroll.top + 4 || y > scroll.bottom - 4 || x < scroll.left || x > scroll.right) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && hit.closest(".editor-barnum")) return { x: x, y: y };
      }
      return null;
    });
    if (!barPt) fail("no measure number in 全部谱面");
    else {
      const before = await wrapScroll();
      await page.mouse.click(barPt.x, barPt.y);
      const after = await wrapScroll();
      sameView(before, after, "全部谱面 measure-number click");
      await stayed(after, "全部谱面 measure-number click");
    }

    await park(720);
    const gutterPt = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll");
      const port = scroll.getBoundingClientRect();
      const x = port.right - 10;
      for (let y = port.top + 40; y < port.bottom - 20; y += 18) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !scroll.contains(hit) || hit.closest(".editor-measure, .editor-note, button")) continue;
        return { x: x, y: y };
      }
      return null;
    });
    if (!gutterPt) fail("no empty gutter in 全部谱面");
    else {
      const before = await wrapScroll();
      await page.mouse.click(gutterPt.x, gutterPt.y);
      const after = await wrapScroll();
      sameView(before, after, "全部谱面 gutter click");
      if (Math.abs(after.now - before.now) > 0.05) {
        fail("全部谱面 gutter click yanked 播放位置 " + before.now.toFixed(2) + " → " + after.now.toFixed(2));
      }
      await stayed(after, "全部谱面 gutter click");
    }

    await park(0);
    const dragPt = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const lanes = [...document.querySelectorAll("#editorMeasures .editor-lane")];
      for (const laneEl of lanes) {
        const r = laneEl.getBoundingClientRect();
        if (r.top < scroll.top + 180 || r.bottom > scroll.bottom - 8) continue;
        const y = r.top + 10;
        const x = Math.min(r.right - 30, scroll.right - 30);
        const hit = document.elementFromPoint(x, y);
        if (hit && hit.closest(".editor-lane") && !hit.closest(".editor-note, .editor-string, button")) return { x: x, y: y };
      }
      return null;
    });
    if (!dragPt) fail("no empty lane to drag in 全部谱面");
    else {
      const before = await wrapScroll();
      await drag(dragPt.x, dragPt.y, dragPt.x, dragPt.y - 150);
      const after = await wrapScroll();
      const moved = after.top - before.top;
      if (moved < 110 || moved > 190) fail("全部谱面 hold-drag scrolled " + moved.toFixed(1) + "px, want about 150");
      if (Math.abs(after.left) > 2) fail("全部谱面 hold-drag changed scrollLeft");
    }

    await park(0);
    const wrapWheel = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const lanes = [...document.querySelectorAll("#editorMeasures .editor-lane")];
      for (const laneEl of lanes) {
        const r = laneEl.getBoundingClientRect();
        const y = r.top + 8;
        if (y < scroll.top + 8 || y > scroll.bottom - 8) continue;
        const x = r.left + 40;
        const hit = document.elementFromPoint(x, y);
        if (hit && hit.closest(".editor-lane") && !hit.closest(".editor-note, .editor-zoom")) return { x: x, y: y };
      }
      return null;
    });
    if (!wrapWheel) fail("no lane under the wheel in 全部谱面");
    else {
      await page.mouse.move(wrapWheel.x, wrapWheel.y);
      await page.mouse.wheel({ deltaY: 360 });
      await page.waitForFunction(() => document.getElementById("editorScroll").scrollTop > 120, { timeout: 2000 }).catch(() => {});
      const after = await wrapScroll();
      if (after.top < 120) fail("全部谱面 wheel only moved " + after.top.toFixed(1) + "px");
      if (Math.abs(after.left) > 2) fail("全部谱面 wheel changed scrollLeft");
    }

    await park(720);
    const gapPt = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const nodes = [...document.querySelectorAll("#editorMeasures .editor-measure")];
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i].getBoundingClientRect();
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j].getBoundingClientRect();
          if (Math.abs(a.left - b.left) > 6) continue;
          if (b.top < a.bottom + 6) continue;
          const x = a.left + Math.min(40, a.width / 2);
          const y = (a.bottom + b.top) / 2;
          if (y < scroll.top + 6 || y > scroll.bottom - 6) continue;
          const hit = document.elementFromPoint(x, y);
          if (!hit || hit.closest(".editor-measure, .editor-note, button")) continue;
          return { x: x, y: y };
        }
      }
      return null;
    });
    if (!gapPt) fail("no gap between wrapped rows");
    else {
      const before = await wrapScroll();
      await page.mouse.click(gapPt.x, gapPt.y);
      const after = await wrapScroll();
      sameView(before, after, "全部谱面 row-gap click");
      if (after.now > after.end - 1 && before.now < after.end - 5) {
        fail("全部谱面 row-gap click yanked 播放位置 to the end");
      }
      await stayed(after, "全部谱面 row-gap click");
    }

    await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll");
      const el = document.querySelector('#editorMeasures .editor-measure[data-index="20"]');
      if (!el) return;
      scroll.scrollTop += el.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 48;
      scroll.scrollLeft = 0;
    });
    const notePt = await page.evaluate(() => {
      const el = document.querySelector('#editorMeasures .editor-measure[data-index="20"] .editor-note');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (y < scroll.top || y > scroll.bottom) return null;
      return { x: x, y: y, index: +el.dataset.index, hand: window.BachiEditor.getResolved().hands[+el.dataset.index] };
    });
    if (!notePt) fail("全部谱面 note is off screen");
    else {
      const before = await wrapScroll();
      await page.mouse.click(notePt.x, notePt.y);
      const after = await wrapScroll();
      const flipped = await page.evaluate((index) => {
        const st = window.BachiEditor.getState();
        return {
          hand: window.BachiEditor.getResolved().hands[index],
          selection: st.selection,
          swap: !document.getElementById("editorSwapPop").hidden,
        };
      }, notePt.index);
      sameView(before, after, "全部谱面 note click");
      if (flipped.hand === notePt.hand) fail("全部谱面 note click did not swap L/R");
      if (flipped.swap) fail("全部谱面 note click showed the swap popup");
      if (!flipped.selection || flipped.selection.type !== "note" || flipped.selection.index !== notePt.index) {
        fail("全部谱面 note click did not keep that note selected");
      }
      await stayed(after, "全部谱面 note click");
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  if (fails.length) {
    console.error("FAIL editor pan\n" + fails.join("\n"));
    process.exit(1);
  }
  console.log("ok: editor overview, hidden scrollbar, measure jump, zoom pan");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
