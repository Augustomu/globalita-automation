# AGENT-LOG v2 — LinkedIn Outreach Automation
## Sesión: 23 Mar 2026 — Resumen completo de errores y soluciones

---

## ARQUITECTURA

```
linkedin-agent/
├── agent-all.js          ← agente principal
├── dashboard-server.js   ← servidor HTTP puerto 3000
├── dashboard.html        ← panel de control
├── history.json          ← historial permanente (NUNCA borrar)
├── processed-*.json      ← URLs procesadas por cuenta (borrar para retry)
├── cache-urls-*.json     ← cache de invitaciones (TTL 12h)
├── status/               ← estado activo (se puede borrar)
├── test-retirar.js       ← test unitario de retiro
├── test-detectar-mensaje.js ← test unitario detección duplicados
├── test-lista.js         ← test unitario lista para borrar
└── cleanup.js            ← script de limpieza independiente
```

**Sesiones:**
- Alejandro → `session/`
- David → `david agente invitaciones/`
- Francisco → `francisco agente invitaciones/`

---

## FLUJO ACTUAL

```
1. Cargar URLs de invitaciones enviadas (scroll completo)
2. Para cada perfil:
   a. Abrir perfil LinkedIn
   b. Detectar si ya se envió mensaje (badge + sentLog normalizado)
   c. Si ya enviado → retirar invitación directo
   d. Si no enviado → validar keywords → enviar InMail en Sales Nav
   e. Si sendMessage falla → retirar igual (fallback)
   f. Retirar invitación desde /mynetwork/invitation-manager/sent/
3. Guardar en history.json
```

---

## CUENTAS Y CONFIGURACIÓN

```
TEST_MODE = true  → 1 perfil por flujo, secuencial
TEST_MODE = false → todos los perfiles, paralelo (Promise.all)

Alejandro → inversores-es → ES (MX) / EN (US) → Regiones: MX · US
David     → brasil-pt-1  → PT siempre → Regiones: SP
Francisco → brasil-pt-2  → PT siempre → Regiones: MG · RJ · ES · BA
```

---

## ESTADO ACTUAL DE FUNCIONES

| Función | Estado | Notas |
|---|---|---|
| Enviar InMail | ✅ Funciona | execCommand para evitar cierre de página |
| Leer créditos | ✅ Funciona | Lee desde modal InMail abierto |
| Scroll invitaciones | ✅ Funciona | Con cache 12h |
| Retirar invitación | ✅ RESUELTO HOY | Desde /invitation-manager/sent/ |
| Detectar msg duplicado | ⚠️ Pendiente test | test-detectar-mensaje.js listo |
| LISTA PARA BORRAR | ⚠️ Toggle bug | No implementar verificación por ahora |
| Dejar de seguir (Alejandro) | ✅ Funciona | Solo para perfiles que no cumplen keywords |

---

## ERRORES DOCUMENTADOS — NO REPETIR

### ❌ ERROR 1: bringToFront después de cerrar Sales Nav
**Síntoma:** `page.bringToFront: Target page, context or browser has been closed`
**Causa:** Sales Nav cierra el contexto al navegar
**Lo que NO funciona:** `await salesPage.close(); await profilePage.bringToFront();`
**Solución:** No usar bringToFront después de cerrar otra página

---

### ❌ ERROR 2: profilePage.goto() antes de retirar
**Síntoma:** El retiro falla silenciosamente, 0 invitaciones retiradas
**Causa:** Recargar la página borra el estado de navegación
**Lo que NO funciona:** `await profilePage.goto(profileUrl, ...); await retirarInvitacion(profilePage);`
**Solución:** No recargar el perfil antes del retiro

---

### ❌ ERROR 3: invPage desde mainPage.context()
**Síntoma:** `page.evaluate: Target page, context or browser has been closed` en navigateToSentInvitations línea 467
**Causa:** Compartir el contexto entre flujos corrompe las sesiones de Francisco/David
**Lo que NO funciona:** `invPage = await mainPage.context().newPage()`
**Solución:** Usar `profilePage.context().newPage()` O abrir directamente desde el flujo del perfil

---

### ❌ ERROR 4: invPage nueva navegando a /invitation-manager/sent/ (primera versión)
**Síntoma:** Francisco y David crashean, sesión se cierra
**Causa:** Abrir página nueva + navegar interrumpe el contexto del flujo activo
**Lo que NO funciona:** Abrir invPage dentro del loop principal del flujo
**Solución FINAL:** Ir a /invitation-manager/sent/ desde `retirarInvitacion()` con su propia invPage — funciona porque es una función separada, no dentro del loop principal

---

### ❌ ERROR 5: Buscar "Pendiente" con evaluate() en toda la página
**Síntoma:** Clickea "Pendiente" de otro elemento (no el del menú dropdown)
**Causa:** `document.querySelectorAll("*")` encuentra "Pendiente" en sidebar, notificaciones, etc.
**Lo que NO funciona:** 
```js
const el = [...document.querySelectorAll("*")].find(e =>
  ["Pendiente"].includes(e.innerText?.trim()) && e.offsetParent !== null
);
```
**Problema adicional:** El menú se cierra antes de que evaluate() corra

---

### ❌ ERROR 6: Playwright locator con role="listitem/menuitem" para Pendiente
**Síntoma:** `locator.waitFor: Timeout 4000ms exceeded`
**Causa:** LinkedIn no usa `role="listitem"` ni `role="menuitem"` en su dropdown custom
**Lo que NO funciona:**
```js
page.locator('[role="listitem"]:has-text("Pendiente")').first()
```
**Lección:** LinkedIn usa divs custom sin roles ARIA estándar

---

### ❌ ERROR 7: Buscar botón Retirar del modal con offsetParent !== null
**Síntoma:** Modal aparece visualmente pero el script no encuentra el botón
**Causa:** Botones dentro de modals/dialogs de artdeco no tienen offsetParent
**Lo que NO funciona:**
```js
const btn = [...document.querySelectorAll("button")].find(b =>
  b.innerText?.trim() === "Retirar" && b.offsetParent !== null
);
```
**Solución:** Usar `waitForSelector("button:has-text('Retirar')")` sin filtro offsetParent

---

### ❌ ERROR 8: LISTA PARA BORRAR toggle involuntario
**Síntoma:** El agente agrega el perfil a la lista y en la siguiente sesión lo saca
**Causa:** Click en lista es toggle — si ya estaba seleccionada, la deselecciona
**Lo que NO funciona:** Verificar con `innerHTML.includes("check")` — los checks son SVG
**Lo que NO funciona:** Verificar con `aria-selected` — LinkedIn no lo implementa
**Decisión:** No intentar agregar a lista para perfiles que ya recibieron mensaje. Solo agregar cuando el mensaje se envía en esa misma sesión.

---

### ❌ ERROR 9: Detección de mensaje duplicado por URL exacta
**Síntoma:** Eduardo O. recibió mensaje dos veces
**Causa:** URL guardada era `/orozcoeduardo/es/` pero la URL procesada era `/orozcoeduardo/`
**Lo que NO funciona:** Comparación directa de strings `p.url === profileUrl`
**Solución:** `normalizeUrl()` que quita `/es/`, `/en/`, `/pt/`, query params antes de comparar

---

### ❌ ERROR 10: Detectar "Esperando respuesta" sin waitForLoadState
**Síntoma:** David no detectaba el mensaje ya enviado aunque aparecía en pantalla
**Causa:** Sales Nav carga el hilo de forma asíncrona — el texto no está al cargar la página
**Lo que NO funciona:** Leer `document.body.innerText` inmediatamente después de goto()
**Solución:** `await salesPage.waitForLoadState("networkidle")` + `await wait(3000)` antes de leer

---

### ❌ ERROR 11: keyboard.type() en Sales Nav
**Síntoma:** La página se cierra al escribir
**Causa:** Playwright keyboard dispara eventos que Sales Nav interpreta como atajos
**Lo que NO funciona:** `await page.keyboard.type(texto)`
**Solución:** `await page.evaluate((txt) => document.execCommand('insertText', false, txt), texto)`

---

### ❌ ERROR 12: Processed.json se actualizaba al inicio del perfil
**Síntoma:** Si el flujo fallaba a mitad, la próxima ejecución saltaba ese perfil sin completarlo
**Causa:** `processed.add(profileUrl)` se llamaba antes de completar el flujo
**Solución:** Mover `processed.add()` al final, después de retiro exitoso

---

### ❌ ERROR 13: David re-enviaba mensaje a João Batista en cada sesión
**Síntoma:** João recibió 2+ mensajes idénticos
**Causa combinada:** 
  1. processed.json fue borrado → URL no estaba guardada
  2. normalizeUrl no estaba implementado
  3. waitForLoadState no esperaba el hilo → no detectaba "Esperando respuesta"
**Solución:** Los 3 fixes anteriores combinados

---

## LO QUE FUNCIONA HOY ✅

1. **Envío de InMail** — funciona en las 3 cuentas
2. **Leer créditos** — desde el modal de InMail
3. **Retiro de invitación** — desde `/invitation-manager/sent/` con botón "Retirar" directo
4. **normalizeUrl** — URLs con /es/, /en/ se normalizan antes de comparar
5. **Dashboard** — cards, popups, historial, créditos, errores
6. **history.json** — persiste entre sesiones aunque se borre status/

---

## PENDIENTE ⚠️

1. **Detección de mensaje duplicado** — test-detectar-mensaje.js listo, pendiente validación con David+João
2. **Francisco** — banner de pago rojo puede interrumpir (actualizar forma de pago)
3. **TEST_MODE=false** — activar cuando todo funcione en test
4. **Limpieza LISTA PARA BORRAR** — manual o con cleanup.js

---

## COMANDOS

```
# Iniciar dashboard
cd C:\Users\augus\Downloads\linkedin-agent
node dashboard-server.js

# Correr agente (nueva terminal)
node agent-all.js

# Tests unitarios
node test-retirar.js alejandro https://www.linkedin.com/in/SLUG/
node test-detectar-mensaje.js david https://www.linkedin.com/in/joaobfjr/
node test-lista.js david https://www.linkedin.com/in/joaobfjr/

# Resetear procesados
del processed-alejandro.json
del processed-david.json
del processed-francisco.json
```

---

## REGLA DE ORO
**Nunca tocar `retirarInvitacion()` para "mejorarla" sin antes correr `test-retirar.js`.**
**El retiro ahora funciona — cualquier cambio debe probarse en test antes de integrar al agente.**
