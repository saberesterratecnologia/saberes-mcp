# Saberes MCP

A Model Context Protocol (MCP) server that exposes the Saberes CRM to a conversational agent (Claude Desktop, Codex, ChatGPT) for the Academic Secretariat.

It is a translation layer, not a proxy: each tool is designed around a task, projects only the fields the task needs, and turns CRM data and failures into answers a model can use safely.

## Status

| Piece | State |
| --- | --- |
| Transport | stdio (single-person pilot). Remote HTTPS with OAuth is designed, not built |
| `listar_cursos` | ✅ Lists the courses on offer, grouped by organization |
| `detalle_comision` | ✅ Details of one commission; fees only on request |
| `buscar_comision` | Designed, waiting for the `/api-mcp` endpoint |
| `estado_de_persona` | Blocked until management decides on student PII |

The server currently talks to the CRM's shared `/api` endpoint. It will move to a dedicated `/api-mcp` endpoint (see `DISENO-API-MCP.md`), which removes most of the translation that only compensates for `/api`'s contract.

## Prerequisites

- Node.js 22 (the production host runs Windows Server 2012 R2, where Node 24 does not start)
- A Saberes API token provided outside this repository

## Install, build and run

```sh
npm install
npm run build
npm run start
```

For development:

```sh
npm run dev
```

## Configuration

Provide these variables through the environment at run time:

| Variable | Description |
| --- | --- |
| `SABERES_API_URL` | The RPC endpoint. Defaults to `https://saberes.com.ar/api`. |
| `SABERES_API_TOKEN` | The API token sent in the `X-Api-Token` header. Required: the server refuses to start without it. |

The real token lives outside the repository, is never committed (`*.token` and `.env` are ignored), and is supplied through the environment at run time. Diagnostics go to stderr; stdout is the MCP protocol channel.

## Connect it to Claude Desktop (pilot)

Add the server to `claude_desktop_config.json` with `node` and the absolute path to `dist/index.js`, and pass `SABERES_API_TOKEN` in its `env`.

If Claude Desktop was installed from the Microsoft Store (MSIX), the file is **not** in `%APPDATA%\Claude` but in `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude\`. Use a regular chat: project and Code sessions do not load these connectors.

## Tests

```sh
npm test          # node:test, no network: the HTTP client is tested with an injected fetch
npm run typecheck
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/saberes-client.ts` | HTTP client for the CRM. Routes by status code only, never follows redirects, never leaks the token |
| `src/translation.ts` | Shared translation rules: casing, `"S/D"` sentinel, dates, integers, failure messages |
| `src/tools/` | One file per tool, with its tests |
| `src/index.ts` | Wiring and stdio transport |

## Documents

| Document | Audience | Content |
| --- | --- | --- |
| `PROPUESTA-AGENTES-IA.md` | Management and tech team | Why, scope, architecture, risks, costs, plan |
| `DISENO-TOOLS-MCP.md` | Implementers | Contract of each tool towards the model, measured CRM contract |
| `DISENO-API-MCP.md` | Implementers, CRM team | Dedicated `/api-mcp` endpoint, per-person identity, permissions and audit |
| `odd/tasks/` | Implementers | Task log of each feature, with the commit that closed each task |
