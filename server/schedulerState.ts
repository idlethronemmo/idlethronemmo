import type { CombatDebuff } from "@shared/schema";

export interface PlayerCombatState {
  playerId: string;
  monsterId: string;
  lastProcessedAt: number;
  monsterHp: number;
  playerHp: number;
  playerLastAttackTime: number;
  monsterLastAttackTime: number;
  isRespawning: boolean;
  respawnStartTime: number;
  foodDepletedNotified?: boolean;
  potionDepletedNotified?: boolean;
  combatDebuffs?: CombatDebuff[];
  lastDebuffTick?: number;
  pendingMythicDrops?: { itemId: string; monsterId: string }[];
  monsterStunCycles?: number;
}

export const combatStates = new Map<string, PlayerCombatState>();

export function clearCombatState(playerId: string): void {
  combatStates.delete(playerId);
}
