import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";

type RequestBody = {
  status?: unknown;
};

/**
 * Excluir / re-incluir un participante (modo CRUCES).
 *
 * Solo owner. Cambia participants.status entre 'JOINED' y 'EXCLUDED'
 * durante el torneo (PARTICIPANTS_OPEN/LOCKED/DRAWN/VOTING — la
 * policy participants_update_owner_cruces es el backstop).
 *
 * Efectos:
 *   - EXCLUDED: deja de contar para el gate de finalizacion
 *     (allActiveVoted filtra por activos), aunque sus votos ya
 *     emitidos quedan en el tally. Usado cuando alguien se registro
 *     y nunca vota: el owner lo saca para poder cerrar el cruce.
 *   - JOINED: vuelve a contar y a poder votar.
 *
 * Los votos historicos nunca se borran (la PK de match_votes guarda
 * el historial completo; excluir no reescribe el pasado).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ participantId: string }> },
) {
  const { participantId } = await params;

  // Id malformado = mismo 404 que un id inexistente (sin oraculo).
  if (!isUuid(participantId)) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const rawStatus = body.status;

  if (rawStatus !== "EXCLUDED" && rawStatus !== "JOINED") {
    return NextResponse.json(
      { error: "Estado invalido. Solo EXCLUDED o JOINED." },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  // Lectura = permiso de existencia (RLS decide): 0 filas = 404.
  const { data: participant, error: readError } = await supabase
    .from("participants")
    .select("id, mundialito_id, status")
    .eq("id", participantId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json(
      { error: "No se pudo leer el participante." },
      { status: 400 },
    );
  }

  if (!participant) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  // Gate UX: no cambiar a un estado al que ya esta (idempotencia
  // explicita) y solo en CRUCES (RANKING no tiene exclusion).
  if (participant.status === rawStatus) {
    return NextResponse.json({ updated: false, status: participant.status });
  }

  const { data: mundialito, error: worldError } = await supabase
    .from("mundialitos")
    .select("mode, owner_id, status")
    .eq("id", participant.mundialito_id)
    .maybeSingle();

  if (worldError) {
    return NextResponse.json(
      { error: "No se pudo validar el Mundialito." },
      { status: 400 },
    );
  }

  if (!mundialito) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  if (mundialito.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Solo el owner puede excluir participantes." },
      { status: 403 },
    );
  }

  if (mundialito.mode !== "CRUCES") {
    return NextResponse.json(
      { error: "Este Mundialito no es de eliminación directa." },
      { status: 409 },
    );
  }

  if (
    mundialito.status !== "PARTICIPANTS_OPEN" &&
    mundialito.status !== "PARTICIPANTS_LOCKED" &&
    mundialito.status !== "DRAWN" &&
    mundialito.status !== "VOTING"
  ) {
    return NextResponse.json(
      { error: "La inscripción todavía no se puede modificar." },
      { status: 409 },
    );
  }

  // supabase-js no lanza error cuando RLS filtra 0 filas: pedimos las
  // filas afectadas. 0 filas = ya cambio en el medio -> 409.
  const { data, error } = await supabase
    .from("participants")
    .update({ status: rawStatus })
    .eq("id", participantId)
    .select("id, status");

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "No tenés permiso para modificar este participante." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "No se pudo actualizar el participante." },
      { status: 400 },
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "El participante cambió. Recargá la página." },
      { status: 409 },
    );
  }

  return NextResponse.json({ updated: true, status: data[0].status });
}