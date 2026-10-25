"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MODE_DESCRIPTION } from "@/lib/ui/labels";

type Props = {
  mundialitoId: string;
  initialName: string;
  initialDescription: string | null;
  /** Null = fuera de DRAFT: el modo ya no se puede cambiar. */
  initialMode: "RANKING" | "CRUCES" | null;
};

/**
 * Edicion del nombre, la descripcion y (solo en DRAFT) el modo.
 * El form vive plegado detras de un boton para no cargar el panel del
 * owner cuando no se esta editando.
 */
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
    <section className="play-card card-pad mt-6" aria-label="Detalles del torneo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="h3">Detalles del torneo</h2>
          <p className="hint mt-1">Nombre, descripción y modo de competición.</p>
        </div>

        <button
          type="button"
          onClick={() => {
            setExpanded(!expanded);
            setError(null);
            setSuccess(false);
          }}
          className="btn btn-secondary btn-sm"
        >
          {expanded ? "Cancelar edición" : "Editar Mundialito"}
        </button>
      </div>

      {expanded ? (
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div className="field">
            <label className="label" htmlFor="edit-name">
              Nombre
            </label>
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              autoFocus
              className="input"
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="edit-description">
              Descripción{" "}
              <span className="font-normal text-subtle">(opcional)</span>
            </label>
            <textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="textarea"
            />
          </div>

          {initialMode !== null ? (
            <fieldset className="space-y-3 border-0 p-0">
              <legend className="label mb-1">Modo de competición</legend>

              <label className="choice items-start justify-start text-left">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "RANKING"}
                  onChange={() => setMode("RANKING")}
                  className="sr-only"
                />
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">Ranking del 1 al 10</span>
                  <span className="hint">{MODE_DESCRIPTION.RANKING}</span>
                </span>
              </label>

              <label className="choice items-start justify-start text-left">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "CRUCES"}
                  onChange={() => setMode("CRUCES")}
                  className="sr-only"
                />
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">Eliminación directa</span>
                  <span className="hint">{MODE_DESCRIPTION.CRUCES}</span>
                  <span className="hint">Requiere 4, 8, 16 o 32 ítems.</span>
                </span>
              </label>
            </fieldset>
          ) : null}

          {error ? (
            <p className="alert alert-danger" role="alert">
              {error}
            </p>
          ) : null}

          {success ? (
            <p className="alert alert-success" role="status">
              ¡Listo! Guardamos los cambios.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary btn-block"
          >
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
