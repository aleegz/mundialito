import { test, expect } from "@playwright/test";
import packageJson from "../package.json";

/**
 * Utilería de dev (23/10):
 *
 *   TL1 — Ctrl (o Cmd) + click en "Agregar ítem" carga 8 ítems genericos
 *         de una sola vez, sin abrir el input.
 *   TL2 — la version de la app sale en chiquito debajo del login y del
 *         home, leyendo de package.json.
 *
 * OJO: como el resto de los E2E, TL1 crea un mundialito REAL
 * (`[E2E] <fecha>`). Limpieza manual:
 *
 *   delete from mundialitos where name like '[E2E] %';
 */

test.describe("versión visible (TL2)", () => {
  test("el login muestra la versión de package.json", async ({ page }) => {
    // Ruta publica: se puede mirar sin sesion.
    await page.goto("/login");

    await expect(
      page.getByLabel("Versión de la aplicación"),
    ).toHaveText(`v${packageJson.version}`);
  });

  test("el home muestra la versión", async ({ page }) => {
    await page.goto("/");

    const version = page.getByLabel("Versión de la aplicación");
    await expect(version).toBeVisible();
    await expect(version).toHaveText(`v${packageJson.version}`);
  });
});

test.describe("atajo de dev: Ctrl+click agrega 8 (TL1)", () => {
  test("carga 8 ítems de una sin abrir el input", async ({ page }) => {
    const name = `[E2E] shortcuts ${new Date().toISOString()}`;

    await page.goto("/mundialito/new");
    await page.getByLabel("Nombre", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Crear torneo" }).click();
    await expect(page).toHaveURL(/\/mundialito\/[0-9a-f-]{36}$/);

    // El input de alta arranca cerrado: solo esta el disparador.
    const trigger = page.getByRole("button", { name: "Agregar ítem" });
    await expect(trigger).toBeVisible();
    await expect(page.getByLabel("Nombre del ítem")).toHaveCount(0);

    // Ctrl+click = 8 items de una.
    await trigger.click({ modifiers: ["Control"] });

    // El aviso del alta multiple es la señal de que el atajo disparo
    // (sin abrir el input, que era justo lo que se queria evitar).
    await expect(page.getByText("Se agregaron 8 ítems.")).toBeVisible();

    // Y los 8 nombres estan en la lista.
    for (let index = 1; index <= 8; index += 1) {
      await expect(
        page.getByText(`Ítem ${index}`, { exact: true }),
      ).toBeVisible();
    }

    // El input sigue cerrado: el atajo no lo abre.
    await expect(page.getByLabel("Nombre del ítem")).toHaveCount(0);
  });
});
