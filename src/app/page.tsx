"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type CampaignDTO } from "@/lib/clientApi";
import { CampaignCard } from "@/components/CampaignCard";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "backing", label: "Backing" },
  { key: "funded", label: "Funded" },
  { key: "live", label: "Live" },
  { key: "failed", label: "Failed" },
] as const;

type SortKey = "newest" | "closing" | "backed" | "burned";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "closing", label: "Closing soon" },
  { key: "backed", label: "Most backed" },
  { key: "burned", label: "Most burned" },
];

function sortCampaigns(list: CampaignDTO[], sort: SortKey): CampaignDTO[] {
  const num = (s: string) => Number(s);
  const arr = [...list];
  switch (sort) {
    case "closing":
      return arr.sort((a, b) => num2(a) - num2(b));
    case "backed":
      return arr.sort((a, b) => num(b.totalBacked.sol) - num(a.totalBacked.sol));
    case "burned":
      return arr.sort((a, b) => Number(BigInt(b.tokensBurned) - BigInt(a.tokensBurned)));
    case "newest":
    default:
      return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
// Soonest relevant deadline (backing or launch); expired/none sort last.
function num2(c: CampaignDTO): number {
  const d = c.status === "funded" ? c.launchDeadline : c.status === "backing" ? c.backingDeadline : null;
  return d ? new Date(d).getTime() : Number.MAX_SAFE_INTEGER;
}

export default function HomePage() {
  const [campaigns, setCampaigns] = useState<CampaignDTO[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listCampaigns(filter === "all" ? undefined : filter).then((res) => {
      if (!active) return;
      if (res.ok) setCampaigns(res.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [filter]);

  return (
    <div>
      <section className="mb-10 rounded-3xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-surface)] to-transparent p-8 md:p-12">
        <h1 className="max-w-2xl text-3xl font-bold leading-tight md:text-4xl">
          Communities form <span className="text-[var(--color-brand)]">before</span> the token
          exists.
        </h1>
        <p className="mt-4 max-w-2xl text-[var(--color-muted)]">
          Backers claim slots in a launch. When every slot fills, the pool executes one atomic
          create-and-buy — so everyone enters at the same price, the creator holds 0%, and trading
          fees flow back to backers. If slots don&apos;t fill in time, everyone is refunded 100%.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/submit"
            className="rounded-xl bg-gradient-to-r from-[var(--color-brand-strong)] to-[var(--color-brand)] px-5 py-2.5 text-sm font-medium text-black hover:opacity-90"
          >
            Start a launch
          </Link>
          <Link
            href="/docs"
            className="rounded-xl border border-[var(--color-border)] px-5 py-2.5 text-sm hover:border-[var(--color-brand)]/40"
          >
            How it works
          </Link>
        </div>
      </section>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Launches</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-lg px-3 py-1 text-sm transition-colors ${
                  filter === f.key
                    ? "bg-white/10 text-[var(--color-text)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
            />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-12 text-center text-[var(--color-muted)]">
          No launches here yet.{" "}
          <Link href="/submit" className="text-[var(--color-brand)] hover:underline">
            Be the first.
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortCampaigns(campaigns, sort).map((c) => (
            <CampaignCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
