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
const parser = require(path.join(__dirname, "..", "js", "parser.js"));

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

extra("16th 4-note figures are 2-2 from the first note, not a shift", function () {
  const s16 = 0.25;
  // 短于 8 音，也不当三连。ooox / xood 以前会挪成第一颗单打；现在从第一颗 2-2。
  assertStick("oxxo dkkd", "dkkd", s16, "RRLL", "0-1,2-3");
  assertStick("ooox dddk", "dddk", s16, "RRLL", "0-1,2-3");
  assertStick("xxxo kkkd", "kkkd", s16, "RRLL", "0-1,2-3");
  assertStick("xood kddk", "kddk", s16, "RRLL", "0-1,2-3");
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
  // One 16th rest (gap 0.5) inside 16th material stays one string: do not restart 正手.
  g = handsOf(notesGrouped(["oox", "oxooxoox"], 0.25, 0.5));
  assert.strictEqual(g.hands, "RLRLRLRLRLR", "16th rest stays one string " + g.hands);
  // A wider gap (two 16th rests) still starts the next group on the dominant hand.
  g = handsOf(notesGrouped(["oox", "oxooxoox"], 0.25, 0.75));
  assert.strictEqual(g.hands, "RLRRLRLRLRL", "wider gap restarts " + g.hands);
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

function notesWithHole(leftPat, rightPat, leftStep, gap, rightStep) {
  const notes = [];
  function push(pat, step, firstGap) {
    for (let i = 0; i < pat.length; i++) {
      const beat = notes.length
        ? notes[notes.length - 1].beat + (i === 0 ? firstGap : step)
        : 0;
      const c = pat[i];
      notes.push({
        beat: +beat.toFixed(6),
        colour: (c === "o" || c === "d") ? "don" : "ka",
        big: false,
      });
    }
  }
  push(leftPat, leftStep, leftStep);
  push(rightPat, rightStep, gap);
  return notes;
}

extra("one 16th rest inside a 鱼蛋 stays one string for 半换 A/B and 炒菜", function () {
  // 5 + 5 is odd on the left, so a cut that restarts 正手 puts RR on the boundary.
  // 不滚奏 should be one alternation from the dominant hand.
  const notes = notesWithHole("xoxox", "xoxox", 0.25, 0.5, 0.25);
  const gap = notes[5].beat - notes[4].beat;
  assert.ok(Math.abs(gap - 0.5) < 1e-6, "hit-to-hit across the rest is half a beat");
  ["半换A", "半换B", "炒菜"].forEach(function (tech) {
    const g = handsOf(notes, { 手法: tech, 滚奏: "不滚奏", 惯用手: "R", bpm: 200 });
    assert.strictEqual(g.hands, "RLRLRLRLRL", tech + " " + g.hands);
    const left = handsOf(notes, { 手法: tech, 滚奏: "不滚奏", 惯用手: "L", bpm: 200 });
    assert.strictEqual(left.hands, "LRLRLRLRLR", tech + " L " + left.hands);
  });
  // Same notes with no rest: the hole must not change the 不滚奏 hand sequence.
  const flat = notesGrouped(["xoxoxxoxox"], 0.25, 0.25);
  const holed = handsOf(notes, { 手法: "炒菜", 滚奏: "不滚奏" });
  const solid = handsOf(flat, { 手法: "炒菜", 滚奏: "不滚奏" });
  assert.strictEqual(holed.hands, solid.hands);
});

extra("炒菜 does not turn the tail after one 16th rest into 散音", function () {
  // Second half is oooo x (ddddk). A cut used to fill those five with the dominant hand.
  const notes = notesWithHole("xoxox", "oooo x".replace(/ /g, ""), 0.25, 0.5, 0.25);
  const g = handsOf(notes, { 手法: "炒菜", 滚奏: "不滚奏", 惯用手: "R", bpm: 180 });
  assert.strictEqual(g.hands, "RLRLRLRLRL", "tail " + g.hands);
  assert.ok(!/R{3,}/.test(g.hands), "no run of 右");
  const rolled = handsOf(notes, { 手法: "炒菜", 滚奏: "自动滚奏", 惯用手: "R", bpm: 180 });
  assert.ok(!/R{5,}/.test(rolled.hands), "自动滚奏 tail " + rolled.hands);
});

extra("genuine eighths stay 散音 after a 16th string, and pure eighths stay dominant", function () {
  // 3 sixteenths, then a half-beat step into eighths. The right side is not a 16th hole.
  const notes = notesWithHole("xox", "xoxo", 0.25, 0.5, 0.5);
  const g = handsOf(notes, { 手法: "炒菜", 滚奏: "不滚奏", 惯用手: "R", bpm: 200 });
  assert.strictEqual(g.hands.slice(0, 3), "RLR", "16ths " + g.hands);
  assert.strictEqual(g.hands.slice(3), "RRRR", "eighths " + g.hands);
  const ban = handsOf(notes, { 手法: "半换A", 滚奏: "不滚奏", 惯用手: "R", bpm: 200 });
  assert.strictEqual(ban.hands.slice(0, 3), "RLR", "半换A 16ths " + ban.hands);
  // Trailing eighths are still one 散音 group and alternate from 正手, as before.
  assert.strictEqual(ban.hands.slice(3), "RLRL", "半换A eighths " + ban.hands);
  const only8 = [];
  for (let i = 0; i < 4; i++) {
    only8.push({ beat: i * 0.5, colour: i % 2 ? "ka" : "don", big: false });
  }
  assert.strictEqual(handsOf(only8, { 手法: "炒菜", 滚奏: "自动滚奏", bpm: 200 }).hands, "RRRR");
  assert.strictEqual(handsOf(only8, { 手法: "半换A", 滚奏: "不滚奏", bpm: 160 }).hands, "RLRL");
  assert.strictEqual(handsOf(only8, { 手法: "半换B", 滚奏: "不滚奏", bpm: 160 }).hands, "RLRL");
});

extra("24分滚奏 keeps 32 as 2-2 and rolls 24 triplets as 2-1", function () {
  // 32 分 2-2。不在鱼蛋里、又不是正好四颗的 24 分按三连 2-1，尾巴单打。
  // 正好四颗的 1-2-1 在下面的四连用例。16 分和 12 分不滚。
  assertStick("32 is 2-2", "dddddddd", 0.125, "RRLLRRLL", "0-1,2-3,4-5,6-7", { 滚奏: "24分滚奏" });
  assertStick("24 six is two triplets", "dddddd", 1 / 6, "RRLRRL", "0-1,3-4", { 滚奏: "24分滚奏" });
  assertStick("24 six left", "dddddd", 1 / 6, "LLRLLR", "0-1,3-4", { 滚奏: "24分滚奏", 惯用手: "L" });
  assertStick("24 four is 1-2-1", "dddd", 1 / 6, "RLLR", "1-2", { 滚奏: "24分滚奏" });
  assertStick("24 five leaves two singles", "ddddd", 1 / 6, "RRLRL", "0-1", { 滚奏: "24分滚奏" });
  assertStick("24 two are singles", "dd", 1 / 6, "RL", "", { 滚奏: "24分滚奏" });
  assertStick("24 eight is two triplets plus two singles", "dddddddd", 1 / 6, "RRLRRLRL", "0-1,3-4", { 滚奏: "24分滚奏" });
  assertStick("16 stays singles", "dddddddd", 0.25, "RLRLRLRL", "", { 滚奏: "24分滚奏" });
  assertStick("16 left stays singles", "dddddddd", 0.25, "LRLRLRLR", "", { 滚奏: "24分滚奏", 惯用手: "L" });
  assertStick("12 stays unrolled", "kddkdd", 1 / 3, "RLRLRL", "", { 滚奏: "24分滚奏" });
});

// 咚 = don，咔 = ka。下面都是合成音符，不读谱面、不读音频。
function notesByGaps(pat, gaps) {
  const notes = [];
  let beat = 0;
  for (let i = 0; i < pat.length; i++) {
    if (i > 0) beat += gaps[i - 1];
    const c = pat[i];
    notes.push({
      beat: beat,
      colour: (c === "d" || c === "o") ? "don" : "ka",
      big: false,
    });
  }
  return notes;
}

function sandwichNotes(cells, outer, junction) {
  const mid = 1 / 6;
  const join = junction == null ? outer : junction;
  let pat = "";
  const gaps = [];
  cells.forEach(function (cell, idx) {
    if (idx > 0) gaps.push(join);
    pat += cell;
    gaps.push(outer, mid, outer);
  });
  return notesByGaps(pat, gaps);
}

function leadThenSandwich(lead, cell, outer) {
  const gaps = [];
  for (let i = 0; i < lead.length - 1; i++) gaps.push(0.25);
  gaps.push(0.25);
  gaps.push(outer, 1 / 6, outer);
  return notesByGaps(lead + cell, gaps);
}

function assertRoll(name, notes, hands, pairs, opts) {
  const out = sticking.autoSticking(notes, Object.assign({
    bpm: 170, 手法: "全换", 惯用手: "R", 滚奏: "24分滚奏",
  }, opts || {}));
  assert.strictEqual(out.hands.join(""), hands, name + " hands " + out.hands.join("") + " / " + pairSig(out));
  assert.strictEqual(pairSig(out), pairs, name + " pairs " + pairSig(out));
}

extra("24分滚奏 16夹24 and 12夹24 quads use 1-2, not 1-2-1", function () {
  // 16-24-16、12-24-12 的四音不再把中间两颗配成 1-2-1。
  // 它们走 16夹24 / 12夹24 的 1-2：这里没有连续两颗以上的 24 分可配，所以整格单打交替。
  const quads = [
    ["dkkd", "咚咔咔咚"],
    ["kddk", "咔咚咚咔"],
    ["dddk", "咚咚咚咔"],
    ["kkkd", "咔咔咔咚"],
    ["dddd", "咚咚咚咚"],
    ["kddd", "咔咚咚咚"],
    ["dkkk", "咚咔咔咔"],
    ["kkkk", "咔咔咔咔"],
  ];
  quads.forEach(function (row) {
    const pat = row[0];
    const label = row[1];
    assertRoll("16 " + label, sandwichNotes([pat], 0.25), "RLRL", "");
    assertRoll("12 " + label, sandwichNotes([pat], 1 / 3), "RLRL", "");
    assertRoll("16 " + label + " L", sandwichNotes([pat], 0.25), "LRLR", "", { 惯用手: "L" });
    assertRoll("12 " + label + " L", sandwichNotes([pat], 1 / 3), "LRLR", "", { 惯用手: "L" });
  });

  // 接在 16 分后面也只是接着交替，不再在夹心上收成左、右右、左。
  assertRoll("16 after stream ended R", leadThenSandwich("ddd", "dkkd", 0.25), "RLRLRLR", "");
  assertRoll("12 after stream ended R", leadThenSandwich("ddd", "dkkd", 1 / 3), "RLRLRLR", "");
  assertRoll("16 after stream ended L", leadThenSandwich("dd", "dkkd", 0.25), "RLRLRL", "");
  assertRoll("12 after stream ended L", leadThenSandwich("dd", "dkkd", 1 / 3), "RLRLRL", "");
  assertRoll("16 two cells", sandwichNotes(["dkkd", "dkkd"], 0.25), "RLRLRLRL", "");
  assertRoll("12 two cells", sandwichNotes(["dkkd", "dkkd"], 1 / 3), "RLRLRLRL", "");
  assertRoll("16 new phrase", sandwichNotes(["dkkd", "dkkd"], 0.25, 1.5), "RLRLRLRL", "");
  assertRoll("12 new phrase", sandwichNotes(["dkkd", "dkkd"], 1 / 3, 1.5), "RLRLRLRL", "");
  assertRoll("16 half beat carries", sandwichNotes(["dkkd", "dkkd"], 0.25, 0.5), "RLRLRLRL", "");
  assertRoll("16 咚咚咚咚 after R", leadThenSandwich("ddd", "dddd", 0.25), "RLRLRLR", "");
  assertRoll("12 咔咔咔咔 after R", leadThenSandwich("ddd", "kkkk", 1 / 3), "RLRLRLR", "");
  assertRoll("16 咚咚咚咚 two cells", sandwichNotes(["dddd", "dddd"], 0.25), "RLRLRLRL", "");

  // 中间一咚一咔本来就不成对。
  assertRoll("16 鱼蛋 咔咚咔咚 stays singles", sandwichNotes(["kdkd"], 0.25), "RLRL", "");
  assertRoll("12 鱼蛋 咔咚咔咚 stays singles", sandwichNotes(["kdkd"], 1 / 3), "RLRL", "");
  assertRoll("16 鱼蛋 咚咔咚咔 stays singles", sandwichNotes(["dkdk"], 0.25), "RLRL", "");
  assertRoll("12 鱼蛋 咚咔咚咔 stays singles", sandwichNotes(["dkdk"], 1 / 3), "RLRL", "");
});

extra("炒菜 sandwich cells no longer roll 1-2-1", function () {
  // 夹心不再配成滚奏。空拍把句切开时，单打交替从正手起，看起来和接着走一样。
  assertRoll("炒菜 16 hole", sandwichNotes(["dkkd", "dkkd"], 0.25, 0.5), "RLRLRLRL", "", { 手法: "炒菜" });
  assertRoll("炒菜 16 new cluster", sandwichNotes(["dkkd", "dkkd"], 0.25, 1), "RLRLRLRL", "", { 手法: "炒菜" });
  assertRoll("炒菜 12 new cluster", sandwichNotes(["dkkd", "dkkd"], 1 / 3, 0.5), "RLRLRLRL", "", { 手法: "炒菜" });
  assertRoll("炒菜 L", sandwichNotes(["dkkd"], 0.25), "LRLR", "", { 手法: "炒菜", 惯用手: "L" });
});

extra("alternating ox clusters pair 2-2 from the first note and keep 逆手外刷", function () {
  const s16 = 0.25;
  // oxoxoxo（7 音）正手起：(ox)(ox)(ox) 全是外刷，末颗单打留在串尾。
  // 第二对落在逆手，保留。不能前移成 (o)(xo)(xo)(xo)，也不能把这一对拆回单打。
  assertStick("oxoxoxo", "dkdkdkd", s16, "RRLLRRL", "0-1,2-3,4-5");
  assertStick("oxoxox", "dkdkdk", s16, "RRLLRR", "0-1,2-3,4-5");
  assertStick("oxox", "dkdk", s16, "RRLL", "0-1,2-3");
  // 奇数余音在尾，不挪到开头。旧逻辑会变成 R + (xo)(xo)。
  assertStick("oxoxo leftover", "dkdkd", s16, "RRLLR", "0-1,2-3");
  // 惯用手为左时正手仍是左手，不改成右手来躲开逆手外刷。
  assertStick("oxoxoxo L", "dkdkdkd", s16, "LLRRLLR", "0-1,2-3,4-5", { 惯用手: "L" });
  assertStick("炒菜 oxoxoxo", "dkdkdkd", s16, "RRLLRRL", "0-1,2-3,4-5", { 手法: "炒菜", bpm: 200 });
  // xoxo / xoxoxo 仍是 2-2 内刷，正手起。
  assertStick("xoxo", "kdkd", s16, "RRLL", "0-1,2-3");
  assertStick("xoxoxo", "kdkdkd", s16, "RRLLRR", "0-1,2-3,4-5");
  assertStick("xoxo L", "kdkd", s16, "LLRR", "0-1,2-3", { 惯用手: "L" });
  // 32 分在自动滚奏和 24 分滚奏里都是 2-2，逆手外刷同样保留。
  assertStick("32 oxoxoxo", "dkdkdkd", 0.125, "RRLLRRL", "0-1,2-3,4-5");
  assertStick("32 oxoxoxo 24mode", "dkdkdkd", 0.125, "RRLLRRL", "0-1,2-3,4-5", { 滚奏: "24分滚奏" });
  assertStick("32 xoxo 24mode", "kdkd", 0.125, "RRLL", "0-1,2-3", { 滚奏: "24分滚奏" });
  // 不在鱼蛋里、又不是正好四颗的 24 分仍是三连 2-1。四连 1-2-1 不在这条里。
  assertStick("24 oxoxoxo is 2-1", "dkdkdkd", 1 / 6, "RRLRRLR", "0-1,3-4", { 滚奏: "24分滚奏" });
});

extra("two-note off-hand ox stays singles", function () {
  // 散音之后的两音 16 分从逆手起。整对都是逆手外刷，没有更长的整串外刷，仍改单打。
  const notes = [
    { beat: 0, colour: "ka", big: false },
    { beat: 0.75, colour: "don", big: false },
    { beat: 1, colour: "ka", big: false },
  ];
  const out = sticking.autoSticking(notes, { bpm: 250, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  assert.deepStrictEqual(out.hands, ["R", "L", "R"]);
  assert.deepStrictEqual(out.rollPairs, []);
  assert.deepStrictEqual(out.warnings, []);
});

extra("自动滚奏 keeps 16夹24 oxxo on continuous 2-2", function () {
  // 这是 16-24-16 的夹心，不是连续四颗 24 分。自动滚奏仍整格 2-2，不套四连的 1-2-1。
  assertRoll("auto 16 oxxo", sandwichNotes(["dkkd"], 0.25), "RRLL", "0-1,2-3", { 滚奏: "自动滚奏" });
  assertRoll("auto 16 two", sandwichNotes(["dkkd", "dkkd"], 0.25), "RRLLRRLL", "0-1,2-3,4-5,6-7", { 滚奏: "自动滚奏" });
  assertRoll("auto 12 oxxo", sandwichNotes(["dkkd"], 1 / 3), "RRLL", "0-1,2-3", { 滚奏: "自动滚奏" });
  assertRoll("auto 16 咔咚咚咔", sandwichNotes(["kddk"], 0.25), "RRLL", "0-1,2-3", { 滚奏: "自动滚奏" });
  assertRoll("auto 16 ooox", sandwichNotes(["dddk"], 0.25), "RRLL", "0-1,2-3", { 滚奏: "自动滚奏" });
  assertRoll("auto 16 xxxo", sandwichNotes(["kkkd"], 0.25), "RRLL", "0-1,2-3", { 滚奏: "自动滚奏" });
  assertRoll("auto 16 咚咚咚咚", sandwichNotes(["dddd"], 0.25), "RRLL", "0-1,2-3", { 滚奏: "自动滚奏" });
});

function quad24Groups(gap) {
  const step = 1 / 6;
  const gaps = [];
  const pat = "dddddddd";
  for (let i = 0; i < 7; i++) gaps.push(i === 3 ? gap : step);
  return notesByGaps(pat, gaps);
}

extra("四连 24分 is 1-2-1, including 自动滚奏", function () {
  // 正好连续四颗 24 分：单、对、单。24 分滚奏不再是三连加一颗，自动滚奏不再是 2-2。
  const step = 1 / 6;
  ["dddd", "dkkd", "kddk", "dkdk"].forEach(function (pat) {
    assertStick("24 " + pat, pat, step, "RLLR", "1-2", { 滚奏: "24分滚奏" });
    assertStick("auto " + pat, pat, step, "RLLR", "1-2");
  });
  assertStick("24 L", "dddd", step, "LRRL", "1-2", { 滚奏: "24分滚奏", 惯用手: "L" });
  assertStick("auto L", "dddd", step, "LRRL", "1-2", { 惯用手: "L" });
  // 中间那对是咚咔外刷，落在起手的另一只手上，仍按逆手外刷拆开。
  assertStick("24 kdkd breaks", "kdkd", step, "RLRL", "", { 滚奏: "24分滚奏" });
  assertStick("auto kdkd breaks", "kdkd", step, "RLRL", "");
  assertStick("24 kdkd L breaks", "kdkd", step, "LRLR", "", { 滚奏: "24分滚奏", 惯用手: "L" });
  assertStick("off stays singles", "dddd", step, "RLRL", "", { 滚奏: "不滚奏" });

  // 不是正好四颗：三连 2-1、自动滚奏 2-2 都保持原样。八连不是两个四连。
  assertStick("24 three", "ddd", step, "RRL", "0-1", { 滚奏: "24分滚奏" });
  assertStick("24 five", "ddddd", step, "RRLRL", "0-1", { 滚奏: "24分滚奏" });
  assertStick("24 six", "dddddd", step, "RRLRRL", "0-1,3-4", { 滚奏: "24分滚奏" });
  assertStick("24 eight", "dddddddd", step, "RRLRRLRL", "0-1,3-4", { 滚奏: "24分滚奏" });
  assertStick("auto three", "ddd", step, "RRL", "0-1");
  assertStick("auto six", "dddddd", step, "RRLLRR", "0-1,2-3,4-5");
  assertStick("auto eight", "dddddddd", step, "RRLLRRLL", "0-1,2-3,4-5,6-7");

  // 两组四连隔半拍。全换下一组换手起；炒菜每组正手起。自动滚奏同样 1-2-1。
  assertRoll("two quads carry", quad24Groups(0.5), "RLLRLRRL", "1-2,5-6");
  assertRoll("two quads auto", quad24Groups(0.5), "RLLRLRRL", "1-2,5-6", { 滚奏: "自动滚奏" });
  assertRoll("two quads 炒菜", quad24Groups(0.5), "RLLRRLLR", "1-2,5-6", { 手法: "炒菜" });

  // 四连后面接着 16 分：四颗仍是 1-2-1，16 分在 24 分滚奏里不滚。
  assertRoll("quad then 16", notesByGaps("kkkkdd", [step, step, step, 0.25, 0.25]), "RLLRLR", "1-2");
  // 16 夹着连续四颗 24 分：仍走鱼蛋 1-2，不改成单独的四连 1-2-1。12 夹 24 仍是入间隔 1-2。
  // 四颗 24 分各自的入间隔都是 24 分，所以前面那颗 16/12 到第一颗 24 分的间隔也是 24 分。
  assertRoll("16 clamps four 24s", notesByGaps("ddkkkkd", [0.25, step, step, step, step, 0.25]), "RLRRLRL", "2-3");
  assertRoll("12 clamps four 24s", notesByGaps("ddkkkkdd", [1 / 3, step, step, step, step, 1 / 3, 1 / 3]), "RLRLLRLR", "3-4");
  // 自动滚奏里，夹在 16 分中间的连续四颗 24 分也是 1-2-1。旁边的 16 分仍 2-2。
  assertRoll("auto 16 around quad", notesByGaps("ddkkkkd", [0.25, step, step, step, step, 0.25]), "RRLRRLR", "0-1,3-4", { 滚奏: "自动滚奏" });
  // 16 分之后隔半拍，后面的四连是新的一组，不是 16夹24。
  assertRoll("quad after a 16th and a half beat", notesByGaps("ddkkkk", [0.25, 0.5, step, step, step]), "RLRLLR", "3-4");
});

function tjaBySlots(marks, slots) {
  const chars = Array(slots).fill("0");
  marks.forEach(function (m) { chars[m[0]] = m[1]; });
  const text = [
    "TITLE:synth", "BPM:120", "OFFSET:0", "COURSE:Oni", "LEVEL:1",
    "#START", chars.join("") + ",", "#END", "",
  ].join("\n");
  const parsed = parser.parseTja(text);
  return parser.notesToStickingInput(parsed.notes, parsed.measures, false);
}

extra("synthetic TJA: 16夹24 fish 24s are 1-2, 12夹24 stays", function () {
  // ooo(xxx)ooo。1 是咚，2 是咔。48 槽里 16 分占 3 槽、24 分占 2 槽。
  const fish = tjaBySlots([
    [0, "1"], [3, "1"], [6, "1"],
    [9, "2"], [11, "2"], [13, "2"],
    [15, "1"], [18, "1"], [21, "1"],
  ], 48);
  assertRoll("16 fish ooox(xx)ooo", fish, "RLRLRRLRL", "4-5");
  // 连续两个 16夹24 鱼蛋 ooo(xxx)ooo(xxx)。1-2 接着数，第二组 (xx) 是逆手滚。
  // 第二组 24 分恰好结在谱尾，后面没有再跟 16 分。
  const twoFishEnd = tjaBySlots([
    [0, "1"], [3, "1"], [6, "1"],
    [9, "2"], [11, "2"], [13, "2"],
    [15, "1"], [18, "1"], [21, "1"],
    [24, "2"], [26, "2"], [28, "2"],
  ], 48);
  ["全换", "炒菜", "半换A", "半换B"].forEach(function (tech) {
    assertRoll("two fish end " + tech, twoFishEnd, "RLRLRRLRLRLL", "4-5,10-11", { 手法: tech });
  });
  // 第二组后面还有 16 分，仍是 1-2 逆手滚，不改成 2-1。
  const twoFishMore = tjaBySlots([
    [0, "1"], [3, "1"], [6, "1"],
    [9, "2"], [11, "2"], [13, "2"],
    [15, "1"], [18, "1"], [21, "1"],
    [24, "2"], [26, "2"], [28, "2"],
    [30, "1"], [33, "1"], [36, "1"],
  ], 48);
  ["全换", "炒菜", "半换A", "半换B"].forEach(function (tech) {
    assertRoll("two fish more " + tech, twoFishMore, "RLRLRRLRLRLLRLR", "4-5,10-11", { 手法: tech });
  });
  // 12 夹 24：12 分占 4 槽。仍是旧的入间隔 1-2，把后面那颗 12 分卷进 24 段。
  const fish12 = tjaBySlots([
    [0, "1"], [4, "1"], [8, "1"],
    [12, "2"], [14, "2"], [16, "2"],
    [18, "1"], [22, "1"], [26, "1"],
  ], 48);
  assertRoll("12 fish unchanged", fish12, "RLRLRLLRL", "5-6");
});

extra("全换 after 散音 keeps the off-hand start and does not warn", function () {
  function at(list) {
    return list.map(function (b) {
      return { beat: b[0], colour: b[1] === "x" ? "ka" : "don", big: false };
    });
  }
  // 8 分后面的 16 分五连 oxoxo：全换从逆手起，手顺不改成正手，也不标拿不准。
  let out = sticking.autoSticking(at([
    [0, "o"], [0.5, "o"], [0.75, "x"], [1, "o"], [1.25, "x"], [1.5, "o"],
  ]), { bpm: 200, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  assert.strictEqual(out.hands.join(""), "RLLRRL", "oxoxo " + out.hands.join(""));
  assert.strictEqual(pairSig(out), "1-2,3-4");
  assert.deepStrictEqual(out.warnings, []);
  // 16 分三连 xxo 仍是 2-1，起手留在逆手。
  out = sticking.autoSticking(at([
    [0, "o"], [0.5, "x"], [0.75, "x"], [1, "o"],
  ]), { bpm: 200, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  assert.strictEqual(out.hands.join(""), "RLLR", "xxo " + out.hands.join(""));
  assert.strictEqual(pairSig(out), "1-2");
  assert.deepStrictEqual(out.warnings, []);
  // 不滚奏也接着交替，不标拿不准。
  out = sticking.autoSticking(at([
    [0, "o"], [0.5, "o"], [0.75, "o"], [1, "o"], [1.25, "o"],
  ]), { bpm: 200, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" });
  assert.strictEqual(out.hands.join(""), "RLRLR");
  assert.deepStrictEqual(out.warnings, []);
  // 密串后面空恰好一拍，不是散音后。全换仍接着打，逆手起照旧标。
  const kept = tailOf(afterFive(2.0, "ddd"), 5);
  assert.strictEqual(kept.hands, "LLR");
  assert.strictEqual(kept.warn, true);
});

extra("炒菜 restarts a dense string on the dominant hand after 散音", function () {
  const notes = [
    { beat: 0, colour: "don", big: false },
    { beat: 1, colour: "don", big: false },
    { beat: 1.25, colour: "ka", big: false },
    { beat: 1.5, colour: "don", big: false },
    { beat: 1.75, colour: "ka", big: false },
  ];
  let out = sticking.autoSticking(notes, { bpm: 200, 手法: "炒菜", 惯用手: "R", 滚奏: "不滚奏" });
  assert.strictEqual(out.hands.join(""), "RRLRL", "炒菜 singles " + out.hands.join(""));
  out = sticking.autoSticking(notes, { bpm: 200, 手法: "炒菜", 惯用手: "R", 滚奏: "自动滚奏" });
  assert.strictEqual(out.hands.join(""), "RRRLL", "炒菜 roll " + out.hands.join(""));
  assert.strictEqual(pairSig(out), "1-2,3-4");
  // 串尾只空一格 16 分仍是同一串，不重新正手起。
  const hole = [0, 0.25, 0.5, 1, 1.25, 1.5].map(function (b) {
    return { beat: b, colour: "don", big: false };
  });
  out = sticking.autoSticking(hole, { bpm: 200, 手法: "炒菜", 惯用手: "R", 滚奏: "不滚奏" });
  assert.strictEqual(out.hands.join(""), "RLRLRL", "hole " + out.hands.join(""));
});

// 三连之间隔半拍，中间夹一颗咚的单打，不是休止。三连和单打都是咚。
function spacedTripleDon() {
  const groups = ["ddd", "d", "ddd", "d", "ddd"];
  const notes = [];
  let beat = 0;
  groups.forEach(function (g) {
    for (let i = 0; i < g.length; i++) {
      if (notes.length) beat += (i === 0 ? 0.5 : 0.25);
      notes.push({ beat: +beat.toFixed(6), colour: "don", big: false });
    }
  });
  return notes;
}

extra("全换自动滚奏：有间隔的三连滚完接着数，炒菜仍正手起", function () {
  const notes = spacedTripleDon();
  // (RR)l r (LL)r l (RR)l。三连正、逆、正轮着滚，夹着的咚接着滚完后的下一只手。
  const quan = sticking.autoSticking(notes, { bpm: 200, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏" });
  assert.strictEqual(quan.hands.join(""), "RRLRLLRLRRL", "全换 " + quan.hands.join(""));
  assert.strictEqual(pairSig(quan), "0-1,4-5,8-9");
  assert.deepStrictEqual(quan.warnings, []);
  const left = sticking.autoSticking(notes, { bpm: 200, 手法: "全换", 惯用手: "L", 滚奏: "自动滚奏" });
  assert.strictEqual(left.hands.join(""), "LLRLRRLRLLR", "全换 L " + left.hands.join(""));
  assert.strictEqual(pairSig(left), "0-1,4-5,8-9");
  // 没有滚奏就不要改掉原来的单打交替。24 分滚奏里这些 16 分也不滚。
  const flat = sticking.autoSticking(notes, { bpm: 200, 手法: "全换", 惯用手: "R", 滚奏: "不滚奏" });
  assert.strictEqual(flat.hands.join(""), "RLRLRLRLRLR");
  assert.strictEqual(pairSig(flat), "");
  const slow = sticking.autoSticking(notes, { bpm: 200, 手法: "全换", 惯用手: "R", 滚奏: "24分滚奏" });
  assert.strictEqual(slow.hands.join(""), "RLRLRLRLRLR");
  assert.strictEqual(pairSig(slow), "");
  // 炒菜每个三连仍正手起：(RR)l r (RR)l r (RR)l。
  const chao = sticking.autoSticking(notes, { bpm: 200, 手法: "炒菜", 惯用手: "R", 滚奏: "自动滚奏" });
  assert.strictEqual(chao.hands.join(""), "RRLRRRLRRRL", "炒菜 " + chao.hands.join(""));
  assert.strictEqual(pairSig(chao), "0-1,4-5,8-9");
});

// 一颗 8 分咚后面接 16 分串。BPM 300 时半拍仍算连着打，串从逆手起。
function leadThen16(pat) {
  const notes = [{ beat: 0, colour: "don", big: false }];
  pat.split("").forEach(function (c, i) {
    notes.push({
      beat: +(0.5 + i * 0.25).toFixed(6),
      colour: c === "d" ? "don" : "ka",
      big: false,
    });
  });
  return notes;
}

function assertLead(name, pat, hands, pairs, opts) {
  const out = sticking.autoSticking(leadThen16(pat), Object.assign({
    bpm: 300, 手法: "全换", 惯用手: "R", 滚奏: "自动滚奏",
  }, opts || {}));
  assert.strictEqual(out.hands.join(""), hands, name + " hands " + out.hands.join("") + " / " + pairSig(out));
  assert.strictEqual(pairSig(out), pairs, name + " pairs " + pairSig(out));
  return out;
}

extra("short oxxxo is ox xx o; only runs of 8 or more may shift", function () {
  // 5 音 oxxxo。旧逻辑挪成 o xx xo（RLRRLL / 2-3,4-5）。短于 8 音从第一颗 2-2。
  const out = assertLead("oxxxo bpm300", "dkkkd", "RLLRRL", "1-2,3-4");
  assert.deepStrictEqual(out.warnings, [[1, 5, "逆手起"]]);
  assertStick("oxxxo on the downbeat", "dkkkd", 0.25, "RRLLR", "0-1,2-3", { bpm: 300 });
  // 7 音仍不挪。同一色型到第 8 音才允许挪位，用来减少逆手外刷。
  assertLead("7 does not shift", "dkkkddd", "RLLRRLLR", "1-2,3-4,5-6");
  const shifted = assertLead("8 may shift", "dkkkdddd", "RLRRLLRRL", "2-3,4-5,6-7");
  assert.deepStrictEqual(shifted.warnings, [[1, 8, "逆手起"]]);
  // 8 音同色没有逆手外刷，保持从第一颗 2-2。
  assertLead("8 same colour stays", "dddddddd", "RLLRRLLRR", "1-2,3-4,5-6,7-8");
});

extra("16th triplets stay 2-1 and 24th quads stay 1-2-1 ahead of 2-2", function () {
  // 6 音三连短于 8，仍是 2-1，不改成从第一颗 2-2。
  assertLead("xoo stays 2-1", "kddkdd", "RLLRLLR", "1-2,4-5");
  // 第一对是逆手外刷：先按三连 2-1，再拆掉这一对。不是整串改回 2-2。
  assertLead("oxx 2-1 breaks the off-hand outer brush", "dkkdkk", "RLRLRRL", "4-5");
  assertStick("quad stays 1-2-1", "dddd", 1 / 6, "RLLR", "1-2", { bpm: 300 });
  assertStick("quad outer brush still breaks", "kdkd", 1 / 6, "RLRL", "", { bpm: 300 });
  // 24 分的 xoo 不是 16 分三连。长于 8 音时自动滚奏仍用原来的 1-2。
  assertStick("24 xoo stays 1-2", "kddkddkdd", 1 / 6, "RLLRLLRLL", "1-2,4-5,7-8");
});

extra("全2-2 rolls 16 24 32 from the first note after the absolute cuts", function () {
  const mode = { 滚奏: "全2-2" };
  assert.strictEqual(parser.normRoll("全2-2"), "全2-2");
  assert.strictEqual(parser.normRoll("全 2-2"), "全2-2");
  assert.strictEqual(parser.normRoll("24 分滚奏"), "24分滚奏");

  assertLead("oxxxo", "dkkkd", "RLLRRL", "1-2,3-4", mode);
  assertLead("spaced alias", "dkkkd", "RLLRRL", "1-2,3-4", { 滚奏: "全 2-2" });
  // 同一条 8 音，自动滚奏为了躲开逆手外刷会挪位；全 2-2 不挪。
  assertLead("8 stays 2-2", "dkkkdddd", "RLLRRLLRR", "1-2,3-4,5-6,7-8", mode);
  assertLead("auto 8 still shifts", "dkkkdddd", "RLRRLLRRL", "2-3,4-5,6-7");

  assertLead("triplet still 2-1", "kddkdd", "RLLRLLR", "1-2,4-5", mode);
  assertLead("triplet still breaks", "dkkdkk", "RLRLRRL", "4-5", mode);
  assertStick("quad still 1-2-1", "dddd", 1 / 6, "RLLR", "1-2", mode);
  assertStick("quad still breaks", "kdkd", 1 / 6, "RLRL", "", mode);

  // 不属于绝对规则的 24 分不再改成三连 2-1 或 1-2。24 分滚奏本身不变。
  assertStick("24 six is 2-2", "dddddd", 1 / 6, "RRLLRR", "0-1,2-3,4-5", mode);
  assertStick("24 five is 2-2", "ddddd", 1 / 6, "RRLLR", "0-1,2-3", mode);
  assertStick("24 xoo is 2-2", "kddkddkdd", 1 / 6, "RRLLRRLLR", "0-1,2-3,4-5,6-7", mode);
  assertStick("24 mode six unchanged", "dddddd", 1 / 6, "RRLRRL", "0-1,3-4", { 滚奏: "24分滚奏" });

  assertStick("16 is 2-2", "dddddddd", 0.25, "RRLLRRLL", "0-1,2-3,4-5,6-7", mode);
  assertStick("32 is 2-2", "dddddddd", 0.125, "RRLLRRLL", "0-1,2-3,4-5,6-7", mode);
  assertStick("12 stays 1-2", "kddkdd", 1 / 3, "RLLRLL", "1-2,4-5", mode);
  // 两音逆手外刷：自动滚奏拆成单打。全 2-2 不改切法，仍是从第一颗起的一对。
  const two = [
    { beat: 0, colour: "ka", big: false },
    { beat: 0.75, colour: "don", big: false },
    { beat: 1, colour: "ka", big: false },
  ];
  const kept = sticking.autoSticking(two, { bpm: 250, 手法: "全换", 惯用手: "R", 滚奏: "全2-2" });
  assert.strictEqual(kept.hands.join(""), "RLL");
  assert.strictEqual(pairSig(kept), "1-2");

  const around = notesByGaps("ddkkkkd", [0.25, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 0.25]);
  assertRoll("quad inside 16s", around, "RRLRRLR", "0-1,3-4", Object.assign({ bpm: 250 }, mode));
});

console.log("sticking: " + passed + "/" + cases.length + " cases + extras, failed " + failed.length);
if (failed.length) process.exit(1);
console.log("sticking: all passed (" + passed + ")");
