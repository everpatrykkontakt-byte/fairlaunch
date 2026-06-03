import Link from "next/link";
import type { CampaignDTO } from "@/lib/clientApi";
import { StatusBadge, Progress } from "./ui";
import { timeLeft, shortAddr } from "@/lib/format";

export function CampaignCard({ c }: { c: CampaignDTO }) {
  const deadline =
    c.status === "funded" ? c.launchDeadline : c.status === "backing" ? c.backingDeadline : null;
  const deadlineLabel =
    c.status === "funded" ? "Launch in" : c.status === "backing" ? "Closes in" : null;

  return (
    <Link
      href={`/campaign/${c.id}`}
      className="group block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:border-[var(--color-brand)]/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-surface-2)] text-lg font-bold">
            {c.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="font-semibold leading-tight">{c.name}</div>
            <div className="mono text-xs text-[var(--color-muted)]">${c.symbol}</div>
          </div>
        </div>
        <StatusBadge status={c.status} />
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-[var(--color-muted)]">{c.description}</p>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--color-muted)]">
          <span>
            {c.filledSlots}/{c.totalSlots} slots
          </span>
          <span className="mono">{c.totalBacked.sol} SOL</span>
        </div>
        <Progress value={c.filledSlots} max={c.totalSlots} />
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>by {shortAddr(c.creatorWallet)}</span>
        {deadlineLabel && deadline && (
          <span>
            {deadlineLabel} <span className="text-[var(--color-text)]">{timeLeft(deadline)}</span>
          </span>
        )}
        {c.status === "live" && c.mintAddress && (
          <span className="mono text-[var(--color-brand-strong)]">…{c.mintAddress.slice(-4)}</span>
        )}
      </div>
    </Link>
  );
}
