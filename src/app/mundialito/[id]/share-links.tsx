"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { copyTextToClipboard } from "@/lib/ui/clipboard";

type Props = {
  mundialitoId: string;
};

/**
 * Sin subscripcion real: la URL de la pagina no cambia despues de
 * montar. useSyncExternalStore la necesita para saber cuando re-leer
 * el snapshot.
 */
const subscribe = () => () => {};

/**
 * Bloque de "compartir para votar": enlace copiable + QR para el celular.
 *
 * La URL depende de `window`, asi que no se puede leer durante el SSR.
 * useSyncExternalStore resuelve exactamente eso: getServerSnapshot
 * devuelve null en el servidor y en la hidratacion (el markup coincide)
 * y recien despues React pasa al snapshot del cliente. Es la alternativa
 * sin `setState` dentro de un efecto.
 */
export function ShareLinks({ mundialitoId }: Props) {
  const url = useSyncExternalStore(
    subscribe,
    () => `${window.location.origin}/vote/${mundialitoId}`,
    () => null,
  );
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    if (url === null) return;

    let cancelled = false;

    void (async () => {
      try {
        const dataUrl = await QRCode.toDataURL(url, {
          margin: 1,
          width: 240,
        });
        if (cancelled) return;

        if (typeof dataUrl === "string") {
          setQrDataUrl(dataUrl);
          setQrError(null);
        } else {
          setQrError("No se pudo generar el código QR.");
        }
      } catch {
        if (!cancelled) setQrError("No se pudo generar el código QR.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  async function handleCopy() {
    if (!url) return;

    // Mismo helper que el CTA de cierre (#12): el fallback para
    // contextos no seguros (celular por IP local) vive en un solo lugar.
    const ok = await copyTextToClipboard(url);

    if (!ok) {
      setQrError("No se pudo copiar el enlace.");
      return;
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!url) {
    return null;
  }

  return (
    <section className="play-card card-pad mt-6" aria-label="Compartir para votar">
      <h2 className="h3">Compartí el link</h2>
      <p className="hint mt-1">
        Cualquiera con este enlace puede votar. Pasalo por WhatsApp o que
        escaneen el QR.
      </p>

      <div className="mt-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={url}
            aria-label="Enlace para votar"
            className="input flex-1 font-mono text-sm"
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="btn btn-secondary sm:shrink-0"
          >
            {copied ? "¡Copiado!" : "Copiar enlace"}
          </button>
        </div>

        {/* `bg-white` es intencional: el QR necesita fondo claro para
            poder escanearse, incluso en tema oscuro. */}
        {qrDataUrl ? (
          <div className="flex flex-col items-center gap-2 pt-1">
            <div className="rounded-xl border border-line bg-white p-3">
              {/* El QR es un data URL generado en el cliente: next/image no
                  aporta nada (no hay nada que optimizar ni que traer por red). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="Código QR con el enlace para votar"
                width={200}
                height={200}
                className="h-auto w-full max-w-[200px]"
              />
            </div>
            <p className="hint">Escaneá el QR para votar desde el celular</p>
          </div>
        ) : null}

        {qrError ? (
          <p className="alert alert-danger" role="alert">
            {qrError}
          </p>
        ) : null}

        <span className="sr-only" role="status">
          {copied ? "Enlace copiado al portapapeles" : ""}
        </span>
      </div>
    </section>
  );
}
