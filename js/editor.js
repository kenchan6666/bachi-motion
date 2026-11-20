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
    "自动滚奏": "12 分 1-2，16／24 分整串 2-2",
    "24分滚奏": "只滚 24 分，每段 1-2；12／16 分照常单打",
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
    if (ui.lockHint) ui.lockHint.hidden = !locked;
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
    if (ui.root) ui.root.classList.toggle("is-readonly", isReadonly());
    if (ui.chartHint) {
      ui.chartHint.textContent = isReadonly()
        ? (state.mode === "custom" ? "已载入自定义手顺，轨道只读" : "纯自动模式：轨道只读，可在「自动+微调」里改")
        : "拖选一段可改滚奏或交互 · 单击音符可换手";
    }
  }

  function setEditorMode(mode, opts) {
    if (mode !== "auto" && mode !== "tweak" && mode !== "custom") mode = "tweak";
    const prev = state.mode;
    state.mode = mode;
    setModeButtons();
    const a = app();
    if (mode === "custom") {
      if (a && a.setMode) a.setMode("suyue");
      setLocked(true);
      if (!((a && a.getJson && a.getJson()) || "").trim()) {
        setAdvanced(true);
        if (!(opts && opts.skipPicker) && ui.jsonFile && prev !== "custom") {
          try { ui.jsonFile.click(); } catch (err) { /* ignore */ }
        }
      }
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

  function warnCaption(type) {
    if (type === "同拍重复") return "拿不准：同一拍有重复音符";
    return "拿不准：这段像滚奏，点选后可改";
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

      // Roll bands + tags in the gap / hands, using consecutive roll notes.
      let r = 0;
      while (r < idxs.length) {
        if (!paired[idxs[r]]) { r += 1; continue; }
        let s = r;
        while (s + 1 < idxs.length && paired[idxs[s + 1]]) s += 1;
        const left = noteXInMeasure(raw[idxs[r]], measure) - 14;
        const right = noteXInMeasure(raw[idxs[s]], measure) + 14;
        const band = document.createElement("div");
        band.className = "editor-roll-band";
        band.style.left = left + "px";
        band.style.width = Math.max(28, right - left) + "px";
        handsEl.appendChild(band);
        const tag = document.createElement("span");
        tag.className = "editor-roll-tag";
        tag.textContent = "滚奏";
        tag.style.left = left + "px";
        gap.appendChild(tag);
        r = s + 1;
      }

      // Hand capsules: merge adjacent same-hand notes in this measure.
      let c = 0;
      while (c < idxs.length) {
        const start = c;
        const hand = hands[idxs[c]] === "L" ? "L" : "R";
        while (c + 1 < idxs.length && (hands[idxs[c + 1]] === "L" ? "L" : "R") === hand) c += 1;
        const left = noteXInMeasure(raw[idxs[start]], measure) - 14;
        const right = noteXInMeasure(raw[idxs[c]], measure) + 14;
        const cap = document.createElement("div");
        cap.className = "editor-capsule is-" + hand;
        cap.style.left = left + "px";
        cap.style.width = Math.max(28, right - left) + "px";
        cap.textContent = hand === "L" ? "左" : "右";
        handsEl.appendChild(cap);
        c += 1;
      }

      // Warnings overlapping this measure.
      for (let w = 0; w < (resolved.warnings || []).length; w++) {
        const item = resolved.warnings[w];
        const a = item[0], b = item[1], typ = item[2];
        const hit = idxs.filter((i) => i >= a && i <= b);
        if (!hit.length) continue;
        const left = noteXInMeasure(raw[hit[0]], measure) - 16;
        const right = noteXInMeasure(raw[hit[hit.length - 1]], measure) + 16;
        const band = document.createElement("div");
        band.className = "editor-warn-band";
        band.style.left = left + "px";
        band.style.width = Math.max(32, right - left) + "px";
        handsEl.appendChild(band);
        const tip = document.createElement("div");
        tip.className = "editor-warn-tip";
        tip.textContent = warnCaption(typ);
        tip.style.left = left + "px";
        handsEl.appendChild(tip);
      }

      el.appendChild(handsEl);
      frag.appendChild(el);
    });
    ui.measuresEl.replaceChildren(frag);
    if (ui.playhead) ui.playhead.hidden = !measures.length;
    paintPlayhead();
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
    const btn = ui.measuresEl && ui.measuresEl.querySelector('.editor-note[data-index="' + index + '"]');
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
    const a = app();
    if (a && a.setJson) a.setJson(text);
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
    ui.lockHint = $("editorLockHint");
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
        setEditorMode(btn.dataset.edMode);
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

  function onPointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest(".editor-popover")) return;
    const t = timeAtClientX(e.clientX);
    if (t != null && (e.target.closest(".editor-lane") || e.target.closest(".editor-note") || e.target.closest(".editor-hands"))) {
      seekTo(t);
    }
    if (isReadonly()) {
      hidePops();
      return;
    }
    const hit = e.target.closest(".editor-note");
    const startIndex = hit ? +hit.dataset.index : noteAtClient(e.clientX, e.clientY);
    state.drag = {
      x: e.clientX,
      y: e.clientY,
      index: Number.isFinite(startIndex) ? startIndex : null,
      moved: false,
    };
    const move = (ev) => {
      if (!state.drag) return;
      if (Math.abs(ev.clientX - state.drag.x) + Math.abs(ev.clientY - state.drag.y) > 4) state.drag.moved = true;
      if (!state.drag.moved) return;
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
      const end = noteAtClient(ev.clientX, ev.clientY);
      if (drag.moved && drag.index != null && end != null && end !== drag.index) {
        showRangePop(drag.index, end);
      } else if (!drag.moved && drag.index != null) {
        showSwapPop(drag.index);
      } else {
        hidePops();
        state.selection = null;
      }
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
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
    rebuild: rebuild,
    selectRange: (from, to) => { if (state.open) showRangePop(from, to); },
    selectNote: (index) => { if (state.open) showSwapPop(index); },
    expandAdvanced: (v) => setAdvanced(v !== false),
    importJsonText: importJsonText,
    getState: () => state,
    getResolved: resolvedNow,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
