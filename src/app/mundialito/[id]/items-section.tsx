"use client";

import { useRef, useState } from "react";
import { AddItemsForm } from "./items-form";
import { DeleteItemButton } from "./delete-item-button";

type Item = {
  id: string;
  name: string;
  description: string | null;
};

type PendingItem = {
  /** Clave de React: el item todavia no tiene id de la base. */
  key: number;
  name: string;
};

type Props = {
  mundialitoId: string;
  items: Item[];
  /** Owner en DRAFT: unico caso con alta y borrado. */
  canEdit: boolean;
};

/**
 * Seccion de items: contador, lista y alta en un solo componente cliente.
 *
 * Por que cliente: la fila optimista tiene que aparecer AL TOQUE y el
 * contador del header tiene que moverse con ella. Si la lista quedara
 * en el server y solo el alta fuera cliente, el item estaria a la vista
 * pero el numero seguiria congelado — justo el hallazgo #6 del Lote C.
 *
 * El server sigue siendo la verdad: la fila optimista es efimera, existe
 * solo mientras viaja el POST y se va en la MISMA transicion en la que
 * entra la lista nueva (ver `onSettled` en AddItemsForm). Nunca hay dos
 * filas del mismo item: o la optimista, o la real.
 *
 * El alta conoce `onPending`/`onSettled` y el POST; aca solo se guardan
 * las filas pendientes para pintarlas arriba del form, que es el lugar
 * donde cae el item nuevo.
 */
export function ItemsSection({ mundialitoId, items, canEdit }: Props) {
  const [pending, setPending] = useState<PendingItem[]>([]);
  /** Contador de claves: dos altas seguidas no pueden compartir key. */
  const nextKeyRef = useRef(0);

  function addPending(names: string[]) {
    const rows = names.map((name) => ({
      key: nextKeyRef.current++,
      name,
    }));

    setPending((current) => [...current, ...rows]);
  }

  function clearPending() {
    setPending([]);
  }

  return (
    <section className="play-card card-pad mt-6" aria-label="Items">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="h3">Ítems</h2>
        {/* El contador cuenta tambien lo que todavia no confirmo el server:
            es lo que el usuario ve en la lista. */}
        <span className="pill pill-neutral play-pill">{items.length + pending.length}</span>
      </div>

      {items.length || canEdit ? (
        <ul className="mt-4 divide-y divide-line">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <span className="min-w-0">
                <span className="block truncate text-[0.9375rem] font-medium text-fg">
                  {item.name}
                </span>
                {item.description ? (
                  <span className="hint">{item.description}</span>
                ) : null}
              </span>

              {canEdit ? (
                <DeleteItemButton itemId={item.id} name={item.name} />
              ) : null}
            </li>
          ))}

          {/*
            Filas optimistas: sin id todavia, asi que no llevan "Eliminar"
            (no hay que borrar). El pill dice la verdad: se esta guardando.
          */}
          {pending.map((row) => (
            <li
              key={`pending-${row.key}`}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <span className="block min-w-0 truncate text-[0.9375rem] font-medium text-muted">
                {row.name}
              </span>
              <span className="pill pill-neutral">Guardando…</span>
            </li>
          ))}

          {/* El alta vive al final de la lista (patron "+ New"): cada
              item nuevo aparece arriba, en su lugar definitivo. */}
          {canEdit ? (
            <AddItemsForm
              mundialitoId={mundialitoId}
              onPending={addPending}
              onSettled={clearPending}
            />
          ) : null}
        </ul>
      ) : (
        <p className="hint mt-4">Todavía no hay ítems.</p>
      )}
    </section>
  );
}
