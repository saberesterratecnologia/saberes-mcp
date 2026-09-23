import test from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  SaberesApiError,
  type RawCommission,
  type SaberesClient,
} from "../saberes-client.ts";
import {
  registerDetalleComision,
  toCommissionDetail,
} from "./detalle-comision.ts";

/**
 * Commission 2672 exactly as production answered on 2026-09-23, except for the
 * three free-text fields the tool must never project: they carry obviously fake
 * placeholders so a leak is visible in the assertions instead of plausible.
 */
const RAW: RawCommission = {
  id_comision: 2672,
  id_curso: 28,
  Organizacion: "INSTITUTO TERRA",
  Comision: "PRODUCCIÓN EXTENSIVA-D-OCTUBRE-2026",
  Curso: "PRODUCCIÓN EXTENSIVA DE CEREALES Y OLEAGINOSAS",
  Modalidad: "ONLINE",
  Estado_de_la_comisión: "INSCRIPCIONES",
  Carga_horaria_certificada: "64 horas",
  Categoria: "AGROINDUSTRIALES",
  Institución_Gestora: "TERRA INSTITUTO DE FORMACIÓN AGROPECUARIA",
  Institución_Certificadora: "UNIVERSIDAD CATÓLICA DE CUYO",
  Institución_Capacitadora: "TERRA INSTITUTO DE FORMACIÓN AGROPECUARIA",
  Localidad_de_cursado: "S/D",
  Lugar_de_cursado: "S/D",
  Domicilio_de_la_sede: "S/D",
  URL_MAPS: "S/D",
  Fecha_Hora_Inicio: "15/10/2026",
  Duración_en_meses: "4",
  Charla_Informativa: "Sin charla programada",
  Primera_Clase: "S/D",
  Segunda_Clase: "S/D",
  Horarios_de_cursado: "online - desde la comodidad de tu hogar",
  Valor_de_la_inscripcion_regular: "$ 58.000",
  Valor_de_la_inscripción_promocionada:
    "$ 29.000 (*VALOR DE LA CUOTA CON DESCUENTO ABONANDO DEL 1 AL 10 DE CADA MES)",
  Valor_de_la_cuota_regular: "$ 55.000",
  Valor_de_la_cuota_promocionada:
    "$ 45.000 (*VALOR DE LA CUOTA CON DESCUENTO ABONANDO DEL 1 AL 10 DE CADA MES)",
  Valor_del_pago_unico: "$ 159.000",
  Valor_de_la_cuota_con_recargo: "$ 55.000",
  Valor_de_la_certificacion: "$ 90.000",
  Página_web_del_curso:
    "https://institutoterra.com.ar/produccion-extensiva-de-cereales-y-oleaginosas/",
  Enlace_invitación_grupo_de_Whatsapp: "https://chat.whatsapp.com/FAKE",
  bot_contexto_operativo: "SECRET-CONTEXT",
  bot_contexto_operativo_curso: "SECRET-CONTEXT",
};

type ToolHandler = (args: {
  id_comision: number;
  incluir_aranceles?: boolean | undefined;
}) => Promise<{
  content: ReadonlyArray<{ type: string; text?: string }>;
  isError?: boolean;
}>;

/** Registers the tool on a server double and returns what the SDK received. */
function registered(client: Pick<SaberesClient, "getCommission">): {
  name: string;
  config: { description?: string; inputSchema?: unknown };
  handler: ToolHandler;
} {
  let captured:
    | { name: string; config: { description?: string }; handler: ToolHandler }
    | undefined;

  const server = {
    registerTool(name: string, config: { description?: string }, handler: unknown) {
      captured = { name, config, handler: handler as ToolHandler };
    },
  } as unknown as McpServer;

  registerDetalleComision(server, client as SaberesClient);
  assert.ok(captured, "the tool was never registered");
  return captured;
}

/** A client double that answers one commission, `null`, or a failure. */
function clientAnswering(
  answer: RawCommission | null | Error,
): Pick<SaberesClient, "getCommission"> {
  return {
    async getCommission() {
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

test("the wire shape is projected into the agent-facing detail", () => {
  const detail = toCommissionDetail(RAW, false);

  assert.deepEqual(detail, {
    id: 2672,
    nombre: "PRODUCCIÓN EXTENSIVA-D-OCTUBRE-2026",
    curso: "Producción extensiva de cereales y oleaginosas",
    organizacion: "Instituto Terra",
    modalidad: "online",
    estado: "inscripciones",
    inicio: "2026-10-15",
    duracion_meses: 4,
    horarios: "online - desde la comodidad de tu hogar",
    carga_horaria: "64 horas",
    pagina_web:
      "https://institutoterra.com.ar/produccion-extensiva-de-cereales-y-oleaginosas/",
  });
});

test("the sentinel and the free-text date become absent keys, never null", () => {
  const detail = toCommissionDetail(RAW, false) as Record<string, unknown>;

  for (const key of ["localidad", "sede", "primera_clase", "charla_informativa"]) {
    assert.ok(!(key in detail), `${key} should have been omitted`);
  }
  assert.ok(!JSON.stringify(detail).includes("null"));
});

test("fees are opt-in and arrive as text, unparsed", () => {
  const withoutFees = toCommissionDetail(RAW, false) as Record<string, unknown>;
  assert.ok(!("aranceles" in withoutFees));

  const detail = toCommissionDetail(RAW, true);

  assert.deepEqual(detail.aranceles, {
    inscripcion_regular: "$ 58.000",
    inscripcion_promocionada:
      "$ 29.000 (*VALOR DE LA CUOTA CON DESCUENTO ABONANDO DEL 1 AL 10 DE CADA MES)",
    cuota_regular: "$ 55.000",
    cuota_promocionada:
      "$ 45.000 (*VALOR DE LA CUOTA CON DESCUENTO ABONANDO DEL 1 AL 10 DE CADA MES)",
    pago_unico: "$ 159.000",
    cuota_con_recargo: "$ 55.000",
    certificacion: "$ 90.000",
  });
  assert.equal(Object.keys(detail.aranceles ?? {}).length, 7);
});

test("a commission without any fee loses the whole fee object", () => {
  const detail = toCommissionDetail(
    {
      ...RAW,
      Valor_de_la_inscripcion_regular: "S/D",
      Valor_de_la_inscripción_promocionada: null,
      Valor_de_la_cuota_regular: "",
      Valor_de_la_cuota_promocionada: "S/D",
      Valor_del_pago_unico: null,
      Valor_de_la_cuota_con_recargo: "S/D",
      Valor_de_la_certificacion: "S/D",
    },
    true,
  ) as Record<string, unknown>;

  assert.ok(!("aranceles" in detail));
});

test("a localidad with a real value is cased as a proper noun", () => {
  const detail = toCommissionDetail(
    { ...RAW, Localidad_de_cursado: "SAN JUAN", Lugar_de_cursado: "SEDE CENTRAL" },
    false,
  );

  assert.equal(detail.localidad, "San Juan");
  assert.equal(detail.sede, "Sede Central");
});

test("the operational context, the Whatsapp link and the institutions never leak", async () => {
  const { handler } = registered(clientAnswering(RAW));

  const result = await handler({ id_comision: 2672, incluir_aranceles: true });
  const text = result.content[0]?.text ?? "";

  assert.equal(result.isError, undefined);
  for (const forbidden of [
    "S/D",
    "SECRET-CONTEXT",
    "whatsapp",
    "Institución",
    "UNIVERSIDAD",
    "AGROINDUSTRIALES",
    "bot_contexto",
  ]) {
    assert.ok(!text.includes(forbidden), `${forbidden} leaked into the output`);
  }
  assert.equal(JSON.parse(text).id, 2672);
});

test("the tool is registered with the name and the parameters of the design", () => {
  const { name, config } = registered(clientAnswering(RAW));

  assert.equal(name, "detalle_comision");
  assert.match(String(config.description), /identificador numérico/);
  assert.match(String(config.description), /buscar_comision/);
});

test("a commission that does not exist is explained, not reported as an error", async () => {
  const { handler } = registered(clientAnswering(null));

  const result = await handler({ id_comision: 99999 });

  assert.equal(result.isError, undefined);
  assert.equal(
    result.content[0]?.text,
    "No existe la comisión 99999. Verificá el identificador.",
  );
});

test("a failure is reported without the internal wording", async () => {
  const { handler } = registered(
    clientAnswering(new SaberesApiError("authentication_failed", "internal detail")),
  );

  const result = await handler({ id_comision: 2672 });

  assert.equal(result.isError, true);
  const text = result.content[0]?.text ?? "";
  assert.ok(text.length > 0);
  assert.ok(!text.includes("internal detail"));
});
