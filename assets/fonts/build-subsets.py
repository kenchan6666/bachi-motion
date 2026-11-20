#!/usr/bin/env python3
"""Slice the title-bar face into unicode-range WOFF2 files.

Keeps the same character set as unicodes.txt (JIS X 0208 + GB2312 level 1 +
kana + latin/punct). Does not shrink the repertoire. Each slice is a small
WOFF2 with a matching unicode-range, so the browser only downloads the
pieces needed for the current song title + second line.

Usage:
  python3 assets/fonts/build-subsets.py \\
      --src /path/to/NotoSerifCJKjp-Bold.otf \\
      --out-dir assets/fonts

  # Or slice the already-renamed full subset (woff2/otf):
  python3 assets/fonts/build-subsets.py --src assets/fonts/BachiSerifCJK-Bold.woff2

Requires: fonttools, brotli.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


FAMILY = "Bachi Serif CJK"
TARGET = 100_000
MIN_HAN = 50_000
MAX_HAN = 150_000

# Characters the title bar and the four test titles must cover.
REQUIRED_CHARS = (
    "原速全换半换炒菜"
    "×·–"  # U+00D7, U+00B7, U+2013
    "千本桜樱"
    "INFInite rebellion"
    "nivalis"
    "幽玄之乱"
    "BPM 0123456789"
    "0.75×"
)


def parse_unicodes_file(path: Path) -> set[int]:
    text = path.read_text(encoding="utf-8")
    cps: set[int] = set()
    for tok in text.replace("\n", ",").split(","):
        tok = tok.strip()
        if not tok:
            continue
        if tok.startswith("U+") or tok.startswith("u+"):
            cps.add(int(tok[2:], 16))
    return cps


def ranges_from_cps(cps: list[int]) -> list[tuple[int, int]]:
    if not cps:
        return []
    cps = sorted(set(cps))
    out = []
    start = prev = cps[0]
    for c in cps[1:]:
        if c == prev + 1:
            prev = c
            continue
        out.append((start, prev))
        start = prev = c
    out.append((start, prev))
    return out


def css_unicode_range(cps: list[int]) -> str:
    parts = []
    for a, b in ranges_from_cps(cps):
        if a == b:
            parts.append(f"U+{a:04X}")
        else:
            parts.append(f"U+{a:04X}-{b:04X}")
    return ", ".join(parts)


def is_latin_core(cp: int) -> bool:
    """Letters, digits, and the punctuation the title bar actually uses.

    Includes × · – — and basic Latin-1 so this slice can stay tiny.
    Greek, Cyrillic, box drawing, etc. go to latin-ext.
    """
    return (
        (0x20 <= cp <= 0x7E)
        or (0xA0 <= cp <= 0xFF)
        or (0x2000 <= cp <= 0x206F)
        or (0x20A0 <= cp <= 0x20CF)
    )


def classify(cps: set[int]) -> dict[str, list[int]]:
    latin = []
    latin_ext = []
    kana = []
    punct = []
    han = []
    other = []
    for cp in sorted(cps):
        if is_latin_core(cp):
            latin.append(cp)
        elif (0x100 <= cp <= 0x24F) or (0x1E00 <= cp <= 0x1EFF) or (0x2070 <= cp <= 0x209F) or (
            0x2100 <= cp <= 0x214F
        ) or (0x2190 <= cp <= 0x21FF) or (0x2200 <= cp <= 0x22FF) or (0x2460 <= cp <= 0x24FF) or (
            0x2500 <= cp <= 0x257F
        ) or (0x25A0 <= cp <= 0x25FF) or (0x2600 <= cp <= 0x26FF) or (0x2700 <= cp <= 0x27BF) or (
            0x02B0 <= cp <= 0x02FF
        ) or (0x0300 <= cp <= 0x036F) or (0x0370 <= cp <= 0x03FF) or (0x0400 <= cp <= 0x04FF) or (
            0x2160 <= cp <= 0x218F
        ) or cp == 0x2312 or (0x3100 <= cp <= 0x312F):
            latin_ext.append(cp)
        elif (0x3040 <= cp <= 0x30FF) or (0x31F0 <= cp <= 0x31FF) or (0x1B000 <= cp <= 0x1B0FF):
            kana.append(cp)
        elif (0x3000 <= cp <= 0x303F) or (0x3200 <= cp <= 0x33FF) or (0xFE10 <= cp <= 0xFE1F) or (
            0xFE30 <= cp <= 0xFE4F
        ) or (0xFE50 <= cp <= 0xFE6F) or (0xFF00 <= cp <= 0xFFEF) or (0x3190 <= cp <= 0x319F):
            punct.append(cp)
        elif (0x3400 <= cp <= 0x9FFF) or (0xF900 <= cp <= 0xFAFF) or (0x2E80 <= cp <= 0x2EFF) or (
            0x2F00 <= cp <= 0x2FDF
        ):
            han.append(cp)
        else:
            other.append(cp)
    buckets = {}
    if latin:
        buckets["latin"] = latin
    if latin_ext:
        buckets["latin-ext"] = latin_ext
    if kana:
        buckets["kana"] = kana
    if punct:
        buckets["punct"] = punct
    if other:
        buckets["other"] = other
    if han:
        buckets["han"] = han
    return buckets


def find_pyftsubset() -> str:
    # Prefer a venv that has brotli (system pyftsubset often does not).
    candidates = [
        Path("/tmp/fontbuild/venv/bin/pyftsubset"),
        Path(sys.executable).resolve().parent / "pyftsubset",
    ]
    which = shutil.which("pyftsubset")
    if which:
        candidates.append(Path(which))
    for cand in candidates:
        if cand and cand.exists():
            return str(cand)
    raise SystemExit("pyftsubset not found. Install fonttools + brotli in a venv.")


def rename_family(path: Path, family: str) -> None:
    from fontTools.ttLib import TTFont

    font = TTFont(str(path))
    name = font["name"]
    for rec in name.names:
        if rec.nameID in (1, 16):  # family, typographic family
            rec.toUnicode()
            rec.string = family
        elif rec.nameID == 4:  # full name
            rec.toUnicode()
            rec.string = family + " Bold"
        elif rec.nameID == 6:  # postscript
            rec.string = "BachiSerifCJK-Bold"
        elif rec.nameID == 3:  # unique
            rec.toUnicode()
            rec.string = "Bachi Serif CJK Bold"
        elif rec.nameID in (17, 2):
            rec.toUnicode()
            rec.string = "Bold"
    font.save(str(path))
    font.close()


def subset_woff2(src: Path, unicodes: list[int], dest: Path, pyftsubset: str) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as tmp:
        tmp.write(",".join(f"U+{cp:04X}" for cp in unicodes))
        uni_path = tmp.name
    try:
        cmd = [
            pyftsubset,
            str(src),
            f"--unicodes-file={uni_path}",
            "--flavor=woff2",
            f"--output-file={dest}",
            "--layout-features-=dlig,vert,vrt2,vkna,vpal,vhal,valt,vkrn",
            "--passthrough-tables",
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    finally:
        os.unlink(uni_path)
    rename_family(dest, FAMILY)
    return dest.stat().st_size


def pack_han(src: Path, han: list[int], out_dir: Path, pyftsubset: str) -> list[dict]:
    """Pack consecutive Han codepoints into ~100KB WOFF2 slices (50–150KB)."""
    remaining = list(han)
    slices = []
    idx = 1
    # Probe a mid-sized chunk to estimate bytes/glyph.
    probe_n = min(280, len(remaining))
    probe_path = out_dir / "_probe.woff2"
    probe_size = subset_woff2(src, remaining[:probe_n], probe_path, pyftsubset)
    bpg = max(1.0, probe_size / probe_n)
    probe_path.unlink(missing_ok=True)
    print(f"  han probe: {probe_n} glyphs -> {probe_size} bytes ({bpg:.0f} B/glyph)", flush=True)

    while remaining:
        n = int(round(TARGET / bpg))
        n = max(32, min(len(remaining), n))
        # If this would leave a tiny remainder, absorb it (unless it would exceed MAX).
        rest = len(remaining) - n
        if 0 < rest < 40:
            # try absorbing if likely under MAX
            if (n + rest) * bpg <= MAX_HAN or rest < 16:
                n = len(remaining)

        dest = out_dir / f"bachi-serif-cjk-han-{idx:02d}.woff2"
        cps = remaining[:n]
        size = subset_woff2(src, cps, dest, pyftsubset)

        # Adjust once if far off the window (except the last slice, which may be small).
        if size > MAX_HAN and n > 32:
            scale = TARGET / size
            n2 = max(32, int(n * scale * 0.95))
            if n2 < n:
                dest.unlink(missing_ok=True)
                cps = remaining[:n2]
                n = n2
                size = subset_woff2(src, cps, dest, pyftsubset)
        elif size < MIN_HAN and n < len(remaining):
            scale = TARGET / max(size, 1)
            n2 = min(len(remaining), max(n + 1, int(n * scale)))
            if n2 > n:
                dest.unlink(missing_ok=True)
                cps = remaining[:n2]
                n = n2
                size = subset_woff2(src, cps, dest, pyftsubset)
                if size > MAX_HAN and n > 32:
                    # rolled past the cap; revert one step
                    n3 = max(32, int(n * TARGET / size))
                    if n3 < n:
                        dest.unlink(missing_ok=True)
                        cps = remaining[:n3]
                        n = n3
                        size = subset_woff2(src, cps, dest, pyftsubset)

        # Rename to include codepoint span
        lo, hi = cps[0], cps[-1]
        final = out_dir / f"bachi-serif-cjk-han-{idx:02d}-{lo:04x}-{hi:04x}.woff2"
        dest.rename(final)
        slices.append({"name": final.name, "cps": cps, "size": size, "count": len(cps)})
        print(f"  han {idx:02d}: {len(cps):4d} glyphs  U+{lo:04X}–U+{hi:04X}  {size/1024:.1f} KB", flush=True)
        remaining = remaining[n:]
        # Update bytes/glyph with a short moving average
        bpg = 0.6 * bpg + 0.4 * (size / max(len(cps), 1))
        idx += 1
    return slices


def write_css(css_path: Path, faces: list[dict]) -> None:
    lines = [
        "/* Generated by assets/fonts/build-subsets.py — do not edit by hand. */",
        "/* Family: Bachi Serif CJK (subset of Noto Serif CJK JP Bold, OFL 1.1). */",
        "",
    ]
    for face in faces:
        lines.append("@font-face {")
        lines.append('  font-family: "Bachi Serif CJK";')
        lines.append("  font-style: normal;")
        lines.append("  font-weight: 700;")
        lines.append("  font-display: swap;")
        lines.append(f'  src: url("woff2/{face["name"]}") format("woff2");')
        lines.append(f"  unicode-range: {face['unicode_range']};")
        lines.append("}")
        lines.append("")
    css_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="Source OTF/TTF/WOFF2 (Noto or the full Bachi subset)")
    ap.add_argument("--unicodes", default=None, help="unicodes.txt (default: next to this script)")
    ap.add_argument("--out-dir", default=None, help="assets/fonts directory")
    args = ap.parse_args()

    script_dir = Path(__file__).resolve().parent
    out_dir = Path(args.out_dir).resolve() if args.out_dir else script_dir
    uni_path = Path(args.unicodes).resolve() if args.unicodes else script_dir / "unicodes.txt"
    src = Path(args.src).resolve()
    if not src.exists():
        raise SystemExit(f"source font not found: {src}")
    if not uni_path.exists():
        raise SystemExit(f"unicodes.txt not found: {uni_path}")

    cps = parse_unicodes_file(uni_path)
    print(f"repertoire: {len(cps)} codepoints from {uni_path}", flush=True)

    missing = []
    for ch in REQUIRED_CHARS:
        if ord(ch) not in cps and not ch.isspace():
            missing.append(f"{ch} U+{ord(ch):04X}")
    if missing:
        raise SystemExit("required characters missing from unicodes.txt: " + ", ".join(missing))
    print("required title-bar characters: all present", flush=True)

    buckets = classify(cps)
    leftover = cps - set(sum(buckets.values(), []))
    if leftover:
        print("warning: unclassified", " ".join(f"U+{c:04X}" for c in sorted(leftover)))
        buckets.setdefault("other", [])
        buckets["other"] = sorted(set(buckets.get("other", [])) | leftover)

    pyftsubset = find_pyftsubset()
    woff_dir = out_dir / "woff2"
    if woff_dir.exists():
        shutil.rmtree(woff_dir)
    woff_dir.mkdir(parents=True)

    faces: list[dict] = []
    for name in ("latin", "latin-ext", "kana", "punct", "other"):
        if name not in buckets:
            continue
        chunk = buckets[name]
        dest = woff_dir / f"bachi-serif-cjk-{name}.woff2"
        size = subset_woff2(src, chunk, dest, pyftsubset)
        faces.append({
            "name": dest.name,
            "group": name,
            "cps": chunk,
            "size": size,
            "count": len(chunk),
            "unicode_range": css_unicode_range(chunk),
        })
        print(f"  {name}: {len(chunk):4d} glyphs  {size/1024:.1f} KB", flush=True)

    if "han" in buckets:
        han_slices = pack_han(src, buckets["han"], woff_dir, pyftsubset)
        for s in han_slices:
            s["group"] = "han"
            s["unicode_range"] = css_unicode_range(s["cps"])
            faces.append(s)

    # Drop raw cps from the JSON manifest (too large); keep counts + range + size.
    manifest = []
    for f in faces:
        manifest.append({
            "file": f"woff2/{f['name']}",
            "group": f["group"],
            "glyphs": f["count"],
            "bytes": f["size"],
            "unicode_range": f["unicode_range"],
        })

    css_path = out_dir / "bachi-serif-cjk.css"
    write_css(css_path, faces)
    man_path = out_dir / "subsets.json"
    man_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    sizes = [f["size"] for f in faces]
    print()
    print(f"slices: {len(faces)}")
    print(f"min: {min(sizes)/1024:.1f} KB  max: {max(sizes)/1024:.1f} KB  total: {sum(sizes)/1024:.1f} KB")
    print(f"wrote {css_path}")
    print(f"wrote {man_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
