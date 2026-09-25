# Feature: MVP — MCP en ChatGPT con login por rol

**Objetivo**: que el equipo use el MCP desde ChatGPT (cuenta compartida), con login OAuth contra el
CRM que identifica el **rol** de quien conecta, permisos por rol y auditoría por rol. Primero con
las tools de lectura existentes; las de escritura las define Max después.

**Rama**: `feat/mvp-chatgpt-rol` (desde `docs/decision-identidad-por-persona`)
**Decisión que lo enmarca**: `decisiones/2026-09-24-identidad-por-persona.md`
**Diseño de referencia**: `DISENO-API-MCP.md` §2 (identidad), §3 (permisos), §5 (auditoría), §6.1
(postbacks), §7 (pasos 2 a 4)
**Fuera de alcance**: identidad por persona, datos personales de estudiantes, acciones de escritura
(se agregan cuando Max las defina), dashboard.

---

## Límites no negociables

- El MCP **no se publica en internet sin login**.
- La auditoría dice "conexión autorizada por X" y se lee como identidad del rol/área.
- `/mcp-autorizar` sigue §6.1: re-chequeo de sesión dentro del handler, `id_persona` de la sesión,
  revisión de seguridad dedicada antes del deploy.
- Cada paso que toque producción lo aprueba Max en el momento.

## Tareas

- [x] **T1 — Verificar qué exige ChatGPT** de un conector MCP con OAuth (registro de cliente: DCR,
  CIMD o preregistrado; redirect URI; scopes; metadatos) y qué trae el SDK para el servidor OAuth.
- [ ] **T2 — Exposición HTTPS en el servidor**: dominio, certificado, nginx/IIS, puerto (análisis
  con el CRM; Max decide).
- [ ] **T3 — CRM (green-cloud)**: `/mcp-autorizar`, `canjear_codigo_autorizacion`,
  `resolver_acceso`, privilegios `MCP · …` para los roles 3 y 4, `X-Acting-Person` en `/api-mcp`.
- [ ] **T4 — MCP: transporte Streamable HTTP + servidor OAuth** (authorize, token, revoke,
  metadatos RFC 8414/9728, PKCE, audiencia; tokens guardados como hash).
- [ ] **T5 — MCP: permisos por rol** en `tools/list` y en cada `tools/call`.
- [ ] **T6 — MCP: auditoría local por llamada** (rol, "autorizado por", tool, parámetros, resultado).
- [ ] **T7 — Revisión de seguridad** del conjunto (CRM + MCP) antes de exponerlo.
- [ ] **T8 — Deploy del MCP en el servidor y prueba con ChatGPT**.

## Bitácora

- **2026-09-24** — Max: MVP con ChatGPT (cuenta compartida), login con el usuario del CRM de quien
  conecta, identidad por rol. Escrituras: después, con confirmación humana, reversibles, sin
  borrados, idempotentes y auditadas.
- **2026-09-24** — T1 cerrada. Fuente: `developers.openai.com/plugins/build/auth` (guía oficial de
  autenticación de MCP para ChatGPT y Codex), consultada hoy. Hallazgos:
  - **El diseño de `DISENO-API-MCP.md` §2 es compatible tal cual.** ChatGPT soporta CIMD (preferido),
    DCR y clientes predefinidos. Con CIMD usa `client_id = https://chatgpt.com/oauth/client.json`
    y `token_endpoint_auth_method` `none` (cliente público + PKCE) o `private_key_jwt`.
  - Requisitos que ya contemplábamos: metadatos RFC 9728 (`resource`, `authorization_servers`) o
    `WWW-Authenticate` en el 401; metadatos RFC 8414 con `code_challenge_methods_supported: ["S256"]`
    (sin eso ChatGPT **no soporta** el servidor); `resource` en authorize y token, a copiar como
    audiencia; `iss` en toda respuesta de autorización (RFC 9207) → redirect estable
    `https://chatgpt.com/connector_platform_oauth_redirect`.
  - **ChatGPT no soporta credenciales de máquina** (client credentials, API keys): el login de
    usuario es obligatorio. Confirma que "sin login" no es opción en ChatGPT.
  - **Defensa extra disponible:** ChatGPT presenta un certificado de cliente administrado por
    OpenAI (mTLS, SAN `mtls.prod.connectors.openai.com`) y publica sus rangos de IP de salida. El
    MCP puede aceptar **solo** tráfico de ChatGPT, además del OAuth.
  - **Profile tool recomendada:** una tool de solo lectura (`whoami`) marcada con
    `_meta["openai/profile"]: true`, con un id opaco y estable de la cuenta conectada. Sirve para
    mostrar quién autorizó la conexión. **Multi-cuenta:** ChatGPT permite conectar varias cuentas al
    mismo conector y **el modelo elige** cuál usar en cada llamada; no es identidad por persona.
  - **SDK:** la guía de OpenAI remite a la spec MCP **2025-11-25**, la que implementa el SDK
    instalado (1.30.0). No hace falta pasar a las betas de 2026-07-28 para el MVP.
  - ⚠️ OpenAI **recomienda fuertemente** usar un proveedor de identidad establecido en lugar de
    implementar el servidor de autorización desde cero. Acá no aplica tal cual: la identidad sale
    del login del CRM y la contraseña solo la ve el CRM. Mitigación: usar las piezas de auth del SDK
    oficial, el alcance mínimo (código + PKCE + refresh) y la revisión de seguridad de T7.
