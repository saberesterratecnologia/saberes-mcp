/**
 * HTTP client for `/api-mcp`, the CRM endpoint built for this MCP server.
 *
 * `/api-mcp` is not `/api`. It answers data instead of presentation — `null`
 * instead of `"S/D"`, ISO dates, numbers as numbers, `snake_case` keys without
 * accents — and it reports failures as JSON with their real status code, so
 * "the commission does not exist" is a 404 and not a 200 that has to be
 * guessed from a message written for CRM operators.
 *
 * Two rules keep that trust honest:
 *
 * 1. **The status decides the outcome, before anything is parsed.** An error
 *    body is read only to pick up `error.code` for diagnosis; a malformed one
 *    never changes what the failure is. Redirects are never followed, because
 *    a followed 302 becomes an HTTP 200 carrying the login page, which is
 *    indistinguishable from success at the transport level.
 * 2. **Every 200 payload is validated against the expected shape.** If the CRM
 *    changes the contract, this client says so (`contract_changed`) instead of
 *    handing the tools a half-read object. The schemas stay non-strict, so an
 *    *additive* change by the CRM — the `organizacion` field being added to
 *    `cursos_disponibles` right now, for instance — costs nothing.
 *
 * The token travels in `X-Api-Token` and never appears in an error message,
 * stack or serialization.
 */

import { z } from "zod";

/** `{ id, nombre }`, the shape every related entity arrives in. */
const referenceSchema = z.object({
  id: z.number(),
  nombre: z.string(),
});

/**
 * A course on offer.
 *
 * `organizacion` is optional on purpose: the CRM is adding it right now (asked
 * for on 2026-09-24, because course names repeat across the four
 * organizations). Requiring it today would break the MCP against production.
 */
const courseSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  modalidad: z.string().nullable(),
  es_virtual: z.boolean(),
  organizacion: referenceSchema.optional(),
});

/**
 * The fees of a commission.
 *
 * Every amount is optional because the business hides amounts per commission:
 * a hidden fee is *absent*, not null.
 *
 * The currency is always present as a key, but its value may be `null`: the
 * CRM answers the ISO 4217 code when it can determine one and `null` when it
 * cannot. It used to answer `"ARS"` for every commission, which was false for
 * the Uruguayan and Paraguayan organizations, so an honest `null` is data the
 * tools must relay, not a contract that moved. A *missing* key still is one.
 */
const feesSchema = z.object({
  moneda: z.string().nullable(),
  inscripcion_regular: z.number().optional(),
  inscripcion_promocionada: z.number().optional(),
  cuota_regular: z.number().optional(),
  cuota_promocionada: z.number().optional(),
  pago_unico: z.number().optional(),
  cuota_con_recargo: z.number().optional(),
  certificacion: z.number().optional(),
  nota_promocion: z.string().optional(),
});

/**
 * One commission in full.
 *
 * `es_virtual` is what makes the nulls readable: in a virtual commission
 * `localidad: null` means "does not apply", and in a face-to-face one it means
 * "the datum is missing". `/api` could not express that difference.
 */
const commissionSchema = z.object({
  id: z.number(),
  codigo: z.string(),
  curso: referenceSchema,
  organizacion: referenceSchema,
  modalidad: z.string().nullable(),
  es_virtual: z.boolean(),
  estado: z.string().nullable(),
  disponible: z.boolean(),
  localidad: z.string().nullable(),
  sede: z.string().nullable(),
  inicio: z.string().nullable(),
  duracion_meses: z.number().nullable(),
  horarios: z.string().nullable(),
  carga_horaria_horas: z.number().nullable(),
  primera_clase: z.string().nullable(),
  charla_informativa: z
    .object({ fecha: z.string().nullable(), hora: z.string().nullable() })
    .nullable(),
  pagina_web: z.string().nullable(),
  aranceles: feesSchema.optional(),
});

/** The reduced projection a search returns for each hit. */
const commissionSummarySchema = z.object({
  id: z.number(),
  codigo: z.string(),
  curso: referenceSchema,
  organizacion: referenceSchema,
  modalidad: z.string().nullable(),
  es_virtual: z.boolean(),
  estado: z.string().nullable(),
  disponible: z.boolean(),
  inicio: z.string().nullable(),
  localidad: z.string().nullable(),
});

const pageSchema = z.object({
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
});

/**
 * `cursos_disponibles` also answers a `page`, but the whole catalogue fits in
 * one response and this client does not paginate it. Not validating a field
 * nobody reads keeps an additive change to the pagination from breaking a
 * listing that does not depend on it.
 */
const coursesResponseSchema = z.object({ data: z.array(courseSchema) });

const commissionResponseSchema = z.object({ data: commissionSchema });

const searchResponseSchema = z.object({
  data: z.array(commissionSummarySchema),
  page: pageSchema,
});

export type Course = z.infer<typeof courseSchema>;
export type Fees = z.infer<typeof feesSchema>;
export type Commission = z.infer<typeof commissionSchema>;
export type CommissionSummary = z.infer<typeof commissionSummarySchema>;

export type ApiMcpErrorKind =
  | "authentication_failed"
  | "action_not_allowed"
  | "bad_request"
  | "not_found"
  | "method_not_allowed"
  | "server_error"
  | "unexpected_status"
  | "invalid_json"
  | "contract_changed"
  | "timeout"
  | "network_error";

/**
 * Every failure of `/api-mcp` surfaces as this error.
 *
 * `kind` is the discriminator the MCP layer maps to user-facing wording, so no
 * caller ever matches message text. `code` is the CRM's own `error.code`, kept
 * for diagnosis only: it is present when the error body parsed, and it never
 * decides anything.
 *
 * The token is never part of any field of this error.
 */
export class ApiMcpError extends Error {
  readonly kind: ApiMcpErrorKind;
  readonly status: number | undefined;
  readonly code: string | undefined;

  constructor(
    kind: ApiMcpErrorKind,
    message: string,
    status?: number,
    code?: string,
  ) {
    super(message);
    this.name = "ApiMcpError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export interface ApiMcpClientOptions {
  /** RPC endpoint, for example `https://saberes.com.ar/api-mcp`. */
  baseUrl: string;
  /** Value sent in the `X-Api-Token` header. Never logged, never serialized. */
  token: string;
  /** Request timeout in milliseconds. Defaults to 15000. */
  timeoutMs?: number;
  /** Injected for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Filters of `buscar_comisiones`, in the client's own vocabulary. */
export interface CommissionSearchFilters {
  /** Free text over the commission code and the course name. */
  texto?: string;
  idCurso?: number;
  /** Modality by name, for example `"online"`. */
  modalidad?: string;
  /** Commission states by id. Absent means the catalogue rule of the site. */
  estados?: readonly number[];
  /** Page size, 1 to 20. */
  limit?: number;
  cursor?: string;
}

/** One page of search results. */
export interface CommissionPage {
  items: CommissionSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Maps a status code to its error kind. Only 200 is a success.
 *
 * A 3xx is an authentication failure: IIS answers the login page redirect when
 * the request is not authenticated, and this client never follows it.
 */
function errorForStatus(status: number, code: string | undefined): ApiMcpError {
  if (status === 401 || (status >= 300 && status < 400)) {
    return new ApiMcpError(
      "authentication_failed",
      "The API rejected the credentials: the service token is absent, invalid, or the client is inactive.",
      status,
      code,
    );
  }
  switch (status) {
    case 403:
      return new ApiMcpError(
        "action_not_allowed",
        "The requested action is not in this client's whitelist.",
        status,
        code,
      );
    case 400:
      return new ApiMcpError(
        "bad_request",
        "The API rejected the request as malformed: a missing parameter, a wrong type, or an unknown action.",
        status,
        code,
      );
    case 404:
      return new ApiMcpError(
        "not_found",
        "The requested resource does not exist.",
        status,
        code,
      );
    case 405:
      return new ApiMcpError(
        "method_not_allowed",
        "The API only accepts POST.",
        status,
        code,
      );
    case 500:
      return new ApiMcpError(
        "server_error",
        "The API failed internally. The CRM records the detail in its own exception table.",
        status,
        code,
      );
    default:
      return new ApiMcpError(
        "unexpected_status",
        `The API answered with an unexpected status code ${status}.`,
        status,
        code,
      );
  }
}

/**
 * Extracts `error.code` from an error body, or nothing at all.
 *
 * This runs *after* the kind is decided and can never change it: an error body
 * that is HTML, empty, or shaped differently is a diagnosis that is missing,
 * not a different failure. The CRM's `error.message` is written for operators
 * and is deliberately dropped.
 */
function readErrorCode(text: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const error = (parsed as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isAbort(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}

export class ApiMcpClient {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: ApiMcpClientOptions) {
    this.#baseUrl = options.baseUrl;
    this.#token = options.token;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  /**
   * Invokes one action and returns the parsed JSON body of a 200.
   *
   * The parameters travel at the top level of the body, next to `action`,
   * which is the shape `/api-mcp` expects.
   */
  async call(
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    const controller = new AbortController();
    // The timeout covers the whole exchange, body included. Clearing it when
    // the headers arrive would let a server that stalls mid-body hang the
    // tool forever, with no timeout ever reported.
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

    let response: Response;
    let text: string;
    try {
      response = await this.#fetch(this.#baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Token": this.#token,
        },
        body: JSON.stringify({ action, ...params }),
        // Never follow redirects: a followed 302 becomes a 200 with login HTML.
        redirect: "manual",
        signal: controller.signal,
      });

      try {
        text = await response.text();
      } catch (cause) {
        if (isAbort(cause)) throw cause;
        // An unreadable error body only loses the diagnostic code: the status
        // alone decides the kind. An unreadable 200 is a transport failure.
        if (response.status === 200) {
          throw new ApiMcpError(
            "network_error",
            "The API response body could not be read.",
          );
        }
        text = "";
      }
    } catch (cause) {
      if (cause instanceof ApiMcpError) throw cause;
      if (isAbort(cause)) {
        throw new ApiMcpError(
          "timeout",
          `The API did not answer within ${this.#timeoutMs} ms.`,
        );
      }
      throw new ApiMcpError("network_error", "The API could not be reached.");
    } finally {
      clearTimeout(timer);
    }

    if (response.status !== 200) {
      throw errorForStatus(response.status, readErrorCode(text));
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ApiMcpError(
        "invalid_json",
        "The API answered 200 but the body was not valid JSON.",
        200,
      );
    }
  }

  /**
   * Validates a 200 payload, or fails loudly.
   *
   * The message names the action and the path of the first issue — enough for
   * the technical team to find what moved — and never the payload itself,
   * which is data the agent must not see through an error channel.
   */
  #validate<T>(action: string, schema: z.ZodType<T>, payload: unknown): T {
    const result = schema.safeParse(payload);
    if (result.success) return result.data;

    const issue = result.error.issues[0];
    const path =
      issue === undefined || issue.path.length === 0
        ? "(root)"
        : issue.path.join(".");
    throw new ApiMcpError(
      "contract_changed",
      `The action "${action}" answered a payload that no longer matches the expected contract (field "${path}").`,
      200,
    );
  }

  /** Lists the courses on offer, across the four organizations. */
  async listCourses(): Promise<Course[]> {
    const action = "cursos_disponibles";
    const payload = await this.call(action);
    return this.#validate(action, coursesResponseSchema, payload).data;
  }

  /**
   * Recovers one commission by its id, or `null` when it does not exist.
   *
   * A missing commission is the one failure that is not a failure, and
   * `/api-mcp` says it unambiguously with a 404. Every other status still
   * throws: an unexplained problem must never be answered as "it does not
   * exist", which is the one outcome this integration cannot produce.
   */
  async getCommission(
    id: number,
    includeFees: boolean,
  ): Promise<Commission | null> {
    const action = "comision";
    let payload: unknown;
    try {
      payload = await this.call(action, {
        id_comision: id,
        incluir_aranceles: includeFees,
      });
    } catch (error) {
      if (error instanceof ApiMcpError && error.kind === "not_found") {
        return null;
      }
      throw error;
    }
    return this.#validate(action, commissionResponseSchema, payload).data;
  }

  /** Searches commissions and returns one page of results. */
  async searchCommissions(
    filters: CommissionSearchFilters = {},
  ): Promise<CommissionPage> {
    const action = "buscar_comisiones";
    const params: Record<string, unknown> = {};
    // Only the filters that were given are sent: an explicit `undefined` would
    // be serialized away anyway, and an explicit `null` is a different request.
    if (filters.texto !== undefined) params["texto"] = filters.texto;
    if (filters.idCurso !== undefined) params["id_curso"] = filters.idCurso;
    if (filters.modalidad !== undefined) params["modalidad"] = filters.modalidad;
    if (filters.estados !== undefined) params["estados"] = filters.estados;
    if (filters.limit !== undefined) params["limit"] = filters.limit;
    if (filters.cursor !== undefined) params["cursor"] = filters.cursor;

    const payload = await this.call(action, params);
    const response = this.#validate(action, searchResponseSchema, payload);
    return {
      items: response.data,
      nextCursor: response.page.next_cursor,
      hasMore: response.page.has_more,
    };
  }
}
