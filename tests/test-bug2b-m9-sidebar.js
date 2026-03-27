/**
 * test-bug2b-m9-sidebar.js — 10 VARIANTES: M9 clickea sidebar en lugar del header
 *
 * PROBLEMA CONFIRMADO (imagen + log):
 *   Russell Deakin tiene "+ Seguir" (no "+ Conectar") en el header.
 *   M9 encontró un "Conectar" del SIDEBAR DERECHO (Brandon Laughren, x≈950, y=476).
 *   El sidebar está en x > 850. El header del perfil ocupa x < 700.
 *   M9 solo filtraba por y (100-500), no por x — tomó el botón equivocado.
 *   El modal no apareció porque se clickeó a otra persona.
 *
 * LAS 10 VARIANTES:
 *   C1  M9 + filtro x < 700 (sidebar en x>850, header en x<600)
 *   C2  Detectar "Seguir" → skip M9 → ir directo a "Más"
 *   C3  Scope M9 al contenedor header (.pvs-profile-actions / main > section)
 *   C4  Filtro: botón NOT dentro de <aside>
 *   C5  M9 + verificar modal en 3s; si no → Escape + fallback Más
 *   C6  Log todos los Conectar candidatos (x,y) → tomar el de x más pequeño
 *   C7  x < viewport*0.6 dinámico
 *   C8  Detectar Seguir → click Más → buscar Conectar en dropdown artdeco+ul
 *   C9  Filtrar por aria-label que NO contenga nombre de otra persona
 *   C10 waitForSelector detecta Seguir → activa fallback automáticamente
 *
 * Perfil de test: Russell Deakin (tiene Seguir, Conectar bajo Más)
 * URL directa desde pending-email.json
 *
 * Uso: node test-bug2b-m9-sidebar.js
 */

'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const SESSION_DIR  = path.resolve(__dirname, 'session');
const PENDING_FILE = path.resolve(__dirname, 'pending-email.json');

// URL directa del perfil LinkedIn de Russell — extraída del pending-email.json
const RUSSELL_LINKEDIN_URL = 'https://www.linkedin.com/in/russell-deakin-434226/';
const RUSSELL_NOMBRE       = 'Russell Deakin';

function log(msg) { console.log(`[${new Date().toISOString().slice(11,23)}] ${msg}`); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function cerrarBanners(page) {
  await page.evaluate(() => {
    ['[data-test-global-alert-dismiss]','[aria-label="Dismiss"]','[aria-label="Cerrar"]',
     '[aria-label="Fechar"]','.artdeco-global-alert__dismiss'].forEach(s =>
      document.querySelectorAll(s).forEach(b => { try { b.click(); } catch(_){} }));
  }).catch(() => {});
}

// Helper: loggear todos los botones Conectar con sus coords
async function diagnosticoConectar(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).filter(b => {
      const t = (b.innerText || b.textContent || '').trim();
      return t === 'Conectar' || t === 'Connect' || t === 'Ligar';
    }).map(b => {
      const r = b.getBoundingClientRect();
      return {
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        aria: b.getAttribute('aria-label') || '',
        inAside: !!b.closest('aside'),
        inMain: !!b.closest('main'),
        parentTag: b.parentElement?.tagName,
      };
    });
  });
}

// Helper: verificar modal tras click (3s timeout)
async function verificarModal(page, timeout = 4000) {
  const found = await page.waitForSelector(
    'input[type="email"], input[name="email"], textarea, ' +
    'button:has-text("Send invitation"), button:has-text("Enviar invitación"), ' +
    'button:has-text("Enviar convite"), button:has-text("Enviar")',
    { timeout }
  ).catch(() => null);
  if (!found) return null;
  const tipo = await page.evaluate(() => {
    if (document.querySelector('input[type="email"]')?.offsetWidth > 0) return 'email';
    if (document.querySelector('textarea')?.offsetWidth > 0) return 'textarea';
    return 'send-directo';
  });
  return tipo;
}

// Helper: cargar la página de Russell
async function cargarRussell(page) {
  log(`Cargando: ${RUSSELL_LINKEDIN_URL}`);
  await page.goto(RUSSELL_LINKEDIN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector(
    'button[aria-label*="acciones"], button[aria-label*="actions"], ' +
    'button:has-text("Seguir"), button:has-text("Conectar"), button:has-text("Connect")',
    { timeout: 15000 }
  ).catch(() => {});
  await cerrarBanners(page);
  // scroll fijo post-carga
  await page.evaluate(() => window.scrollTo(0, 200));
  await delay(1000);
  await cerrarBanners(page);
  log(`URL: ${page.url()}`);
}

// ═══════════════════════════════════════════════════════════════════
// LAS 10 VARIANTES
// ═══════════════════════════════════════════════════════════════════

// C1: M9 + filtro x < 700 — excluye sidebar (sidebar en x>850)
async function C1(page) {
  const bbox = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => {
      const t = (b.innerText || b.textContent || '').trim();
      const r = b.getBoundingClientRect();
      // FIX: añadir r.x < 700 para excluir sidebar derecho
      return (t === 'Conectar' || t === 'Connect' || t === 'Ligar') &&
             r.width > 0 && r.y > 100 && r.y < 500 && r.x < 700;
    });
    if (!btns.length) return null;
    const r = btns[0].getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, aria: btns[0].getAttribute('aria-label') };
  });
  if (!bbox) return { ok: false, causa: 'C1: Conectar no en header (x<700, y 100-500)' };
  log(`  C1 btn x=${Math.round(bbox.x)} y=${Math.round(bbox.y)} aria="${bbox.aria}"`);
  await page.mouse.move(bbox.x + bbox.w/2, bbox.y + bbox.h/2);
  await delay(150);
  await page.mouse.click(bbox.x + bbox.w/2, bbox.y + bbox.h/2);
  const modal = await verificarModal(page);
  if (!modal) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'C1: click ok pero modal no apareció' }; }
  return { ok: true, causa: `C1✓ x=${Math.round(bbox.x)} y=${Math.round(bbox.y)} modal=${modal}` };
}

// C2: Detectar "Seguir" → skip M9 → ir directo a "Más" → Conectar
async function C2(page) {
  // Detectar si el header tiene "Seguir" (no "Conectar") como botón primario
  const tieneSeguir = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => {
      const t = (b.innerText || b.textContent || '').trim();
      const r = b.getBoundingClientRect();
      return (t === 'Seguir' || t === 'Follow') && r.width > 0 && r.y > 100 && r.y < 400 && r.x < 700;
    });
    return btns.length > 0;
  });
  log(`  C2 tieneSeguir en header: ${tieneSeguir}`);

  if (tieneSeguir) {
    // ir directo a fallback Más sin pasar por M9
    const masBbox = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button')).filter(b => {
        const t = (b.innerText || b.textContent || '').trim();
        const r = b.getBoundingClientRect();
        return (t === 'Más' || t === 'More' || t === 'Mais') && r.width > 0 && r.y > 100 && r.y < 400 && r.x < 700;
      });
      if (!btns.length) return null;
      const r = btns[0].getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (!masBbox) return { ok: false, causa: 'C2: Seguir detectado pero Más no encontrado' };
    log(`  C2 Más y=${Math.round(masBbox.y)} → click`);
    await page.mouse.move(masBbox.x + masBbox.w/2, masBbox.y + masBbox.h/2);
    await delay(200);
    await page.mouse.click(masBbox.x + masBbox.w/2, masBbox.y + masBbox.h/2);
    await delay(800);
    const cBbox = await page.evaluate(() => {
      const MAX_Y = 860;
      const d1 = document.querySelector('.artdeco-dropdown__content');
      if (d1 && d1.getBoundingClientRect().width > 0) {
        const el = Array.from(d1.querySelectorAll('*')).find(e => {
          const t = (e.innerText||'').trim(), ry = e.getBoundingClientRect().y;
          return (t==='Conectar'||t==='Connect') && e.getBoundingClientRect().width>0 && ry>50 && ry<MAX_Y;
        });
        if (el) { const rc = el.getBoundingClientRect(); return {x:rc.x,y:rc.y,w:rc.width,h:rc.height,via:'artdeco'}; }
      }
      for (const ul of Array.from(document.querySelectorAll('ul'))) {
        const r = ul.getBoundingClientRect();
        if (r.width<50||r.y<50||r.y>MAX_Y) continue;
        const el = Array.from(ul.querySelectorAll('*')).find(e => {
          const t=(e.innerText||'').trim(), ry=e.getBoundingClientRect().y;
          return (t==='Conectar'||t==='Connect') && e.getBoundingClientRect().width>0 && ry>50 && ry<MAX_Y;
        });
        if (el) { const rc=el.getBoundingClientRect(); return {x:rc.x,y:rc.y,w:rc.width,h:rc.height,via:'ul'}; }
      }
      return null;
    });
    if (!cBbox) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'C2: Conectar no en dropdown' }; }
    await page.mouse.click(cBbox.x + cBbox.w/2, cBbox.y + cBbox.h/2);
    const modal = await verificarModal(page);
    if (!modal) return { ok: false, causa: 'C2: modal no apareció tras Más→Conectar' };
    return { ok: true, causa: `C2✓ Seguir→Más→${cBbox.via} y=${Math.round(cBbox.y)} modal=${modal}` };
  }

  // Si no tiene Seguir, hay Conectar directo → M9 con x<700
  return C1(page);
}

// C3: Scope M9 al contenedor del header del perfil
async function C3(page) {
  const bbox = await page.evaluate(() => {
    const HEADER_SELS = ['.pvs-profile-actions', '.pv-top-card-v2-ctas', '.pv-top-card__ctas',
                         'section.artdeco-card .ph5', 'main > section:first-of-type', 'main section'];
    for (const sel of HEADER_SELS) {
      const scope = document.querySelector(sel);
      if (!scope) continue;
      const sr = scope.getBoundingClientRect();
      if (sr.width === 0) continue;
      const btns = Array.from(scope.querySelectorAll('button')).filter(b => {
        const t = (b.innerText || b.textContent || '').trim();
        const r = b.getBoundingClientRect();
        return (t === 'Conectar' || t === 'Connect' || t === 'Ligar') && r.width > 0 && r.y > 50;
      });
      if (btns.length > 0) {
        const r = btns[0].getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, scope: sel };
      }
    }
    return null;
  });
  if (!bbox) return { ok: false, causa: 'C3: Conectar no en scope del header' };
  log(`  C3 scope="${bbox.scope}" x=${Math.round(bbox.x)} y=${Math.round(bbox.y)}`);
  await page.mouse.move(bbox.x + bbox.w/2, bbox.y + bbox.h/2);
  await delay(150);
  await page.mouse.click(bbox.x + bbox.w/2, bbox.y + bbox.h/2);
  const modal = await verificarModal(page);
  if (!modal) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'C3: modal no apareció' }; }
  return { ok: true, causa: `C3✓ scope modal=${modal}` };
}

// C4: Filtrar botones NOT dentro de <aside>
async function C4(page) {
  const bbox = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => {
      const t = (b.innerText || b.textContent || '').trim();
      const r = b.getBoundingClientRect();
      const inAside = !!b.closest('aside');
      // Excluir aside (sidebar) y nav (navbar)
      const inNav   = !!b.closest('nav');
      return (t === 'Conectar' || t === 'Connect' || t === 'Ligar') &&
             r.width > 0 && r.y > 100 && r.y < 500 && !inAside && !inNav;
    });
    if (!btns.length) return null;
    const r = btns[0].getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (!bbox) return { ok: false, causa: 'C4: Conectar no encontrado fuera de aside/nav' };
  log(`  C4 x=${Math.round(bbox.x)} y=${Math.round(bbox.y)}`);
  await page.mouse.move(bbox.x + bbox.w/2, bbox.y + bbox.h/2);
  await delay(150);
  await page.mouse.click(bbox.x + bbox.w/2, bbox.y + bbox.h/2);
  const modal = await verificarModal(page);
  if (!modal) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'C4: modal no apareció' }; }
  return { ok: true, causa: `C4✓ no-aside modal=${modal}` };
}

// C5: M9 estándar + verificar modal 3s; si no → Escape + intentar Más
async function C5(page) {
  // Intentar M9 original sin filtro de x
  const bbox = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => {
      const t = (b.innerText || b.textContent || '').trim();
      const r = b.getBoundingClientRect();
      return (t === 'Conectar' || t === 'Connect' || t === 'Ligar') && r.width > 0 && r.y > 100 && r.y < 500;
    });
    if (!btns.length) return null;
    const r = btns[0].getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

  if (bbox) {
    await page.mouse.move(bbox.x + bbox.w/2, bbox.y + bbox.h/2);
    await delay(150);
    await page.mouse.click(bbox.x + bbox.w/2, bbox.y + bbox.h/2);
    const modal = await verificarModal(page, 3000);
    if (modal) return { ok: true, causa: `C5✓ M9 directo modal=${modal}` };
    // Modal no apareció → Escape + fallback
    log(`  C5 M9 no dio modal → Escape + fallback Más`);
    await page.keyboard.press('Escape').catch(() => {});
    await delay(500);
  }

  // Fallback: buscar "Más" en header
  const masBbox = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => {
      const t = (b.innerText || b.textContent || '').trim();
      const r = b.getBoundingClientRect();
      return (t === 'Más' || t === 'More' || t === 'Mais') && r.width > 0 && r.y > 100 && r.y < 400 && r.x < 700;
    });
    if (!btns.length) return null;
    const r = btns[0].getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (!masBbox) return { ok: false, causa: 'C5: sin modal M9 y Más no encontrado' };
  await page.mouse.move(masBbox.x + masBbox.w/2, masBbox.y + masBbox.h/2);
  await delay(200);
  await page.mouse.click(masBbox.x + masBbox.w/2, masBbox.y + masBbox.h/2);
  await delay(800);
  const cBbox = await page.evaluate(() => {
    const MAX_Y = 860;
    for (const sel of ['.artdeco-dropdown__content', ...Array.from(document.querySelectorAll('ul'))]) {
      const container = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (!container) continue;
      const cr = container.getBoundingClientRect();
      if (cr.width < 40 || cr.y > MAX_Y) continue;
      const el = Array.from(container.querySelectorAll('*')).find(e => {
        const t = (e.innerText||'').trim(), ry = e.getBoundingClientRect().y;
        return (t==='Conectar'||t==='Connect') && e.getBoundingClientRect().width>0 && ry>50 && ry<MAX_Y;
      });
      if (el) { const rc = el.getBoundingClientRect(); return {x:rc.x,y:rc.y,w:rc.width,h:rc.height}; }
    }
    return null;
  });
  if (!cBbox) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'C5: Conectar no en dropdown' }; }
  await page.mouse.click(cBbox.x + cBbox.w/2, cBbox.y + cBbox.h/2);
  const modal = await verificarModal(page);
  if (!modal) return { ok: false, causa: 'C5: modal no apareció tras fallback' };
  return { ok: true, causa: `C5✓ fallback Más modal=${modal}` };
}

// C6: Log todos los Conectar (x,y) → tomar el de x más pequeño (el más a la izquierda = header)
async function C6(page) {
  const candidatos = await diagnosticoConectar(page);
  log(`  C6 candidatos Conectar: ${JSON.stringify(candidatos.map(c => ({x:c.x,y:c.y,aside:c.inAside})))}`);
  // Filtrar y ordenar: primero los de menor x que estén en rango y
  const validos = candidatos.filter(c => c.y > 100 && c.y < 500 && !c.inAside)
                             .sort((a, b) => a.x - b.x); // menor x = más a la izquierda = header
  if (!validos.length) return { ok: false, causa: 'C6: ningún Conectar fuera del aside en y 100-500' };
  const best = validos[0];
  log(`  C6 tomando: x=${best.x} y=${best.y} (más a la izquierda)`);
  await page.mouse.move(best.x + best.w/2, best.y + best.h/2);
  await delay(150);
  await page.mouse.click(best.x + best.w/2, best.y + best.h/2);
  const modal = await verificarModal(page);
  if (!modal) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'C6: modal no apareció' }; }
  return { ok: true, causa: `C6✓ x-mínimo x=${best.x} y=${best.y} modal=${modal}` };
}

// C7: Filtro dinámico x < viewport*0.6
async function C7(page) {
  const bbox = await page.evaluate(() => {
    const vw = window.innerWidth;
    const btns = Array.from(document.querySelectorAll('button')).filter(b => {
      const t = (b.innerText || b.textContent || '').trim();
      const r = b.getBoundingClientRect();
      return (t === 'Conectar' || t === 'Connect' || t === 'Ligar') &&
             r.width > 0 && r.y > 100 && r.y < 500 && r.x < vw * 0.6;
    });
    if (!btns.length) return null;
    const r = btns[0].getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, vw };
  });
  if (!bbox) return { ok: false, causa: `C7: Conectar no en x < vw*0.6 (${bbox?.vw}*0.6)` };
  log(`  C7 btn x=${Math.round(bbox.x)} y=${Math.round(bbox.y)} vw=${bbox.vw}`);
  await page.mouse.move(bbox.x + bbox.w/2, bbox.y + bbox.h/2);
  await delay(150);
  await page.mouse.click(bbox.x + bbox.w/2, bbox.y + bbox.h/2);
  const modal = await verificarModal(page);
  if (!modal) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'C7: modal no apareció' }; }
  return { ok: true, causa: `C7✓ x<vw*0.6 modal=${modal}` };
}

// C8: Detectar estado header → click Más → Conectar en dropdown con coords x<700
async function C8(page) {
  // Mapear botones del header
  const headerState = await page.evaluate(() => {
    const MAIN_X_MAX = 700;
    const btns = Array.from(document.querySelectorAll('button')).filter(b => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.y > 100 && r.y < 400 && r.x < MAIN_X_MAX;
    }).map(b => ({ text: (b.innerText||b.textContent||'').trim(), x: Math.round(b.getBoundingClientRect().x), y: Math.round(b.getBoundingClientRect().y) }));
    return btns;
  });
  log(`  C8 header btns: ${JSON.stringify(headerState)}`);

  const tieneConectar = headerState.some(b => b.text === 'Conectar' || b.text === 'Connect');
  const tieneMas = headerState.some(b => b.text === 'Más' || b.text === 'More' || b.text === 'Mais');

  if (tieneConectar) {
    // Conectar directo en header — usar C1
    return C1(page);
  }

  if (!tieneMas) return { ok: false, causa: 'C8: ni Conectar ni Más en header x<700' };

  // Click Más
  const masBbox = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => {
      const t = (b.innerText||b.textContent||'').trim();
      const r = b.getBoundingClientRect();
      return (t==='Más'||t==='More'||t==='Mais') && r.width>0 && r.y>100 && r.y<400 && r.x<700;
    });
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await page.mouse.move(masBbox.x + masBbox.w/2, masBbox.y + masBbox.h/2);
  await delay(200);
  await page.mouse.click(masBbox.x + masBbox.w/2, masBbox.y + masBbox.h/2);
  await delay(800);

  // Buscar Conectar en dropdown con x<700 también
  const cBbox = await page.evaluate(() => {
    const MAX_Y = 860;
    const d1 = document.querySelector('.artdeco-dropdown__content');
    if (d1 && d1.getBoundingClientRect().width > 0) {
      const el = Array.from(d1.querySelectorAll('*')).find(e => {
        const t = (e.innerText||'').trim(), ry = e.getBoundingClientRect().y;
        return (t==='Conectar'||t==='Connect') && e.getBoundingClientRect().width>0 && ry>50 && ry<MAX_Y;
      });
      if (el) { const rc = el.getBoundingClientRect(); return {x:rc.x,y:rc.y,w:rc.width,h:rc.height,via:'artdeco'}; }
    }
    for (const ul of Array.from(document.querySelectorAll('ul'))) {
      const r = ul.getBoundingClientRect();
      if (r.width<50||r.y<50||r.y>MAX_Y) continue;
      const el = Array.from(ul.querySelectorAll('*')).find(e => {
        const t=(e.innerText||'').trim(), ry=e.getBoundingClientRect().y;
        return (t==='Conectar'||t==='Connect') && e.getBoundingClientRect().width>0 && ry>50 && ry<MAX_Y;
      });
      if (el) { const rc=el.getBoundingClientRect(); return {x:rc.x,y:rc.y,w:rc.width,h:rc.height,via:'ul'}; }
    }
    return null;
  });

  if (!cBbox) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'C8: Conectar no en dropdown de Más' }; }
  log(`  C8 Conectar en dropdown via=${cBbox.via} y=${Math.round(cBbox.y)}`);
  await page.mouse.click(cBbox.x + cBbox.w/2, cBbox.y + cBbox.h/2);
  const modal = await verificarModal(page);
  if (!modal) return { ok: false, causa: 'C8: modal no apareció' };
  return { ok: true, causa: `C8✓ Más→${cBbox.via} y=${Math.round(cBbox.y)} modal=${modal}` };
}

// C9: Filtrar Conectar por aria-label que NO contenga nombre de otra persona
async function C9(page) {
  const bbox = await page.evaluate((nombrePerfil) => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => {
      const t = (b.innerText || b.textContent || '').trim();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const r = b.getBoundingClientRect();
      if (!(t === 'Conectar' || t === 'Connect' || t === 'Ligar')) return false;
      if (r.width === 0 || r.y < 100 || r.y > 500) return false;
      // Excluir si el aria-label menciona explícitamente otro nombre
      // Los botones del sidebar tienen aria como "Invitar a [Nombre Completo] a conectar"
      // El del header tiene aria simple o relacionado con el perfil actual
      const contieneNombreAjeno = aria.includes(' a ') && !aria.includes(nombrePerfil.toLowerCase());
      return !contieneNombreAjeno;
    });
    if (!btns.length) return null;
    const r = btns[0].getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, aria: btns[0].getAttribute('aria-label') };
  }, RUSSELL_NOMBRE);

  if (!bbox) {
    log(`  C9 sin Conectar con aria sin nombre ajeno → intentando Más`);
    return C8(page);
  }
  log(`  C9 btn x=${Math.round(bbox.x)} y=${Math.round(bbox.y)} aria="${bbox.aria}"`);
  await page.mouse.move(bbox.x + bbox.w/2, bbox.y + bbox.h/2);
  await delay(150);
  await page.mouse.click(bbox.x + bbox.w/2, bbox.y + bbox.h/2);
  const modal = await verificarModal(page);
  if (!modal) { await page.keyboard.press('Escape').catch(() => {}); return { ok: false, causa: 'C9: modal no apareció' }; }
  return { ok: true, causa: `C9✓ aria-filter x=${Math.round(bbox.x)} y=${Math.round(bbox.y)} modal=${modal}` };
}

// C10: waitForSelector detecta Seguir como señal de "necesita Más"
async function C10(page) {
  const estado = await page.evaluate(() => {
    const headerBtns = Array.from(document.querySelectorAll('button')).filter(b => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.y > 100 && r.y < 400 && r.x < 700;
    }).map(b => (b.innerText||b.textContent||'').trim()).filter(Boolean);

    if (headerBtns.includes('Conectar') || headerBtns.includes('Connect') || headerBtns.includes('Ligar'))
      return 'conectar-directo';
    if (headerBtns.includes('Seguir') || headerBtns.includes('Follow'))
      return 'seguir-hay-mas';
    return 'desconocido';
  });
  log(`  C10 estado header: ${estado} → ${estado === 'conectar-directo' ? 'M9+x<700' : 'Más→Conectar'}`);

  if (estado === 'conectar-directo') return C1(page);
  if (estado === 'seguir-hay-mas')   return C8(page);
  return { ok: false, causa: `C10: estado desconocido en header` };
}

const VARIANTES = [
  { id: 'C1',  pct: '99%', desc: 'M9 + filtro x < 700 (sidebar en x>850)',                   fn: C1  },
  { id: 'C2',  pct: '98%', desc: 'Detectar Seguir → skip M9 → Más → Conectar',               fn: C2  },
  { id: 'C3',  pct: '97%', desc: 'Scope M9 al header (.pvs-profile-actions / main)',          fn: C3  },
  { id: 'C4',  pct: '96%', desc: 'Filtrar NOT dentro de <aside> ni <nav>',                    fn: C4  },
  { id: 'C5',  pct: '95%', desc: 'M9 original + verificar modal 3s → fallback Más',           fn: C5  },
  { id: 'C6',  pct: '95%', desc: 'Log todos Conectar → tomar el de x mínimo (más a izquierda)', fn: C6 },
  { id: 'C7',  pct: '94%', desc: 'Filtro dinámico x < viewport*0.6',                          fn: C7  },
  { id: 'C8',  pct: '93%', desc: 'Mapear header btns → Conectar directo O Más → dropdown',   fn: C8  },
  { id: 'C9',  pct: '92%', desc: 'Filtrar aria-label sin nombre de otra persona',             fn: C9  },
  { id: 'C10', pct: '91%', desc: 'waitForSelector detecta Seguir → activa Más automát.',      fn: C10 },
];

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  log('═══════════════════════════════════════════════════════════════');
  log('test-bug2b-m9-sidebar.js — 10 VARIANTES M9 sidebar Russell');
  log('═══════════════════════════════════════════════════════════════');

  let browser;
  try {
    browser = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false, viewport: { width: 1280, height: 860 },
    });
    const page = await browser.newPage();

    // Diagnóstico inicial
    await cargarRussell(page);
    const diag = await diagnosticoConectar(page);
    log('\nDIAGNÓSTICO inicial — todos los botones Conectar:');
    diag.forEach(d => log(`  x=${d.x} y=${d.y} aside=${d.inAside} main=${d.inMain} aria="${d.aria.slice(0,60)}"`));
    log('');

    // Correr las 10 variantes
    const resultados = [];
    for (const v of VARIANTES) {
      log(`\n── ${v.id} [${v.pct}]: ${v.desc}`);
      let res;
      try {
        // Recargar la página entre variantes para estado limpio
        await cargarRussell(page);
        res = await v.fn(page);
      } catch (err) {
        res = { ok: false, causa: `EXCEPTION: ${err.message.split('\n')[0]}` };
      }
      if (res.ok) {
        log(`  ✅ ${v.id} — ${res.causa}`);
        await page.keyboard.press('Escape').catch(() => {});
        await delay(600);
      } else {
        log(`  ❌ ${v.id} — ${res.causa}`);
      }
      resultados.push({ id: v.id, pct: v.pct, ...res });
      await delay(500);
    }

    // RESUMEN
    log('\n═══════════════════════════════════════════════════════════════');
    log('TABLA — BUG #2b M9 sidebar');
    log('═══════════════════════════════════════════════════════════════');
    log('ID   | %est | Resultado | Detalle');
    log('─────|──────|───────────|────────────────────────────────────');
    for (const r of resultados) {
      const icono = r.ok ? '✅ OK  ' : '❌ FAIL';
      log(`${r.id.padEnd(4)} | ${r.pct.padEnd(4)} | ${icono}    | ${r.causa}`);
    }
    const ganadores = resultados.filter(r => r.ok);
    log('');
    if (ganadores.length > 0) {
      log(`🟢 GANADORES (${ganadores.length}): ${ganadores.map(r=>r.id).join(', ')}`);
      log(`   Mejor para integrar: ${ganadores[0].id} — ${ganadores[0].causa}`);
    } else {
      log('🔴 NINGUNA VARIANTE OK — revisar diagnóstico inicial arriba');
    }
    log('═══════════════════════════════════════════════════════════════');

  } catch (err) {
    log(`CRASH: ${err.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

main().catch(e => { log(`CRASH: ${e.message}`); process.exit(1); });
