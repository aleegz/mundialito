/**
 * Etiquetas y estilos de presentacion para los enums de la DB.
 * Puro (sin React, sin Supabase): el nombre visible de un estado vive
 * en UN solo lugar, asi la home, el dashboard y la pantalla de creacion
 * nunca se contradicen.
 *
 * Fuente de verdad de los enums: supabase/migrations/004_cruces_mode.sql
 *   RANKING: DRAFT -> ACTIVE -> FINISHED
 *   CRUCES:  DRAFT -> PARTICIPANTS_OPEN -> PARTICIPANTS_LOCKED
 *                   -> DRAWN -> VOTING -> FINISHED
 */

export type MundialitoMode = "RANKING" | "CRUCES";

export type MundialitoStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PARTICIPANTS_OPEN"
  | "PARTICIPANTS_LOCKED"
  | "DRAWN"
  | "VOTING"
  | "FINISHED";

export type Meta = { label: string; pill: string };

const MODE_META: Record<MundialitoMode, Meta> = {
  RANKING: { label: "Ranking", pill: "pill-neutral" },
  CRUCES: { label: "Cruces", pill: "pill-brand" },
};

const STATUS_META: Record<MundialitoStatus, Meta> = {
  DRAFT: { label: "Borrador", pill: "pill-neutral" },
  ACTIVE: { label: "Votación abierta", pill: "pill-success" },
  PARTICIPANTS_OPEN: { label: "Inscripción abierta", pill: "pill-info" },
  PARTICIPANTS_LOCKED: { label: "Inscripción cerrada", pill: "pill-info" },
  DRAWN: { label: "Bracket listo", pill: "pill-brand" },
  VOTING: { label: "Votación en curso", pill: "pill-warning" },
  FINISHED: { label: "Finalizado", pill: "pill-success" },
};

/**
 * Titulo + clase de pill de un modo. Tolera valores inesperados de la
 * DB (nunca rompe la vista por un enum nuevo).
 */
export function modeMeta(mode: string | null | undefined): Meta {
  if (mode && mode in MODE_META) {
    return MODE_META[mode as MundialitoMode];
  }
  return { label: mode ?? "Sin modo", pill: "pill-neutral" };
}

/** Titulo + clase de pill de un estado. Mismo criterio tolerante. */
export function statusMeta(status: string | null | undefined): Meta {
  if (status && status in STATUS_META) {
    return STATUS_META[status as MundialitoStatus];
  }
  return { label: status ?? "Sin estado", pill: "pill-neutral" };
}

/** Descripcion corta de cada modo, para la pantalla de creacion. */
export const MODE_DESCRIPTION: Record<MundialitoMode, string> = {
  RANKING:
    "Cada participante puntúa los ítems del 1 al 10. Gana el de mejor promedio.",
  CRUCES:
    "Eliminación directa: se arma el bracket y en cada cruce se vota A o B.",
};

/**
 * Fecha corta en formato local (es-AR). Recibe el ISO de Supabase.
 * Devuelve null si la fecha es inválida para no imprimir "Invalid Date".
 */
export function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
