import { solToLamports, type Lamports } from "@/lib/money";

/**
 * Single source of truth for protocol limits. Validation, UI, and tests all
 * read from here so they can never drift apart.
 */
export const LIMITS = {
  MIN_SLOTS: 2,
  MAX_SLOTS: 24,

  // Slots 1..GENESIS_SLOTS are the "genesis" tier (buy first / lowest price).
  GENESIS_SLOTS: 4,

  // Per-slot minimum the creator can set.
  ABS_MIN_BACKING_SOL: "0.05",
  ABS_MAX_BACKING_SOL: "100",

  // Non-refundable anti-spam submission fee.
  SUBMISSION_FEE_SOL: "0.02",

  // Backing phase: how long slots have to fill (hours), inclusive bounds.
  MIN_BACKING_HOURS: 1,
  MAX_BACKING_HOURS: 72,
  DEFAULT_BACKING_HOURS: 72,

  // Once funded, how long the creator has to launch before auto-refund.
  LAUNCH_WINDOW_HOURS: 24,

  // Fee charged on a voluntary withdrawal during the backing phase (bps).
  WITHDRAW_FEE_BPS: 200, // 2%

  NAME_MAX: 32,
  SYMBOL_MAX: 10,
  DESCRIPTION_MAX: 500,

  // Token supply is the Pump.fun standard: 1B tokens, 6 decimals.
  TOKEN_TOTAL_SUPPLY: 1_000_000_000,
  TOKEN_DECIMALS: 6,

  // Buyback-and-burn defaults.
  DEFAULT_BURN_SHARE_PCT: 100, // 100% of collected commission is burned
  DEFAULT_MIN_BUYBACK_SOL: "0.05", // don't act on dust below this
} as const;

export const MIN_BUYBACK_LAMPORTS: Lamports = solToLamports(
  LIMITS.DEFAULT_MIN_BUYBACK_SOL,
);

/** Total supply in base units (for % burned math). */
export const TOTAL_SUPPLY_BASE_UNITS: bigint =
  BigInt(LIMITS.TOKEN_TOTAL_SUPPLY) * 10n ** BigInt(LIMITS.TOKEN_DECIMALS);

export const SUBMISSION_FEE_LAMPORTS: Lamports = solToLamports(
  LIMITS.SUBMISSION_FEE_SOL,
);
export const ABS_MIN_BACKING_LAMPORTS: Lamports = solToLamports(
  LIMITS.ABS_MIN_BACKING_SOL,
);
export const ABS_MAX_BACKING_LAMPORTS: Lamports = solToLamports(
  LIMITS.ABS_MAX_BACKING_SOL,
);

/**
 * Built-in fee presets (basis points, sum to 10_000). Creators pick one or
 * supply a custom split; either way the invariant is validated.
 */
export const FEE_PRESETS = {
  standard: { backersBps: 9000, platformBps: 1000, creatorBps: 0, burnBps: 0 },
  community_first: { backersBps: 9500, platformBps: 500, creatorBps: 0, burnBps: 0 },
  creator_aligned: { backersBps: 7000, platformBps: 1000, creatorBps: 2000, burnBps: 0 },
  deflationary: { backersBps: 7000, platformBps: 1000, creatorBps: 0, burnBps: 2000 },
} as const;

export type FeePresetName = keyof typeof FEE_PRESETS;
