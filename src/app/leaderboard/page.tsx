"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/clientApi";
import { Card } from "@/components/ui";
import { shortAddr } from "@/lib/format";

type Board = Awaited<ReturnType<typeof api.leaderboard>>;

export default function LeaderboardPage() {
  const [data, setData] = useState<Extract<Board, { ok: true }>["data"] | null>(null);

  useEffect(() => {
    api.leaderboard().then((res) => {
      if (res.ok) setData(res.data);
    });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Leaderboard</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Ranked live from on-store data: top launches by SOL backed and most prolific creators.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Top launches
          </h2>
          {!data ? (
            <Skeleton />
          ) : data.campaigns.length === 0 ? (
            <Empty />
          ) : (
            <ol className="space-y-2">
              {data.campaigns.map((c, i) => (
                <li key={c.id} className="flex items-center gap-3">
                  <Rank n={i + 1} />
                  <Link
                    href={`/campaign/${c.id}`}
                    className="flex-1 truncate font-medium hover:text-[var(--color-brand)]"
                  >
                    {c.name} <span className="mono text-xs text-[var(--color-muted)]">${c.symbol}</span>
                  </Link>
                  <span className="mono text-sm">{c.totalBacked.sol} ◎</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Top creators
          </h2>
          {!data ? (
            <Skeleton />
          ) : data.creators.length === 0 ? (
            <Empty />
          ) : (
            <ol className="space-y-2">
              {data.creators.map((c, i) => (
                <li key={c.wallet} className="flex items-center gap-3">
                  <Rank n={i + 1} />
                  <span className="mono flex-1 truncate">{shortAddr(c.wallet, 6)}</span>
                  <span className="text-sm text-[var(--color-muted)]">{c.launches} launches</span>
                  <span className="mono text-sm">{c.raised.sol} ◎</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

function Rank({ n }: { n: number }) {
  const tone =
    n === 1 ? "bg-[var(--color-warn)]/20 text-[var(--color-warn)]" : "bg-white/5 text-[var(--color-muted)]";
  return (
    <span className={`grid h-6 w-6 place-items-center rounded-md text-xs font-bold ${tone}`}>{n}</span>
  );
}

function Skeleton() {
  return <div className="h-32 animate-pulse rounded-xl bg-white/5" />;
}
function Empty() {
  return <p className="text-sm text-[var(--color-muted)]">No live launches yet.</p>;
}
