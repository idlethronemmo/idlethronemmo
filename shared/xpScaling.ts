/**
 * XP Scaling System
 * 
 * Previously reduced XP from low-level content. Now disabled - all content gives full XP.
 * Players naturally prefer higher-level content for better XP rewards.
 */

export interface XpScalingResult {
  multiplier: number;
  penaltyTier: 'none' | 'minor' | 'major' | 'severe';
  levelDifference: number;
}

export function calculateXpScaling(playerLevel: number, contentLevel: number): XpScalingResult {
  const levelDifference = playerLevel - contentLevel;
  return { multiplier: 1.0, penaltyTier: 'none', levelDifference };
}

export function applyXpScaling(baseXp: number, playerLevel: number, contentLevel: number): number {
  return baseXp;
}

export function applyCombatXpScaling(
  xpReward: { attack: number; strength: number; defence: number; hitpoints: number },
  combatLevel: number,
  monsterLevel: number
): { attack: number; strength: number; defence: number; hitpoints: number } {
  return {
    attack: xpReward.attack,
    strength: xpReward.strength,
    defence: xpReward.defence,
    hitpoints: xpReward.hitpoints,
  };
}

export function applyMasteryXpScaling(
  baseMasteryXp: number,
  masteryLevel: number,
  monsterLevel: number
): number {
  return baseMasteryXp;
}

export function estimateContentLevel(xpReward: number, explicitLevel?: number): number {
  if (explicitLevel !== undefined && explicitLevel > 0) {
    return explicitLevel;
  }
  
  if (xpReward <= 20) return Math.ceil(xpReward / 2);
  if (xpReward <= 50) return Math.ceil(10 + (xpReward - 20) / 2);
  if (xpReward <= 100) return Math.ceil(25 + (xpReward - 50) / 2.5);
  return Math.min(99, Math.ceil(45 + (xpReward - 100) / 5));
}

export function calculateCombatLevel(skills: { attack: number; strength: number; defence: number; hitpoints?: number }): number {
  const attack = skills.attack || 1;
  const strength = skills.strength || 1;
  const defence = skills.defence || 1;
  
  return Math.floor((attack + strength + defence) / 3);
}

export function calculateMonsterCombatLevel(monsterStats: { 
  attackLevel?: number; 
  strengthLevel?: number; 
  defenceLevel?: number;
}): number {
  const attack = monsterStats.attackLevel || 1;
  const strength = monsterStats.strengthLevel || 1;
  const defence = monsterStats.defenceLevel || 1;
  
  return Math.floor((attack + strength + defence) / 3);
}
