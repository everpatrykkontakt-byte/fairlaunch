import { Card } from "@/components/ui";

export const metadata = { title: "How it works — FairLaunch" };

const STEPS = [
  {
    n: "01",
    title: "Submit",
    body: "A creator defines the token and sets 2–24 backer slots, a per-slot minimum, and a backing window (up to 72h). A small 0.02 SOL anti-spam fee applies. A dedicated pool wallet is provisioned for the campaign.",
  },
  {
    n: "02",
    title: "Back",
    body: "Backers claim slots first-come, first-served, depositing SOL into the campaign's pool wallet. Until slots fill, any backer can withdraw (a 2% fee applies) and their slot reopens.",
  },
  {
    n: "03",
    title: "Launch",
    body: "When every slot is claimed the creator triggers one atomic create-and-buy: the token is created and the entire pool balance buys it in the same transaction. Everyone enters at one price, there's no sniper gap, and the creator holds 0%.",
  },
  {
    n: "04",
    title: "Distribute & earn",
    body: "Each backer receives tokens proportional to their contribution. Afterwards, a share of trading fees accrues back to backers proportionally; claim any time.",
  },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold">How FairLaunch works</h1>
      <p className="mt-3 text-[var(--color-muted)]">
        A pre-launch commitment layer: the crowd forms before the token, everyone enters together at
        the same price, and the protocol guarantees a 100% refund if a launch never fills.
      </p>

      <div className="mt-8 space-y-4">
        {STEPS.map((s) => (
          <Card key={s.n} className="flex gap-4 p-5">
            <div className="mono text-xl font-bold text-[var(--color-brand)]">{s.n}</div>
            <div>
              <h2 className="font-semibold">{s.title}</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{s.body}</p>
            </div>
          </Card>
        ))}
      </div>

      <h2 className="mt-10 text-xl font-bold">Two refund safety nets</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold">Backing deadline</h3>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            If slots don&apos;t fill within the creator&apos;s window, every backer is automatically
            refunded 100% — no fee, no support ticket.
          </p>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold">Launch window</h3>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Once funded, the creator has 24 hours to launch. Miss it and everyone is refunded 100%,
            closing the abandonment hole.
          </p>
        </Card>
      </div>

      <h2 className="mt-10 text-xl font-bold">What makes this skeleton reliable</h2>
      <ul className="mt-3 space-y-2 text-sm text-[var(--color-muted)]">
        <li>
          <strong className="text-[var(--color-text)]">Integer-lamport accounting.</strong> All money
          is exact <span className="mono">bigint</span> lamports; floating-point SOL only appears at
          the display edge. No rounding drift.
        </li>
        <li>
          <strong className="text-[var(--color-text)]">Race-free slot claims.</strong> Every
          read-then-write runs under a per-campaign lock, so two backers can never grab the same slot
          and refunds can&apos;t double-spend.
        </li>
        <li>
          <strong className="text-[var(--color-text)]">A real state machine.</strong> Status changes
          go through one validated transition table — a live token can&apos;t relaunch, a failed
          campaign can&apos;t take backers.
        </li>
        <li>
          <strong className="text-[var(--color-text)]">Swappable chain adapter.</strong> Services
          depend on a narrow interface whose pool wallet can only launch or refund — never an
          arbitrary transfer. The mock can be replaced with real Solana without touching business
          logic.
        </li>
        <li>
          <strong className="text-[var(--color-text)]">Idempotent everything.</strong> Backing
          accepts an idempotency key; refund cron is safe to run repeatedly.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-bold">Mock vs. real mainnet</h2>
      <p className="mt-3 text-sm text-[var(--color-muted)]">
        By default this runs on a deterministic in-memory chain — real flows, no
        real money, safe to explore. A real{" "}
        <span className="mono">solana</span> adapter is implemented (Pump.fun
        atomic create+buy, on-chain deposit verification, proportional token
        distribution, pool-key encryption) and activates via{" "}
        <span className="mono">CHAIN_ADAPTER=solana</span>. In real mode deposits
        are non-custodial: the backer signs the SOL transfer from their own
        wallet and the server only verifies it on-chain.
      </p>
      <p className="mt-2 rounded-lg bg-[var(--color-warn)]/10 px-3 py-2 text-sm text-[var(--color-warn)]">
        ⚠️ Real mode moves real money on mainnet and is untested here. Test with
        tiny amounts and get an audit before any public launch.
      </p>
    </div>
  );
}
