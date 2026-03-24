import type { RawEquipmentSlotData } from "@shared/statResolver";
import type { CachedItemData } from "./scheduler";

const RARITY_MULTIPLIERS: Record<string, number> = {
  "Common": 1.0,
  "Uncommon": 1.15,
  "Rare": 1.3,
  "Epic": 1.5,
  "Legendary": 1.75,
  "Mythic": 2.0,
};

const EQUIPMENT_SLOTS = ["weapon", "shield", "helmet", "body", "legs", "gloves", "boots", "amulet", "ring"];

function parseItemWithRarityForAdapter(itemId: string): { baseItem: string; rarity: string } {
  const parenMatch = itemId.match(/^(.+?)\s*\((\w+)\)(#[\w]+)?$/);
  if (parenMatch) {
    return { baseItem: parenMatch[1].trim(), rarity: parenMatch[2] };
  }
  const underscoreRarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  for (const rarity of underscoreRarities) {
    if (itemId.toLowerCase().endsWith(`_${rarity}`)) {
      const baseItem = itemId.substring(0, itemId.lastIndexOf('_'));
      return { baseItem, rarity: rarity.charAt(0).toUpperCase() + rarity.slice(1) };
    }
  }
  return { baseItem: itemId, rarity: "Common" };
}

export function buildSlotsFromCache(
  equipment: Record<string, string | null>,
  enhancementLevels: Map<string, number>,
  itemModifications: Record<string, any>,
  cache: Map<string, CachedItemData>
): RawEquipmentSlotData[] {
  const mainWeaponId = equipment.weapon;
  let mainWeaponCategory: string | undefined;
  if (mainWeaponId) {
    const { baseItem } = parseItemWithRarityForAdapter(mainWeaponId);
    const cached = cache.get(baseItem);
    mainWeaponCategory = cached?.weaponCategory || undefined;
  }
  const isDaggerMain = mainWeaponCategory === "dagger";

  const slots: RawEquipmentSlotData[] = [];

  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = equipment[slot];
    if (!itemId) continue;

    const { baseItem, rarity } = parseItemWithRarityForAdapter(itemId);
    const cached = cache.get(baseItem);

    if (!cached?.stats) continue;

    const rarityMultiplier = RARITY_MULTIPLIERS[rarity] || 1.0;
    const enhancementLevel = enhancementLevels.get(itemId) || enhancementLevels.get(baseItem) || 0;
    const isOffhandDagger = slot === "shield" && cached.weaponCategory === "dagger";
    if (isOffhandDagger && !isDaggerMain) continue;

    const mods = itemModifications[itemId];

    slots.push({
      itemId,
      stats: cached.stats as RawEquipmentSlotData["stats"],
      weaponCategory: cached.weaponCategory || undefined,
      rarityMultiplier,
      enhancementLevel,
      addedStats: mods?.addedStats,
      isDualWieldOffhand: isOffhandDagger && isDaggerMain,
    });
  }

  return slots;
}
