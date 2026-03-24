import type { MonsterSkill, CombatDebuff, MonsterSkillType } from "./schema";
import { COMBAT_HP_SCALE, calculateMaxHit, calculateMinHit } from "./schema";

export interface SkillExecutionResult {
  triggered: boolean;
  skillName?: string;
  comboHits?: number;
  comboHitDamages?: number[]; // Individual damage values for each combo hit
  totalDamage?: number;
  newDebuff?: CombatDebuff;
  isCritical?: boolean;
  isEnraged?: boolean;
}

export function shouldSkillTrigger(skill: MonsterSkill): boolean {
  return Math.random() * 100 < skill.chance;
}

export function executeMonsterSkill(
  skill: MonsterSkill,
  monsterStrengthLevel: number,
  monsterStrengthBonus: number,
  monsterCurrentHp: number,
  monsterMaxHp: number,
  playerDamageReduction: number,
  currentTime?: number // Optional: pass simulated time for offline replay
): SkillExecutionResult {
  const now = currentTime ?? Date.now();
  const baseMaxHit = calculateMaxHit(monsterStrengthLevel, monsterStrengthBonus) * COMBAT_HP_SCALE;
  const baseMinHit = calculateMinHit(monsterStrengthLevel, monsterStrengthBonus) * COMBAT_HP_SCALE;
  
  const result: SkillExecutionResult = {
    triggered: true,
    skillName: skill.name,
  };
  
  switch (skill.type) {
    case "critical":
      result.isCritical = true;
      result.totalDamage = Math.max(1, Math.floor(baseMaxHit * (1 - playerDamageReduction)));
      break;
      
    case "combo":
      const hits = skill.hits || 3;
      result.comboHits = hits;
      result.comboHitDamages = [];
      let totalDmg = 0;
      for (let i = 0; i < hits; i++) {
        const rawDmg = Math.floor(Math.random() * (baseMaxHit - baseMinHit + 1)) + baseMinHit;
        const hitDamage = Math.max(1, Math.floor(rawDmg * (1 - playerDamageReduction)));
        result.comboHitDamages.push(hitDamage);
        totalDmg += hitDamage;
      }
      result.totalDamage = totalDmg;
      
      if (skill.dotDamage || skill.healingReduction) {
        result.newDebuff = {
          id: `${skill.id}_${now}`,
          type: "burn",
          name: skill.name,
          expiresAt: now + (skill.dotDuration || 6) * 1000,
          dotDamage: skill.dotDamage ? skill.dotDamage * COMBAT_HP_SCALE : undefined,
          healingReduction: skill.healingReduction,
        };
      }
      
      if (skill.stunDuration) {
        result.newDebuff = {
          ...(result.newDebuff || { id: `${skill.id}_stun_${now}`, type: "stun", name: skill.name, expiresAt: now + 30000 }),
          stunCyclesRemaining: skill.stunDuration,
        };
      }
      break;
      
    case "stun":
      result.newDebuff = {
        id: `${skill.id}_${now}`,
        type: "stun",
        name: skill.name,
        expiresAt: now + 30000,
        stunCyclesRemaining: skill.stunDuration || 2,
      };
      break;
      
    case "poison":
      result.newDebuff = {
        id: `${skill.id}_${now}`,
        type: "poison",
        name: skill.name,
        expiresAt: now + (skill.dotDuration || 8) * 1000,
        dotDamage: (skill.dotDamage || 3) * COMBAT_HP_SCALE,
        stackCount: 1,
      };
      break;
      
    case "burn":
      result.newDebuff = {
        id: `${skill.id}_${now}`,
        type: "burn",
        name: skill.name,
        expiresAt: now + (skill.dotDuration || 6) * 1000,
        dotDamage: skill.dotDamage ? skill.dotDamage * COMBAT_HP_SCALE : 0,
        healingReduction: skill.healingReduction || 0.5,
      };
      break;
      
    case "enrage":
      const hpPercent = (monsterCurrentHp / monsterMaxHp) * 100;
      if (hpPercent <= (skill.enrageThreshold || 30)) {
        result.isEnraged = true;
      }
      break;
      
    case "armor_break":
      result.newDebuff = {
        id: `${skill.id}_${now}`,
        type: "armor_break",
        name: skill.name,
        expiresAt: now + (skill.armorBreakDuration || 5) * 1000,
        armorBreakPercent: skill.armorBreakPercent || 0.25,
      };
      break;
  }
  
  return result;
}

export function processDebuffTick(
  debuffs: CombatDebuff[],
  currentHp: number,
  maxHp: number,
  currentTime?: number // Optional: pass simulated time for offline replay
): { updatedDebuffs: CombatDebuff[]; dotDamage: number; expiredDebuffs: string[] } {
  const now = currentTime ?? Date.now();
  const updatedDebuffs: CombatDebuff[] = [];
  let dotDamage = 0;
  const expiredDebuffs: string[] = [];
  
  for (const debuff of debuffs) {
    if (now >= debuff.expiresAt) {
      expiredDebuffs.push(debuff.name);
      continue;
    }
    
    if (debuff.dotDamage && debuff.dotDamage > 0) {
      dotDamage += debuff.dotDamage * (debuff.stackCount || 1);
    }
    
    updatedDebuffs.push(debuff);
  }
  
  return { updatedDebuffs, dotDamage, expiredDebuffs };
}

export function getHealingReduction(debuffs: CombatDebuff[]): number {
  let maxReduction = 0;
  for (const debuff of debuffs) {
    if (debuff.healingReduction && debuff.healingReduction > maxReduction) {
      maxReduction = debuff.healingReduction;
    }
  }
  return maxReduction;
}

export function getStunCyclesRemaining(debuffs: CombatDebuff[]): number {
  for (const debuff of debuffs) {
    if (debuff.type === "stun" && debuff.stunCyclesRemaining && debuff.stunCyclesRemaining > 0) {
      return debuff.stunCyclesRemaining;
    }
  }
  return 0;
}

export function decrementStunCycle(debuffs: CombatDebuff[], currentTime?: number): CombatDebuff[] {
  const now = currentTime ?? Date.now();
  return debuffs
    .map(debuff => {
      if (debuff.type === "stun" && debuff.stunCyclesRemaining && debuff.stunCyclesRemaining > 0) {
        const remaining = debuff.stunCyclesRemaining - 1;
        if (remaining <= 0) {
          // Mark for removal by setting expiresAt to 0
          return { ...debuff, stunCyclesRemaining: 0, expiresAt: 0 };
        }
        return { ...debuff, stunCyclesRemaining: remaining };
      }
      return debuff;
    })
    // Filter out any debuff that has expired or been marked for removal (expiresAt === 0)
    .filter(d => d.expiresAt > now && d.expiresAt !== 0);
}

// Get armor break percent with time-aware expiry check
export function getArmorBreakPercentWithTime(debuffs: CombatDebuff[], currentTime: number): number {
  let maxBreak = 0;
  for (const debuff of debuffs) {
    if (currentTime < debuff.expiresAt &&
        debuff.type === "armor_break" && 
        debuff.armorBreakPercent && 
        debuff.armorBreakPercent > maxBreak) {
      maxBreak = debuff.armorBreakPercent;
    }
  }
  return maxBreak;
}

// Filter debuffs by current time - removes any expired debuffs
export function filterExpiredDebuffs(debuffs: CombatDebuff[], currentTime: number): CombatDebuff[] {
  return debuffs.filter(d => currentTime < d.expiresAt && d.expiresAt !== 0);
}

export function getStunCyclesRemainingWithTime(debuffs: CombatDebuff[], currentTime: number): number {
  for (const debuff of debuffs) {
    if (debuff.type === "stun" && 
        debuff.stunCyclesRemaining && 
        debuff.stunCyclesRemaining > 0 &&
        currentTime < debuff.expiresAt) {
      return debuff.stunCyclesRemaining;
    }
  }
  return 0;
}

export function getHealingReductionWithTime(debuffs: CombatDebuff[], currentTime: number): number {
  let maxReduction = 0;
  for (const debuff of debuffs) {
    if (currentTime < debuff.expiresAt && 
        debuff.healingReduction && 
        debuff.healingReduction > maxReduction) {
      maxReduction = debuff.healingReduction;
    }
  }
  return maxReduction;
}

export function getArmorBreakPercent(debuffs: CombatDebuff[]): number {
  let maxBreak = 0;
  for (const debuff of debuffs) {
    if (debuff.type === "armor_break" && debuff.armorBreakPercent && debuff.armorBreakPercent > maxBreak) {
      maxBreak = debuff.armorBreakPercent;
    }
  }
  return maxBreak;
}

export function addOrStackDebuff(debuffs: CombatDebuff[], newDebuff: CombatDebuff): CombatDebuff[] {
  if (newDebuff.type === "poison") {
    const existingPoison = debuffs.find(d => d.type === "poison");
    if (existingPoison) {
      return debuffs.map(d => {
        if (d.type === "poison") {
          return {
            ...d,
            stackCount: Math.min((d.stackCount || 1) + 1, 5),
            expiresAt: Math.max(d.expiresAt, newDebuff.expiresAt),
          };
        }
        return d;
      });
    }
  }
  
  return [...debuffs.filter(d => d.type !== newDebuff.type || newDebuff.type === "poison"), newDebuff];
}

export function clearAllDebuffs(): CombatDebuff[] {
  return [];
}
