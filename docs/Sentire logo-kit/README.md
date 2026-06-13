# Sentire Logo Kit

Official brand mark: **Nexus** (mesh variant) · Core orange `#E8693A` · Ink `#2A2420`

## Which file should I use?

| Use case | File | Why |
|---|---|---|
| Website, app UI (any size) | `sentire-mark.svg` | **SVG is the master format** — vector, infinitely sharp, ~1 KB |
| On dark backgrounds | `sentire-mark-dark.svg` | Light nodes + adjusted orange core |
| App icon / favicon / social avatar | `sentire-app-icon.svg` | Mark on warm espresso tile, rounded square |
| Email signatures, docs, social posts | `sentire-logo-horizontal.png` | Raster lockup with wordmark, white background |
| Stores needing big raster (1024px) | `sentire-mark-1024.png`, `sentire-app-icon-1024.png` | Transparent / tile PNG |

> Rule of thumb: **always prefer the SVG.** Only fall back to PNG where SVG isn't accepted (some email clients, app stores).

## Wordmark

The wordmark is plain text, not an image — render it next to the mark in **Instrument Sans 600**, letter-spacing `-0.02em`, color `#2A2420`:

```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@600&display=swap" rel="stylesheet">

<a class="sentire-logo" href="/">
  <img src="/assets/sentire-mark.svg" alt="" width="34" height="34">
  <span>Sentire</span>
</a>

<style>
.sentire-logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
.sentire-logo span {
  font-family: "Instrument Sans", sans-serif; font-weight: 600;
  font-size: 26px; letter-spacing: -0.02em; color: #2A2420; line-height: 1;
}
</style>
```

## Favicon

```html
<link rel="icon" type="image/svg+xml" href="/assets/sentire-app-icon.svg">
<link rel="apple-touch-icon" href="/assets/sentire-app-icon-1024.png">
```

## Brand colors

| Token | Hex |
|---|---|
| Core orange | `#E8693A` |
| Ink | `#2A2420` |
| Sand | `#F2ECE4` |
| Warm slate | `#6B6259` |
| Books | `#C7913D` |
| Payroll | `#4F9373` |
| Tax | `#A0627D` |
| POS | `#5E7FB1` |

## Usage rules

- Clear space around the mark = the core dot's diameter on all sides.
- Mark stays legible down to 16px; below 24px drop the wordmark.
- Don't recolor, rotate, outline, or add effects to the mark.
