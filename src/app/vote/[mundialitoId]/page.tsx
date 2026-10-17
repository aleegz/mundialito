import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";
import { VoteModeSwitch } from "./vote-mode-switch";

export const metadata: Metadata = { title: "Votar" };

type Params = Promise<{ mundialitoId: string }>;

/**
 * Superficie del votante (link abierto, Opcion A). El proxy no
 * protege /vote: solo /mundialito y /rls-test requieren sesion.
 * Toda la carga de datos pasa por el browser client anonimo.
 * El enrutador por modo (VoteModeSwitch) elige la superficie:
 * RANKING usa VoteClient; CRUCES usa CrucesVoteClient.
 *
 * Es la pantalla que se abre desde un QR en el celular: sin barra de
 * app, una sola columna y el CTA siempre al alcance del pulgar.
 *
 * Excepcion: si quien abre es el OWNER, arriba aparece un link para
 * volver a su dashboard (llega desde "Ir a votar"). El invitado del
 * QR no tiene a donde volver y sigue viendo la pantalla sin barra.
 */
export default async function VotePage({ params }: { params: Params }) {
  const { mundialitoId } = await params;
  const isOwner = await isOwnerViewing(mundialitoId);

  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full bg-brand-soft opacity-60 blur-3xl"
      />
      <main className="page relative z-10">
        {isOwner ? (
          <Link
            href={`/mundialito/${mundialitoId}`}
            className="text-sm text-muted no-underline hover:text-fg"
          >
            ← Volver al torneo
          </Link>
        ) : null}

        <VoteModeSwitch mundialitoId={mundialitoId} />
      </main>
    </div>
  );
}

/**
 * true solo si quien abre la pagina es el owner del mundialito.
 *
 * getSession() lee la cookie y no toca la red cuando no hay sesion,
 * asi que el votante anonimo del QR no paga nada. La lectura de
 * mundialitos queda filtrada por RLS (el que no es owner ni
 * participante no ve el DRAFT), y la decision es de presentacion:
 * ningun dato de la pantalla depende de esto.
 */
async function isOwnerViewing(mundialitoId: string): Promise<boolean> {
  if (!isUuid(mundialitoId)) return false;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return false;

  const { data } = await supabase
    .from("mundialitos")
    .select("owner_id")
    .eq("id", mundialitoId)
    .maybeSingle();

  return data?.owner_id === session.user.id;
}