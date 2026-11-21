/**
 * Settings ! hints must open next to their buttons, including on the same
 * turn as the click. The popover UA rule is inset:0; margin:auto. Author
 * margin:0 pins an unpositioned hint to the viewport origin, and Chrome
 * queues the toggle event, so placement has to happen in beforetoggle.
 *
 *   node tests/hint-popover.test.js
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

function stripPopovers(fragment) {
  return fragment.replace(/<div\b[^>]*\broute-hint\b[^>]*>[\s\S]*?<\/div>/g, "");
}

function summaryTitle(inner) {
  const span = inner.match(/<span>([^<]+)<\/span>/);
  if (span) return span[1].replace(/\s+/g, "");
  return inner.split("<")[0].replace(/\s+/g, "");
}

function assertFoldStructure(fails) {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const editorAt = html.indexOf('<div class="editor" id="editor"');
  if (editorAt < 0) {
    fails.push("editor block missing");
    return;
  }
  const home = html.slice(0, editorAt);
  const editor = html.slice(editorAt);
  if (html.includes("谱面与设置")) fails.push("old title 谱面与设置 remains");
  if (home.includes('id="settingsAdvanced"') || home.includes("<summary>高级</summary>")) {
    fails.push("homepage 高级 wrapper remains");
  }
  if (!editor.includes('id="editorAdvancedBtn"') || !editor.includes('id="editorRollHint"')) {
    fails.push("editor 高级 or standing roll hint changed");
  }
  if (!editor.includes('data-roll="全2-2"')) fails.push("editor roll control missing 全 2-2");
  const summaries = [...home.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) => summaryTitle(m[1]));
  const want = ["打开谱面", "手顺", "演奏"];
  if (summaries.join("|") !== want.join("|")) fails.push("fold titles " + summaries.join("|"));
  const stackAt = home.indexOf('class="settings-stack"');
  const stack = stackAt >= 0 ? home.slice(stackAt) : "";
  let depth = 0;
  let maxDepth = 0;
  for (const token of stack.matchAll(/<details\b|<\/details>/g)) {
    depth += token[0].startsWith("</") ? -1 : 1;
    if (depth > maxDepth) maxDepth = depth;
  }
  if ((stack.match(/<details\b/g) || []).length !== 3 || maxDepth !== 1) {
    fails.push("expected 3 sibling folds, depth " + maxDepth);
  }
  const standing = stripPopovers(home);
  const moved = [
    "选『滚奏演示』会自动载入配套的手顺 JSON",
    "12 分仍 1-2；16 分三连 2-1；四连 24 分 1-2-1；短于 8 音从第一颗 2-2，8 音及以上才可挪位躲开逆手外刷",
    "单手：轮流打；双手：两棒一起落；当小音符：画小、单手打",
    "覆盖自动手顺，可含滚奏 / 插音 / 金色光圈。格式见 samples/handorder.example.json",
  ];
  for (const line of moved) {
    if (!home.includes(line)) fails.push("missing hint copy: " + line);
    if (standing.includes(line)) fails.push("hint still standing: " + line);
  }
  if (home.includes("批量出片") || home.includes("加入谱面") || home.includes("把当前谱面加入队列")) {
    fails.push("batch queue still on the homepage");
  }
  if (!home.includes("开始渲染") || !home.includes('id="renderStart"')) fails.push("single render button missing");
  const rolls = [...home.matchAll(/id="rollSeg"[\s\S]*?<\/div>/g)][0];
  const rollOrder = rolls ? [...rolls[0].matchAll(/data-roll="([^"]+)"/g)].map((m) => m[1]) : [];
  if (rollOrder.join(",") !== "不滚奏,自动滚奏,24分滚奏,全2-2") {
    fails.push("roll order " + rollOrder.join(","));
  }
  if (home.includes("咕") || editor.includes("咕")) fails.push("typo 咕");
  if (!home.includes("2 咔")) fails.push("chart rules dropped 咔");
}

function assertNear(fails, id, phase, pop, btn) {
  const gap = 10;
  const below = Math.abs(pop.y - (btn.bottom + gap));
  const above = Math.abs(pop.bottom + gap - btn.top);
  const vertical = Math.min(below, above);
  const coversX = pop.x < btn.x + btn.w && pop.x + pop.w > btn.x;
  if (pop.x < 40 || pop.y < 40) {
    fails.push(id + " " + phase + " stuck at viewport origin " + JSON.stringify(pop));
  }
  if (vertical > 1.5) {
    fails.push(id + " " + phase + " not beside button (vertical gap " + vertical.toFixed(1) + ") pop=" + JSON.stringify(pop) + " btn=" + JSON.stringify(btn));
  }
  if (!coversX) {
    fails.push(id + " " + phase + " does not overlap the ! button horizontally");
  }
  if (pop.x < 8 || pop.y < 8 || pop.x + pop.w > 1280 - 8 || pop.y + pop.h > 900 - 8) {
    fails.push(id + " " + phase + " escapes the 1280x900 viewport " + JSON.stringify(pop));
  }
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
  assertFoldStructure(fails);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:" + port + "/index.html", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    const hints = [
      "routeHint", "chartHint", "renderHint", "previewHitsHint", "originalHint",
      "modeHint", "rollHint", "bigNoteHint", "settingsBlankHint", "jsonHint",
    ];
    for (const id of hints) {
      const measured = await page.evaluate((hintId) => {
        const btn = document.getElementById(hintId + "Btn");
        const pop = document.getElementById(hintId);
        let node = btn;
        while (node) {
          if (node.hidden) node.hidden = false;
          node = node.parentElement;
        }
        const fold = btn.closest("details");
        if (fold) fold.open = true;
        if (pop.matches(":popover-open")) pop.hidePopover();
        btn.scrollIntoView({ block: "center", inline: "nearest" });
        btn.click();
        const r = pop.getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        const box = (rect) => ({
          x: rect.x, y: rect.y, w: rect.width, h: rect.height,
          bottom: rect.bottom, top: rect.top,
        });
        return {
          sync: { pop: box(r), btn: box(b), open: pop.matches(":popover-open"), style: pop.getAttribute("style") },
          text: pop.textContent,
        };
      }, id);
      assertNear(fails, id, "sync", measured.sync.pop, measured.sync.btn);
      if (!measured.sync.open) fails.push(id + " did not open on click");
      if (id === "chartHint") {
        if (!measured.text.includes("2 咔")) fails.push("chart hint dropped 咔: " + measured.text);
        if (measured.text.includes("咕")) fails.push("chart hint typo 咕");
      }
      const settled = await page.evaluate((hintId) => {
        const pop = document.getElementById(hintId);
        const btn = document.getElementById(hintId + "Btn");
        const r = pop.getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        const box = (rect) => ({
          x: rect.x, y: rect.y, w: rect.width, h: rect.height,
          bottom: rect.bottom, top: rect.top,
        });
        return { pop: box(r), btn: box(b), open: pop.matches(":popover-open"), style: pop.getAttribute("style") };
      }, id);
      assertNear(fails, id, "settled", settled.pop, settled.btn);
      await page.evaluate((hintId) => {
        const pop = document.getElementById(hintId);
        if (pop.matches(":popover-open")) pop.hidePopover();
      }, id);
    }

    const rollFollows = await page.evaluate(() => {
      document.getElementById("settingsHands").open = true;
      document.querySelector('#rollSeg [data-roll="24分滚奏"]').click();
      const dense = document.querySelector("#rollHint p").textContent;
      document.querySelector('#rollSeg [data-roll="全2-2"]').click();
      const all22 = document.querySelector("#rollHint p").textContent;
      document.querySelector('#rollSeg [data-roll="不滚奏"]').click();
      const flat = document.querySelector("#rollHint p").textContent;
      document.querySelector('#rollSeg [data-roll="自动滚奏"]').click();
      return { dense: dense, all22: all22, flat: flat };
    });
    if (!rollFollows.dense.includes("32 分 2-2")) fails.push("roll hint did not follow 24分滚奏: " + rollFollows.dense);
    if (!rollFollows.all22.includes("都从第一颗起 2-2")) fails.push("roll hint did not follow 全2-2: " + rollFollows.all22);
    if (!rollFollows.flat.includes("全部单打")) fails.push("roll hint did not follow 不滚奏: " + rollFollows.flat);

    const desktopTitles = await page.evaluate(() => {
      document.querySelectorAll(".route-hint").forEach((pop) => {
        if (pop.matches(":popover-open")) pop.hidePopover();
      });
      document.querySelectorAll("details.settings").forEach((el) => { el.open = false; });
      const stack = document.getElementById("settingsStack");
      if (stack) stack.scrollTop = 0;
      window.scrollTo(0, 0);
      return [...document.querySelectorAll(".settings-stack > details > summary")].map((el) => {
        const r = el.getBoundingClientRect();
        const label = el.querySelector("span");
        return {
          title: (label ? label.textContent : el.childNodes[0].textContent).replace(/\s+/g, ""),
          top: r.top,
          bottom: r.bottom,
          height: r.height,
        };
      });
    });
    const desktopWant = ["打开谱面", "手顺", "演奏"];
    if (desktopTitles.map((row) => row.title).join("|") !== desktopWant.join("|")) {
      fails.push("1280 titles " + desktopTitles.map((row) => row.title).join("|"));
    }
    for (const row of desktopTitles) {
      if (row.height < 8 || row.top < 0 || row.bottom > 900) {
        fails.push("1280 fold title not in view " + JSON.stringify(row));
      }
    }

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const mobile = await page.evaluate(() => {
      const titles = [...document.querySelectorAll(".settings-stack > details > summary")].map((el) => {
        const label = el.querySelector("span");
        return (label ? label.textContent : el.childNodes[0].textContent).replace(/\s+/g, "");
      });
      const last = document.getElementById("settingsPlay");
      const before = document.documentElement.scrollTop;
      last.scrollIntoView({ block: "end" });
      const r = last.getBoundingClientRect();
      return {
        titles: titles,
        pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 20,
        inView: r.top >= 0 && r.bottom <= window.innerHeight + 1 && r.height > 8,
        moved: document.documentElement.scrollTop !== before || r.top < window.innerHeight,
      };
    });
    if (mobile.titles.join("|") !== desktopWant.join("|")) fails.push("390 titles " + mobile.titles.join("|"));
    if (!mobile.pageScrolls) fails.push("390 homepage does not scroll");
    if (!mobile.inView) fails.push("390 cannot reach 演奏 " + JSON.stringify(mobile));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  if (fails.length) {
    console.error("FAIL hint popovers\n" + fails.join("\n"));
    process.exit(1);
  }
  console.log("ok: hint popovers anchor to their ! buttons");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
