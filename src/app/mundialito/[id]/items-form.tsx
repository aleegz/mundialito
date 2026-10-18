"use client";

import {
  useRef,
  useState,
  useTransition,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  MAX_ITEMS_PER_SUBMIT,
  addedItemsMessage,
  splitItemInput,
  uniqueItems,
} from "@/lib/ui/item-draft";

type Props = {
  mundialitoId: string;
};

/**
 * Alta de items al final de la lista, estilo "+ New" de Notion: mientras
 * no la usas es una fila fantasma; la tocas y se convierte en input.
 *
 * Cada item se guarda al instante y aparece en la lista real de arriba,
 * con el boton de borrar que ya existia al lado: la lista es un solo
 * lugar, no hay borrador que confirmar al final.
 *
 * Por que asi (y no chips apilados): con el estacionamiento de chips
 * nada se guardaba hasta apretar el boton, el contador no se movia
 * mientras cargabas y en el celular el unico gesto para sumar un item
 * era la tecla del teclado.
 *
 * Con teclado fisico, Enter sigue sumando. Pegar varias lineas las carga
 * de una en un solo POST: el atajo esta, el flujo por defecto es uno por
 * uno con un toque.
 *
 * El POST es el de siempre — `/api/items` con `{names: [nombre]}` — un
 * lote de uno. Cero endpoints nuevos, cero migraciones.
 */
export function AddItemsForm({ mundialitoId }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** El refresh de la lista va como transicion: no bloquea ni parpadea. */
  const [, startTransition] = useTransition();

  /**
   * Devuelve al input lo que se habia mandado, pero solo si el usuario
   * no empezo a escribir el siguiente item mientras viajaba el POST.
   */
  function restore(value: string) {
    setText((current) => (current === "" ? value : current));
  }

  async function submit(names: string[]) {
    /**
     * Limpieza optimista: el input queda listo para el siguiente item
     * sin esperar al servidor. Y no se deshabilita mientras vuela el
     * POST: deshabilitarlo en el celular bajaria el teclado.
     */
    const previous = text;
    setText("");
    setPending(true);
    setError(null);
    setNote(null);

    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mundialitoId, names }),
    });

    const data = await response.json().catch(() => null);
    setPending(false);

    if (!response.ok) {
      setError(data?.error ?? "No se pudieron agregar los ítems.");
      restore(previous);
      return;
    }

    const inserted =
      typeof data?.inserted === "number" ? data.inserted : names.length;

    if (inserted === 0) {
      setError("No se pudo agregar el ítem.");
      restore(previous);
      return;
    }

    /**
     * Un alta de a uno que entra completa no necesita aviso: el item ya
     * esta en la lista. El pegado masivo si, y mas si entraron menos:
     * RLS puede filtrar filas y callarlo es el mismo "exito fantasma"
     * que se corrigio en la Fase 1.
     */
    if (names.length > 1) {
      setNote(addedItemsMessage(inserted, names.length));
    }

    startTransition(() => router.refresh());
  }

  function addFromText(raw: string) {
    const names = uniqueItems(splitItemInput(raw));

    if (names.length === 0) return;

    // El tope espeja el `slice(0, 100)` de /api/items: si se pasa, no se
    // manda nada en vez de que el server corte la lista en silencio.
    if (names.length > MAX_ITEMS_PER_SUBMIT) {
      setError(`Máximo ${MAX_ITEMS_PER_SUBMIT} ítems a la vez.`);
      return;
    }

    void submit(names);
  }

  function close() {
    setOpen(false);
    setText("");
    setError(null);
    setNote(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      // Enter suma de a uno (teclado fisico); nunca manda un form.
      event.preventDefault();
      addFromText(text);
      return;
    }

    if (event.key === "Escape") {
      close();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");

    // Una sola linea: pegado normal, queda en el input para editarla.
    if (!pasted.includes("\n")) return;

    // Varias lineas: es una lista, no un nombre. Un solo POST.
    event.preventDefault();
    addFromText(pasted);
  }

  if (!open) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 py-2.5 text-left text-[0.9375rem] font-medium text-brand hover:bg-sunken"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            +
          </span>
          Agregar ítem
        </button>
      </li>
    );
  }

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
            setNote(null);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="Nombre del ítem"
          className="input min-w-[8rem] flex-1"
          autoComplete="off"
          enterKeyHint="enter"
          aria-label="Nombre del ítem"
          autoFocus
        />

        <button
          type="button"
          // Evita que el toque le saque el foco al input: en el celular
          // eso bajaria el teclado entre item e item.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => addFromText(text)}
          disabled={pending || text.trim() === ""}
          className="btn btn-primary btn-sm"
        >
          {pending ? "Agregando…" : "Agregar"}
        </button>

        <button
          type="button"
          onClick={close}
          className="btn btn-ghost btn-sm"
        >
          Cancelar
        </button>
      </div>

      {error ? (
        <p className="alert alert-danger mt-2" role="alert">
          {error}
        </p>
      ) : null}

      {!error && note ? (
        <p className="hint mt-2" role="status">
          {note}
        </p>
      ) : null}
    </li>
  );
}
