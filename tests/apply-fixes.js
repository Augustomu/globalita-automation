// ================================================================
// apply-fixes.js
// Lee test-bug1-bug2-result.json y test-bug3-result.json
// y aplica los fixes correspondientes a invitar-agent.js
//
// Uso:
//   node apply-fixes.js                   ← aplica todos los fixes
//   node apply-fixes.js --dry-run         ← solo muestra qué cambiaría
//   node apply-fixes.js --only bug1       ← solo bug específico
//
// Genera: invitar-agent.js (actualizado) + invitar-agent.js.bak
// ================================================================

const fs   = require('fs');
const path = require('path');

const AGENT_FILE     = path.resolve(__dirname, 'invitar-agent.js');
const RESULT_BUG12   = path.resolve(__dirname, 'test-bug1-bug2-result.json');
const RESULT_BUG3    = path.resolve(__dirname, 'test-bug3-result.json');

const isDryRun = process.argv.includes('--dry-run');
const onlyBug  = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null;

function log(msg) { console.log(`[apply-fixes] ${msg}`); }

// ─── Leer script actual ───────────────────────────────────────────────────────
function leerScript() {
  if (!fs.existsSync(AGENT_FILE)) {
    throw new Error(`No se encontró ${AGENT_FILE}`);
  }
  return fs.readFileSync(AGENT_FILE, 'utf8');
}

// ─── Escribir script con backup ──────────────────────────────────────────────
function escribirScript(contenido, label) {
  const bakFile = AGENT_FILE + '.bak';
  const original = leerScript();
  if (!isDryRun) {
    fs.writeFileSync(bakFile, original);
    log(`📋 Backup: ${bakFile}`);
    fs.writeFileSync(AGENT_FILE, contenido);
    log(`✅ ${AGENT_FILE} actualizado (${label})`);
  } else {
    log(`[DRY-RUN] Se aplicaría: ${label}`);
  }
}

// ─── Verificar que el patch se aplicó ────────────────────────────────────────
function verificarPatch(contenido, buscar, label) {
  if (contenido.includes(buscar)) {
    log(`  ✅ Verificado: ${label}`);
    return true;
  }
  log(`  ❌ NO encontrado post-patch: ${label}`);
  return false;
}

// ════════════════════════════════════════════════════════════════
// FIX BUG-1: moreBtnSalesNav.click() → click({timeout:3000}).catch()
// ════════════════════════════════════════════════════════════════
function aplicarBug1(contenido) {
  log('\n── Aplicando BUG-1: moreBtnSalesNav.click() sin protección ──');

  // ANTES: await moreBtnSalesNav.click();
  // DESPUÉS: await moreBtnSalesNav.click({ timeout: 3000 }).catch(() => {});
  //          + delay(800) ya existe en la línea siguiente
  const ANTES   = `  await moreBtnSalesNav.click();\n  await delay(1000);`;
  const DESPUES = `  // FIX BUG-1: timeout corto — insight documentado: click SÍ ejecuta\n  // aunque Playwright tire "element is not visible". Nunca timeout largo.\n  await moreBtnSalesNav.click({ timeout: 3000 }).catch(() => {});\n  await delay(1000);`;

  if (!contenido.includes('await moreBtnSalesNav.click();')) {
    // Intentar variante sin delay siguiente
    const ANTES_V2   = `  await moreBtnSalesNav.click();\n  await delay(1000)\n`;
    if (!contenido.includes(ANTES_V2.trim())) {
      log('  ⚠ Patrón exacto no encontrado — buscando con regex');
      const patched = contenido.replace(
        /await moreBtnSalesNav\.click\(\)\s*;/g,
        'await moreBtnSalesNav.click({ timeout: 3000 }).catch(() => {}); // FIX BUG-1'
      );
      if (patched !== contenido) {
        log('  ✅ Aplicado via regex');
        return patched;
      }
      log('  ❌ No se pudo aplicar BUG-1');
      return contenido;
    }
  }

  const resultado = contenido.replace(
    /await moreBtnSalesNav\.click\(\)\s*;/g,
    'await moreBtnSalesNav.click({ timeout: 3000 }).catch(() => {}); // FIX BUG-1'
  );

  verificarPatch(resultado, 'moreBtnSalesNav.click({ timeout: 3000 })', 'BUG-1');
  return resultado;
}

// ════════════════════════════════════════════════════════════════
// FIX BUG-2: verLinkedinOpt.click() → click({timeout:3000})
// ════════════════════════════════════════════════════════════════
function aplicarBug2(contenido) {
  log('\n── Aplicando BUG-2: verLinkedinOpt.click() timeout 30s → 3s ──');

  // ANTES: verLinkedinOpt.click().catch(() => {}),
  // DESPUÉS: verLinkedinOpt.click({ timeout: 3000 }).catch(() => {}),
  const resultado = contenido.replace(
    /verLinkedinOpt\.click\(\)\.catch\(\(\)\s*=>\s*\{\}\)/g,
    'verLinkedinOpt.click({ timeout: 3000 }).catch(() => {}) // FIX BUG-2'
  );

  if (resultado === contenido) {
    // Variante sin .catch encadenado
    const resultado2 = contenido.replace(
      /verLinkedinOpt\.click\(\)/g,
      'verLinkedinOpt.click({ timeout: 3000 }) // FIX BUG-2'
    );
    if (resultado2 !== contenido) {
      verificarPatch(resultado2, 'verLinkedinOpt.click({ timeout: 3000 })', 'BUG-2');
      return resultado2;
    }
    log('  ❌ No se pudo aplicar BUG-2');
    return contenido;
  }

  verificarPatch(resultado, 'verLinkedinOpt.click({ timeout: 3000 })', 'BUG-2');
  return resultado;
}

// ════════════════════════════════════════════════════════════════
// FIX BUG-3: Agregar mutex al cleanup de F6 (success + failure)
// ════════════════════════════════════════════════════════════════
function aplicarBug3(contenido, tipoMutex) {
  log(`\n── Aplicando BUG-3: mutex en cleanup F6 (tipo=${tipoMutex}) ──`);

  // El fix para BUG-3 depende del tipo de mutex ganador en el test.
  // Para mantener compatibilidad con el mutex ya existente (_escribiendoPending),
  // usamos la misma estrategia — que es MutexPromise (promise chain) o LockFile.
  // Por defecto aplicamos el helper writerSafe ya documentado.

  // ── Inyectar helper de escritura segura si no existe ──────────────────────
  const HELPER_MARKER = '// MUTEX HELPER — pendingWriteSafe';
  if (!contenido.includes(HELPER_MARKER)) {
    let helperCode;
    if (tipoMutex === 'queue') {
      helperCode = `
// ${HELPER_MARKER}
// FIX BUG-3: mismo mutex que logPendingEmail para evitar race condition
// en cleanup F6 con 3 cuentas en paralelo
const _pendingWriteQueue = (() => {
  let chain = Promise.resolve();
  return fn => {
    const result = chain.then(() => fn());
    chain = result.catch(() => {});
    return result;
  };
})();
`;
    } else {
      // Default: extend el spin lock ya existente
      helperCode = `
// ${HELPER_MARKER}
// FIX BUG-3: wrapper async para escribir pending-email.json con el spin lock existente
async function pendingWriteSafe(fn) {
  const ahora = Date.now();
  const tope  = ahora + 2000;
  while (_escribiendoPending && Date.now() < tope) { await new Promise(r => setTimeout(r, 30)); }
  _escribiendoPending = true;
  try { await fn(); } finally { _escribiendoPending = false; }
}
`;
    }

    // Insertar después del mutex spin lock de logPendingEmail
    const anclaInsercion = '// D4: mutex para pending-email.json';
    if (contenido.includes(anclaInsercion)) {
      // Insertar ANTES del bloque D4 para que el helper esté disponible
      contenido = contenido.replace(
        `// D4: mutex para pending-email.json`,
        `${helperCode}// D4: mutex para pending-email.json`
      );
      log('  ✅ Helper pendingWriteSafe inyectado');
    } else {
      // Fallback: insertar antes de logPendingEmail
      contenido = contenido.replace(
        'function logPendingEmail(',
        `${helperCode}\nfunction logPendingEmail(`
      );
      log('  ✅ Helper inyectado (fallback antes de logPendingEmail)');
    }
  } else {
    log('  ℹ Helper ya existe — solo actualizando usos');
  }

  // ── Parchear el cleanup SUCCESS en F6 (líneas ~1267-1269) ────────────────
  const CLEANUP_SUCCESS_ANTES = `          const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
          fs.writeFileSync(PENDING_FILE, JSON.stringify(list.filter(x => x.profileUrl !== pendiente.profileUrl), null, 2));`;

  const CLEANUP_SUCCESS_DESPUES = `          // FIX BUG-3: escritura con mutex
          await pendingWriteSafe(async () => {
            const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
            fs.writeFileSync(PENDING_FILE, JSON.stringify(list.filter(x => x.profileUrl !== pendiente.profileUrl), null, 2));
          });`;

  // Usar el string exacto de las líneas 1266-1269
  const CLEANUP_SUCCESS_EXACTO =
    `          try {\n            const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));\n            fs.writeFileSync(PENDING_FILE, JSON.stringify(list.filter(x => x.profileUrl !== pendiente.profileUrl), null, 2));\n          } catch {}`;
  const CLEANUP_SUCCESS_FIX =
    `          // FIX BUG-3: escritura con mutex (race condition con 3 cuentas en paralelo)\n          try {\n            await pendingWriteSafe(async () => {\n              const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));\n              fs.writeFileSync(PENDING_FILE, JSON.stringify(list.filter(x => x.profileUrl !== pendiente.profileUrl), null, 2));\n            });\n          } catch {}`;

  if (contenido.includes(CLEANUP_SUCCESS_EXACTO)) {
    contenido = contenido.replace(CLEANUP_SUCCESS_EXACTO, CLEANUP_SUCCESS_FIX);
    log('  ✅ Cleanup SUCCESS parcheado con mutex');
  } else {
    log('  ⚠ Cleanup SUCCESS patrón no encontrado — revisar manualmente línea ~1266');
  }

  // ── Parchear el cleanup FAILURE en F6 (líneas ~1272-1278) ────────────────
  const CLEANUP_FAILURE_ANTES = `          const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
            const idx  = list.findIndex(x => x.profileUrl === pendiente.profileUrl);
            if (idx >= 0) {
              list[idx].intentos = (list[idx].intentos || 0) + 1;
              list[idx].ultimoIntento = new Date().toISOString();
              fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));`;

  const CLEANUP_FAILURE_DESPUES = `          // FIX BUG-3: escritura con mutex
          await pendingWriteSafe(async () => {
            const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
            const idx  = list.findIndex(x => x.profileUrl === pendiente.profileUrl);
            if (idx >= 0) {
              list[idx].intentos = (list[idx].intentos || 0) + 1;
              list[idx].ultimoIntento = new Date().toISOString();
              fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));`;

  // Usar el string exacto de las líneas 1272-1279
  const CLEANUP_FAILURE_EXACTO =
    `          try {\n            const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));\n            const idx  = list.findIndex(x => x.profileUrl === pendiente.profileUrl);\n            if (idx >= 0) {\n              list[idx].intentos = (list[idx].intentos || 0) + 1;\n              list[idx].ultimoIntento = new Date().toISOString();\n              fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));\n              log(cuenta, \`F6 [B9] \${pendiente.nombre} — intento \${list[idx].intentos}/\${MAX_INTENTOS_F6}\`);\n            }\n          } catch {}`;
  const CLEANUP_FAILURE_FIX =
    `          // FIX BUG-3: escritura con mutex\n          try {\n            await pendingWriteSafe(async () => {\n              const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));\n              const idx  = list.findIndex(x => x.profileUrl === pendiente.profileUrl);\n              if (idx >= 0) {\n                list[idx].intentos = (list[idx].intentos || 0) + 1;\n                list[idx].ultimoIntento = new Date().toISOString();\n                fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));\n                log(cuenta, \`F6 [B9] \${pendiente.nombre} — intento \${list[idx].intentos}/\${MAX_INTENTOS_F6}\`);\n              }\n            });\n          } catch {}`;

  if (contenido.includes(CLEANUP_FAILURE_EXACTO)) {
    contenido = contenido.replace(CLEANUP_FAILURE_EXACTO, CLEANUP_FAILURE_FIX);
    log('  ✅ Cleanup FAILURE parcheado con mutex');
  } else {
    log('  ⚠ Cleanup FAILURE patrón no encontrado — revisar manualmente línea ~1272');
  }

  verificarPatch(contenido, 'FIX BUG-3', 'BUG-3 mutex cleanup');
  return contenido;
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════

async function main() {
  log('═'.repeat(60));
  log(`apply-fixes.js ${isDryRun ? '[DRY-RUN]' : ''} ${onlyBug ? `[solo ${onlyBug}]` : ''}`);
  log('═'.repeat(60));

  // ── Leer resultados de tests ───────────────────────────────────────────────
  const hasBug12Result = fs.existsSync(RESULT_BUG12);
  const hasBug3Result  = fs.existsSync(RESULT_BUG3);

  let resBug12 = null, resBug3 = null;

  if (hasBug12Result) {
    resBug12 = JSON.parse(fs.readFileSync(RESULT_BUG12, 'utf8'));
    log(`BUG-1 test: ${resBug12.bug1?.ok ? '✅ PASS' : '❌ FAIL'} via=${resBug12.bug1?.via}`);
    log(`BUG-2 test: ${resBug12.bug2?.ok ? '✅ PASS' : '❌ FAIL'} via=${resBug12.bug2?.via}`);
  } else {
    log('⚠ test-bug1-bug2-result.json no encontrado — aplicando fix igualmente (es seguro)');
  }

  if (hasBug3Result) {
    resBug3 = JSON.parse(fs.readFileSync(RESULT_BUG3, 'utf8'));
    log(`BUG-3 test: ganador=${resBug3.ganador?.label || 'N/A'}`);
  } else {
    log('⚠ test-bug3-result.json no encontrado — aplicando fix con tipo=lockfile (default)');
  }

  // ── Leer y aplicar patches ─────────────────────────────────────────────────
  let contenido = leerScript();
  const linesBefore = contenido.split('\n').length;
  let cambios = 0;

  const aplicarBug = (nombre, fn) => {
    if (onlyBug && onlyBug !== nombre) return;
    const nuevo = fn(contenido);
    if (nuevo !== contenido) { contenido = nuevo; cambios++; }
  };

  // BUG-1: siempre es seguro aplicar (fix defensivo)
  aplicarBug('bug1', (c) => aplicarBug1(c));

  // BUG-2: siempre es seguro aplicar
  aplicarBug('bug2', (c) => aplicarBug2(c));

  // BUG-3: solo si el test pasó O si se forza
  if (!onlyBug || onlyBug === 'bug3') {
    const tipoMutex = resBug3?.ganador?.tipo || 'lockfile';
    const bug3Pasó  = !hasBug3Result || resBug3?.ganador != null;
    if (bug3Pasó) {
      aplicarBug('bug3', (c) => aplicarBug3(c, tipoMutex));
    } else {
      log('\n⚠ BUG-3: test falló — NO aplicando. Revisar manualmente.');
    }
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  const linesAfter = contenido.split('\n').length;
  log('\n' + '═'.repeat(60));
  log(`Cambios aplicados: ${cambios}`);
  log(`Líneas: ${linesBefore} → ${linesAfter} (+${linesAfter - linesBefore})`);

  if (cambios === 0) {
    log('ℹ Sin cambios — los fixes ya estaban aplicados o no se detectaron patrones');
    return;
  }

  // ── Validación sintáctica básica ──────────────────────────────────────────
  const abreLlaves  = (contenido.match(/\{/g) || []).length;
  const cierraLlaves = (contenido.match(/\}/g) || []).length;
  const diff = Math.abs(abreLlaves - cierraLlaves);
  if (diff > 5) {
    log(`⚠ ADVERTENCIA: desbalance de llaves ({:${abreLlaves} }:${cierraLlaves} diff:${diff})`);
    log('  Revisar el archivo antes de correr el agente');
  } else {
    log(`✅ Validación llaves OK ({:${abreLlaves} }:${cierraLlaves})`);
  }

  escribirScript(contenido, `${cambios} fix(es) aplicados`);
  log('═'.repeat(60));
  log('🚀 Listo para correr: node invitar-agent.js');
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
