import { updateBuybackConfig, getCampaignView } from "@/services/launchpad";
import { readJson, respond, errorResponse } from "@/lib/http";
import { appError } from "@/lib/result";
import { serializeCampaign } from "@/lib/serialize";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  requesterWallet: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).optional(),
  burnSharePct: z.number().int().min(0).max(100).optional(),
  autoBuyback: z.boolean().optional(),
});

/** Update a campaign's buyback config (burn share / auto-buyback). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (body === null) return errorResponse(appError("validation", "invalid JSON body"));

  const parsed = schema.safeParse(body);
  if (!parsed.success) return errorResponse(appError("validation", "invalid config"));

  const result = await updateBuybackConfig(id, parsed.data);
  if (!result.ok) return errorResponse(result.error);

  const view = await getCampaignView(id);
  return respond(
    view
      ? { ok: true as const, value: view }
      : { ok: false as const, error: appError("internal", "read failed") },
    serializeCampaign,
  );
}
