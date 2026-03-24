export interface HealStats {
  healPower: number;
  buffPower: number;
}

export interface HealResult {
  healAmount: number;
  targetId: string;
  isCriticalHeal: boolean;
  overheal: number;
}

export interface PartyMemberHealth {
  id: string;
  name: string;
  currentHp: number;
  maxHp: number;
  isAlive: boolean;
}

export const BASE_HEAL_AMOUNT = 50;
export const HEAL_POWER_SCALE = 0.5;
export const CRIT_HEAL_MULTIPLIER = 1.5;

export function calculateBaseHeal(healPower: number): number {
  return Math.floor(BASE_HEAL_AMOUNT + (healPower * HEAL_POWER_SCALE));
}

export function calculateHealAmount(
  healPower: number,
  buffPower: number,
  isCritical: boolean = false
): number {
  const baseHeal = calculateBaseHeal(healPower);
  const buffMultiplier = 1 + (buffPower / 100);
  let finalHeal = Math.floor(baseHeal * buffMultiplier);
  
  if (isCritical) {
    finalHeal = Math.floor(finalHeal * CRIT_HEAL_MULTIPLIER);
  }
  
  return Math.max(1, finalHeal);
}

export function shouldHealCrit(critChance: number): boolean {
  return Math.random() * 100 < critChance;
}

export function selectHealTarget(partyMembers: PartyMemberHealth[]): PartyMemberHealth | null {
  const aliveMembers = partyMembers.filter(m => m.isAlive && m.currentHp > 0);
  
  if (aliveMembers.length === 0) {
    return null;
  }
  
  const damagedMembers = aliveMembers.filter(m => m.currentHp < m.maxHp);
  
  if (damagedMembers.length === 0) {
    return null;
  }
  
  let lowestHealthMember = damagedMembers[0];
  let lowestHealthPercent = damagedMembers[0].currentHp / damagedMembers[0].maxHp;
  
  for (const member of damagedMembers) {
    const healthPercent = member.currentHp / member.maxHp;
    if (healthPercent < lowestHealthPercent) {
      lowestHealthPercent = healthPercent;
      lowestHealthMember = member;
    }
  }
  
  return lowestHealthMember;
}

export function applyHeal(
  target: PartyMemberHealth,
  healAmount: number
): HealResult {
  const actualHeal = Math.min(healAmount, target.maxHp - target.currentHp);
  const overheal = healAmount - actualHeal;
  
  return {
    healAmount: actualHeal,
    targetId: target.id,
    isCriticalHeal: false,
    overheal,
  };
}

export function executeHeal(
  healer: HealStats,
  target: PartyMemberHealth,
  critChance: number = 0
): HealResult {
  const isCritical = shouldHealCrit(critChance);
  const healAmount = calculateHealAmount(healer.healPower, healer.buffPower, isCritical);
  const result = applyHeal(target, healAmount);
  result.isCriticalHeal = isCritical;
  
  return result;
}

export function calculateHealPerSecond(
  healPower: number,
  buffPower: number,
  attackSpeedMs: number,
  critChance: number = 0
): number {
  const baseHeal = calculateHealAmount(healPower, buffPower, false);
  const critHeal = calculateHealAmount(healPower, buffPower, true);
  const expectedHeal = baseHeal * (1 - critChance / 100) + critHeal * (critChance / 100);
  
  return (expectedHeal / attackSpeedMs) * 1000;
}

export function shouldAutoHeal(
  targetCurrentHp: number,
  targetMaxHp: number,
  autoHealThreshold: number = 50
): boolean {
  const healthPercent = (targetCurrentHp / targetMaxHp) * 100;
  return healthPercent < autoHealThreshold;
}

export function getHealPriority(member: PartyMemberHealth): number {
  if (!member.isAlive || member.currentHp <= 0) {
    return -1;
  }
  
  const healthPercent = member.currentHp / member.maxHp;
  return (1 - healthPercent) * 100;
}

export function sortPartyByHealPriority(partyMembers: PartyMemberHealth[]): PartyMemberHealth[] {
  return [...partyMembers]
    .filter(m => m.isAlive && m.currentHp > 0 && m.currentHp < m.maxHp)
    .sort((a, b) => getHealPriority(b) - getHealPriority(a));
}

export interface SoloHealResult {
  healed: boolean;
  healAmount: number;
  newHp: number;
  isCritical: boolean;
}

export function executeSoloHeal(
  currentHp: number,
  maxHp: number,
  healPower: number,
  buffPower: number,
  critChance: number = 0
): SoloHealResult {
  if (currentHp >= maxHp) {
    return { healed: false, healAmount: 0, newHp: currentHp, isCritical: false };
  }
  
  const isCritical = shouldHealCrit(critChance);
  const healAmount = calculateHealAmount(healPower, buffPower, isCritical);
  const actualHeal = Math.min(healAmount, maxHp - currentHp);
  const newHp = currentHp + actualHeal;
  
  return {
    healed: true,
    healAmount: actualHeal,
    newHp,
    isCritical,
  };
}
