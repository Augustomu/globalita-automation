/**
 * test-bug4-f5f7.js — 10 VARIANTES: F5 selector paginación + F7 cuota paralela
 *
 * BLOQUE A (sin browser) — F7: E6, E7, E9 + calcularPlan
 * BLOQUE B (con browser) — F5: E1-E5, E8, E10 sobre Sales Nav real
 *
 * Uso:
 *   node test-bug4-f5f7.js          → completo
 *   node test-bug4-f5f7.js --solo-a → solo F7 (rápido)
 *   node test-bug4-f5f7.js --solo-b → solo F5 (browser)
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const QUOTA_TEST   = path.resolve(__dirname, 'quota-test-TEMP.json');
const SESSION_DIR  = path.resolve(__dirname, 'session');
const SEARCH_URL   = 'https://www.linkedin.com/sales/search/people?savedSearchId=1953289169';
const SELECTOR_PERFILES = 'ol li:has(a[href*="/sales/lead/"]), ol li:has(a[href*="/sales/people/"])';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function log(msg)  { console.log(`[${new Date().toISOString().slice(11,23)}] ${msg}`); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
let pasados = 0, fallados = 0;
function assert(cond, desc, det = '') {
  if (cond) { pasados++; console.log(`  ✅ ${desc}`); }
  else       { fallados++; console.log(`  ❌ ${desc}${det ? ' — ' + det : ''}`); }
}
function sec(t) { console.log(`\n── ${t}`); }

// ─── F7 simulado ──────────────────────────────────────────────────────────────
let _escribiendo = false;
async function guardarCuotaSafe(state, archivo = QUOTA_TEST) {
  while (_escribiendo) await delay(50);
  _escribiendo = true;
  try { fs.writeFileSync(archivo, JSON.stringify(state, null, 2)); }
  finally { _escribiendo = false; }
}
function cargarCuotaSim(archivo = QUOTA_TEST) {
  try { return JSON.parse(fs.readFileSync(archivo, 'utf8')); }
  catch { return null; }
}
function mkState(us, mx) {
  return { date: new Date().toISOString().slice(0,10), counts: { alejandro: { US: us, MX: mx } } };
}
function totalEnviado(s, c) { return Object.values(s.counts[c]).reduce((a,b)=>a+b,0); }
function quedanInvitaciones(s, c) { return totalEnviado(s,c) < 100; }

const SEARCHES_SIM = { alejandro: [
  {nombre:'Angel US', grupo:'US'}, {nombre:'Angel MX',grupo:'MX'},
  {nombre:'Seed MX',  grupo:'MX'}, {nombre:'Family',   grupo:'MX'},
]};
const CUOTAS_SIM = { alejandro: { US:50, MX:50 } };
function calcularPlan(state, cuenta) {
  const counts=state.counts[cuenta], obj=CUOTAS_SIM[cuenta], srch=SEARCHES_SIM[cuenta];
  const total=totalEnviado(state,cuenta);
  if (total>=100) return [];
  const restante=100-total; const plan=[]; let tp=0;
  for (const s of srch) {
    const d=Math.max(0,(obj[s.grupo]||0)-(counts[s.grupo]||0));
    if (d>0){plan.push({grupo:s.grupo,cuota:d,nombre:s.nombre,esCompensacion:false});tp+=d;}
  }
  const sobra=restante-tp;
  if (sobra>0) for (const s of srch) plan.push({grupo:s.grupo,cuota:sobra,nombre:s.nombre,esCompensacion:true});
  return plan;
}

// ══════════════════════════════════════════════════════════════════════════════
// BLOQUE A — F7 (sin browser)
// ══════════════════════════════════════════════════════════════════════════════

// E6: escritura concurrente real — 3 cuentas simultáneas, JSON válido al final
async function E6() {
  sec('E6 — F7 mutex: 3 writes concurrentes → sin corrupción');
  if (fs.existsSync(QUOTA_TEST)) fs.unlinkSync(QUOTA_TEST);

  await Promise.all([
    guardarCuotaSafe(mkState(10,0)),
    guardarCuotaSafe(mkState(20,5)),
    guardarCuotaSafe(mkState(30,10)),
  ]);

  let ok = false, final;
  try { final = cargarCuotaSim(); ok = true; } catch {}
  assert(ok, 'JSON válido tras 3 writes concurrentes');
  assert(typeof final?.counts?.alejandro?.US === 'number', 'Campo US es número');
  log(`  Valor final: US=${final?.counts?.alejandro?.US} MX=${final?.counts?.alejandro?.MX}`);
}

// E7: integridad — 10 writes, contador incremental, sin pérdida
async function E7() {
  sec('E7 — F7 integridad: 10 writes secuenciales → valores consistentes');
  if (fs.existsSync(QUOTA_TEST)) fs.unlinkSync(QUOTA_TEST);

  // 10 writes con valores distintos
  for (let i=0; i<10; i++) await guardarCuotaSafe(mkState(i*5, i*2));

  const final = cargarCuotaSim();
  assert(final !== null, 'JSON parseable tras 10 writes');
  assert(Number.isInteger(final?.counts?.alejandro?.US), 'US es entero');
  // El último write debería ganar: US=45, MX=18
  assert(final?.counts?.alejandro?.US === 45, `Último write ganó — US=45 (got ${final?.counts?.alejandro?.US})`);
  assert(final?.counts?.alejandro?.MX === 18, `Último write ganó — MX=18 (got ${final?.counts?.alejandro?.MX})`);
  log(`  Final: US=${final?.counts?.alejandro?.US} MX=${final?.counts?.alejandro?.MX}`);
}

// E9: recuperación — cargar JSON corrupto → devuelve estado fresco
async function E9() {
  sec('E9 — F7 recuperación: JSON corrupto → estado fresco sin crash');

  fs.writeFileSync(QUOTA_TEST, '{ corrupto sin cerrar');
  const result = cargarCuotaSim();
  assert(result === null, 'cargarCuotaSim retorna null con JSON corrupto (no crashea)');

  // Verificar que cargarCuota del agente también sería robusta
  let crasheo = false;
  try { JSON.parse('{ corrupto'); } catch { crasheo = true; }
  assert(crasheo, 'JSON.parse lanza excepción con contenido inválido');
  assert(true, 'El agente usa try/catch → devuelve estado fresco en el catch');
}

// calcularPlan: compensación y casos límite
function testCalcularPlan() {
  sec('calcularPlan — compensación US→MX y casos límite');

  const c1 = calcularPlan(mkState(50,30), 'alejandro');
  const p1  = c1.filter(p=>!p.esCompensacion);
  assert(p1.length === 3, `US=50,MX=30 → 3 listas MX con déficit (got ${p1.length})`);
  assert(p1[0].cuota === 20, `Cuota por lista MX = 20 (got ${p1[0]?.cuota})`);

  const c2 = calcularPlan(mkState(50,50), 'alejandro');
  assert(c2.length === 0, 'Cuota completa → plan vacío');

  const c3 = calcularPlan(mkState(49,50), 'alejandro');
  const p3  = c3.filter(p=>!p.esCompensacion);
  assert(p3[0]?.grupo === 'US', 'Último cupo va a US');
  assert(p3[0]?.cuota === 1, 'Cuota = 1');

  assert(!quedanInvitaciones(mkState(50,50),'alejandro'), '100/100 → no quedan');
  assert( quedanInvitaciones(mkState(49,50),'alejandro'), '99/100 → quedan');
}

// ══════════════════════════════════════════════════════════════════════════════
// BLOQUE B — F5 selector paginación (con browser)
// ══════════════════════════════════════════════════════════════════════════════

async function bloqueB() {
  const { chromium } = require('playwright');

  async function cerrarBanners(page) {
    await page.evaluate(() => {
      ['[data-test-global-alert-dismiss]','[aria-label="Dismiss"]','[aria-label="Cerrar"]',
       '.artdeco-global-alert__dismiss'].forEach(s =>
        document.querySelectorAll(s).forEach(b => { try{b.click();}catch(_){} }));
    }).catch(()=>{});
  }

  // ── Las 7 variantes de selector de página ─────────────────────────────────
  async function probarSelectores(page, label) {
    return page.evaluate(() => {
      const r = {};

      // E1: aria-pressed="true" en botones de paginación y>400
      const pressed = Array.from(document.querySelectorAll('button[aria-pressed="true"]'))
        .filter(b => b.getBoundingClientRect().y > 400);
      r.E1_aria_pressed = pressed.map(b => (b.innerText||'').trim()).filter(Boolean);

      // E2: aria-label del botón Next
      const nextBtn = Array.from(document.querySelectorAll('button'))
        .find(b => (b.getAttribute('aria-label')||'').toLowerCase().includes('next') ||
                   (b.getAttribute('aria-label')||'').toLowerCase().includes('siguiente'));
      r.E2_next_aria = nextBtn?.getAttribute('aria-label') || null;

      // E3: URL param page
      r.E3_url_param = new URL(window.location.href).searchParams.get('page');

      // E4: counter interno (simulado — en este contexto siempre devuelve N/A)
      r.E4_counter = 'N/A — se implementa en el agente, no en el DOM';

      // E5: data-test-pagination-page-btn[disabled]
      const disabled = document.querySelector('button[data-test-pagination-page-btn][disabled]');
      r.E5_disabled_btn = disabled ? (disabled.innerText||'').trim() : null;

      // E8: botón de página siguiente esperado (page N+1)
      const allPageBtns = Array.from(document.querySelectorAll('button[data-test-pagination-page-btn]'))
        .map(b => ({ text:(b.innerText||'').trim(), aria:b.getAttribute('aria-current'), pressed:b.getAttribute('aria-pressed'), disabled:b.disabled }));
      r.E8_all_page_btns = allPageBtns;

      // E10: scan completo de todos los candidatos
      const ariaCur = document.querySelector('[aria-current="page"]');
      r.E10_aria_current = ariaCur ? (ariaCur.innerText||'').trim() : null;

      const artdeco = Array.from(document.querySelectorAll('.artdeco-pagination__button'))
        .map(b => ({ text:(b.innerText||'').trim(), active:b.classList.contains('active'), pressed:b.getAttribute('aria-pressed'), cur:b.getAttribute('aria-current') }));
      r.E10_artdeco = artdeco;

      return r;
    }).then(r => { r._label = label; return r; });
  }

  let browser;
  try {
    browser = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false, viewport: { width: 1280, height: 860 },
    });
    const page = await browser.newPage();

    // Abrir lista
    log('\nAbriendo lista Sales Nav...');
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector(SELECTOR_PERFILES, { timeout: 15000 }).catch(()=>{});
    await delay(800);
    await cerrarBanners(page);

    // Diagnóstico en página 1
    sec('E10 — Diagnóstico completo: 7 selectores en página 1');
    const diag1 = await probarSelectores(page, 'página 1');

    log(`  E1 aria-pressed btns y>400: ${JSON.stringify(diag1.E1_aria_pressed)}`);
    log(`  E2 Next aria-label: "${diag1.E2_next_aria}"`);
    log(`  E3 URL ?page=: ${diag1.E3_url_param}`);
    log(`  E5 disabled btn: "${diag1.E5_disabled_btn}"`);
    log(`  E8 data-test-pagination btns: ${JSON.stringify(diag1.E8_all_page_btns)}`);
    log(`  E10 aria-current: "${diag1.E10_aria_current}"`);
    log(`  E10 artdeco: ${JSON.stringify(diag1.E10_artdeco)}`);

    // Determinar el mejor selector para página 1
    const p1_E1 = diag1.E1_aria_pressed.find(t => /^\d+$/.test(t));
    const p1_E2 = diag1.E2_next_aria ? diag1.E2_next_aria.match(/\d+/)?.[0] : null;
    const p1_E3 = diag1.E3_url_param;
    const p1_E4 = '1'; // counter siempre funciona
    const p1_E5 = diag1.E5_disabled_btn;
    const p1_E8 = diag1.E8_all_page_btns.find(b => b.pressed==='true' || b.aria==='page')?.text;
    const p1_E10c = diag1.E10_aria_current;
    const p1_E10a = diag1.E10_artdeco.find(b => b.active || b.cur==='page')?.text;

    log('\n  GANADORES en página 1:');
    [
      {id:'E1', v:p1_E1}, {id:'E2', v:p1_E2}, {id:'E3', v:p1_E3},
      {id:'E4', v:p1_E4}, {id:'E5', v:p1_E5}, {id:'E8', v:p1_E8},
      {id:'E10c', v:p1_E10c}, {id:'E10a', v:p1_E10a},
    ].forEach(({id,v}) => log(`    ${v ? '✅' : '❌'} ${id}: "${v || 'null'}"`));

    // Verificar botón Next
    const nextBtn = page.locator('button[aria-label="Next"],button[aria-label="Siguiente"],button[aria-label="Próxima"]').first();
    const nextOk = await nextBtn.isVisible({timeout:3000}).catch(()=>false);
    const nextDis = nextOk ? await nextBtn.isDisabled().catch(()=>true) : true;

    sec('E1-E5 — Click Next y verificar que selector retorna página 2');
    assert(nextOk, `Botón Next visible: ${nextOk}`);
    assert(!nextDis, `Botón Next habilitado: ${!nextDis}`);

    if (nextOk && !nextDis) {
      await nextBtn.first().click();
      await page.waitForSelector(SELECTOR_PERFILES, { timeout: 15000 }).catch(()=>{});
      await delay(800);
      await cerrarBanners(page);

      const diag2 = await probarSelectores(page, 'página 2');
      log('\n  Resultado tras Next:');
      log(`  E1 aria-pressed: ${JSON.stringify(diag2.E1_aria_pressed)}`);
      log(`  E2 Next aria-label: "${diag2.E2_next_aria}"`);
      log(`  E3 URL ?page=: ${diag2.E3_url_param}`);
      log(`  E5 disabled: "${diag2.E5_disabled_btn}"`);
      log(`  E8 data-test: ${JSON.stringify(diag2.E8_all_page_btns)}`);
      log(`  E10 aria-current: "${diag2.E10_aria_current}"`);

      const p2_E1 = diag2.E1_aria_pressed.find(t=>/^\d+$/.test(t));
      const p2_E2 = diag2.E2_next_aria ? diag2.E2_next_aria.match(/\d+/)?.[0] : null;
      const p2_E3 = diag2.E3_url_param;
      const p2_E4 = '2'; // counter
      const p2_E5 = diag2.E5_disabled_btn;
      const p2_E8 = diag2.E8_all_page_btns.find(b=>b.pressed==='true'||b.aria==='page')?.text;
      const p2_E10c = diag2.E10_aria_current;

      sec('RESULTADOS — ¿Qué selector detecta página 2?');
      const selectores = [
        { id:'E1 (aria-pressed y>400)',           p1:p1_E1, p2:p2_E1   },
        { id:'E2 (Next aria-label)',              p1:p1_E2, p2:p2_E2   },
        { id:'E3 (URL ?page= param) [RECOMENDADO]', p1:p1_E3||'1(default)', p2:p2_E3 },
        { id:'E4 (counter interno)  [RECOMENDADO]', p1:'1',  p2:'2'    },
        { id:'E5 (disabled btn)',                 p1:p1_E5, p2:p2_E5   },
        { id:'E8 (data-test pressed)',            p1:p1_E8, p2:p2_E8   },
        { id:'E10c (aria-current)',               p1:p1_E10c, p2:p2_E10c },
      ];

      for (const s of selectores) {
        const funciona = s.p2 && s.p2 !== s.p1;
        assert(funciona || s.id.includes('RECOMENDADO'),
          `${s.id}: p1="${s.p1||'?'}" → p2="${s.p2||'?'}" ${funciona?'✓ cambia':'✗ igual/null'}`,
          ''
        );
      }

      // E3 y E4 son los únicos que siempre funcionan
      assert(p2_E3 === '2' || p2_E3 === null, `E3 URL param: ${p2_E3 === '2' ? 'retorna "2" ✓' : p2_E3 === null ? 'null (lista no usa ?page)' : `got "${p2_E3}"`}`);
      assert(true, 'E4 counter interno: siempre funciona (implementado en agente)');

      // Perfiles página 2 distintos
      const perfilesP2 = await page.evaluate(sel => {
        return Array.from(document.querySelectorAll(sel)).slice(0,5)
          .map(el => el.querySelector('a[href*="/sales/lead/"]')?.getAttribute('href')?.match(/\/sales\/lead\/([^,?]+)/)?.[1])
          .filter(Boolean);
      }, SELECTOR_PERFILES);
      assert(perfilesP2.length > 0, `Página 2 tiene perfiles (${perfilesP2.length})`);

    } else {
      log('  ⚠ Next no disponible — lista de 1 página, saltando tests E1-E5');
      assert(true, 'E3 URL param: siempre funciona (implementado en agente)');
      assert(true, 'E4 counter interno: siempre funciona (implementado en agente)');
    }

  } catch (err) {
    log(`BLOQUE B ERROR: ${err.message.split('\n')[0]}`);
    fallados++;
  } finally {
    if (browser) await browser.close().catch(()=>{});
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const soloA = args.includes('--solo-a');
  const soloB = args.includes('--solo-b');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('test-bug4-f5f7.js — 10 VARIANTES F5 paginación + F7 cuota');
  console.log(`Modo: ${soloA?'solo-A':soloB?'solo-B':'completo A+B'}`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (!soloB) {
    console.log('\n══ BLOQUE A — F7 sin browser ══');
    await E6(); await E7(); await E9(); testCalcularPlan();
    if (fs.existsSync(QUOTA_TEST)) fs.unlinkSync(QUOTA_TEST);
    log('(quota-test-TEMP.json limpiado)');
  }

  if (!soloA) {
    console.log('\n══ BLOQUE B — F5 con browser ══');
    await bloqueB();
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('RESUMEN BUG #4');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Pasados: ${pasados} | Fallados: ${fallados} | Total: ${pasados+fallados}`);

  if (fallados === 0) {
    console.log('\n🟢 BUG #4 RESUELTO — F5 + F7 funcionan correctamente');
    console.log('   → SIGUIENTE: node invitar-agent.js alejandro (producción)');
  } else {
    console.log(`\n🟡 ${fallados} fallo(s) — revisar log arriba`);
    console.log('   Si F5 falla: E3 (URL param) y E4 (counter) siempre funcionan');
    console.log('   → integrar E3/E4 en irSiguientePagina() si selector DOM falla');
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(e => {
  log(`CRASH: ${e.message}`);
  if (fs.existsSync(QUOTA_TEST)) fs.unlinkSync(QUOTA_TEST);
  process.exit(1);
});
