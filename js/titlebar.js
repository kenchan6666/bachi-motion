/**
 * Persistent title bar (always on, no intro animation).
 * Sits in the left beige letterbox, top-aligned with the chart track.
 * Fields: title, BPM, playback rate, technique (手法).
 */
(function () {
  const DEFAULT_TECHNIQUE = "全换";
  const VIEW_W = 800, VIEW_H = 860, TRACK_Y = 28;

  function $(id) { return document.getElementById(id); }

  function formatRate(r) {
    const n = +r;
    if (!isFinite(n) || Math.abs(n - 1) < 1e-6) return "原速";
    let s = (Math.round(n * 1000) / 1000).toString();
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s + "×";
  }

  function formatBpm(data) {
    if (window.TitleBarBpm && typeof window.TitleBarBpm.formatDisplayBpm === "function") {
      return window.TitleBarBpm.formatDisplayBpm(data);
    }
    const start = data && +data.bpm;
    return isFinite(start) && start > 0 ? "BPM " + String(Math.round(start)) : "";
  }

  function songTitle(data) {
    if (!data) return "";
    const h = data.headers || {};
    return h.title || data.song || h.titleja || h.titlezh || h.titleen || "";
  }

  function displayTechnique(name) {
    if (window.TaikoParser && typeof TaikoParser.displayTechnique === "function") {
      return TaikoParser.displayTechnique(name);
    }
    const s = String(name == null ? "" : name).trim();
    if (!s) return "";
    const compact = s.replace(/\s+/g, "");
    if (compact === "半换A" || compact === "半换a") return "半换 A";
    if (compact === "半换B" || compact === "半换b") return "半换 B";
    return s;
  }

  function techniqueOf() {
    let raw;
    if (window.TITLEBAR && Object.prototype.hasOwnProperty.call(window.TITLEBAR, "technique")) {
      raw = window.TITLEBAR.technique;
    } else {
      const api = window.taikoAnim;
      if (api && api.state && Object.prototype.hasOwnProperty.call(api.state, "technique")) {
        raw = api.state.technique;
      } else {
        const data = api && api.raw;
        if (data && Object.prototype.hasOwnProperty.call(data, "technique")) raw = data.technique;
      }
    }
    return displayTechnique(raw);
  }

  function rateOf() {
    const api = window.taikoAnim;
    if (api && api.state && isFinite(+api.state.rate)) return +api.state.rate;
    return 1;
  }

  function fitSize(el, maxPx, minPx, maxW) {
    if (!el) return;
    const full = el.dataset.fullText != null ? el.dataset.fullText : (el.textContent || "");
    el.dataset.fullText = full;
    const fit = window.TitleFit;
    if (!fit || typeof fit.fitTitleLine !== "function") {
      el.textContent = full;
      el.style.fontSize = Math.max(minPx, maxPx) + "px";
      return;
    }
    const fitted = fit.fitTitleLine(full, maxW, {
      maxPx: Math.max(minPx, maxPx),
      minPx: Math.min(minPx, maxPx),
      measure: function (text, px) {
        return fit.measureText(el, text, px);
      },
    });
    el.textContent = fitted.text;
    el.style.fontSize = fitted.fontSize + "px";
    if (fitted.ellipsized && full) el.setAttribute("title", full);
    else el.removeAttribute("title");
  }

  function layoutTitleBar() {
    if (typeof window.fitSongHeading === "function") window.fitSongHeading();
    const bar = $("titlebar");
    const svg = $("stage");
    const titleEl = $("titlebarTitle");
    const metaEl = $("titlebarMeta");
    if (!bar || !svg || !bar.classList.contains("is-on")) return;

    const r = svg.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;

    const s = r.height / VIEW_H;
    const trackTop = r.top + (TRACK_Y / VIEW_H) * r.height;
    const padL = Math.max(16, Math.min(44, 28 * s));
    const gap = Math.max(10, Math.min(22, 16 * s));
    const leftSpace = r.left;

    let left, width, top = trackTop;
    if (leftSpace >= 180) {
      left = Math.max(12, Math.min(padL, leftSpace * 0.12));
      width = Math.max(120, leftSpace - left - gap);
    } else if (r.top >= 56) {
      // Width-constrained viewport: sit in the top letterbox, still left-aligned
      // with the stage, so we never cover the track or the drum card.
      left = Math.max(12, r.left);
      width = Math.min(r.width * 0.62, Math.max(200, r.width - 24));
      top = Math.max(6, r.top - Math.max(52, 58 * s));
    } else {
      left = Math.max(8, 8);
      width = Math.max(100, leftSpace - 16);
    }

    // Second-line size is set so "BPM" caps measure 15–16px at 1080p
    // (this face's cap-height is ~0.76em, so 16.8*s ≈ 21.1px font-size → 16px caps).
    // padY grows with the line; top and bottom padding stay equal.
    // First-line title size is unchanged (30*s).
    const padY = Math.max(8, 11 * s);
    const padX = Math.max(10, 14 * s);
    bar.style.left = left + "px";
    bar.style.top = top + "px";
    bar.style.width = width + "px";
    bar.style.padding = padY + "px " + padX + "px";
    bar.style.borderRadius = Math.max(12, 16 * s) + "px";

    const innerW = Math.max(40, width - 2 * padX - 6);
    fitSize(titleEl, Math.max(16, 30 * s), Math.max(11, 12 * s), innerW);
    fitSize(metaEl, Math.max(13, 16.8 * s), Math.max(12, 12.5 * s), innerW);
  }

  function updateTitleBar(data) {
    const bar = $("titlebar");
    const titleEl = $("titlebarTitle");
    const metaEl = $("titlebarMeta");
    if (!bar || !titleEl || !metaEl) return;
    const raw = data || (window.taikoAnim && window.taikoAnim.raw) || null;
    if (!raw) {
      bar.classList.remove("is-on");
      bar.hidden = true;
      return;
    }
    const title = songTitle(raw);
    const metaParts = [formatBpm(raw), formatRate(rateOf()), techniqueOf()].filter(Boolean);
    const meta = metaParts.join(" · ");
    titleEl.dataset.fullText = title;
    metaEl.dataset.fullText = meta;
    titleEl.textContent = title;
    metaEl.textContent = meta;
    bar.hidden = false;
    bar.classList.add("is-on");
    layoutTitleBar();
    loadTitleBarFonts().then(layoutTitleBar);
  }

  function titleBarSampleText() {
    const titleEl = $("titlebarTitle");
    const metaEl = $("titlebarMeta");
    const songEl = $("song");
    const title = (titleEl && titleEl.dataset.fullText != null) ? titleEl.dataset.fullText : ((titleEl && titleEl.textContent) || "");
    const meta = (metaEl && metaEl.dataset.fullText != null) ? metaEl.dataset.fullText : ((metaEl && metaEl.textContent) || "");
    const song = songEl ? (songEl.dataset.fullText || songEl.textContent || "") : "";
    return title + meta + song;
  }

  /**
   * Load the local Bachi slices plus Noto Serif SC and TC for any Han the
   * subset does not cover. fonts.ready does not fetch unused unicode-range
   * files, and naming a fallback family does not load it.
   */
  function loadTitleFonts(text) {
    const sample = text == null ? titleBarSampleText() : String(text);
    if (!sample || !document.fonts || typeof document.fonts.load !== "function") {
      return Promise.resolve();
    }
    const specs = (window.TitleFit && window.TitleFit.titleFontLoadSpecs)
      ? window.TitleFit.titleFontLoadSpecs()
      : ['bold 1em "Bachi Serif CJK"', 'bold 1em "Noto Serif SC"', 'bold 1em "Noto Serif TC"'];
    return Promise.all(specs.map(function (spec) {
      return document.fonts.load(spec, sample).catch(function () { return []; });
    })).then(function () {});
  }

  function loadTitleBarFonts() {
    return loadTitleFonts(titleBarSampleText());
  }

  function prepareTitleBarFonts() {
    return loadTitleBarFonts().then(function () { layoutTitleBar(); });
  }

  function prepareTitleFonts(text) {
    return loadTitleFonts(text).then(function () { layoutTitleBar(); });
  }

  window.updateTitleBar = updateTitleBar;
  window.layoutTitleBar = layoutTitleBar;
  window.prepareTitleBarFonts = prepareTitleBarFonts;
  window.prepareTitleFonts = prepareTitleFonts;
  window.formatTitleBarRate = formatRate;
  window.formatTitleBarBpm = formatBpm;

  function bind() {
    window.addEventListener("resize", layoutTitleBar);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { loadTitleBarFonts().then(layoutTitleBar); });
    }
    if (typeof ResizeObserver === "function") {
      const svg = $("stage");
      if (svg) new ResizeObserver(layoutTitleBar).observe(svg);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
