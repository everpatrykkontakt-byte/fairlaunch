import { withdrawBacking } from "@/services/launchpad";
import { readJson, respond, errorResponse } from "@/lib/http";
import { appError } from "@/lib/result";
import { money, serializeBacking } from "@/lib/serialize";
import { withdrawSchema, zodIssues } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (body === null) return errorResponse(appError("validation", "invalid JSON body"));

  const parsed = withdrawSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(appError("validation", "invalid input", zodIssues(parsed.error)));
  }

  const result = await withdrawBacking(id, parsed.data.backerWallet);
  return respond(result, (v) => ({
    backing: serializeBacking(v.backing),
    refunded: money(v.refundedLamports),
  }));
}
