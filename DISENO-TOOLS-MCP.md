# Diseño de Tools — MCP Server Saberes

**Versión:** 1.0
**Fecha:** Septiembre 2026
**Alcance:** Fase 1 — Secretaría Académica, solo lectura
**Revisión de protocolo MCP:** 2026-07-28
**Documento padre:** `PROPUESTA-AGENTES-IA.md` v2.3

Artefacto de implementación. Define el contrato exacto de las cuatro tools de la Fase 1, su mapeo a las acciones de `POST /api`, las reglas de traducción y el manejo de errores.

---

## Índice

1. [Cliente API y configuración](#1-cliente-api-y-configuración)
2. [Reglas transversales de traducción](#2-reglas-transversales-de-traducción)
3. [Manejo de errores](#3-manejo-de-errores)
4. [Tool 1 — `listar_cursos`](#tool-1--listar_cursos)
5. [Tool 2 — `buscar_comision`](#tool-2--buscar_comision)
6. [Tool 3 — `detalle_comision`](#tool-3--detalle_comision)
7. [Tool 4 — `estado_de_persona`](#tool-4--estado_de_persona)
8. [El índice cacheado](#8-el-índice-cacheado)
9. [Auditoría](#9-auditoría)
10. [Checklist de implementación](#10-checklist-de-implementación)

---

## 1. Cliente API y configuración

### Cliente `SERVICIO_API`

Alta desde `sysadmin → Sistema → Servicios API` (`~/modulos/sysadmin/servicios_api/inicio_servicios_api.aspx`, privilegio solo rol 4).

| Campo | Valor |
|---|---|
| `codigo` | `mcp-secretaria-academica` (UNIQUE, inmutable — es la identidad estable) |
| `nombre` | `MCP Server — Secretaría Académica` |
| `tipo` | `interno` |
| `acciones_permitidas` | ver abajo |

**Valor literal de `acciones_permitidas`:**

```
recuperar_cursos_disponibles,recuperar_comisiones_disponibles,recuperar_comision_x_id,recuperar_persona_comision
```

Reglas del campo (`Negocio/ServiciosApiAccesoDatos.vb:318-330`): separador coma únicamente, `.Trim()` en ambos lados, comparación `OrdinalIgnoreCase`, **sin wildcard**, campo vacío deniega todo.

> ⚠️ **El token se muestra una sola vez** al generarlo. En la base queda cifrado con `Simple3Des` usando `CONFIGURACIONES_GLOBALES.api_token_encrypt_key`. Si esa clave se pierde, **todos** los tokens existentes deben regenerarse.

### Transporte hacia el CRM

```http
POST https://<host>/api
Content-Type: application/json
X-Api-Token: <token>

{ "action": "recuperar_comision_x_id", "id_comision": "2424" }
```

- **Solo POST.** Cualquier otro verbo devuelve `405`.
- El header es `X-Api-Token`. **No** `Authorization: Bearer`.
- **Enviar los identificadores como string entre comillas.** Los handlers parsean con `Integer.TryParse(Convert.ToString(...))`, así que `2424` y `"2424"` funcionan igual. Con comillas, un valor mal resuelto degrada a un `400` limpio en vez de producir JSON roto.

### Configuración del servidor MCP

| Parámetro | Valor |
|---|---|
| Timeout hacia `/api` | 10 s (15 s para `recuperar_comisiones_disponibles`) |
| Reintentos | 1, solo en timeout o 5xx. **Nunca** en 4xx |
| TTL del índice de comisiones | 10 min |
| `cacheScope` de los listados MCP | `private` |
| `ttlMs` de `tools/list` | 300000 (5 min) |
| Orden de tools en `tools/list` | Determinístico, el de este documento |

---

## 2. Reglas transversales de traducción

Aplican a **todas** las tools, sin excepción.

### R1 — Proyectar

Solo los campos útiles para la tarea. Cada campo de más consume contexto del modelo y agrega ruido. Ante la duda, dejarlo afuera: agregar un campo después es trivial, quitarlo cuando el área ya se acostumbró no lo es.

### R2 — Normalizar el centinela `"S/D"`

`recuperar_comision_x_id` reemplaza strings nulos o vacíos por el **literal `"S/D"`** (`api_saberes.vb:1986`, `:4482-4518`).

```
Si valor === "S/D"  →  omitir la clave del objeto de salida
```

Nunca devolver `"S/D"` al modelo. Terminaría mostrándoselo al usuario como si fuera un dato.

### R3 — Renombrar

Los nombres del SP tienen tildes y guiones bajos (`Estado_de_la_comisión`, `Institución_Gestora`, `Valor_de_la_inscripción_promocionada`). En JavaScript obligan a acceso por corchetes, y en el contexto del modelo son ruido.

Salida en `snake_case`, sin tildes, consistente entre tools. El mapeo explícito de cada campo está en la sección de cada tool.

### R4 — Fechas en ISO 8601

El CRM devuelve fechas como string en formato local. Convertir a `YYYY-MM-DD` (o `YYYY-MM-DDTHH:mm:ss` cuando la hora importe). Si el parseo falla, **omitir el campo** — nunca pasar una fecha ambigua al modelo.

### R5 — Nulos explícitos

Un `bool?` nulo (como `dictada_virtual`) no es `false`. Si el valor es desconocido, omitir la clave.

### R6 — Límites duros

Toda tool que pueda devolver una colección declara `max_resultados`. Si el conjunto excede el límite, se trunca y **se informa explícitamente** en la respuesta para que el modelo no asuma que vio todo.

---

## 3. Manejo de errores

### Errores comunes de la API

Devueltos por `ValidarClienteApi` (`api_saberes.vb:506-541`):

| HTTP | `message` literal | Traducción a MCP |
|---|---|---|
| 401 | `Token inválido.` | Error de servidor. **No exponer al modelo.** Loguear y devolver "servicio no disponible" |
| 403 | `Acción no permitida para este cliente.` | Ídem. Indica lista blanca mal configurada |
| 500 | `Endpoint no configurado. Generar token desde sysadmin.` | Ídem |
| 400 | `Acción inválida` / `Acción no reconocida` | Bug del MCP Server. Loguear como error crítico |
| 400 | `Request inválido.` | Ídem |
| 500 | `Error interno` | "El sistema no pudo procesar la consulta." |

> **Regla:** los errores 401/403/500 son fallas de configuración del MCP Server, no información útil para el usuario. Nunca filtrar esos mensajes al contexto del modelo — el usuario no puede hacer nada con "Token inválido", y el modelo podría intentar "arreglarlo" reintentando.

### La regla crítica: "no encontrado" es HTTP 200

**En las cuatro acciones de la Fase 1**, un recurso inexistente devuelve `200` con `data: null`, o con `result: "error"`. Nunca 404.

El motivo está documentado en el código (`api_saberes.vb:1885-1897`): IIS reemplaza el cuerpo de cualquier respuesta 4xx con su página de error HTML, incluso con `TrySkipIisCustomErrors`, y el consumidor recibiría HTML en vez de JSON.

```
❌ if (response.status === 404) → no se cumple en estas acciones
✅ if (body.result === "error" || body.data === null) → el caso real
```

> ⚠️ **No generalizar esto a toda la API.** Otros handlers del mismo archivo — campañas, destinatarios, procedimientos, informes de pago — **sí devuelven 404 de verdad**. Antes de agregar una tool sobre una acción nueva, **verificar su handler**, no asumir el patrón de estas cuatro.

#### Nota de cronología, para quien lea documentación vieja del CRM

El `404` existió realmente en `recuperar_clases_x_comision`, durante unas horas del **07/09/2026**. Ese mismo día, a las 19:15, el commit `664db181` (*"fix(api): comision inexistente responde 200 con result=error, no 404"*) lo reemplazó por el comportamiento actual. La documentación del CRM quedó corregida el 14/09/2026 en el commit `61a2ace3`.

La documentación escrita esa jornada describía el `404` con exactitud **en el momento de escribirse**, y quedó desactualizada horas después. No fue un análisis equivocado: fue **deriva entre código y documentación dentro de la misma jornada**.

La lección aplica directamente a este proyecto: cuando un fix cambia un contrato público — status, forma de `data`, mensajes literales — **los documentos que lo citan son parte de ese cambio, no una tarea posterior**. Este documento cita mensajes de error literales y códigos de estado: si alguno cambia en el CRM, actualizarlo acá forma parte del mismo trabajo.

### Desambiguación obligatoria

`data: null` encubre dos situaciones **operativamente opuestas**:

| Situación | Lo que debe recibir el modelo |
|---|---|
| El identificador no existe | `"No existe la comisión 9902. Verificá el identificador."` |
| Existe, pero la persona no figura | `"La comisión 2424 existe. Esa persona no figura inscripta en ella."` |

Si la tool devuelve lo mismo en ambos casos, el modelo puede afirmarle a la secretaria que alguien no está inscripto cuando en realidad se tipeó mal el número de comisión.

**Implementación:** ver `estado_de_persona`, que resuelve esto con una segunda llamada de verificación.

---

## Tool 1 — `listar_cursos`

Vocabulario del dominio. Es la tool más barata y la primera que conviene implementar.

**Acción subyacente:** `recuperar_cursos_disponibles`

### Descripción para el modelo

> Devuelve el catálogo completo de cursos que dicta la institución, con su identificador y organización. Usala cuando necesites saber qué cursos existen, o para resolver el nombre de un curso mencionado por el usuario. No devuelve comisiones ni fechas: para eso usá `buscar_comision`.

### inputSchema

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

Sin parámetros.

### Salida

```json
{
  "cursos": [
    { "id": 12, "nombre": "Perito Clasificador", "organizacion": "terra" }
  ],
  "total": 37
}
```

### Mapeo de campos

| API | Tool |
|---|---|
| `id_curso` (int) | `id` |
| `Curso` (string) | `nombre` |
| `Organizacion` (string) | `organizacion` |

### Notas

- **Sin PII.**
- Volumen bajo: 3 columnas, universo de decenas de cursos.
- Sin `TOP` en la capa VB, pero el payload es mínimo. `max_resultados`: 200.
- Cachear con el mismo TTL que el índice de comisiones (10 min).

---

## Tool 2 — `buscar_comision`

**La tool que hace usable todo el sistema.** Resuelve lenguaje natural a `id_comision` sin pedirle un identificador al usuario.

**Acción subyacente:** `recuperar_comisiones_disponibles` — **siempre desde caché**, ver [sección 8](#8-el-índice-cacheado).

### Descripción para el modelo

> Busca comisiones por texto libre: nombre de curso, localidad, sede, o una combinación. Devuelve las coincidencias con su identificador. **Usala siempre antes de `detalle_comision` o `estado_de_persona` cuando el usuario mencione una comisión por nombre y no por número.** Si devuelve más de una coincidencia, preguntale al usuario cuál antes de continuar: no elijas por tu cuenta.

Esa última frase no es decorativa. Sin ella el modelo tiende a tomar la primera opción y seguir, que es exactamente el comportamiento que hay que evitar.

### inputSchema

```json
{
  "type": "object",
  "properties": {
    "texto": {
      "type": "string",
      "minLength": 2,
      "maxLength": 120,
      "description": "Texto a buscar: nombre de curso, localidad o sede. Ej: 'Perito Córdoba'"
    },
    "id_curso": {
      "type": "integer",
      "minimum": 1,
      "description": "Filtro opcional por curso, si ya lo resolviste con listar_cursos"
    },
    "solo_futuras": {
      "type": "boolean",
      "default": true,
      "description": "Si es true, solo comisiones cuya fecha de inicio no pasó"
    },
    "max_resultados": {
      "type": "integer",
      "minimum": 1,
      "maximum": 25,
      "default": 10
    }
  },
  "required": ["texto"],
  "additionalProperties": false
}
```

### Salida

```json
{
  "comisiones": [
    {
      "id": 2424,
      "nombre": "PERITO-S-CORDOBA-2026",
      "curso": "Perito Clasificador",
      "localidad": "Córdoba",
      "inicio": "2026-10-15",
      "modalidad": "presencial",
      "estado": "abierta"
    }
  ],
  "total_coincidencias": 2,
  "truncado": false
}
```

Cuando `total_coincidencias > 1`, el modelo debe repreguntar. Cuando `truncado` es `true`, debe informar que hay más resultados y pedir que se afine la búsqueda.

### Mapeo de campos

| `ComisionPrometheo` | Tool |
|---|---|
| `id_comision` (int) | `id` |
| `Comision` | `nombre` |
| `Curso` | `curso` |
| `Localidad_de_cursado` | `localidad` |
| `Fecha_Hora_Inicio` | `inicio` (→ R4, ISO) |
| `Modalidad` | `modalidad` |
| `Estado_de_la_comisión` | `estado` |

Los otros 22 campos **no se proyectan**. Para el detalle está `detalle_comision`.

### Algoritmo de búsqueda

Sobre el índice en memoria, no contra la base:

1. Normalizar el texto de entrada: minúsculas, sin tildes, colapsar espacios.
2. Tokenizar por espacios.
3. Para cada comisión del índice, construir un texto de búsqueda concatenando `Comision`, `Curso`, `Localidad_de_cursado`, `Lugar_de_cursado`, normalizado igual.
4. **Una comisión coincide si contiene todos los tokens** (AND, no OR). `"Perito Córdoba"` no debe traer todas las comisiones de Perito del país.
5. Si `solo_futuras`, descartar las de fecha de inicio pasada.
6. Ordenar por fecha de inicio ascendente.
7. Truncar a `max_resultados`, informando `truncado`.

### Notas

- **Sin PII.** `Domicilio_de_la_sede` es dirección institucional, y de todos modos no se proyecta.
- **Nunca llamar a la API directamente desde esta tool.** Siempre el índice. Ver sección 8.

---

## Tool 3 — `detalle_comision`

**Acción subyacente:** `recuperar_comision_x_id`

### Descripción para el modelo

> Devuelve los datos completos de una comisión a partir de su identificador numérico. Si no tenés el identificador, obtenelo primero con `buscar_comision`. **No inventes identificadores.**

### inputSchema

```json
{
  "type": "object",
  "properties": {
    "id_comision": {
      "type": "integer",
      "minimum": 1,
      "description": "Identificador numérico de la comisión, obtenido con buscar_comision"
    },
    "incluir_aranceles": {
      "type": "boolean",
      "default": false,
      "description": "Si es true, incluye los valores de inscripción, cuotas y certificación"
    }
  },
  "required": ["id_comision"],
  "additionalProperties": false
}
```

> **Por qué `incluir_aranceles` está en `false` por defecto:** son siete campos de valores que Secretaría Académica raramente necesita, y que inflan el contexto en cada consulta. Que el modelo los pida cuando hagan falta.

### Salida

```json
{
  "id": 2424,
  "nombre": "PERITO-S-CORDOBA-2026",
  "curso": "Perito Clasificador",
  "organizacion": "terra",
  "modalidad": "presencial",
  "estado": "abierta",
  "localidad": "Córdoba",
  "sede": "Sede Centro",
  "inicio": "2026-10-15",
  "duracion_meses": 8,
  "horarios": "Sábados de 9 a 13",
  "carga_horaria": "320 horas",
  "primera_clase": "2026-10-15",
  "charla_informativa": "2026-10-01",
  "pagina_web": "https://..."
}
```

Con `incluir_aranceles: true` se agrega un objeto `aranceles` con los siete valores.

### Mapeo de campos

| `ComisionPrometheo` | Tool | Siempre |
|---|---|---|
| `id_comision` | `id` | ✅ |
| `Comision` | `nombre` | ✅ |
| `Curso` | `curso` | ✅ |
| `Organizacion` | `organizacion` | ✅ |
| `Modalidad` | `modalidad` | ✅ |
| `Estado_de_la_comisión` | `estado` | ✅ |
| `Localidad_de_cursado` | `localidad` | ✅ |
| `Lugar_de_cursado` | `sede` | ✅ |
| `Fecha_Hora_Inicio` | `inicio` (R4) | ✅ |
| `Duración_en_meses` | `duracion_meses` | ✅ |
| `Horarios_de_cursado` | `horarios` | ✅ |
| `Carga_horaria_certificada` | `carga_horaria` | ✅ |
| `Primera_Clase` | `primera_clase` (R4) | ✅ |
| `Charla_Informativa` | `charla_informativa` (R4) | ✅ |
| `Página_web_del_curso` | `pagina_web` | ✅ |
| `Valor_*` (7 campos) | `aranceles.*` | solo si se pide |

### Campos deliberadamente excluidos

| Campo | Motivo |
|---|---|
| `bot_contexto_operativo` | 🔴 **Texto libre cargado por staff.** Nada garantiza que no contenga PII o notas internas. No proyectar |
| `bot_contexto_operativo_curso` | Ídem |
| `Institución_Gestora` / `Certificadora` / `Capacitadora` | Irrelevantes para la tarea de Secretaría Académica |
| `Domicilio_de_la_sede`, `URL_MAPS` | Ruido; `sede` y `localidad` alcanzan |
| `Segunda_Clase` | Bajo valor; si se pide, se agrega |
| `Categoria` | Sin uso operativo identificado |
| `Enlace_invitación_grupo_de_Whatsapp` | Enlace de invitación a grupo privado. No debe circular por el contexto de un modelo |

### Errores propios

| Situación | HTTP | `message` |
|---|---|---|
| `id_comision` no numérico | 400 | `El parámetro 'id_comision' debe ser numérico.` |
| `id_comision` inválido | 400 | `El parámetro 'id_comision' contiene un valor inválido.` |
| No existe | **200** | `Sin resultados.` + `data: null` |

> ⚠️ Notar que acá es **`contiene`**, correctamente escrito. En `recuperar_persona_comision` el mismo mensaje dice **`contienen`** (typo en producción). **No son el mismo string** — si se hace matching literal, copiar cada uno tal cual.

### Notas

- **Sin PII** con la proyección definida.
- Volumen acotado: `.FirstOrDefault()` sobre el SP.

---

## Tool 4 — `estado_de_persona`

La consulta operativa central de Secretaría Académica.

**Acción subyacente:** `recuperar_persona_comision`

### Descripción para el modelo

> Devuelve el estado académico y administrativo de una persona en una comisión específica, a partir de su DNI y del identificador de la comisión. Si no tenés el identificador de la comisión, obtenelo primero con `buscar_comision`.

### inputSchema

```json
{
  "type": "object",
  "properties": {
    "dni": {
      "type": "string",
      "pattern": "^[0-9]{6,9}$",
      "description": "DNI sin puntos ni espacios"
    },
    "id_comision": {
      "type": "integer",
      "minimum": 1,
      "description": "Identificador de la comisión, obtenido con buscar_comision"
    }
  },
  "required": ["dni", "id_comision"],
  "additionalProperties": false
}
```

> **Por qué `dni` es `string` y no `integer`:** evita que un DNI con cero inicial se pierda, y el `pattern` valida la forma antes de llegar a la API. La API lo parsea con `Integer.TryParse` de todos modos.

### Salida

```json
{
  "encontrado": true,
  "id_persona": 88213,
  "estudiante": "PÉREZ, JUAN CARLOS",
  "comision": { "id": 2424, "nombre": "PERITO-S-CORDOBA-2026" },
  "estado_academico": "efectivo",
  "estado_academico_desde": "2026-03-10",
  "estado_administrativo": "al día",
  "estado_administrativo_desde": "2026-09-01"
}
```

### Mapeo de campos

| `persona_comision_datos` | Tool |
|---|---|
| `id_persona` | `id_persona` |
| `estudiante` | `estudiante` ⚠️ **PII** |
| `id_comision` | `comision.id` |
| `comision_nombre` | `comision.nombre` |
| `estado_academico` | `estado_academico` |
| `estado_academico_fecha` | `estado_academico_desde` (R4) |
| `estado_administrativo` | `estado_administrativo` |
| `estado_administrativo_fecha` | `estado_administrativo_desde` (R4) |

### Desambiguación obligatoria del caso vacío

Cuando la API devuelve `200` con `data: null`, la tool **debe** hacer una segunda llamada para distinguir los dos escenarios:

```
1. estado_de_persona(dni, id_comision) → data: null
2. Llamar detalle_comision(id_comision) internamente
   │
   ├─ La comisión NO existe:
   │     { "encontrado": false,
   │       "motivo": "comision_inexistente",
   │       "mensaje": "No existe la comisión 9902. Verificá el identificador." }
   │
   └─ La comisión SÍ existe:
         { "encontrado": false,
           "motivo": "persona_no_inscripta",
           "mensaje": "La comisión 2424 (PERITO-S-CORDOBA-2026) existe.
                       Esa persona no figura inscripta en ella." }
```

Es una llamada extra en el camino de error, no en el camino feliz. El costo es despreciable y evita que el agente afirme algo falso con seguridad.

### Errores propios

| Situación | HTTP | `message` |
|---|---|---|
| `dni` no numérico | 400 | `El parámetro 'dni' debe ser numérico.` |
| `dni` inválido | 400 | `El parámetro 'dni' contienen un valor inválido.` ← **typo en producción, sic** |
| `id_comision` no numérico | 400 | `El parámetro 'id_comision' debe ser numérico.` |
| `id_comision` inválido | 400 | `El parámetro 'id_comision' contienen un valor inválido.` ← **sic** |
| No encontrado | **200** | `Sin resultados.` + `data: null` |

### Notas

- ⚠️ **Contiene PII**: nombre y apellido. Es la única de las cuatro tools que los devuelve.
- **No devuelve DNI ni teléfonos** — la API tampoco los expone en esta acción.
- Volumen acotado: `.FirstOrDefault()` por DNI + comisión.
- Esta acción **no** exige `telefono_origen`, a diferencia de `verificar_estudiante` y `recuperar_comisiones_x_dni`. Por eso es la elegida para el piloto.

---

## 8. El índice cacheado

La pieza que sostiene `buscar_comision` y protege la base.

### El problema que resuelve

En `recuperar_comisiones_disponibles`, el parámetro `id_curso` **no reduce el trabajo de la base** (`Negocio/CursosAccesoDatos.vb:12389-12421`):

```vbnet
Dim comisiones = contexto.sp_valores_comisiones_prometheo_tabla(Nothing).ToList()
If id_curso_consultado.HasValue = False Then Return comisiones
Return (From c In comisiones Where ids_cursos.Contains(c.id_curso) Select c).ToList()
```

El SP se ejecuta siempre con `@id_comision = NULL`, materializa el resultado completo, y filtra **en memoria del app server**. Cada fila lleva subconsultas correlacionadas (`dbo.id_n_clase` dos veces) y `FORMAT()` por fila, sobre 29 columnas de texto.

Alcance del SP (`sql/sp/sp_valores_comisiones_prometheo_tabla.sql:26`): todas las comisiones del año en curso con `id_estado_comision NOT IN (4,5)`.

Contra un SQL Server Express con ~1 GB de buffer pool, en un disco al 89,7 %, sirviendo producción.

### Diseño

```
┌─────────────────────────────────────────────┐
│  Índice en memoria del MCP Server           │
│                                             │
│  · Se refresca cada 10 minutos              │
│  · Refresco proactivo en background,        │
│    nunca en el camino de una request        │
│  · Si el refresco falla, se sigue sirviendo │
│    el índice viejo y se loguea WARN         │
│  · Estructura: array + texto normalizado    │
│    precomputado por comisión                │
└─────────────────────────────────────────────┘
```

### Reglas

1. **`buscar_comision` nunca llama a la API.** Solo lee el índice.
2. **Refresco en background**, no lazy. Un refresco disparado por una request le cobra 15 segundos a un usuario al azar.
3. **Degradación elegante**: si el refresco falla, servir el índice anterior y marcar en la respuesta que el dato puede estar desactualizado. Un índice de 20 minutos es infinitamente mejor que un error.
4. **Arranque en frío**: cargar el índice al levantar el servicio, antes de aceptar tráfico.
5. **Texto de búsqueda precomputado** en el refresco, no en cada búsqueda.
6. **Nunca refrescar más de una vez en paralelo.** Un candado simple evita la estampida.

### Para el detalle de una comisión puntual

Usar `recuperar_comision_x_id`, que sí está acotada con `.FirstOrDefault()`. **Nunca** filtrar el índice para obtener el detalle completo: el índice solo tiene los campos proyectados de búsqueda.

---

## 9. Auditoría

Un registro por invocación de tool, independientemente del resultado.

```
timestamp | conector | tool | parametros | resultado | latencia_ms | origen
```

Ejemplo:

```
2026-09-14T14:30:00Z | secretaria-academica | buscar_comision    | {"texto":"Perito Córdoba"} | ok:2         | 3    | cache
2026-09-14T14:30:12Z | secretaria-academica | estado_de_persona  | {"dni":"30123456","id_comision":2424} | ok | 340 | api
2026-09-14T14:31:02Z | secretaria-academica | detalle_comision   | {"id_comision":9902} | no_encontrado | 210 | api
```

### Qué se registra y qué no

| ✅ Se registra | ❌ No se registra |
|---|---|
| Nombre de la tool | El texto de la conversación |
| Parámetros de entrada | La respuesta redactada por el modelo |
| Resultado (ok / no encontrado / error) | El contenido completo de la respuesta de la API |
| Latencia y origen (caché o API) | |

**Por qué esta separación:** el registro debe permitir reproducir exactamente **qué recibió el modelo**, para poder determinar si una respuesta incorrecta se originó en el dato (CRM o traducción) o en la interpretación (modelo). Guardar la conversación no ayuda a eso y multiplica la exposición de PII.

En Fase 1 el campo `conector` identifica el **área**. En Fase 2, con identidad de usuario, identificará a la **persona**.

---

## 10. Checklist de implementación

### Orden sugerido

| # | Paso | Depende de |
|---|---|---|
| 1 | Cliente `SERVICIO_API` dado de alta con la lista blanca | — |
| 2 | Cliente HTTP hacia `/api` con `X-Api-Token`, timeout y reintentos | 1 |
| 3 | Capa de traducción: R1–R6 como funciones reutilizables | 2 |
| 4 | `listar_cursos` — la más simple, valida el circuito completo | 3 |
| 5 | Índice cacheado con refresco en background | 3 |
| 6 | `buscar_comision` sobre el índice | 5 |
| 7 | `detalle_comision` | 3 |
| 8 | `estado_de_persona` con desambiguación | 7 |
| 9 | Auditoría | 4 |
| 10 | `server/discover`, `tools/list` con `ttlMs` y `cacheScope: private` | 4 |

> El paso 4 es el spike de Fase 0: con `listar_cursos` andando de punta a punta contra la app de chat, están validados el transporte, la autenticación, el registro del conector y el flujo MCP completo. Todo lo demás es repetir el patrón.

### Verificaciones antes de publicar el conector

- [ ] `acciones_permitidas` contiene **exactamente** las cuatro acciones, sin espacios ni acciones de más
- [ ] Ninguna tool expone `bot_contexto_operativo` ni `Enlace_invitación_grupo_de_Whatsapp`
- [ ] Ninguna respuesta contiene el literal `"S/D"`
- [ ] `buscar_comision` no llama a la API en ningún camino de ejecución
- [ ] `estado_de_persona` desambigua correctamente comisión inexistente vs. persona no inscripta
- [ ] Los errores 401/403/500 no llegan al contexto del modelo
- [ ] Todas las tools tienen timeout y `max_resultados`
- [ ] `tools/list` declara `cacheScope: "private"`
- [ ] La auditoría registra las cuatro tools, incluidos los casos de error
- [ ] Ninguna tool detecta "no encontrado" mirando el status HTTP
- [ ] Si se agregó una tool sobre una acción fuera de las cuatro originales, **se verificó su handler**: el patrón de "200 para no encontrado" no es universal en la API

---

## Anexo — Resumen de gotchas de la API

Los que muerden si no se conocen:

| # | Gotcha | Impacto |
|---|---|---|
| 1 | "No encontrado" es **HTTP 200** en estas 4 acciones (otros handlers sí usan 404) | Detección de errores rota |
| 2 | Strings vacíos llegan como literal **`"S/D"`** | Se le muestra `"S/D"` al usuario |
| 3 | `id_curso` en `recuperar_comisiones_disponibles` **no reduce la carga de la base** | Degradación de producción |
| 4 | Typo en producción: **`contienen`** vs `contiene` según la acción | Matching literal de mensajes falla |
| 5 | Header es `X-Api-Token`, **no** `Authorization: Bearer` | 401 permanente |
| 6 | Solo **POST**; cualquier otro verbo da 405 | — |
| 7 | `acciones_permitidas` **sin wildcard**; campo vacío deniega todo | Falla cerrada, es lo correcto |
| 8 | El token se muestra **una sola vez** al generarlo | Hay que regenerarlo si se pierde |
| 9 | Nombres de campo con **tildes y guiones bajos** | Acceso por corchetes en JS |
| 10 | `WriteJson` aplica `Trim()` a todos los strings | Comportamiento esperado, no sorpresa |

---

*Documento de implementación del proyecto IA-ORGANIZACIONAL.*
*Contratos verificados contra `ConIgCba/auxiliar/api_saberes.vb` en `origin/main` @ `61a2ace3`.*
*Documentación de referencia del CRM: `documentacion/api/api-saberes-endpoints.md`, `documentacion/convenciones/api-clases-comision-deuda-auth.md`, `documentacion/salud/infraestructura-y-caidas.md`.*
