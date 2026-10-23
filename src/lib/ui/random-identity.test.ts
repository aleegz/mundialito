import { describe, expect, it } from "vitest";
import {
  avatarForName,
  randomIdentity,
  suggestedIdentity,
} from "@/lib/ui/random-identity";

describe("randomIdentity", () => {
  it("combina un adjetivo, un sustantivo y un avatar", () => {
    expect(randomIdentity(() => 0)).toEqual({
      name: "Curioso Zorro",
      avatar: "🦊",
    });
  });

  it("permanece dentro de las opciones aunque el random llegue al limite", () => {
    const identity = randomIdentity(() => 1);

    expect(identity.name).toBe("Jugueton Robot");
    expect(identity.avatar).toBe("🎲");
  });
});

describe("suggestedIdentity", () => {
  it("es estable para el mismo seed", () => {
    expect(suggestedIdentity("mundialito-1")).toEqual(
      suggestedIdentity("mundialito-1"),
    );
  });

  it("produce avatares consistentes para el mismo nombre", () => {
    expect(avatarForName("Zorro curioso")).toBe(
      avatarForName("zorro curioso"),
    );
  });
});
