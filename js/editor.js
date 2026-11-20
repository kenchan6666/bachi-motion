"use strict";

/**
 * Visual hand-order editor (scheme A), wired into the existing app.
 * Relies on window.BachiApp (js/app.js) and the live engine (#stage).
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const Edits = () => window.BachiHandEdits;
  const Parser = () => window.TaikoParser;

  const MEASURE_W = 344;
  const LANE_MARGIN = 8;
  const LANE_PAD = 12;
  const INNER_W = MEASURE_W - (LANE_MARGIN + LANE_PAD) * 2; // 304
  const MEASURE_GAP = 22;
  const TECH_BUTTON = {
    "全换": "全换",
    "半换A": "半换 A",
    "半换B": "半换 B",
    "炒菜": "炒菜",
  };
  const ROLL_HINTS = {
    "不滚奏": "全部单打，按手法左右交替",
    "自动滚奏": "12 分仍 1-2；16 分三连 2-1；不是三连的密 16／24 分仍可 2-2",
    "24分滚奏": "24 分滚奏里 32 分 2-2，24 分 1-2，16 分或以下不滚",
  };
  const COURSE_JA = {
    Easy: "简单", Normal: "普通", Hard: "困难", Oni: "鬼", Ura: "里", Edit: "编",
    "かんたん": "简单", "ふつう": "普通", "むずかしい": "困难", "おに": "鬼",
  };

  const ui = {};
  const state = {
    open: false,
    mode: "tweak", // auto | tweak | custom
    session: null,
    parsed: null,
    notes: [],
    rawNotes: [],
    measures: [],
    chartData: null,
    selection: null, // { type:"range", from, to } | { type:"note", index }
    expanded: null, // { from, to, panX } zoomed string cluster
    strings: [], // collapsed string clusters, rebuilt in renderTracks
    drag: null,
    playerViewBox: "0 0 800 860",
    raf: 0,
  };

  function app() { return window.BachiApp || null; }

  function isReadonly() {
    return state.mode === "auto" || state.mode === "custom";
  }

  function currentOpts() {
    const a = app();
    const opts = a && a.parseOpts ? a.parseOpts() : {};
    return opts;
  }

  function setLocked(locked) {
    const a = app();
    if (a && a.setStickingLocked) a.setStickingLocked(locked);
    const techBtn = ui.techBtn;
    if (techBtn) techBtn.disabled = !!locked;
    if (ui.handSeg) ui.handSeg.classList.toggle("is-locked", !!locked);
    if (ui.rollSeg) ui.rollSeg.classList.toggle("is-locked", !!locked);
    ui.handSeg && ui.handSeg.querySelectorAll("button").forEach((b) => { b.disabled = !!locked; });
    ui.rollSeg && ui.rollSeg.querySelectorAll("button").forEach((b) => { b.disabled = !!locked; });
  }

  function hasHandorder() {
    const a = app();
    return !!((a && a.getJson && a.getJson()) || "").trim();
  }

  function syncCustomButton() {
    const btn = ui.customModeBtn;
    if (!btn) return;
    btn.setAttribute("aria-disabled", hasHandorder() ? "false" : "true");
  }

  function onHandorderChange() {
    syncCustomButton();
  }

  function releaseCustomIfEmpty() {
    syncCustomButton();
    if (state.mode === "custom" && !hasHandorder()) {
      setEditorMode("tweak", { silent: !state.open });
    }
  }

  function syncToolbarFromApp() {
    const a = app();
    if (!a) return;
    const tech = a.currentTechnique ? a.currentTechnique() : "全换";
    const hand = a.currentHand ? a.currentHand() : "R";
    const roll = a.currentRoll ? a.currentRoll() : "自动滚奏";
    if (ui.techBtn) ui.techBtn.textContent = TECH_BUTTON[tech] || tech;
    if (ui.techMenu) {
      ui.techMenu.querySelectorAll("[data-tech]").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.tech === tech);
      });
    }
    if (ui.handSeg) {
      ui.handSeg.querySelectorAll("[data-hand]").forEach((b) => {
        const on = b.dataset.hand === hand;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", String(on));
      });
    }
    if (ui.rollSeg) {
      ui.rollSeg.querySelectorAll("[data-roll]").forEach((b) => {
        const on = b.dataset.roll === roll;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", String(on));
      });
    }
    if (ui.rollHint) ui.rollHint.textContent = ROLL_HINTS[roll] || ROLL_HINTS["自动滚奏"];
  }

  function setModeButtons() {
    if (!ui.modeSeg) return;
    ui.modeSeg.querySelectorAll("[data-ed-mode]").forEach((b) => {
      const on = b.dataset.edMode === state.mode;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
    syncCustomButton();
    if (ui.root) ui.root.classList.toggle("is-readonly", isReadonly());
    if (ui.chartHint) {
      ui.chartHint.textContent = isReadonly()
        ? (state.mode === "custom" ? "已载入自定义手顺，轨道只读" : "纯自动模式：轨道只读，可在「自动+微调」里改")
        : "点密串可放大后再换手 · 单击单音可换手 · 拖选一段可改滚奏或交互";
    }
  }

  function setEditorMode(mode, opts) {
    if (mode !== "auto" && mode !== "tweak" && mode !== "custom") mode = "tweak";
    if (mode === "custom" && !hasHandorder()) {
      syncCustomButton();
      return;
    }
    const prev = state.mode;
    state.mode = mode;
    setModeButtons();
    const a = app();
    if (mode === "custom") {
      if (a && a.setMode) a.setMode("suyue");
      setLocked(true);
    } else {
      if (a && a.setMode) a.setMode("zhuren");
      setLocked(false);
    }
    if (!(opts && opts.silent)) rebuild({ keepTime: true, fresh: mode !== prev && mode !== "custom" });
  }

  function parseCurrentCourse() {
    const P = Parser();
    const a = app();
    const tja = a && a.getTja ? a.getTja() : "";
    if (!tja.trim()) throw new Error("请先打开或贴一段 TJA 谱面");
    const opts = currentOpts();
    const parsed = P.parseTja(tja);
    const picked = P.pickCourse(parsed, opts.course);
    return P.sliceCourse(picked, P.parseMeasuresOpt(opts.measures));
  }

  function freshAutoSession(parsed, opts) {
    const P = Parser();
    const bigMode = P.normBigMode(opts.bigNote || opts.bigMode || opts.bignote);
    const notes = P.notesToStickingInput(parsed.notes, parsed.measures, bigMode === "small");
    const auto = window.BachiSticking.autoSticking(notes, {
      bpm: parsed.headers && parsed.headers.bpm,
      手法: opts.手法,
      惯用手: opts.惯用手,
      滚奏: opts.滚奏,
    });
    return { notes: notes, session: Edits().createSession(notes, opts, auto) };
  }

  function payloadFromResolved(parsed, resolved, opts) {
    const P = Parser();
    const extra = P.eventsFromStickingResult(parsed, resolved, opts);
    const base = P.eventsFromTja ? null : null;
    // Reuse eventsFromTja only for the course wrapper fields; don't re-run sticking.
    const wrapper = P.chartFromTjaAndHands
      ? Object.assign({}, extra, {
          song: parsed.headers && (parsed.headers.title || parsed.headers.titleja || parsed.headers.titlezh) || "",
          passage: parsed.headers && parsed.headers.subtitle || "",
          bpm: parsed.headers && parsed.headers.bpm,
          offset: parsed.headers && parsed.headers.offset,
          course: parsed.headers && parsed.headers.course,
          level: parsed.headers && parsed.headers.level,
          headers: parsed.headers,
          measures: parsed.measures,
          duration: parsed.duration,
          bpmTimeline: parsed.bpmTimeline || [],
          rangeStart: parsed.rangeStart,
          rangeEnd: parsed.rangeEnd,
          timeShift: parsed.timeShift || 0,
        })
      : extra;
    if (state.session && state.session.patches && state.session.patches.length) {
      wrapper.source = "hand-edits";
    }
    return wrapper;
  }

  function applyToEngine(data, keepTime) {
    const anim = window.taikoAnim;
    const t = keepTime && anim && anim.state ? anim.state.now : null;
    const playing = keepTime && anim && anim.state && anim.state.playing;
    if (anim && typeof anim.setData === "function") {
      anim.setData(data);
      if (typeof window.setTechnique === "function" && Object.prototype.hasOwnProperty.call(data, "technique")) {
        window.setTechnique(data.technique);
      }
      if (typeof window.updateTitleBar === "function") window.updateTitleBar(data);
      const seekTo = t != null ? t : (anim.state && anim.state.start);
      if (typeof window.seek === "function" && seekTo != null) window.seek(seekTo);
      else if (anim.seek && seekTo != null) anim.seek(seekTo);
      if (playing && typeof window.setPlaying === "function") window.setPlaying(true);
    } else if (typeof window.startEngine === "function") {
      window.startEngine(data, { mode: state.mode === "custom" ? "suyue" : "zhuren" });
    }
    if (app() && app().updateHeading) app().updateHeading(data);
  }

  function rebuild(opts) {
    opts = opts || {};
    const a = app();
    const P = Parser();
    try {
      state.selection = null;
      hidePops();
      const parsed = parseCurrentCourse();
      const poke = currentOpts();
      state.parsed = parsed;
      state.rawNotes = parsed.notes || [];
      state.measures = parsed.measures || [];

      if (state.mode === "custom") {
        const raw = (a && a.getJson ? a.getJson() : "").trim();
        if (!raw) {
          state.session = null;
          state.chartData = null;
          renderTracks();
          updateStatus();
          return;
        }
        const data = P.chartFromTjaAndHands(a.getTja(), raw, poke);
        const notes = P.notesToStickingInput(parsed.notes, parsed.measures, P.normBigMode(poke.bigNote) === "small");
        const resolved = Edits().resolvedFromEvents(data.events);
        state.notes = notes;
        state.session = Edits().createSessionFromResolved(notes, poke, resolved);
        state.chartData = data;
        setLocked(true);
      } else {
        setLocked(false);
        if (!state.session || opts.fresh) {
          const made = freshAutoSession(parsed, poke);
          state.notes = made.notes;
          state.session = made.session;
        } else if (opts.optionsChanged) {
          Edits().setOptions(state.session, poke);
        }
        const resolved = Edits().resolve(state.session);
        state.chartData = payloadFromResolved(parsed, resolved, poke);
      }
      applyToEngine(state.chartData, opts.keepTime);
      renderTracks();
      updateStatus();
      updateSongLine();
    } catch (err) {
      if (a && a.showError) a.showError(err.message || String(err));
      else console.error(err);
    }
  }

  function resolvedNow() {
    if (!state.session) return null;
    return Edits().resolve(state.session);
  }

  function noteXInMeasure(note, measure) {
    const dur = measure.duration || 0;
    let frac = 0;
    if (dur > 1e-9) frac = (note.t - measure.t) / dur;
    frac = Math.max(0, Math.min(1, frac));
    return LANE_MARGIN + LANE_PAD + frac * INNER_W;
  }

  function measureOffset(index) {
    return index * (MEASURE_W + MEASURE_GAP);
  }

  function noteAbsX(noteIndex) {
    const n = state.rawNotes[noteIndex];
    if (!n) return 0;
    const mi = state.measures.findIndex((m) => m.index === n.measure);
    if (mi < 0) return 0;
    return measureOffset(mi) + noteXInMeasure(n, state.measures[mi]);
  }

  function hidePops() {
    if (ui.rangePop) ui.rangePop.hidden = true;
    if (ui.swapPop) ui.swapPop.hidden = true;
    if (ui.sel) ui.sel.hidden = true;
    if (ui.measuresEl) {
      ui.measuresEl.querySelectorAll(".editor-note.is-active").forEach((el) => el.classList.remove("is-active"));
    }
  }

  function closeMenus() {
    if (ui.techMenu) ui.techMenu.hidden = true;
    if (ui.techBtn) ui.techBtn.setAttribute("aria-expanded", "false");
  }

  function setAdvanced(open) {
    if (!ui.advanced) return;
    ui.advanced.classList.toggle("is-open", !!open);
    if (ui.advancedBtn) ui.advancedBtn.setAttribute("aria-expanded", String(!!open));
    if (ui.advancedPanel) ui.advancedPanel.hidden = !open;
  }

  function updateStatus() {
    if (!ui.status || !ui.statusText) return;
    const resolved = resolvedNow();
    const warn = resolved ? (resolved.warnings || []).length : 0;
    ui.status.classList.toggle("is-plain", warn === 0 && state.mode !== "custom");
    if (ui.statusDot) ui.statusDot.hidden = warn === 0;
    if (state.mode === "custom") {
      ui.statusText.textContent = warn ? ("已载入 JSON · " + warn + " 处待确认") : "已载入 JSON";
    } else if (state.session && state.session.patches && state.session.patches.length) {
      ui.statusText.textContent = warn ? ("已微调 · " + warn + " 处待确认") : "已微调";
    } else if (state.session) {
      ui.statusText.textContent = warn ? ("已自动生成 · " + warn + " 处待确认") : "已自动生成";
    } else {
      ui.statusText.textContent = "尚未生成";
    }
  }

  function updateSongLine() {
    const data = state.chartData;
    const el = $("song");
    if (!el || !data) return;
    // Player heading already updated; keep it.
  }

  const TIGHT_GAP = 6;
  const MIN_LABEL_W = 24;
  const ZOOM_NOTE_W = 42;
  const ZOOM_GUTTER = 12;
  const ZOOM_PAD = 18;
  const ZOOM_VIEW_PAD = 12;
  const ZOOM_SIDE_SLOT = ZOOM_NOTE_W; // 左右各留约一颗音的空位
  const ZOOM_EDGE = 16;              // 放大框离编辑区可见边缘的最小间距

  function warnCaption(type) {
    if (type === "同拍重复") return "拿不准：同一拍有重复音符";
    return "拿不准：这段像滚奏，点选后可改";
  }

  function rangesOverlap(a, b) {
    return a.from <= b.to && b.from <= a.to;
  }

  // Group same-hand capsules that overlap or sit tighter than TIGHT_GAP,
  // then tag groups that are rolls and/or 待确认. Isolated, well-spaced
  // notes stay as ordinary L/R capsules.
  function collectStrings(idxs, capsules, paired, warnings) {
    const tight = [];
    for (let i = 0; i < capsules.length; i++) {
      const cap = capsules[i];
      const last = tight[tight.length - 1];
      if (last && cap.left < last.right + TIGHT_GAP) {
        last.to = cap.to;
        last.right = Math.max(last.right, cap.right);
        last.caps.push(cap);
      } else {
        tight.push({
          from: cap.from,
          to: cap.to,
          left: cap.left,
          right: cap.right,
          caps: [cap],
        });
      }
    }

    const rollSpans = [];
    let r = 0;
    while (r < idxs.length) {
      if (!paired[idxs[r]]) { r += 1; continue; }
      let s = r;
      while (s + 1 < idxs.length && paired[idxs[s + 1]]) s += 1;
      rollSpans.push({ from: idxs[r], to: idxs[s] });
      r = s + 1;
    }

    const warnSpans = [];
    for (let w = 0; w < (warnings || []).length; w++) {
      const item = warnings[w];
      const hit = idxs.filter((i) => i >= item[0] && i <= item[1]);
      if (!hit.length) continue;
      warnSpans.push({ from: hit[0], to: hit[hit.length - 1], typ: item[2] });
    }

    function tagGroup(g) {
      let kind = null;
      let typ = null;
      for (let i = 0; i < rollSpans.length; i++) {
        if (rangesOverlap(g, rollSpans[i])) kind = "roll";
      }
      for (let i = 0; i < warnSpans.length; i++) {
        if (!rangesOverlap(g, warnSpans[i])) continue;
        typ = warnSpans[i].typ;
        kind = kind ? "both" : "warn";
      }
      return { kind: kind, typ: typ };
    }

    const strings = [];
    const usedRoll = [];
    const usedWarn = [];
    for (let i = 0; i < tight.length; i++) {
      const g = tight[i];
      const tag = tagGroup(g);
      const notes = g.to - g.from + 1;
      const crowded = g.caps.length > 1 || notes > 1 && (g.right - g.left) < notes * 26;
      if (!tag.kind && !crowded) continue;
      const kind = tag.kind || "run";
      strings.push({
        from: g.from,
        to: g.to,
        left: g.left,
        right: g.right,
        caps: g.caps,
        kind: kind,
        typ: tag.typ,
      });
      for (let k = 0; k < rollSpans.length; k++) {
        if (rangesOverlap(g, rollSpans[k])) usedRoll[k] = true;
      }
      for (let k = 0; k < warnSpans.length; k++) {
        if (rangesOverlap(g, warnSpans[k])) usedWarn[k] = true;
      }
    }

    // A roll or warning that did not land in a tight group still becomes
    // a string, so the stroke can mark it.
    function leftoverSpan(span, kind, typ) {
      const caps = capsules.filter((c) => rangesOverlap(c, span));
      if (!caps.length) return;
      let left = caps[0].left, right = caps[0].right;
      for (let i = 1; i < caps.length; i++) {
        if (caps[i].left < left) left = caps[i].left;
        if (caps[i].right > right) right = caps[i].right;
      }
      strings.push({ from: span.from, to: span.to, left: left, right: right, caps: caps, kind: kind, typ: typ });
    }
    for (let i = 0; i < rollSpans.length; i++) {
      if (usedRoll[i]) continue;
      leftoverSpan(rollSpans[i], "roll", null);
    }
    for (let i = 0; i < warnSpans.length; i++) {
      if (usedWarn[i]) continue;
      leftoverSpan(warnSpans[i], "warn", warnSpans[i].typ);
    }

    strings.sort((a, b) => a.from - b.from);
    return strings;
  }

  function noteInString(index) {
    const list = state.strings || [];
    for (let i = 0; i < list.length; i++) {
      if (index >= list[i].from && index <= list[i].to) return list[i];
    }
    return null;
  }

  function stringKey(s) {
    return s.from + ":" + s.to;
  }

  function collapseString() {
    state.expanded = null;
    if (ui.scroll) ui.scroll.classList.remove("is-zoomed");
    if (ui.zoomCard) ui.zoomCard.hidden = true;
  }

  function expandString(s, opts) {
    if (!s) return;
    const keepPan = opts && opts.keepPan && state.expanded && state.expanded.from === s.from && state.expanded.to === s.to;
    const focusIndex = opts && Number.isFinite(+opts.focusIndex) ? +opts.focusIndex : (keepPan && state.expanded ? state.expanded.focusIndex : null);
    state.expanded = {
      from: s.from,
      to: s.to,
      panX: keepPan ? state.expanded.panX : 0,
      focusIndex: focusIndex,
      _fresh: !keepPan,
    };
    renderZoomCard();
  }

  function zoomInnerWidth(n) {
    return ZOOM_PAD * 2 + n * ZOOM_NOTE_W + Math.max(0, n - 1) * ZOOM_GUTTER;
  }

  function zoomNoteCenterX(k) {
    return ZOOM_PAD + k * (ZOOM_NOTE_W + ZOOM_GUTTER) + ZOOM_NOTE_W / 2;
  }

  function clampZoomPan(panX, innerW, viewW) {
    if (innerW <= viewW) return (viewW - innerW) / 2;
    const min = viewW - innerW;
    if (panX > 0) return 0;
    if (panX < min) return min;
    return panX;
  }

  function centerInScroll(size, scrollPos, clientSize, edge) {
    const room = clientSize - size;
    const e = Math.max(0, Math.min(edge, room / 2));
    const pos = scrollPos + (clientSize - size) / 2;
    const lo = scrollPos + e;
    const hi = scrollPos + clientSize - size - e;
    if (hi < lo) return scrollPos + Math.max(0, room / 2);
    return Math.max(lo, Math.min(hi, pos));
  }

  function nearestNoteInString(s, clientX) {
    if (!s) return null;
    const mid = s.from + Math.floor((s.to - s.from) / 2);
    if (clientX == null || !ui.measuresEl) return mid;
    let best = mid, bestD = Infinity;
    for (let i = s.from; i <= s.to; i++) {
      const el = ui.measuresEl.querySelector('.editor-note[data-index="' + i + '"]');
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const d = Math.abs((r.left + r.right) / 2 - clientX);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function panZoom(delta) {
    if (!state.expanded || !ui.zoomInner || !ui.zoomView) return;
    const innerW = ui.zoomInner.scrollWidth;
    const viewW = Math.max(0, ui.zoomView.clientWidth - ZOOM_VIEW_PAD * 2);
    state.expanded.panX = clampZoomPan((state.expanded.panX || 0) - delta, innerW, viewW);
    ui.zoomInner.style.transform = "translateX(" + state.expanded.panX + "px)";
  }

  function ensureZoomCard() {
    if (ui.zoomCard || !ui.scroll) return;
    const card = document.createElement("div");
    card.className = "editor-zoom";
    card.hidden = true;
    const view = document.createElement("div");
    view.className = "editor-zoom-viewport";
    const inner = document.createElement("div");
    inner.className = "editor-zoom-inner";
    view.appendChild(inner);
    card.appendChild(view);
    ui.scroll.appendChild(card);
    ui.zoomCard = card;
    ui.zoomView = view;
    ui.zoomInner = inner;
  }

  function renderZoomCard() {
    ensureZoomCard();
    if (!ui.zoomCard || !state.expanded || !ui.scroll) return;
    const exp = state.expanded;
    const raw = state.rawNotes || [];
    const resolved = resolvedNow() || { hands: [] };
    const hands = resolved.hands || [];
    const notes = [];
    for (let i = exp.from; i <= exp.to; i++) {
      if (raw[i]) notes.push(i);
    }
    if (!notes.length) { collapseString(); return; }

    const n = notes.length;
    const innerW = zoomInnerWidth(n);
    const first = raw[notes[0]];
    const mi = state.measures.findIndex((m) => m.index === first.measure);

    ui.zoomInner.replaceChildren();
    const lane = document.createElement("div");
    lane.className = "editor-zoom-lane";
    lane.style.width = innerW + "px";
    for (let k = 0; k < notes.length; k++) {
      const i = notes[k];
      const note = raw[i];
      const btn = document.createElement("button");
      const isKa = note.type === "ka" || note.type === "bigka";
      const isBig = note.type === "bigdon" || note.type === "bigka";
      btn.type = "button";
      btn.className = "editor-note" + (isKa ? " is-ka" : "") + (isBig ? " is-big" : "");
      btn.dataset.index = String(i);
      btn.style.left = (ZOOM_PAD + k * (ZOOM_NOTE_W + ZOOM_GUTTER) + ZOOM_NOTE_W / 2) + "px";
      btn.setAttribute("aria-label", (isBig ? "大" : "") + (isKa ? "咔" : "咚") + " 第 " + (i + 1) + " 音");
      lane.appendChild(btn);
    }
    const handsEl = document.createElement("div");
    handsEl.className = "editor-zoom-hands";
    handsEl.style.width = innerW + "px";
    for (let k = 0; k < notes.length; k++) {
      const i = notes[k];
      const hand = hands[i] === "L" ? "L" : "R";
      const cap = document.createElement("button");
      cap.type = "button";
      cap.className = "editor-zoom-cap is-" + hand;
      cap.dataset.index = String(i);
      cap.style.left = (ZOOM_PAD + k * (ZOOM_NOTE_W + ZOOM_GUTTER)) + "px";
      cap.style.width = ZOOM_NOTE_W + "px";
      cap.textContent = hand === "L" ? "左" : "右";
      cap.setAttribute("aria-label", "第 " + (i + 1) + " 音换手");
      handsEl.appendChild(cap);
    }
    ui.zoomInner.appendChild(lane);
    ui.zoomInner.appendChild(handsEl);
    ui.zoomInner.style.width = innerW + "px";

    // 窗口按整串（含谱轨圆头）来开，左右再留约一颗音；不再用原密串的窄宽度裁。
    // 特别长、一次放不下时，把点中的那段放在窗口中间，再滚轮/滑动平移。
    const availView = Math.max(180, ui.scroll.clientWidth - 2 * ZOOM_EDGE - 2 * ZOOM_VIEW_PAD);
    const viewW = Math.min(innerW + 2 * ZOOM_SIDE_SLOT, availView);
    const outerW = viewW + ZOOM_VIEW_PAD * 2;
    ui.zoomCard.style.width = outerW + "px";
    ui.zoomView.style.width = outerW + "px";
    const cardH = ui.zoomCard.offsetHeight || 160;
    const left = centerInScroll(outerW, ui.scroll.scrollLeft, ui.scroll.clientWidth, ZOOM_EDGE);
    const top = centerInScroll(cardH, ui.scroll.scrollTop, ui.scroll.clientHeight, 8);
    ui.zoomCard.style.left = left + "px";
    ui.zoomCard.style.top = top + "px";

    if (exp._fresh) {
      const fi = exp.focusIndex;
      const k = (fi != null) ? notes.indexOf(fi) : -1;
      if (innerW > viewW && k >= 0) {
        exp.panX = clampZoomPan(viewW / 2 - zoomNoteCenterX(k), innerW, viewW);
      } else {
        exp.panX = clampZoomPan(0, innerW, viewW);
      }
      exp._fresh = false;
    } else {
      exp.panX = clampZoomPan(exp.panX || 0, innerW, viewW);
    }
    ui.zoomInner.style.transform = "translateX(" + exp.panX + "px)";
    ui.zoomCard.hidden = false;
    ui.scroll.classList.add("is-zoomed");
    if (mi >= 0) {
      const mEl = ui.measuresEl.querySelector('.editor-measure[data-index="' + state.measures[mi].index + '"]');
      // keep the source measure identifiable; dimming is CSS on .is-zoomed
      if (mEl) mEl.classList.add("is-source");
    }
  }

  function renderTracks() {
    if (!ui.measuresEl) return;
    hidePops();
    const measures = state.measures || [];
    const raw = state.rawNotes || [];
    const resolved = resolvedNow() || { hands: [], rollPairs: [], warnings: [] };
    const hands = resolved.hands || [];
    const paired = Object.create(null);
    for (let i = 0; i < (resolved.rollPairs || []).length; i++) {
      const p = resolved.rollPairs[i];
      paired[p[0]] = true;
      paired[p[1]] = true;
    }

    const notesByMeasure = Object.create(null);
    for (let i = 0; i < raw.length; i++) {
      const m = raw[i].measure;
      if (!notesByMeasure[m]) notesByMeasure[m] = [];
      notesByMeasure[m].push(i);
    }

    state.strings = [];
    const frag = document.createDocumentFragment();
    measures.forEach((measure, mi) => {
      const el = document.createElement("div");
      el.className = "editor-measure";
      el.dataset.index = String(measure.index);
      el.style.width = MEASURE_W + "px";

      const num = document.createElement("div");
      num.className = "editor-barnum";
      num.textContent = String(measure.index);
      el.appendChild(num);

      const lane = document.createElement("div");
      lane.className = "editor-lane";
      const beats = measure.beats || 4;
      const ticks = Math.max(1, Math.round(beats * 4));
      for (let t = 0; t <= ticks; t++) {
        const tick = document.createElement("span");
        tick.className = "editor-tick" + (t % 4 === 0 ? " is-beat" : "");
        tick.style.left = (LANE_PAD + (t / ticks) * INNER_W) + "px";
        lane.appendChild(tick);
      }
      const idxs = notesByMeasure[measure.index] || [];
      for (let k = 0; k < idxs.length; k++) {
        const i = idxs[k];
        const n = raw[i];
        const btn = document.createElement("button");
        const isKa = n.type === "ka" || n.type === "bigka";
        const isBig = n.type === "bigdon" || n.type === "bigka";
        btn.type = "button";
        btn.className = "editor-note" + (isKa ? " is-ka" : "") + (isBig ? " is-big" : "");
        btn.dataset.index = String(i);
        btn.style.left = noteXInMeasure(n, measure) + "px";
        btn.setAttribute("aria-label", (isBig ? "大" : "") + (isKa ? "咔" : "咚") + " 第 " + (i + 1) + " 音");
        lane.appendChild(btn);
      }
      el.appendChild(lane);

      const gap = document.createElement("div");
      gap.className = "editor-gap";
      el.appendChild(gap);

      const handsEl = document.createElement("div");
      handsEl.className = "editor-hands";

      // Same-hand capsules, then fold overlapping / tight / roll groups
      // into one string capsule each. Isolated notes stay ordinary pills.
      const capsules = [];
      let c = 0;
      while (c < idxs.length) {
        const start = c;
        const hand = hands[idxs[c]] === "L" ? "L" : "R";
        while (c + 1 < idxs.length && (hands[idxs[c + 1]] === "L" ? "L" : "R") === hand) c += 1;
        const left = noteXInMeasure(raw[idxs[start]], measure) - 14;
        const right = noteXInMeasure(raw[idxs[c]], measure) + 14;
        capsules.push({ from: idxs[start], to: idxs[c], left: left, right: right, hand: hand });
        c += 1;
      }

      const strings = collectStrings(idxs, capsules, paired, resolved.warnings || []);
      const covered = Object.create(null);
      for (let s = 0; s < strings.length; s++) {
        const str = strings[s];
        str.measure = measure.index;
        for (let i = str.from; i <= str.to; i++) covered[i] = true;
        const width = Math.max(28, str.right - str.left);
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "editor-string is-" + str.kind;
        pill.style.left = str.left + "px";
        pill.style.width = width + "px";
        pill.dataset.from = String(str.from);
        pill.dataset.to = String(str.to);
        const kindLabel = str.kind === "warn" || str.kind === "both" ? "待确认密串" : (str.kind === "roll" ? "滚奏密串" : "密串");
        pill.setAttribute("aria-label", kindLabel + " 第 " + (str.from + 1) + "–" + (str.to + 1) + " 音，点按放大");
        let crowded = false;
        for (let k = 1; k < str.caps.length; k++) {
          if (str.caps[k].left < str.caps[k - 1].right - 1) crowded = true;
        }
        const showText = !crowded && str.caps.every((cap) => (cap.right - cap.left) >= MIN_LABEL_W);
        for (let k = 0; k < str.caps.length; k++) {
          const cap = str.caps[k];
          const seg = document.createElement("span");
          seg.className = "editor-string-seg is-" + cap.hand + (showText ? "" : " is-blank");
          seg.style.left = (cap.left - str.left) + "px";
          seg.style.width = Math.max(8, cap.right - cap.left) + "px";
          if (showText) seg.textContent = cap.hand === "L" ? "左" : "右";
          pill.appendChild(seg);
        }
        handsEl.appendChild(pill);

        if (str.kind === "roll" || str.kind === "both" || str.kind === "warn") {
          const tag = document.createElement("span");
          const isWarn = str.kind === "warn" || str.kind === "both";
          tag.className = "editor-string-tag" + (isWarn ? " is-warn" : "");
          tag.textContent = isWarn ? "拿不准" : "滚奏";
          tag.style.left = ((str.left + str.right) / 2) + "px";
          gap.appendChild(tag);
        }
        state.strings.push(str);
      }

      for (let i = 0; i < capsules.length; i++) {
        const cap = capsules[i];
        if (covered[cap.from]) continue;
        const elCap = document.createElement("div");
        elCap.className = "editor-capsule is-" + cap.hand;
        elCap.style.left = cap.left + "px";
        elCap.style.width = Math.max(28, cap.right - cap.left) + "px";
        elCap.textContent = cap.hand === "L" ? "左" : "右";
        handsEl.appendChild(elCap);
      }

      el.appendChild(handsEl);
      frag.appendChild(el);
    });
    ui.measuresEl.replaceChildren(frag);
    if (ui.playhead) ui.playhead.hidden = !measures.length;
    paintPlayhead();
    if (state.expanded) {
      const still = noteInString(state.expanded.from);
      if (still && still.to === state.expanded.to) expandString(still, { keepPan: true });
      else collapseString();
    } else if (ui.scroll) {
      ui.scroll.classList.remove("is-zoomed");
      if (ui.zoomCard) ui.zoomCard.hidden = true;
    }
    if (state.selection) restoreSelectionVisual();
  }

  function restoreSelectionVisual() {
    const sel = state.selection;
    if (!sel) return;
    if (sel.type === "range") showRangePop(sel.from, sel.to, true);
    if (sel.type === "note") showSwapPop(sel.index, true);
  }

  function noteAtClient(x, y) {
    const el = document.elementFromPoint(x, y);
    const btn = el && el.closest && el.closest(".editor-note");
    if (!btn) return null;
    const i = +btn.dataset.index;
    return Number.isFinite(i) ? i : null;
  }

  function timeAtClientX(clientX) {
    if (!ui.measuresEl || !state.measures.length) return null;
    const rect = ui.measuresEl.getBoundingClientRect();
    const x = clientX - rect.left;
    for (let i = 0; i < state.measures.length; i++) {
      const left = measureOffset(i);
      const right = left + MEASURE_W;
      if (x >= left - MEASURE_GAP / 2 && x <= right + MEASURE_GAP / 2) {
        const m = state.measures[i];
        const local = x - left - (LANE_MARGIN + LANE_PAD);
        const frac = Math.max(0, Math.min(1, local / INNER_W));
        return m.t + frac * (m.duration || 0);
      }
    }
    const last = state.measures[state.measures.length - 1];
    return last.t + last.duration;
  }

  function showSelBox(from, to) {
    if (!ui.sel || !ui.measuresEl) return;
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    const left = noteAbsX(a) - 16;
    const right = noteAbsX(b) + 16;
    const host = ui.scroll.getBoundingClientRect();
    const meas = ui.measuresEl.getBoundingClientRect();
    const lane = ui.measuresEl.querySelector(".editor-lane");
    const hands = ui.measuresEl.querySelector(".editor-hands");
    if (!lane || !hands) { ui.sel.hidden = true; return; }
    const top = lane.getBoundingClientRect().top - host.top + ui.scroll.scrollTop - 8;
    const bottom = hands.getBoundingClientRect().bottom - host.top + ui.scroll.scrollTop + 8;
    ui.sel.hidden = false;
    ui.sel.style.left = (meas.left - host.left + ui.scroll.scrollLeft + left) + "px";
    ui.sel.style.top = top + "px";
    ui.sel.style.width = Math.max(32, right - left) + "px";
    ui.sel.style.height = Math.max(40, bottom - top) + "px";
  }

  function placePop(pop, midX, aboveY) {
    if (!pop || !ui.scroll) return;
    const host = ui.scroll.getBoundingClientRect();
    pop.hidden = false;
    pop.style.left = (midX - host.left + ui.scroll.scrollLeft) + "px";
    pop.style.top = (aboveY - host.top + ui.scroll.scrollTop) + "px";
    // keep inside scrollport
    const r = pop.getBoundingClientRect();
    let dx = 0;
    if (r.left < host.left + 8) dx = (host.left + 8) - r.left;
    if (r.right > host.right - 8) dx -= r.right - (host.right - 8);
    if (dx) pop.style.left = (parseFloat(pop.style.left) + dx) + "px";
    if (r.top < host.top + 4) {
      pop.style.top = (aboveY - host.top + ui.scroll.scrollTop + r.height + 36) + "px";
    }
  }

  function showRangePop(from, to, keepSel) {
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    state.selection = { type: "range", from: a, to: b };
    if (ui.swapPop) ui.swapPop.hidden = true;
    const n = b - a + 1;
    if (ui.rangePopTitle) ui.rangePopTitle.textContent = "将选中的 " + n + " 音设为";
    showSelBox(a, b);
    const mid = (noteAbsX(a) + noteAbsX(b)) / 2;
    const meas = ui.measuresEl.getBoundingClientRect();
    const host = ui.scroll.getBoundingClientRect();
    const midClient = meas.left + (mid - 0); // mid is in measures coords, measures may be scrolled
    // noteAbsX is relative to measures content; convert to client:
    const clientX = meas.left + mid;
    const lane = ui.measuresEl.querySelector(".editor-lane");
    const above = lane ? lane.getBoundingClientRect().top - 6 : host.top + 80;
    placePop(ui.rangePop, clientX, above);
    if (!keepSel) { /* already set */ }
  }

  function showSwapPop(index, keep) {
    state.selection = { type: "note", index: index };
    if (ui.rangePop) ui.rangePop.hidden = true;
    if (ui.sel) ui.sel.hidden = true;
    ui.measuresEl && ui.measuresEl.querySelectorAll(".editor-note.is-active").forEach((el) => el.classList.remove("is-active"));
    if (ui.zoomCard) ui.zoomCard.querySelectorAll(".editor-note.is-active, .editor-zoom-cap.is-active").forEach((el) => el.classList.remove("is-active"));
    const zoomBtn = ui.zoomCard && !ui.zoomCard.hidden && (
      ui.zoomCard.querySelector('.editor-zoom-cap[data-index="' + index + '"]') ||
      ui.zoomCard.querySelector('.editor-note[data-index="' + index + '"]')
    );
    const btn = zoomBtn || (ui.measuresEl && ui.measuresEl.querySelector('.editor-note[data-index="' + index + '"]'));
    if (btn) btn.classList.add("is-active");
    const resolved = resolvedNow();
    const hand = resolved && resolved.hands[index] === "L" ? "L" : "R";
    if (ui.swapPop) {
      ui.swapPop.querySelectorAll("[data-ed-swap]").forEach((b) => {
        b.classList.toggle("is-on", b.dataset.edSwap === hand);
      });
    }
    const mid = btn ? btn.getBoundingClientRect().left + btn.getBoundingClientRect().width / 2 : 0;
    const above = btn ? btn.getBoundingClientRect().top - 6 : 0;
    placePop(ui.swapPop, mid, above);
  }

  function afterEdit() {
    if (!state.parsed || !state.session) return;
    const resolved = Edits().resolve(state.session);
    state.chartData = payloadFromResolved(state.parsed, resolved, currentOpts());
    applyToEngine(state.chartData, true);
    renderTracks();
    updateStatus();
  }

  function doRangeAction(action) {
    if (!state.session || !state.selection || state.selection.type !== "range") return;
    if (isReadonly()) return;
    const { from, to } = state.selection;
    if (action === "roll") Edits().applyRoll(state.session, from, to);
    else if (action === "alternate") Edits().applyAlternate(state.session, from, to);
    else if (action === "restore") Edits().applyRestore(state.session, from, to);
    state.selection = null;
    hidePops();
    afterEdit();
  }

  function doSwap(hand) {
    if (!state.session || !state.selection || state.selection.type !== "note") return;
    if (isReadonly()) return;
    Edits().applySwap(state.session, state.selection.index, hand);
    state.selection = null;
    hidePops();
    afterEdit();
  }

  function doUndo() {
    if (!state.session || isReadonly() || !Edits().canUndo(state.session)) return;
    Edits().undo(state.session);
    hidePops();
    state.selection = null;
    afterEdit();
  }

  function doRedo() {
    if (!state.session || isReadonly() || !Edits().canRedo(state.session)) return;
    Edits().redo(state.session);
    hidePops();
    state.selection = null;
    afterEdit();
  }

  function paintPlayhead() {
    if (!ui.playhead || !state.measures.length) return;
    const anim = window.taikoAnim;
    const now = anim && anim.state ? anim.state.now : 0;
    let x = measureOffset(0) + LANE_MARGIN + LANE_PAD;
    const measures = state.measures;
    if (now <= measures[0].t) x = measureOffset(0) + LANE_MARGIN + LANE_PAD;
    else if (now >= measures[measures.length - 1].t + measures[measures.length - 1].duration) {
      const last = measures[measures.length - 1];
      x = measureOffset(measures.length - 1) + LANE_MARGIN + LANE_PAD + INNER_W;
    } else {
      for (let i = 0; i < measures.length; i++) {
        const m = measures[i];
        const end = m.t + (m.duration || 0);
        if (now >= m.t && now <= end + 1e-9) {
          const frac = m.duration > 1e-9 ? (now - m.t) / m.duration : 0;
          x = measureOffset(i) + LANE_MARGIN + LANE_PAD + frac * INNER_W;
          break;
        }
      }
    }
    ui.playhead.hidden = false;
    ui.playhead.style.left = x + "px";
    // position relative to measures: playhead is a sibling inside scroll.
    // Place it as child of measures for scroll-sync.
    if (ui.playhead.parentElement !== ui.measuresEl && ui.measuresEl) {
      ui.measuresEl.appendChild(ui.playhead);
    }
    paintPlayPos(now);
  }

  function faceName(ev) {
    if (!ev) return "";
    if (ev.face === "ka") return ev.big ? "大咔" : "咔";
    return ev.big ? "大咚" : "咚";
  }

  function paintPlayPos(now) {
    if (!ui.playText) return;
    const evs = (state.chartData && state.chartData.events) || [];
    let cur = null;
    for (let i = evs.length - 1; i >= 0; i--) {
      if (evs[i].inserted) continue;
      if (evs[i].t <= now + 1e-9) { cur = evs[i]; break; }
    }
    const handEl = ui.playHand;
    if (!cur) {
      ui.playText.textContent = "尚未开始";
      if (handEl) { handEl.textContent = "—"; handEl.className = "hand-pill"; }
    } else {
      const hand = cur.both ? "双手" : (cur.hand === "L" ? "左" : "右");
      const bar = cur.measure != null ? ("第 " + cur.measure + " 小节") : "";
      ui.playText.textContent = (bar ? bar + " · " : "") + faceName(cur);
      if (handEl) {
        handEl.textContent = hand;
        handEl.className = "hand-pill " + (cur.hand === "L" && !cur.both ? "is-L" : "is-R");
      }
    }
    const playing = !!(window.taikoAnim && window.taikoAnim.state && window.taikoAnim.state.playing);
    if (ui.playBtn) ui.playBtn.textContent = playing ? "暂停" : "播放";
  }

  function loop() {
    if (!state.open) return;
    paintPlayhead();
    state.raf = requestAnimationFrame(loop);
  }

  function seekTo(t) {
    if (typeof window.seek === "function") window.seek(t);
    else if (window.taikoAnim && window.taikoAnim.seek) window.taikoAnim.seek(t);
    paintPlayhead();
  }

  function togglePlay() {
    const anim = window.taikoAnim;
    const playing = !!(anim && anim.state && anim.state.playing);
    if (typeof window.setPlaying === "function") window.setPlaying(!playing);
    else if (anim && anim.setPlaying) anim.setPlaying(!playing);
    paintPlayhead();
  }

  function moveStage(intoEditor) {
    const stageFrame = document.querySelector(".stage-frame");
    const host = ui.stageHost;
    const well = document.querySelector(".stage-well");
    const svg = document.getElementById("stage");
    if (!stageFrame || !svg) return;
    if (intoEditor && host) {
      if (!svg.getAttribute("data-player-viewbox")) {
        svg.setAttribute("data-player-viewbox", svg.getAttribute("viewBox") || state.playerViewBox);
      }
      svg.setAttribute("viewBox", "40 128 720 720");
      if (stageFrame.parentElement !== host) host.appendChild(stageFrame);
    } else if (well) {
      const vb = svg.getAttribute("data-player-viewbox") || state.playerViewBox;
      svg.setAttribute("viewBox", vb);
      if (stageFrame.parentElement !== well) well.appendChild(stageFrame);
    }
  }

  function openEditor() {
    if (document.body.classList.contains("export")) return;
    state.open = true;
    document.body.classList.add("editor-mode");
    if (ui.root) ui.root.hidden = false;
    if (ui.pageTitle) ui.pageTitle.hidden = false;
    moveStage(true);
    syncToolbarFromApp();
    setModeButtons();
    setLocked(state.mode === "custom");
    rebuild({ keepTime: true, fresh: !state.session });
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(loop);
  }

  function closeEditor() {
    state.open = false;
    hidePops();
    closeMenus();
    setAdvanced(false);
    document.body.classList.remove("editor-mode");
    if (ui.root) ui.root.hidden = true;
    if (ui.pageTitle) ui.pageTitle.hidden = true;
    moveStage(false);
    cancelAnimationFrame(state.raf);
    if (typeof window.renderAt === "function" && window.taikoAnim && window.taikoAnim.state) {
      window.renderAt(window.taikoAnim.state.now);
    }
  }

  function onGenerate(data) {
    if (!state.open) return;
    // App just regenerated (settings change, sample load). Refresh the session.
    rebuild({ keepTime: true, fresh: state.mode !== "custom" && !(state.session && state.session.patches && state.session.patches.length) });
  }

  function exportJson() {
    const data = state.chartData;
    if (!data || !data.events) return;
    const out = {
      song: data.song || "",
      passage: data.passage || "",
      bpm: data.bpm,
      technique: data.technique || undefined,
      events: data.events.map((e) => {
        const ev = {
          t: e.t,
          hand: e.hand,
          face: e.face,
          grip: e.grip || "single",
          src: e.src,
        };
        if (e.big) ev.big = true;
        if (e.inserted) ev.inserted = true;
        if (e.both) ev.both = true;
        return ev;
      }),
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (data.song || "handorder") + ".handorder.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function importJsonText(text) {
    const raw = String(text || "");
    const a = app();
    if (a && a.setJson) a.setJson(raw);
    if (!raw.trim()) {
      releaseCustomIfEmpty();
      return;
    }
    if (a && a.setMode) a.setMode("suyue");
    state.mode = "custom";
    setModeButtons();
    setLocked(true);
    rebuild({ keepTime: false, fresh: true });
  }

  function importTjaText(text) {
    const a = app();
    if (a && a.setTja) a.setTja(text);
    if (state.mode === "custom") {
      state.mode = "tweak";
      if (a && a.setMode) a.setMode("zhuren");
      if (a && a.setJson) a.setJson("");
    }
    setModeButtons();
    setLocked(false);
    rebuild({ keepTime: false, fresh: true });
  }

  function bind() {
    ui.root = $("editor");
    ui.pageTitle = $("editorPageTitle");
    ui.modeSeg = $("editorModeSeg");
    ui.techBtn = $("editorTechBtn");
    ui.techMenu = $("editorTechMenu");
    ui.handSeg = $("editorHandSeg");
    ui.rollSeg = $("editorRollSeg");
    ui.rollHint = $("editorRollHint");
    ui.customModeBtn = ui.modeSeg && ui.modeSeg.querySelector('[data-ed-mode="custom"]');
    syncCustomButton();
    ui.status = $("editorStatus");
    ui.statusText = $("editorStatusText");
    ui.statusDot = ui.status && ui.status.querySelector(".dot");
    ui.advanced = $("editorAdvanced");
    ui.advancedBtn = $("editorAdvancedBtn");
    ui.advancedPanel = $("editorAdvancedPanel");
    ui.jsonFile = $("editorJsonFile");
    ui.tjaFile = $("editorTjaFile");
    ui.scroll = $("editorScroll");
    ui.measuresEl = $("editorMeasures");
    ui.playhead = $("editorPlayhead");
    ui.sel = $("editorSel");
    ui.rangePop = $("editorRangePop");
    ui.rangePopTitle = $("editorRangePopTitle");
    ui.swapPop = $("editorSwapPop");
    ui.chartHint = $("editorChartHint");
    ui.stageHost = $("editorStageHost");
    ui.playText = $("editorPlayText");
    ui.playHand = $("editorPlayHand");
    ui.playBtn = $("editorPlayBtn");

    const openBtns = [$("btnOpenEditor"), $("btnOpenEditorSettings")].filter(Boolean);
    openBtns.forEach((b) => b.addEventListener("click", () => openEditor()));
    const back = $("btnBackPlayer");
    if (back) back.addEventListener("click", () => closeEditor());

    if (ui.modeSeg) {
      ui.modeSeg.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-ed-mode]");
        if (!btn) return;
        if (btn.getAttribute("aria-disabled") === "true") {
          e.preventDefault();
          return;
        }
        setEditorMode(btn.dataset.edMode);
      });
      ui.modeSeg.addEventListener("keydown", (e) => {
        const btn = e.target.closest("[data-ed-mode]");
        if (!btn || btn.getAttribute("aria-disabled") !== "true") return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
        }
      });
    }

    if (ui.techBtn && ui.techMenu) {
      ui.techBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (ui.techBtn.disabled) return;
        const open = ui.techMenu.hidden;
        ui.techMenu.hidden = !open;
        ui.techBtn.setAttribute("aria-expanded", String(open));
      });
      ui.techMenu.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-tech]");
        if (!btn || ui.techBtn.disabled) return;
        const a = app();
        if (a && a.setTechniqueControl) a.setTechniqueControl(btn.dataset.tech);
        closeMenus();
        syncToolbarFromApp();
        if (state.session && !isReadonly()) {
          Edits().setOptions(state.session, currentOpts());
          afterEdit();
        } else if (!isReadonly()) {
          rebuild({ keepTime: true, fresh: true });
        }
      });
    }

    if (ui.handSeg) {
      ui.handSeg.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-hand]");
        if (!btn || btn.disabled) return;
        const a = app();
        if (a && a.setHandControl) a.setHandControl(btn.dataset.hand);
        syncToolbarFromApp();
        if (state.session && !isReadonly()) {
          Edits().setOptions(state.session, currentOpts());
          afterEdit();
        }
      });
    }
    if (ui.rollSeg) {
      ui.rollSeg.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-roll]");
        if (!btn || btn.disabled) return;
        const a = app();
        if (a && a.setRollControl) a.setRollControl(btn.dataset.roll);
        syncToolbarFromApp();
        if (state.session && !isReadonly()) {
          Edits().setOptions(state.session, currentOpts());
          afterEdit();
        }
      });
    }

    if (ui.advancedBtn) {
      ui.advancedBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setAdvanced(ui.advancedPanel && ui.advancedPanel.hidden);
      });
    }
    const exportBtn = $("editorExportJson");
    if (exportBtn) exportBtn.addEventListener("click", () => exportJson());
    if (ui.jsonFile) {
      ui.jsonFile.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => importJsonText(String(reader.result || ""));
        reader.readAsText(file, "utf-8");
        e.target.value = "";
      });
    }
    if (ui.tjaFile) {
      ui.tjaFile.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => importTjaText(String(reader.result || ""));
        reader.readAsText(file, "utf-8");
        e.target.value = "";
      });
    }

    if (ui.rangePop) {
      ui.rangePop.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-ed-action]");
        if (!btn) return;
        doRangeAction(btn.dataset.edAction);
      });
    }
    if (ui.swapPop) {
      ui.swapPop.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-ed-swap]");
        if (!btn) return;
        doSwap(btn.dataset.edSwap);
      });
    }
    if (ui.playBtn) ui.playBtn.addEventListener("click", () => togglePlay());

    if (ui.scroll) {
      ui.scroll.addEventListener("mousedown", onPointerDown);
      ui.scroll.addEventListener("wheel", onZoomWheel, { passive: false });
      bindZoomTouch();
    }

    document.addEventListener("click", (e) => {
      if (ui.tech && !ui.tech.contains(e.target)) closeMenus();
      if (ui.advanced && !ui.advanced.contains(e.target)) setAdvanced(false);
    });

    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable;
      if (e.key === "Escape") {
        hidePops();
        collapseString();
        closeMenus();
        setAdvanced(false);
        return;
      }
      if (typing || !state.open) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        doRedo();
      } else if (e.key === " " && !e.repeat) {
        e.preventDefault();
        togglePlay();
      }
    });
  }

  function zoomNoteAtClient(x, y) {
    const el = document.elementFromPoint(x, y);
    const hit = el && el.closest && (el.closest(".editor-zoom-cap") || el.closest(".editor-zoom .editor-note"));
    if (!hit) return null;
    const i = +hit.dataset.index;
    return Number.isFinite(i) ? i : null;
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest(".editor-popover")) return;

    // Clicking a collapsed string (or its tag) expands it; clicking another
    // string while zoomed switches to that one.
    const stringBtn = e.target.closest(".editor-string");
    if (stringBtn) {
      const from = +stringBtn.dataset.from;
      const to = +stringBtn.dataset.to;
      const s = (state.strings || []).find((it) => it.from === from && it.to === to);
      if (s) {
        hidePops();
        state.selection = null;
        expandString(s, { focusIndex: nearestNoteInString(s, e.clientX) });
      }
      e.preventDefault();
      return;
    }

    const inZoom = e.target.closest(".editor-zoom");
    const t = timeAtClientX(e.clientX);
    if (!inZoom && t != null && (e.target.closest(".editor-lane") || e.target.closest(".editor-note") || e.target.closest(".editor-hands"))) {
      seekTo(t);
    }
    if (isReadonly() && !inZoom && !e.target.closest(".editor-note")) {
      hidePops();
      if (state.expanded && !e.target.closest(".editor-zoom")) collapseString();
      return;
    }

    const zoomHit = inZoom ? zoomNoteAtClient(e.clientX, e.clientY) : null;
    const hit = e.target.closest(".editor-note") || e.target.closest(".editor-zoom-cap");
    const startIndex = zoomHit != null ? zoomHit : (hit ? +hit.dataset.index : noteAtClient(e.clientX, e.clientY));
    state.drag = {
      x: e.clientX,
      y: e.clientY,
      index: Number.isFinite(startIndex) ? startIndex : null,
      moved: false,
      inZoom: !!inZoom,
    };
    const move = (ev) => {
      if (!state.drag) return;
      if (Math.abs(ev.clientX - state.drag.x) + Math.abs(ev.clientY - state.drag.y) > 4) state.drag.moved = true;
      if (!state.drag.moved) return;
      if (state.drag.inZoom) return;
      const now = noteAtClient(ev.clientX, ev.clientY);
      if (now == null) return;
      if (state.drag.index == null) state.drag.index = now;
      showSelBox(state.drag.index, now);
      if (ui.rangePop) ui.rangePop.hidden = true;
      if (ui.swapPop) ui.swapPop.hidden = true;
    };
    const up = (ev) => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      const drag = state.drag;
      state.drag = null;
      if (!drag) return;
      if (drag.inZoom) {
        const end = zoomNoteAtClient(ev.clientX, ev.clientY);
        if (!drag.moved && end != null) {
          if (!isReadonly()) showSwapPop(end);
        } else if (!drag.moved && end == null) {
          // click blank inside the zoom chrome: keep zoom, just close pops
          hidePops();
          state.selection = null;
        }
        return;
      }
      const end = noteAtClient(ev.clientX, ev.clientY);
      if (drag.moved && drag.index != null && end != null && end !== drag.index) {
        if (!isReadonly()) showRangePop(drag.index, end);
      } else if (!drag.moved && drag.index != null) {
        const str = noteInString(drag.index);
        if (str && !(state.expanded && drag.index >= state.expanded.from && drag.index <= state.expanded.to)) {
          hidePops();
          state.selection = null;
          expandString(str, { focusIndex: drag.index });
        } else if (!isReadonly()) {
          showSwapPop(drag.index);
        }
      } else {
        hidePops();
        state.selection = null;
        if (state.expanded) collapseString();
      }
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  function onZoomWheel(e) {
    if (!state.expanded) return;
    e.preventDefault();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    panZoom(delta);
  }

  function bindZoomTouch() {
    if (!ui.scroll) return;
    let startX = 0;
    let startPan = 0;
    let active = false;
    ui.scroll.addEventListener("touchstart", (e) => {
      if (!state.expanded || !e.touches[0]) return;
      if (!e.target.closest(".editor-zoom") && !e.target.closest(".editor-scroll")) return;
      startX = e.touches[0].clientX;
      startPan = (state.expanded && state.expanded.panX) || 0;
      active = true;
    }, { passive: true });
    ui.scroll.addEventListener("touchmove", (e) => {
      if (!active || !state.expanded) return;
      const x = e.touches[0] && e.touches[0].clientX;
      if (x == null) return;
      e.preventDefault();
      const innerW = ui.zoomInner ? ui.zoomInner.scrollWidth : 0;
      const viewW = ui.zoomView ? Math.max(0, ui.zoomView.clientWidth - ZOOM_VIEW_PAD * 2) : 0;
      state.expanded.panX = clampZoomPan(startPan + (x - startX), innerW, viewW);
      if (ui.zoomInner) ui.zoomInner.style.transform = "translateX(" + state.expanded.panX + "px)";
    }, { passive: false });
    const end = () => { active = false; };
    ui.scroll.addEventListener("touchend", end);
    ui.scroll.addEventListener("touchcancel", end);
  }

  function boot() {
    ui.tech = $("editorTech");
    bind();
    const params = new URLSearchParams(location.search);
    if (params.get("export") === "1") return;
    if (params.get("editor") === "1") {
      // Wait a tick so app.js boot/generate finishes.
      setTimeout(() => openEditor(), 0);
    }
  }

  window.BachiEditor = {
    open: openEditor,
    close: closeEditor,
    isOpen: () => state.open,
    onGenerate: onGenerate,
    setMode: setEditorMode,
    onHandorderChange: onHandorderChange,
    releaseCustomIfEmpty: releaseCustomIfEmpty,
    rebuild: rebuild,
    selectRange: (from, to) => { if (state.open) showRangePop(from, to); },
    selectNote: (index) => { if (state.open) showSwapPop(index); },
    expandString: (from, to, opts) => {
      const s = (state.strings || []).find((it) => it.from === from && it.to === to) || noteInString(from);
      if (s) expandString(s, opts);
    },
    collapseString: () => collapseString(),
    setStringPan: (px) => {
      if (!state.expanded) return;
      state.expanded.panX = px || 0;
      panZoom(0);
    },
    expandAdvanced: (v) => setAdvanced(v !== false),
    importJsonText: importJsonText,
    getState: () => state,
    getResolved: resolvedNow,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
