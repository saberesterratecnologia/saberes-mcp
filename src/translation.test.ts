import test from "node:test";
import assert from "node:assert/strict";

import { ApiMcpError } from "./api-mcp-client.ts";
import { describeFailure, normalizeDisplayName } from "./translation.ts";

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
  // Sentence case is the Spanish convention: title case would capitalize the
  // preposition and read as a translation artifact.
  assert.equal(
    normalizeDisplayName("ELABORACIÓN DE CERVEZA ARTESANAL"),
    "Elaboración de cerveza artesanal",
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

test("every failure kind gets its own explanation, chosen by kind", () => {
  const seen = new Set<string>();
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
    // The internal wording must never reach the person.
    assert.ok(!text.includes("internal detail"), kind);
    // The fallback sentence is for failures that are not the API's.
    assert.ok(!text.includes("error inesperado del servidor MCP"), kind);
    seen.add(text);
  }

  // Authentication, permissions, timeouts and outages must not read alike.
  assert.ok(seen.size >= 5);
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

test("a non-API failure still produces a sentence, not a crash", () => {
  assert.match(describeFailure(new Error("boom")), /error inesperado/);
});
