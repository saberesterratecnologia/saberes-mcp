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
- [x] **T2 — Verificar hechos externos** antes de escribirlos: requisitos de autorización de la
  spec MCP vigente, soporte OAuth de conectores remotos en Claude Desktop y Codex, piezas de
  auth del SDK TypeScript.
- [x] **T3 — `DISENO-API-MCP.md`** — `b0a71c2`: contrato de `/api-mcp`, flujo de identidad, matriz de
  permisos, formato de auditoría, riesgos y preguntas para el CRM.
- [x] **T4 — Propuesta v2.6** — `cc07121`: la identidad por persona deja de estar bloqueada por la migración
  de contraseñas; producción remota con HTTPS + OAuth; referencia al documento nuevo.
- [x] **T5 — Pasarle el diseño a green-cloud** (enviado 24/09; respuesta pendiente) para contrastarlo con el CRM.

## Bitácora

- **2026-09-24** — Medido contra prod: todos los errores de `/api` ya vuelven en JSON con su
  status real (401/403/400/405). El cliente solo trataba 3xx como autenticación.
- **2026-09-24** — T1 `aeb4d2a` (revisión `review-012d3a2bd532d088` aprobada). T2: spec vigente
  2026-07-28 (se aleja de DCR hacia CIMD, valida `iss`); Claude y Codex soportan OAuth con CIMD;
  el SDK instalado 1.30.0 implementa 2025-11-25 y hay betas para 2026-07-28. T3 `b0a71c2`.
  T4 delegado a gentle-ai-worker, verificado por lectura. Pendiente para green-cloud: el
  nombre real de la tabla (`SERVICIO_API` vs `SERVICIOS_API`, los documentos usan los dos).
- **2026-09-24** — T3+T4 revisión nativa `review-58c409643fb1646c` (solo docs, riesgo bajo) aprobada. T5: diseño enviado a green-cloud (01a0d470) por intercom: preguntas §8, choques con el CRM, nombre real de la tabla de clientes, estimación de los pasos 1 y 2.
- **2026-09-24** — Contraste de green-cloud recibido (`contraste-diseno-api-mcp.md` en su worktree). `DISENO-API-MCP.md` → v0.2: `id_rol` compartido con Estudiante/Profesor (lista blanca de roles), vigencia por estado y no por fecha, sin reglas por organización, §6.1 defecto de postbacks en `/mcp-autorizar`, `resolver_acceso` revisa `activado`/`borrada`, allowlist de texto libre, estimación (paso 1: 2-3 sesiones; paso 2: 3-4 + revisión de seguridad). Tres decisiones abiertas para Max (D1 flags de montos, D2 alcance por organización, D3 unificar "disponible"). PROPUESTA alineada con D3.
- **2026-09-24** — Max decidió D1 (respetar `mostrar_valor_*`), D2 (sin acotar por organización) y D3 (unificar "disponible" aparte). Propuso reutilizar `PRIVILEGIOS`: verificado en el repo del CRM (solo lectura) que `Evaluar_Privilegio` (`usuariosAccesoDatos.vb:1151`) no tiene atajo para sysadmin y no mira `PRIVILEGIOS.activado`. `MCP_ALCANCE_ROL` reemplazada por privilegios sueltos `MCP · …`, resueltos por nombre, solo de roles en lista blanca, respetando `activado`. DISENO v0.3.
