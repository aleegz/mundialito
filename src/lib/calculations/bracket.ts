/**
 * Pure, stateless calculations for the CRUCES (single-elimination) mode.
 * Framework-free (no React, no Supabase): rows in, values out.
 * Nothing here is persisted — the bracket lives in the DB, these
 * functions read it and decide.
 */

/**
 * Valid tournament sizes. Exact powers of two (>= 4) so the bracket
 * has ZERO byes: every player starts in round 1 and the feeder math
 * `(r-1, 2p) / (r-1, 2p+1)` stays total.
 */
export const BRACKET_SIZES = [4, 8, 16, 32] as const;

/** True when `n` is a supported tournament size. */
export function isValidBracketSize(n: number): boolean {
  return (BRACKET_SIZES as readonly number[]).includes(n);
}

/**
 * Number of rounds for a tournament of `n` items: log2(n).
 * Only meaningful for `isValidBracketSize(n)` inputs — every call
 * site MUST validate first (mirrors how ranking.ts documents NaN
 * edge cases: the function is total, but the answer is only "real"
 * for valid sizes).
 */
export function roundsFor(n: number): number {
  return Math.log2(n);
}

/** One match row as stored in `matches`, trimmed to what calculations read. */
export type MatchRow = {
  id: string;
  mundialito_id: string;
  round: number;
  position: number;
  item_a_id: string | null;
  item_b_id: string | null;
  winner_item_id: string | null;
  status: string; // 'PENDING' | 'OPEN' | 'RESOLVED'
  vote_round: number;
};

/** One vote row as stored in `match_votes`. */
export type MatchVoteRow = {
  match_id: string;
  participant_id: string;
  vote_round: number;
  chosen_item_id: string;
};

/** A match as created by a draw: round 1 has real slots, later rounds are TBD. */
export type MatchSeed = {
  round: number;
  position: number;
  itemAId: string | null;
  itemBId: string | null;
};

/**
 * Fisher–Yates shuffle. Returns a NEW array; input is untouched.
 * `rng` is injectable for deterministic tests (must return [0, 1)).
 * Defaults to Math.random.
 */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const randomIndex = rng();
    // rng() = 1 exactly would index past the end; clamp defensively
    // (Math.random never yields 1, but injected test rngs might).
    const j = Math.min(i, Math.floor(randomIndex * (i + 1)));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

/**
 * Creates the bracket for a tournament of `itemIds`.
 *
 * Round 1 pairs the SHUFFLED items as (0,1) (2,3) …; every later
 * round is emitted with NULL slots (TBD) that the feeder fills as
 * winners advance. The returned seeds are ordered (round asc,
 * position asc).
 *
 * Total matches = n - 1, like a real single-elimination bracket.
 * MUTATION: the Draw operation persists every seed at once, which is
 * why the whole (TBD) structure is returned instead of only round 1.
 */
export function drawBracket(itemIds: readonly string[], rng: () => number = Math.random): MatchSeed[] {
  const n = itemIds.length;
  const shuffled = shuffle(itemIds, rng);

  const seeds: MatchSeed[] = [];

  for (let p = 0; p < n / 2; p += 1) {
    seeds.push({
      round: 1,
      position: p,
      itemAId: shuffled[2 * p],
      itemBId: shuffled[2 * p + 1],
    });
  }

  const totalRounds = roundsFor(n);
  for (let r = 2; r <= totalRounds; r += 1) {
    const count = n / 2 ** r;
    for (let p = 0; p < count; p += 1) {
      seeds.push({ round: r, position: p, itemAId: null, itemBId: null });
    }
  }

  return seeds;
}

/**
 * The parent match slot that the winner of `(round, position)` fills:
 * `(r, p)` feeds `(r+1, floor(p/2))`, into slot "a" for even p and
 * "b" for odd p — exactly inverse of the `(r-1, 2p)/(r-1, 2p+1)` split.
 */
export type ParentSlot = {
  parentRound: number;
  parentPosition: number;
  slot: "a" | "b";
};

export function parentSlot(round: number, position: number): ParentSlot {
  return {
    parentRound: round + 1,
    parentPosition: Math.floor(position / 2),
    slot: position % 2 === 0 ? "a" : "b",
  };
}

/**
 * Tallies one match's votes (a single `vote_round`).
 *
 * `votes` MUST be pre-filtered to the match and round in question AND
 * to participants whose `status` is 'JOINED' — an excluded participant's
 * already-cast current-round vote should not count (their exclusion
 * happened before finalize; past resolved rounds keep their votes as
 * history).
 *
 * Returns `tie: true` explicitly when A and B are equal — the caller
 * (finalize route) then bumps `vote_round` instead of inventing a
 * winner. This mirrors how calculateAverage returns NaN rather than a
 * misleading 0: the decision is surfaced, never silently made.
 *
 * A match with zero votes is NOT a tie: there is nothing to break,
 * so `tie` is false and `winnerItemId` is null. Callers must enforce
 * "all active voted" BEFORE tallying.
 */
export function tallyMatch(
  votes: readonly MatchVoteRow[],
  match: MatchRow,
): { a: number; b: number; total: number; tie: boolean; winnerItemId: string | null } {
  let a = 0;
  let b = 0;

  for (const vote of votes) {
    if (vote.chosen_item_id === match.item_a_id) {
      a += 1;
    } else if (vote.chosen_item_id === match.item_b_id) {
      b += 1;
    }
    // A vote for something that is neither slot is impossible through
    // the RLS helper (can_vote_in_match) — ignored defensively.
  }

  const total = a + b;
  const tie = total > 0 && a === b;
  // Winner only on a STRICT difference: an exact tie (including an
  // empty 0-0 match) must never fabricate one. Comparing `a === b`
  // covers both the tied and the no-votes case.
  const winnerItemId = a === b ? null : a > b ? match.item_a_id : match.item_b_id;
  return { a, b, total, tie, winnerItemId };
}

/**
 * True when every active participant has a vote in `round`.
 * "Active" participants are decided by the caller (JOINED status) —
 * this function only checks set coverage.
 */
export function allActiveVoted(
  activeParticipantIds: readonly string[],
  votes: readonly MatchVoteRow[],
  round: number,
): boolean {
  const votedInRound = new Set(
    votes.filter((vote) => vote.vote_round === round).map((vote) => vote.participant_id),
  );
  return activeParticipantIds.every((id) => votedInRound.has(id));
}

/**
 * The next match to open: the lowest (round asc, position asc) PENDING
 * match that already has both slots filled (its feeder resolved).
 * Returns null when nothing is ready — used by the owner's "next"
 * action and to derive the "current match" for voters (there is at
 * most one OPEN at a time, enforced by a partial unique index in 004).
 */
export function nextMatchToOpen(matches: readonly MatchRow[]): MatchRow | null {
  const ready = matches
    .filter((match) => match.status === "PENDING" && match.item_a_id !== null && match.item_b_id !== null)
    .sort((a, b) => (a.round - b.round) || (a.position - b.position));
  return ready[0] ?? null;
}

/**
 * The champion: winner of the (single) final match when it is RESOLVED.
 * The final is the match in the highest round at position 0 (with a
 * perfect bracket there is exactly one such match). Null otherwise —
 * including "tournament not finished", which callers must handle.
 */
export function isChampion(matches: readonly MatchRow[]): string | null {
  if (matches.length === 0) {
    return null;
  }

  let maxRound = 1;
  for (const match of matches) {
    if (match.round > maxRound) {
      maxRound = match.round;
    }
  }

  const final = matches.find((match) => match.round === maxRound && match.position === 0);
  if (!final || final.status !== "RESOLVED") {
    return null;
  }
  return final.winner_item_id;
}