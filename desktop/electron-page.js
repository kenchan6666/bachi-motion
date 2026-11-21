"use strict";

const fs = require("node:fs");
const { BrowserWindow } = require("electron");

function webPreferences(disableGpu) {
  const prefs = {
    backgroundThrottling: false,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
  // CPU capture uses offscreen software rendering. The GPU path is a real
  // hidden window so Chromium's compositor can use the GPU. --disable-gpu
  // is not a capture preference; the app sets it only after fallback.
  if (disableGpu) prefs.offscreen = true;
  return prefs;
}

function createHiddenWindow(width, height, disableGpu) {
  const win = new BrowserWindow({
    width: width,
    height: height,
    show: false,
    frame: false,
    skipTaskbar: true,
    useContentSize: true,
    opacity: disableGpu ? 1 : 0,
    backgroundColor: "#ecebe6",
    webPreferences: webPreferences(disableGpu),
  });
  if (!disableGpu && typeof win.showInactive === "function") win.showInactive();
  return win;
}

function ElectronPage(win, width, height) {
  this.win = win;
  this.viewport = { width: width, height: height };
  if (win.webContents && typeof win.webContents.setFrameRate === "function") {
    win.webContents.setFrameRate(60);
  }
  // Offscreen Chromium pauses unless something listens for paint.
  win.webContents.on("paint", function () {});
}

ElectronPage.prototype.setViewport = function (viewport) {
  this.viewport = {
    width: viewport.width,
    height: viewport.height,
  };
  if (!this.win.isDestroyed()) {
    this.win.setContentSize(viewport.width, viewport.height);
  }
  return Promise.resolve();
};

ElectronPage.prototype.goto = function (url, opts) {
  const timeout = (opts && opts.timeout) || 30000;
  const win = this.win;
  let timer;
  const killer = new Promise(function (_resolve, reject) {
    timer = setTimeout(function () { reject(new Error("页面加载超时")); }, timeout);
  });
  const loading = win.loadURL(url).finally(function () { clearTimeout(timer); });
  return Promise.race([loading, killer]);
};

ElectronPage.prototype.evaluate = function (fn) {
  const args = Array.prototype.slice.call(arguments, 1);
  const payload = args.map(function (arg) { return JSON.stringify(arg); }).join(",");
  const source = "(" + fn.toString() + ")(" + payload + ")";
  return this.win.webContents.executeJavaScript(source, true);
};

ElectronPage.prototype.waitForFunction = async function (fn, opts) {
  const timeout = (opts && opts.timeout) || 15000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ok = await this.evaluate(fn);
    if (ok) return true;
    await new Promise(function (resolve) { setTimeout(resolve, 50); });
  }
  throw new Error("等待页面超时");
};

ElectronPage.prototype.screenshot = async function (opts) {
  opts = opts || {};
  const win = this.win;
  const painted = new Promise(function (resolve) {
    const timer = setTimeout(resolve, 250);
    win.webContents.once("paint", function () {
      clearTimeout(timer);
      resolve();
    });
  });
  await this.evaluate(function () {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { resolve(true); });
      });
    });
  });
  await painted;
  let image = await win.webContents.capturePage();
  const size = image.getSize();
  if (size.width !== this.viewport.width || size.height !== this.viewport.height) {
    image = image.resize({
      width: this.viewport.width,
      height: this.viewport.height,
      quality: "best",
    });
  }
  const buf = opts.type === "jpeg" ? image.toJPEG(opts.quality || 90) : image.toPNG();
  if (opts.path) fs.writeFileSync(opts.path, buf);
  return buf;
};

function createElectronOpener(opts) {
  const disableGpu = !!(opts && opts.disableGpu);
  return function openPage(size) {
    const width = (size && size.width) || 1920;
    const height = (size && size.height) || 1080;
    const win = createHiddenWindow(width, height, disableGpu);
    const page = new ElectronPage(win, width, height);
    return Promise.resolve({
      page: page,
      close: function () {
        if (!win.isDestroyed()) win.destroy();
        return Promise.resolve();
      },
    });
  };
}

module.exports = {
  createElectronOpener: createElectronOpener,
  webPreferences: webPreferences,
};
