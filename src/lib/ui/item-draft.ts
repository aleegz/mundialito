/**
 * Logica pura del alta de items (hallazgos #5 y #6 del review de flujo):
 * separar lo que se pega, deduplicar y redactar los avisos. Vive fuera
 * del componente para poder testearla sin DOM (mismo criterio que
 * `cruces-action-copy.ts`).
 */

/**
 * Tope por envio. Espejo del `slice(0, 100)` de `/api/items`: el server
 * corta en 100, asi que el cliente no puede prometer mas.
 */
export const MAX_ITEMS_PER_SUBMIT = 100;

/**
 * Divide lo tipeado o pegado en nombres candidatos.
 *
 * Solo el salto de linea separa (a proposito: una coma puede ser parte
 * del nombre — "Havanna, el clasico"), el `trim` se come la indentacion
 * de una lista pegada de otro lado (y el `\r` de un pegado de Windows)
 * y los vacios se caen.
 */
export function splitItemInput(raw: string): string[] {
  return raw
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);
}

/** Clave de comparacion: "Havanna " y "havanna" son el mismo item. */
function itemKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Deduplica preservando el orden y el texto de la PRIMERA aparicion.
 *
 * El bulk es un solo INSERT y la tabla no tiene unique constraint: si
 * el pegado trae "Havanna" dos veces, el cliente lo manda una sola vez.
 */
export function uniqueItems(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of names) {
    const clean = name.trim();
    if (!clean) continue;

    const key = itemKey(clean);
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(clean);
  }

  return result;
}

function itemCountLabel(count: number): string {
  return count === 1 ? "1 ítem" : `${count} ítems`;
}

/**
 * Aviso de resultado de un alta multiple. Si entraron menos de los
 * pedidos se dice explicito: RLS puede filtrar filas y callarlo es el
 * mismo "exito fantasma" que se corrigio en la Fase 1.
 */
export function addedItemsMessage(inserted: number, total: number): string {
  if (inserted === total) {
    return inserted === 1
      ? "Se agregó 1 ítem."
      : `Se agregaron ${itemCountLabel(inserted)}.`;
  }

  return `Se agregaron ${inserted} de ${total} ítems.`;
}
