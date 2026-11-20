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

console.log("sticking: " + passed + "/" + cases.length + " cases + extras, failed " + failed.length);
if (failed.length) process.exit(1);
console.log("sticking: all passed (" + passed + ")");
