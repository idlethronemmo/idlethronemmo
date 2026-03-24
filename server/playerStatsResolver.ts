import { COMBAT_HP_SCALE, COMBAT_STYLE_MODIFIERS } from "@shared/schema";
import {
  getEquipmentBonusesFromCache,
  getWeaponAttackSpeedFromDb,
  getWeaponLifestealFromDb,
  getWeaponSkillsFromCache,
  cachedGameItems,
} from "./scheduler";

export interface PlayerStatsInput {
  skills: Record<string, { xp: number; level: number }>;
  equipment: Record<string, string | null>;
  itemModifications: Record<string, any>;
  activeBuffs: Array<{ effectType: string; value: number; expiresAt: number }>;

  guildBonuses?: { combatPower?: number; defensePower?: number; xpBonus?: number; lootBonus?: number; goldBonus?: number } | null;
  partyBuffs?: { foodHealBonus: number; defenseBonus: number; attackBonus: number; hasHealer: boolean; hasTank: boolean; hasDps: boolean };
  combatStyle?: "attack" | "defence" | "balanced";
  achievementBuffs?: { attackPercent?: number; defencePercent?: number; maxHp?: number; skillSpeed?: number; lootChance?: number; goldBonus?: number; xpBonus?: number };

  enhancementLevels?: Map<string, number>;
}

export interface PlayerCombatStats {
  attackLevel: number;
  strengthLevel: number;
  defenceLevel: number;
  hitpointsLevel: number;

  equipBonuses: {
    attackBonus: number;
    strengthBonus: number;
    defenceBonus: number;
    hitpointsBonus: number;
    critChance: number;
    critDamage: number;
    attackSpeedBonus: number;
    healingReceivedBonus: number;
    onHitHealingPercent: number;
    skillDamageBonus: number;
    partyDpsBuff: number;
    partyDefenceBuff: number;
    partyAttackSpeedBuff: number;
    lootChanceBonus: number;
    [key: string]: number;
  };

  buffs: {
    attackBoostPercent: number;
    strengthBoostPercent: number;
    defenceBoostPercent: number;
    critChancePercent: number;
    damageReductionPercent: number;
    hpRegenValue: number;
    xpBoostPercent: number;
    lifestealBuffPercent: number;
    maxHpBoostPercent: number;
  };

  maxHp: number;

  weaponAttackSpeedMs: number;
  finalAttackSpeedMs: number;
  weaponLifestealPercent: number;
  weaponSkills: any[];
  weaponCategory: string | null;

  styleModifiers: {
    accuracyMod: number;
    damageMod: number;
    defenceMod: number;
    xpMod: Record<string, number>;
  };
}

export function getBuffValue(
  activeBuffs: Array<{ effectType: string; value: number; expiresAt: number }>,
  effectType: string,
  now: number = Date.now()
): number {
  const buff = activeBuffs.find(b => b.effectType === effectType && b.expiresAt > now);
  return buff?.value || 0;
}

function parseBaseItemId(itemId: string): string {
  const parenMatch = itemId.match(/^(.+?)\s*\((\w+)\)(#[\w]+)?$/);
  if (parenMatch) {
    return parenMatch[1].trim();
  }
  const underscoreRarities = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
  for (const rarity of underscoreRarities) {
    if (itemId.toLowerCase().endsWith(`_${rarity}`)) {
      return itemId.substring(0, itemId.lastIndexOf("_"));
    }
  }
  return itemId;
}

export function resolvePlayerCombatStats(input: PlayerStatsInput): PlayerCombatStats {
  const {
    skills,
    equipment,
    itemModifications,
    activeBuffs,
    guildBonuses,
    partyBuffs,
    combatStyle = "balanced",
    achievementBuffs,
    enhancementLevels = new Map<string, number>(),
  } = input;

  const now = Date.now();

  const attackLevel = skills.attack?.level || 1;
  const strengthLevel = skills.strength?.level || 1;
  const defenceLevel = skills.defence?.level || 1;
  const hitpointsLevel = skills.hitpoints?.level || 10;

  const equipBonuses = getEquipmentBonusesFromCache(equipment, enhancementLevels, itemModifications);

  const buffs = {
    attackBoostPercent: getBuffValue(activeBuffs, "attack_boost", now),
    strengthBoostPercent: getBuffValue(activeBuffs, "strength_boost", now),
    defenceBoostPercent: getBuffValue(activeBuffs, "defence_boost", now),
    critChancePercent: getBuffValue(activeBuffs, "crit_chance", now),
    damageReductionPercent: getBuffValue(activeBuffs, "damage_reduction", now),
    hpRegenValue: getBuffValue(activeBuffs, "hp_regen", now),
    xpBoostPercent: getBuffValue(activeBuffs, "xp_boost", now),
    lifestealBuffPercent: getBuffValue(activeBuffs, "lifesteal", now),
    maxHpBoostPercent: getBuffValue(activeBuffs, "maxHpBoost", now),
  };

  let maxHp = (hitpointsLevel * COMBAT_HP_SCALE) + equipBonuses.hitpointsBonus;

  if (buffs.maxHpBoostPercent > 0) {
    maxHp = Math.floor(maxHp * (1 + buffs.maxHpBoostPercent / 100));
  }

  if (achievementBuffs?.maxHp) {
    maxHp = Math.floor(maxHp * (1 + achievementBuffs.maxHp / 100));
  }

  const weaponAttackSpeedMs = getWeaponAttackSpeedFromDb(equipment);

  const totalSpeedBonus = (equipBonuses.attackSpeedBonus || 0) + (equipBonuses.partyAttackSpeedBuff || 0);
  const finalAttackSpeedMs = Math.max(500, Math.floor(weaponAttackSpeedMs * (1 - totalSpeedBonus / 100)));

  const weaponLifestealPercent = getWeaponLifestealFromDb(equipment);

  const weaponSkills = getWeaponSkillsFromCache(equipment, itemModifications);

  let weaponCategory: string | null = null;
  const weaponId = equipment.weapon;
  if (weaponId) {
    const baseItem = parseBaseItemId(weaponId);
    const cachedItem = cachedGameItems.get(baseItem);
    weaponCategory = cachedItem?.weaponCategory || null;
  }

  const baseStyle = COMBAT_STYLE_MODIFIERS[combatStyle];
  const styleModifiers = {
    accuracyMod: baseStyle.accuracyMod,
    damageMod: baseStyle.damageMod,
    defenceMod: baseStyle.defenceMod,
    xpMod: {} as Record<string, number>,
  };

  return {
    attackLevel,
    strengthLevel,
    defenceLevel,
    hitpointsLevel,
    equipBonuses: {
      ...equipBonuses,
      lootChanceBonus: equipBonuses.lootChanceBonus || 0,
    },
    buffs,
    maxHp,
    weaponAttackSpeedMs,
    finalAttackSpeedMs,
    weaponLifestealPercent,
    weaponSkills,
    weaponCategory,
    styleModifiers,
  };
}
