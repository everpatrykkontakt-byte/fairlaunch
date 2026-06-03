"use client";

import { useState } from "react";

/** Small inline "copy to clipboard" button with transient feedback. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      onClick={copy}
      className="rounded-md border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)] hover:border-[var(--color-brand)]/50 hover:text-[var(--color-text)]"
      title={`Copy ${label ?? "value"}`}
    >
      {copied ? "✓ copied" : "copy"}
    </button>
  );
}
