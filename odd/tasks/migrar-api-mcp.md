# Feature: migrar el MCP a `/api-mcp`

**Objetivo**: que las tools dejen `/api` y usen `/api-mcp`, el endpoint propio que el CRM
deployó el 24/09/2026, borrar la traducción que solo compensaba los defectos de `/api`, y
sumar `buscar_comision`.

**Rama**: `feat/migrar-api-mcp` (desde `main`)
**Fuera de alcance**: identidad por persona, permisos y auditoría (pasos 2 a 4 de
`DISENO-API-MCP.md` §7), transporte HTTP, `estado_de_persona`.

---

## Contexto congelado (medido contra producción el 2026-09-24)

- `/api-mcp` en producción (CRM `main` = `bb5f6158`, SHA desplegado `4a4b1c36`).
- Cliente 15 `mcp-api-mcp`, con token en `~/.saberes-deploy/mcp-api-mcp.token` (fuera del
  repo; se usa solo por sustitución de shell). Acciones: `cursos_disponibles`, `comision`,
  `buscar_comisiones`.
- Contrato: `documentacion/api/api-mcp-endpoint.md` en el repo del CRM. Éxito `{data}` o
  `{data, page}`; error `{error:{code,message}}` con status real (401, 403, 400, 404, 405, 500).
- e2e OK: 404 real, `null` en vez de `"S/D"`, ISO, números, `es_virtual`, `estado`,
  `disponible`, búsqueda sin tildes, cursor, `limit` ≤ 20, montos ocultos por D1 ausentes.
- **Decisión de Max:** el agente ve **las cuatro organizaciones** (Fundación Educativa
  Saberes, Terra, Recibidores de Granos de Uruguay y de Paraguay) y siempre dice de cuál es
  cada curso y comisión.
- `cursos_disponibles` todavía no trae la organización: pedido a green-cloud (aditivo).
- La casing de origen es despareja (Title Case y algunos en MAYÚSCULAS): normalizar para
  mostrar sigue siendo trabajo del MCP.

## Tareas

- [x] **T1 — Documentar** — `dab38e1` el alcance de cuatro organizaciones y el contrato medido de
  `/api-mcp` en `DISENO-API-MCP.md`.
- [x] **T2 — Cliente de `/api-mcp`** — `c2c3ea7` con su contrato de errores, tests con fetch inyectado.
- [x] **T3 — `detalle_comision` sobre `comision`** — `a539b87`.
- [x] **T4 — `buscar_comision` sobre `buscar_comisiones`** — `a539b87` (tool nueva, paginada).
- [x] **T5 — `listar_cursos` sobre `cursos_disponibles`** — `a539b87` (espera el campo `organizacion`).
- [x] **T6 — Borrar la capa accidental** — `b95eeec` y el cliente de `/api`; configuración nueva.
- [ ] **T7 — e2e contra producción + Claude Desktop** apuntando al token nuevo.
- [ ] **T8 — Quitarle al cliente 14 las 4 acciones de `/api`** (CRM; decisión de Max).

## Bitácora

- **2026-09-24** — `/api-mcp` en producción. e2e completo desde curl con el token del cliente
  15. Max decidió no rotar la clave de WhatsApp que quedó en el log local de green-cloud.
- **2026-09-24** — T2 `c2c3ea7`: cliente con validación zod (`contract_changed`), 69 tests. Probado contra prod: 28 cursos **ya con `organizacion`** (green-cloud lo deployó), 404 → null, paginación por cursor, token falso → 401.
- **2026-09-24** — T3–T5 en un solo commit `a539b87` a propósito: mover las tres tools de backend es
  atómico, así ningún commit deja al servidor con dos clientes. 97 tests. e2e con cliente MCP
  por stdio contra prod: 3 tools, 4 organizaciones, las tres "Apicultura" distinguibles, detalle
  limpio, "no existe" explícito, cero `S/D`/`bot_contexto`/WhatsApp.
- **2026-09-24** — 🔴 **Bloquea T7:** `/api-mcp` devuelve `moneda: "ARS"` fijo, y los montos de
  Uruguay (2691: cuota 690) y Paraguay (2694: inscripción 140000) no son pesos argentinos. El
  agente afirmaría precios falsos. Pedido al CRM: moneda según el país de la organización, o
  `null` si no se puede determinar. No se conecta a Claude Desktop hasta que esté corregido.
- **2026-09-24** — T6 `b95eeec`: cliente de `/api` y helpers de `S/D`/fechas/números borrados; `moneda` puede ser `null` (el tool no afirma moneda y avisa). 73 tests. e2e stdio contra prod OK.
- **2026-09-24** — Revisión `review-2af87f1dc4c9fd07` del tramo T2–T6: pidió **una corrección**
  (`R3-timeout-body`, CRITICAL: el timeout se cancelaba antes de leer el cuerpo y un servidor
  trabado colgaba la tool para siempre). Corregido en `3c36e59` (65 líneas, plan 70), validación
  dirigida aprobada, acknowledged. Dos advertencias no bloqueantes: paginación de cursos (resuelta
  en `3d1511c`) y `R3-search-state-filter` (`buscar_comision` no filtra por estado: decisión de Max).
- **2026-09-24** — Bloqueo de moneda resuelto por el CRM (deploy `9a037c1e`): país por sede,
  `moneda` null (el CRM no guarda ISO 4217), `moneda_nombre`/`moneda_simbolo`. `3d1511c`: la tool
  muestra `pais` y `moneda_nombre`. e2e prod: Paraguay guaraníes, Uruguay pesos uruguayos,
  Argentina pesos. 86 tests. **T7 desbloqueada.**
- **2026-09-24** — Hallazgo del CRM fuera de alcance: `/api` (SP de Prometheo) formatea los montos
  de las 14 comisiones de Uruguay y Paraguay con "$", como si fueran pesos. Afecta al bot hoy.
