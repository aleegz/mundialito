import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";

type ScoreInput = {
  itemId: string;
  score: number;
};

type RequestBody = {
  mundialitoId?: unknown;
  participantId?: unknown;
  scores?: unknown;
};

/**
 * Mapea errores de PostgREST a respuestas limpias en espanol.
 * Nunca se filtra error.message crudo: RLS/FC no son UX.
 */
function mapVoteWriteError(code: string | undefined): {
  error: string;
  status: number;
} {
  if (code === "42501") {
    // RLS rechazo la policy (mundo no ACTIVE o pertenencia invalida).
    return {
      error: "No tenés permiso para votar en este Mundialito.",
      status: 403,
    };
  }

  if (code === "23503") {
    // FK compuestas de 001: participante/item de otro mundialito.
    return {
      error: "El voto no corresponde a este Mundialito.",
      status: 403,
    };
  }

  if (code === "23514") {
    // CHECK de score (1..10). La validacion de arriba ya lo cubre.
    return { error: "Puntaje fuera de rango.", status: 400 };
  }

  return { error: "No se pudo registrar la votación.", status: 400 };
}

/**
 * Votacion completa de un participante: upsert masivo unico sobre
 * la PK compuesta (mundialito_id, participant_id, item_id).
 *
 * Submit y modificacion usan el MISMO endpoint porque el upsert
 * resuelve ambos casos en una sola sentencia atomica.
 */
export async function PUT(request: Request) {
  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const { mundialitoId, participantId, scores } = body;

  if (
    typeof mundialitoId !== "string" ||
    !mundialitoId ||
    !isUuid(mundialitoId)
  ) {
    return NextResponse.json(
      { error: "mundialitoId invalido." },
      { status: 400 },
    );
  }

  if (
    typeof participantId !== "string" ||
    !participantId ||
    !isUuid(participantId)
  ) {
    return NextResponse.json(
      { error: "participantId invalido." },
      { status: 400 },
    );
  }

  if (!Array.isArray(scores) || scores.length === 0) {
    return NextResponse.json(
      { error: "La votación está vacía." },
      { status: 400 },
    );
  }

  const cleanScores: ScoreInput[] = [];
  const seenItems = new Set<string>();

  for (const entry of scores as Array<{ itemId?: unknown; score?: unknown }>) {
    const itemId = entry?.itemId;
    const score = entry?.score;

    if (typeof itemId !== "string" || !isUuid(itemId)) {
      return NextResponse.json(
        { error: "Item invalido en la votación." },
        { status: 400 },
      );
    }

    if (seenItems.has(itemId)) {
      return NextResponse.json(
        { error: "Hay ítems repetidos en la votación." },
        { status: 400 },
      );
    }

    if (typeof score !== "number" || !Number.isInteger(score)) {
      return NextResponse.json(
        { error: "Cada puntaje debe ser un número entero del 1 al 10." },
        { status: 400 },
      );
    }

    if (score < 1 || score > 10) {
      return NextResponse.json(
        { error: "Cada puntaje debe estar entre 1 y 10." },
        { status: 400 },
      );
    }

    seenItems.add(itemId);
    cleanScores.push({ itemId, score });
  }

  const supabase = await createClient();

  /**
   * Chequeo de estado ANTES del upsert: RLS es el backstop, no la UX.
   * Si el mundialito no se puede leer (desconocido o DRAFT anonimo)
   * la respuesta es 404 — no se distingue a proposito: el DRAFT es
   * configuracion del owner y su existencia no se expone.
   */
  const { data: mundialito, error: statusError } = await supabase
    .from("mundialitos")
    .select("status")
    .eq("id", mundialitoId)
    .maybeSingle();

  if (statusError) {
    return NextResponse.json(
      { error: "No se pudo validar la votación." },
      { status: 400 },
    );
  }

  if (!mundialito) {
    return NextResponse.json(
      { error: "Mundialito no encontrado." },
      { status: 404 },
    );
  }

  if (mundialito.status === "FINISHED") {
    return NextResponse.json(
      { error: "La votación ya finalizó. No se pueden modificar los votos." },
      { status: 409 },
    );
  }

  if (mundialito.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "La votación aún no comenzó." },
      { status: 409 },
    );
  }

  const rows = cleanScores.map(({ itemId, score }) => ({
    mundialito_id: mundialitoId,
    participant_id: participantId,
    item_id: itemId,
    score,
  }));

  const { error: upsertError } = await supabase.from("votes").upsert(rows, {
    onConflict: "mundialito_id,participant_id,item_id",
  });

  if (upsertError) {
    const mapped = mapVoteWriteError(upsertError.code);
    return NextResponse.json(
      { error: mapped.error },
      { status: mapped.status },
    );
  }

  return NextResponse.json({ saved: rows.length });
}

/**
 * Votos existentes de un participante (prefill del ballot).
 * El filtrado por participante ocurre aca; el gateo de estado lo
 * hace RLS (lectura anonima solo en ACTIVE/FINISHED).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mundialitoId = searchParams.get("mundialitoId");
  const participantId = searchParams.get("participantId");

  if (!mundialitoId || !isUuid(mundialitoId)) {
    return NextResponse.json(
      { error: "mundialitoId invalido." },
      { status: 400 },
    );
  }

  if (!participantId || !isUuid(participantId)) {
    return NextResponse.json(
      { error: "participantId invalido." },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("votes")
    .select("item_id, score")
    .eq("mundialito_id", mundialitoId)
    .eq("participant_id", participantId);

  if (error) {
    return NextResponse.json(
      { error: "No se pudieron leer los votos." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    votes: (data ?? []).map((vote) => ({
      itemId: vote.item_id,
      score: vote.score,
    })),
  });
}
