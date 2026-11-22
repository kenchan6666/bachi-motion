#!/usr/bin/env bash
# Regression runner: parser self-check, weld check, then dump+check on four synthetic charts.
# Usage: from repo root, `npm test` or `bash tests/run.sh`
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export BM_ROOT="$ROOT"

if [ -z "${CHROME_PATH:-}" ]; then
  if [ -n "${PUPPETEER_EXECUTABLE_PATH:-}" ]; then
    export CHROME_PATH="$PUPPETEER_EXECUTABLE_PATH"
  else
    for c in /usr/bin/google-chrome /usr/bin/google-chrome-stable /usr/bin/chromium-browser /usr/bin/chromium; do
      if [ -x "$c" ]; then
        export CHROME_PATH="$c"
        break
      fi
    done
  fi
fi

if [ -z "${CHROME_PATH:-}" ] || [ ! -x "${CHROME_PATH}" ]; then
  echo "FAIL: Chrome not found. Set CHROME_PATH to a Chrome/Chromium binary." >&2
  exit 1
fi

echo "== parser self-check =="
node js/parser.js
echo

echo "== render acceleration (GPU prefer, CPU fallback) =="
node tests/render-accel.test.js
echo

echo "== offline assets =="
node tests/offline-assets.test.js
echo

echo "== desktop shell =="
node tests/desktop-shell.test.js
echo

echo "== title-bar BPM range =="
node tests/titlebar-bpm.test.js
echo

echo "== title-bar placement (webpage above track, export left of track) =="
node tests/titlebar-layout.test.js
echo

echo "== CJK title fit + TJA encoding =="
node tests/cjk-title-encoding.test.js
echo

echo "== settings hint popovers anchor to their buttons =="
node tests/hint-popover.test.js
echo

echo "== course picker (multi-COURSE difficulty) =="
node tests/course-picker.test.js
echo

echo "== branch picker (普通 / 玄人 / 达人) =="
node tests/branch-picker.test.js
echo

echo "== editor-opened TJA syncs the homepage chart picker =="
node tests/editor-home-chart.test.js
echo

echo "== import / paste / song switch enters fresh auto sticking =="
node tests/auto-on-import.test.js
echo

echo "== chart author (blank chart + 16th notes) =="
node tests/chart-author.test.js
echo

echo "== TJA export (UTF-8 round-trip) =="
node tests/tja-export.test.js
echo

echo "== TJA export button (under the chart legend) =="
node tests/tja-export-ui.test.js
echo

echo "== chart author UI (高级空谱面 / 加入音符) =="
node tests/chart-author-ui.test.js
echo

echo "== editor pan (measure overview, hidden scrollbar, zoom pan) =="
node tests/editor-pan.test.js
echo

echo "== editor mouse-first hand editing =="
node tests/editor-mouse.test.js
echo

echo "== overview marks for 待确认 measures =="
node tests/overview-marks.test.js
echo

echo "== section loop + playback rate =="
node tests/loop-range.test.js
echo

echo "== tempo toggle + scroll 1.1 / 1.2 =="
node tests/scroll-tempo.test.js
echo

echo "== section trim (preview / export) =="
node tests/section-trim.test.js
echo

echo "== original-audio mux =="
node tests/audio-mux.test.js
echo

echo "== export volumes (same mix as the editor sliders) =="
node tests/export-volume.test.js
echo

echo "== original song switch (beside 叠打点声) =="
node tests/original-song.test.js
echo

echo "== preview don/ka hits =="
node tests/preview-hits.test.js
echo

echo "== volume column (music and drums) =="
node tests/taiko-volume.test.js
echo

echo "== volume column in the editor =="
node tests/taiko-volume-ui.test.js
echo

echo "== preview render (paused skip, retained hands) =="
node tests/preview-render.test.js
echo

echo "== batch queue + progress =="
node tests/batch-queue.test.js
echo

echo "== single-chart render on the public page =="
node tests/single-render-ui.test.js
echo

echo "== auto-sticking (55 cases from suyue@ebd21a0) =="
node tests/sticking.test.js
echo

echo "== auto-sticking engine integration =="
node tests/auto-sticking-engine.test.js
echo

echo "== hand-order editor edits (roll / alternate / restore / swap / undo) =="
node tests/hand-edits.test.js
echo

echo "== zoom card uses real note timing =="
node tests/zoom-layout.test.js
echo

echo "== roll-dot cache (cached 720-sample pos must match uncached) =="
node tests/roll-dot-cache.test.js
echo

echo "== long-rest idle (centered 倒V after a ka, short gaps stay put) =="
node tests/long-rest-idle.test.js
echo

echo "== weld check (grip→tip cluster span must be 0.0000) =="
WELD_OUT="$(mktemp)"
cleanup() { rm -rf "${TMPDIR:-}" "$WELD_OUT"; }
trap cleanup EXIT
node js/check-single-weld.js | tee "$WELD_OUT"
if ! grep -qE 'cluster span 0\.0000 px' "$WELD_OUT"; then
  echo "FAIL: expected grip→tip cluster span 0.0000" >&2
  exit 1
fi
echo

echo "== HOVER rest-then-dense exemption (synthetic JSON, no official charts) =="
python3 tests/check-hover-exempt.test.py
echo

echo "== motion checks (check.py v2) =="
TMPDIR="$(mktemp -d)"
# re-bind cleanup now that TMPDIR exists
trap cleanup EXIT

fail=0
for name in trest t160 t220 t280; do
  tja="tests/charts/${name}.tja"
  json="${TMPDIR}/${name}.json"
  echo "-- ${name} --"
  node tests/dump.js "$tja" 1-10 > "$json"
  if ! python3 tests/check.py "$json"; then
    fail=1
  fi
  echo
done

if [ "$fail" -ne 0 ]; then
  echo "FAIL: one or more charts failed check.py"
  exit 1
fi

echo "All regression tests passed."
