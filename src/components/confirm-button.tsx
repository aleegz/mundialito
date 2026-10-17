"use client";

import { useState } from "react";

type Tone = "danger" | "brand";

type Props = {
  /** Texto del boton en reposo ("Eliminar", "Excluir"…). */
  label: string;
  /**
   * Ejecuta la accion. Devuelve `null` si salio bien, o el mensaje de
   * error a mostrar. Con error, la confirmacion NO se cierra: el usuario
   * ve que paso y puede reintentar.
   */
  onConfirm: () => Promise<string | null>;
  /** Accion destructiva (rojo) o constructiva (color de marca). */
  tone?: Tone;
  /** Texto del boton mientras la accion esta en vuelo. */
  pendingLabel?: string;
  /** aria-label del boton en reposo, cuando el texto solo no alcanza. */
  ariaLabel?: string;
};

/**
 * Boton con confirmacion en dos pasos, en linea (sin modales).
 *
 * Reemplaza los tres botones de borrado/exclusion que repetian el mismo
 * estado (reposo → Confirmar/Cancelar + error). Un unico lugar define
 * como se ve y se comporta una accion destructiva: menos codigo y menos
 * formas de que se desincronicen.
 */
export function ConfirmButton({
  label,
  onConfirm,
  tone = "danger",
  pendingLabel = "Guardando…",
  ariaLabel,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDanger = tone === "danger";

  async function handleConfirm() {
    setPending(true);
    setError(null);

    const message = await onConfirm();

    setPending(false);

    if (message) {
      // La confirmacion queda abierta a proposito: el mensaje de error
      // vive adentro de ese bloque y cerrarla lo desmontaria al instante
      // (bug TASKS 27).
      setError(message);
      return;
    }

    setConfirming(false);
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        aria-label={ariaLabel}
        className={`btn btn-ghost btn-sm ${
          isDanger ? "text-danger" : "text-brand"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {error ? (
        <span className="text-xs font-medium text-danger" role="alert">
          {error}
        </span>
      ) : null}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={pending}
        className={`btn btn-sm ${isDanger ? "btn-danger-solid" : "btn-primary"}`}
      >
        {pending ? pendingLabel : "Confirmar"}
      </button>

      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(false);
        }}
        disabled={pending}
        className="btn btn-ghost btn-sm"
      >
        Cancelar
      </button>
    </span>
  );
}
