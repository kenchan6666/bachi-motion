/**
 * Original-song mux for 手元 export.
 * Note times are already audio times (OFFSET subtracted once at parse).
 * chartStart = that first note − LEAD_IN (0.7). Do not subtract OFFSET again.
 * No song file → no original audio. Homemade charts and a generated impulse only.
 *
 *   node tests/audio-mux.test.js
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");

const parser = require(path.join(__dirname, "..", "js", "parser.js"));
const audio = require(path.join(__dirname, "..", "js", "audio-mux.js"));

let passed = 0;

function check(name, fn) {
  const ret = fn();
  if (ret && typeof ret.then === "function") {
    return ret.then(() => {
      passed += 1;
      console.log("  ✓ " + name);
    });
  }
  passed += 1;
  console.log("  ✓ " + name);
}

function nearly(a, b, eps) {
  assert.ok(Math.abs(a - b) <= (eps == null ? 1e-6 : eps), "expected " + a + " ≈ " + b + " (Δ " + (a - b) + ")");
}

function tja(offset) {
  return [
    "TITLE:homemade-mux",
    "BPM:120",
    "OFFSET:" + offset,
    "COURSE:Oni",
    "#START",
    "1,",
    "#END",
    "",
  ].join("\n");
}

function firstHit(offset) {
  const data = parser.eventsFromTja(tja(offset));
  return { data, first: data.events[0].t, offset: data.offset };
}

(async function main() {
  await check("chartStart is the already-adjusted first note minus 0.7", () => {
    // OFFSET -2 → parser stores t = 0 - (-2) = 2. That value is the audio time.
    const { data, first, offset } = firstHit(-2);
    assert.strictEqual(offset, -2);
    nearly(first, 2);
    const win = audio.exportWindow(data);
    nearly(win.chartStart, first - audio.LEAD_IN);
    nearly(win.chartStart, audio.chartStartFromFirstNote(first));
    nearly(win.chartStart, 1.3);
    nearly(win.chartEnd, data.rangeEnd + audio.TAIL_TIME);
    // Not "first note minus OFFSET", and not a second OFFSET on top of LEAD_IN.
    assert.notStrictEqual(Number(win.chartStart.toFixed(6)), Number((first - offset).toFixed(6)));
    assert.notStrictEqual(Number(win.chartStart.toFixed(6)), Number((first - offset - audio.LEAD_IN).toFixed(6)));
    assert.notStrictEqual(Number(win.chartStart.toFixed(6)), Number((0 - audio.LEAD_IN).toFixed(6)));
  });

  await check("positive OFFSET is not subtracted again", () => {
    // OFFSET +1.25 → first note audio time is -1.25. chartStart = -1.95.
    const { data, first, offset } = firstHit(1.25);
    assert.strictEqual(offset, 1.25);
    nearly(first, -1.25);
    const win = audio.exportWindow(data);
    nearly(win.chartStart, first - 0.7);
    nearly(win.chartStart, -1.95);
    const doubled = first - offset - 0.7;
    assert.ok(Math.abs(win.chartStart - doubled) > 0.5);
  });

  await check("song plan seeks to chartStart and ignores the OFFSET field", () => {
    const { data, first } = firstHit(-2);
    const win = audio.exportWindow(data);
    const withOffset = audio.originalAudioPlan({
      chartStart: win.chartStart,
      chartEnd: win.chartEnd,
      rate: 1,
      hasSong: true,
      includeHits: false,
      timeShift: data.timeShift || 0,
      offset: data.offset,
    });
    const withoutOffset = audio.originalAudioPlan({
      chartStart: win.chartStart,
      chartEnd: win.chartEnd,
      rate: 1,
      hasSong: true,
      includeHits: false,
      timeShift: 0,
    });
    assert.deepStrictEqual(withOffset, withoutOffset);
    assert.strictEqual(withOffset.includeOriginal, true);
    nearly(withOffset.audioOrigin, first - 0.7);
    nearly(withOffset.seekSec, 1.3);
    nearly(withOffset.delaySec, 0);
    nearly(withOffset.audioOrigin, win.chartStart);
  });

  await check("negative chartStart pads silence instead of seeking before the file", () => {
    const { data } = firstHit(1.25);
    const win = audio.exportWindow(data);
    const plan = audio.originalAudioPlan({
      chartStart: win.chartStart,
      chartEnd: win.chartEnd,
      rate: 1,
      hasSong: true,
      offset: 1.25,
    });
    nearly(plan.audioOrigin, -1.95);
    nearly(plan.seekSec, 0);
    nearly(plan.delaySec, 1.95);
    const filter = audio.songAudioFilter(plan);
    assert.ok(filter.includes("adelay=1950"), filter);
    assert.ok(!filter.includes("atrim=start=1.25"), filter);
    assert.ok(!filter.includes("-1.25"), filter);
  });

  await check("TJA-only export does not include original audio", () => {
    const { data } = firstHit(0);
    const win = audio.exportWindow(data);
    const plan = audio.originalAudioPlan({
      chartStart: win.chartStart,
      chartEnd: win.chartEnd,
      rate: 1,
      hasSong: false,
      includeHits: true,
      offset: 99,
    });
    assert.strictEqual(plan.includeOriginal, false);
    assert.strictEqual(plan.includeHits, true);
    assert.strictEqual(plan.seekSec, undefined);
    const inputs = audio.audioInputs(plan, {
      songSlice: "/tmp/should-not-be-used.wav",
      hits: "/tmp/hits.wav",
    });
    assert.deepStrictEqual(inputs, ["/tmp/hits.wav"]);
    const silent = audio.originalAudioPlan({
      chartStart: win.chartStart,
      chartEnd: win.chartEnd,
      rate: 1,
      hasSong: false,
      includeHits: false,
    });
    assert.deepStrictEqual(audio.audioInputs(silent, { songSlice: "/tmp/song.wav", hits: "/tmp/hits.wav" }), []);
  });

  await check("slow-mo delay is in video seconds and does not re-apply OFFSET", () => {
    const plan = audio.originalAudioPlan({
      chartStart: -0.7,
      chartEnd: 2,
      rate: 0.5,
      hasSong: true,
      offset: 0.7,
    });
    nearly(plan.audioOrigin, -0.7);
    nearly(plan.delaySec, 1.4);
    nearly(plan.videoDurationSec, 2.7 / 0.5);
    const filter = audio.songAudioFilter(plan);
    assert.ok(filter.includes("atempo=0.5"), filter);
    assert.ok(filter.includes("adelay=1400"), filter);
    assert.ok(!filter.includes("adelay=700"), filter);
  });

  await check("quarter speed chains atempo inside the supported range", () => {
    const chain = audio.atempoChain(0.25);
    assert.strictEqual(chain, "atempo=0.5,atempo=0.5");
    assert.strictEqual(audio.atempoChain(1), null);
  });

  await check("measure slice keeps song alignment via timeShift, not a second OFFSET", () => {
    const text = [
      "TITLE:homemade-slice",
      "BPM:120",
      "OFFSET:0",
      "#START",
      "1,",
      "1,",
      "#END",
      "",
    ].join("\n");
    const data = parser.eventsFromTja(text, { measures: "2-2" });
    nearly(data.timeShift, 2);
    nearly(data.events[0].t, 0);
    const win = audio.exportWindow(data);
    nearly(win.chartStart, -0.7);
    const plan = audio.originalAudioPlan({
      chartStart: win.chartStart,
      chartEnd: win.chartEnd,
      rate: 1,
      hasSong: true,
      timeShift: data.timeShift,
      offset: 5,
    });
    // Video t=0.7 is the note; the song at that moment must be absolute audio time 2.
    nearly(plan.audioOrigin + 0.7, 2);
    nearly(plan.seekSec, plan.audioOrigin);
    const ignored = audio.originalAudioPlan({
      chartStart: win.chartStart,
      chartEnd: win.chartEnd,
      rate: 1,
      hasSong: true,
      timeShift: data.timeShift,
    });
    assert.deepStrictEqual(plan, ignored);
  });

  await check("existing window stays on the measure when the bar starts with a rest", () => {
    const text = [
      "TITLE:homemade-rest",
      "BPM:120",
      "OFFSET:0",
      "#START",
      "01,",
      "#END",
      "",
    ].join("\n");
    const data = parser.eventsFromTja(text);
    const first = data.events[0].t;
    assert.ok(first > data.rangeStart);
    const win = audio.exportWindow(data);
    nearly(win.chartStart, data.rangeStart - 0.7);
    nearly(win.chartEnd, data.rangeEnd + 0.5);
    assert.ok(Math.abs(win.chartStart - (first - 0.7)) > 0.2);
  });

  await check("ffmpeg args extract the audio stream, including from mp4", () => {
    const plan = audio.originalAudioPlan({
      chartStart: 1.3,
      chartEnd: 2.5,
      rate: 1,
      hasSong: true,
      offset: -2,
    });
    const args = audio.songFfmpegArgs("song.mp4", plan, "out.wav");
    assert.ok(args.includes("-vn"), args.join(" "));
    assert.ok(args.includes("0:a:0"), args.join(" "));
    assert.strictEqual(args[args.indexOf("-i") + 1], "song.mp4");
    assert.strictEqual(args[args.length - 1], "out.wav");
    assert.ok(!args.includes("-c:v"), args.join(" "));
    const filter = args[args.indexOf("-af") + 1];
    assert.ok(filter.includes("atrim=start=1.3"), filter);
    assert.ok(!filter.includes("-2"), filter);
  });

  const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (ffmpeg.error || ffmpeg.status !== 0) {
    console.log("  - skip ffmpeg impulse placement (ffmpeg not on PATH)");
  } else {
    await check("ffmpeg slice places the impulse at (audioTime - chartStart) / rate", async () => {
      const sr = 44100;
      const seconds = 4;
      const samples = new Int16Array(sr * seconds);
      const impulseAt = 2;
      samples[impulseAt * sr] = 32767;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-mux-"));
      const song = path.join(dir, "impulse.wav");
      const out = path.join(dir, "sliced.wav");
      audio.writeWavPcm(song, sr, samples);
      const plan = audio.originalAudioPlan({
        chartStart: impulseAt - 0.7,
        chartEnd: impulseAt + 0.5,
        rate: 1,
        hasSong: true,
      });
      nearly(plan.seekSec, 1.3);
      await audio.extractSongSlice(song, plan, out);
      const wav = audio.readWavPcm(out);
      assert.strictEqual(wav.sampleRate, sr);
      let peak = 0;
      let mag = -1;
      for (let i = 0; i < wav.samples.length; i++) {
        const a = Math.abs(wav.samples[i]);
        if (a > mag) { mag = a; peak = i; }
      }
      assert.ok(mag > 1000, "impulse survived the slice");
      const videoT = peak / wav.sampleRate;
      nearly(videoT, 0.7, 1 / sr + 1e-4);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    await check("mp4 export extracts the audio stream instead of the picture", async () => {
      const sr = 44100;
      const samples = new Int16Array(sr);
      for (let i = 0; i < sr * 0.2; i++) samples[i] = 16000;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-mp4-"));
      const wavIn = path.join(dir, "tone.wav");
      const mp4 = path.join(dir, "tone.mp4");
      const out = path.join(dir, "sliced.wav");
      audio.writeWavPcm(wavIn, sr, samples);
      const enc = spawnSync("ffmpeg", ["-y", "-i", wavIn, "-c:a", "aac", "-vn", mp4], { encoding: "utf8" });
      assert.strictEqual(enc.status, 0, enc.stderr && enc.stderr.slice(-500));
      const plan = audio.originalAudioPlan({
        chartStart: 0,
        chartEnd: 1,
        rate: 1,
        hasSong: true,
        offset: -2,
      });
      await audio.extractSongSlice(mp4, plan, out);
      const wav = audio.readWavPcm(out);
      assert.ok(wav.samples.length > sr * 0.5, "sliced wav is long enough to hold the tone");
      let peak = 0;
      for (let i = 0; i < wav.samples.length; i++) peak = Math.max(peak, Math.abs(wav.samples[i]));
      assert.ok(peak > 1000, "mp4 audio was extracted, peak=" + peak);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    await check("TJA-only prepareExportWav does not mix in a song", async () => {
      const { data } = firstHit(0);
      const win = audio.exportWindow(data);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-hits-"));
      const song = path.join(dir, "should-not-read.wav");
      audio.writeWavPcm(song, 44100, new Int16Array([32767, 0, 0, 0]));
      const out = await audio.prepareExportWav({
        song: null,
        audio: true,
        rate: 1,
        hits: {
          events: [{ t: 0, face: "don", big: false }],
          don: audio.readWavPcm(path.join(__dirname, "..", "assets", "sounds", "don.wav")),
          ka: audio.readWavPcm(path.join(__dirname, "..", "assets", "sounds", "ka.wav")),
        },
      }, win.chartStart, win.chartEnd, dir);
      assert.ok(out && fs.existsSync(out));
      const wav = audio.readWavPcm(out);
      const direct = audio.mixHitAudio([{ t: 0, face: "don", big: false }], {
        start: win.chartStart,
        end: win.chartEnd,
        rate: 1,
        don: audio.readWavPcm(path.join(__dirname, "..", "assets", "sounds", "don.wav")),
        ka: audio.readWavPcm(path.join(__dirname, "..", "assets", "sounds", "ka.wav")),
      });
      assert.strictEqual(wav.samples.length, direct.samples.length);
      for (let i = 0; i < wav.samples.length; i++) {
        assert.strictEqual(wav.samples[i], direct.samples[i]);
      }
      const listed = fs.readdirSync(dir);
      assert.ok(!listed.some((name) => name.includes("should-not-read") && name.endsWith(".slice.wav")));
      fs.rmSync(dir, { recursive: true, force: true });
    });
  }

  const renderSrc = fs.readFileSync(path.join(__dirname, "..", "render.js"), "utf8");
  await check("render.js muxes through prepareExportWav on the export path", () => {
    assert.match(renderSrc, /prepareExportWav\s*\(/);
    assert.doesNotMatch(renderSrc, /firstNote(?:Time)?\s*-\s*(?:data\.|args\.)?offset/i);
    assert.doesNotMatch(renderSrc, /chartStart\s*-\s*(?:data\.)?offset/);
  });

  console.log("audio-mux tests: " + passed);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
