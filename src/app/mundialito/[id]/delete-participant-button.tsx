"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  participantId: string;
  displayName: string;
};

export function DeleteParticipantButton({
  participantId,
  displayName,
}: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setPending(true);
    setError(null);

    const response = await fetch(`/api/participants/${participantId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "No se pudo eliminar.");
      setPending(false);
      setConfirming(false);
      return;
    }

    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        style={buttonStyle}
        aria-label={`Eliminar a ${displayName}`}
      >
        Eliminar
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
      {error && <small style={{ color: "crimson" }}>{error}</small>}
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        style={{ ...buttonStyle, background: "crimson" }}
      >
        {pending ? "..." : "Confirmar"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
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