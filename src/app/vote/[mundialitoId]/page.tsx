import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";
import { VoteModeSwitch } from "./vote-mode-switch";

export const metadata: Metadata = { title: "Votar" };

type Params = Promise<{ mundialitoId: string }>;

/**
 * Superficie del votante (link abierto, Opcion A). El proxy no
 * protege /vote: solo /mundialito requiere sesion.
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
    <div className="game-page min-h-[100dvh]">
      <main className="page game-shell">
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
 * `getUser()` y no `getSession()`: en el SERVIDOR la sesion sale de una
 * cookie, y `getSession()` devuelve el objeto user tal cual viene de ahi,
 * sin verificar la firma. Supabase lo marca como inseguro para autorizar
 * (visto como warning en la consola durante los tests E2E). `getUser()`
 * valida el JWT contra Supabase Auth.
 *
 * El costo es una llamada a Auth por visita CON sesion (el owner); el
 * votante anonimo del QR no paga nada: sin cookie no hay round-trip.
 * Sigue siendo una decision de PRESENTACION —ningun dato de la pantalla
 * depende de esto y RLS filtra igual—: si el round-trip molesta, el paso
 * siguiente es resolver el link en el cliente, no volver a getSession().
 */
async function isOwnerViewing(mundialitoId: string): Promise<boolean> {
  if (!isUuid(mundialitoId)) return false;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabase
    .from("mundialitos")
    .select("owner_id")
    .eq("id", mundialitoId)
    .maybeSingle();

  return data?.owner_id === user.id;
}