"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Cierre de sesion. Vive en un modulo "use server" para poder
 * compartirlo entre pantallas (header de la home y del dashboard).
 *
 * Redirigir DENTRO de la action es obligatorio: si retorna sin
 * redirect, Next re-renderiza la pagina actual y el proxy puede
 * responder con un redirect en lugar de un payload RSC, rompiendo
 * el form con "An unexpected response was received".
 */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
