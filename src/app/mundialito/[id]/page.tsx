import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

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
        {participants?.length ? (
          <ul>
            {participants.map((p) => (
              <li key={p.id}>
                {p.display_name}
                {!p.auth_user_id && (
                  <small style={{ color: "#888" }}> (sin cuenta)</small>
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
        {items?.length ? (
          <ul>
            {items.map((i) => (
              <li key={i.id}>{i.name}</li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "#888" }}>Todavía no hay items.</p>
        )}
      </section>
    </main>
  );
}