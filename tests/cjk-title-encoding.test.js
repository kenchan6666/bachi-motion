/**
 * Simplified / Traditional title fitting, font fallback, and TJA encoding.
 * Fixtures are synthetic titles only — no official charts.
 *
 *   node tests/cjk-title-encoding.test.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const encoding = require(path.join(__dirname, "..", "js", "tja-encoding.js"));
const fit = require(path.join(__dirname, "..", "js", "title-fit.js"));
const parser = require(path.join(__dirname, "..", "js", "parser.js"));

const ROOT = path.join(__dirname, "..");
let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log("  ✓ " + name);
}

function charWidth(text, px) {
  return Array.from(text).length * px;
}

// Shift-JIS bytes for synthetic charts (CP932). UTF-8 reads them as U+FFFD.
const SJIS_KATA = Buffer.from("5449544c453a8365835883670a42504d3a3132300a2353544152540a31312c0a23454e440a", "hex");
const SJIS_PRACTICE = Buffer.from("5449544c453a97fb8f4b8bc80a42504d3a39300a2353544152540a31322c0a23454e440a", "hex");

check("UTF-8 Simplified title is kept and parses", function () {
  const text = "TITLE:测试曲\nBPM:120\n#START\n11,\n#END\n";
  const decoded = encoding.decodeTjaBytes(Buffer.from(text, "utf8"));
  assert.strictEqual(decoded, text);
  assert.strictEqual(parser.eventsFromTja(decoded).song, "测试曲");
});

check("UTF-8 Traditional title is kept and parses", function () {
  const text = "TITLE:測試曲\nBPM:96\n#START\n12,\n#END\n";
  const decoded = encoding.decodeTjaBytes(Buffer.from(text, "utf8"));
  assert.strictEqual(decoded, text);
  assert.strictEqual(parser.eventsFromTja(decoded).song, "測試曲");
});

check("Shift-JIS that mojibakes as UTF-8 retries and opens テスト", function () {
  const asUtf8 = new TextDecoder("utf-8").decode(SJIS_KATA);
  assert.ok(asUtf8.includes("\uFFFD"));
  assert.ok(!asUtf8.includes("テスト"));
  const decoded = encoding.decodeTjaBytes(SJIS_KATA);
  assert.ok(!decoded.includes("\uFFFD"));
  assert.strictEqual(parser.eventsFromTja(decoded).song, "テスト");
});

check("Shift-JIS 練習曲 retries instead of staying mojibake", function () {
  const asUtf8 = new TextDecoder("utf-8").decode(SJIS_PRACTICE);
  assert.ok(asUtf8.includes("\uFFFD"));
  const decoded = encoding.decodeTjaBytes(SJIS_PRACTICE);
  assert.strictEqual(parser.eventsFromTja(decoded).song, "練習曲");
});

check("ASCII TJA is unchanged", function () {
  const text = "TITLE:demo\nBPM:120\n#START\n1,\n#END\n";
  assert.strictEqual(encoding.decodeTjaBytes(Buffer.from(text, "utf8")), text);
});

check("short Simplified title stays whole at the max size", function () {
  const title = "测试曲";
  const fitted = fit.fitTitleLine(title, 200, { maxPx: 20, minPx: 11, measure: charWidth });
  assert.strictEqual(fitted.text, title);
  assert.strictEqual(fitted.fontSize, 20);
  assert.strictEqual(fitted.ellipsized, false);
});

check("a line that does not fit shrinks before it ellipsizes", function () {
  const title = "一二三四五六七八";
  const fitted = fit.fitTitleLine(title, 100, { maxPx: 20, minPx: 10, measure: charWidth });
  assert.strictEqual(fitted.text, title);
  assert.strictEqual(fitted.ellipsized, false);
  assert.ok(fitted.fontSize < 20);
  assert.ok(fitted.fontSize + 1e-6 >= 10);
  assert.ok(charWidth(fitted.text, fitted.fontSize) <= 100 + 1e-6);
});

check("overflowing Simplified title shrinks to the floor then ellipsizes", function () {
  const title = "测试曲名传统字";
  const fitted = fit.fitTitleLine(title, 40, { maxPx: 16, minPx: 10, measure: charWidth });
  assert.strictEqual(fitted.text, "测试曲…");
  assert.strictEqual(fitted.ellipsized, true);
  assert.ok(Math.abs(fitted.fontSize - 10) < 1e-6);
  assert.ok(fitted.text.length > 0);
});

check("overflowing Traditional title keeps a visible prefix", function () {
  const title = "測試樂曲名稱很長很長";
  const fitted = fit.fitTitleLine(title, 30, { maxPx: 18, minPx: 10, measure: charWidth });
  assert.ok(fitted.ellipsized);
  assert.ok(fitted.text.startsWith("測"));
  assert.ok(fitted.text.endsWith("…"));
  assert.notStrictEqual(fitted.text, "");
  assert.notStrictEqual(fitted.text, "…");
});

check("a title is never cropped down to a blank", function () {
  for (const title of ["测试曲", "測試曲", "妳嗯喔"]) {
    const fitted = fit.fitTitleLine(title, 1, {
      maxPx: 20,
      minPx: 12,
      measure: function (text, px) { return Array.from(text).length * px * 10; },
    });
    assert.notStrictEqual(fitted.text, "");
    assert.notStrictEqual(fitted.text, "…");
    assert.ok(title.startsWith(Array.from(fitted.text)[0]));
  }
});

check("title face loads Bachi plus Noto Serif SC and TC", function () {
  const specs = fit.titleFontLoadSpecs();
  assert.ok(specs.some(function (s) { return s.indexOf("Bachi Serif CJK") >= 0; }));
  assert.ok(specs.some(function (s) { return s.indexOf("Noto Serif SC") >= 0; }));
  assert.ok(specs.some(function (s) { return s.indexOf("Noto Serif TC") >= 0; }));
  assert.ok(fit.FONT_STACK.indexOf('"Noto Serif SC"') >= 0);
  assert.ok(fit.FONT_STACK.indexOf('"Noto Serif TC"') >= 0);
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.ok(html.indexOf("family=Noto+Serif+SC") >= 0);
  assert.ok(html.indexOf("family=Noto+Serif+TC") >= 0);
  assert.ok(html.indexOf("--font-title:") >= 0 && html.indexOf("Noto Serif SC") >= 0 && html.indexOf("Noto Serif TC") >= 0);
  assert.ok(html.indexOf("font-family: var(--font-title)") >= 0);
  const songRule = html.slice(html.indexOf(".song {"), html.indexOf(".song {") + 400);
  assert.ok(songRule.indexOf("var(--font-title)") >= 0);
  assert.ok(songRule.indexOf("text-overflow: ellipsis") >= 0);
  assert.ok(songRule.indexOf("min-width: 4.5em") >= 0);
});

check("chart track horizontal scrollbar is thickened", function () {
  const css = fs.readFileSync(path.join(ROOT, "assets/editor.css"), "utf8");
  assert.ok(css.indexOf(".editor-scroll::-webkit-scrollbar {") >= 0);
  assert.ok(css.indexOf("height: 18px;") >= 0);
});

console.log("cjk-title-encoding: " + passed + " passed");
