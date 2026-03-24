import {
  COMBAT_HP_SCALE,
  DEFENCE_DR_CONSTANT,
  calculateMinHit,
  calculateMaxHit,
} from "./schema";

export function buildDungeonPlayerHit(
  strengthLevel: number,
  strengthBonus: number,
): { minHit: number; maxHit: number; avgHit: number } {
  const minHit = calculateMinHit(strengthLevel, strengthBonus);
  const maxHit = calculateMaxHit(strengthLevel, strengthBonus);
  const avgHit = (minHit + maxHit) / 2;
  return { minHit, maxHit, avgHit };
}

export function buildDungeonPlayerDps(
  avgHit: number,
  attackSpeedMs: number,
): number {
  const scaledAvg = avgHit * COMBAT_HP_SCALE;
  if (attackSpeedMs <= 0) return scaledAvg;
  return (scaledAvg / attackSpeedMs) * 1000;
}

export function buildDungeonMonsterHit(
  attackLevel: number,
  strengthLevel: number,
  strengthBonus: number = 0,
): { minHit: number; maxHit: number; avgHit: number } {
  const minHit = calculateMinHit(strengthLevel, strengthBonus);
  const maxHit = calculateMaxHit(strengthLevel, strengthBonus);
  const avgHit = (minHit + maxHit) / 2;
  return { minHit, maxHit, avgHit };
}

export function scaledMonsterHp(baseHp: number, powerMult: number, extraScale: number = 1): number {
  return Math.floor(baseHp * COMBAT_HP_SCALE * powerMult * extraScale);
}

export function scaledMonsterAttack(avgHit: number, powerMult: number, extraScale: number = 1): number {
  return Math.floor(avgHit * COMBAT_HP_SCALE * powerMult * extraScale);
}

export function dungeonPlayerDamage(
  minHit: number,
  maxHit: number,
  monsterDefense: number,
  rng: () => number = Math.random,
): number {
  const rawHit = Math.floor(minHit + rng() * (maxHit - minHit + 1));
  const scaled = rawHit * COMBAT_HP_SCALE;
  const defReduction = Math.max(0.25, 1 - monsterDefense / (monsterDefense + DEFENCE_DR_CONSTANT));
  return Math.max(1, Math.floor(scaled * defReduction));
}

export function dungeonPlayerDamageWithCrit(
  minHit: number,
  maxHit: number,
  monsterDefense: number,
  critChance: number,
  critDamage: number,
  rng: () => number = Math.random,
): { damage: number; isCrit: boolean } {
  let damage = dungeonPlayerDamage(minHit, maxHit, monsterDefense, rng);
  const cappedCritChance = Math.min(50, critChance);
  const isCrit = rng() * 100 < cappedCritChance;
  if (isCrit) {
    damage = Math.floor(damage * (critDamage / 100));
  }
  return { damage, isCrit };
}

export function dungeonMonsterDamage(
  monsterAttack: number,
  playerDefense: number,
  enrageMultiplier: number = 1,
  rng: () => number = Math.random,
): number {
  const base = monsterAttack * enrageMultiplier;
  const defReduction = Math.max(0.25, 1 - playerDefense / (playerDefense + DEFENCE_DR_CONSTANT));
  return Math.max(1, Math.floor(base * defReduction));
}

export function randomHit(minHit: number, maxHit: number, rng: () => number = Math.random): number {
  return Math.floor(minHit + rng() * (maxHit - minHit + 1));
}

export { COMBAT_HP_SCALE };
