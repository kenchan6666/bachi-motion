"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const launch = require("../js/chrome-launch.js");
const server = require("../js/render-server.js");
const stage = require("../scripts/stage-desktop.js");

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok " + name);
  } catch (err) {
    failed++;
    console.error("  FAIL " + name);
    console.error(err && err.stack ? err.stack : err);
  }
}

check("GPU launch args omit --disable-gpu", function () {
  const gpu = launch.buildLaunchOptions({ disableGpu: false, platform: "win32", executablePath: "chrome.exe" });
  assert.ok(!gpu.args.includes("--disable-gpu"));
  assert.ok(gpu.args.includes("--use-angle=d3d11"));
  assert.deepStrictEqual(gpu.ignoreDefaultArgs, ["--disable-gpu"]);
  assert.strictEqual(gpu.executablePath, "chrome.exe");
  const linux = launch.buildLaunchOptions({ disableGpu: false, platform: "linux" });
  assert.ok(!linux.args.includes("--disable-gpu"));
  assert.ok(!linux.args.includes("--use-angle=d3d11"));
});

check("CPU launch args include --disable-gpu only as fallback", function () {
  const cpu = launch.buildLaunchOptions({ disableGpu: true, platform: "win32" });
  assert.ok(cpu.args.includes("--disable-gpu"));
  assert.ok(!cpu.args.includes("--use-angle=d3d11"));
  assert.strictEqual(cpu.ignoreDefaultArgs, undefined);
});

check("hardware GPU names try GPU before CPU", function () {
  assert.strictEqual(launch.hasHardwareGpu(["NVIDIA GeForce RTX 3060"]), true);
  assert.strictEqual(launch.hasHardwareGpu(["Intel(R) UHD Graphics 620"]), true);
  assert.strictEqual(launch.hasHardwareGpu(["AMD Radeon RX 6600"]), true);
  assert.strictEqual(launch.hasHardwareGpu(["Microsoft Basic Display Adapter", "NVIDIA GeForce GTX 1650"]), true);
  assert.deepStrictEqual(launch.gpuAttemptOrder(true), [false, true]);
  assert.deepStrictEqual(launch.gpuAttemptOrder(null), [false, true]);
});

check("software-only adapters stay on CPU", function () {
  assert.strictEqual(launch.hasHardwareGpu(["Microsoft Basic Display Adapter"]), false);
  assert.strictEqual(launch.hasHardwareGpu(["Microsoft Basic Render Driver"]), false);
  assert.strictEqual(launch.hasHardwareGpu(["llvmpipe", "simpledrm 0x1234"]), false);
  assert.strictEqual(launch.hasHardwareGpu([]), null);
  assert.deepStrictEqual(launch.gpuAttemptOrder(false), [true]);
  assert.strictEqual(launch.launchModeLabel(true, false, 0), "未检测到显卡，渲染使用 CPU");
  assert.strictEqual(launch.launchModeLabel(true, true, 1), "GPU 启动失败，渲染退回 CPU");
  assert.strictEqual(launch.launchModeLabel(false, true, 0), "渲染使用 GPU");
});

check("Windows Chrome candidates use a real path", function () {
  const found = launch.chromeCandidates({
    PROGRAMFILES: "C:\\Program Files",
    "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
    LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local",
  }, "win32");
  assert.ok(found.includes("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"));
  assert.ok(found.includes("C:\\Users\\a\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"));
  assert.ok(!found.some((item) => item.includes("\\\\")));
  const picked = launch.findChrome({
    platform: "win32",
    env: {},
    candidates: ["C:\\missing\\chrome.exe", "D:\\Chrome\\chrome.exe"],
    exists: (file) => file.startsWith("D:"),
  });
  assert.strictEqual(picked, "D:\\Chrome\\chrome.exe");
});

check("ffmpeg resolver prefers the bundled binary", function () {
  const bundled = launch.resolveFfmpeg({
    env: { BACHI_FFMPEG: "C:\\app\\ffmpeg.exe" },
    exists: (file) => file === "C:\\app\\ffmpeg.exe",
  });
  assert.strictEqual(bundled.command, "C:\\app\\ffmpeg.exe");
  assert.strictEqual(bundled.bundled, true);
  const missing = launch.resolveFfmpeg({
    env: { BACHI_FFMPEG: "C:\\app\\ffmpeg.exe" },
    exists: () => false,
  });
  assert.strictEqual(missing.ok, false);
  const pathOnly = launch.resolveFfmpeg({ env: {}, exists: () => false });
  assert.strictEqual(pathOnly.command, "ffmpeg");
  assert.strictEqual(pathOnly.bundled, false);
});

check("Electron GPU switches are empty unless CPU fallback is on", function () {
  assert.deepStrictEqual(launch.electronGpuSwitches(false), []);
  assert.deepStrictEqual(launch.electronGpuSwitches(true), ["disable-gpu"]);
});

check("desktop capture does not disable the GPU on the success path", function () {
  const page = fs.readFileSync(path.join(ROOT, "desktop", "electron-page.js"), "utf8");
  const main = fs.readFileSync(path.join(ROOT, "desktop", "main.js"), "utf8");
  const render = fs.readFileSync(path.join(ROOT, "render.js"), "utf8");
  assert.ok(page.includes("if (disableGpu) prefs.offscreen = true"));
  assert.ok(!page.includes('appendSwitch("disable-gpu")'));
  assert.ok(!page.includes("appendSwitch('disable-gpu')"));
  assert.ok(main.includes("electronGpuSwitches"));
  assert.ok(main.includes("if (disableGpu) app.disableHardwareAcceleration()"));
  assert.ok(!render.includes("--disable-gpu"));
  assert.ok(render.includes("buildLaunchOptions"));
});

check("package version is 0.1.0 and the workflow does not publish a public release", function () {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const desktop = JSON.parse(fs.readFileSync(path.join(ROOT, "desktop", "package.json"), "utf8"));
  assert.strictEqual(pkg.version, "0.1.0");
  assert.strictEqual(desktop.version, "0.1.0");
  const yml = fs.readFileSync(path.join(ROOT, ".github", "workflows", "windows-package.yml"), "utf8");
  assert.ok(yml.includes("v0.1.0"));
  assert.ok(yml.includes("workflow_dispatch"));
  assert.ok(yml.includes("draft: true"));
  assert.ok(yml.includes("pull_request"));
  assert.ok(!/^\s*release:/m.test(yml));
  assert.ok(!yml.includes("types: [published]"));
  assert.ok(yml.includes("ffmpeg"));
  const built = desktop.build;
  assert.strictEqual(built.win.artifactName, "bachi-motion-${version}-win-x64.${ext}");
  assert.ok(JSON.stringify(built.extraResources).includes("ffmpeg"));
});

check("hint explains the offline window and is not standing copy", function () {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const hint = html.slice(html.indexOf('id="renderHint"'), html.indexOf('id="renderHint"') + 1200);
  assert.ok(hint.includes("GitHub Pages"));
  assert.ok(hint.includes("窗口"));
  assert.ok(hint.includes("离线"));
  assert.ok(hint.includes("ffmpeg"));
  assert.ok(hint.includes("Chromium"));
  assert.ok(hint.includes("node render.js --serve"));
  assert.ok(!hint.includes("咕"));
  const home = html.slice(0, html.indexOf('id="editor"'));
  const standing = home.replace(/<div\b[^>]*\broute-hint\b[^>]*>[\s\S]*?<\/div>/g, "");
  assert.ok(!standing.includes("不用另开浏览器"));
  assert.ok(!standing.includes("这个包已经带了 Chromium"));
});

check("desktop HTML drops Google Fonts requests", function () {
  const sample = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC&display=swap" rel="stylesheet">\n<link rel="stylesheet" href="assets/fonts/bachi-serif-cjk.css">';
  const stripped = server.stripExternalFontLinks(sample);
  assert.ok(!stripped.includes("fonts.googleapis.com"));
  assert.ok(stripped.includes("bachi-serif-cjk.css"));
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.ok(html.includes("fonts.googleapis.com"));
});

check("staged app is the local UI without tests or a committed browser", function () {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-stage-"));
  stage.stage({ root: ROOT, bundleDir: dest, copyFfmpeg: false });
  assert.ok(fs.existsSync(path.join(dest, "index.html")));
  assert.ok(fs.existsSync(path.join(dest, "render.js")));
  assert.ok(fs.existsSync(path.join(dest, "js", "chrome-launch.js")));
  assert.ok(fs.existsSync(path.join(dest, "assets", "sounds", "don.wav")));
  assert.ok(!fs.existsSync(path.join(dest, "tests")));
  assert.ok(!fs.existsSync(path.join(dest, "node_modules")));
  assert.deepStrictEqual(stage.DIRS, ["js", "assets", "samples"]);
  fs.rmSync(dest, { recursive: true, force: true });
});

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("ok: chrome launch and windows package");
