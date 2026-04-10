// RohlikHealth — Background Service Worker
// Handles OpenFoodFacts API calls and caching

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const OFF_V2 = 'https://world.openfoodfacts.org/api/v2/search';
const MAX_CONCURRENT = 2;

let activeRequests = 0;
const queue = [];

// Category URL slug → default score when all else fails
const CATEGORY_SCORES = {
  'ovoce':'A','zelenina':'A','fruits':'A','vegetables':'A','luštěniny':'A','houby':'A',
  'ryby':'B','drůbež':'B','vejce':'B','cerealie':'B','mlecne':'C','mlécné':'C',
  'maso':'C','dairy':'C','sýry':'C','chléb':'C','pekarna':'C','mrazene':'C','lahůdky':'C',
  'nápoje':'D','drinks':'D','cukrarna':'D','sladkosti':'D','snacks':'D','uzeniny':'D',
  'limonady':'E','alkohol':'E','pivo':'E','víno':'E',
  'drogerie':'?','kosmetika':'?','domácnost':'?','zvíře':'?','lékárna':'?',
};

// Build diacritic-stripped aliases for CZ_EN at startup so lookups work
// even if the product name has lost accents (e.g. "mleko" vs "mléko")
function buildCzEnWithAliases(dict) {
  const out = { ...dict };
  for (const [k, v] of Object.entries(dict)) {
    const stripped = stripDiacritics(k);
    if (stripped !== k) out[stripped] = v;
  }
  return out;
}

// Noise words to strip from product names before searching
const NOISE_WORDS = new Set([
  // Czech adjectives/descriptors
  'čerstvý','čerstvé','čerstvá','čerstvých','čerstvou',
  'mražený','mražené','mražená',
  'sušený','sušené','sušená',
  'uzený','uzená','uzené','neuzená','neuzený',
  'vařený','vařená','vařené',
  'celý','celé','celá',
  'plnotučné','polotučné','odstředěné','nízkotučné','tučný','tučné',
  'strouhaný','strouhaná','strouhaném','strouhaných',
  'krájený','krájené','plátky','kostky','kousky',
  'podestýlkový','podestýlková','volný','volné','klecový',
  'jihočeský','jihočeská','jihočeské','moravský','slovenský','slovenská',
  'královský','prémiový','prémiová',
  'přírodní','přírodního','přírodní',
  'tradiční','domácí',
  'velký','velké','malý','malé','mini','maxi','xxl',
  'balení','balení','balený','pack','multipack',
  'bio','organic','light','zero','bez','free',
  'original','originál','classic','klasický',
  'nový','nové','nová',
  // size/count descriptors
  'ks','cca','approx',
]);

// Czech → English food word dictionary (nouns + key adjectives)
const CZ_EN = {
  // dairy
  'mléko':'milk','smetana':'cream','máslo':'butter','sýr':'cheese','jogurt':'yogurt',
  'tvaroh':'quark','kefír':'kefir','skyr':'skyr','eidam':'edam','gouda':'gouda',
  'mozzarella':'mozzarella','parmezán':'parmesan','parmazán':'parmesan',
  'ementál':'emmental','feta':'feta','brie':'brie','camembert':'camembert',
  'ricotta':'ricotta','cottage':'cottage cheese','žervé':'cream cheese',
  'parenica':'string cheese','olomoucké':'olomouc cheese','tvarůžky':'olomouc cheese',
  'pomazánka':'spread','tavený':'processed cheese',
  // meat & fish
  'kuřecí':'chicken','kuře':'chicken','krůtí':'turkey','hovězí':'beef',
  'vepřové':'pork','jehněčí':'lamb','telecí':'veal','králík':'rabbit',
  'losos':'salmon','treska':'cod','tuňák':'tuna','makrela':'mackerel',
  'sardinka':'sardine','platýs':'plaice','pstruh':'trout','kapr':'carp',
  'krevety':'shrimp','mušle':'mussels','chobotnice':'octopus','kalmár':'squid',
  'šunka':'ham','salám':'salami','klobása':'sausage','párek':'frankfurter',
  'slanina':'bacon','špek':'bacon','uzenina':'cold cuts','jitrnice':'black pudding',
  'tlačenka':'head cheese','sekaná':'meatloaf','paštika':'pâté',
  // vegetables
  'rajče':'tomato','okurka':'cucumber','paprika':'pepper','mrkev':'carrot',
  'cibule':'onion','česnek':'garlic','brokolice':'broccoli','špenát':'spinach',
  'kapusta':'cabbage','zelí':'cabbage','kedluben':'kohlrabi','celer':'celery',
  'řepa':'beet','cuketa':'zucchini','lilek':'eggplant','hrášek':'peas',
  'fazole':'beans','čočka':'lentils','cizrna':'chickpeas','kukuřice':'corn',
  'pórek':'leek','pór':'leek','chřest':'asparagus','batát':'sweet potato',
  'ředkvička':'radish','petržel':'parsley','houby':'mushrooms','žampiony':'mushrooms',
  'hlíva':'oyster mushroom','rukola':'arugula','mangold':'chard','fenykl':'fennel',
  // fruits
  'jablko':'apple','hruška':'pear','banán':'banana','pomeranč':'orange',
  'citron':'lemon','jahody':'strawberries','maliny':'raspberries',
  'borůvky':'blueberries','třešně':'cherries','višně':'sour cherries',
  'meruňky':'apricots','broskve':'peaches','švestky':'plums','nektarinka':'nectarine',
  'mango':'mango','ananas':'pineapple','kiwi':'kiwi','avokádo':'avocado',
  'hrozny':'grapes','meloun':'melon','fíky':'figs','datle':'dates',
  'mandarinka':'mandarin','grapefruit':'grapefruit','brusinka':'cranberry',
  'ostružiny':'blackberries','rybíz':'currants','angrešt':'gooseberry',
  'rozinky':'raisins','slivka':'plum',
  // bread & grains
  'chléb':'bread','rohlík':'bread roll','houska':'bread roll','bageta':'baguette',
  'těstoviny':'pasta','špagety':'spaghetti','rýže':'rice','kroupy':'barley',
  'ovesné':'oats','oves':'oats','celozrnný':'whole grain','žitný':'rye bread',
  'pohanka':'buckwheat','quinoa':'quinoa','bulgur':'bulgur','kuskus':'couscous',
  'vločky':'flakes','kaše':'porridge','knedlík':'dumpling','tortilla':'tortilla',
  // sweets & snacks
  'čokoláda':'chocolate','sušenky':'cookies','koláč':'cake','dort':'cake',
  'zmrzlina':'ice cream','chipsy':'chips','hranolky':'french fries',
  'med':'honey','džem':'jam','marmeláda':'marmalade','cukr':'sugar',
  'oplatky':'wafers','piškoty':'sponge cake','croissant':'croissant',
  'tyčinka':'bar','müsli tyčinka':'muesli bar','puding':'pudding',
  'bonbon':'candy','karamel':'caramel','nugety':'nuggets',
  // drinks
  'pivo':'beer','víno':'wine','džus':'juice','limonáda':'lemonade',
  'káva':'coffee','čaj':'tea','voda':'water',
  'energetický':'energy drink','nápoj':'drink',
  // other
  'vejce':'eggs','ořechy':'nuts','mandle':'almonds','vlašské':'walnuts',
  'arašídy':'peanuts','pistácie':'pistachios','kešu':'cashews',
  'olej':'oil','ocet':'vinegar','mouka':'flour',
  'tofu':'tofu','hummus':'hummus','tahini':'tahini',
  'granola':'granola','müsli':'muesli',
  // adjectives worth keeping (become English search modifiers)
  'uzený':'smoked','sušený':'dried','strouhaný':'grated',
  'mražený':'frozen','vařený':'cooked','pečený':'baked',
  'plnotučné':'whole fat','polotučné':'semi skimmed','odstředěné':'skimmed',
};

// Expand with diacritic-stripped aliases (e.g. "mleko" → "milk" as well as "mléko")
const CZ_EN_FULL = buildCzEnWithAliases(CZ_EN);

function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function cleanName(name) {
  return name
    .replace(/\d+\s*(g|kg|ml|l|ks|cl|mg|%)/gi, '') // strip weights & %
    .replace(/\s\d+\s/g, ' ')                        // strip standalone numbers
    .split(/\s+/)
    .filter(w => {
      if (w.length <= 1) return false;
      const lower = w.toLowerCase();
      return !NOISE_WORDS.has(lower) && !NOISE_WORDS.has(stripDiacritics(lower));
    })
    .join(' ')
    .trim();
}

function translateToEnglish(name) {
  // Token-based translation — avoids \b regex which breaks on Czech chars (non-ASCII \w)
  const tokens = cleanName(name).toLowerCase().split(/\s+/);
  return tokens.map(token => CZ_EN_FULL[token] || token).join(' ').trim();
}

// Returns [[searchTerm, lang], ...] from most to least specific
function searchVariants(name) {
  const clean = cleanName(name);
  const translated = translateToEnglish(name);
  const cleanWords = clean.split(' ').filter(w => w.length > 2);
  const transWords = translated.split(' ').filter(w => w.length > 2);

  const variants = [];

  // 1. Full cleaned Czech name
  variants.push([clean, 'cs']);

  // 2. Drop first word (brand) — "Madeta Jihočeský cottage" → "cottage"
  if (cleanWords.length > 1) variants.push([cleanWords.slice(1).join(' '), 'cs']);

  // 3. Full English translation
  if (translated !== clean) variants.push([translated, 'en']);

  // 4. Last 2 translated words (core food noun + modifier)
  if (transWords.length > 2) variants.push([transWords.slice(-2).join(' '), 'en']);

  // 5. Single longest English word (most likely the food type)
  const longest = [...transWords].sort((a, b) => b.length - a.length)[0];
  if (longest?.length > 3) variants.push([longest, 'en']);

  // 6. Diacritic-free Czech (handles OFF entries that dropped accents)
  const noAccent = stripDiacritics(clean);
  if (noAccent !== clean) variants.push([noAccent, 'cs']);

  const seen = new Set();
  return variants.filter(([term]) => {
    const t = term.trim();
    if (!t || seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}

function isPlausibleMatch(searchTerm, productName) {
  if (!productName) return false;
  const searchWords = stripDiacritics(searchTerm.toLowerCase()).split(/\s+/).filter(w => w.length > 2);
  const resultWords = stripDiacritics(productName.toLowerCase()).split(/\W+/);
  // At least one meaningful search word must appear in the result name
  return searchWords.some(w => resultWords.some(r => r.includes(w) || w.includes(r)));
}

async function queryOpenFoodFacts(searchTerm, lang = 'en') {
  const params = new URLSearchParams({
    q: searchTerm,
    fields: 'product_name,nutriscore_grade,nutriments',
    page_size: 5,
    lc: lang,
  });

  try {
    const resp = await fetch(`${OFF_V2}?${params}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.products?.find(p =>
      p.nutriscore_grade &&
      p.nutriscore_grade !== 'not-applicable' &&
      p.nutriscore_grade !== 'unknown' &&
      isPlausibleMatch(searchTerm, p.product_name)
    ) || null;
  } catch {
    return null;
  }
}

// Comprehensive keyword scoring (Czech vocabulary)
const FALLBACK_RULES = [
  { score: 'A', keywords: [
    'zelenina','salát','brokolice','špenát','kapusta','rajče','okurka','paprika',
    'mrkev','mrkva','celer','řepa','cuketa','lilek','hrášek','fazole','čočka',
    'cizrna','kukuřice','kedluben','pórek','pór','mangold','rukola','fenykl',
    'chřest','batát','ředkvička','petržel','houby','žampiony','hlíva',
    'ovoce','jablko','hruška','borůvky','maliny','jahody','citron','pomeranč',
    'grapefruit','kiwi','mango','avokádo','třešně','meruňky','broskve','švestky',
    'nektarinka','meloun','ananas','banán','papája','fíky','datle','rozinky',
    'brusinka','rybíz','angrešt','ostružiny','mandarinka','limetka','acai','goji',
    'edamame','tofu','tempeh','luštěniny',
  ]},
  { score: 'B', keywords: [
    'jogurt','tvaroh','cottage','skyr','kefír','žervé',
    'kuřecí','kuře','krůtí','drůbež','králík',
    'losos','treska','tuňák','sardinky','makrela','platýs','pstruh','kapr','krevety',
    'vejce','vaječný',
    'mandle','vlašské','kešu','pistácie','para','lískové','slunečnicové','dýňové',
    'chia','lněné','konopné','sezam',
    'celozrnný','celozrnné','žitný','žitné','ovesné','oves','quinoa','bulgur',
    'pohanka','špalda','amarant','kamut',
    'hummus','tahini','miso','tempeh',
    'proteinový','protein','whey','skyr',
    'parenica','parenice',
  ]},
  { score: 'C', keywords: [
    'mléko','smetana','máslo','tvarůžky',
    'sýr','eidam','gouda','mozzarella','čedar','brie','camembert','parmezán',
    'ementál','ricotta','mascarpone','feta','tavený','pomazánka',
    'chléb','rohlík','houska','bageta','tortilla','pita','wrap',
    'těstoviny','špagety','rýže','kroupy','kuskus','polenta','jáhly',
    'brambory','bramborový',
    'polévka','vývar','bujón','omáčka','protlak',
    'šunka','hovězí','vepřové','jehněčí','svíčková','guláš',
    'granola','müsli',
  ]},
  { score: 'D', keywords: [
    'klobása','párek','salám','mortadela','slanina','špek','jitrnice','tlačenka',
    'paštika','sekaná',
    'smažen','smažený','fritovan','hranolky','nugety',
    'chipsy','křupky','krekry','preclíky','popcorn',
    'sušenky','piškoty','oplatky','vafle','croissant','donut','kobliha',
    'koláč','dort','zákusek','muffin','brownie','cheesecake','puding',
    'zmrzlina','nanuk','sorbet',
    'čokoláda','bonbon','karamel','lízátko','žvýkačka','cukrovinka',
    'džem','marmeláda','med','sirup','povidla',
    'kečup','majonéza','tatarská','barbecue',
    'instantní','ramen',
    'ledový čaj','ice tea',
    'tyčinka','cereální','müsli bar',
  ]},
  { score: 'E', keywords: [
    'cukr','fruktóza','glukóza',
    'cola','coca-cola','pepsi','fanta','sprite','mirinda',
    'limonáda','energetický nápoj','energy drink','monster','redbull',
    'alkohol','pivo','víno','šampaňské','prosecco','whisky','rum','vodka',
    'gin','tequila','likér','slivovice',
    'nutella','nutelka','čokokrém',
    'marshmallow','želé','gumové',
  ]},
];

// Zero/light/diet markers — these upgrade E→C and D→C for sugary drink keywords
const ZERO_MARKERS = ['zero','light','diet','bez cukru','sugar free','no sugar','sugarfree'];

function fallbackScore(name, category = '') {
  const lower = name.toLowerCase();
  const catLower = category.toLowerCase();
  const isZeroSugar = ZERO_MARKERS.some(m => lower.includes(m));

  for (const rule of FALLBACK_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      // Zero/light drinks are genuinely less bad — upgrade E or D to C
      const score = isZeroSugar && (rule.score === 'E' || rule.score === 'D') ? 'C' : rule.score;
      return { score, source: 'fallback' };
    }
  }

  for (const [slug, score] of Object.entries(CATEGORY_SCORES)) {
    if (catLower.includes(slug)) {
      return { score, source: 'fallback' };
    }
  }

  return { score: '?', source: 'fallback' };
}

// Fetch nutritional data directly from rohlik.cz product detail API.
// Returns per100g object if nutritionalValues is populated, else null.
async function fetchRohlikNutrition(productId) {
  if (!productId) return null;
  try {
    const resp = await fetch(`https://www.rohlik.cz/api/v1/products/${productId}/details`);
    if (!resp.ok) return null;
    const data = await resp.json();

    const vals = data.nutritionalValues ?? data.product?.nutritionalValues ?? [];
    if (!vals.length) return null;

    // Map rohlik nutrient keys → our keys
    const map = {};
    for (const v of vals) {
      const key = (v.name || v.key || '').toLowerCase();
      const val = parseFloat(v.valuePer100g ?? v.value ?? v.amount ?? 0);
      if (key.includes('energ') || key.includes('kcal'))        map.energy = Math.round(val);
      else if (key.includes('tuk') || key === 'fat')             map.fat = val;
      else if (key.includes('nasycen') || key.includes('saturated')) map.saturatedFat = val;
      else if (key.includes('sacharid') || key.includes('carbo')) map.carbs = val;
      else if (key.includes('cukr') || key.includes('sugar'))   map.sugar = val;
      else if (key.includes('bílkov') || key.includes('protein')) map.protein = val;
      else if (key.includes('sůl') || key.includes('salt') || key.includes('sodium')) map.salt = val;
      else if (key.includes('vlákn') || key.includes('fiber') || key.includes('fibre')) map.fiber = val;
    }

    return Object.keys(map).length >= 2 ? map : null;
  } catch {
    return null;
  }
}

// Compute a simple Nutri-Score estimate from raw macros when OFF has no match
function scoreFromNutriments(n) {
  if (!n) return null;
  const energy = n.energy ?? 0;
  const sugar   = n.sugar   ?? 0;
  const fat     = n.fat     ?? 0;
  const satFat  = n.saturatedFat ?? 0;
  const protein = n.protein ?? 0;
  const fiber   = n.fiber   ?? 0;
  const salt    = n.salt    ?? 0;

  // Simplified Nutri-Score points (bad = high, good = low)
  let bad = 0;
  bad += energy > 3350 ? 10 : energy > 2680 ? 6 : energy > 2010 ? 3 : 0;
  bad += sugar  > 45   ? 10 : sugar  > 30   ? 6 : sugar  > 15   ? 3 : 0;
  bad += satFat > 10   ? 10 : satFat > 7    ? 6 : satFat > 4    ? 3 : 0;
  bad += salt   > 1.8  ? 10 : salt   > 0.9  ? 6 : salt   > 0.3  ? 3 : 0;

  let good = 0;
  good += protein > 8  ? 5  : protein > 5  ? 3  : protein > 2 ? 1 : 0;
  good += fiber   > 7  ? 5  : fiber   > 4  ? 3  : fiber   > 2 ? 1 : 0;

  const score = bad - good;
  if (score <= 0)  return 'A';
  if (score <= 3)  return 'B';
  if (score <= 8)  return 'C';
  if (score <= 14) return 'D';
  return 'E';
}

async function fetchNutriScore(productName, category = '', productId = null) {
  const cacheKey = `rh_${productName.toLowerCase().trim()}`;

  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) {
    const entry = cached[cacheKey];
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.data;
  }

  let result;
  try {
    // 1. Try rohlik.cz detail API first (same-origin, fast, exact product)
    const rohlikNutrition = await fetchRohlikNutrition(productId);

    // 2. Try OpenFoodFacts for official Nutri-Score
    const variants = searchVariants(productName);
    let offProduct = null;
    for (const [term, lang] of variants) {
      offProduct = await queryOpenFoodFacts(term, lang);
      if (offProduct) break;
    }

    if (offProduct) {
      // Prefer OFF Nutri-Score, but use rohlik nutrition data if richer
      const n = rohlikNutrition || offProduct.nutriments || {};
      const offN = offProduct.nutriments || {};
      const kcal = n.energy ?? offN['energy-kcal_100g'] ?? (offN['energy_100g'] ? offN['energy_100g'] / 4.184 : 0);
      result = {
        score: offProduct.nutriscore_grade.toUpperCase(),
        source: 'openfoodfacts',
        name: offProduct.product_name || productName,
        per100g: {
          energy: Math.round(kcal),
          fat:          n.fat          ?? offN['fat_100g']           ?? null,
          saturatedFat: n.saturatedFat ?? offN['saturated-fat_100g'] ?? null,
          sugar:        n.sugar        ?? offN['sugars_100g']         ?? null,
          protein:      n.protein      ?? offN['proteins_100g']       ?? null,
          salt:         n.salt         ?? offN['salt_100g']           ?? null,
          fiber:        n.fiber        ?? offN['fiber_100g']          ?? null,
        },
      };
    } else if (rohlikNutrition) {
      // Have rohlik nutrition but no OFF match — compute score from macros
      const computed = scoreFromNutriments(rohlikNutrition);
      result = {
        score: computed || '?',
        source: computed ? 'computed' : 'fallback',
        name: productName,
        per100g: rohlikNutrition,
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
    const { productName, category, productId, resolve } = queue.shift();
    activeRequests++;
    fetchNutriScore(productName, category, productId)
      .then(resolve)
      .finally(() => {
        activeRequests--;
        processQueue();
      });
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.url?.includes('rohlik.cz')) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_RATING') {
    new Promise(resolve => {
      queue.push({ productName: msg.productName, category: msg.category || '', productId: msg.productId || null, resolve });
      processQueue();
    }).then(sendResponse);
    return true;
  }

  if (msg.type === 'CLEAR_CACHE') {
    chrome.storage.local.clear().then(() => sendResponse({ ok: true }));
    return true;
  }
});
