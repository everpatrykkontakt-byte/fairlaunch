import type { CampaignDTO } from "@/lib/clientApi";
import { shortAddr } from "@/lib/format";
import { Pill } from "./ui";

export function SlotGrid({
  campaign,
  highlightWallet,
}: {
  campaign: CampaignDTO;
  highlightWallet?: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {campaign.slots.map((s) => {
        const mine = highlightWallet && s.backerWallet === highlightWallet;
        return (
          <div
            key={s.slotNumber}
            className={`rounded-xl border p-3 ${
              s.taken
                ? mine
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                : "border-dashed border-[var(--color-border)] bg-transparent"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-muted)]">#{s.slotNumber}</span>
              <Pill tone={s.tier === "genesis" ? "genesis" : "wave2"}>{s.tier}</Pill>
            </div>
            {s.taken ? (
              <div className="mt-2">
                <div className="mono text-xs">{shortAddr(s.backerWallet)}</div>
                <div className="text-sm font-semibold">{s.amount?.sol} SOL</div>
                {mine && <div className="text-[10px] text-[var(--color-brand)]">you</div>}
              </div>
            ) : (
              <div className="mt-2 text-sm text-[var(--color-muted)]">open</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
