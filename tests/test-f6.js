// ================================================================
// test-f6.js  — Test aislado del flujo F6 (email)
//
// Lee pending-email.json, toma el primer perfil de la cuenta
// y corre SOLO F6 sin tocar cuotas ni el resto del agente.
//
// Uso:
//   node test-f6.js alejandro
//   node test-f6.js alejandro "ACwAABxxxxxxx"   ← profileUrl específico
//
// NO modifica quota-invitar.json.
// SÍ puede enviar la invitación real — confirmá antes de correr.
// ================================================================

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

// ─── CONFIG (copiada del agente) ─────────────────────────────────────────────

const SESSION_DIRS = {
  alejandro : path.resolve(__dirname, 'session'),
  david     : path.resolve(__dirname, 'david agente invitaciones'),
  francisco : path.resolve(__dirname, 'francisco agente invitaciones'),
};

const MENSAJES = {
  alejandro: {
    ES: 'Mucho gusto! Soy Alejandro, ingeniero en Inteligencia Artificial y ex-director de Tecnología de la Policía Federal Mexicana. Estoy expandiendo mi red para conocer nuevas personas e intercambiar ideas sobre el mercado.',
    EN: 'Nice to meet you! I\'m Alejandro, an Artificial Intelligence engineer and former Technology Director of the Mexican Federal Police. I\'m expanding my network to meet new people and exchange ideas about the market.',
  },
  david     : { PT: 'Muito prazer! Sou David, engenheiro em Inteligência Artificial e ex-director de Tecnologia da Polícia Federal Mexicana. Estou expandindo minha rede pra conhecer novas pessoas e trocar ideias sobre o mercado.' },
  francisco : { PT: 'Muito prazer! Sou Francisco, engenheiro em Inteligência Artificial e ex-director de Tecnologia da Polícia Federal Mexicana. Estou expandindo minha rede pra conhecer novas pessoas e trocar ideias sobre o mercado.' },
};

const US_LOCATIONS = ['united states', 'usa', 'u.s.', 'estados unidos', 'new york', 'california', 'texas', 'florida', 'chicago', 'los angeles', 'san francisco', 'boston', 'seattle', 'miami', 'atlanta', 'denver'];

function getMensaje(cuenta, textoCompleto) {
  if (cuenta === 'alejandro') {
    const t = textoCompleto.toLowerCase();
    if (US_LOCATIONS.some(loc => t.includes(loc))) return MENSAJES.alejandro.EN;
    return MENSAJES.alejandro.ES;
  }
  return cuenta === 'david' ? MENSAJES.david.PT : MENSAJES.francisco.PT;
}

const EMAIL_REMITENTE = 'augusto@globalita.io';
const PENDING_FILE    = path.resolve(__dirname, 'pending-email.json');

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg)  { console.log(`[${new Date().toISOString().slice(11,23)}] ${msg}`); }

async function cerrarBanners(page) {
  await page.evaluate(() => {
    const sels = ['[data-test-global-alert-dismiss]','[aria-label="Dismiss"]','[aria-label="Cerrar"]','[aria-label="Fechar"]','.artdeco-global-alert__dismiss','.global-alert-banner__dismiss'];
    sels.forEach(s => document.querySelectorAll(s).forEach(b => { try { b.click(); } catch(_){} }));
  }).catch(() => {});
}

// ─── F6 COMPLETO (copiado fiel del agente) ───────────────────────────────────

async function enviarConEmail(page, profileSalesNavUrl, nombre, cuenta) {
  log(`F6 Iniciando flow email — ${nombre}`);
  log(`F6 profileUrl: ${profileSalesNavUrl}`);

  // ── 1. Navegar al perfil en Sales Nav ─────────────────────────────────────
  // FIX URL: normalizar todos los formatos posibles en pending-email.json
  function buildSalesNavUrl(raw) {
    if (!raw) return null;
    if (raw.startsWith('http')) return raw;
    const m = raw.match(/sales\/(?:lead|people)\/([^?#,/\s]+)/);
    if (m) return `https://www.linkedin.com/sales/lead/${m[1]}`;
    if (raw.startsWith('/')) return `https://www.linkedin.com${raw}`;
    return `https://www.linkedin.com/sales/lead/${raw}`;
  }
  const salesNavUrl = buildSalesNavUrl(profileSalesNavUrl);
  if (!salesNavUrl) { log(`F6 ✗ profileUrl inválido: "${profileSalesNavUrl}"`); return 'error'; }
  log(`F6 profileUrl raw: "${profileSalesNavUrl}"`);
  log(`F6 salesNavUrl: "${salesNavUrl}"`);
  try {
    await page.goto(salesNavUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector(
      'button[aria-label*="Guardar"], button[aria-label*="Save"], button[aria-label*="Salvar"]',
      { timeout: 12000 }
    ).catch(() => {});
    await delay(800);
    await cerrarBanners(page);
  } catch (err) {
    log(`F6 ✗ No se pudo navegar al lead SalesNav — ${err.message.split('\n')[0]}`);
    return 'error';
  }
  log(`F6 ✓ En SalesNav: ${page.url()}`);

  // ── 2. Abrir dropdown ··· → "Ver perfil de LinkedIn" ─────────────────────
  await page.waitForSelector(
    'button[aria-label*="Guardar"], button[aria-label*="Save"], button[aria-label*="Salvar"], ' +
    '[data-view-name="lead-actions"], .profile-topcard__actions',
    { timeout: 10000 }
  ).catch(() => {});
  await delay(1000);

  // Loguear todos los aria-labels disponibles — diagnóstico
  const ariaLabels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button[aria-label]'))
      .map(b => b.getAttribute('aria-label')).filter(Boolean)
  );
  log(`F6 [diag] aria-labels en SalesNav (${ariaLabels.length}): ${JSON.stringify(ariaLabels.slice(0, 15))}`);

  const moreBtnSalesNav = page.locator('button[aria-label*="exceso de acciones"]')
    .or(page.locator('button[aria-label*="excess actions"]'))
    .or(page.locator('button[aria-label*="excesso de ações"]'))
    .or(page.locator('button[aria-label*="More actions"]'))
    .or(page.locator('button[aria-label*="más acciones"]'))
    .or(page.locator('button[aria-label*="ações"]'))
    .or(page.locator('button[aria-label*="More options"]'))
    .or(page.locator('button[aria-label*="opciones"]'))
    .or(page.locator('button[aria-label*="opções"]'))
    .first();

  const moreBtnVisible = await moreBtnSalesNav.isVisible({ timeout: 6000 }).catch(() => false);
  log(`F6 [diag] Botón ··· visible: ${moreBtnVisible}`);

  if (!moreBtnVisible) {
    log(`F6 ✗ Botón ··· no encontrado — tomando screenshot`);
    await page.screenshot({ path: 'f6-test-no-morebtn.png' });
    log(`F6 Screenshot: f6-test-no-morebtn.png`);
    return 'error';
  }

  // FIX BUG-1: click con timeout corto — SÍ ejecuta aunque Playwright tire "not visible"
  await moreBtnSalesNav.click({ timeout: 3000 }).catch(() => {});
  await delay(1000);

  // Loguear opciones del dropdown
  const optsDropdown = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], li'))
      .map(el => el.textContent?.trim()).filter(t => t && t.length > 1 && t.length < 80)
      .slice(0, 15)
  );
  log(`F6 [diag] Opciones dropdown: ${JSON.stringify(optsDropdown)}`);

  // FIX BUG-2: timeout 3000ms en click para evitar hang de 30s
  const verLinkedinOpt = page.getByText('Ver perfil de LinkedIn', { exact: true })
    .or(page.getByText('View LinkedIn profile',   { exact: true }))
    .or(page.getByText('Ver perfil do LinkedIn',  { exact: true }))
    .or(page.getByText('View on LinkedIn',        { exact: true }))
    .or(page.getByText('Ver en LinkedIn',         { exact: true }))
    .first();

  const verLinkedinVisible = await verLinkedinOpt.isVisible({ timeout: 3000 }).catch(() => false);
  log(`F6 [diag] "Ver perfil de LinkedIn" visible: ${verLinkedinVisible}`);

  if (!verLinkedinVisible) {
    // BUG-2 diagnostico: intentar buscar cualquier link linkedin.com/in/ en el DOM
    const hrefDirecto = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a[href]'))
        .find(a => a.href && a.href.includes('linkedin.com/in/') && !a.href.includes('/sales/'));
      return a ? a.href : null;
    });
    log(`F6 [diag] href linkedin.com/in/ directo en DOM: ${hrefDirecto || 'null'}`);
    await page.screenshot({ path: 'f6-test-no-ver-linkedin.png' });
    log(`F6 Screenshot: f6-test-no-ver-linkedin.png`);

    if (hrefDirecto) {
      log(`F6 [fallback] Usando href directo sin dropdown`);
      try {
        await page.goto(hrefDirecto, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await delay(2000);
        await cerrarBanners(page);
        log(`F6 ✓ En LinkedIn via href directo: ${page.url()}`);
        // Saltar al paso 3
        return await procesarLinkedInPage(page, null, nombre, cuenta);
      } catch {
        return 'error';
      }
    }

    await page.keyboard.press('Escape').catch(() => {});
    log(`F6 ✗ "Ver perfil de LinkedIn" no encontrado y sin href fallback`);
    return 'error';
  }

  // Extraer href ANTES del click
  const linkedinHrefDropdown = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('a[href]'));
    const match = all.find(a => a.href && a.href.includes('linkedin.com/in/') && !a.href.includes('/sales/'));
    return match ? match.href : null;
  });
  log(`F6 [diag] href en dropdown: ${linkedinHrefDropdown || 'null'}`);

  let linkedinPage = page;
  const [newTab] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 2500 }).catch(() => null),
    verLinkedinOpt.click({ timeout: 3000 }).catch(() => {}),  // FIX BUG-2
  ]);

  if (newTab) {
    await newTab.waitForLoadState('domcontentloaded').catch(() => {});
    await delay(2000);
    await cerrarBanners(newTab);
    linkedinPage = newTab;
    log(`F6 [diag] Nueva pestaña: ${linkedinPage.url()}`);
  } else {
    if (linkedinHrefDropdown && linkedinHrefDropdown.includes('linkedin.com/in/')) {
      await page.goto(linkedinHrefDropdown, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await delay(2000);
      await cerrarBanners(page);
      log(`F6 [diag] Navegado por href dropdown: ${page.url()}`);
    } else {
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      log(`F6 [diag] Misma pestaña post-click: ${page.url()}`);
    }
  }

  const linkedinUrl = linkedinPage.url();
  if (!linkedinUrl.includes('linkedin.com/in/')) {
    log(`F6 ✗ URL no es perfil LinkedIn: ${linkedinUrl}`);
    if (newTab) await newTab.close().catch(() => {});
    return 'error';
  }

  log(`F6 ✓ En perfil LinkedIn: ${linkedinUrl}`);
  return await procesarLinkedInPage(linkedinPage, newTab, nombre, cuenta);
}

// ── Paso 3+4: lógica LinkedIn (conectar + modal + email + enviar) ─────────────
async function procesarLinkedInPage(linkedinPage, newTab, nombre, cuenta) {
  // Esperar carga real
  await linkedinPage.waitForSelector(
    'button[aria-label*="acciones"], button[aria-label*="actions"], ' +
    'button:has-text("Conectar"), button:has-text("Connect"), button:has-text("Ligar")',
    { timeout: 12000 }
  ).catch(() => {});
  await cerrarBanners(linkedinPage);
  await linkedinPage.evaluate(() => window.scrollTo(0, 200));
  await delay(1000);
  await cerrarBanners(linkedinPage);

  // Loguear y-coord del Conectar pre-evaluate
  const conectarPreY = await linkedinPage.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => {
      const t = (b.innerText || b.textContent || '').trim();
      return (t === 'Conectar' || t === 'Connect' || t === 'Ligar') && b.getBoundingClientRect().width > 0;
    });
    return b ? Math.round(b.getBoundingClientRect().y) : null;
  });
  log(`F6 [B5] Conectar pre-evaluate y=${conectarPreY ?? 'no encontrado'}`);

  // Detectar estado del header
  const estadoHeader = await linkedinPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.y > 100 && r.y < 420 && r.x < 750;
    }).map(b => (b.innerText || b.textContent || '').trim());
    log_btns = btns; // para debug
    if (btns.includes('Conectar') || btns.includes('Connect') || btns.includes('Ligar'))
      return 'conectar-directo';
    if (btns.includes('Seguir') || btns.includes('Follow'))
      return 'seguir-necesita-mas';
    return 'desconocido';
  });
  log(`F6 [C2] Estado header: ${estadoHeader}`);

  // Screenshot antes de hacer click
  await linkedinPage.screenshot({ path: 'f6-test-linkedin-pre-click.png' });
  log(`F6 Screenshot pre-click: f6-test-linkedin-pre-click.png`);

  // Helper: Más → Conectar
  const clickMasYConectar = async () => {
    const masBbox = await linkedinPage.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(b => {
        const t = (b.innerText || b.textContent || '').trim();
        const r = b.getBoundingClientRect();
        return (t === 'Más' || t === 'More' || t === 'Mais') &&
               r.width > 0 && r.y > 100 && r.y < 420 && r.x < 750;
      });
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (!masBbox) {
      // Loguear botones disponibles
      const btnsDisp = await linkedinPage.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .filter(b => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().y > 100 && b.getBoundingClientRect().y < 420)
          .map(b => ({ text: (b.innerText||b.textContent||'').trim().slice(0,30), y: Math.round(b.getBoundingClientRect().y), x: Math.round(b.getBoundingClientRect().x) }))
      );
      log(`F6 [diag] Botones header disponibles: ${JSON.stringify(btnsDisp)}`);
      log(`F6 ✗ Botón Más no encontrado`);
      return false;
    }
    log(`F6 [C8] Más y=${Math.round(masBbox.y)} → click`);
    await linkedinPage.mouse.move(masBbox.x + masBbox.w/2, masBbox.y + masBbox.h/2);
    await delay(200);
    await linkedinPage.mouse.click(masBbox.x + masBbox.w/2, masBbox.y + masBbox.h/2);
    await delay(800);

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
      // Loguear qué hay en el dropdown
      const items = []; document.querySelectorAll('.artdeco-dropdown__content li, ul li').forEach(e => {
        const t=(e.innerText||e.textContent||'').trim(); if(t&&t.length<50)items.push(t);
      });
      return { _opts: [...new Set(items)].slice(0,8) };
    });

    if (!cBbox || cBbox._opts) {
      log(`F6 [diag] Dropdown Más: ${JSON.stringify(cBbox?._opts || [])}`);
      await linkedinPage.keyboard.press('Escape').catch(() => {});
      return false;
    }
    log(`F6 [C8] Conectar via=${cBbox.via} y=${Math.round(cBbox.y)}`);
    await linkedinPage.mouse.click(cBbox.x + cBbox.w/2, cBbox.y + cBbox.h/2);
    return true;
  };

  if (estadoHeader === 'seguir-necesita-mas') {
    const ok = await clickMasYConectar();
    if (!ok) { if (newTab) await newTab.close().catch(() => {}); return 'error'; }
  } else if (estadoHeader === 'conectar-directo') {
    const cd = await linkedinPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button')).filter(b => {
        const t = (b.innerText || b.textContent || '').trim();
        const r = b.getBoundingClientRect();
        return (t==='Conectar'||t==='Connect'||t==='Ligar') && r.width>0 && r.y>100 && r.y<500 && r.x<750;
      });
      if (!btns.length) return null;
      const r = btns[0].getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (!cd) {
      log(`F6 [C2] Conectar no en x<750 → fallback Más`);
      const ok = await clickMasYConectar();
      if (!ok) { if (newTab) await newTab.close().catch(() => {}); return 'error'; }
    } else {
      log(`F6 [M9] Conectar directo x=${Math.round(cd.x)} y=${Math.round(cd.y)}`);
      await linkedinPage.mouse.move(cd.x + cd.w/2, cd.y + cd.h/2);
      await delay(150);
      await linkedinPage.mouse.click(cd.x + cd.w/2, cd.y + cd.h/2);
      const mc = await linkedinPage.waitForSelector(
        'input[type="email"], textarea, button:has-text("Send invitation"), button:has-text("Enviar invitación")',
        { timeout: 3000 }
      ).catch(() => null);
      if (!mc) {
        log(`F6 [C5] M9 no abrió modal → fallback Más`);
        await linkedinPage.keyboard.press('Escape').catch(() => {});
        await delay(500);
        const ok = await clickMasYConectar();
        if (!ok) { if (newTab) await newTab.close().catch(() => {}); return 'error'; }
      }
    }
  } else {
    log(`F6 [C8] Estado desconocido → intentar Más`);
    const ok = await clickMasYConectar();
    if (!ok) { if (newTab) await newTab.close().catch(() => {}); return 'error'; }
  }

  await delay(800);

  // ── 4. Modal ───────────────────────────────────────────────────────────────
  const modalSel = 'input[type="email"], input[name="email"], textarea, ' +
    'button:has-text("Send invitation"), button:has-text("Enviar invitación"), ' +
    'button:has-text("Enviar convite"), button:has-text("Enviar"), button:has-text("Send")';
  const modalFound = await linkedinPage.waitForSelector(modalSel, { timeout: 8000 }).catch(() => null);

  if (!modalFound) {
    log(`F6 ✗ Modal no apareció`);
    await linkedinPage.screenshot({ path: 'f6-test-no-modal.png' });
    log(`F6 Screenshot: f6-test-no-modal.png`);
    if (newTab) await newTab.close().catch(() => {});
    return 'error';
  }

  await linkedinPage.screenshot({ path: 'f6-test-modal.png' });
  log(`F6 Screenshot modal: f6-test-modal.png`);

  const tieneEmail = await linkedinPage.evaluate(() => {
    const inp = document.querySelector('input[type="email"], input[name="email"]');
    return inp && inp.offsetWidth > 0;
  });
  log(`F6 [diag] Modal pide email: ${tieneEmail}`);

  if (!tieneEmail) {
    // Sin email — agregar nota y enviar
    const addNoteBtn = linkedinPage.locator('button:has-text("Add a note")')
      .or(linkedinPage.locator('button:has-text("Agregar nota")'))
      .or(linkedinPage.locator('button:has-text("Añadir una nota")'))
      .or(linkedinPage.locator('button:has-text("Adicionar nota")'));
    if (await addNoteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addNoteBtn.click(); await delay(600);
    }
    const textarea = linkedinPage.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      const bodyText = await linkedinPage.evaluate(() => document.body.innerText).catch(() => '');
      const msg = getMensaje(cuenta, bodyText);
      await textarea.click(); await delay(300);
      await linkedinPage.evaluate((txt) => {
        const el = document.querySelector('textarea');
        if (el) { el.focus(); document.execCommand('selectAll',false,null); document.execCommand('insertText',false,txt); }
      }, msg);
      await delay(500);
    }
    const sendBtn = linkedinPage.locator('button:has-text("Send invitation")')
      .or(linkedinPage.locator('button:has-text("Enviar invitación")'))
      .or(linkedinPage.locator('button:has-text("Enviar convite")'))
      .or(linkedinPage.locator('button:has-text("Enviar")'))
      .or(linkedinPage.locator('button:has-text("Send")'));
    if (await sendBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await sendBtn.first().click();
      log(`F6 ✓ Enviada sin email (con nota) — ${nombre}`);
      await delay(1500);
      if (newTab) await newTab.close().catch(() => {});
      return 'enviada';
    }
  } else {
    // Con email
    const emailInp = linkedinPage.locator('input[type="email"], input[name="email"]').first();
    await emailInp.click().catch(() => {});
    await delay(200);
    await emailInp.fill(EMAIL_REMITENTE).catch(async () => {
      await linkedinPage.evaluate((em) => {
        const inp = document.querySelector('input[type="email"]');
        if (inp) { inp.focus(); inp.value=em; ['input','change'].forEach(ev=>inp.dispatchEvent(new Event(ev,{bubbles:true}))); }
      }, EMAIL_REMITENTE);
    });
    await delay(400);
    log(`F6 email ingresado: ${EMAIL_REMITENTE}`);
  }

  // Nota
  const addNoteBtn = linkedinPage.locator('button:has-text("Add a note")')
    .or(linkedinPage.locator('button:has-text("Agregar nota")'))
    .or(linkedinPage.locator('button:has-text("Añadir una nota")'))
    .or(linkedinPage.locator('button:has-text("Adicionar nota")'));
  if (await addNoteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await addNoteBtn.click(); await delay(600);
  }
  const textareaF6 = linkedinPage.locator('textarea').first();
  if (await textareaF6.isVisible({ timeout: 2000 }).catch(() => false)) {
    const bodyText = await linkedinPage.evaluate(() => document.body.innerText).catch(() => '');
    const msg = getMensaje(cuenta, bodyText);
    await textareaF6.click(); await delay(300);
    await linkedinPage.evaluate((txt) => {
      const el = document.querySelector('textarea');
      if (el) { el.focus(); document.execCommand('selectAll',false,null); document.execCommand('insertText',false,txt); }
    }, msg);
    await delay(500);
    log(`F6 nota ingresada`);
  }

  const sendBtn = linkedinPage.locator('button:has-text("Send invitation")')
    .or(linkedinPage.locator('button:has-text("Enviar invitación")'))
    .or(linkedinPage.locator('button:has-text("Enviar convite")'))
    .or(linkedinPage.locator('button:has-text("Enviar")'))
    .or(linkedinPage.locator('button:has-text("Send")'));
  if (!await sendBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    log(`F6 ✗ Botón Send no visible`);
    await linkedinPage.screenshot({ path: 'f6-test-no-send.png' });
    if (newTab) await newTab.close().catch(() => {});
    return 'error';
  }

  await sendBtn.first().click();
  log(`F6 ✓ Enviada con email (${EMAIL_REMITENTE}) — ${nombre}`);
  await delay(1500);
  if (newTab) await newTab.close().catch(() => {});
  return 'enviada';
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const cuenta      = process.argv[2] || 'alejandro';
  const profileArg  = process.argv[3] || null;

  log('═'.repeat(60));
  log(`TEST F6 AISLADO | cuenta: ${cuenta}`);

  // Leer pendiente del disco
  let perfil = null;
  if (profileArg) {
    perfil = { profileUrl: profileArg, nombre: 'Manual', grupo: 'US' };
  } else {
    if (!fs.existsSync(PENDING_FILE)) {
      log(`❌ No existe ${PENDING_FILE}`);
      log(`   Pasá la URL manualmente: node test-f6.js alejandro "ACwAABxxxx"`);
      process.exit(1);
    }
    const lista = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    const deCuenta = lista.filter(p => p.cuenta === cuenta);
    if (deCuenta.length === 0) {
      log(`❌ No hay pendientes para "${cuenta}" en ${PENDING_FILE}`);
      log(`   Contenido: ${JSON.stringify(lista.map(p => p.nombre))}`);
      process.exit(1);
    }
    perfil = deCuenta[0];
    log(`Perfil del disco: ${perfil.nombre} | url: ${perfil.profileUrl}`);
  }

  log('═'.repeat(60));

  const browser = await chromium.launchPersistentContext(SESSION_DIRS[cuenta], {
    headless: false,
    viewport: { width: 1280, height: 860 },
  });

  let resultado = 'error';
  try {
    const page = await browser.newPage();
    resultado = await enviarConEmail(page, perfil.profileUrl, perfil.nombre, cuenta);
  } catch (err) {
    log(`ERROR: ${err.message}`);
  } finally {
    await delay(3000);
    await browser.close();
  }

  log('═'.repeat(60));
  log(`RESULTADO: ${resultado === 'enviada' ? '✅ ENVIADA' : '❌ ' + resultado.toUpperCase()}`);
  log('Screenshots guardados en el directorio del proyecto');
  log('═'.repeat(60));
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
