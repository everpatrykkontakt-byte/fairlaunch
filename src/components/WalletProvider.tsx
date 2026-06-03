"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * A mock wallet. The real app would use @solana/wallet-adapter; here we
 * generate a deterministic-looking base58 pubkey and persist it in
 * localStorage so the demo has a stable identity to back/launch/claim with.
 * Swapping in a real adapter only touches this file.
 */
interface WalletContextValue {
  address: string | null;
  connected: boolean;
  /** "mock" = generated demo identity; "solana" = real injected wallet (Phantom). */
  mode: "mock" | "solana";
  connect: () => void | Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);
const STORAGE_KEY = "fairlaunch.wallet";
const MODE: "mock" | "solana" =
  process.env.NEXT_PUBLIC_CHAIN_ADAPTER === "solana" ? "solana" : "mock";

interface InjectedSolana {
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  disconnect?: () => Promise<void>;
}
function injected(): InjectedSolana | null {
  const w = globalThis as unknown as { solana?: InjectedSolana & { isPhantom?: boolean } };
  return w.solana ?? null;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function randomPubkey(): string {
  let out = "";
  const len = 43;
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += B58[arr[i]! % B58.length];
  return out;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (MODE === "solana") return; // real wallets connect explicitly
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setAddress(saved);
  }, []);

  const connect = useCallback(async () => {
    if (MODE === "solana") {
      const sol = injected();
      if (!sol) {
        alert("No Solana wallet found. Install Phantom to connect on mainnet.");
        return;
      }
      const resp = await sol.connect();
      setAddress(resp.publicKey.toString());
      return;
    }
    const existing = localStorage.getItem(STORAGE_KEY);
    const addr = existing ?? randomPubkey();
    localStorage.setItem(STORAGE_KEY, addr);
    setAddress(addr);
  }, []);

  const disconnect = useCallback(() => {
    if (MODE === "solana") {
      void injected()?.disconnect?.();
      setAddress(null);
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    setAddress(null);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({ address, connected: !!address, mode: MODE, connect, disconnect }),
    [address, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
