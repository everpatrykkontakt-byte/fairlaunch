import type { Backing, BuybackEvent, Campaign } from "@/domain/types";

/**
 * Persistence contract. The in-memory store implements it; a Postgres-backed
 * repository would too (implement src/data/pgStore.ts and select via
 * DATA_STORE=postgres). Services depend only on this interface.
 *
 * `withCampaignLock` is the concurrency primitive: it serializes all mutations
 * for a single campaign, which is what makes slot-claiming and fee-payouts
 * race-free regardless of how many requests arrive at once.
 */
export interface Store {
  // --- Campaigns ---
  createCampaign(c: Campaign): Promise<Campaign>;
  getCampaign(id: string): Promise<Campaign | null>;
  updateCampaign(c: Campaign): Promise<Campaign>;
  listCampaigns(filter?: CampaignFilter): Promise<Campaign[]>;

  // --- Backings ---
  createBacking(b: Backing): Promise<Backing>;
  getBacking(id: string): Promise<Backing | null>;
  updateBacking(b: Backing): Promise<Backing>;
  listBackingsForCampaign(campaignId: string): Promise<Backing[]>;
  listBackingsForWallet(wallet: string): Promise<Backing[]>;

  // --- Buyback events ---
  createBuybackEvent(e: BuybackEvent): Promise<BuybackEvent>;
  listBuybackEvents(campaignId: string): Promise<BuybackEvent[]>;

  /** Idempotency: look up a prior result by client-supplied key. */
  findBackingByIdempotencyKey(
    campaignId: string,
    key: string,
  ): Promise<Backing | null>;
  rememberIdempotencyKey(
    campaignId: string,
    key: string,
    backingId: string,
  ): Promise<void>;

  /**
   * Run `fn` with exclusive access to a campaign. All writes that depend on a
   * read (claim a free slot, flip to funded, pay out a balance) MUST go through
   * this to avoid lost updates / double-claims.
   */
  withCampaignLock<T>(campaignId: string, fn: () => Promise<T>): Promise<T>;
}

export interface CampaignFilter {
  status?: Campaign["status"] | Campaign["status"][];
  creatorWallet?: string;
}
