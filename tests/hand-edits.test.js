/**
 * Pure-function tests for the hand-order editor edit layer.
 *   node tests/hand-edits.test.js
 */
"use strict";

const assert = require("assert");
const path = require("path");
const sticking = require(path.join(__dirname, "..", "js", "sticking.js"));
const edits = require(path.join(__dirname, "..", "js", "hand-edits.js"));
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
    if (err && err.stack) console.log(err.stack.split("\n").slice(0, 8).join("\n"));
  }
}

function notes16(n, bpm) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ beat: i * 0.25, colour: "don", big: false, bpm: bpm || 300 });
  return out;
}

function tag(resolved) {
  const paired = Object.create(null);
  for (const p of resolved.rollPairs || []) {
    paired[p[0]] = true;
    paired[p[1]] = true;
  }
  return (resolved.hands || []).map((h, i) => (paired[i] ? "r" : "s") + h).join("");
}

extra("applyRoll on 16ths at 300 uses 自动滚奏 2-2 pairs", function () {
  const notes = notes16(8, 300);
  const session = edits.createSession(notes, { bpm: 300, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" });
  const auto = edits.resolve(session);
  assert.strictEqual(auto.rollPairs.length, 0, "不滚奏 baseline has no pairs");
  edits.applyRoll(session, 0, 7);
  const got = edits.resolve(session);
  assert.deepStrictEqual(got.rollPairs, [[0, 1], [2, 3], [4, 5], [6, 7]]);
  assert.strictEqual(tag(got), "rRrRrLrLrRrRrLrL");
});

extra("applyAlternate from the start of the chart starts with 惯用手", function () {
  const notes = notes16(8, 300);
  const session = edits.createSession(notes, { bpm: 300, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  const before = edits.resolve(session);
  assert.ok(before.rollPairs.length > 0, "auto roll is on");
  edits.applyAlternate(session, 0, 7);
  const got = edits.resolve(session);
  assert.deepStrictEqual(got.rollPairs, []);
  assert.deepStrictEqual(got.hands, ["R", "L", "R", "L", "R", "L", "R", "L"]);
});

extra("applyAlternate with 惯用手 L starts on L", function () {
  const notes = notes16(4, 300);
  const session = edits.createSession(notes, { bpm: 300, 手法: "全换", 惯用手: "L", 滚奏: "不滚奏" });
  edits.applyAlternate(session, 0, 3);
  const got = edits.resolve(session);
  assert.deepStrictEqual(got.hands, ["L", "R", "L", "R"]);
  assert.deepStrictEqual(got.rollPairs, []);
});

extra("applyAlternate after a rest longer than one beat starts with 惯用手", function () {
  // 4 个 16 分，空 1.25 拍（> 1），再 4 个 16 分。
  const notes = [];
  for (let i = 0; i < 4; i++) notes.push({ beat: i * 0.25, colour: "don", big: false, bpm: 160 });
  for (let i = 0; i < 4; i++) notes.push({ beat: 2 + i * 0.25, colour: "don", big: false, bpm: 160 });
  const session = edits.createSession(notes, { bpm: 160, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" });
  const auto = edits.resolve(session);
  assert.strictEqual(auto.hands[3], "L", "pre-rest last note is not 惯用手");
  edits.applyAlternate(session, 4, 7);
  const got = edits.resolve(session);
  assert.deepStrictEqual(got.hands.slice(4), ["R", "L", "R", "L"], "gap > 1 beat resets to 惯用手 R");
  assert.deepStrictEqual(got.hands.slice(0, 4), auto.hands.slice(0, 4), "notes before the range stay put");
  assert.deepStrictEqual(got.rollPairs, []);
});

extra("applyAlternate mid-run continues from the other hand of the previous note (prev R → first L)", function () {
  // 自动滚奏 16 分是 (RR)(LL)…；截取中间时若仍从惯用手 R 起，会和前一音连打同一只手。
  const notes = notes16(8, 300);
  const session = edits.createSession(notes, { bpm: 300, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  const auto = edits.resolve(session);
  assert.strictEqual(auto.hands[1], "R");
  edits.applyAlternate(session, 2, 5);
  const got = edits.resolve(session);
  assert.strictEqual(got.hands[1], "R");
  assert.strictEqual(got.hands[2], "L", "first of mid-run selection is the other hand, not 惯用手");
  assert.deepStrictEqual(got.hands.slice(2, 6), ["L", "R", "L", "R"]);
  assert.deepStrictEqual(got.hands.slice(6), auto.hands.slice(6), "tail keeps existing hands, no 惯用手 reset at the boundary");
  assert.ok(!got.rollPairs.some((p) => p[0] >= 2 && p[1] <= 5));
});

extra("applyAlternate mid-run: previous note L (惯用手 also L) still starts on R", function () {
  const notes = notes16(8, 200);
  const session = edits.createSession(notes, { bpm: 200, 手法: "全换", 惯用手: "L", 滚奏: "不滚奏" });
  const auto = edits.resolve(session);
  assert.deepStrictEqual(auto.hands, ["L", "R", "L", "R", "L", "R", "L", "R"]);
  edits.applyAlternate(session, 1, 4);
  const got = edits.resolve(session);
  assert.strictEqual(got.hands[0], "L");
  assert.strictEqual(got.hands[1], "R", "must not restart on 惯用手 L after a left note");
  assert.deepStrictEqual(got.hands.slice(1, 5), ["R", "L", "R", "L"]);
  assert.deepStrictEqual(got.hands.slice(5), auto.hands.slice(5));
});

extra("applyAlternate with a gap of exactly one beat continues, does not reset to 惯用手", function () {
  const notes = [
    { beat: 0, colour: "don", big: false, bpm: 160 },
    { beat: 0.25, colour: "don", big: false, bpm: 160 },
    { beat: 1.25, colour: "don", big: false, bpm: 160 },
    { beat: 1.5, colour: "don", big: false, bpm: 160 },
    { beat: 1.75, colour: "don", big: false, bpm: 160 },
  ];
  const session = edits.createSession(notes, { bpm: 160, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" });
  const auto = edits.resolve(session);
  // 全换：间隔 = 1 拍不重置，auto 应为 R L R L R，前一音是 L。
  assert.strictEqual(auto.hands[1], "L");
  edits.applyAlternate(session, 2, 4);
  const got = edits.resolve(session);
  assert.strictEqual(got.hands[2], "R", "Δ = 1 beat is not a rest reset; continue from other hand");
  assert.deepStrictEqual(got.hands.slice(2), ["R", "L", "R"]);
});

extra("applyRestore reverts a range back to auto", function () {
  const notes = notes16(8, 300);
  const session = edits.createSession(notes, { bpm: 300, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  const autoTag = tag(edits.resolve(session));
  edits.applyAlternate(session, 0, 7);
  assert.notStrictEqual(tag(edits.resolve(session)), autoTag);
  edits.applyRestore(session, 0, 7);
  assert.strictEqual(tag(edits.resolve(session)), autoTag);
  assert.deepStrictEqual(edits.resolve(session).rollPairs, [[0, 1], [2, 3], [4, 5], [6, 7]]);
});

extra("applySwap flips one note and breaks its roll pair", function () {
  const notes = notes16(8, 300);
  const session = edits.createSession(notes, { bpm: 300, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  const auto = edits.resolve(session);
  assert.strictEqual(auto.hands[0], "R");
  assert.ok(auto.rollPairs.some((p) => p[0] === 0 && p[1] === 1));
  edits.applySwap(session, 0, "L");
  const got = edits.resolve(session);
  assert.strictEqual(got.hands[0], "L");
  assert.ok(!got.rollPairs.some((p) => p[0] === 0 || p[1] === 0), "swapped note leaves the pair");
  assert.deepStrictEqual(got.rollPairs, [[2, 3], [4, 5], [6, 7]]);
  assert.strictEqual(got.hands[1], auto.hands[1], "partner hand stays");
});

extra("undo and redo walk the patch history", function () {
  const notes = notes16(8, 300);
  const session = edits.createSession(notes, { bpm: 300, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  const autoTag = tag(edits.resolve(session));
  edits.applyAlternate(session, 2, 5);
  const mid = tag(edits.resolve(session));
  edits.applySwap(session, 0, "L");
  const after = tag(edits.resolve(session));
  assert.notStrictEqual(mid, autoTag);
  assert.notStrictEqual(after, mid);
  assert.ok(edits.canUndo(session));
  edits.undo(session);
  assert.strictEqual(tag(edits.resolve(session)), mid);
  edits.undo(session);
  assert.strictEqual(tag(edits.resolve(session)), autoTag);
  assert.ok(!edits.canUndo(session));
  assert.ok(edits.canRedo(session));
  edits.redo(session);
  assert.strictEqual(tag(edits.resolve(session)), mid);
  edits.redo(session);
  assert.strictEqual(tag(edits.resolve(session)), after);
  assert.ok(!edits.canRedo(session));
});

extra("patches compose: roll a tail after alternating the whole run", function () {
  const notes = notes16(8, 300);
  const session = edits.createSession(notes, { bpm: 300, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" });
  edits.applyAlternate(session, 0, 7);
  edits.applyRoll(session, 4, 7);
  const got = edits.resolve(session);
  assert.deepStrictEqual(got.hands.slice(0, 4), ["R", "L", "R", "L"]);
  assert.deepStrictEqual(got.rollPairs, [[4, 5], [6, 7]]);
  assert.ok(!got.rollPairs.some((p) => p[0] < 4));
});

extra("restore of a sub-range leaves later patches outside it", function () {
  const notes = notes16(8, 300);
  const session = edits.createSession(notes, { bpm: 300, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  edits.applyAlternate(session, 0, 7);
  edits.applyRestore(session, 0, 3);
  const got = edits.resolve(session);
  // 0-3 back to auto 2-2; 4-7 stay alternating singles
  assert.deepStrictEqual(got.rollPairs, [[0, 1], [2, 3]]);
  assert.deepStrictEqual(got.hands.slice(4), ["R", "L", "R", "L"]);
});

extra("setOptions re-runs auto but keeps patches", function () {
  const notes = notes16(4, 200);
  const session = edits.createSession(notes, { bpm: 200, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" });
  edits.applySwap(session, 0, "L");
  edits.setOptions(session, { 惯用手: "L" });
  const got = edits.resolve(session);
  assert.strictEqual(got.hands[0], "L", "swap patch still applied after options change");
});

extra("逆手起 warning clears after the range is set to 滚奏, returns on 恢复自动", function () {
  // Build a 16th run that autoSticking marks 逆手起: start the phrase on L
  // by putting a rest-section dominant-R note, then a roll run that
  // somehow starts on L. Easier: take auto warnings if any, or construct
  // a session with a seeded warning and a no-op auto, then patch.
  const notes = notes16(8, 300);
  const auto = sticking.autoSticking(notes, { bpm: 300, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  // Force a 逆手起 warning on 0-7 so the dirty/restore logic is testable
  // even if this particular run starts on the dominant hand.
  const seeded = {
    hands: auto.hands.slice(),
    rollPairs: auto.rollPairs.slice(),
    warnings: [[0, 7, "逆手起"]],
  };
  const session = edits.createSession(notes, { bpm: 300, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" }, seeded);
  assert.ok(edits.resolve(session).warnings.some((w) => w[2] === "逆手起"));
  edits.applyRoll(session, 0, 7);
  assert.ok(!edits.resolve(session).warnings.some((w) => w[2] === "逆手起"), "confirmed roll clears 待确认");
  edits.applyRestore(session, 0, 7);
  assert.ok(edits.resolve(session).warnings.some((w) => w[2] === "逆手起"), "restore brings 待确认 back");
});

extra("同拍重复 warnings stay after a swap", function () {
  const notes = [
    { beat: 0, colour: "don", big: false },
    { beat: 0, colour: "ka", big: false },
    { beat: 1, colour: "don", big: false },
  ];
  const session = edits.createSession(notes, { bpm: 160, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" });
  assert.ok(edits.resolve(session).warnings.some((w) => w[2] === "同拍重复"));
  edits.applySwap(session, 0, "L");
  assert.ok(edits.resolve(session).warnings.some((w) => w[2] === "同拍重复"));
});

extra("eventsFromStickingResult matches eventsFromAutoSticking on a 16th bar", function () {
  const tja = ["TITLE:t", "BPM:300", "OFFSET:0", "COURSE:Oni", "#START", "1111111111111111,", "#END", ""].join("\n");
  const parsed = parser.sliceCourse(parser.pickCourse(parser.parseTja(tja)), null);
  const fromAuto = parser.eventsFromAutoSticking(parsed, { 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  const input = parser.notesToStickingInput(parsed.notes, parsed.measures, false);
  const result = sticking.autoSticking(input, { bpm: 300, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  const fromResolved = parser.eventsFromStickingResult(parsed, result, { 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  assert.strictEqual(fromResolved.events.length, fromAuto.events.length);
  const compact = (evs) => evs.map((e) => [e.t, e.hand, e.face, e.grip, !!e.big].join(":")).join("|");
  assert.strictEqual(compact(fromResolved.events), compact(fromAuto.events));
});

function sessionSeed(hands, pairs) {
  const notes = hands.map((_, i) => ({ beat: i * 0.25, colour: "don", big: false, bpm: 120 }));
  return edits.createSession(notes, { bpm: 120, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" }, {
    hands: hands.slice(),
    rollPairs: (pairs || []).map((p) => p.slice()),
    warnings: [],
  });
}

function setHands(session, target) {
  for (let i = 0; i < target.length; i++) {
    const cur = edits.resolve(session).hands[i];
    if (cur !== target[i]) edits.applySwap(session, i, target[i]);
  }
}

function pairSig(resolved) {
  return (resolved.rollPairs || []).map((p) => p[0] + "-" + p[1]).join(",");
}

extra("manual sticking LLRRL is (LL)(RR) plus a single L", function () {
  const session = sessionSeed(["R", "R", "R", "R", "R"]);
  setHands(session, ["L", "L", "R", "R", "L"]);
  const got = edits.resolve(session);
  assert.deepStrictEqual(got.hands, ["L", "L", "R", "R", "L"]);
  assert.deepStrictEqual(got.rollPairs, [[0, 1], [2, 3]]);
  assert.strictEqual(tag(got), "rLrLrRrRsL");
});

extra("manual sticking LLRR is two roll pairs", function () {
  const session = sessionSeed(["R", "R", "R", "R"]);
  setHands(session, ["L", "L", "R", "R"]);
  const got = edits.resolve(session);
  assert.deepStrictEqual(got.rollPairs, [[0, 1], [2, 3]]);
  assert.strictEqual(tag(got), "rLrLrRrR");
});

extra("LLL, RRR and LLLL are not rolls; LRLR stays singles", function () {
  [["L", "L", "L"], ["R", "R", "R"], ["L", "L", "L", "L"], ["L", "R", "L", "R"]].forEach(function (hands) {
    const session = sessionSeed(hands.map(() => "R"));
    setHands(session, hands);
    const got = edits.resolve(session);
    assert.deepStrictEqual(got.hands, hands);
    assert.deepStrictEqual(got.rollPairs, [], hands.join("") + " " + pairSig(got));
  });
});

extra("a manual hand change that makes 2-2 re-marks roll grips; three-in-a-row does not", function () {
  const tja = ["TITLE:t", "BPM:120", "OFFSET:0", "COURSE:Oni", "#START", "11111,", "#END", ""].join("\n");
  const parsed = parser.sliceCourse(parser.pickCourse(parser.parseTja(tja)), null);
  const input = parser.notesToStickingInput(parsed.notes, parsed.measures, false);
  const opts = { bpm: 120, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" };
  const session = edits.createSession(input, opts, {
    hands: input.map(() => "R"),
    rollPairs: [],
    warnings: [],
  });
  setHands(session, ["L", "L", "R", "R", "L"]);
  const got = edits.resolve(session);
  const ev = parser.eventsFromStickingResult(parsed, got, opts);
  assert.deepStrictEqual(ev.events.map((e) => e.grip), ["roll", "roll", "roll", "roll", "single"]);
  assert.deepStrictEqual(ev.events.map((e) => e.hand), ["L", "L", "R", "R", "L"]);
  assert.ok(ev.events.every((e) => e.face === "don"));

  const triple = sessionSeed(["L", "L", "R", "R"], [[0, 1], [2, 3]]);
  edits.applySwap(triple, 2, "L");
  const after = edits.resolve(triple);
  assert.deepStrictEqual(after.hands, ["L", "L", "L", "R"]);
  assert.deepStrictEqual(after.rollPairs, [], "LLL R is not a roll");
});

extra("loading a custom hand order does not re-detect rolls until a hand is edited", function () {
  const session = edits.createSessionFromResolved(
    [{ beat: 0, colour: "don", big: false }, { beat: 0.25, colour: "don", big: false },
      { beat: 0.5, colour: "ka", big: false }, { beat: 0.75, colour: "ka", big: false }],
    { bpm: 120, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" },
    { hands: ["L", "L", "R", "R"], rollPairs: [], warnings: [] }
  );
  assert.deepStrictEqual(edits.resolve(session).rollPairs, []);
  edits.applySwap(session, 0, "L");
  assert.deepStrictEqual(edits.resolve(session).rollPairs, [[0, 1], [2, 3]]);
});

extra("a hand edit in another phrase does not re-mark an untouched pair", function () {
  const notes = [
    { beat: 0, colour: "don", big: false },
    { beat: 0.25, colour: "don", big: false },
    { beat: 3, colour: "ka", big: false },
    { beat: 3.25, colour: "ka", big: false },
  ];
  const session = edits.createSession(notes, { bpm: 120, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" }, {
    hands: ["L", "L", "R", "R"],
    rollPairs: [],
    warnings: [],
  });
  edits.applySwap(session, 3, "L");
  const got = edits.resolve(session);
  assert.deepStrictEqual(got.hands, ["L", "L", "R", "L"]);
  assert.deepStrictEqual(got.rollPairs, [], "the earlier LL stays a single until that phrase is edited");
});

extra("resolvedFromEvents round-trips auto 2-2 roll events", function () {
  const tja = ["TITLE:t", "BPM:300", "OFFSET:0", "COURSE:Oni", "#START", "1111111111111111,", "#END", ""].join("\n");
  const data = parser.eventsFromTja(tja, { 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  const resolved = edits.resolvedFromEvents(data.events);
  assert.deepStrictEqual(resolved.rollPairs, [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13], [14, 15]]);
  assert.strictEqual(resolved.hands.length, 16);
  assert.strictEqual(resolved.hands[0], "R");
  assert.strictEqual(resolved.hands[1], "R");
  assert.strictEqual(resolved.hands[2], "L");
});

console.log("");
if (failed.length) {
  console.log("hand-edits tests: " + passed + " passed, " + failed.length + " failed");
  process.exit(1);
}
console.log("hand-edits tests: " + passed + " passed");
