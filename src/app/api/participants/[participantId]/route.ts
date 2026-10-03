import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase
    .from("participants")
    .delete()
    .eq("id", participantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ deleted: true });
}