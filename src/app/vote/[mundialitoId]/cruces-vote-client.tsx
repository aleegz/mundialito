"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isUuid } from "@/lib/validation/uuid";
import type { Database } from "@/types/database.types";

type Mundialito = Database["public"]["Tables"]["mundialitos"]["Row"];
type Participant = Database["public"]["Tables"]["participants"]["Row"];
type Item = Database["public"]["Tables"]["items"]["Row"];
type Match = Database["public"]["Tables"]["matches"]["Row"];

type Phase =
  | "loading"
  | "notfound"
  | "loaderror"
  | "draft"
  | "identify"
  | "waiting"
  | "voting"
  | "spectator"
  | "finished";

/**
 * Estado global del mundialito tal como lo ve este navegador.
 * Tanto la carga inicial como el polling alimentan un mismo
 * applySnapshot, y solo el snapshot decide la fase.
 */
type Snapshot = {
  mundialito: Mundialito;
  matches: Match[];
  participants: Participant[];
  me: Participant | null;
};

/**
 * Polling del estado del torneo (feedback "resultados en tiempo real").
 * Realtime no aporta nada acá: el voto es secreto mientras el cruce está
 * OPEN (RLS bloquea la lectura), asi que lo unico que cambia en vivo es
 * el bracket — y 5s de latencia son invisibles para un tablero de juego.
 */
const POLL_MS = 5000;

/**
 * Identidad del votante (Opcion A: possession del participantId en
 * localStorage). Misma clave que el vote-client de RANKING para que
 * el mismo navegador comparta identidad en ambos modos.
 */
function storageKey(mundialitoId: string): string {
  return `mundialito-vote-participant:${mundialitoId}`;
}

/**
 * Eleccion del votante para un cruce puntual: se guarda en
 * localStorage con la ronda para no confundir la eleccion de un
 * desempate previo con la actual. Mientras el cruce esta OPEN, RLS
 * no deja LEER match_votes ni al propio votante (secreto del voto
 * Opcion A); el localStorage es el unico estado visible.
 */
function voteStorageKey(matchId: string, voteRound: number): string {
  return `mundialito-cruce-vote:${matchId}:${voteRound}`;
}

/**
 * Fase segun el mundo. Regla de inscripcion: nadie se suma despues
 * del sorteo (PARTICIPANTS_LOCKED cierra la puerta; VOTING sin
 * identidad = espectador, no votante).
 */
function resolvePhase(
  status: string,
  matches: Match[],
  me: Participant | null,
): Phase {
  switch (status) {
    case "DRAFT":
      return "draft";
    case "PARTICIPANTS_OPEN":
      return me ? "waiting" : "identify";
    case "PARTICIPANTS_LOCKED":
    case "DRAWN":
      return "waiting";
    case "VOTING": {
      const open = matches.find((m) => m.status === "OPEN");
      if (!me) return "spectator";
      return open ? "voting" : "waiting";
    }
    case "FINISHED":
      return "finished";
    default:
      return "notfound";
  }
}

/**
 * Superficie del votante para modo CRUCES. A diferencia del RANKING
 * (ballot completo), aca el voto es A/B por cruce y requiere conocer
 * el cruce abierto + la identidad del votante.
 *
 * Estados:
 *   PARTICIPANTS_OPEN - identidad opcional: identificarse para votar,
 *                       o mirar items / participantes mientras tanto.
 *   PARTICIPANTS_LOCKED / DRAWN - inscripcion cerrada / sorteo listo:
 *                       fase "waiting" (el owner da Iniciar). En DRAWN
 *                       ya se ve el bracket sorteado.
 *   VOTING - cruce abierto A vs B. Sin identidad -> espectador (la
 *                       inscripcion cerro antes del sorteo): bracket
 *                       en vivo. Con identidad y cruce abierto -> PUT
 *                       /api/matches/[id]/vote. Entre rondas -> waiting
 *                       con el bracket que ya resolvió.
 *   FINISHED - bracket completo con ganadores.
 */
export function CrucesVoteClient({ mundialitoId }: { mundialitoId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [mundialito, setMundialito] = useState<Mundialito | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [me, setMe] = useState<Participant | null>(null);
  const [openMatch, setOpenMatch] = useState<Match | null>(null);
  // Eleccion local para el cruce abierto (A o B): itemId elegido.
  const [choice, setChoice] = useState<string | null>(null);
  const [savedRound, setSavedRound] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs espejo de lo que el polling necesita sin closures viejas.
  const phaseRef = useRef<Phase>("loading");
  const worldKeyRef = useRef("");
  const savingRef = useRef(false);
  const refreshingRef = useRef(false);

  const applySnapshot = useCallback((snap: Snapshot) => {
    const open = snap.matches.find((m) => m.status === "OPEN") ?? null;
    const key = `${snap.mundialito.status}:${open?.id ?? "-"}:${
      open?.vote_round ?? 0
    }:${snap.me?.id ?? "-"}`;

    setParticipants(snap.participants);
    setMatches(snap.matches);

    // Mientras se esta votando y el mundo NO cambio (misma ronda, misma
    // identidad): no pisar la eleccion a medio click ni forzar renders.
    if (phaseRef.current === "voting" && key === worldKeyRef.current) {
      return;
    }

    worldKeyRef.current = key;
    phaseRef.current = resolvePhase(snap.mundialito.status, snap.matches, snap.me);
    setMundialito(snap.mundialito);
    setMe(snap.me);
    setOpenMatch(open);

    if (phaseRef.current === "voting" && open) {
      // Restaurar la eleccion de ESTE cruce y ronda en localStorage.
      const saved = window.localStorage.getItem(
        voteStorageKey(open.id, open.vote_round),
      );
      if (saved && isUuid(saved) && (saved === open.item_a_id || saved === open.item_b_id)) {
        setChoice(saved);
        setSavedRound(open.vote_round);
      } else {
        if (saved) {
          window.localStorage.removeItem(voteStorageKey(open.id, open.vote_round));
        }
        setChoice(null);
        setSavedRound(null);
      }
    } else {
      setChoice(null);
      setSavedRound(null);
    }

    setPhase(phaseRef.current);
  }, []);

  /**
   * Trae el mundo (mundialito + matches + participantes + identidad) y
   * lo aplica. Devuelve false solo cuando el fetch falla. Los items son
   * estaticos (se cargan una vez en el load inicial).
   */
  const refreshWorld = useCallback(async (): Promise<boolean> => {
    // No refrescar mientras se esta enviando un voto / registro ni si
    // otro refresh ya esta en vuelo (evita solaparse con el polling).
    if (savingRef.current || refreshingRef.current) return true;

    refreshingRef.current = true;
    try {
      const supabase = createClient();

      const stored = window.localStorage.getItem(storageKey(mundialitoId));
      const storedId = stored && isUuid(stored) ? stored : null;
      if (stored && !storedId) {
        window.localStorage.removeItem(storageKey(mundialitoId));
      }

      const [mResult, matchesResult, participantsResult, meResult] =
        await Promise.all([
          supabase
            .from("mundialitos")
            .select("*")
            .eq("id", mundialitoId)
            .maybeSingle(),
          supabase
            .from("matches")
            .select("*")
            .eq("mundialito_id", mundialitoId)
            .order("round", { ascending: true })
            .order("position", { ascending: true }),
          supabase
            .from("participants")
            .select("*")
            .eq("mundialito_id", mundialitoId)
            .order("display_name", { ascending: true }),
          storedId
            ? supabase
                .from("participants")
                .select("*")
                .eq("id", storedId)
                .eq("mundialito_id", mundialitoId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

      if (
        mResult.error ||
        matchesResult.error ||
        participantsResult.error ||
        meResult?.error ||
        !mResult.data
      ) {
        return false;
      }

      // No pisar la pantalla draft con un snapshot de turno.
      if (mResult.data.status === "DRAFT") return true;

      const meRow = meResult?.data ?? null;
      if (storedId && !meRow) {
        window.localStorage.removeItem(storageKey(mundialitoId));
      }

      applySnapshot({
        mundialito: mResult.data,
        matches: matchesResult.data ?? [],
        participants: participantsResult.data ?? [],
        me: meRow,
      });
      return true;
    } finally {
      refreshingRef.current = false;
    }
  }, [mundialitoId, applySnapshot]);

  // Carga inicial: validacion, items (una sola vez) y primer snapshot.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isUuid(mundialitoId)) {
        setPhase("notfound");
        return;
      }

      const supabase = createClient();

      const { data, error: mundialitoError } = await supabase
        .from("mundialitos")
        .select("*")
        .eq("id", mundialitoId)
        .maybeSingle();

      if (cancelled) return;

      if (mundialitoError || !data) {
        // Sin distincion "no existe" vs "DRAFT para anonimo": RLS
        // esconde el DRAFT y su existencia no se expone.
        setPhase("notfound");
        return;
      }

      if (data.status === "DRAFT") {
        setMundialito(data);
        setPhase("draft");
        return;
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from("items")
        .select("*")
        .eq("mundialito_id", mundialitoId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (itemsError) {
        setPhase("loaderror");
        return;
      }

      setItems(itemsData ?? []);

      const ok = await refreshWorld();
      if (cancelled) return;
      if (!ok) setPhase("loaderror");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [mundialitoId, refreshWorld]);

  // Polling: refresca el mundo cada POLL_MS mientras la pestana esta
  // visible; pausa con document.hidden y retoma (con fetch inmediato)
  // al volver. El snapshot detecta el cambio de ronda y auto-avanza.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      void refreshWorld();
      timer = setInterval(() => {
        void refreshWorld();
      }, POLL_MS);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshWorld]);

  // ------------------------------------------------------------
  // Auto-registro (PARTICIPANTS_OPEN): mismo contrato que vote-client.
  // ------------------------------------------------------------
  async function onIdentify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;

    setSaving(true);
    savingRef.current = true;
    setError(null);

    let registered = false;

    try {
      const response = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mundialitoId, name: nameInput }),
      });

      const data = (await response.json()) as {
        participant?: { id: string; display_name: string };
        error?: string;
      };

      if (!response.ok || !data.participant) {
        setError(data.error ?? "No se pudo registrar tu nombre.");
        return;
      }

      window.localStorage.setItem(
        storageKey(mundialitoId),
        data.participant.id,
      );
      setNameInput("");
      registered = true;
    } catch {
      setError("No se pudo registrar tu nombre.");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }

    // Re-resolver con la identidad nueva (esperando sorteo / votando).
    if (registered) {
      void refreshWorld();
    }
  }

  // ------------------------------------------------------------
  // Voto A/B (VOTING).
  // ------------------------------------------------------------
  async function onVote(itemId: string) {
    if (!openMatch || !me || savingRef.current) return;

    setSaving(true);
    savingRef.current = true;
    setError(null);

    try {
      const response = await fetch(`/api/matches/${openMatch.id}/vote`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mundialitoId,
          participantId: me.id,
          chosenItemId: itemId,
          voteRound: openMatch.vote_round,
        }),
      });

      const data = (await response.json()) as {
        saved?: boolean;
        error?: string;
      };

      if (!response.ok || !data.saved) {
        setError(data.error ?? "No se pudo guardar tu voto.");
        return;
      }

      window.localStorage.setItem(
        voteStorageKey(openMatch.id, openMatch.vote_round),
        itemId,
      );
      setChoice(itemId);
      setSavedRound(openMatch.vote_round);
    } catch {
      setError("No se pudo guardar tu voto.");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  function onSwitchIdentity() {
    window.localStorage.removeItem(storageKey(mundialitoId));
    worldKeyRef.current = ""; // forzar re-resolucion (me = null)
    setChoice(null);
    setSavedRound(null);
    void refreshWorld();
  }

  // ------------------------------------------------------------
  // Render.
  // ------------------------------------------------------------
  if (phase === "loading") {
    return <p>Cargando…</p>;
  }

  if (phase === "notfound") {
    return <p style={{ color: "#666" }}>Mundialito no encontrado.</p>;
  }

  if (phase === "loaderror") {
    return <p style={{ color: "crimson" }}>No se pudo cargar la votación.</p>;
  }

  if (phase === "draft") {
    return (
      <p style={{ color: "#666" }}>
        Este Mundialito todavía no está abierto para votar.
      </p>
    );
  }

  if (phase === "identify") {
    return (
      <section style={{ display: "grid", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>{mundialito?.name ?? "Mundialito"}</h2>
          <p style={{ margin: 0, color: "#666" }}>
            Sumate con tu nombre antes del sorteo. Después ya no se aceptan
            participantes.
          </p>
        </div>

        <form
          onSubmit={onIdentify}
          style={{ display: "grid", gap: "0.75rem", maxWidth: 360 }}
        >
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <small style={{ color: "#666" }}>Tu nombre</small>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={100}
              required
              style={{
                padding: "0.5rem",
                border: "1px solid #ccc",
                borderRadius: "0.35rem",
                boxSizing: "border-box",
                fontSize: "1rem",
              }}
            />
          </label>
          {error && <small style={{ color: "crimson" }}>{error}</small>}
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "0.6rem",
              background: "#0f766e",
              color: "white",
              border: "none",
              borderRadius: "0.35rem",
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            {saving ? "…" : "Sumarme"}
          </button>
        </form>

        {items.length > 0 && (
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>Se vota así:</p>
            <p style={{ margin: 0, color: "#666" }}>
              Cada cruce enfrenta dos ítems (A vs B) y avanza el que gana,
              hasta el campeón.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0" }}>
              {items.map((item) => (
                <li key={item.id} style={{ padding: "0.25rem 0" }}>
                  {item.name}
                  {item.description && (
                    <small style={{ color: "#888" }}> — {item.description}</small>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ParticipantsPanel participants={participants} />
      </section>
    );
  }

  if (phase === "spectator") {
    return (
      <section style={{ display: "grid", gap: "0.75rem" }}>
        <h2 style={{ margin: 0 }}>Seguí el torneo en vivo</h2>
        <p style={{ margin: 0, color: "#666" }}>
          La inscripción está cerrada: no se puede sumar quien no se registró
          antes del sorteo. Mirá cómo avanza el bracket mientras tanto.
        </p>
        <BracketViewInline matches={matches} items={items} />
        <ParticipantsPanel participants={participants} />
      </section>
    );
  }

  if (phase === "waiting") {
    return (
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <p style={{ margin: 0 }}>
          {me
            ? `Listo, ${me.display_name}.`
            : "La votación está por arrancar."}
        </p>
        <p style={{ margin: 0, color: "#666" }}>
          {mundialito?.status === "PARTICIPANTS_OPEN" &&
            "La inscripción sigue abierta hasta el sorteo."}
          {mundialito?.status === "PARTICIPANTS_LOCKED" &&
            "La inscripción está cerrada; el sorteo se viene."}
          {mundialito?.status === "DRAWN" &&
            "El bracket está listo; el owner va a iniciar la votación."}
          {mundialito?.status === "VOTING" &&
            "Esperando el próximo cruce. Mirá el bracket mientras tanto:"}
        </p>

        {matches.length > 0 && (
          <BracketViewInline matches={matches} items={items} />
        )}

        {mundialito?.status === "PARTICIPANTS_OPEN" && items.length > 0 && (
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>
              Se vota entre estos ítems:
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0.25rem 0 0" }}>
              {items.map((item) => (
                <li key={item.id} style={{ padding: "0.2rem 0" }}>
                  {item.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ParticipantsPanel participants={participants} />

        {me && (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={onSwitchIdentity}
              style={linkButtonStyle}
            >
              Cambiar de nombre
            </button>
          </div>
        )}
        {error && <small style={{ color: "crimson" }}>{error}</small>}
      </div>
    );
  }

  if (phase === "voting") {
    if (!openMatch) {
      return (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <p style={{ margin: 0 }}>Esperando el próximo cruce…</p>
          <BracketViewInline matches={matches} items={items} />
        </div>
      );
    }

    const slotItems = [openMatch.item_a_id, openMatch.item_b_id] as const;
    const alreadyVoted = savedRound === openMatch.vote_round && choice !== null;

    return (
      <section style={{ display: "grid", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>{mundialito?.name ?? "Mundialito"}</h2>
          <p style={{ margin: 0, color: "#666" }}>
            Cruce {openMatch.round}.{openMatch.position + 1}
            {openMatch.vote_round > 1 && ` · desempate ${openMatch.vote_round}`}
          </p>
        </div>

        <div style={{ display: "grid", gap: "0.5rem" }}>
          {slotItems.map((itemId, index) => {
            if (!itemId) return null;
            const name = items.find((i) => i.id === itemId)?.name ?? "—";
            const selected = choice === itemId;

            return (
              <button
                key={itemId}
                type="button"
                disabled={alreadyVoted && !selected}
                onClick={() => setChoice(itemId)}
                style={{
                  padding: "0.75rem",
                  border: selected ? "2px solid #0f766e" : "1px solid #ccc",
                  borderRadius: "0.5rem",
                  background: selected ? "#ecfdf5" : "white",
                  cursor: alreadyVoted && !selected ? "default" : "pointer",
                  textAlign: "left",
                  fontSize: "1rem",
                }}
              >
                {index === 0 ? "A" : "B"}: {name}
              </button>
            );
          })}
        </div>

        {choice && !alreadyVoted && (
          <button
            type="button"
            disabled={saving}
            onClick={() => onVote(choice)}
            style={{
              padding: "0.6rem",
              background: "#0f766e",
              color: "white",
              border: "none",
              borderRadius: "0.35rem",
              cursor: "pointer",
              fontSize: "1rem",
              width: "fit-content",
            }}
          >
            {saving ? "…" : "Votar"}
          </button>
        )}

        {alreadyVoted && (
          <p style={{ margin: 0, color: "#0f766e", fontWeight: 600 }}>
            Voto guardado ✅ Esperá al resto y mirá el bracket:
          </p>
        )}

        {error && <small style={{ color: "crimson" }}>{error}</small>}

        {matches.length > 0 && (
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>Bracket</p>
            <BracketViewInline matches={matches} items={items} />
          </div>
        )}
      </section>
    );
  }

  // FINISHED: bracket completo con ganadores.
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <h2>Resultados</h2>
      <BracketViewInline matches={matches} items={items} />
    </div>
  );
}

/**
 * Lista de participantes ya anotados ("sala de espera").
 * Solo muestra los JOINED; los EXCLUDED del owner no se listan.
 */
function ParticipantsPanel({ participants }: { participants: Participant[] }) {
  const joined = participants.filter((p) => p.status === "JOINED");

  if (joined.length === 0) {
    return null;
  }

  return (
    <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>
      Ya se sumaron {joined.length}{" "}
      {joined.length === 1 ? "participante" : "participantes"}:{" "}
      {joined.map((p) => p.display_name).join(", ")}.
    </p>
  );
}

/**
 * Presentacion del bracket (misma visual que BracketView del panel
 * del owner): llaves por ronda con ganador resaltado.
 */
function BracketViewInline({
  matches,
  items,
}: {
  matches: Match[];
  items: Item[];
}) {
  if (!matches.length) {
    return <p style={{ color: "#888" }}>Todavía no se sorteó el bracket.</p>;
  }

  const itemName = (id: string | null): string => {
    if (!id) return "—";
    return items.find((i) => i.id === id)?.name ?? "—";
  };

  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))`,
        gap: "0.5rem",
        overflowX: "auto",
      }}
    >
      {rounds.map((round) => {
        const roundMatches = matches
          .filter((m) => m.round === round)
          .sort((a, b) => a.position - b.position);

        return (
          <div
            key={round}
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: "#666",
                textAlign: "center",
              }}
            >
              {round === 1
                ? "Primera ronda"
                : round === rounds.length
                  ? "Final"
                  : `Ronda ${round}`}
            </h3>

            {roundMatches.map((match) => {
              const isOpen = match.status === "OPEN";
              const winner = match.winner_item_id;

              return (
                <div
                  key={match.id}
                  style={{
                    border: isOpen ? "2px solid #f59e0b" : "1px solid #ddd",
                    borderRadius: "0.5rem",
                    padding: "0.5rem 0.75rem",
                    background: isOpen ? "#fffbeb" : "white",
                    fontSize: "0.85rem",
                  }}
                >
                  {isOpen && (
                    <small style={{ color: "#b45309", fontWeight: 600 }}>
                      Abierto
                      {match.vote_round > 1 && ` · desempate ${match.vote_round}`}
                    </small>
                  )}

                  <div
                    style={{
                      padding: "0.25rem 0",
                      color: winner === match.item_a_id ? "#047857" : "inherit",
                      fontWeight: winner === match.item_a_id ? 600 : 400,
                    }}
                  >
                    {itemName(match.item_a_id)}
                  </div>

                  <div style={{ color: "#bbb", fontSize: "0.75rem", lineHeight: 1 }}>
                    ─
                  </div>

                  <div
                    style={{
                      padding: "0.25rem 0",
                      color: winner === match.item_b_id ? "#047857" : "inherit",
                      fontWeight: winner === match.item_b_id ? 600 : 400,
                    }}
                  >
                    {itemName(match.item_b_id)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const linkButtonStyle: React.CSSProperties = {
  padding: "0.35rem 0.75rem",
  background: "white",
  color: "black",
  border: "1px solid #ccc",
  borderRadius: "0.35rem",
  fontSize: "0.85rem",
  cursor: "pointer",
  width: "fit-content",
};