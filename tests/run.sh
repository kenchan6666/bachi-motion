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

echo "== title-bar BPM range =="
node tests/titlebar-bpm.test.js
echo

echo "== section loop + playback rate =="
node tests/loop-range.test.js
echo

echo "== original-audio mux =="
node tests/audio-mux.test.js
echo

echo "== batch queue + progress =="
node tests/batch-queue.test.js
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

echo "== roll-dot cache (cached 720-sample pos must match uncached) =="
node tests/roll-dot-cache.test.js
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
