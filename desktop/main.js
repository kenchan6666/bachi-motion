"use strict";

const { app, BrowserWindow, session, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { createElectronOpener } = require("./electron-page");

function runtimePaths() {
  const bundled = path.join(__dirname, "bundle");
  if (fs.existsSync(path.join(bundled, "render.js"))) {
    return {
      root: bundled,
      renderPath: path.join(bundled, "render.js"),
      chromeLaunchPath: path.join(bundled, "js", "chrome-launch.js"),
      serverPath: path.join(bundled, "js", "render-server.js"),
    };
  }
  const root = path.join(__dirname, "..");
  return {
    root: root,
    renderPath: path.join(root, "render.js"),
    chromeLaunchPath: path.join(root, "js", "chrome-launch.js"),
    serverPath: path.join(root, "js", "render-server.js"),
  };
}

function bundledFfmpeg() {
  const name = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const packaged = path.join(process.resourcesPath, "ffmpeg", name);
  if (fs.existsSync(packaged)) return packaged;
  try {
    const resolved = require("ffmpeg-static");
    if (resolved && fs.existsSync(resolved)) return resolved;
  } catch (err) { /* copied beside the app at package time */ }
  return packaged;
}

function isLocalUrl(raw) {
  try {
    const url = new URL(raw);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch (err) {
    return false;
  }
}

const paths = runtimePaths();
const launch = require(paths.chromeLaunchPath);
const { renderOne } = require(paths.renderPath);
const { startRenderServer } = require(paths.serverPath);

let mainWindow = null;
let serverHandle = null;

app.setName("bachi-motion");

let disableGpu = false;
let marker = null;
try {
  marker = path.join(app.getPath("userData"), "cpu-render");
  disableGpu = fs.existsSync(marker);
} catch (err) {
  disableGpu = false;
}
if (!disableGpu) {
  try {
    const hardware = launch.hasHardwareGpu(launch.probeGpuNames());
    if (hardware === false) disableGpu = true;
  } catch (err) { /* unknown GPU: try it, and relaunch on a GPU-process crash */ }
}

for (const flag of launch.electronGpuSwitches(disableGpu)) {
  app.commandLine.appendSwitch(flag);
}
if (disableGpu) app.disableHardwareAcceleration();

function rememberCpuAndRelaunch() {
  if (disableGpu || !marker) return;
  try {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, "cpu\n");
  } catch (err) { /* still try to relaunch */ }
  app.relaunch();
  app.exit(0);
}

app.on("child-process-gone", function (_event, details) {
  if (!details || details.type !== "GPU") return;
  if (details.reason === "clean-exit") return;
  rememberCpuAndRelaunch();
});

function blockRemoteRequests() {
  const filter = { urls: ["http://*/*", "https://*/*"] };
  session.defaultSession.webRequest.onBeforeRequest(filter, function (details, callback) {
    if (isLocalUrl(details.url)) callback({});
    else callback({ cancel: true });
  });
}

async function start() {
  const ffmpeg = bundledFfmpeg();
  if (!fs.existsSync(ffmpeg)) {
    throw new Error("安装包里没有 ffmpeg，无法出片。");
  }
  process.env.BACHI_FFMPEG = ffmpeg;
  blockRemoteRequests();

  serverHandle = await startRenderServer({
    port: 0,
    root: paths.root,
    offlineDesktop: true,
    renderJob: function (job, ctx) {
      return renderOne(job, Object.assign({}, ctx, {
        openPage: createElectronOpener({ disableGpu: disableGpu }),
        gpu: !disableGpu,
      }));
    },
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: "bachi-motion",
    backgroundColor: "#F6F1E8",
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once("ready-to-show", function () { mainWindow.show(); });
  await mainWindow.loadURL("http://127.0.0.1:" + serverHandle.port + "/");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", function () {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(start).catch(function (err) {
    dialog.showErrorBox("bachi-motion", err && err.message ? err.message : String(err));
    app.quit();
  });
}

app.on("window-all-closed", function () { app.quit(); });
app.on("before-quit", function () {
  if (serverHandle) {
    try { serverHandle.close(); } catch (err) { /* ignore */ }
    serverHandle = null;
  }
});
