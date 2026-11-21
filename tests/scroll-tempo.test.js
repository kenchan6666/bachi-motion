/**
 * 变速开关在慢放和流速上面；流速要能取 1.1、1.2。
 * 打开变速：跟本家。每颗音用自己命中时刻的 BPM 和 #SCROLL 匀速移动，
 *   像素/秒 = 基准 × (该音 BPM / 谱面开头 BPM) × 该音 SCROLL × 流速。
 *   所以 BPM×SCROLL 相同就一样快：150×2、75×4 和 300×1 同速，150×1 是一半。
 *   #MEASURE 只决定一小节有几拍，不另改像素/秒。
 * 关掉变速：等速。忽略 #SCROLL，BPM 也不改像素/秒。击打时刻仍跟 BPM。
 * 开头 BPM、SCROLL 为 1 时，打开和关掉一样快。
 *
 *   node tests/scroll-tempo.test.js
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));
const INDEX = path.join(ROOT, "index.html");
const parser = require(path.join(ROOT, "js", "parser.js"));

const JUDGE_X = 92;
const BASE_PX = 600;

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

function tja(body, headerBpm) {
  return "TITLE:tempo-test\nBPM:" + (headerBpm == null ? "120" : headerBpm) + "\nOFFSET:0\n#START\n" + body + "\n#END\n";
}

function parse(body, headerBpm) {
  return parser.eventsFromTja(tja(body, headerBpm));
}

function transportHtml() {
  const html = fs.readFileSync(INDEX, "utf8");
  const transport = html.split('class="transport"')[1].split('class="legend"')[0];
  return { html, transport };
}

function inputTag(html, id) {
  const needle = 'id="' + id + '"';
  const at = html.indexOf(needle);
  if (at < 0) return "";
  const start = html.lastIndexOf("<input", at);
  const end = html.indexOf(">", at);
  if (start < 0 || end < 0) return "";
  return html.slice(start, end + 1);
}

function attr(tag, name) {
  const m = tag.match(new RegExp("\\b" + name + '="([^"]*)"'));
  return m ? m[1] : null;
}

/** min + n*step 能否正好落到 target。step=0.5 时 1.1 / 1.2 到不了。 */
function reaches(min, max, step, target) {
  if (!(step > 0)) return false;
  if (target < min - 1e-9 || target > max + 1e-9) return false;
  const n = Math.round((target - min) / step);
  return Math.abs(min + n * step - target) < 1e-6;
}

function loadScrollTempo() {
  return require(path.join(ROOT, "js", "scroll-tempo.js"));
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".tja": "text/plain; charset=utf-8",
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

(async function main() {
  await check("变速勾选在慢放和流速上面，流速滑条能取 1.1 和 1.2", () => {
    const { html, transport } = transportHtml();
    const problems = [];
    const tempoAt = transport.indexOf('id="showTempo"');
    const ratesAt = transport.indexOf('class="rates"');
    const scrollAt = transport.indexOf('id="scroll"');
    const slowAt = transport.indexOf("慢放");
    if (tempoAt < 0) problems.push("没有变速勾选框");
    if (!(tempoAt >= 0 && ratesAt > tempoAt && scrollAt > tempoAt && slowAt > tempoAt)) {
      problems.push("变速勾选框不在慢放和流速上面");
    }
    const tempoTag = inputTag(transport, "showTempo");
    if (!/type="checkbox"/.test(tempoTag)) problems.push("变速不是勾选框");
    if (/\bdisabled\b/.test(tempoTag)) problems.push("变速勾选框不能点");
    if (!/\bchecked\b/.test(tempoTag)) problems.push("变速默认应该打开");
    const around = tempoAt >= 0 ? transport.slice(Math.max(0, tempoAt - 80), tempoAt + 160) : "";
    if (!around.includes("变速")) problems.push("勾选框旁边没有「变速」");
    const scrollTag = inputTag(transport, "scroll");
    const min = +attr(scrollTag, "min");
    const max = +attr(scrollTag, "max");
    const step = +attr(scrollTag, "step");
    if (!reaches(min, max, step, 1.1)) problems.push("流速取不到 1.1（step=" + attr(scrollTag, "step") + "）");
    if (!reaches(min, max, step, 1.2)) problems.push("流速取不到 1.2（step=" + attr(scrollTag, "step") + "）");
    const scripts = Array.from(html.matchAll(/<script src="([^"]+)"/g)).map((m) => m[1]);
    const tempoJs = scripts.indexOf("js/scroll-tempo.js");
    const engineJs = scripts.indexOf("js/engine.js");
    if (!(tempoJs >= 0 && engineJs > tempoJs)) problems.push("页面没有在引擎前加载 scroll-tempo.js");
    assert.deepStrictEqual(problems, []);
  });

  await check("流速控件把 1.1 和 1.2 记成一位小数，并显示 1.1× / 1.2×", () => {
    const ScrollTempo = loadScrollTempo();
    assert.strictEqual(ScrollTempo.scrollFromControl("1.1"), 1.1);
    assert.strictEqual(ScrollTempo.scrollFromControl("1.2"), 1.2);
    assert.strictEqual(ScrollTempo.scrollFromControl(1.1000000000000001), 1.1);
    assert.strictEqual(ScrollTempo.scrollFromControl(1.1999999999999997), 1.2);
    assert.strictEqual(ScrollTempo.formatScroll(1), "1×");
    assert.strictEqual(ScrollTempo.formatScroll(1.1), "1.1×");
    assert.strictEqual(ScrollTempo.formatScroll(1.2), "1.2×");
    assert.strictEqual(ScrollTempo.formatScroll(1.5), "1.5×");
    assert.strictEqual(ScrollTempo.formatScroll(2), "2×");
    assert.strictEqual(ScrollTempo.reachesScroll(1, 4, 0.1, 1.1), true);
    assert.strictEqual(ScrollTempo.reachesScroll(1, 4, 0.1, 1.2), true);
    assert.strictEqual(ScrollTempo.reachesScroll(1, 4, 0.5, 1.1), false);
    assert.strictEqual(ScrollTempo.reachesScroll(1, 4, 0.5, 1.2), false);
  });

  await check("#SCROLL 记在音符上，不改变 #BPMCHANGE 的击打时刻", () => {
    const plain = parse("11\n#BPMCHANGE 60\n11,", 120);
    const scrolled = parse("11\n#BPMCHANGE 60\n#SCROLL 3\n11,", 120);
    assert.deepStrictEqual(scrolled.events.map((e) => e.t), plain.events.map((e) => e.t));
    nearly(scrolled.events[0].t, 0);
    nearly(scrolled.events[1].t, 0.5);
    nearly(scrolled.events[2].t, 1);
    nearly(scrolled.events[3].t, 2);
    assert.deepStrictEqual(scrolled.events.map((e) => e.scroll), [1, 1, 3, 3]);
    assert.deepStrictEqual(scrolled.events.map((e) => e.bpm), [120, 120, 60, 60]);

    const mid = parse("#SCROLL 1\n1\n#SCROLL 4\n1\n#SCROLL 0.25\n00,", 120);
    assert.deepStrictEqual(mid.events.map((e) => e.t), [0, 0.5]);
    assert.deepStrictEqual(mid.events.map((e) => e.scroll), [1, 4]);

    const head = parser.eventsFromTja(
      "TITLE:tempo-test\nBPM:120\nOFFSET:0\nHEADSCROLL:2\n#START\n11,\n#END\n"
    );
    assert.deepStrictEqual(head.events.map((e) => e.scroll), [2, 2]);
    const headThen = parser.eventsFromTja(
      "TITLE:tempo-test\nBPM:120\nOFFSET:0\nHEADSCROLL:2\n#START\n11,\n#SCROLL 0.5\n11,\n#END\n"
    );
    assert.deepStrictEqual(headThen.events.map((e) => +e.scroll), [2, 2, 0.5, 0.5]);

    const branched = [
      "TITLE:tempo-test", "BPM:120", "OFFSET:0", "#START",
      "1,",
      "#BRANCHSTART r,1,2",
      "#N",
      "#SCROLL 2",
      "1,",
      "#M",
      "#SCROLL 0.5",
      "1,",
      "#BRANCHEND",
      "#END",
      "",
    ].join("\n");
    const asN = parser.eventsFromTja(branched, { branch: "N" });
    const asM = parser.eventsFromTja(branched, { branch: "M" });
    assert.deepStrictEqual(asN.events.map((e) => e.scroll), [1, 2]);
    assert.deepStrictEqual(asM.events.map((e) => e.scroll), [1, 0.5]);
    assert.deepStrictEqual(asN.events.map((e) => e.t), asM.events.map((e) => e.t));

    const withHands = parser.chartFromTjaAndHands(
      tja("#SCROLL 2\n1,\n#SCROLL 0.5\n1,", 120),
      JSON.stringify({
        events: [
          { t: 0, hand: "L", face: "don", grip: "single", src: "1:0" },
          { t: 2, hand: "R", face: "ka", grip: "single", src: "2:0" },
        ],
      })
    );
    assert.deepStrictEqual(withHands.events.map((e) => e.scroll), [2, 0.5]);
    assert.deepStrictEqual(withHands.events.map((e) => e.bpm), [120, 120]);
    assert.deepStrictEqual(withHands.events.map((e) => e.hand), ["L", "R"]);
    nearly(withHands.events[1].t, 2);

    const handsTempo = parser.chartFromTjaAndHands(
      tja("#BPMCHANGE 150\n1,\n#BPMCHANGE 300\n1,", 150),
      JSON.stringify({
        events: [
          { t: 0, hand: "L", face: "don", grip: "single", src: "1:0" },
          { t: 1.6, hand: "R", face: "don", grip: "single", src: "2:0" },
        ],
      })
    );
    assert.deepStrictEqual(handsTempo.events.map((e) => e.bpm), [150, 300]);
    assert.deepStrictEqual(handsTempo.events.map((e) => e.scroll), [1, 1]);
  });

  await check("打开变速时间距跟 BPM×SCROLL；关掉时忽略 #SCROLL 和 BPM，像素/秒不变", () => {
    const ScrollTempo = loadScrollTempo();
    const bpm = parse("1111,\n#BPMCHANGE 240\n1111,", 120);
    const slow = bpm.events.filter((e) => Math.abs(e.bpm - 120) < 0.01);
    const fast = bpm.events.filter((e) => Math.abs(e.bpm - 240) < 0.01);
    assert.ok(slow.length >= 2 && fast.length >= 2);
    nearly(slow[1].t - slow[0].t, 0.5);
    nearly(fast[1].t - fast[0].t, 0.25);
    assert.strictEqual(ScrollTempo.referenceBpm(bpm.bpmTimeline), 120);
    function gap(show, user, notes) {
      const now = notes[0].t;
      const x = (note) => ScrollTempo.noteX({
        tNote: note.t, now, scroll: user, showTempo: show,
        chartScroll: note.scroll, bpm: note.bpm, timeline: bpm.bpmTimeline,
        judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
      return x(notes[1]) - x(notes[0]);
    }
    // 开头 120。一拍的像素宽度跟 BPM 无关：240 的四分音符在画面上和 120 一样宽，但跑得更快。
    // 关掉变速仍是等速，快段只因为时值更短而更近。
    nearly(gap(true, 1, slow), 0.5 * BASE_PX);
    nearly(gap(false, 1, slow), 0.5 * BASE_PX);
    nearly(gap(true, 1, fast), 0.5 * BASE_PX);
    nearly(gap(false, 1, fast), 0.25 * BASE_PX);
    assert.ok(Math.abs(gap(true, 1, fast) - gap(false, 1, fast)) > 100, "快段打开变速后不该仍按等速挤在一起");

    const scrolled = parse("#SCROLL 1\n1111,\n#SCROLL 2\n1111,\n#SCROLL 0.25\n1111,", 120);
    const wide = scrolled.events.filter((e) => Math.abs(e.scroll - 2) < 1e-9);
    const tight = scrolled.events.filter((e) => Math.abs(e.scroll - 0.25) < 1e-9);
    const normal = scrolled.events.filter((e) => Math.abs(e.scroll - 1) < 1e-9);
    assert.ok(normal.length >= 2 && wide.length >= 2 && tight.length >= 2);
    nearly(wide[1].t - wide[0].t, 0.5);
    nearly(tight[1].t - tight[0].t, 0.5);
    function gapScroll(show, user, notes) {
      const now = notes[0].t;
      const x = (note) => ScrollTempo.noteX({
        tNote: note.t, now, scroll: user, showTempo: show,
        chartScroll: note.scroll, bpm: note.bpm, timeline: scrolled.bpmTimeline,
        judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
      return x(notes[1]) - x(notes[0]);
    }
    nearly(gapScroll(true, 1, normal), 0.5 * BASE_PX);
    nearly(gapScroll(true, 1, wide), 0.5 * BASE_PX * 2);
    nearly(gapScroll(true, 1, tight), 0.5 * BASE_PX * 0.25);
    nearly(gapScroll(false, 1, wide), 0.5 * BASE_PX);
    nearly(gapScroll(false, 1, tight), 0.5 * BASE_PX);
    nearly(gapScroll(true, 1.2, wide), 0.5 * BASE_PX * 2 * 1.2);
    nearly(gapScroll(false, 1.1, wide), 0.5 * BASE_PX * 1.1);
    nearly(gapScroll(false, 1.2, tight), 0.5 * BASE_PX * 1.2);
  });

  await check("变速打开时，SCROLL 更高的后一个音跑得更快，间距缩小", () => {
    const ScrollTempo = loadScrollTempo();
    const data = parse("#SCROLL 1\n1\n#SCROLL 4\n1\n00,", 120);
    const notes = data.events;
    assert.strictEqual(notes.length, 2);
    nearly(notes[0].t, 0);
    nearly(notes[1].t, 0.5);
    assert.strictEqual(notes[0].scroll, 1);
    assert.strictEqual(notes[1].scroll, 4);
    function at(show, now, note, user) {
      return ScrollTempo.noteX({
        tNote: note.t,
        now: now,
        scroll: user == null ? 1 : user,
        showTempo: show,
        chartScroll: note.scroll,
        bpm: note.bpm,
        timeline: data.bpmTimeline,
        judgeX: JUDGE_X,
        basePxPerSec: BASE_PX,
      });
    }
    const early = -1;
    const later = -0.25;
    const gapOn = (now) => at(true, now, notes[1]) - at(true, now, notes[0]);
    const gapOff = (now) => at(false, now, notes[1]) - at(false, now, notes[0]);
    nearly(gapOn(early), 3000);
    nearly(gapOn(later), 1650);
    assert.ok(gapOn(later) < gapOn(early), "后一个音应该正在追上");
    assert.ok(gapOn(later) > 0, "在前一个音打到之前，后一个音还在它右边");
    const movedEarly = at(true, early, notes[0]) - at(true, later, notes[0]);
    const movedLate = at(true, early, notes[1]) - at(true, later, notes[1]);
    nearly(movedEarly, 0.75 * BASE_PX);
    nearly(movedLate, 0.75 * BASE_PX * 4);
    nearly(gapOff(early), 0.5 * BASE_PX);
    nearly(gapOff(later), gapOff(early));
    nearly(at(true, later, notes[1], 1.2) - JUDGE_X, (at(true, later, notes[1], 1) - JUDGE_X) * 1.2);
    nearly(at(false, later, notes[1], 1.1) - JUDGE_X, (at(false, later, notes[1], 1) - JUDGE_X) * 1.1);

    // SCROLL 更小的后一个音可以先出现在更靠近判定点的位置，和前一个音交错。
    const pass = parse("#SCROLL 4\n1\n#SCROLL 0.5\n1\n00,", 120);
    const ahead = pass.events;
    const xEarly = ScrollTempo.noteX({
      tNote: ahead[0].t, now: -0.1, scroll: 1, showTempo: true,
      chartScroll: ahead[0].scroll, bpm: ahead[0].bpm, timeline: pass.bpmTimeline,
      judgeX: JUDGE_X, basePxPerSec: BASE_PX,
    });
    const xLate = ScrollTempo.noteX({
      tNote: ahead[1].t, now: -0.1, scroll: 1, showTempo: true,
      chartScroll: ahead[1].scroll, bpm: ahead[1].bpm, timeline: pass.bpmTimeline,
      judgeX: JUDGE_X, basePxPerSec: BASE_PX,
    });
    assert.ok(xLate < xEarly, "后一个音 SCROLL 更小，画面上可以已经在前一个音左边");
    const xLateOff = ScrollTempo.noteX({
      tNote: ahead[1].t, now: -0.1, scroll: 1, showTempo: false,
      chartScroll: ahead[1].scroll, bpm: ahead[1].bpm, timeline: pass.bpmTimeline,
      judgeX: JUDGE_X, basePxPerSec: BASE_PX,
    });
    const xEarlyOff = ScrollTempo.noteX({
      tNote: ahead[0].t, now: -0.1, scroll: 1, showTempo: false,
      chartScroll: ahead[0].scroll, bpm: ahead[0].bpm, timeline: pass.bpmTimeline,
      judgeX: JUDGE_X, basePxPerSec: BASE_PX,
    });
    assert.ok(xLateOff > xEarlyOff, "关掉变速后仍按时间先后，后一个音在右边");
  });

  await check("开头 BPM 且 SCROLL 为 1 时，打开或关闭变速都等于时间 × 流速", () => {
    const ScrollTempo = loadScrollTempo();
    const data = parse("1111,", 170);
    const a = data.events[0];
    const b = data.events[1];
    assert.strictEqual(ScrollTempo.referenceBpm(data.bpmTimeline), 170);
    function at(show, scroll) {
      return ScrollTempo.noteX({
        tNote: b.t, now: a.t, scroll, showTempo: show,
        chartScroll: b.scroll, bpm: b.bpm, timeline: data.bpmTimeline,
        judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
    }
    const classic = JUDGE_X + (b.t - a.t) * BASE_PX * 1.1;
    nearly(at(true, 1.1), classic);
    nearly(at(false, 1.1), classic);
    nearly(at(true, 1), at(false, 1));
  });

  await check("变速打开时 150×2、75×4 与 300×1 同速，2/4 不另加速，关掉则等速", () => {
    const ScrollTempo = loadScrollTempo();
    const data = parse([
      "#SCROLL 1",
      "1,",
      "#SCROLL 2",
      "1,",
      "#BPMCHANGE 300",
      "#SCROLL 1",
      "1,",
      "#SCROLL 0.62",
      "1,",
      "#BPMCHANGE 75",
      "#SCROLL 4",
      "#MEASURE 2/4",
      "0202,",
      "#MEASURE 4/4",
      "1111,",
      "#BPMCHANGE 300",
      "#SCROLL 1",
      "#MEASURE 2/4",
      "1,",
      "#MEASURE 6/8",
      "1,",
    ].join("\n"), 150);
    const events = data.events;
    assert.strictEqual(ScrollTempo.referenceBpm(data.bpmTimeline), 150);
    function find(bpm, scroll, src) {
      const note = events.find((e) => Math.abs(e.bpm - bpm) < 0.01
        && Math.abs(e.scroll - scroll) < 1e-9
        && e.src === src);
      assert.ok(note, "找不到 " + bpm + "×" + scroll + " @ " + src);
      return note;
    }
    const open = find(150, 1, "1:0");
    const scrolled = find(150, 2, "2:0");
    const main = find(300, 1, "3:0");
    const slowHs = find(300, 0.62, "4:0");
    const kaOff = events.filter((e) => e.src === "5:1" || e.src === "5:3");
    assert.strictEqual(kaOff.length, 2);
    assert.ok(Math.abs(kaOff[0].bpm - 75) < 0.01 && Math.abs(kaOff[1].scroll - 4) < 1e-9);
    nearly(kaOff[1].t - kaOff[0].t, 60 / 75);
    const quarters = events.filter((e) => e.src.indexOf("6:") === 0).sort((a, b) => a.t - b.t);
    assert.ok(quarters.length >= 2);
    const twoFour = find(300, 1, "7:0");
    const sixEight = find(300, 1, "8:0");
    function speed(note, show, user) {
      const far = ScrollTempo.noteX({
        tNote: note.t, now: note.t - 1, scroll: user == null ? 1 : user, showTempo: show,
        chartScroll: note.scroll, bpm: note.bpm, timeline: data.bpmTimeline,
        judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
      const hit = ScrollTempo.noteX({
        tNote: note.t, now: note.t, scroll: user == null ? 1 : user, showTempo: show,
        chartScroll: note.scroll, bpm: note.bpm, timeline: data.bpmTimeline,
        judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
      return far - hit;
    }
    const vOpen = speed(open, true);
    const vMain = speed(main, true);
    const vPair = speed(scrolled, true);
    const vKa = speed(kaOff[0], true);
    const vQuarter = speed(quarters[0], true);
    nearly(vOpen, BASE_PX);
    nearly(vMain, BASE_PX * 2);
    nearly(vOpen, vMain / 2);
    nearly(vPair, vMain);
    nearly(vKa, vMain);
    nearly(vQuarter, vMain);
    nearly(speed(twoFour, true), vMain);
    nearly(speed(sixEight, true), vMain);
    nearly(speed(slowHs, true), vMain * slowHs.scroll);
    assert.ok(speed(slowHs, true) < vMain * 0.9, "0.62 的慢流速应该看得出来");
    nearly(speed(main, true, 1.2), vMain * 1.2);
    nearly(speed(kaOff[0], true, 1.1), vKa * 1.1);

    function gap(a, b) {
      const now = a.t;
      const xa = ScrollTempo.noteX({
        tNote: a.t, now, scroll: 1, showTempo: true,
        chartScroll: a.scroll, bpm: a.bpm, timeline: data.bpmTimeline,
        judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
      const xb = ScrollTempo.noteX({
        tNote: b.t, now, scroll: 1, showTempo: true,
        chartScroll: b.scroll, bpm: b.bpm, timeline: data.bpmTimeline,
        judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
      return xb - xa;
    }
    nearly(gap(kaOff[0], kaOff[1]), gap(quarters[0], quarters[1]));
    nearly(gap(kaOff[0], kaOff[1]), (60 / 75) * vMain);

    // 还在 150 段里看后面的 300 音：它已经按自己的 BPM×SCROLL 在跑，不是先跟当前段再突然加速。
    const ahead = ScrollTempo.noteX({
      tNote: main.t, now: 0, scroll: 1, showTempo: true,
      chartScroll: main.scroll, bpm: main.bpm, timeline: data.bpmTimeline,
      judgeX: JUDGE_X, basePxPerSec: BASE_PX,
    });
    const aheadLater = ScrollTempo.noteX({
      tNote: main.t, now: 1, scroll: 1, showTempo: true,
      chartScroll: main.scroll, bpm: main.bpm, timeline: data.bpmTimeline,
      judgeX: JUDGE_X, basePxPerSec: BASE_PX,
    });
    nearly(ahead - aheadLater, vMain);

    const lookedUp = ScrollTempo.noteX({
      tNote: main.t, now: main.t - 1, scroll: 1, showTempo: true,
      chartScroll: main.scroll, timeline: data.bpmTimeline,
      judgeX: JUDGE_X, basePxPerSec: BASE_PX,
    });
    nearly(lookedUp - JUDGE_X, vMain);

    for (const note of [open, scrolled, main, slowHs, kaOff[0], twoFour, sixEight]) {
      nearly(speed(note, false), BASE_PX);
      nearly(speed(note, false, 1.2), BASE_PX * 1.2);
    }

    const head = parser.eventsFromTja(
      "TITLE:tempo-test\nBPM:150\nOFFSET:0\nHEADSCROLL:2\n#START\n1,\n#END\n"
    );
    nearly(speedOf(head, true), BASE_PX * 2);
    nearly(speedOf(head, false), BASE_PX);

    function speedOf(chart, show) {
      const note = chart.events[0];
      const far = ScrollTempo.noteX({
        tNote: note.t, now: note.t - 1, scroll: 1, showTempo: show,
        chartScroll: note.scroll, bpm: note.bpm, timeline: chart.bpmTimeline,
        judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
      const hit = ScrollTempo.noteX({
        tNote: note.t, now: note.t, scroll: 1, showTempo: show,
        chartScroll: note.scroll, bpm: note.bpm, timeline: chart.bpmTimeline,
        judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
      return far - hit;
    }
  });

  await check("页面上可以开关变速，并把流速拨到 1.1 和 1.2", async () => {
    const ScrollTempo = loadScrollTempo();
    const puppeteer = require(path.join(ROOT, "node_modules", "puppeteer-core"));
    const chrome = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome";
    const { server, port } = await startStaticServer(ROOT);
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chrome,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "networkidle0", timeout: 30000 });
      await page.waitForFunction(() => window.__BACHI_READY__ === true, { timeout: 15000 });

      const layout = await page.evaluate(() => {
        const tempo = document.getElementById("showTempo");
        const label = tempo && tempo.closest("label");
        const box = (label || tempo).getBoundingClientRect();
        const rates = document.querySelector(".rates").getBoundingClientRect();
        const scroll = document.getElementById("scroll").getBoundingClientRect();
        return {
          checked: tempo.checked,
          disabled: tempo.disabled,
          step: document.getElementById("scroll").step,
          tempoBottom: box.bottom,
          ratesTop: rates.top,
          scrollTop: scroll.top,
          show: window.taikoAnim.state.showTempo,
        };
      });
      assert.strictEqual(layout.checked, true, "变速默认打开");
      assert.strictEqual(layout.show, true);
      assert.strictEqual(layout.disabled, false);
      assert.ok(reaches(1, 4, +layout.step, 1.1), "页面流速 step 取不到 1.1，step=" + layout.step);
      assert.ok(reaches(1, 4, +layout.step, 1.2), "页面流速 step 取不到 1.2，step=" + layout.step);
      assert.ok(layout.tempoBottom <= layout.ratesTop + 1, "变速应在慢放上面");
      assert.ok(layout.tempoBottom <= layout.scrollTop + 1, "变速应在流速上面");

      async function setScroll(value) {
        return page.evaluate((v) => {
          const input = document.getElementById("scroll");
          input.value = v;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          return {
            scroll: window.taikoAnim.state.scroll,
            label: document.getElementById("scrollVal").textContent,
            mismatch: input.validity.stepMismatch,
          };
        }, value);
      }
      const at11 = await setScroll("1.1");
      assert.strictEqual(at11.mismatch, false, "1.1 被滑条 step 拒绝");
      assert.strictEqual(at11.scroll, 1.1);
      assert.strictEqual(at11.label, "1.1×");
      const at12 = await setScroll("1.2");
      assert.strictEqual(at12.mismatch, false, "1.2 被滑条 step 拒绝");
      assert.strictEqual(at12.scroll, 1.2);
      assert.strictEqual(at12.label, "1.2×");

      const toggled = await page.evaluate(() => {
        const box = document.getElementById("showTempo");
        box.click();
        const off = window.taikoAnim.state.showTempo;
        box.click();
        const on = window.taikoAnim.state.showTempo;
        return { off, on, checked: box.checked };
      });
      assert.strictEqual(toggled.off, false, "关掉变速后画面仍按变速排");
      assert.strictEqual(toggled.on, true, "再打开变速没有生效");
      assert.strictEqual(toggled.checked, true);

      const chart = tja("#SCROLL 0.25\n1111,", 120);
      const placed = await page.evaluate((text) => {
        document.getElementById("tjaInput").value = text;
        document.getElementById("btnGenerate").click();
        const events = window.taikoAnim.state.events
          .filter((e) => !e.both || e.hand === "R")
          .slice()
          .sort((a, b) => a.t - b.t);
        const t0 = events[0] && events[0].t;
        const t1 = events[1] && events[1].t;
        const chartScroll = events[1] && events[1].scroll;
        function read(show) {
          const box = document.getElementById("showTempo");
          if (box.checked !== show) box.click();
          window.renderAt(t0);
          return [...document.querySelectorAll("#chart circle")].map((el) => +el.getAttribute("cx"));
        }
        return {
          t0, t1, chartScroll,
          bpm: events[1] && events[1].bpm,
          timeline: window.taikoAnim.state.bpmTimeline,
          scrolls: events.map((e) => e.scroll),
          times: events.map((e) => e.t),
          scroll: window.taikoAnim.state.scroll,
          on: read(true),
          off: read(false),
        };
      }, chart);
      assert.ok(Number.isFinite(placed.t0) && Number.isFinite(placed.t1), "没有相邻的两颗音");
      nearly(placed.t1 - placed.t0, 0.5);
      assert.deepStrictEqual(placed.scrolls, [0.25, 0.25, 0.25, 0.25]);
      function expectX(show) {
        return ScrollTempo.noteX({
          tNote: placed.t1,
          now: placed.t0,
          scroll: placed.scroll,
          showTempo: show,
          chartScroll: placed.chartScroll,
          bpm: placed.bpm,
          timeline: placed.timeline,
          judgeX: JUDGE_X,
          basePxPerSec: BASE_PX,
        });
      }
      const wantOn = expectX(true);
      const wantOff = expectX(false);
      function closest(xs, want) {
        return xs.reduce((best, x) => Math.abs(x - want) < Math.abs(best - want) ? x : best, xs[0]);
      }
      assert.ok(placed.on.length > 0 && placed.off.length > 0, "谱面没有画出音符");
      nearly(closest(placed.on, wantOn), wantOn, 0.2);
      nearly(closest(placed.off, wantOff), wantOff, 0.2);
      assert.ok(Math.abs(wantOn - wantOff) > 100, "开关变速后 #SCROLL 段的间距应明显不同");

      const bpmChart = tja("#SCROLL 1\n1111,\n#BPMCHANGE 300\n#SCROLL 1\n1111,", 150);
      const bpmPlaced = await page.evaluate((text) => {
        const input = document.getElementById("scroll");
        input.value = "1";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        document.getElementById("tjaInput").value = text;
        document.getElementById("btnGenerate").click();
        const box = document.getElementById("showTempo");
        if (!box.checked) box.click();
        const events = window.taikoAnim.state.events
          .filter((e) => !e.both || e.hand === "R")
          .slice()
          .sort((a, b) => a.t - b.t);
        const fast = events.find((e) => Math.abs(e.bpm - 300) < 0.01);
        const now = fast.t - 0.2;
        window.renderAt(now);
        return {
          t: fast.t,
          bpm: fast.bpm,
          chartScroll: fast.scroll,
          now,
          user: window.taikoAnim.state.scroll,
          show: window.taikoAnim.state.showTempo,
          timeline: window.taikoAnim.state.bpmTimeline,
          xs: [...document.querySelectorAll("#chart circle")].map((el) => +el.getAttribute("cx")),
        };
      }, bpmChart);
      assert.strictEqual(bpmPlaced.show, true);
      assert.strictEqual(bpmPlaced.user, 1);
      assert.strictEqual(ScrollTempo.referenceBpm(bpmPlaced.timeline), 150);
      const wantFast = ScrollTempo.noteX({
        tNote: bpmPlaced.t,
        now: bpmPlaced.now,
        scroll: bpmPlaced.user,
        showTempo: true,
        chartScroll: bpmPlaced.chartScroll,
        bpm: bpmPlaced.bpm,
        timeline: bpmPlaced.timeline,
        judgeX: JUDGE_X,
        basePxPerSec: BASE_PX,
      });
      const timeOnly = JUDGE_X + (bpmPlaced.t - bpmPlaced.now) * BASE_PX * bpmPlaced.user;
      assert.ok(Math.abs(wantFast - timeOnly) > 100, "BPM 300 仍按不计 BPM 的等速排");
      assert.ok(bpmPlaced.xs.length > 0, "BPM 300 的音符没有画出来");
      nearly(closest(bpmPlaced.xs, wantFast), wantFast, 0.2);

      const offPage = await browser.newPage();
      await offPage.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      await offPage.goto("http://127.0.0.1:" + port + "/index.html?tempo=0", { waitUntil: "networkidle0", timeout: 30000 });
      await offPage.waitForFunction(() => window.__BACHI_READY__ === true, { timeout: 15000 });
      const startedOff = await offPage.evaluate(() => ({
        checked: document.getElementById("showTempo").checked,
        show: window.taikoAnim.state.showTempo,
      }));
      assert.strictEqual(startedOff.checked, false);
      assert.strictEqual(startedOff.show, false);
      const turnedOn = await offPage.evaluate(() => {
        document.getElementById("showTempo").click();
        return {
          checked: document.getElementById("showTempo").checked,
          show: window.taikoAnim.state.showTempo,
        };
      });
      assert.strictEqual(turnedOn.checked, true);
      assert.strictEqual(turnedOn.show, true);
    } finally {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  console.log("scroll-tempo: " + passed + " passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
