import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ApiMcpClient, Course } from "../api-mcp-client.ts";
import { describeFailure, normalizeDisplayName } from "../translation.ts";

/**
 * What this tool needs from the client, and nothing else.
 *
 * Depending on the capability instead of the class keeps the tool testable
 * without a fake HTTP layer, and states in the type what the tool is allowed
 * to do with the API.
 */
export type CourseLister = Pick<ApiMcpClient, "listCourses">;

/**
 * Where a course with no organization goes.
 *
 * The CRM answers `organizacion` on every course today, but the field is
 * optional in the contract: an unexpected absence must degrade into a bucket,
 * never into a crash in the middle of the catalogue.
 */
const NO_ORGANIZATION = "Sin organización";

/** One course as the listing reads it. */
interface ListedCourse {
  id: number;
  name: string;
  modality: string | undefined;
}

/**
 * Renders the catalogue grouped by organization.
 *
 * The grouping is not cosmetic: the same course name exists in several
 * organizations with different ids ("Apicultura" is 61, 70 and 126), so a flat
 * list would let the agent pick the wrong id and never notice.
 */
export function formatCourses(courses: readonly Course[]): string {
  if (courses.length === 0) {
    return "No hay cursos disponibles en este momento.";
  }

  const byOrganization = new Map<string, ListedCourse[]>();
  for (const course of courses) {
    // The organization name is shown exactly as the CRM wrote it: title case
    // would turn "Instituto de Formación" into "Instituto De Formación".
    const organization = course.organizacion?.nombre.trim() || NO_ORGANIZATION;
    const listed: ListedCourse = {
      id: course.id,
      name: normalizeDisplayName(course.nombre),
      modality: course.modalidad?.trim().toLocaleLowerCase("es-AR"),
    };
    const bucket = byOrganization.get(organization);
    if (bucket) bucket.push(listed);
    else byOrganization.set(organization, [listed]);
  }

  const total = courses.length;
  const heading = `Hay ${total} ${total === 1 ? "curso disponible" : "cursos disponibles"}:`;

  const organizations = [...byOrganization.keys()].sort(compareOrganizations);
  const sections = organizations.map((organization) => {
    const items = (byOrganization.get(organization) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, "es-AR"),
    );
    const lines = items
      .map((course) => {
        const modality = course.modality ? ` — ${course.modality}` : "";
        return `- ${course.name} (id ${course.id})${modality}`;
      })
      .join("\n");
    return `\n**${organization}**\n${lines}`;
  });

  // Without this line the agent has the ids but not what they are for.
  const hint =
    "\nUsá el id de un curso con buscar_comision para ver sus comisiones.";

  return [heading, ...sections, hint].join("\n");
}

/** Alphabetical, with the fallback bucket last so it never leads. */
function compareOrganizations(a: string, b: string): number {
  if (a === NO_ORGANIZATION) return 1;
  if (b === NO_ORGANIZATION) return -1;
  return a.localeCompare(b, "es-AR");
}

export function registerListarCursos(
  server: McpServer,
  client: CourseLister,
): void {
  server.registerTool(
    "listar_cursos",
    {
      title: "Listar cursos disponibles",
      description:
        "Devuelve todos los cursos que la institución tiene disponibles actualmente, agrupados por organización. No requiere parámetros. Usala cuando alguien pregunte qué cursos hay, qué se puede estudiar, o para encontrar el id de un curso antes de buscar sus comisiones con buscar_comision. Mencioná siempre la organización de cada curso: el mismo nombre de curso puede existir en varias organizaciones con ids distintos.",
      inputSchema: {},
    },
    async () => {
      try {
        const courses = await client.listCourses();
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
