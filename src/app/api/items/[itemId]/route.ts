import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Borra un item. Los votos asociados caen por ON DELETE CASCADE.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;

  if (!itemId) {
    return NextResponse.json({ error: "Falta itemId." }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { error } = await supabase.from("items").delete().eq("id", itemId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ deleted: true });
}