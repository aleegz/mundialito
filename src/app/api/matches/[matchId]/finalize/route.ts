import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";
import {
  allActiveVoted,
  parentSlot,
  tallyMatch,
  type MatchRow,
  type MatchVoteRow,
} from "@/lib/calculations/bracket";

/**
 * Finalizacion de un cruce (modo CRUCES).
 *
 * Owner-only. Decide el ganador del cruce abierto:
 *
 *   - Gate: TODOS los participantes activos (status='JOINED') deben
 *     haber votado en la ronda actual -> si no, 409 con cuantos faltan
 *     (el owner panel listara quien falta; la exclusion es la salida
 *     para un registrado que nunca voto).
 *   - Empate (tie): NO inventa ganador. Sube matches.vote_round y
 *     deja el cruce OPEN -> la ronda nueva suma filas nuevas a
 *     match_votes (el historial de la ronda empatada queda intacto).
 *   - Decisivo: setea winner_item_id + status='RESOLVED' y alimenta
 *     el slot del padre (parentSlot). Si era la final, pasa el
 *     mundialito a FINISHED.
 *
 * CAS en cada update (matches.status OPEN->RESOLVED, vote_round,
 * mundialitos FINISHED): convergente en reintentos, y el indice
 * parcial matches_one_open_per_mundialito impide abrir dos cruces.
 * Tally cuenta SOLO participantes JOINED (un excluido durante la
 * ronda no bloquea ni cuenta su voto ya emitido).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;

  // Id malformado = mismo 404 que un id inexistente (sin oraculo).
  if (!isUuid(matchId)) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, mundialito_id, round, position, item_a_id, item_b_id, winner_item_id, status, vote_round",
    )
    .eq("id", matchId)
    .maybeSingle();

  if (matchError) {
    return NextResponse.json({ error: "No se pudo leer el cruce." }, { status: 400 });
  }

  if (!match) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  if (match.status !== "OPEN") {
    // RESOLVED: ya finalizado; si el siguiente avance tambien corrio,
    // re-ejecutar finalize no tiene efecto. Sin oraculo de existencia
    // del padre, el idempotente converge en el own panel.
    if (match.status === "RESOLVED") {
      return NextResponse.json({ already: true });
    }
    return NextResponse.json(
      { error: "Este cruce no está abierto." },
      { status: 409 },
    );
  }

  const { data: mundialito, error: worldError } = await supabase
    .from("mundialitos")
    .select("owner_id, status")
    .eq("id", match.mundialito_id)
    .maybeSingle();

  if (worldError) {
    return NextResponse.json(
      { error: "No se pudo leer el Mundialito." },
      { status: 400 },
    );
  }

  if (!mundialito) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  if (mundialito.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Solo el owner puede finalizar el cruce." },
      { status: 403 },
    );
  }

  // Participantes activos (JOINED) del mundialito: los EXCLUDED no
  // bloquean la finalizacion.
  const { data: activeRows, error: participantsError } = await supabase
    .from("participants")
    .select("id")
    .eq("mundialito_id", match.mundialito_id)
    .eq("status", "JOINED");

  if (participantsError) {
    return NextResponse.json(
      { error: "No se pudo leer la participación." },
      { status: 400 },
    );
  }

  const activeParticipantIds = (activeRows ?? []).map((p) => p.id);

  // Votos de la ronda actual. El owner lee todo (match_votes_select_owner).
  const { data: voteRows, error: votesError } = await supabase
    .from("match_votes")
    .select("participant_id, chosen_item_id, vote_round")
    .eq("match_id", matchId);

  if (votesError) {
    return NextResponse.json(
      { error: "No se pudo leer la votación." },
      { status: 400 },
    );
  }

  const votes = (voteRows ?? []) as MatchVoteRow[];

  if (!allActiveVoted(activeParticipantIds, votes, match.vote_round)) {
    const voted = new Set(
      votes
        .filter((v) => v.vote_round === match.vote_round)
        .map((v) => v.participant_id),
    );
    const missing = activeParticipantIds.filter((id) => !voted.has(id)).length;

    return NextResponse.json(
      {
        error: `Todavía no votaron todos: faltan ${missing}.`,
        missing,
      },
      { status: 409 },
    );
  }

  const tally = tallyMatch(votes, match as MatchRow);

  // Empate: sube la ronda y deja el cruce abierto para re-votar.
  // CAS sobre vote_round: si dos pestanas finalizaron, la segunda ve
  // 0 filas (vote_round ya subio) -> converge sin abrir doble ronda.
  if (tally.tie) {
    const { data: bumped, error: tieError } = await supabase
      .from("matches")
      .update({ vote_round: match.vote_round + 1 })
      .eq("id", matchId)
      .eq("status", "OPEN")
      .eq("vote_round", match.vote_round)
      .select("vote_round")
      .maybeSingle();

    if (tieError) {
      return NextResponse.json(
        { error: "No se pudo reiniciar la votación." },
        { status: 400 },
      );
    }

    if (!bumped) {
      return NextResponse.json(
        { error: "El cruce cambió. Recargá la página." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      tie: true,
      voteRound: bumped.vote_round,
      a: tally.a,
      b: tally.b,
    });
  }

  // Decisivo: resuelve el cruce con el ganador (CAS OPEN->RESOLVED).
  const { data: resolved, error: resolveError } = await supabase
    .from("matches")
    .update({ status: "RESOLVED", winner_item_id: tally.winnerItemId })
    .eq("id", matchId)
    .eq("status", "OPEN")
    .select("id")
    .maybeSingle();

  if (resolveError) {
    return NextResponse.json(
      { error: "No se pudo guardar el resultado." },
      { status: 400 },
    );
  }

  if (!resolved) {
    return NextResponse.json(
      { error: "El cruce cambió. Recargá la página." },
      { status: 409 },
    );
  }

  // ¿Era la final? El torneo con N items tiene roundsFor(N) rondas;
  // la final es el match unico de la ultima ronda. Como el bracket es
  // perfecto, "la final" == el match con el round mas alto. Calcular
  // el max round de todas las llaves del mundialito (lectura barata,
  // N <= 31).
  const { data: allMatches, error: allError } = await supabase
    .from("matches")
    .select("round, position")
    .eq("mundialito_id", match.mundialito_id);

  if (allError) {
    return NextResponse.json(
      { error: "No se pudo validar el bracket." },
      { status: 400 },
    );
  }

  const maxRound = (allMatches ?? []).reduce<number>(
    (max, m) => (m.round > max ? m.round : max),
    1,
  );
  const isFinal = match.round === maxRound && match.position === 0;

  if (isFinal) {
    const { data: finished, error: finishError } = await supabase
      .from("mundialitos")
      .update({ status: "FINISHED" })
      .eq("id", match.mundialito_id)
      .eq("status", "VOTING")
      .select("id")
      .maybeSingle();

    if (finishError) {
      return NextResponse.json(
        { error: "No se pudo cerrar el Mundialito." },
        { status: 400 },
      );
    }

    if (!finished) {
      // Ya FINISHED (convergencia en reintento): el winner ya quedo
      // persistido; responder ok en vez de 409.
      return NextResponse.json({
        winnerItemId: tally.winnerItemId,
        champion: true,
      });
    }

    return NextResponse.json({
      winnerItemId: tally.winnerItemId,
      champion: true,
    });
  }

  // Ronda intermedia: alimenta el slot del padre con el ganador.
  const parent = parentSlot(match.round, match.position);
  const parentUpdate =
    parent.slot === "a"
      ? { item_a_id: tally.winnerItemId }
      : { item_b_id: tally.winnerItemId };

  const { error: parentError } = await supabase
    .from("matches")
    .update(parentUpdate)
    .eq("mundialito_id", match.mundialito_id)
    .eq("round", parent.parentRound)
    .eq("position", parent.parentPosition);

  if (parentError) {
    return NextResponse.json(
      { error: "No se pudo avanzar el ganador." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    winnerItemId: tally.winnerItemId,
    champion: false,
    a: tally.a,
    b: tally.b,
  });
}