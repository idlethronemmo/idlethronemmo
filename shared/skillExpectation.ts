export interface WeaponSkillMeta {
  type: string;
  chance: number;
  hits?: number;
  damageMultiplier?: number;
  armorBreakPercent?: number;
  dotDamage?: number;
  dotDuration?: number;
}

export function computePlayerSkillExpectedDpsMod(
  skills: WeaponSkillMeta[],
  critChancePct: number,
  critMultiplier: number
): number {
  if (skills.length === 0) return 1.0;
  let totalDpsMod = 0;
  let remainingChance = 1.0;

  for (const skill of skills) {
    const triggerChance = Math.min(skill.chance / 100, remainingChance);
    if (triggerChance <= 0) continue;

    switch (skill.type) {
      case "critical": {
        const effectiveMultiplier = skill.damageMultiplier || 2.0;
        totalDpsMod += triggerChance * (effectiveMultiplier - 1);
        break;
      }
      case "combo": {
        const hits = skill.hits || 2;
        const dmgMul = skill.damageMultiplier || 1.0;
        totalDpsMod += triggerChance * (hits * dmgMul - 1);
        break;
      }
      case "armor_break": {
        const abPercent = skill.armorBreakPercent || 20;
        totalDpsMod += triggerChance * (abPercent / 100);
        break;
      }
      case "poison": {
        totalDpsMod += triggerChance * 0.15;
        break;
      }
      case "lifesteal_burst": {
        break;
      }
    }
    remainingChance -= triggerChance;
  }
  return 1.0 + totalDpsMod;
}

export interface MonsterSkillMeta {
  type: string;
  chance: number;
  hits?: number;
  dotDamage?: number;
  dotDuration?: number;
  stunDuration?: number;
  enrageThreshold?: number;
  armorBreakPercent?: number;
}

export function computeMonsterSkillExpectedDps(
  skills: MonsterSkillMeta[],
  baseMonsterDps: number,
  monsterAttackSpeed: number,
  hpScale: number
): { extraDpsFromSkills: number; expectedStunSecondsPerAttack: number } {
  let extraDps = 0;
  let totalStunChance = 0;
  let weightedStunDuration = 0;
  const attacksPerSecond = 1000 / monsterAttackSpeed;

  for (const skill of skills) {
    const triggerRate = (skill.chance / 100) * attacksPerSecond;
    switch (skill.type) {
      case "poison":
      case "burn": {
        const dotDamage = (skill.dotDamage || 0) * hpScale;
        const dotDuration = skill.dotDuration || 3;
        extraDps += triggerRate * dotDamage * dotDuration * 0.5;
        break;
      }
      case "critical":
        extraDps += triggerRate * baseMonsterDps * 0.5;
        break;
      case "combo": {
        const hits = skill.hits || 2;
        extraDps += triggerRate * baseMonsterDps * (hits - 1) * 0.3;
        break;
      }
      case "stun": {
        const stunDur = skill.stunDuration || 1;
        totalStunChance += skill.chance / 100;
        weightedStunDuration += (skill.chance / 100) * stunDur;
        break;
      }
      case "armor_break":
        extraDps += triggerRate * baseMonsterDps * 0.15;
        break;
      case "enrage":
        extraDps += baseMonsterDps * 0.1;
        break;
    }
  }

  return {
    extraDpsFromSkills: extraDps,
    expectedStunSecondsPerAttack: weightedStunDuration,
  };
}
