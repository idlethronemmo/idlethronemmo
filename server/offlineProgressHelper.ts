import { storage } from "./storage";
import {
  COMBAT_HP_SCALE,
  ActiveCombat,
  Equipment,
  GUILD_BANK_CONTRIBUTION,
  getItemResourceCategory,
  partyMembers,
  type QueueItem
} from "@shared/schema";

const ADMIN_EMAILS = ['betelgeusestd@gmail.com', 'yusufakgn61@gmail.com'];

function shouldLog(player: any): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (player?.staffRole === 'admin') return true;
  if (player?.email && ADMIN_EMAILS.includes(player.email)) return true;
  return false;
}
import { calculatePartyPassiveBuffs, getWeaponRole } from "@shared/partyBuffs";
import { calculateSkillSynergyBonus, type PartyMemberSkillStatus } from "@shared/partySynergyBonus";
import { isEquipmentItem } from "./itemUtils";
import { getCanonicalItemId } from "./inventoryHelper";
import {
  rollRarity,
  rollRarityForDrop,
  getEquipmentBonuses,
  getWeaponAttackSpeed,
  getWeaponLifesteal,
  getWeaponSkills,
  getFoodHealAmount,
  getBestFood,
} from "./combatUtils";
import {
  getWeaponAttackSpeedFromDb,
  getWeaponLifestealFromDb,
  getWeaponSkillsFromCache,
  cachedGameItems
} from "./scheduler";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { simulateOfflineCombat, type OfflineCombatInput } from "@shared/offlineEngine";
import { buildSlotsFromCache } from "./statAdapters";
import { resolveEquipmentStats } from "@shared/statResolver";
import type { ResolvedPlayerStats } from "@shared/combatTypes";
import { notifyIdleTimerExpired, notifyMaterialsDepleted, notifyMythicCraft } from "./utils/push";
import { calculateAchievementBuffs } from "@shared/achievementBuffs";
import { achievements, playerAchievements } from "@shared/schema";
import { calculateXpScaling, estimateContentLevel } from "@shared/xpScaling";

const MAX_DURABILITY = 100;

interface TaskOfflineProgress {
  offlineTimeMs: number;
  offlineTimeFormatted: string;
  skillId: string;
  skillName: string;
  xpEarned: number;
  itemsEarned: number;
  itemName: string;
  taskStopped: boolean;
  wasOverMaxTime: boolean;
  materialsDepleted?: boolean;
  mythicCrafts: { itemId: string; rarity: string }[];
  offlineStartTime?: number;
  craftedItems?: Record<string, number>;
}

interface CombatOfflineProgress {
  offlineTimeMs: number;
  offlineTimeFormatted: string;
  monstersKilled: number;
  playerDied: boolean;
  totalXpGained: { attack: number; strength: number; defence: number; hitpoints: number };
  lootGained: Record<string, number>;
  finalPlayerHp: number;
  foodEaten?: Record<string, number>;
  potionsConsumed?: Record<string, number>;
  brokenItems?: string[];
  durabilityLosses?: Record<string, { itemName: string; startDur: number; endDur: number }>;
  mythicDrops?: { itemId: string; monsterId: string }[];
  monsterId?: string;
  offlineStartTime?: number;
  partyBuffsApplied?: {
    foodHealBonus: number;
    defenseBonus: number;
    attackBonus: number;
    hasHealer: boolean;
    hasTank: boolean;
    hasDps: boolean;
  };
  partyMemberBuffDetails?: Array<{
    playerId: string;
    playerName: string;
    role: string;
    weaponType: string | null;
    buffType: 'healer' | 'tank' | 'dps';
    buffValue: number;
    buffLabel: string;
    durationMs: number;
    totalOfflineMs: number;
  }>;
  partySharedLoot?: Record<string, number>;
}

export interface FiremakingSlotProgress {
  logId: string;
  ashId: string;
  burnedCount: number;
  xpEarned: number;
}

export interface FiremakingOfflineProgress {
  offlineTimeMs: number;
  offlineTimeFormatted: string;
  totalXpEarned: number;
  slots: FiremakingSlotProgress[];
  ashProduced: Record<string, number>;
  logsConsumed: Record<string, number>;
}

export interface OfflineAchievementCompletion {
  achievementId: string;
  tier: number;
  badgeId?: string;
  rewardGold?: number;
}

export interface QueueStepResult {
  name: string;
  type: 'skill' | 'combat' | 'study';
  durationMs: number;
  xpEarned?: number;
  itemsEarned?: number;
  monstersKilled?: number;
  playerDied?: boolean;
  skillId?: string;
  itemName?: string;
  goldEarned?: number;
  lootItems?: Record<string, number>;
}

export interface OfflineProgressResult {
  offlineProgress: TaskOfflineProgress | null;
  combatOfflineProgress: CombatOfflineProgress | null;
  firemakingOfflineProgress: FiremakingOfflineProgress | null;
  playerUpdates: Record<string, any>;
  queueSteps?: QueueStepResult[];
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours} saat ${remainingMinutes} dakika`;
  } else if (minutes > 0) {
    return `${minutes} dakika`;
  } else {
    return `${seconds} saniye`;
  }
}

function getXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) {
    total += Math.floor(l + 300 * Math.pow(2, l / 7));
  }
  return Math.floor(total / 3.2);
}

function getLevelFromXp(xp: number): number {
  const MAX_LEVEL = 99;
  for (let l = 1; l <= MAX_LEVEL; l++) {
    if (xp < getXpForLevel(l + 1)) {
      return l;
    }
  }
  return MAX_LEVEL;
}

const LOG_TO_ASH_MAP: Record<string, string> = {
  normal_logs: "basic_ash",
  elderwood_logs: "elder_ash",
  oak_logs: "oak_ash",
  petrified_logs: "petrified_ash",
  cactus_logs: "cactus_ash",
  willow_logs: "willow_ash",
  darkwood_logs: "darkwood_ash",
  maple_logs: "maple_ash",
  dragon_logs: "dragon_ash",
  yew_logs: "yew_ash",
  ice_logs: "ice_ash",
  magic_logs: "magic_ash",
  void_logs: "void_ash",
};

export async function calculateOfflineProgress(
  player: any,
  offlineDurationMs: number
): Promise<OfflineProgressResult> {
  const now = Date.now();
  const offlineStartTime = now - offlineDurationMs;
  let offlineProgress: TaskOfflineProgress | null = null;
  let combatOfflineProgress: CombatOfflineProgress | null = null;
  let firemakingOfflineProgress: FiremakingOfflineProgress | null = null;
  const playerUpdates: Record<string, any> = {};

  const taskQueue: QueueItem[] = (player.taskQueue as QueueItem[]) || [];
  const hasQueue = taskQueue.length > 0;
  const activeTask = player.activeTask as any;
  const activeCombat = player.activeCombat as any;

  let cappedDuration = offlineDurationMs;
  let remainingTimeForQueue = 0;
  let v2CombatTimerExpired = false;

  if (activeTask?.queueDurationMs) {
    const actualOfflineStart = activeTask.lastClientTick || (player.lastLogoutAt ? new Date(player.lastLogoutAt).getTime() : offlineStartTime);
    const taskElapsed = Math.max(0, actualOfflineStart - (activeTask.startTime || actualOfflineStart));
    const timeLeftOnTask = Math.max(0, activeTask.queueDurationMs - taskElapsed);
    if (timeLeftOnTask === 0) {
      cappedDuration = Math.min(activeTask.queueDurationMs, offlineDurationMs);
      remainingTimeForQueue = Math.max(0, offlineDurationMs - cappedDuration);
    } else {
      cappedDuration = Math.min(offlineDurationMs, timeLeftOnTask);
      remainingTimeForQueue = Math.max(0, offlineDurationMs - timeLeftOnTask);
    }
  } else if (activeCombat?.queueDurationMs) {
    const actualOfflineStart = activeCombat.lastClientTick || (player.lastLogoutAt ? new Date(player.lastLogoutAt).getTime() : offlineStartTime);
    const combatElapsed = Math.max(0, actualOfflineStart - (activeCombat.combatStartTime || actualOfflineStart));
    const timeLeftOnCombat = Math.max(0, activeCombat.queueDurationMs - combatElapsed);
    if (timeLeftOnCombat === 0) {
      cappedDuration = Math.min(activeCombat.queueDurationMs, offlineDurationMs);
      remainingTimeForQueue = Math.max(0, offlineDurationMs - cappedDuration);
      // Timer was already exhausted at logout
      v2CombatTimerExpired = true;
    } else {
      cappedDuration = Math.min(offlineDurationMs, timeLeftOnCombat);
      remainingTimeForQueue = Math.max(0, offlineDurationMs - timeLeftOnCombat);
      // Timer expires when offline duration covers all remaining time
      v2CombatTimerExpired = offlineDurationMs >= timeLeftOnCombat;
    }
  } else if (hasQueue && !activeTask && !activeCombat) {
    cappedDuration = 0;
    remainingTimeForQueue = offlineDurationMs;
  }

  const activeEndTime = offlineStartTime + cappedDuration;

  const v2IdleOverride = activeTask?.queueDurationMs || activeCombat?.queueDurationMs || undefined;

  if (player.activeTask) {
    offlineProgress = await processTaskProgress(player, cappedDuration, activeEndTime, offlineStartTime, playerUpdates, v2IdleOverride);
  }

  if (player.activeCombat && !player.activeTask) {
    combatOfflineProgress = await processCombatProgress(player, cappedDuration, activeEndTime, offlineStartTime, playerUpdates, v2CombatTimerExpired);
  }

  // Guard: if the active V2 combat timer was fully consumed (based on actual elapsed time),
  // ensure activeCombat is cleared. This catches edge cases where processCombatProgress
  // didn't fire (player had activeTask) or the inner check missed it.
  if (v2CombatTimerExpired && activeCombat) {
    playerUpdates.activeCombat = null;
  }

  firemakingOfflineProgress = processFiremakingOfflineProgress(player, offlineDurationMs, now, playerUpdates);

  const queueSteps: QueueStepResult[] = [];
  const playerDiedOffline = combatOfflineProgress?.playerDied === true;

  if (hasQueue) {
    if (playerDiedOffline) {
      playerUpdates.taskQueue = [];
    } else {
      let updatedQueue = [...taskQueue];
      let stepStartTime = activeEndTime;

      while (remainingTimeForQueue > 0 && updatedQueue.length > 0) {
        const nextItem = updatedQueue[0];
        const stepTimeAvailable = Math.min(remainingTimeForQueue, nextItem.durationMs);
        const isComplete = remainingTimeForQueue >= nextItem.durationMs;
        if (isComplete) {
          updatedQueue.shift();
        } else {
          updatedQueue[0] = {
            ...nextItem,
            durationMs: nextItem.durationMs - stepTimeAvailable,
            status: 'running' as const,
          };
        }

        const step: QueueStepResult = {
          name: nextItem.name,
          type: nextItem.type,
          durationMs: stepTimeAvailable,
        };

        const evolvedPlayer = {
          ...player,
          skills: playerUpdates.skills || player.skills,
          inventory: playerUpdates.inventory || player.inventory,
          equipment: playerUpdates.equipment || player.equipment,
          equipmentDurability: playerUpdates.equipmentDurability || player.equipmentDurability,
          combatStats: playerUpdates.combatStats || player.combatStats,
          gold: playerUpdates.gold ?? player.gold,
          lastLogoutAt: null,
          lastSeen: null,
        };

        if (nextItem.type === 'skill' && nextItem.skillId) {
          const tempTask = {
            skillId: nextItem.skillId,
            actionId: nextItem.actionId,
            name: nextItem.name,
            duration: nextItem.actionDuration || 3000,
            xpReward: nextItem.xpReward || 0,
            startTime: stepStartTime,
            lastClientTick: stepStartTime,
            requiredBait: nextItem.requiredBait,
            baitAmount: nextItem.baitAmount,
            materials: nextItem.materials,
            itemId: nextItem.itemId,
          };
          evolvedPlayer.activeTask = tempTask;
          evolvedPlayer.activeCombat = null;
          const taskResult = await processTaskProgress(evolvedPlayer, stepTimeAvailable, stepStartTime + stepTimeAvailable, stepStartTime, playerUpdates, nextItem.durationMs);
          if (taskResult) {
            step.xpEarned = taskResult.xpEarned || 0;
            step.itemsEarned = taskResult.itemsEarned || 0;
            step.skillId = nextItem.skillId;
            step.itemName = taskResult.itemName || nextItem.name;
          }
        } else if (nextItem.type === 'combat' && nextItem.monsterId && nextItem.monsterData) {
          const md = nextItem.monsterData;
          const tempCombat = {
            monsterId: nextItem.monsterId,
            monsterCurrentHp: md.maxHp * COMBAT_HP_SCALE,
            monsterMaxHp: md.maxHp * COMBAT_HP_SCALE,
            monsterData: md,
            combatStartTime: stepStartTime,
            playerLastAttackTime: stepStartTime,
            monsterLastAttackTime: stepStartTime,
            lastClientTick: stepStartTime,
            combatStyle: activeCombat?.combatStyle || 'balanced',
            autoEatEnabled: activeCombat?.autoEatEnabled ?? true,
            autoEatThreshold: activeCombat?.autoEatThreshold ?? 50,
          };
          evolvedPlayer.activeTask = null;
          evolvedPlayer.activeCombat = tempCombat;
          const goldBeforeCombat = (playerUpdates.gold ?? player.gold) as number || 0;
          const combatResult = await processCombatProgress(evolvedPlayer, stepTimeAvailable, stepStartTime + stepTimeAvailable, stepStartTime, playerUpdates);
          if (combatResult) {
            step.monstersKilled = combatResult.monstersKilled || 0;
            const xpGained = combatResult.totalXpGained || { attack: 0, strength: 0, defence: 0, hitpoints: 0 };
            step.xpEarned = (xpGained.attack || 0) + (xpGained.strength || 0) + (xpGained.defence || 0) + (xpGained.hitpoints || 0);
            if (combatResult.lootGained && Object.keys(combatResult.lootGained).length > 0) {
              step.lootItems = combatResult.lootGained;
            }
            const goldAfterCombat = (playerUpdates.gold ?? player.gold) as number || 0;
            const goldDelta = goldAfterCombat - goldBeforeCombat;
            if (goldDelta > 0) step.goldEarned = goldDelta;
            if (combatResult.playerDied) {
              step.playerDied = true;
              updatedQueue = [];
              playerUpdates.taskQueue = [];
              queueSteps.push(step);
              break;
            }
          }
        }

        queueSteps.push(step);
        remainingTimeForQueue -= stepTimeAvailable;
        stepStartTime += stepTimeAvailable;
        if (!isComplete) break;
      }
      if (!playerUpdates.taskQueue) {
        playerUpdates.taskQueue = updatedQueue;
      }
    }
  }

  if (hasQueue && cappedDuration < offlineDurationMs) {
    playerUpdates.activeTask = null;
    playerUpdates.activeCombat = null;
  }

  if (Object.keys(playerUpdates).length > 0) {
    await storage.updatePlayer(player.id, playerUpdates);
  }

  return { offlineProgress, combatOfflineProgress, firemakingOfflineProgress, playerUpdates, queueSteps: queueSteps.length > 0 ? queueSteps : undefined };
}

async function processTaskProgress(
  player: any,
  offlineDurationMs: number,
  now: number,
  offlineStartTime: number,
  playerUpdates: Record<string, any>,
  overrideIdleLimitMs?: number
): Promise<TaskOfflineProgress | null> {
  const activeTask = player.activeTask as any;

  const taskSkillId = activeTask.skillId || activeTask.skill || "";
  const taskName = activeTask.name || activeTask.item || "";
  const taskDuration = activeTask.duration || activeTask.durationMs || 0;
  let taskStartTime = activeTask.startTime || 0;
  if (!taskStartTime && activeTask.startedAt) {
    taskStartTime = new Date(activeTask.startedAt).getTime();
  }
  if (shouldLog(player)) console.log(`[OfflineTask] Processing task: skill=${taskSkillId}, name=${taskName}, duration=${taskDuration}ms, startTime=${taskStartTime}`);

  if (taskSkillId === "firemaking") {
    const idleLimitMs = overrideIdleLimitMs || 6 * 60 * 60 * 1000;
    const fmLastLogoutTime = player.lastLogoutAt ? new Date(player.lastLogoutAt).getTime() : 0;
    let fmCappedClientTick = activeTask.lastClientTick || 0;
    if (fmLastLogoutTime > 0 && fmCappedClientTick > fmLastLogoutTime) {
      fmCappedClientTick = fmLastLogoutTime;
    }
    let fmCappedLastSeen = player.lastSeen ? new Date(player.lastSeen).getTime() : 0;
    if (fmLastLogoutTime > 0 && fmCappedLastSeen > fmLastLogoutTime) {
      fmCappedLastSeen = fmLastLogoutTime;
    }
    let fmCappedTaskStartTime = taskStartTime || 0;
    if (fmLastLogoutTime > 0 && fmCappedTaskStartTime > fmLastLogoutTime) {
      fmCappedTaskStartTime = fmLastLogoutTime;
    }
    const fmReferenceActivityTime = Math.max(
      fmCappedClientTick,
      fmLastLogoutTime,
      fmCappedLastSeen,
      fmCappedTaskStartTime
    );
    const fmIdleLimitEnd = fmReferenceActivityTime + idleLimitMs;
    if (now >= fmIdleLimitEnd) {
      playerUpdates.activeTask = null;
      player.activeTask = null;
    }
    return null;
  }

  const MIN_VALID_TIMESTAMP = 1704067200000;
  if (!taskDuration || taskDuration <= 0 || !taskStartTime || taskStartTime < MIN_VALID_TIMESTAMP) {
    playerUpdates.activeTask = null;
    player.activeTask = null;
    return {
      offlineTimeMs: 0,
      offlineTimeFormatted: "0 saniye",
      skillId: taskSkillId || "unknown",
      skillName: taskName || "Unknown Task",
      xpEarned: 0,
      itemsEarned: 0,
      itemName: taskName || "Unknown",
      taskStopped: true,
      wasOverMaxTime: false,
      materialsDepleted: false,
      mythicCrafts: [],
      offlineStartTime: 0,
    };
  }

  const idleLimitMs = overrideIdleLimitMs || 6 * 60 * 60 * 1000;
  const lastLogoutTime = player.lastLogoutAt ? new Date(player.lastLogoutAt).getTime() : 0;
  let cappedClientTick = activeTask.lastClientTick || 0;
  if (lastLogoutTime > 0 && cappedClientTick > lastLogoutTime) {
    cappedClientTick = lastLogoutTime;
  }
  let cappedLastSeen = player.lastSeen ? new Date(player.lastSeen).getTime() : 0;
  if (lastLogoutTime > 0 && cappedLastSeen > lastLogoutTime) {
    cappedLastSeen = lastLogoutTime;
  }
  let cappedTaskStartTime = taskStartTime || 0;
  if (lastLogoutTime > 0 && cappedTaskStartTime > lastLogoutTime) {
    cappedTaskStartTime = lastLogoutTime;
  }
  const referenceActivityTime = Math.max(
    cappedClientTick,
    lastLogoutTime,
    cappedLastSeen,
    cappedTaskStartTime
  );

  let anchorWinner = 'cappedTaskStartTime';
  if (referenceActivityTime === cappedClientTick) anchorWinner = 'cappedClientTick';
  else if (referenceActivityTime === lastLogoutTime) anchorWinner = 'lastLogoutTime';
  else if (referenceActivityTime === cappedLastSeen) anchorWinner = 'cappedLastSeen';

  const idleLimitEnd = referenceActivityTime + idleLimitMs;
  const effectiveOfflineEnd = Math.min(now, idleLimitEnd);

  let effectiveOfflineDurationMs = 0;
  if (effectiveOfflineEnd > referenceActivityTime) {
    effectiveOfflineDurationMs = effectiveOfflineEnd - referenceActivityTime;
  }

  effectiveOfflineDurationMs = Math.min(effectiveOfflineDurationMs, offlineDurationMs, idleLimitMs);

  const idleLimitReached = now >= idleLimitEnd;

  if (shouldLog(player)) {
    console.log(`[OfflineTask] idleLimitReached=${idleLimitReached}, idleLimitEnd=${idleLimitEnd}, referenceActivityTime=${referenceActivityTime}, now=${now}, offlineDuration=${offlineDurationMs}ms, effectiveOfflineDuration=${effectiveOfflineDurationMs}ms`);
    console.log(`[OfflineTrace] DURATION: effectiveOfflineDurationMs=${effectiveOfflineDurationMs}, offlineDurationMs=${offlineDurationMs}, cappedLastSeen=${cappedLastSeen}, rawLastSeen=${player.lastSeen ? new Date(player.lastSeen).getTime() : 0}, cappedClientTick=${cappedClientTick}, rawClientTick=${activeTask.lastClientTick || 0}, lastLogoutTime=${lastLogoutTime}, referenceActivityTime=${referenceActivityTime}, now=${now}, anchorWinner=${anchorWinner}, rawTaskStartTime=${taskStartTime}, cappedTaskStartTime=${cappedTaskStartTime}`);
  }

  if (effectiveOfflineDurationMs < 1000) {
    return null;
  }

  const guildBonuses = await storage.getPlayerGuildBonuses(player.id);

  const isGathering = ["mining", "woodcutting", "fishing"].includes(taskSkillId);
  const isCraftingTask = ["crafting", "cooking", "alchemy", "studying"].includes(taskSkillId);
  let speedBonus = 0;
  if (isGathering && guildBonuses?.gatheringBonus) {
    speedBonus = guildBonuses.gatheringBonus;
  } else if (isCraftingTask && guildBonuses?.craftingBonus) {
    speedBonus = guildBonuses.craftingBonus;
  }
  const idleBonus = guildBonuses?.idleBonus || 0;
  const boostedOfflineMs = effectiveOfflineDurationMs * (1 + idleBonus / 100);

  let synergySpeedBonus = 0;
  let synergyXpBonus = 0;
  try {
    const [partyMembership] = await db.select()
      .from(partyMembers)
      .where(eq(partyMembers.playerId, player.id));

    if (partyMembership && taskSkillId) {
      const thirtySecondsAgo = new Date(Date.now() - 30000);
      const allMembers = await db.select({
        playerId: partyMembers.playerId,
        currentSkill: partyMembers.currentSkill,
        currentRegion: partyMembers.currentRegion,
        lastSyncAt: partyMembers.lastSyncAt
      })
        .from(partyMembers)
        .where(eq(partyMembers.partyId, partyMembership.partyId));

      const memberStatuses: PartyMemberSkillStatus[] = allMembers
        .filter(m => m.lastSyncAt && new Date(m.lastSyncAt) >= thirtySecondsAgo)
        .map(m => ({
          playerId: m.playerId,
          playerName: '',
          currentSkill: m.currentSkill || null,
          currentRegion: m.currentRegion || null,
        }));

      const bonuses = calculateSkillSynergyBonus(taskSkillId, memberStatuses, player.id, player.currentRegion);
      synergySpeedBonus = bonuses.speedBonus;
      synergyXpBonus = bonuses.xpBonus;
    }
  } catch (e) {
  }

  const effectiveDuration = taskDuration / (1 + speedBonus / 100) / (1 + synergySpeedBonus);

  const taskItemId = activeTask.itemId || taskName;
  const carryKey = `${taskSkillId}:0:${taskItemId}`;
  const previousCarry = (player.taskProgressCarry as Record<string, number> || {})[carryKey] ?? 0;

  const elapsedAtSave = referenceActivityTime - cappedTaskStartTime;
  const remainingForFirstTask = Math.max(0, effectiveDuration - (elapsedAtSave % effectiveDuration));
  const timeAfterFirstTask = boostedOfflineMs - remainingForFirstTask;
  let rawCompletions = 0;
  if (remainingForFirstTask <= boostedOfflineMs) {
    rawCompletions = 1 + (Math.max(0, timeAfterFirstTask) / effectiveDuration);
  } else {
    rawCompletions = boostedOfflineMs / effectiveDuration;
  }

  const totalExpected = previousCarry + rawCompletions;
  let completions = Math.floor(totalExpected);
  let newCarry = Number((totalExpected - completions).toFixed(8));

  if (newCarry < 0) newCarry = 0;
  if (newCarry >= 1) { completions += Math.floor(newCarry); newCarry = Number((newCarry % 1).toFixed(8)); }

  if (shouldLog(player)) console.log(`[OfflineTrace] COMPLETIONS: effectiveDuration=${effectiveDuration}, rawCompletions=${rawCompletions}, previousCarry=${previousCarry}, totalExpected=${totalExpected}, completions=${completions}, newCarry=${newCarry}, elapsedAtSave=${elapsedAtSave}, remainingForFirstTask=${remainingForFirstTask}, boostedOfflineMs=${boostedOfflineMs}`);

  const inventory = player.inventory as Record<string, number>;
  const skills = player.skills as Record<string, { xp: number; level: number }>;
  const isStudying = taskSkillId === "studying";
  const isCrafting = (taskSkillId === "crafting" || taskSkillId === "cooking" || taskSkillId === "alchemy") && activeTask.materials;

  const taskItemIdForLog = activeTask.itemId || taskName;
  const inventoryBeforeCount = inventory[taskItemIdForLog] || 0;
  if (shouldLog(player)) console.log(`[OfflineTrace] PRE-APPLY: completions=${completions}, taskItemId=${taskItemIdForLog}, inventoryBefore=${inventoryBeforeCount}`);

  let actualCompletions = completions;
  let materialsDepleted = false;

  if (isStudying && taskName) {
    const available = inventory[taskName] || 0;
    if (available === 0) {
      actualCompletions = 0;
      materialsDepleted = true;
    } else if (available < completions) {
      actualCompletions = available;
      materialsDepleted = true;
    }
    if (actualCompletions > 0) {
      inventory[taskName] = available - actualCompletions;
      if (inventory[taskName] <= 0) delete inventory[taskName];
    }
  }

  if (isCrafting && activeTask.materials) {
    let maxPossibleCrafts = Infinity;
    for (const mat of activeTask.materials) {
      const available = inventory[mat.itemId] || 0;
      console.log(`[OfflineTask] Material check: ${mat.itemId} available=${available}, needed per craft=${mat.quantity}`);
      maxPossibleCrafts = Math.min(maxPossibleCrafts, Math.floor(available / mat.quantity));
    }
    if (maxPossibleCrafts === 0) {
      actualCompletions = 0;
      materialsDepleted = true;
    } else if (maxPossibleCrafts < completions) {
      actualCompletions = maxPossibleCrafts;
      materialsDepleted = true;
    }
    if (actualCompletions > 0) {
      for (const mat of activeTask.materials) {
        const used = mat.quantity * actualCompletions;
        inventory[mat.itemId] = (inventory[mat.itemId] || 0) - used;
        if (inventory[mat.itemId] <= 0) delete inventory[mat.itemId];
      }
    }
  }

  if ((taskSkillId === "fishing" || taskSkillId === "firemaking") && activeTask.requiredBait && activeTask.baitAmount) {
    const availableBait = inventory[activeTask.requiredBait] || 0;
    const maxWithBait = Math.floor(availableBait / activeTask.baitAmount);
    if (maxWithBait === 0) {
      actualCompletions = 0;
      materialsDepleted = true;
    } else if (maxWithBait < completions) {
      actualCompletions = maxWithBait;
      materialsDepleted = true;
    }
    if (actualCompletions > 0) {
      const baitUsed = activeTask.baitAmount * actualCompletions;
      inventory[activeTask.requiredBait] = (inventory[activeTask.requiredBait] || 0) - baitUsed;
      if (inventory[activeTask.requiredBait] <= 0) delete inventory[activeTask.requiredBait];
    }
  }

  if (shouldLog(player)) console.log(`[OfflineTask] Completions: raw=${rawCompletions}, withCarry=${totalExpected}, floor=${completions}, actualCompletions=${actualCompletions}, materialsDepleted=${materialsDepleted}, isCrafting=${isCrafting}, effectiveDuration=${effectiveDuration}ms, boostedOfflineMs=${boostedOfflineMs}ms`);
  if (shouldLog(player)) console.log(`[OfflineTrace] CLAMP-CHECK: completions=${completions}, actualCompletions=${actualCompletions}, materialsDepleted=${materialsDepleted}, isCrafting=${isCrafting}, isStudying=${isStudying}`);

  let xpEarned = 0;
  let itemsEarned = 0;
  let mythicCrafts: { itemId: string; rarity: string }[] = [];
  const equipCraftedItems: Record<string, number> = {};

  if (actualCompletions > 0) {
    const taskXpBonus = guildBonuses?.xpBonus || 0;
    const xpMultiplier = 1 + (taskXpBonus / 100);

    // Apply XP scaling based on player's skill level vs content level — same formula as
    // the online scheduler (server/scheduler.ts). This ensures offline and online XP
    // rates are mathematically identical per completion.
    const xpSkillId = isStudying ? "crafting" : taskSkillId;
    const currentSkillForScaling = skills[xpSkillId] || { xp: 0, level: 1 };
    const currentSkillLevel = currentSkillForScaling.level || 1;
    const taskContentLevel = estimateContentLevel(activeTask.xpReward);
    const taskXpScaling = calculateXpScaling(currentSkillLevel, taskContentLevel);

    xpEarned = Math.floor(actualCompletions * activeTask.xpReward * xpMultiplier * taskXpScaling.multiplier * (1 + synergyXpBonus));
    itemsEarned = actualCompletions;
    console.log(`[OfflineTask] XP calculation: actualCompletions=${actualCompletions}, xpReward=${activeTask.xpReward}, xpMultiplier=${xpMultiplier}, xpScalingMultiplier=${taskXpScaling.multiplier}, synergyXpBonus=${synergyXpBonus}, xpEarned=${xpEarned}, itemsEarned=${itemsEarned}`);

    const currentSkill = skills[xpSkillId] || { xp: 0, level: 0 };
    const newXp = currentSkill.xp + xpEarned;
    skills[xpSkillId] = { xp: newXp, level: newXp > 0 ? getLevelFromXp(newXp) : 0 };

    if (!isStudying) {
      const isEquipmentCraft = taskSkillId === "crafting" && isEquipmentItem(taskName);

      if (isEquipmentCraft) {
        for (let i = 0; i < actualCompletions; i++) {
          const rarity = rollRarity();
          const itemKey = `${taskName} (${rarity})`;
          equipCraftedItems[itemKey] = (equipCraftedItems[itemKey] || 0) + 1;
          if (rarity === "Mythic") {
            mythicCrafts.push({ itemId: itemKey, rarity });
          }
        }
        for (const [itemKey, count] of Object.entries(equipCraftedItems)) {
          inventory[itemKey] = (inventory[itemKey] || 0) + count;
        }
        if (shouldLog(player)) console.log(`[OfflineTrace] POST-APPLY(equip): totalCrafted=${actualCompletions}, uniqueItems=${Object.keys(equipCraftedItems).length}, items=${JSON.stringify(equipCraftedItems)}`);
      } else {
        const rawProducedItem = activeTask.itemId || taskName;
        const producedItem = await getCanonicalItemId(rawProducedItem);
        inventory[producedItem] = (inventory[producedItem] || 0) + itemsEarned;
        if (shouldLog(player)) console.log(`[OfflineTrace] POST-APPLY: itemsAdded=${itemsEarned}, inventoryAfter=${inventory[producedItem]}, producedItem=${producedItem}`);
      }
    }
  }

  const newTotalLevel = Object.values(skills).reduce((sum, s) => sum + s.level, 0);
  const taskStopped = idleLimitReached || materialsDepleted;

  if (idleLimitReached && !materialsDepleted) {
    try { await notifyIdleTimerExpired(player.id, taskName); } catch (e) {}
  }
  if (materialsDepleted) {
    try {
      const craftType = isStudying ? "study" : (taskSkillId === "cooking" ? "cooking" : "craft");
      await notifyMaterialsDepleted(player.id, craftType as 'craft' | 'cooking' | 'study', taskName);
    } catch (e) {}
  }
  if (mythicCrafts.length > 0) {
    const uniqueMythicItems = Array.from(new Set(mythicCrafts.map(m => m.itemId)));
    for (const itemKey of uniqueMythicItems) {
      try {
        const baseName = itemKey.replace(' (Mythic)', '');
        await notifyMythicCraft(player.id, baseName);
      } catch (e) {}
    }
  }

  if (itemsEarned > 0 && !isStudying) {
    const contributionChance = activeTask.materials && activeTask.materials.length > 0
      ? GUILD_BANK_CONTRIBUTION.materialFromCrafting
      : GUILD_BANK_CONTRIBUTION.materialFromGathering;

    if (Math.random() < contributionChance) {
      const category = getItemResourceCategory(taskName);
      if (category && category !== 'gold') {
        try {
          const playerGuild = await storage.getPlayerGuild(player.id);
          if (playerGuild) {
            const amount = Math.max(1, Math.floor(itemsEarned * 0.3));
            await storage.creditGuildBankResources(playerGuild.guild.id, { [category]: amount });
          }
        } catch (e) {}
      }
    }
  }

  const taskStartTimeBefore = activeTask.startTime || taskStartTime;
  const updatedActiveTask = taskStopped ? null : { ...activeTask, startTime: now, limitExpiresAt: now + idleLimitMs };
  if (shouldLog(player)) console.log(`[OfflineTrace] TASK-RESET: taskStartTimeBefore=${taskStartTimeBefore}, taskStartTimeAfter=${taskStopped ? 'null(stopped)' : now}, taskStopped=${taskStopped}, idleLimitReached=${idleLimitReached}, materialsDepleted=${materialsDepleted}`);
  const updatedCarry = { ...(player.taskProgressCarry as Record<string, number> || {}) };
  if (taskStopped) {
    delete updatedCarry[carryKey];
  } else {
    updatedCarry[carryKey] = newCarry;
  }
  playerUpdates.taskProgressCarry = updatedCarry;
  playerUpdates.skills = skills;
  playerUpdates.inventory = inventory;
  playerUpdates.activeTask = updatedActiveTask;
  playerUpdates.totalLevel = newTotalLevel;
  player.skills = skills;
  player.inventory = inventory;
  player.totalLevel = newTotalLevel;
  player.activeTask = updatedActiveTask;

  const producedItemName = activeTask.itemId || taskName;
  const maxOfflineMs = Math.min(idleLimitMs, Math.max(0, idleLimitEnd - offlineStartTime));

  if (shouldLog(player)) console.log(`[OfflineTask] Final result: skill=${taskSkillId}, xpEarned=${xpEarned}, itemsEarned=${itemsEarned}, taskStopped=${taskStopped}, materialsDepleted=${materialsDepleted}, effectiveOfflineDurationMs=${effectiveOfflineDurationMs}`);

  return {
    offlineTimeMs: effectiveOfflineDurationMs,
    offlineTimeFormatted: formatDuration(effectiveOfflineDurationMs),
    skillId: isStudying ? "crafting" : taskSkillId,
    skillName: isStudying ? `Öğrenme: ${taskName}` : taskName,
    xpEarned,
    itemsEarned: isStudying ? 0 : itemsEarned,
    itemName: producedItemName,
    taskStopped,
    wasOverMaxTime: offlineDurationMs >= idleLimitMs,
    materialsDepleted,
    mythicCrafts,
    offlineStartTime,
    craftedItems: Object.keys(equipCraftedItems).length > 0 ? equipCraftedItems : undefined,
  };
}

function processFiremakingOfflineProgress(
  player: any,
  offlineDurationMs: number,
  now: number,
  playerUpdates: Record<string, any>
): FiremakingOfflineProgress | null {
  const firemakingSlots = player.firemakingSlots as Record<string, any> | null;
  if (!firemakingSlots) return null;

  const slotsArray = Array.isArray(firemakingSlots) ? firemakingSlots : Object.values(firemakingSlots);
  if (!slotsArray || slotsArray.length === 0) return null;

  const hasActiveSlot = slotsArray.some((s: any) => s !== null && s !== undefined);
  if (!hasActiveSlot) return null;

  let totalXpEarned = 0;
  const slotResults: FiremakingSlotProgress[] = [];
  const ashProduced: Record<string, number> = {};
  const logsConsumed: Record<string, number> = {};
  const inventory = (player.inventory || {}) as Record<string, number>;
  const skills = (player.skills || {}) as Record<string, { xp: number; level: number }>;

  const carryUpdates: Record<string, number> = {};
  const updatedSlots = slotsArray.map((slot: any, index: number) => {
    if (!slot) return null;

    const slotIndex = index;
    const slotCarryKey = `firemaking:${slotIndex}:${slot.logId}`;
    const slotPreviousCarry = (player.taskProgressCarry as Record<string, number> || {})[slotCarryKey] ?? 0;

    const totalElapsed = now - slot.startTime;
    const rawCycles = totalElapsed / slot.duration;
    const totalWithCarry = slotPreviousCarry + rawCycles;
    const burnCyclesCompleted = Math.floor(totalWithCarry);
    let slotNewCarry = Number((totalWithCarry - burnCyclesCompleted).toFixed(8));
    if (slotNewCarry < 0) slotNewCarry = 0;
    if (slotNewCarry >= 1) slotNewCarry = slotNewCarry % 1;

    const previousBurnedCount = slot.burnedCount || 0;
    const newBurnedCount = Math.min(previousBurnedCount + burnCyclesCompleted, slot.quantity || 1);
    const actualBurned = newBurnedCount - previousBurnedCount;

    if (actualBurned > 0) {
      const ashId = LOG_TO_ASH_MAP[slot.logId] || slot.itemId || "basic_ash";
      ashProduced[ashId] = (ashProduced[ashId] || 0) + actualBurned;
      logsConsumed[slot.logId] = (logsConsumed[slot.logId] || 0) + actualBurned;
      const slotXp = (slot.xpReward || 0) * actualBurned;
      totalXpEarned += slotXp;

      slotResults.push({
        logId: slot.logId,
        ashId,
        burnedCount: actualBurned,
        xpEarned: slotXp,
      });
    }

    if (newBurnedCount >= (slot.quantity || 1)) {
      carryUpdates[slotCarryKey] = 0;
      return null;
    } else {
      carryUpdates[slotCarryKey] = slotNewCarry;
    }

    const remainderMs = totalElapsed % slot.duration;
    return {
      ...slot,
      startTime: now - remainderMs,
      burnedCount: newBurnedCount,
    };
  });

  if (Object.keys(carryUpdates).length > 0) {
    const existingCarry = (player.taskProgressCarry as Record<string, number> || {});
    playerUpdates.taskProgressCarry = { ...existingCarry, ...carryUpdates };
  }

  if (slotResults.length === 0) return null;

  for (const [logId, qty] of Object.entries(logsConsumed)) {
    const current = inventory[logId] || 0;
    const newQty = Math.max(0, current - qty);
    if (newQty === 0) delete inventory[logId];
    else inventory[logId] = newQty;
  }
  for (const [ashId, qty] of Object.entries(ashProduced)) {
    inventory[ashId] = (inventory[ashId] || 0) + qty;
  }

  if (totalXpEarned > 0) {
    const currentFm = skills.firemaking || { xp: 0, level: 1 };
    const newXp = currentFm.xp + totalXpEarned;
    const newLevel = getLevelFromXp(newXp);
    skills.firemaking = { xp: newXp, level: newLevel };
    playerUpdates.skills = skills;
  }

  playerUpdates.inventory = inventory;
  playerUpdates.firemakingSlots = updatedSlots;

  const hasRemainingActive = updatedSlots.some((s: any) => s !== null);
  if (!hasRemainingActive) {
    playerUpdates.activeTask = null;
    player.activeTask = null;
  }

  return {
    offlineTimeMs: offlineDurationMs,
    offlineTimeFormatted: formatDuration(offlineDurationMs),
    totalXpEarned,
    slots: slotResults,
    ashProduced,
    logsConsumed,
  };
}

async function processCombatProgress(
  player: any,
  offlineDurationMs: number,
  now: number,
  offlineStartTime: number,
  playerUpdates: Record<string, any>,
  v2CombatTimerExpired: boolean = false
): Promise<CombatOfflineProgress | null> {
  const activeCombat = player.activeCombat as ActiveCombat;
  const skills = player.skills as Record<string, { xp: number; level: number }>;

  if (activeCombat.monsterId && (!activeCombat.monsterMaxHp || !activeCombat.monsterAttackSpeed || !activeCombat.monsterXpReward)) {
    try {
      const monsterData = await storage.getGameMonster(activeCombat.monsterId);
      if (monsterData) {
        if (!activeCombat.monsterMaxHp) (activeCombat as any).monsterMaxHp = (monsterData.maxHitpoints as number) || 10;
        if (!activeCombat.monsterAttackSpeed) (activeCombat as any).monsterAttackSpeed = (monsterData.attackSpeed as number) || 3000;
        if (!activeCombat.monsterXpReward) (activeCombat as any).monsterXpReward = monsterData.xpReward as any;
        if (!activeCombat.monsterAttackLevel) (activeCombat as any).monsterAttackLevel = (monsterData.attackLevel as number) || 1;
        if (!activeCombat.monsterStrengthLevel) (activeCombat as any).monsterStrengthLevel = (monsterData.strengthLevel as number) || 1;
        if (!activeCombat.monsterDefenceLevel) (activeCombat as any).monsterDefenceLevel = (monsterData.defenceLevel as number) || 1;
        if (!activeCombat.monsterAttackBonus) (activeCombat as any).monsterAttackBonus = (monsterData.attackBonus as number) || 0;
        if (!activeCombat.monsterStrengthBonus) (activeCombat as any).monsterStrengthBonus = (monsterData.strengthBonus as number) || 0;
        if (!activeCombat.monsterLoot) (activeCombat as any).monsterLoot = monsterData.loot as any;
        if (!activeCombat.monsterSkills) (activeCombat as any).monsterSkills = (monsterData.skills as any) || undefined;
      }
    } catch (e) {
      console.error(`[Offline] Failed to load monster data for ${activeCombat.monsterId}:`, e);
    }
  }

  if (!activeCombat.monsterMaxHp || !activeCombat.monsterAttackSpeed || !activeCombat.monsterXpReward) {
    return null;
  }

  if (offlineDurationMs < 5000) {
    return null;
  }

  const equipment = { ...(player.equipment || {}) } as Record<string, string | null>;
  const inventory = { ...(player.inventory || {}) } as Record<string, number>;
  const equipmentDurability = { ...(player.equipmentDurability || {}) } as Record<string, number>;

  let enhancementLevels = new Map<string, number>();
  try {
    const enhancementResult = await db.execute(sql`
      SELECT item_id, enhancement_level FROM player_enhancements 
      WHERE player_id = ${player.id} AND enhancement_level > 0
    `);
    for (const row of enhancementResult.rows as any[]) {
      if (row.enhancement_level > 0) {
        enhancementLevels.set(row.item_id, row.enhancement_level);
      }
    }
  } catch (e) {}

  const itemModifications = (player.itemModifications as Record<string, any>) || {};
  const useCache = cachedGameItems.size > 0;
  let resolvedStats: ResolvedPlayerStats;
  if (useCache) {
    const slots = buildSlotsFromCache(equipment, enhancementLevels, itemModifications, cachedGameItems);
    resolvedStats = resolveEquipmentStats(slots);
  } else {
    const legacyBonuses = getEquipmentBonuses(equipment);
    resolvedStats = {
      attackLevel: 0, strengthLevel: 0, defenceLevel: 0, hitpointsLevel: 0,
      attackBonus: legacyBonuses.attackBonus ?? 0,
      strengthBonus: legacyBonuses.strengthBonus ?? 0,
      defenceBonus: legacyBonuses.defenceBonus ?? 0,
      hitpointsBonus: legacyBonuses.hitpointsBonus ?? 0,
      critChance: 0, critDamage: 0, attackSpeedBonus: 0, healingReceivedBonus: 0,
      onHitHealingPercent: 0, skillDamageBonus: 0,
      partyDpsBuff: 0, partyDefenceBuff: 0, partyAttackSpeedBuff: 0, lootChanceBonus: 0,
    };
  }

  const attackLevel = skills.attack?.level || 1;
  const strengthLevel = skills.strength?.level || 1;
  const defenceLevel = skills.defence?.level || 1;
  const hitpointsLevelLocal = skills.hitpoints?.level || 10;
  const combatStyle = (activeCombat.combatStyle || "balanced") as "attack" | "defence" | "balanced";

  const hpBonus = resolvedStats.hitpointsBonus || 0;
  let maxPlayerHp = (hitpointsLevelLocal * COMBAT_HP_SCALE) + hpBonus;
  const combatActiveBuffs = player.activeBuffs as Array<{ effectType: string; value: number; expiresAt: number }> | null;
  if (combatActiveBuffs) {
    const maxHpBoostBuff = combatActiveBuffs.find(b => b.effectType === "maxHpBoost" && b.expiresAt > now);
    if (maxHpBoostBuff) {
      maxPlayerHp = Math.floor(maxPlayerHp * (1 + maxHpBoostBuff.value / 100));
    }
  }

  let partyPassiveBuffs: { foodHealBonus: number; defenseBonus: number; attackBonus: number; hasHealer: boolean; hasTank: boolean; hasDps: boolean } | undefined = undefined;
  let playerPartyId: string | null = null;
  let partyMemberBuffDetails: Array<{
    playerId: string;
    playerName: string;
    role: string;
    weaponType: string | null;
    buffType: 'healer' | 'tank' | 'dps';
    buffValue: number;
    buffLabel: string;
    durationMs: number;
    totalOfflineMs: number;
  }> = [];
  try {
    const [membership] = await db.select()
      .from(partyMembers)
      .where(eq(partyMembers.playerId, player.id));

    if (membership) {
      playerPartyId = membership.partyId;
      const allMembers = await db.select({
        playerId: partyMembers.playerId,
        role: partyMembers.role,
        cachedWeaponType: partyMembers.cachedWeaponType,
        joinedAt: partyMembers.joinedAt,
        currentMonsterId: partyMembers.currentMonsterId,
      })
        .from(partyMembers)
        .where(eq(partyMembers.partyId, membership.partyId));

      const allOtherMembers = allMembers.filter(m => m.playerId !== player.id);
      const otherMembers = allOtherMembers.filter(m => !!m.currentMonsterId);
      const weaponTypes = otherMembers.map(m => m.cachedWeaponType);
      const buffs = calculatePartyPassiveBuffs(weaponTypes);
      partyPassiveBuffs = {
        foodHealBonus: buffs.foodHealBonus,
        defenseBonus: buffs.defenseBonus,
        attackBonus: buffs.attackBonus,
        hasHealer: buffs.hasHealer,
        hasTank: buffs.hasTank,
        hasDps: buffs.hasDps,
      };

      const snapshot = player.partySnapshotAtLogout as any;
      const offlineStart = player.lastLogoutAt ? new Date(player.lastLogoutAt).getTime() : (Date.now() - offlineDurationMs);
      const offlineEnd = Date.now();

      for (const member of otherMembers) {
        const role = getWeaponRole(member.cachedWeaponType);
        if (!role) continue;

        const wasInSnapshot = snapshot?.members?.find((s: any) => s.playerId === member.playerId);

        const joinTime = member.joinedAt ? new Date(member.joinedAt).getTime() : offlineStart;
        const buffStart = wasInSnapshot ? offlineStart : Math.max(joinTime, offlineStart);
        const buffDuration = Math.max(0, offlineEnd - buffStart);

        let playerName = 'Unknown';
        if (wasInSnapshot) {
          playerName = wasInSnapshot.playerName || 'Unknown';
        } else {
          try {
            const memberPlayer = await storage.getPlayer(member.playerId);
            playerName = memberPlayer?.username || 'Unknown';
          } catch {}
        }

        const buffConfig = role === 'healer'
          ? { buffType: 'healer' as const, buffLabel: 'foodHealBonus', buffValue: 0.20 }
          : role === 'tank'
          ? { buffType: 'tank' as const, buffLabel: 'defenseBonus', buffValue: 0.15 }
          : { buffType: 'dps' as const, buffLabel: 'attackBonus', buffValue: 0.10 };

        partyMemberBuffDetails.push({
          playerId: member.playerId,
          playerName,
          role: member.role,
          weaponType: member.cachedWeaponType,
          ...buffConfig,
          durationMs: buffDuration,
          totalOfflineMs: offlineDurationMs,
        });
      }

      if (snapshot?.members && snapshot.partyId === membership.partyId) {
        for (const snapMember of snapshot.members) {
          if (snapMember.playerId === player.id) continue;
          const stillHere = allOtherMembers.find(m => m.playerId === snapMember.playerId);
          if (!stillHere) {
            const snapRole = getWeaponRole(snapMember.cachedWeaponType);
            if (!snapRole) continue;

            const buffConfig = snapRole === 'healer'
              ? { buffType: 'healer' as const, buffLabel: 'foodHealBonus', buffValue: 0.20 }
              : snapRole === 'tank'
              ? { buffType: 'tank' as const, buffLabel: 'defenseBonus', buffValue: 0.15 }
              : { buffType: 'dps' as const, buffLabel: 'attackBonus', buffValue: 0.10 };

            partyMemberBuffDetails.push({
              playerId: snapMember.playerId,
              playerName: snapMember.playerName || 'Unknown',
              role: snapMember.role,
              weaponType: snapMember.cachedWeaponType,
              ...buffConfig,
              durationMs: Math.floor(offlineDurationMs * 0.5),
              totalOfflineMs: offlineDurationMs,
            });
          }
        }
      }
    }
  } catch (e) {}

  const monsterMaxHpScaled = activeCombat.monsterMaxHp ?? (10 * COMBAT_HP_SCALE);

  const guildBonuses = await storage.getPlayerGuildBonuses(player.id);

  const offlineActiveBuffs: Array<{ effectType: string; value: number; remainingMs: number }> = [];
  if (combatActiveBuffs) {
    for (const buff of combatActiveBuffs) {
      if (buff.expiresAt > offlineStartTime) {
        offlineActiveBuffs.push({
          effectType: buff.effectType,
          value: buff.value,
          remainingMs: buff.expiresAt - offlineStartTime,
        });
      }
    }
  }

  const bestFood = (activeCombat.selectedFood && inventory[activeCombat.selectedFood] > 0) ? activeCombat.selectedFood : getBestFood(inventory);
  let foodHealAmount = 0;
  let foodCount = 0;
  let foodId: string | null = null;
  if (activeCombat.autoEatEnabled && bestFood) {
    foodId = bestFood;
    foodHealAmount = getFoodHealAmount(bestFood);
    foodCount = inventory[bestFood] || 0;
  }

  try {
    const allAch = await db.select({
      id: achievements.id,
      category: achievements.category,
      tiers: achievements.tiers,
    }).from(achievements);
    const playerAch = await db.select({
      achievementId: playerAchievements.achievementId,
      completedTiers: playerAchievements.completedTiers,
    }).from(playerAchievements).where(eq(playerAchievements.playerId, player.id));

    const progressMap = new Map(playerAch.map(p => [p.achievementId, p]));
    const completedCountByCategory: Record<string, number> = {};
    for (const ach of allAch) {
      const cat = ach.category || 'general';
      if (!completedCountByCategory[cat]) completedCountByCategory[cat] = 0;
      const tiersList = (ach.tiers as any[]) || [];
      const pa = progressMap.get(ach.id);
      const ct = (pa?.completedTiers as number[]) || [];
      if (tiersList.length > 0 && ct.length >= tiersList.length) {
        completedCountByCategory[cat]++;
      }
    }

    const achBuffs = calculateAchievementBuffs(completedCountByCategory);
    for (const buff of achBuffs) {
      if (buff.value <= 0) continue;
      if (buff.buffType === 'attackPercent') {
        const totalAttack = attackLevel + resolvedStats.attackBonus;
        const buffedTotal = Math.floor(totalAttack * (1 + buff.value / 100));
        resolvedStats.attackBonus = buffedTotal - attackLevel;
      } else if (buff.buffType === 'defencePercent') {
        const totalDefence = defenceLevel + resolvedStats.defenceBonus;
        const buffedTotal = Math.floor(totalDefence * (1 + buff.value / 100));
        resolvedStats.defenceBonus = buffedTotal - defenceLevel;
      } else if (buff.buffType === 'maxHp') {
        maxPlayerHp += buff.value;
      }
    }
  } catch (e) {
    console.error('[Offline] Failed to apply achievement buffs:', e);
  }

  const playerStats: ResolvedPlayerStats = {
    ...resolvedStats,
    attackLevel: attackLevel,
    strengthLevel: strengthLevel,
    defenceLevel: defenceLevel,
    hitpointsLevel: hitpointsLevelLocal,
  };

  const offlineInput: OfflineCombatInput = {
    playerStats,
    combatStyle,
    maxPlayerHp,
    currentPlayerHp: player.currentHitpoints ?? maxPlayerHp,
    weaponAttackSpeed: useCache ? getWeaponAttackSpeedFromDb(equipment) : getWeaponAttackSpeed(equipment),
    weaponLifesteal: useCache ? getWeaponLifestealFromDb(equipment) : getWeaponLifesteal(equipment),
    weaponSkills: (useCache ? getWeaponSkillsFromCache(equipment, itemModifications) : getWeaponSkills(equipment)).map(s => ({
      chance: s.chance, type: s.type, hits: s.hits, damageMultiplier: s.damageMultiplier,
    })),
    monsterMaxHp: monsterMaxHpScaled,
    monsterAttackLevel: activeCombat.monsterAttackLevel ?? 1,
    monsterStrengthLevel: activeCombat.monsterStrengthLevel ?? 1,
    monsterDefenceLevel: activeCombat.monsterDefenceLevel ?? 1,
    monsterAttackBonus: activeCombat.monsterAttackBonus ?? 0,
    monsterStrengthBonus: activeCombat.monsterStrengthBonus ?? 0,
    monsterAttackSpeed: activeCombat.monsterAttackSpeed ?? 2400,
    monsterSkills: activeCombat.monsterSkills || [],
    monsterLoot: activeCombat.monsterLoot || [],
    monsterXpReward: activeCombat.monsterXpReward || { attack: 10, strength: 10, defence: 10, hitpoints: 10 },
    monsterId: activeCombat.monsterId || "",
    guildBonuses: guildBonuses ? {
      combatPower: guildBonuses.combatPower,
      defensePower: guildBonuses.defensePower,
      xpBonus: guildBonuses.xpBonus,
      lootBonus: guildBonuses.lootBonus,
      goldBonus: guildBonuses.goldBonus,
    } : undefined,
    partyBuffs: partyPassiveBuffs ? {
      foodHealBonus: partyPassiveBuffs.foodHealBonus,
      defenseBonus: partyPassiveBuffs.defenseBonus,
      attackBonus: partyPassiveBuffs.attackBonus,
    } : undefined,
    activeBuffs: offlineActiveBuffs,
    autoEatEnabled: activeCombat.autoEatEnabled ?? false,
    autoEatThreshold: activeCombat.autoEatThreshold ?? 50,
    foodHealAmount,
    foodCount,
    foodId,
    equipmentDurability,
    equipmentSlots: Object.entries(equipment).filter(([_, v]) => v != null).map(([k]) => k),
  };

  const initialDurability: Record<string, number> = {};
  for (const [slot, itemId] of Object.entries(equipment)) {
    if (itemId) {
      initialDurability[slot] = equipmentDurability[slot] ?? MAX_DURABILITY;
    }
  }

  if (shouldLog(player)) console.log(`[OfflineTrace][COMBAT] DURATION: offlineDurationMs=${offlineDurationMs} (raw, no anchor shrinkage), monsterId=${activeCombat.monsterId}, autoEat=${activeCombat.autoEatEnabled}, foodCount=${foodCount}`);

  const simResult = simulateOfflineCombat(offlineInput, offlineDurationMs);

  for (const [skill, xp] of Object.entries(simResult.xpGained)) {
    if (xp > 0 && skills[skill]) {
      const newXp = skills[skill].xp + xp;
      skills[skill] = { xp: newXp, level: getLevelFromXp(newXp) };
    }
  }

  const lootGained: Record<string, number> = {};
  const mythicDrops: { itemId: string; monsterId: string }[] = [];
  const previousCarry: Record<string, number> = player.lootCarry || {};
  const newCarry: Record<string, number> = {};
  const carryMonsterId = activeCombat.monsterId || "unknown";

  for (const { itemId, expectedCount } of simResult.expectedLoot) {
    const carryKey = `${carryMonsterId}:${itemId}`;
    const carry = previousCarry[carryKey] || 0;
    const totalExpected = carry + expectedCount;
    const guaranteedDrops = Math.floor(totalExpected);
    newCarry[carryKey] = Number((totalExpected - guaranteedDrops).toFixed(8));

    if (guaranteedDrops <= 0) continue;

    if (itemId === "Gold Coins") {
      playerUpdates.gold = (player.gold || 0) + guaranteedDrops;
      player.gold = playerUpdates.gold;
      lootGained[itemId] = guaranteedDrops;
    } else if (isEquipmentItem(itemId)) {
      for (let i = 0; i < guaranteedDrops; i++) {
        const rarity = rollRarityForDrop();
        const finalItemId = `${itemId} (${rarity})`;
        inventory[finalItemId] = (inventory[finalItemId] || 0) + 1;
        lootGained[finalItemId] = (lootGained[finalItemId] || 0) + 1;
        if (rarity === "Mythic") {
          mythicDrops.push({ itemId: finalItemId, monsterId: activeCombat.monsterId || "" });
        }
      }
    } else {
      const canonicalId = await getCanonicalItemId(itemId);
      inventory[canonicalId] = (inventory[canonicalId] || 0) + guaranteedDrops;
      lootGained[canonicalId] = (lootGained[canonicalId] || 0) + guaranteedDrops;
    }
  }

  playerUpdates.lootCarry = newCarry;

  if (foodId && simResult.foodConsumed > 0) {
    inventory[foodId] = Math.max(0, (inventory[foodId] || 0) - simResult.foodConsumed);
    if (inventory[foodId] <= 0) delete inventory[foodId];
  }

  for (const [slot, loss] of Object.entries(simResult.durabilityLost)) {
    if (loss > 0) {
      const current = equipmentDurability[slot] ?? MAX_DURABILITY;
      equipmentDurability[slot] = Math.max(10, current - loss);
    }
  }

  const durabilityLosses: Record<string, { itemName: string; startDur: number; endDur: number }> = {};
  const brokenItems: string[] = [];
  for (const [slot, itemId] of Object.entries(equipment)) {
    if (itemId) {
      const startDur = initialDurability[slot] ?? MAX_DURABILITY;
      const endDur = equipmentDurability[slot] ?? startDur;
      if (startDur !== endDur) {
        durabilityLosses[slot] = { itemName: itemId, startDur, endDur };
        if (endDur <= 10) {
          brokenItems.push(itemId);
        }
      }
    }
  }

  const newTotalLevel = Object.values(skills).reduce((sum, s) => sum + s.level, 0);
  const playerDied = simResult.deaths > 0;

  playerUpdates.skills = skills;
  playerUpdates.inventory = inventory;
  playerUpdates.equipment = equipment;
  playerUpdates.equipmentDurability = equipmentDurability;
  playerUpdates.totalLevel = newTotalLevel;
  playerUpdates.currentHitpoints = simResult.finalPlayerHp;
  playerUpdates.activeBuffs = (combatActiveBuffs || []).filter(b => b.expiresAt > now);

  player.skills = skills;
  player.inventory = inventory;
  player.equipment = equipment;
  player.equipmentDurability = equipmentDurability;
  player.totalLevel = newTotalLevel;
  player.currentHitpoints = simResult.finalPlayerHp;
  player.activeBuffs = playerUpdates.activeBuffs;

  let partySharedLoot: Record<string, number> = {};
  if (playerPartyId && simResult.kills > 0) {
    try {
      const allMembers = await db.select()
        .from(partyMembers)
        .where(eq(partyMembers.partyId, playerPartyId));

      const otherMembers = allMembers.filter(m => m.playerId !== player.id);
      if (otherMembers.length > 0) {
        const currentMonsterId = activeCombat.monsterId || "";

        const activeMembers: Array<{ playerId: string; monsterId: string; isSameMonster: boolean }> = [];
        for (const member of otherMembers) {
          let memberMonsterId = member.currentMonsterId;

          if (!memberMonsterId) {
            try {
              const memberPlayer = await storage.getPlayer(member.playerId);
              if (memberPlayer?.activeCombat) {
                const combat = typeof memberPlayer.activeCombat === 'string'
                  ? JSON.parse(memberPlayer.activeCombat)
                  : memberPlayer.activeCombat;
                memberMonsterId = combat?.monsterId || null;
              }
            } catch {}
          }

          if (!memberMonsterId) continue;
          activeMembers.push({
            playerId: member.playerId,
            monsterId: memberMonsterId,
            isSameMonster: memberMonsterId === currentMonsterId,
          });
        }

        if (activeMembers.length > 0) {
          activeMembers.sort((a, b) => (b.isSameMonster ? 1 : 0) - (a.isSameMonster ? 1 : 0));

          let consolidatedChance = 0;
          for (let i = 0; i < activeMembers.length; i++) {
            const contribution = activeMembers[i].isSameMonster ? 6 : 3;
            consolidatedChance += contribution * Math.pow(0.75, i);
          }
          consolidatedChance = Math.min(consolidatedChance, 20);

          const tickCount = Math.floor(offlineDurationMs / 30000);
          let rollCount = 0;
          for (let t = 0; t < tickCount; t++) {
            if (Math.random() * 100 < consolidatedChance) rollCount++;
          }

          for (let r = 0; r < rollCount; r++) {
            const donor = activeMembers[Math.floor(Math.random() * activeMembers.length)];
            const monster = await storage.getGameMonster(donor.monsterId);
            const monsterLoot = monster?.loot as Array<{ itemId: string; chance: number; minQty: number; maxQty: number }> | null;
            if (!monsterLoot || monsterLoot.length === 0) continue;

            let randomDrop: { itemId: string; chance: number; minQty: number; maxQty: number } | null = null;
            for (let retry = 0; retry < 3; retry++) {
              const successfulRolls = monsterLoot.filter(d => Math.random() * 100 < d.chance);
              if (successfulRolls.length === 0) continue;
              const candidate = successfulRolls[Math.floor(Math.random() * successfulRolls.length)];
              if (candidate && !isEquipmentItem(candidate.itemId)) {
                randomDrop = candidate;
                break;
              }
            }
            if (!randomDrop) continue;

            const rawQty = randomDrop.minQty + Math.floor(Math.random() * (randomDrop.maxQty - randomDrop.minQty + 1));
            const qty = Math.max(1, Math.ceil(rawQty * 0.5));
            const canonicalDropId = await getCanonicalItemId(randomDrop.itemId);
            partySharedLoot[canonicalDropId] = (partySharedLoot[canonicalDropId] || 0) + qty;
            inventory[canonicalDropId] = (inventory[canonicalDropId] || 0) + qty;
          }
        }
      }
    } catch (e) {}
  }

  if (playerDied || v2CombatTimerExpired) {
    playerUpdates.activeCombat = null;
    player.activeCombat = null;
  } else {
    const cleanedActiveCombat = {
      ...activeCombat,
      lastClientTick: now,
      monsterCurrentHp: Math.max(0, simResult.kills > 0 ? offlineInput.monsterMaxHp : (simResult.combatCycleMs ? (offlineInput.monsterMaxHp - (simResult.playerDps * (offlineDurationMs % simResult.combatCycleMs) / 1000)) : offlineInput.monsterMaxHp)),
    };
    playerUpdates.activeCombat = cleanedActiveCombat;
    player.activeCombat = cleanedActiveCombat;
  }

  const foodEaten: Record<string, number> = {};
  if (foodId && simResult.foodConsumed > 0) {
    foodEaten[foodId] = simResult.foodConsumed;
  }

  return {
    offlineTimeMs: offlineDurationMs,
    offlineTimeFormatted: formatDuration(offlineDurationMs),
    monstersKilled: simResult.kills,
    playerDied,
    totalXpGained: simResult.xpGained,
    lootGained,
    finalPlayerHp: simResult.finalPlayerHp,
    foodEaten,
    potionsConsumed: {},
    brokenItems,
    durabilityLosses,
    mythicDrops,
    monsterId: activeCombat.monsterId || "",
    offlineStartTime,
    partyBuffsApplied: partyPassiveBuffs || undefined,
    partyMemberBuffDetails: partyMemberBuffDetails.length > 0 ? partyMemberBuffDetails : undefined,
    partySharedLoot: Object.keys(partySharedLoot).length > 0 ? partySharedLoot : undefined,
  };
}

export async function processOfflineAchievements(
  playerId: string,
  offlineResult: OfflineProgressResult,
  playerSkills: Record<string, { xp: number; level: number }>,
): Promise<{ newlyCompleted: OfflineAchievementCompletion[]; totalGoldReward: number }> {
  const updates: { trackingKey: string; value: number; mode: "increment" | "set" }[] = [];

  const taskProgress = offlineResult.offlineProgress;
  if (taskProgress && taskProgress.xpEarned > 0) {
    const skillId = taskProgress.skillId;
    if (skillId && taskProgress.itemsEarned > 0) {
      updates.push({ trackingKey: `${skillId}_actions`, value: taskProgress.itemsEarned, mode: "increment" });
    }
    if (skillId) {
      updates.push({ trackingKey: `${skillId}_xp`, value: taskProgress.xpEarned, mode: "increment" });
    }
    if (["crafting", "cooking", "alchemy"].includes(skillId) && taskProgress.itemsEarned > 0) {
      updates.push({ trackingKey: "crafting_actions", value: taskProgress.itemsEarned, mode: "increment" });
    }
    if (skillId === "cooking" && taskProgress.itemsEarned > 0) {
      updates.push({ trackingKey: "cooking_actions", value: taskProgress.itemsEarned, mode: "increment" });
    }
    if (skillId === "alchemy" && taskProgress.itemsEarned > 0) {
      updates.push({ trackingKey: "alchemy_actions", value: taskProgress.itemsEarned, mode: "increment" });
    }
    if (taskProgress.mythicCrafts && taskProgress.mythicCrafts.length > 0) {
      updates.push({ trackingKey: "craft_mythic", value: taskProgress.mythicCrafts.length, mode: "increment" });
    }
  }

  const combatProgress = offlineResult.combatOfflineProgress;
  if (combatProgress) {
    if (combatProgress.monstersKilled > 0) {
      updates.push({ trackingKey: "total_kills", value: combatProgress.monstersKilled, mode: "increment" });
      if (combatProgress.monsterId) {
        updates.push({ trackingKey: `kill_${combatProgress.monsterId}`, value: combatProgress.monstersKilled, mode: "increment" });
      }
    }

    if (combatProgress.totalXpGained) {
      const { attack = 0, strength = 0, defence = 0, hitpoints = 0 } = combatProgress.totalXpGained;
      if (attack > 0) updates.push({ trackingKey: "attack_xp", value: attack, mode: "increment" });
      if (strength > 0) updates.push({ trackingKey: "strength_xp", value: strength, mode: "increment" });
      if (defence > 0) updates.push({ trackingKey: "defence_xp", value: defence, mode: "increment" });
      if (hitpoints > 0) updates.push({ trackingKey: "hitpoints_xp", value: hitpoints, mode: "increment" });
    }

    if (combatProgress.foodEaten) {
      const totalFoodEaten = Object.values(combatProgress.foodEaten).reduce((sum, v) => sum + v, 0);
      if (totalFoodEaten > 0) {
        updates.push({ trackingKey: "food_eaten", value: totalFoodEaten, mode: "increment" });
      }
    }

    if (combatProgress.potionsConsumed) {
      const totalPotions = Object.values(combatProgress.potionsConsumed).reduce((sum, v) => sum + v, 0);
      if (totalPotions > 0) {
        updates.push({ trackingKey: "potions_used", value: totalPotions, mode: "increment" });
      }
    }

    if (combatProgress.playerDied) {
      updates.push({ trackingKey: "total_deaths", value: 1, mode: "increment" });
    }
  }

  const firemakingProgress = offlineResult.firemakingOfflineProgress;
  if (firemakingProgress && firemakingProgress.totalXpEarned > 0) {
    const totalBurned = firemakingProgress.slots.reduce((sum, s) => sum + s.burnedCount, 0);
    if (totalBurned > 0) {
      updates.push({ trackingKey: "firemaking_actions", value: totalBurned, mode: "increment" });
    }
    updates.push({ trackingKey: "firemaking_xp", value: firemakingProgress.totalXpEarned, mode: "increment" });
  }

  for (const [skillId, skillData] of Object.entries(playerSkills)) {
    if (skillData.level > 1) {
      updates.push({ trackingKey: `level_${skillId}`, value: skillData.level, mode: "set" });
    }
  }
  const totalLevel = Object.values(playerSkills).reduce((sum, s) => sum + s.level, 0);
  if (totalLevel > 0) {
    updates.push({ trackingKey: "total_level", value: totalLevel, mode: "set" });
  }

  if (updates.length === 0) {
    return { newlyCompleted: [], totalGoldReward: 0 };
  }

  const allAchievements = await storage.getAllAchievements();
  const achByTrackingKey = new Map<string, typeof allAchievements>();
  for (const a of allAchievements) {
    const existing = achByTrackingKey.get(a.trackingKey) || [];
    existing.push(a);
    achByTrackingKey.set(a.trackingKey, existing);
  }
  const existingProgress = await storage.getPlayerAchievements(playerId);
  const progressMap = new Map(existingProgress.map(p => [p.achievementId, p]));

  const newlyCompleted: OfflineAchievementCompletion[] = [];

  for (const { trackingKey, value, mode } of updates) {
    const matchingAchievements = achByTrackingKey.get(trackingKey);
    if (!matchingAchievements || matchingAchievements.length === 0) continue;

    for (const achievement of matchingAchievements) {
      const existing = progressMap.get(achievement.id);
      const currentProgress = existing?.progress || 0;
      const newProgress = mode === "set" ? Math.max(currentProgress, value) : currentProgress + value;
      if (newProgress === currentProgress && existing) continue;

      const tiersList = (achievement.tiers as any[]) || [];
      const previouslyCompletedTiers: number[] = (existing?.completedTiers as number[]) || [];
      const newCompletedTiers = [...previouslyCompletedTiers];

      for (const t of tiersList) {
        if (newProgress >= t.threshold && !newCompletedTiers.includes(t.tier)) {
          newCompletedTiers.push(t.tier);
          newlyCompleted.push({
            achievementId: achievement.id,
            tier: t.tier,
            badgeId: t.badgeId,
            rewardGold: t.rewardGold,
          });
        }
      }

      await storage.upsertPlayerAchievement(playerId, achievement.id, newProgress, newCompletedTiers);
      progressMap.set(achievement.id, { progress: newProgress, completedTiers: newCompletedTiers } as any);
    }
  }

  let totalGoldReward = 0;
  for (const c of newlyCompleted) {
    if (c.rewardGold) {
      totalGoldReward += c.rewardGold;
    }
    if (c.badgeId) {
      try {
        const badge = await storage.getBadge(c.badgeId);
        if (badge) {
          const existingBadges = await storage.getPlayerBadges(playerId);
          if (!existingBadges.some(b => b.badgeId === c.badgeId)) {
            await storage.awardBadge(playerId, c.badgeId);
          }
        }
      } catch (e) {}
    }
  }

  if (totalGoldReward > 0) {
    await db.execute(sql`UPDATE players SET gold = gold + ${totalGoldReward} WHERE id = ${playerId}`);
  }

  return { newlyCompleted, totalGoldReward };
}
