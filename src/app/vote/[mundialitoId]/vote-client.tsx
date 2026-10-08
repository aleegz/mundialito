"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isUuid } from "@/lib/validation/uuid";
import {
  calculateItemRanking,
  calculateOverallRanking,
  validateScore,
  type VoteRow,
} from "@/lib/calculations/ranking";

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
  | "identify"
  | "ballot";

type Scores = Record<string, number>;

const SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Identidad del votante (Opcion A): participantId en localStorage,
 * con la clave separada por mundialito para no mezclar votantes
 * del mismo navegador en competiciones distintas. El participantId
 * se crea en el auto-registro (POST /api/participants con nombre).
 */
function storageKey(mundialitoId: string): string {
  return `mundialito-vote-participant:${mundialitoId}`;
}

/**
 * Spanish-friendly average for the results view: two decimals with a
 * comma, and an em dash when there is no data behind it.
 */
function formatAverage(average: number): string {
  if (Number.isNaN(average)) {
    return "—";
  }
  return average.toFixed(2).replace(".", ",");
}

/**
 * Prefill de los puntajes ya votados. Devuelve null cuando la carga
 * falla (red, error del API, cuerpo invalido): asumir "sin votos
 * previos" mostraria un ballot vacio silencioso y el votante se
 * confunde si ya habia puntuado.
 */
async function fetchExistingVotes(
  mundialitoId: string,
  participantId: string,
): Promise<Scores | null> {
  try {
    const response = await fetch(
      `/api/votes?mundialitoId=${mundialitoId}&participantId=${participantId}`,
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      votes?: { itemId: string; score: number }[];
    };

    if (!Array.isArray(data.votes)) return null;

    const existing: Scores = {};
    for (const vote of data.votes) {
      existing[vote.itemId] = vote.score;
    }
    return existing;
  } catch {
    return null;
  }
}

export function VoteClient({ mundialitoId }: { mundialitoId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [mundialito, setMundialito] = useState<Mundialito | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scores, setScores] = useState<Scores>({});
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

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
        // Results view: anon read of the full dataset (RLS allows
        // SELECT on ACTIVE/FINISHED). Derived data is never persisted —
        // rankings are recalculated on every render.
        const [participantsResult, itemsResult, votesResult] =
          await Promise.all([
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
            supabase
              .from("votes")
              .select("participant_id, item_id, score")
              .eq("mundialito_id", mundialitoId),
          ]);

        if (cancelled) return;

        if (
          participantsResult.error ||
          itemsResult.error ||
          votesResult.error
        ) {
          setPhase("loaderror");
          return;
        }

        setMundialito(data);
        setParticipants(participantsResult.data ?? []);
        setItems(itemsResult.data ?? []);
        setVotes(votesResult.data ?? []);
        setPhase("finished");
        return;
      }

      // ACTIVE: sin roster. Se cargan los items y se restaura la
      // identidad del votante (participantId en localStorage); si no
      // hay, la pantalla pide el nombre y crea el participante.
      const stored = window.localStorage.getItem(storageKey(mundialitoId));
      const storedId = stored && isUuid(stored) ? stored : null;

      if (stored && !storedId) {
        window.localStorage.removeItem(storageKey(mundialitoId));
      }

      const [itemsResult, participantResult] = await Promise.all([
        supabase
          .from("items")
          .select("id, name, description")
          .eq("mundialito_id", mundialitoId)
          .order("created_at", { ascending: true }),
        storedId
          ? supabase
              .from("participants")
              .select("id, display_name")
              .eq("id", storedId)
              .eq("mundialito_id", mundialitoId)
              .maybeSingle()
          : null,
      ]);

      if (cancelled) return;

      if (itemsResult.error || participantResult?.error) {
        setPhase("loaderror");
        return;
      }

      // Sin fila para el id guardado = identidad invalida (borrada,
      // u otro mundialito): se descarta y se vuelve al registro.
      const me = participantResult?.data ?? null;

      if (storedId && !me) {
        window.localStorage.removeItem(storageKey(mundialitoId));
      }

      setMundialito(data);
      setItems(itemsResult.data ?? []);

      if (me) {
        setSelectedId(me.id);
        setDisplayName(me.display_name);
        // Prefill: si este navegador ya voto, se recuperan los puntajes.
        const existing = await fetchExistingVotes(mundialitoId, me.id);
        if (cancelled) return;
        if (existing === null) {
          // Fallo de carga del prefill: avanzar con ballot vacio seria
          // un fallback silencioso (el votante creeria que no voto).
          setPhase("loaderror");
          return;
        }
        setScores(existing);
        setPhase("ballot");
      } else {
        setPhase("identify");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [mundialitoId]);

  /**
   * Auto-registro: el server crea el participante (mundialito ACTIVE)
   * y el participantId devuelto pasa a ser la identidad en este
   * navegador.
   * Participante nuevo = sin votos previos, no hay nada que prefillar.
   */
  async function onIdentify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const name = nameInput.trim();

    if (name.length === 0) {
      setError("Escribí tu nombre.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mundialitoId, name }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "No se pudo registrar tu nombre.");
        return;
      }

      const data = (await response.json().catch(() => null)) as {
        participant?: { id?: unknown; display_name?: unknown };
      } | null;

      const participantId = data?.participant?.id;
      const registeredName = data?.participant?.display_name;

      if (typeof participantId !== "string" || typeof registeredName !== "string") {
        setError("No se pudo registrar tu nombre.");
        return;
      }

      window.localStorage.setItem(storageKey(mundialitoId), participantId);
      setSelectedId(participantId);
      setDisplayName(registeredName);
      setNameInput("");
      setScores({});
      setSaved(false);
      setPhase("ballot");
    } catch {
      setError("No se pudo registrar tu nombre.");
    } finally {
      setSubmitting(false);
    }
  }

  function onStartEditName() {
    setNameDraft(displayName);
    setEditingName(true);
    setError(null);
  }

  function onCancelEditName() {
    setEditingName(false);
    setNameDraft("");
    setError(null);
  }

  async function onSaveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || submitting) return;

    const name = nameDraft.trim();

    if (name.length === 0) {
      setError("Escribí tu nombre.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/participants/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "No se pudo actualizar el nombre.");
        return;
      }

      const data = (await response.json().catch(() => null)) as {
        participant?: { display_name?: unknown };
      } | null;

      const updatedName = data?.participant?.display_name;

      if (typeof updatedName !== "string") {
        setError("No se pudo actualizar el nombre.");
        return;
      }

      setDisplayName(updatedName);
      setEditingName(false);
      setNameDraft("");
    } catch {
      setError("No se pudo actualizar el nombre.");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Otra persona en este navegador (o el mismo que quiere otro
   * nombre): se descarta la identidad LOCAL y se vuelve al
   * registro. La fila anterior queda intacta — solo se desvincula
   * este navegador; crear otro participante con el mismo nombre
   * esta permitido.
   */
  function onSwitchIdentity() {
    window.localStorage.removeItem(storageKey(mundialitoId));
    setSelectedId(null);
    setDisplayName("");
    setNameInput("");
    setNameDraft("");
    setEditingName(false);
    setScores({});
    setSaved(false);
    setError(null);
    setPhase("identify");
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

    if (ballot.length === 0 || ballot.some((entry) => !validateScore(entry.score))) {
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
          Cuando se active vas a poder registrarte con tu nombre y votar.
          Recargá la página más tarde.
        </p>
      </section>
    );
  }

  if (phase === "finished") {
    const itemRankings = calculateItemRanking(votes);
    const overallRanking = calculateOverallRanking(votes);

    const nameOf = (participantId: string): string =>
      participants.find((p) => p.id === participantId)?.display_name ??
      "Participante";

    // Rows arrive ordered by position; break ties alphabetically so
    // shared positions render in a stable, readable order.
    const overallSorted = [...overallRanking].sort(
      (a, b) =>
        a.position - b.position ||
        nameOf(a.participantId).localeCompare(nameOf(b.participantId)),
    );

    return (
      <section>
        <h1>Resultados — {mundialito?.name ?? "Mundialito"}</h1>
        {mundialito?.description && (
          <p style={mutedStyle}>{mundialito.description}</p>
        )}
        <p style={{ ...mutedStyle, fontWeight: 600 }}>
          La votación finalizó. No se pueden modificar más los votos.
        </p>

        <h2 style={resultsHeadingStyle}>Por ítem</h2>

        {items.length === 0 ? (
          <p style={mutedStyle}>No hay ítems para mostrar.</p>
        ) : (
          <div style={{ display: "grid", gap: "1.25rem" }}>
            {items.map((item, index) => {
              const rows = [...(itemRankings.get(item.id) ?? [])].sort(
                (a, b) =>
                  a.position - b.position ||
                  nameOf(a.participantId).localeCompare(
                    nameOf(b.participantId),
                  ),
              );

              return (
                <div key={item.id}>
                  <div style={{ fontWeight: 700 }}>
                    {index + 1}. {item.name}
                  </div>
                  {item.description && (
                    <div style={{ ...mutedStyle, fontSize: "0.85rem" }}>
                      {item.description}
                    </div>
                  )}

                  {rows.length === 0 ? (
                    <p style={{ ...mutedStyle, marginTop: "0.35rem" }}>
                      Este ítem no recibió votos.
                    </p>
                  ) : (
                    <ul style={resultListStyle}>
                      {rows.map((row) => (
                        <li key={row.participantId} style={resultRowStyle}>
                          <div style={resultRowHeaderStyle}>
                            <span style={positionStyle}>{row.position}.</span>
                            <span>{nameOf(row.participantId)}</span>
                          </div>
                          <div style={resultStatsStyle}>
                            Promedio {formatAverage(row.average)} · Mín{" "}
                            {row.min} · Máx {row.max} · {row.voteCount}{" "}
                            {row.voteCount === 1 ? "voto" : "votos"}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <h2 style={resultsHeadingStyle}>Ranking general</h2>

        {overallSorted.length === 0 ? (
          <p style={mutedStyle}>Todavía no hay votos registrados.</p>
        ) : (
          <ol style={resultListStyle}>
            {overallSorted.map((row) => (
              <li key={row.participantId} style={resultRowStyle}>
                <div style={resultRowHeaderStyle}>
                  <span style={positionStyle}>{row.position}.</span>
                  <span>{nameOf(row.participantId)}</span>
                </div>
                <div style={resultStatsStyle}>
                  Promedio {formatAverage(row.average)} · Total {row.total} ·{" "}
                  {row.voteCount} {row.voteCount === 1 ? "voto" : "votos"}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  }

  if (phase === "identify") {
    return (
      <section>
        <h1>{mundialito?.name ?? "Mundialito"}</h1>
        {mundialito?.description && (
          <p style={mutedStyle}>{mundialito.description}</p>
        )}

        <form onSubmit={onIdentify} style={nameFormStyle}>
          <label style={nameLabelStyle}>
            Tu nombre
            <input
              type="text"
              value={nameInput}
              onChange={(event) => {
                setNameInput(event.target.value);
                setError(null);
              }}
              placeholder="Ej: Ana"
              maxLength={100}
              autoFocus
              style={nameInputStyle}
            />
          </label>

          <p style={mutedStyle}>
            No hace falta cuenta: este nombre identifica tus votos. Los
            nombres repetidos están bien.
          </p>

          {error && <p style={{ color: "crimson" }}>{error}</p>}

          <button type="submit" disabled={submitting} style={submitButtonStyle}>
            {submitting ? "Registrando…" : "Empezar a votar"}
          </button>
        </form>
      </section>
    );
  }

  const allScored =
    items.length > 0 && items.every((item) => Number.isInteger(scores[item.id]));

  return (
    <section>
      <h1>{mundialito?.name ?? "Mundialito"}</h1>

      {editingName ? (
        <form onSubmit={onSaveName} style={nameFormStyle}>
          <label style={nameLabelStyle}>
            Tu nombre
            <input
              type="text"
              value={nameDraft}
              onChange={(event) => {
                setNameDraft(event.target.value);
                setError(null);
              }}
              maxLength={100}
              autoFocus
              style={nameInputStyle}
            />
          </label>

          {error && <p style={{ color: "crimson" }}>{error}</p>}

          <div style={nameActionsStyle}>
            <button
              type="submit"
              disabled={submitting}
              style={nameSaveButtonStyle}
            >
              {submitting ? "Guardando…" : "Guardar nombre"}
            </button>
            <button
              type="button"
              onClick={onCancelEditName}
              disabled={submitting}
              style={nameCancelButtonStyle}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <p style={{ color: "#666" }}>
          Votando como <strong>{displayName}</strong>{" "}
          <button
            type="button"
            onClick={onStartEditName}
            disabled={submitting}
            style={linkButtonStyle}
          >
            Editar nombre
          </button>{" "}
          <button
            type="button"
            onClick={onSwitchIdentity}
            disabled={submitting}
            style={linkButtonStyle}
          >
            Votar con otro nombre
          </button>
        </p>
      )}

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
        {/* Mientras se edita el nombre, el error se muestra junto al
            form (arriba) para no duplicar el mensaje. */}
        {!editingName && error && (
          <p style={{ color: "crimson" }}>{error}</p>
        )}
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

const nameFormStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  marginTop: "1.5rem",
};

const nameLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  fontSize: "0.9rem",
  fontWeight: 500,
};

const nameInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem",
  border: "1px solid #ccc",
  borderRadius: "0.5rem",
  fontSize: "1rem",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const nameActionsStyle: React.CSSProperties = {
  display: "inline-flex",
  gap: "0.5rem",
  alignItems: "center",
  flexWrap: "wrap",
};

const nameSaveButtonStyle: React.CSSProperties = {
  padding: "0.6rem 1rem",
  background: "black",
  color: "white",
  border: "none",
  borderRadius: "0.5rem",
  fontSize: "0.95rem",
  cursor: "pointer",
};

const nameCancelButtonStyle: React.CSSProperties = {
  padding: "0.6rem 1rem",
  background: "white",
  color: "black",
  border: "1px solid #ccc",
  borderRadius: "0.5rem",
  fontSize: "0.95rem",
  cursor: "pointer",
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

const resultsHeadingStyle: React.CSSProperties = {
  fontSize: "1.15rem",
  marginTop: "2rem",
  marginBottom: "0.75rem",
};

const resultListStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "grid",
  gap: "0.5rem",
};

const resultRowStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: "0.5rem",
  padding: "0.65rem 0.85rem",
  background: "white",
};

const resultRowHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "0.5rem",
  fontWeight: 600,
};

const positionStyle: React.CSSProperties = {
  minWidth: "1.75rem",
  fontVariantNumeric: "tabular-nums",
};

const resultStatsStyle: React.CSSProperties = {
  ...mutedStyle,
  fontSize: "0.85rem",
  marginTop: "0.15rem",
};
