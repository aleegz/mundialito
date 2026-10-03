import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AddParticipantsForm } from "./participants-form";
import { DeleteParticipantButton } from "./delete-participant-button";

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

  const isOwner = mundialito.owner_id === user.id;

  return (
    <main style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>{mundialito.name}</h1>
      <p style={{ color: "#666" }}>
        Estado: <strong>{mundialito.status}</strong>
        {!isOwner && " (no sos owner)"}
      </p>
      {mundialito.description && <p>{mundialito.description}</p>}

      <section style={{ marginTop: "2rem" }}>
        <h2>Participantes ({participants?.length ?? 0})</h2>

        <AddParticipantsForm
          mundialitoId={id}
          isDraft={mundialito.status === "DRAFT"}
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
                </span>

                {isOwner && mundialito.status === "DRAFT" && (
                  <DeleteParticipantButton
                    participantId={p.id}
                    displayName={p.display_name}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "#888" }}>Todavía no hay participantes.</p>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Items ({items?.length ?? 0})</h2>
        <p style={{ color: "#888" }}>Proximamente.</p>
      </section>

      <p style={{ marginTop: "2rem" }}>
        <Link href="/">Volver</Link>
      </p>
    </main>
  );
}