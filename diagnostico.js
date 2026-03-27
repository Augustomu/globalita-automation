const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const context = browser.contexts()[0];
  const pages = context.pages();

  const linkedinPage = pages.find(p => p.url().includes("linkedin.com/mynetwork/invitation-manager/sent"));
  if (!linkedinPage) {
    console.log("❌ No encontré la pestaña correcta.");
    return;
  }

  // Traer la pestaña al frente y esperar que cargue
  await linkedinPage.bringToFront();
  await new Promise(r => setTimeout(r, 3000));

  console.log("✅ Pestaña activa:", linkedinPage.url());

  const result = await linkedinPage.evaluate(() => {
    // Buscar botones "Retirar" directamente
    const retirarBtns = [...document.querySelectorAll('button')].filter(b => 
      b.innerText.includes('Retirar') || b.innerText.includes('Withdraw')
    );
    
    // Buscar links de perfiles /in/
    const profileLinks = [...document.querySelectorAll('a[href*="/in/"]')];
    
    // HTML del primer item con "Retirar"
    const firstItem = retirarBtns[0]?.closest('li') || retirarBtns[0]?.closest('div[class*="result"]');

    return {
      retirarCount: retirarBtns.length,
      profileLinksCount: profileLinks.length,
      firstButtonText: retirarBtns[0]?.innerText || 'ninguno',
      firstButtonClass: retirarBtns[0]?.className?.slice(0, 100) || 'ninguno',
      firstItemHTML: firstItem?.outerHTML?.slice(0, 400) || 'no encontrado',
      firstProfileHref: profileLinks[0]?.href || 'ninguno',
      bodyText: document.body.innerText.slice(0, 200),
    };
  });

  console.log("\n--- RESULTADOS ---");
  console.log("Botones Retirar encontrados:", result.retirarCount);
  console.log("Links de perfil encontrados:", result.profileLinksCount);
  console.log("Primer botón texto:", result.firstButtonText);
  console.log("Primer botón clase:", result.firstButtonClass);
  console.log("Primer perfil URL:", result.firstProfileHref);
  console.log("\nHTML del primer item:");
  console.log(result.firstItemHTML);
  console.log("\nTexto de la página:");
  console.log(result.bodyText);
})().catch(console.error);
