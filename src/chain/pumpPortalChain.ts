/**
 * The "very simple" real Pump.fun integration.
 *
 * Instead of hand-assembling the createV2+buy with @pump-fun/pump-sdk, ALTs and
 * compute budgets, this adapter asks **PumpPortal's local-transaction API**
 * (https://pumpportal.fun/api/trade-local) to build the create+dev-buy
 * transaction for us. We just sign it (pool wallet + mint) and send it. That is
 * the whole launch — one HTTP call plus a signature.
 *
 * Everything else (deposit verification, refunds, fee payout, buyback-and-burn,
 * and token distribution to backers) is inherited unchanged from the full
 * Solana adapter, so this stays tiny.
 *
 * Activate with CHAIN_ADAPTER=pumpportal. Still real mainnet money — same
 * warnings as the solana adapter apply. PumpPortal charges a small fee on
 * trades it builds.
 */
import { Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";

import type { LaunchParams, LaunchResult } from "./types";
import {
  SolanaChainAdapter,
  uploadMetadata,
  CREATE_RESERVE_LAMPORTS,
  sleep,
} from "./solanaChain";

const PUMPPORTAL_LOCAL_URL = "https://pumpportal.fun/api/trade-local";

export class PumpPortalChainAdapter extends SolanaChainAdapter {
  override readonly name = "pumpportal";

  override async launch(params: LaunchParams): Promise<LaunchResult> {
    const conn = this.conn;
    const poolKp = this.poolKeypair(params.poolSecret, params.poolWallet);
    const mintKp = Keypair.generate();

    const poolBal = await conn.getBalance(poolKp.publicKey);
    const spendLamports = poolBal - CREATE_RESERVE_LAMPORTS;
    if (spendLamports <= 0) throw new Error("pool balance too low for create + buy");
    const spendSol = spendLamports / LAMPORTS_PER_SOL;

    if (!params.imageUrl) throw new Error("a token image URL is required for a real launch");
    const metadataUri = await uploadMetadata(params);

    // 1) Ask PumpPortal to build the atomic create + dev-buy transaction.
    const res = await fetch(PUMPPORTAL_LOCAL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        publicKey: poolKp.publicKey.toBase58(),
        action: "create",
        tokenMetadata: { name: params.name, symbol: params.symbol, uri: metadataUri },
        mint: mintKp.publicKey.toBase58(),
        denominatedInSol: "true",
        amount: spendSol, // dev-buy size = the whole pool (minus reserve)
        slippage: 10,
        priorityFee: 0.0005,
        pool: "pump",
      }),
    });
    if (!res.ok) {
      throw new Error(`PumpPortal build failed: ${res.status} ${await res.text()}`);
    }

    // 2) Sign (pool = payer/buyer, mint = new token) and send.
    const tx = VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
    tx.sign([mintKp, poolKp]);
    const signature = await conn.sendTransaction(tx, { skipPreflight: true, maxRetries: 5 });

    // 3) Wait for the mint to exist on-chain.
    const mint = mintKp.publicKey;
    let landed = false;
    const start = Date.now();
    while (Date.now() - start < 30_000 && !landed) {
      await sleep(800);
      if (await conn.getAccountInfo(mint, "processed")) landed = true;
    }
    if (!landed) throw new Error("PumpPortal launch did not land in 30s");

    // 4) Distribute the bought tokens to backers (shared logic).
    const distributions = await this.distributeAfterLaunch(mint, poolKp, params.allocations);
    return { mintAddress: mint.toBase58(), signature, distributions };
  }

  override explorerUrl(signatureOrAddress: string): string {
    return `https://pump.fun/coin/${signatureOrAddress}`;
  }
}
