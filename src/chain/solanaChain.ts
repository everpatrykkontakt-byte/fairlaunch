/**
 * REAL Solana / Pump.fun chain adapter.
 *
 * ⚠️ THIS MOVES REAL MONEY ON MAINNET. It is ported faithfully from the
 * reference implementation's proven launch path but is **untested in this
 * project**. Before any public use you MUST:
 *   1. Test on a throwaway wallet with tiny amounts.
 *   2. Have the key-custody + launch flow independently audited.
 *   3. Understand that pool wallets hold real user SOL; a bug loses funds.
 *
 * Activated only when CHAIN_ADAPTER=solana. Requires:
 *   SOLANA_RPC_URL            a real (ideally paid) RPC endpoint
 *   ESCROW_PRIVATE_KEY        base58 secret key of the platform escrow wallet
 *   POOL_KEY_ENCRYPTION_KEY   secret used to encrypt pool keys at rest
 *   PUMP_ALT_ADDRESS          (optional) address-lookup-table to compress the
 *                             atomic create+buy tx; recommended on mainnet
 *
 * The design keeps the pool wallet's powers narrow: it can only refund backers
 * or perform the single atomic create+buy+distribute. There is no arbitrary
 * "transfer from pool" path.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  createBurnInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
} from "@solana/spl-token";
import { PumpSdk, OnlinePumpSdk, getBuyTokenAmountFromSolAmount } from "@pump-fun/pump-sdk";
import BN from "bn.js";
import bs58 from "bs58";

import { proportionalSplit, type Lamports } from "@/lib/money";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type {
  ChainAdapter,
  LaunchParams,
  LaunchResult,
  TxResult,
} from "./types";

export const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
export const CREATE_RESERVE_LAMPORTS = 35_000_000; // ~0.035 SOL for createV2 + ATA + fees
const PER_BACKER_GAS_LAMPORTS = 2_500_000; // ATA rent + fee, funded from escrow

export class SolanaChainAdapter implements ChainAdapter {
  readonly name: string = "solana";
  protected conn: Connection;

  constructor() {
    this.conn = new Connection(RPC_URL, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60_000,
    });
  }

  protected escrow(): Keypair {
    const sk = process.env.ESCROW_PRIVATE_KEY;
    if (!sk) throw new Error("ESCROW_PRIVATE_KEY is required for the Solana adapter");
    return Keypair.fromSecretKey(bs58.decode(sk));
  }

  protected poolKeypair(secretEnc: string, expectedAddress: string): Keypair {
    const kp = Keypair.fromSecretKey(bs58.decode(decryptSecret(secretEnc)));
    if (kp.publicKey.toBase58() !== expectedAddress) {
      throw new Error("pool wallet key mismatch");
    }
    return kp;
  }

  async createPoolWallet(): Promise<{ address: string; secret: string }> {
    const kp = Keypair.generate();
    return {
      address: kp.publicKey.toBase58(),
      secret: encryptSecret(bs58.encode(kp.secretKey)),
    };
  }

  /**
   * Verify a backer-signed deposit on-chain: the sender spent ≥ amount and the
   * pool received ≥ amount (with small tolerances for fees/rounding). Mirrors
   * the reference `verifyPoolDeposit`.
   */
  async recordDeposit(params: {
    poolWallet: string;
    from: string;
    amount: Lamports;
    depositTx?: string;
  }): Promise<TxResult> {
    if (!params.depositTx) {
      throw new Error("depositTx is required in real (non-custodial) mode");
    }
    const amountSol = Number(params.amount) / LAMPORTS_PER_SOL;

    let tx = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      await sleep((attempt + 1) * 2000);
      tx = await this.conn.getTransaction(params.depositTx, {
        maxSupportedTransactionVersion: 0,
      });
      if (tx?.meta) break;
    }
    if (!tx?.meta) throw new Error("deposit transaction not found");

    const keys = tx.transaction.message
      .getAccountKeys()
      .staticAccountKeys.map((k) => k.toBase58());
    const sIdx = keys.indexOf(params.from);
    const pIdx = keys.indexOf(params.poolWallet);
    if (sIdx === -1) throw new Error("sender not present in deposit tx");
    if (pIdx === -1) throw new Error("pool wallet not present in deposit tx");

    const senderSpent = (tx.meta.preBalances[sIdx]! - tx.meta.postBalances[sIdx]!) / LAMPORTS_PER_SOL;
    const poolGot = (tx.meta.postBalances[pIdx]! - tx.meta.preBalances[pIdx]!) / LAMPORTS_PER_SOL;
    if (senderSpent < amountSol * 0.99 || poolGot < amountSol * 0.97) {
      throw new Error("deposit amount does not match the claimed backing");
    }
    return { signature: params.depositTx };
  }

  async refund(params: {
    poolWallet: string;
    poolSecret: string;
    to: string;
    amount: Lamports;
  }): Promise<TxResult> {
    const poolKp = this.poolKeypair(params.poolSecret, params.poolWallet);
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: poolKp.publicKey,
        toPubkey: new PublicKey(params.to),
        lamports: Number(params.amount),
      }),
    );
    tx.recentBlockhash = (await this.conn.getLatestBlockhash()).blockhash;
    tx.feePayer = poolKp.publicKey;
    const signature = await this.conn.sendTransaction(tx, [poolKp]);
    return { signature };
  }

  async payoutFees(params: { to: string; amount: Lamports }): Promise<TxResult> {
    const escrow = this.escrow();
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: escrow.publicKey,
        toPubkey: new PublicKey(params.to),
        lamports: Number(params.amount),
      }),
    );
    tx.recentBlockhash = (await this.conn.getLatestBlockhash()).blockhash;
    tx.feePayer = escrow.publicKey;
    const signature = await this.conn.sendTransaction(tx, [escrow]);
    return { signature };
  }

  async launch(params: LaunchParams): Promise<LaunchResult> {
    const conn = this.conn;
    const escrow = this.escrow();
    const poolKp = this.poolKeypair(params.poolSecret, params.poolWallet);
    const mintKp = Keypair.generate();
    const mint = mintKp.publicKey;

    const poolBal = await conn.getBalance(poolKp.publicKey);
    if (poolBal <= 0) throw new Error("pool wallet has no SOL");
    const spend = poolBal - CREATE_RESERVE_LAMPORTS;
    if (spend <= 0) throw new Error("pool balance too low for createV2 + buy");

    if (!params.imageUrl) throw new Error("a token image URL is required for a real launch");
    const metadataUri = await uploadMetadata(params);

    const online = new OnlinePumpSdk(conn);
    const sdk = new PumpSdk();
    const global = await online.fetchGlobal();

    const estTokens = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig: null,
      mintSupply: null,
      bondingCurve: null,
      amount: new BN(spend.toString()),
      quoteMint: NATIVE_MINT,
    });
    const wantTokens = estTokens.muln(97).divn(100); // small rounding margin
    if (wantTokens.lten(0)) throw new Error("computed token amount is zero");

    // creator = escrow → the token's on-chain creator buys nothing ⇒ dev 0%.
    const builtIxs = await sdk.createV2AndBuyInstructions({
      global,
      mint,
      name: params.name,
      symbol: params.symbol,
      uri: metadataUri,
      creator: escrow.publicKey,
      user: poolKp.publicKey,
      amount: wantTokens,
      solAmount: new BN(spend.toString()),
      mayhemMode: false,
      cashback: false,
    });

    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 700_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2_000_000 }),
      ...builtIxs,
    ];

    // Optional ALT to keep the atomic tx within size limits (recommended).
    const altAddr = process.env.PUMP_ALT_ADDRESS;
    const altAccounts = [];
    if (altAddr) {
      const alt = (await conn.getAddressLookupTable(new PublicKey(altAddr))).value;
      if (alt) altAccounts.push(alt);
    }

    // One signed atomic tx; resend until the mint account exists.
    let landed = false;
    let lastSig: string | undefined;
    const start = Date.now();
    while (Date.now() - start < 30_000 && !landed) {
      try {
        const { blockhash } = await conn.getLatestBlockhash("processed");
        const msg = new TransactionMessage({
          payerKey: poolKp.publicKey,
          recentBlockhash: blockhash,
          instructions,
        }).compileToV0Message(altAccounts);
        const tx = new VersionedTransaction(msg);
        tx.sign([poolKp, mintKp]);
        lastSig = await conn.sendTransaction(tx, { skipPreflight: true, maxRetries: 5 });
      } catch {
        /* transient send error — retry */
      }
      for (let i = 0; i < 4 && !landed; i++) {
        await sleep(400);
        if (await conn.getAccountInfo(mint, "processed")) landed = true;
      }
    }
    if (!landed) throw new Error("launch transaction did not land in 30s");

    const distributions = await this.distributeAfterLaunch(mint, poolKp, params.allocations);
    return { mintAddress: mint.toBase58(), signature: lastSig!, distributions };
  }

  /**
   * Shared post-launch step: read how many tokens the pool actually received,
   * split them proportionally to each backer's contribution, and transfer.
   * Escrow tops up the pool's gas first (it spent its SOL on the buy). Made
   * `protected` so simpler launch backends (e.g. the PumpPortal adapter) can
   * reuse the exact same distribution logic.
   */
  protected async distributeAfterLaunch(
    mint: PublicKey,
    poolKp: Keypair,
    allocations: LaunchParams["allocations"],
  ): Promise<LaunchResult["distributions"]> {
    const conn = this.conn;
    const escrow = this.escrow();
    const tokenProgram = await getMintTokenProgram(conn, mint);
    const poolAta = await getAssociatedTokenAddress(mint, poolKp.publicKey, true, tokenProgram);

    let received = 0n;
    for (let i = 0; i < 10; i++) {
      try {
        const acct = await getAccount(conn, poolAta, "confirmed", tokenProgram);
        received = acct.amount;
        if (received > 0n) break;
      } catch {
        /* ata not visible yet */
      }
      await sleep(1200);
    }
    if (received <= 0n) throw new Error("launched but pool received no tokens");

    const weights = allocations.map((a) => a.contribution as bigint);
    const shares = proportionalSplit(received as Lamports, weights);

    const need = allocations.length * PER_BACKER_GAS_LAMPORTS;
    const have = await conn.getBalance(poolKp.publicKey);
    if (have < need) {
      const top = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: escrow.publicKey,
          toPubkey: poolKp.publicKey,
          lamports: need - have,
        }),
      );
      top.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      top.feePayer = escrow.publicKey;
      const ts = await conn.sendTransaction(top, [escrow]);
      await conn.confirmTransaction(ts, "confirmed");
    }

    const distributions: LaunchResult["distributions"] = [];
    for (let i = 0; i < allocations.length; i++) {
      const a = allocations[i]!;
      const tokens = shares[i] ?? 0n;
      try {
        const backer = new PublicKey(a.backerWallet);
        const backerAta = await getAssociatedTokenAddress(mint, backer, false, tokenProgram);
        const tx = new Transaction().add(
          createAssociatedTokenAccountIdempotentInstruction(
            poolKp.publicKey, backerAta, backer, mint, tokenProgram,
          ),
          createTransferInstruction(
            poolAta, backerAta, poolKp.publicKey, tokens, [], tokenProgram,
          ),
        );
        tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
        tx.feePayer = poolKp.publicKey;
        const sig = await conn.sendTransaction(tx, [poolKp]);
        await conn.confirmTransaction(sig, "confirmed");
        distributions.push({ backingId: a.backingId, backerWallet: a.backerWallet, tokens, tx: sig });
      } catch (e) {
        distributions.push({
          backingId: a.backingId,
          backerWallet: a.backerWallet,
          tokens,
          tx: `FAILED:${e instanceof Error ? e.message : "unknown"}`,
        });
      }
    }
    return distributions;
  }

  /**
   * Collect the token's accrued Pump.fun creator-fee commission into the
   * escrow (the on-chain creator). The exact SDK entry point varies by
   * @pump-fun/pump-sdk version, so it is resolved dynamically; if your version
   * exposes a different name, wire it here. We measure the actual SOL delta so
   * the returned amount is on-chain truth, not an estimate.
   */
  async collectCreatorFees(params: { mint: string }): Promise<{
    amount: Lamports;
    signature: string;
  }> {
    const conn = this.conn;
    const escrow = this.escrow();
    const online = new OnlinePumpSdk(conn);

    // Resolve the collect-creator-fee instruction builder across SDK versions.
    const anyOnline = online as unknown as Record<string, unknown>;
    const builder =
      (anyOnline.collectCoinCreatorFeeInstructions as undefined | ((...a: unknown[]) => Promise<unknown[]>)) ??
      (anyOnline.collectCreatorFeeInstructions as undefined | ((...a: unknown[]) => Promise<unknown[]>));
    if (typeof builder !== "function") {
      throw new Error(
        "creator-fee collection not available in this pump-sdk version — wire the correct method in solanaChain.collectCreatorFees",
      );
    }

    const before = await conn.getBalance(escrow.publicKey);
    const ixs = (await builder.call(online, escrow.publicKey, new PublicKey(params.mint))) as Awaited<ReturnType<typeof builder>>;
    const tx = new Transaction().add(...(ixs as Parameters<Transaction["add"]>));
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.feePayer = escrow.publicKey;
    const signature = await conn.sendTransaction(tx, [escrow]);
    await conn.confirmTransaction(signature, "confirmed");

    const after = await conn.getBalance(escrow.publicKey);
    const delta = Math.max(0, after - before);
    return { amount: BigInt(delta) as Lamports, signature };
  }

  /**
   * Buy the token back off the market via Jupiter and burn what was bought.
   * Escrow is the buyer + burner. Returns the burned base-unit amount.
   */
  async buybackAndBurn(params: { mint: string; amount: Lamports }): Promise<{
    tokensBurned: bigint;
    buyTx: string;
    burnTx: string;
  }> {
    const conn = this.conn;
    const escrow = this.escrow();
    const mint = new PublicKey(params.mint);
    const tokenProgram = await getMintTokenProgram(conn, mint);
    const escrowAta = await getAssociatedTokenAddress(mint, escrow.publicKey, false, tokenProgram);

    const before = await readTokenAmount(conn, escrowAta, tokenProgram);

    // 1) Jupiter v6 swap: SOL -> token, buyer = escrow.
    const quote = await fetchJson(
      `https://quote-api.jup.ag/v6/quote?inputMint=${NATIVE_MINT.toBase58()}` +
        `&outputMint=${params.mint}&amount=${params.amount.toString()}&slippageBps=300`,
    );
    const swap = (await fetchJson("https://quote-api.jup.ag/v6/swap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: escrow.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
      }),
    })) as { swapTransaction: string };

    const swapTx = VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction, "base64"));
    swapTx.sign([escrow]);
    const buyTx = await conn.sendTransaction(swapTx, { maxRetries: 5 });
    await conn.confirmTransaction(buyTx, "confirmed");

    // 2) Burn everything the buy produced.
    const after = await readTokenAmount(conn, escrowAta, tokenProgram);
    const bought = after - before;
    if (bought <= 0n) throw new Error("buyback produced no tokens to burn");

    const burn = new Transaction().add(
      createBurnInstruction(escrowAta, mint, escrow.publicKey, bought, [], tokenProgram),
    );
    burn.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    burn.feePayer = escrow.publicKey;
    const burnTx = await conn.sendTransaction(burn, [escrow]);
    await conn.confirmTransaction(burnTx, "confirmed");

    return { tokensBurned: bought, buyTx, burnTx };
  }

  explorerUrl(signatureOrAddress: string): string {
    return `https://solscan.io/account/${signatureOrAddress}`;
  }
}

async function readTokenAmount(
  conn: Connection,
  ata: PublicKey,
  tokenProgram: PublicKey,
): Promise<bigint> {
  try {
    return (await getAccount(conn, ata, "confirmed", tokenProgram)).amount;
  } catch {
    return 0n;
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

async function getMintTokenProgram(conn: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await conn.getAccountInfo(mint);
  if (info?.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

/** Upload token metadata to pump.fun's IPFS endpoint and return the URI. */
export async function uploadMetadata(params: LaunchParams): Promise<string> {
  const imageResponse = await fetch(params.imageUrl);
  if (!imageResponse.ok) throw new Error("failed to fetch token image");
  const imageBlob = await imageResponse.blob();

  const form = new FormData();
  form.append("file", imageBlob, "token.png");
  form.append("name", params.name);
  form.append("symbol", params.symbol);
  form.append("description", "");
  form.append("showName", "true");

  const res = await fetch("https://pump.fun/api/ipfs", { method: "POST", body: form });
  if (!res.ok) throw new Error(`metadata upload failed: ${res.statusText}`);
  const json = (await res.json()) as { metadataUri: string };
  return json.metadataUri;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
