import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RequestBody = {
  mundialitoId?: unknown;
  names?: unknown;
};

/**
 * Crea items para un mundialito.
 *
 * INSERT ... RETURNING + RLS: las filas que la politica rechazo no aparecen
 * en el RETURNING, asi que la diferencia entre lo enviado y lo devuelto
 * informa cuantos se agregaron sin una consulta extra.
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

  const cleanNames = names
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 100);

  if (cleanNames.length === 0) {
    return NextResponse.json(
      { error: "No hay nombres validos." },
      { status: 400 },
    );
  }

  /**
   * No se envia description: en el MVP el owner define nombre e item.
   * description e imageUrl quedan para cuando la app tenga multimedia.
   */
  const { data, error } = await supabase
    .from("items")
    .insert(
      cleanNames.map((name) => ({
        mundialito_id: mundialitoId,
        name,
      })),
    )
    .select("id, name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const inserted = data?.length ?? 0;

  return NextResponse.json({
    inserted,
    skipped: cleanNames.length - inserted,
  });
}