"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Coalescing: un mismo gesto del dueño (abrir un cruce, sortear,
 * bloquear inscripciones) mueve varias tablas en el mismo latido, y
 * refrescar una vez por evento haria un refetch por fila. Un solo
 * refresh para todo el lote alcanza: el server component trae todo.
 */
const DEBOUNCE_MS = 250;

/** Tablas que disparamos (todas filtradas por el mismo mundialito). */
const LIVE_TABLES = [
  { table: "mundialitos", column: "id" },
  { table: "participants", column: "mundialito_id" },
  { table: "items", column: "mundialito_id" },
  { table: "matches", column: "mundialito_id" },
  { table: "match_votes", column: "mundialito_id" },
] as const;

/**
 * Refresco automatico por Supabase Realtime (#7).
 *
 * Suscribe las cinco tablas del torneo en UN solo canal y, ante cualquier
 * evento, llama `onEvent` (debounced). Realtime respeta RLS: cada
 * suscriptor recibe solo las filas que su rol puede leer — anon no ve
 * match_votes mientras el cruce esta OPEN (secreto del voto), asi que
 * para eso sigue estando el polling de 5s de la pantalla de voto.
 *
 * No es un reemplazo del polling: es una mejora sobre el. Si el proyecto
 * no tiene Realtime habilitado o el canal se cae, no llega ningun evento
 * y el polling de 5s sigue siendo el piso de seguridad. Sin error
 * visible y sin estado de conexion: degradar en silencio es el contrato.
 */
export function useLiveRefresh(
  mundialitoId: string,
  onEvent?: () => void,
): void {
  // El callback cambia de identidad en cada render (el polling pasa su
  // refreshWorld); la suscripcion se hace UNA sola vez y se le pasa la
  // version vigente via ref.
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!mundialitoId) return;

    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let hiddenDirty = false;

    const flush = () => {
      hiddenDirty = false;
      onEventRef.current?.();
    };

    const schedule = () => {
      // Misma regla que el polling: con la pestana oculta no se
      // refresca. Se anota el pendiente y se saltea.
      if (document.hidden) {
        hiddenDirty = true;
        return;
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, DEBOUNCE_MS);
    };

    const onVisibility = () => {
      if (document.hidden || !hiddenDirty) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
    };

    // Un solo canal para las cinco tablas: mismo socket, mismo join.
    const channel = supabase.channel(`live-refresh:${mundialitoId}`);
    for (const { table, column } of LIVE_TABLES) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `${column}=eq.${mundialitoId}`,
        },
        schedule,
      );
    }
    channel.subscribe();

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [mundialitoId]);
}

/**
 * LiveRefresh para componentes de servidor (el panel del owner):
 * no tiene callback propio, asi que refresca la ruta con router.refresh()
 * y el server component vuelve a traer todo.
 */
export function LiveRefresh({ mundialitoId }: { mundialitoId: string }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  useLiveRefresh(mundialitoId, refresh);

  return null;
}
