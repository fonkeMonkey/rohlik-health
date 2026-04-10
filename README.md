# RohlikHealth

A Firefox extension that adds **Nutri-Score health ratings** (A–E) to every food product on [rohlik.cz](https://www.rohlik.cz).

![Nutri-Score badges on rohlik.cz product cards](testing/Screenshot%202026-04-10%20at%2018.08.20.png)

## What it does

- Overlays a colored badge on every product card: **A** (dark green) → **E** (red)
- Hover the badge to see full nutritional breakdown per 100g (energy, fat, sugar, protein, salt, fibre)
- Click the extension icon to open an instant side panel with a toggle and cache controls

## How scores are determined

1. **rohlik.cz API** — fetches the product's own nutritional data first
2. **Open Food Facts** — queries the free international food database by product name (tries Czech + English translation variants)
3. **Keyword fallback** — scores based on Czech food vocabulary when no API match is found
4. **Computed score** — calculates Nutri-Score from raw macros when rohlik has nutrition data but Open Food Facts has no match

Estimated scores (from keyword/computed) show a `~` indicator.

## Installation (Firefox)

1. Download or clone this repo
2. Open Firefox → `about:debugging` → **This Firefox**
3. Click **Load Temporary Add-on**
4. Select `manifest.json` from this folder

For permanent installation, the extension would need to be signed via [addons.mozilla.org](https://addons.mozilla.org).

## Files

```
manifest.json       Extension manifest (MV3, Firefox)
background.js       API fetching, caching, score computation
content.js          DOM observer, badge injection, in-page panel
content.css         Badge, tooltip and panel styles
popup.html/js       Fallback popup for non-rohlik pages
icons/              Extension icons
docs/               Spec, roadmap, progress notes
```

## Tech

- **Manifest V3** Firefox extension
- **Open Food Facts API** (free, no key required)
- **rohlik.cz internal API** for exact product nutrition data
- No tracking, all data cached locally for 24h
