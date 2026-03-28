// ================================================================
// export-cookies.js — Exportar cookies de sesión de Playwright
//
// Corre UNA SOLA VEZ en la máquina Windows del usuario.
// Exporta las cookies de la sesión persistente a un JSON portable
// que los test scripts pueden usar sin launchPersistentContext.
//
// Uso:
//   node export-cookies.js francisco
//   node export-cookies.js david
//   node export-cookies.js alejandro
//
// Genera: cookies-francisco.json (o david/alejandro)
// ================================================================

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const SESSION_DIRS = {
  alejandro : path.resolve(__dirname, 'session'),
  david     : path.resolve(__dirname, 'david agente invitaciones'),
  francisco : path.resolve(__dirname, 'francisco agente invitaciones'),
};

const cuenta = process.argv[2];
if (!cuenta || !SESSION_DIRS[cuenta]) {
  console.error('Uso: node export-cookies.js <alejandro|david|francisco>');
  process.exit(1);
}

(async () => {
  console.log(`Abriendo sesión persistente de ${cuenta}...`);
  const context = await chromium.launchPersistentContext(SESSION_DIRS[cuenta], {
    headless: true,
    viewport: { width: 1280, height: 860 },
  });

  // Navegar a LinkedIn para asegurar que las cookies estén disponibles
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // Exportar cookies
  const cookies = await context.cookies();
  const outFile = path.resolve(__dirname, `cookies-${cuenta}.json`);
  fs.writeFileSync(outFile, JSON.stringify(cookies, null, 2));

  console.log(`✅ ${cookies.length} cookies exportadas a ${outFile}`);
  console.log(`Dominios: ${[...new Set(cookies.map(c => c.domain))].join(', ')}`);

  await context.close();
  console.log('Browser cerrado. Ahora hacé: git add cookies-*.json && git commit && git push');
})();
