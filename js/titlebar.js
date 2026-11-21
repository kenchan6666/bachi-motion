/**
 * Persistent title bar (always on, no intro animation).
 * Webpage: above the note highway. Left edge lines up with the highway's
 * painted left edge (lane x=30, 3px stroke centered). Gap is 16px, or 20px
 * when the viewport is at least 1920 wide. If the title plus that gap would
 * clip the viewport, the stage moves down — the gap is not reduced. If that
 * placement would cover the header cluster (monogram, “bachi-motion”
 * wordmark, subtitle such as 「溯溯的鼓棒」, and the 「手顺编辑」 button), the
 * bar shifts to 12px right of the cluster (汐月's 8–12px clearance; 12px is
 * the value used). The bar may narrow, down to 200px, to stay in the stage
 * well. When that minimum does not fit, the stage drops so the title sits
 * below the cluster instead of covering it.
 * Export (body.export): left beige letterbox, top-aligned with the chart
 * track when there is room beside the stage. Positioning formulas unchanged.
 * Fields: title, BPM, playback rate, technique (手法).
 */
(function () {
  const DEFAULT_TECHNIQUE = "全换";
  const VIEW_W = 800, VIEW_H = 860, TRACK_Y = 28;
  // Mirrors js/engine.js GEOM.lane.x0 and OUT. Stroke is centered on the rect,
  // so the visible highway edge is half a stroke outside x=30 / y=28.
  const LANE_X = 30, LANE_STROKE = 3;
  const TITLE_GAP = 16, TITLE_GAP_WIDE = 20, WIDE_AT = 1920;
  const LOGO_CLEAR = 12;
  const MIN_SLIDE_W = 200;
  const HEADER_DROP_GAP = 4;

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

  function px(n) { return Math.round(n * 100) / 100; }

  function titleClearance() {
    return window.innerWidth >= WIDE_AT ? TITLE_GAP_WIDE : TITLE_GAP;
  }

  function webpageNarrow() {
    return window.matchMedia("(max-width: 840px)").matches;
  }

  function clearStageNudge(svg) {
    if (!svg) return;
    if (svg.style.marginTop) svg.style.marginTop = "";
    if (svg.style.maxHeight) svg.style.maxHeight = "";
    if (svg.style.transform) svg.style.transform = "";
    if (svg.dataset.titleShift) delete svg.dataset.titleShift;
  }

  function titleWidthFor(stageW) {
    return Math.min(stageW * 0.62, Math.max(200, stageW - 24));
  }

  function applyTitleMetrics(bar, titleEl, metaEl, stageW, stageH, widthOverride) {
    const s = stageH / VIEW_H;
    const width = widthOverride > 0 ? widthOverride : titleWidthFor(stageW);
    const padY = Math.max(8, 11 * s);
    const padX = Math.max(10, 14 * s);
    bar.style.width = width + "px";
    bar.style.padding = padY + "px " + padX + "px";
    bar.style.borderRadius = Math.max(12, 16 * s) + "px";
    const innerW = Math.max(40, width - 2 * padX - 6);
    fitSize(titleEl, Math.max(16, 30 * s), Math.max(11, 12 * s), innerW);
    fitSize(metaEl, Math.max(13, 16.8 * s), Math.max(12, 12.5 * s), innerW);
    return { width: width, height: bar.getBoundingClientRect().height, s: s };
  }

  // Painted outer edge of the highway in viewport pixels.
  function laneEdges(rect) {
    const sx = rect.width / VIEW_W;
    const sy = rect.height / VIEW_H;
    const out = LANE_STROKE / 2;
    return {
      left: rect.left + (LANE_X - out) * sx,
      top: rect.top + (TRACK_Y - out) * sy,
    };
  }

  function desktopNatural(frame) {
    const fr = frame.getBoundingClientRect();
    const aspect = VIEW_W / VIEW_H;
    let height = fr.height;
    let width = height * aspect;
    if (width > fr.width) {
      width = fr.width;
      height = width / aspect;
    }
    return {
      left: fr.left + (fr.width - width) / 2,
      top: fr.top + (fr.height - height) / 2,
      width: width,
      height: height,
      frameTop: fr.top,
      frameBottom: fr.bottom,
      frameLeft: fr.left,
      frameWidth: fr.width,
      frameHeight: fr.height,
    };
  }

  function mobileNatural(svg) {
    const margin = parseFloat(svg.style.marginTop) || 0;
    const r = svg.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top - margin,
      width: r.width,
      height: r.height,
      frameTop: 0,
      frameBottom: window.innerHeight,
      frameLeft: r.left,
      frameWidth: r.width,
      frameHeight: r.height,
    };
  }

  // Place the stage so the highway can sit `barH + gap` below `ceiling`
  // (the viewport top, or the bottom of header controls the title must clear).
  // Translate when the frame has spare room underneath; otherwise shrink, keeping
  // the aspect ratio, and pin the stage to the bottom of the frame.
  function solvePlacement(natural, barH, gap, narrow, ceiling) {
    const floor = ceiling > 0 ? ceiling : 0;
    const k = (TRACK_Y - LANE_STROKE / 2) / VIEW_H;
    const laneTop = natural.top + k * natural.height;
    const titleTop = laneTop - gap - barH;
    const same = {
      left: natural.left,
      top: natural.top,
      width: natural.width,
      height: natural.height,
      shift: 0,
      maxH: 0,
      margin: 0,
    };
    if (titleTop >= floor - 0.25) return same;
    const deficit = floor - titleTop;
    if (narrow) {
      return {
        left: natural.left,
        top: natural.top + deficit,
        width: natural.width,
        height: natural.height,
        shift: 0,
        maxH: 0,
        margin: deficit,
      };
    }
    const roomBelow = natural.frameBottom - (natural.top + natural.height);
    if (deficit <= roomBelow + 0.25) {
      return {
        left: natural.left,
        top: natural.top + deficit,
        width: natural.width,
        height: natural.height,
        shift: deficit,
        maxH: 0,
        margin: 0,
      };
    }
    let H = (natural.frameBottom - floor - gap - barH) / (1 - k);
    const maxByWidth = natural.frameWidth * (VIEW_H / VIEW_W);
    if (H > natural.height) H = natural.height;
    if (H > maxByWidth) H = maxByWidth;
    if (!(H > 40)) H = 40;
    const W = H * (VIEW_W / VIEW_H);
    const left = natural.frameLeft + (natural.frameWidth - W) / 2;
    const top = natural.frameBottom - H;
    const centeredTop = natural.frameTop + (natural.frameHeight - H) / 2;
    return {
      left: left,
      top: top,
      width: W,
      height: H,
      shift: top - centeredTop,
      maxH: H,
      margin: 0,
    };
  }

  function applyPlacement(svg, placed, narrow) {
    if (narrow) {
      if (svg.style.maxHeight) svg.style.maxHeight = "";
      if (svg.style.transform) svg.style.transform = "";
      delete svg.dataset.titleShift;
      const next = placed.margin > 0.4 ? px(placed.margin) + "px" : "";
      if (svg.style.marginTop !== next) svg.style.marginTop = next;
      return;
    }
    if (svg.style.marginTop) svg.style.marginTop = "";
    const nextMax = placed.maxH > 0.4 ? px(placed.maxH) + "px" : "";
    if (svg.style.maxHeight !== nextMax) svg.style.maxHeight = nextMax;
    const shift = placed.shift || 0;
    const nextTf = Math.abs(shift) > 0.4 ? "translateY(" + px(shift) + "px)" : "";
    if ((svg.style.transform || "") !== nextTf) svg.style.transform = nextTf;
    if (nextTf) svg.dataset.titleShift = String(px(shift));
    else delete svg.dataset.titleShift;
  }

  function placementsClose(a, b) {
    if (!a || !b) return false;
    return Math.abs(a.height - b.height) < 0.3
      && Math.abs((a.shift || 0) - (b.shift || 0)) < 0.3
      && Math.abs((a.margin || 0) - (b.margin || 0)) < 0.3
      && Math.abs(a.top - b.top) < 0.3;
  }

  function visibleBox(el) {
    if (!el) return null;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return null;
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }

  // Header cluster the playback title must not cover: monogram, wordmark,
  // the subtitle (「溯溯的鼓棒」), and the 「手顺编辑」 button above the stage.
  function headerGuardBoxes() {
    const nodes = [
      document.querySelector(".brand .mon"),
      document.getElementById("title"),
      document.querySelector(".subtitle"),
      document.getElementById("btnOpenEditor"),
    ];
    const out = [];
    for (let i = 0; i < nodes.length; i++) {
      const box = visibleBox(nodes[i]);
      if (box) out.push(box);
    }
    return out;
  }

  function contentRightLimit(titleTop, titleBottom) {
    const inset = webpageNarrow() ? 8 : 6;
    let limit = window.innerWidth - inset;
    const well = document.querySelector(".stage-well");
    if (well) {
      const wr = well.getBoundingClientRect();
      if (wr.width > 1) limit = wr.right - inset;
    }
    const song = visibleBox(document.getElementById("song"));
    if (song && titleTop < song.bottom && titleBottom > song.top) {
      limit = Math.min(limit, song.left - LOGO_CLEAR);
    }
    return limit;
  }

  // Slide the title to 12px right of the header cluster when the highway-aligned
  // bar would cover it. Returns {drop} when even a 200px bar would leave the
  // stage well; the caller then lowers the stage so the title sits underneath.
  function slidePastHeader(laneLeft, naturalWidth, top, height) {
    const bottom = top + height;
    const guards = headerGuardBoxes();
    const band = [];
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      if (top < g.bottom && bottom > g.top) band.push(g);
    }
    if (!band.length) return null;
    const naturalRight = laneLeft + naturalWidth;
    let hit = false;
    let clusterRight = band[0].right;
    for (let i = 0; i < band.length; i++) {
      const g = band[i];
      if (g.right > clusterRight) clusterRight = g.right;
      if (laneLeft < g.right && naturalRight > g.left) hit = true;
    }
    if (!hit) return null;
    const clearLeft = clusterRight + LOGO_CLEAR;
    const limit = contentRightLimit(top, bottom);
    let slideW = naturalWidth;
    if (clearLeft + slideW > limit) slideW = limit - clearLeft;
    const minW = Math.min(MIN_SLIDE_W, naturalWidth);
    if (!(slideW >= minW - 0.5)) {
      let guardBottom = 0;
      for (let i = 0; i < band.length; i++) {
        if (band[i].bottom > guardBottom) guardBottom = band[i].bottom;
      }
      return { drop: guardBottom + HEADER_DROP_GAP };
    }
    return { left: clearLeft, width: slideW };
  }

  // Returns a positive ceiling when the stage must drop below the header.
  // Otherwise positions the bar and returns 0.
  function layoutWebpageTitlePass(bar, svg, titleEl, metaEl, ceiling) {
    const frame = svg.parentElement;
    if (!frame) return 0;
    const narrow = webpageNarrow();
    const gap = titleClearance();
    const floor = ceiling > 0 ? ceiling : 0;
    let placed = null;
    for (let i = 0; i < 5; i++) {
      const natural = narrow ? mobileNatural(svg) : desktopNatural(frame);
      if (natural.width < 8 || natural.height < 8) return 0;
      const basis = placed || natural;
      const metrics = applyTitleMetrics(bar, titleEl, metaEl, basis.width, basis.height);
      const next = solvePlacement(natural, metrics.height, gap, narrow, floor);
      const stable = placementsClose(placed, next);
      placed = next;
      applyPlacement(svg, placed, narrow);
      if (stable) break;
    }

    // Position from the stage that was actually laid out. If the title would
    // still clip the ceiling, nudge once more; if that would run the stage out
    // of the frame, shrink it instead of eating the gap.
    let r = svg.getBoundingClientRect();
    let metrics = applyTitleMetrics(bar, titleEl, metaEl, r.width, r.height);
    let lane = laneEdges(r);
    let top = lane.top - gap - metrics.height;
    if (top < floor - 0.25) {
      const extra = floor - top;
      if (narrow) {
        const m = (parseFloat(svg.style.marginTop) || 0) + extra;
        svg.style.marginTop = px(m) + "px";
      } else {
        const fr = frame.getBoundingClientRect();
        const room = fr.bottom - r.bottom;
        if (extra <= room + 0.25) {
          const cur = parseFloat(svg.dataset.titleShift || "0") || 0;
          const shift = cur + extra;
          svg.style.transform = "translateY(" + px(shift) + "px)";
          svg.dataset.titleShift = String(px(shift));
        } else {
          const k = (TRACK_Y - LANE_STROKE / 2) / VIEW_H;
          let H = (fr.bottom - floor - gap - metrics.height) / (1 - k);
          if (!(H > 40)) H = 40;
          if (H > r.height) H = r.height;
          svg.style.maxHeight = px(H) + "px";
          svg.style.transform = "";
          delete svg.dataset.titleShift;
          const mid = svg.getBoundingClientRect();
          const shift = (fr.bottom - mid.height) - mid.top;
          if (Math.abs(shift) > 0.4) {
            svg.style.transform = "translateY(" + px(shift) + "px)";
            svg.dataset.titleShift = String(px(shift));
          }
        }
      }
      r = svg.getBoundingClientRect();
      metrics = applyTitleMetrics(bar, titleEl, metaEl, r.width, r.height);
      lane = laneEdges(r);
      top = lane.top - gap - metrics.height;
    }

    let left = lane.left;
    let width = metrics.width;
    let height = metrics.height;
    const naturalWidth = titleWidthFor(r.width);

    function applyChoice(choice) {
      if (!choice || choice.drop) return choice;
      left = choice.left;
      if (Math.abs(choice.width - width) <= 0.5) {
        width = choice.width;
        return null;
      }
      const fitted = applyTitleMetrics(bar, titleEl, metaEl, r.width, r.height, choice.width);
      width = fitted.width;
      height = fitted.height;
      top = lane.top - gap - height;
      return null;
    }

    const choice = slidePastHeader(lane.left, naturalWidth, top, height);
    if (choice && choice.drop && !(floor > 0)) return choice.drop;
    applyChoice(choice);
    // Narrowing can shorten the bar and move it down. Re-decide from that box
    // so the clearance matches the title the page actually shows.
    if (choice && !choice.drop) {
      const again = slidePastHeader(lane.left, naturalWidth, top, height);
      if (again && again.drop && !(floor > 0)) return again.drop;
      if (!again) {
        const restored = applyTitleMetrics(bar, titleEl, metaEl, r.width, r.height);
        width = restored.width;
        height = restored.height;
        top = lane.top - gap - height;
        left = lane.left;
        const third = slidePastHeader(lane.left, naturalWidth, top, height);
        if (third && third.drop && !(floor > 0)) return third.drop;
        applyChoice(third);
      } else {
        applyChoice(again);
      }
    }

    // Narrow pages scroll, and the bar is position:absolute so it travels
    // with the stage. top/left above are viewport coordinates.
    const scrollX = narrow ? (window.scrollX || window.pageXOffset || 0) : 0;
    const scrollY = narrow ? (window.scrollY || window.pageYOffset || 0) : 0;
    bar.style.left = px(left + scrollX) + "px";
    bar.style.top = px(top + scrollY) + "px";
    bar.style.width = px(width) + "px";
    return 0;
  }

  function layoutWebpageTitle(bar, svg, titleEl, metaEl) {
    let ceiling = 0;
    for (let pass = 0; pass < 2; pass++) {
      const drop = layoutWebpageTitlePass(bar, svg, titleEl, metaEl, ceiling);
      if (!(drop > ceiling + 0.5)) return;
      ceiling = drop;
    }
  }

  function layoutTitleBar() {
    if (typeof window.fitSongHeading === "function") window.fitSongHeading();
    const bar = $("titlebar");
    const svg = $("stage");
    const titleEl = $("titlebarTitle");
    const metaEl = $("titlebarMeta");
    if (!bar || !svg) return;

    const exporting = document.body.classList.contains("export");
    const editing = document.body.classList.contains("editor-mode");
    // Webpage nudges are inline on the stage. Drop them for export and the
    // editor so those layouts keep their own stage box.
    if (exporting || editing) clearStageNudge(svg);
    if (!bar.classList.contains("is-on")) return;

    const r = svg.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;

    if (!exporting && !editing) {
      layoutWebpageTitle(bar, svg, titleEl, metaEl);
      return;
    }

    const s = r.height / VIEW_H;
    const trackTop = r.top + (TRACK_Y / VIEW_H) * r.height;
    const padL = Math.max(16, Math.min(44, 28 * s));
    const gap = Math.max(10, Math.min(22, 16 * s));
    const leftSpace = r.left;

    let left, width, top = trackTop;
    // Finished video (body.export) keeps the left-of-track plate when the
    // stage has a wide beige margin. The webpage returns before this branch.
    // Editor keeps the previous above-track placement; the bar is hidden there.
    if (exporting && leftSpace >= 180) {
      left = Math.max(12, Math.min(padL, leftSpace * 0.12));
      width = Math.max(120, leftSpace - left - gap);
    } else if (!exporting || r.top >= 56) {
      // Editor keeps this above-stage placement (the bar is hidden there).
      // Export uses it only when the left margin is tight and there is room above.
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
      clearStageNudge($("stage"));
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
    // Editor and export toggle body classes without a resize. Clear any
    // webpage stage nudge as soon as that happens.
    if (typeof MutationObserver === "function" && document.body) {
      new MutationObserver(layoutTitleBar).observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
