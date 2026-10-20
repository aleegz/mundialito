"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isValidBracketSize } from "@/lib/calculations/bracket";
import {
  actionLabelFor,
  confirmTextFor,
  type CrucesAction,
} from "@/lib/ui/cruces-action-copy";

type Props = {
  mundialitoId: string;
  status: string;
  itemsCount: number;
  participantsCount: number;
  /** Cuántos de los que pueden votar ya dejaron voto en el cruce OPEN. */
  votedCount: number;
  /** Cuántos pueden votar ahora (participants.status = 'JOINED'). */
  eligibleCount: number;
  /** id del cruce OPEN (si existe): el owner debe finalizarlo. */
  openMatchId: string | null;
  /** true cuando quedan cruces PENDING con ambos slots (se puede avanzar). */
  hasPendingNext: boolean;
};

/**
 * Panel del owner para el modo CRUCES. Reemplaza a StatusActions
 * (transiciones DRAFT->ACTIVE->FINISHED) cuando mundialito.mode ===
 * 'CRUCES' (ver page.tsx: StatusActions queda para RANKING).
 *
 * Secuencia: DRAFT -> PARTICIPANTS_OPEN -> PARTICIPANTS_LOCKED ->
 * DRAWN (sorteo) -> VOTING (inicio) -> ... cruces -> FINISHED.
 * La validacion pesada vive en el server (PATCH con per-mode
 * transitions; /draw, /start, /finalize, /next). Aca solo se
 * deshabilitan los botones cuando la condicion de UI es obvia
 * (cantidad de items / participantes) para no depender del 409.
 *
 * Presentacion: la primera accion de la lista es la que el owner
 * necesita hacer ahora y va como boton primario; el resto (ej.
 * "Re-sortear") queda como secundario.
 *
 * El card es del componente, no de la pagina: cuando no hay nada que
 * ofrecer devuelve null, y un wrapper externo dejaba un card vacio.
 */
export function CrucesActions({
  mundialitoId,
  status,
  itemsCount,
  participantsCount,
  votedCount,
  eligibleCount,
  openMatchId,
  hasPendingNext,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<CrucesAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (
    status !== "DRAFT" &&
    status !== "PARTICIPANTS_OPEN" &&
    status !== "PARTICIPANTS_LOCKED" &&
    status !== "DRAWN" &&
    status !== "VOTING"
  ) {
    return null;
  }

  const validSize = isValidBracketSize(itemsCount);

  // DRAFT necesita el minimo de items para abrir; PARTICIPANTS_OPEN
  // necesita >= 1 participante para cerrar; el resto depende de flags
  // calculados por la pagina (openMatchId / hasPendingNext).
  if (status === "DRAFT" && !validSize) {
    return (
      <section className="card card-pad mt-6" aria-label="Acciones del torneo">
        <h3 className="h3">Próximo paso</h3>
        <p className="alert alert-warning mt-3">
          Eliminación directa necesita 4, 8, 16 o 32 ítems para poder abrir la
          inscripción.
        </p>
      </section>
    );
  }

  if (status === "PARTICIPANTS_OPEN" && participantsCount < 1) {
    return (
      <section className="card card-pad mt-6" aria-label="Acciones del torneo">
        <h3 className="h3">Próximo paso</h3>
        <p className="alert alert-warning mt-3">
          Necesitás al menos un participante para cerrar la inscripción.
        </p>
      </section>
    );
  }

  const actions: CrucesAction[] = [];
  if (status === "DRAFT") {
    actions.push({ kind: "patch", target: "PARTICIPANTS_OPEN" });
  } else if (status === "PARTICIPANTS_OPEN") {
    actions.push({ kind: "patch", target: "PARTICIPANTS_LOCKED" });
  } else if (status === "PARTICIPANTS_LOCKED") {
    actions.push({ kind: "draw" });
  } else if (status === "DRAWN") {
    // DRAWN ofrece los dos caminos: re-sortear (derecho a segundas)
    // e iniciar la votacion. El server rompe el empate si el orden
    // del owner no encaja con el estado (403/409 claros).
    actions.push({ kind: "start" });
    actions.push({ kind: "draw" });
  } else if (status === "VOTING") {
    if (openMatchId !== null) {
      actions.push({ kind: "finalize" });
    } else if (hasPendingNext) {
      actions.push({ kind: "next" });
    }
  }

  if (actions.length === 0) {
    return null;
  }

  function hintFor(): string {
    if (status === "DRAFT") {
      return "Abrí la inscripción y compartí el link para que se sumen.";
    }
    if (status === "PARTICIPANTS_OPEN") {
      return "Cuando estén todos anotados, cerrá la inscripción.";
    }
    if (status === "PARTICIPANTS_LOCKED") {
      return "Es el momento de sortear los cruces.";
    }
    if (status === "DRAWN") {
      return "Podés iniciar la votación o volver a sortear si no te gustó el orden.";
    }
    if (openMatchId !== null) {
      return `Ya votaron ${votedCount} de ${eligibleCount} ${
        eligibleCount === 1 ? "participante" : "participantes"
      }. Cuando estén todos, cerrá el cruce.`;
    }
    if (hasPendingNext) {
      return "Ya podés abrir el siguiente cruce del bracket.";
    }
    return "Esperando que se resuelvan los cruces en curso.";
  }

  async function run(action: CrucesAction) {
    setPending(true);
    setError(null);

    try {
      let ok = false;

      if (action.kind === "patch") {
        const response = await fetch(`/api/mundialitos/${mundialitoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: action.target }),
        });
        ok = response.ok;
        if (!ok) {
          const data = await response.json().catch(() => null);
          setError(data?.error ?? "No se pudo cambiar el estado.");
        }
      } else if (action.kind === "draw") {
        const response = await fetch(`/api/mundialitos/${mundialitoId}/draw`, {
          method: "POST",
        });
        ok = response.ok;
        if (!ok) {
          const data = await response.json().catch(() => null);
          setError(data?.error ?? "No se pudo sortear.");
        }
      } else if (action.kind === "start") {
        const response = await fetch(`/api/mundialitos/${mundialitoId}/start`, {
          method: "POST",
        });
        ok = response.ok;
        if (!ok) {
          const data = await response.json().catch(() => null);
          setError(data?.error ?? "No se pudo iniciar.");
        }
      } else if (action.kind === "finalize") {
        if (!openMatchId) {
          setError("No hay cruce abierto.");
        } else {
          const response = await fetch(`/api/matches/${openMatchId}/finalize`, {
            method: "POST",
          });
          ok = response.ok;
          if (!ok) {
            const data = await response.json().catch(() => null);
            setError(data?.error ?? "No se pudo finalizar el cruce.");
          }
        }
      } else if (action.kind === "next") {
        const response = await fetch(`/api/mundialitos/${mundialitoId}/next`, {
          method: "POST",
        });
        ok = response.ok;
        if (!ok) {
          const data = await response.json().catch(() => null);
          setError(data?.error ?? "No se pudo abrir el siguiente cruce.");
        }
      }

      setPending(false);
      setConfirm(null);

      if (ok) {
        router.refresh();
      }
    } catch {
      setError("No se pudo completar la acción.");
      setPending(false);
      setConfirm(null);
    }
  }

  if (confirm === null) {
    return (
      <section className="card card-pad mt-6" aria-label="Acciones del torneo">
        <h3 className="h3">Próximo paso</h3>
        <p className="hint mt-1">{hintFor()}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((action, index) => (
            <button
              key={actionLabelFor(action, status)}
              type="button"
              onClick={() => {
                setError(null);
                setConfirm(action);
              }}
              className={`btn ${index === 0 ? "btn-primary" : "btn-secondary"}`}
            >
              {actionLabelFor(action, status)}
            </button>
          ))}
        </div>

        {error ? (
          <p className="alert alert-danger mt-3" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="card card-pad mt-6" aria-label="Acciones del torneo">
      <h3 className="h3">Próximo paso</h3>

      <div className="mt-3 space-y-3">
        {/* La copia vive en lib/ui/cruces-action-copy: nunca vacia. */}
        <p className="alert alert-warning" role="status">
          {confirmTextFor(confirm)}
        </p>

        {error ? (
          <p className="alert alert-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => run(confirm)}
            disabled={pending}
            className="btn btn-primary"
          >
            {pending ? "Un momento…" : "Sí, confirmar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setConfirm(null);
            }}
            disabled={pending}
            className="btn btn-ghost"
          >
            Cancelar
          </button>
        </div>
      </div>
    </section>
  );
}
