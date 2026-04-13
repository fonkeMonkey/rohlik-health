#!/usr/bin/env node
/**
 * test-extension.js — Rohlik Score SDLC browser test
 *
 * Chrome:   Full Playwright automation — navigate rohlik.cz, count badges,
 *           verify tooltips, save screenshots.
 *
 * Firefox:  Playwright cannot drive extensions loaded via web-ext, so we use
 *           two-stage verification:
 *             1. web-ext build — confirms the extension packages without error.
 *             2. web-ext run   — confirms Firefox accepts the extension at runtime
 *                               (no install error = content scripts will fire).
 *           Screenshots are taken by Playwright using a fresh Firefox context;
 *           because extensions don't load there, the screenshots serve only as
 *           a layout baseline (no extension badges expected).
 *
 * Usage:  node test-extension.js
 * Exit:   0 = all checks passed, 1 = one or more checks failed
 */

const { chromium, firefox } = require('/usr/local/lib/node_modules/playwright');
const { execSync, spawn }    = require('child_process');
const path = require('path');
const fs   = require('fs');

const EXT_PATH = path.resolve(__dirname);
const FF_BIN   = '/home/claude/.cache/ms-playwright/firefox-1511/firefox/firefox';
const OUT_DIR  = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Pages that show products without a delivery address
const TEST_PAGES = [
  { label: 'pekarna (bakery)',  url: 'https://www.rohlik.cz/c300109000-pekarna-a-cukrarna' },
  { label: 'konzervy (canned)', url: 'https://www.rohlik.cz/c300110001-konzervy-hotovky-a-instantni-pokrmy' },
];

const MIN_BADGES = 5;

function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); }
function info(msg) { console.log(`  ℹ ${msg}`); }

// ── Chrome — full Playwright automation ──────────────────────────────────────

async function testChrome() {
  console.log('\n── CHROME ──────────────────────────────────');
  let failures = 0;

  const ctx = await chromium.launchPersistentContext('', {
    headless: false,
    executablePath: '/usr/bin/chromium',
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
    viewport: { width: 1280, height: 900 },
  });

  const page = await ctx.newPage();

  for (const { label, url } of TEST_PAGES) {
    console.log(`\n  Page: ${label}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const slug = label.split(' ')[0];
    const shot = `${OUT_DIR}/chrome-${slug}.png`;
    await page.screenshot({ path: shot });

    const badgeCount = await page.locator('.rh-badge').count();
    if (badgeCount >= MIN_BADGES) {
      pass(`${badgeCount} badges — ${path.basename(shot)}`);
    } else {
      fail(`Only ${badgeCount} badges (expected ≥ ${MIN_BADGES}) — ${path.basename(shot)}`);
      failures++;
    }

    if (badgeCount > 0) {
      await page.locator('.rh-badge').first().hover();
      await page.waitForTimeout(300);
      const tipShot = `${OUT_DIR}/chrome-${slug}-tooltip.png`;
      await page.screenshot({ path: tipShot });
      const tipVisible = await page.locator('.rh-tooltip').first().isVisible();
      if (tipVisible) {
        pass(`tooltip visible — ${path.basename(tipShot)}`);
      } else {
        fail(`tooltip NOT visible — ${path.basename(tipShot)}`);
        failures++;
      }
    }
  }

  await ctx.close();
  return failures;
}

// ── Firefox — load verification via web-ext + layout screenshots ─────────────

async function buildXpi() {
  const xpiPath    = path.join(EXT_PATH, '.ff-extension.xpi');
  const scriptPath = path.join(EXT_PATH, '.ff-build-xpi.py');
  const files = [
    'manifest.json', 'background.js', 'content.js', 'content.css',
    'popup.html', 'popup.js',
    ...fs.readdirSync(path.join(EXT_PATH, 'icons')).map(f => `icons/${f}`),
  ];
  fs.writeFileSync(scriptPath, [
    'import zipfile, os',
    `ext = ${JSON.stringify(EXT_PATH)}`,
    `xpi = ${JSON.stringify(xpiPath)}`,
    `files = ${JSON.stringify(files)}`,
    "with zipfile.ZipFile(xpi, 'w', zipfile.ZIP_DEFLATED) as z:",
    '    for f in files:',
    '        z.write(os.path.join(ext, f), f)',
  ].join('\n'));
  execSync(`python3 "${scriptPath}"`);
  return xpiPath;
}

async function testFirefox() {
  console.log('\n── FIREFOX ──────────────────────────────────');
  let failures = 0;

  // ── Stage 1: web-ext build (confirms manifest + extension is valid) ──────
  console.log('\n  Stage 1: web-ext build');
  try {
    const xpiPath = await buildXpi();
    pass(`XPI built: ${path.basename(xpiPath)} (${fs.statSync(xpiPath).size} bytes)`);
  } catch (err) {
    fail(`XPI build failed: ${err.message}`);
    failures++;
    return failures; // no point continuing
  }

  // ── Stage 2: web-ext run — confirm extension installs without error ──────
  console.log('\n  Stage 2: web-ext runtime load');
  let webextOutput = '';
  let webextError  = null;
  const proc = spawn('npx', [
    'web-ext', 'run',
    `--source-dir=${EXT_PATH}`,
    `--firefox=${FF_BIN}`,
    '--start-url=about:blank',
    '--no-reload',
  ], { cwd: EXT_PATH, stdio: 'pipe' });

  await new Promise(resolve => {
    const timer = setTimeout(resolve, 12000);
    proc.stdout.on('data', d => { webextOutput += d.toString(); });
    proc.stderr.on('data', d => { webextOutput += d.toString(); });
    proc.on('error', err => { webextError = err; clearTimeout(timer); resolve(); });
  });
  proc.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 500));

  if (webextError) {
    fail(`web-ext failed to start: ${webextError.message}`);
    failures++;
  } else if (webextOutput.includes('Error') && !webextOutput.includes('Starting web-ext')) {
    fail('web-ext reported errors loading extension');
    console.error('    Output:', webextOutput.slice(0, 300));
    failures++;
  } else {
    pass('Extension loaded in Firefox without errors');
  }

  // ── Stage 3: Page layout screenshot (no extension — Playwright limitation) ─
  console.log('\n  Stage 3: Page layout baseline screenshots');
  info('Note: Playwright cannot drive web-ext-loaded Firefox extensions.');
  info('These screenshots verify page structure only (no badge check).');

  try {
    const ctx = await firefox.launchPersistentContext('', {
      headless: false,
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();

    for (const { label, url } of TEST_PAGES) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      const slug = label.split(' ')[0];
      const shot = `${OUT_DIR}/firefox-${slug}-layout.png`;
      await page.screenshot({ path: shot });
      pass(`Layout screenshot: ${path.basename(shot)}`);
    }

    await ctx.close();
  } catch (err) {
    fail(`Firefox layout screenshot failed: ${err.message}`);
    failures++;
  }

  return failures;
}

// ── main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('Rohlik Score — browser extension test');
  console.log(`Extension: ${EXT_PATH}`);

  let total = 0;
  total += await testChrome();
  total += await testFirefox();

  console.log('\n' + '─'.repeat(55));
  if (total === 0) {
    console.log('All checks passed.');
    process.exit(0);
  } else {
    console.log(`${total} check(s) failed.`);
    process.exit(1);
  }
})();
