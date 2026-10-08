import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AddParticipantsForm } from "./participants-form";
import { DeleteParticipantButton } from "./delete-participant-button";
import { ToggleParticipantStatusButton } from "./toggle-participant-status-button";
import { AddItemsForm } from "./items-form";
import { DeleteItemButton } from "./delete-item-button";
import { StatusActions } from "./status-actions";
import { CrucesActions } from "./cruces-actions";
import { BracketView } from "./bracket-view";
import { EditMundialitoForm } from "./edit-mundialito-form";
import { ShareLinks } from "./share-links";

type Params = Promise<{ id: string }>;

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

  const openMatch = (matches ?? []).find((m) => m.status === "OPEN");
  const hasPendingNext = (matches ?? []).some(
    (m) => m.status === "PENDING" && m.item_a_id && m.item_b_id,
  );

  return (
    <main style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>{mundialito.name}</h1>
      <p style={{ color: "#666" }}>
        Estado: <strong>{mundialito.status}</strong>
        {mundialito.mode === "CRUCES" && " · Modo: Eliminación directa"}
        {!isOwner && " (no sos owner)"}
      </p>

      {isOwner && isCruces && (
        <CrucesActions
          mundialitoId={id}
          status={mundialito.status}
          itemsCount={items?.length ?? 0}
          participantsCount={participants?.length ?? 0}
          openMatchId={openMatch?.id ?? null}
          hasPendingNext={hasPendingNext}
        />
      )}

      {isOwner && !isCruces && (
        <StatusActions mundialitoId={id} status={mundialito.status} />
      )}

      {(mundialito.status === "ACTIVE" || mundialito.status === "FINISHED") && (
        <p style={{ marginTop: "0.5rem" }}>
          <Link href={`/vote/${id}`}>
            {mundialito.status === "ACTIVE" ? "Ir a votar →" : "Ver resultados →"}
          </Link>
        </p>
      )}

      {isCruces && mundialito.status === "VOTING" && (
        <p style={{ marginTop: "0.5rem" }}>
          <Link href={`/vote/${id}`}>Ir a votar →</Link>
        </p>
      )}

      {isOwner && mundialito.status === "DRAFT" && (
        <EditMundialitoForm
          mundialitoId={id}
          initialName={mundialito.name}
          initialDescription={mundialito.description ?? null}
          initialMode={mundialito.mode === "CRUCES" ? "CRUCES" : "RANKING"}
        />
      )}

      {isCruces && (matches?.length ?? 0) > 0 && (
        <section style={{ marginTop: "2rem" }}>
          <h2>Bracket</h2>
          <BracketView
            status={mundialito.status}
            matches={matches ?? []}
            items={items ?? []}
          />
        </section>
      )}

      {isOwner &&
        (mundialito.status === "ACTIVE" ||
          (isCruces &&
            (mundialito.status === "PARTICIPANTS_OPEN" ||
              mundialito.status === "PARTICIPANTS_LOCKED" ||
              mundialito.status === "DRAWN" ||
              mundialito.status === "VOTING"))) && (
        <ShareLinks mundialitoId={id} />
      )}

      {mundialito.description && !isOwner && <p>{mundialito.description}</p>}

      <section style={{ marginTop: "2rem" }}>
        <h2>Participantes ({participants?.length ?? 0})</h2>

        <AddParticipantsForm
          mundialitoId={id}
          status={mundialito.status}
          mode={mundialito.mode}
        />

        {participants?.length ? (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {participants.map((p) => (
              <li
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid #eee",
                }}
              >
                <span>
                  {p.display_name}
                  {!p.auth_user_id && (
                    <small style={{ color: "#888" }}> (sin cuenta)</small>
                  )}
                  {p.status === "EXCLUDED" && (
                    <small style={{ color: "crimson" }}> (excluido)</small>
                  )}
                </span>

                <span style={{ display: "inline-flex", gap: "0.5rem" }}>
                  {isOwner && mundialito.status === "DRAFT" && (
                    <DeleteParticipantButton
                      participantId={p.id}
                      displayName={p.display_name}
                    />
                  )}

                  {isOwner &&
                    isCruces &&
                    mundialito.status !== "DRAFT" &&
                    mundialito.status !== "FINISHED" && (
                      <ToggleParticipantStatusButton
                        participantId={p.id}
                        displayName={p.display_name}
                        currentStatus={p.status}
                      />
                    )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "#888" }}>Todavía no hay participantes.</p>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Items ({items?.length ?? 0})</h2>

        <AddItemsForm
          mundialitoId={id}
          isDraft={mundialito.status === "DRAFT"}
        />

        {items?.length ? (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {items.map((i) => (
              <li
                key={i.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid #eee",
                }}
              >
                <span>
                  {i.name}
                  {i.description && (
                    <small style={{ color: "#888" }}> — {i.description}</small>
                  )}
                </span>

                {isOwner && mundialito.status === "DRAFT" && (
                  <DeleteItemButton itemId={i.id} name={i.name} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "#888" }}>Todavía no hay items.</p>
        )}
      </section>

      <p style={{ marginTop: "2rem" }}>
        <Link href="/">Volver</Link>
      </p>
    </main>
  );
}