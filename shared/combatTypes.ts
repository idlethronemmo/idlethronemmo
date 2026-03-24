import type { MonsterSkill, CombatDebuff, MonsterSkillType } from "./schema";

export interface WeaponSkillDef {
  id: string;
  name: string;
  nameTranslations?: Record<string, string>;
  chance: number;
  type: string;
  hits?: number;
  damageMultiplier?: number;
  armorBreakPercent?: number;
  dotDamage?: number;
  dotDuration?: number;
  stunCycles?: number;
  critMultiplier?: number;
  slowMultiplier?: number;
  lifestealPercent?: number;
  healAmount?: number;
  healPercent?: number;
  damage?: number;
  buffType?: string;
  healPerTick?: number;
  duration?: number;
  shieldAmount?: number;
  defenceBoost?: number;
  debuffType?: string;
  armorReduction?: number;
  lootBonus?: number;
}

export interface ResolvedPlayerStats {
  attackLevel: number;
  strengthLevel: number;
  defenceLevel: number;
  hitpointsLevel: number;
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
}

export interface BuffSnapshot {
  attackBoostPercent: number;
  strengthBoostPercent: number;
  defenceBoostPercent: number;
  critChancePercent: number;
  damageReductionPercent: number;
  hpRegenValue: number;
  xpBoostPercent: number;
  lifestealPercent: number;
  maxHpBoostPercent: number;
}

export interface CombatModifiers {
  combatStyle: "attack" | "defence" | "balanced";
  guildCombatPowerPercent: number;
  guildDefensePowerPercent: number;
  guildXpBonusPercent: number;
  guildLootBonusPercent: number;
  guildGoldBonusPercent: number;
  partyDpsBonus: number;
  partyDefenseBonus: number;
  partyFoodHealBonus: number;
  partyAttackBonus: number;
}

export interface MonsterStats {
  id: string;
  maxHp: number;
  attackLevel: number;
  strengthLevel: number;
  defenceLevel: number;
  attackBonus: number;
  strengthBonus: number;
  attackSpeed: number;
  skills: MonsterSkill[];
  loot: { itemId: string; chance: number; minQty: number; maxQty: number }[];
  xpReward: { attack: number; strength: number; defence: number; hitpoints: number };
}

export interface FoodSnapshot {
  selectedFoodId: string | null;
  foodInventory: Record<string, number>;
  healPerFood: number;
  autoEatEnabled: boolean;
  autoEatThreshold: number;
}

export interface PotionSnapshot {
  selectedPotionId: string | null;
  potionInventory: Record<string, number>;
  autoPotionEnabled: boolean;
  potionEffectType: string | null;
  potionEffectValue: number;
  potionDurationMs: number;
}

export interface CombatState {
  playerHp: number;
  maxPlayerHp: number;
  monsterHp: number;

  playerAttackAccumulator: number;
  monsterAttackAccumulator: number;

  weaponAttackSpeed: number;
  weaponLifesteal: number;
  weaponSkills: WeaponSkillDef[];

  playerStats: ResolvedPlayerStats;
  monsterStats: MonsterStats;
  buffs: BuffSnapshot;
  modifiers: CombatModifiers;

  food: FoodSnapshot;
  potion: PotionSnapshot;

  debuffs: CombatDebuff[];
  debuffTickAccumulator: number;

  monsterStunCycles: number;
  playerStunCycles: number;
  monsterArmorRepairStacks: number;

  isRespawning: boolean;
  respawnAccumulator: number;

  autoEatCooldownAccumulator: number;

  totalPlayerDamage: number;
  totalMonsterDamage: number;
  monstersKilled: number;
  fightDurationMs: number;
  foodConsumed: number;
  deaths: number;

  activePotionBuff: {
    effectType: string;
    value: number;
    remainingMs: number;
  } | null;
}

export type CombatEventType =
  | "player_hit"
  | "player_miss"
  | "player_crit"
  | "player_skill"
  | "monster_hit"
  | "monster_miss"
  | "monster_skill"
  | "monster_stunned"
  | "player_stunned"
  | "auto_eat"
  | "auto_potion"
  | "lifesteal"
  | "hp_regen"
  | "debuff_tick"
  | "debuff_applied"
  | "debuff_expired"
  | "monster_killed"
  | "player_died"
  | "respawn"
  | "loot_drop"
  | "xp_gain"
  | "durability_loss"
  | "monster_regen"
  | "reflect_damage"
  | "armor_repair";

export interface CombatEvent {
  type: CombatEventType;
  damage?: number;
  healing?: number;
  isCritical?: boolean;
  skillName?: string;
  skillNameTranslations?: Record<string, string>;
  skillType?: string;
  itemId?: string;
  quantity?: number;
  xp?: { attack: number; strength: number; defence: number; hitpoints: number };
  foodId?: string;
  foodCount?: number;
  debuff?: CombatDebuff;
  comboHits?: number;
  comboHitDamages?: number[];
  formulaString?: string;
}

export interface CombatResult {
  state: CombatState;
  events: CombatEvent[];
}
