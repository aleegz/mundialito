"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  mundialitoId: string;
  isDraft: boolean;
};

/**
 * Client Component porque necesita:
 *  - input de texto multiple (una persona por linea)
 *  - estado local para limpiar el form y mostrar feedback
 *
 * Las operaciones de escritura van al servidor: nunca se habla con
 * Supabase desde el browser para mutar datos.
 */
export function AddParticipantsForm({ mundialitoId, isDraft }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const raw = (formData.get("names") as string | null) ?? "";

    // Split por saltos de linea y trimming: "Juan\nPedro \n\n Ana"
    // produce ["Juan", "Pedro", "Ana"]. Set para dedupe manteniendo orden.
    const names = [...new Set(raw.split("\n").map((n) => n.trim()).filter(Boolean))];

    if (names.length === 0) {
      setError("Escribí al menos un nombre.");
      setPending(false);
      return;
    }

    if (names.length > 50) {
      setError("Máximo 50 participantes a la vez.");
      setPending(false);
      return;
    }

    const response = await fetch("/api/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mundialitoId, names }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "No se pudieron agregar los participantes.");
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
        La lista de participantes no se puede modificar en este estado.
      </p>
    );
  }

  return (
    <form action={onSubmit} style={{ display: "grid", gap: "0.75rem" }}>
      <label style={labelStyle}>
        Participantes{" "}
        <span style={{ color: "#999", fontWeight: "400" }}>
          (uno por línea)
        </span>
        <textarea
          ref={formRef}
          name="names"
          rows={5}
          placeholder={"Juan\nPedro\nAna\nMartín"}
          style={inputStyle}
        />
      </label>

      {error && <p style={errorStyle}>{error}</p>}

      <button type="submit" disabled={pending} style={buttonStyle}>
        {pending ? "Agregando..." : "Agregar participantes"}
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