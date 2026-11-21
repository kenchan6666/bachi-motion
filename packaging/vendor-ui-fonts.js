"use strict";

/**
 * Download the UI/title fallback faces that index.html used to load from
 * Google Fonts, and rewrite them to local woff2 files.
 * Run once when those faces change. The committed files are what the app uses.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const CSS_URL = "https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@700&family=Noto+Serif+SC:wght@700&family=Noto+Serif+TC:wght@700&family=Zen+Maru+Gothic:wght@400;500;700&display=swap";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const OUT_DIR = path.join(__dirname, "..", "assets", "fonts", "files");
const OUT_CSS = path.join(__dirname, "..", "assets", "fonts", "ui.css");

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": UA, "Accept": "text/css,*/*;q=0.1" },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(get(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error("GET " + url + " -> " + res.statusCode));
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
  });
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const css = (await get(CSS_URL)).toString("utf8");
  if (!css.includes("@font-face") || /fonts\.gstatic\.com/.test(css) === false) {
    throw new Error("Google Fonts CSS did not include woff2 faces");
  }
  const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map((match) => match[1]);
  if (!urls.length) throw new Error("no font URLs");
  let next = css;
  let index = 0;
  for (const url of urls) {
    const file = "ui-" + String(index).padStart(3, "0") + ".woff2";
    const dest = path.join(OUT_DIR, file);
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 100) {
      const body = await get(url);
      fs.writeFileSync(dest, body);
    }
    next = next.split(url).join("files/" + file);
    index += 1;
  }
  if (next.includes("https://") || next.includes("http://")) {
    throw new Error("rewritten CSS still has a remote URL");
  }
  const header = "/* Local faces for offline use. Noto Serif JP/SC/TC and Zen Maru Gothic, SIL OFL 1.1. */\n";
  fs.writeFileSync(OUT_CSS, header + next);
  const bytes = fs.readdirSync(OUT_DIR).reduce((sum, name) => sum + fs.statSync(path.join(OUT_DIR, name)).size, 0);
  console.log("faces " + index + " bytes " + bytes);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
