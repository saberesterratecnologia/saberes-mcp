import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  SaberesApiError,
  type RawCourse,
  type SaberesClient,
} from "../saberes-client.ts";

/**
 * A course as the agent should see it.
 *
 * This is deliberately not the wire shape. The API answers with `id_curso`,
 * `Curso` and `Organizacion` in mixed capitalization and upper-case values,
 * because it was built for machine consumers that already knew the schema.
 * Translating here is the whole point of this layer: the MCP server is an
 * anticorruption layer over an RPC API, not a proxy for it.
 */
export interface Course {
  id: number;
  name: string;
  organization: string;
}

function upperFirst(value: string): string {
  const first = value.slice(0, 1).toLocaleUpperCase("es-AR");
  return first + value.slice(1);
}

/**
 * Course titles use sentence case, which is the Spanish convention: only the
 * first word is capitalized. English title case would produce "Elaboración De
 * Cerveza Artesanal", capitalizing prepositions and conjunctions, which reads
 * as a translation artifact.
 */
function toSentenceCase(value: string): string {
  return upperFirst(value.toLocaleLowerCase("es-AR"));
}

/**
 * Organization names are proper nouns, so every word is capitalized. They are
 * short and known — "Instituto Terra", "Fundación Saberes" — so there is no
 * minor-word problem to solve here.
 */
function toProperNoun(value: string): string {
  return value
    .toLocaleLowerCase("es-AR")
    .split(/(\s+)/)
    .map(upperFirst)
    .join("");
}

export function toCourse(raw: RawCourse): Course {
  return {
    id: raw.id_curso,
    name: toSentenceCase(raw.Curso),
    organization: toProperNoun(raw.Organizacion),
  };
}

/**
 * Explains a failure in terms the agent can relay to a person.
 *
 * Each case is selected by the error's `kind`, never by matching message text.
 */
export function describeFailure(error: unknown): string {
  if (!(error instanceof SaberesApiError)) {
    return "No pude consultar los cursos por un error inesperado del servidor MCP.";
  }
  switch (error.kind) {
    case "authentication_failed":
      return "No pude autenticarme contra el sistema Saberes. El token de la integración no es válido o el cliente está desactivado. Avisale al equipo técnico; no es algo que puedas resolver desde acá.";
    case "action_not_allowed":
      return "Esta integración no tiene permiso para consultar los cursos. El permiso se otorga en el CRM, por el equipo técnico.";
    case "timeout":
      return "El sistema Saberes no respondió a tiempo. Puede ser algo pasajero: probá de nuevo en un momento.";
    case "network_error":
      return "No pude conectarme al sistema Saberes. Puede estar caído o haber un problema de red.";
    case "server_error":
      return "El sistema Saberes falló al procesar la consulta. El error quedó registrado del lado del CRM para que lo revisen.";
    case "invalid_json":
    case "bad_request":
    case "method_not_allowed":
    case "unexpected_status":
      return "El sistema Saberes respondió de una forma que no pude interpretar. Avisale al equipo técnico.";
  }
}

/** Renders the courses as a list a person can read. */
export function formatCourses(courses: readonly Course[]): string {
  if (courses.length === 0) {
    return "No hay cursos disponibles en este momento.";
  }

  const byOrganization = new Map<string, Course[]>();
  for (const course of courses) {
    const bucket = byOrganization.get(course.organization);
    if (bucket) bucket.push(course);
    else byOrganization.set(course.organization, [course]);
  }

  const total = courses.length;
  const heading = `Hay ${total} ${total === 1 ? "curso disponible" : "cursos disponibles"}:`;

  const sections = [...byOrganization.entries()].map(([organization, items]) => {
    const lines = items
      .map((course) => `- ${course.name} (id ${course.id})`)
      .join("\n");
    return `\n**${organization}**\n${lines}`;
  });

  return [heading, ...sections].join("\n");
}

export function registerListarCursos(
  server: McpServer,
  client: SaberesClient,
): void {
  server.registerTool(
    "listar_cursos",
    {
      title: "Listar cursos disponibles",
      description:
        "Devuelve todos los cursos que la institución tiene disponibles actualmente, agrupados por organización. No requiere parámetros. Usala cuando alguien pregunte qué cursos hay, qué se puede estudiar, o para encontrar el id de un curso antes de consultar sus comisiones.",
      inputSchema: {},
    },
    async () => {
      try {
        const courses = (await client.listCourses()).map(toCourse);
        return { content: [{ type: "text", text: formatCourses(courses) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: describeFailure(error) }],
          isError: true,
        };
      }
    },
  );
}
