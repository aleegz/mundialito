import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { AppVersion } from "@/components/app-version";
import { formatShortDate, modeMeta, statusMeta } from "@/lib/ui/labels";

export const metadata: Metadata = { title: "Tus torneos" };

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

  if (!mundialitos || mundialitos.length === 0) {
    return (
      <main className="flex-1 pb-16">
        <AppHeader email={user.email} />

        <div className="page-wide">
          <div className="play-hero mt-8">
            <p className="play-kicker">Partida lista</p>
            <h1 className="h1 mt-3">Mundialito</h1>
            <p className="lead mt-2 max-w-lg">
              Armá un torneo, pasá el link y viví el pique con tus amigos en vivo.
            </p>
          </div>

          <div className="empty mt-10">
            <span className="text-4xl" aria-hidden="true">
              🏟️
            </span>
            <h2 className="h3 mt-2">Todavía no tenés torneos</h2>
            <p className="hint max-w-xs">
              Creá el primero y compartí el link para que tus amigos se sumen.
            </p>
            <Link href="/mundialito/new" className="btn btn-primary mt-3">
              Crear mi primer mundialito
            </Link>
          </div>

          <div className="mt-16 text-center">
            <AppVersion />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 pb-16">
      <AppHeader email={user.email} />

      <div className="page-wide">
        <div className="play-hero mt-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="play-kicker">Tus torneos</p>
            <h1 className="h1 mt-3">Mundialito</h1>
            <p className="lead mt-2 max-w-lg">
              Armá un torneo, pasá el link y viví el pique con tus amigos en vivo.
            </p>
          </div>

          <Link
            href="/mundialito/new"
            className="btn btn-primary btn-lg sm:shrink-0"
          >
            <span aria-hidden="true">＋</span>
            Nuevo mundialito
          </Link>
        </div>

        <section className="mt-10" aria-label="Tus mundialitos">
          <div className="grid gap-4 sm:grid-cols-2">
            {mundialitos.map((m) => {
                const status = statusMeta(m.status);
                const mode = modeMeta(m.mode);
                const date = formatShortDate(m.created_at);

                return (
                  <Link
                    key={m.id}
                    href={`/mundialito/${m.id}`}
                    className="play-card play-card-hover card-pad card-link"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="h3">{m.name}</h2>
                      <span className={`pill ${status.pill} play-pill`}>
                        <span className="dot" aria-hidden="true" />
                        {status.label}
                      </span>
                    </div>

                    {m.description ? (
                      <p className="mt-2 line-clamp-2 text-sm text-muted">
                        {m.description}
                      </p>
                    ) : null}

                    <div className="mt-4 flex items-center gap-2">
                      <span className={`pill ${mode.pill}`}>{mode.label}</span>
                      {date ? (
                        <span className="ml-auto text-xs text-subtle">
                          {date}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
          </div>
        </section>

        <div className="mt-16 text-center">
          <AppVersion />
        </div>
      </div>
    </main>
  );
}
