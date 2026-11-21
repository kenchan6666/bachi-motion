/**
 * Blank charts, 16th-grid notes, and 手顺 that must survive an insert.
 *   node tests/chart-author.test.js
 */
"use strict";

const assert = require("assert");
const path = require("path");
const author = require(path.join(__dirname, "..", "js", "chart-author.js"));
const parser = require(path.join(__dirname, "..", "js", "parser.js"));
const edits = require(path.join(__dirname, "..", "js", "hand-edits.js"));

let passed = 0;
const failed = [];

function extra(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  ✓ " + name);
  } catch (err) {
    failed.push(name);
    console.log("  ✗ " + name + "  " + (err && err.message ? err.message : err));
    if (err && err.stack) console.log(err.stack.split("\n").slice(0, 8).join("\n"));
  }
}

function notesAt(n, bpm) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ beat: i * 0.25, colour: "don", big: false, bpm: bpm || 120 });
  return out;
}

extra("blank chart defaults: 未命名, BPM 120, 8 empty 16th measures, no song", function () {
  const opts = author.normalizeBlankOptions({});
  assert.deepStrictEqual(opts, { bpm: 120, measures: 8, title: "未命名" });
  assert.deepStrictEqual(author.normalizeBlankOptions({ bpm: "", measures: "" }), opts);
  assert.strictEqual(author.normalizeBlankOptions({ bpm: 0, measures: -3 }).bpm, 120);
  assert.strictEqual(author.normalizeBlankOptions({ bpm: 0, measures: -3 }).measures, 8);

  const tja = author.blankTja();
  assert.ok(!/WAVE/i.test(tja), "blank chart has no WAVE header");
  assert.ok(!tja.includes("原曲"));
  assert.strictEqual(author.chartHasNotes(tja), false);
  assert.strictEqual(author.chartHasNotes(""), false);
  assert.strictEqual(author.chartHasNotes("TITLE:x\nBPM:120\n#START\n1,\n#END\n"), true);

  const parsed = parser.parseTja(tja);
  assert.strictEqual(parsed.headers.title, "未命名");
  assert.strictEqual(parsed.headers.bpm, 120);
  assert.strictEqual(parsed.notes.length, 0);
  assert.strictEqual(parsed.measures.length, 8);
  parsed.measures.forEach(function (m) {
    assert.strictEqual(m.slots, 16);
    assert.strictEqual(m.notes, 0);
    assert.strictEqual(m.beats, 4);
  });
});

extra("blank chart honors BPM and measure count", function () {
  const tja = author.blankTja({ bpm: 90, measures: 3 });
  const parsed = parser.parseTja(tja);
  assert.strictEqual(parsed.headers.bpm, 90);
  assert.strictEqual(parsed.headers.title, "未命名");
  assert.strictEqual(parsed.measures.length, 3);
  assert.strictEqual(parsed.notes.length, 0);
});

extra("blank chart takes a song title, and a later edit can change title and BPM", function () {
  const named = author.normalizeBlankOptions({ title: "  空谱甲\n乙  ", bpm: 144, measures: 4 });
  assert.strictEqual(named.title, "空谱甲 乙");
  assert.strictEqual(named.bpm, 144);
  assert.strictEqual(author.normalizeBlankOptions({ title: "   ", bpm: 0 }).title, "未命名");
  assert.strictEqual(author.normalizeBlankOptions({ title: "   ", bpm: 0 }).bpm, 120);

  let tja = author.blankTja({ title: "空谱甲", bpm: 144, measures: 4 });
  let parsed = parser.parseTja(tja);
  assert.strictEqual(parsed.headers.title, "空谱甲");
  assert.strictEqual(parsed.headers.bpm, 144);
  assert.strictEqual(parsed.measures.length, 4);
  assert.strictEqual(parsed.notes.length, 0);

  const placed = author.placeNote(tja, { measure: 2, cell: 4, face: "ka", size: "normal" });
  tja = placed.tja;
  const next = author.applyChartMeta(tja, { title: "空谱乙", bpm: 96 });
  parsed = parser.parseTja(next);
  assert.strictEqual(parsed.headers.title, "空谱乙");
  assert.strictEqual(parsed.headers.bpm, 96);
  assert.strictEqual(parsed.measures.length, 4);
  assert.strictEqual(parsed.notes.length, 1);
  assert.strictEqual(parsed.notes[0].type, "ka");
  assert.strictEqual(parsed.notes[0].measure, 2);
  assert.notStrictEqual(parsed.headers.title, "未命名");
  assert.notStrictEqual(parsed.headers.bpm, 120);

  const kept = "TITLEJA:别的名字\nTITLE:空谱乙\nBPM:96\n#START\n1000,\n#END\n";
  const renamed = author.applyChartMeta(kept, { title: "空谱丙$", bpm: 80 });
  assert.ok(renamed.includes("TITLEJA:别的名字"), renamed);
  assert.ok(renamed.includes("TITLE:空谱丙$"), renamed);
  assert.ok(!/^TITLE:空谱乙/m.test(renamed));
  assert.ok(renamed.includes("BPM:80"));
  assert.ok(renamed.includes("1000,"));
  assert.strictEqual(author.applyChartMeta(kept, {}), kept);
  const cleared = author.applyChartMeta(kept, { title: "" });
  assert.ok(cleared.includes("TITLE:未命名"));
  assert.ok(cleared.includes("TITLEJA:别的名字"));
});

extra("place and delete 咚/咔 normal and big on the 16th grid", function () {
  let tja = author.blankTja();
  const placed = [
    { cell: 0, face: "don", size: "normal", type: "don", ch: "1" },
    { cell: 1, face: "ka", size: "normal", type: "ka", ch: "2" },
    { cell: 4, face: "don", size: "big", type: "bigdon", ch: "3" },
    { cell: 15, face: "ka", size: "big", type: "bigka", ch: "4" },
  ];
  placed.forEach(function (spec, i) {
    const res = author.placeNote(tja, { measure: 1, cell: spec.cell, face: spec.face, size: spec.size });
    assert.strictEqual(res.changed, true);
    assert.strictEqual(res.index, i);
    tja = res.tja;
  });
  const parsed = parser.parseTja(tja);
  assert.strictEqual(parsed.notes.length, 4);
  placed.forEach(function (spec, i) {
    assert.strictEqual(parsed.notes[i].type, spec.type);
    assert.strictEqual(parsed.notes[i].char, spec.ch);
    assert.strictEqual(parsed.notes[i].pos, spec.cell);
    assert.strictEqual(parsed.notes[i].measure, 1);
    assert.strictEqual(parsed.notes[i].slots, 16);
  });
  // BPM 120, 16ths are 0.125s. Cell 15 sits on the last 16th of bar 1.
  assert.ok(Math.abs(parsed.notes[3].t - 15 * 0.125) < 1e-9);

  const busy = author.placeNote(tja, { measure: 1, cell: 0, face: "ka", size: "normal" });
  assert.strictEqual(busy.changed, false);

  const removed = author.deleteNote(tja, { measure: 1, cell: 0 });
  assert.strictEqual(removed.changed, true);
  assert.strictEqual(removed.index, 0);
  tja = removed.tja;
  const after = parser.parseTja(tja);
  assert.strictEqual(after.notes.length, 3);
  assert.strictEqual(after.notes[0].type, "ka");
  assert.strictEqual(after.notes[0].pos, 1);
  assert.strictEqual(after.notes[2].type, "bigka");
  assert.strictEqual(after.notes[2].pos, 15);
  const again = author.deleteNote(tja, { measure: 1, cell: 0 });
  assert.strictEqual(again.changed, false, "empty 16th is not a note");
});

extra("a note on a later measure keeps 16th time, and 加一小节 appends one empty bar", function () {
  let tja = author.blankTja({ bpm: 120, measures: 2 });
  const placed = author.placeNote(tja, { measure: 2, cell: 4, face: "ka", size: "big" });
  tja = placed.tja;
  assert.strictEqual(placed.index, 0);
  const parsed = parser.parseTja(tja);
  assert.strictEqual(parsed.notes.length, 1);
  assert.strictEqual(parsed.notes[0].type, "bigka");
  assert.strictEqual(parsed.notes[0].measure, 2);
  assert.ok(Math.abs(parsed.notes[0].t - (2 + 0.5)) < 1e-9, "bar 2 starts at 2s, cell 4 is half a beat later");

  const more = author.appendMeasure(tja);
  tja = more.tja;
  const again = parser.parseTja(tja);
  assert.strictEqual(again.measures.length, 3);
  assert.strictEqual(again.notes.length, 1);
  assert.strictEqual(again.notes[0].type, "bigka");
  assert.strictEqual(again.measures[2].slots, 16);
  assert.strictEqual(again.measures[2].notes, 0);
  assert.strictEqual(again.headers.title, "未命名");
  assert.strictEqual(again.headers.bpm, 120);
});

extra("handmade 手顺 is not regenerated when a note is inserted or deleted", function () {
  const base = notesAt(2, 120);
  const session = edits.createSession(base, { bpm: 120, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" });
  const auto = edits.resolve(session).hands.slice();
  assert.deepStrictEqual(auto, ["R", "L"]);
  edits.applySwap(session, 0, "L");
  assert.deepStrictEqual(edits.resolve(session).hands, ["L", "L"]);
  assert.strictEqual(author.shouldRegenerate(session), false);

  const inserted = notesAt(3, 120);
  author.shiftSession(session, { type: "insert", index: 2, notes: inserted, dominant: "R" });
  const hands = edits.resolve(session).hands;
  assert.deepStrictEqual(hands, ["L", "L", "R"], "old swapped hands stay; the new note is only appended");
  assert.notDeepStrictEqual(hands, ["R", "L", "R"], "must not rerun 全换 across the whole chart");

  author.shiftSession(session, { type: "delete", index: 1, notes: [inserted[0], inserted[2]], dominant: "R" });
  assert.deepStrictEqual(edits.resolve(session).hands, ["L", "R"]);
  assert.strictEqual(session.authored, true);
});

extra("imported 手顺 stays on the same notes and is not rewritten", function () {
  const base = notesAt(2, 120);
  const session = edits.createSessionFromResolved(base, { bpm: 120, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" }, {
    hands: ["L", "L"],
    rollPairs: [],
    warnings: [],
  });
  assert.strictEqual(session.source, "hand-json");
  assert.strictEqual(author.shouldRegenerate(session), false);
  const json = JSON.stringify({ events: [{ t: 0, hand: "L" }, { t: 0.5, hand: "L" }] });
  const inserted = notesAt(3, 120);
  author.shiftSession(session, { type: "insert", index: 1, notes: inserted, dominant: "R" });
  assert.strictEqual(session.source, "hand-json");
  assert.deepStrictEqual(edits.resolve(session).hands, ["L", "R", "L"]);
  assert.strictEqual(json, JSON.stringify({ events: [{ t: 0, hand: "L" }, { t: 0.5, hand: "L" }] }));
});

extra("a chart with no handmade edits may regenerate", function () {
  const session = edits.createSession(notesAt(2, 120), { bpm: 120, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" });
  assert.strictEqual(author.shouldRegenerate(session), true);
  assert.strictEqual(author.shouldRegenerate(null), true);
});

if (failed.length) {
  console.error("FAIL chart author: " + failed.join(", "));
  process.exit(1);
}
console.log("chart author tests: " + passed);
