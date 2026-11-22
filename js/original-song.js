"use strict";

/**
 * One original-song file, chosen only in the hand-order editor's 「高级」.
 * The 「原曲」 switches sit beside 「叠打点声」 on the homepage and in the
 * editor preview. They do not pick a file. They share one state and only
 * decide whether preview and export use the file already chosen.
 * No file → the switches are disabled. Off, or no file → preview and export
 * stay silent here. On, and a file is chosen → preview and 「生成 / 播放」
 * play that file. Opening the editor and coming back does not clear the
 * file, the switches, or the loaded audio.
 *
 * Chart time is already an audio time (OFFSET subtracted once at parse).
 * Playback lines the file up at state.now + timeShift, which is chartStart
 * when the picture starts (first note − 0.7). Do not subtract OFFSET again.
 * Don/ka hits are a separate mix and are not touched here.
 */
(function (factory) {
  const api = factory();
  const root = typeof globalThis !== "undefined" ? globalThis : window;
  root.BachiOriginal = api;
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { api.mount(); });
    } else {
      api.mount();
    }
  }
})(function () {
  const SWITCH_LABEL = "原曲";
  const EXPLAIN = [
    "原曲文件在手顺编辑器的「高级」里选。这个开关只决定预览和出片用不用已经选好的那一首。还没选原曲时，开关不能点。",
    "打开并且已经选好，预览和「生成 / 播放」会一起放这首，从第一个音 − 0.7 秒对齐。没选，或开关关着，就不播原曲。从主页切到编辑谱面再回来，开关和这首都还在，不用重新选，也不用重新打开。",
  ];
  const ACCEPT = "audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.opus,.mp4";
  const DRIFT_SEC = 0.08;

  let currentFile = null;
  let useOriginal = false;
  let objectUrl = null;
  let attachedUrl = null;
  let audioEl = null;
  let mounted = false;
  let holdLeadIn = false;
  let lastSeekMs = 0;
  let lastSeekTarget = null;

  function selectionView(file) {
    if (!file) return { name: "", clear: false };
    return { name: String(file.name || ""), clear: true };
  }

  /** 「原曲」 switches beside 「叠打点声」. Disabled until a file is chosen. */
  function controlView(file, enabled) {
    const selected = !!file;
    return {
      label: SWITCH_LABEL,
      disabled: !selected,
      checked: !!(selected && enabled),
    };
  }

  /**
   * The file preview and export should hear.
   * Off, or no file → null. Callers must not invent a song.
   */
  function activeFile() {
    return useOriginal && currentFile ? currentFile : null;
  }

  function isEnabled() {
    return !!(useOriginal && currentFile);
  }

  /**
   * Preview clock for this file, or null when the switch is off / no file.
   * Alignment stays previewClock: chart time, not a second OFFSET.
   */
  function playbackTarget(file, enabled, clock) {
    if (!enabled || !file) return null;
    return previewClock(file, clock);
  }

  /**
   * Where the original file should be while the picture is at `clock.now`.
   * `offset` is accepted and ignored.
   * Returns null when there is no file — callers must not invent a BGM.
   */
  function previewClock(file, clock) {
    if (!file) return null;
    clock = clock || {};
    const now = Number.isFinite(+clock.now) ? +clock.now : 0;
    const rate = Number.isFinite(+clock.rate) && +clock.rate > 0 ? +clock.rate : 1;
    const timeShift = Number.isFinite(+clock.timeShift) ? +clock.timeShift : 0;
    const audioTime = now + timeShift;
    return {
      currentTime: Math.max(0, audioTime),
      playbackRate: rate,
      play: !!clock.playing && audioTime >= -1e-6,
    };
  }

  function applyPreview(media, target, opts) {
    if (!media || !target) return;
    opts = opts || {};
    if (media.playbackRate !== target.playbackRate) {
      try { media.playbackRate = target.playbackRate; } catch (err) { /* rate outside the element range */ }
    }
    const drift = Math.abs((+media.currentTime || 0) - target.currentTime);
    const seek = opts.allowSeek ? opts.allowSeek(drift) : drift > DRIFT_SEC;
    if (seek) {
      try { media.currentTime = target.currentTime; } catch (err) { /* metadata not ready */ }
    }
    if (target.play) {
      const blocked = media._bachiPlayBlockedUntil && Date.now() < media._bachiPlayBlockedUntil;
      if (media.paused && !opts.skipPlay && !media._bachiPlayPending && !blocked && typeof media.play === "function") {
        media._bachiPlayPending = true;
        let pending = null;
        try { pending = media.play(); }
        catch (err) { media._bachiPlayPending = false; return; }
        if (pending && typeof pending.then === "function") {
          pending.then(function () { media._bachiPlayPending = false; }, function () {
            media._bachiPlayPending = false;
            media._bachiPlayBlockedUntil = Date.now() + 1000;
          });
        } else {
          media._bachiPlayPending = false;
        }
      }
    } else if (!media.paused && typeof media.pause === "function") {
      media.pause();
    }
  }

  function exporting() {
    return typeof document !== "undefined" && document.body && document.body.classList.contains("export");
  }

  function renderViews() {
    if (typeof document === "undefined") return;
    const view = selectionView(currentFile);
    const control = controlView(currentFile, useOriginal);
    document.querySelectorAll("[data-original-use]").forEach(function (el) {
      el.disabled = control.disabled;
      el.checked = control.checked;
    });
    document.querySelectorAll("[data-original-name]").forEach(function (el) {
      el.textContent = view.name;
    });
    document.querySelectorAll("[data-original-chosen]").forEach(function (el) {
      el.hidden = !view.clear;
    });
  }

  function clockFromAnim() {
    const anim = typeof window !== "undefined" ? window.taikoAnim : null;
    const state = anim && anim.state;
    if (!state) return null;
    return {
      now: state.now,
      playing: !!state.playing,
      rate: state.rate,
      timeShift: state.timeShift,
      offset: state.offset,
    };
  }

  function syncPlayback(clock) {
    if (exporting()) return;
    const file = activeFile();
    if (!file || !audioEl) {
      holdLeadIn = false;
      if (audioEl && !audioEl.paused) audioEl.pause();
      return;
    }
    const target = playbackTarget(file, true, clock);
    if (!target) return;
    if (target.play) audioEl.muted = false;
    const nowMs = Date.now();
    const playBlocked = audioEl._bachiPlayBlockedUntil && nowMs < audioEl._bachiPlayBlockedUntil;
    applyPreview(audioEl, target, {
      skipPlay: (holdLeadIn && !target.play) || playBlocked,
      allowSeek: function (drift) {
        if (drift <= DRIFT_SEC) return false;
        // Seeking before metadata is ready is ignored and would block the
        // real seek. Wait until the element can hold a currentTime.
        if (!audioEl || audioEl.readyState < 1) return false;
        // A loop or a scrub moves the target. A seek that has not landed yet
        // does not, so leave that one alone until the element can apply it.
        const jumped = lastSeekTarget == null || Math.abs(target.currentTime - lastSeekTarget) > 0.45;
        // A new file reloads at 0 after we already sought. Seek again.
        const reloaded = target.currentTime > 0.5 && (+audioEl.currentTime || 0) < 0.05;
        if (reloaded && nowMs - lastSeekMs < 80) return false;
        if (!jumped && !reloaded && nowMs - lastSeekMs < 250) return false;
        lastSeekMs = nowMs;
        lastSeekTarget = target.currentTime;
        return true;
      },
    });
    // Lead-in (chart time still before the song): unlock playback on the
    // click, muted, then pause so the file does not start early.
    if (clock && clock.playing && !target.play && !holdLeadIn && !playBlocked) {
      holdLeadIn = true;
      audioEl.muted = true;
      let pending = null;
      try { pending = audioEl.play(); }
      catch (err) { holdLeadIn = false; return; }
      const hold = function () {
        if (!audioEl || !currentFile) return;
        const live = clockFromAnim() || clock;
        const again = playbackTarget(currentFile, useOriginal, live);
        if (!again || !again.play) audioEl.pause();
        audioEl.muted = false;
      };
      if (pending && typeof pending.then === "function") {
        pending.then(hold, function () {
          holdLeadIn = false;
          if (audioEl) audioEl._bachiPlayBlockedUntil = Date.now() + 1000;
        });
      } else {
        hold();
      }
    }
    if (!clock || !clock.playing || target.play) holdLeadIn = false;
    const volumes = typeof globalThis !== "undefined" ? globalThis.TaikoVolume : null;
    if (audioEl && volumes && typeof volumes.applyMusicOutput === "function") {
      volumes.applyMusicOutput(audioEl);
    }
  }

  function publishFromAnim() {
    const clock = clockFromAnim();
    if (clock) syncPlayback(clock);
  }

  function ensureAudio() {
    if (audioEl || typeof Audio !== "function") return audioEl;
    audioEl = new Audio();
    audioEl.preload = "auto";
    audioEl.addEventListener("loadedmetadata", function () {
      lastSeekTarget = null;
      lastSeekMs = 0;
      publishFromAnim();
    });
    return audioEl;
  }

  function retireUrl(url) {
    if (!url || typeof URL === "undefined" || !URL.revokeObjectURL) return;
    // Revoke only after the element has moved on to another src. Doing it
    // while Chrome is still seeking that blob can kill the renderer.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function setEnabled(on) {
    useOriginal = !!on && !!currentFile;
    renderViews();
    publishFromAnim();
    return useOriginal;
  }

  function setFile(file) {
    const next = file || null;
    currentFile = next;
    if (!currentFile) useOriginal = false;
    holdLeadIn = false;
    lastSeekMs = 0;
    lastSeekTarget = null;
    const audio = ensureAudio();
    if (audio) {
      audio.pause();
      audio.muted = false;
      audio._bachiPlayPending = false;
      audio._bachiPlayBlockedUntil = 0;
      if (next && typeof URL !== "undefined" && URL.createObjectURL) {
        const created = URL.createObjectURL(next);
        const retiring = attachedUrl;
        attachedUrl = created;
        objectUrl = created;
        audio.src = created;
        if (retiring && retiring !== created) retireUrl(retiring);
      } else {
        objectUrl = null;
        // Keep the element and its current blob. Playback stays off because
        // there is no selected file. The blob is released on the next choice.
      }
    } else {
      objectUrl = null;
    }
    renderViews();
    publishFromAnim();
    return currentFile;
  }

  function mount() {
    if (mounted || typeof document === "undefined") return;
    mounted = true;
    document.querySelectorAll("[data-original-song]").forEach(function (input) {
      input.addEventListener("change", function () {
        const file = input.files && input.files[0];
        if (file) setFile(file);
        input.value = "";
      });
    });
    document.querySelectorAll("[data-original-clear]").forEach(function (btn) {
      btn.addEventListener("click", function () { setFile(null); });
    });
    document.querySelectorAll("[data-original-use]").forEach(function (input) {
      input.addEventListener("change", function () {
        setEnabled(input.checked);
      });
    });
    renderViews();
  }

  return {
    SWITCH_LABEL: SWITCH_LABEL,
    EXPLAIN: EXPLAIN,
    ACCEPT: ACCEPT,
    selectionView: selectionView,
    controlView: controlView,
    playbackTarget: playbackTarget,
    previewClock: previewClock,
    applyPreview: applyPreview,
    mount: mount,
    setFile: setFile,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    activeFile: activeFile,
    getFile: function () { return currentFile; },
    syncPlayback: syncPlayback,
    player: function () { return audioEl; },
  };
});
