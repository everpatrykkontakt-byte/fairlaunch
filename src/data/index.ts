import { MemoryStore } from "./memoryStore";
import { seed } from "./seed";
import type { Store } from "./store";

/**
 * Store singleton. In dev, Next.js hot-reloads modules, so we stash the
 * instance on globalThis to keep seeded data stable across reloads.
 */
const globalForStore = globalThis as unknown as {
  __fairlaunchStore?: Store;
  __fairlaunchSeeded?: boolean;
};

export function getStore(): Store {
  if (!globalForStore.__fairlaunchStore) {
    const which = process.env.DATA_STORE ?? "memory";
    if (which !== "memory") {
      throw new Error(
        `DATA_STORE=${which} not implemented in the skeleton; implement src/data/${which}Store.ts`,
      );
    }
    globalForStore.__fairlaunchStore = new MemoryStore();
  }
  return globalForStore.__fairlaunchStore;
}

/** Seed demo data once per process. Safe to call on every request. */
export async function ensureSeeded(): Promise<void> {
  if (globalForStore.__fairlaunchSeeded) return;
  globalForStore.__fairlaunchSeeded = true;
  await seed(getStore());
}

export type { Store } from "./store";
