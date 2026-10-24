import { test, expect } from "@playwright/test";

/**
 * Flujo E2E completo (RANKING) contra el proyecto REAL de Supabase:
 *
 *   crear -> items (optimistas) -> activar -> votar -> finalizar -> resultados
 *
 * Por que RANKING y no CRUCES: es el camino lineal que el hallazgo #19
 * pide, sin sorteo ni bracket. CRUCES tiene su propia secuencia
 * (PARTICIPANTS_OPEN -> LOCKED -> draw -> VOTING) y merece su spec aparte.
 *
 * OJO: cada corrida deja un mundialito real (`[E2E] <fecha>`), porque la
 * app no tiene borrado de torneos. Limpieza manual cuando molesten:
 *
 *   delete from mundialitos where name like '[E2E] %';
 *
 * (El nombre es unico por corrida: si queda basura, se distingue a ojo.)
 */

const ITEMS = [
  "Alfajor de maicena",
  "Alfajor de dulce de leche",
  "Alfajor de chocolate",
];

/** Notas distintas para que el ranking final tenga un orden inequivoco. */
const SCORES = [9, 7, 5];

test("crear, cargar items, votar y ver los resultados", async ({
  page,
}, testInfo) => {
  const name = `[E2E] ${new Date().toISOString()}`;

  await test.step("crear el torneo", async () => {
    await page.goto("/mundialito/new");
    await page.getByLabel("Nombre", { exact: true }).fill(name);

    // RANKING viene seleccionado por defecto: el flujo no toca el modo.
    await page.getByRole("button", { name: "Crear torneo" }).click();

    await expect(page).toHaveURL(/\/mundialito\/[0-9a-f-]{36}$/);
  });

  const mundialitoId = new URL(page.url()).pathname.split("/").pop()!;
  testInfo.annotations.push({ type: "mundialito", description: mundialitoId });

  await test.step("cargar los items uno por uno", async () => {
    await page.getByRole("button", { name: "Agregar ítem" }).click();
    const input = page.getByLabel("Nombre del ítem");

    for (const item of ITEMS) {
      await input.fill(item);
      await input.press("Enter");

      /**
       * #40: la fila optimista aparece antes de que responda el server y
       * despues la reemplaza la real. "Guardando…" es el estado
       * intermedio: si nunca aparece, el optimismo no esta funcionando;
       * si no desaparece, la fila quedo colgada.
       */
      await expect(page.getByText(item, { exact: true })).toBeVisible();
      await expect(page.getByText("Guardando…")).toHaveCount(0);

      // Con el alta anterior commiteada, el input vuelve a ser editable.
      await expect(input).toBeEditable();
    }

    await page.getByRole("button", { name: "Cancelar" }).click();
  });

  await test.step("iniciar la votacion", async () => {
    // El owner renombro "Iniciar votación" a "Iniciar torneo" en RANKING
    // (UN solo click cierra la inscripcion Y abre la votacion).
    await page.getByRole("button", { name: "Iniciar torneo" }).click();
    await page.getByRole("button", { name: "Sí, confirmar" }).click();

    // ACTIVE: el panel ofrece el link a la pantalla de voto.
    await expect(page.getByRole("link", { name: /Ir a votar/ })).toBeVisible();
  });

  await test.step("votar los items", async () => {
    await page.goto(`/vote/${mundialitoId}`);

    // El owner entra con la sesion y ya esta anotado como participante
    // (se auto-registra al crear): no le piden el nombre.
    await expect(page.getByText("Votando como")).toBeVisible();

    for (const [index, item] of ITEMS.entries()) {
      const group = page.getByRole("group", { name: `Puntaje de ${item}` });
      await group
        .getByRole("button", { name: String(SCORES[index]), exact: true })
        .click();
    }

    await page.getByRole("button", { name: "Confirmar votación" }).click();

    /**
     * QW2 (#22/10): tras enviar, el ballot se reemplaza por una pantalla
     * de confirmacion clara —antes quedabas mirando el mismo ballot y
     * parecia que faltaba algo— con salida explicita para editar.
     */
    await expect(page.getByText("¡Voto enviado!")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cambiar mi voto" }),
    ).toBeVisible();

    // Y el ballot ya no esta: el boton de enviar desaparecio.
    await expect(
      page.getByRole("button", { name: "Confirmar votación" }),
    ).toHaveCount(0);
  });

  await test.step("finalizar la votacion", async () => {
    await page.goto(`/mundialito/${mundialitoId}`);
    await page.getByRole("button", { name: "Finalizar votación" }).click();
    await page.getByRole("button", { name: "Sí, confirmar" }).click();

    await expect(
      page.getByRole("link", { name: /Ver los resultados/ }),
    ).toBeVisible();
  });

  await test.step("ver los resultados", async () => {
    await page.goto(`/vote/${mundialitoId}`);

    await expect(page.getByText("La votación finalizó")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ranking de ítems" }),
    ).toBeVisible();

    // Un solo votante: el promedio del primero es exactamente su nota.
    // El detalle de cada voto vive dentro de la tarjeta del ítem; ya no
    // existe una segunda sección duplicada debajo del ranking.
    await expect(
      page.getByRole("heading", { name: "Detalle por ítem" }),
    ).toHaveCount(0);
    await expect(page.getByText("9,00")).toBeVisible();

    /**
     * Ojo con "1 voto": los TRES items tienen un voto, asi que el texto
     * aparece 3 veces y un getByText suelto rompe por strict mode (no
     * elige el primero: exige ser especifico). El ranking se acota con el
     * heading que lo contiene.
     */
    const ranking = page
      .getByRole("heading", { name: "Ranking de ítems" })
      .locator("..");
    await expect(ranking.getByText("1 voto")).toHaveCount(3);

    // Los promedios siguen el orden de las notas: 9 > 7 > 5.
    await expect(ranking).toContainText("Alfajor de maicena");
    await expect(ranking).toContainText("9,00");
    await expect(ranking).toContainText("7,00");
    await expect(ranking).toContainText("5,00");

    // Y el orden de las filas es el del ranking, no el de carga.
    const positions = await ranking
      .getByText(/^(1|2|3)$/)
      .allTextContents();
    expect(positions).toEqual(["1", "2", "3"]);
  });
});
