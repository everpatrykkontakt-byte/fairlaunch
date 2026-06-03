import { getGlobalStats } from "@/services/launchpad";
import { money } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Protocol-wide aggregates for the home dashboard. */
export async function GET() {
  const s = await getGlobalStats();
  return Response.json({
    ok: true,
    data: {
      totalLaunches: s.totalLaunches,
      live: s.byStatus.live ?? 0,
      backing: s.byStatus.backing ?? 0,
      totalBacked: money(s.totalBackedLamports),
      totalBuyback: money(s.totalBuybackLamports),
      totalTokensBurned: s.totalTokensBurned.toString(),
    },
  });
}
