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

  function parseOpts() {
    const opts = {};
    if (pageParams.get("course")) opts.course = pageParams.get("course");
    if (pageParams.get("measures")) opts.measures = pageParams.get("measures");
    opts.bigNote = currentBigNote();
    return opts;
  }

  function buildData() {
    if (currentMode() === "suyue") {
      const raw = jsonInput.value.trim();
      if (!raw) throw new Error("请先贴上溯月的手顺 JSON，或切回「主人」模式用 TJA 自动生成手顺");
      const opts = parseOpts();
      const tja = tjaInput.value.trim();
      if (tja) {
        try {
          const base = TaikoParser.eventsFromTja(tja, opts);
          opts.chartMeasures = base.chartMeasures;
          opts.timeShift = base.timeShift || 0;
          opts.rangeStart = base.rangeStart;
          opts.rangeEnd = base.rangeEnd;
          opts.song = base.song;
          opts.headers = base.headers;
          opts.bpm = base.bpm;
          if (base.course) opts.course = base.course;
        } catch (err) { /* 手顺 can still load without a companion TJA */ }
      }
      return TaikoParser.loadHandJson(raw, opts);
    }
    const raw = tjaInput.value.trim();
    if (!raw) throw new Error("请先在输入框里贴一段 TJA 谱面");
    return TaikoParser.eventsFromTja(raw, parseOpts());
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
    updateHeading(data);
    seek(state.start);
    if (play) setPlaying(true);
    console.log("[bachi-motion] events:", state.events.length, "mode:", currentMode());
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

  async function boot() {
    if (pageParams.get("mode") === "suyue") setMode("suyue");
    else setMode("zhuren");

    setBigNote(pageParams.get("bignote") || "single");

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

    const autoplay = pageParams.get("autoplay") === "1";
    generate(autoplay);
  }

  boot();
})();
