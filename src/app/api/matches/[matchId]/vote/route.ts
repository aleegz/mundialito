import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";

type RequestBody = {
  mundialitoId?: unknown;
  participantId?: unknown;
  chosenItemId?: unknown;
  voteRound?: unknown;
};

/**
 * Voto A/B en un cruce (modo CRUCES).
 *
 * Upsert sobre la PK compuesta (match_id, participant_id, vote_round):
 * el mismo participante puede MODIFICAR su voto mientras el cruce
 * siga abierto, y cada ronda de desempate suma una fila nueva.
 *
 * La policy de RLS (`match_votes_insert`/`match_votes_update` con el
 * helper can_vote_in_match) es el backstop: valida mundialito VOTING,
 * cruce OPEN con el MISMO vote_round, participante JOINED y eleccion
 * dentro de los dos slots. Un cliente stale de una ronda previa queda
 * rechazado en la base (409 aca).
 *
 * Secreto del voto: mientras el cruce esta OPEN nadie (ni el propio
 * votante) lee match_votes por RLS; la eleccion en curso vive en
 * localStorage (mundialito-cruce-vote:<id>:<matchId>:<round>).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;

  // Id malformado = mismo 404 que un id inexistente (sin oraculo).
  if (!isUuid(matchId)) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const { mundialitoId, participantId, chosenItemId, voteRound } = body;

  if (typeof mundialitoId !== "string" || !isUuid(mundialitoId)) {
    return NextResponse.json({ error: "Mundialito inválido." }, { status: 400 });
  }

  if (typeof participantId !== "string" || !isUuid(participantId)) {
    return NextResponse.json(
      { error: "Participante inválido." },
      { status: 400 },
    );
  }

  if (typeof chosenItemId !== "string" || !isUuid(chosenItemId)) {
    return NextResponse.json(
      { error: "Elección inválida." },
      { status: 400 },
    );
  }

  // La ronda llega del cliente (la cargo junto con el match); si no
  // viene, el server la resuelve leyendo el cruce (abajo).
  if (voteRound !== undefined && (typeof voteRound !== "number" || !Number.isInteger(voteRound) || voteRound < 1)) {
    return NextResponse.json(
      { error: "Ronda de voto inválida." },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // Lectura publica del cruce: alcanzable por anon en DRAWN/VOTING/
  // FINISHED (voto solo posible en VOTING, valida RLS). Con este
  // match el server resuelve la ronda actual si el cliente no la mando.
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, mundialito_id, vote_round, item_a_id, item_b_id, status")
    .eq("id", matchId)
    .maybeSingle();

  if (matchError) {
    return NextResponse.json({ error: "No se pudo leer el cruce." }, { status: 400 });
  }

  // Sin match = no existe o RLS (mundialito no publico) -> mismo 404.
  if (!match) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  // El match debe pertenecer al mundialito del body: sin esto, un
  // caller podria votar un cruce usando un mundialito de otro (RLS lo
  // rechazaria igual por can_vote_in_match, pero el error seria una
  // policy en vez de un 400 claro).
  if (match.mundialito_id !== mundialitoId) {
    return NextResponse.json(
      { error: "El cruce no pertenece a ese Mundialito." },
      { status: 400 },
    );
  }

  const round = voteRound ?? match.vote_round;

  // Voto via RPC SECURITY DEFINER (cast_match_vote, migracion 005):
  // hace el upsert como owner de la tabla. Un upsert con PostgREST
  // fallaria con 42501 aunque la fila se inserte bien: match_votes_
  // select_public NO deja ver votos mientras OPEN (secreto del voto)
  // y el RETURNING / resolucion de conflicto necesitan ver la fila.
  // El RPC devuelve solo un booleano; la validacion vive en
  // can_vote_in_match (misma logica que las policies insert/update).
  const { data: ok, error } = await supabase.rpc("cast_match_vote", {
    p_match_id: matchId,
    p_participant_id: participantId,
    p_chosen_item_id: chosenItemId,
    p_vote_round: round,
  });

  // RPC rechazado (false) o error: mismo 409 "recarga" que si la
  // votacion cambio en el medio (ronda vieja, cruce cerrado, etc.).
  if (error || !ok) {
    return NextResponse.json(
      { error: "La votación cambió. Recargá la página." },
      { status: 409 },
    );
  }

  return NextResponse.json({ saved: true, voteRound: round });
}