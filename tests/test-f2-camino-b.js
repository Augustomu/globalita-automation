// ================================================================
// test-f2-camino-b.js — Test aislado: F2 container detection
//
// CAMINO B (94%): page.waitForSelector(SELECTOR_PERFILES, {timeout:12000})
// Espera directamente los perfiles en vez del contenedor.
// Audita si Francisco usa ol o ul.
//
// Cuenta: francisco | Búsqueda: "Gerente, RJ MG ES BH"
// NO envía invitaciones — solo navega y detecta.
//
// Uso:
//   node tests/test-f2-camino-b.js
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
  log('CAMINO B — inicio');
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

    // 2. FIX CAMINO B: waitForSelector directo sobre SELECTOR_PERFILES
    log('Esperando SELECTOR_PERFILES con waitForSelector (timeout: 12s)...');
    const t0 = Date.now();
    const primerPerfil = await page.waitForSelector(SELECTOR_PERFILES, { timeout: 12000 }).catch(() => null);
    const ms = Date.now() - t0;

    if (!primerPerfil) {
      log(`CAMINO B: ❌ | ${ms}ms | perfiles no encontrados`);
      // Auditoría de contenedores de todas formas
      const olCount = await page.locator('ol.artdeco-list').count();
      const ulCount = await page.locator('ul.artdeco-list').count();
      log(`Auditoría contenedores: ol.artdeco-list=${olCount} | ul.artdeco-list=${ulCount}`);
      log('FIN');
      return;
    }

    log(`Primer perfil encontrado en ${ms}ms`);

    // 3. Contar perfiles visibles
    await delay(500);
    const perfiles = await page.locator(SELECTOR_PERFILES).count();
    log(`Perfiles visibles: ${perfiles}`);

    // 4. Auditoría: ¿Francisco usa ol o ul?
    const olCount = await page.locator('ol.artdeco-list').count();
    const ulCount = await page.locator('ul.artdeco-list').count();
    log(`Auditoría contenedores: ol.artdeco-list=${olCount} | ul.artdeco-list=${ulCount}`);

    log(`CAMINO B: ✅ | ${ms}ms | ${perfiles} perfiles | ol=${olCount} ul=${ulCount}`);
    log('FIN');

  } catch (err) {
    log(`ERROR: ${err.message}`);
  } finally {
    if (context) await context.close();
  }
})();
