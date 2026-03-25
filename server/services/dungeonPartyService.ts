// @ts-nocheck
import { db } from "../../db";
import { eq, and, desc, sql, inArray, asc } from "drizzle-orm";
import {
  dungeons, dungeonV2Config, dungeonSessions, dungeonMemberStates,
  dungeonFloorTemplates, dungeonLootTables,
  players, gameMonsters, guilds, guildMembers,
  dungeonParties, dungeonPartyMembers, dungeonPartyChat, dungeonLeaveVotes,
  playerDungeonKeys,
  type DungeonV2ConfigSnapshot, type MemberStatsSnapshot,
  COMBAT_HP_SCALE, calculateAverageHit,
} from "@shared/schema";
import { resolvePlayerCombatStats } from "../playerStatsResolver";
import { cachedGameItems, refreshItemCache } from "../scheduler";
import { getLevelFromXp } from "@shared/gameMath";
import type { MemberFloorInput } from "@shared/dungeonEngine";

const DEFAULT_CONFIG: DungeonV2ConfigSnapshot = {
  requiredKeys: 1, maxMembers: 5, maxFloors: 100, maxRunTimeMinutes: 480,
  voteInterval: 5, voteDuration: 60,
  baseExtraction: 100, penaltyCoef: 5, minExtraction: 20, maxExtraction: 100,
  maxRisk: 20, chaosThreshold: 10, multiplierCap: 500, curseCap: 5,
  durabilityMultiplier: 100, itemDestructionChance: 0, threatDecay: 10,
  bossTriggerRules: { minCurseStack: 3, minFloor: 20, minChaosTriggers: 5 },
  maxLootPerSession: 500,
};

class DungeonPartyService {

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

  private async buildMemberFloorInput(player: any): Promise<MemberFloorInput> {
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

  private async collectPartyKeys(memberIds: string[], keyType: string, requiredKeys: number, tx: any): Promise<boolean> {
    let keysCollected = 0;
    for (const memberId of memberIds) {
      if (keysCollected >= requiredKeys) break;
      const [keyRow] = await tx.select().from(playerDungeonKeys)
        .where(and(eq(playerDungeonKeys.playerId, memberId), eq(playerDungeonKeys.keyType, keyType)))
        .limit(1);
      if (keyRow && keyRow.quantity > 0) {
        const take = Math.min(keyRow.quantity, requiredKeys - keysCollected);
        await tx.update(playerDungeonKeys)
          .set({ quantity: keyRow.quantity - take })
          .where(eq(playerDungeonKeys.id, keyRow.id));
        keysCollected += take;
      }
    }
    return keysCollected >= requiredKeys;
  }

  async createParty(leaderId: string, dungeonId: string): Promise<{ success: boolean; party?: any; members?: any[]; error?: string }> {
    try {
      console.log(`[PartyTrack] CREATE_PARTY player=${leaderId} partyType=dungeon dungeonId=${dungeonId} result=pending`);
      const [dungeon] = await db.select()
        .from(dungeons)
        .where(and(eq(dungeons.id, dungeonId), eq(dungeons.isActive, 1)))
        .limit(1);

      if (!dungeon) {
        console.log(`[PartyTrack] CREATE_PARTY player=${leaderId} partyType=dungeon result=error reason=dungeon_not_found`);
        return { success: false, error: "Dungeon not found or not active" };
      }

      const activeParty = await this.findPlayerActiveParty(leaderId);
      if (activeParty) {
        console.log(`[PartyTrack] CREATE_PARTY player=${leaderId} partyType=dungeon result=error reason=already_in_party`);
        return { success: false, error: "You are already in an active dungeon party" };
      }

      const result = await db.transaction(async (tx) => {
        const [party] = await tx.insert(dungeonParties)
          .values({
            dungeonId,
            leaderId,
            status: 'recruiting',
            maxSize: 5,
            version: 1,
          })
          .returning();

        const [member] = await tx.insert(dungeonPartyMembers)
          .values({
            dungeonPartyId: party.id,
            playerId: leaderId,
            role: 'dps',
            isReady: 0,
          })
          .returning();

        return { party, member };
      });

      console.log(`[PartyTrack] CREATE_PARTY player=${leaderId} party=${result.party.id} partyType=dungeon result=ok`);
      return { success: true, party: result.party, members: [result.member] };
    } catch (error) {
      console.error("[DungeonPartyService] createParty error:", error);
      console.log(`[PartyTrack] CREATE_PARTY player=${leaderId} partyType=dungeon result=error reason=exception`);
      return { success: false, error: "Failed to create dungeon party" };
    }
  }

  async joinParty(playerId: string, partyId: string): Promise<{ success: boolean; party?: any; members?: any[]; error?: string }> {
    try {
      console.log(`[PartyTrack] JOIN_PARTY player=${playerId} party=${partyId} partyType=dungeon result=pending`);
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM dungeon_parties WHERE id = ${partyId} FOR UPDATE`);

        const [party] = await tx.select()
          .from(dungeonParties)
          .where(eq(dungeonParties.id, partyId))
          .limit(1);

        if (!party) {
          return { success: false as const, error: "Party not found" };
        }

        if (party.status !== 'recruiting') {
          return { success: false as const, error: "Party is not recruiting" };
        }

        const members = await tx.select()
          .from(dungeonPartyMembers)
          .where(eq(dungeonPartyMembers.dungeonPartyId, partyId));

        if (members.length >= party.maxSize) {
          return { success: false as const, error: "Party is full" };
        }

        const alreadyMember = members.some(m => m.playerId === playerId);
        if (alreadyMember) {
          return { success: false as const, error: "You are already in this party" };
        }

        const activePartyRows = await tx.execute(sql`
          SELECT dp.id FROM dungeon_parties dp
          INNER JOIN dungeon_party_members dpm ON dpm.dungeon_party_id = dp.id
          WHERE dpm.player_id = ${playerId}
            AND dp.status IN ('recruiting', 'locked', 'in_dungeon')
          LIMIT 1
        `);
        if ((activePartyRows.rows || []).length > 0) {
          return { success: false as const, error: "You are already in another active dungeon party" };
        }

        const [newMember] = await tx.insert(dungeonPartyMembers)
          .values({
            dungeonPartyId: partyId,
            playerId,
            role: 'dps',
            isReady: 0,
          })
          .returning();

        await tx.update(dungeonParties)
          .set({ version: sql`version + 1`, updatedAt: new Date() })
          .where(eq(dungeonParties.id, partyId));

        const updatedMembers = await tx.select()
          .from(dungeonPartyMembers)
          .where(eq(dungeonPartyMembers.dungeonPartyId, partyId));

        const [updatedParty] = await tx.select()
          .from(dungeonParties)
          .where(eq(dungeonParties.id, partyId))
          .limit(1);

        return { success: true as const, party: updatedParty, members: updatedMembers };
      });

      if (result.success) {
        console.log(`[PartyTrack] JOIN_PARTY player=${playerId} party=${partyId} partyType=dungeon result=ok`);
      } else {
        console.log(`[PartyTrack] JOIN_PARTY player=${playerId} party=${partyId} partyType=dungeon result=error reason=${result.error}`);
      }
      return result;
    } catch (error) {
      console.error("[DungeonPartyService] joinParty error:", error);
      console.log(`[PartyTrack] JOIN_PARTY player=${playerId} party=${partyId} partyType=dungeon result=error reason=exception`);
      return { success: false, error: "Failed to join dungeon party" };
    }
  }

  async leaveParty(playerId: string, partyId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[PartyTrack] LEAVE_PARTY player=${playerId} party=${partyId} partyType=dungeon result=pending`);
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM dungeon_parties WHERE id = ${partyId} FOR UPDATE`);

        const [party] = await tx.select()
          .from(dungeonParties)
          .where(eq(dungeonParties.id, partyId))
          .limit(1);

        if (!party) {
          return { success: false as const, error: "Party not found" };
        }

        if (party.status !== 'recruiting') {
          return { success: false as const, error: "Cannot leave party in current state" };
        }

        if (party.leaderId === playerId) {
          await tx.update(dungeonParties)
            .set({ status: 'disbanded', version: sql`version + 1`, updatedAt: new Date() })
            .where(eq(dungeonParties.id, partyId));

          await tx.delete(dungeonPartyChat)
            .where(eq(dungeonPartyChat.dungeonPartyId, partyId));

          return { success: true as const };
        }

        await tx.delete(dungeonPartyMembers)
          .where(and(
            eq(dungeonPartyMembers.dungeonPartyId, partyId),
            eq(dungeonPartyMembers.playerId, playerId),
          ));

        await tx.update(dungeonParties)
          .set({ version: sql`version + 1`, updatedAt: new Date() })
          .where(eq(dungeonParties.id, partyId));

        return { success: true as const };
      });

      if (result.success) {
        console.log(`[PartyTrack] LEAVE_PARTY player=${playerId} party=${partyId} partyType=dungeon result=ok`);
      } else {
        console.log(`[PartyTrack] LEAVE_PARTY player=${playerId} party=${partyId} partyType=dungeon result=error reason=${result.error}`);
      }
      return result;
    } catch (error) {
      console.error("[DungeonPartyService] leaveParty error:", error);
      console.log(`[PartyTrack] LEAVE_PARTY player=${playerId} party=${partyId} partyType=dungeon result=error reason=exception`);
      return { success: false, error: "Failed to leave dungeon party" };
    }
  }

  async toggleReady(playerId: string, partyId: string): Promise<{ success: boolean; isReady?: number; error?: string }> {
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM dungeon_parties WHERE id = ${partyId} FOR UPDATE`);

        const [party] = await tx.select()
          .from(dungeonParties)
          .where(eq(dungeonParties.id, partyId))
          .limit(1);

        if (!party) {
          return { success: false as const, error: "Party not found" };
        }

        if (party.status !== 'recruiting') {
          return { success: false as const, error: "Cannot change ready state in current party status" };
        }

        const [member] = await tx.select()
          .from(dungeonPartyMembers)
          .where(and(
            eq(dungeonPartyMembers.dungeonPartyId, partyId),
            eq(dungeonPartyMembers.playerId, playerId),
          ))
          .limit(1);

        if (!member) {
          return { success: false as const, error: "You are not in this party" };
        }

        const newReady = member.isReady === 1 ? 0 : 1;

        await tx.update(dungeonPartyMembers)
          .set({ isReady: newReady })
          .where(eq(dungeonPartyMembers.id, member.id));

        await tx.update(dungeonParties)
          .set({ version: sql`version + 1`, updatedAt: new Date() })
          .where(eq(dungeonParties.id, partyId));

        return { success: true as const, isReady: newReady };
      });

      return result;
    } catch (error) {
      console.error("[DungeonPartyService] toggleReady error:", error);
      return { success: false, error: "Failed to toggle ready state" };
    }
  }

  async setRole(playerId: string, partyId: string, role: string): Promise<{ success: boolean; error?: string }> {
    const validRoles = ['tank', 'dps', 'healer'];
    if (!validRoles.includes(role)) {
      return { success: false, error: "Invalid role. Must be tank, dps, or healer" };
    }

    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM dungeon_parties WHERE id = ${partyId} FOR UPDATE`);

        const [party] = await tx.select()
          .from(dungeonParties)
          .where(eq(dungeonParties.id, partyId))
          .limit(1);

        if (!party) {
          return { success: false as const, error: "Party not found" };
        }

        if (party.status !== 'recruiting') {
          return { success: false as const, error: "Cannot change role in current party status" };
        }

        const [member] = await tx.select()
          .from(dungeonPartyMembers)
          .where(and(
            eq(dungeonPartyMembers.dungeonPartyId, partyId),
            eq(dungeonPartyMembers.playerId, playerId),
          ))
          .limit(1);

        if (!member) {
          return { success: false as const, error: "You are not in this party" };
        }

        await tx.update(dungeonPartyMembers)
          .set({ role })
          .where(eq(dungeonPartyMembers.id, member.id));

        await tx.update(dungeonParties)
          .set({ version: sql`version + 1`, updatedAt: new Date() })
          .where(eq(dungeonParties.id, partyId));

        return { success: true as const };
      });

      return result;
    } catch (error) {
      console.error("[DungeonPartyService] setRole error:", error);
      return { success: false, error: "Failed to set role" };
    }
  }

  async getPartyState(partyId: string, sinceVersion?: number): Promise<{ success: boolean; unchanged?: boolean; party?: any; members?: any[]; chat?: any[]; version?: number; error?: string }> {
    try {
      const [party] = await db.select()
        .from(dungeonParties)
        .where(eq(dungeonParties.id, partyId))
        .limit(1);

      if (!party) {
        return { success: false, error: "Party not found" };
      }

      if (sinceVersion !== undefined && party.version === sinceVersion) {
        return { success: true, unchanged: true };
      }

      const membersWithPlayers = await db.select({
        member: dungeonPartyMembers,
        player: {
          id: players.id,
          username: players.username,
          avatar: players.avatar,
          totalLevel: players.totalLevel,
        },
      })
        .from(dungeonPartyMembers)
        .innerJoin(players, eq(dungeonPartyMembers.playerId, players.id))
        .where(eq(dungeonPartyMembers.dungeonPartyId, partyId));

      const chat = await db.select({
        chat: dungeonPartyChat,
        player: {
          username: players.username,
        },
      })
        .from(dungeonPartyChat)
        .innerJoin(players, eq(dungeonPartyChat.playerId, players.id))
        .where(eq(dungeonPartyChat.dungeonPartyId, partyId))
        .orderBy(desc(dungeonPartyChat.createdAt))
        .limit(50);

      const formattedMembers = membersWithPlayers.map(row => ({
        ...row.member,
        username: row.player.username,
        avatar: row.player.avatar,
        totalLevel: row.player.totalLevel,
      }));

      const formattedChat = chat.reverse().map(row => ({
        ...row.chat,
        username: row.player.username,
      }));

      return {
        success: true,
        party,
        members: formattedMembers,
        chat: formattedChat,
        version: party.version,
      };
    } catch (error) {
      console.error("[DungeonPartyService] getPartyState error:", error);
      return { success: false, error: "Failed to get party state" };
    }
  }

  async findPlayerActiveParty(playerId: string): Promise<any | null> {
    try {
      const results = await db.execute(sql`
        SELECT dp.* FROM dungeon_parties dp
        INNER JOIN dungeon_party_members dpm ON dpm.dungeon_party_id = dp.id
        WHERE dpm.player_id = ${playerId}
          AND dp.status IN ('recruiting', 'locked', 'in_dungeon')
        LIMIT 1
      `);

      const rows = results.rows || [];
      if (rows.length === 0) return null;
      return rows[0];
    } catch (error) {
      console.error("[DungeonPartyService] findPlayerActiveParty error:", error);
      return null;
    }
  }

  async startDungeon(leaderId: string, partyId: string): Promise<{ success: boolean; sessionId?: string; members?: any[]; version?: number; error?: string }> {
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM dungeon_parties WHERE id = ${partyId} FOR UPDATE`);

        const [party] = await tx.select()
          .from(dungeonParties)
          .where(eq(dungeonParties.id, partyId))
          .limit(1);

        if (!party) {
          return { success: false as const, error: "Party not found" };
        }

        if (party.status !== 'recruiting') {
          return { success: false as const, error: "Party is not in recruiting state" };
        }

        if (party.leaderId !== leaderId) {
          return { success: false as const, error: "Only the party leader can start the dungeon" };
        }

        const members = await tx.select()
          .from(dungeonPartyMembers)
          .where(eq(dungeonPartyMembers.dungeonPartyId, partyId));

        if (members.length < 2) {
          return { success: false as const, error: "Party must have at least 2 members" };
        }

        const notReady = members.filter(m => m.isReady !== 1);
        if (notReady.length > 0) {
          return { success: false as const, error: "All party members must be ready" };
        }

        await tx.update(dungeonParties)
          .set({ status: 'locked', updatedAt: new Date() })
          .where(eq(dungeonParties.id, partyId));

        const [dungeon] = await tx.select()
          .from(dungeons)
          .where(and(eq(dungeons.id, party.dungeonId), eq(dungeons.isActive, 1)))
          .limit(1);

        if (!dungeon) {
          return { success: false as const, error: "Dungeon not found or not active" };
        }

        const config = await this.getDungeonConfig(party.dungeonId);

        const memberPlayerIds = members.map(m => m.playerId);
        const memberPlayers = await tx.select()
          .from(players)
          .where(inArray(players.id, memberPlayerIds));

        const memberInputs: { player: any; input: MemberFloorInput; snapshot: MemberStatsSnapshot }[] = [];
        for (const player of memberPlayers) {
          const memberInput = await this.buildMemberFloorInput(player);
          const partyMember = members.find(m => m.playerId === player.id);
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
          memberPlayerIds,
          dungeon.keyType,
          config.requiredKeys,
          tx,
        );

        if (!keysCollected) {
          return { success: false as const, error: `Party doesn't have enough ${dungeon.keyType} keys (need ${config.requiredKeys} total)` };
        }

        await tx.update(players)
          .set({ activeTask: null, activeCombat: null })
          .where(inArray(players.id, memberPlayerIds));

        const [session] = await tx.insert(dungeonSessions)
          .values({
            dungeonId: party.dungeonId,
            mode: "party",
            status: "active",
            playerId: leaderId,
            partyId,
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

        await tx.update(dungeonParties)
          .set({
            status: 'in_dungeon',
            version: sql`version + 1`,
            updatedAt: new Date(),
          })
          .where(eq(dungeonParties.id, partyId));

        const [updatedParty] = await tx.select()
          .from(dungeonParties)
          .where(eq(dungeonParties.id, partyId))
          .limit(1);

        return {
          success: true as const,
          sessionId: session.id,
          members: memberInputs.map(m => ({ playerId: m.player.id, role: m.input.role })),
          version: updatedParty?.version || 0,
        };
      });

      return result;
    } catch (error) {
      console.error("[DungeonPartyService] startDungeon error:", error);
      return { success: false, error: "Failed to start dungeon" };
    }
  }

  async sendChat(playerId: string, partyId: string, message: string): Promise<{ success: boolean; chatMessage?: any; error?: string }> {
    try {
      const trimmed = message.trim().slice(0, 200);
      if (!trimmed) {
        return { success: false, error: "Message cannot be empty" };
      }

      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM dungeon_parties WHERE id = ${partyId} FOR UPDATE`);

        const [party] = await tx.select()
          .from(dungeonParties)
          .where(eq(dungeonParties.id, partyId))
          .limit(1);

        if (!party) {
          return { success: false as const, error: "Party not found" };
        }

        if (!['recruiting', 'locked', 'in_dungeon'].includes(party.status)) {
          return { success: false as const, error: "Cannot send messages in current party state" };
        }

        const [member] = await tx.select()
          .from(dungeonPartyMembers)
          .where(and(
            eq(dungeonPartyMembers.dungeonPartyId, partyId),
            eq(dungeonPartyMembers.playerId, playerId),
          ))
          .limit(1);

        if (!member) {
          return { success: false as const, error: "You are not in this party" };
        }

        const [chatMsg] = await tx.insert(dungeonPartyChat)
          .values({
            dungeonPartyId: partyId,
            playerId,
            message: trimmed,
          })
          .returning();

        await tx.update(dungeonParties)
          .set({ version: sql`version + 1`, updatedAt: new Date() })
          .where(eq(dungeonParties.id, partyId));

        return { success: true as const, chatMessage: chatMsg };
      });

      return result;
    } catch (error) {
      console.error("[DungeonPartyService] sendChat error:", error);
      return { success: false, error: "Failed to send chat message" };
    }
  }

  async initiateLeaveVote(leaderId: string, partyId: string, sessionId: string, floorNumber: number): Promise<{ success: boolean; vote?: any; error?: string }> {
    try {
      if (floorNumber % 5 !== 0) {
        return { success: false, error: "Leave votes can only be initiated every 5 floors" };
      }

      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM dungeon_parties WHERE id = ${partyId} FOR UPDATE`);

        const [party] = await tx.select()
          .from(dungeonParties)
          .where(eq(dungeonParties.id, partyId))
          .limit(1);

        if (!party) {
          return { success: false as const, error: "Party not found" };
        }

        if (party.leaderId !== leaderId) {
          return { success: false as const, error: "Only the party leader can initiate a leave vote" };
        }

        if (party.status !== 'in_dungeon') {
          return { success: false as const, error: "Party is not in a dungeon" };
        }

        const activeVotes = await tx.select()
          .from(dungeonLeaveVotes)
          .where(and(
            eq(dungeonLeaveVotes.dungeonPartyId, partyId),
            eq(dungeonLeaveVotes.status, 'active'),
          ))
          .limit(1);

        if (activeVotes.length > 0) {
          return { success: false as const, error: "There is already an active vote" };
        }

        const expiresAt = new Date(Date.now() + 30_000);

        const [vote] = await tx.insert(dungeonLeaveVotes)
          .values({
            dungeonSessionId: sessionId,
            dungeonPartyId: partyId,
            floorNumber,
            initiatedBy: leaderId,
            expiresAt,
            status: 'active',
          })
          .returning();

        await tx.update(dungeonPartyMembers)
          .set({ decision: null })
          .where(eq(dungeonPartyMembers.dungeonPartyId, partyId));

        await tx.update(dungeonParties)
          .set({ version: sql`version + 1`, updatedAt: new Date() })
          .where(eq(dungeonParties.id, partyId));

        return { success: true as const, vote };
      });

      return result;
    } catch (error) {
      console.error("[DungeonPartyService] initiateLeaveVote error:", error);
      return { success: false, error: "Failed to initiate leave vote" };
    }
  }

  async submitVoteDecision(playerId: string, partyId: string, decision: 'continue' | 'leave'): Promise<{ success: boolean; decisions?: any[]; error?: string }> {
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM dungeon_parties WHERE id = ${partyId} FOR UPDATE`);

        const [activeVote] = await tx.select()
          .from(dungeonLeaveVotes)
          .where(and(
            eq(dungeonLeaveVotes.dungeonPartyId, partyId),
            eq(dungeonLeaveVotes.status, 'active'),
          ))
          .limit(1);

        if (!activeVote) {
          return { success: false as const, error: "No active vote found" };
        }

        const [member] = await tx.select()
          .from(dungeonPartyMembers)
          .where(and(
            eq(dungeonPartyMembers.dungeonPartyId, partyId),
            eq(dungeonPartyMembers.playerId, playerId),
          ))
          .limit(1);

        if (!member) {
          return { success: false as const, error: "You are not in this party" };
        }

        await tx.update(dungeonPartyMembers)
          .set({ decision })
          .where(eq(dungeonPartyMembers.id, member.id));

        await tx.update(dungeonParties)
          .set({ version: sql`version + 1`, updatedAt: new Date() })
          .where(eq(dungeonParties.id, partyId));

        const allMembers = await tx.select()
          .from(dungeonPartyMembers)
          .where(eq(dungeonPartyMembers.dungeonPartyId, partyId));

        const decisions = allMembers.map(m => ({
          playerId: m.playerId,
          decision: m.playerId === playerId ? decision : m.decision,
        }));

        return { success: true as const, decisions };
      });

      return result;
    } catch (error) {
      console.error("[DungeonPartyService] submitVoteDecision error:", error);
      return { success: false, error: "Failed to submit vote decision" };
    }
  }

  async resolveVote(partyId: string, voteId: string): Promise<{ success: boolean; result?: 'continue' | 'leave'; decisions?: any[]; error?: string }> {
    try {
      const txResult = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM dungeon_parties WHERE id = ${partyId} FOR UPDATE`);

        const [vote] = await tx.select()
          .from(dungeonLeaveVotes)
          .where(and(
            eq(dungeonLeaveVotes.id, voteId),
            eq(dungeonLeaveVotes.status, 'active'),
          ))
          .limit(1);

        if (!vote) {
          return { success: false as const, error: "Vote not found or already resolved" };
        }

        const allMembers = await tx.select()
          .from(dungeonPartyMembers)
          .where(eq(dungeonPartyMembers.dungeonPartyId, partyId));

        const decisions = allMembers.map(m => ({
          playerId: m.playerId,
          decision: m.decision,
        }));

        const hasLeaveOrNull = allMembers.some(m => m.decision === 'leave' || m.decision === null);
        const voteResult: 'continue' | 'leave' = hasLeaveOrNull ? 'leave' : 'continue';

        await tx.update(dungeonLeaveVotes)
          .set({ status: 'resolved' })
          .where(eq(dungeonLeaveVotes.id, voteId));

        await tx.update(dungeonParties)
          .set({ version: sql`version + 1`, updatedAt: new Date() })
          .where(eq(dungeonParties.id, partyId));

        return { success: true as const, result: voteResult, decisions };
      });

      return txResult;
    } catch (error) {
      console.error("[DungeonPartyService] resolveVote error:", error);
      return { success: false, error: "Failed to resolve vote" };
    }
  }

  async completeDungeon(partyId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM dungeon_parties WHERE id = ${partyId} FOR UPDATE`);

        await tx.update(dungeonParties)
          .set({ status: 'completed', version: sql`version + 1`, updatedAt: new Date() })
          .where(eq(dungeonParties.id, partyId));

        await tx.delete(dungeonPartyChat)
          .where(eq(dungeonPartyChat.dungeonPartyId, partyId));

        await tx.delete(dungeonLeaveVotes)
          .where(eq(dungeonLeaveVotes.dungeonPartyId, partyId));
      });

      return { success: true };
    } catch (error) {
      console.error("[DungeonPartyService] completeDungeon error:", error);
      return { success: false, error: "Failed to complete dungeon" };
    }
  }

  async disbandParty(partyId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[PartyTrack] DISBAND_PARTY party=${partyId} partyType=dungeon result=pending`);
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM dungeon_parties WHERE id = ${partyId} FOR UPDATE`);

        await tx.update(dungeonParties)
          .set({ status: 'disbanded', version: sql`version + 1`, updatedAt: new Date() })
          .where(eq(dungeonParties.id, partyId));

        await tx.delete(dungeonPartyChat)
          .where(eq(dungeonPartyChat.dungeonPartyId, partyId));
      });

      console.log(`[PartyTrack] DISBAND_PARTY party=${partyId} partyType=dungeon result=ok`);
      return { success: true };
    } catch (error) {
      console.error("[DungeonPartyService] disbandParty error:", error);
      console.log(`[PartyTrack] DISBAND_PARTY party=${partyId} partyType=dungeon result=error reason=exception`);
      return { success: false, error: "Failed to disband party" };
    }
  }

  async cleanupStaleParties(): Promise<{ success: boolean; cleaned: number }> {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const staleParties = await db.select({ id: dungeonParties.id })
        .from(dungeonParties)
        .where(and(
          inArray(dungeonParties.status, ['recruiting', 'locked']),
          sql`${dungeonParties.updatedAt} < ${cutoff}`,
        ));

      if (staleParties.length === 0) {
        return { success: true, cleaned: 0 };
      }

      const staleIds = staleParties.map(p => p.id);

      await db.transaction(async (tx) => {
        await tx.update(dungeonParties)
          .set({ status: 'disbanded', version: sql`version + 1`, updatedAt: new Date() })
          .where(inArray(dungeonParties.id, staleIds));

        await tx.delete(dungeonPartyChat)
          .where(inArray(dungeonPartyChat.dungeonPartyId, staleIds));
      });

      return { success: true, cleaned: staleIds.length };
    } catch (error) {
      console.error("[DungeonPartyService] cleanupStaleParties error:", error);
      return { success: true, cleaned: 0 };
    }
  }
}

export const dungeonPartyService = new DungeonPartyService();

