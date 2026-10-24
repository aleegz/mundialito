import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/** Fila minima del participante que ya tiene cuenta. */
export type OwnParticipant = {
  id: string;
  display_name: string;
  avatar: string;
  auth_user_id: string | null;
};

/**
 * Participante vinculado a la CUENTA que usa este navegador, o null si
 * no hay sesion / la cuenta no tiene fila en este mundialito.
 *
 * Existe por una razon concreta: el owner queda anotado como
 * participante al crear el torneo (`auth_user_id` = su id). Cuando abre
 * el link de votacion no hay que pedirle el nombre otra vez —pedirlo
 * crearia un participante DUPLICADO, porque el auto-registro anonimo no
 * puede reclamar una fila que ya tiene cuenta—.
 *
 * `getSession()` lee la cookie/localStorage: sin sesion no hay
 * round-trip y no se toca la base, asi que el votante anonimo del link
 * no paga nada. La consulta queda filtrada por RLS (solo ve filas de
 * mundiales que puede leer).
 */
export async function findOwnParticipant(
  supabase: SupabaseClient<Database>,
  mundialitoId: string,
): Promise<OwnParticipant | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const { data } = await supabase
    .from("participants")
    .select("id, display_name, avatar, auth_user_id")
    .eq("mundialito_id", mundialitoId)
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  return data ?? null;
}
