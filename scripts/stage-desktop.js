"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FILES = ["index.html", "render.js"];
const DIRS = ["js", "assets", "samples"];

function stage(opts) {
  opts = opts || {};
  const root = opts.root || path.join(__dirname, "..");
  const bundleDir = opts.bundleDir || path.join(root, "desktop", "bundle");
  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.mkdirSync(bundleDir, { recursive: true });
  for (const file of FILES) {
    fs.copyFileSync(path.join(root, file), path.join(bundleDir, file));
  }
  for (const dir of DIRS) {
    fs.cpSync(path.join(root, dir), path.join(bundleDir, dir), { recursive: true });
  }
  if (opts.copyFfmpeg) {
    const ff = require(path.join(root, "desktop", "node_modules", "ffmpeg-static"));
    if (!ff || !fs.existsSync(ff)) {
      throw new Error("ffmpeg-static did not provide a binary");
    }
    const destDir = path.join(root, "desktop", "vendor", "ffmpeg");
    fs.mkdirSync(destDir, { recursive: true });
    const destName = process.platform === "win32" ? "ffmpeg.exe" : path.basename(ff);
    fs.copyFileSync(ff, path.join(destDir, destName));
  }
  return bundleDir;
}

if (require.main === module) {
  const copyFfmpeg = process.argv.indexOf("--with-ffmpeg") >= 0 || process.platform === "win32";
  const bundleDir = stage({ copyFfmpeg: copyFfmpeg });
  console.log("[bachi-motion] staged " + bundleDir);
}

module.exports = {
  FILES: FILES,
  DIRS: DIRS,
  stage: stage,
};
