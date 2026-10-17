"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isUuid } from "@/lib/validation/uuid";
import {
  calculateItemResults,
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

      const [itemsResult, participantResult, participantsResult] =
        await Promise.all([
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
          supabase
            .from("participants")
            .select("id, display_name")
            .eq("mundialito_id", mundialitoId)
            .order("display_name", { ascending: true }),
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
      // Lista de participantes para la "sala de espera" (identify).
      setParticipants(participantsResult.data ?? []);

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
    return (
      <div
        className="card card-pad animate-pulse"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">Cargando la votación…</span>
        <div className="h-6 w-2/3 rounded-lg bg-sunken" />
        <div className="mt-3 h-4 w-1/2 rounded-lg bg-sunken" />
      </div>
    );
  }

  if (phase === "notfound") {
    return (
      <div className="empty">
        <p className="h3">No encontramos este torneo</p>
        <p className="hint">
          Revisá el enlace que te compartieron e intentá de nuevo.
        </p>
      </div>
    );
  }

  if (phase === "loaderror") {
    return (
      <div className="empty">
        <p className="h3">No pudimos cargar la votación</p>
        <p className="hint">Intentá de nuevo en unos minutos.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn btn-secondary mt-3"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (phase === "draft") {
    return (
      <div className="card card-pad">
        <p className="eyebrow">Todavía no empezó</p>
        <h1 className="h1 mt-2">{mundialito?.name ?? "Mundialito"}</h1>
        <p className="lead mt-3">La votación aún no comenzó.</p>
        <p className="hint mt-2">
          Cuando se active vas a poder registrarte con tu nombre y votar.
          Recargá la página más tarde.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn btn-secondary mt-4"
        >
          Recargar
        </button>
      </div>
    );
  }

  if (phase === "finished") {
    const itemResults = calculateItemResults(votes);

    const nameOf = (participantId: string): string =>
      participants.find((p) => p.id === participantId)?.display_name ??
      "Participante";

    const itemNameOf = (itemId: string): string =>
      items.find((i) => i.id === itemId)?.name ?? "Ítem";

    // Rows arrive ordered by position; break ties alphabetically so
    // shared positions render in a stable, readable order.
    const itemResultsSorted = [...itemResults].sort(
      (a, b) =>
        a.position - b.position ||
        itemNameOf(a.itemId).localeCompare(itemNameOf(b.itemId)),
    );

    // Raw votes grouped by item, for the detail section. The PK
    // composite of votes guarantees each participant appears once per
    // item, so this is their actual score — not an average of one.
    const votesByItem = new Map<string, VoteRow[]>();
    for (const vote of votes) {
      const rows = votesByItem.get(vote.item_id) ?? [];
      rows.push(vote);
      votesByItem.set(vote.item_id, rows);
    }

    return (
      <section>
        <p className="eyebrow">Resultados</p>
        <h1 className="h1 mt-2">{mundialito?.name ?? "Mundialito"}</h1>
        {mundialito?.description && (
          <p className="lead mt-2">{mundialito.description}</p>
        )}
        <p className="alert alert-info mt-4">
          La votación finalizó. No se pueden modificar más los votos.
        </p>

        <h2 className="h2 mt-8">Ranking de ítems</h2>

        {itemResultsSorted.length === 0 ? (
          <p className="hint mt-3">Todavía no hay votos registrados.</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {itemResultsSorted.map((row) => {
              // La barra es la nota sobre 10: mismo dato que el
              // promedio, pero se lee la distancia de un vistazo.
              const pct = Number.isFinite(row.average)
                ? Math.max(0, Math.min(100, row.average * 10))
                : 0;

              return (
                <li key={row.itemId} className="card p-3.5">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-bold tabular-nums ${
                        row.position === 1
                          ? "bg-brand-soft text-brand"
                          : "bg-sunken text-muted"
                      }`}
                    >
                      {row.position}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-semibold text-fg">
                          {itemNameOf(row.itemId)}
                        </span>
                        <span className="flex-none text-lg font-bold tabular-nums text-brand">
                          {formatAverage(row.average)}
                        </span>
                      </div>

                      <div className="progress mt-2">
                        <div
                          className="progress-bar"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="hint mt-1.5">
                        Mín {row.min} · Máx {row.max} · {row.voteCount}{" "}
                        {row.voteCount === 1 ? "voto" : "votos"}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <h2 className="h2 mt-8">Detalle por ítem</h2>

        {items.length === 0 ? (
          <p className="hint mt-3">No hay ítems para mostrar.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {items.map((item) => {
              const rows = (votesByItem.get(item.id) ?? []).sort((a, b) =>
                nameOf(a.participant_id).localeCompare(nameOf(b.participant_id)),
              );

              return (
                <div key={item.id} className="card card-pad">
                  <div className="font-semibold text-fg">{item.name}</div>
                  {item.description && (
                    <div className="hint">{item.description}</div>
                  )}

                  {rows.length === 0 ? (
                    <p className="hint mt-2">Este ítem no recibió votos.</p>
                  ) : (
                    <ul className="mt-3 space-y-1.5">
                      {rows.map((vote) => (
                        <li
                          key={vote.participant_id}
                          className="flex items-center justify-between gap-3 rounded-lg bg-sunken px-3 py-1.5 text-sm"
                        >
                          <span className="truncate">
                            {nameOf(vote.participant_id)}
                          </span>
                          <span className="flex-none font-semibold tabular-nums">
                            {vote.score}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  if (phase === "identify") {
    return (
      <section>
        <p className="eyebrow">Inscripción</p>
        <h1 className="h1 mt-2">{mundialito?.name ?? "Mundialito"}</h1>
        {mundialito?.description && (
          <p className="lead mt-2">{mundialito.description}</p>
        )}

        <form onSubmit={onIdentify} className="card card-pad mt-6 space-y-4">
          <div className="field">
            <label className="label" htmlFor="voter-name">
              Tu nombre
            </label>
            <input
              id="voter-name"
              type="text"
              value={nameInput}
              onChange={(event) => {
                setNameInput(event.target.value);
                setError(null);
              }}
              placeholder="Ej: Ana"
              maxLength={100}
              autoFocus
              autoComplete="name"
              className="input"
            />
            <p className="hint">
              No hace falta cuenta: este nombre identifica tus votos. Los
              nombres repetidos están bien.
            </p>
          </div>

          {error && (
            <p className="alert alert-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary btn-block btn-lg"
          >
            {submitting ? "Registrando…" : "Empezar a votar"}
          </button>
        </form>

        {participants.length > 0 && (
          <p className="hint mt-4">
            Ya se sumaron {participants.length}{" "}
            {participants.length === 1 ? "participante" : "participantes"}:{" "}
            {participants.map((p) => p.display_name).join(", ")}.
          </p>
        )}
      </section>
    );
  }

  const allScored =
    items.length > 0 && items.every((item) => Number.isInteger(scores[item.id]));

  const scoredCount = items.filter((item) =>
    Number.isInteger(scores[item.id]),
  ).length;
  const progressPct =
    items.length > 0 ? Math.round((scoredCount / items.length) * 100) : 0;

  return (
    <section>
      <p className="eyebrow">Votación</p>
      <h1 className="h1 mt-2">{mundialito?.name ?? "Mundialito"}</h1>

      {editingName ? (
        <form onSubmit={onSaveName} className="card card-pad mt-4 space-y-4">
          <div className="field">
            <label className="label" htmlFor="edit-voter-name">
              Tu nombre
            </label>
            <input
              id="edit-voter-name"
              type="text"
              value={nameDraft}
              onChange={(event) => {
                setNameDraft(event.target.value);
                setError(null);
              }}
              maxLength={100}
              autoFocus
              className="input"
            />
          </div>

          {error && (
            <p className="alert alert-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? "Guardando…" : "Guardar nombre"}
            </button>
            <button
              type="button"
              onClick={onCancelEditName}
              disabled={submitting}
              className="btn btn-ghost"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
          <span className="flex items-center gap-2 text-sm text-muted">
            <span className="avatar" aria-hidden="true">
              {displayName.trim().charAt(0)}
            </span>
            Votando como <strong className="text-fg">{displayName}</strong>
          </span>
          <button
            type="button"
            onClick={onStartEditName}
            disabled={submitting}
            className="btn btn-ghost btn-sm"
          >
            Editar nombre
          </button>
          <button
            type="button"
            onClick={onSwitchIdentity}
            disabled={submitting}
            className="btn btn-ghost btn-sm"
          >
            Votar con otro nombre
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="hint mt-6">No hay ítems para votar.</p>
      ) : (
        <>
          <div className="mt-6">
            <div className="flex items-baseline justify-between gap-3">
              <span className="hint">
                {scoredCount} de {items.length} ítems puntuados
              </span>
              <span className="hint tabular-nums">{progressPct}%</span>
            </div>
            <div className="progress mt-2">
              <div className="progress-bar" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <ol className="mt-5 space-y-3">
            {items.map((item, index) => (
              <li key={item.id} className="card card-pad">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold tabular-nums text-subtle">
                    {index + 1}
                  </span>
                  <span className="font-semibold text-fg">{item.name}</span>
                  {Number.isInteger(scores[item.id]) ? (
                    <span className="pill pill-success ml-auto">Puntuado</span>
                  ) : null}
                </div>

                {item.description && (
                  <div className="hint mt-1">{item.description}</div>
                )}

                <div
                  className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-10"
                  role="group"
                  aria-label={`Puntaje de ${item.name}`}
                >
                  {SCORE_OPTIONS.map((score) => (
                    <button
                      key={score}
                      type="button"
                      aria-pressed={scores[item.id] === score}
                      onClick={() => onPickScore(item.id, score)}
                      className={`choice min-h-11 px-0 tabular-nums ${
                        scores[item.id] === score ? "choice-selected" : ""
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      <div aria-live="polite" className="mt-4 space-y-2">
        {saved && (
          <p className="alert alert-success" role="status">
            ¡Voto registrado! Podés modificarlo mientras esté abierta.
          </p>
        )}
        {/* Mientras se edita el nombre, el error se muestra junto al
            form (arriba) para no duplicar el mensaje. */}
        {!editingName && error && (
          <p className="alert alert-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="mt-6 space-y-2">
        {items.length > 0 && !allScored && (
          <p className="hint">Puntuá todos los ítems para continuar.</p>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={!allScored || submitting}
          className="btn btn-primary btn-block btn-lg"
        >
          {submitting ? "Enviando…" : "Confirmar votación"}
        </button>
      </div>
    </section>
  );
}
