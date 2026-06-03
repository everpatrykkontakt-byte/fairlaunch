# FairLaunch

**A fair-launch commitment layer for community token launches.** Communities
form *before* a token exists. Backers claim slots; when every slot fills, the
campaign's pool wallet executes one atomic create-and-buy — so every backer
enters at the identical price, the creator holds 0%, and a share of trading
fees flows back to backers proportional to their stake. If a launch never
fills, every backer is refunded 100%.

> This is a **production skeleton**: a clean, well-tested architecture with the
> blockchain and database behind swappable adapters. It runs end-to-end out of
> the box on a deterministic in-memory mock — no secrets, no RPC, no funds at
> risk — and is structured so a real Solana backend can be dropped in without
> touching business logic.

## Why this is more reliable than a typical launchpad

- **Integer-lamport accounting.** All money is exact `bigint` lamports
  (`src/lib/money.ts`); floating-point SOL only appears at the display edge.
  `proportionalSplit` distributes fees with a deterministic remainder so the
  shares always sum to the input exactly — no dust is created or lost.
- **Race-free slot claims.** Every read-then-write goes through a per-campaign
  async lock (`withCampaignLock`), so concurrent backers can't grab the same
  slot, refunds can't double-spend, and fees can't be paid twice.
- **A real state machine.** `src/domain/stateMachine.ts` is the only place a
  campaign's status changes; illegal lifecycle jumps (relaunching a live token,
  backing a failed campaign) are impossible by construction.
- **Constrained chain surface.** The `ChainAdapter` interface
  (`src/chain/types.ts`) gives a pool wallet exactly two value-moving powers —
  **launch** or **refund**. There is no generic "transfer from pool", which
  structurally prevents fund misuse from the API.
- **Typed `Result` everywhere.** The service layer never throws across
  boundaries; every failure mode is part of the signature and maps to a stable
  HTTP status.
- **Idempotency.** Backing accepts an idempotency key; the refund cron is safe
  to run repeatedly.
- **Validated edges.** Every API route parses input through Zod before any
  business logic runs.

## Architecture

```
src/
  domain/     Pure business rules — types, config/limits, state machine, fee math, slots
  lib/        Result, lamport money, validation (zod), serialization, formatting, http
  chain/      ChainAdapter interface + deterministic MockChainAdapter (swap for Solana)
  data/       Store interface + in-memory implementation with per-campaign locking + seed
  services/   launchpad.ts — the orchestration layer (submit/back/withdraw/launch/refund/fees)
  app/        Next.js App Router — UI pages + JSON API routes
  components/  UI: Nav, WalletProvider (mock), CampaignCard, SlotGrid, primitives
```

Dependencies flow inward only: UI → services → domain/data/chain. Services
depend on the `Store` and `ChainAdapter` *interfaces*, never concrete backends.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000  (seeded demo data)
npm run typecheck  # strict TS, no emit
npm test           # unit tests for money, fee math, state machine
```

No `.env` is required for the mock. See `.env.example` for the variables a real
backend would use.

## Lifecycle & API

```
draft → backing → funded → launching → live
              ↘ refunding → failed
```

| Method | Route                          | Purpose                                  |
| ------ | ------------------------------ | ---------------------------------------- |
| GET    | `/api/campaigns`               | list (optional `?status=`)               |
| POST   | `/api/campaigns`               | submit a new launch                      |
| GET    | `/api/campaigns/:id`           | campaign detail + slots + backings        |
| POST   | `/api/campaigns/:id/back`      | claim a slot (idempotency-key aware)     |
| POST   | `/api/campaigns/:id/withdraw`  | withdraw during backing (2% fee)         |
| POST   | `/api/campaigns/:id/launch`    | creator-only atomic create+buy+distribute|
| POST   | `/api/campaigns/:id/claim`     | claim accrued trading fees               |
| POST   | `/api/campaigns/:id/accrue`    | **demo** — simulate trading-fee revenue  |
| POST   | `/api/campaigns/:id/buyback`   | collect creator-fee commission → buy back & burn the token |
| GET    | `/api/wallet/:address`         | portfolio                                |
| GET    | `/api/leaderboard`             | top launches + creators                  |
| GET\|POST | `/api/cron/deadlines`       | enforce refund safety nets (idempotent)  |
| GET    | `/api/config`                  | public protocol limits + presets         |

## Real mainnet mode (Pump.fun) — ⚠️ real money

A real Solana adapter is **implemented** in `src/chain/solanaChain.ts`. It
performs the actual Pump.fun atomic `createV2 + buy` (creator = escrow, so dev
holds 0%), distributes tokens to backers proportionally from the on-chain pool
balance, verifies backer deposits on-chain, and refunds from the pool wallet.
Pool keys are generated server-side and encrypted at rest (AES-256-GCM).

> ### Read this before switching it on
> This path **moves real money on mainnet** and is **untested in this project** —
> it is ported from a reference implementation but has not been executed here.
> Before any public use you **must**:
> 1. Test on a throwaway wallet with tiny amounts (e.g. 0.01 SOL).
> 2. Get the key-custody + launch flow **independently audited**.
> 3. Accept that pool wallets hold real user SOL; a bug loses funds. The
>    reference itself ships "not formally audited."

### Simplest option: PumpPortal

If you want the *smallest* real Pump.fun integration, set `CHAIN_ADAPTER=pumpportal`.
`src/chain/pumpPortalChain.ts` extends the Solana adapter and overrides only the
launch step: it asks **PumpPortal's `trade-local` API** to build the create +
dev-buy transaction, signs it (pool wallet + mint), and sends it — one HTTP call
plus a signature. Everything else (deposits, refunds, distribution, buyback-and-
burn) is inherited. It still needs `SOLANA_RPC_URL`, `ESCROW_PRIVATE_KEY`, and
`POOL_KEY_ENCRYPTION_KEY`, and still moves real money on mainnet.

### Full SDK option

To enable the hand-built SDK path instead:

```bash
CHAIN_ADAPTER=solana            # server: use the real adapter
NEXT_PUBLIC_CHAIN_ADAPTER=solana # client: Connect uses Phantom, real deposits
SOLANA_RPC_URL=...               # a paid RPC (public RPC rate-limits launches)
NEXT_PUBLIC_SOLANA_RPC_URL=...
ESCROW_PRIVATE_KEY=...           # base58 secret of the platform escrow wallet
POOL_KEY_ENCRYPTION_KEY=...      # openssl rand -base64 32
PUMP_ALT_ADDRESS=...             # optional ALT to keep the atomic tx in size
```

In this mode deposits are **non-custodial**: the backer signs and sends the SOL
transfer into the pool wallet from their own Phantom wallet, and the server only
verifies the resulting signature (`recordDeposit` → on-chain check) before
recording the backing. No service or UI logic changes — only env + Phantom.

### Buyback-and-burn (creator-fee → burn loop)

The intended deflationary mechanic: you launch the token (creator = escrow, so
dev holds 0% of supply but **is** the on-chain creator and earns Pump.fun's
creator-fee commission), then periodically **collect that commission, buy the
token back off the market, and burn it**.

- Service: `runBuyback()` in `src/services/launchpad.ts`.
- Chain: `collectCreatorFees()` + `buybackAndBurn()` on the adapter. The mock
  simulates both (demoable); the Solana adapter collects via the pump SDK and
  swaps SOL→token via **Jupiter v6**, then burns with an SPL burn instruction.
- Each live campaign tracks cumulative `tokensBurned` + `buybackSol`, shown in
  the UI ("🔥 Burned"). Trigger it from the campaign page or on a schedule.
- In real mode the endpoint is **creator-gated**.

Note: the Solana `collectCreatorFees` resolves the pump-sdk method dynamically —
confirm the exact entry point for your SDK version (it throws a clear error if
not found). Everything here is real-money + untested; see the warning above.

The separate generic per-backer fee *accrual* (`/accrue`) remains a mock-only
demo and is hard-disabled outside mock mode.

## Configurable per launch

Set at submit time (and surfaced in the UI):

- **Burn share (`burnSharePct`, 0–100%)** — how much of the collected creator
  commission is burned vs. paid to you as income. 100% = pure deflation; 70%
  = burn most, keep 30% as revenue.
- **Auto-buyback** — when on, the cron (`/api/cron/deadlines`) runs the
  buyback-and-burn automatically for the launch (skipping dust below
  `DEFAULT_MIN_BUYBACK_SOL`).
- **Slots / min per slot / max per slot / backing window / fee split** — the
  usual launch parameters.

The token page shows a **tokenomics panel** (1B supply, 0% dev, % burned,
circulating estimate, SOL bought back, creator income) and a **burn history**
of every buyback run. The launches list supports sorting (newest, closing soon,
most backed, most burned).

## Other swappable backends

- **Database:** implement `Store` in `src/data/pgStore.ts` (Postgres), register
  it in `src/data/index.ts`, set `DATA_STORE=postgres`. The `withCampaignLock`
  contract maps naturally to `SELECT … FOR UPDATE`.
- **Cron:** point a scheduler at `/api/cron/deadlines` with `CRON_SECRET` set.

## Notes

Demo data resets whenever the dev server restarts. The mock chain mints tokens
whose address ends in `pooL` as a verifiable marker, mirroring the original
concept. Meme coins are highly speculative — this skeleton is for building and
evaluation, not investment advice.
