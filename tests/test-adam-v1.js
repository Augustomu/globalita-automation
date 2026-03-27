/**
 * test-adam-v1.js — TEST FOCALIZADO: Adam Besvinick + modal email
 *
 * PERFIL: https://www.linkedin.com/in/besvinick/
 * CUENTA: Alejandro (session/)
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TABLA DE ERRORES CONFIRMADOS EN F6 PARA ESTE PERFIL
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ERROR 1 — M1 y=984 (v6 T1 en agente anterior)
 *   Causa:   M1 buscaba "Conectar" en todos los ul de la página sin límite de y.
 *            El sidebar "Más perfiles para ti" tiene "Conectar" en y=984 (fuera
 *            del viewport). El click fue al sidebar, no al dropdown.
 *   Fix:     Limitar búsqueda a y > 50 && y < 700.
 *
 * ERROR 2 — Modal no apareció (1.2s) (log 17:16:40→41)
 *   Causa:   `emailInput.isVisible({ timeout: 5000 })` en Playwright NO espera.
 *            `isVisible()` ignora el timeout y retorna false inmediatamente si
 *            el elemento no está en DOM en ese instante. El modal de email SÍ
 *            aparece pero el código lo revisa antes de que llegue.
 *   Fix:     Usar waitForSelector con timeout real antes de revisar el input.
 *
 * ERROR 3 — getByText.last() toma el botón directo (ERROR R10)
 *   Causa:   Adam tiene botón "Conectar" directo en el perfil (blue button) Y
 *            "Conectar" en el dropdown de "Más". getByText.last() toma el último
 *            en DOM que puede ser el directo del sidebar. El directo abre el modal
 *            correctamente pero luego el código no lo detecta (ERROR 2).
 *   Fix:     Usar el botón "Conectar" directo cuando está visible — es más simple
 *            y más rápido que pasar por "Más".
 *
 * ERROR 4 — Target page has been closed (Russell Deakin)
 *   Causa:   El fallback abría un browser separado para los pendientes del disco.
 *            Al fallar el primero, el browser cerraba. El segundo perfil intentaba
 *            page.evaluate en una página ya cerrada.
 *   Fix:     El fallback no abre browser separado — los pendientes se procesan
 *            en el browser principal del flujo.
 *
 * ── 10 MÉTODOS A TESTEAR ──────────────────────────────────────────────────────
 * M1  Conectar directo (visible en perfil) + waitForSelector modal
 * M2  Más → M1 coords y<700 + waitForSelector modal
 * M3  Más → M1 coords y<700 + page.waitForSelector con email Y send
 * M4  Conectar directo + detectarModal con polling cada 300ms
 * M5  Más → Tab hasta Conectar → Enter + waitForSelector
 * M6  Conectar directo + evaluate loop hasta input visible
 * M7  Más → artdeco CAPA1 + waitForSelector 8s
 * M8  Más → dispatchEvent en li + waitForSelector
 * M9  Conectar directo + Playwright locator.waitFor
 * M10 Más → mouse.click y<700 + waitForSelector email OR send
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Uso:
 *   node test-adam-v1.js
 */

var playwright = require('playwright');
var chromium = playwright.chromium;
var path = require('path');

var SESSION_DIR  = path.resolve(__dirname, 'session');
var LINKEDIN_URL = 'https://www.linkedin.com/in/besvinick/';

var EMAIL    = 'augusto@globalita.io';
var MENSAJE  = 'Nice to meet you! I\'m Alejandro, an Artificial Intelligence engineer and former Technology Director of the Mexican Federal Police. I\'m expanding my network to meet new people and exchange ideas about the market.';

function log(msg) {
  console.log('[' + new Date().toISOString().slice(11, 23) + '] ' + msg);
}
function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function cerrarBanners(page) {
  await page.evaluate(function() {
    ['[data-test-global-alert-dismiss]','[aria-label="Dismiss"]','[aria-label="Cerrar"]',
     '.artdeco-global-alert__dismiss','.global-alert-banner__dismiss']
      .forEach(function(s) {
        document.querySelectorAll(s).forEach(function(b) { try { b.click(); } catch(_) {} });
      });
  }).catch(function() {});
}

async function cargarPagina(page) {
  log('Cargando ' + LINKEDIN_URL);
  await page.goto(LINKEDIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  // waitForSelector del botón Más o Conectar — señal real de carga
  await page.waitForSelector(
    'button[aria-label*="acciones"], button[aria-label*="actions"], button:has-text("Conectar"), button:has-text("Connect")',
    { timeout: 15000 }
  ).catch(function() {});
  await cerrarBanners(page);
  await delay(500);
}

// ─── FIX ERROR 2: detectar modal con waitForSelector real ─────────────────────
// NO usar isVisible() — ignora timeout y retorna false inmediatamente
// Usar waitForSelector que sí espera hasta el timeout
async function detectarModal(page, timeoutMs) {
  timeoutMs = timeoutMs || 8000;
  log('  → detectarModal (waitForSelector ' + timeoutMs + 'ms)...');

  // Esperar email input O botón de envío — lo que aparezca primero
  var sel = 'input[type="email"], input[name="email"], ' +
            'button:has-text("Send invitation"), button:has-text("Enviar invitación"), ' +
            'button:has-text("Enviar convite"), button:has-text("Enviar"), ' +
            'textarea';

  var found = await page.waitForSelector(sel, { timeout: timeoutMs }).catch(function() { return null; });
  if (!found) {
    var btnsVis = await page.evaluate(function() {
      return Array.from(document.querySelectorAll('button')).filter(function(b) {
        var r = b.getBoundingClientRect(); return r.width > 0 && r.y > 0 && r.y < 700;
      }).map(function(b) { return (b.textContent || '').trim().slice(0,25); }).filter(Boolean).slice(0,6);
    });
    log('  ❌ Modal no apareció | btns: ' + JSON.stringify(btnsVis));
    return null;
  }

  // Identificar variante
  var variante = await page.evaluate(function() {
    if (document.querySelector('input[type="email"]') &&
        document.querySelector('input[type="email"]').getBoundingClientRect().width > 0) return 'A-email';
    var btns = Array.from(document.querySelectorAll('button'));
    if (btns.find(function(b) {
      var t = (b.textContent||'').trim();
      return t.includes('Añadir una nota')||t.includes('Add a note')||t.includes('Adicionar nota');
    })) return 'B-nota';
    if (document.querySelector('textarea') &&
        document.querySelector('textarea').getBoundingClientRect().width > 0) return 'C-textarea';
    if (btns.find(function(b) {
      var t = (b.textContent||'').trim();
      return t==='Enviar'||t==='Send'||t==='Enviar invitación'||t==='Send invitation';
    })) return 'C-send';
    return 'desconocido';
  });
  log('  ✅ Modal variante: ' + variante);
  return variante;
}

// ─── Fill email + nota + enviar ───────────────────────────────────────────────
async function completarModal(page, variante) {
  if (variante === 'A-email') {
    log('  → fill email: ' + EMAIL);
    var emailLoc = page.locator('input[type="email"], input[name="email"]').first();
    await emailLoc.click().catch(function(){});
    await delay(200);
    await emailLoc.fill(EMAIL).catch(async function(e) {
      log('  fill catch — evaluate: ' + e.message.split('\n')[0]);
      await page.evaluate(function(em) {
        var inp = document.querySelector('input[type="email"]');
        if (inp) { inp.focus(); inp.value = em; ['input','change'].forEach(function(ev) { inp.dispatchEvent(new Event(ev,{bubbles:true})); }); }
      }, EMAIL);
    });
    await delay(400);
    var val = await emailLoc.inputValue().catch(function(){ return ''; });
    log('  email: "' + val + '" ' + (val===EMAIL?'✅':'❌'));
    if (val !== EMAIL) return '❌ email-no-cargó';
  }

  // Expandir nota
  var addNota = page.getByText('Añadir una nota',{exact:true})
    .or(page.getByText('Add a note',{exact:true}))
    .or(page.getByText('Adicionar nota',{exact:true})).first();
  if (await addNota.isVisible().catch(function(){ return false; })) {
    await addNota.click();
    await delay(600);
  }

  // Fill nota
  var ta = page.locator('textarea').first();
  if (await ta.isVisible().catch(function(){ return false; })) {
    await ta.click();
    await delay(200);
    await ta.fill(MENSAJE).catch(async function() {
      await page.evaluate(function(txt) {
        var el = document.querySelector('textarea');
        if (el) { el.focus(); document.execCommand('selectAll',false,null); document.execCommand('insertText',false,txt); }
      }, MENSAJE);
    });
    await delay(300);
    var taVal = await ta.inputValue().catch(function(){ return ''; });
    log('  nota: ' + taVal.length + ' chars ' + (taVal.length > 0 ? '✅' : '❌'));
  }

  // Enviar — NO enviar de verdad, solo verificar que el botón existe
  var sendBtn = page.locator('button:has-text("Send invitation")')
    .or(page.locator('button:has-text("Enviar invitación")'))
    .or(page.locator('button:has-text("Enviar convite")'))
    .or(page.locator('button:has-text("Enviar")'))
    .or(page.locator('button:has-text("Send")')).first();
  var sendVisible = await sendBtn.isVisible().catch(function(){ return false; });
  log('  botón Enviar visible: ' + sendVisible);

  if (!sendVisible) return '❌ send-no-visible';

  // MODO TEST — no enviar
  // await sendBtn.click();
  return '✅ listo-para-enviar (modo test — no enviado)';
}

// ─── Reset entre métodos ──────────────────────────────────────────────────────
async function reset(page) {
  await page.keyboard.press('Escape').catch(function(){});
  await delay(300);
  await page.keyboard.press('Escape').catch(function(){});
  await delay(300);
  await page.evaluate(function(){ window.scrollTo(0,0); });
  await delay(400);
  await cerrarBanners(page);
  await delay(300);
}

// ══════════════════════════════════════════════════════════════════════════════
// 10 MÉTODOS
// ══════════════════════════════════════════════════════════════════════════════

// M1: Botón "Conectar" directo visible en perfil + waitForSelector modal
async function M1(page) {
  log('M1: Conectar directo + waitForSelector');
  var btn = page.locator('button:has-text("Conectar"), button:has-text("Connect"), button:has-text("Ligar")').first();
  var visible = await btn.isVisible().catch(function(){ return false; });
  log('  Conectar directo visible: ' + visible);
  if (!visible) return null;
  await btn.click();
  var variante = await detectarModal(page, 8000);
  if (!variante) return null;
  return completarModal(page, variante);
}

// M2: Más → coords y<700 (FIX ADAM) + waitForSelector modal
async function M2(page) {
  log('M2: Más → M1 coords y<700 + waitForSelector');
  await page.evaluate(function(){ window.scrollTo(0,400); });
  await delay(300);
  var masBbox = await page.evaluate(function() {
    var todos = Array.from(document.querySelectorAll('button')).filter(function(b) {
      var a = (b.getAttribute('aria-label')||'').toLowerCase();
      return a.includes('acciones')||a.includes('actions');
    });
    var t = todos.find(function(b){ var r=b.getBoundingClientRect(); return r.y>=50&&r.y<=700&&r.width>0; })
          || todos.find(function(b){ var r=b.getBoundingClientRect(); return r.y>0&&r.width>0; });
    if (!t) return null;
    var r = t.getBoundingClientRect();
    return {x:r.x,y:r.y,w:r.width,h:r.height};
  });
  if (!masBbox) { log('  Más no encontrado'); return null; }
  log('  Más y=' + Math.round(masBbox.y) + ' → click');
  await page.mouse.click(masBbox.x+masBbox.w/2, masBbox.y+masBbox.h/2);
  await delay(600);

  // Conectar en dropdown con y<700 (FIX ADAM y=984)
  var cBbox = await page.evaluate(function() {
    var d1 = document.querySelector('.artdeco-dropdown__content');
    if (d1) {
      var r1 = d1.getBoundingClientRect();
      if (r1.width>0&&r1.height>0&&r1.y>0) {
        var el = Array.from(d1.querySelectorAll('*')).find(function(e) {
          var t=(e.innerText||'').trim(), ry=e.getBoundingClientRect().y;
          return (t==='Conectar'||t==='Connect'||t==='Ligar')&&e.getBoundingClientRect().width>0&&ry>50&&ry<700;
        });
        if (el) { var rc=el.getBoundingClientRect(); return {x:rc.x,y:rc.y,w:rc.width,h:rc.height,via:'artdeco'}; }
      }
    }
    for (var i=0; i<document.querySelectorAll('ul').length; i++) {
      var ul=document.querySelectorAll('ul')[i];
      var r=ul.getBoundingClientRect();
      if (r.width<50||r.y<50||r.y>700) continue;
      var el2=Array.from(ul.querySelectorAll('*')).find(function(e) {
        var t=(e.innerText||'').trim(), ry=e.getBoundingClientRect().y;
        return (t==='Conectar'||t==='Connect'||t==='Ligar')&&e.getBoundingClientRect().width>0&&ry>50&&ry<700;
      });
      if (el2) { var rc2=el2.getBoundingClientRect(); return {x:rc2.x,y:rc2.y,w:rc2.width,h:rc2.height,via:'ul'}; }
    }
    return null;
  });
  if (!cBbox) { log('  Conectar no encontrado en dropdown y<700'); return null; }
  log('  Conectar via=' + cBbox.via + ' y=' + Math.round(cBbox.y));
  await page.mouse.click(cBbox.x+cBbox.w/2, cBbox.y+cBbox.h/2);
  var variante = await detectarModal(page, 8000);
  if (!variante) return null;
  return completarModal(page, variante);
}

// M3: Más → coords y<700 + waitForSelector email OR send (más robusto)
async function M3(page) {
  log('M3: Más → coords y<700 + waitForSelector email|send');
  var res = await M2_abrirDropdownYConectar(page);
  if (!res) return null;
  // waitForSelector alternativo: email o botón enviar
  var found = await page.waitForSelector(
    'input[type="email"], button:has-text("Send invitation"), button:has-text("Enviar invitación"), button:has-text("Enviar")',
    { timeout: 8000 }
  ).catch(function(){ return null; });
  if (!found) { log('  M3: modal no detectado'); return null; }
  var variante = await detectarModal(page, 2000);
  if (!variante) return null;
  return completarModal(page, variante);
}

// Helper compartido para M3
async function M2_abrirDropdownYConectar(page) {
  await page.evaluate(function(){ window.scrollTo(0,400); });
  await delay(300);
  var masBbox = await page.evaluate(function() {
    var todos = Array.from(document.querySelectorAll('button')).filter(function(b) {
      var a=(b.getAttribute('aria-label')||'').toLowerCase();
      return a.includes('acciones')||a.includes('actions');
    });
    var t = todos.find(function(b){ var r=b.getBoundingClientRect(); return r.y>=50&&r.y<=700&&r.width>0; })
          || todos.find(function(b){ var r=b.getBoundingClientRect(); return r.y>0&&r.width>0; });
    if (!t) return null;
    var r=t.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};
  });
  if (!masBbox) return null;
  await page.mouse.click(masBbox.x+masBbox.w/2, masBbox.y+masBbox.h/2);
  await delay(600);
  var cBbox = await page.evaluate(function() {
    for (var i=0; i<document.querySelectorAll('ul').length; i++) {
      var ul=document.querySelectorAll('ul')[i];
      var r=ul.getBoundingClientRect();
      if (r.width<50||r.y<50||r.y>700) continue;
      var el=Array.from(ul.querySelectorAll('*')).find(function(e) {
        var t=(e.innerText||'').trim(),ry=e.getBoundingClientRect().y;
        return (t==='Conectar'||t==='Connect'||t==='Ligar')&&e.getBoundingClientRect().width>0&&ry>50&&ry<700;
      });
      if (el) { var rc=el.getBoundingClientRect(); return {x:rc.x,y:rc.y,w:rc.width,h:rc.height}; }
    }
    return null;
  });
  if (!cBbox) return null;
  await page.mouse.click(cBbox.x+cBbox.w/2, cBbox.y+cBbox.h/2);
  return true;
}

// M4: Conectar directo + polling evaluate loop hasta input visible
async function M4(page) {
  log('M4: Conectar directo + evaluate loop polling');
  var btn = page.locator('button:has-text("Conectar"), button:has-text("Connect")').first();
  if (!await btn.isVisible().catch(function(){ return false; })) return null;
  await btn.click();
  // Polling directo en el DOM, no isVisible
  var inicio = Date.now();
  var variante = null;
  while (Date.now()-inicio < 8000 && !variante) {
    variante = await page.evaluate(function() {
      var email = document.querySelector('input[type="email"]');
      if (email && email.offsetWidth > 0) return 'A-email';
      var ta = document.querySelector('textarea');
      if (ta && ta.offsetWidth > 0) return 'C-textarea';
      var btns = Array.from(document.querySelectorAll('button'));
      if (btns.find(function(b){ var t=(b.textContent||'').trim(); return t==='Enviar'||t==='Send invitation'||t==='Enviar invitación'; })) return 'C-send';
      return null;
    });
    if (!variante) await delay(300);
  }
  if (!variante) { log('  M4: modal no detectado'); return null; }
  log('  M4 variante: ' + variante);
  return completarModal(page, variante);
}

// M5: Más → Tab navegación hasta Conectar → Enter + waitForSelector
async function M5(page) {
  log('M5: Más → Tab + Enter → waitForSelector');
  await page.evaluate(function(){ window.scrollTo(0,400); });
  await delay(300);
  var masBbox = await page.evaluate(function() {
    var todos = Array.from(document.querySelectorAll('button')).filter(function(b) {
      var a=(b.getAttribute('aria-label')||'').toLowerCase();
      return a.includes('acciones')||a.includes('actions');
    });
    var t = todos.find(function(b){ var r=b.getBoundingClientRect(); return r.y>=50&&r.y<=700&&r.width>0; });
    if (!t) return null;
    var r=t.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};
  });
  if (!masBbox) { log('  Más no encontrado'); return null; }
  await page.mouse.click(masBbox.x+masBbox.w/2, masBbox.y+masBbox.h/2);
  await delay(600);

  await page.evaluate(function() {
    var b = Array.from(document.querySelectorAll('button')).find(function(b) {
      var a=(b.getAttribute('aria-label')||'').toLowerCase();
      return a.includes('acciones')||a.includes('actions');
    });
    if (b) b.focus();
  });
  var found = false;
  for (var i=0; i<12; i++) {
    await page.keyboard.press('Tab');
    await delay(150);
    var cur = await page.evaluate(function() {
      return ((document.activeElement||{}).innerText||(document.activeElement||{}).textContent||'').trim();
    });
    if (cur==='Conectar'||cur==='Connect'||cur==='Ligar') {
      await page.keyboard.press('Enter');
      found = true;
      log('  M5 Conectar en tab ' + (i+1));
      break;
    }
  }
  if (!found) { log('  M5: Conectar no alcanzado en 12 tabs'); return null; }
  var variante = await detectarModal(page, 8000);
  if (!variante) return null;
  return completarModal(page, variante);
}

// M6: Conectar directo + locator.waitFor (no isVisible)
async function M6(page) {
  log('M6: Conectar directo + locator.waitFor visible');
  var btn = page.locator('button:has-text("Conectar"), button:has-text("Connect")').first();
  if (!await btn.isVisible().catch(function(){ return false; })) return null;
  await btn.click();
  var emailLoc = page.locator('input[type="email"]').first();
  var visible = false;
  try { await emailLoc.waitFor({ state: 'visible', timeout: 8000 }); visible = true; } catch(_) {}
  if (!visible) {
    // Try textarea
    var taLoc = page.locator('textarea').first();
    try { await taLoc.waitFor({ state: 'visible', timeout: 3000 }); visible = true; } catch(_) {}
  }
  if (!visible) { log('  M6: modal no detectado con waitFor'); return null; }
  var variante = await detectarModal(page, 2000);
  return completarModal(page, variante || 'A-email');
}

// M7: Más → artdeco CAPA1 + waitForSelector 8s
async function M7(page) {
  log('M7: Más → artdeco CAPA1 + waitForSelector 8s');
  await page.evaluate(function(){ window.scrollTo(0,400); });
  await delay(300);
  var masBbox = await page.evaluate(function() {
    var d = document.querySelector('.artdeco-dropdown__content');
    if (d) { var r=d.getBoundingClientRect(); if (r.width>0&&r.height>0&&r.y>0) {} } // pre-check
    var todos = Array.from(document.querySelectorAll('button')).filter(function(b) {
      var a=(b.getAttribute('aria-label')||'').toLowerCase();
      return a.includes('acciones')||a.includes('actions');
    });
    var t = todos.find(function(b){ var r=b.getBoundingClientRect(); return r.y>=50&&r.y<=700&&r.width>0; });
    if (!t) return null;
    var r=t.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};
  });
  if (!masBbox) return null;
  await page.mouse.click(masBbox.x+masBbox.w/2, masBbox.y+masBbox.h/2);
  await delay(600);

  var cBbox = await page.evaluate(function() {
    var d1 = document.querySelector('.artdeco-dropdown__content');
    if (!d1) return null;
    var r1=d1.getBoundingClientRect();
    if (r1.width<=0||r1.height<=0||r1.y<=0) return null;
    var el = Array.from(d1.querySelectorAll('*')).find(function(e) {
      var t=(e.innerText||'').trim(), ry=e.getBoundingClientRect().y;
      return (t==='Conectar'||t==='Connect'||t==='Ligar')&&e.getBoundingClientRect().width>0&&ry>50&&ry<700;
    });
    if (!el) return null;
    var rc=el.getBoundingClientRect(); return {x:rc.x,y:rc.y,w:rc.width,h:rc.height};
  });
  if (!cBbox) { log('  M7: artdeco CAPA1 sin Conectar'); return null; }
  await page.mouse.click(cBbox.x+cBbox.w/2, cBbox.y+cBbox.h/2);
  var variante = await detectarModal(page, 8000);
  if (!variante) return null;
  return completarModal(page, variante);
}

// M8: Más → dispatchEvent en li + waitForSelector
async function M8(page) {
  log('M8: Más → dispatchEvent en li + waitForSelector');
  await page.evaluate(function(){ window.scrollTo(0,400); });
  await delay(300);
  var masBbox = await page.evaluate(function() {
    var todos = Array.from(document.querySelectorAll('button')).filter(function(b) {
      var a=(b.getAttribute('aria-label')||'').toLowerCase();
      return a.includes('acciones')||a.includes('actions');
    });
    var t = todos.find(function(b){ var r=b.getBoundingClientRect(); return r.y>=50&&r.y<=700&&r.width>0; });
    if (!t) return null;
    var r=t.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};
  });
  if (!masBbox) return null;
  await page.mouse.click(masBbox.x+masBbox.w/2, masBbox.y+masBbox.h/2);
  await delay(600);

  var ok = await page.evaluate(function() {
    for (var i=0; i<document.querySelectorAll('ul').length; i++) {
      var ul=document.querySelectorAll('ul')[i];
      var r=ul.getBoundingClientRect();
      if (r.width<50||r.y<50||r.y>700) continue;
      var el=Array.from(ul.querySelectorAll('*')).find(function(e) {
        var t=(e.innerText||'').trim(),ry=e.getBoundingClientRect().y;
        return (t==='Conectar'||t==='Connect'||t==='Ligar')&&e.getBoundingClientRect().width>0&&ry>50&&ry<700;
      });
      if (el) {
        var rc=el.getBoundingClientRect(), cx=rc.x+rc.width/2, cy=rc.y+rc.height/2;
        ['mousedown','mouseup','click'].forEach(function(tipo) {
          el.dispatchEvent(new MouseEvent(tipo,{bubbles:true,cancelable:true,view:window,clientX:cx,clientY:cy}));
        });
        return 'dispatched:y='+Math.round(cy);
      }
    }
    return 'no-li';
  });
  log('  M8: ' + ok);
  if (ok==='no-li') return null;
  var variante = await detectarModal(page, 8000);
  if (!variante) return null;
  return completarModal(page, variante);
}

// M9: Conectar directo (si visible) con Playwright locator.waitFor explícito
async function M9(page) {
  log('M9: Conectar directo + waitFor({state:visible})');
  // Buscar el botón Conectar directo (no el del sidebar)
  var btnBbox = await page.evaluate(function() {
    var btns = Array.from(document.querySelectorAll('button')).filter(function(b) {
      var t=(b.innerText||b.textContent||'').trim();
      var r=b.getBoundingClientRect();
      return (t==='Conectar'||t==='Connect'||t==='Ligar')&&r.width>0&&r.y>100&&r.y<500;
    });
    if (btns.length===0) return null;
    var r=btns[0].getBoundingClientRect();
    return {x:r.x,y:r.y,w:r.width,h:r.height};
  });
  if (!btnBbox) { log('  M9: Conectar directo no encontrado en y 100-500'); return null; }
  log('  M9: Conectar directo y=' + Math.round(btnBbox.y));
  await page.mouse.click(btnBbox.x+btnBbox.w/2, btnBbox.y+btnBbox.h/2);
  var variante = await detectarModal(page, 8000);
  if (!variante) return null;
  return completarModal(page, variante);
}

// M10: Más → click + waitForSelector email OR send antes de buscar Conectar
async function M10(page) {
  log('M10: Más → click Más → waitForSelector Conectar en dropdown → click → waitForSelector modal');
  await page.evaluate(function(){ window.scrollTo(0,400); });
  await delay(300);

  var masLoc = page.locator('button[aria-label*="acciones"], button[aria-label*="actions"]').first();
  if (!await masLoc.isVisible().catch(function(){ return false; })) return null;
  await masLoc.click({ force: true });
  await delay(600);

  // Esperar que aparezca "Conectar" en el dropdown antes de hacer click
  await page.waitForSelector(
    '.artdeco-dropdown__content li, ul li',
    { timeout: 5000 }
  ).catch(function(){});

  var cBbox = await page.evaluate(function() {
    for (var i=0; i<document.querySelectorAll('ul').length; i++) {
      var ul=document.querySelectorAll('ul')[i];
      var r=ul.getBoundingClientRect();
      if (r.width<50||r.y<50||r.y>700) continue;
      var el=Array.from(ul.querySelectorAll('*')).find(function(e) {
        var t=(e.innerText||'').trim(),ry=e.getBoundingClientRect().y;
        return (t==='Conectar'||t==='Connect'||t==='Ligar')&&e.getBoundingClientRect().width>0&&ry>50&&ry<700;
      });
      if (el) { var rc=el.getBoundingClientRect(); return {x:rc.x,y:rc.y,w:rc.width,h:rc.height}; }
    }
    return null;
  });
  if (!cBbox) { log('  M10: Conectar no en dropdown'); return null; }
  log('  M10: Conectar y=' + Math.round(cBbox.y));
  await page.mouse.click(cBbox.x+cBbox.w/2, cBbox.y+cBbox.h/2);
  var variante = await detectarModal(page, 8000);
  if (!variante) return null;
  return completarModal(page, variante);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  log('=== test-adam-v1.js — 10 métodos para Adam Besvinick ===');
  log('Perfil: ' + LINKEDIN_URL);
  log('');

  var browser = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false, viewport: { width: 1280, height: 900 }
  });
  var page = await browser.newPage();
  await cargarPagina(page);

  var metodos = [
    { id:'M1',  fn:M1,  pct:'97%', desc:'Conectar directo + waitForSelector' },
    { id:'M2',  fn:M2,  pct:'96%', desc:'Más → coords y<700 + waitForSelector' },
    { id:'M3',  fn:M3,  pct:'95%', desc:'Más → coords y<700 + waitForSelector email|send' },
    { id:'M4',  fn:M4,  pct:'94%', desc:'Conectar directo + evaluate polling loop' },
    { id:'M5',  fn:M5,  pct:'93%', desc:'Más → Tab + Enter + waitForSelector' },
    { id:'M6',  fn:M6,  pct:'92%', desc:'Conectar directo + locator.waitFor' },
    { id:'M7',  fn:M7,  pct:'91%', desc:'Más → artdeco CAPA1 + waitForSelector' },
    { id:'M8',  fn:M8,  pct:'90%', desc:'Más → dispatchEvent li + waitForSelector' },
    { id:'M9',  fn:M9,  pct:'90%', desc:'Conectar directo y 100-500 + waitForSelector' },
    { id:'M10', fn:M10, pct:'90%', desc:'Más → force click + waitForSelector li' },
  ];

  var resultados = [];
  var ganador = null;

  for (var i=0; i<metodos.length; i++) {
    var m = metodos[i];
    log('');
    log('┌──────────────────────────────────────────────────────┐');
    log('│ ' + m.id + ' | ' + m.desc);
    log('└──────────────────────────────────────────────────────┘');

    var resultado = await m.fn(page).catch(function(e) {
      log('  ERROR: ' + e.message.split('\n')[0]);
      return '❌ excepción: ' + e.message.split('\n')[0];
    });

    log('  Resultado: ' + (resultado || '❌ null'));
    resultados.push({ id:m.id, pct:m.pct, desc:m.desc, r: resultado || '❌ null' });

    if (resultado && resultado.includes('✅')) {
      ganador = m.id;
      log('  🎉 ' + m.id + ' FUNCIONÓ — deteniendo tests');
      break;
    }

    await reset(page);
    await delay(600);
    // Recargar solo si el modal cambió el estado de la página
    var url = page.url();
    if (!url.includes('besvinick')) {
      await cargarPagina(page);
    }
  }

  // ── TABLA FINAL ────────────────────────────────────────────────────────────
  log('');
  log('╔══════════════════════════════════════════════════════════════════════════╗');
  log('║        ERRORES CONFIRMADOS + RESULTADOS DE ESTE RUN                     ║');
  log('╠══════════════════════════════════════════════════════════════════════════╣');
  log('║  ── ERRORES CONOCIDOS PARA ADAM BESVINICK ─────────────────────────── ║');
  log('╠══════╦══════════════════════════════════════════════════════════════════╣');
  log('║  E1  ║ M1 y=984 → sidebar click (no isVisible timeout)                 ║');
  log('║  E2  ║ isVisible({timeout:5000}) ignora timeout → modal no detectado   ║');
  log('║  E3  ║ getByText.last() → botón directo o sidebar según DOM order      ║');
  log('║  E4  ║ Fallback browser separado → Target page closed (Russell)        ║');
  log('╠══════╩══════════════════════════════════════════════════════════════════╣');
  log('║  ── RESULTADOS DE ESTE RUN (10 métodos) ──────────────────────────── ║');
  log('╠══════╦══════╦══════════════════════════════════════╦══════════════════╣');
  log('║  ID  ║ %est ║ Método                               ║ Resultado        ║');
  log('╠══════╬══════╬══════════════════════════════════════╬══════════════════╣');

  resultados.forEach(function(r) {
    var met = (r.desc + '                                    ').slice(0,36);
    var res = r.r.slice(0,18);
    log('║  ' + (r.id+'    ').slice(0,4) + ' ║ ' + r.pct + ' ║ ' + met + ' ║ ' + res + ' ║');
  });

  // Pendientes no ejecutados
  metodos.forEach(function(m) {
    if (!resultados.find(function(r){ return r.id===m.id; })) {
      log('║  ' + (m.id+'    ').slice(0,4) + ' ║ ' + m.pct + ' ║ ' + (m.desc+'                                    ').slice(0,36) + ' ║ ⏭️ no ejecutado  ║');
    }
  });

  log('╚══════════════════════════════════════════════════════════════════════════╝');
  log('');

  if (ganador) {
    log('✅ GANADOR: ' + ganador);
    log('→ Integrar patrón en invitar-agent.js F6/F4');
  } else {
    log('❌ Ningún método funcionó');
    log('→ Revisar log de detectarModal — qué btns estaban visibles al fallar');
  }

  log('Pausando 25s para inspección visual...');
  await delay(25000);
  await browser.close();
}

main().catch(function(err) {
  console.error('ERROR FATAL: ' + err.message);
  process.exit(1);
});
