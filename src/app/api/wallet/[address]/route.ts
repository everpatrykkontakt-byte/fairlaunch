import { listBackingsForWallet, getCampaignView } from "@/services/launchpad";
import { serializeBacking, serializeCampaign } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Portfolio: every backing for a wallet, joined with its campaign summary. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address } = await ctx.params;
  const backings = await listBackingsForWallet(address);

  const campaignIds = [...new Set(backings.map((b) => b.campaignId))];
  const campaigns = await Promise.all(campaignIds.map((id) => getCampaignView(id)));
  const byId = new Map(
    campaigns.filter((c) => c !== null).map((c) => [c!.id, serializeCampaign(c!)]),
  );

  return Response.json({
    ok: true,
    data: {
      wallet: address,
      backings: backings.map((b) => ({
        ...serializeBacking(b),
        campaign: byId.get(b.campaignId) ?? null,
      })),
    },
  });
}
