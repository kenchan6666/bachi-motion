"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("  ✓ " + name);
}

check("package version is 0.2.2 and the desktop entry is the window", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.strictEqual(pkg.version, "0.2.2");
  assert.strictEqual(pkg.main, "desktop/main.js");
  assert.ok(!JSON.stringify(pkg).includes("1.0.0"));
});

check("the desktop shell opens its own window and blocks remote URLs", () => {
  const main = read("desktop/main.js");
  assert.ok(main.includes('scheme: "bachi"'));
  assert.ok(main.includes("bachi://app/index.html"));
  assert.ok(main.includes("onBeforeRequest"));
  assert.ok(main.includes("已拦截联网请求"));
  assert.ok(main.includes("setWindowOpenHandler"));
  assert.ok(main.includes('action: "deny"'));
  assert.ok(main.includes("if (!useGpu) app.disableHardwareAcceleration()"));
  assert.ok(main.includes('CPU_FLAG = "--bachi-cpu"'));
  assert.ok(main.includes("relaunchOnCpu"));
  assert.ok(!main.includes("shell.openExternal"));
  assert.ok(!main.includes("localhost"));
});

check("batch UI keeps the local server path and adds the desktop window path", () => {
  const ui = read("js/batch-ui.js");
  assert.ok(ui.includes('fetch("/api/batch"'));
  assert.ok(ui.includes("node render.js --serve"));
  assert.ok(ui.includes("window.bachiDesktop"));
  assert.ok(ui.includes("filePath"));
  assert.ok(ui.includes("function runOnDesktop"));
});

check("the Windows workflow publishes 0.2.2-style tags with GITHUB_TOKEN only", () => {
  const yml = read(".github/workflows/release-windows.yml");
  assert.ok(yml.includes("windows-latest"));
  assert.ok(yml.includes("workflow_dispatch"));
  assert.ok(yml.includes("tags:"));
  assert.ok(yml.includes("secrets.GITHUB_TOKEN"));
  assert.ok(!/secrets\.(?!GITHUB_TOKEN\b)[A-Z0-9_]+/.test(yml));
  assert.ok(yml.includes("v0.2.2") || yml.includes("refs/tags/v"));
  const notes = read("packaging/windows/release-notes.md");
  assert.ok(notes.includes("0.2.2"));
  assert.ok(notes.includes("bachi-motion-0.2.2-windows-x64.zip"));
  assert.ok(notes.includes("这个版本新增"));
  assert.ok(notes.includes("全 2-2"));
  assert.ok(notes.includes("BPM×SCROLL"));
  assert.ok(notes.includes("全部谱面"));
  assert.ok(!notes.includes("0.2.1"));
  assert.ok(!notes.includes("0.2.0"));
  assert.ok(!notes.includes("1.0.0"));
  const doc = read("出片说明.md");
  assert.ok(doc.includes("bachi-motion.exe"));
  assert.ok(doc.includes("v0.2.2"));
  assert.ok(doc.includes("ffmpeg"));
  assert.ok(doc.includes("不需要联网") || doc.includes("断网"));
});

console.log("desktop-shell tests: " + passed);
