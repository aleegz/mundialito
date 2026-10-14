import { describe, it, expect } from "vitest";
import {
  validateScore,
  calculateAverage,
  calculateMin,
  calculateMax,
  calculateRanking,
  calculateItemResults,
  type VoteRow,
} from "@/lib/calculations/ranking";

describe("validateScore", () => {
  it("acepta enteros del 1 al 10", () => {
    expect(validateScore(1)).toBe(true);
    expect(validateScore(5)).toBe(true);
    expect(validateScore(10)).toBe(true);
  });

  it("rechaza valores fuera de rango", () => {
    expect(validateScore(0)).toBe(false);
    expect(validateScore(11)).toBe(false);
    expect(validateScore(-1)).toBe(false);
  });

  it("rechaza decimales", () => {
    expect(validateScore(5.5)).toBe(false);
    expect(validateScore(10.0)).toBe(true);
  });
});

describe("calculateAverage", () => {
  it("calcula promedio correcto", () => {
    expect(calculateAverage([8, 10])).toBe(9);
    expect(calculateAverage([5, 6, 7])).toBe(6);
  });

  it("devuelve NaN para array vacío", () => {
    expect(calculateAverage([])).toBeNaN();
  });
});

describe("calculateMin", () => {
  it("devuelve el mínimo", () => {
    expect(calculateMin([10, 1, 7])).toBe(1);
    expect(calculateMin([5])).toBe(5);
  });

  it("devuelve NaN para array vacío", () => {
    expect(calculateMin([])).toBeNaN();
  });
});

describe("calculateMax", () => {
  it("devuelve el máximo", () => {
    expect(calculateMax([10, 1, 7])).toBe(10);
    expect(calculateMax([5])).toBe(5);
  });

  it("devuelve NaN para array vacío", () => {
    expect(calculateMax([])).toBeNaN();
  });
});

describe("calculateRanking", () => {
  it("ranking olímpico: empates comparten posición", () => {
    const result = calculateRanking(
      [
        { name: "A", score: 10 },
        { name: "B", score: 10 },
        { name: "C", score: 8 },
      ],
      (e) => e.score,
    );
    expect(result[0].position).toBe(1);
    expect(result[1].position).toBe(1);
    expect(result[2].position).toBe(3);
  });

  it("ordena desc por métrica", () => {
    const result = calculateRanking(
      [{ n: 1 }, { n: 5 }, { n: 3 }],
      (e) => e.n,
    );
    expect(result.map((r) => r.entry.n)).toEqual([5, 3, 1]);
  });

  it("maneja NaN al final", () => {
    const result = calculateRanking(
      [{ v: 5 }, { v: NaN }, { v: 10 }],
      (e) => e.v,
    );
    expect(result[0].entry.v).toBe(10);
    expect(result[1].entry.v).toBe(5);
    expect(result[2].entry.v).toBeNaN();
  });
});

describe("calculateItemResults", () => {
  it("agrupa por item y calcula ranking por promedio", () => {
    const votes: VoteRow[] = [
      { participant_id: "p1", item_id: "i1", score: 10 },
      { participant_id: "p2", item_id: "i1", score: 8 },
      { participant_id: "p3", item_id: "i2", score: 9 },
    ];
    const res = calculateItemResults(votes);
    expect(res.length).toBe(2);
    const i2 = res.find((r) => r.itemId === "i2")!;
    const i1 = res.find((r) => r.itemId === "i1")!;
    expect(i2.position).toBe(1);
    expect(i2.average).toBe(9);
    expect(i2.voteCount).toBe(1);
    expect(i1.average).toBe(9);
    expect(i1.position).toBe(1);
    expect(i1.voteCount).toBe(2);
  });

  it("no incluye items sin votos", () => {
    const res = calculateItemResults([]);
    expect(res).toEqual([]);
  });
});