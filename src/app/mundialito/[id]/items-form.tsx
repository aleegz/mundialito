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
      <p className="hint">
        La lista de ítems no se puede modificar en este estado.
      </p>
    );
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <div className="field">
        <label className="label" htmlFor="items-names">
          Ítems <span className="font-normal text-subtle">(uno por línea)</span>
        </label>
        <textarea
          id="items-names"
          ref={formRef}
          name="names"
          rows={5}
          placeholder={"Havanna\nCachafaz\nJorgito"}
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
        {pending ? "Agregando…" : "Agregar ítems"}
      </button>
    </form>
  );
}
