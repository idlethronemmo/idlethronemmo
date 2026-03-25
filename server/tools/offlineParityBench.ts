import { simulateOfflineCombat, type OfflineCombatInput } from "../../shared/offlineEngine";
import { processCombatStep } from "../../shared/combatEngine";
import { DeterministicRng } from "../../shared/deterministicRng";
import { COMBAT_HP_SCALE, RESPAWN_DELAY } from "../../shared/schema";
import type { MonsterSkill } from "../../shared/schema";
import type { CombatState } from "../../shared/combatTypes";
import type { ResolvedPlayerStats } from "../../shared/combatTypes";

const TOTAL_HOURS = parseInt(process.argv[2] || "10", 10);
const TOTAL_MS = TOTAL_HOURS * 3_600_000;
const TIMESTEP = 500;
const FOOD_ID = "cooked_shark";
const INFINITE_FOOD = 999_999_999;

interface ScenarioConfig {
  name: string;
  attackLevel: number;
  strengthLevel: number;
  defenceLevel: number;
  hitpointsLevel: number;
  attackBonus: number;
  strengthBonus: number;
  defenceBonus: number;
  critChance: number;
  critDamage: number;
  weaponAttackSpeed: number;
  weaponLifesteal: number;
  weaponSkills: Array<{ id: string; name: string; chance: number; type: string; hits?: number; damageMultiplier?: number }>;
  maxPlayerHp: number;
  autoEatEnabled: boolean;
  autoEatThreshold: number;
  foodHealAmount: number;
  foodCount: number;
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
  guildBonuses?: { combatPower?: number; defensePower?: number; xpBonus?: number; lootBonus?: number; goldBonus?: number };
  partyBuffs?: { foodHealBonus: number; defenseBonus: number; attackBonus: number };
  partyDpsBuff: number;
  partyDefenceBuff: number;
  seed: number;
}

function baseScenario(name: string, seed: number): ScenarioConfig {
  return {
    name,
    attackLevel: 50,
    strengthLevel: 50,
    defenceLevel: 50,
    hitpointsLevel: 50,
    attackBonus: 30,
    strengthBonus: 30,
    defenceBonus: 30,
    critChance: 5,
    critDamage: 50,
    weaponAttackSpeed: 2000,
    weaponLifesteal: 0,
    weaponSkills: [],
    maxPlayerHp: 500 * COMBAT_HP_SCALE,
    autoEatEnabled: false,
    autoEatThreshold: 50,
    foodHealAmount: 0,
    foodCount: 0,
    monsterMaxHp: 200 * COMBAT_HP_SCALE,
    monsterAttackLevel: 40,
    monsterStrengthLevel: 35,
    monsterDefenceLevel: 30,
    monsterAttackBonus: 10,
    monsterStrengthBonus: 10,
    monsterAttackSpeed: 2500,
    monsterSkills: [],
    monsterLoot: [
      { itemId: "Gold Coins", chance: 80, minQty: 5, maxQty: 15 },
      { itemId: "iron_ore", chance: 30, minQty: 1, maxQty: 3 },
    ],
    monsterXpReward: { attack: 25, strength: 25, defence: 25, hitpoints: 10 },
    guildBonuses: undefined,
    partyBuffs: undefined,
    partyDpsBuff: 0,
    partyDefenceBuff: 0,
    seed,
  };
}

function buildScenarios(): ScenarioConfig[] {
  const s1 = baseScenario("Low DPS/Low Sustain", 1001);
  s1.strengthLevel = 20;
  s1.attackLevel = 20;
  s1.weaponLifesteal = 0;
  s1.autoEatEnabled = false;
  s1.foodHealAmount = 0;
  s1.foodCount = 0;
  s1.monsterMaxHp = 200 * COMBAT_HP_SCALE;

  const s2 = baseScenario("High DPS/Low Sustain", 1002);
  s2.strengthLevel = 80;
  s2.attackLevel = 80;
  s2.strengthBonus = 60;
  s2.attackBonus = 60;
  s2.autoEatEnabled = false;
  s2.foodHealAmount = 0;
  s2.foodCount = 0;
  s2.monsterMaxHp = 300 * COMBAT_HP_SCALE;

  const s3 = baseScenario("Low DPS/High Sustain", 1003);
  s3.strengthLevel = 25;
  s3.attackLevel = 25;
  s3.autoEatEnabled = true;
  s3.foodHealAmount = 100 * COMBAT_HP_SCALE;
  s3.foodCount = INFINITE_FOOD;
  s3.monsterMaxHp = 150 * COMBAT_HP_SCALE;

  const s4 = baseScenario("High DPS/High Sustain", 1004);
  s4.strengthLevel = 80;
  s4.attackLevel = 80;
  s4.autoEatEnabled = true;
  s4.foodHealAmount = 200 * COMBAT_HP_SCALE;
  s4.foodCount = INFINITE_FOOD;
  s4.weaponLifesteal = 10;
  s4.monsterMaxHp = 500 * COMBAT_HP_SCALE;

  const s5 = baseScenario("High Stun Monster", 1005);
  s5.monsterAttackSpeed = 2000;
  s5.monsterSkills = [{
    id: "stun_bash", name: "Stun Bash", chance: 25, type: "stun" as const,
    stunDuration: 2,
  }];

  const s6 = baseScenario("No Stun Monster", 1006);
  s6.monsterSkills = [];

  const s7 = baseScenario("Fast Weapon", 1007);
  s7.weaponAttackSpeed = 1000;
  s7.strengthLevel = 60;
  s7.attackLevel = 60;

  const s8 = baseScenario("Heavy Crit Build", 1008);
  s8.critChance = 35;
  s8.critDamage = 150;
  s8.weaponSkills = [{
    id: "crit_strike", name: "Critical Strike", chance: 20, type: "critical",
    damageMultiplier: 2.0,
  }];

  const s9 = baseScenario("DoT Monster", 1009);
  s9.monsterSkills = [
    { id: "venom_spit", name: "Venom Spit", chance: 30, type: "poison" as const, dotDamage: 5, dotDuration: 5 },
    { id: "fire_breath", name: "Fire Breath", chance: 20, type: "burn" as const, dotDamage: 8, dotDuration: 3 },
  ];

  const s10 = baseScenario("Armor Break Monster", 1010);
  s10.monsterSkills = [{
    id: "armor_crush", name: "Armor Crush", chance: 25, type: "armor_break" as const,
    armorBreakPercent: 40, armorBreakDuration: 5,
  }];

  const s11 = baseScenario("Party Bonus", 1011);
  s11.partyBuffs = { foodHealBonus: 0.15, defenseBonus: 0.1, attackBonus: 0.1 };
  s11.partyDpsBuff = 5;
  s11.partyDefenceBuff = 5;
  s11.autoEatEnabled = true;
  s11.foodHealAmount = 100 * COMBAT_HP_SCALE;
  s11.foodCount = INFINITE_FOOD;

  const s12 = baseScenario("Guild Bonus", 1012);
  s12.guildBonuses = { combatPower: 15, defensePower: 10, xpBonus: 20, lootBonus: 15, goldBonus: 10 };

  return [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12];
}

function buildOfflineInput(sc: ScenarioConfig): OfflineCombatInput {
  const playerStats: ResolvedPlayerStats = {
    attackLevel: sc.attackLevel,
    strengthLevel: sc.strengthLevel,
    defenceLevel: sc.defenceLevel,
    hitpointsLevel: sc.hitpointsLevel,
    attackBonus: sc.attackBonus,
    strengthBonus: sc.strengthBonus,
    defenceBonus: sc.defenceBonus,
    hitpointsBonus: 0,
    critChance: sc.critChance,
    critDamage: sc.critDamage,
    attackSpeedBonus: 0,
    healingReceivedBonus: 0,
    onHitHealingPercent: 0,
    skillDamageBonus: 0,
    partyDpsBuff: sc.partyDpsBuff,
    partyDefenceBuff: sc.partyDefenceBuff,
    partyAttackSpeedBuff: 0,
    lootChanceBonus: 0,
  };

  return {
    playerStats,
    combatStyle: "balanced",
    maxPlayerHp: sc.maxPlayerHp,
    currentPlayerHp: sc.maxPlayerHp,
    weaponAttackSpeed: sc.weaponAttackSpeed,
    weaponLifesteal: sc.weaponLifesteal,
    weaponSkills: sc.weaponSkills,
    monsterMaxHp: sc.monsterMaxHp,
    monsterAttackLevel: sc.monsterAttackLevel,
    monsterStrengthLevel: sc.monsterStrengthLevel,
    monsterDefenceLevel: sc.monsterDefenceLevel,
    monsterAttackBonus: sc.monsterAttackBonus,
    monsterStrengthBonus: sc.monsterStrengthBonus,
    monsterAttackSpeed: sc.monsterAttackSpeed,
    monsterSkills: sc.monsterSkills,
    monsterLoot: sc.monsterLoot,
    monsterXpReward: sc.monsterXpReward,
    monsterId: "bench_monster",
    guildBonuses: sc.guildBonuses,
    partyBuffs: sc.partyBuffs,
    activeBuffs: [],
    autoEatEnabled: sc.autoEatEnabled,
    autoEatThreshold: sc.autoEatThreshold,
    foodHealAmount: sc.foodHealAmount,
    foodCount: sc.autoEatEnabled ? INFINITE_FOOD : 0,
    foodId: sc.autoEatEnabled ? FOOD_ID : null,
    equipmentDurability: { weapon: 100, helmet: 100, body: 100, legs: 100, shield: 100 },
    equipmentSlots: ["weapon", "helmet", "body", "legs", "shield"],
  };
}

function buildOnlineState(sc: ScenarioConfig): CombatState {
  const playerStats: ResolvedPlayerStats = {
    attackLevel: sc.attackLevel,
    strengthLevel: sc.strengthLevel,
    defenceLevel: sc.defenceLevel,
    hitpointsLevel: sc.hitpointsLevel,
    attackBonus: sc.attackBonus,
    strengthBonus: sc.strengthBonus,
    defenceBonus: sc.defenceBonus,
    hitpointsBonus: 0,
    critChance: sc.critChance,
    critDamage: sc.critDamage,
    attackSpeedBonus: 0,
    healingReceivedBonus: 0,
    onHitHealingPercent: 0,
    skillDamageBonus: 0,
    partyDpsBuff: sc.partyDpsBuff,
    partyDefenceBuff: sc.partyDefenceBuff,
    partyAttackSpeedBuff: 0,
    lootChanceBonus: 0,
  };

  const foodInventory: Record<string, number> = {};
  if (sc.autoEatEnabled) {
    foodInventory[FOOD_ID] = INFINITE_FOOD;
  }

  const healPerFood = sc.autoEatEnabled
    ? Math.floor(sc.foodHealAmount * (1 + (sc.partyBuffs?.foodHealBonus || 0)))
    : 0;

  return {
    playerHp: sc.maxPlayerHp,
    maxPlayerHp: sc.maxPlayerHp,
    monsterHp: sc.monsterMaxHp,
    playerAttackAccumulator: 0,
    monsterAttackAccumulator: 0,
    weaponAttackSpeed: sc.weaponAttackSpeed,
    weaponLifesteal: sc.weaponLifesteal,
    weaponSkills: sc.weaponSkills.map(s => ({
      id: s.id,
      name: s.name,
      chance: s.chance,
      type: s.type,
      hits: s.hits,
      damageMultiplier: s.damageMultiplier,
    })),
    playerStats,
    monsterStats: {
      id: "bench_monster",
      maxHp: sc.monsterMaxHp,
      attackLevel: sc.monsterAttackLevel,
      strengthLevel: sc.monsterStrengthLevel,
      defenceLevel: sc.monsterDefenceLevel,
      attackBonus: sc.monsterAttackBonus,
      strengthBonus: sc.monsterStrengthBonus,
      attackSpeed: sc.monsterAttackSpeed,
      skills: sc.monsterSkills,
      loot: sc.monsterLoot,
      xpReward: sc.monsterXpReward,
    },
    buffs: {
      attackBoostPercent: 0,
      strengthBoostPercent: 0,
      defenceBoostPercent: 0,
      critChancePercent: 0,
      damageReductionPercent: 0,
      hpRegenValue: 0,
      xpBoostPercent: 0,
      lifestealPercent: 0,
      maxHpBoostPercent: 0,
    },
    modifiers: {
      combatStyle: "balanced",
      guildCombatPowerPercent: sc.guildBonuses?.combatPower || 0,
      guildDefensePowerPercent: sc.guildBonuses?.defensePower || 0,
      guildXpBonusPercent: sc.guildBonuses?.xpBonus || 0,
      guildLootBonusPercent: sc.guildBonuses?.lootBonus || 0,
      guildGoldBonusPercent: sc.guildBonuses?.goldBonus || 0,
      partyDpsBonus: 0,
      partyDefenseBonus: sc.partyBuffs?.defenseBonus || 0,
      partyFoodHealBonus: sc.partyBuffs?.foodHealBonus || 0,
      partyAttackBonus: sc.partyBuffs?.attackBonus || 0,
    },
    food: {
      selectedFoodId: sc.autoEatEnabled ? FOOD_ID : null,
      foodInventory,
      healPerFood,
      autoEatEnabled: sc.autoEatEnabled,
      autoEatThreshold: sc.autoEatThreshold,
    },
    potion: {
      selectedPotionId: null,
      potionInventory: {},
      autoPotionEnabled: false,
      potionEffectType: null,
      potionEffectValue: 0,
      potionDurationMs: 0,
    },
    debuffs: [],
    debuffTickAccumulator: 0,
    monsterStunCycles: 0,
    playerStunCycles: 0,
    monsterArmorRepairStacks: 0,
    isRespawning: false,
    respawnAccumulator: 0,
    autoEatCooldownAccumulator: 0,
    totalPlayerDamage: 0,
    totalMonsterDamage: 0,
    monstersKilled: 0,
    fightDurationMs: 0,
    foodConsumed: 0,
    deaths: 0,
    activePotionBuff: null,
  };
}

interface OnlineResult {
  kills: number;
  deaths: number;
  totalXp: { attack: number; strength: number; defence: number; hitpoints: number };
  foodConsumed: number;
  durabilityHits: number;
  lootDrops: number;
}

function runOnlineEngine(sc: ScenarioConfig): OnlineResult {
  const rng = new DeterministicRng(sc.seed);
  let state = buildOnlineState(sc);
  let elapsed = 0;
  let prevDeaths = 0;

  const result: OnlineResult = {
    kills: 0,
    deaths: 0,
    totalXp: { attack: 0, strength: 0, defence: 0, hitpoints: 0 },
    foodConsumed: 0,
    durabilityHits: 0,
    lootDrops: 0,
  };

  while (elapsed < TOTAL_MS) {
    const { state: newState, events } = processCombatStep(state, TIMESTEP, rng);
    state = newState;
    elapsed += TIMESTEP;

    for (const ev of events) {
      if (ev.type === "xp_gain" && ev.xp) {
        result.totalXp.attack += ev.xp.attack;
        result.totalXp.strength += ev.xp.strength;
        result.totalXp.defence += ev.xp.defence;
        result.totalXp.hitpoints += ev.xp.hitpoints;
      }
      if (ev.type === "durability_loss") {
        result.durabilityHits++;
      }
      if (ev.type === "loot_drop") {
        result.lootDrops++;
      }
    }

    if (state.deaths > prevDeaths) {
      state.playerHp = state.maxPlayerHp;
      state.monsterHp = state.monsterStats.maxHp;
      state.isRespawning = true;
      state.respawnAccumulator = 0;
      state.debuffs = [];
      state.playerAttackAccumulator = 0;
      state.monsterAttackAccumulator = 0;
      state.debuffTickAccumulator = 0;
      state.monsterStunCycles = 0;
      state.playerStunCycles = 0;
      prevDeaths = state.deaths;
    }

    if (sc.autoEatEnabled && state.food.selectedFoodId) {
      const current = state.food.foodInventory[state.food.selectedFoodId] || 0;
      if (current < 999_000_000) {
        state.food.foodInventory[state.food.selectedFoodId] = INFINITE_FOOD;
      }
    }
  }

  result.kills = state.monstersKilled;
  result.deaths = state.deaths;
  result.foodConsumed = state.foodConsumed;

  return result;
}

function relError(offline: number, online: number): number {
  const avg = (Math.abs(offline) + Math.abs(online)) / 2;
  if (avg === 0) return 0;
  return Math.abs(offline - online) / avg;
}

function fmtPct(v: number): string {
  return (v * 100).toFixed(1) + "%";
}

function fmtNum(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toString();
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function rpad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : " ".repeat(n - s.length) + s;
}

interface BenchResult {
  name: string;
  offKills: number;
  onKills: number;
  killsErr: number;
  offDeaths: number;
  onDeaths: number;
  deathsErr: number;
  offXp: number;
  onXp: number;
  xpErr: number;
  offFood: number;
  onFood: number;
  foodErr: number;
  offDurHits: number;
  onDurHits: number;
  durErr: number;
  pass: boolean;
  failures: string[];
}

function checkDeaths(offDeaths: number, onDeaths: number): { err: number; pass: boolean } {
  const err = relError(offDeaths, onDeaths);
  if (offDeaths < 20 && onDeaths < 20) {
    return { err, pass: Math.abs(offDeaths - onDeaths) <= 2 };
  }
  return { err, pass: err <= 0.10 };
}

function runBenchmark() {
  const scenarios = buildScenarios();
  const results: BenchResult[] = [];

  console.log(`\n=== OFFLINE vs ONLINE PARITY BENCHMARK (${TOTAL_MS / 3_600_000}h simulation, ${TIMESTEP}ms timestep) ===\n`);

  for (let i = 0; i < scenarios.length; i++) {
    const sc = scenarios[i];
    const label = `${i + 1}. ${sc.name}`;
    process.stdout.write(`Running ${label}...`);
    const startTime = Date.now();

    const offlineInput = buildOfflineInput(sc);
    const offResult = simulateOfflineCombat(offlineInput, TOTAL_MS);

    const onResult = runOnlineEngine(sc);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(` done (${elapsed}s)\n`);

    const offTotalXp = offResult.xpGained.attack + offResult.xpGained.strength + offResult.xpGained.defence + offResult.xpGained.hitpoints;
    const onTotalXp = onResult.totalXp.attack + onResult.totalXp.strength + onResult.totalXp.defence + onResult.totalXp.hitpoints;

    const killsErr = relError(offResult.kills, onResult.kills);
    const deathCheck = checkDeaths(offResult.deaths, onResult.deaths);
    const xpErr = relError(offTotalXp, onTotalXp);
    const foodErr = relError(offResult.foodConsumed, onResult.foodConsumed);

    const totalOffDur = Object.values(offResult.durabilityLost).reduce((a, b) => a + b, 0);
    const deathPenaltyPerDeath = 7.5;
    const numSlots = (sc as any).equipmentSlots?.length || 4;
    const offDeathPenalty = offResult.deaths * deathPenaltyPerDeath * numSlots;
    const offHitOnlyDur = Math.max(0, totalOffDur - offDeathPenalty);
    const onHitOnlyDur = onResult.durabilityHits * 0.0025;
    const onDeathPenalty = onResult.deaths * deathPenaltyPerDeath * numSlots;
    const offTotalWithDeath = offHitOnlyDur + offDeathPenalty;
    const onTotalWithDeath = onHitOnlyDur + onDeathPenalty;
    const durErr = relError(offTotalWithDeath, onTotalWithDeath);

    const failures: string[] = [];
    if (killsErr > 0.05) failures.push(`kills rel error ${fmtPct(killsErr)}`);
    if (xpErr > 0.05) failures.push(`xp rel error ${fmtPct(xpErr)}`);
    if (foodErr > 0.10 && (offResult.foodConsumed > 0 || onResult.foodConsumed > 0)) failures.push(`food rel error ${fmtPct(foodErr)}`);
    if (durErr > 0.10 && (totalOffDur > 0 || onTotalWithDeath > 0)) failures.push(`durability rel error ${fmtPct(durErr)}`);
    if (!deathCheck.pass) failures.push(`deaths off=${offResult.deaths} on=${onResult.deaths}`);

    results.push({
      name: label,
      offKills: offResult.kills,
      onKills: onResult.kills,
      killsErr,
      offDeaths: offResult.deaths,
      onDeaths: onResult.deaths,
      deathsErr: deathCheck.err,
      offXp: offTotalXp,
      onXp: onTotalXp,
      xpErr,
      offFood: offResult.foodConsumed,
      onFood: onResult.foodConsumed,
      foodErr,
      offDurHits: Math.round(offTotalWithDeath * 100) / 100,
      onDurHits: Math.round(onTotalWithDeath * 100) / 100,
      durErr,
      pass: failures.length === 0,
      failures,
    });
  }

  console.log("\n" + "=".repeat(140));
  const header = [
    pad("Scenario", 28),
    pad("Kills(off/on)", 22),
    rpad("KillErr", 8),
    pad("Deaths(off/on)", 18),
    pad("XP(off/on)", 24),
    pad("Food(off/on)", 20),
    pad("Result", 8),
  ].join("| ");
  console.log(header);
  console.log("-".repeat(140));

  for (const r of results) {
    const row = [
      pad(r.name, 28),
      pad(`${fmtNum(r.offKills)} / ${fmtNum(r.onKills)}`, 22),
      rpad(fmtPct(r.killsErr), 8),
      pad(`${r.offDeaths} / ${r.onDeaths}`, 18),
      pad(`${fmtNum(r.offXp)} / ${fmtNum(r.onXp)}`, 24),
      pad(`${fmtNum(r.offFood)} / ${fmtNum(r.onFood)}`, 20),
      pad(r.pass ? "PASS" : "FAIL", 8),
    ].join("| ");
    console.log(row);
  }
  console.log("=".repeat(140));

  const passCount = results.filter(r => r.pass).length;
  console.log(`\nSummary: ${passCount}/${results.length} scenarios passed\n`);

  console.log("=== DRIFT DIAGNOSIS ===\n");
  for (const r of results) {
    if (!r.pass) {
      console.log(`${r.name}: FAIL`);
      for (const f of r.failures) {
        console.log(`  - ${f}`);
      }
      if (r.killsErr > 0.05) {
        console.log(`  Likely cause: Offline O(1) formula approximates kill rate via avg DPS / monster HP.`);
        console.log(`  Online engine has variance from RNG, stuns, debuffs, death respawn timing.`);
      }
      if (r.xpErr > 0.05 && r.killsErr <= 0.05) {
        console.log(`  Likely cause: XP distribution differs - offline uses per-skill rewards, online uses combatStyle distribution.`);
      }
      if (r.foodErr > 0.10) {
        console.log(`  Likely cause: Offline food model is continuous (DPS-based rate), online is discrete auto-eat events.`);
      }
      if (r.durErr > 0.10) {
        console.log(`  Likely cause: Offline durability uses continuous hit-rate formula, online counts discrete hit events.`);
      }
      if (r.failures.some(f => f.includes("deaths"))) {
        console.log(`  Likely cause: Death timing differs between O(1) approximation and tick-based simulation.`);
      }
      console.log();
    }
  }

  if (passCount === results.length) {
    console.log("All scenarios within tolerance. No drift diagnosis needed.\n");
  }
}

runBenchmark();
