# Propuesta: Integración de Agentes de IA en la Organización

**Fecha:** Septiembre 2026
**Estado:** Propuesta de viabilidad — revisada contra el código del CRM y verificada contra el servidor de producción
**Versión:** 2.3
**Revisión de protocolo MCP:** 2026-07-28
**Área piloto definida:** Secretaría Académica

---

## Cambios respecto de versiones anteriores

La v1.5 se escribió en julio de 2026 sin relevar el código de Saberes-Terra. Esta revisión corrige el documento contra dos fuentes: el estado real del ecosistema MCP a septiembre de 2026, y un relevamiento directo del repositorio del CRM.

### Correcciones de la v2.3 — contrato real de las acciones de la API

Se leyó el contrato exacto de las 7 acciones candidatas en `api_saberes.vb`. **La lista blanca se reduce de 7 a 4.**

| # | Hallazgo | Consecuencia |
|---|---|---|
| A | `recuperar_clases_x_comision` **no filtra por organización**: alcanza terra, ERGCBA, ERGPY y ERGUY con un `id_comision` secuencial | **Excluida.** Riesgo 4 |
| B | `verificar_estudiante` y `recuperar_comisiones_x_dni` exigen `telefono_origen` como **2FA real**, que un MCP Server no puede acreditar | **Excluidas.** Se degradaría un control existente |
| C | En `recuperar_comisiones_disponibles`, el parámetro `id_curso` **no reduce la carga en la base**: filtra en memoria tras materializar todo el año | Caché obligatoria con TTL 5-15 min |
| D | En las 4 acciones aprobadas, "no encontrado" devuelve **HTTP 200 con `data: null`**, no 404. Otros handlers de la API sí usan 404 | Las tools evalúan `data`, no el status |
| E | El alta de clientes API tiene **pantalla de sysadmin**; el token se muestra una sola vez | No hace falta SQL manual |
| F | PII: solo **1 de las 4** acciones aprobadas devuelve nombre y apellido | Riesgo 5 |

### Correcciones de la v2.2 — verificación directa en producción (14/09/2026)

Se accedió por SSH al servidor de producción y se consultó el sistema operativo directamente. Los resultados son peores que la hipótesis de la v2.1.

| # | Verificación | Resultado |
|---|---|---|
| A | Sistema operativo | **Windows Server 2012 R2 Standard**, build 9600, 64-bit. Confirmado, sin ambigüedad |
| B | Último parche de seguridad instalado | **KB5031003, 9 de noviembre de 2023.** No hay parches posteriores |
| C | ¿Está inscripto en el programa ESU? | **No.** El servidor lleva ~34 meses sin actualizaciones de seguridad |
| D | Motor de base de datos | **SQL Server 2016 Express Edition** 13.3 — soporte extendido finalizado el 14/07/2026 |
| E | Disco del sistema (C:) | **89,7 % ocupado**, 3,5 GB libres |
| F | Recursos | 4 vCPU, 8 GB RAM |

El área piloto queda definida: **Secretaría Académica**.

### Correcciones de la v2.1 — relevamiento del CRM

| # | Qué cambió | Impacto |
|---|---|---|
| 1 | **La API ya existe.** 39 acciones RPC con autenticación por token y permisos por acción. | **Baja la estimación de esfuerzo de forma sustancial** |
| 2 | **Las contraseñas de `USUARIOS` son 3DES reversibles, no hash.** | Bloquea el IdP federado. Se reprograma a Fase 2 con un prerrequisito duro |
| 3 | El sistema operativo del servidor no estaba confirmado en la documentación interna. | Resuelto en la v2.2 por verificación directa |
| 4 | **SQL Server Express** con tope de 10 GB, 1 GB de buffer pool y sin Agent. | Restricciones duras de diseño para las consultas del agente |
| 5 | El "estado de lanzamiento de un curso" **no existe** como funcionalidad. | Sale de Fase 1; se propone construirlo en el CRM, no en el MCP |
| 6 | "Comisión de venta" (el %) **no se encontró** como entidad. | Sale del alcance hasta confirmación |
| 7 | El token de Moodle de producción solo tiene habilitadas funciones de cohortes. | Condiciona cualquier tool que lea Moodle |

### Correcciones de la v2.0 — ecosistema MCP

| # | Qué cambió | Impacto |
|---|---|---|
| 8 | **MCP avanzó tres revisiones** (2025-06-18 → 2025-11-25 → 2026-07-28). El protocolo ahora es stateless. | Arquitectura y despliegue |
| 9 | **Dynamic Client Registration quedó deprecado** en favor de Client ID Metadata Documents. | Diseño de autenticación (Fase 2) |
| 10 | **ChatGPT Plus no soporta conectores custom.** Requiere Pro, Business, Enterprise o Edu. | Costos |
| 11 | Se recorta el alcance: la capa de memoria (Mem0) sale de la Fase 1. | Plan de implementación |
| 12 | El MCP Server se define en Node.js, alineado con los microservicios existentes. | Decisión de stack |

---

## Índice

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Situación Actual](#situación-actual)
3. [Problema a Resolver](#problema-a-resolver)
4. [Solución Propuesta](#solución-propuesta)
5. [¿Por qué MCP y no APIs directas?](#por-qué-mcp-y-no-apis-directas)
6. [El protocolo MCP hoy (revisión 2026-07-28)](#el-protocolo-mcp-hoy-revisión-2026-07-28)
7. [Arquitectura del Sistema](#arquitectura-del-sistema)
8. [Componentes del Sistema](#componentes-del-sistema)
   - [2b. Diseño de las tools: de acción RPC a herramienta de agente](#2b-diseño-de-las-tools-de-acción-rpc-a-herramienta-de-agente)
9. [Configuración Inicial y Puesta en Marcha](#configuración-inicial-y-puesta-en-marcha)
10. [Autenticación, Permisos y Auditoría](#autenticación-permisos-y-auditoría)
11. [Casos de Uso por Área](#casos-de-uso-por-área)
12. [Infraestructura y Costos](#infraestructura-y-costos)
13. [Comparativa con Alternativas](#comparativa-con-alternativas)
14. [Plan de Implementación](#plan-de-implementación)
15. [Riesgos y Mitigaciones](#riesgos-y-mitigaciones)
16. [ROI Esperado](#roi-esperado)
17. [Decisiones Pendientes](#decisiones-pendientes)

---

## Resumen Ejecutivo

Se propone integrar agentes de inteligencia artificial en las distintas áreas de la organización (marketing, ventas, académica, administración) de manera que operen directamente sobre nuestro sistema de gestión (Saberes-Terra), sin construir un chatbot interno ni un frontend propio.

**La idea central:** cada persona del equipo utiliza una aplicación de chat con IA ya existente (ChatGPT o Claude) que se conecta a nuestros sistemas a través de un protocolo estándar abierto (MCP).

**El hallazgo que cambia la ecuación:** Saberes-Terra **ya tiene una capa de API con autenticación por token y permisos granulares por acción**. La Fase 1 no requiere construir esa capa: requiere dar de alta un cliente API nuevo, acotado a lectura, y escribir el MCP Server que lo consume. Buena parte de las herramientas iniciales no necesitan **ni una línea de código nuevo en el CRM**.

**Alcance de la primera fase:** deliberadamente acotado. Un MCP Server con herramientas de solo lectura, autenticación máquina-a-máquina, y un área piloto. Sin capa de memoria, sin orquestador, sin operaciones de escritura, sin identidad por usuario final.

**Inversión estimada:** $7 USD/mes de infraestructura nueva, más las suscripciones de chat que ya se pagan, más las horas de desarrollo interno.

**Dos temas que exceden esta propuesta y requieren decisión de dirección:**
1. Determinar con certeza el sistema operativo del servidor de producción. Si es Windows Server 2012, queda sin soporte de seguridad el **13 de octubre de 2026**.
2. Las contraseñas de usuario están almacenadas con cifrado reversible. Es un defecto de seguridad preexistente que además bloquea la evolución natural de este proyecto.

Ver [Riesgos](#riesgos-y-mitigaciones).

---

## Situación Actual

### Lo que tenemos

**Saberes-Terra**: CRM propio desarrollado internamente que gestiona personas, comisiones y cursos, cobros y facturación, campañas de email, integración con Moodle, y autogestión de estudiantes.

| Componente | Detalle | Evidencia |
|---|---|---|
| **Framework** | .NET Framework 4.8, ASP.NET WebForms, VB.NET | `ConIgCba/Aplicacion.vbproj:16` |
| **Base de datos** | **SQL Server 2016 Express Edition** 13.3.6485.1 — ⚠️ fuera de soporte desde el 14/07/2026 | Verificado en producción, 14/09/2026 |
| **ORM** | LINQ to SQL | `modelo/Modelo.dbml` |
| **Hosting** | VPS DonWeb, 4 vCPU / 8 GB RAM / 40 GB SSD | `infraestructura-y-caidas.md:15-26` |
| **Sistema operativo** | ⚠️ **Windows Server 2012 R2 Standard** (build 9600) — sin parches desde 11/2023 | Verificado por SSH en producción, 14/09/2026 |

**Una capa de API RPC ya operativa**, con 39 acciones, autenticación por token y permisos por acción. Documentada en `documentacion/api/api-saberes-endpoints.md`.

**Una capa de microservicios en Node.js**, detrás de nginx, con exposición por subdominios. Este es el patrón de despliegue que ya opera el equipo.

**Equipo técnico** con capacidad de exponer APIs y administrar infraestructura.

### Restricciones de infraestructura que condicionan el diseño

Estas no son advertencias genéricas: son límites medidos que afectan decisiones concretas de este proyecto.

| Restricción | Valor | Consecuencia para el MCP Server |
|---|---|---|
| **Tope de base SQL Express** | 10 GB | No agregar volumen de datos significativo |
| **Buffer pool de SQL Express** | ~1 GB de RAM | **Una consulta pesada de un agente puede degradar el CRM de producción** |
| **Sin SQL Server Agent** | — | Todo lo periódico va por Task Scheduler |
| **Disco del sistema (C:)** | **89,7 % ocupado** — 3,5 GB libres | Cualquier log o dato nuevo necesita justificarse |
| **App y base en el mismo VPS** | — | Si cae uno, cae el otro. Sin aislamiento |

**Regla de diseño derivada:** todas las tools del MCP Server llevan paginación obligatoria, límite máximo de resultados y timeout corto, desde el día uno. No es optimización prematura: es protección de un motor con 1 GB de buffer pool sirviendo producción.

### Cómo se usa la IA hoy

Cada área utiliza IA de forma aislada e individual: se abre ChatGPT o Claude para redactar un email, se genera contenido copy-pasteando entre el chat y el CRM, se consultan ideas de marketing. No hay integración con los sistemas internos.

---

## Problema a Resolver

1. **Desconexión entre IA y operaciones**: la IA no sabe qué cursos tenemos, cuántos inscriptos hay, ni qué campañas están activas.

2. **Falta de visibilidad transversal**: para saber si "está todo listo" para un curso nuevo hay que preguntar área por área.

3. **Coordinación manual entre áreas**: cuando se lanza un curso, alguien tiene que verificar manualmente que marketing armó la campaña, que ventas configuró lo suyo, que académica subió el material.

4. **Tareas repetitivas**: redactar emails de campaña, verificar requisitos de lanzamiento — tareas estructuradas que se repiten con cada comisión nueva.

---

## Solución Propuesta

### Concepto General

Conectar una aplicación de chat con IA a Saberes-Terra a través de MCP, de manera que los agentes puedan consultar datos en tiempo real, y —en fases posteriores— ejecutar operaciones controladas y coordinar entre áreas.

### ¿Qué es MCP?

MCP (Model Context Protocol) es un protocolo abierto que permite conectar aplicaciones de IA con sistemas externos de forma estandarizada. Es el equivalente a un "USB" entre la IA y tus sistemas.

### ¿Qué NO construimos?

- **No construimos un chatbot** dentro de Saberes
- **No construimos una interfaz de chat** — usamos apps existentes
- **No reescribimos Saberes** — agregamos una capa encima
- **No construimos la API** — ya existe
- **No dependemos de un proveedor** — MCP es un protocolo abierto

### Alcance de la Fase 1

| Componente | v1.5 | v2.1 | Motivo del cambio |
|---|---|---|---|
| MCP Server + tools de lectura | Fase 1 | **Fase 1** | Núcleo de la propuesta |
| Autenticación máquina-a-máquina | — | **Fase 1** | Ya existe en el CRM, es gratis |
| Auditoría | Fase 1 | **Fase 1** | Requisito para operar sobre datos reales |
| **Identidad por usuario final (IdP)** | Fase 1 | **Fase 2** | Bloqueado por el esquema de contraseñas |
| Operaciones de escritura | Fase 1 | Fase 2 | Primero validar lectura con usuarios reales |
| Estado de lanzamiento de curso | Fase 1 | Fase 3 | No existe; hay que construirlo en el CRM |
| Mem0 + Qdrant + PostgreSQL | Fase 0 | Fase 4, si se justifica | Infraestructura pesada para necesidad no confirmada |
| Agente orquestador | Fase 3 | Fase 4 | Depende de que las áreas ya usen sus agentes |

---

## ¿Por qué MCP y no APIs directas?

**Una API** es un contrato técnico: "mandame un POST con estos campos". El que llama tiene que saber exactamente qué invocar, con qué parámetros, en qué orden.

**MCP** es una capa de significado arriba de eso. Le dice a la IA: "tenés una herramienta que se llama `consultar_comision`, sirve para traer los datos de una comisión, necesita un ID". La IA entiende qué hace, cuándo usarla, y cómo combinarla con otras.

| Aspecto | API directa | MCP |
|---|---|---|
| **Quién decide qué llamar** | El código, hardcodeado | La IA, según la conversación |
| **Quién arma los parámetros** | El desarrollador | La IA, desde lenguaje natural |
| **Quién combina operaciones** | El desarrollador | La IA (razonamiento) |

**Ventaja 1 — Configurás una vez, funciona en cualquier app.** Con MCP el servidor se configura una vez y cualquier app compatible se conecta sin cambios.

**Ventaja 2 — Seguridad centralizada.** El MCP Server es el punto único de control de permisos, auditoría y rate limiting.

**Ventaja 3 — Las tools se actualizan sin tocar las PCs.** Se agrega una tool en el server y todos la ven.

**Ventaja 4 — Contexto, no solo funciones.** MCP expone tools, resources y prompts.

### Relación entre MCP y la API existente

```
App de chat (ChatGPT / Claude)
    ↓ habla MCP (protocolo de IA)
MCP Server (capa nueva, Node.js, VPS Linux)
    ↓ habla el protocolo RPC de /api con X-Api-Token
API Saberes (api_saberes.vb — YA EXISTE)
    ↓ habla LINQ to SQL
SQL Server Express (Saberes-Terra)
```

La capa que agregamos es una sola: el MCP Server. Todo lo de abajo ya está construido y en producción.

---

## El protocolo MCP hoy (revisión 2026-07-28)

El protocolo cambió sustancialmente desde que se escribió la v1.5, y varias de esas decisiones simplifican nuestro despliegue.

### MCP es stateless

La revisión 2026-07-28 **eliminó las sesiones a nivel de protocolo**: no hay más header `Mcp-Session-Id` ni handshake de `initialize`. Cada request lleva su propia versión de protocolo y capacidades.

**Por qué nos conviene:** un servicio sin estado se despliega, se reinicia y se escala sin complicaciones. No necesita sticky sessions en nginx ni almacenamiento compartido. Encaja exactamente con el patrón de microservicios que el equipo ya opera.

### Transporte: Streamable HTTP

El transporte vigente es **Streamable HTTP**. El viejo HTTP+SSE quedó deprecado. Nuestro servidor expone un endpoint HTTPS y nada más.

Se eliminó la reanudación de streams interrumpidos: si se corta una respuesta, el cliente reintenta la request completa. En la práctica, **las tools deben ser idempotentes siempre que sea posible**, porque un reintento es escenario normal.

### `server/discover`

Los servidores deben implementar este RPC, que publica versiones de protocolo, capacidades e identidad. El SDK oficial lo resuelve; se menciona porque es obligatorio.

### Caché de listados

Los resultados de `tools/list` requieren `ttlMs` y `cacheScope` (`public` o `private`).

**Decisión de diseño:** nuestros listados se declaran `cacheScope: "private"`. Marcarlos `public` permitiría que un intermediario compartido sirviera a un usuario el listado de tools de otro.

### Multi Round-Trip Requests (MRTR)

Cuando el servidor necesita información adicional, devuelve un resultado `input_required`; el cliente reintenta la request original con las respuestas.

**Para qué nos sirve:** confirmaciones antes de operaciones sensibles, en Fase 2. "Vas a enviar esta campaña a 165 personas, ¿confirmás?"

### Funcionalidades deprecadas

No adoptar en diseño nuevo: **Roots**, **Sampling**, **Logging** (`logging/setLevel`), **HTTP+SSE**, y **Dynamic Client Registration**. El spec adoptó una política de deprecación con ventana mínima de doce meses, así que nada desaparece de un día para el otro — pero construir sobre algo deprecado es deuda desde el día uno.

---

## Arquitectura del Sistema

### Vista General — Fase 1

```
┌──────────────────────────────────────────────────────────┐
│                        PERSONAS                           │
│   Admin/Dirección    Marketing    Académica    Ventas     │
│         │                │            │           │       │
│         ▼                ▼            ▼           ▼       │
│    App de chat      App de chat   App de chat  App de chat│
└─────────┬────────────────┬────────────┬───────────┬───────┘
          └────────────────┴────────────┴───────────┘
                           │
                  HTTPS (Streamable HTTP)
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│           VPS Linux  ·  ia.nuestro-dominio.com            │
│                                                           │
│   ┌────────────────────────────────────────────────┐      │
│   │            nginx — TLS · rate limiting          │      │
│   └──────────────────────┬─────────────────────────┘      │
│                          ▼                                │
│   ┌────────────────────────────────────────────────┐      │
│   │        MCP Server  ·  Node.js 22 LTS            │      │
│   │                                                 │      │
│   │  · Tools de lectura, paginadas y con timeout    │      │
│   │  · Un cliente API por área (token propio)       │      │
│   │  · Auditoría de cada invocación                 │      │
│   │  · Stateless                                    │      │
│   └──────────────────────┬─────────────────────────┘      │
└──────────────────────────┼────────────────────────────────┘
                           │
              HTTPS + header X-Api-Token
                   (IP del VPS permitida)
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│     VPS Windows (DonWeb)  ·  Saberes-Terra — EXISTENTE     │
│                                                           │
│   ┌────────────────────────────────────────────────┐      │
│   │   POST /api  ·  api_saberes.vb                  │      │
│   │   · 39 acciones RPC                             │      │
│   │   · ValidarClienteApi() por acción              │      │
│   │   · Tabla SERVICIO_API: token + permisos        │      │
│   └──────────────────────┬─────────────────────────┘      │
│                          ▼                                │
│   ┌────────────────────────────────────────────────┐      │
│   │   SQL Server Express  ·  10 GB · 1 GB buffer    │      │
│   └────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────┘
```

### Por qué el MCP Server vive en un VPS Linux aparte

| Motivo | Detalle |
|---|---|
| **Runtime** | Node.js 18+ no soporta Windows Server 2012. Si el servidor resulta ser 2012, no hay forma de correrlo ahí con una versión soportada. |
| **Disco** | El VPS del CRM está al 88 % de ocupación. |
| **Aislamiento** | App y base ya comparten servidor sin aislamiento. No conviene agregar una tercera carga. |
| **Coherencia operativa** | Los microservicios de la organización ya corren en Node bajo nginx. |
| **Desacople** | Cuando Saberes migre de servidor, el MCP Server solo cambia la URL de su backend. |
| **Costo** | $7 USD/mes. |

**Aclaración honesta:** poner el MCP Server aparte **no aísla la base de datos**. Las consultas siguen pegando contra el mismo SQL Express de 1 GB de buffer pool. Lo que se aísla es la carga de proceso, no la de datos. La protección real contra degradación son los límites y timeouts de las tools.

### Flujo de Datos — Fase 1

```
1. La persona abre su app de chat con el conector de su área activo
2. La app llama a server/discover y tools/list
   → el MCP Server devuelve las tools del área correspondiente
3. La persona pide algo ("¿cuántos inscriptos tiene la comisión 2424?")
4. El modelo elige la tool y la invoca
5. El MCP Server llama a POST /api con la acción correspondiente
   y el X-Api-Token del cliente de esa área
6. El CRM valida token + permiso de acción, ejecuta y responde
7. El MCP Server registra la operación en auditoría y devuelve el resultado
```

### Dos capas de contexto

| Capa | Qué aporta | Dónde vive |
|---|---|---|
| **Instrucciones del área** | QUÉ es el agente, qué puede hacer, qué reglas sigue | MCP Server (prompts) + Custom Instructions de la cuenta |
| **Saberes API** (tiempo real) | QUÉ está pasando ahora | Base de datos de Saberes |

**Las instrucciones son las reglas. Saberes es la realidad.** Una tercera capa — la experiencia acumulada entre sesiones — se evalúa en Fase 4.

### El arranque en frío

Antes de conectarse, el modelo no sabe que existe Saberes. Eso se resuelve con las **Custom Instructions a nivel de cuenta**, que el administrador configura una vez para toda la organización en planes Team/Business o Enterprise.

Qué **no** funciona acá: un archivo `AGENTS.md` en un repositorio. Ese mecanismo lo leen las herramientas de coding, no las apps de chat de escritorio. Y el MCP Server no tiene acceso al sistema de archivos de las máquinas del equipo.

---

## Componentes del Sistema

### 1. API de Saberes — YA EXISTE

Esta sección reemplaza por completo la lista de endpoints inventada en versiones anteriores.

**Qué es:** una API **RPC sobre un único endpoint**, no REST.

| Aspecto | Detalle | Evidencia |
|---|---|---|
| **URL** | `POST https://<host>/api` — único verbo, el resto devuelve `405` | `ConIgCba/Web.config:48` |
| **Implementación** | `IHttpHandler` con dispatcher `Select Case data.action` | `ConIgCba/auxiliar/api_saberes.vb:49-163` |
| **Acciones** | 39 | dispatcher `:49-163` |
| **Documentación** | Completa, una por una | `documentacion/api/api-saberes-endpoints.md` |
| **Ejemplo de consumo** | En Python | `documentacion/api/api-excepciones-uso.md` |

**Contrato uniforme:**

```json
// request
{ "action": "recuperar_comision_x_id", "id_comision": 2424 }

// response
{ "result": "ok" | "error", "message": "...", "data": <obj|list|null> }
```

**Autenticación y permisos, ya implementados:**

- Header **`X-Api-Token`**
- Función `ValidarClienteApi(context, accion)` — `api_saberes.vb:506-545`
- Tabla **`SERVICIO_API`**: tokens cifrados (Simple3Des) + campo `acciones_permitidas` (CSV de acciones habilitadas)
- Capa de acceso: `Negocio/ServiciosApiAccesoDatos.vb:249,318-330`
- Generación de tokens desde sysadmin: `generar_token_cliente()` — `:331`
- **34 de las 39 acciones** ya pasan por esta validación

**Esto es lo que baja la estimación:** el modelo de permisos granulares por acción ya está construido y probado en producción. El MCP Server es simplemente un cliente API más.

**Dos advertencias:**

1. **El endpoint mezcla lectura y mutación.** Existen acciones como `eliminar_excepciones` o `conciliar_pago_planilla` en el mismo `/api`. La garantía de "Fase 1 solo lectura" **no la da el endpoint: la da la lista blanca en `acciones_permitidas`**. Ese es el control real y hay que auditarlo explícitamente.

2. **Hay una inconsistencia documental.** Un comentario en `api_saberes.vb:1838-1848` declara una acción como "sin autenticación", pero el código de `:1853` sí llama a `ValidarClienteApi`. Verificar con una prueba controlada antes de dar por cierto cualquiera de los dos.

**Acciones de lectura disponibles hoy** (extracto del dispatcher `:49-101`):

`recuperar_propuestas`, `recuperar_persona_comision`, `verificar_estudiante`, `recuperar_comisiones_x_dni`, `buscar_localidades`, `recuperar_plantilla_info`, `consultar_informe_pago`, `recuperar_comision_x_id`, `recuperar_clases_x_comision`, `recuperar_comisiones_disponibles`, `recuperar_cursos_disponibles`, `recuperar_plantilla_destinatario`, `recuperar_contactos_x_id_organizacion`, `recuperar_organizacion_x_id`, `recuperar_curso_x_id`, `recuperar_arancel_mesa_x_curso`, `recuperar_procedimientos`, `recuperar_procedimiento`, `recuperar_excepciones`, `recuperar_excepcion`, `mesa_ayuda_recuperar_tickets`.

### 2. MCP Server — a construir

**Tecnología:** **Node.js 22 LTS** con el SDK oficial de TypeScript.

**Por qué Node y no otro lenguaje:** los SDKs oficiales de TypeScript, Python, C# y Go están todos en Tier 1 y a paridad de features con la spec 2026-07-28. El protocolo dejó de ser el criterio de decisión. Lo que decide es quién mantiene el servicio: la organización **ya opera microservicios en Node**, con su pipeline de deploy, su monitoreo y su gente. Introducir un lenguaje distinto agregaría un servicio huérfano sin ganar nada. Como beneficio secundario, el SDK de TypeScript es el de mayor ecosistema de ejemplos.

Node 22 LTS tiene soporte hasta abril de 2027.

**Responsabilidades:**
- Publicar identidad y capacidades vía `server/discover`
- Exponer las tools del área, en orden determinístico y con `cacheScope: "private"`
- Traducir cada invocación de tool a una acción de `POST /api` con el token del área
- **Imponer paginación, límite de resultados y timeout en toda consulta**
- Registrar cada operación en auditoría
- Normalizar la respuesta RPC (`result`/`message`/`data`) a un resultado MCP

**Ejemplo de tool:**

```
Tool: consultar_comision
Descripción: "Devuelve los datos de una comisión de Saberes por su ID"
Parámetros:
  - id_comision (requerido): ID numérico de la comisión
Acción subyacente: recuperar_comision_x_id
Áreas con acceso: marketing, academica, ventas, admin
Límites: timeout 10s
```

### 2b. Diseño de las tools: de acción RPC a herramienta de agente

Esta sección responde la pregunta central de implementación: **si la API ya existe, ¿qué hace exactamente el MCP Server?**

La respuesta corta: **no es un proxy.** Si se expusieran las cuatro acciones tal cual, con sus nombres y parámetros originales, el sistema quedaría técnicamente conectado y prácticamente inutilizable. El MCP Server es una **capa de traducción**, y ahí está su valor real.

#### El recorrido completo de una consulta

```
1. Usuario:     "¿cómo viene la comisión de Perito en Córdoba?"
2. App de chat: envía el mensaje + el catálogo de tools al modelo
3. Modelo:      no ejecuta nada; devuelve una intención de llamada
                → buscar_comision({ texto: "Perito Córdoba" })
4. App de chat: ejecuta esa llamada contra el MCP Server (HTTPS)
5. MCP Server:  resuelve desde su caché, o hace POST /api con X-Api-Token
6. CRM:         responde { result: "ok", data: {...} }
7. MCP Server:  traduce — proyecta, renombra, normaliza, desambigua
8. App de chat: incorpora el resultado al contexto del modelo
9. Modelo:      redacta la respuesta en lenguaje natural
```

Tres consecuencias, que conviene tener presentes al leer el resto del documento:

**El modelo nunca ejecuta nada.** Solo solicita. Quien ejecuta es la aplicación de chat. Por eso los permisos viven en el servidor y no en las instrucciones: el modelo puede intentar invocar lo que sea, pero una tool que no existe para ese conector simplemente no se ejecuta.

**Una consulta rara vez es una sola llamada.** El usuario dice "Perito en Córdoba", no "2424". El ciclo 3–8 ocurre al menos dos veces: primero para resolver el identificador, después para traer el detalle.

**El paso 8 entrega datos, no respuestas.** La respuesta la redacta el modelo en el paso 9. Esa separación define responsabilidades: si el dato está mal, la falla es del CRM o de la traducción; si el dato está bien y la frase dice otra cosa, la falla es de interpretación del modelo. Por eso la auditoría registra **qué tool se invocó con qué parámetros**, no la conversación.

#### Por qué no se mapea una acción a una tool

La API de Saberes fue diseñada para un bot de WhatsApp y para consumidores máquina, que **ya saben qué identificador quieren antes de llamar**. Un agente conversacional empieza sin ese trabajo hecho.

> **Secretaría:** "¿En qué estado está Pérez en la comisión de Perito de Córdoba?"

Para responder con `recuperar_persona_comision` hacen falta `dni` e `id_comision`. La persona no dio ninguno de los dos. Si la tool exige `id_comision`, el modelo hará una de dos cosas, ambas malas: **inventar un número**, o pedirle a la secretaria un identificador que ella tampoco conoce.

Ese hueco entre "cómo habla la gente" y "qué exige la API" es lo que llena el MCP Server.

| La API piensa en | El agente piensa en |
|---|---|
| Identificadores numéricos | Nombres, fechas, lugares |
| Acciones técnicas | Tareas de trabajo |
| Respuestas completas (29 columnas) | Lo mínimo para responder |
| `200` + `data: null` como "no hay" | "No encontré eso, ¿quisiste decir…?" |
| `"S/D"` como string literal | Campo ausente |

#### Las tools se diseñan por tarea, no por endpoint

```
buscar_comision(texto)              ← resuelve el hueco de identificación
     "Perito Córdoba octubre" → [{ id: 2424, curso, sede, inicio }]

detalle_comision(id_comision)       ← ya con el ID resuelto

estado_de_persona(dni, id_comision) ← consulta operativa central

listar_cursos()                     ← vocabulario del dominio
```

**`buscar_comision` no requiere ninguna acción nueva en el CRM.** Se construye sobre `recuperar_comisiones_disponibles` cacheada: ese listado de todas las comisiones del año — que era un problema de performance — **se convierte en el índice de búsqueda local** del MCP Server. Se trae una vez cada 5 a 15 minutos, se mantiene en memoria, y el filtrado por texto ocurre ahí, sin tocar la base.

Los dos problemas se resuelven mutuamente: la caché exigida por la restricción de SQL Express es exactamente la estructura que hacía falta para la búsqueda.

Flujo resultante:

```
"¿Cómo está Pérez en Perito Córdoba?"
   │
   ├─ buscar_comision("Perito Córdoba")        ← desde caché, sin tocar la base
   │     → 2 candidatas: #2424 (15/10) y #2501 (03/11)
   │     → el agente pregunta cuál, o infiere por contexto
   │
   └─ estado_de_persona(dni, 2424)
         → "Efectiva, al día administrativamente"
```

En ningún momento se le pide un identificador al usuario.

#### Traducción de la forma de los datos

**Lo que devuelve `recuperar_comision_x_id`** — 29 campos, con tildes y guiones bajos, muchos con el literal `"S/D"`:

```
Estado_de_la_comisión, Institución_Gestora, Institución_Certificadora,
Institución_Capacitadora, Valor_de_la_inscripción_promocionada,
Valor_de_la_cuota_con_recargo, URL_MAPS, Carga_horaria_certificada, ...
```

**Lo que expone la tool:**

```json
{
  "id": 2424,
  "curso": "Perito Clasificador",
  "sede": "Córdoba",
  "inicio": "2026-10-15",
  "estado": "abierta",
  "modalidad": "presencial",
  "horarios": "Sábados 9 a 13"
}
```

Tres reglas de traducción, no negociables:

1. **Proyectar.** Solo los campos útiles para la tarea. Cada campo de más consume contexto del modelo y agrega ruido.
2. **Normalizar.** El literal `"S/D"` se convierte en campo ausente. Si un dato no existe, el modelo debe verlo ausente, no razonar sobre un string que puede terminar mostrándole al usuario.
3. **Renombrar.** `Estado_de_la_comisión` → `estado`. Nombres limpios, sin tildes, consistentes entre todas las tools.

#### Traducción de errores

La parte más fácil de subestimar. La API devuelve **HTTP 200 con `data: null`** cuando no encuentra nada. Si la tool traduce eso como "éxito, sin resultados", el modelo puede concluir que la persona no está inscripta.

Pero `data: null` encubre dos situaciones operativamente opuestas:

| Situación | Lo que debe recibir el modelo |
|---|---|
| El identificador no existe | "No existe la comisión 9902. Verificá el identificador." |
| Existe, pero la persona no figura | "La comisión 2424 existe; esa persona no figura inscripta." |

La capa de traducción debe desambiguarlas — si hace falta, con una segunda llamada de verificación. Es trabajo adicional, y es precisamente el trabajo que evita que el agente afirme algo falso con total seguridad.

#### Resumen del trabajo real del MCP Server

No se "exponen" los endpoints. Se escribe una capa que asume estas responsabilidades:

| Responsabilidad | Detalle |
|---|---|
| **Resolución de identidad** | De lenguaje natural a `id_comision`, vía índice cacheado |
| **Proyección** | De 29 campos a los 6-8 relevantes |
| **Normalización** | `"S/D"` → ausente; fechas a ISO; booleanos nulos explicitados |
| **Renombrado** | Nombres limpios y consistentes entre tools |
| **Desambiguación de errores** | Separar "no existe" de "existe pero vacío" |
| **Contención de carga** | Caché, paginación, límite de resultados, timeout |
| **Auditoría** | Registro de tool, parámetros, resultado y latencia |
| **Permisos** | Catálogo de tools filtrado por conector de área |

Es más trabajo que un proxy. Es la diferencia entre un sistema técnicamente conectado y uno que el área usa sin que haya que recordárselo.

> 📄 **El contrato exacto de las cuatro tools** — `inputSchema`, mapeo de campos, manejo de errores, diseño del índice cacheado y checklist de implementación — está en el documento complementario **`DISENO-TOOLS-MCP.md`**. Este documento define el *qué* y el *por qué*; aquel define el *cómo*.

### 3. Identity Provider — Fase 2, con prerrequisito

**Estado: pospuesto.** La v2.0 proponía federar un IdP (Logto/Keycloak) contra los usuarios de Saberes en Fase 1. El relevamiento del código lo desaconseja.

**El bloqueante:** las contraseñas de `dbo.USUARIOS` **no están hasheadas**. Están cifradas con 3DES simétrico, con la clave derivada del propio nombre de usuario:

```
Negocio/usuariosAccesoDatos.vb:548
  contraseña = encriptar(contraseña, nombreUsuario.PadLeft(8, "X"))
Negocio/usuariosAccesoDatos.vb:409
  Return desencriptar(consulta.FirstOrDefault.contraseña.Trim, ...)
```

Es **reversible**: existe `recuperar_contraseña(id_persona)` que devuelve la clave en texto plano. No hay salt, no hay función de derivación, no hay hash.

**Por qué esto bloquea el IdP:** si el IdP valida credenciales contra ese esquema, se propaga el defecto a un segundo sistema y a un VPS nuevo. La superficie de exposición crece en lugar de contenerse.

**Prerrequisito duro para la Fase 2:** migrar `USUARIOS.contraseña` a un hash con salt (bcrypt, PBKDF2 o Argon2). Es un cambio acotado —login, alta de usuario, cambio de clave, y una migración con doble escritura durante la transición— pero **no es gratis y debe estimarse por separado**. Meterlo escondido dentro de "integrar MCP" rompe la estimación y oculta un trabajo de seguridad que merece su propia aprobación.

**Qué hacemos mientras tanto:** ver la sección siguiente.

### 4. Aplicación de Chat (Harness)

**Comparativa actualizada:**

| Criterio | ChatGPT | Claude |
|---|---|---|
| **Conectores MCP remotos** | ✅ Vía Developer Mode | ✅ Sí |
| **Servidores locales (stdio)** | ❌ Solo HTTPS remoto | ✅ Sí |
| **Plan mínimo para conectores custom** | **Pro, Business, Enterprise o Edu** | Pro o Team |
| **Plus ($20/mes)** | ❌ **No soporta conectores custom** | — |
| **Toggle por conversación** | ❌ No nativo | ✅ Sí |
| **Gestión centralizada (admin)** | ✅ Business/Enterprise | ✅ Team/Enterprise |
| **Escritura (write actions)** | ✅ En beta para Business/Enterprise/Edu | ✅ Estable |
| **Apps/UI interactivas en el chat** | ✅ Sí | ❌ No |

**Corrección respecto de la v1.5:** el documento anterior asumía que ChatGPT Plus ($20/usuario) alcanzaba. No alcanza. Los conectores custom requieren Developer Mode, disponible desde Pro, Business, Enterprise o Edu.

**Nota sobre Developer Mode:** OpenAI lo presenta explícitamente como funcionalidad para desarrolladores que comprenden sus riesgos — inyección de prompts, errores del modelo en operaciones de escritura, servidores MCP maliciosos. En nuestro caso el servidor es propio y self-hosted, lo que acota el riesgo, pero conviene que el equipo lo sepa antes de habilitarlo.

**Recomendación:** que el área piloto use **Claude**. El toggle de conectores por conversación resuelve el escenario de uso mixto personal/laboral, y el soporte de escritura no está en beta. La decisión no es permanente: el mismo MCP Server sirve a ambas apps.

---

## Configuración Inicial y Puesta en Marcha

### En el VPS Linux (nuevo)

```
VPS Linux (Ubuntu 24.04 LTS)
├── MCP Server Saberes (Node.js 22 LTS)
│   ├── Tools de lectura por área
│   ├── Tokens de SERVICIO_API (uno por área)
│   └── Auditoría
└── nginx
    └── HTTPS (Let's Encrypt) + rate limiting
```

Un servicio y un reverse proxy. Nada más.

### En el servidor de Saberes (existente)

1. **Dar de alta los clientes API** desde sysadmin (`generar_token_cliente()`), uno por área piloto
2. **Cargar `acciones_permitidas`** con la lista blanca de acciones de lectura de cada área
3. **Permitir el tráfico** desde la IP del VPS Linux

**No se modifica una sola línea de la aplicación existente.** Esto es configuración, no desarrollo.

### En cada PC del equipo

1. Instalar la app de chat
2. Loguearse con la cuenta de la organización
3. Activar el conector de su área (si el admin ya lo publicó, aparece solo)

No se instala Node.js, Python ni ninguna dependencia.

> **Cambio respecto de la v1.5:** el documento anterior describía editar manualmente `claude_desktop_config.json` en cada máquina. Ese mecanismo es para servidores locales por stdio. Para un servidor remoto, el camino es agregarlo como **conector**, y en planes Team/Business/Enterprise el administrador lo publica centralmente. El onboarding no requiere tocar archivos.

---

## Autenticación, Permisos y Auditoría

### Fase 1: máquina a máquina, permisos por área

El MCP Server se autentica ante el CRM con un token de `SERVICIO_API`. No hay identidad de usuario final en esta fase.

**Cómo se logra diferenciación por área sin identidad de usuario:** se da de alta **un cliente API por área**, cada uno con su token y su lista blanca de acciones. Se publica **un conector distinto por área** en la app de chat. Marketing recibe el conector de marketing; ventas, el de ventas.

```
Conector "Saberes · Marketing"  → MCP Server → token MKT  → acciones de marketing
Conector "Saberes · Académica"  → MCP Server → token ACAD → acciones de académica
Conector "Saberes · Dirección"  → MCP Server → token DIR  → todas las de lectura
```

**Qué da esto:**

| ✅ Lo que sí resuelve | ⚠️ Lo que no resuelve |
|---|---|
| Separación real de permisos por área | La auditoría registra el área, **no la persona** |
| Cero código nuevo en el CRM | Si alguien recibe el conector equivocado, tiene los permisos de esa área |
| Las tools de otra área no existen para el usuario | No hay revocación individual: se revoca el área entera |
| Elimina el IdP del camino crítico | No sirve para operaciones de escritura |

**Esta es una solución de Fase 1, explícitamente transitoria.** Es adecuada para lectura con un equipo piloto chico, donde el conjunto de personas por área se conoce. **No es adecuada para escritura**, porque sin identidad individual no hay responsabilidad atribuible sobre una operación que modifica datos.

### Fase 2: identidad por usuario final

Requiere el IdP federado, que a su vez requiere la migración del esquema de contraseñas. El flujo objetivo:

```
1. La app intenta usar el MCP Server sin token
   → 401 con WWW-Authenticate indicando dónde está la metadata
     de recurso protegido (RFC 9728)
2. La app descubre el authorization server → nuestro IdP
3. La app se identifica mediante Client ID Metadata Document
4. Se abre el navegador → login con credenciales de Saberes
5. El IdP valida y emite un access token con el rol como claim
   y audiencia = nuestro MCP Server
6. El MCP Server valida firma, expiración y audiencia en cada llamada
```

**Sobre Client ID Metadata Documents:** en la revisión 2026-07-28, DCR quedó deprecado en favor de CIMD. Ambos funcionan durante la ventana de deprecación, y tanto ChatGPT como Claude soportan los dos. Con DCR, cada instalación se registra dinámicamente, generando un cliente nuevo por máquina; con CIMD, el cliente se identifica mediante una URL a su propio documento de metadata. **Recomendación:** elegir un IdP que ya soporte CIMD, con DCR como respaldo.

### Sobre el modelo de roles existente

El CRM **sí tiene** un modelo de roles en base de datos:

- `dbo.ROLES` (`Modelo.dbml:1916-1928`), `dbo.PERSONAS_ROLES` (N:M), `dbo.PRIVILEGIOS` + `dbo.ROLES_PRIVILEGIOS`, `dbo.VISTAS` + `dbo.VISTAS_ROLES`
- Roles concretos: estudiante, profesor, secretaría, sysadmin, interesado, cliente, coordinador, ayudante, proveedor, sin rol

**Advertencia relevante para Fase 2:** la documentación del propio CRM (`documentacion/convenciones/menu-y-control-de-acceso.md:3-8,82-119`) señala que el control de acceso real debe implementarse en cada `Page_Load`, y que ocultar el menú no protege la URL. Hay dos IDOR documentados en `documentacion/seguridad/` que lo confirman.

Traducción: **`ROLES_PRIVILEGIOS` es un insumo declarativo, no una garantía de enforcement.** Cuando el MCP Server consuma ese modelo en Fase 2, debe aplicar sus propias verificaciones y no asumir que el rol implica permiso efectivo.

### Auditoría

Cada invocación queda registrada en el MCP Server:

```
2026-09-14 14:30:00 | conector: marketing | consultar_inscriptos   | comisión 2424 | OK   | 340ms
2026-09-14 14:35:00 | conector: ventas    | listar_cursos          | -             | OK   | 120ms
2026-09-14 14:40:00 | conector: direccion | consultar_comision     | comisión 2424 | OK   | 210ms
2026-09-14 14:42:00 | conector: marketing | consultar_comision     | comisión 9902 | ERROR 403
```

En Fase 1 el registro identifica el **área**; en Fase 2, con identidad de usuario, identificará a la **persona**.

### Separación entre uso personal y laboral

**Claude** permite habilitar y deshabilitar conectores **por conversación individual**: un chat personal sin conector y uno laboral con conector, al mismo tiempo, sin cambiar de cuenta.

**ChatGPT** tiene el conector a nivel de aplicación. Las tools solo se invocan si el contenido lo amerita, pero no se puede desactivar por chat.

#### Caso de uso: el CEO que usa la app para todo

**Con Claude:**
```
9:00  — Chat 1 (conector ACTIVADO):    "¿Cómo van los cursos de octubre?"  → consulta Saberes
9:30  — Chat 2 (conector DESACTIVADO): "Estoy pensando en irme a Brasil"   → aislado
10:15 — Chat 2: "¿Hoteles buenos en Río?"                                  → sigue aislado
```

**Con ChatGPT:**
```
9:00  — Chat 1: "¿Cómo van los cursos de octubre?"  → consulta Saberes
9:30  — Chat 2: "Estoy pensando en irme a Brasil"   → no toca ninguna tool
10:15 — Chat 2: "¿Tengo algo pendiente?" (ambiguo)
        → PODRÍA interpretarlo como laboral e invocar una tool
        → riesgo bajo, pero no cero
```

| Escenario | App recomendada |
|---|---|
| **Solo uso laboral** (la mayoría del equipo) | Cualquiera |
| **Uso mixto personal + laboral** | Claude — toggle por conversación |
| **Se prioriza UI interactiva en el chat** | ChatGPT |

---

## Casos de Uso por Área

> **[F1]** = lectura, entra en Fase 1 · **[F2+]** = requiere escritura o desarrollo adicional

### Las 5 tools candidatas de Fase 1

Ordenadas por relación valor/esfuerzo, según el relevamiento del código:

| # | Tool | Qué reutiliza | Esfuerzo en el CRM |
|---|---|---|---|
| 1 | `consultar_comision` | acción `recuperar_comision_x_id` (`api_saberes.vb:1944`) | **Cero código** |
| 2 | `listar_cursos_y_comisiones` | `recuperar_cursos_disponibles` (`:1640`) + `recuperar_comisiones_disponibles` (`:1537`) | **Cero código** |
| 3 | `estadisticas_de_comision` | SP `sql/sp/sp_estadisticas_por_comision.sql:2-60` — total, efectivos, desertores, finalizados, egresados | Bajo — envolver el SP |
| 4 | `estado_de_estudiante` | `verificar_estudiante` (`:2210`) + `recuperar_comisiones_x_dni` (`:2343`) | **Cero código** ⚠️ devuelve PII |
| 5 | `plantel_de_comision` | `COMISIONES_PERSONAS` + `sql/sp/sp_comisiones_actuales_datos.sql` | Medio ⚠️ PII + decidir quién puede verlo |

Tres de las cinco no requieren **ninguna línea de código nueva en el CRM**: solo el grant en `acciones_permitidas`.

Otros stored procedures listos para envolver en fases siguientes: `sp_resumen_comision_detallado.sql`, `sp_pedidos_x_curso.sql`, `2026-05-13_sp_informes_pago_por_comision.sql`.

### Administración / Dirección

**[F1] Consultar estado de una comisión:**
> **Admin:** "¿Cómo viene la comisión 2424?"
>
> **Agente:** "Comisión 2424 — Perito, Córdoba. Inicio 15/10/2026. Cupo máximo 50, mínimo 20. 45 inscriptos: 38 efectivos, 4 desertores, 3 pendientes."

**[F3] Estado de lanzamiento** — ver advertencia abajo.

**[F4] Reporte diario consolidado.**

### Marketing

**[F1] Consultar inscriptos y cursos disponibles:**
> **MKT:** "¿Qué comisiones arrancan en octubre y cómo vienen de inscripción?"
>
> **Agente:** "4 comisiones en octubre: [listado con cupo e inscriptos de cada una]."

**[F2+] Crear campaña de email.**

### Secretaría Académica — ⭐ ÁREA PILOTO

Es el área seleccionada para la Fase 1. La elección es acertada por tres motivos: sus consultas más frecuentes son de lectura, el rol `secretaría` ya existe en el modelo de roles del CRM, y las acciones que necesita están entre las que **no requieren código nuevo**.

**[F1] Consultar el estado de un estudiante:**
> **Secretaría:** "¿En qué comisiones está la persona con DNI 30123456?"
>
> **Agente:** "Está inscripta en 2 comisiones: Perito Córdoba (2424, efectiva) y Martillero Tucumán (2511, desertora desde 08/2026)."

**[F1] Consultar el plantel de una comisión:**
> **Secretaría:** "¿Quiénes están inscriptos en la comisión 2424?"
>
> **Agente:** "45 personas: 38 efectivas, 4 desertoras, 3 pendientes. [listado paginado]"

**[F1] Verificar inscripción de un estudiante:**
> **Secretaría:** "¿Esta persona figura como estudiante activo?"
>
> **Agente:** [vía `verificar_estudiante`]

**[F1] Consultar clases y cronograma de una comisión:**
> **Secretaría:** "¿Qué clases tiene programadas la comisión 2424?"
>
> **Agente:** [vía `recuperar_clases_x_comision`]

**[F2+] Enviar credenciales de autogestión** — requiere escritura, llega en Fase 2.

#### Lista blanca aprobada para el cliente API de Secretaría Académica

Este es el artefacto de seguridad central de la Fase 1. La lista se redujo de 7 acciones candidatas a **4**, tras revisar el contrato real de cada una en el código.

**Valor exacto de `acciones_permitidas`:**

```
recuperar_cursos_disponibles,recuperar_comisiones_disponibles,recuperar_comision_x_id,recuperar_persona_comision
```

| Acción | Propósito | PII | Volumen |
|---|---|---|---|
| `recuperar_cursos_disponibles` | Listado de cursos (3 columnas) | No | ✅ Universo chico |
| `recuperar_comisiones_disponibles` | Listado de comisiones del año | No | 🔴 **Requiere caché — ver abajo** |
| `recuperar_comision_x_id` | Datos de una comisión | No | ✅ `.FirstOrDefault()` |
| `recuperar_persona_comision` | Estado de una persona en una comisión | ⚠️ Nombre y apellido | ✅ `.FirstOrDefault()` |

Una sola de las cuatro devuelve datos personales, y lo hace acotada por DNI + comisión. Cubre la consulta operativa central de Secretaría Académica: "¿en qué estado está esta persona en esta comisión?".

#### Las tres acciones que quedaron afuera, y por qué

**1. `recuperar_clases_x_comision` — 🔴 excluida: cruza organizaciones**

No filtra por `id_organizacion`. La misma llamada alcanza comisiones de terra, ERGCBA, ERGPY y ERGUY indistintamente: **no hay frontera entre instituciones**. Como `id_comision` es un entero secuencial, cualquier cliente con este grant puede recorrer el libro de temas de las cuatro instituciones — incluyendo `notas` internas de clase y nombre del profesor — simplemente iterando el identificador.

Está documentado como deuda técnica en `documentacion/convenciones/api-clases-comision-deuda-auth.md:26-28`. El commit `afbce514` cerró el acceso anónimo exigiendo `X-Api-Token`, pero **el aislamiento por organización nunca se implementó**. El token autentica, no asla.

*Condición para incorporarla:* implementar el filtro por organización **en el CRM**, cerrando la deuda de verdad. Una whitelist de `id_comision` en el MCP Server sería una barrera de conveniencia, no una frontera de seguridad, y no debe presentarse como control.

**2 y 3. `verificar_estudiante` y `recuperar_comisiones_x_dni` — ⚠️ excluidas: degradan un control de identidad**

Ambas exigen un parámetro `telefono_origen` y solo devuelven datos si coincide con el teléfono registrado de esa persona. No es un parámetro cosmético: es **verificación de identidad de dos factores**, diseñada para un bot de WhatsApp que conoce el número de quien escribe. El mensaje de fallo ni siquiera distingue "no existe" de "teléfono no coincide", deliberadamente, para no filtrar la existencia de personas.

**Un MCP Server no tiene un "teléfono de origen" natural.** Si la tool deja que el modelo o el usuario tipeen cualquier número, el control se convierte en un campo de formulario que se prueba hasta acertar. Se estaría desactivando una protección existente sin decirlo.

*Por qué no se pierde funcionalidad:* `recuperar_persona_comision` requiere DNI + `id_comision`, no lleva `telefono_origen`, y cubre la consulta de estado del estudiante que necesita Secretaría Académica.

#### Requisito de caché para `recuperar_comisiones_disponibles`

El parámetro `id_curso` **no reduce el trabajo de la base**. El stored procedure se ejecuta siempre con `@id_comision = NULL`, materializa todas las comisiones del año en curso con `.ToList()`, y recién después filtra **en memoria del app server** (`Negocio/CursosAccesoDatos.vb:12389-12421`). El parámetro ahorra ancho de banda hacia el cliente y **cero** carga en SQL Express.

Cada fila lleva subconsultas correlacionadas por fila y 29 columnas de texto.

**Obligatorio en el MCP Server:**
- Caché con TTL de 5 a 15 minutos (el dato cambia poco: son las comisiones del año)
- Límite duro de resultados y timeout corto
- Para el detalle de una comisión puntual, usar `recuperar_comision_x_id`, que sí está acotada

Sin caché, un agente que invoque esta tool en bucle degrada el CRM de producción.

### Marketing, Ventas y Dirección — fases posteriores

### Ventas

**[F1] Consultar estado de inscripción y pagos** (vía `consultar_informe_pago`).

**[F2+] Configurar comisiones de venta** — ver advertencia abajo.

### ⚠️ Dos casos de uso de la v1.5 que salen de alcance

**1. "Estado de lanzamiento de un curso" — no existe, hay que construirlo**

El relevamiento encontró lo siguiente:

- **Sí existe** un estado de control de comisión: `COMISION_ESTADO_CONTROL`, con `id_estado_control` y `explicacion_estado_control` en `COMISIONES` (`Modelo.dbml:352-460`), expuesto en `Negocio/CursosAccesoDatos.vb:5169-5178`.
- Pero la regla que lo calcula hoy es **una sola dimensión, económica**: `Negocio/estadisticasAcceso.vb:5-37` asigna estado `3` si los regulares no llegan al cupo mínimo, y `1` si sí llegan. No es el checklist multidimensional que describía la v1.5.
- **No existe** el checklist "¿tiene campaña? ¿tiene aula Moodle? ¿tiene plantel?". Los insumos están todos (`COMISIONES.mood_cohort` para el aula, `CAMPANA_*` para la campaña, `COMISIONES_PERSONAS` para el plantel), pero **la función que los compone hay que escribirla**.
- El archivo `boceto_estado_comision.html` en la raíz del repo es explícitamente **un boceto con datos mock**. No es funcionalidad existente.

**Recomendación de diseño:** ese cálculo debe vivir en la capa `Negocio/` del CRM y exponerse como una acción nueva de `/api`; el MCP Server solo lo consume. Si se implementa en el MCP Server, se duplican reglas de negocio en dos repositorios y dos lenguajes.

Existe además un change de OpenSpec **no implementado**, `salud-comisiones-crm`, que propone exactamente un módulo de salud de comisiones con semáforo. Conviene alinear ambos esfuerzos en lugar de duplicarlos.

**2. "Comisión de venta" (el porcentaje del vendedor) — entidad no encontrada**

No se encontró una entidad que modele comisiones de venta. Lo único cercano es `COMISIONES_PERSONAS.porcentaje_imputacion` (Float, `Modelo.dbml:481`), pero ni el nombre ni el tipo prueban esa semántica. En este dominio "comisión" significa casi siempre **cohorte**, no porcentaje de vendedor.

**Queda fuera de alcance hasta confirmación con el owner del dominio.** Los casos de uso de ventas de la v1.5 que dependían de esto se retiran del documento.

---

## Infraestructura y Costos

### Infraestructura necesaria

| Componente | Descripción | Ubicación |
|---|---|---|
| **VPS Linux** | MCP Server + nginx | Hetzner, DigitalOcean o Contabo |
| **Saberes-Terra** | CRM existente | VPS DonWeb actual (sin cambios) |
| **App de chat** | Una cuenta por persona | PC de cada usuario |

### Especificaciones del VPS nuevo

El recorte de alcance reduce sustancialmente los requisitos:

| Recurso | v1.5 (con Mem0 + IdP) | v2.1 (Fase 1) |
|---|---|---|
| **CPU** | 4 vCPU | 2 vCPU |
| **RAM** | 8 GB | 2 GB |
| **Disco** | 80 GB SSD | 40 GB SSD |
| **Sistema operativo** | Ubuntu 22.04+ | Ubuntu 24.04 LTS |
| **Costo** | $15–25 USD/mes | **$6–12 USD/mes** |

### Desglose de costos — Fase 1, equipo piloto de 5 personas

| Concepto | Detalle | Costo mensual |
|---|---|---|
| **VPS Linux** | Hetzner CX22 o similar | $7 USD |
| **App de chat** | 5 cuentas con soporte de conectores | $100–150 USD |
| **Dominio + SSL** | Let's Encrypt | $0 |
| **Total** | | **$107–157 USD/mes** |

### Escenarios de costo total

La organización paga hoy ChatGPT Plus ($20) + Claude Max ($100) = **$120 USD/mes**.

| Escenario | Detalle | Costo mensual | Diferencia vs. hoy |
|---|---|---|---|
| **Claude Pro × 5 + VPS** | 5 cuentas Pro ($20/u) + VPS. Sin gestión centralizada de conectores. | **$107 USD** | **−$13/mes** |
| **Claude Team × 5 + VPS** | 5 cuentas Team ($25/u) + VPS. Gestión centralizada, escritura estable. | $132 USD | +$12/mes |
| **ChatGPT Business × 5 + VPS** | 5 cuentas Business ($25–30/u) + VPS. Escritura en beta. | $132–157 USD | +$12 a +$37/mes |

**Corrección respecto de la v1.5:** el documento anterior planteaba escenarios a costo cero usando ChatGPT Plus. Ese escenario no es viable: **Plus no soporta conectores MCP custom**. El piso real para ChatGPT es el plan Business.

**Recomendación:** arrancar con **Claude Pro × 5 + VPS** ($107/mes, menos que hoy) para el piloto, y evaluar el salto a Team cuando la gestión centralizada de conectores lo justifique.

**El costo marginal real del proyecto es el VPS: $7 USD/mes.** El número relevante a evaluar no es la infraestructura sino **las horas de desarrollo interno** — y el hallazgo de que la API ya existe reduce esas horas de forma significativa.

---

## Comparativa con Alternativas

| Criterio | Nuestra propuesta | Microsoft Copilot Studio | Salesforce Agentforce | Desarrollo custom completo |
|---|---|---|---|---|
| **Costo mensual (10 usuarios)** | ~$210 USD | ~$300+/usuario ($3.000+) | $2/conversación + plataforma | ~$500+ hosting |
| **Control de datos** | Total (self-hosted) | Microsoft Cloud | Salesforce Cloud | Total |
| **Personalización** | Total | Limitada al ecosistema MS | Media | Total |
| **Tiempo de implementación** | **1–2 meses** (la API ya existe) | 1–3 meses | 2–4 meses | 6–12 meses |
| **Integración con Saberes** | Directa (API propia existente) | Conectores custom | Conectores custom | Directa |
| **Dependencia de proveedor** | Baja (protocolo abierto) | Alta | Alta | Ninguna |
| **Requiere reescribir Saberes** | No | No, pero difícil integrar | Sí (migrar a Salesforce) | No |

### ¿Por qué no las alternativas enterprise?

- **Copilot Studio / Agentforce**: pensados para empresas de 500+ personas que ya viven en sus ecosistemas. Para una organización con CRM propio y API ya construida, el costo de licencias y la complejidad de integración no se justifican.
- **Desarrollo custom completo**: innecesario. ¿Para qué construir un chat si ya existen? El esfuerzo se enfoca donde agrega valor: la conexión con Saberes.

---

## Plan de Implementación

### Fase 0 — Verificación y fundaciones (Semana 1)

- [x] ~~Determinar el sistema operativo real del servidor~~ — **hecho el 14/09/2026**: Windows Server 2012 R2, sin ESU. Ver [Riesgos](#riesgos-y-mitigaciones)
- [ ] **Escalar a dirección el estado de parcheo del servidor**, como tema independiente de este proyecto
- [ ] **Spike técnico:** MCP Server mínimo con una tool que envuelva `recuperar_comision_x_id`, validado de punta a punta contra la app de chat elegida
- [ ] Verificar la inconsistencia documental de `api_saberes.vb:1838-1853` con una prueba controlada
- [ ] Contratar el VPS Linux y configurar nginx + certificados
- [ ] Dar de alta el primer cliente `SERVICIO_API` con lista blanca de lectura
- [ ] Definir el área piloto

> El spike va primero porque valida los supuestos de autenticación y de soporte de la app antes de comprometer semanas de desarrollo. Si algo no funciona como esperamos, queremos saberlo en la semana 1.

### Fase 1 — Piloto de lectura (Semanas 2–5)

- [ ] Construir el MCP Server con las 5 tools candidatas
- [ ] Implementar paginación, límites y timeouts en todas las consultas
- [ ] Implementar auditoría
- [ ] Dar de alta un cliente `SERVICIO_API` por área, con su lista blanca
- [ ] Redactar los prompts de área y las Custom Instructions de la organización
- [ ] Pruebas con el equipo piloto e iteración según feedback

**Criterio de salida:** el área piloto usa el agente de forma espontánea durante dos semanas seguidas sin que haya que recordárselo.

### Fase 2 — Identidad y escritura (Semanas 6–12)

- [ ] **Prerrequisito: migrar `USUARIOS.contraseña` a hash con salt.** Estimar y aprobar por separado
- [ ] Desplegar el IdP federado contra el padrón de Saberes
- [ ] Migrar el MCP Server de token de servicio a validación de tokens de usuario
- [ ] Agregar tools de escritura con confirmación explícita vía MRTR
- [ ] Modo borrador para campañas antes del envío real
- [ ] Ampliar la auditoría para registrar payload e identidad individual

### Fase 3 — Estado de comisiones y expansión (Semanas 13–18)

- [ ] Implementar el cálculo de "salud de comisión" **en la capa `Negocio/` del CRM**, alineado con el change `salud-comisiones-crm`
- [ ] Exponerlo como acción nueva de `/api` y envolverlo como tool
- [ ] Incorporar las áreas restantes
- [ ] Confirmar y modelar "comisión de venta" si corresponde

### Fase 4 — Orquestador y memoria (Semanas 19+)

- [ ] Agente orquestador con visibilidad transversal
- [ ] Reportes automatizados y alertas proactivas
- [ ] **Evaluar si hace falta capa de memoria**, con evidencia de uso real: ¿qué se olvida el agente que debería recordar?

---

## Riesgos y Mitigaciones

### 🔴 Riesgo 1 — El servidor de producción lleva ~34 meses sin parches de seguridad

**Este riesgo es preexistente al proyecto, lo excede en gravedad, y requiere una decisión de dirección independiente de la propuesta de agentes.**

Verificado por acceso directo al servidor el 14/09/2026:

| Verificación | Resultado |
|---|---|
| Sistema operativo | Windows Server 2012 R2 Standard, build 9600 |
| Fin de soporte extendido del SO | **10 de octubre de 2023** |
| Último parche de seguridad instalado | **KB5031003 — 9 de noviembre de 2023** |
| Inscripción en el programa ESU | **No** — no hay parches posteriores a esa fecha |
| Tiempo sin actualizaciones de seguridad | **~34 meses** |
| Motor de base de datos | SQL Server 2016 Express |
| Fin de soporte extendido del motor | **14 de julio de 2026** — también vencido |

**Corrección importante respecto de la v2.1:** ese documento planteaba el 13/10/2026 como fecha límite, asumiendo que el servidor estaba cubierto por Extended Security Updates. **No lo está.** Esa fecha es el vencimiento para quienes sí contrataron ESU. Para este servidor la ventana de protección se cerró en noviembre de 2023.

Esto significa que el sistema que gestiona datos personales de estudiantes, cobros y facturación corre sobre un sistema operativo y un motor de base de datos que **no reciben correcciones de seguridad de ningún tipo**, y para los cuales existen vulnerabilidades públicas conocidas y sin parchear desde entonces.

**Cómo lo mitiga esta arquitectura:** poniendo el MCP Server en un VPS Linux separado, el proyecto de agentes **no agrega superficie de exposición** sobre el servidor vulnerable, no introduce un runtime nuevo ahí, y no queda atado a su calendario de migración.

**Lo que esta arquitectura NO resuelve, y hay que decir con todas las letras:** la migración de Saberes-Terra a una plataforma con soporte. Ese es un proyecto aparte, más urgente que este, y su postergación no se vuelve más segura porque el proyecto de agentes avance bien.

**Recomendación:** llevar este hallazgo a dirección esta semana, con estas fechas y esta evidencia, como tema separado del proyecto de IA.

### 🔴 Riesgo 2 — Contraseñas almacenadas con cifrado reversible

`dbo.USUARIOS.contraseña` usa 3DES simétrico con clave derivada del nombre de usuario (`Negocio/usuariosAccesoDatos.vb:409,548`). Cualquiera con acceso de lectura a esa tabla y al ensamblado `modelo.dll` puede recuperar todas las contraseñas en texto plano.

**Relación con este proyecto:** no lo causa ni lo agrava —la Fase 1 es máquina-a-máquina y no toca credenciales de usuario— pero **bloquea la Fase 2**. Federar un IdP contra ese esquema propagaría el defecto a un sistema nuevo.

**Mitigación:** migración a hash con salt (bcrypt/PBKDF2/Argon2) como prerrequisito explícito de Fase 2, estimado y aprobado por separado.

### 🟡 Riesgo 3 — Degradación del CRM de producción por consultas del agente

SQL Server Express tiene ~1 GB de buffer pool y comparte VPS con la aplicación. Una consulta pesada generada por un agente puede degradar el sistema para todos los usuarios.

**Mitigación:** paginación obligatoria, límite máximo de resultados y timeout corto en toda tool, desde la primera línea de código. Rate limiting en nginx. Monitoreo de tiempos de respuesta durante el piloto.

### 🔴 Riesgo 4 — La API no aísla organizaciones entre sí

Al menos una acción de `/api` — `recuperar_clases_x_comision` — **no filtra por `id_organizacion`**. La misma llamada alcanza comisiones de terra, ERGCBA, ERGPY y ERGUY indistintamente, y `id_comision` es un entero secuencial.

El commit `afbce514` cerró el acceso anónimo exigiendo `X-Api-Token` en 23 acciones que estaban abiertas. **Eso resolvió la autenticación, no el aislamiento.** Un cliente autenticado con grant para esa acción lee las cuatro instituciones.

Documentado en `documentacion/convenciones/api-clases-comision-deuda-auth.md:26-28`.

**Mitigación aplicada:** la acción queda **fuera** de la lista blanca del piloto. Las otras cuatro acciones aprobadas no presentan este problema.

**Acción de fondo pendiente:** implementar el filtro por organización en el CRM. Hasta entonces, **ninguna acción con este defecto debe entrar en la lista blanca de ningún cliente API**, sea del proyecto de agentes o de cualquier otro consumidor.

> **Nota de higiene documental:** el bloque `''' <remarks>` en `api_saberes.vb:1838-1848` sigue declarando la acción como "sin autenticación", describiendo el estado previo al commit `afbce514`. Corresponde actualizarlo, y separar en el doc de deuda lo que se cerró (auth anónima) de lo que sigue abierto (aislamiento por organización). Hoy figura como "ABIERTA" en bloque, lo que confunde en ambas direcciones.

### 🔴 Riesgo 5 — PII de estudiantes y docentes hacia un modelo de terceros

Cuando una tool devuelve datos personales, esos datos **entran al contexto del modelo de lenguaje**. Si el modelo es un servicio externo (OpenAI, Anthropic), la PII **sale de la organización**.

Esto no es una consecuencia de MCP: pasa igual cuando alguien copia y pega datos en un chat, que es exactamente lo que ocurre hoy sin control ni registro. Pero al sistematizarlo conviene decidirlo explícitamente en lugar de heredarlo por defecto.

**Mitigación aplicada:** de las cuatro acciones aprobadas, **una sola** devuelve nombre y apellido, y lo hace acotada por DNI + comisión. Las otras tres no exponen datos personales. Las tools proyectan únicamente los campos necesarios.

**Decisión requerida:** aprobación explícita del responsable de datos para que información de estudiantes atraviese un modelo de terceros, y bajo qué condiciones.

### 🟡 Riesgo 6 — La lista blanca es el único control de solo-lectura

El endpoint `/api` mezcla acciones de lectura y de mutación. La garantía de que la Fase 1 no escribe **no la da el endpoint: la da `acciones_permitidas`**.

**Mitigación:** revisión explícita de la lista blanca de cada cliente API antes de publicar su conector, y verificación periódica. Documentar la lista como artefacto de seguridad, no como configuración menor.

Dato a favor: **no existe wildcard** en `acciones_permitidas`. Cada acción se enumera literalmente (`ServiciosApiAccesoDatos.vb:318-330`), por lo que no hay forma de conceder de más por accidente. Un campo vacío deniega todo.

### 🟡 Riesgo 7 — Superficie de red del servidor del CRM

El VPS del CRM ya tiene los puertos 3030, 3031 y 8443 expuestos a internet, sobre un sistema operativo sin parches desde 2023.

**Regla de diseño:** el MCP Server **no requiere abrir ningún puerto nuevo** del lado del CRM. Es el MCP quien inicia las conexiones salientes hacia `POST /api` por HTTPS. El CRM solo necesita permitir tráfico entrante desde la IP del VPS Linux hacia el puerto HTTPS que ya usa.

Este proyecto no debe sumar un solo puerto a esa máquina.

### Otros riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| **Las personas no lo usan** | Media | Alto | Arrancar con un área motivada. Resultados rápidos. No forzar adopción. |
| **Exposición de PII** | Media | Alto | Dos de las cinco tools iniciales devuelven datos personales. Decidir explícitamente qué área ve qué, y proyectar solo los campos necesarios. |
| **Conector equivocado a la persona equivocada** | Media | Medio | En Fase 1 los permisos son por área, no por persona. Publicación centralizada por el admin y revisión de asignaciones. |
| **Enforcement de roles desparejo en el CRM** | Media | Medio | Relevante para Fase 2. El MCP Server aplica sus propias verificaciones y no asume que el rol implique permiso efectivo. |
| **Inyección de prompts** | Media | Medio | Servidor propio y self-hosted. Permisos acotados por área. Fase 1 sin escritura. |
| **El spec de MCP vuelve a cambiar** | **Alta** | Bajo | Ya pasó tres veces en 14 meses. Se usa el SDK oficial, que absorbe la mayor parte. Política de deprecación de 12 meses mínimo. |
| **Developer Mode de ChatGPT sigue en beta** | Media | Medio | El spike de Fase 0 lo valida. Claude es la alternativa sin beta. |
| **Costos escalan** | Baja | Bajo | El costo marginal real es $7/mes. Las suscripciones ya existen. |

### Nota sobre Moodle

Si alguna fase futura necesita leer datos de Moodle, hay una restricción medida empíricamente contra producción el 14/09/2026: **el token de Moodle de producción solo tiene habilitadas funciones de cohortes.** `core_cohort_get_cohorts` y `core_webservice_get_site_info` funcionan; `core_course_get_courses`, `core_group_get_course_groups` y `enrol_manual_enrol_users` devuelven `accessexception`. El token está sano — falta habilitar esas funciones en el servicio externo de Moodle.

La integración es por **API HTTP, sin base de datos compartida** (`Negocio/MoodleApiClient.vb`, `ConIgCba/auxiliar/MoodleSyncService.vb`).

---

## ROI Esperado

### Ahorro estimado en tiempo

| Tarea | Tiempo actual | Con agente | Ahorro | Fase |
|---|---|---|---|---|
| Consultar estado de una comisión | 5–10 min | 30 seg | ~7 min | 1 |
| Verificar inscriptos y pagos | 10 min | 30 seg | ~9 min | 1 |
| Cruzar cursos próximos con inscripción | 20 min | 1 min | ~19 min | 1 |
| Armar campaña de email | 1–2 horas | 10–15 min | ~1.5 horas | 2 |
| Enviar credenciales masivas | 15–20 min | 2 min | ~15 min | 2 |
| Estado de lanzamiento completo | 30 min | 30 seg | ~29 min | 3 |
| Reporte diario de estado | 30–60 min | 1 min | ~45 min | 4 |

### Impacto cualitativo

- **Visibilidad en tiempo real**: el admin consulta el estado sin preguntar área por área
- **Menos errores humanos**: el agente no olvida pasos del checklist
- **Velocidad de respuesta**: lo que tomaba horas toma minutos
- **Historial**: todo queda registrado y auditable

### Punto de equilibrio

El costo marginal de infraestructura es **$7 USD/mes**. Las suscripciones a apps de IA ya se pagan hoy y se reasignan.

Con ese costo, el sistema se paga si ahorra aproximadamente **media hora de trabajo al mes**. Considerando solo los casos de lectura de Fase 1, el equilibrio se alcanza en la primera semana de uso.

**El análisis honesto no es sobre infraestructura, que es despreciable, sino sobre las horas de desarrollo interno.** El hallazgo de que la API ya existe —y de que tres de las cinco tools iniciales no requieren código nuevo en el CRM— reduce esas horas de forma significativa respecto de lo estimado en la v1.5.

---

## Decisiones Pendientes

1. ~~¿Cuál es el sistema operativo real del servidor?~~ — **Resuelto.** Windows Server 2012 R2, sin ESU, sin parches desde 11/2023

2. **¿Cuándo se planifica la migración del servidor de producción?**
   - **El tema más urgente de este documento, y el único que no es parte de este proyecto.** SO y motor de base de datos fuera de soporte simultáneamente

3. **¿Se aprueba la migración del esquema de contraseñas?**
   - Prerrequisito de la Fase 2. Decisión de seguridad independiente de este proyecto

4. ~~¿Qué área arranca como piloto?~~ — **Resuelto: Secretaría Académica**

5. **¿Qué app de chat para el piloto?**
   - Recomendación: Claude Pro × 5 ($107/mes total, menos que hoy)
   - Descartado: ChatGPT Plus — no soporta conectores custom

6. ~~¿Qué acciones entran en la lista blanca de Secretaría Académica?~~ — **Resuelto: 4 acciones.** Ver [Área piloto](#secretaría-académica--⭐-área-piloto)

6b. **¿Se aprueba que PII de estudiantes atraviese un modelo de terceros?**
   - Decisión del responsable de datos, no default técnico. Ver Riesgo 5

6c. **¿Se prioriza cerrar el aislamiento por organización en la API?**
   - Bloquea `recuperar_clases_x_comision` y cualquier futura tool sobre esa familia de acciones
   - Requiere una sesión de revisión con cada área. Es el artefacto de seguridad central de la Fase 1

7. **¿Qué áreas pueden ver PII?**
   - Dos de las cinco tools iniciales devuelven datos personales. Decisión explícita, no por defecto

8. **¿Se alinea el "estado de lanzamiento" con el change `salud-comisiones-crm`?**
   - Recomendación: sí. Evita duplicar reglas de negocio en dos repositorios

9. **¿Qué tabla modela la comisión de venta?**
   - Requiere confirmación del owner del dominio antes de incluirlo en cualquier fase

10. **¿Proveedor de VPS?**
   - Hetzner (mejor precio/rendimiento), DigitalOcean (más simple), Contabo (más barato)

---

## Anexo: Referencias

### Documentación del CRM (fuente primaria de este relevamiento)

| Tema | Ruta |
|---|---|
| **Endpoints de la API, 39 acciones documentadas** | `documentacion/api/api-saberes-endpoints.md` |
| Ejemplo de consumo de la API | `documentacion/api/api-excepciones-uso.md` |
| Implementación de la API | `ConIgCba/auxiliar/api_saberes.vb` |
| Autenticación de clientes API | `Negocio/ServiciosApiAccesoDatos.vb` |
| Modelo de datos | `modelo/Modelo.dbml` |
| Control de acceso y roles | `documentacion/convenciones/menu-y-control-de-acceso.md` |
| Infraestructura y caídas | `documentacion/salud/infraestructura-y-caidas.md` |
| Vulnerabilidades documentadas | `documentacion/seguridad/` |
| Deuda de auth y aislamiento por organización | `documentacion/convenciones/api-clases-comision-deuda-auth.md` |
| Cliente y sincronización de Moodle | `Negocio/MoodleApiClient.vb`, `ConIgCba/auxiliar/MoodleSyncService.vb` |
| Change propuesto de salud de comisiones | `openspec/changes/salud-comisiones-crm/proposal.md` |

### Documentación externa

| Tema | Fuente |
|---|---|
| Especificación MCP 2026-07-28 | `modelcontextprotocol.io/specification/2026-07-28` |
| Cambios respecto de 2025-11-25 | `modelcontextprotocol.io/specification/2026-07-28/changelog` |
| Autorización MCP | `modelcontextprotocol.io/specification/2026-07-28/basic/authorization` |
| SDK oficial de TypeScript | `ts.sdk.modelcontextprotocol.io` |
| Developer Mode y conectores en ChatGPT | Centro de ayuda de OpenAI, art. 12584461 |
| Fin de soporte de Windows Server 2012 | `learn.microsoft.com/lifecycle` |

---

*Documento generado como parte del análisis de viabilidad del proyecto IA-ORGANIZACIONAL.*
*Versión 2.3 — revisada contra el estado del ecosistema MCP a septiembre de 2026, contra el código de Saberes-Terra y contra el servidor de producción.*
*Código y documentación del CRM citados contra `origin/main` @ `61a2ace3`.*
*Para consultas técnicas o ampliaciones, contactar al equipo de desarrollo.*
