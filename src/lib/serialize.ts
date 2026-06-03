import type { Backing, BuybackEvent, CampaignView, SlotView } from "@/domain/types";
import { lamportsToSol, type Lamports } from "./money";

/**
 * Domain objects use `bigint` lamports, which don't survive JSON. These DTOs
 * are the wire/UI shape: every money field is exposed as both raw lamports
 * (string, exact) and a human SOL string (for display). This is the single
 * boundary where bigint leaves the system.
 */

export interface MoneyDTO {
  lamports: string;
  sol: string;
}

export function money(v: Lamports): MoneyDTO {
  return { lamports: v.toString(), sol: lamportsToSol(v) };
}

export interface SlotDTO {
  slotNumber: number;
  tier: SlotView["tier"];
  taken: boolean;
  backerWallet: string | null;
  amount: MoneyDTO | null;
}

export interface BackingDTO {
  id: string;
  createdAt: string;
  campaignId: string;
  backerWallet: string;
  slotNumber: number;
  amount: MoneyDTO;
  status: Backing["status"];
  depositTx: string;
  refundTx: string | null;
  distributionTx: string | null;
  claimableFees: MoneyDTO;
  claimedFees: MoneyDTO;
}

export interface CampaignDTO {
  id: string;
  createdAt: string;
  updatedAt: string;
  creatorWallet: string;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  links: CampaignView["links"];
  totalSlots: number;
  filledSlots: number;
  minBacking: MoneyDTO;
  maxBacking: MoneyDTO | null;
  totalBacked: MoneyDTO;
  burnSharePct: number;
  autoBuyback: boolean;
  buybackSol: MoneyDTO;
  tokensBurned: string;
  creatorIncome: MoneyDTO;
  buybackEvents: BuybackEventDTO[];
  backingDeadline: string;
  launchDeadline: string | null;
  fundedAt: string | null;
  launchedAt: string | null;
  status: CampaignView["status"];
  feeSplit: CampaignView["feeSplit"];
  poolWallet: string;
  mintAddress: string | null;
  explorerUrl: string | null;
  slots: SlotDTO[];
  backings: BackingDTO[];
}

export interface BuybackEventDTO {
  id: string;
  createdAt: string;
  collected: MoneyDTO;
  burned: MoneyDTO;
  creator: MoneyDTO;
  tokensBurned: string;
  burnTx: string;
}

export function serializeBuybackEvent(e: BuybackEvent): BuybackEventDTO {
  return {
    id: e.id,
    createdAt: e.createdAt,
    collected: money(e.collectedLamports),
    burned: money(e.burnLamports),
    creator: money(e.creatorLamports),
    tokensBurned: e.tokensBurned.toString(),
    burnTx: e.burnTx,
  };
}

export function serializeBacking(b: Backing): BackingDTO {
  return {
    id: b.id,
    createdAt: b.createdAt,
    campaignId: b.campaignId,
    backerWallet: b.backerWallet,
    slotNumber: b.slotNumber,
    amount: money(b.amountLamports),
    status: b.status,
    depositTx: b.depositTx,
    refundTx: b.refundTx,
    distributionTx: b.distributionTx,
    claimableFees: money(b.claimableFeesLamports),
    claimedFees: money(b.claimedFeesLamports),
  };
}

export function serializeCampaign(c: CampaignView): CampaignDTO {
  return {
    id: c.id,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    creatorWallet: c.creatorWallet,
    name: c.name,
    symbol: c.symbol,
    description: c.description,
    imageUrl: c.imageUrl,
    links: c.links,
    totalSlots: c.totalSlots,
    filledSlots: c.filledSlots,
    minBacking: money(c.minBackingLamports),
    maxBacking: c.maxBackingLamports !== null ? money(c.maxBackingLamports) : null,
    totalBacked: money(c.totalBackedLamports),
    burnSharePct: c.burnSharePct,
    autoBuyback: c.autoBuyback,
    buybackSol: money(c.buybackLamports),
    tokensBurned: c.tokensBurned.toString(),
    creatorIncome: money(c.creatorIncomeLamports),
    buybackEvents: c.buybackEvents.map(serializeBuybackEvent),
    backingDeadline: c.backingDeadline,
    launchDeadline: c.launchDeadline,
    fundedAt: c.fundedAt,
    launchedAt: c.launchedAt,
    status: c.status,
    feeSplit: c.feeSplit,
    poolWallet: c.poolWallet,
    mintAddress: c.mintAddress,
    explorerUrl: c.explorerUrl,
    slots: c.slots.map((s) => ({
      slotNumber: s.slotNumber,
      tier: s.tier,
      taken: s.taken,
      backerWallet: s.backerWallet,
      amount: s.amountLamports !== null ? money(s.amountLamports) : null,
    })),
    backings: c.backings.map(serializeBacking),
  };
}
