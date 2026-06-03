import { randomUUID, randomBytes } from "node:crypto";

/** Opaque, URL-safe identifier. Uses crypto UUIDv4 under the hood. */
export function newId(prefix?: string): string {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Deterministic-looking fake on-chain signature/pubkey for the mock chain.
 * 88-char base58-ish string so the UI renders like the real thing.
 */
export function fakeSignature(): string {
  return base58(randomBytes(64));
}

export function fakePubkey(): string {
  return base58(randomBytes(32));
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58(bytes: Buffer): string {
  let num = BigInt("0x" + bytes.toString("hex"));
  let out = "";
  while (num > 0n) {
    const rem = Number(num % 58n);
    num /= 58n;
    out = ALPHABET[rem] + out;
  }
  // preserve leading zero bytes as '1'
  for (const b of bytes) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out;
}
