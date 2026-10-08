import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";

type PatchRequestBody = {
  displayName?: unknown;
};

const MAX_NAME_LENGTH = 100;

/**
 * Borra un participante.
 *
 * Los votos asociados caen por ON DELETE CASCADE (FK compuesta).
 * RLS bloquea el borrado si el usuario no es owner o el mundialito
 * no esta en DRAFT.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ participantId: string }> },
) {
  const { participantId } = await params;

  if (!participantId) {
    return NextResponse.json(
      { error: "Falta participantId." },
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

  /**
   * supabase-js no lanza error cuando RLS filtra 0 filas: el delete
   * "pasa" igual. Por eso pedimos las filas afectadas con .select() y
   * verificamos que realmente se haya borrado algo.
   * 0 filas = no existe o no hay permiso → 404 en ambos casos (no
   * revelar si la fila existe).
   */
  const { data, error } = await supabase
    .from("participants")
    .delete()
    .eq("id", participantId)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}

/**
 * Edita el display_name de un participante (auto-registro).
 *
 * "Propio" = posesion del participantId (localStorage del votante /
 * respuesta del POST de registro). Mismo modelo de confianza que los
 * votos: sin identidad anonima verificable en el MVP, RLS exige
 * mundialito ACTIVE + auth_user_id null y solo permite escribir
 * display_name (column grants de 003).
 *
 * Sin sesion obligatoria: el votante anonimo tambien puede renombrar
 * su fila mientras la votacion este abierta.
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

  let body: PatchRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const rawName = body.displayName;

  if (typeof rawName !== "string" || rawName.trim().length === 0) {
    return NextResponse.json(
      { error: "El nombre es obligatorio." },
      { status: 400 },
    );
  }

  const displayName = rawName.trim();

  if (displayName.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: "El nombre es demasiado largo." },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // Lectura = permiso de existencia (RLS decide): 0 filas = 404.
  const { data: participant, error: readError } = await supabase
    .from("participants")
    .select("id, mundialito_id")
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

  /**
   * Chequeo de estado ANTES del update: RLS es el backstop, no la
   * UX. Mismo criterio que /api/votes: sin distincion DRAFT vs
   * inexistente para anon (aunque aca el read de arriba ya filtra el
   * DRAFT anonimo con 404).
   */
  const { data: mundialito, error: statusError } = await supabase
    .from("mundialitos")
    .select("status")
    .eq("id", participant.mundialito_id)
    .maybeSingle();

  if (statusError) {
    return NextResponse.json(
      { error: "No se pudo validar el cambio de nombre." },
      { status: 400 },
    );
  }

  if (!mundialito) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  if (mundialito.status === "FINISHED") {
    return NextResponse.json(
      { error: "La votación ya finalizó. No se puede modificar el nombre." },
      { status: 409 },
    );
  }

  if (mundialito.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "La votación aún no comenzó." },
      { status: 409 },
    );
  }

  /**
   * supabase-js no lanza error cuando RLS filtra 0 filas: pedimos
   * las filas afectadas. 0 filas = no existe o no hay permiso →
   * 404 en ambos casos (no revelar si la fila existe).
   */
  const { data, error } = await supabase
    .from("participants")
    .update({ display_name: displayName })
    .eq("id", participantId)
    .select("id, display_name");

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "No tenés permiso para modificar este nombre." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "No se pudo actualizar el nombre." },
      { status: 400 },
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    updated: true,
    participant: { id: data[0].id, display_name: data[0].display_name },
  });
}

/**
 * Edita el display_name de un participante (auto-registro).
 *
 * "Propio" = posesion del participantId (localStorage del votante /
 * respuesta del POST de registro). Mismo modelo de confianza que los
 * votos: sin identidad anonima verificable en el MVP, RLS exige
 * mundialito ACTIVE + auth_user_id null y solo permite escribir
 * display_name (column grants de 003).
 *
 * Sin sesion obligatoria: el votante anonimo tambien puede renombrar
 * su fila mientras la votacion este abierta.
 */
