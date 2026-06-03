import { test } from "node:test";
import assert from "node:assert/strict";
import { distributeFees, isValidFeeSplit } from "./fees.ts";
import type { Backing, FeeSplit } from "./types.ts";
import { lamports, solToLamports, ZERO } from "../lib/money.ts";

function backing(id: string, sol: string): Backing {
  return {
    id,
    createdAt: new Date().toISOString(),
    campaignId: "c",
    backerWallet: "w" + id,
    slotNumber: 1,
    amountLamports: solToLamports(sol),
    status: "distributed",
    depositTx: "tx",
    refundTx: null,
    distributionTx: null,
    claimableFeesLamports: ZERO,
    claimedFeesLamports: ZERO,
  };
}

test("isValidFeeSplit enforces 100%", () => {
  assert.ok(isValidFeeSplit({ backersBps: 9000, platformBps: 1000, creatorBps: 0, burnBps: 0 }));
  assert.ok(!isValidFeeSplit({ backersBps: 9000, platformBps: 500, creatorBps: 0, burnBps: 0 }));
  assert.ok(!isValidFeeSplit({ backersBps: -1, platformBps: 10001, creatorBps: 0, burnBps: 0 }));
});

test("distributeFees conserves revenue exactly", () => {
  const split: FeeSplit = { backersBps: 9000, platformBps: 1000, creatorBps: 0, burnBps: 0 };
  const backings = [backing("a", "2"), backing("b", "1"), backing("c", "1")];
  const revenue = solToLamports("0.137");
  const dist = distributeFees(revenue, split, backings);

  const backerTotal = dist.backerShares.reduce((s, b) => s + b.amount, 0n);
  const grand = dist.platform + dist.creator + dist.burn + backerTotal;
  assert.equal(grand, revenue, "every lamport is accounted for");
});

test("distributeFees splits backer pool proportionally to stake", () => {
  const split: FeeSplit = { backersBps: 10000, platformBps: 0, creatorBps: 0, burnBps: 0 };
  const backings = [backing("a", "3"), backing("b", "1")];
  const revenue = solToLamports("4"); // exactly divisible by total stake of 4
  const dist = distributeFees(revenue, split, backings);
  const a = dist.backerShares.find((s) => s.backingId === "a")!.amount;
  const b = dist.backerShares.find((s) => s.backingId === "b")!.amount;
  assert.equal(a, solToLamports("3"));
  assert.equal(b, solToLamports("1"));
});
