/**
 * Client-side, non-custodial deposit. In real (solana) mode the backer signs
 * and sends the SOL transfer into the campaign's pool wallet *from their own
 * wallet* (Phantom); the server only verifies the resulting signature. The
 * heavy web3.js dependency is dynamically imported so it never bloats the
 * mock-mode bundle.
 *
 * Returns the deposit transaction signature to pass to POST /api/campaigns/:id/back.
 */

const LAMPORTS_PER_SOL = 1_000_000_000;

interface PhantomProvider {
  publicKey?: { toString(): string };
  signAndSendTransaction: (tx: unknown) => Promise<{ signature: string }>;
}

export async function depositToPool(
  poolWallet: string,
  amountSol: string,
): Promise<string> {
  const provider = (globalThis as unknown as { solana?: PhantomProvider }).solana;
  if (!provider?.publicKey) throw new Error("wallet not connected");

  const web3 = await import("@solana/web3.js");
  const { Connection, PublicKey, SystemProgram, Transaction } = web3;

  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const conn = new Connection(endpoint, "confirmed");

  const from = new PublicKey(provider.publicKey.toString());
  const lamports = Math.round(Number(amountSol) * LAMPORTS_PER_SOL);
  if (!Number.isFinite(lamports) || lamports <= 0) throw new Error("invalid amount");

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: new PublicKey(poolWallet),
      lamports,
    }),
  );
  tx.feePayer = from;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

  const { signature } = await provider.signAndSendTransaction(tx);
  // Best-effort confirm; the server re-verifies regardless.
  try {
    await conn.confirmTransaction(signature, "confirmed");
  } catch {
    /* server will verify with retries */
  }
  return signature;
}
