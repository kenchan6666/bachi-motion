/**
 * Unit tests for the title-bar BPM range rule.
 * All charts here are homemade snippets — no official charts.
 *
 *   node tests/titlebar-bpm.test.js
 */
"use strict";

const path = require("path");
const assert = require("assert");
const parser = require(path.join(__dirname, "..", "js", "parser.js"));
const bpm = require(path.join(__dirname, "..", "js", "titlebar-bpm.js"));

let passed = 0;
const names = [];

function tja(body, headerBpm) {
  return "TITLE:test\nBPM:" + (headerBpm == null ? "120" : headerBpm) + "\n#START\n" + body + "\n#END\n";
}

function parse(body, headerBpm) {
  return parser.eventsFromTja(tja(body, headerBpm));
}

function check(name, fn) {
  fn();
  passed += 1;
  names.push(name);
  console.log("  ✓ " + name);
}

function nearly(a, b, eps) {
  assert.ok(Math.abs(a - b) <= (eps == null ? 1e-6 : eps), "expected " + a + " ≈ " + b);
}

// ---------------------------------------------------------------------------
check("fmtBpmNum rounds 180.05 → 180 and keeps one decimal otherwise", function () {
  assert.strictEqual(bpm.fmtBpmNum(180), "180");
  assert.strictEqual(bpm.fmtBpmNum(180.05), "180");
  assert.strictEqual(bpm.fmtBpmNum(180.2), "180.2");
  assert.strictEqual(bpm.fmtBpmNum(87.5), "87.5");
});

check("no timeline falls back to data.bpm as a single number", function () {
  assert.strictEqual(bpm.formatDisplayBpm({ bpm: 160 }), "BPM 160");
  assert.strictEqual(bpm.formatDisplayBpm(null), "");
  assert.strictEqual(bpm.formatDisplayBpm({}), "");
});

check("constant BPM over several measures → single number", function () {
  const data = parse("1111,\n1111,\n1111,\n1111,", 160);
  assert.strictEqual(bpm.formatDisplayBpm(data), "BPM 160");
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  assert.strictEqual(info.kept.length, 1);
  nearly(info.kept[0].measureUnits, 4);
});

check("短暂低速被过滤：mid-measure 40 for two beats, rest is 160", function () {
  // 4/4: two full measures at 160, then "11" at 160 + #BPMCHANGE 40 + "11,"
  // (two beats at 40 = 0.5 measures) then back to 160 for two measures.
  const data = parse(
    "1111,\n1111,\n11\n#BPMCHANGE 40\n11,\n#BPMCHANGE 160\n1111,\n1111,",
    160
  );
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  assert.ok(info.dropped.length >= 1, "expected the short 40 segment to be dropped");
  assert.ok(info.dropped.some(function (s) { return Math.abs(s.bpm - 40) < 0.05; }),
    "dropped should include BPM 40, got " + JSON.stringify(info.dropped.map(function (s) { return s; })));
  assert.ok(info.kept.every(function (s) { return Math.abs(s.bpm - 160) < 0.05; }));
  assert.strictEqual(info.text, "BPM 160");
  assert.strictEqual(bpm.formatDisplayBpm(data), "BPM 160");
  // two beats at 40 in 4/4: measureUnits = 0.5
  const slow = info.dropped.find(function (s) { return Math.abs(s.bpm - 40) < 0.05; });
  nearly(slow.measureUnits, 0.5);
});

check("100 和 300 来回变，每段都够一小节 → BPM 100–300", function () {
  const body = [
    "#BPMCHANGE 100", "1111,", "1111,", "1111,", "1111,",
    "#BPMCHANGE 300", "1111,", "1111,", "1111,", "1111,",
    "#BPMCHANGE 100", "1111,", "1111,", "1111,", "1111,",
    "#BPMCHANGE 300", "1111,", "1111,", "1111,", "1111,",
  ].join("\n");
  const data = parse(body, 100);
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  assert.strictEqual(info.kept.length, 4);
  assert.strictEqual(info.dropped.length, 0);
  assert.strictEqual(info.text, "BPM 100–300");
  assert.strictEqual(bpm.formatDisplayBpm(data), "BPM 100–300");
});

check("全是乱变全被过滤：每拍换 BPM，回退到总时长最长的 BPM", function () {
  // 4/4, one #BPMCHANGE per quarter: 90, 180, 240, 300, repeated 8 measures.
  // Each segment is 1 beat = 0.25 measures, so everything is dropped.
  // Wall-clock per beat is 60/bpm, so 90 has the longest total duration.
  const cycle = "1\n#BPMCHANGE 180\n1\n#BPMCHANGE 240\n1\n#BPMCHANGE 300\n1,";
  let body = "#BPMCHANGE 90\n";
  for (let i = 0; i < 8; i++) {
    body += cycle + "\n";
    if (i < 7) body += "#BPMCHANGE 90\n";
  }
  const data = parse(body, 90);
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  assert.ok(info.kept.length === 0, "every piece should be shorter than one measure");
  assert.ok(info.fallback, "should fall back to longest total duration");
  assert.strictEqual(info.text, "BPM 90");
  assert.strictEqual(bpm.formatDisplayBpm(data), "BPM 90");
  // Sanity: 90 really is the longest bucket.
  const longest = bpm.longestTotalBpm(info.segments);
  nearly(longest, 90);
});

check("同一个 BPM 被拆成好几段：中间短 200 被过滤 → 只显示 160", function () {
  // 160 for 2 measures, 200 for two mid-measure beats, 160 for 2 measures.
  const data = parse(
    "1111,\n1111,\n11\n#BPMCHANGE 200\n11,\n#BPMCHANGE 160\n1111,\n1111,",
    160
  );
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  assert.ok(info.dropped.some(function (s) { return Math.abs(s.bpm - 200) < 0.05; }));
  assert.strictEqual(info.kept.length, 2);
  assert.ok(info.kept.every(function (s) { return Math.abs(s.bpm - 160) < 0.05; }));
  assert.strictEqual(info.text, "BPM 160");
});

check("同一个 BPM 被拆成好几段：两端 160 与中间 200 都够长 → BPM 160–200", function () {
  const data = parse(
    "1111,\n1111,\n#BPMCHANGE 200\n1111,\n1111,\n#BPMCHANGE 160\n1111,\n1111,",
    160
  );
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  assert.strictEqual(info.dropped.length, 0);
  assert.strictEqual(info.kept.length, 3);
  assert.strictEqual(info.text, "BPM 160–200");
});

check("段内拍号从 1/4 换成 4/4：按各自拍号折算小节数，短 120 段仍保留", function () {
  // Two 1/4 measures at 120 (= 2 measure-units, but only 1.0s wall-clock).
  // A naïve "always use 4/4" threshold would be 2s and would drop this
  // segment, leaving only 60. Piecewise units keep both → BPM 60–120.
  const data = parse(
    "#MEASURE 1/4\n#BPMCHANGE 120\n1,\n1,\n#BPMCHANGE 60\n#MEASURE 4/4\n1111,",
    120
  );
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  const seg120 = info.segments.find(function (s) { return Math.abs(s.bpm - 120) < 0.05; });
  assert.ok(seg120, "expected a 120 segment");
  nearly(seg120.measureUnits, 2);
  nearly(seg120.duration, 1.0);
  assert.ok(info.kept.some(function (s) { return Math.abs(s.bpm - 120) < 0.05; }),
    "120 should be kept by piecewise measure-units, dropped=" +
    JSON.stringify(info.dropped.map(function (s) { return { bpm: s.bpm, units: s.measureUnits, dur: s.duration }; })));
  assert.ok(info.kept.some(function (s) { return Math.abs(s.bpm - 60) < 0.05; }));
  assert.strictEqual(info.text, "BPM 60–120");
});

check("刚好满一小节的段要保留（阈值是 ≥ 1，不是 > 1）", function () {
  const data = parse("1111,", 120);
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  nearly(info.segments[0].measureUnits, 1);
  assert.strictEqual(info.kept.length, 1);
  assert.strictEqual(info.text, "BPM 120");
});

check("相邻且 BPM 相同的 #BPMCHANGE 会合并成一段", function () {
  const data = parse("#BPMCHANGE 180\n1111,\n#BPMCHANGE 180\n1111,", 180);
  const segs = bpm.mergeBpmSegments(data.bpmTimeline);
  assert.strictEqual(segs.length, 1);
  nearly(segs[0].measureUnits, 2);
  assert.strictEqual(bpm.formatDisplayBpm(data), "BPM 180");
});

check("--measures 裁切后时间线跟着裁，标题 BPM 只看选中的段", function () {
  // measures 1-2 at 100, 3-4 at 200, 5-6 at 100. Crop 3-4 → only 200.
  const body = [
    "#BPMCHANGE 100", "1111,", "1111,",
    "#BPMCHANGE 200", "1111,", "1111,",
    "#BPMCHANGE 100", "1111,", "1111,",
  ].join("\n");
  const full = parser.eventsFromTja(tja(body, 100));
  assert.strictEqual(bpm.formatDisplayBpm(full), "BPM 100–200");
  const mid = parser.eventsFromTja(tja(body, 100), { measures: "3-4" });
  assert.strictEqual(bpm.formatDisplayBpm(mid), "BPM 200");
  nearly(mid.bpmTimeline[0].t, 0);
});

check("纯函数：手写 pieces 与 TJA 解析结果一致（短暂低速）", function () {
  // 4/4 @160: 2 measures (3s), 2 beats @40 (3s wall / 0.5 measures), 2 measures @160 (3s).
  const pieces = [
    { t: 0, duration: 3, bpm: 160, beats: 4 },
    { t: 3, duration: 3, bpm: 40, beats: 4 },
    { t: 6, duration: 3, bpm: 160, beats: 4 },
  ];
  // wait: 2 measures at 160 is 2 * 4 * 60/160 = 3s yes.
  // 2 beats at 40 is 2 * 60/40 = 3s, units = 2/4 = 0.5 yes.
  const info = bpm.displayBpmFromPieces(pieces);
  assert.strictEqual(info.text, "BPM 160");
  nearly(info.dropped[0].measureUnits, 0.5);
});

console.log("titlebar-bpm: " + passed + " passed");
