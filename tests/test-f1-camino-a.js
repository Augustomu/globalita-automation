// ================================================================
// test-f1-camino-a.js — F1: Navegar por Saved Searches panel
//
// Fix: delay(3000) después del click en "Búsquedas guardadas" para
// que el panel renderice, luego buscar botón "Ver" asociado a
// "Gerente, RJ MG ES BH".
//
// Cuenta: francisco | NO envía invitaciones.
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
  log('CAMINO A v2 — F1 Saved Searches + botón Ver — inicio');
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

    // 2. Buscar y clickear botón "Búsquedas guardadas"
    log('Paso 2: Buscando botón "Búsquedas guardadas"...');
    const savedBtn = await page.waitForSelector(
      'button:has-text("Saved searches"), button:has-text("Búsquedas guardadas"), button:has-text("Pesquisas salvas")',
      { timeout: 10000 }
    ).catch(() => null);

    if (!savedBtn) {
      const botones = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).slice(0, 30).map(b => ({
          text: b.textContent.trim().substring(0, 80),
          visible: b.offsetParent !== null
        })).filter(b => b.visible && b.text);
      });
      log('Botones visibles:');
      botones.forEach((b, i) => log(`  [${i}] "${b.text}"`));
      log('CAMINO A: ❌ | botón Búsquedas guardadas no encontrado');
      log(`URL final: ${page.url()}`);
      log('FIN');
      return;
    }

    log('Botón encontrado, haciendo click...');
    await savedBtn.click();
    await delay(3000); // ← crítico: el panel necesita tiempo para renderizar

    // 3. Auditoría completa del panel
    log('Paso 3: Auditoría completa del panel...');
    const panelAudit = await page.evaluate(() => {
      const results = [];
      // Todos los elementos visibles — botones, links, spans, divs
      const all = document.querySelectorAll('button, a, span, div, li, td');
      for (const el of all) {
        if (!el.offsetParent) continue;
        const text = el.textContent.trim();
        if (!text || text.length > 200) continue;
        // Filtrar por relevancia: contiene "erente", "onsultor", "Ver", "View", "saved"
        const tl = text.toLowerCase();
        if (tl.includes('erente') || tl.includes('onsultor') || tl.includes('ver') ||
            tl.includes('view') || tl.includes('saved') || tl.includes('guardad') ||
            tl.includes('angel') || tl.includes('seed') || tl.includes('family')) {
          results.push({
            tag: el.tagName,
            text: text.substring(0, 150),
            role: el.getAttribute('role') || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            className: el.className ? String(el.className).substring(0, 80) : '',
            parentText: el.parentElement ? el.parentElement.textContent.trim().substring(0, 150) : ''
          });
        }
      }
      return results;
    });
    log(`Panel: ${panelAudit.length} elementos relevantes`);
    panelAudit.forEach((el, i) => {
      log(`  [${i}] <${el.tag}> "${el.text}" role="${el.role}" aria="${el.ariaLabel}"`);
      if (el.parentText !== el.text) log(`        parent: "${el.parentText}"`);
    });

    // 4. Estrategia A: buscar botón "Ver" con contexto "Gerente"
    log('Paso 4a: Buscando botón "Ver" con contexto "Gerente"...');
    let clicked = false;

    // Intentar getByRole con filter
    try {
      const verBtns = page.getByRole('button', { name: /^Ver$/i });
      const count = await verBtns.count();
      log(`Botones "Ver" encontrados: ${count}`);

      for (let i = 0; i < count; i++) {
        const btn = verBtns.nth(i);
        // Revisar si el contexto padre contiene "Gerente"
        const parentText = await btn.evaluate(el => {
          // Subir hasta 5 niveles buscando el texto de contexto
          let node = el.parentElement;
          for (let j = 0; j < 5 && node; j++) {
            const t = node.textContent || '';
            if (t.includes('Gerente')) return t.trim().substring(0, 150);
            node = node.parentElement;
          }
          return '';
        });
        log(`  Ver [${i}] → parent: "${parentText}"`);
        if (parentText.includes('Gerente')) {
          log(`  ✓ Click en Ver [${i}] (contexto Gerente)`);
          await btn.click();
          clicked = true;
          break;
        }
      }
    } catch (e) {
      log(`  getByRole falló: ${e.message}`);
    }

    // 4b: Si no hay botón "Ver", buscar todos los buttons "Ver"/"View" y loguear padres
    if (!clicked) {
      log('Paso 4b: Buscando buttons "Ver"/"View" genéricos...');
      const verButtons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button, a'))
          .filter(el => el.offsetParent !== null)
          .filter(el => {
            const t = el.textContent.trim().toLowerCase();
            return t === 'ver' || t === 'view';
          })
          .map(el => ({
            text: el.textContent.trim(),
            parentText: el.parentElement ? el.parentElement.textContent.trim().substring(0, 150) : '',
            grandparentText: el.parentElement && el.parentElement.parentElement
              ? el.parentElement.parentElement.textContent.trim().substring(0, 200) : ''
          }));
      });
      log(`Buttons Ver/View: ${verButtons.length}`);
      verButtons.forEach((v, i) => {
        log(`  [${i}] "${v.text}" parent="${v.parentText}"`);
        log(`         grandparent="${v.grandparentText}"`);
      });

      // Click en el que tenga "Gerente" en el contexto
      for (let i = 0; i < verButtons.length && !clicked; i++) {
        if (verButtons[i].parentText.includes('Gerente') || verButtons[i].grandparentText.includes('Gerente')) {
          log(`  ✓ Click en Ver/View [${i}]`);
          const allVer = page.locator('button:has-text("Ver"), a:has-text("Ver"), button:has-text("View"), a:has-text("View")');
          await allVer.nth(i).click();
          clicked = true;
        }
      }
    }

    // 4c: fallback — click directo en cualquier elemento que contenga el nombre exacto
    if (!clicked) {
      log('Paso 4c: Fallback — click directo en elemento con nombre exacto...');
      const directEl = await page.waitForSelector(
        `a:has-text("${SEARCH_NAME}"), span:has-text("${SEARCH_NAME}"), button:has-text("${SEARCH_NAME}"), div:has-text("${SEARCH_NAME}")`,
        { timeout: 5000 }
      ).catch(() => null);

      if (directEl) {
        log('Encontrado elemento con nombre exacto, haciendo click...');
        await directEl.click();
        clicked = true;
      }
    }

    if (!clicked) {
      const ms = Date.now() - t0;
      log(`CAMINO A: ❌ | ${ms}ms | no se pudo hacer click en la búsqueda`);
      log(`URL final: ${page.url()}`);
      log('FIN');
      return;
    }

    // 5. Esperar perfiles
    log('Paso 5: Esperando SELECTOR_PERFILES (timeout: 15s)...');
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
