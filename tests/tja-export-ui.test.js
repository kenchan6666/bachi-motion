/**
 * 导出 TJA sits under the chart-track legend and uses the 导出 JSON button.
 *   node tests/tja-export-ui.test.js
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));

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
  function check(cond, msg) {
    if (!cond) fails.push(msg);
  }
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:" + port + "/index.html", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await page.click("#btnOpenEditor");
    await page.waitForSelector("#editorExportTja", { visible: true });
    await page.waitForFunction(() => !document.getElementById("editorExportTja").disabled);

    async function layout() {
      return page.evaluate(() => {
        const btn = document.getElementById("editorExportTja");
        const json = document.getElementById("editorExportJson");
        const legend = document.querySelector(".editor-chart-legend");
        const card = document.querySelector(".editor-chart-card");
        const fold = document.getElementById("settingsOpen");
        const br = btn.getBoundingClientRect();
        const lr = legend.getBoundingClientRect();
        const cr = card.getBoundingClientRect();
        const btnStyle = styleOf(btn);
        const jsonStyle = styleOf(json);
        return {
          label: btn.textContent.trim(),
          jsonLabel: json.textContent.trim(),
          className: btn.className,
          jsonClass: json.className,
          disabled: btn.disabled,
          inCard: card.contains(btn),
          inFold: fold.contains(btn),
          below: br.top >= lr.bottom - 1,
          gap: br.top - lr.bottom,
          left: br.left,
          right: br.right,
          cardLeft: cr.left,
          cardRight: cr.right,
          width: br.width,
          height: br.height,
          sameStyle: JSON.stringify(btnStyle) === JSON.stringify(jsonStyle),
          btnStyle: btnStyle,
          jsonStyle: jsonStyle,
          foldText: fold.textContent.includes("导出 TJA"),
        };
        function styleOf(el) {
          const cs = getComputedStyle(el);
          return {
            fontSize: cs.fontSize,
            fontWeight: cs.fontWeight,
            borderRadius: cs.borderRadius,
            padding: cs.padding,
            borderWidth: cs.borderTopWidth,
            borderStyle: cs.borderTopStyle,
            backgroundColor: cs.backgroundColor,
            color: cs.color,
          };
        }
      });
    }

    const desktop = await layout();
    check(desktop.label === "导出 TJA", "label " + desktop.label);
    check(desktop.jsonLabel === "导出 JSON", "json label " + desktop.jsonLabel);
    check(desktop.className === "file-btn" && desktop.className === desktop.jsonClass, "class " + desktop.className + " vs " + desktop.jsonClass);
    check(desktop.sameStyle, "style differs from 导出 JSON " + JSON.stringify(desktop.btnStyle) + " vs " + JSON.stringify(desktop.jsonStyle));
    check(desktop.inCard && !desktop.inFold, "button is not on the chart track");
    check(!desktop.foldText, "导出 TJA landed in 打开谱面");
    check(desktop.disabled === false, "open chart left the button disabled");
    check(desktop.below, "button is not below the legend, gap " + desktop.gap);
    check(desktop.gap >= -1 && desktop.gap <= 24, "gap " + desktop.gap);
    check(desktop.width > 40 && desktop.height > 20, "button has no size");
    check(desktop.left >= desktop.cardLeft - 1 && desktop.right <= desktop.cardRight + 1, "desktop button overflows the track");

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.evaluate(() => {
      document.getElementById("editorExportTja").scrollIntoView({ block: "center", inline: "nearest" });
    });
    const narrow = await layout();
    check(narrow.below, "narrow button is not below the legend, gap " + narrow.gap);
    check(narrow.width > 40 && narrow.height > 20, "narrow button has no size");
    check(narrow.left >= narrow.cardLeft - 1 && narrow.right <= narrow.cardRight + 1, "narrow button overflows the track");
    check(narrow.disabled === false, "narrow button disabled");

    await page.evaluate(() => {
      window.BachiApp.setTja("TITLE:x\n");
    });
    const disabled = await page.$eval("#editorExportTja", (el) => el.disabled);
    check(disabled === true, "broken chart still exports");

    const typos = await page.evaluate(() => document.body.textContent);
    check(!typos.includes("咕"), "page contains 咕");
    check(!typos.includes("亮橙"), "page contains 亮橙");
  } finally {
    await browser.close();
    server.close();
  }
  if (fails.length) {
    console.error(fails.join("\n"));
    process.exit(1);
  }
  console.log("tja export ui ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
