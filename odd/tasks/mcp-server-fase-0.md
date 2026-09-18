# Feature: MCP Server — Spike de Fase 0

**Objetivo**: validar de punta a punta que un MCP Server puede exponer la API RPC de
Saberes a un agente conversacional, usando la tool más simple (`listar_cursos`) y el
cliente `mcp-secretaria-academica` (id 14) ya dado de alta en producción.

**Runtime**: TypeScript / Node 24.18
**Alcance elegido**: flujo completo, incluyendo instalar Claude Desktop y registrar el conector.
**Repo**: `saberes-mcp` (privado, cuenta propia de Max) — pendiente de creación por Max.

---

## Contexto congelado (verificado contra producción el 2026-09-18)

- Endpoint: `POST https://saberes.com.ar/api`
- Header: `X-Api-Token` (literal)
- Body: `{"action":"recuperar_cursos_disponibles"}` — el campo es **`action`**, en inglés.
- Token: `C:\Users\Maxi\.saberes-deploy\mcp-secretaria-academica.token` (fuera del repo, 43 bytes)
- Respuesta feliz: `{"result":"ok","message":"","data":[{id_curso, Curso, Organizacion}]}`
  con esa capitalización mixta literal y los valores en MAYÚSCULAS.
- Devuelve las **dos** organizaciones (`INSTITUTO TERRA`, `FUNDACIÓN SABERES`).

### Reglas no negociables del cliente HTTP

1. **Rutear por status code, nunca por el body.** Solo el 200 devuelve JSON.
2. **No seguir redirects.** El 302 es fallo de auth; si se sigue, termina en 200 + HTML
   del login y *parece éxito*. Es el peor de los mundos.
3. Mapeo: 302 = auth fallida · 403 = acción fuera de la lista blanca · 400 = request mal
   armado · 405 = no fue POST · 500 = error interno (queda en tabla EXCEPCIONES del CRM).
4. No confiar en `Content-Type` para decidir.

---

## Tareas

- [x] **T1 — Scaffolding del repo** — commit `8d8e4e3` (main)
  `git init`, `package.json`, `tsconfig.json`, `.gitignore`, SDK oficial de MCP.
  Remoto: `github.com/saberesterratecnologia/saberes-mcp` (privado, sin pushear aún).
  `.env.example` quedó afuera (la herramienta de escritura bloquea esa ruta); las dos
  variables están documentadas en el README.

- [x] **T2 — Cliente HTTP de la API Saberes** — commit `cdb2140` (rama `feat/listar-cursos`)
  `src/saberes-client.ts` + 9 tests con fetch inyectado, todos en verde.
  Verificado contra producción: 14 cursos de las dos organizaciones,
  `403 → action_not_allowed`, token inválido `→ 302 → authentication_failed`.

- [ ] **T3 — Tool `listar_cursos`**
  Capa anticorrupción: traduce el RPC a una respuesta conversacional. Mapea la
  capitalización mixta (`id_curso` / `Curso` / `Organizacion`) a nombres limpios.
  Cierre: servidor stdio levanta y responde `tools/list` y `tools/call`.

- [x] **T4 — Instalar Claude Desktop y registrar el conector** — validado 18/09 21:01
  El agente respondió con los 14 cursos agrupados por organización.
  ⚠️ Claude Desktop instalado por **MSIX (Microsoft Store)**: el config real vive en
  `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude\`, no en `%APPDATA%\Claude`.
  Los logs sí quedan en `%LOCALAPPDATA%\Claude\logs\`.

- [x] **T5 — Actualizar los documentos de diseño**
  `DISENO-TOOLS-MCP.md` v1.0 → **v1.1** y `PROPUESTA-AGENTES-IA.md` v2.3 → **v2.4**.
  Decisión de Max: **no** documentar el renombre del cliente del bot.

---

## Resultado

**Fase 0 cerrada el 18/09/2026.** Los cinco supuestos quedaron validados contra producción:
autenticación por token, lista blanca efectivamente acotada, registro del conector, flujo MCP
completo y traducción a lenguaje natural. Lo que queda de Fase 1 es repetir el patrón para las
otras tres tools y montar la infraestructura.

## Bitácora

- **2026-09-18** — T1 y T2 cerrados. El `git init` rompió el registro de worktree de los
  subagentes (la sesión arrancó cuando el directorio no era repo), así que T2 se
  implementó inline en vez de delegarse a un writer.
- **2026-09-18** — Cliente `mcp-secretaria-academica` dado de alta en prod (`id_servicio_api = 14`),
  token generado y verificado. Smoke test: 200 en la acción permitida, 403 en las prohibidas.
  Descubierto que solo el camino feliz devuelve JSON (`existingResponse="Replace"` en Web.config).
  Decidido no plantear el arreglo del Web.config: el MCP rutea por status code.
