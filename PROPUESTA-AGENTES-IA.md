# Propuesta: Integración de Agentes de IA en la Organización

**Fecha:** Septiembre 2026
**Última actualización:** 24/09/2026
**Estado:** Propuesta de viabilidad — **Fase 0 ejecutada y validada en producción**
**Versión:** 2.6
**Revisión de protocolo MCP:** 2026-07-28
**Área piloto definida:** Secretaría Académica
**Documentos complementarios:** `DISENO-API-MCP.md` (endpoint, identidad, permisos y auditoría) · `DISENO-TOOLS-MCP.md` (contrato de cada tool)

---

## Cambios respecto de versiones anteriores

La v1.5 se escribió en julio de 2026 sin relevar el código de Saberes-Terra. Esta revisión corrige el documento contra dos fuentes: el estado real del ecosistema MCP a septiembre de 2026, y un relevamiento directo del repositorio del CRM.

### Correcciones de la v2.6 — endpoint propio, identidad por persona y auditoría (24/09/2026)

Esta versión incorpora el diseño de **`DISENO-API-MCP.md`**, que define cómo el MCP sabe **quién** lo usa, **qué** puede hacer cada persona y **qué** hizo. Son decisiones de Max del 24/09/2026, apoyadas en una auditoría de contrato del lado del CRM hecha ese mismo día.

| # | Decisión o hallazgo | Consecuencia |
|---|---|---|
| S | **El MCP tiene su propio endpoint en el CRM: `/api-mcp`** (patrón *Backend-for-Frontend*). No se toca `/api` ni a sus consumidores (el bot Prometheo, la mesa de ayuda, el envío de emails) | La auditoría de contrato del 24/09 (sesión del CRM «green-cloud») mostró que el prompt de Prometheo **depende** del centinela `"S/D"` y de que «no encontrado» devuelva `200`: arreglar `/api` en su lugar rompería el bot. Un contrato limpio y dedicado **elimina la capa de traducción accidental** del MCP sin tocar a nadie |
| T | **La identidad por persona reutiliza el login del CRM, y el MCP nunca ve una contraseña.** La persona se autentica en una página del propio CRM (`/mcp-autorizar`, sesión normal + consentimiento), que le entrega al MCP un **código de un solo uso** canjeado por **canal trasero**. El MCP corre la maquinaria OAuth 2.1 (servidor de autorización + recurso protegido) | **No hay IdP separado** (Logto/Keycloak) federado contra `USUARIOS`, **ni login propio del MCP**. El CRM sigue siendo el único que valida contraseñas |
| U | **Corrección principal de esta versión:** la migración de contraseñas a hash con salt **sigue siendo necesaria como tema de seguridad del CRM**, pero **ya no es prerrequisito** de la identidad por persona de este proyecto | El razonamiento de la v2.1–v2.5 («prerrequisito duro») aplicaba a un **IdP federado que validara contra la tabla de contraseñas**. Ese ya no es el diseño: **nada fuera del CRM valida contraseñas**, así que el defecto no se propaga ni crece |
| V | **Permisos por rol y auditoría por persona son requisito de la producción multiusuario**, no una fase opcional posterior | Regla del diseño: **no se habilita a más de una persona hasta que identidad, permisos y auditoría estén los tres** |
| W | **El alcance del agente por rol es una tabla explícita del CRM (`MCP_ALCANCE_ROL`)**, no se deriva de los permisos del CRM | Evita que un **sysadmin quede sin límite** a través del agente. Acceso efectivo = tools del rol ∩ reglas de datos de la persona (aplicadas por el CRM en `/api-mcp` vía `X-Acting-Person`) |
| X | **Auditoría de toda llamada a tool**: quién, cuándo, qué tool, parámetros sanitizados, resultado, cantidad y latencia. Archivo local *append-only* primero, envío por lotes a una tabla `MCP_AUDITORIA` del CRM | El **dashboard lo consume el CRM**, al final. **Sin Grafana.** Límite honesto: el MCP ve **llamadas a tools, no conversaciones** |
| Y | **El CRM arregló su contrato de errores el 21/09/2026** (`existingResponse="Auto"`, commit `e9746a91` del CRM): todos los errores de `/api` devuelven **JSON con su status real**, y un token inválido da **`401`**, no `302` | Cae el hallazgo H de la v2.4. El cliente del MCP se adaptó al `401` el 24/09/2026 |
| Z | **Verificado el 24/09/2026:** los conectores remotos propios de Claude están disponibles en Free, Pro, Max, Team y Enterprise; en Team/Enterprise **solo los Owners los agregan y cada persona se autentica individualmente**. Claude soporta OAuth con DCR y con **CIMD**; Codex soporta Streamable HTTP con OAuth incluido CIMD | La spec vigente **2026-07-28 se aleja de DCR hacia CIMD**: este MCP acepta CIMD y **no ofrece DCR**. El SDK instalado (1.30.0) implementa el protocolo **2025-11-25**; hay **betas** para la 2026-07-28 |

> 📄 El diseño completo —flujo de autorización paso a paso, contrato de `/api-mcp`, matriz de permisos, campos de auditoría y preguntas abiertas para el CRM— está en **`DISENO-API-MCP.md`**.

### Correcciones de la v2.5 — el MCP Server va en el VPS existente (23/09/2026)

**El MCP Server se despliega en el VPS Windows de producción** (DonWeb, Windows Server 2012 R2), no en un VPS Linux aparte como planteaba la v2.4. Es una **decisión con riesgo aceptado**, tomada por **Max el 23/09/2026** y documentada como tal, no un detalle de implementación.

| # | Verificación directa por SSH, solo lectura, 23/09/2026 | Consecuencia |
|---|---|---|
| L | ❌ **El argumento "Runtime" de la v2.4 era falso en la práctica.** El servidor ya corre **Node v20.16.0** del sistema (`C:\Program Files\nodejs`), compartido por **9 servicios Windows** instalados con node-windows, más nginx 1.28.1 como servicio vía nssm | Cae el motivo principal para contratar un VPS aparte: **Node ya corre ahí, en producción** |
| M | **Node 24 se niega a arrancar**: *"Node.js is only supported on Windows 10, Windows Server 2016, or higher"*. **Node 22.20.0 portable sí arranca**, sin `NODE_SKIP_PLATFORM_CHECK`, y hace llamadas HTTPS correctamente | Runtime elegido: **Node 22 portable, exclusivo del MCP**. Node 22 LTS tiene mantenimiento hasta el **30/04/2027** |
| N | El build de `saberes-mcp` pasó el test de punta a punta (cliente MCP → `tools/list` → `listar_cursos` → `tools/call` contra la API de producción) **con Node 20.16.0 y con Node 22.20.0** | No queda incógnita técnica sobre el runtime |
| O | **No se toca el Node 20.16 del sistema.** Está EOL desde el 30/04/2026, pero actualizarlo pondría en riesgo los 9 servicios de producción que lo comparten | El MCP trae su propio Node portable, aislado del Node del sistema |
| P | nginx escucha en **8443 sin TLS** (`server_name utils.institutoterra.com.ar`) ruteando a `127.0.0.1:3031`; el firewall entrante permite 80/443 | **Cómo se expone HTTPS** para el conector MCP remoto queda como **punto abierto de Fase 1** |
| Q | Disco: **C: 3,6 GB libres de 33,6** (89,7 % ocupado) · **G: 13,9 GB libres de 37,5**. RAM libre: 4,2 GB de 8 | El MCP y sus logs de auditoría viven en **G:, nunca en C:** |
| R | Desaparece el VPS Linux de ~$7 USD/mes | Costos recalculados: el proyecto **no agrega infraestructura** |

**Lo que se acepta explícitamente:** el MCP suma una superficie expuesta a internet sobre un servidor sin parches desde 11/2023, sin aislamiento y con presión de disco, y queda atado a Node 22 hasta que el servidor migre. Ver [Dónde vive el MCP Server: decisión con riesgo aceptado](#dónde-vive-el-mcp-server-decisión-con-riesgo-aceptado) y [Riesgos](#riesgos-y-mitigaciones).

### Correcciones de la v2.4 — el spike de Fase 0 se ejecutó (18/09/2026)

**La propuesta deja de ser teórica.** El MCP Server existe, está conectado a producción y un agente respondió una consulta real.

| # | Hallazgo | Consecuencia |
|---|---|---|
| G | ✅ **El circuito completo funciona.** `listar_cursos` devolvió los 14 cursos de las dos organizaciones desde Claude Desktop | El supuesto central de la propuesta está **validado**, no asumido |
| H | **El contrato de errores de la API está roto**: solo el `200` devuelve JSON, todos los errores devuelven HTML. El `401` llega como `302` al login | El cliente rutea por status code y **no sigue redirects**. No bloquea, pero hay que saberlo |
| I | `SERVICIOS_API` **no tiene** scope por organización, vencimiento, IP permitidas, rate limit ni auditoría | `acciones_permitidas` es el **único** mínimo privilegio → confirma **un cliente por área** |
| J | El token **es regenerable** (invalidando el anterior), no de un solo uso irrecuperable | Perder el token no obliga a crear otro cliente |
| K | No hay evidencia de consumo: `ultimo_evento_at` no lo escribe la API RPC | La **auditoría la debe hacer el MCP Server**, como ya prevé la propuesta |

> **Corrección al hallazgo E de la v2.3.** Decía "no hace falta SQL manual". En la práctica el patrón del CRM es el contrario: la fila se crea con un **script SQL versionado** y solo la **generación del token** pasa por la pantalla de sysadmin. El script versionado importa porque la tabla no audita altas.
>
> **Lección de método:** varias de estas correcciones surgieron de **medir contra producción**, no de leer el código. El código dice la intención; la configuración dice lo que pasa.

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
   - [`/api-mcp`: un endpoint propio para el agente](#api-mcp-un-endpoint-propio-para-el-agente)
6. [El protocolo MCP hoy (revisión 2026-07-28)](#el-protocolo-mcp-hoy-revisión-2026-07-28)
7. [Arquitectura del Sistema](#arquitectura-del-sistema)
8. [Componentes del Sistema](#componentes-del-sistema)
   - [2b. Diseño de las tools: de acción RPC a herramienta de agente](#2b-diseño-de-las-tools-de-acción-rpc-a-herramienta-de-agente)
   - [3. Identidad por persona: reutilizar el login del CRM](#3-identidad-por-persona--reutilizar-el-login-del-crm)
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

**Alcance de la primera fase:** deliberadamente acotado. Un MCP Server con herramientas de solo lectura sobre un endpoint dedicado del CRM (`/api-mcp`), autenticación máquina-a-máquina y **una sola persona**. Sin capa de memoria, sin orquestador, sin operaciones de escritura.

**La regla que gobierna el paso siguiente (24/09/2026):** **no se habilita a más de una persona hasta que identidad por persona, permisos por rol y auditoría estén los tres.** No son fases opcionales sucesivas: son el requisito de la producción multiusuario, y se diseñan juntas en `DISENO-API-MCP.md`.

**Inversión estimada:** **$0 de infraestructura nueva** — el MCP Server corre en el VPS Windows que ya opera la organización (decisión del 23/09/2026, con riesgo aceptado) —, más las suscripciones de chat que ya se pagan, más las horas de desarrollo interno.

**Dos temas que exceden esta propuesta y requieren decisión de dirección:**
1. **Migrar el servidor de producción.** Ya está determinado: es **Windows Server 2012 R2**, cuyo soporte terminó el **10 de octubre de 2023**, sin ESU y **sin parches de seguridad desde el 9 de noviembre de 2023**. Con la decisión del 23/09/2026 de alojar el MCP Server en esa misma máquina, la migración pasa a ser también un prerrequisito de este proyecto.
2. Las contraseñas de usuario están almacenadas con cifrado reversible. Es un defecto de seguridad preexistente del CRM que hay que corregir. **Corrección de la v2.6:** a partir del diseño del 24/09/2026 **ya no bloquea la identidad por persona de este proyecto**, porque el MCP nunca valida contraseñas —lo sigue haciendo el CRM, en su propia página. Deja de ser prerrequisito y vuelve a ser lo que siempre fue: una decisión de seguridad del CRM, a estimar y aprobar por separado.

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
| Auditoría por persona | Fase 1 | **Fase 2 — junto con identidad y permisos** | Sin identidad no atribuye nada a nadie. Requisito de la producción multiusuario, no fase opcional |
| **Identidad por usuario final** | Fase 1 | **Fase 2 — junto con permisos y auditoría** | Requiere `/api-mcp`, la página `/mcp-autorizar` del CRM y el transporte HTTPS remoto. **Ya no depende del esquema de contraseñas**: la contraseña la sigue validando solo el CRM |
| Operaciones de escritura | Fase 1 | **Después del multiusuario de lectura** | Primero validar lectura con personas reales, con identidad y auditoría ya en pie |
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
MCP Server (capa nueva, Node.js 22 portable, VPS Windows existente)
    ↓ habla RPC sobre HTTPS con X-Api-Token (+ X-Acting-Person)
CRM — endpoint que consume el MCP
    ├─ hoy (spike):  POST /api      → api_saberes.vb  · YA EXISTE
    └─ destino:      POST /api-mcp  → handler propio  · A CONSTRUIR
    ↓ habla LINQ to SQL
SQL Server Express (Saberes-Terra)
```

Del lado del agente, la capa que agregamos es una sola: el MCP Server. Del lado del CRM se agrega **un endpoint dedicado, `/api-mcp`** (ver abajo). Todo lo demás ya está construido y en producción.

#### `/api-mcp`: un endpoint propio para el agente

**Decisión (24/09/2026, Max):** el MCP deja de consumir `/api` y pasa a consumir **`/api-mcp`**, un endpoint nuevo del CRM con handler propio, pensado **solo** para el agente. Es el patrón *Backend-for-Frontend*: un consumidor con necesidades distintas recibe su propia fachada. Precedente en el repo: `/api-presencia` (21/09/2026).

**Por qué no arreglar `/api` en su lugar.** La auditoría de contrato del 24/09/2026 mostró que `/api` **no está roto: está adaptado a otro consumidor**. El prompt del bot Prometheo depende del centinela `"S/D"` y de que «no encontrado» devuelva `200`. Normalizar `/api` en su lugar arreglaría al MCP y **rompería al bot**, a la mesa de ayuda y al envío de emails. Un endpoint dedicado le da al agente el contrato que necesita **sin tocar a un solo consumidor existente**.

**Qué resuelve.** Desaparece toda la traducción *accidental* que hoy carga el MCP Server —convertir `"S/D"` en campo ausente, deshacer el `UPPER`, interpretar montos formateados como texto, desambiguar `200 + data: null`— porque **el dato sale bien de origen**: `null` en vez de `"S/D"`, fechas ISO 8601, números como números, `404` cuando algo no existe, errores en JSON con su status real, paginación en toda colección y únicamente los campos que las tools proyectan. Lo que queda en el MCP es la traducción *esencial* —de lenguaje natural a identificadores, y de datos a herramientas de trabajo—, que es donde está su valor.

**Contrato independiente, reglas de negocio compartidas.** Es una fachada, no una segunda lógica de negocio. «Comisión disponible» se define **una sola vez** (una vista o función SQL única) y la usan tanto `/api` como `/api-mcp`. Dos definiciones de «vigente» conviviendo en el mismo CRM es exactamente lo que este diseño evita.

**Además, `/api-mcp` es el lugar por donde entra la identidad:** lleva `X-Acting-Person` desde el primer día de diseño, para que el CRM aplique las reglas de datos de cada persona sin que el MCP tenga que reimplementarlas.

> 📄 Contrato completo —acciones, forma de las respuestas, tabla de errores y ejemplos— en **`DISENO-API-MCP.md` §4**.

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

**Para qué nos sirve:** confirmaciones antes de operaciones sensibles, cuando lleguen las tools de escritura. "Vas a enviar esta campaña a 165 personas, ¿confirmás?"

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
│   VPS Windows (DonWeb · Server 2012 R2)  ·  EXISTENTE    │
│                                                          │
│   ┌──────────────────────────────────────────────────┐   │
│   │   nginx (servicio vía nssm)                      │   │
│   │   · exposición HTTPS a definir — Fase 1          │   │
│   └─────────────────────┬────────────────────────────┘   │
│                         ▼                                │
│   ┌──────────────────────────────────────────────────┐   │
│   │   MCP Server · Node.js 22 portable (solo MCP)    │   │
│   │   en G:  ·  servicio Windows (node-windows)      │   │
│   │                                                  │   │
│   │  · Tools de lectura, paginadas y con timeout     │   │
│   │  · Un cliente API por área (token propio)        │   │
│   │  · Auditoría de cada invocación (logs en G:)     │   │
│   │  · Stateless                                     │   │
│   └─────────────────────┬────────────────────────────┘   │
│                         │                                │
│        HTTPS + header X-Api-Token (saliente)             │
│                         ▼                                │
│   ┌──────────────────────────────────────────────────┐   │
│   │   POST /api  ·  api_saberes.vb                   │   │
│   │   · 39 acciones RPC                              │   │
│   │   · ValidarClienteApi() por acción               │   │
│   │   · Tabla SERVICIO_API: token + permisos         │   │
│   └─────────────────────┬────────────────────────────┘   │
│                         ▼                                │
│   ┌──────────────────────────────────────────────────┐   │
│   │   SQL Server Express  ·  10 GB · 1 GB buffer     │   │
│   └──────────────────────────────────────────────────┘   │
│                                                          │
│   Ya conviviendo en la misma máquina:                    │
│   Node 20.16 del sistema · 9 servicios · nginx           │
└──────────────────────────────────────────────────────────┘
```

### Dónde vive el MCP Server: decisión con riesgo aceptado

**Decisión (23/09/2026, Max):** el MCP Server se despliega **en el VPS Windows de producción que ya existe**, con un **Node 22 portable exclusivo del MCP** instalado en `G:`. Esto reemplaza la arquitectura de la v2.4, que lo ponía en un VPS Linux aparte.

#### Lo que argumentaba la v2.4 y lo que se verificó

| Motivo de la v2.4 | Verificado por SSH el 23/09/2026 |
|---|---|
| **Runtime** — "Node.js 18+ no soporta Windows Server 2012, no hay forma de correrlo ahí" | ❌ **Falso en la práctica.** El servidor corre **Node v20.16.0** del sistema, compartido por **9 servicios** node-windows en producción. **Node 22.20.0 portable arranca** sin flags y hace HTTPS. Solo **Node 24 se niega** a ejecutar |
| **Disco** — "el VPS del CRM está al 88 % de ocupación" | ⚠️ **Confirmado en C:** 3,6 GB libres de 33,6 (89,7 %). Pero **G: tiene 13,9 GB libres de 37,5** → el MCP y sus logs van en G: |
| **Aislamiento** — "no conviene agregar una tercera carga" | ⚠️ **Sigue siendo cierto y se acepta.** Ver riesgos abajo |
| **Coherencia operativa** — "los microservicios ya corren en Node bajo nginx" | ✅ **Cierto, y juega a favor de esta decisión**: el patrón operativo (servicio Windows + nginx) ya existe en esta misma máquina |
| **Desacople** — "cuando Saberes migre, el MCP solo cambia la URL" | ❌ **Ya no aplica.** El MCP migra **junto con** el servidor |
| **Costo** — "$7 USD/mes" | ✅ **Desaparece.** No se agrega infraestructura |

Además: el build de `saberes-mcp` pasó el test de punta a punta (`tools/list` + `tools/call` contra la API de producción) con Node 20.16.0 **y** con Node 22.20.0.

#### Riesgos aceptados

| # | Riesgo aceptado | Mitigación |
|---|---|---|
| 1 | **SO sin parches de seguridad desde 11/2023, sin ESU.** El conector remoto necesita que el MCP **reciba** HTTPS desde internet: esa es la superficie nueva, sobre una máquina que hay que migrar | El proceso del MCP escucha **solo en `127.0.0.1`** y se publica como una **ruta nueva del nginx existente**, no como un puerto nuevo. Autenticación obligatoria en esa ruta (Fase 1: token por conector de área). Hacia el CRM solo hace llamadas salientes a `POST /api` (se **evaluará** resolverlas por localhost) |
| 2 | **Presión de disco:** C: al 89,7 % de ocupación | MCP, dependencias, Node portable y logs de auditoría **en `G:`, nunca en C:**. Rotación y tope de tamaño de los logs de auditoría |
| 3 | **Sin aislamiento:** aplicación + SQL Server Express + 9 servicios + MCP en una sola máquina. Si cae, cae todo | Tools con paginación, límite de resultados y timeout corto. El MCP es stateless y reiniciable. Monitoreo durante el piloto |
| 4 | **Runtime sobre un SO que Node ya no soporta oficialmente para majors nuevos.** El MCP queda atado a **Node 22** (mantenimiento LTS hasta el 30/04/2027): **Node 24+ no arranca** en 2012 R2 | Node 22 **portable y aislado** del Node 20.16 del sistema (no se toca, para no arriesgar los 9 servicios en producción). Salir de Node 22 exige migrar el servidor |

**Consecuencia que la v2.4 presentaba al revés:** la v2.4 vendía como beneficio que el MCP **no quedaba atado** al calendario de migración del servidor. Con esta decisión **sí queda atado**: el MCP migra junto con el servidor, y la migración del servidor pasa a ser prerrequisito para mover el MCP más allá de Node 22.

**Aceptación explícita:** **Max, 23/09/2026.** Los cuatro riesgos de arriba se asumen a sabiendas, con la evidencia de esta sección a la vista.

**Punto abierto de Fase 1:** hoy nginx escucha en **8443 sin TLS** (`utils.institutoterra.com.ar`) y el firewall entrante permite 80/443. **Cómo se expone HTTPS** para el conector MCP remoto **queda por definir**; no hay solución elegida todavía.

**Aclaración honesta que ya estaba en la v2.4 y sigue valiendo:** la ubicación del MCP Server **no aísla la base de datos**. Las consultas siempre pegaron y siguen pegando contra el mismo SQL Express de 1 GB de buffer pool. La protección real contra degradación son los límites y timeouts de las tools.

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

#### Actualización de la v2.6: el MCP deja de consumir `/api`

Todo lo anterior describe `/api`, que el spike consume hoy y que **no se toca**. A partir de la decisión del 24/09/2026 el MCP pasa a consumir **`/api-mcp`**, un endpoint dedicado con handler propio y contrato limpio, mientras `/api` sigue sirviendo sin cambios a Prometheo, a la mesa de ayuda y al envío de emails.

Dos correcciones puntuales sobre esta sección, verificadas el 24/09/2026:

- **El contrato de errores de `/api` ya no está roto.** El CRM lo arregló el 21/09/2026 (`existingResponse="Auto"`, commit `e9746a91`): todos los errores devuelven **JSON con su status real** y un token inválido da **`401`**, no un `302` al login. El cliente del MCP se adaptó el 24/09/2026. El hallazgo H de la v2.4 queda saldado.
- **`200` con `data: null` para «no encontrado» sigue vigente en `/api`**, y así debe quedar: el prompt de Prometheo depende de eso. En `/api-mcp`, en cambio, «no existe» devuelve `404`.

Ver [`/api-mcp`: un endpoint propio para el agente](#api-mcp-un-endpoint-propio-para-el-agente) y `DISENO-API-MCP.md` §4.

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

> **Actualización v2.6:** esto describe el trabajo contra `/api`, que es como corre el spike hoy. Con **`/api-mcp`** la ambigüedad **se resuelve en origen**: «no existe» devuelve `404` y «existe pero vacío» devuelve `200` con una colección vacía, sin segunda llamada de verificación. Lo mismo vale para `"S/D"`, el `UPPER` y los montos formateados como texto: la **traducción accidental desaparece**; queda la esencial. Ver [`/api-mcp`](#api-mcp-un-endpoint-propio-para-el-agente).

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

> **Actualización v2.6:** con `/api-mcp`, las filas de **normalización**, **renombrado** y **desambiguación de errores** dejan de ser trabajo del MCP y pasan a resolverse en el contrato del CRM. Las que quedan —resolución de identidad, proyección por tarea, contención de carga, auditoría y permisos— son las que de verdad justifican esta capa. La fila de **permisos**, además, deja de ser «catálogo filtrado por conector de área» y pasa a ser **alcance efectivo por persona** (ver [Autenticación, Permisos y Auditoría](#autenticación-permisos-y-auditoría)).

> 📄 **El contrato exacto de las cuatro tools** — `inputSchema`, mapeo de campos, manejo de errores, diseño del índice cacheado y checklist de implementación — está en el documento complementario **`DISENO-TOOLS-MCP.md`**. Este documento define el *qué* y el *por qué*; aquel define el *cómo*.

### 3. Identidad por persona — reutilizar el login del CRM

**Decisión (24/09/2026, Max):** la identidad por usuario final **reutiliza el login del CRM**, y **el MCP nunca ve una contraseña**. No hay Identity Provider separado ni login propio del MCP.

**El principio:** la persona se autentica en una página del propio CRM (`/mcp-autorizar`), con la sesión de siempre, y da su consentimiento explícito. El CRM entrega un **código de un solo uso** que el MCP **canjea por canal trasero** contra `/api-mcp`; recién entonces el MCP sabe qué persona es. La maquinaria OAuth 2.1 —`/authorize`, `/token`, `/revoke`, metadatos RFC 8414 y RFC 9728, PKCE, tokens rotativos— corre en el MCP, que es donde hay librerías maduras.

```
App de chat → MCP /authorize → CRM /mcp-autorizar (sesión + consentimiento)
                             ← código de un solo uso (60 s)
MCP → /api-mcp canjear_codigo_autorizacion (canal trasero) → id_persona
MCP → emite su propio access token (1 h) + refresh rotativo (30 d) a la app
```

**Por qué se descartó el IdP federado (Logto/Keycloak) que proponía la v2.0:** ese diseño exigía que un segundo sistema **validara credenciales contra la tabla `USUARIOS`**. Y las contraseñas de `dbo.USUARIOS` **no están hasheadas**: están cifradas con 3DES simétrico, con la clave derivada del propio nombre de usuario, de forma reversible.

```
Negocio/usuariosAccesoDatos.vb:548
  contraseña = encriptar(contraseña, nombreUsuario.PadLeft(8, "X"))
Negocio/usuariosAccesoDatos.vb:409
  Return desencriptar(consulta.FirstOrDefault.contraseña.Trim, ...)
```

Existe `recuperar_contraseña(id_persona)` que devuelve la clave en texto plano. No hay salt, no hay función de derivación, no hay hash. Federar un IdP contra ese esquema habría **propagado el defecto a un segundo sistema** y a una superficie nueva expuesta a internet. Por eso la v2.1 a la v2.5 lo bloqueaban, y tenían razón **para ese diseño**.

También se descartó un **login propio del MCP** (dos padrones de usuarios y dos juegos de roles: alguien dado de baja en el CRM seguiría entrando por el MCP) y un **servidor OAuth completo dentro del CRM** (implementar OAuth 2.1, metadatos y PKCE en WebForms / .NET Framework, sin librerías actuales, es la pieza más riesgosa de todo el proyecto).

#### ⚠️ Corrección de la v2.6: el esquema de contraseñas ya no es prerrequisito de este proyecto

Lo que sigue es la corrección más importante de esta versión, y conviene decirla sin maquillaje:

- **Lo que decían la v2.1 a la v2.5:** migrar `USUARIOS.contraseña` a hash con salt era un *«prerrequisito duro»* de la identidad por usuario final.
- **Por qué lo decían:** porque el diseño de entonces era un **IdP federado validando contra la tabla de contraseñas**. Ese razonamiento era correcto para ese diseño.
- **Por qué ya no aplica:** en el diseño del 24/09/2026 **nada fuera del CRM valida contraseñas**. El CRM las sigue validando en su propia página, con su propio mecanismo. El defecto **no se copia a ningún lado ni crece**.
- **Lo que no cambia:** guardar contraseñas de forma reversible **sigue siendo un problema de seguridad real del CRM** y hay que arreglarlo. Migrar a bcrypt, PBKDF2 o Argon2 es un trabajo acotado —login, alta de usuario, cambio de clave y una migración con doble escritura— que **debe estimarse y aprobarse por separado**, como tema de seguridad del CRM. Ver [Riesgo 2](#-riesgo-2--contraseñas-almacenadas-con-cifrado-reversible).

En una frase: **deja de ser un bloqueante de este proyecto y vuelve a ser lo que siempre fue, una deuda de seguridad del CRM.**

#### Lo que hay que construir de cada lado

| CRM | MCP |
|---|---|
| Página `/mcp-autorizar`: sesión del CRM + consentimiento + código de un uso | Servidor de autorización: `/authorize`, `/token`, `/revoke` + metadatos RFC 8414 |
| Acción `canjear_codigo_autorizacion` en `/api-mcp` | Metadatos RFC 9728 y `401` con `WWW-Authenticate` en `/mcp` |
| Tablas de códigos de un uso y de concesiones | Almacén de tokens (solo hashes, nunca el token en claro) |
| Pantalla «mis conexiones» para revocar | Transporte Streamable HTTP sobre HTTPS (hoy es stdio) |
| Marca en `SERVICIO_API` de qué cliente puede actuar en nombre de personas | Envío de `X-Acting-Person` a `/api-mcp` |

**Baja y revocación:** el MCP consulta `resolver_acceso` en cada llamada, con caché de hasta 5 minutos. Una persona dada de baja en el CRM pierde el acceso al agente en ese plazo, **sin que nadie tenga que acordarse del MCP**.

> 📄 Flujo completo paso a paso, vida de los tokens, requisitos de la spec 2026-07-28 y alternativas descartadas: **`DISENO-API-MCP.md` §2**.

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

### En el VPS Windows existente (decisión del 23/09/2026)

El MCP Server se instala **en el servidor de producción que ya existe**, siguiendo el patrón de los 9 microservicios que ya corren ahí. Todo vive en **`G:`**, nunca en `C:` (3,6 GB libres).

```
VPS Windows (DonWeb · Server 2012 R2) — EXISTENTE
├── G:\ ... \node-22-portable\        ← Node 22 portable, exclusivo del MCP
│                                       (no se toca el Node 20.16 del sistema)
├── G:\ ... \saberes-mcp\
│   ├── MCP Server (TypeScript sobre el SDK oficial)
│   ├── Tools de lectura por área
│   ├── Tokens de SERVICIO_API (uno por área)
│   └── Servicio Windows (node-windows, como los otros 9)
├── G:\ ... \saberes-mcp\logs\        ← auditoría, con rotación y tope de tamaño
└── nginx (ya instalado como servicio vía nssm)
    └── exposición HTTPS del endpoint MCP → PENDIENTE (tarea de Fase 1)
```

Puntos a tener presentes en la instalación:

1. **Node 22 portable, no instalado en el sistema.** Actualizar el Node 20.16 del sistema pondría en riesgo los 9 servicios de producción que lo comparten. Node 22 LTS tiene mantenimiento hasta el 30/04/2027 y **Node 24+ no arranca** en 2012 R2
2. **Nada en `C:`**: binario, dependencias y logs de auditoría van en `G:`
3. **Logs con rotación y tope de tamaño** desde el día uno: la auditoría no puede llenar el disco
4. **La exposición HTTPS está abierta.** Hoy nginx escucha en 8443 **sin TLS** y el firewall entrante permite 80/443. Resolverlo es una tarea de Fase 1, sin solución elegida todavía

Ver [Dónde vive el MCP Server: decisión con riesgo aceptado](#dónde-vive-el-mcp-server-decisión-con-riesgo-aceptado).

### En la aplicación de Saberes (existente)

1. **Dar de alta los clientes API** desde sysadmin (`generar_token_cliente()`), uno por área piloto
2. **Cargar `acciones_permitidas`** con la lista blanca de acciones de lectura de cada área
3. ~~**Permitir el tráfico** desde la IP del VPS Linux~~ — **ya no aplica.** El MCP corre en la misma máquina que la API; queda por **evaluar** si la llamada a `POST /api` se resuelve por localhost

**Para el piloto de una persona no se modifica una sola línea de la aplicación existente.** Eso es configuración, no desarrollo.

**Lo que sí requiere desarrollo en el CRM, a partir de la decisión del 24/09/2026:** el endpoint `/api-mcp`, la página `/mcp-autorizar`, las tablas `MCP_ALCANCE_ROL` y `MCP_AUDITORIA`, y la pantalla «mis conexiones». Nada de eso toca `/api` ni a sus consumidores actuales. El reparto exacto de qué construye cada lado está en `DISENO-API-MCP.md` §7.

### En cada PC del equipo

1. Instalar la app de chat
2. Loguearse con la cuenta de la organización
3. Activar el conector de su área (si el admin ya lo publicó, aparece solo)

No se instala Node.js, Python ni ninguna dependencia.

> **Cambio respecto de la v1.5:** el documento anterior describía editar manualmente `claude_desktop_config.json` en cada máquina. Ese mecanismo es para servidores locales por stdio. Para un servidor remoto, el camino es agregarlo como **conector**, y en planes Team/Business/Enterprise el administrador lo publica centralmente. El onboarding no requiere tocar archivos.

---

## Autenticación, Permisos y Auditoría

### La regla que ordena esta sección

> **No se habilita a más de una persona hasta que identidad, permisos y auditoría estén los tres.**

Es una decisión del 24/09/2026 y cambia cómo hay que leer lo que sigue. En la v2.5 la identidad por persona era «Fase 2» y la auditoría por persona un agregado posterior. Ahora son **tres piezas de un mismo requisito de producción multiusuario**, porque dependen entre sí: sin identidad no hay permisos por persona, y sin identidad la auditoría no atribuye nada a nadie.

El token máquina-a-máquina que ya funciona **no deja de servir**: es lo correcto para el **piloto de una sola persona**, donde «quién hizo qué» no es ambiguo. Lo que no es correcto es estirarlo a un equipo.

### Piloto de una persona: máquina a máquina

El MCP Server se autentica ante el CRM con un token de `SERVICIO_API` (`mcp-secretaria-academica`, id 14). El token dice **qué sistema llama**, no **quién**.

| ✅ Lo que sí resuelve | ⚠️ Lo que no resuelve |
|---|---|
| Autenticación real contra el CRM, ya validada en producción | La auditoría registra el **cliente**, no la persona |
| Límite de acciones por lista blanca (`acciones_permitidas`) | No hay revocación individual |
| Cero código nuevo en el CRM para arrancar | No hay permisos por rol ni por persona |
| Suficiente para un piloto de **una** persona | **No sirve para escritura**: sin identidad individual no hay responsabilidad atribuible |

**Es explícitamente transitorio.** La v2.5 proponía estirarlo a un equipo con **un cliente API y un conector por área**. Esa alternativa **queda descartada como destino**: separa por área y no por persona, quien recibe el conector equivocado se queda con los permisos de esa área, y la revocación es del área entera. Sirve como escalón intermedio corto, nunca como estado final.

### Producción multiusuario: identidad + permisos + auditoría

#### 1. Identidad por persona

La persona inicia sesión **en el CRM** y autoriza al agente; el MCP recibe su identidad por canal trasero y emite sus propios tokens. Flujo objetivo:

```
1. La app usa el MCP Server sin token
   → 401 con WWW-Authenticate apuntando a la metadata de recurso
     protegido (RFC 9728)
2. La app descubre el authorization server (RFC 8414) → el propio MCP
3. La app se identifica mediante su Client ID Metadata Document (CIMD)
4. Se abre el navegador → CRM /mcp-autorizar: sesión normal del CRM
   + pantalla de consentimiento
5. El CRM devuelve un código de un solo uso; el MCP lo canjea por canal
   trasero contra /api-mcp y obtiene el id_persona
6. El MCP emite access token (1 h) y refresh rotativo (30 d), con
   audiencia = este MCP Server (RFC 8707), y los valida en cada llamada
```

Detalle completo en [3. Identidad por persona](#3-identidad-por-persona--reutilizar-el-login-del-crm) y en `DISENO-API-MCP.md` §2.

**Sobre el registro de clientes: CIMD sí, DCR no.** En la revisión 2026-07-28 DCR quedó deprecado en favor de **Client ID Metadata Documents**, y el orden recomendado por la spec es preregistro, CIMD, y DCR solo por compatibilidad. Verificado el 24/09/2026: **Claude soporta OAuth con DCR y con CIMD**, y **Codex soporta Streamable HTTP con OAuth incluido CIMD**. Decisión para este MCP:

- **acepta CIMD**;
- **no ofrece DCR**: la spec se está alejando de él y habilita clientes anónimos;
- mantiene una **lista explícita de `client_id` permitidos** (Claude, Codex y, si se decide, ChatGPT). Una app desconocida no llega ni a la pantalla de consentimiento.

En Claude, los conectores remotos propios están disponibles en Free, Pro, Max, Team y Enterprise; en **Team y Enterprise solo los Owners los agregan, y cada persona se autentica individualmente** —justo el comportamiento que este diseño necesita.

#### 2. Permisos por rol: el alcance del agente es una tabla, no una herencia

```
acceso efectivo = tools permitidas para el rol   (tabla MCP_ALCANCE_ROL, en el CRM)
                ∩ reglas de datos de la persona   (las del CRM, aplicadas en /api-mcp)
```

**Por qué el alcance no se deriva de los permisos del CRM.** En el CRM, `esSysadmin` saltea `puede_leer` y ve todo. Quien más va a usar el agente (Dirección) suele ser sysadmin: si el alcance del agente copiara los permisos del CRM, **para esas personas no habría límite alguno**. Por eso el alcance vive en una tabla aparte y explícita por rol, `MCP_ALCANCE_ROL`, administrada donde se administran los roles. Un sysadmin tiene exactamente las tools que su rol tenga asignadas ahí, ni una más.

Reglas:

1. **Negado por defecto.** Una persona sin rol mapeado no ve ninguna tool.
2. **El filtrado de `tools/list` no es seguridad**, es experiencia de uso: cada `tools/call` se vuelve a chequear.
3. **Los permisos los decide el servidor, nunca el modelo.** Ningún parámetro de una tool puede ampliar el alcance.
4. **Defensa en profundidad:** el CRM **vuelve a chequear** en `/api-mcp`, con `X-Acting-Person`, que los datos pedidos sean coherentes con esa persona.

#### 2b. El modelo de roles del CRM, y por qué no se hereda

El CRM **sí tiene** un modelo de roles en base de datos:

- `dbo.ROLES` (`Modelo.dbml:1916-1928`), `dbo.PERSONAS_ROLES` (N:M), `dbo.PRIVILEGIOS` + `dbo.ROLES_PRIVILEGIOS`, `dbo.VISTAS` + `dbo.VISTAS_ROLES`
- Roles concretos: estudiante, profesor, secretaría, sysadmin, interesado, cliente, coordinador, ayudante, proveedor, sin rol

**Advertencia que sigue vigente, y ahora tiene consecuencia de diseño:** la documentación del propio CRM (`documentacion/convenciones/menu-y-control-de-acceso.md:3-8,82-119`) señala que el control de acceso real debe implementarse en cada `Page_Load`, y que ocultar el menú no protege la URL. Hay dos IDOR documentados en `documentacion/seguridad/` que lo confirman.

Traducción: **`ROLES_PRIVILEGIOS` es un insumo declarativo, no una garantía de enforcement.**

**Cómo se conecta con lo anterior.** Ese enforcement desparejo es exactamente la razón por la que el diseño **no confía en una sola capa**:

- el **alcance por rol** no se hereda de `ROLES_PRIVILEGIOS`: se declara explícitamente en `MCP_ALCANCE_ROL`;
- el **MCP** chequea ese alcance en cada `tools/call`;
- el **CRM re-chequea** en `/api-mcp` con `X-Acting-Person`, así que un bug de permisos del MCP **no alcanza para entregar datos** fuera de las reglas de esa persona.

Ninguna de las tres capas asume que las otras funcionaron.

#### 3. Auditoría por persona

Cada invocación de tool queda registrada con estos campos:

| Campo | Ejemplo |
|---|---|
| `id_evento` · `ocurrido_at` | UUID · `2026-09-24T14:03:11.402Z` (UTC) |
| `id_persona` · `roles` | `1234` · `["secretaria"]`, al momento de la llamada |
| `id_concesion` · `cliente` | `87` · `claude` — qué autorización y qué app se usaron |
| `tool` · `parametros` | `detalle_comision` · `{"id_comision":2672}`, sanitizados |
| `resultado` | `ok` / `no_encontrado` / `denegado` / `error:<tipo>` |
| `cantidad_resultados` · `latencia_ms` | `1` · `184` — la cantidad sirve para detectar extracción masiva |

Además se registran los eventos de autorización: concesión otorgada, token renovado, concesión revocada y por quién, acceso denegado por alcance, y app no permitida que intentó conectarse.

**Dónde se guarda.** El MCP escribe primero en un **archivo local append-only** en `G:` (JSON Lines, rotación diaria, tope de tamaño) y un proceso envía los eventos **por lotes** a una tabla `MCP_AUDITORIA` del CRM. El archivo local va primero a propósito: si el CRM está caído el evento no se pierde, y justo cuando el CRM falla es cuando más importa tener el registro.

**Datos personales en el log:** un DNI no se guarda en claro, se guarda su HMAC. Permite responder «¿quién consultó el DNI X?» sin que el log sea, él mismo, una base de DNI.

**El dashboard lo consume el CRM, y va al final.** Sale de `MCP_AUDITORIA` cruzado con nombres y roles del CRM: uso por persona, tool y día; denegaciones; errores; latencia; personas con volumen anómalo de resultados. **No se usa Grafana**: sumar una herramienta de monitoreo aparte no se justifica, y el CRM ya es donde el equipo mira.

> ⚠️ **Límite honesto de esta auditoría:** el MCP ve **llamadas a tools, no conversaciones**. No sabe qué le preguntaron al modelo ni qué respondió. Auditar conversaciones depende de la app de chat (función de los planes Team / Enterprise) y es un criterio más para elegirla.

> 📄 Campos completos, sanitización, retención y dashboard: **`DISENO-API-MCP.md` §3 y §5**.

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

**[F2+] Enviar credenciales de autogestión** — requiere escritura; llega después de que el uso multiusuario de lectura esté estable.

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
| **MCP Server** | Node 22 portable + servicio Windows, en `G:` | **VPS DonWeb actual** (decisión del 23/09/2026) |
| **Saberes-Terra** | CRM existente | VPS DonWeb actual (sin cambios) |
| **App de chat** | Una cuenta por persona | PC de cada usuario |

**No se agrega infraestructura.** La v2.4 preveía un VPS Linux de ~$7 USD/mes; con la decisión del 23/09/2026 el MCP Server vive en el servidor que ya opera la organización. El contrapeso no es económico sino de riesgo: ver [Dónde vive el MCP Server](#dónde-vive-el-mcp-server-decisión-con-riesgo-aceptado).

### Recursos que consume el MCP en el servidor existente

| Recurso | Disponible hoy (verificado 23/09/2026) | Criterio |
|---|---|---|
| **Disco** | C: 3,6 GB libres de 33,6 · **G: 13,9 GB libres de 37,5** | Todo en **G:**, con rotación y tope de tamaño de logs |
| **RAM** | 4,2 GB libres de 8 | Un proceso Node stateless, junto a los 9 servicios existentes |
| **CPU** | 4 vCPU compartidas con app, SQL Express y 9 servicios | Tools con paginación, límite de resultados y timeout corto |
| **Runtime** | Node 22 portable, propio del MCP | No se toca el Node 20.16 del sistema |

### Desglose de costos — Fase 1, equipo piloto de 5 personas

| Concepto | Detalle | Costo mensual |
|---|---|---|
| **Infraestructura nueva** | Ninguna: el MCP corre en el VPS existente | **$0** |
| **Exposición HTTPS** | Pendiente de definir en Fase 1 (hoy nginx escucha sin TLS) | a determinar |
| **App de chat** | 5 cuentas con soporte de conectores | $100–150 USD |
| **Total** | | **$100–150 USD/mes** |

### Escenarios de costo total

La organización paga hoy ChatGPT Plus ($20) + Claude Max ($100) = **$120 USD/mes**.

| Escenario | Detalle | Costo mensual | Diferencia vs. hoy |
|---|---|---|---|
| **Claude Pro × 5** | 5 cuentas Pro ($20/u). Sin gestión centralizada de conectores. | **$100 USD** | **−$20/mes** |
| **Claude Team × 5** | 5 cuentas Team ($25/u). Gestión centralizada, escritura estable. | $125 USD | +$5/mes |
| **ChatGPT Business × 5** | 5 cuentas Business ($25–30/u). Escritura en beta. | $125–150 USD | +$5 a +$30/mes |

**Corrección respecto de la v1.5:** el documento anterior planteaba escenarios a costo cero usando ChatGPT Plus. Ese escenario no es viable: **Plus no soporta conectores MCP custom**. El piso real para ChatGPT es el plan Business.

**Cambio respecto de la v2.4:** los tres escenarios bajan $7/mes porque desaparece el VPS Linux. Lo que se paga en su lugar no es plata: es el riesgo aceptado de alojar el MCP en el servidor sin soporte.

**Recomendación:** arrancar con **Claude Pro × 5** ($100/mes, menos que hoy) para el piloto, y evaluar el salto a Team cuando la gestión centralizada de conectores lo justifique.

**El costo marginal de infraestructura del proyecto es $0.** El número relevante a evaluar no es la infraestructura sino **las horas de desarrollo interno** — y el hallazgo de que la API ya existe reduce esas horas de forma significativa.

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
- [x] ~~Dar de alta el primer cliente `SERVICIO_API` con lista blanca de lectura~~ — **hecho el 18/09/2026**: `mcp-secretaria-academica`, `id_servicio_api = 14`, 4 acciones de lectura
- [x] ~~**Spike técnico:** MCP Server mínimo validado de punta a punta contra la app de chat~~ — **hecho el 18/09/2026**
- [x] ~~Definir el área piloto~~ — Secretaría Académica
- [ ] **Escalar a dirección el estado de parcheo del servidor**, como tema independiente de este proyecto
- [ ] Decisión de dirección: ¿se aprueba que PII de estudiantes atraviese un modelo de terceros?
- [ ] Instalar **Node 22 portable** y el MCP Server como **servicio Windows** en `G:` del servidor existente, siguiendo el patrón de los 9 microservicios ya instalados
- [ ] Resolver la **exposición HTTPS** del endpoint MCP en el servidor existente (hoy nginx escucha en 8443 sin TLS)

> El spike va primero porque valida los supuestos de autenticación y de soporte de la app antes de comprometer semanas de desarrollo. Si algo no funciona como esperamos, queremos saberlo en la semana 1.

#### ✅ Resultado del spike — 18/09/2026

Se implementó la tool más simple (`listar_cursos`, sin parámetros y sin PII) en vez de `recuperar_comision_x_id`, porque valida exactamente el mismo circuito con menos superficie.

**Consulta real en Claude Desktop:** *"¿Qué cursos hay disponibles?"* → el agente devolvió los **14 cursos** agrupados en Instituto Terra (11) y Fundación Saberes (3), en lenguaje natural, y ofreció el siguiente paso.

| Supuesto a validar | Resultado |
|---|---|
| Autenticación por `X-Api-Token` contra producción | ✅ |
| Lista blanca por cliente efectivamente acotada | ✅ `403` en las acciones excluidas |
| Registro del conector en la app de chat | ✅ |
| Flujo MCP completo (`initialize`, `tools/list`, `tools/call`) | ✅ |
| La traducción produce lenguaje natural, no JSON | ✅ |

**Lo que costaba semanas de riesgo y ahora está resuelto:** ya sabemos que la arquitectura cierra. Lo que queda de la Fase 1 es **repetir el patrón** para las otras tres tools y montar la infraestructura.

Implementación: `github.com/saberesterratecnologia/saberes-mcp` (privado), TypeScript sobre el SDK oficial de MCP.

> ⚠️ El spike corrió con transporte **stdio local**. El paso a producción multiusuario requiere **exponer el MCP por HTTPS en el servidor existente**, y eso todavía no está resuelto: hoy nginx escucha en 8443 sin TLS. Y si el equipo usara ChatGPT en vez de Claude, **stdio no es una opción**: ChatGPT solo acepta conectores remotos por HTTPS, o sea que la exposición HTTPS y OAuth dejan de ser el paso siguiente para ser el paso previo.
>
> **Agregado de la v2.6:** el transporte remoto por HTTPS no es solo una condición de ChatGPT. **La identidad por persona también lo exige**, en cualquier app: el flujo OAuth 2.1 necesita que el MCP publique `/authorize`, `/token` y sus metadatos, y que la app abra el navegador contra ellos. Por stdio, con el proceso corriendo en la máquina de cada persona, eso no existe. **Sin transporte remoto no hay identidad por persona, y sin identidad no se habilita a más de una persona.**

### Fase 1 — Piloto de lectura, una persona (Semanas 2–5)

- [ ] Construir el MCP Server con las tools de lectura
- [ ] Implementar paginación, límites y timeouts en todas las consultas
- [ ] Implementar la auditoría local (archivo append-only en `G:`)
- [ ] Redactar los prompts de área y las Custom Instructions de la organización
- [ ] Pruebas con **una** persona de Secretaría Académica e iteración según feedback

**Criterio de salida:** esa persona usa el agente de forma espontánea durante dos semanas seguidas sin que haya que recordárselo.

### Fase 2 — Habilitar el uso multiusuario (Semanas 6–12)

**Reestructurada en la v2.6.** Esta fase ya no es «identidad y escritura»: es **poner el agente en condiciones de que lo use más de una persona**. La escritura se corre a más adelante. El orden sigue a `DISENO-API-MCP.md` §7.

> **Regla de corte:** **no se habilita a más de una persona hasta que los pasos 2, 3 y 4 estén los tres.**

**1. `/api-mcp`: el endpoint dedicado**

- [ ] Handler `/api-mcp` en el CRM con las acciones de datos (`cursos_disponibles`, `comision`, `buscar_comisiones`), todavía con token de servicio y sin `X-Acting-Person`
- [ ] Definir **una sola vez** «comisión disponible» (vista o función SQL única, compartida con `/api`)
- [ ] Migrar las tools del MCP a `/api-mcp` y **eliminar la capa de traducción accidental**

**2. Identidad por persona — piloto con una persona**

- [ ] Transporte **Streamable HTTP sobre HTTPS** (hoy stdio): condición previa de todo lo demás
- [ ] Página `/mcp-autorizar` en el CRM (sesión normal + consentimiento + código de un solo uso)
- [ ] Acción `canjear_codigo_autorizacion` en `/api-mcp` y tablas de códigos y concesiones
- [ ] Servidor de autorización del MCP: `/authorize`, `/token`, `/revoke`, metadatos RFC 8414 y RFC 9728, PKCE, validación de audiencia (RFC 8707)
- [ ] **CIMD** y lista explícita de `client_id` permitidos; **sin DCR**
- [ ] Decidir la versión del SDK: el instalado (1.30.0) implementa el protocolo 2025-11-25; para la 2026-07-28 hay betas

**3. Permisos por rol**

- [ ] Tabla `MCP_ALCANCE_ROL` + pantalla de administración en el CRM
- [ ] Acción `resolver_acceso` y `X-Acting-Person` obligatorio en `/api-mcp`
- [ ] Filtrado de `tools/list` y chequeo en cada `tools/call`; re-chequeo del CRM como defensa en profundidad
- [ ] Pantalla «mis conexiones» para revocar

**4. Auditoría por persona**

- [ ] Envío por lotes a `registrar_eventos_auditoria` y tabla `MCP_AUDITORIA` en el CRM
- [ ] Sanitización de datos personales en el log (HMAC del DNI)
- [ ] Definir la **retención** (propuesta: 12 meses en el CRM, 30 días de archivo local)

**5. Dashboard — al final, en el CRM**

- [ ] Uso por persona, tool y día; denegaciones; errores; latencia; volumen anómalo de resultados. **Sin Grafana**

**Fuera de esta fase, y explícitamente separado:**

- **Migrar `USUARIOS.contraseña` a hash con salt.** Sigue siendo necesario **como decisión de seguridad del CRM**, a estimar y aprobar por separado. **Ya no es prerrequisito de este proyecto**: el MCP nunca valida contraseñas. Ver [Riesgo 2](#-riesgo-2--contraseñas-almacenadas-con-cifrado-reversible)
- **Operaciones de escritura.** Se posponen a después de que el uso multiusuario de lectura esté estable: tools de escritura con confirmación explícita vía MRTR, modo borrador para campañas, y ampliación de la auditoría al payload

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

**Qué cambió con la decisión del 23/09/2026, dicho sin maquillaje:** la v2.4 mitigaba este riesgo poniendo el MCP Server en un VPS Linux separado. **Esa mitigación ya no existe.** El MCP Server va en esta misma máquina, así que el proyecto de agentes **sí agrega una superficie expuesta a internet** sobre un servidor sin parches, y **sí queda atado a su calendario de migración**.

**Riesgo aceptado explícitamente por Max el 23/09/2026**, con estas mitigaciones:

| Qué se acepta | Mitigación |
|---|---|
| Superficie nueva sobre un SO sin parches: el endpoint HTTPS del MCP, que recibe tráfico desde internet | El MCP escucha **solo en `127.0.0.1`** y se publica como **ruta nueva del nginx existente**, sin puerto nuevo, con autenticación obligatoria. Hacia el CRM solo llamadas salientes a `POST /api` (se **evaluará** resolverlas por localhost) |
| Presión de disco (C: al 89,7 %) | MCP, Node portable y logs de auditoría **en `G:`**, con rotación y tope de tamaño |
| Cero aislamiento: app + SQL Express + 9 servicios + MCP en un solo equipo | Tools con paginación, límite de resultados y timeout corto. MCP stateless y reiniciable. Monitoreo durante el piloto |
| Runtime atado a **Node 22** (Node 24+ no arranca en 2012 R2) | Node 22 portable y aislado del Node 20.16 del sistema. Salir de Node 22 exige migrar el servidor |

**Consecuencia para este riesgo:** la migración del servidor pasa a ser **también un prerrequisito de este proyecto**, no solo un tema de dirección paralelo. El MCP migra junto con el servidor. Ver [Dónde vive el MCP Server](#dónde-vive-el-mcp-server-decisión-con-riesgo-aceptado).

**Lo que esta arquitectura NO resuelve, y hay que decir con todas las letras:** la migración de Saberes-Terra a una plataforma con soporte. Ese es un proyecto aparte, más urgente que este, y su postergación no se vuelve más segura porque el proyecto de agentes avance bien.

**Recomendación:** llevar este hallazgo a dirección esta semana, con estas fechas y esta evidencia, como tema separado del proyecto de IA.

### 🔴 Riesgo 2 — Contraseñas almacenadas con cifrado reversible

`dbo.USUARIOS.contraseña` usa 3DES simétrico con clave derivada del nombre de usuario (`Negocio/usuariosAccesoDatos.vb:409,548`). Cualquiera con acceso de lectura a esa tabla y al ensamblado `modelo.dll` puede recuperar todas las contraseñas en texto plano.

**Relación con este proyecto — corregida en la v2.6:** este proyecto **no lo causa, no lo agrava y ya no está bloqueado por él**.

- La v2.1 a la v2.5 lo presentaban como **prerrequisito duro** de la identidad por usuario final. Ese razonamiento valía para el diseño de entonces: un **IdP federado validando credenciales contra la tabla `USUARIOS`**, que habría propagado el defecto a un segundo sistema expuesto a internet.
- Con el diseño del 24/09/2026 **nadie fuera del CRM valida contraseñas**: la persona inicia sesión en una página del propio CRM y el MCP recibe solo un código de un solo uso. El defecto **no se copia ni crece**.
- **Lo que no cambia:** guardar contraseñas de forma reversible sigue siendo un riesgo real —cualquiera con lectura sobre esa tabla y el ensamblado las recupera en texto plano— y hay que arreglarlo igual.

**Mitigación:** migración a hash con salt (bcrypt/PBKDF2/Argon2) **como decisión de seguridad del CRM**, estimada y aprobada por separado, con su propia prioridad. No se agenda dentro de este proyecto ni se esconde en su estimación.

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

**Regla de diseño:** el MCP Server **no abre ningún puerto nuevo**. Con el MCP en la misma máquina (decisión del 23/09/2026) hay dos tramos, y los dos se resuelven sin puertos nuevos:

- **Hacia el CRM:** el MCP inicia las conexiones salientes a `POST /api`. No hace falta habilitar ninguna IP de origen; queda por **evaluar** si la llamada se resuelve directamente por localhost.
- **Desde internet:** el conector remoto sí necesita alcanzar al MCP. El proceso escucha **solo en `127.0.0.1`** y se publica como **una ruta más del nginx existente**, con autenticación obligatoria. Cómo se termina TLS en ese nginx (hoy escucha en 8443 sin TLS) es el punto abierto de Fase 1.

Este proyecto no debe sumar un solo puerto a esa máquina.

### Otros riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| **Las personas no lo usan** | Media | Alto | Arrancar con un área motivada. Resultados rápidos. No forzar adopción. |
| **Exposición de PII** | Media | Alto | Dos de las cinco tools iniciales devuelven datos personales. Decidir explícitamente qué área ve qué, y proyectar solo los campos necesarios. |
| **Conector equivocado a la persona equivocada** | Media | Medio | El piloto es de **una sola persona**. Para más de una, el permiso deja de ser por conector y pasa a ser por persona y rol (identidad + `MCP_ALCANCE_ROL`): esa es la regla de corte del plan. |
| **Enforcement de roles desparejo en el CRM** | Media | Medio | Tres capas, ninguna confiada en las otras: el alcance del agente **no se hereda** de `ROLES_PRIVILEGIOS` sino que se declara en `MCP_ALCANCE_ROL`; el MCP lo chequea en cada `tools/call`; y el **CRM re-chequea en `/api-mcp` con `X-Acting-Person`**, así que un bug de permisos del MCP no alcanza para entregar datos. |
| **Sysadmin sin límite a través del agente** | Media | Alto | `esSysadmin` saltea `puede_leer` en el CRM, y Dirección suele ser sysadmin. El alcance del agente **no se deriva** de los permisos del CRM: es una tabla explícita por rol (`MCP_ALCANCE_ROL`). |
| **Extracción masiva de datos vía el modelo** | Media | Medio | Solo lectura, `limit` máximo de 20, límite de llamadas por persona y por minuto, y `cantidad_resultados` auditado por llamada. |
| **Inyección de prompts** | Media | Medio | Servidor propio y self-hosted. Permisos acotados por área. Fase 1 sin escritura. |
| **El spec de MCP vuelve a cambiar** | **Alta** | Bajo | Ya pasó tres veces en 14 meses. Se usa el SDK oficial, que absorbe la mayor parte. Política de deprecación de 12 meses mínimo. |
| **Developer Mode de ChatGPT sigue en beta** | Media | Medio | El spike de Fase 0 lo valida. Claude es la alternativa sin beta. |
| **Costos escalan** | Baja | Bajo | El costo marginal de infraestructura es $0. Las suscripciones ya existen. |

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

El costo marginal de infraestructura es **$0**: el MCP Server corre en el servidor que ya se paga. Las suscripciones a apps de IA ya se pagan hoy y se reasignan.

Sin costo de infraestructura, cualquier ahorro de tiempo ya deja el proyecto en positivo desde el primer día. Considerando solo los casos de lectura de Fase 1, el equilibrio se alcanza en la primera semana de uso.

**El análisis honesto no es sobre infraestructura, que es despreciable, sino sobre las horas de desarrollo interno.** El hallazgo de que la API ya existe —y de que tres de las cinco tools iniciales no requieren código nuevo en el CRM— reduce esas horas de forma significativa respecto de lo estimado en la v1.5.

---

## Decisiones Pendientes

1. ~~¿Cuál es el sistema operativo real del servidor?~~ — **Resuelto.** Windows Server 2012 R2, sin ESU, sin parches desde 11/2023

2. **¿Cuándo se planifica la migración del servidor de producción?**
   - **El tema más urgente de este documento, y el único que no es parte de este proyecto.** SO y motor de base de datos fuera de soporte simultáneamente

3. **¿Se aprueba la migración del esquema de contraseñas?**
   - **Actualizado en la v2.6: ya no es prerrequisito de este proyecto.** Con el diseño del 24/09/2026 el MCP nunca valida contraseñas, así que la identidad por persona avanza sin esperarlo
   - Sigue siendo una **decisión de seguridad del CRM**, con su propia prioridad y estimación. Que ya no bloquee este proyecto no lo vuelve menos necesario. Ver [Riesgo 2](#-riesgo-2--contraseñas-almacenadas-con-cifrado-reversible)

4. ~~¿Qué área arranca como piloto?~~ — **Resuelto: Secretaría Académica**

5. **¿Qué app de chat, Claude o ChatGPT?**
   - Recomendación: Claude. Verificado el 24/09/2026: los conectores remotos propios están en Free, Pro, Max, Team y Enterprise; en Team/Enterprise solo los Owners los agregan y **cada persona se autentica individualmente**
   - Descartado: ChatGPT Plus — no soporta conectores custom
   - **Criterio nuevo de la v2.6:** la **auditoría a nivel de conversación depende de la app**, no del MCP. El MCP registra llamadas a tools; qué se le preguntó al modelo solo queda registrado si la app lo provee (función de los planes Team / Enterprise). Si dirección quiere ese nivel de trazabilidad, la elección de app deja de ser solo preferencia

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

10. ~~¿Proveedor de VPS?~~ — **Resuelto (obsoleto).** La decisión del 23/09/2026 elimina el VPS nuevo: el MCP Server va en el VPS Windows existente, con Node 22 portable y riesgo aceptado por Max. Ver [Dónde vive el MCP Server](#dónde-vive-el-mcp-server-decisión-con-riesgo-aceptado)

11. **¿Cómo se expone el endpoint MCP por HTTPS en el servidor existente?**
   - Abierto desde la decisión del 23/09/2026. Hoy nginx escucha en 8443 **sin TLS** y el firewall entrante permite 80/443. Es tarea de Fase 1 y no tiene solución elegida
   - **Agregado en la v2.6:** ya no es solo una tarea de exposición. **Sin transporte remoto por HTTPS no hay identidad por persona**, porque el flujo OAuth 2.1 necesita `/authorize`, `/token` y sus metadatos alcanzables desde el navegador

### Abiertas desde la v2.6 (diseño de identidad, permisos y auditoría)

12. **¿Quién define la matriz rol → tools, y con qué contenido?**
   - `MCP_ALCANCE_ROL` es una decisión de negocio, no técnica: dice qué puede hacer cada rol **a través del agente**, que no es lo mismo que lo que puede hacer en el CRM
   - El borrador de `DISENO-API-MCP.md` §3.4 usa Secretaría Académica y Dirección como ejemplo. **La matriz real la tiene que validar Max**

13. **Si una persona tiene varios roles, ¿unión o elección?**
   - Propuesta: **unión** de las tools de todos sus roles, por simplicidad de uso
   - Alternativa: exigir que elija un rol al conectarse. Más preciso para auditaría, más fricción para la persona

14. **¿Cuánto se retiene la auditoría?**
   - Propuesta: **12 meses en el CRM** (`MCP_AUDITORIA`) y **30 días** de archivo local en `G:`
   - Condicionado por el disco: C: está al 89,7 %; el archivo local vive en G: con rotación y tope de tamaño

15. **¿Se aprueba el endpoint `/api-mcp` y su orden de construcción?**
   - Implica desarrollo en el CRM (handler, `/mcp-autorizar`, dos tablas nuevas y una pantalla). `DISENO-API-MCP.md` §8 tiene las siete preguntas abiertas que hay que contestar del lado del CRM antes de empezar

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
| Precedente de endpoint dedicado | `/api-presencia` (CRM, 21/09/2026) |
| Corrección del contrato de errores de `/api` | CRM, commit `e9746a91` (21/09/2026) — `existingResponse="Auto"` |

### Documentos complementarios de este proyecto

| Tema | Documento |
|---|---|
| Endpoint `/api-mcp`, identidad, permisos y auditoría | `DISENO-API-MCP.md` |
| Contrato de cada tool hacia el modelo | `DISENO-TOOLS-MCP.md` |

### Documentación externa

| Tema | Fuente |
|---|---|
| Especificación MCP 2026-07-28 | `modelcontextprotocol.io/specification/2026-07-28` |
| Cambios respecto de 2025-11-25 | `modelcontextprotocol.io/specification/2026-07-28/changelog` |
| Autorización MCP | `modelcontextprotocol.io/specification/2026-07-28/basic/authorization` |
| SDK oficial de TypeScript | `ts.sdk.modelcontextprotocol.io` |
| Registro de clientes: preregistro, CIMD, DCR | `modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration` |
| Developer Mode y conectores en ChatGPT | Centro de ayuda de OpenAI, art. 12584461 |
| Conectores remotos propios en Claude (planes, Owners, autenticación individual) | Centro de ayuda de Claude, *Get started with custom connectors using remote MCP* |
| Autenticación de conectores en Claude (OAuth, DCR, CIMD) | `claude.com/docs/connectors/building/authentication` |
| Soporte de MCP en Codex (Streamable HTTP, OAuth, CIMD) | Documentación de MCP de Codex |
| SDKs beta para la spec 2026-07-28 | Blog de MCP, *Beta SDKs for the 2026-07-28 MCP Spec Release Candidate* |
| Fin de soporte de Windows Server 2012 | `learn.microsoft.com/lifecycle` |

---

*Documento generado como parte del análisis de viabilidad del proyecto IA-ORGANIZACIONAL.*
*Versión 2.6 — revisada contra el estado del ecosistema MCP a septiembre de 2026, contra el código de Saberes-Terra y contra el servidor de producción (última verificación por SSH: 23/09/2026; auditoría de contrato de la API y verificaciones de conectores y SDK: 24/09/2026).*
*Diseño de endpoint, identidad, permisos y auditoría: `DISENO-API-MCP.md`. Contrato de las tools: `DISENO-TOOLS-MCP.md`.*
*Código y documentación del CRM citados contra `origin/main` @ `61a2ace3`.*
*Para consultas técnicas o ampliaciones, contactar al equipo de desarrollo.*
