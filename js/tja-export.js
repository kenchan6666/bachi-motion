/**
 * Export the currently opened chart as a TJA Jiro and TNDE can play.
 * The file is CP932 (Windows-31J) with CRLF and no BOM. Chart only:
 * title, BPM, offset, course/level, measures, notes. 手顺 stays in the
 * JSON export and is not written here.
 *
 * Characters CP932 cannot store are omitted. They are not replaced with
 * "?" or a raw UTF-8 byte. encodeStrict throws instead of emitting a
 * partial buffer. A TITLE that becomes empty falls back to 未命名, which
 * does encode. A WAVE name is kept only when the whole same-directory
 * filename, extension included, encodes; otherwise the WAVE line is left
 * out so the file never points at a different audio name.
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
  const api = factory(load("./parser.js", "TaikoParser"), load("./tja-cp932.js", "BachiCp932"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BachiTjaExport = api;
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function (parser, cp932) {
  "use strict";

  function getParser() {
    const mod = parser || (typeof require === "function" ? require("./parser.js") : null)
      || (typeof globalThis !== "undefined" ? globalThis.TaikoParser : null);
    if (!mod || typeof mod.parseTja !== "function") throw new Error("找不到 TJA 解析");
    return mod;
  }

  function getCp932() {
    const mod = cp932 || (typeof require === "function" ? require("./tja-cp932.js") : null)
      || (typeof globalThis !== "undefined" ? globalThis.BachiCp932 : null);
    if (!mod || typeof mod.encodeStrict !== "function") throw new Error("缺少 CP932 编码");
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

  function lastHeader(lines, spans, index, key) {
    const until = spans[index].start;
    const inside = [];
    for (let i = 0; i < until; i++) inside.push(false);
    for (let s = 0; s < index; s++) {
      const from = spans[s].start;
      const to = Math.min(spans[s].end, until);
      for (let i = from; i < to; i++) inside[i] = true;
    }
    let found = "";
    for (let i = 0; i < until; i++) {
      if (inside[i]) continue;
      const value = headerValue(lines[i], key);
      if (value != null) found = value;
    }
    return found;
  }

  function playableField(value) {
    return getCp932().omitUnencodable(String(value == null ? "" : value)).text.replace(/[\r\n]+/g, " ").trim();
  }

  /**
   * Same-directory audio filename, extension included.
   * A name that CP932 cannot store in full is rejected rather than shortened.
   */
  function waveFileName(value) {
    let name = String(value == null ? "" : value).trim();
    if (!name) return "";
    name = name.replace(/\\/g, "/");
    const slash = name.lastIndexOf("/");
    if (slash >= 0) name = name.slice(slash + 1).trim();
    if (!name || name === "." || name === "..") return "";
    const dot = name.lastIndexOf(".");
    if (dot <= 0 || dot === name.length - 1) return "";
    if (!getCp932().canEncode(name)) return "";
    return name;
  }

  function isAsciiComment(text) {
    const s = String(text == null ? "" : text);
    for (let i = 0; i < s.length; ) {
      const cp = s.codePointAt(i);
      i += cp > 0xFFFF ? 2 : 1;
      if (cp === 0x09) continue;
      if (cp < 0x20 || cp > 0x7E) return false;
    }
    return true;
  }

  function rewriteCommands(code) {
    let next = code.replace(/#GOGOTIME\b/gi, "#GOGOSTART");
    next = next.replace(/#ENDGOGO\b/gi, "#GOGOEND");
    next = next.replace(/#GOGOSTART\b/gi, "#GOGOSTART");
    next = next.replace(/#GOGOEND\b/gi, "#GOGOEND");
    next = next.replace(/^(\s*)#START\b/i, "$1#START");
    next = next.replace(/^(\s*)#END\b/i, "$1#END");
    return next;
  }

  function rewriteWave(code) {
    const match = code.match(/^(\s*)WAVE:\s*(.*?)\s*$/i);
    if (!match) return null;
    const name = waveFileName(match[2]);
    if (!name) return false;
    return match[1] + "WAVE:" + name;
  }

  function sanitizeLine(line) {
    const mark = line.indexOf("//");
    let code = mark >= 0 ? line.slice(0, mark) : line;
    const comment = mark >= 0 ? line.slice(mark + 2) : null;
    const keepComment = comment != null && isAsciiComment(comment);
    code = rewriteCommands(code);
    const wave = rewriteWave(code);
    if (wave === false) return null;
    if (wave != null) code = wave;
    if (keepComment) return code.replace(/[ \t]+$/, "") + " //" + comment;
    return code.replace(/[ \t]+$/, "");
  }

  function ensureCourseEnds(text) {
    const lines = text.split("\n");
    const out = [];
    let open = false;
    for (let i = 0; i < lines.length; i++) {
      const code = lines[i].replace(/\/\/.*$/, "").trim();
      if (/^#START\b/i.test(code)) {
        if (open) out.push("#END");
        open = true;
      } else if (/^#END\b/i.test(code)) {
        open = false;
      }
      out.push(lines[i]);
    }
    if (open) out.push("#END");
    return out.join("\n");
  }

  function finishHeaders(text) {
    const lines = text.split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const mark = line.indexOf("//");
      const code = (mark >= 0 ? line.slice(0, mark) : line).replace(/[ \t]+$/, "");
      const comment = mark >= 0 ? line.slice(mark) : "";
      const match = code.match(/^(TITLE|SUBTITLE|MAKER|WAVE)\s*:\s*(.*)$/i);
      if (!match) {
        out.push(line);
        continue;
      }
      const key = match[1].toUpperCase();
      const value = match[2].trim();
      if (key === "TITLE") {
        out.push("TITLE:" + (value || "未命名") + (comment ? " " + comment : ""));
        continue;
      }
      if (!value) continue;
      out.push(key + ":" + value + (comment ? " " + comment : ""));
    }
    return out.join("\n");
  }

  /**
   * Turn chart text into the bytes written to disk.
   * Logical text uses CRLF. Bytes are CP932 with no BOM.
   */
  function toPlayableFile(text) {
    const codec = getCp932();
    let logical = String(text == null ? "" : text).replace(/^\uFEFF/, "");
    logical = logical.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const sanitized = [];
    const srcLines = logical.split("\n");
    for (let i = 0; i < srcLines.length; i++) {
      const line = sanitizeLine(srcLines[i]);
      if (line != null) sanitized.push(line);
    }
    logical = ensureCourseEnds(sanitized.join("\n"));
    logical = codec.omitUnencodable(logical).text;
    logical = finishHeaders(logical);
    if (logical.length && !logical.endsWith("\n")) logical += "\n";
    const crlf = logical.replace(/\n/g, "\r\n");
    const bytes = codec.encodeStrict(crlf);
    let back = "";
    try {
      back = new TextDecoder("shift_jis").decode(bytes);
    } catch (err) {
      throw new Error("CP932 round-trip failed");
    }
    if (back !== crlf) throw new Error("CP932 round-trip failed");
    return { text: crlf, bytes: bytes };
  }

  function filenameForTitle(title) {
    let name = getCp932().omitUnencodable(String(title == null ? "" : title)).text;
    name = name.replace(/[\r\n\t]+/g, " ").trim();
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
   * text is the CRLF chart; bytes are CP932 with no BOM.
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

    const title = playableField(songTitle(headers)) || "未命名";
    const out = ["TITLE:" + title];
    const subtitle = playableField(headers.subtitle);
    if (subtitle) out.push("SUBTITLE:" + subtitle);
    const maker = playableField(lastHeader(lines, spans, index, "MAKER"));
    if (maker) out.push("MAKER:" + maker);
    out.push("BPM:" + formatNum(headers.bpm));
    out.push("OFFSET:" + formatNum(headers.offset));
    const wave = waveFileName(lastHeader(lines, spans, index, "WAVE"));
    if (wave) out.push("WAVE:" + wave);
    const courseName = playableField(headers.course);
    if (courseName) out.push("COURSE:" + courseName);
    if (headers.level != null && String(headers.level).trim() !== "") {
      const level = playableField(headers.level);
      if (level) out.push("LEVEL:" + level);
    }
    out.push("");
    out.push("#START");
    let file = out.join("\n") + "\n";
    if (body.length) {
      file += body.join("\n");
      if (!file.endsWith("\n")) file += "\n";
    }
    file += "#END\n";

    const playable = toPlayableFile(file);
    return {
      text: playable.text,
      bytes: playable.bytes,
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
    toPlayableFile: toPlayableFile,
    waveFileName: waveFileName,
  };
});
