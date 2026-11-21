/**
 * Export the open chart to UTF-8 TJA and parse it back.
 * Fixtures are synthetic. No 手顺 in the file.
 *
 *   node tests/tja-export.test.js
 */
"use strict";

const assert = require("assert");
const path = require("path");
const author = require(path.join(__dirname, "..", "js", "chart-author.js"));
const parser = require(path.join(__dirname, "..", "js", "parser.js"));
const encoding = require(path.join(__dirname, "..", "js", "tja-encoding.js"));
const tjaExport = require(path.join(__dirname, "..", "js", "tja-export.js"));

let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log("  ✓ " + name);
}

function noteSig(parsed) {
  return {
    title: parsed.headers.title,
    bpm: parsed.headers.bpm,
    offset: parsed.headers.offset,
    course: parsed.headers.course || "",
    level: String(parsed.headers.level == null ? "" : parsed.headers.level),
    measures: (parsed.measures || []).map(function (m) {
      return { beats: m.beats, slots: m.slots, notes: m.notes, measure: m.measure };
    }),
    notes: (parsed.notes || []).map(function (n) {
      return {
        type: n.type,
        char: n.char,
        pos: n.pos,
        measure: n.measure,
        bpm: n.bpm,
      };
    }),
  };
}

function roundTrip(text, opts) {
  const file = tjaExport.exportChart(text, opts);
  assert.ok(file, "export returned nothing");
  assert.ok(file.bytes && file.bytes.length, "missing UTF-8 bytes");
  assert.notStrictEqual(file.bytes[0], 0xEF, "UTF-8 BOM was added");
  const decoded = encoding.decodeTjaBytes(file.bytes);
  assert.strictEqual(decoded, file.text);
  const parsed = parser.parseTja(decoded);
  return { file: file, parsed: parsed };
}

check("empty or broken text cannot export", function () {
  assert.strictEqual(tjaExport.canExport(""), false);
  assert.strictEqual(tjaExport.canExport("TITLE:空\nBPM:120\n"), false);
  assert.strictEqual(tjaExport.exportChart("not a chart"), null);
});

check("a custom chart with title, BPM, notes, and an added measure round-trips", function () {
  let tja = author.blankTja({ title: "春风", bpm: 96, measures: 2 });
  tja = author.placeNote(tja, { measure: 1, cell: 0, face: "don", size: "normal" }).tja;
  tja = author.placeNote(tja, { measure: 1, cell: 4, face: "ka", size: "normal" }).tja;
  tja = author.placeNote(tja, { measure: 1, cell: 8, face: "don", size: "big" }).tja;
  tja = author.placeNote(tja, { measure: 2, cell: 15, face: "ka", size: "big" }).tja;
  tja = author.appendMeasure(tja).tja;
  tja = author.applyChartMeta(tja, { title: "春风", bpm: 96 });

  const before = parser.parseTja(tja);
  const back = roundTrip(tja);
  assert.deepStrictEqual(noteSig(back.parsed), noteSig(before));
  assert.strictEqual(back.parsed.headers.title, "春风");
  assert.strictEqual(back.parsed.headers.bpm, 96);
  assert.strictEqual(back.parsed.headers.offset, 0);
  assert.strictEqual(back.parsed.measures.length, 3);
  assert.strictEqual(back.parsed.notes.length, 4);
  assert.deepStrictEqual(back.parsed.notes.map(function (n) { return n.char; }), ["1", "2", "3", "4"]);
  assert.strictEqual(back.file.filename, "春风.tja");
  assert.ok(!/WAVE/i.test(back.file.text), "blank chart invented a WAVE name");
  assert.ok(!back.file.text.includes("手顺"));
  assert.ok(!/"hand"/.test(back.file.text));
  assert.ok(!/"events"/.test(back.file.text));
  assert.ok(back.file.text.includes("OFFSET:0"));
  assert.ok(!/^COURSE:/m.test(back.file.text));
  assert.ok(!/^LEVEL:/m.test(back.file.text));
});

check("中文歌名 survives UTF-8 bytes", function () {
  const tja = [
    "TITLE:春风试听",
    "BPM:120",
    "OFFSET:0",
    "#START",
    "12,",
    "#END",
    "",
  ].join("\n");
  const back = roundTrip(tja);
  assert.strictEqual(back.parsed.headers.title, "春风试听");
  assert.strictEqual(back.file.filename, "春风试听.tja");
  const asUtf8 = new TextDecoder("utf-8", { fatal: true }).decode(back.file.bytes);
  assert.ok(asUtf8.includes("春风试听"));
  assert.ok(!asUtf8.includes("\uFFFD"));
});

check("OFFSET, COURSE, and LEVEL reopen on the course that is open", function () {
  const tja = [
    "TITLE:双谱",
    "BPM:100",
    "OFFSET:-0.25",
    "WAVE:song.ogg",
    "COURSE:Easy",
    "LEVEL:2",
    "#START",
    "1,",
    "#END",
    "COURSE:Oni",
    "LEVEL:9",
    "#START",
    "#MEASURE 3/4",
    "12,",
    "#BPMCHANGE 180",
    "2,",
    "#SCROLL 1.5",
    "8,",
    "#END",
    "",
  ].join("\n");
  const back = roundTrip(tja, { courseIndex: 1, course: "Oni" });
  assert.strictEqual(back.parsed.headers.title, "双谱");
  assert.strictEqual(back.parsed.headers.bpm, 100);
  assert.strictEqual(back.parsed.headers.offset, -0.25);
  assert.strictEqual(back.parsed.headers.course, "Oni");
  assert.strictEqual(back.parsed.headers.level, "9");
  assert.strictEqual(back.parsed.courses.length, 1);
  assert.ok(back.file.text.includes("WAVE:song.ogg"));
  assert.ok(back.file.text.includes("#MEASURE 3/4"));
  assert.ok(back.file.text.includes("#BPMCHANGE 180"));
  assert.ok(back.file.text.includes("#SCROLL 1.5"));
  assert.ok(back.file.text.includes("8,"));
  assert.ok(!back.file.text.includes("COURSE:Easy"));
  assert.strictEqual(back.parsed.notes.length, 3);
  assert.strictEqual(back.parsed.notes[0].type, "don");
  assert.strictEqual(back.parsed.notes[0].bpm, 100);
  assert.strictEqual(back.parsed.notes[1].type, "ka");
  assert.strictEqual(back.parsed.notes[2].type, "ka");
  assert.strictEqual(back.parsed.notes[2].bpm, 180);
  assert.strictEqual(back.parsed.measures[0].beats, 3);
  assert.strictEqual(back.parsed.measures[2].slots, 1);
  assert.strictEqual(back.parsed.measures[2].notes, 0);
  assert.ok(!back.file.text.includes("手顺"));
  assert.ok(!/"hand"/.test(back.file.text));
});

check("an empty WAVE is not invented, and a real one is kept", function () {
  const named = [
    "TITLE:有声",
    "BPM:120",
    "OFFSET:0",
    "WAVE:audio.wav",
    "#START",
    "1,",
    "#END",
    "",
  ].join("\n");
  const kept = roundTrip(named);
  assert.ok(kept.file.text.includes("WAVE:audio.wav"));

  const blank = [
    "TITLE:无声",
    "BPM:120",
    "OFFSET:1.5",
    "WAVE:",
    "COURSE:Edit",
    "LEVEL:4",
    "#START",
    "2,",
    "#END",
    "",
  ].join("\n");
  const dropped = roundTrip(blank);
  assert.ok(!/^WAVE:/m.test(dropped.file.text));
  assert.strictEqual(dropped.parsed.headers.offset, 1.5);
  assert.strictEqual(dropped.parsed.headers.course, "Edit");
  assert.strictEqual(dropped.parsed.headers.level, "4");
  assert.strictEqual(dropped.parsed.notes[0].type, "ka");
});

check("download names stay safe and keep CJK", function () {
  assert.strictEqual(tjaExport.filenameForTitle("春风"), "春风.tja");
  assert.strictEqual(tjaExport.filenameForTitle("春风.tja"), "春风.tja");
  assert.strictEqual(tjaExport.filenameForTitle("../a:b*?.tja"), "a_b.tja");
  assert.strictEqual(tjaExport.filenameForTitle("   "), "未命名.tja");
  assert.strictEqual(tjaExport.filenameForTitle(".."), "未命名.tja");
  const long = "歌".repeat(90);
  const named = tjaExport.filenameForTitle(long);
  assert.ok(named.endsWith(".tja"));
  assert.ok(Array.from(named.replace(/\.tja$/, "")).length <= 80);
});

console.log(passed + " export checks passed");
