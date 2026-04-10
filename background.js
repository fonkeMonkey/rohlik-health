// RohlikHealth — Background Service Worker
// Handles OpenFoodFacts API calls and caching

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const OFF_API = 'https://world.openfoodfacts.org/cgi/search.pl';
const MAX_CONCURRENT = 2;

let activeRequests = 0;
const queue = [];

// Category URL slug → default score when all else fails
const CATEGORY_SCORES = {
  'ovoce':        'A', 'zelenina':    'A', 'fruits':      'A', 'vegetables':  'A',
  'luštěniny':    'A', 'houby':       'A',
  'ryby':         'B', 'maso':        'C', 'drůbež':      'B', 'vejce':       'B',
  'mlecne':       'C', 'mléčné':      'C', 'dairy':       'C', 'sýry':        'C',
  'chléb':        'C', 'pekárna':     'C', 'cereálie':    'B', 'müsli':       'B',
  'nápoje':       'D', 'drinks':      'D', 'limonády':    'E', 'džusy':       'C',
  'cukrárna':     'D', 'sladkosti':   'D', 'čokoláda':    'D', 'snacks':      'D',
  'uzeniny':      'D', 'lahůdky':     'C', 'mražené':     'C',
  'alkohol':      'E', 'pivo':        'E', 'víno':        'E',
  'drogerie':     '?', 'kosmetika':   '?', 'domácnost':   '?',
};

// Comprehensive keyword scoring (Czech vocabulary)
const FALLBACK_RULES = [
  { score: 'A', keywords: [
    // vegetables
    'zelenina','salát','brokolice','špenát','kapusta','rajče','okurka','paprika',
    'mrkev','mrkva','celer','řepa','cuketa','lilek','hrášek','fazole','čočka',
    'cizrna','kukuřice','kedluben','pórek','pór','mangold','rukola','arugula',
    'fenykl','chřest','artyčok','batát','ředkvička','tuřín','pastinák','topinambury',
    'šalotka','jarní cibulka','pažitka','petržel','kopr','bazalka','tymián',
    'máta','rozmarýn','koriandr','zázvor','kurkuma','wasabi',
    // fruits
    'ovoce','jablko','hruška','borůvky','maliny','jahody','citron','pomeranč',
    'grapefruit','kiwi','mango','avokádo','granátové','třešně','višně','meruňky',
    'broskve','švestky','nektarinka','meloun','ananas','banán','banán','papája',
    'fíky','daktyle','datle','rozinky','brusinka','rybíz','angrešt','ostružiny',
    'grep','mandarinka','klementinka','pomelo','limetka','acai','goji',
    // legumes/nuts (plain)
    'edamame','tofu','tempeh','luštěniny',
  ]},
  { score: 'B', keywords: [
    'jogurt','tvaroh','cottage','skyr','kefír',
    'kuřecí','kuře','krůtí','krůta','králík',
    'losos','treska','tuňák','sardinky','makrela','platýs','štika','kapr','pstruh',
    'krevety','mušle','kalmár','chobotnice',
    'vejce','vaječný',
    'mandle','vlašské ořechy','kešu','pistácie','para ořechy','lískové ořechy',
    'chia','lněné','konopné semínko','dýňové semínko','sezam','slunečnicové',
    'celozrnný','celozrnné','žitný','žitné','ovesné','oves','quinoa','bulgur',
    'pohanka','amarant','špalda','kamut','freekeh',
    'hummus','tahini','miso','tempeh',
    'müsli','granola bez cukru',
    'proteinový','protein','whey',
  ]},
  { score: 'C', keywords: [
    'mléko','polotučné','odstředěné','smetana','máslo','ghí',
    'sýr','eidam','gouda','mozzarella','čedar','brie','camembert','parmazán',
    'parmezán','ementál','gruyère','ricotta','mascarpone','feta',
    'chléb','rohlík','houska','bageta','ciabatta','baguette','tortilla','pita',
    'těstoviny','špagety','penne','fusilli','lasagne','nudle','kuskus',
    'rýže','rýžový','kroupy','krupice','polenta','jáhly',
    'brambory','bramborový','sladká brambora',
    'polévka','vývar','bujón','consommé',
    'omáčka','pesto','passata','protlak','koncentrát',
    'šunka','varená šunka',
    'hovězí','vepřové','jehněčí','telecí',
    'pizza základ','wrapy',
    'granola','müsli s cukrem',
  ]},
  { score: 'D', keywords: [
    'klobása','párek','salám','mortadela','slanina','špek','uzenina','jitrnice',
    'tlačenka','sekaná','paštika','rillettes',
    'smažen','smažený','smažená','fritovan','hranolky','nugety',
    'chipsy','křupky','krekry','preclíky','popcorn','tyčinky slané',
    'sušenky','piškoty','oplatky','vafle','croissant','donut','kobliha',
    'koláč','dort','moučník','zákusek','muffin','brownie','cheesecake',
    'zmrzlina','nanuk','sorbet','mražený jogurt',
    'čokoláda','bonbon','cukrovinka','karamel','lízátko','žvýkačka',
    'džem','marmeláda','med','sirup','nektár sladký','povidla',
    'kečup','majonéza','tatarská','barbecue','hořčice sladká',
    'instantní polévka','instantní nudle','ramen',
    'sladký nápoj','ice tea','ledový čaj','džus slazený',
    'müsli tyčinka','proteinová tyčinka','cereální tyčinka',
  ]},
  { score: 'E', keywords: [
    'cukr','moučkový cukr','třtinový cukr','fruktóza','glukóza',
    'cola','coca-cola','pepsi','fanta','sprite','7up','mirinda',
    'limonáda','soda','tonic','energetický nápoj','energy drink','monster','redbull',
    'alkohol','pivo','víno','šampaňské','prosecco','whisky','rum','vodka',
    'gin','tequila','likér','brandy','cognac','slivovice',
    'nutella','nutelka','čokokrém','čokoládová pomazánka',
    'marshmallow','želé','gumové medvídky',
  ]},
];

function fallbackScore(name, category = '') {
  const lower = name.toLowerCase();
  const catLower = category.toLowerCase();

  // Check keywords in name
  for (const rule of FALLBACK_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      return { score: rule.score, source: 'fallback' };
    }
  }

  // Check page category
  for (const [slug, score] of Object.entries(CATEGORY_SCORES)) {
    if (catLower.includes(slug)) {
      return { score, source: 'fallback' };
    }
  }

  return { score: '?', source: 'fallback' };
}

// Generate search query variants to try (most specific → least specific)
function searchVariants(name) {
  const clean = name
    .replace(/\d+\s*(g|kg|ml|l|ks|cl|mg)\b/gi, '') // strip weights/quantities
    .replace(/\s+/g, ' ').trim();

  const words = clean.split(' ').filter(w => w.length > 2);
  const variants = [clean];

  // Drop first word (often brand name): "Madeta Jihočeský cottage" → "Jihočeský cottage"
  if (words.length > 2) variants.push(words.slice(1).join(' '));

  // Last 2-3 meaningful words (core product name)
  if (words.length > 3) variants.push(words.slice(-3).join(' '));
  if (words.length > 2) variants.push(words.slice(-2).join(' '));

  // Single most descriptive word (longest word, likely the food type)
  const longest = [...words].sort((a, b) => b.length - a.length)[0];
  if (longest && longest.length > 4) variants.push(longest);

  return [...new Set(variants)]; // deduplicate
}

async function queryOpenFoodFacts(searchTerm) {
  const params = new URLSearchParams({
    search_terms: searchTerm,
    search_simple: 1,
    action: 'process',
    json: 1,
    page_size: 5,
    fields: 'product_name,nutriscore_grade,nutriments',
    lc: 'cs',
    cc: 'cz',
  });

  const resp = await fetch(`${OFF_API}?${params}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.products?.find(p =>
    p.nutriscore_grade &&
    p.nutriscore_grade !== 'not-applicable' &&
    p.nutriscore_grade !== 'unknown'
  ) || null;
}

async function fetchNutriScore(productName, category = '') {
  const cacheKey = `rh_${productName.toLowerCase().trim()}`;

  // Check cache
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) {
    const entry = cached[cacheKey];
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.data;
  }

  let result;
  try {
    // Try multiple search variants until one returns a Nutri-Score
    const variants = searchVariants(productName);
    let product = null;
    for (const variant of variants) {
      product = await queryOpenFoodFacts(variant);
      if (product) break;
    }

    if (product) {
      const n = product.nutriments || {};
      const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0);
      result = {
        score: product.nutriscore_grade.toUpperCase(),
        source: 'openfoodfacts',
        name: product.product_name || productName,
        per100g: {
          energy: Math.round(kcal),
          fat: n['fat_100g'] ?? null,
          saturatedFat: n['saturated-fat_100g'] ?? null,
          sugar: n['sugars_100g'] ?? null,
          protein: n['proteins_100g'] ?? null,
          salt: n['salt_100g'] ?? null,
          fiber: n['fiber_100g'] ?? null,
        },
      };
    } else {
      result = fallbackScore(productName, category);
    }
  } catch {
    result = fallbackScore(productName, category);
  }

  await chrome.storage.local.set({
    [cacheKey]: { data: result, timestamp: Date.now() }
  });

  return result;
}

function processQueue() {
  while (activeRequests < MAX_CONCURRENT && queue.length > 0) {
    const { productName, category, resolve } = queue.shift();
    activeRequests++;
    fetchNutriScore(productName, category)
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
      queue.push({ productName: msg.productName, category: msg.category || '', resolve });
      processQueue();
    }).then(sendResponse);
    return true;
  }

  if (msg.type === 'CLEAR_CACHE') {
    chrome.storage.local.clear().then(() => sendResponse({ ok: true }));
    return true;
  }
});
