"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type BackingDTO, type CampaignDTO } from "@/lib/clientApi";
import { useWallet } from "@/components/WalletProvider";
import { Card, Stat, StatusBadge } from "@/components/ui";
import { shortAddr } from "@/lib/format";

type Row = BackingDTO & { campaign: CampaignDTO | null };

export default function PortfolioPage() {
  const { address, connected, connect } = useWallet();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    const res = await api.portfolio(address);
    if (res.ok) setRows(res.data.backings);
    setLoading(false);
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!connected) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-[var(--color-muted)]">Connect your wallet to see your positions.</p>
        <button
          onClick={connect}
          className="rounded-xl bg-gradient-to-r from-[var(--color-brand-strong)] to-[var(--color-brand)] px-5 py-2.5 font-medium text-black"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  const active = rows.filter((r) => r.status === "confirmed" || r.status === "distributed");
  const totalBacked = active.reduce((s, r) => s + Number(r.amount.sol), 0);
  const totalClaimable = rows.reduce((s, r) => s + Number(r.claimableFees.sol), 0);
  const totalClaimed = rows.reduce((s, r) => s + Number(r.claimedFees.sol), 0);

  async function claim(campaignId: string) {
    setBusyId(campaignId);
    await api.claim(campaignId, address!);
    await refresh();
    setBusyId(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <span className="mono text-sm text-[var(--color-muted)]">{shortAddr(address, 6)}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active backings" value={active.length} />
        <Stat label="Total backed" value={`${totalBacked.toFixed(3)} ◎`} />
        <Stat label="Claimable fees" value={`${totalClaimable.toFixed(4)} ◎`} />
        <Stat label="Claimed to date" value={`${totalClaimed.toFixed(4)} ◎`} />
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Positions
      </h2>

      {loading ? (
        <div className="py-12 text-center text-[var(--color-muted)]">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-12 text-center text-[var(--color-muted)]">
          No positions yet.{" "}
          <Link href="/" className="text-[var(--color-brand)] hover:underline">
            Browse launches
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-surface-2)] text-sm font-bold">
                {r.campaign?.symbol.slice(0, 2) ?? "?"}
              </div>
              <div className="min-w-32 flex-1">
                <Link
                  href={`/campaign/${r.campaignId}`}
                  className="font-medium hover:text-[var(--color-brand)]"
                >
                  {r.campaign?.name ?? "Unknown"}
                </Link>
                <div className="text-xs text-[var(--color-muted)]">
                  slot #{r.slotNumber} · {r.amount.sol} ◎
                </div>
              </div>
              {r.campaign && <StatusBadge status={r.campaign.status} />}
              <div className="text-right text-sm">
                <div className="text-[var(--color-muted)]">claimable</div>
                <div className="font-semibold">{r.claimableFees.sol} ◎</div>
              </div>
              <button
                onClick={() => claim(r.campaignId)}
                disabled={Number(r.claimableFees.sol) <= 0 || busyId === r.campaignId}
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-brand)]/50 disabled:opacity-40"
              >
                {busyId === r.campaignId ? "…" : "Claim"}
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
