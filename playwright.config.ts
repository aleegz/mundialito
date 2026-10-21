import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright corre con Node, no con Next: el dev server carga `.env.local`
 * solo, pero el runner no ve esas variables. `process.loadEnvFile` (Node
 * >= 20.12) las trae sin agregar `dotenv` como dependencia.
 *
 * Lo que se lee de ahi son las credenciales del usuario de test
 * (`E2E_EMAIL`, `E2E_PASSWORD`). No son `NEXT_PUBLIC_`, asi que nunca
 * viajan al browser.
 */
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  /**
   * Un solo worker: el flujo crea datos REALES en el proyecto de Supabase.
   * Dos corridas en paralelo se pisarian (mismo usuario, mismo torneo).
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  /**
   * Sin retries: cada intento deja otro mundialito en la base. Un fallo
   * se mira una vez, no se reintenta a ciegas.
   */
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // El primer hit compila la ruta en dev, y ademas se pega a Supabase.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
  },
  projects: [
    {
      /**
       * Solo el login. El `testMatch` se resuelve relativo al `testDir`
       * GLOBAL: sin `testDir` propio, un proyecto se queda con un patron
       * anclado y no matchea nada mas que este archivo — que es lo que
       * queremos, pero tiene que ser explicito.
       */
      name: "setup",
      testDir: "./e2e",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      testDir: "./e2e",
      /**
       * El negativo es obligatorio: sin `testIgnore`, este proyecto se
       * queda tambien con `auth.setup.ts` y corre el login como si fuera
       * un test mas (y sin la sesion guardada, o rompiendo la cadena).
       */
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: ".auth/owner.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    // Si ya hay un dev server levantado, se reusa: no se levanta otro.
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
