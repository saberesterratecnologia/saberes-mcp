# Feature: MCP Server en el VPS Windows existente

**Objetivo**: registrar en los documentos la decisión de alojar el MCP Server en el VPS
Windows de producción (DonWeb, Server 2012 R2) en lugar de un VPS Linux aparte, con el
riesgo explícitamente aceptado por Max el 23/09/2026.

**Rama**: `docs/mcp-en-vps-windows` (desde `feat/listar-cursos`)

---

## Contexto congelado (verificado por SSH, solo lectura, el 2026-09-23)

- Node del sistema: **v20.16.0** (EOL 30/04/2026), compartido por 9 servicios node-windows
  en `G:\Carpetas de sistema\Desktop\Servicios\microservices\` + nginx 1.28.1 por nssm.
- nginx escucha en **8443 sin TLS** (`utils.institutoterra.com.ar`); firewall entrante: 80/443.
- Disco: C: 3,6 GB libres · **G: 13,9 GB libres** · E/F 0,7 GB. RAM libre 4,2 / 8 GB.
- **Node 22.20.0 portable arranca en 2012 R2** sin `NODE_SKIP_PLATFORM_CHECK` y hace HTTPS
  (probado en `G:\mcp-node-check`, carpeta borrada después).
- **Node 24 se niega**: "only supported on Windows 10, Windows Server 2016, or higher".
- `dist/` de saberes-mcp pasa el e2e (tools/list + tools/call contra prod) con Node 20.16 y 22.20.
- Decisión de Max: **Node 22 portable solo para el MCP**; no tocar el Node del sistema.

## Tareas

- [x] **T1 — Actualizar `PROPUESTA-AGENTES-IA.md` a v2.5** — delegado a gentle-ai-worker + corrección inline
  Arquitectura, justificación con riesgo aceptado, puesta en marcha, costos, plan de
  implementación, riesgos, preguntas abiertas, y la línea 119 desactualizada.

- [x] **T2 — Corregir `odd/tasks/mcp-server-fase-0.md`**
  T3 sin tildar (está hecho en `fbd5f0f`) y "sin pushear" (ya está pusheado).

- [x] **T3 — Commit de trabajo** en `docs/mcp-en-vps-windows` (identidad: ver `git log`, reportada al cerrar).

## Bitácora

- **2026-09-23** — Max recordaba haber decidido "todo en el VPS Windows"; no había registro
  (ni en memoria ni en git). Verificado por SSH que el argumento "Runtime" de la v2.4 era falso
  en la práctica. Max acepta el riesgo y decide ir al VPS Windows con Node 22 portable.
- **2026-09-23** — T1: el writer reescribió 15 secciones. Corrección inline sobre su trabajo:
  la mitigación del riesgo 1 decía "el MCP solo hace llamadas salientes", lo que ocultaba
  que el conector remoto necesita **recibir** HTTPS desde internet. Reescrita en las dos tablas
  y en la regla de diseño del riesgo 7: MCP escucha solo en `127.0.0.1`, publicado como ruta
  del nginx existente, sin puerto nuevo, con autenticación obligatoria.
