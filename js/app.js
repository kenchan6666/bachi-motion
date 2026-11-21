"use strict";

(function () {
  const $ = (id) => document.getElementById(id);
  const pageParams = new URLSearchParams(location.search);
  const errorEl = $("error");
  const tjaInput = $("tjaInput");
  const jsonInput = $("jsonInput");
  const modeZhuren = $("modeZhuren");
  const modeSuyue = $("modeSuyue");
  const jsonPanel = $("jsonPanel");
  const songEl = $("song");
  let blankLive = false;
  let writingTja = false;
  // idle: 还没打开谱。tja: 打开了 TJA。blank: 打开了空谱面。
  let chartSurface = "idle";
  const BLANK_IDS = {
    settings: {
      title: "settingsBlankTitle",
      bpm: "settingsBlankBpm",
      measures: "settingsBlankMeasures",
      button: "settingsOpenBlank",
    },
    editor: {
      title: "editorBlankTitle",
      bpm: "editorBlankBpm",
      measures: "editorBlankMeasures",
      button: "editorOpenBlank",
    },
  };
  const chartBtn = $("chartBtn");
  const chartMenu = $("chartMenu");
  const chartLabel = $("chartLabel");
  const chartPicker = $("chartPicker");

  const CHARTS = [
    { id: "suyue_demo2_8bun16bun", label: "练习谱2" },
    { id: "suyue_demo", label: "练习谱" },
    { id: "suyue_division_test", label: "分音测试" },
    { id: "suyue_roll_demo", label: "滚奏演示" },
    { id: "custom", label: "自定义…" },
  ];
  const DEFAULT_CHART = "suyue_demo2_8bun16bun";

  if (pageParams.get("export") === "1") document.body.classList.add("export");

  function showError(msg) {
    errorEl.hidden = !msg;
    errorEl.textContent = msg || "";
  }

  function setMode(mode) {
    const suyue = mode === "suyue";
    modeZhuren.classList.toggle("on", !suyue);
    modeSuyue.classList.toggle("on", suyue);
    jsonPanel.hidden = !suyue;
    modeZhuren.setAttribute("aria-pressed", String(!suyue));
    modeSuyue.setAttribute("aria-pressed", String(suyue));
    setStickingLocked(suyue);
  }

  function publishHandorder() {
    const ed = window.BachiEditor;
    if (ed && typeof ed.onHandorderChange === "function") ed.onHandorderChange();
  }

  function setJsonValue(v) {
    jsonInput.value = v || "";
    publishHandorder();
  }

  function enterEditorCustom() {
    const ed = window.BachiEditor;
    if (!ed || typeof ed.setMode !== "function") return;
    const open = typeof ed.isOpen === "function" && ed.isOpen();
    ed.setMode("custom", { silent: !open });
  }

  function currentMode() {
    return modeSuyue.classList.contains("on") ? "suyue" : "zhuren";
  }

  function appendMetaPart(el, text, asStrong) {
    if (!asStrong && el.childNodes.length) {
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "·";
      el.appendChild(sep);
    }
    if (asStrong) {
      const strong = document.createElement("strong");
      strong.textContent = text;
      el.appendChild(strong);
    } else {
      el.appendChild(document.createTextNode(text));
    }
  }

  function songLineText(meta) {
    const parts = [];
    if (meta.name) parts.push(meta.name);
    if (meta.course) parts.push(meta.course);
    if (meta.bpm) parts.push("BPM " + meta.bpm);
    return parts.join(" · ");
  }

  function renderSongRich(meta, px) {
    songEl.style.fontSize = px + "px";
    songEl.replaceChildren();
    songEl.removeAttribute("title");
    if (meta.name) appendMetaPart(songEl, meta.name, true);
    if (meta.course) appendMetaPart(songEl, meta.course, false);
    if (meta.bpm) appendMetaPart(songEl, "BPM " + meta.bpm, false);
  }

  function songMaxPx() {
    return window.matchMedia && window.matchMedia("(max-width: 840px)").matches ? 12 : 13;
  }

  function fitSongHeading() {
    if (!songEl || !songEl._meta) return;
    const meta = songEl._meta;
    const full = songLineText(meta);
    songEl.dataset.fullText = full;
    const maxPx = songMaxPx();
    const minPx = 11;
    renderSongRich(meta, maxPx);
    const cap = songEl.clientWidth;
    if (cap < 8) return;
    if (songEl.scrollWidth <= cap) return;
    function richWidth(px) {
      renderSongRich(meta, px);
      return songEl.scrollWidth;
    }
    if (richWidth(minPx) <= cap) {
      let lo = minPx, hi = maxPx;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (richWidth(mid) <= cap) lo = mid;
        else hi = mid;
      }
      renderSongRich(meta, lo);
      return;
    }
    const fit = window.TitleFit;
    if (!fit || typeof fit.fitTitleLine !== "function") {
      renderSongRich(meta, minPx);
      return;
    }
    const fitted = fit.fitTitleLine(full, cap, {
      maxPx: minPx,
      minPx: minPx,
      measure: function (text, px) {
        songEl.style.fontSize = px + "px";
        songEl.textContent = text;
        return songEl.scrollWidth;
      },
    });
    songEl.style.fontSize = fitted.fontSize + "px";
    songEl.textContent = fitted.text || full;
    if (fitted.ellipsized && full) songEl.title = full;
  }

  function updateHeading(data) {
    document.title = "bachi-motion";
    if (!songEl) return;
    if (!data) {
      songEl._meta = null;
      songEl.dataset.fullText = "";
      songEl.replaceChildren();
      songEl.removeAttribute("title");
      return;
    }
    const name = data.song || (data.headers && data.headers.title) || "";
    const bpm = data.bpm;
    const course = data.course || (data.headers && data.headers.course);
    songEl._meta = {
      name: name || "",
      course: course ? String(course) : "",
      bpm: bpm ? String(bpm) : "",
    };
    fitSongHeading();
    const sample = songEl.dataset.fullText || "";
    if (sample && typeof window.prepareTitleFonts === "function") {
      window.prepareTitleFonts(sample).then(function () { fitSongHeading(); });
    }
  }

  function currentBigNote() {
    const on = document.querySelector("[data-bignote].on");
    return window.TaikoParser ? TaikoParser.normBigMode(on && on.dataset.bignote) : "single";
  }

  function setBigNote(mode) {
    mode = window.TaikoParser ? TaikoParser.normBigMode(mode) : (mode || "single");
    document.querySelectorAll("[data-bignote]").forEach((b) => {
      const on = b.dataset.bignote === mode;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
  }

  const ROLL_HINTS = {
    "不滚奏": "全部单打，按手法左右交替",
    "自动滚奏": "12 分仍 1-2；16 分三连 2-1；四连 24 分 1-2-1；不是三连的密 16 分和更长的 24 分仍可 2-2",
    "24分滚奏": "32 分 2-2，四连 24 分 1-2-1，其余 24 分三连 2-1，16 夹 24 和 12 夹 24 用 1-2，16 分或以下不滚",
  };

  function currentTechnique() {
    const el = $("techniqueSelect");
    return window.TaikoParser ? TaikoParser.normTechnique(el && el.value) : "全换";
  }

  function setTechniqueControl(name) {
    const el = $("techniqueSelect");
    if (!el) return;
    const v = window.TaikoParser ? TaikoParser.normTechnique(name) : (name || "全换");
    el.value = v;
  }

  function currentHand() {
    const on = document.querySelector("#handSeg [data-hand].on");
    return window.TaikoParser ? TaikoParser.normDominant(on && on.dataset.hand) : "R";
  }

  function setHandControl(hand) {
    const v = window.TaikoParser ? TaikoParser.normDominant(hand) : (hand || "R");
    document.querySelectorAll("#handSeg [data-hand]").forEach((b) => {
      const on = b.dataset.hand === v;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
  }

  function currentRoll() {
    const on = document.querySelector("#rollSeg [data-roll].on");
    return window.TaikoParser ? TaikoParser.normRoll(on && on.dataset.roll) : "自动滚奏";
  }

  function setRollControl(roll) {
    const v = window.TaikoParser ? TaikoParser.normRoll(roll) : (roll || "自动滚奏");
    document.querySelectorAll("#rollSeg [data-roll]").forEach((b) => {
      const on = b.dataset.roll === v;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
    const hint = $("rollHint");
    const line = hint && (hint.querySelector("p") || hint);
    if (line) line.textContent = ROLL_HINTS[v] || ROLL_HINTS["自动滚奏"];
  }

  function setStickingLocked(locked) {
    const tech = $("techniqueSelect");
    const seg = $("rollSeg");
    if (tech) tech.disabled = !!locked;
    document.querySelectorAll("#handSeg [data-hand]").forEach((b) => { b.disabled = !!locked; });
    const handSeg = $("handSeg");
    if (handSeg) handSeg.classList.toggle("is-locked", !!locked);
    document.querySelectorAll("#rollSeg [data-roll]").forEach((b) => { b.disabled = !!locked; });
    if (seg) seg.classList.toggle("is-locked", !!locked);
  }

  let courseList = [];
  let courseSelection = null;
  let courseSignature = null;
  let branchSelection = "";
  const handsByCourse = new Map();

  function courseKeyOf(entry) {
    if (!entry) return "";
    const name = String(entry.name || "").trim().toLowerCase();
    const base = name ? "n:" + name : "i:" + entry.index;
    if (entry.hasBranch) {
      const id = (window.TaikoParser && TaikoParser.branchCanon(branchSelection)) || "M";
      return base + ":b:" + id;
    }
    return base;
  }

  function forgetCourseHands() {
    handsByCourse.clear();
    courseSelection = null;
    courseSignature = null;
    branchSelection = "";
  }

  function stashHands() {
    if (!courseSelection) return;
    handsByCourse.set(courseKeyOf(courseSelection), jsonInput.value);
  }

  function releaseEditorCustom() {
    const ed = window.BachiEditor;
    if (ed && typeof ed.releaseCustomIfEmpty === "function") ed.releaseCustomIfEmpty();
  }

  function notifyChartReplaced(opts) {
    const ed = window.BachiEditor;
    if (ed && typeof ed.onChartReplaced === "function") ed.onChartReplaced(opts || {});
  }

  function applyHandsForCourse(entry) {
    const key = courseKeyOf(entry);
    const saved = handsByCourse.has(key) ? handsByCourse.get(key) : "";
    setJsonValue(saved || "");
    if (saved && String(saved).trim()) {
      setMode("suyue");
      enterEditorCustom();
    } else {
      setMode("zhuren");
      releaseEditorCustom();
    }
  }

  function readCourseModel() {
    const text = tjaInput.value;
    if (!text.trim() || !window.TaikoParser || typeof TaikoParser.parseTja !== "function") {
      return { ok: false, parsed: null, list: [] };
    }
    try {
      const parsed = TaikoParser.parseTja(text);
      const list = TaikoParser.listCourses ? TaikoParser.listCourses(parsed) : [];
      return { ok: true, parsed: parsed, list: list };
    } catch (err) {
      return { ok: false, parsed: null, list: [] };
    }
  }

  function syncBlankFields() {
    const show = chartSurface === "blank";
    ["settingsBlankFields", "editorBlankFields"].forEach((id) => {
      const el = $(id);
      if (el) el.hidden = !show;
    });
  }

  function renderCoursePicker() {
    const picker = $("coursePicker");
    syncBlankFields();
    if (!picker) return;
    picker.replaceChildren();
    if (chartSurface !== "tja" || !courseList.length) {
      picker.hidden = true;
      renderBranchPicker();
      return;
    }
    picker.hidden = false;
    courseList.forEach((entry) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.setAttribute("role", "radio");
      btn.dataset.courseIndex = String(entry.index);
      btn.dataset.course = entry.name;
      btn.textContent = entry.label;
      const on = !!(courseSelection && courseSelection.index === entry.index);
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-checked", String(on));
      btn.addEventListener("click", () => selectCourse(entry.index, { user: true }));
      picker.appendChild(btn);
    });
    renderBranchPicker();
  }

  function activeBranchId() {
    if (chartSurface !== "tja" || !courseSelection || !courseSelection.hasBranch) return "";
    return (window.TaikoParser && TaikoParser.branchCanon(branchSelection)) || "M";
  }

  function renderBranchPicker() {
    const picker = $("branchPicker");
    if (!picker) return;
    picker.replaceChildren();
    const choices = chartSurface === "tja" && courseSelection && courseSelection.hasBranch
      ? (courseSelection.branches || [])
      : [];
    if (!choices.length) {
      picker.hidden = true;
      return;
    }
    picker.hidden = false;
    const label = document.createElement("span");
    label.className = "block-label";
    label.textContent = "分歧";
    picker.appendChild(label);
    const active = activeBranchId();
    choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.setAttribute("role", "radio");
      btn.dataset.branch = choice.id;
      btn.textContent = choice.label;
      const on = choice.id === active;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-checked", String(on));
      btn.addEventListener("click", () => selectBranch(choice.id, { user: true }));
      picker.appendChild(btn);
    });
  }

  function syncBranchUrl() {
    const id = activeBranchId();
    if (pageParams.get("export") === "1") return;
    if (typeof history === "undefined" || !history.replaceState) return;
    let url;
    try { url = new URL(location.href); }
    catch (err) { return; }
    if (id) url.searchParams.set("branch", id);
    else url.searchParams.delete("branch");
    const next = url.pathname + url.search + url.hash;
    const now = location.pathname + location.search + location.hash;
    if (next !== now) history.replaceState(null, "", next);
    if (id) pageParams.set("branch", id);
    else pageParams.delete("branch");
  }

  function pickBranch(opts) {
    opts = opts || {};
    if (!courseSelection || !courseSelection.hasBranch || chartSurface !== "tja") {
      if (opts.preferDefault) return "";
      return branchSelection || "";
    }
    if (!opts.preferDefault) {
      const kept = window.TaikoParser && TaikoParser.branchCanon(branchSelection);
      if (kept) return kept;
      const fromUrl = window.TaikoParser && TaikoParser.branchCanon(pageParams.get("branch"));
      if (fromUrl) return fromUrl;
    }
    return "M";
  }

  function selectBranch(id, opts) {
    opts = opts || {};
    if (!courseSelection || !courseSelection.hasBranch) return;
    const canon = (window.TaikoParser && TaikoParser.branchCanon(id)) || "M";
    if (canon === branchSelection && !opts.force) return;
    if (opts.user) stashHands();
    branchSelection = canon;
    renderBranchPicker();
    syncBranchUrl();
    if (opts.user) {
      applyHandsForCourse(courseSelection);
      showError("");
      notifyChartReplaced({ force: true });
      generate(false);
    }
  }

  function syncCourseUrl(name) {
    if (chartSurface !== "tja") name = "";
    if (pageParams.get("export") === "1") return;
    if (typeof history === "undefined" || !history.replaceState) return;
    let url;
    try { url = new URL(location.href); }
    catch (err) { return; }
    const raw = name == null ? "" : String(name);
    if (raw) url.searchParams.set("course", raw);
    else url.searchParams.delete("course");
    const next = url.pathname + url.search + url.hash;
    const now = location.pathname + location.search + location.hash;
    if (next !== now) history.replaceState(null, "", next);
    if (raw) pageParams.set("course", raw);
    else pageParams.delete("course");
  }

  function pickListedCourse(model, opts) {
    opts = opts || {};
    const list = model.list;
    if (!list.length) return null;
    if (!opts.preferDefault && courseSelection) {
      const same = list.find((c) => c.index === courseSelection.index && c.name === courseSelection.name)
        || list.find((c) => c.name && c.name === courseSelection.name);
      if (same) return same;
    }
    if (!opts.preferDefault) {
      const query = pageParams.get("course");
      if (query && String(query).trim()) {
        try {
          const hit = TaikoParser.pickCourse(model.parsed, query);
          const idx = model.parsed.courses.indexOf(hit);
          const found = list.find((c) => c.index === idx);
          if (found) return found;
        } catch (err) { /* unknown alias falls through to the default */ }
      }
    }
    try {
      const hit = TaikoParser.pickCourse(model.parsed, "");
      const idx = model.parsed.courses.indexOf(hit);
      return list.find((c) => c.index === idx) || list[0];
    } catch (err) {
      return list[0];
    }
  }

  function refreshCourses(opts) {
    opts = opts || {};
    const model = readCourseModel();
    if (!model.ok) {
      if (opts.preferDefault || opts.forget) {
        courseList = [];
        courseSelection = null;
        branchSelection = "";
        renderCoursePicker();
        syncBranchUrl();
      }
      return;
    }
    const signature = model.list.map((c) => c.name).join("\0");
    const shapeChanged = courseSignature != null && signature !== courseSignature;
    if (opts.forget || (shapeChanged && opts.pruneHands)) {
      handsByCourse.clear();
      courseSelection = null;
    }
    if (opts.clearJson || (shapeChanged && opts.pruneHands)) {
      setJsonValue("");
      setMode("zhuren");
      releaseEditorCustom();
    }
    courseSignature = signature;
    courseList = model.list;
    courseSelection = pickListedCourse(model, opts);
    branchSelection = pickBranch(opts);
    renderCoursePicker();
    syncCourseUrl(courseSelection ? courseSelection.name : "");
    syncBranchUrl();
  }

  function selectCourse(index, opts) {
    opts = opts || {};
    const entry = courseList.find((c) => c.index === index);
    if (!entry) return;
    const same = courseSelection
      && courseSelection.index === entry.index
      && courseSelection.name === entry.name;
    if (same && !opts.force) return;
    if (opts.user) stashHands();
    courseSelection = entry;
    renderCoursePicker();
    syncCourseUrl(entry.name);
    syncBranchUrl();
    if (opts.user) {
      applyHandsForCourse(entry);
      showError("");
      notifyChartReplaced({ force: true });
      generate(false);
    }
  }

  function selectedCourseName() {
    return courseSelection && courseSelection.name ? courseSelection.name : "";
  }

  function loadChartText(text, opts) {
    opts = opts || {};
    if (opts.forget) {
      forgetCourseHands();
      blankLive = false;
    }
    if (opts.surface === "tja" || opts.surface === "blank") chartSurface = opts.surface;
    tjaInput.value = String(text || "");
    if (opts.clearJson) {
      setJsonValue("");
      setMode("zhuren");
      releaseEditorCustom();
    }
    refreshCourses({ preferDefault: !!opts.preferDefault, forget: !!opts.forget, clearJson: !!opts.clearJson });
    syncTjaExport();
    notifyChartReplaced({ force: true });
  }

  function syncTjaExport() {
    const ed = window.BachiEditor;
    if (ed && typeof ed.syncExportTja === "function") ed.syncExportTja();
  }

  function parseOpts() {
    const opts = {};
    if (courseSelection) {
      opts.courseIndex = courseSelection.index;
      if (courseSelection.name) opts.course = courseSelection.name;
    } else if (pageParams.get("course")) opts.course = pageParams.get("course");
    const branch = activeBranchId();
    if (branch) opts.branch = branch;
    if (pageParams.get("measures")) opts.measures = pageParams.get("measures");
    opts.bigNote = currentBigNote();
    opts.手法 = currentTechnique();
    opts.惯用手 = currentHand();
    opts.滚奏 = currentRoll();
    // 有 JSON 时标题栏手法只认 ?technique= / JSON 字段，不把下拉框默认值当成来源。
    const explicit = pageParams.get("technique") || pageParams.get("手法");
    if (explicit) opts.titleTechnique = explicit;
    return opts;
  }

  function buildData() {
    const opts = parseOpts();
    if (currentMode() === "suyue") {
      const raw = jsonInput.value.trim();
      if (!raw) throw new Error("请先贴上手顺 JSON，或切回「自动生成」用 TJA 生成手顺");
      const tja = tjaInput.value.trim();
      setStickingLocked(true);
      if (typeof TaikoParser.chartFromTjaAndHands === "function") {
        return TaikoParser.chartFromTjaAndHands(tja, raw, opts);
      }
      return TaikoParser.loadHandJson(raw, opts);
    }
    setStickingLocked(false);
    const raw = tjaInput.value.trim();
    if (!raw) throw new Error("请先在输入框里贴一段 TJA 谱面");
    return TaikoParser.eventsFromTja(raw, opts);
  }

  function generate(play) {
    showError("");
    let data;
    try {
      data = buildData();
    } catch (err) {
      showError(err.message || String(err));
      if (pageParams.get("autoplay") === "1" && typeof signalBachiDone === "function") {
        signalBachiDone({ ok: false, error: err.message || String(err) });
      }
      return null;
    }
    startEngine(data, { mode: currentMode() });
    if (typeof setTechnique === "function") {
      setTechnique(Object.prototype.hasOwnProperty.call(data, "technique") ? data.technique : "");
    }
    updateHeading(data);
    seek(state.start);
    if (play) setPlaying(true);
    console.log("[bachi-motion] events:", state.events.length, "mode:", currentMode());
    if (window.BachiEditor && typeof window.BachiEditor.onGenerate === "function") {
      window.BachiEditor.onGenerate(data);
    }
    return data;
  }

  function setChartMenuOpen(open) {
    if (!chartMenu || !chartBtn) return;
    chartMenu.hidden = !open;
    chartBtn.setAttribute("aria-expanded", String(open));
  }

  function syncChartPicker(id) {
    const chart = CHARTS.find((c) => c.id === id) || CHARTS.find((c) => c.id === "custom");
    if (chartLabel) chartLabel.textContent = chart.label;
    if (chartMenu) {
      chartMenu.querySelectorAll("[data-chart]").forEach((b) => {
        b.setAttribute("aria-selected", String(b.dataset.chart === chart.id));
      });
    }
  }

  function openSettings() {
    const fold = $("settingsOpen");
    if (!fold) return;
    fold.open = true;
    if (window.matchMedia && window.matchMedia("(max-width: 840px)").matches) {
      fold.scrollIntoView({ block: "nearest" });
    }
  }

  $("btnGenerate").onclick = () => generate(true);
  modeZhuren.onclick = () => setMode("zhuren");
  modeSuyue.onclick = () => setMode("suyue");
  jsonInput.addEventListener("input", () => publishHandorder());
  let courseInputTimer = 0;
  $("jsonFile").onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setJsonValue(text);
      setMode("suyue");
      syncChartPicker("custom");
      openSettings();
      showError("");
      if (text.trim()) enterEditorCustom();
    };
    reader.onerror = () => showError("读取 JSON 文件失败");
    reader.readAsText(file, "utf-8");
  };
  $("tjaFile").onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const decode = window.TjaEncoding && window.TjaEncoding.readFile;
    const pending = decode ? decode(file) : file.text();
    pending.then((text) => {
      loadChartText(String(text || ""), { forget: true, preferDefault: true, clearJson: true, surface: "tja" });
      syncChartPicker("custom");
      openSettings();
      showError("");
      generate(false);
    }).catch(() => showError("读取 TJA 文件失败"));
  };

  function safeSampleName(name) {
    const base = String(name || "").replace(/\.tja$/i, "");
    return /^[A-Za-z0-9_-]+$/.test(base) ? base : null;
  }

  const PREFILLED_SAMPLES = { suyue_demo2_8bun16bun: true, suyue_demo: true };

  async function loadSampleChart(name, opts) {
    const sample = safeSampleName(name);
    if (!sample) return null;
    const tjaRes = await fetch("samples/" + sample + ".tja", { cache: "no-store" });
    if (!tjaRes.ok) throw new Error(tjaRes.status);
    forgetCourseHands();
    tjaInput.value = await tjaRes.text();
    chartSurface = "tja";
    blankLive = false;
    let hasHands = false;
    try {
      const jsonRes = await fetch("samples/" + sample + ".handorder.json", { cache: "no-store" });
      if (jsonRes.ok) {
        const text = await jsonRes.text();
        if (text.trim()) {
          setJsonValue(text);
          hasHands = true;
        }
      }
    } catch (err) { /* no companion 手顺 is fine */ }
    if (hasHands) {
      setMode("suyue");
      enterEditorCustom();
    } else {
      setJsonValue("");
      setMode("zhuren");
      const ed = window.BachiEditor;
      if (ed && typeof ed.releaseCustomIfEmpty === "function") ed.releaseCustomIfEmpty();
    }
    syncChartPicker(CHARTS.some((c) => c.id === sample) ? sample : "custom");
    if (!(opts && opts.deferPicker)) {
      refreshCourses({ preferDefault: !(opts && opts.keepQuery) });
    }
    notifyChartReplaced({ force: true });
    return sample;
  }

  if (chartBtn && chartMenu && chartPicker) {
    chartBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setChartMenuOpen(chartMenu.hidden);
    });
    chartMenu.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-chart]");
      if (!btn) return;
      const id = btn.dataset.chart;
      setChartMenuOpen(false);
      showError("");
      if (id === "custom") {
        syncChartPicker("custom");
        openSettings();
        return;
      }
      try {
        await loadSampleChart(id);
        generate(true);
      } catch (err) {
        showError("无法加载示例谱 samples/" + id + ".tja");
      }
    });
    document.addEventListener("click", (e) => {
      if (!chartPicker.contains(e.target)) setChartMenuOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setChartMenuOpen(false);
    });
  }

  const routeHintCtrls = [];

  function setupRouteHint(btnId, popId) {
    const btn = $(btnId);
    const pop = $(popId);
    if (!btn || !pop) return;
    const supportsPopover = Object.hasOwn(HTMLElement.prototype, "popover");
    const closeBtn = pop.querySelector(".route-hint-close");
    const preferredWidth = pop.classList.contains("route-hint-wide") ? 300 : 260;

    function place() {
      const anchor = btn.getBoundingClientRect();
      const margin = 8;
      const gap = 10;
      const width = Math.min(preferredWidth, Math.max(0, window.innerWidth - margin * 2));
      // Drop the implicit popover anchor. With one, auto insets resolve to 0
      // and a margin of 0 pins the hint to the viewport origin.
      pop.style.setProperty("position-anchor", "none");
      pop.style.setProperty("position-area", "none");
      pop.style.position = "fixed";
      pop.style.margin = "0";
      pop.style.width = width + "px";
      // beforetoggle runs while the popover is still display:none.
      const wasNone = getComputedStyle(pop).display === "none";
      if (wasNone) pop.style.display = "block";
      let height = 0;
      try {
        height = pop.offsetHeight;
      } finally {
        if (wasNone) pop.style.display = "";
      }
      const spaceBelow = window.innerHeight - anchor.bottom - margin;
      const spaceAbove = anchor.top - margin;
      const above = height > 0 && spaceBelow < height + gap && spaceAbove > spaceBelow;
      let top = above ? anchor.top - gap - height : anchor.bottom + gap;
      let left = anchor.left + anchor.width / 2 - 22;
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
      // One shorthand write. `inset: auto` then top/left leaves the origin in
      // place when the shorthand wins, which is the viewport corner here.
      pop.style.inset = top + "px auto auto " + left + "px";
      const arrow = anchor.left + anchor.width / 2 - left;
      pop.style.setProperty("--arrow-x", Math.max(14, Math.min(width - 14, arrow)) + "px");
      pop.classList.toggle("is-above", above);
    }

    function isOpen() {
      return supportsPopover ? pop.matches(":popover-open") : pop.classList.contains("is-open");
    }

    function hide() {
      if (supportsPopover) {
        if (pop.matches(":popover-open")) pop.hidePopover();
        return;
      }
      pop.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    }

    function hideOthers() {
      for (const other of routeHintCtrls) {
        if (other.pop !== pop && other.isOpen()) other.hide();
      }
    }

    if (supportsPopover) {
      // `toggle` is queued for a later task. Until it runs, the UA inset
      // (0) plus margin 0 paints the hint at the viewport origin. Place
      // while it is still hidden, before that first paint.
      pop.addEventListener("beforetoggle", (e) => {
        if (e.newState === "closed") return;
        pop.style.visibility = "hidden";
        place();
      });
      pop.addEventListener("toggle", () => {
        const open = pop.matches(":popover-open");
        btn.setAttribute("aria-expanded", String(open));
        if (!open) {
          pop.style.visibility = "";
          pop.classList.remove("is-above");
          return;
        }
        place();
        pop.style.visibility = "visible";
      });
    } else {
      btn.addEventListener("click", () => {
        const open = !pop.classList.contains("is-open");
        if (open) hideOthers();
        pop.classList.toggle("is-open", open);
        btn.setAttribute("aria-expanded", String(open));
        if (!open) return;
        pop.style.visibility = "hidden";
        place();
        pop.style.visibility = "visible";
      });
      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          hide();
          btn.focus();
        });
      }
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && pop.classList.contains("is-open")) hide();
      });
      document.addEventListener("pointerdown", (e) => {
        if (!pop.classList.contains("is-open")) return;
        if (btn.contains(e.target) || pop.contains(e.target)) return;
        hide();
      });
    }

    if (closeBtn && supportsPopover) {
      closeBtn.addEventListener("click", () => btn.focus());
    }

    let placeFrame = 0;
    const reposition = () => {
      if (!isOpen() || placeFrame) return;
      placeFrame = requestAnimationFrame(() => {
        placeFrame = 0;
        if (isOpen()) place();
      });
    };
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    document.querySelectorAll("details.settings").forEach((fold) => {
      fold.addEventListener("toggle", () => {
        if (!fold.open && fold.contains(btn)) hide();
      });
    });

    routeHintCtrls.push({ pop, isOpen, hide });
  }

  setupRouteHint("routeHintBtn", "routeHint");
  setupRouteHint("chartHintBtn", "chartHint");
  setupRouteHint("renderHintBtn", "renderHint");
  setupRouteHint("modeHintBtn", "modeHint");
  setupRouteHint("rollHintBtn", "rollHint");
  setupRouteHint("bigNoteHintBtn", "bigNoteHint");
  setupRouteHint("jsonHintBtn", "jsonHint");
  setupRouteHint("previewHitsHintBtn", "previewHitsHint");
  setupRouteHint("editorPreviewHitsHintBtn", "editorPreviewHitsHint");
  setupRouteHint("settingsBlankHintBtn", "settingsBlankHint");
  setupRouteHint("editorBlankHintBtn", "editorBlankHint");
  setupRouteHint("editorAddNoteHintBtn", "editorAddNoteHint");
  setupRouteHint("overviewHintBtn", "overviewHint");
  setupRouteHint("originalHintBtn", "originalHint");
  setupRouteHint("editorOriginalHintBtn", "editorOriginalHint");

  function fieldNumber(n) {
    if (!isFinite(+n)) return "";
    if (Math.abs(+n - Math.round(+n)) < 1e-9) return String(Math.round(+n));
    return String(+n);
  }

  function paintBlankMeta(opts, sourceSide) {
    ["settings", "editor"].forEach((side) => {
      const ids = BLANK_IDS[side];
      const titleEl = $(ids.title);
      const bpmEl = $(ids.bpm);
      if (titleEl) titleEl.value = opts.title;
      if (bpmEl) bpmEl.value = fieldNumber(opts.bpm);
      if (side === sourceSide) {
        const measuresEl = $(ids.measures);
        if (measuresEl) measuresEl.value = String(opts.measures);
      }
    });
  }

  function mirrorBlankFields(shown, sourceSide, commit) {
    ["settings", "editor"].forEach((side) => {
      const write = side !== sourceSide || commit;
      if (!write) return;
      const ids = BLANK_IDS[side];
      if (shown.title != null) {
        const el = $(ids.title);
        if (el) el.value = shown.title;
      }
      if (shown.bpm != null) {
        const el = $(ids.bpm);
        if (el) el.value = shown.bpm;
      }
    });
  }

  function applyLiveMeta(patch, sourceSide, commit) {
    const author = window.BachiChartAuthor;
    if (!blankLive || !author || typeof author.applyChartMeta !== "function") return;
    const spec = {};
    if (Object.prototype.hasOwnProperty.call(patch, "title")) {
      if (!commit && String(patch.title).trim() === "") return;
      spec.title = patch.title;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "bpm")) {
      if (!commit && !(isFinite(+patch.bpm) && +patch.bpm > 0)) return;
      spec.bpm = patch.bpm;
    }
    if (!Object.keys(spec).length) return;
    let next;
    try {
      next = author.applyChartMeta(tjaInput.value, spec);
    } catch (err) {
      showError(err.message || String(err));
      return;
    }
    if (next !== tjaInput.value) {
      writingTja = true;
      tjaInput.value = next;
      writingTja = false;
      regenerateKeepTime();
    }
    let parsed;
    try {
      parsed = window.TaikoParser.parseTja(tjaInput.value);
    } catch (err) {
      return;
    }
    const shown = {};
    if (spec.title != null) shown.title = (parsed.headers && parsed.headers.title) || "";
    if (spec.bpm != null) shown.bpm = fieldNumber(parsed.headers && parsed.headers.bpm);
    mirrorBlankFields(shown, sourceSide, commit);
  }

  function openBlankChart(bpm, measures, title, sourceSide) {
    const author = window.BachiChartAuthor;
    if (!author) return false;
    const opts = author.normalizeBlankOptions({ bpm: bpm, measures: measures, title: title });
    if (author.chartHasNotes(tjaInput.value)) {
      const ok = window.confirm("当前谱面已有音符。打开空谱面会替换它，是否继续？");
      if (!ok) return false;
    }
    writingTja = true;
    loadChartText(author.blankTja(opts), { forget: true, preferDefault: true, clearJson: true, surface: "blank" });
    writingTja = false;
    blankLive = true;
    paintBlankMeta(opts, sourceSide || "settings");
    syncChartPicker("custom");
    if (window.BachiOriginal && typeof window.BachiOriginal.setFile === "function") {
      window.BachiOriginal.setFile(null);
    }
    const ed = window.BachiEditor;
    if (ed && typeof ed.noteChartReplaced === "function") ed.noteChartReplaced();
    generate(false);
    showError("");
    return opts;
  }

  function bindBlankSide(side) {
    const ids = BLANK_IDS[side];
    const btn = $(ids.button);
    if (btn) {
      btn.addEventListener("click", () => {
        const titleEl = $(ids.title);
        const bpmEl = $(ids.bpm);
        const measuresEl = $(ids.measures);
        openBlankChart(
          bpmEl ? bpmEl.value : "",
          measuresEl ? measuresEl.value : "",
          titleEl ? titleEl.value : "",
          side
        );
      });
    }
    const titleEl = $(ids.title);
    if (titleEl) {
      titleEl.addEventListener("input", () => applyLiveMeta({ title: titleEl.value }, side, false));
      titleEl.addEventListener("change", () => applyLiveMeta({ title: titleEl.value }, side, true));
    }
    const bpmEl = $(ids.bpm);
    if (bpmEl) {
      bpmEl.addEventListener("input", () => applyLiveMeta({ bpm: bpmEl.value }, side, false));
      bpmEl.addEventListener("change", () => applyLiveMeta({ bpm: bpmEl.value }, side, true));
    }
  }
  bindBlankSide("settings");
  bindBlankSide("editor");
  tjaInput.addEventListener("input", () => {
    if (writingTja) return;
    blankLive = false;
    syncTjaExport();
    clearTimeout(courseInputTimer);
    courseInputTimer = setTimeout(() => {
      refreshCourses({ pruneHands: true });
      notifyChartReplaced();
    }, 200);
  });

  function regenerateKeepTime() {
    const anim = window.taikoAnim;
    const t = anim && anim.state ? anim.state.now : null;
    const playing = !!(anim && anim.state && anim.state.playing);
    generate(false);
    if (t != null && typeof seek === "function") seek(t);
    if (playing && typeof setPlaying === "function") setPlaying(true);
  }

  const bigNoteChips = $("bigNoteChips");
  if (bigNoteChips) {
    bigNoteChips.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-bignote]");
      if (!btn) return;
      setBigNote(btn.dataset.bignote);
      regenerateKeepTime();
    });
  }

  const techniqueSelect = $("techniqueSelect");
  if (techniqueSelect) {
    techniqueSelect.addEventListener("change", () => {
      if (currentMode() === "suyue") return;
      regenerateKeepTime();
    });
  }
  const handSeg = $("handSeg");
  if (handSeg) {
    handSeg.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-hand]");
      if (!btn || btn.disabled) return;
      setHandControl(btn.dataset.hand);
      if (currentMode() === "suyue") return;
      regenerateKeepTime();
    });
  }
  const rollSeg = $("rollSeg");
  if (rollSeg) {
    rollSeg.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-roll]");
      if (!btn || btn.disabled) return;
      setRollControl(btn.dataset.roll);
      if (currentMode() === "suyue") return;
      regenerateKeepTime();
    });
  }

  window.BachiApp = {
    generate,
    buildData,
    parseOpts,
    currentTechnique,
    currentHand,
    currentRoll,
    setTechniqueControl,
    setHandControl,
    setRollControl,
    setStickingLocked,
    currentMode,
    setMode,
    loadSampleChart,
    openSettings,
    showError,
    regenerateKeepTime,
    updateHeading,
    getTja: () => tjaInput.value,
    setTja: (v, opts) => {
      tjaInput.value = v || "";
      if (!(opts && opts.keepBlank)) blankLive = false;
      refreshCourses();
      syncTjaExport();
    },
    loadChartText,
    syncChartPicker,
    selectedCourseName,
    refreshCourses,
    getJson: () => jsonInput.value,
    setJson: (v) => setJsonValue(v),
    openBlankChart,
    ROLL_HINTS,
  };
  window.fitSongHeading = fitSongHeading;

  async function boot() {
    if (pageParams.get("mode") === "suyue") setMode("suyue");
    else setMode("zhuren");

    setBigNote(pageParams.get("bignote") || "single");
    setTechniqueControl(pageParams.get("technique") || pageParams.get("手法") || "全换");
    setHandControl(pageParams.get("hand") || pageParams.get("惯用手") || "R");
    setRollControl(pageParams.get("roll") || pageParams.get("滚奏") || "自动滚奏");
    setStickingLocked(currentMode() === "suyue");

    syncChartPicker(DEFAULT_CHART);

    const sample = safeSampleName(pageParams.get("sample") || "");
    if (sample) {
      try {
        await loadSampleChart(sample, { deferPicker: true, keepQuery: true });
      } catch (err) {
        if (!PREFILLED_SAMPLES[sample]) {
          showError("无法加载示例谱 samples/" + sample + ".tja");
        }
        // Default showcase (练习谱2) is prefilled in the textarea; file:// fetch may fail and that's ok.
      }
    }

    const rawTja = pageParams.get("tja");
    if (rawTja) {
      try {
        tjaInput.value = decodeURIComponent(rawTja);
        forgetCourseHands();
        chartSurface = "tja";
        setJsonValue("");
        setMode("zhuren");
        releaseEditorCustom();
        syncChartPicker("custom");
      } catch (err) {
        showError("URL 里的 tja 参数无法解码");
      }
    }

    if (pageParams.get("settings") === "1") openSettings();

    // Headless export/dump always injects its own payload via startEngine.
    // Do not generate the prefilled 练习谱2 first: that would write
    // 「溯溯的练习谱2」into the title bar and download extra unicode-range
    // slices before the real song is loaded.
    const autoplay = pageParams.get("autoplay") === "1";
    if (pageParams.get("export") !== "1") {
      const courseQuery = String(pageParams.get("course") || "").trim();
      const branchQuery = String(pageParams.get("branch") || "").trim();
      refreshCourses({ preferDefault: !courseQuery && !branchQuery });
      generate(autoplay);
    }
  }

  boot();
})();
