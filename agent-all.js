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
  "industrial manufacturing","agronegocio","agribusiness",
  "mineracao","mineria","mining","petroleo","oil & gas","energia solar",
  // Títulos cortos — ancla principal en PT
  "gerente","diretora","diretor","gerenta",
  "superintendente","coordenador","coordenadora",
  "head of operations","head of manufacturing","head of production",
];

const BRASIL_EXCLUDE = [
  // TI / Tecnología
  "gerente de ti","head de ti","gerente de it","gerente de sistemas",
  "gerente de infraestrutura","gerente de tecnologia","diretor de ti","diretor de it",
  "consultor sap","consultor erp","consultor de software","consultor de cloud",
  "consultor de dados","consultor de ciberseguranca","consultor de infraestrutura",
  "transformacao digital","digital transformation","transformación digital",
  "ciberseguridad","cybersecurity","cloud architect","data engineer","data scientist",
  "software engineer","developer","desenvolvedor","programador","it manager",
  "systems manager","infrastructure manager","technology manager",
  // RRHH — PT
  "recursos humanos","gestao de pessoas","gestão de pessoas",
  "recrutamento","recrutador","recrutadora","talent acquisition",
  "people & culture","people and culture","hrbp","hr business partner",
  "gerente de rh","diretor de rh","head de rh","head of hr","head of people",
  "departamento pessoal","relacoes trabalhistas","treinamento e desenvolvimento",
  // RRHH — EN
  "human resources","hr manager","hr director","hr specialist",
  "recruiter","recruiting","talent management","people operations",
  "chief people officer","vp of people","director of people",
  // Ventas / SDR
  "vendedor","representante comercial","sdr","bdr","account executive",
  "sales representative","executivo de vendas","representante de vendas",
  // Sin experiencia
  "estudante","student","estagiario","estagiária","intern ","trainee","aprendiz",
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

function normalizeUrl(url) {
  // Quitar sufijos de idioma (/es/, /en/, etc) y query params
  return url.split("?")[0].replace(/\/(es|en|pt|fr|de)\/?$/, "").replace(/\/$/, "");
}
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

async function retirarInvitacion(profilePage, profileUrl) {
  let invPage;
  try {
    invPage = await profilePage.context().newPage();
    await invPage.goto("https://www.linkedin.com/mynetwork/invitation-manager/sent/", {
      waitUntil: "domcontentloaded", timeout: 15000
    });
    await wait(3000);
    await cerrarBanners(invPage);

    const slug = (profileUrl || "").replace(/\/$/, "").split("/").pop();

    // Scroll progresivo hasta encontrar el slug — cubre perfiles viejos que no están en DOM inicial
    let intentosScroll = 0;
    while (intentosScroll < 40) {
      const found = await invPage.$(`a[href*="${slug}"]`).catch(() => null);
      if (found) break;
      // Intentar botón "Cargar más" primero
      const btnMas = await invPage.$('button:has-text("Cargar más"), button:has-text("Carregar mais"), button:has-text("Show more")').catch(() => null);
      if (btnMas) { await btnMas.scrollIntoViewIfNeeded().catch(() => {}); await btnMas.click().catch(() => {}); await wait(2000); }
      else {
        const prevH = await invPage.evaluate(() => document.body.scrollHeight);
        await invPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await wait(1500);
        const newH = await invPage.evaluate(() => document.body.scrollHeight);
        if (newH === prevH) break; // no hay más contenido
      }
      intentosScroll++;
    }

    const clickado = await invPage.evaluate((slug) => {
      const links = [...document.querySelectorAll("a[href*='/in/']")];
      const link = links.find(a => a.href.includes(slug));
      if (!link) return false;
      const container = link.closest("li") || link.closest("[data-view-name]") || link.parentElement?.parentElement?.parentElement;
      if (!container) return false;
      const btn = [...container.querySelectorAll("button, span")].find(b =>
        b.innerText?.trim() === "Retirar" || b.innerText?.trim() === "Withdraw"
      );
      if (btn) { btn.click(); return true; }
      return false;
    }, slug);

    if (!clickado) { await invPage.close(); return false; }

    // Esperar modal y confirmar
    try {
      await invPage.waitForSelector("button:has-text('Retirar')", { timeout: 6000 });
      await invPage.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find(b => b.innerText?.trim() === "Retirar");
        if (btn) btn.click();
      });
      await wait(1500);
    } catch(_) {}

    await invPage.close();
    return true;
  } catch(e) {
    console.log(`     ⚠ retirarInvitacion: ${e.message?.split("\n")[0]}`);
    try { if (invPage && !invPage.isClosed()) await invPage.close(); } catch(_) {}
    return false;
  }
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
    await cerrarBanners(sp);
    return sp;
  } catch (_) { return null; }
}

async function sendMessage(salesPage, msg, flowId) {
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
  // Leer créditos desde el modal abierto
  await checkCreditsFromModal(salesPage, flowId || "unknown");
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
      // Detectar estado real via SVG use[href] — más confiable que innerHTML o aria-selected
      // ERROR 8 documentado: innerHTML.includes("check") y aria-selected no funcionan en LinkedIn
      const yaEnLista = await lista.evaluate(el => {
        const row = el.closest("li") || el.closest("[role='option']") || el.parentElement;
        if (!row) return false;
        // Capa 1: SVG use href — cambia de "plus"/"bookmark" a "check"/"tick" cuando está seleccionado
        const useEl = row.querySelector("svg use");
        const svgHref = useEl?.getAttribute("href") || useEl?.getAttribute("xlink:href") || "";
        if (svgHref.toLowerCase().includes("check") || svgHref.toLowerCase().includes("tick")) return true;
        // Capa 2: atributo aria-checked (distinto de aria-selected, puede estar implementado)
        if (row.getAttribute("aria-checked") === "true") return true;
        // Capa 3: data-test atributos específicos de Sales Nav
        if (row.querySelector("[data-test-list-item-selected='true']")) return true;
        return false;
      }).catch(() => false);
      if (!yaEnLista) {
        await lista.click();
        await wait(800);
        console.log("  📋 Agregado a LISTA PARA BORRAR");
      } else {
        console.log("  📋 Ya estaba en LISTA PARA BORRAR — sin cambios");
      }
    }
    await salesPage.keyboard.press("Escape").catch(() => {});
  } catch (_) {}
}

const CACHE_TTL_HOURS = 12; // horas antes de refrescar el scroll

function getCacheFile(flow) {
  return path.join(__dirname, `cache-urls-${flow.id}.json`);
}

function loadUrlCache(flow) {
  try {
    const f = getCacheFile(flow);
    if (!fs.existsSync(f)) return null;
    const { urls, savedAt } = JSON.parse(fs.readFileSync(f, "utf8"));
    const ageHours = (Date.now() - new Date(savedAt).getTime()) / 3600000;
    if (ageHours > CACHE_TTL_HOURS) return null;
    console.log(`[${flow.name}] 📦 Cache cargado (${urls.length} URLs, hace ${ageHours.toFixed(1)}h)`);
    return urls;
  } catch (_) { return null; }
}

function saveUrlCache(flow, urls) {
  fs.writeFileSync(getCacheFile(flow), JSON.stringify({ urls, savedAt: new Date().toISOString() }));
}

async function navigateToSentInvitations(page, flow) {
  if (!TEST_MODE) {
    const cached = loadUrlCache(flow);
    if (cached) return cached;
  }

  await page.goto("https://www.linkedin.com/mynetwork/invitation-manager/sent/", { waitUntil: "domcontentloaded" });
  await wait(3000);
  await cerrarBanners(page);
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
  console.log(`[${flow.name}] 🔄 Cargando invitaciones con scroll...`);
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
  const urls = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/in/"]')]
      .map(a => a.href.split("?")[0])
      .filter(h => h.includes("/in/") && !h.includes("/in/undefined"))
      .filter((v, i, arr) => arr.indexOf(v) === i)
  );
  saveUrlCache(flow, urls);
  console.log(`\n[${flow.name}] 💾 Cache guardado (${urls.length} URLs)`);
  return urls;
}

// ── Cerrar banners de alerta ─────────────────────────────────

async function cerrarBanners(page) {
  try {
    await page.evaluate(() => {
      const selectors = [
        '[data-test-global-alert-dismiss]',
        '[aria-label="Dismiss"]',
        '[aria-label="Cerrar"]',
        '[aria-label="Close"]',
        '.artdeco-global-alert__dismiss',
        '.msg-overlay-bubble-header__control--close-btn',
        'button[data-control-name="overlay.close"]',
        // Banner de pago de LinkedIn
        '.global-alert-banner__dismiss',
        '[data-tracking-control-name="global-alert-banner-dismiss"]',
      ];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(btn => {
          try { btn.click(); } catch(_) {}
        });
      });
      document.querySelectorAll('[class*="alert"] button, [class*="banner"] button, [class*="notice"] button').forEach(btn => {
        if (btn.innerText?.trim().match(/^(×|X|Close|Cerrar|Dismiss)$/i)) {
          try { btn.click(); } catch(_) {}
        }
      });
    });
    await new Promise(r => setTimeout(r, 600));
  } catch (_) {}
}

// ── Créditos InMail ──────────────────────────────────────────

async function checkCreditsFromModal(salesPage, flowId) {
  // Lee créditos desde el modal de InMail cuando ya está abierto
  try {
    const credits = await salesPage.evaluate(() => {
      const allText = document.body.innerText;
      // "Usar 1 de 146 créditos disponibles" o "Use 1 of 50 InMail credits"
      const match = allText.match(/de\s+(\d+)\s+cr[eé]ditos/i) ||
                    allText.match(/of\s+(\d+)\s+InMail/i) ||
                    allText.match(/(\d+)\s+cr[eé]ditos\s+disponibles/i);
      if (match) return parseInt(match[1]);
      return null;
    });
    if (credits !== null) {
      console.log(`[${flowId}] 💳 Créditos disponibles: ${credits}`);
      await reportState(flowId, { credits });
    }
  } catch (_) {}
}

async function checkCredits(context, flowId) {
  // Placeholder — créditos se leen en sendMessage desde el modal
}

// ── Dejar de seguir perfil ───────────────────────────────────

async function dejarDeSeguir(profilePage) {
  try {
    await profilePage.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 500));
    // Buscar botón "Siguiendo" o "Conectado" para dejar de seguir
    const clicked = await profilePage.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(b => {
        const txt = b.innerText?.trim();
        const label = b.getAttribute("aria-label")?.toLowerCase() || "";
        return ["Siguiendo","Following","Seguindo"].includes(txt) ||
               label.includes("siguiendo") || label.includes("following") || label.includes("seguindo");
      });
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clicked) return false;
    await new Promise(r => setTimeout(r, 1000));
    // Confirmar "Dejar de seguir" en el modal si aparece
    await profilePage.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(b =>
        ["Dejar de seguir","Unfollow","Deixar de seguir"].includes(b.innerText?.trim())
      );
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 800));
    return true;
  } catch (_) { return false; }
}

// ── Runner por flujo ──────────────────────────────────────────

// ── Fase 1: abrir browser + scroll de invitaciones ────────────
async function initFlow(flow) {
  const tag = `[${flow.name}]`;
  console.log(`${tag} Abriendo browser y cargando invitaciones...`);
  await reportState(flow.id, { state: "running", startedAt: new Date().toISOString(), lastActivity: "Cargando invitaciones..." });

  let context;
  try {
    context = await chromium.launchPersistentContext(flow.sessionDir, { headless: false, args: ["--start-maximized"] });
  } catch (err) {
    console.log(`${tag} ❌ Error sesión: ${err.message}`);
    await reportState(flow.id, { state: "error", errors: ["Error abriendo sesión"] });
    return;
  }

  const mainPage = await context.newPage();
  await checkCredits(context, flow.id);
  const profileUrls = await navigateToSentInvitations(mainPage, flow);
  console.log(`${tag} ✅ ${profileUrls.length} perfiles`);
  console.log(`${tag} ✅ Scroll completo — esperando turno para procesar`);
  await reportState(flow.id, { lastActivity: `${profileUrls.length} perfiles listos, esperando turno` });
  return { context, mainPage, profileUrls };
}

// ── initFlowState: prepara estado completo por flujo ──────────
async function initFlowState(flow, ctx) {
  if (!ctx) return null;
  const { context, mainPage, profileUrls } = ctx;
  const processed = new Set(
    (fs.existsSync(flow.processedFile) ? JSON.parse(fs.readFileSync(flow.processedFile, "utf8")) : [])
      .map(u => normalizeUrl(u))
  );
  const saveProcessed = () => fs.writeFileSync(flow.processedFile, JSON.stringify([...processed]));
  const prevStatus = await fetch(`${DASHBOARD}/api/status`).then(r=>r.json()).catch(()=>({}));
  const historyFile = path.join(__dirname, "history.json");
  const historyData = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, "utf8")) : {};
  const prevSentLog = historyData[flow.id]?.sentLog || prevStatus[flow.id]?.sentLog || [];
  const prevSkipLog = historyData[flow.id]?.skipLog || prevStatus[flow.id]?.skipLog || [];
  const state = { sent: 0, skipped: 0, errors: [], sentLog: [...prevSentLog], skipLog: [...prevSkipLog] };
  const urlsToProcess = TEST_MODE
    ? [profileUrls[profileUrls.length - 1]].filter(Boolean)
    : [...profileUrls].reverse(); // más viejo primero
  console.log(`[${flow.name}] ✅ Estado listo — ${urlsToProcess.length} perfiles en cola`);
  return { flow, context, mainPage, urlsToProcess, processed, saveProcessed, state, tag: `[${flow.name}]` };
}

// ── procesarUnPerfil: procesa el próximo perfil de un flowState ─
async function procesarUnPerfil(fs) {
  const { flow, context, mainPage, urlsToProcess, processed, saveProcessed, state, tag } = fs;

  // Avanzar hasta el próximo perfil no procesado
  while (urlsToProcess.length > 0) {
    const profileUrl = urlsToProcess[0];
    if (!processed.has(normalizeUrl(profileUrl)) && await checkControl(flow.id)) break;
    urlsToProcess.shift();
  }
  if (urlsToProcess.length === 0) return false; // sin más perfiles

  const profileUrl = urlsToProcess.shift();
  for (const p of context.pages()) { if (p !== mainPage && !p.isClosed()) try { await p.close(); } catch (_) {} }
  console.log(`${tag} → ${profileUrl}`);

  let profilePage;
  try {
    profilePage = await context.newPage();
    await profilePage.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await humanWait(2000, 4000);
    await cerrarBanners(profilePage);
  } catch (_) { state.skipped++; try { await profilePage?.close(); } catch (_) {} return true; }

  const { profileText, locationText, profileName, mensajeYaEnviado } = await profilePage.evaluate(() => ({
    profileText: (document.querySelector("main")?.innerText || document.body.innerText).slice(0, 4000),
    locationText: document.querySelector(".text-body-small.inline.t-black--light.break-words")?.innerText?.trim() || "",
    profileName: document.querySelector(".text-heading-xlarge")?.innerText?.trim() || "",
    mensajeYaEnviado: !![...document.querySelectorAll("*")].find(el =>
      el.children.length === 0 &&
      (el.innerText?.includes("Mensaje enviado") || el.innerText?.includes("Message sent") ||
       el.innerText?.includes("Mensagem enviada") || el.innerText?.includes("InMail enviado") ||
       el.innerText?.includes("InMail sent") || el.innerText?.includes("Responded"))
    ),
  }));

  if (!profileText || profileText.length < 50) { state.skipped++; await profilePage.close(); return true; }

  const val  = flow.validate(profileText);
  const name = profileName || profileText.split("\n")[0]?.trim() || profileUrl;
  const msg  = flow.getMessage(locationText);
  const flag = msg === MESSAGE_EN ? "🇺🇸" : msg === MESSAGE_PT ? "🇧🇷" : "🇪🇸";

  const profileUrlNorm = normalizeUrl(profileUrl);
  const yaEnviado = mensajeYaEnviado || state.sentLog.some(p => normalizeUrl(p.url) === profileUrlNorm);
  if (yaEnviado) {
    console.log(`${tag}   ⏭ ${name} — ya enviado, retirando`);
    await retirarInvitacion(profilePage, profileUrl).catch(() => false);
    try { if (!profilePage.isClosed()) await profilePage.close(); } catch (_) {}
    await mainPage.bringToFront();
    await humanWait(4000, 8000);
    return true;
  }

  console.log(`${tag}   ${val.valido ? "✅" : "❌"} ${flag} ${name} — ${val.razon}`);

  if (!val.valido) {
    state.skipped++;
    state.skipLog.push({ name, url: profileUrl, reason: val.razon });
    await reportState(flow.id, { skipped: state.skipped, skipLog: state.skipLog, lastActivity: `Saltado: ${name}` });
    if (flow.id === "inversores-es") {
      const dejado = await dejarDeSeguir(profilePage).catch(() => false);
      console.log(`${tag}   ${dejado ? "✅ Dejado de seguir" : "⚠ No se pudo dejar de seguir"}`);
    }
    processed.add(normalizeUrl(profileUrl));
    saveProcessed();
    await profilePage.close();
    return true;
  }

  const salesPage = await abrirSalesNavigator(context, profilePage);
  if (!salesPage) { state.skipped++; await profilePage.close(); return true; }

  await salesPage.waitForLoadState("networkidle").catch(() => {});
  await wait(3000);

  const PATRONES_ENVIADO = [
    'text="Esperando respuesta"', 'text="Waiting for response"',
    'text="Aguardando resposta"', 'text="Esperando resposta"',
    'text="InMail enviado"',      'text="InMail sent"',
    'text="Mensagem enviada"',    'text="Mensaje enviado"',
    'text="Message sent"',
  ];
  let yaEnviadoSalesNav = false;
  for (const pat of PATRONES_ENVIADO) {
    const found = await salesPage.$(pat).catch(() => null);
    if (found) { yaEnviadoSalesNav = true; break; }
  }
  if (!yaEnviadoSalesNav) {
    yaEnviadoSalesNav = await salesPage.evaluate(() => {
      const txt = document.body.innerText || "";
      return txt.includes("Mensaje enviado") || txt.includes("Message sent") ||
             txt.includes("Mensagem enviada") || txt.includes("InMail sent") ||
             txt.includes("InMail enviado") ||
             txt.includes("Esperando respuesta") || txt.includes("Waiting for response") ||
             txt.includes("Aguardando resposta") || txt.includes("Esperando resposta");
    }).catch(() => false);
  }

  if (yaEnviadoSalesNav) {
    console.log(`${tag}   📬 ${name} — ya enviado (Sales Nav), retirando`);
    try { if (!salesPage.isClosed()) await salesPage.close(); } catch (_) {}
    await wait(1500);
    const retirado2 = await retirarInvitacion(profilePage, profileUrl).catch(() => false);
    console.log(`${tag}   ${retirado2 ? "✅ Retirado" : "⚠ No se pudo retirar"}`);
    try { if (!profilePage.isClosed()) await profilePage.close(); } catch (_) {}
    processed.add(normalizeUrl(profileUrl));
    saveProcessed();
    await mainPage.bringToFront();
    await humanWait(4000, 8000);
    return true;
  }

  const enviado = await sendMessage(salesPage, msg, flow.id).catch(() => false);
  if (enviado) {
    state.sent++;
    state.sentLog.push({ name, url: profileUrl, reason: val.razon });
    console.log(`${tag}   ✅ Enviado ${flag} (total: ${state.sent})`);
    await reportState(flow.id, { sent: state.sent, sentLog: state.sentLog, lastActivity: `Enviado ${flag} a ${name}` });
    await agregarListaBorrar(salesPage);
    try { if (!salesPage.isClosed()) await salesPage.close(); } catch (_) {}
    await wait(1500);
    const retirado = await retirarInvitacion(profilePage, profileUrl).catch(() => false);
    console.log(`${tag}   ${retirado ? "✅ Retirado" : "⚠ No se pudo retirar"}`);
  } else {
    console.log(`${tag}   ⚠ No se pudo enviar a ${name} — retirando igual`);
    try { if (!salesPage.isClosed()) await salesPage.close(); } catch (_) {}
    await wait(1500);
    const retiradoFb = await retirarInvitacion(profilePage, profileUrl).catch(() => false);
    console.log(`${tag}   ${retiradoFb ? "✅ Retirado (fallback)" : "⚠ No se pudo retirar"}`);
  }

  try { if (!profilePage.isClosed()) await profilePage.close(); } catch (_) {}
  try { if (!salesPage.isClosed()) await salesPage.close(); } catch (_) {}
  processed.add(normalizeUrl(profileUrl));
  saveProcessed();
  await mainPage.bringToFront();
  await humanWait(4000, 8000);
  return true;
}

// ── finalizarFlow: guarda sesión y cierra browser ──────────────
async function finalizarFlow(flow, fs) {
  if (!fs) return;
  const { context, state } = fs;
  const tag = `[${flow.name}]`;
  const currentStatus = await fetch(`${DASHBOARD}/api/status`).then(r=>r.json()).catch(()=>({}));
  const prevSessions = currentStatus[flow.id]?.sessions || [];
  const newSession = {
    startedAt: new Date().toISOString(),
    profiles: state.sent + state.skipped,
    sent: state.sent,
    skipped: state.skipped,
    conv: state.sent + state.skipped > 0 ? Math.round((state.sent / (state.sent + state.skipped)) * 100) + "%" : null,
  };
  const sessions = [...prevSessions, newSession].slice(-20);
  await reportState(flow.id, { state: "done", lastActivity: "Completado", sessions });
  console.log(`\n${tag} Fin — Enviados: ${state.sent} | Saltados: ${state.skipped}`);
  try { await context.close(); } catch (_) {}
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const flowFilter = process.env.FLOW_FILTER || null;
  const flowsToRun = flowFilter
    ? FLOWS.filter(f => f.id === flowFilter)
    : FLOWS;

  console.log("=".repeat(60));
  console.log("  Outreach — v1 final");
  console.log(`  Modo: ${TEST_MODE ? "TEST" : "COMPLETO"}`);
  console.log(`  Flujos: ${flowsToRun.map(f => f.name).join(", ")}`);
  console.log("=".repeat(60) + "\n");

  // ── Fase 1: los 3 browsers abren y scrollean en paralelo ──────
  console.log("▶ Fase 1 — cargando invitaciones en paralelo (3 browsers)...");
  const ctxs = await Promise.all(flowsToRun.map(flow => initFlow(flow)));
  console.log("\n✅ Fase 1 completa — todos los browsers cargados\n");

  // ── Fase 2: inicializar estado por flujo ───────────────────────
  const flowStates = await Promise.all(flowsToRun.map((flow, i) => initFlowState(flow, ctxs[i])));

  // ── Fase 3: round-robin — un perfil por cuenta a la vez ───────
  console.log("▶ Fase 3 — procesamiento round-robin (un browser activo a la vez)...");
  let hayPendientes = true;
  while (hayPendientes) {
    hayPendientes = false;
    for (let i = 0; i < flowsToRun.length; i++) {
      if (!flowStates[i]) continue;
      const tuvo = await procesarUnPerfil(flowStates[i]);
      if (tuvo) hayPendientes = true;
    }
  }

  // ── Fase 4: guardar sesiones y cerrar browsers ────────────────
  for (let i = 0; i < flowsToRun.length; i++) {
    await finalizarFlow(flowsToRun[i], flowStates[i]);
  }
  console.log("\n✅ Todos los flujos completados.");
}

main().catch(console.error);
