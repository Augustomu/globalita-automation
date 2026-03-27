/**
 * cleanup.js — Herramienta de limpieza independiente
 * 
 * Procesa perfiles que quedaron a mitad:
 * 1. Perfiles en LISTA PARA BORRAR en Sales Navigator → retira invitación
 * 2. Perfiles del sentLog sin invitación retirada → intenta retirar
 * 
 * Uso: node cleanup.js [flowId]
 *   node cleanup.js                → limpia todos los flujos
 *   node cleanup.js brasil-pt-1   → solo David
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DASHBOARD = "http://localhost:3000";
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function normalizeUrl(url) {
  return url.split("?")[0].replace(/\/(es|en|pt|fr|de)\/?$/, "").replace(/\/$/, "");
}

const FLOWS = [
  { id: "inversores-es",  name: "Alejandro",  sessionDir: path.join(__dirname, "session") },
  { id: "brasil-pt-1",   name: "David",      sessionDir: path.join(__dirname, "david agente invitaciones") },
  { id: "brasil-pt-2",   name: "Francisco",  sessionDir: path.join(__dirname, "francisco agente invitaciones") },
];

async function cerrarBanners(page) {
  try {
    await page.evaluate(() => {
      [
        '[data-test-global-alert-dismiss]','[aria-label="Dismiss"]','[aria-label="Cerrar"]',
        '[aria-label="Close"]','.artdeco-global-alert__dismiss','.global-alert-banner__dismiss',
      ].forEach(sel => document.querySelectorAll(sel).forEach(btn => { try { btn.click(); } catch(_) {} }));
    });
    await wait(600);
  } catch(_) {}
}

async function retirarDesdeInvitaciones(page, profileUrl) {
  try {
    await page.goto("https://www.linkedin.com/mynetwork/invitation-manager/sent/", { waitUntil: "domcontentloaded", timeout: 15000 });
    await wait(2000);
    await cerrarBanners(page);
    const slug = normalizeUrl(profileUrl).split("/").pop();
    const retirado = await page.evaluate((slug) => {
      const link = [...document.querySelectorAll("a[href*='/in/']")].find(a => a.href.includes(slug));
      if (!link) return false;
      const container = link.closest("li") || link.parentElement?.parentElement?.parentElement;
      if (!container) return false;
      const btn = [...container.querySelectorAll("button")].find(b =>
        ["Retirar","Withdraw","Retirar convite"].includes(b.innerText?.trim())
      );
      if (btn) { btn.click(); return true; }
      return false;
    }, slug);
    if (retirado) {
      await wait(1500);
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find(b =>
          ["Retirar","Withdraw","Confirmar","Confirm"].includes(b.innerText?.trim())
        );
        if (btn) btn.click();
      });
      await wait(1000);
      return true;
    }
    return false;
  } catch(_) { return false; }
}

async function retirarDesdeListaBorrar(salesPage, mainPage) {
  // Navega a la lista LISTA PARA BORRAR en Sales Navigator y retira todas las invitaciones
  try {
    await salesPage.goto("https://www.linkedin.com/sales/lists/people", { waitUntil: "domcontentloaded", timeout: 15000 });
    await wait(3000);
    await cerrarBanners(salesPage);
    
    // Buscar lista LISTA PARA BORRAR
    const listUrl = await salesPage.evaluate(() => {
      const links = [...document.querySelectorAll("a")];
      const link = links.find(a => a.innerText?.includes("LISTA PARA BORRAR"));
      return link ? link.href : null;
    });
    
    if (!listUrl) {
      console.log("  ⚠ Lista PARA BORRAR no encontrada en Sales Navigator");
      return [];
    }
    
    await salesPage.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await wait(3000);
    
    // Extraer todos los perfiles de la lista
    const profileUrls = await salesPage.evaluate(() => {
      return [...document.querySelectorAll("a[href*='/sales/lead/'], a[href*='linkedin.com/in/']")]
        .map(a => a.href.split("?")[0])
        .filter((v, i, arr) => arr.indexOf(v) === i);
    });
    
    console.log(`  📋 ${profileUrls.length} perfiles en LISTA PARA BORRAR`);
    return profileUrls;
  } catch(e) {
    console.log("  ⚠ Error accediendo a lista:", e.message);
    return [];
  }
}

async function cleanupFlow(flow) {
  console.log(`\n[${flow.name}] Iniciando limpieza...`);
  
  let context;
  try {
    context = await chromium.launchPersistentContext(flow.sessionDir, { headless: false, args: ["--start-maximized"] });
  } catch(e) {
    console.log(`[${flow.name}] ❌ Error abriendo sesión: ${e.message}`);
    return;
  }

  const page = await context.newPage();

  // Cargar sentLog del historial para saber qué perfiles ya recibieron mensaje
  let sentLog = [];
  try {
    const res = await fetch(`${DASHBOARD}/api/status`);
    const all = await res.json();
    sentLog = (all[flow.id]?.sentLog || []).map(p => ({ ...p, urlNorm: normalizeUrl(p.url) }));
    console.log(`[${flow.name}] 📬 ${sentLog.length} perfiles con mensaje enviado en historial`);
  } catch(_) {}

  // Cargar invitaciones enviadas actuales
  console.log(`[${flow.name}] Cargando invitaciones enviadas...`);
  await page.goto("https://www.linkedin.com/mynetwork/invitation-manager/sent/", { waitUntil: "domcontentloaded", timeout: 15000 });
  await wait(2000);
  await cerrarBanners(page);

  // Scroll para cargar todas las invitaciones
  let sinCambios = 0;
  while (sinCambios < 3) {
    const prev = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await wait(2000);
    const next = await page.evaluate(() => document.body.scrollHeight);
    sinCambios = next === prev ? sinCambios + 1 : 0;
    process.stdout.write(".");
  }
  console.log("");

  // Obtener invitaciones pendientes
  const pendingUrls = await page.evaluate(() =>
    [...document.querySelectorAll("a[href*='/in/']")]
      .map(a => a.href.split("?")[0])
      .filter(h => h.includes("/in/") && !h.includes("/in/undefined"))
      .filter((v, i, arr) => arr.indexOf(v) === i)
  );
  console.log(`[${flow.name}] 📨 ${pendingUrls.length} invitaciones activas`);

  // Identificar cuáles ya recibieron mensaje
  const toRetire = pendingUrls.filter(url => {
    const norm = normalizeUrl(url);
    return sentLog.some(p => p.urlNorm === norm);
  });
  console.log(`[${flow.name}] 🎯 ${toRetire.length} perfiles a retirar (ya recibieron mensaje)`);

  let retirados = 0;
  for (const profileUrl of toRetire) {
    const entry = sentLog.find(p => p.urlNorm === normalizeUrl(profileUrl));
    console.log(`[${flow.name}] → Retirando: ${entry?.name || profileUrl}`);
    const ok = await retirarDesdeInvitaciones(page, profileUrl);
    console.log(`[${flow.name}]   ${ok ? "✅ Retirada" : "⚠ No retirada"}`);
    if (ok) retirados++;
    await wait(3000);
  }

  console.log(`\n[${flow.name}] Fin limpieza — Retiradas: ${retirados} / ${toRetire.length}`);
  await context.close();
}

async function main() {
  const flowFilter = process.argv[2] || null;
  const flowsToRun = flowFilter ? FLOWS.filter(f => f.id === flowFilter) : FLOWS;

  console.log("=".repeat(60));
  console.log("  Cleanup — Limpieza de invitaciones pendientes");
  console.log(`  Flujos: ${flowsToRun.map(f => f.name).join(", ")}`);
  console.log("=".repeat(60));

  for (const flow of flowsToRun) {
    await cleanupFlow(flow);
  }

  console.log("\n✅ Limpieza completada.");
}

main().catch(console.error);
