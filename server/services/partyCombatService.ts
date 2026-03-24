import {
  selectTargetByAggro,
  calculateTotalAggro,
  type PartyMember as AggroPartyMember,
  type EquipmentAggroStats,
} from "@shared/aggroSystem";
import {
  selectHealTarget,
  calculateHealAmount,
  shouldHealCrit,
  applyHeal,
  type PartyMemberHealth,
  type HealResult,
} from "@shared/healSystem";
import {
  type Monster,
  type PlayerRole,
  calculateMaxHit,
  calculateMinHit,
  calculateDefenseMultiplier,
  calculateAccuracyRating,
  calculateEvasionRating,
  calculateHitChance,
  COMBAT_HP_SCALE,
  DEFENCE_DR_CONSTANT,
} from "@shared/schema";

export interface EquipmentStats {
  attackBonus: number;
  strengthBonus: number;
  defenceBonus: number;
  healPower: number;
  buffPower: number;
  critChance: number;
  critDamage: number;
  armorType?: string;
  weaponType?: string;
}

export interface PartyMemberCombatState {
  playerId: string;
  playerName: string;
  role: PlayerRole;
  currentHp: number;
  maxHp: number;
  aggro: number;
  equipment: EquipmentStats;
  isAlive: boolean;
  attackLevel: number;
  strengthLevel: number;
  defenceLevel: number;
}

export interface PartyCombatState {
  partyId: string;
  dungeonId: string;
  members: PartyMemberCombatState[];
  currentMonster: Monster | null;
  monsterCurrentHp: number;
  combatStartTime: number;
  roundNumber: number;
}

export interface PartyAttackResult {
  attackerId: string;
  damage: number;
  isCrit: boolean;
  aggroGenerated: number;
  hit: boolean;
}

export interface MonsterAttackResult {
  targetId: string;
  damage: number;
  targetCurrentHp: number;
  targetDied: boolean;
}

export interface PartyRoundResult {
  partyAttacks: PartyAttackResult[];
  healResults: HealResult[];
  monsterAttack: MonsterAttackResult | null;
  monsterHpRemaining: number;
  monsterDied: boolean;
  partyWiped: boolean;
}

export interface PartyCombatStats {
  totalDamagePerRound: number;
  totalDefence: number;
  totalHealPower: number;
  tankAggro: number;
  dpsAggro: number;
  healerAggro: number;
}

const combatStates = new Map<string, PartyCombatState>();

const AGGRO_PER_DAMAGE = 1;
const AGGRO_PER_HEAL = 0.5;
const TANK_AGGRO_MULTIPLIER = 2.0;
const DPS_AGGRO_MULTIPLIER = 1.0;
const HEALER_AGGRO_MULTIPLIER = 0.5;

export class PartyCombatService {
  initializePartyCombat(
    partyId: string,
    dungeonId: string,
    members: Omit<PartyMemberCombatState, 'aggro' | 'isAlive'>[]
  ): PartyCombatState {
    const initializedMembers: PartyMemberCombatState[] = members.map(member => {
      const aggroStats: EquipmentAggroStats = {
        critChance: member.equipment.critChance,
        critDamage: member.equipment.critDamage,
        healPower: member.equipment.healPower,
        buffPower: member.equipment.buffPower,
      };

      const aggroResult = calculateTotalAggro(
        aggroStats,
        member.equipment.armorType,
        member.equipment.weaponType,
        0
      );

      let baseAggro = aggroResult.totalAggro;
      if (member.role === 'tank') {
        baseAggro *= TANK_AGGRO_MULTIPLIER;
      } else if (member.role === 'healer') {
        baseAggro *= HEALER_AGGRO_MULTIPLIER;
      }

      return {
        ...member,
        aggro: baseAggro,
        isAlive: member.currentHp > 0,
      };
    });

    const state: PartyCombatState = {
      partyId,
      dungeonId,
      members: initializedMembers,
      currentMonster: null,
      monsterCurrentHp: 0,
      combatStartTime: Date.now(),
      roundNumber: 0,
    };

    combatStates.set(partyId, state);
    return state;
  }

  getCombatState(partyId: string): PartyCombatState | undefined {
    return combatStates.get(partyId);
  }

  setCurrentMonster(partyId: string, monster: Monster): void {
    const state = combatStates.get(partyId);
    if (state) {
      state.currentMonster = monster;
      state.monsterCurrentHp = monster.maxHitpoints;
    }
  }

  selectMonsterTarget(
    partyMembers: PartyMemberCombatState[],
    _monster: Monster
  ): PartyMemberCombatState | null {
    const aggroMembers: AggroPartyMember[] = partyMembers
      .filter(m => m.isAlive && m.currentHp > 0)
      .map(m => ({
        id: m.playerId,
        name: m.playerName,
        currentHp: m.currentHp,
        maxHp: m.maxHp,
        aggro: m.aggro,
        isAlive: m.isAlive,
      }));

    const target = selectTargetByAggro(aggroMembers);
    if (!target) return null;

    return partyMembers.find(m => m.playerId === target.id) || null;
  }

  processPartyAttackRound(
    partyMembers: PartyMemberCombatState[],
    monster: Monster,
    monsterCurrentHp: number
  ): { attacks: PartyAttackResult[]; heals: HealResult[]; monsterHpRemaining: number } {
    const attacks: PartyAttackResult[] = [];
    const heals: HealResult[] = [];
    let currentMonsterHp = monsterCurrentHp;

    for (const member of partyMembers) {
      if (!member.isAlive || member.currentHp <= 0) continue;

      if (member.role === 'healer') {
        const healResult = this.processHealerAction(member, partyMembers);
        if (healResult) {
          heals.push(healResult);
          const aggroGenerated = healResult.healAmount * AGGRO_PER_HEAL;
          member.aggro += aggroGenerated;
        }
        continue;
      }

      const attackResult = this.processPlayerAttack(member, monster, currentMonsterHp);
      attacks.push(attackResult);

      if (attackResult.hit) {
        currentMonsterHp = Math.max(0, currentMonsterHp - attackResult.damage);
        member.aggro += attackResult.aggroGenerated;
      }
    }

    return { attacks, heals, monsterHpRemaining: currentMonsterHp };
  }

  private processPlayerAttack(
    member: PartyMemberCombatState,
    monster: Monster,
    _monsterCurrentHp: number
  ): PartyAttackResult {
    const accuracy = calculateAccuracyRating(member.attackLevel, member.equipment.attackBonus);
    const evasion = calculateEvasionRating(monster.defenceLevel, 0);
    const hitChance = calculateHitChance(accuracy, evasion);

    const hit = Math.random() * 100 < hitChance;

    if (!hit) {
      return {
        attackerId: member.playerId,
        damage: 0,
        isCrit: false,
        aggroGenerated: 0,
        hit: false,
      };
    }

    const minHit = calculateMinHit(member.strengthLevel, member.equipment.strengthBonus);
    const maxHit = calculateMaxHit(member.strengthLevel, member.equipment.strengthBonus);
    const defenseMultiplier = calculateDefenseMultiplier(monster.defenceLevel);

    let baseDamage = Math.floor(Math.random() * (maxHit - minHit + 1)) + minHit;
    baseDamage = Math.max(1, Math.floor(baseDamage * defenseMultiplier));

    const isCrit = Math.random() * 100 < member.equipment.critChance;
    let finalDamage = baseDamage;
    if (isCrit) {
      finalDamage = Math.floor(baseDamage * (1 + member.equipment.critDamage / 100));
    }

    let aggroMultiplier = DPS_AGGRO_MULTIPLIER;
    if (member.role === 'tank') {
      aggroMultiplier = TANK_AGGRO_MULTIPLIER;
    } else if (member.role === 'hybrid') {
      aggroMultiplier = 1.5;
    }

    const aggroGenerated = finalDamage * AGGRO_PER_DAMAGE * aggroMultiplier;

    return {
      attackerId: member.playerId,
      damage: finalDamage,
      isCrit,
      aggroGenerated,
      hit: true,
    };
  }

  private processHealerAction(
    healer: PartyMemberCombatState,
    partyMembers: PartyMemberCombatState[]
  ): HealResult | null {
    const healthMembers: PartyMemberHealth[] = partyMembers
      .filter(m => m.isAlive && m.currentHp > 0)
      .map(m => ({
        id: m.playerId,
        name: m.playerName,
        currentHp: m.currentHp,
        maxHp: m.maxHp,
        isAlive: m.isAlive,
      }));

    const target = selectHealTarget(healthMembers);
    if (!target) return null;

    const isCrit = shouldHealCrit(healer.equipment.critChance);
    const healAmount = calculateHealAmount(
      healer.equipment.healPower,
      healer.equipment.buffPower,
      isCrit
    );

    const result = applyHeal(target, healAmount);
    result.isCriticalHeal = isCrit;

    const targetMember = partyMembers.find(m => m.playerId === target.id);
    if (targetMember) {
      targetMember.currentHp = Math.min(targetMember.maxHp, targetMember.currentHp + result.healAmount);
    }

    return result;
  }

  processMonsterAttackRound(
    monster: Monster,
    partyMembers: PartyMemberCombatState[]
  ): MonsterAttackResult | null {
    const target = this.selectMonsterTarget(partyMembers, monster);
    if (!target) return null;

    const monsterAccuracy = calculateAccuracyRating(
      monster.attackLevel,
      monster.attackBonus || 0
    );
    const playerEvasion = calculateEvasionRating(
      target.defenceLevel,
      target.equipment.defenceBonus
    );
    const hitChance = calculateHitChance(monsterAccuracy, playerEvasion);

    const hit = Math.random() * 100 < hitChance;

    if (!hit) {
      return {
        targetId: target.playerId,
        damage: 0,
        targetCurrentHp: target.currentHp,
        targetDied: false,
      };
    }

    const monsterMaxHit = calculateMaxHit(
      monster.strengthLevel,
      monster.strengthBonus || 0
    );
    const rawDamage = Math.floor(Math.random() * monsterMaxHit) + 1;

    const playerDefense = target.defenceLevel + target.equipment.defenceBonus;
    const damageReduction = Math.min(0.75, playerDefense / (playerDefense + DEFENCE_DR_CONSTANT));
    const finalDamage = Math.max(1, Math.floor(rawDamage * (1 - damageReduction)));

    target.currentHp = Math.max(0, target.currentHp - finalDamage);
    const targetDied = target.currentHp <= 0;
    if (targetDied) {
      target.isAlive = false;
    }

    return {
      targetId: target.playerId,
      damage: finalDamage,
      targetCurrentHp: target.currentHp,
      targetDied,
    };
  }

  calculatePartyDamage(
    partyMembers: PartyMemberCombatState[],
    monster: Monster
  ): number {
    let totalDamage = 0;

    for (const member of partyMembers) {
      if (!member.isAlive || member.role === 'healer') continue;

      const minHit = calculateMinHit(member.strengthLevel, member.equipment.strengthBonus);
      const maxHit = calculateMaxHit(member.strengthLevel, member.equipment.strengthBonus);
      const avgHit = (minHit + maxHit) / 2;

      const defenseMultiplier = calculateDefenseMultiplier(monster.defenceLevel);
      const avgDamage = avgHit * defenseMultiplier;

      const accuracy = calculateAccuracyRating(member.attackLevel, member.equipment.attackBonus);
      const evasion = calculateEvasionRating(monster.defenceLevel, 0);
      const hitChance = calculateHitChance(accuracy, evasion) / 100;

      const critBonus = (member.equipment.critChance / 100) * (member.equipment.critDamage / 100);
      const effectiveDamage = avgDamage * hitChance * (1 + critBonus);

      totalDamage += effectiveDamage;
    }

    return Math.floor(totalDamage);
  }

  distributeHealToParty(
    healerId: string,
    partyMembers: PartyMemberCombatState[],
    healAmount: number
  ): HealResult | null {
    const healthMembers: PartyMemberHealth[] = partyMembers
      .filter(m => m.isAlive && m.currentHp > 0)
      .map(m => ({
        id: m.playerId,
        name: m.playerName,
        currentHp: m.currentHp,
        maxHp: m.maxHp,
        isAlive: m.isAlive,
      }));

    const target = selectHealTarget(healthMembers);
    if (!target) return null;

    const result = applyHeal(target, healAmount);

    const targetMember = partyMembers.find(m => m.playerId === target.id);
    if (targetMember) {
      targetMember.currentHp = Math.min(targetMember.maxHp, targetMember.currentHp + result.healAmount);
    }

    const healer = partyMembers.find(m => m.playerId === healerId);
    if (healer) {
      healer.aggro += result.healAmount * AGGRO_PER_HEAL;
    }

    return result;
  }

  checkPartyWipe(partyMembers: PartyMemberCombatState[]): boolean {
    return partyMembers.every(m => !m.isAlive || m.currentHp <= 0);
  }

  getPartyCombatStats(partyId: string): PartyCombatStats | null {
    const state = combatStates.get(partyId);
    if (!state) return null;

    let totalDamagePerRound = 0;
    let totalDefence = 0;
    let totalHealPower = 0;
    let tankAggro = 0;
    let dpsAggro = 0;
    let healerAggro = 0;

    for (const member of state.members) {
      if (!member.isAlive) continue;

      totalDefence += member.defenceLevel + member.equipment.defenceBonus;

      if (member.role === 'healer') {
        totalHealPower += member.equipment.healPower;
        healerAggro += member.aggro;
      } else {
        const avgHit = (calculateMinHit(member.strengthLevel, member.equipment.strengthBonus) +
          calculateMaxHit(member.strengthLevel, member.equipment.strengthBonus)) / 2;
        totalDamagePerRound += avgHit;

        if (member.role === 'tank') {
          tankAggro += member.aggro;
        } else {
          dpsAggro += member.aggro;
        }
      }
    }

    return {
      totalDamagePerRound: Math.floor(totalDamagePerRound),
      totalDefence,
      totalHealPower,
      tankAggro,
      dpsAggro,
      healerAggro,
    };
  }

  processFullRound(
    partyId: string,
    monster: Monster
  ): PartyRoundResult | null {
    const state = combatStates.get(partyId);
    if (!state) return null;

    state.roundNumber++;

    const { attacks, heals, monsterHpRemaining } = this.processPartyAttackRound(
      state.members,
      monster,
      state.monsterCurrentHp
    );

    state.monsterCurrentHp = monsterHpRemaining;
    const monsterDied = monsterHpRemaining <= 0;

    let monsterAttack: MonsterAttackResult | null = null;
    if (!monsterDied) {
      monsterAttack = this.processMonsterAttackRound(monster, state.members);
    }

    const partyWiped = this.checkPartyWipe(state.members);

    return {
      partyAttacks: attacks,
      healResults: heals,
      monsterAttack,
      monsterHpRemaining,
      monsterDied,
      partyWiped,
    };
  }

  clearCombatState(partyId: string): void {
    combatStates.delete(partyId);
  }

  reviveMember(partyId: string, playerId: string, hpPercent: number = 50): boolean {
    const state = combatStates.get(partyId);
    if (!state) return false;

    const member = state.members.find(m => m.playerId === playerId);
    if (!member) return false;

    member.isAlive = true;
    member.currentHp = Math.floor(member.maxHp * (hpPercent / 100));
    member.aggro = 0;

    return true;
  }

  updateMemberAggro(
    partyId: string,
    playerId: string,
    aggroChange: number
  ): boolean {
    const state = combatStates.get(partyId);
    if (!state) return false;

    const member = state.members.find(m => m.playerId === playerId);
    if (!member) return false;

    member.aggro = Math.max(0, member.aggro + aggroChange);
    return true;
  }

  resetAllAggro(partyId: string): boolean {
    const state = combatStates.get(partyId);
    if (!state) return false;

    for (const member of state.members) {
      if (member.isAlive) {
        const aggroStats: EquipmentAggroStats = {};
        const aggroResult = calculateTotalAggro(
          aggroStats,
          member.equipment.armorType,
          member.equipment.weaponType,
          0
        );
        let baseAggro = aggroResult.totalAggro;
        if (member.role === 'tank') {
          baseAggro *= TANK_AGGRO_MULTIPLIER;
        } else if (member.role === 'healer') {
          baseAggro *= HEALER_AGGRO_MULTIPLIER;
        }
        member.aggro = baseAggro;
      }
    }

    return true;
  }
}

export const partyCombatService = new PartyCombatService();
