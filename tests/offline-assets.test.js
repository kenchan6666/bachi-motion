"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) walk(file, out);
    else out.push(file);
  }
  return out;
}

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("  ✓ " + name);
}

check("the page no longer points at Google Fonts or another CDN", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(!html.includes("fonts.googleapis.com"));
  assert.ok(!html.includes("fonts.gstatic.com"));
  assert.ok(!html.includes("unpkg.com"));
  assert.ok(!html.includes("jsdelivr"));
  assert.ok(html.includes('href="assets/fonts/ui.css"'));
  assert.ok(html.includes("Noto Serif SC"));
  assert.ok(html.includes("Noto Serif TC"));
  assert.ok(html.includes("Zen Maru Gothic"));
});

check("shipped UI faces are local woff2 files", () => {
  const cssPath = path.join(root, "assets", "fonts", "ui.css");
  assert.ok(fs.existsSync(cssPath));
  const css = fs.readFileSync(cssPath, "utf8");
  assert.ok(css.includes("@font-face"));
  assert.ok(css.includes("Noto Serif SC"));
  assert.ok(css.includes("Noto Serif TC"));
  assert.ok(css.includes("Zen Maru Gothic"));
  assert.ok(!css.includes("https://"));
  assert.ok(!css.includes("http://"));
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1].replace(/["']/g, ""));
  assert.ok(urls.length > 0);
  for (const url of urls) {
    assert.ok(!url.includes("://"), url);
    const file = path.resolve(path.dirname(cssPath), url);
    assert.ok(fs.existsSync(file), url);
    assert.ok(fs.statSync(file).size > 100, url);
  }
});

check("app scripts and styles do not load remote http(s) assets", () => {
  const files = [];
  walk(path.join(root, "js"), files);
  walk(path.join(root, "assets"), files);
  walk(path.join(root, "desktop"), files);
  files.push(path.join(root, "index.html"));
  files.push(path.join(root, "render.js"));
  const remote = /https?:\/\/(?!(?:www\.w3\.org\/|127\.0\.0\.1\b|localhost\b))/;
  for (const file of files) {
    if (!/\.(js|css|html)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    assert.ok(!remote.test(text), path.relative(root, file));
  }
});

console.log("offline-assets tests: " + passed);
