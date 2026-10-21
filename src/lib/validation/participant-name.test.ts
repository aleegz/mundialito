import { describe, it, expect } from "vitest";
import {
  DEFAULT_OWNER_NAME,
  MAX_PARTICIPANT_NAME_LENGTH,
  ownerDisplayName,
  validateParticipantName,
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

describe("ownerDisplayName", () => {
  it("prefiere el nombre de perfil si existe (OAuth)", () => {
    expect(
      ownerDisplayName({ fullName: "Alejandro", email: "ale@mail.com" }),
    ).toBe("Alejandro");
  });

  it("cae en la parte local del email (registro con email+password)", () => {
    expect(ownerDisplayName({ email: "ale@mail.com" })).toBe("ale");
  });

  it("hace trim del nombre de perfil", () => {
    expect(ownerDisplayName({ fullName: "  Ale  ", email: "x@y.com" })).toBe(
      "Ale",
    );
  });

  it("usa el email entero si la parte local no sirve", () => {
    expect(ownerDisplayName({ email: "@mail.com" })).toBe("@mail.com");
  });

  it("ignora un nombre de perfil vacío o demasiado largo", () => {
    expect(ownerDisplayName({ fullName: "   ", email: "ale@mail.com" })).toBe(
      "ale",
    );
    expect(
      ownerDisplayName({ fullName: "a".repeat(101), email: "ale@mail.com" }),
    ).toBe("ale");
  });

  it("nunca devuelve vacío: cae en el default (la DB exige nombre)", () => {
    expect(ownerDisplayName({})).toBe(DEFAULT_OWNER_NAME);
    expect(ownerDisplayName({ fullName: null, email: null })).toBe(
      DEFAULT_OWNER_NAME,
    );
    expect(ownerDisplayName({ email: "   " })).toBe(DEFAULT_OWNER_NAME);
  });
});