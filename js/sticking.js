/**
 * Auto-sticking (谱面音符 → 手顺) pure function.
 *
 * Rules follow suyue@ebd21a0:
 *   资料/手顺规则说明.md
 *   资料/手顺规则用例.json
 *
 *   autoSticking(notes, { bpm, 手法, 惯用手, 滚奏, 补16分洞 })
 *     → { hands, rollPairs, warnings, insertedNotes? }
 *
 * Browser and Node both load this file (same IIFE pattern as other js/ modules).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BachiSticking = factory();
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  var EPS = 1e-9;
  var DIV_EPS = 1e-4;
  var DOWNBEAT_EPS = 1e-6;
  var DEFAULT_手法 = "全换";
  var DEFAULT_惯用手 = "R";
  var DEFAULT_滚奏 = "自动滚奏";

  function ge(a, b) { return a >= b - EPS; }
  function le(a, b) { return a <= b + EPS; }
  function gt(a, b) { return a > b + EPS; }
  function lt(a, b) { return a < b - EPS; }
  function near(a, b, eps) { return Math.abs(a - b) <= (eps == null ? DIV_EPS : eps); }
  function otherHand(h) { return h === "R" ? "L" : "R"; }

  function isDownbeat(beat) {
    return Math.abs(beat - Math.round(beat)) < DOWNBEAT_EPS;
  }

  function isTwelfthGrid(beat) {
    return Math.abs(beat * 3 - Math.round(beat * 3)) < 1e-5;
  }

  // Subdivision of an inbound (or first-note outbound) interval, or 0 if none.
  function classifyDelta(delta) {
    if (delta == null || !isFinite(delta)) return 0;
    if (near(delta, 0.125)) return 32;
    if (near(delta, 1 / 6)) return 24;
    if (near(delta, 0.25)) return 16;
    if (near(delta, 1 / 3)) return 12;
    if (near(delta, 0.5)) return 8;
    return 0;
  }

  function isRollDiv(div) {
    return div === 12 || div === 16 || div === 24 || div === 32;
  }

  function connected(delta, laterBpm) {
    // 0 或负间隔：同一拍重复 / 乱序残差，不能当成连音或滚奏对。
    if (!gt(delta, 0)) return false;
    if (laterBpm >= 270) return le(delta, 0.5);
    return lt(delta, 0.5);
  }

  // 炒菜的散音不看 BPM：8 分或更慢（间隔 ≥ 半拍）永远断开，270 也不并进连音。
  // 密串中间单独一格 16 分空不走这里，见 isSingle16thHole。
  function chaoLinked(delta) {
    return gt(delta, 0) && lt(delta, 0.5);
  }

  function is16thStep(delta) {
    return delta != null && near(delta, 0.25);
  }

  function is16thRestGap(delta) {
    return delta != null && near(delta, 0.5);
  }

  // 16 分密串中间只空一格：这一拍的入间隔正好半拍，前一拍是 16 分步进，
  // 后一拍也是 16 分步进（或这颗就是串尾，后面没有音）。
  // 串尾规矩：这格空拍不断开，后面的音不另起正手，也不改判成散音。
  // 右侧紧接着是 8 分或更慢（下一间隔也 ≥ 半拍）则不是这格空，仍按散音断开。
  function isSingle16thHole(notes, rightIndex) {
    if (rightIndex < 2 || rightIndex >= notes.length) return false;
    if (!is16thRestGap(inbound(notes, rightIndex))) return false;
    if (!is16thStep(inbound(notes, rightIndex - 1))) return false;
    if (rightIndex >= notes.length - 1) return true;
    return is16thStep(inbound(notes, rightIndex + 1));
  }

  function segmentLinked(notes, index, globalBpm) {
    var delta = inbound(notes, index);
    var bpm = noteBpm(notes, index, globalBpm);
    if (connected(delta, bpm)) return true;
    return isSingle16thHole(notes, index);
  }

  function chaoSegmentLinked(notes, index) {
    if (chaoLinked(inbound(notes, index))) return true;
    return isSingle16thHole(notes, index);
  }

  function noteBpm(notes, i, globalBpm) {
    var bpm = globalBpm;
    for (var k = 0; k <= i; k++) {
      if (notes[k] && notes[k].bpm != null) bpm = notes[k].bpm;
    }
    return bpm;
  }

  function inbound(notes, i) {
    if (i <= 0) return null;
    return notes[i].beat - notes[i - 1].beat;
  }

  function outbound(notes, i) {
    if (i >= notes.length - 1) return null;
    return notes[i + 1].beat - notes[i].beat;
  }

  function isRestNote(notes, i) {
    var hasIn = i > 0;
    var hasOut = i < notes.length - 1;
    if (!hasIn && !hasOut) return true;
    if (hasIn && !ge(inbound(notes, i), 1)) return false;
    if (hasOut && !ge(outbound(notes, i), 1)) return false;
    return true;
  }

  function markRests(notes) {
    var rest = new Array(notes.length);
    for (var i = 0; i < notes.length; i++) rest[i] = isRestNote(notes, i);
    return rest;
  }

  // Phrase cuts: a rest is its own phrase; inbound > 1 starts a new phrase.
  function splitPhrases(notes, rest) {
    var phrases = [];
    var n = notes.length;
    var i = 0;
    while (i < n) {
      if (rest[i]) {
        phrases.push({ start: i, end: i, rest: true });
        i++;
        continue;
      }
      var start = i;
      i++;
      while (i < n && !rest[i]) {
        if (gt(inbound(notes, i), 1)) break;
        i++;
      }
      phrases.push({ start: start, end: i - 1, rest: false });
    }
    return phrases;
  }

  // 连音 / 散音 segments inside one non-rest phrase.
  function segmentsInPhrase(notes, start, end, globalBpm) {
    var groups = [];
    var i = start;
    while (i <= end) {
      var j = i;
      while (j < end) {
        if (!segmentLinked(notes, j + 1, globalBpm)) break;
        j++;
      }
      // j is the last note of this connected run; length 1 is 散音
      var kind = (j > i) ? "连音" : "散音";
      if (kind === "散音") {
        // absorb following isolated 散音, but do not swallow the first note of a later 连音
        while (j < end) {
          var nxt = j + 1;
          if (nxt < end && segmentLinked(notes, nxt + 1, globalBpm)) break; // nxt starts a 连音
          if (segmentLinked(notes, nxt, globalBpm)) break;
          j = nxt;
        }
      }
      groups.push({ start: i, end: j, kind: kind });
      i = j + 1;
    }
    return groups;
  }

  // A patterned 16th 三连 cell: xoo / oxx / xxo / oox. Same-colour and xox are not.
  function tripleCellAt(notes, i, end) {
    if (i + 2 > end) return false;
    if (!is16Step(notes, i + 1) || !is16Step(notes, i + 2)) return false;
    return !!tripleKind(notes[i].colour, notes[i + 1].colour, notes[i + 2].colour);
  }

  function leadingTripleCells(notes, i, end) {
    var n = 0;
    var k = i;
    while (tripleCellAt(notes, k, end)) {
      n++;
      k += 3;
    }
    return n;
  }

  function cycleContained(notes, i, end) {
    if (i + 5 > end) return null;
    if (!preferCycleStart(notes, i)) return null;
    var span = cycleSpan(notes, i);
    if (!span || span.start !== i || span.end > end) return null;
    return span;
  }

  // Two alignments within two 16ths (oxooxoox is both a 1-shift and a 2-shift)
  // are one cluster, not a stack of 三连.
  function cycleCompetes(notes, i, end) {
    for (var d = -2; d <= 2; d++) {
      if (d === 0) continue;
      if (i + d < 0) continue;
      if (cycleContained(notes, i + d, end)) return true;
    }
    return false;
  }

  function nextSoloCycle(notes, from, end) {
    for (var i = from + 1; i + 5 <= end; i++) {
      var span = cycleContained(notes, i, end);
      if (!span || cycleCompetes(notes, i, end)) continue;
      return span;
    }
    return null;
  }

  // 1–2 notes that keep the previous 三连 cell's colour cycle. Not a new 正手.
  function samePatternTail(notes, i, end) {
    if (i < 3 || i > end) return 0;
    var len = 0;
    while (i + len <= end && len < 2) {
      if (!is16Step(notes, i + len)) break;
      if (notes[i + len].colour !== notes[i + len - 3].colour) break;
      len++;
    }
    return len;
  }

  // Figure cuts inside one 炒菜 fast run (every interval < 0.5).
  //   三连 — each patterned 16th cell (xoo/oxx/xxo/oox), starting on 惯用手.
  //   续   — the 1–2 note tail of that colour cycle; the hand carries.
  //   连音 — one cluster, 正手起: monochrome, 鱼蛋, 四连, 五连, 12/24/32,
  //          or a colour stream whose 三连 alignments compete (oxooxoox).
  // A lone cell that only opens a longer figure (oxxo and the like) is not peeled off.
  function cellsToTake(notes, i, end) {
    var tiles = leadingTripleCells(notes, i, end);
    if (tiles >= 2) return tiles;
    if (tiles === 1 && end - i === 2) return 1;
    return 0;
  }

  function chaoFigures(notes, start, end) {
    var figs = [];
    var i = start;
    var guard = 0;
    while (i <= end && guard++ <= notes.length + 2) {
      var take = cellsToTake(notes, i, end);
      if (take > 0) {
        for (var t = 0; t < take; t++) {
          figs.push({ start: i, end: i + 2, kind: "三连" });
          i += 3;
        }
        // Only a 1–2 note remainder of this cycle. A longer remainder is the next cluster.
        if (i <= end && end - i < 2) {
          var tail = samePatternTail(notes, i, end);
          if (tail === end - i + 1) {
            figs.push({ start: i, end: i + tail - 1, kind: "续" });
            i += tail;
          }
        }
        continue;
      }
      var span = nextSoloCycle(notes, i, end);
      if (span && span.start > i) {
        figs.push({ start: i, end: span.start - 1, kind: "连音" });
        i = span.start;
        continue;
      }
      figs.push({ start: i, end: end, kind: "连音" });
      break;
    }
    return figs;
  }

  // 炒菜 segments: 真 8 分或更慢（间隔 ≥ 半拍，且不是 16 分串里的一格空）才是散音。
  // 16 分密串中间只空一格仍是同一串，后面不改判成散音。快的一段再切成下面的句型。
  function chaoSegments(notes, start, end) {
    var groups = [];
    var i = start;
    while (i <= end) {
      var j = i;
      while (j < end) {
        if (!chaoSegmentLinked(notes, j + 1)) break;
        j++;
      }
      var kind = (j > i) ? "连音" : "散音";
      if (kind === "散音") {
        while (j < end) {
          var nxt = j + 1;
          if (nxt < end && chaoSegmentLinked(notes, nxt + 1)) break;
          if (chaoSegmentLinked(notes, nxt)) break;
          j = nxt;
        }
        groups.push({ start: i, end: j, kind: "散音" });
      } else {
        var figs = chaoFigures(notes, i, j);
        for (var f = 0; f < figs.length; f++) groups.push(figs[f]);
      }
      i = j + 1;
    }
    return groups;
  }

  function fillAlternate(hands, start, end, first) {
    var h = first;
    for (var i = start; i <= end; i++) {
      hands[i] = h;
      h = otherHand(h);
    }
  }

  function fillAll(hands, start, end, h) {
    for (var i = start; i <= end; i++) hands[i] = h;
  }

  // Phrase starts always reset to 惯用手. 炒菜 also resets at every 散音 run and
  // every non-散音 figure (each 三连 cell, each 鱼蛋 / 四连 / 五连 / other cluster),
  // including a gap of exactly one beat. A 三连 colour-cycle tail (续) does not
  // reset. 全换 does not reset on a gap of exactly one beat when the previous
  // note is not a 休息段.
  function chaoMarks(notes, phrases) {
    var fresh = Object.create(null);
    var boundary = Object.create(null);
    for (var p = 0; p < phrases.length; p++) {
      var ph = phrases[p];
      fresh[ph.start] = true;
      if (ph.rest) continue;
      var figs = chaoSegments(notes, ph.start, ph.end);
      for (var s = 0; s < figs.length; s++) {
        boundary[figs[s].start] = true;
        if (figs[s].kind !== "续") fresh[figs[s].start] = true;
      }
    }
    return { fresh: fresh, boundary: boundary };
  }

  function freshStarts(notes, phrases) {
    var fresh = Object.create(null);
    for (var p = 0; p < phrases.length; p++) fresh[phrases[p].start] = true;
    return fresh;
  }

  function assignTechnique(notes, rest, phrases, 手法, dominant, globalBpm) {
    var hands = new Array(notes.length);
    for (var p = 0; p < phrases.length; p++) {
      var ph = phrases[p];
      if (ph.rest) {
        fillAll(hands, ph.start, ph.end, dominant);
        continue;
      }
      if (手法 === "全换") {
        fillAlternate(hands, ph.start, ph.end, dominant);
        continue;
      }
      if (手法 === "炒菜") {
        var figs = chaoSegments(notes, ph.start, ph.end);
        for (var s = 0; s < figs.length; s++) {
          var g = figs[s];
          if (g.kind === "散音") fillAll(hands, g.start, g.end, dominant);
          else if (g.kind === "续") fillAlternate(hands, g.start, g.end, otherHand(dominant));
          else fillAlternate(hands, g.start, g.end, dominant);
        }
        continue;
      }
      var segs = segmentsInPhrase(notes, ph.start, ph.end, globalBpm);
      if (手法 === "半换A") {
        for (s = 0; s < segs.length; s++) {
          fillAlternate(hands, segs[s].start, segs[s].end, dominant);
        }
      } else if (手法 === "半换B") {
        // merge each 连音 with the 散音 immediately before it (same phrase)
        var b = 0;
        while (b < segs.length) {
          if (segs[b].kind === "连音") {
            fillAlternate(hands, segs[b].start, segs[b].end, dominant);
            b++;
          } else if (b + 1 < segs.length && segs[b + 1].kind === "连音") {
            fillAlternate(hands, segs[b].start, segs[b + 1].end, dominant);
            b += 2;
          } else {
            // trailing 散音
            fillAlternate(hands, segs[b].start, segs[b].end, dominant);
            b++;
          }
        }
      } else {
        // unknown 手法: fall back to 全换
        fillAlternate(hands, ph.start, ph.end, dominant);
      }
    }
    return hands;
  }

  function noteDiv(notes, i, runStart) {
    // 每颗按入间隔判细分；串首没有入间隔时用出间隔。
    if (i > runStart) return classifyDelta(inbound(notes, i));
    if (i < notes.length - 1) return classifyDelta(outbound(notes, i));
    return 0;
  }

  function shouldSplitFamily(notes, i, prevDiv, thisDiv) {
    // 16 ↔ 12 换族，且该音在拍头或 12 分格子上：在这里断开（该音起新串）。
    if (!((prevDiv === 16 && thisDiv === 12) || (prevDiv === 12 && thisDiv === 16))) return false;
    var beat = notes[i].beat;
    return isDownbeat(beat) || isTwelfthGrid(beat);
  }

  function isRollableGap(div) {
    return isRollDiv(div);
  }

  // Split a phrase into roll-runs. 16/24/32 stay together; 12 stays with 12;
  // 16↔12 on a downbeat / 12th grid splits; a non-roll gap (e.g. 8th hole) splits.
  function rollRunsInPhrase(notes, start, end, globalBpm, link) {
    if (!link) link = connected;
    var runs = [];
    var i = start;
    while (i <= end) {
      // skip isolated notes that aren't in a 连音 (length-1 散音 / anything not connected to next)
      // A roll run is a maximal 连音, then further split by family rules.
      if (i < end) {
        var d0 = inbound(notes, i + 1);
        var bpm0 = noteBpm(notes, i + 1, globalBpm);
        if (!link(d0, bpm0)) {
          i++;
          continue;
        }
      } else {
        i++;
        continue;
      }
      // i starts a 连音; extend
      var j = i;
      while (j < end) {
        var d = inbound(notes, j + 1);
        var bpm = noteBpm(notes, j + 1, globalBpm);
        if (!link(d, bpm)) break;
        j++;
      }
      // split [i, j] into family runs
      var subStart = i;
      var prevDiv = noteDiv(notes, i, i);
      for (var k = i + 1; k <= j; k++) {
        var inDiv = classifyDelta(inbound(notes, k));
        var outDiv = classifyDelta(outbound(notes, k));
        var split = false;
        if (!isRollableGap(inDiv) && inDiv !== 0) {
          // e.g. 8th hole: previous run ends at k-1, k starts a new run
          split = true;
        } else if ((inDiv === 16 && outDiv === 12) || (inDiv === 12 && outDiv === 16)) {
          // 换族且该音在拍头或 12 分格子：在该音处断开（该音起新串）
          if (isDownbeat(notes[k].beat) || isTwelfthGrid(notes[k].beat)) split = true;
        } else if (shouldSplitFamily(notes, k, prevDiv, inDiv)) {
          split = true;
        }
        if (split) {
          if (k - 1 >= subStart) runs.push({ start: subStart, end: k - 1 });
          subStart = k;
          prevDiv = noteDiv(notes, k, k);
        } else {
          prevDiv = inDiv || prevDiv;
        }
      }
      if (j >= subStart) runs.push({ start: subStart, end: j });
      i = j + 1;
    }
    return runs;
  }

  function collectRollRuns(notes, rest, phrases, globalBpm, link) {
    var runs = [];
    for (var p = 0; p < phrases.length; p++) {
      var ph = phrases[p];
      if (ph.rest) continue;
      var rr = rollRunsInPhrase(notes, ph.start, ph.end, globalBpm, link);
      for (var r = 0; r < rr.length; r++) runs.push(rr[r]);
    }
    return runs;
  }

  // Cut a roll-run wherever a 炒菜 figure starts, so each 三连 cell pairs on
  // its own from 惯用手. A 续 boundary is a cut too, but it is not fresh:
  // the roll layer keeps the hand after the previous cell.
  function splitRunsAtBoundaries(runs, boundary) {
    if (!boundary) return runs;
    var out = [];
    for (var r = 0; r < runs.length; r++) {
      var run = runs[r];
      var s = run.start;
      for (var i = run.start + 1; i <= run.end; i++) {
        if (boundary[i]) {
          out.push({ start: s, end: i - 1 });
          s = i;
        }
      }
      out.push({ start: s, end: run.end });
    }
    return out;
  }

  function canPairNotes(notes, a, b) {
    return !notes[a].big && !notes[b].big;
  }

  function plan22(n, canPair) {
    var pairs = [];
    var i = 0;
    while (i < n) {
      if (i + 1 < n && canPair(i, i + 1)) {
        pairs.push([i, i + 1]);
        i += 2;
      } else {
        i += 1;
      }
    }
    return pairs;
  }

  function planShift1(n, canPair) {
    var pairs = [];
    var i = 1;
    while (i < n) {
      if (i + 1 < n && canPair(i, i + 1)) {
        pairs.push([i, i + 1]);
        i += 2;
      } else {
        i += 1;
      }
    }
    return pairs;
  }

  // 1-2 from `from` (single, pair, single, pair…), relative indices.
  function plan12From(n, from, canPair) {
    var pairs = [];
    var i = from;
    while (i < n) {
      i += 1; // single
      if (i + 1 < n && canPair(i, i + 1)) {
        pairs.push([i, i + 1]);
        i += 2;
      }
    }
    return pairs;
  }

  function plan21(n, canPair) {
    var pairs = [];
    var i = 0;
    while (i < n) {
      if (i + 1 < n && canPair(i, i + 1)) {
        pairs.push([i, i + 1]);
        i += 2;
      }
      if (i < n) i += 1; // single
    }
    return pairs;
  }

  function isWaishua(c1, c2) {
    return c1 === "don" && c2 === "ka";
  }

  // 整串咚咔交替（oxox… 或 xoxo…），中间没有同色，也没有大音符。
  function isAlternatingDonKa(notes) {
    if (!notes || notes.length < 2) return false;
    for (var i = 0; i < notes.length; i++) {
      var c = notes[i].colour;
      if (notes[i].big) return false;
      if (c !== "don" && c !== "ka") return false;
      if (i > 0 && c === notes[i - 1].colour) return false;
    }
    return true;
  }

  function pairsEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
    }
    return true;
  }

  // 交替串长度大于 2，且配对数正好是从第一颗起的 2-2。
  // 这种外刷对落在逆手上也要留着；两音整对是逆手外刷时不走这里。
  function keepAlternating22(runNotes, relPairs) {
    if (!runNotes || runNotes.length <= 2) return false;
    if (!isAlternatingDonKa(runNotes)) return false;
    var canPair = function (i, j) { return !runNotes[i].big && !runNotes[j].big; };
    return pairsEqual(relPairs, plan22(runNotes.length, canPair));
  }

  function countNizyteWaishua(notes, start, pairs, startHand, dominant) {
    var pairOf = Object.create(null);
    for (var p = 0; p < pairs.length; p++) pairOf[pairs[p][0]] = pairs[p][1];
    var count = 0;
    var h = startHand;
    var i = 0;
    var n = notes.length; // this is run-local? we'll pass run notes via wrapper
    // This function is called with run-local notes array.
    while (i < notes.length) {
      if (pairOf[i] === i + 1) {
        if (isWaishua(notes[i].colour, notes[i + 1].colour) && h !== dominant) count++;
        h = otherHand(h);
        i += 2;
      } else {
        h = otherHand(h);
        i += 1;
      }
    }
    return count;
  }

  function breakNizytePairs(notes, start, pairs, startHand, dominant) {
    // drop pairs that would be 逆手外刷; walk in order
    var kept = [];
    var h = startHand;
    var pairOf = Object.create(null);
    for (var p = 0; p < pairs.length; p++) pairOf[pairs[p][0]] = pairs[p][1];
    var i = 0;
    while (i < notes.length) {
      if (pairOf[i] === i + 1) {
        if (isWaishua(notes[i].colour, notes[i + 1].colour) && h !== dominant) {
          // become two singles; first keeps h, second is other
          h = otherHand(h); // after first single
          h = otherHand(h); // after second single = original next stroke? 
          // singles: first h, flip, second other, flip → after two singles we're at original h
          // Wait: two singles: start h, after first otherHand(h), after second start h again.
          // A pair would flip once, ending at otherHand(h). These are different!
          // "改成单打交替，不进 rollPairs" — they become alternating singles, so
          // after two singles the next hand is back to the start hand of the pair.
          // Yes h is already flipped twice = start h. Next note uses start h? 
          // Example 31: 2-note run start L, pair would be 逆手外刷, become L R.
          // After two singles start L: L, R, next would be L. Good.
          i += 2;
        } else {
          kept.push([i, i + 1]);
          h = otherHand(h);
          i += 2;
        }
      } else {
        h = otherHand(h);
        i += 1;
      }
    }
    return kept;
  }

  function detectCycle(notes) {
    if (notes.length < 6) return null;
    var c0 = notes[0].colour, c1 = notes[1].colour, c2 = notes[2].colour;
    if (c0 === c1 && c1 === c2) return null; // monochrome
    for (var i = 0; i < 6; i++) {
      if (notes[i].colour !== notes[i % 3].colour) return null;
    }
    if (c1 === c2 && c0 !== c1) return "xoo";
    if (c0 === c1 && c1 !== c2) return "xxo";
    return null;
  }

  function is16Step(notes, i) {
    if (i <= 0) return false;
    return classifyDelta(notes[i].beat - notes[i - 1].beat) === 16;
  }

  // xoo / oxx / xxo / oox. Same-colour and xox are not 3-cycles here.
  function tripleKind(c0, c1, c2) {
    if (c1 === c2 && c0 !== c1) return "xoo";
    if (c0 === c1 && c1 !== c2) return "xxo";
    return null;
  }

  function cycleStartsAt(notes, i) {
    var n = notes.length;
    if (i + 5 >= n) return null;
    for (var k = 1; k <= 5; k++) if (!is16Step(notes, i + k)) return null;
    var c0 = notes[i].colour, c1 = notes[i + 1].colour, c2 = notes[i + 2].colour;
    if (!tripleKind(c0, c1, c2)) return null;
    for (k = 0; k < 6; k++) {
      if (notes[i + k].colour !== notes[i + (k % 3)].colour) return null;
    }
    return [c0, c1, c2];
  }

  // Same-colour continuation is not a new cell if a colour change inside
  // this cell also starts a 3-cycle (dddd|kddkdd stays four dons, then kdd).
  function preferCycleStart(notes, i) {
    if (!cycleStartsAt(notes, i)) return false;
    if (i > 0 && is16Step(notes, i) && notes[i].colour === notes[i - 1].colour) {
      var n = notes.length;
      for (var s = i + 1; s <= i + 2 && s < n; s++) {
        if (notes[s].colour !== notes[s - 1].colour && cycleStartsAt(notes, s)) return false;
      }
    }
    return true;
  }

  function cycleSpan(notes, i) {
    var pattern = cycleStartsAt(notes, i);
    if (!pattern) return null;
    var n = notes.length;
    var end = i + 5;
    while (end + 3 < n) {
      var ok = true;
      for (var t = 1; t <= 3; t++) {
        var idx = end + t;
        if (!is16Step(notes, idx) || notes[idx].colour !== pattern[(idx - i) % 3]) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
      end += 3;
    }
    var partial = 0;
    while (end + 1 < n && partial < 2) {
      var nxt = end + 1;
      if (!is16Step(notes, nxt)) break;
      if (notes[nxt].colour !== pattern[(nxt - i) % 3]) break;
      if (preferCycleStart(notes, nxt)) break;
      end = nxt;
      partial++;
    }
    return { start: i, end: end };
  }

  function chooseAuto22PairsLegacy(runNotes, startHand, dominant) {
    var n = runNotes.length;
    var canPair = function (i, j) { return !runNotes[i].big && !runNotes[j].big; };
    var cycle = detectCycle(runNotes);
    var pairs;
    if (cycle === "xoo") {
      // 24 分等非 16 分仍走原规则：xoo 整段 1-2。16 分三连不进这里。
      pairs = plan12From(n, 0, canPair);
    } else if (cycle === "xxo") {
      pairs = plan21(n, canPair);
    } else if (isAlternatingDonKa(runNotes)) {
      // 交替咚咔从第一颗 2-2。ox 是外刷，xo 是内刷。
      // 落在逆手上的外刷对保留：不前移一颗，也不拆回单打。
      // 奇数长度的余音留在串尾。起手沿用这一串已经排好的手，不改成另一只来躲开逆手外刷。
      // 仅两音、且整对都是逆手外刷时，仍改成单打（连音从逆手起，没有更长的整串外刷）。
      pairs = plan22(n, canPair);
      if (n === 2) return breakNizytePairs(runNotes, 0, pairs, startHand, dominant);
      return pairs;
    } else {
      var p22 = plan22(n, canPair);
      var pSh = planShift1(n, canPair);
      var c22 = countNizyteWaishua(runNotes, 0, p22, startHand, dominant);
      var cSh = countNizyteWaishua(runNotes, 0, pSh, startHand, dominant);
      pairs = (cSh < c22) ? pSh : p22;
    }
    return breakNizytePairs(runNotes, 0, pairs, startHand, dominant);
  }

  // 16 分三连（xoo/oxx/xxo/oox，至少两格）一律 2-1。中途换型就从新格重切，
  // 不把开头的 1-2 锁到整串，也不把后面的三连留在 2-2 上。
  // 同色三颗走默认 2-2，长度 3 时自然是 (oo)o / (xx)x。四音型不在这里。
  function chooseAuto22Pairs(runNotes, startHand, dominant) {
    var n = runNotes.length;
    var segments = [];
    var i = 0;
    while (i < n) {
      if (preferCycleStart(runNotes, i)) {
        var span = cycleSpan(runNotes, i);
        segments.push({ start: i, end: span.end, kind: "21" });
        i = span.end + 1;
      } else {
        var j = i + 1;
        while (j < n && !preferCycleStart(runNotes, j)) j++;
        segments.push({ start: i, end: j - 1, kind: "legacy" });
        i = j;
      }
    }
    var pairs = [];
    var h = startHand;
    for (var s = 0; s < segments.length; s++) {
      var seg = segments[s];
      var slice = sliceNotes(runNotes, seg.start, seg.end);
      var rel;
      if (seg.kind === "21") {
        var canPair = function (a, b) { return !slice[a].big && !slice[b].big; };
        rel = breakNizytePairs(slice, 0, plan21(slice.length, canPair), h, dominant);
      } else {
        rel = chooseAuto22PairsLegacy(slice, h, dominant);
      }
      var abs = toAbsPairs(rel, seg.start);
      for (var p = 0; p < abs.length; p++) pairs.push(abs[p]);
      var scratch = new Array(slice.length);
      h = applyPairsToHands(scratch, 0, slice.length - 1, h, rel);
    }
    return pairs;
  }

  function findLeadDownbeat(notes, start, end) {
    var max = Math.min(start + 2, end);
    for (var i = start; i <= max; i++) {
      if (isDownbeat(notes[i].beat)) return i - start;
    }
    return 0;
  }

  function choose12Pairs(notes, start, end) {
    var n = end - start + 1;
    var canPair = function (i, j) {
      return !notes[start + i].big && !notes[start + j].big;
    };
    var lead = findLeadDownbeat(notes, start, end);
    var pairs = [];
    if (lead === 0) {
      pairs = plan12From(n, 0, canPair);
    } else if (lead === 1) {
      pairs = plan12From(n, 1, canPair);
    } else if (lead === 2) {
      if (n >= 2 && canPair(0, 1)) pairs.push([0, 1]);
      var rest = plan12From(n, 2, canPair);
      for (var r = 0; r < rest.length; r++) pairs.push(rest[r]);
    }
    return pairs;
  }


  function splitByDiv(notes, start, end) {
    // Consecutive same-div subsegments, using inbound for i>start and outbound for start.
    var parts = [];
    var i = start;
    while (i <= end) {
      var div = (i === start) ? classifyDelta(outbound(notes, i)) : classifyDelta(inbound(notes, i));
      // If this is the first of the whole run, outbound is its div. Subsequent notes of same
      // family keep arriving with that inbound div. When inbound changes, new part starts.
      var j = i;
      while (j < end) {
        var nextDiv = classifyDelta(inbound(notes, j + 1));
        var curDiv = (j === start && j === i) ? classifyDelta(outbound(notes, j)) : classifyDelta(inbound(notes, j));
        if (j === i && i === start) curDiv = classifyDelta(outbound(notes, i));
        if (nextDiv !== curDiv && nextDiv !== 0 && curDiv !== 0) break;
        j++;
      }
      parts.push({ start: i, end: j, div: div || classifyDelta(inbound(notes, i)) || classifyDelta(outbound(notes, i)) });
      i = j + 1;
    }
    return parts;
  }

  function applyPairsToHands(hands, start, end, startHand, pairsAbs) {
    var pairOf = Object.create(null);
    for (var p = 0; p < pairsAbs.length; p++) pairOf[pairsAbs[p][0]] = pairsAbs[p][1];
    var h = startHand;
    var i = start;
    while (i <= end) {
      if (pairOf[i] === i + 1) {
        hands[i] = h;
        hands[i + 1] = h;
        h = otherHand(h);
        i += 2;
      } else {
        hands[i] = h;
        h = otherHand(h);
        i += 1;
      }
    }
    return h; // next hand after the run
  }

  function sliceNotes(notes, start, end) {
    var out = [];
    for (var i = start; i <= end; i++) out.push(notes[i]);
    return out;
  }

  function toAbsPairs(pairs, start) {
    var out = [];
    for (var i = 0; i < pairs.length; i++) out.push([pairs[i][0] + start, pairs[i][1] + start]);
    return out;
  }

  function append24DivPairs(pairs, notes, start, end) {
    var parts = splitByDiv(notes, start, end);
    for (var p = 0; p < parts.length; p++) {
      var part = parts[p];
      var n = part.end - part.start + 1;
      var canPair = function (localStart) {
        return function (i, j) {
          return !notes[localStart + i].big && !notes[localStart + j].big;
        };
      };
      var rel;
      var r;
      if (part.div === 24) {
        rel = plan12From(n, 0, canPair(part.start));
        for (r = 0; r < rel.length; r++) {
          pairs.push([rel[r][0] + part.start, rel[r][1] + part.start]);
        }
      } else if (part.div === 32) {
        rel = plan22(n, canPair(part.start));
        for (r = 0; r < rel.length; r++) {
          pairs.push([rel[r][0] + part.start, rel[r][1] + part.start]);
        }
      }
    }
  }

  function sandwichQuadAt(notes, i, end) {
    if (i + 3 > end) return false;
    // 中间两颗 24 分必须是同一面（咚咚或咔咔），含同色夹心。
    // 鱼蛋中间一咚一咔，不在这里，保持单打。
    if (notes[i + 1].colour !== notes[i + 2].colour) return false;
    var left = classifyDelta(inbound(notes, i + 1));
    var mid = classifyDelta(inbound(notes, i + 2));
    var right = classifyDelta(inbound(notes, i + 3));
    if (mid !== 24) return false;
    // 16夹24：16、24、16。12夹24：12、24、12。其他混合型不在这里。
    return (left === 16 && right === 16) || (left === 12 && right === 12);
  }

  function choose24ModePairs(notes, start, end) {
    // 纯 16 / 纯 12 不滚。每段纯 24 从该段第一颗 1-2（不对齐拍头）。
    // 每段纯 32 从该段第一颗 2-2。
    // 16夹24、12夹24 里，中间两颗 24 分是同一面的四音整格 1-2-1，
    // 不按 16/12 和 24 切开。含咚咔咔咚这类，也含同色夹心
    // （咚咚咚咚、咔咚咚咚、咚咔咔咔、咔咔咔咔）。
    // 两头单打同一只手，中间两颗在另一只手成对。鱼蛋中间不同色不滚。
    // 起手沿用这一串已经排好的下一只手（正手起为右、左左、右；
    // 同一串里上一颗是右，则为左、右右、左）。这里不另行正手起。
    // 重复的四音型逐格 1-2-1。其他更长的混合型仍只把 24 分段按 1-2。
    var pairs = [];
    var i = start;
    while (i <= end) {
      if (sandwichQuadAt(notes, i, end)) {
        if (!notes[i + 1].big && !notes[i + 2].big) pairs.push([i + 1, i + 2]);
        i += 4;
        continue;
      }
      var j = i;
      while (j <= end && !sandwichQuadAt(notes, j, end)) j++;
      if (j > i) append24DivPairs(pairs, notes, i, j - 1);
      i = j;
    }
    return pairs;
  }

  function chooseAutoPairs(notes, start, end, startHand, dominant, mode) {
    if (mode === "不滚奏") return [];
    var n = end - start + 1;
    if (n < 2) return [];

    if (mode === "24分滚奏") {
      var raw = choose24ModePairs(notes, start, end);
      var runNotes = sliceNotes(notes, start, end);
      var rel = [];
      for (var i = 0; i < raw.length; i++) rel.push([raw[i][0] - start, raw[i][1] - start]);
      // 32 分交替串已经是从第一颗 2-2。逆手外刷留在对里。
      // 24 分仍是 1-2，夹心仍是 1-2-1，这两种继续拆掉逆手外刷。
      if (!keepAlternating22(runNotes, rel)) {
        rel = breakNizytePairs(runNotes, 0, rel, startHand, dominant);
      }
      return toAbsPairs(rel, start);
    }

    // 自动滚奏
    var divs = {};
    for (var k = start; k <= end; k++) {
      var d = (k === start) ? classifyDelta(outbound(notes, k)) : classifyDelta(inbound(notes, k));
      if (d) divs[d] = true;
    }
    var only12 = divs[12] && !divs[16] && !divs[24] && !divs[32];
    var has12 = !!divs[12];
    var has162432 = !!(divs[16] || divs[24] || divs[32]);

    if (only12 || (has12 && !has162432)) {
      var p12 = choose12Pairs(notes, start, end);
      runNotes = sliceNotes(notes, start, end);
      p12 = breakNizytePairs(runNotes, 0, p12, startHand, dominant);
      return toAbsPairs(p12, start);
    }

    // 16 / 24 / 32 / mixed (and mixed with leftover 12 after family split shouldn't appear)
    // If a run somehow mixed 12 with 16 after we failed to split, 5.5 says 16+24 don't split
    // but 16↔12 on downbeat should have been split already.
    var auto22 = chooseAuto22Pairs(sliceNotes(notes, start, end), startHand, dominant);
    return toAbsPairs(auto22, start);
  }

  function applyRollLayer(notes, hands, runs, dominant, mode, fresh) {
    var allPairs = [];
    if (mode === "不滚奏") return allPairs;
    var nextStartHand = null;
    var prevEnd = -2;
    for (var r = 0; r < runs.length; r++) {
      var run = runs[r];
      var startHand;
      // Adjacent roll-runs keep the hand after the previous pair, unless this
      // note is a fresh start (new phrase, or a new 炒菜 segment). Those
      // already have 惯用手 written into hands[] by assignTechnique; do not
      // carry the previous phrase's off-hand onto a 鱼蛋 / 三连 / 四连 / 五连.
      if (nextStartHand && run.start === prevEnd + 1 && !(fresh && fresh[run.start])) startHand = nextStartHand;
      else startHand = hands[run.start];
      var pairs = chooseAutoPairs(notes, run.start, run.end, startHand, dominant, mode);
      var after = applyPairsToHands(hands, run.start, run.end, startHand, pairs);
      for (var p = 0; p < pairs.length; p++) allPairs.push(pairs[p]);
      nextStartHand = after;
      prevEnd = run.end;
    }
    return allPairs;
  }

  function collectWarnings(hands, runs, allPairs, dominant) {
    var pairIn = Object.create(null);
    for (var p = 0; p < allPairs.length; p++) {
      pairIn[allPairs[p][0]] = true;
      pairIn[allPairs[p][1]] = true;
    }
    var warnings = [];
    for (var r = 0; r < runs.length; r++) {
      var run = runs[r];
      var len = run.end - run.start + 1;
      var hasPair = false;
      for (var i = run.start; i <= run.end; i++) if (pairIn[i]) { hasPair = true; break; }
      if (len < 3 && !hasPair) continue;
      if (hands[run.start] !== dominant) {
        warnings.push([run.start, run.end, "逆手起"]);
      }
    }
    return warnings;
  }

  function findSixteenthHoles(notes, globalBpm) {
    // A 16th hole: two 16th notes with interval exactly 0.5, and they sit between 16th material
    // (previous outbound or next inbound is 16th). "一串 16 分中间只空了一格 16 分".
    var holes = [];
    for (var i = 0; i < notes.length - 1; i++) {
      var d = inbound(notes, i + 1);
      if (!near(d, 0.5)) continue;
      // left note should belong to a 16th run (inbound or outbound 16)
      var left16 = (i > 0 && classifyDelta(inbound(notes, i)) === 16) || classifyDelta(outbound(notes, i)) === 16;
      // After a hole the next note starts a 16th run: outbound 16 or... the gap itself isn't 16.
      // The next note (i+1) should have outbound 16 or be followed as 16ths.
      var right16 = (i + 1 < notes.length - 1 && classifyDelta(outbound(notes, i + 1)) === 16) ||
                    (i + 1 > 0 && classifyDelta(inbound(notes, i + 1)) === 8 /* the hole */);
      // Safer: left has a 16th neighbor on its left, right has a 16th neighbor on its right,
      // or they themselves are 16ths in a broken run.
      var leftIs16 = (i > 0 && near(inbound(notes, i), 0.25)) ||
                     (i < notes.length - 1 && near(outbound(notes, i), 0.25));
      var rightIs16 = (i + 1 < notes.length - 1 && near(outbound(notes, i + 1), 0.25)) ||
                      (i + 1 > 0 && near(inbound(notes, i + 1), 0.25));
      // inbound(i+1) is 0.5, so rightIs16 via inbound would be true always — bad.
      rightIs16 = (i + 1 < notes.length - 1 && near(outbound(notes, i + 1), 0.25));
      leftIs16 = (i > 0 && near(inbound(notes, i), 0.25));
      if (leftIs16 && rightIs16) {
        holes.push(i); // insert after index i
      }
    }
    return holes;
  }

  function insertHoles(notes, holes) {
    var inserted = [];
    var expanded = notes.slice();
    // apply from the end so afterIndex stays original
    var sorted = holes.slice().sort(function (a, b) { return b - a; });
    for (var h = 0; h < sorted.length; h++) {
      var after = sorted[h];
      var left = expanded[after];
      // afterIndex is original. Because we go from the end, `after` still equals original index
      // as long as we only insert after earlier-or-equal? going from end: later insertions
      // don't shift earlier indices. after is original. Good.
      // In expanded array, index of left may have shifted if we inserted before it — we insert
      // from the end, so no earlier insertions yet. expanded[after] is still the original note.
      var next = expanded[after + 1];
      var colour = next.colour === "don" ? "ka" : "don";
      var beat = left.beat + 0.25; // one 16th after left (the hole is 0.5 = two 16ths, insert in the middle)
      var note = { beat: beat, colour: colour, big: false };
      if (left.bpm != null) note.bpm = left.bpm;
      else if (next.bpm != null) note.bpm = next.bpm;
      expanded.splice(after + 1, 0, note);
      inserted.push({ afterIndex: after, beat: beat, colour: colour, big: false });
    }
    inserted.sort(function (a, b) { return a.afterIndex - b.afterIndex; });
    return { notes: expanded, insertedNotes: inserted };
  }

  function runPipeline(notes, opts) {
    var 手法 = opts.手法 || DEFAULT_手法;
    var dominant = opts.惯用手 || DEFAULT_惯用手;
    if (dominant !== "L") dominant = "R";
    var 滚奏 = opts.滚奏 || DEFAULT_滚奏;
    var globalBpm = opts.bpm;
    var rest = markRests(notes);
    var phrases = splitPhrases(notes, rest);
    var hands = assignTechnique(notes, rest, phrases, 手法, dominant, globalBpm);
    // 炒菜：8 分或更慢不进滚奏串（BPM 270 起全换/半换仍把 8 分当成连音）。
    var link = (手法 === "炒菜") ? function (delta) { return chaoLinked(delta); } : null;
    var runs = collectRollRuns(notes, rest, phrases, globalBpm, link);
    var fresh;
    if (手法 === "炒菜") {
      var marks = chaoMarks(notes, phrases);
      fresh = marks.fresh;
      runs = splitRunsAtBoundaries(runs, marks.boundary);
    } else {
      fresh = freshStarts(notes, phrases);
    }
    var rollPairs = applyRollLayer(notes, hands, runs, dominant, 滚奏, fresh);
    var warnings = collectWarnings(hands, runs, rollPairs, dominant);
    return { hands: hands, rollPairs: rollPairs, warnings: warnings };
  }

  function sortOrder(notes) {
    var order = [];
    for (var i = 0; i < notes.length; i++) order.push(i);
    order.sort(function (a, b) {
      var da = +notes[a].beat || 0;
      var db = +notes[b].beat || 0;
      if (da < db) return -1;
      if (da > db) return 1;
      return a - b;
    });
    return order;
  }

  function sameBeatWarnings(notes, order) {
    var warnings = [];
    var i = 0;
    while (i < order.length) {
      var j = i + 1;
      while (j < order.length && near(notes[order[j]].beat, notes[order[i]].beat, EPS)) j++;
      if (j - i >= 2) {
        var orig = order.slice(i, j);
        var lo = orig[0], hi = orig[0];
        for (var k = 1; k < orig.length; k++) {
          if (orig[k] < lo) lo = orig[k];
          if (orig[k] > hi) hi = orig[k];
        }
        warnings.push([lo, hi, "同拍重复"]);
      }
      i = j;
    }
    return warnings;
  }

  function remapHands(hands, order, n) {
    var out = new Array(n);
    for (var s = 0; s < order.length; s++) out[order[s]] = hands[s];
    return out;
  }

  function remapPairs(pairs, order) {
    var out = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      var a = order[pairs[i][0]], b = order[pairs[i][1]];
      out.push(a < b ? [a, b] : [b, a]);
    }
    out.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
    return out;
  }

  function remapWarnings(warnings, order) {
    var out = [];
    for (var i = 0; i < (warnings || []).length; i++) {
      var w = warnings[i];
      var a = order[w[0]], b = order[w[1]];
      out.push([Math.min(a, b), Math.max(a, b), w[2]]);
    }
    return out;
  }

  /**
   * autoSticking(notes, { bpm, 手法, 惯用手, 滚奏, 补16分洞 })
   *   → { hands, rollPairs, warnings, insertedNotes? }
   *
   * 入口先拷一份按 beat 排序；同一拍重复写入 warnings（type「同拍重复」），
   * 0 / 负间隔不当连音、也不进滚奏对。hands / rollPairs / warnings 的下标
   * 仍对应调用者传入的原始顺序（未开补 16 分洞时）。
   */
  function autoSticking(notes, opts) {
    notes = notes || [];
    opts = opts || {};
    var n = notes.length;
    var order = sortOrder(notes);
    var sorted = order.map(function (i) { return notes[i]; });
    var preWarnings = sameBeatWarnings(notes, order);

    var working = sorted;
    var insertedNotes = null;
    if (opts.补16分洞) {
      var holes = findSixteenthHoles(sorted, opts.bpm);
      if (holes.length) {
        var ins = insertHoles(sorted, holes);
        working = ins.notes;
        insertedNotes = ins.insertedNotes.map(function (it) {
          return {
            afterIndex: order[it.afterIndex],
            beat: it.beat,
            colour: it.colour,
            big: it.big
          };
        });
      }
    }

    var out = runPipeline(working, opts);
    if (insertedNotes) {
      // 展开序列按下标对准插入后的时间序（与说明第 8 节一致）；afterIndex 已是原谱下标。
      out.insertedNotes = insertedNotes;
      out.warnings = preWarnings.concat(out.warnings || []);
      return out;
    }
    out.hands = remapHands(out.hands, order, n);
    out.rollPairs = remapPairs(out.rollPairs, order);
    out.warnings = preWarnings.concat(remapWarnings(out.warnings, order));
    return out;
  }

  function fromInput(input) {
    input = input || {};
    var opts = {
      bpm: input.bpm,
      手法: input.手法,
      惯用手: input.惯用手
    };
    var extra = input.options || {};
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) opts[k] = extra[k];
    return autoSticking(input.notes, opts);
  }

  return {
    autoSticking: autoSticking,
    fromInput: fromInput
  };
});
