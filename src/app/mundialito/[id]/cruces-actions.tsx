"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isValidBracketSize } from "@/lib/calculations/bracket";

type Props = {
  mundialitoId: string;
  status: string;
  itemsCount: number;
  participantsCount: number;
  /** id del cruce OPEN (si existe): el owner debe finalizarlo. */
  openMatchId: string | null;
  /** true cuando quedan cruces PENDING con ambos slots (se puede avanzar). */
  hasPendingNext: boolean;
};

type Action =
  | { kind: "patch"; target: "PARTICIPANTS_OPEN" | "PARTICIPANTS_LOCKED" }
  | { kind: "draw" }
  | { kind: "start" }
  | { kind: "finalize" }
  | { kind: "next" };

const CONFIRM_TEXT: Record<Action["kind"], string> = {
  patch: "",
  draw: "¿Sortear el bracket? Se mezclan los ítems y se arman los cruces.",
  start: "¿Iniciar la votación? Se abre el primer cruce.",
  finalize:
    "¿Finalizar el cruce abierto? Requiere que voten todos los participantes activos.",
  next: "¿Abrir el siguiente cruce?",
};

const ACTION_LABEL: Record<Action["kind"], string> = {
  patch: "",
  draw: "Sortear",
  start: "Iniciar votación",
  finalize: "Finalizar cruce abierto",
  next: "Abrir siguiente cruce",
};

const BUTTON: React.CSSProperties = {
  padding: "0.35rem 0.75rem",
  background: "white",
  color: "black",
  border: "1px solid #ccc",
  borderRadius: "0.35rem",
  fontSize: "0.85rem",
  cursor: "pointer",
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
 */
export function CrucesActions({
  mundialitoId,
  status,
  itemsCount,
  participantsCount,
  openMatchId,
  hasPendingNext,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<Action | null>(null);
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
      <p style={{ marginTop: "0.5rem", color: "#888", fontSize: "0.9rem" }}>
        Eliminación directa necesita 4, 8, 16 o 32 ítems para poder abrir
        la inscripción.
      </p>
    );
  }

  if (status === "PARTICIPANTS_OPEN" && participantsCount < 1) {
    return (
      <p style={{ marginTop: "0.5rem", color: "#888", fontSize: "0.9rem" }}>
        Necesitás al menos un participante para cerrar la inscripción.
      </p>
    );
  }

  const actions: Action[] = [];
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

  function labelFor(action: Action): string {
    if (action.kind === "patch") {
      return action.target === "PARTICIPANTS_OPEN"
        ? "Abrir inscripción"
        : "Cerrar inscripción";
    }
    if (action.kind === "draw" && status === "DRAWN") {
      return "Re-sortear";
    }
    return ACTION_LABEL[action.kind];
  }

  async function run(action: Action) {
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
      <p style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {actions.map((action) => (
          <button
            key={labelFor(action)}
            type="button"
            onClick={() => {
              setError(null);
              setConfirm(action);
            }}
            style={BUTTON}
          >
            {labelFor(action)}…
          </button>
        ))}
        {error && <small style={{ color: "crimson" }}> {error}</small>}
      </p>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        gap: "0.5rem",
        alignItems: "center",
        flexWrap: "wrap",
        marginTop: "0.5rem",
      }}
    >
      <small style={{ color: "#666" }}>
        {CONFIRM_TEXT[confirm.kind]}
        {confirm.kind === "patch" &&
          confirm.target === "PARTICIPANTS_OPEN" &&
          " Después no se podrán editar los ítems."}
      </small>
      {error && <small style={{ color: "crimson" }}>{error}</small>}
      <button
        type="button"
        onClick={() => run(confirm)}
        disabled={pending}
        style={{ ...BUTTON, background: "crimson", color: "white" }}
      >
        {pending ? "..." : "Confirmar"}
      </button>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirm(null);
        }}
        disabled={pending}
        style={BUTTON}
      >
        Cancelar
      </button>
    </span>
  );
}