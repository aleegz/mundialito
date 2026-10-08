"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  mundialitoId: string;
  initialName: string;
  initialDescription: string | null;
  /** Null = fuera de DRAFT: el modo ya no se puede cambiar. */
  initialMode: "RANKING" | "CRUCES" | null;
};

export function EditMundialitoForm({
  mundialitoId,
  initialName,
  initialDescription,
  initialMode,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(
    initialDescription === null ? "" : initialDescription,
  );
  const [mode, setMode] = useState<"RANKING" | "CRUCES">(
    initialMode === null ? "RANKING" : initialMode,
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

    const body: {
      name: string;
      description: string | null;
      mode?: "RANKING" | "CRUCES";
    } = {
      name,
      description,
    };
    // Solo se envia mode si el caller lo habilito (DRAFT). Fuera de
    // DRAFT el PUT no lo acepta, asi que no debe viajar.
    if (initialMode !== null) {
      body.mode = mode;
    }

    try {
      const response = await fetch(`/api/mundialitos/${mundialitoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

          {initialMode !== null && (
            <fieldset style={fieldsetStyle}>
              <legend style={legendStyle}>Modo de competición</legend>

              <label style={radioStyle}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "RANKING"}
                  onChange={() => setMode("RANKING")}
                />
                <span>
                  <strong>Ranking 1–10</strong>
                  <small style={smallStyle}>
                    Cada participante puntúa todos los ítems; gana el mejor promedio.
                  </small>
                </span>
              </label>

              <label style={radioStyle}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "CRUCES"}
                  onChange={() => setMode("CRUCES")}
                />
                <span>
                  <strong>Eliminación directa</strong>
                  <small style={smallStyle}>
                    Los ítems se cruzan de a dos y el ganador avanza. Necesita 4, 8, 16 o 32 ítems.
                  </small>
                </span>
              </label>
            </fieldset>
          )}

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

const fieldsetStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: "0.5rem",
  padding: "0.75rem 1rem",
  display: "grid",
  gap: "0.75rem",
};

const legendStyle: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: "500",
};

const radioStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  alignItems: "flex-start",
  fontSize: "0.95rem",
  cursor: "pointer",
};

const smallStyle: React.CSSProperties = {
  display: "block",
  color: "#666",
  fontSize: "0.8rem",
  marginTop: "0.15rem",
};
