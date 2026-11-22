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
 * A song may be an audio file or a video container (mp4). Only its audio
 * stream is extracted; the picture is not copied into the wav.
 *
 * The two buses use the editor volumes (100 = original, TJA SONGVOL / SEVOL).
 * Big notes stay at 1.25 and are then multiplied by the drum volume. Overlap
 * is a linear sum, matching TaikoVolume.mixBuffers. The song samples are not
 * rewritten when the drums get louder, and the mix is not peak-normalized.
 */

const fs = require("fs");
const { spawn } = require("child_process");
const volume = require("./taiko-volume.js");

const LEAD_IN = 0.7;
const TAIL_TIME = 0.5;
// Big notes are mixed a bit hotter than small ones. Preview playback uses
// the same multiplier (see js/preview-hits.js).
const BIG_BOOST = 1.25;

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
  // -vn -map 0:a:0 keeps the audio stream from wav/ogg/mp3/… and from mp4.
  return [
    "-y",
    "-i", songPath,
    "-vn",
    "-map", "0:a:0",
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

function parseWavPcm(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("不是 WAV");
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
  if (data == null || bits !== 16) throw new Error("需要 16-bit PCM WAV");
  const samples = new Int16Array(dataLen / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(data + i * 2);
  return { sampleRate: sr, channels: ch, samples: samples };
}

function readWavPcm(file) {
  try {
    return parseWavPcm(fs.readFileSync(file));
  } catch (err) {
    if (err && /WAV/.test(err.message)) throw new Error(err.message + "：" + file);
    throw err;
  }
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

function musicMatrix(music) {
  if (music == null) return null;
  if (music.samples && music.sampleRate) {
    const channels = music.channels || 1;
    if (channels < 1) throw new Error("音频必须是一维或二维，且至少有一个声道");
    const frames = Math.floor(music.samples.length / channels);
    const data = new Float64Array(frames * channels);
    for (let i = 0; i < data.length; i++) data[i] = music.samples[i] / 32768;
    return { frames: frames, channels: channels, data: data, sampleRate: music.sampleRate | 0 };
  }
  if (music.data != null && music.frames != null) {
    const channels = (music.channels | 0) || 1;
    const frames = music.frames | 0;
    const data = new Float64Array(frames * channels);
    for (let i = 0; i < data.length; i++) data[i] = Number(music.data[i]);
    return { frames: frames, channels: channels, data: data, sampleRate: music.sampleRate | 0 };
  }
  if (ArrayBuffer.isView(music) || Array.isArray(music)) {
    const data = new Float64Array(music.length);
    for (let i = 0; i < music.length; i++) data[i] = Number(music[i]);
    return { frames: data.length, channels: 1, data: data, sampleRate: 0 };
  }
  throw new Error("音频必须是一维或二维，且至少有一个声道");
}

function monoClip(pcm) {
  const channels = pcm.channels || 1;
  const frames = Math.floor(pcm.samples.length / channels);
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += pcm.samples[i * channels + c] / 32768;
    out[i] = sum / channels;
  }
  return out;
}

function renderVideoDrums(events, opts) {
  const don = opts.don;
  const ka = opts.ka;
  const sr = don.sampleRate | 0;
  if (!(sr > 0) || (ka.sampleRate | 0) !== sr) throw new Error("don.wav 和 ka.wav 的采样率不一致");
  const start = +opts.start;
  const end = +opts.end;
  const rate = +opts.rate;
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) throw new Error("出片窗口无效");
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("rate 必须是正数");
  const bigBoost = opts.bigBoost == null ? BIG_BOOST : +opts.bigBoost;
  const videoDur = (end - start) / rate;
  const videoSamples = Math.max(1, Math.ceil(videoDur * sr));
  const donClip = monoClip(don);
  const kaClip = monoClip(ka);
  const seen = new Set();
  let total = videoSamples;
  const hits = [];
  const list = events || [];
  for (let n = 0; n < list.length; n++) {
    const e = list[n];
    if (!e || !Number.isFinite(+e.t)) continue;
    const key = (+e.t).toFixed(6) + ":" + e.face;
    if (seen.has(key)) continue;
    seen.add(key);
    const videoT = (e.t - start) / rate;
    if (videoT < -0.05 || videoT > videoDur + 0.05) continue;
    const clip = e.face === "ka" ? kaClip : donClip;
    const gain = e.big ? bigBoost : 1;
    const at = Math.round(videoT * sr);
    hits.push({ at: at, clip: clip, gain: gain });
    if (at + clip.length > total) total = at + clip.length;
  }
  if (total < 0) total = 0;
  const data = new Float64Array(total);
  for (let h = 0; h < hits.length; h++) {
    const hit = hits[h];
    for (let i = 0; i < hit.clip.length; i++) {
      const j = hit.at + i;
      if (j >= 0 && j < data.length) data[j] += hit.clip[i] * hit.gain;
    }
  }
  return { frames: data.length, channels: 1, data: data, sampleRate: sr };
}

function mixExportAudio(spec) {
  spec = spec || {};
  const musicVolume = spec.musicVolume == null ? 100 : spec.musicVolume;
  const drumVolume = spec.drumVolume == null ? 100 : spec.drumVolume;
  volume.volumePercentToGain(musicVolume);
  volume.volumePercentToGain(drumVolume);
  const wantHits = spec.includeHits != null ? !!spec.includeHits : !!(spec.don && spec.ka);
  if (wantHits && (!spec.don || !spec.ka)) throw new Error("缺少 don/ka 打点声");

  let music = musicMatrix(spec.music);
  if (music && spec.musicRate != null) music.sampleRate = spec.musicRate | 0;
  let drums = null;
  if (wantHits) {
    drums = renderVideoDrums(spec.events || [], {
      start: spec.start,
      end: spec.end,
      rate: spec.rate == null ? 1 : spec.rate,
      don: spec.don,
      ka: spec.ka,
      bigBoost: spec.bigBoost,
    });
  }
  if (!music && !drums) return null;

  let musicRate;
  let drumRate;
  if (!music) {
    musicRate = drums.sampleRate;
    drumRate = drums.sampleRate;
    music = { frames: 0, channels: 1, data: new Float64Array(0), sampleRate: musicRate };
  } else if (!drums) {
    musicRate = music.sampleRate;
    drumRate = music.sampleRate;
    drums = { frames: 0, channels: 1, data: new Float64Array(0), sampleRate: drumRate };
  } else {
    musicRate = music.sampleRate;
    drumRate = drums.sampleRate;
  }
  if (!(musicRate > 0) || !(drumRate > 0)) throw new Error("采样率必须是正数");

  const mixed = volume.mixBuffers(music, drums, {
    musicVolume: musicVolume,
    drumVolume: drumVolume,
    musicRate: musicRate,
    drumRate: drumRate,
  });
  const bytes = volume.encodeWav(mixed, musicRate);
  const parsed = parseWavPcm(Buffer.from(bytes));
  return {
    sampleRate: parsed.sampleRate,
    channels: parsed.channels,
    samples: parsed.samples,
    wav: bytes,
  };
}

function mixHitAudio(events, opts) {
  opts = opts || {};
  const mixed = mixExportAudio({
    music: null,
    events: events,
    start: opts.start,
    end: opts.end,
    rate: opts.rate,
    don: opts.don,
    ka: opts.ka,
    includeHits: true,
    musicVolume: 100,
    drumVolume: opts.drumVolume == null ? 100 : opts.drumVolume,
    bigBoost: opts.bigBoost,
  });
  return { sampleRate: mixed.sampleRate, samples: mixed.samples };
}

function ffmpegCommand() {
  const configured = process.env.FFMPEG_PATH;
  if (configured && String(configured).trim()) return String(configured).trim();
  return "ffmpeg";
}

function runFfmpeg(argv) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegCommand(), argv, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
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
  if (!plan.includeOriginal && !plan.includeHits) return null;
  volume.volumePercentToGain(spec.musicVolume == null ? 100 : spec.musicVolume);
  volume.volumePercentToGain(spec.drumVolume == null ? 100 : spec.drumVolume);
  const path = require("path");
  let music = null;
  if (plan.includeOriginal) {
    const songSlice = path.join(work, "song-slice.wav");
    await extractSongSlice(spec.song, plan, songSlice);
    music = readWavPcm(songSlice);
  }
  if (plan.includeHits && (!spec.hits || !spec.hits.don || !spec.hits.ka)) {
    throw new Error("缺少 don/ka 打点声");
  }
  const mixed = mixExportAudio({
    music: music,
    events: plan.includeHits ? (spec.hits.events || []) : [],
    start: chartStart,
    end: chartEnd,
    rate: plan.rate,
    don: plan.includeHits ? spec.hits.don : null,
    ka: plan.includeHits ? spec.hits.ka : null,
    includeHits: plan.includeHits,
    musicVolume: spec.musicVolume,
    drumVolume: spec.drumVolume,
    bigBoost: spec.bigBoost,
  });
  if (!mixed) return null;
  const mixedPath = path.join(work, "mixed.wav");
  fs.writeFileSync(mixedPath, Buffer.from(mixed.wav));
  return mixedPath;
}

module.exports = {
  LEAD_IN: LEAD_IN,
  TAIL_TIME: TAIL_TIME,
  BIG_BOOST: BIG_BOOST,
  chartStartFromFirstNote: chartStartFromFirstNote,
  exportWindow: exportWindow,
  originalAudioPlan: originalAudioPlan,
  atempoChain: atempoChain,
  songAudioFilter: songAudioFilter,
  songFfmpegArgs: songFfmpegArgs,
  audioInputs: audioInputs,
  readWavPcm: readWavPcm,
  writeWavPcm: writeWavPcm,
  mixExportAudio: mixExportAudio,
  mixHitAudio: mixHitAudio,
  extractSongSlice: extractSongSlice,
  prepareExportWav: prepareExportWav,
};
