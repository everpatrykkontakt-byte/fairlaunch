import { runBuyback } from "@/services/launchpad";
import { readJson, respond, errorResponse } from "@/lib/http";
import { appError } from "@/lib/result";
import { money } from "@/lib/serialize";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  // Required in real mode (must equal the campaign creator); ignored by mock.
  requesterWallet: z
    .string()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    .optional(),
});

/**
 * Trigger the buyback-and-burn loop: collect accrued Pump.fun creator-fee
 * commission and burn the token bought with it. Intended to be called by the
 * creator, or on a schedule. Safe to call repeatedly — it only acts on fees
 * that have actually accrued.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await readJson(req)) ?? {};
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(appError("validation", "invalid requesterWallet"));
  }

  const result = await runBuyback(id, { requesterWallet: parsed.data.requesterWallet });
  return respond(result, (v) => ({
    collected: money(v.collected),
    burned: money(v.burned),
    creator: money(v.creator),
    tokensBurned: v.tokensBurned.toString(),
    burnTx: v.burnTx,
  }));
}
