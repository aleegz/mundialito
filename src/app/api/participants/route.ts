import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RequestBody = {
  mundialitoId?: unknown;
  names?: unknown;
};

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

  const { mundialitoId, names } = body;

  if (typeof mundialitoId !== "string" || !mundialitoId) {
    return NextResponse.json(
      { error: "Falta mundialitoId." },
      { status: 400 },
    );
  }

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