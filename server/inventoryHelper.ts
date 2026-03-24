import { canonicalizeItemId } from "@shared/itemData";
import { storage } from "./storage";

let cachedKnownIds: Set<string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function ensureKnownItemIds(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedKnownIds && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedKnownIds;
  }
  try {
    const items = await storage.getAllGameItems();
    cachedKnownIds = new Set(items.map((i: any) => i.id));
    cacheTimestamp = now;
  } catch (err) {
    console.error("[inventoryHelper] Failed to fetch game items for ID canonicalization:", err);
    if (!cachedKnownIds) cachedKnownIds = new Set();
  }
  return cachedKnownIds!;
}

export async function getCanonicalItemId(rawItemId: string): Promise<string> {
  const knownIds = await ensureKnownItemIds();
  if (knownIds.size === 0) return rawItemId;
  return canonicalizeItemId(rawItemId, knownIds) ?? rawItemId;
}

export function getCanonicalItemIdFromCache(rawItemId: string, knownIds: Set<string>): string {
  if (knownIds.size === 0) return rawItemId;
  return canonicalizeItemId(rawItemId, knownIds) ?? rawItemId;
}

export function invalidateInventoryHelperCache(): void {
  cachedKnownIds = null;
  cacheTimestamp = 0;
}
