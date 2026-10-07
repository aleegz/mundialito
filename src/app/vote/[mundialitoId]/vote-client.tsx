"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isUuid } from "@/lib/validation/uuid";

type Mundialito = {
  id: string;
  name: string;
  description: string | null;
  status: string;
};

type Participant = {
  id: string;
  display_name: string;
};

type Item = {
  id: string;
  name: string;
  description: string | null;
};

type Phase =
  | "loading"
  | "notfound"
  | "loaderror"
  | "draft"
  | "finished"
  | "roster"
  | "ballot";

type Scores = Record<string, number>;

const SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Identidad del votante (Opcion A): participantId en localStorage,
 * con la clave separada por mundialito para no mezclar votantes
 * del mismo navegador en competiciones distintas.
 */
function storageKey(mundialitoId: string): string {
  return `mundialito-vote-participant:${mundialitoId}`;
}

async function fetchExistingVotes(
  mundialitoId: string,
  participantId: string,
): Promise<Scores> {
  try {
    const response = await fetch(
      `/api/votes?mundialitoId=${mundialitoId}&participantId=${participantId}`,
    );

    if (!response.ok) return {};

    const data = (await response.json()) as {
      votes?: { itemId: string; score: number }[];
    };

    const existing: Scores = {};
    for (const vote of data.votes ?? []) {
      existing[vote.itemId] = vote.score;
    }
    return existing;
  } catch {
    return {};
  }
}

export function VoteClient({ mundialitoId }: { mundialitoId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [mundialito, setMundialito] = useState<Mundialito | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scores, setScores] = useState<Scores>({});
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // UUID malformado = 404 sin llegar a Postgres (evita el
      // error crudo "invalid input syntax for type uuid").
      if (!isUuid(mundialitoId)) {
        setPhase("notfound");
        return;
      }

      const supabase = createClient();

      const { data, error: mundialitoError } = await supabase
        .from("mundialitos")
        .select("id, name, description, status")
        .eq("id", mundialitoId)
        .maybeSingle();

      if (cancelled) return;

      if (mundialitoError || !data) {
        // Sin distincion entre "no existe" y "DRAFT para anonimo":
        // RLS esconde el DRAFT y su existencia no se expone.
        setPhase("notfound");
        return;
      }

      if (data.status === "DRAFT") {
        setMundialito(data);
        setPhase("draft");
        return;
      }

      if (data.status === "FINISHED") {
        setMundialito(data);
        setPhase("finished");
        return;
      }

      const [participantsResult, itemsResult] = await Promise.all([
        supabase
          .from("participants")
          .select("id, display_name")
          .eq("mundialito_id", mundialitoId)
          .order("display_name", { ascending: true }),
        supabase
          .from("items")
          .select("id, name, description")
          .eq("mundialito_id", mundialitoId)
          .order("created_at", { ascending: true }),
      ]);

      if (cancelled) return;

      if (participantsResult.error || itemsResult.error) {
        setPhase("loaderror");
        return;
      }

      const roster = participantsResult.data ?? [];
      const stored = window.localStorage.getItem(storageKey(mundialitoId));
      const restored =
        stored && roster.some((p) => p.id === stored) ? stored : null;

      if (stored && !restored) {
        window.localStorage.removeItem(storageKey(mundialitoId));
      }

      setMundialito(data);
      setParticipants(roster);
      setItems(itemsResult.data ?? []);

      if (restored) {
        setSelectedId(restored);
        const existing = await fetchExistingVotes(mundialitoId, restored);
        if (cancelled) return;
        setScores(existing);
        setPhase("ballot");
      } else {
        setPhase("roster");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [mundialitoId]);

  function onSelectParticipant(participant: Participant) {
    window.localStorage.setItem(storageKey(mundialitoId), participant.id);
    setSelectedId(participant.id);
    setScores({});
    setSaved(false);
    setError(null);
    setPhase("ballot");
    void fetchExistingVotes(mundialitoId, participant.id).then((existing) => {
      setScores(existing);
    });
  }

  function onChangeName() {
    window.localStorage.removeItem(storageKey(mundialitoId));
    setSelectedId(null);
    setScores({});
    setSaved(false);
    setError(null);
    setPhase("roster");
  }

  function onPickScore(itemId: string, score: number) {
    setScores((prev) => ({ ...prev, [itemId]: score }));
    setSaved(false);
  }

  async function onSubmit() {
    if (!selectedId || submitting) return;

    const ballot = items.map((item) => ({
      itemId: item.id,
      score: scores[item.id],
    }));

    if (ballot.length === 0 || ballot.some((s) => !Number.isInteger(s.score))) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/votes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mundialitoId,
          participantId: selectedId,
          scores: ballot,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "No se pudo registrar la votación.");
        return;
      }

      setSaved(true);
    } catch {
      setError("No se pudo registrar la votación.");
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "loading") {
    return <p style={mutedStyle}>Cargando…</p>;
  }

  if (phase === "notfound") {
    return (
      <section>
        <h1>Mundialito no encontrado</h1>
        <p style={mutedStyle}>
          Revisá el enlace que te compartieron e intentá de nuevo.
        </p>
      </section>
    );
  }

  if (phase === "loaderror") {
    return (
      <section>
        <h1>No se pudo cargar la votación</h1>
        <p style={mutedStyle}>Intentá de nuevo en unos minutos.</p>
      </section>
    );
  }

  if (phase === "draft") {
    return (
      <section>
        <h1>{mundialito?.name ?? "Mundialito"}</h1>
        <p style={{ ...mutedStyle, fontWeight: 600 }}>
          La votación aún no comenzó.
        </p>
        <p style={mutedStyle}>
          Cuando se active vas a poder elegir tu nombre y votar. Recargá la
          página más tarde.
        </p>
      </section>
    );
  }

  if (phase === "finished") {
    return (
      <section>
        <h1>{mundialito?.name ?? "Mundialito"}</h1>
        <p style={{ ...mutedStyle, fontWeight: 600 }}>
          La votación ya finalizó.
        </p>
        <p style={mutedStyle}>No se pueden modificar más los votos.</p>
      </section>
    );
  }

  if (phase === "roster") {
    return (
      <section>
        <h1>{mundialito?.name ?? "Mundialito"}</h1>
        {mundialito?.description && (
          <p style={mutedStyle}>{mundialito.description}</p>
        )}

        <p style={{ fontWeight: 600, marginTop: "1.5rem" }}>
          ¿Cómo te llamás? Elegí tu nombre de la lista.
        </p>

        {participants.length === 0 ? (
          <p style={mutedStyle}>No hay participantes disponibles.</p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              marginTop: "1rem",
              display: "grid",
              gap: "0.6rem",
            }}
          >
            {participants.map((participant) => (
              <li key={participant.id}>
                <button
                  type="button"
                  onClick={() => onSelectParticipant(participant)}
                  style={rosterButtonStyle}
                >
                  {participant.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const selectedName =
    participants.find((p) => p.id === selectedId)?.display_name ?? "";
  const allScored =
    items.length > 0 && items.every((item) => Number.isInteger(scores[item.id]));

  return (
    <section>
      <h1>{mundialito?.name ?? "Mundialito"}</h1>

      <p style={{ color: "#666" }}>
        Votando como <strong>{selectedName}</strong>{" "}
        <button
          type="button"
          onClick={onChangeName}
          disabled={submitting}
          style={linkButtonStyle}
        >
          Cambiar de nombre
        </button>
      </p>

      {items.length === 0 ? (
        <p style={mutedStyle}>No hay ítems para votar.</p>
      ) : (
        <ol
          style={{
            listStyle: "none",
            padding: 0,
            marginTop: "1.5rem",
            display: "grid",
            gap: "1.5rem",
          }}
        >
          {items.map((item, index) => (
            <li key={item.id} style={{ display: "grid", gap: "0.5rem" }}>
              <div>
                <strong>
                  {index + 1}. {item.name}
                </strong>
                {item.description && (
                  <div style={{ ...mutedStyle, fontSize: "0.85rem" }}>
                    {item.description}
                  </div>
                )}
              </div>

              <div
                style={scoreGridStyle}
                role="group"
                aria-label={`Puntaje de ${item.name}`}
              >
                {SCORE_OPTIONS.map((score) => (
                  <button
                    key={score}
                    type="button"
                    aria-pressed={scores[item.id] === score}
                    onClick={() => onPickScore(item.id, score)}
                    style={
                      scores[item.id] === score
                        ? { ...scoreButtonStyle, ...scoreButtonSelectedStyle }
                        : scoreButtonStyle
                    }
                  >
                    {score}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div aria-live="polite">
        {saved && (
          <p style={{ color: "seagreen", fontWeight: 600 }}>
            ¡Voto registrado! Podés modificarlo mientras esté abierta.
          </p>
        )}
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </div>

      {items.length > 0 && !allScored && (
        <p style={mutedStyle}>Puntuá todos los ítems para continuar.</p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!allScored || submitting}
        style={{
          ...submitButtonStyle,
          cursor: allScored && !submitting ? "pointer" : "default",
          opacity: allScored ? 1 : 0.5,
        }}
      >
        {submitting ? "Enviando…" : "Confirmar votación"}
      </button>
    </section>
  );
}

const mutedStyle: React.CSSProperties = {
  color: "#666",
};

const rosterButtonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "3.25rem",
  padding: "0.85rem 1rem",
  fontSize: "1.05rem",
  textAlign: "left",
  border: "1px solid #ccc",
  borderRadius: "0.5rem",
  background: "white",
  color: "black",
  cursor: "pointer",
  boxSizing: "border-box",
};

const scoreGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(2.75rem, 1fr))",
  gap: "0.35rem",
};

const scoreButtonStyle: React.CSSProperties = {
  minHeight: "2.75rem",
  fontSize: "1rem",
  border: "1px solid #ccc",
  borderRadius: "0.5rem",
  background: "white",
  color: "black",
  cursor: "pointer",
};

const scoreButtonSelectedStyle: React.CSSProperties = {
  background: "black",
  color: "white",
  border: "1px solid black",
  fontWeight: 700,
};

const submitButtonStyle: React.CSSProperties = {
  width: "100%",
  marginTop: "1.5rem",
  padding: "0.9rem",
  background: "black",
  color: "white",
  border: "none",
  borderRadius: "0.5rem",
  fontSize: "1.05rem",
};

const linkButtonStyle: React.CSSProperties = {
  padding: 0,
  background: "none",
  border: "none",
  color: "#0066cc",
  fontSize: "0.9rem",
  textDecoration: "underline",
  cursor: "pointer",
  font: "inherit",
};
