"use strict";

/**
 * In-memory batch runner. Rendering is injected so progress can be tested
 * without Chrome. Overall progress is (finished jobs + current item) / total.
 */

function createBatch(jobs) {
  return {
    jobs: (jobs || []).map((job, i) => ({
      label: job.label || job.name || ("谱面 " + (i + 1)),
      status: "pending",
      error: null,
    })),
    index: -1,
    itemFraction: 0,
    frame: 0,
    frameCount: 0,
    done: false,
    results: [],
  };
}

function snapshot(batch) {
  const total = batch.jobs.length;
  const index = batch.index;
  const current = index >= 0 && index < total ? batch.jobs[index] : null;
  let overall = 0;
  if (total === 0 || batch.done) overall = 1;
  else if (index >= 0) {
    const before = batch.jobs.slice(0, index).filter((job) => job.status === "done" || job.status === "failed").length;
    overall = (before + (batch.itemFraction || 0)) / total;
  }
  let positionLabel = "";
  if (total > 0 && index >= 0 && !batch.done) positionLabel = (index + 1) + "/" + total;
  else if (total > 0 && batch.done) positionLabel = total + "/" + total;
  return {
    total: total,
    currentIndex: index,
    currentLabel: current ? current.label : "",
    itemFraction: batch.itemFraction || 0,
    overallFraction: overall,
    positionLabel: positionLabel,
    frame: batch.frame || 0,
    frameCount: batch.frameCount || 0,
    done: !!batch.done,
    failed: batch.jobs.filter((job) => job.status === "failed").length,
    succeeded: batch.jobs.filter((job) => job.status === "done").length,
    files: batch.done ? batch.results.map((result, i) => ({
      index: i,
      ok: !!result.ok,
      error: result.ok ? null : String((result.error && result.error.message) || result.error || "失败"),
      out: result.ok ? (result.out || null) : null,
    })) : [],
  };
}

function beginJob(batch, index) {
  batch.index = index;
  batch.itemFraction = 0;
  batch.frame = 0;
  batch.frameCount = 0;
  batch.jobs[index].status = "running";
}

function setItemFraction(batch, fraction, extra) {
  const n = +fraction;
  batch.itemFraction = Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
  if (extra) {
    if (extra.frame != null) batch.frame = extra.frame;
    if (extra.frameCount != null) batch.frameCount = extra.frameCount;
  }
}

function completeJob(batch) {
  const job = batch.jobs[batch.index];
  if (job) job.status = "done";
  batch.itemFraction = 1;
}

function failJob(batch, err) {
  const job = batch.jobs[batch.index];
  if (job) {
    job.status = "failed";
    job.error = err;
  }
  batch.itemFraction = 1;
}

function formatProgress(snap) {
  const frames = snap.frameCount ? (snap.frame + "/" + snap.frameCount) : "";
  const item = [snap.positionLabel, snap.currentLabel, frames].filter(Boolean).join(" ");
  const overall = "整批 " + Math.round((snap.overallFraction || 0) * 100) + "%";
  return { item: item, overall: overall };
}

function bar(fraction, width) {
  const w = width || 24;
  const n = Math.max(0, Math.min(w, Math.round((fraction || 0) * w)));
  return "[" + "#".repeat(n) + "-".repeat(w - n) + "]";
}

async function runBatch(jobs, hooks) {
  hooks = hooks || {};
  const batch = createBatch(jobs);
  const emit = () => {
    if (typeof hooks.onProgress === "function") hooks.onProgress(snapshot(batch));
  };
  for (let i = 0; i < jobs.length; i++) {
    beginJob(batch, i);
    emit();
    try {
      const out = await hooks.renderJob(jobs[i], {
        onItemProgress(fraction, extra) {
          setItemFraction(batch, fraction, extra);
          emit();
        },
      });
      completeJob(batch);
      batch.results.push({ ok: true, out: out });
    } catch (err) {
      failJob(batch, err);
      batch.results.push({ ok: false, error: err });
    }
    emit();
  }
  batch.done = true;
  batch.itemFraction = 1;
  emit();
  const snap = snapshot(batch);
  return {
    failed: snap.failed,
    succeeded: snap.succeeded,
    results: batch.results,
    snapshot: snap,
  };
}

module.exports = {
  createBatch: createBatch,
  snapshot: snapshot,
  beginJob: beginJob,
  setItemFraction: setItemFraction,
  completeJob: completeJob,
  failJob: failJob,
  formatProgress: formatProgress,
  bar: bar,
  runBatch: runBatch,
};
