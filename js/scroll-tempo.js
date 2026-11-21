/**
 * Chart-lane scroll.
 *
 * 流速 is a multiplier on pixels per second (1.1, 1.2, …). It applies
 * whether or not 变速 is on.
 *
 * 变速 on follows the chart #SCROLL. Each note keeps the scroll in effect
 * at its own hit time and travels at basePxPerSec × that scroll × 流速.
 * BPM does not change pixels per second: #BPMCHANGE only decides when the
 * note is hit. A later note with a higher #SCROLL moves faster, so the gap
 * to the note ahead shrinks and notes with different scrolls can pass.
 *
 * 变速 off is 等速 practice. #SCROLL is ignored and pixels per second stay
 * constant. Hit timing still follows BPM. A chart whose #SCROLL stays 1
 * looks the same either way.
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

  /** Opening timeline BPM. Lane X does not use it; #BPMCHANGE only sets hit times. */
  function referenceBpm(timeline) {
    var pieces = piecesOf(timeline);
    return pieces.length ? pieces[0].bpm : 120;
  }

  /**
   * Seconds from `now` to `tNote`, times the note's own #SCROLL when 变速 is on.
   * Off: wall-clock delta (等速). On: that delta × the note's chart scroll.
   * Missing scroll is 1. BPM is not part of this scale.
   */
  function visualDelta(now, tNote, chartScroll, showTempo) {
    var delta = +tNote - +now;
    if (!isFinite(delta)) return 0;
    if (!showTempo) return delta;
    var s = +chartScroll;
    if (!isFinite(s)) s = 1;
    return delta * s;
  }

  function noteX(opts) {
    opts = opts || {};
    var scroll = isFinite(+opts.scroll) ? +opts.scroll : 1;
    var judgeX = isFinite(+opts.judgeX) ? +opts.judgeX : 0;
    var base = isFinite(+opts.basePxPerSec) ? +opts.basePxPerSec : 600;
    var delta = visualDelta(+opts.now, +opts.tNote, opts.chartScroll, !!opts.showTempo);
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
