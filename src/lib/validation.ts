import { z } from "zod";
import { LIMITS, FEE_PRESETS } from "@/domain/config";

/**
 * Edge validation. Every API route parses its body through one of these
 * schemas before anything touches the services, so malformed input never
 * reaches business logic. SOL amounts are validated as strings to preserve
 * exactness (parsed to lamports downstream).
 */

const solString = z
  .string()
  .regex(/^\d+(\.\d{1,9})?$/, "must be a SOL amount with up to 9 decimals");

// A loose base58-ish wallet check. The real chain adapter does strict
// validation; this just rejects obvious garbage at the edge.
const wallet = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid wallet address");

const optionalUrl = z.string().url().max(200).optional().or(z.literal("").transform(() => undefined));

export const feeSplitSchema = z
  .object({
    backersBps: z.number().int().min(0).max(10_000),
    platformBps: z.number().int().min(0).max(10_000),
    creatorBps: z.number().int().min(0).max(10_000),
    burnBps: z.number().int().min(0).max(10_000),
  })
  .refine(
    (s) => s.backersBps + s.platformBps + s.creatorBps + s.burnBps === 10_000,
    { message: "fee split must sum to 10000 bps (100%)" },
  );

export const submitCampaignSchema = z.object({
  creatorWallet: wallet,
  name: z.string().trim().min(1).max(LIMITS.NAME_MAX),
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.SYMBOL_MAX)
    .regex(/^[A-Za-z0-9]+$/, "symbol must be alphanumeric")
    .transform((s) => s.toUpperCase()),
  description: z.string().trim().max(LIMITS.DESCRIPTION_MAX).default(""),
  imageUrl: z.string().url().max(300).or(z.literal("")).default(""),
  links: z
    .object({
      twitter: optionalUrl,
      telegram: optionalUrl,
      discord: optionalUrl,
      website: optionalUrl,
    })
    .default({}),

  totalSlots: z.number().int().min(LIMITS.MIN_SLOTS).max(LIMITS.MAX_SLOTS),
  minBackingSol: solString,
  maxBackingSol: solString.nullable().default(null),
  backingHours: z
    .number()
    .int()
    .min(LIMITS.MIN_BACKING_HOURS)
    .max(LIMITS.MAX_BACKING_HOURS)
    .default(LIMITS.DEFAULT_BACKING_HOURS),

  feePreset: z
    .enum(Object.keys(FEE_PRESETS) as [keyof typeof FEE_PRESETS])
    .optional(),
  feeSplit: feeSplitSchema.optional(),

  // Buyback-and-burn config.
  burnSharePct: z.number().int().min(0).max(100).default(LIMITS.DEFAULT_BURN_SHARE_PCT),
  autoBuyback: z.boolean().default(false),
});
export type SubmitCampaignInput = z.infer<typeof submitCampaignSchema>;

export const backSchema = z.object({
  backerWallet: wallet,
  amountSol: solString,
  /** Optional explicit slot; otherwise the next free slot is assigned. */
  slotNumber: z.number().int().min(1).max(LIMITS.MAX_SLOTS).optional(),
  /** Client-supplied idempotency key to make retries safe. */
  idempotencyKey: z.string().min(8).max(128).optional(),
  /**
   * Real (non-custodial) mode only: the signature of the SOL transfer the
   * backer already signed+sent from their own wallet into the pool wallet.
   * The server verifies it on-chain. Ignored by the mock adapter.
   */
  depositTx: z.string().min(32).max(128).optional(),
});
export type BackInput = z.infer<typeof backSchema>;

export const withdrawSchema = z.object({
  backerWallet: wallet,
});

export const claimFeesSchema = z.object({
  backerWallet: wallet,
});

/** Format a ZodError into the AppError `details` shape. */
export function zodIssues(error: z.ZodError): unknown {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}
