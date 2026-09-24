import test from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ApiMcpError, type Commission } from "../api-mcp-client.ts";
import {
  registerDetalleComision,
  toCommissionDetail,
  type CommissionReader,
} from "./detalle-comision.ts";

/**
 * Commission 2672 exactly as `/api-mcp` answered in production on 2026-09-24:
 * nulls instead of `"S/D"`, ISO dates, numbers as numbers, and the
 * certification fee absent because the business hides that amount.
 */
const COMMISSION: Commission = {
  id: 2672,
  codigo: "PRODUCCIÓN EXTENSIVA-D-OCTUBRE-2026",
  curso: { id: 28, nombre: "Producción Extensiva de Cereales y Oleaginosas" },
  organizacion: { id: 2, nombre: "Terra - Instituto de Formación Agropecuaria" },
  modalidad: "Online",
  es_virtual: true,
  estado: "inscripciones",
  disponible: true,
  localidad: null,
  sede: null,
  inicio: "2026-10-15",
  duracion_meses: 4,
  horarios: "Online - Desde la comodidad de tu hogar",
  carga_horaria_horas: 64,
  primera_clase: null,
  charla_informativa: null,
  pagina_web:
    "https://institutoterra.com.ar/produccion-extensiva-de-cereales-y-oleaginosas/",
  aranceles: {
    moneda: "ARS",
    inscripcion_regular: 58000,
    inscripcion_promocionada: 29000,
    cuota_regular: 55000,
    cuota_promocionada: 45000,
    pago_unico: 159000,
    cuota_con_recargo: 55000,
    nota_promocion:
      "*Valor de la cuota con descuento abonando del 1 al 10 de cada mes",
  },
};

type ToolHandler = (args: {
  id_comision: number;
  incluir_aranceles?: boolean | undefined;
}) => Promise<{
  content: ReadonlyArray<{ type: string; text?: string }>;
  isError?: boolean;
}>;

/** Registers the tool on a server double and returns what the SDK received. */
function registered(client: CommissionReader): {
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

  registerDetalleComision(server, client);
  assert.ok(captured, "the tool was never registered");
  return captured;
}

/** A client double that answers one commission, `null`, or a failure. */
function clientAnswering(answer: Commission | null | Error): CommissionReader {
  return {
    async getCommission() {
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

test("the commission is projected with the keys and the order of the design", () => {
  const detail = toCommissionDetail(COMMISSION, false);

  assert.deepEqual(Object.keys(detail), [
    "id",
    "nombre",
    "curso",
    "id_curso",
    "organizacion",
    "modalidad",
    "es_virtual",
    "estado",
    "disponible",
    "inicio",
    "duracion_meses",
    "horarios",
    "carga_horaria",
    "pagina_web",
  ]);

  assert.equal(detail.id, 2672);
  assert.equal(detail.nombre, "PRODUCCIÓN EXTENSIVA-D-OCTUBRE-2026");
  assert.equal(detail.curso, "Producción Extensiva de Cereales y Oleaginosas");
  assert.equal(detail.id_curso, 28);
  // The organization is shown as the CRM wrote it: title case would produce
  // "Terra - Instituto De Formación Agropecuaria".
  assert.equal(
    detail.organizacion,
    "Terra - Instituto de Formación Agropecuaria",
  );
  assert.equal(detail.modalidad, "online");
  assert.equal(detail.es_virtual, true);
  assert.equal(detail.estado, "inscripciones");
  assert.equal(detail.disponible, true);
  assert.equal(detail.duracion_meses, 4);
  assert.equal(detail.carga_horaria, "64 horas");
});

test("the keys follow the declared order, not the order of the payload", () => {
  const detail = toCommissionDetail(
    {
      ...COMMISSION,
      localidad: "Córdoba",
      sede: "Sede Centro",
      primera_clase: "2026-10-20",
      charla_informativa: { fecha: "2026-10-01", hora: null },
    },
    true,
  );

  assert.deepEqual(Object.keys(detail), [
    "id",
    "nombre",
    "curso",
    "id_curso",
    "organizacion",
    "modalidad",
    "es_virtual",
    "estado",
    "disponible",
    "localidad",
    "sede",
    "inicio",
    "duracion_meses",
    "horarios",
    "carga_horaria",
    "primera_clase",
    "charla_informativa",
    "pagina_web",
    "aranceles",
  ]);
});

test("a course name that arrives shouted is read as a sentence", () => {
  const detail = toCommissionDetail(
    {
      ...COMMISSION,
      curso: { id: 131, nombre: "GESTIÓN CONTABLE APLICADA AL AGRO" },
    },
    false,
  );

  assert.equal(detail.curso, "Gestión contable aplicada al agro");
});

test("a null is an absent key, never a null in the JSON", () => {
  const detail = toCommissionDetail(COMMISSION, false) as Record<
    string,
    unknown
  >;

  for (const key of ["localidad", "sede", "primera_clase", "charla_informativa"]) {
    assert.ok(!(key in detail), `${key} should have been omitted`);
  }
  assert.ok(!JSON.stringify(detail).includes("null"));
});

test("a commission that is not published carries an explicit warning", () => {
  const detail = toCommissionDetail(
    { ...COMMISSION, disponible: false },
    false,
  );
  const keys = Object.keys(detail);

  assert.equal(detail.disponible, false);
  assert.equal(
    detail.aviso,
    "Esta comisión no está publicada en el catálogo actual.",
  );
  // Right after `disponible`, so the agent reads the caveat with the fact.
  assert.equal(keys[keys.indexOf("disponible") + 1], "aviso");
});

test("an available commission carries no warning", () => {
  const detail = toCommissionDetail(COMMISSION, false) as Record<
    string,
    unknown
  >;

  assert.ok(!("aviso" in detail));
});

test("the informative talk keeps its time only when there is one", () => {
  const withTime = toCommissionDetail(
    { ...COMMISSION, charla_informativa: { fecha: "2026-10-01", hora: "19:00" } },
    false,
  );
  const withoutTime = toCommissionDetail(
    { ...COMMISSION, charla_informativa: { fecha: "2026-10-01", hora: null } },
    false,
  );
  const withoutDate = toCommissionDetail(
    { ...COMMISSION, charla_informativa: { fecha: null, hora: "19:00" } },
    false,
  ) as Record<string, unknown>;

  assert.equal(withTime.charla_informativa, "2026-10-01 19:00");
  assert.equal(withoutTime.charla_informativa, "2026-10-01");
  // A time without a date is not a date the agent can relay.
  assert.ok(!("charla_informativa" in withoutDate));
});

test("fees are opt-in, and a hidden amount stays absent", () => {
  const withoutFees = toCommissionDetail(COMMISSION, false) as Record<
    string,
    unknown
  >;
  assert.ok(!("aranceles" in withoutFees));

  const detail = toCommissionDetail(COMMISSION, true);

  assert.deepEqual(detail.aranceles, {
    moneda: "ARS",
    inscripcion_regular: 58000,
    inscripcion_promocionada: 29000,
    cuota_regular: 55000,
    cuota_promocionada: 45000,
    pago_unico: 159000,
    cuota_con_recargo: 55000,
    nota_promocion:
      "*Valor de la cuota con descuento abonando del 1 al 10 de cada mes",
  });
  // The business hides the certification fee: it is not there and is not
  // invented as a null either.
  assert.ok(!("certificacion" in (detail.aranceles ?? {})));
});

test("a commission whose fees were not sent has no fee block", () => {
  const { aranceles: _aranceles, ...withoutFees } = COMMISSION;

  const detail = toCommissionDetail(withoutFees, true) as Record<
    string,
    unknown
  >;

  assert.ok(!("aranceles" in detail));
});

test("the tool is registered with the name and the parameters of the design", () => {
  const { name, config } = registered(clientAnswering(COMMISSION));

  assert.equal(name, "detalle_comision");
  assert.match(String(config.description), /identificador numérico/);
  assert.match(String(config.description), /buscar_comision/);
});

test("the input schema is strict: an unknown parameter is rejected", () => {
  const { config } = registered(clientAnswering(COMMISSION));
  const schema = config.inputSchema as {
    safeParse: (value: unknown) => { success: boolean };
  };

  assert.equal(schema.safeParse({ id_comision: 2672 }).success, true);
  assert.equal(schema.safeParse({ id_comision: 0 }).success, false);
  assert.equal(schema.safeParse({ id_comision: 1.5 }).success, false);
  assert.equal(schema.safeParse({ id_comision: "2672" }).success, false);
  assert.equal(
    schema.safeParse({ id_comision: 2672, incluir_aranceles: true }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ id_comision: 2672, otro: "x" }).success,
    false,
  );
});

test("the detail reaches the agent as indented JSON", async () => {
  const { handler } = registered(clientAnswering(COMMISSION));

  const result = await handler({ id_comision: 2672, incluir_aranceles: true });
  const text = result.content[0]?.text ?? "";

  assert.equal(result.isError, undefined);
  assert.equal(JSON.parse(text).id, 2672);
  assert.ok(text.includes("\n  "), "the JSON should be indented");
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

test("a failure is never answered as a commission that does not exist", async () => {
  const { handler } = registered(
    clientAnswering(new ApiMcpError("server_error", "internal detail", 500)),
  );

  const result = await handler({ id_comision: 2672 });

  assert.equal(result.isError, true);
  const text = result.content[0]?.text ?? "";
  assert.ok(!text.includes("No existe"), text);
  assert.ok(!text.includes("internal detail"));
});

test("a changed contract is reported without the internal wording", async () => {
  const { handler } = registered(
    clientAnswering(
      new ApiMcpError("contract_changed", "field data.organizacion", 200),
    ),
  );

  const result = await handler({ id_comision: 2672 });

  assert.equal(result.isError, true);
  const text = result.content[0]?.text ?? "";
  assert.ok(text.length > 0);
  assert.ok(!text.includes("data.organizacion"));
});
