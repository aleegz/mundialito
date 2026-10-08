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
 */
export function VoteModeSwitch({ mundialitoId }: { mundialitoId: string }) {
  const [mode, setMode] = useState<"RANKING" | "CRUCES" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isUuid(mundialitoId)) {
        return; // los clients internos ya resuelven notfound.
      }

      const supabase = createClient();
      const { data } = await supabase
        .from("mundialitos")
        .select("mode")
        .eq("id", mundialitoId)
        .maybeSingle();

      if (cancelled) return;
      if (!data) return; // notfound lo maneja el client elegido.

      setMode(data.mode === "CRUCES" ? "CRUCES" : "RANKING");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [mundialitoId]);

  if (mode === null) {
    return <p>Cargando…</p>;
  }

  if (mode === "CRUCES") {
    return <CrucesVoteClient mundialitoId={mundialitoId} />;
  }

  return <VoteClient mundialitoId={mundialitoId} />;
}