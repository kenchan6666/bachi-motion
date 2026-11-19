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
 *   Big notes (3/4) are both hands at once; the following note also starts on R.
 *   All auto-assigned notes use the full-grip single hit.
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
    let slotBuf = "";
    const notes = [];
    const measures = [];
    let i = startIndex;
    let ended = false;

    function flushMeasure() {
      const slots = slotBuf;
      slotBuf = "";
      measureIndex += 1;
      const beats = (measure.num / measure.den) * 4;
      const beatDur = 60 / bpm;
      const duration = beats * beatDur;
      const n = slots.length;
      const step = n ? duration / n : duration;
      let count = 0;
      for (let s = 0; s < n; s++) {
        const typ = NOTE_TYPE[slots[s]];
        if (!typ) continue;
        const tRaw = time + s * step;
        notes.push({
          tRaw,
          t: tRaw - headers.offset,
          type: typ,
          char: slots[s],
          measure: measureIndex,
          pos: s,
          slots: n,
          bpm,
          beatDur,
          measureBeats: beats,
        });
        count += 1;
      }
      measures.push({
        index: measureIndex,
        tRaw: time,
        t: time - headers.offset,
        duration,
        beats,
        bpm,
        measure: { num: measure.num, den: measure.den },
        slots: n,
        notes: count,
      });
      time += duration;
    }

    for (; i < rawLines.length && !ended; i++) {
      const line = stripComment(rawLines[i]).trim();
      if (!line) continue;
      if (/^#START\b/i.test(line)) continue;
      if (/^#END\b/i.test(line)) {
        if (slotBuf.length) flushMeasure();
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
        bpm = v;
        continue;
      }
      const delay = line.match(/^#DELAY\s+(-?\d+(?:\.\d+)?)\s*$/i);
      if (delay) {
        time += +delay[1];
        continue;
      }
      if (line.charAt(0) === "#") continue;
      for (let c = 0; c < line.length; c++) {
        const ch = line.charAt(c);
        if (ch === ",") { flushMeasure(); continue; }
        if (ch === " " || ch === "\t" || ch === "|") continue;
        slotBuf += ch;
      }
    }
    if (!ended && slotBuf.length) flushMeasure();
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
    const measures = meas.map((m) => Object.assign({}, m, { t: m.t - t0, tRaw: m.tRaw - t0 }));
    return {
      headers: course.headers,
      notes,
      measures,
      duration: t1 - t0,
      rangeStart: 0,
      rangeEnd: t1 - t0,
      measureFrom: from,
      measureTo: toClamped,
    };
  }

  /**
   * Assign 1-1 手顺 to parsed notes (主人 mode).
   * Returns the event stream the animation engine consumes.
   * Big notes emit two events (R and L) at the same t.
   *
   * Hand order is computed on the notes actually passed in (so a measure
   * crop starts fresh on R, matching "play this passage from the top").
   */
  function assignHands(parsed) {
    const events = [];
    let nextHand = "R";
    let lastT = null;
    let lastBeatDur = null;

    for (const n of parsed.notes) {
      const isBig = n.type === "bigdon" || n.type === "bigka";
      const face = (n.type === "don" || n.type === "bigdon") ? "don" : "ka";
      const src = n.measure + ":" + n.pos;

      if (!isBig && lastT != null) {
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

      if (isBig) {
        events.push(Object.assign({}, base, { hand: "R", both: true, big: true }));
        events.push(Object.assign({}, base, { hand: "L", both: true, big: true }));
        nextHand = "R";
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
    }, extra || {});
  }

  /** Parse TJA and return the engine-ready payload. opts: { course, measures }. */
  function eventsFromTja(text, opts) {
    const parsed = parseTja(text);
    const picked = pickCourse(parsed, opts && opts.course);
    const sliced = sliceCourse(picked, parseMeasuresOpt(opts && opts.measures));
    const events = assignHands(sliced);
    return coursePayload(sliced, { events, courses: parsed.courses.map((c) => c.headers.course) });
  }

  /**
   * 溯月 mode hook: a 手顺 JSON written by 溯溯 overrides the auto 1-1 order.
   * Accepted shapes:
   *   { events: [ { t, hand, face, grip, inserted, src, both, big } ] }
   *   [ { t, hand, ... } ]
   * Extra fields (rolls, inserted notes, gold rings) pass through — the
   * animation engine already knows grip:"roll" and inserted:true.
   *
   * opts.measures crops by the `src` measure index ("119:0") when present,
   * otherwise by event.t against the companion TJA range (opts.rangeStart/End).
   */
  function loadHandJson(input, opts) {
    const data = typeof input === "string" ? JSON.parse(input) : input;
    if (!data || typeof data !== "object") throw new Error("手顺 JSON 是空的");
    let events = Array.isArray(data) ? data : data.events;
    if (!Array.isArray(events) || !events.length) {
      throw new Error("手顺 JSON 里没有 events 数组");
    }
    const range = parseMeasuresOpt(opts && opts.measures);
    if (range) {
      const hasSrc = events.some((e) => typeof e.src === "string" && e.src.indexOf(":") >= 0);
      if (hasSrc) {
        events = events.filter((e) => {
          const m = String(e.src || "").split(":");
          const idx = +m[0];
          return idx >= range.from && idx <= range.to;
        });
      }
      if (!events.length) throw new Error("手顺 JSON 在小节 " + range.from + "-" + range.to + " 里没有事件");
    }
    return {
      song: data.song || "",
      passage: data.passage || "",
      bpm: data.bpm,
      events,
      rangeStart: opts && opts.rangeStart,
      rangeEnd: opts && opts.rangeEnd,
      source: "hand-json",
    };
  }

  return {
    parseTja,
    pickCourse,
    sliceCourse,
    parseMeasuresOpt,
    assignHands,
    eventsFromTja,
    loadHandJson,
    NOTE_TYPE,
  };
});
