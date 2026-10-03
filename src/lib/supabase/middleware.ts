import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

/**
 * Refresca la sesion de Supabase en cada request.
 *
 * Responsabilidades:
 *  - Reemitir cookies de sesion (rotacion de refresh token).
 *  - Evitar Session Surprises: validar el JWT contra Supabase Auth
 *    en vez de confiar solo en las cookies.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  /**
   * getUser() valida el JWT contra Supabase Auth (no confía solo en las
   * cookies), evitando "Session Surprises". Es la API estable; getClaims()
   * esta marcada como experimental en @supabase/ssr 0.12.x.
   *
   * IMPORTANTE: no ejecutar logica de negocio aca. Este archivo corre en
   * el runtime de Proxy (Node.js por defecto en Next 16) y solo debe
   * encargarse de la sesion.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Rutas que requieren sesion
  const protectedRoutes = ["/rls-test", "/mundialito"];

  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Usuario logueado que entra al login: mandarlo al inicio.
  // Solo en GET: si redirigimos un POST (Server Action), Next espera un
  // payload RSC y el cliente del form falla con
  // "An unexpected response was received from the server".
  if (user && pathname === "/login" && request.method === "GET") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}