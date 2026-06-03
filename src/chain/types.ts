import type { Lamports } from "@/lib/money";

/**
 * The contract between the launchpad services and "the chain". The mock
 * adapter implements it in-memory; a real implementation (src/chain/solanaChain.ts)
 * would talk to Solana + the Pump-style program. Services depend ONLY on this
 * interface, so swapping the backend never touches business logic.
 *
 * Every method is intentionally narrow: the pool wallet can do exactly two
 * value-moving things — launch (atomic create+buy) or refund. There is no
 * generic "transfer from pool" method, which structurally prevents fund
 * misuse from the API surface.
 */
export interface ChainAdapter {
  readonly name: string;

  /**
   * Provision a fresh pool wallet for a new campaign. Returns the public
   * address plus an opaque, already-encrypted secret blob the caller must
   * persist (server-side only) and hand back to refund/launch. The mock
   * returns an empty secret; the Solana adapter returns an AES-GCM ciphertext.
   */
  createPoolWallet(campaignId: string): Promise<{ address: string; secret: string }>;

  /**
   * Record a backer's deposit into the pool wallet. In a non-custodial real
   * deployment the backer signs the SOL transfer with their own wallet and
   * passes `depositTx`; the adapter verifies it on-chain (correct sender,
   * recipient, and amount) before returning. The mock ignores `depositTx`.
   */
  recordDeposit(params: {
    poolWallet: string;
    from: string;
    amount: Lamports;
    depositTx?: string;
  }): Promise<TxResult>;

  /** Refund a single backer from the pool wallet (signed by the pool key). */
  refund(params: {
    poolWallet: string;
    poolSecret: string;
    to: string;
    amount: Lamports;
  }): Promise<TxResult>;

  /**
   * Atomic create + buy: the entire pool balance buys the new token in the
   * same transaction, so every backer enters at one price and the creator
   * holds nothing. Returns the new mint and per-backer token allocations.
   */
  launch(params: LaunchParams): Promise<LaunchResult>;

  /** Pay accrued, claimable fee revenue out to a backer. */
  payoutFees(params: {
    to: string;
    amount: Lamports;
  }): Promise<TxResult>;

  /**
   * Collect the token's accrued Pump.fun creator-fee commission into the
   * platform escrow (which is the token's on-chain creator ⇒ dev holds 0% but
   * still earns the creator-fee stream). Returns how much SOL was collected.
   */
  collectCreatorFees(params: { mint: string }): Promise<{
    amount: Lamports;
    signature: string;
  }>;

  /**
   * Buyback-and-burn: spend `amount` SOL buying the token back off the market
   * (Jupiter/curve) and permanently burn what was bought. This is the
   * deflationary loop — fund it from collectCreatorFees. Returns the amount
   * burned (token base units) and the swap/burn signatures.
   */
  buybackAndBurn(params: { mint: string; amount: Lamports }): Promise<{
    tokensBurned: bigint;
    buyTx: string;
    burnTx: string;
  }>;

  /** Build an explorer URL for a signature or address. */
  explorerUrl(signatureOrAddress: string): string;
}

export interface TxResult {
  signature: string;
}

export interface LaunchParams {
  campaignId: string;
  poolWallet: string;
  poolSecret: string;
  name: string;
  symbol: string;
  imageUrl: string;
  /** Weighted allocation: each backer's lamports contribution. */
  allocations: { backerWallet: string; backingId: string; contribution: Lamports }[];
}

export interface LaunchResult {
  mintAddress: string;
  signature: string;
  /** Token base-units distributed to each backing, proportional to contribution. */
  distributions: { backingId: string; backerWallet: string; tokens: bigint; tx: string }[];
}
