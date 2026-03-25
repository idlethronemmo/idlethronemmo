// @ts-nocheck
import { db } from "../../db";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  dungeonSessions, dungeonMemberStates, dungeonSessionEvents,
  players, parties, partyMembers, dungeonLootTables, dungeonFloorTemplates,
  dungeons, gameMonsters,
  DEFENCE_DR_CONSTANT,
} from "@shared/schema";
import {
  COMBAT_HP_SCALE,
  buildDungeonPlayerHit,
  buildDungeonPlayerDps,
  buildDungeonMonsterHit,
  scaledMonsterHp,
  scaledMonsterAttack,
  randomHit,
} from "@shared/dungeonCombat";
import { resolvePlayerCombatStats, PlayerCombatStats } from "../playerStatsResolver";
import { broadcastToParty, createPartyEvent, getPlayerIdFromSocket } from "../partyWs";
import { calculatePartyLootBonus } from "@shared/dungeonEngine";
import { WeaponSkill } from "../combatUtils";
import {
  cachedGameItems,
  refreshItemCache,
  getEquipmentBonusesFromCache,
  getWeaponSkillsFromCache,
} from "../scheduler";
import { getSubClass } from "@shared/subClasses";
import { computeAggroMultiplier } from "@shared/aggroSystem";

const MAX_ACTIVE_DUNGEON_SESSIONS = 200;
const TICK_INTERVAL_MS = 500;
const SEGMENT_SIZE = 15;
const INTERMISSION_DURATION_MS = 30000;
const INITIALIZING_DURATION_MS = 3000;
const VOTE_TIMEOUT_MS = 60000;
const MAX_REPLAY_EVENTS = 50;
const STUN_DR_WINDOW_MS = 10000;
const DISCONNECT_EXTRACT_AT_INTERMISSION = true;

export interface MemberState {
  playerId: string;
  username: string;
  role: string;
  status: 'alive' | 'dead' | 'extracted' | 'disconnected' | 'left';
  isAlive: boolean;
  isExtracted: boolean;
  isDisconnected: boolean;
  disconnectedAt: number | null;
  currentHp: number;
  maxHp: number;
  dps: number;
  minHit: number;
  maxHit: number;
  defense: number;
  healEfficiency: number;
  attackSpeedMs: number;
  attackAccumulator: number;
  totalDamageDealt: number;
  totalHealingDone: number;
  currentThreat: number;
  weaponType: string | null;
  armorType: string | null;
  critChance: number;
  critDamage: number;
  lifestealPercent: number;
  stunUntil: number;
  stunCount: number;
  lastStunAt: number;
  personalLoot: Record<string, number>;
  personalGold: number;
  personalXp: number;
  durabilityLost: number;
  weaponSkills: WeaponSkill[];
  aggroMultiplier: number;
  forceAggroUntil: number;
}

export interface MonsterState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  attackSpeedMs: number;
  attackAccumulator: number;
  xpReward: number;
  skills: MonsterSkill[];
  isBoss: boolean;
  stunUntil: number;
  enraged: boolean;
  reflectDamage: number;
  flatReflectDamage: number;
  powerMultiplier?: number;
}

interface MonsterSkill {
  type: string;
  chance: number;
  value?: number;
  flatValue?: number;
  cooldownMs: number;
  lastUsedAt: number;
}

interface FloorTemplate {
  monsterId: string;
  monsterHp: number;
  monsterAttack: number;
  monsterDefence: number;
  monsterAttackSpeed: number;
  monsterXpReward: number;
  monsterSkills: MonsterSkill[];
  isBoss: boolean;
}

export interface SessionState {
  sessionId: string;
  partyId: string;
  dungeonId: string;
  seed: string;
  phase: 'initializing' | 'active' | 'intermission' | 'ended' | 'advancing' | 'voting' | 'boss_preview';
  phaseStartedAt: number;
  advancingUntil: number;
  currentFloor: number;
  floorsCleared: number;
  members: Map<string, MemberState>;
  monster: MonsterState | null;
  lootPool: Record<string, number>;
  goldPool: number;
  xpPool: number;
  securedLootCheckpoints: number;
  lastCheckpointFloor: number;
  maxFloors: number;
  eventLog: CombatEvent[];
  eventIndex: number;
  multiplier: number;
  riskLevel: number;
  configSnapshot: any;
  tickCount: number;
  recentEvents: CombatEvent[];
  floorTemplatesCache: any[];
  isTicking: boolean;
  floorCombatStartedAt: number;
  enrageMultiplier: number;
  lastEnrageAt: number;
  currentSegment: number;
  difficultyMultiplier: number;
  votes: Map<string, boolean>;
  voteDeadline: number;
  nextDifficultyMultiplier: number;
  lootTablesCache: any[];
  bossReadyPlayers: Set<string>;
}

export interface CombatEvent {
  index: number;
  type: string;
  timestamp: number;
  data: Record<string, any>;
}

class DungeonSessionManager {
  private sessions = new Map<string, SessionState>();
  private playerSessionMap = new Map<string, string>();
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  start() {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => this.tickAll(), TICK_INTERVAL_MS);
    console.log('[DungeonSessionManager] Started global tick loop');
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getPlayerSession(playerId: string): SessionState | undefined {
    const sessionId = this.playerSessionMap.get(playerId);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  async createSessionFromParty(partyId: string, dungeonId: string, memberPlayerIds: string[]): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    if (this.sessions.size >= MAX_ACTIVE_DUNGEON_SESSIONS) {
      return { success: false, error: 'Server at capacity. Please try again later.' };
    }

    for (const pid of memberPlayerIds) {
      if (this.playerSessionMap.has(pid)) {
        return { success: false, error: `Player is already in an active dungeon session.` };
      }
    }

    try {
      if (cachedGameItems.size === 0) await refreshItemCache();

      const [dungeon] = await db.select().from(dungeons).where(eq(dungeons.id, dungeonId)).limit(1);
      if (!dungeon) return { success: false, error: 'Dungeon not found' };

      const config = (dungeon as any).config || {};
      const maxFloors = SEGMENT_SIZE;
      const seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const floorTemplatesRows = await db.select().from(dungeonFloorTemplates)
        .where(eq(dungeonFloorTemplates.dungeonId, dungeonId));
      const floorTemplatesCache = floorTemplatesRows.sort((a, b) => a.floorRangeStart - b.floorRangeStart);

      const lootTablesRows = await db.select().from(dungeonLootTables)
        .where(eq(dungeonLootTables.dungeonId, dungeonId));
      const lootTablesCache = lootTablesRows.sort((a, b) => a.floorRangeStart - b.floorRangeStart);

      const playerRows = await db.select().from(players).where(inArray(players.id, memberPlayerIds));
      if (playerRows.length !== memberPlayerIds.length) {
        return { success: false, error: 'Not all party members found' };
      }

      const memberStates = new Map<string, MemberState>();
      const dbMemberInserts: any[] = [];

      for (const player of playerRows) {
        const skills = (player.skills as Record<string, { xp: number; level: number }>) || {};
        const equipment = (player.equipment as Record<string, string | null>) || {};
        const activeBuffs = (player.activeBuffs || []) as Array<{ effectType: string; value: number; expiresAt: number }>;
        const itemModifications = (player.itemModifications as Record<string, any>) || {};

        let enhancementLevels = new Map<string, number>();
        try {
          const result = await db.execute(sql`SELECT item_id, enhancement_level FROM weapon_enhancements WHERE player_id = ${player.id}`);
          for (const row of result.rows as any[]) {
            if (row.enhancement_level > 0) enhancementLevels.set(row.item_id, row.enhancement_level);
          }
        } catch {}

        const combatStats = resolvePlayerCombatStats({ skills, equipment, itemModifications, activeBuffs, enhancementLevels });

        const { minHit, maxHit, avgHit } = buildDungeonPlayerHit(combatStats.strengthLevel, combatStats.equipBonuses.strengthBonus);
        const dps = buildDungeonPlayerDps(avgHit, combatStats.finalAttackSpeedMs);
        const isStaff = combatStats.weaponCategory === "staff" || (equipment.weapon && equipment.weapon.toLowerCase().includes("staff"));
        const healEfficiency = isStaff ? dps * 1.5 : 0;
        const totalDefence = combatStats.defenceLevel + combatStats.equipBonuses.defenceBonus;
        const weaponSkills = getWeaponSkillsFromCache(equipment, itemModifications);

        let armorType: string | null = null;
        if (equipment.body) {
          const baseBodyId = equipment.body.replace(/_\+\d+$/, '');
          const cachedBody = cachedGameItems.get(baseBodyId);
          if (cachedBody) {
            const slot = (cachedBody as any).slot;
            if (slot === 'body' || slot === 'chest') {
              const cat = (cachedBody as any).armorCategory || (cachedBody as any).category || null;
              armorType = cat;
            }
          }
        }
        const subClass = getSubClass(combatStats.weaponCategory, armorType);
        const autoRole = subClass.baseRole === 'hybrid' ? 'dps' : subClass.baseRole;
        const role = autoRole || (isStaff ? 'healer' : 'dps');

        const hp = Math.min(player.currentHitpoints || combatStats.maxHp, combatStats.maxHp);

        const ms: MemberState = {
          playerId: player.id,
          username: player.username,
          role,
          status: 'alive',
          isAlive: true,
          isExtracted: false,
          isDisconnected: false,
          disconnectedAt: null,
          currentHp: hp,
          maxHp: combatStats.maxHp,
          dps,
          minHit,
          maxHit,
          defense: totalDefence,
          healEfficiency,
          attackSpeedMs: combatStats.finalAttackSpeedMs,
          attackAccumulator: 0,
          totalDamageDealt: 0,
          totalHealingDone: 0,
          currentThreat: 0,
          weaponType: combatStats.weaponCategory,
          armorType: armorType,
          critChance: Math.min(50, (combatStats.equipBonuses.critChance || 0) + (combatStats.buffs.critChancePercent || 0)),
          critDamage: combatStats.equipBonuses.critDamage || 150,
          lifestealPercent: combatStats.weaponLifestealPercent + (combatStats.buffs.lifestealBuffPercent || 0),
          stunUntil: 0,
          stunCount: 0,
          lastStunAt: 0,
          personalLoot: {},
          personalGold: 0,
          personalXp: 0,
          durabilityLost: 0,
          weaponSkills,
          aggroMultiplier: computeAggroMultiplier(armorType, combatStats.weaponCategory),
          forceAggroUntil: 0,
        };

        memberStates.set(player.id, ms);

        dbMemberInserts.push({
          sessionId: '', // filled after session insert
          playerId: player.id,
          isAlive: 1,
          hasExited: 0,
          statsSnapshot: {
            maxHp: combatStats.maxHp,
            dps,
            defense: totalDefence,
            healEfficiency,
            attackSpeedMs: combatStats.finalAttackSpeedMs,
            role,
            weaponType: combatStats.weaponCategory,
            critChance: ms.critChance,
            critDamage: ms.critDamage,
            lifestealPercent: ms.lifestealPercent,
          },
          currentThreat: 0,
          totalDamageDealt: 0,
          totalHealingDone: 0,
          personalLootEarned: {},
          personalGoldEarned: 0,
          personalXpEarned: 0,
          durabilityLost: 0,
          role,
          currentHp: hp,
          maxHp: combatStats.maxHp,
          isExtracted: 0,
          isDisconnected: 0,
          durabilitySnapshot: equipment,
          buffsSnapshot: activeBuffs,
        });
      }

      const [session] = await db.insert(dungeonSessions).values({
        dungeonId,
        mode: 'party',
        status: 'active',
        playerId: memberPlayerIds[0],
        partyId,
        currentFloor: 1,
        floorsCleared: 0,
        riskLevel: 0,
        chaosMeter: 0,
        chaosTriggerCount: 0,
        activeCurses: [],
        curseStack: 0,
        currentMultiplier: 100,
        lootPool: {},
        goldPool: 0,
        xpPool: 0,
        configSnapshot: config,
        sessionSeed: seed,
        intermissionFloor: 0,
      }).returning();

      for (const insert of dbMemberInserts) {
        insert.sessionId = session.id;
      }
      await db.insert(dungeonMemberStates).values(dbMemberInserts);

      await db.update(players)
        .set({ activeTask: null, activeCombat: null })
        .where(inArray(players.id, memberPlayerIds));

      await db.update(parties)
        .set({ status: 'in_dungeon' })
        .where(eq(parties.id, partyId));

      const now = Date.now();
      const sessionState: SessionState = {
        sessionId: session.id,
        partyId,
        dungeonId,
        seed,
        phase: 'initializing',
        phaseStartedAt: now,
        currentFloor: 1,
        floorsCleared: 0,
        members: memberStates,
        monster: null,
        lootPool: {},
        goldPool: 0,
        xpPool: 0,
        securedLootCheckpoints: 0,
        lastCheckpointFloor: 0,
        maxFloors,
        eventLog: [],
        eventIndex: 0,
        multiplier: 100,
        riskLevel: 0,
        configSnapshot: config,
        tickCount: 0,
        advancingUntil: 0,
        recentEvents: [],
        floorTemplatesCache,
        isTicking: false,
        floorCombatStartedAt: 0,
        enrageMultiplier: 1.0,
        lastEnrageAt: 0,
        currentSegment: 1,
        difficultyMultiplier: 1.0,
        votes: new Map(),
        voteDeadline: 0,
        nextDifficultyMultiplier: 2.0,
        lootTablesCache,
        bossReadyPlayers: new Set(),
      };

      this.sessions.set(session.id, sessionState);
      for (const pid of memberPlayerIds) {
        this.playerSessionMap.set(pid, session.id);
      }

      this.broadcastSessionEvent(sessionState, 'dungeon_session:started', {
        sessionId: session.id,
        dungeonId,
        members: Array.from(memberStates.values()).map(m => ({
          playerId: m.playerId,
          username: m.username,
          role: m.role,
          currentHp: m.currentHp,
          maxHp: m.maxHp,
        })),
        maxFloors,
        phase: 'initializing',
      });

      if (!this.tickInterval) this.start();

      return { success: true, sessionId: session.id };
    } catch (err: any) {
      console.error('[DungeonSessionManager] createSessionFromParty error:', err);
      return { success: false, error: err.message || 'Failed to create session' };
    }
  }

  private tickAll() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      this.tickSession(session, now).catch(err => {
        console.error(`[DungeonSessionManager] Tick error for ${sessionId}:`, err);
      });
    }

    if (this.sessions.size === 0 && this.tickInterval) {
      this.stop();
    }
  }

  private async tickSession(session: SessionState, now: number) {
    if (session.isTicking) return;
    session.isTicking = true;
    try { // guard against overlapping async ticks
      await this._tickSessionInner(session, now);
    } finally {
      session.isTicking = false;
    }
  }

  private async _tickSessionInner(session: SessionState, now: number) {
    session.tickCount++;

    if (session.phase === 'initializing') {
      if (!session.monster) {
        await this.spawnMonsterForFloor(session);
        if (session.monster) {
          this.broadcastSessionEvent(session, 'dungeon_session:monster_preview', {
            floor: session.currentFloor,
            monster: {
              id: session.monster.id,
              name: session.monster.name,
              hp: session.monster.hp,
              maxHp: session.monster.maxHp,
              attack: session.monster.attack,
              isBoss: session.monster.isBoss,
              skills: session.monster.skills.map(s => ({ type: s.type, chance: s.chance, value: s.value, cooldownMs: s.cooldownMs })),
              powerMultiplier: session.monster.powerMultiplier,
            },
          });
        }
      }
      if (now - session.phaseStartedAt >= INITIALIZING_DURATION_MS) {
        session.phase = 'active';
        session.phaseStartedAt = now;
        session.floorCombatStartedAt = now + 1500; // Delay combat by 1.5s
        session.enrageMultiplier = 1.0;
        session.lastEnrageAt = 0;
        this.broadcastSessionEvent(session, 'dungeon_session:phase_change', {
          phase: 'active',
          floor: session.currentFloor,
          combatDelayMs: 1500,
          monster: session.monster ? {
            id: session.monster.id,
            name: session.monster.name,
            hp: session.monster.hp,
            maxHp: session.monster.maxHp,
            attack: session.monster.attack,
            isBoss: session.monster.isBoss,
            skills: session.monster.skills.map(s => ({ type: s.type, chance: s.chance, value: s.value, cooldownMs: s.cooldownMs })),
            powerMultiplier: session.monster.powerMultiplier,
          } : null,
        });
      }
      return;
    }

    if (session.phase === 'intermission') {
      if (now - session.phaseStartedAt >= INTERMISSION_DURATION_MS) {
        if (DISCONNECT_EXTRACT_AT_INTERMISSION) {
          this.extractDisconnectedMembers(session, now);
        }

        const alive = this.getAliveMembers(session);
        if (alive.length === 0) {
          this.endSession(session, 'all_dead_or_extracted');
          return;
        }

        try {
          await this.refreshMemberStatsFromDb(session);
        } catch (err) {
          console.error('[DSM] Error refreshing member stats after intermission:', err);
        }

        session.currentFloor++;
        session.phase = 'active';
        session.phaseStartedAt = now;
        session.floorCombatStartedAt = now + 1500; // Delay combat by 1.5s
        session.enrageMultiplier = 1.0;
        session.lastEnrageAt = 0;
        await this.spawnMonsterForFloor(session);
        this.broadcastSessionEvent(session, 'dungeon_session:phase_change', {
          phase: 'active',
          floor: session.currentFloor,
          combatDelayMs: 1500,
          monster: session.monster ? {
            id: session.monster.id,
            name: session.monster.name,
            hp: session.monster.hp,
            maxHp: session.monster.maxHp,
            attack: session.monster.attack,
            isBoss: session.monster.isBoss,
            skills: session.monster.skills.map(s => ({ type: s.type, chance: s.chance, value: s.value, cooldownMs: s.cooldownMs })),
          } : null,
        });
      }
      return;
    }

    if (session.phase === 'advancing') {
      if (now >= session.advancingUntil) {
        await this.spawnMonsterForFloor(session);
        const isBossFloor = session.monster?.isBoss === true;

        if (isBossFloor) {
          session.phase = 'boss_preview';
          session.phaseStartedAt = now;
          session.bossReadyPlayers = new Set();
          this.broadcastSessionEvent(session, 'dungeon_session:boss_preview', {
            floor: session.currentFloor,
            monster: session.monster ? {
              id: session.monster.id,
              name: session.monster.name,
              hp: session.monster.hp,
              maxHp: session.monster.maxHp,
              attack: session.monster.attack,
              defense: session.monster.defense,
              attackSpeedMs: session.monster.attackSpeedMs,
              isBoss: true,
              skills: session.monster.skills.map(s => ({ type: s.type, chance: s.chance, value: s.value, cooldownMs: s.cooldownMs })),
              powerMultiplier: session.monster.powerMultiplier,
            } : null,
            timeoutMs: 10000,
            alivePlayers: this.getAliveMembers(session).map(m => ({ playerId: m.playerId, username: m.username })),
          });
        } else {
          session.phase = 'active';
          session.phaseStartedAt = now;
          session.floorCombatStartedAt = now + 1500; // Delay combat by 1.5s
          session.enrageMultiplier = 1.0;
          session.lastEnrageAt = 0;
          this.broadcastSessionEvent(session, 'dungeon_session:phase_change', {
            phase: 'active',
            floor: session.currentFloor,
            combatDelayMs: 1500,
            monster: session.monster ? {
              id: session.monster.id,
              name: session.monster.name,
              hp: session.monster.hp,
              maxHp: session.monster.maxHp,
              attack: session.monster.attack,
              isBoss: session.monster.isBoss,
              skills: session.monster.skills.map(s => ({ type: s.type, chance: s.chance, value: s.value, cooldownMs: s.cooldownMs })),
              powerMultiplier: session.monster.powerMultiplier,
            } : null,
          });
        }
      }
      return;
    }

    if (session.phase === 'voting') {
      if (now >= session.voteDeadline) {
        this.resolveVote(session, false);
      }
      return;
    }

    if (session.phase === 'boss_preview') {
      if (now - session.phaseStartedAt >= 10000) {
        this.startBossCombat(session, now);
      }
      return;
    }

    if (session.phase === 'active') {
      await this.tickCombat(session, now);
    }
  }

  private async tickCombat(session: SessionState, now: number) {
    if (!session.monster) return;

    // Combat pause before it starts moving
    if (session.floorCombatStartedAt > now) {
      return;
    }

    const alive = this.getAliveMembers(session);
    if (alive.length === 0) {
      this.endSession(session, 'all_dead');
      return;
    }

    const events: CombatEvent[] = [];
    const monster = session.monster;

    for (const member of alive) {
      if (member.stunUntil > now) continue;

      member.attackAccumulator += TICK_INTERVAL_MS;
      if (member.attackAccumulator >= member.attackSpeedMs) {
        member.attackAccumulator -= member.attackSpeedMs;

        const triggeredSkill = this.rollWeaponSkill(member);

        if (member.role === 'healer') {
          if (triggeredSkill && (triggeredSkill.type === 'heal' || triggeredSkill.type === 'groupHeal')) {
            const healPct = triggeredSkill.healPercent || 10;
            if (triggeredSkill.type === 'groupHeal') {
              const aliveMembers = this.getAliveMembers(session);
              for (const target of aliveMembers) {
                const healVariance = 0.85 + Math.random() * 0.30;
                const healAmount = Math.floor(target.maxHp * healPct * healVariance / 100);
                const actualHeal = Math.min(healAmount, target.maxHp - target.currentHp);
                if (actualHeal > 0) {
                  target.currentHp += actualHeal;
                  member.totalHealingDone += actualHeal;
                  events.push(this.createEvent(session, 'heal', {
                    sourceId: member.playerId,
                    targetId: target.playerId,
                    healerName: member.username,
                    targetName: target.username,
                    amount: actualHeal,
                    skillName: triggeredSkill.name,
                    skillId: triggeredSkill.id,
                    skillType: triggeredSkill.type,
                  }));
                }
              }
            } else {
              const target = this.findHealTarget(session);
              if (target) {
                const healVariance = 0.85 + Math.random() * 0.30;
                const healAmount = Math.floor(target.maxHp * healPct * healVariance / 100);
                const actualHeal = Math.min(healAmount, target.maxHp - target.currentHp);
                target.currentHp += actualHeal;
                member.totalHealingDone += actualHeal;
                if (actualHeal > 0) {
                  events.push(this.createEvent(session, 'heal', {
                    sourceId: member.playerId,
                    targetId: target.playerId,
                    healerName: member.username,
                    targetName: target.username,
                    amount: actualHeal,
                    skillName: triggeredSkill.name,
                    skillId: triggeredSkill.id,
                    skillType: triggeredSkill.type,
                  }));
                }
              }
            }
          } else if (triggeredSkill && triggeredSkill.type === 'buff') {
            const target = this.findHealTarget(session);
            if (target) {
              const regenHeal = Math.floor(target.maxHp * 0.03);
              const actualHeal = Math.min(regenHeal, target.maxHp - target.currentHp);
              if (actualHeal > 0) {
                target.currentHp += actualHeal;
                member.totalHealingDone += actualHeal;
                events.push(this.createEvent(session, 'heal', {
                  sourceId: member.playerId,
                  targetId: target.playerId,
                  healerName: member.username,
                  targetName: target.username,
                  amount: actualHeal,
                  skillName: triggeredSkill.name,
                  skillId: triggeredSkill.id,
                  skillType: 'buff',
                }));
              }
            }
          } else if (triggeredSkill && (triggeredSkill.type === 'damage' || triggeredSkill.type === 'aoe')) {
            const perHitDmg = randomHit(member.minHit, member.maxHit) * COMBAT_HP_SCALE;
            const skillBonus = triggeredSkill.damage || 0;
            const defReduction = 1 - monster.defense / (monster.defense + DEFENCE_DR_CONSTANT);
            const dmg = Math.max(1, Math.floor((perHitDmg + skillBonus * COMBAT_HP_SCALE) * Math.max(0.25, defReduction)));
            this.applyDamageToMonster(session, member, dmg, false, events, now, triggeredSkill.name, triggeredSkill.id);
          } else {
            const baseHealPct = 5;
            const healVariance = 0.85 + Math.random() * 0.30;
            const target = this.findHealTarget(session);
            if (target) {
              const healAmount = Math.floor(target.maxHp * baseHealPct * healVariance / 100);
              const actualHeal = Math.min(healAmount, target.maxHp - target.currentHp);
              if (actualHeal > 0) {
                target.currentHp += actualHeal;
                member.totalHealingDone += actualHeal;
                events.push(this.createEvent(session, 'heal', {
                  sourceId: member.playerId,
                  targetId: target.playerId,
                  healerName: member.username,
                  targetName: target.username,
                  amount: actualHeal,
                }));
              }
            }
          }

          const healerHitRaw = randomHit(member.minHit, member.maxHit);
          const healerDmg = Math.floor(healerHitRaw * 0.3 * COMBAT_HP_SCALE);
          if (healerDmg > 0 && !(triggeredSkill && (triggeredSkill.type === 'damage' || triggeredSkill.type === 'aoe'))) {
            const defReduction = 1 - monster.defense / (monster.defense + DEFENCE_DR_CONSTANT);
            const actualDmg = Math.max(1, Math.floor(healerDmg * Math.max(0.25, defReduction)));
            this.applyDamageToMonster(session, member, actualDmg, false, events, now);
          }
        } else {
          const perHitDmg = randomHit(member.minHit, member.maxHit) * COMBAT_HP_SCALE;
          const defReduction = 1 - monster.defense / (monster.defense + DEFENCE_DR_CONSTANT);

          let skillBonus = 0;
          let skillName: string | undefined;
          let skillId: string | undefined;

          if (triggeredSkill) {
            skillName = triggeredSkill.name;
            skillId = triggeredSkill.id;

            if (triggeredSkill.type === 'damage' || triggeredSkill.type === 'aoe') {
              skillBonus = (triggeredSkill.damage || 0) * COMBAT_HP_SCALE;
            } else if (triggeredSkill.type === 'critical') {
              skillBonus = Math.floor(perHitDmg * ((triggeredSkill.damageMultiplier || 2) - 1));
            } else if (triggeredSkill.type === 'armor_break') {
              const breakPct = triggeredSkill.armorBreakPercent || 30;
              const reducedDef = Math.floor(monster.defense * (1 - breakPct / 100));
              const betterReduction = 1 - reducedDef / (reducedDef + DEFENCE_DR_CONSTANT);
              const baseDmg = Math.max(1, Math.floor(perHitDmg * Math.max(0.25, betterReduction)));
              const normalDmg = Math.max(1, Math.floor(perHitDmg * Math.max(0.25, defReduction)));
              skillBonus = baseDmg - normalDmg;
            } else if (triggeredSkill.type === 'poison') {
              skillBonus = (triggeredSkill.dotDamage || 5) * COMBAT_HP_SCALE;
            } else if (triggeredSkill.type === 'stun') {
              const stunMs = (triggeredSkill.stunCycles || 1) * monster.attackSpeedMs;
              if (monster.stunUntil < now) {
                monster.stunUntil = now + stunMs;
              }
            } else if (triggeredSkill.type === 'combo') {
              skillBonus = Math.floor(perHitDmg * ((triggeredSkill.hits || 2) - 1) * 0.5);
            } else if (triggeredSkill.type === 'lifesteal_burst') {
              const burstHeal = Math.floor(perHitDmg * 0.3);
              const actualHeal = Math.min(burstHeal, member.maxHp - member.currentHp);
              if (actualHeal > 0) {
                member.currentHp += actualHeal;
              }
            } else if (triggeredSkill.type === 'heal') {
              const healPct = triggeredSkill.healPercent || 5;
              const healTarget = this.findHealTarget(session);
              if (healTarget) {
                const healAmt = Math.floor(healTarget.maxHp * healPct / 100);
                const actualHeal = Math.min(healAmt, healTarget.maxHp - healTarget.currentHp);
                if (actualHeal > 0) {
                  healTarget.currentHp += actualHeal;
                  member.totalHealingDone += actualHeal;
                  events.push(this.createEvent(session, 'heal', {
                    sourceId: member.playerId,
                    targetId: healTarget.playerId,
                    healerName: member.username,
                    targetName: healTarget.username,
                    amount: actualHeal,
                    skillName: triggeredSkill.name,
                    skillId: triggeredSkill.id,
                    skillType: triggeredSkill.type,
                  }));
                }
              }
            } else if (triggeredSkill.type === 'force_aggro') {
              const allAlive = this.getAliveMembers(session);
              const maxThreat = Math.max(...allAlive.map(m => m.currentThreat));
              member.currentThreat = maxThreat + 200;
              member.forceAggroUntil = now + (triggeredSkill.duration || 5000);
              events.push(this.createEvent(session, 'weapon_skill', {
                skill: 'force_aggro',
                skillName: triggeredSkill.name,
                skillId: triggeredSkill.id,
                playerId: member.playerId,
                playerName: member.username,
              }));
            }
          }

          let dmg = Math.max(1, Math.floor((perHitDmg + skillBonus) * Math.max(0.25, defReduction)));

          const isCrit = Math.random() * 100 < member.critChance;
          if (isCrit) {
            dmg = Math.floor(dmg * (member.critDamage / 100));
          }

          this.applyDamageToMonster(session, member, dmg, isCrit, events, now, skillName, skillId);

          if (member.lifestealPercent > 0) {
            const lsHeal = Math.floor(dmg * member.lifestealPercent / 100);
            const actualLs = Math.min(lsHeal, member.maxHp - member.currentHp);
            if (actualLs > 0) {
              member.currentHp += actualLs;
            }
          }
        }

        const baseThreat = member.role === 'tank' ? 20 : 10;
        member.currentThreat += Math.floor(baseThreat * member.aggroMultiplier);
      }
    }

    if (monster.hp <= 0) {
      await this.onMonsterDefeated(session, events, now);
      this.broadcastCombatBatch(session, events);
      return;
    }

    monster.attackAccumulator += TICK_INTERVAL_MS;
    if (monster.attackAccumulator >= monster.attackSpeedMs) {
      monster.attackAccumulator -= monster.attackSpeedMs;

      const allDied = this.processMonsterSkills(session, monster, alive, events, now);
      if (allDied) {
        this.broadcastCombatBatch(session, events);
        this.endSession(session, 'all_dead');
        return;
      }

      this.checkEnrage(session, monster, events, now);

      const target = this.findMonsterTarget(session, this.getAliveMembers(session));
      if (target) {
        const playerDefReduction = 1 - target.defense / (target.defense + DEFENCE_DR_CONSTANT);
        let dmg = Math.max(1, Math.floor(monster.attack * session.enrageMultiplier * Math.max(0.25, playerDefReduction)));

        const isTankBlock = target.role === 'tank' && Math.random() < 0.35;
        if (target.role === 'tank') {
          dmg = Math.floor(dmg * 0.80);
        }
        let blocked = 0;
        if (isTankBlock) {
          blocked = Math.floor(dmg * 0.3);
          dmg -= blocked;
        }

        target.currentHp -= dmg;
        events.push(this.createEvent(session, 'monster_attack', {
          targetId: target.playerId,
          targetName: target.username,
          monsterName: monster.name,
          damage: dmg,
          targetHp: Math.max(0, target.currentHp),
          ...(isTankBlock ? { blocked, tankBlock: true } : {}),
        }));

        if (target.currentHp <= 0) {
          target.currentHp = 0;
          target.isAlive = false;
          target.status = 'dead';
          target.durabilityLost += 5;
          events.push(this.createEvent(session, 'member_died', {
            playerId: target.playerId,
            playerName: target.username,
            floor: session.currentFloor,
          }));

          const remainingAlive = this.getAliveMembers(session);
          if (remainingAlive.length === 0) {
            this.broadcastCombatBatch(session, events);
            this.endSession(session, 'all_dead');
            return;
          }
        }
      }
    }

    if (events.length > 0) {
      this.broadcastCombatBatch(session, events);
    }
  }

  private checkEnrage(session: SessionState, monster: MonsterState, events: CombatEvent[], now: number) {
    const combatDuration = now - session.floorCombatStartedAt;
    const ENRAGE_START_MS = 120000;
    const PHASE2_MS = 240000;

    if (combatDuration < ENRAGE_START_MS) return;

    let interval: number;
    if (combatDuration >= PHASE2_MS) {
      interval = 10000;
    } else {
      interval = 30000;
    }

    if (session.lastEnrageAt === 0) {
      session.enrageMultiplier = 1.1;
      session.lastEnrageAt = now;
      monster.enraged = true;
      events.push(this.createEvent(session, 'monster_enrage', {
        monsterName: monster.name,
        multiplier: session.enrageMultiplier,
      }));
      return;
    }

    if (now - session.lastEnrageAt >= interval) {
      session.enrageMultiplier = Math.round((session.enrageMultiplier + 0.1) * 10) / 10;
      session.lastEnrageAt = now;
      events.push(this.createEvent(session, 'monster_enrage', {
        monsterName: monster.name,
        multiplier: session.enrageMultiplier,
      }));
    }
  }

  private rollWeaponSkill(member: MemberState): WeaponSkill | null {
    if (!member.weaponSkills || member.weaponSkills.length === 0) return null;
    for (const skill of member.weaponSkills) {
      if (Math.random() * 100 < skill.chance) {
        return skill;
      }
    }
    return null;
  }

  private applyDamageToMonster(session: SessionState, member: MemberState, dmg: number, isCrit: boolean, events: CombatEvent[], now: number, skillName?: string, skillId?: string) {
    const monster = session.monster!;

    if (monster.reflectDamage > 0 || monster.flatReflectDamage > 0) {
      const rawReflected = Math.floor(dmg * monster.reflectDamage / 100) + (monster.flatReflectDamage || 0);
      const reflectCap = Math.floor(member.maxHp * 0.12);
      const reflected = Math.min(rawReflected, reflectCap);
      member.currentHp -= reflected;
      if (reflected > 0) {
        events.push(this.createEvent(session, 'reflect_damage', {
          sourceId: member.playerId,
          playerName: member.username,
          monsterName: monster.name,
          damage: reflected,
          memberHp: Math.max(0, member.currentHp),
        }));
        if (member.currentHp <= 0) {
          member.currentHp = 0;
          member.isAlive = false;
          member.durabilityLost += 5;
          events.push(this.createEvent(session, 'member_died', {
            playerId: member.playerId,
            playerName: member.username,
            floor: session.currentFloor,
            cause: 'reflect_damage',
          }));
        }
      }
    }

    monster.hp -= dmg;
    member.totalDamageDealt += dmg;

    events.push(this.createEvent(session, 'player_attack', {
      playerId: member.playerId,
      playerName: member.username,
      targetName: monster.name,
      damage: dmg,
      isCrit,
      monsterHp: Math.max(0, monster.hp),
      ...(skillName ? { skillName, skillId } : {}),
    }));
  }

  private processMonsterSkills(session: SessionState, monster: MonsterState, alive: MemberState[], events: CombatEvent[], now: number): boolean {
    for (const skill of monster.skills) {
      if (now - skill.lastUsedAt < skill.cooldownMs) continue;
      if (Math.random() * 100 > skill.chance) continue;

      skill.lastUsedAt = now;

      switch (skill.type) {
        case 'mass_stun': {
          for (const m of alive) {
            let stunDuration = (skill.value || 2000);
            if (now - m.lastStunAt < STUN_DR_WINDOW_MS) {
              m.stunCount++;
              if (m.stunCount === 2) stunDuration = Math.floor(stunDuration * 0.5);
              else if (m.stunCount >= 3) stunDuration = 0;
            } else {
              m.stunCount = 1;
            }
            m.lastStunAt = now;
            if (stunDuration > 0) {
              m.stunUntil = now + stunDuration;
            }
          }
          events.push(this.createEvent(session, 'monster_skill', { skill: 'mass_stun', monsterName: monster.name }));
          break;
        }
        case 'mass_armor_break': {
          for (const m of alive) {
            m.defense = Math.max(0, Math.floor(m.defense * 0.7));
          }
          events.push(this.createEvent(session, 'monster_skill', { skill: 'mass_armor_break', monsterName: monster.name }));
          break;
        }
        case 'self_heal_percent': {
          const healAmt = Math.floor(monster.maxHp * (skill.value || 5) / 100);
          monster.hp = Math.min(monster.maxHp, monster.hp + healAmt);
          events.push(this.createEvent(session, 'monster_skill', { skill: 'self_heal_percent', monsterName: monster.name, amount: healAmt, monsterHp: monster.hp }));
          break;
        }
        case 'reflect_damage': {
          monster.reflectDamage = skill.value || 20;
          monster.flatReflectDamage = skill.flatValue || 0;
          events.push(this.createEvent(session, 'monster_skill', { skill: 'reflect_damage', monsterName: monster.name, percent: monster.reflectDamage }));
          break;
        }
        case 'aggro_reset': {
          for (const m of alive) {
            m.currentThreat = Math.max(1, Math.floor(10 * m.aggroMultiplier));
          }
          events.push(this.createEvent(session, 'monster_skill', { skill: 'aggro_reset', monsterName: monster.name }));
          break;
        }
        case 'aggro_swap': {
          const highestThreat = alive.reduce((max, m) => m.currentThreat > max.currentThreat ? m : max, alive[0]);
          const nonTanks = alive.filter(m => m.role !== 'tank' && m.playerId !== highestThreat.playerId);
          if (nonTanks.length > 0) {
            const swapTarget = nonTanks[Math.floor(Math.random() * nonTanks.length)];
            const temp = highestThreat.currentThreat;
            highestThreat.currentThreat = swapTarget.currentThreat;
            swapTarget.currentThreat = temp;
            events.push(this.createEvent(session, 'monster_skill', { skill: 'aggro_swap', monsterName: monster.name, targetId: swapTarget.playerId, targetName: swapTarget.username }));
          } else {
            const randomTarget = alive[Math.floor(Math.random() * alive.length)];
            randomTarget.currentThreat = Math.floor(randomTarget.currentThreat * 1.5);
            events.push(this.createEvent(session, 'monster_skill', { skill: 'aggro_swap', monsterName: monster.name, targetId: randomTarget.playerId, targetName: randomTarget.username }));
          }
          break;
        }
        case 'execute_player': {
          const lowHpTarget = alive.find(m => m.currentHp / m.maxHp < 0.3);
          if (lowHpTarget) {
            lowHpTarget.currentHp = 0;
            lowHpTarget.isAlive = false;
            lowHpTarget.status = 'dead';
            lowHpTarget.durabilityLost += 10;
            events.push(this.createEvent(session, 'monster_skill', { skill: 'execute_player', monsterName: monster.name, targetId: lowHpTarget.playerId, targetName: lowHpTarget.username }));
            events.push(this.createEvent(session, 'member_died', { playerId: lowHpTarget.playerId, playerName: lowHpTarget.username, floor: session.currentFloor }));
          }
          break;
        }
        case 'summon_adds': {
          const addHp = Math.floor(monster.maxHp * 0.1);
          monster.hp += addHp;
          events.push(this.createEvent(session, 'monster_skill', { skill: 'summon_adds', monsterName: monster.name, addedHp: addHp }));
          break;
        }
        case 'multi_target_attack': {
          for (const m of alive) {
            const mDmg = Math.max(1, Math.floor(monster.attack * 0.5));
            m.currentHp -= mDmg;
            events.push(this.createEvent(session, 'monster_multi_attack', { monsterName: monster.name, targetId: m.playerId, targetName: m.username, damage: mDmg, targetHp: Math.max(0, m.currentHp) }));
            if (m.currentHp <= 0) {
              m.currentHp = 0;
              m.isAlive = false;
              m.status = 'dead';
              m.durabilityLost += 5;
              events.push(this.createEvent(session, 'member_died', { playerId: m.playerId, playerName: m.username, floor: session.currentFloor }));
            }
          }
          const remainingAfterMulti = this.getAliveMembers(session);
          if (remainingAfterMulti.length === 0) {
            return true;
          }
          break;
        }
        case 'heal_on_player_heal': {
          events.push(this.createEvent(session, 'monster_skill', { skill: 'heal_on_player_heal', monsterName: monster.name }));
          break;
        }
        case 'buff_punish': {
          events.push(this.createEvent(session, 'monster_skill', { skill: 'buff_punish', monsterName: monster.name }));
          break;
        }
        case 'root': {
          const rootTarget = alive[Math.floor(Math.random() * alive.length)];
          if (rootTarget) {
            rootTarget.stunUntil = now + (skill.value || 3000);
            events.push(this.createEvent(session, 'monster_skill', { skill: 'root', monsterName: monster.name, targetId: rootTarget.playerId, targetName: rootTarget.username }));
          }
          break;
        }
        case 'regenerate_on_no_stun': {
          if (monster.stunUntil <= now) {
            const regenAmt = Math.floor(monster.maxHp * (skill.value || 3) / 100);
            monster.hp = Math.min(monster.maxHp, monster.hp + regenAmt);
            events.push(this.createEvent(session, 'monster_skill', { skill: 'regenerate_on_no_stun', monsterName: monster.name, amount: regenAmt }));
          }
          break;
        }
      }
    }
    return false;
  }

  private rollLootForFloor(session: SessionState, floor: number): Record<string, number> {
    const lootDropped: Record<string, number> = {};
    const lootTable = session.lootTablesCache.find((t: any) =>
      floor >= t.floorRangeStart && floor <= t.floorRangeEnd
    );
    if (!lootTable) return lootDropped;

    const guaranteedDrops = (lootTable.guaranteedDrops as string[]) || [];
    for (const itemId of guaranteedDrops) {
      lootDropped[itemId] = (lootDropped[itemId] || 0) + 1;
    }

    const possibleDrops = (lootTable.possibleDrops as Array<{ itemId: string; weight: number }>) || [];
    if (possibleDrops.length > 0) {
      const totalWeight = possibleDrops.reduce((s, d) => s + (d.weight || 1), 0);
      const dropChance = 0.3 + (floor * 0.02);
      if (Math.random() < dropChance) {
        let roll = Math.random() * totalWeight;
        for (const drop of possibleDrops) {
          roll -= (drop.weight || 1);
          if (roll <= 0) {
            lootDropped[drop.itemId] = (lootDropped[drop.itemId] || 0) + 1;
            break;
          }
        }
      }
    }

    const partyExcDrops = (lootTable.partyExclusiveDrops as Array<{ itemId: string; weight: number }>) || [];
    if (partyExcDrops.length > 0) {
      const totalWeight = partyExcDrops.reduce((s, d) => s + (d.weight || 1), 0);
      if (Math.random() < 0.15) {
        let roll = Math.random() * totalWeight;
        for (const drop of partyExcDrops) {
          roll -= (drop.weight || 1);
          if (roll <= 0) {
            lootDropped[drop.itemId] = (lootDropped[drop.itemId] || 0) + 1;
            break;
          }
        }
      }
    }

    return lootDropped;
  }

  private async onMonsterDefeated(session: SessionState, events: CombatEvent[], now: number) {
    const monster = session.monster!;
    session.floorsCleared++;
    session.riskLevel = Math.min(20, session.riskLevel + 1);
    session.multiplier = Math.min(500, session.multiplier + 5);

    const memberCount = this.getAliveMembers(session).length;
    const lootBonus = calculatePartyLootBonus(memberCount);

    const xpShare = Math.floor(monster.xpReward * (session.multiplier / 100) * lootBonus);
    const goldShare = Math.floor((monster.xpReward * 0.3) * (session.multiplier / 100) * lootBonus);

    const alive = this.getAliveMembers(session);
    const totalDmg = alive.reduce((s, m) => s + m.totalDamageDealt, 0) || 1;

    for (const m of alive) {
      const dmgRatio = m.totalDamageDealt / totalDmg;
      m.personalXp += Math.floor(xpShare * dmgRatio);
      m.personalGold += Math.floor(goldShare * dmgRatio);
    }

    session.xpPool += xpShare;
    session.goldPool += goldShare;

    const lootDropped = this.rollLootForFloor(session, session.currentFloor);
    if (Object.keys(lootDropped).length > 0) {
      for (const [itemId, qty] of Object.entries(lootDropped)) {
        session.lootPool[itemId] = (session.lootPool[itemId] || 0) + qty;
        for (const m of alive) {
          const dmgRatio = m.totalDamageDealt / totalDmg;
          const share = Math.max(1, Math.floor(qty * dmgRatio));
          m.personalLoot[itemId] = (m.personalLoot[itemId] || 0) + share;
        }
      }
    }

    events.push(this.createEvent(session, 'monster_defeated', {
      floor: session.currentFloor,
      monsterName: monster.name,
      xpGained: xpShare,
      goldGained: goldShare,
      floorsCleared: session.floorsCleared,
      loot: lootDropped,
    }));

    const isSegmentEnd = session.floorsCleared >= session.maxFloors;

    if (isSegmentEnd) {
      session.securedLootCheckpoints++;
      session.lastCheckpointFloor = session.floorsCleared;

      const nextMult = session.currentSegment === 1 ? 2 : session.currentSegment * 2;
      session.nextDifficultyMultiplier = nextMult;
      session.phase = 'voting';
      session.phaseStartedAt = now;
      session.voteDeadline = now + VOTE_TIMEOUT_MS;
      session.votes = new Map();
      session.monster = null;

      for (const m of alive) {
        m.attackAccumulator = 0;
      }

      this.broadcastSessionEvent(session, 'dungeon_session:vote_started', {
        floorsCleared: session.floorsCleared,
        currentSegment: session.currentSegment,
        nextDifficulty: nextMult,
        timeoutMs: VOTE_TIMEOUT_MS,
        alivePlayers: alive.map(m => ({ playerId: m.playerId, username: m.username })),
      });

      this.saveSessionToDb(session).catch(err => console.error('[DSM] DB save error:', err));
      return;
    }

    session.currentFloor++;
    session.phase = 'advancing';
    session.phaseStartedAt = now;
    session.advancingUntil = now + 2000;
    session.monster = null;

    for (const m of alive) {
      m.attackAccumulator = 0;
    }

    events.push(this.createEvent(session, 'dungeon_session:floor_advancing', {
      nextFloor: session.currentFloor,
    }));

    this.broadcastSessionEvent(session, 'dungeon_session:floor_advancing', {
      nextFloor: session.currentFloor,
    });
  }

  private async getNextMonstersPreview(session: SessionState, count: number = 5): Promise<Array<{ floor: number; name: string; isBoss: boolean; monsterId: string; maxHitpoints: number; attackLevel: number; defenceLevel: number; attackSpeed: number; skills: any[] }>> {
    const startFloor = session.floorsCleared + 1;
    const floorEntries: Array<{ floor: number; monsterId: string; isBoss: boolean; powerMult: number }> = [];

    for (let i = 0; i < count; i++) {
      const floor = startFloor + i;
      if (floor > session.maxFloors) break;

      const template = session.floorTemplatesCache.find((t: any) =>
        floor >= t.floorRangeStart && floor <= t.floorRangeEnd
      );

      if (template) {
        const isBossFloor = floor % SEGMENT_SIZE === 0 && floor > 0;
        const monsterPool = (isBossFloor && template.bossMonsterIds?.length > 0)
          ? (template.bossMonsterIds as string[])
          : ((template.monsterPool as string[]) || []);
        const powerMult = (template.powerMultiplier || 100) / 100;

        if (monsterPool.length > 0) {
          const selectedId = monsterPool[Math.floor(Math.random() * monsterPool.length)];
          floorEntries.push({ floor, monsterId: selectedId, isBoss: isBossFloor, powerMult });
          continue;
        }
      }
      floorEntries.push({ floor, monsterId: '', isBoss: false, powerMult: 1 });
    }

    const monsterIds = [...new Set(floorEntries.filter(e => e.monsterId).map(e => e.monsterId))];
    const monsterDataMap = new Map<string, any>();

    if (monsterIds.length > 0) {
      try {
        const rows = await db.select().from(gameMonsters).where(inArray(gameMonsters.id, monsterIds));
        for (const r of rows) monsterDataMap.set(r.id, r);
      } catch {}
    }

    const memberCount = this.getAliveMembers(session).length || 1;

    return floorEntries.map(e => {
      const m = monsterDataMap.get(e.monsterId);
      const partyHpScale = 1.0 + (memberCount - 1) * 0.4;
      const bossHpScale = e.isBoss ? 2.0 : 1.0;
      if (m) {
        return {
          floor: e.floor,
          name: m.name,
          isBoss: e.isBoss,
          monsterId: e.monsterId,
          maxHitpoints: Math.floor(m.maxHitpoints * COMBAT_HP_SCALE * e.powerMult * partyHpScale * bossHpScale),
          attackLevel: Math.floor((m.attackLevel || 1) * e.powerMult),
          defenceLevel: Math.floor((m.defenceLevel || 1) * e.powerMult),
          attackSpeed: m.attackSpeed || 2500,
          skills: (m.skills as any[]) || [],
        };
      }
      return {
        floor: e.floor,
        name: `Floor ${e.floor} Monster`,
        isBoss: e.isBoss,
        monsterId: e.monsterId,
        maxHitpoints: 0,
        attackLevel: 0,
        defenceLevel: 0,
        attackSpeed: 2500,
        skills: [],
      };
    });
  }

  private async refreshMemberStatsFromDb(session: SessionState): Promise<void> {
    const alive = this.getAliveMembers(session);
    if (alive.length === 0) return;

    const playerIds = alive.map(m => m.playerId);
    const playerRows = await db.select().from(players).where(inArray(players.id, playerIds));

    if (cachedGameItems.size === 0) await refreshItemCache();

    for (const player of playerRows) {
      const member = session.members.get(player.id);
      if (!member || !member.isAlive || member.isExtracted) continue;

      const skills = (player.skills as Record<string, { xp: number; level: number }>) || {};
      const equipment = (player.equipment as Record<string, string | null>) || {};
      const activeBuffs = (player.activeBuffs || []) as Array<{ effectType: string; value: number; expiresAt: number }>;
      const itemMods = (player.itemModifications as Record<string, any>) || {};

      let enhancementLevels = new Map<string, number>();
      try {
        const result = await db.execute(sql`SELECT item_id, enhancement_level FROM weapon_enhancements WHERE player_id = ${player.id}`);
        for (const row of result.rows as any[]) {
          if (row.enhancement_level > 0) enhancementLevels.set(row.item_id, row.enhancement_level);
        }
      } catch {}

      const combatStats = resolvePlayerCombatStats({ skills, equipment, itemModifications: itemMods, activeBuffs, enhancementLevels });

      const { minHit: newMinHit, maxHit: newMaxHit, avgHit } = buildDungeonPlayerHit(combatStats.strengthLevel, combatStats.equipBonuses.strengthBonus);
      const dps = buildDungeonPlayerDps(avgHit, combatStats.finalAttackSpeedMs);
      const isStaff = combatStats.weaponCategory === "staff" || (equipment.weapon && equipment.weapon.toLowerCase().includes("staff"));
      const healEfficiency = isStaff ? dps * 1.5 : 0;
      const totalDefence = combatStats.defenceLevel + combatStats.equipBonuses.defenceBonus;

      let armorType: string | null = null;
      if (equipment.body) {
        const baseBodyId = (equipment.body as string).replace(/_\+\d+$/, '');
        const cachedBody = cachedGameItems.get(baseBodyId);
        if (cachedBody) {
          const slot = (cachedBody as any).slot;
          if (slot === 'body' || slot === 'chest') {
            const cat = (cachedBody as any).armorCategory || (cachedBody as any).category || null;
            armorType = cat;
          }
        }
      }
      const subClass = getSubClass(combatStats.weaponCategory, armorType);
      const autoRole = subClass.baseRole === 'hybrid' ? 'dps' : subClass.baseRole;

      member.role = autoRole || (isStaff ? 'healer' : 'dps');
      member.maxHp = combatStats.maxHp;
      if (member.currentHp > member.maxHp) member.currentHp = member.maxHp;
      member.dps = dps;
      member.minHit = newMinHit;
      member.maxHit = newMaxHit;
      member.defense = totalDefence;
      member.healEfficiency = healEfficiency;
      member.attackSpeedMs = combatStats.finalAttackSpeedMs;
      member.weaponType = combatStats.weaponCategory;
      member.critChance = Math.min(50, (combatStats.equipBonuses.critChance || 0) + (combatStats.buffs.critChancePercent || 0));
      member.critDamage = combatStats.equipBonuses.critDamage || 150;
      member.lifestealPercent = combatStats.weaponLifestealPercent + (combatStats.buffs.lifestealBuffPercent || 0);
      member.weaponSkills = getWeaponSkillsFromCache(equipment, itemMods);
      member.armorType = armorType;
      member.aggroMultiplier = computeAggroMultiplier(armorType, combatStats.weaponCategory);
    }
  }

  private convertDbSkillsToMonsterSkills(dbSkills: any[]): MonsterSkill[] {
    if (!dbSkills || !Array.isArray(dbSkills)) return [];
    const converted: MonsterSkill[] = [];
    for (const s of dbSkills) {
      const skillType = s.type || s.id || '';
      const skillMap: Record<string, () => MonsterSkill> = {
        'combo': () => ({ type: 'multi_target_attack', chance: s.chance || 25, value: s.hits || 50, cooldownMs: s.cooldownMs || 10000, lastUsedAt: 0 }),
        'enrage': () => ({ type: 'self_heal_percent', chance: 0, value: 0, cooldownMs: 999999, lastUsedAt: 0 }),
        'summon_adds': () => ({ type: 'summon_adds', chance: s.chance || 30, value: s.summonHpPercent || 10, cooldownMs: s.cooldownMs || 20000, lastUsedAt: 0 }),
        'mass_stun': () => ({ type: 'mass_stun', chance: s.chance || 20, value: s.value || 2000, cooldownMs: s.cooldownMs || 15000, lastUsedAt: 0 }),
        'mass_armor_break': () => ({ type: 'mass_armor_break', chance: s.chance || 25, value: s.value || 30, cooldownMs: s.cooldownMs || 20000, lastUsedAt: 0 }),
        'self_heal_percent': () => ({ type: 'self_heal_percent', chance: s.chance || 30, value: s.value || 5, cooldownMs: s.cooldownMs || 12000, lastUsedAt: 0 }),
        'reflect_damage': () => ({ type: 'reflect_damage', chance: s.chance || 20, value: s.value || 20, flatValue: (s as any).flatReflect || 0, cooldownMs: s.cooldownMs || 15000, lastUsedAt: 0 }),
        'aggro_reset': () => ({ type: 'aggro_reset', chance: s.chance || 15, value: 0, cooldownMs: s.cooldownMs || 18000, lastUsedAt: 0 }),
        'aggro_swap': () => ({ type: 'aggro_swap', chance: s.chance || 15, value: 0, cooldownMs: s.cooldownMs || 18000, lastUsedAt: 0 }),
        'execute_player': () => ({ type: 'execute_player', chance: s.chance || 10, value: 30, cooldownMs: s.cooldownMs || 25000, lastUsedAt: 0 }),
        'root': () => ({ type: 'root', chance: s.chance || 20, value: s.value || 3000, cooldownMs: s.cooldownMs || 12000, lastUsedAt: 0 }),
        'multi_target_attack': () => ({ type: 'multi_target_attack', chance: s.chance || 25, value: s.value || 50, cooldownMs: s.cooldownMs || 10000, lastUsedAt: 0 }),
      };
      const factory = skillMap[skillType];
      if (factory) {
        converted.push(factory());
      } else {
        converted.push({ type: skillType, chance: s.chance || 20, value: s.value || 0, cooldownMs: s.cooldownMs || 15000, lastUsedAt: 0 });
      }
    }
    return converted;
  }

  private async spawnMonsterForFloor(session: SessionState) {
    const floor = session.currentFloor;
    const memberCount = this.getAliveMembers(session).length || 1;
    const isBossFloor = floor % SEGMENT_SIZE === 0 && floor > 0;

    const maxRandomMult = session.currentSegment * 2;
    const randomMult = isBossFloor ? 1.0 : (1.0 + Math.random() * (maxRandomMult - 1));

    const template = session.floorTemplatesCache.find((t: any) =>
      floor >= t.floorRangeStart && floor <= t.floorRangeEnd
    );

    if (template) {
      const monsterPool = (isBossFloor && template.bossMonsterIds?.length > 0)
        ? (template.bossMonsterIds as string[])
        : ((template.monsterPool as string[]) || []);

      if (monsterPool.length > 0) {
        const selectedId = monsterPool[Math.floor(Math.random() * monsterPool.length)];

        try {
          const [monsterRow] = await db.select().from(gameMonsters)
            .where(eq(gameMonsters.id, selectedId)).limit(1);

          if (monsterRow) {
            const powerMult = (template.powerMultiplier || 100) / 100 * session.difficultyMultiplier;
            const partyHpScale = 1.0 + (memberCount - 1) * 0.4;
            const bossHpScale = isBossFloor ? 1.5 : 1.0;
            const bossAtkScale = isBossFloor ? 1.15 : 1.0;

            const baseHp = scaledMonsterHp(monsterRow.maxHitpoints, powerMult * randomMult);
            const { avgHit: monsterAvgHit } = buildDungeonMonsterHit(monsterRow.attackLevel, monsterRow.strengthLevel || 0, (monsterRow as any).strengthBonus || 0);
            const baseAtk = scaledMonsterAttack(monsterAvgHit, powerMult * randomMult);
            const baseDef = monsterRow.defenceLevel;
            const atkSpeed = monsterRow.attackSpeed || 2500;

            const dbSkills = (monsterRow.skills as any[]) || [];
            const skills = this.convertDbSkillsToMonsterSkills(dbSkills);

            const xpReward = Math.floor((50 + floor * 20) * (isBossFloor ? 3 : 1) * session.difficultyMultiplier);

            session.monster = {
              id: monsterRow.id,
              name: monsterRow.name,
              hp: Math.floor(baseHp * partyHpScale * bossHpScale),
              maxHp: Math.floor(baseHp * partyHpScale * bossHpScale),
              attack: Math.floor(baseAtk * bossAtkScale),
              defense: Math.floor(baseDef * powerMult),
              attackSpeedMs: atkSpeed,
              attackAccumulator: 0,
              xpReward,
              skills,
              isBoss: isBossFloor,
              stunUntil: 0,
              enraged: false,
              reflectDamage: 0,
              flatReflectDamage: 0,
              powerMultiplier: isBossFloor ? session.difficultyMultiplier : Math.round(randomMult * 10) / 10,
            };
            return;
          }
        } catch (err) {
          console.error('[DSM] Error fetching monster from DB, falling back to procedural:', err);
        }
      }
    }

    const isBoss = isBossFloor;
    const baseHp = (100 + (floor * 50) + (floor * floor * 2)) * COMBAT_HP_SCALE * session.difficultyMultiplier * randomMult;
    const baseAttack = (10 + (floor * 3)) * session.difficultyMultiplier * randomMult;
    const baseDefense = 5 + (floor * 2);
    const hpScale = isBoss ? 3.0 : 1.0 + (memberCount - 1) * 0.4;
    const atkScale = isBoss ? 1.5 : 1.0;

    const skills: MonsterSkill[] = [];
    if (isBoss && floor >= 5) {
      const possibleSkills: MonsterSkill[] = [
        { type: 'mass_stun', chance: 20, value: 2000, cooldownMs: 15000, lastUsedAt: 0 },
        { type: 'mass_armor_break', chance: 25, value: 30, cooldownMs: 20000, lastUsedAt: 0 },
        { type: 'self_heal_percent', chance: 30, value: 5, cooldownMs: 12000, lastUsedAt: 0 },
        { type: 'aggro_reset', chance: 15, value: 0, cooldownMs: 18000, lastUsedAt: 0 },
        { type: 'multi_target_attack', chance: 25, value: 50, cooldownMs: 10000, lastUsedAt: 0 },
      ];
      const numSkills = Math.min(possibleSkills.length, 1 + Math.floor(floor / 10));
      for (let i = 0; i < numSkills; i++) {
        const idx = Math.floor(Math.random() * possibleSkills.length);
        skills.push(possibleSkills.splice(idx, 1)[0]);
      }
    }

    session.monster = {
      id: `monster_f${floor}`,
      name: isBoss ? `Floor ${floor} Boss` : `Monster (F${floor})`,
      hp: Math.floor(baseHp * hpScale),
      maxHp: Math.floor(baseHp * hpScale),
      attack: Math.floor(baseAttack * atkScale),
      defense: baseDefense,
      attackSpeedMs: isBoss ? 3000 : 2000,
      attackAccumulator: 0,
      xpReward: Math.floor((50 + floor * 20) * (isBoss ? 3 : 1) * session.difficultyMultiplier),
      skills,
      isBoss,
      stunUntil: 0,
      enraged: false,
      reflectDamage: 0,
      flatReflectDamage: 0,
      powerMultiplier: isBoss ? session.difficultyMultiplier : Math.round(randomMult * 10) / 10,
    };
  }

  private findHealTarget(session: SessionState): MemberState | null {
    const alive = this.getAliveMembers(session);
    if (alive.length === 0) return null;
    return alive.reduce((lowest, m) =>
      (m.currentHp / m.maxHp) < (lowest.currentHp / lowest.maxHp) ? m : lowest
    , alive[0]);
  }

  private findMonsterTarget(session: SessionState, alive: MemberState[]): MemberState | null {
    if (alive.length === 0) return null;

    const now = Date.now();
    const forcedMembers = alive.filter(m => m.forceAggroUntil > now);
    if (forcedMembers.length > 0) {
      return forcedMembers.reduce((best, m) => m.forceAggroUntil > best.forceAggroUntil ? m : best, forcedMembers[0]);
    }

    const tanks = alive.filter(m => m.role === 'tank');
    if (tanks.length > 0) {
      if (Math.random() < 0.7) {
        return tanks.reduce((max, m) => m.currentThreat > max.currentThreat ? m : max, tanks[0]);
      }
    }

    return alive.reduce((max, m) => m.currentThreat > max.currentThreat ? m : max, alive[0]);
  }

  private getAliveMembers(session: SessionState): MemberState[] {
    return Array.from(session.members.values()).filter(m => m.isAlive && !m.isExtracted);
  }

  private createEvent(session: SessionState, type: string, data: Record<string, any>): CombatEvent {
    const event: CombatEvent = {
      index: session.eventIndex++,
      type,
      timestamp: Date.now(),
      data,
    };

    session.eventLog.push(event);
    if (session.eventLog.length > MAX_REPLAY_EVENTS * 2) {
      session.eventLog = session.eventLog.slice(-MAX_REPLAY_EVENTS);
    }

    session.recentEvents.push(event);
    if (session.recentEvents.length > 100) {
      session.recentEvents = session.recentEvents.slice(-100);
    }

    return event;
  }

  getSessionStateForPolling(playerId: string, sinceEventIndex: number = 0): any | null {
    const session = this.getPlayerSession(playerId);
    if (!session) return null;

    const membersSnapshot = Array.from(session.members.values()).map(m => ({
      playerId: m.playerId,
      username: m.username,
      role: m.role,
      weaponType: m.weaponType,
      currentHp: Math.max(0, m.currentHp),
      maxHp: m.maxHp,
      isAlive: m.isAlive,
      isExtracted: m.isExtracted,
      isDisconnected: m.isDisconnected,
      attackAccumulator: m.attackAccumulator,
      attackSpeedMs: m.attackSpeedMs,
      currentThreat: m.currentThreat,
      totalDamageDealt: m.totalDamageDealt,
      totalHealingDone: m.totalHealingDone,
      personalGold: m.personalGold,
      personalXp: m.personalXp,
    }));

    const monsterSnapshot = session.monster ? {
      id: session.monster.id,
      name: session.monster.name,
      hp: Math.max(0, session.monster.hp),
      maxHp: session.monster.maxHp,
      attack: session.monster.attack,
      defense: session.monster.defense,
      attackSpeedMs: session.monster.attackSpeedMs,
      attackAccumulator: session.monster.attackAccumulator,
      isBoss: session.monster.isBoss,
      skills: session.monster.skills.map(s => ({ type: s.type, chance: s.chance, value: s.value, cooldownMs: s.cooldownMs })),
      enraged: session.monster.enraged,
      stunUntil: session.monster.stunUntil,
      reflectDamage: session.monster.reflectDamage,
      powerMultiplier: session.monster.powerMultiplier,
    } : null;

    const newEvents = session.recentEvents.filter(e => e.index >= sinceEventIndex);

    return {
      sessionId: session.sessionId,
      partyId: session.partyId,
      dungeonId: session.dungeonId,
      phase: session.phase,
      currentFloor: session.currentFloor,
      floorsCleared: session.floorsCleared,
      maxFloors: session.maxFloors,
      multiplier: session.multiplier,
      riskLevel: session.riskLevel,
      securedLootCheckpoints: session.securedLootCheckpoints,
      currentSegment: session.currentSegment,
      difficultyMultiplier: session.difficultyMultiplier,
      members: membersSnapshot,
      monster: monsterSnapshot,
      events: newEvents,
      latestEventIndex: session.eventIndex,
      advancingUntil: session.advancingUntil,
    };
  }

  private broadcastCombatBatch(session: SessionState, events: CombatEvent[]) {
    if (events.length === 0) return;

    const membersSnapshot = Array.from(session.members.values()).map(m => ({
      playerId: m.playerId,
      username: m.username,
      role: m.role,
      weaponType: m.weaponType,
      armorType: m.armorType,
      currentHp: Math.max(0, m.currentHp),
      maxHp: m.maxHp,
      dps: m.dps,
      defense: m.defense,
      isAlive: m.isAlive,
      isExtracted: m.isExtracted,
      isDisconnected: m.isDisconnected,
      attackAccumulator: m.attackAccumulator,
      attackSpeedMs: m.attackSpeedMs,
      currentThreat: m.currentThreat,
      totalDamageDealt: m.totalDamageDealt,
      totalHealingDone: m.totalHealingDone,
      personalGold: m.personalGold,
      personalXp: m.personalXp,
    }));

    const monsterSnapshot = session.monster ? {
      id: session.monster.id,
      name: session.monster.name,
      hp: Math.max(0, session.monster.hp),
      maxHp: session.monster.maxHp,
      attack: session.monster.attack,
      defense: session.monster.defense,
      attackAccumulator: session.monster.attackAccumulator,
      attackSpeedMs: session.monster.attackSpeedMs,
      isBoss: session.monster.isBoss,
      skills: session.monster.skills.map(s => ({ type: s.type, chance: s.chance, value: s.value, cooldownMs: s.cooldownMs })),
      stunUntil: session.monster.stunUntil,
      enraged: session.monster.enraged,
      reflectDamage: session.monster.reflectDamage,
      powerMultiplier: session.monster.powerMultiplier,
    } : null;

    broadcastToParty(session.partyId, createPartyEvent('dungeon_session:combat_batch' as any, session.partyId, 0, {
      sessionId: session.sessionId,
      events,
      members: membersSnapshot,
      monster: monsterSnapshot,
      floor: session.currentFloor,
      phase: session.phase,
      floorsCleared: session.floorsCleared,
    }));
  }

  private broadcastSessionEvent(session: SessionState, type: string, data: Record<string, any>) {
    broadcastToParty(session.partyId, createPartyEvent(type as any, session.partyId, 0, {
      sessionId: session.sessionId,
      ...data,
    }));
  }

  async handlePlayerDisconnect(playerId: string) {
    const session = this.getPlayerSession(playerId);
    if (!session) return;

    const member = session.members.get(playerId);
    if (!member || !member.isAlive || member.isExtracted) return;

    member.isDisconnected = true;
    member.status = 'disconnected';
    member.disconnectedAt = Date.now();

    this.broadcastSessionEvent(session, 'dungeon_session:member_disconnected', {
      playerId,
    });

    await db.update(dungeonMemberStates)
      .set({ isDisconnected: 1, disconnectedAt: new Date() })
      .where(and(
        eq(dungeonMemberStates.sessionId, session.sessionId),
        eq(dungeonMemberStates.playerId, playerId),
      ));
  }

  async handlePlayerReconnect(playerId: string): Promise<{ session: SessionState; events: CombatEvent[] } | null> {
    const session = this.getPlayerSession(playerId);
    if (!session) return null;

    const member = session.members.get(playerId);
    if (!member) return null;

    member.isDisconnected = false;
    member.disconnectedAt = null;

    await db.update(dungeonMemberStates)
      .set({ isDisconnected: 0, disconnectedAt: null, lastSeenAt: new Date() })
      .where(and(
        eq(dungeonMemberStates.sessionId, session.sessionId),
        eq(dungeonMemberStates.playerId, playerId),
      ));

    this.broadcastSessionEvent(session, 'dungeon_session:member_reconnected', {
      playerId,
    });

    const recentEvents = session.eventLog.slice(-MAX_REPLAY_EVENTS);
    return { session, events: recentEvents };
  }

  handleVoteCast(playerId: string, vote: boolean) {
    const session = this.getPlayerSession(playerId);
    if (!session || session.phase !== 'voting') return;

    const member = session.members.get(playerId);
    if (!member || !member.isAlive || member.isExtracted) return;

    session.votes.set(playerId, vote);

    this.broadcastSessionEvent(session, 'dungeon_session:vote_cast', {
      playerId,
      username: member.username,
      vote,
      totalVotes: session.votes.size,
      needed: this.getAliveMembers(session).length,
    });

    if (!vote) {
      this.resolveVote(session, false);
      return;
    }

    const alive = this.getAliveMembers(session);
    const allVoted = alive.every(m => session.votes.has(m.playerId));
    if (allVoted) {
      const allYes = alive.every(m => session.votes.get(m.playerId) === true);
      this.resolveVote(session, allYes);
    }
  }

  private async resolveVote(session: SessionState, allAgreed: boolean) {
    if (session.phase !== 'voting') return;

    if (allAgreed) {
      session.currentSegment++;
      session.difficultyMultiplier = session.nextDifficultyMultiplier;
      session.maxFloors += SEGMENT_SIZE;
      session.votes = new Map();

      try {
        await this.refreshMemberStatsFromDb(session);
      } catch (err) {
        console.error('[DSM] Error refreshing stats after vote:', err);
      }

      session.currentFloor++;
      session.phase = 'advancing';
      session.phaseStartedAt = Date.now();
      session.advancingUntil = Date.now() + 2000;
      session.monster = null;

      this.broadcastSessionEvent(session, 'dungeon_session:vote_resolved', {
        result: 'continue',
        newDifficulty: session.difficultyMultiplier,
        newSegment: session.currentSegment,
        maxFloors: session.maxFloors,
      });
    } else {
      this.broadcastSessionEvent(session, 'dungeon_session:vote_resolved', {
        result: 'end',
        floorsCleared: session.floorsCleared,
      });
      this.endSession(session, 'completed');
    }
  }

  handleBossReady(playerId: string) {
    const session = this.getPlayerSession(playerId);
    if (!session || session.phase !== 'boss_preview') return;

    const member = session.members.get(playerId);
    if (!member || !member.isAlive || member.isExtracted) return;

    session.bossReadyPlayers.add(playerId);

    this.broadcastSessionEvent(session, 'dungeon_session:boss_ready', {
      playerId,
      username: member.username,
      readyCount: session.bossReadyPlayers.size,
      needed: this.getAliveMembers(session).length,
    });

    const alive = this.getAliveMembers(session);
    if (alive.every(m => session.bossReadyPlayers.has(m.playerId))) {
      this.startBossCombat(session, Date.now());
    }
  }

  private startBossCombat(session: SessionState, now: number) {
    if (session.phase !== 'boss_preview') return;
    session.phase = 'active';
    session.phaseStartedAt = now;
    session.floorCombatStartedAt = now;
    session.enrageMultiplier = 1.0;
    session.lastEnrageAt = 0;

    this.broadcastSessionEvent(session, 'dungeon_session:phase_change', {
      phase: 'active',
      floor: session.currentFloor,
      monster: session.monster ? {
        id: session.monster.id,
        name: session.monster.name,
        hp: session.monster.hp,
        maxHp: session.monster.maxHp,
        attack: session.monster.attack,
        isBoss: session.monster.isBoss,
        skills: session.monster.skills.map(s => ({ type: s.type, chance: s.chance, value: s.value, cooldownMs: s.cooldownMs })),
        powerMultiplier: session.monster.powerMultiplier,
      } : null,
    });
  }

  async handlePlayerExtract(playerId: string): Promise<{ success: boolean; loot?: any; error?: string }> {
    const session = this.getPlayerSession(playerId);
    if (!session) return { success: false, error: 'No active session' };

    const member = session.members.get(playerId);
    if (!member) return { success: false, error: 'Not in session' };
    if (member.isExtracted) return { success: false, error: 'Already extracted' };

    if (session.phase === 'active' && member.isAlive) {
      return { success: false, error: 'Cannot extract during active combat. Wait for intermission or extract after death.' };
    }

    member.isExtracted = true;
    member.isAlive = false;
    member.status = 'extracted';

    const basePercent = 30;
    const checkpointBonus = session.securedLootCheckpoints * 10;
    const extractionPercent = Math.min(100, basePercent + checkpointBonus);

    const extractedGold = Math.floor(member.personalGold * extractionPercent / 100);
    const extractedXp = Math.floor(member.personalXp * extractionPercent / 100);

    const extractedLoot: Record<string, number> = {};
    for (const [itemId, qty] of Object.entries(member.personalLoot)) {
      const extractedQty = Math.floor(qty * extractionPercent / 100);
      if (extractedQty > 0) extractedLoot[itemId] = extractedQty;
    }

    this.broadcastSessionEvent(session, 'dungeon_session:member_extracted', {
      playerId,
      extractionPercent,
      gold: extractedGold,
      xp: extractedXp,
      loot: extractedLoot,
    });

    await this.applyPlayerRewards(playerId, extractedGold, extractedXp, extractedLoot);
    await db.update(dungeonMemberStates)
      .set({
        isExtracted: 1,
        hasExited: 1,
        exitedAtFloor: session.currentFloor,
        exitExtractionPercent: extractionPercent,
        personalGoldEarned: extractedGold,
        personalXpEarned: extractedXp,
      })
      .where(and(
        eq(dungeonMemberStates.sessionId, session.sessionId),
        eq(dungeonMemberStates.playerId, playerId),
      ));

    const remaining = this.getAliveMembers(session);
    if (remaining.length === 0) {
      this.endSession(session, 'all_extracted');
    }

    return { success: true, loot: { gold: extractedGold, xp: extractedXp, extractionPercent } };
  }

  handleFoodUse(playerId: string, healAmount: number) {
    const session = this.getPlayerSession(playerId);
    if (!session) return;

    const member = session.members.get(playerId);
    if (!member || !member.isAlive || member.isExtracted) return;

    if (session.phase === 'active' && session.monster) {
      session.monster.enraged = true;
      this.broadcastSessionEvent(session, 'dungeon_session:boss_enraged', {
        reason: 'food_during_combat',
        playerId,
      });
    }

    const actualHeal = Math.min(healAmount, member.maxHp - member.currentHp);
    member.currentHp += actualHeal;

    this.broadcastSessionEvent(session, 'dungeon_session:food_used', {
      playerId,
      healAmount: actualHeal,
      currentHp: member.currentHp,
      maxHp: member.maxHp,
    });
  }

  private async extractDisconnectedMembers(session: SessionState, now: number) {
    const toExtract = Array.from(session.members.entries())
      .filter(([_, member]) => member.isDisconnected && member.isAlive && !member.isExtracted)
      .map(([pid]) => pid);

    for (const pid of toExtract) {
      try {
        await this.handlePlayerExtract(pid);
      } catch (err) {
        console.error('[DSM] Auto-extract error:', err);
      }
      if (session.phase === 'ended') break;
    }
  }

  private async endSession(session: SessionState, reason: string) {
    if (session.phase === 'ended') return;
    session.phase = 'ended';
    session.monster = null;

    const members = Array.from(session.members.values());

    for (const m of members) {
      if (!m.isExtracted) {
        const extractionPercent = reason === 'completed' ? 100 :
          (reason === 'all_dead' ? Math.max(0, session.securedLootCheckpoints * 10) : 30);

        const goldReward = Math.floor(m.personalGold * extractionPercent / 100);
        const xpReward = Math.floor(m.personalXp * extractionPercent / 100);

        const lootReward: Record<string, number> = {};
        for (const [itemId, qty] of Object.entries(m.personalLoot)) {
          const extractedQty = Math.floor(qty * extractionPercent / 100);
          if (extractedQty > 0) lootReward[itemId] = extractedQty;
        }

        await this.applyPlayerRewards(m.playerId, goldReward, xpReward, lootReward);
        await db.update(dungeonMemberStates)
          .set({
            isAlive: m.isAlive ? 1 : 0,
            hasExited: 1,
            exitedAtFloor: session.currentFloor,
            exitExtractionPercent: extractionPercent,
            personalGoldEarned: goldReward,
            personalXpEarned: xpReward,
            totalDamageDealt: m.totalDamageDealt,
            totalHealingDone: m.totalHealingDone,
            durabilityLost: m.durabilityLost,
          })
          .where(and(
            eq(dungeonMemberStates.sessionId, session.sessionId),
            eq(dungeonMemberStates.playerId, m.playerId),
          ));
      }
    }

    const dbStatus = reason === 'completed' ? 'completed' :
      reason === 'all_dead' ? 'failed' :
      reason === 'all_extracted' ? 'extracted' : 'abandoned';

    await db.update(dungeonSessions)
      .set({
        status: dbStatus,
        endedAt: new Date(),
        floorsCleared: session.floorsCleared,
        currentFloor: session.currentFloor,
        goldPool: session.goldPool,
        xpPool: session.xpPool,
        riskLevel: session.riskLevel,
        currentMultiplier: session.multiplier,
      })
      .where(eq(dungeonSessions.id, session.sessionId));

    try {
      await db.transaction(async (tx) => {
        const [partyRow] = await tx.select()
          .from(parties)
          .where(eq(parties.id, session.partyId))
          .limit(1);

        if (partyRow && partyRow.partyType !== 'dungeon') {
          console.warn(`[DSM] endSession skipping party cleanup: party ${session.partyId} is type '${partyRow.partyType}', not 'dungeon'`);
          return;
        }

        await tx.delete(partyMembers).where(eq(partyMembers.partyId, session.partyId));
        if (partyRow) {
          await tx.delete(parties).where(eq(parties.id, session.partyId));
        }
      });
    } catch (err) {
      console.error('[DSM] Error cleaning up party after dungeon end:', err);
      try {
        await db.update(parties)
          .set({ status: 'disbanded', updatedAt: new Date() })
          .where(and(eq(parties.id, session.partyId), eq(parties.partyType, 'dungeon')));
      } catch {}
    }

    this.broadcastSessionEvent(session, 'dungeon_session:ended', {
      reason,
      floorsCleared: session.floorsCleared,
      members: members.map(m => ({
        playerId: m.playerId,
        username: m.username,
        totalDamageDealt: m.totalDamageDealt,
        totalHealingDone: m.totalHealingDone,
        personalGold: m.personalGold,
        personalXp: m.personalXp,
        isAlive: m.isAlive,
        isExtracted: m.isExtracted,
        status: m.status,
      })),
    });

    for (const [pid] of session.members) {
      this.playerSessionMap.delete(pid);
    }
    this.sessions.delete(session.sessionId);
  }

  private async applyPlayerRewards(playerId: string, gold: number, xp: number, loot: Record<string, number>) {
    try {
      if (gold > 0) {
        await db.update(players)
          .set({ gold: sql`gold + ${gold}` })
          .where(eq(players.id, playerId));
      }

      if (Object.keys(loot).length > 0) {
        for (const [itemId, quantity] of Object.entries(loot)) {
          if (quantity > 0) {
            await db.execute(sql`
              INSERT INTO player_items (player_id, item_id, quantity)
              VALUES (${playerId}, ${itemId}, ${quantity})
              ON CONFLICT (player_id, item_id)
              DO UPDATE SET quantity = player_items.quantity + ${quantity}
            `);
          }
        }
      }
    } catch (err) {
      console.error('[DSM] applyPlayerRewards error:', err);
    }
  }

  private async saveSessionToDb(session: SessionState) {
    await db.update(dungeonSessions)
      .set({
        currentFloor: session.currentFloor,
        floorsCleared: session.floorsCleared,
        riskLevel: session.riskLevel,
        currentMultiplier: session.multiplier,
        goldPool: session.goldPool,
        xpPool: session.xpPool,
        intermissionFloor: session.floorsCleared,
        lastFloorAt: new Date(),
      })
      .where(eq(dungeonSessions.id, session.sessionId));

    for (const [pid, m] of session.members) {
      await db.update(dungeonMemberStates)
        .set({
          currentHp: Math.max(0, m.currentHp),
          isAlive: m.isAlive ? 1 : 0,
          isExtracted: m.isExtracted ? 1 : 0,
          isDisconnected: m.isDisconnected ? 1 : 0,
          totalDamageDealt: m.totalDamageDealt,
          totalHealingDone: m.totalHealingDone,
          personalGoldEarned: m.personalGold,
          personalXpEarned: m.personalXp,
          currentThreat: m.currentThreat,
        })
        .where(and(
          eq(dungeonMemberStates.sessionId, session.sessionId),
          eq(dungeonMemberStates.playerId, pid),
        ));
    }
  }

  getFullSnapshot(session: SessionState): any {
    return {
      sessionId: session.sessionId,
      partyId: session.partyId,
      dungeonId: session.dungeonId,
      phase: session.phase,
      currentFloor: session.currentFloor,
      floorsCleared: session.floorsCleared,
      maxFloors: session.maxFloors,
      multiplier: session.multiplier,
      riskLevel: session.riskLevel,
      securedLootCheckpoints: session.securedLootCheckpoints,
      advancingUntil: session.advancingUntil,
      members: Array.from(session.members.values()).map(m => ({
        playerId: m.playerId,
        username: m.username,
        role: m.role,
        weaponType: m.weaponType,
        armorType: m.armorType,
        isAlive: m.isAlive,
        isExtracted: m.isExtracted,
        isDisconnected: m.isDisconnected,
        currentHp: Math.max(0, m.currentHp),
        maxHp: m.maxHp,
        dps: m.dps,
        defense: m.defense,
        attackSpeedMs: m.attackSpeedMs,
        attackAccumulator: m.attackAccumulator,
        currentThreat: m.currentThreat,
        totalDamageDealt: m.totalDamageDealt,
        totalHealingDone: m.totalHealingDone,
        personalGold: m.personalGold,
        personalXp: m.personalXp,
      })),
      monster: session.monster ? {
        id: session.monster.id,
        name: session.monster.name,
        hp: Math.max(0, session.monster.hp),
        maxHp: session.monster.maxHp,
        attack: session.monster.attack,
        attackSpeedMs: session.monster.attackSpeedMs,
        attackAccumulator: session.monster.attackAccumulator,
        isBoss: session.monster.isBoss,
        skills: session.monster.skills.map(s => ({ type: s.type })),
        enraged: session.monster.enraged,
      } : null,
    };
  }

  async cleanupStaleSessionsOnStartup() {
    try {
      const staleSessions = await db.select({ id: dungeonSessions.id, partyId: dungeonSessions.partyId })
        .from(dungeonSessions)
        .where(and(
          eq(dungeonSessions.mode, 'party'),
          eq(dungeonSessions.status, 'active'),
        ));

      for (const s of staleSessions) {
        await db.update(dungeonSessions)
          .set({ status: 'abandoned', endedAt: new Date() })
          .where(eq(dungeonSessions.id, s.id));

        if (s.partyId) {
          try {
            await db.delete(partyMembers).where(eq(partyMembers.partyId, s.partyId));
            await db.delete(parties).where(eq(parties.id, s.partyId));
          } catch {
            await db.update(parties)
              .set({ status: 'disbanded' })
              .where(eq(parties.id, s.partyId));
          }
        }
      }

      if (staleSessions.length > 0) {
        console.log(`[DungeonSessionManager] Cleaned up ${staleSessions.length} stale sessions`);
      }
    } catch (err) {
      console.error('[DungeonSessionManager] Cleanup error:', err);
    }
  }
}

export const dungeonSessionManager = new DungeonSessionManager();

