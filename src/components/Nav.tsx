"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "./WalletProvider";
import { shortAddr } from "@/lib/format";

const LINKS = [
  { href: "/", label: "Launches" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/submit", label: "Submit" },
  { href: "/docs", label: "How it works" },
];

export function Nav() {
  const pathname = usePathname();
  const { address, connected, connect, disconnect } = useWallet();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-brand-strong)] to-[var(--color-accent)] text-sm text-black">
            ◆
          </span>
          <span>FairLaunch</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-white/10 text-[var(--color-text)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto">
          {connected ? (
            <button
              onClick={disconnect}
              className="mono rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm hover:border-[var(--color-danger)]/50"
              title="Click to disconnect"
            >
              {shortAddr(address)}
            </button>
          ) : (
            <button
              onClick={connect}
              className="rounded-lg bg-gradient-to-r from-[var(--color-brand-strong)] to-[var(--color-brand)] px-4 py-1.5 text-sm font-medium text-black hover:opacity-90"
            >
              Connect wallet
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
