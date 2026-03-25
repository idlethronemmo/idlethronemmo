import { Express, Request, Response, NextFunction } from "express";
import { dungeonV2Service } from "./services/dungeonV2Service";
import { partyDungeonService } from "./services/partyDungeonService";
import { partyService } from "./services/partyService";
import { dungeonSessionManager } from "./services/dungeonSessionManager";
import { dungeonV2Config, parties, partyMembers, partyInvites, dungeonSessions, dungeonMemberStates, players, gameItems } from "@shared/schema";
import { getSubClass } from "@shared/subClasses";
import { db } from "../db";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { z } from "zod";

const dungeonV2ConfigSchema = z.object({
  dungeonId: z.string().min(1),
  requiredKeys: z.number().int().min(1).max(20),
  maxFloors: z.number().int().min(5).max(500),
  isEndless: z.number().int().min(0).max(1).default(0),
  baseMonsterHpScale: z.number().min(0.1).max(50).default(1),
  baseMonsterAttackScale: z.number().min(0.1).max(50).default(1),
  baseMonsterDefenceScale: z.number().min(0.1).max(50).default(1),
  hpScalePerFloor: z.number().min(1).max(2).default(1.05),
  attackScalePerFloor: z.number().min(1).max(2).default(1.03),
  defenceScalePerFloor: z.number().min(1).max(2).default(1.02),
  bossEveryNFloors: z.number().int().min(1).max(100).default(10),
  bossHpMultiplier: z.number().min(1).max(20).default(3),
  bossAttackMultiplier: z.number().min(1).max(10).default(2),
  bossDefenceMultiplier: z.number().min(1).max(10).default(1.5),
  lootGoldPerFloor: z.number().int().min(0).max(100000).default(50),
  lootXpPerFloor: z.number().int().min(0).max(100000).default(100),
  lootDropChanceBase: z.number().min(0).max(1).default(0.15),
  lootDropChancePerFloor: z.number().min(0).max(0.1).default(0.002),
  extractionBasePercent: z.number().int().min(0).max(100).default(100),
  extractionDecayPerFloor: z.number().min(0).max(5).default(0.5),
  extractionMinPercent: z.number().int().min(0).max(100).default(10),
  chaosGainPerFloor: z.number().min(0).max(20).default(1),
  chaosMaxMultiplier: z.number().min(1).max(5).default(2),
  curseEveryNFloors: z.number().int().min(0).max(100).default(15),
  maxCurses: z.number().int().min(0).max(20).default(5),
  hiddenBossChance: z.number().min(0).max(1).default(0.02),
  durabilityMultiplier: z.number().min(0).max(10).default(1),
  deathItemDestroyChance: z.number().min(0).max(1).default(0.1),
  voteIntervalFloors: z.number().int().min(0).max(100).default(5),
  voteTimeoutSeconds: z.number().int().min(10).max(600).default(60),
  partyMaxMembers: z.number().int().min(2).max(5).default(5),
  offlineDurationMinutes: z.number().int().min(1).max(1440).default(480),
}).partial().required({ dungeonId: true });

interface AuthenticatedPlayerRequest extends Request {
  player?: any;
  authMethod?: "firebase" | "session";
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

interface LobbyChatMessage {
  id: string;
  playerId: string;
  username: string;
  content: string;
  timestamp: number;
}

const lobbyChatStore = new Map<string, LobbyChatMessage[]>();
const LOBBY_CHAT_MAX = 50;
const LOBBY_CHAT_TTL = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [partyId, msgs] of lobbyChatStore) {
    if (msgs.length === 0 || now - msgs[msgs.length - 1].timestamp > LOBBY_CHAT_TTL) {
      lobbyChatStore.delete(partyId);
    }
  }
}, 5 * 60 * 1000);

function addLobbyChatMessage(partyId: string, playerId: string, username: string, content: string): LobbyChatMessage {
  if (!lobbyChatStore.has(partyId)) {
    lobbyChatStore.set(partyId, []);
  }
  const messages = lobbyChatStore.get(partyId)!;
  const msg: LobbyChatMessage = {
    id: `${partyId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    playerId,
    username,
    content: content.slice(0, 200),
    timestamp: Date.now(),
  };
  messages.push(msg);
  if (messages.length > LOBBY_CHAT_MAX) {
    messages.splice(0, messages.length - LOBBY_CHAT_MAX);
  }
  return msg;
}

function getLobbyChatMessages(partyId: string): LobbyChatMessage[] {
  return lobbyChatStore.get(partyId) || [];
}

function rateLimit(playerId: string, action: string, maxPerMinute: number): boolean {
  const key = `${playerId}:${action}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count++;
  return true;
}

export function registerDungeonV2Routes(app: Express, authenticatePlayer: any, adminAuth: any) {

  app.get('/api/v2/dungeons', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const player = req.player;
      const language = (req.query.lang as string) || player.language || 'en';
      const result = await dungeonV2Service.listDungeons(player.id, language);
      res.json({ dungeons: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list dungeons' });
    }
  });

  app.get('/api/v2/dungeons/:id/config', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const config = await dungeonV2Service.getDungeonConfig(req.params.id);
      res.json({ config });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/dungeons/solo/start', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const player = req.player;
      if (!rateLimit(player.id, 'solo_start', 5)) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      const { dungeonId, goOffline } = req.body;
      if (!dungeonId) return res.status(400).json({ error: 'dungeonId required' });

      const result = await dungeonV2Service.startSoloDungeon(player.id, dungeonId, !!goOffline);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/dungeons/solo/claim', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const player = req.player;
      if (!rateLimit(player.id, 'solo_claim', 3)) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

      const result = await dungeonV2Service.claimOfflineSoloDungeon(player.id, sessionId);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/dungeons/solo/floor', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const player = req.player;
      if (!rateLimit(player.id, 'solo_floor', 30)) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      const { sessionId, autoEat, autoPotion, foodId, potionId, hpThresholdPercent } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

      const autoConsumeOptions = (autoEat || autoPotion) ? {
        autoEat: !!autoEat,
        autoPotion: !!autoPotion,
        foodId: foodId || undefined,
        potionId: potionId || undefined,
        hpThresholdPercent: typeof hpThresholdPercent === 'number' ? hpThresholdPercent : undefined,
      } : undefined;

      const result = await dungeonV2Service.processFloor(player.id, sessionId, autoConsumeOptions);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/dungeons/sessions/:sessionId/consume', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const player = req.player;
      if (!rateLimit(player.id, 'dungeon_consume', 20)) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      const { sessionId } = req.params;
      const { type, itemId } = req.body;
      if (!type || !itemId) return res.status(400).json({ error: 'type and itemId required' });
      if (type !== 'food' && type !== 'potion') return res.status(400).json({ error: 'type must be food or potion' });

      const result = await dungeonV2Service.consumeItem(player.id, sessionId, type, itemId);
      if (!result.success) {
        const status = result.cooldownRemaining ? 429 : 400;
        return res.status(status).json({ error: result.error, cooldownRemaining: result.cooldownRemaining });
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/dungeons/solo/extract', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const player = req.player;
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

      const result = await dungeonV2Service.extractFromDungeon(player.id, sessionId);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/dungeons/solo/active', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const result = await dungeonV2Service.getActiveSession(req.player.id);
      if (!result) {
        res.json({ session: null, recentResult: null });
      } else {
        res.json(result);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/dungeons/solo/dismiss', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
      await dungeonV2Service.dismissSession(req.player.id, sessionId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/dungeons/party/start', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const player = req.player;
      if (!rateLimit(player.id, 'party_start', 3)) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      const { dungeonId, partyId } = req.body;
      if (!dungeonId || !partyId) return res.status(400).json({ error: 'dungeonId and partyId required' });

      const result = await partyDungeonService.startPartyDungeon(player.id, dungeonId, partyId);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/dungeons/party/floor', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const player = req.player;
      if (!rateLimit(player.id, 'party_floor', 30)) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      const { sessionId, autoEat, autoPotion, foodId, potionId, hpThresholdPercent } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

      const autoConsumeOpts = (autoEat || autoPotion) ? {
        autoEat: !!autoEat,
        autoPotion: !!autoPotion,
        foodId: foodId || undefined,
        potionId: potionId || undefined,
        hpThresholdPercent: typeof hpThresholdPercent === 'number' ? hpThresholdPercent : undefined,
      } : undefined;

      const result = await partyDungeonService.processPartyFloor(player.id, sessionId, autoConsumeOpts);
      if (!result.success) return res.status(400).json({ error: result.error });

      if (autoConsumeOpts && result.result && !result.result.allDead) {
        const autoConsumeResult = await dungeonV2Service.autoConsumeAfterFloor(player.id, sessionId, autoConsumeOpts);
        result.result.autoConsume = autoConsumeResult;
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/dungeons/party/vote', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const player = req.player;
      const { sessionId, vote } = req.body;
      if (!sessionId || !vote) return res.status(400).json({ error: 'sessionId and vote required' });
      if (vote !== 'continue' && vote !== 'exit') return res.status(400).json({ error: 'vote must be continue or exit' });

      if (!rateLimit(player.id, `vote_${sessionId}`, 1)) {
        return res.status(429).json({ error: 'Already voted' });
      }

      const result = await partyDungeonService.submitVote(player.id, sessionId, vote);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/dungeons/party/exit', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const player = req.player;
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

      const result = await partyDungeonService.memberExit(player.id, sessionId);
      if (!result.success) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/dungeons/leave', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const player = req.player;

      const activeSessions = await db.select()
        .from(dungeonSessions)
        .where(
          sql`${dungeonSessions.status} IN ('active', 'voting')`,
        );

      let playerSession = activeSessions.find(s => String(s.playerId) === String(player.id));

      if (!playerSession) {
        const memberStates = await db.select()
          .from(dungeonMemberStates)
          .where(eq(dungeonMemberStates.playerId, player.id));

        for (const ms of memberStates) {
          const matchSession = activeSessions.find(s => s.id === ms.sessionId);
          if (matchSession) {
            playerSession = matchSession;
            break;
          }
        }
      }

      if (!playerSession) {
        return res.json({ success: true, noActive: true });
      }

      if (playerSession.mode === 'solo') {
        const result = await dungeonV2Service.extractFromDungeon(player.id, playerSession.id);
        return res.json({ ...result, mode: 'solo' });
      } else {
        const result = await partyDungeonService.memberExit(player.id, playerSession.id);
        return res.json({ ...result, mode: 'party' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to leave dungeon' });
    }
  });

  app.post('/api/v2/dungeons/party/chat', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const player = req.player;
      if (!rateLimit(player.id, 'dungeon_chat', 20)) {
        return res.status(429).json({ error: 'Too many messages' });
      }
      const { sessionId, content } = req.body;
      if (!sessionId || !content) return res.status(400).json({ error: 'sessionId and content required' });

      const result = await partyDungeonService.sendChatMessage(player.id, sessionId, content);
      if (!result.success) return res.status(400).json({ error: result.error });

      const [chatSession] = await db.select({ partyId: dungeonSessions.partyId })
        .from(dungeonSessions).where(eq(dungeonSessions.id, sessionId)).limit(1);
      if (chatSession?.partyId) {
        const { broadcastToParty, createPartyEvent } = await import('./partyWs');
        broadcastToParty(chatSession.partyId, createPartyEvent('dungeon_chat_message', chatSession.partyId, 0, {
          sessionId, playerId: player.id, playerName: player.username, content,
        }));
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/dungeons/party/chat/:sessionId', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const messages = await partyDungeonService.getChatMessages(req.player.id, req.params.sessionId);
      res.json({ messages });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/dungeons/party/state/:sessionId', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const state = await partyDungeonService.getSessionState(req.player.id, req.params.sessionId);
      res.json({ state });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/dungeons/party/check-vote-timeout', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

      const result = await partyDungeonService.checkVoteTimeout(sessionId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/party/snapshot', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res: Response) => {
    try {
      const player = req.player;
      const sinceVersion = req.query.sinceVersion ? parseInt(req.query.sinceVersion as string) : undefined;

      const [membership] = await db.select()
        .from(partyMembers)
        .where(eq(partyMembers.playerId, player.id))
        .limit(1);

      if (!membership) {
        const pendingInvites = await db.select()
          .from(partyInvites)
          .where(and(
            eq(partyInvites.inviteeId, player.id),
            eq(partyInvites.status, 'pending'),
          ));

        return res.json({
          success: true,
          version: 0,
          party: null,
          members: [],
          invites: pendingInvites || [],
          dungeonSession: null,
          uiFlags: { canReady: false, canStart: false, canLeave: false, reason: 'not_in_party' },
        });
      }

      const [party] = await db.select()
        .from(parties)
        .where(eq(parties.id, membership.partyId))
        .limit(1);

      if (!party || party.status === 'disbanded') {
        await db.delete(partyMembers).where(and(
          eq(partyMembers.playerId, player.id),
          eq(partyMembers.partyId, membership.partyId)
        )).catch(() => {});
        return res.json({
          success: true,
          version: 0,
          party: null,
          members: [],
          invites: [],
          dungeonSession: null,
          uiFlags: { canReady: false, canStart: false, canLeave: false, reason: 'party_not_found' },
        });
      }

      if (sinceVersion !== undefined && sinceVersion >= party.partyVersion) {
        return res.json({ success: true, unchanged: true, version: party.partyVersion });
      }

      const members = await db.select({
        id: partyMembers.id,
        playerId: partyMembers.playerId,
        role: partyMembers.role,
        isReady: partyMembers.isReady,
        position: partyMembers.position,
        cachedWeaponType: partyMembers.cachedWeaponType,
        joinedAt: partyMembers.joinedAt,
        username: players.username,
        avatar: players.avatar,
        isOnline: players.isOnline,
      })
        .from(partyMembers)
        .innerJoin(players, eq(partyMembers.playerId, players.id))
        .where(eq(partyMembers.partyId, party.id));

      const invites = await db.select()
        .from(partyInvites)
        .where(and(
          eq(partyInvites.partyId, party.id),
          eq(partyInvites.status, 'pending'),
        ));

      let dungeonSession = null;
      if (party.status === 'in_dungeon' && party.dungeonRunId) {
        const [ds] = await db.select()
          .from(dungeonSessions)
          .where(eq(dungeonSessions.id, party.dungeonRunId))
          .limit(1);
        if (ds && (ds.status === 'active' || ds.status === 'voting')) {
          dungeonSession = {
            id: ds.id,
            dungeonId: ds.dungeonId,
            status: ds.status,
            currentFloor: ds.currentFloor,
            floorsCleared: ds.floorsCleared,
          };
        }
      }

      const isLeader = String(party.leaderId) === String(player.id);
      const allReady = members.length >= 2 && members.every(m => m.isReady === 1);
      const isLocked = party.status === 'locked';
      const isInDungeon = party.status === 'in_dungeon';

      const uiFlags = {
        canReady: !isLocked && !isInDungeon,
        canStart: isLeader && allReady && !isLocked && !isInDungeon && members.length >= 2,
        canLeave: !isLocked,
        canInvite: isLeader && !isLocked && !isInDungeon && members.length < (party.maxSize || 5),
        reason: isLocked ? 'party_locked' : isInDungeon ? 'in_dungeon' : undefined,
      };

      return res.json({
        success: true,
        version: party.partyVersion,
        party: {
          id: party.id,
          leaderId: party.leaderId,
          name: party.name,
          status: party.status,
          maxSize: party.maxSize,
          isPublic: party.isPublic,
          dungeonId: party.dungeonId,
          dungeonRunId: party.dungeonRunId,
        },
        members: members || [],
        invites: invites || [],
        dungeonSession,
        uiFlags,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to get party snapshot' });
    }
  });

  // ========== ADMIN ROUTES ==========

  app.get('/api/admin/dungeon-v2-configs', adminAuth, async (req: Request, res: Response) => {
    try {
      const configs = await db.select().from(dungeonV2Config);
      res.json(configs);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list dungeon v2 configs' });
    }
  });

  app.post('/api/admin/dungeon-v2-configs', adminAuth, async (req: Request, res: Response) => {
    try {
      const parsed = dungeonV2ConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid config', details: parsed.error.flatten() });
      }
      const [newConfig] = await db.insert(dungeonV2Config).values(parsed.data as any).returning();
      res.json(newConfig);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create dungeon v2 config' });
    }
  });

  app.put('/api/admin/dungeon-v2-configs/:id', adminAuth, async (req: Request, res: Response) => {
    try {
      const parsed = dungeonV2ConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid config', details: parsed.error.flatten() });
      }
      const [updated] = await db.update(dungeonV2Config).set(parsed.data as any).where(eq(dungeonV2Config.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: 'Config not found' });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update dungeon v2 config' });
    }
  });

  app.delete('/api/admin/dungeon-v2-configs/:id', adminAuth, async (req: Request, res: Response) => {
    try {
      await db.delete(dungeonV2Config).where(eq(dungeonV2Config.id, req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to delete dungeon v2 config' });
    }
  });

  app.post('/api/admin/dungeon-sessions/cleanup', adminAuth, async (req: Request, res: Response) => {
    try {
      const hoursThreshold = parseInt(req.body.hoursThreshold as string) || 24;
      const cutoff = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);

      const result = await db.update(dungeonSessions)
        .set({ status: 'failed', endedAt: new Date() } as any)
        .where(and(
          sql`${dungeonSessions.status} IN ('active', 'voting')`,
          sql`${dungeonSessions.startedAt} < ${cutoff}`,
        ))
        .returning({ id: dungeonSessions.id });

      const partyResult = await db.update(parties)
        .set({ status: 'forming', updatedAt: new Date() } as any)
        .where(and(
          sql`${parties.status} IN ('locked', 'in_dungeon')`,
          sql`${parties.updatedAt} < ${cutoff}`,
        ))
        .returning({ id: parties.id });

      res.json({
        success: true,
        closedSessions: result.length,
        sessionIds: result.map(r => r.id),
        resetParties: partyResult.length,
        partyIds: partyResult.map(r => r.id),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to cleanup sessions' });
    }
  });

  app.get('/api/admin/dungeon-sessions/active', adminAuth, async (req: Request, res: Response) => {
    try {
      const activeSessions = await db.select({
        id: dungeonSessions.id,
        dungeonId: dungeonSessions.dungeonId,
        mode: dungeonSessions.mode,
        status: dungeonSessions.status,
        playerId: dungeonSessions.playerId,
        partyId: dungeonSessions.partyId,
        currentFloor: dungeonSessions.currentFloor,
        floorsCleared: dungeonSessions.floorsCleared,
        startedAt: dungeonSessions.startedAt,
        lastFloorAt: dungeonSessions.lastFloorAt,
        playerUsername: players.username,
      })
        .from(dungeonSessions)
        .leftJoin(players, eq(dungeonSessions.playerId, players.id))
        .where(sql`${dungeonSessions.status} IN ('active', 'voting')`)
        .orderBy(sql`${dungeonSessions.startedAt} ASC`);

      res.json({ sessions: activeSessions });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch active sessions' });
    }
  });

  app.post('/api/admin/dungeon-sessions/force-close/:sessionId', adminAuth, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      const [session] = await db.select()
        .from(dungeonSessions)
        .where(eq(dungeonSessions.id, sessionId))
        .limit(1);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      await db.update(dungeonSessions)
        .set({ status: 'failed', endedAt: new Date() } as any)
        .where(eq(dungeonSessions.id, sessionId));

      let partyReset = false;
      if (session.partyId) {
        await db.update(parties)
          .set({ status: 'forming', updatedAt: new Date() } as any)
          .where(eq(parties.id, session.partyId));
        partyReset = true;
      }

      res.json({ success: true, sessionId, partyReset });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to force-close session' });
    }
  });

  app.post('/api/admin/dungeon-sessions/force-close-player', adminAuth, async (req: Request, res: Response) => {
    try {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: 'Username is required' });
      }

      const [player] = await db.select({ id: players.id, username: players.username })
        .from(players)
        .where(sql`LOWER(${players.username}) = LOWER(${username})`)
        .limit(1);

      if (!player) {
        return res.status(404).json({ error: `Player "${username}" not found` });
      }

      const closedSessions = await db.update(dungeonSessions)
        .set({ status: 'failed', endedAt: new Date() } as any)
        .where(and(
          eq(dungeonSessions.playerId, player.id),
          sql`${dungeonSessions.status} IN ('active', 'voting')`,
        ))
        .returning({ id: dungeonSessions.id, partyId: dungeonSessions.partyId });

      const partyIds = closedSessions
        .map(s => s.partyId)
        .filter((id): id is string => id !== null);

      let resetParties = 0;
      if (partyIds.length > 0) {
        const partyResult = await db.update(parties)
          .set({ status: 'forming', updatedAt: new Date() } as any)
          .where(inArray(parties.id, partyIds))
          .returning({ id: parties.id });
        resetParties = partyResult.length;
      }

      res.json({
        success: true,
        playerUsername: player.username,
        closedSessions: closedSessions.length,
        sessionIds: closedSessions.map(s => s.id),
        resetParties,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to force-close player sessions' });
    }
  });

  app.get('/api/v2/dungeon-party/my', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });

      const playerParty = await partyService.getPlayerParty(player.id, 'dungeon');
      if (!playerParty) {
        return res.json({ party: null, members: [], invites: [] });
      }

      const fullParty = await partyService.getParty(playerParty.id);
      if (!fullParty) {
        return res.json({ party: null, members: [], invites: [] });
      }

      const sentInvites = await db.select({
        invite: partyInvites,
        invitee: {
          id: players.id,
          username: players.username,
          avatar: players.avatar,
        },
      })
        .from(partyInvites)
        .innerJoin(players, eq(partyInvites.inviteeId, players.id))
        .where(and(
          eq(partyInvites.partyId, fullParty.id),
          eq(partyInvites.status, 'pending'),
        ));

      const memberIds = (fullParty.members || []).map(m => m.playerId);
      const playerEquipRows = memberIds.length > 0
        ? await db.select({ id: players.id, equipment: players.equipment }).from(players).where(inArray(players.id, memberIds))
        : [];
      const equipMap = new Map<string, any>();
      for (const row of playerEquipRows) {
        equipMap.set(row.id, row.equipment as any);
      }

      const allItemIds = new Set<string>();
      for (const equip of equipMap.values()) {
        if (equip?.weapon) allItemIds.add(equip.weapon);
        if (equip?.body) allItemIds.add(equip.body);
      }
      const itemRows = allItemIds.size > 0
        ? await db.select({ id: gameItems.id, weaponType: gameItems.weaponType, armorType: gameItems.armorType })
            .from(gameItems).where(inArray(gameItems.id, [...allItemIds]))
        : [];
      const itemInfoMap = new Map<string, { weaponType: string | null; armorType: string | null }>();
      for (const item of itemRows) {
        itemInfoMap.set(item.id, { weaponType: item.weaponType, armorType: item.armorType });
      }

      const membersWithSubClass = (fullParty.members || []).map(m => {
        const equip = equipMap.get(m.playerId) as any;
        const weaponItem = equip?.weapon ? itemInfoMap.get(equip.weapon) : null;
        const bodyItem = equip?.body ? itemInfoMap.get(equip.body) : null;
        const weaponType = weaponItem?.weaponType || null;
        const armorType = bodyItem?.armorType || null;
        const subClass = getSubClass(weaponType, armorType);
        return {
          playerId: m.playerId,
          username: m.player?.username || 'Unknown',
          avatar: m.player?.avatar || null,
          role: subClass.baseRole,
          subClassName: subClass.name,
          subClassColor: subClass.color,
          isReady: m.isReady,
          totalLevel: m.player?.totalLevel || 0,
          weaponType,
          armorType,
        };
      });

      res.json({
        party: {
          id: fullParty.id,
          leaderId: fullParty.leaderId,
          status: fullParty.status,
          partyType: fullParty.partyType,
          dungeonId: fullParty.dungeonId,
          maxSize: fullParty.maxSize,
        },
        members: membersWithSubClass,
        invites: sentInvites.map(si => ({
          id: si.invite.id,
          inviteeId: si.invite.inviteeId,
          inviteeName: si.invitee.username,
          inviteeAvatar: si.invitee.avatar,
          status: si.invite.status,
          expiresAt: si.invite.expiresAt,
        })),
      });
    } catch (error) {
      console.error('Error fetching dungeon party:', error);
      res.status(500).json({ error: 'Failed to fetch dungeon party' });
    }
  });

  app.get('/api/v2/dungeon-party/invites', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });

      const pendingInvites = await db.select({
        invite: partyInvites,
        inviter: {
          id: players.id,
          username: players.username,
          avatar: players.avatar,
        },
      })
        .from(partyInvites)
        .innerJoin(players, eq(partyInvites.inviterId, players.id))
        .where(and(
          eq(partyInvites.inviteeId, player.id),
          eq(partyInvites.status, 'pending'),
        ));

      const invitesWithPartyType = [];
      for (const pi of pendingInvites) {
        const [party] = await db.select({ partyType: parties.partyType, dungeonId: parties.dungeonId })
          .from(parties)
          .where(eq(parties.id, pi.invite.partyId));
        invitesWithPartyType.push({
          id: pi.invite.id,
          partyId: pi.invite.partyId,
          partyType: party?.partyType || 'social',
          dungeonId: party?.dungeonId || null,
          inviter: pi.inviter,
          expiresAt: pi.invite.expiresAt,
          createdAt: pi.invite.createdAt,
        });
      }

      res.json({ invites: invitesWithPartyType });
    } catch (error) {
      console.error('Error fetching dungeon party invites:', error);
      res.status(500).json({ error: 'Failed to fetch invites' });
    }
  });

  app.get('/api/v2/dungeon-party/session/active', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });

      const session = dungeonSessionManager.getPlayerSession(player.id);
      if (!session) {
        return res.json({ active: false });
      }

      return res.json({
        active: true,
        snapshot: dungeonSessionManager.getFullSnapshot(session),
      });
    } catch (error) {
      console.error('Error fetching active session:', error);
      res.status(500).json({ error: 'Failed to fetch active session' });
    }
  });

  app.post('/api/v2/dungeon-party/session/rejoin', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });

      const result = await dungeonSessionManager.handlePlayerReconnect(player.id);
      if (!result) {
        return res.json({ success: false, error: 'No active session to rejoin' });
      }

      return res.json({
        success: true,
        snapshot: dungeonSessionManager.getFullSnapshot(result.session),
        recentEvents: result.events,
      });
    } catch (error) {
      console.error('Error rejoining session:', error);
      res.status(500).json({ error: 'Failed to rejoin session' });
    }
  });

  app.post('/api/v2/dungeon-party/session/extract', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });

      const result = await dungeonSessionManager.handlePlayerExtract(player.id);
      return res.json(result);
    } catch (error) {
      console.error('Error extracting from session:', error);
      res.status(500).json({ error: 'Failed to extract' });
    }
  });

  app.post('/api/v2/dungeon-party/create', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });
      if (!rateLimit(player.id, 'dp_create', 5)) return res.status(429).json({ error: 'Too many requests' });

      const { dungeonId } = req.body || {};
      console.log(`[PartyTrack] REST_CREATE_PARTY player=${player.id} username=${player.username} partyType=dungeon dungeonId=${dungeonId} result=pending`);
      const result = await partyService.createParty(player.id, null, null, 'dungeon');
      if (!result.success) {
        console.log(`[PartyTrack] REST_CREATE_PARTY player=${player.id} username=${player.username} partyType=dungeon result=error reason=${result.error}`);
        return res.status(400).json({ error: result.error || 'Failed to create party' });
      }

      const party = result.party!;
      if (dungeonId) {
        await db.update(parties).set({ dungeonId } as any).where(eq(parties.id, party.id));
      }

      const fullParty = await partyService.getParty(party.id);
      const partyData = fullParty ? {
        id: fullParty.id,
        leaderId: fullParty.leaderId,
        status: fullParty.status,
        partyType: fullParty.partyType,
        dungeonId: dungeonId || fullParty.dungeonId,
        maxSize: fullParty.maxSize || 5,
        members: await Promise.all((fullParty.members || []).map(async (m: any) => {
          const [pRow] = await db.select({ equipment: players.equipment }).from(players).where(eq(players.id, m.playerId));
          const equip = pRow?.equipment as any;
          const weaponItemId = equip?.weapon;
          const bodyItemId = equip?.body;
          let weaponType: string | null = null;
          let armorType: string | null = null;
          if (weaponItemId) {
            const baseId = String(weaponItemId).split('::')[0];
            const [wi] = await db.select({ weaponType: gameItems.weaponType }).from(gameItems).where(eq(gameItems.id, baseId));
            weaponType = wi?.weaponType || null;
          }
          if (bodyItemId) {
            const baseId = String(bodyItemId).split('::')[0];
            const [bi] = await db.select({ armorType: gameItems.armorType }).from(gameItems).where(eq(gameItems.id, baseId));
            armorType = bi?.armorType || null;
          }
          const subClass = getSubClass(weaponType, armorType);
          return {
            playerId: m.playerId,
            username: m.player?.username || 'Unknown',
            avatar: m.player?.avatar || null,
            role: subClass.baseRole,
            subClassName: subClass.name,
            subClassColor: subClass.color,
            isReady: m.isReady,
            totalLevel: m.player?.totalLevel || 0,
            weaponType,
            armorType,
          };
        })),
        invites: [],
      } : null;

      console.log(`[PartyTrack] REST_CREATE_PARTY player=${player.id} username=${player.username} party=${party.id} partyType=dungeon result=ok`);
      res.json({ success: true, party: partyData });
    } catch (error: any) {
      console.error('Error creating dungeon party:', error);
      res.status(500).json({ error: error.message || 'Failed to create party' });
    }
  });

  app.post('/api/v2/dungeon-party/invite', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });
      const { partyId, inviteeId } = req.body || {};
      if (!partyId || !inviteeId) return res.status(400).json({ error: 'partyId and inviteeId required' });

      const partyCheck = await partyService.getParty(partyId);
      if (!partyCheck) return res.status(404).json({ error: 'Party not found' });
      if (partyCheck.status !== 'forming') return res.status(400).json({ error: 'Party is not accepting members' });

      const result = await partyService.invitePlayer(partyId, player.id, inviteeId);
      if (!result.success) return res.status(400).json({ error: result.error || 'Failed to invite' });

      const [inviteePlayer] = await db.select({ id: players.id, username: players.username, avatar: players.avatar })
        .from(players).where(eq(players.id, inviteeId));
      const [inviterPlayer] = await db.select({ id: players.id, username: players.username, avatar: players.avatar })
        .from(players).where(eq(players.id, player.id));

      const { broadcastToParty, sendToPlayer, createPartyEvent } = await import('./partyWs');
      broadcastToParty(partyId, createPartyEvent('party_invite_created', partyId, 0, {
        invite: result.invite,
        invitee: inviteePlayer || { id: inviteeId, username: 'Unknown', avatar: null },
      }));
      sendToPlayer(inviteeId, createPartyEvent('party_invite_received', partyId, 0, {
        invite: result.invite,
        partyId,
        partyType: 'dungeon',
        inviter: inviterPlayer || { id: player.id, username: 'Unknown', avatar: null },
        dungeonId: partyCheck.dungeonId,
      }));

      res.json({ success: true, invite: result.invite });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to invite' });
    }
  });

  app.post('/api/v2/dungeon-party/invite/accept', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });
      const { inviteId, forceLeave } = req.body || {};
      if (!inviteId) return res.status(400).json({ error: 'inviteId required' });

      console.log(`[PartyTrack] REST_ACCEPT_INVITE player=${player.id} username=${player.username} inviteId=${inviteId} partyType=dungeon result=pending`);
      const result = await partyService.acceptInvite(inviteId, player.id, forceLeave);
      if (!result.success) {
        console.log(`[PartyTrack] REST_ACCEPT_INVITE player=${player.id} username=${player.username} inviteId=${inviteId} partyType=dungeon result=error reason=${result.error}`);
        return res.status(400).json({ success: false, error: result.error, errorCode: result.errorCode, currentPartyType: result.currentPartyType });
      }

      const party = result.party;
      if (!party) return res.status(400).json({ error: 'Party not found after accept' });

      const fullParty = await partyService.getParty(party.id);
      const [acceptedPlayer] = await db.select({ id: players.id, username: players.username, avatar: players.avatar, totalLevel: players.totalLevel })
        .from(players).where(eq(players.id, player.id));

      const { broadcastToParty, createPartyEvent } = await import('./partyWs');
      broadcastToParty(party.id, createPartyEvent('party_member_joined', party.id, 0, {
        playerId: player.id,
        player: acceptedPlayer || { id: player.id, username: 'Unknown', avatar: null, totalLevel: 0 },
      }));

      const memberCount = fullParty?.members?.length || 0;
      if (memberCount >= (fullParty?.maxSize || 5)) {
        const pendingInvites = await db.select().from(partyInvites)
          .where(and(eq(partyInvites.partyId, party.id), eq(partyInvites.status, 'pending')));
        const { sendToPlayer } = await import('./partyWs');
        for (const inv of pendingInvites) {
          await db.update(partyInvites).set({ status: 'cancelled', updatedAt: new Date() } as any).where(eq(partyInvites.id, inv.id));
          sendToPlayer(inv.inviteeId, createPartyEvent('party_invite_cancelled', party.id, 0, { inviteId: inv.id, reason: 'party_full' }));
        }
      }

      console.log(`[PartyTrack] REST_ACCEPT_INVITE player=${player.id} username=${player.username} party=${party.id} partyType=dungeon result=ok`);
      res.json({ success: true, partyId: party.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to accept invite' });
    }
  });

  app.post('/api/v2/dungeon-party/invite/decline', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });
      const { inviteId } = req.body || {};
      if (!inviteId) return res.status(400).json({ error: 'inviteId required' });

      const result = await partyService.declineInvite(inviteId, player.id);
      if (!result.success) return res.json({ success: true });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to decline invite' });
    }
  });

  app.post('/api/v2/dungeon-party/invite/cancel', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });
      const { inviteId } = req.body || {};
      if (!inviteId) return res.status(400).json({ error: 'inviteId required' });

      const [invite] = await db.select().from(partyInvites).where(eq(partyInvites.id, inviteId));
      if (!invite || invite.status !== 'pending') return res.status(400).json({ error: 'Invite not found or not pending' });

      const party = await partyService.getParty(invite.partyId);
      if (!party || (party.leaderId !== player.id && invite.inviterId !== player.id)) {
        return res.status(403).json({ error: 'Not authorized to cancel', errorCode: 'NOT_AUTHORIZED' });
      }

      await db.update(partyInvites).set({ status: 'cancelled', updatedAt: new Date() } as any).where(eq(partyInvites.id, inviteId));

      const { broadcastToParty, sendToPlayer, createPartyEvent } = await import('./partyWs');
      sendToPlayer(invite.inviteeId, createPartyEvent('party_invite_cancelled', invite.partyId, 0, { inviteId, reason: 'cancelled' }));
      broadcastToParty(invite.partyId, createPartyEvent('party_invite_cancelled', invite.partyId, 0, { inviteId }));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to cancel invite' });
    }
  });

  app.post('/api/v2/dungeon-party/ready', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });
      const { partyId, isReady } = req.body || {};
      if (!partyId || isReady === undefined) return res.status(400).json({ error: 'partyId and isReady required' });

      const [membership] = await db.select().from(partyMembers)
        .where(and(eq(partyMembers.partyId, partyId), eq(partyMembers.playerId, player.id)));
      if (!membership) return res.status(400).json({ error: 'Not a member of this party' });

      const readyVal = isReady ? 1 : 0;
      await db.update(partyMembers).set({ isReady: readyVal } as any).where(eq(partyMembers.id, membership.id));

      const { broadcastToParty, createPartyEvent } = await import('./partyWs');
      broadcastToParty(partyId, createPartyEvent('party_ready_updated', partyId, 0, { playerId: player.id, isReady: readyVal }));

      res.json({ success: true, isReady: readyVal });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to set ready' });
    }
  });

  app.post('/api/v2/dungeon-party/start', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });
      const { partyId, dungeonId } = req.body || {};
      if (!partyId || !dungeonId) return res.status(400).json({ error: 'partyId and dungeonId required' });

      const party = await partyService.getParty(partyId);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      if (party.leaderId !== player.id) return res.status(403).json({ error: 'Only the leader can start', errorCode: 'NOT_LEADER' });

      const members = party.members || [];
      if (members.length < 2) return res.status(400).json({ error: 'Need at least 2 members' });
      const notReady = members.filter((m: any) => m.isReady !== 1);
      if (notReady.length > 0) return res.status(400).json({ error: 'All members must be ready' });

      const { broadcastToParty, createPartyEvent } = await import('./partyWs');

      for (let i = 3; i >= 1; i--) {
        broadcastToParty(partyId, createPartyEvent('party_updated', partyId, 0, { action: 'start_countdown', countdown: i }));
        await new Promise(r => setTimeout(r, 1000));
      }

      const freshParty = await partyService.getParty(partyId);
      if (!freshParty) return res.status(400).json({ error: 'Party disbanded during countdown' });
      const freshMembers = freshParty.members || [];
      if (freshMembers.length < 2) {
        broadcastToParty(partyId, createPartyEvent('party_updated', partyId, 0, { action: 'start_failed', error: 'Not enough members after countdown' }));
        return res.status(400).json({ error: 'Not enough members' });
      }

      const memberIds = freshMembers.map((m: any) => m.playerId);
      const result = await dungeonSessionManager.createSessionFromParty(partyId, dungeonId, memberIds);
      if (!result.success) {
        broadcastToParty(partyId, createPartyEvent('party_updated', partyId, 0, { action: 'start_failed', error: result.error }));
        return res.status(400).json({ error: result.error || 'Failed to start dungeon' });
      }

      broadcastToParty(partyId, createPartyEvent('party_started', partyId, 0, { sessionId: result.sessionId, dungeonId }));

      res.json({ success: true, sessionId: result.sessionId, dungeonId });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to start dungeon' });
    }
  });

  app.post('/api/v2/dungeon-party/leave', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });
      const { partyId } = req.body || {};

      console.log(`[PartyTrack] REST_LEAVE_PARTY player=${player.id} username=${player.username} party=${partyId} partyType=dungeon result=pending`);
      const result = await partyService.leaveParty(player.id, partyId || undefined);
      if (!result.success) {
        console.log(`[PartyTrack] REST_LEAVE_PARTY player=${player.id} username=${player.username} party=${partyId} partyType=dungeon result=error reason=${result.error}`);
        return res.status(400).json({ error: result.error || 'Failed to leave party' });
      }

      if (partyId) {
        const { broadcastToParty, createPartyEvent } = await import('./partyWs');
        broadcastToParty(partyId, createPartyEvent('party_member_left', partyId, 0, { playerId: player.id }));
      }

      console.log(`[PartyTrack] REST_LEAVE_PARTY player=${player.id} username=${player.username} party=${partyId} partyType=dungeon result=ok`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to leave party' });
    }
  });

  app.post('/api/v2/dungeon-party/leave-beacon', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      if (Buffer.isBuffer(body)) {
        try { body = JSON.parse(body.toString()); } catch { body = {}; }
      }
      let partyId = body?.partyId;
      if (!partyId) {
        const dungeonParty = await partyService.getPlayerParty(player.id, 'dungeon');
        if (dungeonParty && dungeonParty.status === 'forming') {
          partyId = dungeonParty.id;
        }
      }
      if (!partyId) return res.json({ success: false, error: 'No party to leave' });
      console.log(`[PartyTrack] BEACON_LEAVE_PARTY player=${player.id} username=${player.username} party=${partyId}`);
      const result = await partyService.leaveParty(player.id, partyId);
      if (result.success) {
        const { broadcastToParty, createPartyEvent } = await import('./partyWs');
        broadcastToParty(partyId, createPartyEvent('party_member_left', partyId, 0, { playerId: player.id }));
      }
      res.json({ success: result.success });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to leave party' });
    }
  });

  app.post('/api/v2/dungeon-party/kick', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });
      const { partyId, targetPlayerId } = req.body || {};
      if (!partyId || !targetPlayerId) return res.status(400).json({ error: 'partyId and targetPlayerId required' });

      console.log(`[PartyTrack] REST_KICK_MEMBER player=${player.id} username=${player.username} target=${targetPlayerId} party=${partyId} partyType=dungeon result=pending`);
      const result = await partyService.kickMember(partyId, player.id, targetPlayerId);
      if (!result.success) {
        console.log(`[PartyTrack] REST_KICK_MEMBER player=${player.id} username=${player.username} target=${targetPlayerId} party=${partyId} partyType=dungeon result=error reason=${result.error}`);
        return res.status(400).json({ error: result.error || 'Failed to kick member' });
      }

      console.log(`[PartyTrack] REST_KICK_MEMBER player=${player.id} username=${player.username} target=${targetPlayerId} party=${partyId} partyType=dungeon result=ok`);
      const { broadcastToParty, sendToPlayer, createPartyEvent } = await import('./partyWs');
      broadcastToParty(partyId, createPartyEvent('party_member_kicked', partyId, 0, { playerId: targetPlayerId, kickedBy: player.id }));
      sendToPlayer(targetPlayerId, createPartyEvent('party_member_kicked', partyId, 0, { playerId: targetPlayerId, kickedBy: player.id }));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to kick member' });
    }
  });

  app.post('/api/v2/dungeon-party/role', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });
      const { partyId, targetPlayerId, role } = req.body || {};
      if (!partyId || !targetPlayerId || !role) return res.status(400).json({ error: 'partyId, targetPlayerId, and role required' });

      const validRoles = ['tank', 'dps', 'healer', 'hybrid'];
      if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

      const [membership] = await db.select().from(partyMembers)
        .where(and(eq(partyMembers.partyId, partyId), eq(partyMembers.playerId, targetPlayerId)));
      if (!membership) return res.status(400).json({ error: 'Player not in party' });

      const party = await partyService.getParty(partyId);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      if (party.leaderId !== player.id && targetPlayerId !== player.id) return res.status(403).json({ error: 'Not authorized', errorCode: 'NOT_AUTHORIZED' });

      await db.update(partyMembers).set({ role } as any).where(eq(partyMembers.id, membership.id));

      const { broadcastToParty, createPartyEvent } = await import('./partyWs');
      broadcastToParty(partyId, createPartyEvent('party_role_changed', partyId, 0, { playerId: targetPlayerId, role }));

      res.json({ success: true, role });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to change role' });
    }
  });

  app.get('/api/v2/dungeon-party/session/state', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });

      const sinceEvent = parseInt(req.query.sinceEvent as string) || 0;
      const state = dungeonSessionManager.getSessionStateForPolling(player.id, sinceEvent);
      if (!state) return res.json({ active: false });

      return res.json({ active: true, ...state });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get session state' });
    }
  });

  app.post('/api/v2/dungeon-party/lobby-chat', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });
      if (!rateLimit(player.id, 'lobby_chat', 20)) {
        return res.status(429).json({ error: 'Too many messages' });
      }
      const { partyId, content } = req.body || {};
      if (!partyId || !content || !content.trim()) return res.status(400).json({ error: 'partyId and content required' });

      const [membership] = await db.select().from(partyMembers)
        .where(and(eq(partyMembers.partyId, partyId), eq(partyMembers.playerId, player.id)));
      if (!membership) return res.status(403).json({ error: 'Not a member of this party', errorCode: 'NOT_MEMBER' });

      const msg = addLobbyChatMessage(partyId, player.id, player.username, content.trim());

      try {
        const { broadcastToParty, createPartyEvent } = await import('./partyWs');
        broadcastToParty(partyId, createPartyEvent('lobby_chat_message', partyId, 0, msg));
      } catch {}

      res.json({ success: true, message: msg });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to send lobby chat' });
    }
  });

  app.get('/api/v2/dungeon-party/lobby-chat/:partyId', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });
      const { partyId } = req.params;

      const [membership] = await db.select().from(partyMembers)
        .where(and(eq(partyMembers.partyId, partyId), eq(partyMembers.playerId, player.id)));
      if (!membership) return res.status(403).json({ error: 'Not a member of this party', errorCode: 'NOT_MEMBER' });

      const messages = getLobbyChatMessages(partyId);
      res.json({ messages });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get lobby chat' });
    }
  });

  app.post('/api/v2/dungeon-party/session/food', authenticatePlayer, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Auth required' });

      const { healAmount } = req.body || {};
      if (!healAmount || healAmount <= 0) return res.status(400).json({ error: 'Invalid healAmount' });

      dungeonSessionManager.handleFoodUse(player.id, healAmount);
      return res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to use food' });
    }
  });
}
