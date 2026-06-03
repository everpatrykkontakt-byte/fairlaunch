import { claimFees } from "@/services/launchpad";
import { readJson, respond, errorResponse } from "@/lib/http";
import { appError } from "@/lib/result";
import { money } from "@/lib/serialize";
import { claimFeesSchema, zodIssues } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (body === null) return errorResponse(appError("validation", "invalid JSON body"));

  const parsed = claimFeesSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(appError("validation", "invalid input", zodIssues(parsed.error)));
  }

  const result = await claimFees(id, parsed.data.backerWallet);
  return respond(result, (v) => ({ paid: money(v.paidLamports), signature: v.signature }));
}
