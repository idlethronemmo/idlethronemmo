// Server-side combat utilities for offline simulation

// Food healing data (matches client/src/lib/foods.ts)
const FOOD_HEAL_AMOUNTS: Record<string, number> = {
  "Raw Shrimp": 5,
  "Cooked Shrimp": 25,
  "Raw Chicken": 5,
  "Chicken": 30,
  "Raw Rabbit": 5,
  "Cooked Rabbit": 35,
  "Raw Meat": 8,
  "Cooked Meat": 45,
  "Raw Herring": 10,
  "Raw Trout": 12,
  "Raw Salmon": 15,
  "Raw Tuna": 18,
  "Raw Lobster": 20,
  "Raw Swordfish": 25,
  "Raw Shark": 30,
  "Raw Manta Ray": 35,
  "Raw Sea Turtle": 40,
  "Cooked Herring": 55,
  "Cooked Trout": 70,
  "Cooked Salmon": 90,
  "Cooked Tuna": 110,
  "Cooked Lobster": 135,
  "Cooked Swordfish": 165,
  "Cooked Shark": 200,
  "Cooked Manta Ray": 250,
  "Cooked Sea Turtle": 310,
  "Raw Sardine": 8,
  "Cooked Sardine": 20,
  "Cooked Spirit Fish": 25,
  "Cooked Sand Eel": 60,
  "Cooked Cave Fish": 45,
  "Cooked Lava Fish": 80,
  "Cooked Dragon Fish": 100,
  "Cooked Frost Fish": 38,
  "Cooked Void Fish": 45,
  "Void Fish": 45,
  "dungeon_ration": 200,
  "cursed_bone_broth": 350,
  "shadow_stew": 500,
  "dragon_bone_soup": 700,
  "void_feast": 950,
  "Goblin Kebab": 110,
  "Spider Soup": 175,
  "Meat Pie": 105,
  "Fish Stew": 155,
  "Orc Roast": 230,
  "Wyvern Steak": 35,
  "Drake Roast": 40,
  "Dragon Steak": 42,
  "Frost Dragon Stew": 50,
  "Void Stew": 55,
  "Spirit Feast": 65,
};

export function isFood(itemId: string): boolean {
  return FOOD_HEAL_AMOUNTS[itemId] !== undefined && FOOD_HEAL_AMOUNTS[itemId] > 0;
}

export function getFoodHealAmount(itemId: string): number {
  return FOOD_HEAL_AMOUNTS[itemId] || 0;
}

export function getBestFood(inventory: Record<string, number>): string | null {
  let bestFood: string | null = null;
  let bestHeal = 0;
  
  for (const [itemId, quantity] of Object.entries(inventory)) {
    if (quantity > 0 && isFood(itemId)) {
      const heal = getFoodHealAmount(itemId);
      if (heal > bestHeal) {
        bestHeal = heal;
        bestFood = itemId;
      }
    }
  }
  
  return bestFood;
}

// Potion data for offline combat (matches client/src/lib/items-data.ts)
export type PotionEffectType = "hp_regen" | "attack_boost" | "strength_boost" | "defence_boost" | "crit_chance" | "damage_reduction" | "xp_boost" | "poison_immunity" | "lifesteal" | "maxHpBoost";

export interface PotionData {
  effectType: PotionEffectType;
  value: number;
  duration: number; // in seconds
}

const POTION_DATA: Record<string, PotionData> = {
  "Minor Healing Potion": { effectType: "hp_regen", value: 3, duration: 120 },
  "Minor HP Potion": { effectType: "maxHpBoost", value: 10, duration: 300 },
  "verdant_crit_tonic": { effectType: "crit_chance", value: 2, duration: 120 },
  "verdant_dr_potion": { effectType: "damage_reduction", value: 3, duration: 120 },
  "Soft Fur Tonic": { effectType: "defence_boost", value: 5, duration: 180 },
  "Moonlight Elixir": { effectType: "xp_boost", value: 5, duration: 300 },
  "Small HP Potion": { effectType: "maxHpBoost", value: 15, duration: 300 },
  "dungeon_dust_tonic": { effectType: "attack_boost", value: 10, duration: 240 },
  "Wolf Fang Elixir": { effectType: "attack_boost", value: 8, duration: 180 },
  "quarry_str_brew": { effectType: "strength_boost", value: 8, duration: 180 },
  "quarry_dr_potion": { effectType: "damage_reduction", value: 5, duration: 180 },
  "quarry_vitality_potion": { effectType: "maxHpBoost", value: 15, duration: 300 },
  "Bat Wing Brew": { effectType: "strength_boost", value: 10, duration: 240 },
  "quarry_xp_elixir": { effectType: "xp_boost", value: 8, duration: 300 },
  "Antidote Potion": { effectType: "poison_immunity", value: 1, duration: 300 },
  "cursed_bone_elixir": { effectType: "hp_regen", value: 5, duration: 180 },
  "Shadow Draught": { effectType: "crit_chance", value: 4, duration: 240 },
  "dunes_poison_immunity": { effectType: "poison_immunity", value: 1, duration: 360 },
  "dunes_def_tonic": { effectType: "defence_boost", value: 12, duration: 240 },
  "dunes_regen_potion": { effectType: "hp_regen", value: 8, duration: 240 },
  "dunes_vitality_potion": { effectType: "maxHpBoost", value: 20, duration: 300 },
  "dunes_xp_potion": { effectType: "xp_boost", value: 10, duration: 360 },
  "Sand Storm Elixir": { effectType: "crit_chance", value: 5, duration: 300 },
  "Mummy's Curse Antidote": { effectType: "damage_reduction", value: 10, duration: 360 },
  "Sun Crystal Tonic": { effectType: "attack_boost", value: 12, duration: 300 },
  "soul_gem_tonic": { effectType: "xp_boost", value: 12, duration: 360 },
  "Djinn Essence Potion": { effectType: "attack_boost", value: 15, duration: 300 },
  "obsidian_def_potion": { effectType: "defence_boost", value: 18, duration: 300 },
  "obsidian_regen_elixir": { effectType: "hp_regen", value: 12, duration: 300 },
  "obsidian_crit_potion": { effectType: "crit_chance", value: 7, duration: 300 },
  "Orc War Potion": { effectType: "strength_boost", value: 25, duration: 300 },
  "obsidian_vitality_potion": { effectType: "maxHpBoost", value: 25, duration: 360 },
  "Dark Essence Elixir": { effectType: "strength_boost", value: 20, duration: 360 },
  "Obsidian Potion": { effectType: "damage_reduction", value: 12, duration: 360 },
  "dragonspire_regen_potion": { effectType: "hp_regen", value: 15, duration: 360 },
  "Wyvern Scale Potion": { effectType: "defence_boost", value: 25, duration: 360 },
  "dragonspire_dr_elixir": { effectType: "damage_reduction", value: 15, duration: 360 },
  "dragonspire_vitality_potion": { effectType: "maxHpBoost", value: 30, duration: 360 },
  "XP Boost Potion": { effectType: "xp_boost", value: 15, duration: 600 },
  "void_essence_draught": { effectType: "xp_boost", value: 18, duration: 480 },
  "dragonspire_lifesteal_potion": { effectType: "lifesteal", value: 5, duration: 360 },
  "Dragon Fire Elixir": { effectType: "attack_boost", value: 30, duration: 480 },
  "Dragonfire Elixir": { effectType: "strength_boost", value: 30, duration: 480 },
  "frozen_str_potion": { effectType: "strength_boost", value: 30, duration: 360 },
  "frozen_regen_elixir": { effectType: "hp_regen", value: 18, duration: 360 },
  "frozen_dr_potion": { effectType: "damage_reduction", value: 18, duration: 420 },
  "frozen_crit_potion": { effectType: "crit_chance", value: 12, duration: 420 },
  "Frost Resistance Potion": { effectType: "defence_boost", value: 35, duration: 480 },
  "frozen_vitality_potion": { effectType: "maxHpBoost", value: 35, duration: 420 },
  "Frostbite Serum": { effectType: "lifesteal", value: 8, duration: 420 },
  "frozen_xp_elixir": { effectType: "xp_boost", value: 20, duration: 480 },
  "Dragon Fire Potion": { effectType: "attack_boost", value: 35, duration: 480 },
  "Infernal Potion": { effectType: "crit_chance", value: 10, duration: 600 },
  "void_poison_immunity": { effectType: "poison_immunity", value: 1, duration: 600 },
  "void_attack_potion": { effectType: "attack_boost", value: 40, duration: 480 },
  "void_regen_potion": { effectType: "hp_regen", value: 22, duration: 420 },
  "void_dr_potion": { effectType: "damage_reduction", value: 22, duration: 480 },
  "Void Strength Potion": { effectType: "strength_boost", value: 40, duration: 480 },
  "Void Defence Potion": { effectType: "defence_boost", value: 45, duration: 480 },
  "void_lifesteal_potion": { effectType: "lifesteal", value: 12, duration: 480 },
  "Cosmic Elixir": { effectType: "hp_regen", value: 30, duration: 600 },
  "Void Essence Potion": { effectType: "xp_boost", value: 25, duration: 600 },
  "XL Vitality Potion": { effectType: "maxHpBoost", value: 25, duration: 300 },
};

export function isPotion(itemId: string): boolean {
  return POTION_DATA[itemId] !== undefined;
}

export function getPotionData(itemId: string): PotionData | null {
  return POTION_DATA[itemId] || null;
}

// Equipment slot types
type EquipmentSlot = "helmet" | "cape" | "amulet" | "weapon" | "body" | "shield" | "legs" | "gloves" | "boots" | "ring";

// Rarity chances (matches client/src/lib/items-types.ts)
export const RARITY_CHANCES: Record<string, number> = {
  Common: 72.4,
  Uncommon: 18,
  Rare: 6,
  Epic: 2.5,
  Legendary: 1,
  Mythic: 0.1,
};

// Equipment drop chances by rarity (percentage 0-100)
// Used when equipment drops from monsters - rarity determines drop rate
export const EQUIPMENT_DROP_CHANCE_BY_RARITY: Record<string, number> = {
  Common: 20,        // 20%
  Uncommon: 10,      // 10%
  Rare: 6,           // 6%
  Epic: 3,           // 3%
  Legendary: 0.5,    // 0.5%
  Mythic: 0.1,       // 0.1%
};

// Rarity multipliers (matches client/src/lib/items-types.ts)
const RARITY_MULTIPLIERS: Record<string, number> = {
  Common: 1.0,
  Uncommon: 1.15,
  Rare: 1.3,
  Epic: 1.5,
  Legendary: 1.75,
  Mythic: 2.0,
};

// Roll a rarity for crafted equipment
export function rollRarity(): string {
  const roll = Math.random() * 100;
  let cumulative = 0;

  for (const [rarity, chance] of Object.entries(RARITY_CHANCES)) {
    cumulative += chance;
    if (roll < cumulative) {
      return rarity;
    }
  }

  return "Common";
}

// Roll a rarity for equipment dropped from monsters
// Different distribution than crafting - rarer drops are harder to get
export function rollRarityForDrop(): string {
  const roll = Math.random() * 100;
  if (roll < 0.075) return "Mythic";
  if (roll < 0.575) return "Legendary";
  if (roll < 1.575) return "Epic";
  if (roll < 4.575) return "Rare";
  if (roll < 14.575) return "Uncommon";
  return "Common";
}

// Base equipment stats (covers all equipment items in the game)
// Format: itemId -> { attackBonus, strengthBonus, defenceBonus, accuracyBonus, hitpointsBonus }
const EQUIPMENT_STATS: Record<string, { attackBonus?: number; strengthBonus?: number; defenceBonus?: number; accuracyBonus?: number; hitpointsBonus?: number }> = {
  // Bronze
  "Bronze Sword": { attackBonus: 4, strengthBonus: 5 },
  "Bronze Dagger": { attackBonus: 3, strengthBonus: 2 },
  "Bronze Warhammer": { attackBonus: 2, strengthBonus: 8 },
  "Bronze Shield": { defenceBonus: 4 },
  "Bronze Helmet": { defenceBonus: 2 },
  "Bronze Platebody": { defenceBonus: 5 },
  "Bronze Platelegs": { defenceBonus: 3 },
  "Bronze Gloves": { defenceBonus: 1 },
  "Bronze Boots": { defenceBonus: 1 },
  // Iron
  "Iron Sword": { attackBonus: 7, strengthBonus: 6 },
  "Iron Dagger": { attackBonus: 5, strengthBonus: 6 },
  "Iron Warhammer": { attackBonus: 6, strengthBonus: 15 },
  "Iron Shield": { defenceBonus: 7 },
  "Iron Helmet": { defenceBonus: 4 },
  "Iron Platebody": { defenceBonus: 9 },
  "Iron Platelegs": { defenceBonus: 6 },
  "Iron Gloves": { defenceBonus: 2 },
  "Iron Boots": { defenceBonus: 2 },
  // Steel
  "Steel Sword": { attackBonus: 11, strengthBonus: 10 },
  "Steel Warhammer": { attackBonus: 12, strengthBonus: 25 },
  "Steel Shield": { defenceBonus: 11 },
  "Steel Helmet": { defenceBonus: 6 },
  "Steel Platebody": { defenceBonus: 14 },
  "Steel Platelegs": { defenceBonus: 9 },
  "Steel Gloves": { defenceBonus: 3 },
  "Steel Boots": { defenceBonus: 3 },
  // Mithril
  "Mithril Sword": { attackBonus: 16, strengthBonus: 15 },
  "Mithril Warhammer": { attackBonus: 22, strengthBonus: 42 },
  "Mithril Shield": { defenceBonus: 16 },
  "Mithril Helmet": { defenceBonus: 9 },
  "Mithril Platebody": { defenceBonus: 20 },
  "Mithril Platelegs": { defenceBonus: 13 },
  "Mithril Gloves": { defenceBonus: 4 },
  "Mithril Boots": { defenceBonus: 4 },
  // Adamant
  "Adamant Sword": { attackBonus: 22, strengthBonus: 21 },
  "Adamant Warhammer": { attackBonus: 35, strengthBonus: 55 },
  "Adamant Shield": { defenceBonus: 22 },
  "Adamant Helmet": { defenceBonus: 12 },
  "Adamant Platebody": { defenceBonus: 27 },
  "Adamant Platelegs": { defenceBonus: 18 },
  "Adamant Gloves": { defenceBonus: 6 },
  "Adamant Boots": { defenceBonus: 6 },
  // Rune
  "Rune Sword": { attackBonus: 95, strengthBonus: 85 },
  "Rune Warhammer": { attackBonus: 85, strengthBonus: 130 },
  "Rune Shield": { defenceBonus: 30 },
  "Rune Helmet": { defenceBonus: 16 },
  "Rune Platebody": { defenceBonus: 36 },
  "Rune Platelegs": { defenceBonus: 24 },
  "Rune Gloves": { defenceBonus: 8 },
  "Rune Boots": { defenceBonus: 8 },
  // Dragon
  "Dragon Sword": { attackBonus: 110, strengthBonus: 95 },
  "Dragon Warhammer": { attackBonus: 100, strengthBonus: 145 },
  "Dragon Shield": { defenceBonus: 40 },
  "Dragon Helmet": { defenceBonus: 22 },
  "Dragon Platebody": { defenceBonus: 48 },
  "Dragon Platelegs": { defenceBonus: 32 },
  "Dragon Gloves": { defenceBonus: 11 },
  "Dragon Boots": { defenceBonus: 11 },
  // Dragonbone - highest tier weapons (crafted from fragments)
  "Dragonbone Blade": { attackBonus: 120, strengthBonus: 105 },
  // Void tier
  "Void Dagger": { attackBonus: 95, strengthBonus: 82 },
  "Void Battleaxe": { attackBonus: 105, strengthBonus: 140 },
  "void_warhammer": { attackBonus: 95, strengthBonus: 150 },
  // Mithril Armor (different from Mithril Platebody - appears in monster loot)
  "Mithril Armor": { defenceBonus: 40, hitpointsBonus: 50 },
  // Special accessories (rare drops)
  "Quarry Amulet": { defenceBonus: 8, strengthBonus: 5, hitpointsBonus: 20 },
  "Desert Cape": { defenceBonus: 6, accuracyBonus: 4, hitpointsBonus: 15 },
  "Starlit Amulet": { attackBonus: 8, accuracyBonus: 10, hitpointsBonus: 40 },
  "Obsidian Cape": { defenceBonus: 15, strengthBonus: 8, hitpointsBonus: 35 },
  "Nightfall Amulet": { attackBonus: 12, strengthBonus: 10, defenceBonus: 8, hitpointsBonus: 60 },
  "Dragonfire Cape": { defenceBonus: 20, strengthBonus: 12, attackBonus: 8, hitpointsBonus: 60 },
  "Dragon Amulet": { attackBonus: 18, strengthBonus: 15, accuracyBonus: 12, hitpointsBonus: 100 },
  "Crown of Flames": { defenceBonus: 50, attackBonus: 15, strengthBonus: 20, hitpointsBonus: 120 },
  "Infernal Cape": { defenceBonus: 30, strengthBonus: 20, attackBonus: 15, accuracyBonus: 10, hitpointsBonus: 100 },
  // Rings
  "Bronze Ring": { attackBonus: 1, defenceBonus: 1 },
  "Iron Ring": { attackBonus: 2, defenceBonus: 2 },
  "Steel Ring": { attackBonus: 3, defenceBonus: 3 },
  "Mithril Ring": { attackBonus: 5, defenceBonus: 5 },
  "Adamant Ring": { attackBonus: 7, defenceBonus: 7 },
  "Rune Ring": { attackBonus: 10, defenceBonus: 10 },
  "Dragon Ring": { attackBonus: 15, defenceBonus: 15, hitpointsBonus: 30 },
};

// Weapon combat properties (attack speed and lifesteal for offline combat parity)
// Format: itemId -> { attackSpeedMs, lifestealPercent }
const WEAPON_COMBAT_DATA: Record<string, { attackSpeedMs?: number; lifestealPercent?: number }> = {
  // Daggers (fast, lifesteal)
  "Bronze Dagger": { attackSpeedMs: 1600, lifestealPercent: 4 },
  "Iron Dagger": { attackSpeedMs: 1600, lifestealPercent: 6 },
  "Silver Dagger": { attackSpeedMs: 1600, lifestealPercent: 8 },
  "Venomous Dagger": { attackSpeedMs: 1500, lifestealPercent: 12 },
  "Shadow Dagger": { attackSpeedMs: 1400, lifestealPercent: 10 },
  "Shadow Hunter Dagger": { attackSpeedMs: 1400, lifestealPercent: 15 },
  // Swords (medium speed)
  "Bronze Sword": { attackSpeedMs: 2400 },
  "Iron Sword": { attackSpeedMs: 2400 },
  "Iron Longsword": { attackSpeedMs: 2400 },
  "Steel Sword": { attackSpeedMs: 2400 },
  "Steel Scimitar": { attackSpeedMs: 2200 },
  "Goblin Blade": { attackSpeedMs: 2400 },
  "Spider Fang Sword": { attackSpeedMs: 2400 },
  "Mithril Sword": { attackSpeedMs: 2400 },
  "Tusk Blade": { attackSpeedMs: 2600 },
  "Adamant Sword": { attackSpeedMs: 2400 },
  "Shadow Blade": { attackSpeedMs: 2400 },
  "Dark Knight Sword": { attackSpeedMs: 2400 },
  "Nightmare Sword": { attackSpeedMs: 2400 },
  "Rune Sword": { attackSpeedMs: 2400 },
  "Dragon Sword": { attackSpeedMs: 2400 },
  "Dragonbone Blade": { attackSpeedMs: 2600 },
  "Drake Fire Sword": { attackSpeedMs: 2400 },
  // Axes (slow, high damage)
  "Mithril Battleaxe": { attackSpeedMs: 3000 },
  "Orcish Cleaver": { attackSpeedMs: 3000 },
  "Orc Warlord Axe": { attackSpeedMs: 3200 },
  "Void Battleaxe": { attackSpeedMs: 3200 },
  // Hammers (slowest, highest damage)
  "Bronze Warhammer": { attackSpeedMs: 3200 },
  "Iron Warhammer": { attackSpeedMs: 3200 },
  "Steel Warhammer": { attackSpeedMs: 3200 },
  "Mithril Warhammer": { attackSpeedMs: 3200 },
  "Adamant Warhammer": { attackSpeedMs: 3200 },
  "Rune Warhammer": { attackSpeedMs: 3200 },
  "Dragon Warhammer": { attackSpeedMs: 3200 },
  "void_warhammer": { attackSpeedMs: 3200 },
  // Void daggers
  "Void Dagger": { attackSpeedMs: 1400, lifestealPercent: 8 },
};

const DEFAULT_WEAPON_SPEED = 2400;

// Get weapon attack speed from equipment
export function getWeaponAttackSpeed(equipment: Record<string, string | null>): number {
  const weaponId = equipment.weapon;
  if (!weaponId) return DEFAULT_WEAPON_SPEED;
  
  const { baseItem } = parseItemWithRarity(weaponId);
  const weaponData = WEAPON_COMBAT_DATA[baseItem];
  
  return weaponData?.attackSpeedMs ?? DEFAULT_WEAPON_SPEED;
}

// Get weapon lifesteal percentage from equipment
// Supports dual daggers: sums lifesteal from both main hand and off-hand
export function getWeaponLifesteal(equipment: Record<string, string | null>): number {
  let totalLifesteal = 0;
  
  // Main hand weapon
  const weaponId = equipment.weapon;
  if (weaponId) {
    const { baseItem } = parseItemWithRarity(weaponId);
    const weaponData = WEAPON_COMBAT_DATA[baseItem];
    totalLifesteal += weaponData?.lifestealPercent ?? 0;
  }
  
  // Off-hand (for dual daggers - off-hand dagger also has lifesteal)
  const offhandId = equipment.shield;
  if (offhandId) {
    const { baseItem } = parseItemWithRarity(offhandId);
    const offhandData = WEAPON_COMBAT_DATA[baseItem];
    totalLifesteal += offhandData?.lifestealPercent ?? 0;
  }
  
  return totalLifesteal;
}

// Weapon skill types for player weapons
export type WeaponSkillType = "critical" | "combo" | "armor_break" | "poison" | "lifesteal_burst" | "stun" | "slow_crit" | "damage" | "heal" | "groupHeal" | "lifesteal" | "buff" | "debuff" | "aoe" | "force_aggro";

export interface WeaponSkill {
  id: string;
  name: string;
  nameTranslations?: Record<string, string>;
  chance: number;
  type: WeaponSkillType;
  stunCycles?: number;
  slowMultiplier?: number;
  critMultiplier?: number;
  damageMultiplier?: number;
  armorBreakPercent?: number;
  dotDamage?: number;
  dotDuration?: number;
  hits?: number;
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
}

// Weapon skills for player weapons (for offline combat parity)
export const WEAPON_SKILLS: Record<string, WeaponSkill[]> = {
  // Hammer skills - buffed chance from 15-25% to 30-35%
  "Steel Warhammer": [{
    id: "earthquake",
    name: "Earthquake",
    nameTranslations: { tr: "Deprem" },
    chance: 30,
    type: "stun",
    stunCycles: 1,
  }],
  "Mithril Warhammer": [{
    id: "earthquake",
    name: "Earthquake",
    nameTranslations: { tr: "Deprem" },
    chance: 32,
    type: "stun",
    stunCycles: 1,
  }],
  "Rune Warhammer": [{
    id: "crushing_blow",
    name: "Crushing Blow",
    nameTranslations: { tr: "Ezici Darbe" },
    chance: 33,
    type: "slow_crit",
    slowMultiplier: 1.5,
    critMultiplier: 1.6,
  }],
  "Dragon Warhammer": [{
    id: "crushing_blow",
    name: "Crushing Blow",
    nameTranslations: { tr: "Ezici Darbe" },
    chance: 35,
    type: "slow_crit",
    slowMultiplier: 1.5,
    critMultiplier: 1.8,
  }],
  "Adamant Warhammer": [{
    id: "earthquake",
    name: "Earthquake",
    nameTranslations: { tr: "Deprem" },
    chance: 31,
    type: "stun",
    stunCycles: 1,
  }],
  // Dagger skills
  "Venomous Dagger": [{
    id: "venom_strike",
    name: "Venom Strike",
    nameTranslations: { tr: "Zehir Darbesi" },
    chance: 20,
    type: "poison",
    dotDamage: 3,
    dotDuration: 10,
  }],
  "Shadow Hunter Dagger": [{
    id: "shadow_strike",
    name: "Shadow Strike",
    nameTranslations: { tr: "Gölge Darbesi" },
    chance: 25,
    type: "critical",
    damageMultiplier: 2.0,
  }],
  "Shadow Dagger": [{
    id: "backstab",
    name: "Back Stab",
    nameTranslations: { tr: "Sırt Bıçağı" },
    chance: 22,
    type: "critical",
    damageMultiplier: 1.8,
  }],
  // Axe skills - new Cleave skill added
  "Orc Warlord Axe": [{
    id: "brutal_cleave",
    name: "Savage Cleave",
    nameTranslations: { tr: "Vahşi Yarma" },
    chance: 25,
    type: "armor_break",
    armorBreakPercent: 30,
  }],
  "Mithril Battleaxe": [{
    id: "cleave",
    name: "Cleave",
    nameTranslations: { tr: "Yarma" },
    chance: 22,
    type: "critical",
    damageMultiplier: 1.5,
  }],
  "Orcish Cleaver": [{
    id: "rending_strike",
    name: "Rending Strike",
    nameTranslations: { tr: "Parçalayıcı Darbe" },
    chance: 24,
    type: "armor_break",
    armorBreakPercent: 20,
  }],
  "Void Battleaxe": [{
    id: "void_cleave",
    name: "Void Cleave",
    nameTranslations: { tr: "Boşluk Yarması" },
    chance: 22,
    type: "combo",
    hits: 2,
    damageMultiplier: 1.3,
  }, {
    id: "void_earthquake",
    name: "Void Earthquake",
    nameTranslations: { tr: "Boşluk Depremi" },
    chance: 18,
    type: "stun",
    stunCycles: 2,
    damageMultiplier: 1.5,
  }],
  "void_warhammer": [{
    id: "void_shatter",
    name: "Void Shatter",
    nameTranslations: { tr: "Boşluk Parçalayıcı" },
    chance: 22,
    type: "slow_crit",
    slowMultiplier: 1.8,
    critMultiplier: 2.0,
  }, {
    id: "gravity_slam",
    name: "Gravity Slam",
    nameTranslations: { tr: "Yerçekimi Çarpması" },
    chance: 18,
    type: "stun",
    stunCycles: 2,
    damageMultiplier: 1.6,
  }],
  // Sword skills
  "Dark Knight Sword": [{
    id: "death_combo",
    name: "Death Combo",
    nameTranslations: { tr: "Ölüm Kombosu" },
    chance: 18,
    type: "combo",
    hits: 3,
    damageMultiplier: 0.85,
  }],
  "Void Sword": [{
    id: "void_strike",
    name: "Void Strike",
    nameTranslations: { tr: "Boşluk Darbesi" },
    chance: 20,
    type: "critical",
    damageMultiplier: 2.2,
  }],
  "Dragon Sword": [{
    id: "dragon_fury",
    name: "Dragon Fury",
    nameTranslations: { tr: "Ejder Öfkesi" },
    chance: 18,
    type: "combo",
    hits: 2,
    damageMultiplier: 1.1,
  }],
  "Frost Blade": [{
    id: "frost_strike",
    name: "Frost Strike",
    nameTranslations: { tr: "Buz Darbesi" },
    chance: 22,
    type: "stun",
    stunCycles: 1,
  }],
  "Rune Sword": [{
    id: "force_aggro",
    name: "Iron Will",
    chance: 15,
    type: "force_aggro",
    duration: 5000,
  }],
  "Mithril Sword": [{
    id: "force_aggro",
    name: "Guardian's Call",
    chance: 14,
    type: "force_aggro",
    duration: 5000,
  }],
  "Adamant Sword": [{
    id: "force_aggro",
    name: "Fortress Stance",
    chance: 16,
    type: "force_aggro",
    duration: 5000,
  }],
};

// Get weapon skills for equipped weapon
// Supports dual daggers: combines skills from both main hand and off-hand
export function getWeaponSkills(equipment: Record<string, string | null>): WeaponSkill[] {
  const allSkills: WeaponSkill[] = [];
  
  // Main hand weapon skills
  const weaponId = equipment.weapon;
  if (weaponId) {
    const { baseItem } = parseItemWithRarity(weaponId);
    const mainSkills = WEAPON_SKILLS[baseItem] || [];
    allSkills.push(...mainSkills);
    
    // Check if main hand is a dagger for dual wield
    const isDagger = baseItem.toLowerCase().includes("dagger");
    
    // Off-hand skills (for dual daggers only)
    if (isDagger) {
      const offhandId = equipment.shield;
      if (offhandId) {
        const { baseItem: offhandBase } = parseItemWithRarity(offhandId);
        const offhandIsDagger = offhandBase.toLowerCase().includes("dagger");
        if (offhandIsDagger) {
          const offhandSkills = WEAPON_SKILLS[offhandBase] || [];
          // Add off-hand skills (avoid duplicates by skill id)
          for (const skill of offhandSkills) {
            if (!allSkills.some(s => s.id === skill.id)) {
              allSkills.push(skill);
            }
          }
        }
      }
    }
  }
  
  return allSkills;
}

// Parse item ID to get base item and rarity
// Supports both formats:
//   "Rare Iron Sword" -> { baseItem: "Iron Sword", rarity: "Rare" }
//   "Iron Sword (Rare)" -> { baseItem: "Iron Sword", rarity: "Rare" }
function parseItemWithRarity(itemId: string): { baseItem: string; rarity: string } {
  const rarities = ["Mythic", "Legendary", "Epic", "Rare", "Uncommon", "Common"];
  
  // Check for suffix format: "Item Name (Rarity)"
  const suffixMatch = itemId.match(/^(.+)\s+\((\w+)\)$/);
  if (suffixMatch) {
    const baseItem = suffixMatch[1];
    const rarity = suffixMatch[2];
    if (rarities.includes(rarity)) {
      return { baseItem, rarity };
    }
  }
  
  // Check for prefix format: "Rarity Item Name"
  for (const rarity of rarities) {
    if (itemId.startsWith(rarity + " ")) {
      return { baseItem: itemId.substring(rarity.length + 1), rarity };
    }
  }
  
  return { baseItem: itemId, rarity: "Common" };
}

// Equipment item rarities for monster drops
// Maps itemId -> rarity. Items not in EQUIPMENT_STATS are not equipment.
// Most craftable equipment defaults to "Common", rare drops have specific rarities
const EQUIPMENT_ITEM_RARITIES: Record<string, string> = {
  // Rare accessory drops from monsters
  "Quarry Amulet": "Rare",
  "Desert Cape": "Rare",
  "Starlit Amulet": "Legendary",
  "Obsidian Cape": "Legendary",
  "Nightfall Amulet": "Legendary",
  "Dragonfire Cape": "Mythic",
  "Dragon Amulet": "Mythic",
  "Crown of Flames": "Mythic",
  "Infernal Cape": "Mythic",
};

// Check if an item is equipment and get its rarity-based drop chance
export function getEquipmentDropChance(itemId: string): number | null {
  // Check if it's in EQUIPMENT_STATS or EQUIPMENT_ITEM_RARITIES (is equipment)
  const isEquipment = EQUIPMENT_STATS[itemId] !== undefined || EQUIPMENT_ITEM_RARITIES[itemId] !== undefined;
  if (!isEquipment) {
    return null; // Not equipment
  }
  
  // Get the rarity for this equipment
  const rarity = EQUIPMENT_ITEM_RARITIES[itemId] || "Common";
  return EQUIPMENT_DROP_CHANCE_BY_RARITY[rarity] ?? 20; // Default to Common (20%)
}

export interface EquipmentBonuses {
  attackBonus: number;
  strengthBonus: number;
  defenceBonus: number;
  accuracyBonus: number;
  hitpointsBonus: number;
}

export function getEquipmentBonuses(equipment: Record<string, string | null>): EquipmentBonuses {
  const total: EquipmentBonuses = {
    attackBonus: 0,
    strengthBonus: 0,
    defenceBonus: 0,
    accuracyBonus: 0,
    hitpointsBonus: 0,
  };

  for (const itemId of Object.values(equipment)) {
    if (!itemId) continue;
    
    const { baseItem, rarity } = parseItemWithRarity(itemId);
    const baseStats = EQUIPMENT_STATS[baseItem];
    
    if (baseStats) {
      const multiplier = RARITY_MULTIPLIERS[rarity] || 1.0;
      total.attackBonus += Math.floor((baseStats.attackBonus || 0) * multiplier);
      total.strengthBonus += Math.floor((baseStats.strengthBonus || 0) * multiplier);
      total.defenceBonus += Math.floor((baseStats.defenceBonus || 0) * multiplier);
      total.accuracyBonus += Math.floor((baseStats.accuracyBonus || 0) * multiplier);
      total.hitpointsBonus += Math.floor((baseStats.hitpointsBonus || 0) * multiplier);
    }
  }

  return total;
}
