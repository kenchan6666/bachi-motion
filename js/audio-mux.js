"use strict";

/**
 * Original-audio alignment for 手元 export.
 *
 * After parse, note.t is already an audio time (OFFSET was subtracted once).
 * The picture window is the one the engine already uses:
 *   chartStart = rangeStart - LEAD_IN   (0.7s)
 *   chartEnd   = rangeEnd   + TAIL_TIME (0.5s)
 * When the exported range begins on the first note, rangeStart is that note,
 * so chartStart = firstNoteTime - 0.7. Do not subtract OFFSET again, and do
 * not cut the song by OFFSET alone.
 *
 * A measure crop (existing --measures) shifts chart time by timeShift. The
 * song stays on absolute audio time: audioOrigin = chartStart + timeShift.
 * No song file → includeOriginal is false (synthesized don/ka may still mix).
 */

const fs = require("fs");
const { spawn } = require("child_process");

const LEAD_IN = 0.7;
const TAIL_TIME = 0.5;

function chartStartFromFirstNote(firstNoteTime) {
  return +firstNoteTime - LEAD_IN;
}

function exportWindow(data) {
  const events = (data && data.events) || [];
  const first = events.length ? +events[0].t : 0;
  const last = events.length ? +events[events.length - 1].t : 0;
  const rangeStart = data && Number.isFinite(+data.rangeStart) ? +data.rangeStart : first;
  const rangeEnd = data && Number.isFinite(+data.rangeEnd) ? +data.rangeEnd : last;
  return {
    chartStart: rangeStart - LEAD_IN,
    chartEnd: rangeEnd + TAIL_TIME,
    firstNoteTime: first,
    lastNoteTime: last,
    rangeStart: rangeStart,
    rangeEnd: rangeEnd,
  };
}

function originalAudioPlan(opts) {
  opts = opts || {};
  const chartStart = +opts.chartStart;
  const chartEnd = +opts.chartEnd;
  const rate = opts.rate == null ? 1 : +opts.rate;
  if (!Number.isFinite(chartStart) || !Number.isFinite(chartEnd)) {
    throw new Error("出片窗口无效");
  }
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("rate 必须是正数");
  const timeShift = Number.isFinite(+opts.timeShift) ? +opts.timeShift : 0;
  // opts.offset is accepted and ignored. Note times already include it.
  const audioOrigin = chartStart + timeShift;
  const plan = {
    includeOriginal: false,
    includeHits: !!opts.includeHits,
    chartStart: chartStart,
    chartEnd: chartEnd,
    audioOrigin: audioOrigin,
    videoDurationSec: (chartEnd - chartStart) / rate,
    rate: rate,
  };
  if (!opts.hasSong) return plan;
  const seekSec = Math.max(0, audioOrigin);
  const delaySec = Math.max(0, -audioOrigin) / rate;
  const audioEnd = chartEnd + timeShift;
  plan.includeOriginal = true;
  plan.seekSec = seekSec;
  plan.delaySec = delaySec;
  plan.sourceSpanSec = Math.max(0, audioEnd - seekSec);
  return plan;
}

function trimNum(n) {
  return String(Math.round((+n) * 1e6) / 1e6);
}

function atempoChain(rate) {
  if (!Number.isFinite(+rate) || +rate <= 0) throw new Error("rate 必须是正数");
  if (Math.abs(+rate - 1) < 1e-6) return null;
  const parts = [];
  let r = +rate;
  while (r < 0.5 - 1e-9) {
    parts.push("atempo=0.5");
    r /= 0.5;
  }
  while (r > 100 + 1e-9) {
    parts.push("atempo=100");
    r /= 100;
  }
  parts.push("atempo=" + trimNum(r));
  return parts.join(",");
}

function songAudioFilter(plan) {
  const start = plan.seekSec;
  const end = plan.seekSec + plan.sourceSpanSec;
  const parts = [
    "atrim=start=" + trimNum(start) + ":end=" + trimNum(end),
    "asetpts=PTS-STARTPTS",
  ];
  const tempo = atempoChain(plan.rate);
  if (tempo) parts.push(tempo);
  if (plan.delaySec > 1e-6) {
    parts.push("adelay=" + Math.round(plan.delaySec * 1000) + ":all=1");
  }
  parts.push("apad=whole_dur=" + trimNum(plan.videoDurationSec));
  parts.push("atrim=0:" + trimNum(plan.videoDurationSec));
  return parts.join(",");
}

function songFfmpegArgs(songPath, plan, outWav) {
  return [
    "-y",
    "-i", songPath,
    "-af", songAudioFilter(plan),
    "-ac", "1",
    "-ar", "44100",
    "-c:a", "pcm_s16le",
    outWav,
  ];
}

function audioInputs(plan, paths) {
  paths = paths || {};
  const inputs = [];
  if (plan && plan.includeOriginal && paths.songSlice) inputs.push(paths.songSlice);
  if (plan && plan.includeHits && paths.hits) inputs.push(paths.hits);
  return inputs;
}

function readWavPcm(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("不是 WAV：" + file);
  }
  let off = 12;
  let sr = 44100;
  let bits = 16;
  let ch = 1;
  let data = null;
  let dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      ch = buf.readUInt16LE(off + 10);
      sr = buf.readUInt32LE(off + 12);
      bits = buf.readUInt16LE(off + 22);
    } else if (id === "data") {
      data = off + 8;
      dataLen = size;
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (data == null || bits !== 16) throw new Error("需要 16-bit PCM WAV：" + file);
  const samples = new Int16Array(dataLen / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(data + i * 2);
  return { sampleRate: sr, channels: ch, samples: samples };
}

function writeWavPcm(file, sampleRate, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  fs.writeFileSync(file, buf);
}

function mixHitAudio(events, opts) {
  const don = opts.don;
  const ka = opts.ka;
  const start = opts.start;
  const end = opts.end;
  const rate = opts.rate;
  const bigBoost = opts.bigBoost == null ? 1.25 : opts.bigBoost;
  const sr = don.sampleRate;
  if (ka.sampleRate !== sr) throw new Error("don.wav 和 ka.wav 的采样率不一致");
  const videoDur = (end - start) / rate;
  const total = Math.max(1, Math.ceil(videoDur * sr) + Math.max(don.samples.length, ka.samples.length));
  const mix = new Float64Array(total);
  const seen = new Set();
  for (const e of events) {
    const key = e.t.toFixed(6) + ":" + e.face;
    if (seen.has(key)) continue;
    seen.add(key);
    const videoT = (e.t - start) / rate;
    if (videoT < -0.05 || videoT > videoDur + 0.05) continue;
    const clip = e.face === "ka" ? ka.samples : don.samples;
    const gain = e.big ? bigBoost : 1;
    const at = Math.round(videoT * sr);
    for (let i = 0; i < clip.length; i++) {
      const j = at + i;
      if (j >= 0 && j < mix.length) mix[j] += (clip[i] / 32768) * gain;
    }
  }
  let peak = 1;
  for (const x of mix) peak = Math.max(peak, Math.abs(x));
  const out = new Int16Array(Math.ceil(videoDur * sr));
  const norm = peak > 1 ? 0.95 / peak : 0.95;
  for (let i = 0; i < out.length; i++) {
    const x = (mix[i] || 0) * norm;
    out[i] = Math.max(-32767, Math.min(32767, Math.round(x * 32767)));
  }
  return { sampleRate: sr, samples: out };
}

function runFfmpeg(argv) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", argv, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => { err += d; });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("ffmpeg 失败 (exit " + code + ")\n" + err.slice(-2000)));
    });
  });
}

function extractSongSlice(songPath, plan, outWav) {
  return runFfmpeg(songFfmpegArgs(songPath, plan, outWav));
}

function mixWavFiles(inputs, outWav) {
  const args = ["-y"];
  inputs.forEach((file) => { args.push("-i", file); });
  const labels = inputs.map((_, i) => "[" + i + ":a]").join("");
  args.push(
    "-filter_complex",
    labels + "amix=inputs=" + inputs.length + ":duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95",
    "-ac", "1",
    "-ar", "44100",
    "-c:a", "pcm_s16le",
    outWav,
  );
  return runFfmpeg(args);
}

async function prepareExportWav(spec, chartStart, chartEnd, work) {
  spec = spec || {};
  const plan = originalAudioPlan({
    chartStart: chartStart,
    chartEnd: chartEnd,
    rate: spec.rate == null ? 1 : spec.rate,
    hasSong: !!spec.song,
    includeHits: !!spec.audio,
    timeShift: spec.timeShift || 0,
    offset: spec.offset,
  });
  const path = require("path");
  let songSlice = null;
  if (plan.includeOriginal) {
    songSlice = path.join(work, "song-slice.wav");
    await extractSongSlice(spec.song, plan, songSlice);
  }
  let hitsPath = null;
  if (plan.includeHits) {
    if (!spec.hits || !spec.hits.don || !spec.hits.ka) {
      throw new Error("缺少 don/ka 打点声");
    }
    const mixed = mixHitAudio(spec.hits.events || [], {
      start: chartStart,
      end: chartEnd,
      rate: plan.rate,
      don: spec.hits.don,
      ka: spec.hits.ka,
    });
    hitsPath = path.join(work, "hits.wav");
    writeWavPcm(hitsPath, mixed.sampleRate, mixed.samples);
  }
  const inputs = audioInputs(plan, { songSlice: songSlice, hits: hitsPath });
  if (!inputs.length) return null;
  if (inputs.length === 1) return inputs[0];
  const mixedPath = path.join(work, "mixed.wav");
  await mixWavFiles(inputs, mixedPath);
  return mixedPath;
}

module.exports = {
  LEAD_IN: LEAD_IN,
  TAIL_TIME: TAIL_TIME,
  chartStartFromFirstNote: chartStartFromFirstNote,
  exportWindow: exportWindow,
  originalAudioPlan: originalAudioPlan,
  atempoChain: atempoChain,
  songAudioFilter: songAudioFilter,
  songFfmpegArgs: songFfmpegArgs,
  audioInputs: audioInputs,
  readWavPcm: readWavPcm,
  writeWavPcm: writeWavPcm,
  mixHitAudio: mixHitAudio,
  extractSongSlice: extractSongSlice,
  prepareExportWav: prepareExportWav,
};
