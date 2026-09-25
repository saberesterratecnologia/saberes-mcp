# Decisión: identidad por persona — postergada

**Fecha:** 24/09/2026
**Decide:** Max
**Estado:** ⏸️ Postergada. El MVP avanza con identidad **por rol**, no por persona.
**Documentos relacionados:** `DISENO-API-MCP.md` (§2 identidad, §3 permisos, §5 auditoría), `PROPUESTA-AGENTES-IA.md` v2.6

---

## El requerimiento

La organización pidió que el agente se use bien "antes de que ocurra una catástrofe": permisos
distintos según el rol, medir el uso y saber **exactamente quién hizo qué**.

## El hallazgo que lo condiciona

Hoy el equipo usa **un único usuario de ChatGPT compartido** entre todas las personas, cada una
desde su máquina. El desarrollo usa aparte un Claude Max 20x compartido entre dos personas.

Con un usuario compartido, **la identidad por persona es imposible**, cualquiera sea el diseño del MCP:

- El conector MCP de ChatGPT (y el conector remoto de Claude) se autoriza **por cuenta**, no por
  chat ni por máquina: quien llama al MCP es la nube del proveedor en nombre de la cuenta. Si una
  persona se loguea, todas pasan a ser esa persona, en todas las máquinas.
- **Identidad "por chat" no sirve**: en una cuenta compartida cualquiera puede abrir y continuar el
  chat de otra persona, así que la auditoría atribuiría acciones a la persona equivocada con total
  seguridad. Una auditoría falsa es peor que una auditoría por área.
- **Ninguna clave por chat** (PIN, código) sirve: queda en el historial compartido.
- La regla: la identidad tiene que estar atada a algo que **solo** tenga esa persona. En una cuenta
  compartida no existe nada así.

## Opciones evaluadas

| Opción | Qué logra | Costo |
|---|---|---|
| **A. Usuario propio por persona** (en el plan de ChatGPT que tengan, o Claude Team) | Identidad, permisos por rol, auditoría por persona, escritura segura | Licencias por persona: US$25/mes (US$20 anual) en Claude Team o ChatGPT Business. Si el plan de GPT es realmente Enterprise, puede haber licencias ya pagas sin asignar |
| **B. LibreChat** (interfaz open source propia) + API por uso | Lo mismo que A, sin licencias; conversaciones en base propia | VPS Linux (~US$15/mes) + API por uso + mantenimiento. Estimado para 5 personas usando el agente: ~US$50–80/mes vs US$125 en licencias. Deja de ser más barato si reemplaza a ChatGPT para todo uso |
| **C. Identidad de área** con la cuenta compartida | Permisos por rol; auditoría por rol/área, no por persona | Nada |

Verificado en documentación oficial el 24/09/2026:

- **LibreChat** guarda la autorización OAuth de cada servidor MCP **por usuario** ("Each user gets
  their own isolated connection to MCP servers"), con PKCE, renovación de tokens y cliente
  preconfigurado; habilita servidores por rol.
- **ChatGPT Enterprise**: el admin publica el conector, RBAC por grupos, cada miembro autoriza con
  OAuth individual, Compliance Logs Platform con conversaciones y conexiones de conectores. Se vende
  por licencia (fuentes de terceros reportan mínimo ~150 y ~US$60 c/u: no oficial).
- **La auditoría de conversaciones no viene en los planes Team/Business** ni en Claude Team: es de
  Enterprise en ambos proveedores. (Corrige lo que se había dicho antes en esta conversación.)
- Las **suscripciones no se pueden usar como API**: son productos separados; los atajos no oficiales
  violan las condiciones de uso.
- Precios de API (oficiales, 24/09/2026, por millón de tokens entrada/salida): GPT-6 Sol US$2/US$10,
  GPT-6 Luna US$0,10/US$0,50, Claude Sonnet 5 US$2/US$10, Claude Haiku 4.5 US$1/US$5. Una consulta
  típica del agente (~12k tokens de entrada, ~600 de salida) cuesta ~US$0,03 con Sol o Sonnet.

## La decisión

Max la charló con el equipo: **la opción B (LibreChat) gustó, pero no ahora**. El MVP avanza con la
**opción C**: el MCP identifica el **rol**, no la persona.

## Qué implica para el MVP (límites que no se negocian)

- La auditoría registra **rol/área**, no persona. No responde "quién fue".
- Nada de datos personales de estudiantes (`estado_de_persona` sigue bloqueada) mientras no haya
  identidad por persona.
- Un MCP **remoto sin login** no se expone a internet, y menos con acciones de escritura: cualquiera
  que conozca la URL podría operar el CRM.
- Toda escritura del MVP requiere confirmación humana explícita antes de ejecutarse, es reversible
  (sin borrados), idempotente y queda auditada por rol.

## Cuándo se revisa

Antes de cualquiera de estas cosas, la identidad por persona deja de ser opcional:

1. Habilitar datos personales de estudiantes.
2. Escrituras que no se puedan revertir o que notifiquen a terceros.
3. Que dirección exija saber qué persona hizo cada acción.

En ese momento se retoma con los números de este documento, midiendo primero el costo real de la
opción B con una prueba de 2 a 4 semanas.
