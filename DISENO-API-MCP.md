# Diseño — `/api-mcp`, identidad, permisos y auditoría

**Versión:** 0.1 (borrador)
**Fecha:** 24/09/2026
**Estado:** propuesta del lado MCP, **pendiente de contrastar con el CRM** (sección 8)
**Documento padre:** `PROPUESTA-AGENTES-IA.md` v2.6
**Documento hermano:** `DISENO-TOOLS-MCP.md` v1.3 (contrato de cada tool hacia el modelo)
**Revisión de protocolo MCP:** 2026-07-28

Este documento define cómo el MCP Server sabe **quién** lo usa, **qué** puede hacer cada persona y **qué** hizo, y el endpoint dedicado del CRM que lo sostiene. Las cuatro piezas se diseñan juntas porque dependen entre sí: el contrato de `/api-mcp` tiene que llevar la identidad desde el primer día, y la auditoría no sirve sin identidad por persona.

---

## 0. Decisiones de partida (Max, 24/09/2026)

1. **El MCP tiene endpoints propios en el CRM** (`/api-mcp`). No se toca `/api` ni a sus consumidores (Prometheo, mesa de ayuda, envío de emails).
2. **Se reutiliza el login del CRM.** No hay login propio del MCP. **La contraseña solo la ve el CRM.**
3. **Permisos por rol y auditoría por persona son requisito**, no una fase opcional.
4. **El dashboard lo consume el CRM**, al final. No se usa Grafana.

Roles de ejemplo en este borrador: **Secretaría Académica** y **Dirección**. La matriz real la define Max.

---

## 1. Vista general

```
┌────────────────────────────┐
│ App de chat                │  Claude Desktop / Codex / ChatGPT
│ (conector remoto)          │  La persona inicia sesión una vez (OAuth 2.1 + PKCE)
└─────────────┬──────────────┘
              │ HTTPS · Authorization: Bearer <token del MCP>
              ▼
┌────────────────────────────────────────────────────────────┐
│ MCP Server (Node, VPS Windows, G:)                          │
│                                                             │
│  Servidor de autorización     Servidor MCP (recurso)        │
│  /authorize /token /revoke    /mcp                          │
│  metadatos RFC 8414           metadatos RFC 9728            │
│        │                        │                           │
│        │ delega "¿quién sos?"   │ 1. valida token → persona │
│        │ al CRM                 │ 2. acceso efectivo        │
│        │                        │ 3. filtra tools / chequea │
│        │                        │ 4. llama al CRM en nombre │
│        │                        │    de la persona          │
│        │                        │ 5. audita                 │
└────────┼────────────────────────┼──────────────────────────┘
         │ navegador              │ HTTPS · X-Api-Token (servicio)
         ▼                        │        X-Acting-Person
┌──────────────────────┐          ▼
│ CRM /mcp-autorizar   │   ┌──────────────────────────────┐
│ sesión normal del    │   │ CRM /api-mcp                 │
│ CRM + consentimiento │   │ contrato limpio, solo para   │
│ → código de un uso   │   │ el MCP; aplica las reglas de │
└──────────────────────┘   │ datos de la persona          │
                           └──────────────┬───────────────┘
                                          ▼
                                    SQL Server
```

**Reparto de responsabilidades**

| Pieza | Dueño | Por qué ahí |
|---|---|---|
| Validar contraseña, sesión | **CRM** | Ya lo hace. Es el único que ve la contraseña |
| Roles de la persona, reglas de datos | **CRM** | Es la fuente de verdad. Un segundo sistema de permisos diverge |
| Alcance del agente por rol (qué tools) | **CRM** (tabla) | Misma razón: se administra donde se administran los roles |
| Maquinaria OAuth (tokens, renovación, metadatos) | **MCP** | Node tiene librerías maduras; construir un servidor OAuth en WebForms es lo más riesgoso de todo el proyecto |
| Aplicar el alcance en cada llamada | **MCP** | Es quien recibe la llamada del modelo |
| Registro de auditoría | **MCP** escribe, **CRM** guarda | El MCP es el único que ve las llamadas; el dashboard vive en el CRM |

---

## 2. Identidad

### 2.1 El principio

**La contraseña solo la ve el CRM.** El MCP nunca la recibe, nunca la valida y nunca la guarda. La persona inicia sesión en una página del CRM, igual que hoy en la web.

### 2.2 Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Login propio del MCP** | Dos lugares con usuarios: cuando alguien se va, lo dan de baja en el CRM y sigue entrando al MCP. Dos lugares con roles. Contraseñas nuevas que custodiar |
| **Identity Provider externo validando contra la tabla `USUARIOS`** | Tendría que comparar contra contraseñas cifradas de forma reversible: el defecto del CRM se propaga a un segundo sistema. Es el escenario que la v2.5 de la propuesta bloqueaba |
| **Servidor OAuth completo dentro del CRM** | Correcto en teoría, pero implica implementar OAuth 2.1, metadatos, PKCE y registro de clientes en WebForms / .NET Framework, sin librerías actuales. Riesgo alto, beneficio nulo frente al diseño elegido |

### 2.3 Por qué el diseño elegido no compromete al CRM

El problema de seguridad del CRM es **cómo guarda** las contraseñas, no cómo se inicia sesión. En este diseño el CRM sigue siendo el único que valida la contraseña, en su propia página, con su propio mecanismo. El defecto no se copia a ningún lado ni crece.

> Consecuencia: la migración de contraseñas a hash con salt **sigue siendo necesaria como tema de seguridad del CRM**, pero **deja de ser prerrequisito** de la identidad por persona del MCP.

### 2.4 El flujo, paso a paso

1. La persona agrega el conector "Saberes" en su app de chat (una URL: `https://<host>/mcp`).
2. La app llama a `/mcp` sin token. El MCP responde **401** con `WWW-Authenticate` apuntando a sus metadatos de recurso protegido (RFC 9728).
3. La app descubre el servidor de autorización (RFC 8414), se identifica con su **Client ID Metadata Document** (CIMD) y abre el navegador en `/authorize` del MCP, con PKCE, `state` y `resource`.
4. El MCP valida que la app esté en la **lista de apps permitidas** (§2.8) y redirige a **`CRM /mcp-autorizar`** con un `state` propio.
5. El CRM usa **su sesión normal**. Si no hay sesión, muestra su login de siempre. Después muestra el consentimiento: *"¿Autorizás a Claude a consultar Saberes en tu nombre?"*.
6. La persona acepta. El CRM genera un **código de un solo uso** (aleatorio, vence en 60 s, atado al `state`) y redirige de vuelta al MCP.
7. El MCP **canjea el código por canal trasero**: llama a `/api-mcp` (`canjear_codigo_autorizacion`) con su token de servicio. El CRM responde `id_persona` y marca el código como usado.
8. El MCP emite su propio código de autorización a la app. La app lo cambia en `/token` por un **access token** y un **refresh token**.
9. Desde ahí, cada llamada a `/mcp` lleva el access token.

**Por qué el canje por canal trasero (paso 7) y no una constancia firmada en la URL:** no hay claves compartidas que custodiar en los dos lados, la identidad nunca viaja en una URL (que queda en logs y en el historial del navegador), y en WebForms es una tabla y dos métodos, sin criptografía propia.

### 2.5 Tokens del MCP

| Token | Vida | Formato | Notas |
|---|---|---|---|
| Access token | **1 hora** | Opaco, aleatorio; el MCP guarda **solo su hash** | Audiencia: este MCP (RFC 8707). No se reenvía al CRM |
| Refresh token | **30 días**, rotativo | Opaco; se guarda su hash | Cada uso emite uno nuevo e invalida el anterior. Reusar uno viejo revoca toda la cadena |
| Código de autorización (MCP → app) | 60 s, un uso | Opaco | Atado al PKCE de la app |

El almacén de tokens es del MCP (tabla propia en `G:`, hashes, nunca el token en claro).

### 2.6 Baja y revocación

- **Revocación explícita**: la persona o un administrador revoca desde el CRM ("mis conexiones"); el CRM lo informa en `resolver_acceso` y el MCP invalida los tokens de esa concesión.
- **Baja de la persona en el CRM**: el MCP consulta `resolver_acceso` en cada llamada, con caché de **hasta 5 minutos**. Una persona desactivada pierde el acceso en ese plazo, sin que nadie se acuerde del MCP.
- **Revocación en el MCP** (`/revoke`): la usa la app de chat al desconectar el conector.

### 2.7 El "en nombre de quién" hacia el CRM

El MCP llama a `/api-mcp` con **dos datos**:

- `X-Api-Token`: el token de servicio del cliente `mcp-secretaria-academica` (hoy id 14). Prueba que **quien llama es el MCP**.
- `X-Acting-Person`: el `id_persona` que el MCP resolvió en el paso 7. Dice **en nombre de quién**.

El CRM acepta `X-Acting-Person` **solo** de un cliente marcado como habilitado para actuar en nombre de personas. Ningún otro cliente de `SERVICIOS_API` puede enviarlo. El token de la persona **nunca** se reenvía al CRM: la spec prohíbe el *token passthrough*, y además el CRM no sabría validarlo.

### 2.8 Qué apps de chat pueden conectarse

El registro de clientes sigue el orden de la spec 2026-07-28: preregistro, luego **Client ID Metadata Documents**, y Dynamic Client Registration solo por compatibilidad. Este MCP:

- acepta **CIMD**, soportado por Claude y por Codex (verificado, §9);
- **no ofrece DCR**: la spec se está alejando de él y abre la puerta a clientes anónimos;
- mantiene una **lista explícita de `client_id` permitidos** (Claude, Codex y, si se decide, ChatGPT). Una app desconocida no llega ni a la pantalla de consentimiento.

### 2.9 Requisitos de la spec 2026-07-28 que este diseño cubre

| Requisito (spec, página de autorización) | Cómo se cumple |
|---|---|
| El servidor MCP **MUST** implementar Protected Resource Metadata (RFC 9728) | `/.well-known/oauth-protected-resource` |
| El servidor de autorización **MUST** implementar OAuth 2.1 y publicar metadatos (RFC 8414 u OIDC Discovery) | `/.well-known/oauth-authorization-server` |
| **MUST** validar que el token fue emitido para este servidor (RFC 8707) | El token guarda su `resource`; se compara en cada llamada |
| Token inválido o vencido **MUST** recibir 401 | Middleware de bearer auth |
| **MUST NOT** aceptar ni reenviar otros tokens (*token passthrough*) | El CRM recibe el token de servicio + `X-Acting-Person`, nunca el token de la persona |
| Validación de `iss` en la respuesta de autorización (RFC 9207, novedad de la 2026-07-28) | El MCP incluye `iss` en la redirección a la app |

> ⚠️ **El SDK instalado (`@modelcontextprotocol/sdk` 1.30.0) implementa el protocolo 2025-11-25**, no el 2026-07-28. Trae las piezas de auth (router OAuth, handlers, `requireBearerAuth`) pero no las novedades de la 2026-07-28. Para la 2026-07-28 hay **SDKs en beta**. Decidir la versión del SDK es parte de la implementación, no de este documento.

---

## 3. Permisos

### 3.1 El modelo

```
acceso efectivo = tools permitidas para el rol  (alcance del agente, tabla del CRM)
                ∩ reglas de datos de la persona  (las del CRM, aplicadas en /api-mcp)
```

Dos capas, cada una en un solo lugar:

- **Qué tools** puede usar un rol a través del agente: la decide la tabla de alcance. El MCP la aplica.
- **Qué datos** puede ver la persona dentro de cada tool: los decide el CRM en `/api-mcp`, con `X-Acting-Person`. El MCP no reimplementa reglas de datos.

### 3.2 Sysadmin no es comodín

En el CRM, `esSysadmin` saltea `puede_leer` y ve todo. Quien más va a usar el agente (Dirección) suele ser sysadmin. Si el alcance del agente copiara los permisos del CRM, **para ellos no habría límite**.

Por eso el alcance del agente **no se deriva** de los permisos del CRM: es una tabla aparte, explícita por rol. Un sysadmin tiene exactamente las tools que su rol tenga asignadas en esa tabla, ni una más.

### 3.3 Reglas

1. **Negado por defecto.** Una persona sin ningún rol mapeado en la tabla de alcance no ve ninguna tool.
2. **Varios roles:** la persona recibe la **unión** de las tools de sus roles. *(A validar con Max: la alternativa es exigir que elija un rol al conectarse.)*
3. **El filtrado de `tools/list` no es seguridad**, es experiencia de uso. Cada `tools/call` se vuelve a chequear contra el acceso efectivo.
4. **Defensa en profundidad:** el CRM vuelve a chequear en `/api-mcp` que la acción sea coherente con la persona (`X-Acting-Person`). Si el MCP tuviera un bug de permisos, el CRM igual no entrega datos fuera de las reglas de la persona.
5. **Los permisos los decide el servidor, nunca el modelo.** Ningún parámetro de una tool puede ampliar el alcance.

### 3.4 Matriz de ejemplo (a validar por Max)

| Tool | Secretaría Académica | Dirección |
|---|---|---|
| `listar_cursos` | ✅ | ✅ |
| `buscar_comision` | ✅ | ✅ |
| `detalle_comision` | ✅ | ✅ |
| `detalle_comision` con `incluir_aranceles` | ✅ | ✅ |
| `estado_de_persona` | ✅ *(bloqueada hasta la decisión de dirección sobre PII)* | ❌ |

`incluir_aranceles` se modela como un permiso propio (`detalle_comision.aranceles`), para poder negarlo a un rol sin quitarle la tool.

### 3.5 Tabla de alcance en el CRM (propuesta)

```
MCP_ALCANCE_ROL
  id_rol          → rol del CRM
  permiso         → 'listar_cursos' | 'buscar_comision' | 'detalle_comision'
                    | 'detalle_comision.aranceles' | 'estado_de_persona'
  activo          → bit
  alta_por, alta_at, baja_por, baja_at   → quién lo otorgó o quitó y cuándo
```

Cada cambio de esta tabla es, en sí mismo, un evento auditable del CRM.

---

## 4. Contrato de `/api-mcp`

### 4.1 Principios

- **Endpoint propio**, con handler propio. Precedente en el repo: `/api-presencia` (21/09/2026). No comparte dispatcher con `/api`.
- **Estilo RPC** (`POST` con `action` en el cuerpo), igual que `/api`, para que el CRM reutilice su forma de trabajar.
- **Errores en JSON con su status real.** `404` para "no existe" cuando se pide algo por id.
- **Datos, no presentación:** `null` en vez de `"S/D"`, sin `UPPER`, fechas ISO 8601, números como números, montos como número (el `"GRATIS"` es un `0`), nombres de campo en `snake_case` sin tildes.
- **Solo los campos que usan las tools.** Lo que el MCP no proyecta no sale de la base (`bot_contexto_*`, enlace de WhatsApp, instituciones).
- **Paginación** en toda colección.
- **Mismas reglas de negocio que el resto del CRM.** "Comisión disponible" se define una sola vez (vista o función SQL) y la usan `/api` y `/api-mcp`. Independiente en el contrato, no en las reglas.

### 4.2 Forma de las respuestas

Éxito:

```json
{ "data": { ... } }
{ "data": [ ... ], "page": { "next_cursor": "c2VnLTQw", "has_more": true } }
```

Error:

```json
{ "error": { "code": "not_found", "message": "La comisión 99999 no existe." } }
```

| Status | `error.code` | Cuándo |
|---|---|---|
| 400 | `invalid_params` | Parámetro faltante o de tipo incorrecto |
| 401 | `invalid_service_token` | Token de servicio ausente o inválido |
| 403 | `acting_person_not_allowed` | La persona no puede ver ese dato, o el cliente no puede actuar en nombre de personas |
| 404 | `not_found` | El recurso pedido por id no existe |
| 405 | `method_not_allowed` | Verbo distinto de `POST` |
| 500 | `internal_error` | Fallo interno (queda en `EXCEPCIONES`) |

### 4.3 Acciones

**De identidad y acceso** (solo el MCP, con token de servicio):

| Acción | Entrada | Salida |
|---|---|---|
| `canjear_codigo_autorizacion` | `codigo`, `state` | `{ id_persona, id_concesion }`. Marca el código como usado. `400` si venció, se usó o no coincide el `state` |
| `resolver_acceso` | `id_persona` (vía `X-Acting-Person`) | `{ activa, roles: [...], permisos: [...], concesiones_revocadas: [...] }` |
| `registrar_eventos_auditoria` | lote de eventos (§5) | `{ recibidos }` |

**De datos** (con `X-Acting-Person`):

| Acción | Para la tool | Entrada | Notas |
|---|---|---|---|
| `cursos_disponibles` | `listar_cursos` | — | Sin `UPPER` forzado |
| `buscar_comisiones` | `buscar_comision` | `texto?`, `id_curso?`, `modalidad?`, `estado?`, `limit` (máx. 20), `cursor?` | Filtra en SQL, no en memoria. **"Vigente" se define por fecha de fin**, no por año calendario (evita que el 1/1 desaparezcan comisiones en curso) |
| `comision` | `detalle_comision` | `id_comision`, `incluir_aranceles?` | `404` si no existe. Incluye `disponible` (bool) para que el MCP sepa si la comisión está en el mismo universo que la búsqueda |
| `persona_en_comision` | `estado_de_persona` | — | **Fuera de este borrador.** Bloqueada hasta la decisión de dirección sobre PII. Se diseña desde cero con el control de acceso correcto (hoy `recuperar_persona_comision` entrega PII con DNI + id sin el control por teléfono) |

**Ejemplo — `comision`:**

```json
{
  "data": {
    "id": 2672,
    "codigo": "PRODUCCIÓN EXTENSIVA-D-OCTUBRE-2026",
    "curso": { "id": 28, "nombre": "Producción extensiva de cereales y oleaginosas" },
    "organizacion": { "id": 1, "nombre": "Instituto Terra" },
    "modalidad": "online",
    "es_virtual": true,
    "estado": "inscripciones",
    "disponible": true,
    "localidad": null,
    "sede": null,
    "inicio": "2026-10-15",
    "duracion_meses": 4,
    "horarios": "online - desde la comodidad de tu hogar",
    "carga_horaria_horas": 64,
    "primera_clase": null,
    "charla_informativa": null,
    "pagina_web": "https://institutoterra.com.ar/produccion-extensiva-de-cereales-y-oleaginosas/",
    "aranceles": {
      "moneda": "ARS",
      "inscripcion_regular": 58000,
      "inscripcion_promocionada": 29000,
      "cuota_regular": 55000,
      "cuota_promocionada": 45000,
      "pago_unico": 159000,
      "cuota_con_recargo": 55000,
      "certificacion": 90000,
      "nota_promocion": "Abonando del 1 al 10 de cada mes"
    }
  }
}
```

Con `es_virtual` explícito, `localidad: null` significa "no aplica" en una comisión virtual y "falta el dato" en una presencial: la ambigüedad del `"S/D"` desaparece. `aranceles` solo viene si se pide **y** si la persona tiene el permiso `detalle_comision.aranceles`.

---

## 5. Auditoría

### 5.1 Qué se registra en cada llamada

| Campo | Ejemplo | Notas |
|---|---|---|
| `id_evento` | UUID | |
| `ocurrido_at` | `2026-09-24T14:03:11.402Z` | UTC |
| `id_persona` | `1234` | Quién |
| `roles` | `["secretaria"]` | Al momento de la llamada |
| `id_concesion` | `87` | Qué autorización usó (qué app, desde cuándo) |
| `cliente` | `claude` / `codex` | `client_id` de la app de chat |
| `tool` | `detalle_comision` | |
| `parametros` | `{"id_comision":2672,"incluir_aranceles":true}` | Sanitizados (§5.3) |
| `resultado` | `ok` / `no_encontrado` / `denegado` / `error:<kind>` | |
| `cantidad_resultados` | `1` | Para detectar extracción masiva |
| `latencia_ms` | `184` | |

### 5.2 Eventos de autorización

Además de las llamadas, se registran: concesión otorgada (persona, app, fecha), token renovado, concesión revocada (por quién), acceso denegado por alcance, y app no permitida que intentó conectarse.

### 5.3 Datos personales en el log

Un DNI en un parámetro **no se guarda en claro**. Se guarda `HMAC(secreto, dni)`: permite responder "¿quién consultó el DNI X?" recalculando el HMAC, sin que el log sea una base de DNI. El secreto vive solo en el MCP.

### 5.4 Lo que la auditoría no ve

El MCP ve **llamadas a tools**, no la conversación: no sabe qué le preguntaron al modelo ni qué respondió. Registrar conversaciones depende de la app de chat (auditoría de los planes Team / Enterprise). Es un criterio más para elegir la app.

### 5.5 Dónde se guarda

- El MCP escribe cada evento primero en un **archivo local append-only** en `G:` (JSON Lines, rotación diaria, tope de tamaño). Si el CRM está caído, el evento no se pierde; justamente cuando el CRM falla es cuando más importa registrar el error.
- Un proceso del MCP envía los eventos en lotes a `registrar_eventos_auditoria`. El CRM los guarda en una tabla `MCP_AUDITORIA`, de la que lee el dashboard.
- **Retención:** a definir por dirección (propuesta: 12 meses en el CRM, 30 días de archivo local).

### 5.6 El dashboard (al final)

Sale de `MCP_AUDITORIA` + nombres y roles del CRM: uso por persona, tool y día; denegaciones; errores; latencia; personas con volumen anómalo de resultados.

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **Token robado** | Access de 1 h, refresh rotativo con detección de reuso, revocación desde el CRM, tokens guardados solo como hash |
| **Suplantación de `X-Acting-Person`** | Solo un cliente de servicio habilitado puede enviarlo; su token vive únicamente en el host del MCP |
| **Sysadmin con acceso total por el agente** | Alcance explícito por rol, no derivado de los permisos del CRM (§3.2) |
| **Extracción masiva vía el modelo** | Solo lectura; `limit` máximo de 20; límite de llamadas por persona y por minuto; `cantidad_resultados` auditado |
| **Prompt injection desde datos del CRM** | Los campos de texto libre (`bot_contexto_*`) no salen de la base; el agente no tiene herramientas de escritura |
| **Baja de una persona que sigue usando el agente** | `resolver_acceso` en cada llamada con caché de hasta 5 min |
| **App de chat no autorizada** | Lista explícita de `client_id`; sin DCR |
| **Bug de permisos en el MCP** | El CRM re-chequea en `/api-mcp` con `X-Acting-Person` |
| **Se pierden eventos de auditoría** | Archivo local append-only antes de enviar al CRM |
| **Superficie nueva en un servidor sin parches** | Riesgo ya aceptado en la v2.5 de la propuesta; `/mcp-autorizar` y `/api-mcp` son la superficie nueva del CRM y deben pasar revisión propia |

---

## 7. Qué construye cada lado

| CRM | MCP |
|---|---|
| Handler `/api-mcp` con el contrato de §4 | Servidor de autorización: `/authorize`, `/token`, `/revoke`, metadatos RFC 8414 |
| Página `/mcp-autorizar`: sesión del CRM + consentimiento + código de un uso | Metadatos RFC 9728 y 401 con `WWW-Authenticate` en `/mcp` |
| Tabla de códigos de un uso y de concesiones | Almacén de tokens (hashes) |
| Tabla `MCP_ALCANCE_ROL` + su pantalla de administración | Resolución de acceso efectivo, filtrado de `tools/list`, chequeo en cada `tools/call` |
| Pantalla "mis conexiones" (revocar) | Envío de `X-Acting-Person` a `/api-mcp` |
| Tabla `MCP_AUDITORIA` | Archivo de auditoría local + envío por lotes |
| Marca en `SERVICIOS_API` para clientes que pueden actuar en nombre de personas | Transporte Streamable HTTP (hoy es stdio) |
| Vista o función SQL única de "comisión disponible" | Migración de las tools a `/api-mcp` |

**Orden sugerido**

1. `/api-mcp` con `cursos_disponibles`, `comision` y `buscar_comisiones`, todavía con el token de servicio y sin `X-Acting-Person`. Las tools migran y la capa accidental del MCP desaparece.
2. Identidad: `/mcp-autorizar`, `canjear_codigo_autorizacion`, OAuth del MCP, transporte HTTPS. Un piloto con una persona.
3. Permisos: `MCP_ALCANCE_ROL`, `resolver_acceso`, `X-Acting-Person` obligatorio.
4. Auditoría: archivo local, `registrar_eventos_auditoria`, `MCP_AUDITORIA`.
5. Dashboard en el CRM.

> Los pasos 2 a 4 van juntos a producción: **no se habilita a más de una persona hasta que identidad, permisos y auditoría estén los tres**.

---

## 8. Preguntas para el CRM

1. **Roles:** ¿en qué tabla vive la relación persona ↔ rol? ¿Una persona puede tener varios roles? ¿Qué define que una persona esté "activa"?
2. **Sesión:** ¿`/mcp-autorizar` puede ser una página WebForms más detrás de la autenticación de formularios actual, reutilizando la sesión sin cambios?
3. **`/api-presencia`:** ¿su estructura sirve de molde para `/api-mcp`? ¿Tiene lista de acciones permitidas propia?
4. **"Comisión disponible":** ¿cuál es la regla correcta? Hoy el listado corta por año calendario y el detalle no filtra. ¿Qué define "vigente"?
5. **Reglas de datos por persona:** para las acciones de §4.3, ¿hay datos que una persona de un rol no debería ver aunque tenga la tool? (por ejemplo, comisiones de otra organización).
6. **Montos:** ¿los siete valores se guardan como números en la base y el formato `"$ 29.000 (*...)"` lo arma el SP? ¿De dónde sale la anotación de la promoción?
7. **`EXCEPCIONES` y deploy:** ¿alguna restricción del protocolo de deploy del CRM para agregar tablas y un handler nuevo?

---

## 9. Verificaciones externas (24/09/2026)

| Afirmación | Fuente |
|---|---|
| La spec vigente es la **2026-07-28**; endurece la autorización (validación de `iss` según RFC 9207) y se aleja de DCR hacia CIMD | Blog de MCP, *The 2026-07-28 Specification*; changelog de la spec |
| Orden de registro de clientes: preregistro, CIMD, DCR por compatibilidad | `modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration` |
| MCP server **MUST** implementar RFC 9728, validar audiencia (RFC 8707), responder 401 a tokens inválidos y no hacer *token passthrough* | `modelcontextprotocol.io/specification/2026-07-28/basic/authorization` |
| Claude acepta conectores remotos propios en Free, Pro, Max, Team y Enterprise; en Team/Enterprise solo los Owners los agregan y **cada persona se autentica individualmente** | Centro de ayuda de Claude, *Get started with custom connectors using remote MCP* |
| Claude soporta OAuth con DCR y con CIMD | `claude.com/docs/connectors/building/authentication` |
| Codex soporta servidores Streamable HTTP con bearer token y OAuth, incluidos CIMD y DCR (`codex mcp login`) | Documentación de MCP de Codex |
| El SDK instalado (1.30.0) implementa el protocolo 2025-11-25 y trae router OAuth, handlers y `requireBearerAuth` | `node_modules/@modelcontextprotocol/sdk` (`LATEST_PROTOCOL_VERSION`, `server/auth`) |
| El SDK tiene betas para la 2026-07-28 | Blog de MCP, *Beta SDKs for the 2026-07-28 MCP Spec Release Candidate* |
