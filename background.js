// RohlikHealth — Background Service Worker
// Handles OpenFoodFacts API calls and caching

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const OFF_API = 'https://world.openfoodfacts.org/cgi/search.pl';
const MAX_CONCURRENT = 2;

let activeRequests = 0;
const queue = [];

// Keyword-based fallback scoring (Czech + English terms)
const FALLBACK_RULES = [
  { score: 'A', keywords: ['zelenina', 'salát', 'brokolice', 'špenát', 'kapusta', 'rajče', 'okurka', 'paprika', 'mrkev', 'celer', 'řepa', 'cuketa', 'lilek', 'hrášek', 'fazole', 'čočka', 'cizrna', 'ovoce', 'jablko', 'hruška', 'borůvky', 'maliny', 'jahody', 'citron', 'pomeranč', 'grapefruit', 'kiwi', 'mango', 'avokádo', 'granát', 'třešně', 'meruňky', 'broskve', 'švestky'] },
  { score: 'B', keywords: ['jogurt', 'tvaroh', 'cottage', 'kuře', 'krůta', 'ryba', 'losos', 'treska', 'tuňák', 'vejce', 'ořechy', 'mandle', 'vlašské', 'celozrnný', 'žitný', 'ovesné', 'müsli', 'quinoa', 'bulgur', 'pohanka', 'tofu', 'tempeh', 'hummus'] },
  { score: 'C', keywords: ['mléko', 'sýr', 'eidam', 'gouda', 'mozzarella', 'chléb', 'rohlík', 'houska', 'těstoviny', 'rýže', 'brambory', 'polévka', 'omáčka', 'šunka', 'salám'] },
  { score: 'D', keywords: ['klobása', 'párek', 'slanina', 'tučný', 'smažen', 'hranolky', 'chipsy', 'krekry', 'sušenky', 'croissant', 'donut', 'koláč', 'dort', 'zmrzlina', 'čokoláda', 'bonbon', 'cukrovinka', 'džem', 'med', 'sirup', 'kečup', 'majonéza'] },
  { score: 'E', keywords: ['cukr', 'cola', 'limonáda', 'energetický', 'energy drink', 'alkohol', 'pivo', 'víno', 'whisky', 'rum', 'vodka', 'sladký nápoj', 'instantní', 'fast food', 'nutelka', 'nutella', 'marmeláda'] },
];

function fallbackScore(name) {
  const lower = name.toLowerCase();
  for (const rule of FALLBACK_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      return { score: rule.score, source: 'fallback' };
    }
  }
  return { score: '?', source: 'fallback' };
}

async function fetchNutriScore(productName) {
  const cacheKey = `rh_${productName.toLowerCase().trim()}`;

  // Check cache
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) {
    const entry = cached[cacheKey];
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.data;
    }
  }

  // Query OpenFoodFacts
  const params = new URLSearchParams({
    search_terms: productName,
    search_simple: 1,
    action: 'process',
    json: 1,
    page_size: 3,
    fields: 'product_name,nutriscore_grade,nutriments,categories_tags',
    lc: 'cs',
    cc: 'cz',
  });

  let result;
  try {
    const resp = await fetch(`${OFF_API}?${params}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    const product = data.products?.find(p =>
      p.nutriscore_grade && p.nutriscore_grade !== 'not-applicable'
    );

    if (product) {
      const n = product.nutriments || {};
      result = {
        score: (product.nutriscore_grade || '?').toUpperCase(),
        source: 'openfoodfacts',
        name: product.product_name || productName,
        per100g: {
          energy: Math.round(n['energy-kcal_100g'] || n['energy_100g'] / 4.184 || 0),
          fat: n['fat_100g'] ?? null,
          saturatedFat: n['saturated-fat_100g'] ?? null,
          sugar: n['sugars_100g'] ?? null,
          protein: n['proteins_100g'] ?? null,
          salt: n['salt_100g'] ?? null,
          fiber: n['fiber_100g'] ?? null,
        },
      };
    } else {
      result = fallbackScore(productName);
    }
  } catch {
    result = fallbackScore(productName);
  }

  // Save to cache
  await chrome.storage.local.set({
    [cacheKey]: { data: result, timestamp: Date.now() }
  });

  return result;
}

function processQueue() {
  while (activeRequests < MAX_CONCURRENT && queue.length > 0) {
    const { productName, resolve } = queue.shift();
    activeRequests++;
    fetchNutriScore(productName)
      .then(resolve)
      .finally(() => {
        activeRequests--;
        processQueue();
      });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_RATING') {
    new Promise(resolve => {
      queue.push({ productName: msg.productName, resolve });
      processQueue();
    }).then(sendResponse);
    return true; // keep channel open for async response
  }

  if (msg.type === 'CLEAR_CACHE') {
    chrome.storage.local.clear().then(() => sendResponse({ ok: true }));
    return true;
  }
});
