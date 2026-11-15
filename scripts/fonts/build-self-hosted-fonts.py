"""PAY-126: build self-hosted woff2 files covering Latin + Latin Extended.

For each font: pin every axis except wght at the font's default (what Google
serves for a weight-only request), subset to the latin and latin-ext unicode
ranges, save as woff2. Then compare against Google's own latin file (via
Fontsource) at several weights: same axes, same advance widths, same outlines.
Usage: python3 -I scripts/fonts/build-self-hosted-fonts.py <upstream_dir> <fontsource_dir> <out_dir>

Inputs (see src/app/fonts/README.md for the exact commands):
  upstream_dir   the variable .ttf files from github.com/google/fonts (ofl/<family>/),
                 at the commit recorded in the README
  fontsource_dir one folder per family holding the unpacked npm package
                 @fontsource-variable/<family> (Google's own subset files, used for the
                 unicode ranges and as the reference the output is compared against)
Needs: pip install fonttools brotli. Exit code 1 if any output differs from Google's
file by more than TOLERANCE.
"""
import io
import json
import sys
from pathlib import Path

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

UP, FS, OUT = (Path(a) for a in sys.argv[1:4])

# (output name, upstream file, fontsource package, fontsource style)
FONTS = [
    ("geist-wght-normal", "Geist[wght].ttf", "geist", "normal"),
    ("geist-mono-wght-normal", "GeistMono[wght].ttf", "geist-mono", "normal"),
    ("plus-jakarta-sans-wght-normal", "PlusJakartaSans[wght].ttf", "plus-jakarta-sans", "normal"),
    ("instrument-sans-wght-normal", "InstrumentSans[wdth,wght].ttf", "instrument-sans", "normal"),
    ("hanken-grotesk-wght-normal", "HankenGrotesk[wght].ttf", "hanken-grotesk", "normal"),
    ("jetbrains-mono-wght-normal", "JetBrainsMono[wght].ttf", "jetbrains-mono", "normal"),
    ("inter-wght-normal", "Inter[opsz,wght].ttf", "inter", "normal"),
    ("inter-wght-italic", "Inter-Italic[opsz,wght].ttf", "inter", "italic"),
]

SAMPLE = "AaBbGgQqRr0123456789,.₱ÑñéüĀā"
TOLERANCE = 0.01  # 1% of the em: rounding between builds, never a design change


def distance(a, b):
    """Largest coordinate or advance difference between two recorded glyphs."""
    if a is None or b is None or len(a[1]) != len(b[1]):
        return 10**9
    worst = abs(a[0] - b[0])
    for (op_a, args_a), (op_b, args_b) in zip(a[1], b[1]):
        if op_a != op_b or len(args_a) != len(args_b):
            return 10**9
        for pa, pb in zip(args_a, args_b):
            worst = max(worst, abs(pa[0] - pb[0]), abs(pa[1] - pb[1]))
    return worst


def ranges(pkg):
    data = json.loads((FS / pkg / "package" / "unicode.json").read_text())
    cps = set()
    for key in ("latin", "latin-ext"):
        for part in data[key].split(","):
            part = part.strip().removeprefix("U+")
            lo, _, hi = part.partition("-")
            cps.update(range(int(lo, 16), int(hi or lo, 16) + 1))
    return cps


def outline(font, ch):
    cmap = font.getBestCmap()
    if ord(ch) not in cmap:
        return None
    name = cmap[ord(ch)]
    gs = font.getGlyphSet()
    pen = DecomposingRecordingPen(gs)
    gs[name].draw(pen)
    return font["hmtx"][name][0], pen.value


def at(font_path, wght):
    f = TTFont(font_path)
    lo = f["fvar"].axes[0].minValue
    hi = f["fvar"].axes[0].maxValue
    return instancer.instantiateVariableFont(f, {"wght": max(lo, min(hi, wght))})


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    unicodes = ranges("geist")  # same latin/latin-ext ranges in every Fontsource package
    failures = 0
    for out_name, up_file, pkg, style in FONTS:
        font = TTFont(UP / up_file)
        pins = {a.axisTag: None for a in font["fvar"].axes if a.axisTag != "wght"}
        if pins:
            font = instancer.instantiateVariableFont(font, pins)
            buf = io.BytesIO()
            font.save(buf)  # reload so the subsetter sees a fully decoded gvar
            buf.seek(0)
            font = TTFont(buf)
        opts = Options()
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        opts.flavor = "woff2"
        sub = Subsetter(opts)
        sub.populate(unicodes=unicodes)
        sub.subset(font)
        dest = OUT / f"{out_name}.woff2"
        font.flavor = "woff2"
        font.save(dest)

        built = TTFont(dest)
        axes = [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in built["fvar"].axes]
        peso = 0x20B1 in built.getBestCmap()
        line = f"{dest.name}: {dest.stat().st_size // 1024} KB, axes {axes}, peso {'yes' if peso else 'NO (not in this typeface)'}"

        if pkg:  # compare with Google's latin file
            ref_path = FS / pkg / "package" / "files" / f"{pkg}-latin-wght-{style}.woff2"
            ref_axes = [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in TTFont(ref_path)["fvar"].axes]
            diffs = []
            if ref_axes != axes:
                diffs.append(f"axes differ: ref {ref_axes}")
            lo, hi = ref_axes[0][1], ref_axes[0][3]
            upem = built["head"].unitsPerEm
            worst = (0, None)
            per_weight = {}
            for w in sorted({lo, 400, 700, hi}):
                per_weight[int(w)] = 0
                a_f, b_f = at(dest, w), at(ref_path, w)
                for ch in SAMPLE:
                    ra = outline(b_f, ch)
                    if ra is None:
                        continue  # not in Google's latin subset (e.g. the peso sign)
                    d = distance(outline(a_f, ch), ra)
                    per_weight[int(w)] = max(per_weight[int(w)], d)
                    if d > worst[0]:
                        worst = (d, w)
            if worst[0] > upem * TOLERANCE:
                diffs.append(f"outlines differ by up to {worst[0]} of {upem} units at wght {int(worst[1])}")
            if diffs:
                failures += 1
                line += "  MISMATCH: " + "; ".join(diffs)
            elif worst[0] == 0:
                line += "  identical to Google's file at " + "/".join(str(int(w)) for w in sorted({lo, 400, 700, hi}))
            else:
                line += f"  max difference from Google's file in units of {upem}, by weight: {per_weight}"
        print(line)
    sys.exit(1 if failures else 0)


main()
