import type { CombatState, CombatResult, CombatEvent, WeaponSkillDef } from "./combatTypes";
import type { CombatDebuff, MonsterSkill } from "./schema";
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
import {
  processDebuffTick,
  addOrStackDebuff,
  getStunCyclesRemaining,
  decrementStunCycle,
  getArmorBreakPercent,
} from "./combatSkills";
import { calculateXpScaling, calculateCombatLevel, calculateMonsterCombatLevel } from "./xpScaling";
import type { DeterministicRng } from "./deterministicRng";

export const COMBAT_ENGINE_VERSION = "2.0-deterministic";
export const MIN_ATTACK_SPEED_MS = 500;

const AUTO_EAT_COOLDOWN = 200;
const DEBUFF_TICK_INTERVAL = 1000;

export function processCombatStep(
  inputState: CombatState,
  deltaMs: number,
  rng: DeterministicRng
): CombatResult {
  const state = structuredClone(inputState);
  const events: CombatEvent[] = [];

  if (deltaMs <= 0) return { state, events };

  state.fightDurationMs += deltaMs;

  const style = COMBAT_STYLE_MODIFIERS[state.modifiers.combatStyle];
  const ps = state.playerStats;
  const ms = state.monsterStats;
  const buffs = state.buffs;

  const guildCombatMod = 1 + (state.modifiers.guildCombatPowerPercent / 100);
  const guildDefenseMod = 1 + (state.modifiers.guildDefensePowerPercent / 100);
  const partyDpsMod = 1 + state.modifiers.partyDpsBonus;
  const partyAttackMod = 1 + state.modifiers.partyAttackBonus + (ps.partyDpsBuff / 100);

  const baseMaxHit = calculateFinalMaxHit(ps.strengthLevel, ps.strengthBonus, ms.defenceLevel) * COMBAT_HP_SCALE;
  const baseMinHit = calculateFinalMinHit(ps.strengthLevel, ps.strengthBonus, ms.defenceLevel) * COMBAT_HP_SCALE;
  const playerMaxHit = Math.floor(baseMaxHit * (1 + buffs.strengthBoostPercent / 100) * style.damageMod * guildCombatMod * partyDpsMod);
  const playerMinHit = Math.floor(baseMinHit * (1 + buffs.strengthBoostPercent / 100) * style.damageMod * guildCombatMod * partyDpsMod);

  const playerPower = ps.attackLevel + ps.strengthLevel + ps.attackBonus + ps.strengthBonus;
  const effectiveMonsterDef = Math.max(ms.defenceLevel, 1);
  const powerRatio = playerPower / effectiveMonsterDef;
  const powerRatioMod = Math.max(0.8, Math.min(1.2, 0.8 + (powerRatio - 0.5) * 0.267));

  const baseAccuracy = calculateAccuracyRating(ps.attackLevel, ps.attackBonus);
  const playerAccuracy = Math.floor(baseAccuracy * (1 + buffs.attackBoostPercent / 100) * style.accuracyMod * powerRatioMod);
  const baseEvasion = calculateEvasionRating(ps.defenceLevel, ps.defenceBonus);
  const playerEvasion = Math.floor(baseEvasion * (1 + buffs.defenceBoostPercent / 100) * style.defenceMod);

  const partyDefenseMod = 1 + state.modifiers.partyDefenseBonus + (ps.partyDefenceBuff / 100);
  const playerTotalDefense = Math.floor((ps.defenceLevel + ps.defenceBonus) * (1 + buffs.defenceBoostPercent / 100) * style.defenceMod * guildDefenseMod * partyDefenseMod);
  const baseDR = calculateDamageReduction(playerTotalDefense);
  const totalDR = Math.min(0.85, Math.min(0.75, baseDR) + (buffs.damageReductionPercent / 100));

  const monsterAccuracyVal = calculateAccuracyRating(ms.attackLevel, ms.attackBonus);
  let monsterEvasionBonus = 0;
  let magicShieldPercent = 0;
  if (ms.skills && ms.skills.length > 0) {
    for (const sk of ms.skills) {
      if (sk.type === "evasion_aura" && sk.evasionBonus) {
        monsterEvasionBonus += sk.evasionBonus;
      }
      if (sk.type === "magic_shield" && sk.magicShieldPercent) {
        magicShieldPercent = sk.magicShieldPercent;
      }
    }
  }
  const monsterEvasionVal = calculateEvasionRating(ms.defenceLevel, monsterEvasionBonus);
  const monsterMaxHitDmg = calculateMaxHit(ms.strengthLevel, ms.strengthBonus) * COMBAT_HP_SCALE;
  const monsterMinHitDmg = calculateMinHit(ms.strengthLevel, ms.strengthBonus) * COMBAT_HP_SCALE;

  const totalCritChance = Math.min(50, ps.critChance + buffs.critChancePercent);
  const equipCritDamage = ps.critDamage;
  const totalLifestealPercent = state.weaponLifesteal + buffs.lifestealPercent;

  if (state.activePotionBuff) {
    state.activePotionBuff.remainingMs -= deltaMs;
    if (state.activePotionBuff.remainingMs <= 0) {
      state.activePotionBuff = null;
    }
  }

  const simTime = state.fightDurationMs;

  state.debuffTickAccumulator += deltaMs;
  while (state.debuffTickAccumulator >= DEBUFF_TICK_INTERVAL && state.debuffs.length > 0) {
    state.debuffTickAccumulator -= DEBUFF_TICK_INTERVAL;
    const tickResult = processDebuffTick(state.debuffs, state.playerHp, state.maxPlayerHp, simTime);
    state.debuffs = tickResult.updatedDebuffs;

    if (tickResult.dotDamage > 0) {
      const armorBreak = getArmorBreakPercent(state.debuffs) / 100;
      const effectiveDR = totalDR * (1 - armorBreak);
      const dotDmg = Math.max(1, Math.floor(tickResult.dotDamage * (1 - effectiveDR * 0.5)));
      state.playerHp -= dotDmg;
      events.push({ type: "debuff_tick", damage: dotDmg });

      if (state.playerHp <= 0) {
        tryAutoEat(state, events, rng);
      }

      if (state.playerHp <= 0) {
        state.deaths++;
        events.push({ type: "player_died" });
        state.debuffs = [];
        return { state, events };
      }
    }

    tickResult.expiredDebuffs.forEach(name => {
      events.push({ type: "debuff_expired", skillName: name });
    });
  }

  if (buffs.hpRegenValue > 0 && state.playerHp > 0 && state.playerHp < state.maxPlayerHp) {
    const regenTicks = Math.floor(deltaMs / 1000);
    if (regenTicks > 0) {
      const healAmt = Math.min(regenTicks * buffs.hpRegenValue, state.maxPlayerHp - state.playerHp);
      if (healAmt > 0) {
        state.playerHp += healAmt;
        events.push({ type: "hp_regen", healing: healAmt });
      }
    }
  }

  state.autoEatCooldownAccumulator += deltaMs;

  if (state.isRespawning) {
    state.respawnAccumulator += deltaMs;
    if (state.respawnAccumulator >= RESPAWN_DELAY) {
      state.isRespawning = false;
      state.respawnAccumulator = 0;
      state.monsterHp = ms.maxHp;
      state.monsterStunCycles = 0;
      state.monsterArmorRepairStacks = 0;
      state.playerAttackAccumulator = 0;
      state.monsterAttackAccumulator = 0;
      events.push({ type: "respawn" });
    } else {
      return { state, events };
    }
  }

  state.playerAttackAccumulator += deltaMs;
  state.monsterAttackAccumulator += deltaMs;

  const MAX_ITERATIONS = 100;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const canPlayerAttack = !state.isRespawning && state.playerAttackAccumulator >= state.weaponAttackSpeed;
    const canMonsterAttack = !state.isRespawning && state.monsterHp > 0 && state.monsterAttackAccumulator >= ms.attackSpeed;

    if (!canPlayerAttack && !canMonsterAttack) break;

    const playerFirst = canPlayerAttack && (!canMonsterAttack ||
      (state.playerAttackAccumulator - state.weaponAttackSpeed) >= (state.monsterAttackAccumulator - ms.attackSpeed));

    if (playerFirst && canPlayerAttack) {
      state.playerAttackAccumulator -= state.weaponAttackSpeed;

      const stunCycles = getStunCyclesRemaining(state.debuffs);
      if (stunCycles > 0) {
        state.debuffs = decrementStunCycle(state.debuffs, simTime);
        events.push({ type: "player_stunned" });
        continue;
      }

      const dynamicMonsterEvasion = calculateEvasionRating(ms.defenceLevel + state.monsterArmorRepairStacks, monsterEvasionBonus);
      const hitChance = calculateHitChance(playerAccuracy, dynamicMonsterEvasion);
      if (rng.chance(hitChance)) {
        let damage = rng.nextInt(playerMinHit, playerMaxHit);
        let isCritical = totalCritChance > 0 && rng.chance(totalCritChance);
        let skillActivated = false;
        let isArmorBreakSkill = false;

        for (const skill of state.weaponSkills) {
          if (rng.chance(skill.chance)) {
            skillActivated = true;
            if (skill.type === "armor_break") isArmorBreakSkill = true;
            const result = processPlayerWeaponSkill(skill, damage, isCritical, state, rng, events);
            damage = result.damage;
            isCritical = result.isCritical;
            break;
          }
        }

        if (isArmorBreakSkill && state.monsterArmorRepairStacks > 0) {
          state.monsterArmorRepairStacks = 0;
        }

        if (!skillActivated && isCritical) {
          const critMultiplier = 1.5 + (equipCritDamage / 100);
          damage = Math.floor(damage * critMultiplier);
        }

        if (magicShieldPercent > 0 && ps.skillDamageBonus <= 0) {
          damage = Math.max(1, Math.floor(damage * (1 - magicShieldPercent / 100)));
        }

        const playerFormulaStr = isCritical
          ? `hitChance: ${hitChance.toFixed(1)}% | acc ${playerAccuracy} vs eva ${dynamicMonsterEvasion} → HIT | dmg: rand(${playerMinHit},${playerMaxHit}) | CRIT ×${(1.5 + equipCritDamage / 100).toFixed(2)} = ${damage}`
          : `hitChance: ${hitChance.toFixed(1)}% | acc ${playerAccuracy} vs eva ${dynamicMonsterEvasion} → HIT | dmg: rand(${playerMinHit},${playerMaxHit}) = ${damage}`;

        if (isCritical) {
          events.push({ type: "player_crit", damage, formulaString: playerFormulaStr });
        } else {
          events.push({ type: "player_hit", damage, formulaString: playerFormulaStr });
        }

        state.totalPlayerDamage += damage;
        state.monsterHp = Math.max(0, state.monsterHp - damage);

        if (totalLifestealPercent > 0 && state.playerHp < state.maxPlayerHp) {
          const lsHeal = Math.floor(damage * (totalLifestealPercent / 100));
          if (lsHeal > 0) {
            state.playerHp = Math.min(state.maxPlayerHp, state.playerHp + lsHeal);
            events.push({ type: "lifesteal", healing: lsHeal });
          }
        }

        if (ps.onHitHealingPercent > 0 && damage > 0) {
          const onHitHeal = Math.floor(damage * (ps.onHitHealingPercent / 100));
          if (onHitHeal > 0) {
            state.playerHp = Math.min(state.maxPlayerHp, state.playerHp + onHitHeal);
          }
        }

        if (ms.skills && ms.skills.length > 0) {
          for (const sk of ms.skills) {
            if (sk.type === "reflect_damage" && sk.reflectPercent && damage > 0) {
              const rawReflected = Math.max(1, Math.floor(damage * sk.reflectPercent / 100)) + (sk.flatReflect || 0);
              const reflectCap = Math.floor(state.maxPlayerHp * 0.12);
              const reflected = Math.min(rawReflected, reflectCap);
              state.playerHp -= reflected;
              events.push({ type: "reflect_damage", damage: reflected });
              break;
            }
          }
        }

        if (state.monsterHp <= 0) {
          state.monstersKilled++;
          state.debuffs = [];
          state.monsterStunCycles = 0;
          state.monsterArmorRepairStacks = 0;

          const lootEvents = processLootRolls(state, rng);
          events.push(...lootEvents);

          const xpEvent = processXpGain(state);
          events.push(xpEvent);

          events.push({ type: "monster_killed" });

          state.isRespawning = true;
          state.respawnAccumulator = 0;
          state.playerAttackAccumulator = 0;
          state.monsterAttackAccumulator = 0;
          break;
        }
      } else {
        const missFormulaStr = `hitChance: ${hitChance.toFixed(1)}% | acc ${playerAccuracy} vs eva ${dynamicMonsterEvasion} → MISS`;
        events.push({ type: "player_miss", formulaString: missFormulaStr });
      }
    } else if (canMonsterAttack) {
      state.monsterAttackAccumulator -= ms.attackSpeed;

      if (state.monsterStunCycles > 0) {
        state.monsterStunCycles--;
        events.push({ type: "monster_stunned" });

        if (ms.skills) {
          for (const sk of ms.skills) {
            if (sk.type === "armor_repair" && sk.armorRepairPerTurn) {
              const cap = sk.armorRepairCap || 100;
              if (state.monsterArmorRepairStacks < cap) {
                state.monsterArmorRepairStacks = Math.min(cap, state.monsterArmorRepairStacks + sk.armorRepairPerTurn);
                events.push({ type: "armor_repair" });
              }
            }
          }
        }
        continue;
      }

      if (ms.skills) {
        for (const sk of ms.skills) {
          if (sk.type === "regenerate_on_no_stun" && sk.selfHealPercent) {
            const healAmount = Math.floor(ms.maxHp * sk.selfHealPercent / 100);
            if (healAmount > 0 && state.monsterHp < ms.maxHp) {
              state.monsterHp = Math.min(ms.maxHp, state.monsterHp + healAmount);
              events.push({ type: "monster_regen", healing: healAmount });
            }
          }
          if (sk.type === "armor_repair" && sk.armorRepairPerTurn) {
            const cap = sk.armorRepairCap || 100;
            if (state.monsterArmorRepairStacks < cap) {
              state.monsterArmorRepairStacks = Math.min(cap, state.monsterArmorRepairStacks + sk.armorRepairPerTurn);
              events.push({ type: "armor_repair" });
            }
          }
        }
      }

      const hitChance = calculateHitChance(monsterAccuracyVal, playerEvasion);
      if (rng.chance(hitChance)) {
        let damage = 0;
        let skillTriggered = false;

        const armorBreak = getArmorBreakPercent(state.debuffs) / 100;
        const effectiveDR = totalDR * (1 - armorBreak);

        if (ms.skills && ms.skills.length > 0) {
          for (const skill of ms.skills) {
            if (rng.chance(skill.chance)) {
              const skillResult = executeMonsterSkillDeterministic(skill, ms, state.monsterHp, effectiveDR, rng, monsterMaxHitDmg, simTime);
              if (skillResult.triggered) {
                skillTriggered = true;
                damage = skillResult.totalDamage || 0;
                if (skillResult.isEnraged) {
                  damage = Math.floor(monsterMaxHitDmg * 1.5 * (1 - effectiveDR));
                }
                if (skillResult.newDebuff) {
                  const hasPoisonImmunity = state.activePotionBuff?.effectType === "poison_immunity" && state.activePotionBuff.remainingMs > 0;
                  if (skillResult.newDebuff.type === "poison" && hasPoisonImmunity) {
                    events.push({ type: "poison_immune", skillName: skill.name, skillNameTranslations: skill.nameTranslations });
                  } else {
                    state.debuffs = addOrStackDebuff(state.debuffs, skillResult.newDebuff);
                    events.push({ type: "debuff_applied", debuff: skillResult.newDebuff, skillName: skill.name, skillNameTranslations: skill.nameTranslations });
                  }
                }
                events.push({
                  type: "monster_skill",
                  damage,
                  skillName: skill.name,
                  skillNameTranslations: skill.nameTranslations,
                  skillType: skill.type,
                  isCritical: skillResult.isCritical,
                  comboHits: skillResult.comboHits,
                  comboHitDamages: skillResult.comboHitDamages,
                });
                break;
              }
            }
          }
        }

        if (!skillTriggered) {
          const rawDamage = rng.nextInt(monsterMinHitDmg, monsterMaxHitDmg);
          damage = Math.max(1, Math.floor(rawDamage * (1 - effectiveDR)));
          const monsterHitFormula = `hitChance: ${hitChance.toFixed(1)}% | acc ${monsterAccuracyVal} vs eva ${playerEvasion} → HIT | raw: rand(${monsterMinHitDmg},${monsterMaxHitDmg}) = ${rawDamage} | DR: ${(effectiveDR * 100).toFixed(1)}% → ${damage}`;
          events.push({ type: "monster_hit", damage, formulaString: monsterHitFormula });
        }

        state.totalMonsterDamage += damage;
        state.playerHp -= damage;

        events.push({ type: "durability_loss" });

        if (state.playerHp <= 0) {
          tryAutoEat(state, events, rng);
        }

        if (state.playerHp <= 0) {
          state.deaths++;
          events.push({ type: "player_died" });
          state.debuffs = [];
          return { state, events };
        }
      } else {
        const monsterMissFormula = `hitChance: ${hitChance.toFixed(1)}% | acc ${monsterAccuracyVal} vs eva ${playerEvasion} → MISS`;
        events.push({ type: "monster_miss", formulaString: monsterMissFormula });
      }
    }
  }

  if (state.playerHp > 0) {
    tryAutoEatThreshold(state, events, rng);
  }

  if (state.potion.autoPotionEnabled && state.potion.selectedPotionId && !state.activePotionBuff) {
    const potionQty = state.potion.potionInventory[state.potion.selectedPotionId] || 0;
    if (potionQty > 0 && state.potion.potionEffectType) {
      state.potion.potionInventory[state.potion.selectedPotionId] = potionQty - 1;
      state.activePotionBuff = {
        effectType: state.potion.potionEffectType,
        value: state.potion.potionEffectValue,
        remainingMs: state.potion.potionDurationMs,
      };
      events.push({ type: "auto_potion", itemId: state.potion.selectedPotionId });
    }
  }

  return { state, events };
}

function tryAutoEat(state: CombatState, events: CombatEvent[], _rng: DeterministicRng): void {
  if (!state.food.autoEatEnabled || !state.food.selectedFoodId) return;
  const foodId = state.food.selectedFoodId;
  const available = state.food.foodInventory[foodId] || 0;
  if (available <= 0 || state.food.healPerFood <= 0) return;

  let ateThisCall = 0;
  const hpBefore = state.playerHp;

  while (state.playerHp <= 0 && (state.food.foodInventory[foodId] || 0) > 0) {
    state.playerHp += state.food.healPerFood;
    state.food.foodInventory[foodId] = (state.food.foodInventory[foodId] || 0) - 1;
    state.foodConsumed++;
    ateThisCall++;
  }
  state.playerHp = Math.min(state.maxPlayerHp, state.playerHp);

  if (state.playerHp > 0) {
    const hpNeeded = state.maxPlayerHp - state.playerHp;
    const foodNeeded = Math.ceil(hpNeeded / state.food.healPerFood);
    const canEat = Math.min(foodNeeded, state.food.foodInventory[foodId] || 0);
    if (canEat > 0) {
      const totalHeal = Math.min(canEat * state.food.healPerFood, hpNeeded);
      state.playerHp = Math.min(state.maxPlayerHp, state.playerHp + totalHeal);
      state.food.foodInventory[foodId] = (state.food.foodInventory[foodId] || 0) - canEat;
      state.foodConsumed += canEat;
      ateThisCall += canEat;
    }
  }

  if (ateThisCall > 0) {
    const healing = state.playerHp - hpBefore;
    events.push({ type: "auto_eat", foodId, foodCount: ateThisCall, healing: Math.max(0, healing) });
  }
}

function tryAutoEatThreshold(state: CombatState, events: CombatEvent[], _rng: DeterministicRng): void {
  if (!state.food.autoEatEnabled || !state.food.selectedFoodId) return;
  if (state.autoEatCooldownAccumulator < AUTO_EAT_COOLDOWN) return;

  const hpPercent = (state.playerHp / state.maxPlayerHp) * 100;
  if (hpPercent > state.food.autoEatThreshold) return;

  state.autoEatCooldownAccumulator = 0;

  const foodId = state.food.selectedFoodId;
  const available = state.food.foodInventory[foodId] || 0;
  if (available <= 0 || state.food.healPerFood <= 0) return;

  const healAmount = Math.min(state.food.healPerFood, state.maxPlayerHp - state.playerHp);
  if (healAmount <= 0) return;

  state.playerHp = Math.min(state.maxPlayerHp, state.playerHp + healAmount);
  state.food.foodInventory[foodId] = available - 1;
  state.foodConsumed += 1;

  events.push({ type: "auto_eat", foodId, foodCount: 1, healing: healAmount });
}

function processPlayerWeaponSkill(
  skill: WeaponSkillDef,
  baseDamage: number,
  wasCritical: boolean,
  state: CombatState,
  rng: DeterministicRng,
  events: CombatEvent[]
): { damage: number; isCritical: boolean } {
  let damage = baseDamage;
  let isCritical = wasCritical;
  let healing = 0;

  if (skill.type === "stun" && skill.stunCycles) {
    state.monsterStunCycles = skill.stunCycles;
  } else if (skill.type === "slow_crit") {
    isCritical = true;
    damage = Math.floor(damage * (skill.critMultiplier || 1.5));
    if (skill.slowMultiplier && skill.slowMultiplier > 1) {
      state.monsterStunCycles = 1;
    }
  } else if (skill.type === "critical") {
    isCritical = true;
    damage = Math.floor(damage * (skill.damageMultiplier || 2.0));
    if (skill.armorBreakPercent) {
      damage = Math.floor(damage * (1 + skill.armorBreakPercent / 100));
    }
  } else if (skill.type === "armor_break" && skill.armorBreakPercent) {
    damage = Math.floor(damage * (1 + skill.armorBreakPercent / 100));
  } else if (skill.type === "poison" && skill.dotDamage && skill.dotDuration) {
    damage += skill.dotDamage * skill.dotDuration;
  } else if (skill.type === "combo" && skill.hits) {
    damage = Math.floor(damage * skill.hits * (skill.damageMultiplier || 1.0));
  } else if (skill.type === "meteor") {
    damage = Math.floor(damage * (skill.hits || 3) * (skill.damageMultiplier || 2.5));
    if (skill.dotDamage && skill.dotDuration) {
      damage += skill.dotDamage * skill.dotDuration;
    }
  } else if (skill.type === "frost_burst") {
    state.monsterStunCycles = skill.stunCycles || 2;
    damage = Math.floor(damage * (skill.damageMultiplier || 1.8));
  } else if (skill.type === "thunder_strike") {
    damage = Math.floor(damage * (skill.hits || 2) * (skill.damageMultiplier || 2.0));
    state.monsterStunCycles = skill.stunCycles || 1;
  } else if (skill.type === "lifesteal_burst") {
    damage = Math.floor(damage * (skill.damageMultiplier || 1.5));
    healing = Math.floor(damage * 0.5);
    state.playerHp = Math.min(state.maxPlayerHp, state.playerHp + healing);
    events.push({ type: "lifesteal", healing, skillName: skill.name, skillNameTranslations: skill.nameTranslations });
  } else if (skill.type === "damage" && skill.damage) {
    const skillDamageMod = 1 + (state.playerStats.skillDamageBonus / 100);
    damage += Math.floor(skill.damage * skillDamageMod);
  } else if (skill.type === "aoe" && skill.damage) {
    const skillDamageMod = 1 + (state.playerStats.skillDamageBonus / 100);
    damage += Math.floor(skill.damage * skillDamageMod);
  } else if ((skill.type === "heal" || skill.type === "groupHeal") && (skill.healAmount || skill.healPercent)) {
    let healAmt = 0;
    if (skill.healPercent) {
      healAmt = Math.floor(state.maxPlayerHp * skill.healPercent / 100);
    } else if (skill.healAmount) {
      healAmt = skill.healAmount;
    }
    if (healAmt > 0) {
      state.playerHp = Math.min(state.maxPlayerHp, state.playerHp + healAmt);
      healing = healAmt;
    }
  } else if (skill.type === "lifesteal" && skill.lifestealPercent) {
    const healAmount = Math.floor(damage * (skill.lifestealPercent / 100));
    if (healAmount > 0) {
      state.playerHp = Math.min(state.maxPlayerHp, state.playerHp + healAmount);
      healing = healAmount;
    }
  } else if (skill.type === "buff" && skill.buffType === "regen" && skill.healPerTick) {
    const ticks = Math.floor((skill.duration || 6000) / 1000);
    const totalHeal = skill.healPerTick * ticks;
    state.playerHp = Math.min(state.maxPlayerHp, state.playerHp + totalHeal);
    healing = totalHeal;
  } else if (skill.type === "buff" && skill.buffType === "shield" && skill.shieldAmount) {
    const shieldHp = Math.floor(skill.shieldAmount * 0.5);
    state.playerHp = Math.min(state.maxPlayerHp, state.playerHp + shieldHp);
    healing = shieldHp;
  } else if (skill.type === "buff" && skill.buffType === "defence" && skill.defenceBoost) {
    damage += Math.floor(skill.defenceBoost * 0.3);
  } else if (skill.type === "debuff" && skill.debuffType === "armor_break" && skill.armorReduction) {
    damage = Math.floor(damage * (1 + skill.armorReduction / 100));
  }

  const bonusDamage = damage - baseDamage;
  events.push({
    type: "player_skill",
    skillName: skill.name,
    skillNameTranslations: skill.nameTranslations,
    skillType: skill.type,
    damage: bonusDamage,
    healing,
  });

  return { damage, isCritical };
}

interface MonsterSkillResultDet {
  triggered: boolean;
  totalDamage?: number;
  newDebuff?: CombatDebuff;
  isCritical?: boolean;
  isEnraged?: boolean;
  comboHits?: number;
  comboHitDamages?: number[];
}

function executeMonsterSkillDeterministic(
  skill: MonsterSkill,
  ms: CombatState["monsterStats"],
  monsterCurrentHp: number,
  effectiveDR: number,
  rng: DeterministicRng,
  monsterMaxHitDmg: number,
  currentSimTime?: number
): MonsterSkillResultDet {
  const baseMaxHit = calculateMaxHit(ms.strengthLevel, ms.strengthBonus) * COMBAT_HP_SCALE;
  const baseMinHit = calculateMinHit(ms.strengthLevel, ms.strengthBonus) * COMBAT_HP_SCALE;
  const monsterMaxHpScaled = ms.maxHp;
  const now = currentSimTime ?? Date.now();

  const result: MonsterSkillResultDet = { triggered: true };

  switch (skill.type) {
    case "critical":
      result.isCritical = true;
      result.totalDamage = Math.max(1, Math.floor(baseMaxHit * (1 - effectiveDR)));
      break;

    case "combo": {
      const hits = skill.hits || 3;
      result.comboHits = hits;
      result.comboHitDamages = [];
      let totalDmg = 0;
      for (let i = 0; i < hits; i++) {
        const rawDmg = rng.nextInt(baseMinHit, baseMaxHit);
        const hitDmg = Math.max(1, Math.floor(rawDmg * (1 - effectiveDR)));
        result.comboHitDamages.push(hitDmg);
        totalDmg += hitDmg;
      }
      result.totalDamage = totalDmg;
      break;
    }

    case "stun": {
      const rawDmg = rng.nextInt(baseMinHit, baseMaxHit);
      result.totalDamage = Math.max(1, Math.floor(rawDmg * (1 - effectiveDR)));
      result.newDebuff = {
        id: `stun_${skill.id}_${now}`,
        type: "stun",
        name: skill.name,
        expiresAt: now + 60000,
        stunCyclesRemaining: skill.stunDuration || 1,
      };
      break;
    }

    case "poison": {
      const rawDmg = rng.nextInt(baseMinHit, baseMaxHit);
      result.totalDamage = Math.max(1, Math.floor(rawDmg * (1 - effectiveDR)));
      const dotDamage = (skill.dotDamage || 5) * COMBAT_HP_SCALE;
      const dotDuration = skill.dotDuration || 5;
      result.newDebuff = {
        id: `poison_${skill.id}_${now}`,
        type: "poison",
        name: skill.name,
        expiresAt: now + (dotDuration * 1000),
        dotDamage: dotDamage,
        stackCount: 1,
      };
      break;
    }

    case "burn": {
      const rawDmg = rng.nextInt(baseMinHit, baseMaxHit);
      result.totalDamage = Math.max(1, Math.floor(rawDmg * (1 - effectiveDR)));
      const dotDamage = (skill.dotDamage || 8) * COMBAT_HP_SCALE;
      const dotDuration = skill.dotDuration || 3;
      result.newDebuff = {
        id: `burn_${skill.id}_${now}`,
        type: "burn",
        name: skill.name,
        expiresAt: now + (dotDuration * 1000),
        dotDamage: dotDamage,
        healingReduction: skill.healingReduction || 0.5,
      };
      break;
    }

    case "enrage": {
      const threshold = skill.enrageThreshold || 30;
      const hpPercent = (monsterCurrentHp / monsterMaxHpScaled) * 100;
      if (hpPercent <= threshold) {
        result.isEnraged = true;
      } else {
        result.triggered = false;
      }
      break;
    }

    case "armor_break": {
      const rawDmg = rng.nextInt(baseMinHit, baseMaxHit);
      result.totalDamage = Math.max(1, Math.floor(rawDmg * (1 - effectiveDR)));
      const armorBreakPercent = skill.armorBreakPercent || 30;
      const armorBreakDuration = skill.armorBreakDuration || 5;
      result.newDebuff = {
        id: `armor_break_${skill.id}_${now}`,
        type: "armor_break",
        name: skill.name,
        expiresAt: now + (armorBreakDuration * 1000),
        armorBreakPercent: armorBreakPercent,
      };
      break;
    }

    default:
      result.triggered = false;
      break;
  }

  return result;
}

function processLootRolls(state: CombatState, rng: DeterministicRng): CombatEvent[] {
  const events: CombatEvent[] = [];
  const ms = state.monsterStats;
  const guildLootMod = state.modifiers.guildLootBonusPercent;
  const guildGoldMod = 1 + (state.modifiers.guildGoldBonusPercent / 100);

  for (const loot of ms.loot) {
    const effectiveChance = loot.chance * (1 + guildLootMod / 100);
    if (rng.chance(effectiveChance)) {
      let qty = rng.nextInt(loot.minQty, loot.maxQty);
      if (loot.itemId === "Gold Coins") {
        qty = Math.floor(qty * guildGoldMod);
      }
      if (qty > 0) {
        events.push({ type: "loot_drop", itemId: loot.itemId, quantity: qty });
      }
    }
  }

  const HIDDEN_DROPS = [
    { itemId: "chaos_stone", chance: 0.025 },
    { itemId: "jurax_gem", chance: 0.025 },
    { itemId: "death_liquid", chance: 0.025 },
    { itemId: "teleport_stone", chance: 0.025 },
  ];
  for (const drop of HIDDEN_DROPS) {
    if (rng.next() * 100 < drop.chance) {
      events.push({ type: "loot_drop", itemId: drop.itemId, quantity: 1 });
    }
  }

  return events;
}

function processXpGain(state: CombatState): CombatEvent {
  const ms = state.monsterStats;
  const guildXpMod = 1 + (state.modifiers.guildXpBonusPercent / 100);

  const monsterLevel = calculateMonsterCombatLevel({
    attackLevel: ms.attackLevel,
    strengthLevel: ms.strengthLevel,
    defenceLevel: ms.defenceLevel,
  });
  const playerLevel = calculateCombatLevel({
    attack: state.playerStats.attackLevel,
    strength: state.playerStats.strengthLevel,
    defence: state.playerStats.defenceLevel,
  });
  const scaling = calculateXpScaling(playerLevel, monsterLevel);

  const style = state.modifiers.combatStyle;
  const dist = style === "attack" ? { attack: 0.7, strength: 0.2, defence: 0.1 }
    : style === "defence" ? { attack: 0.1, strength: 0.2, defence: 0.7 }
    : { attack: 0.33, strength: 0.34, defence: 0.33 };

  const baseXp = ms.xpReward.attack + ms.xpReward.strength + ms.xpReward.defence;
  const mult = guildXpMod * scaling.multiplier;

  return {
    type: "xp_gain",
    xp: {
      attack: Math.floor(baseXp * dist.attack * mult),
      strength: Math.floor(baseXp * dist.strength * mult),
      defence: Math.floor(baseXp * dist.defence * mult),
      hitpoints: Math.floor(ms.xpReward.hitpoints * mult),
    },
  };
}
