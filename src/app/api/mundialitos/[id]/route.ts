import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";

type PatchRequestBody = {
  status?: unknown;
};

type PutRequestBody = {
  name?: unknown;
  description?: unknown;
};

const TRANSITIONS = {
  ACTIVE: "DRAFT",
  FINISHED: "ACTIVE",
} as const;

/**
 * Transiciones de estado del Mundialito: DRAFT -> ACTIVE -> FINISHED.
 * Sin vuelta atras y sin saltos, solo owner.
 *
 * Se implemento como PATCH (y no Server Action) porque TODA la
 * mutacion de la pagina de detalle pasa hoy por API routes llamados
 * desde client components con router.refresh() (participants-form,
 * items-form, delete-*-button): un Server Action introduciria un
 * segundo estilo de mutacion en la misma pagina.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Id malformado = mismo 404 que un id inexistente (sin oraculo).
  if (!isUuid(id)) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  let body: PatchRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const { status: target } = body;

  if (target !== "ACTIVE" && target !== "FINISHED") {
    return NextResponse.json(
      { error: "Estado invalido. Solo ACTIVE o FINISHED." },
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

  const { data: mundialito, error: readError } = await supabase
    .from("mundialitos")
    .select("status, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json(
      { error: "No se pudo leer el Mundialito." },
      { status: 400 },
    );
  }

  // 0 filas = no existe o RLS no deja leerla -> mismo 404.
  if (!mundialito) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  // RLS ya filtra lectores no autorizados, pero un participante
  // autenticado puede leer: el cambio de estado es owner-only.
  if (mundialito.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Solo el owner puede cambiar el estado." },
      { status: 403 },
    );
  }

  const expectedFrom = TRANSITIONS[target];

  if (mundialito.status !== expectedFrom) {
    if (mundialito.status === target) {
      return NextResponse.json(
        { error: "El Mundialito ya está en ese estado." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: `Transición no permitida: ${mundialito.status} → ${target}.` },
      { status: 409 },
    );
  }

  // Iniciar exige al menos un participante y un item.
  if (target === "ACTIVE") {
    const [participantsResult, itemsResult] = await Promise.all([
      supabase
        .from("participants")
        .select("id", { count: "exact", head: true })
        .eq("mundialito_id", id),
      supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("mundialito_id", id),
    ]);

    if (participantsResult.error || itemsResult.error) {
      return NextResponse.json(
        { error: "No se pudo validar el estado del Mundialito." },
        { status: 400 },
      );
    }

    if (!participantsResult.count) {
      return NextResponse.json(
        {
          error:
            "No se puede iniciar la votación: no hay participantes. Agregá al menos uno.",
        },
        { status: 409 },
      );
    }

    if (!itemsResult.count) {
      return NextResponse.json(
        {
          error:
            "No se puede iniciar la votación: no hay ítems. Agregá al menos uno.",
        },
        { status: 409 },
      );
    }
  }

  /**
   * Update condicionado al estado origen (compare-and-swap): si otra
   * pestaña cambio el estado en el medio, 0 filas y 409 en vez de
   * pisar la transicion ajena.
   */
  const { data: updated, error: updateError } = await supabase
    .from("mundialitos")
    .update({ status: target })
    .eq("id", id)
    .eq("status", expectedFrom)
    .select("id");

  if (updateError) {
    if (updateError.code === "42501") {
      return NextResponse.json(
        { error: "No tenés permiso para cambiar el estado." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "No se pudo actualizar el estado." },
      { status: 400 },
    );
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "El estado del Mundialito cambió. Recargá la página." },
      { status: 409 },
    );
  }

  return NextResponse.json({ updated: true, status: target });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Id malformado = mismo 404 que un id inexistente (sin oraculo).
  if (!isUuid(id)) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  let body: PutRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
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
    .select("status, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json(
      { error: "No se pudo leer el Mundialito." },
      { status: 400 },
    );
  }

  // 0 filas = no existe o RLS no deja leerla -> mismo 404.
  if (!mundialito) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  // Solo el owner puede editar. Si no es owner -> 403.
  if (mundialito.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Solo el owner puede editar el Mundialito." },
      { status: 403 },
    );
  }

  // Solo se permite editar cuando esta en DRAFT.
  if (mundialito.status !== "DRAFT") {
    return NextResponse.json(
      {
        error: "Solo se puede editar el Mundialito mientras está en estado DRAFT.",
      },
      { status: 409 },
    );
  }

  const rawName = body.name;
  const rawDescription = body.description;

  // Validacion espejo de create: name requerido, trimmed no vacio, mismo maximo (100)
  if (typeof rawName !== "string") {
    return NextResponse.json(
      { error: "El nombre es obligatorio." },
      { status: 400 },
    );
  }

  const name = rawName.trim();
  if (name.length === 0) {
    return NextResponse.json(
      { error: "El nombre es obligatorio." },
      { status: 400 },
    );
  }

  if (name.length > 100) {
    return NextResponse.json(
      { error: "El nombre es demasiado largo." },
      { status: 400 },
    );
  }

  let description: string | null = null;
  if (rawDescription !== null && rawDescription !== undefined) {
    if (typeof rawDescription !== "string") {
      description = null;
    } else {
      const trimmed = rawDescription.trim();
      description = trimmed === "" ? null : trimmed;
    }
  }

  const { error: updateError } = await supabase
    .from("mundialitos")
    .update({ name, description })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (updateError) {
    if (updateError.code === "42501") {
      return NextResponse.json(
        { error: "No tenés permiso para editar el Mundialito." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "No se pudo actualizar el Mundialito." },
      { status: 400 },
    );
  }

  return NextResponse.json({ updated: true });
}
