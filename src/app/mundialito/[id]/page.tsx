import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { modeMeta, statusMeta, isRegistrationOpen } from "@/lib/ui/labels";
import { ParticipantsHint } from "./participants-hint";
import { DeleteParticipantButton } from "./delete-participant-button";
import { ToggleParticipantStatusButton } from "./toggle-participant-status-button";
import { ItemsSection } from "./items-section";
import { StatusActions } from "./status-actions";
import { CrucesActions } from "./cruces-actions";
import { Bracket } from "@/components/bracket";
import { EditMundialitoForm } from "./edit-mundialito-form";
import { ShareLinks } from "./share-links";
import { CopyShareCta } from "./copy-share-cta";
import { LiveRefresh } from "@/components/live-refresh";
import { matchTallies } from "@/lib/calculations/bracket";
import { avatarForName } from "@/lib/ui/random-identity";
import { CrucesVoteClient } from "@/app/vote/[mundialitoId]/cruces-vote-client";

type Params = Promise<{ id: string }>;

export const metadata: Metadata = { title: "Panel del torneo" };

export default async function MundialitoPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: mundialito } = await supabase
    .from("mundialitos")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!mundialito) notFound();

  const { data: participants } = await supabase
    .from("participants")
    .select("*")
    .eq("mundialito_id", id);

  const { data: items } = await supabase
    .from("items")
    .select("*")
    .eq("mundialito_id", id)
    .order("created_at", { ascending: true });

  // CRUCES: el bracket (matches) para el panel del owner y la vista.
  // Lectura publica en DRAWN/VOTING/FINISHED; 0 filas en pre-sorteo.
  const { data: matches } = await supabase
    .from("matches")
    .select("*")
    .eq("mundialito_id", id)
    .order("round", { ascending: true })
    .order("position", { ascending: true });

  const isOwner = mundialito.owner_id === user.id;
  const isCruces = mundialito.mode === "CRUCES";

  /**
   * El owner se anota como participante al crear el torneo, pero los
   * mundialitos viejos (creados antes de eso) no lo tienen: la pista de
   * DRAFT no puede afirmar algo que no es cierto.
   */
  const ownerJoined =
    participants?.some((p) => p.auth_user_id === user.id) ?? false;

  const openMatch = (matches ?? []).find((m) => m.status === "OPEN");
  const hasPendingNext = (matches ?? []).some(
    (m) => m.status === "PENDING" && m.item_a_id && m.item_b_id,
  );

  /**
   * #7/#10/#9 — datos en vivo del cruce:
   * - Los votos del torneo alimentan el tally del bracket. El owner lee
   *   todo (match_votes_select_owner), asi que el cruce OPEN entra.
   * - `matchTallies` deja afuera los cruces sin votos visibles y nunca
   *   inventa un 0: para anon esa ausencia ES el secreto del voto.
   * - El conteo de votantes sale de las mismas filas: el rol owner no
   *   necesita la RPC de 006, que es para la pantalla de voto (anon).
   */
  const { data: matchVotes } = isCruces
    ? await supabase
        .from("match_votes")
        .select("*")
        .eq("mundialito_id", id)
    : { data: null };
  const tallies = matchTallies(matches ?? [], matchVotes ?? []);
  const votedCount = openMatch
    ? (matchVotes ?? []).filter(
        (v) =>
          v.match_id === openMatch.id && v.vote_round === openMatch.vote_round,
      ).length
    : 0;
  const eligibleCount =
    participants?.filter((p) => p.status === "JOINED").length ?? 0;

  const status = statusMeta(mundialito.status);
  const mode = modeMeta(mundialito.mode);

  // CTA contextual segun estado (misma logica que antes, un solo bloque).
  const canVote =
    mundialito.status === "ACTIVE" || mundialito.status === "FINISHED";
  /**
   * CRUCES: "Ir a votar" SOLO cuando hay un cruce abierto ahora mismo.
   * Antes bastaba con `status === "VOTING"`, asi que entre rondas —sin
   * ningun cruce OPEN— el panel seguia invitando a votar (reporte del
   * 22/10: "le dice todo el tiempo 'Ir a votar', por mas que no haya
   * abierto el nuevo cruce"). `openMatch` es la unica senal de que hay
   * algo que votar.
   */
  const canVoteCruces =
    !isOwner && isCruces && mundialito.status === "VOTING" && !!openMatch;

  /**
   * #12: con la copa terminada, el CTA del owner deja de ser "Ver los
   * resultados" —ese link lleva al mismo bracket que ya esta abajo en el
   * panel— y pasa a ser compartir el link. Ocupa el mismo lugar.
   */
  const finishedCrucesOwner =
    isOwner && isCruces && mundialito.status === "FINISHED";

  return (
    <main className="flex-1 pb-16">
      <AppHeader email={user.email} />

      <div className="page-wide">
        {/* Refresco automatico (#7): Realtime empuja un refresh del
            server component ante cualquier cambio del torneo. Sin
            eventos (Realtime apagado o RLS que filtra), no pasa nada
            raro: la pantalla de voto sigue con su polling de 5s. */}
        <LiveRefresh mundialitoId={id} />

        <Link
          href="/"
          className="text-sm text-muted no-underline hover:text-fg"
        >
          ← Volver
        </Link>

        {/* Encabezado del torneo */}
        <header className="owner-header mt-6">
          <p className="eyebrow">{isOwner ? "Tu torneo" : "Torneo"}</p>
          <h1 className="h1 mt-2">{mundialito.name}</h1>

          {mundialito.description ? (
            <p className="lead mt-2 max-w-2xl">{mundialito.description}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`pill ${status.pill}`}>
              <span className="dot" aria-hidden="true" />
              {status.label}
            </span>
            <span className={`pill ${mode.pill}`}>{mode.label}</span>
            {!isOwner ? (
              <span className="pill pill-neutral">Sos invitado</span>
            ) : null}
          </div>
        </header>

        {/* Proximo paso: votar / ver resultados. Si el owner ya cerro la
            copa, el paso es compartirla (#12). */}
        {finishedCrucesOwner ? (
          <CopyShareCta mundialitoId={id} />
        ) : canVote || canVoteCruces ? (
          <Link
            href={`/vote/${id}`}
            className="owner-next card card-pad card-hover card-link mt-6 flex items-center justify-between gap-4"
          >
            <span>
              <span className="block font-semibold text-fg">
                {mundialito.status === "FINISHED"
                  ? "Ver los resultados"
                  : "Ir a votar"}
              </span>
              <span className="hint">
                {mundialito.status === "FINISHED"
                  ? "Ya está todo definido. Mirá cómo quedó."
                  : "La votación está abierta: entrá y dejá tu voto."}
              </span>
            </span>
            <span aria-hidden="true" className="text-brand">
              →
            </span>
          </Link>
        ) : null}

        {/* "Sumate vos también" ya no existe: el owner se anota como
            participante al crear el torneo. */}

        {/* Controles del organizador. El card lo pone cada componente:
            puede no haber ninguna accion (FINISHED) y entonces devuelve
            null, asi que envolverlo desde aca dejaba un card vacio. */}
        {isOwner && isCruces ? (
          <CrucesActions
            mundialitoId={id}
            status={mundialito.status}
            itemsCount={items?.length ?? 0}
            participantsCount={participants?.length ?? 0}
            votedCount={votedCount}
            eligibleCount={eligibleCount}
            openMatchId={openMatch?.id ?? null}
            hasPendingNext={hasPendingNext}
          />
        ) : null}

        {isOwner && !isCruces ? (
          <StatusActions mundialitoId={id} status={mundialito.status} />
        ) : null}

        {/* Edicion (solo en borrador) */}
        {isOwner && mundialito.status === "DRAFT" ? (
          <EditMundialitoForm
            mundialitoId={id}
            initialName={mundialito.name}
            initialDescription={mundialito.description ?? null}
            initialMode={mundialito.mode === "CRUCES" ? "CRUCES" : "RANKING"}
          />
        ) : null}

        {/* Compartir: SOLO mientras el link sirve de verdad (ver
            isRegistrationOpen). El link invita a sumarse, asi que
            mostrarlo cuando el anonimo todavia no puede entrar (DRAFT)
            o cuando ya no se suma nadie es ofrecer algo que no funciona
            (bug reportado en la prueba del 21/10). */}
        {isOwner && isRegistrationOpen(mundialito.status, mundialito.mode) ? (
          <ShareLinks mundialitoId={id} />
        ) : null}

        {/* En DRAFT no hay link que compartir, pero el owner igual quiere
            organizarse: se le dice POR QUE no esta y que hacer. Sin esto
            quedaba sin QR y sin explicacion. */}
        {isOwner &&
        mundialito.status === "DRAFT" &&
        (!isCruces || items?.length) ? (
          <section className="card card-pad mt-6" aria-label="Compartir">
            <h2 className="h3">Invitar a los participantes</h2>
            <p className="hint mt-1">
              {isCruces
                ? "Iniciá el torneo para abrir la inscripción. Cuando esté abierta, vas a poder compartir el link y el QR desde acá."
                : "Iniciá el torneo para añadir participantes. Cuando esté iniciado, vas a poder compartir el link y el QR desde acá."}
            </p>
          </section>
        ) : null}

        {/* Durante la votación el owner comparte la misma mesa de juego que
            los invitados: voto, contador y bracket en vivo. Las acciones
            para finalizar/avanzar quedan inmediatamente arriba. */}
        {isOwner &&
        isCruces &&
        (mundialito.status === "VOTING" || mundialito.status === "FINISHED") ? (
          <section className="mt-6" aria-label="Mesa de votación">
            <CrucesVoteClient mundialitoId={id} />
          </section>
        ) : null}

        {/* Bracket estático para los estados previos a la votación */}
        {isCruces &&
        (matches?.length ?? 0) > 0 &&
        (!isOwner ||
          (mundialito.status !== "VOTING" && mundialito.status !== "FINISHED")) ? (
          <section className="mt-6" aria-label="Bracket">
            <h2 className="h2">Bracket</h2>
            <div className="mt-4">
              <Bracket
                status={mundialito.status}
                matches={matches ?? []}
                items={items ?? []}
                tallies={tallies}
              />
            </div>
          </section>
        ) : null}

        {/* Participantes */}
        <section className="card card-pad mt-6" aria-label="Participantes">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="h3">Participantes</h2>
            <span className="hint">{participants?.length ?? 0}</span>
          </div>

          <div className="mt-4">
            <ParticipantsHint
              status={mundialito.status}
              mode={mundialito.mode}
              ownerJoined={ownerJoined}
            />
          </div>

          {participants?.length ? (
            <ul className="mt-2 divide-y divide-line">
              {participants.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="identity-avatar" aria-hidden="true">
                      {p.avatar || avatarForName(p.display_name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[0.9375rem] font-medium text-fg">
                        {p.display_name}
                      </span>
                      {!p.auth_user_id || p.status === "EXCLUDED" ? (
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          {!p.auth_user_id ? (
                            <span className="pill pill-neutral">Sin cuenta</span>
                          ) : null}
                          {p.status === "EXCLUDED" ? (
                            <span className="pill pill-danger">Excluido</span>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {isOwner && mundialito.status === "DRAFT" ? (
                      <DeleteParticipantButton
                        participantId={p.id}
                        displayName={p.display_name}
                      />
                    ) : null}

                    {isOwner &&
                    isCruces &&
                    mundialito.status !== "DRAFT" &&
                    mundialito.status !== "FINISHED" ? (
                      <ToggleParticipantStatusButton
                        participantId={p.id}
                        displayName={p.display_name}
                        currentStatus={p.status}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint mt-4">Todavía no hay participantes.</p>
          )}
        </section>

        {/* Items: el contador, la lista y el alta viven juntos en el
            cliente para que la fila optimista y el numero se muevan
            juntos (#40). */}
        <ItemsSection
          mundialitoId={id}
          items={(items ?? []).map(({ id: itemId, name, description }) => ({
            id: itemId,
            name,
            description,
          }))}
          canEdit={isOwner && mundialito.status === "DRAFT"}
        />
      </div>
    </main>
  );
}
