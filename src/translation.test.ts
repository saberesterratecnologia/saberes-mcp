import test from "node:test";
import assert from "node:assert/strict";

import { ApiMcpError } from "./api-mcp-client.ts";
import { SaberesApiError } from "./saberes-client.ts";
import {
  describeFailure,
  dropSentinel,
  normalizeDisplayName,
  toIsoDate,
  toPositiveInteger,
  toProperNoun,
  toSentenceCase,
  upperFirst,
} from "./translation.ts";

test("upperFirst capitalizes only the first character", () => {
  assert.equal(upperFirst("apicultura"), "Apicultura");
  assert.equal(upperFirst("élite"), "Élite");
  assert.equal(upperFirst(""), "");
});

test("sentence case keeps the Spanish convention of one capital", () => {
  assert.equal(
    toSentenceCase("ELABORACIÓN DE CERVEZA ARTESANAL"),
    "Elaboración de cerveza artesanal",
  );
});

test("proper nouns capitalize every word and preserve the spacing", () => {
  assert.equal(toProperNoun("INSTITUTO TERRA"), "Instituto Terra");
  assert.equal(toProperNoun("FUNDACIÓN  SABERES"), "Fundación  Saberes");
});

test("a name shouted in upper case is brought back to sentence case", () => {
  // `/api-mcp` sends most names in Title Case, but a few arrive shouted.
  assert.equal(
    normalizeDisplayName("GESTIÓN CONTABLE APLICADA AL AGRO"),
    "Gestión contable aplicada al agro",
  );
  assert.equal(
    normalizeDisplayName("LIDERAZGO Y GERENCIA EN LA AGROINDUSTRIA"),
    "Liderazgo y gerencia en la agroindustria",
  );
});

test("a name that already has lower case is left exactly as it came", () => {
  // Re-casing it would destroy the CRM's own capitalization, which is right
  // far more often than a blind rule would be.
  assert.equal(
    normalizeDisplayName("Producción Extensiva de Cereales y Oleaginosas"),
    "Producción Extensiva de Cereales y Oleaginosas",
  );
  assert.equal(
    normalizeDisplayName("Terra - Instituto de Formación Agropecuaria"),
    "Terra - Instituto de Formación Agropecuaria",
  );
  assert.equal(normalizeDisplayName("Apicultura"), "Apicultura");
});

test("a display name is always trimmed, whichever branch it takes", () => {
  assert.equal(normalizeDisplayName("  Apicultura  "), "Apicultura");
  assert.equal(normalizeDisplayName("  APICULTURA  "), "Apicultura");
  assert.equal(normalizeDisplayName(""), "");
  assert.equal(normalizeDisplayName("   "), "");
});

test("a name without letters is not mangled by the upper-case branch", () => {
  assert.equal(normalizeDisplayName("2026"), "2026");
  assert.equal(normalizeDisplayName("AGRO 2026"), "Agro 2026");
});

test("R2: the sentinel and the empty values become absent", () => {
  assert.equal(dropSentinel(null), undefined);
  assert.equal(dropSentinel(undefined), undefined);
  assert.equal(dropSentinel(""), undefined);
  assert.equal(dropSentinel("   "), undefined);
  assert.equal(dropSentinel("S/D"), undefined);
  assert.equal(dropSentinel("  S/D  "), undefined);
});

test("R2: a real value survives, trimmed and otherwise untouched", () => {
  assert.equal(dropSentinel("  64 horas "), "64 horas");
  assert.equal(
    dropSentinel("PRODUCCIÓN EXTENSIVA-D-OCTUBRE-2026"),
    "PRODUCCIÓN EXTENSIVA-D-OCTUBRE-2026",
  );
  // Only the exact sentinel is dropped, not a value that contains it.
  assert.equal(dropSentinel("S/D pero no tanto"), "S/D pero no tanto");
});

test("R4: dd/mm/yyyy becomes an ISO date", () => {
  assert.equal(toIsoDate("15/10/2026"), "2026-10-15");
  assert.equal(toIsoDate("  15/10/2026  "), "2026-10-15");
  assert.equal(toIsoDate("1/2/2026"), "2026-02-01");
  assert.equal(toIsoDate("29/02/2024"), "2024-02-29");
});

test("R4: an optional trailing time is tolerated and dropped", () => {
  assert.equal(toIsoDate("15/10/2026 09:00"), "2026-10-15");
  assert.equal(toIsoDate("15/10/2026 9:00:00"), "2026-10-15");
  assert.equal(toIsoDate("15/10/2026 23:59:59"), "2026-10-15");
  assert.equal(toIsoDate("15/10/2026T00:00"), "2026-10-15");
});

test("R4: an impossible time makes the whole field absent", () => {
  // The time is discarded, but it is still evidence: a field that cannot be
  // read is malformed as a whole, so its date is not trustworthy either.
  assert.equal(toIsoDate("15/10/2026 24:00"), undefined);
  assert.equal(toIsoDate("15/10/2026 99:99"), undefined);
  assert.equal(toIsoDate("15/10/2026 10:60"), undefined);
  assert.equal(toIsoDate("15/10/2026 10:00:60"), undefined);
});

test("R4: impossible dates are absent, never silently shifted", () => {
  // JavaScript's Date would roll 31/02 over into March.
  assert.equal(toIsoDate("31/02/2026"), undefined);
  assert.equal(toIsoDate("29/02/2026"), undefined);
  assert.equal(toIsoDate("00/10/2026"), undefined);
  assert.equal(toIsoDate("15/13/2026"), undefined);
  assert.equal(toIsoDate("15/00/2026"), undefined);
});

test("R4: free text and sentinels are absent", () => {
  assert.equal(toIsoDate("Sin charla programada"), undefined);
  assert.equal(toIsoDate("S/D"), undefined);
  assert.equal(toIsoDate(""), undefined);
  assert.equal(toIsoDate(null), undefined);
  assert.equal(toIsoDate(undefined), undefined);
  assert.equal(toIsoDate("2026-10-15"), undefined);
  assert.equal(toIsoDate("15/10/26"), undefined);
});

test("a positive integer is read from a string or a number", () => {
  assert.equal(toPositiveInteger("4"), 4);
  assert.equal(toPositiveInteger(4), 4);
  assert.equal(toPositiveInteger(" 12 "), 12);
});

test("anything that is not a positive integer is absent", () => {
  assert.equal(toPositiveInteger("4.5"), undefined);
  assert.equal(toPositiveInteger(4.5), undefined);
  assert.equal(toPositiveInteger("abc"), undefined);
  assert.equal(toPositiveInteger("0"), undefined);
  assert.equal(toPositiveInteger("-1"), undefined);
  assert.equal(toPositiveInteger(""), undefined);
  assert.equal(toPositiveInteger("S/D"), undefined);
  assert.equal(toPositiveInteger(null), undefined);
  assert.equal(toPositiveInteger(undefined), undefined);
});

test("each failure kind gets its own explanation, chosen by kind", () => {
  const seen = new Set<string>();
  const kinds = [
    "authentication_failed",
    "action_not_allowed",
    "timeout",
    "network_error",
    "server_error",
    "invalid_json",
    "api_error",
  ] as const;

  for (const kind of kinds) {
    const text = describeFailure(new SaberesApiError(kind, "internal detail"));
    assert.ok(text.length > 0, kind);
    // The internal wording must never reach the person.
    assert.ok(!text.includes("internal detail"), kind);
    seen.add(text);
  }

  // Authentication, permissions, timeouts and outages must not read alike.
  assert.ok(seen.size >= 5);
});

test("an error envelope is explained as a rejection, not as an odd answer", () => {
  const envelope = describeFailure(
    new SaberesApiError("api_error", "internal detail", 200),
  );

  assert.match(envelope, /rechaz\u00f3/);
  // It must not borrow the wording of a shape the tool could not parse.
  assert.notEqual(
    envelope,
    describeFailure(new SaberesApiError("unexpected_status", "internal detail", 418)),
  );
});

test("every /api-mcp failure kind gets its own explanation, chosen by kind", () => {
  const kinds = [
    "authentication_failed",
    "action_not_allowed",
    "bad_request",
    "not_found",
    "method_not_allowed",
    "server_error",
    "unexpected_status",
    "invalid_json",
    "contract_changed",
    "timeout",
    "network_error",
  ] as const;

  for (const kind of kinds) {
    const text = describeFailure(new ApiMcpError(kind, "internal detail"));
    assert.ok(text.length > 0, kind);
    assert.ok(!text.includes("internal detail"), kind);
    // The fallback sentence is for failures that are not the API's.
    assert.ok(!text.includes("error inesperado del servidor MCP"), kind);
  }
});

test("a missing resource is explained as such, without inventing a reason", () => {
  const text = describeFailure(new ApiMcpError("not_found", "detail", 404));

  assert.match(text, /No encontr/);
  // It must not read like a failure the person could retry or escalate.
  assert.notEqual(
    text,
    describeFailure(new ApiMcpError("server_error", "detail", 500)),
  );
});

test("a changed contract asks for the technical team, not for a retry", () => {
  const text = describeFailure(
    new ApiMcpError("contract_changed", "issue at data.0.organizacion", 200),
  );

  assert.match(text, /cambi\u00f3 la forma de sus respuestas/);
  assert.match(text, /equipo t\u00e9cnico/);
  assert.ok(!text.includes("data.0.organizacion"));
});

test("the shared kinds read the same on both clients", () => {
  const shared = [
    "authentication_failed",
    "action_not_allowed",
    "timeout",
    "network_error",
    "server_error",
    "invalid_json",
    "bad_request",
    "method_not_allowed",
    "unexpected_status",
  ] as const;

  for (const kind of shared) {
    assert.equal(
      describeFailure(new ApiMcpError(kind, "detail")),
      describeFailure(new SaberesApiError(kind, "detail")),
      kind,
    );
  }
});

test("a non-API failure still produces a sentence, not a crash", () => {
  assert.match(describeFailure(new Error("boom")), /error inesperado/);
});
