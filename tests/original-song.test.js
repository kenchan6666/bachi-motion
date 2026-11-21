/**
 * Shared original-song selection. No official charts or audio.
 *
 *   node tests/original-song.test.js
 */
"use strict";

const fs = require("fs");
const os = require("os");
const http = require("http");
const path = require("path");
const assert = require("assert");

const song = require(path.join(__dirname, "..", "js", "original-song.js"));

let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log("  ✓ " + name);
}

function fakeMedia(opts) {
  opts = opts || {};
  return {
    currentTime: opts.currentTime || 0,
    playbackRate: opts.playbackRate == null ? 1 : opts.playbackRate,
    paused: opts.paused !== false,
    playCount: 0,
    pauseCount: 0,
    play: function () { this.playCount += 1; this.paused = false; },
    pause: function () { this.pauseCount += 1; this.paused = true; },
  };
}

check("nothing selected leaves the 原曲 switch off and disabled", () => {
  const view = song.selectionView(null);
  const control = song.controlView(null, true);
  assert.strictEqual(view.name, "");
  assert.strictEqual(view.clear, false);
  assert.strictEqual(control.label, "原曲");
  assert.strictEqual(control.label, song.SWITCH_LABEL);
  assert.strictEqual(control.disabled, true);
  assert.strictEqual(control.checked, false);
});

check("a chosen file shows its name and can clear", () => {
  const view = song.selectionView({ name: "home.ogg" });
  assert.strictEqual(view.name, "home.ogg");
  assert.strictEqual(view.clear, true);
  const off = song.controlView({ name: "home.ogg" }, false);
  const on = song.controlView({ name: "home.ogg" }, true);
  assert.strictEqual(off.disabled, false);
  assert.strictEqual(off.checked, false);
  assert.strictEqual(on.disabled, false);
  assert.strictEqual(on.checked, true);
});

check("no file means preview stays silent", () => {
  assert.strictEqual(song.previewClock(null, { now: 0, playing: true, rate: 1, offset: -2 }), null);
});

check("preview lines up at chart time and does not subtract OFFSET again", () => {
  const file = { name: "home.wav" };
  // OFFSET -2 → first note audio time is 2. Picture starts at 1.3.
  const atStart = song.previewClock(file, {
    now: 1.3, playing: true, rate: 1, timeShift: 0, offset: -2,
  });
  assert.strictEqual(atStart.currentTime, 1.3);
  assert.notStrictEqual(atStart.currentTime, 1.3 - (-2));
  assert.strictEqual(atStart.play, true);
  assert.strictEqual(atStart.playbackRate, 1);

  const lead = song.previewClock(file, {
    now: -0.7, playing: true, rate: 0.5, timeShift: 0, offset: 1.25,
  });
  assert.strictEqual(lead.currentTime, 0);
  assert.strictEqual(lead.play, false);
  assert.strictEqual(lead.playbackRate, 0.5);

  const shifted = song.previewClock(file, {
    now: 0, playing: true, rate: 1, timeShift: 4, offset: -2,
  });
  assert.strictEqual(shifted.currentTime, 4);
  assert.notStrictEqual(shifted.currentTime, 4 - (-2));
});

check("a paused preview does not play", () => {
  const clock = song.previewClock({ name: "a.flac" }, { now: 2, playing: false, rate: 1, timeShift: 0 });
  assert.strictEqual(clock.play, false);
  assert.strictEqual(clock.currentTime, 2);
  const media = fakeMedia({ paused: false, currentTime: 0 });
  song.applyPreview(media, clock);
  assert.strictEqual(media.pauseCount, 1);
  assert.strictEqual(media.paused, true);
  assert.strictEqual(media.currentTime, 2);
  assert.strictEqual(media.playCount, 0);
});

check("playback seeks once and does not restart while it is already in time", () => {
  const file = { name: "a.mp4" };
  const target = song.previewClock(file, { now: 1.3, playing: true, rate: 1, offset: -2 });
  const media = fakeMedia();
  song.applyPreview(media, target);
  assert.strictEqual(media.currentTime, 1.3);
  assert.strictEqual(media.playCount, 1);
  assert.strictEqual(media.paused, false);
  media.currentTime = 1.32;
  song.applyPreview(media, target);
  assert.strictEqual(media.currentTime, 1.32);
  assert.strictEqual(media.playCount, 1);
});

check("switch off or no file means preview and export stay silent", () => {
  song.setFile(null);
  assert.strictEqual(song.setEnabled(true), false);
  assert.strictEqual(song.isEnabled(), false);
  assert.strictEqual(song.activeFile(), null);
  assert.strictEqual(song.getFile(), null);
  assert.strictEqual(song.playbackTarget(null, true, { now: 1.3, playing: true, rate: 1 }), null);

  song.setFile({ name: "home.wav" });
  assert.strictEqual(song.isEnabled(), false);
  assert.strictEqual(song.getFile().name, "home.wav");
  assert.strictEqual(song.activeFile(), null);
  const silent = song.playbackTarget(song.getFile(), song.isEnabled(), {
    now: 1.3, playing: true, rate: 1, timeShift: 0, offset: -2,
  });
  assert.strictEqual(silent, null);

  song.setEnabled(false);
  assert.strictEqual(song.getFile().name, "home.wav");
  assert.strictEqual(song.activeFile(), null);
  song.setFile(null);
});

check("switch on uses the chosen file and does not subtract OFFSET again", () => {
  const file = { name: "home.wav" };
  song.setFile(file);
  assert.strictEqual(song.setEnabled(true), true);
  assert.strictEqual(song.isEnabled(), true);
  assert.strictEqual(song.activeFile(), file);
  const target = song.playbackTarget(song.activeFile(), song.isEnabled(), {
    now: 1.3, playing: true, rate: 1, timeShift: 0, offset: -2,
  });
  assert.strictEqual(target.currentTime, 1.3);
  assert.notStrictEqual(target.currentTime, 1.3 - (-2));
  assert.strictEqual(target.play, true);
  song.setEnabled(false);
  assert.strictEqual(song.activeFile(), null);
  assert.strictEqual(song.getFile(), file);
  song.setFile(null);
});

check("clearing the file turns the switch off and a new file can stay on", () => {
  song.setFile({ name: "first.ogg" });
  song.setEnabled(true);
  song.setFile(null);
  assert.strictEqual(song.getFile(), null);
  assert.strictEqual(song.isEnabled(), false);
  assert.strictEqual(song.setEnabled(true), false);
  const next = { name: "second.ogg" };
  song.setFile(next);
  song.setEnabled(true);
  const replaced = { name: "third.ogg" };
  song.setFile(replaced);
  assert.strictEqual(song.isEnabled(), true);
  assert.strictEqual(song.activeFile(), replaced);
  song.setFile(null);
});

check("both previews read the same chosen file while the switch is on", () => {
  const file = { name: "stay.wav" };
  song.setFile(file);
  song.setEnabled(true);
  // Opening and closing the editor must not be required to touch this module.
  // The same object is what both previews read after the user comes back.
  assert.strictEqual(song.getFile(), file);
  assert.strictEqual(song.isEnabled(), true);
  assert.strictEqual(song.activeFile(), file);
  const home = song.playbackTarget(song.activeFile(), true, {
    now: 1.3, playing: true, rate: 1, timeShift: 0, offset: 0,
  });
  const editor = song.playbackTarget(song.activeFile(), song.isEnabled(), {
    now: 1.3, playing: true, rate: 1, timeShift: 0, offset: 0,
  });
  assert.strictEqual(home.play, true);
  assert.strictEqual(editor.play, true);
  assert.strictEqual(home.currentTime, editor.currentTime);
  song.setFile(null);
});

function sliceBetween(html, startMark, endMark) {
  const start = html.indexOf(startMark);
  const end = html.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, startMark + " → " + endMark);
  return html.slice(start, end);
}

function withoutPopover(html, id) {
  const mark = 'id="' + id + '"';
  const start = html.indexOf(mark);
  const end = html.indexOf("</div>", start);
  assert.ok(start >= 0 && end > start, id);
  return html.slice(0, start) + html.slice(end);
}

check("原曲 switches sit beside 叠打点声; explanation lives in the !", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.strictEqual(html.split("打开原曲").length - 1, 1);
  assert.strictEqual(html.split("不要原曲").length - 1, 1);
  assert.strictEqual((html.match(/>选择原曲<input/g) || []).length, 0);
  assert.strictEqual(html.split(song.ACCEPT).length - 1, 1);
  assert.strictEqual(html.split("data-original-use").length - 1, 2);
  assert.strictEqual(html.split(">原曲</label>").length - 1, 2);
  assert.strictEqual(html.split("叠打点声（合成 don/ka，不是原曲）").length - 1, 0);
  assert.ok(!html.includes("未选择原曲：预览和出片都不含原曲。"));
  for (const line of song.EXPLAIN) {
    assert.strictEqual(html.split(line).length - 1, 2, line);
    assert.ok(!/[咕咛咞咐呼咩]/.test(line), line);
  }

  const editorAt = html.indexOf('id="editor"');
  assert.ok(editorAt > 0);
  assert.ok(!html.includes("谱面与设置"));
  assert.ok(!html.includes('id="settingsAdvanced"'));
  const home = html.slice(0, editorAt);
  for (const id of ["settingsOpen", "settingsHands", "settingsPlay"]) {
    const at = home.indexOf('id="' + id + '"');
    assert.ok(at >= 0, id);
    const tag = home.slice(Math.max(0, at - 80), at + 40);
    const openTag = tag.slice(tag.lastIndexOf("<details"));
    assert.ok(openTag.startsWith("<details"), id + " " + openTag);
    assert.ok(!/\sopen(\s|>|=)/.test(openTag.split(">")[0]), id + " starts open");
  }
  const stackAt = home.indexOf('id="settingsStack"');
  assert.ok(stackAt >= 0);
  const stack = home.slice(stackAt);
  assert.ok(!stack.includes('id="settingsOriginalUse"'));
  assert.ok(!stack.includes('id="originalHint"'));
  assert.ok(!stack.includes("data-original-use"));
  assert.ok(!stack.includes(">原曲</label>"));
  assert.ok(!stack.includes("打开原曲"));
  assert.ok(!stack.includes("data-original-song"));
  assert.ok(!stack.includes("不要原曲"));
  for (const line of song.EXPLAIN) assert.ok(!stack.includes(line), line);

  const homeHits = sliceBetween(html, 'class="preview-hits"', 'class="rates"');
  assert.ok(homeHits.indexOf('id="previewHits"') < homeHits.indexOf('id="settingsOriginalUse"'));
  const homeTag = homeHits.match(/<input id="settingsOriginalUse"[^>]*>/);
  assert.ok(homeTag && homeTag[0].includes("data-original-use") && homeTag[0].includes("disabled"), homeTag && homeTag[0]);
  assert.ok(homeHits.includes(">原曲</label>"));
  assert.ok(homeHits.includes('id="originalHintBtn"'));
  const homePop = sliceBetween(homeHits, 'id="originalHint"', "</div>");
  const homeRest = withoutPopover(homeHits, "originalHint");
  for (const line of song.EXPLAIN) {
    assert.ok(homePop.includes(line), line);
    assert.ok(!homeRest.includes(line), line);
  }

  const editorHits = sliceBetween(html, 'class="editor-preview-hits"', 'class="editor-preview-legend"');
  assert.ok(editorHits.indexOf('id="editorPreviewHits"') < editorHits.indexOf('id="editorOriginalUse"'));
  const editorTag = editorHits.match(/<input id="editorOriginalUse"[^>]*>/);
  assert.ok(editorTag && editorTag[0].includes("data-original-use") && editorTag[0].includes("disabled"), editorTag && editorTag[0]);
  assert.ok(editorHits.includes(">原曲</label>"));
  assert.ok(editorHits.includes('id="editorOriginalHintBtn"'));
  const editorPop = sliceBetween(editorHits, 'id="editorOriginalHint"', "</div>");
  const editorRest = withoutPopover(editorHits, "editorOriginalHint");
  for (const line of song.EXPLAIN) {
    assert.ok(editorPop.includes(line), line);
    assert.ok(!editorRest.includes(line), line);
  }

  const panelStart = html.indexOf('id="editorAdvancedPanel"');
  const panel = html.slice(panelStart, html.indexOf('id="editorScroll"'));
  assert.ok(panel.includes("打开原曲"));
  assert.ok(panel.includes('id="editorOriginalSong"'));
  assert.ok(panel.includes('type="file"'));
  assert.ok(panel.includes("不要原曲"));
  assert.ok(panel.includes("导入 JSON"));
  assert.ok(panel.includes("导出 JSON"));
  assert.ok(panel.includes("打开 TJA"));
  assert.ok(!panel.includes("data-original-use"));
  assert.ok(!panel.includes(">原曲</label>"));
  assert.ok(!panel.includes('id="editorOriginalUse"'));
  for (const line of song.EXPLAIN) assert.ok(!panel.includes(line), line);

  let outside = withoutPopover(html, "originalHint");
  outside = withoutPopover(outside, "editorOriginalHint");
  for (const line of song.EXPLAIN) assert.ok(!outside.includes(line), line);

  const editorJs = fs.readFileSync(path.join(__dirname, "..", "js", "editor.js"), "utf8");
  function fnBody(name, next) {
    const start = editorJs.indexOf("function " + name);
    const end = editorJs.indexOf("function " + next);
    assert.ok(start >= 0 && end > start, name);
    return editorJs.slice(start, end);
  }
  for (const body of [fnBody("openEditor", "closeEditor"), fnBody("closeEditor", "refitTitles")]) {
    assert.ok(!body.includes("BachiOriginal"), body.slice(0, 40));
    assert.ok(!body.includes("setFile"));
    assert.ok(!body.includes("setEnabled"));
    assert.ok(!body.includes("settingsOriginalUse"));
    assert.ok(!body.includes("editorOriginalUse"));
  }

  const batchUi = fs.readFileSync(path.join(__dirname, "..", "js", "batch-ui.js"), "utf8");
  assert.ok(batchUi.includes(song.ACCEPT));
  const sharedFn = batchUi.slice(batchUi.indexOf("function sharedOriginalFile"), batchUi.indexOf("function chartName"));
  assert.ok(sharedFn.includes("activeFile()"));
  const addStart = batchUi.indexOf("if (addCurrent)");
  const addBody = batchUi.slice(addStart, batchUi.indexOf("startBtn.addEventListener", addStart));
  assert.ok(addBody.includes("sharedOriginalFile()"));
  assert.ok(!addBody.includes("defaultSong"));
  const addFiles = batchUi.slice(batchUi.indexOf("if (tjaInput)"), addStart);
  assert.ok(addFiles.includes("defaultSong"));

  const server = fs.readFileSync(path.join(__dirname, "..", "js", "render-server.js"), "utf8");
  assert.ok(server.includes('".mp4": true'));
  const engine = fs.readFileSync(path.join(__dirname, "..", "js", "engine.js"), "utf8");
  assert.ok(engine.includes("function syncOriginalSong"));
  assert.ok(engine.includes("offset: state.offset"));
  assert.ok(engine.includes('src="js/original-song.js"') === false);
  assert.ok(html.includes('src="js/original-song.js"'));
  const app = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
  assert.ok(app.includes('setupRouteHint("originalHintBtn", "originalHint")'));
  assert.ok(app.includes('setupRouteHint("editorOriginalHintBtn", "editorOriginalHint")'));
});

function silentWav() {
  const samples = 800;
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(8000, 24);
  buf.writeUInt32LE(16000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

function loadPuppeteer() {
  const root = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));
  try { return require(path.join(root, "node_modules", "puppeteer-core")); }
  catch (err) { return require("puppeteer-core"); }
}

function startStaticServer(root) {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".wav": "audio/wav",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
  };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/") rel = "/index.html";
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function songState() {
  const api = window.BachiOriginal;
  const box = document.getElementById("settingsOriginalUse");
  const editorBox = document.getElementById("editorOriginalUse");
  const file = api.getFile();
  const active = api.activeFile();
  const target = api.playbackTarget(active, api.isEnabled(), {
    now: 1.3, playing: true, rate: 1, timeShift: 0, offset: -2,
  });
  const player = api.player();
  const folds = [...document.querySelectorAll(".rail details.settings")];
  const pop = document.getElementById("originalHint");
  const editorPop = document.getElementById("editorOriginalHint");
  const homeRow = box.closest(".preview-hits");
  const editorRow = editorBox.closest(".editor-preview-hits");
  function rect(id) {
    const el = document.getElementById(id);
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  }
  return {
    disabled: box.disabled,
    checked: box.checked,
    label: box.parentElement.textContent.replace(/\s+/g, ""),
    editorDisabled: editorBox.disabled,
    editorChecked: editorBox.checked,
    editorLabel: editorBox.parentElement.textContent.replace(/\s+/g, ""),
    homeBesideHits: !!(homeRow && homeRow.querySelector("#previewHits") && !box.closest("details.settings")),
    editorBesideHits: !!(editorRow && editorRow.querySelector("#editorPreviewHits") && !document.getElementById("editorAdvancedPanel").contains(editorBox)),
    settingsHasSwitch: folds.some((el) => !!el.querySelector("[data-original-use], #originalHint, #settingsOriginalUse")),
    fileName: file ? file.name : "",
    activeName: active ? active.name : "",
    enabled: api.isEnabled(),
    play: !!(target && target.play),
    currentTime: target ? target.currentTime : null,
    src: player && player.src ? player.src : "",
    editorName: document.getElementById("editorOriginalName").textContent,
    homepageFiles: folds.reduce((n, el) => n + el.querySelectorAll("input[data-original-song]").length, 0),
    editorFiles: document.querySelectorAll("#editorAdvancedPanel input[type=file][data-original-song]").length,
    explainOnPage: folds.some((el) => el.textContent.includes("原曲文件在手顺编辑器")),
    explainInPopover: pop.textContent.includes("原曲文件在手顺编辑器")
      && pop.textContent.includes("从第一个音 − 0.7 秒对齐")
      && editorPop.textContent.includes("原曲文件在手顺编辑器")
      && editorPop.textContent.includes("从第一个音 − 0.7 秒对齐"),
    queueSongs: Array.from(document.querySelectorAll("#batchList .batch-song")).map((el) => el.textContent),
    homeHits: rect("previewHits"),
    homeOriginal: rect("settingsOriginalUse"),
    editorHits: rect("editorPreviewHits"),
    editorOriginal: rect("editorOriginalUse"),
  };
}

function assertSynced(state, where) {
  assert.strictEqual(state.editorChecked, state.checked, where + " checked");
  assert.strictEqual(state.editorDisabled, state.disabled, where + " disabled");
  assert.strictEqual(state.label, "原曲", where + " home label");
  assert.strictEqual(state.editorLabel, "原曲", where + " editor label");
  assert.strictEqual(state.homeBesideHits, true, where);
  assert.strictEqual(state.editorBesideHits, true, where);
  assert.strictEqual(state.settingsHasSwitch, false, where);
}

function follows(prev, next) {
  const sameRow = next.y < prev.bottom && prev.y < next.bottom && next.x >= prev.x - 1;
  const nextLine = next.y >= prev.bottom - 2;
  const overlaps = next.x < prev.right && prev.x < next.right && next.y < prev.bottom && prev.y < next.bottom;
  return (sameRow || nextLine) && !overlaps;
}

function assertBeside(prev, next, where) {
  assert.ok(prev.w > 0 && next.w > 0, where + " not laid out " + JSON.stringify({ prev, next }));
  assert.ok(follows(prev, next), where + " not beside 叠打点声 " + JSON.stringify({ prev, next }));
}

function assertHintNear(box, where) {
  assert.strictEqual(box.open, true, where + " hint closed");
  assert.ok(box.pop.x > 8 && box.pop.y > 8, where + " hint at origin " + JSON.stringify(box.pop));
  const gap = 10;
  const below = Math.abs(box.pop.y - (box.btn.bottom + gap));
  const above = Math.abs((box.pop.bottom + gap) - box.btn.top);
  const vertical = Math.min(below, above);
  assert.ok(vertical <= 1.5, where + " hint not beside ! vertical=" + vertical + " " + JSON.stringify(box));
  const coversX = box.pop.x < box.btn.x + box.btn.w && box.pop.x + box.pop.w > box.btn.x;
  assert.ok(coversX, where + " hint misses the ! horizontally " + JSON.stringify(box));
}

function hintBox(hintId) {
  const pop = document.getElementById(hintId);
  const btn = document.getElementById(hintId + "Btn");
  if (pop.matches(":popover-open")) pop.hidePopover();
  btn.scrollIntoView({ block: "center", inline: "nearest" });
  btn.click();
  const r = pop.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  const box = (rect) => ({
    x: rect.x, y: rect.y, w: rect.width, h: rect.height,
    right: rect.right, bottom: rect.bottom, top: rect.top,
  });
  return { pop: box(r), btn: box(b), open: pop.matches(":popover-open") };
}

(async function browserRoundTrip() {
  const root = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));
  const wavPath = path.join(os.tmpdir(), "bachi-original-stay.wav");
  fs.writeFileSync(wavPath, silentWav());
  const puppeteer = loadPuppeteer();
  const chrome = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/local/bin/google-chrome";
  const { server, port } = await startStaticServer(root);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chrome,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--autoplay-policy=no-user-gesture-required"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "networkidle0", timeout: 30000 });
    const before = await page.evaluate(songState);
    assert.strictEqual(before.disabled, true);
    assert.strictEqual(before.checked, false);
    assert.strictEqual(before.label, "原曲");
    assert.strictEqual(before.fileName, "");
    assert.strictEqual(before.activeName, "");
    assert.strictEqual(before.homepageFiles, 0);
    assert.strictEqual(before.editorFiles, 1);
    assert.strictEqual(before.explainOnPage, false);
    assert.strictEqual(before.explainInPopover, true);
    assertSynced(before, "before");
    assertBeside(before.homeHits, before.homeOriginal, "homepage");
    await page.evaluate(() => document.getElementById("settingsOriginalUse").click());
    const stillOff = await page.evaluate(songState);
    assert.strictEqual(stillOff.disabled, true);
    assert.strictEqual(stillOff.checked, false);
    assertSynced(stillOff, "still off");

    const homeHint = await page.evaluate(hintBox, "originalHint");
    assertHintNear(homeHint, "homepage");
    await page.evaluate(() => document.getElementById("originalHint").hidePopover());

    await page.click("#btnOpenEditor");
    await page.waitForFunction(() => document.body.classList.contains("editor-mode"));
    await page.click("#editorAdvancedBtn");
    await page.waitForSelector("#editorAdvancedPanel:not([hidden])");
    const input = await page.$("#editorOriginalSong");
    await input.uploadFile(wavPath);
    await page.waitForFunction(() => {
      const api = window.BachiOriginal;
      return api.getFile() && api.getFile().name === "bachi-original-stay.wav";
    });
    const picked = await page.evaluate(songState);
    assert.strictEqual(picked.fileName, "bachi-original-stay.wav");
    assert.strictEqual(picked.editorName, "bachi-original-stay.wav");
    assert.strictEqual(picked.disabled, false);
    assert.strictEqual(picked.checked, false);
    assert.strictEqual(picked.activeName, "");
    assert.strictEqual(picked.enabled, false);
    assert.ok(picked.src.startsWith("blob:"));
    assertSynced(picked, "picked");
    assertBeside(picked.editorHits, picked.editorOriginal, "editor after pick");

    await page.click("#btnBackPlayer");
    await page.waitForFunction(() => !document.body.classList.contains("editor-mode"));
    const homeReady = await page.evaluate(songState);
    assert.strictEqual(homeReady.disabled, false);
    assert.strictEqual(homeReady.checked, false);
    assert.strictEqual(homeReady.fileName, "bachi-original-stay.wav");
    assertSynced(homeReady, "home ready");
    assertBeside(homeReady.homeHits, homeReady.homeOriginal, "homepage ready");
    await page.click("#settingsOriginalUse");
    const armed = await page.evaluate(songState);
    assert.strictEqual(armed.checked, true);
    assert.strictEqual(armed.enabled, true);
    assert.strictEqual(armed.activeName, "bachi-original-stay.wav");
    assert.strictEqual(armed.play, true);
    assert.strictEqual(armed.currentTime, 1.3);
    assert.notStrictEqual(armed.currentTime, 1.3 - (-2));
    const src = armed.src;

    await page.click("#btnOpenEditor");
    await page.waitForFunction(() => document.body.classList.contains("editor-mode"));
    const inEditor = await page.evaluate(songState);
    assert.strictEqual(inEditor.checked, true);
    assert.strictEqual(inEditor.disabled, false);
    assert.strictEqual(inEditor.enabled, true);
    assert.strictEqual(inEditor.fileName, "bachi-original-stay.wav");
    assert.strictEqual(inEditor.activeName, "bachi-original-stay.wav");
    assert.strictEqual(inEditor.editorName, "bachi-original-stay.wav");
    assert.strictEqual(inEditor.src, src);
    assert.strictEqual(inEditor.play, true);
    assert.strictEqual(inEditor.currentTime, 1.3);
    assertSynced(inEditor, "in editor");
    assertBeside(inEditor.editorHits, inEditor.editorOriginal, "editor");

    const editorHint = await page.evaluate(hintBox, "editorOriginalHint");
    assertHintNear(editorHint, "editor");
    await page.evaluate(() => document.getElementById("editorOriginalHint").hidePopover());
    await page.click("#editorOriginalUse");
    const editorOff = await page.evaluate(songState);
    assert.strictEqual(editorOff.checked, false);
    assert.strictEqual(editorOff.enabled, false);
    assert.strictEqual(editorOff.activeName, "");
    assert.strictEqual(editorOff.fileName, "bachi-original-stay.wav");
    assertSynced(editorOff, "editor off");
    await page.click("#editorOriginalUse");
    const editorOn = await page.evaluate(songState);
    assert.strictEqual(editorOn.checked, true);
    assert.strictEqual(editorOn.enabled, true);
    assert.strictEqual(editorOn.activeName, "bachi-original-stay.wav");
    assert.strictEqual(editorOn.src, src);
    assertSynced(editorOn, "editor on");

    await page.click("#btnBackPlayer");
    await page.waitForFunction(() => !document.body.classList.contains("editor-mode"));
    const returned = await page.evaluate(songState);
    assert.strictEqual(returned.checked, true);
    assert.strictEqual(returned.disabled, false);
    assert.strictEqual(returned.enabled, true);
    assert.strictEqual(returned.fileName, "bachi-original-stay.wav");
    assert.strictEqual(returned.activeName, "bachi-original-stay.wav");
    assert.strictEqual(returned.src, src);
    assert.strictEqual(returned.play, true);
    assert.strictEqual(returned.label, "原曲");
    assertSynced(returned, "returned");

    await page.evaluate(() => {
      document.getElementById("settingsPlay").open = true;
      window.__renderPosts = [];
      window.fetch = function (url, opts) {
        if (String(url).indexOf("/api/batch") >= 0 && opts && opts.method === "POST") {
          window.__renderPosts.push(JSON.parse(opts.body));
          return Promise.resolve({
            ok: true,
            text: function () { return Promise.resolve(JSON.stringify({ id: "t" })); },
          });
        }
        return Promise.resolve({ ok: false, text: function () { return Promise.resolve(""); } });
      };
      window.EventSource = function () {
        const es = this;
        this.close = function () {};
        setTimeout(function () {
          if (es.onmessage) {
            es.onmessage({ data: JSON.stringify({ done: true, failed: 0, files: [], itemFraction: 1, currentLabel: "当前" }) });
          }
        }, 0);
      };
    });
    await page.click("#renderStart");
    await page.waitForFunction(() => window.__renderPosts.length === 1 && !document.getElementById("renderStart").disabled);
    const postedOn = await page.evaluate(() => window.__renderPosts[0].jobs[0]);
    assert.strictEqual(postedOn.songName, "bachi-original-stay.wav");
    assert.ok(postedOn.songBase64);
    assert.strictEqual(postedOn.hits, false);
    assert.strictEqual(await page.evaluate(() => window.__renderPosts[0].jobs.length), 1);

    await page.click("#settingsOriginalUse");
    const silenced = await page.evaluate(songState);
    assert.strictEqual(silenced.checked, false);
    assert.strictEqual(silenced.enabled, false);
    assert.strictEqual(silenced.activeName, "");
    assert.strictEqual(silenced.fileName, "bachi-original-stay.wav");
    assert.strictEqual(silenced.play, false);
    assert.strictEqual(silenced.src, src);
    assertSynced(silenced, "silenced");
    await page.click("#renderStart");
    await page.waitForFunction(() => window.__renderPosts.length === 2 && !document.getElementById("renderStart").disabled);
    const postedOff = await page.evaluate(() => window.__renderPosts[1].jobs[0]);
    assert.strictEqual(postedOff.songBase64, null);
    assert.strictEqual(postedOff.songName, null);

    await page.click("#settingsOriginalUse");
    const again = await page.evaluate(songState);
    assert.strictEqual(again.checked, true);
    assert.strictEqual(again.activeName, "bachi-original-stay.wav");
    assert.strictEqual(again.src, src);
    assertSynced(again, "again");
    await page.click("#renderStart");
    await page.waitForFunction(() => window.__renderPosts.length === 3 && !document.getElementById("renderStart").disabled);
    const postedAgain = await page.evaluate(() => window.__renderPosts[2].jobs[0]);
    assert.strictEqual(postedAgain.songName, "bachi-original-stay.wav");
    assert.ok(postedAgain.songBase64);

    passed += 1;
    console.log("  ✓ homepage and editor keep 原曲 across a round trip");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(wavPath, { force: true });
  }
  console.log("original-song tests: " + passed);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
