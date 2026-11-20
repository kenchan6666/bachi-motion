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

console.log("sticking: " + passed + "/" + cases.length + " passed");
if (failed.length) process.exit(1);
