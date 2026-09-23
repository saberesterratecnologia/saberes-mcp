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

/**
 * A commission exactly as the API returns it, measured against production on
 * 2026-09-23. The key names are literal, including the inconsistent accents:
 * `Valor_de_la_inscripcion_regular` has none while
 * `Valor_de_la_inscripción_promocionada` does, and `Valor_de_la_certificacion`
 * has none either. Normalizing them here would silently stop matching the wire.
 *
 * Every text field is nullable, and an absent value may also arrive as the
 * literal `"S/D"`. Dates arrive as `dd/mm/yyyy` and counts arrive as strings.
 * Translating all of that is the tool layer's job, not the client's.
 */
export interface RawCommission {
  id_comision: number;
  id_curso: number;
  Organizacion: string | null;
  Comision: string | null;
  Curso: string | null;
  Modalidad: string | null;
  Estado_de_la_comisión: string | null;
  Carga_horaria_certificada: string | null;
  Categoria: string | null;
  Institución_Gestora: string | null;
  Institución_Certificadora: string | null;
  Institución_Capacitadora: string | null;
  Localidad_de_cursado: string | null;
  Lugar_de_cursado: string | null;
  Domicilio_de_la_sede: string | null;
  URL_MAPS: string | null;
  Fecha_Hora_Inicio: string | null;
  Duración_en_meses: string | null;
  Charla_Informativa: string | null;
  Primera_Clase: string | null;
  Segunda_Clase: string | null;
  Horarios_de_cursado: string | null;
  Valor_de_la_inscripcion_regular: string | null;
  Valor_de_la_inscripción_promocionada: string | null;
  Valor_de_la_cuota_regular: string | null;
  Valor_de_la_cuota_promocionada: string | null;
  Valor_del_pago_unico: string | null;
  Valor_de_la_cuota_con_recargo: string | null;
  Valor_de_la_certificacion: string | null;
  Página_web_del_curso: string | null;
  Enlace_invitación_grupo_de_Whatsapp: string | null;
  bot_contexto_operativo: string | null;
  bot_contexto_operativo_curso: string | null;
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

  /**
   * Recovers one commission by its id, or `null` when it does not exist.
   *
   * A missing commission is not a failure: the API answers 200 with
   * `result:"ok"`, `message:"Sin resultados."` and `data:null`. It may also
   * signal the same miss with `result:"error"`, so both shapes collapse into
   * `null` and only transport-level problems throw.
   */
  async getCommission(id: number): Promise<RawCommission | null> {
    const envelope = await this.call<RawCommission>("recuperar_comision_x_id", {
      id_comision: id,
    });
    if (envelope.result === "error") return null;
    return envelope.data ?? null;
  }
}
