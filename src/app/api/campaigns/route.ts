import { listCampaignViews, submitCampaign } from "@/services/launchpad";
import { readJson, respond, errorResponse } from "@/lib/http";
import { appError } from "@/lib/result";
import { serializeCampaign } from "@/lib/serialize";
import { submitCampaignSchema, zodIssues } from "@/lib/validation";
import type { CampaignStatus } from "@/domain/types";

export const dynamic = "force-dynamic";

const VALID_STATUSES: CampaignStatus[] = [
  "draft", "backing", "funded", "launching", "live", "refunding", "failed",
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const statusParam = url.searchParams.getAll("status").filter((s): s is CampaignStatus =>
    VALID_STATUSES.includes(s as CampaignStatus),
  );
  const views = await listCampaignViews(
    statusParam.length ? { status: statusParam } : undefined,
  );
  return Response.json({ ok: true, data: views.map(serializeCampaign) });
}

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body === null) return errorResponse(appError("validation", "invalid JSON body"));

  const parsed = submitCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(appError("validation", "invalid input", zodIssues(parsed.error)));
  }

  const result = await submitCampaign(parsed.data);
  // submitCampaign returns a Campaign; wrap it in a view shape (no backings yet).
  return respond(
    result,
    (c) => serializeCampaign({ ...c, slots: [], backings: [], buybackEvents: [] }),
    201,
  );
}
