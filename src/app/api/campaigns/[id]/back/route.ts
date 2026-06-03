import { backCampaign } from "@/services/launchpad";
import { readJson, respond, errorResponse } from "@/lib/http";
import { appError } from "@/lib/result";
import { serializeBacking } from "@/lib/serialize";
import { backSchema, zodIssues } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (body === null) return errorResponse(appError("validation", "invalid JSON body"));

  const parsed = backSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(appError("validation", "invalid input", zodIssues(parsed.error)));
  }

  const result = await backCampaign(id, parsed.data);
  return respond(result, serializeBacking, 201);
}
