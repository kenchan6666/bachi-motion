/**
 * TJA parser + 主人-mode 1-1 手顺 generator.
 * Works in the browser (window.TaikoParser) and in Node (module.exports).
 *
 * Supported TJA subset (溯溯 rules):
 *   Headers: TITLE, SUBTITLE, BPM, OFFSET, COURSE, LEVEL
 *   Body:    #START … #END, #MEASURE x/y, #BPMCHANGE, #DELAY
 *   Notes:   0 rest, 1 咚, 2 咔, 3 大咚, 4 大咔
 *            5/6/7 (黄条) and 8 (气球) occupy a time slot but emit no event.
 *   Multiple COURSE blocks are all parsed; pick one with opts.course
 *   (default: the first / only block).
 *
 * 手顺 (主人 mode):
 *   Start on R, then alternate R L R L…
 *   A rest longer than one beat (one quarter note at the current BPM)
 *     resets the next note to R. A gap of exactly one beat does not.
 *   Big notes (3/4) follow opts.bigNote (default "single"):
 *     single — one hand in the R/L sequence, drawn big; do not reset to R afterwards
 *     both   — both hands at once; the next note continues the sequence (no reset to R)
 *     small  — treated as a normal small note (one hand, drawn small)
 *   All auto-assigned notes use the full-grip single hit.
 *   Rolls are NEVER auto-guessed from the TJA — they come only from
 *   `(xx)` pinch-pairs in 溯溯's 手顺 JSON (see loadHandJson / parseSticking).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TaikoParser = factory();
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const NOTE_TYPE = {
    "1": "don",
    "2": "ka",
    "3": "bigdon",
    "4": "bigka",
  };

  function stripComment(line) {
    const i = line.indexOf("//");
    return i >= 0 ? line.slice(0, i) : line;
  }

  function parseHeaderValue(raw, key) {
    const re = new RegExp("^" + key + "\\s*:\\s*(.*)$", "i");
    const m = raw.match(re);
    return m ? m[1].trim() : null;
  }

  function parseFraction(s, fallback) {
    const m = String(s).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!m) return fallback;
    const num = +m[1], den = +m[2];
    if (!den) return fallback;
    return { num, den };
  }

  function emptyHeaders() {
    return { title: "", subtitle: "", bpm: 120, offset: 0, course: "", level: "" };
  }

  function applyHeader(headers, line) {
    const title = parseHeaderValue(line, "TITLE");
    if (title != null) { headers.title = title; return true; }
    const subtitle = parseHeaderValue(line, "SUBTITLE");
    if (subtitle != null) { headers.subtitle = subtitle; return true; }
    const bpm = parseHeaderValue(line, "BPM");
    if (bpm != null && isFinite(+bpm)) { headers.bpm = +bpm; return true; }
    const offset = parseHeaderValue(line, "OFFSET");
    if (offset != null && isFinite(+offset)) { headers.offset = +offset; return true; }
    const course = parseHeaderValue(line, "COURSE");
    if (course != null) { headers.course = course; return true; }
    const level = parseHeaderValue(line, "LEVEL");
    if (level != null) { headers.level = level; return true; }
    return false;
  }

  function parseBody(rawLines, startIndex, headers) {
    let bpm = headers.bpm;
    let measure = { num: 4, den: 4 };
    let time = 0;
    let measureIndex = 0;
    // Tokens in the current (unclosed) measure: {type:"slot", ch} | {type:"bpm", value} | {type:"delay", value}.
    // Mid-measure #BPMCHANGE / #DELAY must take effect from that point on, not retroactively.
    let items = [];
    const notes = [];
    const measures = [];
    let i = startIndex;
    let ended = false;

    function inMeasure() {
      return items.some((it) => it.type === "slot");
    }

    function flushMeasure() {
      const slotChars = items.filter((it) => it.type === "slot").map((it) => it.ch);
      const n = slotChars.length;
      measureIndex += 1;
      const beats = (measure.num / measure.den) * 4;
      const t0 = time;
      let curBpm = bpm;
      let tCursor = time;
      let count = 0;
      let pos = 0;

      if (n === 0) {
        const duration = beats * (60 / curBpm);
        measures.push({
          index: measureIndex,
          tRaw: t0,
          t: t0 - headers.offset,
          duration,
          beats,
          bpm: curBpm,
          measure: { num: measure.num, den: measure.den },
          slots: 0,
          notes: 0,
          slotTimes: [],
        });
        time = t0 + duration;
        items = [];
        return;
      }

      const slotBeats = beats / n;
      const slotTimes = [];
      for (const it of items) {
        if (it.type === "bpm") {
          curBpm = it.value;
          continue;
        }
        if (it.type === "delay") {
          tCursor += it.value;
          continue;
        }
        const beatDur = 60 / curBpm;
        slotTimes.push(tCursor - headers.offset);
        const typ = NOTE_TYPE[it.ch];
        if (typ) {
          notes.push({
            tRaw: tCursor,
            t: tCursor - headers.offset,
            type: typ,
            char: it.ch,
            measure: measureIndex,
            pos: pos,
            slots: n,
            bpm: curBpm,
            beatDur,
            measureBeats: beats,
          });
          count += 1;
        }
        tCursor += slotBeats * beatDur;
        pos += 1;
      }

      const duration = tCursor - t0;
      measures.push({
        index: measureIndex,
        tRaw: t0,
        t: t0 - headers.offset,
        duration,
        beats,
        bpm: curBpm,
        measure: { num: measure.num, den: measure.den },
        slots: n,
        notes: count,
        slotTimes: slotTimes,
      });
      time = tCursor;
      bpm = curBpm;
      items = [];
    }

    for (; i < rawLines.length && !ended; i++) {
      const line = stripComment(rawLines[i]).trim();
      if (!line) continue;
      if (/^#START\b/i.test(line)) continue;
      if (/^#END\b/i.test(line)) {
        if (items.length) flushMeasure();
        ended = true;
        break;
      }
      const meas = line.match(/^#MEASURE\s+(.+)$/i);
      if (meas) {
        const frac = parseFraction(meas[1], null);
        if (!frac) throw new Error("无法解析 #MEASURE " + meas[1]);
        measure = frac;
        continue;
      }
      const bpmCh = line.match(/^#BPMCHANGE\s+(-?\d+(?:\.\d+)?)\s*$/i);
      if (bpmCh) {
        const v = +bpmCh[1];
        if (!isFinite(v) || v <= 0) throw new Error("无效的 #BPMCHANGE " + bpmCh[1]);
        if (inMeasure()) items.push({ type: "bpm", value: v });
        else bpm = v;
        continue;
      }
      const delay = line.match(/^#DELAY\s+(-?\d+(?:\.\d+)?)\s*$/i);
      if (delay) {
        const v = +delay[1];
        if (!isFinite(v)) throw new Error("无效的 #DELAY " + delay[1]);
        if (inMeasure()) items.push({ type: "delay", value: v });
        else time += v;
        continue;
      }
      if (line.charAt(0) === "#") continue;
      for (let c = 0; c < line.length; c++) {
        const ch = line.charAt(c);
        if (ch === ",") { flushMeasure(); continue; }
        if (ch === " " || ch === "\t" || ch === "|") continue;
        items.push({ type: "slot", ch: ch });
      }
    }
    if (!ended && items.length) flushMeasure();
    if (!measureIndex) throw new Error("#START 和 #END 之间没有小节");
    return {
      notes,
      measures,
      duration: time - headers.offset,
      nextIndex: i,
    };
  }

  /**
   * Parse a TJA string into global headers + one or more COURSE blocks.
   * Note times are in seconds, already offset-adjusted:
   *   t_final = t_raw - OFFSET  (standard TJA; OFFSET 0 → first note at 0).
   * The first course is also exposed at the top level (notes / measures / headers)
   * so older callers keep working.
   */
  function parseTja(text) {
    if (text == null) throw new Error("空的谱面");
    const rawLines = String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");

    const global = emptyHeaders();
    let pending = emptyHeaders();
    const courses = [];
    let seenStart = false;

    for (let i = 0; i < rawLines.length; i++) {
      const line = stripComment(rawLines[i]).trim();
      if (!line) continue;
      if (/^#START\b/i.test(line)) {
        seenStart = true;
        const headers = {
          title: pending.title || global.title,
          subtitle: pending.subtitle || global.subtitle,
          bpm: pending.bpm || global.bpm,
          offset: pending.offset || global.offset,
          course: pending.course,
          level: pending.level,
        };
        // If BPM was never set on pending (still the 120 default) but global
        // was set, prefer global — already handled by the copy above when
        // pending.bpm is the default only if neither was written. Track
        // writes via applyHeader, so pending.bpm is either default or set.
        if (pending.bpm === 120 && global.bpm !== 120) headers.bpm = global.bpm;
        if (pending.offset === 0 && global.offset !== 0) headers.offset = global.offset;
        const body = parseBody(rawLines, i, headers);
        courses.push({ headers, notes: body.notes, measures: body.measures, duration: body.duration });
        i = body.nextIndex;
        pending = {
          title: global.title,
          subtitle: global.subtitle,
          bpm: global.bpm,
          offset: global.offset,
          course: "",
          level: "",
        };
        continue;
      }
      if (applyHeader(pending, line)) {
        if (!seenStart) {
          applyHeader(global, line);
        }
        continue;
      }
    }

    if (!courses.length) throw new Error("谱面里没有 #START");

    const first = courses[0];
    return {
      headers: first.headers,
      notes: first.notes,
      measures: first.measures,
      duration: first.duration,
      courses,
    };
  }

  function pickCourse(parsed, name) {
    const courses = parsed.courses || [];
    if (!courses.length) throw new Error("谱面里没有任何 COURSE");
    if (name == null || name === "") return courses[0];
    const key = String(name).trim().toLowerCase();
    const hit = courses.find((c) => String(c.headers.course || "").toLowerCase() === key);
    if (!hit) {
      const names = courses.map((c) => c.headers.course || "(未命名)").join("、");
      throw new Error("找不到 COURSE «" + name + "». 谱面里有：" + names);
    }
    return hit;
  }

  function parseMeasuresOpt(s) {
    if (s == null || s === "") return null;
    if (Array.isArray(s)) {
      const from = +s[0], to = +s[1];
      if (!isFinite(from) || !isFinite(to) || from < 1 || to < from) {
        throw new Error("小节范围无效");
      }
      return { from: from | 0, to: to | 0 };
    }
    const m = String(s).trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (!m) throw new Error("小节范围格式应为 A-B，例如 119-120");
    const from = +m[1], to = +m[2];
    if (from < 1 || to < from) throw new Error("小节范围无效: " + s);
    return { from, to };
  }

  /**
   * Crop a course to an inclusive 1-based measure range and shift times so
   * the first selected measure starts at t = 0.
   */
  function sliceCourse(course, range) {
    if (!range) {
      return {
        headers: course.headers,
        notes: course.notes.slice(),
        measures: course.measures.slice(),
        duration: course.duration,
        rangeStart: course.measures.length ? course.measures[0].t : 0,
        rangeEnd: course.measures.length
          ? course.measures[course.measures.length - 1].t + course.measures[course.measures.length - 1].duration
          : course.duration,
        timeShift: 0,
      };
    }
    const { from, to } = range;
    const lastIndex = course.measures.length;
    if (from > lastIndex) {
      throw new Error("小节范围 " + from + "-" + to + " 超出谱面（共 " + lastIndex + " 小节）");
    }
    const toClamped = Math.min(to, lastIndex);
    const meas = course.measures.filter((m) => m.index >= from && m.index <= toClamped);
    if (!meas.length) throw new Error("小节范围 " + from + "-" + to + " 里没有小节");
    const t0 = meas[0].t;
    const t1 = meas[meas.length - 1].t + meas[meas.length - 1].duration;
    const notes = course.notes
      .filter((n) => n.measure >= from && n.measure <= toClamped)
      .map((n) => Object.assign({}, n, { t: n.t - t0, tRaw: n.tRaw - t0 }));
    const measures = meas.map((m) => Object.assign({}, m, {
      t: m.t - t0,
      tRaw: m.tRaw - t0,
      slotTimes: Array.isArray(m.slotTimes) ? m.slotTimes.map((s) => s - t0) : [],
    }));
    return {
      headers: course.headers,
      notes,
      measures,
      duration: t1 - t0,
      rangeStart: 0,
      rangeEnd: t1 - t0,
      measureFrom: from,
      measureTo: toClamped,
      timeShift: t0,
    };
  }

  /** Normalize the 大音符 setting: "single" (default) | "both" | "small". */
  function normBigMode(v) {
    const s = String(v == null ? "" : v).trim().toLowerCase();
    if (s === "both" || s === "hands" || s === "双手" || s === "2") return "both";
    if (s === "small" || s === "assmall" || s === "as-small" || s === "as_small" ||
        s === "当小音符" || s === "3") return "small";
    return "single";
  }

  /**
   * Assign 1-1 手顺 to parsed notes (主人 mode).
   * Returns the event stream the animation engine consumes.
   *
   * bigMode (default "single"):
   *   single — a big note is one hit by the hand that is up in the sequence,
   *            drawn big; afterwards the sequence continues (no reset to R).
   *   both   — a big note is both hands at once; the "main" hand is the one
   *            that was up, and the next note continues from there (no reset).
   *   small  — a big note is treated as a normal small note.
   *
   * Hand order is computed on the notes actually passed in (so a measure
   * crop starts fresh on R, matching "play this passage from the top").
   */
  function assignHands(parsed, bigMode) {
    bigMode = normBigMode(bigMode);
    const events = [];
    let nextHand = "R";
    let lastT = null;
    let lastBeatDur = null;

    for (const n of parsed.notes) {
      const isBig = n.type === "bigdon" || n.type === "bigka";
      const face = (n.type === "don" || n.type === "bigdon") ? "don" : "ka";
      const src = n.measure + ":" + n.pos;

      // 超过一拍的休止：下一颗（含大音符）从右手起。大音符打完本身不再额外重置。
      if (lastT != null) {
        const gap = n.t - lastT;
        if (gap > lastBeatDur + 1e-6) nextHand = "R";
      }

      const base = {
        t: n.t,
        face,
        grip: "single",
        inserted: false,
        src,
        type: n.type,
        measure: n.measure,
        pos: n.pos,
        bpm: n.bpm,
      };

      if (isBig && bigMode === "both") {
        events.push(Object.assign({}, base, { hand: "R", both: true, big: true }));
        events.push(Object.assign({}, base, { hand: "L", both: true, big: true }));
        nextHand = nextHand === "R" ? "L" : "R";
      } else if (isBig && bigMode === "single") {
        events.push(Object.assign({}, base, { hand: nextHand, both: false, big: true }));
        nextHand = nextHand === "R" ? "L" : "R";
      } else {
        events.push(Object.assign({}, base, { hand: nextHand, both: false, big: false }));
        nextHand = nextHand === "R" ? "L" : "R";
      }
      lastT = n.t;
      lastBeatDur = n.beatDur;
    }

    return events;
  }

  function coursePayload(course, extra) {
    return Object.assign({
      song: course.headers.title || "",
      passage: course.headers.subtitle || "",
      bpm: course.headers.bpm,
      offset: course.headers.offset,
      course: course.headers.course,
      level: course.headers.level,
      headers: course.headers,
      measures: course.measures,
      duration: course.duration,
      rangeStart: course.rangeStart,
      rangeEnd: course.rangeEnd,
      timeShift: course.timeShift || 0,
    }, extra || {});
  }

  /** Parse TJA and return the engine-ready payload. opts: { course, measures }. */
  function eventsFromTja(text, opts) {
    const parsed = parseTja(text);
    const picked = pickCourse(parsed, opts && opts.course);
    const sliced = sliceCourse(picked, parseMeasuresOpt(opts && opts.measures));
    const events = assignHands(sliced, opts && (opts.bigNote || opts.bigMode || opts.bignote));
    return coursePayload(sliced, {
      events,
      courses: parsed.courses.map((c) => c.headers.course),
      chartMeasures: picked.measures,
    });
  }

  /** Parse a 手顺 `src` string ("119:12") into { measure, pos }. */
  function parseSrc(src) {
    if (typeof src !== "string") return null;
    const m = src.trim().match(/^(\d+)\s*:\s*(-?\d+)\s*$/);
    if (!m) return null;
    return { measure: +m[1], pos: +m[2] };
  }

  /**
   * Absolute (song-timeline) start time of slot `pos` in measure `M`,
   * using the parser's per-slot times (includes mid-measure #BPMCHANGE / #DELAY).
   * `measures` must be the unsliced chart measures (opts.chartMeasures).
   */
  function slotTimeAbs(measures, src) {
    const parsed = typeof src === "string" || src == null ? parseSrc(src) : src;
    if (!parsed || !measures || !measures.length) return null;
    const meas = measures.find((m) => m.index === parsed.measure);
    if (!meas) return null;
    if (Array.isArray(meas.slotTimes) && parsed.pos >= 0 && parsed.pos < meas.slotTimes.length) {
      return meas.slotTimes[parsed.pos];
    }
    if (meas.slots > 0 && parsed.pos >= 0) {
      return meas.t + (parsed.pos / meas.slots) * meas.duration;
    }
    return meas.t;
  }

  /**
   * Parse 溯溯's sticking string.
   * `(RR)(LL)` is a roll pinch-pair (same hand twice, then switch).
   * Bare `R`/`L` are single hits. Other characters are ignored.
   */
  function parseSticking(str) {
    const out = [];
    const s = String(str == null ? "" : str);
    for (let i = 0; i < s.length; ) {
      const c = s[i];
      if (c === "(") {
        const j = s.indexOf(")", i + 1);
        if (j < 0) throw new Error("手顺 sticking 里有未闭合的 '('");
        const inside = s.slice(i + 1, j);
        for (let k = 0; k < inside.length; k++) {
          const ch = inside[k];
          if (ch === "R" || ch === "r") out.push({ hand: "R", roll: true });
          else if (ch === "L" || ch === "l") out.push({ hand: "L", roll: true });
        }
        i = j + 1;
      } else if (c === "R" || c === "r") {
        out.push({ hand: "R", roll: false }); i++;
      } else if (c === "L" || c === "l") {
        out.push({ hand: "L", roll: false }); i++;
      } else i++;
    }
    return out;
  }

  function applySticking(events, tokens, forceSingle) {
    let k = 0;
    return events.map((e) => {
      const ev = Object.assign({}, e);
      if (k < tokens.length) {
        const tok = tokens[k++];
        ev.hand = tok.hand; // sticking is the authority for 手顺
        ev.grip = tok.roll && !forceSingle ? "roll" : "single";
      } else if (forceSingle) {
        ev.grip = "single";
      }
      return ev;
    });
  }

  /**
   * 溯月 mode hook: a 手顺 JSON written by 溯溯 overrides the auto 1-1 order.
   * Accepted shapes:
   *   { events: [ { t, hand, face, grip, inserted, src, both, big } ] }
   *   [ { t, hand, ... } ]
   * Extra fields (rolls, inserted notes, gold rings) pass through — the
   * animation engine already knows grip:"roll" and inserted:true.
   *
   * `t` in 溯溯's JSON is passage-relative (first event ≈ 0), not song time.
   * When `src` ("M:slot") is present and opts.chartMeasures is provided,
   * each event's time is taken from the chart slot and then expressed on
   * the sliced timeline (first selected bar → t = 0). Events without `src`
   * fall back to a relative-vs-absolute heuristic. No --measures → no shift.
   */

  /**
   * 溯月模式：手（左/右/双）一律跟 JSON 走，全局大音符开关只控制画大/画小。
   * `hand: "both"` 把这一颗展开成同时刻的 R+L（both:true），无视全局开关。
   * 已写成一对（两条 both:true、左右各一）的事件不会再展开。
   */
  function applyBigNoteToHandEvents(events, bigMode) {
    bigMode = normBigMode(bigMode);
    const out = [];
    for (const e of events) {
      const ev = Object.assign({}, e);
      const handRaw = ev.hand == null ? "R" : String(ev.hand);
      const forceBoth = handRaw.toLowerCase() === "both";
      const bigType = ev.type === "bigdon" || ev.type === "bigka";
      const markedBig = ev.big != null ? !!ev.big : !!(bigType || ev.both || forceBoth);
      ev.big = bigMode === "small" ? false : markedBig;
      if (forceBoth) {
        ev.both = true;
        out.push(Object.assign({}, ev, { hand: "R" }));
        out.push(Object.assign({}, ev, { hand: "L" }));
      } else {
        ev.hand = handRaw === "L" || handRaw === "l" ? "L" : "R";
        ev.both = !!ev.both;
        out.push(ev);
      }
    }
    return out;
  }

  function loadHandJson(input, opts) {
    const data = typeof input === "string" ? JSON.parse(input) : input;
    if (!data || typeof data !== "object") throw new Error("手顺 JSON 是空的");
    let events = Array.isArray(data) ? data : data.events;
    if (!Array.isArray(events) || !events.length) {
      throw new Error("手顺 JSON 里没有 events 数组");
    }
    const stickingStr = data.sticking || data.handorder || data.pattern;
    if (typeof stickingStr === "string" && stickingStr.trim()) {
      const tokens = parseSticking(stickingStr);
      const anyParen = stickingStr.indexOf("(") >= 0;
      // 没有括号就绝不当滚奏（滚奏只来自 (xx) 对，不会从密度猜）。
      events = applySticking(events, tokens, !anyParen);
    }
    const range = parseMeasuresOpt(opts && opts.measures);
    const shift = opts && isFinite(+opts.timeShift) ? +opts.timeShift : 0;
    const chartMeasures = (opts && (opts.chartMeasures || opts.measuresChart)) || [];

    if (range) {
      const hasSrc = events.some((e) => parseSrc(e.src));
      if (hasSrc) {
        events = events.filter((e) => {
          const p = parseSrc(e.src);
          if (!p) return true;
          return p.measure >= range.from && p.measure <= range.to;
        });
      }
      if (!events.length) throw new Error("手顺 JSON 在小节 " + range.from + "-" + range.to + " 里没有事件");
    }

    if (range) {
      const remapped = [];
      const leftover = [];
      for (const e of events) {
        const abs = slotTimeAbs(chartMeasures, e.src);
        if (abs != null) remapped.push(Object.assign({}, e, { t: abs - shift }));
        else leftover.push(e);
      }
      if (leftover.length) {
        // No src (or no chart timing): detect passage-relative (min t ≈ 0)
        // vs absolute song time (min t ≈ timeShift) instead of always subtracting.
        const minT = leftover.reduce((m, e) => Math.min(m, +e.t), Infinity);
        const alreadyRelative = !shift || Math.abs(minT) <= Math.abs(minT - shift);
        const adj = alreadyRelative ? 0 : shift;
        leftover.forEach((e) => remapped.push(Object.assign({}, e, { t: e.t - adj })));
      }
      events = remapped;
    }

    events = applyBigNoteToHandEvents(events, opts && (opts.bigNote || opts.bigMode || opts.bignote));

    return {
      song: data.song || "",
      passage: data.passage || "",
      bpm: data.bpm,
      events,
      rangeStart: opts && opts.rangeStart,
      rangeEnd: opts && opts.rangeEnd,
      timeShift: range ? shift : 0,
      source: "hand-json",
    };
  }

  function nearlyEqual(a, b, eps) {
    return Math.abs(a - b) <= (eps == null ? 1e-9 : eps);
  }

  function timesOf(text, opts) {
    return eventsFromTja(text, opts).events.filter((e) => !e.both || e.hand === "R").map((e) => e.t);
  }

  /**
   * Parser self-checks (mid-measure #BPMCHANGE, even subdivisions including
   * 32nds / 16th triplets / quintuplets). Run with `node js/parser.js`.
   */
  function selfCheck() {
    const failures = [];
    function expect(name, got, want) {
      const ok = got.length === want.length && got.every((t, i) => nearlyEqual(t, want[i]));
      if (!ok) {
        failures.push(name + "\n    got  " + got.map((x) => +x.toFixed(10)).join(", ") +
          "\n    want " + want.join(", "));
      }
      return ok;
    }

    // Mid-measure BPMCHANGE: 4/4 @120, "11" then #BPMCHANGE 60 then "11,"
    // Four quarter-note slots: 0.5s + 0.5s at 120, then 1s + 1s at 60 → 0 / 0.5 / 1 / 2.
    const bpmChange = [
      "TITLE:selfcheck",
      "BPM:120",
      "OFFSET:0",
      "#START",
      "11",
      "#BPMCHANGE 60",
      "11,",
      "#END",
      "",
    ].join("\n");
    expect("mid-measure #BPMCHANGE 120→60", timesOf(bpmChange), [0, 0.5, 1, 2]);

    // Mid-measure DELAY: 4/4 @120 four quarters, delay 0.25 after the first two.
    const delayTja = [
      "BPM:120",
      "#START",
      "11",
      "#DELAY 0.25",
      "11,",
      "#END",
      "",
    ].join("\n");
    expect("mid-measure #DELAY 0.25", timesOf(delayTja), [0, 0.5, 1.25, 1.75]);

    // 溯溯的分音测试谱：4/4 @120，每小节 2.0s，槽位数 4,8,12,16,24,32,48（再加一小节大咚）。
    const fs = require("fs");
    const path = require("path");
    function evenTimes(n, duration, t0) {
      const out = [];
      for (let i = 0; i < n; i++) out.push(t0 + (duration * i) / n);
      return out;
    }
    const divPath = path.join(__dirname, "..", "samples", "suyue_division_test.tja");
    if (!fs.existsSync(divPath)) {
      failures.push("missing samples/suyue_division_test.tja");
    } else {
      const div = eventsFromTja(fs.readFileSync(divPath, "utf8"));
      const expectedSlots = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48 };
      const labels = {
        3: "12-slot triplet (2.0/12)",
        5: "24-slot 16th-triplet 三连 (2.0/24)",
        6: "32nd notes (2.0/32)",
        7: "48th notes (2.0/48)",
      };
      for (const [mIndex, n] of Object.entries(expectedSlots)) {
        const idx = +mIndex;
        const meas = div.measures.find((m) => m.index === idx);
        const got = div.events.filter((e) => e.measure === idx && (!e.both || e.hand === "R")).map((e) => e.t);
        const t0 = meas ? meas.t : (idx - 1) * 2;
        const dur = meas ? meas.duration : 2;
        const name = "suyue_division_test m" + idx + " " + (labels[idx] || (n + " slots")) +
          "  step=" + (2 / n) + "  t0=" + t0;
        if (!meas || !nearlyEqual(dur, 2) || meas.slots !== n) {
          failures.push(name + "  bad measure meta slots=" + (meas && meas.slots) + " dur=" + (meas && meas.duration));
        }
        expect(name, got, evenTimes(n, 2, t0));
      }
    }

    // Showcase demos must still parse; practice chart 1 keeps its known times.
    const demoPath = path.join(__dirname, "..", "samples", "suyue_demo.tja");
    if (fs.existsSync(demoPath)) {
      const demo = timesOf(fs.readFileSync(demoPath, "utf8"));
      if (!nearlyEqual(demo[0], 0) || !nearlyEqual(demo[8], 1.5) || !nearlyEqual(demo[24], 3) || !nearlyEqual(demo[demo.length - 1], 6.75)) {
        failures.push("suyue_demo.tja timing regression: first/m2/m3/last = " +
          [demo[0], demo[8], demo[24], demo[demo.length - 1]].join(", "));
      }
    }
    const demo2Path = path.join(__dirname, "..", "samples", "suyue_demo2_8bun16bun.tja");
    if (!fs.existsSync(demo2Path)) {
      failures.push("missing samples/suyue_demo2_8bun16bun.tja");
    } else {
      const demo2 = eventsFromTja(fs.readFileSync(demo2Path, "utf8"));
      if (!demo2.events.length || demo2.headers.title !== "溯溯的练习谱2" || demo2.bpm !== 170) {
        failures.push("suyue_demo2_8bun16bun.tja failed to parse as 练习谱2 @170");
      }
    }

    // --sticking + --measures: JSON t is passage-relative; align by src, not t - timeShift.
    const longBars = [];
    for (let i = 0; i < 118; i++) longBars.push("0000,");
    longBars.push("1212,");
    longBars.push("1212,");
    const longTja = ["BPM:300", "OFFSET:0", "#START"].concat(longBars).concat(["#END", ""]).join("\n");
    const longBase = eventsFromTja(longTja, { measures: "119-120" });
    const relHands = {
      events: [
        { t: 0, hand: "R", face: "don", grip: "single", src: "119:0" },
        { t: 0.2, hand: "L", face: "ka", grip: "single", src: "119:1" },
        { t: 0.4, hand: "R", face: "don", grip: "single", src: "119:2" },
        { t: 0.6, hand: "L", face: "ka", grip: "single", src: "119:3" },
      ],
    };
    const aligned = loadHandJson(relHands, {
      measures: "119-120",
      timeShift: longBase.timeShift,
      chartMeasures: longBase.chartMeasures,
    });
    const alignedT = aligned.events.map((e) => e.t);
    if (longBase.timeShift < 90) {
      failures.push("expected bar 119 to start near 94s, got timeShift=" + longBase.timeShift);
    }
    expect("sticking src-align measures 119-120 (passage-relative t, not t-timeShift)", alignedT, [0, 0.2, 0.4, 0.6]);
    if (alignedT[0] < -1) {
      failures.push("sticking double-shift: first event t=" + alignedT[0] + " (timeShift=" + longBase.timeShift + ")");
    }

    const uncut = loadHandJson(relHands, { chartMeasures: longBase.chartMeasures });
    expect("sticking without --measures keeps JSON t", uncut.events.map((e) => e.t), [0, 0.2, 0.4, 0.6]);

    const midBpmHands = {
      events: [
        { t: 0, hand: "R", face: "don", src: "1:0" },
        { t: 0.5, hand: "L", face: "don", src: "1:1" },
        { t: 1, hand: "R", face: "don", src: "1:2" },
        { t: 2, hand: "L", face: "don", src: "1:3" },
      ],
    };
    const midBase = eventsFromTja(bpmChange);
    const midAligned = loadHandJson(midBpmHands, {
      measures: "1-1",
      timeShift: midBase.timeShift,
      chartMeasures: midBase.chartMeasures,
    });
    expect("sticking src-align follows mid-measure #BPMCHANGE slot times", midAligned.events.map((e) => e.t), [0, 0.5, 1, 2]);

    // Auto 1-1 never emits rolls; (RR)(LL) in hand JSON marks pinch-pairs; no parens → no roll.
    const tja16 = ["BPM:300", "OFFSET:0", "COURSE:Oni", "#START", "11111111,", "#END", ""].join("\n");
    const auto16 = eventsFromTja(tja16);
    if (auto16.events.some((e) => e.grip === "roll")) {
      failures.push("assignHands must never emit grip:roll (rolls come only from JSON parentheses)");
    }
    const evs8 = [];
    for (let i = 0; i < 8; i++) evs8.push({ t: i * 0.05, hand: "R", face: "don", grip: "single", src: "1:" + i });
    const paired = loadHandJson({ sticking: "(RR)(LL)(RR)(LL)", events: evs8 });
    const pairedGrip = paired.events.map((e) => e.grip + e.hand).join(",");
    const wantGrip = "rollR,rollR,rollL,rollL,rollR,rollR,rollL,rollL";
    if (pairedGrip !== wantGrip) {
      failures.push("sticking (RR)(LL) marks pinch-pair rolls and hands\n    got  " + pairedGrip + "\n    want " + wantGrip);
    }
    const bare = loadHandJson({ sticking: "RLRLRLRL", events: evs8.map((e) => Object.assign({}, e, { grip: "roll" })) });
    if (bare.events.some((e) => e.grip === "roll")) {
      failures.push("sticking without parentheses must not produce rolls, even if events said grip:roll");
    }

    // 大音符三选一：1231 @120 四分 → R咚, L咔, 大咚, 下一颗。
    // single: R, L, R(big), L ；both: R, L, 双手(主手 R), L（不重置成 R）；small: R, L, R(小), L。
    const bigTja = ["BPM:120", "OFFSET:0", "#START", "1231,", "#END", ""].join("\n");
    function handsOf(mode) {
      return eventsFromTja(bigTja, { bigNote: mode }).events.map((e) =>
        (e.both ? "both" : e.hand) + (e.big ? "*" : "") + e.face[0]);
    }
    const gotSingle = handsOf("single");
    const wantSingle = ["Rd", "Lk", "R*d", "Ld"];
    if (gotSingle.join(",") !== wantSingle.join(","))
      failures.push("bigNote=single hands\n    got  " + gotSingle.join(",") + "\n    want " + wantSingle.join(","));
    const gotBoth = handsOf("both");
    const wantBoth = ["Rd", "Lk", "both*d", "both*d", "Ld"];
    if (gotBoth.join(",") !== wantBoth.join(","))
      failures.push("bigNote=both hands (no reset to R)\n    got  " + gotBoth.join(",") + "\n    want " + wantBoth.join(","));
    const gotSmall = handsOf("small");
    const wantSmall = ["Rd", "Lk", "Rd", "Ld"];
    if (gotSmall.join(",") !== wantSmall.join(","))
      failures.push("bigNote=small hands\n    got  " + gotSmall.join(",") + "\n    want " + wantSmall.join(","));
    const defHands = handsOf(undefined);
    if (defHands.join(",") !== wantSingle.join(","))
      failures.push("bigNote default must be single, got " + defHands.join(","));

    // 溯月：hand:"both" 展开为 R+L，开关只改画大/画小，不改单双手。
    const jsonBoth = { events: [
      { t: 0, hand: "R", face: "don", big: false },
      { t: 0.5, hand: "both", face: "ka", big: true },
      { t: 1, hand: "L", face: "don", big: true },
    ]};
    const jBoth = loadHandJson(jsonBoth, { bigNote: "single" });
    const jTag = jBoth.events.map((e) => (e.both ? "both" : e.hand) + (e.big ? "*" : "") + e.face[0]).join(",");
    if (jTag !== "Rd,both*k,both*k,L*d")
      failures.push("hand:both expands; big:true kept in single mode\n    got  " + jTag);
    const jSmall = loadHandJson(jsonBoth, { bigNote: "small" });
    const jSmallTag = jSmall.events.map((e) => (e.both ? "both" : e.hand) + (e.big ? "*" : "") + e.face[0]).join(",");
    if (jSmallTag !== "Rd,bothk,bothk,Ld")
      failures.push("溯月 small mode draws small but keeps hand:both\n    got  " + jSmallTag);

    if (failures.length) {
      throw new Error("parser self-check failed:\n- " + failures.join("\n- "));
    }
    return {
      ok: true,
      cases: [
        "mid-measure #BPMCHANGE → 0 / 0.5 / 1 / 2",
        "mid-measure #DELAY",
        "suyue_division_test.tja even spacing (4/8/12/16/24/32/48 @120 4/4)",
        "suyue_demo.tja regression",
        "suyue_demo2_8bun16bun.tja parses",
        "sticking src-align --measures 119-120 (passage-relative, first t≈0 not -94)",
        "sticking without --measures keeps JSON t",
        "sticking src-align follows mid-measure #BPMCHANGE",
        "assignHands never emits roll",
        "sticking (RR)(LL) marks pinch-pair rolls and hands",
        "bigNote=single / both (no reset) / small + default single",
        "hand:both expands; 溯月 switch only changes drawn size",
        "sticking without parentheses produces no rolls",
      ],
    }
  }

  if (typeof require !== "undefined" && require.main === module) {
    const result = selfCheck();
    console.log("parser self-check ok");
    result.cases.forEach((c) => console.log("  ✓ " + c));
  }

  return {
    parseTja,
    pickCourse,
    sliceCourse,
    parseMeasuresOpt,
    assignHands,
    normBigMode,
    applyBigNoteToHandEvents,
    eventsFromTja,
    loadHandJson,
    parseSticking,
    parseSrc,
    slotTimeAbs,
    selfCheck,
    NOTE_TYPE,
  };
});
