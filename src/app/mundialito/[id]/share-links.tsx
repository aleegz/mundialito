"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  mundialitoId: string;
};

export function ShareLinks({ mundialitoId }: Props) {
  const [url] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? `${window.location.origin}/vote/${mundialitoId}`
      : null,
  );
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    if (url === null) return;

    void (async () => {
      try {
        const dataUrl = await QRCode.toDataURL(url, {
          margin: 1,
          width: 240,
        });
        if (typeof dataUrl === "string") {
          setQrDataUrl(dataUrl);
          setQrError(null);
        } else {
          setQrError("No se pudo generar el código QR.");
        }
      } catch {
        setQrError("No se pudo generar el código QR.");
      }
    })();
  }, [url]);

  async function handleCopy() {
    if (!url) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Fallback for non-secure contexts
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setQrError("No se pudo copiar el enlace.");
    }
  }

  if (!url) {
    return null;
  }

  return (
    <section style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>
        Compartir para votar
      </h2>
      <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1rem" }}>
        Cualquier persona con este enlace puede votar mientras el Mundialito
        esté ACTIVE.
      </p>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            ...buttonStyle,
            background: "white",
            color: "black",
            border: "1px solid #ccc",
          }}
        >
          {copied ? "¡Copiado!" : "Copiar enlace"}
        </button>

        {qrDataUrl && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.5rem",
              marginTop: "0.5rem",
            }}
          >
            <img
              src={qrDataUrl}
              alt="Código QR para votar"
              style={{
                width: 240,
                height: 240,
                border: "1px solid #eee",
                borderRadius: "0.5rem",
              }}
            />
            <small style={{ color: "#666", fontSize: "0.8rem" }}>
              Escaneá este código QR para votar
            </small>
          </div>
        )}

        {qrError && <p style={errorStyle}>{qrError}</p>}
      </div>
    </section>
  );
}

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
  margin: 0,
};
