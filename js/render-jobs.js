"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const TaikoParser = require("./parser.js");
const tjaEncoding = require("./tja-encoding.js");
const audio = require("./audio-mux.js");
const LoopRange = require("./loop-range.js");

function defaultWorkers() {
  return Math.max(1, Math.min(6, os.cpus().length - 2));
}

const HELP = `bachi-motion — render a 手元 (first-person hand-cam) mp4

Usage:
  node render.js --tja 谱.tja --course Oni --technique 全换 --hand R --roll 自动滚奏 --audio --fps 60 --out out.mp4
  node render.js --tja 谱.tja --song 原曲.wav --out 手元.mp4
  node render.js --batch queue.json
  node render.js --serve

Flags:
  --tja <path>         Input TJA chart (read from local disk only; do not commit user charts)
  --song <path>        Optional original audio (wav/ogg/mp3/mp4/…). Aligned at chartStart =
                       firstNoteTime - 0.7. Note times already include OFFSET; it is not
                       subtracted again. Omit this to export with no original music.
  --course <name>      COURSE/difficulty if the TJA has several (default: Oni, else Ura/Edit, else first). Aliases: 0–4, Oni/おに, Edit/Ura/裏.
  --measures <A-B>     Inclusive 1-based measure range (default: whole chart)
  --rate <n>           Slow-motion factor applied to the video timeline (default 1).
                       0.5 → video is 2× longer. renderAt still receives real chart time.
  --sticking <path>    Optional 手顺 JSON. If omitted, autoSticking is used.
  --technique <name>   手法: 全换 (default) / 半换A / 半换B / 炒菜. Ignored when --sticking is set.
  --hand <R|L>         惯用手 (default R). Ignored when --sticking is set.
  --roll <mode>        滚奏: 不滚奏 / 自动滚奏 (default) / 24分滚奏. Ignored when --sticking is set.
  --bignote <mode>     Big-note handling: single (default) / both / small
  --fps <n>            Frames per second (default 60)
  --size <1080p|720p|WxH>  Output resolution (default 1080p)
  --workers <n>        Parallel render workers (default: min(6, cpus-2) = ${defaultWorkers()};
                       1 = legacy single-page PNG-to-disk path)
  --audio              Mix bundled don/ka hits (assets/sounds/*.wav, synthesized, not official)
  --section <a,b>      Trim preview/export to the same range as the progress-bar caps,
                       in chart seconds (event.t). Start is the earlier of <a> and
                       (first note in range − 0.7). End is <b>. Omit for the whole chart.
                       OFFSET is already in the note times; it is not subtracted again.
  --out <path>         Output mp4 path (required for a single job)
  --batch <queue.json> Render every job in a queue file. Each job may set its own song
                       and its own sectionStart/sectionEnd. A queue-level section is ignored.
  --serve              Local website + batch renderer on 127.0.0.1 (not for GitHub Pages)
  --port <n>           Port for --serve (default 8756)

Queue file (paths are relative to the JSON file). No song field → no original audio:
  { "fps": 60, "size": "1080p", "jobs": [
      { "tja": "a.tja", "song": "a.wav", "out": "a.mp4", "sectionStart": 2, "sectionEnd": 6 },
      { "tja": "b.tja", "out": "b.mp4" }
  ]}

Requires: Node, ffmpeg on PATH, and a Chrome/Chromium that puppeteer-core can launch
(set CHROME_PATH or PUPPETEER_EXECUTABLE_PATH if it is not found automatically).
Rendering runs on this computer. Do not commit official songs, charts, or videos.
`;

function parseArgs(argv) {
  const args = {
    tja: null,
    song: null,
    course: null,
    measures: null,
    rate: 1,
    sticking: null,
    technique: undefined,
    hand: "R",
    roll: "自动滚奏",
    bignote: "single",
    fps: 60,
    size: "1080p",
    workers: defaultWorkers(),
    audio: false,
    sectionStart: null,
    sectionEnd: null,
    out: null,
    batch: null,
    serve: false,
    port: 8756,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => {
      const v = argv[++i];
      if (v == null || String(v).startsWith("--")) throw new Error("缺少参数值：" + a);
      return v;
    };
    switch (a) {
      case "--tja": args.tja = need(); break;
      case "--song": args.song = need(); break;
      case "--course": args.course = need(); break;
      case "--measures": args.measures = need(); break;
      case "--rate": args.rate = Number(need()); break;
      case "--sticking": args.sticking = need(); break;
      case "--technique": args.technique = need(); break;
      case "--hand": args.hand = need(); break;
      case "--roll": args.roll = need(); break;
      case "--bignote": args.bignote = need(); break;
      case "--fps": args.fps = Number(need()); break;
      case "--size": args.size = need(); break;
      case "--workers": args.workers = Number(need()); break;
      case "--audio": args.audio = true; break;
      case "--section": {
        const raw = String(need());
        const m = raw.match(/^(-?\d+(?:\.\d+)?)\s*[,:]\s*(-?\d+(?:\.\d+)?)$/);
        if (!m) throw new Error("--section 应为 起点,终点（秒），例如 2,6");
        args.sectionStart = Number(m[1]);
        args.sectionEnd = Number(m[2]);
        if (!(args.sectionEnd > args.sectionStart)) throw new Error("--section 终点必须晚于起点");
        break;
      }
      case "--out": args.out = need(); break;
      case "--batch": args.batch = need(); break;
      case "--serve": args.serve = true; break;
      case "--port": args.port = Number(need()); break;
      case "--help":
      case "-h": args.help = true; break;
      default: throw new Error("未知参数：" + a + "\n" + HELP);
    }
  }
  return args;
}

function optionalSeconds(value) {
  if (value == null || value === "") return null;
  const n = +value;
  return Number.isFinite(n) ? n : null;
}

function buildPayload(args) {
  const tjaText = args.tjaText != null
    ? String(args.tjaText)
    : tjaEncoding.decodeTjaBytes(fs.readFileSync(path.resolve(args.tja)));
  const opts = {
    course: args.course,
    measures: args.measures,
    bigNote: args.bignote,
    手法: args.technique,
    惯用手: args.hand,
    滚奏: args.roll,
  };
  if (args.technique != null && String(args.technique).trim() !== "") {
    opts.titleTechnique = args.technique;
  }
  let data;
  if (args.sticking) {
    const jsonText = fs.readFileSync(path.resolve(args.sticking), "utf8");
    if (typeof TaikoParser.chartFromTjaAndHands === "function") {
      data = TaikoParser.chartFromTjaAndHands(tjaText, jsonText, opts);
    } else {
      const base = TaikoParser.eventsFromTja(tjaText, opts);
      const hands = TaikoParser.loadHandJson(jsonText, {
        measures: args.measures,
        rangeStart: base.rangeStart,
        rangeEnd: base.rangeEnd,
        timeShift: base.timeShift || 0,
        chartMeasures: base.chartMeasures,
        bigNote: args.bignote,
      });
      data = Object.assign({}, base, hands, {
        rangeStart: base.rangeStart,
        rangeEnd: base.rangeEnd,
        timeShift: base.timeShift || 0,
        source: "hand-json",
      });
    }
  } else {
    data = TaikoParser.eventsFromTja(tjaText, opts);
  }
  const sectionStart = optionalSeconds(args.sectionStart);
  const sectionEnd = optionalSeconds(args.sectionEnd);
  if (sectionStart != null && sectionEnd != null) {
    data.sectionStart = sectionStart;
    data.sectionEnd = sectionEnd;
  }
  return data;
}

function planForJob(job) {
  const data = buildPayload(job);
  const win = LoopRange.mediaWindow(data);
  const plan = audio.originalAudioPlan({
    chartStart: win.chartStart,
    chartEnd: win.chartEnd,
    rate: job.rate == null ? 1 : job.rate,
    hasSong: !!job.song,
    includeHits: !!job.audio,
    timeShift: data.timeShift || 0,
    offset: data.offset,
  });
  return plan;
}

function loadBatchFile(file) {
  const abs = path.resolve(file);
  const dir = path.dirname(abs);
  const spec = JSON.parse(fs.readFileSync(abs, "utf8"));
  const jobs = spec.jobs;
  if (!Array.isArray(jobs) || !jobs.length) throw new Error("队列里没有 jobs：" + file);
  return jobs.map((job, i) => {
    if (!job || !job.tja) throw new Error("队列第 " + (i + 1) + " 条缺少 tja");
    const tja = path.resolve(dir, job.tja);
    const song = job.song ? path.resolve(dir, job.song) : null;
    const sticking = job.sticking ? path.resolve(dir, job.sticking) : null;
    const outName = job.out || (path.basename(tja, path.extname(tja)) + ".mp4");
    const out = path.isAbsolute(outName) ? outName : path.resolve(dir, spec.outDir || ".", outName);
    return {
      tja: tja,
      song: song,
      sticking: sticking,
      out: out,
      label: job.label || path.basename(tja),
      course: job.course != null ? job.course : (spec.course != null ? spec.course : null),
      measures: job.measures != null ? job.measures : (spec.measures != null ? spec.measures : null),
      rate: job.rate != null ? Number(job.rate) : (spec.rate != null ? Number(spec.rate) : 1),
      technique: job.technique != null ? job.technique : spec.technique,
      hand: job.hand != null ? job.hand : (spec.hand || "R"),
      roll: job.roll != null ? job.roll : (spec.roll || "自动滚奏"),
      bignote: job.bignote != null ? job.bignote : (spec.bignote || "single"),
      fps: job.fps != null ? Number(job.fps) : (spec.fps != null ? Number(spec.fps) : 60),
      size: job.size != null ? job.size : (spec.size || "1080p"),
      workers: job.workers != null ? Number(job.workers) : (spec.workers != null ? Number(spec.workers) : defaultWorkers()),
      audio: job.audio != null ? !!job.audio : !!spec.audio,
      sectionStart: optionalSeconds(job.sectionStart),
      sectionEnd: optionalSeconds(job.sectionEnd),
    };
  });
}

module.exports = {
  HELP: HELP,
  defaultWorkers: defaultWorkers,
  parseArgs: parseArgs,
  buildPayload: buildPayload,
  planForJob: planForJob,
  loadBatchFile: loadBatchFile,
};
