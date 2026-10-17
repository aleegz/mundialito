import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { MODE_DESCRIPTION } from "@/lib/ui/labels";
import { ownerDisplayName } from "@/lib/validation/participant-name";

export const metadata: Metadata = { title: "Nuevo torneo" };

type SearchParams = Promise<{ error?: string }>;

export default async function NewMundialitoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  async function createMundialito(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      redirect("/login");
    }

    const name = (formData.get("name") as string | null)?.trim() ?? "";
    const description =
      (formData.get("description") as string | null)?.trim() || null;
    const mode = formData.get("mode");

    /**
     * Validacion espejo de la DB (CHECK length(trim(name)) > 0).
     * La DB sigue siendo la fuente de verdad; esto solo evita un round-trip
     * con un error que el usuario puede resolver al instante.
     */
    if (name.length === 0) {
      redirect("/mundialito/new?error=El+nombre+es+obligatorio");
    }

    if (name.length > 100) {
      redirect("/mundialito/new?error=El+nombre+es+demasiado+largo");
    }

    // Mismo CHECK que la BD: solo dos modos. Cualquier otro valor
    // (include el default del HTML) cae en RANKING.
    const selectedMode = mode === "CRUCES" ? "CRUCES" : "RANKING";

    const { data, error } = await supabase
      .from("mundialitos")
      .insert({
        name,
        description,
        mode: selectedMode,
        owner_id: user.id,
      })
      .select()
      .single();

    if (error || !data) {
      redirect(
        `/mundialito/new?error=${encodeURIComponent(error?.message ?? "Error desconocido")}`,
      );
    }

    /**
     * El owner queda anotado al crear el torneo (no se le pregunta):
     * compite sin tener que "sumarse" por el link y la lista de
     * participantes arranca con el. RLS lo permite sin migracion:
     * participants_insert de 002 autoriza al owner en DRAFT y no
     * restringe auth_user_id.
     */
    const { error: participantError } = await supabase
      .from("participants")
      .insert({
        mundialito_id: data.id,
        display_name: ownerDisplayName({
          fullName: user.user_metadata?.full_name,
          email: user.email,
        }),
        auth_user_id: user.id,
      });

    if (participantError) {
      /**
       * El torneo ya existe: no se aborta la creacion por esto (peor
       * seria dejarlo a medias y que lo cree dos veces). Queda el
       * fallback del link de votacion, donde la identidad por cuenta no
       * lo encuentra y se registra con su nombre. Se loguea para que no
       * sea una falla invisible.
       */
      console.error(
        "No se pudo anotar al owner como participante:",
        participantError.message,
      );
    }

    redirect(`/mundialito/${data.id}`);
  }

  const { error: errorMessage } = await searchParams;

  return (
    <main className="flex-1 pb-16">
      <AppHeader />

      <div className="page max-w-[34rem]">
        <Link
          href="/"
          className="text-sm text-muted no-underline hover:text-fg"
        >
          ← Volver
        </Link>

        <p className="eyebrow mt-6">Nuevo torneo</p>
        <h1 className="h1 mt-2">Creá tu mundialito</h1>
        <p className="lead mt-2">
          Empezá por el nombre y el modo: los ítems vienen después, y los
          participantes se suman solos desde el link.
        </p>

        {errorMessage ? (
          <p className="alert alert-danger mt-6" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <form action={createMundialito} className="card card-pad mt-6 space-y-5">
          <div className="field">
            <label className="label" htmlFor="name">
              Nombre
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Mundialito de alfajores"
              maxLength={100}
              required
              autoFocus
              className="input"
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="description">
              Descripción{" "}
              <span className="font-normal text-subtle">(opcional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              placeholder="El mejor alfajor del barrio"
              rows={3}
              className="textarea"
            />
            <p className="hint">
              Una línea para que tus amigos entiendan de qué se trata.
            </p>
          </div>

          <fieldset className="space-y-3 border-0 p-0">
            <legend className="label mb-1">Modo de competición</legend>

            <label className="choice items-start justify-start text-left">
              <input
                type="radio"
                name="mode"
                value="RANKING"
                defaultChecked
                className="sr-only"
              />
              <span className="flex flex-col gap-1">
                <span className="font-semibold">Ranking del 1 al 10</span>
                <span className="hint">{MODE_DESCRIPTION.RANKING}</span>
              </span>
            </label>

            <label className="choice items-start justify-start text-left">
              <input
                type="radio"
                name="mode"
                value="CRUCES"
                className="sr-only"
              />
              <span className="flex flex-col gap-1">
                <span className="font-semibold">Eliminación directa</span>
                <span className="hint">{MODE_DESCRIPTION.CRUCES}</span>
                <span className="hint">Requiere 4, 8, 16 o 32 ítems.</span>
              </span>
            </label>
          </fieldset>

          <div className="flex flex-col gap-2 pt-1">
            <button type="submit" className="btn btn-primary btn-block btn-lg">
              Crear torneo
            </button>
            <Link href="/" className="btn btn-ghost btn-block">
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
