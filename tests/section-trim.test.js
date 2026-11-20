/**
 * Apple-style section trim on the existing progress-bar range.
 * Homemade charts only. Preview and export use one window:
 *   full song → today's lead-in (0.7) and tail (0.5)
 *   trimmed   → earlier of the left handle and (first note in range − 0.7);
 *               end is the right handle
 * Note times are already OFFSET-adjusted. Loop wrap returns to the left
 * handle and does not add another 0.7s.
 *
 *   node tests/section-trim.test.js
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const http = require("http");

const parser = require(path.join(__dirname, "..", "js", "parser.js"));
const LoopRange = require(path.join(__dirname, "..", "js", "loop-range.js"));
const audio = require(path.join(__dirname, "..", "js", "audio-mux.js"));
const jobs = require(path.join(__dirname, "..", "js", "render-jobs.js"));
const ui = require(path.join(__dirname, "..", "js", "batch-ui.js"));

const ROOT = path.join(__dirname, "..");
const INDEX = path.join(ROOT, "index.html");

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
  assert.ok(Math.abs(a - b) <= (eps == null ? 1e-6 : eps), "expected " + a + " ≈ " + b + " (Δ " + (a - b) + ")");
}

function tja(body, offset) {
  return [
    "TITLE:section-trim",
    "BPM:120",
    "OFFSET:" + (offset == null ? 0 : offset),
    "#START",
    body,
    "#END",
    "",
  ].join("\n");
}

function parse(body, offset, opts) {
  return parser.eventsFromTja(tja(body, offset), opts || {});
}

function songOf(data) {
  return {
    start: data.rangeStart - audio.LEAD_IN,
    end: data.rangeEnd + audio.TAIL_TIME,
  };
}

const FOUR = "1111,\n1111,\n1111,\n1111,";

(async function main() {
  await check("a full-song range keeps today's lead-in and tail, including a leading rest", () => {
    const data = parse("0001,\n1111,");
    const song = songOf(data);
    const win = audio.exportWindow(data);
    nearly(data.events[0].t, 1.5);
    nearly(song.start, data.rangeStart - 0.7);
    nearly(song.start, -0.7);
    assert.ok(song.start < data.events[0].t - 0.7, "the intro rest stays in front of the first hit");
    const clip = LoopRange.sectionClip({
      events: data.events,
      songStart: song.start,
      songEnd: song.end,
      selStart: song.start,
      selEnd: song.end,
      leadIn: 0.7,
    });
    nearly(clip.start, win.chartStart);
    nearly(clip.end, win.chartEnd);
    nearly(clip.start, song.start);
    nearly(clip.end, song.end);
    assert.strictEqual(clip.trimmed, false);
    const media = LoopRange.mediaWindow(data);
    nearly(media.chartStart, win.chartStart);
    nearly(media.chartEnd, win.chartEnd);
    assert.strictEqual(media.trimmed, false);
  });

  await check("dragging both handles trims preview to the first selected note minus 0.7", () => {
    const data = parse(FOUR);
    const song = songOf(data);
    const grid = LoopRange.buildSnapGrid(data, song.start, song.end);
    const full = LoopRange.defaultLoopRange(song.start, song.end);
    const dragged = LoopRange.dragLoopHandle(
      LoopRange.dragLoopHandle(full, "start", 2.1, grid),
      "end",
      5.9,
      grid
    );
    nearly(dragged.start, 2);
    nearly(dragged.end, 6);
    const before = JSON.stringify({
      rangeStart: data.rangeStart,
      rangeEnd: data.rangeEnd,
      times: data.events.map((e) => e.t),
    });
    const clip = LoopRange.sectionClip({
      events: data.events,
      songStart: song.start,
      songEnd: song.end,
      selStart: dragged.start,
      selEnd: dragged.end,
      leadIn: 0.7,
    });
    const after = JSON.stringify({
      rangeStart: data.rangeStart,
      rangeEnd: data.rangeEnd,
      times: data.events.map((e) => e.t),
    });
    assert.strictEqual(after, before);
    nearly(clip.firstNote, 2);
    nearly(clip.start, 1.3);
    nearly(clip.end, 6);
    nearly(clip.loopStart, 2);
    nearly(clip.loopEnd, 6);
    assert.strictEqual(clip.trimmed, true);
    assert.ok(clip.start < dragged.start, "the prep sits before the left handle");
    assert.ok(clip.start > song.start);
    assert.ok(clip.end < song.end);
  });

  await check("only the right handle moves: the existing intro stays, the end is the handle", () => {
    const data = parse("0001,\n1111,");
    const song = songOf(data);
    const clip = LoopRange.sectionClip({
      events: data.events,
      songStart: song.start,
      songEnd: song.end,
      selStart: song.start,
      selEnd: 2,
      leadIn: 0.7,
    });
    nearly(clip.start, song.start);
    nearly(clip.end, 2);
    nearly(clip.firstNote, 1.5);
    assert.strictEqual(clip.trimmed, true);
    assert.ok(Math.abs(clip.start - (1.5 - 0.7)) > 0.5, "a handle left at the song start does not jump forward");
  });

  await check("notes outside the handles are not the first note, and a note on the handle counts", () => {
    const clip = LoopRange.sectionClip({
      events: [{ t: 1.9 }, { t: 2 }, { t: 6 }, { t: 6.2 }],
      songStart: -0.7,
      songEnd: 8.5,
      selStart: 2,
      selEnd: 6,
      leadIn: 0.7,
    });
    nearly(clip.firstNote, 2);
    nearly(clip.start, 1.3);
    nearly(clip.end, 6);
  });

  await check("OFFSET is not subtracted again; a negative prep pads silence", () => {
    const data = parse("1111,\n1111,", 0.5);
    assert.strictEqual(data.offset, 0.5);
    nearly(data.events[0].t, -0.5);
    const noteAtZero = data.events.find((e) => Math.abs(e.t - 0) < 1e-6);
    assert.ok(noteAtZero, "expected a hit at audio time 0");
    const song = songOf(data);
    const clip = LoopRange.sectionClip({
      events: data.events,
      songStart: song.start,
      songEnd: song.end,
      selStart: 0,
      selEnd: 2,
      leadIn: 0.7,
    });
    nearly(clip.firstNote, 0);
    nearly(clip.start, -0.7);
    const doubled = clip.firstNote - data.offset - 0.7;
    assert.ok(Math.abs(clip.start - doubled) > 0.4);
    const plan = audio.originalAudioPlan({
      chartStart: clip.start,
      chartEnd: clip.end,
      rate: 1,
      hasSong: true,
      includeHits: false,
      timeShift: data.timeShift || 0,
      offset: data.offset,
    });
    nearly(plan.audioOrigin, -0.7);
    nearly(plan.seekSec, 0);
    nearly(plan.delaySec, 0.7);
    const filter = audio.songAudioFilter(plan);
    assert.ok(filter.includes("adelay=700"), filter);
    assert.ok(!filter.includes("adelay=500"), filter);
    assert.ok(!filter.includes("atrim=start=0.5"), filter);
    const ignored = audio.originalAudioPlan({
      chartStart: clip.start,
      chartEnd: clip.end,
      rate: 1,
      hasSong: true,
      timeShift: 0,
    });
    assert.deepStrictEqual(plan, ignored);
  });

  await check("a later selection on an already-shifted chart seeks firstNote − 0.7, not OFFSET", () => {
    const data = parse(FOUR, -2);
    assert.strictEqual(data.offset, -2);
    nearly(data.events[0].t, 2);
    const song = songOf(data);
    nearly(song.start, 1.3);
    const clip = LoopRange.sectionClip({
      events: data.events,
      songStart: song.start,
      songEnd: song.end,
      selStart: 4,
      selEnd: 6,
      leadIn: 0.7,
    });
    nearly(clip.firstNote, 4);
    nearly(clip.start, 3.3);
    assert.ok(Math.abs(clip.start - (4 - data.offset - 0.7)) > 1);
    assert.ok(Math.abs(clip.start - (4 + data.offset - 0.7)) > 1);
    const withSong = audio.originalAudioPlan({
      chartStart: clip.start,
      chartEnd: clip.end,
      rate: 1,
      hasSong: true,
      offset: data.offset,
      timeShift: 0,
    });
    nearly(withSong.seekSec, 3.3);
    nearly(withSong.delaySec, 0);
    const bare = audio.originalAudioPlan({
      chartStart: clip.start,
      chartEnd: clip.end,
      rate: 1,
      hasSong: false,
      includeHits: true,
      offset: data.offset,
    });
    assert.strictEqual(bare.includeOriginal, false);
    assert.strictEqual(bare.includeHits, true);
  });

  await check("measure crop plus a section aligns the song with timeShift, once", () => {
    const data = parse(FOUR, 0, { measures: "3-4" });
    nearly(data.timeShift, 4);
    nearly(data.events[0].t, 0);
    const song = songOf(data);
    const clip = LoopRange.sectionClip({
      events: data.events,
      songStart: song.start,
      songEnd: song.end,
      selStart: 2,
      selEnd: 4,
      leadIn: 0.7,
    });
    nearly(clip.firstNote, 2);
    nearly(clip.start, 1.3);
    nearly(clip.end, 4);
    const plan = audio.originalAudioPlan({
      chartStart: clip.start,
      chartEnd: clip.end,
      rate: 1,
      hasSong: true,
      timeShift: data.timeShift,
      offset: data.offset,
    });
    nearly(plan.audioOrigin, 5.3);
    nearly(plan.seekSec, 5.3);
    nearly(plan.delaySec, 0);
  });

  await check("loop wrap returns to the left handle and does not replay the 0.7s prep", () => {
    const opts = {
      rate: 1,
      loop: true,
      loopStart: 2,
      loopEnd: 6,
      songStart: -0.7,
      songEnd: 8.5,
      clipStart: 1.3,
      clipEnd: 6,
    };
    const prep = LoopRange.advancePlayback(1.3, 0.1, opts);
    nearly(prep.now, 1.4);
    assert.strictEqual(prep.playing, true);
    assert.ok(prep.now < opts.loopStart, "the opening prep is allowed to play");
    const wrap = LoopRange.advancePlayback(5.95, 0.2, opts);
    nearly(wrap.now, 2.15);
    assert.ok(Math.abs(wrap.now - 1.3) > 0.5, "wrap must not land on the prep");
    assert.ok(wrap.now >= opts.loopStart - 1e-9 && wrap.now <= opts.loopEnd + 1e-9);
    const stopped = LoopRange.advancePlayback(5.9, 0.3, Object.assign({}, opts, { loop: false }));
    nearly(stopped.now, 6);
    assert.strictEqual(stopped.playing, false);
    assert.strictEqual(stopped.done, true);
    const outside = LoopRange.advancePlayback(0, 0.05, Object.assign({}, opts, { loop: false }));
    nearly(outside.now, 1.3);
    nearly(LoopRange.restartTime({
      loop: false, songStart: -0.7, loopStart: 2, clipStart: 1.3,
    }), 1.3);
    nearly(LoopRange.restartTime({
      loop: true, songStart: -0.7, loopStart: 2, clipStart: 1.3,
    }), 2);
    nearly(LoopRange.restartTime({
      loop: false, songStart: -0.7, loopStart: -0.7, clipStart: -0.7,
    }), -0.7);
    nearly(LoopRange.restartTime({
      loop: true, songStart: -0.7, loopStart: -0.7, clipStart: -0.7,
    }), -0.7);
  });

  await check("single export and a batch job use the section; siblings stay full-song", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-section-"));
    const tjaPath = path.join(dir, "four.tja");
    const quietPath = path.join(dir, "quiet.tja");
    fs.writeFileSync(tjaPath, tja(FOUR, -2));
    fs.writeFileSync(quietPath, tja("1,", 0));
    const args = jobs.parseArgs([
      "--tja", tjaPath,
      "--section", "4,6",
      "--song", path.join(dir, "tone.wav"),
      "--out", path.join(dir, "out.mp4"),
    ]);
    nearly(args.sectionStart, 4);
    nearly(args.sectionEnd, 6);
    const trimmed = jobs.planForJob({
      tja: tjaPath,
      song: path.join(dir, "tone.wav"),
      sectionStart: args.sectionStart,
      sectionEnd: args.sectionEnd,
      rate: 1,
      audio: false,
    });
    nearly(trimmed.chartStart, 3.3);
    nearly(trimmed.chartEnd, 6);
    assert.strictEqual(trimmed.includeOriginal, true);
    nearly(trimmed.audioOrigin, 3.3);
    nearly(trimmed.seekSec, 3.3);
    const whole = jobs.planForJob({ tja: tjaPath, song: null, rate: 1, audio: true });
    const parsed = parse(FOUR, -2);
    nearly(whole.chartStart, audio.exportWindow(parsed).chartStart);
    nearly(whole.chartEnd, audio.exportWindow(parsed).chartEnd);
    assert.strictEqual(whole.includeOriginal, false);
    assert.strictEqual(whole.includeHits, true);

    const queue = path.join(dir, "queue.json");
    fs.writeFileSync(queue, JSON.stringify({
      sectionStart: 4,
      sectionEnd: 6,
      jobs: [
        { tja: "four.tja", song: "tone.wav", out: "a.mp4", sectionStart: 4, sectionEnd: 6 },
        { tja: "quiet.tja", out: "b.mp4" },
      ],
    }));
    fs.writeFileSync(path.join(dir, "tone.wav"), "RIFF");
    const loaded = jobs.loadBatchFile(queue);
    assert.strictEqual(loaded.length, 2);
    nearly(loaded[0].sectionStart, 4);
    nearly(loaded[0].sectionEnd, 6);
    assert.strictEqual(loaded[1].sectionStart, null);
    assert.strictEqual(loaded[1].sectionEnd, null);
    const plans = loaded.map((job) => jobs.planForJob(job));
    nearly(plans[0].chartStart, 3.3);
    assert.strictEqual(plans[0].includeOriginal, true);
    nearly(plans[1].chartStart, audio.exportWindow(parse("1,", 0)).chartStart);
    assert.strictEqual(plans[1].includeOriginal, false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await check("a web job keeps a per-row section and still omits a song that was not uploaded", () => {
    const bare = ui.serializeJob({
      id: "1",
      name: "only.tja",
      tjaText: tja("1,", 0),
      songBase64: null,
      hits: false,
    });
    assert.strictEqual(bare.songBase64, null);
    assert.strictEqual(bare.sectionStart, null);
    assert.strictEqual(bare.sectionEnd, null);
    const trimmed = ui.serializeJob({
      id: "2",
      name: "cut.tja",
      tjaText: tja(FOUR, 0),
      songBase64: "aGk=",
      songName: "home.wav",
      hits: false,
      sectionStart: 2,
      sectionEnd: 6,
    });
    assert.strictEqual(trimmed.songBase64, "aGk=");
    nearly(trimmed.sectionStart, 2);
    nearly(trimmed.sectionEnd, 6);
  });

  await check("the page still has one pair of caps and no second trim chrome", () => {
    const html = fs.readFileSync(INDEX, "utf8");
    const caps = html.match(/class="loop-cap"/g) || [];
    assert.strictEqual(caps.length, 2);
    assert.ok(html.includes('id="loopCapStart"') && html.includes('id="loopCapEnd"'));
    assert.ok(!html.includes('id="trimBar"') && !html.includes('id="trimCap"'));
    assert.ok(!/trim-cap|apple-trim|#ffd60a|#ffe14a/i.test(html));
    const engine = fs.readFileSync(path.join(ROOT, "js", "engine.js"), "utf8");
    assert.ok(engine.includes("clipStart: clip.start"));
    assert.ok(engine.includes("clipEnd: clip.end"));
    const render = fs.readFileSync(path.join(ROOT, "render.js"), "utf8");
    assert.ok(render.includes("sectionStart: args.sectionStart"));
    assert.ok(render.includes("sectionEnd: args.sectionEnd"));
  });

  await check("the open page exports only the section, and the bar stays the full song", async () => {
    const puppeteer = require("puppeteer-core");
    const chrome = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
    assert.ok(chrome, "CHROME_PATH is required");
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let rel = decodeURIComponent(url.pathname);
      if (rel === "/") rel = "/index.html";
      const file = path.normalize(path.join(ROOT, rel));
      if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
        res.writeHead(403); res.end("forbidden"); return;
      }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        const ext = path.extname(file).toLowerCase();
        const type = ext === ".html" ? "text/html; charset=utf-8"
          : ext === ".js" ? "text/javascript; charset=utf-8"
          : ext === ".css" ? "text/css; charset=utf-8"
          : "application/octet-stream";
        res.writeHead(200, { "Content-Type": type });
        res.end(buf);
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chrome,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    try {
      const page = await browser.newPage();
      await page.goto("http://127.0.0.1:" + port + "/index.html?export=1", {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
      await page.waitForFunction(
        () => typeof window.startEngine === "function" && typeof window.chartStart === "number",
        { timeout: 15000 }
      );
      const payload = parse(FOUR, 0);
      payload.sectionStart = 2;
      payload.sectionEnd = 6;
      const timing = await page.evaluate((data) => {
        window.startEngine(data);
        const st = window.taikoAnim.state;
        return {
          chartStart: window.chartStart,
          chartEnd: window.chartDuration,
          barStart: st.start,
          barEnd: st.end,
          fullStart: st.fullStart,
          loopStart: st.loopStart,
          loopEnd: st.loopEnd,
          caps: document.querySelectorAll(".loop-cap").length,
        };
      }, payload);
      nearly(timing.chartStart, 1.3);
      nearly(timing.chartEnd, 6);
      nearly(timing.barStart, -0.7);
      nearly(timing.fullStart, -0.7);
      assert.ok(timing.barEnd > 6, "the progress bar still covers the rest of the song");
      nearly(timing.loopStart, 2);
      nearly(timing.loopEnd, 6);
      assert.strictEqual(timing.caps, 2);

      const live = await page.evaluate(() => {
        const plain = window.taikoAnim.state;
        window.startEngine({
          events: plain.events,
          measures: plain.measures,
          bpmTimeline: plain.bpmTimeline,
          rangeStart: plain.fullStart + 0.7,
          rangeEnd: plain.fullEnd - 0.5,
        });
        const st = window.taikoAnim.state;
        st.loopStart = 2;
        st.loopEnd = 6;
        const clip = window.taikoAnim.previewClip();
        return {
          chartStart: window.chartStart,
          chartEnd: window.chartDuration,
          barStart: st.start,
          clipStart: clip.start,
          clipEnd: clip.end,
          loopStart: clip.loopStart,
          section: window.taikoAnim.exportSection(),
        };
      });
      nearly(live.barStart, -0.7);
      nearly(live.chartStart, 1.3);
      nearly(live.chartEnd, 6);
      nearly(live.clipStart, 1.3);
      nearly(live.clipEnd, 6);
      nearly(live.loopStart, 2);
      nearly(live.section.sectionStart, 2);
      nearly(live.section.sectionEnd, 6);
    } finally {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  console.log(passed + " section-trim tests passed.");
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
