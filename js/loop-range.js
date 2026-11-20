/**
 * Section loop on the existing playback clock.
 *
 * The progress bar selects a time range. When 循环 is on, playback and
 * 重来 stay inside that range. The chart's own rangeStart/rangeEnd — what
 * export and renderAt use — is never rewritten. This does not trim files.
 *
 * Snap: a nearby measure boundary wins over a closer beat; otherwise the
 * nearest beat. The song edges stay available so the range can return to
 * the whole song (lead-in through tail).
 *
 * Browser: window.LoopRange. Node: module.exports.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LoopRange = factory();
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  var SPEED_RATES = [0.25, 0.5, 0.75, 1];
  var DEFAULT_RATE = 1;
  // Measure magnet is wider than half a beat, so a bar line wins even when
  // the neighboring beat is slightly closer. Edges use a smaller magnet.
  var MEASURE_RADIUS_BEATS = 0.65;
  var EDGE_RADIUS_BEATS = 0.35;

  function defaultPlaybackRate() {
    return DEFAULT_RATE;
  }

  function speedRates() {
    return SPEED_RATES.slice();
  }

  /** Button row only. URL / export rates bypass this and may be any positive rate. */
  function rateFromSpeedButton(value, fallback) {
    var n = +value;
    if (SPEED_RATES.indexOf(n) >= 0) return n;
    return fallback == null ? DEFAULT_RATE : fallback;
  }

  function defaultLoopRange(songStart, songEnd) {
    return { start: +songStart, end: +songEnd };
  }

  function keyOf(t) {
    return Math.round(t * 1e6);
  }

  function uniqueSorted(times) {
    var sorted = (times || []).filter(function (t) { return isFinite(t); }).sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 0; i < sorted.length; i++) {
      if (!out.length || Math.abs(sorted[i] - out[out.length - 1]) > 1e-6) out.push(sorted[i]);
    }
    return out;
  }

  function piecesOf(chart) {
    var timeline = chart && chart.bpmTimeline;
    var src = (timeline && timeline.length) ? timeline : null;
    if (!src) {
      var measures = (chart && chart.measures) || [];
      src = measures.map(function (m) {
        var beats = m.beats > 0 ? m.beats : 4;
        var bpm = m.bpm > 0 ? m.bpm : (m.duration > 0 ? beats * 60 / m.duration : 120);
        return { t: +m.t, duration: +m.duration, bpm: bpm };
      });
    }
    return src.map(function (p) {
      return { t: +p.t, duration: +p.duration, bpm: +p.bpm };
    }).filter(function (p) {
      return isFinite(p.t) && p.duration > 0 && p.bpm > 0;
    }).sort(function (a, b) { return a.t - b.t; });
  }

  function buildSnapGrid(chart, songStart, songEnd) {
    var measures = ((chart && chart.measures) || []).slice().sort(function (a, b) {
      return a.t - b.t;
    });
    var measureTimes = [];
    for (var i = 0; i < measures.length; i++) {
      if (isFinite(+measures[i].t)) measureTimes.push(+measures[i].t);
    }
    if (measures.length) {
      var last = measures[measures.length - 1];
      if (isFinite(+last.t) && isFinite(+last.duration)) measureTimes.push(+last.t + +last.duration);
    }
    measureTimes = uniqueSorted(measureTimes);
    var measureKeys = {};
    for (var m = 0; m < measureTimes.length; m++) measureKeys[keyOf(measureTimes[m])] = true;

    var pieces = piecesOf(chart);
    var beatTimes = [];
    for (var p = 0; p < pieces.length; p++) {
      var piece = pieces[p];
      var beatDur = 60 / piece.bpm;
      if (!(beatDur > 0)) continue;
      var n = Math.round(piece.duration / beatDur);
      for (var k = 0; k <= n; k++) {
        var t = piece.t + k * beatDur;
        if (t < piece.t - 1e-6 || t > piece.t + piece.duration + 1e-6) continue;
        if (measureKeys[keyOf(t)]) continue;
        beatTimes.push(t);
      }
    }
    return {
      songStart: +songStart,
      songEnd: +songEnd,
      measureTimes: measureTimes,
      beatTimes: uniqueSorted(beatTimes),
      pieces: pieces,
    };
  }

  function localBeatDur(t, pieces, fallback) {
    var list = pieces || [];
    var dur = fallback > 0 ? fallback : 0.5;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var end = p.t + p.duration;
      var last = i === list.length - 1;
      if (t >= p.t - 1e-9 && (t < end - 1e-9 || (last && t <= end + 1e-9))) {
        if (p.bpm > 0) dur = 60 / p.bpm;
      }
    }
    return dur;
  }

  function nearest(t, times) {
    var best = null;
    var bestD = Infinity;
    for (var i = 0; i < times.length; i++) {
      var d = Math.abs(times[i] - t);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = times[i];
      }
    }
    return { time: best, dist: bestD };
  }

  function snapLoopTime(time, grid) {
    var songStart = +grid.songStart;
    var songEnd = +grid.songEnd;
    var t = +time;
    if (t < songStart) t = songStart;
    if (t > songEnd) t = songEnd;
    var beatDur = localBeatDur(t, grid.pieces, 0.5);
    var edgeR = EDGE_RADIUS_BEATS * beatDur;
    if (Math.abs(t - songStart) <= edgeR) return songStart;
    if (Math.abs(t - songEnd) <= edgeR) return songEnd;

    var measureHit = nearest(t, grid.measureTimes || []);
    if (measureHit.time != null && measureHit.dist <= MEASURE_RADIUS_BEATS * beatDur + 1e-9) {
      return measureHit.time;
    }
    var beatHit = nearest(t, grid.beatTimes || []);
    if (measureHit.time != null && (beatHit.time == null || measureHit.dist <= beatHit.dist)) {
      return measureHit.time;
    }
    if (beatHit.time != null) return beatHit.time;
    return t;
  }

  function previousPoint(limit, grid) {
    var pts = [grid.songStart].concat(grid.measureTimes || [], grid.beatTimes || []);
    var best = grid.songStart;
    for (var i = 0; i < pts.length; i++) {
      var t = pts[i];
      if (isFinite(t) && t < limit - 1e-6 && t >= best - 1e-9) best = t;
    }
    return best;
  }

  function nextPoint(limit, grid) {
    var pts = [grid.songEnd].concat(grid.measureTimes || [], grid.beatTimes || []);
    var best = grid.songEnd;
    for (var i = 0; i < pts.length; i++) {
      var t = pts[i];
      if (isFinite(t) && t > limit + 1e-6 && t <= best + 1e-9) best = t;
    }
    return best;
  }

  /**
   * Move one end of the range. `which` is "start" or "end".
   * The other end stays put. The result is always inside the song, start < end.
   */
  function dragLoopHandle(range, which, time, grid) {
    var start = +range.start;
    var end = +range.end;
    var snapped = snapLoopTime(time, grid);
    if (which === "start") {
      start = snapped;
      if (start >= end - 1e-6) start = previousPoint(end, grid);
      if (start < grid.songStart) start = grid.songStart;
      if (start > grid.songEnd) start = grid.songEnd;
    } else {
      end = snapped;
      if (end <= start + 1e-6) end = nextPoint(start, grid);
      if (end < grid.songStart) end = grid.songStart;
      if (end > grid.songEnd) end = grid.songEnd;
    }
    if (!(end > start)) end = Math.min(grid.songEnd, start + 1e-3);
    return { start: start, end: end };
  }

  /**
   * One realtime step. `realDt` is wall-clock seconds (the caller caps it).
   * Loop on: stay inside [loopStart, loopEnd] and keep playing.
   * Loop off: the full song, stop at songEnd.
   */
  function advancePlayback(now, realDt, opts) {
    var rate = isFinite(+opts.rate) ? +opts.rate : 1;
    var dt = isFinite(+realDt) ? +realDt : 0;
    var next = +now + dt * rate;
    var songStart = +opts.songStart;
    var songEnd = +opts.songEnd;
    if (opts.loop) {
      var a = +opts.loopStart;
      var b = +opts.loopEnd;
      var span = b - a;
      if (!(span > 1e-9)) return { now: a, playing: true, done: false };
      if (next < a) next = a;
      else if (next > b) {
        var rel = (next - a) % span;
        if (rel < 0) rel += span;
        next = rel === 0 ? a : a + rel;
      }
      return { now: next, playing: true, done: false };
    }
    if (next > songEnd) return { now: songEnd, playing: false, done: true };
    if (next < songStart) return { now: songStart, playing: true, done: false };
    return { now: next, playing: true, done: false };
  }

  /** 重来. Loop on → range start. Loop off → song start. */
  function restartTime(opts) {
    if (opts.loop) return +opts.loopStart;
    return +opts.songStart;
  }

  function timeFromClientX(clientX, left, width, songStart, songEnd) {
    var w = width > 0 ? width : 1;
    var u = (clientX - left) / w;
    if (u < 0) u = 0;
    if (u > 1) u = 1;
    return +songStart + u * (+songEnd - +songStart);
  }

  return {
    trimsFiles: false,
    defaultPlaybackRate: defaultPlaybackRate,
    speedRates: speedRates,
    rateFromSpeedButton: rateFromSpeedButton,
    defaultLoopRange: defaultLoopRange,
    buildSnapGrid: buildSnapGrid,
    localBeatDur: localBeatDur,
    snapLoopTime: snapLoopTime,
    dragLoopHandle: dragLoopHandle,
    advancePlayback: advancePlayback,
    restartTime: restartTime,
    timeFromClientX: timeFromClientX,
  };
});
