import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { SaberesClient } from "./saberes-client.ts";
import { registerListarCursos } from "./tools/listar-cursos.ts";

const DEFAULT_API_URL = "https://saberes.com.ar/api";

/**
 * Reads the token from the environment.
 *
 * The token is never read from a file inside the repository and never has a
 * default: failing loudly at startup is better than a server that answers every
 * question with an authentication error.
 */
function requireToken(): string {
  const token = process.env["SABERES_API_TOKEN"]?.trim();
  if (!token) {
    // stderr, never stdout: stdout is the MCP protocol channel.
    process.stderr.write(
      "saberes-mcp: SABERES_API_TOKEN is not set. Provide it through the environment.\n",
    );
    process.exit(1);
  }
  return token;
}

const client = new SaberesClient({
  baseUrl: process.env["SABERES_API_URL"]?.trim() || DEFAULT_API_URL,
  token: requireToken(),
});

const server = new McpServer({ name: "saberes-mcp", version: "0.1.0" });

registerListarCursos(server, client);

await server.connect(new StdioServerTransport());
