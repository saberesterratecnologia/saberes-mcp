/**
 * HTTP client for the Saberes CRM RPC API.
 *
 * The error contract of this API is broken in production: only HTTP 200 returns
 * JSON. Every error path returns HTML, because the site's IIS configuration uses
 * `existingResponse="Replace"`, which discards the JSON error body the handler
 * writes. The 401 mapping additionally makes forms authentication turn the
 * response into a 302 to the login page.
 *
 * Therefore the status code is the only trustworthy signal, and redirects must
 * never be followed: following the 302 would yield HTTP 200 with the login page
 * HTML, which is indistinguishable from success at the transport level.
 */

/** Wire shape returned by the API on the happy path. */
export interface SaberesEnvelope<T> {
  result: string;
  message: string;
  data: T | null;
}

/**
 * A course exactly as the API returns it. The mixed capitalization is not a
 * mistake: the stored procedure projects `id_curso`, `Curso` and `Organizacion`
 * with these literal names, and the values arrive in upper case.
 */
export interface RawCourse {
  id_curso: number;
  Curso: string;
  Organizacion: string;
}

export type SaberesErrorKind =
  | "authentication_failed"
  | "action_not_allowed"
  | "bad_request"
  | "method_not_allowed"
  | "server_error"
  | "unexpected_status"
  | "invalid_json"
  | "timeout"
  | "network_error";

/**
 * Every failure surfaces as this error. `kind` is the discriminator the MCP
 * layer maps to user-facing wording, so callers never have to match strings.
 *
 * The token is never part of any field of this error.
 */
export class SaberesApiError extends Error {
  readonly kind: SaberesErrorKind;
  readonly status: number | undefined;

  constructor(kind: SaberesErrorKind, message: string, status?: number) {
    super(message);
    this.name = "SaberesApiError";
    this.kind = kind;
    this.status = status;
  }
}

export interface SaberesClientOptions {
  /** RPC endpoint, for example `https://saberes.com.ar/api`. */
  baseUrl: string;
  /** Value sent in the `X-Api-Token` header. Never logged, never serialized. */
  token: string;
  /** Request timeout in milliseconds. Defaults to 15000. */
  timeoutMs?: number;
  /** Injected for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** Maps a status code to its error kind. Only 200 is a success. */
function errorForStatus(status: number): SaberesApiError {
  if (status >= 300 && status < 400) {
    return new SaberesApiError(
      "authentication_failed",
      "The API redirected to the login page, which means the token is absent, invalid, or the client is inactive.",
      status,
    );
  }
  switch (status) {
    case 403:
      return new SaberesApiError(
        "action_not_allowed",
        "The requested action is not in this client's whitelist.",
        status,
      );
    case 400:
      return new SaberesApiError(
        "bad_request",
        "The API rejected the request as malformed: bad JSON, or a missing or unknown action.",
        status,
      );
    case 405:
      return new SaberesApiError(
        "method_not_allowed",
        "The API only accepts POST.",
        status,
      );
    case 500:
      return new SaberesApiError(
        "server_error",
        "The API failed internally. The CRM records the detail in its own exception table.",
        status,
      );
    default:
      return new SaberesApiError(
        "unexpected_status",
        `The API answered with an unexpected status code ${status}.`,
        status,
      );
  }
}

export class SaberesClient {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: SaberesClientOptions) {
    this.#baseUrl = options.baseUrl;
    this.#token = options.token;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  /**
   * Invokes one RPC action and returns its envelope.
   *
   * Success is decided by the status code alone. The body is parsed only when
   * the status is exactly 200.
   */
  async call<T>(
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<SaberesEnvelope<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

    let response: Response;
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
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") {
        throw new SaberesApiError(
          "timeout",
          `The API did not answer within ${this.#timeoutMs} ms.`,
        );
      }
      throw new SaberesApiError(
        "network_error",
        "The API could not be reached.",
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status !== 200) {
      throw errorForStatus(response.status);
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as SaberesEnvelope<T>;
    } catch {
      throw new SaberesApiError(
        "invalid_json",
        "The API answered 200 but the body was not valid JSON.",
        200,
      );
    }
  }

  /** Lists the courses currently on offer, across every organization. */
  async listCourses(): Promise<RawCourse[]> {
    const envelope = await this.call<RawCourse[]>(
      "recuperar_cursos_disponibles",
    );
    return envelope.data ?? [];
  }
}
