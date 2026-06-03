import type { ChainAdapter } from "./types";
import { MockChainAdapter } from "./mockChain";

/**
 * Adapter selector. Defaults to the mock. To add a real backend, implement
 * `ChainAdapter` in src/chain/solanaChain.ts and wire it here behind
 * CHAIN_ADAPTER=solana — no service code changes required.
 */
let singleton: ChainAdapter | null = null;

export function getChain(): ChainAdapter {
  if (singleton) return singleton;

  const which = process.env.CHAIN_ADAPTER ?? "mock";
  switch (which) {
    case "mock":
      singleton = new MockChainAdapter();
      break;
    case "solana": {
      // Lazy require so the (heavy) Solana deps only load when actually used,
      // and a mock-only deployment never pays for them.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SolanaChainAdapter } = require("./solanaChain");
      singleton = new SolanaChainAdapter();
      break;
    }
    case "pumpportal": {
      // The simplest real Pump.fun launch: PumpPortal builds the tx, we sign it.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PumpPortalChainAdapter } = require("./pumpPortalChain");
      singleton = new PumpPortalChainAdapter();
      break;
    }
    default:
      throw new Error(`unknown CHAIN_ADAPTER: ${which}`);
  }
  return singleton!;
}

export type { ChainAdapter } from "./types";
