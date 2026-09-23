import test from "node:test";
import assert from "node:assert/strict";

import {
  SaberesApiError,
  SaberesClient,
  type RawCourse,
} from "./saberes-client.ts";

const TOKEN = "s3cr3t-token-value-that-must-never-leak";
const BASE_URL = "https://example.invalid/api";

/** Builds a fetch double that answers once with the given status and body. */
type Capture = { init?: RequestInit | undefined };

function fakeFetch(
  status: number,
  body: string,
  capture?: Capture,
): typeof fetch {
  return (async (_input: unknown, init?: RequestInit) => {
    if (capture) capture.init = init;
    return new Response(body, { status });
  }) as unknown as typeof fetch;
}

function clientWith(fetchImpl: typeof fetch, timeoutMs?: number) {
  return new SaberesClient({
    baseUrl: BASE_URL,
    token: TOKEN,
    fetchImpl,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

/** Runs a call expected to fail and returns the error. */
async function failureOf(client: SaberesClient): Promise<SaberesApiError> {
  try {
    await client.call("recuperar_cursos_disponibles");
  } catch (error) {
    assert.ok(error instanceof SaberesApiError, "expected a SaberesApiError");
    return error;
  }
  throw new Error("the call was expected to fail but it succeeded");
}

test("200 returns the parsed envelope", async () => {
  const payload = {
    result: "ok",
    message: "",
    data: [{ id_curso: 61, Curso: "APICULTURA", Organizacion: "INSTITUTO TERRA" }],
  };
  const client = clientWith(fakeFetch(200, JSON.stringify(payload)));

  const courses = await client.listCourses();

  assert.equal(courses.length, 1);
  assert.equal(courses[0]?.id_curso, 61);
  assert.equal(courses[0]?.Curso, "APICULTURA");
  assert.equal(courses[0]?.Organizacion, "INSTITUTO TERRA");
});

test("200 with a null data field yields an empty list", async () => {
  const body = JSON.stringify({ result: "ok", message: "Sin resultados.", data: null });
  const client = clientWith(fakeFetch(200, body));

  assert.deepEqual(await client.listCourses(), [] as RawCourse[]);
});

test("302 is an authentication failure and redirects are never followed", async () => {
  const capture: Capture = {};
  const client = clientWith(fakeFetch(302, "<html>login</html>", capture));

  const error = await failureOf(client);

  assert.equal(error.kind, "authentication_failed");
  assert.equal(error.status, 302);
  // The dangerous failure mode: following the redirect would turn this into a
  // 200 with the login page, which looks exactly like success.
  assert.equal(capture.init?.redirect, "manual");
});

test("the request carries the token header, the POST method and the action", async () => {
  const capture: Capture = {};
  const body = JSON.stringify({ result: "ok", message: "", data: [] });
  await clientWith(fakeFetch(200, body, capture)).listCourses();

  const headers = capture.init?.headers as Record<string, string>;
  assert.equal(capture.init?.method, "POST");
  assert.equal(headers["X-Api-Token"], TOKEN);
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(
    JSON.parse(String(capture.init?.body)).action,
    "recuperar_cursos_disponibles",
  );
});

test("each error status maps to its own kind", async () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [403, "action_not_allowed"],
    [400, "bad_request"],
    [405, "method_not_allowed"],
    [500, "server_error"],
    [418, "unexpected_status"],
  ];

  for (const [status, expected] of cases) {
    const error = await failureOf(clientWith(fakeFetch(status, "<html/>")));
    assert.equal(error.kind, expected, `status ${status}`);
    assert.equal(error.status, status);
  }
});

test("a 200 with a body that is not JSON is its own failure", async () => {
  const error = await failureOf(clientWith(fakeFetch(200, "<html>nope</html>")));

  assert.equal(error.kind, "invalid_json");
  assert.equal(error.status, 200);
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

  const error = await failureOf(clientWith(hangingFetch, 20));

  assert.equal(error.kind, "timeout");
});

test("an unreachable endpoint fails as a network error", async () => {
  const brokenFetch = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;

  assert.equal((await failureOf(clientWith(brokenFetch))).kind, "network_error");
});

test("one commission is requested by its numeric id", async () => {
  const capture: Capture = {};
  const body = JSON.stringify({
    result: "ok",
    message: "",
    data: { id_comision: 2672, id_curso: 28, Comision: "UNA COMISIÓN" },
  });

  const commission = await clientWith(
    fakeFetch(200, body, capture),
  ).getCommission(2672);

  const sent = JSON.parse(String(capture.init?.body));
  assert.equal(sent.action, "recuperar_comision_x_id");
  assert.equal(sent.id_comision, 2672);
  // The happy path is an object, not the array `listCourses` receives.
  assert.equal(commission?.id_comision, 2672);
  assert.equal(commission?.Comision, "UNA COMISIÓN");
});

test("a commission that does not exist is null, not a failure", async () => {
  const body = JSON.stringify({
    result: "ok",
    message: "Sin resultados.",
    data: null,
  });

  assert.equal(await clientWith(fakeFetch(200, body)).getCommission(1), null);
});

test("result 'error' is a failure, never a missing commission", async () => {
  // Production only ever signals a miss with result 'ok' and data null, so an
  // error envelope is an unknown problem. Collapsing it into 'does not exist'
  // would answer a question nobody could verify.
  const body = JSON.stringify({
    result: "error",
    message: "Algo interno salió mal.",
    data: null,
  });
  const client = clientWith(fakeFetch(200, body));

  await assert.rejects(
    () => client.getCommission(1),
    (error: unknown) => {
      assert.ok(error instanceof SaberesApiError);
      assert.equal(error.kind, "api_error");
      assert.equal(error.status, 200);
      // The API's own wording may carry internals, so it is never relayed.
      assert.ok(!error.message.includes("Algo interno salió mal."));
      return true;
    },
  );
});

test("a rejected commission request still fails as a bad request", async () => {
  const client = clientWith(fakeFetch(400, "<html/>"));

  await assert.rejects(
    () => client.getCommission(2672),
    (error: unknown) => {
      assert.ok(error instanceof SaberesApiError);
      assert.equal(error.kind, "bad_request");
      assert.equal(error.status, 400);
      return true;
    },
  );
});

test("the token never leaks through any error", async () => {
  const statuses = [302, 400, 403, 405, 500, 418];

  for (const status of statuses) {
    const error = await failureOf(clientWith(fakeFetch(status, TOKEN)));
    const serialized = `${error.message} ${error.stack ?? ""} ${JSON.stringify(error)}`;
    assert.ok(!serialized.includes(TOKEN), `token leaked on status ${status}`);
  }
});
