"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  mundialitoId: string;
  isDraft: boolean;
};

/**
 * Bulk input: uno por linea. Mismo patron que participantes.
 * Client Component porque necesita loading state, error en el lugar
 * y limpiar el textarea sin navegar.
 */
export function AddItemsForm({ mundialitoId, isDraft }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const raw = (formData.get("names") as string | null) ?? "";

    const names = [
      ...new Set(
        raw
          .split("\n")
          .map((n) => n.trim())
          .filter(Boolean),
      ),
    ];

    if (names.length === 0) {
      setError("Escribí al menos un nombre.");
      setPending(false);
      return;
    }

    if (names.length > 100) {
      setError("Máximo 100 items a la vez.");
      setPending(false);
      return;
    }

    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mundialitoId, names }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "No se pudieron agregar los items.");
      setPending(false);
      return;
    }

    if (formRef.current) formRef.current.value = "";
    setPending(false);
    router.refresh();
  }

  if (!isDraft) {
    return (
      <p style={{ color: "#888" }}>
        La lista de items no se puede modificar en este estado.
      </p>
    );
  }

  return (
    <form action={onSubmit} style={{ display: "grid", gap: "0.75rem" }}>
      <label style={labelStyle}>
        Items{" "}
        <span style={{ color: "#999", fontWeight: "400" }}>(uno por línea)</span>
        <textarea
          ref={formRef}
          name="names"
          rows={5}
          placeholder={"Havanna\nCachafaz\nJorgito"}
          style={inputStyle}
        />
      </label>

      {error && <p style={errorStyle}>{error}</p>}

      <button type="submit" disabled={pending} style={buttonStyle}>
        {pending ? "Agregando..." : "Agregar items"}
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem",
  border: "1px solid #ccc",
  borderRadius: "0.5rem",
  fontSize: "1rem",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  fontSize: "0.9rem",
  fontWeight: "500",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.75rem",
  background: "black",
  color: "white",
  border: "none",
  borderRadius: "0.5rem",
  fontSize: "1rem",
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  color: "crimson",
  fontSize: "0.9rem",
};