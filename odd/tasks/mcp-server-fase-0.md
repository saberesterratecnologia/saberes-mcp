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

- [ ] **T1 — Scaffolding del repo**
  `git init`, `package.json`, `tsconfig.json`, `.gitignore` (node_modules, dist, .env),
  SDK oficial de MCP. Mover los dos `.md` existentes al repo.
  Cierre: `npm run build` limpio.

- [ ] **T2 — Cliente HTTP de la API Saberes**
  Módulo aislado con las cuatro reglas de arriba. Token por variable de entorno, nunca
  hardcodeado. Errores tipados por status code.
  Cierre: tests del mapeo de errores + una llamada real a `recuperar_cursos_disponibles`.

- [ ] **T3 — Tool `listar_cursos`**
  Capa anticorrupción: traduce el RPC a una respuesta conversacional. Mapea la
  capitalización mixta (`id_curso` / `Curso` / `Organizacion`) a nombres limpios.
  Cierre: servidor stdio levanta y responde `tools/list` y `tools/call`.

- [ ] **T4 — Instalar Claude Desktop y registrar el conector**
  `claude_desktop_config.json` apuntando al servidor. Validar la conversación real.
  Cierre: el agente responde una consulta de cursos usando la tool.

- [ ] **T5 — Actualizar los documentos de diseño**
  `DISENO-TOOLS-MCP.md` y `PROPUESTA-AGENTES-IA.md` con los hallazgos del 18/09:
  `mesa_ayuda_bot` → `prometheo_bot`; token regenerable; sin scope por organización,
  sin vencimiento, sin rate limit, sin auditoría; contrato de errores roto.

---

## Bitácora

- **2026-09-18** — Cliente `mcp-secretaria-academica` dado de alta en prod (`id_servicio_api = 14`),
  token generado y verificado. Smoke test: 200 en la acción permitida, 403 en las prohibidas.
  Descubierto que solo el camino feliz devuelve JSON (`existingResponse="Replace"` en Web.config).
  Decidido no plantear el arreglo del Web.config: el MCP rutea por status code.
