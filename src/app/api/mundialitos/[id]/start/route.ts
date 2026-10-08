import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";

/**
 * Inicio de la votacion (modo CRUCES): DRAWN -> VOTING.
 *
 * Owner-only. Abre el primer cruce (ronda 1, posicion 0) poniendolo
 * en OPEN. El resto queda PENDING y se abre con POST /next a medida
 * que cada cruce se finaliza.
 *
 * CAS sobre mundialitos.status = 'DRAWN' -> 'VOTING' (0 filas -> 409).
 * Unica puerta de entrada a VOTING: el draw re-chaza VOTING, asi que
 * el re-sorteo queda bloqueado estructuralmente a partir de aca.
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
      { error: "Solo el owner puede iniciar la votación." },
      { status: 403 },
    );
  }

  if (mundialito.mode !== "CRUCES") {
    return NextResponse.json(
      { error: "Este Mundialito no es de eliminación directa." },
      { status: 409 },
    );
  }

  if (mundialito.status !== "DRAWN") {
    if (mundialito.status === "VOTING") {
      return NextResponse.json(
        { error: "La votación ya está en curso." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "El Mundialito todavía no fue sorteado." },
      { status: 409 },
    );
  }

  const { data: firstMatch, error: matchError } = await supabase
    .from("matches")
    .select("id")
    .eq("mundialito_id", id)
    .eq("round", 1)
    .eq("position", 0)
    .maybeSingle();

  if (matchError) {
    return NextResponse.json(
      { error: "No se pudo leer el sorteo." },
      { status: 400 },
    );
  }

  // Sin bracket = sorteo no hecho o roto. Sin oraculo: mismo 409.
  if (!firstMatch) {
    return NextResponse.json(
      { error: "El Mundialito todavía no fue sorteado." },
      { status: 409 },
    );
  }

  // CAS del mundialito y apertura del primer cruce. Cada update es
  // idempotente; si la primera apertura quedo a medias, re-correr
  // converge (el match ya no esta PENDING -> 0 filas en el segundo
  // update, pero el estado mundialito ya avanzo).
  const { data: updatedWorld, error: worldError } = await supabase
    .from("mundialitos")
    .update({ status: "VOTING" })
    .eq("id", id)
    .eq("status", "DRAWN")
    .select("id");

  if (worldError || !updatedWorld || updatedWorld.length === 0) {
    // El mundialito ya estaba VOTING (segunda llamada): ok.
    const { data: already, error: recheckError } = await supabase
      .from("mundialitos")
      .select("status")
      .eq("id", id)
      .maybeSingle();

    if (!recheckError && already?.status === "VOTING") {
      return NextResponse.json({ started: true });
    }

    return NextResponse.json(
      { error: "El Mundialito cambió. Recargá la página." },
      { status: 409 },
    );
  }

  const { error: openError } = await supabase
    .from("matches")
    .update({ status: "OPEN" })
    .eq("id", firstMatch.id)
    .eq("status", "PENDING");

  if (openError) {
    // El sorteo se abrio pero el primer cruce no arranco:
    // inconsistencia que el reintento del owner resuelve (VOTING ya
    // persistido, /start re-abre el primer PENDING). Exponerla.
    return NextResponse.json(
      { error: "No se pudo abrir el primer cruce." },
      { status: 400 },
    );
  }

  return NextResponse.json({ started: true, matchId: firstMatch.id });
}