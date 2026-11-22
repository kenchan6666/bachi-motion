"use strict";

/**
 * Homepage 「开始渲染」 sends the open chart. Queue markup, if present, still
 * posts through the same local --serve endpoint. The public page does not
 * include that markup. Multi-chart queues stay on the command line.
 */
(function (factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { api.mount(); });
    } else {
      api.mount();
    }
  }
})(function () {
  function optionalSeconds(value) {
    if (value == null || value === "") return null;
    const n = +value;
    return Number.isFinite(n) ? n : null;
  }

  function editorVolumes() {
    const api = typeof window !== "undefined" ? window.TaikoVolume : null;
    const music = api && typeof api.musicVolume === "function" ? +api.musicVolume() : 100;
    const drum = api && typeof api.drumVolume === "function" ? +api.drumVolume() : 100;
    return {
      musicVolume: Number.isFinite(music) && music >= 0 ? music : 100,
      drumVolume: Number.isFinite(drum) && drum >= 0 ? drum : 100,
    };
  }

  function volumeOr(value, fallback) {
    if (value == null || value === "") return fallback;
    const n = +value;
    if (!Number.isFinite(n) || n < 0) return fallback;
    return n;
  }

  function serializeJob(job) {
    const song = job && job.songBase64 ? String(job.songBase64) : null;
    const volumes = editorVolumes();
    return {
      id: job.id || "",
      name: job.name || "chart.tja",
      tjaText: job.tjaText || "",
      songBase64: song,
      songName: song ? (job.songName || "song") : null,
      hits: !!job.hits,
      musicVolume: volumeOr(job && job.musicVolume, volumes.musicVolume),
      drumVolume: volumeOr(job && job.drumVolume, volumes.drumVolume),
      stickingText: job.stickingText || null,
      course: job.course || null,
      branch: job.branch || null,
      measures: job.measures || null,
      technique: job.technique || "全换",
      hand: job.hand || "R",
      roll: job.roll || "自动滚奏",
      bignote: job.bignote || "single",
      rate: job.rate == null ? 1 : job.rate,
      sectionStart: optionalSeconds(job.sectionStart),
      sectionEnd: optionalSeconds(job.sectionEnd),
    };
  }

  function applyProgress(els, snap) {
    snap = snap || {};
    if (els.item) {
      els.item.max = 1;
      els.item.value = snap.itemFraction || 0;
    }
    if (els.overall) {
      els.overall.max = 1;
      els.overall.value = snap.overallFraction || 0;
    }
    const frames = snap.frameCount ? (snap.frame + "/" + snap.frameCount) : "";
    if (els.itemLabel) {
      els.itemLabel.textContent = [snap.positionLabel, snap.currentLabel, frames].filter(Boolean).join(" ");
    }
    if (els.overallLabel) {
      const pct = Math.round((snap.overallFraction || 0) * 100);
      els.overallLabel.textContent = "整批 " + pct + "%";
    }
  }

  function fileToBase64(file) {
    return file.arrayBuffer().then(function (buf) {
      const bytes = new Uint8Array(buf);
      let bin = "";
      const step = 0x8000;
      for (let i = 0; i < bytes.length; i += step) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
      }
      return btoa(bin);
    });
  }

  function currentSettings() {
    const app = window.BachiApp || {};
    const rateBtn = document.querySelector(".chip.on[data-rate]");
    const bigBtn = document.querySelector("[data-bignote].on");
    return {
      technique: app.currentTechnique ? app.currentTechnique() : "全换",
      hand: app.currentHand ? app.currentHand() : "R",
      roll: app.currentRoll ? app.currentRoll() : "自动滚奏",
      bignote: bigBtn ? bigBtn.dataset.bignote : "single",
      rate: rateBtn ? Number(rateBtn.dataset.rate) : 1,
      stickingText: app.currentMode && app.currentMode() === "suyue" && app.getJson ? app.getJson() : "",
    };
  }

  function sharedOriginalFile() {
    const api = typeof window !== "undefined" ? window.BachiOriginal : null;
    if (!api) return null;
    // Homepage 「原曲」 off, or no file yet → this row has no original.
    if (typeof api.activeFile === "function") return api.activeFile() || null;
    if (typeof api.getFile === "function") return api.getFile() || null;
    return null;
  }

  function chartName(text) {
    const match = String(text || "").match(/^TITLE:[ \t]*(.*)$/m);
    const title = match && match[1] ? match[1].trim() : "";
    return title || "当前谱面";
  }

  function currentChartRow() {
    const app = window.BachiApp;
    const text = app && app.getTja ? app.getTja() : "";
    if (!String(text || "").trim()) return null;
    const section = window.taikoAnim && typeof window.taikoAnim.exportSection === "function"
      ? window.taikoAnim.exportSection()
      : null;
    const settings = currentSettings();
    const opts = app && app.parseOpts ? app.parseOpts() : {};
    return {
      id: String(Date.now()),
      name: chartName(text),
      tjaText: text,
      course: opts.course || null,
      branch: opts.branch || null,
      songFile: sharedOriginalFile(),
      stickingText: settings.stickingText,
      technique: settings.technique,
      hand: settings.hand,
      roll: settings.roll,
      bignote: settings.bignote,
      rate: settings.rate,
      sectionStart: section && section.sectionStart,
      sectionEnd: section && section.sectionEnd,
    };
  }

  function desktopBridge() {
    if (typeof window === "undefined" || !window.bachiDesktop) return null;
    if (typeof window.bachiDesktop.startBatch !== "function") return null;
    return window.bachiDesktop;
  }

  function showDownloads(downloads, snap) {
    if (!downloads) return;
    downloads.replaceChildren();
    (snap.files || []).forEach(function (file) {
      if (file.ok && file.url) {
        const a = document.createElement("a");
        a.className = "file-btn";
        a.href = file.url;
        a.download = file.name || "bachi.mp4";
        a.textContent = "下载 " + (file.name || "mp4");
        downloads.appendChild(a);
      } else if (file.ok && file.filePath && window.bachiDesktop && typeof window.bachiDesktop.openPath === "function") {
        const saved = document.createElement("p");
        saved.className = "hint";
        saved.textContent = "已保存：" + file.filePath;
        const open = document.createElement("button");
        open.type = "button";
        open.className = "file-btn";
        open.textContent = "在文件夹中显示 " + (file.name || "mp4");
        open.addEventListener("click", function () {
          window.bachiDesktop.openPath(file.filePath);
        });
        downloads.appendChild(saved);
        downloads.appendChild(open);
      } else if (file.error) {
        const p = document.createElement("p");
        p.className = "hint";
        p.textContent = (file.name || "这一条") + "：" + file.error;
        downloads.appendChild(p);
      }
    });
  }

  const OFFLINE = "无法连接本机出片。请在项目目录运行 node render.js --serve。";

  function applySnap(ui, progressEls, snap) {
    applyProgress(progressEls, snap);
    if (!snap.done) {
      if (ui.onSnap) ui.onSnap(snap);
      else ui.setStatus((snap.positionLabel || "") + " " + (snap.currentLabel || ""));
      return;
    }
    ui.finished = true;
    ui.busy = false;
    if (ui.startBtn) ui.startBtn.disabled = false;
    showDownloads(ui.downloads, snap);
    ui.setStatus(snap.failed ? ("完成，" + snap.failed + " 条失败") : (ui.doneText || "整批完成"));
  }

  function runOnDesktop(desktop, payload, ui, progressEls) {
    return desktop.startBatch({ jobs: payload }).then(function (body) {
      if (!body || !body.id) throw new Error((body && body.error) || "无法开始渲染");
      return new Promise(function (resolve, reject) {
        let settled = false;
        const stop = desktop.onBatchEvent(function (snap) {
          if (!snap || snap.id !== body.id) return;
          applySnap(ui, progressEls, snap);
          if (!snap.done || settled) return;
          settled = true;
          if (typeof stop === "function") stop();
          resolve();
        });
        if (typeof stop !== "function") {
          reject(new Error("窗口没有接上出片进度"));
        }
      });
    });
  }

  function runRows(rows, ui) {
    if (ui.busy) return;
    ui.busy = true;
    ui.finished = false;
    if (ui.startBtn) ui.startBtn.disabled = true;
    if (ui.downloads) ui.downloads.replaceChildren();
    const hitsOn = !!(ui.hits && ui.hits.checked);
    const progressEls = {
      item: ui.item,
      overall: ui.overall,
      itemLabel: ui.itemLabel,
      overallLabel: ui.overallLabel,
    };
    applyProgress(progressEls, {
      positionLabel: "0/" + rows.length,
      currentLabel: "准备",
      itemFraction: 0,
      overallFraction: 0,
    });
    const failText = ui.failText || OFFLINE;
    Promise.all(rows.map(function (row) {
      const songTask = row.songFile ? fileToBase64(row.songFile) : Promise.resolve(null);
      return songTask.then(function (songBase64) {
        return serializeJob({
          id: row.id,
          name: row.name,
          tjaText: row.tjaText,
          songBase64: songBase64,
          songName: row.songFile ? row.songFile.name : "",
          hits: hitsOn,
          stickingText: row.stickingText || null,
          technique: row.technique,
          hand: row.hand,
          roll: row.roll,
          bignote: row.bignote,
          rate: row.rate,
          sectionStart: row.sectionStart,
          sectionEnd: row.sectionEnd,
          course: row.course || null,
          branch: row.branch || null,
        });
      });
    })).then(function (payload) {
      const desktop = desktopBridge();
      if (desktop) return runOnDesktop(desktop, payload, ui, progressEls);
      return fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: payload }),
      }).then(function (res) {
        return res.text().then(function (text) {
          let body = {};
          try { body = JSON.parse(text); } catch (err) { body = {}; }
          if (!res.ok || !body.id) {
            throw new Error((body && body.error) || failText);
          }
          return body;
        });
      }).then(function (body) {
        const source = new EventSource("/api/batch/" + body.id + "/events");
        source.onmessage = function (ev) {
          const snap = JSON.parse(ev.data);
          applyProgress(progressEls, snap);
          if (!snap.done) {
            if (ui.onSnap) ui.onSnap(snap);
            else ui.setStatus((snap.positionLabel || "") + " " + (snap.currentLabel || ""));
          }
          if (snap.done) {
            ui.finished = true;
            source.close();
            ui.busy = false;
            if (ui.startBtn) ui.startBtn.disabled = false;
            showDownloads(ui.downloads, snap);
            ui.setStatus(snap.failed ? ("完成，" + snap.failed + " 条失败") : (ui.doneText || "整批完成"));
          }
        };
        source.onerror = function () {
          if (ui.finished) return;
          ui.setStatus(ui.disconnectText || "和本机出片服务断开了。请确认 node render.js --serve 还在运行。");
          ui.busy = false;
          if (ui.startBtn) ui.startBtn.disabled = false;
          source.close();
        };
      });
    }).catch(function (err) {
      ui.busy = false;
      if (ui.startBtn) ui.startBtn.disabled = false;
      ui.setStatus(err && err.message ? err.message : failText);
    });
  }

  function mountSingle() {
    const startBtn = document.getElementById("renderStart");
    if (!startBtn) return;
    const status = document.getElementById("renderStatus");
    const hits = document.getElementById("renderHits");
    const progress = document.getElementById("renderProgress");
    const downloads = document.getElementById("renderDownloads");
    const ui = {
      startBtn: startBtn,
      hits: hits,
      item: progress,
      downloads: downloads,
      busy: false,
      finished: false,
      doneText: "渲染完成",
      failText: "连不上本机出片。",
      disconnectText: "和本机出片服务断开了。",
      setStatus: function (text) {
        if (status) status.textContent = text || "";
      },
      onSnap: function (snap) {
        const frames = snap.frameCount ? (snap.frame + "/" + snap.frameCount) : "";
        ui.setStatus([snap.currentLabel, frames].filter(Boolean).join(" "));
      },
    };
    startBtn.addEventListener("click", function () {
      if (ui.busy) return;
      const row = currentChartRow();
      if (!row) {
        ui.setStatus("当前没有谱面");
        return;
      }
      ui.setStatus("准备");
      runRows([row], ui);
    });
  }

  function mountBatch() {
    const list = document.getElementById("batchList");
    const startBtn = document.getElementById("batchStart");
    if (!list || !startBtn) return;

    const status = document.getElementById("batchStatus");
    const songInput = document.getElementById("batchSong");
    const songLabel = document.getElementById("batchSongName");
    const tjaInput = document.getElementById("batchTja");
    const addCurrent = document.getElementById("batchAddCurrent");
    const hits = document.getElementById("batchHits");
    const item = document.getElementById("batchItemProgress");
    const overall = document.getElementById("batchOverallProgress");
    const itemLabel = document.getElementById("batchItemLabel");
    const overallLabel = document.getElementById("batchOverallLabel");
    const downloads = document.getElementById("batchDownloads");
    const queue = [];
    let defaultSong = null;
    const ui = {
      startBtn: startBtn,
      hits: hits,
      item: item,
      overall: overall,
      itemLabel: itemLabel,
      overallLabel: overallLabel,
      downloads: downloads,
      busy: false,
      finished: false,
      setStatus: function (text) {
        if (status) status.textContent = text || "";
      },
    };

    function renderList() {
      list.replaceChildren();
      if (!queue.length) {
        const empty = document.createElement("li");
        empty.className = "batch-empty";
        empty.textContent = "还没有谱面";
        list.appendChild(empty);
        return;
      }
      queue.forEach(function (row, index) {
        const li = document.createElement("li");
        li.className = "batch-row";
        const name = document.createElement("span");
        name.className = "batch-name";
        name.textContent = (index + 1) + ". " + row.name;
        const song = document.createElement("span");
        song.className = "batch-song";
        song.textContent = row.songFile ? row.songFile.name : "无原曲";
        const pick = document.createElement("label");
        pick.className = "file-btn";
        pick.textContent = "这首的原曲";
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.opus,.mp4";
        input.addEventListener("change", function () {
          row.songFile = input.files && input.files[0] ? input.files[0] : row.songFile;
          renderList();
        });
        pick.appendChild(input);
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "file-btn";
        clear.textContent = "不要原曲";
        clear.addEventListener("click", function () {
          row.songFile = null;
          renderList();
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "file-btn";
        remove.textContent = "移除";
        remove.addEventListener("click", function () {
          queue.splice(index, 1);
          renderList();
        });
        li.append(name, song, pick, clear, remove);
        list.appendChild(li);
      });
    }

    function pushRow(row) {
      const settings = currentSettings();
      queue.push({
        id: String(Date.now()) + "-" + queue.length,
        name: row.name,
        tjaText: row.tjaText,
        songFile: row.songFile || null,
        stickingText: row.stickingText != null ? row.stickingText : settings.stickingText,
        technique: settings.technique,
        hand: settings.hand,
        roll: settings.roll,
        bignote: settings.bignote,
        rate: settings.rate,
        sectionStart: row.sectionStart,
        sectionEnd: row.sectionEnd,
        course: row.course || null,
        branch: row.branch || null,
      });
      renderList();
    }

    if (songInput) {
      songInput.addEventListener("change", function () {
        defaultSong = songInput.files && songInput.files[0] ? songInput.files[0] : null;
        if (songLabel) songLabel.textContent = defaultSong ? ("新加入的谱用这首：" + defaultSong.name) : "未选择原曲：成片不含原曲。打点声可以另外叠。";
      });
    }
    if (tjaInput) {
      tjaInput.addEventListener("change", function () {
        const files = Array.from(tjaInput.files || []);
        tjaInput.value = "";
        Promise.all(files.map(function (file) {
          const decode = window.TjaEncoding && window.TjaEncoding.readFile;
          const pending = decode ? decode(file) : file.text();
          return pending.then(function (text) {
            pushRow({ name: file.name, tjaText: text, songFile: defaultSong, stickingText: "" });
          });
        })).catch(function () { ui.setStatus("读取 TJA 失败"); });
      });
    }
    if (addCurrent) {
      addCurrent.addEventListener("click", function () {
        const app = window.BachiApp;
        const text = app && app.getTja ? app.getTja() : "";
        if (!String(text || "").trim()) { ui.setStatus("当前没有谱面"); return; }
        const section = window.taikoAnim && typeof window.taikoAnim.exportSection === "function"
          ? window.taikoAnim.exportSection()
          : null;
        const courseName = app && app.selectedCourseName ? app.selectedCourseName() : "";
        const opts = app && app.parseOpts ? app.parseOpts() : {};
        pushRow({
          name: "当前谱面.tja",
          tjaText: text,
          branch: opts.branch || null,
          // Snapshot of the shared song only while 「原曲」 is on.
          // A row that later picks its own file keeps that file.
          songFile: sharedOriginalFile(),
          sectionStart: section && section.sectionStart,
          sectionEnd: section && section.sectionEnd,
          course: courseName || null,
        });
        ui.setStatus(section ? "已把当前谱面放进队列（按当前选段）" : "已把当前谱面放进队列");
      });
    }

    startBtn.addEventListener("click", function () {
      if (ui.busy) return;
      if (!queue.length) { ui.setStatus("队列是空的"); return; }
      runRows(queue.slice(), ui);
    });

    renderList();
    fetch("/api/render-info", { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("offline");
      ui.setStatus("已连上本机出片。选了原曲会从「第一个音的时间 − 0.7 秒」对齐；只放 TJA 时不含原曲。");
    }).catch(function () {
      ui.setStatus("批量出片要在自己的电脑上运行 node render.js --serve。GitHub Pages 只预览动画，不会在网页上渲染。");
    });
  }

  function mount() {
    mountSingle();
    mountBatch();
  }

  return {
    serializeJob: serializeJob,
    applyProgress: applyProgress,
    mount: mount,
  };
});
