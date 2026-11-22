/**
 * Preview don/ka hits while the page is playing.
 *
 * Same bundled samples as export (assets/sounds/don.wav, ka.wav) and the
 * same big-note boost as mixHitAudio (BIG_BOOST, 1.25). One sound per
 * chart time + face: the key is t.toFixed(6) + ":" + face, and the first
 * event in order wins, matching mixHitAudio's seen-set.
 *
 * event.t is already an audio time (OFFSET was subtracted once at parse).
 * Compare it to the playhead. Do not subtract OFFSET again.
 *
 * Call advance() only from the realtime clock, when playback moves the
 * playhead. Seeking, scrubbing, pausing, and renderAt must not call it.
 * A forward jump larger than this frame's chart step (section snap) is
 * silent. Export capture (?export=1 / body.export) never starts audio;
 * ffmpeg muxes the soundtrack later.
 *
 * Browser: window.PreviewHits. Node: module.exports.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PreviewHits = api;
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  var BIG_BOOST = 1.25;
  var SOUND_BASE = "assets/sounds/";

  function faceOf(event) {
    return event && event.face === "ka" ? "ka" : "don";
  }

  function hitKey(event) {
    return (+event.t).toFixed(6) + ":" + faceOf(event);
  }

  /**
   * Notes in the chart-time window. `inclusiveFrom` selects [from, to]
   * instead of (from, to]. The end is inclusive only once the playhead
   * has reached the note (t <= to), matching the on-screen hit
   * (now - event.t >= 0). Do not add slack past `to`: a frame that lands
   * a fraction early must wait, or the sample plays before the picture.
   * Shared `seen` collapses same-time same-face hits.
   */
  function collect(events, from, to, inclusiveFrom, bigBoost, seen, out) {
    var boost = bigBoost == null ? BIG_BOOST : +bigBoost;
    var list = events || [];
    for (var i = 0; i < list.length; i++) {
      var event = list[i];
      if (!event) continue;
      var t = +event.t;
      if (!isFinite(t)) continue;
      var after = inclusiveFrom ? t + 1e-9 >= from : t > from;
      if (!after || t > to) continue;
      var key = t.toFixed(6) + ":" + faceOf(event);
      if (seen[key]) continue;
      seen[key] = true;
      var big = !!event.big;
      out.push({
        t: t,
        face: faceOf(event),
        big: big,
        gain: big ? boost : 1,
      });
    }
  }

  function withinClip(hit, opts) {
    if (opts.clipStart != null && isFinite(+opts.clipStart) && hit.t < +opts.clipStart - 1e-6) return false;
    if (opts.clipEnd != null && isFinite(+opts.clipEnd) && hit.t > +opts.clipEnd + 1e-6) return false;
    return true;
  }

  /**
   * Hits the playhead crosses while playing from `prev` to `next`
   * (chart seconds, same units as event.t).
   *
   * opts.playing === false, opts.enabled === false, or opts.exporting:
   *   nothing (pause / mute / export capture).
   * opts.loop and next < prev: a loop wrap. Fire the tail up to loopEnd
   *   and the head from loopStart, limited to this frame's chart step.
   * opts.maxStep: chart seconds this frame was allowed to move
   *   (wall dt × playback rate). A larger forward jump is a snap, not a
   *   cross, so it stays silent.
   */
  function hitsForPlaybackStep(events, prev, next, opts) {
    opts = opts || {};
    if (opts.playing === false || opts.enabled === false || opts.exporting) return [];
    var from = +prev;
    var to = +next;
    if (!isFinite(from) || !isFinite(to)) return [];
    if (Math.abs(to - from) < 1e-12) return [];

    var budget = (opts.maxStep == null || !isFinite(+opts.maxStep)) ? Infinity : Math.max(0, +opts.maxStep);
    var boost = opts.bigBoost;
    var seen = {};
    var out = [];

    if (to + 1e-9 < from) {
      if (!opts.loop) return [];
      var loopEnd = +opts.loopEnd;
      var loopStart = +opts.loopStart;
      if (!isFinite(loopEnd) || !isFinite(loopStart)) return [];
      var tailBudget = 0;
      if (from <= loopEnd + 1e-9 && loopEnd - from <= budget + 1e-4 && loopEnd > from) {
        tailBudget = Math.max(0, loopEnd - from);
        collect(events, from, loopEnd, false, boost, seen, out);
      }
      var headBudget = Math.max(0, budget - tailBudget);
      if (headBudget > 1e-9) {
        var headFrom = to - headBudget;
        if (headFrom < loopStart) headFrom = loopStart;
        if (headFrom <= to + 1e-9) collect(events, headFrom, to, true, boost, seen, out);
      }
    } else {
      if (to - from > budget + 1e-4) return [];
      collect(events, from, to, false, boost, seen, out);
    }

    if (opts.clipStart != null || opts.clipEnd != null) {
      out = out.filter(function (hit) { return withinClip(hit, opts); });
    }
    return out;
  }

  function isExportCapture(doc, search) {
    if (doc && doc.body && doc.body.classList && doc.body.classList.contains("export")) return true;
    var q = search == null && typeof location !== "undefined" ? location.search : search;
    if (q == null) return false;
    try {
      return new URLSearchParams(String(q)).get("export") === "1";
    } catch (err) {
      return /(?:^|[?&])export=1(?:&|$)/.test(String(q));
    }
  }

  function mount(doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    var enabled = true;
    var ctx = null;
    var ctxFailed = false;
    var buffers = { don: null, ka: null };
    var loading = null;
    var pending = [];
    var playCount = 0;

    function exporting() {
      return isExportCapture(doc, typeof location !== "undefined" ? location.search : "");
    }

    function boxes() {
      if (!doc || !doc.querySelectorAll) return [];
      return Array.prototype.slice.call(doc.querySelectorAll("[data-preview-hits]"));
    }

    function syncBoxes() {
      boxes().forEach(function (el) { el.checked = enabled; });
    }

    if (boxes().length) enabled = !!boxes()[0].checked;

    function ensureCtx() {
      if (exporting() || ctxFailed) return null;
      if (ctx) return ctx;
      var host = typeof window !== "undefined" ? window : null;
      var AC = host && (host.AudioContext || host.webkitAudioContext);
      if (!AC) { ctxFailed = true; return null; }
      try { ctx = new AC(); }
      catch (err) { ctxFailed = true; return null; }
      return ctx;
    }

    function decode(ac, raw) {
      return new Promise(function (resolve, reject) {
        var copy = raw.slice(0);
        var ret;
        try {
          ret = ac.decodeAudioData(copy, resolve, reject);
        } catch (err) {
          reject(err);
          return;
        }
        if (ret && typeof ret.then === "function") ret.then(resolve, reject);
      });
    }

    function load() {
      if (exporting()) return Promise.resolve(false);
      if (buffers.don && buffers.ka) return Promise.resolve(true);
      if (loading) return loading;
      var ac = ensureCtx();
      if (!ac) {
        loading = Promise.resolve(false);
        return loading;
      }
      loading = Promise.all(["don", "ka"].map(function (name) {
        return fetch(SOUND_BASE + name + ".wav").then(function (res) {
          if (!res.ok) throw new Error(name);
          return res.arrayBuffer();
        }).then(function (raw) {
          return decode(ac, raw);
        }).then(function (audio) {
          buffers[name] = audio;
        });
      })).then(function () { return true; }).catch(function () {
        loading = null;
        return false;
      });
      return loading;
    }

    function unlock() {
      if (exporting() || !enabled) return;
      var ac = ensureCtx();
      if (ac && ac.state === "suspended" && typeof ac.resume === "function") {
        var resumed = ac.resume();
        if (resumed && typeof resumed.catch === "function") resumed.catch(function () {});
      }
      load();
    }

    function playOne(hit) {
      var ac = ensureCtx();
      if (!ac) return;
      var buf = buffers[hit.face === "ka" ? "ka" : "don"];
      if (!buf) return;
      try {
        var src = ac.createBufferSource();
        src.buffer = buf;
        var gain = ac.createGain();
        var level = hit.gain;
        var volumes = typeof globalThis !== "undefined" ? globalThis.TaikoVolume : null;
        if (volumes && typeof volumes.scaledHitGain === "function") level = volumes.scaledHitGain(hit.gain);
        gain.gain.value = level;
        src.connect(gain);
        gain.connect(ac.destination);
        src.start();
        playCount += 1;
      } catch (err) { /* headless or a closed context: scheduling still happened */ }
    }

    function flushPending() {
      var queued = pending;
      pending = [];
      if (!queued.length || exporting() || !enabled) return;
      for (var i = 0; i < queued.length; i++) playOne(queued[i]);
    }

    function playAll(hits) {
      if (exporting() || !enabled) return;
      if (!buffers.don || !buffers.ka) {
        pending = hits.slice();
        load().then(function (ok) { if (ok) flushPending(); });
        return;
      }
      for (var i = 0; i < hits.length; i++) playOne(hits[i]);
    }

    function emit(hits, now) {
      if (!doc || typeof doc.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
      for (var i = 0; i < hits.length; i++) {
        doc.dispatchEvent(new CustomEvent("bachimotion:preview-hit", {
          detail: {
            t: hits[i].t,
            face: hits[i].face,
            gain: hits[i].gain,
            big: hits[i].big,
            now: now,
          },
        }));
      }
    }

    function cancelPending() { pending = []; }

    function setEnabled(on) {
      enabled = !!on;
      syncBoxes();
      if (enabled) unlock();
      else cancelPending();
    }

    boxes().forEach(function (el) {
      el.addEventListener("change", function () { setEnabled(el.checked); });
    });

    function advance(events, prev, next, stepOpts) {
      var step = stepOpts || {};
      var hits = hitsForPlaybackStep(events, prev, next, {
        playing: step.playing !== false,
        enabled: enabled && step.enabled !== false,
        exporting: exporting() || !!step.exporting,
        loop: !!step.loop,
        loopStart: step.loopStart,
        loopEnd: step.loopEnd,
        clipStart: step.clipStart,
        clipEnd: step.clipEnd,
        maxStep: step.maxStep,
        bigBoost: step.bigBoost,
      });
      if (!hits.length) return hits;
      emit(hits, +next);
      playAll(hits);
      return hits;
    }

    if (!exporting()) load();

    return {
      advance: advance,
      unlock: unlock,
      cancelPending: cancelPending,
      setEnabled: setEnabled,
      isEnabled: function () { return enabled; },
      isExporting: exporting,
      usingAudio: function () { return !!ctx; },
      buffersReady: function () { return !!(buffers.don && buffers.ka); },
      playCount: function () { return playCount; },
    };
  }

  var player = null;
  if (typeof document !== "undefined") player = mount(document);

  return {
    BIG_BOOST: BIG_BOOST,
    hitKey: hitKey,
    hitsForPlaybackStep: hitsForPlaybackStep,
    isExportCapture: isExportCapture,
    mount: mount,
    player: player,
  };
});
