import { FEE_PRESETS } from "@/domain/config";
import { slotTier } from "@/domain/slots";
import type { Backing, Campaign } from "@/domain/types";
import { fakePubkey, fakeSignature, newId } from "@/lib/id";
import { addL, solToLamports, ZERO, type Lamports } from "@/lib/money";
import type { Store } from "./store";

/**
 * Demo data so the UI has something to show on first boot. Built directly
 * against the store (not the services) so we can stage arbitrary lifecycle
 * states. Deterministic-ish; wallets are random but stable within a process.
 */
export async function seed(store: Store): Promise<void> {
  const wallets = Array.from({ length: 12 }, () => fakePubkey());
  const w = (i: number) => wallets[i % wallets.length]!;
  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

  // 1) An active backing campaign, partially filled.
  await stage(store, {
    base: campaign({
      name: "Quantum Doge",
      symbol: "QDOGE",
      description: "A fair-launch revival of the original good boy. Equal entry, zero dev allocation.",
      creatorWallet: w(0),
      totalSlots: 8,
      minSol: "0.5",
      status: "backing",
      backingDeadline: hoursFromNow(40),
    }),
    backings: [
      { wallet: w(1), slot: 1, sol: "1.0" },
      { wallet: w(2), slot: 2, sol: "0.75" },
      { wallet: w(3), slot: 3, sol: "0.5" },
    ],
  });

  // 2) A nearly-full backing campaign (1 slot left) to highlight urgency.
  await stage(store, {
    base: campaign({
      name: "Solar Cats",
      symbol: "SUNCAT",
      description: "Photovoltaic felines. 4 slots, genesis-only, tight launch window.",
      creatorWallet: w(4),
      totalSlots: 4,
      minSol: "1",
      status: "backing",
      backingDeadline: hoursFromNow(10),
    }),
    backings: [
      { wallet: w(5), slot: 1, sol: "1.5" },
      { wallet: w(6), slot: 2, sol: "1.0" },
      { wallet: w(7), slot: 3, sol: "2.0" },
    ],
  });

  // 3) A funded campaign awaiting launch.
  await stage(store, {
    base: campaign({
      name: "Based Frogs",
      symbol: "BFROG",
      description: "All slots claimed. Creator can pull the trigger any time in the launch window.",
      creatorWallet: w(8),
      totalSlots: 4,
      minSol: "0.5",
      status: "funded",
      backingDeadline: hoursAgo(2),
      fundedAt: hoursAgo(1),
      launchDeadline: hoursFromNow(23),
    }),
    backings: [
      { wallet: w(9), slot: 1, sol: "1.0" },
      { wallet: w(10), slot: 2, sol: "0.5" },
      { wallet: w(11), slot: 3, sol: "0.5" },
      { wallet: w(0), slot: 4, sol: "0.75" },
    ],
  });

  // 4) A live campaign with distributed tokens and accrued fees.
  await stage(store, {
    base: campaign({
      name: "Proof Pepe",
      symbol: "PPEPE",
      description: "Launched atomically — every backer entered at one price. Trading fees flowing back.",
      creatorWallet: w(2),
      totalSlots: 6,
      minSol: "0.5",
      status: "live",
      backingDeadline: hoursAgo(30),
      fundedAt: hoursAgo(28),
      launchDeadline: hoursAgo(6),
    }),
    backings: [
      { wallet: w(3), slot: 1, sol: "2.0", fees: "0.12" },
      { wallet: w(4), slot: 2, sol: "1.0", fees: "0.06" },
      { wallet: w(5), slot: 3, sol: "1.0", fees: "0.06" },
      { wallet: w(6), slot: 4, sol: "0.5", fees: "0.03" },
      { wallet: w(7), slot: 5, sol: "0.5", fees: "0.03" },
      { wallet: w(8), slot: 6, sol: "0.5", fees: "0.03" },
    ],
    launched: true,
  });

  // 5) A failed campaign (deadline missed, everyone refunded).
  await stage(store, {
    base: campaign({
      name: "Ghost Chain",
      symbol: "GHOST",
      description: "Slots never filled before the deadline. All backers were auto-refunded 100%.",
      creatorWallet: w(10),
      totalSlots: 8,
      minSol: "1",
      status: "failed",
      backingDeadline: hoursAgo(5),
    }),
    backings: [{ wallet: w(11), slot: 1, sol: "1.0", refunded: true }],
  });
}

// --- builders -------------------------------------------------------------

interface CampaignSpec {
  name: string;
  symbol: string;
  description: string;
  creatorWallet: string;
  totalSlots: number;
  minSol: string;
  status: Campaign["status"];
  backingDeadline: string;
  fundedAt?: string;
  launchDeadline?: string;
}

function campaign(spec: CampaignSpec): Campaign {
  const now = new Date().toISOString();
  return {
    id: newId("camp"),
    createdAt: now,
    updatedAt: now,
    creatorWallet: spec.creatorWallet,
    name: spec.name,
    symbol: spec.symbol,
    description: spec.description,
    imageUrl: "",
    links: {},
    totalSlots: spec.totalSlots,
    minBackingLamports: solToLamports(spec.minSol),
    maxBackingLamports: null,
    backingDeadline: spec.backingDeadline,
    launchDeadline: spec.launchDeadline ?? null,
    feeSplit: { ...FEE_PRESETS.standard },
    status: spec.status,
    poolWallet: fakePubkey(),
    poolSecretEnc: "",
    mintAddress: null,
    explorerUrl: null,
    fundedAt: spec.fundedAt ?? null,
    launchedAt: null,
    filledSlots: 0,
    totalBackedLamports: ZERO,
    burnSharePct: 100,
    autoBuyback: false,
    buybackLamports: ZERO,
    tokensBurned: 0n,
    creatorIncomeLamports: ZERO,
    submissionFeePaid: true,
  };
}

interface BackingSpec {
  wallet: string;
  slot: number;
  sol: string;
  fees?: string;
  refunded?: boolean;
}

async function stage(
  store: Store,
  args: { base: Campaign; backings: BackingSpec[]; launched?: boolean },
): Promise<void> {
  const { base, backings, launched } = args;

  let total: Lamports = ZERO;
  let filled = 0;
  const rows: Backing[] = backings.map((b) => {
    const amount = solToLamports(b.sol);
    const distributed = launched || base.status === "live";
    const status: Backing["status"] = b.refunded
      ? "refunded"
      : distributed
        ? "distributed"
        : "confirmed";
    if (status === "confirmed" || status === "distributed") {
      total = addL(total, amount);
      filled++;
    }
    return {
      id: newId("back"),
      createdAt: base.createdAt,
      campaignId: base.id,
      backerWallet: b.wallet,
      slotNumber: b.slot,
      amountLamports: amount,
      status,
      depositTx: fakeSignature(),
      refundTx: b.refunded ? fakeSignature() : null,
      distributionTx: distributed ? fakeSignature() : null,
      claimableFeesLamports: b.fees ? solToLamports(b.fees) : ZERO,
      claimedFeesLamports: ZERO,
    };
  });

  const events: import("@/domain/types").BuybackEvent[] = [];
  if (launched || base.status === "live") {
    base.mintAddress = fakePubkey().slice(0, -4) + "pooL";
    base.explorerUrl = `https://explorer.solana.com/address/${base.mintAddress}?cluster=devnet`;
    base.launchedAt = base.fundedAt ?? base.createdAt;
    base.autoBuyback = true;
    // Demo buyback-and-burn history: two runs, 0.3 SOL total → 600k tokens burned.
    base.buybackLamports = solToLamports("0.3");
    base.tokensBurned = 600_000n * 10n ** 6n;
    for (let i = 0; i < 2; i++) {
      events.push({
        id: newId("bb"),
        campaignId: base.id,
        createdAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
        collectedLamports: solToLamports("0.15"),
        burnLamports: solToLamports("0.15"),
        creatorLamports: ZERO,
        tokensBurned: 300_000n * 10n ** 6n,
        burnTx: fakeSignature(),
      });
    }
  }
  base.filledSlots = base.status === "failed" ? 0 : filled;
  base.totalBackedLamports = base.status === "failed" ? ZERO : total;

  await store.createCampaign(base);
  for (const r of rows) await store.createBacking(r);
  for (const e of events) await store.createBuybackEvent(e);
}

export { slotTier };
