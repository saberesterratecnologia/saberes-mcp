/**
 * Translation rules shared by every tool.
 *
 * The API is a CRM export surface: values arrive in upper case, dates come as
 * `dd/mm/yyyy`, numbers come as strings, and an absent value is spelled `"S/D"`
 * instead of being omitted. Each tool would otherwise reinvent the same casing,
 * sentinel and date handling, and would drift apart while doing it.
 *
 * These are the R1–R4 rules of the design document, in one place.
 */

import { ApiMcpError } from "./api-mcp-client.ts";
import { SaberesApiError } from "./saberes-client.ts";

/** The literal the CRM writes when a field has no value. */
const SENTINEL = "S/D";

/**
 * `dd/mm/yyyy` with an optional trailing time, which is discarded.
 *
 * The time components are captured instead of skipped because their ranges
 * still have to be checked: the shape alone would accept `99:99`.
 */
const DATE_PATTERN =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

export function upperFirst(value: string): string {
  const first = value.slice(0, 1).toLocaleUpperCase("es-AR");
  return first + value.slice(1);
}

/**
 * Course titles use sentence case, which is the Spanish convention: only the
 * first word is capitalized. English title case would produce "Elaboración De
 * Cerveza Artesanal", capitalizing prepositions and conjunctions, which reads
 * as a translation artifact.
 */
export function toSentenceCase(value: string): string {
  return upperFirst(value.toLocaleLowerCase("es-AR"));
}

/**
 * Organization names are proper nouns, so every word is capitalized. They are
 * short and known — "Instituto Terra", "Fundación Saberes" — so there is no
 * minor-word problem to solve here.
 */
export function toProperNoun(value: string): string {
  return value
    .toLocaleLowerCase("es-AR")
    .split(/(\s+)/)
    .map(upperFirst)
    .join("");
}

/**
 * R2: turns an absent value into a genuinely absent one.
 *
 * `null`, an empty or blank string, and the `"S/D"` sentinel all mean the same
 * thing: the CRM has nothing here. Returning `undefined` lets the caller omit
 * the key entirely, so the agent never has to learn that `"S/D"` is not data.
 *
 * Casing helpers must run *after* this one, otherwise `"S/D"` would be cased
 * into `"S/d"` and would stop looking like the sentinel it is.
 */
export function dropSentinel(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === SENTINEL) return undefined;
  return trimmed;
}

/**
 * R4: converts the CRM's `dd/mm/yyyy` into an ISO `YYYY-MM-DD` date.
 *
 * The raw string is never handed to `Date`, whose parsing of `15/10/2026` is
 * locale- and engine-dependent and would read the day as a month. Instead the
 * components are matched explicitly and validated by round-tripping them
 * through `Date.UTC`, which is what rejects `31/02/2026` rather than rolling it
 * over into March.
 *
 * A trailing time is discarded, but it is still validated: `24:00` or `99:99`
 * is a malformed field, and R4 omits a malformed field whole rather than
 * salvaging the half of it that happens to parse.
 *
 * Date fields also carry free text in production ("Sin charla programada"), so
 * anything that does not match is absent, not an error.
 */
export function toIsoDate(value: string | null | undefined): string | undefined {
  const text = dropSentinel(value);
  if (text === undefined) return undefined;

  const match = DATE_PATTERN.exec(text);
  if (!match) return undefined;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const rawHours = match[4];
  if (rawHours !== undefined) {
    const hours = Number(rawHours);
    const minutes = Number(match[5] ?? 0);
    const seconds = Number(match[6] ?? 0);
    if (hours > 23 || minutes > 59 || seconds > 59) return undefined;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!roundTrips) return undefined;

  const paddedMonth = String(month).padStart(2, "0");
  const paddedDay = String(day).padStart(2, "0");
  return `${year}-${paddedMonth}-${paddedDay}`;
}

/**
 * Reads a count the CRM may send as a string (`"4"`) or as a number.
 *
 * Only a strictly positive integer is a count: `"0"`, `"-1"` and `"4.5"` are
 * data errors, and so are the sentinel and free text. All of them are absent.
 */
export function toPositiveInteger(
  value: string | number | null | undefined,
): number | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }

  const text = dropSentinel(value);
  if (text === undefined) return undefined;
  if (!/^\d+$/.test(text)) return undefined;

  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * The sentences shared by both clients.
 *
 * `/api` and `/api-mcp` fail for the same reasons, so the person must read the
 * same explanation either way: which endpoint answered is an implementation
 * detail of the migration, not something to relay.
 */
const AUTHENTICATION_FAILED =
  "No pude autenticarme contra el sistema Saberes. El token de la integración no es válido o el cliente está desactivado. Avisale al equipo técnico; no es algo que puedas resolver desde acá.";
const ACTION_NOT_ALLOWED =
  "Esta integración no tiene permiso para esta consulta. El permiso se otorga en el CRM, por el equipo técnico.";
const TIMEOUT =
  "El sistema Saberes no respondió a tiempo. Puede ser algo pasajero: probá de nuevo en un momento.";
const NETWORK_ERROR =
  "No pude conectarme al sistema Saberes. Puede estar caído o haber un problema de red.";
const SERVER_ERROR =
  "El sistema Saberes falló al procesar la consulta. El error quedó registrado del lado del CRM para que lo revisen.";
const UNINTERPRETABLE_ANSWER =
  "El sistema Saberes respondió de una forma que no pude interpretar. Avisale al equipo técnico.";

/**
 * Explains a failure in terms the agent can relay to a person.
 *
 * Each case is selected by the error's `kind`, never by matching message text.
 * Both switches are exhaustive by construction: neither has a `default`, so a
 * new kind on either client stops compiling here until it has its sentence.
 */
export function describeFailure(error: unknown): string {
  if (error instanceof ApiMcpError) return describeApiMcpFailure(error);
  if (error instanceof SaberesApiError) return describeSaberesFailure(error);
  return "No pude hacer la consulta por un error inesperado del servidor MCP.";
}

/** The legacy `/api` client, kept until the tools finish migrating. */
function describeSaberesFailure(error: SaberesApiError): string {
  switch (error.kind) {
    case "authentication_failed":
      return AUTHENTICATION_FAILED;
    case "action_not_allowed":
      return ACTION_NOT_ALLOWED;
    case "timeout":
      return TIMEOUT;
    case "network_error":
      return NETWORK_ERROR;
    case "server_error":
      return SERVER_ERROR;
    case "api_error":
      return "El sistema Saberes rechazó la consulta sin un motivo que pueda interpretar. Avisale al equipo técnico.";
    case "invalid_json":
    case "bad_request":
    case "method_not_allowed":
    case "unexpected_status":
      return UNINTERPRETABLE_ANSWER;
  }
}

/**
 * The `/api-mcp` client, which can fail in two ways `/api` could not name: a
 * resource that genuinely does not exist (a real 404 instead of an empty
 * envelope), and a contract that moved under us.
 */
function describeApiMcpFailure(error: ApiMcpError): string {
  switch (error.kind) {
    case "authentication_failed":
      return AUTHENTICATION_FAILED;
    case "action_not_allowed":
      return ACTION_NOT_ALLOWED;
    case "timeout":
      return TIMEOUT;
    case "network_error":
      return NETWORK_ERROR;
    case "server_error":
      return SERVER_ERROR;
    case "not_found":
      // Deliberately generic: the client knows what it asked for, but this
      // layer does not, and inventing the subject would be worse than saying
      // plainly that it is not there.
      return "No encontré lo que pediste en el sistema Saberes.";
    case "contract_changed":
      return "El sistema Saberes cambió la forma de sus respuestas y no puedo interpretarlas con seguridad. Avisale al equipo técnico.";
    case "invalid_json":
    case "bad_request":
    case "method_not_allowed":
    case "unexpected_status":
      return UNINTERPRETABLE_ANSWER;
  }
}
