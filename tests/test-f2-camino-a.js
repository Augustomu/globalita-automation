// ================================================================
// test-f2-camino-a.js — Test aislado: F2 container detection
//
// CAMINO A (97%): page.waitForSelector('ol.artdeco-list', {timeout:12000})
//
// Cuenta: francisco | Búsqueda: "Gerente, RJ MG ES BH"
// NO envía invitaciones — solo navega y detecta.
//
// Uso:
//   node tests/test-f2-camino-a.js
// ================================================================

const { chromium } = require('playwright');
const path = require('path');

const SESSION_DIR = path.resolve(__dirname, '..', 'francisco agente invitaciones');
const SEARCH_URL  = 'https://www.linkedin.com/sales/search/people?savedSearchId=1964400233';
const SELECTOR_PERFILES =
  'ol li:has(a[href*="/sales/lead/"]), ol li:has(a[href*="/sales/people/"]), ' +
  'ul li:has(a[href*="/sales/lead/"]), ul li:has(a[href*="/sales/people/"])';

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg)  { console.log(`[${new Date().toISOString().slice(11,23)}] ${msg}`); }

async function cerrarBanners(page) {
  await page.evaluate(() => {
    const sels = ['[data-test-global-alert-dismiss]','[aria-label="Dismiss"]','[aria-label="Cerrar"]','[aria-label="Fechar"]','.artdeco-global-alert__dismiss','.global-alert-banner__dismiss'];
    sels.forEach(s => document.querySelectorAll(s).forEach(b => { try { b.click(); } catch(_){} }));
  }).catch(() => {});
}

(async () => {
  log('CAMINO A — inicio');
  log(`Sesión: ${SESSION_DIR}`);

  let context;
  try {
    context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      viewport: { width: 1280, height: 860 },
    });
    const page = await context.newPage();

    // 1. Navegar a la búsqueda guardada
    log(`Navegando a: ${SEARCH_URL}`);
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await delay(3000);
    await cerrarBanners(page);

    // 2. FIX CAMINO A: waitForSelector en vez de isVisible
    log('Esperando ol.artdeco-list con waitForSelector (timeout: 12s)...');
    const t0 = Date.now();
    const contenedor = await page.waitForSelector('ol.artdeco-list', { timeout: 12000 }).catch(() => null);
    const ms = Date.now() - t0;

    if (!contenedor) {
      log(`CAMINO A: ❌ | ${ms}ms | contenedor no encontrado`);
      log('FIN');
      return;
    }

    log(`Contenedor encontrado en ${ms}ms`);

    // 3. Contar perfiles visibles
    await delay(500);
    const perfiles = await page.locator(SELECTOR_PERFILES).count();
    log(`Perfiles visibles: ${perfiles}`);

    log(`CAMINO A: ✅ | ${ms}ms | ${perfiles} perfiles`);
    log('FIN');

  } catch (err) {
    log(`ERROR: ${err.message}`);
  } finally {
    if (context) await context.close();
  }
})();
