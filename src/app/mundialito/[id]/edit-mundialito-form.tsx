"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  mundialitoId: string;
  initialName: string;
  initialDescription: string | null;
};

export function EditMundialitoForm({
  mundialitoId,
  initialName,
  initialDescription,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(
    initialDescription === null ? "" : initialDescription,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/mundialitos/${mundialitoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "No se pudo actualizar el Mundialito.");
        setPending(false);
        return;
      }

      setPending(false);
      setSuccess(true);
      setExpanded(false);
      router.refresh();
    } catch {
      setError("No se pudo actualizar el Mundialito.");
      setPending(false);
    }
  }

  return (
    <section style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
      <button
        type="button"
        onClick={() => {
          setExpanded(!expanded);
          setError(null);
          setSuccess(false);
        }}
        style={{
          ...buttonSecondaryStyle,
          padding: "0.5rem 0.75rem",
          fontSize: "0.95rem",
        }}
      >
        {expanded ? "Cancelar edición" : "Editar Mundialito"}
      </button>

      {expanded && (
        <form
          onSubmit={onSubmit}
          style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}
        >
          <label style={labelStyle}>
            Nombre
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              autoFocus
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Descripción <span style={{ color: "#999" }}>(opcional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={inputStyle}
            />
          </label>

          {error && <p style={errorStyle}>{error}</p>}
          {success && <p style={successStyle}>¡Guardado!</p>}

          <button type="submit" disabled={pending} style={buttonStyle}>
            {pending ? "Guardando..." : "Guardar"}
          </button>
        </form>
      )}
    </section>
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

const buttonSecondaryStyle: React.CSSProperties = {
  background: "white",
  color: "black",
  border: "1px solid #ccc",
  borderRadius: "0.5rem",
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  color: "crimson",
  fontSize: "0.9rem",
  margin: 0,
};

const successStyle: React.CSSProperties = {
  color: "#0f766e",
  fontSize: "0.9rem",
  margin: 0,
};
