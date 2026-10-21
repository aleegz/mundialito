"use client";

import { useState } from "react";
import { copyTextToClipboard } from "@/lib/ui/clipboard";

type Props = {
  mundialitoId: string;
};

/**
 * CTA de cierre del owner en CRUCES FINISHED (#12).
 *
 * El CTA anterior —"Ver los resultados"— llevaba a /vote/[id], que
 * muestra exactamente el mismo bracket que ya esta pintado abajo en el
 * panel: un viaje de ida para volver a ver lo mismo. Terminada la copa,
 * lo unico que le queda hacer al owner es pasarle el link a alguien, asi
 * que el CTA pasa a ser copiar el enlace.
 *
 * Ocupa el MISMO lugar en la pagina que el CTA anterior: no es una
 * tarjeta nueva abajo, es la misma jerarquia con otro proposito.
 *
 * Si el portapapeles no esta disponible (contexto no seguro, permiso
 * denegado), el error muestra el enlace en un input para copiarlo a
 * mano: la tarjeta es la unica via al link en este estado, no puede
 * dejar al owner sin nada.
 */
export function CopyShareCta({ mundialitoId }: Props) {
  const [copied, setCopied] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  async function handleCopy() {
    // `window` solo existe en el cliente y esto corre desde un click:
    // no hay riesgo de desajuste de hidratacion.
    const url = `${window.location.origin}/vote/${mundialitoId}`;
    const ok = await copyTextToClipboard(url);

    if (!ok) {
      setCopied(false);
      setFailedUrl(url);
      return;
    }

    setFailedUrl(null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="card card-pad mt-6" aria-label="Compartir el resultado">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          <span className="block font-semibold text-fg">
            Copiar link para compartir
          </span>
          <span className="hint">
            Cualquiera con el enlace ve cómo quedó la copa.
          </span>
        </span>

        <button type="button" onClick={handleCopy} className="btn btn-primary">
          {copied ? "¡Copiado!" : "Copiar link"}
        </button>
      </div>

      {failedUrl ? (
        <div className="mt-3 space-y-2">
          <p className="alert alert-danger" role="alert">
            No se pudo copiar el enlace. Copialo de acá.
          </p>
          <input
            readOnly
            value={failedUrl}
            aria-label="Enlace para compartir"
            className="input font-mono text-sm"
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      ) : null}

      <span className="sr-only" role="status">
        {copied ? "Enlace copiado al portapapeles" : ""}
      </span>
    </section>
  );
}
