import { describe, it, expect } from "vitest";
import {
  MAX_PARTICIPANT_NAME_LENGTH,
  validateParticipantName,
  cleanParticipantNames,
} from "@/lib/validation/participant-name";

describe("validateParticipantName", () => {
  it("rechaza valores que no son string", () => {
    expect(validateParticipantName(undefined)).toEqual({
      ok: false,
      reason: "not-a-string",
    });
    expect(validateParticipantName(null)).toEqual({
      ok: false,
      reason: "not-a-string",
    });
    expect(validateParticipantName(123)).toEqual({
      ok: false,
      reason: "not-a-string",
    });
  });

  it("rechaza vacío y solo-espacios", () => {
    expect(validateParticipantName("")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(validateParticipantName("   ")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(validateParticipantName("\t\n ")).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("acepta un nombre y lo normaliza con trim", () => {
    expect(validateParticipantName("Ana")).toEqual({ ok: true, value: "Ana" });
    expect(validateParticipantName("  Ana  ")).toEqual({
      ok: true,
      value: "Ana",
    });
  });

  it("acepta exactamente el máximo largo", () => {
    const name = "a".repeat(MAX_PARTICIPANT_NAME_LENGTH);
    expect(validateParticipantName(name)).toEqual({ ok: true, value: name });
  });

  it("rechaza uno que supera el máximo", () => {
    const name = "a".repeat(MAX_PARTICIPANT_NAME_LENGTH + 1);
    expect(validateParticipantName(name)).toEqual({
      ok: false,
      reason: "too-long",
    });
  });

  it("mide el largo DESPUÉS del trim", () => {
    // 100 letras + espacios alrededor: tras trim queda en el límite.
    const padded = `   ${"a".repeat(MAX_PARTICIPANT_NAME_LENGTH)}   `;
    expect(validateParticipantName(padded)).toEqual({
      ok: true,
      value: "a".repeat(MAX_PARTICIPANT_NAME_LENGTH),
    });
  });
});

describe("cleanParticipantNames", () => {
  it("lista vacía → lista vacía", () => {
    expect(cleanParticipantNames([])).toEqual([]);
  });

  it("hace trim y descarta vacíos", () => {
    expect(cleanParticipantNames([" Ana ", "", "  ", "Beto"])).toEqual([
      "Ana",
      "Beto",
    ]);
  });

  it("conserva duplicados a propósito (dos Juan = dos participantes)", () => {
    expect(cleanParticipantNames(["Juan", "Juan"])).toEqual(["Juan", "Juan"]);
  });

  it("conserva el orden de entrada", () => {
    expect(cleanParticipantNames(["c", "a", "b"])).toEqual(["c", "a", "b"]);
  });
});