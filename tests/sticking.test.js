/**
 * Auto-sticking unit tests.
 * Fixtures: tests/fixtures/sticking-cases.json (from suyue@ebd21a0).
 *
 *   node tests/sticking.test.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const sticking = require(path.join(__dirname, "..", "js", "sticking.js"));

const FIXTURE = path.join(__dirname, "fixtures", "sticking-cases.json");
const data = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const cases = data.cases;
if (!Array.isArray(cases) || cases.length !== 55) {
  throw new Error("expected 55 sticking cases, got " + (cases && cases.length));
}

function runCase(c) {
  if (typeof sticking.fromInput === "function") return sticking.fromInput(c.input);
  const inp = c.input;
  const opts = Object.assign({
    bpm: inp.bpm,
    手法: inp.手法,
    惯用手: inp.惯用手,
  }, inp.options || {});
  return sticking.autoSticking(inp.notes, opts);
}

function samePairs(a, b) {
  const norm = (xs) => (xs || []).map((p) => p[0] + "-" + p[1]).sort();
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

function sameWarnings(a, b) {
  const norm = (xs) => (xs || []).map((w) => w[0] + "-" + w[1] + "-" + w[2]).sort();
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

function sameInserted(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

let passed = 0;
const failed = [];

for (const c of cases) {
  let out;
  try {
    out = runCase(c);
  } catch (err) {
    failed.push({ id: c.id, error: err && err.stack ? err.stack : String(err) });
    console.log("  ✗ " + c.id + "  threw: " + (err && err.message ? err.message : err));
    continue;
  }
  const exp = c.expected;
  const issues = [];
  if (!out || !Array.isArray(out.hands) || out.hands.join(" ") !== exp.hands.join(" ")) {
    issues.push("hands got " + (out && out.hands ? out.hands.join(" ") : String(out && out.hands)) +
      " expected " + exp.hands.join(" "));
  }
  if (!samePairs(out && out.rollPairs, exp.rollPairs)) {
    issues.push("rollPairs got " + JSON.stringify(out && out.rollPairs) +
      " expected " + JSON.stringify(exp.rollPairs));
  }
  if (!sameWarnings(out && out.warnings, exp.warnings)) {
    issues.push("warnings got " + JSON.stringify(out && out.warnings) +
      " expected " + JSON.stringify(exp.warnings));
  }
  if (exp.insertedNotes || (out && out.insertedNotes && out.insertedNotes.length)) {
    if (!sameInserted(out && out.insertedNotes, exp.insertedNotes)) {
      issues.push("insertedNotes got " + JSON.stringify(out && out.insertedNotes) +
        " expected " + JSON.stringify(exp.insertedNotes));
    }
  }
  if (issues.length) {
    failed.push({ id: c.id, issues });
    console.log("  ✗ " + c.id);
    issues.forEach((s) => console.log("      " + s));
  } else {
    passed += 1;
    console.log("  ✓ " + c.id);
  }
}

// --- 晓月入口约定：按 beat 排序、同拍重复警告、0/负间隔不当滚奏对 ---
function extra(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  ✓ " + name);
  } catch (err) {
    failed.push({ id: name, error: err && err.stack ? err.stack : String(err) });
    console.log("  ✗ " + name + "  " + (err && err.message ? err.message : err));
  }
}

extra("unsorted notes: hands/pairs map back to caller order", function () {
  // 时间序是 beat 0, 0.25, 0.5（16 分三连），但调用顺序是 0.25, 0, 0.5。
  const notes = [
    { beat: 0.25, colour: "don", big: false },
    { beat: 0, colour: "don", big: false },
    { beat: 0.5, colour: "don", big: false },
  ];
  const out = sticking.autoSticking(notes, { bpm: 200, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" });
  assert.deepStrictEqual(out.hands, ["L", "R", "R"], "hands in caller order");
  assert.deepStrictEqual(out.rollPairs, []);
  assert.deepStrictEqual(out.warnings, []);
});

extra("unsorted 16ths auto-roll: pair indices are original", function () {
  const notes = [
    { beat: 0.25, colour: "don", big: false },
    { beat: 0, colour: "don", big: false },
    { beat: 0.5, colour: "don", big: false },
    { beat: 0.75, colour: "don", big: false },
  ];
  const out = sticking.autoSticking(notes, { bpm: 250, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  // 时间序 0,0.25,0.5,0.75 → (RR)(LL)；映射回原下标 1,0,2,3
  assert.deepStrictEqual(out.hands, ["R", "R", "L", "L"]);
  const pairs = (out.rollPairs || []).map((p) => p.slice().sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
  assert.deepStrictEqual(pairs, [[0, 1], [2, 3]]);
});

extra("same-beat duplicates warn and do not form a roll pair", function () {
  const notes = [
    { beat: 0, colour: "don", big: false },
    { beat: 0, colour: "ka", big: false },
    { beat: 0.25, colour: "don", big: false },
  ];
  const out = sticking.autoSticking(notes, { bpm: 250, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  const types = (out.warnings || []).map((w) => w[2]);
  assert.ok(types.indexOf("同拍重复") >= 0, "expected 同拍重复 warning, got " + JSON.stringify(out.warnings));
  const dup = (out.warnings || []).find((w) => w[2] === "同拍重复");
  assert.strictEqual(dup[0], 0);
  assert.strictEqual(dup[1], 1);
  const pairs = out.rollPairs || [];
  const zeroSpan = pairs.some((p) => p[0] === 0 && p[1] === 1 || p[0] === 1 && p[1] === 0);
  assert.ok(!zeroSpan, "0-interval must not be a roll pair: " + JSON.stringify(pairs));
});

function notesAt(pat, step) {
  return pat.split("").map(function (c, i) {
    return { beat: +(i * step).toFixed(6), colour: c === "d" ? "don" : "ka", big: false };
  });
}

function pairSig(out) {
  return (out.rollPairs || []).map(function (p) { return p[0] + "-" + p[1]; }).join(",");
}

function assertStick(name, pat, step, hands, pairs, opts) {
  const out = sticking.autoSticking(notesAt(pat, step), Object.assign({
    bpm: 250, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏",
  }, opts || {}));
  assert.deepStrictEqual(out.hands, hands.split(""), name + " hands " + out.hands.join("") + " / " + pairSig(out));
  assert.strictEqual(pairSig(out), pairs, name + " pairs");
}

extra("16th 3-cycles pair 2-1: xoo oxx xxo oox and same-colour triples", function () {
  const s16 = 0.25;
  assertStick("xoo", "kddkdd", s16, "RRLRRL", "0-1,3-4");
  assertStick("oxx", "dkkdkk", s16, "RRLRRL", "0-1,3-4");
  assertStick("xxo", "kkdkkd", s16, "RRLRRL", "0-1,3-4");
  assertStick("oox", "ddkddk", s16, "RRLRRL", "0-1,3-4");
  assertStick("xoo x3", "kddkddkdd", s16, "RRLRRLRRL", "0-1,3-4,6-7");
  assertStick("xoo tail", "kddkddkddkd", s16, "RRLRRLRRLRR", "0-1,3-4,6-7,9-10");
  assertStick("ooo", "ddd", s16, "RRL", "0-1");
  assertStick("xxx", "kkk", s16, "RRL", "0-1");
  assertStick("xoo left", "kddkdd", s16, "LLRLLR", "0-1,3-4", { 惯用手: "L" });
});

extra("16th 4-note figures stay on the old grid, not 2-1", function () {
  const s16 = 0.25;
  // oxxo / ooox / xxxo, and the other colour polarity. Not re-cut as a 3-cycle.
  assertStick("oxxo dkkd", "dkkd", s16, "RRLL", "0-1,2-3");
  assertStick("ooox dddk", "dddk", s16, "RLLR", "1-2");
  assertStick("xxxo kkkd", "kkkd", s16, "RRLL", "0-1,2-3");
  assertStick("xood kddk", "kddk", s16, "RLLR", "1-2");
  assertStick("dense 8", "dddddddd", s16, "RRLLRRLL", "0-1,2-3,4-5,6-7");
});

extra("12ths stay beat-aligned 1-2; 24th xoo stays the old 1-2", function () {
  const s12 = 1 / 3;
  assertStick("12 xoo", "kddkdd", s12, "RLLRLL", "1-2,4-5");
  assertStick("12 xxo", "kkdkkd", s12, "RLLRLL", "1-2,4-5");
  assertStick("12 ooo", "ddd", s12, "RLL", "1-2");
  assertStick("24 xoo", "kddkdd", 1 / 6, "RLLRLL", "1-2,4-5");
  assertStick("24 dense", "dddddd", 1 / 6, "RRLLRR", "0-1,2-3,4-5");
});

extra("mid-phrase 16th pattern change switches to 2-1 and does not lock the rest", function () {
  const s16 = 0.25;
  // four dons, then kdd kdd: colour change starts the cell, prefix stays 2-2
  assertStick("dddd|kddkdd", "ddddkddkdd", s16, "RRLLRRLRRL", "0-1,2-3,4-5,7-8");
  // xoxo then kdd: the 3-cycle is 2-1, not left on the 2-2 grid
  assertStick("kdkd|kdd", "kdkdkddkdd", s16, "RRLLRRLRRL", "0-1,2-3,4-5,7-8");
  // kdd kdd then kkd kkd: second cell is its own 2-1, not locked 1-2
  assertStick("kdd|kkd", "kddkddkkdkkd", s16, "RRLRRLRRLRRL", "0-1,3-4,6-7,9-10");
  // kdd kdd then four dons: tail is 2-2, not the opening 1-2 phase
  assertStick("kdd|dddd", "kddkdddddd", s16, "RRLRRLRRLL", "0-1,3-4,6-7,8-9");
  // only the earlier ddk phase has two full cells; do not leave it on 2-2
  assertStick("dd|ddkddk", "ddddkddk", s16, "RRLLRLLR", "0-1,2-3,5-6");
});

extra("negative interval (out of order already fixed by sort) still maps, no bogus pair on equal beats", function () {
  const notes = [
    { beat: 1, colour: "don", big: false },
    { beat: 1, colour: "don", big: false },
  ];
  const out = sticking.autoSticking(notes, { bpm: 300, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  assert.ok((out.warnings || []).some((w) => w[2] === "同拍重复"));
  assert.deepStrictEqual(out.rollPairs || [], []);
  // 同拍两颗不算休息段（间隔为 0），全换在句内仍交替；只是不成滚奏对。
  assert.deepStrictEqual(out.hands, ["R", "L"]);
});

// Five 16ths roll to RRLLR (dominant R), so continuing the phrase would
// start the next cluster on L. A gap after beat 1.0 is the inbound of the cluster.
function afterFive(startBeat, pat, opts) {
  const notes = [];
  for (let i = 0; i < 5; i++) notes.push({ beat: i * 0.25, colour: "don", big: false });
  pat.split("").forEach(function (c, i) {
    notes.push({
      beat: +(startBeat + i * 0.25).toFixed(6),
      colour: c === "d" ? "don" : "ka",
      big: false,
    });
  });
  return sticking.autoSticking(notes, Object.assign({
    bpm: 200, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏",
  }, opts || {}));
}

function tailOf(out, from) {
  const pairs = (out.rollPairs || []).filter(function (p) { return p[0] >= from; });
  return {
    hands: out.hands.slice(from).join(""),
    pairs: pairs.map(function (p) { return (p[0] - from) + "-" + (p[1] - from); }).join(","),
    warn: (out.warnings || []).some(function (w) { return w[2] === "逆手起" && w[0] >= from; }),
  };
}

extra("rest longer than one beat: 三连 四连 五连 and 鱼蛋 start on the dominant hand", function () {
  // 间隔 1.5 拍（1.0 → 2.5）是新乐句。旧滚奏层会接着上一句的逆手。
  const gap = 2.5;
  let t = tailOf(afterFive(gap, "ddd"), 5);
  assert.strictEqual(t.hands, "RRL", "三连 " + t.hands);
  assert.strictEqual(t.pairs, "0-1");
  assert.strictEqual(t.warn, false);

  t = tailOf(afterFive(gap, "dddd"), 5);
  assert.strictEqual(t.hands, "RRLL", "四连 " + t.hands);
  assert.strictEqual(t.pairs, "0-1,2-3");
  assert.strictEqual(t.warn, false);

  t = tailOf(afterFive(gap, "ddddd"), 5);
  assert.strictEqual(t.hands, "RRLLR", "五连 " + t.hands);
  assert.strictEqual(t.pairs, "0-1,2-3");
  assert.strictEqual(t.warn, false);

  // 鱼蛋 xoxo：仍是默认 2-2 内刷，只是必须正手起。
  t = tailOf(afterFive(gap, "kdkd"), 5);
  assert.strictEqual(t.hands, "RRLL", "鱼蛋 xoxo " + t.hands);
  assert.strictEqual(t.pairs, "0-1,2-3");
  assert.strictEqual(t.warn, false);

  t = tailOf(afterFive(gap, "ddd", { 惯用手: "L" }), 5);
  assert.strictEqual(t.hands, "LLR", "惯用手 L " + t.hands);
  assert.strictEqual(t.pairs, "0-1");
  assert.strictEqual(t.warn, false);
});

extra("exactly one beat after a non-rest keeps 全换; 炒菜 segment still starts dominant", function () {
  // quan-huan-eq1-no-reset：前音不是休息段时，恰好 1 拍不新开乐句。
  let t = tailOf(afterFive(2.0, "ddd"), 5);
  assert.strictEqual(t.hands, "LLR", "全换 continues " + t.hands);
  assert.strictEqual(t.pairs, "0-1");
  assert.strictEqual(t.warn, true);
  // 炒菜的连音段本来就从惯用手起；滚奏层不能把段首改回上一串的逆手。
  t = tailOf(afterFive(2.0, "ddd", { 手法: "炒菜" }), 5);
  assert.strictEqual(t.hands, "RRL", "炒菜 segment " + t.hands);
  assert.strictEqual(t.pairs, "0-1");
  assert.strictEqual(t.warn, false);
});

extra("dense 16ths keep mid-stream 2-1, including the phrase after a rest", function () {
  // 六颗同色 2-2 之后下一只是逆手；两轮 kdd 仍按 2-1，不在格子中间重置正手。
  const pat = "ddddddkddkdd";
  const whole = sticking.autoSticking(notesAt(pat, 0.25), {
    bpm: 200, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏",
  });
  assert.strictEqual(whole.hands.join(""), "RRLLRRLLRLLR");
  assert.strictEqual(pairSig(whole), "0-1,2-3,4-5,6-7,9-10");

  const t = tailOf(afterFive(2.5, pat), 5);
  assert.strictEqual(t.hands, "RRLLRRLLRLLR", "after rest " + t.hands);
  assert.strictEqual(t.pairs, "0-1,2-3,4-5,6-7,9-10");
  assert.strictEqual(t.warn, false);
});

extra("BPM 270+ 炒菜 eighths stay all dominant; 半换A at 270 still alternates", function () {
  function eighthsAfter(bpm, opts) {
    const notes = [];
    for (let i = 0; i < 5; i++) notes.push({ beat: i * 0.25, colour: "don", big: false });
    for (let i = 0; i < 4; i++) notes.push({ beat: 2.5 + i * 0.5, colour: i % 2 ? "ka" : "don", big: false });
    return tailOf(sticking.autoSticking(notes, Object.assign({
      bpm: bpm, 手法: "炒菜", 惯用手: "R", 滚奏: "自动滚奏",
    }, opts || {})), 5);
  }
  const hi = eighthsAfter(270);
  assert.strictEqual(hi.hands, "RRRR", "270 " + hi.hands + " pairs " + hi.pairs);
  assert.strictEqual(hi.pairs, "");
  const faster = eighthsAfter(300);
  assert.strictEqual(faster.hands, "RRRR", "300 " + faster.hands);
  const left = eighthsAfter(270, { 惯用手: "L" });
  assert.strictEqual(left.hands, "LLLL", "270 L " + left.hands);
  const lo = eighthsAfter(269);
  assert.strictEqual(lo.hands, "RRRR", "269 " + lo.hands);
  assert.strictEqual(lo.pairs, "");
  const ban = eighthsAfter(270, { 手法: "半换A" });
  assert.strictEqual(ban.hands, "RLRL", "半换A 270 " + ban.hands);
});

// o = don, x = ka. Spaces in the owner's examples are figure boundaries,
// not a second colour. A continuous 16th stream is step 0.25; a spaced
// group is the next cluster after an interval >= 0.5.
function notesGrouped(groups, step, gap) {
  const notes = [];
  groups.forEach(function (pat) {
    for (let i = 0; i < pat.length; i++) {
      const beat = notes.length
        ? notes[notes.length - 1].beat + (i === 0 ? gap : step)
        : 0;
      const c = pat[i];
      notes.push({
        beat: +beat.toFixed(6),
        colour: (c === "o" || c === "d") ? "don" : "ka",
        big: false,
      });
    }
  });
  return notes;
}

function handsOf(notes, opts) {
  const out = sticking.autoSticking(notes, Object.assign({
    bpm: 200, 手法: "炒菜", 惯用手: "R", 滚奏: "不滚奏",
  }, opts || {}));
  return { hands: out.hands.join(""), pairs: pairSig(out), warnings: out.warnings || [] };
}

extra("owner 炒菜 examples: each 三连 and each spaced group starts on the dominant hand", function () {
  // oox oox xxo, continuous 16ths. Singles restart every cell.
  // Continuous alternation would be rlrlrlrlr.
  let g = handsOf(notesGrouped(["ooxooxxxo"], 0.25, 0.25));
  assert.strictEqual(g.hands, "RLRRLRRLR", "oox oox xxo " + g.hands);
  g = handsOf(notesGrouped(["ooxooxxxo"], 0.25, 0.25), { 惯用手: "L" });
  assert.strictEqual(g.hands, "LRLLRLLRL", "oox oox xxo L " + g.hands);

  // Same three 三连 with 自动滚奏: each cell is 2-1, RRL RRL RRL.
  g = handsOf(notesGrouped(["ooxooxxxo"], 0.25, 0.25), { 滚奏: "自动滚奏" });
  assert.strictEqual(g.hands, "RRLRRLRRL", "roll " + g.hands);
  assert.strictEqual(g.pairs, "0-1,3-4,6-7");
  g = handsOf(notesGrouped(["ooxooxxxo"], 0.25, 0.25), { 滚奏: "自动滚奏", 惯用手: "L" });
  assert.strictEqual(g.hands, "LLRLLRLLR", "roll L " + g.hands);
  assert.strictEqual(g.pairs, "0-1,3-4,6-7");

  // oxooxoox xoxoxx oooxxx. Gap of an 8th (0.5) between groups.
  // Each group alternates from 正手. o/x are colours.
  const spaced = ["oxooxoox", "xoxoxx", "oooxxx"];
  g = handsOf(notesGrouped(spaced, 0.25, 0.5));
  assert.strictEqual(g.hands, "RLRLRLRLRLRLRLRLRLRL", "spaced " + g.hands);
  g = handsOf(notesGrouped(spaced, 0.25, 0.5), { 惯用手: "L" });
  assert.strictEqual(g.hands, "LRLRLRLRLRLRLRLRLRLR", "spaced L " + g.hands);
  // The same colours with no gap are not a 三连 tiling, so they stay one alternation.
  g = handsOf(notesGrouped([spaced.join("")], 0.25, 0.25));
  assert.strictEqual(g.hands, "RLRLRLRLRLRLRLRLRLRL", "continuous groups " + g.hands);
  // Odd cluster then a spaced group: the group must not continue onto L.
  g = handsOf(notesGrouped(["oox", "oxooxoox"], 0.25, 0.5));
  assert.strictEqual(g.hands, "RLRRLRLRLRL", "odd then spaced " + g.hands);
});

extra("炒菜 散音 eighths are all the dominant hand, including a mixed-colour run", function () {
  function eighths(bpm, hand) {
    const notes = [];
    for (let i = 0; i < 4; i++) {
      notes.push({ beat: i * 0.5, colour: i % 2 ? "ka" : "don", big: false });
    }
    return handsOf(notes, { bpm: bpm, 惯用手: hand, 滚奏: "自动滚奏" });
  }
  assert.strictEqual(eighths(200, "R").hands, "RRRR");
  assert.strictEqual(eighths(270, "R").hands, "RRRR");
  assert.strictEqual(eighths(300, "R").hands, "RRRR");
  assert.strictEqual(eighths(270, "L").hands, "LLLL");
  assert.strictEqual(eighths(300, "R").pairs, "");
});

extra("炒菜 consecutive 三连 each start dominant; 全换 still carries the 2-1 hand", function () {
  // Six same-colour 16ths, then two kdd. 全换 keeps 2-1 from the off-hand.
  const pat = "ddddddkddkdd";
  const quan = sticking.autoSticking(notesAt(pat, 0.25), {
    bpm: 200, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏",
  });
  assert.strictEqual(quan.hands.join(""), "RRLLRRLLRLLR");
  assert.strictEqual(pairSig(quan), "0-1,2-3,4-5,6-7,9-10");

  const singles = handsOf(notesGrouped(["ddddddkddkdd"], 0.25, 0.25));
  assert.strictEqual(singles.hands, "RLRLRLRLRRLR", "singles " + singles.hands);
  const rolled = handsOf(notesGrouped(["ddddddkddkdd"], 0.25, 0.25), { 滚奏: "自动滚奏" });
  assert.strictEqual(rolled.hands, "RRLLRRRRLRRL", "roll " + rolled.hands);
  assert.strictEqual(rolled.pairs, "0-1,2-3,4-5,6-7,9-10");
  const left = handsOf(notesGrouped(["ddddddkddkdd"], 0.25, 0.25), { 滚奏: "自动滚奏", 惯用手: "L" });
  assert.strictEqual(left.hands, "LLRRLLLLRLLR", "roll L " + left.hands);
  assert.strictEqual(left.pairs, "0-1,2-3,4-5,6-7,9-10");

  // 24分滚奏 still does not roll 16ths; 炒菜 cells stay singles from 正手.
  const slow = handsOf(notesGrouped(["ooxooxxxo"], 0.25, 0.25), { 滚奏: "24分滚奏" });
  assert.strictEqual(slow.hands, "RLRRLRRLR", "24roll cells " + slow.hands);
  assert.strictEqual(slow.pairs, "");
});

extra("24分滚奏 keeps the original pairing", function () {
  // 32 分 2-2，24 分从段首 1-2，16 分和 12 分不滚。
  assertStick("32 is 2-2", "dddddddd", 0.125, "RRLLRRLL", "0-1,2-3,4-5,6-7", { 滚奏: "24分滚奏" });
  assertStick("24 is 1-2", "dddddd", 1 / 6, "RLLRLL", "1-2,4-5", { 滚奏: "24分滚奏" });
  assertStick("24 left", "dddddd", 1 / 6, "LRRLRR", "1-2,4-5", { 滚奏: "24分滚奏", 惯用手: "L" });
  assertStick("16 stays singles", "dddddddd", 0.25, "RLRLRLRL", "", { 滚奏: "24分滚奏" });
  assertStick("16 left stays singles", "dddddddd", 0.25, "LRLRLRLR", "", { 滚奏: "24分滚奏", 惯用手: "L" });
  assertStick("12 stays unrolled", "kddkdd", 1 / 3, "RLRLRL", "", { 滚奏: "24分滚奏" });
});

console.log("sticking: " + passed + "/" + cases.length + " cases + extras, failed " + failed.length);
if (failed.length) process.exit(1);
console.log("sticking: all passed (" + passed + ")");
