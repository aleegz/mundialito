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

/**
 * Nombre por defecto si no se puede derivar nada del perfil. Existe
 * para garantizar que el INSERT del owner nunca viole el CHECK
 * `length(trim(display_name)) > 0`.
 */
export const DEFAULT_OWNER_NAME = "Organizador";

/**
 * Nombre con el que se anota el owner al crear el torneo. No se le
 * pregunta: se deriva de su cuenta (nombre de perfil si algun dia hay
 * OAuth, si no la parte local del email). Devuelve siempre un nombre
 * valido.
 */
export function ownerDisplayName(input: {
  fullName?: unknown;
  email?: unknown;
}): string {
  const candidates: unknown[] = [input.fullName];

  if (typeof input.email === "string") {
    // "ale@gmail.com" -> "ale" (lo que sus amigos reconocen), y si la
    // parte local no sirve, el email entero como ultimo recurso.
    candidates.push(input.email.split("@")[0], input.email);
  }

  for (const candidate of candidates) {
    const validated = validateParticipantName(candidate);
    if (validated.ok) return validated.value;
  }

  return DEFAULT_OWNER_NAME;
}