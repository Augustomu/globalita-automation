// ================================================================
// test-f1-camino-a.js — F1: Navegar por Saved Searches panel
//
// CAMINO A (96%): goto sales/search/people → click "Saved searches" →
//   click "Gerente, RJ MG ES BH" → waitForSelector(SELECTOR_PERFILES)
//
// Cuenta: francisco | Sesión: "francisco agente invitaciones"
// NO envía invitaciones — solo navega y detecta.
//
// Uso:
//   node tests/test-f1-camino-a.js
// ================================================================

const { chromium } = require('playwright');
const path = require('path');

const SESSION_DIR = path.resolve(__dirname, '..', 'francisco agente invitaciones');
const SEARCH_NAME = 'Gerente, RJ MG ES BH';
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
  log('CAMINO A — F1 Saved Searches panel — inicio');
  log(`Sesión: ${SESSION_DIR}`);
  log(`Búsqueda: "${SEARCH_NAME}"`);

  let context;
  try {
    context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      viewport: { width: 1280, height: 860 },
    });
    const page = await context.newPage();
    const t0 = Date.now();

    // 1. Navegar a la página de búsqueda de personas
    log('Paso 1: goto sales/search/people');
    await page.goto('https://www.linkedin.com/sales/search/people', {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    await delay(2000);
    await cerrarBanners(page);
    log(`Página cargada: ${page.url()}`);
    log(`Título: ${await page.title()}`);

    // 2. Buscar y clickear botón "Saved searches" / "Búsquedas guardadas" / "Pesquisas salvas"
    log('Paso 2: Buscando botón Saved Searches...');
    const savedBtn = await page.waitForSelector(
      'button:has-text("Saved searches"), button:has-text("Búsquedas guardadas"), button:has-text("Pesquisas salvas")',
      { timeout: 10000 }
    ).catch(() => null);

    if (!savedBtn) {
      // Auditoría: loguear todos los botones visibles
      const botones = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).slice(0, 30).map(b => ({
          text: b.textContent.trim().substring(0, 80),
          visible: b.offsetParent !== null
        })).filter(b => b.visible && b.text);
      });
      log('Botones visibles encontrados:');
      botones.forEach((b, i) => log(`  [${i}] "${b.text}"`));
      log(`CAMINO A: ❌ | botón Saved Searches no encontrado`);
      log(`URL final: ${page.url()}`);
      log('FIN');
      return;
    }

    log('Botón encontrado, haciendo click...');
    await savedBtn.click();
    await delay(1500);

    // 3. Buscar el link/elemento con el nombre exacto de la búsqueda
    log(`Paso 3: Buscando "${SEARCH_NAME}" en el panel...`);
    const searchLink = await page.waitForSelector(
      `a:has-text("${SEARCH_NAME}"), span:has-text("${SEARCH_NAME}"), div:has-text("${SEARCH_NAME}")`,
      { timeout: 8000 }
    ).catch(() => null);

    if (!searchLink) {
      // Auditoría: loguear textos visibles en el panel
      const textos = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a, span, div')).slice(0, 50).map(el => ({
          tag: el.tagName,
          text: el.textContent.trim().substring(0, 100),
          visible: el.offsetParent !== null
        })).filter(e => e.visible && e.text && e.text.includes('erente'));
      });
      log('Elementos con "erente" visibles:');
      textos.forEach((t, i) => log(`  [${i}] <${t.tag}> "${t.text}"`));
      log(`CAMINO A: ❌ | "${SEARCH_NAME}" no encontrado en panel`);
      log(`URL final: ${page.url()}`);
      log('FIN');
      return;
    }

    log(`Encontrado, haciendo click en "${SEARCH_NAME}"...`);
    await searchLink.click();

    // 4. Esperar perfiles
    log('Paso 4: Esperando SELECTOR_PERFILES (timeout: 15s)...');
    const perfil = await page.waitForSelector(SELECTOR_PERFILES, { timeout: 15000 }).catch(() => null);
    const ms = Date.now() - t0;

    if (!perfil) {
      const olCount = await page.locator('ol.artdeco-list').count();
      const ulCount = await page.locator('ul.artdeco-list').count();
      log(`CAMINO A: ❌ | ${ms}ms | 0 perfiles | ol=${olCount} ul=${ulCount}`);
      log(`URL final: ${page.url()}`);
      log(`Título: ${await page.title()}`);
      log('FIN');
      return;
    }

    await delay(500);
    const perfiles = await page.locator(SELECTOR_PERFILES).count();
    log(`CAMINO A: ✅ | ${ms}ms | ${perfiles} perfiles | URL: ${page.url()}`);
    log(`Título: ${await page.title()}`);
    log('FIN');

  } catch (err) {
    log(`ERROR: ${err.message}`);
  } finally {
    if (context) await context.close();
  }
})();
