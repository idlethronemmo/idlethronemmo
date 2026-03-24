export const INVENTORY_LIMITS: Record<string, number> = {
  "teleport_stone": 5,
  "chaos_stone": 20,
  "jurax_gem": 20,
  "death_liquid": 20,
};

export function getInventoryLimit(itemId: string): number | null {
  return INVENTORY_LIMITS[itemId] ?? null;
}

export function canAddToInventory(
  itemId: string,
  currentQty: number,
  addQty: number
): { allowed: boolean; maxCanAdd: number } {
  const limit = getInventoryLimit(itemId);
  if (limit === null) {
    return { allowed: true, maxCanAdd: addQty };
  }
  const space = Math.max(0, limit - currentQty);
  const canAdd = Math.min(addQty, space);
  return { allowed: canAdd > 0, maxCanAdd: canAdd };
}
