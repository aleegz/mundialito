import { describe, it, expect } from "vitest";
import {
  addedItemsMessage,
  devFillerItemNames,
  splitItemInput,
  uniqueItems,
} from "@/lib/ui/item-draft";

describe("splitItemInput", () => {
  it("separa por linea y saca la indentacion de una lista pegada", () => {
    expect(splitItemInput("Havanna\n  Cachafaz\n\tJorgito")).toEqual([
      "Havanna",
      "Cachafaz",
      "Jorgito",
    ]);
  });

  it("se come el \\r de un pegado de Windows (CRLF)", () => {
    expect(splitItemInput("Havanna\r\nCachafaz\r\n")).toEqual([
      "Havanna",
      "Cachafaz",
    ]);
  });

  it("NO separa por coma: la coma puede ser parte del nombre", () => {
    expect(splitItemInput("Havanna, el clasico")).toEqual([
      "Havanna, el clasico",
    ]);
  });

  it("devuelve [] con texto vacio o solo espacios", () => {
    expect(splitItemInput("")).toEqual([]);
    expect(splitItemInput("   \n  \n")).toEqual([]);
  });
});

describe("uniqueItems", () => {
  it("preserva el orden y el texto de la primera aparicion", () => {
    expect(uniqueItems(["Havanna", "Cachafaz", "Havanna"])).toEqual([
      "Havanna",
      "Cachafaz",
    ]);
  });

  it("deduplica case-insensitive y sin espacios sobrantes", () => {
    expect(uniqueItems(["  havanna  ", "HAVANNA", "Cachafaz"])).toEqual([
      "havanna",
      "Cachafaz",
    ]);
  });

  it("descarta los vacios", () => {
    expect(uniqueItems(["", "   ", "Havanna"])).toEqual(["Havanna"]);
  });

  it("no toca una lista sin repetidos", () => {
    expect(uniqueItems(["Havanna", "Cachafaz"])).toEqual([
      "Havanna",
      "Cachafaz",
    ]);
  });
});

describe("pegado de una lista (flujo real)", () => {
  it("queda limpio: sin repetidos, sin vacios y sin \\r", () => {
    const pasted =
      "Havanna\r\nCachafaz\r\n  Havanna  \r\nJorgito\r\n\r\nTatin\r\nTatin\r\nRapanui\r\n";

    expect(uniqueItems(splitItemInput(pasted))).toEqual([
      "Havanna",
      "Cachafaz",
      "Jorgito",
      "Tatin",
      "Rapanui",
    ]);
  });
});

describe("addedItemsMessage", () => {
  it("alta completa, singular y plural", () => {
    expect(addedItemsMessage(1, 1)).toBe("Se agregó 1 ítem.");
    expect(addedItemsMessage(3, 3)).toBe("Se agregaron 3 ítems.");
  });

  it("alta parcial: dice cuantos entraron de cuantos", () => {
    expect(addedItemsMessage(2, 5)).toBe("Se agregaron 2 de 5 ítems.");
    expect(addedItemsMessage(0, 3)).toBe("Se agregaron 0 de 3 ítems.");
  });
});

describe("devFillerItemNames (atajo de dev)", () => {
  it("devuelve 8 items numerados desde 1", () => {
    expect(devFillerItemNames()).toEqual([
      "Ítem 1",
      "Ítem 2",
      "Ítem 3",
      "Ítem 4",
      "Ítem 5",
      "Ítem 6",
      "Ítem 7",
      "Ítem 8",
    ]);
  });

  it("respeta un count explicito", () => {
    expect(devFillerItemNames(2)).toEqual(["Ítem 1", "Ítem 2"]);
  });

  it("no repite nombres: entra entero en un solo POST", () => {
    const names = devFillerItemNames();

    expect(uniqueItems(names)).toHaveLength(names.length);
  });

  it("queda por debajo del tope por submit", () => {
    expect(devFillerItemNames().length).toBeLessThanOrEqual(100);
  });
});
