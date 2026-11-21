/**
 * Manual hand-order edits on top of autoSticking. Pure functions, no DOM.
 *
 *   createSession(notes, opts, autoResult?)
 *   applyRoll(session, from, to)
 *   applyAlternate(session, from, to, direction?)
 *     direction "dominant" / "12" starts on 惯用手 (1-2);
 *     "other" / "21" starts on the other hand (2-1);
 *     omitted keeps the old continuation from the previous note.
 *   applyRestore(session, from, to)
 *   applySwap(session, index, hand)  // then re-detect rolls in that phrase (8分及更慢不滚)
 *   setOptions(session, opts)   // re-runs autoSticking, keeps patches
 *   undo(session) / redo(session)
 *   resolve(session) → { hands, rollPairs, warnings, source }
 *
 * notes: autoSticking input [{ beat, colour, big, bpm? }]
 * opts:  { bpm, 手法, 惯用手, 滚奏 }
 *
 * Browser and Node both load this file (same IIFE pattern as other js/ modules).
 */
(function (root, factory) {
  function loadSticking() {
    if (typeof require === "function") {
      try { return require("./sticking.js"); } catch (err) { /* fall through */ }
    }
    return root.BachiSticking || null;
  }
  if (typeof module === "object" && module.exports) module.exports = factory(loadSticking());
  else root.BachiHandEdits = factory(root.BachiSticking);
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function (sticking) {
  "use strict";

  function getAuto() {
    const mod = sticking || (typeof require === "function" ? require("./sticking.js") : null)
      || (typeof globalThis !== "undefined" ? globalThis.BachiSticking : null);
    if (!mod || typeof mod.autoSticking !== "function") {
      throw new Error("找不到 autoSticking（请加载 js/sticking.js）");
    }
    return mod.autoSticking;
  }

  function flip(h) { return h === "L" ? "R" : "L"; }


  function cloneOpts(opts) {
    opts = opts || {};
    return {
      bpm: opts.bpm,
      手法: opts.手法 || "全换",
      惯用手: opts.惯用手 === "L" ? "L" : "R",
      滚奏: opts.滚奏 || "自动滚奏",
      补16分洞: !!opts.补16分洞,
    };
  }

  function clonePairs(pairs) {
    const out = [];
    for (let i = 0; i < (pairs || []).length; i++) out.push([pairs[i][0], pairs[i][1]]);
    return out;
  }

  function cloneWarnings(ws) {
    const out = [];
    for (let i = 0; i < (ws || []).length; i++) {
      const w = ws[i];
      out.push([w[0], w[1], w[2]]);
    }
    return out;
  }

  function clonePatch(p) { return Object.assign({}, p); }

  function clonePatches(ps) {
    return (ps || []).map(clonePatch);
  }

  function computeAuto(notes, opts) {
    return getAuto()(notes || [], cloneOpts(opts));
  }

  /**
   * Create an edit session. If autoResult is omitted, autoSticking is run once.
   */
  function createSession(notes, opts, autoResult) {
    notes = notes || [];
    const o = cloneOpts(opts);
    const auto = autoResult ? {
      hands: (autoResult.hands || []).slice(),
      rollPairs: clonePairs(autoResult.rollPairs),
      warnings: cloneWarnings(autoResult.warnings),
    } : computeAuto(notes, o);
    return {
      notes: notes,
      opts: o,
      auto: auto,
      patches: [],
      past: [],
      future: [],
      source: "auto",
    };
  }

  /**
   * Build a session whose current result is taken from already-resolved
   * engine events (JSON import). Treats that result as the auto baseline
   * so 恢复自动 returns to the imported hands.
   */
  function createSessionFromResolved(notes, opts, resolved) {
    const session = createSession(notes, opts, resolved);
    session.source = "hand-json";
    return session;
  }

  function pushHistory(session) {
    session.past.push(clonePatches(session.patches));
    session.future = [];
  }

  function canUndo(session) { return !!(session && session.past && session.past.length); }
  function canRedo(session) { return !!(session && session.future && session.future.length); }

  function undo(session) {
    if (!canUndo(session)) return session;
    session.future.push(clonePatches(session.patches));
    session.patches = session.past.pop();
    return session;
  }

  function redo(session) {
    if (!canRedo(session)) return session;
    session.past.push(clonePatches(session.patches));
    session.patches = session.future.pop();
    return session;
  }

  function setOptions(session, opts) {
    pushHistory(session);
    session.opts = cloneOpts(Object.assign({}, session.opts, opts || {}));
    session.auto = computeAuto(session.notes, session.opts);
    return session;
  }

  function clampRange(session, from, to) {
    const n = session.notes.length;
    let a = Math.min(from, to);
    let b = Math.max(from, to);
    if (!n) return null;
    if (a < 0) a = 0;
    if (b > n - 1) b = n - 1;
    if (a > b) return null;
    return { from: a, to: b };
  }

  function applyRoll(session, from, to) {
    const r = clampRange(session, from, to);
    if (!r) return session;
    pushHistory(session);
    let mode = session.opts.滚奏 || "自动滚奏";
    // Explicit 「滚奏」action: if the current setting is 不滚奏, still pair
    // using the default 自动滚奏 rules (the user asked for a roll).
    if (mode === "不滚奏") mode = "自动滚奏";
    session.patches.push({ type: "roll", from: r.from, to: r.to, 滚奏: mode });
    return session;
  }

  // 全换休息段阈值：超过一拍才回惯用手；间隔不超过一拍则接着前一音换手。
  var BEAT_EPS = 1e-9;
  // 手改 / 导入手顺重认滚奏：间隔 ≥ 半拍（8 分或更慢）不配成对。
  var HANDMADE_ROLL_GAP = 0.5;
  var HANDMADE_GAP_EPS = 1e-4;

  function dominantOf(session) {
    return session.opts.惯用手 === "L" ? "L" : "R";
  }

  function continuesFromPrev(notes, from) {
    if (from <= 0) return false;
    var prev = notes[from - 1];
    var cur = notes[from];
    if (!prev || !cur || prev.beat == null || cur.beat == null) return false;
    return (cur.beat - prev.beat) <= 1 + BEAT_EPS;
  }

  /**
   * 交互起手：选区从谱面开头，或选区前休息超过一拍，从惯用手起；
   * 否则第一颗接选区前那一音的另一只手，避免和前一音连打同一只手。
   * 用 apply 到此时的 state.hands（含更早的补丁），不在交界再重置惯用手。
   */
  function alternateStartHand(session, state, from) {
    var dominant = dominantOf(session);
    if (!continuesFromPrev(session.notes, from)) return dominant;
    var prev = state.hands[from - 1];
    return prev === "L" ? "R" : "L";
  }

  function directedStart(session, state, from, direction) {
    if (direction === "dominant") return dominantOf(session);
    if (direction === "other") return flip(dominantOf(session));
    return alternateStartHand(session, state, from);
  }

  function normalizeDirection(direction) {
    if (direction === "dominant" || direction === "12" || direction === "1-2") return "dominant";
    if (direction === "other" || direction === "21" || direction === "2-1") return "other";
    return null;
  }

  function applyAlternate(session, from, to, direction) {
    const r = clampRange(session, from, to);
    if (!r) return session;
    pushHistory(session);
    const patch = { type: "alternate", from: r.from, to: r.to };
    const aimed = normalizeDirection(direction);
    // 1-2 / 2-1 remember the direction, not a frozen hand, so a later
    // 惯用手 change re-aims the same patch.
    if (aimed) patch.direction = aimed;
    session.patches.push(patch);
    return session;
  }

  function applyRestore(session, from, to) {
    const r = clampRange(session, from, to);
    if (!r) return session;
    pushHistory(session);
    session.patches.push({ type: "restore", from: r.from, to: r.to });
    return session;
  }

  function applySwap(session, index, hand) {
    const n = session.notes.length;
    if (index < 0 || index >= n) return session;
    const h = hand === "L" ? "L" : "R";
    pushHistory(session);
    session.patches.push({ type: "swap", index: index, hand: h });
    return session;
  }

  function pairOverlaps(pair, from, to) {
    const a = pair[0], b = pair[1];
    return (a >= from && a <= to) || (b >= from && b <= to);
  }

  function pairInside(pair, from, to) {
    return pair[0] >= from && pair[0] <= to && pair[1] >= from && pair[1] <= to;
  }

  function dropOverlapping(pairs, from, to) {
    const out = [];
    for (let i = 0; i < pairs.length; i++) {
      if (!pairOverlaps(pairs[i], from, to)) out.push(pairs[i]);
    }
    return out;
  }

  function addPairs(pairs, extra) {
    const seen = Object.create(null);
    const out = [];
    function add(p) {
      const a = Math.min(p[0], p[1]);
      const b = Math.max(p[0], p[1]);
      const k = a + ":" + b;
      if (seen[k]) return;
      seen[k] = true;
      out.push([a, b]);
    }
    for (let i = 0; i < pairs.length; i++) add(pairs[i]);
    for (let j = 0; j < (extra || []).length; j++) add(extra[j]);
    out.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
    return out;
  }

  function fillAlternate(hands, from, to, startHand) {
    let h = startHand === "L" ? "L" : "R";
    for (let i = from; i <= to; i++) {
      hands[i] = h;
      h = flip(h);
    }
  }

  function rollPairsForRange(notes, from, to, opts, mode) {
    const slice = notes.slice(from, to + 1);
    const result = getAuto()(slice, Object.assign(cloneOpts(opts), { 滚奏: mode }));
    const pairs = [];
    for (let i = 0; i < (result.rollPairs || []).length; i++) {
      const p = result.rollPairs[i];
      pairs.push([p[0] + from, p[1] + from]);
    }
    const hands = result.hands || [];
    return { hands: hands, rollPairs: pairs };
  }

  function phraseBounds(notes, index) {
    let a = index;
    let b = index;
    while (a > 0 && continuesFromPrev(notes, a)) a--;
    while (b + 1 < notes.length && continuesFromPrev(notes, b + 1)) b++;
    return { from: a, to: b };
  }

  function beatGap(notes, index) {
    if (!notes || index <= 0 || index >= notes.length) return null;
    const prev = notes[index - 1];
    const cur = notes[index];
    if (!prev || !cur || prev.beat == null || cur.beat == null) return null;
    const delta = cur.beat - prev.beat;
    return isFinite(delta) ? delta : null;
  }

  // 看两颗音之间的间隔，不看某一颗自己是不是散音。
  // 隔了 8 分或更慢就不滚。比 8 分更快（12 / 16 / 24 / 32 分）可以。
  // 0 或负间隔也不是滚奏对。
  function gapAllowsHandmadeRoll(delta) {
    if (delta == null || !isFinite(delta)) return false;
    if (!(delta > BEAT_EPS)) return false;
    return delta < HANDMADE_ROLL_GAP - HANDMADE_GAP_EPS;
  }

  // 同一只手、并且相邻间隔快于 8 分，才连成一段。慢间隔把段切开。
  function fastSameHandRun(notes, hands, index) {
    const h = hands[index];
    let a = index;
    let b = index;
    while (a > 0 && hands[a - 1] === h && gapAllowsHandmadeRoll(beatGap(notes, a))) a--;
    while (b + 1 < hands.length && hands[b + 1] === h && gapAllowsHandmadeRoll(beatGap(notes, b + 1))) b++;
    return { from: a, to: b, len: b - a + 1 };
  }

  // 手动改手之后，在这一句里按新手顺重认滚奏：同一只手、间隔快于 8 分、
  // 正好两下，才是一对。隔了 8 分或更慢的两下保持单击，手顺不改。
  // 三连同手或更长（LLL、RRR、LLLL）整段都不算滚奏，所以 LLLL 不是 (LL)(LL)。
  // 左右交替保持单击。
  function recognizeExactPairRolls(notes, hands, from, to) {
    const pairs = [];
    let i = from;
    while (i <= to) {
      const run = fastSameHandRun(notes, hands, i);
      if (run.len === 2 && run.from >= from && run.to <= to) pairs.push([run.from, run.from + 1]);
      i = Math.max(run.to, i) + 1;
    }
    return pairs;
  }

  function redetectRollsAfterSwap(notes, hands, rollPairs, index) {
    const ph = phraseBounds(notes, index);
    const kept = [];
    for (let i = 0; i < rollPairs.length; i++) {
      const p = rollPairs[i];
      if (p[1] < ph.from || p[0] > ph.to) kept.push(p);
    }
    return addPairs(kept, recognizeExactPairRolls(notes, hands, ph.from, ph.to));
  }

  function applyPatch(state, patch, session) {
    const from = patch.from;
    const to = patch.to;
    if (patch.type === "swap") {
      state.hands[patch.index] = patch.hand === "L" ? "L" : "R";
      state.rollPairs = redetectRollsAfterSwap(session.notes, state.hands, state.rollPairs, patch.index);
      return;
    }
    if (patch.type === "alternate") {
      state.rollPairs = dropOverlapping(state.rollPairs, from, to);
      fillAlternate(state.hands, from, to, directedStart(session, state, from, patch.direction));
      return;
    }
    if (patch.type === "restore") {
      state.rollPairs = dropOverlapping(state.rollPairs, from, to);
      for (let i = from; i <= to; i++) state.hands[i] = session.auto.hands[i];
      const restorePairs = [];
      for (let p = 0; p < session.auto.rollPairs.length; p++) {
        if (pairInside(session.auto.rollPairs[p], from, to)) restorePairs.push(session.auto.rollPairs[p]);
      }
      state.rollPairs = addPairs(state.rollPairs, restorePairs);
      return;
    }
    if (patch.type === "roll") {
      const rolled = rollPairsForRange(session.notes, from, to, session.opts, patch.滚奏 || "自动滚奏");
      state.rollPairs = dropOverlapping(state.rollPairs, from, to);
      for (let i = 0; i < rolled.hands.length; i++) state.hands[from + i] = rolled.hands[i];
      state.rollPairs = addPairs(state.rollPairs, rolled.rollPairs);
      return;
    }
  }

  function rangeDirty(patches, start, end) {
    // A warning range is "confirmed" (no longer 待确认) if a later
    // roll / alternate / swap touches it, unless a still-later restore
    // covers the whole warning range again.
    let dirty = false;
    for (let i = 0; i < (patches || []).length; i++) {
      const p = patches[i];
      if (p.type === "swap") {
        if (p.index >= start && p.index <= end) dirty = true;
        continue;
      }
      const overlaps = p.to >= start && p.from <= end;
      if (!overlaps) continue;
      if (p.type === "restore") {
        if (p.from <= start && p.to >= end) dirty = false;
        continue;
      }
      if (p.type === "roll" || p.type === "alternate") dirty = true;
    }
    return dirty;
  }

  function resolve(session) {
    const auto = session.auto;
    const state = {
      hands: (auto.hands || []).slice(),
      rollPairs: clonePairs(auto.rollPairs),
    };
    for (let i = 0; i < session.patches.length; i++) {
      applyPatch(state, session.patches[i], session);
    }
    const warnings = [];
    for (let w = 0; w < (auto.warnings || []).length; w++) {
      const item = auto.warnings[w];
      if (item[2] === "同拍重复" || !rangeDirty(session.patches, item[0], item[1])) {
        warnings.push([item[0], item[1], item[2]]);
      }
    }
    return {
      hands: state.hands,
      rollPairs: state.rollPairs,
      warnings: warnings,
      source: session.source || "auto",
      patches: clonePatches(session.patches),
    };
  }

  /**
   * Extract sticking hands + roll pairs from engine events (one event per
   * chart note; both-hand big notes count once; inserted notes skipped).
   */
  function resolvedFromEvents(events) {
    const evs = events || [];
    const hands = [];
    const rollIdx = [];
    const seen = Object.create(null);
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.inserted) continue;
      if (e.both && e.hand === "L") continue;
      const key = e.src != null ? String(e.src) : ("t:" + e.t + ":" + i);
      if (seen[key]) continue;
      seen[key] = true;
      const idx = hands.length;
      hands.push(e.hand === "L" ? "L" : "R");
      if (e.grip === "roll") rollIdx.push(idx);
    }
    const rollPairs = [];
    let k = 0;
    while (k < rollIdx.length) {
      if (k + 1 < rollIdx.length && rollIdx[k + 1] === rollIdx[k] + 1) {
        rollPairs.push([rollIdx[k], rollIdx[k + 1]]);
        k += 2;
      } else {
        k += 1;
      }
    }
    return { hands: hands, rollPairs: rollPairs, warnings: [] };
  }

  return {
    createSession: createSession,
    createSessionFromResolved: createSessionFromResolved,
    applyRoll: applyRoll,
    applyAlternate: applyAlternate,
    applyRestore: applyRestore,
    applySwap: applySwap,
    setOptions: setOptions,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    resolve: resolve,
    resolvedFromEvents: resolvedFromEvents,
  };
});
