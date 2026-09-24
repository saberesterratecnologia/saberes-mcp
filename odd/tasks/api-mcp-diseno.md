# Feature: diseño de `/api-mcp`, identidad, permisos y auditoría

**Objetivo**: arreglar el bug del 401 (el CRM devuelve errores JSON desde el 21/09) y escribir
un único documento de diseño para el endpoint dedicado del MCP en el CRM (`/api-mcp`, patrón
BFF), la identidad por persona reutilizando el login del CRM sin exponer contraseñas, la matriz
rol → tools y el registro de auditoría. Roles de ejemplo: Secretaría Académica y Dirección.

**Rama**: `feat/api-mcp-diseno` (desde `feat/detalle-comision`)
**Fuera de alcance**: implementar `/api-mcp`, OAuth o auditoría; el dashboard del CRM (al final).

---

## Decisiones de Max (24/09/2026)

- No tocar `/api` ni a sus consumidores (Prometheo). El MCP tendrá **endpoints propios**.
- Reutilizar el **login del CRM**, sin que el MCP vea contraseñas. Nada de login propio.
- Los permisos por rol y la auditoría por persona son requisito, no una fase opcional.
- Nada de Grafana: el dashboard lo va a consumir el CRM, al final.

## Tareas

- [x] **T1 — 401 → `authentication_failed`** — `aeb4d2a` + corregir `DISENO-TOOLS-MCP.md` (§3 y la tabla
  de Tool 3 que dice "400 con HTML" sin haberlo medido).
- [ ] **T2 — Verificar hechos externos** antes de escribirlos: requisitos de autorización de la
  spec MCP vigente, soporte OAuth de conectores remotos en Claude Desktop y Codex, piezas de
  auth del SDK TypeScript.
- [ ] **T3 — `DISENO-API-MCP.md`**: contrato de `/api-mcp`, flujo de identidad, matriz de
  permisos, formato de auditoría, riesgos y preguntas para el CRM.
- [ ] **T4 — Propuesta v2.6**: la identidad por persona deja de estar bloqueada por la migración
  de contraseñas; producción remota con HTTPS + OAuth; referencia al documento nuevo.
- [ ] **T5 — Pasarle el diseño a green-cloud** para contrastarlo con el CRM.

## Bitácora

- **2026-09-24** — Medido contra prod: todos los errores de `/api` ya vuelven en JSON con su
  status real (401/403/400/405). El cliente solo trataba 3xx como autenticación.
