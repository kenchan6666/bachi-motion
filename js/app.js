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
      return TaikoParser.loadHandJson(raw, parseOpts());
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

  async function boot() {
    if (pageParams.get("mode") === "suyue") setMode("suyue");
    else setMode("zhuren");

    const sample = safeSampleName(pageParams.get("sample") || "");
    if (sample) {
      try {
        const res = await fetch("samples/" + sample + ".tja", { cache: "no-store" });
        if (!res.ok) throw new Error(res.status);
        tjaInput.value = await res.text();
      } catch (err) {
        if (sample !== "suyue_demo") {
          showError("无法加载示例谱 samples/" + sample + ".tja");
        }
        // suyue_demo is prefilled in the textarea; file:// fetch may fail and that's ok.
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
