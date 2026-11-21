/**
 * Fit one title line: shrink until readable, then ellipsis.
 * A non-empty title never comes back as an empty string.
 *
 * The title face is Bachi Serif CJK (local subset). Characters outside that
 * subset — Traditional / HK and the rest of Simplified — load Noto Serif SC
 * and Noto Serif TC, which are the same serif family and cover both.
 *
 * Works in the browser (window.TitleFit) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TitleFit = factory();
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  // Keep in sync with --font-title in index.html.
  const FONT_STACK = [
    '"Bachi Serif CJK"',
    '"Noto Serif SC"',
    '"Noto Serif TC"',
    '"Noto Serif CJK SC"',
    '"Noto Serif CJK TC"',
    '"Source Han Serif SC"',
    '"Source Han Serif TC"',
    '"Songti SC"',
    '"Songti TC"',
    '"PMingLiU"',
    '"MingLiU"',
    '"Microsoft JhengHei"',
    '"Microsoft YaHei"',
    "serif",
  ].join(", ");

  function titleFontLoadSpecs() {
    return [
      'bold 1em "Bachi Serif CJK"',
      'bold 1em "Noto Serif SC"',
      'bold 1em "Noto Serif TC"',
    ];
  }

  function charsOf(text) {
    return Array.from(text);
  }

  /**
   * Width of `text` at `px` in the same face as `el`, independent of the
   * element's box. A stretched block's scrollWidth is the box, not the glyphs,
   * and that made every title look too wide and collapse to a single character.
   */
  function measureText(el, text, px) {
    const doc = el && el.ownerDocument;
    if (!doc || !doc.body) return 0;
    let probe = doc.getElementById("bachiTitleProbe");
    if (!probe) {
      probe = doc.createElement("span");
      probe.id = "bachiTitleProbe";
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none;margin:0;padding:0;border:0;width:auto;max-width:none;";
      doc.body.appendChild(probe);
    }
    const cs = doc.defaultView.getComputedStyle(el);
    probe.style.fontFamily = cs.fontFamily;
    probe.style.fontWeight = cs.fontWeight;
    probe.style.fontStyle = cs.fontStyle;
    probe.style.letterSpacing = cs.letterSpacing;
    probe.style.fontSize = px + "px";
    probe.textContent = text == null ? "" : String(text);
    return probe.getBoundingClientRect().width;
  }

  /**
   * @param {string} text
   * @param {number} maxWidth
   * @param {{maxPx:number, minPx:number, measure:function(string, number):number, ellipsis?:string}} opts
   * @returns {{fontSize:number, text:string, ellipsized:boolean}}
   */
  function fitTitleLine(text, maxWidth, opts) {
    const maxPx = +opts.maxPx;
    const minPx = Math.min(+opts.minPx, maxPx);
    const measure = opts.measure;
    const ellipsis = opts.ellipsis == null ? "…" : String(opts.ellipsis);
    const src = text == null ? "" : String(text);
    if (!src) return { fontSize: maxPx, text: "", ellipsized: false };
    const limit = +maxWidth;
    if (!isFinite(limit) || limit <= 0) {
      return { fontSize: minPx, text: src, ellipsized: false };
    }
    function fits(sample, px) {
      return measure(sample, px) <= limit;
    }
    if (fits(src, maxPx)) return { fontSize: maxPx, text: src, ellipsized: false };

    let lo = minPx;
    let hi = maxPx;
    if (fits(src, minPx)) {
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (fits(src, mid)) lo = mid;
        else hi = mid;
      }
      return { fontSize: lo, text: src, ellipsized: false };
    }

    const fontSize = minPx;
    const chars = charsOf(src);
    let bestN = 0;
    let low = 0;
    let high = chars.length;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const prefix = chars.slice(0, mid).join("");
      const candidate = mid < chars.length ? prefix + ellipsis : prefix;
      if (fits(candidate, fontSize)) {
        bestN = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    let out;
    if (bestN >= chars.length) out = src;
    else if (bestN > 0) out = chars.slice(0, bestN).join("") + ellipsis;
    else out = chars[0] || src;
    return { fontSize: fontSize, text: out, ellipsized: out !== src };
  }

  return {
    FONT_STACK: FONT_STACK,
    titleFontLoadSpecs: titleFontLoadSpecs,
    fitTitleLine: fitTitleLine,
    measureText: measureText,
  };
});
