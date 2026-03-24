import type { ResolvedPlayerStats } from "./combatTypes";
import type { MonsterSkill } from "./schema";
import { computePlayerSkillExpectedDpsMod, computeMonsterSkillExpectedDps } from "./skillExpectation";
import { DeterministicRng, hashSeed } from "./deterministicRng";
import {
  COMBAT_HP_SCALE,
  RESPAWN_DELAY,
  COMBAT_STYLE_MODIFIERS,
  calculateFinalMaxHit,
  calculateFinalMinHit,
  calculateAccuracyRating,
  calculateEvasionRating,
  calculateHitChance,
  calculateDamageReduction,
  calculateMaxHit,
  calculateMinHit,
} from "./schema";

export interface OfflineCombatInput {
  playerStats: ResolvedPlayerStats;
  combatStyle: "attack" | "defence" | "balanced";

  maxPlayerHp: number;
  currentPlayerHp: number;

  weaponAttackSpeed: number;
  weaponLifesteal: number;
  weaponSkills: Array<{ chance: number; type: string; hits?: number; damageMultiplier?: number; stunCycles?: number; critMultiplier?: number; armorBreakPercent?: number }>;

  monsterMaxHp: number;
  monsterAttackLevel: number;
  monsterStrengthLevel: number;
  monsterDefenceLevel: number;
  monsterAttackBonus: number;
  monsterStrengthBonus: number;
  monsterAttackSpeed: number;
  monsterSkills: MonsterSkill[];
  monsterLoot: { itemId: string; chance: number; minQty: number; maxQty: number }[];
  monsterXpReward: { attack: number; strength: number; defence: number; hitpoints: number };
  monsterId: string;

  guildBonuses?: {
    combatPower?: number;
    defensePower?: number;
    xpBonus?: number;
    lootBonus?: number;
    goldBonus?: number;
  };

  partyBuffs?: {
    foodHealBonus: number;
    defenseBonus: number;
    attackBonus: number;
  };

  activeBuffs: Array<{
    effectType: string;
    value: number;
    remainingMs: number;
  }>;

  autoEatEnabled: boolean;
  autoEatThreshold: number;
  foodHealAmount: number;
  foodCount: number;
  foodId: string | null;

  equipmentDurability: Record<string, number>;
  equipmentSlots: string[];
}

export interface OfflineCombatResult {
  kills: number;
  deaths: number;
  xpGained: { attack: number; strength: number; defence: number; hitpoints: number };
  foodConsumed: number;
  finalPlayerHp: number;
  durabilityLost: Record<string, number>;
  expectedLoot: { itemId: string; expectedCount: number }[];
  totalDeltaUsedMs: number;
  playerDps: number;
  monsterDps: number;
  sustainPerSecond: number;
  killTimeMs: number | null;
  combatCycleMs: number | null;
}

function getBuffValue(buffs: OfflineCombatInput["activeBuffs"], effectType: string): number {
  const buff = buffs.find(b => b.effectType === effectType && b.remainingMs > 0);
  return buff?.value || 0;
}

function getBuffWeightedValue(buffs: OfflineCombatInput["activeBuffs"], effectType: string, deltaMs: number): number {
  const buff = buffs.find(b => b.effectType === effectType && b.remainingMs > 0);
  if (!buff) return 0;
  if (buff.remainingMs >= deltaMs) return buff.value;
  return buff.value * (buff.remainingMs / deltaMs);
}

function getBuffRemainingMs(buffs: OfflineCombatInput["activeBuffs"], effectType: string): number {
  const buff = buffs.find(b => b.effectType === effectType && b.remainingMs > 0);
  return buff?.remainingMs || 0;
}


interface MicroSimParams {
  playerMinHit: number;
  playerMaxHit: number;
  playerHitChancePct: number;
  critChancePct: number;
  critMultiplier: number;
  weaponSpeed: number;
  weaponSkills: OfflineCombatInput["weaponSkills"];
  lifestealFrac: number;
  onHitHealFrac: number;
  maxHp: number;
  totalDR: number;
  monsterMaxHp: number;
  monsterMinHit: number;
  monsterMaxHit: number;
  monsterHitChancePct: number;
  monsterSpeed: number;
  monsterSkills: MonsterSkill[];
  autoEatEnabled: boolean;
  autoEatThreshold: number;
  healPerFood: number;
  monsterEvasionBonus: number;
  magicShieldPercent: number;
  reflectPercent: number;
  flatReflect: number;
  regenPercent: number;
  armorRepairPerTurn: number;
  armorRepairCap: number;
  playerHasSkillDmgBonus: boolean;
  hasPoisonImmunity: boolean;
}

interface MicroCycleResult {
  cycleTimeMs: number;
  monsterKilled: boolean;
  playerDied: boolean;
  hitsTaken: number;
  damageTaken: number;
  healingDone: number;
  foodUsed: number;
  endingHp: number;
  endDAcc: number;
}

interface MicroDebuff {
  type: string;
  expiresAtMs: number;
  dotDamage: number;
  stackCount: number;
  stunCyclesRemaining: number;
  armorBreakPercent: number;
}

const MAX_MICRO_EVENTS = 200;
const MICRO_SIM_CYCLES = 30;
const MULTI_KILL_CHAINS = 5;
const CHAIN_LENGTH = 2000;
const DEBUFF_TICK_MS = 1000;

function simulateOneMicroCycle(p: MicroSimParams, rng: DeterministicRng, startHp?: number, startDAcc?: number): MicroCycleResult {
  let playerHp = startHp !== undefined ? startHp : p.maxHp;
  let monsterHp = p.monsterMaxHp;
  let pAcc = 0, mAcc = 0, dAcc = startDAcc || 0;
  let simTime = 0;
  let eventCount = 0;
  let hitsTaken = 0, damageTaken = 0, healingDone = 0, foodUsed = 0;
  let armorRepairStacks = 0;
  let monsterStunCycles = 0;
  const debuffs: MicroDebuff[] = [];

  function getArmorBreakFrac(): number {
    let max = 0;
    for (const d of debuffs) {
      if (d.type === "armor_break" && simTime < d.expiresAtMs) {
        const frac = d.armorBreakPercent / 100;
        if (frac > max) max = frac;
      }
    }
    return max;
  }

  function getStunCycles(): number {
    for (const d of debuffs) {
      if (d.type === "stun" && d.stunCyclesRemaining > 0) return d.stunCyclesRemaining;
    }
    return 0;
  }

  function decrementStun(): void {
    for (let i = debuffs.length - 1; i >= 0; i--) {
      if (debuffs[i].type === "stun" && debuffs[i].stunCyclesRemaining > 0) {
        debuffs[i].stunCyclesRemaining--;
        if (debuffs[i].stunCyclesRemaining <= 0) debuffs.splice(i, 1);
        return;
      }
    }
  }

  function processDebuffTickMicro(): void {
    let dotDmg = 0;
    for (let i = debuffs.length - 1; i >= 0; i--) {
      if (simTime >= debuffs[i].expiresAtMs) {
        debuffs.splice(i, 1);
        continue;
      }
      if (debuffs[i].dotDamage > 0) {
        const ab = getArmorBreakFrac();
        const effDR = p.totalDR * (1 - ab);
        const drReduction = Math.min(0.5, effDR * 0.5);
        const dmg = Math.max(1, Math.floor(debuffs[i].dotDamage * debuffs[i].stackCount * (1 - drReduction)));
        dotDmg += dmg;
      }
    }
    if (dotDmg > 0) {
      playerHp -= dotDmg;
      damageTaken += dotDmg;
    }
  }

  function addDebuff(type: string, expiresAtMs: number, opts: Partial<MicroDebuff>): void {
    const nd: MicroDebuff = {
      type,
      expiresAtMs,
      dotDamage: opts.dotDamage || 0,
      stackCount: opts.stackCount || 1,
      stunCyclesRemaining: opts.stunCyclesRemaining || 0,
      armorBreakPercent: opts.armorBreakPercent || 0,
    };
    if (type === "poison") {
      const existing = debuffs.find(d => d.type === "poison" && simTime < d.expiresAtMs);
      if (existing) {
        existing.stackCount = Math.min(existing.stackCount + 1, 5);
        existing.expiresAtMs = Math.max(existing.expiresAtMs, expiresAtMs);
        return;
      }
    }
    const filtered = debuffs.filter(d => d.type !== type || type === "poison");
    debuffs.length = 0;
    debuffs.push(...filtered, nd);
  }

  function tryAutoEat(): void {
    if (!p.autoEatEnabled || p.healPerFood <= 0) return;
    while (playerHp <= 0) {
      playerHp += p.healPerFood;
      foodUsed++;
      healingDone += p.healPerFood;
    }
    playerHp = Math.min(p.maxHp, playerHp);
    const hpPct = (playerHp / p.maxHp) * 100;
    if (hpPct <= p.autoEatThreshold) {
      const needed = p.maxHp - playerHp;
      const count = Math.ceil(needed / p.healPerFood);
      if (count > 0) {
        const heal = Math.min(count * p.healPerFood, needed);
        playerHp = Math.min(p.maxHp, playerHp + heal);
        foodUsed += count;
        healingDone += heal;
      }
    }
  }

  while (eventCount < MAX_MICRO_EVENTS && monsterHp > 0 && playerHp > 0) {
    const tp = Math.max(0, p.weaponSpeed - pAcc);
    const tm = Math.max(0, p.monsterSpeed - mAcc);
    const hasDebuffs = debuffs.length > 0;
    const td = hasDebuffs ? Math.max(1, DEBUFF_TICK_MS - (dAcc % DEBUFF_TICK_MS || DEBUFF_TICK_MS)) : 1e9;

    const dt = Math.max(1, Math.min(tp, tm, td));
    simTime += dt;
    pAcc += dt;
    mAcc += dt;
    dAcc += dt;

    while (dAcc >= DEBUFF_TICK_MS && debuffs.length > 0) {
      dAcc -= DEBUFF_TICK_MS;
      processDebuffTickMicro();
      if (playerHp <= 0) {
        tryAutoEat();
        if (playerHp <= 0) {
          return { cycleTimeMs: simTime, monsterKilled: false, playerDied: true, hitsTaken, damageTaken, healingDone, foodUsed, endingHp: 0, endDAcc: dAcc };
        }
      }
    }

    const pReady = pAcc >= p.weaponSpeed;
    const mReady = mAcc >= p.monsterSpeed;

    if (pReady) {
      eventCount++;
      pAcc -= p.weaponSpeed;

      if (getStunCycles() > 0) {
        decrementStun();
      } else {
        const effectiveHitChance = armorRepairStacks > 0
          ? Math.max(5, p.playerHitChancePct - armorRepairStacks * 0.3)
          : p.playerHitChancePct;
        if (rng.chance(effectiveHitChance)) {
        let dmg = rng.nextInt(p.playerMinHit, p.playerMaxHit);
        let isCrit = p.critChancePct > 0 && rng.chance(p.critChancePct);
        let skillUsed = false;
        let isArmorBreakSkill = false;

        for (const sk of p.weaponSkills) {
          if (rng.chance(sk.chance)) {
            skillUsed = true;
            if (sk.type === "armor_break") isArmorBreakSkill = true;
            if (sk.type === "critical") {
              isCrit = true;
              dmg = Math.floor(dmg * (sk.damageMultiplier || 2.0));
            } else if (sk.type === "combo" && sk.hits) {
              dmg = Math.floor(dmg * sk.hits * (sk.damageMultiplier || 1.0));
            } else if (sk.type === "stun" && sk.stunCycles) {
              monsterStunCycles = sk.stunCycles;
            } else if (sk.type === "slow_crit") {
              isCrit = true;
              dmg = Math.floor(dmg * (sk.critMultiplier || 1.5));
              monsterStunCycles = 1;
            }
            break;
          }
        }

        if (isArmorBreakSkill && armorRepairStacks > 0) {
          armorRepairStacks = 0;
        }

        if (!skillUsed && isCrit) {
          dmg = Math.floor(dmg * p.critMultiplier);
        }

        if (p.magicShieldPercent > 0 && !p.playerHasSkillDmgBonus) {
          dmg = Math.max(1, Math.floor(dmg * (1 - p.magicShieldPercent / 100)));
        }

        monsterHp = Math.max(0, monsterHp - dmg);

        if ((p.reflectPercent > 0 || p.flatReflect > 0) && dmg > 0) {
          const rawReflected = Math.max(1, Math.floor(dmg * p.reflectPercent / 100)) + p.flatReflect;
          const reflectCap = Math.floor(p.maxHp * 0.12);
          const reflected = Math.min(rawReflected, reflectCap);
          playerHp -= reflected;
          damageTaken += reflected;
          if (playerHp <= 0) {
            tryAutoEat();
            if (playerHp <= 0) {
              return { cycleTimeMs: simTime, monsterKilled: false, playerDied: true, hitsTaken, damageTaken, healingDone, foodUsed, endingHp: 0, endDAcc: dAcc };
            }
          }
        }

        if (p.lifestealFrac > 0 && playerHp < p.maxHp) {
          const heal = Math.floor(dmg * p.lifestealFrac);
          if (heal > 0) { playerHp = Math.min(p.maxHp, playerHp + heal); healingDone += heal; }
        }
        if (p.onHitHealFrac > 0 && dmg > 0) {
          const heal = Math.floor(dmg * p.onHitHealFrac);
          if (heal > 0) { playerHp = Math.min(p.maxHp, playerHp + heal); healingDone += heal; }
        }

        if (monsterHp <= 0) break;
      }
      }
    }

    if (mReady && monsterHp > 0 && playerHp > 0) {
      eventCount++;
      mAcc -= p.monsterSpeed;

      if (monsterStunCycles > 0) {
        monsterStunCycles--;
        if (p.armorRepairPerTurn > 0 && armorRepairStacks < p.armorRepairCap) {
          armorRepairStacks = Math.min(p.armorRepairCap, armorRepairStacks + p.armorRepairPerTurn);
        }
        continue;
      }

      if (p.regenPercent > 0 && monsterHp < p.monsterMaxHp) {
        const healAmt = Math.floor(p.monsterMaxHp * p.regenPercent / 100);
        if (healAmt > 0) monsterHp = Math.min(p.monsterMaxHp, monsterHp + healAmt);
      }
      if (p.armorRepairPerTurn > 0 && armorRepairStacks < p.armorRepairCap) {
        armorRepairStacks = Math.min(p.armorRepairCap, armorRepairStacks + p.armorRepairPerTurn);
      }

      if (rng.chance(p.monsterHitChancePct)) {
        const ab = getArmorBreakFrac();
        const effDR = p.totalDR * (1 - ab);
        let damage = 0;
        let skillTriggered = false;

        for (const skill of p.monsterSkills) {
          if (rng.chance(skill.chance)) {
            skillTriggered = true;
            switch (skill.type) {
              case "critical":
                damage = Math.max(1, Math.floor(p.monsterMaxHit * (1 - effDR)));
                break;
              case "combo": {
                const hits = skill.hits || 3;
                for (let i = 0; i < hits; i++) {
                  damage += Math.max(1, Math.floor(rng.nextInt(p.monsterMinHit, p.monsterMaxHit) * (1 - effDR)));
                }
                break;
              }
              case "stun": {
                damage = Math.max(1, Math.floor(rng.nextInt(p.monsterMinHit, p.monsterMaxHit) * (1 - effDR)));
                addDebuff("stun", simTime + 60000, { stunCyclesRemaining: skill.stunDuration || 1 });
                break;
              }
              case "poison": {
                damage = Math.max(1, Math.floor(rng.nextInt(p.monsterMinHit, p.monsterMaxHit) * (1 - effDR)));
                if (!p.hasPoisonImmunity) {
                  addDebuff("poison", simTime + (skill.dotDuration || 5) * 1000, {
                    dotDamage: (skill.dotDamage || 5) * COMBAT_HP_SCALE,
                    stackCount: 1,
                  });
                }
                break;
              }
              case "burn": {
                damage = Math.max(1, Math.floor(rng.nextInt(p.monsterMinHit, p.monsterMaxHit) * (1 - effDR)));
                addDebuff("burn", simTime + (skill.dotDuration || 3) * 1000, {
                  dotDamage: (skill.dotDamage || 8) * COMBAT_HP_SCALE,
                });
                break;
              }
              case "armor_break": {
                damage = Math.max(1, Math.floor(rng.nextInt(p.monsterMinHit, p.monsterMaxHit) * (1 - effDR)));
                addDebuff("armor_break", simTime + (skill.armorBreakDuration || 5) * 1000, {
                  armorBreakPercent: skill.armorBreakPercent || 30,
                });
                break;
              }
              case "enrage": {
                const threshold = skill.enrageThreshold || 30;
                if ((monsterHp / p.monsterMaxHp) * 100 <= threshold) {
                  damage = Math.floor(p.monsterMaxHit * 1.5 * (1 - effDR));
                } else {
                  skillTriggered = false;
                }
                break;
              }
              default:
                skillTriggered = false;
            }
            if (skillTriggered) break;
          }
        }

        if (!skillTriggered) {
          damage = Math.max(1, Math.floor(rng.nextInt(p.monsterMinHit, p.monsterMaxHit) * (1 - effDR)));
        }

        hitsTaken++;
        playerHp -= damage;
        damageTaken += damage;

        if (playerHp <= 0) {
          tryAutoEat();
          if (playerHp <= 0) {
            return { cycleTimeMs: simTime, monsterKilled: false, playerDied: true, hitsTaken, damageTaken, healingDone, foodUsed, endingHp: 0, endDAcc: dAcc };
          }
        } else if (p.autoEatEnabled && p.healPerFood > 0) {
          const hpPct = (playerHp / p.maxHp) * 100;
          if (hpPct <= p.autoEatThreshold) {
            const needed = p.maxHp - playerHp;
            const count = Math.ceil(needed / p.healPerFood);
            if (count > 0) {
              const heal = Math.min(count * p.healPerFood, needed);
              playerHp = Math.min(p.maxHp, playerHp + heal);
              foodUsed += count;
              healingDone += heal;
            }
          }
        }
      }
    }
  }

  if (monsterHp <= 0) {
    return { cycleTimeMs: simTime + RESPAWN_DELAY, monsterKilled: true, playerDied: false, hitsTaken, damageTaken, healingDone, foodUsed, endingHp: playerHp, endDAcc: dAcc };
  }

  const progress = p.monsterMaxHp > 0 ? Math.max(0.01, 1 - monsterHp / p.monsterMaxHp) : 0.01;
  return {
    cycleTimeMs: (simTime / progress) + RESPAWN_DELAY,
    monsterKilled: true,
    playerDied: false,
    hitsTaken: Math.ceil(hitsTaken / progress),
    damageTaken: Math.ceil(damageTaken / progress),
    healingDone: Math.ceil(healingDone / progress),
    foodUsed: Math.ceil(foodUsed / progress),
    endingHp: playerHp,
    endDAcc: dAcc,
  };
}

interface ChainResult {
  kills: number;
  deaths: number;
  totalTimeMs: number;
  totalFoodUsed: number;
  totalHitsTaken: number;
}

function simulateKillChain(p: MicroSimParams, rng: DeterministicRng, chainLength: number): ChainResult {
  let currentHp = p.maxHp;
  let currentDAcc = 0;
  let totalKills = 0;
  let totalDeaths = 0;
  let totalTimeMs = 0;
  let totalFoodUsed = 0;
  let totalHitsTaken = 0;

  for (let i = 0; i < chainLength; i++) {
    const cycleRng = new DeterministicRng(rng.nextInt(0, 999999999));
    const result = simulateOneMicroCycle(p, cycleRng, currentHp, currentDAcc);
    totalTimeMs += result.cycleTimeMs;
    totalHitsTaken += result.hitsTaken;
    totalFoodUsed += result.foodUsed;
    currentDAcc = result.endDAcc;

    if (result.monsterKilled) {
      totalKills++;
      currentHp = result.endingHp;
    } else {
      totalDeaths++;
      currentHp = p.maxHp;
      totalTimeMs += RESPAWN_DELAY;
    }
  }

  return { kills: totalKills, deaths: totalDeaths, totalTimeMs, totalFoodUsed, totalHitsTaken };
}

export function simulateOfflineCombat(
  input: OfflineCombatInput,
  deltaMs: number
): OfflineCombatResult {
  if (deltaMs <= 0) {
    return {
      kills: 0, deaths: 0,
      xpGained: { attack: 0, strength: 0, defence: 0, hitpoints: 0 },
      foodConsumed: 0, finalPlayerHp: input.currentPlayerHp,
      durabilityLost: {}, expectedLoot: [],
      totalDeltaUsedMs: 0, playerDps: 0, monsterDps: 0,
      sustainPerSecond: 0, killTimeMs: null, combatCycleMs: null,
    };
  }

  const ps = input.playerStats;
  const style = COMBAT_STYLE_MODIFIERS[input.combatStyle];

  const attackBoostPercent = getBuffWeightedValue(input.activeBuffs, "attack_boost", deltaMs);
  const strengthBoostPercent = getBuffWeightedValue(input.activeBuffs, "strength_boost", deltaMs);
  const defenceBoostPercent = getBuffWeightedValue(input.activeBuffs, "defence_boost", deltaMs);
  const critChanceBuff = getBuffWeightedValue(input.activeBuffs, "crit_chance", deltaMs);
  const drBuff = getBuffWeightedValue(input.activeBuffs, "damage_reduction", deltaMs);
  const hpRegenValue = getBuffWeightedValue(input.activeBuffs, "hp_regen", deltaMs);
  const xpBoostPercent = getBuffWeightedValue(input.activeBuffs, "xp_boost", deltaMs);
  const lifestealBuff = getBuffWeightedValue(input.activeBuffs, "lifesteal", deltaMs);
  const maxHpBoostPercent = getBuffValue(input.activeBuffs, "maxHpBoost");

  const guildCombatMod = 1 + ((input.guildBonuses?.combatPower || 0) / 100);
  const guildDefenseMod = 1 + ((input.guildBonuses?.defensePower || 0) / 100);
  const guildXpBonus = (input.guildBonuses?.xpBonus || 0);
  const guildLootBonus = (input.guildBonuses?.lootBonus || 0);
  const guildGoldBonus = (input.guildBonuses?.goldBonus || 0);

  const partyDpsMod = 1;
  const partyDefenseMod = 1 + (input.partyBuffs?.defenseBonus || 0) + (ps.partyDefenceBuff / 100);
  const partyFoodHealBonus = input.partyBuffs?.foodHealBonus || 0;

  let effectiveMaxHp = input.maxPlayerHp;
  if (maxHpBoostPercent > 0) {
    effectiveMaxHp = Math.floor(effectiveMaxHp * (1 + maxHpBoostPercent / 100));
  }

  // === PLAYER OFFENSE (stacking: base → buff → style → guild → party) ===
  const baseMaxHit = calculateFinalMaxHit(ps.strengthLevel, ps.strengthBonus, input.monsterDefenceLevel) * COMBAT_HP_SCALE;
  const baseMinHit = calculateFinalMinHit(ps.strengthLevel, ps.strengthBonus, input.monsterDefenceLevel) * COMBAT_HP_SCALE;
  const playerMaxHit = Math.floor(baseMaxHit * (1 + strengthBoostPercent / 100) * style.damageMod * guildCombatMod * partyDpsMod);
  const playerMinHit = Math.floor(baseMinHit * (1 + strengthBoostPercent / 100) * style.damageMod * guildCombatMod * partyDpsMod);
  const avgPlayerHit = (playerMinHit + playerMaxHit) / 2;

  const playerPower = ps.attackLevel + ps.strengthLevel + ps.attackBonus + ps.strengthBonus;
  const effectiveMonsterDef = Math.max(input.monsterDefenceLevel, 1);
  const powerRatio = playerPower / effectiveMonsterDef;
  const powerRatioMod = Math.max(0.8, Math.min(1.2, 0.8 + (powerRatio - 0.5) * 0.267));

  const baseAccuracy = calculateAccuracyRating(ps.attackLevel, ps.attackBonus);
  const playerAccuracy = Math.floor(baseAccuracy * (1 + attackBoostPercent / 100) * style.accuracyMod * powerRatioMod);
  let baseMonsterEvasionBonus = 0;
  for (const sk of input.monsterSkills) {
    if (sk.type === "evasion_aura" && sk.evasionBonus) baseMonsterEvasionBonus += sk.evasionBonus;
  }
  const monsterEvasion = calculateEvasionRating(input.monsterDefenceLevel, baseMonsterEvasionBonus);
  const playerHitChance = calculateHitChance(playerAccuracy, monsterEvasion) / 100;

  const totalCritChance = Math.min(0.50, (ps.critChance + critChanceBuff) / 100);
  const critMultiplier = 1.5 + (ps.critDamage / 100);

  const totalLifestealPercent = (input.weaponLifesteal + lifestealBuff) / 100;
  const onHitHealPercent = ps.onHitHealingPercent / 100;

  const weaponAtkSpeed = Math.max(input.weaponAttackSpeed, 500);

  const weaponSkillMod = computePlayerSkillExpectedDpsMod(input.weaponSkills, totalCritChance * 100, critMultiplier);

  const expectedDamagePerHit = avgPlayerHit * (1 + totalCritChance * (critMultiplier - 1)) * weaponSkillMod;
  const expectedDamagePerAttempt = expectedDamagePerHit * playerHitChance;

  const effectivePlayerDps = expectedDamagePerAttempt * (1000 / weaponAtkSpeed);

  const effectiveMonsterHp = input.monsterMaxHp;

  // === MONSTER DEFENSE ===
  const monsterMaxHitDmg = calculateMaxHit(input.monsterStrengthLevel, input.monsterStrengthBonus) * COMBAT_HP_SCALE;
  const monsterMinHitDmg = calculateMinHit(input.monsterStrengthLevel, input.monsterStrengthBonus) * COMBAT_HP_SCALE;
  const avgMonsterHit = (monsterMinHitDmg + monsterMaxHitDmg) / 2;

  const baseEvasion = calculateEvasionRating(ps.defenceLevel, ps.defenceBonus);
  const playerEvasionRating = Math.floor(baseEvasion * (1 + defenceBoostPercent / 100) * style.defenceMod);
  const monsterAccuracy = calculateAccuracyRating(input.monsterAttackLevel, input.monsterAttackBonus);
  const monsterHitChance = calculateHitChance(monsterAccuracy, playerEvasionRating) / 100;

  const playerTotalDefense = Math.floor((ps.defenceLevel + ps.defenceBonus) * (1 + defenceBoostPercent / 100) * style.defenceMod * guildDefenseMod * partyDefenseMod);
  const baseDR = calculateDamageReduction(playerTotalDefense);
  const totalDR = Math.min(0.85, Math.min(0.75, baseDR) + (drBuff / 100));

  const avgMonsterDmgAfterDR = Math.max(1, Math.floor(avgMonsterHit * (1 - totalDR)));
  const monsterAttackIntervalMs = input.monsterAttackSpeed;
  const monsterAttacksPerSecond = 1000 / monsterAttackIntervalMs;

  // === MONSTER SKILL ANALYSIS ===
  const skillAnalysis = computeMonsterSkillExpectedDps(
    input.monsterSkills,
    avgMonsterDmgAfterDR * monsterHitChance * monsterAttacksPerSecond,
    monsterAttackIntervalMs,
    COMBAT_HP_SCALE
  );

  // === DISCRETE SURVIVAL MODEL ===
  // Damage per monster attack cycle (discrete burst, not continuous)
  const monsterDamagePerHit = avgMonsterDmgAfterDR * monsterHitChance;

  // DoT and extra skill damage per monster attack cycle
  let dotDamagePerMonsterCycle = 0;
  let armorBreakExtraDamagePerCycle = 0;
  const analyticalPoisonImmunity = getBuffRemainingMs(input.activeBuffs, "poison_immunity") > 0;
  for (const skill of input.monsterSkills) {
    const triggerChance = skill.chance / 100;
    switch (skill.type) {
      case "poison": {
        if (!analyticalPoisonImmunity) {
          const rawDotDmg = (skill.dotDamage || 0) * COMBAT_HP_SCALE;
          const dotDmgAfterDR = Math.max(1, Math.floor(rawDotDmg * (1 - totalDR * 0.5)));
          const dotDur = skill.dotDuration || 3;
          dotDamagePerMonsterCycle += triggerChance * dotDmgAfterDR * dotDur;
        }
        break;
      }
      case "burn": {
        const rawDotDmg = (skill.dotDamage || 0) * COMBAT_HP_SCALE;
        const dotDmgAfterDR = Math.max(1, Math.floor(rawDotDmg * (1 - totalDR * 0.5)));
        const dotDur = skill.dotDuration || 3;
        dotDamagePerMonsterCycle += triggerChance * dotDmgAfterDR * dotDur;
        break;
      }
      case "critical":
        armorBreakExtraDamagePerCycle += triggerChance * monsterDamagePerHit * 0.5;
        break;
      case "combo": {
        const hits = skill.hits || 2;
        armorBreakExtraDamagePerCycle += triggerChance * monsterDamagePerHit * (hits - 1) * 0.3;
        break;
      }
      case "armor_break": {
        const abPercent = (skill.armorBreakPercent || 30) / 100;
        const abDuration = (skill.armorBreakDuration || 5);
        const attacksDuringAb = 1 + Math.floor(abDuration * 1000 / monsterAttackIntervalMs);
        const rawAvgMonsterHit = avgMonsterHit;
        const extraDmgPerAttack = rawAvgMonsterHit * totalDR * abPercent * monsterHitChance;
        armorBreakExtraDamagePerCycle += triggerChance * extraDmgPerAttack * attacksDuringAb;
        break;
      }
      case "enrage":
        armorBreakExtraDamagePerCycle += monsterDamagePerHit * 0.1;
        break;
    }
  }

  const totalDamagePerMonsterCycle = monsterDamagePerHit + dotDamagePerMonsterCycle + armorBreakExtraDamagePerCycle;
  const totalMonsterDps = totalDamagePerMonsterCycle * monsterAttacksPerSecond;

  // === SUSTAIN ===
  const regenPerSecond = hpRegenValue;
  const lifestealHealPerSecond = effectivePlayerDps * (totalLifestealPercent + onHitHealPercent);

  let foodHealPerSecond = 0;
  let foodConsumptionRate = 0;
  if (input.autoEatEnabled && input.foodCount > 0 && input.foodHealAmount > 0) {
    const healPerFood = Math.floor(input.foodHealAmount * (1 + partyFoodHealBonus));
    const netDamagePerSecond = Math.max(0, totalMonsterDps - regenPerSecond - lifestealHealPerSecond);
    if (netDamagePerSecond > 0) {
      foodConsumptionRate = netDamagePerSecond / healPerFood;
      foodHealPerSecond = foodConsumptionRate * healPerFood;
    }
  }

  const sustainPerSecond = regenPerSecond + lifestealHealPerSecond + foodHealPerSecond;

  // === EARLY EXITS ===
  if (!Number.isFinite(expectedDamagePerAttempt) || expectedDamagePerAttempt <= 0.0001) {
    return {
      kills: 0, deaths: 0,
      xpGained: { attack: 0, strength: 0, defence: 0, hitpoints: 0 },
      foodConsumed: 0, finalPlayerHp: input.currentPlayerHp,
      durabilityLost: {}, expectedLoot: [],
      totalDeltaUsedMs: deltaMs, playerDps: 0, monsterDps: totalMonsterDps,
      sustainPerSecond, killTimeMs: null, combatCycleMs: null,
    };
  }

  if (input.monsterMaxHp <= 0) {
    return {
      kills: 0, deaths: 0,
      xpGained: { attack: 0, strength: 0, defence: 0, hitpoints: 0 },
      foodConsumed: 0, finalPlayerHp: input.currentPlayerHp,
      durabilityLost: {}, expectedLoot: [],
      totalDeltaUsedMs: deltaMs, playerDps: effectivePlayerDps, monsterDps: totalMonsterDps,
      sustainPerSecond, killTimeMs: null, combatCycleMs: null,
    };
  }

  // === MICRO-SIM KILL/DEATH MODEL ===
  const playerHitChancePct = calculateHitChance(playerAccuracy, monsterEvasion);
  const critChancePct = Math.min(50, ps.critChance + critChanceBuff);
  const healPerFood = (input.autoEatEnabled && input.foodCount > 0 && input.foodHealAmount > 0)
    ? Math.floor(input.foodHealAmount * (1 + partyFoodHealBonus))
    : 0;

  let microMonsterEvasionBonus = 0;
  let microMagicShieldPercent = 0;
  let microReflectPercent = 0;
  let microFlatReflect = 0;
  let microRegenPercent = 0;
  let microArmorRepairPerTurn = 0;
  let microArmorRepairCap = 0;
  for (const sk of input.monsterSkills) {
    if (sk.type === "evasion_aura" && sk.evasionBonus) microMonsterEvasionBonus += sk.evasionBonus;
    if (sk.type === "magic_shield" && sk.magicShieldPercent) microMagicShieldPercent = sk.magicShieldPercent;
    if (sk.type === "reflect_damage" && sk.reflectPercent) { microReflectPercent = sk.reflectPercent; microFlatReflect = sk.flatReflect || 0; }
    if (sk.type === "regenerate_on_no_stun" && sk.selfHealPercent) microRegenPercent = sk.selfHealPercent;
    if (sk.type === "armor_repair" && sk.armorRepairPerTurn) {
      microArmorRepairPerTurn = sk.armorRepairPerTurn;
      microArmorRepairCap = sk.armorRepairCap || 100;
    }
  }

  const baseSeed = hashSeed(`${input.monsterId}_${weaponAtkSpeed}_${input.monsterAttackSpeed}_${input.monsterMaxHp}`);
  const microParams: MicroSimParams = {
    playerMinHit: playerMinHit,
    playerMaxHit: playerMaxHit,
    playerHitChancePct,
    critChancePct,
    critMultiplier,
    weaponSpeed: weaponAtkSpeed,
    weaponSkills: input.weaponSkills,
    lifestealFrac: totalLifestealPercent,
    onHitHealFrac: onHitHealPercent,
    maxHp: effectiveMaxHp,
    totalDR,
    monsterMaxHp: input.monsterMaxHp,
    monsterMinHit: monsterMinHitDmg,
    monsterMaxHit: monsterMaxHitDmg,
    monsterHitChancePct: calculateHitChance(monsterAccuracy, playerEvasionRating),
    monsterSpeed: monsterAttackIntervalMs,
    monsterSkills: input.monsterSkills,
    autoEatEnabled: input.autoEatEnabled,
    autoEatThreshold: input.autoEatThreshold,
    healPerFood,
    monsterEvasionBonus: microMonsterEvasionBonus,
    magicShieldPercent: microMagicShieldPercent,
    reflectPercent: microReflectPercent,
    flatReflect: microFlatReflect,
    regenPercent: microRegenPercent,
    armorRepairPerTurn: microArmorRepairPerTurn,
    armorRepairCap: microArmorRepairCap,
    playerHasSkillDmgBonus: (input.playerStats.skillDamageBonus || 0) > 0,
    hasPoisonImmunity: getBuffRemainingMs(input.activeBuffs, "poison_immunity") > 0,
  };

  let sumCycleTime = 0, sumHitsTaken = 0, sumNetDamage = 0, sumFoodUsed = 0;
  let killCycleCount = 0, deathCycleCount = 0, sumDeathTime = 0;

  for (let i = 0; i < MICRO_SIM_CYCLES; i++) {
    const cycleRng = new DeterministicRng(baseSeed + i * 7919);
    const result = simulateOneMicroCycle(microParams, cycleRng);
    if (result.monsterKilled) {
      killCycleCount++;
      sumCycleTime += result.cycleTimeMs;
      sumHitsTaken += result.hitsTaken;
      sumNetDamage += Math.max(0, result.damageTaken - result.healingDone);
      sumFoodUsed += result.foodUsed;
    } else {
      deathCycleCount++;
      sumDeathTime += result.cycleTimeMs;
    }
  }

  let kills: number;
  let deaths: number;
  let foodConsumed: number;
  let finalPlayerHp: number;
  let combatCycleMs: number | null = null;
  let killTimeMs: number | null = null;
  let chainHitsTakenTotal = 0;
  let chainTimeMsTotal = 0;

  if (killCycleCount === 0) {
    if (deathCycleCount > 0) {
      const avgDeathTime = sumDeathTime / deathCycleCount + RESPAWN_DELAY;
      deaths = Math.floor(deltaMs / avgDeathTime);
      kills = 0;
    } else {
      kills = 0;
      deaths = 0;
    }
    foodConsumed = 0;
    finalPlayerHp = effectiveMaxHp;
  } else {
    const avgCycleTime = sumCycleTime / killCycleCount;
    const avgHitsTaken = sumHitsTaken / killCycleCount;
    const avgNetDamage = sumNetDamage / killCycleCount;
    const avgFoodPerKill = sumFoodUsed / killCycleCount;

    combatCycleMs = avgCycleTime;
    killTimeMs = avgCycleTime - RESPAWN_DELAY;

    let chainKills = 0, chainDeaths = 0, chainTimeMs = 0, chainFoodUsed = 0;
    chainHitsTakenTotal = 0;
    for (let c = 0; c < MULTI_KILL_CHAINS; c++) {
      const chainRng = new DeterministicRng(baseSeed + 100000 + c * 31337);
      const chainResult = simulateKillChain(microParams, chainRng, CHAIN_LENGTH);
      chainKills += chainResult.kills;
      chainDeaths += chainResult.deaths;
      chainTimeMs += chainResult.totalTimeMs;
      chainFoodUsed += chainResult.totalFoodUsed;
      chainHitsTakenTotal += chainResult.totalHitsTaken;
    }
    chainTimeMsTotal = chainTimeMs;

    const totalChainEvents = chainKills + chainDeaths;
    const chainDeathRate = totalChainEvents > 0 ? chainDeaths / totalChainEvents : 0;
    const chainKillsPerMs = chainTimeMs > 0 ? chainKills / chainTimeMs : 0;
    const chainDeathsPerMs = chainTimeMs > 0 ? chainDeaths / chainTimeMs : 0;

    const totalSeconds = deltaMs / 1000;
    const killTimeSeconds = Math.max(0, (avgCycleTime - RESPAWN_DELAY)) / 1000;

    if (chainDeathRate >= 0.5) {
      deaths = Math.round(chainDeathsPerMs * deltaMs);
      kills = Math.round(chainKillsPerMs * deltaMs);
      foodConsumed = 0;
      finalPlayerHp = Math.max(1, Math.floor(effectiveMaxHp * 0.5));
    } else {
      kills = chainDeathRate > 0
        ? Math.round(chainKillsPerMs * deltaMs)
        : Math.floor(deltaMs / avgCycleTime);
      deaths = chainDeathRate > 0
        ? Math.round(chainDeathsPerMs * deltaMs)
        : 0;

      const chainFoodPerKill = chainKills > 0 ? chainFoodUsed / chainKills : avgFoodPerKill;
      foodConsumed = Math.round(chainFoodPerKill * kills);

      foodConsumed = Math.min(foodConsumed, input.foodCount);
      finalPlayerHp = effectiveMaxHp;
    }
  }

  kills = Math.max(0, kills);
  deaths = Math.max(0, deaths);
  foodConsumed = Math.max(0, foodConsumed);
  finalPlayerHp = Math.min(effectiveMaxHp, Math.max(1, finalPlayerHp));
  kills = Number.isFinite(kills) ? kills : 0;
  deaths = Number.isFinite(deaths) ? deaths : 0;
  foodConsumed = Number.isFinite(foodConsumed) ? foodConsumed : 0;

  const xpMultiplier = 1 + (xpBoostPercent / 100) + (guildXpBonus / 100);
  const baseXp = (input.monsterXpReward.attack || 0) + (input.monsterXpReward.strength || 0) + (input.monsterXpReward.defence || 0);
  const xpDist = input.combatStyle === "attack" ? { attack: 0.7, strength: 0.2, defence: 0.1 }
    : input.combatStyle === "defence" ? { attack: 0.1, strength: 0.2, defence: 0.7 }
    : { attack: 0.33, strength: 0.34, defence: 0.33 };
  const xpPerKillAttack = Math.floor(baseXp * xpDist.attack * xpMultiplier);
  const xpPerKillStrength = Math.floor(baseXp * xpDist.strength * xpMultiplier);
  const xpPerKillDefence = Math.floor(baseXp * xpDist.defence * xpMultiplier);
  const xpPerKillHp = Math.floor((input.monsterXpReward.hitpoints || 0) * xpMultiplier);
  const xpGained = {
    attack: xpPerKillAttack * kills,
    strength: xpPerKillStrength * kills,
    defence: xpPerKillDefence * kills,
    hitpoints: xpPerKillHp * kills,
  };

  // === DISCRETE DURABILITY MODEL (micro-sim hit-count based) ===
  const durabilityLost: Record<string, number> = {};
  const durabilityLossPerHit = 0.0025;

  let totalMonsterHitsTaken: number;
  if (chainTimeMsTotal > 0 && chainHitsTakenTotal > 0) {
    const hitsPerMs = chainHitsTakenTotal / chainTimeMsTotal;
    totalMonsterHitsTaken = hitsPerMs * deltaMs;
  } else {
    const avgHitsPerKill = killCycleCount > 0 ? sumHitsTaken / killCycleCount : 0;
    totalMonsterHitsTaken = kills * avgHitsPerKill;
  }
  const totalDurabilityPoints = totalMonsterHitsTaken * durabilityLossPerHit;

  if (input.equipmentSlots.length > 0 && totalDurabilityPoints > 0) {
    const perSlotLoss = totalDurabilityPoints / input.equipmentSlots.length;
    for (const slot of input.equipmentSlots) {
      const currentDur = input.equipmentDurability[slot] ?? 100;
      const loss = Math.min(currentDur - 10, perSlotLoss);
      if (loss > 0) {
        durabilityLost[slot] = Math.round(loss * 100) / 100;
      }
    }
  }

  if (deaths > 0) {
    const deathPenaltyPerDeath = 7.5;
    for (const slot of input.equipmentSlots) {
      const existing = durabilityLost[slot] || 0;
      const currentDur = (input.equipmentDurability[slot] ?? 100) - existing;
      const deathLoss = Math.min(currentDur - 10, deathPenaltyPerDeath * deaths);
      if (deathLoss > 0) {
        durabilityLost[slot] = existing + Math.round(deathLoss * 100) / 100;
      }
    }
  }

  const expectedLoot: { itemId: string; expectedCount: number }[] = [];
  for (const drop of input.monsterLoot) {
    let dropChance = drop.chance / 100;
    if (drop.itemId !== "Gold Coins" && guildLootBonus > 0) {
      dropChance = dropChance * (1 + guildLootBonus / 100);
    }
    const lootChanceMod = (ps.lootChanceBonus || 0) / 100;
    if (lootChanceMod > 0) {
      dropChance = dropChance * (1 + lootChanceMod);
    }
    let avgQty = (drop.minQty + drop.maxQty) / 2;
    if (drop.itemId === "Gold Coins" && guildGoldBonus > 0) {
      avgQty = avgQty * (1 + guildGoldBonus / 100);
    }
    const expectedCount = kills * dropChance * avgQty;
    if (expectedCount > 0) {
      expectedLoot.push({ itemId: drop.itemId, expectedCount });
    }
  }

  const safeKillTime = Number.isFinite(killTimeMs) ? killTimeMs : null;
  const safeCombatCycle = Number.isFinite(combatCycleMs) ? combatCycleMs : null;
  const safePlayerDps = Number.isFinite(effectivePlayerDps) ? effectivePlayerDps : 0;
  const safeMonsterDps = Number.isFinite(totalMonsterDps) ? totalMonsterDps : 0;
  const safeSustain = Number.isFinite(sustainPerSecond) ? sustainPerSecond : 0;

  return {
    kills,
    deaths,
    xpGained,
    foodConsumed,
    finalPlayerHp,
    durabilityLost,
    expectedLoot,
    totalDeltaUsedMs: deltaMs,
    playerDps: safePlayerDps,
    monsterDps: safeMonsterDps,
    sustainPerSecond: safeSustain,
    killTimeMs: safeKillTime,
    combatCycleMs: safeCombatCycle,
  };
}

