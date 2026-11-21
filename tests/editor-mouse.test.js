/**
 * Mouse-first hand editing on the chart.
 *
 * Click a note swaps L/R immediately and keeps the selection.
 * Drag-select shows 1-2 / 2-1 / 2-2 / 循环试听 beside the selection.
 * Those brushes do not start playback. 循环试听 loops only the selection.
 * Arrows scroll the timeline. Notes, buttons, and other controls do not pan.
 * 分开小节 is off by default (one strip) and on restores separate measure cards.
 * Clicking a collapsed string still opens the zoom card.
 *
 *   node tests/editor-mouse.test.js
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

function buildTja() {
  const bars = [];
  for (let i = 1; i <= 10; i++) {
    bars.push(i === 1 ? "1111111100000000," : "1000000000000000,");
  }
  return [
    "TITLE:鼠标跟手",
    "BPM:300",
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

const SPLIT_HELP = "不勾选时，谱面是一条连续的轨道，小节之间不拆开。勾选后，按小节分成一张张卡片，方便看乐句。";

function overlaps(a, b) {
  return a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const chrome = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/local/bin/google-chrome";
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
    page.on("pageerror", (err) => fail("pageerror: " + err.message));
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:" + port + "/index.html?editor=1", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await page.waitForFunction(() => window.BachiApp && window.BachiEditor && window.taikoAnim, { timeout: 15000 });
    await page.evaluate((tja) => {
      window.BachiApp.setTja(tja);
      window.BachiApp.setMode("zhuren");
      window.BachiApp.setHandControl("R");
      window.BachiEditor.open();
      window.BachiApp.generate(false);
    }, buildTja());
    await page.waitForFunction(() => document.querySelectorAll("#editorMeasures .editor-note").length >= 8, { timeout: 10000 });

    async function drag(x1, y1, x2, y2) {
      await page.mouse.move(x1, y1);
      await page.mouse.down();
      await page.mouse.move(x2, y2, { steps: 8 });
      await page.mouse.up();
    }

    async function read() {
      return page.evaluate(() => {
        const scroll = document.getElementById("editorScroll");
        const st = window.BachiEditor.getState();
        const resolved = window.BachiEditor.getResolved();
        const pop = document.getElementById("editorRangePop");
        const swap = document.getElementById("editorSwapPop");
        const anim = window.taikoAnim.state;
        return {
          hands: resolved ? resolved.hands.slice() : [],
          pairs: resolved ? resolved.rollPairs.map((p) => p.join("-")) : [],
          selection: st.selection,
          scrollLeft: scroll.scrollLeft,
          playing: !!anim.playing,
          now: anim.now,
          loopStart: anim.loopStart,
          loopEnd: anim.loopEnd,
          section: window.taikoAnim.exportSection(),
          swapHidden: !swap || swap.hidden,
          rangeHidden: !pop || pop.hidden,
          labels: pop ? [...pop.querySelectorAll("button")].map((b) => b.textContent.trim()) : [],
          zoom: !!(document.querySelector(".editor-zoom") && !document.querySelector(".editor-zoom").hidden),
        };
      });
    }

    const chromeBox = await page.evaluate(() => {
      const card = document.querySelector(".editor-chart-card").getBoundingClientRect();
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const add = document.getElementById("editorAddNoteBtn").getBoundingClientRect();
      const split = document.querySelector("label[for='editorSplitMeasures'], #editorSplitMeasures");
      const splitLabel = document.getElementById("editorSplitMeasures").closest("label");
      const box = splitLabel.getBoundingClientRect();
      const hint = document.getElementById("editorSplitMeasuresHint");
      const hintBtn = document.getElementById("editorSplitMeasuresHintBtn");
      const left = document.getElementById("editorNudgeLeft").getBoundingClientRect();
      const right = document.getElementById("editorNudgeRight").getBoundingClientRect();
      const checked = document.getElementById("editorSplitMeasures").checked;
      const m1 = document.querySelector('.editor-measure[data-index="1"]').getBoundingClientRect();
      const m2 = document.querySelector('.editor-measure[data-index="2"]').getBoundingClientRect();
      const lane = document.querySelector('.editor-measure[data-index="2"] .editor-lane');
      const radius = getComputedStyle(lane).borderTopLeftRadius;
      const paras = hint ? hint.querySelectorAll("p").length : 0;
      return {
        checked: checked,
        continuous: document.getElementById("editor").classList.contains("is-continuous"),
        splitText: splitLabel.textContent.replace(/\s+/g, ""),
        hintLabel: hintBtn ? hintBtn.textContent.trim() : "",
        hintParas: paras,
        hintText: hint ? hint.textContent.replace(/\s+/g, "") : "",
        hintOpen: hint ? hint.matches(":popover-open") : false,
        addRight: add.right,
        splitLeft: box.left,
        gap: m2.left - m1.right,
        radius: radius,
        cardLeft: card.left,
        cardRight: card.right,
        scrollBottom: scroll.bottom,
        left: { x: left.left, right: left.right, top: left.top, label: document.getElementById("editorNudgeLeft").textContent.trim() },
        right: { x: right.left, right: right.right, top: right.top, label: document.getElementById("editorNudgeRight").textContent.trim() },
        standing: [...document.querySelectorAll("p, label")]
          .filter((el) => !el.closest(".route-hint"))
          .some((el) => el.textContent.includes("小节之间不拆开")),
      };
    });

    if (chromeBox.checked) fail("分开小节 defaults to checked");
    if (!chromeBox.continuous) fail("chart is not one continuous strip by default");
    if (chromeBox.splitText !== "分开小节") fail("split label is " + chromeBox.splitText);
    if (!(chromeBox.splitLeft >= chromeBox.addRight - 1)) fail("分开小节 is not to the right of 加入音符");
    if (chromeBox.hintLabel !== "!") fail("split help control is " + JSON.stringify(chromeBox.hintLabel));
    if (chromeBox.hintParas !== 1) fail("split help is not a single note (" + chromeBox.hintParas + " paragraphs)");
    if (!chromeBox.hintText.includes(SPLIT_HELP.replace(/\s+/g, ""))) fail("split help text is " + chromeBox.hintText);
    if (chromeBox.hintOpen) fail("split help is standing open");
    if (chromeBox.standing) fail("split explanation is standing copy");
    if (chromeBox.gap > 2) fail("default measures are split by " + chromeBox.gap.toFixed(1) + "px");
    if (chromeBox.radius !== "0px") fail("continuous lane still has a corner radius " + chromeBox.radius);
    if (chromeBox.left.x - chromeBox.cardLeft > 28) fail("left arrow is not at the far left");
    if (chromeBox.cardRight - chromeBox.right.right > 28) fail("right arrow is not at the far right");
    if (chromeBox.left.top < chromeBox.scrollBottom - 2) fail("left arrow is not below the chart");
    if (chromeBox.right.top < chromeBox.scrollBottom - 2) fail("right arrow is not below the chart");
    if (chromeBox.left.label.indexOf("←") < 0 && chromeBox.left.label.indexOf("‹") < 0) fail("left arrow glyph " + chromeBox.left.label);
    if (chromeBox.right.label.indexOf("→") < 0 && chromeBox.right.label.indexOf("›") < 0) fail("right arrow glyph " + chromeBox.right.label);

    const beforeArrow = (await read()).scrollLeft;
    await page.click("#editorNudgeRight");
    const afterRight = (await read()).scrollLeft;
    if (afterRight < beforeArrow + 100) fail("right arrow only moved " + (afterRight - beforeArrow).toFixed(1) + "px");
    await page.click("#editorNudgeLeft");
    const afterLeft = (await read()).scrollLeft;
    if (afterLeft > afterRight - 100) fail("left arrow did not scroll back (" + afterLeft.toFixed(1) + " vs " + afterRight.toFixed(1) + ")");

    const stringHit = await page.evaluate(() => {
      const el = document.querySelector("#editorMeasures .editor-string");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!stringHit) fail("collapsed string is missing");
    else {
      const scrollAt = (await read()).scrollLeft;
      await page.mouse.click(stringHit.x, stringHit.y);
      const opened = await read();
      if (!opened.zoom) fail("clicking a collapsed string did not open the zoom card");
      if (Math.abs(opened.scrollLeft - scrollAt) > 2) fail("clicking a string panned the chart");
      const zoomNote = await page.evaluate(() => {
        const view = document.querySelector(".editor-zoom-viewport").getBoundingClientRect();
        const notes = [...document.querySelectorAll(".editor-zoom .editor-note")];
        for (const el of notes) {
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          if (x < view.left + 4 || x > view.right - 4) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && hit.closest(".editor-zoom .editor-note") === el) {
            return { x: x, y: y, index: +el.dataset.index, hand: window.BachiEditor.getResolved().hands[+el.dataset.index] };
          }
        }
        return null;
      });
      if (!zoomNote) fail("zoom card has no clickable note");
      else {
        const panBefore = await page.evaluate(() => window.BachiEditor.getState().expanded.panX);
        await page.mouse.click(zoomNote.x, zoomNote.y);
        const swapped = await read();
        const panAfter = await page.evaluate(() => window.BachiEditor.getState().expanded && window.BachiEditor.getState().expanded.panX);
        if (!swapped.swapHidden) fail("zoom note click showed the swap popup");
        if (swapped.hands[zoomNote.index] === zoomNote.hand) fail("zoom note click did not swap the hand");
        if (!swapped.zoom) fail("zoom note click closed the card");
        if (panAfter == null || Math.abs(panAfter - panBefore) > 0.5) fail("zoom note click panned the card");
        if (swapped.playing) fail("zoom note swap started playback");
        if (!swapped.selection || swapped.selection.type !== "note" || swapped.selection.index !== zoomNote.index) {
          fail("zoom swap did not keep the note selected");
        }
      }
      await page.keyboard.press("Escape");
      const closed = await read();
      if (closed.zoom) fail("Escape did not close the zoom card");
    }

    const note = await page.evaluate(() => {
      const el = document.querySelector('#editorMeasures .editor-note[data-index="1"]');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, hand: window.BachiEditor.getResolved().hands[1] };
    });
    const scrollBeforeNote = (await read()).scrollLeft;
    await page.mouse.click(note.x, note.y);
    const afterNote = await read();
    if (!afterNote.swapHidden) fail("clicking a note showed the swap popup");
    if (afterNote.hands[1] === note.hand) fail("clicking a note did not swap L/R");
    if (afterNote.zoom) fail("clicking a lane note opened the zoom card");
    if (Math.abs(afterNote.scrollLeft - scrollBeforeNote) > 2) fail("clicking a note panned the chart");
    if (afterNote.playing) fail("clicking a note started playback");
    if (!afterNote.selection || afterNote.selection.type !== "note" || afterNote.selection.index !== 1) {
      fail("note swap did not keep the selection " + JSON.stringify(afterNote.selection));
    }

    const pair = await page.evaluate(() => {
      const notes = [...document.querySelectorAll("#editorMeasures .editor-note")];
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      return { a: box(notes[0]), b: box(notes[3]) };
    });
    const scrollBeforeRange = (await read()).scrollLeft;
    await drag(pair.a.x, pair.a.y, pair.b.x, pair.b.y);
    const ranged = await read();
    if (ranged.rangeHidden) fail("drag-select did not show the track actions");
    if (ranged.labels.join(",") !== "1-2,2-1,2-2,循环试听") fail("action labels " + ranged.labels.join(","));
    if (!ranged.selection || ranged.selection.type !== "range" || ranged.selection.from !== 0 || ranged.selection.to !== 3) {
      fail("drag-select range " + JSON.stringify(ranged.selection));
    }
    if (Math.abs(ranged.scrollLeft - scrollBeforeRange) > 2) fail("drag-select panned the chart");
    if (ranged.playing) fail("drag-select started playback");

    const placed = await page.evaluate(() => {
      const pop = document.getElementById("editorRangePop");
      const buttons = [...pop.querySelectorAll("button")].map((el) => {
        const r = el.getBoundingClientRect();
        return { label: el.textContent.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      const notes = [...document.querySelectorAll("#editorMeasures .editor-note")].map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      const bg = getComputedStyle(pop).backgroundColor;
      const shadow = getComputedStyle(pop).boxShadow;
      return { buttons: buttons, notes: notes, bg: bg, shadow: shadow };
    });
    const covered = [];
    for (const btn of placed.buttons) {
      for (const noteBox of placed.notes) {
        if (overlaps(btn, noteBox)) covered.push(btn.label);
      }
    }
    if (covered.length) fail("action buttons cover notes: " + covered.join(","));
    const laneBottom = await page.evaluate(() => {
      return document.querySelector("#editorMeasures .editor-lane").getBoundingClientRect().bottom;
    });
    if (placed.buttons.some((b) => b.top < laneBottom - 4)) fail("action buttons sit on the note lane");
    if (placed.bg !== "rgba(0, 0, 0, 0)" && placed.bg !== "transparent") fail("action row is a filled panel " + placed.bg);
    if (placed.shadow && placed.shadow !== "none") fail("action row has a floating shadow");

    const capsBefore = { loopStart: ranged.loopStart, loopEnd: ranged.loopEnd, section: ranged.section };
    const beforeBrush = ranged.hands.slice();
    await page.click('#editorRangePop [data-ed-action="12"]');
    const brushed = await read();
    if (brushed.hands.slice(0, 4).join("") !== "RLRL") fail("1-2 hands " + brushed.hands.slice(0, 4).join(""));
    if (brushed.playing) fail("1-2 started playback");
    if (!brushed.selection || brushed.selection.type !== "range" || brushed.selection.from !== 0 || brushed.selection.to !== 3) {
      fail("1-2 cleared the selection");
    }
    if (brushed.rangeHidden) fail("1-2 hid the track actions");
    if (brushed.hands.slice(4).join("") !== beforeBrush.slice(4).join("")) fail("1-2 rewrote notes outside the selection");

    await page.click('#editorRangePop [data-ed-action="21"]');
    const reversed = await read();
    if (reversed.hands.slice(0, 4).join("") !== "LRLR") fail("2-1 hands " + reversed.hands.slice(0, 4).join(""));
    if (reversed.playing) fail("2-1 started playback");
    if (!reversed.selection || reversed.selection.from !== 0 || reversed.selection.to !== 3) fail("2-1 cleared the selection");

    await page.click('#editorHandSeg [data-hand="L"]');
    await page.click('#editorRangePop [data-ed-action="12"]');
    const leftDominant = await read();
    if (leftDominant.hands.slice(0, 4).join("") !== "LRLR") fail("1-2 with 惯用手 L is " + leftDominant.hands.slice(0, 4).join(""));
    if (leftDominant.playing) fail("1-2 after 惯用手 change started playback");

    await page.click('#editorHandSeg [data-hand="R"]');
    await page.click('#editorRangePop [data-ed-action="22"]');
    const rolled = await read();
    if (rolled.pairs.slice(0, 2).join(",") !== "0-1,2-3") fail("2-2 pairs " + rolled.pairs.join(","));
    if (rolled.hands.slice(0, 4).join("") !== "RRLL") fail("2-2 hands " + rolled.hands.slice(0, 4).join(""));
    if (rolled.playing) fail("2-2 started playback");
    if (!rolled.selection || rolled.selection.from !== 0 || rolled.selection.to !== 3) fail("2-2 cleared the selection");
    if (rolled.loopStart !== capsBefore.loopStart || rolled.loopEnd !== capsBefore.loopEnd) fail("brushing moved the export loop caps");
    if (JSON.stringify(rolled.section) !== JSON.stringify(capsBefore.section)) fail("brushing changed the export section");

    const scrollBeforeButton = rolled.scrollLeft;
    const buttonDrag = await page.evaluate(() => {
      const el = document.querySelector('#editorRangePop [data-ed-action="12"]');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await drag(buttonDrag.x, buttonDrag.y, buttonDrag.x - 90, buttonDrag.y);
    const afterButtonDrag = await read();
    if (Math.abs(afterButtonDrag.scrollLeft - scrollBeforeButton) > 2) fail("dragging an action button panned the chart");

    await page.click('#editorRangePop [data-ed-action="audition"]');
    const looping = await read();
    const firstT = await page.evaluate(() => window.BachiEditor.getState().rawNotes[0].t);
    const lastT = await page.evaluate(() => window.BachiEditor.getState().rawNotes[3].t);
    if (!looping.playing) fail("循环试听 did not start playback");
    if (looping.now < firstT - 0.05 || looping.now > lastT + 0.45) fail("循环试听 did not start inside the selection, now=" + looping.now);
    if (looping.loopStart !== capsBefore.loopStart || looping.loopEnd !== capsBefore.loopEnd) fail("循环试听 rewrote the progress-bar loop");
    if (JSON.stringify(looping.section) !== JSON.stringify(capsBefore.section)) fail("循环试听 changed the export section");
    await page.evaluate((t) => { window.taikoAnim.state.now = t; }, lastT + 0.8);
    try {
      await page.waitForFunction((t0) => {
        const anim = window.taikoAnim.state;
        return anim.playing && anim.now < t0 + 0.35;
      }, { timeout: 2000 }, firstT);
    } catch (err) {
      const stuck = await read();
      fail("循环试听 did not wrap to the selection start, now=" + stuck.now + " playing=" + stuck.playing);
    }
    const wrapped = await read();
    if (wrapped.loopStart !== capsBefore.loopStart || wrapped.loopEnd !== capsBefore.loopEnd) fail("wrapping rewrote the export loop caps");

    await page.mouse.click(note.x, note.y);
    const afterInterrupt = await read();
    if (afterInterrupt.playing) fail("editing while auditioning kept playback running");

    await page.evaluate(() => { document.getElementById("editorScroll").scrollLeft = 0; });
    const noteDrag = await page.evaluate(() => {
      const el = document.querySelector('#editorMeasures .editor-note[data-index="5"]');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const scrollAtNoteDrag = (await read()).scrollLeft;
    await drag(noteDrag.x, noteDrag.y, noteDrag.x + 70, noteDrag.y - 28);
    const afterNoteDrag = await read();
    if (Math.abs(afterNoteDrag.scrollLeft - scrollAtNoteDrag) > 2) fail("dragging a note panned the chart");

    const bar = await page.evaluate(() => {
      const el = document.querySelector('.editor-measure[data-index="1"] .editor-barnum');
      const r = el.getBoundingClientRect();
      return { x: r.left + 14, y: r.top + r.height / 2 };
    });
    await drag(bar.x, bar.y, bar.x + 120, bar.y);
    const afterBarDrag = await read();
    if (Math.abs(afterBarDrag.scrollLeft - scrollAtNoteDrag) > 2) fail("dragging a measure number panned the chart");

    const empty = await page.evaluate(() => {
      const lane = document.querySelector('.editor-measure[data-index="3"] .editor-lane');
      const r = lane.getBoundingClientRect();
      const y = r.top + 10;
      let x = null;
      for (let px = r.left + 30; px < r.right - 10; px += 12) {
        const el = document.elementFromPoint(px, y);
        if (el && el.closest(".editor-lane") && !el.closest(".editor-note, .editor-string, .editor-cell, button")) {
          x = px;
          break;
        }
      }
      return { x: x, y: y };
    });
    if (empty.x == null) fail("no empty lane point to drag");
    else {
      const beforeEmpty = (await read()).scrollLeft;
      await drag(empty.x, empty.y, empty.x - 140, empty.y);
      const afterEmpty = (await read()).scrollLeft;
      const moved = afterEmpty - beforeEmpty;
      if (moved < 100 || moved > 180) fail("empty-space drag scrolled " + moved.toFixed(1) + "px");
    }

    await page.click("#editorSplitMeasures");
    const splitOn = await page.evaluate(() => {
      const m1 = document.querySelector('.editor-measure[data-index="1"]').getBoundingClientRect();
      const m2 = document.querySelector('.editor-measure[data-index="2"]').getBoundingClientRect();
      const lane = document.querySelector('.editor-measure[data-index="2"] .editor-lane');
      return {
        checked: document.getElementById("editorSplitMeasures").checked,
        continuous: document.getElementById("editor").classList.contains("is-continuous"),
        gap: m2.left - m1.right,
        radius: parseFloat(getComputedStyle(lane).borderTopLeftRadius) || 0,
      };
    });
    if (!splitOn.checked || splitOn.continuous) fail("分开小节 did not turn the split layout on");
    if (splitOn.gap < 16) fail("split measures are only " + splitOn.gap.toFixed(1) + "px apart");
    if (splitOn.radius < 16) fail("split lane is not a separate card (radius " + splitOn.radius + ")");

    await page.click("#editorSplitMeasures");
    const splitOff = await page.evaluate(() => {
      const m1 = document.querySelector('.editor-measure[data-index="1"]').getBoundingClientRect();
      const m2 = document.querySelector('.editor-measure[data-index="2"]').getBoundingClientRect();
      return {
        checked: document.getElementById("editorSplitMeasures").checked,
        continuous: document.getElementById("editor").classList.contains("is-continuous"),
        gap: m2.left - m1.right,
      };
    });
    if (splitOff.checked || !splitOff.continuous || splitOff.gap > 2) fail("unchecking 分开小节 did not restore the strip");

    await page.click("#editorSplitMeasuresHintBtn");
    const hinted = await page.evaluate(() => {
      const pop = document.getElementById("editorSplitMeasuresHint");
      const btn = document.getElementById("editorSplitMeasuresHintBtn");
      const pr = pop.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      return {
        open: pop.matches(":popover-open"),
        paras: pop.querySelectorAll("p").length,
        text: pop.textContent,
        near: Math.abs(pr.y - (br.bottom + 10)) < 3 || Math.abs(pr.bottom + 10 - br.top) < 3,
        coversX: pr.x < br.x + br.width && pr.x + pr.width > br.x,
      };
    });
    if (!hinted.open) fail("分开小节 hint did not open");
    if (hinted.paras !== 1) fail("opened hint is not a single note");
    if (!hinted.text.includes("连续") || !hinted.text.includes("卡片")) fail("hint does not explain both layouts");
    if (!hinted.near || !hinted.coversX) fail("分开小节 hint is not next to its ! button");

    await page.click('#editorModeSeg [data-ed-mode="auto"]');
    const beforeLock = await page.evaluate(() => window.BachiEditor.getResolved().hands[2]);
    const lockedNote = await page.evaluate(() => {
      const el = document.querySelector('#editorMeasures .editor-note[data-index="2"]');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(lockedNote.x, lockedNote.y);
    const locked = await read();
    if (locked.hands[2] !== beforeLock) fail("readonly mode still swapped a note");
    if (!locked.swapHidden) fail("readonly mode showed the swap popup");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  if (fails.length) {
    console.error("FAIL editor mouse\n" + fails.join("\n"));
    process.exit(1);
  }
  console.log("ok: mouse-first hand editing");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
