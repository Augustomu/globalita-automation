/**
 * test-bug2-regresion.js — REGRESIÓN BUG #2: F6 flujo completo
 *
 * Verifica los fixes B1-B9 sobre los perfiles reales de pending-email.json:
 *   Russell Deakin  — profileUrl SalesNav guardada
 *   Adam Besvinick  — profileUrl SalesNav guardada
 *
 * FIXES VERIFICADOS:
 *   B1: MAX_Y=860 en búsqueda de Conectar (antes 700)
 *   B2: busca en artdeco + ul (mismo helper F4)
 *   B3: mouse.move antes de click en Más + Conectar
 *   B5: log y-coord del Conectar pre-evaluate
 *   B6: waitForSelector ampliado antes del scroll
 *   B7: delay 1000ms (antes 600ms) post-scroll
 *   B8: mouse.move en fallback Más→dropdown
 *   B9: sistema de intentos — Sanjeev (5 intentos) y Adam (3) saltados
 *
 * MODO: ENVIAR_REAL = false → llega al modal, Escape, no envía
 *       ENVIAR_REAL = true  → envía invitación real con email + nota
 *
 * Uso: node test-bug2-regresion.js
 */

'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const SESSION_DIR  = path.resolve(__dirname, 'session');
const PENDING_FILE = path.resolve(__dirname, 'pending-email.json');
const ENVIAR_REAL  = false;
const EMAIL        = 'augusto@globalita.io';
const MENSAJE      = 'Nice to meet you! I\'m Alejandro, an AI engineer and former Technology Director of the Mexican Federal Police. Expanding my network to exchange ideas about the market.';
const MAX_INTENTOS = 3;

function log(msg) { console.log(`[${new Date().toISOString().slice(11,23)}] ${msg}`); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function cerrarBanners(page) {
  await page.evaluate(() => {
    ['[data-test-global-alert-dismiss]','[aria-label="Dismiss"]','[aria-label="Cerrar"]',
     '[aria-label="Fechar"]','.artdeco-global-alert__dismiss'].forEach(s =>
      document.querySelectorAll(s).forEach(b => { try { b.click(); } catch(_){} }));
  }).catch(() => {});
}

// ── Leer pending-email.json y aplicar B9 ──────────────────────────────────────
function cargarPendientes() {
  if (!fs.existsSync(PENDING_FILE)) { log('pending-email.json no encontrado'); return []; }
  const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
  const deCuenta = list.filter(p => p.cuenta === 'alejandro');
  const activos  = deCuenta.filter(p => !p.intentos || p.intentos < MAX_INTENTOS);
  const agotados = deCuenta.filter(p => p.intentos && p.intentos >= MAX_INTENTOS);

  log(`\npending-email.json — alejandro:`);
  log(`  Total: ${deCuenta.length} | Activos: ${activos.length} | Agotados (B9): ${agotados.length}`);
  agotados.forEach(p => log(`  [B9 SKIP] ${p.nombre} — ${p.intentos} intentos`));
  activos.forEach(p  => log(`  [PROCESAR] ${p.nombre} — ${p.intentos || 0} intentos previos`));
  return activos;
}

// ── Flujo F6 completo con B1-B8 ───────────────────────────────────────────────
async function ejecutarF6(page, pendiente) {
  const { nombre, profileUrl } = pendiente;
  const resultados = { nombre, fixes: {} };

  log(`\n${'─'.repeat(55)}`);
  log(`Procesando F6: ${nombre}`);
  log(`${'─'.repeat(55)}`);

  // ── 1. Navegar al lead en Sales Nav ─────────────────────────────────────
  const salesNavUrl = profileUrl.startsWith('http')
    ? profileUrl
    : `https://www.linkedin.com${profileUrl}`;

  try {
    await page.goto(salesNavUrl, { waitUntil: 'domcontentloaded', timeout: 18000 });
    await page.waitForSelector(
      'button[aria-label*="Guardar"], button[aria-label*="Save"], button[aria-label*="Salvar"]',
      { timeout: 10000 }
    ).catch(() => {});
    await delay(1000);
    await cerrarBanners(page);
    log(`  SalesNav: ${page.url().slice(0, 80)}`);
  } catch (err) {
    log(`  ❌ Error navegando SalesNav: ${err.message.split('\n')[0]}`);
    resultados.error = 'salesNav-nav';
    return resultados;
  }

  // ── 2. ··· → "Ver perfil de LinkedIn" ────────────────────────────────────
  const moreBtnSN = page.locator('button[aria-label*="exceso de acciones"]')
    .or(page.locator('button[aria-label*="excess actions"]'))
    .or(page.locator('button[aria-label*="excesso de ações"]'))
    .or(page.locator('button[aria-label*="More actions"]'))
    .or(page.locator('button[aria-label*="más acciones"]'))
    .first();

  if (!await moreBtnSN.isVisible({ timeout: 6000 }).catch(() => false)) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button[aria-label]'))
        .map(b => b.getAttribute('aria-label')).filter(Boolean).slice(0, 10)
    );
    log(`  ❌ Botón ··· SalesNav no visible | aria-labels: ${JSON.stringify(btns)}`);
    resultados.error = 'salesNav-moreBtn';
    return resultados;
  }

  await moreBtnSN.click();
  await delay(1000);

  const verLinkedinOpt = page.getByText('Ver perfil de LinkedIn', { exact: true })
    .or(page.getByText('View LinkedIn profile', { exact: true }))
    .or(page.getByText('Ver perfil do LinkedIn', { exact: true }))
    .or(page.getByText('View on LinkedIn', { exact: true }))
    .first();

  if (!await verLinkedinOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
    log(`  ❌ "Ver perfil de LinkedIn" no encontrado en dropdown`);
    resultados.error = 'ver-perfil-no-visible';
    return resultados;
  }

  const linkedinHref = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('a[href]'))
      .find(a => a.href?.includes('linkedin.com/in/') && !a.href?.includes('/sales/'));
    return a ? a.href : null;
  });
  log(`  href: ${linkedinHref || 'null'}`);

  const [newTab] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null),
    verLinkedinOpt.click().catch(() => {}),
  ]);

  let linkedinPage = page;
  if (newTab) {
    await newTab.waitForLoadState('domcontentloaded').catch(() => {});
    await delay(2000);
    await cerrarBanners(newTab);
    linkedinPage = newTab;
    log(`  Nueva pestaña: ${linkedinPage.url()}`);
  } else if (linkedinHref?.includes('linkedin.com/in/')) {
    await page.goto(linkedinHref, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await delay(2000);
    await cerrarBanners(page);
    log(`  Misma pestaña → goto: ${linkedinHref}`);
  }

  const url = linkedinPage.url();
  if (!url.includes('linkedin.com/in/')) {
    log(`  ❌ URL no es perfil LinkedIn: ${url}`);
    if (newTab) await newTab.close().catch(() => {});
    resultados.error = 'url-no-linkedin';
    return resultados;
  }
  log(`  ✅ En perfil: ${url}`);

  // ── 3. B6: waitForSelector Conectar O acciones ────────────────────────────
  await linkedinPage.waitForSelector(
    'button[aria-label*="acciones"], button[aria-label*="actions"], ' +
    'button:has-text("Conectar"), button:has-text("Connect"), button:has-text("Ligar")',
    { timeout: 12000 }
  ).catch(() => {});
  await cerrarBanners(linkedinPage);
  resultados.fixes.B6 = true;

  // B7: scroll + delay 1000ms
  await linkedinPage.evaluate(() => window.scrollTo(0, 200));
  await delay(1000);
  await cerrarBanners(linkedinPage);
  resultados.fixes.B7 = true;

  // B5: log y-coord pre-evaluate
  const preY = await linkedinPage.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => {
      const t = (b.innerText || b.textContent || '').trim();
      return (t === 'Conectar' || t === 'Connect' || t === 'Ligar') && b.getBoundingClientRect().width > 0;
    });
    return b ? Math.round(b.getBoundingClientRect().y) : null;
  });
  log(`  B5 Conectar pre-evaluate y=${preY ?? 'no encontrado'}`);
  resultados.fixes.B5_y = preY;

  // M9: Conectar directo y 100-500
  const conectarDirecto = await linkedinPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => {
      const t = (b.innerText || b.textContent || '').trim();
      const r = b.getBoundingClientRect();
      return (t === 'Conectar' || t === 'Connect' || t === 'Ligar') &&
             r.width > 0 && r.y > 100 && r.y < 500;
    });
    if (!btns.length) return null;
    const r = btns[0].getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

  if (conectarDirecto) {
    log(`  M9 Conectar directo y=${Math.round(conectarDirecto.y)}`);
    // B3: mouse.move antes del click
    await linkedinPage.mouse.move(conectarDirecto.x + conectarDirecto.w/2, conectarDirecto.y + conectarDirecto.h/2);
    await delay(150);
    await linkedinPage.mouse.click(conectarDirecto.x + conectarDirecto.w/2, conectarDirecto.y + conectarDirecto.h/2);
    resultados.fixes.B3_M9 = true;
    resultados.metodo = 'M9-directo';
  } else {
    // Fallback: Más → dropdown
    await linkedinPage.evaluate(() => window.scrollTo(0, 400));
    await delay(400);

    const masBbox = await linkedinPage.evaluate(() => {
      const todos = Array.from(document.querySelectorAll('button')).filter(b => {
        const a = (b.getAttribute('aria-label') || '').toLowerCase();
        return a.includes('acciones') || a.includes('actions') || a.includes('ações');
      });
      const t = todos.find(b => { const r = b.getBoundingClientRect(); return r.y >= 50 && r.y <= 860 && r.width > 0; })
              || todos.find(b => { const r = b.getBoundingClientRect(); return r.y > 0 && r.width > 0; });
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });

    if (!masBbox) {
      log(`  ❌ Ni Conectar directo ni botón Más`);
      if (newTab) await newTab.close().catch(() => {});
      resultados.error = 'sin-conectar-ni-mas';
      return resultados;
    }

    log(`  B8 Más y=${Math.round(masBbox.y)} → mouse.move+click`);
    // B3+B8: mouse.move antes del click
    await linkedinPage.mouse.move(masBbox.x + masBbox.w/2, masBbox.y + masBbox.h/2);
    await delay(200);
    await linkedinPage.mouse.click(masBbox.x + masBbox.w/2, masBbox.y + masBbox.h/2);
    await delay(600);
    resultados.fixes.B3_Mas = true;
    resultados.fixes.B8 = true;

    // B1+B2: MAX_Y=860, artdeco + ul
    const cBbox = await linkedinPage.evaluate(() => {
      const MAX_Y = 860;
      const d1 = document.querySelector('.artdeco-dropdown__content');
      if (d1 && d1.getBoundingClientRect().width > 0) {
        const el = Array.from(d1.querySelectorAll('*')).find(e => {
          const t = (e.innerText||'').trim(), ry = e.getBoundingClientRect().y;
          return (t==='Conectar'||t==='Connect'||t==='Ligar') && e.getBoundingClientRect().width>0 && ry>50 && ry<MAX_Y;
        });
        if (el) { const rc = el.getBoundingClientRect(); return {x:rc.x,y:rc.y,w:rc.width,h:rc.height,via:'artdeco'}; }
      }
      for (const ul of Array.from(document.querySelectorAll('ul'))) {
        const r = ul.getBoundingClientRect();
        if (r.width<50||r.y<50||r.y>MAX_Y) continue;
        const el = Array.from(ul.querySelectorAll('*')).find(e => {
          const t=(e.innerText||'').trim(), ry=e.getBoundingClientRect().y;
          return (t==='Conectar'||t==='Connect'||t==='Ligar') && e.getBoundingClientRect().width>0 && ry>50 && ry<MAX_Y;
        });
        if (el) { const rc=el.getBoundingClientRect(); return {x:rc.x,y:rc.y,w:rc.width,h:rc.height,via:'ul'}; }
      }
      return null;
    });

    if (!cBbox) {
      log(`  ❌ Conectar no en dropdown (MAX_Y=860)`);
      if (newTab) await newTab.close().catch(() => {});
      resultados.error = 'conectar-no-dropdown';
      return resultados;
    }

    log(`  B1 Conectar via=${cBbox.via} y=${Math.round(cBbox.y)}`);
    resultados.fixes.B1_via = cBbox.via;
    resultados.fixes.B1_y = Math.round(cBbox.y);
    resultados.metodo = `Más→${cBbox.via}`;

    await linkedinPage.mouse.click(cBbox.x + cBbox.w/2, cBbox.y + cBbox.h/2);
  }

  await delay(800);

  // ── 4. Modal ──────────────────────────────────────────────────────────────
  const modalEl = await linkedinPage.waitForSelector(
    'input[type="email"], input[name="email"], textarea, ' +
    'button:has-text("Send invitation"), button:has-text("Enviar invitación"), button:has-text("Enviar")',
    { timeout: 8000 }
  ).catch(() => null);

  if (!modalEl) {
    log(`  ❌ Modal no apareció`);
    if (newTab) await newTab.close().catch(() => {});
    resultados.error = 'modal-no-apareció';
    return resultados;
  }

  const tieneEmail = await linkedinPage.evaluate(() => {
    const inp = document.querySelector('input[type="email"], input[name="email"]');
    return inp && inp.offsetWidth > 0;
  });
  const modalTipo = tieneEmail ? 'email' : 'textarea/send';
  log(`  ✅ Modal: ${modalTipo}`);
  resultados.modal = modalTipo;

  if (!ENVIAR_REAL) {
    log(`  → ENVIAR_REAL=false — Escape sin enviar`);
    await linkedinPage.keyboard.press('Escape').catch(() => {});
    await delay(500);
    if (newTab) await newTab.close().catch(() => {});
    resultados.enviado = false;
    return resultados;
  }

  // ENVIAR REAL: fill email + nota + Send
  if (tieneEmail) {
    const emailInp = linkedinPage.locator('input[type="email"], input[name="email"]').first();
    await emailInp.fill(EMAIL).catch(async () => {
      await linkedinPage.evaluate((em) => {
        const inp = document.querySelector('input[type="email"]');
        if (inp) { inp.value = em; inp.dispatchEvent(new Event('input', {bubbles:true})); }
      }, EMAIL);
    });
    await delay(400);
    log(`  Email: ${EMAIL}`);
  }

  const addNote = linkedinPage.locator('button:has-text("Add a note"), button:has-text("Agregar nota"), button:has-text("Añadir una nota")').first();
  if (await addNote.isVisible({ timeout: 1500 }).catch(() => false)) {
    await addNote.click(); await delay(400);
  }

  const textarea = linkedinPage.locator('textarea').first();
  if (await textarea.isVisible({ timeout: 1500 }).catch(() => false)) {
    await textarea.click(); await delay(200);
    await linkedinPage.evaluate((txt) => {
      const el = document.querySelector('textarea');
      if (el) { el.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, txt); }
    }, MENSAJE);
    await delay(400);
    log(`  Nota: ${MENSAJE.slice(0, 40)}...`);
  }

  const sendBtn = linkedinPage.locator(
    'button:has-text("Send invitation"), button:has-text("Enviar invitación"), ' +
    'button:has-text("Enviar convite"), button:has-text("Enviar"), button:has-text("Send")'
  ).first();

  if (!await sendBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    log(`  ❌ Botón Send no visible`);
    if (newTab) await newTab.close().catch(() => {});
    resultados.error = 'send-no-visible';
    return resultados;
  }

  await sendBtn.click();
  await delay(1500);
  log(`  ✅ ENVIADA — ${nombre}`);
  resultados.enviado = true;

  if (newTab) await newTab.close().catch(() => {});
  return resultados;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  log('═══════════════════════════════════════════════════════');
  log('test-bug2-regresion.js — F6 flujo completo B1-B9');
  log(`ENVIAR_REAL = ${ENVIAR_REAL}`);
  log('═══════════════════════════════════════════════════════');

  // B9: cargar y filtrar pendientes
  const pendientes = cargarPendientes();
  if (pendientes.length === 0) {
    log('\n🔴 Sin pendientes activos para procesar');
    log('   Todos tienen 3+ intentos (B9) o pending-email.json está vacío');
    return;
  }

  let browser;
  try {
    browser = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false, viewport: { width: 1280, height: 860 },
    });
    const page = await browser.newPage();
    const todosResultados = [];

    for (const p of pendientes) {
      const res = await ejecutarF6(page, p);
      todosResultados.push(res);

      // B9: actualizar intentos en disco
      if (!res.enviado) {
        try {
          const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
          const idx  = list.findIndex(x => x.profileUrl === p.profileUrl);
          if (idx >= 0) {
            list[idx].intentos = (list[idx].intentos || 0) + 1;
            list[idx].ultimoIntento = new Date().toISOString();
            fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));
            log(`  B9 intento registrado: ${p.nombre} → ${list[idx].intentos}/${MAX_INTENTOS}`);
          }
        } catch {}
      } else if (res.enviado) {
        try {
          const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
          fs.writeFileSync(PENDING_FILE, JSON.stringify(list.filter(x => x.profileUrl !== p.profileUrl), null, 2));
          log(`  B9 removido de pending: ${p.nombre}`);
        } catch {}
      }

      await delay(2000);
    }

    // ── RESUMEN ────────────────────────────────────────────────────────────
    log('\n═══════════════════════════════════════════════════════');
    log('RESUMEN BUG #2 — F6 flujo completo');
    log('═══════════════════════════════════════════════════════');

    for (const r of todosResultados) {
      const ok = r.modal && !r.error;
      log(`\n${r.nombre}:`);
      log(`  Resultado:      ${ok ? '🟢 OK' : '🔴 FALLO'} ${r.error ? '— ' + r.error : ''}`);
      log(`  Método:         ${r.metodo || 'no llegó'}`);
      log(`  Modal:          ${r.modal || 'no apareció'}`);
      log(`  B5 pre-y:       ${r.fixes?.B5_y ?? 'N/A'}`);
      log(`  B1 via/y:       ${r.fixes?.B1_via ? r.fixes.B1_via + ' y=' + r.fixes.B1_y : 'M9 directo o sin datos'}`);
      if (ENVIAR_REAL) log(`  Enviado:        ${r.enviado ? '✅ SÍ' : '❌ NO'}`);
    }

    const exitosos = todosResultados.filter(r => r.modal && !r.error).length;
    log(`\nTotal: ${exitosos}/${todosResultados.length} perfiles OK`);

    if (exitosos === todosResultados.length) {
      log('🟢 BUG #2 RESUELTO — F6 flujo completo funciona con B1-B9');
      log('   → Listo para producción');
    } else {
      log('🔴 BUG #2 PERSISTE — revisar errores arriba');
      log('   → Próximo paso: BUG #3');
    }
    log('═══════════════════════════════════════════════════════');

  } catch (err) {
    log(`CRASH: ${err.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

main().catch(e => { log(`CRASH: ${e.message}`); process.exit(1); });
