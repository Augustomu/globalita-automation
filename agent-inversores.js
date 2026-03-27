const fs = require("fs");
const { chromium } = require("playwright");
const path = require("path");

const DASHBOARD = "http://localhost:3000";
const TEST_MODE = true; // cambiar a false para correr completo

// ── Mensajes ──────────────────────────────────────────────────

const MESSAGE_ES = {
  subject: "Networking",
  body: `¡Hola! ¿Cómo estás?

Estuve viendo tu perfil y quedé genuinamente impresionado con tu trayectoria profesional. La manera en que has construido tu carrera en la industria, acumulando experiencia en distintos desafíos de gestión, es realmente admirable.

Estamos lanzando un producto de Inteligencia Artificial orientado a directivos y gerentes de la industria, con análisis estratégicos y recomendaciones prácticas para apoyar la toma de decisiones en el día a día. Antes del lanzamiento, estamos conversando con profesionales con experiencia real en gestión para conocer sus impresiones y recibir comentarios que nos ayuden a seguir mejorando el producto.

Pensé que, por la visión de negocios que tienes, tu feedback podría ser muy valioso para nosotros. Si te hace sentido, podríamos conversar 15 o 20 minutos. ¿Qué te parece?`,
};

const MESSAGE_EN = {
  subject: "Networking",
  body: `Hi! How are you?

I came across your profile and was genuinely impressed by your professional background. The way you've built your career in the industry, accumulating experience across different management challenges, is truly admirable.

We are launching an Artificial Intelligence product aimed at industry executives and managers, with strategic analysis and practical recommendations to support day-to-day decision-making. Before the launch, we are speaking with professionals who have real management experience to hear their impressions and receive feedback that helps us keep improving the product.

I thought that, given your business perspective, your feedback could be very valuable to us. If it makes sense to you, we could talk for 15 or 20 minutes. What do you think?`,
};

const MESSAGE_PT = {
  subject: "Networking",
  body: `Olá! Como você está?

Estive olhando seu perfil e fiquei genuinamente impressionado com a sua trajetória profissional. A forma como você construiu sua carreira na indústria, acumulando experiência em diferentes desafios de gestão, é realmente admirável.

Estamos lançando um produto de Inteligência Artificial voltado para diretores e gerentes da indústria, com análises estratégicas e recomendações práticas para apoiar a tomada de decisão no dia a dia. Antes do lançamento, estamos conversando com profissionais com experiência real em gestão para conhecer suas impressões e receber comentários que nos ajudem a continuar melhorando o produto.

Pensei que, pela visão de negócios que você tem, seu feedback poderia ser muito valioso para nós. Se fizer sentido para você, poderíamos conversar por 15 ou 20 minutos. O que você acha?`,
};

// ── Keywords Inversores (Alejandro) ───────────────────────────

const INVERSOR_KEYWORDS = [
  "angel investor","angel investing","angel fund","business angel",
  "venture capital","venture capitalist","vc fund","vc partner","vc firm","vc ",
  "family office","single family office","multi family office","mfo","sfo",
  "managing partner","general partner","limited partner","founding partner","gp ",
  "investment manager","investment director","investment officer","investment associate",
  "investment analyst","investment principal","portfolio manager","portfolio director",
  "fund manager","fund director","fund partner","fund associate",
  "chief investment officer"," cio","corporate venture","platform lead","operating partner",
  "seed investor","seed fund","pre-seed","series a","series b","series c",
  "startup investor","early stage investor","tech investor",
  "private equity","pe fund","pe firm","growth equity","impact investor",
  "investor at","investing in","invests in","founder and investor","advisor and investor",
  "inversor angel","angel inversor","capital de riesgo","fondo de venture","fondo vc",
  "socio inversor","socio de inversion","director de inversiones","gerente de inversiones",
  "gestora de fondos","fondo de inversion","portafolio de inversion","inversionista",
  "investidor anjo","capital de risco","fundo de investimento","socio investidor",
];

const INVERSOR_EXCLUDE = [
  "recruiter","talent acquisition","hr ","human resources",
  "vendedor","sales representative","account executive","sdr","bdr",
  "student","intern ","trainee","practicante","estudiante",
];

const US_LOCATIONS = [
  "united states","usa","u.s.",
  "new york","texas","florida","chicago","los angeles","san francisco",
  "boston","seattle","miami","new jersey","massachusetts",
  "washington, dc","washington, d.c",
  // california solo si especifica USA (evita false positive con Baja California)
  "california, united states","california, usa",
  "canada","toronto","vancouver",
  "united kingdom","london","england",
];

// Si la ubicación contiene esto → ES aunque haya match en US_LOCATIONS
const MX_LOCATIONS = [
  "mexico","méxico","baja california","monterrey","guadalajara","cdmx",
  "ciudad de mexico","ciudad de méxico","nuevo leon","jalisco","sonora",
  "chihuahua","coahuila","tamaulipas","sinaloa","veracruz","puebla",
];

// ── Keywords Brasil (David y Francisco) ───────────────────────

const BRASIL_KEYWORDS = [
  // Gestores — español
  "gerente de operaciones","gerente industrial","gerente de produccion",
  "gerente de planta","gerente de mantenimiento","gerente de supply chain",
  "gerente de ingenieria","gerente de mejora continua","gerente de excelencia operacional",
  "director de operaciones","director industrial","director de planta",
  "director de manufactura","director de supply chain",
  "responsable de operaciones","responsable industrial",
  // Gestores — inglés
  "operations manager","plant manager","production manager","maintenance manager",
  "industrial manager","manufacturing manager","engineering manager",
  "supply chain manager","operations director","industrial director","plant director",
  "operational excellence manager","continuous improvement manager","business unit manager",
  // Gestores — portugués
  "gerente de operacoes","gerente industrial","gerente de producao","gerente de planta",
  "gerente de manutencao","gerente de engenharia","gerente de supply chain",
  "gerente de excelencia operacional","diretor de operacoes","diretor industrial",
  "diretor de planta","diretor de manufatura","diretor de supply chain",
  "head de operacoes","head de producao","head de manufatura",
  // Consultores — español
  "consultor industrial","consultor de operaciones","consultor de manufactura",
  "consultor de procesos","consultor de supply chain","consultor de mantenimiento",
  "consultor de excelencia operacional","consultor de mejora continua",
  "consultor de transformacion operacional","consultor de estrategia industrial",
  // Consultores — inglés
  "industrial consultant","operations consultant","manufacturing consultant",
  "process consultant","supply chain consultant","operational excellence consultant",
  "continuous improvement consultant","industrial advisor",
  // Consultores — portugués
  "consultor de operacoes","consultor de manufatura","consultor de processos",
  "consultor de excelencia operacional","consultor de transformacao operacional",
  // Sectores
  "manufactura","manufacturing","manufatura","industria de transformacion",
  "industrial manufacturing","agronegocio","agribusiness","agronegocio",
  "mineracao","mineria","mining","petroleo","oil & gas","energia solar",
];

const BRASIL_EXCLUDE = [
  "gerente de ti","director de ti","head de ti","gerente de it",
  "gerente de sistemas","gerente de infraestrutura","gerente de tecnologia",
  "consultor sap","consultor erp","consultor de software","consultor de cloud",
  "consultor de dados","consultor de ciberseguranca","consultor de infraestrutura",
  "transformacao digital","digital transformation",
  "ciberseguridad","cybersecurity","cloud architect","data engineer",
  "software engineer","developer","desenvolvedor",
  "recruiter","recrutador","talent acquisition","hr ","recursos humanos",
  "vendedor","representante comercial","sdr","bdr",
  "estudante","student","estagiario","intern ","trainee",
  "analista","analyst","tecnico","coordinator","coordinador",
];

const BRASIL_LOCATIONS = [
  "brasil","brazil","sao paulo","rio de janeiro","belo horizonte","curitiba",
  "porto alegre","manaus","fortaleza","recife","salvador","brasilia","campinas",
  "minas gerais","santa catarina","parana","rio grande do sul","bahia","goias",
  "espirito santo","mato grosso","para","amazonas","pernambuco","ceara",
];

// ── Funciones de validación ───────────────────────────────────

function validateInversor(text) {
  const lower = text.toLowerCase();
  const headline = lower.split("\n").slice(0, 4).join("\n");
  for (const kw of INVERSOR_EXCLUDE) {
    if (headline.includes(kw)) return { valido: false, razon: `excluido: "${kw}"` };
  }
  for (const kw of INVERSOR_KEYWORDS) {
    if (lower.includes(kw)) return { valido: true, razon: `match: "${kw}"` };
  }
  return { valido: false, razon: "sin keywords de inversor" };
}

function getMessageInversor(locationText) {
  const lower = (locationText || "").toLowerCase();
  // México tiene prioridad — evita falsos positivos como "Baja California"
  if (MX_LOCATIONS.some(loc => lower.includes(loc))) return MESSAGE_ES;
  return US_LOCATIONS.some(loc => lower.includes(loc)) ? MESSAGE_EN : MESSAGE_ES;
}

function validateBrasil(text) {
  const lower = text.toLowerCase();
  const headline = lower.split("\n").slice(0, 4).join("\n");
  if (!BRASIL_LOCATIONS.some(kw => lower.includes(kw))) return { valido: false, razon: "nao e do Brasil" };
  for (const kw of BRASIL_EXCLUDE) {
    if (headline.includes(kw)) return { valido: false, razon: `excluido headline: "${kw}"` };
  }
  for (const kw of BRASIL_KEYWORDS) {
    if (lower.includes(kw)) return { valido: true, razon: `match: "${kw}"` };
  }
  return { valido: false, razon: "sem keywords de gestor industrial" };
}

// ── Configuración de los 3 flujos ────────────────────────────

const FLOWS = [
  {
    id: "inversores-es",
    name: "Inversores — Alejandro",
    sessionDir: path.join(__dirname, "session"),
    processedFile: path.join(__dirname, "processed-alejandro.json"),
    validate: validateInversor,
    getMessage: (loc) => getMessageInversor(loc),
  },
  {
    id: "brasil-pt-1",
    name: "Brasil PT #1 — David",
    sessionDir: path.join(__dirname, "david agente invitaciones"),
    processedFile: path.join(__dirname, "processed-david.json"),
    validate: validateBrasil,
    getMessage: () => MESSAGE_PT,
  },
  {
    id: "brasil-pt-2",
    name: "Brasil PT #2 — Francisco",
    sessionDir: path.join(__dirname, "francisco agente invitaciones"),
    processedFile: path.join(__dirname, "processed-francisco.json"),
    validate: validateBrasil,
    getMessage: () => MESSAGE_PT,
  },
];

// ── Helpers ───────────────────────────────────────────────────

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const humanWait = (min, max) => wait(Math.floor(Math.random() * (max - min + 1)) + min);

async function reportState(id, patch) {
  try {
    await fetch(`${DASHBOARD}/api/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch }),
    });
  } catch (_) {}
}

async function checkControl(id) {
  try {
    const res = await fetch(`${DASHBOARD}/api/status`);
    const all = await res.json();
    const ctrl = all[id]?.state || "running";
    if (ctrl === "stopped") return false;
    if (ctrl === "paused") {
      while (true) {
        await wait(3000);
        const res2 = await fetch(`${DASHBOARD}/api/status`);
        const all2 = await res2.json();
        const s = all2[id]?.state;
        if (s === "stopped") return false;
        if (s === "running") return true;
      }
    }
    return true;
  } catch (_) { return true; }
}

async function retirarInvitacion(profilePage) {
  try {
    await profilePage.evaluate(() => window.scrollTo(0, 0));
    await wait(500);
    await profilePage.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(b =>
        ["Más","Mais","More"].includes(b.innerText?.trim()) ||
        b.getAttribute("aria-label")?.includes("Más") ||
        b.getAttribute("aria-label")?.includes("Mais")
      );
      if (btn) btn.click();
    });
    await wait(1200);
    const clicked = await profilePage.evaluate(async () => {
      const candidates = [...document.querySelectorAll('ul, ol, [role="menu"], [class*="dropdown"]')];
      const scrollable = candidates.find(el => el.getBoundingClientRect().width > 0 && el.offsetParent !== null);
      if (scrollable) {
        for (let i = 0; i <= 15; i++) {
          scrollable.scrollTop = i * 40;
          await new Promise(r => setTimeout(r, 60));
          const el = [...document.querySelectorAll("*")].find(e =>
            ["Pendiente","Pendente","Pending"].includes(e.innerText?.trim()) && e.offsetParent !== null
          );
          if (el) { el.click(); return true; }
        }
      }
      const el = [...document.querySelectorAll("*")].find(e =>
        ["Pendiente","Pendente","Pending"].includes(e.innerText?.trim()) && e.offsetParent !== null
      );
      if (el) { el.click(); return true; }
      return false;
    });
    if (!clicked) return false;
    await wait(1500);
    await profilePage.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(b =>
        ["Retirar","Confirmar","Confirm","Withdraw","Cancelar convite"].includes(b.innerText?.trim())
      );
      if (btn) btn.click();
    });
    await wait(1000);
    return true;
  } catch (_) { return false; }
}

async function abrirSalesNavigator(context, profilePage) {
  try {
    const href = await profilePage.evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="sales.linkedin.com"]')];
      const pl = links.find(a => a.href.includes("/people/") || a.href.includes("/lead/"));
      if (pl) return pl.href;
      const btn = [...document.querySelectorAll("button, a")].find(b =>
        ["Ver en Sales Navigator","Ver no Sales Navigator","View in Sales Navigator"].includes(b.innerText?.trim())
      );
      if (btn?.href) return btn.href;
      if (btn) { btn.click(); return "clicked"; }
      return null;
    });
    if (!href) return null;
    if (href === "clicked") {
      const np = await context.waitForEvent("page", { timeout: 8000 }).catch(() => null);
      if (np) { await np.waitForLoadState("domcontentloaded"); await wait(3000); return np; }
      return null;
    }
    const sp = await context.newPage();
    await sp.goto(href, { waitUntil: "domcontentloaded", timeout: 20000 });
    await wait(4000);
    return sp;
  } catch (_) { return null; }
}

async function sendMessage(salesPage, msg) {
  await salesPage.bringToFront();
  await wait(3000);
  const opened = await salesPage.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b =>
      ["Mensaje","Mensagem","Message","InMail","Send InMail"].includes(b.innerText?.trim())
    );
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!opened) return false;
  await wait(2000);
  const subEl = await salesPage.$('input[placeholder*="sunto"], input[placeholder*="ubject"], input[name="subject"]');
  if (!subEl) return false;
  await subEl.click();
  await subEl.fill(msg.subject);
  await salesPage.evaluate((body) => {
    for (const sel of ['div[placeholder*="mensagem"]','div[placeholder*="mensaje"]','div[placeholder*="essage"]','p[data-placeholder]','div[contenteditable="true"]','textarea']) {
      const el = document.querySelector(sel);
      if (el) { el.focus(); el.innerHTML=""; document.execCommand("selectAll",false,null); document.execCommand("insertText",false,body); return; }
    }
  }, msg.body);
  await wait(1000);
  if (salesPage.isClosed()) return false;
  const sent = await salesPage.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b => ["Enviar","Send"].includes(b.innerText?.trim())) || document.querySelector('button[type="submit"]');
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (sent) { await wait(2500); return true; }
  return false;
}

async function agregarListaBorrar(salesPage) {
  try {
    await salesPage.bringToFront();
    await wait(1500);
    for (let i = 0; i < 3; i++) { await salesPage.keyboard.press("Escape").catch(() => {}); await wait(300); }
    for (const sel of ["button.msg-overlay-bubble-header__control","[data-test-modal-close-btn]"]) {
      const el = await salesPage.$(sel);
      if (el) { await el.click({ force: true }).catch(() => {}); break; }
    }
    await wait(1000);
    const btn = salesPage.locator('button:has-text("Guardado"), button:has-text("Salvo")').first();
    if (!await btn.isVisible({ timeout: 3000 }).catch(() => false)) return;
    await btn.click();
    await wait(1500);
    const lista = salesPage.locator("text=LISTA PARA BORRAR").first();
    if (await lista.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lista.click();
      await wait(800);
    }
    await salesPage.keyboard.press("Escape").catch(() => {});
  } catch (_) {}
}

async function navigateToSentInvitations(page) {
  await page.goto("https://www.linkedin.com/mynetwork/invitation-manager/sent/", { waitUntil: "domcontentloaded" });
  await wait(3000);
  if (TEST_MODE) {
    return await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/in/"]')]
        .map(a => a.href.split("?")[0])
        .filter(h => h.includes("/in/") && !h.includes("/in/undefined"))
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 5)
    );
  }
  let sinCambios = 0, intentos = 0;
  while (sinCambios < 3 && intentos < 150) {
    try {
      const btn = await page.$('button:has-text("Cargar más"), button:has-text("Carregar mais"), button:has-text("Show more")');
      if (btn) { await btn.scrollIntoViewIfNeeded(); await btn.click(); await wait(2000); sinCambios = 0; intentos++; process.stdout.write("c"); continue; }
    } catch (_) {}
    const prev = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await wait(2500);
    const next = await page.evaluate(() => document.body.scrollHeight);
    sinCambios = next === prev ? sinCambios + 1 : 0;
    intentos++;
    process.stdout.write(".");
  }
  return await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/in/"]')]
      .map(a => a.href.split("?")[0])
      .filter(h => h.includes("/in/") && !h.includes("/in/undefined"))
      .filter((v, i, arr) => arr.indexOf(v) === i)
  );
}

// ── Runner por flujo ──────────────────────────────────────────

async function runFlow(flow) {
  const processed = new Set(
    fs.existsSync(flow.processedFile) ? JSON.parse(fs.readFileSync(flow.processedFile, "utf8")) : []
  );
  const saveProcessed = () => fs.writeFileSync(flow.processedFile, JSON.stringify([...processed]));
  const state = { sent: 0, skipped: 0, errors: [] };
  const tag = `[${flow.name}]`;

  console.log(`${tag} Iniciando...`);
  await reportState(flow.id, { state: "running", startedAt: new Date().toISOString(), lastActivity: "Iniciando..." });

  let context;
  try {
    context = await chromium.launchPersistentContext(flow.sessionDir, { headless: false, args: ["--start-maximized"] });
  } catch (err) {
    console.log(`${tag} ❌ Error sesión: ${err.message}`);
    await reportState(flow.id, { state: "error", errors: ["Error abriendo sesión"] });
    return;
  }

  const mainPage = await context.newPage();
  const profileUrls = await navigateToSentInvitations(mainPage);
  console.log(`${tag} ✅ ${profileUrls.length} perfiles`);

  const urlsToProcess = TEST_MODE ? [profileUrls[0]].filter(Boolean) : [...profileUrls].reverse();

  for (const profileUrl of urlsToProcess) {
    if (!await checkControl(flow.id)) break;
    if (processed.has(profileUrl)) continue;
    processed.add(profileUrl);
    saveProcessed();

    for (const p of context.pages()) { if (p !== mainPage && !p.isClosed()) try { await p.close(); } catch (_) {} }

    console.log(`${tag} → ${profileUrl}`);

    let profilePage;
    try {
      profilePage = await context.newPage();
      await profilePage.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      await humanWait(2000, 4000);
    } catch (_) { state.skipped++; try { await profilePage?.close(); } catch (_) {} continue; }

    const { profileText, locationText, profileName } = await profilePage.evaluate(() => ({
      profileText: (document.querySelector("main")?.innerText || document.body.innerText).slice(0, 4000),
      locationText: document.querySelector(".text-body-small.inline.t-black--light.break-words")?.innerText?.trim() || "",
      profileName: document.querySelector(".text-heading-xlarge")?.innerText?.trim() || "",
    }));

    if (!profileText || profileText.length < 50) { state.skipped++; await profilePage.close(); continue; }

    const val = flow.validate(profileText);
    const name = profileName || profileText.split("\n")[0]?.trim() || profileUrl;
    const msg = flow.getMessage(locationText);
    const flag = msg === MESSAGE_EN ? "🇺🇸" : msg === MESSAGE_PT ? "🇧🇷" : "🇪🇸";

    console.log(`${tag}   ${val.valido ? "✅" : "❌"} ${flag} ${name} — ${val.razon}`);

    if (!val.valido) {
      state.skipped++;
      await reportState(flow.id, { skipped: state.skipped, lastActivity: `Inválido: ${name}` });
      await profilePage.close();
      continue;
    }

    const salesPage = await abrirSalesNavigator(context, profilePage);
    if (!salesPage) { state.skipped++; await profilePage.close(); continue; }

    const enviado = await sendMessage(salesPage, msg).catch(() => false);
    if (enviado) {
      state.sent++;
      console.log(`${tag}   ✅ Enviado ${flag} (total: ${state.sent})`);
      await reportState(flow.id, { sent: state.sent, lastActivity: `Enviado ${flag} a ${name}` });
      await agregarListaBorrar(salesPage);
      await retirarInvitacion(profilePage);
    }

    try { if (!profilePage.isClosed()) await profilePage.close(); } catch (_) {}
    try { if (!salesPage.isClosed()) await salesPage.close(); } catch (_) {}

    await mainPage.bringToFront();
    await humanWait(4000, 8000);
  }

  await reportState(flow.id, { state: "done", lastActivity: "Completado" });
  console.log(`\n${tag} Fin — Enviados: ${state.sent} | Saltados: ${state.skipped}`);
  await context.close();
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  Outreach — 3 flujos en paralelo — v1 final");
  console.log(`  Modo: ${TEST_MODE ? "TEST" : "COMPLETO"}`);
  console.log("=".repeat(60) + "\n");

  const { exec } = require("child_process");
  exec("start http://localhost:3000");

  // Secuencial — cambiar a Promise.all(FLOWS.map(...)) para producción
  for (const flow of FLOWS) await runFlow(flow);
  console.log("\n✅ Todos los flujos completados.");
}

main().catch(console.error);
