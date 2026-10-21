import { test as setup, expect } from "@playwright/test";

const authFile = ".auth/owner.json";

/**
 * Login una sola vez y guarda las cookies de Supabase en `.auth/owner.json`.
 *
 * El flujo reusa esa sesion: el owner tiene que estar logueado para crear
 * el torneo y para cambiar de estado (crear, activar y finalizar son
 * owner-only en RLS). Es un usuario de TEST del proyecto real: no se crea
 * aca, se crea una vez a mano (register o dashboard de Supabase).
 */
setup("autenticarse como el usuario de test", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Faltan E2E_EMAIL y/o E2E_PASSWORD en .env.local (ver .env.example). " +
        "Son las credenciales de un usuario de test del proyecto de Supabase.",
    );
  }

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();

  /**
   * La Server Action redirige a "/" solo si el login fue valido. Con
   * credenciales incorrectas queda en `/login?error=...`, asi que el
   * assert del titulo del dashboard distingue sesion de error.
   */
  await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
  await expect(page.getByText("Tus torneos")).toBeVisible();

  await page.context().storageState({ path: authFile });
});
