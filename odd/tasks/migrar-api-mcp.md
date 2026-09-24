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
- [ ] **T2 — Cliente de `/api-mcp`** con su contrato de errores, tests con fetch inyectado.
- [ ] **T3 — `detalle_comision` sobre `comision`**.
- [ ] **T4 — `buscar_comision` sobre `buscar_comisiones`** (tool nueva, paginada).
- [ ] **T5 — `listar_cursos` sobre `cursos_disponibles`** (espera el campo `organizacion`).
- [ ] **T6 — Borrar la capa accidental** y el cliente de `/api`; configuración nueva.
- [ ] **T7 — e2e contra producción + Claude Desktop** apuntando al token nuevo.
- [ ] **T8 — Quitarle al cliente 14 las 4 acciones de `/api`** (CRM; decisión de Max).

## Bitácora

- **2026-09-24** — `/api-mcp` en producción. e2e completo desde curl con el token del cliente
  15. Max decidió no rotar la clave de WhatsApp que quedó en el log local de green-cloud.
