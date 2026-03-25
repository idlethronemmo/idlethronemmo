// @ts-nocheck
import { db } from "../../db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  dungeons, dungeonV2Config, dungeonSessions, dungeonMemberStates,
  dungeonVotes, dungeonChatMessages, dungeonHiddenBosses,
  playerDungeonKeys, playerDungeonProgress, dungeonLootTables, dungeonFloorTemplates,
  parties, partyMembers, partyInvites, gameMonsters, players,
  type DungeonV2ConfigSnapshot, type DungeonCurse, type Player, COMBAT_HP_SCALE,
  type MemberStatsSnapshot,
  calculateAverageHit,
} from "@shared/schema";
import { resolvePlayerCombatStats } from "../playerStatsResolver";
import { broadcastToParty, createPartyEvent } from "../partyWs";
import { cachedGameItems, refreshItemCache } from "../scheduler";
import { getCanonicalItemId } from "../inventoryHelper";
import { getLevelFromXp } from "@shared/gameMath";
import {
  resolveFloor, calculateExtractionPercent, distributeLoot, calculateThreat,
  createSeededRng,
  type MemberFloorInput, type FloorResolutionInput,
  type DungeonLootTableInput,
} from "@shared/dungeonEngine";

const DEFAULT_CONFIG: DungeonV2ConfigSnapshot = {
  requiredKeys: 1,
  maxMembers: 5,
  maxFloors: 100,
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
const VOTE_TIMEOUT_MS = 60_000;

export class PartyDungeonService {

  private async getDungeonConfig(dungeonId: string): Promise<DungeonV2ConfigSnapshot> {
    const [config] = await db.select()
      .from(dungeonV2Config)
      .where(and(
        eq(dungeonV2Config.dungeonId, dungeonId),
        eq(dungeonV2Config.isActive, 1),
      ))
      .limit(1);

    if (!config) {
      return { ...DEFAULT_CONFIG };
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

  async startPartyDungeon(
    initiatorPlayerId: string,
    dungeonId: string,
    partyId: string
  ): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    try {
      const [party] = await db.select()
        .from(parties)
        .where(eq(parties.id, partyId))
        .limit(1);

      if (!party) {
        return { success: false, error: "Party not found" };
      }

      if (party.leaderId !== initiatorPlayerId) {
        return { success: false, error: "Only the party leader can start a dungeon" };
      }

      if (party.partyType !== 'dungeon') {
        return { success: false, error: "Only dungeon parties can start a dungeon. Create a dungeon party first." };
      }

      const members = await db.select()
        .from(partyMembers)
        .where(eq(partyMembers.partyId, partyId));

      if (members.length < 2) {
        return { success: false, error: "Party must have at least 2 members" };
      }
      if (members.length > 5) {
        return { success: false, error: "Party cannot have more than 5 members" };
      }

      const notReady = members.filter(m => m.isReady !== 1);
      if (notReady.length > 0) {
        return { success: false, error: "All party members must be ready before starting" };
      }

      const [dungeon] = await db.select()
        .from(dungeons)
        .where(and(eq(dungeons.id, dungeonId), eq(dungeons.isActive, 1)))
        .limit(1);

      if (!dungeon) {
        return { success: false, error: "Dungeon not found" };
      }

      const config = await this.getDungeonConfig(dungeonId);

      const txResult = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM parties WHERE id = ${partyId} FOR UPDATE`);

        const [lockedParty] = await tx.select()
          .from(parties)
          .where(eq(parties.id, partyId))
          .limit(1);

        if (!lockedParty) {
          return { success: false as const, error: "Party not found" };
        }
        if (lockedParty.status !== 'forming') {
          const msg = lockedParty.status === 'in_dungeon' ? "Party is already in a dungeon"
            : lockedParty.status === 'locked' ? "Dungeon start already in progress"
            : lockedParty.status === 'disbanded' ? "Party has been disbanded"
            : "Party is not in a valid state to start a dungeon";
          return { success: false as const, error: msg };
        }
        if (lockedParty.leaderId !== initiatorPlayerId) {
          return { success: false as const, error: "Only the party leader can start a dungeon" };
        }

        await tx.update(parties)
          .set({ status: 'locked', updatedAt: new Date() })
          .where(eq(parties.id, partyId));

        const txMembers = await tx.select()
          .from(partyMembers)
          .where(eq(partyMembers.partyId, partyId));

        if (txMembers.length < 2) {
          return { success: false as const, error: "Party must have at least 2 members" };
        }
        if (txMembers.length > 5) {
          return { success: false as const, error: "Party cannot have more than 5 members" };
        }

        const txNotReady = txMembers.filter(m => m.isReady !== 1);
        if (txNotReady.length > 0) {
          return { success: false as const, error: "All party members must be ready before starting" };
        }

        const txMemberPlayerIds = txMembers.map(m => m.playerId);

        const txMemberPlayers = await tx.select()
          .from(players)
          .where(inArray(players.id, txMemberPlayerIds));

        const offlineMembers = txMemberPlayers.filter(p => p.isOnline !== 1);
        if (offlineMembers.length > 0) {
          return { success: false as const, error: "All party members must be online" };
        }

        const activeSessionCheck = await tx.select({ playerId: dungeonSessions.playerId })
          .from(dungeonSessions)
          .where(and(
            inArray(dungeonSessions.playerId, txMemberPlayerIds),
            sql`${dungeonSessions.status} IN ('active', 'voting')`,
          ));
        
        if (activeSessionCheck.length > 0) {
          return { success: false as const, error: "One or more party members already have an active dungeon session" };
        }

        const memberInputs: { player: typeof txMemberPlayers[0]; input: MemberFloorInput; snapshot: MemberStatsSnapshot }[] = [];
        for (const player of txMemberPlayers) {
          const memberInput = await this.buildMemberFloorInput(player);
          const partyMember = txMembers.find(m => m.playerId === player.id);
          const role = partyMember?.role || memberInput.role;
          memberInput.role = role;

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

          memberInputs.push({ player, input: memberInput, snapshot: statsSnapshot });
        }

        const keysCollected = await this.collectPartyKeys(
          txMemberPlayerIds,
          dungeon.keyType,
          config.requiredKeys,
          tx,
        );

        if (!keysCollected) {
          return { success: false as const, error: `Party doesn't have enough ${dungeon.keyType} keys (need ${config.requiredKeys} total)` };
        }

        await tx.update(players)
          .set({ activeTask: null, activeCombat: null })
          .where(inArray(players.id, txMemberPlayerIds));

        const [session] = await tx.insert(dungeonSessions)
          .values({
            dungeonId,
            mode: "party",
            status: "active",
            playerId: initiatorPlayerId,
            partyId,
            guildId: null,
            isOffline: 0,
            configSnapshot: config,
          })
          .returning();

        const memberStateValues = memberInputs.map(({ player, input, snapshot }) => ({
          sessionId: session.id,
          playerId: player.id,
          isAlive: 1 as const,
          statsSnapshot: snapshot,
          role: input.role || "dps",
        }));

        await tx.insert(dungeonMemberStates).values(memberStateValues);

        await tx.update(parties)
          .set({
            status: 'in_dungeon',
            dungeonRunId: session.id,
            partyVersion: sql`party_version + 1`,
            updatedAt: new Date(),
          })
          .where(eq(parties.id, partyId));

        await tx.update(partyInvites)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(and(
            eq(partyInvites.partyId, partyId),
            eq(partyInvites.status, 'pending')
          ));

        return { success: true as const, sessionId: session.id };
      });

      if (txResult.success) {
        const [latestParty] = await db.select().from(parties).where(eq(parties.id, partyId)).limit(1);
        const version = latestParty?.partyVersion || 0;
        broadcastToParty(partyId, createPartyEvent('party_started', partyId, version, {
          sessionId: txResult.sessionId, dungeonId,
        }));
      }

      return txResult;
    } catch (error) {
      console.error("[PartyDungeonService] startPartyDungeon error:", error);
      return { success: false, error: "Failed to start party dungeon" };
    }
  }

  async processPartyFloor(
    playerId: string,
    sessionId: string,
    autoConsumeOptions?: { autoEat?: boolean; autoPotion?: boolean; foodId?: string; potionId?: string; hpThresholdPercent?: number },
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      const [session] = await db.select()
        .from(dungeonSessions)
        .where(and(
          eq(dungeonSessions.id, sessionId),
          eq(dungeonSessions.mode, "party"),
          eq(dungeonSessions.status, "active"),
        ))
        .limit(1);

      if (!session) {
        return { success: false, error: "No active party session found" };
      }

      const allMemberStates = await db.select()
        .from(dungeonMemberStates)
        .where(eq(dungeonMemberStates.sessionId, sessionId));

      const isMember = allMemberStates.some(m => m.playerId === playerId);
      if (!isMember) {
        return { success: false, error: "You are not a member of this session" } as any;
      }

      const config = (session.configSnapshot as DungeonV2ConfigSnapshot) || await this.getDungeonConfig(session.dungeonId);
      const currentFloor = session.currentFloor;

      if (config.voteInterval > 0 && currentFloor > 0 && currentFloor % config.voteInterval === 0) {
        const existingVotes = await db.select()
          .from(dungeonVotes)
          .where(and(
            eq(dungeonVotes.sessionId, sessionId),
            eq(dungeonVotes.floor, currentFloor),
          ));

        if (existingVotes.length === 0) {
          const voteDeadline = new Date(Date.now() + (config.voteDuration || 60) * 1000);
          await db.update(dungeonSessions)
            .set({ status: "voting", lastFloorAt: new Date() })
            .where(eq(dungeonSessions.id, sessionId));

          if (session.partyId) {
            broadcastToParty(session.partyId, createPartyEvent('dungeon_vote_started', session.partyId, 0, {
              sessionId, deadline: voteDeadline.toISOString(), floor: currentFloor,
            }));
          }

          return {
            success: true,
            result: { needsVote: true, floor: currentFloor },
          };
        }
      }

      if (currentFloor > config.maxFloors) {
        await this.endSession(sessionId, "completed");
        return { success: true, result: { completed: true, floor: currentFloor } };
      }

      const aliveMemberStates = allMemberStates.filter(m => m.isAlive === 1 && m.hasExited === 0);

      if (aliveMemberStates.length === 0) {
        await this.endSession(sessionId, "failed");
        return { success: true, result: { allDead: true, floor: currentFloor } };
      }

      const memberFloorInputs = await this.buildPartyFloorInputs(aliveMemberStates);

      const monsterPool = await this.getMonsterPool(session.dungeonId, currentFloor);
      if (monsterPool.length === 0) {
        return { success: false, error: "No monsters for this floor" };
      }

      const rng = createSeededRng(`${sessionId}_floor_${currentFloor}`);
      const monsterIdx = Math.floor(rng() * monsterPool.length);
      const monster = monsterPool[monsterIdx];

      const activeCurses = (session.activeCurses as DungeonCurse[]) || [];

      const lootTable = await this.getLootTableForFloor(session.dungeonId, currentFloor);

      const floorInput: FloorResolutionInput = {
        floor: currentFloor,
        monsterHp: monster.hp,
        monsterAttack: monster.attack,
        monsterDefence: monster.defence,
        monsterAttackSpeed: monster.attackSpeed,
        members: memberFloorInputs,
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
        isPartyMode: true,
      };

      const floorResult = resolveFloor(floorInput);

      const currentLootPool = (session.lootPool as Record<string, number>) || {};
      for (const [itemId, qty] of Object.entries(floorResult.lootGenerated)) {
        currentLootPool[itemId] = (currentLootPool[itemId] || 0) + qty;
      }

      const newGoldPool = session.goldPool + floorResult.goldGenerated;
      const newXpPool = session.xpPool + floorResult.xpGenerated;
      const newFloor = currentFloor + 1;
      const newFloorsCleared = session.floorsCleared + 1;

      for (const memberResult of floorResult.membersAfter) {
        const memberState = allMemberStates.find(m => m.playerId === memberResult.playerId);
        if (!memberState) continue;

        await db.update(dungeonMemberStates)
          .set({
            isAlive: memberResult.isAlive ? 1 : 0,
            currentThreat: memberResult.currentThreat,
            totalDamageDealt: (memberState.totalDamageDealt || 0) + memberResult.damageDealt,
            totalHealingDone: (memberState.totalHealingDone || 0) + memberResult.healingDone,
            durabilityLost: (memberState.durabilityLost || 0) + Math.floor(memberResult.durabilityLoss),
            diedAtFloor: !memberResult.isAlive ? currentFloor : memberState.diedAtFloor || null,
          })
          .where(and(
            eq(dungeonMemberStates.sessionId, sessionId),
            eq(dungeonMemberStates.playerId, memberResult.playerId),
          ));
      }

      const allDead = floorResult.membersAfter.every(m => !m.isAlive);

      await db.update(dungeonSessions)
        .set({
          currentFloor: newFloor,
          floorsCleared: newFloorsCleared,
          riskLevel: floorResult.newRiskLevel,
          chaosMeter: Math.floor(floorResult.newChaosMeter),
          currentMultiplier: floorResult.newMultiplier,
          activeCurses: floorResult.newCurses,
          curseStack: floorResult.newCurses.reduce((s: number, c: DungeonCurse) => s + c.stackCount, 0),
          lootPool: currentLootPool,
          goldPool: newGoldPool,
          xpPool: newXpPool,
          lastFloorAt: new Date(),
          lastDbWriteFloor: newFloorsCleared,
          hiddenBossSpawned: floorResult.hiddenBossTriggered ? 1 : session.hiddenBossSpawned,
        })
        .where(eq(dungeonSessions.id, sessionId));

      if (allDead) {
        await this.endSession(sessionId, "failed");
      }

      const floorResultData = {
        floor: currentFloor,
        monsterDefeated: floorResult.monsterDefeated,
        monster: {
          id: monster.id,
          hp: monster.hp,
          attack: monster.attack,
          defence: monster.defence,
          skills: monster.skills || [],
          isBoss: monster.isBossFloor || false,
        },
        membersAfter: floorResult.membersAfter || [],
        lootGenerated: floorResult.lootGenerated,
        goldGenerated: floorResult.goldGenerated,
        xpGenerated: floorResult.xpGenerated,
        riskLevel: floorResult.newRiskLevel,
        chaosMeter: floorResult.newChaosMeter,
        multiplier: floorResult.newMultiplier,
        curses: floorResult.newCurses,
        chaosTriggered: floorResult.chaosTriggered,
        hiddenBossTriggered: floorResult.hiddenBossTriggered,
        combatReplay: floorResult.combatReplay || [],
        nextFloor: newFloor,
        totalLoot: currentLootPool,
        totalGold: newGoldPool,
        totalXp: newXpPool,
        allDead,
      };

      if (session.partyId) {
        broadcastToParty(session.partyId, createPartyEvent('dungeon_floor_result', session.partyId, 0, {
          sessionId,
          initiatorPlayerId: playerId,
          ...floorResultData,
        }));
      }

      return { success: true, result: floorResultData };
    } catch (error) {
      console.error("[PartyDungeonService] processPartyFloor error:", error);
      return { success: false, error: "Failed to process floor" };
    }
  }

  async submitVote(
    playerId: string,
    sessionId: string,
    vote: 'continue' | 'exit'
  ): Promise<{ success: boolean; voteResult?: any; error?: string }> {
    try {
      const [session] = await db.select()
        .from(dungeonSessions)
        .where(and(
          eq(dungeonSessions.id, sessionId),
          eq(dungeonSessions.status, "voting"),
        ))
        .limit(1);

      if (!session) {
        return { success: false, error: "Session is not in voting state" };
      }

      const aliveMemberStates = await db.select()
        .from(dungeonMemberStates)
        .where(and(
          eq(dungeonMemberStates.sessionId, sessionId),
          eq(dungeonMemberStates.isAlive, 1),
          eq(dungeonMemberStates.hasExited, 0),
        ));

      const isAliveMember = aliveMemberStates.some(m => m.playerId === playerId);
      if (!isAliveMember) {
        return { success: false, error: "Only alive members can vote" };
      }

      const currentFloor = session.currentFloor;

      const existingVotes = await db.select()
        .from(dungeonVotes)
        .where(and(
          eq(dungeonVotes.sessionId, sessionId),
          eq(dungeonVotes.floor, currentFloor),
        ));

      const alreadyVoted = existingVotes.some(v => v.playerId === playerId);
      if (alreadyVoted) {
        return { success: false, error: "You have already voted for this floor" };
      }

      await db.insert(dungeonVotes)
        .values({
          sessionId,
          floor: currentFloor,
          playerId,
          vote,
        });

      if (session.partyId) {
        broadcastToParty(session.partyId, createPartyEvent('dungeon_vote_cast', session.partyId, 0, {
          sessionId, playerId, totalVoted: existingVotes.length + 1,
        }));
      }

      const allVotes = [...existingVotes, { playerId, vote }];
      const totalAlive = aliveMemberStates.length;
      const totalVoted = allVotes.length;

      if (totalVoted >= totalAlive) {
        const continueVotes = allVotes.filter(v => v.vote === 'continue').length;
        const exitVotes = allVotes.filter(v => v.vote === 'exit').length;

        if (continueVotes > exitVotes) {
          await db.update(dungeonSessions)
            .set({ status: "active" })
            .where(eq(dungeonSessions.id, sessionId));

          if (session.partyId) {
            broadcastToParty(session.partyId, createPartyEvent('dungeon_vote_resolved', session.partyId, 0, {
              sessionId, decision: 'continue', continueVotes, exitVotes,
            }));
          }

          return {
            success: true,
            voteResult: { resolved: true, result: 'continue', continueVotes, exitVotes },
          };
        } else {
          await this.endSession(sessionId, "extracted");

          if (session.partyId) {
            broadcastToParty(session.partyId, createPartyEvent('dungeon_vote_resolved', session.partyId, 0, {
              sessionId, decision: 'exit', continueVotes, exitVotes,
            }));
          }

          return {
            success: true,
            voteResult: { resolved: true, result: 'exit', continueVotes, exitVotes },
          };
        }
      }

      return {
        success: true,
        voteResult: { resolved: false, waitingFor: totalAlive - totalVoted, totalVoted, totalAlive },
      };
    } catch (error) {
      console.error("[PartyDungeonService] submitVote error:", error);
      return { success: false, error: "Failed to submit vote" };
    }
  }

  async checkVoteTimeout(sessionId: string): Promise<{ expired: boolean; result?: string }> {
    try {
      const [session] = await db.select()
        .from(dungeonSessions)
        .where(and(
          eq(dungeonSessions.id, sessionId),
          eq(dungeonSessions.status, "voting"),
        ))
        .limit(1);

      if (!session) {
        return { expired: false };
      }

      const config = (session.configSnapshot as DungeonV2ConfigSnapshot) || DEFAULT_CONFIG;
      const voteDurationMs = (config.voteDuration || 60) * 1000;
      const lastFloorTime = session.lastFloorAt ? new Date(session.lastFloorAt).getTime() : 0;
      const elapsed = Date.now() - lastFloorTime;

      if (elapsed < voteDurationMs) {
        return { expired: false };
      }

      const aliveMemberStates = await db.select()
        .from(dungeonMemberStates)
        .where(and(
          eq(dungeonMemberStates.sessionId, sessionId),
          eq(dungeonMemberStates.isAlive, 1),
          eq(dungeonMemberStates.hasExited, 0),
        ));

      const currentFloor = session.currentFloor;

      const existingVotes = await db.select()
        .from(dungeonVotes)
        .where(and(
          eq(dungeonVotes.sessionId, sessionId),
          eq(dungeonVotes.floor, currentFloor),
        ));

      const votedPlayerIds = new Set(existingVotes.map(v => v.playerId));
      const nonVoters = aliveMemberStates.filter(m => !votedPlayerIds.has(m.playerId));

      for (const nonVoter of nonVoters) {
        await db.insert(dungeonVotes)
          .values({
            sessionId,
            floor: currentFloor,
            playerId: nonVoter.playerId,
            vote: "exit",
          });
      }

      const allVotes = [
        ...existingVotes,
        ...nonVoters.map(nv => ({ playerId: nv.playerId, vote: "exit" })),
      ];

      const continueVotes = allVotes.filter(v => v.vote === 'continue').length;
      const exitVotes = allVotes.filter(v => v.vote === 'exit').length;

      if (continueVotes > exitVotes) {
        await db.update(dungeonSessions)
          .set({ status: "active" })
          .where(eq(dungeonSessions.id, sessionId));

        return { expired: true, result: "continue" };
      } else {
        await this.endSession(sessionId, "extracted");
        return { expired: true, result: "exit" };
      }
    } catch (error) {
      console.error("[PartyDungeonService] checkVoteTimeout error:", error);
      return { expired: false };
    }
  }

  async memberExit(
    playerId: string,
    sessionId: string
  ): Promise<{ success: boolean; loot?: any; error?: string; alreadyExited?: boolean }> {
    try {
      const [session] = await db.select()
        .from(dungeonSessions)
        .where(and(
          eq(dungeonSessions.id, sessionId),
          eq(dungeonSessions.mode, "party"),
        ))
        .limit(1);

      if (!session || (session.status !== "active" && session.status !== "voting")) {
        return { success: false, error: "No active party session found" };
      }

      const [memberState] = await db.select()
        .from(dungeonMemberStates)
        .where(and(
          eq(dungeonMemberStates.sessionId, sessionId),
          eq(dungeonMemberStates.playerId, playerId),
        ))
        .limit(1);

      if (!memberState) {
        return { success: false, error: "You are not a member of this session" };
      }

      if (memberState.hasExited === 1) {
        return { success: true, alreadyExited: true };
      }

      const config = (session.configSnapshot as DungeonV2ConfigSnapshot) || DEFAULT_CONFIG;
      const extractionPercent = calculateExtractionPercent(session.riskLevel, config);

      const lootPool = (session.lootPool as Record<string, number>) || {};
      const allMemberStates = await db.select()
        .from(dungeonMemberStates)
        .where(eq(dungeonMemberStates.sessionId, sessionId));

      const activeMemberCount = allMemberStates.filter(m => m.hasExited === 0).length;
      const portion = activeMemberCount > 0 ? 1 / activeMemberCount : 0;
      const share = extractionPercent / 100;

      const personalItems: Record<string, number> = {};
      for (const [itemId, qty] of Object.entries(lootPool)) {
        const amt = Math.floor(qty * portion * share);
        if (amt > 0) personalItems[itemId] = amt;
      }

      const personalGold = Math.floor(session.goldPool * portion * share);
      const personalXp = Math.floor(session.xpPool * portion * share);

      await db.transaction(async (tx) => {
        await this.awardLootToPlayer(playerId, personalItems, personalGold, personalXp, tx);

        if (memberState.durabilityLost > 0) {
          await this.applyDurabilityLoss(playerId, memberState.durabilityLost, tx);
        }

        await tx.update(dungeonMemberStates)
          .set({
            hasExited: 1,
            exitedAtFloor: session.currentFloor,
            exitExtractionPercent: Math.floor(extractionPercent),
            personalLootEarned: personalItems,
            personalGoldEarned: personalGold,
            personalXpEarned: personalXp,
          })
          .where(eq(dungeonMemberStates.id, memberState.id));

        await this.updatePlayerProgress(playerId, session.dungeonId, session.floorsCleared, tx);
      });

      const remainingAlive = allMemberStates.filter(
        m => m.playerId !== playerId && m.isAlive === 1 && m.hasExited === 0
      );

      if (remainingAlive.length === 0) {
        await this.endSession(sessionId, "extracted");
      }

      return {
        success: true,
        loot: {
          items: personalItems,
          gold: personalGold,
          xp: personalXp,
          extractionPercent,
          exitedAtFloor: session.currentFloor,
        },
      };
    } catch (error) {
      console.error("[PartyDungeonService] memberExit error:", error);
      return { success: false, error: "Failed to exit session" };
    }
  }

  async endSession(
    sessionId: string,
    status: 'completed' | 'failed' | 'extracted'
  ): Promise<{ success: boolean; results?: any; error?: string }> {
    try {
      const [session] = await db.select()
        .from(dungeonSessions)
        .where(eq(dungeonSessions.id, sessionId))
        .limit(1);

      if (!session) {
        return { success: false, error: "Session not found" };
      }

      const allMemberStates = await db.select()
        .from(dungeonMemberStates)
        .where(eq(dungeonMemberStates.sessionId, sessionId));

      const config = (session.configSnapshot as DungeonV2ConfigSnapshot) || DEFAULT_CONFIG;
      const perMemberResults: Record<string, any> = {};

      await db.transaction(async (tx) => {
        if (status === 'failed') {
          for (const ms of allMemberStates) {
            if (ms.durabilityLost > 0) {
              await this.applyDurabilityLoss(ms.playerId, ms.durabilityLost, tx);
            }
            await this.updatePlayerProgress(ms.playerId, session.dungeonId, session.floorsCleared, tx);
            perMemberResults[ms.playerId] = { items: {}, gold: 0, xp: 0, failed: true };
          }
        } else {
          const extractionPercent = calculateExtractionPercent(session.riskLevel, config);
          const lootPool = (session.lootPool as Record<string, number>) || {};

          const aliveIds: string[] = [];
          const deadIds: string[] = [];
          const exitedMembers: { playerId: string; extractionPercent: number }[] = [];

          for (const ms of allMemberStates) {
            if (ms.hasExited === 1) {
              exitedMembers.push({
                playerId: ms.playerId,
                extractionPercent: ms.exitExtractionPercent || 0,
              });
            } else if (ms.isAlive === 1) {
              aliveIds.push(ms.playerId);
            } else {
              deadIds.push(ms.playerId);
            }
          }

          const distribution = distributeLoot(
            lootPool,
            session.goldPool,
            session.xpPool,
            aliveIds,
            deadIds,
            exitedMembers,
            extractionPercent,
          );

          for (const ms of allMemberStates) {
            if (ms.hasExited === 1) {
              perMemberResults[ms.playerId] = {
                items: (ms.personalLootEarned as Record<string, number>) || {},
                gold: ms.personalGoldEarned,
                xp: ms.personalXpEarned,
                exitedEarly: true,
              };
              continue;
            }

            const memberLoot = distribution.get(ms.playerId);
            if (memberLoot) {
              await this.awardLootToPlayer(ms.playerId, memberLoot.items, memberLoot.gold, memberLoot.xp, tx);

              await tx.update(dungeonMemberStates)
                .set({
                  personalLootEarned: memberLoot.items,
                  personalGoldEarned: memberLoot.gold,
                  personalXpEarned: memberLoot.xp,
                })
                .where(eq(dungeonMemberStates.id, ms.id));

              perMemberResults[ms.playerId] = {
                items: memberLoot.items,
                gold: memberLoot.gold,
                xp: memberLoot.xp,
                alive: ms.isAlive === 1,
              };
            }

            if (ms.durabilityLost > 0) {
              await this.applyDurabilityLoss(ms.playerId, ms.durabilityLost, tx);
            }

            await this.updatePlayerProgress(ms.playerId, session.dungeonId, session.floorsCleared, tx);
          }
        }

        await tx.update(dungeonSessions)
          .set({
            status,
            endedAt: new Date(),
          })
          .where(eq(dungeonSessions.id, sessionId));

        if (session.partyId) {
          const [partyRow] = await tx.select()
            .from(parties)
            .where(eq(parties.id, session.partyId))
            .limit(1);
          if (partyRow && partyRow.partyType === 'dungeon') {
            await tx.delete(partyMembers).where(eq(partyMembers.partyId, session.partyId));
            await tx.update(parties)
              .set({ status: 'disbanded', updatedAt: new Date() })
              .where(eq(parties.id, session.partyId));
          }
        }
      });

      return {
        success: true,
        results: {
          status,
          floorsCleared: session.floorsCleared,
          perMember: perMemberResults,
        },
      };
    } catch (error) {
      console.error("[PartyDungeonService] endSession error:", error);
      return { success: false, error: "Failed to end session" };
    }
  }

  async sendChatMessage(
    playerId: string,
    sessionId: string,
    content: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [memberState] = await db.select()
        .from(dungeonMemberStates)
        .where(and(
          eq(dungeonMemberStates.sessionId, sessionId),
          eq(dungeonMemberStates.playerId, playerId),
        ))
        .limit(1);

      if (!memberState) {
        return { success: false, error: "You are not a member of this session" };
      }

      const sanitized = content
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, 200);

      if (sanitized.length === 0) {
        return { success: false, error: "Message cannot be empty" };
      }

      const [player] = await db.select({ username: players.username })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      await db.insert(dungeonChatMessages)
        .values({
          sessionId,
          playerId,
          playerName: player?.username || "Unknown",
          content: sanitized,
          messageType: "chat",
        });

      return { success: true };
    } catch (error) {
      console.error("[PartyDungeonService] sendChatMessage error:", error);
      return { success: false, error: "Failed to send message" };
    }
  }

  async getChatMessages(
    playerId: string,
    sessionId: string,
    limit: number = 100
  ): Promise<any[]> {
    try {
      const [memberState] = await db.select()
        .from(dungeonMemberStates)
        .where(and(
          eq(dungeonMemberStates.sessionId, sessionId),
          eq(dungeonMemberStates.playerId, playerId),
        ))
        .limit(1);

      if (!memberState) return [];

      const messages = await db.select()
        .from(dungeonChatMessages)
        .where(eq(dungeonChatMessages.sessionId, sessionId))
        .orderBy(desc(dungeonChatMessages.createdAt))
        .limit(limit);

      return messages.reverse();
    } catch (error) {
      console.error("[PartyDungeonService] getChatMessages error:", error);
      return [];
    }
  }

  async getSessionState(
    playerId: string,
    sessionId: string
  ): Promise<any> {
    try {
      const [session] = await db.select()
        .from(dungeonSessions)
        .where(eq(dungeonSessions.id, sessionId))
        .limit(1);

      if (!session) return { success: false, error: "Session not found", errorCode: 'NOT_FOUND' };

      const memberStates = await db.select()
        .from(dungeonMemberStates)
        .where(eq(dungeonMemberStates.sessionId, sessionId));

      const isMember = memberStates.some(m => m.playerId === playerId);
      if (!isMember) return { success: false, error: "You are not a member of this session", errorCode: 'NOT_MEMBER' };

      let voteState = null;
      if (session.status === "voting") {
        const votes = await db.select()
          .from(dungeonVotes)
          .where(and(
            eq(dungeonVotes.sessionId, sessionId),
            eq(dungeonVotes.floor, session.currentFloor),
          ));

        const aliveMemberCount = memberStates.filter(m => m.isAlive === 1 && m.hasExited === 0).length;

        voteState = {
          floor: session.currentFloor,
          votes: votes.map(v => ({ playerId: v.playerId, vote: v.vote })),
          totalVoted: votes.length,
          totalRequired: aliveMemberCount,
          voteDuration: ((session.configSnapshot as DungeonV2ConfigSnapshot)?.voteDuration || 60) * 1000,
          voteStartedAt: session.lastFloorAt,
        };
      }

      const memberPlayerIds = memberStates.map(m => m.playerId);
      const memberPlayers = await db.select({ id: players.id, username: players.username, avatar: players.avatar })
        .from(players)
        .where(inArray(players.id, memberPlayerIds));

      const playerMap = new Map(memberPlayers.map(p => [p.id, p]));

      const [dungeon] = await db.select()
        .from(dungeons)
        .where(eq(dungeons.id, session.dungeonId))
        .limit(1);

      const config = (session.configSnapshot as DungeonV2ConfigSnapshot) || await this.getDungeonConfig(session.dungeonId);

      let nextFloor: any = null;
      const hasAliveMember = memberStates.some(m => m.isAlive === 1 && m.hasExited === 0);
      if (session.status === "active" && hasAliveMember) {
        const monsterPool = await this.getMonsterPool(session.dungeonId, session.currentFloor);
        if (monsterPool.length > 0) {
          const rng = createSeededRng(`${session.id}_floor_${session.currentFloor}`);
          const monsterIdx = Math.floor(rng() * monsterPool.length);
          const monster = monsterPool[monsterIdx];
          const monsterName = monster.id.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          nextFloor = {
            floor: session.currentFloor,
            monsterName,
            monsterHp: monster.hp,
            monsterAttack: monster.attack,
            monsterDefence: monster.defence,
            monsterAttackSpeed: monster.attackSpeed,
            monsterImage: null,
            isBoss: session.currentFloor % 10 === 0,
          };
        }
      }

      const extractionPercent = calculateExtractionPercent(session.riskLevel, config);

      return {
        session: {
          id: session.id,
          dungeonId: session.dungeonId,
          dungeonName: dungeon?.name || session.dungeonId,
          mode: session.mode,
          status: session.status,
          currentFloor: session.currentFloor,
          floorsCleared: session.floorsCleared,
          riskLevel: session.riskLevel,
          chaosMeter: session.chaosMeter,
          currentMultiplier: session.currentMultiplier,
          activeCurses: session.activeCurses,
          curses: session.activeCurses,
          multiplier: session.currentMultiplier,
          lootPool: session.lootPool,
          goldPool: session.goldPool,
          xpPool: session.xpPool,
          totalGold: session.goldPool,
          totalXp: session.xpPool,
          startedAt: session.startedAt,
          nextFloor,
          maxFloors: config.maxFloors,
          maxRunTimeMinutes: config.maxRunTimeMinutes,
          extractionPercent,
        },
        members: memberStates.map(ms => {
          const player = playerMap.get(ms.playerId);
          const snapshot = (ms.statsSnapshot as MemberStatsSnapshot) || {};
          return {
            playerId: ms.playerId,
            playerName: player?.username || "Unknown",
            avatar: player?.avatar || "knight",
            role: ms.role,
            isAlive: ms.isAlive === 1,
            hasExited: ms.hasExited === 1,
            exitedAtFloor: ms.exitedAtFloor,
            diedAtFloor: ms.diedAtFloor,
            currentThreat: ms.currentThreat,
            totalDamageDealt: ms.totalDamageDealt,
            totalHealingDone: ms.totalHealingDone,
            statsSnapshot: ms.statsSnapshot,
            attackSpeed: snapshot.attackSpeed || 2500,
            dps: snapshot.dps || 0,
            defense: (snapshot.defenceLevel || 1) + ((snapshot.equipBonuses as any)?.defenceBonus || 0),
            weaponType: snapshot.weaponType || null,
          };
        }),
        voteState,
      };
    } catch (error) {
      console.error("[PartyDungeonService] getSessionState error:", error);
      return null;
    }
  }

  private async buildPartyFloorInputs(
    memberStates: any[]
  ): Promise<MemberFloorInput[]> {
    const inputs: MemberFloorInput[] = [];

    for (const ms of memberStates) {
      const snapshot = (ms.statsSnapshot as MemberStatsSnapshot) || {};

      inputs.push({
        playerId: ms.playerId,
        role: ms.role || "dps",
        isAlive: ms.isAlive === 1,
        currentThreat: ms.currentThreat || 0,
        dps: snapshot.dps || 1,
        defense: (snapshot.defenceLevel || 1) + ((snapshot.equipBonuses as any)?.defenceBonus || 0),
        healEfficiency: snapshot.healEfficiency || 0,
        maxHp: snapshot.maxHp || 100,
        currentHp: ms.isAlive === 1 ? Math.max(1, snapshot.maxHp || 100) : 0,
        attackSpeed: snapshot.attackSpeed || 2400,
        weaponType: snapshot.weaponType || null,
      });
    }

    return inputs;
  }

  private async collectPartyKeys(
    memberIds: string[],
    keyType: string,
    totalRequired: number,
    txOrDb: any = db,
  ): Promise<boolean> {
    const keyRows = await txOrDb.select()
      .from(playerDungeonKeys)
      .where(and(
        inArray(playerDungeonKeys.playerId, memberIds),
        eq(playerDungeonKeys.keyType, keyType),
      ));

    const totalAvailable = keyRows.reduce((sum: number, k: { quantity: number }) => sum + k.quantity, 0);

    if (totalAvailable < totalRequired) {
      return false;
    }

    const sorted = keyRows
      .filter((k: { quantity: number }) => k.quantity > 0)
      .sort((a: { quantity: number }, b: { quantity: number }) => b.quantity - a.quantity);

    let remaining = totalRequired;

    for (const row of sorted) {
      if (remaining <= 0) break;

      const deduct = Math.min(row.quantity, remaining);
      remaining -= deduct;

      const result = await txOrDb.execute(sql`
        UPDATE player_dungeon_keys
        SET quantity = quantity - ${deduct}
        WHERE player_id = ${row.playerId}
          AND key_type = ${keyType}
          AND quantity >= ${deduct}
      `);

      if ((result.rowCount ?? 0) === 0) {
        return false;
      }
    }

    return remaining <= 0;
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

    const avgHit = calculateAverageHit(
      combatStats.strengthLevel,
      combatStats.equipBonuses.strengthBonus,
    );
    const dps = combatStats.finalAttackSpeedMs > 0
      ? (avgHit / combatStats.finalAttackSpeedMs) * 1000
      : avgHit;

    const isStaff = combatStats.weaponCategory === "staff" || (equipment.weapon && equipment.weapon.toLowerCase().includes("staff"));
    const healEfficiency = isStaff ? dps * 0.6 : 0;

    const totalDefence = combatStats.defenceLevel + combatStats.equipBonuses.defenceBonus;

    const role = isStaff ? "healer" : "dps";

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

    return monsterRows.map(m => ({
      id: m.id,
      hp: Math.floor(m.maxHitpoints * powerMult),
      attack: Math.floor(m.attackLevel * powerMult),
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
    }));
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

export const partyDungeonService = new PartyDungeonService();

