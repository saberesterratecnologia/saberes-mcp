import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ApiMcpClient, Commission, Fees } from "../api-mcp-client.ts";
import { describeFailure, normalizeDisplayName } from "../translation.ts";

/** What this tool needs from the client, and nothing else. */
export type CommissionReader = Pick<ApiMcpClient, "getCommission">;

/**
 * The fees of a commission.
 *
 * `/api-mcp` sends amounts as numbers and hides the ones the business does not
 * publish by omitting the key, so there is nothing to parse here: only the
 * amounts that came through are projected, with their currency and the note
 * that qualifies the promotional ones.
 */
export interface CommissionFees {
  moneda: string;
  inscripcion_regular?: number;
  inscripcion_promocionada?: number;
  cuota_regular?: number;
  cuota_promocionada?: number;
  pago_unico?: number;
  cuota_con_recargo?: number;
  certificacion?: number;
  nota_promocion?: string;
}

/**
 * A commission as the agent should see it.
 *
 * Every key the CRM has no value for is omitted rather than sent as `null`, so
 * the agent never has to decide what a null means. `disponible` and
 * `es_virtual` are the exception on purpose: `false` is data there, and the
 * whole point of `es_virtual` is to explain why a virtual commission has no
 * `localidad`.
 */
export interface CommissionDetail {
  id: number;
  nombre: string;
  curso: string;
  id_curso: number;
  organizacion: string;
  modalidad?: string;
  es_virtual: boolean;
  estado?: string;
  disponible: boolean;
  aviso?: string;
  localidad?: string;
  sede?: string;
  inicio?: string;
  duracion_meses?: number;
  horarios?: string;
  carga_horaria?: string;
  primera_clase?: string;
  charla_informativa?: string;
  pagina_web?: string;
  aranceles?: CommissionFees;
}

/** What the agent must not read as "open for enrollment". */
const UNAVAILABLE_WARNING =
  "Esta comisión no está publicada en el catálogo actual.";

/**
 * Contributes a key only when there is a value, keeping the declared order.
 *
 * Assigning `undefined` would leave the key present in `JSON.stringify` input
 * and, worse, in `Object.keys`, which is exactly the ambiguity this layer
 * exists to remove.
 */
function present<K extends string, V>(
  key: K,
  value: V | undefined,
): { [P in K]?: V } {
  return value === undefined
    ? ({} as { [P in K]?: V })
    : ({ [key]: value } as { [P in K]?: V });
}

/** `null` and blank text are the same absence. */
function orUndefined(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** `"Online"` is the CRM's styling; the agent reads modalities in lower case. */
function toLowerText(value: string | null): string | undefined {
  const text = orUndefined(value);
  return text === undefined ? undefined : text.toLocaleLowerCase("es-AR");
}

/** A number of hours only means something to a person with its unit. */
function toWorkload(hours: number | null): string | undefined {
  if (hours === null) return undefined;
  return `${hours} ${hours === 1 ? "hora" : "horas"}`;
}

/** `HH:mm`, dropping the seconds the CRM sometimes appends. */
function toShortTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (match === null) return value;
  const [, hours = "", minutes = ""] = match;
  return `${hours.padStart(2, "0")}:${minutes}`;
}

/**
 * The informative talk, as one readable string.
 *
 * A talk with no date is not a date the agent can relay, whatever time it
 * carries, so it is absent.
 */
function toTalk(talk: Commission["charla_informativa"]): string | undefined {
  if (talk === null) return undefined;
  const date = orUndefined(talk.fecha);
  if (date === undefined) return undefined;
  const time = orUndefined(talk.hora);
  return time === undefined ? date : `${date} ${toShortTime(time)}`;
}

/** Projects the fees, keeping only the amounts the CRM actually published. */
function toFees(fees: Fees | undefined): CommissionFees | undefined {
  if (fees === undefined) return undefined;
  return {
    moneda: fees.moneda,
    ...present("inscripcion_regular", fees.inscripcion_regular),
    ...present("inscripcion_promocionada", fees.inscripcion_promocionada),
    ...present("cuota_regular", fees.cuota_regular),
    ...present("cuota_promocionada", fees.cuota_promocionada),
    ...present("pago_unico", fees.pago_unico),
    ...present("cuota_con_recargo", fees.cuota_con_recargo),
    ...present("certificacion", fees.certificacion),
    ...present("nota_promocion", fees.nota_promocion),
  };
}

/**
 * Projects one commission for the agent.
 *
 * The projection is a whitelist, not a filter, and the key order is part of
 * the answer: the agent reads the JSON top to bottom, so the identity comes
 * first, the caveat about availability comes right after `disponible`, and the
 * fees come last because they are opt-in.
 */
export function toCommissionDetail(
  commission: Commission,
  includeFees: boolean,
): CommissionDetail {
  const unavailable = commission.disponible ? undefined : UNAVAILABLE_WARNING;

  return {
    id: commission.id,
    // The commission code is an identifier: its capitalization is data.
    nombre: commission.codigo,
    curso: normalizeDisplayName(commission.curso.nombre),
    id_curso: commission.curso.id,
    // Shown as the CRM wrote it: title case would produce "De Formación".
    organizacion: commission.organizacion.nombre.trim(),
    ...present("modalidad", toLowerText(commission.modalidad)),
    es_virtual: commission.es_virtual,
    ...present("estado", toLowerText(commission.estado)),
    disponible: commission.disponible,
    ...present("aviso", unavailable),
    ...present("localidad", orUndefined(commission.localidad)),
    ...present("sede", orUndefined(commission.sede)),
    ...present("inicio", orUndefined(commission.inicio)),
    ...present(
      "duracion_meses",
      commission.duracion_meses === null ? undefined : commission.duracion_meses,
    ),
    ...present("horarios", orUndefined(commission.horarios)),
    ...present("carga_horaria", toWorkload(commission.carga_horaria_horas)),
    ...present("primera_clase", orUndefined(commission.primera_clase)),
    ...present("charla_informativa", toTalk(commission.charla_informativa)),
    ...present("pagina_web", orUndefined(commission.pagina_web)),
    ...present("aranceles", includeFees ? toFees(commission.aranceles) : undefined),
  };
}

const inputSchema = z.strictObject({
  id_comision: z
    .number()
    .int()
    .min(1)
    .describe(
      "Identificador numérico de la comisión, obtenido con buscar_comision",
    ),
  incluir_aranceles: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Si es true, incluye los valores de inscripción, cuotas y certificación",
    ),
});

export function registerDetalleComision(
  server: McpServer,
  client: CommissionReader,
): void {
  server.registerTool(
    "detalle_comision",
    {
      title: "Detalle de una comisión",
      description:
        "Devuelve los datos completos de una comisión a partir de su identificador numérico. Si no tenés el identificador, obtenelo primero con buscar_comision. No inventes identificadores.",
      inputSchema,
    },
    async ({ id_comision, incluir_aranceles }) => {
      try {
        const commission = await client.getCommission(
          id_comision,
          incluir_aranceles ?? false,
        );
        if (commission === null) {
          // A missing commission is an answer, not a failure: marking it as an
          // error would push the agent to retry instead of asking for the id.
          return {
            content: [
              {
                type: "text",
                text: `No existe la comisión ${id_comision}. Verificá el identificador.`,
              },
            ],
          };
        }

        const detail = toCommissionDetail(commission, incluir_aranceles ?? false);
        return {
          content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
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
