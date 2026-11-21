/**
 * Chart-lane scroll.
 *
 * 流速 is a multiplier on pixels per second (1.1, 1.2, …). It applies
 * whether or not 变速 is on.
 *
 * 变速 on matches official Taiko (本家, normal / #NMSCROLL). Each note keeps
 * the BPM and #SCROLL in effect at its own hit and travels at constant speed:
 *
 *   px/s = basePxPerSec × (noteBpm / referenceBpm) × #SCROLL × 流速
 *
 * referenceBpm is the highest BPM on the timeline, not the opening one.
 * #SCROLL 1 at that tempo matches 变速 off. A chart whose header / first
 * bar is slower (第六天魔王 is BPM 150, then #SCROLL 2, and only afterwards
 * #BPMCHANGE 300) must not divide by 150: that made 150×2 and 300×1 both
 * twice the unit speed, so the opening ooo flew. Dividing by 300 keeps
 * 150×2, 75×4 and 300×1 at the unit speed, and 150×1 at half.
 * The note still keeps the BPM in effect at its own hit. Copying a later
 * #BPMCHANGE onto an earlier #SCROLL (150×2 becoming 300×2) is 600 and
 * flies. #MEASURE only sets how many quarter beats a bar lasts; it does
 * not change pixels per second. A later note with a higher product is
 * faster and can pass the one ahead. Speed stays the note's own product
 * even while playback is still in an earlier BPM.
 *
 * 变速 off is 等速 practice. #SCROLL is ignored and BPM does not change
 * pixels per second. Hit timing still follows BPM.
 *
 * Browser: window.ScrollTempo. Node: module.exports.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ScrollTempo = factory();
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  var SCROLL_STEP = 0.1;

  function roundTenth(n) {
    return Math.round((+n) * 10) / 10;
  }

  /** Slider values land on tenths, so 1.1 and 1.2 survive float noise. */
  function scrollFromControl(value, fallback) {
    var n = +value;
    if (!isFinite(n)) return fallback == null ? 1 : fallback;
    return roundTenth(n);
  }

  function formatScroll(n) {
    var x = +n;
    if (!isFinite(x)) return "1×";
    var tenth = roundTenth(x);
    var shown = Math.abs(x - tenth) < 1e-6 ? tenth : Math.round(x * 100) / 100;
    if (Math.abs(shown - Math.round(shown)) < 1e-6) return String(Math.round(shown)) + "×";
    if (Math.abs(shown * 10 - Math.round(shown * 10)) < 1e-6) return shown.toFixed(1) + "×";
    return String(shown) + "×";
  }

  function reachesScroll(min, max, step, target) {
    var t = +target, a = +min, b = +max, s = +step;
    if (!(s > 0) || t < a - 1e-9 || t > b + 1e-9) return false;
    var n = Math.round((t - a) / s);
    return Math.abs(a + n * s - t) < 1e-6;
  }

  function piecesOf(timeline) {
    return (timeline || []).map(function (p) {
      return { t: +p.t, duration: +p.duration, bpm: +p.bpm };
    }).filter(function (p) {
      return isFinite(p.t) && p.duration > 0 && p.bpm > 0;
    }).sort(function (a, b) { return a.t - b.t; });
  }

  /**
   * Highest timeline BPM. #SCROLL 1 there matches basePxPerSec.
   * The opening piece is often the song BPM and is slower than 基本 BPM.
   */
  function referenceBpm(timeline) {
    var pieces = piecesOf(timeline);
    var ref = 0;
    for (var i = 0; i < pieces.length; i++) {
      if (pieces[i].bpm > ref) ref = pieces[i].bpm;
    }
    return ref > 0 ? ref : 120;
  }

  /** BPM of the timeline piece that contains `tNote` (the piece that starts at a boundary wins). */
  function bpmAt(timeline, tNote) {
    var pieces = piecesOf(timeline);
    if (!pieces.length) return 0;
    var t = +tNote;
    if (!isFinite(t)) return pieces[0].bpm;
    var i;
    for (i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      if (t >= p.t - 1e-6 && t < p.t + p.duration - 1e-9) return p.bpm;
    }
    var prev = null;
    for (i = 0; i < pieces.length; i++) {
      if (pieces[i].t <= t + 1e-6) prev = pieces[i];
    }
    return prev ? prev.bpm : pieces[0].bpm;
  }

  function noteBpm(bpm, timeline, tNote, ref) {
    var b = +bpm;
    if (isFinite(b) && b > 0) return b;
    var looked = bpmAt(timeline, tNote);
    if (isFinite(looked) && looked > 0) return looked;
    return ref;
  }

  /**
   * Seconds from `now` to `tNote`, scaled like 本家 when 变速 is on.
   * Off: wall-clock delta (等速). On: delta × #SCROLL × (noteBpm / referenceBpm).
   * Missing scroll is 1. A non-positive BPM falls back to the reference.
   */
  function visualDelta(now, tNote, chartScroll, showTempo, bpm, refBpm) {
    var delta = +tNote - +now;
    if (!isFinite(delta)) return 0;
    if (!showTempo) return delta;
    var s = +chartScroll;
    if (!isFinite(s)) s = 1;
    var ref = +refBpm;
    if (!isFinite(ref) || ref <= 0) ref = 120;
    var b = +bpm;
    if (!isFinite(b) || b <= 0) b = ref;
    return delta * s * (b / ref);
  }

  function noteX(opts) {
    opts = opts || {};
    var scroll = isFinite(+opts.scroll) ? +opts.scroll : 1;
    var judgeX = isFinite(+opts.judgeX) ? +opts.judgeX : 0;
    var base = isFinite(+opts.basePxPerSec) ? +opts.basePxPerSec : 600;
    var ref = (opts.referenceBpm != null && isFinite(+opts.referenceBpm) && +opts.referenceBpm > 0)
      ? +opts.referenceBpm
      : referenceBpm(opts.timeline);
    var bpm = noteBpm(opts.bpm, opts.timeline, opts.tNote, ref);
    var delta = visualDelta(+opts.now, +opts.tNote, opts.chartScroll, !!opts.showTempo, bpm, ref);
    return judgeX + delta * base * scroll;
  }

  return {
    SCROLL_STEP: SCROLL_STEP,
    scrollFromControl: scrollFromControl,
    formatScroll: formatScroll,
    reachesScroll: reachesScroll,
    referenceBpm: referenceBpm,
    visualDelta: visualDelta,
    noteX: noteX,
  };
});
