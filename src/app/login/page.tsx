import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { AppVersion } from "@/components/app-version";

export const metadata: Metadata = { title: "Entrar" };

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
    <AuthShell
      title="Entrá a tu cuenta"
      lead="Organizá torneos, invitá a tus amigos y seguí los resultados en vivo."
      footer={
        <>
          <p>
            ¿Todavía no tenés cuenta?{" "}
            <Link
              href="/register"
              className="font-medium text-brand no-underline"
            >
              Creá una
            </Link>
          </p>
          <div className="mt-3">
            <AppVersion />
          </div>
        </>
      }
    >
      {errorMessage ? (
        <p className="alert alert-danger mb-5" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <form action={login} className="space-y-4">
        <div className="field">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="vos@ejemplo.com"
            autoComplete="email"
            required
            className="input"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Tu contraseña"
            autoComplete="current-password"
            required
            className="input"
          />
        </div>

        <button type="submit" className="btn btn-primary btn-block btn-lg">
          Entrar
        </button>
      </form>
    </AuthShell>
  );
}
