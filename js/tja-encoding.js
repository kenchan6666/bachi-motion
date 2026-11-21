/**
 * TJA text decoding.
 * Charts are usually UTF-8. Older editors save Shift-JIS; reading those
 * bytes as UTF-8 yields U+FFFD mojibake. When UTF-8 is invalid, retry
 * Shift-JIS and keep whichever decoding looks more like a chart.
 *
 * Works in the browser (window.TjaEncoding) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TjaEncoding = factory();
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  function toBytes(input) {
    if (input == null) return new Uint8Array(0);
    if (typeof input === "string") return new TextEncoder().encode(input);
    if (input instanceof Uint8Array) return input;
    if (typeof ArrayBuffer !== "undefined" && input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    throw new TypeError("TJA bytes expected");
  }

  function decoder(label) {
    try { return new TextDecoder(label); }
    catch (err) { return null; }
  }

  function stripBom(text) {
    if (text && text.charCodeAt(0) === 0xFEFF) return text.slice(1);
    return text || "";
  }

  /**
   * Higher is better. Replacement chars and stray controls are mojibake;
   * kana / Han / ASCII are what a TJA title and body should contain.
   */
  function scoreText(text) {
    let score = 0;
    const s = text || "";
    for (let i = 0; i < s.length; ) {
      const c = s.codePointAt(i);
      i += c > 0xFFFF ? 2 : 1;
      if (c === 0xFFFD) score -= 8;
      else if (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) score -= 2;
      else if ((c >= 0x3040 && c <= 0x30FF) || (c >= 0x31F0 && c <= 0x31FF) ||
               (c >= 0x3400 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF)) score += 2;
      else if (c >= 0x20 && c <= 0x7E) score += 1;
    }
    return score;
  }

  function utf8Fatal(bytes) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (err) {
      return null;
    }
  }

  /**
   * Decode a TJA file. Valid UTF-8 is kept (Simplified / Traditional titles
   * must not be reparsed as Shift-JIS). Invalid UTF-8 is mojibake from a
   * Shift-JIS file: retry shift_jis and pick the cleaner text.
   */
  function decodeTjaBytes(input) {
    const bytes = toBytes(input);
    if (!bytes.length) return "";
    const asUtf8 = utf8Fatal(bytes);
    if (asUtf8 != null) return stripBom(asUtf8);
    const loose = stripBom(new TextDecoder("utf-8").decode(bytes));
    const sjisDec = decoder("shift_jis");
    if (!sjisDec) return loose;
    const asSjis = stripBom(sjisDec.decode(bytes));
    return scoreText(asSjis) >= scoreText(loose) ? asSjis : loose;
  }

  function readFile(file) {
    if (!file || typeof file.arrayBuffer !== "function") {
      return Promise.reject(new Error("unreadable"));
    }
    return file.arrayBuffer().then(decodeTjaBytes);
  }

  return {
    decodeTjaBytes: decodeTjaBytes,
    scoreText: scoreText,
    readFile: readFile,
  };
});
