/**
 * 变速开关在慢放和流速上面；流速要能取 1.1、1.2。
 * 打开变速：跟本家。每颗音用自己命中时刻的 BPM 和 #SCROLL 匀速移动，
 *   像素/秒 = 基准 × (该音 BPM / 谱面最高 BPM) × 该音 SCROLL × 流速。
 *   最高 BPM 且 SCROLL 为 1 是单位速度，和关掉变速一样快。
 *   150×2、75×4 和 300×1 同速；150×1 是一半。
 *   后面的 #BPMCHANGE 不会提前乘到前面的音上（150×2 不能变成 300×2）。
 *   #MEASURE 只决定一小节有几拍，不另改像素/秒。
 * 关掉变速：等速。忽略 #SCROLL，BPM 也不改像素/秒。击打时刻仍跟 BPM。
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

/**
 * 本家风里谱开头、第 76 小节、137 起的慢流速。命令从公开 TJADB 谱
 * 「Dairokuten Maou」COURSE:Edit 照抄（表头 BPM:150，无 HEADSCROLL）。
 * 中间小节省掉了，所以这里的小节号不是 76 / 137，但命令原文不变。
 * 第 2 小节最后一拍是 111222：ooo 再接 xxx。#BPMCHANGE 300 写在这一拍之后。
 */
function uraTja() {
  return [
    "TITLE:Dairokuten Maou",
    "TITLEJA:第六天魔王",
    "BPM:150",
    "OFFSET:0",
    "COURSE:Edit",
    "LEVEL:10",
    "#START",
    "3,",
    "#SCROLL 2",
    "000000000000000000111222,",
    "#BPMCHANGE 300",
    "#SCROLL 1",
    "7,",
    "0000000080001110,",
    "#MEASURE 2/4",
    "#BPMCHANGE 75",
    "#SCROLL 4",
    "0822,",
    "#MEASURE 4/4",
    "#BPMCHANGE 300",
    "#SCROLL 1",
    "1110101020001110,",
    "#SCROLL 0.89",
    "1110102010102220,",
    "#SCROLL 0.62",
    "2222111122112121,",
    "#END",
    "",
  ].join("\n");
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
    // 单位速度是谱面最高 BPM，不是开头的 120。240×1 才和等速一样。
    assert.strictEqual(ScrollTempo.referenceBpm(bpm.bpmTimeline), 240);
    function gap(show, user, notes) {
      const now = notes[0].t;
      const x = (note) => ScrollTempo.noteX({
        tNote: note.t, now, scroll: user, showTempo: show,
        chartScroll: note.scroll, bpm: note.bpm, timeline: bpm.bpmTimeline,
        judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
      return x(notes[1]) - x(notes[0]);
    }
    // 一拍的像素宽度跟该音自己的 BPM 无关：打开变速时 120 和 240 的四分音符一样宽。
    // 120 比单位速度慢，所以比等速更窄；240×1 就是单位速度，和等速一样。
    nearly(gap(true, 1, slow), 0.25 * BASE_PX);
    nearly(gap(false, 1, slow), 0.5 * BASE_PX);
    nearly(gap(true, 1, fast), 0.25 * BASE_PX);
    nearly(gap(false, 1, fast), 0.25 * BASE_PX);
    nearly(gap(true, 1, slow), gap(true, 1, fast));
    assert.ok(Math.abs(gap(true, 1, slow) - gap(false, 1, slow)) > 100, "慢段打开变速后不该仍按等速拉开");

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

  await check("里第六天魔王开头 ooo 按 150×2 走，不把后面的 300 提前乘上去", () => {
    const ScrollTempo = loadScrollTempo();
    const data = parser.eventsFromTja(uraTja(), { course: "Edit" });
    const events = data.events.filter((e) => !e.both || e.hand === "R");
    // 单位速度是谱面最高 BPM 300，不是表头 / 开头时间线的 150。
    assert.strictEqual(ScrollTempo.referenceBpm(data.bpmTimeline), 300);
    const open = events.find((e) => e.src === "1:0");
    assert.ok(open, "第 1 小节没有大音符");
    assert.strictEqual(open.type, "bigdon");
    assert.strictEqual(open.bpm, 150);
    assert.strictEqual(open.scroll, 1);
    const ooo = events.filter((e) => e.measure === 2 && e.pos >= 18 && e.pos <= 20);
    const xxx = events.filter((e) => e.measure === 2 && e.pos >= 21 && e.pos <= 23);
    assert.deepStrictEqual(ooo.map((e) => e.face), ["don", "don", "don"]);
    assert.deepStrictEqual(xxx.map((e) => e.face), ["ka", "ka", "ka"]);
    for (const note of ooo.concat(xxx)) {
      assert.strictEqual(note.bpm, 150, note.src + " 被写成了后面的 BPM");
      assert.strictEqual(note.scroll, 2, note.src + " 的 #SCROLL 不是 2");
    }
    const main = events.find((e) => e.src === "4:12");
    assert.ok(main && main.bpm === 300 && main.scroll === 1, "300×1 的主速度音符不在");
    const kaOff = events.filter((e) => e.bpm === 75 && Math.abs(e.scroll - 4) < 1e-9);
    assert.strictEqual(kaOff.length, 2, "2/4、BPM 75、SCROLL 4 应该是两个咔");
    assert.deepStrictEqual(kaOff.map((e) => e.face), ["ka", "ka"]);
    nearly(kaOff[1].t - kaOff[0].t, 0.4);
    const back = events.find((e) => e.bpm === 300 && e.scroll === 1 && e.measure > main.measure);
    assert.ok(back, "回到 4/4 之后的 300×1 不在");
    const ease = events.find((e) => Math.abs(e.scroll - 0.89) < 1e-9 && e.bpm === 300);
    const crawl = events.find((e) => Math.abs(e.scroll - 0.62) < 1e-9 && e.bpm === 300);
    assert.ok(ease && crawl, "137 起的 0.89 和后面的 0.62 不在");
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
    const vOoo = speed(ooo[0], true);
    const vMain = speed(main, true);
    nearly(vOpen, BASE_PX * 0.5);
    nearly(vOoo, BASE_PX);
    nearly(vMain, BASE_PX);
    nearly(vOpen, vMain / 2);
    nearly(vOoo, vMain);
    nearly(speed(xxx[0], true), vMain);
    nearly(speed(kaOff[0], true), vMain);
    nearly(speed(back, true), vMain);
    // 若把 #BPMCHANGE 300 提前乘到 SCROLL 2 上，就是 600，比主速度再快一倍。
    const flew = BASE_PX * (300 / 300) * 2;
    assert.ok(Math.abs(vOoo - flew) > 100, "ooo 按 300×2 在飞");
    assert.ok(Math.abs(vOoo - BASE_PX * 2) > 100, "ooo 不该是单位速度的两倍");
    nearly(speed(ease, true), vMain * 0.89);
    nearly(speed(crawl, true), vMain * 0.62);
    assert.ok(speed(crawl, true) < speed(ease, true), "0.62 应该比 0.89 更慢");
    assert.ok(speed(crawl, true) < vMain * 0.9, "0.62 的慢流速应该看得出来");
    nearly(speed(main, true, 1.2), vMain * 1.2);
    nearly(speed(ooo[0], true, 1.1), vOoo * 1.1);
    nearly(speed(kaOff[0], true, 1.2), vMain * 1.2);

    // 还在 150 段里看后面的 300 音：它已经按自己的 300×1 在跑，不是先跟当前段再突然加速。
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

    // 没带上音符自己的 BPM 时，按命中时刻从时间线取，第 4 小节仍是 300 而不是第 2 小节的 150。
    const lookedUp = ScrollTempo.noteX({
      tNote: main.t, now: main.t - 1, scroll: 1, showTempo: true,
      chartScroll: main.scroll, timeline: data.bpmTimeline,
      judgeX: JUDGE_X, basePxPerSec: BASE_PX,
    });
    nearly(lookedUp - JUDGE_X, vMain);
    const oooLooked = ScrollTempo.noteX({
      tNote: ooo[0].t, now: ooo[0].t - 1, scroll: 1, showTempo: true,
      chartScroll: ooo[0].scroll, timeline: data.bpmTimeline,
      judgeX: JUDGE_X, basePxPerSec: BASE_PX,
    });
    nearly(oooLooked - JUDGE_X, vOoo);

    for (const note of [open, ooo[0], xxx[0], main, kaOff[0], ease, crawl, back]) {
      nearly(speed(note, false), BASE_PX);
      nearly(speed(note, false, 1.2), BASE_PX * 1.2);
    }

    const head = parser.eventsFromTja(
      "TITLE:tempo-test\nBPM:150\nOFFSET:0\nHEADSCROLL:2\n#START\n1,\n#END\n"
    );
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
    nearly(speedOf(head, true), BASE_PX * 2);
    nearly(speedOf(head, false), BASE_PX);
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
        const ooo = events.find((e) => e.bpm === 150 && e.scroll === 2);
        const main = events.find((e) => e.bpm === 300 && e.scroll === 1);
        if (!ooo || !main) {
          return {
            missing: true,
            n: events.length,
            sample: events.slice(0, 8).map((e) => ({ t: e.t, bpm: e.bpm, scroll: e.scroll, face: e.face })),
          };
        }
        const now = ooo.t - 0.2;
        window.renderAt(now);
        return {
          t: ooo.t,
          bpm: ooo.bpm,
          chartScroll: ooo.scroll,
          mainT: main.t,
          mainBpm: main.bpm,
          mainScroll: main.scroll,
          now,
          user: window.taikoAnim.state.scroll,
          show: window.taikoAnim.state.showTempo,
          timeline: window.taikoAnim.state.bpmTimeline,
          xs: [...document.querySelectorAll("#chart circle")].map((el) => +el.getAttribute("cx")),
        };
      }, uraTja());
      assert.ok(!bpmPlaced.missing, "页面没有解析出 150×2 和 300×1：" + JSON.stringify(bpmPlaced));
      assert.strictEqual(bpmPlaced.show, true);
      assert.strictEqual(bpmPlaced.user, 1);
      assert.strictEqual(bpmPlaced.bpm, 150);
      assert.strictEqual(bpmPlaced.chartScroll, 2);
      assert.strictEqual(bpmPlaced.mainBpm, 300);
      assert.strictEqual(bpmPlaced.mainScroll, 1);
      assert.strictEqual(ScrollTempo.referenceBpm(bpmPlaced.timeline), 300);
      const wantOoo = ScrollTempo.noteX({
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
      const wantMain = ScrollTempo.noteX({
        tNote: bpmPlaced.mainT,
        now: bpmPlaced.mainT - 0.2,
        scroll: bpmPlaced.user,
        showTempo: true,
        chartScroll: bpmPlaced.mainScroll,
        bpm: bpmPlaced.mainBpm,
        timeline: bpmPlaced.timeline,
        judgeX: JUDGE_X,
        basePxPerSec: BASE_PX,
      });
      const timeOnly = JUDGE_X + 0.2 * BASE_PX;
      nearly(wantOoo - JUDGE_X, 0.2 * BASE_PX);
      nearly(wantMain - JUDGE_X, wantOoo - JUDGE_X);
      const flew = JUDGE_X + 0.2 * BASE_PX * 2;
      assert.ok(Math.abs(wantOoo - flew) > 100, "页面上的 ooo 仍按两倍速度在飞");
      assert.ok(bpmPlaced.xs.length > 0, "开头的 ooo 没有画出来");
      nearly(closest(bpmPlaced.xs, wantOoo), wantOoo, 0.2);
      assert.ok(Math.abs(wantOoo - timeOnly) < 1, "150×2 应该和单位速度的等距一样");

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
