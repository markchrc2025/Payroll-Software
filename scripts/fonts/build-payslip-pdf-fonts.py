# Static Inter instances for the server-rendered payslip PDF (PAY-139).
# react-pdf needs TTF; the app's self-hosted Inter is a variable woff2.
# Output: src/lib/payslip/fonts/Inter-{Regular,Bold}.ttf with Latin,
# Latin-1, Latin Extended-A, the peso sign and tabular digits.
# Run from the repo root: python3 scripts/fonts/build-payslip-pdf-fonts.py
import io, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

src = "src/app/fonts/inter/inter-wght-normal.woff2"
unicodes = list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20B1, 0x2212]
for weight, name in [(400, "Inter-Regular"), (700, "Inter-Bold")]:
    f = TTFont(src)
    f.flavor = None
    inst = instancer.instantiateVariableFont(f, {"wght": weight})
    buf = io.BytesIO(); inst.save(buf); buf.seek(0)
    inst = TTFont(buf)
    # Tabular figures by default (amounts line up in columns): point the digit
    # code points at the glyphs the font's own 'tnum' feature substitutes.
    gsub = inst["GSUB"].table
    tnum = {}
    for fr in gsub.FeatureList.FeatureRecord:
        if fr.FeatureTag == "tnum":
            for li in fr.Feature.LookupListIndex:
                for st in gsub.LookupList.Lookup[li].SubTable:
                    tnum.update(getattr(st, "mapping", None) or {})
    digits = ["zero","one","two","three","four","five","six","seven","eight","nine"]
    swapped = 0
    for i, base in enumerate(digits):
        if base in tnum:
            for t in inst["cmap"].tables:
                if 0x30 + i in t.cmap:
                    t.cmap[0x30 + i] = tnum[base]
            swapped += 1
    opts = subset.Options()
    opts.layout_features = ["kern", "liga", "calt"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
    s.populate(unicodes=unicodes)
    s.subset(inst)
    # Distinct names per weight: PDF writers key embedded fonts by PostScript
    # name, so three instances all called "Inter-Regular" collapse into one.
    style = name.split("-", 1)[1]
    nt = inst["name"]
    for rec in list(nt.names):
        if rec.nameID in (1, 2, 3, 4, 6, 16, 17):
            nt.removeNames(nameID=rec.nameID)
    nt.setName("Inter", 1, 3, 1, 0x409)
    nt.setName("Regular" if style == "Regular" else style, 2, 3, 1, 0x409)
    nt.setName(f"Inter {style}; payslip instance", 3, 3, 1, 0x409)
    nt.setName(f"Inter {style}", 4, 3, 1, 0x409)
    nt.setName(name, 6, 3, 1, 0x409)
    inst["OS/2"].usWeightClass = weight
    out = f"src/lib/payslip/fonts/{name}.ttf"
    inst.save(out)
    print(out, "tabular digits swapped:", swapped)
