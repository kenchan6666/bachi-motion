/**
 * 预览渲染：暂停时空转不再整段重写 SVG；播放/拖动时手图节点保留。
 * renderAt(t) 仍是谱面时间 t 的纯函数，画面与改动前一致。
 *
 *   node tests/preview-render.test.js
 *   WRITE_FIXTURE=1 node tests/preview-render.test.js   # 用当前画面重写对照
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

const ROOT = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));
const FIXTURE = path.join(ROOT, "tests", "fixtures", "preview-render.json");
const TaikoParser = require(path.join(ROOT, "js/parser.js"));

function loadPuppeteer() {
  const candidates = [
    path.join(ROOT, "node_modules", "puppeteer-core"),
    "puppeteer-core",
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* next */ }
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

function tempoTja() {
  return "TITLE:tempo-preview\nBPM:120\nOFFSET:0\nCOURSE:Oni\n#START\n1111,\n#BPMCHANGE 240\n1111,\n#END\n";
}

function plainTja() {
  return "TITLE:plain-preview\nBPM:120\nOFFSET:0\nCOURSE:Oni\n#START\n11111111,\n#END\n";
}

function loadCharts() {
  const rollTja = fs.readFileSync(path.join(ROOT, "samples/suyue_roll_demo.tja"), "utf8");
  const rollHands = JSON.parse(fs.readFileSync(path.join(ROOT, "samples/suyue_roll_demo.handorder.json"), "utf8"));
  return {
    roll: TaikoParser.chartFromTjaAndHands(rollTja, rollHands, { course: "Oni" }),
    tempo: TaikoParser.eventsFromTja(tempoTja()),
    plain: TaikoParser.eventsFromTja(plainTja()),
  };
}

const PAGE = {
  signature(root) {
    if (!root) return "";
    const lines = [];
    const all = [root];
    const found = root.querySelectorAll("*");
    for (let i = 0; i < found.length; i++) all.push(found[i]);
    for (const el of all) {
      const attrs = [];
      for (let i = 0; i < el.attributes.length; i++) {
        const a = el.attributes[i];
        const name = String(a.name).toLowerCase();
        if (name === "id" || name === "class" || name.indexOf("data-") === 0) continue;
        attrs.push(name + "=" + a.value);
      }
      attrs.sort();
      let text = "";
      for (let i = 0; i < el.childNodes.length; i++) {
        const n = el.childNodes[i];
        if (n.nodeType === 3) text += n.textContent;
      }
      text = text.trim();
      if (!attrs.length && !text) continue;
      lines.push(String(el.tagName).toLowerCase() + " " + attrs.join(" ") + (text ? " #" + text : ""));
    }
    return lines.join("\n");
  },
  readFrame() {
    const drum = document.getElementById("sceneDrum");
    return {
      chartSig: window.__previewSig(document.getElementById("chart")),
      dynSig: window.__previewSig(document.getElementById("dynamic")),
      drum: drum ? drum.getAttribute("transform") : "",
    };
  },
  paintSpec(payload, spec) {
    const anim = window.taikoAnim;
    const s = anim.state;
    s.route = spec.route;
    s.scroll = spec.scroll;
    s.rate = spec.rate;
    s.showTempo = !!spec.showTempo;
    s.labels = !!spec.labels;
    anim.setData(payload);
    anim.setPlaying(false);
    const t = anim.renderAt(spec.t);
    const frame = window.__previewRead();
    frame.t = t;
    frame.scroll = s.scroll;
    frame.rate = s.rate;
    frame.showTempo = !!s.showTempo;
    frame.labels = !!s.labels;
    frame.route = s.route;
    frame.hands = s.hands;
    return frame;
  },
};

function installPageFns(page) {
  return page.evaluate((src) => {
    const fn = new Function("root", src.signature);
    window.__previewSig = (root) => fn(root);
    window.__previewRead = new Function(src.readFrame);
    window.__previewPaint = new Function("payload", "spec", src.paintSpec);
  }, {
    signature: PAGE.signature.toString().replace(/^[^{]*{/, "").replace(/}\s*$/, ""),
    readFrame: PAGE.readFrame.toString().replace(/^[^{]*{/, "").replace(/}\s*$/, ""),
    paintSpec: PAGE.paintSpec.toString().replace(/^[^{]*{/, "").replace(/}\s*$/, ""),
  });
}

function diffSig(name, got, want) {
  if (got === want) return;
  const a = String(got || "").split("\n");
  const b = String(want || "").split("\n");
  const n = Math.max(a.length, b.length);
  const diffs = [];
  for (let i = 0; i < n && diffs.length < 6; i++) {
    if (a[i] !== b[i]) {
      diffs.push("第 " + i + " 行\n  现在: " + (a[i] || "（无）") + "\n  原来: " + (b[i] || "（无）"));
    }
  }
  assert.fail(name + " 画面和对照不一致（" + a.length + " 行 vs " + b.length + " 行）\n" + diffs.join("\n"));
}

(async () => {
  const puppeteer = loadPuppeteer();
  const chrome = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/local/bin/google-chrome";
  const charts = loadCharts();
  const { server, port } = await startStaticServer(ROOT);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chrome,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  async function openPage(query) {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:" + port + "/index.html?" + query, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await page.waitForFunction(() => typeof window.startEngine === "function" && typeof window.renderAt === "function", { timeout: 15000 });
    await installPageFns(page);
    await page.evaluate((payload) => {
      window.startEngine(payload, { mode: "preview-render" });
      window.taikoAnim.setPlaying(false);
    }, charts.roll);
    return page;
  }

  try {
    if (process.env.WRITE_FIXTURE === "1") {
      const page = await openPage("export=1&loop=0");
      const cases = await page.evaluate((payloads) => {
        window.startEngine(payloads.roll, { mode: "preview-render" });
        window.taikoAnim.setPlaying(false);
        const events = window.taikoAnim.state.events;
        const first = events[0];
        const roll = events.find((e) => e.grip === "roll") || first;
        const ka = events.find((e) => e.face === "ka" && e.grip !== "roll") || first;
        const big = events.find((e) => e.big) || first;
        const base = {
          scroll: 1, rate: 1, showTempo: true, route: "data", labels: false,
        };
        const specs = [
          Object.assign({ id: "start", chart: "roll", t: window.taikoAnim.state.start }, base),
          Object.assign({ id: "first", chart: "roll", t: first.t }, base),
          Object.assign({ id: "impact", chart: "roll", t: first.t + 0.012 }, base),
          Object.assign({ id: "roll", chart: "roll", t: roll.t + 0.02 }, base),
          Object.assign({ id: "ka", chart: "roll", t: ka.t + 0.008 }, base),
          Object.assign({ id: "big", chart: "roll", t: big.t }, base),
          Object.assign({ id: "scroll", chart: "roll", t: roll.t + 0.02 }, base, { scroll: 2 }),
          Object.assign({ id: "rate", chart: "roll", t: roll.t + 0.02 }, base, { rate: 0.5 }),
          Object.assign({ id: "tempo-off", chart: "roll", t: roll.t + 0.02 }, base, { showTempo: false }),
          Object.assign({ id: "route-inner", chart: "roll", t: roll.t + 0.02 }, base, { route: "inner" }),
          Object.assign({ id: "labels", chart: "roll", t: first.t + 0.01 }, base, { labels: true }),
        ];
        window.startEngine(payloads.tempo, { mode: "preview-render" });
        const tempoEvents = window.taikoAnim.state.events;
        const fast = tempoEvents.filter((e) => e.t > tempoEvents[0].t + 1);
        const tFast = (fast[0] || tempoEvents[0]).t;
        specs.push(Object.assign({ id: "bpm-on", chart: "tempo", t: tFast }, base));
        specs.push(Object.assign({ id: "bpm-off", chart: "tempo", t: tFast }, base, { showTempo: false }));
        return specs;
      }, { roll: charts.roll, tempo: charts.tempo });

      const handsPages = [
        { hands: "img", query: "export=1&loop=0", page: null },
        { hands: "vector", query: "export=1&loop=0&hands=vector" },
        { hands: "none", query: "export=1&loop=0&hands=none" },
      ];
      const saved = [];
      for (const group of handsPages) {
        const p = group.page || await openPage(group.query);
        const specs = group.hands === "img"
          ? cases
          : [Object.assign({}, cases.find((c) => c.id === "roll"), { id: "roll-" + group.hands, hands: group.hands })];
        for (const spec of specs) {
          const payload = spec.chart === "tempo" ? charts.tempo : charts.roll;
          const frame = await p.evaluate((payload, spec) => window.__previewPaint(payload, spec), payload, spec);
          saved.push(Object.assign({ id: spec.id, hands: group.hands, chart: spec.chart }, frame));
        }
        if (group.hands !== "img") await p.close();
        else await p.close();
      }
      fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
      fs.writeFileSync(FIXTURE, JSON.stringify(saved));
      console.log("wrote " + saved.length + " frames to " + path.relative(ROOT, FIXTURE));
      return;
    }

    assert.ok(fs.existsSync(FIXTURE), "缺少 tests/fixtures/preview-render.json，先 WRITE_FIXTURE=1 生成");
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

    const imgPage = await openPage("export=1&loop=0");
    let passed = 0;
    function check(name) {
      passed += 1;
      console.log("  ✓ " + name);
    }

    await imgPage.evaluate((payload) => {
      window.startEngine(payload, { mode: "preview-render" });
      window.taikoAnim.setPlaying(false);
      const first = window.taikoAnim.state.events[0];
      window.renderAt(first.t);
    }, charts.plain);

    const paused = await imgPage.evaluate(async () => {
      const chart = document.getElementById("chart");
      const dyn = document.getElementById("dynamic");
      const img = document.querySelector("#hand-R image");
      const htmlBefore = chart.innerHTML;
      const proto = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
      const counts = { chart: 0, dynamic: 0, "hand-R": 0, "hand-L": 0, "stick-R": 0, "stick-L": 0 };
      Object.defineProperty(Element.prototype, "innerHTML", {
        configurable: true,
        enumerable: proto.enumerable,
        get() { return proto.get.call(this); },
        set(v) {
          proto.set.call(this, v);
          if (counts[this.id] != null) counts[this.id] += 1;
        },
      });
      const lastTs = window.taikoAnim.state.lastTs;
      await new Promise((r) => setTimeout(r, 450));
      const after = {
        counts: Object.assign({}, counts),
        lastTs: window.taikoAnim.state.lastTs,
        playing: window.taikoAnim.state.playing,
        sameHtml: chart.innerHTML === htmlBefore,
        sameImg: img && img === document.querySelector("#hand-R image"),
        imgAlive: !!document.querySelector("#hand-R image"),
      };
      Object.defineProperty(Element.prototype, "innerHTML", proto);
      return { beforeTs: lastTs, after, chartConnected: !!chart, dynConnected: !!dyn };
    });
    assert.strictEqual(paused.after.playing, false, "测试时不应在播放");
    assert.ok(paused.after.lastTs !== paused.beforeTs, "预览时钟没有在走，暂停测试无效");
    assert.strictEqual(paused.after.counts.chart, 0, "暂停时仍在重写 #chart：" + paused.after.counts.chart);
    assert.strictEqual(paused.after.counts.dynamic, 0, "暂停时仍在重写 #dynamic：" + paused.after.counts.dynamic);
    assert.strictEqual(paused.after.counts["hand-R"], 0, "暂停时仍在重写右手");
    assert.strictEqual(paused.after.counts["hand-L"], 0, "暂停时仍在重写左手");
    assert.strictEqual(paused.after.counts["stick-R"], 0, "暂停时仍在重写右棒");
    assert.strictEqual(paused.after.counts["stick-L"], 0, "暂停时仍在重写左棒");
    assert.strictEqual(paused.after.sameHtml, true, "暂停时谱面 DOM 被换掉了");
    assert.strictEqual(paused.after.sameImg, true, "暂停时手图节点被换掉了");
    check("暂停时空转不再整段重写谱面、棒和手");

    const scrolled = await imgPage.evaluate(async () => {
      const proto = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
      let chartWrites = 0;
      Object.defineProperty(Element.prototype, "innerHTML", {
        configurable: true,
        enumerable: proto.enumerable,
        get() { return proto.get.call(this); },
        set(v) {
          proto.set.call(this, v);
          if (this.id === "chart") chartWrites += 1;
        },
      });
      const before = document.getElementById("chart").innerHTML;
      const input = document.getElementById("scroll");
      input.value = "2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
      const mid = chartWrites;
      const moved = document.getElementById("chart").innerHTML !== before;
      const scroll = window.taikoAnim.state.scroll;
      await new Promise((r) => setTimeout(r, 400));
      const end = chartWrites;
      Object.defineProperty(Element.prototype, "innerHTML", proto);
      input.value = "1";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
      return { mid, end, moved, scroll };
    });
    assert.strictEqual(scrolled.scroll, 2, "流速没有改成 2");
    assert.ok(scrolled.mid >= 1, "暂停时改流速没有重画谱面");
    assert.strictEqual(scrolled.moved, true, "改流速后谱面字符串没变");
    assert.strictEqual(scrolled.end, scrolled.mid, "流速改完后仍在每帧重写谱面：" + scrolled.end + " vs " + scrolled.mid);
    check("暂停时改流速只重画一次，然后停住");

    const playing = await imgPage.evaluate(async (payload) => {
      window.startEngine(payload, { mode: "preview-render" });
      window.taikoAnim.setPlaying(false);
      const first = window.taikoAnim.state.events[0].t;
      window.taikoAnim.seek(Math.max(window.taikoAnim.state.start, first - 0.08));
      const img = document.querySelector("#hand-R image");
      const xform = document.querySelector("#hand-R > g") && document.querySelector("#hand-R > g").getAttribute("transform");
      const chartBefore = document.getElementById("chart").innerHTML;
      const proto = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
      const counts = { chart: 0, dynamic: 0, "hand-R": 0, "hand-L": 0 };
      Object.defineProperty(Element.prototype, "innerHTML", {
        configurable: true,
        enumerable: proto.enumerable,
        get() { return proto.get.call(this); },
        set(v) {
          proto.set.call(this, v);
          if (counts[this.id] != null) counts[this.id] += 1;
        },
      });
      const t0 = window.taikoAnim.state.now;
      window.taikoAnim.setPlaying(true);
      await new Promise((r) => setTimeout(r, 320));
      window.taikoAnim.setPlaying(false);
      const handG = document.querySelector("#hand-R > g");
      const result = {
        counts: Object.assign({}, counts),
        advanced: window.taikoAnim.state.now - t0,
        sameImg: img && img === document.querySelector("#hand-R image"),
        xform: handG ? handG.getAttribute("transform") : "",
        xformBefore: xform,
        chartChanged: document.getElementById("chart").innerHTML !== chartBefore,
        grip: document.getElementById("hand-R") && document.getElementById("hand-R").getAttribute("data-grip"),
      };
      Object.defineProperty(Element.prototype, "innerHTML", proto);
      return result;
    }, charts.plain);
    assert.ok(playing.advanced > 0.12, "播放没有推进时间：" + playing.advanced);
    assert.strictEqual(playing.chartChanged, true, "播放时谱面没有动");
    assert.ok(playing.counts.chart > 0, "播放时谱面应跟着时间更新");
    assert.strictEqual(playing.counts.dynamic, 0, "播放时仍在整段重写 #dynamic：" + playing.counts.dynamic);
    assert.strictEqual(playing.grip, "single", "这段单击谱握法变了，手图保留测试无效：" + playing.grip);
    assert.strictEqual(playing.counts["hand-R"], 0, "播放时右手图层被 innerHTML 换掉");
    assert.strictEqual(playing.counts["hand-L"], 0, "播放时左手图层被 innerHTML 换掉");
    assert.strictEqual(playing.sameImg, true, "播放时手图 <image> 节点没有保留");
    assert.notStrictEqual(playing.xform, playing.xformBefore, "播放时手没有动，保留测试可能停在静止帧");
    check("播放时手图节点保留，谱面和手仍在动");

    const scrub = await imgPage.evaluate(async () => {
      window.taikoAnim.setPlaying(false);
      const events = window.taikoAnim.state.events;
      const t0 = events[0].t;
      const t1 = events[Math.min(events.length - 1, 4)].t;
      window.renderAt(t0);
      const img = document.querySelector("#hand-R image");
      const before = document.getElementById("chart").innerHTML;
      const proto = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
      let chartWrites = 0;
      let dynWrites = 0;
      Object.defineProperty(Element.prototype, "innerHTML", {
        configurable: true,
        enumerable: proto.enumerable,
        get() { return proto.get.call(this); },
        set(v) {
          proto.set.call(this, v);
          if (this.id === "chart") chartWrites += 1;
          if (this.id === "dynamic") dynWrites += 1;
        },
      });
      window.taikoAnim.seek(t1);
      const now = window.taikoAnim.state.now;
      const moved = document.getElementById("chart").innerHTML !== before;
      const sameImg = img && img === document.querySelector("#hand-R image");
      const writesAtSeek = chartWrites;
      const dynAtSeek = dynWrites;
      await new Promise((r) => setTimeout(r, 400));
      const result = {
        now, t1, moved, sameImg,
        writesAtSeek, dynAtSeek,
        writesAfter: chartWrites,
        dynAfter: dynWrites,
      };
      Object.defineProperty(Element.prototype, "innerHTML", proto);
      return result;
    });
    assert.ok(Math.abs(scrub.now - scrub.t1) < 1e-9, "seek 没有立刻改到目标时间");
    assert.strictEqual(scrub.moved, true, "seek 返回时谱面还停在旧时间");
    assert.ok(scrub.writesAtSeek >= 1, "seek 没有同步重画");
    assert.strictEqual(scrub.dynAtSeek, 0, "seek 仍整段重写了 #dynamic");
    assert.strictEqual(scrub.sameImg, true, "seek 换时间时手图节点被拆掉了");
    assert.strictEqual(scrub.writesAfter, scrub.writesAtSeek, "seek 之后暂停仍在重写谱面");
    assert.strictEqual(scrub.dynAfter, 0, "seek 之后仍在重写 #dynamic");
    check("拖进度会立刻换帧，手图保留，随后暂停不再重画");

    const forced = await imgPage.evaluate(() => {
      const t = window.taikoAnim.state.events[1].t;
      window.renderAt(t);
      const want = document.getElementById("chart").innerHTML;
      document.getElementById("chart").innerHTML = "";
      document.getElementById("hand-R").innerHTML = "";
      const again = window.renderAt(t);
      return {
        again,
        restored: document.getElementById("chart").innerHTML === want,
        hand: !!document.querySelector("#hand-R image"),
      };
    });
    assert.ok(forced.restored, "renderAt 同一 t 没有把清掉的谱面画回去");
    assert.strictEqual(forced.hand, true, "renderAt 没有把清掉的手图画回去");
    check("renderAt 同一时间会重新画出被清掉的画面");

    const byHands = new Map();
    for (const row of fixture) {
      const key = row.hands || "img";
      if (!byHands.has(key)) byHands.set(key, []);
      byHands.get(key).push(row);
    }
    const pages = {
      img: imgPage,
      vector: await openPage("export=1&loop=0&hands=vector"),
      none: await openPage("export=1&loop=0&hands=none"),
    };
    for (const [hands, rows] of byHands) {
      const page = pages[hands];
      assert.ok(page, "没有对应手型页面 " + hands);
      for (const row of rows) {
        const payload = row.chart === "tempo" ? charts.tempo : charts.roll;
        const got = await page.evaluate((payload, spec) => {
          const frame = window.__previewPaint(payload, spec);
          if (spec.chart !== "tempo") return frame;
          const now = window.taikoAnim.state.now;
          const events = window.taikoAnim.state.events.filter((e) => !e.both || e.hand === "R");
          const want = [];
          for (const e of events) {
            const age = now - e.t;
            if (age > 0.06) continue;
            let x = window.ScrollTempo.noteX({
              tNote: e.t,
              now: now,
              scroll: spec.scroll,
              showTempo: !!spec.showTempo,
              chartScroll: e.scroll,
              bpm: e.bpm,
              timeline: window.taikoAnim.state.bpmTimeline,
              judgeX: 92,
              basePxPerSec: 600,
            });
            if (age > 0) x = 92;
            if (x < 10 || x > 795) continue;
            want.push(+x.toFixed(1));
          }
          const drawn = [...document.querySelectorAll("#chart circle")].map((el) => +(+el.getAttribute("cx")).toFixed(1));
          frame.scrollOk = want.every((x) => drawn.some((d) => Math.abs(d - x) < 0.15));
          frame.scrollWant = want;
          frame.scrollDrawn = [...new Set(drawn)];
          return frame;
        }, payload, row);
        if (row.chart === "tempo") {
          assert.strictEqual(got.scrollOk, true, row.id + " 音符位置不符合 #SCROLL：" + JSON.stringify(got.scrollDrawn) + " 期望 " + JSON.stringify(got.scrollWant));
        }
        diffSig(row.id + " / " + hands + " 谱面", got.chartSig, row.chartSig);
        diffSig(row.id + " / " + hands + " 动态层", got.dynSig, row.dynSig);
        assert.strictEqual(got.drum, row.drum, row.id + " 鼓的 transform 变了\n现在: " + got.drum + "\n原来: " + row.drum);
        assert.strictEqual(got.hands, hands, row.id + " 手型不对");
      }
    }
    check("renderAt 在流速、倍速、变速、内外刷、标签和手型下与原来的画面一致（" + fixture.length + " 帧）");

    await pages.vector.close();
    await pages.none.close();
    await imgPage.close();
    console.log("preview-render tests: " + passed);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
