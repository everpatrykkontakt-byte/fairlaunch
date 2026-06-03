import { fakePubkey, fakeSignature, base58 } from "@/lib/id";
import { proportionalSplit, type Lamports } from "@/lib/money";
import type {
  ChainAdapter,
  LaunchParams,
  LaunchResult,
  TxResult,
} from "./types";

/**
 * Deterministic in-memory chain. No network, no secrets, no risk. It produces
 * realistic-looking signatures/mints and exact token allocations so the whole
 * UI and service flow can be exercised end-to-end and tested.
 *
 * The mint address ends in "pooL" (like the original's verifiable suffix) so
 * launched tokens are visually distinguishable.
 */
const TOTAL_SUPPLY = 1_000_000_000n; // tokens minted on launch (whole units)
const TOKEN_DECIMALS = 6n;
const SUPPLY_BASE_UNITS = TOTAL_SUPPLY * 10n ** TOKEN_DECIMALS;

export class MockChainAdapter implements ChainAdapter {
  readonly name = "mock";

  async createPoolWallet(_campaignId: string): Promise<{ address: string; secret: string }> {
    return { address: fakePubkey(), secret: "" };
  }

  async recordDeposit(_params: {
    poolWallet: string;
    from: string;
    amount: Lamports;
    depositTx?: string;
  }): Promise<TxResult> {
    return { signature: fakeSignature() };
  }

  async refund(_params: {
    poolWallet: string;
    poolSecret: string;
    to: string;
    amount: Lamports;
  }): Promise<TxResult> {
    return { signature: fakeSignature() };
  }

  async launch(params: LaunchParams): Promise<LaunchResult> {
    const mintAddress = mintWithSuffix();
    const signature = fakeSignature();

    const weights = params.allocations.map((a) => a.contribution as bigint);
    // 80% of supply to backers (the dev-buy), mirroring an atomic create+buy
    // where the pool's SOL purchases the bulk of the curve. The remainder
    // stays on the curve for the open market.
    const backerSupply = (SUPPLY_BASE_UNITS * 80n) / 100n;
    const shares = proportionalSplit(backerSupply as Lamports, weights);

    const distributions = params.allocations.map((a, i) => ({
      backingId: a.backingId,
      backerWallet: a.backerWallet,
      tokens: (shares[i] ?? 0n) as bigint,
      tx: fakeSignature(),
    }));

    return { mintAddress, signature, distributions };
  }

  async payoutFees(_params: { to: string; amount: Lamports }): Promise<TxResult> {
    return { signature: fakeSignature() };
  }

  async collectCreatorFees(_params: { mint: string }): Promise<{
    amount: Lamports;
    signature: string;
  }> {
    // Simulate ~0.1 SOL of creator-fee commission accrued since the last run.
    return { amount: 100_000_000n as Lamports, signature: fakeSignature() };
  }

  async buybackAndBurn(params: { mint: string; amount: Lamports }): Promise<{
    tokensBurned: bigint;
    buyTx: string;
    burnTx: string;
  }> {
    // Simulate a deterministic curve price: 1 SOL ≈ 2,000,000 tokens (6 dp).
    const tokensBurned = (BigInt(params.amount) * 2_000_000n) / 1_000_000_000n * 10n ** TOKEN_DECIMALS;
    return { tokensBurned, buyTx: fakeSignature(), burnTx: fakeSignature() };
  }

  explorerUrl(signatureOrAddress: string): string {
    return `https://explorer.solana.com/address/${signatureOrAddress}?cluster=devnet`;
  }
}

/**
 * Produce a fake mint pubkey ending with "pooL". A real vanity grinder would
 * brute-force the keypair; the mock just stamps the suffix so the UI shows the
 * same verifiable marker as a real launch.
 */
function mintWithSuffix(): string {
  return fakePubkey().slice(0, -4) + "pooL";
}

export { base58, SUPPLY_BASE_UNITS, TOKEN_DECIMALS };
