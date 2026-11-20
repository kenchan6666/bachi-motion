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
  const settingsEl = $("settings");
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

  function updateHeading(data) {
    document.title = "bachi-motion";
    if (!songEl) return;
    songEl.replaceChildren();
    if (!data) return;
    const name = data.song || (data.headers && data.headers.title) || "";
    const bpm = data.bpm;
    const course = data.course || (data.headers && data.headers.course);
    if (name) appendMetaPart(songEl, name, true);
    if (course) appendMetaPart(songEl, String(course), false);
    if (bpm) appendMetaPart(songEl, "BPM " + bpm, false);
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
    "自动滚奏": "12 分 1-2，16／24 分整串 2-2",
    "24分滚奏": "只滚 24 分，每段 1-2；12／16 分照常单打",
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
    if (hint) hint.textContent = ROLL_HINTS[v] || ROLL_HINTS["自动滚奏"];
  }

  function setStickingLocked(locked) {
    const tech = $("techniqueSelect");
    const seg = $("rollSeg");
    const lockHint = $("autoStickingLock");
    if (tech) tech.disabled = !!locked;
    document.querySelectorAll("#handSeg [data-hand]").forEach((b) => { b.disabled = !!locked; });
    const handSeg = $("handSeg");
    if (handSeg) handSeg.classList.toggle("is-locked", !!locked);
    document.querySelectorAll("#rollSeg [data-roll]").forEach((b) => { b.disabled = !!locked; });
    if (seg) seg.classList.toggle("is-locked", !!locked);
    if (lockHint) lockHint.hidden = !locked;
  }

  function parseOpts() {
    const opts = {};
    if (pageParams.get("course")) opts.course = pageParams.get("course");
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
    if (settingsEl) settingsEl.open = true;
  }

  $("btnGenerate").onclick = () => generate(true);
  modeZhuren.onclick = () => setMode("zhuren");
  modeSuyue.onclick = () => setMode("suyue");
  $("jsonFile").onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      jsonInput.value = String(reader.result || "");
      setMode("suyue");
      syncChartPicker("custom");
      openSettings();
      showError("");
    };
    reader.onerror = () => showError("读取 JSON 文件失败");
    reader.readAsText(file, "utf-8");
  };
  $("tjaFile").onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      tjaInput.value = String(reader.result || "");
      setMode("zhuren");
      syncChartPicker("custom");
      openSettings();
      showError("");
    };
    reader.onerror = () => showError("读取 TJA 文件失败");
    reader.readAsText(file, "utf-8");
  };

  function safeSampleName(name) {
    const base = String(name || "").replace(/\.tja$/i, "");
    return /^[A-Za-z0-9_-]+$/.test(base) ? base : null;
  }

  const PREFILLED_SAMPLES = { suyue_demo2_8bun16bun: true, suyue_demo: true };

  async function loadSampleChart(name) {
    const sample = safeSampleName(name);
    if (!sample) return null;
    const tjaRes = await fetch("samples/" + sample + ".tja", { cache: "no-store" });
    if (!tjaRes.ok) throw new Error(tjaRes.status);
    tjaInput.value = await tjaRes.text();
    let hasHands = false;
    try {
      const jsonRes = await fetch("samples/" + sample + ".handorder.json", { cache: "no-store" });
      if (jsonRes.ok) {
        jsonInput.value = await jsonRes.text();
        hasHands = true;
      }
    } catch (err) { /* no companion 手顺 is fine */ }
    if (hasHands) setMode("suyue");
    else {
      jsonInput.value = "";
      setMode("zhuren");
    }
    syncChartPicker(CHARTS.some((c) => c.id === sample) ? sample : "custom");
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

  function setupRouteHint() {
    const btn = $("routeHintBtn");
    const pop = $("routeHint");
    if (!btn || !pop) return;
    const supportsPopover = Object.hasOwn(HTMLElement.prototype, "popover");
    const closeBtn = pop.querySelector(".route-hint-close");

    function place() {
      const anchor = btn.getBoundingClientRect();
      const margin = 8;
      const gap = 10;
      const width = Math.min(260, window.innerWidth - margin * 2);
      pop.style.width = width + "px";
      const height = pop.offsetHeight;
      const spaceBelow = window.innerHeight - anchor.bottom - margin;
      const spaceAbove = anchor.top - margin;
      const above = spaceBelow < height + gap && spaceAbove > spaceBelow;
      let top = above ? anchor.top - gap - height : anchor.bottom + gap;
      let left = anchor.left + anchor.width / 2 - 22;
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
      pop.style.position = "fixed";
      pop.style.inset = "auto";
      pop.style.margin = "0";
      pop.style.left = left + "px";
      pop.style.top = top + "px";
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

    if (supportsPopover) {
      pop.addEventListener("beforetoggle", (e) => {
        if (e.newState === "open") pop.style.visibility = "hidden";
      });
      pop.addEventListener("toggle", (e) => {
        const open = e.newState === "open";
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
    if (settingsEl) {
      settingsEl.addEventListener("toggle", () => {
        if (!settingsEl.open) hide();
      });
    }
  }

  setupRouteHint();

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
    setTja: (v) => { tjaInput.value = v || ""; },
    getJson: () => jsonInput.value,
    setJson: (v) => { jsonInput.value = v || ""; },
    ROLL_HINTS,
  };

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
        await loadSampleChart(sample);
      } catch (err) {
        if (!PREFILLED_SAMPLES[sample]) {
          showError("无法加载示例谱 samples/" + sample + ".tja");
        }
        // Default showcase (练习谱2) is prefilled in the textarea; file:// fetch may fail and that's ok.
      }
    }

    const rawTja = pageParams.get("tja");
    if (rawTja) {
      try { tjaInput.value = decodeURIComponent(rawTja); }
      catch (err) { showError("URL 里的 tja 参数无法解码"); }
      syncChartPicker("custom");
    }

    if (pageParams.get("settings") === "1") openSettings();

    // Headless export/dump always injects its own payload via startEngine.
    // Do not generate the prefilled 练习谱2 first: that would write
    // 「溯溯的练习谱2」into the title bar and download extra unicode-range
    // slices before the real song is loaded.
    const autoplay = pageParams.get("autoplay") === "1";
    if (pageParams.get("export") !== "1") generate(autoplay);
  }

  boot();
})();
