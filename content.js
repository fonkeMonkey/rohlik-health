// RohlikHealth — Content Script
// Observes the DOM and injects health rating badges onto product cards

const PROCESSED_ATTR = 'data-rh-processed';
const BADGE_CLASS = 'rh-badge';

// Selectors based on actual rohlik.cz DOM (Tailwind CSS, React SPA)
// Product cards are <a> links with flex-wrap + gap-50 + href matching /{id}-{slug}
const CARD_SELECTORS = [
  'a[class*="flex-wrap"][class*="gap-50"][href^="/"]',  // primary — confirmed from live DOM
  'a[class*="flex-wrap"][class*="gap-100"][href^="/"]', // variant
  '[data-test="productCard"]',                          // fallback if rohlik adds test ids
  '[class*="ProductCard"]',
];

// Name element selectors — tried in order inside a card
// Will be updated once inner card structure is confirmed
const NAME_SELECTORS = [
  '[class*="name"]',
  '[class*="title"]',
  '[class*="Name"]',
  '[class*="Title"]',
  'h2', 'h3', 'h4',
  'p[class*="text"]',
];

// Image container — <a> card IS the positioning parent, img is inside
const IMAGE_CONTAINER_SELECTORS = [
  'div > img',         // first div containing img
  '[class*="image"]',
  '[class*="Image"]',
  'figure',
  'picture',
];

let enabled = true;

chrome.storage.sync.get('rohlikHealthEnabled', ({ rohlikHealthEnabled }) => {
  enabled = rohlikHealthEnabled !== false;
});

chrome.storage.onChanged.addListener((changes) => {
  if ('rohlikHealthEnabled' in changes) {
    enabled = changes.rohlikHealthEnabled.newValue !== false;
    if (!enabled) removeAllBadges();
    else processAll();
  }
});

function trySelector(el, selectors) {
  for (const sel of selectors) {
    try {
      const found = el.matches(sel) ? el : el.querySelector(sel);
      if (found) return found;
    } catch {}
  }
  return null;
}

function findProductCards(root = document) {
  for (const sel of CARD_SELECTORS) {
    try {
      const cards = root.querySelectorAll(sel);
      if (cards.length > 0) return Array.from(cards);
    } catch {}
  }

  // Broad fallback: any element with a product id attribute
  const fallback = root.querySelectorAll('[data-productid], [data-product-id], [productid]');
  return Array.from(fallback);
}

function getProductName(card) {
  // Try named selectors first
  const el = trySelector(card, NAME_SELECTORS);
  if (el) {
    const text = el.textContent.trim();
    if (text.length > 2 && text.length < 150) return text;
  }

  // Try any span/p that looks like a name (not a price — prices start with digits)
  const spans = card.querySelectorAll('span, p, div');
  for (const s of spans) {
    if (s.children.length > 0) continue; // skip containers, want leaf text
    const text = s.textContent.trim();
    if (text.length > 4 && text.length < 120 && !/^\d/.test(text)) return text;
  }

  // Fallback: extract from href slug  e.g. /1349777-banan-1-ks → "banan 1 ks"
  const href = card.getAttribute('href') || '';
  const slugMatch = href.match(/^\/\d+-(.+)$/);
  if (slugMatch) return slugMatch[1].replace(/-/g, ' ');

  return null;
}

function getImageContainer(card) {
  // Find the div/element that wraps the product image — use as position:relative parent
  const img = card.querySelector('img');
  if (img) {
    // Walk up from img to find a block-level wrapper that isn't the card itself
    let el = img.parentElement;
    while (el && el !== card) {
      const display = getComputedStyle(el).display;
      if (display === 'block' || display === 'flex' || display === 'inline-block') {
        return el;
      }
      el = el.parentElement;
    }
    return img.parentElement || card;
  }
  return trySelector(card, IMAGE_CONTAINER_SELECTORS) || card;
}

function injectBadge(card, ratingData) {
  if (card.getAttribute(PROCESSED_ATTR) === 'done') return;
  card.setAttribute(PROCESSED_ATTR, 'done');

  const { score, source, per100g } = ratingData;

  const badge = document.createElement('div');
  badge.className = `${BADGE_CLASS} rh-score-${score.toLowerCase()}`;
  badge.setAttribute('aria-label', `Nutri-Score: ${score}`);
  badge.dataset.rhScore = score;
  badge.dataset.rhSource = source;

  const letter = document.createElement('span');
  letter.className = 'rh-letter';
  letter.textContent = score;
  badge.appendChild(letter);

  if (source === 'fallback') {
    const mark = document.createElement('span');
    mark.className = 'rh-estimated';
    mark.textContent = '~';
    badge.appendChild(mark);
  }

  // Build tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'rh-tooltip';

  const scoreLabel = { A: 'Excellent', B: 'Good', C: 'Fair', D: 'Poor', E: 'Bad', '?': 'Unknown' };
  let html = `<div class="rh-tt-title">Nutri-Score: <strong class="rh-score-${score.toLowerCase()}-text">${score}</strong> — ${scoreLabel[score] || ''}</div>`;

  if (source === 'fallback') {
    html += `<div class="rh-tt-note">Estimated from product name</div>`;
  }

  if (per100g) {
    html += `<table class="rh-tt-table">`;
    const rows = [
      ['Energy', per100g.energy != null ? `${per100g.energy} kcal` : null],
      ['Fat', per100g.fat != null ? `${per100g.fat.toFixed(1)} g` : null],
      ['Saturated fat', per100g.saturatedFat != null ? `${per100g.saturatedFat.toFixed(1)} g` : null],
      ['Sugar', per100g.sugar != null ? `${per100g.sugar.toFixed(1)} g` : null],
      ['Protein', per100g.protein != null ? `${per100g.protein.toFixed(1)} g` : null],
      ['Salt', per100g.salt != null ? `${per100g.salt.toFixed(2)} g` : null],
      ['Fibre', per100g.fiber != null ? `${per100g.fiber.toFixed(1)} g` : null],
    ].filter(([, v]) => v !== null);

    for (const [label, value] of rows) {
      html += `<tr><td>${label}</td><td>${value}</td></tr>`;
    }
    html += `</table><div class="rh-tt-footer">per 100g</div>`;
  }

  if (source === 'openfoodfacts') {
    html += `<div class="rh-tt-source">Source: Open Food Facts</div>`;
  }

  tooltip.innerHTML = html;
  badge.appendChild(tooltip);

  // Make badge interactive
  badge.addEventListener('mouseenter', () => positionTooltip(badge, tooltip));
  badge.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    tooltip.classList.toggle('rh-tt-pinned');
  });

  // Attach to image container
  const imgContainer = getImageContainer(card);
  imgContainer.style.position = 'relative';
  imgContainer.appendChild(badge);
}

function positionTooltip(badge, tooltip) {
  // Reset so we can measure natural size
  tooltip.style.left = '';
  tooltip.style.right = '';
  tooltip.style.top = '';
  tooltip.style.bottom = '';

  const br = badge.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer right side, fall back to left
  if (br.right + 200 > vw) {
    tooltip.style.right = '0';
    tooltip.style.left = 'auto';
  } else {
    tooltip.style.left = '0';
  }

  // Prefer below, fall back to above
  if (br.bottom + 180 > vh) {
    tooltip.style.bottom = '100%';
    tooltip.style.top = 'auto';
  } else {
    tooltip.style.top = '100%';
  }
}

function processCard(card) {
  if (!enabled) return;
  if (card.getAttribute(PROCESSED_ATTR)) return;
  card.setAttribute(PROCESSED_ATTR, 'pending');

  const name = getProductName(card);
  if (!name) {
    card.removeAttribute(PROCESSED_ATTR);
    return;
  }

  // Show loading badge
  const loadingBadge = document.createElement('div');
  loadingBadge.className = `${BADGE_CLASS} rh-loading`;
  loadingBadge.innerHTML = '<span class="rh-spinner"></span>';
  const imgContainer = getImageContainer(card);
  imgContainer.style.position = 'relative';
  imgContainer.appendChild(loadingBadge);

  chrome.runtime.sendMessage({ type: 'GET_RATING', productName: name }, (response) => {
    loadingBadge.remove();
    if (response) {
      injectBadge(card, response);
      updatePopupCount();
    } else {
      card.removeAttribute(PROCESSED_ATTR);
    }
  });
}

function processAll() {
  findProductCards().forEach(processCard);
}

function removeAllBadges() {
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach(b => b.remove());
  document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => {
    el.removeAttribute(PROCESSED_ATTR);
  });
}

function updatePopupCount() {
  const count = document.querySelectorAll(`[${PROCESSED_ATTR}="done"]`).length;
  chrome.runtime.sendMessage({ type: 'PAGE_COUNT', count }).catch(() => {});
}

// Debounced MutationObserver
let mutationTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(mutationTimer);
  mutationTimer = setTimeout(processAll, 300);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: false,
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_COUNT') {
    const count = document.querySelectorAll(`[${PROCESSED_ATTR}="done"]`).length;
    sendResponse({ count });
  }
});

// Initial run
processAll();
