import type { MonsterSkill } from "./schema";

export type WeaponSkillType = "critical" | "combo" | "armor_break" | "poison" | "lifesteal_burst" | "stun" | "slow_crit" | "meteor" | "frost_burst" | "thunder_strike";

export interface WeaponSkillDefinition {
  id: string;
  name: string;
  type: WeaponSkillType;
  chance: number;
  hits?: number;
  damageMultiplier?: number;
  armorBreakPercent?: number;
  dotDamage?: number;
  dotDuration?: number;
  stunCycles?: number;
  slowMultiplier?: number;
  critMultiplier?: number;
}

export interface MonsterSkillDefinition {
  id: string;
  name: string;
  type: "stun" | "poison" | "burn" | "critical" | "combo" | "enrage" | "armor_break";
  chance: number;
  hits?: number;
  stunDuration?: number;
  dotDamage?: number;
  dotDuration?: number;
  healingReduction?: number;
  enrageThreshold?: number;
  enrageDamageBoost?: number;
  armorBreakPercent?: number;
  armorBreakDuration?: number;
}

export const WEAPON_SKILL_REGISTRY: Record<string, Omit<WeaponSkillDefinition, 'id' | 'chance'>> = {
  earthquake: {
    name: "Deprem",
    type: "stun",
    stunCycles: 1,
  },
  earthquake_enhanced: {
    name: "Deprem+",
    type: "stun",
    stunCycles: 2,
  },
  venom_strike: {
    name: "Zehir Darbesi",
    type: "poison",
    dotDamage: 3,
    dotDuration: 6,
  },
  death_combo: {
    name: "Ölüm Kombosu",
    type: "combo",
    hits: 3,
  },
  shadow_strike: {
    name: "Gölge Darbesi",
    type: "critical",
    damageMultiplier: 2.0,
  },
  brutal_cleave: {
    name: "Vahşi Yarma",
    type: "armor_break",
    armorBreakPercent: 25,
  },
  crushing_blow: {
    name: "Ezici Darbe",
    type: "slow_crit",
    slowMultiplier: 1.5,
    critMultiplier: 1.5,
  },
  lifesteal_burst: {
    name: "Vampirik Patlama",
    type: "lifesteal_burst",
    damageMultiplier: 1.5,
  },
  meteor_strike: {
    name: "Meteor Darbesi",
    type: "meteor",
    hits: 3,
    damageMultiplier: 2.5,
  },
  frost_nova: {
    name: "Buz Patlaması",
    type: "frost_burst",
    stunCycles: 2,
    damageMultiplier: 1.8,
  },
  thunder_bolt: {
    name: "Yıldırım",
    type: "thunder_strike",
    hits: 2,
    damageMultiplier: 2.0,
    stunCycles: 1,
  },
  inferno_blast: {
    name: "Cehennem Patlaması",
    type: "meteor",
    hits: 4,
    damageMultiplier: 3.0,
    dotDamage: 8,
    dotDuration: 6,
  },
  void_strike: {
    name: "Boşluk Darbesi",
    type: "critical",
    damageMultiplier: 3.5,
    armorBreakPercent: 30,
  },
};

export const MONSTER_SKILL_REGISTRY: Record<string, Omit<MonsterSkillDefinition, 'id' | 'chance'>> = {
  earthquake: {
    name: "Deprem",
    type: "stun",
    stunDuration: 2,
  },
  troll_smash: {
    name: "Trol Darbesi",
    type: "stun",
    stunDuration: 1,
  },
  pickaxe_strike: {
    name: "Kazma Darbesi",
    type: "critical",
  },
  venomous_sting: {
    name: "Zehirli İğne",
    type: "poison",
    dotDamage: 3,
    dotDuration: 8,
  },
  curse: {
    name: "Lanet",
    type: "burn",
    dotDamage: 0,
    dotDuration: 6,
    healingReduction: 0.5,
  },
  sandstorm: {
    name: "Kum Fırtınası",
    type: "stun",
    stunDuration: 2,
  },
  giant_stomp: {
    name: "Dev Basışı",
    type: "stun",
    stunDuration: 2,
  },
  shadow_blade: {
    name: "Gölge Bıçağı",
    type: "critical",
  },
  death_strike: {
    name: "Ölüm Darbesi",
    type: "combo",
    hits: 3,
  },
  dark_aura: {
    name: "Karanlık Aura",
    type: "enrage",
    enrageThreshold: 30,
    enrageDamageBoost: 1.5,
  },
  fire_breath: {
    name: "Ateş Nefesi",
    type: "combo",
    hits: 4,
    dotDamage: 5,
    dotDuration: 6,
    healingReduction: 0.5,
  },
  flame_breath: {
    name: "Alev Nefesi",
    type: "burn",
    dotDamage: 10,
    dotDuration: 6,
  },
  ancient_flame: {
    name: "Antik Alev",
    type: "combo",
    hits: 5,
    dotDamage: 8,
    dotDuration: 8,
    healingReduction: 0.5,
    stunDuration: 2,
  },
  king_breath: {
    name: "Kral Nefesi",
    type: "combo",
    hits: 6,
    dotDamage: 10,
    dotDuration: 10,
    healingReduction: 0.5,
    enrageThreshold: 25,
    enrageDamageBoost: 1.75,
  },
};

export function getWeaponSkillById(skillId: string, chance: number): WeaponSkillDefinition | null {
  const skillDef = WEAPON_SKILL_REGISTRY[skillId];
  if (!skillDef) return null;
  return {
    id: skillId,
    chance,
    ...skillDef,
  };
}

export function getMonsterSkillById(skillId: string, chance: number): MonsterSkillDefinition | null {
  const skillDef = MONSTER_SKILL_REGISTRY[skillId];
  if (!skillDef) return null;
  return {
    id: skillId,
    chance,
    ...skillDef,
  };
}

export function hydrateWeaponSkills(skillIds: { id: string; chance: number }[]): WeaponSkillDefinition[] {
  return skillIds
    .map(({ id, chance }) => getWeaponSkillById(id, chance))
    .filter((skill): skill is WeaponSkillDefinition => skill !== null);
}

export function hydrateMonsterSkills(skillIds: { id: string; chance: number }[]): MonsterSkill[] {
  return skillIds
    .map(({ id, chance }) => {
      const skillDef = getMonsterSkillById(id, chance);
      if (!skillDef) return null;
      return {
        id: skillDef.id,
        name: skillDef.name,
        chance: skillDef.chance,
        type: skillDef.type,
        hits: skillDef.hits,
        stunDuration: skillDef.stunDuration,
        dotDamage: skillDef.dotDamage,
        dotDuration: skillDef.dotDuration,
        healingReduction: skillDef.healingReduction,
        enrageThreshold: skillDef.enrageThreshold,
        enrageDamageBoost: skillDef.enrageDamageBoost,
        armorBreakPercent: skillDef.armorBreakPercent,
        armorBreakDuration: skillDef.armorBreakDuration,
      } as MonsterSkill;
    })
    .filter((skill): skill is MonsterSkill => skill !== null);
}
