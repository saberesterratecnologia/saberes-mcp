import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type {
  ApiMcpClient,
  CommissionPage,
  CommissionSearchFilters,
  CommissionSummary,
} from "../api-mcp-client.ts";
import { describeFailure, normalizeDisplayName } from "../translation.ts";

/** What this tool needs from the client, and nothing else. */
export type CommissionSearcher = Pick<ApiMcpClient, "searchCommissions">;

/**
 * R6: the page size is decided here, not by the agent.
 *
 * Ten commissions are enough to choose from and small enough that the answer
 * stays readable. A bigger page would spend the model's context on results
 * nobody asked for; the cursor is there for the rest.
 */
const PAGE_SIZE = 10;

const NO_RESULTS =
  "No encontré comisiones con esos criterios. Probá con un texto más general, quitá algún filtro, o usá listar_cursos para ver qué cursos existen.";

/** One line per field, so the agent can read a hit without parsing anything. */
function formatCommission(commission: CommissionSummary): string {
  const lines = [
    `- ${commission.codigo} (id ${commission.id})`,
    `  curso: ${normalizeDisplayName(commission.curso.nombre)}`,
    // The organization is named on every hit: the same course exists in
    // several organizations, and shown as the CRM wrote it.
    `  organización: ${commission.organizacion.nombre.trim()}`,
  ];

  const modality = commission.modalidad?.trim().toLocaleLowerCase("es-AR");
  if (modality) lines.push(`  modalidad: ${modality}`);

  const state = commission.estado?.trim().toLocaleLowerCase("es-AR");
  if (state) lines.push(`  estado: ${state}`);

  // An absent datum is not mentioned at all: "inicio: null" would be noise the
  // agent could relay as if it meant something.
  if (commission.inicio) lines.push(`  inicio: ${commission.inicio}`);
  if (commission.localidad) lines.push(`  localidad: ${commission.localidad}`);

  return lines.join("\n");
}

/**
 * Renders one page of results.
 *
 * R6 lives in the last line: when the endpoint says there is more, the agent
 * is told so explicitly and given the exact cursor to ask for it. Silence
 * there would let the model answer "these are all the commissions" after
 * having seen ten of forty.
 */
export function formatSearchResults(page: CommissionPage): string {
  if (page.items.length === 0) return NO_RESULTS;

  const total = page.items.length;
  const noun = total === 1 ? "comisión" : "comisiones";
  const heading = page.hasMore
    ? `Te muestro ${total} ${noun}, y hay más que coinciden:`
    : `Encontré ${total} ${noun}:`;

  const blocks = page.items.map(formatCommission);

  const parts = [heading, ...blocks];

  if (page.hasMore) {
    parts.push(
      page.nextCursor === null
        ? "Hay otras comisiones que no entraron en esta respuesta. Afiná la búsqueda para verlas: no asumas que esto es todo."
        : `Hay otras comisiones que no entraron en esta respuesta. Para verlas, volvé a llamar a buscar_comision con pagina: "${page.nextCursor}". No asumas que esto es todo.`,
    );
  }

  return parts.join("\n\n");
}

const inputSchema = z.strictObject({
  texto: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .optional()
    .describe(
      "Texto libre a buscar en el código de la comisión y el nombre del curso. Ej: 'apicultura'. No hace falta poner tildes.",
    ),
  id_curso: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Filtro por curso, si ya resolviste su id con listar_cursos"),
  modalidad: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Filtro por modalidad, por ejemplo 'online' o 'presencial'"),
  pagina: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Token de la página siguiente, tal cual lo devolvió una llamada anterior. No lo inventes ni lo modifiques.",
    ),
});

export function registerBuscarComision(
  server: McpServer,
  client: CommissionSearcher,
): void {
  server.registerTool(
    "buscar_comision",
    {
      title: "Buscar comisiones",
      description:
        "Busca comisiones por texto libre (nombre del curso o código de la comisión) y, si querés, por curso o modalidad. Sin filtros devuelve las comisiones abiertas a inscripción. Usala siempre antes de detalle_comision cuando la persona mencione una comisión o un curso por nombre y no por número: el id que devuelve es el que va en detalle_comision. Nombrá siempre la organización de cada comisión, porque el mismo curso existe en varias. Si hay más de una coincidencia, preguntale a la persona cuál antes de seguir: no elijas por tu cuenta.",
      inputSchema,
    },
    async ({ texto, id_curso, modalidad, pagina }) => {
      const filters: CommissionSearchFilters = { limit: PAGE_SIZE };
      if (texto !== undefined) filters.texto = texto;
      if (id_curso !== undefined) filters.idCurso = id_curso;
      if (modalidad !== undefined) filters.modalidad = modalidad;
      // The cursor is opaque: it is relayed exactly as it was handed out.
      if (pagina !== undefined) filters.cursor = pagina;

      try {
        const page = await client.searchCommissions(filters);
        return {
          content: [{ type: "text", text: formatSearchResults(page) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: describeFailure(error) }],
          isError: true,
        };
      }
    },
  );
}
