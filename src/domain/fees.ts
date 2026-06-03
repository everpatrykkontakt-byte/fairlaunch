import { bpsOf, proportionalSplit, type Lamports, ZERO } from "@/lib/money";
import type { Backing, FeeSplit } from "./types";

/** A fee split is only valid if the four buckets sum to exactly 100%. */
export function isValidFeeSplit(split: FeeSplit): boolean {
  const sum =
    split.backersBps + split.platformBps + split.creatorBps + split.burnBps;
  return (
    sum === 10_000 &&
    [split.backersBps, split.platformBps, split.creatorBps, split.burnBps].every(
      (b) => Number.isInteger(b) && b >= 0 && b <= 10_000,
    )
  );
}

export interface FeeDistribution {
  platform: Lamports;
  creator: Lamports;
  burn: Lamports;
  /** Per-backing payout, aligned by index with the input backings. */
  backerShares: { backingId: string; amount: Lamports }[];
  /** Always equals the input revenue — no dust leaks. */
  total: Lamports;
}

/**
 * Distribute a batch of trading-fee revenue according to the campaign's split.
 * The backer bucket is shared proportionally to each backer's contribution.
 * Uses exact integer math; the sum of all outputs equals `revenue` exactly.
 */
export function distributeFees(
  revenue: Lamports,
  split: FeeSplit,
  backings: readonly Backing[],
): FeeDistribution {
  const platform = bpsOf(revenue, split.platformBps);
  const creator = bpsOf(revenue, split.creatorBps);
  const burn = bpsOf(revenue, split.burnBps);

  // Backers get the remainder so rounding never under/over-pays the total.
  const backerPool = (revenue - platform - creator - burn) as Lamports;

  const eligible = backings.filter((b) => b.status === "distributed" || b.status === "confirmed");
  const weights = eligible.map((b) => b.amountLamports as bigint);
  const shares = proportionalSplit(backerPool, weights);

  const backerShares = eligible.map((b, i) => ({
    backingId: b.id,
    amount: shares[i] ?? ZERO,
  }));

  return { platform, creator, burn, backerShares, total: revenue };
}
