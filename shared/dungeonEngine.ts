import type { DungeonCurse, DungeonCurseType, DungeonV2ConfigSnapshot, BossTriggerRules, MemberStatsSnapshot, MonsterSkill, MonsterSkillType } from './schema';
import { DEFENCE_DR_CONSTANT } from './schema';
import { DUNGEON_ROLE_PASSIVES, type AssassinPassive, type GuardianPassive, type BerserkerPassive, type ExecutionerPassive, type WardenPassive, type RangerPassive } from './dungeonRoles';

export function createSeededRng(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return function() {
    h |= 0; h = h + 0x6D2B79F5 | 0;
    let t = Math.imul(h ^ h >>> 15, 1 | h);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function assignRandomSkills(floor: number, rng: () => number): MonsterSkill[] {
  const skills: MonsterSkill[] = [];

  if (floor <= 5) return skills;

  const availableSkills: { type: MonsterSkillType; weight: number }[] = [
    { type: 'stun', weight: 25 },
    { type: 'poison', weight: 25 },
    { type: 'burn', weight: 20 },
    { type: 'armor_break', weight: 15 },
    { type: 'critical', weight: 10 },
    { type: 'enrage', weight: 5 },
  ];

  if (floor >= 16) {
    availableSkills.push({ type: 'mass_stun', weight: 8 });
  }
  if (floor >= 12) {
    availableSkills.push({ type: 'mass_poison', weight: 8 });
  }
  if (floor >= 20) {
    availableSkills.push({ type: 'mass_burn', weight: 7 });
  }
  if (floor >= 25) {
    availableSkills.push({ type: 'mass_armor_break', weight: 6 });
  }

  let maxSkills: number;
  if (floor <= 15) {
    maxSkills = 1;
  } else if (floor <= 30) {
    maxSkills = 1 + (rng() < 0.4 ? 1 : 0);
  } else {
    maxSkills = 2 + (rng() < 0.3 ? 1 : 0);
  }

  const skillChance = Math.min(0.8, 0.3 + floor * 0.015);
  if (rng() > skillChance) return skills;

  const usedTypes = new Set<string>();
  const totalWeight = availableSkills.reduce((s, sk) => s + sk.weight, 0);

  for (let i = 0; i < maxSkills; i++) {
    let roll = rng() * totalWeight;
    for (const sk of availableSkills) {
      roll -= sk.weight;
      if (roll <= 0 && !usedTypes.has(sk.type)) {
        usedTypes.add(sk.type);
        const skill = createDefaultSkill(sk.type, floor);
        if (skill) skills.push(skill);
        break;
      }
    }
  }

  return skills;
}

export function calculatePartyLootBonus(memberCount: number): number {
  if (memberCount <= 1) return 1;
  return 1 + (memberCount - 1) * 0.15;
}

function createDefaultSkill(type: MonsterSkillType, floor: number): MonsterSkill | null {
  const baseChance = Math.min(35, 10 + floor * 0.5);
  switch (type) {
    case 'stun':
      return { id: `random_stun_${floor}`, name: 'Stun', type: 'stun', chance: baseChance, stunDuration: 2 };
    case 'poison':
      return { id: `random_poison_${floor}`, name: 'Poison', type: 'poison', chance: baseChance, dotDamage: Math.floor(3 + floor * 0.3), dotDuration: 4 };
    case 'burn':
      return { id: `random_burn_${floor}`, name: 'Burn', type: 'burn', chance: baseChance, dotDamage: Math.floor(4 + floor * 0.4), dotDuration: 3, healingReduction: 0.5 };
    case 'armor_break':
      return { id: `random_armor_break_${floor}`, name: 'Armor Break', type: 'armor_break', chance: baseChance, armorBreakPercent: 30, armorBreakDuration: 5 };
    case 'critical':
      return { id: `random_critical_${floor}`, name: 'Critical Strike', type: 'critical', chance: baseChance * 0.8 };
    case 'enrage':
      return { id: `random_enrage_${floor}`, name: 'Enrage', type: 'enrage', chance: 100, enrageThreshold: 35, enrageDamageBoost: 1.3 };
    case 'mass_stun':
      return { id: `random_mass_stun_${floor}`, name: 'Mass Stun', type: 'mass_stun', chance: baseChance * 0.5, stunDuration: 2 };
    case 'mass_armor_break':
      return { id: `random_mass_armor_break_${floor}`, name: 'Mass Armor Break', type: 'mass_armor_break', chance: baseChance * 0.4, massArmorBreakPercent: 25, massArmorBreakDuration: 4000 };
    case 'mass_burn':
      return { id: `random_mass_burn_${floor}`, name: 'Mass Burn', type: 'mass_burn', chance: baseChance * 0.4, massBurnDamage: Math.floor(5 + floor * 0.5), massBurnDuration: 3 };
    case 'mass_poison':
      return { id: `random_mass_poison_${floor}`, name: 'Mass Poison', type: 'mass_poison', chance: baseChance * 0.45, massPoisonDamage: Math.floor(4 + floor * 0.4), massPoisonDuration: 4 };
    default:
      return null;
  }
}

export interface MemberFloorInput {
  playerId: string;
  role: string;
  isAlive: boolean;
  currentThreat: number;
  dps: number;
  defense: number;
  healEfficiency: number;
  maxHp: number;
  currentHp: number;
  attackSpeed: number;
  weaponType: string | null;
  minHit?: number;
  maxHit?: number;
  critChance?: number;
  critDamage?: number;
}

export interface DungeonLootTableInput {
  guaranteedDrops: string[];
  possibleDrops: { itemId: string; weight: number }[];
  partyExclusiveDrops?: { itemId: string; partyWeight: number; soloWeight: number }[];
}

export interface FloorResolutionInput {
  floor: number;
  monsterHp: number;
  monsterAttack: number;
  monsterDefence: number;
  monsterAttackSpeed: number;
  members: MemberFloorInput[];
  riskLevel: number;
  chaosMeter: number;
  currentMultiplier: number;
  activeCurses: DungeonCurse[];
  config: DungeonV2ConfigSnapshot;
  rng: () => number;
  lootTable?: DungeonLootTableInput;
  generateReplay?: boolean;
  monsterSkills?: MonsterSkill[];
  isBossFloor?: boolean;
  isPartyMode?: boolean;
}

export interface MemberFloorResult {
  playerId: string;
  isAlive: boolean;
  currentHp: number;
  currentThreat: number;
  damageDealt: number;
  healingDone: number;
  damageTaken: number;
  durabilityLoss: number;
}

export type DungeonReplayEventType =
  | 'attack'
  | 'monster_attack'
  | 'skill_stun'
  | 'skill_poison'
  | 'skill_armor_break'
  | 'skill_aoe'
  | 'heal'
  | 'poison_tick'
  | 'death'
  | 'monster_death'
  | 'dodge'
  | 'skill_blocked'
  | 'silence'
  | 'frenzy_activate'
  | 'execute_bonus'
  | 'boss_self_heal'
  | 'boss_heal_on_player_heal'
  | 'boss_reflect'
  | 'boss_execute'
  | 'boss_summon'
  | 'boss_aggro_swap'
  | 'boss_buff_punish'
  | 'boss_root'
  | 'boss_mass_stun'
  | 'boss_mass_armor_break'
  | 'boss_multi_attack'
  | 'boss_aggro_reset'
  | 'boss_regenerate'
  | 'boss_mass_burn'
  | 'boss_mass_poison'
  | 'boss_lifesteal';

export interface DungeonReplayEvent {
  type: DungeonReplayEventType;
  timestamp: number;
  sourceId: string;
  targetId: string;
  damage?: number;
  healing?: number;
  duration?: number;
  damagePerTick?: number;
  skillName?: string;
}

export interface FloorResolutionResult {
  membersAfter: MemberFloorResult[];
  monsterDefeated: boolean;
  floorDurationMs: number;
  lootGenerated: Record<string, number>;
  goldGenerated: number;
  xpGenerated: number;
  newRiskLevel: number;
  newChaosMeter: number;
  newMultiplier: number;
  newCurses: DungeonCurse[];
  chaosTriggered: boolean;
  hiddenBossTriggered: boolean;
  combatReplay?: DungeonReplayEvent[];
  partyLootBonus: number;
}

export function calculateThreat(
  damageDealt: number,
  healingDone: number,
  role: string,
  currentThreat: number,
  threatDecay: number
): number {
  const damageCoef = 1.0;
  const healThreatCoef = 0.5;
  const tauntBonus = role === 'tank' ? 1.5 : 1.0;

  const newThreat = (damageDealt * damageCoef + healingDone * healThreatCoef) * tauntBonus;
  const decayedOld = currentThreat * (1 - threatDecay / 100);
  return Math.floor(decayedOld + newThreat);
}

export function calculateExtractionPercent(
  riskLevel: number,
  config: Pick<DungeonV2ConfigSnapshot, 'baseExtraction' | 'penaltyCoef' | 'minExtraction' | 'maxExtraction'>
): number {
  const raw = config.baseExtraction - (riskLevel * config.penaltyCoef);
  return Math.max(config.minExtraction, Math.min(config.maxExtraction, raw));
}

export function distributeLoot(
  lootPool: Record<string, number>,
  goldPool: number,
  xpPool: number,
  aliveMembers: string[],
  deadMembers: string[],
  exitedMembers: { playerId: string; extractionPercent: number }[],
  finalExtractionPercent: number
): Map<string, { items: Record<string, number>; gold: number; xp: number }> {
  const result = new Map<string, { items: Record<string, number>; gold: number; xp: number }>();

  for (const id of deadMembers) {
    result.set(id, { items: {}, gold: 0, xp: 0 });
  }

  for (const em of exitedMembers) {
    const share = em.extractionPercent / 100;
    const memberCount = exitedMembers.length + aliveMembers.length;
    const portion = memberCount > 0 ? 1 / memberCount : 0;
    const items: Record<string, number> = {};
    for (const [itemId, qty] of Object.entries(lootPool)) {
      const amt = Math.floor(qty * portion * share);
      if (amt > 0) items[itemId] = amt;
    }
    result.set(em.playerId, {
      items,
      gold: Math.floor(goldPool * portion * share),
      xp: Math.floor(xpPool * portion * share),
    });
  }

  if (aliveMembers.length > 0) {
    const share = finalExtractionPercent / 100;
    const memberCount = exitedMembers.length + aliveMembers.length;
    const portion = memberCount > 0 ? 1 / memberCount : 0;
    for (const id of aliveMembers) {
      const items: Record<string, number> = {};
      for (const [itemId, qty] of Object.entries(lootPool)) {
        const amt = Math.floor(qty * portion * share);
        if (amt > 0) items[itemId] = amt;
      }
      result.set(id, {
        items,
        gold: Math.floor(goldPool * portion * share),
        xp: Math.floor(xpPool * portion * share),
      });
    }
  }

  return result;
}

export function calculateMultiplierIncrease(
  currentMultiplier: number,
  floor: number,
  cap: number
): number {
  const increase = Math.floor(50 * Math.log(1 + floor / 10));
  return Math.min(currentMultiplier + increase, cap);
}

export function rollCurse(
  floor: number,
  currentCurseStack: number,
  curseCap: number,
  rng: () => number
): DungeonCurse | null {
  if (currentCurseStack >= curseCap) return null;
  const chance = 0.10 + 0.02 * Math.min(floor, 50);
  if (rng() > chance) return null;

  const curseTypes: DungeonCurseType[] = ['reduced_heal', 'increased_durability_loss', 'increased_enemy_damage', 'increased_multiplier_gain'];
  const type = curseTypes[Math.floor(rng() * curseTypes.length)];
  return { type, stackCount: 1, appliedAtFloor: floor };
}

export function checkHiddenBossSpawn(
  curseStack: number,
  floor: number,
  chaosTriggerCount: number,
  rules: BossTriggerRules,
  alreadySpawned: boolean
): boolean {
  if (alreadySpawned) return false;
  return curseStack >= rules.minCurseStack &&
         floor >= rules.minFloor &&
         chaosTriggerCount >= rules.minChaosTriggers;
}

function getCurseStacks(curses: DungeonCurse[], type: DungeonCurseType): number {
  let total = 0;
  for (const c of curses) {
    if (c.type === type) total += c.stackCount;
  }
  return total;
}

function defenseReductionFormula(defense: number): number {
  return Math.max(0.25, 1 - defense / (defense + DEFENCE_DR_CONSTANT));
}

export function resolveFloor(input: FloorResolutionInput): FloorResolutionResult {
  const { floor, rng, config, activeCurses } = input;

  const aliveMembers = input.members.filter(m => m.isAlive);
  const deadMembers = input.members.filter(m => !m.isAlive);

  if (aliveMembers.length === 0) {
    return {
      membersAfter: input.members.map(m => ({
        playerId: m.playerId,
        isAlive: false,
        currentHp: 0,
        currentThreat: m.currentThreat,
        damageDealt: 0,
        healingDone: 0,
        damageTaken: 0,
        durabilityLoss: 0,
      })),
      monsterDefeated: false,
      floorDurationMs: 0,
      lootGenerated: {},
      goldGenerated: 0,
      xpGenerated: 0,
      newRiskLevel: input.riskLevel,
      newChaosMeter: input.chaosMeter,
      newMultiplier: input.currentMultiplier,
      newCurses: [...activeCurses],
      chaosTriggered: false,
      hiddenBossTriggered: false,
      partyLootBonus: 1,
    };
  }

  const enemyDmgStacks = getCurseStacks(activeCurses, 'increased_enemy_damage');
  const reducedHealStacks = getCurseStacks(activeCurses, 'reduced_heal');
  const durabilityLossStacks = getCurseStacks(activeCurses, 'increased_durability_loss');

  let effectiveMonsterAttack = input.monsterAttack * (input.currentMultiplier / 100);
  effectiveMonsterAttack *= Math.pow(1.2, enemyDmgStacks);

  const effectiveHp = input.monsterHp * (input.currentMultiplier / 100);
  const effectiveMonsterDefence = input.monsterDefence * (input.currentMultiplier / 100);

  const bossSkills = input.monsterSkills || [];
  const isParty = input.isPartyMode ?? (aliveMembers.length > 1);

  const hasTank = aliveMembers.some(m => m.role === 'tank');
  const tanks = aliveMembers.filter(m => m.role === 'tank');
  const nonTanks = aliveMembers.filter(m => m.role !== 'tank');

  let bossSelfHealTotal = 0;
  const selfHealSkill = bossSkills.find(s => s.type === 'self_heal_percent');

  let healOnPlayerHealReduction = 0;
  const healOnHealSkill = bossSkills.find(s => s.type === 'heal_on_player_heal');
  if (healOnHealSkill) {
    healOnPlayerHealReduction = (healOnHealSkill.healPercent || 5) / 100;
  }

  const buffPunishSkill = bossSkills.find(s => s.type === 'buff_punish');
  let buffPunishMultiplier = 1;
  if (buffPunishSkill) {
    const estimatedBuffedCount = isParty ? Math.floor(aliveMembers.length * 0.5) : 0;
    buffPunishMultiplier = 1 + estimatedBuffedCount * (buffPunishSkill.buffPunishMultiplier || 0.25);
  }

  const reflectSkill = bossSkills.find(s => s.type === 'reflect_damage');
  let reflectPercent = 0;
  let flatReflectPerHit = 0;
  if (reflectSkill) {
    const activateAt = reflectSkill.activateAtHpPercent || 50;
    reflectPercent = ((reflectSkill.reflectPercent || 10) / 100) * (activateAt / 100);
    flatReflectPerHit = (reflectSkill.flatReflect || 0) * (activateAt / 100);
  }

  let summonExtraHp = 0;
  const summonSkill = bossSkills.find(s => s.type === 'summon_adds');
  if (summonSkill) {
    const count = summonSkill.summonCount || 2;
    const hpPct = summonSkill.summonHpPercent || 15;
    summonExtraHp = effectiveHp * (hpPct / 100) * count;
  }

  const executeSkill = bossSkills.find(s => s.type === 'execute_player');
  const aggroSwapSkill = isParty ? bossSkills.find(s => s.type === 'aggro_swap') : null;
  const aggroResetSkill = isParty ? bossSkills.find(s => s.type === 'aggro_reset') : null;
  const multiTargetSkill = isParty ? bossSkills.find(s => s.type === 'multi_target_attack') : null;

  const massStunSkill = bossSkills.find(s => s.type === 'mass_stun');
  let massStunDpsReduction = 1;
  if (massStunSkill) {
    const stunChance = (massStunSkill.chance || 20) / 100;
    const stunDur = (massStunSkill.stunDuration || 2) * 1000;
    const monsterAtkSpeed = input.monsterAttackSpeed || 3000;
    massStunDpsReduction = 1 - (stunChance * stunDur / monsterAtkSpeed) * 0.3;
  }

  const massArmorBreakSkill = bossSkills.find(s => s.type === 'mass_armor_break');
  let massArmorBreakFactor = 1;
  if (massArmorBreakSkill) {
    const breakPct = (massArmorBreakSkill.massArmorBreakPercent || 50) / 100;
    const breakChance = (massArmorBreakSkill.chance || 25) / 100;
    massArmorBreakFactor = 1 + breakPct * breakChance * 0.5;
  }

  const massBurnSkill = bossSkills.find(s => s.type === 'mass_burn');
  let massBurnDot = 0;
  if (massBurnSkill) {
    const burnDmg = massBurnSkill.massBurnDamage || Math.floor(effectiveMonsterAttack * 0.12);
    const burnDur = massBurnSkill.massBurnDuration || 3;
    const burnChance = (massBurnSkill.chance || 35) / 100;
    massBurnDot = burnDmg * burnDur * burnChance * aliveMembers.length;
  }

  const massPoisonSkill = bossSkills.find(s => s.type === 'mass_poison');
  let massPoisonDot = 0;
  if (massPoisonSkill) {
    const poisonDmg = massPoisonSkill.massPoisonDamage || Math.floor(effectiveMonsterAttack * 0.10);
    const poisonDur = massPoisonSkill.massPoisonDuration || 4;
    const poisonChance = (massPoisonSkill.chance || 30) / 100;
    massPoisonDot = poisonDmg * poisonDur * poisonChance * aliveMembers.length;
  }

  effectiveMonsterAttack *= buffPunishMultiplier * massArmorBreakFactor;

  let aggroChaosMultiplier = 1;
  if (aggroSwapSkill && nonTanks.length > 0) {
    const swapInterval = aggroSwapSkill.aggroSwapInterval || 3;
    const bonusDmg = aggroSwapSkill.aggroSwapBonusDmg || 3;
    const swapRatio = 1 / swapInterval;
    const nonTankRatio = nonTanks.length / aliveMembers.length;
    aggroChaosMultiplier = 1 + swapRatio * nonTankRatio * (bonusDmg - 1) * 0.3;
  }
  if (aggroResetSkill) {
    aggroChaosMultiplier *= 1.15;
  }
  effectiveMonsterAttack *= aggroChaosMultiplier;

  const monsterDefReduction = defenseReductionFormula(effectiveMonsterDefence);
  const totalDps = aliveMembers.reduce((sum, m) => sum + m.dps, 0) * massStunDpsReduction * monsterDefReduction;

  if (selfHealSkill) {
    const prelimTimeToKill = totalDps > 0 ? effectiveHp / totalDps : 60;
    const healPerTurn = effectiveHp * (selfHealSkill.selfHealPercent || 3) / 100;
    const estimatedTurns = Math.max(1, Math.floor(prelimTimeToKill));
    bossSelfHealTotal = healPerTurn * estimatedTurns;
  }

  const lifestealSkill = bossSkills.find(s => s.type === 'lifesteal');
  let lifestealExtra = 0;
  if (lifestealSkill) {
    const stealPct = (lifestealSkill.lifestealPercent || 30) / 100;
    const prelimTTK = totalDps > 0 ? effectiveHp / totalDps : 60;
    lifestealExtra = effectiveMonsterAttack * stealPct * prelimTTK * 0.3;
  }

  const adjustedEffectiveHp = effectiveHp + bossSelfHealTotal + summonExtraHp + lifestealExtra;
  const timeToKill = totalDps > 0 ? adjustedEffectiveHp / totalDps : 60;
  const floorDurationMs = Math.floor(timeToKill * 1000);

  const memberResults: MemberFloorResult[] = [];

  const damageShares: Record<string, number> = {};
  if (hasTank) {
    const tankShare = 0.7 / (tanks.length || 1);
    const restShare = nonTanks.length > 0 ? 0.3 / nonTanks.length : 0;
    for (const m of tanks) damageShares[m.playerId] = tankShare;
    for (const m of nonTanks) damageShares[m.playerId] = restShare;
    if (nonTanks.length === 0) {
      for (const m of tanks) damageShares[m.playerId] = 1.0 / tanks.length;
    }
  } else {
    const equalShare = 1.0 / aliveMembers.length;
    for (const m of aliveMembers) damageShares[m.playerId] = equalShare;
  }

  const totalMonsterDamage = effectiveMonsterAttack * timeToKill;

  const memberDamage: Record<string, number> = {};
  const memberHealing: Record<string, number> = {};
  const memberDamageDealt: Record<string, number> = {};

  let guardianShieldPool = 0;
  const guardians = aliveMembers.filter(m => m.weaponType === 'sword_shield');
  for (const g of guardians) {
    const gPassive = DUNGEON_ROLE_PASSIVES['sword_shield'] as GuardianPassive;
    guardianShieldPool += g.maxHp * gPassive.partyShieldPercent;
  }

  for (const m of aliveMembers) {
    let effectiveDps = m.dps;

    if (m.weaponType === '2h_sword') {
      const bPassive = DUNGEON_ROLE_PASSIVES['2h_sword'] as BerserkerPassive;
      const estimatedHpRatio = m.currentHp / m.maxHp;
      if (estimatedHpRatio < bPassive.frenzyThreshold) {
        effectiveDps *= (1 + bPassive.frenzyDpsBoost);
      }
    }

    if (m.weaponType === '2h_axe') {
      const exPassive = DUNGEON_ROLE_PASSIVES['2h_axe'] as ExecutionerPassive;
      const executePortion = exPassive.executeThreshold;
      effectiveDps *= (1 + exPassive.executeDmgBoost * executePortion);
    }

    memberDamageDealt[m.playerId] = effectiveDps * timeToKill;
  }

  for (const m of aliveMembers) {
    const share = damageShares[m.playerId] || 0;
    const rawDmg = totalMonsterDamage * share;
    const reduction = defenseReductionFormula(m.defense);
    let dmgAfterDef = rawDmg * reduction;

    if (m.weaponType === 'dagger') {
      const aPassive = DUNGEON_ROLE_PASSIVES['dagger'] as AssassinPassive;
      dmgAfterDef *= (1 - aPassive.evasionChance);
    }

    if (guardianShieldPool > 0 && m.weaponType !== 'sword_shield') {
      const absorbed = Math.min(guardianShieldPool, dmgAfterDef * 0.3);
      dmgAfterDef -= absorbed;
      guardianShieldPool -= absorbed;
    }

    memberDamage[m.playerId] = dmgAfterDef;

    if (massBurnDot > 0 || massPoisonDot > 0) {
      const extraDot = (massBurnDot + massPoisonDot) / aliveMembers.length;
      memberDamage[m.playerId] += extraDot;
    }
  }

  const healers = aliveMembers.filter(m => m.role === 'healer');
  let totalHealAvailable = 0;
  for (const h of healers) {
    let heal = h.healEfficiency * timeToKill;
    if (reducedHealStacks > 0) {
      heal *= Math.pow(0.8, reducedHealStacks);
    }
    totalHealAvailable += heal;
  }

  if (healOnPlayerHealReduction > 0) {
    totalHealAvailable *= (1 - healOnPlayerHealReduction * Math.min(aliveMembers.length, 3));
    totalHealAvailable = Math.max(0, totalHealAvailable);
  }

  const totalDamageTaken = Object.values(memberDamage).reduce((s, v) => s + v, 0);
  for (const m of aliveMembers) {
    const dmgTaken = memberDamage[m.playerId];
    const healShare = totalDamageTaken > 0 ? (dmgTaken / totalDamageTaken) : (1 / aliveMembers.length);
    memberHealing[m.playerId] = totalHealAvailable * healShare;
  }

  const newCurses = [...activeCurses];
  let chaosTriggerCount = 0;

  for (const m of aliveMembers) {
    const dmgTaken = memberDamage[m.playerId];
    const healReceived = memberHealing[m.playerId];
    const netDamage = dmgTaken - healReceived;
    const finalHp = Math.max(0, m.currentHp - netDamage);
    const died = finalHp <= 0;

    const damageDealt = memberDamageDealt[m.playerId];
    const healingDone = m.role === 'healer' ? (m.healEfficiency * timeToKill * (reducedHealStacks > 0 ? Math.pow(0.8, reducedHealStacks) : 1)) : 0;

    const threat = calculateThreat(
      damageDealt,
      healingDone,
      m.role,
      m.currentThreat,
      config.threatDecay
    );

    const baseDurLoss = 1;
    const durLossMultiplier = config.durabilityMultiplier / 100;
    const curseDurBonus = 1 + durabilityLossStacks * 0.25;
    const durabilityLoss = baseDurLoss * durLossMultiplier * curseDurBonus;

    memberResults.push({
      playerId: m.playerId,
      isAlive: !died,
      currentHp: died ? 0 : Math.floor(finalHp),
      currentThreat: threat,
      damageDealt: Math.floor(damageDealt),
      healingDone: Math.floor(healingDone),
      damageTaken: Math.floor(dmgTaken),
      durabilityLoss: Math.round(durabilityLoss * 100) / 100,
    });
  }

  for (const m of deadMembers) {
    memberResults.push({
      playerId: m.playerId,
      isAlive: false,
      currentHp: 0,
      currentThreat: m.currentThreat,
      damageDealt: 0,
      healingDone: 0,
      damageTaken: 0,
      durabilityLoss: 0,
    });
  }

  if (executeSkill) {
    const threshold = (executeSkill.executeThreshold || 15) / 100;
    for (const result of memberResults) {
      if (result.isAlive && result.currentHp > 0) {
        const member = aliveMembers.find(m => m.playerId === result.playerId);
        if (member && result.currentHp / member.maxHp < threshold) {
          result.isAlive = false;
          result.currentHp = 0;
        }
      }
    }
  }

  if (reflectPercent > 0 || flatReflectPerHit > 0) {
    for (const result of memberResults) {
      if (result.isAlive) {
        const member = input.members.find((m: any) => m.playerId === result.playerId);
        const rawReflected = Math.floor(result.damageDealt * reflectPercent) + Math.floor(flatReflectPerHit);
        const reflectCap = member ? Math.floor(member.maxHp * 0.12) : rawReflected;
        const reflected = Math.min(rawReflected, reflectCap);
        result.currentHp = Math.max(0, result.currentHp - reflected);
        result.damageTaken += reflected;
        if (result.currentHp <= 0) {
          result.isAlive = false;
        }
      }
    }
  }

  const newRiskLevel = input.riskLevel + 1;

  let newChaosMeter = input.chaosMeter + 1 + floor / 10;
  let chaosTriggered = false;
  if (newChaosMeter >= config.chaosThreshold) {
    chaosTriggered = true;
    chaosTriggerCount++;
    newChaosMeter = 0;
  }

  let newMultiplier = input.currentMultiplier;
  if (chaosTriggered) {
    newMultiplier = calculateMultiplierIncrease(input.currentMultiplier, floor, config.multiplierCap);
  }

  const totalCurseStack = newCurses.reduce((s, c) => s + c.stackCount, 0);
  const newCurse = rollCurse(floor, totalCurseStack, config.curseCap, rng);
  if (newCurse) {
    const existing = newCurses.find(c => c.type === newCurse.type);
    if (existing) {
      existing.stackCount += 1;
    } else {
      newCurses.push(newCurse);
    }
  }

  const updatedCurseStack = newCurses.reduce((s, c) => s + c.stackCount, 0);
  const hiddenBossTriggered = checkHiddenBossSpawn(
    updatedCurseStack,
    floor,
    chaosTriggerCount,
    config.bossTriggerRules,
    false
  );

  const partyLootBonus = calculatePartyLootBonus(aliveMembers.length);
  const lootMultiplier = (input.currentMultiplier / 100) * (1 + floor * 0.05) * partyLootBonus;
  const baseGold = Math.floor(10 * lootMultiplier);
  const baseXp = Math.floor(15 * lootMultiplier);

  const lootGenerated: Record<string, number> = {};
  if (input.lootTable) {
    for (const itemId of input.lootTable.guaranteedDrops) {
      lootGenerated[itemId] = (lootGenerated[itemId] || 0) + Math.max(1, Math.floor(lootMultiplier));
    }
    if (input.lootTable.possibleDrops.length > 0) {
      const dropRoll = rng();
      const dropChance = Math.min(0.8, 0.3 + floor * 0.01);
      if (dropRoll < dropChance) {
        const totalWeight = input.lootTable.possibleDrops.reduce((s, d) => s + d.weight, 0);
        if (totalWeight > 0) {
          let roll = rng() * totalWeight;
          for (const drop of input.lootTable.possibleDrops) {
            roll -= drop.weight;
            if (roll <= 0) {
              lootGenerated[drop.itemId] = (lootGenerated[drop.itemId] || 0) + Math.max(1, Math.floor(lootMultiplier));
              break;
            }
          }
        }
      }
    }
    if (input.lootTable?.partyExclusiveDrops && input.lootTable.partyExclusiveDrops.length > 0) {
      const isParty = input.isPartyMode ?? (input.members.length > 1);
      for (const exclusiveDrop of input.lootTable.partyExclusiveDrops) {
        const dropChance = isParty ? exclusiveDrop.partyWeight : exclusiveDrop.soloWeight;
        if (dropChance > 0 && rng() * 100 < dropChance) {
          lootGenerated[exclusiveDrop.itemId] = (lootGenerated[exclusiveDrop.itemId] || 0) + 1;
        }
      }
    }
  }

  let combatReplay: DungeonReplayEvent[] | undefined;
  if (input.generateReplay && aliveMembers.length > 0) {
    combatReplay = generateCombatReplay(
      aliveMembers,
      memberResults,
      input,
      effectiveMonsterAttack,
      effectiveHp,
      timeToKill,
      damageShares,
      healers,
      rng,
    );
  }

  return {
    membersAfter: memberResults,
    monsterDefeated: true,
    floorDurationMs,
    lootGenerated,
    goldGenerated: baseGold,
    xpGenerated: baseXp,
    newRiskLevel,
    newChaosMeter: Math.floor(newChaosMeter * 100) / 100,
    newMultiplier,
    newCurses,
    chaosTriggered,
    hiddenBossTriggered,
    combatReplay,
    partyLootBonus,
  };
}

function processReplayBossSkill(
  skill: MonsterSkill,
  allTargets: MemberFloorInput[],
  events: DungeonReplayEvent[],
  t: number,
  effectiveMonsterAttack: number,
  effectiveMonsterHp: number,
  monsterHpTrack: number,
  memberHpTrack: Record<string, number>,
  memberResults: MemberFloorResult[],
  rng: () => number,
  isPartyMode: boolean,
  timeToKill: number,
  monsterAttackInterval: number,
): void {
  switch (skill.type) {
    case 'mass_stun': {
      for (const target of allTargets) {
        events.push({
          type: 'boss_mass_stun',
          timestamp: Math.floor(t),
          sourceId: 'monster',
          targetId: target.playerId,
          duration: (skill.stunDuration || 2) * 1000,
          skillName: skill.name || 'Mass Stun',
        });
      }
      break;
    }
    case 'mass_armor_break': {
      for (const target of allTargets) {
        events.push({
          type: 'boss_mass_armor_break',
          timestamp: Math.floor(t),
          sourceId: 'monster',
          targetId: target.playerId,
          duration: skill.massArmorBreakDuration || 4000,
          skillName: skill.name || 'Mass Armor Break',
        });
      }
      break;
    }
    case 'self_heal_percent': {
      const healAmount = Math.floor(effectiveMonsterHp * (skill.selfHealPercent || 3) / 100);
      events.push({
        type: 'boss_self_heal',
        timestamp: Math.floor(t),
        sourceId: 'monster',
        targetId: 'monster',
        healing: healAmount,
        skillName: skill.name || 'Self Heal',
      });
      break;
    }
    case 'heal_on_player_heal': {
      const healAmount = Math.floor(effectiveMonsterHp * (skill.healPercent || 5) / 100);
      events.push({
        type: 'boss_heal_on_player_heal',
        timestamp: Math.floor(t),
        sourceId: 'monster',
        targetId: 'monster',
        healing: healAmount,
        skillName: skill.name || 'Soul Harvest',
      });
      break;
    }
    case 'reflect_damage': {
      const highestDpsTarget = [...allTargets].sort((a, b) => b.dps - a.dps)[0];
      if (highestDpsTarget) {
        const rawReflectDmg = Math.floor(highestDpsTarget.dps * (skill.reflectPercent || 10) / 100) + (skill.flatReflect || 0);
        const reflectCap = Math.floor(highestDpsTarget.maxHp * 0.12);
        const reflectDmg = Math.min(rawReflectDmg, reflectCap);
        events.push({
          type: 'boss_reflect',
          timestamp: Math.floor(t),
          sourceId: 'monster',
          targetId: highestDpsTarget.playerId,
          damage: reflectDmg,
          skillName: skill.name || 'Damage Reflect',
        });
        memberHpTrack[highestDpsTarget.playerId] = Math.max(0, (memberHpTrack[highestDpsTarget.playerId] || 0) - reflectDmg);
      }
      break;
    }
    case 'execute_player': {
      const threshold = (skill.executeThreshold || 15) / 100;
      for (const target of allTargets) {
        const hpRatio = (memberHpTrack[target.playerId] || 0) / target.maxHp;
        if (hpRatio > 0 && hpRatio < threshold) {
          events.push({
            type: 'boss_execute',
            timestamp: Math.floor(t),
            sourceId: 'monster',
            targetId: target.playerId,
            damage: memberHpTrack[target.playerId] || 0,
            skillName: skill.name || 'Execute',
          });
          memberHpTrack[target.playerId] = 0;
          const result = memberResults.find(r => r.playerId === target.playerId);
          if (result) {
            result.isAlive = false;
            result.currentHp = 0;
          }
          break;
        }
      }
      break;
    }
    case 'aggro_swap': {
      if (!isPartyMode || allTargets.length < 2) break;
      const sorted = [...allTargets].sort((a, b) => b.currentThreat - a.currentThreat);
      const secondTarget = sorted[1];
      const isTank = secondTarget.role === 'tank';
      const bonusDmg = isTank ? 1 : (skill.aggroSwapBonusDmg || 3);
      const hitDmg = Math.floor(effectiveMonsterAttack * 0.5 * bonusDmg);
      events.push({
        type: 'boss_aggro_swap',
        timestamp: Math.floor(t),
        sourceId: 'monster',
        targetId: secondTarget.playerId,
        damage: hitDmg,
        skillName: skill.name || 'Aggro Swap',
      });
      memberHpTrack[secondTarget.playerId] = Math.max(0, (memberHpTrack[secondTarget.playerId] || 0) - hitDmg);
      break;
    }
    case 'aggro_reset': {
      if (!isPartyMode) break;
      const randomTarget = allTargets[Math.floor(rng() * allTargets.length)];
      const hitDmg = Math.floor(effectiveMonsterAttack * 2);
      events.push({
        type: 'boss_aggro_reset',
        timestamp: Math.floor(t),
        sourceId: 'monster',
        targetId: randomTarget.playerId,
        damage: hitDmg,
        skillName: skill.name || 'Reality Warp',
      });
      memberHpTrack[randomTarget.playerId] = Math.max(0, (memberHpTrack[randomTarget.playerId] || 0) - hitDmg);
      break;
    }
    case 'buff_punish': {
      events.push({
        type: 'boss_buff_punish',
        timestamp: Math.floor(t),
        sourceId: 'monster',
        targetId: 'all',
        skillName: skill.name || 'Buff Punishment',
      });
      break;
    }
    case 'summon_adds': {
      const count = skill.summonCount || 2;
      const hpPct = skill.summonHpPercent || 15;
      const addHp = Math.floor(effectiveMonsterHp * hpPct / 100);
      events.push({
        type: 'boss_summon',
        timestamp: Math.floor(t),
        sourceId: 'monster',
        targetId: 'monster',
        damage: addHp * count,
        skillName: skill.name || `Summon ${count} Adds`,
      });
      break;
    }
    case 'root': {
      const rootCount = Math.min(skill.rootTargets || 2, allTargets.length);
      const shuffled = [...allTargets].sort(() => rng() - 0.5);
      for (let i = 0; i < rootCount; i++) {
        events.push({
          type: 'boss_root',
          timestamp: Math.floor(t),
          sourceId: 'monster',
          targetId: shuffled[i].playerId,
          duration: skill.rootDuration || 3000,
          skillName: skill.name || 'Root',
        });
      }
      break;
    }
    case 'multi_target_attack': {
      if (!isPartyMode) break;
      const targetCount = Math.min(skill.multiTargetCount || 3, allTargets.length);
      const shuffledTargets = [...allTargets].sort(() => rng() - 0.5);
      for (let i = 0; i < targetCount; i++) {
        const target = shuffledTargets[i];
        const hitDmg = Math.floor(effectiveMonsterAttack * 0.4);
        events.push({
          type: 'boss_multi_attack',
          timestamp: Math.floor(t),
          sourceId: 'monster',
          targetId: target.playerId,
          damage: hitDmg,
          skillName: skill.name || 'Multi Attack',
        });
        memberHpTrack[target.playerId] = Math.max(0, (memberHpTrack[target.playerId] || 0) - hitDmg);
      }
      break;
    }
    case 'regenerate_on_no_stun': {
      const healAmount = Math.floor(effectiveMonsterHp * (skill.regenPercent || 8) / 100);
      events.push({
        type: 'boss_regenerate',
        timestamp: Math.floor(t),
        sourceId: 'monster',
        targetId: 'monster',
        healing: healAmount,
        skillName: skill.name || 'Regeneration',
      });
      break;
    }
    case 'mass_burn': {
      for (const target of allTargets) {
        const dpt = skill.massBurnDamage || Math.floor(effectiveMonsterAttack * 0.12);
        const duration = (skill.massBurnDuration || 3) * 1000;
        events.push({
          type: 'boss_mass_burn',
          timestamp: Math.floor(t),
          sourceId: 'monster',
          targetId: target.playerId,
          damagePerTick: dpt,
          duration,
          skillName: skill.name || 'Mass Burn',
        });
        memberHpTrack[target.playerId] = Math.max(0, (memberHpTrack[target.playerId] || 0) - dpt * (skill.massBurnDuration || 3));
      }
      break;
    }
    case 'mass_poison': {
      for (const target of allTargets) {
        const dpt = skill.massPoisonDamage || Math.floor(effectiveMonsterAttack * 0.10);
        const duration = (skill.massPoisonDuration || 4) * 1000;
        events.push({
          type: 'boss_mass_poison',
          timestamp: Math.floor(t),
          sourceId: 'monster',
          targetId: target.playerId,
          damagePerTick: dpt,
          duration,
          skillName: skill.name || 'Mass Poison',
        });
        memberHpTrack[target.playerId] = Math.max(0, (memberHpTrack[target.playerId] || 0) - dpt * (skill.massPoisonDuration || 4));
      }
      break;
    }
    case 'lifesteal': {
      const stealPct = (skill.lifestealPercent || 30) / 100;
      const healAmount = Math.floor(effectiveMonsterAttack * stealPct);
      events.push({
        type: 'boss_lifesteal',
        timestamp: Math.floor(t),
        sourceId: 'monster',
        targetId: 'monster',
        healing: healAmount,
        skillName: skill.name || 'Lifesteal',
      });
      break;
    }
    default: {
      processReplayNormalSkill(allTargets, events, t, effectiveMonsterAttack, effectiveMonsterHp, memberHpTrack, rng, timeToKill, monsterAttackInterval);
      break;
    }
  }
}

function processReplayNormalSkill(
  allTargets: MemberFloorInput[],
  events: DungeonReplayEvent[],
  t: number,
  effectiveMonsterAttack: number,
  effectiveMonsterHp: number,
  memberHpTrack: Record<string, number>,
  rng: () => number,
  timeToKill: number,
  monsterAttackInterval: number,
): void {
  const skillRoll = rng();
  if (skillRoll < 0.3) {
    const target = allTargets[Math.floor(rng() * allTargets.length)];
    events.push({
      type: 'skill_stun',
      timestamp: Math.floor(t),
      sourceId: 'monster',
      targetId: target.playerId,
      duration: 2000,
      skillName: 'Stun',
    });
  } else if (skillRoll < 0.55) {
    const target = allTargets[Math.floor(rng() * allTargets.length)];
    const dpt = Math.floor(effectiveMonsterAttack * 0.15);
    events.push({
      type: 'skill_poison',
      timestamp: Math.floor(t),
      sourceId: 'monster',
      targetId: target.playerId,
      damagePerTick: dpt,
      duration: 3000,
      skillName: 'Poison',
    });
  } else if (skillRoll < 0.8) {
    const defTargets = [...allTargets].sort((a, b) => b.defense - a.defense);
    const target = defTargets[0];
    events.push({
      type: 'skill_armor_break',
      timestamp: Math.floor(t),
      sourceId: 'monster',
      targetId: target.playerId,
      skillName: 'Armor Break',
    });
  } else {
    const aoeDmg = Math.floor(effectiveMonsterAttack * 0.3 * timeToKill / Math.max(1, Math.floor(timeToKill * 1000 / monsterAttackInterval)));
    for (const target of allTargets) {
      const variance2 = Math.floor(aoeDmg * 0.15 * (rng() * 2 - 1));
      events.push({
        type: 'skill_aoe',
        timestamp: Math.floor(t),
        sourceId: 'monster',
        targetId: target.playerId,
        damage: Math.max(1, aoeDmg + variance2),
        skillName: 'AoE Strike',
      });
      memberHpTrack[target.playerId] = Math.max(0, (memberHpTrack[target.playerId] || 0) - Math.max(1, aoeDmg + variance2));
    }
  }
}

function generateCombatReplay(
  aliveMembers: MemberFloorInput[],
  memberResults: MemberFloorResult[],
  input: FloorResolutionInput,
  effectiveMonsterAttack: number,
  effectiveMonsterHp: number,
  timeToKill: number,
  damageShares: Record<string, number>,
  healers: MemberFloorInput[],
  rng: () => number,
): DungeonReplayEvent[] {
  const events: DungeonReplayEvent[] = [];
  const { floor } = input;

  const monsterAttackSpeed = input.monsterAttackSpeed || 3000;
  const replayDuration = Math.min(timeToKill * 1000, 15000);
  const timeScale = replayDuration / (timeToKill * 1000);

  const memberHpTrack: Record<string, number> = {};
  for (const m of aliveMembers) {
    memberHpTrack[m.playerId] = m.currentHp;
  }
  let monsterHpTrack = effectiveMonsterHp;

  const hasTank = aliveMembers.some(m => m.role === 'tank');
  const tanks = aliveMembers.filter(m => m.role === 'tank');
  const nonTanks = aliveMembers.filter(m => m.role !== 'tank');

  const memberAttackEvents: { playerId: string; speed: number; nextAttack: number }[] = aliveMembers.map(m => ({
    playerId: m.playerId,
    speed: Math.max(500, (m.attackSpeed || 2500)) * timeScale,
    nextAttack: Math.max(200, (m.attackSpeed || 2500) * timeScale * 0.5 * rng()),
  }));

  const monsterNextAttack = { next: monsterAttackSpeed * timeScale * 0.3 };
  const monsterAttackInterval = monsterAttackSpeed * timeScale;

  const skillChance = Math.min(0.35, 0.1 + floor * 0.005);
  const poisonActive: Record<string, { endsAt: number; dpt: number }> = {};

  const rangerHitCounts: Record<string, number> = {};
  let monsterSilenced = false;
  let silenceEndsAt = 0;
  const frenzyActivated: Record<string, boolean> = {};

  let replayGuardianShieldPool = 0;
  const replayGuardians = aliveMembers.filter(m => m.weaponType === 'sword_shield');
  for (const g of replayGuardians) {
    const gPassive = DUNGEON_ROLE_PASSIVES['sword_shield'] as GuardianPassive;
    replayGuardianShieldPool += g.maxHp * gPassive.partyShieldPercent;
  }

  let t = 0;
  const maxEvents = 120;
  const tickStep = Math.max(50, Math.min(200, replayDuration / 60));
  let monsterDead = false;

  while (t < replayDuration && events.length < maxEvents && !monsterDead) {
    t += tickStep;

    if (monsterSilenced && t >= silenceEndsAt) {
      monsterSilenced = false;
    }

    for (const attacker of memberAttackEvents) {
      if (t >= attacker.nextAttack && monsterHpTrack > 0) {
        const memberResult = memberResults.find(r => r.playerId === attacker.playerId);
        if (!memberResult || !memberResult.isAlive) continue;

        const member = aliveMembers.find(m => m.playerId === attacker.playerId);
        if (!member) continue;

        const totalDmgDealt = memberResult.damageDealt;
        const estimatedHits = Math.max(1, Math.floor(timeToKill * 1000 / (member.attackSpeed || 2500)));
        let dmgPerHit = Math.floor(totalDmgDealt / estimatedHits);
        const variance = Math.floor(dmgPerHit * 0.2 * (rng() * 2 - 1));
        let hitDmg = Math.max(1, dmgPerHit + variance);

        if (member.weaponType === '2h_sword') {
          const bPassive = DUNGEON_ROLE_PASSIVES['2h_sword'] as BerserkerPassive;
          const hpRatio = (memberHpTrack[member.playerId] || 0) / member.maxHp;
          if (hpRatio < bPassive.frenzyThreshold) {
            if (!frenzyActivated[member.playerId]) {
              frenzyActivated[member.playerId] = true;
              events.push({
                type: 'frenzy_activate',
                timestamp: Math.floor(t),
                sourceId: member.playerId,
                targetId: member.playerId,
              });
            }
            hitDmg = Math.floor(hitDmg * (1 + bPassive.frenzyDpsBoost));
          }
        }

        if (member.weaponType === '2h_axe' && monsterHpTrack < effectiveMonsterHp * 0.3) {
          const exPassive = DUNGEON_ROLE_PASSIVES['2h_axe'] as ExecutionerPassive;
          const boostedDmg = Math.floor(hitDmg * (1 + exPassive.executeDmgBoost));
          events.push({
            type: 'execute_bonus',
            timestamp: Math.floor(t),
            sourceId: member.playerId,
            targetId: 'monster',
            damage: boostedDmg - hitDmg,
          });
          hitDmg = boostedDmg;
        }

        events.push({
          type: 'attack',
          timestamp: Math.floor(t),
          sourceId: attacker.playerId,
          targetId: 'monster',
          damage: hitDmg,
        });

        monsterHpTrack -= hitDmg;

        if (member.weaponType === 'bow') {
          const rPassive = DUNGEON_ROLE_PASSIVES['bow'] as RangerPassive;
          rangerHitCounts[member.playerId] = (rangerHitCounts[member.playerId] || 0) + 1;
          if (rangerHitCounts[member.playerId] >= rPassive.silenceAfterHits) {
            rangerHitCounts[member.playerId] = 0;
            if (rng() < rPassive.silenceChance && !monsterSilenced) {
              monsterSilenced = true;
              silenceEndsAt = t + monsterAttackInterval * rPassive.silenceDuration;
              events.push({
                type: 'silence',
                timestamp: Math.floor(t),
                sourceId: member.playerId,
                targetId: 'monster',
                duration: Math.floor(monsterAttackInterval * rPassive.silenceDuration),
              });
            }
          }
        }

        if (monsterHpTrack <= 0) {
          monsterDead = true;
          events.push({
            type: 'monster_death',
            timestamp: Math.floor(t) + 50,
            sourceId: 'monster',
            targetId: 'monster',
          });
          break;
        }

        attacker.nextAttack = t + attacker.speed;
      }
    }

    if (monsterDead) break;

    if (t >= monsterNextAttack.next && monsterHpTrack > 0) {
      const useSkill = rng() < skillChance;

      if (useSkill) {
        const hasWarden = aliveMembers.some(m => m.weaponType === '2h_warhammer');
        if (hasWarden) {
          const wPassive = DUNGEON_ROLE_PASSIVES['2h_warhammer'] as WardenPassive;
          if (rng() < wPassive.disruptionChance) {
            const warden = aliveMembers.find(m => m.weaponType === '2h_warhammer');
            if (!warden) continue;
            events.push({
              type: 'skill_blocked',
              timestamp: Math.floor(t),
              sourceId: warden.playerId,
              targetId: 'monster',
              skillName: 'Disruption',
            });
            monsterNextAttack.next = t + monsterAttackInterval;
            continue;
          }
        }

        if (monsterSilenced) {
          monsterNextAttack.next = t + monsterAttackInterval;
          continue;
        }

        const monsterSkills = input.monsterSkills || [];
        const allTargets = aliveMembers.filter(m => memberResults.find(r => r.playerId === m.playerId)?.isAlive);

        if (allTargets.length > 0) {
          if (monsterSkills.length > 0) {
            const eligibleSkills = monsterSkills.filter(sk => {
              if (sk.activateAtHpPercent !== undefined && sk.activateAtHpPercent > 0) {
                const hpRatio = monsterHpTrack / effectiveMonsterHp;
                return hpRatio <= sk.activateAtHpPercent / 100;
              }
              return true;
            });

            if (eligibleSkills.length > 0) {
              let selectedSkill: typeof monsterSkills[0] | null = null;
              for (const sk of eligibleSkills) {
                if (rng() * 100 < sk.chance) {
                  selectedSkill = sk;
                  break;
                }
              }

              if (selectedSkill) {
                processReplayBossSkill(selectedSkill, allTargets, events, t, effectiveMonsterAttack, effectiveMonsterHp, monsterHpTrack, memberHpTrack, memberResults, rng, input.isPartyMode ?? false, timeToKill, monsterAttackInterval);
              } else {
                processReplayNormalSkill(allTargets, events, t, effectiveMonsterAttack, effectiveMonsterHp, memberHpTrack, rng, timeToKill, monsterAttackInterval);
              }
            } else {
              processReplayNormalSkill(allTargets, events, t, effectiveMonsterAttack, effectiveMonsterHp, memberHpTrack, rng, timeToKill, monsterAttackInterval);
            }
          } else {
            processReplayNormalSkill(allTargets, events, t, effectiveMonsterAttack, effectiveMonsterHp, memberHpTrack, rng, timeToKill, monsterAttackInterval);
          }
        }
      } else {
        let target: MemberFloorInput;
        if (hasTank && rng() < 0.7 && tanks.length > 0) {
          target = tanks[Math.floor(rng() * tanks.length)];
        } else if (nonTanks.length > 0) {
          target = nonTanks[Math.floor(rng() * nonTanks.length)];
        } else {
          target = aliveMembers[Math.floor(rng() * aliveMembers.length)];
        }

        const totalMonsterDmg = effectiveMonsterAttack * timeToKill;
        const estimatedMonsterHits = Math.max(1, Math.floor(timeToKill * 1000 / monsterAttackInterval));
        const dmgPerHit = Math.floor(totalMonsterDmg / estimatedMonsterHits);
        const share = damageShares[target.playerId] || (1 / aliveMembers.length);
        let hitDmg = Math.max(1, Math.floor(dmgPerHit * share * (0.8 + rng() * 0.4)));

        if (target.weaponType === 'dagger') {
          const aPassive = DUNGEON_ROLE_PASSIVES['dagger'] as AssassinPassive;
          if (rng() < aPassive.evasionChance) {
            events.push({
              type: 'dodge',
              timestamp: Math.floor(t),
              sourceId: target.playerId,
              targetId: target.playerId,
              damage: 0,
            });
            monsterNextAttack.next = t + monsterAttackInterval;
            continue;
          }
        }

        if (replayGuardianShieldPool > 0 && target.weaponType !== 'sword_shield') {
          const absorbed = Math.min(replayGuardianShieldPool, hitDmg * 0.3);
          hitDmg = Math.max(1, Math.floor(hitDmg - absorbed));
          replayGuardianShieldPool -= absorbed;
        }

        events.push({
          type: 'monster_attack',
          timestamp: Math.floor(t),
          sourceId: 'monster',
          targetId: target.playerId,
          damage: hitDmg,
        });

        memberHpTrack[target.playerId] = Math.max(0, (memberHpTrack[target.playerId] || 0) - hitDmg);

        if (memberHpTrack[target.playerId] <= 0) {
          const result = memberResults.find(r => r.playerId === target.playerId);
          if (result && !result.isAlive) {
            events.push({
              type: 'death',
              timestamp: Math.floor(t) + 30,
              sourceId: 'monster',
              targetId: target.playerId,
            });
          }
        }
      }

      monsterNextAttack.next = t + monsterAttackInterval;
    }

    for (const [pid, poison] of Object.entries(poisonActive)) {
      if (t < poison.endsAt && Math.floor(t / (1000 * timeScale)) !== Math.floor((t - tickStep) / (1000 * timeScale))) {
        events.push({
          type: 'poison_tick',
          timestamp: Math.floor(t),
          sourceId: 'monster',
          targetId: pid,
          damage: poison.dpt,
        });
        memberHpTrack[pid] = Math.max(0, (memberHpTrack[pid] || 0) - poison.dpt);
      }
      if (t >= poison.endsAt) {
        delete poisonActive[pid];
      }
    }

    if (healers.length > 0) {
      const lowestHpMember = aliveMembers
        .filter(m => memberResults.find(r => r.playerId === m.playerId)?.isAlive)
        .sort((a, b) => (memberHpTrack[a.playerId] || 0) / a.maxHp - (memberHpTrack[b.playerId] || 0) / b.maxHp)[0];

      if (lowestHpMember && (memberHpTrack[lowestHpMember.playerId] || 0) < lowestHpMember.maxHp * 0.8) {
        const healer = healers[0];
        const healerResult = memberResults.find(r => r.playerId === healer.playerId);
        if (healerResult && healerResult.isAlive) {
          const totalHealing = healerResult.healingDone;
          const estimatedHealTicks = Math.max(1, Math.floor(timeToKill * 1000 / 3000));
          const healPerTick = Math.floor(totalHealing / estimatedHealTicks);
          if (healPerTick > 0 && rng() < 0.4) {
            events.push({
              type: 'heal',
              timestamp: Math.floor(t),
              sourceId: healer.playerId,
              targetId: lowestHpMember.playerId,
              healing: healPerTick,
            });
            memberHpTrack[lowestHpMember.playerId] = Math.min(
              lowestHpMember.maxHp,
              (memberHpTrack[lowestHpMember.playerId] || 0) + healPerTick,
            );
          }
        }
      }
    }
  }

  if (!monsterDead && monsterHpTrack > 0) {
    events.push({
      type: 'monster_death',
      timestamp: Math.floor(replayDuration),
      sourceId: 'monster',
      targetId: 'monster',
    });
  }

  events.sort((a, b) => a.timestamp - b.timestamp);
  return events;
}

export interface SoloSimulationInput {
  dungeonId: string;
  seed: string;
  playerStats: MemberFloorInput;
  monsterPool: { id: string; hp: number; attack: number; defence: number; attackSpeed: number; xpReward: number; lootTable: any[] }[];
  maxFloors: number;
  maxRunTimeMinutes: number;
  elapsedMinutes: number;
  config: DungeonV2ConfigSnapshot;
  lootTables?: { floorRangeStart: number; floorRangeEnd: number; guaranteedDrops: string[]; possibleDrops: { itemId: string; weight: number }[] }[];
}

export interface SoloSimulationResult {
  floorsCleared: number;
  lootEarned: Record<string, number>;
  goldEarned: number;
  xpEarned: number;
  durabilityLost: number;
  deathOccurred: boolean;
  diedAtFloor: number | null;
  finalRiskLevel: number;
  extractionPercent: number;
  hiddenBossEncountered: boolean;
  hiddenBossDefeated: boolean;
}

export function simulateSoloDungeon(input: SoloSimulationInput): SoloSimulationResult {
  const rng = createSeededRng(input.seed);

  let currentPlayer: MemberFloorInput = { ...input.playerStats, isAlive: true };
  let riskLevel = 0;
  let chaosMeter = 0;
  let currentMultiplier = 100;
  let activeCurses: DungeonCurse[] = [];
  let totalElapsedMs = input.elapsedMinutes * 60 * 1000;
  const maxTimeMs = input.maxRunTimeMinutes * 60 * 1000;

  let floorsCleared = 0;
  const lootEarned: Record<string, number> = {};
  let goldEarned = 0;
  let xpEarned = 0;
  let durabilityLost = 0;
  let deathOccurred = false;
  let diedAtFloor: number | null = null;
  let hiddenBossEncountered = false;
  let hiddenBossDefeated = false;
  let chaosTriggerCount = 0;

  for (let floor = 1; floor <= input.maxFloors; floor++) {
    if (totalElapsedMs >= maxTimeMs) break;
    if (!currentPlayer.isAlive) break;

    const monsterIdx = Math.floor(rng() * input.monsterPool.length);
    const monster = input.monsterPool[monsterIdx];
    if (!monster) break;

    let lootTable: DungeonLootTableInput | undefined;
    if (input.lootTables) {
      const matchingTable = input.lootTables.find(lt => floor >= lt.floorRangeStart && floor <= lt.floorRangeEnd);
      if (matchingTable) {
        lootTable = { guaranteedDrops: matchingTable.guaranteedDrops, possibleDrops: matchingTable.possibleDrops };
      }
    }

    const result = resolveFloor({
      floor,
      monsterHp: monster.hp,
      monsterAttack: monster.attack,
      monsterDefence: monster.defence,
      monsterAttackSpeed: monster.attackSpeed,
      members: [currentPlayer],
      riskLevel,
      chaosMeter,
      currentMultiplier,
      activeCurses,
      config: input.config,
      rng,
      lootTable,
    });

    totalElapsedMs += result.floorDurationMs;

    const playerResult = result.membersAfter.find(m => m.playerId === currentPlayer.playerId);
    if (!playerResult) break;

    if (!playerResult.isAlive) {
      deathOccurred = true;
      diedAtFloor = floor;
      break;
    }

    currentPlayer = {
      ...currentPlayer,
      currentHp: playerResult.currentHp,
      currentThreat: playerResult.currentThreat,
      isAlive: playerResult.isAlive,
    };

    floorsCleared++;
    riskLevel = result.newRiskLevel;
    chaosMeter = result.newChaosMeter;
    currentMultiplier = result.newMultiplier;
    activeCurses = result.newCurses;
    durabilityLost += playerResult.durabilityLoss;

    for (const [itemId, qty] of Object.entries(result.lootGenerated)) {
      lootEarned[itemId] = (lootEarned[itemId] || 0) + qty;
    }
    goldEarned += result.goldGenerated;
    xpEarned += result.xpGenerated;

    if (result.chaosTriggered) chaosTriggerCount++;

    if (result.hiddenBossTriggered) {
      hiddenBossEncountered = true;
      const bossRoll = rng();
      hiddenBossDefeated = bossRoll < 0.5;
      if (!hiddenBossDefeated) {
        deathOccurred = true;
        diedAtFloor = floor;
        break;
      }
    }
  }

  const extractionPercent = calculateExtractionPercent(riskLevel, input.config);

  return {
    floorsCleared,
    lootEarned,
    goldEarned: Math.floor(goldEarned * (extractionPercent / 100)),
    xpEarned: Math.floor(xpEarned * (extractionPercent / 100)),
    durabilityLost: Math.round(durabilityLost * 100) / 100,
    deathOccurred,
    diedAtFloor,
    finalRiskLevel: riskLevel,
    extractionPercent,
    hiddenBossEncountered,
    hiddenBossDefeated,
  };
}
