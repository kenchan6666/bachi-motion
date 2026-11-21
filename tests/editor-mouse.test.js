/**
 * Mouse-first hand editing on the chart.
 *
 * Click a note swaps L/R immediately and keeps the selection.
 * Drag-select shows 1-2 / 2-1 / 2-2 / 循环试听 beside the selection.
 * Those brushes do not start playback. 循环试听 loops only the selection.
 * Arrows scroll the timeline and sit just under the chart, clear of 小节总览.
 * 小节总览 sits a little lower than the arrows, not stuck to them.
 * Notes, buttons, and other controls do not pan.
 * 分开小节 is off by default (one strip) and on restores separate measure cards.
 * 全部谱面 is off by default. On, the chart wraps so every measure is in the
 * card width, and the arrows and 小节总览 hide. Off, the strip and both return.
 * A click in 全部谱面 does not change scrollTop or scrollLeft.
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
const FULL_HELP = "勾选全部谱面后，整张谱换行排开，一次看完，左右箭头和小节总览先收起来。";

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
          scrollTop: scroll.scrollTop,
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
      const fullInput = document.getElementById("editorFullChart");
      const fullLabel = fullInput && fullInput.closest("label");
      const fullBox = fullLabel ? fullLabel.getBoundingClientRect() : null;
      const hint = document.getElementById("editorAddNoteHint");
      const hintBtn = document.getElementById("editorAddNoteHintBtn");
      const hintBox = hintBtn.getBoundingClientRect();
      const left = document.getElementById("editorNudgeLeft").getBoundingClientRect();
      const right = document.getElementById("editorNudgeRight").getBoundingClientRect();
      const hands = document.querySelector("#editorMeasures .editor-hands").getBoundingClientRect();
      const overview = document.getElementById("editorOverview").getBoundingClientRect();
      const arrow = (rect) => ({
        x: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        w: rect.width,
        h: rect.height,
        chartGap: rect.top - scroll.bottom,
        handsGap: rect.top - hands.bottom,
        overviewGap: overview.top - rect.bottom,
      });
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
        fullChecked: fullInput ? fullInput.checked : null,
        fullText: fullLabel ? fullLabel.textContent.replace(/\s+/g, "") : "",
        fullLeft: fullBox ? fullBox.left : -1,
        fullRight: fullBox ? fullBox.right : -1,
        fullOn: document.getElementById("editor").classList.contains("is-full-chart"),
        extraFullHint: !!(document.getElementById("editorFullChartHintBtn") || document.getElementById("editorFullChartHint")),
        hintLabel: hintBtn ? hintBtn.textContent.trim() : "",
        hintAria: hintBtn ? (hintBtn.getAttribute("aria-label") || "") : "",
        hintParas: paras,
        hintText: hint ? hint.textContent.replace(/\s+/g, "") : "",
        hintOpen: hint ? hint.matches(":popover-open") : false,
        authorHints: document.querySelectorAll("#editorAuthor .route-hint-btn").length,
        splitHintGone: !document.getElementById("editorSplitMeasuresHintBtn") && !document.getElementById("editorSplitMeasuresHint"),
        addRight: add.right,
        splitLeft: box.left,
        splitRight: box.right,
        hintLeft: hintBox.left,
        gap: m2.left - m1.right,
        radius: radius,
        cardLeft: card.left,
        cardRight: card.right,
        scrollBottom: scroll.bottom,
        left: Object.assign(arrow(left), { label: document.getElementById("editorNudgeLeft").textContent.trim() }),
        right: Object.assign(arrow(right), { label: document.getElementById("editorNudgeRight").textContent.trim() }),
        standing: [...document.querySelectorAll("p, label")]
          .filter((el) => !el.closest(".route-hint"))
          .some((el) => el.textContent.includes("小节之间不拆开")),
      };
    });

    if (chromeBox.checked) fail("分开小节 defaults to checked");
    if (!chromeBox.continuous) fail("chart is not one continuous strip by default");
    if (chromeBox.splitText !== "分开小节") fail("split label is " + chromeBox.splitText);
    if (chromeBox.fullChecked !== false) fail("全部谱面 defaults to " + chromeBox.fullChecked);
    if (chromeBox.fullText !== "全部谱面") fail("full chart label is " + chromeBox.fullText);
    if (chromeBox.fullOn) fail("全部谱面 layout is on while the box is unchecked");
    if (!(chromeBox.splitLeft >= chromeBox.addRight - 1)) fail("分开小节 is not to the right of 加入音符");
    if (!(chromeBox.fullLeft >= chromeBox.splitRight - 1)) fail("全部谱面 is not to the right of 分开小节");
    if (!(chromeBox.hintLeft >= chromeBox.fullRight - 1)) fail("the ! is not to the right of 全部谱面");
    if (!(chromeBox.hintLeft >= chromeBox.splitRight - 1)) fail("the ! is not to the right of 分开小节");
    if (chromeBox.authorHints !== 1 || !chromeBox.splitHintGone || chromeBox.extraFullHint) fail("author row does not have exactly one !");
    if (chromeBox.hintLabel !== "!") fail("help control is " + JSON.stringify(chromeBox.hintLabel));
    if (chromeBox.hintParas !== 1) fail("help is not a single combined note (" + chromeBox.hintParas + " paragraphs)");
    if (!chromeBox.hintText.includes("先选咚或咔") || !chromeBox.hintText.includes("16分")) fail("combined hint missing 加入音符 " + chromeBox.hintText);
    if (!chromeBox.hintText.includes(SPLIT_HELP.replace(/\s+/g, ""))) fail("combined hint missing 分开小节 " + chromeBox.hintText);
    if (!chromeBox.hintText.includes(FULL_HELP.replace(/\s+/g, ""))) fail("combined hint missing 全部谱面 " + chromeBox.hintText);
    if (chromeBox.hintAria.indexOf("全部谱面") < 0) fail("hint button does not mention 全部谱面: " + chromeBox.hintAria);
    if (chromeBox.hintOpen) fail("split help is standing open");
    if (chromeBox.standing) fail("split explanation is standing copy");
    if (chromeBox.gap > 2) fail("default measures are split by " + chromeBox.gap.toFixed(1) + "px");
    if (chromeBox.radius !== "0px") fail("continuous lane still has a corner radius " + chromeBox.radius);
    if (chromeBox.left.x - chromeBox.cardLeft > 28) fail("left arrow is not at the far left");
    if (chromeBox.cardRight - chromeBox.right.right > 28) fail("right arrow is not at the far right");
    if (chromeBox.left.top < chromeBox.scrollBottom - 2) fail("left arrow is not below the chart");
    if (chromeBox.right.top < chromeBox.scrollBottom - 2) fail("right arrow is not below the chart");
    if (chromeBox.left.chartGap > 12) fail("left arrow floats " + chromeBox.left.chartGap.toFixed(1) + "px under the chart");
    if (chromeBox.right.chartGap > 12) fail("right arrow floats " + chromeBox.right.chartGap.toFixed(1) + "px under the chart");
    if (chromeBox.left.handsGap > 36) fail("left arrow is not just under the chart (" + chromeBox.left.handsGap.toFixed(1) + "px below the hands)");
    if (chromeBox.right.handsGap > 36) fail("right arrow is not just under the chart (" + chromeBox.right.handsGap.toFixed(1) + "px below the hands)");
    // Post-#90 the overview sat about 14px under the arrows. Keep a modest extra
    // gap so it is lower, without bringing back the tall empty band.
    if (chromeBox.left.overviewGap < 28 || chromeBox.left.overviewGap > 72) {
      fail("小节总览 is not a little under the arrows (" + chromeBox.left.overviewGap.toFixed(1) + "px)");
    }
    if (chromeBox.right.overviewGap < 28 || chromeBox.right.overviewGap > 72) {
      fail("小节总览 is not a little under the right arrow (" + chromeBox.right.overviewGap.toFixed(1) + "px)");
    }
    if (chromeBox.left.w < 44 || chromeBox.left.h < 36) fail("left arrow is small " + chromeBox.left.w.toFixed(0) + "×" + chromeBox.left.h.toFixed(0));
    if (chromeBox.right.w < 44 || chromeBox.right.h < 36) fail("right arrow is small " + chromeBox.right.w.toFixed(0) + "×" + chromeBox.right.h.toFixed(0));
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

    async function readWrappedChart() {
      return page.evaluate(() => {
        const scroll = document.getElementById("editorScroll");
        const port = scroll.getBoundingClientRect();
        const measures = [...document.querySelectorAll("#editorMeasures .editor-measure")].map((el) => {
          const r = el.getBoundingClientRect();
          const lane = el.querySelector(".editor-lane");
          return {
            index: +el.dataset.index,
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            radius: lane ? (parseFloat(getComputedStyle(lane).borderTopLeftRadius) || 0) : 0,
          };
        });
        const nudge = document.getElementById("editorNudge");
        const overview = document.getElementById("editorOverview");
        const rows = [];
        measures.forEach((m) => {
          const row = rows.find((it) => Math.abs(it.top - m.top) < 8);
          if (row) row.items.push(m);
          else rows.push({ top: m.top, items: [m] });
        });
        return {
          checked: document.getElementById("editorFullChart").checked,
          split: document.getElementById("editorSplitMeasures").checked,
          full: document.getElementById("editor").classList.contains("is-full-chart"),
          continuous: document.getElementById("editor").classList.contains("is-continuous"),
          overflowX: scroll.scrollWidth - scroll.clientWidth,
          port: { left: port.left, right: port.right, top: port.top, bottom: port.bottom },
          measures: measures,
          rows: rows.length,
          wideRow: rows.some((row) => row.items.length >= 2),
          sameRowGap: rows.reduce((gap, row) => {
            if (row.items.length < 2) return gap;
            const sorted = row.items.slice().sort((a, b) => a.left - b.left);
            return Math.min(gap, sorted[1].left - sorted[0].right);
          }, 999),
          nudgeDisplay: getComputedStyle(nudge).display,
          overviewDisplay: getComputedStyle(overview).display,
        };
      });
    }

    await page.click("#editorFullChart");
    const fullOn = await readWrappedChart();
    if (!fullOn.checked || !fullOn.full) fail("全部谱面 did not turn the wrap layout on");
    if (fullOn.split || !fullOn.continuous) fail("全部谱面 turned 分开小节 on");
    if (fullOn.nudgeDisplay !== "none") fail("全部谱面 still shows the arrows (" + fullOn.nudgeDisplay + ")");
    if (fullOn.overviewDisplay !== "none") fail("全部谱面 still shows 小节总览 (" + fullOn.overviewDisplay + ")");
    if (fullOn.overflowX > 2) fail("全部谱面 still scrolls sideways by " + fullOn.overflowX.toFixed(1) + "px");
    if (fullOn.measures.length < 8) fail("全部谱面 lost measures (" + fullOn.measures.length + ")");
    if (fullOn.rows < 2) fail("全部谱面 did not wrap onto another line");
    if (!fullOn.wideRow) fail("全部谱面 stacked one measure per line instead of using the card width");
    if (fullOn.sameRowGap > 2) fail("wrapped strip still separates measures by " + fullOn.sameRowGap.toFixed(1) + "px");
    fullOn.measures.forEach((m) => {
      if (m.left < fullOn.port.left - 2 || m.right > fullOn.port.right + 2) {
        fail("measure " + m.index + " is outside the chart width");
      }
    });
    const wrappedEnd = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll");
      scroll.scrollTop = scroll.scrollHeight;
      const port = scroll.getBoundingClientRect();
      const nodes = [...document.querySelectorAll("#editorMeasures .editor-measure")];
      const last = nodes[nodes.length - 1].getBoundingClientRect();
      return {
        top: last.top - port.top,
        bottom: last.bottom - port.bottom,
        left: last.left - port.left,
        right: port.right - last.right,
      };
    });
    if (wrappedEnd.bottom > 4) fail("last measure stays below the wrapped chart (" + wrappedEnd.bottom.toFixed(1) + "px)");
    if (wrappedEnd.top < -4) fail("last measure scrolled above the wrapped chart");
    if (wrappedEnd.left < -2 || wrappedEnd.right < -2) fail("last measure is outside the wrapped chart width");
    await page.evaluate(() => { document.getElementById("editorScroll").scrollTop = 0; });

    const wrappedNote = await page.evaluate(() => {
      const el = document.querySelector('#editorMeasures .editor-note[data-index="1"]');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, hand: window.BachiEditor.getResolved().hands[1] };
    });
    const scrollBeforeWrapNote = await read();
    await page.mouse.click(wrappedNote.x, wrappedNote.y);
    const afterWrapNote = await read();
    if (afterWrapNote.hands[1] === wrappedNote.hand) fail("全部谱面 note click did not swap L/R");
    if (Math.abs(afterWrapNote.scrollLeft - scrollBeforeWrapNote.scrollLeft) > 2) fail("全部谱面 note click panned the chart");
    if (Math.abs(afterWrapNote.scrollTop - scrollBeforeWrapNote.scrollTop) > 2) fail("全部谱面 note click changed scrollTop");
    if (!afterWrapNote.swapHidden) fail("全部谱面 note click showed the swap popup");

    const wrappedPair = await page.evaluate(() => {
      const notes = [...document.querySelectorAll("#editorMeasures .editor-note")];
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      return { a: box(notes[0]), b: box(notes[3]) };
    });
    const scrollBeforeWrapRange = (await read()).scrollLeft;
    await drag(wrappedPair.a.x, wrappedPair.a.y, wrappedPair.b.x, wrappedPair.b.y);
    const wrappedRange = await read();
    if (wrappedRange.rangeHidden) fail("全部谱面 drag-select did not show the track actions");
    if (wrappedRange.labels.join(",") !== "1-2,2-1,2-2,循环试听") fail("全部谱面 action labels " + wrappedRange.labels.join(","));
    if (Math.abs(wrappedRange.scrollLeft - scrollBeforeWrapRange) > 2) fail("全部谱面 drag-select panned the chart");
    if (wrappedRange.playing) fail("全部谱面 drag-select started playback");

    await page.click("#editorSplitMeasures");
    const wrappedCards = await readWrappedChart();
    if (!wrappedCards.checked || !wrappedCards.split || wrappedCards.continuous) fail("全部谱面 + 分开小节 did not keep both on");
    if (wrappedCards.nudgeDisplay !== "none" || wrappedCards.overviewDisplay !== "none") fail("split cards brought the arrows or 小节总览 back");
    if (wrappedCards.overflowX > 2) fail("split cards still scroll sideways by " + wrappedCards.overflowX.toFixed(1) + "px");
    if (wrappedCards.rows < 2) fail("split cards did not wrap");
    if (wrappedCards.sameRowGap < 16) fail("wrapped cards are only " + wrappedCards.sameRowGap.toFixed(1) + "px apart");
    if (wrappedCards.measures.some((m) => m.radius < 16)) fail("wrapped cards lost their rounded lanes");
    wrappedCards.measures.forEach((m) => {
      if (m.left < wrappedCards.port.left - 2 || m.right > wrappedCards.port.right + 2) {
        fail("card " + m.index + " is outside the chart width");
      }
    });

    const parked = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll");
      const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      scroll.scrollTop = Math.min(max, Math.max(80, max * 0.45));
      scroll.scrollLeft = 0;
      return { top: scroll.scrollTop, max: max };
    });
    if (parked.max < 40) fail("全部谱面 + 分开小节 cannot scroll (" + parked.max.toFixed(0) + "px)");
    const emptyLane = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const lanes = [...document.querySelectorAll("#editorMeasures .editor-lane")];
      for (const laneEl of lanes) {
        const r = laneEl.getBoundingClientRect();
        const y = r.top + r.height / 2;
        if (y < scroll.top + 8 || y > scroll.bottom - 8) continue;
        for (let x = r.left + 18; x < r.right - 12; x += 16) {
          const hit = document.elementFromPoint(x, y);
          if (hit && hit.closest(".editor-lane") && !hit.closest(".editor-note, .editor-string, button")) return { x: x, y: y };
        }
      }
      return null;
    });
    if (!emptyLane) fail("no empty lane while 全部谱面 is scrolled");
    else {
      const beforeEmpty = await read();
      await page.mouse.click(emptyLane.x, emptyLane.y);
      const afterEmpty = await read();
      if (Math.abs(afterEmpty.scrollTop - beforeEmpty.scrollTop) > 2) fail("全部谱面 empty-lane click changed scrollTop");
      if (Math.abs(afterEmpty.scrollLeft - beforeEmpty.scrollLeft) > 2) fail("全部谱面 empty-lane click changed scrollLeft");
    }
    const barClick = await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const bars = [...document.querySelectorAll("#editorMeasures .editor-barnum")];
      for (const el of bars) {
        const r = el.getBoundingClientRect();
        const x = r.left + 12;
        const y = r.top + r.height / 2;
        if (y < scroll.top + 2 || y > scroll.bottom - 2) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && hit.closest(".editor-barnum")) return { x: x, y: y };
      }
      return null;
    });
    if (!barClick) fail("no measure number while 全部谱面 is scrolled");
    else {
      const beforeBar = await read();
      await page.mouse.click(barClick.x, barClick.y);
      const afterBar = await read();
      if (Math.abs(afterBar.scrollTop - beforeBar.scrollTop) > 2) fail("全部谱面 measure-number click changed scrollTop");
      if (Math.abs(afterBar.scrollLeft - beforeBar.scrollLeft) > 2) fail("全部谱面 measure-number click changed scrollLeft");
    }
    await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll");
      scroll.scrollTop = 0;
      scroll.scrollLeft = 0;
    });

    await page.click("#editorFullChart");
    await page.click("#editorSplitMeasures");
    await page.evaluate(() => {
      const scroll = document.getElementById("editorScroll");
      scroll.scrollTop = 0;
      scroll.scrollLeft = 0;
    });
    const stripAgain = await readWrappedChart();
    if (stripAgain.checked || stripAgain.full || stripAgain.split || !stripAgain.continuous) fail("turning 全部谱面 off did not restore the strip");
    if (stripAgain.rows !== 1) fail("the strip wrapped after 全部谱面 was turned off");
    if (stripAgain.nudgeDisplay === "none" || stripAgain.overviewDisplay === "none") fail("arrows or 小节总览 stayed hidden");
    if (stripAgain.overflowX < 80) fail("the strip is no longer wider than the card");
    const arrowsBack = await page.evaluate(() => {
      const card = document.querySelector(".editor-chart-card").getBoundingClientRect();
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const hands = document.querySelector("#editorMeasures .editor-hands").getBoundingClientRect();
      const overview = document.getElementById("editorOverview").getBoundingClientRect();
      const left = document.getElementById("editorNudgeLeft").getBoundingClientRect();
      const right = document.getElementById("editorNudgeRight").getBoundingClientRect();
      return {
        leftGap: left.top - scroll.bottom,
        rightGap: right.top - scroll.bottom,
        leftHands: left.top - hands.bottom,
        overviewGap: overview.top - left.bottom,
        lw: left.width,
        lh: left.height,
        rw: right.width,
        rh: right.height,
        insetLeft: left.left - card.left,
        insetRight: card.right - right.right,
      };
    });
    if (arrowsBack.insetLeft > 28 || arrowsBack.insetRight > 28) fail("arrows are no longer at the far sides");
    if (arrowsBack.leftGap > 12 || arrowsBack.rightGap > 12) fail("arrows no longer sit just under the chart");
    if (arrowsBack.leftHands > 36) fail("arrows dropped away from the chart");
    if (arrowsBack.lw < 44 || arrowsBack.lh < 36 || arrowsBack.rw < 44 || arrowsBack.rh < 36) fail("arrows shrank after leaving 全部谱面");
    if (arrowsBack.overviewGap < 28 || arrowsBack.overviewGap > 72) {
      fail("小节总览 did not stay a little under the arrows (" + arrowsBack.overviewGap.toFixed(1) + "px)");
    }

    await page.click("#editorAddNoteHintBtn");
    const hinted = await page.evaluate(() => {
      const pop = document.getElementById("editorAddNoteHint");
      const btn = document.getElementById("editorAddNoteHintBtn");
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
    if (!hinted.open) fail("combined hint did not open");
    if (hinted.paras !== 1) fail("opened hint is not a single note");
    if (!hinted.text.includes("先选咚或咔") || !hinted.text.includes("16 分")) fail("opened hint missing 加入音符");
    if (!hinted.text.includes("连续") || !hinted.text.includes("卡片")) fail("opened hint missing 分开小节");
    if (!hinted.text.includes("全部谱面") || !hinted.text.includes("换行")) fail("opened hint missing 全部谱面");
    if (!hinted.near || !hinted.coversX) fail("combined hint is not next to its ! button");

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
