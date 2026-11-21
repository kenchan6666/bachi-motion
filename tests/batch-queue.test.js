/**
 * Batch / queue progress. No official charts or audio.
 *
 *   node tests/batch-queue.test.js
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const http = require("http");

const batch = require(path.join(__dirname, "..", "js", "batch-queue.js"));
const jobs = require(path.join(__dirname, "..", "js", "render-jobs.js"));
const ui = require(path.join(__dirname, "..", "js", "batch-ui.js"));

let passed = 0;

function check(name, fn) {
  const ret = fn();
  if (ret && typeof ret.then === "function") {
    return ret.then(() => {
      passed += 1;
      console.log("  ✓ " + name);
    });
  }
  passed += 1;
  console.log("  ✓ " + name);
}

function nearly(a, b, eps) {
  assert.ok(Math.abs(a - b) <= (eps == null ? 1e-9 : eps), "expected " + a + " ≈ " + b);
}

(async function main() {
  await check("overall progress counts finished jobs plus the current item", async () => {
    const seen = [];
    const result = await batch.runBatch([
      { label: "甲" },
      { label: "乙" },
      { label: "丙" },
    ], {
      async renderJob(job, ctx) {
        if (job.label === "甲") ctx.onItemProgress(0.5);
        if (job.label === "乙") ctx.onItemProgress(1);
        if (job.label === "丙") throw new Error("boom");
        return job.label;
      },
      onProgress(snap) { seen.push(Object.assign({}, snap)); },
    });
    const mid = seen.find((s) => s.currentLabel === "甲" && s.itemFraction === 0.5);
    assert.ok(mid, "missing mid-first-job snapshot");
    assert.strictEqual(mid.positionLabel, "1/3");
    nearly(mid.overallFraction, 0.5 / 3);
    const second = seen.find((s) => s.currentLabel === "乙" && s.itemFraction === 1);
    assert.ok(second);
    assert.strictEqual(second.positionLabel, "2/3");
    nearly(second.overallFraction, 2 / 3);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.succeeded, 2);
    const last = seen[seen.length - 1];
    nearly(last.overallFraction, 1);
    assert.strictEqual(last.done, true);
  });

  await check("progress text names the current item and the batch", () => {
    const text = batch.formatProgress({
      positionLabel: "2/5",
      currentLabel: "练习谱",
      itemFraction: 0.25,
      overallFraction: 0.25,
      frame: 30,
      frameCount: 120,
    });
    assert.ok(text.item.indexOf("2/5") >= 0, text.item);
    assert.ok(text.item.indexOf("练习谱") >= 0, text.item);
    assert.ok(text.item.indexOf("30/120") >= 0, text.item);
    assert.ok(text.overall.indexOf("25%") >= 0, text.overall);
  });

  await check("CLI single job accepts --song and still defaults workers, fps, and 1080p", () => {
    const args = jobs.parseArgs([
      "--tja", "谱.tja",
      "--course", "Oni",
      "--technique", "全换",
      "--hand", "R",
      "--roll", "自动滚奏",
      "--audio",
      "--song", "song.wav",
      "--fps", "60",
      "--out", "out.mp4",
    ]);
    assert.strictEqual(args.song, "song.wav");
    assert.strictEqual(args.audio, true);
    assert.strictEqual(args.tja, "谱.tja");
    assert.strictEqual(args.fps, 60);
    assert.strictEqual(args.size, "1080p");
    assert.strictEqual(args.technique, "全换");
    assert.strictEqual(args.roll, "自动滚奏");
    assert.strictEqual(args.hand, "R");
    assert.ok(args.workers >= 1);
  });

  await check("batch file pairs each TJA with its own song and leaves a TJA-only job silent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-batch-"));
    const tjaA = path.join(dir, "a.tja");
    const tjaB = path.join(dir, "b.tja");
    const song = path.join(dir, "tone.wav");
    fs.writeFileSync(tjaA, "TITLE:a\nBPM:120\nOFFSET:0\n#START\n1,\n#END\n");
    fs.writeFileSync(tjaB, "TITLE:b\nBPM:120\nOFFSET:0\n#START\n2,\n#END\n");
    fs.writeFileSync(song, "RIFF");
    const queue = path.join(dir, "queue.json");
    fs.writeFileSync(queue, JSON.stringify({
      fps: 60,
      size: "1080p",
      audio: false,
      jobs: [
        { tja: "a.tja", song: "tone.wav", out: "a.mp4", technique: "半换A", hand: "L", roll: "不滚奏", sticking: null },
        { tja: "b.tja", out: "b.mp4" },
      ],
    }));
    const loaded = jobs.loadBatchFile(queue);
    assert.strictEqual(loaded.length, 2);
    assert.strictEqual(loaded[0].song, song);
    assert.strictEqual(loaded[0].audio, false);
    assert.strictEqual(loaded[0].technique, "半换A");
    assert.strictEqual(loaded[0].hand, "L");
    assert.strictEqual(loaded[0].roll, "不滚奏");
    assert.strictEqual(loaded[0].fps, 60);
    assert.strictEqual(loaded[0].size, "1080p");
    assert.strictEqual(loaded[1].song, null);
    assert.strictEqual(loaded[1].tja, tjaB);
    assert.ok(loaded[1].out.endsWith(path.join("b.mp4")));
    const plans = loaded.map((job) => jobs.planForJob(job));
    assert.strictEqual(plans[0].includeOriginal, true);
    assert.strictEqual(plans[1].includeOriginal, false);
    assert.ok(Math.abs(plans[0].audioOrigin - (plans[0].chartStart)) < 1e-9);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await check("a loaded handorder path is kept for the job", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bachi-hands-"));
    const tja = path.join(dir, "c.tja");
    const hands = path.join(dir, "c.json");
    fs.writeFileSync(tja, "TITLE:c\nBPM:120\nOFFSET:0\n#START\n11,\n#END\n");
    fs.writeFileSync(hands, "{\"events\":[]}");
    const queue = path.join(dir, "queue.json");
    fs.writeFileSync(queue, JSON.stringify({ jobs: [{ tja: "c.tja", sticking: "c.json", out: "c.mp4" }] }));
    const loaded = jobs.loadBatchFile(queue);
    assert.strictEqual(loaded[0].sticking, hands);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await check("web payload omits original audio when the row has no song", () => {
    const bare = ui.serializeJob({
      id: "1",
      name: "only.tja",
      tjaText: "TITLE:x\nBPM:120\nOFFSET:0\n#START\n1,\n#END\n",
      songBase64: null,
      songName: "",
      hits: true,
      technique: "全换",
      hand: "R",
      roll: "自动滚奏",
    });
    assert.strictEqual(bare.songBase64, null);
    assert.strictEqual(bare.songName, null);
    assert.strictEqual(bare.hits, true);
    const withSong = ui.serializeJob({
      id: "2",
      name: "with.tja",
      tjaText: "TITLE:x\n",
      songBase64: "aGk=",
      songName: "home.wav",
      hits: false,
    });
    assert.strictEqual(withSong.songBase64, "aGk=");
    assert.strictEqual(withSong.songName, "home.wav");
    assert.strictEqual(withSong.hits, false);
  });

  await check("progress elements follow item and overall fractions", () => {
    const item = { value: 0, max: 1 };
    const overall = { value: 0, max: 1 };
    const itemLabel = { textContent: "" };
    const overallLabel = { textContent: "" };
    ui.applyProgress({
      item: item,
      overall: overall,
      itemLabel: itemLabel,
      overallLabel: overallLabel,
    }, {
      positionLabel: "1/2",
      currentLabel: "甲",
      itemFraction: 0.4,
      overallFraction: 0.2,
      frame: 4,
      frameCount: 10,
    });
    nearly(item.value, 0.4);
    nearly(overall.value, 0.2);
    assert.ok(itemLabel.textContent.indexOf("1/2") >= 0);
    assert.ok(overallLabel.textContent.indexOf("20%") >= 0);
  });

  await check("the page renders the open chart and does not show a batch queue", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const home = html.slice(0, html.indexOf('id="editor"'));
    for (const gone of ["settingsBatch", "batchList", "batchTja", "batchAddCurrent", "batchSong", "batchOverallProgress", "批量出片", "加入谱面", "把当前谱面加入队列", "batch=1"]) {
      assert.ok(!home.includes(gone), gone);
    }
    const play = home.slice(home.indexOf('id="settingsPlay"'));
    assert.ok(play.includes('id="renderStart"'));
    assert.ok(play.includes("开始渲染"));
    assert.ok(play.includes('id="renderHits"'));
    assert.ok(!play.includes("选择原曲"));
    assert.ok(html.includes("<progress"));
    assert.ok(!/#f5c5|ffcc00|ffd60a|apple/i.test(html.slice(html.indexOf("batch-progress"), html.indexOf("batch-progress") + 800)));
    assert.ok(html.includes("js/batch-ui.js"));
    const ui = fs.readFileSync(path.join(__dirname, "..", "js", "batch-ui.js"), "utf8");
    assert.ok(!ui.includes("batch=1"));
    assert.ok(ui.includes("function runRows"));
    assert.ok(ui.includes('getElementById("renderStart")'));
  });

  await check("local render server reports progress and does not attach a song that was not uploaded", async () => {
    const serverMod = require(path.join(__dirname, "..", "js", "render-server.js"));
    const seen = [];
    const server = await serverMod.startRenderServer({
      port: 0,
      renderJob: async (args, ctx) => {
        seen.push({ song: args.song, audio: args.audio, tja: args.tjaText });
        ctx.onItemProgress(0.25);
        ctx.onItemProgress(1);
        const out = path.join(os.tmpdir(), "bachi-batch-out-" + seen.length + ".mp4");
        fs.writeFileSync(out, "mp4");
        return out;
      },
    });
    try {
      const base = "http://127.0.0.1:" + server.port;
      const info = await fetch(base + "/api/render-info").then((r) => r.json());
      assert.strictEqual(info.ok, true);
      const posted = await fetch(base + "/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: [
            {
              id: "j1",
              name: "one.tja",
              tjaText: "TITLE:one\nBPM:120\nOFFSET:-2\n#START\n1,\n#END\n",
              songBase64: null,
              hits: false,
              technique: "全换",
              hand: "R",
              roll: "自动滚奏",
            },
            {
              id: "j2",
              name: "two.tja",
              tjaText: "TITLE:two\nBPM:120\nOFFSET:-2\n#START\n1,\n#END\n",
              songBase64: Buffer.from("RIFF").toString("base64"),
              songName: "home.wav",
              hits: false,
            },
          ],
        }),
      }).then((r) => r.json());
      assert.ok(posted.id);
      const snaps = [];
      await new Promise((resolve, reject) => {
        const req = http.get(base + "/api/batch/" + posted.id + "/events", (res) => {
          let buf = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            buf += chunk;
            const parts = buf.split("\n\n");
            buf = parts.pop();
            for (const part of parts) {
              const line = part.split("\n").filter((l) => l.startsWith("data:")).pop();
              if (!line) continue;
              const snap = JSON.parse(line.slice(5).trim());
              snaps.push(snap);
              if (snap.done) {
                req.destroy();
                resolve();
              }
            }
          });
          res.on("error", reject);
        });
        req.on("error", reject);
      });
      assert.strictEqual(seen.length, 2);
      assert.strictEqual(seen[0].song, null);
      assert.ok(seen[1].song && fs.existsSync(seen[1].song));
      const songBytes = fs.readFileSync(seen[1].song);
      assert.strictEqual(songBytes.toString("ascii", 0, 4), "RIFF");
      const progressed = snaps.find((s) => s.positionLabel === "1/2" && s.itemFraction === 0.25);
      assert.ok(progressed, "expected a 1/2 item progress event");
      nearly(progressed.overallFraction, 0.25 / 2);
      const done = snaps[snaps.length - 1];
      assert.strictEqual(done.done, true);
      assert.ok(done.plans && done.plans[0]);
      nearly(done.plans[0].chartStart, 2 - 0.7);
      assert.strictEqual(done.plans[0].includeOriginal, false);
      assert.strictEqual(done.plans[1].includeOriginal, true);
      nearly(done.plans[1].audioOrigin, done.plans[1].chartStart);
    } finally {
      await server.close();
    }
  });

  await check("an uploaded mp4 keeps its extension so export can read the audio", async () => {
    const serverMod = require(path.join(__dirname, "..", "js", "render-server.js"));
    const seen = [];
    const server = await serverMod.startRenderServer({
      port: 0,
      renderJob: async (args) => {
        seen.push(args.song);
        const out = path.join(os.tmpdir(), "bachi-mp4-job-" + seen.length + ".mp4");
        fs.writeFileSync(out, "mp4");
        return out;
      },
    });
    try {
      const base = "http://127.0.0.1:" + server.port;
      const posted = await fetch(base + "/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: [{
            id: "mp4",
            name: "clip.tja",
            tjaText: "TITLE:clip\nBPM:120\nOFFSET:0\n#START\n1,\n#END\n",
            songBase64: Buffer.from("not-a-real-mp4").toString("base64"),
            songName: "clip.mp4",
            hits: true,
          }],
        }),
      }).then((r) => r.json());
      assert.ok(posted.id, posted.error || "missing batch id");
      const deadline = Date.now() + 2000;
      while (!seen.length && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.strictEqual(seen.length, 1);
      assert.ok(String(seen[0]).endsWith(".mp4"), String(seen[0]));
      assert.strictEqual(fs.readFileSync(seen[0]).toString("utf8"), "not-a-real-mp4");
    } finally {
      await server.close();
    }
  });

  console.log("batch-queue tests: " + passed);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
