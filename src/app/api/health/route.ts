import { getChain } from "@/chain";
import { getGlobalStats } from "@/services/launchpad";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

/** Lightweight liveness/readiness probe for ops + uptime monitors. */
export async function GET() {
  let seeded = false;
  let launches = 0;
  try {
    const stats = await getGlobalStats();
    seeded = true;
    launches = stats.totalLaunches;
  } catch {
    /* store not ready */
  }
  return Response.json({
    ok: true,
    data: {
      status: "ok",
      adapter: getChain().name,
      store: process.env.DATA_STORE ?? "memory",
      seeded,
      launches,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      time: new Date().toISOString(),
    },
  });
}
