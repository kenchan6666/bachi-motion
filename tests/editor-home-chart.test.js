/**
 * 手顺编辑里打开 TJA 后，回到主页时「谱面」要改成「自定义…」，
 * 谱面框换成这份谱，不要还停在练习谱 2。
 * 主页自己打开 TJA 再进出编辑器，两边仍是同一份。
 * 空谱面仍是空谱：歌名、BPM、小节出现，难度收起。
 * 谱面里的 2 是咔。对照不进仓库。
 *
 *   node tests/editor-home-chart.test.js
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));
const CUSTOM = "自定义…";

function tja(title, notes) {
  return [
    "TITLE:" + title,
    "BPM:128",
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
    const file = path.join(os.tmpdir(), "bachi-home-chart-" + name);
    fs.writeFileSync(file, contents);
    tmpFiles.push(file);
    const input = await page.$(selector);
    await input.uploadFile(file);
  }

  async function readHome(page) {
    return page.evaluate(() => {
      const selected = document.querySelector("#chartMenu [aria-selected='true']");
      const on = document.querySelector("#coursePicker button.on");
      return {
        label: document.getElementById("chartLabel").textContent,
        selected: selected ? selected.dataset.chart : "",
        tja: document.getElementById("tjaInput").value,
        courseHidden: document.getElementById("coursePicker").hidden,
        courseOn: on ? on.textContent : "",
        blankHidden: document.getElementById("settingsBlankFields").hidden,
        editorBlankHidden: document.getElementById("editorBlankFields").hidden,
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

  try {
    const page = await browser.newPage();
    page.on("pageerror", (err) => fails.push("pageerror: " + err.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    const editorChart = tja("编辑器打开的谱", "12");
    const homeChart = tja("主页打开的谱", "21");

    await page.goto("http://127.0.0.1:" + port + "/?settings=1", { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => {
      return document.getElementById("chartLabel").textContent === "练习谱2"
        && document.getElementById("tjaInput").value.includes("TITLE:溯溯的练习谱2")
        && document.getElementById("coursePicker").hidden
        && document.getElementById("settingsBlankFields").hidden;
    }, { timeout: 8000 });

    await openEditor(page);
    await upload(page, "#editorTjaFile", "editor.tja", editorChart);
    await page.waitForFunction(() => document.getElementById("tjaInput").value.includes("TITLE:编辑器打开的谱"), { timeout: 8000 });
    await backHome(page);
    let home = await readHome(page);
    check(home.label === CUSTOM, "编辑器打开 TJA 后谱面仍是「" + home.label + "」");
    check(home.selected === "custom", "谱面选中项是 " + home.selected);
    check(home.tja.includes("TITLE:编辑器打开的谱"), "谱面框没有换成编辑器打开的谱");
    check(!home.tja.includes("溯溯的练习谱2"), "谱面框还停在练习谱 2");
    check(home.tja.includes("12"), "谱面框里的 2（咔）丢了");
    check(!home.courseHidden && home.courseOn === "鬼", "普通 TJA 回到主页后难度没有出现");
    check(home.blankHidden && home.editorBlankHidden, "普通 TJA 不该露出空谱的歌名、BPM、小节");

    await page.goto("http://127.0.0.1:" + port + "/?settings=1", { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => document.getElementById("chartLabel").textContent === "练习谱2", { timeout: 8000 });
    await upload(page, "#tjaFile", "home.tja", homeChart);
    await page.waitForFunction(() => {
      return document.getElementById("chartLabel").textContent === "自定义…"
        && document.getElementById("tjaInput").value.includes("TITLE:主页打开的谱");
    }, { timeout: 8000 });
    const before = await readHome(page);
    await openEditor(page);
    await backHome(page);
    home = await readHome(page);
    check(home.label === CUSTOM && home.selected === "custom", "主页打开后再进出编辑器，谱面变成「" + home.label + "」");
    check(home.tja === before.tja, "主页打开的谱进出编辑器后文本变了");
    check(home.tja.includes("TITLE:主页打开的谱") && !home.tja.includes("溯溯的练习谱2"), "进出编辑器后又回到练习谱 2");
    check(!home.courseHidden && home.courseOn === "鬼" && home.blankHidden, "主页打开的普通 TJA 进出编辑器后不像已打开");

    await page.goto("http://127.0.0.1:" + port + "/?settings=1", { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => document.getElementById("chartLabel").textContent === "练习谱2", { timeout: 8000 });
    await openEditor(page);
    await page.evaluate(() => document.getElementById("editorOpenBlank").click());
    await page.waitForFunction(() => {
      const text = document.getElementById("tjaInput").value;
      return text.includes("TITLE:未命名") && !text.includes("溯溯的练习谱2");
    }, { timeout: 8000 });
    await backHome(page);
    home = await readHome(page);
    check(home.label === CUSTOM && home.selected === "custom", "空谱面后谱面仍是「" + home.label + "」");
    check(home.tja.includes("TITLE:未命名") && !home.tja.includes("溯溯的练习谱2"), "空谱面被练习谱 2 盖住了");
    check(home.courseHidden, "空谱面不该列出难度");
    check(!home.blankHidden && !home.editorBlankHidden, "空谱面的歌名、BPM、小节被收起了");
  } catch (err) {
    fails.push(err && err.stack ? err.stack : String(err));
  } finally {
    tmpFiles.forEach((file) => { try { fs.unlinkSync(file); } catch (e) { /* already gone */ } });
    await browser.close();
    server.close();
  }

  if (fails.length) {
    console.error("FAIL editor home chart\n- " + fails.join("\n- "));
    process.exit(1);
  }
  console.log("editor home chart ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
