import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "FairLaunch — fair-launch commitment layer",
  description:
    "Communities form before a token exists. Slots fill, the pool launches atomically at one price, the creator holds 0%, and backers earn a share of trading fees.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="app-bg min-h-screen">
        <WalletProvider>
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-[var(--color-muted)]">
            FairLaunch · production skeleton · chain + data layers are swappable
            adapters. Not financial advice. Demo data resets on server restart.
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
