/** Client-safe formatting helpers (no bigint; operate on DTO strings). */

export function shortAddr(addr: string | null | undefined, chars = 4): string {
  if (!addr) return "—";
  if (addr.length <= chars * 2 + 1) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export function timeLeft(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Format token base units (default 6 decimals) into a compact human string. */
export function formatTokens(baseUnits: string, decimals = 6): string {
  let n: number;
  try {
    n = Number(BigInt(baseUnits) / 10n ** BigInt(decimals));
  } catch {
    return "0";
  }
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  backing: "Backing open",
  funded: "Funded",
  launching: "Launching",
  live: "Live",
  refunding: "Refunding",
  failed: "Failed",
};

export const STATUS_TONE: Record<string, string> = {
  draft: "text-[var(--color-muted)] bg-white/5",
  backing: "text-[var(--color-brand)] bg-[var(--color-brand)]/10",
  funded: "text-[var(--color-accent)] bg-[var(--color-accent)]/10",
  launching: "text-[var(--color-warn)] bg-[var(--color-warn)]/10",
  live: "text-[var(--color-brand-strong)] bg-[var(--color-brand-strong)]/15",
  refunding: "text-[var(--color-warn)] bg-[var(--color-warn)]/10",
  failed: "text-[var(--color-danger)] bg-[var(--color-danger)]/10",
};
