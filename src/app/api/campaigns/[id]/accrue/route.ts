import { accrueFees } from "@/services/launchpad";
import { getChain } from "@/chain";
import { readJson, respond, errorResponse } from "@/lib/http";
import { appError } from "@/lib/result";
import { solToLamports } from "@/lib/money";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Demo-only endpoint: simulate a batch of trading-fee revenue arriving for a
 * live campaign so the fee-distribution + claim flow can be exercised without
 * a real chain. In production this would be a cron reading on-chain vaults.
 */
const schema = z.object({
  revenueSol: z.string().regex(/^\d+(\.\d{1,9})?$/).default("0.5"),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  // SECURITY: this credits claimable balances out of thin air, which is only
  // safe with the mock chain. In real mode, claims pay real escrow SOL, so an
  // open accrue endpoint would let anyone drain the escrow. Hard-disable it.
  if (getChain().name !== "mock") {
    return errorResponse(
      appError("forbidden", "fee simulation is disabled outside mock mode"),
    );
  }

  const { id } = await ctx.params;
  const body = (await readJson(req)) ?? {};
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(appError("validation", "revenueSol must be a SOL amount"));
  }
  const result = await accrueFees(id, solToLamports(parsed.data.revenueSol));
  return respond(result);
}
