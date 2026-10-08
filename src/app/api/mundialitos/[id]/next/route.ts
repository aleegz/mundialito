import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";
import { nextMatchToOpen, type MatchRow } from "@/lib/calculations/bracket";

/**
 * Apertura del siguiente cruce (modo CRUCES).
 *
 * Owner-only. Mientras la votacion esta VOTING, abre el proximo cruce
 * PENDING cuyos dos slots ya esten llenos (round asc, position asc) y
 * lo pone OPEN. Se invoca despues de finalizar el cruce actual:
 *
 *   finalize (RESOLVED + alimenta el parent) -> next (OPEN) -> ...
 *
 * Gate "no hay cruce abierto": el indice parcial
 * matches_one_open_per_mundialito hace IMPOSIBLE tener dos OPEN, pero
 * el CAS sobre status='PENDING' + esta lectura previa dan el 409
 * claro ("ya hay un cruce abierto") en vez de un error de constraint.
 *
 * Sin cruce candidato (ya se abrieron todos) -> 409: significa que el
 * bracket completo esta RESOLVED, lo que solo pasa si el mundialito
 * tambien quedo FINISHED en el ultimo finalize; el own panel recarga.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Id malformado = mismo 404 que un id inexistente (sin oraculo).
  if (!isUuid(id)) {
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

  const { data: mundialito, error: readError } = await supabase
    .from("mundialitos")
    .select("status, mode, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
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
      { error: "Solo el owner puede abrir cruces." },
      { status: 403 },
    );
  }

  if (mundialito.mode !== "CRUCES") {
    return NextResponse.json(
      { error: "Este Mundialito no es de eliminación directa." },
      { status: 409 },
    );
  }

  if (mundialito.status !== "VOTING") {
    if (mundialito.status === "FINISHED") {
      return NextResponse.json(
        { error: "El torneo ya finalizó." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "La votación todavía no comenzó." },
      { status: 409 },
    );
  }

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select("id, round, position, item_a_id, item_b_id, status")
    .eq("mundialito_id", id);

  if (matchesError) {
    return NextResponse.json(
      { error: "No se pudo leer el bracket." },
      { status: 400 },
    );
  }

  const matchRows = (matches ?? []) as MatchRow[];

  // Gate UX: si ya hay un OPEN, no hacer nada (y no depender del
  // 23505 del indice parcial para explicarse).
  const open = matchRows.find((m) => m.status === "OPEN");
  if (open) {
    return NextResponse.json(
      { error: "Ya hay un cruce abierto." },
      { status: 409 },
    );
  }

  const next = nextMatchToOpen(matchRows);

  if (!next) {
    return NextResponse.json(
      { error: "No hay más cruces por abrir." },
      { status: 409 },
    );
  }

  // CAS: PENDING -> OPEN. La fila elegida sale de la misma lectura;
  // si el bracket cambio en el medio (otra pestana), 0 filas -> 409.
  const { data: opened, error: openError } = await supabase
    .from("matches")
    .update({ status: "OPEN" })
    .eq("id", next.id)
    .eq("status", "PENDING")
    .select("id, vote_round")
    .maybeSingle();

  if (openError) {
    return NextResponse.json(
      { error: "No se pudo abrir el cruce." },
      { status: 400 },
    );
  }

  if (!opened) {
    return NextResponse.json(
      { error: "El bracket cambió. Recargá la página." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    matchId: opened.id,
    voteRound: opened.vote_round,
  });
}