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

// Czech → English food word translation dictionary
const CZ_EN = {
  // dairy
  'mléko':'milk','smetana':'cream','máslo':'butter','sýr':'cheese','jogurt':'yogurt',
  'tvaroh':'quark','kefír':'kefir','skyr':'skyr','eidam':'edam','gouda':'gouda',
  'mozzarella':'mozzarella','parmezán':'parmesan','parmazán':'parmesan',
  'ementál':'emmental','feta':'feta','brie':'brie','camembert':'camembert',
  'ricotta':'ricotta','cottage':'cottage cheese',
  // meat & fish
  'kuřecí':'chicken','kuře':'chicken','krůtí':'turkey','hovězí':'beef',
  'vepřové':'pork','jehněčí':'lamb','telecí':'veal','králík':'rabbit',
  'losos':'salmon','treska':'cod','tuňák':'tuna','makrela':'mackerel',
  'sardinka':'sardine','platýs':'plaice','pstruh':'trout','kapr':'carp',
  'krevety':'shrimp','mušle':'mussels',
  'šunka':'ham','salám':'salami','klobása':'sausage','párek':'frankfurter',
  'slanina':'bacon','uzenina':'cold cuts',
  // vegetables
  'rajče':'tomato','okurka':'cucumber','paprika':'pepper','mrkev':'carrot',
  'cibule':'onion','česnek':'garlic','brokolice':'broccoli','špenát':'spinach',
  'kapusta':'cabbage','zelí':'cabbage','kedluben':'kohlrabi','celer':'celery',
  'řepa':'beet','cuketa':'zucchini','lilek':'eggplant','hrášek':'peas',
  'fazole':'beans','čočka':'lentils','cizrna':'chickpeas','kukuřice':'corn',
  'pórek':'leek','pór':'leek','chřest':'asparagus','batát':'sweet potato',
  'ředkvička':'radish','petržel':'parsley','houby':'mushrooms','žampiony':'mushrooms',
  // fruits
  'jablko':'apple','hruška':'pear','banán':'banana','pomeranč':'orange',
  'citron':'lemon','jahody':'strawberries','maliny':'raspberries',
  'borůvky':'blueberries','třešně':'cherries','višně':'sour cherries',
  'meruňky':'apricots','broskve':'peaches','švestky':'plums','mango':'mango',
  'ananas':'pineapple','kiwi':'kiwi','avokádo':'avocado','hrozny':'grapes',
  'meloun':'melon','granátové':'pomegranate','fíky':'figs','datle':'dates',
  'mandarinka':'mandarin','grapefruit':'grapefruit','brusinka':'cranberry',
  // bread & grains
  'chléb':'bread','rohlík':'bread roll','houska':'bread roll','bageta':'baguette',
  'těstoviny':'pasta','špagety':'spaghetti','rýže':'rice','kroupy':'barley',
  'ovesné':'oats','oves':'oats','celozrnný':'whole grain','žitný':'rye',
  'pohanka':'buckwheat','quinoa':'quinoa','bulgur':'bulgur','kuskus':'couscous',
  // sweets & snacks
  'čokoláda':'chocolate','sušenky':'cookies','koláč':'cake','dort':'cake',
  'zmrzlina':'ice cream','chipsy':'chips','hranolky':'french fries',
  'med':'honey','džem':'jam','marmeláda':'marmalade','cukr':'sugar',
  // drinks
  'pivo':'beer','víno':'wine','džus':'juice','limonáda':'lemonade',
  'káva':'coffee','čaj':'tea','voda':'water','mléko':'milk',
  // other
  'vejce':'eggs','ořechy':'nuts','mandle':'almonds','vlašské':'walnuts',
  'arašídy':'peanuts','pistácie':'pistachios','kešu':'cashews',
  'olej':'oil','ocet':'vinegar','mouka':'flour','škrob':'starch',
  'tofu':'tofu','hummus':'hummus','tahini':'tahini',
};

function translateToEnglish(name) {
  let result = name.toLowerCase()
    .replace(/\d+\s*(g|kg|ml|l|ks|cl|mg|%)\b/gi, '') // strip weights
    .replace(/\s+/g, ' ').trim();

  // Replace Czech words with English equivalents
  for (const [cz, en] of Object.entries(CZ_EN)) {
    result = result.replace(new RegExp(`\\b${cz}\\b`, 'gi'), en);
  }
  return result.trim();
}

// Generate search query variants to try (most specific → least specific)
// Returns pairs of [searchTerm, language]
function searchVariants(name) {
  const clean = name
    .replace(/\d+\s*(g|kg|ml|l|ks|cl|mg|%)\b/gi, '')
    .replace(/\s+/g, ' ').trim();

  const words = clean.split(' ').filter(w => w.length > 2);
  const translated = translateToEnglish(clean);
  const transWords = translated.split(' ').filter(w => w.length > 2);

  const variants = [];

  // Czech variants
  variants.push([clean, 'cs']);
  if (words.length > 2) variants.push([words.slice(1).join(' '), 'cs']); // drop brand
  if (words.length > 2) variants.push([words.slice(-2).join(' '), 'cs']); // last 2 words

  // English translated variants
  if (translated !== clean) {
    variants.push([translated, 'en']);
    if (transWords.length > 1) variants.push([transWords.slice(-2).join(' '), 'en']);
    // Single most descriptive English word
    const longest = [...transWords].sort((a, b) => b.length - a.length)[0];
    if (longest && longest.length > 3) variants.push([longest, 'en']);
  }

  // Deduplicate by search term
  const seen = new Set();
  return variants.filter(([term]) => {
    if (seen.has(term)) return false;
    seen.add(term);
    return true;
  });
}

async function queryOpenFoodFacts(searchTerm, lang = 'en') {
  const params = new URLSearchParams({
    search_terms: searchTerm,
    search_simple: 1,
    action: 'process',
    json: 1,
    page_size: 5,
    fields: 'product_name,nutriscore_grade,nutriments',
    lc: lang,
    // no cc filter — search globally for better coverage
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
    // Try multiple search variants (Czech + English translated) until one returns a Nutri-Score
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
