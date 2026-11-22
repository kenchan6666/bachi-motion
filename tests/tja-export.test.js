/**
 * Export and new blank charts are CP932 + CRLF TJA, then parse back.
 * Fixtures are synthetic. No 手顺 in the file.
 *
 *   node tests/tja-export.test.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const author = require(path.join(__dirname, "..", "js", "chart-author.js"));
const parser = require(path.join(__dirname, "..", "js", "parser.js"));
const encoding = require(path.join(__dirname, "..", "js", "tja-encoding.js"));
const cp932 = require(path.join(__dirname, "..", "js", "tja-cp932.js"));
const tjaExport = require(path.join(__dirname, "..", "js", "tja-export.js"));
const renderServer = require(path.join(__dirname, "..", "js", "render-server.js"));

let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log("  ✓ " + name);
}

function noteSig(parsed) {
  return {
    title: parsed.headers.title,
    bpm: parsed.headers.bpm,
    offset: parsed.headers.offset,
    course: parsed.headers.course || "",
    level: String(parsed.headers.level == null ? "" : parsed.headers.level),
    measures: (parsed.measures || []).map(function (m) {
      return { beats: m.beats, slots: m.slots, notes: m.notes, measure: m.measure };
    }),
    notes: (parsed.notes || []).map(function (n) {
      return {
        type: n.type,
        char: n.char,
        pos: n.pos,
        measure: n.measure,
        bpm: n.bpm,
      };
    }),
  };
}

function assertPlayable(file) {
  assert.ok(file && file.bytes && file.bytes.length, "missing CP932 bytes");
  const bytes = Buffer.from(file.bytes);
  assert.ok(!(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF), "UTF-8 BOM was added");
  const latin = bytes.toString("latin1");
  assert.ok(latin.includes("\r\n"), "file is not CRLF");
  assert.ok(!/(^|[^\r])\n/.test(latin), "bare LF in file");
  const decoded = new TextDecoder("shift_jis").decode(bytes);
  assert.strictEqual(decoded, file.text);
  assert.strictEqual(encoding.decodeTjaBytes(bytes), file.text);
  const lines = file.text.split("\r\n");
  const starts = lines.filter(function (line) { return /^#START\b/.test(line.replace(/\/\/.*$/, "").trim()); });
  const ends = lines.filter(function (line) { return /^#END\b/.test(line.replace(/\/\/.*$/, "").trim()); });
  assert.strictEqual(ends.length, starts.length, "a COURSE is missing #END");
  assert.ok(starts.length >= 1, "course is missing #START");
  const nonAscii = Array.from(file.text).some(function (ch) { return ch.codePointAt(0) > 0x7E; });
  if (nonAscii) {
    assert.notDeepStrictEqual(bytes, Buffer.from(file.text, "utf8"));
    assert.throws(function () {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }, "non-ASCII chart was stored as UTF-8");
  }
  assert.ok(!file.text.includes("手顺"), "手顺 was written into the TJA");
  assert.ok(!file.text.includes("左手") && !file.text.includes("右手"), "hand label was written into the TJA");
}

function roundTrip(text, opts) {
  const file = tjaExport.exportChart(text, opts);
  assert.ok(file, "export returned nothing");
  assertPlayable(file);
  const parsed = parser.parseTja(file.text);
  return { file: file, parsed: parsed };
}

check("empty or broken text cannot export", function () {
  assert.strictEqual(tjaExport.canExport(""), false);
  assert.strictEqual(tjaExport.canExport("TITLE:空\nBPM:120\n"), false);
  assert.strictEqual(tjaExport.exportChart("not a chart"), null);
});

check("a custom chart with title, BPM, notes, and an added measure round-trips", function () {
  let tja = author.blankTja({ title: "春風", bpm: 96, measures: 2 });
  tja = author.placeNote(tja, { measure: 1, cell: 0, face: "don", size: "normal" }).tja;
  tja = author.placeNote(tja, { measure: 1, cell: 4, face: "ka", size: "normal" }).tja;
  tja = author.placeNote(tja, { measure: 1, cell: 8, face: "don", size: "big" }).tja;
  tja = author.placeNote(tja, { measure: 2, cell: 15, face: "ka", size: "big" }).tja;
  tja = author.appendMeasure(tja).tja;
  tja = author.applyChartMeta(tja, { title: "春風", bpm: 96 });

  const before = parser.parseTja(tja);
  const back = roundTrip(tja);
  assert.deepStrictEqual(noteSig(back.parsed), noteSig(before));
  assert.strictEqual(back.parsed.headers.title, "春風");
  assert.strictEqual(back.parsed.headers.bpm, 96);
  assert.strictEqual(back.parsed.headers.offset, 0);
  assert.strictEqual(back.parsed.measures.length, 3);
  assert.strictEqual(back.parsed.notes.length, 4);
  assert.deepStrictEqual(back.parsed.notes.map(function (n) { return n.char; }), ["1", "2", "3", "4"]);
  assert.strictEqual(back.file.filename, "春風.tja");
  assert.ok(!/WAVE/i.test(back.file.text), "blank chart invented a WAVE name");
  assert.ok(!back.file.text.includes("手顺"));
  assert.ok(!/"hand"/.test(back.file.text));
  assert.ok(!/"events"/.test(back.file.text));
  assert.ok(back.file.text.includes("OFFSET:0"));
  assert.ok(!/^COURSE:/m.test(back.file.text));
  assert.ok(!/^LEVEL:/m.test(back.file.text));
});

check("simplified characters CP932 cannot store are omitted, not written as UTF-8", function () {
  const tja = [
    "TITLE:春风试听",
    "SUBTITLE:风",
    "MAKER:风人",
    "BPM:120",
    "OFFSET:0",
    "#START",
    "12,",
    "#END",
    "",
  ].join("\n");
  const back = roundTrip(tja);
  assert.strictEqual(back.parsed.headers.title, "春听");
  assert.strictEqual(back.file.filename, "春听.tja");
  assert.ok(back.file.text.includes("TITLE:春听"));
  assert.ok(!back.file.text.includes("风"));
  assert.ok(!back.file.text.includes("试"));
  assert.ok(back.file.text.includes("MAKER:人"));
  assert.ok(!/^SUBTITLE:/m.test(back.file.text));
  assert.ok(!Buffer.from(back.file.bytes).includes(Buffer.from("风", "utf8")));
  assert.throws(function () { cp932.encodeStrict("风"); }, /U\+98CE/);
  const only = tjaExport.exportChart("TITLE:风\nBPM:120\nOFFSET:0\n#START\n1,\n#END\n");
  assert.strictEqual(only.title, "未命名");
  assert.strictEqual(only.filename, "未命名.tja");
  assert.ok(only.text.includes("TITLE:未命名"));
});

check("OFFSET, COURSE, and LEVEL reopen on the course that is open", function () {
  const tja = [
    "TITLE:双声",
    "BPM:100",
    "OFFSET:-0.25",
    "WAVE:song.ogg",
    "COURSE:Easy",
    "LEVEL:2",
    "#START",
    "1,",
    "#END",
    "COURSE:Oni",
    "LEVEL:9",
    "#START",
    "#MEASURE 3/4",
    "12,",
    "#BPMCHANGE 180",
    "2,",
    "#SCROLL 1.5",
    "8,",
    "#END",
    "",
  ].join("\n");
  const back = roundTrip(tja, { courseIndex: 1, course: "Oni" });
  assert.strictEqual(back.parsed.headers.title, "双声");
  assert.strictEqual(back.parsed.headers.bpm, 100);
  assert.strictEqual(back.parsed.headers.offset, -0.25);
  assert.strictEqual(back.parsed.headers.course, "Oni");
  assert.strictEqual(back.parsed.headers.level, "9");
  assert.strictEqual(back.parsed.courses.length, 1);
  assert.ok(back.file.text.includes("WAVE:song.ogg"));
  assert.ok(back.file.text.includes("#MEASURE 3/4"));
  assert.ok(back.file.text.includes("#BPMCHANGE 180"));
  assert.ok(back.file.text.includes("#SCROLL 1.5"));
  assert.ok(back.file.text.includes("8,"));
  assert.ok(!back.file.text.includes("COURSE:Easy"));
  assert.strictEqual(back.parsed.notes.length, 3);
  assert.strictEqual(back.parsed.notes[0].type, "don");
  assert.strictEqual(back.parsed.notes[0].bpm, 100);
  assert.strictEqual(back.parsed.notes[1].type, "ka");
  assert.strictEqual(back.parsed.notes[2].type, "ka");
  assert.strictEqual(back.parsed.notes[2].bpm, 180);
  assert.strictEqual(back.parsed.measures[0].beats, 3);
  assert.strictEqual(back.parsed.measures[2].slots, 1);
  assert.strictEqual(back.parsed.measures[2].notes, 0);
  assert.ok(!back.file.text.includes("手顺"));
  assert.ok(!/"hand"/.test(back.file.text));
});

check("an empty WAVE is not invented, and a real one is kept", function () {
  const named = [
    "TITLE:有声",
    "BPM:120",
    "OFFSET:0",
    "WAVE:audio.wav",
    "#START",
    "1,",
    "#END",
    "",
  ].join("\n");
  const kept = roundTrip(named);
  assert.ok(kept.file.text.includes("WAVE:audio.wav"));

  const blank = [
    "TITLE:无声",
    "BPM:120",
    "OFFSET:1.5",
    "WAVE:",
    "COURSE:Edit",
    "LEVEL:4",
    "#START",
    "2,",
    "#END",
    "",
  ].join("\n");
  const dropped = roundTrip(blank);
  assert.ok(!/^WAVE:/m.test(dropped.file.text));
  assert.strictEqual(dropped.parsed.headers.offset, 1.5);
  assert.strictEqual(dropped.parsed.headers.course, "Edit");
  assert.strictEqual(dropped.parsed.headers.level, "4");
  assert.strictEqual(dropped.parsed.notes[0].type, "ka");
});

check("download names stay safe and drop characters CP932 cannot store", function () {
  assert.strictEqual(tjaExport.filenameForTitle("春風"), "春風.tja");
  assert.strictEqual(tjaExport.filenameForTitle("春风"), "春.tja");
  assert.strictEqual(tjaExport.filenameForTitle("春风.tja"), "春.tja");
  assert.strictEqual(tjaExport.filenameForTitle("风"), "未命名.tja");
  assert.strictEqual(tjaExport.filenameForTitle("../a:b*?.tja"), "a_b.tja");
  assert.strictEqual(tjaExport.filenameForTitle("   "), "未命名.tja");
  assert.strictEqual(tjaExport.filenameForTitle(".."), "未命名.tja");
  const long = "歌".repeat(90);
  const named = tjaExport.filenameForTitle(long);
  assert.ok(named.endsWith(".tja"));
  assert.ok(Array.from(named.replace(/\.tja$/, "")).length <= 80);
});

check("a new blank chart file is CP932 CRLF and still titled 未命名", function () {
  const file = tjaExport.exportChart(author.blankTja());
  assertPlayable(file);
  assert.strictEqual(file.title, "未命名");
  assert.ok(file.text.includes("TITLE:未命名"));
  assert.ok(Buffer.from(file.bytes).includes(Buffer.from("96a296bd96bc", "hex")));
  assert.ok(!/WAVE/i.test(file.text));
  assert.strictEqual(file.filename, "未命名.tja");
  const direct = tjaExport.toPlayableFile(author.blankTja());
  assertPlayable(direct);
  assert.ok(direct.text.includes("TITLE:未命名"));
});

check("WAVE keeps the same-directory filename and drops one CP932 cannot store", function () {
  const nested = roundTrip([
    "TITLE:有声",
    "BPM:120",
    "OFFSET:0",
    "WAVE:music/song.ogg",
    "#START",
    "1,",
    "#END",
    "",
  ].join("\n"));
  assert.ok(nested.file.text.includes("WAVE:song.ogg"));
  assert.ok(!nested.file.text.includes("music/"));

  const windows = roundTrip([
    "TITLE:有声",
    "BPM:120",
    "OFFSET:0",
    "WAVE:C:\\songs\\take.wav",
    "#START",
    "1,",
    "#END",
    "",
  ].join("\n"));
  assert.ok(windows.file.text.includes("WAVE:take.wav"));

  const blocked = roundTrip([
    "TITLE:有声",
    "BPM:120",
    "OFFSET:0",
    "WAVE:风.ogg",
    "#START",
    "1,",
    "#END",
    "",
  ].join("\n"));
  assert.ok(!/^WAVE:/m.test(blocked.file.text));
  assert.ok(!blocked.file.text.includes("风"));
});

check("GOGO uses the standard commands and comments stay ASCII", function () {
  const back = roundTrip([
    "TITLE:demo",
    "BPM:120",
    "OFFSET:0",
    "#START",
    "11, // M118",
    "// 左手",
    "#gogotime",
    "00,",
    "#ENDGOGO",
    "#END",
    "",
  ].join("\n"));
  assert.ok(back.file.text.includes("// M118"));
  assert.ok(back.file.text.includes("#GOGOSTART"));
  assert.ok(back.file.text.includes("#GOGOEND"));
  assert.ok(!/GOGOTIME/i.test(back.file.text));
  assert.ok(!/ENDGOGO/i.test(back.file.text));
  assert.ok(!back.file.text.includes("左手"));
  const lines = back.file.text.split("\r\n");
  assert.strictEqual(lines.filter(function (line) { return /^#START\b/.test(line.trim()); }).length, 1);
  assert.strictEqual(lines.filter(function (line) { return /^#END\b/.test(line.trim()); }).length, 1);
});

check("a course without #END gains one, and each course keeps its pair", function () {
  const open = tjaExport.toPlayableFile("TITLE:demo\nBPM:120\n#START\n1,\n");
  assertPlayable(open);
  const lines = open.text.split("\r\n");
  assert.strictEqual(lines.filter(function (line) { return line.trim() === "#START"; }).length, 1);
  assert.strictEqual(lines.filter(function (line) { return line.trim() === "#END"; }).length, 1);

  const two = tjaExport.toPlayableFile([
    "TITLE:demo",
    "BPM:120",
    "#START",
    "1,",
    "#END",
    "COURSE:Oni",
    "#START",
    "2,",
    "",
  ].join("\n"));
  assertPlayable(two);
  const both = two.text.split("\r\n");
  assert.strictEqual(both.filter(function (line) { return line.trim() === "#START"; }).length, 2);
  assert.strictEqual(both.filter(function (line) { return line.trim() === "#END"; }).length, 2);

  const branched = tjaExport.toPlayableFile([
    "TITLE:demo",
    "BPM:120",
    "#START",
    "#BRANCHSTART",
    "#N",
    "11,",
    "#M",
    "22,",
    "#BRANCHEND",
    "00,",
    "#END",
    "",
  ].join("\n"));
  assert.ok(branched.text.includes("#BRANCHSTART"));
  assert.ok(branched.text.includes("#BRANCHEND"));
  assert.ok(!branched.text.includes("#BRANCH#"));
});

check("a character that would not round-trip is omitted instead of rewritten", function () {
  const file = tjaExport.toPlayableFile("TITLE:A\u301cB\nBPM:120\n#START\n1,\n#END\n");
  assertPlayable(file);
  assert.strictEqual(parser.parseTja(file.text).headers.title, "AB");
  assert.throws(function () { cp932.encodeStrict("\u301c"); }, /U\+301C/);
  assert.throws(function () { cp932.encodeStrict("\u007f"); }, /U\+007F/);
  const controls = tjaExport.toPlayableFile("TITLE:A\u007fB\nBPM:120\n#START\n1,\n#END\n");
  assert.strictEqual(parser.parseTja(controls.text).headers.title, "AB");
});

check("the render temp TJA is the same playable bytes", function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-tja-"));
  try {
    const jobs = renderServer.materializeJobs([{
      tjaText: "TITLE:春风\nBPM:120\nOFFSET:0\n#START\n1, // 说明\n#GOGOTIME\n2,\n#ENDGOGO\n#END\n",
      name: "chart.tja",
    }], dir);
    assert.ok(jobs[0].tjaText.includes("风"));
    assert.ok(jobs[0].tjaText.includes("说明"));
    const bytes = fs.readFileSync(jobs[0].tja);
    const text = new TextDecoder("shift_jis").decode(bytes);
    assertPlayable({ text: text, bytes: bytes });
    assert.ok(text.includes("TITLE:春"));
    assert.ok(!text.includes("风"));
    assert.ok(!text.includes("说明"));
    assert.ok(text.includes("#GOGOSTART"));
    assert.ok(text.includes("#GOGOEND"));
    assert.ok(!/GOGOTIME/i.test(text));
    assert.ok(!/ENDGOGO/i.test(text));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log(passed + " export checks passed");
