import test from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  ApiMcpError,
  type CommissionPage,
  type CommissionSearchFilters,
  type CommissionSummary,
} from "../api-mcp-client.ts";
import {
  formatSearchResults,
  registerBuscarComision,
  type CommissionSearcher,
} from "./buscar-comision.ts";

/** Two hits as `/api-mcp` answers them: a reduced projection, already clean. */
const ONLINE: CommissionSummary = {
  id: 2672,
  codigo: "PRODUCCIÓN EXTENSIVA-D-OCTUBRE-2026",
  curso: { id: 28, nombre: "Producción Extensiva de Cereales y Oleaginosas" },
  organizacion: { id: 2, nombre: "Terra - Instituto de Formación Agropecuaria" },
  modalidad: "Online",
  es_virtual: true,
  estado: "inscripciones",
  disponible: true,
  inicio: "2026-10-15",
  localidad: null,
};

const PRESENCIAL: CommissionSummary = {
  id: 2424,
  codigo: "GESTIÓN CONTABLE-S-CORDOBA-2026",
  curso: { id: 131, nombre: "GESTIÓN CONTABLE APLICADA AL AGRO" },
  organizacion: { id: 1, nombre: "Fundación Educativa Saberes" },
  modalidad: "Presencial",
  es_virtual: false,
  estado: "inscripciones",
  disponible: true,
  inicio: null,
  localidad: "Córdoba",
};

type ToolArgs = {
  texto?: string | undefined;
  id_curso?: number | undefined;
  modalidad?: string | undefined;
  pagina?: string | undefined;
};

type ToolHandler = (args: ToolArgs) => Promise<{
  content: ReadonlyArray<{ type: string; text?: string }>;
  isError?: boolean;
}>;

/** Registers the tool on a server double and returns what the SDK received. */
function registered(client: CommissionSearcher): {
  name: string;
  config: { description?: string; inputSchema?: unknown };
  handler: ToolHandler;
} {
  let captured:
    | { name: string; config: { description?: string }; handler: ToolHandler }
    | undefined;

  const server = {
    registerTool(
      name: string,
      config: { description?: string },
      handler: unknown,
    ) {
      captured = { name, config, handler: handler as ToolHandler };
    },
  } as unknown as McpServer;

  registerBuscarComision(server, client);
  assert.ok(captured, "the tool was never registered");
  return captured;
}

/** A client double that records the filters and answers one page or fails. */
function clientAnswering(
  answer: CommissionPage | Error,
  capture?: { filters?: CommissionSearchFilters },
): CommissionSearcher {
  return {
    async searchCommissions(filters: CommissionSearchFilters = {}) {
      if (capture) capture.filters = filters;
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

function page(
  items: CommissionSummary[],
  nextCursor: string | null = null,
): CommissionPage {
  return { items, nextCursor, hasMore: nextCursor !== null };
}

test("each hit carries the data the agent needs to choose", () => {
  const text = formatSearchResults(page([ONLINE, PRESENCIAL]));

  assert.match(text, /id 2672/);
  assert.match(text, /PRODUCCIÓN EXTENSIVA-D-OCTUBRE-2026/);
  assert.match(text, /Producción Extensiva de Cereales y Oleaginosas/);
  assert.match(text, /Terra - Instituto de Formación Agropecuaria/);
  assert.match(text, /online/);
  assert.match(text, /inscripciones/);
  assert.match(text, /2026-10-15/);
  assert.match(text, /Córdoba/);
  // A shouted course name is read as a sentence; the organization is not
  // re-cased at all.
  assert.match(text, /Gestión contable aplicada al agro/);
  assert.ok(!text.includes("GESTIÓN CONTABLE APLICADA AL AGRO"));
  assert.ok(text.includes("Fundación Educativa Saberes"));
});

test("a field the CRM has nothing for is simply not mentioned", () => {
  const text = formatSearchResults(page([ONLINE]));

  assert.ok(!text.includes("null"));
  assert.ok(!text.includes("localidad"));
});

test("R6: when there are more results, the agent is told how to see them", () => {
  const text = formatSearchResults(page([ONLINE, PRESENCIAL], "c2VnLTQw"));

  assert.match(text, /más/);
  assert.match(text, /pagina: "c2VnLTQw"/);
  assert.match(text, /buscar_comision/);
});

test("a single result is counted in the singular, paginated or not", () => {
  assert.match(formatSearchResults(page([ONLINE])), /Encontré 1 comisión:/);
  assert.match(
    formatSearchResults(page([ONLINE], "c2VnLTQw")),
    /Te muestro 1 comisión,/,
  );
});

test("more results without a cursor still warn instead of going silent", () => {
  const text = formatSearchResults({
    items: [ONLINE],
    nextCursor: null,
    hasMore: true,
  });

  // The agent must not conclude it saw everything just because there is no
  // token to ask with.
  assert.match(text, /no asumas que esto es todo/i);
  assert.ok(!text.includes("pagina:"));
});

test("the last page says nothing about pagination", () => {
  const text = formatSearchResults(page([ONLINE, PRESENCIAL]));

  assert.ok(!text.includes("pagina:"));
  assert.ok(!text.includes("más resultados"));
});

test("no results is a plain sentence, not a failure", async () => {
  const { handler } = registered(clientAnswering(page([])));

  const result = await handler({ texto: "submarinismo" });
  const text = result.content[0]?.text ?? "";

  assert.equal(result.isError, undefined);
  assert.match(text, /No encontré comisiones/);
  // The way out is offered, so the agent does not retry the same search.
  assert.match(text, /listar_cursos/);
});

test("the filters the agent gave travel to the API, and only those", async () => {
  const capture: { filters?: CommissionSearchFilters } = {};
  const { handler } = registered(clientAnswering(page([ONLINE]), capture));

  await handler({ texto: "apicultura", id_curso: 61, modalidad: "online" });

  assert.deepEqual(capture.filters, {
    texto: "apicultura",
    idCurso: 61,
    modalidad: "online",
    limit: 10,
  });
});

test("a search with no filters lists the open commissions", async () => {
  const capture: { filters?: CommissionSearchFilters } = {};
  const { handler } = registered(clientAnswering(page([ONLINE]), capture));

  await handler({});

  // R6: the page size is fixed by this layer, never by the agent.
  assert.deepEqual(capture.filters, { limit: 10 });
});

test("the page token is sent back as the opaque cursor it is", async () => {
  const capture: { filters?: CommissionSearchFilters } = {};
  const { handler } = registered(clientAnswering(page([ONLINE]), capture));

  await handler({ texto: "apicultura", pagina: "c2VnLTQw" });

  assert.deepEqual(capture.filters, {
    texto: "apicultura",
    cursor: "c2VnLTQw",
    limit: 10,
  });
});

test("the pagination line reaches the agent through the tool", async () => {
  const { handler } = registered(clientAnswering(page([ONLINE], "c2VnLTQw")));

  const result = await handler({ texto: "produccion" });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /pagina: "c2VnLTQw"/);
});

test("a rejected search is an error, without the internal wording", async () => {
  const { handler } = registered(
    clientAnswering(new ApiMcpError("bad_request", "internal detail", 400)),
  );

  const result = await handler({ modalidad: "telepatía" });

  assert.equal(result.isError, true);
  const text = result.content[0]?.text ?? "";
  assert.ok(text.length > 0);
  assert.ok(!text.includes("internal detail"));
  assert.ok(!text.includes("No encontré comisiones"));
});

test("the tool is registered with its name and its purpose", () => {
  const { name, config } = registered(clientAnswering(page([ONLINE])));

  assert.equal(name, "buscar_comision");
  assert.match(String(config.description), /detalle_comision/);
  assert.match(String(config.description), /comisiones/i);
});

test("the input schema is strict and bounds the free text", () => {
  const { config } = registered(clientAnswering(page([ONLINE])));
  const schema = config.inputSchema as {
    safeParse: (value: unknown) => { success: boolean; data?: ToolArgs };
  };

  assert.equal(schema.safeParse({}).success, true);
  assert.equal(schema.safeParse({ texto: "apicultura" }).success, true);
  assert.equal(schema.safeParse({ texto: "a" }).success, false);
  assert.equal(schema.safeParse({ texto: "a".repeat(101) }).success, false);
  assert.equal(schema.safeParse({ id_curso: 0 }).success, false);
  assert.equal(schema.safeParse({ id_curso: 1.5 }).success, false);
  assert.equal(schema.safeParse({ pagina: "c2VnLTQw" }).success, true);
  assert.equal(schema.safeParse({ otro: "x" }).success, false);

  // The text is trimmed before it is measured, so " a " is not a search.
  assert.equal(schema.safeParse({ texto: "  apicultura  " }).data?.texto, "apicultura");
  assert.equal(schema.safeParse({ texto: "  a  " }).success, false);
});
