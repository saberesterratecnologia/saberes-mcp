import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { RawCommission, SaberesClient } from "../saberes-client.ts";
import {
  describeFailure,
  dropSentinel,
  toIsoDate,
  toPositiveInteger,
  toProperNoun,
  toSentenceCase,
} from "../translation.ts";

/** The fees of a commission, as text: the CRM annotates the amounts. */
export interface CommissionFees {
  inscripcion_regular?: string;
  inscripcion_promocionada?: string;
  cuota_regular?: string;
  cuota_promocionada?: string;
  pago_unico?: string;
  cuota_con_recargo?: string;
  certificacion?: string;
}

/**
 * A commission as the agent should see it.
 *
 * Only `id` is guaranteed. Every other key is omitted when the CRM has nothing
 * for it, so the agent never has to interpret `null`, `""` or `"S/D"`: a key
 * that is not there is a fact that is not known.
 */
export interface CommissionDetail {
  id: number;
  nombre?: string;
  curso?: string;
  organizacion?: string;
  modalidad?: string;
  estado?: string;
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

/** Lower case is the reading form for `ONLINE` or `INSCRIPCIONES`. */
function toLowerText(value: string | null | undefined): string | undefined {
  const text = dropSentinel(value);
  return text === undefined ? undefined : text.toLocaleLowerCase("es-AR");
}

/** Sentence case, but only once the value is known to be real. */
function toSentence(value: string | null | undefined): string | undefined {
  const text = dropSentinel(value);
  return text === undefined ? undefined : toSentenceCase(text);
}

/** Proper-noun case, applied after the sentinel is dropped. */
function toProper(value: string | null | undefined): string | undefined {
  const text = dropSentinel(value);
  return text === undefined ? undefined : toProperNoun(text);
}

/** Builds the fee block, or nothing when the CRM published no amount. */
function toFees(raw: RawCommission): CommissionFees | undefined {
  const fees: CommissionFees = {
    ...present("inscripcion_regular", dropSentinel(raw.Valor_de_la_inscripcion_regular)),
    ...present(
      "inscripcion_promocionada",
      dropSentinel(raw.Valor_de_la_inscripción_promocionada),
    ),
    ...present("cuota_regular", dropSentinel(raw.Valor_de_la_cuota_regular)),
    ...present("cuota_promocionada", dropSentinel(raw.Valor_de_la_cuota_promocionada)),
    ...present("pago_unico", dropSentinel(raw.Valor_del_pago_unico)),
    ...present("cuota_con_recargo", dropSentinel(raw.Valor_de_la_cuota_con_recargo)),
    ...present("certificacion", dropSentinel(raw.Valor_de_la_certificacion)),
  };

  return Object.keys(fees).length === 0 ? undefined : fees;
}

/**
 * Projects one commission for the agent.
 *
 * The projection is a whitelist, not a filter: the operational bot context, the
 * Whatsapp invitation, the certifying institutions, the street address, the
 * maps link, the second class, the category and the internal course id stay in
 * the CRM. Some of them are internal, the rest are noise the agent would have
 * to read on every answer.
 *
 * Amounts are passed through verbatim — they carry annotations like
 * "(*VALOR ... DEL 1 AL 10 DE CADA MES)" that matter and that parsing would
 * silently drop.
 */
export function toCommissionDetail(
  raw: RawCommission,
  includeFees: boolean,
): CommissionDetail {
  return {
    id: raw.id_comision,
    // The commission name is a code, so its capitalization is data, not style.
    ...present("nombre", dropSentinel(raw.Comision)),
    ...present("curso", toSentence(raw.Curso)),
    ...present("organizacion", toProper(raw.Organizacion)),
    ...present("modalidad", toLowerText(raw.Modalidad)),
    ...present("estado", toLowerText(raw.Estado_de_la_comisión)),
    ...present("localidad", toProper(raw.Localidad_de_cursado)),
    ...present("sede", toProper(raw.Lugar_de_cursado)),
    ...present("inicio", toIsoDate(raw.Fecha_Hora_Inicio)),
    ...present("duracion_meses", toPositiveInteger(raw.Duración_en_meses)),
    ...present("horarios", dropSentinel(raw.Horarios_de_cursado)),
    ...present("carga_horaria", dropSentinel(raw.Carga_horaria_certificada)),
    ...present("primera_clase", toIsoDate(raw.Primera_Clase)),
    // Free text such as "Sin charla programada" is not a date, so it is absent.
    ...present("charla_informativa", toIsoDate(raw.Charla_Informativa)),
    ...present("pagina_web", dropSentinel(raw.Página_web_del_curso)),
    ...present("aranceles", includeFees ? toFees(raw) : undefined),
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
  client: SaberesClient,
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
        const raw = await client.getCommission(id_comision);
        if (raw === null) {
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

        const detail = toCommissionDetail(raw, incluir_aranceles ?? false);
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
