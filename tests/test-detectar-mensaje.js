/**
 * test-detectar-mensaje.js — Detecta si ya se envió mensaje en Sales Nav
 * Uso: node test-detectar-mensaje.js david https://www.linkedin.com/in/joaobfjr/
 */
const path = require("path");
const { chromium } = require("playwright");
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const SESSIONS = {
  alejandro: path.join(__dirname, "session"),
  david:     path.join(__dirname, "david agente invitaciones"),
  francisco: path.join(__dirname, "francisco agente invitaciones"),
};

async function testDetectar(cuenta, profileUrl) {
  const sessionDir = SESSIONS[cuenta];
  console.log(`\n🔍 Test detección mensaje — ${cuenta}`);
  console.log(`   Perfil: ${profileUrl}`);
  console.log("=".repeat(50));

  const context = await chromium.launchPersistentContext(sessionDir, {
    headless: false, args: ["--start-maximized"]
  });

  // 1. Abrir perfil de LinkedIn
  const profilePage = await context.newPage();
  console.log("\n1. Abriendo perfil LinkedIn...");
  await profilePage.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  await wait(2000);

  // 2. Clickear "Ver en Sales Navigator" y capturar la nueva pestaña
  console.log("2. Clickeando Ver en Sales Navigator...");
  const [salesPage] = await Promise.all([
    context.waitForEvent("page", { timeout: 10000 }),
    profilePage.evaluate(() => {
      const btn = [...document.querySelectorAll("a, button")].find(b =>
        b.innerText?.trim().match(/Ver en Sales Navigator|Ver no Sales Navigator|View in Sales Navigator/)
      );
      if (btn) { btn.click(); return true; }
      return false;
    })
  ]).catch(async () => {
    // Fallback: buscar href directo
    const href = await profilePage.evaluate(() => {
      const a = document.querySelector("a[href*='sales.linkedin.com/lead']");
      return a?.href || null;
    });
    if (href) {
      const p = await context.newPage();
      await p.goto(href, { waitUntil: "domcontentloaded", timeout: 20000 });
      return [p];
    }
    return [null];
  });

  if (!salesPage) { console.log("❌ No se pudo abrir Sales Navigator"); await context.close(); return; }
  console.log("   ✅ Sales Nav abierto:", salesPage.url());

  // 4. Esperar carga completa del hilo de mensajes
  console.log("4. Esperando carga completa (networkidle)...");
  await salesPage.waitForLoadState("networkidle").catch(() => {});
  await wait(3000);

  // 5. Leer texto completo de la página
  const textoCompleto = await salesPage.evaluate(() => document.body.innerText || "");

  const patrones = [
    "Esperando respuesta",
    "Waiting for response",
    "Aguardando resposta",
    "Esperando resposta",
    "InMail enviado",
    "InMail sent",
    "Mensagem enviada",
    "Mensaje enviado",
    "Message sent",
  ];

  console.log("\n5. Buscando patrones de mensaje ya enviado:");
  let detectado = false;
  for (const patron of patrones) {
    if (textoCompleto.includes(patron)) {
      console.log(`   ✅ ENCONTRADO: "${patron}"`);
      detectado = true;
    }
  }
  if (!detectado) {
    console.log("   ❌ Ningún patrón encontrado");
  }

  // 6. Mostrar fragmento relevante del texto
  console.log("\n6. Fragmento del texto de Sales Nav (primeros 500 chars del hilo):");
  const idx = textoCompleto.indexOf("HOY") !== -1 ? textoCompleto.indexOf("HOY") :
               textoCompleto.indexOf("Today") !== -1 ? textoCompleto.indexOf("Today") : 0;
  console.log("   ...", textoCompleto.substring(Math.max(0, idx - 100), idx + 400), "...");

  console.log(`\n   RESULTADO: Mensaje ya enviado = ${detectado ? "✅ SÍ" : "❌ NO"}`);
  console.log("\n✅ Test completado. Ctrl+C para cerrar.");
  await wait(20000);
  await context.close();
}

const cuenta = process.argv[2] || "david";
const url = process.argv[3] || "";
if (!url) { console.log("Uso: node test-detectar-mensaje.js [cuenta] [url]"); process.exit(1); }
testDetectar(cuenta, url).catch(console.error);
