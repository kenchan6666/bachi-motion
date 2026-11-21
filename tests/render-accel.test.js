"use strict";

const assert = require("assert");
const accel = require("../js/render-accel.js");

let passed = 0;
function check(name, fn) {
  const result = fn();
  if (result && typeof result.then === "function") {
    return result.then(() => {
      passed += 1;
      console.log("  ✓ " + name);
    });
  }
  passed += 1;
  console.log("  ✓ " + name);
}

(async () => {
  await check("a real GPU name is kept and a basic adapter is not", () => {
    const found = accel.classifyGpuNames([
      "Microsoft Basic Display Adapter",
      "NVIDIA GeForce RTX 3060",
      "Microsoft Basic Render Driver",
    ]);
    assert.strictEqual(found.available, true);
    assert.deepStrictEqual(found.names, ["NVIDIA GeForce RTX 3060"]);
    const none = accel.classifyGpuNames(["Standard VGA Graphics Adapter", ""]);
    assert.strictEqual(none.available, false);
  });

  await check("Intel and AMD names count as a GPU", () => {
    assert.strictEqual(accel.classifyGpuNames(["Intel(R) UHD Graphics 630"]).available, true);
    assert.strictEqual(accel.classifyGpuNames(["AMD Radeon RX 6600"]).available, true);
  });

  await check("GPU Chrome args do not disable the GPU", () => {
    for (const platform of ["win32", "linux", "darwin"]) {
      const args = accel.chromeArgs("gpu", platform);
      assert.ok(!args.includes("--disable-gpu"), platform);
      assert.ok(!args.some((arg) => arg.startsWith("--disable-gpu=")), platform);
    }
    const win = accel.chromeArgs("gpu", "win32");
    assert.ok(win.includes("--use-angle=d3d11"));
    assert.ok(win.includes("--ignore-gpu-blocklist"));
  });

  await check("CPU Chrome args disable the GPU and request software rendering", () => {
    const cpu = accel.chromeArgs("cpu", "win32");
    assert.ok(cpu.includes("--disable-gpu"));
    assert.ok(cpu.includes("--use-gl=swiftshader"));
    assert.ok(cpu.includes("--enable-unsafe-swiftshader"));
    const minimal = accel.chromeArgs("cpu-minimal", "linux");
    assert.ok(minimal.includes("--disable-gpu"));
    assert.ok(!minimal.includes("--use-gl=swiftshader"));
  });

  await check("Electron GPU switches do not disable the GPU", () => {
    const gpu = accel.electronSwitches(true, "win32");
    assert.strictEqual(accel.switchDisablesGpu(gpu), false);
    assert.ok(gpu.some((item) => item[0] === "use-angle" && item[1] === "d3d11"));
    const cpu = accel.electronSwitches(false, "win32");
    assert.strictEqual(accel.switchDisablesGpu(cpu), true);
    assert.ok(cpu.some((item) => item[0] === "use-angle" && item[1] === "swiftshader"));
    assert.ok(!gpu.some((item) => item[0] === "disable-gpu" || item[0] === "disable-gpu-compositing"));
  });

  await check("software renderers are recognized", () => {
    assert.strictEqual(accel.isSoftwareRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)"), false);
    assert.strictEqual(accel.isSoftwareRenderer("Google SwiftShader"), true);
    assert.strictEqual(accel.isSoftwareRenderer("llvmpipe (LLVM 15, 256 bits)"), true);
    assert.strictEqual(accel.classifyGpuPage("Compositing: Hardware accelerated\nWebGL: Hardware accelerated"), "hardware");
    assert.strictEqual(accel.classifyGpuPage("Canvas: Software only, hardware acceleration unavailable"), "software");
    assert.strictEqual(accel.featureStatusIsSoftware({ gpu_compositing: "enabled" }), false);
    assert.strictEqual(accel.featureStatusIsSoftware({ gpu_compositing: "disabled_software" }), true);
    assert.strictEqual(accel.featureStatusIsSoftware({ gpu_compositing: "disabled_off_ok" }), false);
    assert.strictEqual(accel.gpuLogLooksFailed("GPU process isn't usable. Goodbye."), true);
  });

  await check("encoder choice is NVENC, then AMF, then QSV, then libx264", () => {
    const listed = new Set(["h264_nvenc", "h264_amf", "h264_qsv", "libx264"]);
    const probes = [];
    const nv = accel.pickEncoder(listed, (name) => {
      probes.push(name);
      return name === "h264_nvenc";
    });
    assert.strictEqual(nv.name, "h264_nvenc");
    assert.deepStrictEqual(probes, ["h264_nvenc"]);
    assert.ok(!nv.args.includes("--disable-gpu"));
    assert.ok(nv.args.includes("h264_nvenc"));

    const amf = accel.pickEncoder(listed, (name) => name === "h264_amf");
    assert.strictEqual(amf.name, "h264_amf");
    const qsv = accel.pickEncoder(new Set(["h264_qsv", "libx264"]), (name) => name === "h264_qsv");
    assert.strictEqual(qsv.name, "h264_qsv");
    const cpu = accel.pickEncoder(listed, () => false);
    assert.strictEqual(cpu.name, "libx264");
    assert.ok(cpu.args.includes("libx264"));
    const missingHw = accel.pickEncoder(new Set(["libx264"]), () => false);
    assert.strictEqual(missingHw.name, "libx264");
  });

  await check("frame time matches the render.js rate convention", () => {
    const plan = accel.framePlan(1, 3, 60, 0.5);
    assert.strictEqual(plan.chartLen, 2);
    assert.strictEqual(plan.videoDur, 4);
    assert.strictEqual(plan.frameCount, 240);
    assert.strictEqual(accel.frameTime(plan, 0, 60, 0.5), 1);
    assert.ok(Math.abs(accel.frameTime(plan, 60, 60, 0.5) - 1.5) < 1e-9);
  });

  await check("missing ffmpeg and Chrome messages are Chinese and do not pretend the exe opens a browser", () => {
    const previous = process.env.BACHI_DESKTOP;
    process.env.BACHI_DESKTOP = "1";
    const desktop = accel.missingFfmpegMessage();
    process.env.BACHI_DESKTOP = previous;
    assert.ok(desktop.includes("找不到 ffmpeg"));
    assert.ok(desktop.includes("0.2.1"));
    assert.ok(!desktop.includes("打开浏览器"));
    assert.ok(!desktop.includes("1.0.0"));
    const cli = accel.missingChromeMessage();
    assert.ok(cli.includes("找不到 Chrome"));
    assert.ok(cli.includes("不会打开浏览器"));
  });

  await check("the local ffmpeg resolves to libx264 or a probed hardware encoder", async () => {
    accel.resetEncoderCache();
    const previous = process.env.FFMPEG_PATH;
    delete process.env.FFMPEG_PATH;
    const bin = accel.findFfmpeg();
    if (!bin) {
      console.log("  - skip live encoder probe (ffmpeg not installed)");
      if (previous) process.env.FFMPEG_PATH = previous;
      return;
    }
    const encoder = await accel.resolveVideoEncoder({ bin: bin, force: true });
    assert.ok(["h264_nvenc", "h264_amf", "h264_qsv", "libx264"].includes(encoder.name));
    if (encoder.name !== "libx264") assert.ok(accel.probeEncoder(bin, encoder.name));
    accel.resetEncoderCache();
    if (previous) process.env.FFMPEG_PATH = previous;
    else delete process.env.FFMPEG_PATH;
  });

  console.log("render-accel tests: " + passed);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
