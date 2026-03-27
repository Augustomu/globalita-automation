/**
 * test-F4-moreBtn-isolated.js
 * FUNCIÓN: F4 fallback (botón ··· → dropdown → Conectar)
 * SCOPE: Solo este path, nada más
 *
 * Corre: node test-F4-moreBtn-isolated.js
 */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const SESSION_DIR = path.resolve(__dirname, 'session');
const ENVIAR_REAL = false;

const LISTAS = [
  'https://www.linkedin.com/sales/search/people?savedSearchId=1953289169',
  'https://www.linkedin.com/sales/search/people?savedSearchId=1966570778',
  'https://www.linkedin.com/sales/search/people?savedSearchId=1966570738',
  'https://www.linkedin.com/sales/search/people?savedSearchId=1947499081',
];

const SEL = 'ol li:has(a[href*="/sales/lead/"]), ul li:has(a[href*="/sales/lead/"])';
function log(m) { console.log(`[${new Date().toISOString().slice(11,23)}] ${m}`); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── La función bajo test ──────────────────────────────────────────────────────
// Exactamente el código que va en invitar-agent.js F4 moreBtn
// Cambia aquí, no en invitar-agent.js hasta que el test diga 🟢

async function f4MoreBtn(page, item, nombre) {
  // A5: hover card → fuerza render del botón ···
  const cardBbox = await item.boundingBox().catch(() => null);
  if (cardBbox) {
    await page.mouse.move(cardBbox.x + cardBbox.width / 2, cardBbox.y + 20);
    await delay(300);
  }

  // A2+A4: bbox del botón ··· por aria o data-attr
  const bbox = await item.evaluate(el => {
    let btn = Array.from(el.querySelectorAll('button[aria-label]')).find(b =>
      ['acciones','actions','ações'].some(k => (b.getAttribute('aria-label')||'').toLowerCase().includes(k))
    );
    if (!btn) btn = el.querySelector('[data-search-overflow-trigger]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return r.width > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height, aria: btn.getAttribute('aria-label') } : null;
  });

  if (!bbox) {
    const arias = await item.evaluate(el =>
      Array.from(el.querySelectorAll('button[aria-label]')).map(b => b.getAttribute('aria-label'))
    ).catch(() => []);
    log(`  ❌ botón ··· no encontrado | aria-labels: ${JSON.stringify(arias)}`);
    return { ok: false, paso: 'boton-no-encontrado' };
  }
  log(`  ✓ botón ···: "${bbox.aria}" y=${Math.round(bbox.y)}`);

  // A2: mouse.move + click (no locator.click — Ember pierde el dropdown)
  await page.mouse.move(bbox.x + bbox.w/2, bbox.y + bbox.h/2);
  await delay(200);
  await page.mouse.click(bbox.x + bbox.w/2, bbox.y + bbox.h/2);

  // A7: esperar que el ul o artdeco aparezca (max 3s)
  await page.waitForFunction(() => {
    const d1 = document.querySelector('.artdeco-dropdown__content');
    if (d1 && d1.getBoundingClientRect().width > 0) return true;
    return Array.from(document.querySelectorAll('ul')).some(u => {
      const r = u.getBoundingClientRect();
      return r.width > 40 && r.y > 50 && r.y < 860;
    });
  }, { timeout: 3000 }).catch(() => {});
  await delay(300);

  // A1+A3: Conectar en artdeco + ul, límite ry < 860
  const cBbox = await page.evaluate(() => {
    const MAX_Y = 860;
    const d1 = document.querySelector('.artdeco-dropdown__content');
    if (d1 && d1.getBoundingClientRect().width > 0) {
      const el = Array.from(d1.querySelectorAll('*')).find(e => {
        const t = (e.innerText||'').trim(), ry = e.getBoundingClientRect().y;
        return ['Conectar','Connect','Conectar-se'].includes(t) &&
               e.getBoundingClientRect().width > 0 && ry > 50 && ry < MAX_Y;
      });
      if (el) { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height, via:'artdeco' }; }
    }
    for (const ul of Array.from(document.querySelectorAll('ul'))) {
      const r = ul.getBoundingClientRect();
      if (r.width < 40 || r.y < 50 || r.y > MAX_Y) continue;
      const el = Array.from(ul.querySelectorAll('*')).find(e => {
        const t = (e.innerText||'').trim(), ry = e.getBoundingClientRect().y;
        return ['Conectar','Connect','Conectar-se'].includes(t) &&
               e.getBoundingClientRect().width > 0 && ry > 50 && ry < MAX_Y;
      });
      if (el) { const r2 = el.getBoundingClientRect(); return { x:r2.x, y:r2.y, w:r2.width, h:r2.height, via:'ul' }; }
    }
    // A9: detectar ya-conectado
    const sigueEl = Array.from(document.querySelectorAll('*')).find(e => {
      const t = (e.innerText||'').trim(), r = e.getBoundingClientRect();
      return ['Seguir','Follow'].includes(t) && r.width > 0 && r.y > 50 && r.y < MAX_Y;
    });
    if (sigueEl) return { via:'ya-conectado' };
    // diagnóstico
    const opts = [...new Set(
      Array.from(document.querySelectorAll('ul li, .artdeco-dropdown__content li'))
        .map(e => (e.innerText||'').trim()).filter(t => t && t.length < 50)
    )].slice(0, 8);
    return { via: null, opts };
  });

  if (cBbox?.via === 'ya-conectado') {
    await page.keyboard.press('Escape').catch(() => {});
    log(`  ✓ A9: "Seguir" detectado — ya conectado`);
    return { ok: false, paso: 'ya-conectado' };
  }
  if (!cBbox?.via) {
    await page.keyboard.press('Escape').catch(() => {});
    log(`  ❌ Conectar no en dropdown | opts: ${JSON.stringify(cBbox?.opts)}`);
    return { ok: false, paso: 'conectar-no-en-dropdown' };
  }

  log(`  ✓ A1+A3: Conectar via=${cBbox.via} y=${Math.round(cBbox.y)}`);
  await page.mouse.click(cBbox.x + cBbox.w/2, cBbox.y + cBbox.h/2);
  await delay(800);

  // Verificar modal
  const modalEl = await page.waitForSelector(
    'input[type="email"], textarea, button:has-text("Send invitation"), button:has-text("Enviar invitación"), button:has-text("Enviar")',
    { timeout: 6000 }
  ).catch(() => null);

  if (!modalEl) {
    log(`  ❌ Modal no apareció`);
    return { ok: false, paso: 'modal-no-aparecio' };
  }

  const modalTipo = await page.evaluate(() => {
    if (document.querySelector('input[type="email"]')?.offsetWidth > 0) return 'email';
    if (document.querySelector('textarea')?.offsetWidth > 0) return 'textarea';
    return 'send-directo';
  });
  log(`  ✓ Modal: ${modalTipo}`);

  if (!ENVIAR_REAL) {
    await page.keyboard.press('Escape').catch(() => {});
    return { ok: true, paso: 'modal-ok', via: cBbox.via, y: Math.round(cBbox.y), modal: modalTipo };
  }

  // Solo si ENVIAR_REAL=true
  const nota = page.locator('button:has-text("Add a note"), button:has-text("Agregar nota")').first();
  if (await nota.isVisible({ timeout: 1000 }).catch(() => false)) { await nota.click(); await delay(300); }
  const ta = page.locator('textarea').first();
  if (await ta.isVisible({ timeout: 1000 }).catch(() => false)) {
    await ta.click(); await delay(200);
    await page.evaluate(t => { const el = document.querySelector('textarea'); if (el) { el.focus(); document.execCommand('selectAll',false,null); document.execCommand('insertText',false,t); } }, 'Nice to meet you!');
    await delay(300);
  }
  const send = page.locator('button:has-text("Send invitation"), button:has-text("Enviar invitación"), button:has-text("Enviar")').first();
  if (await send.isVisible({ timeout: 2000 }).catch(() => false)) {
    await send.click(); await delay(1500);
    return { ok: true, paso: 'ENVIADA-REAL', via: cBbox.via, y: Math.round(cBbox.y), modal: modalTipo };
  }
  return { ok: false, paso: 'send-btn-no-visible' };
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  log('══ test-F4-moreBtn-isolated.js ══');
  log(`ENVIAR_REAL = ${ENVIAR_REAL}`);

  let browser;
  try {
    browser = await chromium.launchPersistentContext(SESSION_DIR, { headless: false, viewport: { width: 1280, height: 860 } });
    const page = await browser.newPage();

    // Buscar 1 candidato real
    let candidato = null;
    for (const url of LISTAS) {
      if (candidato) break;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector(SEL, { timeout: 12000 }).catch(() => {});
      await delay(800);

      for (let p = 1; p <= 3 && !candidato; p++) {
        const items = await page.locator(SEL).all();
        for (const item of items) {
          const texto = await item.innerText().catch(() => '');
          const t = texto.toLowerCase();
          if (['saved','guardado','salvo','pending','pendiente','pendente'].some(k => t.includes(k))) continue;
          const nombre = await item.locator('[data-anonymize="person-name"]').first().innerText().catch(() => '?');
          log(`Candidato: ${nombre}`);
          candidato = { item, nombre };
          break;
        }
        if (!candidato && p < 3) {
          const next = page.locator('button[aria-label="Next"], button[aria-label="Siguiente"]').first();
          if (!await next.isVisible({ timeout: 2000 }).catch(() => false)) break;
          await next.click();
          await page.waitForSelector(SEL, { timeout: 10000 }).catch(() => {});
          await delay(800);
        }
      }
    }

    if (!candidato) { log('🔴 Sin candidatos'); return; }

    log(`\nTesteando F4 moreBtn sobre: ${candidato.nombre}`);
    log('─────────────────────────────────────────');
    const res = await f4MoreBtn(page, candidato.item, candidato.nombre);

    log('\n══ RESULTADO ══');
    log(res.ok
      ? `🟢 OK — via=${res.via} y=${res.y} modal=${res.modal} paso=${res.paso}`
      : `🔴 FAIL — paso=${res.paso}`
    );
    if (res.ok) log('→ Integrar f4MoreBtn en invitar-agent.js');

  } catch(e) { log(`CRASH: ${e.message}`); }
  finally { if (browser) await browser.close().catch(() => {}); }
}
main().catch(e => { log(`CRASH: ${e.message}`); process.exit(1); });
