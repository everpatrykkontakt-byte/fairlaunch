import { LIMITS } from "./config";
import type { SlotTier } from "./types";

export function slotTier(slotNumber: number): SlotTier {
  return slotNumber <= LIMITS.GENESIS_SLOTS ? "genesis" : "wave2";
}

/** All slot numbers for a campaign, 1-indexed. */
export function allSlots(totalSlots: number): number[] {
  return Array.from({ length: totalSlots }, (_, i) => i + 1);
}
