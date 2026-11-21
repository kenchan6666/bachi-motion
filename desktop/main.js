"use strict";

/**
 * bachi-motion desktop window.
 * Double-clicking the exe opens this window. It does not open Chrome,
 * Edge, or any other browser, and it does not need a network connection.
 * The window and the frame capture both use the Chromium shipped with the app.
 * ffmpeg is bundled under resources/ffmpeg when the Windows zip is built.
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session, shell } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const accel = require("../js/render-accel");
const batch = require("../js/batch-queue");
const { materializeJobs } = require("../js/render-server");
const { renderJob } = require("./export-frames");

const pkg = require("../package.json");
const APP_ROOT = path.join(__dirname, "..");
const CPU_FLAG = "--bachi-cpu";

process.env.BACHI_DESKTOP = "1";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "bachi",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const forceCpu = process.argv.includes(CPU_FLAG) || process.env.BACHI_RENDER === "cpu";
const detectedGpu = accel.detectGpu();
let useGpu = !forceCpu && detectedGpu.available && process.env.BACHI_RENDER !== "cpu";

for (const sw of accel.electronSwitches(useGpu, process.platform)) {
  if (sw.length > 1 && sw[1] != null) app.commandLine.appendSwitch(sw[0], String(sw[1]));
  else app.commandLine.appendSwitch(sw[0]);
}
if (!useGpu) app.disableHardwareAcceleration();

let mainWindow = null;
let relaunching = false;
let quitting = false;
let outputDir = "";

function outputRoot() {
  if (outputDir) return outputDir;
  let base = "";
  try { base = app.getPath("videos"); } catch { base = ""; }
  if (!base) {
    try { base = app.getPath("documents"); } catch { base = os.homedir(); }
  }
  outputDir = path.join(base, "bachi-motion");
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

function safeVideoName(label) {
  const base = String(label || "bachi").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
  return /\.mp4$/i.test(base) ? base : (base + ".mp4");
}

function uniqueOutput(name) {
  const root = outputRoot();
  let file = path.join(root, name);
  if (!fs.existsSync(file)) return file;
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 2; n < 1000; n++) {
    file = path.join(root, stem + "-" + n + ext);
    if (!fs.existsSync(file)) return file;
  }
  return path.join(root, stem + "-" + Date.now() + ext);
}

function isAllowedOutput(file) {
  if (!file) return false;
  const resolved = path.resolve(file);
  const root = path.resolve(outputRoot());
  return (resolved === root || resolved.startsWith(root + path.sep)) && fs.existsSync(resolved);
}

function relaunchOnCpu(reason) {
  if (quitting || relaunching || process.argv.includes(CPU_FLAG) || !useGpu) return;
  relaunching = true;
  console.warn("[bachi-motion] " + (reason || "显卡初始化失败") + "，改用 CPU 重新打开。");
  try { app.releaseSingleInstanceLock(); } catch { /* ignore */ }
  const args = process.argv.slice(1).filter((arg) => arg !== CPU_FLAG);
  args.push(CPU_FLAG);
  app.relaunch({ args: args });
  app.exit(0);
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".tja": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".md": "text/plain; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".mp4": "video/mp4",
  };
  return types[ext] || "application/octet-stream";
}

function fileFromAppUrl(requestUrl) {
  const url = new URL(requestUrl);
  let rel = decodeURIComponent(url.pathname || "/");
  if (rel === "/" || rel === "") rel = "index.html";
  else rel = rel.replace(/^[/\\]+/, "");
  const file = path.resolve(APP_ROOT, rel);
  const root = path.resolve(APP_ROOT);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

function registerAppProtocol() {
  protocol.handle("bachi", (request) => {
    const file = fileFromAppUrl(request.url);
    if (!file) return new Response("forbidden", { status: 403 });
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return new Response("not found", { status: 404 });
    }
    const body = fs.readFileSync(file);
    return new Response(body, {
      headers: {
        "Content-Type": mimeFor(file),
        "Content-Length": String(body.length),
        "Cache-Control": "no-store",
      },
    });
  });
}

function blockRemoteRequests() {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = String(details.url || "");
    const allowed = url.startsWith("bachi://") || url.startsWith("file:") || url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("devtools:");
    if (!allowed) {
      console.error("[bachi-motion] 已拦截联网请求 " + url);
    }
    callback({ cancel: !allowed });
  });
}

function showFfmpegMissing(win) {
  const text = accel.missingFfmpegMessage();
  const target = win && !win.isDestroyed() ? win : null;
  dialog.showMessageBox(target || undefined, {
    type: "error",
    title: "bachi-motion",
    message: "找不到 ffmpeg，没法出片。",
    detail: text,
  }).catch(() => {});
  if (target) {
    target.webContents.executeJavaScript(
      "(() => { const el = document.getElementById('renderStatus'); if (el) el.textContent = " +
      JSON.stringify("找不到 ffmpeg，没法出片。请重新解压完整的安装包。") +
      "; })()"
    ).catch(() => {});
  }
}

function installMenu(ffmpegReady) {
  const template = [
    {
      label: "文件",
      submenu: [
        { label: "打开成片文件夹", click: () => shell.openPath(outputRoot()) },
        { type: "separator" },
        { label: "退出", role: "quit" },
      ],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "关于 bachi-motion",
          click: () => {
            const gpuLine = useGpu
              ? "当前优先使用显卡画画面。编码会先试 NVIDIA NVENC、AMD AMF、Intel QSV，不行再用 libx264。"
              : "当前使用 CPU 画画面，编码使用 libx264。没有显卡，或显卡初始化失败时会自动走这条路。";
            const ffmpegLine = ffmpegReady
              ? "ffmpeg 已随安装包放在本程序里，不需要另外安装，也不需要联网。"
              : "没有找到 ffmpeg。请重新解压完整的 zip。";
            dialog.showMessageBox({
              type: "info",
              title: "bachi-motion " + pkg.version,
              message: "bachi-motion " + pkg.version,
              detail: [
                "这是程序自己的窗口，用来打开谱面和出片。",
                "窗口和逐帧渲染都用安装包自带的 Chromium，不会打开 Chrome 或其他浏览器。",
                ffmpegLine,
                gpuLine,
                "断网也可以用。",
              ].join("\n"),
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function wireWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!String(url).startsWith("bachi://app/")) event.preventDefault();
  });
  win.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.error("[bachi-motion] 页面没有打开 " + code + " " + desc + " " + url);
  });
  win.webContents.on("did-finish-load", () => {
    win.webContents.executeJavaScript(
      "({ title: document.title, render: !!document.getElementById('renderStart') })"
    ).then((info) => {
      if (!info || !info.render) console.error("[bachi-motion] 出片按钮没有出现");
      else console.log("[bachi-motion] 窗口已打开");
    }).catch((err) => {
      console.error("[bachi-motion] 页面脚本没有跑起来 " + (err && err.message ? err.message : err));
    });
    win.webContents.executeJavaScript(`
      (() => {
        const hint = document.getElementById("renderHint");
        if (!hint) return;
        const paragraphs = hint.querySelectorAll("p");
        const last = paragraphs[paragraphs.length - 1];
        if (last) last.textContent = "直接在这个窗口出片。不用打开浏览器，不用安装 Node 或 Chrome，也不用联网。有显卡就用显卡，显卡不可用时自动改用 CPU。";
      })()
    `).catch(() => {});
  });
}

function createWindow(ffmpegReady) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#F6F1E8",
    title: "bachi-motion",
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  mainWindow = win;
  wireWindow(win);
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.loadURL("bachi://app/index.html");
  if (!ffmpegReady) {
    win.webContents.once("did-finish-load", () => showFfmpegMissing(win));
  }
  return win;
}

function clientSnap(id, snap, names) {
  const files = (snap.files || []).map((file, index) => ({
    index: index,
    ok: !!file.ok,
    error: file.error || null,
    name: names[index] || safeVideoName("bachi"),
    url: null,
    filePath: file.ok ? (file.out || null) : null,
  }));
  return {
    id: id,
    total: snap.total,
    currentIndex: snap.currentIndex,
    currentLabel: snap.currentLabel,
    itemFraction: snap.itemFraction,
    overallFraction: snap.overallFraction,
    positionLabel: snap.positionLabel,
    frame: snap.frame,
    frameCount: snap.frameCount,
    done: snap.done,
    failed: snap.failed,
    succeeded: snap.succeeded,
    files: snap.done ? files : [],
  };
}

function sendSnap(sender, snap) {
  if (!sender || sender.isDestroyed()) return;
  sender.send("bachi:batch-event", snap);
}

ipcMain.handle("bachi:open-path", (_event, filePath) => {
  if (!isAllowedOutput(filePath)) return false;
  shell.showItemInFolder(path.resolve(filePath));
  return true;
});

ipcMain.handle("bachi:start-batch", async (event, payload) => {
  let ffmpegPath = null;
  try { ffmpegPath = accel.prepareFfmpeg(); }
  catch (err) {
    showFfmpegMissing(BrowserWindow.fromWebContents(event.sender));
    throw err;
  }
  if (!ffmpegPath) {
    const err = new Error(accel.missingFfmpegMessage());
    showFfmpegMissing(BrowserWindow.fromWebContents(event.sender));
    throw err;
  }
  const jobs = payload && Array.isArray(payload.jobs) ? payload.jobs : [];
  if (!jobs.length) throw new Error("队列是空的");
  const id = crypto.randomBytes(8).toString("hex");
  const sender = event.sender;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-batch-"));
  setTimeout(() => {
    let list = [];
    try {
      list = materializeJobs(jobs, dir);
    } catch (err) {
      sendSnap(sender, {
        id: id,
        total: jobs.length,
        currentIndex: 0,
        currentLabel: "",
        itemFraction: 1,
        overallFraction: 1,
        positionLabel: jobs.length + "/" + jobs.length,
        frame: 0,
        frameCount: 0,
        done: true,
        failed: jobs.length,
        succeeded: 0,
        files: jobs.map((_, index) => ({
          index: index,
          ok: false,
          error: err.message || String(err),
          name: safeVideoName(jobs[index] && jobs[index].name),
          filePath: null,
        })),
      });
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
      return;
    }
    const names = list.map((job) => safeVideoName(job.label));
    batch.runBatch(list, {
      renderJob: async (job, ctx) => {
        const out = await renderJob(BrowserWindow, job, ctx);
        const dest = uniqueOutput(safeVideoName(job.label));
        fs.copyFileSync(out, dest);
        return dest;
      },
      onProgress(snap) {
        sendSnap(sender, clientSnap(id, snap, names));
      },
    }).catch((err) => {
      sendSnap(sender, {
        id: id,
        total: list.length,
        currentIndex: 0,
        currentLabel: "",
        itemFraction: 1,
        overallFraction: 1,
        positionLabel: list.length + "/" + list.length,
        frame: 0,
        frameCount: 0,
        done: true,
        failed: list.length,
        succeeded: 0,
        files: list.map((job, index) => ({
          index: index,
          ok: false,
          error: err.message || String(err),
          name: safeVideoName(job.label),
          filePath: null,
        })),
      });
    }).finally(() => {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    });
  }, 300);
  return { id: id };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("child-process-gone", (_event, details) => {
    if (details && details.type === "GPU" && details.reason !== "clean-exit") {
      relaunchOnCpu("显卡进程退出了");
    }
  });

  app.whenReady().then(async () => {
    app.setName("bachi-motion");
    if (process.platform === "win32") {
      app.setAppUserModelId("com.bachimotion.desktop");
    }
    registerAppProtocol();
    blockRemoteRequests();
    if (useGpu) {
      try {
        const status = app.getGPUFeatureStatus();
        if (accel.featureStatusIsSoftware(status)) relaunchOnCpu("显卡初始化失败");
      } catch (err) {
        console.warn("[bachi-motion] 暂时读不到显卡状态，继续尝试显卡。");
      }
    }
    if (relaunching) return;
    let ffmpegReady = false;
    try {
      accel.prepareFfmpeg();
      ffmpegReady = true;
    } catch (err) {
      console.error(err && err.message ? err.message : err);
    }
    if (useGpu) {
      const names = detectedGpu.names && detectedGpu.names.length ? "（" + detectedGpu.names.join("、") + "）" : "";
      console.log("[bachi-motion] 画面使用显卡" + names);
    } else {
      console.log("[bachi-motion] 画面使用 CPU");
    }
    installMenu(ffmpegReady);
    createWindow(ffmpegReady);
    if (ffmpegReady) {
      accel.resolveVideoEncoder().then((encoder) => {
        console.log("[bachi-motion] 编码：" + encoder.label);
      }).catch((err) => {
        console.error(err && err.message ? err.message : err);
      });
    }
  });

  app.on("before-quit", () => {
    quitting = true;
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
