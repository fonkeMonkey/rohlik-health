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

chrome.storage.local.get('rohlikHealthEnabled', ({ rohlikHealthEnabled }) => {
  enabled = rohlikHealthEnabled !== false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'rohlikHealthEnabled' in changes) {
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

function getProductId(card) {
  const href = card.getAttribute('href') || '';
  const m = href.match(/^\/(\d+)-/);
  return m ? m[1] : null;
}

function getImageContainer(card) {
  // Use the card itself as positioning parent — no DOM manipulation needed.
  // Cards are flex columns with image on top, so top:8px right:8px lands on the image.
  return card;
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

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const title = el('div', 'rh-tt-title');
  title.append('Nutri-Score: ');
  const strong = el('strong', `rh-score-${score.toLowerCase()}-text`, score);
  title.append(strong);
  title.append(` — ${scoreLabel[score] || ''}`);
  tooltip.appendChild(title);

  if (source === 'fallback') {
    tooltip.appendChild(el('div', 'rh-tt-note', 'Estimated from product name'));
  } else if (source === 'computed') {
    tooltip.appendChild(el('div', 'rh-tt-note', 'Score computed from rohlik.cz nutrition data'));
  }

  if (per100g && Object.values(per100g).some(v => v != null)) {
    const rows = [
      ['Energy',        per100g.energy       != null ? `${per100g.energy} kcal`              : null],
      ['Fat',           per100g.fat          != null ? `${per100g.fat.toFixed(1)} g`          : null],
      ['Saturated fat', per100g.saturatedFat != null ? `${per100g.saturatedFat.toFixed(1)} g` : null],
      ['Carbs',         per100g.carbs        != null ? `${per100g.carbs.toFixed(1)} g`        : null],
      ['Sugar',         per100g.sugar        != null ? `${per100g.sugar.toFixed(1)} g`        : null],
      ['Protein',       per100g.protein      != null ? `${per100g.protein.toFixed(1)} g`      : null],
      ['Salt',          per100g.salt         != null ? `${per100g.salt.toFixed(2)} g`         : null],
      ['Fibre',         per100g.fiber        != null ? `${per100g.fiber.toFixed(1)} g`        : null],
    ].filter(([, v]) => v !== null);

    const table = el('table', 'rh-tt-table');
    for (const [label, value] of rows) {
      const tr = document.createElement('tr');
      tr.appendChild(el('td', null, label));
      tr.appendChild(el('td', null, value));
      table.appendChild(tr);
    }
    tooltip.appendChild(table);
    tooltip.appendChild(el('div', 'rh-tt-footer', 'per 100g'));
  }

  const sourceLabel = {
    'openfoodfacts': 'Source: Open Food Facts',
    'computed': 'Source: rohlik.cz nutrition data',
  }[source];
  if (sourceLabel) tooltip.appendChild(el('div', 'rh-tt-source', sourceLabel));
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

  const category = window.location.pathname;
  const productId = getProductId(card);
  chrome.runtime.sendMessage({ type: 'GET_RATING', productName: name, category, productId }, (response) => {
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

// ── In-page panel ────────────────────────────────────────────────────────────

let panel = null;

function buildPanel() {
  function mk(tag, id, cls) {
    const e = document.createElement(tag);
    if (id)  e.id = id;
    if (cls) e.className = cls;
    return e;
  }

  const panel = mk('div', 'rh-panel');

  // Header
  const header = mk('div', 'rh-panel-header');
  const logo = mk('span', 'rh-panel-logo'); logo.textContent = 'H';
  const titleWrap = mk('div');
  const titleEl = mk('div', 'rh-panel-title'); titleEl.textContent = 'RohlikHealth';
  const subEl   = mk('div', 'rh-panel-sub');   subEl.textContent   = 'Nutri-Score ratings';
  titleWrap.append(titleEl, subEl);
  const closeBtn = mk('button', 'rh-panel-close'); closeBtn.textContent = '✕';
  header.append(logo, titleWrap, closeBtn);
  panel.appendChild(header);

  // Body
  const body = mk('div', 'rh-panel-body');

  const row = mk('div', null, 'rh-panel-row');
  const rowLabel = mk('span', null, 'rh-panel-label'); rowLabel.textContent = 'Show ratings';
  const toggleLabel = mk('label', null, 'rh-toggle');
  const toggleInput = mk('input', 'rh-panel-toggle');
  toggleInput.type = 'checkbox'; toggleInput.checked = true;
  const toggleSlider = mk('span', null, 'rh-toggle-slider');
  toggleLabel.append(toggleInput, toggleSlider);
  row.append(rowLabel, toggleLabel);

  const stats = mk('div', 'rh-panel-stats');
  const countEl = mk('strong', 'rh-panel-count');
  countEl.textContent = String(document.querySelectorAll(`[${PROCESSED_ATTR}="done"]`).length);
  stats.append(countEl, ' products rated on this page');

  const legend = mk('div', 'rh-panel-legend');
  for (const s of ['A','B','C','D','E']) {
    const item = mk('div', null, 'rh-leg-item');
    const badge = mk('div', null, `rh-leg-badge rh-score-${s.toLowerCase()}`);
    badge.textContent = s;
    item.appendChild(badge);
    legend.appendChild(item);
  }

  const clearBtn = mk('button', 'rh-panel-clear'); clearBtn.textContent = 'Clear rating cache';
  const msg = mk('div', 'rh-panel-msg');

  body.append(row, stats, legend, clearBtn, msg);
  panel.appendChild(body);

  // Footer
  const footer = mk('div', 'rh-panel-footer');
  footer.append('Data from ');
  const link = document.createElement('a');
  link.href = 'https://world.openfoodfacts.org';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open Food Facts';
  footer.appendChild(link);
  panel.appendChild(footer);

  document.body.appendChild(panel);

  // toggle
  chrome.storage.local.get('rohlikHealthEnabled', ({ rohlikHealthEnabled }) => {
    toggleInput.checked = rohlikHealthEnabled !== false;
  });
  toggleInput.addEventListener('change', () => {
    enabled = toggleInput.checked;
    chrome.storage.local.set({ rohlikHealthEnabled: enabled });
    if (!enabled) removeAllBadges(); else processAll();
  });

  // close
  closeBtn.addEventListener('click', () => togglePanel(false));

  // clear cache
  clearBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, () => {
      msg.textContent = 'Cache cleared!';
      setTimeout(() => { msg.textContent = ''; }, 2000);
    });
  });

  return panel;
}

function togglePanel(forceOpen) {
  if (!panel) panel = buildPanel();
  const open = forceOpen !== undefined ? forceOpen : !panel.classList.contains('rh-panel-open');
  panel.classList.toggle('rh-panel-open', open);
}

// Handle messages
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'TOGGLE_PANEL') togglePanel();
  if (msg.type === 'GET_COUNT') {
    sendResponse({ count: document.querySelectorAll(`[${PROCESSED_ATTR}="done"]`).length });
  }
});

// Initial run
processAll();
