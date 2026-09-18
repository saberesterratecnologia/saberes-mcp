# Diseño de Tools — MCP Server Saberes

**Versión:** 1.1
**Fecha:** Septiembre 2026
**Alcance:** Fase 1 — Secretaría Académica, solo lectura
**Revisión de protocolo MCP:** 2026-07-28
**Documento padre:** `PROPUESTA-AGENTES-IA.md` v2.3

Artefacto de implementación. Define el contrato exacto de las cuatro tools de la Fase 1, su mapeo a las acciones de `POST /api`, las reglas de traducción y el manejo de errores.

> **Cambios de la v1.1 (18/09/2026).** El cliente fue dado de alta en producción y el spike de Fase 0 se ejecutó de punta a punta. Lo medido contra producción corrigió tres cosas que la v1.0 daba por buenas leyendo el código:
>
> 1. **El contrato de errores está roto.** Solo el `200` devuelve JSON; todos los errores devuelven HTML. Ver sección 3.
> 2. **El token es regenerable**, no de un solo uso irrecuperable.
> 3. `SERVICIOS_API` **no tiene** scope por organización, vencimiento, IP permitidas, rate limit ni auditoría.
>
> Lección de método: **el código dice la intención, la configuración dice lo que pasa.** Medir contra producción antes de escribir el contrato.

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
| `id_servicio_api` | **`14`** (asignado en el alta del 18/09/2026) |
| `codigo` | `mcp-secretaria-academica` (UNIQUE, inmutable — es la identidad estable) |
| `nombre` | `MCP Server - Secretaría Académica` |
| `tipo` | **`externo`** |
| `activo` | `1` |
| `acciones_permitidas` | ver abajo |

> **Corrección de la v1.0:** el `tipo` correcto es **`externo`**, no `interno`. Todos los clientes que se autentican con token son `externo`; `interno` está reservado para servicios que se invocan por ruta dentro del propio sitio. La UI trae `Interno` por defecto, así que hay que cambiarlo a mano.

**Alta efectiva:** el cliente se creó con un script SQL versionado (`sql/2026-09-18_servicio_api_mcp_secretaria_academica.sql` en el repo del CRM) y **solo la generación del token pasó por la UI de sysadmin**. Ese es el patrón del proyecto, no el formulario completo.

**Lo que esta tabla NO tiene, y conviene saber antes de diseñar:** `SERVICIOS_API` no tiene `id_organizacion`, ni scope, ni fecha de vencimiento, ni IP permitidas, ni rate limit, ni contador de uso, ni auditoría de altas. **El modelo de autorización completo es: token válido + acción en la lista.** Por eso `acciones_permitidas` es el único mecanismo de mínimo privilegio que existe, y por eso se da de alta **un cliente por área** en vez de uno solo con la unión de todos los permisos: es la única forma de poder revocar un área sin voltear a las demás.

> ⚠️ `ultimo_evento_at` **no sirve como evidencia de consumo.** Solo lo escriben los dos servicios de sync de Moodle; `api_saberes.vb` nunca llama a `actualizar_ultimo_evento`. El campo va a quedar en `NULL` por más llamadas que haga el MCP.

**Valor literal de `acciones_permitidas`:**

```
recuperar_cursos_disponibles,recuperar_comisiones_disponibles,recuperar_comision_x_id,recuperar_persona_comision
```

Reglas del campo (`Negocio/ServiciosApiAccesoDatos.vb:318-330`): separador coma únicamente, `.Trim()` en ambos lados, comparación `OrdinalIgnoreCase`, **sin wildcard**, campo vacío deniega todo.

> ⚠️ **El token se muestra una sola vez por generación**, pero **es regenerable**: `generar_token_cliente()` se puede reinvocar y hace `UPDATE` de `token_cifrado`. Regenerar **invalida el anterior en el acto** — no hay historial ni doble token activo — así que hacerlo sobre un cliente en uso lo tira a 401. Si el token se pierde, **no** hay que crear otro cliente: se regenera.
>
> En la base queda cifrado con `Simple3Des` usando `CONFIGURACIONES_GLOBALES.api_token_encrypt_key`. Si esa clave se pierde, **todos** los tokens existentes deben regenerarse. La clave es **por entorno**: un token generado en local no sirve en producción y viceversa.
>
> El grid de sysadmin muestra una columna `Token` con `Configurado` / `Sin configurar`, calculada en el `SELECT`. Sirve para verificar el alta **sin volver a generar** y invalidar por accidente. El token cifrado nunca vuelve a la UI: ni un admin puede verlo de nuevo.

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

### 🔴 La regla que manda: solo el `200` devuelve JSON

**Medido contra producción el 18/09/2026.** El handler de la aplicación escribe un cuerpo JSON correcto en cada error, pero **la configuración de IIS lo descarta**: `ConIgCba/Web.config` usa `<httpErrors errorMode="Custom" existingResponse="Replace">`, y `Replace` **le gana** a `TrySkipIisCustomErrors`. Además el `401` está mapeado a `/401.aspx`, que vuelve a setear `401` sin la supresión, y ahí forms auth lo convierte en un `302` al login.

Lo que realmente devuelve la API:

| Caso | HTTP real | Content-Type real |
|---|---|---|
| Acción permitida, token válido | **200** | `application/json` ✅ |
| Sin header `X-Api-Token` | **302** | `text/html` (redirect al login) |
| Token inválido o cliente inactivo | **302** | `text/html` |
| Acción fuera de la lista blanca | **403** | `text/html` (página de IIS) |
| JSON malformado / sin `action` / acción inexistente | **400** | `text/html` |
| Verbo distinto de POST | **405** | `text/html` |
| Fallo interno | **500** | `text/html` |

**Reglas no negociables del cliente HTTP:**

1. **Rutear por status code, nunca por el body.** Parsear JSON **solo** con `200`.
2. **No seguir redirects.** `redirect: "manual"` en `fetch`, sin `-L` en curl, `allow_redirects=False` en requests. Si se siguen, la llamada termina en `200` con el HTML del login y **parece éxito**. Es el modo de falla más peligroso de esta integración.
3. **No confiar en `Content-Type`** para decidir nada.
4. Un `200` cuyo cuerpo no parsea como JSON es **su propio error**, no un éxito ni un error de red.

> **Por qué nadie lo notó antes:** ningún consumidor ejercita el camino de error. Los consumidores internos de `/api` van con cookie de sesión y hacen `r.json()` asumiendo JSON siempre — si les llega HTML, el parseo revienta y la promesa se rechaza **en silencio**. El bot solo pide acciones de su lista, así que nunca ve un 401 ni un 403.
>
> **Esto no se va a arreglar.** El arreglo sería un `<location path="api">` con `existingResponse="PassThrough"`, pero toca el `Web.config` de producción y cambia el contrato para todos los consumidores. Decisión tomada: el MCP rutea por status code. De todos modos es lo correcto aun con la API arreglada.

### Traducción a MCP

Cada caso se elige por el **status code**, nunca por texto del mensaje:

| HTTP real | Significado | Qué se le dice a la persona |
|---|---|---|
| 3xx | Token ausente, inválido o cliente inactivo | "No pude autenticarme contra Saberes. Avisale al equipo técnico" |
| 403 | Lista blanca mal configurada | "Esta integración no tiene permiso para esta consulta" |
| 400 | Bug del MCP Server | "El sistema respondió de una forma que no pude interpretar". Loguear como error crítico |
| 405 | Bug del MCP Server | Ídem |
| 500 | Fallo interno del CRM | "El sistema no pudo procesar la consulta". Queda en la tabla `EXCEPCIONES` |
| timeout / red | Infraestructura | "No respondió a tiempo, probá de nuevo" — es el único caso que la persona puede reintentar |

> **Regla:** el texto interno del error **nunca** llega al contexto del modelo. El usuario no puede hacer nada con "Token inválido", y el modelo podría intentar "arreglarlo" reintentando. Pero sí hay que **distinguir** los casos: autenticación, permisos, timeout y caída son problemas distintos y no deben leerse igual — uno lo resuelve el equipo técnico, otro se resuelve esperando.

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
| 1 | ~~Cliente `SERVICIO_API` dado de alta con la lista blanca~~ ✅ **hecho** (`id 14`, 18/09) | — |
| 2 | ~~Cliente HTTP hacia `/api` con `X-Api-Token`, timeout y reintentos~~ ✅ **hecho** | 1 |
| 3 | Capa de traducción: R1–R6 como funciones reutilizables | 2 |
| 4 | ~~`listar_cursos` — la más simple, valida el circuito completo~~ ✅ **hecho** | 3 |
| 5 | Índice cacheado con refresco en background | 3 |
| 6 | `buscar_comision` sobre el índice | 5 |
| 7 | `detalle_comision` | 3 |
| 8 | `estado_de_persona` con desambiguación | 7 |
| 9 | Auditoría | 4 |
| 10 | `server/discover`, `tools/list` con `ttlMs` y `cacheScope: private` | 4 |

> El paso 4 es el spike de Fase 0: con `listar_cursos` andando de punta a punta contra la app de chat, están validados el transporte, la autenticación, el registro del conector y el flujo MCP completo. Todo lo demás es repetir el patrón.

> ✅ **Spike de Fase 0 cerrado el 18/09/2026.** `listar_cursos` respondió en Claude Desktop con los 14 cursos agrupados por organización. Transporte, `X-Api-Token`, registro del conector y flujo MCP completo: validados. Implementación en `github.com/saberesterratecnologia/saberes-mcp` (TypeScript / Node 22+, SDK oficial, stdio).

### Nota de instalación — Claude Desktop desde Microsoft Store

Si la app se instaló como paquete MSIX (Microsoft Store), el sistema de archivos está **redirigido** y `claude_desktop_config.json` **no se lee** de `%APPDATA%\Claude`. La ruta real es:

```
%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude\claude_desktop_config.json
```

Los logs, en cambio, **sí** quedan en `%LOCALAPPDATA%\Claude\logs\` (`mcp.log` y `mcp-server-<nombre>.log`). Asimetría confusa: config adentro del sandbox, logs afuera.

Síntoma de que el config no se está leyendo: `mcp.log` en 0 bytes y la línea `[localMcpBridge] no stdio servers connected` en `main.log`.

⚠️ Las sesiones con **carpeta de proyecto / modo Code** no consumen los conectores de ese archivo. El spike se valida en un **chat normal**.

### Verificaciones antes de publicar el conector

- [ ] `acciones_permitidas` contiene **exactamente** las cuatro acciones, sin espacios ni acciones de más
- [ ] Ninguna tool expone `bot_contexto_operativo` ni `Enlace_invitación_grupo_de_Whatsapp`
- [ ] Ninguna respuesta contiene el literal `"S/D"`
- [ ] `buscar_comision` no llama a la API en ningún camino de ejecución
- [ ] `estado_de_persona` desambigua correctamente comisión inexistente vs. persona no inscripta
- [ ] Los errores 401/403/500 no llegan al contexto del modelo
- [ ] **El cliente HTTP no sigue redirects** (`redirect: "manual"`), y hay un test que lo asserta
- [ ] El éxito se decide **solo** por `status === 200`; ningún camino mira el body para eso
- [ ] El token no aparece en el `message`, el `stack` ni la serialización de ningún error, y hay un test que lo asserta
- [ ] Todas las tools tienen timeout y `max_resultados`
- [ ] `tools/list` declara `cacheScope: "private"`
- [ ] La auditoría registra las cuatro tools, incluidos los casos de error
- [ ] Ninguna tool detecta "no encontrado" mirando el status HTTP — eso se decide **dentro** de un `200`, mirando `result` y `data`
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
| 8 | El token se muestra una sola vez **por generación**, pero es regenerable — y regenerar invalida el anterior en el acto | Regenerar un cliente en uso lo tira a 401 |
| 11 | **Solo el `200` devuelve JSON. Todos los errores devuelven HTML** (`existingResponse="Replace"` en Web.config) | Detección de errores rota si se mira el body |
| 12 | El `401` llega como **`302` al login**, no como 401 | Si el cliente sigue redirects, termina en 200 con HTML de login y **parece éxito** |
| 13 | `SERVICIOS_API` no tiene scope por organización, vencimiento, IP, rate limit ni auditoría | `acciones_permitidas` es el único mínimo privilegio |
| 14 | `ultimo_evento_at` no lo escribe la API RPC | No sirve como evidencia de consumo |
| 9 | Nombres de campo con **tildes y guiones bajos** | Acceso por corchetes en JS |
| 10 | `WriteJson` aplica `Trim()` a todos los strings | Comportamiento esperado, no sorpresa |

---

*Documento de implementación del proyecto IA-ORGANIZACIONAL.*
*Contratos verificados contra `ConIgCba/auxiliar/api_saberes.vb` en `origin/main` @ `61a2ace3`.*
*Documentación de referencia del CRM: `documentacion/api/api-saberes-endpoints.md`, `documentacion/convenciones/api-clases-comision-deuda-auth.md`, `documentacion/salud/infraestructura-y-caidas.md`.*
