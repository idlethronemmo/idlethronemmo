import { db } from "../../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  dungeons, dungeonV2Config, dungeonSessions, dungeonMemberStates, dungeonVotes,
  playerDungeonKeys, playerDungeonProgress, dungeonLootTables, dungeonFloorTemplates,
  dungeonHiddenBosses, gameMonsters, players,
  type DungeonV2ConfigSnapshot, type DungeonCurse, type MemberStatsSnapshot,
  type Player,
} from "@shared/schema";
import {
  COMBAT_HP_SCALE,
  buildDungeonPlayerHit,
  buildDungeonPlayerDps,
  buildDungeonMonsterHit,
  scaledMonsterHp,
  scaledMonsterAttack,
} from "@shared/dungeonCombat";
import { cachedGameItems, refreshItemCache } from "../scheduler";
import { getCanonicalItemId } from "../inventoryHelper";
import { getLevelFromXp } from "@shared/gameMath";
import { resolvePlayerCombatStats } from "../playerStatsResolver";
import { isFood, getFoodHealAmount, isPotion, getPotionData } from "../combatUtils";
import {
  createSeededRng, simulateSoloDungeon, resolveFloor, calculateExtractionPercent,
  type SoloSimulationInput, type MemberFloorInput, type FloorResolutionInput,
  type DungeonLootTableInput,
} from "@shared/dungeonEngine";

const DEFAULT_CONFIG: DungeonV2ConfigSnapshot = {
  requiredKeys: 1,
  maxMembers: 5,
  maxFloors: 30,
  maxRunTimeMinutes: 480,
  voteInterval: 5,
  voteDuration: 60,
  baseExtraction: 100,
  penaltyCoef: 5,
  minExtraction: 20,
  maxExtraction: 100,
  maxRisk: 20,
  chaosThreshold: 10,
  multiplierCap: 500,
  curseCap: 5,
  durabilityMultiplier: 100,
  itemDestructionChance: 0,
  threatDecay: 10,
  bossTriggerRules: { minCurseStack: 3, minFloor: 20, minChaosTriggers: 5 },
  maxLootPerSession: 500,
};

const MIN_DURABILITY = 10;
const CONSUME_COOLDOWN_MS = 3000;
const consumeCooldowns = new Map<string, number>();

export class DungeonV2Service {

  async getDungeonConfig(dungeonId: string): Promise<DungeonV2ConfigSnapshot> {
    const [config] = await db.select()
      .from(dungeonV2Config)
      .where(and(
        eq(dungeonV2Config.dungeonId, dungeonId),
        eq(dungeonV2Config.isActive, 1),
      ))
      .limit(1);

    if (!config) {
      const [dungeon] = await db.select()
        .from(dungeons)
        .where(eq(dungeons.id, dungeonId))
        .limit(1);

      const floorCount = dungeon?.floorCount;
      return {
        ...DEFAULT_CONFIG,
        maxFloors: floorCount && floorCount > 0 ? floorCount : DEFAULT_CONFIG.maxFloors,
      };
    }

    return {
      requiredKeys: config.requiredKeys,
      maxMembers: config.maxMembers,
      maxFloors: config.maxFloors,
      maxRunTimeMinutes: config.maxRunTimeMinutes,
      voteInterval: config.voteInterval,
      voteDuration: config.voteDuration,
      baseExtraction: config.baseExtraction,
      penaltyCoef: config.penaltyCoef,
      minExtraction: config.minExtraction,
      maxExtraction: config.maxExtraction,
      maxRisk: config.maxRisk,
      chaosThreshold: config.chaosThreshold,
      multiplierCap: config.multiplierCap,
      curseCap: config.curseCap,
      durabilityMultiplier: config.durabilityMultiplier,
      itemDestructionChance: config.itemDestructionChance,
      threatDecay: config.threatDecay,
      bossTriggerRules: (config.bossTriggerRules as any) || DEFAULT_CONFIG.bossTriggerRules,
      maxLootPerSession: config.maxLootPerSession,
    };
  }

  async listDungeons(playerId: string, language: string): Promise<any[]> {
    const allDungeons = await db.select()
      .from(dungeons)
      .where(eq(dungeons.isActive, 1));

    if (allDungeons.length === 0) return [];

    const dungeonIds = allDungeons.map(d => d.id);

    const [configs, lootTables, keyRows, progressRows] = await Promise.all([
      db.select().from(dungeonV2Config).where(inArray(dungeonV2Config.dungeonId, dungeonIds)),
      db.select().from(dungeonLootTables).where(inArray(dungeonLootTables.dungeonId, dungeonIds)),
      db.select().from(playerDungeonKeys).where(eq(playerDungeonKeys.playerId, playerId)),
      db.select().from(playerDungeonProgress).where(
        and(eq(playerDungeonProgress.playerId, playerId), inArray(playerDungeonProgress.dungeonId, dungeonIds)),
      ),
    ]);

    const configMap = new Map(configs.map(c => [c.dungeonId, c]));
    const lootMap = new Map<string, typeof lootTables>();
    for (const lt of lootTables) {
      const arr = lootMap.get(lt.dungeonId) || [];
      arr.push(lt);
      lootMap.set(lt.dungeonId, arr);
    }
    const keyMap = new Map(keyRows.map(k => [k.keyType, k.quantity]));
    const progressMap = new Map(progressRows.map(p => [p.dungeonId, p]));

    return allDungeons.map(d => {
      const translations = (d.nameTranslations as Record<string, string>) || {};
      const descTranslations = (d.descriptionTranslations as Record<string, string>) || {};

      return {
        ...d,
        localizedName: translations[language] || translations.en || d.name,
        localizedDescription: descTranslations[language] || descTranslations.en || d.description,
        config: configMap.get(d.id) || null,
        lootTables: lootMap.get(d.id) || [],
        playerKeyCount: keyMap.get(d.keyType) || 0,
        playerProgress: progressMap.get(d.id) || null,
      };
    });
  }

  async startSoloDungeon(
    playerId: string,
    dungeonId: string,
    goOffline: boolean,
  ): Promise<{ success: boolean; sessionId?: string; session?: any; error?: string }> {
    try {
      const [player] = await db.select()
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      if (!player) {
        return { success: false, error: "Player not found" };
      }

      const activeResult = await this.getActiveSession(playerId);
      if (activeResult?.session) {
        return { success: false, error: "You already have an active dungeon session" };
      }

      const [dungeon] = await db.select()
        .from(dungeons)
        .where(and(eq(dungeons.id, dungeonId), eq(dungeons.isActive, 1)))
        .limit(1);

      if (!dungeon) {
        return { success: false, error: "Dungeon not found" };
      }

      const config = await this.getDungeonConfig(dungeonId);

      const memberInput = await this.buildMemberFloorInput(player);

      const statsSnapshot: MemberStatsSnapshot = {
        attackLevel: memberInput.dps > 0 ? Math.floor(memberInput.dps) : 1,
        strengthLevel: 1,
        defenceLevel: 1,
        hitpointsLevel: Math.floor(memberInput.maxHp / COMBAT_HP_SCALE),
        maxHp: memberInput.maxHp,
        equipBonuses: {},
        weaponType: memberInput.weaponType,
        attackSpeed: memberInput.attackSpeed,
        dps: memberInput.dps,
        healEfficiency: memberInput.healEfficiency,
      };

      const result = await db.transaction(async (tx) => {
        const keysDeducted = await this.deductKeys(playerId, dungeon.keyType, config.requiredKeys, tx);
        if (!keysDeducted) {
          return { success: false as const, error: `Not enough ${dungeon.keyType} keys (need ${config.requiredKeys})` };
        }

        await tx.update(players)
          .set({ activeTask: null, activeCombat: null })
          .where(eq(players.id, playerId));

        if (goOffline) {
          const seed = `${playerId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

          const [session] = await tx.insert(dungeonSessions)
            .values({
              dungeonId,
              mode: "solo",
              status: "active",
              playerId,
              isOffline: 1,
              offlineSeed: seed,
              offlineStartedAt: new Date(),
              configSnapshot: config,
            })
            .returning();

          await tx.insert(dungeonMemberStates)
            .values({
              sessionId: session.id,
              playerId,
              isAlive: 1,
              statsSnapshot: statsSnapshot,
              role: memberInput.role || "dps",
            });

          return { success: true as const, sessionId: session.id };
        }

        const [session] = await tx.insert(dungeonSessions)
          .values({
            dungeonId,
            mode: "solo",
            status: "active",
            playerId,
            isOffline: 0,
            configSnapshot: config,
          })
          .returning();

        await tx.insert(dungeonMemberStates)
          .values({
            sessionId: session.id,
            playerId,
            isAlive: 1,
            statsSnapshot: statsSnapshot,
            role: memberInput.role || "dps",
          });

        return { success: true as const, sessionId: session.id, session };
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      if (goOffline) {
        return { success: true, sessionId: result.sessionId };
      }

      const monsterPool = await this.getMonsterPool(dungeonId, 1);

      return {
        success: true,
        sessionId: result.sessionId,
        session: {
          ...result.session,
          memberInput,
          monsterPool: monsterPool.slice(0, 3),
        },
      };
    } catch (error) {
      console.error("[DungeonV2Service] startSoloDungeon error:", error);
      return { success: false, error: "Failed to start dungeon" };
    }
  }

  async claimOfflineSoloDungeon(
    playerId: string,
    sessionId: string,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      const [session] = await db.select()
        .from(dungeonSessions)
        .where(and(
          eq(dungeonSessions.id, sessionId),
          eq(dungeonSessions.playerId, playerId),
          eq(dungeonSessions.status, "active"),
          eq(dungeonSessions.isOffline, 1),
        ))
        .limit(1);

      if (!session) {
        return { success: false, error: "No active offline session found" };
      }

      if (!session.offlineStartedAt || !session.offlineSeed) {
        return { success: false, error: "Invalid offline session data" };
      }

      const [player] = await db.select()
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      if (!player) {
        return { success: false, error: "Player not found" };
      }

      const now = Date.now();
      const startedAt = new Date(session.offlineStartedAt).getTime();
      const elapsedMinutes = Math.max(1, (now - startedAt) / 60000);

      const config = (session.configSnapshot as DungeonV2ConfigSnapshot) || await this.getDungeonConfig(session.dungeonId);

      const memberInput = await this.buildMemberFloorInput(player);
      const monsterPool = await this.getMonsterPool(session.dungeonId, 1);

      if (monsterPool.length === 0) {
        return { success: false, error: "No monsters found for this dungeon" };
      }

      const lootTables = await this.getAllLootTables(session.dungeonId);

      const simInput: SoloSimulationInput = {
        dungeonId: session.dungeonId,
        seed: session.offlineSeed,
        playerStats: memberInput,
        monsterPool,
        maxFloors: config.maxFloors,
        maxRunTimeMinutes: config.maxRunTimeMinutes,
        elapsedMinutes,
        config,
        lootTables,
      };

      const simResult = simulateSoloDungeon(simInput);

      const extractionPercent = simResult.extractionPercent;
      const finalLoot: Record<string, number> = {};
      for (const [itemId, qty] of Object.entries(simResult.lootEarned)) {
        const finalQty = Math.floor(qty * extractionPercent / 100);
        if (finalQty > 0) finalLoot[itemId] = finalQty;
      }

      const status = simResult.deathOccurred ? "failed" : "completed";

      await db.transaction(async (tx) => {
        await this.awardLootToPlayer(playerId, finalLoot, simResult.goldEarned, simResult.xpEarned, tx);

        if (simResult.durabilityLost > 0) {
          await this.applyDurabilityLoss(playerId, simResult.durabilityLost, tx);
        }

        await tx.update(dungeonSessions)
          .set({
            status,
            endedAt: new Date(),
            floorsCleared: simResult.floorsCleared,
            riskLevel: simResult.finalRiskLevel,
            lootPool: finalLoot,
            goldPool: simResult.goldEarned,
            xpPool: simResult.xpEarned,
            hiddenBossSpawned: simResult.hiddenBossEncountered ? 1 : 0,
            hiddenBossDefeated: simResult.hiddenBossDefeated ? 1 : 0,
          })
          .where(eq(dungeonSessions.id, sessionId));

        await this.updatePlayerProgress(playerId, session.dungeonId, simResult.floorsCleared, tx);
      });

      return {
        success: true,
        result: {
          floorsCleared: simResult.floorsCleared,
          loot: finalLoot,
          gold: simResult.goldEarned,
          xp: simResult.xpEarned,
          durabilityLost: simResult.durabilityLost,
          deathOccurred: simResult.deathOccurred,
          diedAtFloor: simResult.diedAtFloor,
          extractionPercent,
          hiddenBossEncountered: simResult.hiddenBossEncountered,
          hiddenBossDefeated: simResult.hiddenBossDefeated,
        },
      };
    } catch (error) {
      console.error("[DungeonV2Service] claimOfflineSoloDungeon error:", error);
      return { success: false, error: "Failed to claim offline dungeon results" };
    }
  }

  async processFloor(
    playerId: string,
    sessionId: string,
    autoConsumeOptions?: { autoEat?: boolean; autoPotion?: boolean; foodId?: string; potionId?: string; hpThresholdPercent?: number },
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      const [session] = await db.select()
        .from(dungeonSessions)
        .where(and(
          eq(dungeonSessions.id, sessionId),
          eq(dungeonSessions.playerId, playerId),
          eq(dungeonSessions.status, "active"),
          eq(dungeonSessions.isOffline, 0),
        ))
        .limit(1);

      if (!session) {
        return { success: false, error: "No active online session found" };
      }

      const config = (session.configSnapshot as DungeonV2ConfigSnapshot) || await this.getDungeonConfig(session.dungeonId);
      const currentFloor = session.currentFloor;

      if (currentFloor > config.maxFloors) {
        const [dungeon] = await db.select().from(dungeons)
          .where(eq(dungeons.id, session.dungeonId)).limit(1);
        const isEndless = dungeon?.isEndless === 1;

        if (!isEndless) {
          await db.update(dungeonSessions)
            .set({ status: "completed", endedAt: new Date() })
            .where(eq(dungeonSessions.id, sessionId));
          return { success: true, result: { completed: true, reason: "max_floors" } };
        }
      }

      const [player] = await db.select()
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      if (!player) {
        return { success: false, error: "Player not found" };
      }

      const monsterPool = await this.getMonsterPool(session.dungeonId, currentFloor);
      if (monsterPool.length === 0) {
        return { success: false, error: "No monsters for this floor" };
      }

      const rng = createSeededRng(`${sessionId}_floor_${currentFloor}`);
      const monsterIdx = Math.floor(rng() * monsterPool.length);
      const monster = monsterPool[monsterIdx];

      const memberInput = await this.buildMemberFloorInput(player);

      const [memberState] = await db.select()
        .from(dungeonMemberStates)
        .where(and(
          eq(dungeonMemberStates.sessionId, sessionId),
          eq(dungeonMemberStates.playerId, playerId),
        ))
        .limit(1);

      if (memberState) {
        memberInput.currentHp = memberState.isAlive === 1
          ? Math.max(1, memberInput.currentHp)
          : 0;
        memberInput.isAlive = memberState.isAlive === 1;
        memberInput.currentThreat = memberState.currentThreat;
      }

      if (!memberInput.isAlive) {
        return { success: false, error: "Player is dead" };
      }

      const activeCurses = (session.activeCurses as DungeonCurse[]) || [];

      const lootTable = await this.getLootTableForFloor(session.dungeonId, currentFloor);

      const floorInput: FloorResolutionInput = {
        floor: currentFloor,
        monsterHp: monster.hp,
        monsterAttack: monster.attack,
        monsterDefence: monster.defence,
        monsterAttackSpeed: monster.attackSpeed,
        members: [memberInput],
        riskLevel: session.riskLevel,
        chaosMeter: session.chaosMeter,
        currentMultiplier: session.currentMultiplier,
        activeCurses,
        config,
        rng,
        lootTable,
        generateReplay: true,
        monsterSkills: monster.skills || [],
        isBossFloor: monster.isBossFloor || false,
        isPartyMode: false,
      };

      const floorResult = resolveFloor(floorInput);
      const playerResult = floorResult.membersAfter.find(m => m.playerId === playerId);

      if (!playerResult) {
        return { success: false, error: "Floor resolution error" };
      }

      const currentLootPool = (session.lootPool as Record<string, number>) || {};
      for (const [itemId, qty] of Object.entries(floorResult.lootGenerated)) {
        currentLootPool[itemId] = (currentLootPool[itemId] || 0) + qty;
      }

      const newGoldPool = session.goldPool + floorResult.goldGenerated;
      const newXpPool = session.xpPool + floorResult.xpGenerated;
      const newFloor = currentFloor + 1;
      const newFloorsCleared = session.floorsCleared + 1;

      await db.update(dungeonSessions)
        .set({
          currentFloor: newFloor,
          floorsCleared: newFloorsCleared,
          riskLevel: floorResult.newRiskLevel,
          chaosMeter: Math.floor(floorResult.newChaosMeter),
          currentMultiplier: floorResult.newMultiplier,
          activeCurses: floorResult.newCurses,
          curseStack: floorResult.newCurses.reduce((s, c) => s + c.stackCount, 0),
          lootPool: currentLootPool,
          goldPool: newGoldPool,
          xpPool: newXpPool,
          lastFloorAt: new Date(),
          lastDbWriteFloor: newFloorsCleared,
          hiddenBossSpawned: floorResult.hiddenBossTriggered ? 1 : session.hiddenBossSpawned,
        })
        .where(eq(dungeonSessions.id, sessionId));

      await db.update(dungeonMemberStates)
        .set({
          isAlive: playerResult.isAlive ? 1 : 0,
          currentThreat: playerResult.currentThreat,
          totalDamageDealt: (memberState?.totalDamageDealt || 0) + playerResult.damageDealt,
          totalHealingDone: (memberState?.totalHealingDone || 0) + playerResult.healingDone,
          durabilityLost: (memberState?.durabilityLost || 0) + Math.floor(playerResult.durabilityLoss),
          diedAtFloor: !playerResult.isAlive ? currentFloor : memberState?.diedAtFloor || null,
        })
        .where(and(
          eq(dungeonMemberStates.sessionId, sessionId),
          eq(dungeonMemberStates.playerId, playerId),
        ));

      if (!playerResult.isAlive) {
        await db.update(dungeonSessions)
          .set({ status: "failed", endedAt: new Date() })
          .where(eq(dungeonSessions.id, sessionId));
      }

      let autoConsumeResult: { foodConsumed?: { itemId: string; healAmount: number; newHp: number }; potionConsumed?: { itemId: string; buffApplied: string } } = {};
      if (playerResult.isAlive && autoConsumeOptions && (autoConsumeOptions.autoEat || autoConsumeOptions.autoPotion)) {
        autoConsumeResult = await this.autoConsumeAfterFloor(playerId, sessionId, autoConsumeOptions);
      }

      const finalPlayerHp = autoConsumeResult.foodConsumed?.newHp ?? playerResult.currentHp;

      return {
        success: true,
        result: {
          floor: currentFloor,
          monsterDefeated: floorResult.monsterDefeated,
          monster: { id: monster.id, hp: monster.hp, attack: monster.attack, defence: monster.defence, skills: monster.skills || [], isBoss: monster.isBossFloor || false },
          playerAlive: playerResult.isAlive,
          playerHp: finalPlayerHp,
          playerMaxHp: memberInput.maxHp,
          damageDealt: playerResult.damageDealt,
          damageTaken: playerResult.damageTaken,
          healingDone: playerResult.healingDone,
          durabilityLoss: playerResult.durabilityLoss,
          lootGenerated: floorResult.lootGenerated,
          goldGenerated: floorResult.goldGenerated,
          xpGenerated: floorResult.xpGenerated,
          riskLevel: floorResult.newRiskLevel,
          chaosMeter: floorResult.newChaosMeter,
          multiplier: floorResult.newMultiplier,
          curses: floorResult.newCurses,
          chaosTriggered: floorResult.chaosTriggered,
          hiddenBossTriggered: floorResult.hiddenBossTriggered,
          nextFloor: newFloor,
          totalLoot: currentLootPool,
          totalGold: newGoldPool,
          totalXp: newXpPool,
          autoConsume: autoConsumeResult,
          combatReplay: floorResult.combatReplay,
          partyLootBonus: floorResult.partyLootBonus,
        },
      };
    } catch (error) {
      console.error("[DungeonV2Service] processFloor error:", error);
      return { success: false, error: "Failed to process floor" };
    }
  }

  async extractFromDungeon(
    playerId: string,
    sessionId: string,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      const [session] = await db.select()
        .from(dungeonSessions)
        .where(and(
          eq(dungeonSessions.id, sessionId),
          eq(dungeonSessions.playerId, playerId),
          eq(dungeonSessions.status, "active"),
        ))
        .limit(1);

      if (!session) {
        const [anySession] = await db.select()
          .from(dungeonSessions)
          .where(and(
            eq(dungeonSessions.id, sessionId),
            eq(dungeonSessions.playerId, playerId),
          ))
          .limit(1);
        if (anySession && ['completed', 'failed', 'extracted'].includes(anySession.status)) {
          return { success: true, result: { alreadyCompleted: true } };
        }
        return { success: false, error: "No active session found" };
      }

      const config = (session.configSnapshot as DungeonV2ConfigSnapshot) || await this.getDungeonConfig(session.dungeonId);
      const extractionPercent = calculateExtractionPercent(session.riskLevel, config);

      const lootPool = (session.lootPool as Record<string, number>) || {};
      const finalLoot: Record<string, number> = {};
      for (const [itemId, qty] of Object.entries(lootPool)) {
        const finalQty = Math.floor(qty * extractionPercent / 100);
        if (finalQty > 0) finalLoot[itemId] = finalQty;
      }

      const finalGold = Math.floor(session.goldPool * extractionPercent / 100);
      const finalXp = Math.floor(session.xpPool * extractionPercent / 100);

      await db.transaction(async (tx) => {
        await this.awardLootToPlayer(playerId, finalLoot, finalGold, finalXp, tx);

        const [memberState] = await tx.select()
          .from(dungeonMemberStates)
          .where(and(
            eq(dungeonMemberStates.sessionId, sessionId),
            eq(dungeonMemberStates.playerId, playerId),
          ))
          .limit(1);

        if (memberState && memberState.durabilityLost > 0) {
          await this.applyDurabilityLoss(playerId, memberState.durabilityLost, tx);
        }

        await tx.update(dungeonSessions)
          .set({
            status: "extracted",
            endedAt: new Date(),
          })
          .where(eq(dungeonSessions.id, sessionId));

        if (memberState) {
          await tx.update(dungeonMemberStates)
            .set({
              hasExited: 1,
              exitedAtFloor: session.currentFloor,
              exitExtractionPercent: Math.floor(extractionPercent),
              personalLootEarned: finalLoot,
              personalGoldEarned: finalGold,
              personalXpEarned: finalXp,
            })
            .where(eq(dungeonMemberStates.id, memberState.id));
        }

        await this.updatePlayerProgress(playerId, session.dungeonId, session.floorsCleared, tx);
      });

      return {
        success: true,
        result: {
          floorsCleared: session.floorsCleared,
          extractionPercent,
          loot: finalLoot,
          gold: finalGold,
          xp: finalXp,
          riskLevel: session.riskLevel,
        },
      };
    } catch (error) {
      console.error("[DungeonV2Service] extractFromDungeon error:", error);
      return { success: false, error: "Failed to extract from dungeon" };
    }
  }

  async consumeItem(
    playerId: string,
    sessionId: string,
    type: 'food' | 'potion',
    itemId: string,
  ): Promise<{ success: boolean; healAmount?: number; buffApplied?: string; newHp?: number; newInventory?: Record<string, number>; error?: string; cooldownRemaining?: number }> {
    try {
      const [session] = await db.select()
        .from(dungeonSessions)
        .where(and(
          eq(dungeonSessions.id, sessionId),
          eq(dungeonSessions.status, "active"),
          eq(dungeonSessions.isOffline, 0),
        ))
        .limit(1);

      if (!session) {
        return { success: false, error: "No active online session found" };
      }

      if (session.mode === 'solo' && session.playerId !== playerId) {
        return { success: false, error: "Not your session" };
      }

      if (session.mode === 'party') {
        const [memberState] = await db.select()
          .from(dungeonMemberStates)
          .where(and(
            eq(dungeonMemberStates.sessionId, sessionId),
            eq(dungeonMemberStates.playerId, playerId),
          ))
          .limit(1);
        if (!memberState) {
          return { success: false, error: "Not a member of this session" };
        }
      }

      const cooldownKey = `${playerId}:${sessionId}`;
      const now = Date.now();
      const lastConsumed = consumeCooldowns.get(cooldownKey) || 0;
      const elapsed = now - lastConsumed;
      if (elapsed < CONSUME_COOLDOWN_MS) {
        const remaining = Math.ceil((CONSUME_COOLDOWN_MS - elapsed) / 1000);
        return { success: false, error: `Cooldown active`, cooldownRemaining: remaining };
      }

      const [player] = await db.select()
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      if (!player) {
        return { success: false, error: "Player not found" };
      }

      const inventory = { ...(player.inventory as Record<string, number> || {}) };
      if (!inventory[itemId] || inventory[itemId] <= 0) {
        return { success: false, error: "Item not in inventory" };
      }

      if (type === 'food') {
        if (!isFood(itemId)) {
          return { success: false, error: "Item is not food" };
        }

        const memberInput = await this.buildMemberFloorInput(player);
        const currentHp = Math.min(player.currentHitpoints, memberInput.maxHp);
        if (currentHp >= memberInput.maxHp) {
          return { success: false, error: "HP is already full" };
        }

        const baseHeal = getFoodHealAmount(itemId);
        const healAmount = Math.min(baseHeal * COMBAT_HP_SCALE, memberInput.maxHp - currentHp);
        const newHp = currentHp + healAmount;

        inventory[itemId] -= 1;
        if (inventory[itemId] <= 0) delete inventory[itemId];

        await db.update(players)
          .set({
            inventory,
            currentHitpoints: newHp,
          })
          .where(eq(players.id, playerId));

        consumeCooldowns.set(cooldownKey, now);

        return { success: true, healAmount, newHp, newInventory: inventory };

      } else {
        if (!isPotion(itemId)) {
          return { success: false, error: "Item is not a potion" };
        }

        const potionData = getPotionData(itemId);
        if (!potionData) {
          return { success: false, error: "Invalid potion" };
        }

        const activeBuffs = (player.activeBuffs || []) as Array<{ effectType: string; value: number; expiresAt: number }>;
        const existingBuff = activeBuffs.find(b => b.effectType === potionData.effectType && b.expiresAt > now);
        if (existingBuff) {
          return { success: false, error: "Buff already active" };
        }

        inventory[itemId] -= 1;
        if (inventory[itemId] <= 0) delete inventory[itemId];

        const newBuff = {
          effectType: potionData.effectType,
          value: potionData.value,
          expiresAt: now + potionData.duration * 1000,
        };
        const newBuffs = [...activeBuffs.filter(b => b.expiresAt > now), newBuff];

        const memberInput = await this.buildMemberFloorInput(player);
        const currentHp = Math.min(player.currentHitpoints, memberInput.maxHp);

        await db.update(players)
          .set({
            inventory,
            activeBuffs: newBuffs,
          })
          .where(eq(players.id, playerId));

        consumeCooldowns.set(cooldownKey, now);

        return { success: true, buffApplied: potionData.effectType, newHp: currentHp, newInventory: inventory };
      }
    } catch (error) {
      console.error("[DungeonV2Service] consumeItem error:", error);
      return { success: false, error: "Failed to consume item" };
    }
  }

  async autoConsumeAfterFloor(
    playerId: string,
    sessionId: string,
    options: { autoEat?: boolean; autoPotion?: boolean; foodId?: string; potionId?: string; hpThresholdPercent?: number },
  ): Promise<{ foodConsumed?: { itemId: string; healAmount: number; newHp: number }; potionConsumed?: { itemId: string; buffApplied: string } }> {
    const result: { foodConsumed?: { itemId: string; healAmount: number; newHp: number }; potionConsumed?: { itemId: string; buffApplied: string } } = {};

    try {
      const [player] = await db.select()
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      if (!player) return result;

      const memberInput = await this.buildMemberFloorInput(player);
      const currentHp = Math.min(player.currentHitpoints, memberInput.maxHp);
      const hpPercent = (currentHp / memberInput.maxHp) * 100;
      const threshold = options.hpThresholdPercent ?? 50;

      if (options.autoEat && options.foodId && hpPercent < threshold && currentHp < memberInput.maxHp) {
        const inventory = { ...(player.inventory as Record<string, number> || {}) };
        if (inventory[options.foodId] && inventory[options.foodId] > 0 && isFood(options.foodId)) {
          const baseHeal = getFoodHealAmount(options.foodId);
          const healAmount = Math.min(baseHeal * COMBAT_HP_SCALE, memberInput.maxHp - currentHp);
          const newHp = currentHp + healAmount;

          inventory[options.foodId] -= 1;
          if (inventory[options.foodId] <= 0) delete inventory[options.foodId];

          await db.update(players)
            .set({
              inventory,
              currentHitpoints: newHp,
            })
            .where(eq(players.id, playerId));

          result.foodConsumed = { itemId: options.foodId, healAmount, newHp };
        }
      }

      if (options.autoPotion && options.potionId) {
        const [freshPlayer] = await db.select()
          .from(players)
          .where(eq(players.id, playerId))
          .limit(1);

        if (freshPlayer) {
          const inventory = { ...(freshPlayer.inventory as Record<string, number> || {}) };
          const activeBuffs = (freshPlayer.activeBuffs || []) as Array<{ effectType: string; value: number; expiresAt: number }>;
          const now = Date.now();

          if (inventory[options.potionId] && inventory[options.potionId] > 0 && isPotion(options.potionId)) {
            const potionData = getPotionData(options.potionId);
            if (potionData) {
              const existingBuff = activeBuffs.find(b => b.effectType === potionData.effectType && b.expiresAt > now);
              if (!existingBuff) {
                inventory[options.potionId] -= 1;
                if (inventory[options.potionId] <= 0) delete inventory[options.potionId];

                const newBuff = {
                  effectType: potionData.effectType,
                  value: potionData.value,
                  expiresAt: now + potionData.duration * 1000,
                };
                const newBuffs = [...activeBuffs.filter(b => b.expiresAt > now), newBuff];

                await db.update(players)
                  .set({
                    inventory,
                    activeBuffs: newBuffs,
                  })
                  .where(eq(players.id, playerId));

                result.potionConsumed = { itemId: options.potionId, buffApplied: potionData.effectType };
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("[DungeonV2Service] autoConsumeAfterFloor error:", error);
    }

    return result;
  }

  private async buildMemberFloorInput(player: Player): Promise<MemberFloorInput> {
    const skills = (player.skills as Record<string, { xp: number; level: number }>) || {};
    const equipment = (player.equipment as Record<string, string | null>) || {};
    const activeBuffs = (player.activeBuffs || []) as Array<{ effectType: string; value: number; expiresAt: number }>;
    const itemModifications = (player.itemModifications as Record<string, any>) || {};

    if (cachedGameItems.size === 0) await refreshItemCache();

    let enhancementLevels = new Map<string, number>();
    try {
      const result = await db.execute(sql`
        SELECT item_id, enhancement_level
        FROM weapon_enhancements
        WHERE player_id = ${player.id}
      `);
      for (const row of result.rows as any[]) {
        if (row.enhancement_level > 0) {
          enhancementLevels.set(row.item_id, row.enhancement_level);
        }
      }
    } catch (_e) {}

    const combatStats = resolvePlayerCombatStats({
      skills,
      equipment,
      itemModifications,
      activeBuffs,
      enhancementLevels,
    });

    const { minHit, maxHit, avgHit } = buildDungeonPlayerHit(combatStats.strengthLevel, combatStats.equipBonuses.strengthBonus);
    const dps = buildDungeonPlayerDps(avgHit, combatStats.finalAttackSpeedMs);

    const isStaff = combatStats.weaponCategory === "staff" || (equipment.weapon && equipment.weapon.toLowerCase().includes("staff"));
    const healEfficiency = isStaff ? dps * 0.6 : 0;

    const totalDefence = combatStats.defenceLevel + combatStats.equipBonuses.defenceBonus;

    const role = isStaff ? "healer" : "dps";

    const critChance = Math.min(50, (combatStats.equipBonuses.critChance || 0) + (combatStats.buffs.critChancePercent || 0));
    const critDamage = combatStats.equipBonuses.critDamage || 150;

    return {
      playerId: player.id,
      role,
      isAlive: true,
      currentThreat: 0,
      dps,
      defense: totalDefence,
      healEfficiency,
      maxHp: combatStats.maxHp,
      currentHp: Math.min(player.currentHitpoints, combatStats.maxHp),
      attackSpeed: combatStats.finalAttackSpeedMs,
      weaponType: combatStats.weaponCategory,
      minHit,
      maxHit,
      critChance,
      critDamage,
    };
  }

  private async getLootTableForFloor(dungeonId: string, floor: number): Promise<DungeonLootTableInput | undefined> {
    const rows = await db.select()
      .from(dungeonLootTables)
      .where(eq(dungeonLootTables.dungeonId, dungeonId));

    const matching = rows.find(r => floor >= r.floorRangeStart && floor <= r.floorRangeEnd);
    if (!matching) return undefined;

    return {
      guaranteedDrops: (matching.guaranteedDrops as string[]) || [],
      possibleDrops: (matching.possibleDrops as { itemId: string; weight: number }[]) || [],
    };
  }

  private async getAllLootTables(dungeonId: string): Promise<{ floorRangeStart: number; floorRangeEnd: number; guaranteedDrops: string[]; possibleDrops: { itemId: string; weight: number }[] }[]> {
    const rows = await db.select()
      .from(dungeonLootTables)
      .where(eq(dungeonLootTables.dungeonId, dungeonId));

    return rows.map(r => ({
      floorRangeStart: r.floorRangeStart,
      floorRangeEnd: r.floorRangeEnd,
      guaranteedDrops: (r.guaranteedDrops as string[]) || [],
      possibleDrops: (r.possibleDrops as { itemId: string; weight: number }[]) || [],
    }));
  }

  private async getMonsterPool(
    dungeonId: string,
    floor: number,
  ): Promise<{ id: string; hp: number; attack: number; defence: number; attackSpeed: number; xpReward: number; lootTable: any[]; skills: any[]; isBossFloor: boolean }[]> {
    const templates = await db.select()
      .from(dungeonFloorTemplates)
      .where(eq(dungeonFloorTemplates.dungeonId, dungeonId));

    const template = templates.find(t =>
      floor >= t.floorRangeStart && floor <= t.floorRangeEnd,
    ) || templates[0];

    if (!template) return [];

    const monsterIds = (template.monsterPool as string[]) || [];
    if (monsterIds.length === 0) return [];

    const uniqueIds = Array.from(new Set(monsterIds));
    const monsterRows = await db.select()
      .from(gameMonsters)
      .where(inArray(gameMonsters.id, uniqueIds));

    const powerMult = (template.powerMultiplier || 100) / 100;

    return monsterRows.map(m => {
      const { avgHit: monsterAvgHit } = buildDungeonMonsterHit(m.attackLevel, m.strengthLevel || 0, (m as any).strengthBonus || 0);
      return {
      id: m.id,
      hp: scaledMonsterHp(m.maxHitpoints, powerMult),
      attack: scaledMonsterAttack(monsterAvgHit, powerMult),
      defence: Math.floor(m.defenceLevel * powerMult),
      attackSpeed: m.attackSpeed || 3000,
      xpReward: (() => {
        const xpData = m.xpReward as any;
        if (!xpData) return 0;
        return (xpData.attack || 0) + (xpData.strength || 0) + (xpData.defence || 0) + (xpData.hitpoints || 0);
      })(),
      lootTable: (m.loot as any[]) || [],
      skills: (m.skills as any[]) || [],
      isBossFloor: template.isBossFloor === 1,
    };
    });
  }

  private async awardLootToPlayer(
    playerId: string,
    items: Record<string, number>,
    gold: number,
    xp: number,
    txOrDb: any = db,
  ): Promise<void> {
    const [player] = await txOrDb.select()
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    if (!player) return;

    const inventory = { ...(player.inventory as Record<string, number> || {}) };
    for (const [rawItemId, qty] of Object.entries(items)) {
      const itemId = await getCanonicalItemId(rawItemId);
      inventory[itemId] = (inventory[itemId] || 0) + qty;
    }

    const skills = { ...(player.skills as Record<string, { xp: number; level: number }> || {}) };
    const xpPerSkill = Math.floor(xp / 3);
    for (const skillName of ["attack", "strength", "defence"]) {
      if (!skills[skillName]) {
        skills[skillName] = { xp: 0, level: 1 };
      }
      skills[skillName].xp += xpPerSkill;
      skills[skillName].level = getLevelFromXp(skills[skillName].xp);
    }
    if (skills.hitpoints) {
      const hpXp = Math.floor(xp / 4);
      skills.hitpoints.xp += hpXp;
      skills.hitpoints.level = getLevelFromXp(skills.hitpoints.xp);
    }

    await txOrDb.update(players)
      .set({
        inventory,
        gold: player.gold + gold,
        skills,
      })
      .where(eq(players.id, playerId));
  }

  private async applyDurabilityLoss(playerId: string, totalLoss: number, txOrDb: any = db): Promise<void> {
    const [player] = await txOrDb.select({
      equipmentDurability: players.equipmentDurability,
      equipment: players.equipment,
    })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    if (!player) return;

    const durability = { ...(player.equipmentDurability as Record<string, number> || {}) };
    const equipment = (player.equipment as Record<string, string | null>) || {};

    const equippedSlots = Object.keys(equipment).filter(slot => equipment[slot]);
    if (equippedSlots.length === 0) return;

    const lossPerSlot = totalLoss / equippedSlots.length;

    for (const slot of equippedSlots) {
      const currentDur = durability[slot] ?? 100;
      durability[slot] = Math.max(MIN_DURABILITY, Math.round((currentDur - lossPerSlot) * 100) / 100);
    }

    await txOrDb.update(players)
      .set({ equipmentDurability: durability })
      .where(eq(players.id, playerId));
  }

  private async deductKeys(playerId: string, keyType: string, amount: number, txOrDb: any = db): Promise<boolean> {
    const result = await txOrDb.execute(sql`
      UPDATE player_dungeon_keys
      SET quantity = quantity - ${amount}
      WHERE player_id = ${playerId}
        AND key_type = ${keyType}
        AND quantity >= ${amount}
    `);

    return (result.rowCount ?? 0) > 0;
  }

  async dismissSession(playerId: string, sessionId: string): Promise<void> {
    await db.update(dungeonSessions)
      .set({ status: "claimed" })
      .where(and(
        eq(dungeonSessions.id, sessionId),
        eq(dungeonSessions.playerId, playerId),
        sql`${dungeonSessions.status} IN ('completed', 'failed', 'extracted')`,
      ));
  }

  async getActiveSession(playerId: string): Promise<{ session: any | null; recentResult: any | null } | null> {
    let [activeSession] = await db.select()
      .from(dungeonSessions)
      .where(and(
        eq(dungeonSessions.playerId, playerId),
        sql`${dungeonSessions.status} IN ('active', 'voting')`,
      ))
      .limit(1);

    if (!activeSession) {
      const memberSessions = await db.select({ sessionId: dungeonMemberStates.sessionId })
        .from(dungeonMemberStates)
        .where(and(
          eq(dungeonMemberStates.playerId, playerId),
          eq(dungeonMemberStates.hasExited, 0),
        ))
        .limit(5);
      if (memberSessions.length > 0) {
        const sessionIds = memberSessions.map(ms => ms.sessionId);
        const [partySession] = await db.select()
          .from(dungeonSessions)
          .where(and(
            inArray(dungeonSessions.id, sessionIds),
            sql`${dungeonSessions.status} IN ('active', 'voting')`,
            sql`${dungeonSessions.mode} = 'party'`,
          ))
          .orderBy(sql`${dungeonSessions.startedAt} DESC`)
          .limit(1);
        if (partySession) {
          activeSession = partySession;
        }
      }
    }

    if (activeSession) {
      if (activeSession.endedAt !== null) {
        await db.update(dungeonSessions)
          .set({ status: "extracted" })
          .where(eq(dungeonSessions.id, activeSession.id));
        activeSession = undefined as any;
      } else {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (activeSession.startedAt && new Date(activeSession.startedAt) < twentyFourHoursAgo) {
          console.warn(`[DungeonV2Service] Auto-closing orphaned session ${activeSession.id} (started ${activeSession.startedAt})`);
          await db.update(dungeonSessions)
            .set({ status: "failed", endedAt: new Date() })
            .where(eq(dungeonSessions.id, activeSession.id));
          activeSession = undefined as any;
        }
      }
    }

    let recentResultSession: typeof activeSession | undefined = undefined;
    if (!activeSession) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentResults = await db.select()
        .from(dungeonSessions)
        .where(and(
          eq(dungeonSessions.playerId, playerId),
          sql`${dungeonSessions.status} IN ('completed', 'failed', 'extracted')`,
          sql`${dungeonSessions.endedAt} > ${fiveMinutesAgo}`,
        ))
        .orderBy(sql`${dungeonSessions.endedAt} DESC`)
        .limit(1);
      if (recentResults.length > 0) {
        recentResultSession = recentResults[0];
      }
    }

    if (!activeSession && !recentResultSession) return null;

    const formatSession = async (session: any) => {
      const [dungeon] = await db.select()
        .from(dungeons)
        .where(eq(dungeons.id, session.dungeonId))
        .limit(1);

      const config = (session.configSnapshot as DungeonV2ConfigSnapshot) || await this.getDungeonConfig(session.dungeonId);

      const [memberState] = await db.select()
        .from(dungeonMemberStates)
        .where(and(
          eq(dungeonMemberStates.sessionId, session.id),
          eq(dungeonMemberStates.playerId, playerId),
        ))
        .limit(1);

      const [player] = await db.select()
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      let playerHp = 0;
      let playerMaxHp = 0;
      let playerAttackSpeed = 2500;
      let playerDps = 0;
      let playerAttack = 0;
      let playerDefense = 0;
      let playerWeaponType: string | null = null;
      let playerMinHit = 0;
      let playerMaxHit = 0;
      let playerCritChance = 0;
      let playerCritDamage = 150;
      if (player) {
        const memberInput = await this.buildMemberFloorInput(player);
        playerMaxHp = memberInput.maxHp;
        playerHp = memberState?.isAlive === 1 ? Math.max(1, Math.min(player.currentHitpoints, memberInput.maxHp)) : 0;
        playerAttackSpeed = memberInput.attackSpeed;
        playerDps = memberInput.dps;
        playerAttack = memberInput.dps;
        playerDefense = memberInput.defense;
        playerWeaponType = memberInput.weaponType;
        playerMinHit = memberInput.minHit || 0;
        playerMaxHit = memberInput.maxHit || 0;
        playerCritChance = memberInput.critChance || 0;
        playerCritDamage = memberInput.critDamage || 150;
      }

      let nextFloor: any = null;
      if (session.isOffline === 0 && memberState?.isAlive !== 0) {
        const monsterPool = await this.getMonsterPool(session.dungeonId, session.currentFloor);
        if (monsterPool.length > 0) {
          const rng = createSeededRng(`${session.id}_floor_${session.currentFloor}`);
          const monsterIdx = Math.floor(rng() * monsterPool.length);
          const monster = monsterPool[monsterIdx];

          const monsterName = monster.id.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

          const mult = session.currentMultiplier / 100;
          nextFloor = {
            floor: session.currentFloor,
            monsterName,
            monsterHp: Math.floor(monster.hp * mult),
            monsterAttack: Math.floor(monster.attack * mult),
            monsterDefence: Math.floor(monster.defence * mult),
            monsterAttackSpeed: monster.attackSpeed,
            monsterImage: null,
            isBoss: session.currentFloor % 10 === 0,
          };
        }
      }

      const extractionPercent = calculateExtractionPercent(session.riskLevel, config);

      if (session.mode === "party") {
        const memberStates = await db.select()
          .from(dungeonMemberStates)
          .where(eq(dungeonMemberStates.sessionId, session.id));

        const memberPlayerIds = memberStates.map(m => m.playerId);
        const memberPlayers = memberPlayerIds.length > 0 
          ? await db.select({ id: players.id, username: players.username, avatar: players.avatar })
              .from(players)
              .where(inArray(players.id, memberPlayerIds))
          : [];

        const playerMap = new Map(memberPlayers.map(p => [p.id, p]));

        const members = memberStates.map(ms => {
          const p = playerMap.get(ms.playerId);
          const snapshot = (ms.statsSnapshot as any) || {};
          return {
            playerId: ms.playerId,
            playerName: p?.username || "Unknown",
            avatar: p?.avatar || "knight",
            role: ms.role,
            isAlive: ms.isAlive === 1,
            hasExited: ms.hasExited === 1,
            exitedAtFloor: ms.exitedAtFloor,
            diedAtFloor: ms.diedAtFloor,
            currentThreat: ms.currentThreat,
            totalDamageDealt: ms.totalDamageDealt,
            totalHealingDone: ms.totalHealingDone,
            hp: ms.isAlive === 1 ? (snapshot.maxHp || 100) : 0,
            maxHp: snapshot.maxHp || 100,
            status: ms.hasExited === 1 ? 'exited' : (ms.isAlive === 1 ? 'alive' : 'dead'),
            statsSnapshot: ms.statsSnapshot,
            attackSpeed: snapshot.attackSpeed || 2500,
            dps: snapshot.dps || 0,
            defense: (snapshot.defenceLevel || 1) + ((snapshot.equipBonuses as any)?.defenceBonus || 0),
            weaponType: snapshot.weaponType || null,
          };
        });

        let votes: any[] = [];
        let voteDeadline: string | null = null;
        if (session.status === "voting") {
          const voteRows = await db.select()
            .from(dungeonVotes)
            .where(and(
              eq(dungeonVotes.sessionId, session.id),
              eq(dungeonVotes.floor, session.currentFloor),
            ));
          votes = voteRows.map(v => ({ playerId: v.playerId, vote: v.vote }));
          
          const configSnapshot = (session.configSnapshot as any) || {};
          const voteDuration = (configSnapshot.voteDuration || 60) * 1000;
          if (session.lastFloorAt) {
            voteDeadline = new Date(new Date(session.lastFloorAt).getTime() + voteDuration).toISOString();
          }
        }

        return {
          ...session,
          dungeonName: dungeon?.name || session.dungeonId,
          maxFloors: config.maxFloors,
          maxRunTimeMinutes: config.maxRunTimeMinutes,
          extractionPercent,
          totalGold: session.goldPool,
          totalXp: session.xpPool,
          curses: session.activeCurses,
          multiplier: session.currentMultiplier,
          nextFloor,
          playerHp,
          playerMaxHp,
          playerAttackSpeed,
          playerDps,
          playerAttack,
          playerDefense,
          playerWeaponType,
          playerMinHit,
          playerMaxHit,
          playerCritChance,
          playerCritDamage,
          members,
          votes,
          voteDeadline,
        };
      }

      return {
        ...session,
        dungeonName: dungeon?.name || session.dungeonId,
        maxFloors: config.maxFloors,
        maxRunTimeMinutes: config.maxRunTimeMinutes,
        extractionPercent,
        totalGold: session.goldPool,
        totalXp: session.xpPool,
        curses: session.activeCurses,
        multiplier: session.currentMultiplier,
        nextFloor,
        playerHp,
        playerMaxHp,
        playerAttackSpeed,
        playerDps,
        playerAttack,
        playerDefense,
        playerWeaponType,
        playerMinHit,
        playerMaxHit,
        playerCritChance,
        playerCritDamage,
      };
    };

    const formattedActive = activeSession ? await formatSession(activeSession) : null;
    const formattedRecent = recentResultSession ? await formatSession(recentResultSession) : null;

    return { session: formattedActive, recentResult: formattedRecent };
  }

  private async updatePlayerProgress(playerId: string, dungeonId: string, floorsCleared: number, txOrDb: any = db): Promise<void> {
    const [existing] = await txOrDb.select()
      .from(playerDungeonProgress)
      .where(and(
        eq(playerDungeonProgress.playerId, playerId),
        eq(playerDungeonProgress.dungeonId, dungeonId),
      ))
      .limit(1);

    if (existing) {
      await txOrDb.update(playerDungeonProgress)
        .set({
          highestFloor: Math.max(existing.highestFloor, floorsCleared),
          totalClears: existing.totalClears + 1,
          weeklyClears: existing.weeklyClears + 1,
          lastRunAt: new Date(),
        })
        .where(eq(playerDungeonProgress.id, existing.id));
    } else {
      await txOrDb.insert(playerDungeonProgress)
        .values({
          playerId,
          dungeonId,
          highestFloor: floorsCleared,
          totalClears: 1,
          weeklyClears: 1,
          lastRunAt: new Date(),
        });
    }
  }
}

export const dungeonV2Service = new DungeonV2Service();
