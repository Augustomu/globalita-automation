/**
 * test-fix-f4.js — TEST QUIRÚRGICO: Fix F4 moreBtn + normalizarUrl
 *
 * QUÉ TESTEA:
 *   PASO 1 — ¿El botón ··· se encuentra con el nuevo selector?
 *            (aria-label "exceso de acciones" primero)
 *   PASO 2 — ¿El dropdown abre y tiene opción "Conectar"?
 *            (coords y<700 — mismo patrón que F6)
 *   PASO 3 — ¿normalizarUrl extrae el mismo ID en dos URLs distintas?
 *            (dedup cross-ronda — sin tocar el browser)
 *
 * MODO SEGURO: ENVIAR_REAL = false → nunca clickea "Enviar invitación"
 *              Llega hasta el modal y loggea lo que ve, nada más.
 *
 * Uso:
 *   node test-fix-f4.js
 *
 * Cuenta: alejandro (session/)
 * Lista:  Angel investor, Estados Unidos (savedSearchId=1953289169)
 * Perfiles objetivo: los primeros 5 candidatos de la lista
 *                    (incluye Christopher Rojas / Fletcher Richman si están en p1)
 */

'use strict';

const { chromium } = require('playwright');
const path         = require('path');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const SESSION_DIR  = path.resolve(__dirname, 'session');
const SEARCH_URL   = 'https://www.linkedin.com/sales/search/people?savedSearchId=1953289169';
const MAX_PERFILES = 5;     // testa los primeros N candidatos de la lista
const ENVIAR_REAL  = false; // NUNCA cambiar a true en este script

const SELECTOR_PERFILES =
  'ol li:has(a[href*="/sales/lead/"]), ol li:has(a[href*="/sales/people/"]), ' +
  'ul li:has(a[href*="/sales/lead/"]), ul li:has(a[href*="/sales/people/"])';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function cerrarBanners(page) {
  await page.evaluate(() => {
    ['[data-test-global-alert-dismiss]','[aria-label="Dismiss"]','[aria-label="Cerrar"]',
     '[aria-label="Fechar"]','.artdeco-global-alert__dismiss','.global-alert-banner__dismiss']
      .forEach(s => document.querySelectorAll(s)
        .forEach(b => { try { b.click(); } catch(_){} }));
  }).catch(() => {});
}

// ─── PASO 3: TEST PURO DE normalizarUrl (sin browser) ────────────────────────

function normalizarUrl(href) {
  if (!href) return '';
  const leadMatch = href.match(/\/sales\/(?:lead|people)\/([A-Za-z0-9_-]+)/);
  if (leadMatch) return leadMatch[1];
  const inMatch = href.match(/\/in\/([^/?#,]+)/);
  if (inMatch) return '/in/' + inMatch[1];
  return href.split('?')[0].split(',')[0];
}

function testNormalizarUrl() {
  log('══════════════════════════════════════════════');
  log('PASO 3 — TEST normalizarUrl (sin browser)');
  log('══════════════════════════════════════════════');

  const casos = [
    // Mismo perfil, URLs distintas que aparecen en distintas rondas de scroll
    {
      a: '/sales/lead/ACwAABQdlTsBHxyz123,NAME_SLUG,SALES_NAV_CONTEXT?trk=...',
      b: '/sales/lead/ACwAABQdlTsBHxyz123?query=savedSearch&param2=foo',
      debenIgualarse: true,
      desc: 'mismo ID, query params distintos'
    },
    {
      a: '/sales/lead/ACwAABQdlTsBHxyz123,DIFERENTE_SLUG?trk=abc',
      b: '/sales/lead/ACwAABQdlTsBHxyz123,OTRO_SLUG?trk=xyz',
      debenIgualarse: true,
      desc: 'mismo ID, slugs distintos'
    },
    {
      a: '/sales/lead/ACwAABQdlTsBHxyz123',
      b: '/sales/lead/ACwAABQdlTsB_DIFERENTE',
      debenIgualarse: false,
      desc: 'IDs distintos — NO deben ser iguales'
    },
    {
      a: '/sales/people/ACwAABQdlTsBHxyz123?param=x',
      b: '/sales/lead/ACwAABQdlTsBHxyz123?param=y',
      debenIgualarse: true,
      desc: 'people vs lead — mismo ID'
    },
    {
      a: 'https://www.linkedin.com/in/christopher-rojas-7b5a8/',
      b: 'https://www.linkedin.com/in/christopher-rojas-7b5a8?miniProfileUrn=...',
      debenIgualarse: true,
      desc: 'URL /in/ con y sin query params'
    },
  ];

  let pasados = 0;
  for (const c of casos) {
    const keyA  = normalizarUrl(c.a);
    const keyB  = normalizarUrl(c.b);
    const igual = keyA === keyB;
    const ok    = igual === c.debenIgualarse;
    pasados += ok ? 1 : 0;
    const icono = ok ? '✅' : '❌';
    log(`  ${icono} ${c.desc}`);
    log(`     A → "${keyA}"`);
    log(`     B → "${keyB}"`);
    if (!ok) log(`     FALLO: esperaba ${c.debenIgualarse ? 'iguales' : 'distintos'}, obtuvo ${igual ? 'iguales' : 'distintos'}`);
  }

  log(`\n  Resultado: ${pasados}/${casos.length} casos correctos`);
  return pasados === casos.length;
}

// ─── PASO 1 + 2: TEST F4 moreBtn en lista de Sales Nav ───────────────────────

async function testF4EnLista(page) {
  log('══════════════════════════════════════════════');
  log('PASO 1+2 — Abriendo lista Sales Nav');
  log('══════════════════════════════════════════════');

  // F1: abrir búsqueda
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector(SELECTOR_PERFILES, { timeout: 15000 }).catch(() => {});
  await delay(1000);
  await cerrarBanners(page);
  log(`URL actual: ${page.url()}`);

  const items = await page.locator(SELECTOR_PERFILES).all();
  log(`Perfiles visibles: ${items.length}`);

  if (items.length === 0) {
    log('❌ FALLO: No se encontraron perfiles en la lista');
    return;
  }

  const resultados = [];
  let procesados = 0;

  for (const item of items) {
    if (procesados >= MAX_PERFILES) break;

    // Obtener nombre
    const nombre = await item.locator('[data-anonymize="person-name"]').first()
      .innerText().catch(() => 'desconocido');

    // Verificar estado (skip saved/pending igual que F3)
    const texto = await item.innerText().catch(() => '');
    const t = texto.toLowerCase();
    if (t.includes('saved') || t.includes('guardado') || t.includes('salvo') ||
        t.includes('pending') || t.includes('pendiente') || t.includes('pendente')) {
      log(`  → ${nombre} — SKIP (saved/pending)`);
      continue;
    }

    procesados++;
    log('');
    log(`──────────────────────────────────────────`);
    log(`Perfil ${procesados}: ${nombre}`);
    log(`──────────────────────────────────────────`);

    // ── PASO 1: ¿Hay botón Conectar directo (M9)? ────────────────────────
    await item.scrollIntoViewIfNeeded().catch(() => {});
    await delay(400);

    const conectarDirectoBbox = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button')).filter(b => {
        const t = (b.innerText || b.textContent || '').trim();
        const r = b.getBoundingClientRect();
        return (t === 'Conectar' || t === 'Connect' || t === 'Ligar') &&
               r.width > 0 && r.y > 100 && r.y < 500;
      });
      if (btns.length === 0) return null;
      const r = btns[0].getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });

    if (conectarDirectoBbox) {
      log(`  ✅ PASO 1 — M9: Conectar directo en y=${Math.round(conectarDirectoBbox.y)}`);
      resultados.push({ nombre, paso1: 'M9-directo', paso2: 'N/A (directo)', ok: true });

      if (!ENVIAR_REAL) {
        log(`  → ENVIAR_REAL=false — no se hace click`);
        continue;
      }
      // Si ENVIAR_REAL=true haría el click — bloqueado por seguridad en este test
      continue;
    }

    // ── PASO 2: ¿Se encuentra el botón ···? ──────────────────────────────
    log(`  → M9 no encontró Conectar directo — probando botón ···`);

    // Diagnóstico: todos los aria-labels del card
    const ariaLabels = await item.evaluate(el =>
      Array.from(el.querySelectorAll('button[aria-label]'))
        .map(b => b.getAttribute('aria-label')).filter(Boolean)
    ).catch(() => []);
    log(`  [diag] aria-labels del card: ${JSON.stringify(ariaLabels)}`);

    // Selector con FIX BUG1 — "exceso de acciones" primero
    const moreBtn = item.locator('button[aria-label*="exceso de acciones"]')
      .or(item.locator('button[aria-label*="excess actions"]'))
      .or(item.locator('button[aria-label*="excesso de ações"]'))
      .or(item.locator('button[aria-label*="More actions"]'))
      .or(item.locator('button[aria-label*="más acciones"]'))
      .or(item.locator('button[aria-label*="ações"]'))
      .or(item.locator('button[aria-label*="More options"]'))
      .or(item.locator('button[aria-label*="More"]'))
      .first();

    const moreBtnVisible = await moreBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!moreBtnVisible) {
      log(`  ❌ PASO 1+2 — Ni Conectar directo ni ··· encontrado`);
      log(`  [diag] aria-labels vistos: ${JSON.stringify(ariaLabels)}`);
      resultados.push({ nombre, paso1: 'FALLO-sin-boton', paso2: 'FALLO', ok: false });
      continue;
    }

    log(`  ✅ PASO 1 — Botón ··· encontrado`);

    // Click en ··· y verificar dropdown
    await moreBtn.click();
    await delay(900);

    // ── PASO 2: ¿El dropdown tiene Conectar? ─────────────────────────────
    const cBbox = await page.evaluate(() => {
      // Primero buscar en artdeco dropdown
      const d1 = document.querySelector('.artdeco-dropdown__content');
      if (d1) {
        const r1 = d1.getBoundingClientRect();
        if (r1.width > 0 && r1.height > 0 && r1.y > 0) {
          const el = Array.from(d1.querySelectorAll('*')).find(e => {
            const t = (e.innerText || '').trim(), ry = e.getBoundingClientRect().y;
            return (t === 'Conectar' || t === 'Connect' || t === 'Conectar-se') &&
                   e.getBoundingClientRect().width > 0 && ry > 50 && ry < 700;
          });
          if (el) {
            const rc = el.getBoundingClientRect();
            return { via: 'artdeco', x: rc.x, y: rc.y, w: rc.width, h: rc.height };
          }
        }
      }
      // Fallback: cualquier ul visible
      for (const ul of Array.from(document.querySelectorAll('ul'))) {
        const r = ul.getBoundingClientRect();
        if (r.width < 50 || r.y < 50 || r.y > 700) continue;
        const el = Array.from(ul.querySelectorAll('*')).find(e => {
          const t = (e.innerText || '').trim(), ry = e.getBoundingClientRect().y;
          return (t === 'Conectar' || t === 'Connect' || t === 'Conectar-se') &&
                 e.getBoundingClientRect().width > 0 && ry > 50 && ry < 700;
        });
        if (el) {
          const rc = el.getBoundingClientRect();
          return { via: 'ul-fallback', x: rc.x, y: rc.y, w: rc.width, h: rc.height };
        }
      }
      // Diagnóstico: qué hay en el dropdown
      const opciones = [];
      document.querySelectorAll('.artdeco-dropdown__content li, [role="menuitem"]').forEach(e => {
        const t = (e.innerText || e.textContent || '').trim();
        if (t && t.length < 60) opciones.push(t);
      });
      return { via: null, opciones };
    });

    if (!cBbox || !cBbox.via) {
      log(`  ❌ PASO 2 — Dropdown abrió pero no tiene Conectar`);
      log(`  [diag] opciones dropdown: ${JSON.stringify(cBbox?.opciones || [])}`);
      resultados.push({ nombre, paso1: '✓-boton-encontrado', paso2: 'FALLO-sin-conectar', ok: false });
      await page.keyboard.press('Escape').catch(() => {});
      await delay(400);
      continue;
    }

    log(`  ✅ PASO 2 — Conectar en dropdown via=${cBbox.via} y=${Math.round(cBbox.y)}`);

    if (!ENVIAR_REAL) {
      log(`  → ENVIAR_REAL=false — cierra dropdown sin clickear`);
      await page.keyboard.press('Escape').catch(() => {});
      await delay(400);
      resultados.push({ nombre, paso1: '✓-boton-encontrado', paso2: '✓-conectar-visible', ok: true });
    }
    // Si ENVIAR_REAL=true haría el click en Conectar y abriría el modal
  }

  return resultados;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  log('════════════════════════════════════════════════════════');
  log('test-fix-f4.js — TEST QUIRÚRGICO F4 + normalizarUrl');
  log('ENVIAR_REAL = ' + ENVIAR_REAL + ' → modo diagnóstico seguro');
  log('════════════════════════════════════════════════════════');
  log('');

  // PASO 3: test puro sin browser
  const paso3ok = testNormalizarUrl();
  log('');

  // PASO 1+2: con browser
  let browser;
  let resultados = [];
  try {
    browser = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      viewport: { width: 1280, height: 860 },
    });
    const page = await browser.newPage();
    resultados = await testF4EnLista(page);
  } catch (err) {
    log(`ERROR INESPERADO: ${err.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // ── RESUMEN FINAL ──────────────────────────────────────────────
  log('');
  log('════════════════════════════════════════════════════════');
  log('RESUMEN FINAL');
  log('════════════════════════════════════════════════════════');
  log(`PASO 3 — normalizarUrl: ${paso3ok ? '✅ TODOS CORRECTOS' : '❌ HAY FALLOS'}`);
  log('');

  if (resultados && resultados.length > 0) {
    const ok    = resultados.filter(r => r.ok).length;
    const total = resultados.length;
    log(`PASO 1+2 — F4 moreBtn: ${ok}/${total} perfiles OK`);
    for (const r of resultados) {
      const icono = r.ok ? '✅' : '❌';
      log(`  ${icono} ${r.nombre} | paso1: ${r.paso1} | paso2: ${r.paso2}`);
    }
    log('');
    if (ok === total && paso3ok) {
      log('🟢 TODO LISTO — puedes correr: node invitar-agent.js alejandro');
    } else if (ok > 0) {
      log('🟡 PARCIAL — revisa los perfiles con ❌ arriba antes de producción');
    } else {
      log('🔴 FALLO — revisar aria-labels en [diag] de arriba y ajustar selector');
    }
  }
  log('════════════════════════════════════════════════════════');
}

main().catch(err => {
  log(`CRASH: ${err.message}`);
  process.exit(1);
});
