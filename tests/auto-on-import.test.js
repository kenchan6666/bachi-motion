/**
 * 导入、粘贴或换一首之后，手顺直接是生成器的全自动结果，
 * 停在「自动+微调」，可以接着改，不必再手动点一次「纯自动」。
 * 已经导入的自定义手顺不会被生成器改写。
 *
 *   node tests/auto-on-import.test.js
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));

function tja(title, notes) {
  return [
    "TITLE:" + title,
    "BPM:120",
    "OFFSET:0",
    "COURSE:Oni",
    "LEVEL:2",
    "",
    "#START",
    notes + ",",
    "#END",
    "",
  ].join("\n");
}

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
  const tmpFiles = [];
  function check(cond, msg) {
    if (!cond) fails.push(msg);
  }

  async function upload(page, selector, name, contents) {
    const file = path.join(os.tmpdir(), "bachi-auto-import-" + name);
    fs.writeFileSync(file, contents);
    tmpFiles.push(file);
    const input = await page.$(selector);
    await input.uploadFile(file);
  }

  async function readStick(page) {
    return page.evaluate(() => {
      const st = window.BachiEditor.getState();
      const ev = (window.taikoAnim && window.taikoAnim.state && window.taikoAnim.state.events) || [];
      const btn = document.querySelector("#editorModeSeg button.on");
      const opts = window.BachiApp.parseOpts();
      const text = document.getElementById("tjaInput").value;
      const json = document.getElementById("jsonInput").value;
      let auto = "";
      let custom = "";
      try {
        auto = window.TaikoParser.eventsFromTja(text, opts).events
          .map((e) => e.hand + ":" + e.grip).join(",");
      } catch (err) { auto = "ERR " + err.message; }
      if (json.trim()) {
        try {
          custom = window.TaikoParser.chartFromTjaAndHands(text, json, opts).events
            .map((e) => e.hand + ":" + e.grip).join(",");
        } catch (err) { custom = "ERR " + err.message; }
      }
      return {
        mode: st && st.mode,
        btn: btn ? btn.textContent : "",
        readonly: document.getElementById("editor").classList.contains("is-readonly"),
        patches: st && st.session && st.session.patches ? st.session.patches.length : null,
        source: st && st.session ? st.session.source : "",
        live: ev.map((e) => e.hand + ":" + e.grip).join(","),
        auto: auto,
        custom: custom,
        status: document.getElementById("editorStatusText").textContent,
        appMode: window.BachiApp.currentMode(),
        json: json,
        title: document.getElementById("tjaInput").value.split("\n")[0],
      };
    });
  }

  async function openEditor(page) {
    await page.click("#btnOpenEditor");
    await page.waitForFunction(() => document.body.classList.contains("editor-mode"), { timeout: 8000 });
  }

  async function backHome(page) {
    await page.click("#btnBackPlayer");
    await page.waitForFunction(() => !document.body.classList.contains("editor-mode"), { timeout: 8000 });
  }

  async function tweakFirstNote(page) {
    await page.evaluate(() => window.BachiEditor.selectNote(0));
    await page.waitForSelector("#editorSwapPop:not([hidden])", { timeout: 4000 });
    await page.click('#editorSwapPop [data-ed-swap="L"]');
    await page.waitForFunction(() => {
      const st = window.BachiEditor.getState();
      return st && st.session && st.session.patches && st.session.patches.length > 0;
    }, { timeout: 4000 });
  }

  const imported = tja("导入的谱", "11111111");
  const pasted = tja("粘贴的谱", "1111");
  const customChart = tja("自定义手顺谱", "12");
  const customJson = JSON.stringify({
    events: [
      { t: 0, hand: "L", face: "don", grip: "single", src: "1:0" },
      { t: 1, hand: "L", face: "ka", grip: "single", src: "1:1" },
    ],
  });

  try {
    const page = await browser.newPage();
    page.on("pageerror", (err) => fails.push("pageerror: " + err.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:" + port + "/?settings=1", { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => window.BachiApp && window.BachiEditor && window.taikoAnim && window.taikoAnim.state, { timeout: 15000 });

    await openEditor(page);
    await tweakFirstNote(page);
    let stick = await readStick(page);
    check(stick.patches === 1 && stick.mode === "tweak", "微调没有记在自动+微调里 " + JSON.stringify(stick));
    const tweaked = stick.live;

    await upload(page, "#tjaFile", "home.tja", imported);
    await page.waitForFunction(() => document.getElementById("tjaInput").value.includes("TITLE:导入的谱"), { timeout: 8000 });
    stick = await readStick(page);
    check(stick.mode === "tweak" && stick.btn === "自动+微调" && !stick.readonly,
      "主页导入后应停在可微调的全自动，得到 " + stick.mode + " / " + stick.btn + " readonly=" + stick.readonly);
    check(stick.patches === 0 && stick.status === "已自动生成",
      "主页导入后还留着上一首的微调 " + stick.patches + " " + stick.status);
    check(stick.live === stick.auto && stick.live !== tweaked,
      "主页导入后手顺不是新谱的全自动\n live " + stick.live + "\n auto " + stick.auto);
    check(stick.appMode === "zhuren" && stick.json === "", "主页导入后还停在自定义手顺");

    await tweakFirstNote(page);
    stick = await readStick(page);
    check(stick.patches === 1 && stick.status === "已微调" && stick.live !== stick.auto && !stick.readonly,
      "导入后的全自动不能手动微调 " + JSON.stringify({ patches: stick.patches, status: stick.status, live: stick.live, auto: stick.auto }));

    await page.evaluate(() => document.getElementById("btnGenerate").click());
    stick = await readStick(page);
    check(stick.patches === 1 && stick.live !== stick.auto,
      "同一首再点生成，把刚做的微调清掉了 " + stick.live);

    const titleKept = await page.evaluate(() => {
      const el = document.getElementById("tjaInput");
      el.value = el.value.replace("TITLE:导入的谱", "TITLE:导入的谱改名");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    });
    check(titleKept, "改名输入没有发出");
    await page.waitForFunction(() => document.getElementById("tjaInput").value.includes("TITLE:导入的谱改名"), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 400));
    stick = await readStick(page);
    check(stick.patches === 1 && stick.live !== stick.auto,
      "只改歌名就把微调清成全自动了 " + stick.live);

    await page.click('#editorModeSeg [data-ed-mode="auto"]');
    stick = await readStick(page);
    check(stick.mode === "auto" && stick.readonly && stick.live === stick.auto,
      "纯自动按钮不再锁住并重算 " + stick.mode + " " + stick.live);

    await upload(page, "#editorTjaFile", "editor.tja", pasted);
    await page.waitForFunction(() => document.getElementById("tjaInput").value.includes("TITLE:粘贴的谱"), { timeout: 8000 });
    stick = await readStick(page);
    check(stick.mode === "tweak" && !stick.readonly && stick.btn === "自动+微调",
      "编辑器打开 TJA 后不能微调 " + stick.mode + " " + stick.btn);
    check(stick.patches === 0 && stick.live === stick.auto,
      "编辑器打开 TJA 后手顺不是全自动\n live " + stick.live + "\n auto " + stick.auto);

    const beforePaste = stick.live;
    await page.evaluate((text) => {
      const el = document.getElementById("tjaInput");
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, imported);
    await page.waitForFunction((prev) => {
      const st = window.BachiEditor.getState();
      const ev = window.taikoAnim.state.events.map((e) => e.hand + ":" + e.grip).join(",");
      const auto = window.TaikoParser.eventsFromTja(document.getElementById("tjaInput").value, window.BachiApp.parseOpts())
        .events.map((e) => e.hand + ":" + e.grip).join(",");
      return document.getElementById("tjaInput").value.includes("TITLE:导入的谱")
        && st.mode === "tweak"
        && ev === auto
        && ev !== prev;
    }, { timeout: 4000 }, beforePaste);
    stick = await readStick(page);
    check(stick.patches === 0 && stick.live === stick.auto && !stick.readonly,
      "粘贴后没有自动进入可微调的全自动\n live " + stick.live + "\n auto " + stick.auto + " mode " + stick.mode);

    await backHome(page);
    await page.click("#chartBtn");
    await page.click('#chartMenu [data-chart="suyue_demo"]');
    await page.waitForFunction(() => {
      const raw = window.taikoAnim && window.taikoAnim.raw;
      return raw && raw.song && raw.song.indexOf("练习谱2") < 0 && document.getElementById("tjaInput").value.includes("TITLE:");
    }, { timeout: 8000 });
    await openEditor(page);
    stick = await readStick(page);
    check(stick.mode === "tweak" && !stick.readonly && stick.patches === 0 && stick.live === stick.auto,
      "换示例谱后还要再点纯自动\n live " + stick.live + "\n auto " + stick.auto + " mode " + stick.mode);
    await backHome(page);

    await page.click("#chartBtn");
    await page.click('#chartMenu [data-chart="suyue_roll_demo"]');
    await page.waitForFunction(() => {
      return document.getElementById("jsonInput").value.includes('"hand"')
        && document.getElementById("modeSuyue").classList.contains("on");
    }, { timeout: 8000 });
    await openEditor(page);
    stick = await readStick(page);
    check(stick.mode === "custom" && stick.readonly && stick.appMode === "suyue",
      "滚奏演示的自定义手顺没有载入 " + stick.mode + " " + stick.appMode);
    check(stick.live === stick.custom && stick.live !== stick.auto,
      "滚奏演示被生成器改写\n live " + stick.live.slice(0, 80) + "\n json " + stick.custom.slice(0, 80) + "\n auto " + stick.auto.slice(0, 80));
    await page.select("#techniqueSelect", "炒菜");
    await page.evaluate(() => document.getElementById("btnGenerate").click());
    stick = await readStick(page);
    check(stick.mode === "custom" && stick.live === stick.custom && stick.live !== stick.auto,
      "改手法或再生成时，自定义手顺被改写 " + stick.mode + " " + stick.live.slice(0, 40));
    await backHome(page);

    await upload(page, "#tjaFile", "custom-chart.tja", customChart);
    await page.waitForFunction(() => document.getElementById("tjaInput").value.includes("TITLE:自定义手顺谱"), { timeout: 8000 });
    await upload(page, "#jsonFile", "hands.json", customJson);
    await page.waitForFunction(() => document.getElementById("modeSuyue").classList.contains("on") && document.getElementById("jsonInput").value.includes('"hand":"L"'), { timeout: 8000 });
    await openEditor(page);
    stick = await readStick(page);
    check(stick.mode === "custom" && stick.live === "L:single,L:single" && stick.live !== stick.auto,
      "导入的自定义手顺没有原样播放 " + stick.live + " auto " + stick.auto);
    await page.select("#techniqueSelect", "半换A");
    await page.evaluate(() => document.getElementById("btnGenerate").click());
    stick = await readStick(page);
    check(stick.live === "L:single,L:single" && stick.mode === "custom",
      "再生成后自定义手顺变了 " + stick.live + " " + stick.mode);

    await upload(page, "#tjaFile", "after-custom.tja", imported);
    await page.waitForFunction(() => document.getElementById("tjaInput").value.includes("TITLE:导入的谱") && document.getElementById("jsonInput").value === "", { timeout: 8000 });
    stick = await readStick(page);
    check(stick.mode === "tweak" && !stick.readonly && stick.json === "" && stick.live === stick.auto && stick.live !== "L:single,L:single",
      "换一首后还留着上一份自定义手顺\n live " + stick.live + "\n auto " + stick.auto + " mode " + stick.mode);
  } catch (err) {
    fails.push(err && err.stack ? err.stack : String(err));
  } finally {
    tmpFiles.forEach((file) => { try { fs.unlinkSync(file); } catch (e) { /* already gone */ } });
    await browser.close();
    server.close();
  }

  if (fails.length) {
    console.error("FAIL auto on import\n- " + fails.join("\n- "));
    process.exit(1);
  }
  console.log("auto on import ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
