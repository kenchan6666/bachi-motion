/**
 * Section loop + slow-motion playback.
 * Dragging the caps does not rewrite the chart. The media window those caps
 * select is covered in tests/section-trim.test.js.
 * Charts here are homemade snippets — no official charts.
 *
 *   node tests/loop-range.test.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const parser = require(path.join(__dirname, "..", "js", "parser.js"));
const LoopRange = require(path.join(__dirname, "..", "js", "loop-range.js"));

const INDEX = path.join(__dirname, "..", "index.html");

let passed = 0;

function tja(body, headerBpm) {
  return "TITLE:loop-test\nBPM:" + (headerBpm == null ? "120" : headerBpm) + "\nOFFSET:0\n#START\n" + body + "\n#END\n";
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

/** Playback window the engine already uses: lead-in before the chart, tail after it. */
function songWindow(data) {
  return { start: data.rangeStart - 0.7, end: data.rangeEnd + 0.5 };
}

function gridFor(data) {
  const song = songWindow(data);
  return LoopRange.buildSnapGrid(data, song.start, song.end);
}

// Four 4/4 measures at 120 BPM. Bar lines at 0, 2, 4, 6, 8. Beats every 0.5s.
const FOUR = "1111,\n1111,\n1111,\n1111,";

check("default loop range is the whole song", function () {
  const data = parse(FOUR, 120);
  const song = songWindow(data);
  const range = LoopRange.defaultLoopRange(song.start, song.end);
  nearly(range.start, song.start);
  nearly(range.end, song.end);
  assert.ok(range.start < data.rangeStart, "default includes the lead-in, not a cropped section");
  assert.ok(range.end > data.rangeEnd, "default includes the tail");
  assert.ok(range.start <= data.measures[0].t);
  const last = data.measures[data.measures.length - 1];
  assert.ok(range.end >= last.t + last.duration);
});

check("dragging a handle inward sets a section and leaves the other end", function () {
  const data = parse(FOUR, 120);
  const song = songWindow(data);
  const grid = gridFor(data);
  const full = LoopRange.defaultLoopRange(song.start, song.end);
  const inward = LoopRange.dragLoopHandle(full, "start", 2.1, grid);
  nearly(inward.start, 2);
  nearly(inward.end, song.end);
  assert.ok(inward.start > song.start);
  const both = LoopRange.dragLoopHandle(inward, "end", 5.9, grid);
  nearly(both.start, 2);
  nearly(both.end, 6);
  assert.ok(both.end < song.end);
  assert.ok(both.start < both.end);
});

check("snap prefers a nearby measure over a closer beat, else the beat", function () {
  const data = parse(FOUR, 120);
  const grid = gridFor(data);
  // 1.70 is 0.20 from beat 1.5 and 0.30 from the bar line at 2.
  nearly(LoopRange.snapLoopTime(1.7, grid), 2);
  // 1.55 is 0.05 from beat 1.5 and 0.45 from the bar line — outside the measure magnet.
  nearly(LoopRange.snapLoopTime(1.55, grid), 1.5);
  // Far from any bar line: land on the beat.
  nearly(LoopRange.snapLoopTime(0.55, grid), 0.5);
});

check("snap still prefers measures when BPM changes inside a bar", function () {
  // 4/4 @120, two quarters, then #BPMCHANGE 60, two quarters. Bar is 0..3.
  const data = parse("11\n#BPMCHANGE 60\n11,", 120);
  const grid = gridFor(data);
  nearly(data.measures[0].duration, 3);
  // 2.70 is 0.70 from beat 2 and 0.30 from the bar line at 3. Beat is closer; measure wins.
  nearly(LoopRange.snapLoopTime(2.7, grid), 3);
  nearly(LoopRange.snapLoopTime(2.2, grid), 2);
});

check("when loop is on, playback and restart stay inside the range", function () {
  const songStart = -0.7;
  const songEnd = 8.5;
  const loopStart = 1;
  const loopEnd = 2;
  let now = 1.85;
  let wrapped = false;
  for (let i = 0; i < 10; i++) {
    const step = LoopRange.advancePlayback(now, 0.1, {
      rate: 1,
      loop: true,
      loopStart: loopStart,
      loopEnd: loopEnd,
      songStart: songStart,
      songEnd: songEnd,
    });
    assert.strictEqual(step.playing, true);
    assert.strictEqual(step.done, false);
    assert.ok(step.now >= loopStart - 1e-9 && step.now <= loopEnd + 1e-9, "left the range: " + step.now);
    if (step.now < now) wrapped = true;
    now = step.now;
  }
  assert.ok(wrapped, "playback should return to the range start after the end handle");
  nearly(LoopRange.restartTime({
    loop: true, songStart: songStart, loopStart: loopStart,
  }), loopStart);
  // A range that already begins at the song start still restarts there.
  nearly(LoopRange.restartTime({
    loop: true, songStart: songStart, loopStart: songStart,
  }), songStart);
  // Loop off keeps the old full-song clock: it may leave the section, and restart uses the song start.
  const free = LoopRange.advancePlayback(1.85, 0.3, {
    rate: 1, loop: false, loopStart: loopStart, loopEnd: loopEnd, songStart: songStart, songEnd: songEnd,
  });
  nearly(free.now, 2.15);
  assert.strictEqual(free.playing, true);
  nearly(LoopRange.restartTime({
    loop: false, songStart: songStart, loopStart: loopStart,
  }), songStart);
});

check("slow-motion rates still advance the clock, including inside a loop", function () {
  const full = LoopRange.advancePlayback(0, 1, {
    rate: 0.25, loop: false, loopStart: 0, loopEnd: 8, songStart: 0, songEnd: 8,
  });
  nearly(full.now, 0.25);
  const looped = LoopRange.advancePlayback(1.9, 0.8, {
    rate: 0.25, loop: true, loopStart: 1, loopEnd: 2, songStart: 0, songEnd: 8,
  });
  nearly(looped.now, 1.1);
  assert.strictEqual(looped.playing, true);
});

check("speed buttons stay 0.25× / 0.5× / 0.75× / 1× and default to 1×", function () {
  assert.strictEqual(LoopRange.defaultPlaybackRate(), 1);
  assert.deepStrictEqual(LoopRange.speedRates(), [0.25, 0.5, 0.75, 1]);
  assert.strictEqual(LoopRange.rateFromSpeedButton("0.25", 1), 0.25);
  assert.strictEqual(LoopRange.rateFromSpeedButton("0.5", 1), 0.5);
  assert.strictEqual(LoopRange.rateFromSpeedButton("0.75", 1), 0.75);
  assert.strictEqual(LoopRange.rateFromSpeedButton("1", 1), 1);
  assert.strictEqual(LoopRange.rateFromSpeedButton("2", 1), 1, "no extra rate");
  const html = fs.readFileSync(INDEX, "utf8");
  const ratesBlock = html.split('class="rates"')[1].split('class="scroll-row"')[0];
  const rates = Array.from(ratesBlock.matchAll(/data-rate="([^"]+)"/g)).map((m) => m[1]);
  assert.deepStrictEqual(rates, ["0.25", "0.5", "0.75", "1"]);
  assert.ok(!/type="range"/.test(ratesBlock), "speed stays a button row");
  assert.ok(/class="chip on"[^>]*data-rate="1"|data-rate="1"[^>]*class="chip on"/.test(ratesBlock));
  assert.ok(ratesBlock.includes("0.25×") && ratesBlock.includes("1×"));
});

check("loop handles live on the progress bar, not the scrolling chart", function () {
  const html = fs.readFileSync(INDEX, "utf8");
  const transport = html.split('class="transport"')[1].split('class="legend"')[0];
  assert.ok(transport.includes('id="scrubBar"'), "raised progress bar");
  assert.ok(transport.includes('id="scrub"'), "existing scrub stays");
  assert.ok(transport.includes('id="loopCapStart"') && transport.includes('id="loopCapEnd"'));
  assert.ok(transport.includes('id="loopSpan"') && transport.includes('id="scrubTicks"'));
  assert.ok(transport.includes("循环起点") && transport.includes("循环终点"));
  const chart = html.split('id="chart"')[1].split('id="dynamic"')[0];
  assert.ok(!chart.includes("loopCap") && !chart.includes("loopSpan"));
  const editor = html.includes('id="editorMeasures"')
    ? html.split('id="editorMeasures"')[1].slice(0, 400)
    : "";
  assert.ok(!editor.includes("loopCap"));
  assert.ok(html.includes("--wood-pale"));
  assert.ok(/\.loop-cap[\s\S]*var\(--ink\)/.test(html));
  assert.ok(!/loop-cap[\s\S]{0,240}#ffd60a|#ffe14a|yellow/i.test(html));
});

check("a loop range does not trim the chart or the file window", function () {
  const data = parse(FOUR, 120);
  const before = JSON.stringify({
    events: data.events.map((e) => [e.t, e.measure, e.src]),
    measures: data.measures.map((m) => [m.index, m.t, m.duration, m.beats]),
    rangeStart: data.rangeStart,
    rangeEnd: data.rangeEnd,
  });
  const song = songWindow(data);
  const grid = gridFor(data);
  const dragged = LoopRange.dragLoopHandle(
    LoopRange.defaultLoopRange(song.start, song.end),
    "start",
    2.1,
    grid
  );
  const after = JSON.stringify({
    events: data.events.map((e) => [e.t, e.measure, e.src]),
    measures: data.measures.map((m) => [m.index, m.t, m.duration, m.beats]),
    rangeStart: data.rangeStart,
    rangeEnd: data.rangeEnd,
  });
  assert.strictEqual(after, before);
  assert.ok(dragged.start > data.rangeStart, "the section moved");
  assert.notStrictEqual(dragged.start, data.rangeStart);
  assert.strictEqual(data.rangeEnd, 8);
  assert.ok(dragged.end === song.end || dragged.end < data.rangeEnd || dragged.end > data.rangeStart);
  assert.strictEqual(LoopRange.trimsFiles, false);
});

console.log(passed + " loop-range tests passed.");
