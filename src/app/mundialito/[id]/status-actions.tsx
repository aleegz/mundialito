"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  mundialitoId: string;
  status: string;
};

type Target = "ACTIVE" | "FINISHED";

const LABELS: Record<Target, string> = {
  ACTIVE: "Iniciar votación",
  FINISHED: "Finalizar votación",
};

/**
 * Transiciones DRAFT -> ACTIVE -> FINISHED, solo owner (RLS lo
 * refuerza en el servidor). Confirmacion en dos pasos porque no
 * hay vuelta atras: un click accidental cerraria la votacion.
 */
export function StatusActions({ mundialitoId, status }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next: Target | null =
    status === "DRAFT" ? "ACTIVE" : status === "ACTIVE" ? "FINISHED" : null;

  if (!next) {
    return null;
  }

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

  if (target === null) {
    return (
      <p style={{ marginTop: "0.5rem" }}>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setTarget(next);
          }}
          style={buttonStyle}
        >
          {LABELS[next]}…
        </button>
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
        {target === "ACTIVE"
          ? "¿Iniciar la votación? No se podrá volver a editar la estructura."
          : "¿Finalizar la votación? Se cerrarán los votos."}
      </small>
      {error && <small style={{ color: "crimson" }}>{error}</small>}
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        style={{ ...buttonStyle, background: "crimson", color: "white" }}
      >
        {pending ? "..." : "Confirmar"}
      </button>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setTarget(null);
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
