import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { RawCourse, SaberesClient } from "../saberes-client.ts";
import {
  describeFailure,
  toProperNoun,
  toSentenceCase,
} from "../translation.ts";

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

export function toCourse(raw: RawCourse): Course {
  return {
    id: raw.id_curso,
    name: toSentenceCase(raw.Curso),
    organization: toProperNoun(raw.Organizacion),
  };
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
