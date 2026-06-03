import { getChain } from "@/chain";
import { ensureSeeded, getStore } from "@/data";
import {
  ABS_MAX_BACKING_LAMPORTS,
  ABS_MIN_BACKING_LAMPORTS,
  FEE_PRESETS,
  LIMITS,
  MIN_BUYBACK_LAMPORTS,
  SUBMISSION_FEE_LAMPORTS,
} from "@/domain/config";
import { distributeFees, isValidFeeSplit } from "@/domain/fees";
import { allSlots, slotTier } from "@/domain/slots";
import { acceptsBacking, assertTransition } from "@/domain/stateMachine";
import type {
  Backing,
  Campaign,
  CampaignView,
  FeeSplit,
  SlotView,
} from "@/domain/types";
import { newId } from "@/lib/id";
import {
  addL,
  bpsOf,
  lamportsToSol,
  solToLamports,
  subL,
  ZERO,
  type Lamports,
} from "@/lib/money";
import { appError, err, ok, type Result } from "@/lib/result";
import type { BackInput, SubmitCampaignInput } from "@/lib/validation";

/**
 * The launchpad service. Every public method returns a `Result` and performs
 * all read-then-write sequences inside `withCampaignLock`, so concurrent
 * requests can never double-claim a slot, double-spend a refund, or pay fees
 * twice. Status changes go exclusively through the state machine.
 */

function deps() {
  return { store: getStore(), chain: getChain() };
}

// --------------------------------------------------------------------------
// Submit
// --------------------------------------------------------------------------

export async function submitCampaign(
  input: SubmitCampaignInput,
): Promise<Result<Campaign>> {
  await ensureSeeded();
  const { store, chain } = deps();

  let minBacking: Lamports;
  let maxBacking: Lamports | null;
  try {
    minBacking = solToLamports(input.minBackingSol);
    maxBacking = input.maxBackingSol ? solToLamports(input.maxBackingSol) : null;
  } catch (e) {
    return err(appError("validation", (e as Error).message));
  }

  if (minBacking < ABS_MIN_BACKING_LAMPORTS || minBacking > ABS_MAX_BACKING_LAMPORTS) {
    return err(
      appError(
        "validation",
        `min backing must be between ${LIMITS.ABS_MIN_BACKING_SOL} and ${LIMITS.ABS_MAX_BACKING_SOL} SOL`,
      ),
    );
  }
  if (maxBacking !== null && maxBacking < minBacking) {
    return err(appError("validation", "max backing cannot be below min backing"));
  }

  const feeSplit = resolveFeeSplit(input);
  if (!feeSplit) {
    return err(appError("validation", "invalid fee split: must sum to 100%"));
  }

  const id = newId("camp");
  const { address: poolWallet, secret: poolSecretEnc } = await chain.createPoolWallet(id);
  const now = new Date();
  const backingDeadline = new Date(
    now.getTime() + input.backingHours * 3_600_000,
  );

  const campaign: Campaign = {
    id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    creatorWallet: input.creatorWallet,
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    imageUrl: input.imageUrl,
    links: input.links,
    totalSlots: input.totalSlots,
    minBackingLamports: minBacking,
    maxBackingLamports: maxBacking,
    backingDeadline: backingDeadline.toISOString(),
    launchDeadline: null,
    feeSplit,
    // Anti-spam submission fee is collected as part of submit (mock chain).
    // In a real impl this would verify an on-chain payment first.
    status: "backing",
    poolWallet,
    poolSecretEnc,
    mintAddress: null,
    explorerUrl: null,
    fundedAt: null,
    launchedAt: null,
    filledSlots: 0,
    totalBackedLamports: ZERO,
    burnSharePct: input.burnSharePct,
    autoBuyback: input.autoBuyback,
    buybackLamports: ZERO,
    tokensBurned: 0n,
    creatorIncomeLamports: ZERO,
    submissionFeePaid: true,
  };

  await chain.recordDeposit({
    poolWallet,
    from: input.creatorWallet,
    amount: SUBMISSION_FEE_LAMPORTS,
  });

  const created = await store.createCampaign(campaign);
  return ok(created);
}

function resolveFeeSplit(input: SubmitCampaignInput): FeeSplit | null {
  if (input.feeSplit) {
    return isValidFeeSplit(input.feeSplit) ? input.feeSplit : null;
  }
  if (input.feePreset) {
    return { ...FEE_PRESETS[input.feePreset] };
  }
  return { ...FEE_PRESETS.standard };
}

// --------------------------------------------------------------------------
// Back a slot
// --------------------------------------------------------------------------

export async function backCampaign(
  campaignId: string,
  input: BackInput,
): Promise<Result<Backing>> {
  await ensureSeeded();
  const { store, chain } = deps();

  let amount: Lamports;
  try {
    amount = solToLamports(input.amountSol);
  } catch (e) {
    return err(appError("validation", (e as Error).message));
  }

  return store.withCampaignLock(campaignId, async () => {
    const campaign = await store.getCampaign(campaignId);
    if (!campaign) return err(appError("not_found", "campaign not found"));

    // Idempotency: a retried request returns the original backing, never a dup.
    if (input.idempotencyKey) {
      const prior = await store.findBackingByIdempotencyKey(
        campaignId,
        input.idempotencyKey,
      );
      if (prior) return ok(prior);
    }

    if (!acceptsBacking(campaign.status)) {
      return err(appError("conflict", `campaign is ${campaign.status}, not accepting backers`));
    }
    if (new Date(campaign.backingDeadline).getTime() <= Date.now()) {
      return err(appError("deadline_passed", "backing deadline has passed"));
    }
    if (amount < campaign.minBackingLamports) {
      return err(
        appError(
          "validation",
          `minimum backing is ${lamportsToSol(campaign.minBackingLamports)} SOL`,
        ),
      );
    }
    if (campaign.maxBackingLamports !== null && amount > campaign.maxBackingLamports) {
      return err(
        appError(
          "validation",
          `maximum backing is ${lamportsToSol(campaign.maxBackingLamports)} SOL`,
        ),
      );
    }

    const existing = await store.listBackingsForCampaign(campaignId);
    const active = existing.filter((b) => b.status === "confirmed");
    const taken = new Set(active.map((b) => b.slotNumber));

    // SECURITY: a real on-chain deposit signature may back at most one slot.
    // Without this, the same proof-of-deposit could be replayed to claim
    // multiple slots from a single payment.
    if (input.depositTx && existing.some((b) => b.depositTx === input.depositTx)) {
      return err(appError("conflict", "this deposit has already been used"));
    }

    if (active.length >= campaign.totalSlots) {
      return err(appError("no_slots", "all slots are taken"));
    }

    // Resolve the slot: explicit request must be free; otherwise next free.
    let slotNumber: number;
    if (input.slotNumber !== undefined) {
      if (input.slotNumber > campaign.totalSlots) {
        return err(appError("validation", "slot number out of range"));
      }
      if (taken.has(input.slotNumber)) {
        return err(appError("slot_taken", `slot ${input.slotNumber} is taken`));
      }
      slotNumber = input.slotNumber;
    } else {
      const free = allSlots(campaign.totalSlots).find((n) => !taken.has(n));
      if (free === undefined) return err(appError("no_slots", "all slots are taken"));
      slotNumber = free;
    }

    // Record the deposit. In real (non-custodial) mode the backer already
    // signed and sent the SOL transfer; we pass its signature so the adapter
    // can verify it on-chain before the backing is persisted.
    const deposit = await chain.recordDeposit({
      poolWallet: campaign.poolWallet,
      from: input.backerWallet,
      amount,
      depositTx: input.depositTx,
    });
    if (!deposit.signature) {
      return err(appError("chain_error", "deposit could not be verified on-chain"));
    }
    const { signature } = deposit;

    const backing: Backing = {
      id: newId("back"),
      createdAt: new Date().toISOString(),
      campaignId,
      backerWallet: input.backerWallet,
      slotNumber,
      amountLamports: amount,
      status: "confirmed",
      depositTx: signature,
      refundTx: null,
      distributionTx: null,
      claimableFeesLamports: ZERO,
      claimedFeesLamports: ZERO,
    };
    await store.createBacking(backing);
    if (input.idempotencyKey) {
      await store.rememberIdempotencyKey(campaignId, input.idempotencyKey, backing.id);
    }

    // Update denormalized counters and flip to funded if this filled the board.
    const filledSlots = active.length + 1;
    const updated: Campaign = {
      ...campaign,
      filledSlots,
      totalBackedLamports: addL(campaign.totalBackedLamports, amount),
    };
    if (filledSlots === campaign.totalSlots) {
      assertTransition(campaign.status, "funded");
      updated.status = "funded";
      updated.fundedAt = new Date().toISOString();
      updated.launchDeadline = new Date(
        Date.now() + LIMITS.LAUNCH_WINDOW_HOURS * 3_600_000,
      ).toISOString();
    }
    await store.updateCampaign(updated);

    return ok(backing);
  });
}

// --------------------------------------------------------------------------
// Withdraw during backing phase (2% fee, frees the slot)
// --------------------------------------------------------------------------

export async function withdrawBacking(
  campaignId: string,
  backerWallet: string,
): Promise<Result<{ backing: Backing; refundedLamports: Lamports }>> {
  await ensureSeeded();
  const { store, chain } = deps();

  return store.withCampaignLock(campaignId, async () => {
    const campaign = await store.getCampaign(campaignId);
    if (!campaign) return err(appError("not_found", "campaign not found"));
    if (!acceptsBacking(campaign.status)) {
      return err(appError("conflict", "withdrawals are only allowed during backing"));
    }

    const backings = await store.listBackingsForCampaign(campaignId);
    const mine = backings.find(
      (b) => b.backerWallet === backerWallet && b.status === "confirmed",
    );
    if (!mine) return err(appError("not_found", "no active backing for this wallet"));

    const fee = bpsOf(mine.amountLamports, LIMITS.WITHDRAW_FEE_BPS);
    const refundAmount = subL(mine.amountLamports, fee);
    const { signature } = await chain.refund({
      poolWallet: campaign.poolWallet,
      poolSecret: campaign.poolSecretEnc,
      to: backerWallet,
      amount: refundAmount,
    });

    const updatedBacking: Backing = {
      ...mine,
      status: "withdrawn",
      refundTx: signature,
    };
    await store.updateBacking(updatedBacking);

    await store.updateCampaign({
      ...campaign,
      filledSlots: campaign.filledSlots - 1,
      totalBackedLamports: subL(campaign.totalBackedLamports, mine.amountLamports),
    });

    return ok({ backing: updatedBacking, refundedLamports: refundAmount });
  });
}

// --------------------------------------------------------------------------
// Launch (atomic create + buy + distribute)
// --------------------------------------------------------------------------

export async function launchCampaign(
  campaignId: string,
  creatorWallet: string,
): Promise<Result<Campaign>> {
  await ensureSeeded();
  const { store, chain } = deps();

  return store.withCampaignLock(campaignId, async () => {
    const campaign = await store.getCampaign(campaignId);
    if (!campaign) return err(appError("not_found", "campaign not found"));
    if (campaign.creatorWallet !== creatorWallet) {
      return err(appError("forbidden", "only the creator can launch"));
    }
    if (campaign.status !== "funded") {
      return err(appError("conflict", `campaign must be funded to launch (is ${campaign.status})`));
    }

    const backings = await store.listBackingsForCampaign(campaignId);
    const confirmed = backings.filter((b) => b.status === "confirmed");
    if (confirmed.length !== campaign.totalSlots) {
      return err(appError("conflict", "slot count mismatch; cannot launch"));
    }

    // Enter launching; roll back to funded if the chain call fails.
    assertTransition(campaign.status, "launching");
    await store.updateCampaign({ ...campaign, status: "launching" });

    let result;
    try {
      result = await chain.launch({
        campaignId,
        poolWallet: campaign.poolWallet,
        poolSecret: campaign.poolSecretEnc,
        name: campaign.name,
        symbol: campaign.symbol,
        imageUrl: campaign.imageUrl,
        allocations: confirmed.map((b) => ({
          backerWallet: b.backerWallet,
          backingId: b.id,
          contribution: b.amountLamports,
        })),
      });
    } catch (e) {
      assertTransition("launching", "funded");
      await store.updateCampaign({ ...campaign, status: "funded" });
      return err(appError("chain_error", `launch failed: ${(e as Error).message}`));
    }

    const distByBacking = new Map(result.distributions.map((d) => [d.backingId, d]));
    for (const b of confirmed) {
      const dist = distByBacking.get(b.id);
      await store.updateBacking({
        ...b,
        status: "distributed",
        distributionTx: dist?.tx ?? null,
      });
    }

    assertTransition("launching", "live");
    const launched: Campaign = {
      ...campaign,
      status: "live",
      mintAddress: result.mintAddress,
      explorerUrl: chain.explorerUrl(result.mintAddress),
      launchedAt: new Date().toISOString(),
    };
    await store.updateCampaign(launched);
    return ok(launched);
  });
}

// --------------------------------------------------------------------------
// Refunds (deadline enforcement) — idempotent, safe to run repeatedly
// --------------------------------------------------------------------------

export async function processDeadlines(): Promise<
  Result<{ refundedCampaigns: number; refundedBackings: number }>
> {
  await ensureSeeded();
  const { store } = deps();
  const now = Date.now();

  const candidates = await store.listCampaigns({ status: ["backing", "funded"] });
  let refundedCampaigns = 0;
  let refundedBackings = 0;

  for (const c of candidates) {
    const expired =
      (c.status === "backing" && new Date(c.backingDeadline).getTime() <= now) ||
      (c.status === "funded" &&
        c.launchDeadline !== null &&
        new Date(c.launchDeadline).getTime() <= now);
    if (!expired) continue;

    const res = await refundCampaign(c.id);
    if (res.ok) {
      refundedCampaigns++;
      refundedBackings += res.value;
    }
  }
  return ok({ refundedCampaigns, refundedBackings });
}

/** Refund every confirmed backer 100% (no fee) and mark the campaign failed. */
async function refundCampaign(campaignId: string): Promise<Result<number>> {
  const { store, chain } = deps();
  return store.withCampaignLock(campaignId, async () => {
    const campaign = await store.getCampaign(campaignId);
    if (!campaign) return err(appError("not_found", "campaign not found"));
    if (campaign.status !== "backing" && campaign.status !== "funded") {
      return ok(0); // already handled by a concurrent run
    }

    assertTransition(campaign.status, "refunding");
    await store.updateCampaign({ ...campaign, status: "refunding" });

    const backings = await store.listBackingsForCampaign(campaignId);
    let count = 0;
    for (const b of backings) {
      if (b.status !== "confirmed") continue;
      const { signature } = await chain.refund({
        poolWallet: campaign.poolWallet,
        poolSecret: campaign.poolSecretEnc,
        to: b.backerWallet,
        amount: b.amountLamports,
      });
      await store.updateBacking({ ...b, status: "refunded", refundTx: signature });
      count++;
    }

    assertTransition("refunding", "failed");
    await store.updateCampaign({
      ...campaign,
      status: "failed",
      filledSlots: 0,
      totalBackedLamports: ZERO,
    });
    return ok(count);
  });
}

// --------------------------------------------------------------------------
// Trading-fee accrual + claiming
// --------------------------------------------------------------------------

/**
 * Apply a batch of trading-fee revenue to a live campaign. In production a
 * cron would read on-chain fee vaults; here it is invoked by the demo "accrue"
 * endpoint. Backers' claimable balances grow proportionally to their stake.
 */
export async function accrueFees(
  campaignId: string,
  revenueLamports: Lamports,
): Promise<Result<{ creditedBackings: number }>> {
  await ensureSeeded();
  const { store } = deps();

  return store.withCampaignLock(campaignId, async () => {
    const campaign = await store.getCampaign(campaignId);
    if (!campaign) return err(appError("not_found", "campaign not found"));
    if (campaign.status !== "live") {
      return err(appError("conflict", "fees only accrue on live campaigns"));
    }

    const backings = await store.listBackingsForCampaign(campaignId);
    const dist = distributeFees(revenueLamports, campaign.feeSplit, backings);
    const byId = new Map(dist.backerShares.map((s) => [s.backingId, s.amount]));

    let credited = 0;
    for (const b of backings) {
      const share = byId.get(b.id);
      if (!share || share === ZERO) continue;
      await store.updateBacking({
        ...b,
        claimableFeesLamports: addL(b.claimableFeesLamports, share),
      });
      credited++;
    }
    return ok({ creditedBackings: credited });
  });
}

/** Pay out a wallet's accrued fees across one campaign. */
export async function claimFees(
  campaignId: string,
  backerWallet: string,
): Promise<Result<{ paidLamports: Lamports; signature: string | null }>> {
  await ensureSeeded();
  const { store, chain } = deps();

  return store.withCampaignLock(campaignId, async () => {
    const campaign = await store.getCampaign(campaignId);
    if (!campaign) return err(appError("not_found", "campaign not found"));

    const backings = await store.listBackingsForCampaign(campaignId);
    const mine = backings.filter(
      (b) => b.backerWallet === backerWallet && b.claimableFeesLamports > ZERO,
    );
    const total = mine.reduce<Lamports>((sum, b) => addL(sum, b.claimableFeesLamports), ZERO);
    if (total === ZERO) {
      return err(appError("already_done", "nothing to claim"));
    }

    const { signature } = await chain.payoutFees({ to: backerWallet, amount: total });
    for (const b of mine) {
      await store.updateBacking({
        ...b,
        claimedFeesLamports: addL(b.claimedFeesLamports, b.claimableFeesLamports),
        claimableFeesLamports: ZERO,
      });
    }
    return ok({ paidLamports: total, signature });
  });
}

// --------------------------------------------------------------------------
// Buyback-and-burn (the deflationary loop funded by creator-fee commission)
// --------------------------------------------------------------------------

/**
 * Collect the token's accrued Pump.fun creator-fee commission and use it to buy
 * the token back and burn it. Idempotent in the sense that it only ever acts on
 * fees that have actually accrued; running it with nothing to collect is a
 * no-op. In real mode this is gated to the campaign creator.
 */
export async function runBuyback(
  campaignId: string,
  opts: { requesterWallet?: string; auto?: boolean } = {},
): Promise<
  Result<{ collected: Lamports; burned: Lamports; creator: Lamports; tokensBurned: bigint; burnTx: string }>
> {
  await ensureSeeded();
  const { store, chain } = deps();

  return store.withCampaignLock(campaignId, async () => {
    const campaign = await store.getCampaign(campaignId);
    if (!campaign) return err(appError("not_found", "campaign not found"));
    if (campaign.status !== "live" || !campaign.mintAddress) {
      return err(appError("conflict", "buyback-and-burn only runs on live campaigns"));
    }
    // Real mode: only the creator may trigger fee collection (auto-runs by the
    // trusted cron are exempt).
    if (chain.name !== "mock" && !opts.auto && opts.requesterWallet !== campaign.creatorWallet) {
      return err(appError("forbidden", "only the creator can run buyback-and-burn"));
    }

    const collected = await chain.collectCreatorFees({ mint: campaign.mintAddress });
    if (collected.amount === ZERO || collected.amount < MIN_BUYBACK_LAMPORTS) {
      return err(appError("already_done", "not enough creator fees collected yet"));
    }

    // Split the collected commission: burnSharePct% is burned, the rest is
    // paid to the creator as income.
    const burnLamports = bpsOf(collected.amount, campaign.burnSharePct * 100);
    const creatorLamports = subL(collected.amount, burnLamports);

    let tokensBurned = 0n;
    let burnTx = "";
    if (burnLamports > ZERO) {
      const bb = await chain.buybackAndBurn({ mint: campaign.mintAddress, amount: burnLamports });
      tokensBurned = bb.tokensBurned;
      burnTx = bb.burnTx;
    }
    if (creatorLamports > ZERO) {
      await chain.payoutFees({ to: campaign.creatorWallet, amount: creatorLamports });
    }

    await store.updateCampaign({
      ...campaign,
      buybackLamports: addL(campaign.buybackLamports, burnLamports),
      tokensBurned: campaign.tokensBurned + tokensBurned,
      creatorIncomeLamports: addL(campaign.creatorIncomeLamports, creatorLamports),
    });

    await store.createBuybackEvent({
      id: newId("bb"),
      campaignId,
      createdAt: new Date().toISOString(),
      collectedLamports: collected.amount,
      burnLamports,
      creatorLamports,
      tokensBurned,
      burnTx: burnTx || collected.signature,
    });

    return {
      ok: true,
      value: { collected: collected.amount, burned: burnLamports, creator: creatorLamports, tokensBurned, burnTx },
    };
  });
}

/** Cron entry point: run buyback for every live campaign with auto-buyback on. */
export async function processAutoBuybacks(): Promise<
  Result<{ ran: number; burnedRuns: number }>
> {
  await ensureSeeded();
  const { store } = deps();
  const live = await store.listCampaigns({ status: "live" });
  let ran = 0;
  let burnedRuns = 0;
  for (const c of live) {
    if (!c.autoBuyback) continue;
    ran++;
    const res = await runBuyback(c.id, { auto: true });
    if (res.ok && res.value.tokensBurned > 0n) burnedRuns++;
  }
  return ok({ ran, burnedRuns });
}

/** Update a campaign's buyback config (creator-only in real mode). */
export async function updateBuybackConfig(
  campaignId: string,
  opts: { requesterWallet?: string; burnSharePct?: number; autoBuyback?: boolean },
): Promise<Result<Campaign>> {
  await ensureSeeded();
  const { store, chain } = deps();

  return store.withCampaignLock(campaignId, async () => {
    const campaign = await store.getCampaign(campaignId);
    if (!campaign) return err(appError("not_found", "campaign not found"));
    if (chain.name !== "mock" && opts.requesterWallet !== campaign.creatorWallet) {
      return err(appError("forbidden", "only the creator can change buyback config"));
    }
    if (
      opts.burnSharePct !== undefined &&
      (!Number.isInteger(opts.burnSharePct) || opts.burnSharePct < 0 || opts.burnSharePct > 100)
    ) {
      return err(appError("validation", "burnSharePct must be an integer 0–100"));
    }

    const updated = await store.updateCampaign({
      ...campaign,
      burnSharePct: opts.burnSharePct ?? campaign.burnSharePct,
      autoBuyback: opts.autoBuyback ?? campaign.autoBuyback,
    });
    return ok(updated);
  });
}

// --------------------------------------------------------------------------
// Read models
// --------------------------------------------------------------------------

export interface GlobalStats {
  totalLaunches: number;
  byStatus: Record<string, number>;
  totalBackedLamports: Lamports;
  totalTokensBurned: bigint;
  totalBuybackLamports: Lamports;
}

/** Aggregate protocol-wide stats for the dashboard. */
export async function getGlobalStats(): Promise<GlobalStats> {
  await ensureSeeded();
  const campaigns = await getStore().listCampaigns();
  const byStatus: Record<string, number> = {};
  let totalBacked: Lamports = ZERO;
  let totalBurned = 0n;
  let totalBuyback: Lamports = ZERO;
  for (const c of campaigns) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    totalBacked = addL(totalBacked, c.totalBackedLamports);
    totalBurned += c.tokensBurned;
    totalBuyback = addL(totalBuyback, c.buybackLamports);
  }
  return {
    totalLaunches: campaigns.length,
    byStatus,
    totalBackedLamports: totalBacked,
    totalTokensBurned: totalBurned,
    totalBuybackLamports: totalBuyback,
  };
}

export async function getCampaignView(id: string): Promise<CampaignView | null> {
  await ensureSeeded();
  const { store } = deps();
  const campaign = await store.getCampaign(id);
  if (!campaign) return null;
  const [backings, events] = await Promise.all([
    store.listBackingsForCampaign(id),
    store.listBuybackEvents(id),
  ]);
  return toView(campaign, backings, events);
}

export async function listCampaignViews(filter?: {
  status?: Campaign["status"] | Campaign["status"][];
}): Promise<CampaignView[]> {
  await ensureSeeded();
  const { store } = deps();
  const campaigns = await store.listCampaigns(filter);
  const views = await Promise.all(
    campaigns.map(async (c) =>
      toView(
        c,
        await store.listBackingsForCampaign(c.id),
        await store.listBuybackEvents(c.id),
      ),
    ),
  );
  return views;
}

export async function listBackingsForWallet(wallet: string): Promise<Backing[]> {
  await ensureSeeded();
  return getStore().listBackingsForWallet(wallet);
}

function toView(
  campaign: Campaign,
  backings: Backing[],
  buybackEvents: import("@/domain/types").BuybackEvent[] = [],
): CampaignView {
  const active = backings.filter((b) => b.status === "confirmed" || b.status === "distributed");
  const bySlot = new Map(active.map((b) => [b.slotNumber, b]));
  const slots: SlotView[] = allSlots(campaign.totalSlots).map((n) => {
    const b = bySlot.get(n);
    return {
      slotNumber: n,
      tier: slotTier(n),
      taken: !!b,
      backerWallet: b?.backerWallet ?? null,
      amountLamports: b?.amountLamports ?? null,
    };
  });
  return { ...campaign, slots, backings, buybackEvents };
}
