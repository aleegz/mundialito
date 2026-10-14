/**
 * Validación pura del nombre de un participante (auto-registro del
 * link abierto y roster del owner). Vive acá —y no inline en la API
 * route— para poder testearla sin levantar Next ni Supabase.
 */

/** Largo máximo de un nombre. Un solo lugar para el número. */
export const MAX_PARTICIPANT_NAME_LENGTH = 100;

export type NameValidation =
  | { ok: true; value: string }
  | { ok: false; reason: "not-a-string" | "empty" | "too-long" };

/**
 * Valida y normaliza un nombre individual (`trim` incluido).
 * El llamador decide el mensaje/status según `reason`: acá no hay
 * copy de UI, solo la decisión.
 */
export function validateParticipantName(raw: unknown): NameValidation {
  if (typeof raw !== "string") {
    return { ok: false, reason: "not-a-string" };
  }

  const value = raw.trim();

  if (value.length === 0) {
    return { ok: false, reason: "empty" };
  }

  if (value.length > MAX_PARTICIPANT_NAME_LENGTH) {
    return { ok: false, reason: "too-long" };
  }

  return { ok: true, value };
}

/**
 * Normaliza una lista de nombres (roster del owner): `trim` a cada
 * uno y descarta los vacíos. Duplicados se conservan a propósito
 * (dos "Juan" son dos participantes distintos).
 */
export function cleanParticipantNames(names: readonly string[]): string[] {
  return names.map((name) => name.trim()).filter(Boolean);
}