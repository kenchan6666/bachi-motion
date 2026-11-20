/**
 * Title-bar BPM display.
 *
 * Rule (溯溯):
 *   1. Split the chart into segments of continuously unchanged BPM.
 *      A segment may span many measures. Adjacent #BPMCHANGE with the
 *      same value are merged. Mid-measure changes are their own pieces;
 *      we never count TJA lines.
 *   2. Drop any segment whose duration is shorter than one measure at
 *      that segment's own BPM and #MEASURE.
 *   3. If #MEASURE changes inside a constant-BPM segment, convert each
 *      piece to measure-units (duration / (beats × 60 / BPM)) and sum
 *      them. Keep the segment when the sum is ≥ 1. Do not use a single
 *      "last" or "longest" time signature as a one-shot threshold.
 *   4. Of the segments that remain, show min–max. One distinct value
 *      (even if that BPM appears in several non-adjacent segments)
 *      is written as a single number.
 *   5. If nothing remains, use the BPM whose total duration (summed
 *      across non-adjacent pieces, before the filter) is longest. Ties
 *      go to the one that appears first.
 *
 * Input pieces come from the parser's `bpmTimeline`:
 *   { t, duration, bpm, beats }  where `beats` is quarter-note beats in
 *   the current time signature, i.e. (MEASURE.num / MEASURE.den) × 4.
 *
 * Works in the browser (window.TitleBarBpm) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TitleBarBpm = factory();
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const BPM_EQ = 0.05;
  const UNIT_EPS = 1e-9;

  function almostEqualBpm(a, b) {
    return Math.abs(a - b) <= BPM_EQ;
  }

  /** duration / (beats × 60 / bpm) */
  function measureUnits(piece) {
    const beats = +piece.beats;
    const bpm = +piece.bpm;
    const dur = +piece.duration;
    if (!isFinite(beats) || beats <= 0 || !isFinite(bpm) || bpm <= 0 || !isFinite(dur) || dur <= 0) {
      return 0;
    }
    return dur * bpm / (beats * 60);
  }

  /**
   * Merge adjacent pieces that share the same BPM (time signature may
   * change mid-segment; pieces are kept so measure-units can be summed).
   */
  function mergeBpmSegments(pieces) {
    const src = Array.isArray(pieces) ? pieces : [];
    const segs = [];
    for (let i = 0; i < src.length; i++) {
      const p = src[i];
      const bpm = +p.bpm;
      const duration = +p.duration;
      if (!isFinite(bpm) || bpm <= 0 || !isFinite(duration) || duration <= 0) continue;
      const piece = {
        t: +p.t || 0,
        duration,
        bpm,
        beats: +p.beats,
      };
      const last = segs[segs.length - 1];
      if (last && almostEqualBpm(last.bpm, piece.bpm)) {
        last.duration += piece.duration;
        last.pieces.push(piece);
        last.measureUnits += measureUnits(piece);
      } else {
        segs.push({
          t: piece.t,
          duration: piece.duration,
          bpm: piece.bpm,
          pieces: [piece],
          measureUnits: measureUnits(piece),
        });
      }
    }
    return segs;
  }

  function keepLongEnough(segments) {
    return (segments || []).filter(function (s) {
      return s.measureUnits >= 1 - UNIT_EPS;
    });
  }

  /** BPM with the longest total duration; ties go to the earliest appearance. */
  function longestTotalBpm(segments) {
    const buckets = [];
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      let hit = null;
      for (let j = 0; j < buckets.length; j++) {
        if (almostEqualBpm(buckets[j].bpm, s.bpm)) { hit = buckets[j]; break; }
      }
      if (hit) hit.duration += s.duration;
      else buckets.push({ bpm: s.bpm, duration: s.duration });
    }
    if (!buckets.length) return NaN;
    let best = buckets[0];
    for (let i = 1; i < buckets.length; i++) {
      if (buckets[i].duration > best.duration + 1e-12) best = buckets[i];
    }
    return best.bpm;
  }

  function fmtBpmNum(n) {
    if (!isFinite(n)) return "";
    if (Math.abs(n - Math.round(n)) < 0.15) return String(Math.round(n));
    const s = (Math.round(n * 10) / 10).toString();
    return s;
  }

  function formatBpmValue(lo, hi) {
    if (!isFinite(lo) && !isFinite(hi)) return "";
    if (!isFinite(lo)) lo = hi;
    if (!isFinite(hi)) hi = lo;
    if (hi - lo > BPM_EQ) return "BPM " + fmtBpmNum(lo) + "–" + fmtBpmNum(hi);
    return "BPM " + fmtBpmNum(lo);
  }

  function displayBpmFromPieces(pieces) {
    const segs = mergeBpmSegments(pieces);
    if (!segs.length) return { text: "", lo: NaN, hi: NaN, kept: [], dropped: [], fallback: false };
    const kept = keepLongEnough(segs);
    const dropped = segs.filter(function (s) { return kept.indexOf(s) < 0; });
    let used = kept;
    let fallback = false;
    if (!used.length) {
      const bpm = longestTotalBpm(segs);
      used = [{ t: segs[0].t, duration: segs.reduce(function (n, s) { return n + (almostEqualBpm(s.bpm, bpm) ? s.duration : 0); }, 0), bpm: bpm, pieces: [], measureUnits: 0 }];
      fallback = true;
    }
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < used.length; i++) {
      const b = +used[i].bpm;
      if (b < lo) lo = b;
      if (b > hi) hi = b;
    }
    return {
      text: formatBpmValue(lo, hi),
      lo: lo,
      hi: hi,
      kept: kept,
      dropped: dropped,
      fallback: fallback,
      segments: segs,
    };
  }

  /**
   * Public formatter used by the title bar.
   * Prefers `data.bpmTimeline` from the parser; falls back to `data.bpm`.
   */
  function formatDisplayBpm(data) {
    if (!data) return "";
    const timeline = data.bpmTimeline;
    if (Array.isArray(timeline) && timeline.length) {
      return displayBpmFromPieces(timeline).text;
    }
    const start = +data.bpm;
    return isFinite(start) && start > 0 ? "BPM " + fmtBpmNum(start) : "";
  }

  return {
    BPM_EQ: BPM_EQ,
    measureUnits: measureUnits,
    mergeBpmSegments: mergeBpmSegments,
    keepLongEnough: keepLongEnough,
    longestTotalBpm: longestTotalBpm,
    fmtBpmNum: fmtBpmNum,
    displayBpmFromPieces: displayBpmFromPieces,
    formatDisplayBpm: formatDisplayBpm,
  };
});
