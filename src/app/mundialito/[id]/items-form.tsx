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
  devFillerItemNames,
  splitItemInput,
  uniqueItems,
} from "@/lib/ui/item-draft";

type Props = {
  mundialitoId: string;
  /**
   * Filas optimistas: el padre las pinta arriba del form mientras viaja
   * el POST. Se llama desde el evento, fuera de transicion, para que la
   * fila aparezca al toque.
   */
  onPending: (names: string[]) => void;
  /**
   * El server ya respondio: las filas optimistas se van. En el exito va
   * DENTRO de la misma transicion que el `router.refresh()`, asi la fila
   * real y la optimista se reemplazan en el mismo commit (sin parpadeo y
   * sin duplicarse).
   */
  onSettled: () => void;
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
export function AddItemsForm({
  mundialitoId,
  onPending,
  onSettled,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** El refresh de la lista va como transicion: no bloquea ni parpadea. */
  const [refreshing, startTransition] = useTransition();
  /**
   * Mientras viaja el POST o entra la lista nueva, el input queda de solo
   * lectura (conserva el foco, asi el teclado del celular no se cierra):
   * el nombre que se esta agregando sigue a la vista y no se edita a
   * medias.
   */
  const busy = pending || refreshing;

  async function submit(names: string[], clearInput: boolean) {
    /**
     * El input NO se limpia aca: el nombre se queda a la vista mientras
     * viaja el POST y se borra recien cuando entra la lista nueva, en la
     * misma transicion (abajo). Limpiarlo antes hacia que el nombre
     * desapareciera con el boton todavia en "Agregando…".
     */
    const submitted = text;
    setPending(true);
    setError(null);
    setNote(null);

    /**
     * La fila optimista aparece ahora, no cuando vuelve el POST: el
     * usuario ve en la lista lo mismo que acaba de escribir. El server
     * sigue siendo la verdad — esto se deshace entero si falla.
     */
    onPending(names);

    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mundialitoId, names }),
    });

    const data = await response.json().catch(() => null);
    setPending(false);

    // El input nunca se limpio, asi que no hay nada que devolver si algo
    // falla: el texto sigue ahi esperando otro intento. La fila optimista
    // si se va: no se guardo nada.
    if (!response.ok) {
      onSettled();
      setError(data?.error ?? "No se pudieron agregar los ítems.");
      return;
    }

    const inserted =
      typeof data?.inserted === "number" ? data.inserted : names.length;

    if (inserted === 0) {
      onSettled();
      setError("No se pudo agregar el ítem.");
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

    /**
     * La limpieza del input va en la MISMA transicion que la lista
     * nueva: el nombre desaparece exactamente cuando el item aparece,
     * no antes. Si el usuario ya arranco a escribir el siguiente, su
     * texto no se pisa.
     */
    startTransition(() => {
      if (clearInput) {
        setText((current) => (current === submitted ? "" : current));
      }

      // La fila optimista y la real se reemplazan en el mismo commit: la
      // optimista se va cuando la lista del server ya esta aca.
      onSettled();
      router.refresh();
    });
  }

  /**
   * `clearInput` distingue las dos entradas: lo que el usuario tipeo
   * (Enter o "Agregar") se consume y el input se vacia al confirmar; un
   * pegado masivo no pasa por el input, asi que no lo toca.
   */
  function addFromText(raw: string, clearInput: boolean) {
    // Con un alta ya en vuelo, no se encola otro: el servidor no tiene
    // unique y un segundo Enter se llevaria un item duplicado.
    if (busy) return;

    const names = uniqueItems(splitItemInput(raw));

    if (names.length === 0) return;

    // El tope espeja el `slice(0, 100)` de /api/items: si se pasa, no se
    // manda nada en vez de que el server corte la lista en silencio.
    if (names.length > MAX_ITEMS_PER_SUBMIT) {
      setError(`Máximo ${MAX_ITEMS_PER_SUBMIT} ítems a la vez.`);
      return;
    }

    void submit(names, clearInput);
  }

  function close() {
    setOpen(false);
    setText("");
    setError(null);
    setNote(null);
  }

  /**
   * Atajo de dev (utileria, no feature): Ctrl+click (o Cmd+click en Mac)
   * en "Agregar ítem" mete 8 items genericos de una sola vez, sin abrir
   * el input. Sirve para armar un torneo de prueba rapido sin cargar
   * item por item.
   *
   * Reusa `addFromText`, que ya sabe mandar un lote en un solo POST: el
   * atajo no necesita endpoint nuevo ni logica de red propia. `clearInput`
   * es false porque nada de esto viene del input.
   *
   * El modificador se lee del evento de click, asi que funciona igual en
   * teclado y en trackpad; en el celular no hay Ctrl, y esta bien: es una
   * herramienta de escritorio.
   */
  function onAddTriggerClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (!event.ctrlKey && !event.metaKey) {
      // Apertura normal: se limpia el aviso del atajo anterior para no
      // arrastrarlo al input ("Se agregaron 8 ítems" colgado de una
      // corrida previa seria confuso).
      setNote(null);
      setError(null);
      setOpen(true);
      return;
    }

    event.preventDefault();
    addFromText(devFillerItemNames().join("\n"), false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      // Enter suma de a uno (teclado fisico); nunca manda un form.
      event.preventDefault();
      addFromText(text, true);
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

    // Varias lineas: es una lista, no un nombre. Un solo POST, y el
    // input queda como estaba (nunca contuvo ese texto).
    event.preventDefault();
    addFromText(pasted, false);
  }

  if (!open) {
    return (
      <li>
        <button
          type="button"
          onClick={onAddTriggerClick}
          // El atajo se documenta en el title: es utileria de escritorio
          // que nadie descubre solo. Ctrl/Cmd + click = 8 items de una.
          title="Atajo de dev: Ctrl (o ⌘) + click agrega 8 ítems de prueba"
          className="flex w-full items-center gap-2 py-2.5 text-left text-[0.9375rem] font-medium text-brand hover:bg-sunken"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            +
          </span>
          Agregar ítem
        </button>

        {/* El atajo no abre el input, asi que el aviso tiene que vivir
            tambien en el estado cerrado: sin esto, el Ctrl+click agregaba
            8 items sin ninguna señal de que algo habia pasado. */}
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
          // Solo lectura mientras el alta esta en vuelo: el nombre sigue a
          // la vista, el foco y el teclado no se van, y no se edita a
          // medias lo que ya se mando a guardar.
          readOnly={busy}
          autoFocus
        />

        <button
          type="button"
          // Evita que el toque le saque el foco al input: en el celular
          // eso bajaria el teclado entre item e item.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => addFromText(text, true)}
          disabled={busy || text.trim() === ""}
          className="btn btn-primary btn-sm"
        >
          {busy ? "Agregando…" : "Agregar"}
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
