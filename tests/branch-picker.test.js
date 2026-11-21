/**
 * 谱面分歧：同一难度里的 #BRANCHSTART / #N / #E / #M。
 * 三条路占同一段时间，只播放选中的那一条。
 * 选了难度之后，这个难度有分歧才在下面给出普通、玄人、达人。
 *
 *   node tests/branch-picker.test.js
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));
const parser = require(path.join(ROOT, "js", "parser.js"));
const jobs = require(path.join(ROOT, "js", "render-jobs.js"));
const batchUi = require(path.join(ROOT, "js", "batch-ui.js"));

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function assertEqual(got, want, msg) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) throw new Error(msg + "\n  got  " + a + "\n  want " + b);
}

function simpleBranch(extra) {
  return [
    "TITLE:branch",
    "BPM:120",
    "OFFSET:0",
    "COURSE:Oni",
    "#START",
    "1,",
    "#BRANCHSTART r,1,2",
    "#N",
    "2,",
    "#E",
    "3,",
    "#M",
    extra || "4,",
    "#BRANCHEND",
    "1,",
    "#END",
    "",
  ].join("\n");
}

function taken(tja, branch) {
  const parsed = parser.parseTja(tja, branch == null ? undefined : { branch: branch });
  let course = parsed.courses[0];
  try { course = parser.pickCourse(parsed, "Oni"); } catch (err) { /* single unnamed course */ }
  return {
    hasBranch: !!course.hasBranch,
    branchIds: course.branchIds || [],
    branch: course.branch || "",
    measureCount: course.measures.length,
    duration: round(course.duration),
    notes: course.notes.map((n) => ({
      t: round(n.t),
      type: n.type,
      measure: n.measure,
      bpm: n.bpm,
    })),
  };
}

function runParserCases() {
  if (typeof parser.branchCanon !== "function") throw new Error("parser.branchCanon missing");
  if (typeof parser.listBranches !== "function") throw new Error("parser.listBranches missing");
  assertEqual(parser.branchCanon("N"), "N", "N");
  assertEqual(parser.branchCanon("e"), "E", "e");
  assertEqual(parser.branchCanon("master"), "M", "master");
  assertEqual(parser.branchCanon("普通"), "N", "普通");
  assertEqual(parser.branchCanon("玄人"), "E", "玄人");
  assertEqual(parser.branchCanon("达人"), "M", "达人");
  assertEqual(parser.branchCanon("達人"), "M", "達人");
  assertEqual(parser.branchCanon("Expert"), "E", "Expert");
  assertEqual(parser.branchCanon("normal"), "N", "normal");
  assertEqual(parser.branchCanon(""), "", "empty branch is not a path");
  assertEqual(parser.branchCanon("鬼"), "", "difficulty name is not a branch");

  const plain = ["TITLE:plain", "BPM:120", "OFFSET:0", "#START", "1,", "#N", "2,", "#END", ""].join("\n");
  const plainCourse = parser.parseTja(plain).courses[0];
  assertEqual(!!plainCourse.hasBranch, false, "#N outside #BRANCHSTART is not a branch");
  assertEqual(parser.listBranches(plainCourse), [], "no branch list");
  assertEqual(plainCourse.notes.map((n) => n.type), ["don", "ka"], "#N outside a branch does not drop the next note");

  const chart = simpleBranch();
  const master = taken(chart);
  assertEqual(master.hasBranch, true, "BRANCHSTART marks the course");
  assertEqual(master.branchIds, ["N", "E", "M"], "branch ids");
  assertEqual(master.branch, "M", "default path is 达人");
  assertEqual(parser.listBranches(parser.pickCourse(parser.parseTja(chart), "Oni")), [
    { id: "N", label: "普通" },
    { id: "E", label: "玄人" },
    { id: "M", label: "达人" },
  ], "three choices even when listing");
  assertEqual(master.measureCount, 3, "three branches share one measure, plus head and tail");
  assertEqual(master.duration, 6, "unselected branches do not extend the chart");
  assertEqual(master.notes, [
    { t: 0, type: "don", measure: 1, bpm: 120 },
    { t: 2, type: "bigka", measure: 2, bpm: 120 },
    { t: 4, type: "don", measure: 3, bpm: 120 },
  ], "default plays 达人, not all three paths in a row");

  assertEqual(taken(chart, "N").notes.map((n) => n.type), ["don", "ka", "don"], "普通");
  assertEqual(taken(chart, "普通").notes.map((n) => n.type), ["don", "ka", "don"], "普通 alias");
  assertEqual(taken(chart, "E").notes.map((n) => n.type), ["don", "bigdon", "don"], "玄人");
  assertEqual(taken(chart, "玄人").notes.map((n) => n.type), ["don", "bigdon", "don"], "玄人 alias");
  assertEqual(taken(chart, "达人").notes.map((n) => n.type), ["don", "bigka", "don"], "达人 alias");
  assertEqual(taken(chart, "nope").notes.map((n) => n.type), ["don", "bigka", "don"], "unknown branch falls back to 达人");

  const played = parser.eventsFromTja(chart, { branch: "N" });
  assertEqual(played.branch, "N", "eventsFromTja records the selected branch");
  assertEqual(played.hasBranch, true, "eventsFromTja hasBranch");
  assertEqual(played.events.map((e) => e.type), ["don", "ka", "don"], "events follow 普通");
  assertEqual(parser.eventsFromTja(chart).branch, "M", "eventsFromTja defaults to 达人");
  assertEqual(parser.eventsFromTja(plain).branch, "", "a chart without 分歧 has no branch id");

  const reordered = [
    "TITLE:branch", "BPM:120", "OFFSET:0", "COURSE:Oni", "#START",
    "1,",
    "#branchstart p,70,90",
    "#m",
    "4,",
    "#n // 普通",
    "2,",
    "#e",
    "3,",
    "#branchend",
    "1,",
    "#END",
    "",
  ].join("\n");
  assertEqual(taken(reordered, "N").notes.map((n) => n.type), ["don", "ka", "don"], "lowercase markers and #M before #N");
  assertEqual(taken(reordered, "E").notes[1], { t: 2, type: "bigdon", measure: 2, bpm: 120 }, "玄人 still starts at the branch");

  const uneven = [
    "TITLE:branch", "BPM:120", "OFFSET:0", "#START",
    "#BRANCHSTART r,1,2",
    "#N",
    "1,",
    "#E",
    "1,",
    "1,",
    "#M",
    "1,",
    "#BRANCHEND",
    "2,",
    "#END",
    "",
  ].join("\n");
  const asN = parser.parseTja(uneven, { branch: "N" });
  const asE = parser.parseTja(uneven, { branch: "E" });
  assertEqual(asN.notes.map((n) => round(n.t)), [0, 2], "普通 is one measure, the following note starts right after it");
  assertEqual(asN.notes.map((n) => n.type), ["don", "ka"], "普通 notes");
  assertEqual(asE.notes.map((n) => round(n.t)), [0, 2, 4], "玄人 is two measures long");
  assertEqual(asE.notes.map((n) => n.measure), [1, 2, 3], "measure numbers follow the selected path");

  const local = [
    "TITLE:branch", "BPM:120", "OFFSET:0", "#START",
    "1,",
    "#BRANCHSTART r,1,2",
    "#N",
    "#BPMCHANGE 240",
    "#DELAY 1",
    "1,",
    "#E",
    "#SCROLL 1.5",
    "12,",
    "#M",
    "#MEASURE 2/4",
    "#GOGOSTART",
    "4,",
    "#GOGOEND",
    "#BRANCHEND",
    "2,",
    "#END",
    "",
  ].join("\n");
  assertEqual(taken(local, "N").notes, [
    { t: 0, type: "don", measure: 1, bpm: 120 },
    { t: 3, type: "don", measure: 2, bpm: 240 },
    { t: 4, type: "ka", measure: 3, bpm: 240 },
  ], "普通 keeps its own BPM and DELAY");
  assertEqual(taken(local, "E").notes, [
    { t: 0, type: "don", measure: 1, bpm: 120 },
    { t: 2, type: "don", measure: 2, bpm: 120 },
    { t: 3, type: "ka", measure: 2, bpm: 120 },
    { t: 4, type: "ka", measure: 3, bpm: 120 },
  ], "玄人 is an 8th pair and does not inherit 普通's BPM");
  assertEqual(taken(local, "M").notes, [
    { t: 0, type: "don", measure: 1, bpm: 120 },
    { t: 2, type: "bigka", measure: 2, bpm: 120 },
    { t: 3, type: "ka", measure: 3, bpm: 120 },
  ], "达人 uses its own #MEASURE; gogo commands are not notes");

  const two = [
    "TITLE:branch", "BPM:120", "OFFSET:0", "#START",
    "1,",
    "#BRANCHSTART r,1,2",
    "#N", "1,",
    "#E", "2,",
    "#M", "3,",
    "#BRANCHEND",
    "0,",
    "#BRANCHSTART r,1,2",
    "#N", "2,",
    "#M", "4,",
    "#BRANCHEND",
    "1,",
    "#END",
    "",
  ].join("\n");
  assertEqual(taken(two, "E").notes.map((n) => n.type), ["don", "ka", "bigka", "don"], "a section with no #E falls back to 达人 for that section only");
  assertEqual(taken(two, "E").notes.map((n) => round(n.t)), [0, 2, 6, 8], "the rest measure stays between the two branches");
  assertEqual(taken(two, "N").notes.map((n) => n.type), ["don", "don", "ka", "don"], "both sections follow 普通");

  const emptyE = [
    "TITLE:branch", "BPM:120", "OFFSET:0", "#START",
    "1,",
    "#BRANCHSTART",
    "#N", "2,",
    "#E",
    "#M", "4,",
    "#BRANCHEND",
    "1,",
    "#END",
    "",
  ].join("\n");
  const emptyPlayed = taken(emptyE, "E");
  assertEqual(emptyPlayed.branchIds, ["N", "E", "M"], "an empty #E still counts as a path");
  assertEqual(emptyPlayed.notes.map((n) => ({ t: n.t, type: n.type })), [
    { t: 0, type: "don" },
    { t: 2, type: "don" },
  ], "an empty #E is silence, not a copy of 达人");

  const closedByEnd = [
    "TITLE:branch", "BPM:120", "OFFSET:0", "#START",
    "1,",
    "#BRANCHSTART r,1,2",
    "#N", "2,",
    "#E", "3,",
    "#M", "4,",
    "#END",
    "",
  ].join("\n");
  assertEqual(taken(closedByEnd, "M").notes.map((n) => n.type), ["don", "bigka"], "#END closes an open branch");

  const multi = [
    "TITLE:branch", "BPM:120", "OFFSET:0",
    "COURSE:Easy", "#START", "2,", "#END",
    "COURSE:Oni", "#START",
    "1,",
    "#SECTION",
    "#BRANCHSTART r,1,2",
    "#LEVELHOLD",
    "#N", "2,",
    "#E", "3,",
    "#M", "4,",
    "#BRANCHEND",
    "1,",
    "#END",
    "",
  ].join("\n");
  const listed = parser.listCourses(parser.parseTja(multi));
  assertEqual(listed.map((c) => c.label), ["易", "鬼"], "courses stay 易/鬼");
  assertEqual(listed.map((c) => !!c.hasBranch), [false, true], "only 鬼 has 分歧");
  assertEqual(listed[0].branches, [], "易 has no branch choices");
  assertEqual(listed[1].branches.map((b) => b.label), ["普通", "玄人", "达人"], "鬼 lists three paths");
  assertEqual(parser.eventsFromTja(multi, { course: "Easy" }).hasBranch, false, "Easy playback is not branched");
  assertEqual(parser.eventsFromTja(multi, { course: "Oni", branch: "E" }).events.map((e) => e.type), ["don", "bigdon", "don"], "Oni 玄人");

  const args = jobs.parseArgs(["--tja", "a.tja", "--branch", "玄人", "--out", "o.mp4"]);
  assertEqual(args.branch, "玄人", "--branch");
  const payload = jobs.buildPayload({ tjaText: chart, branch: "N", course: "Oni" });
  assertEqual(payload.branch, "N", "buildPayload keeps the branch");
  assertEqual(payload.events.map((e) => e.type), ["don", "ka", "don"], "render payload plays 普通");
  const serialized = batchUi.serializeJob({ tjaText: chart, branch: "E", hits: false });
  assertEqual(serialized.branch, "E", "serializeJob keeps the branch");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-branch-"));
  const tjaPath = path.join(dir, "a.tja");
  const queuePath = path.join(dir, "queue.json");
  fs.writeFileSync(tjaPath, chart);
  fs.writeFileSync(queuePath, JSON.stringify({ jobs: [{ tja: "a.tja", branch: "M", out: "a.mp4" }] }));
  const loaded = jobs.loadBatchFile(queuePath);
  assertEqual(loaded[0].branch, "M", "batch job branch");
  fs.rmSync(dir, { recursive: true, force: true });

  const renderSrc = fs.readFileSync(path.join(ROOT, "render.js"), "utf8");
  const serverSrc = fs.readFileSync(path.join(ROOT, "js", "render-server.js"), "utf8");
  const uiSrc = fs.readFileSync(path.join(ROOT, "js", "batch-ui.js"), "utf8");
  if (!/branch:\s*args\.branch/.test(renderSrc)) throw new Error("render.js 没有把 --branch 传给出片");
  if (!/branch:\s*job\.branch/.test(serverSrc)) throw new Error("本机出片没有收下分歧");
  if (!/branch:\s*row\.branch/.test(uiSrc)) throw new Error("开始渲染没有把选中的分歧交出去");

  console.log("  parser branches ok");
}

function assertSourceGuards() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  if (!html.includes('id="branchPicker"')) throw new Error("branch picker missing");
  if (!html.includes('aria-label="分歧"')) throw new Error("branch picker label missing");
  const tag = html.slice(html.indexOf('id="branchPicker"') - 80, html.indexOf('id="branchPicker"') + 80);
  if (!/\shidden\b/.test(tag)) throw new Error("branch picker should start hidden");
  const hint = html.slice(html.indexOf('id="chartHint"'), html.indexOf('id="tjaInput"'));
  if (!hint.includes("普通、玄人、达人") || !hint.includes("#N") || !hint.includes("先用达人")) {
    throw new Error("谱面规则 popover should explain 分歧");
  }
  const homeEnd = html.indexOf('<div class="editor" id="editor"');
  const home = homeEnd >= 0 ? html.slice(0, homeEnd) : html;
  const standing = home.replace(/<div\b[^>]*\broute-hint\b[^>]*>[\s\S]*?<\/div>/g, "");
  if (standing.includes("先用达人")) throw new Error("branch explanation is standing on the page");
  console.log("  source guards ok");
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

function pageUrl(port, params) {
  const url = new URL("http://127.0.0.1:" + port + "/");
  Object.keys(params || {}).forEach((key) => {
    if (params[key] != null) url.searchParams.set(key, params[key]);
  });
  return url.toString();
}

function multiChart() {
  return [
    "TITLE:branch",
    "BPM:120",
    "OFFSET:0",
    "COURSE:Easy",
    "#START",
    "2,",
    "#END",
    "COURSE:Oni",
    "#START",
    "1,",
    "#BRANCHSTART r,1,2",
    "#N",
    "2,",
    "#E",
    "3,",
    "#M",
    "4,",
    "#BRANCHEND",
    "1,",
    "#END",
    "",
  ].join("\n");
}

(async () => {
  runParserCases();
  assertSourceGuards();

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
    const file = path.join(os.tmpdir(), "bachi-branch-" + name);
    fs.writeFileSync(file, contents);
    tmpFiles.push(file);
    const input = await page.$(selector);
    await input.uploadFile(file);
  }

  async function readUi(page) {
    return page.evaluate(() => {
      const courseButtons = [...document.querySelectorAll("#coursePicker button")].map((b) => ({
        label: b.textContent,
        on: b.classList.contains("on"),
      }));
      const branchEl = document.getElementById("branchPicker");
      const buttons = branchEl ? [...branchEl.querySelectorAll("button")].map((b) => ({
        label: b.textContent,
        id: b.dataset.branch,
        on: b.classList.contains("on"),
        checked: b.getAttribute("aria-checked"),
      })) : [];
      const raw = window.taikoAnim && window.taikoAnim.raw;
      const fold = document.getElementById("settingsOpen");
      const course = document.getElementById("coursePicker");
      const foldRect = fold.getBoundingClientRect();
      const courseRect = course.getBoundingClientRect();
      const branchRect = branchEl.getBoundingClientRect();
      const buttonRects = [...branchEl.querySelectorAll("button")].map((b) => b.getBoundingClientRect());
      const opts = window.BachiApp.parseOpts();
      return {
        courseButtons,
        buttons,
        hidden: branchEl.hidden,
        label: branchEl.querySelector(".block-label") ? branchEl.querySelector(".block-label").textContent : "",
        role: branchEl.getAttribute("role"),
        below: branchRect.top >= courseRect.bottom - 1 && branchRect.top > courseRect.top,
        inOpenFold: fold.contains(branchEl),
        notInsideCourse: !course.contains(branchEl),
        overflow: !branchEl.hidden && buttonRects.some((r) => r.right > foldRect.right + 1 || r.left < foldRect.left - 1 || r.width <= 0),
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        branch: raw ? raw.branch : null,
        types: raw && raw.events ? raw.events.map((e) => e.type) : [],
        events: raw && raw.events ? raw.events.map((e) => e.hand + ":" + e.face) : [],
        times: raw && raw.events ? raw.events.map((e) => Math.round(e.t * 1000) / 1000) : [],
        query: new URL(location.href).searchParams.get("branch"),
        opt: opts.branch || "",
        json: document.getElementById("jsonInput").value,
        course: raw ? raw.course : null,
      };
    });
  }

  async function clickBranch(page, label) {
    const clicked = await page.evaluate((want) => {
      const btn = [...document.querySelectorAll("#branchPicker button")].find((b) => b.textContent === want);
      if (!btn) return false;
      btn.click();
      return true;
    }, label);
    if (!clicked) throw new Error("no branch button " + label);
  }

  async function clickCourse(page, label) {
    const clicked = await page.evaluate((want) => {
      const btn = [...document.querySelectorAll("#coursePicker button")].find((b) => b.textContent === want);
      if (!btn) return false;
      btn.click();
      return true;
    }, label);
    if (!clicked) throw new Error("no course button " + label);
  }

  try {
    const page = await browser.newPage();
    page.on("pageerror", (err) => fails.push("pageerror: " + err.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    const chart = multiChart();
    await page.goto(pageUrl(port, { settings: "1", tja: chart }), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => {
      const course = document.querySelector("#coursePicker button.on");
      const branch = document.querySelector("#branchPicker button.on");
      const raw = window.taikoAnim && window.taikoAnim.raw;
      return course && course.textContent === "鬼"
        && branch && branch.textContent === "达人"
        && raw && raw.branch === "M"
        && raw.events && raw.events.length === 3;
    }, { timeout: 8000 });
    let ui = await readUi(page);
    check(ui.courseButtons.map((b) => b.label).join(",") === "易,鬼", "courses " + ui.courseButtons.map((b) => b.label).join(","));
    check(ui.buttons.map((b) => b.label).join(",") === "普通,玄人,达人", "branches " + ui.buttons.map((b) => b.label).join(","));
    check(ui.buttons.map((b) => b.id).join(",") === "N,E,M", "branch ids " + ui.buttons.map((b) => b.id).join(","));
    check(ui.buttons.filter((b) => b.on).map((b) => b.label).join(",") === "达人", "default 达人");
    check(ui.buttons.every((b) => (b.on ? b.checked === "true" : b.checked === "false")), "aria-checked");
    check(ui.label === "分歧" && ui.role === "radiogroup", "row label " + ui.label + " / " + ui.role);
    check(!ui.hidden && ui.below && ui.inOpenFold && ui.notInsideCourse, "picker sits below 难度");
    check(ui.types.join(",") === "don,bigka,don" && ui.times.join(",") === "0,2,4", "达人 notes " + ui.types.join(",") + " @ " + ui.times.join(","));
    check(ui.query === "M" && ui.opt === "M", "url branch " + ui.query + " opt " + ui.opt);
    check(!ui.overflow && !ui.pageOverflow, "desktop overflow");

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.evaluate(() => { document.getElementById("settingsOpen").open = true; });
    ui = await readUi(page);
    check(!ui.hidden && !ui.overflow && !ui.pageOverflow && ui.below, "narrow 390 overflow " + JSON.stringify({
      hidden: ui.hidden, overflow: ui.overflow, page: ui.pageOverflow, below: ui.below,
      scrollWidth: ui.scrollWidth, innerWidth: ui.innerWidth,
    }));
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    await clickBranch(page, "普通");
    await page.waitForFunction(() => window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.branch === "N", { timeout: 8000 });
    ui = await readUi(page);
    check(ui.buttons.filter((b) => b.on).map((b) => b.label).join(",") === "普通", "selected 普通");
    check(ui.types.join(",") === "don,ka,don" && ui.times.join(",") === "0,2,4", "普通 notes " + ui.types.join(","));
    check(ui.query === "N" && ui.opt === "N", "url updated " + ui.query);

    await clickBranch(page, "玄人");
    await page.waitForFunction(() => window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.branch === "E", { timeout: 8000 });
    ui = await readUi(page);
    check(ui.types.join(",") === "don,bigdon,don", "玄人 notes " + ui.types.join(","));
    check(ui.query === "E", "url 玄人 " + ui.query);

    await page.reload({ waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => {
      const on = document.querySelector("#branchPicker button.on");
      return on && on.textContent === "玄人" && window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.branch === "E";
    }, { timeout: 8000 });
    ui = await readUi(page);
    check(ui.types.join(",") === "don,bigdon,don" && ui.query === "E", "reload keeps 玄人");

    await clickCourse(page, "易");
    await page.waitForFunction(() => {
      const raw = window.taikoAnim && window.taikoAnim.raw;
      return raw && raw.course === "Easy" && document.getElementById("branchPicker").hidden;
    }, { timeout: 8000 });
    ui = await readUi(page);
    check(ui.hidden && ui.buttons.length === 0, "易 has no 分歧");
    check(ui.types.join(",") === "ka" && ui.query == null && ui.opt === "", "易 plays its own note and clears ?branch, got " + ui.query + " / " + ui.types.join(","));

    await clickCourse(page, "鬼");
    await page.waitForFunction(() => {
      const on = document.querySelector("#branchPicker button.on");
      return on && on.textContent === "玄人" && window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.branch === "E";
    }, { timeout: 8000 });
    ui = await readUi(page);
    check(!ui.hidden && ui.types.join(",") === "don,bigdon,don", "back to 鬼 restores 玄人");

    const masterJson = '{"events":[{"t":0,"hand":"L","face":"don","grip":"single"}]}';
    await clickBranch(page, "达人");
    await page.waitForFunction(() => window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.branch === "M", { timeout: 8000 });
    await upload(page, "#jsonFile", "master-hands.json", masterJson);
    await page.waitForFunction((want) => document.getElementById("jsonInput").value === want, { timeout: 8000 }, masterJson);
    await clickBranch(page, "普通");
    await page.waitForFunction(() => window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.branch === "N" && document.getElementById("jsonInput").value === "", { timeout: 8000 });
    ui = await readUi(page);
    check(ui.json === "" && ui.types.join(",") === "don,ka,don", "普通 does not keep 达人's 手顺, got " + ui.json + " / " + ui.types.join(","));
    await clickBranch(page, "达人");
    await page.waitForFunction((want) => document.getElementById("jsonInput").value === want && window.taikoAnim.raw.branch === "M", { timeout: 8000 }, masterJson);
    ui = await readUi(page);
    check(ui.json === masterJson && ui.events.join(",") === "L:don", "达人 restores its 手顺, got " + ui.events.join(",") + " / " + ui.json);

    await page.goto(pageUrl(port, { settings: "1", tja: chart, branch: "普通" }), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => {
      const on = document.querySelector("#branchPicker button.on");
      return on && on.textContent === "普通" && window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.branch === "N";
    }, { timeout: 8000 });
    ui = await readUi(page);
    check(ui.types.join(",") === "don,ka,don" && ui.query === "N", "query 普通 → N");

    await page.goto(pageUrl(port, { settings: "1", tja: chart, branch: "master" }), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.branch === "M", { timeout: 8000 });
    ui = await readUi(page);
    check(ui.buttons.filter((b) => b.on).map((b) => b.label).join(",") === "达人", "query master → 达人");

    const bare = ["TITLE:bare", "BPM:120", "OFFSET:0", "COURSE:Oni", "#START", "11,", "#END", ""].join("\n");
    await page.goto(pageUrl(port, { settings: "1", tja: bare }), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => {
      const course = document.querySelector("#coursePicker button.on");
      return course && course.textContent === "鬼" && document.getElementById("branchPicker").hidden;
    }, { timeout: 8000 });
    ui = await readUi(page);
    check(ui.hidden && ui.buttons.length === 0 && ui.types.join(",") === "don,don", "no 分歧 hides the row and plays the chart");

    await page.goto(pageUrl(port, { settings: "1", tja: chart, branch: "N" }), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.branch === "N", { timeout: 8000 });
    await upload(page, "#tjaFile", "again.tja", chart);
    await page.waitForFunction(() => {
      const on = document.querySelector("#branchPicker button.on");
      return on && on.textContent === "达人" && window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.branch === "M";
    }, { timeout: 8000 });
    ui = await readUi(page);
    check(ui.types.join(",") === "don,bigka,don" && ui.query === "M", "opening a file defaults to 达人");

    await page.click("#settingsOpenBlank");
    await page.waitForFunction(() => document.getElementById("branchPicker").hidden && document.getElementById("coursePicker").hidden, { timeout: 8000 });
    ui = await readUi(page);
    check(ui.hidden && ui.buttons.length === 0, "blank chart hides 分歧");
  } catch (err) {
    fails.push(err && err.stack ? err.stack : String(err));
  } finally {
    tmpFiles.forEach((file) => { try { fs.unlinkSync(file); } catch (e) { /* already gone */ } });
    await browser.close();
    server.close();
  }

  if (fails.length) {
    console.error("FAIL branch picker\n- " + fails.join("\n- "));
    process.exit(1);
  }
  console.log("branch picker ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
