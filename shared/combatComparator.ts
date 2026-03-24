import type { CombatState } from "./combatTypes";

export interface CombatComparisonResult {
  match: boolean;
  divergences: CombatDivergence[];
}

export interface CombatDivergence {
  field: string;
  legacy: number | string;
  unified: number | string;
  threshold: number;
  delta: number;
}

const THRESHOLDS: Record<string, number> = {
  playerHp: 5,
  monsterHp: 5,
  monstersKilled: 0,
  deaths: 0,
  foodConsumed: 2,
  totalPlayerDamage: 50,
  totalMonsterDamage: 50,
};

export function compareCombatSnapshots(
  legacy: Partial<CombatSnapshot>,
  unified: Partial<CombatSnapshot>
): CombatComparisonResult {
  const divergences: CombatDivergence[] = [];
  const fields = Object.keys(THRESHOLDS) as (keyof CombatSnapshot)[];

  for (const field of fields) {
    const legacyVal = legacy[field] ?? 0;
    const unifiedVal = unified[field] ?? 0;
    const threshold = THRESHOLDS[field] ?? 0;
    const delta = Math.abs(
      (typeof legacyVal === "number" ? legacyVal : 0) -
      (typeof unifiedVal === "number" ? unifiedVal : 0)
    );

    if (delta > threshold) {
      divergences.push({
        field,
        legacy: legacyVal,
        unified: unifiedVal,
        threshold,
        delta,
      });
    }
  }

  return {
    match: divergences.length === 0,
    divergences,
  };
}

export interface CombatSnapshot {
  playerHp: number;
  monsterHp: number;
  monstersKilled: number;
  deaths: number;
  foodConsumed: number;
  totalPlayerDamage: number;
  totalMonsterDamage: number;
}

export function extractSnapshot(state: CombatState): CombatSnapshot {
  return {
    playerHp: state.playerHp,
    monsterHp: state.monsterHp,
    monstersKilled: state.monstersKilled,
    deaths: state.deaths,
    foodConsumed: state.foodConsumed,
    totalPlayerDamage: state.totalPlayerDamage,
    totalMonsterDamage: state.totalMonsterDamage,
  };
}
