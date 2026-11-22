/**
 * Public page: three folds, 「开始渲染」 posts the open chart, no batch queue.
 *
 *   node tests/single-render-ui.test.js
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

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
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const BATCH_HARNESS = [
  '<div id="batchHarness" hidden>',
  '<ol id="batchList"></ol>',
  '<button type="button" id="batchAddCurrent">把当前谱面加入队列</button>',
  '<button type="button" id="batchStart">开始队列</button>',
  '<p id="batchStatus"></p>',
  "</div>",
].join("");

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
        if (rel === "/index.html" && url.searchParams.get("batchHarness") === "1") {
          const html = buf.toString("utf8").replace(
            '<script src="js/batch-ui.js"></script>',
            BATCH_HARNESS + '<script src="js/batch-ui.js"></script>'
          );
          res.writeHead(200, { "Content-Type": MIME[".html"] });
          res.end(html);
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function installRenderStub() {
  window.__renderPosts = [];
  window.fetch = function (url, opts) {
    if (String(url).indexOf("/api/batch") >= 0 && opts && opts.method === "POST") {
      window.__renderPosts.push(JSON.parse(opts.body));
      return Promise.resolve({
        ok: true,
        text: function () { return Promise.resolve(JSON.stringify({ id: "t" })); },
      });
    }
    return Promise.resolve({ ok: false, text: function () { return Promise.resolve(""); } });
  };
  window.EventSource = function () {
    const es = this;
    this.close = function () {};
    setTimeout(function () {
      if (es.onmessage) {
        es.onmessage({
          data: JSON.stringify({ done: true, failed: 0, files: [], itemFraction: 1, currentLabel: "当前谱面" }),
        });
      }
    }, 0);
  };
}

function layoutSnapshot() {
  const titles = [...document.querySelectorAll("#settingsStack > details > summary")].map((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      title: el.textContent.replace(/\s+/g, ""),
      x: rect.x,
      w: rect.width,
      h: rect.height,
      display: style.display,
    };
  });
  document.getElementById("settingsPlay").open = true;
  const start = document.getElementById("renderStart");
  const hits = document.getElementById("renderHits").closest("label");
  start.scrollIntoView({ block: "center", inline: "nearest" });
  const sr = start.getBoundingClientRect();
  const hr = hits.getBoundingClientRect();
  const play = document.getElementById("settingsPlay").getBoundingClientRect();
  const standing = document.getElementById("renderStatus").textContent;
  const hint = document.getElementById("renderHint").textContent;
  const pageText = document.body.innerText;
  return {
    titles: titles,
    batch: !!(document.getElementById("settingsBatch") || document.getElementById("batchList") || document.getElementById("batchTja") || document.getElementById("batchAddCurrent") || document.getElementById("batchStart")),
    queueWords: ["批量出片", "加入谱面", "把当前谱面加入队列", "整批"].filter((word) => pageText.includes(word)),
    startInPlay: document.getElementById("settingsPlay").contains(start),
    hitsInPlay: document.getElementById("settingsPlay").contains(hits),
    start: { x: sr.x, y: sr.y, right: sr.right, bottom: sr.bottom, w: sr.width, h: sr.height },
    hits: { x: hr.x, y: hr.y, right: hr.right, bottom: hr.bottom, w: hr.width, h: hr.height },
    playRight: play.right,
    standing: standing,
    serveInHint: hint.includes("node render.js --serve") && hint.includes("GitHub Pages"),
    serveOnPage: (document.getElementById("singleRender").innerText || "").includes("node render.js --serve"),
    vw: window.innerWidth,
    vh: window.innerHeight,
  };
}

(async () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const home = html.slice(0, html.indexOf('id="editor"'));
  const ui = fs.readFileSync(path.join(ROOT, "js", "batch-ui.js"), "utf8");
  assert.ok(!home.includes("batch=1"));
  assert.ok(!ui.includes("batch=1"));
  assert.ok(!fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8").includes("batch=1"));
  assert.ok(home.includes('id="settingsBlankTitle"'), "blank chart title from main was dropped");
  assert.ok(home.includes('id="settingsBlankBpm"'), "blank chart BPM from main was dropped");

  const puppeteer = loadPuppeteer();
  const chrome = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome";
  const { server, port } = await startStaticServer(ROOT);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chrome,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const fails = [];
  try {
    const page = await browser.newPage();
    for (const viewport of [
      { width: 1280, height: 900, name: "1280" },
      { width: 390, height: 844, name: "390" },
    ]) {
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
      await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "networkidle0", timeout: 30000 });
      await page.waitForFunction(() => window.BachiApp && document.getElementById("renderStart"), { timeout: 15000 });
      const box = await page.evaluate(layoutSnapshot);
      if (box.titles.map((row) => row.title).join("|") !== "打开谱面|手顺|演奏") {
        fails.push(viewport.name + " titles " + box.titles.map((row) => row.title).join("|"));
      }
      const left = box.titles.map((row) => Math.round(row.x));
      if (new Set(left).size !== 1) fails.push(viewport.name + " fold titles not aligned " + JSON.stringify(box.titles));
      for (const row of box.titles) {
        if (row.h < 8 || row.display === "none") fails.push(viewport.name + " fold hidden " + JSON.stringify(row));
      }
      if (box.batch) fails.push(viewport.name + " batch controls are in the DOM");
      if (box.queueWords.length) fails.push(viewport.name + " queue copy visible " + box.queueWords.join(","));
      if (!box.startInPlay || !box.hitsInPlay) fails.push(viewport.name + " render controls left 演奏");
      if (box.start.w < 40 || box.start.h < 20) fails.push(viewport.name + " 开始渲染 not laid out " + JSON.stringify(box.start));
      if (box.hits.w < 20 || box.hits.h < 12) fails.push(viewport.name + " 叠打点声 not laid out " + JSON.stringify(box.hits));
      if (box.start.x < 8 || box.start.right > box.vw - 4) fails.push(viewport.name + " 开始渲染 overflows " + JSON.stringify(box.start));
      if (box.start.y < 0 || box.start.bottom > box.vh + 1) fails.push(viewport.name + " 开始渲染 offscreen " + JSON.stringify(box.start));
      if (box.hits.bottom > box.start.y + 1) fails.push(viewport.name + " 叠打点声 overlaps 开始渲染");
      if (box.start.y - box.hits.bottom < 4) fails.push(viewport.name + " 叠打点声 cramped against 开始渲染");
      if (box.start.right > box.playRight + 1) fails.push(viewport.name + " 开始渲染 escapes the fold");
      if (box.standing) fails.push(viewport.name + " standing render status " + box.standing);
      if (!box.serveInHint) fails.push(viewport.name + " serve note missing from the !");
      if (box.serveOnPage) fails.push(viewport.name + " serve note is standing in 出片");
    }

    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => window.BachiApp && window.BachiApp.getTja, { timeout: 15000 });
    await page.evaluate(installRenderStub);
    await page.evaluate(() => {
      document.getElementById("settingsPlay").open = true;
      document.getElementById("tjaInput").value = "   ";
    });
    await page.click("#renderStart");
    const empty = await page.evaluate(() => ({
      posts: window.__renderPosts.length,
      status: document.getElementById("renderStatus").textContent,
    }));
    if (empty.posts !== 0) fails.push("empty chart still posted " + empty.posts);
    if (empty.status !== "当前没有谱面") fails.push("empty status " + empty.status);

    const chart = "TITLE:单首测试\nBPM:120\nOFFSET:0\n#START\n12,\n#END\n";
    await page.evaluate((text) => {
      document.getElementById("tjaInput").value = text;
      document.getElementById("renderHits").checked = false;
    }, chart);
    await page.click("#renderStart");
    await page.waitForFunction(() => window.__renderPosts.length === 1 && !document.getElementById("renderStart").disabled);
    const first = await page.evaluate(() => window.__renderPosts[0]);
    if (!first || first.jobs.length !== 1) fails.push("expected one job, got " + JSON.stringify(first && first.jobs));
    else {
      if (first.jobs[0].tjaText !== chart) fails.push("posted chart was not the open chart");
      if (first.jobs[0].hits !== false) fails.push("hits defaulted on");
      if (first.jobs[0].songBase64) fails.push("song attached without 原曲");
      if (first.jobs[0].name !== "单首测试") fails.push("job name " + first.jobs[0].name);
    }
    await page.evaluate(() => { document.getElementById("renderHits").checked = true; });
    await page.click("#renderStart");
    await page.waitForFunction(() => window.__renderPosts.length === 2 && !document.getElementById("renderStart").disabled);
    const second = await page.evaluate(() => ({
      hits: window.__renderPosts[1].jobs[0].hits,
      preview: document.getElementById("previewHits").checked,
      count: window.__renderPosts[1].jobs.length,
    }));
    if (!second.hits || second.count !== 1) fails.push("render hits did not apply to the one job " + JSON.stringify(second));
    if (!second.preview) fails.push("出片叠打点声 changed the preview switch");

    await page.evaluate(() => { window.TaikoVolume.setVolumes(80, 250); });
    await page.click("#renderStart");
    await page.waitForFunction(() => window.__renderPosts.length === 3 && !document.getElementById("renderStart").disabled);
    const third = await page.evaluate(() => window.__renderPosts[2].jobs[0]);
    if (!third || third.musicVolume !== 80 || third.drumVolume !== 250) {
      fails.push("开始渲染 did not send the editor volumes " + JSON.stringify(third && {
        musicVolume: third.musicVolume,
        drumVolume: third.drumVolume,
      }));
    }
    if (!third || third.hits !== true) fails.push("volume post dropped 叠打点声");
    const playHtml = await page.evaluate(() => document.getElementById("singleRender").innerHTML);
    if (playHtml.includes('type="range"')) fails.push("出片 grew its own volume slider");

    function pageUrl(params) {
      const url = new URL("http://127.0.0.1:" + port + "/");
      Object.keys(params || {}).forEach((key) => {
        if (params[key] != null) url.searchParams.set(key, params[key]);
      });
      return url.toString();
    }

    const multi = [
      "TITLE:多难度",
      "BPM:120",
      "OFFSET:0",
      "COURSE:Easy",
      "#START",
      "2,",
      "#END",
      "COURSE:Normal",
      "#START",
      "1,",
      "#END",
      "COURSE:Hard",
      "#START",
      "12,",
      "#END",
      "COURSE:Oni",
      "#START",
      "1,",
      "#SECTION",
      "#BRANCHSTART r,1,2",
      "#LEVELHOLD",
      "#N",
      "2,",
      "#E",
      "3,",
      "#M",
      "4,",
      "#BRANCHEND",
      "1,",
      "#END",
      "COURSE:Edit",
      "#START",
      "22,",
      "#END",
      "",
    ].join("\n");

    function expectPosted(job, course, branch, where) {
      if (!job) {
        fails.push(where + " missing job");
        return;
      }
      if (job.course !== course) fails.push(where + " course " + JSON.stringify(job.course) + " want " + JSON.stringify(course));
      if (job.branch !== branch) fails.push(where + " branch " + JSON.stringify(job.branch) + " want " + JSON.stringify(branch));
      if (where.indexOf("queued") !== 0 && job.tjaText !== multi && where !== "single 易" && where !== "single unnamed") {
        fails.push(where + " replaced the open chart");
      }
    }

    async function clickCourse(label) {
      const clicked = await page.evaluate((want) => {
        const btn = [...document.querySelectorAll("#coursePicker button")].find((b) => b.textContent === want);
        if (!btn) return false;
        btn.click();
        return true;
      }, label);
      if (!clicked) throw new Error("missing course button " + label);
      await page.waitForFunction((want) => {
        const on = document.querySelector("#coursePicker button.on");
        const raw = window.taikoAnim && window.taikoAnim.raw;
        return on && on.textContent === want && raw && raw.course === on.dataset.course;
      }, { timeout: 8000 }, label);
    }

    async function clickBranch(label) {
      const clicked = await page.evaluate((want) => {
        const btn = [...document.querySelectorAll("#branchPicker button")].find((b) => b.textContent === want);
        if (!btn) return false;
        btn.click();
        return true;
      }, label);
      if (!clicked) throw new Error("missing branch button " + label);
      await page.waitForFunction((want) => {
        const on = document.querySelector("#branchPicker button.on");
        const raw = window.taikoAnim && window.taikoAnim.raw;
        return on && on.textContent === want && raw && raw.branch === on.dataset.branch;
      }, { timeout: 8000 }, label);
    }

    async function clickRender(source) {
      await page.evaluate(() => { document.getElementById("settingsPlay").open = true; });
      const before = await page.evaluate((name) => (window[name] || []).length, source);
      await page.click("#renderStart");
      await page.waitForFunction((name, n) => {
        return window[name] && window[name].length >= n && !document.getElementById("renderStart").disabled;
      }, { timeout: 8000 }, source, before + 1);
    }

    await page.goto(pageUrl({ settings: "1", tja: multi }), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => {
      const on = document.querySelector("#coursePicker button.on");
      const branch = document.querySelector("#branchPicker button.on");
      return on && on.textContent === "鬼" && branch && branch.textContent === "达人"
        && window.BachiApp && typeof window.BachiApp.parseOpts === "function";
    }, { timeout: 8000 });
    await page.evaluate(installRenderStub);
    const pickers = await page.evaluate(() => ({
      course: document.querySelectorAll("#coursePicker").length,
      inPlay: !!document.getElementById("settingsPlay").querySelector("#coursePicker, #branchPicker"),
    }));
    if (pickers.course !== 1 || pickers.inPlay) fails.push("render grew a second difficulty picker " + JSON.stringify(pickers));

    await clickRender("__renderPosts");
    let job = await page.evaluate(() => window.__renderPosts[0].jobs[0]);
    expectPosted(job, "Oni", "M", "default 鬼/达人");

    await clickCourse("里");
    await clickRender("__renderPosts");
    job = await page.evaluate(() => window.__renderPosts[1].jobs[0]);
    expectPosted(job, "Edit", null, "里");

    await clickCourse("易");
    await clickRender("__renderPosts");
    job = await page.evaluate(() => window.__renderPosts[2].jobs[0]);
    expectPosted(job, "Easy", null, "易");

    await clickCourse("普");
    await clickRender("__renderPosts");
    job = await page.evaluate(() => window.__renderPosts[3].jobs[0]);
    expectPosted(job, "Normal", null, "普");

    await clickCourse("难");
    await clickRender("__renderPosts");
    job = await page.evaluate(() => window.__renderPosts[4].jobs[0]);
    expectPosted(job, "Hard", null, "难");

    await clickCourse("鬼");
    await clickBranch("普通");
    await clickRender("__renderPosts");
    job = await page.evaluate(() => window.__renderPosts[5].jobs[0]);
    expectPosted(job, "Oni", "N", "鬼/普通");

    await clickBranch("玄人");
    await page.evaluate(() => {
      window.__desktopPosts = [];
      window.bachiDesktop = {
        startBatch: function (payload) {
          window.__desktopPosts.push(payload);
          return Promise.resolve({ id: "desk" });
        },
        onBatchEvent: function (cb) {
          setTimeout(function () {
            cb({ id: "desk", done: true, failed: 0, files: [], itemFraction: 1, currentLabel: "当前谱面" });
          }, 0);
          return function () {};
        },
      };
    });
    await clickRender("__desktopPosts");
    const desktopJob = await page.evaluate(() => window.__desktopPosts[0].jobs[0]);
    expectPosted(desktopJob, "Oni", "E", "desktop 鬼/玄人");
    const webCount = await page.evaluate(() => window.__renderPosts.length);
    if (webCount !== 6) fails.push("desktop path also posted to /api/batch " + webCount);

    const onlyEasy = [
      "TITLE:只有易",
      "BPM:120",
      "OFFSET:0",
      "COURSE:Easy",
      "#START",
      "2,",
      "#END",
      "",
    ].join("\n");
    await page.goto(pageUrl({ settings: "1", tja: onlyEasy }), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll("#coursePicker button")];
      return buttons.length === 1 && buttons[0].textContent === "易" && buttons[0].classList.contains("on")
        && document.getElementById("branchPicker").hidden;
    }, { timeout: 8000 });
    await page.evaluate(installRenderStub);
    await clickRender("__renderPosts");
    job = await page.evaluate(() => window.__renderPosts[0].jobs[0]);
    expectPosted(job, "Easy", null, "single 易");
    if (job && job.tjaText !== onlyEasy) fails.push("single 易 replaced the open chart");

    const bare = "TITLE:单段\nBPM:120\nOFFSET:0\n#START\n12,\n#END\n";
    await page.goto(pageUrl({ settings: "1", tja: bare }), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => {
      const on = document.querySelector("#coursePicker button.on");
      return on && window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.events
        && window.taikoAnim.raw.events.length === 2;
    }, { timeout: 8000 });
    await page.evaluate(installRenderStub);
    await clickRender("__renderPosts");
    job = await page.evaluate(() => window.__renderPosts[0].jobs[0]);
    expectPosted(job, null, null, "single unnamed");
    if (job && job.tjaText !== bare) fails.push("single unnamed replaced the open chart");

    await page.goto(pageUrl({ settings: "1", tja: multi, batchHarness: "1" }), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => {
      const on = document.querySelector("#coursePicker button.on");
      return on && on.textContent === "鬼" && document.getElementById("batchAddCurrent") && document.getElementById("batchStart");
    }, { timeout: 8000 });
    await page.evaluate(installRenderStub);
    await clickBranch("玄人");
    await page.evaluate(() => document.getElementById("batchAddCurrent").click());
    await clickCourse("里");
    await page.evaluate(() => document.getElementById("batchAddCurrent").click());
    await page.evaluate(() => document.getElementById("batchStart").click());
    await page.waitForFunction(() => window.__renderPosts.length === 1 && !document.getElementById("batchStart").disabled, { timeout: 8000 });
    const queued = await page.evaluate(() => window.__renderPosts[0].jobs.map((row) => ({
      course: row.course,
      branch: row.branch,
      tjaText: row.tjaText,
    })));
    if (!queued || queued.length !== 2) fails.push("queue jobs " + JSON.stringify(queued && queued.length));
    else {
      expectPosted(queued[0], "Oni", "E", "queued 鬼/玄人");
      expectPosted(queued[1], "Edit", null, "queued 里");
      if (queued[0].tjaText !== multi || queued[1].tjaText !== multi) fails.push("queue replaced the open chart");
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  if (fails.length) {
    console.error("FAIL single render\n" + fails.join("\n"));
    process.exit(1);
  }
  console.log("ok: public page renders the open chart and hides the batch queue");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
