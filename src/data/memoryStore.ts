import type { Backing, BuybackEvent, Campaign } from "@/domain/types";
import type { CampaignFilter, Store } from "./store";

/**
 * In-process store. Cloneable values are deep-copied on the way in and out so
 * callers can never mutate stored state by reference — the only way to change
 * a record is through update*, which mirrors how a real DB behaves and
 * prevents a whole class of "spooky action at a distance" bugs.
 */
export class MemoryStore implements Store {
  private campaigns = new Map<string, Campaign>();
  private backings = new Map<string, Backing>();
  private buybackEvents = new Map<string, BuybackEvent>();
  private idempotency = new Map<string, string>(); // `${campaignId}:${key}` -> backingId
  private locks = new Map<string, Promise<unknown>>();

  async createCampaign(c: Campaign): Promise<Campaign> {
    this.campaigns.set(c.id, clone(c));
    return clone(c);
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    const c = this.campaigns.get(id);
    return c ? clone(c) : null;
  }

  async updateCampaign(c: Campaign): Promise<Campaign> {
    if (!this.campaigns.has(c.id)) throw new Error(`campaign ${c.id} not found`);
    const updated = { ...clone(c), updatedAt: new Date().toISOString() };
    this.campaigns.set(c.id, updated);
    return clone(updated);
  }

  async listCampaigns(filter?: CampaignFilter): Promise<Campaign[]> {
    let all = [...this.campaigns.values()].map(clone);
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      all = all.filter((c) => statuses.includes(c.status));
    }
    if (filter?.creatorWallet) {
      all = all.filter((c) => c.creatorWallet === filter.creatorWallet);
    }
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createBacking(b: Backing): Promise<Backing> {
    this.backings.set(b.id, clone(b));
    return clone(b);
  }

  async getBacking(id: string): Promise<Backing | null> {
    const b = this.backings.get(id);
    return b ? clone(b) : null;
  }

  async updateBacking(b: Backing): Promise<Backing> {
    if (!this.backings.has(b.id)) throw new Error(`backing ${b.id} not found`);
    this.backings.set(b.id, clone(b));
    return clone(b);
  }

  async listBackingsForCampaign(campaignId: string): Promise<Backing[]> {
    return [...this.backings.values()]
      .filter((b) => b.campaignId === campaignId)
      .map(clone)
      .sort((a, b) => a.slotNumber - b.slotNumber);
  }

  async listBackingsForWallet(wallet: string): Promise<Backing[]> {
    return [...this.backings.values()]
      .filter((b) => b.backerWallet === wallet)
      .map(clone)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createBuybackEvent(e: BuybackEvent): Promise<BuybackEvent> {
    this.buybackEvents.set(e.id, clone(e));
    return clone(e);
  }

  async listBuybackEvents(campaignId: string): Promise<BuybackEvent[]> {
    return [...this.buybackEvents.values()]
      .filter((e) => e.campaignId === campaignId)
      .map(clone)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findBackingByIdempotencyKey(
    campaignId: string,
    key: string,
  ): Promise<Backing | null> {
    const id = this.idempotency.get(`${campaignId}:${key}`);
    return id ? this.getBacking(id) : null;
  }

  async rememberIdempotencyKey(
    campaignId: string,
    key: string,
    backingId: string,
  ): Promise<void> {
    this.idempotency.set(`${campaignId}:${key}`, backingId);
  }

  /**
   * Per-campaign async mutex. Chains pending operations on a single promise so
   * they execute strictly one-at-a-time. This is what makes "claim the next
   * free slot" safe even under concurrent requests in dev/serverless.
   */
  async withCampaignLock<T>(campaignId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(campaignId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // Keep a stable reference to the chained promise. (Re-calling
    // `prev.then(...)` would create a *different* promise, so the cleanup
    // identity check below must compare against this exact value or the map
    // entry is never released — an unbounded leak.)
    const chained = prev.then(() => gate);
    this.locks.set(campaignId, chained);
    await prev.catch(() => {}); // wait our turn; ignore prior errors
    try {
      return await fn();
    } finally {
      release();
      // Only the last waiter removes the entry; a newer waiter will have
      // overwritten it with its own chained promise.
      if (this.locks.get(campaignId) === chained) {
        this.locks.delete(campaignId);
      }
    }
  }
}

function clone<T>(v: T): T {
  return structuredClone(v);
}
