# RohlikHealth — Progress

## Completed Features

### Feature 1: Extension Scaffold & Manifest ✅
- `manifest.json` — Manifest V3, Firefox (Gecko) compatible, host permissions for rohlik.cz + openfoodfacts
- `icons/icon-48.png`, `icons/icon-96.png` — generated programmatically
- All files scaffolded

### Feature 2: DOM Observer — Product Card Detection ✅
- `content.js` — MutationObserver watching for product cards across all rohlik.cz pages
- Multiple selector strategies (7 fallbacks) to handle SPA DOM changes
- Debounced at 300ms, `data-rh-processed` attribute prevents duplicates

### Feature 3: OpenFoodFacts API Integration + Cache ✅
- `background.js` — queries OpenFoodFacts by product name, parses Nutri-Score + macros
- 24h localStorage cache with TTL
- Keyword fallback scoring for unknown products (Czech vocabulary)
- Max 2 concurrent API requests

### Feature 4: Health Badge UI ✅
- `content.css` — colored circle badges (A=dark green → E=red)
- Loading spinner while fetching
- Fade-in animation

### Feature 5: Nutritional Tooltip ✅
- Per-100g breakdown in hover tooltip (energy, fat, sat. fat, sugar, protein, salt, fibre)
- Tooltip auto-positions to stay within viewport
- Click to pin open

### Feature 6: Popup Toggle & Settings ✅
- `popup.html` + `popup.js` — on/off toggle, rated product count, cache clear
- Nutri-Score legend shown

### Feature 7: Polish & Edge Cases ✅
- Fixed popup.html: renamed "RohlikHealth" → "Rohlik Score"
- Fixed popup.js: removed localStorage, now uses chrome.storage.local consistently
- Fixed content.js: replaced innerHTML on loading spinner with safe DOM construction
- Removed dead PAGE_COUNT message (popup already uses GET_COUNT request/response)

## All features complete
