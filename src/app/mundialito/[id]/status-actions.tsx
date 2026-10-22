"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  mundialitoId: string;
  status: string;
};

type Target = "ACTIVE" | "FINISHED";

const LABELS: Record<Target, string> = {
  ACTIVE: "Iniciar torneo",
  FINISHED: "Finalizar votación",
};

/**
 * "Iniciar torneo" y no "Iniciar votación": en RANKING ese unico click
 * hace DOS cosas — cierra la inscripcion (desde ahi no se suma nadie
 * mas ni funciona el link) y abre la votacion. Nombrar solo la segunda
 * le escondia al owner la mitad que le importa cuando quiere invitar
 * gente (reporte del 21/10).
 */
const HINT: Record<Target, string> = {
  ACTIVE:
    "Cierra la inscripción y abre la votación. Después no se podrá sumar nadie más ni editar la estructura.",
  FINISHED: "Se cierran los votos y se publican los resultados.",
};

const CONSEQUENCE: Record<Target, string> = {
  ACTIVE:
    "¿Iniciar el torneo? Se cierra la inscripción y no vas a poder volver a editar la estructura.",
  FINISHED: "¿Finalizar la votación? Se van a cerrar los votos.",
};

/**
 * Transiciones DRAFT -> ACTIVE -> FINISHED, solo owner (RLS lo
 * refuerza en el servidor). Confirmacion en dos pasos porque no
 * hay vuelta atras: un click accidental cerraria la votacion.
 *
 * El card es del componente, no de la pagina: cuando no hay
 * transicion posible (FINISHED) devuelve null, y envolverlo desde
 * afuera dejaba un card vacio en el dashboard.
 */
export function StatusActions({ mundialitoId, status }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next: Target | null =
    status === "DRAFT" ? "ACTIVE" : status === "ACTIVE" ? "FINISHED" : null;

  async function onConfirm() {
    if (!target) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/mundialitos/${mundialitoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "No se pudo cambiar el estado.");
        setPending(false);
        setTarget(null);
        return;
      }

      setPending(false);
      setTarget(null);
      router.refresh();
    } catch {
      setError("No se pudo cambiar el estado.");
      setPending(false);
      setTarget(null);
    }
  }

  if (!next) {
    return null;
  }

  return (
    <section className="card card-pad mt-6" aria-label="Acciones del torneo">
      <h3 className="h3">Estado del torneo</h3>

      {target === null ? (
        <>
          <p className="hint mt-1">{HINT[next]}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setTarget(next);
              }}
              className="btn btn-primary"
            >
              {LABELS[next]}
            </button>

            {error ? (
              <span className="text-sm font-medium text-danger" role="alert">
                {error}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="alert alert-warning" role="status">
            {CONSEQUENCE[target]}
          </p>

          {error ? (
            <p className="alert alert-danger" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="btn btn-primary"
            >
              {pending ? "Un momento…" : "Sí, confirmar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setTarget(null);
              }}
              disabled={pending}
              className="btn btn-ghost"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
