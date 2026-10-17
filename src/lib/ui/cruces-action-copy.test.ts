import { describe, it, expect } from "vitest";
import {
  actionLabelFor,
  confirmTextFor,
  type CrucesAction,
} from "@/lib/ui/cruces-action-copy";

/**
 * Todos los kinds viven aca: si se agrega uno y se olvida la copia, el
 * test de "nunca vacio" lo agarra antes que el owner en produccion.
 */
const ALL_ACTIONS: CrucesAction[] = [
  { kind: "patch", target: "PARTICIPANTS_OPEN" },
  { kind: "patch", target: "PARTICIPANTS_LOCKED" },
  { kind: "draw" },
  { kind: "start" },
  { kind: "finalize" },
  { kind: "next" },
];

describe("confirmTextFor", () => {
  it("nunca devuelve un texto vacío", () => {
    for (const action of ALL_ACTIONS) {
      const text = confirmTextFor(action);
      expect(typeof text).toBe("string");
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  it("cerrar la inscripción tiene confirmación propia", () => {
    // Regresión: era "" y el owner veía un globo amarillo sin texto.
    const text = confirmTextFor({
      kind: "patch",
      target: "PARTICIPANTS_LOCKED",
    });

    expect(text).toContain("Cerrar la inscripción");
  });

  it("abrir la inscripción avisa que no se editan más los ítems", () => {
    const text = confirmTextFor({ kind: "patch", target: "PARTICIPANTS_OPEN" });

    expect(text).toContain("Abrir la inscripción");
    expect(text).toContain("ítems");
  });

  it("cada acción pide confirmación con texto distinto", () => {
    const texts = ALL_ACTIONS.map((action) => confirmTextFor(action));

    expect(new Set(texts).size).toBe(ALL_ACTIONS.length);
  });
});

describe("actionLabelFor", () => {
  it("nunca devuelve una etiqueta vacía", () => {
    for (const status of ["DRAFT", "PARTICIPANTS_OPEN", "DRAWN", "VOTING"]) {
      for (const action of ALL_ACTIONS) {
        expect(actionLabelFor(action, status).trim().length).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("distingue sortear de re-sortear según el estado", () => {
    expect(actionLabelFor({ kind: "draw" }, "PARTICIPANTS_LOCKED")).toBe(
      "Sortear",
    );
    expect(actionLabelFor({ kind: "draw" }, "DRAWN")).toBe("Re-sortear");
  });

  it("nombra la apertura y el cierre de la inscripción", () => {
    expect(
      actionLabelFor({ kind: "patch", target: "PARTICIPANTS_OPEN" }, "DRAFT"),
    ).toBe("Abrir inscripción");
    expect(
      actionLabelFor(
        { kind: "patch", target: "PARTICIPANTS_LOCKED" },
        "PARTICIPANTS_OPEN",
      ),
    ).toBe("Cerrar inscripción");
  });
});
