// ============================================================
// invitar-agent.js — Automatización 4: Envío de Invitaciones
// Orquestador completo F1→F2→F3→F4→F5→F6→F7
//
// Uso:
//   node invitar-agent.js alejandro   ← solo una cuenta
//   node invitar-agent.js             ← las 3 en paralelo
//
// Cuotas diarias (por día calendario):
//   Alejandro  → 100 total: 50 MX + 50 US (compensación automática)
//   David      → 100 total: 70 gerentes + 30 consultores
//   Francisco  → 100 total: 70 gerentes + 30 consultores
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

// ─── DASHBOARD INTEGRATION ────────────────────────────────────────────────────
const DASHBOARD = 'http://localhost:3000';

// Mapeo cuenta → ID del dashboard-server.js
const FLOW_ID = {
  alejandro: 'invitar-alejandro',
  david:     'invitar-david',
  francisco: 'invitar-francisco',
};

async function reportState(cuenta, patch) {
  const id = FLOW_ID[cuenta];
  if (!id) return;
  try {
    await fetch(`${DASHBOARD}/api/update`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, patch }),
    });
  } catch (_) { /* dashboard offline — continuar */ }
}


// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

const SEARCHES = {
  alejandro: [
    { nombre: 'Angel investor, Estados Unidos', grupo: 'US' },
    { nombre: 'Angel investor, Mexico',         grupo: 'MX' },
    { nombre: 'Seed investor, Mexico',          grupo: 'MX' },
    { nombre: 'Family Office, Mexico',          grupo: 'MX' },
  ],
  david: [
    { nombre: 'Gerente, SP',   grupo: 'gerente' },
    { nombre: 'Consultor, SP', grupo: 'consultor' },
  ],
  francisco: [
    { nombre: 'Gerente, RJ MG ES BH',   grupo: 'gerente' },
    { nombre: 'Consultor, RJ MG ES BH', grupo: 'consultor' },
  ],
};

const CUOTAS_OBJETIVO = {
  alejandro : { US: 50, MX: 50 },
  david     : { gerente: 70, consultor: 30 },
  francisco : { gerente: 70, consultor: 30 },
};
const CUOTA_TOTAL = 100;

const SESSION_DIRS = {
  alejandro : path.resolve(__dirname, 'session'),
  david     : path.resolve(__dirname, 'david agente invitaciones'),
  francisco : path.resolve(__dirname, 'francisco agente invitaciones'),
};

// ─── MENSAJES ─────────────────────────────────────────────────────────────────

const MENSAJES = {
  alejandro: {
    ES: 'Mucho gusto! Soy Alejandro, ingeniero en Inteligencia Artificial y ex-director de Tecnología de la Policía Federal Mexicana. Estoy expandiendo mi red para conocer nuevas personas e intercambiar ideas sobre el mercado.',
    EN: 'Nice to meet you! I\'m Alejandro, an Artificial Intelligence engineer and former Technology Director of the Mexican Federal Police. I\'m expanding my network to meet new people and exchange ideas about the market.',
  },
  david     : { PT: 'Muito prazer! Sou David, engenheiro em Inteligência Artificial e ex-director de Tecnologia da Polícia Federal Mexicana. Estou expandindo minha rede pra conhecer novas pessoas e trocar ideias sobre o mercado.' },
  francisco : { PT: 'Muito prazer! Sou Francisco, engenheiro em Inteligência Artificial e ex-director de Tecnologia da Polícia Federal Mexicana. Estou expandindo minha rede pra conhecer novas pessoas e trocar ideias sobre o mercado.' },
};

const MX_LOCATIONS = ['mexico', 'méxico', 'cdmx', 'ciudad de mexico', 'ciudad de méxico', 'guadalajara', 'monterrey', 'puebla', 'queretaro', 'querétaro'];
const US_LOCATIONS = ['united states', 'usa', 'u.s.', 'estados unidos', 'estados unidos da america', 'estados unidos da américa', 'new york', 'nueva york', 'california', 'texas', 'florida', 'chicago', 'los angeles', 'san francisco', 'boston', 'seattle', 'miami', 'atlanta', 'denver'];

function getMensaje(cuenta, textoCompleto) {
  if (cuenta === 'alejandro') {
    const t = textoCompleto.toLowerCase();
    if (US_LOCATIONS.some(loc => t.includes(loc))) return MENSAJES.alejandro.EN;
    return MENSAJES.alejandro.ES;
  }
  return cuenta === 'david' ? MENSAJES.david.PT : MENSAJES.francisco.PT;
}

// ─── ARCHIVOS DE ESTADO ───────────────────────────────────────────────────────

const QUOTA_FILE   = path.resolve(__dirname, 'quota-invitar.json');
const PENDING_FILE = path.resolve(__dirname, 'pending-email.json');
const LOG_FILE     = path.resolve(__dirname, 'invitar-agent.log');

// ─── SELECTOR COMPARTIDO ─────────────────────────────────────────────────────

const SELECTOR_PERFILES =
  'ol li:has(a[href*="/sales/lead/"]), ol li:has(a[href*="/sales/people/"]), ' +
  'ul li:has(a[href*="/sales/lead/"]), ul li:has(a[href*="/sales/people/"])';

// ─── LOGGING ─────────────────────────────────────────────────────────────────

function log(cuenta, msg) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] [${String(cuenta).padEnd(10)}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ═══════════════════════════════════════════════════════════════
// F7 — Gestión de cuota diaria
// ═══════════════════════════════════════════════════════════════

function cargarCuota() {
  const today = new Date().toISOString().slice(0, 10);
  if (fs.existsSync(QUOTA_FILE)) {
    const saved = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'));
    if (saved.date === today) return saved;
  }
  return {
    date  : today,
    counts: {
      alejandro : { US: 0, MX: 0 },
      david     : { gerente: 0, consultor: 0 },
      francisco : { gerente: 0, consultor: 0 },
    },
  };
}

// Mutex de escritura — evita corrupción del JSON con 3 cuentas en paralelo (B3)
let _escribiendo = false;
async function guardarCuotaSafe(state) {
  while (_escribiendo) await delay(50);
  _escribiendo = true;
  try { fs.writeFileSync(QUOTA_FILE, JSON.stringify(state, null, 2)); }
  finally { _escribiendo = false; }
}

function totalEnviado(state, cuenta) {
  return Object.values(state.counts[cuenta]).reduce((a, b) => a + b, 0);
}

function quedanInvitaciones(state, cuenta) {
  return totalEnviado(state, cuenta) < CUOTA_TOTAL;
}

// Calcula plan de listas con cuotas primarias + compensación automática
function calcularPlan(state, cuenta) {
  const counts    = state.counts[cuenta];
  const objetivos = CUOTAS_OBJETIVO[cuenta];
  const searches  = SEARCHES[cuenta];
  const total     = totalEnviado(state, cuenta);
  if (total >= CUOTA_TOTAL) return [];

  const restante = CUOTA_TOTAL - total;
  const plan     = [];

  // Paso 1: déficit de cuotas primarias
  let totalCuotasPrimarias = 0;
  for (const search of searches) {
    const objetivo = objetivos[search.grupo] || 0;
    const enviados = counts[search.grupo]    || 0;
    const deficit  = Math.max(0, objetivo - enviados);
    if (deficit > 0) {
      plan.push({ search, cuota: deficit, grupo: search.grupo, esCompensacion: false });
      totalCuotasPrimarias += deficit;
    }
  }

  // Paso 2: compensación si sobran cupos
  const sobraCompensacion = restante - totalCuotasPrimarias;
  if (sobraCompensacion > 0) {
    for (const search of searches) {
      plan.push({ search, cuota: sobraCompensacion, grupo: search.grupo, esCompensacion: true });
    }
  }

  return plan;
}

async function registrarEnvio(state, cuenta, grupo) {
  if (state.counts[cuenta][grupo] !== undefined) {
    state.counts[cuenta][grupo]++;
  } else {
    // Compensación — sumar al grupo con menos envíos
    const grupos   = Object.keys(state.counts[cuenta]);
    const minGrupo = grupos.reduce((a, b) => state.counts[cuenta][a] <= state.counts[cuenta][b] ? a : b);
    state.counts[cuenta][minGrupo]++;
  }
  await guardarCuotaSafe(state);
}

// D4: mutex para pending-email.json — mismo riesgo que quota con 3 cuentas en paralelo
const MAX_INTENTOS_PENDING = 3; // D7: máximo global de intentos
let _escribiendoPending = false;
function logPendingEmail(cuenta, nombre, profileUrl, grupo = null) {
  // Escritura síncrona con lock manual — no puede ser async porque se llama desde F4
  const ahora = Date.now();
  const tope  = ahora + 2000;
  while (_escribiendoPending && Date.now() < tope) { /* spin breve */ }
  _escribiendoPending = true;
  try {
    const list = fs.existsSync(PENDING_FILE) ? JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')) : [];
    const existente = list.find(p => p.profileUrl === profileUrl);
    // D7: no registrar si ya tiene MAX_INTENTOS o más — evita acumulación infinita
    if (existente && existente.intentos >= MAX_INTENTOS_PENDING) {
      log(cuenta, `⚠ PENDIENTE saltado (${existente.intentos} intentos agotados): ${nombre}`);
      return;
    }
    // D8: no duplicar si ya existe en la lista (preservar intentos acumulados)
    if (!existente) {
      list.push({ cuenta, nombre, profileUrl, grupo: grupo || null, reason: 'requires-email', date: new Date().toISOString(), intentos: 0 });
      fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));
    }
  } finally {
    _escribiendoPending = false;
  }
  log(cuenta, `⚠ PENDIENTE (requiere correo): ${nombre}`);
}

// ═══════════════════════════════════════════════════════════════
// F1 — abrirBusquedaGuardada
// ═══════════════════════════════════════════════════════════════
// Navega a sales/search/people, abre el panel de búsquedas guardadas,
// y hace click en el link "Ver" usando aria-label con el nombre exacto.
// Confirmado en producción: aria-label="Ver la búsqueda guardada de
// posibles clientes: «NOMBRE»"

async function abrirBusquedaGuardada(page, busqueda, cuenta) {
  log(cuenta, `F1 Abriendo: "${busqueda.nombre}"`);
  try {
    // 1. Navegar a la página base de búsqueda de personas
    await page.goto('https://www.linkedin.com/sales/search/people', {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    await delay(2000);
    await cerrarBanners(page);

    // 2. Abrir el panel de búsquedas guardadas
    const savedBtn = await page.waitForSelector(
      'button:has-text("Saved searches"), button:has-text("Búsquedas guardadas"), button:has-text("Pesquisas salvas")',
      { timeout: 10000 }
    ).catch(() => null);
    if (!savedBtn) {
      log(cuenta, `F1 ✗ Botón de búsquedas guardadas no encontrado`);
      return { ok: false, error: 'Botón de búsquedas guardadas no encontrado' };
    }
    await savedBtn.click();
    await delay(3000); // el panel necesita tiempo para renderizar

    // 3. Click en el link "Ver" usando aria-label con el nombre de la búsqueda
    const verLink = await page.waitForSelector(
      `a[aria-label*="${busqueda.nombre}"]`,
      { timeout: 8000 }
    ).catch(() => null);
    if (!verLink) {
      log(cuenta, `F1 ✗ Búsqueda "${busqueda.nombre}" no encontrada en el panel`);
      return { ok: false, error: `Búsqueda "${busqueda.nombre}" no encontrada en el panel` };
    }
    await verLink.click();

    // 4. Esperar a que carguen los resultados
    await page.waitForSelector(SELECTOR_PERFILES, { timeout: 15000 }).catch(() => {});
    await delay(800);
    await cerrarBanners(page);

    log(cuenta, `F1 ✓`);
    return { ok: true };
  } catch (err) {
    log(cuenta, `F1 ✗ Error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// F2 — procesarPerfilesConScroll (Camino 1)
// ═══════════════════════════════════════════════════════════════
// Loop combinado: extraer visibles → F3 → F4 → scroll → repetir
// Procesa en orden natural top→bottom sin esperar scroll completo.
// Retorna: { enviados, agotada }

async function procesarPerfilesConScroll(page, cuenta, cuota, grupo, quotaState) {
  const contenedor = page.locator('ol.artdeco-list').first();
  if (!await contenedor.isVisible({ timeout: 8000 }).catch(() => false)) {
    log(cuenta, `F2 ✗ Contenedor no encontrado`);
    return { enviados: 0, agotada: true };
  }

  // Esperar a que los perfiles se rendericen dentro del contenedor (hasta 10s)
  const perfilesOk = await page.waitForSelector(SELECTOR_PERFILES, { timeout: 10000 }).catch(() => null);
  if (!perfilesOk) {
    log(cuenta, `F2 ✗ Contenedor visible pero sin perfiles tras 10s`);
    return { enviados: 0, agotada: true };
  }

  // Centrar mouse para mouse.wheel — mismo fix de F2 anterior
  const bbox = await contenedor.boundingBox().catch(() => null);
  if (!bbox) await page.mouse.move(640, 430);
  else await page.mouse.move(bbox.x + bbox.width / 2, Math.min(bbox.y + 200, 700));

  const idsVistos       = new Set(); // deduplicación entre rondas de scroll
  const idsError        = new Set(); // D3: perfiles con error estructural — no reintentar en C1
  const pendientesEmail = [];        // C2: perfiles que requieren email — procesados al final
  let enviados     = 0;
  let sinNuevos    = 0;         // rondas consecutivas sin perfiles nuevos
  let alturaAnterior  = 0;      // B1: trackear scrollHeight para doble condición
  let alturaEstab     = 0;      // B1: rondas consecutivas con scrollHeight igual
  const MAX_RONDAS = 80;
  let rondas       = 0;

  // B1: parar solo cuando AMBAS condiciones se cumplen simultáneamente
  // — evita corte prematuro si hay rondas vacías entre perfiles reales
  while (enviados < cuota && quedanInvitaciones(quotaState, cuenta) && !(sinNuevos >= 5 && alturaEstab >= 3) && rondas < MAX_RONDAS) {
    // Extraer perfiles visibles en este momento
    const todosItems = await page.locator(SELECTOR_PERFILES).all();

    // Filtrar solo los nuevos — no procesados en rondas anteriores
    const nuevos = [];
    for (const item of todosItems) {
      const href = await item.locator('a[href*="/sales/lead/"], a[href*="/sales/people/"]').first().getAttribute('href', { timeout: 5000 }).catch(() => '');
      if (!href) { log(cuenta, `[diag] skip — getAttribute timeout`); continue; }
      const key  = normalizarUrl(href);
      if (key && !idsVistos.has(key)) {
        idsVistos.add(key);
        nuevos.push(item);
      }
    }

    if (nuevos.length === 0) {
      sinNuevos++;
    } else {
      sinNuevos = 0;
      log(cuenta, `F2 Ronda ${rondas + 1} — ${nuevos.length} perfiles nuevos visibles`);

      // F3 + F4 sobre los nuevos perfiles
      for (const profileEl of nuevos) {
        if (enviados >= cuota || !quedanInvitaciones(quotaState, cuenta)) break;

        const estado = await verificarEstadoPerfil(profileEl);
        if (estado !== 'candidato') continue;

        const { resultado, nombre, profileUrl } = await enviarInvitacion(page, profileEl, cuenta);
        if (resultado === 'enviada') {
          await registrarEnvio(quotaState, cuenta, grupo);
          enviados++;
          log(cuenta, `Contadores: ${JSON.stringify(quotaState.counts[cuenta])} | Total: ${totalEnviado(quotaState, cuenta)}/${CUOTA_TOTAL}`);
          await reportState(cuenta, {
            state: 'running',
            sent: totalEnviado(quotaState, cuenta),
            counts: quotaState.counts[cuenta],
            session: quotaState.counts[cuenta],
            lastActivity: `Enviada ✅ a ${nombre} (total: ${totalEnviado(quotaState, cuenta)})`,
          });
          await delay(2000 + Math.random() * 1500);
        } else if (resultado === 'requires-email' && profileUrl) {
          // D2: deduplicar en memoria — Sanjeev Munjal apareció 2x en log real
          if (!pendientesEmail.some(p => p.profileUrl === profileUrl)) {
            pendientesEmail.push({ nombre, profileUrl, grupo });
            // E2: actualizar grupo en disco — F4 no tiene acceso al grupo
            try {
              const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
              const idx  = list.findIndex(p => p.profileUrl === profileUrl);
              if (idx >= 0) { list[idx].grupo = grupo; fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2)); }
            } catch {}
          }
        } else if (resultado === 'error' || resultado === 'no-connect-option') {
          // D3: marcar como error estructural — C1 no reintentará
          const hrefErr = await profileEl.locator('a[href*="/sales/lead/"], a[href*="/sales/people/"]').first().getAttribute('href', { timeout: 5000 }).catch(() => '');
          const keyErr  = normalizarUrl(hrefErr);
          if (keyErr) idsError.add(keyErr);
        }
      }
    }

    // Scroll para revelar los siguientes perfiles + trackear scrollHeight (B1)
    await page.mouse.wheel(0, 500);
    await delay(450);
    const alturaActual = await page.evaluate(() => document.body.scrollHeight);
    if (alturaActual === alturaAnterior) alturaEstab++;
    else { alturaEstab = 0; }
    alturaAnterior = alturaActual;
    rondas++;
  }

  // B1: agotada solo cuando ambas condiciones confirman fin de página
  const agotada = sinNuevos >= 5 && alturaEstab >= 3;
  log(cuenta, `F2 Página completa — ${enviados} enviadas | ${idsVistos.size} perfiles vistos | agotada: ${agotada}`);
  return { enviados, agotada, idsVistos, idsError, pendientesEmail };
}

// ═══════════════════════════════════════════════════════════════
// F3 — verificarEstadoPerfil
// ═══════════════════════════════════════════════════════════════

async function verificarEstadoPerfil(profileEl) {
  const texto = await profileEl.innerText({ timeout: 5000 }).catch(() => '');
  if (!texto) return 'candidato'; // elemento desaparecido — tratar como candidato
  const t     = texto.toLowerCase();
  const indicaSaved   = t.includes('saved')   || t.includes('guardado') || t.includes('salvo');
  const indicaPending = t.includes('pending') || t.includes('pendiente')|| t.includes('pendente');
  if (!indicaSaved && !indicaPending) return 'candidato';
  if (indicaSaved) {
    const btn = profileEl.locator('button:has-text("Saved")').or(profileEl.locator('button:has-text("Guardado")')).or(profileEl.locator('button:has-text("Salvo")'));
    if (await btn.count().catch(() => 0) > 0) return 'skip-saved';
    const svg = profileEl.locator('button svg use[href*="bookmark"], button svg use[href*="check"]');
    if (await svg.count().catch(() => 0) > 0) return 'skip-saved';
  }
  if (indicaPending) {
    const btn = profileEl.locator('button:has-text("Pending")').or(profileEl.locator('button:has-text("Pendiente")')).or(profileEl.locator('button:has-text("Pendente")'));
    if (await btn.count().catch(() => 0) > 0) return 'skip-pending';
    const svg = profileEl.locator('button svg use[href*="clock"], button svg use[href*="pending"]');
    if (await svg.count().catch(() => 0) > 0) return 'skip-pending';
  }
  return 'candidato';
}

// ═══════════════════════════════════════════════════════════════
// verificarPendingPostEnvio — B4
// ═══════════════════════════════════════════════════════════════
// Confirma que el modal se cerró y el botón del perfil cambió a Pending.
// Fix B4: page.waitForSelector() en lugar de locator.or().waitFor()
// — waitFor() en un locator .or() aplica el timeout solo al primer branch,
//   generando falsos negativos en versiones <1.40 de Playwright.

async function verificarPendingPostEnvio(page) {
  return page.waitForSelector(
    'button:has-text("Pending"), button:has-text("Pendiente"), button:has-text("Pendente")',
    { timeout: 5000 }
  ).then(() => true).catch(() => false);
}

// ═══════════════════════════════════════════════════════════════
// F4 — enviarInvitacion
// ═══════════════════════════════════════════════════════════════

async function enviarInvitacion(page, profileEl, cuenta) {
  const nombre        = await profileEl.locator('[data-anonymize="person-name"]').first().innerText({ timeout: 5000 }).catch(() => 'desconocido');
  const textoCompleto = await profileEl.innerText({ timeout: 5000 }).catch(() => '');
  const mensaje       = getMensaje(cuenta, textoCompleto);

  await profileEl.scrollIntoViewIfNeeded().catch(() => {});
  await delay(500);

  // ── M9: Conectar directo en y 100-500 (ganador test-adam-v1) ─────────────
  // Evita navbar (y<100) y sidebar "Más perfiles para ti" (y>500 en Sales Nav)
  // FIX E2: isVisible({timeout}) ignora timeout — usar waitForSelector + evaluate
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
    log(cuenta, `F4 [M9] Conectar directo y=${Math.round(conectarDirectoBbox.y)}`);
    await page.mouse.click(
      conectarDirectoBbox.x + conectarDirectoBbox.w / 2,
      conectarDirectoBbox.y + conectarDirectoBbox.h / 2
    );
  } else {
    // ── F4 moreBtn — REESCRITO con fixes A1-A9 (test N1 ganador 7/10) ────────
    //
    // A2: mouse.move + page.mouse.click(coords) — locator.click() no mantiene
    //     el dropdown de Ember.js. Confirmado en test-f4-moreBtn v3.
    // A1: límite ry < 860 (viewport completo) — Conectar en y=709 confirmado
    //     en producción. El límite anterior ry < 700 fallaba silenciosamente.
    // A3: buscar en artdeco + ul — Sales Nav usa ul, no artdeco
    // A4: data-search-overflow-trigger como selector secundario
    // A5: mouse.move al card ANTES de buscar bbox (Sales Nav requiere hover)
    // A6: loggear y-coord de Conectar en producción
    // A7: delay 1000ms + waitForFunction confirmando ul renderizado
    // A8: fallback N7 (hover doble) si primer intento falla
    // A9: detectar "Seguir" → retornar 'ya-conectado' en lugar de error

    // A5: hover al card primero — fuerza render del botón ··· en Sales Nav
    const cardBbox = await profileEl.boundingBox().catch(() => null);
    if (cardBbox) {
      await page.mouse.move(cardBbox.x + cardBbox.width / 2, cardBbox.y + 20);
      await delay(300);
    }

    // A2+A4: obtener bbox del botón ··· por aria*="acciones" o data-attr
    const moreBtnBbox = await profileEl.evaluate(el => {
      // Primer intento: aria-label con "acciones" / "actions" / "ações"
      let btn = Array.from(el.querySelectorAll('button[aria-label]')).find(b => {
        const a = (b.getAttribute('aria-label') || '').toLowerCase();
        return a.includes('acciones') || a.includes('actions') || a.includes('ações');
      });
      // A4: segundo intento: data-search-overflow-trigger (confirmado en diagnóstico)
      if (!btn) btn = el.querySelector('[data-search-overflow-trigger]');
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      if (r.width === 0) return null;
      return { x: r.x, y: r.y, w: r.width, h: r.height, aria: btn.getAttribute('aria-label') };
    }).catch(() => null);

    if (!moreBtnBbox) {
      // A9: diagnóstico completo del card si no se encuentra el botón
      const ariaLabels = await profileEl.evaluate(el =>
        Array.from(el.querySelectorAll('button[aria-label]'))
          .map(b => b.getAttribute('aria-label')).filter(Boolean)
      ).catch(() => []);
      log(cuenta, `F4 [diag] aria-labels del card: ${JSON.stringify(ariaLabels)}`);
      log(cuenta, `F4 ✗ Ni Conectar directo ni botón ··· — ${nombre}`);
      return { resultado: 'no-connect-option', nombre };
    }

    log(cuenta, `F4 [diag] Botón ··· aria="${moreBtnBbox.aria}" y=${Math.round(moreBtnBbox.y)}`);

    // A2: mouse.move + page.mouse.click — patrón confirmado N1
    await page.mouse.move(moreBtnBbox.x + moreBtnBbox.w / 2, moreBtnBbox.y + moreBtnBbox.h / 2);
    await delay(200);
    await page.mouse.click(moreBtnBbox.x + moreBtnBbox.w / 2, moreBtnBbox.y + moreBtnBbox.h / 2);

    // A7: esperar que el dropdown renderice — waitForFunction en lugar de delay fijo
    await delay(1000);
    await page.waitForFunction(() => {
      const uls = Array.from(document.querySelectorAll('ul')).filter(u => {
        const r = u.getBoundingClientRect();
        return r.width > 40 && r.height > 20 && r.y > 50 && r.y < 860;
      });
      const d1 = document.querySelector('.artdeco-dropdown__content');
      const d1ok = d1 && d1.getBoundingClientRect().width > 0;
      return uls.length > 0 || d1ok;
    }, { timeout: 3000 }).catch(() => {}); // si timeout, igual intentamos buscar

    // A1+A3: buscar Conectar en artdeco + ul con límite correcto ry < 860
    let cBbox = await page.evaluate(() => {
      const MAX_Y = 860;
      // 1. artdeco dropdown
      const d1 = document.querySelector('.artdeco-dropdown__content');
      if (d1) {
        const r1 = d1.getBoundingClientRect();
        if (r1.width > 0 && r1.height > 0 && r1.y > 0) {
          const el = Array.from(d1.querySelectorAll('*')).find(e => {
            const t = (e.innerText || '').trim(), ry = e.getBoundingClientRect().y;
            return (t === 'Conectar' || t === 'Connect' || t === 'Conectar-se') &&
                   e.getBoundingClientRect().width > 0 && ry > 50 && ry < MAX_Y;
          });
          if (el) { const rc = el.getBoundingClientRect(); return { x: rc.x, y: rc.y, w: rc.width, h: rc.height, via: 'artdeco' }; }
        }
      }
      // 2. ul visible (Sales Nav usa ul — confirmado en test)
      for (const ul of Array.from(document.querySelectorAll('ul'))) {
        const r = ul.getBoundingClientRect();
        if (r.width < 40 || r.y < 50 || r.y > MAX_Y) continue;
        const el = Array.from(ul.querySelectorAll('*')).find(e => {
          const t = (e.innerText || '').trim(), ry = e.getBoundingClientRect().y;
          return (t === 'Conectar' || t === 'Connect' || t === 'Conectar-se') &&
                 e.getBoundingClientRect().width > 0 && ry > 50 && ry < MAX_Y;
        });
        if (el) { const rc = el.getBoundingClientRect(); return { x: rc.x, y: rc.y, w: rc.width, h: rc.height, via: 'ul' }; }
      }
      // A9: detectar "Seguir" / "Follow" — ya conectado, no es error
      const sigueEl = Array.from(document.querySelectorAll('*')).find(e => {
        const t = (e.innerText || '').trim(), r = e.getBoundingClientRect();
        return (t === 'Seguir' || t === 'Follow' || t === 'Seguir de vuelta') &&
               r.width > 0 && r.y > 50 && r.y < MAX_Y;
      });
      if (sigueEl) return { via: 'ya-conectado' };
      return null;
    });

    // A9: si encontró "Seguir" → ya están conectados
    if (cBbox?.via === 'ya-conectado') {
      await page.keyboard.press('Escape').catch(() => {});
      log(cuenta, `F4 [diag] Perfil ya conectado (Seguir en dropdown) — ${nombre}`);
      return { resultado: 'no-connect-option', nombre };
    }

    // A8: fallback N7 — hover doble si primer intento no encontró Conectar
    if (!cBbox) {
      log(cuenta, `F4 [A8] Primer intento fallido → reintento con hover doble — ${nombre}`);
      await page.keyboard.press('Escape').catch(() => {});
      await delay(400);
      // Re-hover card + hover largo al botón ···
      if (cardBbox) {
        await page.mouse.move(cardBbox.x + cardBbox.width / 2, cardBbox.y + cardBbox.height / 2);
        await delay(300);
      }
      const moreBtnBbox2 = await profileEl.evaluate(el => {
        const btn = Array.from(el.querySelectorAll('button[aria-label]')).find(b => {
          const a = (b.getAttribute('aria-label') || '').toLowerCase();
          return a.includes('acciones') || a.includes('actions') || a.includes('ações');
        }) || el.querySelector('[data-search-overflow-trigger]');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return r.width > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
      }).catch(() => null);
      if (moreBtnBbox2) {
        await page.mouse.move(moreBtnBbox2.x + moreBtnBbox2.w / 2, moreBtnBbox2.y + moreBtnBbox2.h / 2);
        await delay(400);
        await page.mouse.click(moreBtnBbox2.x + moreBtnBbox2.w / 2, moreBtnBbox2.y + moreBtnBbox2.h / 2);
        await delay(1200);
        cBbox = await page.evaluate(() => {
          const MAX_Y = 860;
          for (const ul of Array.from(document.querySelectorAll('ul'))) {
            const r = ul.getBoundingClientRect();
            if (r.width < 40 || r.y < 50 || r.y > MAX_Y) continue;
            const el = Array.from(ul.querySelectorAll('*')).find(e => {
              const t = (e.innerText || '').trim(), ry = e.getBoundingClientRect().y;
              return (t === 'Conectar' || t === 'Connect' || t === 'Conectar-se') &&
                     e.getBoundingClientRect().width > 0 && ry > 50 && ry < MAX_Y;
            });
            if (el) { const rc = el.getBoundingClientRect(); return { x: rc.x, y: rc.y, w: rc.width, h: rc.height, via: 'ul-retry' }; }
          }
          return null;
        });
      }
    }

    if (!cBbox) {
      await page.keyboard.press('Escape').catch(() => {});
      // Diagnóstico: qué opciones hay en el dropdown
      const optsDropdown = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('ul li, .artdeco-dropdown__content li').forEach(e => {
          const t = (e.innerText || e.textContent || '').trim();
          if (t && t.length < 50) items.push(t);
        });
        return [...new Set(items)].slice(0, 8);
      });
      log(cuenta, `F4 [diag] Opciones en dropdown: ${JSON.stringify(optsDropdown)}`);
      log(cuenta, `F4 ✗ Conectar no encontrado en dropdown — ${nombre}`);
      return { resultado: 'no-connect-option', nombre };
    }

    // A6: loggear y-coord en producción — monitorear si sube (indica cambio en LinkedIn)
    log(cuenta, `F4 [M1] Conectar en dropdown via=${cBbox.via} y=${Math.round(cBbox.y)}`);
    await page.mouse.click(cBbox.x + cBbox.w / 2, cBbox.y + cBbox.h / 2);
  }

  await delay(800);

  // FIX E2: waitForSelector real — detecta email, textarea o botón enviar
  const modalSel = 'input[type="email"], input[name="email"], textarea, ' +
    'button:has-text("Send invitation"), button:has-text("Enviar invitación"), ' +
    'button:has-text("Enviar convite"), button:has-text("Enviar"), button:has-text("Send")';
  const modalFound = await page.waitForSelector(modalSel, { timeout: 8000 }).catch(() => null);
  if (!modalFound) {
    log(cuenta, `F4 ✗ Modal no apareció — ${nombre}`);
    return { resultado: 'error', nombre };
  }

  // FIX E2: usar offsetWidth en evaluate, no isVisible({timeout})
  const tieneEmail = await page.evaluate(() => {
    const inp = document.querySelector('input[type="email"], input[name="email"]');
    return inp && inp.offsetWidth > 0;
  });

  if (tieneEmail) {
    // REGLA: Sales Nav no puede conectar con verificación de email directamente.
    // Hay que ir al perfil de linkedin.com/in/ y conectar desde ahí (F6).
    // F6 usa M9 (Conectar directo y 100-500 + waitForSelector) — confirmado funcionando.
    const profileUrl = await profileEl.locator('a[href*="/sales/lead/"], a[href*="/sales/people/"]')
      .first().getAttribute('href', { timeout: 5000 }).catch(() => 'unknown');
    const profileUrlNorm = normalizarUrl(profileUrl);
    // BUG-6 FIX: F4 no conoce el grupo — NO llamar logPendingEmail aquí.
    // F2 recibe el resultado requires-email y llama logPendingEmail con el grupo correcto.
    await page.keyboard.press('Escape').catch(() => {});
    log(cuenta, `F4 → requires-email: mandando a F6 — ${nombre}`);
    return { resultado: 'requires-email', nombre, profileUrl: profileUrlNorm };
  }

  // Expandir nota si hay botón
  const addNoteBtn = page.locator('button:has-text("Add a note")')
    .or(page.locator('button:has-text("Agregar nota")'))
    .or(page.locator('button:has-text("Añadir una nota")'))
    .or(page.locator('button:has-text("Adicionar nota")'));
  if (await addNoteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await addNoteBtn.click();
    await delay(600);
  }

  // Fill textarea — execCommand (ERROR #11: keyboard.type dispara atajos Ember.js)
  const textarea = page.locator('textarea').first();
  if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
    await textarea.click();
    await delay(300);
    await page.evaluate((txt) => {
      const el = document.querySelector('textarea');
      if (el) { el.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, txt); }
    }, mensaje);
    await delay(500);
  }

  const sendBtn = page.locator('button:has-text("Send invitation")')
    .or(page.locator('button:has-text("Enviar invitación")'))
    .or(page.locator('button:has-text("Enviar convite")'))
    .or(page.locator('button:has-text("Enviar")'))
    .or(page.locator('button:has-text("Send")'));
  if (!await sendBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.keyboard.press('Escape').catch(() => {});
    log(cuenta, `F4 ✗ Botón Send no visible — ${nombre}`);
    return { resultado: 'error', nombre };
  }

  await sendBtn.first().click();
  await verificarPendingPostEnvio(page);
  log(cuenta, `F4 ✓ Enviada — ${nombre}`);
  await delay(1500);
  return { resultado: 'enviada', nombre };
}

// ═══════════════════════════════════════════════════════════════
// C1 — revisarPaginaCompleta
// ═══════════════════════════════════════════════════════════════
// Pasada final antes de cambiar de página.
// Scroll top → re-escaneo → intenta candidatos no procesados.
// Captura perfiles que no cargaron en tiempo durante el scroll principal.

async function revisarPaginaCompleta(page, cuenta, cuotaRestante, grupo, quotaState, idsYaProcesados, idsError = new Set()) {
  if (cuotaRestante <= 0 || !quedanInvitaciones(quotaState, cuenta)) return { enviados: 0 };

  log(cuenta, `C1 Revisión pre-página — scroll top + re-escaneo`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(1500);
  await cerrarBanners(page);

  const todosItems = await page.locator(SELECTOR_PERFILES).all();
  let enviados = 0;

  for (const item of todosItems) {
    if (enviados >= cuotaRestante || !quedanInvitaciones(quotaState, cuenta)) break;

    const href = await item.locator('a[href*="/sales/lead/"], a[href*="/sales/people/"]').first().getAttribute('href', { timeout: 5000 }).catch(() => '');
    const key  = normalizarUrl(href);
    if (!key || idsYaProcesados.has(key)) continue;
    if (idsError.has(key)) continue; // D3: skip perfiles con error estructural
    idsYaProcesados.add(key);

    const estado = await verificarEstadoPerfil(item);
    if (estado !== 'candidato') continue;

    const { resultado, nombre, profileUrl: profileUrlC1 } = await enviarInvitacion(page, item, cuenta);
    if (resultado === 'enviada') {
      await registrarEnvio(quotaState, cuenta, grupo);
      enviados++;
      log(cuenta, `C1 ✓ Recuperado: ${nombre} | Total: ${totalEnviado(quotaState, cuenta)}/${CUOTA_TOTAL}`);
      await reportState(cuenta, {
        state: 'running',
        sent: totalEnviado(quotaState, cuenta),
        counts: quotaState.counts[cuenta],
        session: quotaState.counts[cuenta],
        lastActivity: `C1 ✅ ${nombre} (total: ${totalEnviado(quotaState, cuenta)})`,
      });
      await delay(2000 + Math.random() * 1500);
    } else if (resultado === 'requires-email' && profileUrlC1) {
      // BUG-5 FIX: C1 ignoraba silenciosamente los requires-email
      // Agregar al pending para que C2 los procese después
      logPendingEmail(cuenta, nombre, profileUrlC1, grupo);
      log(cuenta, `C1 → requires-email enviado a F6: ${nombre}`);
    }
  }

  log(cuenta, `C1 Revisión completada — ${enviados} adicionales`);
  return { enviados };
}

// ═══════════════════════════════════════════════════════════════
// F6 — enviarConEmail
// ═══════════════════════════════════════════════════════════════
// Para perfiles que requieren email en Sales Nav:
//   1. Navegar al lead en Sales Nav → encontrar link al perfil LinkedIn
//   2. Conectar desde LinkedIn con email augusto@globalita.io + mensaje
// Retorna: 'enviada' | 'error'

const EMAIL_REMITENTE = 'augusto@globalita.io';

async function enviarConEmail(page, profileSalesNavUrl, nombre, cuenta) {
  log(cuenta, `F6 Iniciando flow email — ${nombre}`);

  // ── 1. Navegar al perfil en Sales Nav ────────────────────────
  const salesNavUrl = profileSalesNavUrl.startsWith('http')
    ? profileSalesNavUrl
    : `https://www.linkedin.com${profileSalesNavUrl}`;

  try {
    await page.goto(salesNavUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('button[aria-label*="Guardar"], button[aria-label*="Save"], button[aria-label*="Salvar"]', { timeout: 12000 }).catch(() => {});
    await delay(800);
    await cerrarBanners(page);
  } catch (err) {
    log(cuenta, `F6 ✗ No se pudo navegar al lead SalesNav — ${nombre}`);
    return 'error';
  }

  // ── 2. Abrir dropdown ··· → "Ver perfil de LinkedIn" ────────
  // El botón ··· en lead detail page tiene aria-label distinto al de la lista.
  // Esperamos la carga completa del header antes de buscar.

  // Esperar que los botones de acción del lead estén disponibles
  await page.waitForSelector(
    'button[aria-label*="Guardar"], button[aria-label*="Save"], button[aria-label*="Salvar"], ' +
    '[data-view-name="lead-actions"], .profile-topcard__actions',
    { timeout: 10000 }
  ).catch(() => {});
  await delay(1000);

  // Selectores del ··· en lead detail page
  // "Abrir el menú de exceso de acciones" — aria-label real confirmado en log diagnóstico ES
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
  log(cuenta, `F6 [diag] Botón ··· visible: ${moreBtnVisible}`);

  if (!moreBtnVisible) {
    // Diagnóstico: loggear todos los botones del DOM para identificar el aria-label real
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button[aria-label]'))
        .map(b => b.getAttribute('aria-label')).filter(Boolean).slice(0, 15)
    );
    log(cuenta, `F6 [diag] aria-labels en página: ${JSON.stringify(btns)}`);
    log(cuenta, `F6 ✗ Botón ··· no encontrado en lead SalesNav — ${nombre}`);
    return 'error';
  }

  // BUG-1 FIX: click sin try/catch mataba la cuenta si LinkedIn tiraba error
  try {
    await moreBtnSalesNav.click();
  } catch (err) {
    log(cuenta, `F6 ✗ Error clicking botón ··· SalesNav: ${err.message.split('\n')[0]} — ${nombre}`);
    return 'error';
  }
  await delay(1000);

  // Opción "Ver perfil de LinkedIn" en el dropdown (tri-lingual + variantes)
  const verLinkedinOpt = page.getByText('Ver perfil de LinkedIn', { exact: true })
    .or(page.getByText('View LinkedIn profile', { exact: true }))
    .or(page.getByText('Ver perfil do LinkedIn', { exact: true }))
    .or(page.getByText('View on LinkedIn', { exact: true }))
    .or(page.getByText('Ver en LinkedIn', { exact: true }))
    .first();

  const verLinkedinVisible = await verLinkedinOpt.isVisible({ timeout: 3000 }).catch(() => false);
  log(cuenta, `F6 [diag] "Ver perfil de LinkedIn" visible: ${verLinkedinVisible}`);

  if (!verLinkedinVisible) {
    // Diagnóstico: loggear opciones del dropdown
    const opts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], li'))
        .map(el => el.textContent?.trim()).filter(t => t && t.length < 60).slice(0, 10)
    );
    log(cuenta, `F6 [diag] opciones dropdown: ${JSON.stringify(opts)}`);
    await page.keyboard.press('Escape').catch(() => {});
    log(cuenta, `F6 ✗ Opción "Ver perfil de LinkedIn" no encontrada — ${nombre}`);
    return 'error';
  }

  // Extraer href del dropdown ANTES de hacer click — por si no abre nueva pestaña
  const linkedinHrefDropdown = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('a[href]'));
    const match = all.find(a => a.href && a.href.includes('linkedin.com/in/') && !a.href.includes('/sales/'));
    return match ? match.href : null;
  });
  log(cuenta, `F6 [diag] href en dropdown: ${linkedinHrefDropdown || 'null'}`);

  // Click + capturar nueva pestaña
  // Si abre nueva pestaña: operar sobre ella directamente (no cerrar y renavergar)
  // Si abre en misma pestaña: usar URL resultante para goto
  let linkedinPage = page; // por defecto operar en la misma página

  // BUG-2 FIX: timeout 8000ms → 2500ms para evitar 8s de hang si LinkedIn
  // abre en la misma pestaña (comportamiento válido y frecuente)
  const [newTab] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 2500 }).catch(() => null),
    verLinkedinOpt.click().catch(() => {}),
  ]);

  if (newTab) {
    await newTab.waitForLoadState('domcontentloaded').catch(() => {});
    await delay(2000);
    await cerrarBanners(newTab);
    linkedinPage = newTab; // operar sobre la nueva pestaña directamente
    log(cuenta, `F6 [diag] Nueva pestaña: ${linkedinPage.url()}`);
  } else {
    // misma pestaña — si tenemos href del dropdown, navegar directamente
    if (linkedinHrefDropdown && linkedinHrefDropdown.includes('linkedin.com/in/')) {
      try {
        await page.goto(linkedinHrefDropdown, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await delay(2000);
        await cerrarBanners(page);
        log(cuenta, `F6 [diag] Navegado por href dropdown: ${linkedinHrefDropdown}`);
      } catch (err) {
        log(cuenta, `F6 ✗ Error navegando al perfil LinkedIn — ${nombre}`);
        return 'error';
      }
    } else {
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      log(cuenta, `F6 [diag] Misma pestaña: ${page.url()}`);
    }
  }

  const linkedinUrl = linkedinPage.url();
  if (!linkedinUrl.includes('linkedin.com/in/')) {
    log(cuenta, `F6 ✗ URL no es perfil LinkedIn: ${linkedinUrl} — ${nombre}`);
    if (newTab) await newTab.close().catch(() => {});
    return 'error';
  }

  log(cuenta, `F6 ✓ En perfil LinkedIn: ${linkedinUrl}`);

  // ── 3. M9 + fallback — REESCRITO con fixes B1-B8 ────────────────────────
  // B6: waitForSelector del botón Conectar O acciones (señal real de carga)
  await linkedinPage.waitForSelector(
    'button[aria-label*="acciones"], button[aria-label*="actions"], ' +
    'button:has-text("Conectar"), button:has-text("Connect"), button:has-text("Ligar")',
    { timeout: 12000 }
  ).catch(() => {});
  await cerrarBanners(linkedinPage);

  // FIX BUG#13: scrollTo(0,200) saca el botón del navbar (y≈11 → y>100)
  await linkedinPage.evaluate(() => window.scrollTo(0, 200));
  // B7: delay 1000ms (antes 600ms) — linkedin.com/in/ carga contenido lazy
  await delay(1000);
  await cerrarBanners(linkedinPage);

  // B5: loggear y-coord del Conectar ANTES del evaluate principal
  const conectarPreY = await linkedinPage.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(b => {
      const t = (b.innerText || b.textContent || '').trim();
      return (t === 'Conectar' || t === 'Connect' || t === 'Ligar') && b.getBoundingClientRect().width > 0;
    });
    return b ? Math.round(b.getBoundingClientRect().y) : null;
  });
  log(cuenta, `F6 [B5] Conectar pre-evaluate y=${conectarPreY ?? 'no encontrado'}`);

  // ── M9 + C2/C8: lógica de estado del header ────────────────────────────────
  // APRENDIZAJE test-bug2b: Russell Deakin tiene SOLO "Seguir" en header.
  // Todos sus "Conectar" estaban en aside (sidebar x=1047). M9 sin filtro los tomaba.
  // FIX C2: detectar estado del header (Seguir vs Conectar) antes de decidir el path.
  // FIX C8: si Seguir → ir directo a "Más" sin intentar M9.
  // FIX C5: si M9 clickea pero modal no aparece en 3s → fallback automático a "Más".

  const estadoHeader = await linkedinPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.y > 100 && r.y < 420 && r.x < 750;
    }).map(b => (b.innerText || b.textContent || '').trim());
    if (btns.includes('Conectar') || btns.includes('Connect') || btns.includes('Ligar'))
      return 'conectar-directo';
    if (btns.includes('Seguir') || btns.includes('Follow'))
      return 'seguir-necesita-mas';
    return 'desconocido';
  });
  log(cuenta, `F6 [C2] Estado header: ${estadoHeader}`);

  // Helper: abrir "Más" → buscar Conectar en artdeco + ul (MAX_Y=860)
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
    if (!masBbox) { log(cuenta, `F6 ✗ Botón Más no encontrado — ${nombre}`); return false; }
    log(cuenta, `F6 [C8] Más y=${Math.round(masBbox.y)} → click`);
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
      return null;
    });
    if (!cBbox) {
      const opts = await linkedinPage.evaluate(() => {
        const items = []; document.querySelectorAll('.artdeco-dropdown__content li, ul li').forEach(e => { const t=(e.innerText||e.textContent||'').trim(); if(t&&t.length<50)items.push(t); }); return [...new Set(items)].slice(0,8);
      });
      log(cuenta, `F6 [diag] Dropdown: ${JSON.stringify(opts)}`);
      await linkedinPage.keyboard.press('Escape').catch(() => {}); return false;
    }
    log(cuenta, `F6 [C8] Conectar via=${cBbox.via} y=${Math.round(cBbox.y)}`);
    await linkedinPage.mouse.click(cBbox.x + cBbox.w/2, cBbox.y + cBbox.h/2);
    return true;
  };

  if (estadoHeader === 'seguir-necesita-mas') {
    // C2: "Seguir" en header → Conectar bajo "Más"
    const ok = await clickMasYConectar();
    if (!ok) { if (newTab) await newTab.close().catch(() => {}); return 'error'; }

  } else if (estadoHeader === 'conectar-directo') {
    // M9 con filtro x<750 (excluye sidebar en x>1000)
    const cd = await linkedinPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button')).filter(b => {
        const t = (b.innerText || b.textContent || '').trim();
        const r = b.getBoundingClientRect();
        return (t === 'Conectar' || t === 'Connect' || t === 'Ligar') &&
               r.width > 0 && r.y > 100 && r.y < 500 && r.x < 750;
      });
      if (!btns.length) return null;
      const r = btns[0].getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (!cd) {
      log(cuenta, `F6 [C2] Conectar no en x<750 → fallback Más`);
      const ok = await clickMasYConectar();
      if (!ok) { if (newTab) await newTab.close().catch(() => {}); return 'error'; }
    } else {
      log(cuenta, `F6 [M9] Conectar directo x=${Math.round(cd.x)} y=${Math.round(cd.y)}`);
      await linkedinPage.mouse.move(cd.x + cd.w/2, cd.y + cd.h/2);
      await delay(150);
      await linkedinPage.mouse.click(cd.x + cd.w/2, cd.y + cd.h/2);
      // C5: si modal no aparece en 3s → Escape + fallback Más
      const mc = await linkedinPage.waitForSelector(
        'input[type="email"], textarea, button:has-text("Send invitation"), button:has-text("Enviar invitación")',
        { timeout: 3000 }
      ).catch(() => null);
      if (!mc) {
        log(cuenta, `F6 [C5] M9 no abrió modal → fallback Más`);
        await linkedinPage.keyboard.press('Escape').catch(() => {});
        await delay(500);
        const ok = await clickMasYConectar();
        if (!ok) { if (newTab) await newTab.close().catch(() => {}); return 'error'; }
      }
    }
  } else {
    // Estado desconocido: intentar Más directamente
    log(cuenta, `F6 [C8] Estado desconocido → intentar Más`);
    const ok = await clickMasYConectar();
    if (!ok) { if (newTab) await newTab.close().catch(() => {}); return 'error'; }
  }


  await delay(800);

  // ── 4. Modal: waitForSelector real + email + nota + enviar ───────────────
  // FIX E2: waitForSelector detecta el modal antes de revisar el email
  const modalSelF6 = 'input[type="email"], input[name="email"], textarea, ' +
    'button:has-text("Send invitation"), button:has-text("Enviar invitación"), ' +
    'button:has-text("Enviar convite"), button:has-text("Enviar"), button:has-text("Send")';
  const modalFoundF6 = await linkedinPage.waitForSelector(modalSelF6, { timeout: 8000 }).catch(() => null);
  if (!modalFoundF6) {
    log(cuenta, `F6 ✗ Modal no apareció — ${nombre}`);
    if (newTab) await newTab.close().catch(() => {});
    return 'error';
  }

  // FIX E2: evaluate offsetWidth, no isVisible({timeout})
  const tieneEmailF6 = await linkedinPage.evaluate(() => {
    const inp = document.querySelector('input[type="email"], input[name="email"]');
    return inp && inp.offsetWidth > 0;
  });

  if (!tieneEmailF6) {
    // Sin email — agregar nota antes de enviar
    const addNoteSinEmail = linkedinPage.locator('button:has-text("Add a note")')
      .or(linkedinPage.locator('button:has-text("Agregar nota")'))
      .or(linkedinPage.locator('button:has-text("Añadir una nota")'))
      .or(linkedinPage.locator('button:has-text("Adicionar nota")'));
    if (await addNoteSinEmail.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addNoteSinEmail.click();
      await delay(600);
    }
    const textareaSinEmail = linkedinPage.locator('textarea').first();
    if (await textareaSinEmail.isVisible({ timeout: 2000 }).catch(() => false)) {
      const bodyTextSin = await linkedinPage.evaluate(() => document.body.innerText).catch(() => '');
      const mensajeSinEmail = getMensaje(cuenta, bodyTextSin);
      await textareaSinEmail.click();
      await delay(300);
      await linkedinPage.evaluate((txt) => {
        const el = document.querySelector('textarea');
        if (el) { el.focus(); document.execCommand('selectAll',false,null); document.execCommand('insertText',false,txt); }
      }, mensajeSinEmail);
      await delay(500);
    }
    const sendBtnSinEmail = linkedinPage.locator('button:has-text("Send invitation")')
      .or(linkedinPage.locator('button:has-text("Enviar invitación")'))
      .or(linkedinPage.locator('button:has-text("Enviar convite")'))
      .or(linkedinPage.locator('button:has-text("Enviar")'))
      .or(linkedinPage.locator('button:has-text("Send")'));
    if (await sendBtnSinEmail.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await sendBtnSinEmail.first().click();
      log(cuenta, `F6 ✓ Enviada sin email (con nota) — ${nombre}`);
      await delay(1500);
      if (newTab) await newTab.close().catch(() => {});
      return 'enviada';
    }
  } else {
    // Con email — llenarlo
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
    log(cuenta, `F6 [M9] email: ${EMAIL_REMITENTE}`);
  }

  // Expandir nota
  const addNoteBtnF6 = linkedinPage.locator('button:has-text("Add a note")')
    .or(linkedinPage.locator('button:has-text("Agregar nota")'))
    .or(linkedinPage.locator('button:has-text("Añadir una nota")'))
    .or(linkedinPage.locator('button:has-text("Adicionar nota")'));
  if (await addNoteBtnF6.isVisible({ timeout: 2000 }).catch(() => false)) {
    await addNoteBtnF6.click();
    await delay(600);
  }

  // Fill nota — execCommand (ERROR #11)
  const textareaF6 = linkedinPage.locator('textarea').first();
  if (await textareaF6.isVisible({ timeout: 2000 }).catch(() => false)) {
    const bodyText = await linkedinPage.evaluate(() => document.body.innerText).catch(() => '');
    const mensaje  = getMensaje(cuenta, bodyText);
    await textareaF6.click();
    await delay(300);
    await linkedinPage.evaluate((txt) => {
      const el = document.querySelector('textarea');
      if (el) { el.focus(); document.execCommand('selectAll',false,null); document.execCommand('insertText',false,txt); }
    }, mensaje);
    await delay(500);
  }

  const sendBtnF6 = linkedinPage.locator('button:has-text("Send invitation")')
    .or(linkedinPage.locator('button:has-text("Enviar invitación")'))
    .or(linkedinPage.locator('button:has-text("Enviar convite")'))
    .or(linkedinPage.locator('button:has-text("Enviar")'))
    .or(linkedinPage.locator('button:has-text("Send")'));
  if (!await sendBtnF6.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await linkedinPage.keyboard.press('Escape').catch(() => {});
    log(cuenta, `F6 ✗ Botón Send no disponible — ${nombre}`);
    if (newTab) await newTab.close().catch(() => {});
    return 'error';
  }

  await sendBtnF6.first().click();
  // BUG-4 FIX: verificar que el modal se cerró y no hay error visible de LinkedIn
  await delay(1200);
  const envioOk = await linkedinPage.evaluate(() => {
    // Si el modal sigue abierto con el mismo botón Send → no se envió
    const sendAun = Array.from(document.querySelectorAll('button')).find(b => {
      const t = (b.innerText || '').trim();
      return (t === 'Send invitation' || t === 'Enviar invitación' || t === 'Enviar convite' || t === 'Enviar' || t === 'Send') && b.offsetWidth > 0;
    });
    // Si aparece texto de error de LinkedIn → fallo
    const hayError = document.body.innerText.includes('Something went wrong') ||
                     document.body.innerText.includes('Algo salió mal') ||
                     document.body.innerText.includes('Algo correu mal');
    return !sendAun && !hayError;
  });
  if (!envioOk) {
    log(cuenta, `F6 ✗ Modal aún visible post-click — invitación posiblemente no enviada — ${nombre}`);
    await linkedinPage.keyboard.press('Escape').catch(() => {});
    if (newTab) await newTab.close().catch(() => {});
    return 'error';
  }
  log(cuenta, `F6 ✓ Enviada con email (${EMAIL_REMITENTE}) — ${nombre}`);
  await delay(500);
  if (newTab) await newTab.close().catch(() => {});
  return 'enviada';
}

// ═══════════════════════════════════════════════════════════════
// F5 — irSiguientePagina
// ═══════════════════════════════════════════════════════════════

async function irSiguientePagina(page, cuenta) {
  const nextBtn = page.locator('button[aria-label="Next"]')
    .or(page.locator('button[aria-label="Siguiente"]'))
    .or(page.locator('button[aria-label="Próxima"]'))
    .or(page.locator('button[aria-label="Próximo"]'))
    .first();

  // R1 del KB: usar waitForSelector en lugar de isVisible
  const nextEl = await page.waitForSelector(
    'button[aria-label="Next"], button[aria-label="Siguiente"], button[aria-label="Próxima"], button[aria-label="Próximo"]',
    { timeout: 5000 }
  ).catch(() => null);
  if (!nextEl) return { ok: false };

  const disabled = await nextBtn.isDisabled().catch(() => true);
  if (disabled) return { ok: false };

  // Leer página actual via URL (único método confirmado en KB)
  const paginaAntes = new URL(page.url()).searchParams.get('page') || '1';

  await nextBtn.click();

  // R9 del KB: NUNCA networkidle en LinkedIn — usar waitForSelector en un perfil
  await page.waitForSelector(
    'ol li:has(a[href*="/sales/lead/"]), ol li:has(a[href*="/sales/people/"]), ul li:has(a[href*="/sales/lead/"]), ul li:has(a[href*="/sales/people/"])',
    { timeout: 15000 }
  ).catch(() => {});
  await delay(2000);
  await cerrarBanners(page);

  const paginaDespues = new URL(page.url()).searchParams.get('page') || '1';
  if (paginaDespues === paginaAntes) {
    log(cuenta, `F5 ✗ Página no avanzó (sigue en ${paginaAntes}) — fin de lista`);
    return { ok: false };
  }
  log(cuenta, `F5 ✓ Página ${paginaAntes} → ${paginaDespues}`);
  return { ok: true, pagina: parseInt(paginaDespues) || 0 };
}

// ═══════════════════════════════════════════════════════════════
// runAccount — orquestador por cuenta
// ═══════════════════════════════════════════════════════════════

async function runAccount(cuenta, quotaState) {
  log(cuenta, `════ Iniciando | cuota hoy: ${totalEnviado(quotaState, cuenta)}/${CUOTA_TOTAL} ════`);
  await reportState(cuenta, { state: 'running', lastActivity: 'Iniciando...' });

  if (!quedanInvitaciones(quotaState, cuenta)) {
    log(cuenta, `Cuota completada — nada que hacer`);
    await reportState(cuenta, { state: 'done', lastActivity: 'Cuota completada' });
    return;
  }

  // E2: Fallback — procesar pending-email.json del disco al inicio
  // B9: sistema de intentos — skip perfiles con >= 3 intentos fallidos
  const MAX_INTENTOS_F6 = 3;
  const pendientesDelDisco = (() => {
    try {
      if (!fs.existsSync(PENDING_FILE)) return [];
      const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
      const deCuenta = list.filter(p => p.cuenta === cuenta);
      const activos  = deCuenta.filter(p => !p.intentos || p.intentos < MAX_INTENTOS_F6);
      const agotados = deCuenta.filter(p => p.intentos && p.intentos >= MAX_INTENTOS_F6);
      if (agotados.length > 0) {
        log(cuenta, `F6 [B9] ${agotados.length} perfil(es) con >=${MAX_INTENTOS_F6} intentos — saltados: ${agotados.map(p=>p.nombre).join(', ')}`);
      }
      return activos;
    } catch { return []; }
  })();

  if (pendientesDelDisco.length > 0) {
    // FIX RUSSELL: no abrir browser separado — "Target page has been closed"
    // Los pendientes se procesan en el browser principal del flujo (todosPendEmail abajo)
    log(cuenta, `F6 [fallback] ${pendientesDelDisco.length} pendiente(s) en disco — se procesarán en flujo principal`);
  }

  if (!quedanInvitaciones(quotaState, cuenta)) {
    log(cuenta, `Cuota completada — nada que hacer`);
    return;
  }

  const plan = calcularPlan(quotaState, cuenta);
  log(cuenta, `Plan: ${plan.map(p => `${p.search.nombre}(${p.cuota})${p.esCompensacion ? '*' : ''}`).join(' | ')}`);

  let browser;
  try {
    browser = await chromium.launchPersistentContext(SESSION_DIRS[cuenta], {
      headless: false,
      viewport: { width: 1280, height: 860 },
    });
    await reportState(cuenta, { state: 'running', startedAt: new Date().toISOString(), lastActivity: 'Browser iniciado' });

    const page = await browser.newPage();
    // F1: declarado fuera del for — deduplicación entre planItems (primary + compensación)
    const todosPendEmail = [];

    // FIX RUSSELL: pendientes del disco se procesan con el mismo browser, no uno separado
    if (pendientesDelDisco.length > 0) {
      for (const p of pendientesDelDisco) {
        if (!todosPendEmail.some(x => x.profileUrl === p.profileUrl))
          todosPendEmail.push(p);
      }
    }

    for (const planItem of plan) {
      const { search, cuota, grupo, esCompensacion } = planItem;

      if (!quedanInvitaciones(quotaState, cuenta)) break;

      log(cuenta, `── "${search.nombre}" | cuota: ${cuota}${esCompensacion ? ' (comp)' : ''}`);

      const resF1 = await abrirBusquedaGuardada(page, search, cuenta);
      if (!resF1.ok) { log(cuenta, `F1 falló — saltando lista`); continue; }

      // Delay post-F1: dar tiempo a que carguen los resultados antes de F2
      await new Promise(r => setTimeout(r, 3000));

      let enviadosEnLista = 0;
      let pagina          = 1;

      // Loop de páginas — F2 procesa con scroll progresivo (Camino 1)
      while (enviadosEnLista < cuota && quedanInvitaciones(quotaState, cuenta)) {
        const resF2 = await procesarPerfilesConScroll(page, cuenta, cuota - enviadosEnLista, grupo, quotaState);
        enviadosEnLista += resF2.enviados;

        // Acumular pendientes de email — F1: dedup cross-planItem por profileUrl
        if (resF2.pendientesEmail && resF2.pendientesEmail.length > 0) {
          for (const p of resF2.pendientesEmail) {
            if (!todosPendEmail.some(x => x.profileUrl === p.profileUrl))
              todosPendEmail.push(p);
          }
        }

        // C1: revisión pre-página si la página se agotó
        if (resF2.agotada && quedanInvitaciones(quotaState, cuenta)) {
          const resC1 = await revisarPaginaCompleta(page, cuenta, cuota - enviadosEnLista, grupo, quotaState, resF2.idsVistos, resF2.idsError);
          enviadosEnLista += resC1.enviados;
        }

        // F5: siguiente página si corresponde
        if (resF2.agotada && enviadosEnLista < cuota && quedanInvitaciones(quotaState, cuenta)) {
          const resF5 = await irSiguientePagina(page, cuenta);
          if (!resF5.ok) break;
          pagina++;
        } else {
          break; // cuota alcanzada o sin más páginas
        }
      }

      log(cuenta, `"${search.nombre}" completada: ${enviadosEnLista} enviadas`);
    }

    // C2: flow email — fuera del for, una sola pasada con lista deduplicada
    if (todosPendEmail.length > 0) {
      log(cuenta, `F6 ${todosPendEmail.length} perfil(es) requieren email — iniciando flow`);
      for (const pendiente of todosPendEmail) {
        if (!quedanInvitaciones(quotaState, cuenta)) break;
        const resF6 = await enviarConEmail(page, pendiente.profileUrl, pendiente.nombre, cuenta);
        if (resF6 === 'enviada') {
          await registrarEnvio(quotaState, cuenta, pendiente.grupo);
          log(cuenta, `F6 Contadores: ${JSON.stringify(quotaState.counts[cuenta])} | Total: ${totalEnviado(quotaState, cuenta)}/${CUOTA_TOTAL}`);
          await reportState(cuenta, {
            state: 'running',
            sent: totalEnviado(quotaState, cuenta),
            counts: quotaState.counts[cuenta],
            session: quotaState.counts[cuenta],
            lastActivity: `F6 ✅ email enviado a ${pendiente.nombre} (total: ${totalEnviado(quotaState, cuenta)})`,
          });
          // BUG-3 FIX: mutex en remoción — 3 cuentas paralelas pueden pisarse
          const ahora3r = Date.now(); const tope3r = ahora3r + 2000;
          while (_escribiendoPending && Date.now() < tope3r) { /* spin */ }
          _escribiendoPending = true;
          try {
            const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
            fs.writeFileSync(PENDING_FILE, JSON.stringify(list.filter(x => x.profileUrl !== pendiente.profileUrl), null, 2));
          } catch {} finally { _escribiendoPending = false; }
        } else {
          // BUG-3 FIX: mutex en incremento de intentos
          const ahora3i = Date.now(); const tope3i = ahora3i + 2000;
          while (_escribiendoPending && Date.now() < tope3i) { /* spin */ }
          _escribiendoPending = true;
          try {
            const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
            const idx  = list.findIndex(x => x.profileUrl === pendiente.profileUrl);
            if (idx >= 0) {
              list[idx].intentos = (list[idx].intentos || 0) + 1;
              list[idx].ultimoIntento = new Date().toISOString();
              fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));
              log(cuenta, `F6 [B9] ${pendiente.nombre} — intento ${list[idx].intentos}/${MAX_INTENTOS_F6}`);
            }
          } catch {} finally { _escribiendoPending = false; }
        }
      }
    }

  } catch (err) {
    log(cuenta, `ERROR: ${err.message}`);
    await reportState(cuenta, { state: 'error', errors: [err.message], lastActivity: `Error: ${err.message}` });
  } finally {
    if (browser) await browser.close();
  }

  log(cuenta, `════ Fin | Total hoy: ${totalEnviado(quotaState, cuenta)}/${CUOTA_TOTAL} | ${JSON.stringify(quotaState.counts[cuenta])} ════`);
  await reportState(cuenta, {
    state: 'done',
    sent: totalEnviado(quotaState, cuenta),
    counts: quotaState.counts[cuenta],
    session: quotaState.counts[cuenta],
    lastActivity: `Completado — ${totalEnviado(quotaState, cuenta)} invitaciones enviadas`,
  });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function normalizarUrl(href) {
  if (!href) return '';
  // FIX BUG2: extraer el ID del lead/people para dedup robusto
  // Las URLs de SalesNav varían en query params entre rondas de scroll
  // Ejemplos:
  //   /sales/lead/ACwAAA123,NAME,SALES_NAV?...  → "ACwAAA123"
  //   /sales/people/ACwAAA123?...               → "ACwAAA123"
  //   /in/username/                             → "/in/username"
  const leadMatch = href.match(/\/sales\/(?:lead|people)\/([A-Za-z0-9_-]+)/);
  if (leadMatch) return leadMatch[1];
  const inMatch = href.match(/\/in\/([^/?#,]+)/);
  if (inMatch) return '/in/' + inMatch[1];
  return href.split('?')[0].split(',')[0];
}

async function cerrarBanners(page) {
  await page.evaluate(() => {
    const sels = ['[data-test-global-alert-dismiss]', '[aria-label="Dismiss"]', '[aria-label="Cerrar"]', '[aria-label="Fechar"]', '.artdeco-global-alert__dismiss', '.global-alert-banner__dismiss'];
    sels.forEach(s => document.querySelectorAll(s).forEach(b => { try { b.click(); } catch(_){} }));
  }).catch(() => {});
}

// scrollAdaptativo eliminado — integrado en procesarPerfilesConScroll (Camino 1)

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const cuentaArg = process.argv[2];

  log('MAIN', `════ invitar-agent.js INICIO ════`);

  const quotaState = cargarCuota();
  log('MAIN', `Fecha: ${quotaState.date} | Cuotas: ${JSON.stringify(quotaState.counts)}`);

  const cuentas = cuentaArg
    ? [cuentaArg]
    : Object.keys(SEARCHES).filter(c => quedanInvitaciones(quotaState, c));

  if (cuentas.length === 0) {
    log('MAIN', 'Todas las cuentas completaron su cuota diaria');
    return;
  }

  log('MAIN', `Cuentas: ${cuentas.join(', ')}`);
  await Promise.all(cuentas.map(c => runAccount(c, quotaState)));

  log('MAIN', `════ RESUMEN ════`);
  for (const c of cuentas) {
    log('MAIN', `  ${c}: ${totalEnviado(quotaState, c)}/${CUOTA_TOTAL} | ${JSON.stringify(quotaState.counts[c])}`);
  }
  log('MAIN', `════ FIN ════`);
}

main().catch(err => {
  log('MAIN', `ERROR FATAL: ${err.message}`);
  process.exit(1);
});
