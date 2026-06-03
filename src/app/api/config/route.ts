import { LIMITS, FEE_PRESETS } from "@/domain/config";
import { getChain } from "@/chain";

export const dynamic = "force-dynamic";

/** Public protocol parameters for the submit form and info panels. */
export async function GET() {
  return Response.json({
    ok: true,
    data: {
      appName: process.env.NEXT_PUBLIC_APP_NAME ?? "FairLaunch",
      chainAdapter: getChain().name,
      limits: LIMITS,
      feePresets: FEE_PRESETS,
    },
  });
}
