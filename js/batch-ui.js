"use strict";

/**
 * Batch queue UI. Works in the browser and under Node (serialize / progress only).
 * Rendering itself stays on the local --serve process.
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
  function serializeJob(job) {
    const song = job && job.songBase64 ? String(job.songBase64) : null;
    return {
      id: job.id || "",
      name: job.name || "chart.tja",
      tjaText: job.tjaText || "",
      songBase64: song,
      songName: song ? (job.songName || "song") : null,
      hits: !!job.hits,
      stickingText: job.stickingText || null,
      course: job.course || null,
      measures: job.measures || null,
      technique: job.technique || "全换",
      hand: job.hand || "R",
      roll: job.roll || "自动滚奏",
      bignote: job.bignote || "single",
      rate: job.rate == null ? 1 : job.rate,
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

  function mount() {
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
    let running = false;
    let finished = false;

    function setStatus(text) {
      if (status) status.textContent = text || "";
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
        input.accept = "audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.opus";
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
          return file.text().then(function (text) {
            pushRow({ name: file.name, tjaText: text, songFile: defaultSong, stickingText: "" });
          });
        })).catch(function () { setStatus("读取 TJA 失败"); });
      });
    }
    if (addCurrent) {
      addCurrent.addEventListener("click", function () {
        const app = window.BachiApp;
        const text = app && app.getTja ? app.getTja() : "";
        if (!String(text || "").trim()) { setStatus("当前没有谱面"); return; }
        pushRow({ name: "当前谱面.tja", tjaText: text, songFile: defaultSong });
        setStatus("已把当前谱面放进队列");
      });
    }

    function showDownloads(snap) {
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
        } else if (file.error) {
          const p = document.createElement("p");
          p.className = "hint";
          p.textContent = (file.name || "这一条") + "：" + file.error;
          downloads.appendChild(p);
        }
      });
    }

    startBtn.addEventListener("click", function () {
      if (running) return;
      if (!queue.length) { setStatus("队列是空的"); return; }
      running = true;
      finished = false;
      startBtn.disabled = true;
      if (downloads) downloads.replaceChildren();
      applyProgress({ item: item, overall: overall, itemLabel: itemLabel, overallLabel: overallLabel }, {
        positionLabel: "0/" + queue.length,
        currentLabel: "准备",
        itemFraction: 0,
        overallFraction: 0,
      });
      const hitsOn = !!(hits && hits.checked);
      Promise.all(queue.map(function (row) {
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
          });
        });
      })).then(function (payload) {
        return fetch("/api/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobs: payload }),
        }).then(function (res) {
          return res.text().then(function (text) {
            let body = {};
            try { body = JSON.parse(text); } catch (err) { body = {}; }
            if (!res.ok || !body.id) {
              throw new Error((body && body.error) || "无法连接本机出片。请在项目目录运行 node render.js --serve。");
            }
            return body;
          });
        });
      }).then(function (body) {
        const source = new EventSource("/api/batch/" + body.id + "/events");
        source.onmessage = function (ev) {
          const snap = JSON.parse(ev.data);
          applyProgress({ item: item, overall: overall, itemLabel: itemLabel, overallLabel: overallLabel }, snap);
          if (!snap.done) {
            setStatus((snap.positionLabel || "") + " " + (snap.currentLabel || ""));
          }
          if (snap.done) {
            finished = true;
            source.close();
            running = false;
            startBtn.disabled = false;
            showDownloads(snap);
            setStatus(snap.failed ? ("完成，" + snap.failed + " 条失败") : "整批完成");
          }
        };
        source.onerror = function () {
          if (finished) return;
          setStatus("和本机出片服务断开了。请确认 node render.js --serve 还在运行。");
          running = false;
          startBtn.disabled = false;
          source.close();
        };
      }).catch(function (err) {
        running = false;
        startBtn.disabled = false;
        setStatus(err && err.message ? err.message : "无法连接本机出片。请在项目目录运行 node render.js --serve。");
      });
    });

    renderList();
    fetch("/api/render-info", { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("offline");
      setStatus("已连上本机出片。选了原曲会从「第一个音的时间 − 0.7 秒」对齐；只放 TJA 时不含原曲。");
    }).catch(function () {
      setStatus("批量出片要在自己的电脑上运行 node render.js --serve。GitHub Pages 只预览动画，不会在网页上渲染。");
    });
  }

  return {
    serializeJob: serializeJob,
    applyProgress: applyProgress,
    mount: mount,
  };
});
