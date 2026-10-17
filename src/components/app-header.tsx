import Link from "next/link";
import { logout } from "@/lib/actions/auth";

/**
 * Barra superior de las pantallas con sesion: marca a la izquierda,
 * acciones de la pagina al medio/derecha y salir siempre al final.
 *
 * Server component: el logout es una server action, no hace falta
 * estado en el cliente. Las paginas pasan sus propias acciones
 * (editar, compartir…) como children.
 */
export function AppHeader({
  email,
  children,
}: {
  email?: string | null;
  children?: React.ReactNode;
}) {
  const initial = email?.trim().charAt(0) ?? "?";

  return (
    <header className="topbar">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg no-underline"
          aria-label="Ir al inicio"
        >
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-soft text-base leading-none">
            🏆
          </span>
          <span className="text-[0.9375rem] font-semibold tracking-tight text-fg">
            Mundialito
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {children}

          {email ? (
            <span
              className="avatar hidden sm:inline-flex"
              title={email}
              aria-hidden="true"
            >
              {initial}
            </span>
          ) : null}

          <form action={logout}>
            <button type="submit" className="btn btn-ghost btn-sm">
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
