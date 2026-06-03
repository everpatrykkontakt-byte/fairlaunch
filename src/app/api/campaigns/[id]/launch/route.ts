import { launchCampaign, getCampaignView } from "@/services/launchpad";
import { readJson, respond, errorResponse } from "@/lib/http";
import { appError } from "@/lib/result";
import { serializeCampaign } from "@/lib/serialize";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  creatorWallet: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (body === null) return errorResponse(appError("validation", "invalid JSON body"));

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(appError("validation", "creatorWallet is required"));
  }

  const result = await launchCampaign(id, parsed.data.creatorWallet);
  if (!result.ok) return errorResponse(result.error);

  // Return the full view (with distributed slots) for the UI.
  const view = await getCampaignView(id);
  return respond(
    view ? { ok: true as const, value: view } : { ok: false as const, error: appError("internal", "post-launch read failed") },
    serializeCampaign,
  );
}
