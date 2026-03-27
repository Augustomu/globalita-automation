/**
 * test-retirar.js — Retira invitación desde página de invitaciones enviadas
 * Uso: node test-retirar.js alejandro https://www.linkedin.com/in/cgm-boardmember-consultant/
 */
const path = require("path");
const { chromium } = require("playwright");
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const SESSIONS = {
  alejandro: path.join(__dirname, "session"),
  david:     path.join(__dirname, "david agente invitaciones"),
  francisco: path.join(__dirname, "francisco agente invitaciones"),
};

async function testRetirar(cuenta, profileUrl) {
  const sessionDir = SESSIONS[cuenta];
  console.log(`\n🔍 Test retiro desde invitaciones — ${cuenta}`);
  console.log(`   Perfil: ${profileUrl}`);
  console.log("=".repeat(50));

  const context = await chromium.launchPersistentContext(sessionDir, { headless: false, args: ["--start-maximized"] });
  const page = await context.newPage();

  // Extraer slug del perfil
  const slug = profileUrl.replace(/\/$/, "").split("/").pop();
  console.log(`\n1. Slug: ${slug}`);

  // Ir a invitaciones enviadas
  console.log("2. Abriendo invitaciones enviadas...");
  await page.goto("https://www.linkedin.com/mynetwork/invitation-manager/sent/", { waitUntil: "domcontentloaded", timeout: 15000 });
  await wait(3000);

  // Buscar el perfil y clickear Retirar
  console.log("3. Buscando perfil y botón Retirar...");
  const resultado = await page.evaluate((slug) => {
    const links = [...document.querySelectorAll("a[href*='/in/']")];
    const link = links.find(a => a.href.includes(slug));
    if (!link) return { ok: false, error: "Perfil no encontrado en la lista" };
    const container = link.closest("li") || link.closest("[data-view-name]") || link.parentElement?.parentElement?.parentElement;
    if (!container) return { ok: false, error: "Container no encontrado" };
    const btn = [...container.querySelectorAll("button, span")].find(b =>
      b.innerText?.trim() === "Retirar" || b.innerText?.trim() === "Withdraw"
    );
    if (!btn) return { ok: false, error: "Botón Retirar no encontrado en container", containerHTML: container.innerHTML?.substring(0, 300) };
    btn.click();
    return { ok: true, texto: btn.innerText.trim() };
  }, slug);

  console.log("   Resultado:", resultado.ok ? `✅ "${resultado.texto}" clickeado` : `❌ ${resultado.error}`);
  if (resultado.containerHTML) console.log("   HTML container:", resultado.containerHTML);

  if (resultado.ok) {
    // Esperar modal de confirmación
    console.log("4. Esperando modal de confirmación...");
    try {
      await page.waitForSelector("button:has-text('Retirar')", { timeout: 6000 });
      const confirmado = await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find(b => b.innerText?.trim() === "Retirar");
        if (btn) { btn.click(); return true; }
        return false;
      });
      console.log("   Modal:", confirmado ? "✅ Retirado" : "❌ botón no encontrado");
      await wait(2000);
    } catch(e) {
      console.log("   Modal timeout — verificar manualmente");
    }
  }

  console.log("\n✅ Test completado. Ctrl+C para cerrar.");
  await wait(20000);
  await context.close();
}

const cuenta = process.argv[2] || "alejandro";
const url = process.argv[3] || "";
if (!url) { console.log("Uso: node test-retirar.js [cuenta] [url]"); process.exit(1); }
testRetirar(cuenta, url).catch(console.error);
