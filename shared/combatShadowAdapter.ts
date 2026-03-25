import type { CombatState, BuffSnapshot, CombatModifiers, MonsterStats, FoodSnapshot, PotionSnapshot, WeaponSkillDef, ResolvedPlayerStats } from "./combatTypes";
import type { CombatDebuff } from "./schema";

export interface ShadowAdapterInput {
  playerHp: number;
  maxPlayerHp: number;
  monsterHp: number;

  attackLevel: number;
  strengthLevel: number;
  defenceLevel: number;
  hitpointsLevel: number;

  equipAttackBonus: number;
  equipStrengthBonus: number;
  equipDefenceBonus: number;
  equipHitpointsBonus: number;
  equipCritChance: number;
  equipCritDamage: number;
  equipAttackSpeedBonus: number;
  equipHealingReceivedBonus: number;
  equipOnHitHealingPercent: number;
  equipSkillDamageBonus: number;
  equipPartyDpsBuff: number;
  equipPartyDefenceBuff: number;
  equipPartyAttackSpeedBuff: number;

  monsterId: string;
  monsterMaxHp: number;
  monsterAttackLevel: number;
  monsterStrengthLevel: number;
  monsterDefenceLevel: number;
  monsterAttackBonus: number;
  monsterStrengthBonus: number;
  monsterAttackSpeed: number;
  monsterSkills: any[];
  monsterLoot: { itemId: string; chance: number; minQty: number; maxQty: number }[];
  monsterXpReward: { attack: number; strength: number; defence: number; hitpoints: number };

  weaponAttackSpeed: number;
  weaponLifesteal: number;
  weaponSkills: WeaponSkillDef[];

  combatStyle: "attack" | "defence" | "balanced";

  buffAttackBoost: number;
  buffStrengthBoost: number;
  buffDefenceBoost: number;
  buffCritChance: number;
  buffDamageReduction: number;
  buffHpRegen: number;
  buffXpBoost: number;
  buffLifesteal: number;
  buffMaxHpBoost: number;

  guildCombatPower: number;
  guildDefensePower: number;
  guildXpBonus: number;
  guildLootBonus: number;
  guildGoldBonus: number;

  partyDpsBonus: number;
  partyDefenseBonus: number;
  partyFoodHealBonus: number;
  partyAttackBonus: number;

  autoEatEnabled: boolean;
  autoEatThreshold: number;
  selectedFood: string | null;
  foodInventory: Record<string, number>;
  healPerFood: number;

  autoPotionEnabled: boolean;
  selectedPotion: string | null;
  potionInventory: Record<string, number>;
  potionEffectType: string | null;
  potionEffectValue: number;
  potionDurationMs: number;

  combatDebuffs: CombatDebuff[];
}

export function createCombatStateFromAdapter(input: ShadowAdapterInput): CombatState {
  const playerStats: ResolvedPlayerStats = {
    attackLevel: input.attackLevel,
    strengthLevel: input.strengthLevel,
    defenceLevel: input.defenceLevel,
    hitpointsLevel: input.hitpointsLevel,
    attackBonus: input.equipAttackBonus,
    strengthBonus: input.equipStrengthBonus,
    defenceBonus: input.equipDefenceBonus,
    hitpointsBonus: input.equipHitpointsBonus,
    critChance: input.equipCritChance,
    critDamage: input.equipCritDamage,
    attackSpeedBonus: input.equipAttackSpeedBonus,
    healingReceivedBonus: input.equipHealingReceivedBonus,
    onHitHealingPercent: input.equipOnHitHealingPercent,
    skillDamageBonus: input.equipSkillDamageBonus,
    partyDpsBuff: input.equipPartyDpsBuff,
    partyDefenceBuff: input.equipPartyDefenceBuff,
    partyAttackSpeedBuff: input.equipPartyAttackSpeedBuff,
    lootChanceBonus: (input as any).equipLootChanceBonus ?? 0,
  };

  const buffs: BuffSnapshot = {
    attackBoostPercent: input.buffAttackBoost,
    strengthBoostPercent: input.buffStrengthBoost,
    defenceBoostPercent: input.buffDefenceBoost,
    critChancePercent: input.buffCritChance,
    damageReductionPercent: input.buffDamageReduction,
    hpRegenValue: input.buffHpRegen,
    xpBoostPercent: input.buffXpBoost,
    lifestealPercent: input.buffLifesteal,
    maxHpBoostPercent: input.buffMaxHpBoost,
  };

  const modifiers: CombatModifiers = {
    combatStyle: input.combatStyle,
    guildCombatPowerPercent: input.guildCombatPower,
    guildDefensePowerPercent: input.guildDefensePower,
    guildXpBonusPercent: input.guildXpBonus,
    guildLootBonusPercent: input.guildLootBonus,
    guildGoldBonusPercent: input.guildGoldBonus,
    partyDpsBonus: input.partyDpsBonus,
    partyDefenseBonus: input.partyDefenseBonus,
    partyFoodHealBonus: input.partyFoodHealBonus,
    partyAttackBonus: input.partyAttackBonus,
  };

  const monsterStats: MonsterStats = {
    id: input.monsterId,
    maxHp: input.monsterMaxHp,
    attackLevel: input.monsterAttackLevel,
    strengthLevel: input.monsterStrengthLevel,
    defenceLevel: input.monsterDefenceLevel,
    attackBonus: input.monsterAttackBonus,
    strengthBonus: input.monsterStrengthBonus,
    attackSpeed: input.monsterAttackSpeed,
    skills: input.monsterSkills || [],
    loot: input.monsterLoot || [],
    xpReward: input.monsterXpReward || { attack: 0, strength: 0, defence: 0, hitpoints: 0 },
  };

  const food: FoodSnapshot = {
    selectedFoodId: input.selectedFood,
    foodInventory: { ...input.foodInventory },
    healPerFood: input.healPerFood,
    autoEatEnabled: input.autoEatEnabled,
    autoEatThreshold: input.autoEatThreshold,
  };

  const potion: PotionSnapshot = {
    selectedPotionId: input.selectedPotion,
    potionInventory: { ...input.potionInventory },
    autoPotionEnabled: input.autoPotionEnabled,
    potionEffectType: input.potionEffectType,
    potionEffectValue: input.potionEffectValue,
    potionDurationMs: input.potionDurationMs,
  };

  return {
    playerHp: input.playerHp,
    maxPlayerHp: input.maxPlayerHp,
    monsterHp: input.monsterHp,
    playerAttackAccumulator: 0,
    monsterAttackAccumulator: 0,
    weaponAttackSpeed: input.weaponAttackSpeed,
    weaponLifesteal: input.weaponLifesteal,
    weaponSkills: input.weaponSkills || [],
    playerStats,
    monsterStats,
    buffs,
    modifiers,
    food,
    potion,
    debuffs: input.combatDebuffs ? structuredClone(input.combatDebuffs) : [],
    debuffTickAccumulator: 0,
    monsterStunCycles: 0,
    playerStunCycles: 0,
    monsterArmorRepairStacks: 0,
    isRespawning: false,
    respawnAccumulator: 0,
    autoEatCooldownAccumulator: 0,
    totalPlayerDamage: 0,
    totalMonsterDamage: 0,
    monstersKilled: 0,
    fightDurationMs: 0,
    foodConsumed: 0,
    deaths: 0,
    activePotionBuff: null,
  };
}
