import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";
import { validateParticipantName } from "@/lib/validation/participant-name";
import {
  isKnownAvatar,
  randomIdentity,
} from "@/lib/ui/random-identity";

type RequestBody = {
  mundialitoId?: unknown;
  name?: unknown;
  avatar?: unknown;
};

/**
 * Auto-registro (name: string): link abierto, sin sesion. El server
 * crea la fila y devuelve el participantId que el cliente guarda en
 * localStorage (identidad del votante).
 *
 * El roster masivo (names[]) que vivia aca quedo sin caller cuando #4
 * saco el alta manual de participantes; se termino de borrar en #39.
 *
 * El server (y no el browser) muta Supabase: mismo criterio que el
 * resto de las API routes.
 */

/**
 * Mapea errores de PostgREST del auto-registro a respuestas limpias
 * en espanol. Nunca se filtra error.message crudo: RLS no es UX.
 */
function mapSelfRegisterError(code: string | undefined): {
  error: string;
  status: number;
} {
  if (code === "42501") {
    // RLS rechazo la policy (mundo no ACTIVE).
    return {
      error: "No podés registrarte en este Mundialito.",
      status: 403,
    };
  }

  if (code === "23503") {
    // FK: el mundialito no existe (no debería pasar tras el pre-check).
    return { error: "Mundialito inválido.", status: 403 };
  }

  return { error: "No se pudo registrar tu nombre.", status: 400 };
}

/**
 * Endpoint separado del Server Component porque el form necesita feedback
 * inmediato (loading / error) sin navegacion. El Server Component solo
 * puede mutar via form action, que siempre provoca navegacion.
 */
export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const { mundialitoId, name, avatar } = body;

  if (typeof mundialitoId !== "string" || !mundialitoId) {
    return NextResponse.json(
      { error: "Falta mundialitoId." },
      { status: 400 },
    );
  }

  if (!isUuid(mundialitoId)) {
    return NextResponse.json(
      { error: "mundialitoId invalido." },
      { status: 400 },
    );
  }

  // ---------------------------------------------------------------
  // Auto-registro (link abierto): un nombre, sin sesion.
  // La identidad sugerida no se repite dentro del Mundialito. Si alguien
  // escribe un nombre ya usado, se reemplaza por una identidad disponible.
  // ---------------------------------------------------------------
  if (name !== undefined) {
    const validated = validateParticipantName(name);

    if (!validated.ok) {
      return NextResponse.json(
        {
          error:
            validated.reason === "too-long"
              ? "El nombre es demasiado largo."
              : "El nombre es obligatorio.",
        },
        { status: 400 },
      );
    }

    const displayName = validated.value;

    const supabase = await createClient();

    /**
     * Chequeo de estado ANTES del insert: RLS es el backstop, no la
     * UX. Sin distincion "DRAFT vs inexistente" para anon: RLS
     * esconde el DRAFT y su existencia no se expone (mismo criterio
     * que /api/votes). El owner si puede leer su DRAFT y recibe un
     * 409 claro.
     */
    const { data: mundialito, error: statusError } = await supabase
      .from("mundialitos")
      .select("status, mode")
      .eq("id", mundialitoId)
      .maybeSingle();

    if (statusError) {
      return NextResponse.json(
        { error: "No se pudo validar el registro." },
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
        { error: "La votación ya finalizó. No se pueden registrar más votantes." },
        { status: 409 },
      );
    }

    // RANKING admite self-registration en ACTIVE; CRUCES en
    // PARTICIPANTS_OPEN (la inscripcion se cierra antes de sortear).
    // Los demas estados -> 409 con el mensaje del modo.
    if (mundialito.status !== "ACTIVE" && mundialito.status !== "PARTICIPANTS_OPEN") {
      return NextResponse.json(
        {
          error:
            mundialito.mode === "CRUCES"
              ? "La inscripción está cerrada."
              : "La votación aún no comenzó.",
        },
        { status: 409 },
      );
    }

    /**
     * auth_user_id se OMITE del payload: queda en su default NULL.
     * Es deliberado (y documentado en 003): el rol anon solo tiene
     * INSERT sobre (mundialito_id, display_name); incluir
     * auth_user_id aca romperia con "permission denied for column".
     */
    const requestedAvatar =
      typeof avatar === "string" && isKnownAvatar(avatar) ? avatar : null;
    const { data: existingParticipants, error: participantsError } =
      await supabase
        .from("participants")
        .select("display_name, avatar")
        .eq("mundialito_id", mundialitoId);

    if (participantsError) {
      return NextResponse.json(
        { error: "No se pudo preparar tu identidad." },
        { status: 400 },
      );
    }

    const usedNames = new Set(
      (existingParticipants ?? []).map((participant) =>
        participant.display_name.trim().toLocaleLowerCase(),
      ),
    );
    const usedAvatars = new Set(
      (existingParticipants ?? []).map((participant) => participant.avatar),
    );

    let identity = {
      name: displayName,
      avatar: requestedAvatar ?? randomIdentity().avatar,
    };
    let attempts = 0;

    while (
      (usedNames.has(identity.name.toLocaleLowerCase()) ||
        usedAvatars.has(identity.avatar)) &&
      attempts < 100
    ) {
      identity = randomIdentity();
      attempts += 1;
    }

    if (
      usedNames.has(identity.name.toLocaleLowerCase()) ||
      usedAvatars.has(identity.avatar)
    ) {
      return NextResponse.json(
        { error: "No quedan identidades disponibles en este Mundialito." },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("participants")
      .insert({
        mundialito_id: mundialitoId,
        display_name: identity.name,
        avatar: identity.avatar,
      })
      .select("id, display_name, avatar")
      .maybeSingle();

    if (error) {
      const mapped = mapSelfRegisterError(error.code);
      return NextResponse.json(
        { error: mapped.error },
        { status: mapped.status },
      );
    }

    if (!data) {
      // 0 filas sin error: RLS filtro el insert (backstop).
      return NextResponse.json(
        { error: "No podés registrarte en este Mundialito." },
        { status: 403 },
      );
    }

    return NextResponse.json({
      participant: {
        id: data.id,
        display_name: data.display_name,
        avatar: data.avatar,
      },
    });
  }

  // Sin `name` no hay nada que registrar: el roster masivo (names[]) se
  // fue con el alta manual de participantes (#4) y se termino de borrar
  // aca (#39). 400 explicito en vez de caer en una rama muerta.
  return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });
}
