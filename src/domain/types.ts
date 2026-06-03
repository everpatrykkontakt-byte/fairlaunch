import type { Lamports } from "@/lib/money";

/**
 * Lifecycle of a launch campaign ("meme").
 *
 *   draft → backing → funded → launching → live
 *                 ↘ refunding → failed
 *
 * Transitions are enforced centrally in domain/stateMachine.ts. No service is
 * allowed to mutate `status` directly.
 */
export type CampaignStatus =
  | "draft" // created, submission fee not yet confirmed
  | "backing" // open for backers to claim slots
  | "funded" // every slot claimed; awaiting launch
  | "launching" // atomic create+buy in flight
  | "live" // token created, distribution done
  | "refunding" // a refund sweep is in progress
  | "failed"; // refunded to all backers (deadline missed / aborted)

export interface Campaign {
  id: string;
  createdAt: string;
  updatedAt: string;

  creatorWallet: string;

  // Token metadata
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  links: SocialLinks;

  // Backing configuration (slot model)
  totalSlots: number; // 2..MAX_SLOTS
  minBackingLamports: Lamports; // minimum per slot
  maxBackingLamports: Lamports | null; // optional per-wallet fairness cap

  // Deadlines (ISO strings)
  backingDeadline: string; // slots must fill before this
  launchDeadline: string | null; // once funded, must launch before this

  // Fee split applied to trading-fee revenue (must sum to 10_000 bps)
  feeSplit: FeeSplit;

  // Status + on-chain results
  status: CampaignStatus;
  poolWallet: string; // per-campaign wallet that collects backer SOL
  /**
   * SERVER-ONLY. Encrypted (AES-256-GCM) secret key of the pool wallet, set by
   * the Solana adapter. Empty for the mock. This field is deliberately NEVER
   * included in any DTO/serialization (see lib/serialize.ts) so it can't leak
   * over the API.
   */
  poolSecretEnc: string;
  mintAddress: string | null; // populated on launch
  explorerUrl: string | null;
  fundedAt: string | null;
  launchedAt: string | null;

  // Denormalized counters (kept consistent by the store, never trusted as
  // the source of truth for money — that is the sum of backings).
  filledSlots: number;
  totalBackedLamports: Lamports;

  // Buyback-and-burn configuration.
  burnSharePct: number; // 0..100 — % of collected commission that is burned;
                        // the remainder is paid to the creator as income.
  autoBuyback: boolean; // when true, the cron runs buyback automatically

  // Buyback-and-burn cumulative stats (post-launch). Creator-fee commission is
  // collected, used to buy the token back, and burned — these track the totals.
  buybackLamports: Lamports; // SOL spent buying back
  tokensBurned: bigint; // token base units permanently burned
  creatorIncomeLamports: Lamports; // cumulative commission kept by the creator

  // Anti-spam: submission fee state
  submissionFeePaid: boolean;
}

export interface SocialLinks {
  twitter?: string;
  telegram?: string;
  discord?: string;
  website?: string;
}

/**
 * Where trading-fee revenue goes. Basis points; must sum to exactly 10_000.
 * Mirrors the original's preset model but is validated as an invariant.
 */
export interface FeeSplit {
  backersBps: number; // proportional to each backer's contribution
  platformBps: number;
  creatorBps: number;
  burnBps: number;
}

export type BackingStatus =
  | "confirmed" // SOL is in the pool wallet
  | "withdrawn" // backer pulled out during backing phase
  | "refunded" // campaign failed; SOL returned
  | "distributed"; // campaign launched; tokens sent to backer

export interface Backing {
  id: string;
  createdAt: string;
  campaignId: string;
  backerWallet: string;
  slotNumber: number; // 1..totalSlots, unique per campaign
  amountLamports: Lamports;
  status: BackingStatus;

  // On-chain references (mock-generated until a real chain is wired)
  depositTx: string;
  refundTx: string | null;
  distributionTx: string | null;

  // Accrued, claimable trading-fee revenue for this backer
  claimableFeesLamports: Lamports;
  claimedFeesLamports: Lamports;
}

/** One buyback-and-burn run: collect commission → buy back → burn. */
export interface BuybackEvent {
  id: string;
  campaignId: string;
  createdAt: string;
  collectedLamports: Lamports; // commission collected this run
  burnLamports: Lamports; // portion spent on buyback+burn
  creatorLamports: Lamports; // portion paid to creator
  tokensBurned: bigint;
  burnTx: string;
}

/** Aggregated, read-optimized view used by list/detail pages. */
export interface CampaignView extends Campaign {
  slots: SlotView[];
  backings: Backing[];
  buybackEvents: BuybackEvent[];
}

export interface SlotView {
  slotNumber: number;
  tier: SlotTier;
  taken: boolean;
  backerWallet: string | null;
  amountLamports: Lamports | null;
}

/** Genesis slots buy first on the curve; later slots buy in subsequent waves. */
export type SlotTier = "genesis" | "wave2";
