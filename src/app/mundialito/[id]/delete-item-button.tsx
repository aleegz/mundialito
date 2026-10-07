"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  itemId: string;
  name: string;
};

export function DeleteItemButton({ itemId, name }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setPending(true);
    setError(null);

    const response = await fetch(`/api/items/${itemId}`, { method: "DELETE" });

    // 404 = ya no existe (o no hay permiso). Se trata como borrado
    // efectivo: cerrar la confirmación y refrescar la lista.
    if (response.status === 404) {
      setConfirming(false);
      setPending(false);
      router.refresh();
      return;
    }

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
        aria-label={`Eliminar ${name}`}
      >
        Eliminar
      </button>
    );
  }

  return (
    <span
      style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}
    >
      {error && <small style={{ color: "crimson" }}>{error}</small>}
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        style={{ ...buttonStyle, background: "crimson", color: "white" }}
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