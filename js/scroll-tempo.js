/**
 * Chart-lane scroll.
 *
 * 流速 is a multiplier on pixels per second (1.1, 1.2, …).
 * 变速, when on, makes that speed follow the chart BPM: a quarter note
 * keeps the same pixel width as at the opening tempo, so a faster section
 * moves faster. When off, pixels per second stay constant (the old lane).
 * A chart with one BPM looks the same either way, because the reference
 * tempo is the first timeline piece.
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

  function referenceBpm(timeline) {
    var pieces = piecesOf(timeline);
    return pieces.length ? pieces[0].bpm : 120;
  }

  /**
   * Visual seconds from `now` to `tNote`.
   * Off: wall-clock delta. On: each BPM piece is scaled by bpm/reference,
   * and time outside the timeline stays at the opening tempo (scale 1).
   */
  function visualDelta(now, tNote, timeline, showTempo) {
    var sign = tNote >= now ? 1 : -1;
    var a = Math.min(+now, +tNote);
    var b = Math.max(+now, +tNote);
    if (!(b > a)) return 0;
    if (!showTempo) return (b - a) * sign;
    var pieces = piecesOf(timeline);
    var ref = referenceBpm(timeline);
    var acc = 0;
    var cursor = a;
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      var ps = p.t;
      var pe = p.t + p.duration;
      if (pe <= cursor + 1e-12) continue;
      if (ps >= b - 1e-12) break;
      if (ps > cursor) {
        var gapEnd = Math.min(ps, b);
        acc += gapEnd - cursor;
        cursor = gapEnd;
      }
      if (cursor >= b) break;
      var segEnd = Math.min(pe, b);
      if (segEnd > cursor) {
        acc += (segEnd - cursor) * (p.bpm / ref);
        cursor = segEnd;
      }
    }
    if (cursor < b) acc += b - cursor;
    return acc * sign;
  }

  function noteX(opts) {
    opts = opts || {};
    var scroll = isFinite(+opts.scroll) ? +opts.scroll : 1;
    var judgeX = isFinite(+opts.judgeX) ? +opts.judgeX : 0;
    var base = isFinite(+opts.basePxPerSec) ? +opts.basePxPerSec : 600;
    var delta = visualDelta(+opts.now, +opts.tNote, opts.timeline, !!opts.showTempo);
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
