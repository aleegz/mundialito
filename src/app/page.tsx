import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: mundialitos } = await supabase
    .from("mundialitos")
    .select("*")
    .order("created_at", { ascending: false });

  async function logout() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <h1>🏆 Mundialito</h1>
        <form action={logout}>
          <button type="submit">Salir</button>
        </form>
      </header>

      <p style={{ color: "#666" }}>Sesión: {user.email}</p>

      <section>
        <h2>Mis mundialitos</h2>

        {!mundialitos || mundialitos.length === 0 ? (
          <p style={{ color: "#888" }}>
            Todavía no creaste ningún mundialito.
          </p>
        ) : (
          <ul>
            {mundialitos.map((m) => (
              <li key={m.id}>
                <Link href={`/mundialito/${m.id}`}>{m.name}</Link>{" "}
                <small style={{ color: "#888" }}>({m.status})</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p style={{ marginTop: "2rem" }}>
        <Link href="/mundialito/nuevo">Crear un nuevo Mundialito</Link>
      </p>

      <p>
        <Link href="/rls-test">Ver test de RLS</Link>
      </p>
    </main>
  );
}