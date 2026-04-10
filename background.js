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
  'meruňky':'apricots','broskve':'peaches','švestky','plums','nektarinka':'nectarine',
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

function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function cleanName(name) {
  return name
    .replace(/\d+\s*(g|kg|ml|l|ks|cl|mg|%)\b/gi, '') // strip weights & %
    .replace(/\b\d+\b/g, '')                            // strip standalone numbers
    .split(/\s+/)
    .filter(w => w.length > 1 && !NOISE_WORDS.has(w.toLowerCase()))
    .join(' ')
    .trim();
}

function translateToEnglish(name) {
  let result = cleanName(name).toLowerCase();
  for (const [cz, en] of Object.entries(CZ_EN)) {
    result = result.replace(new RegExp(`\\b${stripDiacritics(cz)}\\b`, 'gi'), en);
    result = result.replace(new RegExp(`\\b${cz}\\b`, 'gi'), en);
  }
  return result.replace(/\s+/g, ' ').trim();
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
      p.nutriscore_grade !== 'unknown'
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

function fallbackScore(name, category = '') {
  const lower = name.toLowerCase();
  const catLower = category.toLowerCase();

  for (const rule of FALLBACK_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      return { score: rule.score, source: 'fallback' };
    }
  }

  for (const [slug, score] of Object.entries(CATEGORY_SCORES)) {
    if (catLower.includes(slug)) {
      return { score, source: 'fallback' };
    }
  }

  return { score: '?', source: 'fallback' };
}

async function fetchNutriScore(productName, category = '') {
  const cacheKey = `rh_${productName.toLowerCase().trim()}`;

  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) {
    const entry = cached[cacheKey];
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.data;
  }

  let result;
  try {
    const variants = searchVariants(productName);
    let product = null;
    for (const [term, lang] of variants) {
      product = await queryOpenFoodFacts(term, lang);
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
