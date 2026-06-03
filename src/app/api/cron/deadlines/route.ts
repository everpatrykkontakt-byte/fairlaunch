import { processAutoBuybacks, processDeadlines } from "@/services/launchpad";
import { errorResponse } from "@/lib/http";
import { appError } from "@/lib/result";

export const dynamic = "force-dynamic";

/**
 * Enforces both refund safety nets (backing deadline + launch window). Designed
 * to be hit by a scheduler every few minutes; it is idempotent, so duplicate
 * or overlapping runs are harmless.
 *
 * Guarded by CRON_SECRET when set: requests must send `Authorization: Bearer <secret>`.
 * If CRON_SECRET is unset (local dev), the endpoint is open for convenience.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return errorResponse(appError("forbidden", "invalid cron secret"));
    }
  }
  const deadlines = await processDeadlines();
  const buybacks = await processAutoBuybacks();
  return Response.json({
    ok: true,
    data: {
      deadlines: deadlines.ok ? deadlines.value : null,
      autoBuybacks: buybacks.ok ? buybacks.value : null,
    },
  });
}

export const GET = handle;
export const POST = handle;
