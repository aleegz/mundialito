import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";

type RequestBody = {
  mundialitoId?: unknown;
  names?: unknown;
  name?: unknown;
};

/**
 * Dos caminos en el mismo endpoint:
 *
 *  - Roster (names[]): owner en DRAFT, alta masiva. El contrato
 *    existente no cambia.
 *  - Auto-registro (name: string): link abierto, mundialito ACTIVE,
 *    sin sesion. El server crea la fila y devuelve el participantId
 *    que el cliente guarda en localStorage (identidad del votante).
 *
 * El server (y no el browser) muta Supabase: mismo criterio que el
 * resto de las API routes.
 */

const MAX_NAME_LENGTH = 100;

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

  const { mundialitoId, names, name } = body;

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
  // Nombres duplicados aceptados a proposito: dos "Juan" son dos
  // participantes distintos y cada uno vota lo suyo.
  // ---------------------------------------------------------------
  if (names === undefined && name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "El nombre es obligatorio." },
        { status: 400 },
      );
    }

    const displayName = name.trim();

    if (displayName.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: "El nombre es demasiado largo." },
        { status: 400 },
      );
    }

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
      .select("status")
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

    if (mundialito.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "La votación aún no comenzó." },
        { status: 409 },
      );
    }

    /**
     * auth_user_id se OMITE del payload: queda en su default NULL.
     * Es deliberado (y documentado en 003): el rol anon solo tiene
     * INSERT sobre (mundialito_id, display_name); incluir
     * auth_user_id aca romperia con "permission denied for column".
     */
    const { data, error } = await supabase
      .from("participants")
      .insert({ mundialito_id: mundialitoId, display_name: displayName })
      .select("id, display_name")
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
      participant: { id: data.id, display_name: data.display_name },
    });
  }

  // ---------------------------------------------------------------
  // Roster masivo (contrato existente): solo owner en DRAFT.
  // ---------------------------------------------------------------
  if (
    !Array.isArray(names) ||
    names.length === 0 ||
    !names.every((n): n is string => typeof n === "string")
  ) {
    return NextResponse.json(
      { error: "La lista de nombres es invalida." },
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
   * El roster es una operacion de estructura (DRAFT). RLS lo cubre
   * via participants_insert de 002, pero el auto-registro comparte
   * la misma policy de INSERT en ACTIVE (el DB no distingue "masivo"
   * de "individual"), asi que el contrato DRAFT-only se asegura
   * aca, con un error claro en vez de "inserted: 0".
   */
  const { data: mundialito, error: statusError } = await supabase
    .from("mundialitos")
    .select("status")
    .eq("id", mundialitoId)
    .maybeSingle();

  if (statusError) {
    return NextResponse.json(
      { error: "No se pudo validar la lista." },
      { status: 400 },
    );
  }

  if (!mundialito) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  if (mundialito.status !== "DRAFT") {
    return NextResponse.json(
      {
        error:
          "La lista de participantes solo se puede modificar mientras el Mundialito está en DRAFT.",
      },
      { status: 409 },
    );
  }

  const cleanNames = names.map((n) => n.trim()).filter(Boolean);

  if (cleanNames.length === 0) {
    return NextResponse.json(
      { error: "No hay nombres validos." },
      { status: 400 },
    );
  }

  /**
   * INSERT ... RETURNING filtra los que RLS rechazo.
   *
   * No es un chequeo de seguridad: RLS ya bloqueo lo que no podia insertar.
   * Solo_evitamos informa al usuario de cuantos se agregaron.
   */
  const { data, error } = await supabase
    .from("participants")
    .insert(
      cleanNames.map((display_name) => ({
        mundialito_id: mundialitoId,
        display_name,
        auth_user_id: null,
      })),
    )
    .select("id, display_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const inserted = data?.length ?? 0;

  return NextResponse.json({
    inserted,
    skipped: cleanNames.length - inserted,
  });
}
