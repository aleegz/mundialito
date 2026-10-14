import { describe, it, expect } from "vitest";
import {
  isValidBracketSize,
  roundsFor,
  shuffle,
  drawBracket,
  parentSlot,
  tallyMatch,
  allActiveVoted,
  nextMatchToOpen,
  isChampion,
  type MatchRow,
  type MatchVoteRow,
} from "@/lib/calculations/bracket";

describe("isValidBracketSize", () => {
  it("acepta potencias de 2 válidas", () => {
    expect(isValidBracketSize(4)).toBe(true);
    expect(isValidBracketSize(8)).toBe(true);
    expect(isValidBracketSize(16)).toBe(true);
    expect(isValidBracketSize(32)).toBe(true);
  });

  it("rechaza otras", () => {
    expect(isValidBracketSize(2)).toBe(false);
    expect(isValidBracketSize(5)).toBe(false);
    expect(isValidBracketSize(3)).toBe(false);
  });
});

describe("roundsFor", () => {
  it("log2 correcto", () => {
    expect(roundsFor(4)).toBe(2);
    expect(roundsFor(8)).toBe(3);
    expect(roundsFor(16)).toBe(4);
    expect(roundsFor(32)).toBe(5);
  });
});

describe("shuffle", () => {
  it("no muta el original", () => {
    const orig = ["a", "b", "c"];
    const res = shuffle(orig);
    expect(orig).toEqual(["a", "b", "c"]);
    expect(res.length).toBe(3);
  });

  it("es determinista con rng inyectado", () => {
    const rng = () => 0.1;
    expect(shuffle(["a", "b", "c"], rng)).toEqual(["b", "c", "a"]);
  });

  it("clampea cuando rng() devuelve 1 (nunca indexa fuera de rango)", () => {
    const res = shuffle(["a", "b", "c"], () => 1);
    expect(res).toEqual(["a", "b", "c"]);
  });
});

describe("drawBracket", () => {
  it("empareja ronda 1 y deja TBD las rondas posteriores", () => {
    const seeds = drawBracket(["i1", "i2", "i3", "i4"], () => 0.1);
    const r1 = seeds.filter((s) => s.round === 1);
    expect(r1.length).toBe(2);
    expect(r1[0].itemAId).not.toBeNull();
    expect(r1[0].itemBId).not.toBeNull();

    const r2 = seeds.filter((s) => s.round === 2);
    expect(r2.length).toBe(1);
    expect(r2[0].itemAId).toBeNull();
    expect(r2[0].itemBId).toBeNull();
  });

  it("devuelve n-1 matches en total", () => {
    const seeds = drawBracket(["1", "2", "3", "4", "5", "6", "7", "8"], () => 0.2);
    expect(seeds.length).toBe(7);
  });

  it("ordena por ronda asc y posición asc", () => {
    const seeds = drawBracket(["1", "2", "3", "4", "5", "6", "7", "8"], () => 0.2);
    expect(seeds[0].round).toBe(1);
    expect(seeds[0].position).toBe(0);
    expect(seeds[1].position).toBe(1);
  });
});

describe("parentSlot", () => {
  it("calcula el padre (par → a, impar → b)", () => {
    expect(parentSlot(1, 0)).toEqual({
      parentRound: 2,
      parentPosition: 0,
      slot: "a",
    });
    expect(parentSlot(1, 1)).toEqual({
      parentRound: 2,
      parentPosition: 0,
      slot: "b",
    });
    expect(parentSlot(1, 2)).toEqual({
      parentRound: 2,
      parentPosition: 1,
      slot: "a",
    });
  });
});

const baseMatch: MatchRow = {
  id: "m1",
  mundialito_id: "mid",
  round: 1,
  position: 0,
  item_a_id: "a",
  item_b_id: "b",
  winner_item_id: null,
  status: "RESOLVED",
  vote_round: 1,
};

function vote(
  participant_id: string,
  chosen_item_id: string,
  vote_round = 1,
): MatchVoteRow {
  return { match_id: "m1", participant_id, vote_round, chosen_item_id };
}

describe("tallyMatch", () => {
  it("empate cuando A y B tienen lo mismo", () => {
    const res = tallyMatch([vote("p1", "a"), vote("p2", "b")], baseMatch);
    expect(res.a).toBe(1);
    expect(res.b).toBe(1);
    expect(res.tie).toBe(true);
    expect(res.winnerItemId).toBeNull();
  });

  it("gana A con diferencia estricta", () => {
    const res = tallyMatch([vote("p1", "a"), vote("p2", "a")], baseMatch);
    expect(res.tie).toBe(false);
    expect(res.winnerItemId).toBe("a");
  });

  it("gana B con diferencia estricta", () => {
    const res = tallyMatch([vote("p1", "b"), vote("p2", "b")], baseMatch);
    expect(res.winnerItemId).toBe("b");
  });

  it("sin votos: no es empate ni hay ganador inventado", () => {
    const res = tallyMatch([], baseMatch);
    expect(res.total).toBe(0);
    expect(res.tie).toBe(false);
    expect(res.winnerItemId).toBeNull();
  });

  it("ignora votos a un slot inexistente", () => {
    const res = tallyMatch([vote("p1", "c")], baseMatch);
    expect(res.total).toBe(0);
    expect(res.winnerItemId).toBeNull();
  });
});

describe("allActiveVoted", () => {
  it("true cuando todos los activos votaron en la ronda", () => {
    expect(
      allActiveVoted(["p1", "p2"], [vote("p1", "a"), vote("p2", "b")], 1),
    ).toBe(true);
  });

  it("false cuando falta alguno", () => {
    expect(allActiveVoted(["p1", "p2"], [vote("p1", "a")], 1)).toBe(false);
  });

  it("no cuenta votos de otra ronda", () => {
    expect(allActiveVoted(["p1"], [vote("p1", "a", 2)], 1)).toBe(false);
  });

  it("true con lista de activos vacía (vacuous truth)", () => {
    expect(allActiveVoted([], [], 1)).toBe(true);
  });
});

function pendingMatch(
  round: number,
  position: number,
  status: string,
  itemA: string | null,
  itemB: string | null,
): MatchRow {
  return {
    id: `m${round}-${position}`,
    mundialito_id: "mid",
    round,
    position,
    item_a_id: itemA,
    item_b_id: itemB,
    winner_item_id: null,
    status,
    vote_round: 1,
  };
}

describe("nextMatchToOpen", () => {
  it("elige el PENDING con ambos slots, ordenado por (round, position)", () => {
    const matches = [
      pendingMatch(2, 0, "PENDING", "w1", "w2"),
      pendingMatch(1, 0, "RESOLVED", "a", "b"),
      pendingMatch(1, 1, "RESOLVED", "c", "d"),
    ];
    expect(nextMatchToOpen(matches)?.id).toBe("m2-0");
  });

  it("ignora PENDING con slots incompletos", () => {
    const matches = [pendingMatch(2, 0, "PENDING", null, "w2")];
    expect(nextMatchToOpen(matches)).toBeNull();
  });

  it("ignora matches que no están PENDING", () => {
    const matches = [pendingMatch(2, 0, "OPEN", "w1", "w2")];
    expect(nextMatchToOpen(matches)).toBeNull();
  });

  it("null cuando no hay nada listo", () => {
    expect(nextMatchToOpen([])).toBeNull();
  });
});

function finalMatch(
  round: number,
  status: string,
  winner: string | null,
): MatchRow {
  return {
    id: `f${round}`,
    mundialito_id: "mid",
    round,
    position: 0,
    item_a_id: "a",
    item_b_id: "b",
    winner_item_id: winner,
    status,
    vote_round: 1,
  };
}

describe("isChampion", () => {
  it("devuelve el ganador de una final RESOLVED", () => {
    expect(isChampion([finalMatch(2, "RESOLVED", "champ")])).toBe("champ");
  });

  it("null cuando la final no está resuelta", () => {
    expect(isChampion([finalMatch(2, "OPEN", null)])).toBeNull();
  });

  it("null sin matches", () => {
    expect(isChampion([])).toBeNull();
  });

  it("toma la final de la ronda más alta", () => {
    const matches = [
      finalMatch(1, "RESOLVED", "w1"),
      finalMatch(2, "RESOLVED", "winner"),
    ];
    expect(isChampion(matches)).toBe("winner");
  });
});