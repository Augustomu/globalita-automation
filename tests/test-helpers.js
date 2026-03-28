// ================================================================
// test-helpers.js — Utilidades compartidas para todos los tests
//
// Provee launchBrowser(cuenta) que:
//   1. Si existe cookies-{cuenta}.json → launch headless + inyectar cookies
//   2. Si no → launchPersistentContext con la sesión local (fallback)
//
// Uso:
//   const { launchBrowser, delay, log, cerrarBanners, SELECTOR_PERFILES } = require('./test-helpers');
//   const { context, page } = await launchBrowser('francisco');
//   // ... test ...
//   await context.close();
// ================================================================

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const SESSION_DIRS = {
  alejandro : path.resolve(__dirname, '..', 'session'),
  david     : path.resolve(__dirname, '..', 'david agente invitaciones'),
  francisco : path.resolve(__dirname, '..', 'francisco agente invitaciones'),
};

const SELECTOR_PERFILES =
  'ol li:has(a[href*="/sales/lead/"]), ol li:has(a[href*="/sales/people/"]), ' +
  'ul li:has(a[href*="/sales/lead/"]), ul li:has(a[href*="/sales/people/"])';

// Buscar Chromium disponible — primero el de Playwright, luego en cache
function findChromium() {
  const paths = [
    // Playwright managed browsers (sorted by version desc)
    '/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
    '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
    // System browsers
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null; // Playwright usará su default
}

async function launchBrowser(cuenta) {
  if (!SESSION_DIRS[cuenta]) throw new Error(`Cuenta desconocida: ${cuenta}`);

  const cookieFile = path.resolve(__dirname, '..', `cookies-${cuenta}.json`);
  const hasCookies = fs.existsSync(cookieFile);
  const hasSession = fs.existsSync(SESSION_DIRS[cuenta]);

  if (hasCookies) {
    // MODO A: headless con cookies inyectadas
    log(`Modo cookies: ${cookieFile}`);
    const executablePath = findChromium();
    const launchOpts = { headless: true, viewport: { width: 1280, height: 860 } };
    if (executablePath) {
      log(`Usando browser: ${executablePath}`);
      launchOpts.executablePath = executablePath;
    }
    const browser = await chromium.launch(launchOpts);
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });

    const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
    await context.addCookies(cookies);
    log(`${cookies.length} cookies cargadas`);

    const page = await context.newPage();
    // context.close() también cierra el browser en este modo
    return { context, page, mode: 'cookies' };
  }

  if (hasSession) {
    // MODO B: sesión persistente local (Windows/máquina del usuario)
    log(`Modo sesión persistente: ${SESSION_DIRS[cuenta]}`);
    const context = await chromium.launchPersistentContext(SESSION_DIRS[cuenta], {
      headless: false,
      viewport: { width: 1280, height: 860 },
    });
    const page = await context.newPage();
    return { context, page, mode: 'persistent' };
  }

  throw new Error(
    `No se encontró ni cookies-${cuenta}.json ni la sesión "${SESSION_DIRS[cuenta]}".\n` +
    `Corré en Windows: node export-cookies.js ${cuenta}\n` +
    `Luego: git add cookies-${cuenta}.json && git commit && git push`
  );
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
}

async function cerrarBanners(page) {
  await page.evaluate(() => {
    const sels = [
      '[data-test-global-alert-dismiss]', '[aria-label="Dismiss"]',
      '[aria-label="Cerrar"]', '[aria-label="Fechar"]',
      '.artdeco-global-alert__dismiss', '.global-alert-banner__dismiss'
    ];
    sels.forEach(s => document.querySelectorAll(s).forEach(b => {
      try { b.click(); } catch (_) {}
    }));
  }).catch(() => {});
}

module.exports = { launchBrowser, delay, log, cerrarBanners, SELECTOR_PERFILES, SESSION_DIRS };
