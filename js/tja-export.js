/**
 * Export the currently opened chart as a TJA the parser can read back.
 * UTF-8 text. Chart only: title, BPM, offset, course/level, measures, notes.
 * 手顺 stays in the JSON export and is not written here.
 *
 * Browser: window.BachiTjaExport. Node: module.exports.
 */
(function (root, factory) {
  function load(name, globalName) {
    if (typeof require === "function") {
      try { return require(name); } catch (err) { /* fall through */ }
    }
    return root[globalName] || null;
  }
  const api = factory(load("./parser.js", "TaikoParser"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BachiTjaExport = api;
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function (parser) {
  "use strict";

  function getParser() {
    const mod = parser || (typeof require === "function" ? require("./parser.js") : null)
      || (typeof globalThis !== "undefined" ? globalThis.TaikoParser : null);
    if (!mod || typeof mod.parseTja !== "function") throw new Error("找不到 TJA 解析");
    return mod;
  }

  function stripComment(line) {
    const i = line.indexOf("//");
    return i >= 0 ? line.slice(0, i) : line;
  }

  function headerValue(line, key) {
    const m = stripComment(line).trim().match(new RegExp("^" + key + "\\s*:\\s*(.*)$", "i"));
    return m ? m[1].trim() : null;
  }

  function splitLines(text) {
    return String(text == null ? "" : text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  }

  function courseSpans(lines) {
    const spans = [];
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = stripComment(lines[i]).trim();
      if (/^#START\b/i.test(line)) {
        if (start >= 0) spans.push({ start: start, end: i });
        start = i;
      } else if (start >= 0 && /^#END\b/i.test(line)) {
        spans.push({ start: start, end: i });
        start = -1;
      }
    }
    if (start >= 0) spans.push({ start: start, end: lines.length });
    return spans;
  }

  function formatNum(n) {
    if (!isFinite(+n)) return "0";
    const value = +n;
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) < 1e-9) return String(rounded);
    return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  }

  function songTitle(headers) {
    headers = headers || {};
    return headers.title || headers.titleja || headers.titlezh
      || headers.titlezh_tw || headers.titleen || headers.titleko || "";
  }

  function waveBefore(lines, spans, index) {
    const until = spans[index].start;
    const inside = [];
    for (let i = 0; i < until; i++) inside.push(false);
    for (let s = 0; s < index; s++) {
      const from = spans[s].start;
      const to = Math.min(spans[s].end, until);
      for (let i = from; i < to; i++) inside[i] = true;
    }
    let wave = "";
    for (let i = 0; i < until; i++) {
      if (inside[i]) continue;
      const value = headerValue(lines[i], "WAVE");
      if (value != null) wave = value;
    }
    return wave;
  }

  function filenameForTitle(title) {
    let name = String(title == null ? "" : title).replace(/[\r\n\t]+/g, " ").trim();
    name = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_");
    name = name.replace(/\s+/g, " ").trim();
    name = name.replace(/^_+|_+$/g, "");
    name = name.replace(/^\.+/, "");
    name = name.replace(/\.tja$/i, "").trim();
    name = name.replace(/^_+|_+$/g, "");
    const chars = Array.from(name);
    if (chars.length > 80) name = chars.slice(0, 80).join("").trim().replace(/_+$/g, "");
    if (!name) name = "未命名";
    return name + ".tja";
  }

  function resolveOpened(parsed, opts) {
    const mod = getParser();
    if (typeof mod.resolveCourse === "function") return mod.resolveCourse(parsed, opts || {});
    return (parsed.courses && parsed.courses[0]) || parsed;
  }

  /**
   * Build a one-course TJA for the chart that is open now.
   * Returns null when the text is not a chart.
   * text is a JS string; bytes are UTF-8 with no BOM.
   */
  function exportChart(tja, opts) {
    const text = String(tja == null ? "" : tja);
    if (!text.trim()) return null;
    let parsed;
    try {
      parsed = getParser().parseTja(text);
    } catch (err) {
      return null;
    }
    const courses = parsed.courses || [];
    if (!courses.length) return null;
    const lines = splitLines(text);
    const spans = courseSpans(lines);
    if (!spans.length || spans.length !== courses.length) return null;

    const opened = resolveOpened(parsed, opts);
    let index = courses.indexOf(opened);
    if (index < 0) index = 0;
    const course = courses[index];
    const headers = (course && course.headers) || {};
    const span = spans[index];
    const body = lines.slice(span.start + 1, span.end);

    const title = songTitle(headers);
    const out = ["TITLE:" + title];
    if (headers.subtitle) out.push("SUBTITLE:" + headers.subtitle);
    out.push("BPM:" + formatNum(headers.bpm));
    out.push("OFFSET:" + formatNum(headers.offset));
    const wave = waveBefore(lines, spans, index);
    if (wave) out.push("WAVE:" + wave);
    if (headers.course) out.push("COURSE:" + headers.course);
    if (headers.level != null && String(headers.level).trim() !== "") {
      out.push("LEVEL:" + String(headers.level).trim());
    }
    out.push("");
    out.push("#START");
    let file = out.join("\n") + "\n";
    if (body.length) {
      file += body.join("\n");
      if (!file.endsWith("\n")) file += "\n";
    }
    file += "#END\n";

    const bytes = new TextEncoder().encode(file);
    return {
      text: file,
      bytes: bytes,
      filename: filenameForTitle(title),
      title: title,
    };
  }

  function canExport(tja, opts) {
    return exportChart(tja, opts) != null;
  }

  return {
    exportChart: exportChart,
    canExport: canExport,
    filenameForTitle: filenameForTitle,
  };
});
