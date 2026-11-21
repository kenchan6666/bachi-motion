/**
 * Shared original-song selection. No official charts or audio.
 *
 *   node tests/original-song.test.js
 */
"use strict";

const fs = require("fs");
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

check("nothing selected shows the exact hint and no clear control", () => {
  const view = song.selectionView(null);
  assert.strictEqual(view.hint, "未选择原曲：预览和出片都不含原曲。");
  assert.strictEqual(view.hint, song.EMPTY_HINT);
  assert.strictEqual(view.name, "");
  assert.strictEqual(view.clear, false);
});

check("a chosen file shows its name and 不要原曲", () => {
  const view = song.selectionView({ name: "home.ogg" });
  assert.strictEqual(view.hint, "");
  assert.strictEqual(view.name, "home.ogg");
  assert.strictEqual(view.clear, true);
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

check("both 高级 entries share one collapsed song control", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const hint = song.EMPTY_HINT;
  assert.strictEqual(html.split(hint).length - 1, 2);
  assert.strictEqual(html.split("打开原曲").length - 1, 2);
  assert.strictEqual(html.split("不要原曲").length - 1, 2);
  assert.strictEqual(html.split(song.ACCEPT).length - 1, 3);

  const settingsAt = html.indexOf('id="settings"');
  const advancedAt = html.indexOf('id="settingsAdvanced"');
  const editorAt = html.indexOf('id="editor"');
  assert.ok(settingsAt >= 0 && settingsAt < advancedAt && advancedAt < editorAt);
  const tag = html.slice(advancedAt - 80, advancedAt + 80);
  const openTag = tag.slice(tag.lastIndexOf("<details"));
  assert.ok(openTag.startsWith("<details"), openTag);
  assert.ok(!/\sopen(\s|>|=)/.test(openTag.split(">")[0]), openTag);

  const panelStart = html.indexOf('id="editorAdvancedPanel"');
  const panel = html.slice(panelStart, html.indexOf('id="editorScroll"'));
  assert.ok(panel.includes("打开原曲"));
  assert.ok(panel.includes(hint));
  assert.ok(panel.includes("不要原曲"));
  assert.ok(panel.includes("导入 JSON"));
  assert.ok(panel.includes("导出 JSON"));
  assert.ok(panel.includes("打开 TJA"));

  const batchUi = fs.readFileSync(path.join(__dirname, "..", "js", "batch-ui.js"), "utf8");
  assert.ok(batchUi.includes(song.ACCEPT));
  const addStart = batchUi.indexOf("if (addCurrent)");
  const addBody = batchUi.slice(addStart, batchUi.indexOf("function showDownloads"));
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
});

console.log("original-song tests: " + passed);
