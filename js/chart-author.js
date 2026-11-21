/**
 * Blank charts and 16th-grid note edits. Pure functions, no DOM.
 *
 * A blank chart is rests only: TITLE from the 歌名 field (default 未命名),
 * BPM from the field (default 120), 8 measures of 16ths, no original-song
 * header. After it is open, TITLE and BPM can be rewritten without touching
 * the measures. Placing or deleting a note rewrites that measure's slots.
 * Handmade / imported 手顺 is shifted onto the surviving notes and is not
 * regenerated here.
 *
 * Browser: window.BachiChartAuthor. Node: module.exports.
 */
(function (root, factory) {
  function load(name, globalName) {
    if (typeof require === "function") {
      try { return require(name); } catch (err) { /* fall through */ }
    }
    return root[globalName] || null;
  }
  const api = factory(load("./parser.js", "TaikoParser"), load("./hand-edits.js", "BachiHandEdits"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BachiChartAuthor = api;
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function (parser, edits) {
  "use strict";

  const DEFAULTS = { bpm: 120, measures: 8, title: "未命名" };
  const PLAY = { "1": true, "2": true, "3": true, "4": true };
  const BEAT_EPS = 1e-9;

  function cleanTitle(title) {
    if (title == null) return DEFAULTS.title;
    const s = String(title).replace(/[\r\n]+/g, " ").trim();
    return s ? s : DEFAULTS.title;
  }

  function normalizeBlankOptions(opts) {
    opts = opts || {};
    let bpm = opts.bpm == null || opts.bpm === "" ? DEFAULTS.bpm : +opts.bpm;
    if (!isFinite(bpm) || bpm <= 0) bpm = DEFAULTS.bpm;
    if (bpm > 999) bpm = 999;
    let measures = opts.measures == null || opts.measures === "" ? DEFAULTS.measures : Math.round(+opts.measures);
    if (!isFinite(measures) || measures < 1) measures = DEFAULTS.measures;
    if (measures > 512) measures = 512;
    const title = cleanTitle(opts.title);
    return { bpm: bpm, measures: measures, title: title };
  }

  function formatBpm(bpm) {
    if (Math.abs(bpm - Math.round(bpm)) < 1e-9) return String(Math.round(bpm));
    return String(bpm);
  }

  function upsertHeader(text, key, value) {
    const re = new RegExp("^" + key + "\\s*:.*$", "im");
    const line = key + ":" + value;
    if (re.test(text)) return text.replace(re, function () { return line; });
    const at = text.search(/^#START\b/im);
    if (at >= 0) return text.slice(0, at) + line + "\n" + text.slice(at);
    if (!text) return line + "\n";
    return line + "\n" + text;
  }

  // Rewrite TITLE and/or BPM on an existing chart. Measures and notes stay.
  function applyChartMeta(tja, patch) {
    patch = patch || {};
    let text = String(tja == null ? "" : tja);
    if (Object.prototype.hasOwnProperty.call(patch, "title")) {
      text = upsertHeader(text, "TITLE", cleanTitle(patch.title));
    }
    if (Object.prototype.hasOwnProperty.call(patch, "bpm")) {
      const bpm = normalizeBlankOptions({ bpm: patch.bpm }).bpm;
      text = upsertHeader(text, "BPM", formatBpm(bpm));
    }
    return text;
  }

  function blankTja(opts) {
    const o = normalizeBlankOptions(opts);
    const lines = [
      "TITLE:" + o.title,
      "BPM:" + formatBpm(o.bpm),
      "OFFSET:0",
      "",
      "#START",
    ];
    const rest = "0".repeat(16);
    for (let i = 0; i < o.measures; i++) lines.push(rest + ",");
    lines.push("#END", "");
    return lines.join("\n");
  }

  function getParser() {
    const mod = parser || (typeof require === "function" ? require("./parser.js") : null)
      || (typeof globalThis !== "undefined" ? globalThis.TaikoParser : null);
    if (!mod || typeof mod.parseTja !== "function") throw new Error("找不到 TJA 解析");
    return mod;
  }

  function getEdits() {
    const mod = edits || (typeof require === "function" ? require("./hand-edits.js") : null)
      || (typeof globalThis !== "undefined" ? globalThis.BachiHandEdits : null);
    if (!mod || typeof mod.resolve !== "function") throw new Error("找不到手顺编辑");
    return mod;
  }

  function chartHasNotes(tja) {
    const text = String(tja || "");
    if (!text.trim()) return false;
    try {
      const parsed = getParser().parseTja(text);
      return (parsed.notes || []).length > 0;
    } catch (err) {
      return true;
    }
  }

  function noteChar(face, size) {
    const ka = face === "ka";
    const big = size === "big";
    if (ka && big) return "4";
    if (ka) return "2";
    if (big) return "3";
    return "1";
  }

  function sixteenthCount(measure) {
    const beats = measure && measure.beats != null ? measure.beats : 4;
    const n = Math.round(beats * 4);
    return n > 0 ? n : 16;
  }

  function findCourseSpan(text) {
    const raw = String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    const lines = raw.split("\n");
    let start = -1;
    let end = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/\/\/.*$/, "").trim();
      if (start < 0 && /^#START\b/i.test(line)) start = i;
      else if (start >= 0 && /^#END\b/i.test(line)) { end = i; break; }
    }
    if (start < 0 || end < 0) throw new Error("谱面里没有 #START");
    return { lines: lines, start: start, end: end };
  }

  function splitBody(body) {
    const measures = [];
    let buf = "";
    for (let i = 0; i < body.length; i++) {
      if (body.charAt(i) === ",") {
        measures.push(buf);
        buf = "";
      } else {
        buf += body.charAt(i);
      }
    }
    return { measures: measures, tail: buf };
  }

  function describeChunk(chunk) {
    const lines = String(chunk).split("\n");
    const prefix = [];
    const slotLines = [];
    let started = false;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].replace(/\/\/.*$/, "").trim();
      const isCmd = !trimmed || trimmed.charAt(0) === "#";
      if (!started && isCmd) prefix.push(lines[i]);
      else {
        started = true;
        slotLines.push(lines[i]);
      }
    }
    let slots = "";
    for (let i = 0; i < slotLines.length; i++) {
      const stripped = slotLines[i].replace(/\/\/.*$/, "");
      for (let c = 0; c < stripped.length; c++) {
        const ch = stripped.charAt(c);
        if (ch >= "0" && ch <= "9") slots += ch;
      }
    }
    let inline = false;
    for (let i = 0; i < slotLines.length; i++) {
      const trimmed = slotLines[i].replace(/\/\/.*$/, "").trim();
      if (trimmed.charAt(0) === "#") inline = true;
    }
    return { prefix: prefix, slotLines: slotLines, slots: slots, inline: inline, chunk: chunk };
  }

  function loadCourse(tja) {
    const parsed = getParser().parseTja(tja);
    const course = (parsed.courses && parsed.courses[0]) || parsed;
    const span = findCourseSpan(tja);
    const body = span.lines.slice(span.start + 1, span.end).join("\n");
    const split = splitBody(body);
    if (split.measures.length !== (course.measures || []).length) {
      throw new Error("小节数量对不上");
    }
    const measures = [];
    for (let i = 0; i < split.measures.length; i++) {
      const described = describeChunk(split.measures[i]);
      described.edited = false;
      measures.push(described);
    }
    return { parsed: parsed, course: course, span: span, measures: measures, tail: split.tail };
  }

  function renderMeasure(m) {
    if (!m.edited) return m.chunk + ",";
    let out = m.prefix.join("\n");
    if (out && !out.endsWith("\n")) out += "\n";
    if (!out && String(m.chunk).charAt(0) === "\n") out = "\n";
    out += m.slots;
    return out + ",";
  }

  function commitCourse(model) {
    const lines = model.span.lines;
    const head = lines.slice(0, model.span.start + 1).join("\n");
    let body = "";
    for (let i = 0; i < model.measures.length; i++) body += renderMeasure(model.measures[i]);
    body += model.tail;
    const foot = lines.slice(model.span.end).join("\n");
    return head + "\n" + body + (foot ? "\n" + foot : "");
  }

  function resampleSlots(slots, count) {
    const old = String(slots || "");
    if (old.length === count) return old.split("");
    const next = [];
    for (let i = 0; i < count; i++) next.push("0");
    if (!old.length) return next;
    for (let p = 0; p < old.length; p++) {
      const ch = old.charAt(p);
      if (ch === "0") continue;
      let cell = Math.round(p * count / old.length);
      if (cell >= count) cell = count - 1;
      if (cell < 0) cell = 0;
      if (next[cell] !== "0" && next[cell] !== ch) {
        throw new Error("16 分网格放不下这一小节里的音符");
      }
      next[cell] = ch;
    }
    return next;
  }

  function playableBefore(model, at, slots, cell) {
    let idx = 0;
    for (let m = 0; m < at; m++) {
      const s = model.measures[m].slots;
      for (let i = 0; i < s.length; i++) {
        if (PLAY[s.charAt(i)]) idx += 1;
      }
    }
    for (let i = 0; i < cell && i < slots.length; i++) {
      if (PLAY[slots[i]]) idx += 1;
    }
    return idx;
  }

  function prepareMeasure(model, measureIndex) {
    const list = model.course.measures || [];
    let at = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].index === measureIndex) { at = i; break; }
    }
    if (at < 0) throw new Error("没有这一小节");
    const measure = model.measures[at];
    if (measure.inline) throw new Error("这一小节里有变速或延迟，还不能在格子上改");
    const count = sixteenthCount(list[at]);
    const slots = resampleSlots(measure.slots, count);
    return { at: at, count: count, slots: slots };
  }

  function placeNote(tja, spec) {
    spec = spec || {};
    const model = loadCourse(tja);
    const prepared = prepareMeasure(model, spec.measure | 0);
    const cell = spec.cell | 0;
    if (cell < 0 || cell >= prepared.count) throw new Error("格子超出 16 分网格");
    if (PLAY[prepared.slots[cell]]) return { tja: tja, index: -1, changed: false };
    const ch = noteChar(spec.face, spec.size);
    const index = playableBefore(model, prepared.at, prepared.slots, cell);
    prepared.slots[cell] = ch;
    const target = model.measures[prepared.at];
    target.slots = prepared.slots.join("");
    target.edited = true;
    return { tja: commitCourse(model), index: index, changed: true };
  }

  function deleteNote(tja, spec) {
    spec = spec || {};
    const model = loadCourse(tja);
    const prepared = prepareMeasure(model, spec.measure | 0);
    const cell = spec.cell | 0;
    if (cell < 0 || cell >= prepared.count) throw new Error("格子超出 16 分网格");
    if (!PLAY[prepared.slots[cell]]) return { tja: tja, index: -1, changed: false };
    const index = playableBefore(model, prepared.at, prepared.slots, cell);
    prepared.slots[cell] = "0";
    const target = model.measures[prepared.at];
    target.slots = prepared.slots.join("");
    target.edited = true;
    return { tja: commitCourse(model), index: index, changed: true };
  }

  function appendMeasure(tja) {
    const model = loadCourse(tja);
    const list = model.course.measures || [];
    const count = list.length ? sixteenthCount(list[list.length - 1]) : 16;
    model.measures.push({
      prefix: [],
      slotLines: [],
      slots: "0".repeat(count),
      inline: false,
      chunk: "",
      edited: true,
    });
    return { tja: commitCourse(model), measures: model.measures.length, changed: true };
  }

  function shouldRegenerate(session) {
    if (!session) return true;
    if (session.source === "hand-json") return false;
    if (session.authored) return false;
    if (session.patches && session.patches.length) return false;
    const stacks = (session.past || []).concat(session.future || []);
    for (let i = 0; i < stacks.length; i++) {
      if (stacks[i] && stacks[i].length) return false;
    }
    return true;
  }

  function shiftHands(hands, at, dir, inserted) {
    const next = (hands || []).slice();
    if (dir > 0) next.splice(at, 0, inserted === "L" ? "L" : "R");
    else if (at >= 0 && at < next.length) next.splice(at, 1);
    return next;
  }

  function shiftPairs(pairs, at, dir) {
    const out = [];
    for (let i = 0; i < (pairs || []).length; i++) {
      let a = pairs[i][0];
      let b = pairs[i][1];
      if (dir < 0 && (a === at || b === at)) continue;
      if (dir > 0) {
        if (a >= at) a += 1;
        if (b >= at) b += 1;
      } else {
        if (a > at) a -= 1;
        if (b > at) b -= 1;
      }
      if (a > b) { const s = a; a = b; b = s; }
      if (b === a + 1) out.push([a, b]);
    }
    return out;
  }

  function shiftRange(from, to, at, dir) {
    if (dir > 0) {
      if (at <= from) return [{ from: from + 1, to: to + 1 }];
      if (at > to) return [{ from: from, to: to }];
      const parts = [];
      if (from <= at - 1) parts.push({ from: from, to: at - 1 });
      if (at + 1 <= to + 1) parts.push({ from: at + 1, to: to + 1 });
      return parts;
    }
    if (to < at) return [{ from: from, to: to }];
    if (from > at) return [{ from: from - 1, to: to - 1 }];
    const start = from === at ? at : from;
    const end = to - 1;
    if (end < start) return [];
    return [{ from: start, to: end }];
  }

  function shiftPatch(patch, at, dir) {
    if (!patch) return [];
    if (patch.type === "swap") {
      if (dir < 0 && patch.index === at) return [];
      const next = Object.assign({}, patch);
      if (dir > 0 && next.index >= at) next.index += 1;
      if (dir < 0 && next.index > at) next.index -= 1;
      return [next];
    }
    const ranges = shiftRange(patch.from, patch.to, at, dir);
    const out = [];
    for (let i = 0; i < ranges.length; i++) {
      out.push(Object.assign({}, patch, ranges[i]));
    }
    return out;
  }

  function shiftPatchList(list, at, dir) {
    const out = [];
    for (let i = 0; i < (list || []).length; i++) {
      const parts = shiftPatch(list[i], at, dir);
      for (let j = 0; j < parts.length; j++) out.push(parts[j]);
    }
    return out;
  }

  function shiftWarnings(warnings, at, dir) {
    const out = [];
    for (let i = 0; i < (warnings || []).length; i++) {
      const w = warnings[i];
      const ranges = shiftRange(w[0], w[1], at, dir);
      for (let j = 0; j < ranges.length; j++) out.push([ranges[j].from, ranges[j].to, w[2]]);
    }
    return out;
  }

  function insertedHand(resolvedHands, index, notes, dominant) {
    const dom = dominant === "L" ? "L" : "R";
    if (index <= 0) return dom;
    const prev = notes[index - 1];
    const cur = notes[index];
    if (!prev || !cur || prev.beat == null || cur.beat == null) return dom;
    if ((cur.beat - prev.beat) > 1 + BEAT_EPS) return dom;
    return resolvedHands[index - 1] === "L" ? "R" : "L";
  }

  /**
   * Keep the current 手顺 attached to the same notes after one insert or delete.
   * Does not run autoSticking. Clears nothing the user already edited; patches
   * move with their notes, and the new note is outside those patches.
   */
  function shiftSession(session, change) {
    if (!session) return session;
    change = change || {};
    const notes = change.notes || session.notes || [];
    const index = change.index | 0;
    const dir = change.type === "delete" ? -1 : 1;
    if (dir < 0 && (index < 0 || index >= (session.notes || []).length)) return session;
    const resolved = getEdits().resolve(session);
    const hand = dir > 0 ? insertedHand(resolved.hands || [], index, notes, change.dominant) : null;
    const auto = session.auto || { hands: [], rollPairs: [], warnings: [] };
    auto.hands = shiftHands(auto.hands, index, dir, hand);
    auto.rollPairs = shiftPairs(auto.rollPairs, index, dir);
    auto.warnings = shiftWarnings(auto.warnings, index, dir);
    session.auto = auto;
    session.patches = shiftPatchList(session.patches, index, dir);
    session.past = (session.past || []).map(function (list) { return shiftPatchList(list, index, dir); });
    session.future = (session.future || []).map(function (list) { return shiftPatchList(list, index, dir); });
    session.notes = notes;
    session.authored = true;
    return session;
  }

  return {
    DEFAULTS: DEFAULTS,
    normalizeBlankOptions: normalizeBlankOptions,
    blankTja: blankTja,
    applyChartMeta: applyChartMeta,
    chartHasNotes: chartHasNotes,
    noteChar: noteChar,
    placeNote: placeNote,
    deleteNote: deleteNote,
    appendMeasure: appendMeasure,
    shouldRegenerate: shouldRegenerate,
    shiftSession: shiftSession,
  };
});
