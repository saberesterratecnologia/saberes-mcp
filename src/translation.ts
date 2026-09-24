/**
 * Presentation rules shared by every tool.
 *
 * There is no data translation left to do: `/api-mcp` answers clean data —
 * `null` instead of the `"S/D"` sentinel, ISO dates, numbers as numbers — so
 * the casing, sentinel and date parsing that `/api` forced on every tool is
 * gone with it.
 *
 * What remains is presentation, and it is shared because every tool would
 * otherwise reinvent it and drift: how a name is shown to a person, and how a
 * failure is explained to one.
 */

import { ApiMcpError } from "./api-mcp-client.ts";

/**
 * Sentence case, which is the Spanish convention: only the first word is
 * capitalized. English title case would produce "Elaboración De Cerveza
 * Artesanal", capitalizing prepositions and conjunctions, which reads as a
 * translation artifact.
 */
function toSentenceCase(value: string): string {
  const lowered = value.toLocaleLowerCase("es-AR");
  return lowered.slice(0, 1).toLocaleUpperCase("es-AR") + lowered.slice(1);
}

/**
 * Normalizes a name `/api-mcp` sends for display.
 *
 * The endpoint already stores names the way they should be read — "Terra -
 * Instituto de Formación Agropecuaria", "Producción Extensiva de Cereales y
 * Oleaginosas" — so re-casing them would only destroy information: title case
 * would capitalize "de", and sentence case would lower-case the proper nouns.
 *
 * A handful of course names are still loaded shouted ("GESTIÓN CONTABLE
 * APLICADA AL AGRO"). Those carry no capitalization to preserve, because there
 * is no lower-case letter anywhere in them, and only those are rewritten into
 * Spanish sentence case. Everything else is returned trimmed and untouched.
 */
export function normalizeDisplayName(value: string): string {
  const trimmed = value.trim();
  return /\p{Ll}/u.test(trimmed) ? trimmed : toSentenceCase(trimmed);
}

/** The sentences a person reads when the CRM could not answer. */
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
 * Anything that is not an `ApiMcpError` is a bug in this server, not a problem
 * of the CRM, and is said as such rather than blamed on Saberes.
 */
export function describeFailure(error: unknown): string {
  if (error instanceof ApiMcpError) return describeApiMcpFailure(error);
  return "No pude hacer la consulta por un error inesperado del servidor MCP.";
}

/**
 * Each case is selected by the error's `kind`, never by matching message text.
 * The switch is exhaustive by construction: it has no `default`, so a new kind
 * on the client stops compiling here until it has its sentence.
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
