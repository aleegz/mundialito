"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  participantId: string;
  displayName: string;
  /** estado actual del participante (JOINED | EXCLUDED). */
  currentStatus: string;
};

/**
 * Excluir / re-incluir un participante durante el torneo CRUCES.
 * Solo el owner (RLS lo refuerza en el server). Excluir a alguien
 * que nunca vota permite cerrar el cruce (el gate de finalizacion
 * cuenta solo activos); re-incluir lo devuelve al juego.
 */
export function ToggleParticipantStatusButton({
  participantId,
  displayName,
  currentStatus,
}: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const excluding = currentStatus === "JOINED";
  const actionLabel = excluding ? "Excluir" : "Re-incluir";

  async function onToggle() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/participants/${participantId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: excluding ? "EXCLUDED" : "JOINED" }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data?.error ?? "No se pudo actualizar.");
        setPending(false);
        return;
      }

      setConfirming(false);
      setPending(false);
      router.refresh();
    } catch {
      setError("No se pudo actualizar.");
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        style={buttonStyle}
        aria-label={`${actionLabel} a ${displayName}`}
      >
        {actionLabel}
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
      {error && <small style={{ color: "crimson" }}>{error}</small>}
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        style={{
          ...buttonStyle,
          background: excluding ? "crimson" : "#0f766e",
          color: "white",
        }}
      >
        {pending ? "..." : "Confirmar"}
      </button>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(false);
        }}
        disabled={pending}
        style={buttonStyle}
      >
        Cancelar
      </button>
    </span>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "0.35rem 0.75rem",
  background: "white",
  color: "black",
  border: "1px solid #ccc",
  borderRadius: "0.35rem",
  fontSize: "0.85rem",
  cursor: "pointer",
};