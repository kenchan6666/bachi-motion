/**
 * 编辑器音量栏：音乐（已加载的原曲）和鼓点（当前谱面的咚/咔）分开乘。
 * 100 是原来的音量，和 TJA 的 SONGVOL / SEVOL 一样。
 * 拉高鼓点只乘鼓点，不改原曲采样，也不做整段峰值归一化。重叠处线性相加。
 * 规则对齐 suyue tools/taiko_volume.py 的 mix_buffers。这一栏不再选文件。
 *
 *   node tests/taiko-volume.test.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const vol = require(path.join(__dirname, "..", "js", "taiko-volume.js"));

const SR = 8000;
let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log("  ✓ " + name);
}

function almost(actual, expected, eps) {
  const limit = eps == null ? 1e-9 : eps;
  assert.ok(
    Math.abs(actual - expected) <= limit,
    "expected " + actual + " ≈ " + expected + " (Δ " + (actual - expected) + ")"
  );
}

function assertClose(actual, expected, eps) {
  assert.strictEqual(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) almost(actual[i], expected[i], eps);
}

function splitTone() {
  const music = new Float64Array(SR);
  const drums = new Float64Array(SR);
  for (let i = 0; i < SR / 2; i++) {
    const t = i / SR;
    music[i] = 0.25 * Math.sin(2 * Math.PI * 440 * t);
  }
  for (let i = 0; i < 400; i++) {
    const t = i / SR;
    drums[5000 + i] = 0.3 * Math.sin(2 * Math.PI * 180 * t);
  }
  return { music: music, drums: drums };
}

function channel(buffer, index) {
  const out = new Float64Array(buffer.frames);
  for (let i = 0; i < buffer.frames; i++) out[i] = buffer.data[i * buffer.channels + index];
  return out;
}

check("100 percent is unity gain", () => {
  assert.strictEqual(vol.volumePercentToGain(100), 1);
  assert.strictEqual(vol.volumePercentToGain(0), 0);
  almost(vol.volumePercentToGain(160), 1.6);
});

check("negative or non-finite volume is rejected", () => {
  assert.throws(() => vol.volumePercentToGain(-1), /音量/);
  assert.throws(() => vol.volumePercentToGain(Number.NaN), /音量/);
});

check("raising drums does not change music samples", () => {
  const tone = splitTone();
  const quiet = vol.mixBuffers(tone.music, tone.drums, { musicVolume: 100, drumVolume: 100 });
  const loud = vol.mixBuffers(tone.music, tone.drums, { musicVolume: 100, drumVolume: 250 });
  assert.strictEqual(quiet.frames, SR);
  assert.strictEqual(quiet.channels, 1);
  assert.strictEqual(loud.frames, SR);
  const quietHead = channel(quiet, 0).subarray(0, SR / 2);
  const loudHead = channel(loud, 0).subarray(0, SR / 2);
  assertClose(loudHead, quietHead);
  assertClose(loudHead, tone.music.subarray(0, SR / 2));
  const quietHit = channel(quiet, 0).subarray(5000, 5400);
  const loudHit = channel(loud, 0).subarray(5000, 5400);
  assertClose(loudHit, Float64Array.from(quietHit, (x) => x * 2.5));
  assertClose(quietHit, tone.drums.subarray(5000, 5400));
});

check("music volume does not scale drums", () => {
  const tone = splitTone();
  const full = vol.mixBuffers(tone.music, tone.drums, { musicVolume: 100, drumVolume: 100 });
  const softer = vol.mixBuffers(tone.music, tone.drums, { musicVolume: 50, drumVolume: 100 });
  assertClose(
    channel(softer, 0).subarray(0, SR / 2),
    Float64Array.from(channel(full, 0).subarray(0, SR / 2), (x) => x * 0.5)
  );
  assertClose(channel(softer, 0).subarray(5000, 5400), channel(full, 0).subarray(5000, 5400));
});

check("overlap is a linear sum and is not peak-normalized", () => {
  const music = new Float64Array(100);
  const drums = new Float64Array(100);
  music.fill(0.2);
  drums.fill(0.1);
  const mixed = vol.mixBuffers(music, drums, { musicVolume: 100, drumVolume: 200 });
  assert.strictEqual(mixed.frames, 100);
  for (let i = 0; i < mixed.frames; i++) almost(mixed.data[i], 0.4);

  const hotMusic = new Float64Array(4);
  const hotDrums = new Float64Array(4);
  hotMusic.fill(0.8);
  hotDrums.fill(0.8);
  const hot = vol.mixBuffers(hotMusic, hotDrums, { musicVolume: 100, drumVolume: 100 });
  for (let i = 0; i < hot.frames; i++) almost(hot.data[i], 1.6);
  const wav = vol.readWav(vol.encodeWav(hot, SR));
  almost(wav.data[0], 32767 / 32768, 1e-12);
});

check("the shorter stem is padded at the end and not shifted", () => {
  const music = new Float64Array(100);
  const drums = new Float64Array(40);
  music.fill(0.2);
  drums.fill(0.1);
  const mixed = vol.mixBuffers(music, drums, { musicVolume: 100, drumVolume: 100 });
  assert.strictEqual(mixed.frames, 100);
  assert.strictEqual(mixed.channels, 1);
  for (let i = 0; i < 40; i++) almost(mixed.data[i], 0.3);
  for (let i = 40; i < 100; i++) almost(mixed.data[i], 0.2);
});

check("stereo music keeps each channel and mono drums are copied across", () => {
  const data = new Float64Array(100);
  for (let i = 0; i < 50; i++) {
    data[i * 2] = 0.2;
    data[i * 2 + 1] = -0.2;
  }
  const music = { channels: 2, frames: 50, data: data };
  const drums = new Float64Array(50);
  drums.fill(0.1);
  const mixed = vol.mixBuffers(music, drums, { musicVolume: 100, drumVolume: 200 });
  assert.strictEqual(mixed.frames, 50);
  assert.strictEqual(mixed.channels, 2);
  assertClose(channel(mixed, 0), new Float64Array(50).fill(0.4));
  assertClose(channel(mixed, 1), new Float64Array(50).fill(0));
});

check("a wider music bus keeps its channels and fills the extra drum channel from the last one", () => {
  const musicData = new Float64Array(12);
  const drumData = new Float64Array(8);
  for (let i = 0; i < 4; i++) {
    musicData[i * 3] = 0.2;
    musicData[i * 3 + 1] = -0.2;
    musicData[i * 3 + 2] = 0.05;
    drumData[i * 2] = 0.1;
    drumData[i * 2 + 1] = 0.3;
  }
  const mixed = vol.mixBuffers(
    { channels: 3, frames: 4, data: musicData },
    { channels: 2, frames: 4, data: drumData },
    { musicVolume: 100, drumVolume: 100 }
  );
  assert.strictEqual(mixed.channels, 3);
  assertClose(channel(mixed, 0), Float64Array.of(0.3, 0.3, 0.3, 0.3));
  assertClose(channel(mixed, 1), Float64Array.of(0.1, 0.1, 0.1, 0.1));
  assertClose(channel(mixed, 2), Float64Array.of(0.35, 0.35, 0.35, 0.35));
});

check("resampling changes the drum bus only", () => {
  const music = new Float64Array(8);
  for (let i = 0; i < music.length; i++) music[i] = i * 0.01;
  const drums = new Float64Array(16);
  const mixed = vol.mixBuffers(music, drums, {
    musicVolume: 100,
    drumVolume: 400,
    musicRate: 8000,
    drumRate: 16000,
  });
  assert.strictEqual(mixed.frames, 8);
  assert.strictEqual(mixed.channels, 1);
  assertClose(mixed.data, music);
});

check("constant drums resample onto the music rate without touching music", () => {
  const music = new Float64Array(8000);
  const drums = new Float64Array(2000);
  drums.fill(0.4);
  const mixed = vol.mixBuffers(music, drums, {
    musicVolume: 50,
    drumVolume: 100,
    musicRate: 8000,
    drumRate: 4000,
  });
  assert.strictEqual(mixed.frames, 8000);
  for (let i = 0; i < 4000; i++) almost(mixed.data[i], 0.4, 1e-6);
  for (let i = 4000; i < mixed.frames; i++) almost(mixed.data[i], 0, 1e-6);
});

check("linear resample of the drum bus matches the shared interp", () => {
  const music = new Float64Array(8);
  const drums = Float64Array.of(0, 0.2, 0.5, -0.25, 0.1);
  const mixed = vol.mixBuffers(music, drums, {
    musicVolume: 100,
    drumVolume: 100,
    musicRate: 8,
    drumRate: 5,
  });
  assert.strictEqual(mixed.frames, 8);
  assertClose(
    mixed.data,
    Float64Array.of(0, 0.125, 0.275, 0.4625, 0.125, -0.20625, 0.0125, 0.1),
    1e-12
  );
});

check("a missing rate or a bad volume is rejected", () => {
  const music = new Float64Array(4);
  const drums = new Float64Array(4);
  assert.throws(() => vol.mixBuffers(music, drums, { drumVolume: -5 }), /音量/);
  assert.throws(() => vol.mixBuffers(music, drums, { musicVolume: Number.NaN }), /音量/);
  assert.throws(() => vol.mixBuffers(music, drums, { musicRate: 8000 }), /采样率/);
});

check("a wav round-trip keeps the music bus when drums are raised", () => {
  const tone = splitTone();
  const musicWav = vol.encodeWav(tone.music, SR);
  const drumWav = vol.encodeWav(tone.drums, SR);
  const music = vol.readWav(musicWav);
  const drums = vol.readWav(drumWav);
  const mixed = vol.mixBuffers(music, drums, {
    musicVolume: 100,
    drumVolume: 200,
    musicRate: music.sampleRate,
    drumRate: drums.sampleRate,
  });
  const heard = vol.readWav(vol.encodeWav(mixed, SR));
  assert.strictEqual(heard.sampleRate, SR);
  assert.strictEqual(heard.channels, 1);
  assertClose(heard.data.subarray(0, SR / 2), music.data.subarray(0, SR / 2), 1.5 / 32768);
  assertClose(
    heard.data.subarray(5000, 5400),
    Float64Array.from(drums.data.subarray(5000, 5400), (x) => x * 2),
    2.5 / 32768
  );
});

check("chart hits are the drum bus: big notes use 1.25, duplicates collapse, timeShift places them", () => {
  const sr = 100;
  const don = {
    sampleRate: sr,
    channels: 1,
    frames: 4,
    data: Float64Array.of(0.5, 0.25, 0.125, 0.05),
  };
  const ka = {
    sampleRate: sr,
    channels: 1,
    frames: 2,
    data: Float64Array.of(0.4, 0.2),
  };
  const stem = vol.renderDrumStem([
    { t: 0.1, face: "don", big: false },
    { t: 0.1, face: "don", big: true },
    { t: 0.2, face: "ka", big: true },
  ], don, ka, { timeShift: 0 });
  assert.strictEqual(stem.sampleRate, sr);
  assert.strictEqual(stem.channels, 1);
  almost(stem.data[10], 0.5);
  almost(stem.data[11], 0.25);
  almost(stem.data[20], 0.5);
  almost(stem.data[21], 0.25);
  const shifted = vol.renderDrumStem([{ t: 0, face: "don", big: false }], don, ka, { timeShift: 0.1 });
  almost(shifted.data[10], 0.5);
  almost(shifted.data[0], 0);
  const early = vol.renderDrumStem([{ t: -0.02, face: "don", big: false }], don, ka, { timeShift: 0 });
  almost(early.data[0], 0.125);
  almost(early.data[1], 0.05);
  assert.ok(early.data.length < 8);
});

check("export mixes the loaded song with chart hits and leaves the song alone when drums get louder", () => {
  const sr = 100;
  const music = new Float64Array(40);
  for (let i = 0; i < 10; i++) music[i] = 0.2;
  const don = {
    sampleRate: sr,
    channels: 1,
    frames: 4,
    data: Float64Array.of(0.5, 0.25, 0.125, 0.05),
  };
  const ka = { sampleRate: sr, channels: 1, frames: 1, data: Float64Array.of(0.4) };
  const events = [{ t: 0.1, face: "don", big: false }];
  const quiet = vol.exportChartMix({
    music: music,
    musicRate: sr,
    events: events,
    don: don,
    ka: ka,
    timeShift: 0,
    musicVolume: 100,
    drumVolume: 100,
  });
  const loud = vol.exportChartMix({
    music: music,
    musicRate: sr,
    events: events,
    don: don,
    ka: ka,
    timeShift: 0,
    musicVolume: 100,
    drumVolume: 250,
  });
  assert.strictEqual(loud.sampleRate, sr);
  assertClose(loud.data.subarray(0, 10), quiet.data.subarray(0, 10));
  assertClose(loud.data.subarray(0, 10), music.subarray(0, 10));
  assertClose(
    loud.data.subarray(10, 14),
    Float64Array.from(quiet.data.subarray(10, 14), (x) => x * 2.5)
  );
  const softer = vol.exportChartMix({
    music: music,
    musicRate: sr,
    events: events,
    don: don,
    ka: ka,
    musicVolume: 50,
    drumVolume: 100,
  });
  assertClose(softer.data.subarray(0, 10), Float64Array.from(music.subarray(0, 10), (x) => x * 0.5));
  assertClose(softer.data.subarray(10, 14), quiet.data.subarray(10, 14));
});

check("preview scales only the bus that moved", () => {
  vol.setVolumes(100, 100);
  assert.strictEqual(vol.musicVolume(), 100);
  assert.strictEqual(vol.drumVolume(), 100);
  assert.strictEqual(vol.scaledHitGain(1.25), 1.25);
  vol.setVolumes(100, 250);
  assert.strictEqual(vol.musicVolume(), 100);
  almost(vol.scaledHitGain(1), 2.5);
  almost(vol.scaledHitGain(1.25), 3.125);
  const quiet = vol.musicOutputPlan(100, false);
  assert.strictEqual(quiet.useGraph, false);
  assert.strictEqual(quiet.elementVolume, 1);
  const half = vol.musicOutputPlan(50, false);
  assert.strictEqual(half.useGraph, false);
  almost(half.elementVolume, 0.5);
  const hot = vol.musicOutputPlan(160, false);
  assert.strictEqual(hot.useGraph, true);
  assert.strictEqual(hot.elementVolume, 1);
  almost(hot.nodeGain, 1.6);
  const held = vol.musicOutputPlan(50, true);
  assert.strictEqual(held.useGraph, true);
  assert.strictEqual(held.elementVolume, 1);
  almost(held.nodeGain, 0.5);
  const media = { volume: 1 };
  vol.setVolumes(50, 100);
  vol.applyMusicOutput(media);
  almost(media.volume, 0.5);
  vol.setVolumes(160, 80);
  vol.applyMusicOutput(media);
  almost(media.volume, 1);
  assert.throws(() => vol.setVolumes(-1, 100), /音量/);
  vol.setVolumes(100, 100);
});

check("the editor column tunes music and drums and does not pick files", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "assets", "editor.css"), "utf8");
  const preview = fs.readFileSync(path.join(__dirname, "..", "js", "preview-hits.js"), "utf8");
  const song = fs.readFileSync(path.join(__dirname, "..", "js", "original-song.js"), "utf8");
  const start = html.indexOf('id="editorVolume"');
  assert.ok(start > html.indexOf('id="editor"'), "volume column belongs in the editor");
  const end = html.indexOf('class="editor-preview-legend"', start);
  assert.ok(end > start);
  const column = html.slice(start, end);
  assert.ok(column.includes("音乐"));
  assert.ok(column.includes("鼓点"));
  assert.ok(column.includes('id="editorMusicVolume"'));
  assert.ok(column.includes('id="editorDrumVolume"'));
  assert.ok(column.includes('type="range"'));
  assert.ok(column.includes('value="100"'));
  assert.ok(column.includes('id="editorExportMix"'));
  assert.ok(column.includes("导出音源"));
  assert.ok(!/type="file"/i.test(column), column);
  assert.ok(!column.includes("选择文件"));
  assert.ok(!column.includes("音乐壳音"));
  assert.ok(!column.includes("#c5362b") && !column.includes("#2a62b5"));
  assert.ok(html.includes('src="js/taiko-volume.js"'));

  const cssAt = css.indexOf(".editor-volume");
  assert.ok(cssAt >= 0);
  const rules = css.slice(cssAt, cssAt + 1200);
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(rules.replace(/#F3EBE0/gi, "")), rules);
  assert.ok(!rules.includes("var(--don)") && !rules.includes("var(--ka)"));
  assert.ok(!rules.includes("#c5362b") && !rules.includes("#2a62b5"));
  assert.ok(rules.includes("accent-color") && rules.includes("var(--ink)"));
  assert.ok(rules.includes("#F3EBE0") || rules.includes("#f3ebe0"));

  assert.ok(preview.includes("scaledHitGain"));
  assert.ok(song.includes("applyMusicOutput"));
});

console.log("taiko-volume tests: " + passed);
