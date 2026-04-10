# RohlikHealth — Firefox Extension Spec

## Overview
A Firefox browser extension that overlays a health/nutrition rating badge on every food product card on rohlik.cz. Ratings are sourced from the OpenFoodFacts API (Nutri-Score A–E) and cached locally to avoid redundant requests.

## Problem
Rohlik.cz shows no nutritional information on product listing pages. Shoppers have no quick way to compare healthiness of products while browsing.

## Solution
Inject a small colored badge (A/B/C/D/E or a fallback score) onto each product card. Clicking the badge opens a tooltip with macro details (energy, fat, sugar, protein, salt).

## Data Source
**OpenFoodFacts API** (https://world.openfoodfacts.org/api/v2/search)
- Free, no auth required
- Returns Nutri-Score (A–E), macros, ingredients
- Search by product name

**Fallback scoring** — if OpenFoodFacts has no match, derive a rough score from the product name (e.g., "cukr"=E, "zelenina"=A, etc.) and show it in grey to indicate it's estimated.

## Rating Display
- Badge position: top-right corner of product card image
- Badge design: colored circle with letter (A=dark green, B=light green, C=yellow, D=orange, E=red, ?=grey)
- Size: ~28px diameter, unobtrusive
- Tooltip on hover: shows full nutritional breakdown per 100g

## Technical Approach
- **Manifest V3** Firefox extension
- **Content script** injected on `rohlik.cz/*`
- **MutationObserver** to handle SPA navigation and lazy-loaded cards
- **Background service worker** for API calls (avoids CORS issues)
- **chrome.storage.local** cache (product name → rating, TTL 24h)
- No external tracking, all data stays local

## Pages Targeted
- `/` (homepage)
- `/c*` (category pages)
- `/search*` (search results)
- Any page with product cards

## Files
```
/
├── manifest.json
├── background.js       # API fetcher + cache manager
├── content.js          # DOM observer + badge injector
├── content.css         # Badge styles + tooltip
├── popup.html          # Extension popup (toggle on/off)
├── popup.js
├── icons/
│   ├── icon-48.png
│   └── icon-96.png
```

## Non-Goals
- Not a full nutrition tracker
- No user accounts or sync
- No modification of cart or prices
- Czech-only (rohlik.cz), not rohlik.at/de
