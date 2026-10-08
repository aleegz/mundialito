import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";
import { isValidBracketSize } from "@/lib/calculations/bracket";

type PatchRequestBody = {
  status?: unknown;
};

type PutRequestBody = {
  name?: unknown;
  description?: unknown;
  mode?: unknown;
};

/**
 * Transiciones por modo. RANKING conserva exactamente el flujo
 * original (DRAFT -> ACTIVE -> FINISHED). CRUCES agrega la secuencia
 * de eliminacion directa; DRAWN y VOTING se alcanzan via POSTs
 * dedicados (draw/start) porque tienen efectos secundarios, no por
 * PATCH.
 */
const RANKING_TRANSITIONS = {
  ACTIVE: "DRAFT",
  FINISHED: "ACTIVE",
} as const;

const CRUCES_TRANSITIONS = {
  PARTICIPANTS_OPEN: "DRAFT",
  PARTICIPANTS_LOCKED: "PARTICIPANTS_OPEN",
} as const;

/**
 * Transiciones de estado del Mundialito segun el modo:
 * RANKING: DRAFT -> ACTIVE -> FINISHED. Sin vuelta atras y sin
 * saltos, solo owner.
 * CRUCES:  DRAFT -> PARTICIPANTS_OPEN -> PARTICIPANTS_LOCKED (luego
 * draw/start via POST).
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

  // Targets que el PATCH puede transicionar en ALGUN modo. La
  // validez per-mode se decide despues de leer el mundialito (un
  // CRUCES no acepta ACTIVE, un RANKING no acepta PARTICIPANTS_OPEN),
  // pero mandar algo fuera de esta lista es un error de cuerpo puro:
  // se rechaza ANTES de auth para no gastar una lectura. La lista es
  // igual para todos los mundialitos, no revela modo ni existencia.
  const KNOWN_TARGETS = [
    "ACTIVE",
    "FINISHED",
    "PARTICIPANTS_OPEN",
    "PARTICIPANTS_LOCKED",
  ] as const;

  if (
    typeof target !== "string" ||
    !KNOWN_TARGETS.includes(target as (typeof KNOWN_TARGETS)[number])
  ) {
    return NextResponse.json({ error: "Estado invalido." }, { status: 400 });
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

  // Un solo mapa de transiciones segun el modo. Los estados del otro
  // modo NO son targets validos para este mundialito (p.ej. mandar
  // ACTIVE a un CRUCES -> 400).
  const transitions =
    mundialito.mode === "CRUCES" ? CRUCES_TRANSITIONS : RANKING_TRANSITIONS;

  if (!(target in transitions)) {
    const allowed = Object.keys(transitions);
    return NextResponse.json(
      {
        error: `Estado invalido. Solo ${allowed.join(" o ")}.`,
      },
      { status: 400 },
    );
  }

  const expectedFrom = transitions[target as keyof typeof transitions];

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

  // Abrir inscripcion en CRUCES exige una cantidad de items valida
  // para eliminacion directa: 4, 8, 16 o 32. Sin ello el bracket no
  // existe (potencias exactas de 2 => cero byes). Idem para RANKING,
  // que exige al menos un item para iniciar.
  if (target === "PARTICIPANTS_OPEN") {
    const { count, error: itemsError } = await supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("mundialito_id", id);

    if (itemsError) {
      return NextResponse.json(
        { error: "No se pudo validar el estado del Mundialito." },
        { status: 400 },
      );
    }

    if (!isValidBracketSize(count ?? 0)) {
      return NextResponse.json(
        {
          error:
            "Para eliminar directo hacen falta 4, 8, 16 o 32 ítems.",
        },
        { status: 409 },
      );
    }
  }

  if (target === "ACTIVE") {
    const { count, error: itemsError } = await supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("mundialito_id", id);

    if (itemsError) {
      return NextResponse.json(
        { error: "No se pudo validar el estado del Mundialito." },
        { status: 400 },
      );
    }

    if (!count) {
      return NextResponse.json(
        {
          error:
            "No se puede iniciar la votación: no hay ítems. Agregá al menos uno.",
        },
        { status: 409 },
      );
    }
  }

  // Cerrar inscripcion en CRUCES exige al menos un participante: el
  // sorteo no tiene sentido con un roster vacio.
  if (target === "PARTICIPANTS_LOCKED") {
    const { count, error: participantsError } = await supabase
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("mundialito_id", id);

    if (participantsError) {
      return NextResponse.json(
        { error: "No se pudo validar el estado del Mundialito." },
        { status: 400 },
      );
    }

    if (!count) {
      return NextResponse.json(
        {
          error:
            "Necesitás al menos un participante para cerrar la inscripción.",
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
  const rawMode = body.mode;

  // El modo solo se puede cambiar mientras DRAFT. `undefined` = no se
  // envia (editar solo nombre/descripcion); null o cualquier otro
  // valor no valido -> 400. Mismo criterio espejo que name/description.
  let mode: "RANKING" | "CRUCES" | undefined;
  if (rawMode !== undefined) {
    if (rawMode !== "RANKING" && rawMode !== "CRUCES") {
      return NextResponse.json(
        { error: "Modo invalido. Solo RANKING o CRUCES." },
        { status: 400 },
      );
    }
    mode = rawMode;
  }

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

  const updates: { name: string; description: string | null; mode?: "RANKING" | "CRUCES" } = {
    name,
    description,
  };
  if (mode !== undefined) {
    updates.mode = mode;
  }

  const { error: updateError } = await supabase
    .from("mundialitos")
    .update(updates)
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
