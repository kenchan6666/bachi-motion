/**
 * Opening a multi-COURSE TJA: list only the courses in the file, default to
 * 鬼 (Oni) then 里 (Edit/Ura), and keep each course's imported 手顺 separate.
 * Charts in this file are synthetic. Do not drop official charts in here.
 *
 *   node tests/course-picker.test.js
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(process.env.BM_ROOT || path.join(__dirname, ".."));
const parser = require(path.join(ROOT, "js", "parser.js"));

function synth(blocks) {
  const lines = ["TITLE:synth", "BPM:120", "OFFSET:0", ""];
  for (const block of blocks) {
    lines.push("COURSE:" + block[0], "#START", block[1] + ",", "#END", "");
  }
  return lines.join("\n");
}

function picked(tja, course) {
  return parser.pickCourse(parser.parseTja(tja), course).headers.course;
}

function labelsOf(tja) {
  return parser.listCourses(parser.parseTja(tja)).map((c) => c.label);
}

function assertEqual(got, want, msg) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) throw new Error(msg + "\n  got  " + a + "\n  want " + b);
}

function runParserCases() {
  const full = synth([
    ["Easy", "1"],
    ["Normal", "1"],
    ["Hard", "1"],
    ["Oni", "11"],
    ["Edit", "1"],
    ["Dan", "1"],
  ]);
  assertEqual(labelsOf(full), ["易", "普", "难", "鬼", "里", "Dan"], "labels for common courses plus Dan");
  assertEqual(picked(full, ""), "Oni", "default is Oni even when Easy is first");
  for (const alias of ["Oni", "oni", "ONI", "おに", "3", "鬼"]) {
    assertEqual(picked(full, alias), "Oni", "oni alias " + alias);
  }
  for (const alias of ["Edit", "edit", "eDiT", "Ura", "ura", "URA", "裏", "4", "里"]) {
    assertEqual(picked(full, alias), "Edit", "ura alias " + alias);
  }
  for (const alias of ["Easy", "easy", "0", "易"]) assertEqual(picked(full, alias), "Easy", "easy alias " + alias);
  for (const alias of ["Normal", "normal", "1", "普"]) assertEqual(picked(full, alias), "Normal", "normal alias " + alias);
  for (const alias of ["Hard", "HARD", "2", "难", "難"]) assertEqual(picked(full, alias), "Hard", "hard alias " + alias);
  assertEqual(picked(full, "Dan"), "Dan", "Dan exact");
  assertEqual(picked(full, "dan"), "Dan", "Dan is case-insensitive");
  let missing = "";
  try { picked(full, "Tower"); }
  catch (err) { missing = err.message; }
  if (!missing.includes("Dan") || !missing.includes("Oni")) throw new Error("missing course should name the ones on file, got " + missing);

  const editFirst = synth([["Edit", "1"], ["Oni", "11"]]);
  const editFirstData = parser.eventsFromTja(editFirst);
  assertEqual(editFirstData.course, "Oni", "eventsFromTja defaults to Oni when Edit is first");
  if (editFirstData.events.length !== 2) throw new Error("Oni block should be the two-note chart, got " + editFirstData.events.length);
  const asFour = parser.eventsFromTja(editFirst, { course: "4" });
  assertEqual(asFour.course, "Edit", "eventsFromTja alias 4");
  if (asFour.events.length !== 1) throw new Error("alias 4 should load the one-note Edit block");
  const byIndex = parser.resolveCourse(parser.parseTja(editFirst), { course: "Oni", courseIndex: 0 });
  assertEqual(byIndex.headers.course, "Edit", "courseIndex wins over the name");

  const noOni = synth([["Easy", "2"], ["Ura", "1"]]);
  assertEqual(picked(noOni, ""), "Ura", "no Oni defaults to Ura");
  assertEqual(picked(noOni, "Edit"), "Ura", "Edit alias finds COURSE:Ura");
  assertEqual(picked(noOni, "裏"), "Ura", "裏 finds COURSE:Ura");

  const editOnly = synth([["Easy", "2"], ["Edit", "1"]]);
  assertEqual(picked(editOnly, ""), "Edit", "no Oni defaults to Edit");
  assertEqual(labelsOf(editOnly), ["易", "里"], "Edit is labeled 里");

  const neither = synth([["Dan", "1"], ["Tower", "11"]]);
  assertEqual(picked(neither, ""), "Dan", "no Oni/Ura defaults to the first block");
  assertEqual(labelsOf(neither), ["Dan", "Tower"], "other courses keep their names and nothing else is invented");

  const numbered = synth([["0", "1"], ["1", "1"], ["2", "1"], ["3", "11"], ["4", "1"], ["Tower", "1"]]);
  assertEqual(labelsOf(numbered), ["易", "普", "难", "鬼", "里", "Tower"], "numeric courses use the short labels");
  assertEqual(picked(numbered, ""), "3", "COURSE:3 is Oni and wins the default");
  assertEqual(picked(numbered, "Oni"), "3", "Oni alias finds COURSE:3");
  assertEqual(picked(numbered, "Edit"), "4", "Edit alias finds COURSE:4");
  assertEqual(picked(numbered, "Ura"), "4", "Ura alias finds COURSE:4");

  const ja = synth([
    ["かんたん", "1"],
    ["ふつう", "1"],
    ["むずかしい", "1"],
    ["おに", "11"],
    ["裏", "1"],
  ]);
  assertEqual(labelsOf(ja), ["易", "普", "难", "鬼", "里"], "Japanese course names use the short labels");
  assertEqual(picked(ja, ""), "おに", "おに is the Oni default");
  assertEqual(picked(ja, "4"), "裏", "4 finds 裏");
  assertEqual(picked(ja, "Easy"), "かんたん", "Easy finds かんたん");

  const bothUra = synth([["Ura", "1"], ["Edit", "11"]]);
  assertEqual(picked(bothUra, "Ura"), "Ura", "exact Ura wins when both ura-group courses exist");
  assertEqual(picked(bothUra, "Edit"), "Edit", "exact Edit wins when both ura-group courses exist");
  assertEqual(picked(bothUra, "4"), "Ura", "bare alias 4 uses the first ura-group block");
  assertEqual(picked(bothUra, ""), "Ura", "default ura is the first ura-group block");

  const unnamed = ["TITLE:synth", "BPM:120", "OFFSET:0", "#START", "1,", "#END", ""].join("\n");
  assertEqual(labelsOf(unnamed), ["（未命名）"], "a course with no name still has a visible label");
  assertEqual(picked(unnamed, ""), "", "single unnamed course is the default");

  console.log("  parser aliases, default, and course list ok");
}

function assertSourceGuards() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const homeEnd = html.indexOf('<div class="editor" id="editor"');
  const home = homeEnd >= 0 ? html.slice(0, homeEnd) : html;
  if (!home.includes('id="tjaFile" type="file" accept=".tja,text/plain"')) {
    throw new Error("TJA file input accept changed");
  }
  if (!html.includes(".file-btn input { display: none; }")) throw new Error("file input display:none changed");
  if (!home.includes("叠打点声（合成 don/ka，不是原曲）")) throw new Error("batch hits label changed");
  if (home.includes("咕")) throw new Error("homepage copy uses 咕");
  if (!html.includes("#tjaInput { font-size: 16px; }")) throw new Error("narrow textarea 16px rule changed");
  const summaries = [...home.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) => {
    const span = m[1].match(/<span>([^<]+)<\/span>/);
    return (span ? span[1] : m[1].split("<")[0]).replace(/\s+/g, "");
  });
  assertEqual(summaries, ["打开谱面", "手顺", "演奏", "批量出片"], "four folds");
  if (!home.includes("有鬼先用鬼")) throw new Error("course hint missing from the 谱面规则 popover");
  const standing = home.replace(/<div\b[^>]*\broute-hint\b[^>]*>[\s\S]*?<\/div>/g, "");
  if (standing.includes("有鬼先用鬼")) throw new Error("course explanation is standing on the page");
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
    const file = path.join(os.tmpdir(), "bachi-course-" + name);
    fs.writeFileSync(file, contents);
    tmpFiles.push(file);
    const input = await page.$(selector);
    await input.uploadFile(file);
  }

  async function readUi(page) {
    return page.evaluate(() => {
      const buttons = [...document.querySelectorAll("#coursePicker button")].map((b) => ({
        label: b.textContent,
        name: b.dataset.course,
        on: b.classList.contains("on"),
        checked: b.getAttribute("aria-checked"),
      }));
      const raw = window.taikoAnim && window.taikoAnim.raw;
      const picker = document.getElementById("coursePicker");
      const fileLabel = document.getElementById("tjaFile").closest("label");
      const fold = document.getElementById("settingsOpen");
      const foldRect = fold.getBoundingClientRect();
      const pickerRect = picker.getBoundingClientRect();
      const fileRect = fileLabel.getBoundingClientRect();
      const buttonRects = [...picker.querySelectorAll("button")].map((b) => b.getBoundingClientRect());
      const hint = document.getElementById("chartHint");
      const standing = fold.cloneNode(true);
      standing.querySelectorAll(".route-hint").forEach((el) => el.remove());
      return {
        buttons,
        hidden: picker.hidden,
        course: raw ? raw.course : null,
        events: raw && raw.events ? raw.events.map((e) => e.hand + ":" + e.face) : [],
        json: document.getElementById("jsonInput").value,
        suyue: document.getElementById("modeSuyue").classList.contains("on"),
        query: new URL(location.href).searchParams.get("course"),
        courseIndex: window.BachiApp.parseOpts().courseIndex,
        sameRow: picker.parentElement === fileLabel.parentElement,
        inOpenFold: fold.contains(picker),
        nearFile: pickerRect.top < fileRect.bottom + 48,
        overflow: buttonRects.some((r) => r.right > foldRect.right + 1 || r.left < foldRect.left - 1 || r.width <= 0),
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        hint: hint ? hint.textContent : "",
        standing: standing.innerText,
        blankFieldsHidden: !!(document.getElementById("settingsBlankFields") && document.getElementById("settingsBlankFields").hidden)
          && !!(document.getElementById("editorBlankFields") && document.getElementById("editorBlankFields").hidden),
        blankFieldsShown: !!(document.getElementById("settingsBlankFields") && !document.getElementById("settingsBlankFields").hidden),
        folds: [...document.querySelectorAll(".settings-stack > details > summary")].map((el) => {
          const span = el.querySelector("span");
          return (span ? span.textContent : el.childNodes[0].textContent).replace(/\s+/g, "");
        }),
      };
    });
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

    const multi = synth([
      ["Edit", "1"],
      ["Easy", "2"],
      ["Normal", "1"],
      ["Hard", "22"],
      ["Oni", "11"],
      ["Dan", "111"],
    ]);
    await page.goto(pageUrl(port, { settings: "1", tja: multi }), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => {
      const on = document.querySelector("#coursePicker button.on");
      return on && on.textContent === "鬼" && window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.course === "Oni";
    }, { timeout: 8000 });
    let ui = await readUi(page);
    check(ui.buttons.map((b) => b.label).join(",") === "里,易,普,难,鬼,Dan", "default list " + ui.buttons.map((b) => b.label).join(","));
    check(ui.buttons.filter((b) => b.on).map((b) => b.label).join(",") === "鬼", "default selection " + JSON.stringify(ui.buttons));
    check(ui.buttons.every((b) => (b.on ? b.checked === "true" : b.checked === "false")), "aria-checked");
    check(ui.course === "Oni" && ui.events.length === 2, "loaded Oni notes " + ui.course + " x" + ui.events.length);
    check(ui.query === "Oni", "url course " + ui.query);
    check(ui.courseIndex === 4, "Oni index " + ui.courseIndex);
    check(ui.inOpenFold && ui.sameRow && ui.nearFile && !ui.hidden, "picker sits with the file buttons");
    check(ui.blankFieldsHidden, "opened TJA hides 歌名/BPM/小节");
    check(!ui.standing.includes("有鬼先用鬼") && ui.hint.includes("有鬼先用鬼"), "hint stays in the ! popover");
    check(ui.folds.join("|") === "打开谱面|手顺|演奏|批量出片", "folds " + ui.folds.join("|"));
    check(!ui.overflow && !ui.pageOverflow, "desktop overflow");

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.evaluate(() => document.getElementById("settingsOpen").open = true);
    ui = await readUi(page);
    check(!ui.overflow && !ui.pageOverflow && ui.buttons.filter((b) => b.on).length === 1, "narrow 390 overflow");

    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(pageUrl(port, { settings: "1" }), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => document.getElementById("coursePicker").hidden && document.getElementById("settingsBlankFields").hidden, { timeout: 8000 });
    ui = await readUi(page);
    check(ui.hidden && ui.buttons.length === 0 && ui.blankFieldsHidden, "initial page hides difficulty and blank fields");

    const single = synth([["Oni", "11"]]);
    await page.goto(pageUrl(port, { settings: "1", tja: single }), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll("#coursePicker button")];
      return buttons.length === 1 && buttons[0].textContent === "鬼" && buttons[0].classList.contains("on");
    }, { timeout: 8000 });
    ui = await readUi(page);
    check(ui.buttons.length === 1 && ui.buttons[0].label === "鬼" && ui.buttons[0].on && !ui.hidden, "single course still shows 鬼");
    check(ui.blankFieldsHidden, "single TJA hides blank fields");
    check(ui.course === "Oni" && ui.query === "Oni", "single course loaded " + ui.course + " ?" + ui.query);

    async function bootCourse(query) {
      await page.goto(pageUrl(port, { settings: "1", course: query, tja: multi }), { waitUntil: "networkidle0", timeout: 30000 });
      await page.waitForFunction(() => window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.course, { timeout: 8000 });
      return readUi(page);
    }
    ui = await bootCourse("3");
    check(ui.course === "Oni" && ui.buttons.find((b) => b.on).label === "鬼" && ui.query === "Oni", "query 3 → 鬼 " + JSON.stringify({ course: ui.course, query: ui.query }));
    ui = await bootCourse("おに");
    check(ui.course === "Oni" && ui.query === "Oni", "query おに → Oni " + ui.course);
    ui = await bootCourse("ONI");
    check(ui.course === "Oni", "query ONI → Oni");
    ui = await bootCourse("4");
    check(ui.course === "Edit" && ui.buttons.find((b) => b.on).label === "里" && ui.events.length === 1 && ui.query === "Edit", "query 4 → 里 " + ui.course + " x" + ui.events.length);
    ui = await bootCourse("Ura");
    check(ui.course === "Edit" && ui.query === "Edit", "query Ura → Edit");
    ui = await bootCourse("裏");
    check(ui.course === "Edit", "query 裏 → Edit");
    ui = await bootCourse("eDiT");
    check(ui.course === "Edit", "query eDiT → Edit");
    ui = await bootCourse("0");
    check(ui.course === "Easy" && ui.buttons.find((b) => b.on).label === "易" && ui.query === "Easy", "query 0 → 易");
    ui = await bootCourse("普");
    check(ui.course === "Normal" && ui.query === "Normal", "query 普 → Normal");
    ui = await bootCourse("2");
    check(ui.course === "Hard" && ui.buttons.find((b) => b.on).label === "难", "query 2 → 难");
    await page.reload({ waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => {
      const on = document.querySelector("#coursePicker button.on");
      return on && on.textContent === "难" && window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.course === "Hard";
    }, { timeout: 8000 });
    ui = await readUi(page);
    check(ui.course === "Hard" && ui.query === "Hard", "reload keeps Hard");

    const handsChart = synth([
      ["Edit", "1"],
      ["Easy", "2"],
      ["Oni", "11"],
    ]);
    const oniJson = '{"events":[{"t":0,"hand":"L","face":"don","grip":"single"}]}';
    const uraJson = '{"events":[{"t":0,"hand":"R","face":"ka","grip":"single"}]}';
    await page.goto(pageUrl(port, { settings: "1", course: "0", tja: synth([["Easy", "2"], ["Oni", "11"]]) }), { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(() => window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.course === "Easy", { timeout: 8000 });
    await upload(page, "#tjaFile", "open-default.tja", handsChart);
    await page.waitForFunction(() => {
      const on = document.querySelector("#coursePicker button.on");
      return on && on.dataset.course === "Oni" && window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.course === "Oni";
    }, { timeout: 8000 });
    ui = await readUi(page);
    check(ui.buttons.map((b) => b.label).join(",") === "里,易,鬼", "opened file lists only its courses");
    check(ui.course === "Oni" && ui.query === "Oni", "opening a file defaults to Oni instead of the stale query");
    check(ui.blankFieldsHidden, "opening a TJA file hides 歌名/BPM/小节");

    await upload(page, "#jsonFile", "oni-hands.json", oniJson);
    await page.waitForFunction((want) => document.getElementById("jsonInput").value === want && document.getElementById("modeSuyue").classList.contains("on"), { timeout: 8000 }, oniJson);
    await clickCourse(page, "易");
    await page.waitForFunction(() => window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.course === "Easy", { timeout: 8000 });
    ui = await readUi(page);
    check(ui.json === "" && !ui.suyue, "Easy does not keep Oni's 手顺");
    check(ui.events.join(",") === "R:ka", "Easy uses auto 手顺, got " + ui.events.join(","));
    check(ui.query === "Easy", "switch updates ?course");

    await clickCourse(page, "鬼");
    await page.waitForFunction(() => document.getElementById("jsonInput").value.indexOf('"hand":"L"') >= 0, { timeout: 8000 });
    ui = await readUi(page);
    check(ui.json === oniJson && ui.suyue && ui.course === "Oni", "back to 鬼 restores its 手顺");
    check(ui.events.join(",") === "L:don", "鬼 plays its own 手顺, got " + ui.events.join(","));

    await clickCourse(page, "里");
    await page.waitForFunction(() => window.taikoAnim && window.taikoAnim.raw && window.taikoAnim.raw.course === "Edit" && document.getElementById("jsonInput").value === "", { timeout: 8000 });
    await upload(page, "#jsonFile", "ura-hands.json", uraJson);
    await page.waitForFunction((want) => document.getElementById("jsonInput").value === want, { timeout: 8000 }, uraJson);
    await clickCourse(page, "鬼");
    await page.waitForFunction((want) => document.getElementById("jsonInput").value === want && window.taikoAnim.raw.course === "Oni", { timeout: 8000 }, oniJson);
    ui = await readUi(page);
    check(ui.json === oniJson && ui.events.join(",") === "L:don", "里's 手顺 did not overwrite 鬼");
    await clickCourse(page, "里");
    await page.waitForFunction((want) => document.getElementById("jsonInput").value === want && window.taikoAnim.raw.course === "Edit", { timeout: 8000 }, uraJson);
    ui = await readUi(page);
    check(ui.json === uraJson && ui.events.join(",") === "R:ka", "里 keeps the 手顺 imported for 里, got " + ui.json + " / " + ui.events.join(","));

    await page.click("#settingsOpenBlank");
    await page.waitForFunction(() => !document.getElementById("settingsBlankFields").hidden && document.getElementById("coursePicker").hidden, { timeout: 8000 });
    ui = await readUi(page);
    check(ui.blankFieldsShown && ui.buttons.length === 0, "blank chart shows 歌名/BPM/小节 and hides difficulty");
    check(ui.query == null, "blank chart clears ?course, got " + ui.query);
    const renamed = await page.evaluate(() => {
      const el = document.getElementById("settingsBlankTitle");
      el.value = "自定名";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        locked: !!(el.disabled || el.readOnly),
        title: window.TaikoParser.parseTja(document.getElementById("tjaInput").value).headers.title,
      };
    });
    check(!renamed.locked && renamed.title === "自定名", "blank title stays editable, got " + JSON.stringify(renamed));

    await upload(page, "#tjaFile", "back-to-tja.tja", handsChart);
    await page.waitForFunction(() => {
      const on = document.querySelector("#coursePicker button.on");
      return on && on.textContent === "鬼" && document.getElementById("settingsBlankFields").hidden;
    }, { timeout: 8000 });
    ui = await readUi(page);
    check(ui.blankFieldsHidden && ui.buttons.filter((b) => b.on).map((b) => b.label).join(",") === "鬼", "TJA after a blank chart shows difficulty and hides fields");
  } catch (err) {
    fails.push(err && err.stack ? err.stack : String(err));
  } finally {
    tmpFiles.forEach((file) => { try { fs.unlinkSync(file); } catch (e) { /* already gone */ } });
    await browser.close();
    server.close();
  }

  if (fails.length) {
    console.error("FAIL course picker\n- " + fails.join("\n- "));
    process.exit(1);
  }
  console.log("course picker ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
