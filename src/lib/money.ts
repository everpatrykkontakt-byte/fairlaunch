/**
 * Money is integer lamports everywhere internally. Floating-point SOL is only
 * for display/parsing at the edges. This eliminates the float-drift class of
 * bugs (e.g. 0.1 + 0.2 !== 0.3) that plagues naive launchpad accounting.
 *
 * 1 SOL = 1_000_000_000 lamports.
 */

export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Branded type so a raw `bigint` can't be passed where lamports are expected. */
export type Lamports = bigint & { readonly __brand: "Lamports" };

export function lamports(value: bigint): Lamports {
  if (value < 0n) throw new RangeError("lamports cannot be negative");
  return value as Lamports;
}

export const ZERO = lamports(0n);

/** Parse a user-entered SOL string into lamports without float rounding. */
export function solToLamports(sol: string | number): Lamports {
  const s = typeof sol === "number" ? sol.toString() : sol.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new RangeError(`invalid SOL amount: ${sol}`);
  }
  const parts = s.split(".");
  const whole = parts[0] || "0";
  const frac = parts[1] ?? "";
  const fracPadded = (frac + "000000000").slice(0, 9);
  return lamports(BigInt(whole) * LAMPORTS_PER_SOL + BigInt(fracPadded));
}

/** Format lamports as a SOL string, trimming trailing zeros. */
export function lamportsToSol(value: Lamports, maxDecimals = 4): string {
  const whole = value / LAMPORTS_PER_SOL;
  const frac = value % LAMPORTS_PER_SOL;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(9, "0").slice(0, maxDecimals).replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

export function addL(a: Lamports, b: Lamports): Lamports {
  return lamports(a + b);
}

export function subL(a: Lamports, b: Lamports): Lamports {
  return lamports(a - b);
}

/** Take `bps` basis points (1 bps = 0.01%) of an amount, rounding down. */
export function bpsOf(amount: Lamports, bps: number): Lamports {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new RangeError(`bps out of range: ${bps}`);
  }
  return lamports((amount * BigInt(bps)) / 10_000n);
}

/**
 * Split `amount` across `weights` proportionally, distributing the rounding
 * remainder deterministically to the largest weights first. The returned
 * shares always sum to exactly `amount` — no dust is created or lost.
 */
export function proportionalSplit(
  amount: Lamports,
  weights: readonly bigint[],
): Lamports[] {
  const total = weights.reduce((a, b) => a + b, 0n);
  if (total === 0n) return weights.map(() => ZERO);

  const base = weights.map((w) => (amount * w) / total);
  let distributed = base.reduce((a, b) => a + b, 0n);
  let remainder = amount - distributed;

  // Give leftover lamports to the largest weights first (stable, fair, exact).
  const order = weights
    .map((w, i) => ({ w, i }))
    .sort((a, b) => (b.w > a.w ? 1 : b.w < a.w ? -1 : a.i - b.i));

  const shares = [...base];
  let idx = 0;
  while (remainder > 0n) {
    const target = order[idx % order.length]!.i;
    shares[target] = shares[target]! + 1n;
    remainder -= 1n;
    idx++;
  }
  return shares.map((s) => lamports(s));
}
