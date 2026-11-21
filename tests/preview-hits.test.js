/**
 * Preview playback of the bundled don/ka samples.
 * Chart times are event.t (OFFSET already applied). Export capture stays silent.
 *
 *   node tests/preview-hits.test.js
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));
const preview = require(path.join(ROOT, "js", "preview-hits.js"));
const audio = require(path.join(ROOT, "js", "audio-mux.js"));

let passed = 0;

function check(name, fn) {
  const ret = fn();
  if (ret && typeof ret.then === "function") {
    return ret.then(() => {
      passed += 1;
      console.log("  ✓ " + name);
    });
  }
  passed += 1;
  console.log("  ✓ " + name);
}

function nearly(a, b, eps) {
  assert.ok(Math.abs(a - b) <= (eps == null ? 1e-6 : eps), "expected " + a + " ≈ " + b);
}

/** Playhead has reached the note. Allows 1µs of float; does not treat a fixed 1.5 as the bar. */
function reached(now, noteT) {
  assert.ok(
    Number.isFinite(+now) && +now + 1e-6 >= noteT,
    "playhead " + now + " had not reached note " + noteT
  );
}

(async function main() {
  await check("big-note boost matches export", () => {
    assert.strictEqual(preview.BIG_BOOST, audio.BIG_BOOST);
    assert.strictEqual(preview.BIG_BOOST, 1.25);
  });

  await check("same-time same-face hits collapse; first event keeps the big boost", () => {
    const hits = preview.hitsForPlaybackStep([
      { t: 1, face: "don", big: true },
      { t: 1, face: "don", big: false },
      { t: 1, face: "ka", big: false },
      { t: 1.0000004, face: "ka", big: true },
    ], 0, 2, { playing: true });
    assert.deepStrictEqual(hits.map((h) => h.face + "@" + h.gain), ["don@1.25", "ka@1"]);
    assert.strictEqual(preview.hitKey({ t: 1, face: "don" }), "1.000000:don");
    const smallFirst = preview.hitsForPlaybackStep([
      { t: 2, face: "don", big: false },
      { t: 2, face: "don", big: true },
    ], 1, 3, { playing: true });
    assert.strictEqual(smallFirst.length, 1);
    assert.strictEqual(smallFirst[0].gain, 1);
    assert.strictEqual(smallFirst[0].big, false);
  });

  await check("a hit is scheduled when playback crosses event.t, and not on the next frame", () => {
    const events = [{ t: 1, face: "don", big: false, offset: -2 }];
    const crossed = preview.hitsForPlaybackStep(events, 0.5, 1, { playing: true, maxStep: 0.5 });
    assert.strictEqual(crossed.length, 1);
    assert.strictEqual(crossed[0].t, 1);
    assert.strictEqual(crossed[0].face, "don");
    assert.strictEqual(crossed[0].gain, 1);
    const again = preview.hitsForPlaybackStep(events, 1, 1.2, { playing: true, maxStep: 0.2 });
    assert.deepStrictEqual(again, []);
    const before = preview.hitsForPlaybackStep(events, 0.2, 0.9, { playing: true, maxStep: 0.7 });
    assert.deepStrictEqual(before, []);
  });

  await check("pause, mute, export, and a backward seek schedule nothing", () => {
    const events = [{ t: 1, face: "ka", big: true }];
    const step = { loop: false, maxStep: 1 };
    assert.deepStrictEqual(preview.hitsForPlaybackStep(events, 0.2, 1.2, Object.assign({ playing: false }, step)), []);
    assert.deepStrictEqual(preview.hitsForPlaybackStep(events, 0.2, 1.2, Object.assign({ playing: true, enabled: false }, step)), []);
    assert.deepStrictEqual(preview.hitsForPlaybackStep(events, 0.2, 1.2, Object.assign({ playing: true, exporting: true }, step)), []);
    assert.deepStrictEqual(preview.hitsForPlaybackStep(events, 1.5, 0.2, Object.assign({ playing: true, loop: false }, step)), []);
    assert.strictEqual(preview.isExportCapture({ body: { classList: { contains: (c) => c === "export" } } }, ""), true);
    assert.strictEqual(preview.isExportCapture({ body: { classList: { contains: () => false } } }, "?export=1&rate=0.3"), true);
    assert.strictEqual(preview.isExportCapture({ body: { classList: { contains: () => false } } }, "?rate=1"), false);
  });

  await check("a section snap does not spray notes the playhead jumped over", () => {
    const events = [
      { t: 0.2, face: "don" },
      { t: 1, face: "ka" },
      { t: 2, face: "don", big: true },
    ];
    const snapped = preview.hitsForPlaybackStep(events, -0.7, 2, {
      playing: true,
      maxStep: 0.02,
      clipStart: 1.3,
      clipEnd: 4,
    });
    assert.deepStrictEqual(snapped, []);
    const played = preview.hitsForPlaybackStep(events, 1.95, 2.02, {
      playing: true,
      maxStep: 0.1,
      clipStart: 1.3,
      clipEnd: 4,
    });
    assert.strictEqual(played.length, 1);
    assert.strictEqual(played[0].t, 2);
    assert.strictEqual(played[0].gain, preview.BIG_BOOST);
  });

  await check("section trim keeps notes inside the clip and drops the rest", () => {
    const events = [
      { t: 0.5, face: "don" },
      { t: 2, face: "ka" },
      { t: 5, face: "don", big: true },
    ];
    const inside = preview.hitsForPlaybackStep(events, 1.9, 2.1, {
      playing: true,
      clipStart: 1.5,
      clipEnd: 4,
    });
    assert.deepStrictEqual(inside.map((h) => h.t + ":" + h.face), ["2:ka"]);
    const outside = preview.hitsForPlaybackStep(events, 0.4, 0.6, {
      playing: true,
      clipStart: 1.5,
      clipEnd: 4,
    });
    assert.deepStrictEqual(outside, []);
    const atCap = preview.hitsForPlaybackStep([{ t: 4, face: "don", big: true }], 3.9, 4, {
      playing: true,
      clipStart: 1.5,
      clipEnd: 4,
    });
    assert.strictEqual(atCap.length, 1);
    assert.strictEqual(atCap[0].t, 4);
  });

  await check("loop wrap fires the tail and the head, not the lead-in again", () => {
    const events = [
      { t: 1.4, face: "don" },
      { t: 2.02, face: "ka" },
      { t: 3, face: "don" },
      { t: 3.98, face: "don", big: true },
    ];
    const opts = {
      playing: true,
      loop: true,
      loopStart: 2,
      loopEnd: 4,
      clipStart: 1.3,
      clipEnd: 4,
      maxStep: 0.1,
    };
    const opening = preview.hitsForPlaybackStep(events, 1.35, 1.45, opts);
    assert.deepStrictEqual(opening.map((h) => h.t), [1.4]);
    const wrapped = preview.hitsForPlaybackStep(events, 3.95, 2.05, opts);
    assert.deepStrictEqual(wrapped.map((h) => h.t + ":" + h.face + ":" + h.gain), [
      "3.98:don:" + preview.BIG_BOOST,
      "2.02:ka:1",
    ]);
  });

  await check("a note waits until the playhead reaches event.t", () => {
    const noteT = 1.5;
    const events = [{ t: noteT, face: "ka", big: true }];
    // A frame can stop this close and still look "not yet" on screen
    // (now - t < 0). The old +1e-9 slack scheduled the hit anyway.
    const justUnder = noteT - 1e-10;
    assert.ok(justUnder < noteT);
    assert.ok(noteT <= justUnder + 1e-9);
    const step = { playing: true, maxStep: 0.1 };
    assert.deepStrictEqual(preview.hitsForPlaybackStep(events, 1.45, justUnder, step), []);
    const hit = preview.hitsForPlaybackStep(events, justUnder, noteT, step);
    assert.strictEqual(hit.length, 1);
    assert.strictEqual(hit[0].t, noteT);
    assert.strictEqual(hit[0].face, "ka");
    assert.strictEqual(hit[0].big, true);
    assert.strictEqual(hit[0].gain, preview.BIG_BOOST);
  });

  await check("slow-mo is a shorter chart step, and the hit stays on event.t", () => {
    const events = [{ t: 2, face: "ka", big: true }];
    const missed = preview.hitsForPlaybackStep(events, 1.9, 1.94, { playing: true, maxStep: 0.04 });
    assert.deepStrictEqual(missed, []);
    const hit = preview.hitsForPlaybackStep(events, 1.94, 2.01, { playing: true, maxStep: 0.07 });
    assert.strictEqual(hit.length, 1);
    assert.strictEqual(hit[0].t, 2);
    assert.strictEqual(hit[0].gain, preview.BIG_BOOST);
  });

  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const engine = fs.readFileSync(path.join(ROOT, "js", "engine.js"), "utf8");
  const playerSrc = fs.readFileSync(path.join(ROOT, "js", "preview-hits.js"), "utf8");

  await check("preview toggle defaults on and is not the batch export checkbox", () => {
    const previewTag = html.match(/<input id="previewHits"[^>]*>/);
    const editorTag = html.match(/<input id="editorPreviewHits"[^>]*>/);
    const batchTag = html.match(/<input id="batchHits"[^>]*>/);
    assert.ok(previewTag && editorTag && batchTag);
    assert.ok(previewTag[0].includes("checked"), previewTag[0]);
    assert.ok(editorTag[0].includes("checked"), editorTag[0]);
    assert.ok(!batchTag[0].includes("checked"), batchTag[0]);
    assert.ok(html.includes("叠打点声（合成 don/ka，不是原曲）"));
    assert.ok(playerSrc.includes("assets/sounds/"));
    assert.ok(!playerSrc.includes("batchHits"));
    assert.ok(!engine.includes("batchHits"));
    const seekFn = engine.slice(engine.indexOf("function seek("), engine.indexOf("function setData"));
    const renderFn = engine.slice(engine.indexOf("function renderAt("), engine.indexOf("function signalBachiDone"));
    const tickFn = engine.slice(engine.indexOf("function tick("), engine.indexOf("function renderAt("));
    assert.ok(!seekFn.includes(".advance("), seekFn);
    assert.ok(seekFn.includes("cancelPending"));
    assert.ok(!renderFn.includes(".advance("), renderFn);
    assert.ok(renderFn.includes("cancelPending"));
    assert.ok(tickFn.includes("previewHitPlayer.advance"));
    assert.ok(tickFn.includes("maxStep: realDt * state.rate"));
    assert.ok(tickFn.includes("state.playing"));
  });

  await runPage();

  console.log("preview-hits tests: " + passed);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

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

function installHitLog() {
  window.__hitLog = [];
  document.addEventListener("bachimotion:preview-hit", (event) => {
    const detail = event.detail || {};
    window.__hitLog.push({
      t: detail.t,
      face: detail.face,
      gain: detail.gain,
      big: detail.big,
      now: detail.now,
    });
  });
}

async function runPage() {
  const puppeteer = loadPuppeteer();
  const chrome = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/local/bin/google-chrome";
  const { server, port } = await startStaticServer(ROOT);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chrome,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    await check("playback schedules the bundled hit when the playhead crosses it", async () => {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(installHitLog);
      await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "networkidle0", timeout: 30000 });
      await page.waitForFunction(() => window.PreviewHits && window.PreviewHits.player && window.startEngine, { timeout: 15000 });
      const setup = await page.evaluate(() => {
        const previewBox = document.getElementById("previewHits");
        const editorBox = document.getElementById("editorPreviewHits");
        const batchBox = document.getElementById("batchHits");
        window.startEngine({
          events: [
            { t: 1, hand: "R", face: "don", big: false },
            { t: 1, hand: "L", face: "don", big: false },
            { t: 1.5, hand: "R", face: "ka", big: true },
            { t: 4, hand: "R", face: "don", big: false },
          ],
          offset: -1,
          rangeStart: 0,
          rangeEnd: 5,
        }, { mode: "test" });
        window.taikoAnim.state.loop = false;
        return {
          previewOn: previewBox.checked,
          editorOn: editorBox.checked,
          batchOn: batchBox.checked,
          previewLabel: previewBox.parentElement.textContent.replace(/\s+/g, ""),
          batchLabel: batchBox.parentElement.textContent.replace(/\s+/g, ""),
          sameNode: previewBox === batchBox,
        };
      });
      assert.strictEqual(setup.previewOn, true);
      assert.strictEqual(setup.editorOn, true);
      assert.strictEqual(setup.batchOn, false);
      assert.strictEqual(setup.sameNode, false);
      assert.ok(setup.previewLabel.includes("叠打点声（合成don/ka，不是原曲）"), setup.previewLabel);
      assert.ok(setup.batchLabel.includes("叠打点声（合成don/ka，不是原曲）"), setup.batchLabel);

      const ready = await page.evaluate(() => window.PreviewHits.player.buffersReady())
        || await page.waitForFunction(() => window.PreviewHits.player.buffersReady(), { timeout: 4000 }).then(() => true);
      assert.strictEqual(ready, true, "don.wav / ka.wav did not decode");
      const sounds = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => /\/don\.wav|\/ka\.wav/.test(name)));
      assert.ok(sounds.some((name) => name.endsWith("/assets/sounds/don.wav")), JSON.stringify(sounds));
      assert.ok(sounds.some((name) => name.endsWith("/assets/sounds/ka.wav")), JSON.stringify(sounds));

      const playsBefore = await page.evaluate(() => window.PreviewHits.player.playCount());
      await page.evaluate(() => {
        const state = window.taikoAnim.state;
        state.rate = 1;
        state.loop = false;
        state.now = 0.97;
        window.__hitLog = [];
        window.taikoAnim.setPlaying(true);
      });
      await page.waitForFunction(() => {
        const hit = (window.__hitLog || []).find((item) => item.face === "don" && item.t === 1 && item.now + 1e-6 >= item.t);
        if (!hit) return false;
        window.__firstHit = hit;
        window.__firstLive = window.taikoAnim.state.now;
        window.taikoAnim.setPlaying(false);
        return true;
      }, { timeout: 2000 });
      const first = await page.evaluate(() => ({
        hit: window.__firstHit,
        dons: window.__hitLog.filter((item) => item.t === 1 && item.face === "don"),
        kas: window.__hitLog.filter((item) => item.face === "ka"),
        plays: window.PreviewHits.player.playCount(),
        now: window.__firstLive,
        playing: window.taikoAnim.state.playing,
      }));
      assert.strictEqual(first.dons.length, 1);
      assert.strictEqual(first.hit.gain, 1);
      assert.strictEqual(first.hit.big, false);
      reached(first.hit.now, first.hit.t);
      reached(first.now, first.hit.t);
      assert.deepStrictEqual(first.kas, []);
      assert.strictEqual(first.playing, false);
      assert.ok(first.plays === playsBefore + 1, "expected one BufferSource, got " + first.plays + " from " + playsBefore);

      const seeked = await page.evaluate(() => {
        const before = window.__hitLog.length;
        window.taikoAnim.state.now = 1.2;
        window.taikoAnim.state.playing = true;
        window.taikoAnim.seek(3.7);
        window.taikoAnim.setPlaying(false);
        window.taikoAnim.renderAt(4.2);
        return {
          added: window.__hitLog.slice(before),
          now: window.taikoAnim.state.now,
          playing: window.taikoAnim.state.playing,
        };
      });
      assert.deepStrictEqual(seeked.added, []);
      assert.ok(seeked.now >= 4);
      assert.strictEqual(seeked.playing, false);

      const big = await page.evaluate(() => {
        const beforePlays = window.PreviewHits.player.playCount();
        window.__hitLog = [];
        window.taikoAnim.state.rate = 1;
        window.taikoAnim.state.now = 1.45;
        window.taikoAnim.setPlaying(true);
        return beforePlays;
      });
      await page.waitForFunction((boost) => {
        const hit = (window.__hitLog || []).find((item) => {
          return item.face === "ka" && item.t === 1.5 && item.big === true && item.gain === boost && item.now + 1e-6 >= item.t;
        });
        if (!hit) return false;
        window.__bigHit = hit;
        window.__bigLive = window.taikoAnim.state.now;
        window.taikoAnim.setPlaying(false);
        return true;
      }, { timeout: 2000 }, preview.BIG_BOOST);
      const bigHit = await page.evaluate((beforePlays) => ({
        hit: window.__bigHit,
        live: window.__bigLive,
        count: window.__hitLog.filter((item) => item.t === 1.5).length,
        plays: window.PreviewHits.player.playCount(),
        beforePlays: beforePlays,
        boost: window.PreviewHits.BIG_BOOST,
      }), big);
      assert.strictEqual(bigHit.count, 1);
      assert.strictEqual(bigHit.hit.t, 1.5);
      assert.strictEqual(bigHit.hit.big, true);
      assert.strictEqual(bigHit.hit.gain, preview.BIG_BOOST);
      assert.strictEqual(bigHit.boost, preview.BIG_BOOST);
      reached(bigHit.hit.now, bigHit.hit.t);
      reached(bigHit.live, bigHit.hit.t);
      assert.strictEqual(bigHit.plays, bigHit.beforePlays + 1);

      const muted = await page.evaluate(() => {
        const previewBox = document.getElementById("previewHits");
        const editorBox = document.getElementById("editorPreviewHits");
        const batchBox = document.getElementById("batchHits");
        previewBox.checked = false;
        previewBox.dispatchEvent(new Event("change"));
        const syncedOff = !editorBox.checked && !previewBox.checked && !batchBox.checked;
        batchBox.checked = true;
        batchBox.dispatchEvent(new Event("change"));
        const batchDidNotEnablePreview = previewBox.checked === false;
        window.__hitLog = [];
        window.taikoAnim.state.rate = 1;
        window.taikoAnim.state.now = 3.9;
        window.taikoAnim.setPlaying(true);
        return { syncedOff: syncedOff, batchDidNotEnablePreview: batchDidNotEnablePreview, batchOn: batchBox.checked };
      });
      await page.waitForFunction(() => window.taikoAnim.state.now > 4.05, { timeout: 2000 });
      const mutedResult = await page.evaluate(() => {
        window.taikoAnim.setPlaying(false);
        return {
          log: window.__hitLog.slice(),
          now: window.taikoAnim.state.now,
        };
      });
      assert.strictEqual(muted.syncedOff, true);
      assert.strictEqual(muted.batchDidNotEnablePreview, true);
      assert.strictEqual(muted.batchOn, true);
      assert.ok(mutedResult.now > 4, "muted playback did not reach the note, now=" + mutedResult.now);
      assert.deepStrictEqual(mutedResult.log, []);

      const slow = await page.evaluate(() => {
        const editorBox = document.getElementById("editorPreviewHits");
        const previewBox = document.getElementById("previewHits");
        const batchBox = document.getElementById("batchHits");
        editorBox.checked = true;
        editorBox.dispatchEvent(new Event("change"));
        window.__hitLog = [];
        window.taikoAnim.setRate(0.25);
        window.taikoAnim.state.loop = false;
        window.taikoAnim.state.now = 3.94;
        window.taikoAnim.setPlaying(true);
        return {
          previewOn: previewBox.checked,
          editorOn: editorBox.checked,
          batchOn: batchBox.checked,
          rate: window.taikoAnim.state.rate,
        };
      });
      assert.strictEqual(slow.previewOn, true);
      assert.strictEqual(slow.editorOn, true);
      assert.strictEqual(slow.batchOn, true);
      assert.strictEqual(slow.rate, 0.25);
      await page.waitForFunction(() => {
        const hit = (window.__hitLog || []).find((item) => item.t === 4 && item.now + 1e-6 >= item.t);
        if (!hit) return false;
        window.__slowHit = hit;
        window.taikoAnim.setPlaying(false);
        return true;
      }, { timeout: 2500 });
      const slowHit = await page.evaluate(() => window.__slowHit);
      assert.strictEqual(slowHit.t, 4);
      assert.strictEqual(slowHit.face, "don");
      assert.strictEqual(slowHit.gain, 1);
      reached(slowHit.now, slowHit.t);
      assert.ok(slowHit.now < slowHit.t + 0.25, "slow-mo jumped too far: " + slowHit.now);
      await page.close();
    });

    await check("export capture stays silent while the preview toggle stays available", async () => {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(installHitLog);
      await page.goto("http://127.0.0.1:" + port + "/index.html?export=1&rate=0.3", {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
      await page.waitForFunction(() => window.PreviewHits && window.startEngine && window.renderAt, { timeout: 15000 });
      await page.evaluate(() => {
        window.startEngine({
          events: [
            { t: 0.2, hand: "R", face: "don", big: true },
            { t: 0.2, hand: "L", face: "don", big: true },
            { t: 0.8, hand: "R", face: "ka", big: false },
          ],
          rangeStart: 0,
          rangeEnd: 2,
        }, { mode: "export" });
        window.taikoAnim.state.loop = false;
        window.taikoAnim.state.rate = 1;
        window.taikoAnim.state.now = 0.1;
        window.taikoAnim.setPlaying(true);
      });
      await page.waitForFunction(() => window.taikoAnim.state.now > 0.35, { timeout: 2000 });
      const during = await page.evaluate(() => ({
        log: window.__hitLog.slice(),
        playing: window.taikoAnim.state.playing,
        usingAudio: window.PreviewHits.player.usingAudio(),
        sounds: performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => /don\.wav|ka\.wav/.test(name)),
      }));
      assert.strictEqual(during.playing, true);
      assert.deepStrictEqual(during.log, []);
      assert.strictEqual(during.usingAudio, false);
      assert.deepStrictEqual(during.sounds, []);
      await page.evaluate(() => {
        window.renderAt(0.15);
        window.renderAt(0.5);
        window.renderAt(1.2);
      });
      const result = await page.evaluate(() => ({
        log: window.__hitLog.slice(),
        exporting: document.body.classList.contains("export"),
        usingAudio: window.PreviewHits.player.usingAudio(),
        enabled: window.PreviewHits.player.isEnabled(),
        previewOn: document.getElementById("previewHits").checked,
        batchOn: document.getElementById("batchHits").checked,
        sounds: performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => /don\.wav|ka\.wav/.test(name)),
        playing: window.taikoAnim.state.playing,
        now: window.taikoAnim.state.now,
      }));
      assert.strictEqual(result.exporting, true);
      assert.deepStrictEqual(result.log, []);
      assert.strictEqual(result.usingAudio, false);
      assert.deepStrictEqual(result.sounds, []);
      assert.strictEqual(result.previewOn, true);
      assert.strictEqual(result.enabled, true);
      assert.strictEqual(result.batchOn, false);
      assert.strictEqual(result.playing, false);
      assert.ok(result.now >= 1.2);
      await page.close();
    });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
