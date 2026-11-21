/**
 * Zoom-card positions follow note time, so an 8th gap is wider than a 16th gap.
 *   node tests/zoom-layout.test.js
 */
"use strict";

const assert = require("assert");
const path = require("path");
const editor = require(path.join(__dirname, "..", "js", "editor.js"));

const pad = 18;
const noteW = 42;
const gutter = 12;
const step = noteW + gutter;

function layout(times) {
  return editor.zoomNoteLayout(times, { pad: pad, noteW: noteW, gutter: gutter });
}

function gaps(centers) {
  const out = [];
  for (let i = 1; i < centers.length; i++) out.push(centers[i] - centers[i - 1]);
  return out;
}

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  ✓ " + name);
  } catch (err) {
    console.log("  ✗ " + name);
    console.log(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

check("equal 16ths keep the old center spacing", function () {
  const got = layout([0, 0.25, 0.5, 0.75]);
  assert.deepStrictEqual(gaps(got.centers).map((g) => +g.toFixed(6)), [step, step, step]);
  assert.strictEqual(got.centers[0], pad + noteW / 2);
  assert.strictEqual(got.innerW, pad * 2 + 4 * noteW + 3 * gutter);
});

check("an 8th gap is twice a 16th gap", function () {
  const got = layout([0, 0.25, 0.75, 1.0]);
  const g = gaps(got.centers);
  assert.ok(Math.abs(g[0] - step) < 1e-6, "16th " + g[0]);
  assert.ok(Math.abs(g[1] - step * 2) < 1e-6, "8th " + g[1]);
  assert.ok(Math.abs(g[2] - step) < 1e-6, "16th again " + g[2]);
  assert.ok(g[1] > g[0] + noteW / 2, "8th and 16th are visually distinct");
});

check("a single 16th rest opens a gap inside the string", function () {
  const got = layout([0, 0.25, 0.5, 1.0, 1.25]);
  const g = gaps(got.centers);
  assert.ok(Math.abs(g[2] / g[0] - 2) < 1e-6, "rest " + g.join(","));
});

check("missing times fall back to equal slots", function () {
  const got = layout([0, null, 0.5]);
  assert.deepStrictEqual(gaps(got.centers), [step, step]);
});

console.log(process.exitCode ? "zoom-layout tests failed" : "zoom-layout tests: " + passed + " passed");
