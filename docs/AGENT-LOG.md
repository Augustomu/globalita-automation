# AGENT-LOG — Errores y soluciones acumuladas
## linkedin-agent / agent-all.js + dashboard

---

## ARQUITECTURA ACTUAL

- `agent-all.js` — 3 flujos secuenciales en TEST_MODE, paralelos en producción
- `dashboard-server.js` — servidor Express puro puerto 3000, sirve `dashboard.html`
- `dashboard.html` — panel de control con popups, historial, créditos
- `history.json` — persistencia permanente (nunca borrar)
- `processed-*.json` — URLs procesadas por cuenta (se pueden borrar para retry)
- `cache-urls-*.json` — cache de invitaciones (TTL 12h)
- `status/` — estado activo por flujo (se puede borrar, history.json lo recupera)

---

## FLUJO DEFINITIVO

```
1. Cargar invitaciones con scroll completo
2. Para cada perfil:
   a. Detectar si ya enviamos mensaje (badge LinkedIn + sentLog normalizado)
   b. Si ya enviado → LISTA PARA BORRAR → retirar invitación
   c. Si no enviado → validar keywords → enviar mensaje InMail
   d. Si sendMessage falla → asumir ya enviado → retirar directo
   e. Retirar invitación desde página separada (invitaciones enviadas)
3. Guardar sesión en history.json
```

---

## ERRORES DOCUMENTADOS Y SOLUCIONES

### 1. bringToFront: Target page closed
**Causa**: profilePage pierde estado cuando Sales Navigator abre.  
**Solución**: `profilePage.goto(profileUrl)` — recargar el perfil antes del retiro.

### 2. Mensaje duplicado por URL con sufijo de idioma
**Causa**: `/orozcoeduardo/es/` ≠ `/orozcoeduardo/` en comparación de strings.  
**Solución**: `normalizeUrl()` quita `/es/`, `/en/`, `/pt/`, query params antes de comparar.

### 3. LISTA PARA BORRAR se deseleccionaba
**Causa**: click en lista es toggle — si ya estaba, lo sacaba.  
**Solución**: Eliminada del flujo de "ya enviado". Solo se usa cuando se envía mensaje nuevo.

### 4. retirarInvitacion no encontraba "Pendiente"
**Causa**: El menú dropdown requería scroll interno, difícil de detectar.  
**Solución**: Estrategia 1 = abrir página de invitaciones enviadas en página separada y clickear "Retirar" directo. Estrategia 2 = fallback con menú Más → Pendiente.

### 5. Francisco crasheaba al abrir invPage
**Causa**: `mainPage.context().newPage()` compartía contexto entre flujos.  
**Solución**: `profilePage.context().newPage()` — cada flujo usa su propio contexto.

### 6. popups del dashboard se cerraban solos cada 2.5s
**Causa**: `render()` reconstruía el HTML de popups cada ciclo.  
**Solución**: Si hay popups abiertos (`openPopIds.length > 0`), no reconstruir — solo restaurar.

### 7. SyntaxError en dashboard: template literals anidados
**Causa**: JS del cliente estaba dentro de template literal del servidor — escaping imposible.  
**Solución**: HTML separado en `dashboard.html`, JS puro sin anidación.

### 8. 0/0 perfiles procesados
**Causa**: `processed-*.json` tiene todas las URLs de sesiones anteriores.  
**Solución**: Borrar los 3 processed antes de cada sesión de retry.

### 9. Sales Navigator detecta mensaje ya enviado como "Esperando respuesta de X"
**Causa**: No hay badge "Mensaje enviado" — el indicador es el hilo activo.  
**Solución**: Detectar texto "Esperando respuesta", "Waiting for response", "Aguardando resposta" en el cuerpo de Sales Nav.

### 10. Créditos InMail no se leían
**Causa**: La URL `/sales/settings/` no tiene contador visible.  
**Solución**: Leer desde el modal de InMail abierto — texto "Usar 1 de X créditos disponibles" / "Use 1 of X InMail credits".

### 11. Banner de pago interrumpe sesión
**Causa**: LinkedIn muestra banner rojo de pago que interfiere con clics.  
**Solución**: `cerrarBanners()` se llama en cada carga de página con selectores específicos incluyendo `.global-alert-banner__dismiss`.

### 12. keyboard.type() cierra la página
**Causa**: Playwright keyboard en Sales Nav dispara eventos que cierran el modal.  
**Solución**: `execCommand('insertText')` vía `page.evaluate()`.

### 13. Alejandro — nombre aparece como `{:badgeType}`
**Causa**: LinkedIn devuelve template sin resolver en el texto del perfil.  
**Solución**: Bug de LinkedIn, no afecta el flujo — el nombre se toma de `.text-heading-xlarge`.

### 14. Retiro de invitación desde página de invitaciones
**Flujo actual**:
1. `profilePage.context().newPage()` → abrir `/mynetwork/invitation-manager/sent/`
2. Buscar el perfil por slug de URL
3. Click en botón "Retirar" del contenedor del perfil
4. Confirmar si aparece modal
5. Cerrar la página auxiliar

### 15. Alejandro — dejar de seguir perfiles que no cumplen keywords
**Solución**: Si `flow.id === "inversores-es"` y `!val.valido`, llama `dejarDeSeguir()` que busca botón "Siguiendo" y confirma.

---

## CONFIGURACIÓN ACTUAL

```js
TEST_MODE = true        // 1 perfil por flujo, secuencial
// false = todos los perfiles, paralelo

FLOWS:
- inversores-es  → Alejandro  → ES/EN según ubicación (MX → ES, US/UK → EN)
- brasil-pt-1    → David      → PT siempre
- brasil-pt-2    → Francisco  → PT siempre

REGIONES:
- Alejandro: MX · US
- David: SP
- Francisco: MG · RJ · ES · BA
```

---

## PENDIENTE

1. Verificar retiro desde invitaciones — `invPage` busca por slug URL
2. Francisco — banner de pago puede interrumpir (actualizar forma de pago)
3. Activar TEST_MODE=false cuando retiro funcione en los 3
4. Limpieza bulk de "LISTA PARA BORRAR" en Sales Navigator
5. Dashboard: botón Iniciar desde browser funcional ✅
