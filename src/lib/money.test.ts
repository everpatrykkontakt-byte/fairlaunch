import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bpsOf,
  lamports,
  lamportsToSol,
  proportionalSplit,
  solToLamports,
  LAMPORTS_PER_SOL,
} from "./money.ts";

test("solToLamports parses without float drift", () => {
  assert.equal(solToLamports("0.1") + solToLamports("0.2"), solToLamports("0.3"));
  assert.equal(solToLamports("1"), LAMPORTS_PER_SOL);
  assert.equal(solToLamports("0.000000001"), 1n);
});

test("solToLamports rejects garbage", () => {
  assert.throws(() => solToLamports("abc"));
  assert.throws(() => solToLamports("-1"));
  assert.throws(() => solToLamports("1.2.3"));
});

test("lamportsToSol trims trailing zeros", () => {
  assert.equal(lamportsToSol(solToLamports("1.5")), "1.5");
  assert.equal(lamportsToSol(solToLamports("2")), "2");
  assert.equal(lamportsToSol(solToLamports("0.25")), "0.25");
});

test("bpsOf rounds down and respects range", () => {
  assert.equal(bpsOf(lamports(10_000n), 1000), 1000n); // 10%
  assert.equal(bpsOf(lamports(9_999n), 1000), 999n); // floor
  assert.throws(() => bpsOf(lamports(1n), 10_001));
});

test("proportionalSplit conserves the total exactly", () => {
  const amount = lamports(1_000_000_007n); // prime-ish, forces remainder
  const weights = [3n, 1n, 1n, 2n];
  const shares = proportionalSplit(amount, weights);
  const sum = shares.reduce((a, b) => a + b, 0n);
  assert.equal(sum, amount, "no dust created or lost");
  // largest weight gets the largest share
  assert.ok(shares[0]! >= shares[1]!);
});

test("proportionalSplit handles zero weights", () => {
  const shares = proportionalSplit(lamports(100n), [0n, 0n]);
  assert.deepEqual(shares, [0n, 0n]);
});
