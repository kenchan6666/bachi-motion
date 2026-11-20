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

function tja(body, headerBpm) {
  return "TITLE:test\nBPM:" + (headerBpm == null ? "120" : headerBpm) + "\n#START\n" + body + "\n#END\n";
}

function parse(body, headerBpm) {
  return parser.eventsFromTja(tja(body, headerBpm));
}

function check(name, fn) {
  fn();
  passed += 1;
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
  nearly(info.kept[0].quarterBeats, 16);
});

check("短暂低速被过滤：mid-measure 40 只有两拍，其余是 160", function () {
  // 4/4: two full measures at 160, then "11" at 160 + #BPMCHANGE 40 + "11,"
  // (two quarter beats at 40) then back to 160 for two measures.
  const data = parse(
    "1111,\n1111,\n11\n#BPMCHANGE 40\n11,\n#BPMCHANGE 160\n1111,\n1111,",
    160
  );
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  assert.ok(info.dropped.length >= 1, "expected the short 40 segment to be dropped");
  assert.ok(info.dropped.some(function (s) { return Math.abs(s.bpm - 40) < 0.05; }),
    "dropped should include BPM 40");
  assert.ok(info.kept.every(function (s) { return Math.abs(s.bpm - 160) < 0.05; }));
  assert.strictEqual(info.text, "BPM 160");
  const slow = info.dropped.find(function (s) { return Math.abs(s.bpm - 40) < 0.05; });
  nearly(slow.quarterBeats, 2);
});

check("100 和 300 来回变，每段都够 4 拍 → BPM 100–300", function () {
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
  // Each segment is 1 beat, so everything is dropped.
  // Wall-clock per beat is 60/bpm, so 90 has the longest total duration.
  const cycle = "1\n#BPMCHANGE 180\n1\n#BPMCHANGE 240\n1\n#BPMCHANGE 300\n1,";
  let body = "#BPMCHANGE 90\n";
  for (let i = 0; i < 8; i++) {
    body += cycle + "\n";
    if (i < 7) body += "#BPMCHANGE 90\n";
  }
  const data = parse(body, 90);
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  assert.ok(info.kept.length === 0, "every piece should be shorter than 4 beats");
  assert.ok(info.fallback, "should fall back to longest total duration");
  assert.strictEqual(info.text, "BPM 90");
  const longest = bpm.longestTotalBpm(info.segments);
  nearly(longest, 90);
});

check("同一个 BPM 被拆成好几段：中间短 200 被过滤 → 只显示 160", function () {
  // 160 for 2 measures (8 beats), 200 for two mid-measure beats, 160 for 2 measures.
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

check("#MEASURE 不再参与过滤：两个 1/4 小节只有 2 拍，120 被丢掉", function () {
  // Two 1/4 measures at 120 = 2 quarter-note beats (would have been 2
  // measure-units under the old rule, and kept). The following 4/4 bar
  // at 60 is 4 beats and stays. Display is a single 60.
  const data = parse(
    "#MEASURE 1/4\n#BPMCHANGE 120\n1,\n1,\n#BPMCHANGE 60\n#MEASURE 4/4\n1111,",
    120
  );
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  const seg120 = info.segments.find(function (s) { return Math.abs(s.bpm - 120) < 0.05; });
  assert.ok(seg120, "expected a 120 segment");
  nearly(seg120.quarterBeats, 2);
  assert.ok(info.dropped.some(function (s) { return Math.abs(s.bpm - 120) < 0.05; }));
  assert.ok(info.kept.some(function (s) { return Math.abs(s.bpm - 60) < 0.05; }));
  assert.ok(!info.kept.some(function (s) { return Math.abs(s.bpm - 120) < 0.05; }));
  assert.strictEqual(info.text, "BPM 60");
});

check("#MEASURE 1/64 + 极低 BPM 的短段被过滤", function () {
  // IR-style gimmick: a 1/64 bar at BPM 5 lasts 0.75s but is only
  // 0.0625 quarter-note beats, so it must not enter the range.
  const data = parse(
    "1111,\n#MEASURE 1/64\n#BPMCHANGE 5\n1,\n#MEASURE 4/4\n#BPMCHANGE 120\n1111,",
    120
  );
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  const slow = info.dropped.find(function (s) { return Math.abs(s.bpm - 5) < 0.05; });
  assert.ok(slow, "BPM 5 should be dropped, dropped=" +
    JSON.stringify(info.dropped.map(function (s) { return { bpm: s.bpm, beats: s.quarterBeats }; })));
  nearly(slow.quarterBeats, 0.0625);
  assert.ok(info.kept.every(function (s) { return Math.abs(s.bpm - 120) < 0.05; }));
  assert.strictEqual(info.text, "BPM 120");
});

check("#MEASURE 1/4 的一拍段被过滤", function () {
  const data = parse(
    "1111,\n#MEASURE 1/4\n#BPMCHANGE 200\n1,\n#MEASURE 4/4\n#BPMCHANGE 160\n1111,",
    160
  );
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  const short = info.dropped.find(function (s) { return Math.abs(s.bpm - 200) < 0.05; });
  assert.ok(short, "BPM 200 (one 1/4 bar) should be dropped");
  nearly(short.quarterBeats, 1);
  assert.ok(info.kept.every(function (s) { return Math.abs(s.bpm - 160) < 0.05; }));
  assert.strictEqual(info.text, "BPM 160");
});

check("恰好 4 拍的段要保留（阈值是 ≥ 4，不是 > 4）", function () {
  const data = parse("1111,", 120);
  const info = bpm.displayBpmFromPieces(data.bpmTimeline);
  nearly(info.segments[0].quarterBeats, 4);
  assert.strictEqual(info.kept.length, 1);
  assert.strictEqual(info.text, "BPM 120");

  // Same boundary as raw pieces, not framed as "one 4/4 measure".
  const pieces = [{ t: 0, duration: 1.5, bpm: 160, beats: 2 }];
  const fromPieces = bpm.displayBpmFromPieces(pieces);
  nearly(fromPieces.kept[0].quarterBeats, 4);
  assert.strictEqual(fromPieces.text, "BPM 160");
});

check("相邻且 BPM 相同的 #BPMCHANGE 会合并成一段", function () {
  const data = parse("#BPMCHANGE 180\n1111,\n#BPMCHANGE 180\n1111,", 180);
  const segs = bpm.mergeBpmSegments(data.bpmTimeline);
  assert.strictEqual(segs.length, 1);
  nearly(segs[0].quarterBeats, 8);
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
  // 4/4 @160: 2 measures (8 beats / 3s), 2 beats @40 (3s wall), 2 measures @160.
  const pieces = [
    { t: 0, duration: 3, bpm: 160, beats: 4 },
    { t: 3, duration: 3, bpm: 40, beats: 4 },
    { t: 6, duration: 3, bpm: 160, beats: 4 },
  ];
  const info = bpm.displayBpmFromPieces(pieces);
  assert.strictEqual(info.text, "BPM 160");
  nearly(info.dropped[0].quarterBeats, 2);
});

console.log("titlebar-bpm: " + passed + " passed");
