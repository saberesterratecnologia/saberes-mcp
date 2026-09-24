import test from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ApiMcpError, type Course } from "../api-mcp-client.ts";
import {
  formatCourses,
  registerListarCursos,
  type CourseLister,
} from "./listar-cursos.ts";

/**
 * A slice of the catalogue as production answered on 2026-09-24: four
 * organizations, and the same course name repeated across three of them. That
 * repetition is the whole reason the listing groups by organization.
 */
const CATALOGUE: Course[] = [
  {
    id: 61,
    nombre: "Apicultura",
    modalidad: "Online",
    es_virtual: true,
    organizacion: { id: 1, nombre: "Fundación Educativa Saberes" },
  },
  {
    id: 70,
    nombre: "Apicultura",
    modalidad: "Presencial",
    es_virtual: false,
    organizacion: {
      id: 2,
      nombre: "Terra - Instituto de Formación Agropecuaria",
    },
  },
  {
    id: 126,
    nombre: "Apicultura",
    modalidad: "Online",
    es_virtual: true,
    organizacion: {
      id: 3,
      nombre: "Escuela de Recibidores de Granos de Paraguay",
    },
  },
  {
    id: 28,
    nombre: "Producción Extensiva de Cereales y Oleaginosas",
    modalidad: "Online",
    es_virtual: true,
    organizacion: {
      id: 2,
      nombre: "Terra - Instituto de Formación Agropecuaria",
    },
  },
  {
    id: 131,
    nombre: "GESTIÓN CONTABLE APLICADA AL AGRO",
    modalidad: null,
    es_virtual: false,
    organizacion: {
      id: 4,
      nombre: "Escuela de Recibidores de Granos de Uruguay",
    },
  },
];

type ToolHandler = () => Promise<{
  content: ReadonlyArray<{ type: string; text?: string }>;
  isError?: boolean;
}>;

/** Registers the tool on a server double and returns what the SDK received. */
function registered(client: CourseLister): {
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

  registerListarCursos(server, client);
  assert.ok(captured, "the tool was never registered");
  return captured;
}

/** A client double that answers a catalogue or fails. */
function clientAnswering(answer: Course[] | Error): CourseLister {
  return {
    async listCourses() {
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

/** The lines that belong to one organization heading. */
function sectionOf(text: string, organization: string): string {
  const sections = text.split("\n**");
  const section = sections.find((part) => part.startsWith(`${organization}**`));
  assert.ok(section, `the section of ${organization} is missing`);
  return section;
}

test("courses are grouped by organization, with the repeated names apart", () => {
  const text = formatCourses(CATALOGUE);

  assert.match(text, /Hay 5 cursos disponibles/);
  for (const organization of [
    "Fundación Educativa Saberes",
    "Terra - Instituto de Formación Agropecuaria",
    "Escuela de Recibidores de Granos de Paraguay",
    "Escuela de Recibidores de Granos de Uruguay",
  ]) {
    assert.equal(
      text.split(`**${organization}**`).length - 1,
      1,
      `${organization} should head exactly one section`,
    );
  }

  // "Apicultura" exists three times with three different ids: each one has to
  // sit under its own organization, or the agent cannot tell them apart.
  assert.match(sectionOf(text, "Fundación Educativa Saberes"), /Apicultura \(id 61\)/);
  assert.match(
    sectionOf(text, "Terra - Instituto de Formación Agropecuaria"),
    /Apicultura \(id 70\)/,
  );
  assert.match(
    sectionOf(text, "Escuela de Recibidores de Granos de Paraguay"),
    /Apicultura \(id 126\)/,
  );
});

test("organization names are shown exactly as the CRM wrote them", () => {
  const text = formatCourses(CATALOGUE);

  // Title-casing them would produce "Terra - Instituto De Formación
  // Agropecuaria", with a capitalized preposition that nobody wrote.
  assert.ok(text.includes("**Terra - Instituto de Formación Agropecuaria**"));
  assert.ok(text.includes("**Escuela de Recibidores de Granos de Paraguay**"));
  assert.ok(!text.includes("De Formación"));
  assert.ok(!text.includes("De Granos"));
});

test("a name that arrives shouted is read as a sentence", () => {
  const text = formatCourses(CATALOGUE);

  assert.ok(text.includes("Gestión contable aplicada al agro"));
  assert.ok(!text.includes("GESTIÓN CONTABLE APLICADA AL AGRO"));
});

test("each course carries its id and its modality when there is one", () => {
  const text = formatCourses(CATALOGUE);

  assert.match(text, /- Apicultura \(id 61\) — online/);
  assert.match(text, /- Apicultura \(id 70\) — presencial/);
  // A course with no modality simply does not mention one.
  assert.match(text, /- Gestión contable aplicada al agro \(id 131\)\n/);
});

test("courses are sorted by the name the agent reads", () => {
  const section = sectionOf(
    formatCourses(CATALOGUE),
    "Terra - Instituto de Formación Agropecuaria",
  );
  const apicultura = section.indexOf("Apicultura");
  const produccion = section.indexOf("Producción Extensiva");

  assert.ok(apicultura > -1 && produccion > -1, section);
  assert.ok(apicultura < produccion, section);
});

test("a course without organization is grouped instead of crashing", () => {
  const text = formatCourses([
    { id: 99, nombre: "Apicultura", modalidad: null, es_virtual: false },
  ]);

  assert.match(text, /Hay 1 curso disponible/);
  assert.ok(text.includes("**Sin organización**"));
});

test("the listing tells the agent what to do with the id", () => {
  const text = formatCourses(CATALOGUE);

  assert.match(text, /buscar_comision/);
});

test("an empty catalogue is stated plainly, not as an error", () => {
  assert.equal(formatCourses([]), "No hay cursos disponibles en este momento.");
});

test("the tool keeps its name and takes no parameters", () => {
  const { name, config } = registered(clientAnswering(CATALOGUE));

  assert.equal(name, "listar_cursos");
  assert.match(String(config.description), /cursos/i);
  assert.deepEqual(config.inputSchema, {});
});

test("the catalogue reaches the agent as text", async () => {
  const { handler } = registered(clientAnswering(CATALOGUE));

  const result = await handler();

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /Hay 5 cursos disponibles/);
});

test("a failure is reported as an error, without the internal wording", async () => {
  const { handler } = registered(
    clientAnswering(new ApiMcpError("authentication_failed", "internal detail")),
  );

  const result = await handler();

  assert.equal(result.isError, true);
  const text = result.content[0]?.text ?? "";
  assert.ok(text.length > 0);
  assert.ok(!text.includes("internal detail"));
});
