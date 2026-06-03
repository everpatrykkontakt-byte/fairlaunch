import { STATUS_LABEL, STATUS_TONE } from "@/lib/format";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        STATUS_TONE[status] ?? "bg-white/5 text-[var(--color-muted)]"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {sub && <div className="text-xs text-[var(--color-muted)]">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "genesis" | "wave2" }) {
  const tones = {
    default: "bg-white/5 text-[var(--color-muted)]",
    genesis: "bg-[var(--color-brand)]/15 text-[var(--color-brand)]",
    wave2: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
  };
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className="h-full rounded-full bg-gradient-to-r from-[var(--color-brand-strong)] to-[var(--color-brand)] transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
