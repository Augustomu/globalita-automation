// ================================================================
// test-f1-camino-b.js — F1: Dropdown/nav header de búsquedas
//
// CAMINO B (93%): goto sales/search/people → auditar nav/header →
//   buscar "Gerente, RJ MG ES BH" en dropdowns → click →
//   waitForSelector(SELECTOR_PERFILES)
//
// Cuenta: francisco | Sesión: "francisco agente invitaciones"
// NO envía invitaciones — solo navega y detecta.
//
// Uso:
//   node tests/test-f1-camino-b.js
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
  log('CAMINO B — F1 Dropdown/nav header — inicio');
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

    // 1. Navegar a la página de búsqueda
    log('Paso 1: goto sales/search/people');
    await page.goto('https://www.linkedin.com/sales/search/people', {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    await delay(2000);
    await cerrarBanners(page);
    log(`Página cargada: ${page.url()}`);
    log(`Título: ${await page.title()}`);

    // 2. Auditoría: loguear todos los textos en nav/header
    log('Paso 2: Auditando nav/header...');
    const navTexts = await page.evaluate(() => {
      const results = [];
      // Buscar en nav, header, y elementos con role
      const selectors = ['nav a', 'nav button', 'nav span', 'header a', 'header button',
        '[role="navigation"] a', '[role="navigation"] button',
        '[class*="search"] a', '[class*="search"] button', '[class*="search"] span',
        '[class*="nav"] a', '[class*="nav"] button',
        '[class*="header"] a', '[class*="header"] button'];
      const seen = new Set();
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (seen.has(el)) return;
          seen.add(el);
          const text = el.textContent.trim().substring(0, 100);
          if (text && el.offsetParent !== null) {
            results.push({ tag: el.tagName, text, href: el.href || '' });
          }
        });
      });
      return results;
    });
    log(`Nav/header: ${navTexts.length} elementos encontrados`);
    navTexts.forEach((t, i) => log(`  [${i}] <${t.tag}> "${t.text}" ${t.href ? '→ ' + t.href : ''}`));

    // 3. Buscar "Gerente" o "saved" o "search" clickeable
    log('Paso 3: Buscando elementos con "Gerente", "saved", "search"...');

    // Intentar clickear dropdowns que podrían contener búsquedas
    const dropdownBtns = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, [role="button"], [class*="dropdown"]'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({
          text: el.textContent.trim().substring(0, 80),
          ariaLabel: el.getAttribute('aria-label') || '',
          className: el.className.substring(0, 100)
        }))
        .filter(el => {
          const t = (el.text + el.ariaLabel).toLowerCase();
          return t.includes('search') || t.includes('saved') || t.includes('recent') ||
                 t.includes('busq') || t.includes('pesq') || t.includes('reciente');
        });
    });
    log(`Botones relevantes: ${dropdownBtns.length}`);
    dropdownBtns.forEach((b, i) => log(`  [${i}] "${b.text}" aria="${b.ariaLabel}"`));

    // Intentar cada botón relevante para abrir dropdown y buscar el nombre
    let found = false;
    for (let i = 0; i < dropdownBtns.length && !found; i++) {
      const btnText = dropdownBtns[i].text || dropdownBtns[i].ariaLabel;
      log(`Intentando click en botón [${i}]: "${btnText}"`);
      const btn = page.locator(`button:has-text("${btnText.substring(0, 30)}"), [role="button"]:has-text("${btnText.substring(0, 30)}")`).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await delay(1000);

        // Buscar el nombre de la búsqueda en lo que se abrió
        const link = await page.waitForSelector(
          `a:has-text("${SEARCH_NAME}"), span:has-text("${SEARCH_NAME}"), li:has-text("${SEARCH_NAME}")`,
          { timeout: 3000 }
        ).catch(() => null);

        if (link) {
          log(`¡Encontrado "${SEARCH_NAME}" en dropdown de "${btnText}"!`);
          await link.click();
          found = true;
        } else {
          log(`No encontrado en dropdown de "${btnText}"`);
          // Cerrar dropdown haciendo click afuera
          await page.mouse.click(10, 10);
          await delay(500);
        }
      }
    }

    // Si no encontramos en dropdowns, buscar directamente en la página
    if (!found) {
      log('Buscando directamente en la página...');
      const directLink = await page.waitForSelector(
        `a:has-text("${SEARCH_NAME}"), [role="link"]:has-text("${SEARCH_NAME}")`,
        { timeout: 5000 }
      ).catch(() => null);

      if (directLink) {
        log('Encontrado como link directo');
        await directLink.click();
        found = true;
      }
    }

    if (!found) {
      const ms = Date.now() - t0;
      log(`CAMINO B: ❌ | "${SEARCH_NAME}" no encontrado en nav/dropdowns | ${ms}ms`);
      log(`URL final: ${page.url()}`);
      log(`Título: ${await page.title()}`);
      log('FIN');
      return;
    }

    // 4. Esperar perfiles
    log('Paso 4: Esperando SELECTOR_PERFILES (timeout: 15s)...');
    const perfil = await page.waitForSelector(SELECTOR_PERFILES, { timeout: 15000 }).catch(() => null);
    const ms = Date.now() - t0;

    if (!perfil) {
      log(`CAMINO B: ❌ | elemento encontrado + clickeado pero sin perfiles | ${ms}ms`);
      log(`URL final: ${page.url()}`);
      log(`Título: ${await page.title()}`);
      log('FIN');
      return;
    }

    await delay(500);
    const perfiles = await page.locator(SELECTOR_PERFILES).count();
    log(`CAMINO B: ✅ | ${ms}ms | ${perfiles} perfiles`);
    log(`URL final: ${page.url()}`);
    log(`Título: ${await page.title()}`);
    log('FIN');

  } catch (err) {
    log(`ERROR: ${err.message}`);
  } finally {
    if (context) await context.close();
  }
})();
