"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { findOwnParticipant } from "@/lib/supabase/own-participant";
import { isUuid } from "@/lib/validation/uuid";
import type { Database } from "@/types/database.types";
import { Bracket } from "@/components/bracket";
import { useLiveRefresh } from "@/components/live-refresh";
import { matchTallies, type MatchTally } from "@/lib/calculations/bracket";
import {
  avatarForName,
  randomIdentity,
} from "@/lib/ui/random-identity";

type Mundialito = Database["public"]["Tables"]["mundialitos"]["Row"];
type Participant = Database["public"]["Tables"]["participants"]["Row"];
type Item = Database["public"]["Tables"]["items"]["Row"];
type Match = Database["public"]["Tables"]["matches"]["Row"];
type MatchVote = Database["public"]["Tables"]["match_votes"]["Row"];

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
  const [matchVotes, setMatchVotes] = useState<MatchVote[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [me, setMe] = useState<Participant | null>(null);
  const [openMatch, setOpenMatch] = useState<Match | null>(null);
  // Tally por cruce (#10): solo los cruces con votos visibles para ESTE
  // rol. RLS entrega los resueltos; el OPEN no (secreto del voto).
  const [tallies, setTallies] = useState<Record<string, MatchTally>>({});
  // Avance del cruce OPEN (#9): un conteo de votantes, nunca elecciones.
  const [voters, setVoters] = useState<{
    voted: number;
    eligible: number;
  } | null>(null);
  // Eleccion local para el cruce abierto (A o B): itemId elegido.
  const [choice, setChoice] = useState<string | null>(null);
  const [savedRound, setSavedRound] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [identityAvatar, setIdentityAvatar] = useState("🎲");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [finalRevealCountdown, setFinalRevealCountdown] = useState<number | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs espejo de lo que el polling necesita sin closures viejas.
  const phaseRef = useRef<Phase>("loading");
  const worldKeyRef = useRef("");
  const statusRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (countdown === null) return;

    const timer = window.setTimeout(() => {
      setCountdown((value) => {
        if (value === null || value <= 1) return null;
        return value - 1;
      });
    }, 850);

    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (finalRevealCountdown === null) return;

    const timer = window.setTimeout(() => {
      setFinalRevealCountdown((value) => {
        if (value === null || value <= 1) return null;
        return value - 1;
      });
    }, 850);

    return () => window.clearTimeout(timer);
  }, [finalRevealCountdown]);

  /**
   * Identidad por cuenta: se consulta una sola vez por visita. Si la
   * cuenta no tiene fila en este mundialito no hay por que repetir la
   * consulta en cada tick del polling.
   */
  const accountIdentityRef = useRef<{ resolved: boolean; id: string | null }>({
    resolved: false,
    id: null,
  });

  useEffect(() => {
    const identity = randomIdentity();
    const timer = window.setTimeout(() => {
      setNameInput((value) => value || identity.name);
      setIdentityAvatar(identity.avatar);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [mundialitoId]);

  const applySnapshot = useCallback((snap: Snapshot) => {
    const open = snap.matches.find((m) => m.status === "OPEN") ?? null;
    const key = `${snap.mundialito.status}:${open?.id ?? "-"}:${
      open?.vote_round ?? 0
    }:${snap.me?.id ?? "-"}`;
    const isNewWorld = key !== worldKeyRef.current;
    const wasPlaying = statusRef.current === "VOTING";
    const isNewlyFinished = snap.mundialito.status === "FINISHED" &&
      (wasPlaying || !statusRef.current);

    setParticipants(snap.participants);
    setMatches(snap.matches);

    // Mientras se esta votando y el mundo NO cambio (misma ronda, misma
    // identidad): no pisar la eleccion a medio click ni forzar renders.
    if (phaseRef.current === "voting" && key === worldKeyRef.current) {
      return;
    }

    worldKeyRef.current = key;
    statusRef.current = snap.mundialito.status;
    phaseRef.current = resolvePhase(snap.mundialito.status, snap.matches, snap.me);
    setMundialito(snap.mundialito);
    setMe(snap.me);
    if (snap.me) {
      setIdentityAvatar(snap.me.avatar || avatarForName(snap.me.display_name));
    }
    setOpenMatch(open);

    if (isNewlyFinished) {
      const revealKey = `mundialito-final-reveal:${mundialitoId}`;
      if (!window.sessionStorage.getItem(revealKey)) {
        window.sessionStorage.setItem(revealKey, "seen");
        setFinalRevealCountdown(3);
      }
    }

    if (isNewWorld && open) {
      setCountdown(3);
    }

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
  }, [mundialitoId]);

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

      const [
        mResult,
        matchesResult,
        participantsResult,
        meResult,
        votesResult,
      ] = await Promise.all([
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
          // Votos (#10): RLS deja pasar solo los de cruces resueltos.
          // Los del cruce OPEN no llegan (secreto del voto) y tampoco
          // hacen falta: el tally se pinta con lo que se pueda ver.
          supabase
            .from("match_votes")
            .select("*")
            .eq("mundialito_id", mundialitoId),
        ]);

      if (
        mResult.error ||
        matchesResult.error ||
        participantsResult.error ||
        meResult?.error ||
        votesResult.error ||
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

      /**
       * Sin identidad local pero con sesion: si la cuenta ya tiene fila
       * en este mundialito (el owner se anota al crear el torneo) se
       * adopta — pedirle el nombre otra vez crearia un duplicado,
       * porque el auto-registro anonimo no puede reclamar una fila con
       * cuenta—. La consulta se hace una sola vez por visita.
       */
      let me = meRow;
      if (!me) {
        if (!accountIdentityRef.current.resolved) {
          const own = await findOwnParticipant(supabase, mundialitoId);
          accountIdentityRef.current = { resolved: true, id: own?.id ?? null };
        }

        const ownId = accountIdentityRef.current.id;
        if (ownId) {
          me =
            (participantsResult.data ?? []).find((p) => p.id === ownId) ??
            null;
          if (me) {
            window.localStorage.setItem(storageKey(mundialitoId), me.id);
          }
        }
      }

      const worldMatches = matchesResult.data ?? [];

      // Tally del bracket (#10) con las filas que RLS dejo pasar.
      setTallies(matchTallies(worldMatches, votesResult.data ?? []));
      setMatchVotes(votesResult.data ?? []);

      // Conteo de votantes (#9): solo con cruce OPEN. La RPC es SECURITY
      // DEFINER (006) porque anon no lee match_votes mientras esta OPEN;
      // devuelve un N, nunca elecciones. Elegibles = JOINED: los
      // excluidos no votan. Si la RPC falla, no se muestra el numero
      // (inventar un 0 mentiria).
      const open = worldMatches.find((m) => m.status === "OPEN") ?? null;
      const eligible =
        (participantsResult.data ?? []).filter((p) => p.status === "JOINED")
          .length;
      if (open) {
        const { data: voted, error: countError } = await supabase.rpc(
          "match_voter_count",
          { p_match_id: open.id, p_vote_round: open.vote_round },
        );
        setVoters(
          countError ? null : { voted: voted ?? 0, eligible },
        );
      } else {
        setVoters(null);
      }

      applySnapshot({
        mundialito: mResult.data,
        matches: worldMatches,
        participants: participantsResult.data ?? [],
        me: meRow,
      });
      return true;
    } finally {
      refreshingRef.current = false;
    }
  }, [mundialitoId, applySnapshot]);

  /**
   * Realtime (#7): ademas del polling, un evento de las tablas del
   * torneo dispara el refetch al toque (mismo refreshWorld, mismos
   * guards: no pisa un voto en vuelo). Sin eventos — proyecto sin
   * Realtime o canal caido — el polling de 5s sigue siendo el piso.
   */
  useLiveRefresh(mundialitoId, refreshWorld);

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
  //
  // No se polea en `identify` (pantalla de "Ingresar nombre"): ahi el
  // mundo no cambia —nadie se suma solo— y el fetch cada 5s solo
  // repetia los detalles del mundialito a lo tonto (reporte del
  // 22/10: en incognito se veian peticiones constantes mientras
  // alguien todavia estaba escribiendo su nombre). Se salta tambien
  // en `loading`, que dura un instante y no aporta nada que repetir.
  useEffect(() => {
    if (phase === "identify" || phase === "loading") return;

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
  }, [refreshWorld, phase]);

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
        body: JSON.stringify({
          mundialitoId,
          name: nameInput,
          avatar: identityAvatar,
        }),
      });

      const data = (await response.json()) as {
        participant?: { id: string; display_name: string; avatar: string };
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
      setIdentityAvatar(
        data.participant.avatar ?? avatarForName(data.participant.display_name),
      );
      setIdentityAvatar(avatarForName(data.participant.display_name));
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
      <div className="empty">
        <p className="h3">Todavía no está abierto</p>
        <p className="hint">
          Este Mundialito todavía no está abierto para votar. Recargá la página
          más tarde.
        </p>
      </div>
    );
  }

  if (phase === "identify") {
    return (
      <section>
        <p className="game-kicker">Inscripción</p>
        <h1 className="h1 mt-2">{mundialito?.name ?? "Mundialito"}</h1>
        <p className="lead mt-2">
          Sumate con tu nombre antes del sorteo. Después ya no se aceptan
          participantes.
        </p>

        <GameProgress current="join" />

        <form onSubmit={onIdentify} className="game-panel card-pad mt-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="identity-avatar" aria-hidden="true">
              {identityAvatar}
            </span>
            <p className="hint">
              Te asignamos un nombre para arrancar. Podés cambiarlo antes del
              sorteo.
            </p>
          </div>
          <div className="field">
            <label className="label" htmlFor="cruces-name">
              Tu nombre
            </label>
            <input
              id="cruces-name"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                setIdentityAvatar(avatarForName(e.target.value));
              }}
              maxLength={100}
              required
              autoComplete="name"
              className="input"
            />
          </div>

          {error && (
            <p className="alert alert-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary btn-block btn-lg"
          >
            {saving ? "Sumándote…" : "Sumarme"}
          </button>
        </form>

        {/* La invitacion pide el nombre y nada mas: listar los items
            aca es ruido antes de sumarse (el detalle aparece en la
            sala de espera y en el bracket). */}
        {participants.length > 0 && (
          <div className="mt-4">
            <ParticipantsPanel participants={participants} />
          </div>
        )}
      </section>
    );
  }

  if (phase === "spectator") {
    return (
      <section>
        <p className="game-kicker">Espectador</p>
        <h1 className="h1 mt-2">{mundialito?.name ?? "Mundialito"}</h1>
        <p className="lead mt-2">
          La inscripción está cerrada: no se puede sumar quien no se registró
          antes del sorteo. Mirá cómo avanza el bracket mientras tanto.
        </p>

        <GameProgress current="play" />

          <div className="mt-6">
            <Bracket
              tallies={tallies}
            matches={matches}
            items={items}
            status={mundialito?.status}
              onMatchClick={(match) => {
                if (match.status === "RESOLVED") setSelectedMatch(match);
              }}
          />
        </div>
      </section>
    );
  }

  if (phase === "waiting") {
    return (
      <section>
        <p className="game-kicker">Sala de espera</p>
        <h1 className="h1 mt-2">{mundialito?.name ?? "Mundialito"}</h1>

        <GameProgress
          current={mundialito?.status === "PARTICIPANTS_OPEN" ? "join" : "play"}
        />

        <div className="game-panel card-pad mt-4">
          <p className="h3">
            {me
              ? `Listo, ${me.display_name}.`
              : "La votación está por arrancar."}
          </p>
          <p className="hint mt-1">
            {mundialito?.status === "PARTICIPANTS_OPEN" &&
              "La inscripción sigue abierta hasta el sorteo."}
            {mundialito?.status === "PARTICIPANTS_LOCKED" &&
              "La inscripción está cerrada; el sorteo se viene."}
            {mundialito?.status === "DRAWN" &&
              "El bracket está listo; el owner va a iniciar la votación."}
            {mundialito?.status === "VOTING" &&
              "Esperando el próximo cruce. Mirá el bracket mientras tanto:"}
          </p>

          {mundialito?.status === "PARTICIPANTS_OPEN" && items.length > 0 && (
            <>
              <p className="label mt-4">Se vota entre estos ítems</p>
              <ul className="mt-2 space-y-1 text-sm">
                {items.map((item) => (
                  <li key={item.id}>{item.name}</li>
                ))}
              </ul>
            </>
          )}

          {/* Identidad editable SOLO mientras la inscripcion esta
              abierta: ahi todavia tiene sentido corregir el nombre. Una
              vez que arranca el torneo, "Cambiar de nombre" y el
              recordatorio de la cuenta acompañaban toda la partida sin
              aportar nada (reporte del 22/10). */}
          {me &&
            mundialito?.status === "PARTICIPANTS_OPEN" &&
            (me.auth_user_id ? (
              <p className="hint mt-4">
                Tu nombre sale de tu cuenta: no se cambia desde acá.
              </p>
            ) : (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onSwitchIdentity}
                  className="btn btn-ghost btn-sm"
                >
                  Cambiar de nombre
                </button>
              </div>
            ))}

          {error && (
            <p className="alert alert-danger mt-4" role="alert">
              {error}
            </p>
          )}
        </div>

        {matches.length > 0 && (
          <div className="mt-4">
            <Bracket
              tallies={tallies}
              matches={matches}
              items={items}
              status={mundialito?.status}
              onMatchClick={(match) => {
                if (match.status === "RESOLVED") setSelectedMatch(match);
              }}
            />
          </div>
        )}

        <div className="mt-4">
          <ParticipantsPanel participants={participants} />
        </div>

        {selectedMatch ? (
          <MatchDetailModal
            match={selectedMatch}
            items={items}
            participants={participants}
            votes={matchVotes}
            onClose={() => setSelectedMatch(null)}
          />
        ) : null}
      </section>
    );
  }

  if (phase === "voting") {
    if (!openMatch) {
      return (
        <section>
          <p className="eyebrow">Esperando</p>
          <h1 className="h1 mt-2">{mundialito?.name ?? "Mundialito"}</h1>
          <p className="lead mt-2">
            Esperando el próximo cruce… Esta pantalla se actualiza sola.
          </p>

          {matches.length > 0 && (
            <div className="mt-6">
              <Bracket
                tallies={tallies}
                matches={matches}
                items={items}
                status={mundialito?.status}
                onMatchClick={(match) => {
                  if (match.status === "RESOLVED") setSelectedMatch(match);
                }}
              />
            </div>
          )}

          {selectedMatch ? (
            <MatchDetailModal
              match={selectedMatch}
              items={items}
              participants={participants}
              votes={matchVotes}
              onClose={() => setSelectedMatch(null)}
            />
          ) : null}
        </section>
      );
    }

    const slotItems = [openMatch.item_a_id, openMatch.item_b_id] as const;
    const alreadyVoted = savedRound === openMatch.vote_round && choice !== null;

    return (
      <section>
        <p className="game-kicker">
          Cruce {openMatch.round}.{openMatch.position + 1}
          {openMatch.vote_round > 1
            ? ` · desempate ${openMatch.vote_round}`
            : ""}
        </p>
        <h1 className="h1 mt-2">{mundialito?.name ?? "Mundialito"}</h1>
        <p className="lead mt-2">
          {alreadyVoted
            ? "Voto guardado. Esperá al resto: esta pantalla se actualiza sola."
            : "Elegí cuál de los dos pasa de ronda."}
        </p>

        <GameProgress current="play" />

        {/* Avance de la votacion (#9): el numero de votantes, nunca
            quien voto ni que eligio — eso es el secreto del voto. */}
        {voters && voters.eligible > 0 ? (
          <p className="hint mt-1">
            {voters.voted} de {voters.eligible} ya votaron.
          </p>
        ) : null}

        {openMatch.vote_round > 1 ? (
          <div className="tie-banner mt-5" role="status">
            <span className="tie-banner-label">Desempate</span>
            <span>
              La ronda anterior terminó empatada. Votá de nuevo para definir
              quién avanza.
            </span>
          </div>
        ) : null}

        {countdown !== null ? (
          <div className="countdown-panel mt-6" role="status" aria-live="assertive">
            <div>
              <span className="countdown-number" key={countdown}>
                {countdown}
              </span>
              <p className="hint mt-2">Prepárense para elegir</p>
            </div>
          </div>
        ) : (
        <div className="game-stage mt-6 grid gap-3 sm:grid-cols-2">
          {slotItems.map((itemId, index) => {
            if (!itemId) return null;

            const name = items.find((i) => i.id === itemId)?.name ?? "—";
            const selected = choice === itemId;
            const locked = alreadyVoted && !selected;

            return (
              <button
                key={itemId}
                type="button"
                disabled={locked}
                onClick={() => setChoice(itemId)}
                aria-pressed={selected}
                className={`choice game-choice flex-col items-start gap-1 p-4 text-left ${
                  selected ? "choice-selected" : ""
                }`}
              >
                <span className="text-xs font-bold tracking-widest text-subtle">
                  Opción {index === 0 ? "A" : "B"}
                </span>
                <span className="text-base font-semibold">{name}</span>
              </button>
            );
          })}
        </div>
        )}

        {choice && !alreadyVoted && countdown === null && (
          <button
            type="button"
            disabled={saving}
            onClick={() => onVote(choice)}
            className="btn btn-primary btn-block btn-lg mt-4"
          >
            {saving ? "Enviando…" : "Confirmar voto"}
          </button>
        )}

        {alreadyVoted && (
          <p className="alert alert-success mt-4" role="status">
            Voto guardado ✅ Esperá al resto y mirá el bracket.
          </p>
        )}

        {error && (
          <p className="alert alert-danger mt-4" role="alert">
            {error}
          </p>
        )}

        {matches.length > 0 && (
          <div className="mt-8">
            <h2 className="h2">Bracket</h2>
            <div className="mt-3">
              <Bracket
                tallies={tallies}
                matches={matches}
                items={items}
                status={mundialito?.status}
                onMatchClick={(match) => {
                  if (match.status === "RESOLVED") setSelectedMatch(match);
                }}
              />
            </div>
          </div>
        )}

        {selectedMatch ? (
          <MatchDetailModal
            match={selectedMatch}
            items={items}
            participants={participants}
            votes={matchVotes}
            onClose={() => setSelectedMatch(null)}
          />
        ) : null}
      </section>
    );
  }

  // FINISHED: bracket completo con ganadores.
  return (
    <section>
      <p className="game-kicker">Resultados</p>
      <h1 className="h1 mt-2">{mundialito?.name ?? "Mundialito"}</h1>
      <p className="lead mt-2">
        El torneo terminó. Este es el bracket completo con los ganadores
        marcados.
      </p>

      <GameProgress current="results" />

      {finalRevealCountdown !== null ? (
        <div className="countdown-panel mt-6" role="status" aria-live="assertive">
          <div>
            <span className="countdown-number" key={finalRevealCountdown}>
              {finalRevealCountdown}
            </span>
            <p className="hint mt-2">Preparando los resultados de la final</p>
          </div>
        </div>
      ) : null}

      {finalRevealCountdown === null ? <div className="mt-6">
        <Bracket
          tallies={tallies}
          matches={matches}
          items={items}
          status={mundialito?.status}
          onMatchClick={setSelectedMatch}
        />
        </div> : null}

      {selectedMatch ? (
        <MatchDetailModal
          match={selectedMatch}
          items={items}
          participants={participants}
          votes={matchVotes}
          onClose={() => setSelectedMatch(null)}
        />
      ) : null}
    </section>
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
    <div className="card card-pad">
      <p className="h3">
        Ya se sumaron {joined.length}{" "}
        {joined.length === 1 ? "participante" : "participantes"}
      </p>
      <p className="hint mt-1">
        {joined.map((p) => p.display_name).join(", ")}.
      </p>
    </div>
  );
}

function MatchDetailModal({
  match,
  items,
  participants,
  votes,
  onClose,
}: {
  match: Match;
  items: Item[];
  participants: Participant[];
  votes: MatchVote[];
  onClose: () => void;
}) {
  const itemName = (itemId: string | null): string =>
    items.find((item) => item.id === itemId)?.name ?? "Ítem";
  const participantName = (participantId: string): string =>
    participants.find((participant) => participant.id === participantId)
      ?.display_name ?? "Participante";
  const participantAvatar = (participantId: string): string =>
    participants.find((participant) => participant.id === participantId)
      ?.avatar || avatarForName(participantName(participantId));
  const finalRoundVotes = votes.filter(
    (vote) => vote.match_id === match.id && vote.vote_round === match.vote_round,
  );
  const votesFor = (itemId: string | null) =>
    finalRoundVotes.filter((vote) => vote.chosen_item_id === itemId);

  return (
    <div className="match-detail-backdrop" role="presentation" onClick={onClose}>
      <section
        className="match-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="game-kicker">Resultado del cruce</p>
            <h2 id="match-detail-title" className="h2 mt-1">
              {itemName(match.winner_item_id)} avanza
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Cerrar detalle del cruce"
          >
            Cerrar
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {[match.item_a_id, match.item_b_id].map((itemId) => {
            const itemVotes = votesFor(itemId);

            return (
              <div key={itemId}>
                <p className="font-semibold text-fg">{itemName(itemId)}</p>
                <ul className="mt-2">
                  {itemVotes.length > 0 ? (
                    itemVotes.map((vote) => (
                      <li key={vote.participant_id} className="match-vote-row">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="identity-avatar" aria-hidden="true">
                            {participantAvatar(vote.participant_id)}
                          </span>
                          <span className="truncate">
                            {participantName(vote.participant_id)}
                          </span>
                        </span>
                        <span className="pill pill-neutral">Votó</span>
                      </li>
                    ))
                  ) : (
                    <li className="hint mt-2">Sin votos visibles.</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function GameProgress({ current }: { current: "join" | "play" | "results" }) {
  return (
    <div className="game-progress mt-5" aria-label="Progreso del torneo">
      <span
        className="game-progress-step"
        data-active={current === "join"}
        data-complete={current !== "join"}
      >
        Inscripción
      </span>
      <span
        className="game-progress-step"
        data-complete={current !== "join"}
      >
        Sorteo
      </span>
      <span
        className="game-progress-step"
        data-active={current === "play"}
        data-complete={current === "results"}
      >
        Cruces
      </span>
      <span
        className="game-progress-step"
        data-active={current === "results"}
      >
        Resultados
      </span>
    </div>
  );
}
