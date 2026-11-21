/**
 * Blank-chart entry points and the editor 加入音符 mode.
 * Explanations stay in ! popovers. Face is 咚, rim is 咔.
 *
 *   node tests/chart-author-ui.test.js
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

const BLANK_HELP = "用填写的歌名、BPM 和小节数做一张空谱";
const ADD_HELP = "先选咚或咔，再选普通或大";

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
  function check(cond, msg) {
    if (!cond) fails.push(msg);
  }
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    let dialogMode = "fail";
    const dialogs = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      if (dialogMode === "accept") await dialog.accept();
      else await dialog.dismiss();
    });
    await page.goto("http://127.0.0.1:" + port + "/index.html", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    const labels = await page.evaluate(() => {
      const text = (id) => {
        const el = document.getElementById(id);
        return el ? el.textContent.replace(/\s+/g, "") : "";
      };
      return {
        settings: text("settingsOpenBlank"),
        editor: text("editorOpenBlank"),
        add: text("editorAddNoteBtn"),
        faces: [...document.querySelectorAll("#editorFaceSeg button")].map((b) => b.textContent.trim()),
        sizes: [...document.querySelectorAll("#editorSizeSeg button")].map((b) => b.textContent.trim()),
        body: document.body.textContent,
      };
    });
    check(labels.settings === "打开空谱面", "settings button label " + labels.settings);
    check(labels.editor === "打开空谱面", "editor button label " + labels.editor);
    check(labels.add === "加入音符", "add-note label " + labels.add);
    check(labels.faces.join(",") === "咚,咔", "face labels " + labels.faces.join(","));
    check(labels.sizes.join(",") === "普通,大", "size labels " + labels.sizes.join(","));
    check(!labels.body.includes("咕"), "page contains 咕");
    check(!labels.body.includes("咛"), "page contains 咛");

    const leaks = await page.evaluate((blankHelp, addHelp) => {
      return [...document.querySelectorAll("p, label, .hint, .editor-field-hint, button")]
        .filter((el) => !el.closest(".route-hint"))
        .map((el) => el.textContent)
        .filter((t) => t.includes(blankHelp) || t.includes(addHelp));
    }, BLANK_HELP, ADD_HELP);
    check(leaks.length === 0, "help leaked outside ! popover: " + leaks.join(" | "));

    await page.evaluate(() => {
      document.getElementById("settingsOpen").open = true;
    });
    await page.click("#settingsBlankHintBtn");
    const settingsHelp = await page.evaluate(() => {
      const pop = document.getElementById("settingsBlankHint");
      return { open: pop.matches(":popover-open"), text: pop.textContent };
    });
    check(settingsHelp.open, "settings blank hint did not open");
    check(settingsHelp.text.includes(BLANK_HELP), "settings hint missing explanation");
    check(settingsHelp.text.includes("未命名"), "settings hint missing 未命名");
    check(settingsHelp.text.includes("打开之后"), "settings hint missing later edit");
    check(!settingsHelp.text.includes("咕") && !settingsHelp.text.includes("咛"), "settings hint typo");
    await page.evaluate(() => {
      const pop = document.getElementById("settingsBlankHint");
      if (pop.matches(":popover-open")) pop.hidePopover();
    });

    async function fieldLayout(prefix) {
      return page.evaluate((which) => {
        const fold = document.getElementById(which === "settings" ? "settingsOpen" : "editorAdvancedPanel");
        function box(id) {
          const r = document.getElementById(id).getBoundingClientRect();
          return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height };
        }
        const foldBox = fold.getBoundingClientRect();
        return {
          title: box(which + "BlankTitle"),
          bpm: box(which + "BlankBpm"),
          measures: box(which + "BlankMeasures"),
          fold: { l: foldBox.left, r: foldBox.right, w: foldBox.width },
        };
      }, prefix);
    }
    function assertFields(name, box) {
      check(box.title.w > 40 && box.bpm.w > 40 && box.measures.w > 40, name + " fields have no size " + JSON.stringify(box));
      check(box.title.l >= box.fold.l - 1 && box.title.r <= box.fold.r + 1, name + " title overflows");
      check(box.bpm.l >= box.fold.l - 1 && box.measures.r <= box.fold.r + 1, name + " numbers overflow");
      check(Math.abs(box.bpm.t - box.measures.t) <= 1, name + " bpm and measures are not on one row");
      check(box.title.b <= box.bpm.t + 1, name + " title is not above bpm");
      check(Math.abs(box.title.l - box.bpm.l) <= 2, name + " title and bpm are not left-aligned");
      check(Math.abs(box.title.r - box.measures.r) <= 2, name + " title does not span the row");
      check(box.bpm.r <= box.measures.l - 4, name + " bpm and measures are cramped");
      check(Math.abs(box.title.h - box.bpm.h) <= 1 && Math.abs(box.bpm.h - box.measures.h) <= 1, name + " input heights differ");
    }
    const beforeOpen = await page.evaluate(() => ({
      settings: document.getElementById("settingsBlankFields").hidden,
      editor: document.getElementById("editorBlankFields").hidden,
      courses: document.querySelectorAll("#coursePicker button").length,
    }));
    check(beforeOpen.settings && beforeOpen.editor, "blank fields visible before a blank chart is opened");
    check(beforeOpen.courses === 0, "difficulty buttons visible before a TJA is opened");

    const titles = await page.evaluate(() => {
      return ["settingsBlankTitle", "editorBlankTitle"].map((id) => {
        const el = document.getElementById(id);
        return {
          id: id,
          type: el && el.type,
          disabled: el ? el.disabled : true,
          readOnly: el ? el.readOnly : true,
        };
      });
    });
    check(titles.length === 2 && titles.every((f) => f.type === "text" && !f.disabled && !f.readOnly),
      "title fields " + JSON.stringify(titles));

    await page.evaluate(() => {
      const el = document.getElementById("settingsBlankTitle");
      el.value = "练习曲甲";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const untouched = await page.$eval("#tjaInput", (el) => el.value.includes("TITLE:溯溯的练习谱2"));
    check(untouched, "title field rewrote a chart before a blank chart was opened");
    await page.$eval("#settingsBlankTitle", (el) => { el.value = ""; });

    const before = await page.$eval("#tjaInput", (el) => el.value);
    check(before.includes("TITLE:溯溯的练习谱2"), "fixture chart missing");
    const dialogsBefore = dialogs.length;
    dialogMode = "dismiss";
    await page.click("#settingsOpenBlank");
    check(dialogs.length === dialogsBefore + 1, "dirty chart did not confirm");
    check(dialogs[dialogs.length - 1].includes("已有音符"), "confirm text: " + dialogs[dialogs.length - 1]);
    const kept = await page.$eval("#tjaInput", (el) => el.value);
    check(kept === before, "dismissed confirm still replaced the chart");

    dialogMode = "accept";
    await page.click("#settingsOpenBlank");
    const blank = await page.evaluate(() => {
      const parsed = window.TaikoParser.parseTja(document.getElementById("tjaInput").value);
      return {
        title: parsed.headers.title,
        bpm: parsed.headers.bpm,
        measures: parsed.measures.length,
        notes: parsed.notes.length,
        slots: parsed.measures.every((m) => m.slots === 16 && m.notes === 0),
        song: document.getElementById("song").textContent,
        file: window.BachiOriginal ? window.BachiOriginal.getFile() : "missing",
      };
    });
    check(blank.title === "未命名", "title " + blank.title);
    check(blank.bpm === 120, "bpm " + blank.bpm);
    check(blank.measures === 8, "measures " + blank.measures);
    check(blank.notes === 0, "blank chart has notes");
    check(blank.slots, "blank measures are not 16 rests");
    check(blank.song.includes("未命名"), "heading " + blank.song);
    check(blank.file == null, "blank chart kept an original song");
    const blankChrome = await page.evaluate(() => ({
      fields: !document.getElementById("settingsBlankFields").hidden,
      courses: document.querySelectorAll("#coursePicker button").length,
    }));
    check(blankChrome.fields && blankChrome.courses === 0, "blank chart shows fields and hides difficulty");
    assertFields("desktop settings", await fieldLayout("settings"));
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    assertFields("narrow settings", await fieldLayout("settings"));
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    const quiet = dialogs.length;
    dialogMode = "fail";
    await page.click("#settingsOpenBlank");
    check(dialogs.length === quiet, "empty chart asked to confirm again");
    dialogMode = "accept";

    await page.click("#btnOpenEditor");
    await page.waitForSelector(".editor-measure");
    const bars = await page.$$eval(".editor-measure", (els) => els.length);
    check(bars === 8, "editor did not show 8 measures, got " + bars);

    await page.click("#editorAddNoteHintBtn");
    const addHelp = await page.evaluate(() => {
      const pop = document.getElementById("editorAddNoteHint");
      const standing = [...document.querySelectorAll("p, label, .hint, .editor-field-hint")]
        .filter((el) => !el.closest(".route-hint"))
        .some((el) => el.textContent.includes("先选咚或咔"));
      return { open: pop.matches(":popover-open"), text: pop.textContent, standing: standing };
    });
    check(addHelp.open, "加入音符 hint did not open");
    check(addHelp.text.includes(ADD_HELP), "加入音符 hint missing explanation");
    check(addHelp.text.includes("16 分"), "加入音符 hint missing grid");
    check(!addHelp.standing, "加入音符 explanation is standing copy");
    check(!addHelp.text.includes("咕") && !addHelp.text.includes("咛"), "加入音符 hint typo");
    await page.evaluate(() => {
      const pop = document.getElementById("editorAddNoteHint");
      if (pop.matches(":popover-open")) pop.hidePopover();
    });

    await page.click("#editorAddNoteBtn");
    await page.waitForSelector(".editor-cell");
    const pressed = await page.$eval("#editorAddNoteBtn", (el) => el.getAttribute("aria-pressed"));
    check(pressed === "true", "加入音符 did not turn on");

    await page.click('#editorHandSeg [data-hand="L"]');
    const handOn = await page.$eval('#editorHandSeg [data-hand="L"]', (el) => el.getAttribute("aria-checked"));
    check(handOn === "true", "惯用手 did not change while 加入音符 is on");
    await page.click('#editorHandSeg [data-hand="R"]');

    async function choose(face, size) {
      await page.click('#editorFaceSeg [data-face="' + face + '"]');
      await page.click('#editorSizeSeg [data-size="' + size + '"]');
    }
    async function clickCell(measure, cell) {
      const handle = await page.$('.editor-cell[data-measure="' + measure + '"][data-cell="' + cell + '"]');
      if (!handle) throw new Error("missing cell " + measure + ":" + cell);
      await handle.click();
    }
    await choose("don", "normal");
    await clickCell(1, 0);
    await choose("ka", "normal");
    await clickCell(1, 4);
    await choose("don", "big");
    await clickCell(1, 8);
    await choose("ka", "big");
    await clickCell(1, 12);

    const placed = await page.evaluate(() => {
      const parsed = window.TaikoParser.parseTja(document.getElementById("tjaInput").value);
      return {
        notes: parsed.notes.map((n) => ({ type: n.type, char: n.char, pos: n.pos, measure: n.measure })),
        dots: [...document.querySelectorAll(".editor-note")].map((el) => ({
          ka: el.classList.contains("is-ka"),
          big: el.classList.contains("is-big"),
        })),
      };
    });
    check(placed.notes.length === 4, "placed " + placed.notes.length + " notes");
    check(JSON.stringify(placed.notes.map((n) => n.type)) === JSON.stringify(["don", "ka", "bigdon", "bigka"]),
      "types " + JSON.stringify(placed.notes));
    check(JSON.stringify(placed.notes.map((n) => n.char)) === JSON.stringify(["1", "2", "3", "4"]),
      "chars " + JSON.stringify(placed.notes));
    check(JSON.stringify(placed.notes.map((n) => n.pos)) === JSON.stringify([0, 4, 8, 12]),
      "cells " + JSON.stringify(placed.notes));
    check(placed.dots.length === 4, "dots " + placed.dots.length);
    check(placed.dots[0].ka === false && placed.dots[0].big === false, "咚 normal class");
    check(placed.dots[1].ka === true && placed.dots[1].big === false, "咔 normal class");
    check(placed.dots[2].ka === false && placed.dots[2].big === true, "大咚 class");
    check(placed.dots[3].ka === true && placed.dots[3].big === true, "大咔 class");

    const beforePan = placed.notes.length;
    await page.evaluate(() => { document.getElementById("editorScroll").scrollLeft = 0; });
    const panCell = await page.$('.editor-cell[data-measure="2"][data-cell="2"]');
    const panBox = await panCell.boundingBox();
    check(!!panBox, "pan cell has no box");
    if (panBox) {
      const x = panBox.x + panBox.width * 0.75;
      const y = panBox.y + panBox.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 140, y, { steps: 8 });
      await page.mouse.up();
    }
    const cellDrag = await page.evaluate(() => ({
      left: document.getElementById("editorScroll").scrollLeft,
      notes: window.TaikoParser.parseTja(document.getElementById("tjaInput").value).notes.length,
    }));
    check(cellDrag.left < 2, "dragging a grid cell panned the chart, scrollLeft=" + cellDrag.left);
    check(cellDrag.notes === beforePan, "dragging a cell placed or deleted a note");

    await page.evaluate(() => { document.getElementById("editorScroll").scrollLeft = 0; });
    const emptyPan = await page.evaluate(() => {
      const hands = document.querySelector('.editor-measure[data-index="2"] .editor-hands');
      const r = hands.getBoundingClientRect();
      const scroll = document.getElementById("editorScroll").getBoundingClientRect();
      const x = Math.min(r.right - 24, scroll.right - 24);
      const y = r.top + r.height / 2;
      const el = document.elementFromPoint(x, y);
      return {
        x: x,
        y: y,
        empty: !!(el && !el.closest(".editor-note, .editor-string, .editor-cell, button, a, input, textarea, label")),
      };
    });
    check(emptyPan.empty, "measure 2 hands row is not empty space");
    if (emptyPan.empty) {
      await page.mouse.move(emptyPan.x, emptyPan.y);
      await page.mouse.down();
      await page.mouse.move(emptyPan.x - 140, emptyPan.y, { steps: 8 });
      await page.mouse.up();
    }
    const pan = await page.evaluate(() => ({
      left: document.getElementById("editorScroll").scrollLeft,
      notes: window.TaikoParser.parseTja(document.getElementById("tjaInput").value).notes.length,
    }));
    check(pan.left > 20, "dragging empty space did not pan, scrollLeft=" + pan.left);
    check(pan.notes === beforePan, "panning placed or deleted a note");

    await page.click('.editor-note[data-index="0"]');
    const deleted = await page.evaluate(() => {
      const parsed = window.TaikoParser.parseTja(document.getElementById("tjaInput").value);
      return parsed.notes.map((n) => n.type);
    });
    check(JSON.stringify(deleted) === JSON.stringify(["ka", "bigdon", "bigka"]),
      "delete left " + JSON.stringify(deleted));

    await page.$eval("#editorAddMeasure", (el) => el.scrollIntoView({ block: "nearest", inline: "nearest" }));
    await page.click("#editorAddMeasure");
    const appended = await page.evaluate(() => {
      const parsed = window.TaikoParser.parseTja(document.getElementById("tjaInput").value);
      const last = parsed.measures[parsed.measures.length - 1];
      return {
        measures: parsed.measures.length,
        notes: parsed.notes.length,
        lastSlots: last.slots,
        lastNotes: last.notes,
        label: document.getElementById("editorAddMeasure") ? document.getElementById("editorAddMeasure").textContent.trim() : "",
      };
    });
    check(appended.label === "加一小节", "append label " + appended.label);
    check(appended.measures === 9, "measures after append " + appended.measures);
    check(appended.notes === 3, "append changed notes");
    check(appended.lastSlots === 16 && appended.lastNotes === 0, "new measure is not empty");

    await page.click("#editorAddNoteBtn");
    const off = await page.evaluate(() => ({
      pressed: document.getElementById("editorAddNoteBtn").getAttribute("aria-pressed"),
      cells: document.querySelectorAll(".editor-cell").length,
      picker: document.getElementById("editorNotePicker").hidden,
      add: document.getElementById("editorAddMeasure"),
    }));
    check(off.pressed === "false", "mode stayed on");
    check(off.cells === 0, "16th cells stayed after mode off");
    check(off.picker === true, "picker stayed visible");
    check(!off.add, "加一小节 stayed after mode off");

    const notesBeforeSwap = await page.$$eval(".editor-note", (els) => els.length);
    const handBefore = await page.evaluate(() => window.BachiEditor.getResolved().hands[0]);
    await page.click('.editor-note[data-index="0"]');
    const swap = await page.evaluate(() => ({
      hidden: document.getElementById("editorSwapPop").hidden,
      notes: document.querySelectorAll(".editor-note").length,
      hand: window.BachiEditor.getResolved().hands[0],
      selection: window.BachiEditor.getState().selection,
      playing: !!(window.taikoAnim && window.taikoAnim.state && window.taikoAnim.state.playing),
    }));
    check(swap.hidden === true, "single note click opened the swap popup");
    check(swap.hand !== handBefore, "mode off did not swap the note");
    check(swap.selection && swap.selection.type === "note" && swap.selection.index === 0, "swap cleared the selection");
    check(!swap.playing, "swap started playback");
    check(swap.notes === notesBeforeSwap, "mode off still deleted the note");

    const from = await page.$('.editor-note[data-index="0"]');
    const to = await page.$('.editor-note[data-index="1"]');
    const fromBox = await from.boundingBox();
    const toBox = await to.boundingBox();
    check(!!fromBox && !!toBox, "range notes have no box");
    if (fromBox && toBox) {
      await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 10 });
      await page.mouse.up();
    }
    const range = await page.$eval("#editorRangePop", (el) => ({
      hidden: el.hidden,
      labels: [...el.querySelectorAll("button")].map((b) => b.textContent.trim()).join(","),
    }));
    check(range.hidden === false, "mode off did not restore range select");
    check(range.labels === "1-2,2-1,2-2,循环试听", "range actions " + range.labels);

    await page.click("#editorAdvancedBtn");
    await page.waitForSelector("#editorAdvancedPanel:not([hidden])");
    await page.$eval("#editorBlankBpm", (el) => { el.value = "100"; });
    await page.$eval("#editorBlankMeasures", (el) => { el.value = "4"; });
    const settingsFields = await page.evaluate(() => ({
      bpm: document.getElementById("settingsBlankBpm").value,
      measures: document.getElementById("settingsBlankMeasures").value,
    }));
    check(settingsFields.bpm === "120" && settingsFields.measures === "8", "settings fields changed");
    const dialogAt = dialogs.length;
    dialogMode = "accept";
    await page.click("#editorOpenBlank");
    check(dialogs.length === dialogAt + 1, "editor entry did not confirm a dirty chart");
    const fromEditor = await page.evaluate(() => {
      const parsed = window.TaikoParser.parseTja(document.getElementById("tjaInput").value);
      return {
        title: parsed.headers.title,
        bpm: parsed.headers.bpm,
        measures: parsed.measures.length,
        notes: parsed.notes.length,
      };
    });
    check(fromEditor.title === "未命名" && fromEditor.bpm === 100 && fromEditor.measures === 4 && fromEditor.notes === 0,
      "editor 打开空谱面 result " + JSON.stringify(fromEditor));

    await page.evaluate(() => {
      const pop = document.getElementById("editorBlankHint");
      const btn = document.getElementById("editorBlankHintBtn");
      if (pop.matches(":popover-open")) pop.hidePopover();
      btn.click();
      return pop.textContent;
    });
    const editorHelp = await page.evaluate(() => {
      const pop = document.getElementById("editorBlankHint");
      const standing = [...document.querySelectorAll("#editorAdvancedPanel p, #editorAdvancedPanel label")]
        .filter((el) => !el.closest(".route-hint"))
        .some((el) => el.textContent.includes("用填写的歌名"));
      return { open: pop.matches(":popover-open"), text: pop.textContent, standing: standing };
    });
    check(editorHelp.open, "editor blank hint did not open");
    check(editorHelp.text.includes(BLANK_HELP), "editor blank hint missing explanation");
    check(editorHelp.text.includes("打开之后"), "editor hint missing later edit");
    check(!editorHelp.standing, "editor blank explanation is standing copy");

    assertFields("desktop editor", await fieldLayout("editor"));
    await page.evaluate(() => {
      if (window.BachiEditor && window.BachiEditor.close) window.BachiEditor.close();
      document.getElementById("settingsOpen").open = true;
    });

    async function fill(id, value) {
      await page.evaluate((fieldId, fieldValue) => {
        const el = document.getElementById(fieldId);
        el.value = fieldValue;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, id, value);
    }
    async function chartNow() {
      return page.evaluate(() => {
        const parsed = window.TaikoParser.parseTja(document.getElementById("tjaInput").value);
        const song = document.getElementById("song");
        const bar = document.getElementById("titlebarTitle");
        return {
          title: parsed.headers.title,
          bpm: parsed.headers.bpm,
          measures: parsed.measures.length,
          notes: parsed.notes.length,
          song: song.dataset.fullText || song.textContent,
          bar: bar ? (bar.dataset.fullText || bar.textContent) : "",
          settingsTitle: document.getElementById("settingsBlankTitle").value,
          settingsBpm: document.getElementById("settingsBlankBpm").value,
          editorTitle: document.getElementById("editorBlankTitle").value,
          editorBpm: document.getElementById("editorBlankBpm").value,
          titleLocked: document.getElementById("settingsBlankTitle").disabled || document.getElementById("settingsBlankTitle").readOnly,
          bpmLocked: document.getElementById("settingsBlankBpm").disabled || document.getElementById("settingsBlankBpm").readOnly,
        };
      });
    }

    await fill("settingsBlankTitle", "空谱甲");
    await fill("settingsBlankBpm", "144");
    await fill("settingsBlankMeasures", "6");
    const dialogsAtCreate = dialogs.length;
    await page.click("#settingsOpenBlank");
    check(dialogs.length === dialogsAtCreate, "empty chart confirmed again while creating a named blank chart");
    const created = await chartNow();
    check(created.title === "空谱甲" && created.bpm === 144 && created.measures === 6 && created.notes === 0,
      "create with title and bpm " + JSON.stringify(created));
    check(created.song.includes("空谱甲") && created.song.includes("BPM 144"), "page song " + created.song);
    check(created.bar === "空谱甲", "title bar " + created.bar);
    check(created.editorTitle === "空谱甲" && created.editorBpm === "144", "editor fields did not follow create " + JSON.stringify(created));
    check(!created.titleLocked && !created.bpmLocked, "title or bpm locked after create");

    await fill("settingsBlankTitle", "空谱乙");
    const renamed = await chartNow();
    check(renamed.title === "空谱乙" && renamed.bpm === 144 && renamed.measures === 6,
      "rename locked or rewrote the chart " + JSON.stringify(renamed));
    check(renamed.title !== "未命名", "rename fell back to 未命名");
    check(renamed.song.includes("空谱乙") && renamed.bar === "空谱乙", "page song did not follow rename " + renamed.song + " / " + renamed.bar);
    check(renamed.editorTitle === "空谱乙", "editor title stayed behind");

    await fill("settingsBlankBpm", "132");
    const retimed = await chartNow();
    check(retimed.title === "空谱乙" && retimed.bpm === 132 && retimed.measures === 6,
      "bpm edit " + JSON.stringify(retimed));
    check(retimed.bpm !== 120 && retimed.bpm !== 144, "bpm stayed on a fixed value");
    check(retimed.song.includes("BPM 132") && retimed.song.includes("空谱乙"), "page song bpm " + retimed.song);
    check(retimed.editorBpm === "132", "editor bpm stayed behind");

    await page.evaluate(() => { document.getElementById("settingsBlankMeasures").value = "2"; });
    const measuresKept = await chartNow();
    check(measuresKept.measures === 6, "measure field rewrote the open chart");

    await page.click("#btnOpenEditor");
    await page.click("#editorAdvancedBtn");
    await page.waitForSelector("#editorAdvancedPanel:not([hidden])");
    await fill("editorBlankTitle", "空谱丙");
    await fill("editorBlankBpm", "150");
    const fromEditorFields = await chartNow();
    check(fromEditorFields.title === "空谱丙" && fromEditorFields.bpm === 150 && fromEditorFields.measures === 6,
      "editor rename " + JSON.stringify(fromEditorFields));
    check(fromEditorFields.song.includes("空谱丙") && fromEditorFields.song.includes("BPM 150"),
      "page song after editor edit " + fromEditorFields.song);
    check(fromEditorFields.settingsTitle === "空谱丙" && fromEditorFields.settingsBpm === "150",
      "settings fields stayed behind the editor");

    await page.click("#editorAddNoteBtn");
    await page.waitForSelector(".editor-cell");
    await page.click('.editor-cell[data-measure="1"][data-cell="0"]');
    const stillEditing = await chartNow();
    check(stillEditing.notes === 1 && stillEditing.title === "空谱丙" && stillEditing.bpm === 150,
      "editing after rename " + JSON.stringify(stillEditing));
    check(stillEditing.song.includes("空谱丙"), "page song dropped after a note was added");

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.evaluate(() => {
      if (window.BachiEditor && window.BachiEditor.expandAdvanced) window.BachiEditor.expandAdvanced(true);
    });
    assertFields("narrow editor", await fieldLayout("editor"));

    await page.evaluate(() => {
      document.getElementById("tjaInput").dispatchEvent(new Event("input", { bubbles: true }));
      const el = document.getElementById("settingsBlankTitle");
      el.value = "不该写上";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const stopped = await chartNow();
    check(stopped.title === "空谱丙", "hand-edited tja still accepted blank-field rewrites " + stopped.title);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  if (fails.length) {
    console.error("FAIL chart author UI\n" + fails.join("\n"));
    process.exit(1);
  }
  console.log("ok: blank chart, 16th notes, editor 高级, hints in ! popovers");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
