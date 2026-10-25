import Link from "next/link";
import Image from "next/image";

/**
 * Armazón de las pantallas de autenticacion (login y registro): mismo
 * halo de marca, misma tarjeta centrada, mismo pie. Evita que las dos
 * pantallas se desincronicen visualmente.
 *
 * Server component: no necesita estado ni eventos.
 */
export function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden px-5 py-10">
      {/* Halo de marca, puramente decorativo. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--play-glow),transparent)] opacity-70 blur-3xl"
      />

      <div className="relative z-10 w-full max-w-[26rem]">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2.5 no-underline"
          aria-label="Mundialito"
        >
          <span className="brand-icon brand-icon-lg" aria-hidden="true">
            <Image
              src="/icon.png"
              alt=""
              width={80}
              height={80}
              sizes="40px"
              quality={90}
              className="brand-icon-image"
            />
          </span>
          <span className="text-lg font-semibold tracking-tight text-fg">
            Mundialito
          </span>
        </Link>

        <div className="play-card card-pad sm:p-7">
          <p className="play-kicker">Partida</p>
          <h1 className="h2 mt-1">{title}</h1>
          <p className="lead mt-1.5 text-[0.9375rem]">{lead}</p>
          <div className="mt-6">{children}</div>
        </div>

        <div className="mt-5 text-center text-sm text-muted">{footer}</div>
      </div>
    </main>
  );
}
