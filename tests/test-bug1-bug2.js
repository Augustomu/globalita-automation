// ================================================================
// test-bug1-bug2.js
// Prueba los 10 caminos para el click del botón ··· en SalesNav (BUG-1)
// y el click de "Ver perfil de LinkedIn" (BUG-2)
//
// Uso:
//   node test-bug1-bug2.js alejandro "https://www.linkedin.com/sales/lead/ACwAAAxxx..."
//
// Reporta:
//   - Qué camino ganó para el botón ···
//   - Qué camino ganó para "Ver perfil de LinkedIn"
//   - Si F6 completó sin hang
// ================================================================

const { chromium } = require('playwright');
const path = require('path');

const SESSION_DIRS = {
  alejandro : path.resolve(__dirname, 'session'),
  david     : path.resolve(__dirname, 'david agente invitaciones'),
  francisco : path.resolve(__dirname, 'francisco agente invitaciones'),
};

const cuenta      = process.argv[2] || 'alejandro';
const LEAD_URL    = process.argv[3];

if (!LEAD_URL) {
  console.error('❌ Falta URL del lead. Uso: node test-bug1-bug2.js alejandro "https://www.linkedin.com/sales/lead/..."');
  process.exit(1);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

// ─── 10 CAMINOS: Click botón ··· SalesNav ────────────────────────────────────
// Cada camino retorna { ok: bool, via: string }
// Se intentan en orden hasta que uno funcione.

async function intentarClickMoreBtn(page, nombre) {
  const SELECTORES_ARIA = [
    'exceso de acciones', 'excess actions', 'excesso de ações',
    'More actions', 'más acciones', 'ações', 'More options',
    'opciones', 'opções',
  ];

  // ── Camino 1: locator.click({timeout:3000}).catch — insight documentado ──
  for (const aria of SELECTORES_ARIA) {
    const loc = page.locator(`button[aria-label*="${aria}"]`).first();
    const visible = await loc.isVisible({ timeout: 2000 }).catch(() => false);
    if (!visible) continue;
    log(`C1 intentando aria*="${aria}"`);
    await loc.click({ timeout: 3000 }).catch(() => {});
    await delay(800);
    if (await dropdownAbierto(page)) return { ok: true, via: `C1-locator-${aria}` };
  }

  // ── Camino 2: evaluate getBoundingClientRect + mouse.click(coords) ──
  log('C2 evaluate+mouse.click');
  const bbox2 = await page.evaluate((arias) => {
    const btn = Array.from(document.querySelectorAll('button[aria-label]')).find(b => {
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      return arias.some(s => a.includes(s));
    });
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return r.width > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  }, SELECTORES_ARIA.map(s => s.toLowerCase()));
  if (bbox2) {
    await page.mouse.click(bbox2.x + bbox2.w / 2, bbox2.y + bbox2.h / 2);
    await delay(800);
    if (await dropdownAbierto(page)) return { ok: true, via: 'C2-evaluate-mouse' };
  }

  // ── Camino 3: data-view-name="lead-overflow-menu" ──
  log('C3 data-view-name lead-overflow-menu');
  const loc3 = page.locator('[data-view-name="lead-overflow-menu"]').first();
  if (await loc3.isVisible({ timeout: 2000 }).catch(() => false)) {
    await loc3.click({ timeout: 3000 }).catch(() => {});
    await delay(800);
    if (await dropdownAbierto(page)) return { ok: true, via: 'C3-data-view-name' };
  }

  // ── Camino 4: data-search-overflow-trigger (coincide con F4 en lista) ──
  log('C4 data-search-overflow-trigger');
  const loc4 = page.locator('[data-search-overflow-trigger]').first();
  if (await loc4.isVisible({ timeout: 2000 }).catch(() => false)) {
    await loc4.click({ timeout: 3000 }).catch(() => {});
    await delay(800);
    if (await dropdownAbierto(page)) return { ok: true, via: 'C4-overflow-trigger' };
  }

  // ── Camino 5: buscar por texto "···" / "…" en botones ──
  log('C5 texto ··· o …');
  const loc5 = page.locator('button').filter({ hasText: /^[.…·]{2,4}$/ }).first();
  if (await loc5.isVisible({ timeout: 2000 }).catch(() => false)) {
    await loc5.click({ timeout: 3000 }).catch(() => {});
    await delay(800);
    if (await dropdownAbierto(page)) return { ok: true, via: 'C5-texto-ellipsis' };
  }

  // ── Camino 6: hover + mouse.move + mouse.click con delay 1200ms ──
  log('C6 hover + delay 1200');
  const bbox6 = await page.evaluate((arias) => {
    const btn = Array.from(document.querySelectorAll('button[aria-label]')).find(b => {
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      return arias.some(s => a.includes(s));
    });
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return r.width > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  }, SELECTORES_ARIA.map(s => s.toLowerCase()));
  if (bbox6) {
    await page.mouse.move(bbox6.x + bbox6.w / 2, bbox6.y + bbox6.h / 2);
    await delay(400);
    await page.mouse.click(bbox6.x + bbox6.w / 2, bbox6.y + bbox6.h / 2);
    await delay(1200);
    if (await dropdownAbierto(page)) return { ok: true, via: 'C6-hover-delay1200' };
  }

  // ── Camino 7: page.evaluate + btn.click() nativo ──
  log('C7 evaluate btn.click() nativo');
  const clicked7 = await page.evaluate((arias) => {
    const btn = Array.from(document.querySelectorAll('button[aria-label]')).find(b => {
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      return arias.some(s => a.includes(s));
    });
    if (!btn) return false;
    btn.click();
    return true;
  }, SELECTORES_ARIA.map(s => s.toLowerCase()));
  if (clicked7) {
    await delay(1000);
    if (await dropdownAbierto(page)) return { ok: true, via: 'C7-evaluate-nativeClick' };
  }

  // ── Camino 8: dispatchEvent MouseEvent ──
  log('C8 dispatchEvent MouseEvent');
  const clicked8 = await page.evaluate((arias) => {
    const btn = Array.from(document.querySelectorAll('button[aria-label]')).find(b => {
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      return arias.some(s => a.includes(s));
    });
    if (!btn) return false;
    ['mousedown', 'mouseup', 'click'].forEach(ev =>
      btn.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }))
    );
    return true;
  }, SELECTORES_ARIA.map(s => s.toLowerCase()));
  if (clicked8) {
    await delay(1000);
    if (await dropdownAbierto(page)) return { ok: true, via: 'C8-dispatchEvent' };
  }

  // ── Camino 9: scroll al elemento + locator.click sin timeout ──
  log('C9 scrollIntoView + locator.click()');
  for (const aria of SELECTORES_ARIA) {
    const loc9 = page.locator(`button[aria-label*="${aria}"]`).first();
    if (await loc9.count() === 0) continue;
    await loc9.scrollIntoViewIfNeeded().catch(() => {});
    await delay(500);
    await loc9.click({ timeout: 3000 }).catch(() => {});
    await delay(1000);
    if (await dropdownAbierto(page)) return { ok: true, via: `C9-scrollIntoView-${aria}` };
  }

  // ── Camino 10: keyboard Tab hasta el botón + Enter ──
  log('C10 Tab navigation + Enter');
  await page.keyboard.press('Escape').catch(() => {});
  await delay(200);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    await delay(100);
    const focused = await page.evaluate((arias) => {
      const el = document.activeElement;
      if (!el) return false;
      const a = (el.getAttribute('aria-label') || '').toLowerCase();
      return arias.some(s => a.includes(s));
    }, SELECTORES_ARIA.map(s => s.toLowerCase()));
    if (focused) {
      await page.keyboard.press('Enter');
      await delay(800);
      if (await dropdownAbierto(page)) return { ok: true, via: `C10-tab-enter-${i}tabs` };
      break;
    }
  }

  return { ok: false, via: 'ninguno' };
}

// ─── Verificar que el dropdown está abierto ───────────────────────────────────
async function dropdownAbierto(page) {
  return page.evaluate(() => {
    const d = document.querySelector('.artdeco-dropdown__content');
    if (d && d.getBoundingClientRect().width > 0) return true;
    const uls = Array.from(document.querySelectorAll('ul')).filter(u => {
      const r = u.getBoundingClientRect();
      return r.width > 40 && r.height > 20 && r.y > 50 && r.y < 860;
    });
    return uls.length > 0;
  }).catch(() => false);
}

// ─── 10 CAMINOS: Click "Ver perfil de LinkedIn" (BUG-2) ──────────────────────

const TEXTOS_LINKEDIN = [
  'Ver perfil de LinkedIn', 'View LinkedIn profile',
  'Ver perfil do LinkedIn', 'View on LinkedIn', 'Ver en LinkedIn',
];

async function intentarClickVerLinkedin(page) {
  // ── Camino 1: getByText exact + click({timeout:3000}) — FIX BUG-2 ──
  for (const texto of TEXTOS_LINKEDIN) {
    const loc = page.getByText(texto, { exact: true }).first();
    if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
      log(`VL-C1 getByText exact "${texto}"`);
      const [newTab] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null),
        loc.click({ timeout: 3000 }).catch(() => {}),  // ← FIX: timeout corto
      ]);
      await delay(500);
      const resultUrl = newTab ? newTab.url() : page.url();
      if (resultUrl.includes('linkedin.com/in/')) return { ok: true, newTab, via: `VL-C1-${texto}` };
      if (newTab) await newTab.close().catch(() => {});
    }
  }

  // ── Camino 2: locator a[href*="linkedin.com/in/"] en dropdown ──
  log('VL-C2 href linkedin.com/in/ en dropdown');
  const href2 = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('[role="menuitem"] a, li a, .artdeco-dropdown__content a'))
      .find(a => a.href && a.href.includes('linkedin.com/in/') && !a.href.includes('/sales/'));
    return a ? a.href : null;
  });
  if (href2) {
    const [newTab2] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null),
      page.evaluate(h => { const a = Array.from(document.querySelectorAll('a')).find(x=>x.href===h); if(a) a.click(); }, href2),
    ]);
    await delay(500);
    const resultUrl2 = newTab2 ? newTab2.url() : page.url();
    if (resultUrl2.includes('linkedin.com/in/')) return { ok: true, newTab: newTab2, via: 'VL-C2-href-evaluate' };
    if (newTab2) await newTab2.close().catch(() => {});
  }

  // ── Camino 3: page.goto() directo al href extraído (sin abrir nueva pestaña) ──
  log('VL-C3 goto directo');
  const href3 = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('a[href]'));
    const m = all.find(a => a.href && a.href.includes('linkedin.com/in/') && !a.href.includes('/sales/'));
    return m ? m.href : null;
  });
  if (href3) {
    await page.goto(href3, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await delay(2000);
    if (page.url().includes('linkedin.com/in/')) return { ok: true, newTab: null, via: 'VL-C3-goto-directo' };
  }

  // ── Camino 4: locator has-text parcial + mouse.click(coords) ──
  log('VL-C4 has-text parcial + mouse.click');
  const bbox4 = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('[role="menuitem"], li, .artdeco-dropdown__content *'))
      .find(e => {
        const t = (e.innerText || e.textContent || '').trim();
        return t.toLowerCase().includes('linkedin') && e.getBoundingClientRect().width > 0;
      });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (bbox4) {
    const [newTab4] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
      page.mouse.click(bbox4.x + bbox4.w / 2, bbox4.y + bbox4.h / 2),
    ]);
    await delay(500);
    const url4 = newTab4 ? newTab4.url() : page.url();
    if (url4.includes('linkedin.com/in/')) return { ok: true, newTab: newTab4, via: 'VL-C4-coords-parcial' };
    if (newTab4) await newTab4.close().catch(() => {});
  }

  // ── Caminos 5-10: variantes adicionales de selector ──
  const extrasTextos = ['LinkedIn', 'perfil', 'profile', 'Ver perfil'];
  for (let i = 0; i < extrasTextos.length; i++) {
    log(`VL-C${5 + i} texto parcial "${extrasTextos[i]}"`);
    const loc = page.locator(`[role="menuitem"]:has-text("${extrasTextos[i]}")`).first();
    if (!await loc.isVisible({ timeout: 1500 }).catch(() => false)) continue;
    const [nt] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
      loc.click({ timeout: 3000 }).catch(() => {}),
    ]);
    await delay(500);
    const url = nt ? nt.url() : page.url();
    if (url.includes('linkedin.com/in/')) return { ok: true, newTab: nt, via: `VL-C${5 + i}-menuitem-${extrasTextos[i]}` };
    if (nt) await nt.close().catch(() => {});
  }

  return { ok: false, newTab: null, via: 'ninguno' };
}

// ─── MAIN TEST ────────────────────────────────────────────────────────────────

async function main() {
  log(`\n${'═'.repeat(60)}`);
  log(`TEST BUG-1 + BUG-2 | cuenta: ${cuenta}`);
  log(`Lead URL: ${LEAD_URL}`);
  log('═'.repeat(60));

  const browser = await chromium.launchPersistentContext(SESSION_DIRS[cuenta], {
    headless: false,
    viewport: { width: 1280, height: 860 },
  });

  const resultados = { bug1: null, bug2: null, totalMs: 0 };
  const t0 = Date.now();

  try {
    const page = await browser.newPage();
    log(`Navegando al lead SalesNav...`);
    await page.goto(LEAD_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector(
      'button[aria-label*="Guardar"], button[aria-label*="Save"], button[aria-label*="Salvar"]',
      { timeout: 12000 }
    ).catch(() => {});
    await delay(1500);

    // ── TEST BUG-1: ¿cuál camino abre el dropdown? ──────────────────────────
    log('\n── TEST BUG-1: botón ··· SalesNav ──');
    const res1 = await intentarClickMoreBtn(page, 'TestLead');
    resultados.bug1 = res1;
    log(`BUG-1 resultado: ${res1.ok ? '✅' : '❌'} via=${res1.via}`);

    if (!res1.ok) {
      log('BUG-1 ✗ Ningún camino funcionó — loggear botones disponibles:');
      const btns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button[aria-label]'))
          .map(b => b.getAttribute('aria-label')).filter(Boolean).slice(0, 15)
      );
      log(`Botones aria: ${JSON.stringify(btns)}`);
    } else {
      // ── TEST BUG-2: ¿cuál camino va al perfil linkedin.com/in/ ? ──────────
      log('\n── TEST BUG-2: "Ver perfil de LinkedIn" ──');
      const res2 = await intentarClickVerLinkedin(page);
      resultados.bug2 = res2;
      log(`BUG-2 resultado: ${res2.ok ? '✅' : '❌'} via=${res2.via}`);

      if (res2.ok) {
        const targetPage = res2.newTab || page;
        log(`URL resultante: ${targetPage.url()}`);
        if (res2.newTab) {
          await delay(1000);
          await res2.newTab.close().catch(() => {});
        }
      }
    }

  } catch (err) {
    log(`ERROR: ${err.message}`);
  } finally {
    resultados.totalMs = Date.now() - t0;
    await delay(2000);
    await browser.close();
  }

  log('\n' + '═'.repeat(60));
  log('RESULTADO FINAL:');
  log(`  BUG-1 (moreBtn): ${resultados.bug1?.ok ? '✅ PASS' : '❌ FAIL'} — ${resultados.bug1?.via}`);
  log(`  BUG-2 (verLinkedin): ${resultados.bug2?.ok ? '✅ PASS' : '❌ FAIL'} — ${resultados.bug2?.via}`);
  log(`  Tiempo total: ${(resultados.totalMs / 1000).toFixed(1)}s`);
  log('═'.repeat(60));

  // Escribir resultado para que el auto-patcher lo lea
  const fs = require('fs');
  fs.writeFileSync('test-bug1-bug2-result.json', JSON.stringify(resultados, null, 2));
  log('✅ Resultado guardado en test-bug1-bug2-result.json');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
