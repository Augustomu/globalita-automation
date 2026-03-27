// ================================================================
// test-bug2-diag.js
// Diagnóstico BUG-2: abre el dropdown ··· en SalesNav y loguea
// EXACTAMENTE qué textos/hrefs aparecen — para saber el texto real
// de "Ver perfil de LinkedIn" en tu entorno.
//
// Uso:
//   node test-bug2-diag.js alejandro "https://www.linkedin.com/sales/lead/ACwAAAxxx..."
// ================================================================

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const SESSION_DIRS = {
  alejandro : path.resolve(__dirname, 'session'),
  david     : path.resolve(__dirname, 'david agente invitaciones'),
  francisco : path.resolve(__dirname, 'francisco agente invitaciones'),
};

const cuenta   = process.argv[2] || 'alejandro';
const LEAD_URL = process.argv[3];

if (!LEAD_URL) {
  console.error('❌ Uso: node test-bug2-diag.js alejandro "https://www.linkedin.com/sales/lead/ACwAAAxxx..."');
  process.exit(1);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg)  { console.log(`[${new Date().toISOString().slice(11,23)}] ${msg}`); }

async function main() {
  log('═'.repeat(60));
  log(`DIAGNÓSTICO BUG-2 | cuenta: ${cuenta}`);
  log(`Lead: ${LEAD_URL}`);
  log('═'.repeat(60));

  const browser = await chromium.launchPersistentContext(SESSION_DIRS[cuenta], {
    headless: false,
    viewport: { width: 1280, height: 860 },
  });

  try {
    const page = await browser.newPage();

    // 1. Navegar al lead
    log('Navegando...');
    await page.goto(LEAD_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector(
      'button[aria-label*="Guardar"], button[aria-label*="Save"], button[aria-label*="Salvar"], button[aria-label*="opciones"], button[aria-label*="acciones"]',
      { timeout: 12000 }
    ).catch(() => {});
    await delay(1500);

    // 2. Loguear TODOS los aria-labels de botones antes de abrir dropdown
    const ariaAntes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button[aria-label]'))
        .map(b => b.getAttribute('aria-label')).filter(Boolean)
    );
    log(`Botones aria-label en página (${ariaAntes.length}):`);
    ariaAntes.forEach((a, i) => log(`  [${i}] "${a}"`));

    // 3. Click en el botón ··· (el que sabemos que funciona: aria*="opciones")
    const SELECTORES = [
      'opciones', 'opções', 'acciones', 'ações', 'actions',
      'exceso de acciones', 'excess actions', 'excesso de ações',
      'More actions', 'More options',
    ];
    let clicked = false;
    for (const s of SELECTORES) {
      const loc = page.locator(`button[aria-label*="${s}"]`).first();
      if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
        log(`Click en aria*="${s}"`);
        await loc.click({ timeout: 3000 }).catch(() => {});
        await delay(1000);
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      log('❌ No se encontró botón ··· — loguear todos los botones visibles:');
      const btns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .filter(b => b.getBoundingClientRect().width > 0)
          .map(b => ({ aria: b.getAttribute('aria-label'), text: (b.innerText||'').trim().slice(0,40) }))
      );
      btns.forEach((b, i) => log(`  [${i}] aria="${b.aria}" text="${b.text}"`));
      return;
    }

    // 4. Capturar TODO el contenido del dropdown
    await delay(500);
    const dropdown = await page.evaluate(() => {
      const resultado = {
        artdeco : [],
        menuitem: [],
        li      : [],
        links   : [],
        todoTexto: '',
      };

      // artdeco dropdown
      const d = document.querySelector('.artdeco-dropdown__content');
      if (d) {
        resultado.artdeco = Array.from(d.querySelectorAll('*'))
          .map(e => ({
            tag  : e.tagName,
            text : (e.innerText || e.textContent || '').trim().slice(0, 80),
            href : e.getAttribute('href') || '',
            role : e.getAttribute('role') || '',
          }))
          .filter(e => e.text && e.text.length > 0 && e.text.length < 100)
          .slice(0, 20);
        resultado.todoTexto = d.innerText;
      }

      // role=menuitem
      resultado.menuitem = Array.from(document.querySelectorAll('[role="menuitem"]'))
        .map(e => ({
          text: (e.innerText || e.textContent || '').trim().slice(0, 80),
          href: e.getAttribute('href') || '',
        }))
        .filter(e => e.text);

      // li visibles en dropdowns
      resultado.li = Array.from(document.querySelectorAll('ul li'))
        .filter(li => {
          const r = li.getBoundingClientRect();
          return r.width > 0 && r.y > 50 && r.y < 860;
        })
        .map(li => ({
          text: (li.innerText || li.textContent || '').trim().slice(0, 80),
          href: (li.querySelector('a') || {}).href || '',
        }))
        .filter(e => e.text && e.text.length < 100)
        .slice(0, 20);

      // links con linkedin.com/in/
      resultado.links = Array.from(document.querySelectorAll('a[href*="linkedin.com/in/"]'))
        .filter(a => !a.href.includes('/sales/'))
        .map(a => ({ href: a.href, text: (a.innerText || a.textContent || '').trim().slice(0,60) }));

      return resultado;
    });

    log('\n── ARTDECO DROPDOWN ──');
    if (dropdown.artdeco.length > 0) {
      dropdown.artdeco.forEach((e, i) => log(`  [${i}] <${e.tag}> role="${e.role}" text="${e.text}" href="${e.href}"`));
    } else {
      log('  (vacío)');
    }

    log('\n── TEXTO COMPLETO DROPDOWN ──');
    log(dropdown.todoTexto || '  (vacío)');

    log('\n── ROLE=MENUITEM ──');
    if (dropdown.menuitem.length > 0) {
      dropdown.menuitem.forEach((e, i) => log(`  [${i}] text="${e.text}" href="${e.href}"`));
    } else {
      log('  (vacío)');
    }

    log('\n── LI VISIBLES ──');
    if (dropdown.li.length > 0) {
      dropdown.li.forEach((e, i) => log(`  [${i}] text="${e.text}" href="${e.href}"`));
    } else {
      log('  (vacío)');
    }

    log('\n── LINKS linkedin.com/in/ EN PÁGINA ──');
    if (dropdown.links.length > 0) {
      dropdown.links.forEach((e, i) => log(`  [${i}] href="${e.href}" text="${e.text}"`));
    } else {
      log('  (ninguno)');
    }

    // 5. Screenshot del estado del dropdown
    await page.screenshot({ path: 'bug2-diag-screenshot.png', fullPage: false });
    log('\n📸 Screenshot guardado: bug2-diag-screenshot.png');

    // 6. Guardar resultado JSON
    fs.writeFileSync('test-bug2-diag-result.json', JSON.stringify({
      ariaAntes, dropdown
    }, null, 2));
    log('✅ Resultado guardado: test-bug2-diag-result.json');

    log('\n' + '═'.repeat(60));
    log('PEGAME TODO ESTE OUTPUT + el screenshot a Claude');
    log('═'.repeat(60));

    await delay(3000);

  } catch (err) {
    log(`ERROR: ${err.message}`);
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
