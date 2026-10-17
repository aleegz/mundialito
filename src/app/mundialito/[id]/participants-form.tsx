"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  mundialitoId: string;
  status: string;
  /** modo del mundialito (RANKING | CRUCES): cambia el copy del form. */
  mode: string;
};

/**
 * Client Component porque necesita:
 *  - input de texto multiple (una persona por linea)
 *  - estado local para limpiar el form y mostrar feedback
 *
 * Las operaciones de escritura van al servidor: nunca se habla con
 * Supabase desde el browser para mutar datos.
 *
 * Estados:
 *  - DRAFT: el owner carga el roster masivo (POST /api/participants).
 *  - RANKING ACTIVE: quien entra al link se registra con su nombre.
 *  - CRUCES PARTICIPANTS_OPEN: cada uno se suma desde el link; el
 *    owner solo administra exclusiones durante el torneo.
 *  - Resto: lista congelada.
 */
export function AddParticipantsForm({ mundialitoId, status, mode }: Props) {
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

  if (status === "ACTIVE") {
    // La lista ya no se precarga: se arma sola mientras vota la gente.
    return (
      <p className="hint">
        No hace falta cargar la lista: quien entra al link de votación se
        registra con su nombre al votar.
      </p>
    );
  }

  if (status !== "DRAFT") {
    // CRUCES: en PARTICIPANTS_OPEN cada uno se suma desde el link
    // (el owner no carga nombres, solo excluye durante el torneo).
    if (mode === "CRUCES" && status === "PARTICIPANTS_OPEN") {
      return (
        <p className="hint">
          Los participantes se suman solos desde el link de inscripción.
        </p>
      );
    }

    return (
      <p className="hint">
        La lista de participantes no se puede modificar en este estado.
      </p>
    );
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <div className="field">
        <label className="label" htmlFor="participants-names">
          Participantes{" "}
          <span className="font-normal text-subtle">(uno por línea)</span>
        </label>
        <textarea
          id="participants-names"
          ref={formRef}
          name="names"
          rows={5}
          placeholder={"Juan\nPedro\nAna\nMartín"}
          className="textarea"
        />
      </div>

      {error ? (
        <p className="alert alert-danger" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary btn-block"
      >
        {pending ? "Agregando…" : "Agregar participantes"}
      </button>
    </form>
  );
}
