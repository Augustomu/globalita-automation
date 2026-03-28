// ================================================================
// test-f1-camino-c.js — F1: Página de listas sales/lists/people
//
// CAMINO C (91%): goto sales/lists/people → click link con nombre →
//   waitForSelector(SELECTOR_PERFILES)
//
// Cuenta: francisco | NO envía invitaciones.
//
// Uso:
//   node tests/test-f1-camino-c.js
// ================================================================

const { launchBrowser, delay, log, cerrarBanners, SELECTOR_PERFILES } = require('./test-helpers');

const SEARCH_NAME = 'Gerente, RJ MG ES BH';

(async () => {
  log('CAMINO C — F1 sales/lists/people — inicio');
  log(`Búsqueda: "${SEARCH_NAME}"`);

  let context;
  try {
    const res = await launchBrowser('francisco');
    context = res.context;
    const page = res.page;
    log(`Modo: ${res.mode}`);
    const t0 = Date.now();

    // 1. Navegar a la página de listas
    log('Paso 1: goto sales/lists/people');
    await page.goto('https://www.linkedin.com/sales/lists/people', {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    await delay(2000);
    await cerrarBanners(page);
    log(`Página cargada: ${page.url()}`);
    log(`Título: ${await page.title()}`);

    // 2. Auditoría: loguear elementos relevantes
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a, button, span, td, th'))
        .filter(el => el.offsetParent !== null && el.textContent.trim())
        .map(el => ({
          tag: el.tagName,
          text: el.textContent.trim().substring(0, 120),
          href: el.href || ''
        }))
        .filter(l => {
          const t = l.text.toLowerCase();
          return t.includes('gerente') || t.includes('consultor') || t.includes('saved') ||
                 t.includes('search') || t.includes('list');
        });
    });
    log(`Elementos relevantes: ${links.length}`);
    links.forEach((l, i) => log(`  [${i}] <${l.tag}> "${l.text}" ${l.href ? '→ ' + l.href : ''}`));

    // 3. Buscar link con el nombre exacto
    log(`Paso 3: Buscando "${SEARCH_NAME}"...`);
    const searchLink = await page.waitForSelector(
      `a:has-text("${SEARCH_NAME}"), td:has-text("${SEARCH_NAME}"), span:has-text("${SEARCH_NAME}")`,
      { timeout: 10000 }
    ).catch(() => null);

    if (!searchLink) {
      const ms = Date.now() - t0;
      log(`CAMINO C: ❌ | ${ms}ms | "${SEARCH_NAME}" no encontrado en listas`);
      log(`URL final: ${page.url()}`);
      log(`Título: ${await page.title()}`);
      log('FIN');
      return;
    }

    log(`Encontrado, haciendo click...`);
    await searchLink.click();

    // 4. Esperar perfiles
    log('Paso 4: Esperando SELECTOR_PERFILES (timeout: 15s)...');
    const perfil = await page.waitForSelector(SELECTOR_PERFILES, { timeout: 15000 }).catch(() => null);
    const ms = Date.now() - t0;

    if (!perfil) {
      const olCount = await page.locator('ol.artdeco-list').count();
      const ulCount = await page.locator('ul.artdeco-list').count();
      log(`CAMINO C: ❌ | ${ms}ms | 0 perfiles | ol=${olCount} ul=${ulCount}`);
      log(`URL final: ${page.url()}`);
      log(`Título: ${await page.title()}`);
      log('FIN');
      return;
    }

    await delay(500);
    const perfiles = await page.locator(SELECTOR_PERFILES).count();
    log(`CAMINO C: ✅ | ${ms}ms | ${perfiles} perfiles | URL: ${page.url()}`);
    log(`Título: ${await page.title()}`);
    log('FIN');

  } catch (err) {
    log(`ERROR: ${err.message}`);
  } finally {
    if (context) await context.close();
  }
})();
