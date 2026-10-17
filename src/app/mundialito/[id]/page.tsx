import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { modeMeta, statusMeta } from "@/lib/ui/labels";
import { ParticipantsHint } from "./participants-hint";
import { DeleteParticipantButton } from "./delete-participant-button";
import { ToggleParticipantStatusButton } from "./toggle-participant-status-button";
import { AddItemsForm } from "./items-form";
import { DeleteItemButton } from "./delete-item-button";
import { StatusActions } from "./status-actions";
import { CrucesActions } from "./cruces-actions";
import { Bracket } from "@/components/bracket";
import { EditMundialitoForm } from "./edit-mundialito-form";
import { ShareLinks } from "./share-links";

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

  const status = statusMeta(mundialito.status);
  const mode = modeMeta(mundialito.mode);

  // CTA contextual segun estado (misma logica que antes, un solo bloque).
  const canVote =
    mundialito.status === "ACTIVE" || mundialito.status === "FINISHED";
  const canVoteCruces = isCruces && mundialito.status === "VOTING";

  return (
    <main className="flex-1 pb-16">
      <AppHeader email={user.email} />

      <div className="page-wide">
        <Link
          href="/"
          className="text-sm text-muted no-underline hover:text-fg"
        >
          ← Volver
        </Link>

        {/* Encabezado del torneo */}
        <header className="mt-6">
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

        {/* Proximo paso: votar / ver resultados */}
        {canVote || canVoteCruces ? (
          <Link
            href={`/vote/${id}`}
            className="card card-pad card-hover card-link mt-6 flex items-center justify-between gap-4"
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

        {/* Compartir */}
        {isOwner &&
        (mundialito.status === "ACTIVE" ||
          (isCruces &&
            (mundialito.status === "PARTICIPANTS_OPEN" ||
              mundialito.status === "PARTICIPANTS_LOCKED" ||
              mundialito.status === "DRAWN" ||
              mundialito.status === "VOTING"))) ? (
          <ShareLinks mundialitoId={id} />
        ) : null}

        {/* Bracket (aparece a partir del sorteo) */}
        {isCruces && (matches?.length ?? 0) > 0 ? (
          <section className="mt-6" aria-label="Bracket">
            <h2 className="h2">Bracket</h2>
            <div className="mt-4">
              <Bracket
                status={mundialito.status}
                matches={matches ?? []}
                items={items ?? []}
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
                    <span className="avatar" aria-hidden="true">
                      {p.display_name.trim().charAt(0)}
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

        {/* Items */}
        <section className="card card-pad mt-6" aria-label="Items">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="h3">Ítems</h2>
            <span className="hint">{items?.length ?? 0}</span>
          </div>

          <div className="mt-4">
            <AddItemsForm
              mundialitoId={id}
              isDraft={mundialito.status === "DRAFT"}
            />
          </div>

          {items?.length ? (
            <ul className="mt-2 divide-y divide-line">
              {items.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[0.9375rem] font-medium text-fg">
                      {i.name}
                    </span>
                    {i.description ? (
                      <span className="hint">{i.description}</span>
                    ) : null}
                  </span>

                  {isOwner && mundialito.status === "DRAFT" ? (
                    <DeleteItemButton itemId={i.id} name={i.name} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint mt-4">Todavía no hay ítems.</p>
          )}
        </section>
      </div>
    </main>
  );
}
