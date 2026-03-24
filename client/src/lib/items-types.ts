export type EquipmentSlot =
  | "weapon"
  | "helmet"
  | "body"
  | "legs"
  | "gloves"
  | "boots"
  | "shield"
  | "cape"
  | "ring"
  | "amulet";

export type Rarity =
  | "Common"
  | "Uncommon"
  | "Rare"
  | "Epic"
  | "Legendary"
  | "Mythic";

export const RARITY_CHANCES: Record<Rarity, number> = {
  Common: 72.4,
  Uncommon: 18,
  Rare: 6,
  Epic: 2.5,
  Legendary: 1,
  Mythic: 0.1,
};

export const RARITY_MULTIPLIERS: Record<Rarity, number> = {
  Common: 1.0,
  Uncommon: 1.25,
  Rare: 1.6,
  Epic: 1.9,
  Legendary: 2.2,
  Mythic: 3.5,
};

export const RARITY_COLORS: Record<Rarity, string> = {
  Common: "text-gray-400",
  Uncommon: "text-green-400",
  Rare: "text-blue-400",
  Epic: "text-purple-400",
  Legendary: "text-yellow-400",
  Mythic: "text-red-400",
};

export const RARITY_BG_COLORS: Record<Rarity, string> = {
  Common: "bg-zinc-900/50 border-transparent",
  Uncommon: "bg-zinc-900/50 border-emerald-500",
  Rare: "bg-zinc-900/50 border-blue-500",
  Epic: "bg-zinc-900/50 border-purple-500",
  Legendary: "bg-zinc-900/50 border-yellow-500",
  Mythic: "bg-zinc-900/50 border-red-500",
};

export interface ItemStats {
  attackBonus?: number;
  strengthBonus?: number;
  defenceBonus?: number;
  accuracyBonus?: number;
  hitpointsBonus?: number;
  // Role system stats
  critChance?: number;
  critDamage?: number;
  healPower?: number;
  buffPower?: number;
  // Armor-type specific bonuses
  skillDamageBonus?: number;      // Cloth armor: skill damage %
  attackSpeedBonus?: number;      // Leather armor: attack speed %
  healingReceivedBonus?: number;  // Plate armor: healing received %
  // Staff-specific bonuses
  onHitHealingPercent?: number;   // Healer staff: on-hit healing %
  buffDurationBonus?: number;     // Healer staff: buff duration %
  partyDpsBuff?: number;          // Healer staff: party DPS bonus %
  partyDefenceBuff?: number;      // Healer staff: party defence bonus %
  partyAttackSpeedBuff?: number;  // Healer staff: party attack speed %
  lootChanceBonus?: number;       // Triple Loot staff: loot chance %
}

export type WeaponCategory = "dagger" | "sword" | "axe" | "hammer" | "bow" | "staff" | "2h_sword" | "2h_axe" | "2h_warhammer";

// Role system types
export type ArmorType = 'plate' | 'leather' | 'cloth';
export type WeaponType = 'sword_shield' | 'dagger' | '2h_sword' | '2h_axe' | '2h_warhammer' | 'bow' | 'staff';

export interface WeaponSkill {
  id: string;
  name: string;
  chance: number;
  type: "critical" | "combo" | "armor_break" | "poison" | "lifesteal_burst" | "stun" | "slow_crit" | "damage" | "heal" | "groupHeal" | "lifesteal" | "buff" | "debuff" | "aoe";
  hits?: number;
  damageMultiplier?: number;
  armorBreakPercent?: number;
  dotDamage?: number;
  dotDuration?: number;
  stunCycles?: number;
  slowMultiplier?: number;
  critMultiplier?: number;
  damage?: number;
  healAmount?: number;
  healPercent?: number;
  lifestealPercent?: number;
  buffType?: "regen" | "shield" | "defence";
  healPerTick?: number;
  shieldAmount?: number;
  defenceBoost?: number;
  duration?: number;
  debuffType?: "armor_break" | "slow" | "poison";
  armorReduction?: number;
  poisonDamage?: number;
  poisonDuration?: number;
  burnDamage?: number;
  burnDuration?: number;
  ignoreDefence?: number;
  targets?: number;
  description?: string;
  nameTranslations?: Record<string, string>;
}

export type TranslationMap = Record<string, string>;

export interface Item {
  id: string;
  name: string;
  description: string;
  type: "material" | "equipment" | "food" | "potion" | "misc";
  equipSlot?: EquipmentSlot;
  stats?: ItemStats;
  levelRequired?: number;
  skillRequired?: string;
  rarity?: Rarity;
  vendorPrice?: number;
  untradable?: boolean;
  duration?: number;
  effect?: PotionEffect;
  weaponCategory?: WeaponCategory;
  attackSpeedMs?: number;
  lifestealPercent?: number;
  weaponSkills?: WeaponSkill[];
  icon?: string;
  nameTranslations?: TranslationMap;
  descriptionTranslations?: TranslationMap;
  // Role system fields
  armorType?: ArmorType;
  weaponType?: WeaponType;
  critChance?: number;
  critDamage?: number;
  healPower?: number;
  buffPower?: number;
  buffType?: 'damage' | 'defence' | 'speed';
  staffType?: 'dps' | 'healer';
  masteryRequired?: number;
  salvageOverride?: { minScrap: number; maxScrap: number };
}

export interface PotionEffect {
  type: "attack_boost" | "strength_boost" | "defence_boost" | "hp_regen" | "poison_immunity" | "crit_chance" | "damage_reduction" | "xp_boost" | "maxHpBoost" | "lifesteal";
  value: number;
}

export interface ActiveBuff {
  potionId: string;
  effectType: PotionEffect["type"];
  value: number;
  startTime: number;
  duration: number;
  expiresAt: number;
}

export interface Recipe {
  id: string;
  resultItemId: string;
  resultQuantity: number;
  materials: { itemId: string; quantity: number }[];
  skill: string;
  levelRequired: number;
  xpReward: number;
  craftTime: number;
  category?:
    | "smelting"
    | "sword"
    | "dagger"
    | "bow"
    | "staff"
    | "hammer"
    | "axe"
    | "2h_sword"
    | "2h_axe"
    | "2h_warhammer"
    | "shield"
    | "armor"
    | "accessory"
    | "cooking"
    | "potion"
    | "";
  regionId?: string;
  regionIds?: string[];
}

export const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  "helmet",
  "amulet",
  "cape",
  "weapon",
  "body",
  "shield",
  "legs",
  "gloves",
  "boots",
  "ring",
];

export { isItemTradable, UNTRADABLE_ITEM_IDS } from "@shared/itemData";
