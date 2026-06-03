import type { CampaignDTO, BackingDTO, MoneyDTO } from "./serialize";

/** Thin client for the JSON API. Always returns a discriminated result. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

async function call<T>(
  input: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(input, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok || json?.ok === false) {
      return {
        ok: false,
        error: json?.error ?? { code: "internal", message: `HTTP ${res.status}` },
      };
    }
    return { ok: true, data: json.data as T };
  } catch (e) {
    return { ok: false, error: { code: "network", message: (e as Error).message } };
  }
}

export const api = {
  listCampaigns: (status?: string) =>
    call<CampaignDTO[]>(`/api/campaigns${status ? `?status=${status}` : ""}`),
  getCampaign: (id: string) => call<CampaignDTO>(`/api/campaigns/${id}`),
  submit: (body: unknown) =>
    call<CampaignDTO>("/api/campaigns", { method: "POST", body: JSON.stringify(body) }),
  back: (id: string, body: unknown) =>
    call<BackingDTO>(`/api/campaigns/${id}/back`, { method: "POST", body: JSON.stringify(body) }),
  withdraw: (id: string, backerWallet: string) =>
    call<{ backing: BackingDTO; refunded: MoneyDTO }>(`/api/campaigns/${id}/withdraw`, {
      method: "POST",
      body: JSON.stringify({ backerWallet }),
    }),
  launch: (id: string, creatorWallet: string) =>
    call<CampaignDTO>(`/api/campaigns/${id}/launch`, {
      method: "POST",
      body: JSON.stringify({ creatorWallet }),
    }),
  claim: (id: string, backerWallet: string) =>
    call<{ paid: MoneyDTO; signature: string | null }>(`/api/campaigns/${id}/claim`, {
      method: "POST",
      body: JSON.stringify({ backerWallet }),
    }),
  accrue: (id: string, revenueSol: string) =>
    call<{ creditedBackings: number }>(`/api/campaigns/${id}/accrue`, {
      method: "POST",
      body: JSON.stringify({ revenueSol }),
    }),
  buyback: (id: string, requesterWallet?: string) =>
    call<{ collected: MoneyDTO; burned: MoneyDTO; creator: MoneyDTO; tokensBurned: string; burnTx: string }>(
      `/api/campaigns/${id}/buyback`,
      { method: "POST", body: JSON.stringify({ requesterWallet }) },
    ),
  portfolio: (address: string) =>
    call<{ wallet: string; backings: (BackingDTO & { campaign: CampaignDTO | null })[] }>(
      `/api/wallet/${address}`,
    ),
  stats: () =>
    call<{
      totalLaunches: number;
      live: number;
      backing: number;
      totalBacked: MoneyDTO;
      totalBuyback: MoneyDTO;
      totalTokensBurned: string;
    }>("/api/stats"),
  updateConfig: (
    id: string,
    body: { requesterWallet?: string; burnSharePct?: number; autoBuyback?: boolean },
  ) =>
    call<CampaignDTO>(`/api/campaigns/${id}/config`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  leaderboard: () =>
    call<{
      campaigns: { id: string; name: string; symbol: string; mintAddress: string | null; totalBacked: MoneyDTO; backers: number }[];
      creators: { wallet: string; launches: number; raised: MoneyDTO }[];
    }>("/api/leaderboard"),
};

export type { CampaignDTO, BackingDTO, MoneyDTO };
