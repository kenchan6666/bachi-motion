/**
 * 手元成片 uses the editor's music and drum volumes.
 * 100 is the original level, the same scale as TJA SONGVOL / SEVOL.
 * Big notes stay at 1.25, then the drum bus is multiplied by the drum volume.
 * Each bus is scaled on its own. Overlap is a linear sum. Raising the drums
 * does not change the song samples, and the mix is not peak-normalized.
 * The sum matches suyue tools/taiko_volume.py mix_buffers.
 *
 *   node tests/export-volume.test.js
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");

const audio = require(path.join(__dirname, "..", "js", "audio-mux.js"));
const vol = require(path.join(__dirname, "..", "js", "taiko-volume.js"));
const jobs = require(path.join(__dirname, "..", "js", "render-jobs.js"));
const ui = require(path.join(__dirname, "..", "js", "batch-ui.js"));
const serverMod = require(path.join(__dirname, "..", "js", "render-server.js"));

const SR = 1000;
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

function encodeAll(data, rate) {
  const bytes = Buffer.from(vol.encodeWav(data, rate || SR));
  const n = bytes.readUInt32LE(40) / 2;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = bytes.readInt16LE(44 + i * 2);
  return out;
}

function encodeSample(x) {
  return encodeAll(Float64Array.of(x), SR)[0];
}

function click(value, length) {
  const samples = new Int16Array(length);
  samples.fill(value);
  return { sampleRate: SR, channels: 1, samples: samples };
}

function musicBus(fill, frames) {
  const data = new Float64Array(frames);
  data.fill(fill);
  return { sampleRate: SR, channels: 1, frames: frames, data: data };
}

function mixAt(opts) {
  return audio.mixExportAudio(Object.assign({
    start: 0,
    end: 1,
    rate: 1,
    includeHits: true,
    musicVolume: 100,
    drumVolume: 100,
  }, opts));
}

(async function main() {
  const drumUnit = 3277 / 32768;

  await check("export mix follows mix_buffers and does not peak-normalize", () => {
    const don = click(3277, 4);
    const ka = click(0, 1);
    const quiet = mixAt({
      music: musicBus(0.2, SR),
      events: [{ t: 0.5, face: "don", big: false }],
      don: don,
      ka: ka,
      drumVolume: 100,
    });
    const loud = mixAt({
      music: musicBus(0.2, SR),
      events: [{ t: 0.5, face: "don", big: false }],
      don: don,
      ka: ka,
      drumVolume: 250,
    });
    assert.strictEqual(quiet.samples.length, SR);
    assert.strictEqual(loud.samples.length, SR);
    assert.strictEqual(quiet.sampleRate, SR);
    const head = encodeSample(0.2);
    for (let i = 0; i < 500; i++) {
      assert.strictEqual(loud.samples[i], head, "head " + i);
      assert.strictEqual(quiet.samples[i], head, "quiet head " + i);
    }
    assert.strictEqual(quiet.samples[500], encodeSample(0.2 + drumUnit));
    assert.strictEqual(loud.samples[500], encodeSample(0.2 + drumUnit * 2.5));
    assert.notStrictEqual(loud.samples[500], quiet.samples[500]);
    for (let i = 504; i < SR; i++) {
      assert.strictEqual(loud.samples[i], head);
      assert.strictEqual(quiet.samples[i], head);
    }
  });

  await check("a sum above full scale is clipped per sample, not scaled as a whole", () => {
    const don = click(26214, 4);
    const mixed = mixAt({
      music: musicBus(26214 / 32768, SR),
      events: [{ t: 0.5, face: "don", big: false }],
      don: don,
      ka: click(0, 1),
    });
    const head = encodeSample(26214 / 32768);
    assert.strictEqual(mixed.samples[0], head);
    assert.strictEqual(mixed.samples[499], head);
    assert.strictEqual(mixed.samples[500], 32767);
    assert.ok(mixed.samples[500] > 32000);
  });

  await check("big notes are 1.25 times, then multiplied by the drum volume", () => {
    const don = click(3277, 2);
    const mixed = mixAt({
      music: musicBus(0.2, SR),
      events: [{ t: 0.25, face: "don", big: true }],
      don: don,
      ka: click(0, 1),
      drumVolume: 200,
    });
    assert.strictEqual(mixed.samples[250], encodeSample(0.2 + drumUnit * 1.25 * 2));
    assert.strictEqual(mixed.samples[0], encodeSample(0.2));
  });

  await check("music volume does not scale the drum bus", () => {
    const don = click(3277, 4);
    const mixed = mixAt({
      music: musicBus(0.2, SR),
      events: [{ t: 0.5, face: "don", big: false }],
      don: don,
      ka: click(0, 1),
      musicVolume: 50,
      drumVolume: 100,
    });
    assert.strictEqual(mixed.samples[0], encodeSample(0.1));
    assert.strictEqual(mixed.samples[500], encodeSample(0.1 + drumUnit));
  });

  await check("no original song leaves the music bus silent", () => {
    const mixed = mixAt({
      music: null,
      events: [{ t: 0.5, face: "ka", big: false }],
      don: click(0, 1),
      ka: click(3277, 3),
      drumVolume: 200,
    });
    assert.strictEqual(mixed.samples[0], 0);
    assert.strictEqual(mixed.samples[499], 0);
    assert.strictEqual(mixed.samples[500], encodeSample(drumUnit * 2));
  });

  await check("slow motion places the hit on the video timeline", () => {
    const frames = SR * 2;
    const mixed = mixAt({
      music: musicBus(0.2, frames),
      events: [{ t: 0.5, face: "don", big: false }],
      start: 0,
      end: 1,
      rate: 0.5,
      don: click(3277, 1),
      ka: click(0, 1),
    });
    assert.strictEqual(mixed.samples.length, frames);
    assert.strictEqual(mixed.samples[500], encodeSample(0.2));
    assert.strictEqual(mixed.samples[1000], encodeSample(0.2 + drumUnit));
  });

  await check("a different drum rate is resampled and the music samples stay put", () => {
    const music = new Float64Array(8);
    for (let i = 0; i < music.length; i++) music[i] = i * 0.01;
    const donSamples = new Int16Array(2);
    donSamples.fill(3277);
    const quiet = audio.mixExportAudio({
      music: { sampleRate: 8000, channels: 1, frames: 8, data: music },
      events: [{ t: 0, face: "don", big: false }],
      start: 0,
      end: 8 / 8000,
      rate: 1,
      don: { sampleRate: 16000, channels: 1, samples: donSamples },
      ka: { sampleRate: 16000, channels: 1, samples: new Int16Array([0]) },
      includeHits: true,
      musicVolume: 100,
      drumVolume: 100,
    });
    const loud = audio.mixExportAudio({
      music: { sampleRate: 8000, channels: 1, frames: 8, data: music },
      events: [{ t: 0, face: "don", big: false }],
      start: 0,
      end: 8 / 8000,
      rate: 1,
      don: { sampleRate: 16000, channels: 1, samples: donSamples },
      ka: { sampleRate: 16000, channels: 1, samples: new Int16Array([0]) },
      includeHits: true,
      musicVolume: 100,
      drumVolume: 400,
    });
    const drums = new Float64Array(16);
    drums[0] = drumUnit;
    drums[1] = drumUnit;
    const expected = vol.mixBuffers(music, drums, {
      musicVolume: 100,
      drumVolume: 100,
      musicRate: 8000,
      drumRate: 16000,
    });
    assert.deepStrictEqual(quiet.samples, encodeAll(expected.data, 8000));
    assert.strictEqual(quiet.samples.length, 8);
    assert.strictEqual(loud.samples.length, 8);
    for (let i = 1; i < 8; i++) assert.strictEqual(loud.samples[i], quiet.samples[i]);
    assert.notStrictEqual(loud.samples[0], quiet.samples[0]);
  });

  await check("a negative export volume is rejected", () => {
    assert.throws(() => mixAt({
      music: musicBus(0.2, 8),
      events: [],
      includeHits: false,
      musicVolume: -5,
    }), /音量/);
  });

  await check("the export mux no longer peak-limits the mix", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "js", "audio-mux.js"), "utf8");
    assert.ok(!src.includes("alimiter"), "alimiter is still in the export mux");
    assert.ok(!/0\.95\s*\/\s*peak/.test(src), "hit bus is still peak-normalized");
    assert.ok(src.includes("mixBuffers"));
  });

  await check("render and the desktop exporter pass the editor volumes through", () => {
    const renderSrc = fs.readFileSync(path.join(__dirname, "..", "render.js"), "utf8");
    const desktopSrc = fs.readFileSync(path.join(__dirname, "..", "desktop", "export-frames.js"), "utf8");
    assert.match(renderSrc, /musicVolume:\s*args\.musicVolume/);
    assert.match(renderSrc, /drumVolume:\s*args\.drumVolume/);
    assert.match(desktopSrc, /musicVolume:\s*args\.musicVolume/);
    assert.match(desktopSrc, /drumVolume:\s*args\.drumVolume/);
  });

  await check("the open chart posts the slider values and defaults to 100", () => {
    const posted = ui.serializeJob({
      tjaText: "TITLE:x\n",
      hits: true,
      musicVolume: 80,
      drumVolume: 250,
    });
    assert.strictEqual(posted.musicVolume, 80);
    assert.strictEqual(posted.drumVolume, 250);
    const defaults = ui.serializeJob({ tjaText: "TITLE:x\n", hits: false });
    assert.strictEqual(defaults.musicVolume, 100);
    assert.strictEqual(defaults.drumVolume, 100);
    const home = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const play = home.slice(home.indexOf('id="singleRender"'), home.indexOf('id="editor"'));
    assert.ok(!play.includes('type="range"'));
    assert.ok(home.includes('id="editorMusicVolume"'));
    assert.ok(home.includes('id="editorDrumVolume"'));
  });

  await check("the local render job keeps the posted volumes", async () => {
    const seen = [];
    const server = await serverMod.startRenderServer({
      port: 0,
      renderJob: async (args) => {
        seen.push({
          musicVolume: args.musicVolume,
          drumVolume: args.drumVolume,
          audio: args.audio,
          song: args.song,
        });
        const out = path.join(os.tmpdir(), "bachi-export-vol-" + seen.length + ".mp4");
        fs.writeFileSync(out, "mp4");
        return out;
      },
    });
    try {
      const base = "http://127.0.0.1:" + server.port;
      const posted = await fetch(base + "/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: [{
            name: "one.tja",
            tjaText: "TITLE:one\nBPM:120\nOFFSET:0\n#START\n1,\n#END\n",
            songBase64: null,
            hits: true,
            musicVolume: 80,
            drumVolume: 250,
          }],
        }),
      }).then((res) => res.json());
      assert.ok(posted.id, posted.error || "missing batch id");
      const deadline = Date.now() + 2000;
      while (!seen.length && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.strictEqual(seen.length, 1);
      assert.strictEqual(seen[0].musicVolume, 80);
      assert.strictEqual(seen[0].drumVolume, 250);
      assert.strictEqual(seen[0].audio, true);
      assert.strictEqual(seen[0].song, null);
    } finally {
      await server.close();
    }
  });

  await check("CLI and batch files pass the same two volumes and default to 100", () => {
    const args = jobs.parseArgs([
      "--tja", "谱.tja",
      "--song", "tone.wav",
      "--audio",
      "--music-volume", "80",
      "--drum-volume", "160",
      "--out", "out.mp4",
    ]);
    assert.strictEqual(args.musicVolume, 80);
    assert.strictEqual(args.drumVolume, 160);
    const defaults = jobs.parseArgs(["--tja", "谱.tja", "--out", "out.mp4"]);
    assert.strictEqual(defaults.musicVolume, 100);
    assert.strictEqual(defaults.drumVolume, 100);
    assert.throws(() => jobs.parseArgs([
      "--tja", "谱.tja",
      "--music-volume", "-1",
      "--out", "out.mp4",
    ]), /音量/);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-export-vol-"));
    fs.writeFileSync(path.join(dir, "a.tja"), "TITLE:a\nBPM:120\nOFFSET:0\n#START\n1,\n#END\n");
    fs.writeFileSync(path.join(dir, "b.tja"), "TITLE:b\nBPM:120\nOFFSET:0\n#START\n1,\n#END\n");
    fs.writeFileSync(path.join(dir, "queue.json"), JSON.stringify({
      musicVolume: 70,
      drumVolume: 140,
      jobs: [
        { tja: "a.tja", out: "a.mp4", drumVolume: 180 },
        { tja: "b.tja", out: "b.mp4" },
      ],
    }));
    const loaded = jobs.loadBatchFile(path.join(dir, "queue.json"));
    assert.strictEqual(loaded[0].musicVolume, 70);
    assert.strictEqual(loaded[0].drumVolume, 180);
    assert.strictEqual(loaded[1].musicVolume, 70);
    assert.strictEqual(loaded[1].drumVolume, 140);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (ffmpeg.error || ffmpeg.status !== 0) {
    console.log("  - skip ffmpeg export volume (ffmpeg not on PATH)");
  } else {
    await check("prepareExportWav keeps the song when the drums get louder", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-export-mix-"));
      const song = path.join(dir, "song.wav");
      const samples = new Int16Array(44100);
      samples.fill(6554);
      audio.writeWavPcm(song, 44100, samples);
      const don = { sampleRate: 44100, channels: 1, samples: new Int16Array(64).fill(4000) };
      const ka = { sampleRate: 44100, channels: 1, samples: new Int16Array([0]) };
      const spec = {
        song: song,
        audio: true,
        rate: 1,
        musicVolume: 100,
        hits: {
          events: [{ t: 0.5, face: "don", big: false }],
          don: don,
          ka: ka,
        },
      };
      fs.mkdirSync(path.join(dir, "loud"), { recursive: true });
      fs.mkdirSync(path.join(dir, "song-only"), { recursive: true });
      const quietPath = await audio.prepareExportWav(
        Object.assign({}, spec, { drumVolume: 100 }),
        0, 1, dir
      );
      const loudPath = await audio.prepareExportWav(
        Object.assign({}, spec, { drumVolume: 250 }),
        0, 1, path.join(dir, "loud")
      );
      const quiet = audio.readWavPcm(quietPath);
      const loud = audio.readWavPcm(loudPath);
      assert.strictEqual(quiet.channels, 1);
      assert.strictEqual(loud.sampleRate, quiet.sampleRate);
      const hitAt = Math.round(0.5 * quiet.sampleRate);
      for (let i = 0; i < hitAt; i++) {
        assert.strictEqual(loud.samples[i], quiet.samples[i], "song sample " + i);
      }
      assert.ok(Math.abs(loud.samples[hitAt]) > Math.abs(quiet.samples[hitAt]));
      const slice = path.join(dir, "slice.wav");
      const plan = audio.originalAudioPlan({ chartStart: 0, chartEnd: 1, rate: 1, hasSong: true });
      await audio.extractSongSlice(song, plan, slice);
      const music = audio.readWavPcm(slice);
      const songOnly = await audio.prepareExportWav({
        song: song,
        audio: false,
        rate: 1,
        musicVolume: 50,
        drumVolume: 250,
      }, 0, 1, path.join(dir, "song-only"));
      const gained = audio.readWavPcm(songOnly);
      const expected = encodeAll(Float64Array.from(music.samples, (s) => (s / 32768) * 0.5), music.sampleRate);
      assert.strictEqual(gained.samples.length, expected.length);
      for (let i = 0; i < expected.length; i++) {
        assert.strictEqual(gained.samples[i], expected[i], "music gain " + i);
      }
      const full = encodeAll(Float64Array.from(music.samples, (s) => s / 32768), music.sampleRate);
      for (let i = 0; i < hitAt; i++) assert.strictEqual(quiet.samples[i], full[i]);
      fs.rmSync(dir, { recursive: true, force: true });
    });
  }

  console.log("export-volume tests: " + passed);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
