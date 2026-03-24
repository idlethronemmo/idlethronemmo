import type { ResolvedPlayerStats } from "./combatTypes";

export interface RawEquipmentSlotData {
  itemId: string | null;
  stats: {
    attackBonus?: number;
    strengthBonus?: number;
    defenceBonus?: number;
    accuracyBonus?: number;
    hitpointsBonus?: number;
    critChance?: number;
    critDamage?: number;
    skillDamageBonus?: number;
    attackSpeedBonus?: number;
    healingReceivedBonus?: number;
    onHitHealingPercent?: number;
    buffDurationBonus?: number;
    partyDpsBuff?: number;
    partyDefenceBuff?: number;
    partyAttackSpeedBuff?: number;
    lootChanceBonus?: number;
  } | null;
  weaponCategory?: string;
  rarityMultiplier: number;
  enhancementLevel: number;
  addedStats?: Record<string, number>;
  isDualWieldOffhand?: boolean;
}

const ADDED_STAT_TO_RESOLVED: Record<string, keyof ResolvedPlayerStats> = {
  bonusAttack: "attackBonus",
  bonusDefence: "defenceBonus",
  bonusStrength: "strengthBonus",
  bonusHitpoints: "hitpointsBonus",
  accuracy: "attackBonus",
  critChance: "critChance",
  critDamage: "critDamage",
  attackSpeed: "attackSpeedBonus",
};

export function resolveEquipmentStats(slots: RawEquipmentSlotData[]): ResolvedPlayerStats {
  const total: ResolvedPlayerStats = {
    attackLevel: 0,
    strengthLevel: 0,
    defenceLevel: 0,
    hitpointsLevel: 0,
    attackBonus: 0,
    strengthBonus: 0,
    defenceBonus: 0,
    hitpointsBonus: 0,
    critChance: 0,
    critDamage: 0,
    attackSpeedBonus: 0,
    healingReceivedBonus: 0,
    onHitHealingPercent: 0,
    skillDamageBonus: 0,
    partyDpsBuff: 0,
    partyDefenceBuff: 0,
    partyAttackSpeedBuff: 0,
    lootChanceBonus: 0,
  };

  const mainSlot = slots.find(s => s.itemId && !s.isDualWieldOffhand);
  const isDaggerMain = mainSlot?.weaponCategory === "dagger";

  for (const slot of slots) {
    if (!slot.itemId || !slot.stats) continue;

    const rm = slot.rarityMultiplier;
    const em = 1 + slot.enhancementLevel * 0.05;
    const dw = slot.isDualWieldOffhand && isDaggerMain ? 0.5 : 1.0;
    const m = rm * em * dw;

    total.attackBonus += Math.floor((slot.stats.attackBonus || 0) * m);
    total.strengthBonus += Math.floor((slot.stats.strengthBonus || 0) * m);
    total.defenceBonus += Math.floor((slot.stats.defenceBonus || 0) * m);
    total.hitpointsBonus += Math.floor((slot.stats.hitpointsBonus || 0) * m);
    total.skillDamageBonus += Math.floor((slot.stats.skillDamageBonus || 0) * m);
    total.attackSpeedBonus += Math.floor((slot.stats.attackSpeedBonus || 0) * m);
    total.healingReceivedBonus += Math.floor((slot.stats.healingReceivedBonus || 0) * m);
    total.onHitHealingPercent += Math.floor((slot.stats.onHitHealingPercent || 0) * m);
    total.partyDpsBuff += Math.floor((slot.stats.partyDpsBuff || 0) * m);
    total.partyDefenceBuff += Math.floor((slot.stats.partyDefenceBuff || 0) * m);
    total.partyAttackSpeedBuff += Math.floor((slot.stats.partyAttackSpeedBuff || 0) * m);
    total.lootChanceBonus += Math.floor((slot.stats.lootChanceBonus || 0) * m);
    total.critChance += (slot.stats.critChance || 0) * dw * em;
    total.critDamage += (slot.stats.critDamage || 0) * dw * em;

    if (slot.addedStats) {
      for (const [key, value] of Object.entries(slot.addedStats)) {
        const mappedKey = ADDED_STAT_TO_RESOLVED[key];
        if (mappedKey && typeof value === "number") {
          (total as any)[mappedKey] += value;
        }
      }
    }
  }

  return total;
}
