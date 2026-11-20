/**
 * Engine integration for autoSticking (no visual editor).
 *   node tests/auto-sticking-engine.test.js
 */
"use strict";

const assert = require("assert");
const path = require("path");
const parser = require(path.join(__dirname, "..", "js", "parser.js"));

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
    if (err && err.stack) console.log(err.stack.split("\n").slice(0, 6).join("\n"));
  }
}

function tja16() {
  return ["TITLE:t", "BPM:300", "OFFSET:0", "COURSE:Oni", "#START", "1111111111111111,", "#END", ""].join("\n");
}

function tag(events) {
  return events.map((e) => (e.grip === "roll" ? "r" : "s") + e.hand).join("");
}

extra("no JSON: default 自动滚奏 maps (RR)(LL) 2-2 onto grip:roll", function () {
  const data = parser.eventsFromTja(tja16());
  assert.strictEqual(data.source, "auto-sticking");
  assert.strictEqual(data.手法, "全换");
  assert.strictEqual(data.惯用手, "R");
  assert.strictEqual(data.滚奏, "自动滚奏");
  assert.strictEqual(data.technique, "全换");
  const want = [];
  for (let i = 0; i < 4; i++) want.push("rR", "rR", "rL", "rL");
  assert.strictEqual(tag(data.events), want.join(""));
});

extra("no JSON: 滚奏=不滚奏 is singles RLRL, 炒菜+惯用手 L changes hands", function () {
  const off = parser.eventsFromTja(tja16(), { 滚奏: "不滚奏", 手法: "全换" });
  assert.ok(off.events.every((e) => e.grip === "single"));
  assert.strictEqual(off.events.map((e) => e.hand).join(""), "RLRLRLRLRLRLRLRL");

  const chao = parser.eventsFromTja(tja16(), { 手法: "炒菜", 惯用手: "L", 滚奏: "不滚奏" });
  // 16ths at 300 are 连音, 炒菜 from L then alternate
  assert.strictEqual(chao.events.map((e) => e.hand).join(""), "LRLRLRLRLRLRLRLR");
  assert.strictEqual(chao.technique, "炒菜");
  assert.strictEqual(parser.displayTechnique("半换A"), "半换 A");
  assert.strictEqual(parser.displayTechnique("半换B"), "半换 B");
  assert.strictEqual(parser.displayTechnique("半换 A"), "半换 A");
  assert.strictEqual(parser.displayTechnique(""), "");
  const ban = parser.eventsFromTja(tja16(), { 手法: "半换B", 滚奏: "不滚奏" });
  assert.strictEqual(ban.technique, "半换 B");
  assert.strictEqual(ban.手法, "半换B");
});

extra("JSON overlay: 手法/惯用手/滚奏 do not change events", function () {
  const json = {
    sticking: "RRRRRRRRLLLLLLLL",
    events: [],
  };
  const evs = [];
  for (let i = 0; i < 16; i++) evs.push({ t: i * 0.05, hand: "R", face: "don", grip: "single", src: "1:" + i });
  json.events = evs;

  const a = parser.chartFromTjaAndHands(tja16(), json, { 手法: "炒菜", 惯用手: "L", 滚奏: "自动滚奏" });
  const b = parser.chartFromTjaAndHands(tja16(), json, { 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" });
  assert.strictEqual(a.source, "hand-json");
  assert.strictEqual(b.source, "hand-json");
  assert.ok(a.stickingLocked && b.stickingLocked);
  assert.deepStrictEqual(
    a.events.map((e) => e.hand + ":" + e.grip),
    b.events.map((e) => e.hand + ":" + e.grip)
  );
  const hands = a.events.map((e) => e.hand).join("");
  assert.strictEqual(hands, "RRRRRRRRLLLLLLLL");
  assert.ok(a.events.every((e) => e.grip === "single"), "no parens → no roll, even if 滚奏=自动滚奏 was passed");
  assert.strictEqual(a.technique, "", "JSON without technique and without titleTechnique omits 手法");
});

extra("JSON with (RR)(LL) keeps those rolls regardless of 滚奏=不滚奏", function () {
  const evs = [];
  for (let i = 0; i < 8; i++) evs.push({ t: i * 0.05, hand: "R", face: "don", grip: "single", src: "1:" + i });
  const json = { sticking: "(RR)(LL)(RR)(LL)", events: evs };
  const data = parser.chartFromTjaAndHands(tja16(), json, { 滚奏: "不滚奏", 手法: "炒菜", 惯用手: "L" });
  assert.strictEqual(data.events.map((e) => e.grip + e.hand).join(","), "rollR,rollR,rollL,rollL,rollR,rollR,rollL,rollL");
});

extra("BPM change: beats from Δt × previous BPM / 60 stay on the 16th grid", function () {
  // 8 音 16 分 @240, mid-measure #BPMCHANGE 260, 再 8 音 16 分（同一 4/4 小节 16 槽）。
  const tja = [
    "BPM:240", "OFFSET:0", "#START",
    "11111111",
    "#BPMCHANGE 260",
    "11111111,",
    "#END", "",
  ].join("\n");
  const parsed = parser.parseTja(tja);
  const sliced = parser.sliceCourse(parser.pickCourse(parsed), null);
  const input = parser.notesToStickingInput(sliced.notes, sliced.measures, false);
  assert.strictEqual(input.length, 16);
  const beats = input.map((n) => +(+n.beat).toFixed(6));
  const want = [];
  for (let i = 0; i < 16; i++) want.push(+(i * 0.25).toFixed(6));
  assert.deepStrictEqual(beats, want);
  assert.strictEqual(input[0].bpm, 240);
  assert.strictEqual(input[7].bpm, 240);
  assert.strictEqual(input[8].bpm, 260);
  // 自动滚奏不按局部 BPM 决定滚不滚，整串连续 2-2。
  const data = parser.eventsFromTja(tja);
  const wantTag = [];
  for (let i = 0; i < 8; i++) wantTag.push("rR", "rR", "rL", "rL");
  // 16 notes = 8 pairs? 2-2 of 16 notes = rR rR rL rL × 4
  const want16 = [];
  for (let i = 0; i < 4; i++) want16.push("rR", "rR", "rL", "rL");
  assert.strictEqual(tag(data.events), want16.join(""));
  assert.ok(sliced.notes[0].t < sliced.notes[8].t);
  // 后半 BPM 更快，同样 0.25 拍的时值更短，但拍数网格不变。
  const dtEarly = sliced.notes[1].t - sliced.notes[0].t;
  const dtLate = sliced.notes[9].t - sliced.notes[8].t;
  assert.ok(dtLate < dtEarly, "later 16ths should be shorter in seconds: " + dtLate + " vs " + dtEarly);
});

function evs16() {
  const evs = [];
  for (let i = 0; i < 16; i++) evs.push({ t: i * 0.05, hand: "R", face: "don", grip: "single", src: "1:" + i });
  return evs;
}

extra("JSON technique field wins over titleTechnique / dropdown, hands unchanged", function () {
  const json = { technique: "炒菜", sticking: "RRRRRRRRLLLLLLLL", events: evs16() };
  const data = parser.chartFromTjaAndHands(tja16(), json, {
    titleTechnique: "半换A",
    手法: "全换",
    惯用手: "L",
    滚奏: "自动滚奏",
  });
  assert.strictEqual(data.technique, "炒菜");
  assert.strictEqual(data.events.map((e) => e.hand).join(""), "RRRRRRRRLLLLLLLL");
  assert.ok(data.stickingLocked);
});

extra("JSON without technique uses explicit titleTechnique only for the title", function () {
  const json = { sticking: "RRRRRRRRLLLLLLLL", events: evs16() };
  const data = parser.chartFromTjaAndHands(tja16(), json, {
    titleTechnique: "半换B",
    手法: "炒菜",
    惯用手: "L",
    滚奏: "自动滚奏",
  });
  assert.strictEqual(data.technique, "半换 B");
  assert.strictEqual(data.events.map((e) => e.hand).join(""), "RRRRRRRRLLLLLLLL");
});

extra("JSON without technique or titleTechnique omits 手法 (no default 全换)", function () {
  const json = { sticking: "RRRRRRRRLLLLLLLL", events: evs16() };
  const data = parser.chartFromTjaAndHands(tja16(), json, { 手法: "炒菜", 惯用手: "L" });
  assert.strictEqual(data.technique, "");
  assert.strictEqual(parser.titleTechniqueFromSources({ locked: true }), "");
  assert.strictEqual(parser.titleTechniqueFromSources({ locked: false, autoTechnique: "半换A" }), "半换 A");
});

console.log("auto-sticking-engine: " + passed + " passed, " + failed.length + " failed");
if (failed.length) process.exit(1);
