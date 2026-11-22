"use strict";

/**
 * Music and drum volumes for the hand-order editor.
 *
 * 100 is the original level, the same scale as TJA SONGVOL / SEVOL.
 * Each bus is multiplied by its own volume. Raising the drums scales only
 * the drum bus: the song samples stay put, and the sum is not peak-normalized.
 * Overlap is a linear add. Shorter stems are padded with silence at the end.
 *
 * This is the same mix as suyue tools/taiko_volume.py (mix_buffers). The
 * music bus is the song already chosen in 「高级」. The drum bus is the
 * current chart's don/ka hits. This column does not pick another file.
 */
(function (factory) {
  const api = factory();
  const root = typeof globalThis !== "undefined" ? globalThis : window;
  root.TaikoVolume = api;
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { api.mount(); });
    } else {
      api.mount();
    }
  }
})(function () {
  const BIG_BOOST = 1.25;
  let musicVolumeState = 100;
  let drumVolumeState = 100;
  let mounted = false;
  const soundCache = {};

  function volumePercentToGain(volumePercent) {
    const value = Number(volumePercent);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("音量不能小于 0，收到的是 " + volumePercent);
    }
    return value / 100;
  }

  function asChannels(samples) {
    if (samples && typeof samples === "object" && !ArrayBuffer.isView(samples) && !Array.isArray(samples)
        && samples.data != null && Number.isFinite(+samples.channels) && +samples.channels >= 1) {
      const channels = +samples.channels | 0;
      const raw = samples.data;
      const frames = samples.frames != null ? (+samples.frames | 0) : Math.floor(raw.length / channels);
      if (frames < 0 || frames * channels > raw.length) {
        throw new Error("音频必须是一维或二维，且至少有一个声道");
      }
      const data = new Float64Array(frames * channels);
      for (let i = 0; i < data.length; i++) data[i] = Number(raw[i]);
      return { frames: frames, channels: channels, data: data };
    }
    if (ArrayBuffer.isView(samples) || (Array.isArray(samples) && (samples.length === 0 || typeof samples[0] === "number"))) {
      const data = new Float64Array(samples.length);
      for (let i = 0; i < samples.length; i++) data[i] = Number(samples[i]);
      return { frames: data.length, channels: 1, data: data };
    }
    if (Array.isArray(samples) && samples.length && Array.isArray(samples[0])) {
      const frames = samples.length;
      const channels = samples[0].length;
      if (channels < 1) throw new Error("音频必须是一维或二维，且至少有一个声道");
      const data = new Float64Array(frames * channels);
      for (let i = 0; i < frames; i++) {
        const row = samples[i];
        if (!row || row.length < channels) throw new Error("音频必须是一维或二维，且至少有一个声道");
        for (let c = 0; c < channels; c++) data[i * channels + c] = Number(row[c]);
      }
      return { frames: frames, channels: channels, data: data };
    }
    throw new Error("音频必须是一维或二维，且至少有一个声道");
  }

  function fitChannels(matrix, channels) {
    if (matrix.channels === channels) return matrix;
    const frames = matrix.frames;
    const have = matrix.channels;
    const out = new Float64Array(frames * channels);
    if (have === 1) {
      for (let i = 0; i < frames; i++) {
        const value = matrix.data[i];
        for (let c = 0; c < channels; c++) out[i * channels + c] = value;
      }
    } else if (channels === 1) {
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < have; c++) sum += matrix.data[i * have + c];
        out[i] = sum / have;
      }
    } else if (have > channels) {
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) out[i * channels + c] = matrix.data[i * have + c];
      }
    } else {
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < have; c++) out[i * channels + c] = matrix.data[i * have + c];
        const last = matrix.data[i * have + have - 1];
        for (let c = have; c < channels; c++) out[i * channels + c] = last;
      }
    }
    return { frames: frames, channels: channels, data: out };
  }

  function resample(matrix, srcRate, dstRate) {
    const src = srcRate | 0;
    const dst = dstRate | 0;
    if (src <= 0 || dst <= 0) throw new Error("采样率必须是正数");
    if (src === dst || matrix.frames === 0) return matrix;
    const dstN = Math.round(matrix.frames * dst / src);
    if (dstN <= 0) return { frames: 0, channels: matrix.channels, data: new Float64Array(0) };
    const channels = matrix.channels;
    const out = new Float64Array(dstN * channels);
    const last = matrix.frames - 1;
    for (let j = 0; j < dstN; j++) {
      const idx = j * src / dst;
      if (idx <= 0) {
        for (let c = 0; c < channels; c++) out[j * channels + c] = matrix.data[c];
        continue;
      }
      if (idx >= last) {
        for (let c = 0; c < channels; c++) out[j * channels + c] = matrix.data[last * channels + c];
        continue;
      }
      const i0 = Math.floor(idx);
      const frac = idx - i0;
      for (let c = 0; c < channels; c++) {
        const a = matrix.data[i0 * channels + c];
        const b = matrix.data[(i0 + 1) * channels + c];
        out[j * channels + c] = a + (b - a) * frac;
      }
    }
    return { frames: dstN, channels: channels, data: out };
  }

  function pad(matrix, frames) {
    if (matrix.frames === frames) return matrix;
    const out = new Float64Array(frames * matrix.channels);
    const count = Math.min(matrix.frames, frames) * matrix.channels;
    if (count > 0) out.set(matrix.data.subarray(0, count));
    return { frames: frames, channels: matrix.channels, data: out };
  }

  function mixBuffers(music, drums, opts) {
    opts = opts || {};
    const musicGain = volumePercentToGain(opts.musicVolume == null ? 100 : opts.musicVolume);
    const drumGain = volumePercentToGain(opts.drumVolume == null ? 100 : opts.drumVolume);
    let musicBus = asChannels(music);
    let drumBus = asChannels(drums);
    const hasMusicRate = opts.musicRate != null;
    const hasDrumRate = opts.drumRate != null;
    if (hasMusicRate !== hasDrumRate) throw new Error("采样率要两路一起给，或者都不给");
    if (hasMusicRate && hasDrumRate && (opts.musicRate | 0) !== (opts.drumRate | 0)) {
      drumBus = resample(drumBus, opts.drumRate | 0, opts.musicRate | 0);
    }
    drumBus = fitChannels(drumBus, musicBus.channels);
    const frames = Math.max(musicBus.frames, drumBus.frames);
    musicBus = pad(musicBus, frames);
    drumBus = pad(drumBus, frames);
    const channels = musicBus.channels;
    const data = new Float64Array(frames * channels);
    for (let i = 0; i < data.length; i++) {
      data[i] = musicBus.data[i] * musicGain + drumBus.data[i] * drumGain;
    }
    return { frames: frames, channels: channels, data: data };
  }

  function ascii(bytes, offset, length) {
    let text = "";
    for (let i = 0; i < length; i++) text += String.fromCharCode(bytes[offset + i]);
    return text;
  }

  function writeAscii(bytes, offset, text) {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  }

  function encodeWav(samples, rate) {
    const matrix = asChannels(samples);
    const rateN = rate | 0;
    if (rateN <= 0) throw new Error("采样率必须是正数");
    const channels = matrix.channels;
    const frames = matrix.frames;
    const block = channels * 2;
    const dataBytes = frames * block;
    const bytes = new Uint8Array(44 + dataBytes);
    const view = new DataView(bytes.buffer);
    writeAscii(bytes, 0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    writeAscii(bytes, 8, "WAVE");
    writeAscii(bytes, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, rateN, true);
    view.setUint32(28, rateN * block, true);
    view.setUint16(32, block, true);
    view.setUint16(34, 16, true);
    writeAscii(bytes, 36, "data");
    view.setUint32(40, dataBytes, true);
    let offset = 44;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++) {
        let x = matrix.data[i * channels + c];
        if (!Number.isFinite(x)) x = 0;
        if (x > 1) x = 1;
        else if (x < -1) x = -1;
        let pcm = Math.round(x * 32767);
        if (pcm > 32767) pcm = 32767;
        else if (pcm < -32768) pcm = -32768;
        view.setInt16(offset, pcm, true);
        offset += 2;
      }
    }
    return bytes;
  }

  function readWav(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") throw new Error("不是 WAV");
    let off = 12;
    let channels = 0;
    let rate = 0;
    let bits = 0;
    let format = 0;
    let dataOff = -1;
    let dataLen = 0;
    while (off + 8 <= bytes.length) {
      const id = ascii(bytes, off, 4);
      const size = view.getUint32(off + 4, true);
      if (id === "fmt ") {
        format = view.getUint16(off + 8, true);
        channels = view.getUint16(off + 10, true);
        rate = view.getUint32(off + 12, true);
        bits = view.getUint16(off + 22, true);
      } else if (id === "data") {
        dataOff = off + 8;
        dataLen = size;
        break;
      }
      off += 8 + size + (size % 2);
    }
    if (format !== 1 || dataOff < 0 || bits !== 16 || channels < 1) throw new Error("需要 16-bit PCM WAV");
    const frames = Math.floor(dataLen / (channels * 2));
    const data = new Float64Array(frames * channels);
    let cursor = dataOff;
    for (let i = 0; i < data.length; i++) {
      data[i] = view.getInt16(cursor, true) / 32768;
      cursor += 2;
    }
    return { sampleRate: rate, channels: channels, frames: frames, data: data };
  }

  function monoSamples(buffer) {
    const matrix = asChannels(buffer);
    if (matrix.channels === 1) return matrix.data;
    const out = new Float64Array(matrix.frames);
    for (let i = 0; i < matrix.frames; i++) {
      let sum = 0;
      for (let c = 0; c < matrix.channels; c++) sum += matrix.data[i * matrix.channels + c];
      out[i] = sum / matrix.channels;
    }
    return out;
  }

  function renderDrumStem(events, don, ka, opts) {
    opts = opts || {};
    if (!don || !ka || !(don.sampleRate > 0) || (don.sampleRate | 0) !== (ka.sampleRate | 0)) {
      throw new Error("don 和 ka 的采样率不一致");
    }
    const sr = don.sampleRate | 0;
    const timeShift = Number.isFinite(+opts.timeShift) ? +opts.timeShift : 0;
    const bigBoost = opts.bigBoost == null ? BIG_BOOST : +opts.bigBoost;
    const donClip = monoSamples(don);
    const kaClip = monoSamples(ka);
    const seen = new Set();
    const hits = [];
    let total = 0;
    const list = events || [];
    for (let n = 0; n < list.length; n++) {
      const event = list[n];
      if (!event || !Number.isFinite(+event.t)) continue;
      const face = event.face === "ka" ? "ka" : "don";
      const key = (+event.t).toFixed(6) + ":" + face;
      if (seen.has(key)) continue;
      seen.add(key);
      const clip = face === "ka" ? kaClip : donClip;
      const at = Math.round((+event.t + timeShift) * sr);
      hits.push({ at: at, clip: clip, gain: event.big ? bigBoost : 1 });
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

  function exportChartMix(spec) {
    spec = spec || {};
    const musicVolume = spec.musicVolume == null ? musicVolumeState : spec.musicVolume;
    const drumVolume = spec.drumVolume == null ? drumVolumeState : spec.drumVolume;
    if (!spec.don || !spec.ka) throw new Error("缺少 don/ka 打点声");
    const drums = renderDrumStem(spec.events || [], spec.don, spec.ka, {
      timeShift: spec.timeShift || 0,
      bigBoost: spec.bigBoost,
    });
    const music = spec.music == null ? new Float64Array(0) : spec.music;
    const musicRate = spec.musicRate == null ? null : spec.musicRate;
    const opts = { musicVolume: musicVolume, drumVolume: drumVolume };
    if (musicRate != null) {
      opts.musicRate = musicRate;
      opts.drumRate = spec.don.sampleRate;
    }
    const mixed = mixBuffers(music, drums, opts);
    return {
      frames: mixed.frames,
      channels: mixed.channels,
      data: mixed.data,
      sampleRate: musicRate != null ? +musicRate : (spec.don.sampleRate | 0),
    };
  }

  function scaledHitGain(hitGain) {
    return (+hitGain) * volumePercentToGain(drumVolumeState);
  }

  function musicOutputPlan(volumePercent, graphAttached) {
    const gain = volumePercentToGain(volumePercent);
    if (graphAttached || gain > 1) {
      return { elementVolume: 1, nodeGain: gain, useGraph: true };
    }
    return { elementVolume: gain, nodeGain: gain, useGraph: false };
  }

  function ensureMusicGraph(media) {
    if (!media || media._bachiMusicGain) return media ? media._bachiMusicGain : null;
    const host = typeof window !== "undefined" ? window : globalThis;
    const AC = host && (host.AudioContext || host.webkitAudioContext);
    if (!AC) return null;
    try {
      const ctx = new AC();
      const src = ctx.createMediaElementSource(media);
      const gain = ctx.createGain();
      src.connect(gain);
      gain.connect(ctx.destination);
      media._bachiMusicGain = gain;
      media._bachiMusicCtx = ctx;
      return gain;
    } catch (err) {
      return null;
    }
  }

  function applyMusicOutput(media) {
    if (!media) return;
    const plan = musicOutputPlan(musicVolumeState, !!media._bachiMusicGain);
    if (plan.useGraph) {
      const node = media._bachiMusicGain || ensureMusicGraph(media);
      if (node) {
        try { node.gain.value = plan.nodeGain; } catch (err) { /* closed context */ }
        try { media.volume = plan.elementVolume; } catch (err) { /* mock element */ }
        const ctx = media._bachiMusicCtx;
        if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {
          const pending = ctx.resume();
          if (pending && typeof pending.catch === "function") pending.catch(function () {});
        }
        return;
      }
    }
    try { media.volume = Math.min(1, plan.nodeGain); } catch (err) { /* element has no volume */ }
  }

  function formatVolume(value) {
    const rounded = Math.round((+value) * 100) / 100;
    return rounded + "%";
  }

  function paintReadouts() {
    if (typeof document === "undefined") return;
    const music = document.getElementById("editorMusicVolumeReadout");
    const drum = document.getElementById("editorDrumVolumeReadout");
    if (music) music.textContent = formatVolume(musicVolumeState);
    if (drum) drum.textContent = formatVolume(drumVolumeState);
  }

  function paint() {
    if (typeof document === "undefined") return;
    const music = document.getElementById("editorMusicVolume");
    const drum = document.getElementById("editorDrumVolume");
    if (music) music.value = String(musicVolumeState);
    if (drum) drum.value = String(drumVolumeState);
    paintReadouts();
  }

  function applyLive() {
    const song = typeof globalThis !== "undefined" ? globalThis.BachiOriginal : null;
    const media = song && typeof song.player === "function" ? song.player() : null;
    if (media) applyMusicOutput(media);
  }

  function setVolumes(music, drum) {
    if (music != null) volumePercentToGain(music);
    if (drum != null) volumePercentToGain(drum);
    if (music != null) musicVolumeState = +music;
    if (drum != null) drumVolumeState = +drum;
    paint();
    applyLive();
  }

  function onInput() {
    const music = document.getElementById("editorMusicVolume");
    const drum = document.getElementById("editorDrumVolume");
    const nextMusic = music ? +music.value : musicVolumeState;
    const nextDrum = drum ? +drum.value : drumVolumeState;
    if (!Number.isFinite(nextMusic) || nextMusic < 0 || !Number.isFinite(nextDrum) || nextDrum < 0) return;
    musicVolumeState = nextMusic;
    drumVolumeState = nextDrum;
    paintReadouts();
    applyLive();
  }

  function loadBundled(name) {
    if (soundCache[name]) return soundCache[name];
    const pending = fetch("assets/sounds/" + name + ".wav").then(function (res) {
      if (!res.ok) throw new Error("缺少 " + name + " 打点声");
      return res.arrayBuffer();
    }).then(function (buf) {
      return readWav(new Uint8Array(buf));
    });
    soundCache[name] = pending;
    pending.catch(function () { delete soundCache[name]; });
    return pending;
  }

  function decodeWithAudioContext(bytes) {
    const host = typeof window !== "undefined" ? window : globalThis;
    const AC = host.AudioContext || host.webkitAudioContext;
    if (!AC) return Promise.reject(new Error("这段原曲读不出来"));
    const ctx = new AC();
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new Promise(function (resolve, reject) {
      let ret;
      try {
        ret = ctx.decodeAudioData(copy, resolve, reject);
      } catch (err) {
        reject(err);
        return;
      }
      if (ret && typeof ret.then === "function") ret.then(resolve, reject);
    }).then(function (audio) {
      const channels = audio.numberOfChannels;
      const frames = audio.length;
      const data = new Float64Array(frames * channels);
      for (let c = 0; c < channels; c++) {
        const ch = audio.getChannelData(c);
        for (let i = 0; i < frames; i++) data[i * channels + c] = ch[i];
      }
      if (typeof ctx.close === "function") {
        const closed = ctx.close();
        if (closed && typeof closed.catch === "function") closed.catch(function () {});
      }
      return { sampleRate: audio.sampleRate, channels: channels, frames: frames, data: data };
    });
  }

  function decodeMusicFile(file) {
    return file.arrayBuffer().then(function (buf) {
      const bytes = new Uint8Array(buf);
      try {
        return readWav(bytes);
      } catch (err) {
        return decodeWithAudioContext(bytes);
      }
    });
  }

  function mixCurrentEditor() {
    const songApi = typeof globalThis !== "undefined" ? globalThis.BachiOriginal : null;
    const file = songApi && typeof songApi.getFile === "function" ? songApi.getFile() : null;
    const anim = typeof globalThis !== "undefined" ? globalThis.taikoAnim : null;
    const state = anim && anim.state ? anim.state : {};
    const events = state.events || [];
    const timeShift = Number.isFinite(+state.timeShift) ? +state.timeShift : 0;
    const sounds = Promise.all([loadBundled("don"), loadBundled("ka")]);
    const musicPromise = file ? decodeMusicFile(file) : Promise.resolve(null);
    return Promise.all([musicPromise, sounds]).then(function (parts) {
      const decoded = parts[0];
      const don = parts[1][0];
      const ka = parts[1][1];
      return exportChartMix({
        music: decoded || new Float64Array(0),
        musicRate: decoded ? decoded.sampleRate : null,
        events: events,
        don: don,
        ka: ka,
        timeShift: timeShift,
        musicVolume: musicVolumeState,
        drumVolume: drumVolumeState,
      });
    });
  }

  function downloadBytes(bytes, name) {
    if (typeof document === "undefined" || typeof URL === "undefined") return;
    const blob = new Blob([bytes], { type: "audio/wav" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      link.remove();
    }, 500);
  }

  function exportFromEditor() {
    const status = typeof document !== "undefined" ? document.getElementById("editorVolumeStatus") : null;
    if (status) status.textContent = "正在混音…";
    return mixCurrentEditor().then(function (mixed) {
      downloadBytes(encodeWav(mixed, mixed.sampleRate), "混音.wav");
      const songApi = typeof globalThis !== "undefined" ? globalThis.BachiOriginal : null;
      const file = songApi && typeof songApi.getFile === "function" ? songApi.getFile() : null;
      if (status) {
        status.textContent = file
          ? ("已导出。音乐 " + formatVolume(musicVolumeState) + "，鼓点 " + formatVolume(drumVolumeState) + "。")
          : ("已导出。还没打开原曲，音乐这一路是静音。鼓点 " + formatVolume(drumVolumeState) + "。");
      }
    }).catch(function (err) {
      if (status) status.textContent = (err && err.message) ? err.message : "混音失败";
    });
  }

  function mount() {
    if (mounted || typeof document === "undefined") return;
    const music = document.getElementById("editorMusicVolume");
    const drum = document.getElementById("editorDrumVolume");
    if (!music && !drum) return;
    mounted = true;
    if (music) music.addEventListener("input", onInput);
    if (drum) drum.addEventListener("input", onInput);
    const button = document.getElementById("editorExportMix");
    if (button) button.addEventListener("click", function () { exportFromEditor(); });
    if (music && music.value !== "") musicVolumeState = +music.value;
    if (drum && drum.value !== "") drumVolumeState = +drum.value;
    paintReadouts();
  }

  return {
    BIG_BOOST: BIG_BOOST,
    volumePercentToGain: volumePercentToGain,
    mixBuffers: mixBuffers,
    renderDrumStem: renderDrumStem,
    exportChartMix: exportChartMix,
    encodeWav: encodeWav,
    readWav: readWav,
    scaledHitGain: scaledHitGain,
    musicOutputPlan: musicOutputPlan,
    applyMusicOutput: applyMusicOutput,
    setVolumes: setVolumes,
    musicVolume: function () { return musicVolumeState; },
    drumVolume: function () { return drumVolumeState; },
    mixCurrentEditor: mixCurrentEditor,
    mount: mount,
  };
});
