import { listCampaignViews } from "@/services/launchpad";
import { money } from "@/lib/serialize";
import { addL, ZERO, type Lamports } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * Two boards derived live from the store:
 *  - campaigns: live launches ranked by total SOL backed
 *  - creators: wallets ranked by number of successful (live) launches
 */
export async function GET() {
  const views = await listCampaignViews();
  const live = views.filter((c) => c.status === "live");

  const campaigns = [...live]
    .sort((a, b) => Number(b.totalBackedLamports - a.totalBackedLamports))
    .slice(0, 25)
    .map((c) => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      mintAddress: c.mintAddress,
      totalBacked: money(c.totalBackedLamports),
      backers: c.totalSlots,
    }));

  const creatorStats = new Map<string, { launches: number; raised: Lamports }>();
  for (const c of live) {
    const cur = creatorStats.get(c.creatorWallet) ?? { launches: 0, raised: ZERO };
    cur.launches += 1;
    cur.raised = addL(cur.raised, c.totalBackedLamports);
    creatorStats.set(c.creatorWallet, cur);
  }
  const creators = [...creatorStats.entries()]
    .sort((a, b) => b[1].launches - a[1].launches || Number(b[1].raised - a[1].raised))
    .slice(0, 25)
    .map(([wallet, s]) => ({ wallet, launches: s.launches, raised: money(s.raised) }));

  return Response.json({ ok: true, data: { campaigns, creators } });
}
