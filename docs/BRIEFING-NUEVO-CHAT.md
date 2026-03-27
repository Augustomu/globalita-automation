# BRIEFING — Continuación de sesión de trabajo
## Para pegar al inicio del próximo chat con Claude

---

## QUIÉN SOY

Me llamo Augusto (八月). Trabajo en productos de tecnología industrial. Estoy construyendo un sistema de automatización de outreach en LinkedIn para un producto de IA llamado **FABRIPT** (copilot para ejecutivos industriales) y una demo SaaS llamada **Sub Gerente**.

Trabajo en español, inglés y portugués.

---

## QUÉ ESTAMOS CONSTRUYENDO

Un sistema de automatización de outreach en LinkedIn con Playwright + Node.js corriendo en Windows local. El objetivo es enviar mensajes de Sales Navigator a perfiles objetivo desde 3 cuentas en paralelo.

### Las 3 cuentas

| Cuenta | Carpeta sesión | ID dashboard | Objetivo |
|---|---|---|---|
| Alejandro | `session/` | inversores-es | Inversores: Family office, VC, Angel |
| David | `david agente invitaciones/` | brasil-pt-1 | Gerentes industriales no TI, Brasil |
| Francisco | `francisco agente invitaciones/` | brasil-pt-2 | Gerentes industriales no TI, Brasil |

---

## ENTORNO TÉCNICO

- Windows, Node.js v24.14.0, CMD (NO PowerShell)
- Playwright para automatización de browser
- Chromium con sesiones persistentes (`launchPersistentContext`)
- Archivos en: `C:\Users\augus\Downloads\linkedin-agent\`
- Dashboard local: `http://localhost:3000` (Express puro, sin dependencias)

---

## ARCHIVOS CLAVE

```
linkedin-agent/
├── agent-all.js                     ← Script principal — 3 flujos en paralelo
├── dashboard-server.js              ← Panel de control
├── AGENT-LOG.md                     ← Log técnico completo con errores y estructura
├── session/                         ← Sesión Alejandro
├── david agente invitaciones/       ← Sesión David
├── francisco agente invitaciones/   ← Sesión Francisco
├── processed-alejandro.json         ← URLs ya procesadas
├── processed-david.json
├── processed-francisco.json
└── status/                          ← Estado de cada flujo (JSON)
```

---

## FLUJO DEFINITIVO (ORDEN IMPORTANTE)

```
1. Cargar invitaciones enviadas con scroll completo
2. Para cada perfil:
   a. Abrir perfil LinkedIn
   b. Extraer texto + ubicación
   c. Validar por keywords (exclusiones solo en headline)
   d. Si válido:
      1. Abrir Sales Navigator (botón "Ver en Sales Navigator")
      2. Enviar mensaje InMail (asunto + cuerpo)
      3. Agregar a "LISTA PARA BORRAR" (botón Guardado → lista)
      4. Retirar invitación  ← SIEMPRE ÚLTIMO
```

---

## MENSAJES

### Alejandro — ES (default)
```
¡Hola! ¿Cómo estás?
Estuve viendo tu perfil y quedé genuinamente impresionado...
[mensaje completo en agent-all.js]
```

### Alejandro — EN (si ubicación es USA/Canadá/UK)
```
Hi! How are you?
I came across your profile and was genuinely impressed...
```

### David y Francisco — PT (siempre)
```
Olá! Como você está?
Estive olhando seu perfil e fiquei genuinamente impressionado...
```

---

## ESTADO ACTUAL DEL SCRIPT

- `TEST_MODE = true` — procesa 1 perfil por flujo (cambiar a `false` para correr completo)
- Los 3 flujos corren en paralelo con `Promise.all()`
- Delays humanos de 4-8 segundos entre perfiles
- URLs procesadas se guardan en JSON para no repetir

---

## LO QUE FUNCIONA ✅

- Carga de invitaciones con scroll
- Validación por keywords (exclusiones solo en headline)
- Detección de idioma por ubicación (US→EN, resto→ES)
- Apertura de Sales Navigator desde perfil
- Modal de mensaje: asunto + cuerpo con execCommand
- Envío del mensaje
- Agregar a "LISTA PARA BORRAR" (click en Guardado → lista)
- Retirar invitación (Más → Pendiente con scroll → Retirar)
- Dashboard con estado en tiempo real
- Persistencia de sesión entre ejecuciones
- processed.json para evitar duplicados

---

## LO QUE NO FUNCIONA / WORKAROUNDS

### "Quitar" de lista guardados — NUNCA RESUELTO
- El botón "Quitar" está al fondo del menú `...` de Sales Navigator
- Se puede encontrar con scroll pero el clic JS es ignorado por Ember.js (framework de Sales Nav)
- **Workaround adoptado:** Agregar a "LISTA PARA BORRAR" en vez de quitar — luego se borra en bulk desde esa lista

### Pendiente está dentro del menú "Más"
- No es un botón standalone — hay que abrir "Más" → hacer scroll en el dropdown → click en Pendiente

---

## ERRORES TÉCNICOS DOCUMENTADOS

1. `keyboard.type()` cierra la página → usar `execCommand('insertText')`
2. Selectores CSS de LinkedIn se rompen → usar `:has-text()` en vez de clases
3. `Element is not visible` → usar `{ force: true }` o `scrollIntoViewIfNeeded()`
4. Loop en mismo perfil → guardar en `processed.json` persistente
5. Sales Nav abre el home → filtrar links que contengan `/people/` o `/lead/`
6. `allBtns3 is not iterable` → usar `page.$$()` no `evaluateHandle`
7. `await is only valid in async` → verificar siempre con `node --check`
8. Timeout 30s en locator → usar `page.$()` sin timeout
9. "Quitar" se clickea pero no ejecuta → ver workaround arriba
10. CDP `ECONNREFUSED` → usar Playwright Persistent Context en vez de CDP
11. PowerShell bloquea npm → usar CMD siempre

---

## DASHBOARD — 10 AUTOMATIZACIONES MAPEADAS

### Activas
1. **Inversores ES/EN** (Alejandro) — corriendo
2. **Brasil PT #1** (David) — corriendo
3. **Brasil PT #2** (Francisco) — corriendo

### En espera (LinkedIn)
4. Follow-up sin respuesta — X días sin respuesta → mensaje automático
5. Secuencia multicanal — 6 mensajes sin respuesta → email + LinkedIn
6. Interacción en publicaciones — like + comentario neutro

### Planificadas (Email)
7. Prospección cámaras empresariales — Globalita
8. Confirmación de reuniones — lead activo sin confirmar
9. Agendado automático — intención de reunión en correo → crear evento

### Planificadas (CRM / Inteligencia)
10. Confirmación desde calendario — eventos amarillos → mensaje
11. Enriquecimiento reuniones → CRM — LinkedIn → rol + industria + región → CRM
12. Monitor de noticias — empresas objetivo → alertas comerciales

---

## PENDIENTE INMEDIATO

1. **Testear agent-all.js** con TEST_MODE=true — verificar los 3 flujos
2. **Activar scroll completo** — TEST_MODE=false
3. **Automatización de limpieza** — vaciar "LISTA PARA BORRAR" en bulk
4. **Dashboard Opción A** — botón Iniciar desde browser sin terminal

---

## PARA CONTINUAR

Pedirle a Claude que lea el archivo `AGENT-LOG.md` que está en la carpeta del proyecto — tiene la documentación técnica completa de LinkedIn y Sales Navigator, todos los errores con soluciones, y la estructura del código.

Comandos para arrancar:
```
# Terminal 1 — Dashboard
cd C:\Users\augus\Downloads\linkedin-agent
node dashboard-server.js

# Terminal 2 — Agente
cd C:\Users\augus\Downloads\linkedin-agent
node agent-all.js
```
