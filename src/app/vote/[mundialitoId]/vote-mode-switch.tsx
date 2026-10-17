"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isUuid } from "@/lib/validation/uuid";
import { VoteClient } from "./vote-client";
import { CrucesVoteClient } from "./cruces-vote-client";

/**
 * Enrutador por modo para /vote/[mundialitoId]. El server component
 * no puede saber el modo (el link es abierto, sin sesion), asi que
 * este wrapper anonimo lee el mundialito y elige la superficie:
 *
 *   RANKING -> VoteClient (ballot 1-10 / resultados)
 *   CRUCES  -> CrucesVoteClient (bracket A/B)
 *
 * Tres estados explicitos: cargando / no existe / listo. Antes el caso
 * "no existe" dejaba `mode` en null y la pantalla quedaba en
 * "Cargando…" para siempre (un link viejo o mal copiado nunca
 * resolvia); ahora muestra un mensaje claro.
 */
type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; mode: "RANKING" | "CRUCES" };

export function VoteModeSwitch({ mundialitoId }: { mundialitoId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isUuid(mundialitoId)) {
        setState({ kind: "missing" });
        return;
      }

      const supabase = createClient();
      const { data } = await supabase
        .from("mundialitos")
        .select("mode")
        .eq("id", mundialitoId)
        .maybeSingle();

      if (cancelled) return;

      if (!data) {
        setState({ kind: "missing" });
        return;
      }

      setState({
        kind: "ready",
        mode: data.mode === "CRUCES" ? "CRUCES" : "RANKING",
      });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [mundialitoId]);

  if (state.kind === "loading") {
    return (
      <div className="card card-pad" role="status" aria-live="polite">
        <span className="sr-only">Preparando la votación…</span>
        <div className="animate-pulse space-y-4" aria-hidden="true">
          <div className="h-4 w-24 rounded-lg bg-sunken" />
          <div className="h-7 w-2/3 rounded-lg bg-sunken" />
          <div className="h-4 w-full rounded-lg bg-sunken" />
          <div className="h-11 w-full rounded-lg bg-sunken" />
          <div className="h-11 w-full rounded-lg bg-sunken" />
        </div>
      </div>
    );
  }

  if (state.kind === "missing") {
    return (
      <div className="empty">
        <span className="text-4xl" aria-hidden="true">
          🔍
        </span>
        <h1 className="h3 mt-2">No encontramos este torneo</h1>
        <p className="hint max-w-xs">
          Puede que el link esté mal copiado o que el torneo ya no exista.
          Pedile a quien te lo compartió que te lo mande de nuevo.
        </p>
      </div>
    );
  }

  if (state.mode === "CRUCES") {
    return <CrucesVoteClient mundialitoId={mundialitoId} />;
  }

  return <VoteClient mundialitoId={mundialitoId} />;
}
