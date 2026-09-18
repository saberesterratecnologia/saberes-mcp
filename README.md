# Saberes MCP

A Model Context Protocol (MCP) server that will expose the Saberes CRM RPC API to a conversational agent.

## Prerequisites

- Node.js 22 or later
- A Saberes API token provided outside this repository

## Install

```sh
npm install
```

## Build and run

```sh
npm run build
npm run start
```

For development, run:

```sh
npm run dev
```

## Configuration

Provide these variables through the environment at run time:

| Variable | Description |
| --- | --- |
| `SABERES_API_URL` | The RPC endpoint. Defaults to `https://saberes.com.ar/api`. |
| `SABERES_API_TOKEN` | The API token sent in the `X-Api-Token` header. |

The real token lives outside the repository, is never committed, and is supplied through the environment at run time.
