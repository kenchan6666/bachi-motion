/**
 * 变速开关在慢放和流速上面；流速要能取 1.1、1.2。
 * 打开变速：画面跟谱面 #SCROLL。每颗音用自己命中时刻的 SCROLL，
 *   像素/秒 = 基准 × 该音 SCROLL × 流速。后一个音 SCROLL 更高时跑得更快，间距会缩小。
 * 关掉变速：等速。忽略 #SCROLL，像素/秒不变。
 * #BPMCHANGE 只决定何时打到，两种开关都一样，不改像素/秒。
 * 没有 #SCROLL（或全程为 1）时，打开和关掉外观相同。
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
    assert.deepStrictEqual(withHands.events.map((e) => e.hand), ["L", "R"]);
    nearly(withHands.events[1].t, 2);
  });

  await check("打开变速时间距和速度跟 #SCROLL；关掉时忽略 #SCROLL，像素/秒不变", () => {
    const ScrollTempo = loadScrollTempo();
    const bpm = parse("1111,\n#BPMCHANGE 240\n1111,", 120);
    const slow = bpm.events.filter((e) => Math.abs(e.bpm - 120) < 0.01);
    const fast = bpm.events.filter((e) => Math.abs(e.bpm - 240) < 0.01);
    assert.ok(slow.length >= 2 && fast.length >= 2);
    nearly(slow[1].t - slow[0].t, 0.5);
    nearly(fast[1].t - fast[0].t, 0.25);
    function gap(show, user, notes) {
      const now = notes[0].t;
      const x = (note) => ScrollTempo.noteX({
        tNote: note.t, now, scroll: user, showTempo: show,
        chartScroll: note.scroll, judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
      return x(notes[1]) - x(notes[0]);
    }
    // BPM 只改时刻。没有 #SCROLL 时，打开和关掉都是像素/秒不变，快段因为更密而更近。
    nearly(gap(true, 1, slow), 0.5 * BASE_PX);
    nearly(gap(false, 1, slow), 0.5 * BASE_PX);
    nearly(gap(true, 1, fast), 0.25 * BASE_PX);
    nearly(gap(false, 1, fast), 0.25 * BASE_PX);
    nearly(gap(true, 1, fast), gap(false, 1, fast));

    const scrolled = parse("#SCROLL 1\n1111,\n#SCROLL 2\n1111,\n#SCROLL 0.25\n1111,", 120);
    const wide = scrolled.events.filter((e) => Math.abs(e.scroll - 2) < 1e-9);
    const tight = scrolled.events.filter((e) => Math.abs(e.scroll - 0.25) < 1e-9);
    const normal = scrolled.events.filter((e) => Math.abs(e.scroll - 1) < 1e-9);
    assert.ok(normal.length >= 2 && wide.length >= 2 && tight.length >= 2);
    nearly(wide[1].t - wide[0].t, 0.5);
    nearly(tight[1].t - tight[0].t, 0.5);
    nearly(gap(true, 1, normal), 0.5 * BASE_PX);
    nearly(gap(true, 1, wide), 0.5 * BASE_PX * 2);
    nearly(gap(true, 1, tight), 0.5 * BASE_PX * 0.25);
    nearly(gap(false, 1, wide), 0.5 * BASE_PX);
    nearly(gap(false, 1, tight), 0.5 * BASE_PX);
    nearly(gap(true, 1.2, wide), 0.5 * BASE_PX * 2 * 1.2);
    nearly(gap(false, 1.1, wide), 0.5 * BASE_PX * 1.1);
    nearly(gap(false, 1.2, tight), 0.5 * BASE_PX * 1.2);
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
      chartScroll: ahead[0].scroll, judgeX: JUDGE_X, basePxPerSec: BASE_PX,
    });
    const xLate = ScrollTempo.noteX({
      tNote: ahead[1].t, now: -0.1, scroll: 1, showTempo: true,
      chartScroll: ahead[1].scroll, judgeX: JUDGE_X, basePxPerSec: BASE_PX,
    });
    assert.ok(xLate < xEarly, "后一个音 SCROLL 更小，画面上可以已经在前一个音左边");
    const xLateOff = ScrollTempo.noteX({
      tNote: ahead[1].t, now: -0.1, scroll: 1, showTempo: false,
      chartScroll: ahead[1].scroll, judgeX: JUDGE_X, basePxPerSec: BASE_PX,
    });
    const xEarlyOff = ScrollTempo.noteX({
      tNote: ahead[0].t, now: -0.1, scroll: 1, showTempo: false,
      chartScroll: ahead[0].scroll, judgeX: JUDGE_X, basePxPerSec: BASE_PX,
    });
    assert.ok(xLateOff > xEarlyOff, "关掉变速后仍按时间先后，后一个音在右边");
  });

  await check("恒定 BPM 时打开或关闭变速，位置都等于原来的时间 × 流速", () => {
    const ScrollTempo = loadScrollTempo();
    const data = parse("1111,", 170);
    const a = data.events[0];
    const b = data.events[1];
    function at(show, scroll) {
      return ScrollTempo.noteX({
        tNote: b.t, now: a.t, scroll, showTempo: show,
        chartScroll: b.scroll, judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
    }
    const classic = JUDGE_X + (b.t - a.t) * BASE_PX * 1.1;
    nearly(at(true, 1.1), classic);
    nearly(at(false, 1.1), classic);
    nearly(at(true, 1), at(false, 1));
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
