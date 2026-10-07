import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  async function login(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    });

    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }

    // Redirigir dentro de la Server Action es obligatorio: si la action
    // retorna sin redirect, Next re-renderiza la pagina actual y el proxy
    // puede responder con un redirect en lugar de un payload RSC, lo que
    // rompe el form con "An unexpected response was received".
    redirect("/");
  }

  const { error: errorMessage } = await searchParams;

  return (
    <main
      style={{
        padding: "2rem",
        maxWidth: 400,
        margin: "0 auto",
        fontFamily: "system-ui",
      }}
    >
      <h1>🏆 Mundialito</h1>
      <p>Ingresá para crear o participar de un mundialito.</p>

      <form action={login} style={{ display: "grid", gap: "1rem" }}>
        <input
          name="email"
          type="email"
          placeholder="Email"
          autoComplete="email"
          required
          style={inputStyle}
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          required
          style={inputStyle}
        />
        <button type="submit" style={buttonStyle}>
          Entrar
        </button>
      </form>

      {errorMessage && (
        <p style={{ color: "crimson", marginTop: "1rem" }}>{errorMessage}</p>
      )}

      <p style={{ marginTop: "1rem" }}>
        ¿No tenés cuenta? <Link href="/register">Registrate</Link>
      </p>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.75rem",
  border: "1px solid #ccc",
  borderRadius: "0.5rem",
  fontSize: "1rem",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.75rem",
  background: "black",
  color: "white",
  border: "none",
  borderRadius: "0.5rem",
  fontSize: "1rem",
  cursor: "pointer",
};