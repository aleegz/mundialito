/**
 * Pure, stateless calculations for the results view.
 * Framework-free (no React, no Supabase): rows in, numbers out.
 * Nothing here is persisted — callers compute on every render.
 */

/**
 * One row of the votes table, mirroring the Postgres columns
 * (mundialito_id is already filtered out by the query).
 */
export type VoteRow = {
  participant_id: string;
  item_id: string;
  score: number;
};

/**
 * Leaderboard row for a single item: one entry per
 * (item, participant) pair. The PK of votes guarantees at most one
 * vote per pair today, so average/min/max collapse to the same score
 * and voteCount is 1 — the aggregation stays generic so it remains
 * correct if that invariant ever changes.
 */
export type ItemRanking = {
  itemId: string;
  participantId: string;
  average: number;
  min: number;
  max: number;
  voteCount: number;
  position: number;
};

/**
 * Overall leaderboard row: one entry per participant with at least
 * one vote, aggregated across all items.
 */
export type OverallRanking = {
  participantId: string;
  total: number;
  average: number;
  voteCount: number;
  position: number;
};

/** Entry + competition position, as produced by calculateRanking. */
export type Ranked<T> = {
  entry: T;
  position: number;
};

/** A score is valid when it is an integer in the 1..10 range. */
export function validateScore(score: number): boolean {
  return Number.isInteger(score) && score >= 1 && score <= 10;
}

/**
 * Arithmetic mean of `scores`.
 *
 * An empty array returns NaN on purpose, NOT 0: scores live in
 * 1..10, so 0 is not a reachable average and would read as a real
 * (terrible) result. NaN propagates through arithmetic and renders
 * visibly, forcing every call site to branch on the "no votes" case
 * explicitly instead of silently displaying 0,0.
 */
export function calculateAverage(scores: number[]): number {
  if (scores.length === 0) {
    return Number.NaN;
  }

  let sum = 0;
  for (const score of scores) {
    sum += score;
  }
  return sum / scores.length;
}

/** Lowest score; NaN for an empty list (same rationale as calculateAverage). */
export function calculateMin(scores: number[]): number {
  if (scores.length === 0) {
    return Number.NaN;
  }

  let min = scores[0];
  for (const score of scores) {
    if (score < min) {
      min = score;
    }
  }
  return min;
}

/** Highest score; NaN for an empty list (same rationale as calculateAverage). */
export function calculateMax(scores: number[]): number {
  if (scores.length === 0) {
    return Number.NaN;
  }

  let max = scores[0];
  for (const score of scores) {
    if (score > max) {
      max = score;
    }
  }
  return max;
}

/**
 * Competition ranking (1, 2, 2, 4): entries are sorted descending by
 * `metric`, ties share the same position, and the next rank skips as
 * many slots as the tie consumed — the standard "Olympic" ranking.
 *
 * NaN metrics sort last. Because NaN never equals itself, tied-NaN
 * entries do NOT share a position; the builders below never produce
 * them (they only rank entries that have at least one score), so this
 * is a documented edge, not a handled case.
 */
export function calculateRanking<T>(
  entries: readonly T[],
  metric: (entry: T) => number,
): Ranked<T>[] {
  const scored = entries
    .map((entry) => ({ entry, metric: metric(entry) }))
    .sort((a, b) => {
      const aIsNaN = Number.isNaN(a.metric);
      const bIsNaN = Number.isNaN(b.metric);
      if (aIsNaN || bIsNaN) {
        return aIsNaN === bIsNaN ? 0 : aIsNaN ? 1 : -1;
      }
      return b.metric - a.metric;
    });

  const ranked: Ranked<T>[] = [];
  for (let index = 0; index < scored.length; index += 1) {
    const current = scored[index];
    let position = index + 1;

    if (index > 0) {
      const previous = scored[index - 1];
      if (current.metric === previous.metric) {
        position = ranked[index - 1].position;
      }
    }

    ranked.push({ entry: current.entry, position });
  }
  return ranked;
}

/**
 * Per-item leaderboard: groups the votes by item, then by participant,
 * and ranks the participants inside each item by average desc with
 * competition ties. Items without votes are absent from the map —
 * callers iterate their own item list and fall back to an empty array.
 */
export function calculateItemRanking(
  votes: readonly VoteRow[],
): Map<string, ItemRanking[]> {
  const scoresByItem = new Map<string, Map<string, number[]>>();

  for (const vote of votes) {
    let perParticipant = scoresByItem.get(vote.item_id);
    if (perParticipant === undefined) {
      perParticipant = new Map<string, number[]>();
      scoresByItem.set(vote.item_id, perParticipant);
    }

    const scores = perParticipant.get(vote.participant_id) ?? [];
    scores.push(vote.score);
    perParticipant.set(vote.participant_id, scores);
  }

  const rankings = new Map<string, ItemRanking[]>();

  for (const [itemId, perParticipant] of scoresByItem) {
    const rows: Array<Omit<ItemRanking, "position">> = [];
    for (const [participantId, scores] of perParticipant) {
      rows.push({
        itemId,
        participantId,
        average: calculateAverage(scores),
        min: calculateMin(scores),
        max: calculateMax(scores),
        voteCount: scores.length,
      });
    }

    const ranked = calculateRanking(rows, (row) => row.average);
    rankings.set(
      itemId,
      ranked.map(({ entry, position }) => ({ ...entry, position })),
    );
  }

  return rankings;
}

/**
 * Overall participant leaderboard across all items, ranked by AVERAGE
 * (not total): a partial ballot must not win just by scoring fewer
 * items with high numbers. `total` is reported alongside so the view
 * can show both.
 *
 * Participants without a single vote never appear — there is no score
 * to rank them by. Competition ties share a position.
 */
export function calculateOverallRanking(
  votes: readonly VoteRow[],
): OverallRanking[] {
  const scoresByParticipant = new Map<string, number[]>();

  for (const vote of votes) {
    const scores = scoresByParticipant.get(vote.participant_id) ?? [];
    scores.push(vote.score);
    scoresByParticipant.set(vote.participant_id, scores);
  }

  const rows: Array<Omit<OverallRanking, "position">> = [];
  for (const [participantId, scores] of scoresByParticipant) {
    let total = 0;
    for (const score of scores) {
      total += score;
    }

    rows.push({
      participantId,
      total,
      average: calculateAverage(scores),
      voteCount: scores.length,
    });
  }

  return calculateRanking(rows, (row) => row.average).map(
    ({ entry, position }) => ({ ...entry, position }),
  );
}
