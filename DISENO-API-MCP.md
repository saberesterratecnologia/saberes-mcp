# Diseño — `/api-mcp`, identidad, permisos y auditoría

**Versión:** 0.4
**Fecha:** 24/09/2026
**Estado:** contrastado con el CRM el 24/09/2026 (sesión green-cloud, `documentacion/api/contraste-diseno-api-mcp.md` en su worktree). Respuestas en §8.1; **decisiones abiertas de Max** en §8.2

> **Cambios de la v0.4 (24/09/2026).** El paso 1 está **en producción** (§4.4, con el contrato medido). Max decidió que el agente ve **las cuatro organizaciones** del catálogo (D2).
>
> **Cambios de la v0.3 (24/09/2026).** El alcance del agente por rol **reutiliza la tabla `PRIVILEGIOS` del CRM** en vez de una tabla nueva: privilegios sueltos `MCP · …` asignados en `ROLES_PRIVILEGIOS` con la pantalla de privilegios que ya existe. Verificado en el código: `Evaluar_Privilegio` no tiene atajo para sysadmin. Max decidió D1, D2 y D3 (§8.2).
>
> **Cambios de la v0.2 (24/09/2026).** El contraste con el CRM corrigió cuatro supuestos: `id_rol` es un catálogo compartido con los roles de comisión (1 = Estudiante), la vigencia se define por **estado** y no por fecha, no existen reglas de datos por organización ligadas a la persona, y `/mcp-autorizar` cae bajo un defecto de postbacks ya conocido del CRM. También sumó un requisito de baja (`resolver_acceso` debe revisar `activado` y `borrada`) y tres decisiones para Max.
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

Roles habilitados (decisión de Max, 24/09/2026): **3 — Secretaría académica** (área piloto) y **4 — Administrador del sistema**. Matriz en §3.4.

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

El problema de seguridad del CRM es **cómo guarda** las contraseñas: hoy **no están hasheadas, están cifradas de forma reversible** (3DES, con clave derivada del nombre de usuario). No es un problema de cómo se inicia sesión. En este diseño el CRM sigue siendo el único que valida la contraseña, en su propia página, con su propio mecanismo. El defecto no se copia a ningún lado ni crece.

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
  - ⚠️ **Requisito del lado CRM:** `resolver_acceso` tiene que consultar **explícitamente** `USUARIOS.activado` y `PERSONAS.borrada`. Las funciones de sesión del CRM (`recuperar_usuario_logueado_actual`) **no los revalidan**: solo se chequean al iniciar sesión. Si `resolver_acceso` reutilizara esas funciones, una persona dada de baja seguiría entrando.
- **Revocación en el MCP** (`/revoke`): la usa la app de chat al desconectar el conector.

### 2.7 El "en nombre de quién" hacia el CRM

El MCP llama a `/api-mcp` con **dos datos**:

- `X-Api-Token`: el token de servicio del cliente `mcp-secretaria-academica` (hoy id 14). Prueba que **quien llama es el MCP**.
- `X-Acting-Person`: el `id_persona` que el MCP resolvió en el paso 7. Dice **en nombre de quién**.

El CRM acepta `X-Acting-Person` **solo** de un cliente marcado como habilitado para actuar en nombre de personas. Ningún otro cliente de `SERVICIOS_API` puede enviarlo.

> ⚠️ **La marca tiene tres puntas en el CRM**, y olvidar una falla en silencio: la columna en la tabla `SERVICIOS_API`, el `SELECT` con columnas explícitas que lee los clientes (`Negocio/ServiciosApiAccesoDatos.vb:297-306`, no es `SELECT *`) y el ABM de sysadmin. `SERVICIOS_API` es la tabla; `SERVICIO_API` es la clase VB que mapea una fila. El token de la persona **nunca** se reenvía al CRM: la spec prohíbe el *token passthrough*, y además el CRM no sabría validarlo.

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
acceso efectivo = privilegios MCP del rol       (alcance del agente: PRIVILEGIOS del CRM)
                ∩ reglas de datos de la persona  (las del CRM, aplicadas en /api-mcp)
```

Dos capas, cada una en un solo lugar:

- **Qué tools** puede usar un rol a través del agente: la deciden los **privilegios `MCP · …`** asignados a ese rol en `ROLES_PRIVILEGIOS` (§3.5). El MCP los aplica.
- **Qué datos** puede ver la persona dentro de cada tool: los decide el CRM en `/api-mcp`, con `X-Acting-Person`. El MCP no reimplementa reglas de datos.

### 3.2 Sysadmin no es comodín

En partes del CRM, `esSysadmin` saltea los controles: por ejemplo, `puede_leer` de memoria operativa y la rama "Sistema" del menú. Quien más va a usar el agente (Dirección) suele ser sysadmin. Si el alcance del agente se derivara de lo que la persona puede hacer en el CRM, **para ellos no habría límite**.

Por eso el alcance del agente **no se deriva** de los permisos existentes del CRM: son **privilegios nuevos y propios del agente** (`MCP · …`), asignados explícitamente por rol. Tener el privilegio "Ingreso al sistema" o cualquier otro del backoffice no otorga nada en el agente. Un sysadmin tiene exactamente los privilegios `MCP · …` que el rol 4 tenga asignados, ni uno más.

> ✅ **Verificado en el código del CRM (24/09/2026):** `Evaluar_Privilegio` (`Negocio/usuariosAccesoDatos.vb:1151`) es un join puro persona → `PERSONAS_ROLES` → `ROLES_PRIVILEGIOS`, **sin atajo para sysadmin**. Reutilizar `PRIVILEGIOS` no reintroduce el problema.

### 3.3 Reglas

1. **Negado por defecto.** Una persona sin ningún privilegio `MCP · …` no ve ninguna tool.
2. **Varios roles:** la persona recibe la **unión** de las tools de sus roles. Coincide con el CRM: `evaluar_acceso` mira cualquier rol de la persona, no el activo. *(Nota: el CRM tiene un `id_rol_usuario_actual` que hoy no usa para autorizar; si algún día lo empieza a usar, este punto queda desalineado.)*
3. **El filtrado de `tools/list` no es seguridad**, es experiencia de uso. Cada `tools/call` se vuelve a chequear contra el acceso efectivo.
4. **Defensa en profundidad:** el CRM vuelve a chequear en `/api-mcp` que la acción sea coherente con la persona (`X-Acting-Person`): que esté activa y que tenga el privilegio `MCP · …` de esa acción. Si el MCP tuviera un bug de permisos, el CRM igual no ejecuta la acción.
   - **Límite, confirmado por el CRM:** **no existen reglas de datos por organización ligadas a la persona.** `PERSONAS_ROLES` no tiene organización; en el sitio la organización sale del dominio o de `?org=`. Sysadmin y secretaría ven todas las organizaciones. Así que el re-chequeo es de **acción**, no de **filas**. Si se quiere acotar a una persona a una organización, hay que modelarlo: es la decisión abierta D2 (§8.2).
5. **Los permisos los decide el servidor, nunca el modelo.** Ningún parámetro de una tool puede ampliar el alcance.

### 3.4 Matriz de permisos (decidida por Max, 24/09/2026)

**Roles habilitados para el agente (lista blanca):** **3 — Secretaría académica** y **4 — Administrador del sistema**. Ningún otro rol, aunque tenga filas en `ROLES_PRIVILEGIOS`.

| Privilegio | Tool | 3 — Secretaría académica | 4 — Administrador del sistema |
|---|---|---|---|
| `MCP · Listar cursos` | `listar_cursos` | ✅ | ✅ |
| `MCP · Buscar comisiones` | `buscar_comision` | ✅ | ✅ |
| `MCP · Detalle de comisión` | `detalle_comision` | ✅ | ✅ |
| `MCP · Aranceles de comisión` | `detalle_comision` con `incluir_aranceles` | ✅ | ✅ |
| `MCP · Estado de persona` | `estado_de_persona` | ⏸️ No se crea hasta la decisión de dirección sobre PII | ⏸️ Ídem |

**El sysadmin tiene todo porque se le asignó explícitamente**, no por ser sysadmin: `Evaluar_Privilegio` no tiene atajo (§3.2). Si mañana se le quita un privilegio `MCP · …` al rol 4, el sysadmin lo pierde como cualquier otro.

**Secretaría académica es el área piloto.** Los nombres de rol salen de la tabla `ROLES` del CRM (`documentacion/convenciones/menu-y-control-de-acceso.md`); en el ejemplo de la v0.1 figuraba "Dirección", que no es un rol del sistema.

`incluir_aranceles` se modela como un privilegio propio (`MCP · Aranceles de comisión`), para poder negarlo a un rol sin quitarle la tool. Además, por la decisión D1, **los montos que la comisión marca como "no mostrar" no salen nunca**, tenga o no el privilegio.

### 3.5 El alcance vive en `PRIVILEGIOS` (el mecanismo que el CRM ya tiene)

El CRM ya modela permisos con dos tablas y tiene su pantalla de administración (`modulos/usuarios/privilegios/`):

| Tabla | Columnas | Uso para el agente |
|---|---|---|
| `PRIVILEGIOS` | `id_privilegio` (IDENTITY), `nombre`, `activado`, `descripcion`, `MenuId`, `sinItemMenu` | Un privilegio **suelto** (`sinItemMenu = 1`, sin ítem de menú) por cada permiso del agente |
| `ROLES_PRIVILEGIOS` | `id_rol`, `id_privilegio` | Qué roles tienen qué privilegio del agente |

**Privilegios del agente** (se crean con un script SQL versionado, igual que `sql/2026-09-04_MO_002_menu_privilegios.sql`):

| `nombre` | Permite |
|---|---|
| `MCP · Listar cursos` | `listar_cursos` |
| `MCP · Buscar comisiones` | `buscar_comision` |
| `MCP · Detalle de comisión` | `detalle_comision` |
| `MCP · Aranceles de comisión` | `detalle_comision` con `incluir_aranceles` |
| `MCP · Estado de persona` | `estado_de_persona` *(se crea cuando dirección apruebe la PII)* |

**Por qué reutilizar y no crear una tabla nueva:** un solo sistema de permisos, administrado donde ya se administran los roles, con la pantalla que el equipo ya conoce. Es el principio de este diseño: dos sistemas de permisos siempre divergen.

**Cuatro reglas que lo hacen seguro:**

1. **Lista blanca de roles habilitados.** `ROLES` es un catálogo compartido con los roles de comisión (**1 = Estudiante, 2 = Profesor**). La pantalla de privilegios permitiría asignarle un privilegio `MCP · …` al rol Estudiante, y eso habilitaría el agente para todos los estudiantes. `resolver_acceso` **ignora cualquier privilegio `MCP · …` de un rol fuera de la lista blanca** (hoy: 3 Secretaría académica y 4 Administrador del sistema), aunque la fila exista. Hoy la lista blanca es **{3, 4}** (§3.4).
2. **Se resuelve por `nombre`, no por `id_privilegio`.** El id es IDENTITY y puede cambiar entre entornos; la propia documentación del CRM advierte que `evaluar_acceso(id)` solo sirve con ids fijos. `resolver_acceso` busca los privilegios cuyo `nombre` empieza con `MCP · `.
3. **Se respeta `PRIVILEGIOS.activado`.** `Evaluar_Privilegio` **no lo mira** (verificado). `resolver_acceso` sí: desactivar `MCP · Detalle de comisión` apaga esa tool para todos al instante. Funciona como interruptor por tool.
4. **No se usa `evaluar_acceso(1)`** ni ningún privilegio existente del backoffice como permiso del agente. El 1 es "Ingreso al sistema" y lo tienen estudiantes y profesores.

> ⚠️ **Lo que se pierde frente a una tabla propia:** `ROLES_PRIVILEGIOS` **no registra quién otorgó o quitó un privilegio ni cuándo**. Para el piloto se acepta. Si dirección necesita esa traza, se agrega una tabla de historial o un trigger, sin cambiar el modelo.

---

## 4. Contrato de `/api-mcp`

### 4.1 Principios

- **Endpoint propio**, con handler propio. Precedente en el repo: `/api-presencia` (21/09/2026). No comparte dispatcher con `/api`.
- **Estilo RPC** (`POST` con `action` en el cuerpo), igual que `/api`, para que el CRM reutilice su forma de trabajar.
- **Errores en JSON con su status real.** `404` para "no existe" cuando se pide algo por id.
- **Datos, no presentación:** `null` en vez de `"S/D"`, sin `UPPER`, fechas ISO 8601, números como números, montos como número (el `"GRATIS"` es un `0`), nombres de campo en `snake_case` sin tildes.
- **Solo los campos que usan las tools.** Lo que el MCP no proyecta no sale de la base (`bot_contexto_*`, enlace de WhatsApp, instituciones).
- **Paginación** en toda colección.
- **Mismas reglas de negocio que el resto del CRM.** Independiente en el contrato, no en las reglas. `/api-mcp` usa **la regla del catálogo del sitio**: estado 2 (inscripciones) + publicada + organización + país (`cursosAccesoDatos.vb:3815-3832`).
  - Hoy conviven **cuatro predicados distintos** de "comisión disponible" en el CRM. Unificarlos es correcto, pero toca el sitio público y la inscripción: **no es prerrequisito** de `/api-mcp` y va como trabajo aparte (decisión D3).
- **Handler de token, sin sesión.** Solo `IHttpHandler`: **no** `IRequiresSessionState` (serializa las requests de una misma sesión, y fue la razón del deploy del 21/09 que separó `/api-presencia` de `/api`). Tampoco se reutiliza la clase `ApiRequest` (35 propiedades `As Object`). El formato `{data}` / `{error}` requiere un `WriteJson` propio.

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
| `resolver_acceso` | `id_persona` (vía `X-Acting-Person`) | `{ activa, roles: [...], permisos: [...], concesiones_revocadas: [...] }`. `permisos` = privilegios `MCP · …` **activados**, de roles **de la lista blanca** (§3.5) |
| `registrar_eventos_auditoria` | lote de eventos (§5) | `{ recibidos }` |

**De datos** (con `X-Acting-Person`):

| Acción | Para la tool | Entrada | Notas |
|---|---|---|---|
| `cursos_disponibles` | `listar_cursos` | — | Sin `UPPER` forzado. Cada curso trae su `organizacion` (pedido el 24/09: sin ella hay nombres repetidos imposibles de distinguir) |
| `buscar_comisiones` | `buscar_comision` | `texto?`, `id_curso?`, `modalidad?`, `estados?`, `limit` (máx. 20), `cursor?` | Filtra en SQL, no en memoria. **La vigencia se define por estado, no por fecha**: sin `estados`, aplica la regla del catálogo (estado 2 + publicada). No hay corte por año calendario, que era una particularidad del SP de Prometheo. `COMISIONES` no tiene ventana de inscripción y `fecha_finalizacion` es fin de cursado y admite nulos, así que no sirve como criterio |
| `comision` | `detalle_comision` | `id_comision`, `incluir_aranceles?` | `404` si no existe. Incluye `estado` y `disponible` (bool, regla del catálogo) para que el MCP sepa si la comisión está en el mismo universo que la búsqueda. Estados: 1 nueva, 2 inscripciones, 3 cursando, 4 finalizada, 5 cancelada, 6 completa, 7 no listada |
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

Con `es_virtual` explícito, `localidad: null` significa "no aplica" en una comisión virtual y "falta el dato" en una presencial: la ambigüedad del `"S/D"` desaparece. `aranceles` solo viene si se pide, si la persona tiene el privilegio `MCP · Aranceles de comisión` **y** solo con los montos que la comisión marca para mostrar (D1).

**Tipos en la base** (confirmado por el CRM): los montos son `Money`, `duracion_meses` es `Int`, las fechas son `Date`. Todo el formateo (`"$ 29.000 (*...)"`, `"S/D"`, `UPPER`) lo arma el SP de Prometheo: `/api-mcp` **no convierte nada, solo deja de formatear**. `nota_promocion` sale de `motivo_bonificacion_*` (`NVarChar(200)`), texto cargado en el backoffice.

> ⚠️ **`COMISIONES` tiene flags de publicación de montos** (`mostrar_valor_inscripcion`, `mostrar_valor_cuota`, …), y en autogestión uno depende del estado administrativo de la persona (`CursosAccesoDatos.vb:7292-7295`). `/api` hoy los ignora (deuda heredada). Qué hace `/api-mcp` con ellos es la **decisión abierta D1** (§8.2).

---

### 4.4 En producción: el paso 1, medido (24/09/2026)

Deployado por la sesión green-cloud (CRM `main` = `bb5f6158`, SHA desplegado `4a4b1c36`). Contrato vigente: `documentacion/api/api-mcp-endpoint.md` en el repo del CRM. Cliente de servicio propio: **15 `mcp-api-mcp`**, separado del 14 que usa `/api`.

**Medido contra producción con el token del cliente 15:**

| Caso | Resultado |
|---|---|
| Sin token / token falso | `401` `invalid_service_token` |
| `GET` | `405` `method_not_allowed` |
| Token del cliente 14 | `403` `action_not_allowed`: los clientes están aislados |
| `comision` 2672 | `200` con `null` en vez de `"S/D"`, fechas ISO, números, `es_virtual`, `estado`, `disponible` |
| `comision` 2672 con aranceles | 6 montos numéricos y `nota_promocion`. **La certificación no sale**: la comisión la marca para no mostrarse (D1). `/api` la mostraba |
| `comision` inexistente | `404` `not_found` |
| `buscar_comisiones` `"produccion"` (sin tilde) | Encuentra `PRODUCCIÓN…`: la búsqueda ignora tildes y mayúsculas (`Modern_Spanish_CI_AI`, conserva la ñ) |
| `limit` 2 | `next_cursor` + `has_more` |
| `limit` 50 / acción desconocida | `400` `invalid_params` |

**Desvíos aceptados respecto de §4.3:** `charla_informativa` es `{fecha, hora}` sin enlace (texto libre fuera de la allowlist); `403` usa `action_not_allowed` mientras no haya persona; acción desconocida es `400`; `cursos_disponibles` no pagina pero devuelve `page`; `modalidad` se filtra por nombre; un monto oculto por D1 **no aparece** (no viaja como `null`); `nota_promocion` solo si la inscripción promocionada es visible; `moneda` fija `"ARS"`.

**Universo de datos:** la regla del catálogo trae **28 cursos y 28 comisiones de cuatro organizaciones**: 1 Fundación Educativa Saberes, 2 Terra - Instituto de Formación Agropecuaria, 3 Escuela de Recibidores de Granos de Paraguay y 4 Escuela de Recibidores de Granos de Uruguay. `/api` mostraba solo las dos primeras (14 cursos), porque el SP de Prometheo tiene `id_organizacion IN (1,2)` fijo.

**La casing de origen es despareja** ("Administración Agropecuaria" junto a "GESTIÓN CONTABLE APLICADA AL AGRO"). `/api-mcp` entrega el dato tal cual; normalizar para mostrarlo es presentación y queda en el MCP.

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

El MCP ve **llamadas a tools**, no la conversación: no sabe qué le preguntaron al modelo ni qué respondió. Registrar conversaciones depende de la app de chat y **solo lo ofrecen los planes Enterprise** (Claude Enterprise: audit logs y Compliance API; ChatGPT Enterprise: Compliance Logs Platform). Los planes Team/Business no lo incluyen (verificado el 24/09/2026).

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
| **Prompt injection desde datos del CRM** | **Allowlist explícita** de campos de texto libre que sí salen: `codigo`, `horarios`, `nota_promocion`, `pagina_web`. Todo otro texto libre (`bot_contexto_*`, `observaciones`, enlace de WhatsApp) no sale de la base. Tope de largo por campo. El agente no tiene herramientas de escritura, así que una instrucción inyectada no puede causar cambios |
| **Baja de una persona que sigue usando el agente** | `resolver_acceso` en cada llamada con caché de hasta 5 min |
| **App de chat no autorizada** | Lista explícita de `client_id`; sin DCR |
| **Bug de permisos en el MCP** | El CRM re-chequea en `/api-mcp` con `X-Acting-Person` |
| **Se pierden eventos de auditoría** | Archivo local append-only antes de enviar al CRM |
| **Superficie nueva en un servidor sin parches** | Riesgo ya aceptado en la v2.5 de la propuesta; `/mcp-autorizar` y `/api-mcp` son la superficie nueva del CRM y deben pasar revisión propia |

---

### 6.1 `/mcp-autorizar` y el defecto de postbacks del CRM

Es **el punto de seguridad más delicado del diseño**. El botón "Autorizo" de `/mcp-autorizar` es un postback, y el CRM tiene un defecto transversal ya conocido: los controles de acceso se hacen solo en `Page_Load`, el redirect no termina la request y los handlers corren igual (87 code-behinds, unos 1160 handlers, solo 11 re-chequean). `security_check()` no lo compensa: solo filtra IPs.

Si `/mcp-autorizar` siguiera el patrón mayoritario, **una persona autenticada podría forjar un consentimiento**, y ese consentimiento emite el código que se canjea por identidad.

**Reglas obligatorias para esa página:**

1. El handler del botón **vuelve a validar la sesión adentro del handler**, no solo en `Page_Load`. Moldes correctos del repo: `modulos/informes/mostrar_informe.aspx.vb:340-344` y `metricas_lead_magnet.aspx.vb:30-53`.
2. El `id_persona` se toma de la sesión **dentro del handler**. Nunca de un campo oculto, del ViewState ni de la query string.
3. El `state` y el `client_id` que vienen del MCP se validan contra lo que el MCP registró, y el código emitido queda atado a ese `state`.
4. **Revisión de seguridad dedicada** antes de deployar el paso 2.

> Este defecto sale de un análisis estático del CRM: nadie lo explotó. Pero afecta exactamente la página que emite identidad, así que se trata como requisito, no como mejora.

---

## 7. Qué construye cada lado

| CRM | MCP |
|---|---|
| Handler `/api-mcp` con el contrato de §4 | Servidor de autorización: `/authorize`, `/token`, `/revoke`, metadatos RFC 8414 |
| Página `/mcp-autorizar`: sesión del CRM + consentimiento + código de un uso | Metadatos RFC 9728 y 401 con `WWW-Authenticate` en `/mcp` |
| Tabla de códigos de un uso y de concesiones | Almacén de tokens (hashes) |
| **`/mcp-autorizar` con el re-chequeo dentro del handler** (§6.1) | |
| Script SQL versionado con los privilegios `MCP · …` (sueltos) y su asignación inicial a roles, usando la pantalla de privilegios existente | Resolución de acceso efectivo, filtrado de `tools/list`, chequeo en cada `tools/call` |
| Pantalla "mis conexiones" (revocar) | Envío de `X-Acting-Person` a `/api-mcp` |
| Tabla `MCP_AUDITORIA` | Archivo de auditoría local + envío por lotes |
| Marca en `SERVICIOS_API` para clientes que pueden actuar en nombre de personas | Transporte Streamable HTTP (hoy es stdio) |
| Vista o función SQL única de "comisión disponible" | Migración de las tools a `/api-mcp` |

**Orden sugerido**

1. `/api-mcp` con `cursos_disponibles`, `comision` y `buscar_comisiones`, todavía con el token de servicio y sin `X-Acting-Person`. Las tools migran y la capa accidental del MCP desaparece.
2. Identidad: `/mcp-autorizar`, `canjear_codigo_autorizacion`, OAuth del MCP, transporte HTTPS. Un piloto con una persona.
3. Permisos: privilegios `MCP · …` en `PRIVILEGIOS`, `resolver_acceso`, `X-Acting-Person` obligatorio.
4. Auditoría: archivo local, `registrar_eventos_auditoria`, `MCP_AUDITORIA`.
5. Dashboard en el CRM.

> Los pasos 2 a 4 van juntos a producción: **no se habilita a más de una persona hasta que identidad, permisos y auditoría estén los tres**.

**Estimación del CRM** (unidades de trabajo, no horas):

| Paso | Estimación | Notas |
|---|---|---|
| 1. `/api-mcp` con las 3 lecturas | **2-3 sesiones** | Sin migración ni ventana de caída. Sube a 4-5 si se decide unificar "comisión disponible" con el sitio. **El tramo más barato y el de más valor** |
| 2. `/mcp-autorizar` + canje + tablas | **3-4 sesiones** | Migración aditiva. **Con revisión de seguridad dedicada**, porque emite identidad y lo toca el defecto de postbacks (§6.1) |

Recomendación del CRM, que coincide con este orden: **el paso 1 completo y andando antes de empezar el 2**.

**Deploy del lado CRM:** tablas `MCP_*` y columnas nuevas son **aditivas** y van antes del upload, sin ventana de caída. Orden estricto: aspx → Web.config → PDB → modelo → Negocio → Saberes. Las páginas nuevas se registran en `Aplicacion.vbproj` o no se publican.

---

## 8. Contraste con el CRM (24/09/2026)

Respondido por la sesión green-cloud, solo lectura, a partir del código del CRM. **Nada se midió contra producción** y los mapeos reales de roles en producción no están verificados.

### 8.1 Respuestas

| # | Pregunta | Respuesta | Dónde impacta |
|---|---|---|---|
| 1 | Roles y "activa" | Persona ↔ rol en `PERSONAS_ROLES`; puede tener varios. **`ROLES` es un catálogo compartido con los roles de comisión** (1 = Estudiante, 2 = Profesor). "Activa" = `USUARIOS.activado` y no `PERSONAS.borrada`, **que la sesión no revalida** | §2.6, §3.5 |
| 2 | Sesión en `/mcp-autorizar` | **Sí.** La autenticación de formularios cubre todo el sitio: `validar_session_actual(True)` + `recuperar_usuario_logueado_actual().id_persona`. Con el defecto de postbacks en cuenta | §6.1 |
| 3 | `/api-presencia` como molde | **Sí, con restas:** sin `IRequiresSessionState`, sin la clase `ApiRequest`, con un `WriteJson` propio | §4.1 |
| 4 | "Comisión disponible" | **Por estado, no por fecha.** Catálogo = estado 2 + publicada + org + país. Conviven 4 predicados; unificarlos va aparte | §4.1, §4.3, D3 |
| 5 | Reglas de datos por persona | **No existen por organización.** Sysadmin y secretaría ven todas | §3.3, D2 |
| 6 | Montos | `Money`, `Int`, `Date` en la base; el formato lo arma el SP. La nota sale de `motivo_bonificacion_*` | §4.3, D1 |
| 7 | Deploy | Nada bloquea: todo es aditivo. Registrar páginas en `Aplicacion.vbproj`. El `DEPLOY.lock` es local a cada máquina, no coordina entre personas | §7 |

### 8.2 Decisiones abiertas de Max

Decididas por Max el 24/09/2026, siguiendo la recomendación en los tres casos.

| # | Decisión | Opciones | **Decidido** |
|---|---|---|---|
| **D1** | **Flags de publicación de montos.** ¿El privilegio de aranceles alcanza para ver un monto que el negocio marcó como "no mostrar"? | (a) El permiso alcanza: el agente es una herramienta interna. (b) Se respetan siempre los `mostrar_valor_*` | ✅ **(b)**: se respetan los `mostrar_valor_*` de cada comisión. Si el negocio decidió no mostrar un valor, el agente tampoco |
| **D2** | **Alcance por organización.** Hoy nadie del staff está acotado a una organización | (a) Sin acotar, como hoy en el CRM. (b) Modelar organización por persona o rol | ✅ **(a)**: sin acotar, como hoy en el CRM. (b) solo si aparece un caso real. **Alcance del agente: las cuatro organizaciones del catálogo** (Max, 24/09); cada curso y comisión dice de qué organización es |
| **D3** | **Unificar "comisión disponible"** en el CRM (4 predicados) | (a) Ahora, dentro del paso 1 (4-5 sesiones). (b) Aparte, después | ✅ **(b)**: aparte, después. `/api-mcp` usa la regla del catálogo |

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
