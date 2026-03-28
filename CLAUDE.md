# CLAUDE.md — Globalita Automation

Este archivo le explica a Claude Code todo lo que necesita saber para operar este
repositorio sin que Augusto tenga que explicar el contexto cada vez.

---

## Quién soy

**Augusto Matko Unzaga** — trabajo en proyectos de automatización, outreach y SaaS.
Opero en español, inglés y portugués. Mis proyectos principales:

- **Globalita** — empresa de automatización e inteligencia artificial
- **Sub Gerente** — SaaS de decisiones estratégicas para gerentes industriales
- **FABRIPT** — partnerships de AI con cámaras industriales en Brasil
- **Conocernos / Filosofar** — app de juego de cartas filosófico

---

## Estructura del repositorio

```
globalita-automation/
  linkedin-agent/          ← automatización de invitaciones LinkedIn (activo)
  mensajes-agent/          ← automatización de mensajes/outreach LinkedIn (activo)
  dashboard/               ← servidor + HTML del panel de control
  docs/                    ← documentación interna
  CLAUDE.md                ← este archivo
  .gitignore
  README.md
```

---

## Proyecto 1 — LinkedIn Invitar Agent

**Directorio:** `linkedin-agent/`
**Archivo principal:** `invitar-agent.js`
**Tecnología:** Node.js + Playwright (browser automation)

### Qué hace
Envía invitaciones de conexión en LinkedIn Sales Navigator para 3 cuentas:
- **Alejandro** — inversores (ES/EN) · 100 inv/día · 50 US + 50 MX
- **David** — gerentes industriales Brasil (PT) · 100 inv/día · 70 gerente + 30 consultor
- **Francisco** — gerentes industriales Brasil (PT) · 100 inv/día · 70 gerente + 30 consultor

### Archivos clave

| Archivo | Función |
|---------|---------|
| `invitar-agent.js` | Script principal — orquestador F1→F7 |
| `quota-invitar.json` | Cuotas diarias por cuenta y grupo |
| `pending-email.json` | Perfiles que requieren verificación de email (F6) |
| `invitar-agent.log` | Log de ejecución |
| `session/` | Sesión de Playwright — Alejandro |
| `david agente invitaciones/` | Sesión de Playwright — David |
| `francisco agente invitaciones/` | Sesión de Playwright — Francisco |

### Flujo principal (F1→F7)
```
F1 → Abrir búsqueda guardada de SalesNav
F2 → Scroll progresivo + procesar perfiles visibles
F3 → Verificar estado del perfil (candidato / skip-saved / skip-pending)
F4 → Enviar invitación (Connect directo o via dropdown ···)
  → Si pide email → requires-email → logPendingEmail → continuar
F5 → Siguiente página
F6 → Al final: procesar pending-email.json con flow completo:
      SalesNav lead → "Ver perfil de LinkedIn" → linkedin.com/in/
      → detectar Conectar (directo o en "Más") → email augusto@globalita.io → nota → enviar
F7 → Gestión de cuota diaria (quota-invitar.json)
```

### Cómo correrlo
```bash
# Una sola cuenta
node invitar-agent.js alejandro
node invitar-agent.js david
node invitar-agent.js francisco

# Las 3 en secuencial (alejandro → david → francisco)
node invitar-agent.js
```

### Reglas críticas documentadas
- **F4 moreBtn:** `locator.click({timeout:3000}).catch()` — el click SÍ ejecuta aunque
  Playwright tire "element is not visible". NUNCA usar timeout largo (bloquea 30s).
- **F6 URL:** usar `buildSalesNavUrl()` — el profileUrl en pending-email.json puede venir
  en varios formatos (ID solo, path con/sin slash, URL completa).
- **Mutex:** `guardarCuotaSafe()` y `pendingWriteSafe()` protegen los JSONs de race
  conditions cuando las 3 cuentas escriben en paralelo.
- **MAX_INTENTOS_F6 = 4** — después de 4 intentos fallidos de email, el perfil se descarta.
- **Ejecución secuencial** — NO usar Promise.all para las cuentas. Alejandro → David → Francisco.

### Bugs documentados y resueltos
- B1-B4: scroll, return value, mutex quota, waitFor compatibility
- C1: revisión pre-página (scroll top + re-escaneo)
- D1-D4: deduplicación, idsError, spinlock pending, grupo null
- E2: leer pending-email.json al inicio de runAccount
- F1: todosPendEmail fuera del for de plan
- BUG-1: moreBtnSalesNav.click timeout
- BUG-2: verLinkedinOpt.click timeout 30s → 3s
- BUG-3: mutex cleanup F6 (pendingWriteSafe)
- BUG-4: verificación post-send en F6
- URL-FIX: buildSalesNavUrl normaliza todos los formatos

### Archivos de test
```bash
node test-f6.js alejandro        # Test aislado del flujo email F6
node test-bug1-bug2.js alejandro "URL_LEAD"  # Test botón ··· + Ver perfil LinkedIn
node test-bug3.js                # Test mutex pending-email.json (sin browser)
node apply-fixes.js              # Aplica fixes confirmados al agente
```

---

## Proyecto 2 — LinkedIn Mensajes Agent (Outreach)

**Directorio:** `mensajes-agent/`
**Archivo principal:** `agent-inversores.js`
**Tecnología:** Node.js + Playwright

### Qué hace
Envía mensajes InMail en LinkedIn a perfiles que ya tienen invitación pendiente.
3 flujos en secuencial:
- **inversores-es** — Alejandro, inversores MX/US, mensajes ES/EN
- **brasil-pt-1** — David, gerentes industriales SP, mensajes PT
- **brasil-pt-2** — Francisco, gerentes industriales MG/RJ/ES/BA, mensajes PT

### Flujo
```
1. Navegar a invitaciones enviadas (linkedin.com/mynetwork/invitation-manager/sent/)
2. Para cada perfil: validar con keywords → abrir SalesNav → sendMessage → agregarListaBorrar → retirarInvitacion
```

### Keywords de clasificación
- **INVERSOR_KEYWORDS** — angel investor, venture capital, family office, seed, PE, etc.
- **BRASIL_KEYWORDS** — gerente de operaciones, plant manager, diretor industrial, etc.
- **INVERSOR_EXCLUDE / BRASIL_EXCLUDE** — recruiter, HR, student, developer, etc.

### Dashboard
El agente reporta estado en tiempo real vía `reportState(id, patch)` al servidor
en `http://localhost:3000`. Ver `dashboard-server.js`.

### Cómo correrlo
```bash
# Desde la carpeta raíz del agente
node agent-inversores.js
# El dashboard se abre automáticamente en http://localhost:3000
```

---

## Proyecto 3 — Dashboard Server

**Directorio:** `dashboard/`
**Archivos:** `dashboard-server.js` + `dashboard.html`

### API endpoints
```
GET  /              → dashboard.html
GET  /api/status    → estado de todas las automatizaciones
POST /api/control   → { id, action: "run"|"stop"|"pause" }
POST /api/update    → { id, patch } — el agente reporta aquí
POST /api/launch    → lanza agent-all.js (o con flowId específico)
GET  /api/agent-status → si el proceso del agente está corriendo
```

### Estado persistido
- `status/[id].json` — estado actual de cada automatización
- `history.json` — historial acumulado (nunca se borra)

### Automatizaciones registradas
```
outreach:    inversores-es, brasil-pt-1, brasil-pt-2
seguimiento: followup-li, multicanal, interaccion
email:       camaras-email, confirm-email, agendado
crm:         cal-confirm, crm-enrich, news-monitor
invitar:     invitar-alejandro, invitar-david, invitar-francisco  ← pendiente agregar
```

### Cómo correr el dashboard
```bash
cd dashboard
node dashboard-server.js
# Abre http://localhost:3000
```

---

## Archivos sensibles — NUNCA commitear

```
session/                        ← cookies de Playwright Alejandro
david agente invitaciones/      ← cookies de Playwright David
francisco agente invitaciones/  ← cookies de Playwright Francisco
*.json (status/, history.json)  ← datos de estado
processed-*.json                ← perfiles ya procesados
pending-email.json              ← perfiles pendientes con email
quota-invitar.json              ← cuotas diarias
*.log                           ← logs de ejecución
.env                            ← variables de entorno si se agregan
```

---

## Reglas para Claude Code

1. **Antes de cualquier cambio en invitar-agent.js** → correr `node --check invitar-agent.js`
   después de cada modificación. Reportar el resultado.

2. **Fixes en invitar-agent.js** → un fix a la vez. Syntax check entre cada uno.
   No aplicar fixes en lote.

3. **Nunca usar regex con flag `/gs`** en reemplazos de texto en los scripts —
   causó colapso del archivo (1361 → 431 líneas en marzo 2026).

4. **Para tests** → siempre correr primero el test correspondiente y esperar confirmación
   antes de aplicar el fix al agente general.

5. **Backups** → antes de modificar cualquier script principal, crear `.bak` automáticamente.

6. **Logs** → al correr cualquier agente, mostrar las últimas 20 líneas del log si existe.

7. **Email de verificación** → `augusto@globalita.io` — este es el email fijo para F6.
   No cambiar sin confirmación explícita.

---

## Comandos útiles frecuentes

```bash
# Ver cuotas de hoy
cat quota-invitar.json

# Ver pendientes de email
cat pending-email.json

# Ver últimas líneas del log
tail -50 invitar-agent.log

# Syntax check
node --check invitar-agent.js

# Correr solo una cuenta
node invitar-agent.js alejandro

# Correr dashboard
cd dashboard && node dashboard-server.js

# Ver procesos Node corriendo
tasklist | findstr node          # Windows
ps aux | grep node               # Linux/Mac
```

---

## Contexto de negocio

- Los agentes corren de noche o sin intervención
- Alejandro prospecta inversores para Sub Gerente (el SaaS)
- David y Francisco prospectan gerentes industriales de Brasil para el mismo producto
- El objetivo es conseguir feedback de usuarios reales antes del lanzamiento
- Sub Gerente es un demo en Lovable (React/TS/shadcn/Recharts/localStorage)
- FABRIPT es la entidad legal que propone partnerships con cámaras industriales
- Augusto habla ES/EN/PT — los scripts respetan esto en los mensajes

---

## Reglas de Git

**Después de cada git push, siempre correr:**
```bash
git pull
```
para asegurar que la máquina local está sincronizada con el repo.

**Flujo completo obligatorio para cualquier cambio de archivo:**
1. Editar archivo
2. `git add .`
3. `git commit -m "mensaje"`
4. `git push`
5. `git pull` ← nunca omitir este paso

**Nunca asumir que un archivo existe en la máquina local** solo porque está en el repo.
Si el usuario reporta "Cannot find module", primero correr `git pull` antes de cualquier otra acción.
