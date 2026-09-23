# Feature: tool `detalle_comision` + capa de traducción compartida

**Objetivo**: pasos 3 y 7 del checklist de `DISENO-TOOLS-MCP.md` §10. Extraer las reglas de
traducción R1–R5 a un módulo reutilizable y exponer `detalle_comision` sobre
`recuperar_comision_x_id`.

**Rama**: `feat/detalle-comision` (desde `docs/mcp-en-vps-windows`)
**Fuera de alcance**: R6 (llega con `buscar_comision`, la primera tool que necesita truncar),
índice cacheado, `buscar_comision`, `estado_de_persona` (bloqueada por decisión de PII),
auditoría, transporte HTTP.

---

## Contrato real (medido contra producción el 2026-09-23)

- Request: `{"action":"recuperar_comision_x_id","id_comision":2672}`. Parámetro no numérico o
  ausente → **400** (`bad_request`).
- Existe → `result:"ok"`, `data` es un **objeto** (no array).
- No existe → `result:"ok"`, `message:"Sin resultados."`, `data:null`.
- Valores en **MAYÚSCULAS**; fechas **`dd/mm/yyyy`**; `Duración_en_meses` es **string**;
  `Charla_Informativa` puede ser texto libre ("Sin charla programada"); `"S/D"` en localidad,
  sede, domicilio, maps, primera y segunda clase.
- Tildes inconsistentes: `Valor_de_la_inscripcion_regular` (sin tilde) vs
  `Valor_de_la_inscripción_promocionada` (con tilde); `Valor_de_la_certificacion` sin tilde.
- Montos: strings con anotaciones. Se pasan como texto.

## Tareas

- [x] **T1 — Módulo de traducción compartido** (`src/translation.ts`) — `cd5f634` + fix `487289d`
  Mover casing y `describeFailure` desde `listar-cursos.ts`; agregar R2 (`"S/D"` → ausente),
  R4 (`dd/mm/yyyy` → `YYYY-MM-DD`, fecha inválida → ausente), entero desde string.
  `listar_cursos` sigue verde sin cambios de comportamiento.

- [x] **T2 — Cliente: `getCommission(id)`** — `5e7d8c1`
  Tipo `RawCommission` con las claves literales. `data:null` → `null`.

- [x] **T3 — Tool `detalle_comision`** — `154211c`
  inputSchema del diseño, proyección, exclusiones, aranceles opt-in, "no existe" explícito.
  Registrada en `src/index.ts`.

- [x] **T4 — Verificación e2e contra producción + actualizar `DISENO-TOOLS-MCP.md`** — v1.2
  Contrato medido en §Tool 3, checklist pasos 3 (parcial) y 7.

- [x] **T5 — Seguimiento de la revisión nativa** — `f5599c7` (`review-e542117105f7ace4`, advertencias no bloqueantes)
  - `R3-error-envelope-masking` (`src/saberes-client.ts`): `result:"error"` se colapsa en "no existe".
    Nunca se observó en esta acción; si aparece por otra causa, la persona recibiría "no existe la
    comisión" en vez de una falla. Es exactamente la afirmación falsa que el diseño manda evitar.
  - `R3-invalid-time-accepted` (`src/translation.ts`): el regex acepta una hora inválida (`99:99`)
    detrás de la fecha. La hora se descarta, pero un campo malformado debería omitirse entero.

## Bitácora

- **2026-09-23** — Contrato medido contra prod antes de escribir código; difiere del ejemplo
  del diseño en casing, formato de fecha, tipo de duración y tildes de los `Valor_*`.
- **2026-09-23** — T1–T3 delegados a gentle-ai-worker con TDD: 17 → 41 tests en verde,
  typecheck y build limpios. `z.strictObject` rechaza propiedades extra (verificado contra el
  SDK real). Corrección inline `487289d`: `describeFailure` quedó compartido pero dos mensajes
  decían "consultar los cursos"; una falla de `detalle_comision` le habría dicho a la persona
  que falló la consulta de cursos.
- **2026-09-23** — Revisión nativa `review-e542117105f7ace4` (riesgo medio, lente confiabilidad):
  aprobada con dos advertencias no bloqueantes → T5. ASSESS con la revisión cerrada: no requiere
  verificador independiente.
- **2026-09-23** — T4: e2e con cliente MCP del SDK contra prod. 2672 sin/con aranceles, inexistente
  → "No existe la comisión", id 0 → rechazado por el schema. Cero filtraciones de `S/D`,
  `bot_contexto`, WhatsApp o instituciones. `DISENO-TOOLS-MCP.md` → v1.2.
  Dato del CRM (fuera de alcance): `Valor_de_la_inscripción_promocionada` trae la anotación
  "VALOR DE LA CUOTA CON DESCUENTO", o sea que el texto de la inscripción habla de la cuota.
- **2026-09-23** — T5: `api_error` nuevo; `result:"error"` ahora es falla, no "no existe". `toIsoDate` valida la hora. 41 → 44 tests.
