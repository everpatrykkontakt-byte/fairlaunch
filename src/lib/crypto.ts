import crypto from "node:crypto";

/**
 * Server-only secret handling. Used exclusively by the real Solana adapter to
 * encrypt per-campaign pool-wallet private keys at rest and to verify wallet
 * signatures. The mock adapter never touches this file.
 *
 * Pool keys are encrypted with AES-256-GCM. The 32-byte key is derived from
 * POOL_KEY_ENCRYPTION_KEY via SHA-256, so any sufficiently random secret works
 * (generate one with `openssl rand -base64 32`). NEVER commit the real value.
 */

function getEncryptionKey(): Buffer {
  const key = process.env.POOL_KEY_ENCRYPTION_KEY;
  if (!key || key.length < 16) {
    throw new Error(
      "POOL_KEY_ENCRYPTION_KEY is required (>=16 chars) for the Solana adapter",
    );
  }
  return crypto.createHash("sha256").update(key).digest();
}

/** Encrypt a base58 secret key. Format: "aes:<iv>:<tag>:<ct>" (all base64). */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(encrypted: string): string {
  if (!encrypted.startsWith("aes:")) {
    throw new Error("unrecognized encrypted secret format");
  }
  const parts = encrypted.split(":");
  if (parts.length !== 4) throw new Error("malformed encrypted secret");
  const key = getEncryptionKey();
  const iv = Buffer.from(parts[1]!, "base64");
  const tag = Buffer.from(parts[2]!, "base64");
  const ct = Buffer.from(parts[3]!, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export const MAX_SIG_AGE_MS = 5 * 60 * 1000;

/**
 * Verify a timestamped, signed authorization message (replay-protected).
 * Message format: "<prefix>:<unix_ms>". Used to authenticate sensitive,
 * wallet-owner-only actions (e.g. claiming fees) without a session system.
 */
export function verifySignedMessage(
  expectedPrefix: string,
  message: string,
  signatureB58: string,
  walletAddress: string,
): { ok: true } | { ok: false; error: string } {
  if (!message.startsWith(`${expectedPrefix}:`)) {
    return { ok: false, error: "invalid signature message" };
  }
  const ts = parseInt(message.slice(expectedPrefix.length + 1), 10);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { ok: false, error: "invalid signature timestamp" };
  }
  if (Math.abs(Date.now() - ts) > MAX_SIG_AGE_MS) {
    return { ok: false, error: "signature expired — please retry" };
  }
  if (!verifyWalletSignature(message, signatureB58, walletAddress)) {
    return { ok: false, error: "invalid wallet signature" };
  }
  return { ok: true };
}

/**
 * Verify an ed25519 signature for a message from a Solana wallet. Imports are
 * dynamic so this module stays loadable even when the Solana deps aren't
 * installed (mock-only deployments).
 */
export function verifyWalletSignature(
  message: string,
  signatureB58: string,
  walletAddress: string,
): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bs58 = require("bs58").default ?? require("bs58");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nacl = require("tweetnacl");
    const sig = bs58.decode(signatureB58);
    const pub = bs58.decode(walletAddress);
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pub);
  } catch {
    return false;
  }
}
