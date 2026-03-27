/**
 * fix-pending.js — Gestión y diagnóstico de pending-email.json
 *
 * ACCIONES DISPONIBLES:
 *
 *   node fix-pending.js             → muestra estado actual (sin modificar)
 *   node fix-pending.js --reset     → resetea intentos a 0 para todos los perfiles
 *                                     (usar después de confirmar que F6 funciona)
 *   node fix-pending.js --clean     → remueve perfiles con >= 3 intentos (Sanjeev etc)
 *   node fix-pending.js --reset-one "Nombre Apellido"  → reset de un perfil específico
 *   node fix-pending.js --remove "Nombre Apellido"     → remover un perfil específico
 *   node fix-pending.js --normalize → normaliza URLs relativas a formato estándar
 *
 * FIXES APLICADOS:
 *   D1: reset de intentos para perfiles con F6 confirmado
 *   D2: remoción de Sanjeev Munjal (5 intentos, sin solución posible)
 *   D4: visualización de estado completo
 *   D5: normalización de profileUrl
 *   D6: agrega linkedinUrl si está disponible
 *   D9: valida que las URLs sean de Sales Nav
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const PENDING_FILE = path.resolve(__dirname, 'pending-email.json');
const MAX_INTENTOS = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cargar() {
  if (!fs.existsSync(PENDING_FILE)) { console.log('pending-email.json no encontrado'); return []; }
  return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
}
function guardar(list) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));
  console.log(`✅ Guardado: ${list.length} perfil(es)`);
}
function edad(dateStr) {
  if (!dateStr) return 'sin fecha';
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.round(diff / 3600000);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.round(h/24)}d`;
}

// ─── MODO: mostrar estado ─────────────────────────────────────────────────────
function mostrarEstado(list) {
  console.log('\n═══════════════════════════════════════════════');
  console.log('ESTADO — pending-email.json');
  console.log('═══════════════════════════════════════════════');

  if (list.length === 0) { console.log('Archivo vacío ✅'); return; }

  const activos  = list.filter(p => !p.intentos || p.intentos < MAX_INTENTOS);
  const agotados = list.filter(p => p.intentos && p.intentos >= MAX_INTENTOS);

  console.log(`Total: ${list.length} | Activos: ${activos.length} | Agotados: ${agotados.length}\n`);

  for (const p of list) {
    const intentos = p.intentos || 0;
    const estado = intentos >= MAX_INTENTOS ? '🔴 AGOTADO' : intentos > 0 ? '🟡 en progreso' : '🟢 nuevo';
    const ult    = p.ultimoIntento ? `último: ${edad(p.ultimoIntento)}` : `registrado: ${edad(p.date)}`;
    console.log(`  ${estado} ${p.nombre}`);
    console.log(`    cuenta: ${p.cuenta} | grupo: ${p.grupo || 'N/A'} | intentos: ${intentos}/${MAX_INTENTOS} | ${ult}`);
    console.log(`    url: ${p.profileUrl?.slice(0, 60)}`);
    if (p.linkedinUrl) console.log(`    linkedin: ${p.linkedinUrl}`);
    console.log('');
  }

  console.log('OPCIONES:');
  console.log('  node fix-pending.js --reset     → resetear todos los intentos a 0');
  console.log('  node fix-pending.js --clean     → remover perfiles con 3+ intentos');
  console.log('  node fix-pending.js --reset-one "Nombre" → resetear uno específico');
  console.log('  node fix-pending.js --remove "Nombre"    → remover uno específico');
  console.log('  node fix-pending.js --normalize → normalizar URLs');
  console.log('═══════════════════════════════════════════════\n');
}

// ─── MODO: reset todos los intentos ──────────────────────────────────────────
function resetTodos(list) {
  console.log('\nReseteando intentos a 0 para todos los perfiles...');
  const updated = list.map(p => ({
    ...p,
    intentos: 0,
    ultimoIntento: null,
    resetDate: new Date().toISOString(),
    reason: 'requires-email',
  }));
  updated.forEach(p => console.log(`  ✅ ${p.nombre}: intentos 0 (era ${p.intentos || 0})`));
  guardar(updated);
}

// ─── MODO: limpiar agotados ───────────────────────────────────────────────────
function limpiarAgotados(list) {
  const activos  = list.filter(p => !p.intentos || p.intentos < MAX_INTENTOS);
  const agotados = list.filter(p => p.intentos && p.intentos >= MAX_INTENTOS);
  console.log(`\nRemoviendo ${agotados.length} perfil(es) agotados:`);
  agotados.forEach(p => console.log(`  🗑  ${p.nombre} (${p.intentos} intentos)`));
  if (agotados.length === 0) { console.log('  Ninguno'); return; }
  guardar(activos);
}

// ─── MODO: reset uno ──────────────────────────────────────────────────────────
function resetUno(list, nombre) {
  const idx = list.findIndex(p => p.nombre.toLowerCase().includes(nombre.toLowerCase()));
  if (idx < 0) { console.log(`❌ Perfil "${nombre}" no encontrado`); return; }
  const antes = list[idx].intentos || 0;
  list[idx] = { ...list[idx], intentos: 0, ultimoIntento: null, resetDate: new Date().toISOString() };
  console.log(`✅ ${list[idx].nombre}: intentos ${antes} → 0`);
  guardar(list);
}

// ─── MODO: remover uno ────────────────────────────────────────────────────────
function removerUno(list, nombre) {
  const antes = list.length;
  const nueva = list.filter(p => !p.nombre.toLowerCase().includes(nombre.toLowerCase()));
  if (nueva.length === antes) { console.log(`❌ Perfil "${nombre}" no encontrado`); return; }
  const removidos = list.filter(p => p.nombre.toLowerCase().includes(nombre.toLowerCase()));
  removidos.forEach(p => console.log(`  🗑  Removido: ${p.nombre}`));
  guardar(nueva);
}

// ─── MODO: normalizar URLs ───────────────────────────────────────────────────
function normalizar(list) {
  console.log('\nNormalizando URLs...');
  let cambios = 0;
  const updated = list.map(p => {
    // D5: asegurar que profileUrl sea el path relativo /sales/lead/...
    let url = p.profileUrl;
    if (url && url.startsWith('https://www.linkedin.com')) {
      url = url.replace('https://www.linkedin.com', '');
      cambios++;
      console.log(`  📝 ${p.nombre}: URL normalizada`);
    }
    // D9: validar que sea Sales Nav URL
    if (url && !url.includes('/sales/lead/') && !url.includes('/sales/people/')) {
      console.log(`  ⚠️  ${p.nombre}: URL no es Sales Nav — ${url.slice(0, 50)}`);
    }
    return { ...p, profileUrl: url };
  });
  if (cambios === 0) console.log('  Sin cambios necesarios');
  guardar(updated);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const list = cargar();

if (args.length === 0) {
  mostrarEstado(list);

} else if (args[0] === '--reset') {
  mostrarEstado(list);
  resetTodos(list);

} else if (args[0] === '--clean') {
  mostrarEstado(list);
  limpiarAgotados(list);

} else if (args[0] === '--reset-one' && args[1]) {
  resetUno(list, args[1]);
  mostrarEstado(cargar());

} else if (args[0] === '--remove' && args[1]) {
  removerUno(list, args[1]);
  mostrarEstado(cargar());

} else if (args[0] === '--normalize') {
  normalizar(list);

} else {
  console.log('Uso:');
  console.log('  node fix-pending.js                       → estado actual');
  console.log('  node fix-pending.js --reset               → resetear todos a 0');
  console.log('  node fix-pending.js --clean               → remover con 3+ intentos');
  console.log('  node fix-pending.js --reset-one "Nombre"  → resetear uno');
  console.log('  node fix-pending.js --remove "Nombre"     → remover uno');
  console.log('  node fix-pending.js --normalize           → normalizar URLs');
}
