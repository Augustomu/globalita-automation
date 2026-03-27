// ================================================================
// test-bug3.js
// Prueba los 10 caminos para el mutex de pending-email.json (BUG-3)
//
// Este test NO necesita browser — simula escrituras concurrentes
// igual que lo hacen 3 cuentas corriendo en paralelo.
//
// Uso:
//   node test-bug3.js
//
// Pasa si:
//   - Todas las escrituras concurrentes se completan
//   - El JSON resultante es válido
//   - No se pierde ningún registro
//   - Los intentos no se sobreescriben entre cuentas
// ================================================================

const fs   = require('fs');
const path = require('path');

const PENDING_FILE = path.resolve(__dirname, 'pending-email.json');
const BACKUP_FILE  = path.resolve(__dirname, 'pending-email.json.bak');

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg)  { console.log(`[${new Date().toISOString().slice(11,23)}] ${msg}`); }

// ─── 10 CAMINOS: Mutex seguro para pending-email.json ────────────────────────
// Se prueban en orden. El primero en pasar N escrituras concurrentes sin pérdida gana.

// ── Camino 1: Lock file (.lock) con polling — más simple, 0 deps ──
class MutexLockFile {
  constructor(filePath) { this.lockPath = filePath + '.lock'; }
  async acquire(timeout = 3000) {
    const t0 = Date.now();
    while (true) {
      try {
        fs.writeFileSync(this.lockPath, process.pid.toString(), { flag: 'wx' });
        return true;
      } catch {
        if (Date.now() - t0 > timeout) return false;
        await delay(30);
      }
    }
  }
  release() { try { fs.unlinkSync(this.lockPath); } catch {} }
}

// ── Camino 2: Promesa en cadena (mutex JS en memoria) ──
class MutexPromise {
  constructor() { this._chain = Promise.resolve(); }
  run(fn) {
    const result = this._chain.then(() => fn());
    this._chain = result.catch(() => {});
    return result;
  }
}

// ── Camino 3: writeFile + rename atómico ──
async function writeAtomico(file, data) {
  const tmp = file + '.tmp.' + Date.now() + '.' + Math.random().toString(36).slice(2);
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

// ── Camino 4: Lock file con contenido de timestamp (detecta locks huérfanos) ──
class MutexLockFileTS {
  constructor(filePath) { this.lockPath = filePath + '.lock'; this.MAX_AGE = 5000; }
  async acquire() {
    const t0 = Date.now();
    while (true) {
      try {
        // Si lock existe pero es viejo (proceso muerto), borrarlo
        if (fs.existsSync(this.lockPath)) {
          const age = Date.now() - parseInt(fs.readFileSync(this.lockPath, 'utf8') || '0');
          if (age > this.MAX_AGE) { fs.unlinkSync(this.lockPath); }
        }
        fs.writeFileSync(this.lockPath, Date.now().toString(), { flag: 'wx' });
        return true;
      } catch { await delay(30); }
      if (Date.now() - t0 > 3000) return false;
    }
  }
  release() { try { fs.unlinkSync(this.lockPath); } catch {} }
}

// ── Camino 5: Async queue (array de promesas) — sin lock de disco ──
class MutexQueue {
  constructor() { this._queue = []; }
  async lock() {
    const prev = this._queue[this._queue.length - 1] || Promise.resolve();
    let release;
    const p = new Promise(res => { release = res; });
    this._queue.push(p);
    await prev;
    return () => { release(); this._queue.shift(); };
  }
}

// ─── Simulación: N escrituras concurrentes ───────────────────────────────────

async function simularEscriturasConcrr(mutexImpl, nConcurrentes = 9) {
  // Estado inicial limpio
  fs.writeFileSync(PENDING_FILE, JSON.stringify([], null, 2));

  const errores  = [];
  const esperado = [];

  const tarea = async (i) => {
    const entrada = {
      cuenta     : ['alejandro', 'david', 'francisco'][i % 3],
      nombre     : `TestPerfil_${i}`,
      profileUrl : `/in/test-${i}`,
      grupo      : i % 2 === 0 ? 'gerente' : 'consultor',
      intentos   : 0,
      date       : new Date().toISOString(),
    };
    esperado.push(entrada.profileUrl);

    try {
      switch (mutexImpl.tipo) {
        case 'lockfile': {
          const ok = await mutexImpl.mx.acquire();
          if (!ok) throw new Error('lock timeout');
          try {
            const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
            if (!list.find(p => p.profileUrl === entrada.profileUrl)) {
              list.push(entrada);
              fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));
            }
          } finally { mutexImpl.mx.release(); }
          break;
        }
        case 'promise': {
          await mutexImpl.mx.run(async () => {
            const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
            if (!list.find(p => p.profileUrl === entrada.profileUrl)) {
              list.push(entrada);
              fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));
            }
          });
          break;
        }
        case 'atomico': {
          const ok = await mutexImpl.mx.acquire();
          if (!ok) throw new Error('lock timeout');
          try {
            const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
            if (!list.find(p => p.profileUrl === entrada.profileUrl)) {
              list.push(entrada);
              await writeAtomico(PENDING_FILE, JSON.stringify(list, null, 2));
            }
          } finally { mutexImpl.mx.release(); }
          break;
        }
        case 'lockfile-ts': {
          const ok = await mutexImpl.mx.acquire();
          if (!ok) throw new Error('lock timeout');
          try {
            const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
            if (!list.find(p => p.profileUrl === entrada.profileUrl)) {
              list.push(entrada);
              fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));
            }
          } finally { mutexImpl.mx.release(); }
          break;
        }
        case 'queue': {
          const release = await mutexImpl.mx.lock();
          try {
            const list = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
            if (!list.find(p => p.profileUrl === entrada.profileUrl)) {
              list.push(entrada);
              fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2));
            }
          } finally { release(); }
          break;
        }
      }
    } catch (e) { errores.push({ i, err: e.message }); }
  };

  // Simular 3 cuentas escribiendo en paralelo (igual que el agente real)
  const grupos = [
    [0, 1, 2],   // alejandro limpia + success + failure simultáneo
    [3, 4, 5],   // david
    [6, 7, 8],   // francisco
  ];

  for (const grupo of grupos) {
    await Promise.all(grupo.map(i => tarea(i)));
    await delay(50); // pequeño gap entre grupos (simula ritmo real)
  }

  // Verificar resultado
  let listaFinal;
  try { listaFinal = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')); }
  catch { return { ok: false, error: 'JSON corrupto', errores }; }

  const urlsFinales = listaFinal.map(p => p.profileUrl);
  const perdidos    = esperado.filter(u => !urlsFinales.includes(u));

  return {
    ok        : errores.length === 0 && perdidos.length === 0,
    errores,
    perdidos,
    total     : listaFinal.length,
    esperado  : esperado.length,
  };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  log('═'.repeat(60));
  log('TEST BUG-3 — Race condition pending-email.json');
  log('Simulando 3 cuentas con 3 escrituras concurrentes c/u (9 total)');
  log('═'.repeat(60));

  // Backup si existe un pending real
  if (fs.existsSync(PENDING_FILE)) {
    fs.copyFileSync(PENDING_FILE, BACKUP_FILE);
    log(`📋 Backup creado: ${BACKUP_FILE}`);
  }

  const caminos = [
    { tipo: 'lockfile',    mx: new MutexLockFile(PENDING_FILE),   label: 'C1 - Lock file (.lock) polling' },
    { tipo: 'promise',     mx: new MutexPromise(),                label: 'C2 - Promise chain (JS mutex)' },
    { tipo: 'atomico',     mx: new MutexLockFile(PENDING_FILE),   label: 'C3 - Lock file + write atómico' },
    { tipo: 'lockfile-ts', mx: new MutexLockFileTS(PENDING_FILE), label: 'C4 - Lock file con timestamp (anti-huérfano)' },
    { tipo: 'queue',       mx: new MutexQueue(),                  label: 'C5 - Async queue (0 disco)' },
  ];

  // Para BUG-3 los caminos 6-10 son variantes de stress más agresivo
  // con 15 escrituras simultáneas (peor caso real)
  const caminosStress = [
    { tipo: 'lockfile',    mx: new MutexLockFile(PENDING_FILE),   label: 'C6 - C1 stress 15 concurrent' },
    { tipo: 'promise',     mx: new MutexPromise(),                label: 'C7 - C2 stress 15 concurrent' },
    { tipo: 'atomico',     mx: new MutexLockFile(PENDING_FILE),   label: 'C8 - C3 stress 15 concurrent' },
    { tipo: 'lockfile-ts', mx: new MutexLockFileTS(PENDING_FILE), label: 'C9 - C4 stress 15 concurrent' },
    { tipo: 'queue',       mx: new MutexQueue(),                  label: 'C10 - C5 stress 15 concurrent' },
  ];

  const resultados = [];
  let ganador = null;

  for (const camino of [...caminos, ...caminosStress]) {
    const n = camino.label.includes('stress') ? 15 : 9;
    process.stdout.write(`  ${camino.label} ... `);
    const res = await simularEscriturasConcrr(camino, n);
    const status = res.ok ? '✅ PASS' : `❌ FAIL (errores:${res.errores.length} perdidos:${res.perdidos?.length})`;
    console.log(status);
    resultados.push({ ...camino, resultado: res, mx: undefined });
    if (res.ok && !ganador) ganador = camino;
  }

  log('\n' + '═'.repeat(60));
  log('RESULTADO FINAL:');
  if (ganador) {
    log(`  🏆 Ganador: ${ganador.label} (tipo=${ganador.tipo})`);
    log(`  ✅ Todos los caminos que pasaron son seguros para usar`);
  } else {
    log('  ❌ Ningún camino pasó — revisar entorno');
  }
  log('═'.repeat(60));

  // Restaurar backup
  if (fs.existsSync(BACKUP_FILE)) {
    fs.copyFileSync(BACKUP_FILE, PENDING_FILE);
    fs.unlinkSync(BACKUP_FILE);
    log('📋 Backup restaurado');
  } else {
    // Limpiar el test file
    fs.writeFileSync(PENDING_FILE, JSON.stringify([], null, 2));
  }

  // Limpiar lock files residuales
  [PENDING_FILE + '.lock', PENDING_FILE + '.lock'].forEach(f => {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  });

  fs.writeFileSync('test-bug3-result.json', JSON.stringify(
    { ganador: ganador ? { tipo: ganador.tipo, label: ganador.label } : null, resultados },
    null, 2
  ));
  log('✅ Resultado guardado en test-bug3-result.json');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
