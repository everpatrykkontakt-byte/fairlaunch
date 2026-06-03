"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/clientApi";
import { useWallet } from "@/components/WalletProvider";
import { Card } from "@/components/ui";

const PRESETS = [
  { key: "standard", label: "Standard", desc: "90% backers · 10% platform" },
  { key: "community_first", label: "Community first", desc: "95% backers · 5% platform" },
  { key: "creator_aligned", label: "Creator aligned", desc: "70% backers · 20% creator · 10% platform" },
  { key: "deflationary", label: "Deflationary", desc: "70% backers · 20% burn · 10% platform" },
] as const;

export default function SubmitPage() {
  const router = useRouter();
  const { address, connected, connect } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    symbol: "",
    description: "",
    imageUrl: "",
    totalSlots: 8,
    minBackingSol: "0.5",
    maxBackingSol: "",
    backingHours: 72,
    feePreset: "standard" as (typeof PRESETS)[number]["key"],
    burnSharePct: 100,
    autoBuyback: false,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!connected) {
      connect();
      return;
    }
    setBusy(true);
    setError(null);
    const res = await api.submit({
      creatorWallet: address,
      name: form.name,
      symbol: form.symbol,
      description: form.description,
      imageUrl: form.imageUrl || "",
      links: {},
      totalSlots: Number(form.totalSlots),
      minBackingSol: form.minBackingSol,
      maxBackingSol: form.maxBackingSol || null,
      backingHours: Number(form.backingHours),
      feePreset: form.feePreset,
      burnSharePct: Number(form.burnSharePct),
      autoBuyback: form.autoBuyback,
    });
    setBusy(false);
    if (res.ok) router.push(`/campaign/${res.data.id}`);
    else setError(res.error.message + (res.error.details ? ` (${JSON.stringify(res.error.details)})` : ""));
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Start a launch</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Set your slots and terms. A 0.02 SOL anti-spam submission fee applies (non-refundable). Once
        every slot fills, you have 24 hours to launch or backers are auto-refunded.
      </p>

      <Card className="mt-6 space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Token name">
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={32}
              placeholder="Quantum Doge"
              className="input"
            />
          </Field>
          <Field label="Symbol">
            <input
              value={form.symbol}
              onChange={(e) => set("symbol", e.target.value.toUpperCase())}
              maxLength={10}
              placeholder="QDOGE"
              className="input mono"
            />
          </Field>
        </div>

        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="What is this launch about?"
            className="input resize-none"
          />
        </Field>

        <Field label="Image URL (optional)">
          <input
            value={form.imageUrl}
            onChange={(e) => set("imageUrl", e.target.value)}
            placeholder="https://…"
            className="input"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Slots (2–24)">
            <input
              type="number"
              min={2}
              max={24}
              value={form.totalSlots}
              onChange={(e) => set("totalSlots", Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Min per slot (SOL)">
            <input
              value={form.minBackingSol}
              onChange={(e) => set("minBackingSol", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Max per slot (opt.)">
            <input
              value={form.maxBackingSol}
              onChange={(e) => set("maxBackingSol", e.target.value)}
              placeholder="uncapped"
              className="input"
            />
          </Field>
        </div>

        <Field label="Backing window (hours, 1–72)">
          <input
            type="number"
            min={1}
            max={72}
            value={form.backingHours}
            onChange={(e) => set("backingHours", Number(e.target.value))}
            className="input"
          />
        </Field>

        <Field label="Fee split">
          <div className="grid gap-2 sm:grid-cols-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => set("feePreset", p.key)}
                className={`rounded-xl border p-3 text-left text-sm transition-colors ${
                  form.feePreset === p.key
                    ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10"
                    : "border-[var(--color-border)] hover:border-[var(--color-brand)]/40"
                }`}
              >
                <div className="font-medium">{p.label}</div>
                <div className="text-xs text-[var(--color-muted)]">{p.desc}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Buyback & burn">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
            <div className="flex items-center justify-between text-sm">
              <span>Burn share of creator commission</span>
              <span className="mono font-semibold">{form.burnSharePct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.burnSharePct}
              onChange={(e) => set("burnSharePct", Number(e.target.value))}
              className="mt-2 w-full accent-[var(--color-brand)]"
            />
            <div className="mt-1 flex justify-between text-xs text-[var(--color-muted)]">
              <span>{form.burnSharePct}% burned</span>
              <span>{100 - form.burnSharePct}% to you (income)</span>
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.autoBuyback}
                onChange={(e) => set("autoBuyback", e.target.checked)}
                className="h-4 w-4 accent-[var(--color-brand)]"
              />
              Auto-run buyback &amp; burn on a schedule (cron)
            </label>
          </div>
        </Field>

        {error && (
          <div className="rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy || !form.name || !form.symbol}
          className="w-full rounded-xl bg-gradient-to-r from-[var(--color-brand-strong)] to-[var(--color-brand)] py-3 font-medium text-black hover:opacity-90 disabled:opacity-50"
        >
          {connected ? (busy ? "Creating…" : "Create launch") : "Connect wallet to create"}
        </button>
      </Card>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--color-border);
          background: var(--color-surface-2);
          padding: 0.6rem 0.8rem;
          outline: none;
        }
        .input:focus { border-color: var(--color-brand); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
