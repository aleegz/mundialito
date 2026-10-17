import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = { title: "Crear cuenta" };

type SearchParams = Promise<{ error?: string; registro?: string }>;

/**
 * Minimo de password alineado con lo que Supabase Auth acepta por defecto
 * (6) con un margen de seguridad. Se valida tanto en el cliente
 * (minLength del input) como en el servidor.
 */
const MIN_PASSWORD_LENGTH = 8;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Un UNICO mensaje para todo fallo de signUp. Nunca se expone
 * error.message crudo: "User already registered" (o un
 * "contraseña débil" diferenciado) permite enumeración de cuentas —
 * un atacante distingue email existente de inexistente por el texto.
 * El formato de email/contraseña ya se valida arriba con mensajes
 * propios, así que este mensaje solo cubre fallos de Supabase.
 * TRADEOFF ACEPTADO: éxito vs. fallo del signUp en sí no se puede
 * ocultar sin confirmación de email; el mensaje, en cambio, no agrega
 * ningún oráculo extra.
 */
const SIGNUP_ERROR_MESSAGE =
  "No se pudo crear la cuenta. Revisá los datos o, si ya tenés una, iniciá sesión.";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  async function register(formData: FormData) {
    "use server";

    const email = ((formData.get("email") as string | null) ?? "").trim();
    const password = (formData.get("password") as string | null) ?? "";

    if (!EMAIL_REGEX.test(email)) {
      redirect(`/register?error=${encodeURIComponent("Ingresá un email válido.")}`);
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      redirect(
        `/register?error=${encodeURIComponent(
          `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
        )}`,
      );
    }

    const supabase = await createClient();

    /**
     * Defensa en profundidad del guard del proxy (TASKS 25): el proxy
     * solo redirige GET (redirigir un POST romperia la Server Action),
     * asi que un form en una pestaña vieja podria llegar aca logueado.
     * Un signUp en ese estado pisaria la sesion activa.
     */
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (currentUser) {
      redirect("/");
    }

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      redirect(`/register?error=${encodeURIComponent(SIGNUP_ERROR_MESSAGE)}`);
    }

    // Redirigir dentro de la Server Action es obligatorio: si la action
    // retorna sin redirect, Next re-renderiza la pagina actual y el proxy
    // puede responder con un redirect en lugar de un payload RSC, lo que
    // rompe el form con "An unexpected response was received".
    if (data.session) {
      // Confirmacion de email deshabilitada: la sesion ya esta creada.
      redirect("/");
    }

    // Sin sesion: Supabase quedo esperando la confirmacion por email.
    redirect("/register?registro=pendiente");
  }

  const { error: errorMessage, registro } = await searchParams;

  return (
    <AuthShell
      title="Creá tu cuenta"
      lead="En un minuto tenés tu primer torneo listo para compartir."
      footer={
        <>
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="font-medium text-brand no-underline">
            Entrá
          </Link>
        </>
      }
    >
      {errorMessage ? (
        <p className="alert alert-danger mb-5" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {registro === "pendiente" ? (
        <p className="alert alert-success mb-5" role="status">
          Te mandamos un email para confirmar tu cuenta. Revisá tu bandeja.
        </p>
      ) : null}

      <form action={register} className="space-y-4">
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
            placeholder="Creá una contraseña"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            aria-describedby="password-hint"
            className="input"
          />
          <p className="hint" id="password-hint">
            Mínimo {MIN_PASSWORD_LENGTH} caracteres.
          </p>
        </div>

        <button type="submit" className="btn btn-primary btn-block btn-lg">
          Crear cuenta
        </button>
      </form>
    </AuthShell>
  );
}
