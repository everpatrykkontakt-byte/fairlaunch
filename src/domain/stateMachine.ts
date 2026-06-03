import type { CampaignStatus } from "./types";

/**
 * The only place campaign status transitions are defined. Services call
 * `canTransition` / `assertTransition` instead of assigning `status` ad hoc,
 * which makes illegal lifecycle jumps (e.g. relaunching a live token, or
 * backing a failed campaign) impossible by construction.
 */
const TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["backing", "failed"],
  backing: ["funded", "refunding"],
  funded: ["launching", "refunding"],
  launching: ["live", "funded"], // funded = rollback if the chain call fails
  live: [], // terminal
  refunding: ["failed", "backing"], // backing = rollback if refund sweep aborts
  failed: [], // terminal
};

export function canTransition(
  from: CampaignStatus,
  to: CampaignStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(
  from: CampaignStatus,
  to: CampaignStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`illegal status transition: ${from} → ${to}`);
  }
}

/** A campaign in one of these states accepts no further state mutations. */
export function isTerminal(status: CampaignStatus): boolean {
  return status === "live" || status === "failed";
}

/** Backers may only join/withdraw while the campaign is actively backing. */
export function acceptsBacking(status: CampaignStatus): boolean {
  return status === "backing";
}
