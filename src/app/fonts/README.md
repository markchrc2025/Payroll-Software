# Self-hosted fonts (PAY-126)

Every font the app uses is served from this folder through `next/font/local` in
`src/app/layout.tsx`. A build makes no request to Google Fonts. Before this, three
production builds failed while downloading fonts from Google (10, 11 and 12 Nov 2026).

| Folder | Typeface | Weights | Styles | Peso sign | Used by |
|---|---|---|---|---|---|
| `inter/` | Inter | 100 to 900 | normal, italic | yes | Admin (Frappe UI style) |
| `instrument-sans/` | Instrument Sans | 400 to 700 | normal | not in the typeface | ESS, Central, sign-in (`--font-sans` in `:root`) |
| `hanken-grotesk/` | Hanken Grotesk | 100 to 900 | normal | yes | Central body text, sign-in, some dialogs |
| `jetbrains-mono/` | JetBrains Mono | 100 to 800 | normal | not in the typeface | Numbers (`--font-mono` in `:root`), Central |
| `plus-jakarta-sans/` | Plus Jakarta Sans | 200 to 800 | normal | yes | ESS layout, two Central screens |
| `geist/` | Geist | 100 to 900 | normal | yes | Second in the stack behind Instrument Sans; draws ₱ there. Not preloaded |
| `geist-mono/` | Geist Mono | 100 to 900 | normal | yes | Second in the stack behind JetBrains Mono; draws ₱ there. Not preloaded |

Each file is a variable font covering **Latin and Latin Extended in one file**.
Google splits each font into a `latin` file and a `latin-ext` file, and the peso
sign (U+20B1) is only in `latin-ext`; a latin-only file draws every ₱ in a
fallback font. That happened twice: the Inter added in #264 (admin, from 12 Nov)
and the first self-hosted set in #266 (every font, 15 Nov), both latin-only.
Both were replaced by these files.

Licence: every typeface is under the SIL Open Font License 1.1; the licence sits
beside each file as `OFL.txt`.

## How the files were made (15 Nov 2026)

1. Source: the variable `.ttf` files in `ofl/<family>/` of
   [github.com/google/fonts](https://github.com/google/fonts) at commit
   `cc39c4c2c304bc368c9b7c311ea2bcc6013299fe`, the files Google Fonts serves from.
2. `scripts/fonts/build-self-hosted-fonts.py` pins every axis except weight at the
   font's default (what Google serves for a weight-only request), subsets to the
   `latin` and `latin-ext` ranges and writes woff2.
3. The same script compares each output with Google's own `latin` file (from the
   npm package `@fontsource-variable/<family>` 5.3.0) at the lightest weight, 400,
   700 and the heaviest weight: same axes, same advance widths, same outlines.
   All eight files were identical.

To rebuild (for example after a typeface update):

```sh
pip install fonttools brotli
# upstream .ttf files into one folder, e.g.
#   curl -LO "https://raw.githubusercontent.com/google/fonts/<commit>/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
# one folder per family with the unpacked Fontsource package, e.g.
#   mkdir -p fs/inter && (cd fs/inter && npm pack @fontsource-variable/inter && tar xzf *.tgz)
python3 -I scripts/fonts/build-self-hosted-fonts.py <upstream_dir> <fontsource_dir> <out_dir>
```

The script exits with code 1 if any output differs from Google's file by more
than 1% of the em. `src/__tests__/fonts-self-hosted.test.ts` checks the result
in CI: no `next/font/google`, every file present with its licence, ₱ present,
no font loaded that no style reads.
