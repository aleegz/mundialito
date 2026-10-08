import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";
import {
  drawBracket,
  isValidBracketSize,
} from "@/lib/calculations/bracket";

/**
 * Sorteo del bracket (modo CRUCES).
 *
 * Owner-only. Crea (o RE-crea) las N-1 llaves del torneo:
 *   - PARTICIPANTS_LOCKED -> DRAWN  (primer sorteo)
 *   - DRAWN -> DRAWN                (re-sorteo, permitido SOLO antes
 *                                    del primer voto: VOTING -> 409)
 *
 * El re-sorteo borra las llaves existentes y vuelve a mezclar los
 * items. Cada llave se persiste con round/position (ronda 1 con
 * slots reales, rondas futuras con TBD null); los winners avanzan
 * via la API /finalize + /next, nunca aca.
 *
 * La inmutabilidad post-voto se apoya en el estado: VOTING solo se
 * alcanza con POST /start (devuelve 409 aca), asi que DRAWN -> DRAWN
 * es el unico camino de re-sorteo posible.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Id malformado = mismo 404 que un id inexistente (sin oraculo).
  if (!isUuid(id)) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
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

  if (mundialito.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Solo el owner puede sortear." },
      { status: 403 },
    );
  }

  // Solo modo CRUCES tiene bracket; RANKING no sabe qué es un sorteo.
  if (mundialito.mode !== "CRUCES") {
    return NextResponse.json(
      { error: "Este Mundialito no es de eliminación directa." },
      { status: 409 },
    );
  }

  // Barrera de inmutabilidad: tras el primer voto el bracket es fijo.
  if (mundialito.status === "VOTING" || mundialito.status === "FINISHED") {
    return NextResponse.json(
      { error: "El sorteo ya no se puede cambiar." },
      { status: 409 },
    );
  }

  if (mundialito.status !== "PARTICIPANTS_LOCKED" && mundialito.status !== "DRAWN") {
    return NextResponse.json(
      {
        error: "El sorteo solo se puede hacer con la inscripción cerrada.",
      },
      { status: 409 },
    );
  }

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id")
    .eq("mundialito_id", id);

  if (itemsError) {
    return NextResponse.json(
      { error: "No se pudieron leer los ítems." },
      { status: 400 },
    );
  }

  const itemIds = (items ?? []).map((item) => item.id);

  // Segunda validacion del minimo (la primera ocurre al abrir la
  // inscripcion en el PATCH): los items estan congelados fuera de
  // DRAFT por RLS, asi que el conteo no puede haber cambiado, pero
  // el servidor no confia en el estado que dice la UI.
  if (!isValidBracketSize(itemIds.length)) {
    return NextResponse.json(
      {
        error:
          "Para eliminar directo hacen falta 4, 8, 16 o 32 ítems.",
      },
      { status: 409 },
    );
  }

  const seeds = drawBracket(itemIds);

  /**
   * Re-sorteo: borrar las llaves previas. El CAS del mundialito
   * (status = expected) corre despues, pero ninguna llave puede
   * existir en un estado que no sea DRAWN (solo se crean aca), asi
   * que borrar en DRAWN es seguro e idempotente.
   */
  const { error: deleteError } = await supabase
    .from("matches")
    .delete()
    .eq("mundialito_id", id);

  if (deleteError) {
    if (deleteError.code === "42501") {
      return NextResponse.json(
        { error: "No tenés permiso para sortear." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "No se pudo limpiar el sorteo anterior." },
      { status: 400 },
    );
  }

  const rows = seeds.map((seed) => ({
    mundialito_id: id,
    round: seed.round,
    position: seed.position,
    item_a_id: seed.itemAId,
    item_b_id: seed.itemBId,
    status: "PENDING" as const,
    vote_round: 1,
  }));

  const { error: insertError } = await supabase.from("matches").insert(rows);

  if (insertError) {
    if (insertError.code === "42501") {
      return NextResponse.json(
        { error: "No tenés permiso para sortear." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "No se pudo crear el sorteo." },
      { status: 400 },
    );
  }

  // CAS: PARTICIPANTS_LOCKED -> DRAWN (o DRAWN -> DRAWN en re-sorteo).
  // Si otra pestana avanzo al medio, 0 filas y 409 en vez de pisar.
  const { data: updated, error: updateError } = await supabase
    .from("mundialitos")
    .update({ status: "DRAWN" })
    .eq("id", id)
    .eq("status", mundialito.status)
    .select("id");

  if (updateError || !updated || updated.length === 0) {
    return NextResponse.json(
      { error: "El Mundialito cambió. Recargá la página." },
      { status: 409 },
    );
  }

  return NextResponse.json({ drawn: true, matchCount: rows.length });
}