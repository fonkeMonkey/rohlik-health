# RohlikHealth — Roadmap

## Feature 1: Extension Scaffold & Manifest
- Create `manifest.json` (Manifest V3, Firefox-compatible)
- Set up folder structure: `icons/`, `background.js`, `content.js`, `content.css`, `popup.html/js`
- Generate placeholder icons (48px, 96px)
- Verify extension loads in Firefox without errors

## Feature 2: DOM Observer — Product Card Detection
- Inject content script on all rohlik.cz pages
- Use MutationObserver to detect product cards appearing/changing (handles SPA navigation)
- Extract `productId` and product name from each card
- Mark processed cards with a `data-health-processed` attribute to avoid duplicates

## Feature 3: OpenFoodFacts API Integration + Cache
- Background service worker fetches Nutri-Score from OpenFoodFacts by product name
- Cache results in `chrome.storage.local` (key: product name, TTL: 24h)
- Fallback: keyword-based heuristic scoring when no API match (grey badge)
- Message passing: content script → background → content script

## Feature 4: Health Badge UI
- Inject colored badge (A–E letter in circle) onto product card image (top-right corner)
- Color coding: A=dark green, B=light green, C=yellow, D=orange, E=red, ?=grey
- CSS animations: fade-in on first appearance
- Responsive: badge scales with card size

## Feature 5: Nutritional Tooltip
- On badge hover/click: show tooltip with per-100g breakdown
  - Energy (kcal), Fat, Saturated fat, Sugar, Protein, Salt
- Tooltip positions itself to stay within viewport
- Clean dismissal on mouse-out

## Feature 6: Popup Toggle & Settings
- Extension popup with on/off toggle for the overlay
- Show count of rated products on current page
- Option to show/hide tooltip details
- State persists via `chrome.storage.sync`

## Feature 7: Polish & Edge Cases
- Handle products with no image (still inject badge)
- Debounce MutationObserver for performance
- Rate-limit API calls (max 2 concurrent)
- Show loading spinner on badge while fetching
- Handle rohlik.cz layout changes gracefully (defensive selectors)
