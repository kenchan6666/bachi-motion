/**
 * 编辑器里的音量栏：只调音乐和鼓点，颜色跟现有鼓棒界面走，导出时拉高鼓点不改原曲。
 *
 *   node tests/taiko-volume-ui.test.js
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));

function loadPuppeteer() {
  const candidates = [
    path.join(ROOT, "node_modules", "puppeteer-core"),
    "puppeteer-core",
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch (err) { /* next */ }
  }
  throw new Error("Cannot find puppeteer-core");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".tja": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

function startStaticServer(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/") rel = "/index.html";
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function parseRgb(text) {
  const m = String(text).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3] };
}

function near(color, target, tol) {
  if (!color) return false;
  const limit = tol == null ? 2 : tol;
  return Math.abs(color.r - target.r) <= limit
    && Math.abs(color.g - target.g) <= limit
    && Math.abs(color.b - target.b) <= limit;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const chrome = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome";
  const { server, port } = await startStaticServer(ROOT);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chrome,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const fails = [];
  function check(cond, msg) {
    if (!cond) fails.push(msg);
  }
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:" + port + "/index.html", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await page.click("#btnOpenEditor");
    await page.waitForSelector("#editorVolume", { visible: true, timeout: 10000 });

    const view = await page.evaluate(() => {
      const column = document.getElementById("editorVolume");
      column.scrollIntoView({ block: "center" });
      const music = document.getElementById("editorMusicVolume");
      const drum = document.getElementById("editorDrumVolume");
      const box = column.getBoundingClientRect();
      const columnStyle = getComputedStyle(column);
      const musicStyle = getComputedStyle(music);
      const drumStyle = getComputedStyle(drum);
      return {
        files: column.querySelectorAll('input[type="file"]').length,
        text: column.innerText,
        musicValue: music.value,
        drumValue: drum.value,
        musicMax: music.max,
        box: { width: box.width, height: box.height },
        background: columnStyle.backgroundColor,
        color: columnStyle.color,
        musicAccent: musicStyle.accentColor,
        drumAccent: drumStyle.accentColor,
      };
    });

    check(view.files === 0, "volume column still has a file input");
    check(view.text.includes("音乐") && view.text.includes("鼓点"), "labels missing: " + view.text);
    check(!view.text.includes("选择文件") && !view.text.includes("音乐壳音"), "column asks for a file: " + view.text);
    check(view.musicValue === "100" && view.drumValue === "100", "defaults are not 100: " + JSON.stringify(view));
    check(view.box.width > 80 && view.box.height > 40, "volume column is not laid out " + JSON.stringify(view.box));

    const paper = { r: 243, g: 235, b: 224 };
    const ink = { r: 62, g: 50, b: 40 };
    const accentInk = { r: 107, g: 90, b: 74 };
    const suyueDon = { r: 197, g: 54, b: 43 };
    const suyueKa = { r: 42, g: 98, b: 181 };
    const bg = parseRgb(view.background);
    const fg = parseRgb(view.color);
    const musicAccent = parseRgb(view.musicAccent);
    const drumAccent = parseRgb(view.drumAccent);
    check(near(bg, paper), "volume background is not the editor paper " + view.background);
    check(near(fg, ink, 8), "volume text is not the editor ink " + view.color);
    check(near(musicAccent, accentInk, 8), "music slider accent is not editor ink " + view.musicAccent);
    check(near(drumAccent, accentInk, 8), "drum slider accent is not editor ink " + view.drumAccent);
    check(!near(musicAccent, suyueDon, 12) && !near(musicAccent, suyueKa, 12), "music slider uses the suyue red/blue " + view.musicAccent);
    check(!near(drumAccent, suyueDon, 12) && !near(drumAccent, suyueKa, 12), "drum slider uses the suyue red/blue " + view.drumAccent);

    await page.evaluate(() => {
      const drum = document.getElementById("editorDrumVolume");
      drum.value = "250";
      drum.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const after = await page.evaluate(() => ({
      music: document.getElementById("editorMusicVolume").value,
      drum: document.getElementById("editorDrumVolume").value,
      musicReadout: document.getElementById("editorMusicVolumeReadout").textContent,
      drumReadout: document.getElementById("editorDrumVolumeReadout").textContent,
      musicVolume: window.TaikoVolume.musicVolume(),
      drumVolume: window.TaikoVolume.drumVolume(),
    }));
    check(after.music === "100" && after.musicVolume === 100, "raising drums changed the music volume " + JSON.stringify(after));
    check(after.drum === "250" && after.drumVolume === 250, "drum slider did not stick " + JSON.stringify(after));
    check(after.musicReadout.includes("100") && after.drumReadout.includes("250"), "readouts " + JSON.stringify(after));

    const mixed = await page.evaluate(async () => {
      const sr = 44100;
      const music = new Float64Array(sr);
      for (let i = 0; i < sr / 2; i++) music[i] = 0.25;
      const wav = window.TaikoVolume.encodeWav(music, sr);
      const file = new File([wav], "tone.wav", { type: "audio/wav" });
      window.BachiOriginal.setFile(file);
      window.taikoAnim.setData({
        events: [{ t: 0.5, hand: "R", face: "don", grip: "single" }],
        timeShift: 0,
        bpm: 120,
      });
      window.TaikoVolume.setVolumes(100, 100);
      const quiet = await window.TaikoVolume.mixCurrentEditor();
      window.TaikoVolume.setVolumes(100, 250);
      const loud = await window.TaikoVolume.mixCurrentEditor();
      const head = sr / 2;
      let headDelta = 0;
      let musicDelta = 0;
      for (let i = 0; i < head; i++) {
        headDelta = Math.max(headDelta, Math.abs(loud.data[i] - quiet.data[i]));
        musicDelta = Math.max(musicDelta, Math.abs(loud.data[i] - 0.25));
      }
      let hitDelta = 0;
      const hitEnd = Math.min(loud.frames, head + 200);
      for (let i = head; i < hitEnd; i++) {
        hitDelta = Math.max(hitDelta, Math.abs(loud.data[i] - quiet.data[i] * 2.5));
      }
      return {
        frames: loud.frames,
        channels: loud.channels,
        rate: loud.sampleRate,
        headDelta: headDelta,
        musicDelta: musicDelta,
        hitDelta: hitDelta,
        quietHit: quiet.data[head],
        loudHit: loud.data[head],
      };
    });
    check(mixed.rate === 44100, "export rate did not follow the song " + JSON.stringify(mixed));
    check(mixed.channels >= 1, "export has no channel " + JSON.stringify(mixed));
    check(mixed.headDelta < 1e-9, "raising drums changed the music region " + JSON.stringify(mixed));
    check(mixed.musicDelta < 1e-9, "music region is not the loaded song " + JSON.stringify(mixed));
    check(mixed.hitDelta < 1e-6 && mixed.quietHit !== 0, "drum region did not scale " + JSON.stringify(mixed));

    await page.evaluate(() => {
      window.TaikoVolume.setVolumes(100, 100);
      const drum = document.getElementById("editorDrumVolume");
      drum.value = "100";
      drum.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.click("#editorExportMix");
    await page.waitForFunction(() => {
      const status = document.getElementById("editorVolumeStatus");
      return status && /已导出|混音失败|缺少/.test(status.textContent || "");
    }, { timeout: 10000 });
    const status = await page.evaluate(() => document.getElementById("editorVolumeStatus").textContent);
    check(status.includes("已导出"), "export status: " + status);
    check(status.includes("100"), "export status did not report both volumes: " + status);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  if (fails.length) {
    console.error(fails.map((msg) => "FAIL: " + msg).join("\n"));
    process.exit(1);
  }
  console.log("taiko-volume ui: ok");
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
