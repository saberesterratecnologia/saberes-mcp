import test from "node:test";
import assert from "node:assert/strict";

import { ApiMcpClient, ApiMcpError } from "./api-mcp-client.ts";

const TOKEN = "s3cr3t-api-mcp-token-that-must-never-leak";
const BASE_URL = "https://example.invalid/api-mcp";

type Capture = { init?: RequestInit | undefined; url?: unknown };

/** Builds a fetch double that answers once with the given status and body. */
function fakeFetch(
  status: number,
  body: string,
  capture?: Capture,
): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    if (capture) {
      capture.init = init;
      capture.url = input;
    }
    return new Response(body, { status });
  }) as unknown as typeof fetch;
}

function jsonFetch(
  status: number,
  payload: unknown,
  capture?: Capture,
): typeof fetch {
  return fakeFetch(status, JSON.stringify(payload), capture);
}

function clientWith(fetchImpl: typeof fetch, timeoutMs?: number): ApiMcpClient {
  return new ApiMcpClient({
    baseUrl: BASE_URL,
    token: TOKEN,
    fetchImpl,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

/** Runs a call expected to fail and returns its error. */
async function failureOf(run: () => Promise<unknown>): Promise<ApiMcpError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof ApiMcpError, "expected an ApiMcpError");
    return error;
  }
  throw new Error("the call was expected to fail but it succeeded");
}

/**
 * Commission 2672 exactly as production answered on 2026-09-24, with the
 * certification fee absent: the business hides that amount, and `/api-mcp`
 * omits the key instead of sending a null.
 */
const COMMISSION_2672 = {
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

const SUMMARY_2672 = {
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

test("the request is a POST with the token header and the action in the body", async () => {
  const capture: Capture = {};
  const fetchImpl = jsonFetch(
    200,
    { data: [], page: { next_cursor: null, has_more: false } },
    capture,
  );

  await clientWith(fetchImpl).listCourses();

  const headers = capture.init?.headers as Record<string, string>;
  assert.equal(capture.url, BASE_URL);
  assert.equal(capture.init?.method, "POST");
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers["X-Api-Token"], TOKEN);
  assert.deepEqual(JSON.parse(String(capture.init?.body)), {
    action: "cursos_disponibles",
  });
  // Following a 302 would turn the login page into an HTTP 200 that looks
  // exactly like a successful answer.
  assert.equal(capture.init?.redirect, "manual");
});

test("parameters travel at the top level of the body, next to the action", async () => {
  const capture: Capture = {};
  const fetchImpl = jsonFetch(200, { data: COMMISSION_2672 }, capture);

  await clientWith(fetchImpl).getCommission(2672, true);

  assert.deepEqual(JSON.parse(String(capture.init?.body)), {
    action: "comision",
    id_comision: 2672,
    incluir_aranceles: true,
  });
});

test("a search sends only the filters it was given", async () => {
  const capture: Capture = {};
  const fetchImpl = jsonFetch(
    200,
    { data: [], page: { next_cursor: null, has_more: false } },
    capture,
  );

  await clientWith(fetchImpl).searchCommissions({
    texto: "apicultura",
    modalidad: "online",
    estados: [2],
    limit: 20,
  });

  assert.deepEqual(JSON.parse(String(capture.init?.body)), {
    action: "buscar_comisiones",
    texto: "apicultura",
    modalidad: "online",
    estados: [2],
    limit: 20,
  });
});

test("the available courses arrive typed, with the organization when it is there", async () => {
  const payload = {
    data: [
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
      { id: 61, nombre: "Apicultura", modalidad: null, es_virtual: false },
    ],
    page: { next_cursor: null, has_more: false },
  };

  const courses = await clientWith(jsonFetch(200, payload)).listCourses();

  assert.equal(courses.length, 2);
  assert.equal(courses[0]?.id, 28);
  assert.equal(courses[0]?.organizacion?.nombre, "Terra - Instituto de Formación Agropecuaria");
  assert.equal(courses[1]?.modalidad, null);
  assert.equal(courses[1]?.es_virtual, false);
  // The CRM is still adding it, so its absence is not a broken contract.
  assert.equal(courses[1]?.organizacion, undefined);
});

test("one commission arrives with its fees, dates and numbers as data", async () => {
  const commission = await clientWith(
    jsonFetch(200, { data: COMMISSION_2672 }),
  ).getCommission(2672, true);

  assert.equal(commission?.id, 2672);
  assert.equal(commission?.codigo, "PRODUCCIÓN EXTENSIVA-D-OCTUBRE-2026");
  assert.equal(commission?.curso.id, 28);
  assert.equal(commission?.organizacion.nombre, "Terra - Instituto de Formación Agropecuaria");
  assert.equal(commission?.es_virtual, true);
  assert.equal(commission?.disponible, true);
  assert.equal(commission?.inicio, "2026-10-15");
  assert.equal(commission?.duracion_meses, 4);
  assert.equal(commission?.carga_horaria_horas, 64);
  assert.equal(commission?.localidad, null);
  assert.equal(commission?.charla_informativa, null);
  assert.equal(commission?.aranceles?.moneda, "ARS");
  assert.equal(commission?.aranceles?.pago_unico, 159000);
  // The business hides this amount, so the key is simply not there.
  assert.equal(commission?.aranceles?.certificacion, undefined);
});

test("a currency the CRM could not determine is null, not a changed contract", async () => {
  // The CRM used to answer "ARS" for every commission, which is false for the
  // Uruguayan and Paraguayan organizations. It now sends the real ISO 4217
  // code, or null when it cannot determine one: an unknown currency is data,
  // not a contract that moved.
  const payload = {
    data: {
      ...COMMISSION_2672,
      aranceles: { ...COMMISSION_2672.aranceles, moneda: null },
    },
  };

  const commission = await clientWith(jsonFetch(200, payload)).getCommission(
    2672,
    true,
  );

  assert.equal(commission?.aranceles?.moneda, null);
  assert.equal(commission?.aranceles?.pago_unico, 159000);
});

test("a foreign currency travels through untouched", async () => {
  const payload = {
    data: {
      ...COMMISSION_2672,
      aranceles: { ...COMMISSION_2672.aranceles, moneda: "UYU" },
    },
  };

  const commission = await clientWith(jsonFetch(200, payload)).getCommission(
    2672,
    true,
  );

  assert.equal(commission?.aranceles?.moneda, "UYU");
});

test("fees without the currency key are still a changed contract", async () => {
  // Null means "unknown", which the tools have to say out loud. A missing key
  // means the shape moved, and guessing it as unknown would hide that.
  const { moneda: _moneda, ...feesWithoutCurrency } = COMMISSION_2672.aranceles;
  const payload = {
    data: { ...COMMISSION_2672, aranceles: feesWithoutCurrency },
  };

  const error = await failureOf(() =>
    clientWith(jsonFetch(200, payload)).getCommission(2672, true),
  );

  assert.equal(error.kind, "contract_changed");
  assert.match(error.message, /moneda/);
});

test("a commission without fees is a valid answer, not a broken contract", async () => {
  const { aranceles: _aranceles, ...withoutFees } = COMMISSION_2672;

  const commission = await clientWith(
    jsonFetch(200, { data: withoutFees }),
  ).getCommission(2672, false);

  assert.equal(commission?.id, 2672);
  assert.equal(commission?.aranceles, undefined);
});

test("an additive field from the CRM does not break the client", async () => {
  const payload = {
    data: {
      ...COMMISSION_2672,
      cupos_disponibles: 12,
      curso: { ...COMMISSION_2672.curso, area: "Agro" },
    },
  };

  const commission = await clientWith(jsonFetch(200, payload)).getCommission(
    2672,
    true,
  );

  assert.equal(commission?.id, 2672);
  assert.equal(commission?.curso.nombre, "Producción Extensiva de Cereales y Oleaginosas");
});

test("a search returns its page as a cursor and a flag", async () => {
  const payload = {
    data: [SUMMARY_2672],
    page: { next_cursor: "c2VnLTQw", has_more: true },
  };

  const page = await clientWith(jsonFetch(200, payload)).searchCommissions({
    texto: "produccion",
  });

  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?.codigo, "PRODUCCIÓN EXTENSIVA-D-OCTUBRE-2026");
  assert.equal(page.items[0]?.organizacion.id, 2);
  assert.equal(page.nextCursor, "c2VnLTQw");
  assert.equal(page.hasMore, true);
});

test("the last page has no cursor and says so", async () => {
  const payload = {
    data: [],
    page: { next_cursor: null, has_more: false },
  };

  const page = await clientWith(jsonFetch(200, payload)).searchCommissions({});

  assert.deepEqual(page.items, []);
  assert.equal(page.nextCursor, null);
  assert.equal(page.hasMore, false);
});

test("each status maps to its own kind, routed before any parsing", async () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [401, "authentication_failed"],
    [302, "authentication_failed"],
    [403, "action_not_allowed"],
    [400, "bad_request"],
    [404, "not_found"],
    [405, "method_not_allowed"],
    [500, "server_error"],
    [418, "unexpected_status"],
  ];

  for (const [status, expected] of cases) {
    const error = await failureOf(() =>
      clientWith(fakeFetch(status, "<html/>")).listCourses(),
    );
    assert.equal(error.kind, expected, `status ${status}`);
    assert.equal(error.status, status, `status ${status}`);
  }
});

test("a commission that does not exist is null, not a failure", async () => {
  const body = {
    error: { code: "not_found", message: "La comisión 99999 no existe." },
  };

  const commission = await clientWith(jsonFetch(404, body)).getCommission(
    99999,
    false,
  );

  assert.equal(commission, null);
});

test("a 404 on any other action is still a failure", async () => {
  const error = await failureOf(() =>
    clientWith(jsonFetch(404, { error: { code: "not_found", message: "x" } })).listCourses(),
  );

  assert.equal(error.kind, "not_found");
  assert.equal(error.code, "not_found");
});

test("the error code of the body is captured for diagnosis", async () => {
  const body = {
    error: {
      code: "invalid_service_token",
      message: "Token de servicio inválido.",
    },
  };

  const error = await failureOf(() =>
    clientWith(jsonFetch(401, body)).listCourses(),
  );

  assert.equal(error.kind, "authentication_failed");
  assert.equal(error.code, "invalid_service_token");
  // The CRM's own wording is written for operators and is never relayed.
  assert.ok(!error.message.includes("Token de servicio inválido."));
});

test("a malformed error body never changes the kind", async () => {
  const bodies = [
    "<html>500</html>",
    '{"error":"just a string"}',
    '{"error":{"code":42}}',
    "",
  ];

  for (const body of bodies) {
    const error = await failureOf(() =>
      clientWith(fakeFetch(403, body)).listCourses(),
    );
    assert.equal(error.kind, "action_not_allowed", body);
    assert.equal(error.status, 403, body);
    assert.equal(error.code, undefined, body);
  }
});

test("a 200 whose body is not JSON is its own failure", async () => {
  const error = await failureOf(() =>
    clientWith(fakeFetch(200, "<html>nope</html>")).listCourses(),
  );

  assert.equal(error.kind, "invalid_json");
  assert.equal(error.status, 200);
});

test("a 200 missing a required field is a changed contract", async () => {
  const { organizacion: _organizacion, ...withoutOrganization } =
    COMMISSION_2672;
  const client = clientWith(jsonFetch(200, { data: withoutOrganization }));

  const error = await failureOf(() => client.getCommission(2672, true));

  assert.equal(error.kind, "contract_changed");
  assert.equal(error.status, 200);
  // The message has to be actionable for the technical team: the action and
  // the field that moved, never the payload the CRM sent.
  assert.match(error.message, /comision/);
  assert.match(error.message, /organizacion/);
  assert.ok(!error.message.includes("PRODUCCIÓN EXTENSIVA-D-OCTUBRE-2026"));
});

test("a required field that changed type is a changed contract too", async () => {
  const payload = {
    data: [{ ...SUMMARY_2672, id: "2672" }],
    page: { next_cursor: null, has_more: false },
  };

  const error = await failureOf(() =>
    clientWith(jsonFetch(200, payload)).searchCommissions({}),
  );

  assert.equal(error.kind, "contract_changed");
  assert.match(error.message, /buscar_comisiones/);
  assert.match(error.message, /id/);
});

test("a request that exceeds the timeout fails as a timeout", async () => {
  const hangingFetch = ((_input: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const abortError = new Error("aborted");
        abortError.name = "AbortError";
        reject(abortError);
      });
    })) as unknown as typeof fetch;

  const error = await failureOf(() =>
    clientWith(hangingFetch, 20).listCourses(),
  );

  assert.equal(error.kind, "timeout");
  assert.equal(error.status, undefined);
});

test("an unreachable endpoint fails as a network error", async () => {
  const brokenFetch = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;

  const error = await failureOf(() =>
    clientWith(brokenFetch).getCommission(2672, false),
  );

  assert.equal(error.kind, "network_error");
});

test("the token never leaks through any failure", async () => {
  const leakyBody = JSON.stringify({
    error: { code: "invalid_service_token", message: `token ${TOKEN}` },
  });
  const cases: ReadonlyArray<readonly [number, string]> = [
    [302, TOKEN],
    [400, leakyBody],
    [401, leakyBody],
    [403, leakyBody],
    [404, leakyBody],
    [405, leakyBody],
    [500, leakyBody],
    [418, leakyBody],
    [200, `<html>${TOKEN}</html>`],
    [200, JSON.stringify({ data: { id: TOKEN } })],
  ];

  for (const [status, body] of cases) {
    const error = await failureOf(() =>
      clientWith(fakeFetch(status, body)).listCourses(),
    );
    const serialized = `${error.message} ${error.stack ?? ""} ${JSON.stringify(error)}`;
    assert.ok(!serialized.includes(TOKEN), `token leaked on status ${status}`);
  }
});
