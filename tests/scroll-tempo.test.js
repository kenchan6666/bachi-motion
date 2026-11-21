/**
 * 变速开关在慢放和流速上面；流速要能取 1.1、1.2。
 * 打开变速时，四分音符的像素间距跟拍走（BPM 加倍则谱面加快）。
 * 关掉时，像素/秒不变（和原来的时间轴流速一样）。
 * 恒定 BPM 时两种算法重合，练习谱外观不变。
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

  await check("打开变速时四分间距跟拍走；关掉时像素/秒不变", () => {
    const ScrollTempo = loadScrollTempo();
    const data = parse("1111,\n#BPMCHANGE 240\n1111,", 120);
    const slow = data.events.filter((e) => Math.abs(e.bpm - 120) < 0.01);
    const fast = data.events.filter((e) => Math.abs(e.bpm - 240) < 0.01);
    assert.ok(slow.length >= 2 && fast.length >= 2);
    nearly(slow[1].t - slow[0].t, 0.5);
    nearly(fast[1].t - fast[0].t, 0.25);
    function gap(show, scroll, notes) {
      const now = notes[0].t;
      const x0 = ScrollTempo.noteX({
        tNote: notes[0].t, now, scroll, showTempo: show,
        timeline: data.bpmTimeline, judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
      const x1 = ScrollTempo.noteX({
        tNote: notes[1].t, now, scroll, showTempo: show,
        timeline: data.bpmTimeline, judgeX: JUDGE_X, basePxPerSec: BASE_PX,
      });
      return x1 - x0;
    }
    const slowOn = gap(true, 1, slow);
    const fastOn = gap(true, 1, fast);
    const fastOff = gap(false, 1, fast);
    nearly(slowOn, 0.5 * BASE_PX);
    nearly(fastOn, slowOn);
    nearly(fastOff, 0.25 * BASE_PX);
    assert.ok(fastOn > fastOff * 1.9, "打开变速后快段应该拉得更开，got " + fastOn + " vs " + fastOff);
    nearly(gap(true, 1.2, fast), fastOn * 1.2);
    nearly(gap(false, 1.1, fast), fastOff * 1.1);
  });

  await check("恒定 BPM 时打开或关闭变速，位置都等于原来的时间 × 流速", () => {
    const ScrollTempo = loadScrollTempo();
    const data = parse("1111,", 170);
    const a = data.events[0];
    const b = data.events[1];
    function at(show, scroll) {
      return ScrollTempo.noteX({
        tNote: b.t, now: a.t, scroll, showTempo: show,
        timeline: data.bpmTimeline, judgeX: JUDGE_X, basePxPerSec: BASE_PX,
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

      const chart = tja("1111,\n#BPMCHANGE 240\n1111,", 120);
      const placed = await page.evaluate((text) => {
        document.getElementById("tjaInput").value = text;
        document.getElementById("btnGenerate").click();
        const events = window.taikoAnim.state.events;
        const timeline = window.taikoAnim.state.bpmTimeline;
        const fast = timeline.filter((p) => Math.abs(p.bpm - 240) < 0.01)[0];
        const t0 = fast.t;
        const later = events.map((e) => e.t).filter((t) => t > t0 + 1e-6).sort((a, b) => a - b);
        const t1 = later[0];
        function read(show) {
          const box = document.getElementById("showTempo");
          if (box.checked !== show) box.click();
          window.renderAt(t0);
          return [...document.querySelectorAll("#chart circle")].map((el) => +el.getAttribute("cx"));
        }
        return {
          t0, t1,
          scroll: window.taikoAnim.state.scroll,
          timeline: timeline,
          on: read(true),
          off: read(false),
        };
      }, chart);
      assert.ok(Number.isFinite(placed.t0) && Number.isFinite(placed.t1), "快段没有相邻的两颗音");
      function expectX(show) {
        return ScrollTempo.noteX({
          tNote: placed.t1,
          now: placed.t0,
          scroll: placed.scroll,
          showTempo: show,
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
      assert.ok(Math.abs(wantOn - wantOff) > 100, "开关变速后快段间距应明显不同");

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
