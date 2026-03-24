import type { Item } from "@/lib/items-types";

export type ItemRole = 'tank' | 'dps' | 'healer' | null;

export function getItemRole(item: Item | null | undefined): ItemRole {
  if (!item) return null;
  
  if (item.armorType === 'plate') return 'tank';
  if (item.armorType === 'leather' || item.weaponType === 'bow' || item.weaponType === 'dagger' || (item.critChance && item.critChance > 0)) return 'dps';
  if (item.armorType === 'cloth' || item.weaponType === 'staff' || (item.healPower && item.healPower > 0)) return 'healer';
  
  return null;
}

export function hasRoleStats(item: Item | null | undefined): boolean {
  if (!item) return false;
  
  return (
    (item.critChance ?? 0) > 0 ||
    (item.critDamage ?? 0) > 0 ||
    (item.healPower ?? 0) > 0 ||
    (item.buffPower ?? 0) > 0
  );
}
