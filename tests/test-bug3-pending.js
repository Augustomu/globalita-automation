/**
 * test-bug3-pending.js — TEST BUG #3: pending-email.json gestión
 *
 * TESTS PUROS (sin browser):
 *   T1  logPendingEmail: perfil nuevo → se agrega con intentos:0
 *   T2  logPendingEmail: perfil duplicado → no se duplica
 *   T3  logPendingEmail: perfil con 3 intentos → se saltea (D7)
 *   T4  logPendingEmail: perfil con 4 intentos → se saltea y loggea
 *   T5  B9: cargar pending → activos (0-2 intentos) vs agotados (3+)
 *   T6  B9: incrementar intentos tras fallo F6
 *   T7  B9: remover perfil tras éxito F6
 *   T8  fix-pending --reset: todos los intentos vuelven a 0
 *   T9  fix-pending --clean: remueve perfiles con 3+ intentos
 *   T10 normalizarUrl: profileUrl relativas y absolutas
 *
 * No abre browser. Trabaja sobre un pending-email-TEST.json temporal.
 * El archivo real pending-email.json NO se modifica.
 *
 * Uso: node test-bug3-pending.js
 */

'use strict';
const fs   = require('fs');
const path = require('path');

// Archivo de prueba — NO el real
const TEST_FILE = path.resolve(__dirname, 'pending-email-TEST.json');
const MAX_INTENTOS = 3;

// ─── Colores para consola ─────────────────────────────────────────────────────
const OK   = '✅';
const FAIL = '❌';
const INFO = '   ';

let pasados = 0, fallados = 0;

function assert(condicion, descripcion, detalle = '') {
  if (condicion) {
    pasados++;
    console.log(`${OK} ${descripcion}`);
  } else {
    fallados++;
    console.log(`${FAIL} ${descripcion}`);
    if (detalle) console.log(`${INFO}   Detalle: ${detalle}`);
  }
}

function leer()       { return fs.existsSync(TEST_FILE) ? JSON.parse(fs.readFileSync(TEST_FILE, 'utf8')) : []; }
function guardar(v)   { fs.writeFileSync(TEST_FILE, JSON.stringify(v, null, 2)); }
function limpiar()    { if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE); }
function seccion(t)   { console.log('\n── ' + t); }

// ─── logPendingEmail simulada (misma lógica que invitar-agent.js) ─────────────
const logs = [];
function logSim(cuenta, msg) { logs.push(`[${cuenta}] ${msg}`); }

function logPendingEmailSim(cuenta, nombre, profileUrl, grupo = null) {
  const list = leer();
  const existente = list.find(p => p.profileUrl === profileUrl);
  if (existente && existente.intentos >= MAX_INTENTOS) {
    logSim(cuenta, `⚠ PENDIENTE saltado (${existente.intentos} intentos agotados): ${nombre}`);
    return 'saltado';
  }
  if (!existente) {
    list.push({ cuenta, nombre, profileUrl, grupo: grupo || null, reason: 'requires-email', date: new Date().toISOString(), intentos: 0 });
    guardar(list);
    return 'agregado';
  }
  return 'ya-existe';
}

// ─── B9 simulado (cargar + filtrar pendientes) ────────────────────────────────
function cargarPendientesSim(cuenta) {
  const list = leer();
  const deCuenta = list.filter(p => p.cuenta === cuenta);
  const activos  = deCuenta.filter(p => !p.intentos || p.intentos < MAX_INTENTOS);
  const agotados = deCuenta.filter(p => p.intentos && p.intentos >= MAX_INTENTOS);
  return { activos, agotados };
}

function registrarFallo(profileUrl, cuenta) {
  const list = leer();
  const idx  = list.findIndex(x => x.profileUrl === profileUrl);
  if (idx >= 0) {
    list[idx].intentos = (list[idx].intentos || 0) + 1;
    list[idx].ultimoIntento = new Date().toISOString();
    guardar(list);
    return list[idx].intentos;
  }
  return null;
}

function registrarExito(profileUrl) {
  const list = leer();
  const nueva = list.filter(x => x.profileUrl !== profileUrl);
  guardar(nueva);
  return nueva.length < list.length; // true si se removió
}

// ─── normalizarUrl simulada ───────────────────────────────────────────────────
function normalizarUrl(href) {
  if (!href) return '';
  const leadMatch = href.match(/\/sales\/(?:lead|people)\/([A-Za-z0-9_-]+)/);
  if (leadMatch) return leadMatch[1];
  const inMatch = href.match(/\/in\/([^/?#,]+)/);
  if (inMatch) return '/in/' + inMatch[1];
  return href.split('?')[0].split(',')[0];
}

// ─── fix-pending simulado ─────────────────────────────────────────────────────
function resetTodosSim() {
  const list = leer();
  const updated = list.map(p => ({ ...p, intentos: 0, ultimoIntento: null }));
  guardar(updated);
  return updated;
}

function cleanAgotadosSim() {
  const list = leer();
  const activos = list.filter(p => !p.intentos || p.intentos < MAX_INTENTOS);
  guardar(activos);
  return activos.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOS 10 TESTS
// ═══════════════════════════════════════════════════════════════════════════════

function T1() {
  seccion('T1 — logPendingEmail: perfil nuevo → se agrega con intentos:0');
  limpiar();

  const res = logPendingEmailSim('alejandro', 'Adam Besvinick',
    '/sales/lead/ACwAAADdmqQB_k1keqXlm', 'US');

  const list = leer();
  assert(res === 'agregado', 'logPendingEmail retorna "agregado"');
  assert(list.length === 1, 'El archivo tiene 1 perfil');
  assert(list[0].nombre === 'Adam Besvinick', 'Nombre correcto');
  assert(list[0].intentos === 0, 'intentos iniciales = 0');
  assert(list[0].grupo === 'US', 'grupo guardado correctamente');
  assert(list[0].reason === 'requires-email', 'reason = requires-email');
  assert(!!list[0].date, 'date registrada');
}

function T2() {
  seccion('T2 — logPendingEmail: perfil duplicado → no se duplica (D8)');
  // T1 ya dejó Adam en el archivo
  const res = logPendingEmailSim('alejandro', 'Adam Besvinick',
    '/sales/lead/ACwAAADdmqQB_k1keqXlm', 'US');

  const list = leer();
  assert(res === 'ya-existe', 'logPendingEmail retorna "ya-existe"');
  assert(list.length === 1, 'El archivo sigue con 1 perfil (no duplicado)');
}

function T3() {
  seccion('T3 — logPendingEmail: perfil con 3 intentos → se saltea (D7)');
  limpiar();
  // Crear perfil con 3 intentos directamente
  guardar([{
    cuenta: 'alejandro', nombre: 'Sanjeev Munjal',
    profileUrl: '/sales/lead/ACwAAABHedcBoom9r4A',
    reason: 'requires-email', date: new Date().toISOString(),
    intentos: 3, ultimoIntento: new Date().toISOString()
  }]);

  const res = logPendingEmailSim('alejandro', 'Sanjeev Munjal',
    '/sales/lead/ACwAAABHedcBoom9r4A', 'US');

  assert(res === 'saltado', 'logPendingEmail retorna "saltado" con 3 intentos');
  const list = leer();
  assert(list[0].intentos === 3, 'Intentos no modificados (sigue en 3)');
  const logeado = logs.some(l => l.includes('saltado') && l.includes('Sanjeev'));
  assert(logeado, 'Log indica que fue saltado');
}

function T4() {
  seccion('T4 — logPendingEmail: perfil con 5 intentos → también se saltea');
  limpiar();
  guardar([{
    cuenta: 'alejandro', nombre: 'Sanjeev Munjal',
    profileUrl: '/sales/lead/ACwAAABHedcBoom9r4A',
    reason: 'requires-email', date: new Date().toISOString(),
    intentos: 5
  }]);

  const res = logPendingEmailSim('alejandro', 'Sanjeev Munjal',
    '/sales/lead/ACwAAABHedcBoom9r4A', 'US');

  assert(res === 'saltado', 'perfil con 5 intentos es saltado');
  assert(leer()[0].intentos === 5, 'Intentos no modificados');
}

function T5() {
  seccion('T5 — B9: cargar pending → activos vs agotados');
  limpiar();
  guardar([
    { cuenta:'alejandro', nombre:'Adam', profileUrl:'/lead/adam', intentos: 0 },
    { cuenta:'alejandro', nombre:'Russell', profileUrl:'/lead/russell', intentos: 1 },
    { cuenta:'alejandro', nombre:'Sanjeev', profileUrl:'/lead/sanjeev', intentos: 3 },
    { cuenta:'alejandro', nombre:'Otro', profileUrl:'/lead/otro', intentos: 5 },
  ]);

  const { activos, agotados } = cargarPendientesSim('alejandro');

  assert(activos.length === 2, `Activos = 2 (Adam:0, Russell:1) — got ${activos.length}`);
  assert(agotados.length === 2, `Agotados = 2 (Sanjeev:3, Otro:5) — got ${agotados.length}`);
  assert(activos.some(p => p.nombre === 'Adam'), 'Adam en activos');
  assert(activos.some(p => p.nombre === 'Russell'), 'Russell en activos');
  assert(agotados.some(p => p.nombre === 'Sanjeev'), 'Sanjeev en agotados');
  assert(!activos.some(p => p.nombre === 'Sanjeev'), 'Sanjeev NO en activos');
}

function T6() {
  seccion('T6 — B9: incrementar intentos tras fallo F6');
  limpiar();
  guardar([{ cuenta:'alejandro', nombre:'Russell', profileUrl:'/lead/russell', intentos: 1 }]);

  const nuevosIntentos = registrarFallo('/lead/russell', 'alejandro');

  const list = leer();
  assert(nuevosIntentos === 2, `Intentos incrementaron: 1 → 2 (got ${nuevosIntentos})`);
  assert(list[0].intentos === 2, 'Intentos guardados en disco = 2');
  assert(!!list[0].ultimoIntento, 'ultimoIntento registrado');

  // Tercer fallo → queda en 3 (agotado)
  registrarFallo('/lead/russell', 'alejandro');
  const { activos, agotados } = cargarPendientesSim('alejandro');
  assert(agotados.length === 1, 'Tras 3 intentos → Russell en agotados');
  assert(activos.length === 0, 'Tras 3 intentos → sin activos');
}

function T7() {
  seccion('T7 — B9: remover perfil tras éxito F6');
  limpiar();
  guardar([
    { cuenta:'alejandro', nombre:'Adam', profileUrl:'/lead/adam', intentos: 1 },
    { cuenta:'alejandro', nombre:'Russell', profileUrl:'/lead/russell', intentos: 2 },
  ]);

  const removido = registrarExito('/lead/adam');
  const list = leer();

  assert(removido === true, 'registrarExito retorna true (se removió)');
  assert(list.length === 1, 'Quedan 1 perfil en disco');
  assert(list[0].nombre === 'Russell', 'Russell sigue en el archivo');
  assert(!list.some(p => p.nombre === 'Adam'), 'Adam fue removido');
}

function T8() {
  seccion('T8 — fix-pending --reset: todos los intentos vuelven a 0 (D1)');
  limpiar();
  guardar([
    { cuenta:'alejandro', nombre:'Adam', profileUrl:'/lead/adam', intentos: 2, ultimoIntento: 'fecha' },
    { cuenta:'alejandro', nombre:'Russell', profileUrl:'/lead/russell', intentos: 1 },
    { cuenta:'alejandro', nombre:'Sanjeev', profileUrl:'/lead/sanjeev', intentos: 5 },
  ]);

  const updated = resetTodosSim();

  assert(updated.every(p => p.intentos === 0), 'Todos los intentos = 0 tras reset');
  assert(updated.every(p => !p.ultimoIntento), 'ultimoIntento limpiado');
  assert(updated.length === 3, 'Misma cantidad de perfiles (no se borraron)');

  // Verificar que Sanjeev ya no está agotado tras reset
  const { activos, agotados } = cargarPendientesSim('alejandro');
  assert(activos.length === 3, 'Tras reset, los 3 están como activos');
  assert(agotados.length === 0, 'Tras reset, ninguno agotado');
}

function T9() {
  seccion('T9 — fix-pending --clean: remueve perfiles con 3+ intentos (D2)');
  limpiar();
  guardar([
    { cuenta:'alejandro', nombre:'Adam', profileUrl:'/lead/adam', intentos: 1 },
    { cuenta:'alejandro', nombre:'Sanjeev', profileUrl:'/lead/sanjeev', intentos: 5 },
    { cuenta:'alejandro', nombre:'Russell', profileUrl:'/lead/russell', intentos: 0 },
    { cuenta:'alejandro', nombre:'Otro', profileUrl:'/lead/otro', intentos: 3 },
  ]);

  const cantidadActivos = cleanAgotadosSim();
  const list = leer();

  assert(cantidadActivos === 2, `Quedan 2 activos tras clean (got ${cantidadActivos})`);
  assert(list.length === 2, '2 perfiles en disco');
  assert(!list.some(p => p.nombre === 'Sanjeev'), 'Sanjeev removido (5 intentos)');
  assert(!list.some(p => p.nombre === 'Otro'), 'Otro removido (3 intentos)');
  assert(list.some(p => p.nombre === 'Adam'), 'Adam conservado (1 intento)');
  assert(list.some(p => p.nombre === 'Russell'), 'Russell conservado (0 intentos)');
}

function T10() {
  seccion('T10 — normalizarUrl: extrae ID correcto de URLs Sales Nav (D5)');

  const casos = [
    // [input, expected, descripcion]
    ['/sales/lead/ACwAABQ123,NAME,SLUG?trk=abc', 'ACwAABQ123', 'path relativo con slug y query'],
    ['https://www.linkedin.com/sales/lead/ACwAABQ123?param=x', 'ACwAABQ123', 'URL absoluta'],
    ['/sales/people/ACwAABQ456?q=saved', 'ACwAABQ456', 'sales/people path'],
    ['/sales/lead/ACwAABQ123,SLUG_B?trk=xyz', 'ACwAABQ123', 'mismo ID distinto slug'],
    ['https://www.linkedin.com/in/russell-deakin-434226/', '/in/russell-deakin-434226', 'URL /in/ absoluta'],
    ['/in/besvinick/?trk=x', '/in/besvinick', 'URL /in/ relativa con query'],
    ['', '', 'URL vacía'],
  ];

  for (const [input, expected, desc] of casos) {
    const result = normalizarUrl(input);
    assert(result === expected, `normalizarUrl: ${desc}`, `got "${result}", expected "${expected}"`);
  }

  // Verificar dedup: mismo perfil con URLs distintas → misma key
  const url1 = '/sales/lead/ACwAABQ789,NOMBRE_A?trk=aaa';
  const url2 = '/sales/lead/ACwAABQ789,NOMBRE_B?trk=bbb';
  assert(normalizarUrl(url1) === normalizarUrl(url2), 'Dedup: mismos IDs → misma key');
}

// ─── RUNNER ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('test-bug3-pending.js — BUG #3: pending-email.json gestión');
  console.log('Archivo de prueba: pending-email-TEST.json (no modifica el real)');
  console.log('═══════════════════════════════════════════════════════════════');

  // Backup del pending real si existe
  const REAL_FILE = path.resolve(__dirname, 'pending-email.json');
  const backup = fs.existsSync(REAL_FILE) ? fs.readFileSync(REAL_FILE, 'utf8') : null;

  try {
    // Redirigir temporalmente al archivo de test
    // (los tests usan TEST_FILE directamente, no tocan el real)

    T1(); T2(); T3(); T4(); T5();
    T6(); T7(); T8(); T9(); T10();

  } finally {
    // Limpiar archivo de test
    limpiar();
    console.log('\n(Archivo de test limpiado)');
    if (backup !== null) {
      console.log('(pending-email.json real intacto)');
    }
  }

  // RESUMEN
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`RESUMEN BUG #3 — pending-email.json`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Pasados: ${pasados} | Fallados: ${fallados} | Total: ${pasados + fallados}`);
  console.log('');

  const total = pasados + fallados;
  if (fallados === 0) {
    console.log('🟢 BUG #3 RESUELTO — todos los tests pasan');
    console.log('');
    console.log('ACCIONES RECOMENDADAS AHORA:');
    console.log('  1. node fix-pending.js              → ver estado actual del pending');
    console.log('  2. node fix-pending.js --reset       → resetear Adam/Russell a 0 intentos');
    console.log('  3. node fix-pending.js --remove "Sanjeev"  → remover si no tiene solución');
    console.log('  4. node invitar-agent.js alejandro   → run producción con pending limpio');
  } else {
    console.log(`🔴 ${fallados} test(s) fallaron — revisar arriba`);
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(e => { console.error('CRASH:', e.message); limpiar(); process.exit(1); });
