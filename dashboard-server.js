const http = require("http");
const fs   = require("fs");
const path = require("path");
const { spawn } = require("child_process");

let agentProcess = null;
const PORT        = process.env.DASH_PORT || 3000;
const STATUS_DIR  = path.join(__dirname, "status");
const HISTORY_FILE = path.join(__dirname, "history.json");
if (!fs.existsSync(STATUS_DIR)) fs.mkdirSync(STATUS_DIR);

// ── Autenticación básica ──
const AUTH_USER = process.env.DASH_USER || "augusto";
const AUTH_PASS = process.env.DASH_PASS || "globalita2026";

function checkAuth(req, res) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Dashboard Globalita"' });
    res.end("Acceso denegado");
    return false;
  }
  const decoded = Buffer.from(header.slice(6), "base64").toString();
  const [user, pass] = decoded.split(":");
  if (user === AUTH_USER && pass === AUTH_PASS) return true;
  res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Dashboard Globalita"' });
  res.end("Credenciales incorrectas");
  return false;
}

function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); }
  catch (_) { return {}; }
}

function writeHistory(id, patch) {
  const h = readHistory();
  if (!h[id]) h[id] = { sentLog: [], skipLog: [], sessions: [], totalSent: 0, totalSkipped: 0 };
  if (patch.sentLog)  h[id].sentLog  = patch.sentLog;
  if (patch.skipLog)  h[id].skipLog  = patch.skipLog;
  if (patch.sessions) h[id].sessions = patch.sessions;
  if (patch.sent != null)    h[id].totalSent     = patch.sent;
  if (patch.skipped != null) h[id].totalSkipped  = patch.skipped;
  if (patch.credits != null) h[id].credits       = patch.credits;
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2));
}

const AUTOMATIONS = [
  { id:"invitar-alejandro" }, { id:"invitar-david" }, { id:"invitar-francisco" },
  { id:"inversores-es"  }, { id:"brasil-pt-1"   }, { id:"brasil-pt-2"   },
  { id:"followup-li"    }, { id:"multicanal"     }, { id:"interaccion"   },
  { id:"camaras-email"  }, { id:"confirm-email"  }, { id:"agendado"      },
  { id:"cal-confirm"    }, { id:"crm-enrich"     }, { id:"news-monitor"  },
];

function statusPath(id) { return path.join(STATUS_DIR, id + ".json"); }
function readStatus(id) {
  const h = readHistory()[id] || {};
  let s = { state:"idle", sent:0, skipped:0, errors:[], lastActivity:null,
    credits: h.credits || null,
    sentLog: h.sentLog || [],
    skipLog: h.skipLog || [],
    sessions: h.sessions || [] };
  try {
    const saved = JSON.parse(fs.readFileSync(statusPath(id), "utf8"));
    Object.assign(s, saved);
    // Always use history logs (more complete)
    if (h.sentLog && h.sentLog.length) s.sentLog = h.sentLog;
    if (h.skipLog && h.skipLog.length) s.skipLog = h.skipLog;
    if (h.sessions && h.sessions.length) s.sessions = h.sessions;
    if (h.credits != null) s.credits = h.credits;
  } catch (_) {}
  return s;
}
function writeStatus(id, data) {
  fs.writeFileSync(statusPath(id), JSON.stringify(data, null, 2));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost:" + PORT);

  // Auth requerida para todas las rutas
  if (!checkAuth(req, res)) return;

  if (req.method === "GET" && url.pathname === "/") {
    const html = fs.readFileSync(path.join(__dirname, "dashboard.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    const result = {};
    for (const a of AUTOMATIONS) result[a.id] = readStatus(a.id);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(result));
  }

  if (req.method === "POST" && url.pathname === "/api/control") {
    let body = "";
    req.on("data", d => body += d);
    req.on("end", () => {
      try {
        const { id, action } = JSON.parse(body);
        const s = readStatus(id);
        if (action === "stop")  s.state = "stopped";
        if (action === "run")   s.state = "running";
        if (action === "pause") s.state = "paused";
        writeStatus(id, s);
        res.writeHead(200); res.end("ok");
      } catch (_) { res.writeHead(400); res.end(); }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/update") {
    let body = "";
    req.on("data", d => body += d);
    req.on("end", () => {
      try {
        const { id, patch } = JSON.parse(body);
        const s = readStatus(id);
        Object.assign(s, patch);
        writeStatus(id, s);
        // Persist to history (never deleted)
        writeHistory(id, patch);
        res.writeHead(200); res.end("ok");
      } catch (_) { res.writeHead(400); res.end(); }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/launch") {
    let body = "";
    req.on("data", d => body += d);
    req.on("end", () => {
      try {
        const { flowId } = body ? JSON.parse(body) : {};
        if (agentProcess && !agentProcess.killed) {
          res.writeHead(409, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "already_running" }));
        }
        const agentPath = path.join(__dirname, "agent-all.js");
        const env = Object.assign({}, process.env);
        if (flowId) env.FLOW_FILTER = flowId;
        agentProcess = spawn("node", [agentPath], {
          cwd: __dirname, detached: false,
          stdio: ["ignore","pipe","pipe"], env,
        });
        agentProcess.stdout.on("data", d => process.stdout.write("[agent] " + d));
        agentProcess.stderr.on("data", d => process.stderr.write("[agent-err] " + d));
        agentProcess.on("exit", code => {
          console.log("[agent] exited " + code);
          agentProcess = null;
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok:true, pid:agentProcess.pid, flowId:flowId||"all" }));
      } catch (_) { res.writeHead(400); res.end(); }
    });
    return;
  }

  // GET /api/logs/:cuenta — últimas 100 líneas del log filtradas por cuenta
  var logsMatch = url.pathname.match(/^\/api\/logs\/(alejandro|david|francisco)$/);
  if (req.method === "GET" && logsMatch) {
    var cuenta = logsMatch[1];
    var logPath = path.join(__dirname, "invitar-agent.log");
    try {
      var raw = fs.readFileSync(logPath, "utf8");
      var lines = raw.split("\n").filter(function(l) {
        return l.toLowerCase().indexOf(cuenta) !== -1;
      });
      var last100 = lines.slice(-100);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ cuenta: cuenta, lines: last100 }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ cuenta: cuenta, lines: [], error: "Log no encontrado" }));
    }
  }

  if (req.method === "GET" && url.pathname === "/api/agent-status") {
    const running = agentProcess !== null && !agentProcess.killed;
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ running }));
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  console.log("✅ Dashboard → http://localhost:" + PORT);
});
