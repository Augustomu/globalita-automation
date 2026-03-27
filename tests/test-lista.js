/**
 * test-lista.js — Test rápido de verificación LISTA PARA BORRAR
 * 
 * Uso: node test-lista.js [cuenta] [url-perfil]
 *   node test-lista.js david https://www.linkedin.com/in/joaobfjr
 * 
 * Lo que hace:
 * - Abre Sales Navigator del perfil
 * - Inspecciona el DOM del botón "Guardado/Salvo"
 * - Muestra TODO el HTML relevante para entender cómo detectar si está en la lista
 * - NO hace ningún cambio
 */

const path = require("path");
const { chromium } = require("playwright");
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const SESSIONS = {
  alejandro: path.join(__dirname, "session"),
  david:     path.join(__dirname, "david agente invitaciones"),
  francisco: path.join(__dirname, "francisco agente invitaciones"),
};

async function cerrarBanners(page) {
  try {
    await page.evaluate(() => {
      ['.artdeco-global-alert__dismiss','.global-alert-banner__dismiss',
       '[data-test-global-alert-dismiss]','[aria-label="Cerrar"]']
      .forEach(sel => document.querySelectorAll(sel).forEach(b => { try { b.click(); } catch(_) {} }));
    });
    await wait(500);
  } catch(_) {}
}

async function testLista(cuenta, profileUrl) {
  const sessionDir = SESSIONS[cuenta];
  if (!sessionDir) { console.log("❌ Cuenta no reconocida"); return; }

  console.log(`\n🔍 Test LISTA PARA BORRAR — ${cuenta}`);
  console.log(`   Perfil: ${profileUrl}`);
  console.log("=".repeat(50));

  const context = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    args: ["--start-maximized"],
  });

  const page = await context.newPage();

  // Abrir perfil normal primero
  await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  await wait(2000);
  await cerrarBanners(page);

  // Buscar enlace a Sales Navigator
  const salesHref = await page.evaluate(() => {
    const link = [...document.querySelectorAll("a")].find(a =>
      a.href?.includes("linkedin.com/sales/lead") || a.innerText?.includes("Sales Navigator")
    );
    return link?.href || null;
  });

  if (!salesHref) { console.log("❌ No se encontró enlace a Sales Navigator"); await context.close(); return; }

  console.log("\n1. Abriendo Sales Navigator...");
  const salesPage = await context.newPage();
  await salesPage.goto(salesHref, { waitUntil: "domcontentloaded", timeout: 20000 });
  await wait(4000);
  await cerrarBanners(salesPage);

  // Click en botón Guardado/Salvo para abrir el dropdown de listas
  console.log("\n2. Abriendo menú de listas...");
  const btnGuardado = await salesPage.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b =>
      ["Guardado","Salvo","Saved"].includes(b.innerText?.trim())
    );
    if (btn) {
      // Log el HTML del botón antes de clickear
      return { found: true, html: btn.outerHTML, texto: btn.innerText?.trim() };
    }
    return { found: false, allButtons: [...document.querySelectorAll("button")].map(b => b.innerText?.trim()).filter(Boolean).slice(0,20) };
  });

  console.log("   Botón Guardado:", btnGuardado.found ? `✅ "${btnGuardado.texto}"` : "❌ no encontrado");
  if (!btnGuardado.found) {
    console.log("   Botones disponibles:", btnGuardado.allButtons?.join(" | "));
    await wait(30000);
    await context.close();
    return;
  }

  // Click para abrir el dropdown
  await salesPage.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b =>
      ["Guardado","Salvo","Saved"].includes(b.innerText?.trim())
    );
    if (btn) btn.click();
  });
  await wait(2000);

  // Capturar TODO el HTML del dropdown — esto nos dirá cómo detectar si está seleccionado
  const dropdownInfo = await salesPage.evaluate(() => {
    // Buscar el dropdown de listas
    const listContainer = [...document.querySelectorAll('ul, ol, [role="listbox"], [role="menu"]')]
      .find(el => el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    
    if (!listContainer) return { found: false };

    // Buscar LISTA PARA BORRAR específicamente
    const items = [...listContainer.querySelectorAll("li, [role='option'], [role='menuitem']")];
    const listaItem = items.find(el => el.innerText?.includes("LISTA PARA BORRAR"));

    return {
      found: true,
      totalItems: items.length,
      allItemsText: items.map(el => el.innerText?.trim()).filter(Boolean),
      listaParaBorrar: listaItem ? {
        texto: listaItem.innerText?.trim(),
        html: listaItem.outerHTML?.substring(0, 500),
        tieneCheck: listaItem.innerHTML?.includes("check") || listaItem.innerHTML?.includes("✓"),
        tieneAriaSelected: listaItem.getAttribute("aria-selected"),
        tieneAriaChecked: listaItem.getAttribute("aria-checked"),
        clases: listaItem.className,
        // Buscar SVG de check dentro
        svgPaths: [...listaItem.querySelectorAll("svg path")].map(p => p.getAttribute("d")?.substring(0, 50)),
      } : null,
    };
  });

  console.log("\n3. Análisis del dropdown:");
  if (!dropdownInfo.found) {
    console.log("   ❌ Dropdown no encontrado");
  } else {
    console.log(`   Items totales: ${dropdownInfo.totalItems}`);
    console.log("   Items:", dropdownInfo.allItemsText.join(" | "));
    
    if (dropdownInfo.listaParaBorrar) {
      console.log("\n4. LISTA PARA BORRAR encontrada:");
      console.log("   Texto:", dropdownInfo.listaParaBorrar.texto);
      console.log("   aria-selected:", dropdownInfo.listaParaBorrar.tieneAriaSelected);
      console.log("   aria-checked:", dropdownInfo.listaParaBorrar.tieneAriaChecked);
      console.log("   Tiene 'check' en HTML:", dropdownInfo.listaParaBorrar.tieneCheck);
      console.log("   Clases CSS:", dropdownInfo.listaParaBorrar.clases);
      console.log("   SVG paths:", dropdownInfo.listaParaBorrar.svgPaths);
      console.log("\n   HTML completo:");
      console.log("  ", dropdownInfo.listaParaBorrar.html);
    } else {
      console.log("   ❌ LISTA PARA BORRAR no encontrada en el dropdown");
    }
  }

  // Cerrar dropdown sin hacer cambios
  await salesPage.keyboard.press("Escape").catch(() => {});
  
  console.log("\n✅ Test completado — NO se hicieron cambios.");
  console.log("   Presiona Ctrl+C para cerrar.\n");
  
  await wait(30000);
  await context.close();
}

const cuenta = process.argv[2] || "david";
const url = process.argv[3] || "https://www.linkedin.com/in/joaobfjr";
testLista(cuenta, url).catch(console.error);
