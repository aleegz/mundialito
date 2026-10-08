"use client";

import { useEffect, useState } from "react";
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
  | "finished";

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

const SUBCRIPTION_PHASE: Record<string, Phase> = {
  PARTICIPANTS_OPEN: "identify",
  PARTICIPANTS_LOCKED: "waiting",
  DRAWN: "waiting",
  VOTING: "voting",
  FINISHED: "finished",
};

/**
 * Superficie del votante para modo CRUCES. A diferencia del RANKING
 * (ballot completo), aca el voto es A/B por cruce y requiere conocer
 * el cruce abierto + la identidad del votante.
 *
 * Estados:
 *   PARTICIPANTS_OPEN - identidad opcional, hay que registrarse para
 *                       poder votar luego; si ya hay identidad se
 *                       muestra "esperando el sorteo".
 *   PARTICIPANTS_LOCKED / DRAWN - inscripcion cerrada / sorteo listo:
 *                       fase "waiting" (el owner da Iniciar).
 *   VOTING - cruce abierto A vs B; PUT /api/matches/[id]/vote.
 *   FINISHED - bracket completo con ganadores.
 */
export function CrucesVoteClient({ mundialitoId }: { mundialitoId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [mundialito, setMundialito] = useState<Mundialito | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [me, setMe] = useState<Participant | null>(null);
  const [openMatch, setOpenMatch] = useState<Match | null>(null);
  // Eleccion local para el cruce abierto (A o B): itemId elegido.
  const [choice, setChoice] = useState<string | null>(null);
  const [savedRound, setSavedRound] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      setMundialito(data);

      // Lectura identidad previa (localStorage).
      const stored = window.localStorage.getItem(storageKey(mundialitoId));
      const storedId = stored && isUuid(stored) ? stored : null;
      if (stored && !storedId) {
        window.localStorage.removeItem(storageKey(mundialitoId));
      }

      const [itemsResult, matchesResult, meResult] = await Promise.all([
        supabase
          .from("items")
          .select("*")
          .eq("mundialito_id", mundialitoId)
          .order("created_at", { ascending: true }),
        supabase
          .from("matches")
          .select("*")
          .eq("mundialito_id", mundialitoId)
          .order("round", { ascending: true })
          .order("position", { ascending: true }),
        storedId
          ? supabase
              .from("participants")
              .select("*")
              .eq("id", storedId)
              .eq("mundialito_id", mundialitoId)
              .maybeSingle()
          : null,
      ]);

      if (cancelled) return;

      if (itemsResult.error || matchesResult.error || meResult?.error) {
        setPhase("loaderror");
        return;
      }

      const meRow = meResult?.data ?? null;
      if (storedId && !meRow) {
        window.localStorage.removeItem(storageKey(mundialitoId));
      }

      setItems(itemsResult.data ?? []);
      setMatches(matchesResult.data ?? []);
      setMe(meRow);

      const phaseFor = SUBCRIPTION_PHASE[data.status];
      if (!phaseFor) {
        setPhase("notfound");
        return;
      }

      if (phaseFor === "voting") {
        const open = (matchesResult.data ?? []).find((m) => m.status === "OPEN");
        setOpenMatch(open ?? null);

        if (!open || !meRow) {
          // Sin identidad o sin cruce abierto (entre rondas): esperar.
          setPhase("waiting");
          return;
        }

        // Restaurar la eleccion de ESTE cruce y ronda en localStorage.
        const saved = window.localStorage.getItem(
          voteStorageKey(open.id, open.vote_round),
        );
        if (saved && isUuid(saved)) {
          const stillValid =
            saved === open.item_a_id || saved === open.item_b_id;
          if (stillValid) {
            setChoice(saved);
            setSavedRound(open.vote_round);
          } else {
            window.localStorage.removeItem(voteStorageKey(open.id, open.vote_round));
          }
        }

        setPhase("voting");
        return;
      }

      if (phaseFor === "identify" && meRow) {
        // Ya registrado, la inscripcion sigue abierta: esperar sorteo.
        setPhase("waiting");
        return;
      }

      setPhase(phaseFor);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [mundialitoId]);

  // ------------------------------------------------------------
  // Auto-registro (PARTICIPANTS_OPEN): mismo contrato que vote-client.
  // ------------------------------------------------------------
  async function onIdentify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

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
        setSaving(false);
        return;
      }

      window.localStorage.setItem(
        storageKey(mundialitoId),
        data.participant.id,
      );
      setSaving(false);
      setNameInput("");
      // Identidad creada: pasar a "waiting" (hay que esperar el sorteo).
      setPhase(
        mundialito?.status === "PARTICIPANTS_OPEN"
          ? "waiting"
          : "identify",
      );
      setMe({
        id: data.participant.id,
        mundialito_id: mundialitoId,
        display_name: data.participant.display_name,
        auth_user_id: null,
        status: "JOINED",
        created_at: new Date().toISOString(),
      } as Participant);
    } catch {
      setError("No se pudo registrar tu nombre.");
      setSaving(false);
    }
  }

  // ------------------------------------------------------------
  // Voto A/B (VOTING).
  // ------------------------------------------------------------
  async function onVote(itemId: string) {
    if (!openMatch || !me) return;

    setSaving(true);
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
        setSaving(false);
        return;
      }

      window.localStorage.setItem(
        voteStorageKey(openMatch.id, openMatch.vote_round),
        itemId,
      );
      setChoice(itemId);
      setSavedRound(openMatch.vote_round);
      setSaving(false);
    } catch {
      setError("No se pudo guardar tu voto.");
      setSaving(false);
    }
  }

  function onSwitchIdentity() {
    window.localStorage.removeItem(storageKey(mundialitoId));
    setMe(null);
    setChoice(null);
    setSavedRound(null);
    setPhase(SUBCRIPTION_PHASE[mundialito?.status ?? ""] ?? "identify");
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
      <form onSubmit={onIdentify} style={{ display: "grid", gap: "0.75rem" }}>
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
            }}
          />
        </label>
        {error && <small style={{ color: "crimson" }}>{error}</small>}
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "0.5rem",
            background: "#0f766e",
            color: "white",
            border: "none",
            borderRadius: "0.35rem",
            cursor: "pointer",
          }}
        >
          {saving ? "..." : "Sumarme"}
        </button>
      </form>
    );
  }

  if (phase === "waiting") {
    return (
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <p style={{ margin: 0 }}>
          {me
            ? `Listo, ${me.display_name}.`
            : "Vas a poder votar cuando empiece la votación."}
        </p>
        <p style={{ margin: 0, color: "#666" }}>
          {mundialito?.status === "PARTICIPANTS_OPEN" &&
            "La inscripción está abierta."}
          {mundialito?.status === "PARTICIPANTS_LOCKED" &&
            "La inscripción está cerrada; el sorteo se viene."}
          {mundialito?.status === "DRAWN" &&
            "El bracket está listo; el owner va a iniciar la votación."}
          {mundialito?.status === "VOTING" &&
            "Hay una ronda en curso. Esperá un momento…"}
        </p>
        {me && (
          <button type="button" onClick={onSwitchIdentity} style={linkButtonStyle}>
            Cambiar de nombre
          </button>
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
      <div style={{ display: "grid", gap: "1rem" }}>
        <p style={{ margin: 0, color: "#666" }}>
          Cruce {openMatch.round}.{openMatch.position + 1}
          {openMatch.vote_round > 1 && ` · desempate ${openMatch.vote_round}`}
        </p>

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
              padding: "0.5rem",
              background: "#0f766e",
              color: "white",
              border: "none",
              borderRadius: "0.35rem",
              cursor: "pointer",
            }}
          >
            {saving ? "..." : "Votar"}
          </button>
        )}

        {alreadyVoted && (
          <p style={{ margin: 0, color: "#0f766e" }}>Voto guardado ✅</p>
        )}

        {error && <small style={{ color: "crimson" }}>{error}</small>}
      </div>
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