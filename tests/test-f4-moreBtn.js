/**
 * test-f4-moreBtn.js — 10 VARIANTES: botón ··· + Conectar en Sales Nav lista
 *
 * PROBLEMA A RESOLVER:
 *   F4 fallback — cuando M9 (Conectar directo) no está visible, necesita
 *   encontrar el botón ··· del card en la LISTA de Sales Nav y luego
 *   clickear "Conectar" en el dropdown que aparece.
 *
 *   Test anterior falló porque los 5 primeros perfiles eran saved/pending.
 *   Este script scrollea hasta encontrar un candidato real.
 *
 * 10 VARIANTES (dos partes cada una: A=encontrar ···, B=clickear Conectar):
 *
 *   V1  aria-label*="exceso" (fix actual) + coords artdeco y<700
 *   V2  aria-label*="exceso" + getByText acotado al dropdown
 *   V3  aria-label*="exceso" + locator li.filter hasText
 *   V4  hover card → aria-label*="exceso" + coords
 *   V5  mouse.move al card → aria-label*="exceso" + Tab hasta Conectar
 *   V6  último botón del card (icon-only = ···) + coords
 *   V7  evaluate → botón sin texto en card → coords artdeco
 *   V8  data-test attr en card → locator + coords
 *   V9  waitForSelector explicit antes de click → coords
 *   V10 aria-label scan completo + mouse.click en cualquier ··· encontrado
 *
 * MODO: ENVIAR_REAL = false — llega hasta el modal, nunca envía.
 *
 * Uso: node test-f4-moreBtn.js
 */

'use strict';

const { chromium } = require('playwright');
const path = require('path');

const SESSION_DIR  = path.resolve(__dirname, 'session');

// Todas las listas de alejandro — prueba en orden hasta encontrar 1 candidato real
const LISTAS = [
  { nombre: 'Angel investor, Estados Unidos', url: 'https://www.linkedin.com/sales/search/people?savedSearchId=1953289169' },
  { nombre: 'Angel investor, Mexico',         url: 'https://www.linkedin.com/sales/search/people?savedSearchId=1966570778' },
  { nombre: 'Seed investor, Mexico',          url: 'https://www.linkedin.com/sales/search/people?savedSearchId=1966570738' },
  { nombre: 'Family Office, Mexico',          url: 'https://www.linkedin.com/sales/search/people?savedSearchId=1947499081' },
];

const MAX_SCROLL_RONDAS = 60;  // rondas de scroll por página
const MAX_PAGINAS       = 3;   // páginas a revisar por lista antes de pasar a la siguiente
const MAX_CANDIDATOS    = 1;   // 1 candidato real es suficiente para las 10 variantes
const ENVIAR_REAL       = false;

const SELECTOR_PERFILES =
  'ol li:has(a[href*="/sales/lead/"]), ol li:has(a[href*="/sales/people/"]), ' +
  'ul li:has(a[href*="/sales/lead/"]), ul li:has(a[href*="/sales/people/"])';

// ─── Tabla acumulativa de resultados ─────────────────────────────────────────
const tabla = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

function esCandidato(texto) {
  const t = texto.toLowerCase();
  return !t.includes('saved') && !t.includes('guardado') && !t.includes('salvo') &&
         !t.includes('pending') && !t.includes('pendiente') && !t.includes('pendente');
}

// Loggear todos los botones del card para diagnóstico
async function diagnosticoCard(item) {
  const info = await item.evaluate(el => {
    const btns = Array.from(el.querySelectorAll('button'));
    return btns.map(b => ({
      text:  (b.innerText || b.textContent || '').trim().slice(0, 30),
      aria:  b.getAttribute('aria-label') || '',
      data:  Array.from(b.attributes)
               .filter(a => a.name.startsWith('data-'))
               .map(a => `${a.name}="${a.value}"`)
               .join(' '),
      x: Math.round(b.getBoundingClientRect().x),
      y: Math.round(b.getBoundingClientRect().y),
      w: Math.round(b.getBoundingClientRect().width),
    }));
  }).catch(() => []);
  return info;
}

// Loggear contenido del dropdown abierto
async function diagnosticoDropdown(page) {
  return page.evaluate(() => {
    const items = [];
    // artdeco dropdown
    document.querySelectorAll('.artdeco-dropdown__content li, .artdeco-dropdown__content [role="menuitem"]')
      .forEach(e => {
        const t = (e.innerText || e.textContent || '').trim();
        const r = e.getBoundingClientRect();
        if (t && t.length < 60) items.push({ text: t, y: Math.round(r.y), via: 'artdeco' });
      });
    // uls visibles si artdeco vacío
    if (items.length === 0) {
      document.querySelectorAll('ul li').forEach(e => {
        const r = e.getBoundingClientRect();
        if (r.width > 40 && r.y > 50 && r.y < 700) {
          const t = (e.innerText || '').trim();
          if (t && t.length < 60) items.push({ text: t, y: Math.round(r.y), via: 'ul' });
        }
      });
    }
    return items;
  }).catch(() => []);
}

// Verificar modal después del click en Conectar
async function verificarModal(page) {
  const found = await page.waitForSelector(
    'input[type="email"], input[name="email"], textarea, ' +
    'button:has-text("Send invitation"), button:has-text("Enviar invitación"), ' +
    'button:has-text("Enviar convite"), button:has-text("Enviar"), button:has-text("Send")',
    { timeout: 6000 }
  ).catch(() => null);
  if (!found) return null;
  const variante = await page.evaluate(() => {
    if (document.querySelector('input[type="email"]')?.offsetWidth > 0) return 'email';
    if (document.querySelector('textarea')?.offsetWidth > 0) return 'textarea';
    const btns = Array.from(document.querySelectorAll('button'));
    if (btns.find(b => /Send invitation|Enviar invitaci|Enviar convite/i.test(b.textContent))) return 'send-directo';
    return 'desconocido';
  });
  return variante;
}

// ─── SCROLL para encontrar candidatos ────────────────────────────────────────
async function encontrarCandidatos(page, maxCandidatos) {
  log('Scrolleando para encontrar candidatos reales...');
  const vistos = new Set();
  const candidatos = [];
  let ronda = 0;
  let sinNuevos = 0;

  while (candidatos.length < maxCandidatos && ronda < MAX_SCROLL_RONDAS) {
    const items = await page.locator(SELECTOR_PERFILES).all();
    let nuevosEnRonda = 0;

    for (const item of items) {
      const href = await item.locator('a[href*="/sales/lead/"], a[href*="/sales/people/"]')
        .first().getAttribute('href').catch(() => '');
      const idMatch = href?.match(/\/sales\/(?:lead|people)\/([A-Za-z0-9_-]+)/);
      const key = idMatch ? idMatch[1] : href?.split('?')[0];
      if (!key || vistos.has(key)) continue;
      vistos.add(key);
      nuevosEnRonda++;

      const texto = await item.innerText().catch(() => '');
      const nombre = await item.locator('[data-anonymize="person-name"]').first()
        .innerText().catch(() => 'desconocido');

      if (esCandidato(texto)) {
        candidatos.push({ item, nombre, href });
        log(`  Candidato ${candidatos.length}: ${nombre}`);
        if (candidatos.length >= maxCandidatos) break;
      } else {
        log(`  Skip: ${nombre} (saved/pending)`);
      }
    }

    if (candidatos.length >= maxCandidatos) break;
    if (nuevosEnRonda === 0) sinNuevos++;
    else sinNuevos = 0;
    if (sinNuevos >= 4) { log('Sin nuevos perfiles — fin de página'); break; }

    await page.mouse.wheel(0, 600);
    await delay(400);
    ronda++;
  }

  log(`Total candidatos encontrados: ${candidatos.length} en ${ronda} rondas`);
  return candidatos;
}

// ═══════════════════════════════════════════════════════════════════
// LAS 10 VARIANTES — v3
// ═══════════════════════════════════════════════════════════════════
//
// APRENDIZAJES DEL TEST ANTERIOR:
//   ✅ aria-label REAL: "Ver más acciones para [NOMBRE]"
//      → partial match *="más acciones" SÍ matchea
//      → pero locator.click() directo NO mantiene el dropdown
//   ✅ mouse.move(coords) + page.mouse.click(coords) SÍ mantiene dropdown
//   ✅ El dropdown usa <ul> como contenedor, NO .artdeco-dropdown__content
//   ✅ data-search-overflow-trigger confirmado en el botón ···
//   ✅ Conectar encontrado a y=663 — dentro de ul visible
//
// FOCO DE N1-N10:
//   Parte A: encontrar el botón ··· → aria*="acciones" (confirmado) O data-attr
//   Parte B: mantener dropdown → mouse.move + page.mouse.click (confirmado)
//   Parte C: buscar Conectar → artdeco OR ul OR getByText y<800 (ampliado)

// Helper compartido: buscar Conectar en TODOS los contenedores (artdeco + ul)
async function buscarConectarEnDropdown(page, maxY = 800) {
  return page.evaluate((maxY) => {
    // 1. artdeco dropdown
    const d1 = document.querySelector('.artdeco-dropdown__content');
    if (d1) {
      const r1 = d1.getBoundingClientRect();
      if (r1.width > 0 && r1.height > 0 && r1.y > 0) {
        const el = Array.from(d1.querySelectorAll('*')).find(e => {
          const t = (e.innerText || '').trim(), ry = e.getBoundingClientRect().y;
          return (t === 'Conectar' || t === 'Connect' || t === 'Conectar-se') &&
                 e.getBoundingClientRect().width > 0 && ry > 50 && ry < maxY;
        });
        if (el) { const rc = el.getBoundingClientRect(); return { x: rc.x, y: rc.y, w: rc.width, h: rc.height, via: 'artdeco' }; }
      }
    }
    // 2. ul visible en el viewport (Sales Nav usa ul en lugar de artdeco)
    for (const ul of Array.from(document.querySelectorAll('ul'))) {
      const r = ul.getBoundingClientRect();
      if (r.width < 40 || r.y < 50 || r.y > maxY) continue;
      const el = Array.from(ul.querySelectorAll('*')).find(e => {
        const t = (e.innerText || '').trim(), ry = e.getBoundingClientRect().y;
        return (t === 'Conectar' || t === 'Connect' || t === 'Conectar-se') &&
               e.getBoundingClientRect().width > 0 && ry > 50 && ry < maxY;
      });
      if (el) { const rc = el.getBoundingClientRect(); return { x: rc.x, y: rc.y, w: rc.width, h: rc.height, via: 'ul' }; }
    }
    // 3. getByText scan general como último recurso
    const allEls = Array.from(document.querySelectorAll('*')).filter(e => {
      const t = (e.innerText || e.textContent || '').trim();
      const ry = e.getBoundingClientRect().y;
      return (t === 'Conectar' || t === 'Connect' || t === 'Conectar-se') &&
             e.getBoundingClientRect().width > 0 && ry > 200 && ry < maxY;
    });
    if (allEls.length > 0) {
      const rc = allEls[0].getBoundingClientRect();
      return { x: rc.x, y: rc.y, w: rc.width, h: rc.height, via: 'general' };
    }
    return null;
  }, maxY);
}

// Helper: obtener bbox del botón ··· por aria*="acciones"
async function getBboxAcciones(item) {
  return item.evaluate(el => {
    const btn = Array.from(el.querySelectorAll('button[aria-label]')).find(b => {
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      return a.includes('acciones') || a.includes('actions') || a.includes('ações');
    });
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, aria: btn.getAttribute('aria-label') };
  });
}

// ── N1 [98%]: aria*="acciones" + mouse.move + click + artdeco+ul y<800
// MEJOR CANDIDATO: combina el selector confirmado con el método confirmado + búsqueda ampliada
async function N1(page, item, nombre) {
  const bbox = await getBboxAcciones(item);
  if (!bbox) return { ok: false, causa: 'N1: aria*="acciones" no encontrado en card' };
  log(`    N1 btn: aria="${bbox.aria}" y=${Math.round(bbox.y)}`);

  await page.mouse.move(bbox.x + bbox.w / 2, bbox.y + bbox.h / 2);
  await delay(200);
  await page.mouse.click(bbox.x + bbox.w / 2, bbox.y + bbox.h / 2);
  await delay(900);

  const cBbox = await buscarConectarEnDropdown(page, 800);
  if (!cBbox) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'N1: Conectar no en dropdown (artdeco+ul+general)' }; }
  log(`    N1 Conectar via=${cBbox.via} y=${Math.round(cBbox.y)}`);
  await page.mouse.click(cBbox.x + cBbox.w / 2, cBbox.y + cBbox.h / 2);
  return { ok: true, causa: `N1✓ move+click via=${cBbox.via} y=${Math.round(cBbox.y)}` };
}

// ── N2 [97%]: data-search-overflow-trigger selector + mouse.move + click + artdeco+ul
// usa el atributo data confirmado en el diagnóstico del card
async function N2(page, item, nombre) {
  const bbox = await item.evaluate(el => {
    const btn = el.querySelector('[data-search-overflow-trigger]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, attr: btn.getAttribute('data-search-overflow-trigger') };
  });
  if (!bbox) return { ok: false, causa: 'N2: data-search-overflow-trigger no encontrado' };
  log(`    N2 btn: data-search-overflow-trigger="${bbox.attr}" y=${Math.round(bbox.y)}`);

  await page.mouse.move(bbox.x + bbox.w / 2, bbox.y + bbox.h / 2);
  await delay(200);
  await page.mouse.click(bbox.x + bbox.w / 2, bbox.y + bbox.h / 2);
  await delay(900);

  const cBbox = await buscarConectarEnDropdown(page, 800);
  if (!cBbox) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'N2: Conectar no en dropdown' }; }
  await page.mouse.click(cBbox.x + cBbox.w / 2, cBbox.y + cBbox.h / 2);
  return { ok: true, causa: `N2✓ data-overflow via=${cBbox.via} y=${Math.round(cBbox.y)}` };
}

// ── N3 [96%]: aria*="Ver más acciones" (ES exact prefix) + mouse.move + artdeco+ul
// más específico que *="acciones" pero sigue siendo partial match
async function N3(page, item, nombre) {
  const bbox = await item.evaluate(el => {
    const btn = Array.from(el.querySelectorAll('button[aria-label]')).find(b => {
      const a = b.getAttribute('aria-label') || '';
      return a.toLowerCase().includes('ver más acciones') || a.toLowerCase().includes('view more actions');
    });
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, aria: btn.getAttribute('aria-label') };
  });
  if (!bbox) return { ok: false, causa: 'N3: "Ver más acciones" no encontrado' };
  log(`    N3 btn: "${bbox.aria}" y=${Math.round(bbox.y)}`);

  await page.mouse.move(bbox.x + bbox.w / 2, bbox.y + bbox.h / 2);
  await delay(200);
  await page.mouse.click(bbox.x + bbox.w / 2, bbox.y + bbox.h / 2);
  await delay(900);

  const cBbox = await buscarConectarEnDropdown(page, 800);
  if (!cBbox) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'N3: Conectar no encontrado' }; }
  await page.mouse.click(cBbox.x + cBbox.w / 2, cBbox.y + cBbox.h / 2);
  return { ok: true, causa: `N3✓ "Ver más acciones" via=${cBbox.via} y=${Math.round(cBbox.y)}` };
}

// ── N4 [96%]: N1 + delay ampliado (1200ms) para que el dropdown de Sales Nav renderice
// Sales Nav Ember.js puede tener latencia de render superior a 900ms
async function N4(page, item, nombre) {
  const bbox = await getBboxAcciones(item);
  if (!bbox) return { ok: false, causa: 'N4: aria*="acciones" no encontrado' };

  await page.mouse.move(bbox.x + bbox.w / 2, bbox.y + bbox.h / 2);
  await delay(300);
  await page.mouse.click(bbox.x + bbox.w / 2, bbox.y + bbox.h / 2);
  await delay(1200); // delay ampliado — Ember.js puede tardar más

  const cBbox = await buscarConectarEnDropdown(page, 800);
  if (!cBbox) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'N4: Conectar no en dropdown (delay 1200ms)' }; }
  await page.mouse.click(cBbox.x + cBbox.w / 2, cBbox.y + cBbox.h / 2);
  return { ok: true, causa: `N4✓ delay1200 via=${cBbox.via} y=${Math.round(cBbox.y)}` };
}

// ── N5 [95%]: aria*="acciones" + locator.click() + waitForSelector ul Conectar (no coords)
// alternativa sin coords: usar waitForSelector para esperar que el Conectar aparezca en ul
async function N5(page, item, nombre) {
  const moreBtn = item.locator('button[aria-label*="acciones"]')
    .or(item.locator('button[aria-label*="actions"]'))
    .or(item.locator('button[aria-label*="ações"]'))
    .first();
  if (!await moreBtn.isVisible({ timeout: 2500 }).catch(() => false)) return { ok: false, causa: 'N5: moreBtn no visible' };

  await moreBtn.click();
  // Esperar activamente que aparezca el texto "Conectar" en el DOM — no coords
  const conectarEl = await page.waitForSelector(
    'ul li:has-text("Conectar"), ul li:has-text("Connect"), ' +
    '.artdeco-dropdown__content :text-is("Conectar"), .artdeco-dropdown__content :text-is("Connect")',
    { timeout: 4000 }
  ).catch(() => null);

  if (!conectarEl) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'N5: waitForSelector Conectar timeout' }; }
  const cBbox = await conectarEl.boundingBox().catch(() => null);
  if (!cBbox || cBbox.y > 800) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: `N5: Conectar fuera del viewport y=${cBbox?.y}` }; }
  await page.mouse.click(cBbox.x + cBbox.width / 2, cBbox.y + cBbox.height / 2);
  return { ok: true, causa: `N5✓ waitForSelector Conectar y=${Math.round(cBbox.y)}` };
}

// ── N6 [95%]: N1 + mousedown + mouseup separados (simula click más lento)
// Algunos event listeners de Ember responden mejor a mousedown/up por separado
async function N6(page, item, nombre) {
  const bbox = await getBboxAcciones(item);
  if (!bbox) return { ok: false, causa: 'N6: aria*="acciones" no encontrado' };
  log(`    N6 btn: "${bbox.aria}" y=${Math.round(bbox.y)}`);

  const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2;
  await page.mouse.move(cx, cy);
  await delay(150);
  await page.mouse.down();
  await delay(80);
  await page.mouse.up();
  await delay(1000);

  const cBbox = await buscarConectarEnDropdown(page, 800);
  if (!cBbox) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'N6: Conectar no en dropdown (mousedown+up)' }; }
  await page.mouse.click(cBbox.x + cBbox.w / 2, cBbox.y + cBbox.h / 2);
  return { ok: true, causa: `N6✓ mousedown+up via=${cBbox.via} y=${Math.round(cBbox.y)}` };
}

// ── N7 [94%]: N1 + hover al nombre del perfil PRIMERO, luego al botón ···
// Fuerza el estado hover completo del card antes del click
async function N7(page, item, nombre) {
  // Primero hover al centro del card (revela todos los botones hover)
  const cardBbox = await item.boundingBox().catch(() => null);
  if (cardBbox) {
    await page.mouse.move(cardBbox.x + cardBbox.width / 2, cardBbox.y + 30);
    await delay(300);
  }

  const bbox = await getBboxAcciones(item);
  if (!bbox) return { ok: false, causa: 'N7: aria*="acciones" no encontrado tras hover' };
  log(`    N7 btn: "${bbox.aria}" y=${Math.round(bbox.y)}`);

  // hover al botón, luego click
  await page.mouse.move(bbox.x + bbox.w / 2, bbox.y + bbox.h / 2);
  await delay(400); // más tiempo en hover del botón
  await page.mouse.click(bbox.x + bbox.w / 2, bbox.y + bbox.h / 2);
  await delay(1000);

  const cBbox = await buscarConectarEnDropdown(page, 800);
  if (!cBbox) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'N7: Conectar no en dropdown' }; }
  await page.mouse.click(cBbox.x + cBbox.w / 2, cBbox.y + cBbox.h / 2);
  return { ok: true, causa: `N7✓ card-hover+btn-hover via=${cBbox.via} y=${Math.round(cBbox.y)}` };
}

// ── N8 [93%]: data-search-overflow-trigger + locator.click() + getByText Conectar en locator
// Combina el data-attr confirmado con el patrón de locator (sin coords)
async function N8(page, item, nombre) {
  const overflowBtn = item.locator('[data-search-overflow-trigger]').first();
  const visible = await overflowBtn.isVisible({ timeout: 2500 }).catch(() => false);
  if (!visible) return { ok: false, causa: 'N8: data-search-overflow-trigger no visible' };

  const bbox = await overflowBtn.boundingBox().catch(() => null);
  if (!bbox) return { ok: false, causa: 'N8: no boundingBox' };

  await page.mouse.move(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
  await delay(200);
  await page.mouse.click(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
  await delay(900);

  // Buscar Conectar con getByText en toda la página — acotado a y<800
  const cBbox = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('li, [role="menuitem"]')).filter(e => {
      const t = (e.innerText || e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      return (t === 'Conectar' || t === 'Connect' || t === 'Conectar-se') &&
             r.width > 0 && r.y > 100 && r.y < 800;
    });
    if (all.length === 0) return null;
    const rc = all[0].getBoundingClientRect();
    return { x: rc.x, y: rc.y, w: rc.width, h: rc.height, via: 'li-menuitem' };
  });

  if (!cBbox) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'N8: li/menuitem Conectar no encontrado' }; }
  await page.mouse.click(cBbox.x + cBbox.w / 2, cBbox.y + cBbox.h / 2);
  return { ok: true, causa: `N8✓ data-overflow+li via=${cBbox.via} y=${Math.round(cBbox.y)}` };
}

// ── N9 [92%]: N1 + Tab desde el botón ··· hasta Conectar (fallback de teclado)
// Si el mouse.move+click abre el dropdown, Tab navega hasta Conectar
async function N9(page, item, nombre) {
  const bbox = await getBboxAcciones(item);
  if (!bbox) return { ok: false, causa: 'N9: aria*="acciones" no encontrado' };

  await page.mouse.move(bbox.x + bbox.w / 2, bbox.y + bbox.h / 2);
  await delay(200);
  await page.mouse.click(bbox.x + bbox.w / 2, bbox.y + bbox.h / 2);
  await delay(700);

  // Focus el botón ··· y Tab hasta Conectar
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => {
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      return a.includes('acciones') || a.includes('actions') || a.includes('ações');
    });
    if (btn) btn.focus();
  });

  let found = false;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    await delay(100);
    const cur = await page.evaluate(() =>
      ((document.activeElement?.innerText || document.activeElement?.textContent) || '').trim()
    );
    if (cur === 'Conectar' || cur === 'Connect' || cur === 'Conectar-se') {
      await page.keyboard.press('Enter');
      found = true;
      log(`    N9 Conectar via Tab en paso ${i + 1}`);
      break;
    }
  }
  if (!found) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'N9: Tab no alcanzó Conectar en 12 pasos' }; }
  return { ok: true, causa: 'N9✓ mouse.move+click + Tab+Enter' };
}

// ── N10 [91%]: doble click en el botón ··· (algunos Ember handlers responden a dblclick)
async function N10(page, item, nombre) {
  const bbox = await getBboxAcciones(item);
  if (!bbox) return { ok: false, causa: 'N10: aria*="acciones" no encontrado' };
  log(`    N10 btn: "${bbox.aria}" y=${Math.round(bbox.y)}`);

  const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2;
  await page.mouse.move(cx, cy);
  await delay(200);
  await page.mouse.click(cx, cy);   // primer click
  await delay(400);
  // Si no abrió: segundo click (algunos dropdowns ignoran el primero en hover state)
  const yaAbrió = await page.evaluate(() => {
    const d1 = document.querySelector('.artdeco-dropdown__content');
    if (d1) { const r = d1.getBoundingClientRect(); if (r.width > 0) return true; }
    // check ul visible
    return Array.from(document.querySelectorAll('ul')).some(u => {
      const r = u.getBoundingClientRect(); return r.width > 40 && r.y > 100 && r.y < 700;
    });
  });

  if (!yaAbrió) {
    log(`    N10 dropdown no abrió en 1er click → 2do click`);
    await page.mouse.click(cx, cy);
    await delay(700);
  } else {
    await delay(300);
  }

  const cBbox = await buscarConectarEnDropdown(page, 800);
  if (!cBbox) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'N10: Conectar no en dropdown' }; }
  await page.mouse.click(cBbox.x + cBbox.w / 2, cBbox.y + cBbox.h / 2);
  return { ok: true, causa: `N10✓ 1+retry click via=${cBbox.via} y=${Math.round(cBbox.y)}` };
}

const VARIANTES = [
  { id: 'N1',  pct: '98%', desc: 'aria*=acciones + mouse.move + click + artdeco+ul+general y<800',   fn: N1  },
  { id: 'N2',  pct: '97%', desc: 'data-search-overflow-trigger + mouse.move + artdeco+ul',           fn: N2  },
  { id: 'N3',  pct: '96%', desc: 'aria*="Ver más acciones" ES + mouse.move + artdeco+ul',             fn: N3  },
  { id: 'N4',  pct: '96%', desc: 'aria*=acciones + mouse.move + delay 1200ms + artdeco+ul',           fn: N4  },
  { id: 'N5',  pct: '95%', desc: 'aria*=acciones + locator.click + waitForSelector ul Conectar',      fn: N5  },
  { id: 'N6',  pct: '95%', desc: 'aria*=acciones + mousedown+up separados (80ms) + artdeco+ul',       fn: N6  },
  { id: 'N7',  pct: '94%', desc: 'hover card + hover btn (400ms) + mouse.move+click + artdeco+ul',    fn: N7  },
  { id: 'N8',  pct: '93%', desc: 'data-search-overflow-trigger + locator + li/menuitem Conectar',     fn: N8  },
  { id: 'N9',  pct: '92%', desc: 'aria*=acciones + mouse.move+click + Tab hasta Conectar + Enter',    fn: N9  },
  { id: 'N10', pct: '91%', desc: 'aria*=acciones + click + retry si dropdown no abrió',               fn: N10 },
];


// ─── RUNNER PRINCIPAL ─────────────────────────────────────────────────────────
async function testVariante(page, variante, item, nombre) {
  log(`\n  ── ${variante.id} [${variante.pct}]: ${variante.desc}`);
  let res;
  try {
    res = await variante.fn(page, item, nombre);
  } catch (err) {
    res = { ok: false, causa: `EXCEPTION: ${err.message.split('\n')[0]}` };
  }

  // Si llegó a Conectar: verificar modal y cerrar
  let modal = null;
  if (res.ok) {
    modal = await verificarModal(page);
    await page.keyboard.press('Escape').catch(() => {});
    await delay(500);
    if (modal) {
      log(`    ✅ ${variante.id} — MODAL: ${modal}`);
    } else {
      log(`    ⚠️  ${variante.id} — click OK pero modal no apareció`);
      res.ok = false;
      res.causa += ' (modal no detectado)';
    }
  } else {
    log(`    ❌ ${variante.id} — ${res.causa}`);
  }

  return { id: variante.id, pct: variante.pct, ok: res.ok && !!modal, causa: res.causa, modal };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  log('═══════════════════════════════════════════════════════════════');
  log('test-f4-moreBtn.js v2 — 10 VARIANTES botón ··· en Sales Nav lista');
  log(`ENVIAR_REAL = ${ENVIAR_REAL} — modo diagnóstico seguro`);
  log('Probará todas las listas + páginas hasta encontrar 1 candidato real');
  log('═══════════════════════════════════════════════════════════════');

  let browser;
  try {
    browser = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      viewport: { width: 1280, height: 860 },
    });
    const page = await browser.newPage();

    // ── Buscar candidato en todas las listas ─────────────────────────────
    let candidatoEncontrado = null;
    let listaUsada = null;

    for (const lista of LISTAS) {
      if (candidatoEncontrado) break;

      log(`\nProbando lista: ${lista.nombre}`);
      await page.goto(lista.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector(SELECTOR_PERFILES, { timeout: 15000 }).catch(() => {});
      await delay(800);
      await cerrarBanners(page);

      // Revisar hasta MAX_PAGINAS páginas de esta lista
      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        log(`  Página ${pagina}...`);
        const candidatos = await encontrarCandidatos(page, MAX_CANDIDATOS);

        if (candidatos.length > 0) {
          candidatoEncontrado = candidatos[0];
          listaUsada = lista;
          log(`  ✅ Candidato encontrado en p${pagina}: ${candidatoEncontrado.nombre}`);
          break;
        }

        // Intentar ir a siguiente página
        if (pagina < MAX_PAGINAS) {
          const nextBtn = page.locator('button[aria-label="Next"]')
            .or(page.locator('button[aria-label="Siguiente"]'))
            .or(page.locator('button[aria-label="Próxima"]'))
            .first();
          const hasNext = await nextBtn.isVisible({ timeout: 3000 }).catch(() => false);
          if (!hasNext) { log(`  Sin más páginas en esta lista`); break; }
          const disabled = await nextBtn.isDisabled().catch(() => true);
          if (disabled) { log(`  Botón Next deshabilitado`); break; }
          await nextBtn.click();
          await page.waitForSelector(SELECTOR_PERFILES, { timeout: 12000 }).catch(() => {});
          await delay(800);
          await cerrarBanners(page);
        }
      }
    }

    if (!candidatoEncontrado) {
      log('\n🔴 Sin candidatos en NINGUNA lista ni página');
      log('   Todas las listas están completamente procesadas (saved/pending)');
      log('   → El test F4 moreBtn no puede correr sin un perfil candidato real');
      log('   → Cuando el agente principal corra mañana habrá perfiles nuevos');
      log('   → El fix V1 (exceso de acciones) es el correcto según la KB — confiar en él');
      return;
    }

    const { item, nombre } = candidatoEncontrado;
    log(`\nPerfil de prueba: ${nombre}`);
    log(`Lista: ${listaUsada.nombre}`);
    log('─────────────────────────────────────────────────────────────');

    // Diagnóstico completo del card antes de testear
    const diagCard = await diagnosticoCard(item);
    log('\nBotones en el card:');
    diagCard.forEach(b => log(`  btn: text="${b.text}" aria="${b.aria}" ${b.data} x=${b.x} y=${b.y} w=${b.w}`));

    // ── Correr las 10 variantes sobre el mismo perfil ─────────────────
    log('\n═══════════ CORRIENDO 10 VARIANTES ═══════════');
    const resultados = [];

    for (const variante of VARIANTES) {
      await item.scrollIntoViewIfNeeded().catch(() => {});
      await delay(300);

      const res = await testVariante(page, variante, item, nombre);
      resultados.push(res);
      await delay(600);
    }

    // ── Resumen final ──────────────────────────────────────────────────
    log('\n');
    log('═══════════════════════════════════════════════════════════════');
    log('TABLA DE RESULTADOS — F4 moreBtn');
    log('═══════════════════════════════════════════════════════════════');
    log('ID   | %est | Resultado   | Modal     | Detalle');
    log('─────|──────|─────────────|───────────|──────────────────────');
    for (const r of resultados) {
      const icono = r.ok ? '✅ OK  ' : '❌ FAIL';
      const modal = r.modal || '-';
      log(`${r.id.padEnd(4)} | ${r.pct.padEnd(4)} | ${icono}      | ${modal.padEnd(9)} | ${r.causa}`);
    }

    const ganadores = resultados.filter(r => r.ok);
    log('');
    if (ganadores.length > 0) {
      log(`🟢 GANADORES (${ganadores.length}): ${ganadores.map(r => r.id).join(', ')}`);
      log(`   Mejor variante para integrar: ${ganadores[0].id} — ${ganadores[0].causa}`);
    } else {
      log('🔴 NINGUNA VARIANTE FUNCIONÓ — ver diagnóstico del card arriba');
    }
    log('═══════════════════════════════════════════════════════════════');

  } catch (err) {
    log(`CRASH: ${err.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

main().catch(err => { log(`CRASH: ${err.message}`); process.exit(1); });
