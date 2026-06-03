import { getCampaignView } from "@/services/launchpad";
import { errorResponse } from "@/lib/http";
import { appError } from "@/lib/result";
import { serializeCampaign } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const view = await getCampaignView(id);
  if (!view) return errorResponse(appError("not_found", "campaign not found"));
  return Response.json({ ok: true, data: serializeCampaign(view) });
}
