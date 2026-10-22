/**
 * Copia visible del panel de acciones del owner (modo CRUCES).
 *
 * Puro (sin React, sin Supabase) y fuera del componente para poder
 * testearlo: el globo de confirmacion se renderizaba VACIO al cerrar
 * la inscripcion porque `CONFIRM_TEXT.patch` era "" y el texto solo se
 * completaba en la rama de PARTICIPANTS_OPEN. El tipo de abajo hace
 * que ese estado sea irrepresentable: `patch` no participa del Record
 * y su texto se resuelve en el unico lugar donde el target es visible.
 */

export type CrucesAction =
  | { kind: "patch"; target: "PARTICIPANTS_OPEN" | "PARTICIPANTS_LOCKED" }
  | { kind: "draw" }
  | { kind: "start" }
  | { kind: "finalize" }
  | { kind: "next" };

/**
 * Confirmacion de las acciones sin destino: agregar un kind nuevo
 * rompe el typecheck (falta la propiedad en el Record), no la UI.
 */
const CONFIRM_TEXT: Record<Exclude<CrucesAction["kind"], "patch">, string> = {
  draw: "¿Sortear el bracket? Se mezclan los ítems y se arman los cruces.",
  start: "¿Iniciar la votación? Se abre el primer cruce.",
  finalize:
    "¿Finalizar el cruce abierto? Requiere que voten todos los participantes activos.",
  next: "¿Abrir el siguiente cruce?",
};

/** Texto del globo amarillo de confirmacion. Nunca vacio. */
export function confirmTextFor(action: CrucesAction): string {
  if (action.kind === "patch") {
    return action.target === "PARTICIPANTS_OPEN"
      ? "¿Iniciar el torneo? Se abre la inscripción para que la gente se sume desde el link. Después no se podrán editar los ítems."
      : "¿Cerrar la inscripción? Después no se puede sumar nadie más.";
  }

  return CONFIRM_TEXT[action.kind];
}

/**
 * Etiquetas de las acciones sin destino. `start`/`finalize`/`next`
 * viven aca; `patch` y `draw` se resuelven abajo porque dependen del
 * estado (abrir/cerrar, sortear/re-sortear).
 */
const ACTION_LABEL: Record<
  Exclude<CrucesAction["kind"], "patch" | "draw">,
  string
> = {
  start: "Iniciar votación",
  finalize: "Finalizar cruce abierto",
  next: "Abrir siguiente cruce",
};

/** Etiqueta del boton. `status` entra porque un bracket ya sorteado
 * convierte "Sortear" en "Re-sortear". */
export function actionLabelFor(action: CrucesAction, status: string): string {
  if (action.kind === "patch") {
    return action.target === "PARTICIPANTS_OPEN"
      ? "Iniciar torneo"
      : "Cerrar inscripción";
  }

  if (action.kind === "draw") {
    return status === "DRAWN" ? "Re-sortear" : "Sortear";
  }

  return ACTION_LABEL[action.kind];
}
