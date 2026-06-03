"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type CampaignDTO } from "@/lib/clientApi";
import { useWallet } from "@/components/WalletProvider";
import { SlotGrid } from "@/components/SlotGrid";
import { StatusBadge, Card, Stat } from "@/components/ui";
import { Countdown } from "@/components/Countdown";
import { CopyButton } from "@/components/CopyButton";
import { shortAddr, relativeTime, formatTokens } from "@/lib/format";

type Msg = { tone: "ok" | "err"; text: string } | null;

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address, connected, connect, mode } = useWallet();
  const [c, setC] = useState<CampaignDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [amount, setAmount] = useState("");
  const [cfgBurn, setCfgBurn] = useState<number | null>(null);
  const [cfgAuto, setCfgAuto] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    const res = await api.getCampaign(id);
    if (res.ok) setC(res.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Sync the creator-settings drafts whenever the campaign loads/changes.
  useEffect(() => {
    if (c && cfgBurn === null) {
      setCfgBurn(c.burnSharePct);
      setCfgAuto(c.autoBuyback);
    }
  }, [c, cfgBurn]);

  if (loading) return <div className="py-20 text-center text-[var(--color-muted)]">Loading…</div>;
  if (!c)
    return (
      <div className="py-20 text-center">
        <p className="text-[var(--color-muted)]">Campaign not found.</p>
        <Link href="/" className="text-[var(--color-brand)] hover:underline">
          ← Back to launches
        </Link>
      </div>
    );

  const myBacking = c.backings.find(
    (b) => b.backerWallet === address && (b.status === "confirmed" || b.status === "distributed"),
  );
  const myClaimable = c.backings
    .filter((b) => b.backerWallet === address)
    .reduce((sum, b) => sum + Number(b.claimableFees.sol), 0);
  const isCreator = connected && address === c.creatorWallet;

  async function guard(fn: () => Promise<void>) {
    if (!connected) {
      connect();
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const onBack = () =>
    guard(async () => {
      const amountSol = amount || c!.minBacking.sol;

      // Real (non-custodial) mode: the backer signs+sends the SOL transfer
      // into the pool wallet from their own wallet first, then we hand the
      // signature to the server to verify on-chain.
      let depositTx: string | undefined;
      if (mode === "solana") {
        try {
          const { depositToPool } = await import("@/lib/solanaDeposit");
          setMsg({ tone: "ok", text: "Approve the deposit in your wallet…" });
          depositTx = await depositToPool(c!.poolWallet, amountSol);
        } catch (e) {
          setMsg({ tone: "err", text: `Deposit failed: ${(e as Error).message}` });
          return;
        }
      }

      const res = await api.back(id, {
        backerWallet: address,
        amountSol,
        idempotencyKey: `${address}-${id}-${depositTx ?? Date.now()}`,
        ...(depositTx ? { depositTx } : {}),
      });
      if (res.ok) {
        setMsg({ tone: "ok", text: `Claimed slot #${res.data.slotNumber}.` });
        setAmount("");
        await refresh();
      } else setMsg({ tone: "err", text: res.error.message });
    });

  const onWithdraw = () =>
    guard(async () => {
      const res = await api.withdraw(id, address!);
      if (res.ok) {
        setMsg({ tone: "ok", text: `Withdrawn — ${res.data.refunded.sol} SOL returned (2% fee).` });
        await refresh();
      } else setMsg({ tone: "err", text: res.error.message });
    });

  const onLaunch = () =>
    guard(async () => {
      const res = await api.launch(id, address!);
      if (res.ok) {
        setMsg({ tone: "ok", text: `Launched! Mint ${shortAddr(res.data.mintAddress)}.` });
        await refresh();
      } else setMsg({ tone: "err", text: res.error.message });
    });

  const onClaim = () =>
    guard(async () => {
      const res = await api.claim(id, address!);
      if (res.ok) setMsg({ tone: "ok", text: `Claimed ${res.data.paid.sol} SOL in fees.` });
      else setMsg({ tone: "err", text: res.error.message });
      await refresh();
    });

  const onAccrue = () =>
    guard(async () => {
      const res = await api.accrue(id, "0.5");
      if (res.ok) setMsg({ tone: "ok", text: `Simulated 0.5 SOL of trading fees.` });
      else setMsg({ tone: "err", text: res.error.message });
      await refresh();
    });

  const onBuyback = () =>
    guard(async () => {
      const res = await api.buyback(id, address ?? undefined);
      if (res.ok)
        setMsg({
          tone: "ok",
          text: `Collected ${res.data.collected.sol} ◎ → burned ${formatTokens(res.data.tokensBurned)} ${c!.symbol}` +
            (Number(res.data.creator.sol) > 0 ? `, ${res.data.creator.sol} ◎ to you.` : "."),
        });
      else setMsg({ tone: "err", text: res.error.message });
      await refresh();
    });

  const onSaveConfig = () =>
    guard(async () => {
      const res = await api.updateConfig(id, {
        requesterWallet: address ?? undefined,
        burnSharePct: cfgBurn ?? undefined,
        autoBuyback: cfgAuto ?? undefined,
      });
      if (res.ok) setMsg({ tone: "ok", text: "Buyback settings saved." });
      else setMsg({ tone: "err", text: res.error.message });
      await refresh();
    });

  return (
    <div>
      <Link href="/" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">
        ← All launches
      </Link>

      <div className="mt-4 flex flex-col gap-6 lg:flex-row">
        {/* Left: details */}
        <div className="flex-1">
          <div className="flex items-start gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[var(--color-surface-2)] text-2xl font-bold">
              {c.symbol.slice(0, 2)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{c.name}</h1>
                <StatusBadge status={c.status} />
              </div>
              <div className="mono text-sm text-[var(--color-muted)]">${c.symbol}</div>
            </div>
          </div>

          <p className="mt-4 text-[var(--color-muted)]">{c.description}</p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total backed" value={`${c.totalBacked.sol} ◎`} />
            <Stat label="Slots" value={`${c.filledSlots}/${c.totalSlots}`} />
            <Stat label="Min / slot" value={`${c.minBacking.sol} ◎`} />
            {c.status === "live" ? (
              <Stat
                label="🔥 Burned"
                value={`${formatTokens(c.tokensBurned)}`}
                sub={`${c.buybackSol.sol} ◎ bought back`}
              />
            ) : (
              <Stat
                label={c.status === "funded" ? "Launch window" : "Backing closes"}
                value={<Countdown iso={c.status === "funded" ? c.launchDeadline : c.backingDeadline} />}
              />
            )}
          </div>

          <h3 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Slots
          </h3>
          <SlotGrid campaign={c} highlightWallet={address} />

          <h3 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Fee split
          </h3>
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <FeeBucket label="Backers" bps={c.feeSplit.backersBps} />
              <FeeBucket label="Platform" bps={c.feeSplit.platformBps} />
              <FeeBucket label="Creator" bps={c.feeSplit.creatorBps} />
              <FeeBucket label="Burn" bps={c.feeSplit.burnBps} />
            </div>
          </Card>

          {c.status === "live" && <Tokenomics c={c} />}

          <div className="mt-6 space-y-1 text-xs text-[var(--color-muted)]">
            <div className="flex items-center gap-2">
              Pool wallet: <span className="mono">{shortAddr(c.poolWallet, 6)}</span>
              <CopyButton value={c.poolWallet} label="pool wallet" />
            </div>
            {c.mintAddress && (
              <div>
                Mint:{" "}
                <a
                  href={c.explorerUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="mono text-[var(--color-brand)] hover:underline"
                >
                  {shortAddr(c.mintAddress, 6)}
                </a>{" "}
                <CopyButton value={c.mintAddress} label="mint" />{" "}
                {c.launchedAt && <span>· launched {relativeTime(c.launchedAt)}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Right: action panel */}
        <div className="w-full lg:w-80">
          <Card className="sticky top-20 p-5">
            {msg && (
              <div
                className={`mb-4 rounded-lg px-3 py-2 text-sm ${
                  msg.tone === "ok"
                    ? "bg-[var(--color-brand-strong)]/15 text-[var(--color-brand)]"
                    : "bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
                }`}
              >
                {msg.text}
              </div>
            )}

            {c.status === "backing" && (
              <>
                <label className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
                  Back this launch
                </label>
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={c.minBacking.sol}
                    className="w-full bg-transparent outline-none"
                  />
                  <span className="text-sm text-[var(--color-muted)]">SOL</span>
                </div>
                <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                  Min {c.minBacking.sol} SOL{c.maxBacking ? ` · max ${c.maxBacking.sol} SOL` : ""}.
                  Withdrawable anytime (2% fee) until slots fill.
                </p>
                <button
                  onClick={onBack}
                  disabled={busy}
                  className="mt-3 w-full rounded-xl bg-gradient-to-r from-[var(--color-brand-strong)] to-[var(--color-brand)] py-2.5 font-medium text-black hover:opacity-90 disabled:opacity-50"
                >
                  {connected ? (busy ? "Claiming…" : "Claim a slot") : "Connect to back"}
                </button>
                {myBacking && (
                  <button
                    onClick={onWithdraw}
                    disabled={busy}
                    className="mt-2 w-full rounded-xl border border-[var(--color-border)] py-2.5 text-sm hover:border-[var(--color-danger)]/50 disabled:opacity-50"
                  >
                    Withdraw slot #{myBacking.slotNumber}
                  </button>
                )}
              </>
            )}

            {c.status === "funded" && (
              <>
                <div className="text-sm text-[var(--color-muted)]">
                  All slots are filled. The creator can launch any time within the window.
                </div>
                {isCreator ? (
                  <button
                    onClick={onLaunch}
                    disabled={busy}
                    className="mt-3 w-full rounded-xl bg-gradient-to-r from-[var(--color-warn)] to-[var(--color-brand)] py-2.5 font-medium text-black hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "Launching…" : "🚀 Launch now"}
                  </button>
                ) : (
                  <div className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-[var(--color-muted)]">
                    Only the creator ({shortAddr(c.creatorWallet)}) can trigger the launch.
                  </div>
                )}
              </>
            )}

            {c.status === "live" && (
              <>
                <div className="text-sm text-[var(--color-muted)]">
                  Live and trading. Your claimable fees:
                </div>
                <div className="mt-1 text-2xl font-bold">{myClaimable.toFixed(4)} ◎</div>
                <button
                  onClick={onClaim}
                  disabled={busy || myClaimable <= 0}
                  className="mt-3 w-full rounded-xl bg-gradient-to-r from-[var(--color-brand-strong)] to-[var(--color-brand)] py-2.5 font-medium text-black hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Claiming…" : "Claim fees"}
                </button>
                <button
                  onClick={onAccrue}
                  disabled={busy}
                  className="mt-2 w-full rounded-xl border border-dashed border-[var(--color-border)] py-2 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)]/50 disabled:opacity-50"
                  title="Demo: simulate trading-fee revenue arriving"
                >
                  ⚡ Simulate 0.5 SOL trading fees (demo)
                </button>

                <div className="mt-5 border-t border-[var(--color-border)] pt-4">
                  <div className="text-sm font-medium">Buyback &amp; burn</div>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Collect this token&apos;s Pump.fun creator-fee commission and burn the tokens it
                    buys back. {formatTokens(c.tokensBurned)} {c.symbol} burned so far.
                  </p>
                  <button
                    onClick={onBuyback}
                    disabled={busy}
                    className="mt-2 w-full rounded-xl bg-gradient-to-r from-[var(--color-danger)] to-[var(--color-warn)] py-2.5 font-medium text-black hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "Working…" : "🔥 Collect fees & burn"}
                  </button>
                </div>
              </>
            )}

            {(c.status === "failed" || c.status === "refunding") && (
              <div className="text-sm text-[var(--color-muted)]">
                This launch didn&apos;t fill in time. All backers were refunded 100% — no fee.
              </div>
            )}

            {isCreator && c.status !== "failed" && c.status !== "refunding" && (
              <div className="mt-5 border-t border-[var(--color-border)] pt-4">
                <div className="text-sm font-medium">Creator settings</div>
                <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-muted)]">
                  <span>Burn share of commission</span>
                  <span className="mono text-[var(--color-text)]">{cfgBurn ?? c.burnSharePct}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={cfgBurn ?? c.burnSharePct}
                  onChange={(e) => setCfgBurn(Number(e.target.value))}
                  className="mt-1 w-full accent-[var(--color-brand)]"
                />
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[var(--color-muted)]">
                  <input
                    type="checkbox"
                    checked={cfgAuto ?? c.autoBuyback}
                    onChange={(e) => setCfgAuto(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-brand)]"
                  />
                  Auto buyback &amp; burn (cron)
                </label>
                <button
                  onClick={onSaveConfig}
                  disabled={busy}
                  className="mt-3 w-full rounded-xl border border-[var(--color-border)] py-2 text-sm hover:border-[var(--color-brand)]/50 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save settings"}
                </button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function FeeBucket({ label, bps }: { label: string; bps: number }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div className="text-lg font-semibold">{(bps / 100).toFixed(0)}%</div>
    </div>
  );
}

const TOTAL_SUPPLY_BASE_UNITS = 1_000_000_000n * 10n ** 6n;

function Tokenomics({ c }: { c: CampaignDTO }) {
  const burned = (() => {
    try {
      return BigInt(c.tokensBurned);
    } catch {
      return 0n;
    }
  })();
  const burnedPct = Number((burned * 10000n) / TOTAL_SUPPLY_BASE_UNITS) / 100;
  const circulating = TOTAL_SUPPLY_BASE_UNITS - burned;

  return (
    <>
      <h3 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Tokenomics
      </h3>
      <Card className="p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KV label="Total supply" value="1,000,000,000" />
          <KV label="Dev allocation" value="0%" accent />
          <KV label="🔥 Burned" value={`${formatTokens(c.tokensBurned)} (${burnedPct.toFixed(2)}%)`} />
          <KV label="Circulating (est.)" value={formatTokens(circulating.toString())} />
          <KV label="Bought back" value={`${c.buybackSol.sol} ◎`} />
          <KV label="Creator income" value={`${c.creatorIncome.sol} ◎`} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-md bg-white/5 px-2 py-1 text-[var(--color-muted)]">
            Burn share: <span className="text-[var(--color-text)]">{c.burnSharePct}%</span>
          </span>
          <span className="rounded-md bg-white/5 px-2 py-1 text-[var(--color-muted)]">
            Auto-buyback:{" "}
            <span className={c.autoBuyback ? "text-[var(--color-brand)]" : "text-[var(--color-text)]"}>
              {c.autoBuyback ? "on" : "off"}
            </span>
          </span>
          <span className="rounded-md bg-white/5 px-2 py-1 text-[var(--color-muted)]">
            Deflationary — supply only decreases
          </span>
        </div>
      </Card>

      {c.buybackEvents.length > 0 && (
        <>
          <h3 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Burn history
          </h3>
          <Card className="divide-y divide-[var(--color-border)]">
            {c.buybackEvents.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">🔥 {formatTokens(e.tokensBurned)} {c.symbol}</div>
                  <div className="text-xs text-[var(--color-muted)]">{relativeTime(e.createdAt)}</div>
                </div>
                <div className="text-right text-xs text-[var(--color-muted)]">
                  <div>{e.burned.sol} ◎ burned</div>
                  {Number(e.creator.sol) > 0 && <div>{e.creator.sol} ◎ to creator</div>}
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function KV({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div className={`text-base font-semibold ${accent ? "text-[var(--color-brand)]" : ""}`}>{value}</div>
    </div>
  );
}
