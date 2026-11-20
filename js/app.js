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
  const titleEl = $("title");
  const songEl = $("song");

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

  function updateHeading(data) {
    document.title = "溯溯的鼓棒";
    titleEl.textContent = "溯溯的鼓棒";
    if (!songEl) return;
    if (!data) { songEl.textContent = ""; return; }
    const name = data.song || (data.headers && data.headers.title) || "";
    const bpm = data.bpm;
    const course = data.course || (data.headers && data.headers.course);
    const bits = [];
    if (name) bits.push(name);
    if (course) bits.push(course);
    if (bpm) bits.push("BPM " + bpm);
    songEl.textContent = bits.join("　");
  }

  function parseOpts() {
    const opts = {};
    if (pageParams.get("course")) opts.course = pageParams.get("course");
    if (pageParams.get("measures")) opts.measures = pageParams.get("measures");
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
      showError("");
    };
    reader.onerror = () => showError("读取 TJA 文件失败");
    reader.readAsText(file, "utf-8");
  };

  function safeSampleName(name) {
    const base = String(name || "").replace(/\.tja$/i, "");
    return /^[A-Za-z0-9_-]+$/.test(base) ? base : null;
  }

  const sampleSelect = $("sampleSelect");
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
    if (sampleSelect) sampleSelect.value = sample;
    return sample;
  }

  if (sampleSelect) {
    sampleSelect.onchange = async (e) => {
      showError("");
      try {
        await loadSampleChart(e.target.value);
        generate(true);
      } catch (err) {
        showError("无法加载示例谱 samples/" + e.target.value + ".tja");
      }
    };
  }

  async function boot() {
    if (pageParams.get("mode") === "suyue") setMode("suyue");
    else setMode("zhuren");

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
    }

    const autoplay = pageParams.get("autoplay") === "1";
    generate(autoplay);
  }

  boot();
})();
