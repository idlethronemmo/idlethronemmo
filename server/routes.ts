import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPlayerSchema, updatePlayerSchema, insertMarketListingSchema, insertGuildSchema, GUILD_CREATION_COST, GUILD_UPGRADES, calculateGuildContribution, calculateFinalMaxHit, calculateFinalMinHit, applyDamageReduction, calculateAccuracyRating, calculateEvasionRating, calculateHitChance, COMBAT_HP_SCALE, COMBAT_STYLE_MODIFIERS, PLAYER_ATTACK_SPEED, RESPAWN_DELAY, ActiveCombat, Equipment, calculateGuildBonuses, type GuildBonuses, getUpgradeWoodCosts, GUILD_BANK_CONTRIBUTION, getItemResourceCategory, canAffordUpgrade, deductUpgradeCosts, getUpgradeResourceCosts, type GuildBankResources, EMPTY_GUILD_BANK, MAX_INVENTORY_SLOTS, calculateMinHit, calculateMaxHit, DEFENCE_DR_CONSTANT, type QueueItem, MARKET_LISTING_FEE, MARKET_BUY_TAX } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { setupAuth } from "./replitAuth";
import { z } from "zod";
import { isItemTradable, isEquipmentItem } from "./itemUtils";
import { normalizeItemId, extractBaseItemId, canonicalizeItemId } from "@shared/itemData";
import { getCanonicalItemId } from "./inventoryHelper";
import { getEquipmentBonuses, isFood, getFoodHealAmount, getBestFood, rollRarity, rollRarityForDrop, isPotion, getPotionData } from "./combatUtils";
import { 
  processDebuffTick, 
  executeMonsterSkill, 
  addOrStackDebuff, 
  shouldSkillTrigger, 
  getStunCyclesRemainingWithTime, 
  decrementStunCycle,
  getHealingReductionWithTime,
  getArmorBreakPercentWithTime,
  filterExpiredDebuffs
} from "@shared/combatSkills";
import type { CombatDebuff } from "@shared/schema";
import { setupTradeWebSocket, isPlayerOnline, broadcastGameUpdate, sendPlayerDataUpdate, getOnlinePlayersList } from "./tradeWs";
import { setupPartyWebSocket, broadcastToParty, sendToPlayer, createPartyEvent, broadcastToAllPlayers } from "./partyWs";
import { onPlayerConnect, clearTaskState, getEquipmentBonusesFromCache } from "./scheduler";
import { randomUUID } from "crypto";
import { saveSubscription, deleteSubscription, getSubscription, notifyMarketSale, notifyCombatDeath, notifyIdleTimerExpired, notifyMaterialsDepleted, notifySpecialLoot, notifyMythicCraft, notifyMythicDrop, notifyItemBreak, notifyDurabilityWarning, notifyPotionDepleted, sendPushNotification, notifyTradeOffer } from "./utils/push";
import webpush from "web-push";
import { clearCombatState } from "./schedulerState";
import { refreshNpcShopStock } from "./npcShopUtils";
import { calculateOfflineProgress, processOfflineAchievements, type OfflineAchievementCompletion } from "./offlineProgressHelper";
import { verifyFirebaseToken, getFirebaseUidFromToken, getEmailFromToken } from "./firebaseAdmin";
import { itemTranslations, monsterTranslations, regionTranslations, skillActionTranslations, enrichWithTranslations } from "./gameTranslations";
import { dungeonService } from './services/dungeonService';
import { keyDropService } from './services/keyDropService';
import { portalService } from './services/portalService';
import { partyService } from './services/partyService';
import { partyFinderService } from './services/partyFinderService';
import { db } from "../db";
import { eq, and, desc, sql, gt, or, asc, not, ne, inArray } from "drizzle-orm";
import { dungeons, dungeonModifiers, dungeonKeyConfig, dungeonRuns, dungeonLootTables, partySynergies, partyMembers, parties, partyInvites, gameRecipes, gameSkillActions, gameItems, gameMonsters, players, privateMessages, globalChatMessages, notifications, badges, playerDungeonKeys, dungeonPartyMembers, dungeonParties, marketPriceHistory, marketListings } from "@shared/schema";
import { synergyService } from './services/synergyService';
import { calculateTravelTime, calculateTravelCost, calculateTravelDistance, isNightTime, BASE_COST_PER_STEP } from "@shared/travelUtils";
import { getInventoryLimit, canAddToInventory } from "@shared/inventoryLimits";
import { getLevelFromXp } from "@shared/gameMath";
import { getMasteryLevelFromXp, mapWeaponCategoryToMasteryType, getMasteryFieldName, type WeaponMasteryType, type PlayerMasteries } from "@shared/masterySystem";
import { calculatePartyPassiveBuffs } from "@shared/partyBuffs";
import { resolvePlayerCombatStats } from "./playerStatsResolver";
import { registerDungeonV2Routes } from "./dungeonV2Routes";
import fs from "fs";
import path from "path";

const isAuthenticated = (req, res, next) => next();

const mythicTestShownPlayers = new Set<string>();

function getReadableItemName(itemId: string): string {
  return itemId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Migration helper: Migrate smithing skill XP to crafting (one-time per player)
// This runs on player load to handle the skill rename from smithing -> crafting
async function migrateSmithingToCrafting(player: any): Promise<boolean> {
  const skills = player.skills as Record<string, { xp: number; level: number }> | null;
  if (!skills) return false;
  
  const smithingSkill = skills['smithing'];
  const craftingSkill = skills['crafting'];
  
  // Only migrate if player has smithing skill and crafting doesn't exist
  if (smithingSkill && !craftingSkill) {
    const newSkills = { ...skills };
    newSkills['crafting'] = { ...smithingSkill };
    delete newSkills['smithing'];
    
    await storage.updatePlayer(player.id, { skills: newSkills });
    player.skills = newSkills;
    console.log(`[Migration] Migrated smithing (${smithingSkill.xp} XP, lvl ${smithingSkill.level}) -> crafting for player ${player.id}`);
    return true;
  }
  return false;
}

// Migration helper: Add hunting skill to existing players who don't have it
async function migrateAddHuntingSkill(player: any): Promise<boolean> {
  const skills = player.skills as Record<string, { xp: number; level: number }> | null;
  if (!skills) return false;
  
  // Only migrate if player doesn't have hunting skill
  if (!skills['hunting']) {
    const newSkills = { ...skills };
    newSkills['hunting'] = { xp: 0, level: 1 };
    
    await storage.updatePlayer(player.id, { skills: newSkills });
    player.skills = newSkills;
    console.log(`[Migration] Added hunting skill for player ${player.id}`);
    return true;
  }
  return false;
}

// SINGLE SESSION ENFORCEMENT: No token cache needed
// Every login generates a new token, invalidating all other sessions

// Middleware to validate session token matches stored token (used for critical operations)
// Returns 401 with session_invalidated if token doesn't match
// Checks both header (for regular requests) and body (for sendBeacon requests)
async function validateSessionToken(req: AuthenticatedPlayerRequest, res: Response, next: NextFunction) {
  try {
    const player = req.player;
    if (!player) {
      return res.status(401).json({ error: "Authentication required", reason: "session_invalidated" });
    }
    
    // Check header first, then body (for sendBeacon which can't send headers)
    const clientToken = (req.headers['x-session-token'] as string) || (req.body?.sessionToken as string);
    
    const storedToken = await storage.getSessionToken(player.id);
    
    // If server has a stored token, client MUST provide a matching token
    if (storedToken) {
      if (!clientToken) {
        console.log(`[Session Validation] No token provided for player ${player.id} - session invalidated`);
        return res.status(401).json({ error: "Session token required", reason: "session_invalidated" });
      }
      if (storedToken !== clientToken) {
        console.log(`[Session Validation] Token mismatch for player ${player.id} - session invalidated`);
        return res.status(401).json({ error: "Session expired", reason: "session_invalidated" });
      }
    }
    
    next();
  } catch (error) {
    console.error("Session validation error:", error);
    return res.status(500).json({ error: "Session validation failed" });
  }
}

interface FirebaseAuthRequest extends Request {
  firebaseUser?: {
    uid: string;
    email?: string;
  };
}

const ALLOWED_CLIENT_SAVE_FIELDS = new Set([
  'skills', 'inventory', 'gold', 'equipment',
  'activeTask', 'activeCombat', 'activeBuffs',
  'currentHitpoints', 'equipmentDurability', 'inventoryDurability',
  'activeTravel', 'combatSessionStats',
  'cursedItems', 'itemModifications',
  'masteryDagger', 'masterySwordShield', 'mastery2hSword',
  'mastery2hAxe', 'mastery2hWarhammer', 'masteryBow', 'masteryStaff',
  'dataVersion', 'lastSaved',
  'lastKnownServerGold',
  'firemakingSlots',
  'taskQueue',
]);

function stripSensitiveFields(body: any) {
  if (!body || typeof body !== 'object') return;
  for (const key of Object.keys(body)) {
    if (!ALLOWED_CLIENT_SAVE_FIELDS.has(key)) {
      delete body[key];
    }
  }
}

async function detectSuspiciousActivity(playerId: string, playerUsername: string, currentPlayer: any, incomingData: any) {
  try {
    const previousGold = currentPlayer?.gold || 0;
    const newGold = incomingData.gold;
    if (newGold !== undefined && newGold - previousGold > 50000) {
      const difference = newGold - previousGold;
      // DISABLED: anti-cheat temporarily disabled
      // storage.logSuspiciousActivity(playerId, playerUsername, "gold_manipulation", { previousGold, newGold, difference }, "high").catch(console.error);
    }

    if (incomingData.inventory && typeof incomingData.inventory === 'object') {
      const allItems = await storage.getAllGameItems();
      const validItemIds = new Set(allItems.map(i => i.id));
      const invalidItems: string[] = [];
      for (const itemKey of Object.keys(incomingData.inventory)) {
        const baseId = itemKey.replace(/\s*\([^)]*\)\s*$/, '').replace(/#[a-z0-9]+$/i, '').trim();
        if (!validItemIds.has(baseId)) {
          invalidItems.push(itemKey);
        }
      }
      if (invalidItems.length > 0) {
        // DISABLED: anti-cheat temporarily disabled
        // storage.logSuspiciousActivity(playerId, playerUsername, "invalid_items", { invalidItems }, "critical").catch(console.error);
      }
    }

    if (incomingData.skills && typeof incomingData.skills === 'object') {
      const currentSkills = (currentPlayer?.skills as Record<string, { level: number; xp: number }>) || {};
      const newSkills = incomingData.skills as Record<string, { level: number; xp: number }>;
      for (const [skill, newData] of Object.entries(newSkills)) {
        if (!newData || typeof newData !== 'object') continue;
        const previousLevel = currentSkills[skill]?.level || 1;
        const newLevel = newData.level || 1;
        const levelJump = newLevel - previousLevel;
        if (levelJump > 10) {
          // DISABLED: anti-cheat temporarily disabled
          // storage.logSuspiciousActivity(playerId, playerUsername, "skill_manipulation", { skill, previousLevel, newLevel, levelJump }, "high").catch(console.error);
        }
      }
    }
  } catch (err) {
    console.error("[CheatDetection] Error in detectSuspiciousActivity:", err);
  }
}

function toPublicProfile(player: any) {
  return {
    id: player.id,
    username: player.username,
    avatar: player.avatar,
    skills: player.skills,
    equipment: player.equipment,
    equipmentDurability: player.equipmentDurability,
    totalLevel: player.totalLevel,
    currentRegion: player.currentRegion,
    tradeEnabled: player.tradeEnabled,
    isBot: player.isBot,
    currentHitpoints: player.currentHitpoints,
    activeBuffs: player.activeBuffs,
    masteryDagger: player.masteryDagger,
    masterySwordShield: player.masterySwordShield,
    mastery2hSword: player.mastery2hSword,
    mastery2hAxe: player.mastery2hAxe,
    mastery2hWarhammer: player.mastery2hWarhammer,
    masteryBow: player.masteryBow,
    masteryStaff: player.masteryStaff,
    itemModifications: player.itemModifications,
    cursedItems: player.cursedItems,
    lastSeen: player.lastSeen ?? null,
    activeTask: player.activeTask ?? null,
    selectedBadge: player.selectedBadge ?? null,
  };
}

interface AuthenticatedPlayerRequest extends Request {
  player?: any;
  authMethod?: 'replit' | 'firebase' | 'session';
}

// Standard auth middleware for PATCH - includes sessionToken fallback for dev mode
async function authenticatePlayer(req: AuthenticatedPlayerRequest, res: Response, next: NextFunction) {
  try {
    // Debug log to see what auth headers we're receiving
    console.log('[authenticatePlayer] Headers:', {
      authorization: req.headers.authorization ? 'Bearer ...' : 'none',
      'x-session-token': req.headers['x-session-token'] ? 'present' : 'none',
      isAuthenticated: (req as any).isAuthenticated?.() ? 'yes' : 'no'
    });
    
    // First try Replit session auth
    if ((req as any).isAuthenticated && (req as any).isAuthenticated()) {
      const userId = (req as any).user?.claims?.sub;
      if (userId) {
        const player = await storage.getPlayerByUserId(userId);
        if (player) {
          req.player = player;
          req.authMethod = 'replit';
          return next();
        }
      }
    }
    
    // Then try Firebase token auth
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];
      
      const decodedToken = await verifyFirebaseToken(idToken);
      if (decodedToken) {
        const firebaseUid = getFirebaseUidFromToken(decodedToken);
        let player = await storage.getPlayerByFirebaseUid(firebaseUid);
        
        if (!player) {
          const email = getEmailFromToken(decodedToken);
          if (email) {
            const playerByEmail = await storage.getPlayerByEmail(email);
            if (playerByEmail) {
              console.log(`[authenticatePlayer] Re-linking player ${playerByEmail.username} (email=${email}) to new firebaseUid=${firebaseUid}`);
              await storage.updatePlayer(playerByEmail.id, { firebaseUid, userId: firebaseUid });
              player = await storage.getPlayer(playerByEmail.id);
            }
          }
        }
        
        if (player) {
          req.player = player;
          req.authMethod = 'firebase';
          return next();
        }
      } else if (process.env.NODE_ENV === 'development') {
        // Dev fallback for Firebase
        try {
          const parts = idToken.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            const firebaseUid = payload.user_id || payload.sub;
            if (firebaseUid) {
              const player = await storage.getPlayerByFirebaseUid(firebaseUid);
              if (player) {
                console.warn("[DEV MODE] Using unverified Firebase token for save");
                req.player = player;
                req.authMethod = 'firebase';
                return next();
              }
            }
          }
        } catch (parseError) {
          console.error("Failed to parse Firebase token:", parseError);
        }
      }
    }
    
    // SessionToken fallback for dev mode - check x-session-token header
    const sessionToken = req.headers['x-session-token'] as string;
    if (sessionToken) {
      const player = await storage.getPlayerBySessionToken(sessionToken);
      if (player) {
        req.player = player;
        req.authMethod = 'session';
        return next();
      }
    }
    
    return res.status(401).json({ error: "Authentication required" });
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

// Auth middleware for sendBeacon POST - includes sessionToken fallback with rotation
async function authenticatePlayerForBeacon(req: AuthenticatedPlayerRequest, res: Response, next: NextFunction) {
  try {
    // First try standard auth methods
    if ((req as any).isAuthenticated && (req as any).isAuthenticated()) {
      const userId = (req as any).user?.claims?.sub;
      if (userId) {
        const player = await storage.getPlayerByUserId(userId);
        if (player) {
          req.player = player;
          req.authMethod = 'replit';
          return next();
        }
      }
    }
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];
      
      const decodedToken = await verifyFirebaseToken(idToken);
      if (decodedToken) {
        const firebaseUid = getFirebaseUidFromToken(decodedToken);
        let player = await storage.getPlayerByFirebaseUid(firebaseUid);
        
        if (!player) {
          const email = getEmailFromToken(decodedToken);
          if (email) {
            const playerByEmail = await storage.getPlayerByEmail(email);
            if (playerByEmail) {
              console.log(`[authenticatePlayerForBeacon] Re-linking player ${playerByEmail.username} (email=${email}) to new firebaseUid=${firebaseUid}`);
              await storage.updatePlayer(playerByEmail.id, { firebaseUid, userId: firebaseUid });
              player = await storage.getPlayer(playerByEmail.id);
            }
          }
        }
        
        if (player) {
          req.player = player;
          req.authMethod = 'firebase';
          return next();
        }
      }
    }
    
    // Fallback: sessionToken for sendBeacon (NO rotation - client keeps same token for session checks)
    // Rotation was causing false "session_invalidated" errors because client couldn't track new token
    if (req.body && req.body.sessionToken) {
      const playerId = req.params.id;
      if (playerId) {
        const storedToken = await storage.getSessionToken(playerId);
        if (storedToken && storedToken === req.body.sessionToken) {
          const player = await storage.getPlayer(playerId);
          if (player) {
            req.player = player;
            req.authMethod = 'firebase';
            return next();
          }
        }
      }
    }
    
    return res.status(401).json({ error: "Authentication required" });
  } catch (error) {
    console.error("Beacon authentication error:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

async function verifyFirebaseAuth(req: FirebaseAuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  console.log(`[verifyFirebaseAuth] Called for ${req.method} ${req.path}, hasAuthHeader=${!!authHeader}`);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log(`[verifyFirebaseAuth] REJECTED: Missing or invalid auth header`);
    return res.status(401).json({ message: "Authentication failed" });
  }
  
  const idToken = authHeader.split('Bearer ')[1];
  console.log(`[verifyFirebaseAuth] Token received, length=${idToken?.length || 0}`);
  
  const decodedToken = await verifyFirebaseToken(idToken);
  if (!decodedToken) {
    console.log(`[verifyFirebaseAuth] Token verification FAILED, NODE_ENV=${process.env.NODE_ENV}`);
    if (process.env.NODE_ENV === 'development') {
      try {
        const parts = idToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          if (payload.user_id || payload.sub) {
            console.warn("[DEV MODE] Using unverified Firebase token");
            req.firebaseUser = {
              uid: payload.user_id || payload.sub,
              email: payload.email,
            };
            return next();
          }
        }
      } catch (parseError) {
        console.error("Failed to parse Firebase token:", parseError);
      }
    }
    return res.status(401).json({ message: "Invalid token" });
  }
  
  const uid = getFirebaseUidFromToken(decodedToken);
  const email = getEmailFromToken(decodedToken);
  console.log(`[verifyFirebaseAuth] Token VERIFIED: uid=${uid}, email=${email}`);
  
  req.firebaseUser = { uid, email };
  next();
}

// Convert monster ID (e.g. "goblin_raider") to readable name (e.g. "Goblin Raider")
function getReadableMonsterName(monsterId: string): string {
  if (!monsterId) return "Canavar";
  return monsterId.split('_').map(w => 
    w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');
}

function getDailyBaseline(): number {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const hash = ((seed * 2654435761) >>> 0) % 31; // 0-30
  return 20 + hash; // 20-50
}

let virtualBaseline = getDailyBaseline();
let lastBaselineChange = Date.now();
let nextChangeInterval = (Math.floor(Math.random() * 8) + 3) * 60 * 1000;

function getVirtualOnlineCount(realCount: number): number {
  const now = Date.now();
  const currentHour = new Date().getUTCHours();
  const isNight = currentHour >= 0 && currentHour < 7;
  
  const nightMin = 4;
  const nightMax = 12;
  const dayMin = 20;
  const dayMax = 50;
  
  const minBaseline = isNight ? nightMin : dayMin;
  const maxBaseline = isNight ? nightMax : dayMax;
  
  if (now - lastBaselineChange >= nextChangeInterval) {
    const changeAmount = Math.floor(Math.random() * 6) + 2;
    const direction = Math.random() > 0.5 ? 1 : -1;
    virtualBaseline = Math.max(minBaseline, Math.min(maxBaseline, virtualBaseline + (direction * changeAmount)));
    lastBaselineChange = now;
    nextChangeInterval = (Math.floor(Math.random() * 8) + 3) * 60 * 1000;
  }
  
  virtualBaseline = Math.max(minBaseline, Math.min(maxBaseline, virtualBaseline));
  
  return realCount + virtualBaseline;
}

const pollCache = new Map<string, { data: any; timestamp: number }>();
const POLL_CACHE_TTL = 7000;

let gameDataVersion = Date.now();
let playerDataVersions = new Map<string, number>();

export function bumpGameDataVersion() {
  gameDataVersion = Date.now();
}

export function bumpPlayerDataVersion(playerId: string) {
  playerDataVersions.set(playerId, Date.now());
}

const onPlayerConnectTracker = new Map<string, number>();
const ON_PLAYER_CONNECT_COOLDOWN = 60000;

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth
  if (process.env.DISABLE_AUTH !== "true") {
    await setupAuth(app);
  } else {
    console.log("Auth disabled");
  }
  const OFFLINE_LOG_ADMIN_EMAILS = ['betelgeusestd@gmail.com', 'yusufakgn61@gmail.com'];
  function shouldLogOffline(player: any): boolean {
    if (process.env.NODE_ENV === 'development') return true;
    if (player?.staffRole === 'admin') return true;
    if (player?.email && OFFLINE_LOG_ADMIN_EMAILS.includes(player.email)) return true;
    return false;
  }

  async function loginFinalization(player: any, isSync: boolean = false): Promise<{
    offlineProgress: any;
    combatOfflineProgress: any;
    firemakingOfflineProgress: any;
    sessionToken: string;
    onlinePlayerCount: number;
    offlineAchievements?: OfflineAchievementCompletion[];
    offlineAchievementGold?: number;
    offlineQueueSteps?: { name: string; type: 'skill' | 'combat'; durationMs: number }[];
  }> {
    const now = Date.now();

    let sessionToken: string;
    if (isSync) {
      const storedToken = await storage.getSessionToken(player.id);
      sessionToken = storedToken || randomUUID();
      if (!storedToken) {
        await storage.updateSessionToken(player.id, sessionToken);
      }
    } else {
      sessionToken = randomUUID();
      await storage.updateSessionToken(player.id, sessionToken);
      try {
        await storage.deleteTransientNotifications(player.id);
        await storage.cleanupOldNotifications(player.id);
      } catch (e) {
        console.error('[LoginFinalization] Notification cleanup failed:', e);
      }
    }

    const activeTaskData = player.activeTask as any;
    const activeCombatData = player.activeCombat as any;
    const v2QueueDuration = activeTaskData?.queueDurationMs || activeCombatData?.queueDurationMs || 0;
    let offlineMaxCap = 6 * 60 * 60 * 1000;
    if (v2QueueDuration > 0) {
      const { maxQueueTimeMs } = await import('@shared/schema');
      const badges = await storage.getPlayerBadges(player.id);
      const badgeIds = badges.map((b: any) => b.badge?.id || b.badgeId);
      offlineMaxCap = maxQueueTimeMs(badgeIds);
    }

    // Offline duration: gather all candidate activity anchors and pick the best one.
    // Strategy: use the OLDEST valid timestamp that reflects real game activity,
    // because we want the full time gap since the player was last actively being served.
    //
    // Priority (best → fallback):
    //   1. lastLogoutAt     — explicit logout/tab-close/beacon, most authoritative
    //   2. lastClientTick   — last time the scheduler or client saved the task/combat;
    //                         unaffected by heartbeat/poll, so reflects real work timing
    //   3. lastSeen         — heartbeat/poll timestamp, only used as last resort and only
    //                         when active work exists (otherwise zero offline is correct)
    //
    // We compare ALL valid candidates and pick the one that yields the LARGEST duration
    // (i.e., the oldest anchor), because underestimating offline time is the bug.
    const MIN_VALID_TIMESTAMP = 1704067200000; // Jan 1 2024 — filter out unset/stale timestamps

    const taskLastTick = (activeTaskData?.lastClientTick as number | undefined) ?? 0;
    const combatLastTick = (activeCombatData?.lastClientTick as number | undefined) ?? 0;
    // Pick the most recent lastClientTick from either active task or active combat
    const lastClientTickMs = Math.max(taskLastTick, combatLastTick);

    let offlineDurationMs = 0;
    let anchorLabel = 'none';

    // Candidate 1: lastLogoutAt
    if (player.lastLogoutAt) {
      const lastLogout = new Date(player.lastLogoutAt).getTime();
      const durationFromLogout = now - lastLogout;
      if (durationFromLogout > offlineDurationMs) {
        offlineDurationMs = durationFromLogout;
        anchorLabel = 'lastLogoutAt';
      }
    }

    // Candidate 2: lastClientTick (from active task or combat JSON)
    // This anchors to the last real scheduler/client save and is unaffected by heartbeat.
    // Use it when it is older than the current best anchor (lastLogoutAt or nothing).
    if (lastClientTickMs >= MIN_VALID_TIMESTAMP) {
      const durationFromClientTick = now - lastClientTickMs;
      if (durationFromClientTick > offlineDurationMs && durationFromClientTick > 30 * 1000) {
        offlineDurationMs = durationFromClientTick;
        anchorLabel = 'lastClientTick';
      }
    }

    // Candidate 3: lastSeen fallback — legacy only, used when lastClientTick is unavailable/invalid.
    // Only applies when:
    //   (a) there is active work (task/combat exists), AND
    //   (b) the resulting duration exceeds the current best anchor, AND
    //   (c) the gap is >30s (consistent with lastClientTick staleness threshold above)
    // Note: lastSeen may be bumped by heartbeat/poll even with no real activity; that
    //   is why lastClientTick is preferred. This fallback covers truly legacy records
    //   where no lastClientTick was ever stored.
    if (player.lastSeen && !!(activeTaskData || activeCombatData)) {
      const lastSeenTime = new Date(player.lastSeen).getTime();
      const durationFromLastSeen = now - lastSeenTime;
      if (durationFromLastSeen > offlineDurationMs && durationFromLastSeen > 30 * 1000) {
        offlineDurationMs = durationFromLastSeen;
        anchorLabel = 'lastSeen';
      }
    }

    offlineDurationMs = Math.max(0, Math.min(offlineDurationMs, offlineMaxCap));
    if (shouldLogOffline(player)) console.log(`[LoginFinalization] Player ${player.id} offline anchor=${anchorLabel} lastClientTick=${lastClientTickMs} lastLogoutAt=${player.lastLogoutAt} lastSeen=${player.lastSeen} duration=${Math.floor(offlineDurationMs / 1000)}s`);

    let offlineProgress = undefined;
    let combatOfflineProgress = undefined;
    let firemakingOfflineProgress = undefined;
    let offlineAchievements: OfflineAchievementCompletion[] | undefined = undefined;
    let offlineAchievementGold: number | undefined = undefined;
    let offlineQueueSteps: { name: string; type: 'skill' | 'combat'; durationMs: number }[] | undefined = undefined;

    if (player.lastOfflineProcessedAt) {
      const lastProcessed = new Date(player.lastOfflineProcessedAt).getTime();
      if (now - lastProcessed < 30000) {
        if (shouldLogOffline(player)) console.log(`[LoginFinalization] Player ${player.id} offline progress already processed ${Math.floor((now - lastProcessed) / 1000)}s ago, skipping`);
        offlineDurationMs = 0;
      }
    }

    if (offlineDurationMs > 0) {
      if (shouldLogOffline(player)) console.log(`[LoginFinalization] Player ${player.id} offline for ${Math.floor(offlineDurationMs / 1000)}s, calculating progress...`);
      try {
        const result = await calculateOfflineProgress(player, offlineDurationMs);
        offlineProgress = result.offlineProgress;
        combatOfflineProgress = result.combatOfflineProgress;
        firemakingOfflineProgress = result.firemakingOfflineProgress;
        offlineQueueSteps = result.queueSteps as any;

        if (result.offlineProgress || result.combatOfflineProgress || result.firemakingOfflineProgress) {
          try {
            const playerSkills = (player.skills || {}) as Record<string, { xp: number; level: number }>;
            const achResult = await processOfflineAchievements(player.id, result, playerSkills);
            if (achResult.newlyCompleted.length > 0) {
              offlineAchievements = achResult.newlyCompleted;
              offlineAchievementGold = achResult.totalGoldReward > 0 ? achResult.totalGoldReward : undefined;
              if (shouldLogOffline(player)) console.log(`[LoginFinalization] Player ${player.id} earned ${achResult.newlyCompleted.length} offline achievements, ${achResult.totalGoldReward} gold`);
            }
          } catch (achErr) {
            console.error('[LoginFinalization] Offline achievement processing error:', achErr);
          }

          const updatedPlayer = await storage.getPlayer(player.id);
          if (updatedPlayer) {
            Object.assign(player, updatedPlayer);
          }
        }
      } catch (err) {
        console.error('[LoginFinalization] Offline progress error:', err);
      }
    }

    async function cleanupStaleParties(playerId: string, fullLogin: boolean) {
      try {
        await db.transaction(async (tx) => {
          const socialMemberships = await tx.select()
            .from(partyMembers)
            .innerJoin(parties, eq(partyMembers.partyId, parties.id))
            .where(
              eq(partyMembers.playerId, playerId)
            );

          for (const row of socialMemberships) {
            await tx.execute(sql`SELECT id FROM parties WHERE id = ${row.parties.id} FOR UPDATE`);

            const [freshParty] = await tx.select()
              .from(parties)
              .where(eq(parties.id, row.parties.id))
              .limit(1);
            if (!freshParty) continue;
            const partyRow = freshParty;

            if (partyRow.status === 'disbanded') {
              console.log(`[PartyCleanup] Removing orphaned membership for player ${playerId} (party ${partyRow.id} disbanded)`);
              await tx.delete(partyMembers).where(and(
                eq(partyMembers.playerId, playerId),
                eq(partyMembers.partyId, partyRow.id)
              ));
              continue;
            }

            if (fullLogin) {
              await tx.update(partyMembers)
                .set({ offlineKillCount: 0 } as any)
                .where(and(
                  eq(partyMembers.partyId, partyRow.id),
                  eq(partyMembers.playerId, playerId)
                ));
            }

            const memberCountResult = await tx.select({ count: sql<number>`count(*)::int` })
              .from(partyMembers)
              .where(eq(partyMembers.partyId, partyRow.id));
            const memberCount = memberCountResult[0]?.count || 0;

            if (memberCount === 0 && partyRow.status === 'forming') {
              console.log(`[PartyCleanup] Auto-disbanding empty forming party ${partyRow.id} for player ${playerId}`);
              await tx.delete(partyMembers).where(eq(partyMembers.partyId, partyRow.id));
              await tx.delete(partyInvites).where(eq(partyInvites.partyId, partyRow.id));
              await tx.update(parties)
                .set({ status: 'disbanded', updatedAt: new Date() } as any)
                .where(eq(parties.id, partyRow.id));
            }
          }
        });
      } catch (e) {
        console.error('[PartyCleanup] Social party cleanup error:', e);
      }

      if (fullLogin) {
        try {
          const dungeonMemberships = await db.select()
            .from(dungeonPartyMembers)
            .where(eq(dungeonPartyMembers.playerId, playerId));
          for (const dpm of dungeonMemberships) {
            const [dpRow] = await db.select()
              .from(dungeonParties)
              .where(eq(dungeonParties.id, dpm.dungeonPartyId))
              .limit(1);

            if (!dpRow || dpRow.status === 'disbanded') {
              console.log(`[PartyCleanup] Removing orphaned dungeon party membership for player ${playerId}`);
              await db.delete(dungeonPartyMembers).where(and(
                eq(dungeonPartyMembers.playerId, playerId),
                eq(dungeonPartyMembers.dungeonPartyId, dpm.dungeonPartyId)
              ));
              continue;
            }

            const memberCountResult = await db.select({ count: sql<number>`count(*)::int` })
              .from(dungeonPartyMembers)
              .where(eq(dungeonPartyMembers.dungeonPartyId, dpm.dungeonPartyId));
            const memberCount = memberCountResult[0]?.count || 0;

            if (memberCount === 0 && dpRow.status === 'forming') {
              console.log(`[PartyCleanup] Auto-disbanding empty dungeon party ${dpRow.id} for player ${playerId}`);
              await db.transaction(async (tx) => {
                await tx.delete(dungeonPartyMembers).where(eq(dungeonPartyMembers.dungeonPartyId, dpRow.id));
                await tx.update(dungeonParties)
                  .set({ status: 'disbanded', updatedAt: new Date() } as any)
                  .where(eq(dungeonParties.id, dpRow.id));
              });
            }
          }
        } catch (e) {
          console.error('[PartyCleanup] Dungeon party cleanup error:', e);
        }
      }
    }

    if (!isSync) {
      await storage.updatePlayer(player.id, {
        lastLoginAt: new Date(),
        isOnline: 1,
        lastLogoutAt: null,
        lastOfflineProcessedAt: new Date(),
      });

      await cleanupStaleParties(player.id, true);
    } else if (offlineDurationMs > 0) {
      await storage.updatePlayer(player.id, {
        isOnline: 1,
        lastLogoutAt: null,
        lastOfflineProcessedAt: new Date(),
      });
      await cleanupStaleParties(player.id, false);
    } else {
      await cleanupStaleParties(player.id, false);
    }

    let onlinePlayerCount = 0;
    try {
      const onlineCountResult = await db.select({ count: sql<number>`count(*)::int` })
        .from(players)
        .where(and(
          gt(players.lastSeen, new Date(Date.now() - 2 * 60 * 1000)),
          eq(players.isGuest, 0)
        ));
      onlinePlayerCount = getVirtualOnlineCount(onlineCountResult[0]?.count || 0);
    } catch (e) {}

    if (player.username === 'DuFFy' && !mythicTestShownPlayers.has(player.id)) {
      mythicTestShownPlayers.add(player.id);
      const testDrop = { itemId: 'Triple Loot Staff (Mythic)', monsterId: '' };
      if (combatOfflineProgress && typeof combatOfflineProgress === 'object') {
        const prog = combatOfflineProgress as any;
        prog.mythicDrops = [...(prog.mythicDrops || []), testDrop];
      } else {
        combatOfflineProgress = {
          offlineTimeMs: 0,
          offlineTimeFormatted: '0m',
          monstersKilled: 0,
          playerDied: false,
          totalXpGained: { attack: 0, strength: 0, defence: 0, hitpoints: 0 },
          lootGained: {},
          finalPlayerHp: 0,
          mythicDrops: [testDrop],
          monsterId: '',
        };
      }
    }

    // Light-weight enhancement integrity check on login (async, doesn't block login)
    // Restores any itemModifications entries that weapon_enhancements has but itemModifications doesn't.
    // Uses the shared syncEnhancementIntegrity routine (reconciles level + stats + skills).
    if (!isSync) {
      setImmediate(async () => {
        const result = await syncEnhancementIntegrity(player.id);
        if (result.synced > 0) {
          console.log(`[LoginEnhancementSync] Player ${player.id} (${player.username}): synced ${result.synced} entries`);
        }
      });
    }

    return { offlineProgress, combatOfflineProgress, firemakingOfflineProgress, sessionToken, onlinePlayerCount, offlineAchievements, offlineAchievementGold, offlineQueueSteps };
  }

  app.get('/api/staff/check', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Not authenticated' });
    res.json({
      staffRole: player.staffRole || null,
      isTester: player.isTester || 0,
      isAdmin: false
    });
  });

  app.get('/api/poll', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const cached = pollCache.get(player.id);
      if (cached && Date.now() - cached.timestamp < POLL_CACHE_TTL) {
        return res.json(cached.data);
      }

      const [
        notifResult,
        unreadNotifCount,
        pmUnreadResult,
        globalChatUnreadResult,
        partyMembership,
        dungeonRun,
        onlineCountResult,
      ] = await Promise.all([
        storage.getNotifications(player.id, 20, false),
        storage.getUnreadNotificationCount(player.id),
        db.select({ count: sql<number>`count(*)::int` })
          .from(privateMessages)
          .where(and(eq(privateMessages.receiverId, player.id), eq(privateMessages.isRead, 0))),
        (async () => {
          const lastSeen = player.lastSeenGlobalChat;
          if (!lastSeen) return 0;
          const result = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(globalChatMessages)
            .where(and(gt(globalChatMessages.createdAt, lastSeen), ne(globalChatMessages.playerId, player.id)));
          return result[0]?.count ?? 0;
        })(),
        db.select().from(partyMembers).where(eq(partyMembers.playerId, player.id)).limit(1),
        dungeonService.getCurrentRun(player.id),
        db.select({ count: sql<number>`count(*)::int` })
          .from(players)
          .where(and(
            gt(players.lastSeen, new Date(Date.now() - 2 * 60 * 1000)),
            eq(players.isGuest, 0)
          )),
      ]);

      if (!player.lastLogoutAt) {
        // Always mark the player as online while they're polling
        storage.updatePlayer(player.id, { isOnline: 1 }).catch(() => {});
        // Only update lastSeen when the player has active work (task or combat).
        // When the queue has finished and no activity is running, we stop bumping
        // lastSeen so that the login finalization can use lastClientTick (from the
        // last real work cycle) as the correct offline-progress anchor.
        const hasActiveWork = !!(player.activeTask || player.activeCombat);
        if (hasActiveWork) {
          storage.updateLastSeen(player.id).catch(() => {});
        }
      }

      const now = Date.now();
      const lastConnect = onPlayerConnectTracker.get(player.id) || 0;
      if (now - lastConnect > ON_PLAYER_CONNECT_COOLDOWN) {
        onPlayerConnectTracker.set(player.id, now);
        onPlayerConnect(player.id).catch(err =>
          console.error('[Poll] onPlayerConnect error:', err)
        );
        partyService.cleanupDuplicatePartyMemberships(player.id).catch(err =>
          console.error('[Poll] Party cleanup error:', err)
        );
      }

      let partySummary: { partyId: string | null; synergies: any } = { partyId: null, synergies: null };
      if (partyMembership.length > 0) {
        partySummary.partyId = partyMembership[0].partyId;
      }

      let dungeonSummary: { hasActiveRun: boolean; dungeonId?: string; currentFloor?: number; status?: string } = { hasActiveRun: false };
      if (dungeonRun) {
        dungeonSummary = {
          hasActiveRun: true,
          dungeonId: dungeonRun.dungeonId,
          currentFloor: dungeonRun.currentFloor,
          status: dungeonRun.status,
        };
      }

      const guildId = (player as any).guildId || null;

      const pendingTradeCount = await storage.getPendingTradeCount(player.id);
      const playerDataVersion = playerDataVersions.get(player.id) || 0;

      // Session token validation in poll - enables faster session invalidation detection
      // Client sends x-session-token header, we check if it matches stored token
      let sessionValid = true;
      const clientSessionToken = req.headers['x-session-token'] as string;
      if (clientSessionToken) {
        const storedToken = await storage.getSessionToken(player.id);
        if (storedToken && storedToken !== clientSessionToken) {
          sessionValid = false;
        }
      }

      const response = {
        gold: player.gold,
        notifications: notifResult,
        unreadNotifCount,
        pmUnreadCount: pmUnreadResult[0]?.count || 0,
        globalChatUnreadCount: globalChatUnreadResult,
        partyId: partySummary.partyId,
        dungeonSummary,
        guildId,
        lastSeen: new Date().toISOString(),
        pendingTradeCount,
        gameDataVersion,
        playerDataVersion,
        onlinePlayerCount: getVirtualOnlineCount(onlineCountResult[0]?.count || 0),
        realOnlineCount: (player as any).email && ["betelgeusestd@gmail.com", "yusufakgn61@gmail.com"].includes((player as any).email) ? (onlineCountResult[0]?.count || 0) : undefined,
        staffRole: player.staffRole || null,
        ...(sessionValid ? {} : { sessionInvalidated: true }),
      };

      // Don't cache session-invalidated responses - each poll should re-check
      if (sessionValid) {
        pollCache.set(player.id, { data: response, timestamp: Date.now() });
      }

      res.json(response);
    } catch (error) {
      console.error('Error in GET /api/poll:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/online-players', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const onlinePlayers = getOnlinePlayersList();
      res.json({ players: onlinePlayers });
    } catch (error) {
      console.error('Error in GET /api/online-players:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/nearby-players', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Authentication required' });

      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      const nearbyPlayers = await db.select({
        id: players.id,
        username: players.username,
        avatar: players.avatar,
        totalLevel: players.totalLevel,
        currentRegion: players.currentRegion,
        activeCombat: players.activeCombat,
        activeTask: players.activeTask,
      }).from(players)
        .where(and(
          eq(players.currentRegion, player.currentRegion),
          ne(players.id, player.id),
          eq(players.isGuest, 0),
          or(
            gt(players.lastSeen, twoMinutesAgo),
            and(eq(players.isBot, 1), gt(players.lastSeen, sixMinutesAgo))
          )
        ))
        .limit(20);

      res.json({
        players: nearbyPlayers.map(p => ({
          id: p.id,
          username: p.username,
          avatar: p.avatar,
          totalLevel: p.totalLevel,
          currentRegion: p.currentRegion,
          isInCombat: p.activeCombat ? 1 : 0,
          currentMonsterId: p.activeCombat ? (p.activeCombat as any)?.monsterId || null : null,
          activeSkill: p.activeTask ? (p.activeTask as any)?.skillType || null : null,
        })),
        region: player.currentRegion,
      });
    } catch (error) {
      console.error('Error in GET /api/nearby-players:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Guest Auth - Create guest account without any authentication
  app.post('/api/auth/guest-login', async (req, res) => {
    try {
      const { language } = req.body;
      
      // Generate unique guest ID and username
      const guestId = `guest_${randomUUID()}`;
      const guestNumber = Math.floor(Math.random() * 900000) + 100000;
      const guestUsername = `Guest${guestNumber}`;
      
      // Create guest player with isGuest=1
      const newPlayer = await storage.createPlayer({
        userId: guestId,
        username: guestUsername,
        email: null,
        firebaseUid: null,
        isGuest: 1,
        avatar: 'knight',
        language: language || 'en',
        skills: {},
        inventory: {},
        gold: 0,
        equipment: {},
        activeBuffs: [],
        equipmentDurability: {},
        inventoryDurability: {},
        tradeEnabled: 0, // Guests can't trade
        dataVersion: 1,
      });
      
      // Generate session token for guest
      const sessionToken = randomUUID();
      await storage.updateSessionToken(newPlayer.id, sessionToken);
      
      console.log(`[Guest Auth] Created guest account: ${newPlayer.username} (${newPlayer.id})`);
      
      res.json({ 
        player: newPlayer, 
        sessionToken,
        isGuest: true 
      });
    } catch (error) {
      console.error("Guest login error:", error);
      res.status(500).json({ message: "Guest login failed" });
    }
  });

  // Guest Auth - Convert guest account to registered account
  app.post('/api/auth/convert-guest', verifyFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
    try {
      const { username, guestPlayerId, guestSessionToken } = req.body;
      const firebaseUser = req.firebaseUser!;
      const firebaseUid = firebaseUser.uid;
      const email = firebaseUser.email;
      
      if (!username) {
        return res.status(400).json({ message: "Username required" });
      }
      
      if (!guestPlayerId || !guestSessionToken) {
        return res.status(400).json({ message: "Guest account credentials required" });
      }
      
      // Verify guest player exists and token matches
      const guestPlayer = await storage.getPlayer(guestPlayerId);
      if (!guestPlayer) {
        return res.status(404).json({ message: "Guest account not found" });
      }
      
      const storedToken = await storage.getSessionToken(guestPlayerId);
      if (storedToken !== guestSessionToken) {
        return res.status(401).json({ message: "Invalid session" });
      }
      
      if (guestPlayer.isGuest !== 1) {
        return res.status(400).json({ message: "This account is already registered" });
      }
      
      if (email) {
        const emailBanned = await storage.isEmailBanned(email);
        if (emailBanned) return res.status(403).json({ error: "This email is banned" });
      }

      // Check if Firebase UID already has an account
      const existingPlayer = await storage.getPlayerByFirebaseUid(firebaseUid);
      if (existingPlayer) {
        return res.status(400).json({ message: "An account already exists with this identity" });
      }
      
      // Check username availability
      const usernameAvailable = await storage.checkUsernameAvailable(username);
      if (!usernameAvailable && guestPlayer.username !== username) {
        return res.status(400).json({ message: "This username is already taken" });
      }
      
      // Convert guest to registered account
      const updatedPlayer = await storage.updatePlayerWithUsername(guestPlayerId, {
        userId: firebaseUid, // Update userId to Firebase UID
        username,
        email: email || null,
        firebaseUid,
        isGuest: 0,
        tradeEnabled: 1, // Enable trading for registered users
      } as any);
      
      // Generate new session token
      const sessionToken = randomUUID();
      await storage.updateSessionToken(guestPlayerId, sessionToken);
      
      console.log(`[Guest Convert] Converted guest ${guestPlayer.username} to ${username} (Firebase: ${firebaseUid})`);
      
      res.json({ 
        player: updatedPlayer, 
        sessionToken,
        converted: true 
      });
    } catch (error) {
      console.error("Guest conversion error:", error);
      res.status(500).json({ message: "Account conversion failed" });
    }
  });

  // Get player's current gold (for polling sync)
  app.get('/api/players/gold', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      res.json({ gold: player.gold });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get gold' });
    }
  });

  // Update username (nickname) for any player
  app.patch('/api/players/:id/username', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const { id } = req.params;
      const { username } = req.body;
      const player = req.player!;
      
      if (player.id !== id) {
        return res.status(403).json({ message: "You do not have permission for this action" });
      }
      
      if (!username || username.length < 3 || username.length > 20) {
        return res.status(400).json({ message: "Username must be 3-20 characters" });
      }
      
      // Check username format (alphanumeric and underscore only)
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ message: "Username can only contain letters, numbers, and underscores" });
      }
      
      // Check availability
      const usernameAvailable = await storage.checkUsernameAvailable(username);
      if (!usernameAvailable && player.username !== username) {
        return res.status(400).json({ message: "This username is already taken" });
      }
      
      const updatedPlayer = await storage.updatePlayerWithUsername(id, { username });
      
      console.log(`[Username Update] Player ${id} changed username from ${player.username} to ${username}`);
      
      res.json({ player: updatedPlayer });
    } catch (error) {
      console.error("Username update error:", error);
      res.status(500).json({ message: "Failed to update username" });
    }
  });

  // Firebase Auth - Register new player (requires Firebase token verification)
  app.post('/api/auth/firebase-register', verifyFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
    try {
      const { username, avatar, language } = req.body;
      const firebaseUser = req.firebaseUser!;
      const firebaseUid = firebaseUser.uid;
      const email = firebaseUser.email;

      // Check existing player by Firebase UID first
      let player = await storage.getPlayerByFirebaseUid(firebaseUid);
      if (player) {
        return res.json({ player, linked: false });
      }

      // Email-based re-linking BEFORE username checks: if same email already has a player,
      // link existing player to new Firebase UID (e.g. user deleted Firebase account and re-registered)
      if (email) {
        const emailBanned = await storage.isEmailBanned(email);
        if (emailBanned) return res.status(403).json({ error: "This email is banned" });

        const existingByEmail = await storage.getPlayerByEmail(email);
        if (existingByEmail) {
          if (existingByEmail.isBanned === 1) {
            return res.status(403).json({ error: "Account banned", reason: existingByEmail.banReason });
          }
          console.log(`[Firebase Register] Re-linking existing player ${existingByEmail.username} (email=${email}) to new firebaseUid=${firebaseUid}`);
          await storage.updatePlayer(existingByEmail.id, { firebaseUid, userId: firebaseUid });
          const updatedPlayer = await storage.getPlayer(existingByEmail.id);
          return res.json({ player: updatedPlayer, linked: true });
        }
      }

      // New player registration - validate username
      if (!username) {
        return res.status(400).json({ message: "Username required" });
      }

      const usernameAvailable = await storage.checkUsernameAvailable(username);
      if (!usernameAvailable) {
        return res.status(400).json({ message: "This username is already taken" });
      }

      // Create new player
      const newPlayer = await storage.createPlayer({
        userId: firebaseUid,
        username,
        email: email || null,
        firebaseUid,
        avatar: avatar || 'knight',
        language: language || 'en',
        skills: {},
        inventory: {},
        gold: 0,
        equipment: {},
        activeBuffs: [],
        equipmentDurability: {},
        inventoryDurability: {},
        tradeEnabled: 1,
        dataVersion: 1,
      });

      res.json({ player: newPlayer, linked: false });
    } catch (error) {
      console.error("Firebase register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Firebase Auth - Sync existing user (login or Google sign-in, requires Firebase token)
  app.post('/api/auth/firebase-sync', verifyFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
    try {
      const firebaseUser = req.firebaseUser!;
      const firebaseUid = firebaseUser.uid;
      const email = firebaseUser.email;
      
      console.log(`[Firebase Sync] Attempting sync for uid=${firebaseUid}, email=${email}`);

      // Check if player exists with this Firebase UID
      let player = await storage.getPlayerByFirebaseUid(firebaseUid);
      if (player) {
        if (player.isBanned === 1) {
          return res.status(403).json({ error: "Account banned", reason: player.banReason });
        }
        console.log(`[Firebase Sync] Found player by firebaseUid: ${player.id} (${player.username})`);
        return res.json({ player, needsOnboarding: false });
      }

      // Email-based account re-linking: if user deleted Firebase account and re-registered
      // with the same email, automatically link the existing player to the new Firebase UID.
      // Firebase token verification already proves email ownership.
      if (email) {
        const playerByEmail = await storage.getPlayerByEmail(email);
        if (playerByEmail) {
          if (playerByEmail.isBanned === 1) {
            return res.status(403).json({ error: "Account banned", reason: playerByEmail.banReason });
          }
          console.log(`[Firebase Sync] Re-linking verified email=${email}, firebaseUid: ${playerByEmail.firebaseUid} -> ${firebaseUid}`);
          await storage.updatePlayer(playerByEmail.id, { firebaseUid, userId: firebaseUid });
          const updatedPlayer = await storage.getPlayer(playerByEmail.id);
          return res.json({ player: updatedPlayer, needsOnboarding: false });
        }
      }

      console.log(`[Firebase Sync] No existing player found, needs onboarding`);
      res.json({ needsOnboarding: true, firebaseUid, email });
    } catch (error) {
      console.error("Firebase sync error:", error);
      res.status(500).json({ message: "Sync failed" });
    }
  });

  // Firebase Auth - Delete player account (requires Firebase token verification)
  app.delete('/api/auth/firebase-delete-account', verifyFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
    try {
      const firebaseUser = req.firebaseUser!;
      const firebaseUid = firebaseUser.uid;
      
      console.log(`[Delete Account] Attempting to delete account for uid=${firebaseUid}`);

      // Find player by Firebase UID
      const player = await storage.getPlayerByFirebaseUid(firebaseUid);
      if (!player) {
        console.log(`[Delete Account] No player found for firebaseUid=${firebaseUid}`);
        return res.status(404).json({ message: "Player not found" });
      }

      console.log(`[Delete Account] Found player ${player.id} (${player.username}), deleting...`);

      // Delete all player data from database
      const success = await storage.deletePlayerCompletely(player.id);
      if (!success) {
        console.error(`[Delete Account] Failed to delete player ${player.id}`);
        return res.status(500).json({ message: "Failed to delete player data" });
      }

      console.log(`[Delete Account] Successfully deleted player ${player.id} (${player.username})`);
      res.json({ success: true, message: "Account deleted successfully" });
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Config endpoint - returns environment info for client
  const RELEASE_NOTES: Record<string, string[]> = {
    '2026-03-09-v9': [
      'All orphan equipment items are now obtainable as rare monster drops',
      'Removed 16 duplicate items (underscore-ID variants of staves and shields)',
      'Rebalanced region armor sets (Verdant, Quarry, Dunes, Obsidian) — now ~15-25% stronger than best craftable gear at their level tier',
      'Added 33 new monster drop entries across all regions (0.1-0.3% drop rates)',
      'Special weapons (Shadow Dagger, Sun Blade, Drake Staff, etc.) now drop from thematically appropriate monsters',
      'Orphan items like Steel Buckler, Spider Queen Staff, Mummy Lord Staff, and Orc Shaman Staff assigned to fitting monsters',
    ],
  };

  app.get('/api/config', (req, res) => {
    res.json({
      isDevelopment: process.env.NODE_ENV === 'development',
      appVersion: '2026-03-09-v11',
      releaseNotes: RELEASE_NOTES,
    });
  });

  // DEV MODE ONLY: Get first player without authentication (for testing)
  app.get('/api/players/dev/check', async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: 'Dev endpoint only available in development mode' });
    }
    try {
      const realPlayers = await db.select({ id: players.id }).from(players).where(eq(players.isBot, 0)).limit(1);
      if (realPlayers.length === 0) {
        return res.json({ onboardingRequired: true });
      }
      return res.json({ exists: true });
    } catch (error) {
      console.error("Dev check error:", error);
      res.status(500).json({ message: "Dev check failed" });
    }
  });

  app.get('/api/players/dev', async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: 'Dev endpoint only available in development mode' });
    }
    
    try {
      const targetPlayerId = req.query.playerId as string | undefined;
      let realPlayers;
      if (targetPlayerId) {
        realPlayers = await db.select().from(players).where(eq(players.id, targetPlayerId)).limit(1);
      } else {
        realPlayers = await db.select().from(players).where(eq(players.isBot, 0)).orderBy(desc(players.totalLevel)).limit(1);
      }
      if (realPlayers.length === 0) {
        return res.json({ onboardingRequired: true });
      }
      
      let player = realPlayers[0];
      
      await migrateSmithingToCrafting(player);
      await migrateAddHuntingSkill(player);
      
      const { offlineProgress, combatOfflineProgress, firemakingOfflineProgress, sessionToken, onlinePlayerCount, offlineAchievements, offlineAchievementGold, offlineQueueSteps } = await loginFinalization(player);
      console.log(`[Dev Auth] offlineProgress result: task=${!!offlineProgress}, combat=${!!combatOfflineProgress}, firemaking=${!!firemakingOfflineProgress}`);

      res.json({ player, offlineProgress, combatOfflineProgress, firemakingOfflineProgress, sessionToken, onlinePlayerCount, offlineAchievements, offlineAchievementGold, offlineQueueSteps });
    } catch (error) {
      console.error("Dev auth error:", error);
      res.status(500).json({ message: "Dev auth failed" });
    }
  });

  app.get('/api/players/dev/list', async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: 'Dev endpoint only available in development mode' });
    }
    try {
      const allPlayers = await db.select({
        id: players.id,
        username: players.username,
        avatar: players.avatar,
        totalLevel: players.totalLevel,
        isBot: players.isBot,
        currentRegion: players.currentRegion,
      }).from(players).orderBy(asc(players.isBot), desc(players.totalLevel));
      res.json({ players: allPlayers });
    } catch (error) {
      console.error("Dev list error:", error);
      res.status(500).json({ message: "Dev list failed" });
    }
  });

  app.post('/api/players/dev/switch', async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: 'Dev endpoint only available in development mode' });
    }
    try {
      const { playerId } = req.body;
      if (!playerId) {
        return res.status(400).json({ message: 'playerId required' });
      }
      const targetPlayers = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
      if (targetPlayers.length === 0) {
        return res.status(404).json({ message: 'Player not found' });
      }
      let player = targetPlayers[0];
      await migrateSmithingToCrafting(player);
      await migrateAddHuntingSkill(player);
      const { offlineProgress, combatOfflineProgress, firemakingOfflineProgress, sessionToken, onlinePlayerCount, offlineAchievements, offlineAchievementGold, offlineQueueSteps } = await loginFinalization(player);
      console.log(`[Dev Switch] Switched to ${player.username} (${player.id})`);
      res.json({ player, offlineProgress, combatOfflineProgress, firemakingOfflineProgress, sessionToken, onlinePlayerCount, offlineAchievements, offlineAchievementGold, offlineQueueSteps });
    } catch (error) {
      console.error("Dev switch error:", error);
      res.status(500).json({ message: "Dev switch failed" });
    }
  });

  // Firebase Auth - Quick check if player exists (does NOT calculate offline progress)
  // Used by App.tsx to determine routing before GameContext loads
  app.get('/api/players/firebase/check', verifyFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
    try {
      const firebaseUser = req.firebaseUser!;
      console.log(`[Firebase Check] START: uid=${firebaseUser.uid}, email=${firebaseUser.email}`);
      
      let player = await storage.getPlayerByFirebaseUid(firebaseUser.uid);
      console.log(`[Firebase Check] getPlayerByFirebaseUid: found=${!!player}, playerId=${player?.id}, username=${player?.username}`);
      
      if (!player && firebaseUser.email) {
        console.log(`[Firebase Check] Player not found by UID, trying email lookup: ${firebaseUser.email}`);
        const playerByEmail = await storage.getPlayerByEmail(firebaseUser.email);
        console.log(`[Firebase Check] getPlayerByEmail: found=${!!playerByEmail}, playerId=${playerByEmail?.id}, username=${playerByEmail?.username}`);
        if (playerByEmail) {
          if (playerByEmail.isBanned === 1) {
            console.log(`[Firebase Check] Player BANNED: ${playerByEmail.username}`);
            return res.status(403).json({ error: "Account banned", reason: playerByEmail.banReason });
          }
          console.log(`[Firebase Check] Re-linking player ${playerByEmail.username} (email=${firebaseUser.email}) to new firebaseUid=${firebaseUser.uid}`);
          await storage.updatePlayer(playerByEmail.id, { firebaseUid: firebaseUser.uid, userId: firebaseUser.uid });
          player = await storage.getPlayer(playerByEmail.id);
          console.log(`[Firebase Check] Re-link complete, player refetched: found=${!!player}`);
        }
      }

      if (!player) {
        console.log(`[Firebase Check] No player found - returning onboardingRequired`);
        return res.json({ onboardingRequired: true });
      }
      
      console.log(`[Firebase Check] SUCCESS: player=${player.username} (${player.id}), returning exists=true`);
      res.json({ exists: true });
    } catch (error) {
      console.error("[Firebase Check] ERROR:", error);
      res.status(500).json({ message: "Failed to check player" });
    }
  });

  // Firebase Auth - Get player by Firebase UID (requires Firebase token)
  // Also calculates offline progress if player was away (mirrors /api/players/auth logic)
  app.get('/api/players/firebase', verifyFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
    try {
      const firebaseUser = req.firebaseUser!;
      console.log(`[Firebase Auth] START: uid=${firebaseUser.uid}, email=${firebaseUser.email}, isSync=${req.query.isSync}`);
      
      console.log(`[Firebase Auth] Step 1: Looking up player by Firebase UID...`);
      let player = await storage.getPlayerByFirebaseUid(firebaseUser.uid);
      console.log(`[Firebase Auth] Step 1 result: found=${!!player}, playerId=${player?.id}, username=${player?.username}`);
      
      if (!player && firebaseUser.email) {
        console.log(`[Firebase Auth] Step 2: Player not found by UID, trying email lookup: ${firebaseUser.email}`);
        const playerByEmail = await storage.getPlayerByEmail(firebaseUser.email);
        console.log(`[Firebase Auth] Step 2 result: found=${!!playerByEmail}, playerId=${playerByEmail?.id}, username=${playerByEmail?.username}, firebaseUid=${playerByEmail?.firebaseUid}`);
        if (playerByEmail) {
          if (playerByEmail.isBanned === 1) {
            console.log(`[Firebase Auth] Player BANNED: ${playerByEmail.username}`);
            return res.status(403).json({ error: "Account banned", reason: playerByEmail.banReason });
          }
          console.log(`[Firebase Auth] Re-linking player ${playerByEmail.username} (email=${firebaseUser.email}) to new firebaseUid=${firebaseUser.uid}`);
          await storage.updatePlayer(playerByEmail.id, { firebaseUid: firebaseUser.uid, userId: firebaseUser.uid });
          player = await storage.getPlayer(playerByEmail.id);
          console.log(`[Firebase Auth] Re-link complete, player refetched: found=${!!player}`);
        }
      }

      if (!player) {
        console.log(`[Firebase Auth] No player found - returning onboardingRequired`);
        return res.json({ onboardingRequired: true });
      }

      if (player.isBanned === 1) {
        console.log(`[Firebase Auth] Player BANNED: ${player.username}`);
        return res.status(403).json({ error: "Account banned", reason: player.banReason });
      }

      console.log(`[Firebase Auth] Step 3: Running migrations for player ${player.username}...`);
      try {
        await migrateSmithingToCrafting(player);
        console.log(`[Firebase Auth] Step 3a: migrateSmithingToCrafting done`);
      } catch (migErr) {
        console.error(`[Firebase Auth] Step 3a FAILED: migrateSmithingToCrafting error:`, migErr);
      }
      try {
        await migrateAddHuntingSkill(player);
        console.log(`[Firebase Auth] Step 3b: migrateAddHuntingSkill done`);
      } catch (migErr) {
        console.error(`[Firebase Auth] Step 3b FAILED: migrateAddHuntingSkill error:`, migErr);
      }

      console.log(`[Firebase Auth] Step 4: Player state:`, {
        playerId: player.id,
        username: player.username,
        currentHP: player.currentHitpoints,
        hasActiveTask: !!player.activeTask,
        activeTaskType: (player.activeTask as any)?.skillId,
        hasActiveCombat: !!player.activeCombat,
        gold: player.gold,
        totalLevel: player.totalLevel,
      });

      const isSync = req.query.isSync === 'true';
      const { offlineProgress, combatOfflineProgress, firemakingOfflineProgress, sessionToken, onlinePlayerCount, offlineAchievements, offlineAchievementGold, offlineQueueSteps } = await loginFinalization(player, isSync);

      if (isSync) {
        const existingToken = req.headers['x-session-token'] as string;
        if (existingToken) {
        }
      }

      console.log(`[Firebase Auth] SUCCESS: Returning player data for ${player.username} (${player.id})`);
      res.json({ player, offlineProgress, combatOfflineProgress, firemakingOfflineProgress, sessionToken, onlinePlayerCount, offlineAchievements, offlineAchievementGold, offlineQueueSteps });
    } catch (error) {
      console.error("[Firebase Auth] FATAL ERROR:", error);
      console.error("[Firebase Auth] Error stack:", (error as Error)?.stack);
      res.status(500).json({ message: "Failed to fetch player" });
    }
  });

  // Firebase Auth - Logout
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const sessionToken = req.headers['x-session-token'] as string;
      if (sessionToken) {
        const player = await storage.getPlayerBySessionToken(sessionToken);
        if (player) {
          let partySnapshotAtLogout = null;
          try {
            const [membership] = await db.select()
              .from(partyMembers)
              .where(eq(partyMembers.playerId, player.id));
            
            if (membership) {
              const allMembers = await db.select({
                playerId: partyMembers.playerId,
                role: partyMembers.role,
                cachedWeaponType: partyMembers.cachedWeaponType,
              })
                .from(partyMembers)
                .where(eq(partyMembers.partyId, membership.partyId));
              
              const memberDetails = await Promise.all(
                allMembers.filter(m => m.playerId !== player.id).map(async (m) => {
                  const memberPlayer = await storage.getPlayer(m.playerId);
                  return {
                    playerId: m.playerId,
                    playerName: memberPlayer?.username || 'Unknown',
                    role: m.role,
                    cachedWeaponType: m.cachedWeaponType,
                  };
                })
              );
              
              partySnapshotAtLogout = {
                partyId: membership.partyId,
                members: memberDetails,
                snapshotAt: Date.now(),
              };
            }
          } catch (e) {
            console.error('[Logout] Party snapshot error:', e);
          }
          
          await storage.updatePlayer(player.id, {
            lastLogoutAt: new Date(),
            isOnline: 0,
            partySnapshotAtLogout,
          });
          console.log(`[Logout] Player ${player.id} logged out, lastLogoutAt set`);
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Check if player exists for authenticated user (returns player or onboardingRequired)
  // Also calculates offline progress if player was away
  app.get("/api/players/auth", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.json({ onboardingRequired: true });
      }

      // Migrate smithing -> crafting (one-time migration per player)
      await migrateSmithingToCrafting(player);
      // Add hunting skill if missing
      await migrateAddHuntingSkill(player);

      const { offlineProgress, combatOfflineProgress, firemakingOfflineProgress, sessionToken, onlinePlayerCount, offlineAchievements, offlineAchievementGold, offlineQueueSteps } = await loginFinalization(player);
      (req.session as any).gameSessionToken = sessionToken;
      
      res.json({ ...player, offlineProgress, combatOfflineProgress, firemakingOfflineProgress, sessionToken, onlinePlayerCount, offlineAchievements, offlineAchievementGold, offlineQueueSteps });
    } catch (error) {
      console.error("Error in GET /api/players/auth:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Check if session is still valid (called periodically by frontend)
  // Supports both Replit Auth users and guest users via x-session-token header
  app.get("/api/players/check-session", async (req: any, res) => {
    try {
      const guestSessionToken = req.headers['x-session-token'] as string;
      const clientToken = req.query.token as string || guestSessionToken;
      
      if (!clientToken) {
        return res.json({ valid: false, reason: "no_token" });
      }

      // Try guest authentication first via session token
      if (guestSessionToken) {
        const guestPlayer = await storage.getPlayerBySessionToken(guestSessionToken);
        if (guestPlayer) {
          if (guestPlayer.isBanned === 1) {
            return res.json({ valid: false, reason: "banned" });
          }
          return res.json({ valid: true });
        }
        return res.json({ valid: false, reason: "session_invalidated" });
      }

      if (!req.user?.claims?.sub) {
        return res.json({ valid: false, reason: "no_token" });
      }
      
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) {
        return res.json({ valid: false, reason: "no_player" });
      }

      if (player.isBanned === 1) {
        return res.json({ valid: false, reason: "banned" });
      }

      const serverToken = await storage.getSessionToken(player.id);
      
      if (serverToken === null) {
        return res.json({ valid: true });
      }
      
      if (serverToken !== clientToken) {
        return res.json({ valid: false, reason: "session_invalidated" });
      }

      res.json({ valid: true });
    } catch (error) {
      console.error("Error in GET /api/players/check-session:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Guest session endpoint - load existing guest player by session token
  app.get("/api/players/guest-session", async (req: any, res) => {
    try {
      const sessionToken = req.headers['x-session-token'] as string;
      
      if (!sessionToken) {
        return res.status(401).json({ error: "Session token required" });
      }
      
      const player = await storage.getPlayerBySessionToken(sessionToken);
      if (!player) {
        return res.status(401).json({ error: "Invalid session token" });
      }
      
      const isSync = req.query.isSync === 'true';
      const { offlineProgress, combatOfflineProgress, firemakingOfflineProgress, sessionToken: newToken, onlinePlayerCount, offlineAchievements, offlineAchievementGold, offlineQueueSteps } = await loginFinalization(player, isSync);
      
      res.json({
        player,
        sessionToken: isSync ? sessionToken : newToken,
        offlineProgress,
        combatOfflineProgress,
        firemakingOfflineProgress,
        onlinePlayerCount,
        offlineAchievements,
        offlineAchievementGold,
        offlineQueueSteps,
      });
    } catch (error) {
      console.error("Error in GET /api/players/guest-session:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Force logout - clears session and redirects to login
  app.get("/api/logout", async (req: any, res) => {
    try {
      const sessionToken = req.headers['x-session-token'] as string;
      if (sessionToken) {
        const player = await storage.getPlayerBySessionToken(sessionToken);
        if (player) {
          await storage.updatePlayer(player.id, { lastLogoutAt: new Date(), isOnline: 0 });
        }
      }
    } catch (e) {}
    req.logout?.(() => {});
    req.session?.destroy(() => {});
    res.redirect("/");
  });
  
  // DEBUG: Test offline progress calculation for a specific player (REMOVE IN PRODUCTION)
  app.get("/api/debug/offline-progress/:playerId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const playerId = req.params.playerId;
      const requestingPlayer = await storage.getPlayerByUserId(userId);
      if (!requestingPlayer || requestingPlayer.id !== playerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      const offlineDurationMs = 60 * 60 * 1000;
      const result = await calculateOfflineProgress(player, offlineDurationMs);
      
      if (Object.keys(result.playerUpdates).length > 0) {
        await storage.updatePlayer(playerId, result.playerUpdates);
      }
      
      res.json({
        hasActiveTask: !!player.activeTask,
        hasActiveCombat: !!player.activeCombat,
        activeTask: player.activeTask,
        offlineProgress: result.offlineProgress,
        combatOfflineProgress: result.combatOfflineProgress,
        playerUpdates: result.playerUpdates,
      });
    } catch (error) {
      console.error("[DEBUG] Error:", error);
      res.status(500).json({ error: String(error) });
    }
  });
  
  // Helper function to format duration
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

  // Create new player (for onboarding)
  app.post("/api/players", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { username, avatar } = req.body;
      
      if (!username || username.length < 3 || username.length > 20) {
        return res.status(400).json({ error: "Username must be 3-20 characters" });
      }

      // Check if user already has a player
      const existingPlayer = await storage.getPlayerByUserId(userId);
      if (existingPlayer) {
        return res.status(400).json({ error: "Player already exists" });
      }

      // Check username availability
      const isAvailable = await storage.checkUsernameAvailable(username);
      if (!isAvailable) {
        return res.status(400).json({ error: "Username already taken" });
      }

      const defaultSkills = {
        woodcutting: { xp: 0, level: 1 },
        mining: { xp: 0, level: 1 },
        fishing: { xp: 0, level: 1 },
        hunting: { xp: 0, level: 1 },
        crafting: { xp: 0, level: 1 },
        cooking: { xp: 0, level: 1 },
        alchemy: { xp: 0, level: 1 },
        firemaking: { xp: 0, level: 1 },
        attack: { xp: 0, level: 1 },
        strength: { xp: 0, level: 1 },
        defence: { xp: 0, level: 1 },
        hitpoints: { xp: 1154, level: 10 },
      };
      
      const player = await storage.createPlayer({
        userId,
        username,
        avatar: avatar || 'knight',
        skills: defaultSkills,
        inventory: {},
        activeTask: null,
      });

      res.json(player);
    } catch (error) {
      console.error("Error in POST /api/players:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Check username availability (public endpoint - no auth required)
  app.get("/api/players/check-username", async (req: any, res) => {
    try {
      const username = req.query.username as string;
      
      if (!username || username.length < 3) {
        return res.json({ available: false, error: "Username too short" });
      }

      const isAvailable = await storage.checkUsernameAvailable(username);
      res.json({ available: isAvailable });
    } catch (error) {
      console.error("Error in /api/players/check-username:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Heartbeat - updates lastSeen timestamp
  app.post("/api/heartbeat", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Only bump lastSeen when there is active work — same logic as /api/poll.
      // If the queue has finished and neither activeTask nor activeCombat exists, we
      // deliberately stop updating lastSeen so that the login finalization can use
      // lastClientTick (from the last real scheduler tick) as the correct offline anchor.
      const hasActiveWork = !!(player.activeTask || player.activeCombat);
      if (hasActiveWork) {
        await storage.updateLastSeen(player.id);
      }
      res.json({ success: true, lastSeen: new Date().toISOString() });
    } catch (error) {
      console.error("Error in POST /api/heartbeat:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Called by client when the 6-hour idle limit fires on the client side.
  // Records lastLogoutAt (timestamp of expiry) so the next login finalization
  // has a reliable anchor for offline progress. Does NOT set isOnline: 0 because
  // the player's session is still active — they just hit the idle limit.
  app.post("/api/tasks/idle-limit-expired", authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const now = new Date();
      const updates: Record<string, unknown> = {
        lastLogoutAt: now,
        activeTask: null,
        activeCombat: null,
      };
      await storage.updatePlayer(player.id, updates);
      res.json({ success: true, lastLogoutAt: now.toISOString() });
    } catch (error) {
      console.error("Error in POST /api/tasks/idle-limit-expired:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Reset idle limit timer (restarts the 6-hour countdown for both task and combat)
  app.post("/api/tasks/reset", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const idleLimitMs = 6 * 60 * 60 * 1000;
      const now = Date.now();
      const newLimitExpiresAt = now + idleLimitMs;
      
      const updates: Record<string, unknown> = {};
      
      if (player.activeTask) {
        const activeTask = player.activeTask as Record<string, unknown>;
        if (!(activeTask as any).queueDurationMs) {
          updates.activeTask = {
            ...activeTask,
            limitExpiresAt: newLimitExpiresAt,
          };
        }
      }
      
      if (player.activeCombat) {
        const activeCombat = player.activeCombat as Record<string, unknown>;
        if (!(activeCombat as any).queueDurationMs) {
          updates.activeCombat = {
            ...activeCombat,
            limitExpiresAt: newLimitExpiresAt,
          };
        }
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No active task or combat to reset" });
      }
      
      await storage.updatePlayer(player.id, updates);
      
      res.json({ success: true, limitExpiresAt: newLimitExpiresAt });
    } catch (error) {
      console.error("Error in POST /api/tasks/reset:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/queue/add", authenticatePlayer, validateSessionToken, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: "Not authenticated" });

      const item = req.body;
      if (!item || typeof item !== 'object') return res.status(400).json({ error: "Invalid queue item" });

      const { ALLOWED_QUEUE_DURATIONS, maxQueueSlots, isQueueV2Player, maxQueueTimeMs, getUsedQueueTimeMs } = await import('@shared/schema');

      if (!['skill', 'combat', 'study'].includes(item.type)) {
        return res.status(400).json({ error: "Invalid queue item type" });
      }

      const badges = await storage.getPlayerBadges(player.id);
      const badgeIds = badges.map((b: any) => b.badge?.id || b.badgeId);
      const isV2 = isQueueV2Player(badgeIds, player.isTester);

      const currentQueue = (player.taskQueue as QueueItem[]) || [];

      if (isV2) {
        const FIFTEEN_MIN = 15 * 60 * 1000;
        if (!item.durationMs || item.durationMs < FIFTEEN_MIN || item.durationMs > 7 * 60 * 60 * 1000 || item.durationMs % FIFTEEN_MIN !== 0) {
          return res.status(400).json({ error: "Invalid duration. Must be in 15-minute increments." });
        }
        const maxTime = maxQueueTimeMs(badgeIds);
        const usedTime = getUsedQueueTimeMs(
          currentQueue,
          player.activeTask as any,
          player.activeCombat as any,
        );
        if (usedTime + item.durationMs > maxTime) {
          return res.status(400).json({ error: "Time budget exceeded" });
        }
      } else {
        if (!ALLOWED_QUEUE_DURATIONS.includes(item.durationMs)) {
          return res.status(400).json({ error: "Invalid duration" });
        }
        const maxSlots = maxQueueSlots(badgeIds);
        if (currentQueue.length >= maxSlots) {
          return res.status(400).json({ error: "Queue is full", maxSlots });
        }
      }

      const queueItem: Partial<QueueItem> & { id: string; type: 'skill' | 'combat'; name: string; durationMs: number; addedAt: number; status: 'pending' } = {
        id: randomUUID(),
        type: item.type,
        name: item.name || 'Unknown',
        durationMs: item.durationMs,
        addedAt: Date.now(),
        status: 'pending' as const,
      };

      if (item.type === 'skill') {
        if (!item.skillId) {
          return res.status(400).json({ error: "Missing skillId for skill queue item" });
        }
        const recipeSkills = ['crafting', 'alchemy', 'cooking'];
        if (recipeSkills.includes(item.skillId) && item.recipeId) {
          const recipe = await storage.getGameRecipe(item.recipeId);
          if (!recipe || recipe.skill !== item.skillId) {
            return res.status(400).json({ error: "Unknown recipe" });
          }
          queueItem.skillId = item.skillId;
          queueItem.recipeId = recipe.id;
          queueItem.name = recipe.resultItemId;
          queueItem.xpReward = recipe.xpReward;
          queueItem.actionDuration = recipe.craftTime;
          queueItem.materials = recipe.materials as any;
          if (item.targetQuantity && typeof item.targetQuantity === 'number' && item.targetQuantity > 0) {
            queueItem.targetQuantity = Math.floor(item.targetQuantity);
          }
        } else {
          if (item.actionId === undefined) {
            return res.status(400).json({ error: "Missing actionId for skill queue item" });
          }
          const actions = await storage.getSkillActionsBySkill(item.skillId);
          const action = actions.find((a: any) => a.id === item.actionId);
          if (!action) {
            return res.status(400).json({ error: "Unknown skill action" });
          }
          queueItem.skillId = item.skillId;
          queueItem.actionId = action.id as any;
          queueItem.name = action.name || item.name;
          queueItem.xpReward = action.xpReward;
          queueItem.actionDuration = action.duration;
          queueItem.requiredBait = action.requiredBait;
          queueItem.baitAmount = action.baitAmount;
          queueItem.itemId = action.itemId;
          queueItem.materials = (action as any).materials;

          // Persist firemaking batch metadata if present (staging flow)
          if (item.skillId === 'firemaking') {
            // Validate and persist primary slot index (0-5)
            if (typeof item.firemakingPrimarySlotIndex === 'number' &&
                Number.isInteger(item.firemakingPrimarySlotIndex) &&
                item.firemakingPrimarySlotIndex >= 0 &&
                item.firemakingPrimarySlotIndex <= 5) {
              queueItem.firemakingPrimarySlotIndex = item.firemakingPrimarySlotIndex;
            }
            // Validate and persist extra staged slots
            if (Array.isArray(item.firemakingExtraSlots)) {
              const seenSlotIndices = new Set<number>();
              if (typeof item.firemakingPrimarySlotIndex === 'number') {
                seenSlotIndices.add(item.firemakingPrimarySlotIndex);
              }
              const validExtraSlots: typeof item.firemakingExtraSlots = [];
              for (const extra of item.firemakingExtraSlots) {
                if (
                  extra &&
                  typeof extra === 'object' &&
                  typeof extra.slotIndex === 'number' &&
                  Number.isInteger(extra.slotIndex) &&
                  extra.slotIndex >= 0 &&
                  extra.slotIndex <= 5 &&
                  !seenSlotIndices.has(extra.slotIndex) &&
                  typeof extra.logId === 'string' &&
                  typeof extra.logName === 'string' &&
                  typeof extra.actionId === 'number' &&
                  typeof extra.itemId === 'string' &&
                  typeof extra.xpReward === 'number' &&
                  typeof extra.actionDuration === 'number'
                ) {
                  seenSlotIndices.add(extra.slotIndex);
                  validExtraSlots.push({
                    slotIndex: extra.slotIndex,
                    logId: extra.logId,
                    logName: extra.logName,
                    actionId: extra.actionId,
                    itemId: extra.itemId,
                    xpReward: extra.xpReward,
                    actionDuration: extra.actionDuration,
                  });
                }
              }
              if (validExtraSlots.length > 0) {
                queueItem.firemakingExtraSlots = validExtraSlots;
              }
            }
          }
        }
      } else if (item.type === 'combat') {
        if (!item.monsterId) {
          return res.status(400).json({ error: "Missing monsterId for combat queue item" });
        }
        const monster = await storage.getGameMonster(item.monsterId);
        if (!monster) {
          return res.status(400).json({ error: "Unknown monster" });
        }
        queueItem.monsterId = item.monsterId;
        queueItem.name = (monster as any).name || item.name;
        queueItem.monsterData = {
          maxHp: (monster as any).maxHitpoints || 10,
          attackLevel: (monster as any).attackLevel || 1,
          strengthLevel: (monster as any).strengthLevel || 1,
          defenceLevel: (monster as any).defenceLevel || 1,
          attackBonus: (monster as any).attackBonus || 0,
          strengthBonus: (monster as any).strengthBonus || 0,
          attackSpeed: (monster as any).attackSpeed || 3000,
          loot: (monster as any).loot || [],
          xpReward: (monster as any).xpReward || { attack: 0, strength: 0, defence: 0, hitpoints: 0 },
          skills: (monster as any).skills,
        };
      } else if (item.type === 'study') {
        if (!item.studyItemId || typeof item.studyItemId !== 'string') {
          return res.status(400).json({ error: "Missing studyItemId for study queue item" });
        }
        if (typeof item.xpReward !== 'number' || item.xpReward <= 0) {
          return res.status(400).json({ error: "Invalid xpReward for study queue item" });
        }
        const playerInventory = (player.inventory as Record<string, number>) || {};
        if (!playerInventory[item.studyItemId] || playerInventory[item.studyItemId] < 1) {
          return res.status(400).json({ error: "Item not in inventory" });
        }
        queueItem.studyItemId = item.studyItemId;
        queueItem.name = item.name || item.studyItemId;
        queueItem.xpReward = item.xpReward;
        queueItem.actionDuration = 10000;
        queueItem.skillId = 'studying';
      }

      const updatedQueue = [...currentQueue, queueItem];
      await storage.updatePlayer(player.id, { taskQueue: updatedQueue });

      if (isV2) {
        const maxTime = maxQueueTimeMs(badgeIds);
        const usedTime = getUsedQueueTimeMs(
          updatedQueue,
          player.activeTask as any,
          player.activeCombat as any,
        );
        res.json({ success: true, queue: updatedQueue, isV2: true, maxTimeMs: maxTime, usedTimeMs: usedTime });
      } else {
        const maxSlots = maxQueueSlots(badgeIds);
        res.json({ success: true, queue: updatedQueue, maxSlots });
      }
    } catch (error) {
      console.error("Error in POST /api/queue/add:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/queue/:itemId", authenticatePlayer, validateSessionToken, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: "Not authenticated" });

      const currentQueue = (player.taskQueue as QueueItem[]) || [];
      const updatedQueue = currentQueue.filter((item) => item.id !== req.params.itemId);
      await storage.updatePlayer(player.id, { taskQueue: updatedQueue });
      res.json({ success: true, queue: updatedQueue });
    } catch (error) {
      console.error("Error in DELETE /api/queue/:itemId:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/queue", authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: "Not authenticated" });

      const { maxQueueSlots, isQueueV2Player, maxQueueTimeMs, getUsedQueueTimeMs } = await import('@shared/schema');
      const badges = await storage.getPlayerBadges(player.id);
      const badgeIds = badges.map((b: any) => b.badge?.id || b.badgeId);
      const queue = (player.taskQueue as QueueItem[]) || [];
      const isV2 = isQueueV2Player(badgeIds, player.isTester);

      if (isV2) {
        const maxTime = maxQueueTimeMs(badgeIds);
        const usedTime = getUsedQueueTimeMs(
          queue,
          player.activeTask as any,
          player.activeCombat as any,
        );
        res.json({ queue, isV2: true, maxTimeMs: maxTime, usedTimeMs: usedTime });
      } else {
        res.json({ queue, maxSlots: maxQueueSlots(badgeIds) });
      }
    } catch (error) {
      console.error("Error in GET /api/queue:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/queue/clear", authenticatePlayer, validateSessionToken, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: "Not authenticated" });

      await storage.updatePlayer(player.id, { taskQueue: [] });
      res.json({ success: true, queue: [] });
    } catch (error) {
      console.error("Error in POST /api/queue/clear:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/queue/reorder", authenticatePlayer, validateSessionToken, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: "Not authenticated" });

      const { itemId, direction } = req.body;
      if (!itemId || !['up', 'down'].includes(direction)) {
        return res.status(400).json({ error: "itemId and direction ('up' | 'down') are required" });
      }

      const allItems = (player.taskQueue as QueueItem[]) || [];

      const itemOrigIdx = allItems.findIndex((item) => item.id === itemId);
      if (itemOrigIdx === -1 || allItems[itemOrigIdx].status !== 'pending') {
        return res.status(404).json({ error: "Queue item not found or not reorderable" });
      }

      const pendingIndices = allItems
        .map((item, i) => (item.status === 'pending' ? i : -1))
        .filter((i) => i !== -1);

      const pendingPos = pendingIndices.indexOf(itemOrigIdx);
      if (direction === 'up' && pendingPos === 0) {
        return res.status(400).json({ error: "Item is already at the top" });
      }
      if (direction === 'down' && pendingPos === pendingIndices.length - 1) {
        return res.status(400).json({ error: "Item is already at the bottom" });
      }

      const swapOrigIdx = direction === 'up'
        ? pendingIndices[pendingPos - 1]
        : pendingIndices[pendingPos + 1];

      const updatedQueue = [...allItems];
      [updatedQueue[itemOrigIdx], updatedQueue[swapOrigIdx]] = [updatedQueue[swapOrigIdx], updatedQueue[itemOrigIdx]];

      await storage.updatePlayer(player.id, { taskQueue: updatedQueue });
      res.json({ success: true, queue: updatedQueue });
    } catch (error) {
      console.error("Error in PATCH /api/queue/reorder:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/queue/:itemId/duration", authenticatePlayer, validateSessionToken, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: "Not authenticated" });

      const { itemId } = req.params;
      const { durationMs } = req.body;

      const { ALLOWED_QUEUE_DURATIONS } = await import('@shared/schema');
      if (!durationMs || typeof durationMs !== 'number' || !ALLOWED_QUEUE_DURATIONS.includes(durationMs)) {
        return res.status(400).json({ error: "Invalid duration" });
      }

      const allItems = (player.taskQueue as QueueItem[]) || [];
      const itemIdx = allItems.findIndex((item) => item.id === itemId);
      if (itemIdx === -1 || allItems[itemIdx].status !== 'pending') {
        return res.status(404).json({ error: "Queue item not found or not editable" });
      }

      const updatedQueue = [...allItems];
      updatedQueue[itemIdx] = { ...updatedQueue[itemIdx], durationMs };

      await storage.updatePlayer(player.id, { taskQueue: updatedQueue });
      res.json({ success: true, queue: updatedQueue });
    } catch (error) {
      console.error("Error in PATCH /api/queue/:itemId/duration:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get leaderboard
  app.get("/api/players/leaderboard", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);
      const players = await storage.getLeaderboard(limit);
      res.json(players.map(toPublicProfile));
    } catch (error) {
      console.error("Error in /api/players/leaderboard:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get player by username (for profiles)
  app.get("/api/players/username/:username", async (req, res) => {
    try {
      const player = await storage.getPlayerByUsername(req.params.username);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const publicProfile = toPublicProfile(player);
      res.json(publicProfile);
    } catch (error) {
      console.error("Error in GET /api/players/username/:username:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Search player by username for trade (returns online status and trade enabled)
  // Supports partial case-insensitive matching
  app.get("/api/players/search", async (req, res) => {
    try {
      const username = req.query.username as string;
      if (!username || username.length < 1) {
        return res.status(400).json({ error: "Username required" });
      }

      // Search for partial matches (case-insensitive)
      const matchedPlayers = await storage.searchPlayersByUsername(username, 10);
      
      if (matchedPlayers.length === 0) {
        return res.json({ found: false, players: [] });
      }

      // Return list of matching players with online status
      const results = matchedPlayers.map(player => ({
        playerId: player.id,
        username: player.username,
        isOnline: isPlayerOnline(player.id),
        tradeEnabled: player.tradeEnabled === 1,
        totalLevel: player.totalLevel,
        avatar: player.avatar,
      }));

      res.json({
        found: true,
        players: results,
      });
    } catch (error) {
      console.error("Error in GET /api/players/search:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update trade settings
  app.patch("/api/players/:id/trade-settings", authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const { tradeEnabled } = req.body;

      if (!req.player || req.player.id !== req.params.id) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      if (typeof tradeEnabled !== 'boolean') {
        return res.status(400).json({ error: "Invalid tradeEnabled value" });
      }

      const player = await storage.updateTradeEnabled(req.params.id, tradeEnabled);

      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      res.json({ success: true, tradeEnabled: player.tradeEnabled === 1 });
    } catch (error) {
      console.error("Error in PATCH /api/players/:id/trade-settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== TRADE OFFER SYSTEM ====================
  
  app.post("/api/trades", authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: "Authentication required" });
      if (player.isGuest === 1) return res.status(403).json({ error: "Guests cannot trade" });

      const { receiverId, senderItems, senderGold, message } = req.body;
      
      if (!receiverId) return res.status(400).json({ error: "Receiver ID required" });
      if (receiverId === player.id) return res.status(400).json({ error: "Cannot trade with yourself" });
      
      const receiver = await storage.getPlayer(receiverId);
      if (!receiver) return res.status(404).json({ error: "Player not found" });
      if (receiver.tradeEnabled === 0) return res.status(400).json({ error: "Player has disabled trade offers" });
      if (receiver.isGuest === 1) return res.status(400).json({ error: "Cannot trade with guests" });

      const items = (senderItems || {}) as Record<string, number>;
      const gold = Math.max(0, Math.floor(senderGold || 0));
      
      if (Object.keys(items).length === 0 && gold === 0) {
        return res.status(400).json({ error: "Must offer at least one item or gold" });
      }
      
      if (gold > player.gold) {
        return res.status(400).json({ error: "Insufficient gold" });
      }

      const playerInventory = player.inventory as Record<string, number>;
      const cursedItems = (player.cursedItems as string[]) || [];
      const inventoryDurability = (player.inventoryDurability || {}) as Record<string, number>;
      for (const [itemId, qty] of Object.entries(items)) {
        if (!isItemTradable(itemId)) {
          return res.status(400).json({ error: `Item not tradable: ${itemId}` });
        }
        if (cursedItems.includes(itemId)) {
          return res.status(400).json({ error: `Cursed items cannot be traded: ${itemId}` });
        }
        if (isEquipmentItem(itemId)) {
          const durability = inventoryDurability[itemId] ?? 100;
          if (durability < 100) {
            return res.status(400).json({ error: "Damaged equipment cannot be traded. Repair it first." });
          }
        }
        if (qty <= 0 || !Number.isInteger(qty)) {
          return res.status(400).json({ error: "Invalid quantity" });
        }
        if ((playerInventory[itemId] || 0) < qty) {
          return res.status(400).json({ error: `Insufficient item: ${itemId}` });
        }
      }

      const activeSentOffers = await storage.getTradeOffers(player.id, 'outgoing');
      if (activeSentOffers.length >= 10) {
        return res.status(400).json({ error: "Maximum 10 active trade offers" });
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const trade = await storage.createTrade({
        senderId: player.id,
        receiverId,
        senderItems: items,
        receiverItems: {},
        senderGold: gold,
        receiverGold: 0,
        status: 'pending',
        message: message ? String(message).slice(0, 200) : null,
        expiresAt,
      });

      await storage.createNotification({
        playerId: receiverId,
        type: 'trade_offer',
        message: `${player.username} sent you a trade offer!`,
          payload: { tradeId: trade.id, senderName: player.username },
      });

      notifyTradeOffer(receiverId, player.username);

      res.json({ success: true, trade });
    } catch (error) {
      console.error("Error in POST /api/trades:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/trades", authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: "Authentication required" });

      const type = (req.query.type as string) || 'all';
      if (!['incoming', 'outgoing', 'all'].includes(type)) {
        return res.status(400).json({ error: "Invalid type" });
      }

      await storage.expireOldTrades();

      const offers = await storage.getTradeOffers(player.id, type as 'incoming' | 'outgoing' | 'all');

      const enrichedOffers = await Promise.all(offers.map(async (offer) => {
        const otherPlayerId = offer.senderId === player.id ? offer.receiverId : offer.senderId;
        const otherPlayer = await storage.getPlayer(otherPlayerId);
        return {
          ...offer,
          otherPlayerName: otherPlayer?.username || 'Unknown',
          otherPlayerAvatar: otherPlayer?.avatar || null,
          otherPlayerLevel: otherPlayer?.totalLevel || 0,
          isSender: offer.senderId === player.id,
        };
      }));

      res.json({ offers: enrichedOffers });
    } catch (error) {
      console.error("Error in GET /api/trades:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/trades/:id", authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: "Authentication required" });

      const trade = await storage.getTrade(req.params.id);
      if (!trade) return res.status(404).json({ error: "Trade not found" });
      if (trade.senderId !== player.id && trade.receiverId !== player.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const otherPlayerId = trade.senderId === player.id ? trade.receiverId : trade.senderId;
      const otherPlayer = await storage.getPlayer(otherPlayerId);

      res.json({
        ...trade,
        otherPlayerName: otherPlayer?.username || 'Unknown',
        otherPlayerAvatar: otherPlayer?.avatar || null,
        otherPlayerLevel: otherPlayer?.totalLevel || 0,
        isSender: trade.senderId === player.id,
      });
    } catch (error) {
      console.error("Error in GET /api/trades/:id:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/trades/:id/respond", authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: "Authentication required" });

      const trade = await storage.getTrade(req.params.id);
      if (!trade) return res.status(404).json({ error: "Trade not found" });
      
      if (!['pending', 'countered'].includes(trade.status)) {
        return res.status(400).json({ error: "Trade is no longer active" });
      }

      if (trade.expiresAt && new Date(trade.expiresAt) < new Date()) {
        await storage.updateTrade(trade.id, { status: 'expired' });
        return res.status(400).json({ error: "Trade has expired" });
      }

      const isReceiver = trade.receiverId === player.id;
      const isSender = trade.senderId === player.id;
      if (!isReceiver && !isSender) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { action, items, gold } = req.body;

      if (action === 'decline') {
        await storage.updateTrade(trade.id, { status: 'declined' });
        
        const otherPlayerId = isSender ? trade.receiverId : trade.senderId;
        await storage.createNotification({
          playerId: otherPlayerId,
          type: 'trade_declined',
          message: `${player.username} declined the trade offer.`,
          payload: { tradeId: trade.id },
        });

        return res.json({ success: true, status: 'declined' });
      }

      if (action === 'counter') {
        const counterItems = (items || {}) as Record<string, number>;
        const counterGold = Math.max(0, Math.floor(gold || 0));

        if (counterGold > player.gold) {
          return res.status(400).json({ error: "Insufficient gold" });
        }

        const playerInventory = player.inventory as Record<string, number>;
        const cursedItems = (player.cursedItems as string[]) || [];
        const inventoryDurability = (player.inventoryDurability || {}) as Record<string, number>;
        for (const [itemId, qty] of Object.entries(counterItems)) {
          if (!isItemTradable(itemId)) {
            return res.status(400).json({ error: `Item not tradable: ${itemId}` });
          }
          if (cursedItems.includes(itemId)) {
            return res.status(400).json({ error: `Cursed items cannot be traded: ${itemId}` });
          }
          if (isEquipmentItem(itemId)) {
            const durability = inventoryDurability[itemId] ?? 100;
            if (durability < 100) {
              return res.status(400).json({ error: "Damaged equipment cannot be traded. Repair it first." });
            }
          }
          if (qty <= 0 || !Number.isInteger(qty)) {
            return res.status(400).json({ error: "Invalid quantity" });
          }
          if ((playerInventory[itemId] || 0) < qty) {
            return res.status(400).json({ error: `Insufficient item: ${itemId}` });
          }
        }

        const updates: any = { status: 'countered', senderConfirmed: 0, receiverConfirmed: 0 };
        if (isReceiver) {
          updates.receiverItems = counterItems;
          updates.receiverGold = counterGold;
          updates.receiverConfirmed = 1;
        } else {
          updates.senderItems = counterItems;
          updates.senderGold = counterGold;
          updates.senderConfirmed = 1;
        }

        const updated = await storage.updateTrade(trade.id, updates);
        
        const otherPlayerId = isSender ? trade.receiverId : trade.senderId;
        await storage.createNotification({
          playerId: otherPlayerId,
          type: 'trade_counter',
          message: `${player.username} updated the trade offer.`,
          payload: { tradeId: trade.id },
        });

        return res.json({ success: true, trade: updated });
      }

      return res.status(400).json({ error: "Invalid action" });
    } catch (error) {
      console.error("Error in PATCH /api/trades/:id/respond:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/trades/:id/confirm", authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: "Authentication required" });

      const trade = await storage.getTrade(req.params.id);
      if (!trade) return res.status(404).json({ error: "Trade not found" });

      if (!['pending', 'countered'].includes(trade.status)) {
        return res.status(400).json({ error: "Trade is no longer active" });
      }

      if (trade.expiresAt && new Date(trade.expiresAt) < new Date()) {
        await storage.updateTrade(trade.id, { status: 'expired' });
        return res.status(400).json({ error: "Trade has expired" });
      }

      const isSender = trade.senderId === player.id;
      const isReceiver = trade.receiverId === player.id;
      if (!isSender && !isReceiver) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const playerInventory = player.inventory as Record<string, number>;
      const myItems = isSender ? (trade.senderItems as Record<string, number>) : (trade.receiverItems as Record<string, number>);
      const myGold = isSender ? trade.senderGold : trade.receiverGold;

      if (myGold > player.gold) {
        return res.status(400).json({ error: "Insufficient gold for this trade" });
      }
      for (const [itemId, qty] of Object.entries(myItems)) {
        if ((playerInventory[itemId] || 0) < qty) {
          return res.status(400).json({ error: `Insufficient item: ${itemId}` });
        }
      }

      const updates: any = {};
      if (isSender) updates.senderConfirmed = 1;
      if (isReceiver) updates.receiverConfirmed = 1;

      await storage.updateTrade(trade.id, updates);

      const updatedTrade = await storage.getTrade(trade.id);
      if (!updatedTrade) return res.status(500).json({ error: "Trade update failed" });

      if (updatedTrade.senderConfirmed === 1 && updatedTrade.receiverConfirmed === 1) {
        const result = await storage.executeTradeAtomic(trade.id);
        if (!result.success) {
          return res.status(400).json({ error: result.error || "Trade execution failed" });
        }

        await storage.createNotification({
          playerId: trade.senderId,
          type: 'trade_completed',
          message: 'Trade completed successfully!',
          payload: { tradeId: trade.id },
        });
        await storage.createNotification({
          playerId: trade.receiverId,
          type: 'trade_completed',
          message: 'Trade completed successfully!',
          payload: { tradeId: trade.id },
        });

        sendPlayerDataUpdate(trade.senderId);
        sendPlayerDataUpdate(trade.receiverId);

        return res.json({ success: true, status: 'completed', requiresRefresh: true });
      }

      const otherPlayerId = isSender ? trade.receiverId : trade.senderId;
      await storage.createNotification({
        playerId: otherPlayerId,
        type: 'trade_confirmed',
        message: `${player.username} confirmed the trade. Waiting for your confirmation.`,
        payload: { tradeId: trade.id },
      });

      return res.json({ success: true, status: 'waiting_confirmation' });
    } catch (error) {
      console.error("Error in PATCH /api/trades/:id/confirm:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/trades/:id", authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: "Authentication required" });

      const trade = await storage.getTrade(req.params.id);
      if (!trade) return res.status(404).json({ error: "Trade not found" });

      if (trade.senderId !== player.id && trade.receiverId !== player.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      if (['completed', 'cancelled', 'expired', 'declined'].includes(trade.status)) {
        return res.status(400).json({ error: "Trade is already closed" });
      }

      await storage.updateTrade(trade.id, { status: 'cancelled' });

      const otherPlayerId = trade.senderId === player.id ? trade.receiverId : trade.senderId;
      await storage.createNotification({
        playerId: otherPlayerId,
        type: 'trade_cancelled',
        message: `${player.username} cancelled the trade offer.`,
        payload: { tradeId: trade.id },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error in DELETE /api/trades/:id:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get player data
  app.get("/api/players/:id", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.id);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const publicProfile = toPublicProfile(player);
      res.json(publicProfile);
    } catch (error) {
      console.error("Error in GET /api/players/:id:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update player language
  app.patch("/api/players/:id/language", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { language } = req.body;
      
      // Verify ownership - get player by userId and check if it matches the requested id
      const playerByUser = await storage.getPlayerByUserId(userId);
      if (!playerByUser || playerByUser.id !== req.params.id) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      
      if (!language || typeof language !== 'string') {
        return res.status(400).json({ error: "Invalid language" });
      }

      const validLanguages = ['en', 'zh', 'hi', 'es', 'fr', 'ar', 'ru', 'tr'];
      if (!validLanguages.includes(language)) {
        return res.status(400).json({ error: "Invalid language code" });
      }

      const player = await storage.updatePlayer(req.params.id, { language });
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      res.json({ success: true, language: player.language });
    } catch (error) {
      console.error("Error in PATCH /api/players/:id/language:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update player's current region (travel system) with cost and time
  app.patch("/api/players/:id/region", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { regionId, testMode, useTeleportStone } = req.body;
      
      // Verify ownership
      const playerByUser = await storage.getPlayerByUserId(userId);
      if (!playerByUser || playerByUser.id !== req.params.id) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      
      if (!regionId || typeof regionId !== 'string') {
        return res.status(400).json({ error: "Invalid region ID" });
      }

      // Validate region exists and get travel info
      const regions = await storage.getAllCombatRegions();
      const validRegion = regions.find(r => r.id === regionId);
      if (!validRegion) {
        return res.status(400).json({ error: "Invalid region" });
      }

      // Check if player is in combat - can't travel while in combat
      if (playerByUser.activeCombat) {
        return res.status(400).json({ error: "Cannot travel while in combat" });
      }

      // Check if player has active task - can't travel while working
      if (playerByUser.activeTask) {
        return res.status(400).json({ error: "Cannot travel while performing a task" });
      }

      // Check if player is already traveling
      if (playerByUser.activeTravel) {
        return res.status(400).json({ error: "Already traveling" });
      }

      // Check if player is in dungeon - can't travel while in dungeon
      const activeDungeonRun = await dungeonService.getCurrentRun(playerByUser.id);
      if (activeDungeonRun) {
        return res.status(400).json({ error: "Cannot travel while in a dungeon" });
      }

      // Check skill requirements for the destination region
      const [allSkillActions, allRecipes] = await Promise.all([
        storage.getAllSkillActions(),
        storage.getAllGameRecipes(),
      ]);
      const regionSkillActions = allSkillActions.filter(a => a.regionId === regionId);
      const regionRecipes = allRecipes.filter(r => {
        const regions = (r.regionIds && Array.isArray(r.regionIds) && (r.regionIds as string[]).length > 0) ? r.regionIds as string[] : (r.regionId ? [r.regionId] : []);
        return regions.includes(regionId);
      });
      
      const skillReqs: Record<string, number> = {};
      regionSkillActions.forEach(a => {
        if (!skillReqs[a.skill] || a.levelRequired < skillReqs[a.skill]) {
          skillReqs[a.skill] = a.levelRequired;
        }
      });
      regionRecipes.forEach(r => {
        if (!skillReqs[r.skill] || r.levelRequired < skillReqs[r.skill]) {
          skillReqs[r.skill] = r.levelRequired;
        }
      });

      const playerSkills = (playerByUser.skills || {}) as Record<string, { level?: number }>;
      const isTesterPlayer = playerByUser.isTester === 1;
      const MIN_SKILLS_REQUIRED = 3;
      if (!isTesterPlayer) {
        const totalReqs = Object.keys(skillReqs).length;
        let metCount = 0;
        const failedSkills: string[] = [];
        Object.entries(skillReqs).forEach(([skill, minLevel]) => {
          const playerLevel = playerSkills[skill]?.level || 1;
          if (playerLevel >= minLevel) {
            metCount++;
          } else {
            failedSkills.push(skill);
          }
        });
        const requiredMet = Math.min(MIN_SKILLS_REQUIRED, totalReqs);
        if (metCount < requiredMet) {
          return res.status(400).json({ error: "Skill levels too low for this region", failedSkills, metCount, requiredMet });
        }
      }

      // Test mode: free and instant travel (for testers or dev mode)
      const isDev = process.env.NODE_ENV === 'development';
      const isPlayerTester = playerByUser.isTester === 1;
      const isTestModeActive = (isDev || isPlayerTester) && testMode === true;
      
      // Calculate dynamic travel cost and time based on distance (0 in test mode)
      const fromRegion = playerByUser.currentRegion || 'verdant';
      const serverTime = new Date();
      const travelCost = isTestModeActive ? 0 : calculateTravelCost(fromRegion, regionId, BASE_COST_PER_STEP, serverTime);
      const travelTime = isTestModeActive ? 0 : calculateTravelTime(fromRegion, regionId, serverTime);
      const isNight = isNightTime(serverTime);

      // Teleport Stone: instant travel using stones from inventory
      const distance = calculateTravelDistance(fromRegion, regionId);
      if (useTeleportStone && !isTestModeActive) {
        const requiredStones = distance;
        if (requiredStones <= 0) {
          return res.status(400).json({ error: "Cannot use Teleport Stone for same region" });
        }
        
        // Check inventory for Teleport Stones
        const currentInventory = playerByUser.inventory as Record<string, number> || {};
        const availableStones = currentInventory["teleport_stone"] || 0;
        
        if (availableStones < requiredStones) {
          return res.status(400).json({ 
            error: "Not enough Teleport Stones", 
            required: requiredStones, 
            available: availableStones 
          });
        }
        
        // Deduct stones and complete travel instantly (no gold cost)
        const updatedInventory = { ...currentInventory };
        updatedInventory["teleport_stone"] = availableStones - requiredStones;
        if (updatedInventory["teleport_stone"] <= 0) {
          delete updatedInventory["teleport_stone"];
        }
        
        await storage.updatePlayer(playerByUser.id, {
          currentRegion: regionId,
          inventory: updatedInventory,
          activeTravel: null,
          taskQueue: [],
        });
        
        return res.json({
          currentRegion: regionId,
          travelComplete: true,
          goldSpent: 0,
          teleportStonesUsed: requiredStones,
          testMode: false,
        });
      }

      // Check if player has enough gold (skip in test mode)
      if (!isTestModeActive && playerByUser.gold < travelCost) {
        return res.status(400).json({ error: "Not enough gold", required: travelCost, available: playerByUser.gold });
      }

      const now = Date.now();
      
      // If travel time is 0 or very short (or test mode), complete immediately
      if (travelTime <= 0) {
        const player = await storage.updatePlayer(req.params.id, { 
          currentRegion: regionId,
          gold: playerByUser.gold - travelCost,
          activeTravel: null,
          taskQueue: [],
        });
        
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }

        res.json({ 
          success: true, 
          currentRegion: player.currentRegion,
          travelComplete: true,
          goldSpent: travelCost,
          testMode: isTestModeActive,
          isNightTravel: isNight
        });
      } else {
        // Start travel with time delay
        const activeTravel = {
          targetRegion: regionId,
          startTime: now,
          endTime: now + (travelTime * 1000), // Convert seconds to ms
          cost: travelCost,
          fromRegion: playerByUser.currentRegion
        };

        const player = await storage.updatePlayer(req.params.id, { 
          gold: playerByUser.gold - travelCost,
          activeTravel: activeTravel,
          taskQueue: [],
        });
        
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }

        res.json({ 
          success: true, 
          activeTravel: activeTravel,
          travelComplete: false,
          goldSpent: travelCost,
          isNightTravel: isNight
        });
      }
    } catch (error) {
      console.error("Error in PATCH /api/players/:id/region:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Complete travel (when timer finishes) or cancel travel
  app.post("/api/players/:id/complete-travel", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const playerByUser = await storage.getPlayerByUserId(userId);
      if (!playerByUser || playerByUser.id !== req.params.id) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const activeTravel = playerByUser.activeTravel as { 
        targetRegion: string; 
        startTime: number; 
        endTime: number; 
        cost: number;
        fromRegion: string;
      } | null;

      if (!activeTravel) {
        return res.status(400).json({ error: "No active travel" });
      }

      const now = Date.now();
      
      // Check if travel time has elapsed
      if (now < activeTravel.endTime) {
        return res.status(400).json({ 
          error: "Travel not complete", 
          remainingTime: Math.ceil((activeTravel.endTime - now) / 1000)
        });
      }

      // Complete the travel
      const player = await storage.updatePlayer(req.params.id, { 
        currentRegion: activeTravel.targetRegion,
        activeTravel: null
      });
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      res.json({ 
        success: true, 
        currentRegion: player.currentRegion,
        travelComplete: true
      });
    } catch (error) {
      console.error("Error in POST /api/players/:id/complete-travel:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cancel active travel (refunds gold)
  app.post("/api/players/:id/cancel-travel", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify ownership
      const playerByUser = await storage.getPlayerByUserId(userId);
      if (!playerByUser || playerByUser.id !== req.params.id) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const activeTravel = playerByUser.activeTravel as { 
        targetRegion: string; 
        startTime: number; 
        endTime: number; 
        cost: number;
        fromRegion: string;
      } | null;

      if (!activeTravel) {
        return res.status(400).json({ error: "No active travel" });
      }

      // Refund gold and cancel travel
      const player = await storage.updatePlayer(req.params.id, { 
        gold: playerByUser.gold + activeTravel.cost,
        activeTravel: null
      });
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      res.json({ 
        success: true, 
        goldRefunded: activeTravel.cost
      });
    } catch (error) {
      console.error("Error in POST /api/players/:id/cancel-travel:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update player data (save game state) - supports both Replit and Firebase auth
  // SINGLE SESSION: Validates session token to ensure only active session can save
  app.patch("/api/players/:id", authenticatePlayer, validateSessionToken, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const authenticatedPlayer = req.player;
      if (!authenticatedPlayer) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // Security: Only allow updating the authenticated player's own data
      if (authenticatedPlayer.id !== req.params.id) {
        console.warn(`[Save] Player ${authenticatedPlayer.id} attempted to modify ${req.params.id}`);
        return res.status(403).json({ error: "Cannot modify other player's data" });
      }
      
      // SECURITY: Strip sensitive/admin-only fields before validation
      stripSensitiveFields(req.body);
      
      // Read current player BEFORE validation so we can preserve offline fields later
      const currentPlayerForOffline = authenticatedPlayer;
      
      const validation = updatePlayerSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: fromZodError(validation.error).toString() 
        });
      }

      // Get current player to track gold and inventory changes for guild bank contribution
      const currentPlayer = authenticatedPlayer;
      
      // Check dataVersion - if server has higher version (admin updated), reject save
      // This prevents client's stale state from overwriting admin changes
      const clientDataVersion = (validation.data as any).dataVersion;
      const serverDataVersion = (currentPlayer as any)?.dataVersion || 1;
      if (clientDataVersion !== undefined && clientDataVersion < serverDataVersion) {
        console.log(`[Save] Rejecting stale save for player ${currentPlayer?.id}: client v${clientDataVersion} < server v${serverDataVersion}`);
        return res.status(409).json({ 
          error: "Data version mismatch - please reload",
          serverDataVersion,
          requiresReload: true
        });
      }
      
      const previousGold = currentPlayer?.gold || 0;
      const previousInventory = (currentPlayer?.inventory as Record<string, number>) || {};
      const isInCombat = currentPlayer?.activeCombat && 
        typeof currentPlayer.activeCombat === 'object' && 
        (currentPlayer.activeCombat as any).monsterId;

      // Enforce mutual exclusivity only when STARTING a NEW activity (not when updating existing)
      // This prevents clearing activities during heartbeats/visibility change updates
      const data: any = { ...validation.data };

      // SERVER-AUTHORITATIVE GOLD: Prevent client saves from overwriting server-side gold changes
      // (e.g., market sales, trade income). Client sends lastKnownServerGold (the gold value it last
      // received from the server). We compute the delta the client earned and apply it to server's current gold.
      if (data.gold !== undefined) {
        const clientGold = data.gold as number;
        const lastKnownServerGold = (req.body.lastKnownServerGold !== undefined) 
          ? Number(req.body.lastKnownServerGold) 
          : null;
        
        if (lastKnownServerGold !== null && !isNaN(lastKnownServerGold)) {
          const clientDelta = clientGold - lastKnownServerGold;
          const serverCurrentGold = currentPlayer?.gold || 0;
          data.gold = Math.max(0, serverCurrentGold + clientDelta);
        }
      }

      if (data.inventory && typeof data.inventory === 'object') {
        const cleanedInventory = { ...data.inventory as Record<string, number> };
        for (const [key, val] of Object.entries(cleanedInventory)) {
          if (typeof val !== 'number' || val <= 0) {
            delete cleanedInventory[key];
          }
        }
        data.inventory = cleanedInventory;
      }

      if (data.inventory && data.equipment && typeof data.equipment === 'object') {
        const inv = data.inventory as Record<string, number>;
        const equip = data.equipment as Record<string, string | null>;
        const equippedItems = new Set(Object.values(equip).filter((v): v is string => !!v && v.includes('#')));
        let anomalyDetected = false;
        for (const eqItem of equippedItems) {
          if (inv[eqItem] !== undefined) {
            console.warn(`[AntiDupe] Player ${authenticatedPlayer.id} (${authenticatedPlayer.username}): "${eqItem}" found in BOTH equipment and inventory. Removing from inventory.`);
            delete inv[eqItem];
            anomalyDetected = true;
          }
        }
        if (anomalyDetected) {
          data.inventory = inv;
        }
      }

      detectSuspiciousActivity(authenticatedPlayer.id, authenticatedPlayer.username, currentPlayer, data).catch(console.error);
      
      // Get client's activity identifiers
      const clientCombatMonsterId = data.activeCombat && 
        typeof data.activeCombat === 'object' && 
        (data.activeCombat as any).monsterId;
      
      const clientTaskSkillId = data.activeTask && 
        typeof data.activeTask === 'object' && 
        (data.activeTask as any).skillId;
      
      // Get server's current activity identifiers
      const serverCombatMonsterId = currentPlayer?.activeCombat && 
        typeof currentPlayer.activeCombat === 'object' && 
        (currentPlayer.activeCombat as any).monsterId;
      
      const serverTaskSkillId = currentPlayer?.activeTask && 
        typeof currentPlayer.activeTask === 'object' && 
        (currentPlayer.activeTask as any).skillId;
      
      // Only clear other activity if this is a NEW activity start (not updating existing)
      // CRITICAL FIX: If server already has same combat/task running, client is just updating - don't clear the other
      const isStartingNewCombat = clientCombatMonsterId && clientCombatMonsterId !== serverCombatMonsterId;
      const isStartingNewTask = clientTaskSkillId && clientTaskSkillId !== serverTaskSkillId;
      
      // Block new activities while traveling
      const hasActiveTravel = currentPlayer?.activeTravel && 
        typeof currentPlayer.activeTravel === 'object' &&
        (currentPlayer.activeTravel as any).endTime > Date.now();
      
      if (hasActiveTravel && (isStartingNewCombat || isStartingNewTask)) {
        return res.status(400).json({ error: "Cannot start activity while traveling" });
      }

      // Block new activities while in dungeon
      if (isStartingNewCombat || isStartingNewTask) {
        const activeDungeonRun = await dungeonService.getCurrentRun(authenticatedPlayer.id);
        if (activeDungeonRun) {
          return res.status(400).json({ error: "Cannot start activity while in a dungeon" });
        }
      }
      
      if (isStartingNewCombat) {
        data.activeTask = null;
      } else if (isStartingNewTask) {
        data.activeCombat = null;
      }

      // Validate equipment mastery requirements for weapon changes
      if (data.equipment && typeof data.equipment === 'object') {
        const newEquipment = data.equipment as Record<string, string | null>;
        const currentEquipment = (currentPlayer?.equipment as Record<string, string | null>) || {};
        
        // Check if weapon slot is being changed
        const newWeaponId = newEquipment.weapon;
        const currentWeaponId = currentEquipment.weapon;
        
        if (newWeaponId && newWeaponId !== currentWeaponId) {
          // Look up the weapon item in the database
          const items = await storage.getAllGameItems();
          // Handle items with rarity suffix (e.g., "Bronze Sword (Uncommon)")
          const baseWeaponId = newWeaponId.replace(/\s*\([^)]*\)\s*$/, '').replace(/#[a-z0-9]+$/i, '');
          const weaponItem = items.find(i => i.id === baseWeaponId || i.id === newWeaponId);
          
          if (weaponItem && weaponItem.weaponCategory && weaponItem.masteryRequired && weaponItem.masteryRequired > 1) {
            const masteryType = mapWeaponCategoryToMasteryType(weaponItem.weaponCategory);
            if (masteryType) {
              const fieldName = getMasteryFieldName(masteryType);
              const playerMasteryXp = (currentPlayer as any)?.[fieldName] || 0;
              const playerMasteryLevel = getMasteryLevelFromXp(playerMasteryXp);
              
              if (playerMasteryLevel < weaponItem.masteryRequired) {
                return res.status(400).json({ 
                  error: "Mastery requirement not met",
                  masteryRequired: weaponItem.masteryRequired,
                  playerMasteryLevel
                });
              }
            }
          }
        }
      }

      if (currentPlayerForOffline?.lastLogoutAt) {
        data.lastLogoutAt = new Date();
        data.lastSeen = new Date();
      }

      // SERVER-AUTHORITATIVE itemModifications: prefer server version per key.
      // For each itemId key: if the server has a higher enhancementLevel OR the client
      // doesn't have the key at all, use the server's value. This prevents client saves
      // from accidentally overwriting server-side enhancement state (e.g., from market
      // purchases, trades, multi-tab, or server restart recovery).
      if (data.itemModifications !== undefined) {
        const serverMods = (currentPlayer?.itemModifications as Record<string, any>) || {};
        const clientMods = (data.itemModifications as Record<string, any>) || {};
        const merged: Record<string, any> = { ...clientMods };
        for (const [itemId, serverMod] of Object.entries(serverMods)) {
          const clientMod = merged[itemId];
          if (!clientMod) {
            // Key missing on client — restore from server
            merged[itemId] = serverMod;
          } else {
            const serverLevel = serverMod?.enhancementLevel || 0;
            const clientLevel = clientMod?.enhancementLevel || 0;
            if (serverLevel > clientLevel) {
              // Server has higher level — client has stale state, prefer server
              merged[itemId] = serverMod;
            } else if (serverLevel === clientLevel) {
              // Same level — merge addedStats/addedSkills server-side additions
              merged[itemId] = {
                ...clientMod,
                addedStats: { ...(serverMod.addedStats || {}), ...(clientMod.addedStats || {}) },
                addedSkills: Array.from(new Set([...(serverMod.addedSkills || []), ...(clientMod.addedSkills || [])])),
              };
            }
            // clientLevel > serverLevel: client is ahead (offline progress) — keep client value
          }
        }
        data.itemModifications = merged;
      }

      const player = await storage.updatePlayer(req.params.id, data);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Contribute 15% of gold earned to guild bank (online combat contribution)
      const newGold = player.gold || 0;
      const goldEarned = newGold - previousGold;
      if (goldEarned > 0) {
        const guildContribution = Math.floor(goldEarned * GUILD_BANK_CONTRIBUTION.goldFromCombat);
        if (guildContribution > 0) {
          try {
            const playerGuild = await storage.getPlayerGuild(player.id);
            if (playerGuild) {
              await storage.creditGuildBankResources(playerGuild.guild.id, { gold: guildContribution });
            }
          } catch (e) {
            // Silent fail - don't break save for guild bank issues
          }
        }
      }

      // Contribute monster drops to guild bank (online combat - 20% chance per item type gained)
      if (isInCombat && data.inventory) {
        const newInventory = data.inventory as Record<string, number>;
        const guildContributions: Partial<GuildBankResources> = {};
        
        for (const [itemId, newQty] of Object.entries(newInventory)) {
          if (itemId === "Gold Coins") continue;
          const prevQty = previousInventory[itemId] || 0;
          const gained = newQty - prevQty;
          
          if (gained > 0 && Math.random() < GUILD_BANK_CONTRIBUTION.materialFromGathering) {
            const category = getItemResourceCategory(itemId);
            if (category && category !== 'gold') {
              const contribution = Math.max(1, Math.floor(gained * 0.5));
              guildContributions[category as keyof GuildBankResources] = 
                (guildContributions[category as keyof GuildBankResources] || 0) + contribution;
            }
          }
        }
        
        if (Object.keys(guildContributions).length > 0) {
          try {
            const playerGuild = await storage.getPlayerGuild(player.id);
            if (playerGuild) {
              await storage.creditGuildBankResources(playerGuild.guild.id, guildContributions);
            }
          } catch (e) {
            // Silent fail - don't break save for guild bank issues
          }
        }
      }

      res.json(player);
    } catch (error) {
      console.error("Error in PATCH /api/players/:id:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST endpoint for sendBeacon (same as PATCH but via POST for browser compatibility)
  // sendBeacon only supports POST requests, so we need this separate endpoint
  // NOTE: sendBeacon cannot send custom headers, so we use sessionToken in body for Firebase auth
  // Uses authenticatePlayerForBeacon which includes sessionToken fallback with rotation
  // SINGLE SESSION: Validates session token to ensure only active session can save
  app.post("/api/players/:id/save", authenticatePlayerForBeacon, validateSessionToken, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const authenticatedPlayer = req.player;
      if (!authenticatedPlayer) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // Security: Only allow updating the authenticated player's own data
      if (authenticatedPlayer.id !== req.params.id) {
        console.warn(`[Save-Beacon] Player ${authenticatedPlayer.id} attempted to modify ${req.params.id}`);
        return res.status(403).json({ error: "Cannot modify other player's data" });
      }
      
      // SECURITY: Strip sensitive/admin-only fields before validation
      stripSensitiveFields(req.body);
      
      const validation = updatePlayerSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: fromZodError(validation.error).toString() 
        });
      }

      // Get current player to track gold and inventory changes for guild bank contribution
      const currentPlayer = authenticatedPlayer;
      
      // Check dataVersion - if server has higher version (admin updated), reject save
      // This prevents client's stale state from overwriting admin changes
      const clientDataVersion = (validation.data as any).dataVersion;
      const serverDataVersion = (currentPlayer as any)?.dataVersion || 1;
      if (clientDataVersion !== undefined && clientDataVersion < serverDataVersion) {
        console.log(`[Save-Beacon] Rejecting stale save for player ${currentPlayer?.id}: client v${clientDataVersion} < server v${serverDataVersion}`);
        return res.status(409).json({ 
          error: "Data version mismatch - please reload",
          serverDataVersion,
          requiresReload: true
        });
      }
      
      const previousGold = currentPlayer?.gold || 0;
      const previousInventory = (currentPlayer?.inventory as Record<string, number>) || {};
      const isInCombat = currentPlayer?.activeCombat && 
        typeof currentPlayer.activeCombat === 'object' && 
        (currentPlayer.activeCombat as any).monsterId;

      // Enforce mutual exclusivity only when STARTING a NEW activity (not when updating existing)
      // This prevents clearing activities during heartbeats/visibility change updates
      const data: any = { ...validation.data };

      // SERVER-AUTHORITATIVE GOLD: Prevent client saves from overwriting server-side gold changes
      // (e.g., market sales, trade income). Client sends lastKnownServerGold (the gold value it last
      // received from the server). We compute the delta the client earned and apply it to server's current gold.
      if (data.gold !== undefined) {
        const clientGold = data.gold as number;
        const lastKnownServerGold = (req.body.lastKnownServerGold !== undefined) 
          ? Number(req.body.lastKnownServerGold) 
          : null;
        
        if (lastKnownServerGold !== null && !isNaN(lastKnownServerGold)) {
          const clientDelta = clientGold - lastKnownServerGold;
          const serverCurrentGold = currentPlayer?.gold || 0;
          data.gold = Math.max(0, serverCurrentGold + clientDelta);
        }
      }

      if (data.inventory && typeof data.inventory === 'object') {
        const cleanedInventory = { ...data.inventory as Record<string, number> };
        for (const [key, val] of Object.entries(cleanedInventory)) {
          if (typeof val !== 'number' || val <= 0) {
            delete cleanedInventory[key];
          }
        }
        data.inventory = cleanedInventory;
      }

      if (data.inventory && data.equipment && typeof data.equipment === 'object') {
        const inv = data.inventory as Record<string, number>;
        const equip = data.equipment as Record<string, string | null>;
        const equippedItems = new Set(Object.values(equip).filter((v): v is string => !!v && v.includes('#')));
        let anomalyDetected = false;
        for (const eqItem of equippedItems) {
          if (inv[eqItem] !== undefined) {
            console.warn(`[AntiDupe] Player ${authenticatedPlayer.id} (${authenticatedPlayer.username}): "${eqItem}" found in BOTH equipment and inventory. Removing from inventory.`);
            delete inv[eqItem];
            anomalyDetected = true;
          }
        }
        if (anomalyDetected) {
          data.inventory = inv;
        }
      }

      detectSuspiciousActivity(authenticatedPlayer.id, authenticatedPlayer.username, currentPlayer, data).catch(console.error);
      
      // Get client's activity identifiers
      const clientCombatMonsterId = data.activeCombat && 
        typeof data.activeCombat === 'object' && 
        (data.activeCombat as any).monsterId;
      
      const clientTaskSkillId = data.activeTask && 
        typeof data.activeTask === 'object' && 
        (data.activeTask as any).skillId;
      
      // Get server's current activity identifiers
      const serverCombatMonsterId = currentPlayer?.activeCombat && 
        typeof currentPlayer.activeCombat === 'object' && 
        (currentPlayer.activeCombat as any).monsterId;
      
      const serverTaskSkillId = currentPlayer?.activeTask && 
        typeof currentPlayer.activeTask === 'object' && 
        (currentPlayer.activeTask as any).skillId;
      
      // Only clear other activity if this is a NEW activity start (not updating existing)
      // CRITICAL FIX: If server already has same combat/task running, client is just updating - don't clear the other
      const isStartingNewCombat = clientCombatMonsterId && clientCombatMonsterId !== serverCombatMonsterId;
      const isStartingNewTask = clientTaskSkillId && clientTaskSkillId !== serverTaskSkillId;
      
      // Block new activities while traveling
      const hasActiveTravel = currentPlayer?.activeTravel && 
        typeof currentPlayer.activeTravel === 'object' &&
        (currentPlayer.activeTravel as any).endTime > Date.now();
      
      if (hasActiveTravel && (isStartingNewCombat || isStartingNewTask)) {
        return res.status(400).json({ error: "Cannot start activity while traveling" });
      }

      // Block new activities while in dungeon
      if (isStartingNewCombat || isStartingNewTask) {
        const activeDungeonRun = await dungeonService.getCurrentRun(authenticatedPlayer.id);
        if (activeDungeonRun) {
          return res.status(400).json({ error: "Cannot start activity while in a dungeon" });
        }
      }
      
      if (isStartingNewCombat) {
        data.activeTask = null;
      } else if (isStartingNewTask) {
        data.activeCombat = null;
      }

      // Validate equipment mastery requirements for weapon changes
      if (data.equipment && typeof data.equipment === 'object') {
        const newEquipment = data.equipment as Record<string, string | null>;
        const currentEquipment = (currentPlayer?.equipment as Record<string, string | null>) || {};
        
        // Check if weapon slot is being changed
        const newWeaponId = newEquipment.weapon;
        const currentWeaponId = currentEquipment.weapon;
        
        if (newWeaponId && newWeaponId !== currentWeaponId) {
          // Look up the weapon item in the database
          const items = await storage.getAllGameItems();
          // Handle items with rarity suffix (e.g., "Bronze Sword (Uncommon)")
          const baseWeaponId = newWeaponId.replace(/\s*\([^)]*\)\s*$/, '').replace(/#[a-z0-9]+$/i, '');
          const weaponItem = items.find(i => i.id === baseWeaponId || i.id === newWeaponId);
          
          if (weaponItem && weaponItem.weaponCategory && weaponItem.masteryRequired && weaponItem.masteryRequired > 1) {
            const masteryType = mapWeaponCategoryToMasteryType(weaponItem.weaponCategory);
            if (masteryType) {
              const fieldName = getMasteryFieldName(masteryType);
              const playerMasteryXp = (currentPlayer as any)?.[fieldName] || 0;
              const playerMasteryLevel = getMasteryLevelFromXp(playerMasteryXp);
              
              if (playerMasteryLevel < weaponItem.masteryRequired) {
                return res.status(400).json({ 
                  error: "Mastery requirement not met",
                  masteryRequired: weaponItem.masteryRequired,
                  playerMasteryLevel
                });
              }
            }
          }
        }
      }

      data.lastLogoutAt = new Date();
      data.lastSeen = new Date();
      data.isOnline = 0;

      const IDLE_LIMIT_MS_SAVE = 6 * 60 * 60 * 1000;
      const saveNow = Date.now();
      if (data.activeTask && typeof data.activeTask === 'object') {
        const task = data.activeTask as any;
        if (!task.lastClientTick || task.lastClientTick > saveNow + 60000) {
          task.lastClientTick = saveNow;
        }
        if (!task.queueDurationMs) {
          if (!task.limitExpiresAt || task.limitExpiresAt < saveNow) {
            task.limitExpiresAt = saveNow + IDLE_LIMIT_MS_SAVE;
          }
        }
      }
      if (data.activeCombat && typeof data.activeCombat === 'object') {
        const combat = data.activeCombat as any;
        if (!combat.lastClientTick || combat.lastClientTick > saveNow + 60000) {
          combat.lastClientTick = saveNow;
        }
        if (!combat.queueDurationMs) {
          if (!combat.limitExpiresAt || combat.limitExpiresAt < saveNow) {
            combat.limitExpiresAt = saveNow + IDLE_LIMIT_MS_SAVE;
          }
        }
      }

      // SERVER-AUTHORITATIVE itemModifications: prefer server version per key.
      // Same logic as PATCH endpoint: server wins on level ties/advances; client wins only if ahead.
      if (data.itemModifications !== undefined) {
        const serverMods = (currentPlayer?.itemModifications as Record<string, any>) || {};
        const clientMods = (data.itemModifications as Record<string, any>) || {};
        const merged: Record<string, any> = { ...clientMods };
        for (const [itemId, serverMod] of Object.entries(serverMods)) {
          const clientMod = merged[itemId];
          if (!clientMod) {
            merged[itemId] = serverMod;
          } else {
            const serverLevel = serverMod?.enhancementLevel || 0;
            const clientLevel = clientMod?.enhancementLevel || 0;
            if (serverLevel > clientLevel) {
              merged[itemId] = serverMod;
            } else if (serverLevel === clientLevel) {
              merged[itemId] = {
                ...clientMod,
                addedStats: { ...(serverMod.addedStats || {}), ...(clientMod.addedStats || {}) },
                addedSkills: Array.from(new Set([...(serverMod.addedSkills || []), ...(clientMod.addedSkills || [])])),
              };
            }
          }
        }
        data.itemModifications = merged;
      }

      const player = await storage.updatePlayer(req.params.id, data);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Contribute 15% of gold earned to guild bank (online combat contribution)
      const newGold = player.gold || 0;
      const goldEarned = newGold - previousGold;
      if (goldEarned > 0) {
        const guildContribution = Math.floor(goldEarned * GUILD_BANK_CONTRIBUTION.goldFromCombat);
        if (guildContribution > 0) {
          try {
            const playerGuild = await storage.getPlayerGuild(player.id);
            if (playerGuild) {
              await storage.creditGuildBankResources(playerGuild.guild.id, { gold: guildContribution });
            }
          } catch (e) {
            // Silent fail - don't break save for guild bank issues
          }
        }
      }

      // Contribute monster drops to guild bank (online combat - 20% chance per item type gained)
      if (isInCombat && data.inventory) {
        const newInventory = data.inventory as Record<string, number>;
        const guildContributions: Partial<GuildBankResources> = {};
        
        for (const [itemId, newQty] of Object.entries(newInventory)) {
          if (itemId === "Gold Coins") continue;
          const prevQty = previousInventory[itemId] || 0;
          const gained = newQty - prevQty;
          
          if (gained > 0 && Math.random() < GUILD_BANK_CONTRIBUTION.materialFromGathering) {
            const category = getItemResourceCategory(itemId);
            if (category && category !== 'gold') {
              const contribution = Math.max(1, Math.floor(gained * 0.5));
              guildContributions[category as keyof GuildBankResources] = 
                (guildContributions[category as keyof GuildBankResources] || 0) + contribution;
            }
          }
        }
        
        if (Object.keys(guildContributions).length > 0) {
          try {
            const playerGuild = await storage.getPlayerGuild(player.id);
            if (playerGuild) {
              await storage.creditGuildBankResources(playerGuild.guild.id, guildContributions);
            }
          } catch (e) {
            // Silent fail - don't break save for guild bank issues
          }
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error in POST /api/players/:id/save:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== EQUIPMENT DURABILITY ROUTES =====

  // Break equipment - permanently removes item from equipment slot
  // Called when item breaks due to low durability + death
  app.post("/api/equipment/break", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { slot } = req.body;
      if (!slot || typeof slot !== "string") {
        return res.status(400).json({ error: "Slot is required" });
      }

      const result = await storage.breakEquipment(player.id, slot);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      console.log(`[BREAK] Player ${player.username} broke item ${result.itemId} in slot ${slot}`);
      res.json({ success: true, itemId: result.itemId });
    } catch (error) {
      console.error("Error in POST /api/equipment/break:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Repair equipment - restores durability to 100% for a gold cost
  app.post("/api/equipment/repair", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { slot, cost } = req.body;
      if (!slot || typeof slot !== "string") {
        return res.status(400).json({ error: "Slot is required" });
      }
      if (typeof cost !== "number" || cost < 0) {
        return res.status(400).json({ error: "Valid cost is required" });
      }
      
      // Check if equipped item is cursed
      const equipment = player.equipment as Record<string, string> || {};
      const equippedItemId = equipment[slot];
      if (equippedItemId) {
        const cursedItems = (player.cursedItems as string[]) || [];
        if (cursedItems.includes(equippedItemId)) {
          return res.status(400).json({ error: "Cursed items cannot be repaired" });
        }
      }

      const result = await storage.repairEquipment(player.id, slot, cost);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      console.log(`[REPAIR] Player ${player.username} repaired slot ${slot} for ${cost} gold`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error in POST /api/equipment/repair:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Repair all equipment - restores all durability to 100% for a gold cost
  app.post("/api/equipment/repair-all", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { totalCost } = req.body;
      if (typeof totalCost !== "number" || totalCost < 0) {
        return res.status(400).json({ error: "Valid totalCost is required" });
      }

      const result = await storage.repairAllEquipment(player.id, totalCost);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      console.log(`[REPAIR-ALL] Player ${player.username} repaired all equipment for ${totalCost} gold`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error in POST /api/equipment/repair-all:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update equipment durability (batch update)
  app.post("/api/equipment/durability", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { durability } = req.body;
      if (!durability || typeof durability !== "object") {
        return res.status(400).json({ error: "Durability object is required" });
      }

      const success = await storage.updateEquipmentDurability(player.id, durability);
      
      if (!success) {
        return res.status(500).json({ error: "Failed to update durability" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error in POST /api/equipment/durability:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get player badges
  app.get("/api/players/:playerId/badges", async (req, res) => {
    try {
      const badges = await storage.getPlayerBadges(req.params.playerId);
      res.json(badges);
    } catch (error) {
      console.error("Error in GET /api/players/:playerId/badges:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post('/api/players/selected-badge', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const { badgeId } = req.body;
      
      if (badgeId) {
        const playerBadges = await storage.getPlayerBadges(player.id);
        const hasBadge = playerBadges.some((pb: any) => pb.badge?.id === badgeId || pb.badgeId === badgeId);
        if (!hasBadge) {
          return res.status(400).json({ error: 'You do not own this badge' });
        }
      }
      
      await db.update(players).set({ selectedBadge: badgeId || null } as any).where(eq(players.id, player.id));
      res.json({ success: true, selectedBadge: badgeId || null });
    } catch (error) {
      console.error('Error setting selected badge:', error);
      res.status(500).json({ error: 'Failed to set selected badge' });
    }
  });

  // ===== MARKET ROUTES =====

  // Get grouped market listings for new browse UI
  app.get("/api/market/grouped", isAuthenticated, async (req: any, res) => {
    try {
      const page = Math.min(Math.max(parseInt(req.query.page as string) || 1, 1), 20);
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 20);
      const search = req.query.search as string | undefined;
      const sort = req.query.sort as string | undefined;
      const enhMinLevel = Math.min(Math.max(parseInt(req.query.enhMinLevel as string) || 0, 0), 10);
      const VALID_SKILLS = ['poison', 'burn', 'bleed', 'stun', 'freeze', 'vampiric', 'execute', 'armor_pierce'];
      const VALID_STATS = ['bonusAttack', 'bonusStrength', 'bonusDefence', 'bonusHitpoints', 'accuracy', 'critChance', 'critDamage'];
      const rawSkill = req.query.enhSkill as string | undefined;
      const rawStat = req.query.enhStat as string | undefined;
      const enhSkill = rawSkill && VALID_SKILLS.includes(rawSkill) ? rawSkill : undefined;
      const enhStat = rawStat && VALID_STATS.includes(rawStat) ? rawStat : undefined;
      const userOnly = req.query.userOnly === 'true';

      const VALID_ITEM_TYPES = ['equipment', 'food', 'potion', 'material', 'misc', 'fish'];
      const VALID_EQUIP_SLOTS = ['weapon', 'helmet', 'body', 'legs', 'gloves', 'boots', 'shield', 'cape', 'ring', 'amulet', '_armor', '_accessories'];
      const VALID_WEAPON_CATEGORIES = ['dagger', 'sword', 'axe', 'hammer', 'bow', 'staff', '2h_sword', '2h_axe', '2h_warhammer'];
      const VALID_ARMOR_TYPES = ['plate', 'leather', 'cloth'];
      const VALID_MATERIAL_SUBS = ['ore', 'bar', 'log', 'hide', 'other'];

      const rawItemType = req.query.itemType as string | undefined;
      const rawEquipSlot = req.query.equipSlot as string | undefined;
      const rawWeaponCategory = req.query.weaponCategory as string | undefined;
      const rawArmorType = req.query.armorType as string | undefined;
      const rawMaterialSub = req.query.materialSub as string | undefined;

      const VALID_REGIONS = ['verdant', 'quarry', 'dunes', 'obsidian', 'dragonspire', 'frozen_wastes', 'void_realm'];
      const rawRegion = req.query.region as string | undefined;
      const regionFilter = rawRegion && VALID_REGIONS.includes(rawRegion) ? rawRegion : undefined;

      const categoryFilters = {
        itemType: rawItemType && VALID_ITEM_TYPES.includes(rawItemType) ? rawItemType : undefined,
        equipSlot: rawEquipSlot && VALID_EQUIP_SLOTS.includes(rawEquipSlot) ? rawEquipSlot : undefined,
        weaponCategory: rawWeaponCategory && VALID_WEAPON_CATEGORIES.includes(rawWeaponCategory) ? rawWeaponCategory : undefined,
        armorType: rawArmorType && VALID_ARMOR_TYPES.includes(rawArmorType) ? rawArmorType : undefined,
        materialSub: rawMaterialSub && VALID_MATERIAL_SUBS.includes(rawMaterialSub) ? rawMaterialSub : undefined,
      };

      const result = await storage.getGroupedMarketListings(page, limit, search, sort, { enhMinLevel, enhSkill, enhStat }, userOnly, categoryFilters, regionFilter);
      res.json(result);
    } catch (error) {
      console.error("Error in GET /api/market/grouped:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all listings for a specific item
  app.get("/api/market/item/:itemId/listings", isAuthenticated, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      if (!itemId) {
        return res.status(400).json({ error: "itemId is required" });
      }

      const listings = await storage.getListingsByItemId(itemId);
      res.json(listings);
    } catch (error) {
      console.error("Error in GET /api/market/item/:itemId/listings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all market listings (include own listings, frontend will show them grayed out)
  app.get("/api/market", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Include all listings - frontend will display own listings differently
      const listings = await storage.getMarketListings();
      res.json({ listings, currentPlayerId: player.id });
    } catch (error) {
      console.error("Error in GET /api/market:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get player's own listings
  app.get("/api/market/my-listings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const listings = await storage.getPlayerListings(player.id);
      res.json(listings);
    } catch (error) {
      console.error("Error in GET /api/market/my-listings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create a new listing - validate with Zod schema
  const createListingInputSchema = z.object({
    itemId: z.string().min(1, "Item ID is required"),
    quantity: z.number().int().min(1, "Quantity must be at least 1"),
    pricePerItem: z.number().int().min(1, "Price must be at least 1"),
  });

  app.post("/api/market", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Guest accounts cannot sell on market
      if (player.isGuest === 1) {
        return res.status(403).json({ error: "Guest accounts cannot sell on the marketplace. Register your account!" });
      }

      // Validate input with Zod schema
      const validation = createListingInputSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: fromZodError(validation.error).toString() 
        });
      }
      
      const { itemId, quantity, pricePerItem } = validation.data;

      // Validate that the item ID is known and produce a canonical form early.
      // Canonicalization: normalizes the base (fixes casing/underscore mismatches)
      // while preserving rarity/instance suffixes verbatim.
      // All downstream checks use canonicalItemId so that formatting variants
      // cannot bypass duplicate detection or create conflicting entries.
      const allGameItems = await storage.getAllGameItems();
      const knownItemIds = new Set(allGameItems.map(i => i.id));
      const canonicalItemId = canonicalizeItemId(itemId, knownItemIds);
      if (canonicalItemId === null) {
        const baseItemId = extractBaseItemId(itemId);
        console.warn(`[Market] Rejected listing for unknown item ID: "${itemId}" (base: "${baseItemId}") by player ${player.id}`);
        return res.status(400).json({ error: `Unknown item: "${baseItemId}". This item cannot be listed on the market.` });
      }

      const hasEnhancement = isEquipmentItem(canonicalItemId) && (() => {
        const itemMods = (player.itemModifications || {}) as Record<string, any>;
        return (itemMods[itemId] ?? itemMods[canonicalItemId])?.enhancementLevel > 0;
      })();

      if (!hasEnhancement) {
        const existingListings = await storage.getPlayerListings(player.id);
        const duplicateListing = existingListings.find(
          listing => listing.itemId === canonicalItemId || listing.itemId === itemId
        );
        if (duplicateListing) {
          return res.status(400).json({ error: "You already have an active listing for this item. Use the update option to add more quantity." });
        }
      }

      // Check if item is tradable (use canonical ID)
      if (!isItemTradable(canonicalItemId)) {
        return res.status(400).json({ error: "This item cannot be traded" });
      }
      
      // Check if item is cursed (check both original and canonical keys)
      const cursedItems = (player.cursedItems as string[]) || [];
      if (cursedItems.includes(itemId) || (canonicalItemId !== itemId && cursedItems.includes(canonicalItemId))) {
        return res.status(400).json({ error: "Cursed items cannot be sold on the market" });
      }

      // Check player has enough of the item
      // Inventory may be keyed by original or canonical ID; try both
      const inventory = player.inventory as Record<string, number>;
      const inventoryKey = inventory[itemId] !== undefined ? itemId : (inventory[canonicalItemId] !== undefined ? canonicalItemId : itemId);
      const currentQty = inventory[inventoryKey] || 0;
      
      if (currentQty < quantity) {
        return res.status(400).json({ error: "Not enough items in inventory" });
      }
      
      // Check durability for equipment items - must be at 100% to list on market
      if (isEquipmentItem(canonicalItemId)) {
        const inventoryDurability = (player.inventoryDurability || {}) as Record<string, number>;
        const durability = inventoryDurability[inventoryKey] ?? inventoryDurability[canonicalItemId] ?? 100;
        if (durability < 100) {
          return res.status(400).json({ 
            error: "Damaged equipment cannot be listed. Repair it first." 
          });
        }
      }

      // Deduct 15% listing fee upfront from seller (gold sink — fee is destroyed).
      // Must be checked BEFORE inventory mutation to avoid item loss on failure.
      const listingFee = Math.floor(quantity * pricePerItem * MARKET_LISTING_FEE);
      const currentGold = player.gold || 0;
      if (currentGold < listingFee) {
        return res.status(400).json({ error: `Not enough gold to pay listing fee (${listingFee} gold required).` });
      }

      // Remove items from player inventory (use the key that actually exists in inventory)
      inventory[inventoryKey] = currentQty - quantity;
      if (inventory[inventoryKey] === 0) {
        delete inventory[inventoryKey];
      }

      let enhancementData: any = null;
      if (isEquipmentItem(canonicalItemId)) {
        const itemMods = (player.itemModifications || {}) as Record<string, any>;
        // Try both keys for modifications
        const mods = itemMods[inventoryKey] ?? itemMods[canonicalItemId];
        
        let enhLevel = 0;
        try {
          const enhResult = await db.execute(sql`
            SELECT enhancement_level 
            FROM weapon_enhancements WHERE player_id = ${player.id} AND item_id = ${inventoryKey}
          `);
          if (enhResult.rows.length > 0) {
            enhLevel = (enhResult.rows[0] as any).enhancement_level || 0;
          }
        } catch (e) {}
        
        if (enhLevel > 0 || mods) {
          enhancementData = {
            enhancementLevel: mods?.enhancementLevel || enhLevel || 0,
            addedStats: mods?.addedStats || {},
            addedSkills: mods?.addedSkills || [],
          };
          await db.execute(sql`DELETE FROM weapon_enhancements WHERE player_id = ${player.id} AND item_id = ${inventoryKey}`);
          if (mods) {
            delete itemMods[inventoryKey];
            if (inventoryKey !== canonicalItemId) delete itemMods[canonicalItemId];
            await storage.updatePlayer(player.id, { inventory, itemModifications: itemMods });
          } else {
            await storage.updatePlayer(player.id, { inventory });
          }
        } else {
          await storage.updatePlayer(player.id, { inventory });
        }
      } else {
        await storage.updatePlayer(player.id, { inventory });
      }

      await storage.updatePlayer(player.id, { gold: currentGold - listingFee });

      const minHours = 7 + Math.random() * 17;
      const maxHours = 72 + Math.random() * 50;
      const autoSellHours = minHours + Math.random() * (maxHours - minHours);
      const autoSellAt = new Date(Date.now() + autoSellHours * 60 * 60 * 1000);

      const listing = await storage.createMarketListing({
        sellerId: player.id,
        itemId: canonicalItemId,
        quantity,
        pricePerItem,
        enhancementData,
        autoSellAt,
        region: (player.currentRegion as string) || null,
      });

      broadcastToAllPlayers({
        type: 'market_listing_updated',
        listingId: listing.id,
        itemId: canonicalItemId,
        newQuantity: quantity,
        action: 'created',
      });

      res.json({
        ...listing,
        notification: {
          type: "MARKET_LISTING_CREATED",
          message: `${quantity}x ${canonicalItemId} listed on marketplace. Price per unit: ${pricePerItem} gold.`,
          payload: { itemId: canonicalItemId, quantity, pricePerItem },
        }
      });
    } catch (error) {
      console.error("Error in POST /api/market:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/market/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });
      if (player.isGuest === 1) return res.status(403).json({ error: "Guest accounts cannot update marketplace listings." });

      const bodySchema = z.object({
        addQuantity: z.number().int().min(0).max(10000),
        pricePerItem: z.number().int().min(1).max(1000000000),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
      const { addQuantity, pricePerItem: newPrice } = parsed.data;

      const listing = await storage.getMarketListing(req.params.id);
      if (!listing) return res.status(404).json({ error: "Listing not found" });
      if (listing.sellerId !== player.id) return res.status(403).json({ error: "Cannot update another player's listing" });

      if (addQuantity === 0 && newPrice === listing.pricePerItem) {
        return res.status(400).json({ error: "No changes specified" });
      }

      if (addQuantity > 0 && isEquipmentItem(listing.itemId)) {
        const inventoryDurability = (player.inventoryDurability || {}) as Record<string, number>;
        const durability = inventoryDurability[listing.itemId] ?? 100;
        if (durability < 100) {
          return res.status(400).json({ error: "Damaged equipment cannot be listed. Repair it first." });
        }
      }

      const result = await db.transaction(async (tx) => {
        const [lockedListing] = await tx.select().from(marketListings)
          .where(eq(marketListings.id, req.params.id))
          .for('update');
        if (!lockedListing) throw new Error("Listing no longer exists");
        if (lockedListing.quantity <= 0) throw new Error("Listing is sold out");

        if (addQuantity > 0) {
          const [freshPlayer] = await tx.select().from(players)
            .where(eq(players.id, player.id))
            .for('update');
          if (!freshPlayer) throw new Error("Player not found");

          const inventory = freshPlayer.inventory as Record<string, number>;
          const currentQty = inventory[listing.itemId] || 0;
          if (currentQty < addQuantity) throw new Error("Not enough items in inventory");

          inventory[listing.itemId] = currentQty - addQuantity;
          if (inventory[listing.itemId] === 0) delete inventory[listing.itemId];
          await tx.update(players).set({ inventory } as any).where(eq(players.id, player.id));
        }

        const updatedQuantity = lockedListing.quantity + addQuantity;
        await tx.update(marketListings)
          .set({ quantity: updatedQuantity, pricePerItem: newPrice })
          .where(eq(marketListings.id, lockedListing.id));

        return updatedQuantity;
      });

      broadcastToAllPlayers({
        type: 'market_listing_updated',
        listingId: listing.id,
        itemId: listing.itemId,
        newQuantity: result,
        action: 'updated',
      });

      res.json({
        success: true,
        notification: {
          type: "MARKET_LISTING_UPDATED",
          message: `Listing updated: ${result}x ${listing.itemId} at ${newPrice} gold each.`,
          payload: { itemId: listing.itemId, quantity: result, pricePerItem: newPrice },
        }
      });
    } catch (error: any) {
      console.error("Error in PUT /api/market/:id:", error);
      const msg = error?.message || "";
      if (msg.includes("Not enough items") || msg.includes("sold out") || msg.includes("no longer exists")) {
        return res.status(400).json({ error: msg });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cancel a listing (returns items to seller)
  app.delete("/api/market/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const listing = await storage.getMarketListing(req.params.id);
      if (!listing) {
        return res.status(404).json({ error: "Listing not found" });
      }

      if (listing.sellerId !== player.id) {
        return res.status(403).json({ error: "Cannot cancel another player's listing" });
      }

      // Atomically: delete listing + restore inventory + restore enhancement data in one transaction
      const enhData = listing.enhancementData as { enhancementLevel?: number; addedStats?: any; addedSkills?: any[] } | null;
      const hasAnyEnhancement = !!(enhData && (
        enhData.enhancementLevel ||
        (enhData.addedStats && Object.keys(enhData.addedStats).length > 0) ||
        (enhData.addedSkills && enhData.addedSkills.length > 0)
      ));

      const cancelSuccess = await db.transaction(async (tx) => {
        // 1. Delete the listing (confirms ownership; returns false if not found)
        const deleteResult = await tx.execute(sql`
          DELETE FROM market_listings WHERE id = ${req.params.id} AND seller_id = ${player.id}
        `);
        if ((deleteResult.rowCount ?? 0) === 0) return false;

        // 2. Return inventory to seller
        const inventory = player.inventory as Record<string, number>;
        const newInv = { ...inventory, [listing.itemId]: (inventory[listing.itemId] || 0) + listing.quantity };
        
        if (hasAnyEnhancement) {
          // 3a. Restore itemModifications
          const itemMods = (player.itemModifications || {}) as Record<string, any>;
          const newMods = {
            ...itemMods,
            [listing.itemId]: {
              addedStats: enhData!.addedStats || {},
              addedSkills: enhData!.addedSkills || [],
              enhancementLevel: enhData!.enhancementLevel || 0,
            },
          };
          await tx.execute(sql`
            UPDATE players SET
              inventory = ${JSON.stringify(newInv)}::jsonb,
              item_modifications = ${JSON.stringify(newMods)}::jsonb,
              last_saved = NOW()
            WHERE id = ${player.id}
          `);
          // 3b. Restore weapon_enhancements — always, regardless of level
          await tx.execute(sql`
            INSERT INTO weapon_enhancements (player_id, item_id, enhancement_level, added_stats, added_skills)
            VALUES (${player.id}, ${listing.itemId}, ${enhData!.enhancementLevel || 0}, ${JSON.stringify(enhData!.addedStats || {})}::jsonb, ${JSON.stringify(enhData!.addedSkills || [])}::jsonb)
            ON CONFLICT (player_id, item_id) DO UPDATE SET
              enhancement_level = ${enhData!.enhancementLevel || 0},
              added_stats = ${JSON.stringify(enhData!.addedStats || {})}::jsonb,
              added_skills = ${JSON.stringify(enhData!.addedSkills || [])}::jsonb
          `);
        } else {
          await tx.execute(sql`
            UPDATE players SET
              inventory = ${JSON.stringify(newInv)}::jsonb,
              last_saved = NOW()
            WHERE id = ${player.id}
          `);
        }
        return true;
      });

      if (!cancelSuccess) {
        return res.status(500).json({ error: "Failed to cancel listing" });
      }

      broadcastToAllPlayers({
        type: 'market_listing_updated',
        listingId: req.params.id,
        itemId: listing.itemId,
        newQuantity: 0,
        action: 'cancelled',
      });

      res.json({
        success: true,
        notification: {
          type: "MARKET_LISTING_CANCELLED",
          message: `${listing.quantity}x ${listing.itemId} listing cancelled. Items returned to your inventory.`,
          payload: { itemId: listing.itemId, quantity: listing.quantity },
        }
      });
    } catch (error) {
      console.error("Error in DELETE /api/market/:id:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Buy from a listing
  app.post("/api/market/:id/buy", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Guest accounts cannot buy from market
      if (player.isGuest === 1) {
        return res.status(403).json({ error: "Guest accounts cannot buy from the marketplace. Register your account!" });
      }

      const { quantity } = req.body;
      
      if (!quantity || quantity < 1 || !Number.isInteger(quantity)) {
        return res.status(400).json({ error: "Invalid quantity" });
      }

      const result = await storage.buyMarketListing(req.params.id, player.id, quantity);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // totalCost from storage is what the BUYER paid (includes 18% tax).
      // Seller receives the pre-tax amount (pricePerItem × quantity).
      const buyerSpent = result.totalCost || (result.listing ? Math.floor(quantity * result.listing.pricePerItem * (1 + MARKET_BUY_TAX)) : 0);
      const sellerEarned = result.listing ? quantity * result.listing.pricePerItem : 0;
      
      // Create notification for seller in database
      if (result.sellerId && result.listing) {
        await storage.createNotification({
          playerId: result.sellerId,
          type: "MARKET_SALE",
          message: `${quantity}x ${result.listing.itemId} sold! You earned ${sellerEarned} gold.`,
          payload: { 
            itemId: result.listing.itemId, 
            quantity, 
            goldAmount: sellerEarned,
            buyerId: player.id
          },
        });
        
        // Send push notification to offline seller
        try {
          await notifyMarketSale(result.sellerId, result.listing.itemId, quantity, sellerEarned);
        } catch (e) {
          console.error("Push notification failed:", e);
        }

        sendToPlayer(result.sellerId, {
          type: 'market_sale' as any,
          partyId: '',
          version: 0,
          timestamp: Date.now(),
          payload: {
            listingId: req.params.id,
            itemId: result.listing.itemId,
            quantitySold: quantity,
            remainingQuantity: (result as any).remainingQuantity ?? 0,
            goldEarned: sellerEarned,
          },
        } as any);
      }

      if (result.listing) {
        broadcastToAllPlayers({
          type: 'market_listing_updated',
          listingId: req.params.id,
          itemId: result.listing.itemId,
          newQuantity: (result as any).remainingQuantity ?? 0,
        });
      }
      
      res.json({
        success: true,
        listing: result.listing,
        buyerGold: result.buyerGold,
        buyerInventory: result.buyerInventory,
        buyerItemModifications: result.buyerItemModifications,
        notification: result.listing ? {
          type: "MARKET_PURCHASE",
          message: `${quantity}x ${result.listing.itemId} purchased. You spent ${buyerSpent} gold.`,
          payload: { 
            itemId: result.listing.itemId, 
            quantity, 
            goldAmount: buyerSpent 
          },
        } : undefined,
      });
    } catch (error) {
      console.error("Error in POST /api/market/:id/buy:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== BULK BUY ROUTE ====================

  app.post("/api/market/bulk-buy", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);

      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      if (player.isGuest === 1) {
        return res.status(403).json({ error: "Guest accounts cannot buy from the marketplace. Register your account!" });
      }

      const { itemId, quantity } = req.body;

      if (!itemId || typeof itemId !== "string") {
        return res.status(400).json({ error: "Invalid itemId" });
      }
      if (!quantity || quantity < 1 || !Number.isInteger(quantity)) {
        return res.status(400).json({ error: "Invalid quantity" });
      }

      const result = await storage.bulkBuyMarketListings(itemId, player.id, quantity);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Send per-seller notifications and WebSocket events
      if (result.sellers && result.sellers.length > 0) {
        for (const seller of result.sellers) {
          await storage.createNotification({
            playerId: seller.sellerId,
            type: "MARKET_SALE",
            message: `${seller.quantity}x ${itemId} sold! You earned ${seller.goldEarned} gold.`,
            payload: {
              itemId,
              quantity: seller.quantity,
              goldAmount: seller.goldEarned,
              buyerId: player.id,
            },
          });

          try {
            await notifyMarketSale(seller.sellerId, itemId, seller.quantity, seller.goldEarned);
          } catch (e) {
            console.error("Push notification failed:", e);
          }

          sendToPlayer(seller.sellerId, {
            type: 'market_sale' as any,
            partyId: '',
            version: 0,
            timestamp: Date.now(),
            payload: {
              listingId: seller.listingId,
              itemId,
              quantitySold: seller.quantity,
              remainingQuantity: (seller as any).remainingQuantity,
              goldEarned: seller.goldEarned,
            },
          } as any);

          broadcastToAllPlayers({
            type: 'market_listing_updated',
            listingId: seller.listingId,
            itemId,
            newQuantity: seller.remainingQuantity,
          });
        }
      }

      res.json({
        success: true,
        itemId: result.itemId,
        totalCost: result.totalCost,
        totalQuantity: result.totalQuantity,
        buyerGold: result.buyerGold,
        buyerInventory: result.buyerInventory,
        buyerItemModifications: result.buyerItemModifications,
        sellers: result.sellers,
        notification: {
          type: "MARKET_PURCHASE",
          message: `${result.totalQuantity}x ${itemId} purchased. You spent ${result.totalCost} gold.`,
          payload: {
            itemId,
            quantity: result.totalQuantity,
            goldAmount: result.totalCost,
          },
        },
      });
    } catch (error) {
      console.error("Error in POST /api/market/bulk-buy:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== BUY ORDER ROUTES ====================

  app.get("/api/market/buy-orders", isAuthenticated, async (req: any, res) => {
    try {
      const { itemId } = req.query;
      if (!itemId) return res.status(400).json({ error: "itemId required" });
      const orders = await storage.getBuyOrdersForItem(itemId as string);
      return res.json(orders);
    } catch (error) {
      console.error("Error in GET /api/market/buy-orders:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/market/my-buy-orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });
      const orders = await storage.getMyBuyOrders(player.id);
      return res.json(orders);
    } catch (error) {
      console.error("Error in GET /api/market/my-buy-orders:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/market/buy-orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });
      if (player.isGuest === 1) return res.status(403).json({ error: "Guest accounts cannot create buy orders" });
      const { itemId, quantity, pricePerItem } = req.body;
      if (!itemId || !quantity || !pricePerItem || quantity < 1 || pricePerItem < 1 || !Number.isInteger(quantity) || !Number.isInteger(pricePerItem)) {
        return res.status(400).json({ error: "Invalid parameters" });
      }
      // Before creating the buy order, check if there are sell listings at or below the offered price
      // If so, do an instant fill for as much quantity as available at that price
      const eligibleListings = await db
        .select()
        .from(marketListings)
        .where(and(
          eq(marketListings.itemId, itemId),
          ne(marketListings.sellerId, player.id),
          sql`${marketListings.pricePerItem} <= ${pricePerItem}`
        ))
        .orderBy(asc(marketListings.pricePerItem));

      const availableAtPrice = eligibleListings.reduce((sum, l) => sum + l.quantity, 0);

      if (availableAtPrice > 0) {
        // Attempt instant fill for as many as possible (up to quantity requested)
        const fillQty = Math.min(quantity, availableAtPrice);
        const bulkResult = await storage.bulkBuyMarketListings(itemId, player.id, fillQty, pricePerItem);
        if (bulkResult.success && bulkResult.totalQuantity && bulkResult.totalQuantity > 0) {
          const filled = bulkResult.totalQuantity;
          const remaining = quantity - filled;
          // Notify sellers
          if (bulkResult.sellers) {
            for (const seller of bulkResult.sellers) {
              await storage.createNotification({
                playerId: seller.sellerId,
                type: "MARKET_SALE",
                message: `Your listing was sold: ${seller.quantity}x ${itemId} for ${seller.goldEarned} gold.`,
                payload: { itemId, quantity: seller.quantity, goldAmount: seller.goldEarned, buyerId: player.id },
              });
            }
          }
          // Notify buyer of the instant fill
          await storage.createNotification({
            playerId: player.id,
            type: "MARKET_PURCHASE",
            message: `Instantly purchased ${filled}x ${itemId} for ${bulkResult.totalCost} gold.`,
            payload: { itemId, quantity: filled, goldAmount: bulkResult.totalCost },
          });
          if (remaining > 0) {
            // Partially filled — create a buy order for the remainder
            const orderResult = await storage.createBuyOrder(player.id, itemId, remaining, pricePerItem);
            return res.json({
              order: orderResult.order,
              buyerGold: orderResult.buyerGold,
              autoFilled: filled,
              buyerInventory: bulkResult.buyerInventory,
            });
          }
          // Fully filled — no buy order needed
          return res.json({
            order: null,
            buyerGold: bulkResult.buyerGold,
            autoFilled: filled,
            buyerInventory: bulkResult.buyerInventory,
          });
        }
      }

      // No matching sell listings at or below the price — create a standing buy order with escrow
      const result = await storage.createBuyOrder(player.id, itemId, quantity, pricePerItem);
      if (!result.success) return res.status(400).json({ error: result.error });

      return res.json({ order: result.order, buyerGold: result.buyerGold, autoFilled: 0 });
    } catch (error) {
      console.error("Error in POST /api/market/buy-orders:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/market/buy-orders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });
      const result = await storage.cancelBuyOrder(req.params.id, player.id);
      if (!result.success) return res.status(400).json({ error: result.error });
      return res.json({ success: true, buyerGold: result.buyerGold });
    } catch (error) {
      console.error("Error in DELETE /api/market/buy-orders/:id:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/market/buy-orders/:id/fill", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });
      if (player.isGuest === 1) return res.status(403).json({ error: "Guest accounts cannot fill buy orders" });
      const { quantity } = req.body;
      if (!quantity || quantity < 1 || !Number.isInteger(quantity)) {
        return res.status(400).json({ error: "Invalid quantity" });
      }
      const result = await storage.fillBuyOrder(req.params.id, player.id, quantity);
      if (!result.success) return res.status(400).json({ error: result.error });
      // Notify buyer
      if (result.buyerId && result.itemId) {
        await storage.createNotification({
          playerId: result.buyerId,
          type: "MARKET_SALE",
          message: `Buy order filled: ${result.filledQuantity}x ${result.itemId} purchased for ${result.goldEarned} gold.`,
          payload: { itemId: result.itemId, quantity: result.filledQuantity, goldAmount: result.goldEarned, sellerId: player.id },
        });
        sendToPlayer(result.buyerId, {
          type: 'market_sale' as any,
          partyId: '',
          version: 0,
          timestamp: Date.now(),
          payload: {
            listingId: req.params.id,
            itemId: result.itemId,
            quantitySold: result.filledQuantity,
            remainingQuantity: (result as any).remainingQuantity ?? 0,
            goldEarned: result.goldEarned,
          },
        } as any);
      }
      broadcastToAllPlayers({
        type: 'buy_order_updated' as any,
        orderId: req.params.id,
        itemId: result.itemId,
        remainingQuantity: result.remainingQuantity,
      });
      return res.json({
        success: true,
        goldEarned: result.goldEarned,
        sellerGold: result.sellerGold,
        newInventory: result.newInventory,
        newItemModifications: result.newItemModifications,
        filledQuantity: result.filledQuantity,
        remainingQuantity: result.remainingQuantity,
      });
    } catch (error) {
      console.error("Error in POST /api/market/buy-orders/:id/fill:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/market/my-transactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });
      const transactions = await storage.getPlayerTransactions(player.id, 15);
      return res.json(transactions);
    } catch (error) {
      console.error("Error in GET /api/market/my-transactions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== PRICE ANALYTICS ROUTES ====================

  const priceGuideCache: { data: any; expires: number } = { data: null, expires: 0 };

  app.get("/api/market/price-history/:itemId", isAuthenticated, async (req: any, res) => {
    try {
      const itemId = req.params.itemId;
      if (!itemId) return res.status(400).json({ error: "Item ID required" });

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const recentSales = await db
        .select()
        .from(marketPriceHistory)
        .where(eq(marketPriceHistory.itemId, itemId))
        .orderBy(desc(marketPriceHistory.soldAt))
        .limit(50);

      const stats24h = await db.execute(sql`
        SELECT 
          COALESCE(AVG(price_per_item), 0)::int AS avg_price,
          COALESCE(SUM(quantity), 0)::int AS total_volume,
          COUNT(*)::int AS sale_count
        FROM market_price_history 
        WHERE item_id = ${itemId} AND sold_at >= ${oneDayAgo}
      `);

      const stats7d = await db.execute(sql`
        SELECT 
          COALESCE(AVG(price_per_item), 0)::int AS avg_price,
          COALESCE(SUM(quantity), 0)::int AS total_volume,
          COUNT(*)::int AS sale_count
        FROM market_price_history 
        WHERE item_id = ${itemId} AND sold_at >= ${sevenDaysAgo}
      `);

      const trendQuery = await db.execute(sql`
        SELECT 
          COALESCE(AVG(CASE WHEN sold_at >= ${new Date(now.getTime() - 12 * 60 * 60 * 1000)} THEN price_per_item END), 0)::int AS recent_avg,
          COALESCE(AVG(CASE WHEN sold_at < ${new Date(now.getTime() - 12 * 60 * 60 * 1000)} AND sold_at >= ${oneDayAgo} THEN price_per_item END), 0)::int AS older_avg
        FROM market_price_history 
        WHERE item_id = ${itemId} AND sold_at >= ${oneDayAgo}
      `);

      const s24 = stats24h.rows[0] as any;
      const s7d = stats7d.rows[0] as any;
      const trend = trendQuery.rows[0] as any;

      let trendDirection: "rising" | "falling" | "stable" = "stable";
      if (trend.recent_avg > 0 && trend.older_avg > 0) {
        const diff = (trend.recent_avg - trend.older_avg) / trend.older_avg;
        if (diff > 0.05) trendDirection = "rising";
        else if (diff < -0.05) trendDirection = "falling";
      }

      res.json({
        itemId,
        recentSales: recentSales.map(s => ({
          quantity: s.quantity,
          pricePerItem: s.pricePerItem,
          region: s.region,
          soldAt: s.soldAt,
        })),
        stats24h: { avgPrice: s24.avg_price, totalVolume: s24.total_volume, saleCount: s24.sale_count },
        stats7d: { avgPrice: s7d.avg_price, totalVolume: s7d.total_volume, saleCount: s7d.sale_count },
        trend: trendDirection,
        suggestedPrice: s24.sale_count > 0 ? s24.avg_price : (s7d.sale_count > 0 ? s7d.avg_price : null),
      });
    } catch (error) {
      console.error("Error in GET /api/market/price-history:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/market/price-guide", isAuthenticated, async (req: any, res) => {
    try {
      const now = Date.now();
      if (priceGuideCache.data && now < priceGuideCache.expires) {
        return res.json(priceGuideCache.data);
      }

      const search = (req.query.search as string || "").trim().toLowerCase();
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, parseInt(req.query.limit as string) || 30);
      const offset = (page - 1) * limit;

      let searchClause = sql`1=1`;
      if (search) {
        searchClause = sql`(
          lower(h.item_id) LIKE ${`%${search}%`}
          OR EXISTS (
            SELECT 1 FROM game_items gi WHERE SPLIT_PART(h.item_id, ' (', 1) = gi.id 
            AND (lower(gi.name) LIKE ${`%${search}%`}
              OR EXISTS (SELECT 1 FROM jsonb_each_text(gi.name_translations) AS t(lang, val) WHERE lower(val) LIKE ${`%${search}%`}))
          )
        )`;
      }

      const result = await db.execute(sql`
        WITH item_stats AS (
          SELECT 
            h.item_id,
            AVG(CASE WHEN h.sold_at >= NOW() - INTERVAL '24 hours' THEN h.price_per_item END)::int AS avg_24h,
            SUM(CASE WHEN h.sold_at >= NOW() - INTERVAL '24 hours' THEN h.quantity ELSE 0 END)::int AS volume_24h,
            COUNT(CASE WHEN h.sold_at >= NOW() - INTERVAL '24 hours' THEN 1 END)::int AS sales_24h,
            AVG(h.price_per_item)::int AS avg_all_time,
            SUM(h.quantity)::int AS volume_all_time,
            AVG(CASE WHEN h.sold_at >= NOW() - INTERVAL '12 hours' THEN h.price_per_item END)::int AS recent_avg,
            AVG(CASE WHEN h.sold_at < NOW() - INTERVAL '12 hours' AND h.sold_at >= NOW() - INTERVAL '24 hours' THEN h.price_per_item END)::int AS older_avg,
            MAX(h.sold_at) AS last_sale
          FROM market_price_history h
          WHERE ${searchClause}
          GROUP BY h.item_id
          HAVING COUNT(*) >= 1
          ORDER BY SUM(CASE WHEN h.sold_at >= NOW() - INTERVAL '24 hours' THEN h.quantity ELSE 0 END) DESC, MAX(h.sold_at) DESC
          LIMIT ${limit} OFFSET ${offset}
        )
        SELECT * FROM item_stats
      `);

      const countResult = await db.execute(sql`
        SELECT COUNT(DISTINCT h.item_id)::int AS total
        FROM market_price_history h
        WHERE ${searchClause}
      `);

      const items = (result.rows as any[]).map(row => {
        let trend: "rising" | "falling" | "stable" = "stable";
        if (row.recent_avg && row.older_avg) {
          const diff = (row.recent_avg - row.older_avg) / row.older_avg;
          if (diff > 0.05) trend = "rising";
          else if (diff < -0.05) trend = "falling";
        }
        return {
          itemId: row.item_id,
          avgPrice24h: row.avg_24h || 0,
          volume24h: row.volume_24h || 0,
          sales24h: row.sales_24h || 0,
          avgPriceAllTime: row.avg_all_time || 0,
          volumeAllTime: row.volume_all_time || 0,
          trend,
          lastSale: row.last_sale,
        };
      });

      const responseData = {
        items,
        total: (countResult.rows[0] as any)?.total || 0,
        page,
        limit,
      };

      if (!search) {
        priceGuideCache.data = responseData;
        priceGuideCache.expires = now + 5 * 60 * 1000;
      }

      res.json(responseData);
    } catch (error) {
      console.error("Error in GET /api/market/price-guide:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/market/regional-supply", isAuthenticated, async (req: any, res) => {
    try {
      const result = await db.execute(sql`
        SELECT 
          region,
          item_id,
          COUNT(*)::int AS listing_count,
          SUM(quantity)::int AS total_quantity,
          MIN(price_per_item)::int AS lowest_price,
          AVG(price_per_item)::int AS avg_price
        FROM market_listings
        WHERE region IS NOT NULL
        GROUP BY region, item_id
        ORDER BY region, total_quantity DESC
      `);

      const byRegion: Record<string, Array<{ itemId: string; listingCount: number; totalQuantity: number; lowestPrice: number; avgPrice: number }>> = {};
      for (const row of result.rows as any[]) {
        if (!byRegion[row.region]) byRegion[row.region] = [];
        byRegion[row.region].push({
          itemId: row.item_id,
          listingCount: row.listing_count,
          totalQuantity: row.total_quantity,
          lowestPrice: row.lowest_price,
          avgPrice: row.avg_price,
        });
      }

      res.json({ regions: byRegion });
    } catch (error) {
      console.error("Error in GET /api/market/regional-supply:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== NPC SHOP ROUTES ====================

  // Get all NPC shops with their current stock
  app.get("/api/npc-shops", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Get all shops
      const shopsResult = await db.execute(sql`
        SELECT * FROM npc_shops ORDER BY region_id
      `);
      
      // Get today's stock for all shops
      const now = new Date();
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      
      const stockResult = await db.execute(sql`
        SELECT s.*, gi.name as item_name, gi.icon as item_icon, gi.name_translations
        FROM npc_shop_stock s
        LEFT JOIN game_items gi ON s.item_id = gi.id
        WHERE s.reset_date::date = ${todayUTC}::date
      `);
      
      // Get player's purchases today
      const purchasesResult = await db.execute(sql`
        SELECT stock_id, SUM(quantity_purchased) as total_purchased
        FROM npc_shop_purchases
        WHERE player_id = ${player.id}
        AND purchased_at >= ${todayUTC}
        GROUP BY stock_id
      `);
      
      const purchasesMap = new Map<string, number>();
      for (const p of purchasesResult.rows as any[]) {
        purchasesMap.set(p.stock_id, parseInt(p.total_purchased));
      }
      
      // Group stock by shop
      const stockByShop = new Map<string, any[]>();
      for (const stock of stockResult.rows as any[]) {
        const shopStock = stockByShop.get(stock.shop_id) || [];
        const purchased = purchasesMap.get(stock.id) || 0;
        shopStock.push({
          ...stock,
          remainingQuantity: stock.quantity === -1 ? -1 : Math.max(0, stock.quantity - purchased),
          purchasedToday: purchased,
        });
        stockByShop.set(stock.shop_id, shopStock);
      }
      
      const shops = (shopsResult.rows as any[]).map(shop => ({
        ...shop,
        stock: stockByShop.get(shop.id) || [],
      }));
      
      // Calculate time until next reset (00:00 UTC)
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const timeUntilReset = tomorrow.getTime() - now.getTime();
      
      res.json({ shops, timeUntilReset });
    } catch (error) {
      console.error("Error in GET /api/npc-shops:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get specific NPC shop by region
  app.get("/api/npc-shops/:regionId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      const { regionId } = req.params;
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Get shop for this region
      const shopResult = await db.execute(sql`
        SELECT * FROM npc_shops WHERE region_id = ${regionId}
      `);
      
      if (shopResult.rows.length === 0) {
        return res.status(404).json({ error: "Shop not found for this region" });
      }
      
      const shop = shopResult.rows[0] as any;
      
      // Get current 4-hour block stock
      const now = new Date();
      const currentHour = now.getUTCHours();
      const blockStart = Math.floor(currentHour / 4) * 4;
      const resetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), blockStart, 0, 0));
      
      let stockResult = await db.execute(sql`
        SELECT s.*, gi.name as item_name, gi.icon as item_icon, gi.name_translations
        FROM npc_shop_stock s
        LEFT JOIN game_items gi ON s.item_id = gi.id
        WHERE s.shop_id = ${shop.id} AND s.reset_date = ${resetDate}
      `);
      
      if (stockResult.rows.length === 0) {
        await refreshNpcShopStock();
        stockResult = await db.execute(sql`
          SELECT s.*, gi.name as item_name, gi.icon as item_icon, gi.name_translations
          FROM npc_shop_stock s
          LEFT JOIN game_items gi ON s.item_id = gi.id
          WHERE s.shop_id = ${shop.id} AND s.reset_date = ${resetDate}
        `);
      }
      
      console.log(`[NPC Shop] Region ${regionId}: shop=${shop.id}, stock_count=${stockResult.rows.length}`);
      
      // Get player's purchases this period
      const purchasesResult = await db.execute(sql`
        SELECT stock_id, SUM(quantity_purchased) as total_purchased
        FROM npc_shop_purchases
        WHERE player_id = ${player.id}
        AND purchased_at >= ${resetDate}
        GROUP BY stock_id
      `);
      
      const purchasesMap = new Map<string, number>();
      for (const p of purchasesResult.rows as any[]) {
        purchasesMap.set(p.stock_id, parseInt(p.total_purchased));
      }
      
      const stock = (stockResult.rows as any[]).map(s => {
        const purchased = purchasesMap.get(s.id) || 0;
        return {
          ...s,
          remainingQuantity: s.quantity === -1 ? -1 : Math.max(0, s.quantity - purchased),
          purchasedToday: purchased,
        };
      });
      
      const nextBlock = new Date(resetDate.getTime() + 4 * 60 * 60 * 1000); // Next 4-hour block
      const timeUntilReset = nextBlock.getTime() - now.getTime();
      
      res.json({ shop: { ...shop, stock }, timeUntilReset });
    } catch (error) {
      console.error("Error in GET /api/npc-shops/:regionId:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Buy from NPC shop
  app.post("/api/npc-shops/:stockId/buy", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      const { stockId } = req.params;
      const { quantity = 1 } = req.body;
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      if (quantity < 1 || quantity > 1000) {
        return res.status(400).json({ error: "Invalid quantity" });
      }

      // Get the stock item
      const now = new Date();
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      
      const stockResult = await db.execute(sql`
        SELECT s.*, ns.region_id
        FROM npc_shop_stock s
        JOIN npc_shops ns ON s.shop_id = ns.id
        WHERE s.id = ${stockId} AND s.reset_date::date = CURRENT_DATE
      `);
      
      if (stockResult.rows.length === 0) {
        return res.status(404).json({ error: "Stock item not found or expired" });
      }
      
      const stockItem = stockResult.rows[0] as any;
      
      // Check if player is in the correct region
      if (player.currentRegion !== stockItem.region_id) {
        return res.status(400).json({ error: "You must be in this region to buy from this shop" });
      }
      
      // Check stock availability (if not unlimited)
      if (stockItem.quantity !== -1) {
        // Get total purchased by this player today
        const purchasedResult = await db.execute(sql`
          SELECT COALESCE(SUM(quantity_purchased), 0) as total
          FROM npc_shop_purchases
          WHERE stock_id = ${stockId} AND player_id = ${player.id} AND purchased_at >= ${todayUTC}
        `);
        const alreadyPurchased = parseInt((purchasedResult.rows[0] as any)?.total || '0');
        const remaining = stockItem.quantity - alreadyPurchased;
        
        if (quantity > remaining) {
          return res.status(400).json({ error: `Only ${remaining} available` });
        }
      }
      
      // Canonicalize the item_id from the shop record to prevent duplicate inventory keys
      const canonicalShopItemId = await getCanonicalItemId(stockItem.item_id);

      // Check inventory limit
      const currentInventory = player.inventory as Record<string, number> || {};
      const currentQty = currentInventory[canonicalShopItemId] || 0;
      const limitCheck = canAddToInventory(canonicalShopItemId, currentQty, quantity);
      if (!limitCheck.allowed) {
        const limit = getInventoryLimit(canonicalShopItemId);
        return res.status(400).json({ error: "INVENTORY_LIMIT", limit, currentQty });
      }
      const actualQuantity = limitCheck.maxCanAdd;

      // Check gold
      const totalCost = stockItem.price_per_item * actualQuantity;
      if (player.gold < totalCost) {
        return res.status(400).json({ error: "Not enough gold" });
      }
      
      // Process purchase - update gold
      await storage.updatePlayer(player.id, { gold: player.gold - totalCost });
      
      // Add item to inventory
      await db.execute(sql`
        UPDATE players 
        SET inventory = jsonb_set(
          inventory, 
          ARRAY[${canonicalShopItemId}],
          to_jsonb(COALESCE((inventory->>${canonicalShopItemId})::integer, 0) + ${actualQuantity})
        )
        WHERE id = ${player.id}
      `);
      
      // Record purchase
      await db.execute(sql`
        INSERT INTO npc_shop_purchases (player_id, stock_id, quantity_purchased)
        VALUES (${player.id}, ${stockId}, ${actualQuantity})
      `);
      
      res.json({ 
        success: true, 
        itemId: canonicalShopItemId,
        quantity: actualQuantity,
        totalCost,
        newGold: player.gold - totalCost,
      });
    } catch (error) {
      console.error("Error in POST /api/npc-shops/:stockId/buy:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== WEAPON ENHANCEMENT ROUTES ====================

  async function separateItemForEnhancement(playerId: string, itemId: string): Promise<{ newItemId: string; separated: boolean }> {
    if (itemId.includes('#')) {
      return { newItemId: itemId, separated: false };
    }
    const shortId = randomUUID().replace(/-/g, '').slice(0, 6);
    const newItemId = `${itemId}#${shortId}`;
    
    const currentCountResult = await db.execute(sql`
      SELECT COALESCE((inventory->>${itemId})::integer, 0) as count
      FROM players WHERE id = ${playerId}
    `);
    const currentCount = (currentCountResult.rows[0] as any)?.count || 0;
    if (currentCount < 1) {
      throw new Error('Item not available in inventory for separation');
    }
    
    if (currentCount === 1) {
      const result = await db.execute(sql`
        UPDATE players 
        SET inventory = (inventory - ${itemId}) || jsonb_build_object(${newItemId}::text, 1)
        WHERE id = ${playerId}
          AND COALESCE((inventory->>${itemId})::integer, 0) >= 1
      `);
      if (result.rowCount === 0) {
        throw new Error('Item not available in inventory for separation');
      }
    } else {
      const result = await db.execute(sql`
        UPDATE players 
        SET inventory = jsonb_set(
          jsonb_set(
            inventory,
            ARRAY[${itemId}],
            to_jsonb((inventory->>${itemId})::integer - 1)
          ),
          ARRAY[${newItemId}],
          to_jsonb(1)
        )
        WHERE id = ${playerId}
          AND COALESCE((inventory->>${itemId})::integer, 0) >= 1
      `);
      if (result.rowCount === 0) {
        throw new Error('Item not available in inventory for separation');
      }
    }
    await db.execute(sql`
      UPDATE weapon_enhancements SET item_id = ${newItemId} 
      WHERE player_id = ${playerId} AND item_id = ${itemId}
    `);
    const playerData = await db.execute(sql`SELECT item_modifications FROM players WHERE id = ${playerId}`);
    const itemMods = ((playerData.rows[0] as any)?.item_modifications || {}) as Record<string, any>;
    if (itemMods[itemId]) {
      itemMods[newItemId] = itemMods[itemId];
      delete itemMods[itemId];
      await db.execute(sql`UPDATE players SET item_modifications = ${JSON.stringify(itemMods)}::jsonb WHERE id = ${playerId}`);
    }

    return { newItemId, separated: true };
  }

  // Get player's weapon enhancements
  app.get("/api/enhancements", authenticatePlayer as any, async (req: any, res) => {
    try {
      const player = req.player;
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const enhancementsResult = await db.execute(sql`
        SELECT * FROM weapon_enhancements WHERE player_id = ${player.id}
      `);
      
      const cursedItems = (player.cursedItems as string[]) || [];
      const itemModifications = (player.itemModifications as Record<string, any>) || {};
      const enhancementPity = (player.enhancementPity as { statFails: number; skillFails: number; upgradeFails: number }) || { statFails: 0, skillFails: 0, upgradeFails: 0 };
      
      const mergedMods = { ...itemModifications };
      for (const row of enhancementsResult.rows as any[]) {
        const itemId = row.item_id;
        const level = row.enhancement_level || 0;
        if (!mergedMods[itemId]) {
          mergedMods[itemId] = { addedStats: {}, addedSkills: [], enhancementLevel: level };
        } else {
          mergedMods[itemId] = { ...mergedMods[itemId], enhancementLevel: level };
        }
      }
      
      res.json({ 
        enhancements: enhancementsResult.rows,
        cursedItems,
        itemModifications: mergedMods,
        enhancementPity,
      });
    } catch (error) {
      console.error("Error in GET /api/enhancements:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Enhance a weapon (level upgrade with Jurax Gem)
  app.post("/api/enhancements/upgrade", authenticatePlayer as any, async (req: any, res) => {
    try {
      const player = req.player;
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { itemId, materialId, useDeathLiquid } = req.body;
      
      if (!itemId || !materialId) {
        return res.status(400).json({ error: "Missing itemId or materialId" });
      }
      
      const cursedItems = (player.cursedItems as string[]) || [];
      if (cursedItems.includes(itemId)) {
        return res.status(400).json({ error: "Cursed items cannot be enhanced" });
      }
      
      if (materialId !== 'jurax_gem') {
        return res.status(400).json({ error: "Only Jurax Gem can be used for level upgrades" });
      }
      
      const inventory = player.inventory as Record<string, number> || {};
      if (!inventory[itemId] || inventory[itemId] < 1) {
        return res.status(400).json({ error: "Weapon not in inventory" });
      }
      
      const baseId = itemId.split(' (')[0].split('#')[0];
      const itemCheck = await db.execute(sql`
        SELECT id, type FROM game_items WHERE id = ${baseId}
      `);
      if (itemCheck.rows.length === 0 || (itemCheck.rows[0] as any).type !== 'equipment') {
        return res.status(400).json({ error: "Only equipment items can be enhanced" });
      }
      
      if (!inventory[materialId] || inventory[materialId] < 1) {
        return res.status(400).json({ error: "Enhancement material not in inventory" });
      }
      
      if (useDeathLiquid) {
        if (!inventory['death_liquid'] || inventory['death_liquid'] < 1) {
          return res.status(400).json({ error: "Death Liquid not in inventory" });
        }
      }
      
      const { newItemId, separated } = await separateItemForEnhancement(player.id, itemId);
      
      // After separation, query the enhancement row for newItemId.
      // - If separated=true, separateItemForEnhancement already migrated the row to newItemId (if it existed).
      // - If separated=false (item already had #suffix), the row is its own legitimate record.
      // In both cases, if the row exists, it IS the correct record for this item — read currentLevel from it.
      const enhResult = await db.execute(sql`
        SELECT * FROM weapon_enhancements 
        WHERE player_id = ${player.id} AND item_id = ${newItemId}
      `);
      
      // currentLevel always comes from the DB row when it exists, regardless of separated flag.
      let currentLevel = 0;
      if (enhResult.rows.length > 0) {
        currentLevel = (enhResult.rows[0] as any).enhancement_level || 0;
      }
      
      if (currentLevel >= 10) {
        return res.status(400).json({ error: "Weapon is already at maximum enhancement (+10)" });
      }
      
      const pity = (player.enhancementPity as { statFails: number; skillFails: number; upgradeFails: number }) || { statFails: 0, skillFails: 0, upgradeFails: 0 };
      const pityBonus = pity.upgradeFails * 10;
      
      const baseSuccessRate = [100, 90, 80, 70, 60, 50, 40, 30, 20, 15][currentLevel];
      const materialBonus = materialId === 'jurax_gem' ? 15 : 0;
      const successRate = Math.min(100, baseSuccessRate + materialBonus + pityBonus);
      
      const burnRate = [0, 0, 0, 5, 10, 15, 25, 35, 45, 55][currentLevel];
      const burnProtected = useDeathLiquid;
      
      const roll = Math.random() * 100;
      const success = roll < successRate;
      
      await db.execute(sql`
        UPDATE players 
        SET inventory = CASE
          WHEN COALESCE((inventory->>${materialId})::integer, 0) <= 1
            THEN inventory - ${materialId}
          ELSE jsonb_set(inventory, ARRAY[${materialId}], to_jsonb((inventory->>${materialId})::integer - 1))
        END
        WHERE id = ${player.id}
      `);
      
      if (useDeathLiquid) {
        await db.execute(sql`
          UPDATE players 
          SET inventory = CASE
            WHEN COALESCE((inventory->>'death_liquid')::integer, 0) <= 1
              THEN inventory - 'death_liquid'
            ELSE jsonb_set(inventory, ARRAY['death_liquid'], to_jsonb((inventory->>'death_liquid')::integer - 1))
          END
          WHERE id = ${player.id}
        `);
      }
      
      // resolvedItemId tracks the final key used in DB — may change on true collision
      let resolvedItemId = newItemId;
      
      if (success) {
        if (enhResult.rows.length > 0) {
          // Legitimate existing row (from previous upgrade or migrated by separation) — just increment it
          await db.execute(sql`
            UPDATE weapon_enhancements 
            SET enhancement_level = enhancement_level + 1, updated_at = NOW()
            WHERE player_id = ${player.id} AND item_id = ${newItemId}
          `);
        } else {
          // No row exists yet for newItemId. PRE-WRITE collision check: confirm no row was
          // concurrently inserted since our initial query (race-condition guard).
          const preWriteCheck = await db.execute(sql`SELECT enhancement_level FROM weapon_enhancements WHERE player_id = ${player.id} AND item_id = ${newItemId}`);
          if (preWriteCheck.rows.length > 0) {
            // A row appeared between our initial query and now — true collision.
            // Disambiguate: rename this item to a unique key so enhancements stay independent.
            const { randomUUID } = await import('crypto');
            const collisionSuffix = randomUUID().replace(/-/g, '').slice(0, 6);
            const disambiguatedId = `${newItemId}#${collisionSuffix}`;
            console.warn(`[Enhancement Collision] player=${player.id} itemId=${newItemId} collision detected pre-write (existing level=${(preWriteCheck.rows[0] as any).enhancement_level}). Disambiguating to ${disambiguatedId}`);
            // Rename item in inventory
            await db.execute(sql`
              UPDATE players SET inventory = (inventory - ${newItemId}) || jsonb_build_object(${disambiguatedId}::text, 1) WHERE id = ${player.id}
            `);
            // Transfer itemModifications key
            const collisionPlayerData = await db.execute(sql`SELECT item_modifications FROM players WHERE id = ${player.id}`);
            const collisionMods = ((collisionPlayerData.rows[0] as any)?.item_modifications || {}) as Record<string, any>;
            if (collisionMods[newItemId]) {
              collisionMods[disambiguatedId] = collisionMods[newItemId];
              delete collisionMods[newItemId];
              await db.execute(sql`UPDATE players SET item_modifications = ${JSON.stringify(collisionMods)}::jsonb WHERE id = ${player.id}`);
            }
            // Insert fresh row for this item under its new unique key
            await db.execute(sql`
              INSERT INTO weapon_enhancements (player_id, item_id, enhancement_level)
              VALUES (${player.id}, ${disambiguatedId}, 1)
            `);
            resolvedItemId = disambiguatedId;
          } else {
            // No collision — safe to insert
            await db.execute(sql`
              INSERT INTO weapon_enhancements (player_id, item_id, enhancement_level)
              VALUES (${player.id}, ${newItemId}, 1)
            `);
          }
        }
        
        const freshPlayer = await storage.getPlayer(player.id);
        const freshItemMods = (freshPlayer?.itemModifications as Record<string, any>) || {};
        const currentItemMod = freshItemMods[resolvedItemId] || freshItemMods[newItemId] || { addedStats: {}, addedSkills: [], enhancementLevel: 0 };
        freshItemMods[resolvedItemId] = { ...currentItemMod, enhancementLevel: currentLevel + 1 };
        if (resolvedItemId !== newItemId) delete freshItemMods[newItemId];
        await db.execute(sql`
          UPDATE players SET item_modifications = ${JSON.stringify(freshItemMods)}::jsonb WHERE id = ${player.id}
        `);
        
        const newPity = { ...pity, upgradeFails: 0 };
        await db.execute(sql`
          UPDATE players SET enhancement_pity = ${JSON.stringify(newPity)}::jsonb WHERE id = ${player.id}
        `);
        
        const successPlayer = await storage.getPlayer(player.id);
        const successInventory = (successPlayer?.inventory as Record<string, number>) || {};
        
        res.json({ 
          success: true, 
          newLevel: currentLevel + 1,
          message: `Enhancement successful! Weapon is now +${currentLevel + 1}`,
          burned: false,
          newItemId: resolvedItemId,
          enhancementPity: newPity,
          inventory: successInventory,
        });
      } else {
        const newPity = { ...pity, upgradeFails: pity.upgradeFails + 1 };
        await db.execute(sql`
          UPDATE players SET enhancement_pity = ${JSON.stringify(newPity)}::jsonb WHERE id = ${player.id}
        `);
        
        const burnRoll = Math.random() * 100;
        const burned = !burnProtected && burnRoll < burnRate;
        
        if (burned) {
          await db.execute(sql`
            UPDATE players 
            SET inventory = inventory - ${newItemId}
            WHERE id = ${player.id}
          `);
          
          await db.execute(sql`
            DELETE FROM weapon_enhancements 
            WHERE player_id = ${player.id} AND item_id = ${newItemId}
          `);
          
          const freshPlayer2 = await storage.getPlayer(player.id);
          const freshItemMods2 = (freshPlayer2?.itemModifications as Record<string, any>) || {};
          if (freshItemMods2[newItemId]) {
            delete freshItemMods2[newItemId];
            await db.execute(sql`
              UPDATE players SET item_modifications = ${JSON.stringify(freshItemMods2)}::jsonb WHERE id = ${player.id}
            `);
          }
          
          const burnedPlayer = await storage.getPlayer(player.id);
          const burnedInventory = (burnedPlayer?.inventory as Record<string, number>) || {};
          
          res.json({ 
            success: false, 
            newLevel: 0,
            message: "Enhancement failed! The weapon was destroyed in the process.",
            burned: true,
            newItemId,
            enhancementPity: newPity,
            inventory: burnedInventory,
          });
        } else {
          const failPlayer = await storage.getPlayer(player.id);
          const failInventory = (failPlayer?.inventory as Record<string, number>) || {};
          
          res.json({ 
            success: false, 
            newLevel: currentLevel,
            message: useDeathLiquid 
              ? "Enhancement failed, but Death Liquid protected the weapon from destruction."
              : "Enhancement failed, but the weapon survived.",
            burned: false,
            newItemId,
            enhancementPity: newPity,
            inventory: failInventory,
          });
        }
      }
    } catch (error) {
      console.error("Error in POST /api/enhancements/upgrade:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Add random stat to equipment using Chaos Stone
  app.post("/api/enhancements/add-stat", authenticatePlayer as any, async (req: any, res) => {
    try {
      const player = req.player;
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { itemId } = req.body;
      
      if (!itemId) {
        return res.status(400).json({ error: "Missing itemId" });
      }
      
      const cursedItems = (player.cursedItems as string[]) || [];
      if (cursedItems.includes(itemId)) {
        return res.status(400).json({ error: "Cursed items cannot be enhanced" });
      }
      
      const inventory = player.inventory as Record<string, number> || {};
      if (!inventory[itemId] || inventory[itemId] < 1) {
        return res.status(400).json({ error: "Item not in inventory" });
      }
      
      if (!inventory['chaos_stone'] || inventory['chaos_stone'] < 1) {
        return res.status(400).json({ error: "Chaos Stone not in inventory" });
      }
      
      const itemMods = (player.itemModifications as Record<string, any>) || {};
      const currentMods = itemMods[itemId] || { addedStats: {}, addedSkills: [], enhancementLevel: 0 };
      const existingStatIds = Object.keys(currentMods.addedStats || {});
      
      if (existingStatIds.length >= 3) {
        return res.status(400).json({ error: "Maximum stats already added (3)" });
      }
      
      const allStats = [
        { id: 'bonusAttack', name: 'Attack', minValue: 5, maxValue: 25 },
        { id: 'bonusDefence', name: 'Defence', minValue: 5, maxValue: 25 },
        { id: 'bonusStrength', name: 'Strength', minValue: 5, maxValue: 25 },
        { id: 'bonusHitpoints', name: 'Hitpoints', minValue: 10, maxValue: 50 },
        { id: 'accuracy', name: 'Accuracy', minValue: 3, maxValue: 15 },
        { id: 'evasion', name: 'Evasion', minValue: 3, maxValue: 15 },
        { id: 'critChance', name: 'Crit Chance', minValue: 1, maxValue: 5 },
        { id: 'critDamage', name: 'Crit Damage', minValue: 5, maxValue: 20 },
        { id: 'lifesteal', name: 'Lifesteal', minValue: 1, maxValue: 5 },
        { id: 'damageReduction', name: 'Damage Reduction', minValue: 1, maxValue: 5 },
        { id: 'attackSpeed', name: 'Attack Speed', minValue: 1, maxValue: 3 },
      ];
      
      const availableStats = allStats.filter(s => !existingStatIds.includes(s.id));
      if (availableStats.length === 0) {
        return res.status(400).json({ error: "No available stats to add" });
      }
      
      const { newItemId, separated } = await separateItemForEnhancement(player.id, itemId);
      
      await db.execute(sql`
        UPDATE players 
        SET inventory = CASE
          WHEN COALESCE((inventory->>'chaos_stone')::integer, 0) <= 1
            THEN inventory - 'chaos_stone'
          ELSE jsonb_set(inventory, ARRAY['chaos_stone'], to_jsonb((inventory->>'chaos_stone')::integer - 1))
        END
        WHERE id = ${player.id}
      `);
      
      const pity = (player.enhancementPity as { statFails: number; skillFails: number; upgradeFails: number }) || { statFails: 0, skillFails: 0, upgradeFails: 0 };
      const pityBonus = pity.statFails * 10;
      
      const statSuccessRates = [60, 45, 30];
      const baseRate = statSuccessRates[Math.min(existingStatIds.length, statSuccessRates.length - 1)];
      const successRate = Math.min(100, baseRate + pityBonus);
      const success = Math.random() * 100 < successRate;
      
      if (success) {
        const randomStat = availableStats[Math.floor(Math.random() * availableStats.length)];
        const statValue = Math.floor(Math.random() * (randomStat.maxValue - randomStat.minValue + 1)) + randomStat.minValue;
        
        const freshPlayer = await storage.getPlayer(player.id);
        const freshItemMods = (freshPlayer?.itemModifications as Record<string, any>) || {};
        const enhRow = await db.execute(sql`SELECT enhancement_level FROM weapon_enhancements WHERE player_id = ${player.id} AND item_id = ${newItemId}`);
        const actualLevel = enhRow.rows.length > 0 ? (enhRow.rows[0] as any).enhancement_level : 0;
        const existingMods = freshItemMods[newItemId] || (separated ? { addedStats: {}, addedSkills: [], enhancementLevel: actualLevel } : currentMods);
        const modsForItem = { ...existingMods, enhancementLevel: actualLevel };
        
        const newMods = {
          ...modsForItem,
          addedStats: { ...modsForItem.addedStats, [randomStat.id]: statValue },
        };
        const newItemMods = { ...freshItemMods, [newItemId]: newMods };
        if (separated && freshItemMods[itemId]) {
          delete newItemMods[itemId];
        }
        
        const newPity = { ...pity, statFails: 0 };
        await db.execute(sql`
          UPDATE players 
          SET item_modifications = ${JSON.stringify(newItemMods)}::jsonb,
              enhancement_pity = ${JSON.stringify(newPity)}::jsonb
          WHERE id = ${player.id}
        `);
        
        const statSuccessPlayer = await storage.getPlayer(player.id);
        const statSuccessInventory = (statSuccessPlayer?.inventory as Record<string, number>) || {};
        
        res.json({ 
          success: true, 
          addedStat: { id: randomStat.id, name: randomStat.name, value: statValue },
          message: `Success! Added +${statValue} ${randomStat.name} to your weapon.`,
          cursed: false,
          newItemId,
          enhancementPity: newPity,
          inventory: statSuccessInventory,
        });
      } else {
        const freshPlayer = await storage.getPlayer(player.id);
        const freshCursed = (freshPlayer?.cursedItems as string[]) || [];
        const newCursedItems = [...freshCursed, newItemId];
        
        const newPity = { ...pity, statFails: pity.statFails + 1 };
        await db.execute(sql`
          UPDATE players 
          SET cursed_items = ${JSON.stringify(newCursedItems)}::jsonb,
              enhancement_pity = ${JSON.stringify(newPity)}::jsonb
          WHERE id = ${player.id}
        `);
        
        const statFailPlayer = await storage.getPlayer(player.id);
        const statFailInventory = (statFailPlayer?.inventory as Record<string, number>) || {};
        
        res.json({ 
          success: false, 
          addedStat: null,
          message: "Enhancement failed! The weapon has been cursed.",
          cursed: true,
          newItemId,
          enhancementPity: newPity,
          inventory: statFailInventory,
        });
      }
    } catch (error) {
      console.error("Error in POST /api/enhancements/add-stat:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Add random skill to equipment using Death Liquid
  app.post("/api/enhancements/add-skill", authenticatePlayer as any, async (req: any, res) => {
    try {
      const player = req.player;
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { itemId } = req.body;
      
      if (!itemId) {
        return res.status(400).json({ error: "Missing itemId" });
      }
      
      const cursedItems = (player.cursedItems as string[]) || [];
      if (cursedItems.includes(itemId)) {
        return res.status(400).json({ error: "Cursed items cannot be enhanced" });
      }
      
      const inventory = player.inventory as Record<string, number> || {};
      if (!inventory[itemId] || inventory[itemId] < 1) {
        return res.status(400).json({ error: "Item not in inventory" });
      }
      
      if (!inventory['death_liquid'] || inventory['death_liquid'] < 1) {
        return res.status(400).json({ error: "Death Liquid not in inventory" });
      }
      
      const itemMods = (player.itemModifications as Record<string, any>) || {};
      const currentMods = itemMods[itemId] || { addedStats: {}, addedSkills: [], enhancementLevel: 0 };
      const existingSkills = currentMods.addedSkills || [];
      
      if (existingSkills.length >= 2) {
        return res.status(400).json({ error: "Maximum skills already added (2)" });
      }
      
      const allSkills = [
        { id: 'poison', name: 'Poison' },
        { id: 'burn', name: 'Burn' },
        { id: 'bleed', name: 'Bleed' },
        { id: 'stun', name: 'Stun' },
        { id: 'freeze', name: 'Freeze' },
        { id: 'vampiric', name: 'Vampiric' },
        { id: 'execute', name: 'Execute' },
        { id: 'armor_pierce', name: 'Armor Pierce' },
      ];
      
      const availableSkills = allSkills.filter(s => !existingSkills.includes(s.id));
      if (availableSkills.length === 0) {
        return res.status(400).json({ error: "No available skills to add" });
      }
      
      const { newItemId, separated } = await separateItemForEnhancement(player.id, itemId);
      
      await db.execute(sql`
        UPDATE players 
        SET inventory = CASE
          WHEN COALESCE((inventory->>'death_liquid')::integer, 0) <= 1
            THEN inventory - 'death_liquid'
          ELSE jsonb_set(inventory, ARRAY['death_liquid'], to_jsonb((inventory->>'death_liquid')::integer - 1))
        END
        WHERE id = ${player.id}
      `);
      
      const pity = (player.enhancementPity as { statFails: number; skillFails: number; upgradeFails: number }) || { statFails: 0, skillFails: 0, upgradeFails: 0 };
      const pityBonus = pity.skillFails * 10;
      
      const skillSuccessRates = [50, 35];
      const baseRate = skillSuccessRates[Math.min(existingSkills.length, skillSuccessRates.length - 1)];
      const successRate = Math.min(100, baseRate + pityBonus);
      const success = Math.random() * 100 < successRate;
      
      if (success) {
        const randomSkill = availableSkills[Math.floor(Math.random() * availableSkills.length)];
        
        const freshPlayer = await storage.getPlayer(player.id);
        const freshItemMods = (freshPlayer?.itemModifications as Record<string, any>) || {};
        const enhRow = await db.execute(sql`SELECT enhancement_level FROM weapon_enhancements WHERE player_id = ${player.id} AND item_id = ${newItemId}`);
        const actualLevel = enhRow.rows.length > 0 ? (enhRow.rows[0] as any).enhancement_level : 0;
        const existingMods = freshItemMods[newItemId] || (separated ? { addedStats: {}, addedSkills: [], enhancementLevel: actualLevel } : currentMods);
        const modsForItem = { ...existingMods, enhancementLevel: actualLevel };
        
        const newMods = {
          ...modsForItem,
          addedSkills: [...(modsForItem.addedSkills || []), randomSkill.id],
        };
        const newItemMods = { ...freshItemMods, [newItemId]: newMods };
        if (separated && freshItemMods[itemId]) {
          delete newItemMods[itemId];
        }
        
        const newPity = { ...pity, skillFails: 0 };
        await db.execute(sql`
          UPDATE players 
          SET item_modifications = ${JSON.stringify(newItemMods)}::jsonb,
              enhancement_pity = ${JSON.stringify(newPity)}::jsonb
          WHERE id = ${player.id}
        `);
        
        const skillSuccessPlayer = await storage.getPlayer(player.id);
        const skillSuccessInventory = (skillSuccessPlayer?.inventory as Record<string, number>) || {};
        
        res.json({ 
          success: true, 
          addedSkill: { id: randomSkill.id, name: randomSkill.name },
          message: `Success! Added ${randomSkill.name} skill to your weapon.`,
          cursed: false,
          newItemId,
          enhancementPity: newPity,
          inventory: skillSuccessInventory,
        });
      } else {
        const freshPlayer = await storage.getPlayer(player.id);
        const freshCursed = (freshPlayer?.cursedItems as string[]) || [];
        const newCursedItems = [...freshCursed, newItemId];
        
        const newPity = { ...pity, skillFails: pity.skillFails + 1 };
        await db.execute(sql`
          UPDATE players 
          SET cursed_items = ${JSON.stringify(newCursedItems)}::jsonb,
              enhancement_pity = ${JSON.stringify(newPity)}::jsonb
          WHERE id = ${player.id}
        `);
        
        const skillFailPlayer = await storage.getPlayer(player.id);
        const skillFailInventory = (skillFailPlayer?.inventory as Record<string, number>) || {};
        
        res.json({ 
          success: false, 
          addedSkill: null,
          message: "Enhancement failed! The weapon has been cursed.",
          cursed: true,
          newItemId,
          enhancementPity: newPity,
          inventory: skillFailInventory,
        });
      }
    } catch (error) {
      console.error("Error in POST /api/enhancements/add-skill:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Enhancement integrity sync: reconcile weapon_enhancements table with itemModifications JSON.
  // weapon_enhancements is the authoritative store. This routine brings itemModifications in sync.
  // Reconciles: missing keys, level mismatch, addedStats drift, addedSkills drift.
  // Single shared routine used by both login path and the manual sync endpoint.
  async function syncEnhancementIntegrity(playerId: string): Promise<{ synced: number; details: string[] }> {
    const details: string[] = [];
    let synced = 0;
    try {
      const playerData = await db.execute(sql`SELECT item_modifications FROM players WHERE id = ${playerId}`);
      if (!playerData.rows.length) return { synced: 0, details: [] };
      const itemMods = ((playerData.rows[0] as any)?.item_modifications || {}) as Record<string, any>;

      const enhRows = await db.execute(sql`SELECT item_id, enhancement_level, added_stats, added_skills FROM weapon_enhancements WHERE player_id = ${playerId}`);
      const updatedMods = { ...itemMods };

      for (const row of enhRows.rows as any[]) {
        const itemId = row.item_id;
        const level = row.enhancement_level || 0;
        const addedStats = row.added_stats || {};
        const addedSkills = row.added_skills || [];
        const existing = updatedMods[itemId];

        if (!existing) {
          // weapon_enhancements has data that itemModifications doesn't — restore it
          updatedMods[itemId] = { addedStats, addedSkills, enhancementLevel: level };
          details.push(`Restored missing itemModifications for ${itemId} (level=${level})`);
          synced++;
        } else {
          let changed = false;
          const patch: Record<string, any> = { ...existing };

          if (existing.enhancementLevel !== level) {
            patch.enhancementLevel = level;
            details.push(`Fixed level for ${itemId}: ${existing.enhancementLevel} -> ${level}`);
            changed = true;
          }

          // Reconcile addedStats: merge server (DB) entries not in itemModifications
          const existingStats = existing.addedStats || {};
          const mergedStats = { ...existingStats };
          let statsChanged = false;
          for (const [stat, value] of Object.entries(addedStats)) {
            if (mergedStats[stat] === undefined || mergedStats[stat] !== value) {
              mergedStats[stat] = value;
              statsChanged = true;
            }
          }
          if (statsChanged) {
            patch.addedStats = mergedStats;
            details.push(`Fixed addedStats for ${itemId}`);
            changed = true;
          }

          // Reconcile addedSkills: union of DB and itemModifications
          const existingSkills: string[] = existing.addedSkills || [];
          const mergedSkills = Array.from(new Set([...existingSkills, ...addedSkills]));
          if (mergedSkills.length !== existingSkills.length || mergedSkills.some((s, i) => s !== existingSkills[i])) {
            patch.addedSkills = mergedSkills;
            details.push(`Fixed addedSkills for ${itemId}`);
            changed = true;
          }

          if (changed) {
            updatedMods[itemId] = patch;
            synced++;
          }
        }
      }

      if (synced > 0) {
        await db.execute(sql`UPDATE players SET item_modifications = ${JSON.stringify(updatedMods)}::jsonb WHERE id = ${playerId}`);
        console.log(`[EnhancementSync] Player ${playerId}: synced ${synced} entries. ${details.join('; ')}`);
      }
    } catch (err) {
      console.error(`[EnhancementSync] Error for player ${playerId}:`, err);
    }
    return { synced, details };
  }

  // GET /api/enhancements/sync — Sync enhancement integrity for the authenticated player
  app.post("/api/enhancements/sync", authenticatePlayer as any, async (req: any, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(404).json({ error: "Player not found" });
      const result = await syncEnhancementIntegrity(player.id);
      const freshPlayer = await storage.getPlayer(player.id);
      res.json({
        success: true,
        synced: result.synced,
        details: result.details,
        itemModifications: freshPlayer?.itemModifications || {},
      });
    } catch (error) {
      console.error("Error in POST /api/enhancements/sync:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== NOTIFICATION ROUTES ====================

  // Get player's notifications
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const unreadOnly = req.query.unreadOnly === 'true';
      
      const notifications = await storage.getNotifications(player.id, limit, unreadOnly);
      const unreadCount = await storage.getUnreadNotificationCount(player.id);
      
      res.json({ notifications, unreadCount });
    } catch (error) {
      console.error("Error in GET /api/notifications:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mark notifications as read (also deletes persistent ones after read)
  app.patch("/api/notifications/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { ids } = req.body;
      const count = await storage.markNotificationsRead(player.id, ids);
      
      // Delete persistent notifications that were just marked as read
      // (they should be deleted once viewed)
      await storage.deleteReadPersistentNotifications(player.id);
      
      res.json({ success: true, markedCount: count });
    } catch (error) {
      console.error("Error in PATCH /api/notifications/read:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get player's current gold (for polling/sync)
  app.get("/api/players/gold", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const firebaseUid = req.user.firebaseUid;
      
      // Try userId first, then fall back to firebaseUid
      let player = await storage.getPlayerByUserId(userId);
      if (!player && firebaseUid) {
        player = await storage.getPlayerByFirebaseUid(firebaseUid);
      }
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      res.json({ gold: player.gold });
    } catch (error) {
      console.error("Error in GET /api/players/gold:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== GUILD ROUTES ====================

  // Get all guilds
  app.get("/api/guilds", async (req, res) => {
    try {
      const guilds = await storage.getAllGuilds();
      
      // Add member counts
      const guildsWithCounts = await Promise.all(guilds.map(async (guild) => {
        const members = await storage.getGuildMembers(guild.id);
        return { ...guild, memberCount: members.length };
      }));
      
      res.json(guildsWithCounts);
    } catch (error) {
      console.error("Error in GET /api/guilds:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Search guilds
  app.get("/api/guilds/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.status(400).json({ error: "Search query must be at least 2 characters" });
      }
      
      const guilds = await storage.searchGuilds(query);
      res.json(guilds);
    } catch (error) {
      console.error("Error in GET /api/guilds/search:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get player's current guild
  app.get("/api/guilds/my", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const result = await storage.getPlayerGuild(player.id);
      
      if (!result) {
        return res.json({ guild: null, membership: null });
      }

      // Get member count and upgrades
      const members = await storage.getGuildMembers(result.guild.id);
      const upgrades = await storage.getGuildUpgrades(result.guild.id);
      
      // Calculate bonuses from upgrades
      const upgradeMap: Record<string, number> = {};
      for (const upgrade of upgrades) {
        upgradeMap[upgrade.upgradeType] = upgrade.level;
      }
      const bonuses = calculateGuildBonuses(upgradeMap);
      
      res.json({
        guild: { ...result.guild, memberCount: members.length },
        membership: result.membership,
        upgrades,
        bonuses,
      });
    } catch (error) {
      console.error("Error in GET /api/guilds/my:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create a new guild
  app.post("/api/guilds", isAuthenticated, async (req: any, res) => {
    try {
      console.log("[GuildCreate] Starting guild creation request");
      const userId = req.user.claims.sub;
      console.log("[GuildCreate] User ID:", userId);
      
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        console.log("[GuildCreate] Player not found for userId:", userId);
        return res.status(404).json({ error: "Player not found" });
      }
      console.log("[GuildCreate] Found player:", player.id, player.username);

      // Check if player is already in a guild
      console.log("[GuildCreate] Checking existing guild membership...");
      const existingGuild = await storage.getPlayerGuild(player.id);
      if (existingGuild) {
        console.log("[GuildCreate] Player already in guild:", existingGuild.guild?.name);
        return res.status(400).json({ error: "You are already in a guild" });
      }
      console.log("[GuildCreate] Player has no existing guild");

      // Check if player has enough gold
      console.log("[GuildCreate] Player gold:", player.gold, "Required:", GUILD_CREATION_COST);
      if (player.gold < GUILD_CREATION_COST) {
        return res.status(400).json({ error: `Creating a guild requires ${GUILD_CREATION_COST} gold` });
      }

      const { name, description, emblem, emblemColor, entryType, minTotalLevel } = req.body;
      console.log("[GuildCreate] Request body:", { name, description, emblem, emblemColor, entryType, minTotalLevel });

      // Validate name
      if (!name || name.length < 3 || name.length > 32) {
        console.log("[GuildCreate] Invalid name length:", name?.length);
        return res.status(400).json({ error: "Guild name must be 3-32 characters" });
      }

      // Check if name is taken
      console.log("[GuildCreate] Checking if name is taken:", name);
      const existingName = await storage.getGuildByName(name);
      if (existingName) {
        console.log("[GuildCreate] Name already taken");
        return res.status(400).json({ error: "This guild name is already taken" });
      }
      console.log("[GuildCreate] Name is available");

      // Deduct gold from player
      console.log("[GuildCreate] Deducting gold from player...");
      await storage.updatePlayer(player.id, { gold: player.gold - GUILD_CREATION_COST });

      // Create guild
      console.log("[GuildCreate] Creating guild in database...");
      const guild = await storage.createGuild({
        name,
        description: description || null,
        emblem: emblem || 'shield',
        emblemColor: emblemColor || '#8b5cf6',
        leaderId: player.id,
        entryType: entryType || 'request',
        minTotalLevel: minTotalLevel || 10,
      });
      console.log("[GuildCreate] Guild created with ID:", guild.id);

      // Add creator as leader
      console.log("[GuildCreate] Adding player as guild leader...");
      await storage.addGuildMember({
        guildId: guild.id,
        playerId: player.id,
        role: 'leader',
      });
      console.log("[GuildCreate] Player added as leader");

      // Send system message
      console.log("[GuildCreate] Creating system message...");
      await storage.createGuildMessage({
        guildId: guild.id,
        playerId: player.id,
        playerName: player.username,
        messageType: 'system',
        content: `${player.username} founded the guild!`,
      });
      console.log("[GuildCreate] Guild creation successful!");

      res.json(guild);
    } catch (error: any) {
      console.error("[GuildCreate] ERROR:", error);
      console.error("[GuildCreate] Error message:", error?.message);
      console.error("[GuildCreate] Error stack:", error?.stack);
      const errorMessage = error?.message || "Internal server error";
      res.status(500).json({ error: `Failed to create guild: ${errorMessage}` });
    }
  });

  // Get guild by ID with full details
  app.get("/api/guilds/:id", async (req, res) => {
    try {
      const guild = await storage.getGuild(req.params.id);
      
      if (!guild) {
        return res.status(404).json({ error: "Guild not found" });
      }

      const members = await storage.getGuildMembers(guild.id);
      const upgrades = await storage.getGuildUpgrades(guild.id);
      
      res.json({
        ...guild,
        memberCount: members.length,
        members,
        upgrades,
      });
    } catch (error) {
      console.error("Error in GET /api/guilds/:id:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update guild settings (leader/officer only)
  app.patch("/api/guilds/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild || playerGuild.guild.id !== req.params.id) {
        return res.status(403).json({ error: "Bu loncada yetkin yok" });
      }

      if (playerGuild.membership.role !== 'leader' && playerGuild.membership.role !== 'officer') {
        return res.status(403).json({ error: "Only leaders and officers can change settings" });
      }

      const { description, entryType, minTotalLevel } = req.body;
      
      const updates: Record<string, any> = {};
      if (description !== undefined) updates.description = description;
      if (entryType) updates.entryType = entryType;
      if (minTotalLevel !== undefined) updates.minTotalLevel = Math.max(0, minTotalLevel);

      const guild = await storage.updateGuild(req.params.id, updates);
      res.json(guild);
    } catch (error) {
      console.error("Error in PATCH /api/guilds/:id:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Join a public guild directly
  app.post("/api/guilds/:id/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Guest accounts cannot join guilds
      if (player.isGuest === 1) {
        return res.status(403).json({ error: "Guest accounts cannot join guilds. Register your account!" });
      }

      // Check if player is already in a guild
      const existingGuild = await storage.getPlayerGuild(player.id);
      if (existingGuild) {
        return res.status(400).json({ error: "You are already in a guild" });
      }

      const guild = await storage.getGuild(req.params.id);
      if (!guild) {
        return res.status(404).json({ error: "Guild not found" });
      }

      // Check minimum level
      if (player.totalLevel < guild.minTotalLevel) {
        return res.status(400).json({ error: `Minimum toplam seviye: ${guild.minTotalLevel}` });
      }

      // Check member limit
      const members = await storage.getGuildMembers(guild.id);
      const upgrades = await storage.getGuildUpgrades(guild.id);
      const capacityUpgrade = upgrades.find(u => u.upgradeType === 'member_capacity');
      const bonusCapacity = capacityUpgrade ? GUILD_UPGRADES.member_capacity.effect(capacityUpgrade.level) : 0;
      const maxMembers = guild.baseMemberLimit + bonusCapacity;
      
      if (members.length >= maxMembers) {
        return res.status(400).json({ error: "Lonca dolu" });
      }

      // If public, join directly
      if (guild.entryType === 'public') {
        await storage.addGuildMember({
          guildId: guild.id,
          playerId: player.id,
          role: 'member',
        });

        await storage.createGuildMessage({
          guildId: guild.id,
          playerId: player.id,
          playerName: player.username,
          messageType: 'system',
          content: `${player.username} joined the guild!`,
        });

        return res.json({ success: true, joined: true });
      }

      // If invite-only, reject
      if (guild.entryType === 'invite') {
        return res.status(400).json({ error: "This guild only accepts members by invite" });
      }

      // If request-based, create join request
      const existingRequests = await storage.getPlayerJoinRequests(player.id);
      const pendingRequest = existingRequests.find(r => r.guildId === guild.id && r.status === 'pending');
      if (pendingRequest) {
        return res.status(400).json({ error: "You already have a pending application" });
      }

      await storage.createJoinRequest({
        guildId: guild.id,
        playerId: player.id,
        playerName: player.username,
        playerTotalLevel: player.totalLevel,
        message: req.body.message || null,
      });

      res.json({ success: true, requestSent: true });
    } catch (error) {
      console.error("Error in POST /api/guilds/:id/join:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Leave guild
  app.post("/api/guilds/:id/leave", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild || playerGuild.guild.id !== req.params.id) {
        return res.status(400).json({ error: "You are not in this guild" });
      }

      // Leaders can't leave, they must transfer or disband
      if (playerGuild.membership.role === 'leader') {
        return res.status(400).json({ error: "Leaders cannot leave. Transfer leadership or disband the guild first." });
      }

      await storage.removeGuildMember(playerGuild.guild.id, player.id);

      await storage.createGuildMessage({
        guildId: playerGuild.guild.id,
        playerId: player.id,
        playerName: player.username,
        messageType: 'system',
        content: `${player.username} left the guild.`,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error in POST /api/guilds/:id/leave:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Kick a member (leader/officer only)
  app.post("/api/guilds/:id/kick/:playerId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild || playerGuild.guild.id !== req.params.id) {
        return res.status(403).json({ error: "Bu loncada yetkin yok" });
      }

      if (playerGuild.membership.role !== 'leader' && playerGuild.membership.role !== 'officer') {
        return res.status(403).json({ error: "Yetkin yok" });
      }

      const targetPlayerId = req.params.playerId;
      
      // Can't kick yourself
      if (targetPlayerId === player.id) {
        return res.status(400).json({ error: "You cannot kick yourself" });
      }

      // Get target member
      const targetMember = await storage.getPlayerGuild(targetPlayerId);
      if (!targetMember || targetMember.guild.id !== playerGuild.guild.id) {
        return res.status(400).json({ error: "Player is not in this guild" });
      }

      // Officers can't kick officers or leader
      if (playerGuild.membership.role === 'officer' && targetMember.membership.role !== 'member') {
        return res.status(403).json({ error: "Officers can only kick members" });
      }

      // Leader can't be kicked
      if (targetMember.membership.role === 'leader') {
        return res.status(400).json({ error: "The leader cannot be kicked" });
      }

      const targetPlayer = await storage.getPlayer(targetPlayerId);
      await storage.removeGuildMember(playerGuild.guild.id, targetPlayerId);

      await storage.createGuildMessage({
        guildId: playerGuild.guild.id,
        playerId: player.id,
        playerName: player.username,
        messageType: 'system',
        content: `${targetPlayer?.username || 'Player'} was kicked from the guild.`,
      });

      // Notify kicked player
      if (targetPlayer) {
        await storage.createNotification({
          playerId: targetPlayerId,
          type: 'GUILD_KICKED',
          message: `You were kicked from "${playerGuild.guild.name}".`,
          payload: {
            guildId: playerGuild.guild.id,
            guildName: playerGuild.guild.name,
            kickedBy: player.username
          },
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error in POST /api/guilds/:id/kick/:playerId:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update member role (leader only)
  app.patch("/api/guilds/:id/members/:playerId/role", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild || playerGuild.guild.id !== req.params.id) {
        return res.status(403).json({ error: "Bu loncada yetkin yok" });
      }

      if (playerGuild.membership.role !== 'leader') {
        return res.status(403).json({ error: "Only the leader can change roles" });
      }

      const { role } = req.body;
      if (!['officer', 'member'].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      const targetPlayerId = req.params.playerId;
      
      // Can't change own role
      if (targetPlayerId === player.id) {
        return res.status(400).json({ error: "You cannot change your own role" });
      }

      await storage.updateMemberRole(playerGuild.guild.id, targetPlayerId, role);
      res.json({ success: true });
    } catch (error) {
      console.error("Error in PATCH /api/guilds/:id/members/:playerId/role:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Transfer leadership (leader only)
  app.post("/api/guilds/:id/transfer/:playerId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild || playerGuild.guild.id !== req.params.id) {
        return res.status(403).json({ error: "Bu loncada yetkin yok" });
      }

      if (playerGuild.membership.role !== 'leader') {
        return res.status(403).json({ error: "Only the leader can transfer leadership" });
      }

      const targetPlayerId = req.params.playerId;
      
      // Verify target is in guild
      const targetMember = await storage.getPlayerGuild(targetPlayerId);
      if (!targetMember || targetMember.guild.id !== playerGuild.guild.id) {
        return res.status(400).json({ error: "Player is not in this guild" });
      }

      // Update roles
      await storage.updateMemberRole(playerGuild.guild.id, player.id, 'member');
      await storage.updateMemberRole(playerGuild.guild.id, targetPlayerId, 'leader');
      await storage.updateGuild(playerGuild.guild.id, { leaderId: targetPlayerId });

      const targetPlayer = await storage.getPlayer(targetPlayerId);
      await storage.createGuildMessage({
        guildId: playerGuild.guild.id,
        playerId: player.id,
        playerName: player.username,
        messageType: 'system',
        content: `${player.username} transferred leadership to ${targetPlayer?.username || 'a player'}.`,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error in POST /api/guilds/:id/transfer/:playerId:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Disband guild (leader only)
  app.delete("/api/guilds/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild || playerGuild.guild.id !== req.params.id) {
        return res.status(403).json({ error: "Bu loncada yetkin yok" });
      }

      if (playerGuild.membership.role !== 'leader') {
        return res.status(403).json({ error: "Only the leader can disband the guild" });
      }

      await storage.deleteGuild(playerGuild.guild.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error in DELETE /api/guilds/:id:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get guild join requests (leader/officer only)
  app.get("/api/guilds/:id/requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild || playerGuild.guild.id !== req.params.id) {
        return res.status(403).json({ error: "Bu loncada yetkin yok" });
      }

      if (playerGuild.membership.role !== 'leader' && playerGuild.membership.role !== 'officer') {
        return res.status(403).json({ error: "Yetkin yok" });
      }

      const requests = await storage.getGuildJoinRequests(req.params.id);
      res.json(requests);
    } catch (error) {
      console.error("Error in GET /api/guilds/:id/requests:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Respond to join request (leader/officer only)
  app.post("/api/guilds/:id/requests/:requestId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild || playerGuild.guild.id !== req.params.id) {
        return res.status(403).json({ error: "Bu loncada yetkin yok" });
      }

      if (playerGuild.membership.role !== 'leader' && playerGuild.membership.role !== 'officer') {
        return res.status(403).json({ error: "Yetkin yok" });
      }

      const { action } = req.body;
      if (!['accept', 'reject'].includes(action)) {
        return res.status(400).json({ error: "Invalid action" });
      }

      const status = action === 'accept' ? 'accepted' : 'rejected';
      const request = await storage.respondToJoinRequest(req.params.requestId, status, player.id);

      if (!request) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (action === 'accept') {
        // Check member limit before adding
        const members = await storage.getGuildMembers(playerGuild.guild.id);
        const upgrades = await storage.getGuildUpgrades(playerGuild.guild.id);
        const capacityUpgrade = upgrades.find(u => u.upgradeType === 'member_capacity');
        const bonusCapacity = capacityUpgrade ? GUILD_UPGRADES.member_capacity.effect(capacityUpgrade.level) : 0;
        const maxMembers = playerGuild.guild.baseMemberLimit + bonusCapacity;
        
        if (members.length >= maxMembers) {
          return res.status(400).json({ error: "Lonca dolu" });
        }

        await storage.addGuildMember({
          guildId: playerGuild.guild.id,
          playerId: request.playerId,
          role: 'member',
        });

        await storage.createGuildMessage({
          guildId: playerGuild.guild.id,
          playerId: request.playerId,
          playerName: request.playerName,
          messageType: 'system',
          content: `${request.playerName} joined the guild!`,
        });

        // Notify applicant of acceptance
        await storage.createNotification({
          playerId: request.playerId,
          type: 'GUILD_REQUEST_ACCEPTED',
          message: `Your application to "${playerGuild.guild.name}" was accepted!`,
          payload: {
            guildId: playerGuild.guild.id,
            guildName: playerGuild.guild.name,
            acceptedBy: player.username
          },
        });
      } else {
        // Notify applicant of rejection
        await storage.createNotification({
          playerId: request.playerId,
          type: 'GUILD_REQUEST_REJECTED',
          message: `Your application to "${playerGuild.guild.name}" was rejected.`,
          payload: {
            guildId: playerGuild.guild.id,
            guildName: playerGuild.guild.name
          },
        });
      }

      res.json({ success: true, request });
    } catch (error) {
      console.error("Error in POST /api/guilds/:id/requests/:requestId:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get guild messages (members only)
  app.get("/api/guilds/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild || playerGuild.guild.id !== req.params.id) {
        return res.status(403).json({ error: "You are not in this guild" });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const messages = await storage.getGuildMessages(req.params.id, limit);
      res.json(messages);
    } catch (error) {
      console.error("Error in GET /api/guilds/:id/messages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Send guild message (members only)
  app.post("/api/guilds/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild || playerGuild.guild.id !== req.params.id) {
        return res.status(403).json({ error: "You are not in this guild" });
      }

      const { content, messageType } = req.body;
      
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: "Message cannot be empty" });
      }

      if (content.length > 500) {
        return res.status(400).json({ error: "Message too long (max 500 characters)" });
      }

      // Only officers/leaders can post announcements
      const type = messageType === 'announcement' 
        && (playerGuild.membership.role === 'leader' || playerGuild.membership.role === 'officer')
        ? 'announcement' 
        : 'chat';

      const message = await storage.createGuildMessage({
        guildId: req.params.id,
        playerId: player.id,
        playerName: player.username,
        messageType: type,
        content: content.trim(),
      });

      res.json(message);
    } catch (error) {
      console.error("Error in POST /api/guilds/:id/messages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Purchase guild upgrade (leader only)
  app.post("/api/guilds/:id/upgrades", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild || playerGuild.guild.id !== req.params.id) {
        return res.status(403).json({ error: "Bu loncada yetkin yok" });
      }

      if (playerGuild.membership.role !== 'leader') {
        return res.status(403).json({ error: "Only the leader can purchase upgrades" });
      }

      const { upgradeType } = req.body;
      
      if (!GUILD_UPGRADES[upgradeType]) {
        return res.status(400).json({ error: "Invalid upgrade type" });
      }

      const upgradeDef = GUILD_UPGRADES[upgradeType];
      const currentUpgrades = await storage.getGuildUpgrades(playerGuild.guild.id);
      const currentUpgrade = currentUpgrades.find(u => u.upgradeType === upgradeType);
      const currentLevel = currentUpgrade?.level || 0;

      if (currentLevel >= upgradeDef.maxLevel) {
        return res.status(400).json({ error: "This upgrade is at maximum level" });
      }

      // Get resource costs for this level
      const resourceCosts = getUpgradeResourceCosts(upgradeType, currentLevel);

      // Use atomic transaction to check and deduct resources + create upgrade
      const result = await storage.purchaseGuildUpgradeWithBankResources(
        playerGuild.guild.id, 
        upgradeType, 
        resourceCosts
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error || "Upgrade failed" });
      }

      const upgrade = result.upgrade;

      await storage.createGuildMessage({
        guildId: playerGuild.guild.id,
        playerId: player.id,
        playerName: player.username,
        messageType: 'system',
        content: `${player.username} purchased ${upgradeDef.name} upgrade! (Level ${(currentLevel || 0) + 1})`,
      });

      res.json({ success: true, upgrade });
    } catch (error) {
      console.error("Error in POST /api/guilds/:id/upgrades:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Add contribution (called internally when player gains XP)
  // Guild XP contribution - supports both old and new parameter names
  const handleGuildContribution = async (req: any, res: any) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Support both xpGained and xpAmount for backward compatibility
      const xpGained = req.body.xpGained || req.body.xpAmount || 0;
      
      if (!xpGained || xpGained <= 0) {
        return res.json({ contributed: false });
      }

      // Calculate contribution based on XP and player level
      const contribution = calculateGuildContribution(xpGained, player.totalLevel);
      
      if (contribution <= 0) {
        return res.json({ contributed: false });
      }

      const result = await storage.addGuildContribution(player.id, contribution);
      
      if (!result) {
        return res.json({ contributed: false, reason: "not_in_guild" });
      }

      res.json({
        contributed: true,
        memberContribution: result.memberContribution,
        guildXp: result.guildXp,
        guildLevelUp: result.guildLevelUp,
      });
    } catch (error) {
      console.error("Error in guild contribution:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  // Both endpoints for backward compatibility
  app.post("/api/guilds/contribute", isAuthenticated, handleGuildContribution);
  app.post("/api/guilds/my/contribute", isAuthenticated, handleGuildContribution);

  // ==================== Guild Invite System ====================
  
  // Send invite to a player
  app.post("/api/guilds/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild) {
        return res.status(400).json({ error: "You are not in a guild" });
      }

      if (playerGuild.membership.role !== 'leader' && playerGuild.membership.role !== 'officer') {
        return res.status(403).json({ error: "Only leaders and officers can send invites" });
      }

      const { targetPlayerId } = req.body;
      if (!targetPlayerId) {
        return res.status(400).json({ error: "Hedef oyuncu belirtilmeli" });
      }

      // Prevent self-invite
      if (targetPlayerId === player.id) {
        return res.status(400).json({ error: "You cannot invite yourself" });
      }

      // Check if target player exists
      const targetPlayer = await storage.getPlayer(targetPlayerId);
      if (!targetPlayer) {
        return res.status(404).json({ error: "Target player not found" });
      }

      // Check if target is already in a guild
      const targetGuild = await storage.getPlayerGuild(targetPlayerId);
      if (targetGuild) {
        return res.status(400).json({ error: "This player is already in a guild" });
      }

      // Check if there's already a pending invite
      const hasPending = await storage.hasPendingInvite(playerGuild.guild.id, targetPlayerId);
      if (hasPending) {
        return res.status(400).json({ error: "An invite has already been sent to this player" });
      }

      // Check member capacity
      const guild = playerGuild.guild;
      const members = await storage.getGuildMembers(guild.id);
      const memberCapacityUpgrade = await storage.getGuildUpgrades(guild.id);
      const capacityLevel = memberCapacityUpgrade.find(u => u.upgradeType === 'member_capacity')?.level || 0;
      const maxMembers = 10 + (capacityLevel * 5);
      
      if (members.length >= maxMembers) {
        return res.status(400).json({ error: "Lonca kapasitesi dolu" });
      }

      // Create invite
      const invite = await storage.createGuildInvite({
        guildId: guild.id,
        guildName: guild.name,
        inviterId: player.id,
        inviterName: player.username,
        targetPlayerId: targetPlayerId,
        targetPlayerName: targetPlayer.username,
      });

      // Create notification for target player
      await storage.createNotification({
        playerId: targetPlayerId,
        type: 'GUILD_INVITE',
        message: `${player.username} invited you to the guild "${guild.name}"!`,
        payload: { 
          inviteId: invite.id, 
          guildId: guild.id, 
          guildName: guild.name,
          inviterName: player.username 
        },
      });

      res.json({ success: true, invite });
    } catch (error) {
      console.error("Error in POST /api/guilds/invites:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get player's pending invites
  app.get("/api/guilds/invites/my", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const invites = await storage.getPlayerPendingInvites(player.id);
      
      // Fetch guild and inviter info for each invite
      const enrichedInvites = await Promise.all(invites.map(async (invite) => {
        const guild = await storage.getGuild(invite.guildId);
        const inviter = await storage.getPlayer(invite.inviterId);
        return {
          ...invite,
          guildName: guild?.name,
          guildEmblem: guild?.emblem,
          guildColor: guild?.emblemColor,
          guildLevel: guild?.level,
          inviterName: inviter?.username,
        };
      }));

      res.json(enrichedInvites);
    } catch (error) {
      console.error("Error in GET /api/guilds/invites/my:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get guild's sent invites (for leaders/officers)
  app.get("/api/guilds/:id/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild || playerGuild.guild.id !== req.params.id) {
        return res.status(403).json({ error: "You do not have access to this guild" });
      }

      if (playerGuild.membership.role !== 'leader' && playerGuild.membership.role !== 'officer') {
        return res.status(403).json({ error: "Only leaders and officers can view invites" });
      }

      const invites = await storage.getGuildSentInvites(req.params.id);
      
      // Fetch target player info
      const enrichedInvites = await Promise.all(invites.map(async (invite) => {
        const targetPlayer = await storage.getPlayer(invite.targetPlayerId);
        const inviter = await storage.getPlayer(invite.inviterId);
        return {
          ...invite,
          targetPlayerName: targetPlayer?.username,
          targetPlayerLevel: targetPlayer?.totalLevel,
          inviterName: inviter?.username,
        };
      }));

      res.json(enrichedInvites);
    } catch (error) {
      console.error("Error in GET /api/guilds/:id/invites:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Respond to invite (accept/reject)
  app.post("/api/guilds/invites/:inviteId/respond", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { accept } = req.body;
      if (typeof accept !== 'boolean') {
        return res.status(400).json({ error: "accept parameter is required" });
      }

      // Guest accounts cannot join guilds (only check when accepting)
      if (accept && player.isGuest === 1) {
        return res.status(403).json({ error: "Guest accounts cannot join guilds. Register your account!" });
      }

      const result = await storage.respondToGuildInvite(req.params.inviteId, player.id, accept);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error in POST /api/guilds/invites/:inviteId/respond:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cancel sent invite
  app.delete("/api/guilds/:guildId/invites/:inviteId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const playerGuild = await storage.getPlayerGuild(player.id);
      if (!playerGuild || playerGuild.guild.id !== req.params.guildId) {
        return res.status(403).json({ error: "You do not have access to this guild" });
      }

      if (playerGuild.membership.role !== 'leader' && playerGuild.membership.role !== 'officer') {
        return res.status(403).json({ error: "Only leaders and officers can cancel invites" });
      }

      const success = await storage.cancelGuildInvite(req.params.inviteId, req.params.guildId);
      
      if (!success) {
        return res.status(404).json({ error: "Invite not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error in DELETE /api/guilds/:guildId/invites/:inviteId:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Push Notification Endpoints
  app.get('/api/push/vapid-public-key', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
  });

  // Push subscription - uses Firebase auth
  app.post('/api/push/subscribe', async (req: any, res) => {
    try {
      // Try Firebase auth first
      const authHeader = req.headers.authorization;
      let player = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await verifyFirebaseToken(idToken);
        if (decodedToken) {
          const firebaseUid = getFirebaseUidFromToken(decodedToken);
          player = await storage.getPlayerByFirebaseUid(firebaseUid);
        }
      }
      
      // Fallback to session token
      if (!player) {
        const sessionToken = req.headers['x-session-token'] as string;
        if (sessionToken) {
          player = await storage.getPlayerBySessionToken(sessionToken);
        }
      }
      
      if (!player) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const subscription = req.body;
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: "Invalid subscription data" });
      }

      await saveSubscription(player.id, subscription);
      console.log(`[Push] Subscription saved for player ${player.id}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Push subscribe error:", error);
      res.status(500).json({ error: "Abonelik kaydedilemedi" });
    }
  });

  // Push unsubscription - uses Firebase auth
  app.post('/api/push/unsubscribe', async (req: any, res) => {
    try {
      // Try Firebase auth first
      const authHeader = req.headers.authorization;
      let player = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await verifyFirebaseToken(idToken);
        if (decodedToken) {
          const firebaseUid = getFirebaseUidFromToken(decodedToken);
          player = await storage.getPlayerByFirebaseUid(firebaseUid);
        }
      }
      
      // Fallback to session token
      if (!player) {
        const sessionToken = req.headers['x-session-token'] as string;
        if (sessionToken) {
          player = await storage.getPlayerBySessionToken(sessionToken);
        }
      }
      
      if (player) {
        await deleteSubscription(player.id);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Push unsubscribe error:", error);
      res.status(500).json({ error: "Abonelik iptal edilemedi" });
    }
  });

  // Test endpoint to send a push notification to yourself - uses Firebase auth
  app.post('/api/push/test', async (req: any, res) => {
    try {
      // Try Firebase auth first
      const authHeader = req.headers.authorization;
      let player = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await verifyFirebaseToken(idToken);
        if (decodedToken) {
          const firebaseUid = getFirebaseUidFromToken(decodedToken);
          player = await storage.getPlayerByFirebaseUid(firebaseUid);
        }
      }
      
      // Fallback to session token
      if (!player) {
        const sessionToken = req.headers['x-session-token'] as string;
        if (sessionToken) {
          player = await storage.getPlayerBySessionToken(sessionToken);
        }
      }
      
      if (!player) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const subscription = await getSubscription(player.id);
      if (!subscription) {
        return res.status(400).json({ error: "Push notification subscription not found. Enable notifications first." });
      }

      const payload = JSON.stringify({
        title: 'IdleThrone',
        body: 'Push notifications are working!',
        url: '/'
      });

      await webpush.sendNotification(subscription, payload);
      console.log(`[Push] Test notification sent to player ${player.id}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Push test error:", error);
      // Provide more details about webpush errors
      if (error.statusCode === 410) {
        res.status(400).json({ error: "Subscription expired. Please re-enable notifications." });
      } else {
        res.status(500).json({ error: "Failed to send notification" });
      }
    }
  });

  // =============================================================================
  // GAME DATA API ENDPOINTS (Items, Recipes, Regions, Monsters)
  // =============================================================================

  // Get all game items
  app.get('/api/game/items', async (req, res) => {
    try {
      const items = await storage.getAllGameItems();
      // Use database translations if available, fallback to legacy itemTranslations, then to item name/description
      const enrichedItems = items.map(item => {
        const dbNameTrans = item.nameTranslations as Record<string, string> || {};
        const dbDescTrans = item.descriptionTranslations as Record<string, string> || {};
        const legacyTrans = itemTranslations[item.name] || {};
        
        // Merge new DB columns into stats object for frontend compatibility
        const existingStats = (item.stats as Record<string, number>) || {};
        const mergedStats = {
          ...existingStats,
          // Armor-type specific bonuses
          ...(item.skillDamageBonus && item.skillDamageBonus > 0 ? { skillDamageBonus: item.skillDamageBonus } : {}),
          ...(item.attackSpeedBonus && item.attackSpeedBonus > 0 ? { attackSpeedBonus: item.attackSpeedBonus } : {}),
          ...(item.healingReceivedBonus && item.healingReceivedBonus > 0 ? { healingReceivedBonus: item.healingReceivedBonus } : {}),
          // Staff-specific bonuses
          ...(item.onHitHealingPercent && item.onHitHealingPercent > 0 ? { onHitHealingPercent: item.onHitHealingPercent } : {}),
          ...(item.buffDurationBonus && item.buffDurationBonus > 0 ? { buffDurationBonus: item.buffDurationBonus } : {}),
          ...(item.partyDpsBuff && item.partyDpsBuff > 0 ? { partyDpsBuff: item.partyDpsBuff } : {}),
          ...(item.partyDefenceBuff && item.partyDefenceBuff > 0 ? { partyDefenceBuff: item.partyDefenceBuff } : {}),
          ...(item.partyAttackSpeedBuff && item.partyAttackSpeedBuff > 0 ? { partyAttackSpeedBuff: item.partyAttackSpeedBuff } : {}),
          ...(item.lootChanceBonus && item.lootChanceBonus > 0 ? { lootChanceBonus: item.lootChanceBonus } : {}),
        };
        
        return {
          ...item,
          stats: Object.keys(mergedStats).length > 0 ? mergedStats : item.stats,
          nameTranslations: Object.keys(dbNameTrans).length > 0 ? dbNameTrans : (Object.keys(legacyTrans).length > 0 ? legacyTrans : { en: item.name }),
          descriptionTranslations: Object.keys(dbDescTrans).length > 0 ? dbDescTrans : { en: item.description || '' }
        };
      });
      const filteredItems = req.query.includeDrafts === '1'
        ? enrichedItems
        : enrichedItems.filter(item => !item.isDraft || item.isDraft === 0);
      res.json(filteredItems);
    } catch (error) {
      console.error("Error fetching game items:", error);
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  // Get all game recipes
  app.get('/api/game/recipes', async (req, res) => {
    try {
      const recipes = await storage.getAllGameRecipes();
      const filteredRecipes = req.query.includeDrafts === '1'
        ? recipes
        : recipes.filter(recipe => !recipe.isDraft || recipe.isDraft === 0);
      res.json(filteredRecipes);
    } catch (error) {
      console.error("Error fetching game recipes:", error);
      res.status(500).json({ error: "Failed to fetch recipes" });
    }
  });

  // Get all skill actions (mining, woodcutting, fishing)
  app.get('/api/game/skill-actions', async (req, res) => {
    try {
      const skillActions = await storage.getAllSkillActions();
      const filteredActions = req.query.includeDrafts === '1'
        ? skillActions
        : skillActions.filter(action => !action.isDraft || action.isDraft === 0);
      res.json(filteredActions);
    } catch (error) {
      console.error("Error fetching skill actions:", error);
      res.status(500).json({ error: "Failed to fetch skill actions" });
    }
  });

  app.get('/api/game/dungeons', async (req, res) => {
    try {
      const allDungeons = await db.select().from(dungeons);
      res.json(allDungeons);
    } catch (error) {
      console.error("Error fetching public dungeons:", error);
      res.status(500).json({ error: "Failed to fetch dungeons" });
    }
  });

  app.get('/api/game/dungeon-loot-tables', async (req, res) => {
    try {
      const tables = await db.select().from(dungeonLootTables);
      res.json(tables);
    } catch (error) {
      console.error("Error fetching dungeon loot tables:", error);
      res.status(500).json({ error: "Failed to fetch dungeon loot tables" });
    }
  });

  // Get all equipment sets
  app.get('/api/game/equipment-sets', async (req, res) => {
    try {
      const sets = await storage.getAllEquipmentSets();
      res.json(sets);
    } catch (error) {
      console.error("Error fetching equipment sets:", error);
      res.status(500).json({ error: "Failed to fetch equipment sets" });
    }
  });

  // Get all combat regions
  app.get('/api/game/regions', async (req, res) => {
    try {
      const regions = await storage.getAllCombatRegions();
      const enrichedRegions = regions.map(region => ({
        ...region,
        nameTranslations: regionTranslations[region.name] || { en: region.name, tr: region.name },
        descriptionTranslations: region.description ? { en: region.description, tr: region.description } : {}
      }));
      res.json(enrichedRegions);
    } catch (error) {
      console.error("Error fetching combat regions:", error);
      res.status(500).json({ error: "Failed to fetch regions" });
    }
  });

  // Get all monsters
  app.get('/api/game/monsters', async (req, res) => {
    try {
      const monsters = await storage.getAllGameMonsters();
      const enrichedMonsters = monsters.map(monster => ({
        ...monster,
        nameTranslations: monsterTranslations[monster.name] || { en: monster.name, tr: monster.name }
      }));
      const filteredMonsters = req.query.includeDrafts === '1'
        ? enrichedMonsters
        : enrichedMonsters.filter(monster => !monster.isDraft || monster.isDraft === 0);
      res.json(filteredMonsters);
    } catch (error) {
      console.error("Error fetching monsters:", error);
      res.status(500).json({ error: "Failed to fetch monsters" });
    }
  });

  // Get monsters by region
  app.get('/api/game/regions/:regionId/monsters', async (req, res) => {
    try {
      const monsters = await storage.getMonstersByRegion(req.params.regionId);
      const filteredMonsters = req.query.includeDrafts === '1'
        ? monsters
        : monsters.filter(monster => !monster.isDraft || monster.isDraft === 0);
      res.json(filteredMonsters);
    } catch (error) {
      console.error("Error fetching monsters by region:", error);
      res.status(500).json({ error: "Failed to fetch monsters" });
    }
  });

  // =============================================================================
  // GUILD RAID API ENDPOINTS
  // =============================================================================

  // Get all raid bosses
  app.get('/api/raids/bosses', async (req, res) => {
    try {
      const bosses = await storage.getAllRaidBosses();
      res.json(bosses);
    } catch (error) {
      console.error("Error fetching raid bosses:", error);
      res.status(500).json({ error: "Failed to fetch bosses" });
    }
  });

  // Get current week's boss
  app.get('/api/raids/current-boss', async (req, res) => {
    try {
      const result = await storage.getCurrentWeekBossWithReset();
      if (!result) return res.json(null);
      res.json({ ...result.boss, weekEndsAt: result.weekEndsAt.toISOString() });
    } catch (error) {
      console.error("Error fetching current boss:", error);
      res.status(500).json({ error: "Failed to fetch current boss" });
    }
  });

  // Get player's guild active raid
  app.get('/api/raids/active', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const guildInfo = await storage.getPlayerGuild(player.id);
      if (!guildInfo) return res.json(null);

      const raid = await storage.getActiveGuildRaid(guildInfo.guild.id);
      if (!raid) return res.json(null);

      let participation = await storage.getRaidParticipation(raid.id, player.id);
      
      if (participation) {
        const now = new Date();
        const lastReset = new Date(participation.last_attack_reset);
        const nowUTCDate = now.toISOString().split('T')[0];
        const lastResetUTCDate = lastReset.toISOString().split('T')[0];
        if (nowUTCDate !== lastResetUTCDate) {
          await storage.resetDailyRaidAttacks(raid.id, player.id);
          participation = { ...participation, attacks_today: 0 };
        }
      }
      
      const leaderboard = await storage.getRaidLeaderboard(raid.id, 10);

      res.json({ raid, participation, leaderboard });
    } catch (error) {
      console.error("Error fetching active raid:", error);
      res.status(500).json({ error: "Failed to fetch raid" });
    }
  });

  app.get('/api/raids/completed', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const guildInfo = await storage.getPlayerGuild(player.id);
      if (!guildInfo) return res.status(400).json({ error: "Not in a guild" });

      const raid = await storage.getLastCompletedGuildRaid(guildInfo.guild.id);
      if (!raid) return res.json(null);

      const participation = await storage.getRaidParticipation(raid.id, player.id);
      if (!participation) return res.json(null);

      if (participation.kill_reward_claimed) return res.json(null);

      const leaderboard = await storage.getRaidLeaderboard(raid.id, 10);

      res.json({ raid, participation, leaderboard });
    } catch (error) {
      console.error("Error fetching completed raid:", error);
      res.status(500).json({ error: "Failed to fetch completed raid" });
    }
  });

  app.post('/api/raids/claim-completion-rewards', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const guildInfo = await storage.getPlayerGuild(player.id);
      if (!guildInfo) return res.status(400).json({ error: "Not in a guild" });

      const raid = await storage.getLastCompletedGuildRaid(guildInfo.guild.id);
      if (!raid) return res.status(404).json({ error: "No completed raid found" });

      const participation = await storage.getRaidParticipation(raid.id, player.id);
      if (!participation) return res.status(400).json({ error: "Did not participate in this raid" });

      if (participation.kill_reward_claimed) {
        return res.status(400).json({ error: "Rewards already claimed" });
      }

      const rewards: { tokens: number; items: { itemId: string; qty: number }[]; guildCoins: number } = {
        tokens: 0,
        items: [],
        guildCoins: 0,
      };

      rewards.tokens += participation.tokens_earned || 0;

      if (raid.status === 'completed') {
        const boss = await storage.getRaidBoss(raid.boss_id);
        if (boss) {
          rewards.tokens += boss.tokenReward || 0;
          
          const lootTable = boss.loot as { itemId: string; chance: number; minQty: number; maxQty: number }[] || [];
          for (const lootEntry of lootTable) {
            if (Math.random() < lootEntry.chance) {
              const qty = Math.floor(Math.random() * (lootEntry.maxQty - lootEntry.minQty + 1)) + lootEntry.minQty;
              rewards.items.push({ itemId: lootEntry.itemId, qty });
            }
          }
        }

        const milestoneRewards = raid.milestone_rewards as Record<string, any> || {};
        if (milestoneRewards["0"]) {
          const killReward = milestoneRewards["0"];
          if (killReward.raidTokens) rewards.tokens += killReward.raidTokens;
          if (killReward.guildCoins) rewards.guildCoins += killReward.guildCoins;
          if (killReward.items) {
            for (const item of killReward.items) {
              rewards.items.push({ itemId: item.itemId, qty: item.qty || 1 });
            }
          }
        }
      }

      const milestoneRewards = raid.milestone_rewards as Record<string, any> || {};
      for (const milestone of [75, 50, 25]) {
        const milestoneField = `milestone_${milestone}_claimed`;
        const milestoneReachedField = `milestone_${milestone}_reached`;
        if ((raid as any)[milestoneReachedField] && !(participation as any)[milestoneField]) {
          const reward = milestoneRewards[String(milestone)];
          if (reward) {
            if (reward.raidTokens) rewards.tokens += reward.raidTokens;
            if (reward.guildCoins) rewards.guildCoins += reward.guildCoins;
            if (reward.items) {
              for (const item of reward.items) {
                rewards.items.push({ itemId: item.itemId, qty: item.qty || 1 });
              }
            }
          }
        }
      }

      if (rewards.tokens > 0) {
        await storage.addRaidTokens(player.id, rewards.tokens);
      }

      if (rewards.items.length > 0) {
        for (const item of rewards.items) {
          const canonicalItemId = await getCanonicalItemId(item.itemId);
          await db.execute(sql`
            UPDATE players 
            SET inventory = jsonb_set(
              COALESCE(inventory, '{}'::jsonb),
              ARRAY[${canonicalItemId}],
              to_jsonb(COALESCE((inventory->>${canonicalItemId})::integer, 0) + ${item.qty})
            )
            WHERE id = ${player.id}
          `);
        }
      }

      if (rewards.guildCoins > 0) {
        await db.execute(sql`
          UPDATE guilds SET bank_resources = jsonb_set(
            COALESCE(bank_resources, '{"gold":0}'::jsonb),
            '{gold}',
            to_jsonb(COALESCE((bank_resources->>'gold')::integer, 0) + ${rewards.guildCoins})
          ) WHERE id = ${guildInfo.guild.id}
        `);
      }

      await db.execute(sql`
        UPDATE raid_participation 
        SET kill_reward_claimed = 1,
            milestone_75_claimed = 1,
            milestone_50_claimed = 1,
            milestone_25_claimed = 1
        WHERE raid_id = ${raid.id} AND player_id = ${player.id}
      `);

      res.json({
        success: true,
        rewards,
        raidStatus: raid.status,
        bossName: raid.boss_name,
        totalDamage: participation.total_damage,
        raidTotalDamage: raid.total_damage,
      });
    } catch (error) {
      console.error("Error claiming completion rewards:", error);
      res.status(500).json({ error: "Failed to claim rewards" });
    }
  });

  // Start a guild raid
  app.post('/api/raids/start', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const guildInfo = await storage.getPlayerGuild(player.id);
      if (!guildInfo) return res.status(400).json({ error: "Not in a guild" });
      
      if (!['leader', 'officer'].includes(guildInfo.membership.role)) {
        return res.status(403).json({ error: "Only leaders and officers can start raids" });
      }

      const existingRaid = await storage.getActiveGuildRaid(guildInfo.guild.id);
      if (existingRaid) return res.status(400).json({ error: "A raid is already active" });

      const { bossId, difficulty = 'normal' } = req.body;
      
      const boss = await storage.getRaidBoss(bossId);
      if (!boss) return res.status(404).json({ error: "Boss not found" });

      if (boss.isPremium) {
        const activityPoints = await storage.getGuildActivityPoints(guildInfo.guild.id);
        if (activityPoints.current < boss.premiumActivityCost) {
          return res.status(400).json({ error: "Not enough activity points" });
        }
        await storage.spendGuildActivityPoints(guildInfo.guild.id, boss.premiumActivityCost);
      }

      const raid = await storage.createGuildRaid(guildInfo.guild.id, bossId, difficulty, player.id);
      res.json(raid);
    } catch (error) {
      console.error("Error starting raid:", error);
      res.status(500).json({ error: "Failed to start raid" });
    }
  });

  // Attack raid boss (60 second auto-combat with boss counterattack)
  // Raid attack payload validation
  const raidAttackSchema = z.object({
    autoEatEnabled: z.boolean().default(true),
    autoEatThreshold: z.number().min(10).max(90).default(50),
    selectedFood: z.string().nullable().default(null),
    testMode: z.boolean().optional().default(false),
  });

  app.post('/api/raids/attack', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });
      
      // Validate and get auto-eat settings from client
      const parseResult = raidAttackSchema.safeParse(req.body || {});
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request parameters" });
      }
      const { autoEatEnabled, autoEatThreshold, selectedFood } = parseResult.data;

      const guildInfo = await storage.getPlayerGuild(player.id);
      if (!guildInfo) return res.status(400).json({ error: "Not in a guild" });

      const raid = await storage.getActiveGuildRaid(guildInfo.guild.id);
      if (!raid) return res.status(404).json({ error: "No active raid" });

      const boss = await storage.getRaidBoss(raid.boss_id);
      if (!boss) return res.status(404).json({ error: "Boss data not found" });

      let participation = await storage.getRaidParticipation(raid.id, player.id);
      if (!participation) {
        participation = await storage.createRaidParticipation(raid.id, player.id);
      }

      // Check daily attack limit (5 attacks per day, unlimited in test mode)
      // Use UTC date to match frontend countdown calculation
      const now = new Date();
      const lastReset = new Date(participation.last_attack_reset);
      const nowUTCDate = now.toISOString().split('T')[0];
      const lastResetUTCDate = lastReset.toISOString().split('T')[0];
      if (nowUTCDate !== lastResetUTCDate) {
        // Reset daily attacks in database when a new UTC day starts
        await storage.resetDailyRaidAttacks(raid.id, player.id);
        participation.attacks_today = 0;
      }
      const isDev = process.env.NODE_ENV === 'development';
      const { testMode } = parseResult.data;
      const isTestModeActive = isDev && testMode === true;
      
      // Skip attack limit check in test mode (unlimited attacks)
      if (!isTestModeActive && participation.attacks_today >= 5) {
        return res.status(400).json({ error: "Daily attack limit reached (5/5)" });
      }

      // Load enhancement levels from weapon_enhancements table
      let enhancementLevels = new Map<string, number>();
      try {
        const enhancementResult = await db.execute(sql`
          SELECT item_id, enhancement_level 
          FROM weapon_enhancements 
          WHERE player_id = ${player.id}
        `);
        for (const row of enhancementResult.rows as any[]) {
          if (row.enhancement_level > 0) {
            enhancementLevels.set(row.item_id, row.enhancement_level);
          }
        }
      } catch (e) {}

      // Load guild bonuses
      const guildBonuses = await storage.getPlayerGuildBonuses(player.id);

      // Load party passive buffs
      let partyBuffs = { foodHealBonus: 0, defenseBonus: 0, attackBonus: 0, hasHealer: false, hasTank: false, hasDps: false };
      try {
        const [foundMembership] = await db.select()
          .from(partyMembers)
          .where(eq(partyMembers.playerId, player.id));
        if (foundMembership) {
          const allMembers = await db.select({ cachedWeaponType: partyMembers.cachedWeaponType })
            .from(partyMembers)
            .where(eq(partyMembers.partyId, foundMembership.partyId));
          const weaponTypes = allMembers.map(m => m.cachedWeaponType);
          partyBuffs = calculatePartyPassiveBuffs(weaponTypes);
        }
      } catch (e) {}

      // Resolve all player combat stats via centralized resolver
      const skills = player.skills as Record<string, { xp: number; level: number }>;
      const equipment = player.equipment as Record<string, string | null>;
      const activeBuffs = (player.activeBuffs || []) as Array<{ effectType: string; value: number; expiresAt: number }>;
      const itemModifications = (player.itemModifications as Record<string, any>) || {};

      const stats = resolvePlayerCombatStats({
        skills,
        equipment,
        itemModifications,
        activeBuffs,
        guildBonuses,
        partyBuffs,
        combatStyle: "balanced",
        enhancementLevels,
      });

      // Player combat stats
      const playerMaxHp = stats.maxHp;
      let playerCurrentHp = playerMaxHp;
      
      // Boss stats (scaled by difficulty)
      const difficultyMultiplier = raid.difficulty_multiplier || 1;
      const bossAttack = (boss.attackLevel || 50) * difficultyMultiplier;
      const bossStrength = (boss.strengthLevel || 50) * difficultyMultiplier;
      const bossDefence = boss.defenceLevel || 50;
      
      // Combat simulation: 30 seconds, player attacks based on weapon speed, boss attacks every 3s
      const COMBAT_DURATION = 30;
      const PLAYER_ATTACK_INTERVAL = stats.finalAttackSpeedMs / 1000;
      const BOSS_ATTACK_INTERVAL = 3.0;
      const AUTO_EAT_COOLDOWN = 0.25;
      // Use client-provided threshold (convert from 0-100 to 0-1)
      const AUTO_EAT_THRESHOLD_VALUE = Math.min(90, Math.max(10, autoEatThreshold)) / 100;
      const HEALING_REDUCTION = 0.2; // Mortal Wounds debuff - 80% healing reduction
      
      // Get player's food from inventory
      const inventory = player.inventory as Record<string, number>;
      let foodCount = 0;
      let foodHealAmount = Math.floor(playerMaxHp * 0.3); // Default heals 30% of max HP
      let selectedFoodId: string | null = null;
      
      // If auto-eat is enabled and a food is selected, use that food
      if (autoEatEnabled && selectedFood && inventory[selectedFood] > 0) {
        selectedFoodId = selectedFood;
        foodCount = inventory[selectedFood];
        // Get actual heal amount from food data
        const actualHeal = getFoodHealAmount(selectedFood);
        if (actualHeal > 0) {
          foodHealAmount = actualHeal;
        }
      } else if (autoEatEnabled) {
        // Fallback: use best food in inventory
        const bestFood = getBestFood(inventory);
        if (bestFood) {
          selectedFoodId = bestFood;
          foodCount = inventory[bestFood];
          const actualHeal = getFoodHealAmount(bestFood);
          if (actualHeal > 0) {
            foodHealAmount = actualHeal;
          }
        }
      }
      
      // Raid provides 20 emergency rations if no food available
      if (foodCount === 0 && autoEatEnabled) {
        foodCount = 20;
        foodHealAmount = Math.floor(playerMaxHp * 0.3); // Emergency rations heal 30%
      }
      
      // Combat log for frontend
      const combatLog: { time: number; type: string; message: string; damage?: number }[] = [];
      
      // Streak bonus: 10% per day, max 50%
      const currentStreak = participation.current_streak || 0;
      const streakBonus = Math.min(currentStreak * 0.1, 0.5);
      
      // Calculate player damage per hit (boosted for raid - hitting a giant boss!)
      const RAID_PLAYER_DAMAGE_MULTIPLIER = 20; // Player deals 20x damage in raids
      const effectiveStrength = stats.strengthLevel + stats.equipBonuses.strengthBonus;
      const playerMaxHit = Math.floor((1 + (effectiveStrength * 0.5)) * RAID_PLAYER_DAMAGE_MULTIPLIER * (1 + stats.buffs.strengthBoostPercent / 100) * stats.styleModifiers.damageMod);
      const playerMinHit = Math.floor((1 + (effectiveStrength * 0.12)) * RAID_PLAYER_DAMAGE_MULTIPLIER * (1 + stats.buffs.strengthBoostPercent / 100) * stats.styleModifiers.damageMod);
      const defenseMultiplier = Math.max(0.25, 80 / (80 + bossDefence));
      
      // Calculate boss damage per hit (reduced for raid - boss is meant to be tanky, not deadly)
      const RAID_BOSS_DAMAGE_MULTIPLIER = 0.3; // Boss deals 30% of normal damage
      const bossMaxHit = Math.floor((1 + (bossStrength * 0.5)) * COMBAT_HP_SCALE * RAID_BOSS_DAMAGE_MULTIPLIER);
      const bossMinHit = Math.floor((1 + (bossStrength * 0.12)) * COMBAT_HP_SCALE * RAID_BOSS_DAMAGE_MULTIPLIER);
      const totalDefense = stats.defenceLevel + stats.equipBonuses.defenceBonus;
      const playerDamageReduction = Math.min(0.85, Math.min(0.75, totalDefense / (totalDefense + DEFENCE_DR_CONSTANT)) + (stats.buffs.damageReductionPercent / 100));
      
      let totalDamage = 0;
      let playerDied = false;
      let deathTime = 0;
      let lastAutoEatTime = -AUTO_EAT_COOLDOWN;
      let bossEnraged = false;
      let mortalWoundsActive = false;
      
      // Boss HP thresholds for burst damage
      let bossCurrentHpPercent = (raid.current_hp / raid.max_hp) * 100;
      const burst50Triggered = bossCurrentHpPercent <= 50;
      const burst25Triggered = bossCurrentHpPercent <= 25;
      
      // Track next attack times for precise timing
      let nextPlayerAttack = PLAYER_ATTACK_INTERVAL;
      let nextBossAttack = BOSS_ATTACK_INTERVAL;
      let burst50Done = false;
      let burst40Done = false;
      
      // Simulate combat tick by tick (100ms steps)
      for (let time = 0; time <= COMBAT_DURATION && !playerDied; time += 0.1) {
        // Player attacks - while loop to catch up on missed attacks
        while (time >= nextPlayerAttack && nextPlayerAttack <= COMBAT_DURATION) {
          const attackTime = nextPlayerAttack;
          nextPlayerAttack += PLAYER_ATTACK_INTERVAL;
          
          const hitRoll = Math.random();
          const hitChance = Math.min(0.95, 0.85 * (1 + stats.buffs.attackBoostPercent / 100));
          if (hitRoll < hitChance) {
            const rawDamage = Math.floor(playerMinHit + Math.random() * (playerMaxHit - playerMinHit + 1));
            let finalDamage = Math.max(1, Math.floor(rawDamage * defenseMultiplier * (1 + streakBonus)));
            
            const totalCritChance = Math.min(0.5, Math.max(0.1, (stats.equipBonuses.critChance + stats.buffs.critChancePercent) / 100));
            const isCrit = Math.random() < totalCritChance;
            if (isCrit) {
              totalDamage += finalDamage * 2;
              combatLog.push({ time: attackTime, type: 'player_crit', message: `CRITICAL! You deal ${finalDamage * 2} damage!`, damage: finalDamage * 2 });
            } else {
              totalDamage += finalDamage;
              combatLog.push({ time: attackTime, type: 'player_hit', message: `You strike for ${finalDamage} damage`, damage: finalDamage });
            }

            const appliedDamage = isCrit ? finalDamage * 2 : finalDamage;
            const totalLifesteal = stats.weaponLifestealPercent + stats.buffs.lifestealBuffPercent;
            if (totalLifesteal > 0) {
              const healAmt = Math.floor(appliedDamage * totalLifesteal / 100);
              if (healAmt > 0) {
                playerCurrentHp = Math.min(playerMaxHp, playerCurrentHp + healAmt);
              }
            }
          } else {
            combatLog.push({ time: attackTime, type: 'player_miss', message: 'Your attack misses!' });
          }
        }
        
        // Boss attacks - while loop to catch up on missed attacks
        while (time >= nextBossAttack && nextBossAttack <= COMBAT_DURATION) {
          const bossAttackTime = nextBossAttack;
          nextBossAttack += BOSS_ATTACK_INTERVAL;
          
          const hitRoll = Math.random();
          const bossHitChance = 0.7 + (bossEnraged ? 0.15 : 0);
          
          if (hitRoll < bossHitChance) {
            let rawDamage = Math.floor(bossMinHit + Math.random() * (bossMaxHit - bossMinHit + 1));
            if (bossEnraged) {
              rawDamage = Math.floor(rawDamage * 1.5);
            }
            
            const finalDamage = Math.max(1, Math.floor(rawDamage * (1 - playerDamageReduction)));
            playerCurrentHp -= finalDamage;
            
            combatLog.push({ time: bossAttackTime, type: 'boss_hit', message: `Boss hits you for ${finalDamage} damage!`, damage: finalDamage });
            
            if (Math.random() < 0.08 && !mortalWoundsActive) {
              mortalWoundsActive = true;
              combatLog.push({ time: bossAttackTime, type: 'boss_skill', message: 'Mortal Wounds! Healing reduced by 80%!' });
            }
          } else {
            combatLog.push({ time: bossAttackTime, type: 'boss_miss', message: 'Boss attack misses!' });
          }
        }
        
        // Burst damage at HP thresholds - using >= and guard flags
        if (time >= 15 && burst50Triggered && !bossEnraged && !burst50Done) {
          burst50Done = true;
          bossEnraged = true;
          const burstDamage = Math.floor(playerMaxHp * 0.4);
          playerCurrentHp -= burstDamage;
          combatLog.push({ time: 15, type: 'boss_burst', message: `ENRAGE! Boss deals ${burstDamage} burst damage!`, damage: burstDamage });
        }
        
        if (time >= 40 && burst25Triggered && !burst40Done) {
          burst40Done = true;
          const burstDamage = Math.floor(playerMaxHp * 0.5);
          playerCurrentHp -= burstDamage;
          combatLog.push({ time: 40, type: 'boss_burst', message: `FURY! Boss deals ${burstDamage} massive damage!`, damage: burstDamage });
        }
        
        // Auto-eat check (1 second cooldown, triggers at threshold HP)
        if (autoEatEnabled && 
            playerCurrentHp < playerMaxHp * AUTO_EAT_THRESHOLD_VALUE && 
            time - lastAutoEatTime >= AUTO_EAT_COOLDOWN && 
            foodCount > 0) {
          let healAmount = foodHealAmount;
          if (mortalWoundsActive) {
            healAmount = Math.floor(healAmount * HEALING_REDUCTION);
            combatLog.push({ time, type: 'heal_reduced', message: `Mortal Wounds reduces healing to ${healAmount}!` });
          }
          const healingReceivedMod = 1 + (stats.equipBonuses.healingReceivedBonus / 100);
          healAmount = Math.floor(healAmount * healingReceivedMod);
          playerCurrentHp = Math.min(playerMaxHp, playerCurrentHp + healAmount);
          foodCount--;
          lastAutoEatTime = time;
          combatLog.push({ time, type: 'auto_eat', message: `Auto-eat heals ${healAmount} HP (${foodCount} food left)` });
        }
        
        // Check death
        if (playerCurrentHp <= 0) {
          playerDied = true;
          deathTime = time;
          combatLog.push({ time, type: 'death', message: 'You have been defeated!' });
        }
      }
      
      // Calculate final results
      let finalDamage = totalDamage;
      let finalTokens = 0;
      let streakLost = false;
      let survivalBonus = 0;
      
      if (playerDied) {
        // Death penalty: damage reduced by 50%, streak lost
        finalDamage = Math.floor(totalDamage * 0.5);
        streakLost = true;
        await storage.resetRaidStreak(raid.id, player.id);
        combatLog.push({ time: deathTime, type: 'penalty', message: `Fled battle! Damage reduced to ${finalDamage}` });
      } else {
        // Survival bonus based on remaining HP
        const hpPercent = (playerCurrentHp / playerMaxHp) * 100;
        if (hpPercent >= 75) {
          survivalBonus = 10;
        } else if (hpPercent >= 50) {
          survivalBonus = 5;
        }
      }
      
      // Calculate tokens (base + streak + survival bonus)
      const baseTokens = Math.floor(finalDamage / 1000);
      finalTokens = Math.floor(baseTokens * (1 + streakBonus) * (1 + survivalBonus / 100));

      await storage.recordRaidDamage(raid.id, player.id, finalDamage, finalTokens);
      await storage.addRaidTokens(player.id, finalTokens);

      // Check if boss is defeated
      const updatedRaid = await storage.getActiveGuildRaid(guildInfo.guild.id);
      if (updatedRaid && updatedRaid.current_hp <= 0) {
        await storage.completeGuildRaid(raid.id, 'completed');
      }

      // Check milestone rewards
      const hpPercent = (updatedRaid?.current_hp || 0) / raid.max_hp * 100;
      const milestones = [];
      if (hpPercent <= 75 && !raid.milestone_75_reached) milestones.push(75);
      if (hpPercent <= 50 && !raid.milestone_50_reached) milestones.push(50);
      if (hpPercent <= 25 && !raid.milestone_25_reached) milestones.push(25);

      // Get updated participation for streak info
      const updatedParticipation = await storage.getRaidParticipation(raid.id, player.id);

      res.json({
        damage: finalDamage,
        tokensEarned: finalTokens,
        streak: streakLost ? 0 : (updatedParticipation?.current_streak || 0),
        streakLost,
        attacksRemaining: 2 - (updatedParticipation?.attacks_today || 0),
        bossHp: updatedRaid?.current_hp,
        milestonesReached: milestones,
        playerDied,
        survivalBonus,
        playerHpRemaining: playerDied ? 0 : playerCurrentHp,
        playerMaxHp,
        combatLog: combatLog,
        playerAttackSpeed: PLAYER_ATTACK_INTERVAL,
        bossAttackSpeed: BOSS_ATTACK_INTERVAL
      });
    } catch (error) {
      console.error("Error attacking raid boss:", error);
      res.status(500).json({ error: "Failed to attack" });
    }
  });

  // Reset raid attacks (DEV ONLY)
  app.post('/api/raids/reset-attacks', isAuthenticated, async (req: any, res) => {
    try {
      if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({ error: "Only available in development mode" });
      }
      
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });
      
      const guildInfo = await storage.getPlayerGuild(player.id);
      if (!guildInfo) return res.status(400).json({ error: "Not in a guild" });
      
      const raid = await storage.getActiveGuildRaid(guildInfo.guild.id);
      if (!raid) return res.status(404).json({ error: "No active raid" });
      
      // Reset attacks_today to 0
      await storage.resetRaidAttacks(raid.id, player.id);
      
      res.json({ success: true, message: "Attacks reset to 0" });
    } catch (error) {
      console.error("Error resetting attacks:", error);
      res.status(500).json({ error: "Failed to reset attacks" });
    }
  });

  // Get raid leaderboard
  app.get('/api/raids/:raidId/leaderboard', async (req, res) => {
    try {
      const leaderboard = await storage.getRaidLeaderboard(req.params.raidId, 50);
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  // Claim milestone reward
  app.post('/api/raids/:raidId/claim-milestone', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const { milestone } = req.body;
      const result = await storage.claimMilestoneReward(req.params.raidId, player.id, milestone);
      res.json(result);
    } catch (error) {
      console.error("Error claiming milestone:", error);
      res.status(500).json({ error: "Failed to claim milestone" });
    }
  });

  // Get player's raid tokens
  app.get('/api/raids/tokens', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const tokens = await storage.getPlayerRaidTokens(player.id);
      res.json(tokens);
    } catch (error) {
      console.error("Error fetching tokens:", error);
      res.status(500).json({ error: "Failed to fetch tokens" });
    }
  });

  // Get raid shop items
  app.get('/api/raids/shop', async (req, res) => {
    try {
      const bossResult = await storage.getCurrentWeekBossWithReset();
      const currentBossId = bossResult?.boss?.id || null;
      const items = await storage.getShopItemsForCurrentBoss(currentBossId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching shop items:", error);
      res.status(500).json({ error: "Failed to fetch shop" });
    }
  });

  // Get forge recipes
  app.get('/api/raids/forge/recipes', async (req, res) => {
    try {
      const recipes = await storage.getForgeRecipes();
      res.json(recipes);
    } catch (error) {
      console.error("Error fetching forge recipes:", error);
      res.status(500).json({ error: "Failed to fetch forge recipes" });
    }
  });

  // Craft a forge item
  app.post('/api/raids/forge/craft', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const { recipeId } = req.body;
      if (!recipeId) return res.status(400).json({ error: "recipeId required" });

      const result = await storage.craftForgeItem(player.id, recipeId);
      if (!result.success) return res.status(400).json({ error: result.error });
      
      bumpPlayerDataVersion(player.id);
      res.json(result);
    } catch (error) {
      console.error("Error crafting forge item:", error);
      res.status(500).json({ error: "Failed to craft item" });
    }
  });

  // Open a boss chest
  app.post('/api/raids/open-chest', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const { chestItemId } = req.body;
      if (!chestItemId) return res.status(400).json({ error: "chestItemId required" });

      const result = await storage.openBossChest(player.id, chestItemId);
      if (!result.success) return res.status(400).json({ error: result.error });

      bumpPlayerDataVersion(player.id);
      sendPlayerDataUpdate(player.id);
      res.json(result);
    } catch (error) {
      console.error("Error opening chest:", error);
      res.status(500).json({ error: "Failed to open chest" });
    }
  });

  // Purchase from raid shop
  app.post('/api/raids/shop/purchase', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const { itemId } = req.body;

      const shopItemResult = await db.execute(sql`SELECT * FROM raid_shop_items WHERE id = ${itemId}`);
      const shopItem = shopItemResult.rows[0] as any;
      if (!shopItem) return res.status(404).json({ error: "Item not found" });

      const isBadgeItem = shopItem.item_id === 'raid_conqueror_badge';

      const result = await storage.purchaseRaidShopItem(player.id, itemId);
      
      if (result.success && result.item) {
        if (isBadgeItem) {
          await storage.awardBadge(player.id, 'raid_conqueror');
        } else {
          const itemToAdd = await getCanonicalItemId(shopItem.item_id);
          const quantity = result.item.quantity;
          await db.execute(sql`UPDATE players SET inventory = jsonb_set(COALESCE(inventory, '{}'), ARRAY[${itemToAdd}]::text[], to_jsonb(COALESCE((inventory->>${itemToAdd})::integer, 0) + ${quantity})) WHERE id = ${player.id}`);
        }
        bumpPlayerDataVersion(player.id);
        sendPlayerDataUpdate(player.id);
      }

      res.json({ ...result, grantedBadge: isBadgeItem && result.success ? 'raid_conqueror' : undefined });
    } catch (error) {
      console.error("Error purchasing from shop:", error);
      res.status(500).json({ error: "Failed to purchase" });
    }
  });

  // Get guild activity points
  app.get('/api/raids/activity-points', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const guildInfo = await storage.getPlayerGuild(player.id);
      if (!guildInfo) return res.json({ current: 0, total: 0 });

      const points = await storage.getGuildActivityPoints(guildInfo.guild.id);
      res.json(points);
    } catch (error) {
      console.error("Error fetching activity points:", error);
      res.status(500).json({ error: "Failed to fetch points" });
    }
  });

  // Get scheduled raid for guild
  app.get('/api/raids/scheduled', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const guildInfo = await storage.getPlayerGuild(player.id);
      if (!guildInfo) return res.json(null);

      const raid = await storage.getScheduledGuildRaid(guildInfo.guild.id);
      if (!raid) return res.json(null);

      const participants = await storage.getRaidParticipants(raid.id);
      const hasJoined = participants.some((p: any) => p.player_id === player.id);

      res.json({ raid, participants, hasJoined });
    } catch (error) {
      console.error("Error fetching scheduled raid:", error);
      res.status(500).json({ error: "Failed to fetch scheduled raid" });
    }
  });

  // Schedule a raid call (30 minutes in advance)
  app.post('/api/raids/schedule', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const guildInfo = await storage.getPlayerGuild(player.id);
      if (!guildInfo) return res.status(400).json({ error: "Not in a guild" });
      
      if (!['leader', 'officer'].includes(guildInfo.membership.role)) {
        return res.status(403).json({ error: "Only leaders and officers can schedule raids" });
      }

      // Check if there's already an active or scheduled raid
      const existingRaid = await storage.getActiveOrScheduledGuildRaid(guildInfo.guild.id);
      if (existingRaid) {
        return res.status(400).json({ error: "A raid is already active or scheduled" });
      }

      const { bossId, difficulty = 'normal' } = req.body;
      
      const boss = await storage.getRaidBoss(bossId);
      if (!boss) return res.status(404).json({ error: "Boss not found" });

      if (boss.isPremium) {
        const activityPoints = await storage.getGuildActivityPoints(guildInfo.guild.id);
        if (activityPoints.current < boss.premiumActivityCost) {
          return res.status(400).json({ error: "Not enough activity points" });
        }
        await storage.spendGuildActivityPoints(guildInfo.guild.id, boss.premiumActivityCost);
      }

      const raid = await storage.scheduleGuildRaid(guildInfo.guild.id, bossId, difficulty, player.id);
      
      // Auto-join the scheduler
      await storage.createRaidParticipation(raid.id, player.id);
      
      res.json(raid);
    } catch (error) {
      console.error("Error scheduling raid:", error);
      res.status(500).json({ error: "Failed to schedule raid" });
    }
  });

  // Join a scheduled raid call
  app.post('/api/raids/join-call', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const guildInfo = await storage.getPlayerGuild(player.id);
      if (!guildInfo) return res.status(400).json({ error: "Not in a guild" });

      const raid = await storage.getScheduledGuildRaid(guildInfo.guild.id);
      if (!raid) return res.status(404).json({ error: "No scheduled raid found" });

      // Check if already joined
      const existingParticipation = await storage.getRaidParticipation(raid.id, player.id);
      if (existingParticipation) {
        return res.json({ success: true, message: "Already joined" });
      }

      await storage.createRaidParticipation(raid.id, player.id);
      
      const participants = await storage.getRaidParticipants(raid.id);
      
      res.json({ success: true, participants });
    } catch (error) {
      console.error("Error joining raid call:", error);
      res.status(500).json({ error: "Failed to join raid call" });
    }
  });

  // Activate a scheduled raid (leader can start early)
  app.post('/api/raids/activate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const player = await storage.getPlayerByUserId(userId);
      if (!player) return res.status(404).json({ error: "Player not found" });

      const guildInfo = await storage.getPlayerGuild(player.id);
      if (!guildInfo) return res.status(400).json({ error: "Not in a guild" });
      
      if (!['leader', 'officer'].includes(guildInfo.membership.role)) {
        return res.status(403).json({ error: "Only leaders and officers can start raids" });
      }

      const raid = await storage.getScheduledGuildRaid(guildInfo.guild.id);
      if (!raid) return res.status(404).json({ error: "No scheduled raid found" });

      const updatedRaid = await storage.activateScheduledRaid(raid.id);
      
      res.json(updatedRaid);
    } catch (error) {
      console.error("Error activating raid:", error);
      res.status(500).json({ error: "Failed to activate raid" });
    }
  });

  // ==================== DUNGEON API ====================
  
  // GET /api/dungeons - List all dungeons
  app.get('/api/dungeons', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const language = (req.query.lang as string) || 'en';
      const dungeons = await dungeonService.getDungeons(language);
      
      res.json({ success: true, dungeons });
    } catch (error) {
      console.error('Error fetching dungeons:', error);
      res.status(500).json({ error: 'Failed to fetch dungeons' });
    }
  });

  // GET /api/dungeons/:id - Get dungeon details
  app.get('/api/dungeons/:id', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { id } = req.params;
      const language = (req.query.lang as string) || 'en';
      const dungeon = await dungeonService.getDungeonById(id, language);
      
      if (!dungeon) {
        return res.status(404).json({ error: 'Dungeon not found' });
      }
      
      res.json({ success: true, dungeon });
    } catch (error) {
      console.error('Error fetching dungeon:', error);
      res.status(500).json({ error: 'Failed to fetch dungeon' });
    }
  });

  // GET /api/dungeons/:id/leaderboard - Get weekly leaderboard
  app.get('/api/dungeons/:id/leaderboard', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const leaderboard = await dungeonService.getWeeklyLeaderboard(id, limit);
      
      res.json({ success: true, leaderboard });
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  });

  // POST /api/dungeons/:id/enter - Start dungeon run
  app.post('/api/dungeons/:id/enter', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { id } = req.params;
      const { modifierIds, testMode } = req.body || {};
      
      const isDev = process.env.NODE_ENV === 'development';
      const isPlayerTester = player.isTester === 1;
      const isTestModeActive = (isDev || isPlayerTester) && testMode === true;
      
      const result = isTestModeActive
        ? await dungeonService.startDungeonRunWithoutKey(player.id, id, modifierIds || [])
        : await dungeonService.startDungeonRun(player.id, id, modifierIds || []);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ success: true, run: result.run });
    } catch (error) {
      console.error('Error entering dungeon:', error);
      res.status(500).json({ error: 'Failed to enter dungeon' });
    }
  });

  // POST /api/dungeon-runs/fight - Start combat or process combat tick
  app.post('/api/dungeon-runs/fight', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { runId } = req.body;
      if (!runId) {
        return res.status(400).json({ error: 'Run ID required' });
      }

      const currentRun = await dungeonService.getCurrentRun(player.id);
      if (!currentRun || currentRun.id !== runId) {
        return res.status(400).json({ error: 'No matching active run found' });
      }

      if (currentRun.inCombat === 1) {
        const result = await dungeonService.processDungeonCombatTick(runId, player.id);
        if (!result.success) {
          return res.status(400).json({ error: result.error });
        }
        return res.json(result);
      } else {
        const result = await dungeonService.startFloorCombat(runId, player.id);
        if (!result.success) {
          return res.status(400).json({ error: result.error });
        }
        return res.json({ success: true, combatStarted: true, combatState: result.combatState });
      }
    } catch (error) {
      console.error('Error in dungeon fight:', error);
      res.status(500).json({ error: 'Failed to process fight' });
    }
  });

  // POST /api/dungeon-runs/flee - Flee from current floor (skip without loot)
  app.post('/api/dungeon-runs/flee', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { runId } = req.body;
      if (!runId) {
        return res.status(400).json({ error: 'Run ID required' });
      }
      
      const result = await dungeonService.fleeFromFloor(runId, player.id);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ success: true, completed: result.completed || false, skipFloorsUsed: result.skipFloorsUsed, skipFloorsMax: result.skipFloorsMax });
    } catch (error) {
      console.error('Error fleeing floor:', error);
      res.status(500).json({ error: 'Failed to flee' });
    }
  });

  // POST /api/dungeon-runs/monster-defeated - Client reports monster kill for loot/xp/gold calculation
  app.post('/api/dungeon-runs/monster-defeated', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { runId, playerHp } = req.body;
      if (!runId) {
        return res.status(400).json({ error: 'Run ID required' });
      }
      
      const result = await dungeonService.reportMonsterDefeated(runId, player.id, playerHp || 1);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json(result);
    } catch (error) {
      console.error('Error reporting monster defeated:', error);
      res.status(500).json({ error: 'Failed to process monster defeat' });
    }
  });

  // POST /api/dungeon-runs/toggle-offline - Toggle offline mode
  app.post('/api/dungeon-runs/toggle-offline', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { runId, enabled } = req.body;
      if (!runId) {
        return res.status(400).json({ error: 'Run ID required' });
      }
      
      const result = await dungeonService.toggleOfflineMode(runId, player.id, enabled === true);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error toggling offline mode:', error);
      res.status(500).json({ error: 'Failed to toggle offline mode' });
    }
  });

  // POST /api/dungeon-runs/complete - Complete/abandon run
  app.post('/api/dungeon-runs/complete', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { runId, success: runSuccess } = req.body;
      if (!runId) {
        return res.status(400).json({ error: 'Run ID required' });
      }

      const currentRun = await dungeonService.getCurrentRun(player.id);
      if (runSuccess === true && currentRun && currentRun.inCombat === 1) {
        return res.status(400).json({ error: 'Cannot complete while in combat' });
      }

      if (runSuccess === false && currentRun && currentRun.inCombat === 1) {
        await db.update(dungeonRuns)
          .set({ inCombat: 0, dungeonCombatState: null } as any)
          .where(eq(dungeonRuns.id, runId));
      }
      
      const result = await dungeonService.completeDungeonRun(runId, runSuccess === true);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ success: true, loot: result.loot });
    } catch (error) {
      console.error('Error completing run:', error);
      res.status(500).json({ error: 'Failed to complete run' });
    }
  });

  // GET /api/dungeon-runs/current - Get player's active run
  app.get('/api/dungeon-runs/current', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const run = await dungeonService.getCurrentRun(player.id);
      
      res.json({ success: true, run });
    } catch (error) {
      console.error('Error fetching current run:', error);
      res.status(500).json({ error: 'Failed to fetch current run' });
    }
  });

  // GET /api/player/current-party - Get player's current party (for task start check)
  app.get('/api/player/current-party', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Check if player is in a party
      const [membership] = await db.select()
        .from(partyMembers)
        .where(eq(partyMembers.playerId, player.id))
        .limit(1);
      
      if (!membership) {
        return res.json({ party: null });
      }
      
      // Get party info
      const [party] = await db.select()
        .from(parties)
        .where(eq(parties.id, membership.partyId))
        .limit(1);
      
      if (!party || party.status === 'disbanded') {
        return res.json({ party: null });
      }
      
      res.json({ 
        party: {
          id: party.id,
          name: party.name || 'Party',
          leaderId: party.leaderId,
          status: party.status,
          partyType: party.partyType || 'social',
        }
      });
    } catch (error) {
      console.error('Error fetching current party:', error);
      res.status(500).json({ error: 'Failed to fetch current party' });
    }
  });

  // GET /api/player/keys - Get player's dungeon keys
  app.get('/api/player/keys', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const keys = await dungeonService.getPlayerKeys(player.id);
      
      res.json({ success: true, keys });
    } catch (error) {
      console.error('Error fetching player keys:', error);
      res.status(500).json({ error: 'Failed to fetch player keys' });
    }
  });

  // POST /api/player/keys/test - Admin: Add test keys
  app.post('/api/player/keys/test', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Check admin auth via header
      const adminKey = req.headers['x-admin-key'];
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
      if (!ADMIN_PASSWORD || adminKey !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const { keyType, quantity } = req.body;
      if (!keyType || !quantity) {
        return res.status(400).json({ error: 'keyType and quantity required' });
      }
      
      await dungeonService.addPlayerKey(player.id, keyType, quantity);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error adding test keys:', error);
      res.status(500).json({ error: 'Failed to add test keys' });
    }
  });

  // GET /api/player/portals - Get active portals
  app.get('/api/player/portals', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const portals = await portalService.getActivePortals(player.id);
      
      res.json({ success: true, portals });
    } catch (error) {
      console.error('Error fetching portals:', error);
      res.status(500).json({ error: 'Failed to fetch portals' });
    }
  });

  // POST /api/portals/:id/use - Use portal for key-free entry
  app.post('/api/portals/:id/use', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { id } = req.params;
      const { modifierIds } = req.body || {};
      
      // Use the portal
      const portalResult = await portalService.usePortal(id);
      
      if (!portalResult.success) {
        return res.status(400).json({ error: portalResult.error });
      }
      
      // Start dungeon run without consuming a key (portal was used instead)
      if (portalResult.dungeon) {
        const runResult = await dungeonService.startDungeonRunWithoutKey(
          player.id,
          portalResult.dungeon.id,
          modifierIds || []
        );
        
        if (!runResult.success) {
          return res.status(400).json({ error: runResult.error });
        }
        
        res.json({ success: true, run: runResult.run, dungeon: portalResult.dungeon });
      } else {
        res.status(400).json({ error: 'Portal dungeon not found' });
      }
    } catch (error) {
      console.error('Error using portal:', error);
      res.status(500).json({ error: 'Failed to use portal' });
    }
  });

  // GET /api/dungeon-modifiers - List available modifiers
  app.get('/api/dungeon-modifiers', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const modifiers = await dungeonService.getAvailableModifiers();
      
      res.json({ success: true, modifiers });
    } catch (error) {
      console.error('Error fetching modifiers:', error);
      res.status(500).json({ error: 'Failed to fetch modifiers' });
    }
  });

  // ==================== ADMIN PANEL API ====================
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const ADMIN_ALLOWED_EMAILS = ['betelgeusestd@gmail.com', 'yusufakgn61@gmail.com'];
  
  async function adminAuth(req: Request, res: Response, next: NextFunction) {
    if (!ADMIN_PASSWORD) {
      console.error('ADMIN_PASSWORD environment variable is not set - admin panel disabled');
      return res.status(503).json({ error: 'Admin panel is not configured' });
    }
    
    const adminKey = req.headers['x-admin-key'];
    
    if (adminKey && adminKey === ADMIN_PASSWORD) {
      (req as any).isAdmin = true;
      (req as any).staffRole = null;
      
      if (process.env.NODE_ENV !== 'development') {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(403).json({ error: 'Unauthorized - Firebase authentication required' });
        }
        const idToken = authHeader.split('Bearer ')[1];
        try {
          const decodedToken = await verifyFirebaseToken(idToken);
          if (!decodedToken) {
            return res.status(403).json({ error: 'Unauthorized - Invalid Firebase token' });
          }
          const verifiedEmail = getEmailFromToken(decodedToken);
          if (!verifiedEmail || !ADMIN_ALLOWED_EMAILS.includes(verifiedEmail)) {
            return res.status(403).json({ error: 'Unauthorized - Access denied for this account' });
          }
        } catch (error) {
          return res.status(403).json({ error: 'Unauthorized - Token verification failed' });
        }
      }
      return next();
    }
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await verifyFirebaseToken(idToken);
        if (decodedToken) {
          const email = getEmailFromToken(decodedToken);
          if (email) {
            const player = await storage.getPlayerByEmail(email);
            if (player && player.staffRole && ['moderator', 'translator'].includes(player.staffRole)) {
              (req as any).isAdmin = false;
              (req as any).staffRole = player.staffRole;
              (req as any).staffPlayer = player;
              return next();
            }
          }
        }
      } catch {}
    }
    
    return res.status(401).json({ error: 'Unauthorized' });
  }

  function requireAdmin(req: Request, res: Response): boolean {
    if (!(req as any).isAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return false;
    }
    return true;
  }

  function requireRole(req: Request, res: Response, roles: string[]): boolean {
    if ((req as any).isAdmin) return true;
    const staffRole = (req as any).staffRole;
    if (!staffRole || !roles.includes(staffRole)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return false;
    }
    return true;
  }

  const TRANSLATION_FIELDS = ['nameTranslations', 'name_translations', 'descriptionTranslations', 'description_translations'];

  function filterTranslatorFields(body: Record<string, any>): Record<string, any> {
    const filtered: Record<string, any> = {};
    for (const key of TRANSLATION_FIELDS) {
      if (body[key] !== undefined) {
        filtered[key] = body[key];
      }
    }
    return filtered;
  }

  // ===== BADGE ADMIN ROUTES =====
  app.get('/api/admin/badges', adminAuth, async (req, res) => {
    try {
      const allBadges = await storage.getAllBadges();
      res.json(allBadges);
    } catch (error) {
      console.error('Admin: Error fetching badges:', error);
      res.status(500).json({ error: 'Failed to fetch badges' });
    }
  });

  app.post('/api/admin/badges', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const badge = await storage.createBadge(req.body);
      res.json(badge);
    } catch (error) {
      console.error('Admin: Error creating badge:', error);
      res.status(500).json({ error: 'Failed to create badge' });
    }
  });

  app.put('/api/admin/badges/:id', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const badge = await storage.updateBadge(req.params.id, req.body);
      if (!badge) return res.status(404).json({ error: 'Badge not found' });
      res.json(badge);
    } catch (error) {
      console.error('Admin: Error updating badge:', error);
      res.status(500).json({ error: 'Failed to update badge' });
    }
  });

  app.delete('/api/admin/badges/:id', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const success = await storage.deleteBadge(req.params.id);
      if (!success) return res.status(404).json({ error: 'Badge not found' });
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error deleting badge:', error);
      res.status(500).json({ error: 'Failed to delete badge' });
    }
  });

  app.post('/api/admin/players/:id/badges', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { badgeId } = req.body;
      if (!badgeId) return res.status(400).json({ error: 'badgeId required' });
      const result = await storage.awardBadge(req.params.id, badgeId);
      res.json(result);
    } catch (error) {
      console.error('Admin: Error awarding badge:', error);
      res.status(500).json({ error: 'Failed to award badge' });
    }
  });

  app.delete('/api/admin/players/:id/badges/:badgeId', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const success = await storage.removeBadge(req.params.id, req.params.badgeId);
      if (!success) return res.status(404).json({ error: 'Badge not found on player' });
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error removing badge:', error);
      res.status(500).json({ error: 'Failed to remove badge' });
    }
  });

  app.get('/api/admin/players/:id/badges', adminAuth, async (req, res) => {
    try {
      const playerBadges = await storage.getPlayerBadges(req.params.id);
      res.json(playerBadges);
    } catch (error) {
      console.error('Admin: Error fetching player badges:', error);
      res.status(500).json({ error: 'Failed to fetch player badges' });
    }
  });

  // Get all game items
  app.get('/api/admin/items', adminAuth, async (req, res) => {
    try {
      console.log('[Admin API] Fetching all game items...');
      const items = await storage.getAllGameItems();
      console.log(`[Admin API] Returning ${items.length} items`);
      const transformedItems = items.map(item => ({
        ...item,
        isDraft: (item as any).isDraft || 0,
      }));
      res.json(transformedItems);
    } catch (error) {
      console.error('Admin: Error fetching items:', error);
      res.status(500).json({ error: 'Failed to fetch items' });
    }
  });

  // Create game item
  app.post('/api/admin/items', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { insertGameItemSchema } = await import('@shared/schema');
      const result = insertGameItemSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid item data', details: result.error.errors });
      }
      const item = await storage.createGameItem(result.data);
      res.json(item);
    } catch (error) {
      console.error('Admin: Error creating item:', error);
      res.status(500).json({ error: 'Failed to create item' });
    }
  });

  // Update game item
  app.put('/api/admin/items/:id', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator', 'translator'])) return;
      const { id } = req.params;
      const staffRole = (req as any).staffRole;
      const bodyData = staffRole === 'translator' ? filterTranslatorFields(req.body) : req.body;
      const { insertGameItemSchema } = await import('@shared/schema');
      const result = insertGameItemSchema.partial().safeParse(bodyData);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid item data', details: result.error.errors });
      }
      const item = await storage.updateGameItem(id, result.data);
      // Auto-broadcast to all players
      bumpGameDataVersion();
      broadcastGameUpdate('items');
      res.json(item);
    } catch (error) {
      console.error('Admin: Error updating item:', error);
      res.status(500).json({ error: 'Failed to update item' });
    }
  });

  // Delete game item
  app.delete('/api/admin/items/:id', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      await storage.deleteGameItem(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error deleting item:', error);
      res.status(500).json({ error: 'Failed to delete item' });
    }
  });

  // Get all monsters
  app.get('/api/admin/monsters', adminAuth, async (req, res) => {
    try {
      console.log('[Admin API] Fetching all game monsters...');
      const monsters = await storage.getAllGameMonsters();
      console.log(`[Admin API] Returning ${monsters.length} monsters`);
      const transformedMonsters = monsters.map(monster => ({
        ...monster,
        isDraft: monster.isDraft || 0,
        nameTranslations: monster.nameTranslations || {},
      }));
      res.json(transformedMonsters);
    } catch (error) {
      console.error('Admin: Error fetching monsters:', error);
      res.status(500).json({ error: 'Failed to fetch monsters' });
    }
  });

  // Create monster
  app.post('/api/admin/monsters', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { insertGameMonsterSchema } = await import('@shared/schema');
      const result = insertGameMonsterSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid monster data', details: result.error.errors });
      }
      const monster = await storage.createGameMonster(result.data);
      res.json(monster);
    } catch (error) {
      console.error('Admin: Error creating monster:', error);
      res.status(500).json({ error: 'Failed to create monster' });
    }
  });

  // Update monster
  app.put('/api/admin/monsters/:id', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator', 'translator'])) return;
      const { id } = req.params;
      const staffRole = (req as any).staffRole;
      const bodyData = staffRole === 'translator' ? filterTranslatorFields(req.body) : req.body;
      const { insertGameMonsterSchema } = await import('@shared/schema');
      const result = insertGameMonsterSchema.partial().safeParse(bodyData);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid monster data', details: result.error.errors });
      }
      const monster = await storage.updateGameMonster(id, result.data);
      // Auto-broadcast to all players
      bumpGameDataVersion();
      broadcastGameUpdate('monsters');
      res.json(monster);
    } catch (error) {
      console.error('Admin: Error updating monster:', error);
      res.status(500).json({ error: 'Failed to update monster' });
    }
  });

  // Delete monster
  app.delete('/api/admin/monsters/:id', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      await storage.deleteGameMonster(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error deleting monster:', error);
      res.status(500).json({ error: 'Failed to delete monster' });
    }
  });

  // Get all combat regions
  app.get('/api/admin/regions', adminAuth, async (req, res) => {
    try {
      console.log('[Admin API] Fetching all combat regions...');
      const regions = await storage.getAllCombatRegions();
      console.log(`[Admin API] Returning ${regions.length} regions`);
      const transformedRegions = regions.map(region => ({
        ...region,
        nameTranslations: region.nameTranslations || {},
        descriptionTranslations: region.descriptionTranslations || {},
      }));
      res.json(transformedRegions);
    } catch (error) {
      console.error('Admin: Error fetching regions:', error);
      res.status(500).json({ error: 'Failed to fetch regions' });
    }
  });

  // Create combat region
  app.post('/api/admin/regions', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { insertGameCombatRegionSchema } = await import('@shared/schema');
      const result = insertGameCombatRegionSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid region data', details: result.error.errors });
      }
      const region = await storage.createCombatRegion(result.data);
      res.json(region);
    } catch (error) {
      console.error('Admin: Error creating region:', error);
      res.status(500).json({ error: 'Failed to create region' });
    }
  });

  // Update combat region
  app.put('/api/admin/regions/:id', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator', 'translator'])) return;
      const { id } = req.params;
      const staffRole = (req as any).staffRole;
      const bodyData = staffRole === 'translator' ? filterTranslatorFields(req.body) : req.body;
      const { insertGameCombatRegionSchema } = await import('@shared/schema');
      const result = insertGameCombatRegionSchema.partial().safeParse(bodyData);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid region data', details: result.error.errors });
      }
      const region = await storage.updateCombatRegion(id, result.data);
      // Auto-broadcast to all players
      bumpGameDataVersion();
      broadcastGameUpdate('regions');
      res.json(region);
    } catch (error) {
      console.error('Admin: Error updating region:', error);
      res.status(500).json({ error: 'Failed to update region' });
    }
  });

  // Delete combat region
  app.delete('/api/admin/regions/:id', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      await storage.deleteCombatRegion(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error deleting region:', error);
      res.status(500).json({ error: 'Failed to delete region' });
    }
  });

  // Get all recipes
  app.get('/api/admin/recipes', adminAuth, async (req, res) => {
    try {
      const recipes = await storage.getAllGameRecipes();
      const transformedRecipes = recipes.map(recipe => ({
        ...recipe,
        isDraft: recipe.isDraft || 0,
        regionIds: recipe.regionIds || [],
      }));
      res.json(transformedRecipes);
    } catch (error) {
      console.error('Admin: Error fetching recipes:', error);
      res.status(500).json({ error: 'Failed to fetch recipes' });
    }
  });

  // Create recipe
  app.post('/api/admin/recipes', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { insertGameRecipeSchema } = await import('@shared/schema');
      const result = insertGameRecipeSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid recipe data', details: result.error.errors });
      }
      const recipe = await storage.createGameRecipe(result.data);
      res.json(recipe);
    } catch (error) {
      console.error('Admin: Error creating recipe:', error);
      res.status(500).json({ error: 'Failed to create recipe' });
    }
  });

  // Update recipe
  app.put('/api/admin/recipes/:id', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator', 'translator'])) return;
      const { id } = req.params;
      const staffRole = (req as any).staffRole;
      const bodyData = staffRole === 'translator' ? filterTranslatorFields(req.body) : req.body;
      const { insertGameRecipeSchema } = await import('@shared/schema');
      const result = insertGameRecipeSchema.partial().safeParse(bodyData);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid recipe data', details: result.error.errors });
      }
      const recipe = await storage.updateGameRecipe(id, result.data);
      // Auto-broadcast to all players
      bumpGameDataVersion();
      broadcastGameUpdate('recipes');
      res.json(recipe);
    } catch (error) {
      console.error('Admin: Error updating recipe:', error);
      res.status(500).json({ error: 'Failed to update recipe' });
    }
  });

  // Delete recipe
  app.delete('/api/admin/recipes/:id', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      await storage.deleteGameRecipe(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error deleting recipe:', error);
      res.status(500).json({ error: 'Failed to delete recipe' });
    }
  });

  // =============================================================================
  // SKILL ACTIONS ADMIN ENDPOINTS
  // =============================================================================

  // Get all skill actions
  app.get('/api/admin/skill-actions', adminAuth, async (req, res) => {
    try {
      console.log('[Admin API] Fetching all skill actions...');
      const actions = await storage.getAllSkillActions();
      console.log(`[Admin API] Returning ${actions.length} skill actions`);
      const transformedActions = actions.map(action => ({
        ...action,
        isDraft: action.isDraft || 0,
        nameTranslations: action.nameTranslations || {},
        descriptionTranslations: action.descriptionTranslations || {},
      }));
      res.json(transformedActions);
    } catch (error) {
      console.error('Admin: Error fetching skill actions:', error);
      res.status(500).json({ error: 'Failed to fetch skill actions' });
    }
  });

  // Create skill action
  app.post('/api/admin/skill-actions', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { insertGameSkillActionSchema } = await import('@shared/schema');
      const result = insertGameSkillActionSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid skill action data', details: result.error.errors });
      }
      const action = await storage.createSkillAction(result.data);
      res.json(action);
    } catch (error) {
      console.error('Admin: Error creating skill action:', error);
      res.status(500).json({ error: 'Failed to create skill action' });
    }
  });

  // Update skill action
  app.put('/api/admin/skill-actions/:id', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator', 'translator'])) return;
      const { id } = req.params;
      const staffRole = (req as any).staffRole;
      const bodyData = staffRole === 'translator' ? filterTranslatorFields(req.body) : req.body;
      if (staffRole !== 'translator') {
        if ('itemId' in bodyData && !bodyData.itemId) {
          return res.status(400).json({ error: 'itemId cannot be empty' });
        }
        if ('name' in bodyData && !bodyData.name) {
          return res.status(400).json({ error: 'name cannot be empty' });
        }
        if ('skill' in bodyData && !bodyData.skill) {
          return res.status(400).json({ error: 'skill cannot be empty' });
        }
      }
      const { insertGameSkillActionSchema } = await import('@shared/schema');
      const result = (insertGameSkillActionSchema as any).omit({ id: true }).partial().safeParse(bodyData);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid skill action data', details: result.error.errors });
      }
      const action = await storage.updateSkillAction(id, result.data);
      if (!action) {
        return res.status(404).json({ error: 'Skill action not found' });
      }
      res.json(action);
    } catch (error) {
      console.error('Admin: Error updating skill action:', error);
      res.status(500).json({ error: 'Failed to update skill action' });
    }
  });

  // Delete skill action
  app.delete('/api/admin/skill-actions/:id', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      const deleted = await storage.deleteSkillAction(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Skill action not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error deleting skill action:', error);
      res.status(500).json({ error: 'Failed to delete skill action' });
    }
  });

  // Get all raid bosses
  app.get('/api/admin/raid-bosses', adminAuth, async (req, res) => {
    try {
      console.log('[Admin API] Fetching all raid bosses...');
      const bosses = await storage.getAllRaidBosses();
      console.log(`[Admin API] Returning ${bosses.length} raid bosses`);
      res.json(bosses);
    } catch (error) {
      console.error('Admin: Error fetching raid bosses:', error);
      res.status(500).json({ error: 'Failed to fetch raid bosses' });
    }
  });

  // Update raid boss - validate with schema
  app.put('/api/admin/raid-bosses/:id', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      console.log('[Admin API] Updating raid boss:', id);
      console.log('[Admin API] Request body:', JSON.stringify(req.body));
      
      const { insertRaidBossSchema } = await import('@shared/schema');
      const result = insertRaidBossSchema.partial().safeParse(req.body);
      if (!result.success) {
        console.log('[Admin API] Validation failed:', result.error.errors);
        return res.status(400).json({ error: 'Invalid raid boss data', details: result.error.errors });
      }
      if (Object.keys(result.data).length === 0) {
        console.log('[Admin API] No valid fields to update');
        return res.status(400).json({ error: 'No valid fields to update' });
      }
      
      console.log('[Admin API] Parsed data to update:', JSON.stringify(result.data));
      
      // If baseHp is being updated, also update active raids proportionally
      if ((result.data as any).baseHp !== undefined && (result.data as any).baseHp > 0) {
        const newBaseHp = (result.data as any).baseHp;
        
        // Cache old boss baseHp BEFORE updating
        const oldBoss = await storage.getRaidBoss(id);
        const oldBaseHp = oldBoss?.baseHp;
        
        // Only proceed if old baseHp is valid
        if (oldBaseHp && oldBaseHp > 0) {
          const activeRaids = await storage.getActiveRaidsByBossId(id);
          
          for (const raid of activeRaids) {
            // Skip if raid max_hp is invalid
            if (!raid.max_hp || raid.max_hp <= 0) continue;
            
            // Calculate current HP percentage (0 to 1)
            const hpPercentage = raid.current_hp / raid.max_hp;
            
            // Calculate difficulty multiplier from old values
            const difficultyMultiplier = raid.max_hp / oldBaseHp;
            
            // Calculate new max and current HP
            const newMaxHp = Math.floor(newBaseHp * difficultyMultiplier);
            const newCurrentHp = Math.floor(newMaxHp * hpPercentage);
            
            // Safety check: ensure valid values before updating
            if (newMaxHp > 0 && newCurrentHp >= 0) {
              await storage.updateGuildRaid(raid.id, {
                max_hp: newMaxHp,
                current_hp: newCurrentHp
              });
              console.log(`[Admin API] Updated active raid ${raid.id}: maxHp ${raid.max_hp} -> ${newMaxHp}, currentHp ${raid.current_hp} -> ${newCurrentHp} (${Math.round(hpPercentage * 100)}%)`);
            }
          }
        }
      }
      
      const boss = await storage.updateRaidBoss(id, result.data);
      console.log('[Admin API] Updated boss result:', JSON.stringify(boss));
      
      // Auto-broadcast to all players
      bumpGameDataVersion();
      broadcastGameUpdate('raid-bosses');
      res.json(boss);
    } catch (error) {
      console.error('Admin: Error updating raid boss:', error);
      res.status(500).json({ error: 'Failed to update raid boss' });
    }
  });

  // Admin player management endpoints
  app.get('/api/admin/players', adminAuth, async (req, res) => {
    try {
      let players = await storage.getAllPlayersForAdmin();
      const staffRole = (req as any).staffRole;
      if (staffRole === 'moderator') {
        players = players.filter((p: any) => p.email && p.email.trim() !== '');
      }
      res.json(players);
    } catch (error) {
      console.error('Admin: Error fetching players:', error);
      res.status(500).json({ error: 'Failed to fetch players' });
    }
  });

  app.delete('/api/admin/players/:id', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      const success = await storage.deletePlayerCompletely(id);
      if (!success) {
        return res.status(404).json({ error: 'Player not found or could not be deleted' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error deleting player:', error);
      res.status(500).json({ error: 'Failed to delete player' });
    }
  });

  // Get full player details including skills, inventory, equipment, gold
  app.get('/api/admin/players/:id', adminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      res.json({
        id: player.id,
        username: player.username,
        email: player.email,
        skills: player.skills,
        inventory: player.inventory,
        equipment: player.equipment,
        gold: player.gold,
        totalLevel: player.totalLevel,
        currentHitpoints: player.currentHitpoints,
        activeBuffs: player.activeBuffs,
        equipmentDurability: player.equipmentDurability,
        lastSaved: player.lastSaved,
        lastSeen: player.lastSeen,
        firebaseUid: player.firebaseUid,
        isGuest: player.isGuest,
        userId: player.userId,
        currentRegion: player.currentRegion,
        isBanned: player.isBanned,
        banReason: player.banReason,
        isTester: player.isTester,
        combatLevel: (player as any).combatLevel,
        masteryDagger: player.masteryDagger,
        masterySwordShield: player.masterySwordShield,
        mastery2hSword: player.mastery2hSword,
        mastery2hAxe: player.mastery2hAxe,
        mastery2hWarhammer: player.mastery2hWarhammer,
        masteryBow: player.masteryBow,
        masteryStaff: player.masteryStaff,
        itemModifications: player.itemModifications || {},
      });
    } catch (error) {
      console.error('Admin: Error fetching player details:', error);
      res.status(500).json({ error: 'Failed to fetch player details' });
    }
  });

  // Admin validation schemas
  const updateInventorySchema = z.object({
    inventory: z.record(z.string(), z.number().int().min(0)),
    itemModifications: z.record(z.string(), z.object({
      enhancementLevel: z.number().int().min(0).max(10),
      addedStats: z.record(z.string(), z.number()).optional().default({}),
      addedSkills: z.array(z.string()).optional().default([]),
    })).optional(),
  });

  const updateSkillsSchema = z.object({
    skills: z.record(z.string(), z.object({
      level: z.number().int().min(1),
      xp: z.number().int().min(0)
    }))
  });

  const updateGoldSchema = z.object({
    gold: z.number().int().min(0)
  });

  const updateEquipmentSchema = z.object({
    equipment: z.record(z.string(), z.string().nullable())
  });

  // Update player inventory
  app.put('/api/admin/players/:id/inventory', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { id } = req.params;
      console.log('[Admin API] Updating player inventory for:', id);
      console.log('[Admin API] Request body:', JSON.stringify(req.body));
      
      const parsed = updateInventorySchema.safeParse(req.body);
      if (!parsed.success) {
        console.log('[Admin API] Validation failed:', parsed.error.errors);
        return res.status(400).json({ error: 'Invalid inventory data', details: parsed.error.errors });
      }
      
      const { inventory: rawInventory, itemModifications: rawItemModifications } = parsed.data;
      console.log('[Admin API] Parsed inventory:', JSON.stringify(rawInventory));

      // Validate and canonicalize all item IDs in the incoming inventory.
      // Each raw key is resolved to a canonical form (normalized base + preserved
      // rarity/instance suffix). Duplicate canonical keys have their quantities merged.
      const allGameItemsForAdmin = await storage.getAllGameItems();
      const knownAdminItemIds = new Set(allGameItemsForAdmin.map(i => i.id));
      const invalidAdminItemIds: string[] = [];
      const canonicalInventory: Record<string, number> = {};
      for (const [rawId, qty] of Object.entries(rawInventory)) {
        const canonical = canonicalizeItemId(rawId, knownAdminItemIds);
        if (canonical === null) {
          invalidAdminItemIds.push(rawId);
        } else {
          canonicalInventory[canonical] = (canonicalInventory[canonical] || 0) + qty;
        }
      }
      if (invalidAdminItemIds.length > 0) {
        console.warn(`[Admin API] Rejected inventory update with unknown item IDs: ${invalidAdminItemIds.join(', ')} for player ${id}`);
        return res.status(400).json({ error: `Unknown item IDs: ${invalidAdminItemIds.join(', ')}. All item IDs must match known game items.` });
      }

      // Validate and canonicalize itemModification keys (quantities not applicable but
      // we still normalize the key; unrecognizable IDs are rejected)
      let canonicalItemModifications: typeof rawItemModifications;
      if (rawItemModifications && Object.keys(rawItemModifications).length > 0) {
        const invalidModIds: string[] = [];
        canonicalItemModifications = {};
        for (const [rawId, mod] of Object.entries(rawItemModifications)) {
          const canonical = canonicalizeItemId(rawId, knownAdminItemIds);
          if (canonical === null) {
            invalidModIds.push(rawId);
          } else {
            canonicalItemModifications[canonical] = mod;
          }
        }
        if (invalidModIds.length > 0) {
          console.warn(`[Admin API] Rejected itemModifications with unknown item IDs: ${invalidModIds.join(', ')} for player ${id}`);
          return res.status(400).json({ error: `Unknown item IDs in modifications: ${invalidModIds.join(', ')}. Items must match known game items.` });
        }
      } else {
        canonicalItemModifications = rawItemModifications;
      }

      const inventory = canonicalInventory;
      const itemModifications = canonicalItemModifications;
      
      const player = await storage.getPlayer(id);
      if (!player) {
        console.log('[Admin API] Player not found:', id);
        return res.status(404).json({ error: 'Player not found' });
      }
      console.log('[Admin API] Current player inventory:', JSON.stringify(player.inventory));
      
      const updatePayload: any = { inventory };
      
      if (itemModifications && Object.keys(itemModifications).length > 0) {
        const existingMods = (player.itemModifications as Record<string, any>) || {};
        const mergedMods = { ...existingMods };
        for (const [itemId, mod] of Object.entries(itemModifications)) {
          if (mod.enhancementLevel > 0 || (mod.addedSkills && mod.addedSkills.length > 0) || (mod.addedStats && Object.keys(mod.addedStats).length > 0)) {
            mergedMods[itemId] = {
              enhancementLevel: mod.enhancementLevel,
              addedStats: mod.addedStats || {},
              addedSkills: mod.addedSkills || [],
            };
          }
        }
        updatePayload.itemModifications = mergedMods;
        console.log('[Admin API] Merged itemModifications:', JSON.stringify(mergedMods));
        
        for (const [itemId, mod] of Object.entries(itemModifications)) {
          if (mod.enhancementLevel > 0) {
            try {
              await db.execute(sql`DELETE FROM weapon_enhancements WHERE player_id = ${id} AND item_id = ${itemId}`);
              await db.execute(sql`
                INSERT INTO weapon_enhancements (id, player_id, item_id, enhancement_level)
                VALUES (gen_random_uuid(), ${id}, ${itemId}, ${mod.enhancementLevel})
              `);
            } catch (enhErr) {
              console.log('[Admin API] weapon_enhancements write skipped:', enhErr);
            }
          }
        }
      }
      
      const newDataVersion = (player.dataVersion || 1) + 1;
      updatePayload.dataVersion = newDataVersion;
      const updatedPlayer = await storage.updatePlayer(id, updatePayload);
      if (!updatedPlayer) {
        return res.status(500).json({ error: 'Failed to update player inventory' });
      }
      console.log('[Admin API] Updated player inventory:', JSON.stringify(updatedPlayer.inventory));
      console.log('[Admin API] New dataVersion:', newDataVersion);
      
      bumpPlayerDataVersion(id);
      sendPlayerDataUpdate(id);
      
      res.json({ success: true, inventory: updatedPlayer.inventory, dataVersion: newDataVersion });
    } catch (error) {
      console.error('Admin: Error updating player inventory:', error);
      res.status(500).json({ error: 'Failed to update player inventory' });
    }
  });

  // Update player skills
  app.put('/api/admin/players/:id/skills', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { id } = req.params;
      
      const parsed = updateSkillsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid skills data', details: parsed.error.errors });
      }
      
      const { skills } = parsed.data;
      
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      // Increment dataVersion to invalidate client's stale cache
      const newDataVersion = (player.dataVersion || 1) + 1;
      const updatedPlayer = await storage.updatePlayer(id, { skills, dataVersion: newDataVersion });
      if (!updatedPlayer) {
        return res.status(500).json({ error: 'Failed to update player skills' });
      }
      
      // Notify the specific player if they're online
      bumpPlayerDataVersion(id);
      sendPlayerDataUpdate(id);
      
      res.json({ success: true, skills: updatedPlayer.skills, dataVersion: newDataVersion });
    } catch (error) {
      console.error('Admin: Error updating player skills:', error);
      res.status(500).json({ error: 'Failed to update player skills' });
    }
  });

  // Update player gold
  app.put('/api/admin/players/:id/gold', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { id } = req.params;
      
      const parsed = updateGoldSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid gold value', details: parsed.error.errors });
      }
      
      const { gold } = parsed.data;
      
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      // Increment dataVersion to invalidate client's stale cache
      const newDataVersion = (player.dataVersion || 1) + 1;
      const updatedPlayer = await storage.updatePlayer(id, { gold, dataVersion: newDataVersion });
      if (!updatedPlayer) {
        return res.status(500).json({ error: 'Failed to update player gold' });
      }
      
      // Notify the specific player if they're online
      bumpPlayerDataVersion(id);
      sendPlayerDataUpdate(id);
      
      res.json({ success: true, gold: updatedPlayer.gold, dataVersion: newDataVersion });
    } catch (error) {
      console.error('Admin: Error updating player gold:', error);
      res.status(500).json({ error: 'Failed to update player gold' });
    }
  });

  // Update player tester status
  app.put('/api/admin/players/:id/tester', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      const { isTester } = req.body;
      
      if (typeof isTester !== 'number' || (isTester !== 0 && isTester !== 1)) {
        return res.status(400).json({ error: 'Invalid isTester value, must be 0 or 1' });
      }
      
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      const updatedPlayer = await storage.updatePlayer(id, { isTester });
      if (!updatedPlayer) {
        return res.status(500).json({ error: 'Failed to update tester status' });
      }
      
      // Notify the specific player if they're online
      bumpPlayerDataVersion(id);
      sendPlayerDataUpdate(id);
      
      res.json({ success: true, isTester: updatedPlayer.isTester });
    } catch (error) {
      console.error('Admin: Error updating player tester status:', error);
      res.status(500).json({ error: 'Failed to update tester status' });
    }
  });

  // Update player equipment
  app.put('/api/admin/players/:id/equipment', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { id } = req.params;
      
      const parsed = updateEquipmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid equipment data', details: parsed.error.errors });
      }
      
      const { equipment } = parsed.data;
      
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      // Increment dataVersion to invalidate client's stale cache
      const newDataVersion = (player.dataVersion || 1) + 1;
      const updatedPlayer = await storage.updatePlayer(id, { equipment, dataVersion: newDataVersion });
      if (!updatedPlayer) {
        return res.status(500).json({ error: 'Failed to update player equipment' });
      }
      
      // Notify the specific player if they're online
      bumpPlayerDataVersion(id);
      sendPlayerDataUpdate(id);
      
      res.json({ success: true, equipment: updatedPlayer.equipment, dataVersion: newDataVersion });
    } catch (error) {
      console.error('Admin: Error updating player equipment:', error);
      res.status(500).json({ error: 'Failed to update player equipment' });
    }
  });

  // Update player username
  app.put('/api/admin/players/:id/username', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { id } = req.params;
      const { username } = req.body;
      
      if (!username || typeof username !== 'string' || username.trim().length < 1 || username.trim().length > 20) {
        return res.status(400).json({ error: 'Username must be between 1 and 20 characters' });
      }
      
      const cleanUsername = username.trim();
      
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      const updatedPlayer = await storage.updatePlayer(id, { username: cleanUsername } as any);
      if (!updatedPlayer) {
        return res.status(500).json({ error: 'Failed to update username' });
      }
      
      bumpPlayerDataVersion(id);
      sendPlayerDataUpdate(id);
      
      res.json({ success: true, username: updatedPlayer.username });
    } catch (error) {
      console.error('Admin: Error updating player username:', error);
      res.status(500).json({ error: 'Failed to update player username' });
    }
  });

  // Update player mastery XP values
  app.put('/api/admin/players/:id/mastery', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { id } = req.params;
      
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      const masteryFields = ['masteryDagger', 'masterySwordShield', 'mastery2hSword', 'mastery2hAxe', 'mastery2hWarhammer', 'masteryBow', 'masteryStaff'];
      const updates: any = {};
      for (const field of masteryFields) {
        if (req.body[field] !== undefined) {
          updates[field] = parseInt(req.body[field]) || 0;
        }
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid mastery fields provided' });
      }
      
      const newDataVersion = (player.dataVersion || 1) + 1;
      updates.dataVersion = newDataVersion;
      
      const updatedPlayer = await storage.updatePlayer(id, updates);
      if (!updatedPlayer) {
        return res.status(500).json({ error: 'Failed to update mastery' });
      }
      
      bumpPlayerDataVersion(id);
      sendPlayerDataUpdate(id);
      
      res.json({ success: true, dataVersion: newDataVersion });
    } catch (error) {
      console.error('Admin: Error updating player mastery:', error);
      res.status(500).json({ error: 'Failed to update player mastery' });
    }
  });

  app.put('/api/admin/players/:id/role', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { staffRole, isTester } = req.body;
      const updates: any = {};
      if (staffRole !== undefined) {
        updates.staffRole = ['moderator', 'translator'].includes(staffRole) ? staffRole : null;
      }
      if (isTester !== undefined) {
        updates.isTester = isTester ? 1 : 0;
      }
      await storage.updatePlayer(req.params.id, updates);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update role' });
    }
  });

  app.get('/api/admin/players/:id/dungeon-keys', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      const keys = await keyDropService.getPlayerKeys(id);
      const keyTypes: Array<'bronze' | 'silver' | 'gold' | 'void'> = ['bronze', 'silver', 'gold', 'void'];
      const result = keyTypes.map(keyType => {
        const found = keys.find(k => k.keyType === keyType);
        return { keyType, quantity: found ? found.quantity : 0 };
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch dungeon keys' });
    }
  });

  app.put('/api/admin/players/:id/dungeon-keys', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      const { keys } = req.body;
      if (!keys || !Array.isArray(keys)) {
        return res.status(400).json({ error: 'keys array required' });
      }
      const validKeyTypes = ['bronze', 'silver', 'gold', 'void'];
      for (const entry of keys) {
        if (!validKeyTypes.includes(entry.keyType) || typeof entry.quantity !== 'number' || entry.quantity < 0) {
          return res.status(400).json({ error: `Invalid key entry: ${JSON.stringify(entry)}` });
        }
      }
      for (const entry of keys) {
        const existing = await db.select()
          .from(playerDungeonKeys)
          .where(and(
            eq(playerDungeonKeys.playerId, id),
            eq(playerDungeonKeys.keyType, entry.keyType)
          ))
          .limit(1);
        if (existing.length > 0) {
          await db.update(playerDungeonKeys)
            .set({ quantity: entry.quantity } as any)
            .where(eq(playerDungeonKeys.id, existing[0].id));
        } else {
          await db.insert(playerDungeonKeys)
            .values({
              playerId: id,
              keyType: entry.keyType,
              quantity: entry.quantity,
            } as any);
        }
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update dungeon keys' });
    }
  });

  // Reset player character to initial state
  app.post('/api/admin/players/:id/reset', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      // Initial state values - like day 1
      const initialSkills = {
        attack: { level: 1, xp: 0 },
        strength: { level: 1, xp: 0 },
        defence: { level: 1, xp: 0 },
        hitpoints: { level: 10, xp: 1154 },
        mining: { level: 1, xp: 0 },
        woodcutting: { level: 1, xp: 0 },
        fishing: { level: 1, xp: 0 },
        hunting: { level: 1, xp: 0 },
        cooking: { level: 1, xp: 0 },
        crafting: { level: 1, xp: 0 },
        alchemy: { level: 1, xp: 0 }
      };
      
      const newDataVersion = (player.dataVersion || 1) + 1;
      
      const updatedPlayer = await storage.updatePlayer(id, {
        skills: initialSkills,
        inventory: {},
        gold: 0,
        equipment: {},
        equipmentDurability: {},
        inventoryDurability: {},
        activeBuffs: [],
        activeCombat: null,
        activeTask: null,
        activeTravel: null,
        currentHitpoints: 100,
        currentRegion: 'verdant',
        totalLevel: 0,
        combatSessionStats: null,
        afkTimerExpiresAt: null,
        dataVersion: newDataVersion
      });
      
      if (!updatedPlayer) {
        return res.status(500).json({ error: 'Failed to reset player character' });
      }
      
      // Notify the specific player if they're online
      bumpPlayerDataVersion(id);
      sendPlayerDataUpdate(id);
      
      console.log(`[Admin] Character reset for player ${id} (${player.username})`);
      
      res.json({ success: true, message: `Character reset for ${player.username}` });
    } catch (error) {
      console.error('Admin: Error resetting player character:', error);
      res.status(500).json({ error: 'Failed to reset player character' });
    }
  });

  app.post('/api/admin/players/:id/force-logout', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { id } = req.params;
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      await storage.updatePlayer(id, { sessionToken: null });
      console.log(`[Admin] Force logout for player ${id} (${player.username})`);
      res.json({ success: true, message: "Player session cleared" });
    } catch (error) {
      console.error('Admin: Error forcing logout:', error);
      res.status(500).json({ error: 'Failed to force logout' });
    }
  });

  app.post('/api/admin/players/:id/clear-active-task', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { id } = req.params;
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      await storage.updatePlayer(id, { activeTask: null, activeTravel: null });
      bumpPlayerDataVersion(id);
      sendPlayerDataUpdate(id);
      console.log(`[Admin] Cleared active task/travel for player ${id} (${player.username})`);
      res.json({ success: true, message: "Active task cleared" });
    } catch (error) {
      console.error('Admin: Error clearing active task:', error);
      res.status(500).json({ error: 'Failed to clear active task' });
    }
  });

  app.post('/api/admin/players/:id/clear-offline-progress', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { id } = req.params;
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      bumpPlayerDataVersion(id);
      sendPlayerDataUpdate(id);
      console.log(`[Admin] Cleared offline progress for player ${id} (${player.username})`);
      res.json({ success: true, message: "Offline progress cleared" });
    } catch (error) {
      console.error('Admin: Error clearing offline progress:', error);
      res.status(500).json({ error: 'Failed to clear offline progress' });
    }
  });

  app.post('/api/admin/players/:id/clear-active-combat', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { id } = req.params;
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      await storage.updatePlayer(id, { activeCombat: null });
      bumpPlayerDataVersion(id);
      sendPlayerDataUpdate(id);
      console.log(`[Admin] Cleared active combat for player ${id} (${player.username})`);
      res.json({ success: true, message: "Active combat cleared" });
    } catch (error) {
      console.error('Admin: Error clearing active combat:', error);
      res.status(500).json({ error: 'Failed to clear active combat' });
    }
  });

  app.post('/api/admin/players/:id/change-region', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { id } = req.params;
      const { region } = req.body;
      if (!region) {
        return res.status(400).json({ error: 'Region is required' });
      }
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      await storage.updatePlayer(id, { currentRegion: region, activeTravel: null });
      bumpPlayerDataVersion(id);
      sendPlayerDataUpdate(id);
      console.log(`[Admin] Changed region to ${region} for player ${id} (${player.username})`);
      res.json({ success: true, message: `Region changed to ${region}` });
    } catch (error) {
      console.error('Admin: Error changing region:', error);
      res.status(500).json({ error: 'Failed to change region' });
    }
  });

  app.post('/api/admin/players/:id/ban', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      const reason = req.body.reason || "Banned by admin";
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      await storage.updatePlayer(id, { isBanned: 1, banReason: reason, bannedAt: new Date(), sessionToken: null });
      if (player.email) {
        await storage.addBannedEmail(player.email, player.username, reason);
      }
      console.log(`[Admin] Banned player ${id} (${player.username}) - Reason: ${reason}`);
      res.json({ success: true, message: "Player banned" });
    } catch (error) {
      console.error('Admin: Error banning player:', error);
      res.status(500).json({ error: 'Failed to ban player' });
    }
  });

  app.post('/api/admin/players/:id/unban', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      await storage.updatePlayer(id, { isBanned: 0, banReason: null, bannedAt: null });
      if (player.email) {
        await storage.removeBannedEmail(player.email);
      }
      console.log(`[Admin] Unbanned player ${id} (${player.username})`);
      res.json({ success: true, message: "Player unbanned" });
    } catch (error) {
      console.error('Admin: Error unbanning player:', error);
      res.status(500).json({ error: 'Failed to unban player' });
    }
  });

  app.post('/api/admin/players/:id/clear-buffs', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { id } = req.params;
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      await storage.updatePlayer(id, { activeBuffs: '[]' });
      bumpPlayerDataVersion(id);
      sendPlayerDataUpdate(id);
      console.log(`[Admin] Cleared buffs for player ${id} (${player.username})`);
      res.json({ success: true, message: "Buffs cleared" });
    } catch (error) {
      console.error('Admin: Error clearing buffs:', error);
      res.status(500).json({ error: 'Failed to clear buffs' });
    }
  });

  app.post('/api/admin/players/:id/reset-firebase-uid', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      const oldUid = player.firebaseUid;
      await storage.updatePlayer(id, { firebaseUid: null as any, userId: null as any });
      
      console.log(`[Admin] Reset Firebase UID for player ${player.username} (${id}). Old UID: ${oldUid}`);
      
      res.json({ success: true, message: `Firebase UID reset for ${player.username}. They will need to log in again to re-link.` });
    } catch (error) {
      console.error('Admin: Error resetting Firebase UID:', error);
      res.status(500).json({ error: 'Failed to reset Firebase UID' });
    }
  });

  // Sync all game data - updates regionId for skill actions and recipes
  app.post('/api/admin/sync-game-data', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      console.log('[Admin API] Starting full game data sync...');
      
      // Define skill actions with correct regionId (matching production DB IDs)
      const skillActionRegions: Record<string, string> = {
        // Mining (already synced but include for completeness)
        'mining_copper_ore': 'verdant',
        'mining_tin_ore': 'verdant',
        'mining_iron_ore': 'quarry',
        'mining_coal': 'quarry',
        'mining_silver_ore': 'quarry',
        'mining_gold_ore': 'obsidian',
        'mining_mithril_ore': 'dragonspire',
        'mining_adamant_ore': 'frozen_wastes',
        'mining_rune_ore': 'void_realm',
        // Woodcutting (production uses _tree suffix)
        'woodcutting_normal_tree': 'verdant',
        'woodcutting_oak_tree': 'verdant',
        'woodcutting_willow_tree': 'quarry',
        'woodcutting_maple_tree': 'dunes',
        'woodcutting_yew_tree': 'obsidian',
        'woodcutting_magic_tree': 'dragonspire',
        // Fishing
        'fishing_shrimp': 'verdant',
        'fishing_sardine': 'verdant',
        'fishing_herring': 'verdant',
        'fishing_trout': 'quarry',
        'fishing_salmon': 'dunes',
        'fishing_tuna': 'dunes',
        'fishing_lobster': 'obsidian',
        'fishing_swordfish': 'obsidian',
        'fishing_shark': 'dragonspire',
        // Hunting
        'hunting_rabbit': 'verdant',
        'hunting_deer': 'verdant',
        'hunting_sheep': 'verdant',
        'hunting_boar': 'quarry',
        'hunting_mountain_goat': 'quarry',
        'hunting_desert_fox': 'dunes',
        'hunting_camel': 'dunes',
        'hunting_shadow_wolf': 'obsidian',
        'hunting_dark_panther': 'obsidian',
        'hunting_wyvern': 'dragonspire',
        'hunting_celestial_stag': 'dragonspire',
        'hunting_ice_bear': 'frozen_wastes',
        'hunting_frost_tiger': 'frozen_wastes',
        'hunting_void_beast': 'void_realm',
        'hunting_abyssal_creature': 'void_realm',
      };
      
      // Define recipes with correct regionId (matching production DB IDs)
      const recipeRegions: Record<string, string> = {
        // Smelting (already has correct region_id in prod, but include for safety)
        'smelt_bronze': 'verdant',
        'scrap_to_bronze': 'verdant',
        'smelt_iron': 'quarry',
        'scrap_to_iron': 'quarry',
        'smelt_silver': 'quarry',
        'scrap_to_silver': 'quarry',
        'smelt_steel': 'quarry',
        'scrap_to_steel': 'quarry',
        'smelt_gold': 'dunes',
        'scrap_to_gold': 'dunes',
        'smelt_mithril': 'dragonspire',
        'scrap_to_mithril': 'dragonspire',
        'smelt_adamant': 'frozen_wastes',
        'scrap_to_adamant': 'frozen_wastes',
        'smelt_rune': 'void_realm',
        'scrap_to_rune': 'void_realm',
        // Cooking
        'cook_shrimp': 'verdant',
        'cook_meat': 'verdant',
        'cook_chicken': 'verdant',
        'cook_rabbit': 'verdant',
        'cook_herring': 'verdant',
        'cook_trout': 'quarry',
        'cook_goblin_kebab': 'quarry',
        'cook_spider_soup': 'quarry',
        'cook_salmon': 'dunes',
        'cook_tuna': 'dunes',
        'cook_orc_roast': 'dunes',
        'cook_lobster': 'obsidian',
        'cook_swordfish': 'obsidian',
        'cook_meat_pie': 'obsidian',
        'cook_shark': 'dragonspire',
        'cook_dragon_steak': 'dragonspire',
        'cook_sea_turtle': 'frozen_wastes',
        'cook_fish_stew': 'frozen_wastes',
        'cook_manta_ray': 'void_realm',
        // Alchemy
        'alchemy_minor_healing': 'verdant',
        'alchemy_antidote': 'verdant',
        'alchemy_soft_fur_tonic': 'verdant',
        'alchemy_wolf_fang_elixir': 'quarry',
        'alchemy_bat_wing_brew': 'quarry',
        'alchemy_orc_war_potion': 'dunes',
        'alchemy_sand_storm_elixir': 'dunes',
        'alchemy_mummy_antidote': 'dunes',
        'alchemy_djinn_essence': 'obsidian',
        'alchemy_xp_boost': 'obsidian',
        'alchemy_dragon_fire_elixir': 'dragonspire',
        'alchemy_wyvern_scale_potion': 'dragonspire',
        'alchemy_dark_essence_elixir': 'frozen_wastes',
        'alchemy_infernal_potion': 'void_realm',
        // Armor crafting - T1 (verdant)
        'craft_leather_boots_t1': 'verdant',
        'craft_leather_gloves_t1': 'verdant',
        'craft_leather_hood_t1': 'verdant',
        'craft_leather_pants_t1': 'verdant',
        'craft_leather_vest_t1': 'verdant',
        'craft_linen_hat_t1': 'verdant',
        'craft_linen_robe_t1': 'verdant',
        'craft_linen_sandals_t1': 'verdant',
        'craft_linen_skirt_t1': 'verdant',
        'craft_linen_wraps_t1': 'verdant',
        // Armor crafting - T2 (quarry)
        'craft_hardened_boots_t2': 'quarry',
        'craft_hardened_gloves_t2': 'quarry',
        'craft_hardened_hood_t2': 'quarry',
        'craft_hardened_pants_t2': 'quarry',
        'craft_hardened_vest_t2': 'quarry',
        'craft_silk_hat_t2': 'quarry',
        'craft_silk_robe_t2': 'quarry',
        'craft_silk_sandals_t2': 'quarry',
        'craft_silk_skirt_t2': 'quarry',
        'craft_silk_wraps_t2': 'quarry',
      };
      
      const results = { skillActionsUpdated: 0, recipesUpdated: 0, categoriesUpdated: 0, totalSkillActions: 0, totalRecipes: 0 };
      
      // Update skill actions - only if regionId is currently NULL or empty
      for (const [actionId, regionId] of Object.entries(skillActionRegions)) {
        try {
          const [existing] = await db.select({ regionId: gameSkillActions.regionId }).from(gameSkillActions).where(eq(gameSkillActions.id, actionId));
          if (existing && !existing.regionId) {
            await storage.updateSkillAction(actionId, { regionId });
            results.skillActionsUpdated++;
          }
        } catch (e) {
          console.log(`[Admin API] Skill action ${actionId} not found or error:`, e);
        }
      }
      
      // Update recipes - only if regionId is currently NULL or empty
      for (const [recipeId, regionId] of Object.entries(recipeRegions)) {
        try {
          const [existing] = await db.select({ regionId: gameRecipes.regionId }).from(gameRecipes).where(eq(gameRecipes.id, recipeId));
          if (existing && !existing.regionId) {
            await storage.updateGameRecipe(recipeId, { regionId });
            results.recipesUpdated++;
          }
        } catch (e) {
          console.log(`[Admin API] Recipe ${recipeId} not found or error:`, e);
        }
      }
      
      // Update categories: rename "sword" to "weapon"
      try {
        const updateResult = await db.update(gameRecipes)
          .set({ category: 'weapon' } as any)
          .where(eq(gameRecipes.category, 'sword'));
        console.log(`[Admin API] Updated sword category to weapon`);
        results.categoriesUpdated++;
      } catch (e) {
        console.log(`[Admin API] Category update error:`, e);
      }
      
      // Get actual totals from database
      try {
        const allSkillActions = await db.select().from(gameSkillActions);
        const allRecipes = await db.select().from(gameRecipes);
        results.totalSkillActions = allSkillActions.length;
        results.totalRecipes = allRecipes.length;
      } catch (e) {
        console.log(`[Admin API] Error getting totals:`, e);
      }
      
      console.log('[Admin API] Game data sync complete:', results);
      res.json({ success: true, message: 'Game data synced successfully', results });
    } catch (error) {
      console.error('Admin: Error syncing game data:', error);
      res.status(500).json({ error: 'Failed to sync game data', details: String(error) });
    }
  });

  // Full seed - insert all missing game data from static sources
  app.post('/api/admin/full-seed', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      console.log('[Admin API] Starting full seed...');
      const { seedGameData } = await import('./seedGameData');
      const results = await seedGameData();
      console.log('[Admin API] Full seed complete:', results);
      res.json({ success: true, message: 'Full seed completed successfully', results });
    } catch (error) {
      console.error('Admin: Error running full seed:', error);
      res.status(500).json({ error: 'Failed to run full seed', details: String(error) });
    }
  });

  // Sync regions - fix region data (remove invalid, add missing)
  app.post('/api/admin/sync-regions', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      console.log('[Admin API] Starting region sync...');
      
      // Define correct regions
      const correctRegions = [
        { id: 'verdant', name: 'Yeşil Vadi', description: 'Yeni başlayanlar için uygun orman ve çayırlar', levelRangeMin: 1, levelRangeMax: 18, color: 'green', sortOrder: 0, travelCost: 0, travelTime: 0, mapPosition: { x: 18, y: 45 } },
        { id: 'quarry', name: 'Küllü Ocak', description: 'Demir ve kömür açısından zengin terkedilmiş maden', levelRangeMin: 10, levelRangeMax: 28, color: 'amber', sortOrder: 1, travelCost: 50, travelTime: 30, mapPosition: { x: 35, y: 22 } },
        { id: 'dunes', name: 'Yıldız Çölü', description: 'Gizemli yaratıkların yaşadığı büyülü çöl', levelRangeMin: 18, levelRangeMax: 36, color: 'yellow', sortOrder: 2, travelCost: 150, travelTime: 60, mapPosition: { x: 50, y: 38 } },
        { id: 'obsidian', name: 'Obsidyen Kale', description: 'Karanlık şövalyelerin ve güçlü düşmanların kalesi', levelRangeMin: 30, levelRangeMax: 50, color: 'purple', sortOrder: 3, travelCost: 300, travelTime: 90, mapPosition: { x: 47, y: 85 } },
        { id: 'dragonspire', name: 'Ejder Zirvesi', description: 'Sadece en güçlü savaşçılar için ejder yuvası', levelRangeMin: 38, levelRangeMax: 70, color: 'red', sortOrder: 4, travelCost: 500, travelTime: 120, mapPosition: { x: 76, y: 52 } },
        { id: 'frozen_wastes', name: 'Buzul Çölü', description: 'Dondurucu soğuk ve buz fırtınalarıyla kaplı tehlikeli bir bölge', levelRangeMin: 60, levelRangeMax: 85, color: '#60a5fa', sortOrder: 5, travelCost: 750, travelTime: 150, mapPosition: { x: 72, y: 18 } },
        { id: 'void_realm', name: 'Boşluk Diyarı', description: 'Gerçekliğin sınırlarında yer alan karanlık bir boyut', levelRangeMin: 80, levelRangeMax: 100, color: '#a855f7', sortOrder: 6, travelCost: 1000, travelTime: 180, mapPosition: { x: 92, y: 12 } },
      ];
      
      const invalidRegionIds = ['forest', 'volcano'];
      const results = { deleted: 0, added: 0, updated: 0 };
      
      // Delete invalid regions
      for (const regionId of invalidRegionIds) {
        try {
          await storage.deleteCombatRegion(regionId);
          results.deleted++;
          console.log(`[Admin API] Deleted invalid region: ${regionId}`);
        } catch (e) {
          // Region might not exist, ignore
        }
      }
      
      // Upsert correct regions
      for (const region of correctRegions) {
        try {
          const existing = await storage.getCombatRegion(region.id);
          if (existing) {
            await storage.updateCombatRegion(region.id, region);
            results.updated++;
          } else {
            await storage.createCombatRegion(region);
            results.added++;
          }
        } catch (e) {
          console.error(`[Admin API] Error syncing region ${region.id}:`, e);
        }
      }
      
      console.log('[Admin API] Region sync complete:', results);
      res.json({ success: true, message: 'Regions synced successfully', results });
    } catch (error) {
      console.error('Admin: Error syncing regions:', error);
      res.status(500).json({ error: 'Failed to sync regions', details: String(error) });
    }
  });

  // Seed game data (for production initialization)
  app.post('/api/admin/seed-game-data', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      console.log('[Admin API] Starting game data seed...');
      const { seedGameData } = await import('./seedGameData');
      const results = await seedGameData();
      console.log('[Admin API] Game data seed complete:', results);
      res.json({ 
        success: true, 
        message: 'Game data seeded successfully',
        inserted: {
          items: results.items,
          monsters: results.monsters,
          regions: results.regions,
          recipes: results.recipes,
          skillActions: results.skillActions
        },
        skipped: results.skipped
      });
    } catch (error) {
      console.error('Admin: Error seeding game data:', error);
      res.status(500).json({ error: 'Failed to seed game data', details: String(error) });
    }
  });

  // Publish all draft items/recipes/monsters/skillActions
  app.post('/api/admin/publish-drafts', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const itemsResult = await db.update(gameItems).set({ isDraft: 0 } as any).where(eq(gameItems.isDraft, 1));
      const recipesResult = await db.update(gameRecipes).set({ isDraft: 0 } as any).where(eq(gameRecipes.isDraft, 1));
      const monstersResult = await db.update(gameMonsters).set({ isDraft: 0 } as any).where(eq(gameMonsters.isDraft, 1));
      const skillActionsResult = await db.update(gameSkillActions).set({ isDraft: 0 } as any).where(eq(gameSkillActions.isDraft, 1));

      const counts = {
        items: itemsResult.rowCount || 0,
        recipes: recipesResult.rowCount || 0,
        monsters: monstersResult.rowCount || 0,
        skillActions: skillActionsResult.rowCount || 0,
      };

      console.log(`[Admin] Published drafts:`, counts);
      bumpGameDataVersion();
      res.json({ success: true, published: counts });
    } catch (error) {
      console.error('Admin: Error publishing drafts:', error);
      res.status(500).json({ error: 'Failed to publish drafts' });
    }
  });

  // Toggle draft status for a single item
  app.put('/api/admin/:table/:id/toggle-draft', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { table, id } = req.params;
      let tableRef: any;
      switch (table) {
        case 'items': tableRef = gameItems; break;
        case 'monsters': tableRef = gameMonsters; break;
        case 'recipes': tableRef = gameRecipes; break;
        case 'skill-actions': tableRef = gameSkillActions; break;
        default: return res.status(400).json({ error: 'Invalid table' });
      }

      const existing = await db.select().from(tableRef).where(eq(tableRef.id, id)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      const newDraftStatus = existing[0].isDraft === 1 ? 0 : 1;
      await db.update(tableRef).set({ isDraft: newDraftStatus }).where(eq(tableRef.id, id));

      console.log(`[Admin] Toggled draft for ${table}/${id}: isDraft=${newDraftStatus}`);
      bumpGameDataVersion();
      res.json({ success: true, isDraft: newDraftStatus });
    } catch (error) {
      console.error('Admin: Error toggling draft:', error);
      res.status(500).json({ error: 'Failed to toggle draft status' });
    }
  });

  // Broadcast game update to all connected players
  app.post('/api/admin/broadcast', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { categories } = req.body;
      const validCategories = ['items', 'monsters', 'regions', 'recipes', 'raid-bosses'];
      
      if (!categories || !Array.isArray(categories)) {
        // Broadcast all categories
        for (const category of validCategories) {
          bumpGameDataVersion();
          broadcastGameUpdate(category);
        }
        console.log('Admin: Broadcast sent for all categories');
        return res.json({ success: true, categories: validCategories });
      }
      
      const broadcastedCategories: string[] = [];
      for (const category of categories) {
        if (validCategories.includes(category)) {
          bumpGameDataVersion();
          broadcastGameUpdate(category);
          broadcastedCategories.push(category);
        }
      }
      
      console.log('Admin: Broadcast sent for categories:', broadcastedCategories);
      res.json({ success: true, categories: broadcastedCategories });
    } catch (error) {
      console.error('Admin: Error broadcasting update:', error);
      res.status(500).json({ error: 'Failed to broadcast update' });
    }
  });

  // Batch translate all items using OpenAI (SSE for progress)
  app.get('/api/admin/translate-items', adminAuth, async (req, res) => {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    try {
      const items = await storage.getAllGameItems();
      const targetLanguages = ['en', 'zh', 'hi', 'es', 'fr', 'ar', 'ru', 'tr'];
      
      sendEvent({ type: 'started', total: items.length });
      
      let completed = 0;
      let errors = 0;
      
      // Process items in batches of 5 for efficiency
      const batchSize = 5;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (item) => {
          try {
            sendEvent({ type: 'processing', itemId: item.id, itemName: item.name, index: completed });
            
            // Skip if already has translations for all languages (both name AND description)
            const existingNameTranslations = item.nameTranslations as Record<string, string> || {};
            const existingDescTranslations = item.descriptionTranslations as Record<string, string> || {};
            const hasAllNameTranslations = targetLanguages.every(lang => existingNameTranslations[lang]);
            const hasAllDescTranslations = !item.description || targetLanguages.every(lang => existingDescTranslations[lang]);
            
            if (hasAllNameTranslations && hasAllDescTranslations) {
              completed++;
              sendEvent({ type: 'skipped', itemId: item.id, itemName: item.name, completed, total: items.length });
              return;
            }
            
            const prompt = `Translate the following game item name and description into these languages: ${targetLanguages.join(', ')}.
Return ONLY a JSON object with this exact structure:
{
  "nameTranslations": { "en": "...", "zh": "...", "hi": "...", "es": "...", "fr": "...", "ar": "...", "ru": "...", "tr": "..." },
  "descriptionTranslations": { "en": "...", "zh": "...", "hi": "...", "es": "...", "fr": "...", "ar": "...", "ru": "...", "tr": "..." }
}

Item Name: ${item.name}
Item Description: ${item.description || 'No description'}

Important: Keep game terminology consistent. For fantasy RPG items, use appropriate terms in each language.`;
            
            const response = await openai.chat.completions.create({
              model: 'gpt-4.1-mini',
              messages: [{ role: 'user', content: prompt }],
              response_format: { type: 'json_object' },
              max_tokens: 1000,
            });
            
            const content = response.choices[0]?.message?.content || '{}';
            const translations = JSON.parse(content);
            
            // Update item in database
            await storage.updateGameItem(item.id, {
              nameTranslations: translations.nameTranslations || {},
              descriptionTranslations: translations.descriptionTranslations || {},
            });
            
            completed++;
            sendEvent({ 
              type: 'progress', 
              itemId: item.id, 
              itemName: item.name, 
              completed, 
              total: items.length,
              translations: translations.nameTranslations
            });
          } catch (error) {
            console.error(`Error translating item ${item.id}:`, error);
            errors++;
            completed++;
            sendEvent({ 
              type: 'error', 
              itemId: item.id, 
              itemName: item.name,
              error: error instanceof Error ? error.message : 'Unknown error',
              completed,
              total: items.length
            });
          }
        });
        
        await Promise.all(batchPromises);
        
        // Small delay between batches to avoid rate limits
        if (i + batchSize < items.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      sendEvent({ type: 'complete', total: items.length, completed, errors });
      res.end();
    } catch (error) {
      console.error('Translation endpoint error:', error);
      sendEvent({ type: 'fatal', error: error instanceof Error ? error.message : 'Unknown error' });
      res.end();
    }
  });

  app.post('/api/admin/translate', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator', 'translator'])) return;
      const { texts, targetLanguages } = req.body;
      if (!texts || !Array.isArray(texts) || !targetLanguages || !Array.isArray(targetLanguages)) {
        return res.status(400).json({ error: 'Invalid request body. Expected { texts: [{key, value}], targetLanguages: string[] }' });
      }

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a game translator for a dark fantasy RPG called IdleThrone. Translate the given texts to the specified languages. Return JSON only.'
          },
          {
            role: 'user',
            content: `Translate the following texts to these languages: ${targetLanguages.join(', ')}. Texts: ${JSON.stringify(texts)}. Return a JSON object where each key is the text key, and each value is an object mapping language codes to translations.`
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4000,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const translations = JSON.parse(content);

      res.json({ translations });
    } catch (error) {
      console.error('Translation endpoint error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Translation failed' });
    }
  });

  app.post('/api/admin/upload-image', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const { imageData, fileName, folder } = req.body;

      const allowedFolders = ['items', 'monsters', 'regions'];
      if (!allowedFolders.includes(folder)) {
        return res.status(400).json({ error: 'Invalid folder. Must be one of: ' + allowedFolders.join(', ') });
      }

      if (!fileName || typeof fileName !== 'string') {
        return res.status(400).json({ error: 'Invalid file name' });
      }

      const ext = path.extname(fileName).toLowerCase();
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
      if (!allowedExtensions.includes(ext)) {
        return res.status(400).json({ error: 'Invalid file extension. Must be one of: ' + allowedExtensions.join(', ') });
      }

      if (!imageData || typeof imageData !== 'string') {
        return res.status(400).json({ error: 'Invalid image data' });
      }

      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      if (buffer.length > 2 * 1024 * 1024) {
        return res.status(400).json({ error: 'File too large. Maximum size is 2MB.' });
      }

      const clientDirPath = path.join(process.cwd(), 'client', 'public', 'images', folder);
      const distDirPath = path.join(process.cwd(), 'dist', 'public', 'images', folder);
      await fs.promises.mkdir(clientDirPath, { recursive: true });
      await fs.promises.mkdir(distDirPath, { recursive: true });

      const clientFilePath = path.join(clientDirPath, fileName);
      const distFilePath = path.join(distDirPath, fileName);
      await fs.promises.writeFile(clientFilePath, buffer);
      await fs.promises.writeFile(distFilePath, buffer);

      const publicPath = `/images/${folder}/${fileName}`;
      res.json({ path: publicPath });
    } catch (error) {
      console.error('Upload image error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed' });
    }
  });

  // ==========================================
  // ADMIN DUNGEON MANAGEMENT ENDPOINTS
  // ==========================================

  // Zod validation schemas for admin dungeon routes
  const dungeonCreateSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    tier: z.number().min(1).max(8),
    keyType: z.enum(['bronze', 'silver', 'gold', 'void']),
    floorCount: z.number().nullable().optional(),
    bossFloors: z.array(z.number()).optional(),
    minLevel: z.number().min(1).optional(),
    recommendedLevel: z.number().min(1).optional(),
    isEndless: z.number().min(0).max(1).optional(),
    isActive: z.number().min(0).max(1).optional(),
    icon: z.string().nullable().optional(),
    nameTranslations: z.record(z.string()).optional(),
    descriptionTranslations: z.record(z.string()).optional(),
  });

  const dungeonUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    tier: z.number().min(1).max(8).optional(),
    keyType: z.enum(['bronze', 'silver', 'gold', 'void']).optional(),
    floorCount: z.number().nullable().optional(),
    bossFloors: z.array(z.number()).optional(),
    minLevel: z.number().min(1).optional(),
    recommendedLevel: z.number().min(1).optional(),
    isEndless: z.number().min(0).max(1).optional(),
    isActive: z.number().min(0).max(1).optional(),
    icon: z.string().nullable().optional(),
    nameTranslations: z.record(z.string()).optional(),
    descriptionTranslations: z.record(z.string()).optional(),
  });

  const dungeonModifierCreateSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    effect: z.record(z.unknown()).optional(),
    icon: z.string().nullable().optional(),
    tier: z.number().min(1).optional(),
    isActive: z.number().min(0).max(1).optional(),
    nameTranslations: z.record(z.string()).optional(),
    descriptionTranslations: z.record(z.string()).optional(),
  });

  const dungeonModifierUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    effect: z.record(z.unknown()).optional(),
    icon: z.string().nullable().optional(),
    tier: z.number().min(1).optional(),
    isActive: z.number().min(0).max(1).optional(),
    nameTranslations: z.record(z.string()).optional(),
    descriptionTranslations: z.record(z.string()).optional(),
  });

  const keyConfigCreateSchema = z.object({
    id: z.string().min(1),
    keyType: z.enum(['bronze', 'silver', 'gold', 'void']),
    monsterTierMin: z.number().min(1),
    monsterTierMax: z.number().min(1),
    dropChance: z.number().min(0).max(1),
    bossDropChance: z.number().min(0).max(1),
    isActive: z.number().min(0).max(1).optional(),
  });

  const keyConfigUpdateSchema = z.object({
    keyType: z.enum(['bronze', 'silver', 'gold', 'void']).optional(),
    monsterTierMin: z.number().min(1).optional(),
    monsterTierMax: z.number().min(1).optional(),
    dropChance: z.number().min(0).max(1).optional(),
    bossDropChance: z.number().min(0).max(1).optional(),
    isActive: z.number().min(0).max(1).optional(),
  });

  const partySynergyCreateSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    requiredRoles: z.array(z.string()).optional(),
    requiredConditions: z.record(z.unknown()).optional(),
    bonuses: z.record(z.unknown()).optional(),
    isActive: z.number().min(0).max(1).optional(),
    nameTranslations: z.record(z.string()).optional(),
    descriptionTranslations: z.record(z.string()).optional(),
  });

  const partySynergyUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    requiredRoles: z.array(z.string()).optional(),
    requiredConditions: z.record(z.unknown()).optional(),
    bonuses: z.record(z.unknown()).optional(),
    isActive: z.number().min(0).max(1).optional(),
    nameTranslations: z.record(z.string()).optional(),
    descriptionTranslations: z.record(z.string()).optional(),
  });

  // GET /api/admin/dungeons - List all dungeons
  app.get('/api/admin/dungeons', adminAuth, async (req, res) => {
    try {
      const allDungeons = await db.select().from(dungeons);
      res.json(allDungeons);
    } catch (error) {
      console.error('Admin: Error fetching dungeons:', error);
      res.status(500).json({ error: 'Failed to fetch dungeons' });
    }
  });

  // POST /api/admin/dungeons - Create dungeon
  app.post('/api/admin/dungeons', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const parseResult = dungeonCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
      }
      const data = parseResult.data;
      await db.insert(dungeons).values({
        id: data.id,
        name: data.name,
        description: data.description,
        tier: data.tier,
        keyType: data.keyType,
        floorCount: data.floorCount || null,
        bossFloors: data.bossFloors || [],
        minLevel: data.minLevel || 1,
        recommendedLevel: data.recommendedLevel || 1,
        isEndless: data.isEndless || 0,
        isActive: data.isActive ?? 1,
        icon: data.icon || null,
        nameTranslations: data.nameTranslations || {},
        descriptionTranslations: data.descriptionTranslations || {},
      } as any);
      dungeonService.invalidateCache();
      res.status(201).json({ success: true });
    } catch (error) {
      console.error('Admin: Error creating dungeon:', error);
      res.status(500).json({ error: 'Failed to create dungeon' });
    }
  });

  // PUT /api/admin/dungeons/:id - Update dungeon
  app.put('/api/admin/dungeons/:id', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator', 'translator'])) return;
      const { id } = req.params;
      const parseResult = dungeonUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
      }
      const data = parseResult.data;
      await db.update(dungeons)
        .set({
          name: data.name,
          description: data.description,
          tier: data.tier,
          keyType: data.keyType,
          floorCount: data.floorCount || null,
          bossFloors: data.bossFloors || [],
          minLevel: data.minLevel || 1,
          recommendedLevel: data.recommendedLevel || 1,
          isEndless: data.isEndless || 0,
          isActive: data.isActive ?? 1,
          icon: data.icon || null,
          nameTranslations: data.nameTranslations || {},
          descriptionTranslations: data.descriptionTranslations || {},
        } as any)
        .where(eq(dungeons.id, id));
      dungeonService.invalidateCache();
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error updating dungeon:', error);
      res.status(500).json({ error: 'Failed to update dungeon' });
    }
  });

  // DELETE /api/admin/dungeons/:id - Delete dungeon
  app.delete('/api/admin/dungeons/:id', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      await db.delete(dungeons).where(eq(dungeons.id, id));
      dungeonService.invalidateCache();
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error deleting dungeon:', error);
      res.status(500).json({ error: 'Failed to delete dungeon' });
    }
  });

  // GET /api/admin/dungeon-modifiers - List all modifiers
  app.get('/api/admin/dungeon-modifiers', adminAuth, async (req, res) => {
    try {
      const allModifiers = await db.select().from(dungeonModifiers);
      res.json(allModifiers);
    } catch (error) {
      console.error('Admin: Error fetching dungeon modifiers:', error);
      res.status(500).json({ error: 'Failed to fetch modifiers' });
    }
  });

  // POST /api/admin/dungeon-modifiers - Create modifier
  app.post('/api/admin/dungeon-modifiers', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const parseResult = dungeonModifierCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
      }
      const data = parseResult.data;
      await db.insert(dungeonModifiers).values({
        id: data.id,
        name: data.name,
        description: data.description,
        effect: data.effect || {},
        icon: data.icon || null,
        tier: data.tier || 1,
        isActive: data.isActive ?? 1,
        nameTranslations: data.nameTranslations || {},
        descriptionTranslations: data.descriptionTranslations || {},
      } as any);
      dungeonService.invalidateCache();
      res.status(201).json({ success: true });
    } catch (error) {
      console.error('Admin: Error creating dungeon modifier:', error);
      res.status(500).json({ error: 'Failed to create modifier' });
    }
  });

  // PUT /api/admin/dungeon-modifiers/:id - Update modifier
  app.put('/api/admin/dungeon-modifiers/:id', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator', 'translator'])) return;
      const { id } = req.params;
      const parseResult = dungeonModifierUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
      }
      const data = parseResult.data;
      await db.update(dungeonModifiers)
        .set({
          name: data.name,
          description: data.description,
          effect: data.effect || {},
          icon: data.icon || null,
          tier: data.tier || 1,
          isActive: data.isActive ?? 1,
          nameTranslations: data.nameTranslations || {},
          descriptionTranslations: data.descriptionTranslations || {},
        } as any)
        .where(eq(dungeonModifiers.id, id));
      dungeonService.invalidateCache();
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error updating dungeon modifier:', error);
      res.status(500).json({ error: 'Failed to update modifier' });
    }
  });

  // DELETE /api/admin/dungeon-modifiers/:id - Delete modifier
  app.delete('/api/admin/dungeon-modifiers/:id', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      await db.delete(dungeonModifiers).where(eq(dungeonModifiers.id, id));
      dungeonService.invalidateCache();
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error deleting dungeon modifier:', error);
      res.status(500).json({ error: 'Failed to delete modifier' });
    }
  });

  // GET /api/admin/key-config - List all key configs
  app.get('/api/admin/key-config', adminAuth, async (req, res) => {
    try {
      const allConfigs = await db.select().from(dungeonKeyConfig);
      res.json(allConfigs);
    } catch (error) {
      console.error('Admin: Error fetching key configs:', error);
      res.status(500).json({ error: 'Failed to fetch key configs' });
    }
  });

  // POST /api/admin/key-config - Create key config
  app.post('/api/admin/key-config', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const parseResult = keyConfigCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
      }
      const data = parseResult.data;
      await db.insert(dungeonKeyConfig).values({
        id: data.id,
        keyType: data.keyType,
        monsterTierMin: data.monsterTierMin,
        monsterTierMax: data.monsterTierMax,
        dropChance: data.dropChance,
        bossDropChance: data.bossDropChance,
        isActive: data.isActive ?? 1,
      } as any);
      keyDropService.clearCache();
      res.status(201).json({ success: true });
    } catch (error) {
      console.error('Admin: Error creating key config:', error);
      res.status(500).json({ error: 'Failed to create key config' });
    }
  });

  // PUT /api/admin/key-config/:id - Update key config
  app.put('/api/admin/key-config/:id', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator', 'translator'])) return;
      const { id } = req.params;
      const parseResult = keyConfigUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
      }
      const data = parseResult.data;
      await db.update(dungeonKeyConfig)
        .set({
          keyType: data.keyType,
          monsterTierMin: data.monsterTierMin,
          monsterTierMax: data.monsterTierMax,
          dropChance: data.dropChance,
          bossDropChance: data.bossDropChance,
          isActive: data.isActive ?? 1,
        } as any)
        .where(eq(dungeonKeyConfig.id, id));
      keyDropService.clearCache();
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error updating key config:', error);
      res.status(500).json({ error: 'Failed to update key config' });
    }
  });

  // DELETE /api/admin/key-config/:id - Delete key config
  app.delete('/api/admin/key-config/:id', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      await db.delete(dungeonKeyConfig).where(eq(dungeonKeyConfig.id, id));
      keyDropService.clearCache();
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error deleting key config:', error);
      res.status(500).json({ error: 'Failed to delete key config' });
    }
  });

  // GET /api/admin/party-synergies - List all synergies
  app.get('/api/admin/party-synergies', adminAuth, async (req, res) => {
    try {
      const allSynergies = await db.select().from(partySynergies);
      res.json(allSynergies);
    } catch (error) {
      console.error('Admin: Error fetching party synergies:', error);
      res.status(500).json({ error: 'Failed to fetch synergies' });
    }
  });

  // POST /api/admin/party-synergies - Create synergy
  app.post('/api/admin/party-synergies', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator'])) return;
      const parseResult = partySynergyCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
      }
      const data = parseResult.data;
      await db.insert(partySynergies).values({
        id: data.id,
        name: data.name,
        description: data.description,
        requiredRoles: data.requiredRoles || [],
        requiredConditions: data.requiredConditions || {},
        bonuses: data.bonuses || {},
        isActive: data.isActive ?? 1,
        nameTranslations: data.nameTranslations || {},
        descriptionTranslations: data.descriptionTranslations || {},
      } as any);
      synergyService.invalidateCache();
      res.status(201).json({ success: true });
    } catch (error) {
      console.error('Admin: Error creating party synergy:', error);
      res.status(500).json({ error: 'Failed to create synergy' });
    }
  });

  // PUT /api/admin/party-synergies/:id - Update synergy
  app.put('/api/admin/party-synergies/:id', adminAuth, async (req, res) => {
    try {
      if (!requireRole(req, res, ['moderator', 'translator'])) return;
      const { id } = req.params;
      const parseResult = partySynergyUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
      }
      const data = parseResult.data;
      await db.update(partySynergies)
        .set({
          name: data.name,
          description: data.description,
          requiredRoles: data.requiredRoles || [],
          requiredConditions: data.requiredConditions || {},
          bonuses: data.bonuses || {},
          isActive: data.isActive ?? 1,
          nameTranslations: data.nameTranslations || {},
          descriptionTranslations: data.descriptionTranslations || {},
        } as any)
        .where(eq(partySynergies.id, id));
      synergyService.invalidateCache();
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error updating party synergy:', error);
      res.status(500).json({ error: 'Failed to update synergy' });
    }
  });

  // DELETE /api/admin/party-synergies/:id - Delete synergy
  app.delete('/api/admin/party-synergies/:id', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id } = req.params;
      await db.delete(partySynergies).where(eq(partySynergies.id, id));
      synergyService.invalidateCache();
      res.json({ success: true });
    } catch (error) {
      console.error('Admin: Error deleting party synergy:', error);
      res.status(500).json({ error: 'Failed to delete synergy' });
    }
  });

  // ==========================================
  // PARTY MANAGEMENT ENDPOINTS
  // ==========================================

  // Create a new party
  app.post('/api/parties', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Guest accounts cannot create or join parties
      if (player.isGuest === 1) {
        return res.status(403).json({ error: 'Guest accounts cannot create parties. Register your account first!' });
      }

      const { name, description, partyType } = req.body;
      const result = await partyService.createParty(player.id, name, description, partyType);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      broadcastToAllPlayers({ type: 'public_parties_updated' });
      res.status(201).json({ success: true, party: result.party });
    } catch (error) {
      console.error('Error creating party:', error);
      res.status(500).json({ error: 'Failed to create party' });
    }
  });

  app.patch('/api/parties/:partyId/name', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { partyId } = req.params;
      const { name } = req.body;

      if (name !== null && name !== undefined && typeof name !== 'string') {
        return res.status(400).json({ error: 'Name must be a string or null' });
      }

      const result = await partyService.updatePartyName(partyId, player.id, name ?? null);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, party: result.party });
    } catch (error) {
      console.error('Error updating party name:', error);
      res.status(500).json({ error: 'Failed to update party name' });
    }
  });

  // Update party description (leader only)
  app.patch('/api/parties/:partyId/description', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { partyId } = req.params;
      const { description } = req.body;

      if (description !== null && typeof description !== 'string') {
        return res.status(400).json({ error: 'Description must be a string or null' });
      }

      const result = await partyService.updatePartyDescription(partyId, player.id, description);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, party: result.party });
    } catch (error) {
      console.error('Error updating party description:', error);
      res.status(500).json({ error: 'Failed to update party description' });
    }
  });

  // Get public parties in a region
  app.get('/api/parties/public', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const regionId = req.query.regionId as string | undefined;

      const conditions = [
        eq(parties.isPublic, 1),
        eq(parties.status, 'forming'),
        eq(parties.partyType, 'social')
      ];
      if (regionId) {
        conditions.push(eq(parties.regionId, regionId));
      }

      const publicParties = await db.select()
        .from(parties)
        .where(and(...conditions))
        .orderBy(desc(parties.createdAt));

      const partiesWithMembers = [];
      for (const party of publicParties) {
        const membersWithPlayers = await db.select({
          member: partyMembers,
          player: {
            id: players.id,
            username: players.username,
            avatar: players.avatar,
            totalLevel: players.totalLevel,
            equipment: players.equipment,
            currentRegion: players.currentRegion,
            activeTask: players.activeTask,
            activeCombat: players.activeCombat,
          },
        })
          .from(partyMembers)
          .innerJoin(players, eq(partyMembers.playerId, players.id))
          .where(eq(partyMembers.partyId, party.id))
          .orderBy(partyMembers.position);

        if (membersWithPlayers.length < party.maxSize) {
          const leaderMember = membersWithPlayers.find(m => m.member.playerId === party.leaderId);
          partiesWithMembers.push({
            ...party,
            leaderUsername: leaderMember?.player.username || null,
            leaderRegion: leaderMember?.player.currentRegion || null,
            members: membersWithPlayers.map(row => ({
              ...row.member,
              username: row.player.username,
              totalLevel: row.player.totalLevel,
              avatar: row.player.avatar,
              equipment: row.player.equipment,
              currentRegion: row.player.currentRegion,
              isInCombat: row.player.activeCombat ? 1 : 0,
              activeTask: row.player.activeTask,
            })),
          });
        }
      }

      res.json({ success: true, parties: partiesWithMembers });
    } catch (error) {
      console.error('Error getting public parties:', error);
      res.status(500).json({ error: 'Failed to get public parties' });
    }
  });

  // Auto-join a public party in a region
  app.post('/api/parties/auto-join', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (player.isGuest === 1) {
        return res.status(403).json({ error: 'Guest accounts cannot join parties. Please register!' });
      }

      const regionId = req.query.regionId as string || player.currentRegion;

      const existingParty = await partyService.getPlayerParty(player.id);
      if (existingParty) {
        return res.status(400).json({ error: 'You are already in a party' });
      }

      const autoJoinConditions = [
        eq(parties.isPublic, 1),
        eq(parties.status, 'forming'),
        eq(parties.partyType, 'social')
      ];
      if (regionId) {
        autoJoinConditions.push(eq(parties.regionId, regionId));
      }

      const publicParties = await db.select()
        .from(parties)
        .where(and(...autoJoinConditions));

      let bestParty = null;
      let bestMemberCount = 0;

      for (const party of publicParties) {
        const memberCount = await db.select({ count: sql<number>`count(*)` })
          .from(partyMembers)
          .where(eq(partyMembers.partyId, party.id));

        const count = memberCount[0]?.count || 0;
        if (count < party.maxSize && count > bestMemberCount) {
          bestParty = party;
          bestMemberCount = count;
        }
      }

      if (!bestParty) {
        return res.status(404).json({ error: 'No suitable public party found' });
      }

      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT id FROM parties WHERE id = ${bestParty!.id} FOR UPDATE`);

          const memberCountResult = await tx.execute(sql`SELECT COUNT(*) as count FROM party_members WHERE party_id = ${bestParty!.id}`);
          const currentCount = parseInt(((memberCountResult as any).rows?.[0] ?? (memberCountResult as any)[0])?.count as string) || 0;
          if (currentCount >= bestParty!.maxSize) throw new Error('Party is full');

          const existingResult = await tx.execute(sql`SELECT pm.id FROM party_members pm INNER JOIN parties p ON pm.party_id = p.id WHERE pm.player_id = ${player.id} AND p.status != 'disbanded' LIMIT 1`);
          if (((existingResult as any).rows || existingResult).length > 0) throw new Error('You are already in a party');

          const nextPosition = currentCount + 1;
          const { getSubClass } = await import('@shared/subClasses');
          const equip = player.equipment as Record<string, string> | null;
          let weaponType: string | null = null;
          if (equip?.weapon) {
            const baseName = equip.weapon.replace(/\s*\((Common|Uncommon|Rare|Epic|Legendary|Mythic)\)$/, '').toLowerCase();
            if (baseName.includes('staff')) weaponType = 'staff';
            else if (baseName.includes('bow')) weaponType = 'bow';
            else if (baseName.includes('dagger')) weaponType = 'dagger';
            else if (baseName.includes('warhammer') || baseName.includes('hammer')) weaponType = '2h_warhammer';
            else if (baseName.includes('battleaxe') || baseName.includes('axe')) weaponType = '2h_axe';
            else if (equip.shield && (baseName.includes('sword') || baseName.includes('blade'))) weaponType = 'sword_shield';
            else if (baseName.includes('sword') || baseName.includes('blade')) weaponType = '2h_sword';
            else weaponType = 'sword_shield';
          }
          const subClass = getSubClass(weaponType, null);
          await tx.insert(partyMembers)
            .values({
              partyId: bestParty!.id,
              playerId: player.id,
              role: subClass.baseRole,
              position: nextPosition,
              isReady: 0,
              cachedWeaponType: weaponType,
            } as any);

          await tx.update(parties)
            .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() } as any)
            .where(eq(parties.id, bestParty!.id));
        });
      } catch (error: any) {
        return res.status(400).json({ error: error.message || 'Failed to auto-join party' });
      }

      const updatedParty = await partyService.getParty(bestParty.id);
      broadcastToAllPlayers({ type: 'public_parties_updated' });
      console.log(`[PartyTrack] AUTO_JOIN player=${player.id} username=${player.username} party=${bestParty.id} partyType=social result=ok`);
      res.json({ success: true, party: updatedParty });
    } catch (error) {
      console.error(`[PartyTrack] AUTO_JOIN partyType=social result=error`, error);
      res.status(500).json({ error: 'Failed to auto-join party' });
    }
  });

  // Get player's current party (with version-based polling)
  app.get('/api/parties/current', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const sinceVersion = req.query.sinceVersion ? parseInt(req.query.sinceVersion as string) : undefined;

      const party = await partyService.getPlayerParty(player.id, 'social');

      if (!party || party.status === 'disbanded' || !party.members || party.members.length === 0) {
        return res.json({ success: true, party: null, partyVersion: 0 });
      }

      if (sinceVersion !== undefined && party.partyVersion <= sinceVersion) {
        return res.json({ success: true, changed: false, partyVersion: party.partyVersion });
      }

      res.json({ success: true, party, partyVersion: party.partyVersion, changed: true });
    } catch (error) {
      console.error('Error getting current party:', error);
      res.status(500).json({ error: 'Failed to get current party' });
    }
  });

  app.get('/api/parties/my/snapshot', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Authentication required' });

      const party = await partyService.getPlayerParty(player.id, 'social');
      if (!party) {
        return res.json({ success: true, party: null, members: [], invites: [], version: 0 });
      }

      const sentInvites = await partyService.getPartySentInvites(party.id);

      res.json({
        success: true,
        party: {
          id: party.id,
          leaderId: party.leaderId,
          name: party.name,
          description: party.description,
          status: party.status,
          partyType: (party as any).partyType || 'social',
          maxSize: party.maxSize,
          isPublic: party.isPublic,
          regionId: party.regionId,
          dungeonId: party.dungeonId,
          dungeonRunId: party.dungeonRunId,
        },
        members: (party.members || []).map(m => ({
          playerId: m.playerId,
          role: m.role,
          position: m.position,
          isReady: m.isReady,
          username: (m as any).username || m.player?.username || 'Unknown',
          avatar: (m as any).avatar || m.player?.avatar || null,
          totalLevel: (m as any).totalLevel || m.player?.totalLevel || 0,
          isOnline: (m as any).isOnline || 0,
        })),
        invites: (sentInvites || []).map(inv => ({
          id: inv.id,
          inviteeId: inv.inviteeId,
          inviteeName: inv.invitee?.username || 'Unknown',
          status: inv.status,
          expiresAt: inv.expiresAt,
        })),
        version: party.partyVersion || 0,
      });
    } catch (error) {
      console.error('Error getting party snapshot:', error);
      res.status(500).json({ error: 'Failed to get party snapshot' });
    }
  });

  app.get('/api/parties/:id/snapshot', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) return res.status(401).json({ error: 'Authentication required' });

      const { id } = req.params;
      const party = await partyService.getParty(id);
      if (!party) {
        return res.json({ success: true, party: null, members: [], invites: [], version: 0 });
      }

      const isMember = (party.members || []).some(m => m.playerId === player.id);
      const sentInvites = isMember ? await partyService.getPartySentInvites(id) : [];

      res.json({
        success: true,
        party: {
          id: party.id,
          leaderId: party.leaderId,
          name: party.name,
          description: party.description,
          status: party.status,
          partyType: (party as any).partyType || 'social',
          maxSize: party.maxSize,
          isPublic: party.isPublic,
          regionId: party.regionId,
          dungeonId: party.dungeonId,
          dungeonRunId: party.dungeonRunId,
        },
        members: (party.members || []).map(m => ({
          playerId: m.playerId,
          role: m.role,
          position: m.position,
          isReady: m.isReady,
          username: (m as any).username || m.player?.username || 'Unknown',
          avatar: (m as any).avatar || m.player?.avatar || null,
          totalLevel: (m as any).totalLevel || m.player?.totalLevel || 0,
          isOnline: (m as any).isOnline || 0,
        })),
        invites: (sentInvites || []).map(inv => ({
          id: inv.id,
          inviteeId: inv.inviteeId,
          inviteeName: inv.invitee?.username || 'Unknown',
          status: inv.status,
          expiresAt: inv.expiresAt,
        })),
        version: party.partyVersion || 0,
      });
    } catch (error) {
      console.error('Error getting party snapshot:', error);
      res.status(500).json({ error: 'Failed to get party snapshot' });
    }
  });

  // Get party details
  app.get('/api/parties/:id', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const party = await partyService.getParty(id);

      if (!party) {
        return res.status(404).json({ error: 'Party not found' });
      }

      res.json({ success: true, party });
    } catch (error) {
      console.error('Error getting party:', error);
      res.status(500).json({ error: 'Failed to get party' });
    }
  });

  // Invite a player to party
  app.post('/api/parties/:id/invite', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const { inviteeId } = req.body;

      if (!inviteeId) {
        return res.status(400).json({ error: 'inviteeId is required' });
      }

      const partyCheck = await partyService.getParty(id);
      if (partyCheck && partyCheck.status === 'locked') {
        return res.status(400).json({ error: "Cannot perform this action while dungeon is starting" });
      }
      if (partyCheck && partyCheck.status !== 'forming') {
        return res.status(400).json({ error: 'Party is no longer accepting members' });
      }

      const result = await partyService.invitePlayer(id, player.id, inviteeId);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, invite: result.invite });
    } catch (error) {
      console.error('Error inviting player:', error);
      res.status(500).json({ error: 'Failed to invite player' });
    }
  });

  // Get pending invites sent by this party
  app.get('/api/parties/:id/invites', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const party = await partyService.getParty(id);

      if (!party) {
        return res.status(404).json({ error: 'Party not found' });
      }

      const isMember = party.members.some(m => m.playerId === player.id);
      if (!isMember) {
        return res.status(403).json({ error: 'You are not a member of this party' });
      }

      const invites = await partyService.getPartySentInvites(id);
      res.json({ success: true, invites });
    } catch (error) {
      console.error('Error getting party invites:', error);
      res.status(500).json({ error: 'Failed to get party invites' });
    }
  });

  // Cancel a pending party invite
  app.delete('/api/parties/:id/invites/:inviteId', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id, inviteId } = req.params;
      const result = await partyService.cancelPartyInvite(inviteId, id, player.id);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error cancelling party invite:', error);
      res.status(500).json({ error: 'Failed to cancel invite' });
    }
  });

  // Kick a member from party
  app.post('/api/parties/:id/kick/:playerId', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id, playerId } = req.params;
      const result = await partyService.kickMember(id, player.id, playerId);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      broadcastToAllPlayers({ type: 'public_parties_updated' });
      res.json({ success: true });
    } catch (error) {
      console.error('Error kicking member:', error);
      res.status(500).json({ error: 'Failed to kick member' });
    }
  });

  // Leave party
  app.post('/api/parties/:id/leave', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const leavePartyCheck = await partyService.getParty(id);
      if (leavePartyCheck && leavePartyCheck.status === 'locked') {
        return res.status(400).json({ error: "Cannot perform this action while dungeon is starting" });
      }

      const wasDungeonParty = leavePartyCheck?.partyType === 'dungeon';
      const wasInDungeon = leavePartyCheck?.status === 'in_dungeon';
      const dungeonRunId = leavePartyCheck?.dungeonRunId;

      const result = await partyService.leaveParty(player.id, id);

      if (!result.success) {
        await db.delete(partyMembers).where(
          and(eq(partyMembers.playerId, player.id), eq(partyMembers.partyId, id))
        );

        try {
          const remainingResult = await db.execute(sql`SELECT COUNT(*) as count FROM party_members WHERE party_id = ${id}`);
          const remainingCount = parseInt(((remainingResult as any).rows?.[0] ?? (remainingResult as any)[0])?.count as string) || 0;

          if (remainingCount === 0) {
            await db.delete(partyInvites).where(eq(partyInvites.partyId, id));
            await db.update(parties)
              .set({ status: 'disbanded', partyVersion: sql`party_version + 1`, updatedAt: new Date() } as any)
              .where(eq(parties.id, id));

            const [latestParty] = await db.select().from(parties).where(eq(parties.id, id)).limit(1);
            const version = latestParty?.partyVersion || 0;
            broadcastToParty(id, createPartyEvent('party_disbanded', id, version, { reason: 'empty_party' }));
            broadcastToAllPlayers({ type: 'public_parties_updated' });
          } else {
            await db.update(parties)
              .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() } as any)
              .where(eq(parties.id, id));

            const [latestParty] = await db.select().from(parties).where(eq(parties.id, id)).limit(1);
            const version = latestParty?.partyVersion || 0;
            broadcastToParty(id, createPartyEvent('party_member_left', id, version, { playerId: player.id }));
            broadcastToAllPlayers({ type: 'public_parties_updated' });
          }
          sendToPlayer(player.id, createPartyEvent('party_member_left', id, 0, { playerId: player.id }));
        } catch (cleanupErr) {
          console.error('[LeaveParty Fallback] Cleanup error:', cleanupErr);
        }

        return res.json({ success: true });
      }

      if (wasDungeonParty && wasInDungeon && dungeonRunId) {
        try {
          const { partyDungeonService } = await import('./services/partyDungeonService');
          await (partyDungeonService as any).handleMemberLeave?.(dungeonRunId, player.id);
        } catch (e) {
          console.warn('Failed to handle dungeon member leave:', e);
        }
      }

      broadcastToAllPlayers({ type: 'public_parties_updated' });
      res.json({ success: true });
    } catch (error) {
      console.error('Error leaving party:', error);
      res.status(500).json({ error: 'Failed to leave party' });
    }
  });

  // Heartbeat - mark member as active (uses partyMembers.lastSyncAt)
  // Also accepts currentSkill for skill synergy bonus tracking
  app.post('/api/parties/:id/heartbeat', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id: partyId } = req.params;
      const { currentSkill, currentRegion } = req.body || {};
      
      const updateData: { lastSyncAt: Date; currentSkill?: string | null; currentRegion?: string | null } = { 
        lastSyncAt: new Date() 
      };
      if (currentSkill !== undefined) {
        updateData.currentSkill = currentSkill;
      }
      if (currentRegion !== undefined) {
        updateData.currentRegion = currentRegion;
      }
      
      await db.update(partyMembers)
        .set(updateData as any)
        .where(
          and(
            eq(partyMembers.partyId, partyId),
            eq(partyMembers.playerId, player.id)
          )
        );

      if (currentSkill !== undefined) {
        broadcastToParty(partyId, createPartyEvent('party_member_activity', partyId, 0, { playerId: player.id, currentSkill }));
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error processing heartbeat:', error);
      res.status(500).json({ error: 'Failed to process heartbeat' });
    }
  });

  // Get party skill synergies - returns members' current skills for synergy bonus calculation
  app.get('/api/parties/:id/skill-synergies', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id: partyId } = req.params;
      
      const members = await db.select({
        playerId: partyMembers.playerId,
        playerName: players.username,
        currentSkill: partyMembers.currentSkill,
        currentRegion: partyMembers.currentRegion,
        lastSyncAt: partyMembers.lastSyncAt,
      })
        .from(partyMembers)
        .innerJoin(players, eq(partyMembers.playerId, players.id))
        .where(eq(partyMembers.partyId, partyId));
      
      const thirtySecondsAgo = new Date(Date.now() - 30000);
      const activeMembers = members.filter(m => 
        m.lastSyncAt && new Date(m.lastSyncAt) > thirtySecondsAgo
      );

      res.json({ 
        members: activeMembers.map(m => ({
          playerId: m.playerId,
          playerName: m.playerName,
          currentSkill: m.currentSkill,
          currentRegion: m.currentRegion,
        }))
      });
    } catch (error) {
      console.error('Error getting skill synergies:', error);
      res.status(500).json({ error: 'Failed to get skill synergies' });
    }
  });

  // Nudge inactive party member (send push notification)
  app.post('/api/parties/:id/nudge/:playerId', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const leader = req.player;
      if (!leader) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id: partyId, playerId: targetPlayerId } = req.params;
      
      // Verify requester is party leader
      const [party] = await db.select()
        .from(parties)
        .where(eq(parties.id, partyId))
        .limit(1);
      
      if (!party) {
        return res.status(404).json({ error: 'Party not found' });
      }
      
      if (party.leaderId !== leader.id) {
        return res.status(403).json({ error: 'Only the party leader can nudge members' });
      }
      
      // Check target is a party member
      const [membership] = await db.select()
        .from(partyMembers)
        .where(
          and(
            eq(partyMembers.partyId, partyId),
            eq(partyMembers.playerId, targetPlayerId)
          )
        )
        .limit(1);
      
      if (!membership) {
        return res.status(404).json({ error: 'Player is not in this party' });
      }
      
      // Send push notification
      const { notifyPartyNudge } = await import('./utils/push');
      await notifyPartyNudge(targetPlayerId, leader.username, party.name || 'Party');
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error nudging party member:', error);
      res.status(500).json({ error: 'Failed to nudge party member' });
    }
  });

  // Disband party
  app.post('/api/parties/:id/disband', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      
      const result = await partyService.disbandParty(id, player.id);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      broadcastToAllPlayers({ type: 'public_parties_updated' });
      res.json({ success: true });
    } catch (error) {
      console.error('Error disbanding party:', error);
      res.status(500).json({ error: 'Failed to disband party' });
    }
  });

  // Set member role
  app.patch('/api/parties/:id/role', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const { role } = req.body;

      if (!role) {
        return res.status(400).json({ error: 'role is required' });
      }

      const partyCheck = await partyService.getParty(id);
      if (!partyCheck) {
        return res.status(404).json({ error: 'Party not found' });
      }
      if (partyCheck.status !== 'forming') {
        return res.status(400).json({ error: 'Party is no longer accepting changes' });
      }

      const result = await partyService.setMemberRole(id, player.id, role);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error setting member role:', error);
      res.status(500).json({ error: 'Failed to set member role' });
    }
  });

  // Toggle ready status
  app.patch('/api/parties/:id/ready', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const { isReady } = req.body;

      const partyCheck = await partyService.getParty(id);
      if (!partyCheck) {
        return res.status(404).json({ error: 'Party not found' });
      }
      if (partyCheck.status === 'locked') {
        return res.status(400).json({ error: "Cannot perform this action while dungeon is starting" });
      }
      if (partyCheck.status !== 'forming') {
        return res.status(400).json({ error: 'Party is no longer accepting changes' });
      }

      const result = await partyService.setMemberReady(id, player.id, isReady ?? true);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error setting ready status:', error);
      res.status(500).json({ error: 'Failed to set ready status' });
    }
  });

  // Set target dungeon
  app.patch('/api/parties/:id/dungeon', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const { dungeonId } = req.body;

      if (!dungeonId) {
        return res.status(400).json({ error: 'dungeonId is required' });
      }

      const result = await partyService.setPartyDungeon(id, dungeonId);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error setting target dungeon:', error);
      res.status(500).json({ error: 'Failed to set target dungeon' });
    }
  });

  // Get party synergies
  app.get('/api/parties/:id/synergies', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const language = (req.query.lang as string) || 'en';
      
      const party = await partyService.getParty(id);
      if (!party) {
        return res.status(404).json({ error: 'Party not found' });
      }

      const partyMembers = party.members.map(m => ({
        role: m.role,
        guildId: (m.player as any).guildId,
      }));

      const synergies = await synergyService.calculatePartySynergies(partyMembers);
      const bonuses = await synergyService.calculateSynergyBonuses(partyMembers);

      res.json({ success: true, synergies, bonuses });
    } catch (error) {
      console.error('Error getting party synergies:', error);
      res.status(500).json({ error: 'Failed to get party synergies' });
    }
  });

  // Toggle public party status (leader only)
  app.post('/api/parties/:id/toggle-public', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const party = await partyService.getParty(id);

      if (!party) {
        return res.status(404).json({ error: 'Party not found' });
      }

      if (party.leaderId !== player.id) {
        return res.status(403).json({ error: 'Only the party leader can toggle public status' });
      }

      const newIsPublic = party.isPublic === 1 ? 0 : 1;
      const regionId = newIsPublic === 1 ? player.currentRegion : null;

      await db.update(parties)
        .set({
          isPublic: newIsPublic,
          regionId: regionId,
          updatedAt: new Date(),
        } as any)
        .where(eq(parties.id, id));

      const updatedParty = await partyService.getParty(id);
      res.json({ success: true, party: updatedParty });
    } catch (error) {
      console.error('Error toggling public party:', error);
      res.status(500).json({ error: 'Failed to toggle public status' });
    }
  });

  // Join a public party directly
  app.post('/api/parties/:id/join', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (player.isGuest === 1) {
        return res.status(403).json({ error: 'Guest accounts cannot join parties. Please register!' });
      }

      const { id } = req.params;
      const party = await partyService.getParty(id);

      if (!party) {
        return res.status(404).json({ error: 'Party not found' });
      }

      if (party.status === 'locked') {
        return res.status(400).json({ error: "Cannot perform this action while dungeon is starting" });
      }

      if (party.isPublic !== 1) {
        return res.status(400).json({ error: 'This party is not public' });
      }

      if (party.status !== 'forming') {
        return res.status(400).json({ error: 'Party is not accepting new members' });
      }

      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT id FROM parties WHERE id = ${id} FOR UPDATE`);

          const memberCountResult = await tx.execute(sql`SELECT COUNT(*) as count FROM party_members WHERE party_id = ${id}`);
          const currentCount = parseInt(((memberCountResult as any).rows?.[0] ?? (memberCountResult as any)[0])?.count as string) || 0;
          if (currentCount >= party.maxSize) throw new Error('Party is full');

          const existingResult = await tx.execute(sql`SELECT pm.id FROM party_members pm INNER JOIN parties p ON pm.party_id = p.id WHERE pm.player_id = ${player.id} AND p.status != 'disbanded' LIMIT 1`);
          if (((existingResult as any).rows || existingResult).length > 0) throw new Error('You are already in a party');

          const nextPosition = currentCount + 1;
          await tx.insert(partyMembers)
            .values({
              partyId: id,
              playerId: player.id,
              role: 'dps',
              position: nextPosition,
              isReady: 0,
            } as any);

          await tx.update(parties)
            .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() } as any)
            .where(eq(parties.id, id));
        });
      } catch (error: any) {
        return res.status(400).json({ error: error.message || 'Failed to join party' });
      }

      const updatedParty = await partyService.getParty(id);
      broadcastToAllPlayers({ type: 'public_parties_updated' });
      console.log(`[PartyTrack] JOIN_PUBLIC player=${player.id} username=${player.username} party=${id} partyType=${party.partyType || 'social'} result=ok`);
      res.json({ success: true, party: updatedParty });
    } catch (error) {
      console.error(`[PartyTrack] JOIN_PUBLIC party=${req.params.id} partyType=social result=error`, error);
      res.status(500).json({ error: 'Failed to join party' });
    }
  });

  // POST /api/parties/:id/sync - Sync combat state (client calls every 5 sec during combat)
  app.post('/api/parties/:id/sync', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const partyId = req.params.id;
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const playerId = player.id;
      const { currentRegion, currentMonsterId, isInCombat, weaponType } = req.body;

      // Verify player is in this party
      const [membership] = await db.select()
        .from(partyMembers)
        .where(and(
          eq(partyMembers.partyId, partyId),
          eq(partyMembers.playerId, playerId)
        ));

      if (!membership) {
        return res.status(403).json({ message: 'Not a member of this party' });
      }

      // Update player's combat sync state
      await db.update(partyMembers)
        .set({
          currentRegion,
          currentMonsterId,
          isInCombat: isInCombat ? 1 : 0,
          lastSyncAt: new Date(),
          cachedWeaponType: weaponType || null
        } as any)
        .where(eq(partyMembers.id, membership.id));

      broadcastToParty(partyId, createPartyEvent('party_member_activity', partyId, 0, { playerId: player.id, isInCombat, currentMonsterId, currentRegion }));
      res.json({ success: true });
    } catch (error) {
      console.error('Error syncing party combat state:', error);
      res.status(500).json({ message: 'Failed to sync combat state' });
    }
  });

  // GET /api/parties/:id/members-status - Get all party members' combat status
  app.get('/api/parties/:id/members-status', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const partyId = req.params.id;
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const playerId = player.id;

      // Verify player is in this party
      const [membership] = await db.select()
        .from(partyMembers)
        .where(and(
          eq(partyMembers.partyId, partyId),
          eq(partyMembers.playerId, playerId)
        ));

      if (!membership) {
        return res.status(403).json({ message: 'Not a member of this party' });
      }

      // Get all party members with their combat status and skill info
      const members = await db.select({
        id: partyMembers.id,
        playerId: partyMembers.playerId,
        role: partyMembers.role,
        currentRegion: partyMembers.currentRegion,
        currentMonsterId: partyMembers.currentMonsterId,
        isInCombat: partyMembers.isInCombat,
        lastSyncAt: partyMembers.lastSyncAt,
        playerName: players.username,
        lastSkillName: partyMembers.lastSkillName,
        lastSkillDamage: partyMembers.lastSkillDamage,
        lastSkillChance: partyMembers.lastSkillChance,
        lastSkillTime: partyMembers.lastSkillTime,
        cachedWeaponType: partyMembers.cachedWeaponType,
        currentSkill: partyMembers.currentSkill,
        offlineKillCount: partyMembers.offlineKillCount,
        offlineKillMonsterId: partyMembers.offlineKillMonsterId,
        playerSkills: players.skills,
        playerEquipment: players.equipment,
        playerItemModifications: players.itemModifications,
      })
      .from(partyMembers)
      .leftJoin(players, eq(players.id, partyMembers.playerId))
      .where(eq(partyMembers.partyId, partyId));

      const membersWithStats = members.map(m => {
        const skills = m.playerSkills as Record<string, { level: number; xp: number }> | null;
        const strengthLevel = skills?.strength?.level || 1;
        const equipment = (m.playerEquipment as Record<string, string | null>) || {};
        const itemMods = (m.playerItemModifications as Record<string, any>) || {};
        const enhancementLevels = new Map<string, number>();
        for (const [slot, mod] of Object.entries(itemMods)) {
          if (mod?.enhancementLevel) {
            enhancementLevels.set(slot, mod.enhancementLevel);
          }
        }
        const equipBonuses = getEquipmentBonusesFromCache(equipment, enhancementLevels, itemMods);
        const strengthBonus = equipBonuses.strengthBonus || 0;
        const { playerSkills, playerEquipment, playerItemModifications, ...rest } = m;
        return {
          ...rest,
          memberMinHit: calculateMinHit(strengthLevel, strengthBonus),
          memberMaxHit: calculateMaxHit(strengthLevel, strengthBonus),
        };
      });

      res.json({ members: membersWithStats });
    } catch (error) {
      console.error('Error fetching party members status:', error);
      res.status(500).json({ message: 'Failed to fetch members status' });
    }
  });

  // GET /api/parties/:id/passive-buffs - Get party passive buffs based on weapon types
  app.get('/api/parties/:id/passive-buffs', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const partyId = req.params.id;
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const playerId = player.id;

      // Verify player is in this party
      const [membership] = await db.select()
        .from(partyMembers)
        .where(and(
          eq(partyMembers.partyId, partyId),
          eq(partyMembers.playerId, playerId)
        ));

      if (!membership) {
        return res.status(403).json({ message: 'Not a member of this party' });
      }

      // Get all party members' weapon types
      const members = await db.select({
        cachedWeaponType: partyMembers.cachedWeaponType,
      })
      .from(partyMembers)
      .where(eq(partyMembers.partyId, partyId));

      const weaponTypes = members.map(m => m.cachedWeaponType);
      const buffs = calculatePartyPassiveBuffs(weaponTypes);

      res.json({ buffs });
    } catch (error) {
      console.error('Error fetching party passive buffs:', error);
      res.status(500).json({ message: 'Failed to fetch passive buffs' });
    }
  });

  // POST /api/parties/:id/skill-share - Share a skill trigger with party
  app.post('/api/parties/:id/skill-share', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const partyId = req.params.id;
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const playerId = player.id;
      const { skillName, skillDamage, skillEffect, skillChance, targetMonsterId, targetRegion } = req.body;

      // Verify player is in this party
      const [membership] = await db.select()
        .from(partyMembers)
        .leftJoin(players, eq(players.id, partyMembers.playerId))
        .where(and(
          eq(partyMembers.partyId, partyId),
          eq(partyMembers.playerId, playerId)
        ));

      if (!membership) {
        return res.status(403).json({ message: 'Not a member of this party' });
      }

      const playerName = membership.players?.username || 'Unknown';

      // Save skill info to DB so other party members can see it when polling
      await db.update(partyMembers)
        .set({
          lastSkillName: skillName,
          lastSkillDamage: skillDamage || 0,
          lastSkillChance: skillChance || 25,
          lastSkillTime: new Date()
        } as any)
        .where(and(
          eq(partyMembers.partyId, partyId),
          eq(partyMembers.playerId, playerId)
        ));

      // Get all party members except sender
      const otherMembers = await db.select({
        playerId: partyMembers.playerId,
        currentMonsterId: partyMembers.currentMonsterId,
        currentRegion: partyMembers.currentRegion,
        isInCombat: partyMembers.isInCombat,
      })
      .from(partyMembers)
      .where(and(
        eq(partyMembers.partyId, partyId),
        not(eq(partyMembers.playerId, playerId))
      ));

      // Create skill share event for each party member who is in combat
      const skillEvent = {
        fromPlayerId: playerId,
        fromPlayerName: playerName,
        skillName,
        skillDamage,
        skillEffect,
        targetMonsterId,
        targetRegion,
        timestamp: Date.now()
      };

      res.json({ 
        success: true, 
        skillEvent,
        recipients: otherMembers.filter(m => m.isInCombat === 1).length 
      });
    } catch (error) {
      console.error('Error sharing skill:', error);
      res.status(500).json({ message: 'Failed to share skill' });
    }
  });

  // GET /api/parties/:id/events - Poll for party events (skills, loot shared TO this player)
  app.get('/api/parties/:id/events', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const partyId = req.params.id;
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!partyId || !uuidRegex.test(partyId)) {
        console.warn(`[PartyEvents] Invalid party ID "${partyId}" from player ${player.id}`);
        return res.status(400).json({ error: 'Invalid party ID' });
      }

      const playerId = player.id;
      const since = parseInt(req.query.since as string) || Date.now() - 5000;

      const [membership] = await db.select()
        .from(partyMembers)
        .where(and(
          eq(partyMembers.partyId, partyId),
          eq(partyMembers.playerId, playerId)
        ));

      if (!membership) {
        return res.status(403).json({ message: 'Not a member of this party' });
      }

      // Fetch all party members' skill events (excluding current player)
      const allMembers = await db.select({
        playerId: partyMembers.playerId,
        playerName: players.username,
        lastSkillName: partyMembers.lastSkillName,
        lastSkillDamage: partyMembers.lastSkillDamage,
        lastSkillChance: partyMembers.lastSkillChance,
        lastSkillTime: partyMembers.lastSkillTime,
        cachedWeaponType: partyMembers.cachedWeaponType,
      })
        .from(partyMembers)
        .innerJoin(players, eq(partyMembers.playerId, players.id))
        .where(eq(partyMembers.partyId, partyId));

      // Filter for skill events from OTHER party members that happened since the `since` timestamp
      const skillEvents = allMembers
        .filter(m => 
          m.playerId !== playerId && 
          m.lastSkillName && 
          m.lastSkillTime && 
          new Date(m.lastSkillTime).getTime() > since
        )
        .map(m => ({
          id: `${m.playerId}-${m.lastSkillTime ? new Date(m.lastSkillTime).getTime() : Date.now()}`,
          playerName: m.playerName,
          skillName: m.lastSkillName,
          damage: m.lastSkillDamage || 0,
          chance: m.lastSkillChance || 0,
          weaponType: m.cachedWeaponType || 'unknown',
          timestamp: m.lastSkillTime ? new Date(m.lastSkillTime).getTime() : Date.now()
        }));

      // Fetch loot notifications for this player from party members
      const lootNotifs = await db.select()
        .from(notifications)
        .where(and(
          eq(notifications.playerId, playerId),
          eq(notifications.type, 'PARTY_LOOT_SHARED'),
          gt(notifications.createdAt, new Date(since))
        ))
        .orderBy(notifications.createdAt)
        .limit(10);

      // Parse notification payloads and format for client
      const lootNotifications = lootNotifs.map(n => {
        try {
          const payload = typeof n.payload === 'string' ? JSON.parse(n.payload) : n.payload;
          return {
            id: n.id.toString(),
            fromPlayerName: payload.fromPlayerName || 'Unknown',
            itemName: payload.itemName || 'Unknown Item',
            itemId: payload.itemId || null,
            itemRarity: payload.itemRarity || 'Common',
            timestamp: new Date(n.createdAt!).getTime()
          };
        } catch {
          return null;
        }
      }).filter(Boolean);

      // Delete processed notifications to prevent duplicates
      if (lootNotifs.length > 0) {
        await db.delete(notifications)
          .where(and(
            eq(notifications.playerId, playerId),
            eq(notifications.type, 'PARTY_LOOT_SHARED'),
            gt(notifications.createdAt, new Date(since))
          ));
      }

      const newPartyLoot: Array<{ itemId: string; itemName: string; quantity: number }> = [];

      res.json({ 
        skillEvents,
        lootNotifications,
        newPartyLoot,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error fetching party events:', error);
      res.status(500).json({ message: 'Failed to fetch events' });
    }
  });

  // ==========================================
  // PARTY INVITE ENDPOINTS
  // ==========================================

  // Get pending invites
  app.get('/api/party-invites', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const invites = await partyService.getPendingInvites(player.id);

      res.json({ success: true, invites });
    } catch (error) {
      console.error('Error getting pending invites:', error);
      res.status(500).json({ error: 'Failed to get pending invites' });
    }
  });

  // Accept invite
  app.post('/api/party-invites/:id/accept', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Guest accounts cannot join parties
      if (player.isGuest === 1) {
        return res.status(403).json({ error: 'Guest accounts cannot join parties. Register your account!' });
      }

      const { id: inviteId } = req.params;
      const forceLeave = req.body?.forceLeave === true;
      const result = await partyService.acceptInvite(inviteId, player.id, forceLeave);

      if (!result.success) {
        return res.status(400).json({ error: result.error, errorCode: result.errorCode, currentPartyType: result.currentPartyType });
      }

      broadcastToAllPlayers({ type: 'public_parties_updated' });
      res.json({ success: true, party: result.party });
    } catch (error) {
      console.error('Error accepting invite:', error);
      res.status(500).json({ error: 'Failed to accept invite' });
    }
  });

  // Decline invite
  app.post('/api/party-invites/:id/decline', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const result = await partyService.declineInvite(id, player.id);

      if (!result.success) {
        console.log(`[PartyTrack] DECLINE_INVITE player=${player.id} username=${player.username} partyType=social result=error reason=${result.error}`);
        return res.status(400).json({ error: result.error });
      }

      console.log(`[PartyTrack] DECLINE_INVITE player=${player.id} username=${player.username} partyType=social result=ok`);
      res.json({ success: true });
    } catch (error) {
      console.error(`[PartyTrack] DECLINE_INVITE partyType=social result=error`, error);
      res.status(500).json({ error: 'Failed to decline invite' });
    }
  });

  // ==========================================
  // PARTY FINDER ENDPOINTS
  // ==========================================

  // List party finder entries
  app.get('/api/party-finder', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { dungeonId, minLevel, guildId } = req.query;
      
      const listings = await partyFinderService.listPartyFinder({
        dungeonId: dungeonId as string,
        minLevel: minLevel ? parseInt(minLevel as string, 10) : undefined,
        guildId: guildId as string || player.guildId,
      });

      res.json({ success: true, listings });
    } catch (error) {
      console.error('Error listing party finder:', error);
      res.status(500).json({ error: 'Failed to list party finder entries' });
    }
  });

  // Create party finder listing
  app.post('/api/party-finder', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { partyId, dungeonId, requiredRoles, minLevel, description, guildOnly } = req.body;

      if (!partyId || !dungeonId) {
        return res.status(400).json({ error: 'partyId and dungeonId are required' });
      }

      const result = await partyFinderService.createListing(partyId, dungeonId, {
        requiredRoles,
        minLevel,
        description,
        guildOnly,
        guildId: player.guildId,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.status(201).json({ success: true, listing: result.listing });
    } catch (error) {
      console.error('Error creating party finder listing:', error);
      res.status(500).json({ error: 'Failed to create party finder listing' });
    }
  });

  // Remove party finder listing
  app.delete('/api/party-finder/:id', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const result = await partyFinderService.removeListing(id, player.id);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error removing party finder listing:', error);
      res.status(500).json({ error: 'Failed to remove party finder listing' });
    }
  });

  // Search party finder with filters
  app.get('/api/party-finder/search', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { dungeonId, roleNeeded, minLevel, guildId } = req.query;

      const listings = await partyFinderService.searchListings({
        dungeonId: dungeonId as string,
        roleNeeded: roleNeeded as string,
        minLevel: minLevel ? parseInt(minLevel as string, 10) : undefined,
        guildId: guildId as string || player.guildId,
      });

      res.json({ success: true, listings });
    } catch (error) {
      console.error('Error searching party finder:', error);
      res.status(500).json({ error: 'Failed to search party finder' });
    }
  });

  // ==========================================
  // SYNERGY ENDPOINTS
  // ==========================================

  // Get all synergies
  app.get('/api/party-synergies', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player;
      if (!player) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const language = (req.query.lang as string) || 'en';
      const synergies = await synergyService.getSynergies(language);

      res.json({ success: true, synergies });
    } catch (error) {
      console.error('Error getting synergies:', error);
      res.status(500).json({ error: 'Failed to get synergies' });
    }
  });

  // ==================== SEED DATA SYNC TO PRODUCTION ====================
  // Sync all seed/config tables from development DB to production DB
  // Works in both environments:
  // - Development: reads from local db, writes to PRODUCTION_DATABASE_URL
  // - Production: reads from DEVELOPMENT_DATABASE_URL, writes to local db
  app.post('/api/admin/sync-to-production', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const isDev = process.env.NODE_ENV === 'development';
      const { drizzle } = await import('drizzle-orm/node-postgres');
      const pg = await import('pg');
      const Pool = pg.default.Pool;
      const schema = await import('@shared/schema');

      let sourceDb: any;
      let targetDb: any;
      let externalPool: any;

      if (isDev) {
        const PRODUCTION_DATABASE_URL = process.env.PRODUCTION_DATABASE_URL;
        if (!PRODUCTION_DATABASE_URL) {
          return res.status(400).json({ 
            error: 'PRODUCTION_DATABASE_URL is not configured',
            message: 'Please set PRODUCTION_DATABASE_URL secret with the production database connection string'
          });
        }
        externalPool = new Pool({ connectionString: PRODUCTION_DATABASE_URL });
        sourceDb = db;
        targetDb = drizzle(externalPool, { schema });
      } else {
        const DEVELOPMENT_DATABASE_URL = process.env.DEVELOPMENT_DATABASE_URL || process.env.DATABASE_URL_DEVELOPMENT;
        if (!DEVELOPMENT_DATABASE_URL) {
          return res.status(400).json({ 
            error: 'DEVELOPMENT_DATABASE_URL is not configured',
            message: 'Please set DEVELOPMENT_DATABASE_URL secret with the development database connection string'
          });
        }
        externalPool = new Pool({ connectionString: DEVELOPMENT_DATABASE_URL });
        sourceDb = drizzle(externalPool, { schema });
        targetDb = db;
      }

      console.log(`[Admin Sync] Starting seed data sync to production (running in ${isDev ? 'development' : 'production'} mode)...`);

      const syncResults: { table: string; count: number; status: string }[] = [];

      const syncTable = async (tableName: string, sourceData: any[], table: any) => {
        try {
          await targetDb.delete(table);
          if (sourceData.length > 0) {
            const batchSize = 100;
            for (let i = 0; i < sourceData.length; i += batchSize) {
              const batch = sourceData.slice(i, i + batchSize);
              await targetDb.insert(table).values(batch);
            }
          }
          syncResults.push({ table: tableName, count: sourceData.length, status: 'success' });
          console.log(`[Admin Sync] Synced ${tableName}: ${sourceData.length} records`);
        } catch (err: any) {
          syncResults.push({ table: tableName, count: 0, status: `error: ${err.message}` });
          console.error(`[Admin Sync] Error syncing ${tableName}:`, err.message);
        }
      };

      const badgesData = await sourceDb.select().from(schema.badges);
      await syncTable('badges', badgesData, schema.badges);

      const itemsData = await sourceDb.select().from(schema.gameItems);
      await syncTable('game_items', itemsData, schema.gameItems);

      const setsData = await sourceDb.select().from(schema.equipmentSets);
      await syncTable('equipment_sets', setsData, schema.equipmentSets);

      const regionsData = await sourceDb.select().from(schema.gameCombatRegions);
      await syncTable('game_combat_regions', regionsData, schema.gameCombatRegions);

      const monstersData = await sourceDb.select().from(schema.gameMonsters);
      await syncTable('game_monsters', monstersData, schema.gameMonsters);

      const recipesData = await sourceDb.select().from(schema.gameRecipes);
      await syncTable('game_recipes', recipesData, schema.gameRecipes);

      const actionsData = await sourceDb.select().from(schema.gameSkillActions);
      await syncTable('game_skill_actions', actionsData, schema.gameSkillActions);

      const raidBossesData = await sourceDb.select().from(schema.raidBosses);
      await syncTable('raid_bosses', raidBossesData, schema.raidBosses);

      const raidShopData = await sourceDb.select().from(schema.raidShopItems);
      await syncTable('raid_shop_items', raidShopData, schema.raidShopItems);

      const dungeonsData = await sourceDb.select().from(schema.dungeons);
      await syncTable('dungeons', dungeonsData, schema.dungeons);

      const floorTemplatesData = await sourceDb.select().from(schema.dungeonFloorTemplates);
      await syncTable('dungeon_floor_templates', floorTemplatesData, schema.dungeonFloorTemplates);

      const modifiersData = await sourceDb.select().from(schema.dungeonModifiers);
      await syncTable('dungeon_modifiers', modifiersData, schema.dungeonModifiers);

      const lootTablesData = await sourceDb.select().from(schema.dungeonLootTables);
      await syncTable('dungeon_loot_tables', lootTablesData, schema.dungeonLootTables);

      const keyConfigData = await sourceDb.select().from(schema.dungeonKeyConfig);
      await syncTable('dungeon_key_config', keyConfigData, schema.dungeonKeyConfig);

      const synergiesData = await sourceDb.select().from(schema.partySynergies);
      await syncTable('party_synergies', synergiesData, schema.partySynergies);

      const lootConfigData = await sourceDb.select().from(schema.partyLootConfig);
      await syncTable('party_loot_config', lootConfigData, schema.partyLootConfig);

      const successCount = syncResults.filter(r => r.status === 'success').length;
      const errorCount = syncResults.filter(r => r.status !== 'success').length;
      const totalRecords = syncResults.reduce((sum, r) => sum + r.count, 0);

      console.log(`[Admin Sync] Completed: ${successCount} tables synced, ${errorCount} errors, ${totalRecords} total records`);

      bumpGameDataVersion();
      broadcastGameUpdate('all');

      await externalPool.end();

      res.json({
        success: true,
        message: `Synced ${successCount} tables with ${totalRecords} total records to production`,
        details: syncResults
      });
    } catch (error: any) {
      console.error('[Admin Sync] Error:', error);
      res.status(500).json({ error: 'Failed to sync data', message: error.message });
    }
  });

  // ==================== FIX HUNTING ITEMS MIGRATION ====================
  // One-time migration to fix incorrect hunting items in player inventories
  app.post('/api/admin/fix-hunting-items', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const PRODUCTION_DATABASE_URL = process.env.PRODUCTION_DATABASE_URL;
      if (!PRODUCTION_DATABASE_URL) {
        return res.status(400).json({ 
          error: 'PRODUCTION_DATABASE_URL is not configured'
        });
      }

      // Import required modules
      const { drizzle } = await import('drizzle-orm/node-postgres');
      const pg = await import('pg');
      const Pool = pg.default.Pool;
      const schema = await import('@shared/schema');

      // Create production DB connection
      const prodPool = new Pool({
        connectionString: PRODUCTION_DATABASE_URL,
      });
      const prodDb = drizzle(prodPool, { schema });

      console.log('[Admin Fix] Starting hunting items migration...');

      // Mapping of incorrect item names to correct material IDs
      const huntingItemFixes: Record<string, string> = {
        'Rabbit': 'raw_hide',
        'Sheep': 'linen_cloth',
        'Deer': 'leather_strip',
        'Wild Boar': 'hardened_leather',
        'Mountain Goat': 'silk_thread',
        'Desert Fox': 'studded_leather',
        'Wild Camel': 'mystic_cloth',
        'Shadow Wolf': 'ranger_leather',
        'Dark Panther': 'arcane_silk',
        'Ice Bear': 'shadow_leather',
        'Frost Tiger': 'divine_cloth',
        'Wyvern': 'dragon_leather',
        'Celestial Stag': 'void_silk',
        'Void Beast': 'void_leather',
        'Abyssal Creature': 'void_silk',
      };

      // Get all players from production
      const allPlayers = await prodDb.select({
        id: schema.players.id,
        username: schema.players.username,
        inventory: schema.players.inventory,
      }).from(schema.players);

      let fixedCount = 0;
      const fixDetails: { username: string; fixes: string[] }[] = [];

      for (const player of allPlayers) {
        const inventory = player.inventory as Record<string, number>;
        const fixes: string[] = [];
        let needsUpdate = false;

        for (const [wrongItem, correctItem] of Object.entries(huntingItemFixes)) {
          if (inventory[wrongItem] && inventory[wrongItem] > 0) {
            const quantity = inventory[wrongItem];
            // Add to correct item
            inventory[correctItem] = (inventory[correctItem] || 0) + quantity;
            // Remove wrong item
            delete inventory[wrongItem];
            fixes.push(`${wrongItem} (${quantity}) -> ${correctItem}`);
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          await prodDb.update(schema.players)
            .set({ inventory } as any)
            .where(eq(schema.players.id, player.id));
          fixedCount++;
          fixDetails.push({ username: player.username, fixes });
          console.log(`[Admin Fix] Fixed inventory for ${player.username}:`, fixes.join(', '));
        }
      }

      // Close production pool
      await prodPool.end();

      console.log(`[Admin Fix] Hunting items migration complete. Fixed ${fixedCount} players.`);

      res.json({
        success: true,
        message: `Fixed hunting items for ${fixedCount} players`,
        details: fixDetails,
      });
    } catch (error: any) {
      console.error('[Admin Fix] Error fixing hunting items:', error);
      res.status(500).json({ error: 'Failed to fix hunting items', details: error.message });
    }
  });

  // ==================== FIX LEGACY FIREMAKING ITEMS ====================
  // One-time migration to fix "Burn Normal Logs" -> "basic_ash" in player inventories
  app.post('/api/admin/fix-firemaking-items', adminAuth, async (req, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const PRODUCTION_DATABASE_URL = process.env.PRODUCTION_DATABASE_URL;
      if (!PRODUCTION_DATABASE_URL) {
        return res.status(400).json({ 
          error: 'PRODUCTION_DATABASE_URL is not configured'
        });
      }

      const { drizzle } = await import('drizzle-orm/node-postgres');
      const pg = await import('pg');
      const Pool = pg.default.Pool;
      const schema = await import('@shared/schema');

      const prodPool = new Pool({
        connectionString: PRODUCTION_DATABASE_URL,
      });
      const prodDb = drizzle(prodPool, { schema });

      console.log('[Admin Fix] Starting firemaking items migration...');

      const firemakingItemFixes: Record<string, string> = {
        'Burn Normal Logs': 'basic_ash',
        'Burn Oak Logs': 'oak_ash',
        'Burn Willow Logs': 'willow_ash',
        'Burn Maple Logs': 'maple_ash',
        'Burn Yew Logs': 'yew_ash',
        'Burn Magic Logs': 'magic_ash',
      };

      const allPlayers = await prodDb.select({
        id: schema.players.id,
        username: schema.players.username,
        inventory: schema.players.inventory,
      }).from(schema.players);

      let fixedCount = 0;
      const fixDetails: { username: string; fixes: string[] }[] = [];

      for (const player of allPlayers) {
        const inventory = player.inventory as Record<string, number>;
        const fixes: string[] = [];
        let needsUpdate = false;

        for (const [wrongItem, correctItem] of Object.entries(firemakingItemFixes)) {
          if (inventory[wrongItem] && inventory[wrongItem] > 0) {
            const quantity = inventory[wrongItem];
            inventory[correctItem] = (inventory[correctItem] || 0) + quantity;
            delete inventory[wrongItem];
            fixes.push(`${wrongItem} (${quantity}) -> ${correctItem}`);
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          await prodDb.update(schema.players)
            .set({ inventory } as any)
            .where(eq(schema.players.id, player.id));
          fixedCount++;
          fixDetails.push({ username: player.username, fixes });
          console.log(`[Admin Fix] Fixed inventory for ${player.username}:`, fixes.join(', '));
        }
      }

      await prodPool.end();

      console.log(`[Admin Fix] Firemaking items migration complete. Fixed ${fixedCount} players.`);

      res.json({
        success: true,
        message: `Fixed firemaking items for ${fixedCount} players`,
        details: fixDetails,
      });
    } catch (error: any) {
      console.error('[Admin Fix] Error fixing firemaking items:', error);
      res.status(500).json({ error: 'Failed to fix firemaking items', details: error.message });
    }
  });

  // ==================== NORMALIZE PLAYER INVENTORY ITEM IDS ====================
  // One-time migration to merge duplicate inventory slots where one key is the
  // snake_case canonical ID and another is the display-name variant of the same item.
  app.post('/api/admin/normalize-inventory-item-ids', adminAuth, async (req, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;

      const allGameItemsForNorm = await storage.getAllGameItems();
      const knownIds = new Set(allGameItemsForNorm.map((i: any) => i.id));

      const allPlayers = await db.select({
        id: players.id,
        username: players.username,
        inventory: players.inventory,
      }).from(players);

      let fixedCount = 0;
      const fixDetails: { username: string; fixes: string[] }[] = [];

      for (const player of allPlayers) {
        const inventory = { ...(player.inventory as Record<string, number> || {}) };
        const fixes: string[] = [];
        let needsUpdate = false;

        const rawKeys = Object.keys(inventory);
        for (const rawKey of rawKeys) {
          const canonical = canonicalizeItemId(rawKey, knownIds);
          if (canonical !== null && canonical !== rawKey) {
            const qty = inventory[rawKey];
            inventory[canonical] = (inventory[canonical] || 0) + qty;
            delete inventory[rawKey];
            fixes.push(`"${rawKey}" (${qty}) -> "${canonical}"`);
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          await db.update(players)
            .set({ inventory } as any)
            .where(eq(players.id, player.id));
          fixedCount++;
          fixDetails.push({ username: player.username, fixes });
          console.log(`[Admin NormalizeInv] Fixed ${player.username}: ${fixes.join(', ')}`);
        }
      }

      console.log(`[Admin NormalizeInv] Complete. Fixed ${fixedCount} players.`);
      res.json({
        success: true,
        message: `Normalized inventory item IDs for ${fixedCount} players`,
        details: fixDetails,
      });
    } catch (error: any) {
      console.error('[Admin NormalizeInv] Error:', error);
      res.status(500).json({ error: 'Failed to normalize inventory item IDs', details: error.message });
    }
  });

  // =============================================================================
  // MESSAGING API ENDPOINTS
  // =============================================================================

  // Rate limiting: Track last message time per player
  const lastMessageTime: Map<string, number> = new Map();

  // Private Messages: Get inbox (received messages)
  app.get('/api/messages/inbox', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      
      const messages = await db
        .select({
          id: privateMessages.id,
          senderId: privateMessages.senderId,
          senderUsername: players.username,
          content: privateMessages.content,
          isRead: privateMessages.isRead,
          createdAt: privateMessages.createdAt,
        })
        .from(privateMessages)
        .innerJoin(players, eq(privateMessages.senderId, players.id))
        .where(eq(privateMessages.receiverId, player.id))
        .orderBy(desc(privateMessages.createdAt))
        .limit(100);
      
      res.json(messages);
    } catch (error) {
      console.error('[Messages] Error fetching inbox:', error);
      res.status(500).json({ error: 'Failed to fetch inbox' });
    }
  });

  // Private Messages: Get sent messages
  app.get('/api/messages/sent', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      
      const messages = await db
        .select({
          id: privateMessages.id,
          receiverId: privateMessages.receiverId,
          receiverUsername: players.username,
          content: privateMessages.content,
          isRead: privateMessages.isRead,
          createdAt: privateMessages.createdAt,
        })
        .from(privateMessages)
        .innerJoin(players, eq(privateMessages.receiverId, players.id))
        .where(eq(privateMessages.senderId, player.id))
        .orderBy(desc(privateMessages.createdAt))
        .limit(100);
      
      res.json(messages);
    } catch (error) {
      console.error('[Messages] Error fetching sent:', error);
      res.status(500).json({ error: 'Failed to fetch sent messages' });
    }
  });

  // Private Messages: Get unread count
  app.get('/api/messages/unread-count', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      
      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(privateMessages)
        .where(and(
          eq(privateMessages.receiverId, player.id),
          eq(privateMessages.isRead, 0)
        ));
      
      res.json({ count: result[0]?.count || 0 });
    } catch (error) {
      console.error('[Messages] Error fetching unread count:', error);
      res.status(500).json({ error: 'Failed to fetch unread count' });
    }
  });

  // Private Messages: Send a message
  app.post('/api/messages/send', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const { receiverId, content } = req.body;
      
      // Validate input
      if (!receiverId || typeof receiverId !== 'string') {
        return res.status(400).json({ error: 'receiverId is required' });
      }
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'content is required' });
      }
      
      // Limit content to 500 characters
      const trimmedContent = content.slice(0, 500);
      
      // Rate limit: 1 message per second
      const now = Date.now();
      const lastTime = lastMessageTime.get(player.id) || 0;
      if (now - lastTime < 1000) {
        return res.status(429).json({ error: 'Please wait before sending another message' });
      }
      lastMessageTime.set(player.id, now);
      
      // Verify receiver exists
      const receiver = await storage.getPlayer(receiverId);
      if (!receiver) {
        return res.status(404).json({ error: 'Receiver not found' });
      }
      
      // Can't message yourself
      if (receiverId === player.id) {
        return res.status(400).json({ error: 'Cannot send message to yourself' });
      }
      
      // Insert message
      const [message] = await db
        .insert(privateMessages)
        .values({
          senderId: player.id,
          receiverId,
          content: trimmedContent,
        })
        .returning();
      
      // Send push notification to receiver
      try {
        const senderUsername = player.username || 'Someone';
        const previewContent = trimmedContent.length > 50 
          ? trimmedContent.slice(0, 47) + '...' 
          : trimmedContent;
        
        await sendPushNotification(
          receiverId,
          'private_message' as any,
          `New message from ${senderUsername}` as any,
          previewContent as any
        );
      } catch (pushError) {
        console.error('[Messages] Push notification error:', pushError);
      }
      
      res.json({
        id: message.id,
        senderId: message.senderId,
        receiverId: message.receiverId,
        content: message.content,
        isRead: message.isRead,
        createdAt: message.createdAt,
      });
    } catch (error) {
      console.error('[Messages] Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Private Messages: Mark as read
  app.post('/api/messages/:id/read', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const messageId = req.params.id;
      
      // Update message if it belongs to the player
      const result = await db
        .update(privateMessages)
        .set({ isRead: 1 } as any)
        .where(and(
          eq(privateMessages.id, messageId),
          eq(privateMessages.receiverId, player.id)
        ))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: 'Message not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('[Messages] Error marking as read:', error);
      res.status(500).json({ error: 'Failed to mark message as read' });
    }
  });

  // Private Messages: Get conversation with specific player
  app.get('/api/messages/conversation/:playerId', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const otherPlayerId = req.params.playerId;
      
      // Get all messages between the two players, ordered by createdAt ASC for conversations
      const messages = await db
        .select({
          id: privateMessages.id,
          senderId: privateMessages.senderId,
          receiverId: privateMessages.receiverId,
          content: privateMessages.content,
          isRead: privateMessages.isRead,
          createdAt: privateMessages.createdAt,
        })
        .from(privateMessages)
        .where(or(
          and(
            eq(privateMessages.senderId, player.id),
            eq(privateMessages.receiverId, otherPlayerId)
          ),
          and(
            eq(privateMessages.senderId, otherPlayerId),
            eq(privateMessages.receiverId, player.id)
          )
        ))
        .orderBy(asc(privateMessages.createdAt))
        .limit(100);
      
      // Get the other player's username
      const otherPlayer = await storage.getPlayer(otherPlayerId);
      
      res.json({
        otherPlayer: otherPlayer ? {
          id: otherPlayer.id,
          username: otherPlayer.username,
        } : null,
        messages,
      });
    } catch (error) {
      console.error('[Messages] Error fetching conversation:', error);
      res.status(500).json({ error: 'Failed to fetch conversation' });
    }
  });

  // Global Chat: Get recent messages (last 100)
  app.get('/api/chat/global', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const messages = await db
        .select({
          id: globalChatMessages.id,
          playerId: globalChatMessages.playerId,
          username: players.username,
          level: players.totalLevel,
          content: globalChatMessages.content,
          createdAt: globalChatMessages.createdAt,
          currentRegion: players.currentRegion,
          selectedBadge: players.selectedBadge,
          badgeName: badges.name,
          badgeRarity: badges.rarity,
          badgeIcon: badges.icon,
          badgeImageUrl: badges.imageUrl,
          badgeNameTranslations: badges.nameTranslations,
        })
        .from(globalChatMessages)
        .innerJoin(players, eq(globalChatMessages.playerId, players.id))
        .leftJoin(badges, eq(players.selectedBadge, badges.id))
        .orderBy(desc(globalChatMessages.createdAt))
        .limit(100);
      
      // Return in chronological order for display
      res.json(messages.reverse());
    } catch (error) {
      console.error('[Chat] Error fetching global chat:', error);
      res.status(500).json({ error: 'Failed to fetch global chat' });
    }
  });

  // Global Chat: Send a message
  app.post('/api/chat/global', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const { content } = req.body;
      
      // Validate input
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'content is required' });
      }
      
      let sanitizedContent = content;
      const itemLinkMatches = content.match(/\[item:([^\]#]+)(?:#(\d+))?\]/g);
      if (itemLinkMatches && itemLinkMatches.length > 0) {
        const allItems = await db.select({ id: gameItems.id }).from(gameItems);
        const validItemIds = new Set(allItems.map((i: any) => i.id));
        const rarityPattern = /^(.+?) \((Common|Uncommon|Rare|Epic|Legendary|Mythic)\)$/;
        sanitizedContent = content.replace(/\[item:([^\]#]+)(?:#(\d+))?\]/g, (match: string, itemId: string) => {
          if (validItemIds.has(itemId)) return match;
          const rarityMatch = itemId.match(rarityPattern);
          if (rarityMatch && validItemIds.has(rarityMatch[1])) return match;
          return '';
        });
      }
      
      const trimmedContent = sanitizedContent.slice(0, 500);
      
      // Rate limit: 1 message per second
      const now = Date.now();
      const lastTime = lastMessageTime.get(`chat_${player.id}`) || 0;
      if (now - lastTime < 1000) {
        return res.status(429).json({ error: 'Please wait before sending another message' });
      }
      lastMessageTime.set(`chat_${player.id}`, now);
      
      // Insert message
      const [message] = await db
        .insert(globalChatMessages)
        .values({
          playerId: player.id,
          content: trimmedContent,
        })
        .returning();
      
      // Get player info for response
      const skills = player.skills as Record<string, { level: number }> || {};
      const totalLevel = Object.values(skills).reduce((sum, s) => sum + (s.level || 0), 0);
      
      let badgeData: { badgeName: string | null; badgeRarity: string | null; badgeIcon: string | null; badgeImageUrl: string | null; badgeNameTranslations: any } = {
        badgeName: null, badgeRarity: null, badgeIcon: null, badgeImageUrl: null, badgeNameTranslations: null,
      };
      if (player.selectedBadge) {
        const [badgeRow] = await db.select().from(badges).where(eq(badges.id, player.selectedBadge)).limit(1);
        if (badgeRow) {
          badgeData = {
            badgeName: badgeRow.name,
            badgeRarity: badgeRow.rarity,
            badgeIcon: badgeRow.icon,
            badgeImageUrl: badgeRow.imageUrl,
            badgeNameTranslations: badgeRow.nameTranslations,
          };
        }
      }
      
      res.json({
        id: message.id,
        playerId: message.playerId,
        username: player.username,
        level: totalLevel,
        content: message.content,
        createdAt: message.createdAt,
        currentRegion: player.currentRegion,
        selectedBadge: player.selectedBadge,
        ...badgeData,
      });
    } catch (error) {
      console.error('[Chat] Error sending global chat:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Global Chat: Get messages since timestamp (for polling)
  app.get('/api/chat/global/since/:timestamp', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const timestampMs = parseInt(req.params.timestamp, 10);
      if (isNaN(timestampMs)) {
        return res.status(400).json({ error: 'Invalid timestamp' });
      }
      
      const since = new Date(timestampMs);
      
      const messages = await db
        .select({
          id: globalChatMessages.id,
          playerId: globalChatMessages.playerId,
          username: players.username,
          level: players.totalLevel,
          content: globalChatMessages.content,
          createdAt: globalChatMessages.createdAt,
          currentRegion: players.currentRegion,
          selectedBadge: players.selectedBadge,
          badgeName: badges.name,
          badgeRarity: badges.rarity,
          badgeIcon: badges.icon,
          badgeImageUrl: badges.imageUrl,
          badgeNameTranslations: badges.nameTranslations,
        })
        .from(globalChatMessages)
        .innerJoin(players, eq(globalChatMessages.playerId, players.id))
        .leftJoin(badges, eq(players.selectedBadge, badges.id))
        .where(gt(globalChatMessages.createdAt, since))
        .orderBy(asc(globalChatMessages.createdAt))
        .limit(100);
      
      res.json(messages);
    } catch (error) {
      console.error('[Chat] Error fetching chat since timestamp:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.get('/api/chat/global/unread-count', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const lastSeen = player.lastSeenGlobalChat;

      if (!lastSeen) {
        await db.update(players).set({ lastSeenGlobalChat: new Date() } as any).where(eq(players.id, player.id));
        return res.json({ count: 0 });
      }

      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(globalChatMessages)
        .where(and(gt(globalChatMessages.createdAt, lastSeen), ne(globalChatMessages.playerId, player.id)));

      res.json({ count: result[0]?.count ?? 0 });
    } catch (error) {
      console.error('[Chat] Error fetching unread count:', error);
      res.status(500).json({ error: 'Failed to fetch unread count' });
    }
  });

  app.post('/api/chat/global/mark-read', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      await db.update(players).set({ lastSeenGlobalChat: new Date() } as any).where(eq(players.id, player.id));
      res.json({ success: true });
    } catch (error) {
      console.error('[Chat] Error marking global chat as read:', error);
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });

  // Tester: Delete a specific global chat message
  app.delete('/api/global-chat/:messageId', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const { messageId } = req.params;
      
      // Only testers can delete messages
      if (!player.isTester) {
        return res.status(403).json({ error: 'Only testers can delete messages' });
      }
      
      // Delete the message
      const result = await db
        .delete(globalChatMessages)
        .where(eq(globalChatMessages.id, messageId))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: 'Message not found' });
      }
      
      console.log(`[Chat] Tester ${player.username} deleted message ${messageId}`);
      res.json({ success: true, message: 'Message deleted' });
    } catch (error) {
      console.error('[Chat] Error deleting message:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  });

  // Admin: Clear all global chat messages
  app.delete('/api/admin/global-chat', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const result = await db.delete(globalChatMessages);
      console.log('[Admin] Global chat cleared');
      res.json({ success: true, message: 'Global chat cleared' });
    } catch (error) {
      console.error('[Admin] Error clearing global chat:', error);
      res.status(500).json({ error: 'Failed to clear global chat' });
    }
  });

  // =============================================================================
  // ADMIN BAN MANAGEMENT ENDPOINTS
  // =============================================================================

  app.get('/api/admin/suspicious-activities', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const limit = parseInt(req.query.limit as string) || 100;
      const unreviewedOnly = req.query.unreviewed === 'true';
      const activities = await storage.getSuspiciousActivities(limit, unreviewedOnly);
      res.json(activities);
    } catch (error) {
      console.error('[Admin] Error fetching suspicious activities:', error);
      res.status(500).json({ error: 'Failed to fetch suspicious activities' });
    }
  });

  app.post('/api/admin/suspicious-activities/:id/review', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      await storage.markActivityReviewed(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('[Admin] Error marking activity reviewed:', error);
      res.status(500).json({ error: 'Failed to mark activity reviewed' });
    }
  });

  app.post('/api/admin/ban/:playerId', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ error: 'Ban reason is required' });
      }
      const player = await storage.banPlayer(req.params.playerId, reason);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      res.json({ success: true, player });
    } catch (error) {
      console.error('[Admin] Error banning player:', error);
      res.status(500).json({ error: 'Failed to ban player' });
    }
  });

  app.post('/api/admin/unban/:playerId', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const player = await storage.unbanPlayer(req.params.playerId);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      res.json({ success: true, player });
    } catch (error) {
      console.error('[Admin] Error unbanning player:', error);
      res.status(500).json({ error: 'Failed to unban player' });
    }
  });

  app.get('/api/admin/banned-emails', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const bannedEmailsList = await storage.getAllBannedEmails();
      res.json(bannedEmailsList);
    } catch (error) {
      console.error('[Admin] Error fetching banned emails:', error);
      res.status(500).json({ error: 'Failed to fetch banned emails' });
    }
  });

  app.delete('/api/admin/banned-emails/:email', adminAuth, async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      await storage.removeBannedEmail(decodeURIComponent(req.params.email));
      res.json({ success: true });
    } catch (error) {
      console.error('[Admin] Error removing banned email:', error);
      res.status(500).json({ error: 'Failed to remove banned email' });
    }
  });

  // =============================================================================
  // DAILY LOGIN REWARDS SYSTEM
  // =============================================================================

  // Get current login status and all 15-day rewards
  app.get('/api/daily-login', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Get all 15-day rewards
      const rewards = await db.execute(sql`
        SELECT * FROM daily_login_rewards ORDER BY day ASC
      `);

      // Get or create player login record
      let playerLogin = await db.execute(sql`
        SELECT * FROM player_daily_login WHERE player_id = ${player.id}
      `);

      if (playerLogin.rows.length === 0) {
        await db.execute(sql`
          INSERT INTO player_daily_login (player_id, current_day, streak_count, total_days_claimed, cycle_start_date)
          VALUES (${player.id}, 1, 0, 0, ${today})
        `);
        playerLogin = await db.execute(sql`
          SELECT * FROM player_daily_login WHERE player_id = ${player.id}
        `);
      }

      const loginData = playerLogin.rows[0] as any;
      const canClaim = loginData.last_claim_date !== today;

      res.json({
        rewards: rewards.rows,
        currentDay: loginData.current_day,
        lastClaimDate: loginData.last_claim_date,
        totalDaysClaimed: loginData.total_days_claimed,
        streakCount: loginData.streak_count,
        canClaim,
      });
    } catch (error) {
      console.error('[DailyLogin] Error:', error);
      res.status(500).json({ error: 'Failed to get daily login status' });
    }
  });

  // Claim today's login reward
  app.post('/api/daily-login/claim', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const today = new Date().toISOString().split('T')[0];

      // Get player login record and check if already claimed today
      const playerLoginResult = await db.execute(sql`
        SELECT * FROM player_daily_login 
        WHERE player_id = ${player.id}
      `);

      if (playerLoginResult.rows.length === 0) {
        return res.status(400).json({ error: 'Login record not found' });
      }

      const loginData = playerLoginResult.rows[0] as any;

      // Check if already claimed today
      if (loginData.last_claim_date === today) {
        return res.status(400).json({ error: 'Already claimed today' });
      }

      // Get today's reward based on current day
      const rewardResult = await db.execute(sql`
        SELECT * FROM daily_login_rewards WHERE day = ${loginData.current_day}
      `);

      if (rewardResult.rows.length === 0) {
        return res.status(400).json({ error: 'Reward not found for this day' });
      }

      const reward = rewardResult.rows[0] as any;
      const rewardItems = reward.rewards as Array<{ itemId: string; quantity: number }>;

      // Add rewards to player inventory (keys go to player_dungeon_keys table)
      const KEY_TYPES = ['bronze_key', 'silver_key', 'gold_key', 'void_key'];
      for (const item of rewardItems) {
        const canonicalItemId = await getCanonicalItemId(item.itemId);
        if (KEY_TYPES.includes(canonicalItemId)) {
          const keyType = canonicalItemId.replace('_key', '');
          const existing = await db.select().from(playerDungeonKeys)
            .where(and(eq(playerDungeonKeys.playerId, player.id), eq(playerDungeonKeys.keyType, keyType)))
            .limit(1);
          if (existing.length > 0) {
            await db.update(playerDungeonKeys)
              .set({ quantity: sql`${playerDungeonKeys.quantity} + ${item.quantity}` } as any)
              .where(eq(playerDungeonKeys.id, existing[0].id));
          } else {
            await db.insert(playerDungeonKeys).values({ playerId: player.id, keyType, quantity: item.quantity } as any);
          }
        } else {
          await db.execute(sql`
            UPDATE players 
            SET inventory = jsonb_set(
              COALESCE(inventory, '{}'),
              ARRAY[${canonicalItemId}],
              to_jsonb(COALESCE((inventory->>${canonicalItemId})::integer, 0) + ${item.quantity})
            )
            WHERE id = ${player.id}
          `);
        }
      }

      // Calculate next day (wrap around to 1 after day 15)
      const nextDay = loginData.current_day >= 15 ? 1 : loginData.current_day + 1;

      // Check if streak continues (must claim on consecutive days)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const isStreak = loginData.last_claim_date === yesterdayStr;
      const newStreak = isStreak ? loginData.streak_count + 1 : 1;

      // Atomic update with WHERE guard to prevent double-claim race condition
      const updateResult = await db.execute(sql`
        UPDATE player_daily_login 
        SET current_day = ${nextDay},
            last_claim_date = ${today},
            total_days_claimed = total_days_claimed + 1,
            streak_count = ${newStreak}
        WHERE player_id = ${player.id}
          AND (last_claim_date IS NULL OR last_claim_date < ${today})
      `);

      if (updateResult.rowCount === 0) {
        return res.status(400).json({ error: 'Already claimed today' });
      }

      res.json({
        success: true,
        claimedDay: loginData.current_day,
        rewards: rewardItems,
        nextDay,
        streakCount: newStreak,
      });
    } catch (error) {
      console.error('[DailyLogin] Claim error:', error);
      res.status(500).json({ error: 'Failed to claim reward' });
    }
  });

  // =============================================================================
  // DAILY QUESTS SYSTEM
  // =============================================================================

  // Get current daily quests
  app.get('/api/daily-quests', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const today = new Date().toISOString().split('T')[0];

      // Check if player has quests for today
      let quests = await db.execute(sql`
        SELECT pq.*, qt.quest_type, qt.target_type, qt.reward_items, qt.reward_gold, 
               qt.difficulty, qt.name_translations, qt.description_translations
        FROM player_daily_quests pq
        JOIN daily_quest_templates qt ON pq.template_id = qt.id
        WHERE pq.player_id = ${player.id} AND pq.assigned_date = ${today}
      `);

      // If no quests for today, assign new ones
      if (quests.rows.length === 0) {
        const attackSkill = (player.skills as any)?.attack;
        const playerLevel = typeof attackSkill === 'object' ? (attackSkill?.level || 1) : getLevelFromXp(attackSkill || 0);
        const playerTier = playerLevel >= 71 ? 5 : playerLevel >= 51 ? 4 : playerLevel >= 31 ? 3 : playerLevel >= 16 ? 2 : 1;
        const tierMinLevel = playerTier >= 5 ? 51 : playerTier >= 4 ? 31 : playerTier >= 3 ? 16 : playerTier >= 2 ? 1 : 1;

        const killQuest = await db.execute(sql`
          SELECT * FROM daily_quest_templates 
          WHERE min_player_level <= ${playerLevel} AND min_player_level >= ${tierMinLevel}
            AND quest_type = 'kill_monsters'
          ORDER BY RANDOM() LIMIT 1
        `);
        const gatherCraftQuest = await db.execute(sql`
          SELECT * FROM daily_quest_templates 
          WHERE min_player_level <= ${playerLevel} AND min_player_level >= ${tierMinLevel}
            AND quest_type IN ('gather_resources', 'craft_items')
          ORDER BY RANDOM() LIMIT 1
        `);
        const excludeIds: number[] = [];
        if (killQuest.rows.length > 0) excludeIds.push((killQuest.rows[0] as any).id);
        if (gatherCraftQuest.rows.length > 0) excludeIds.push((gatherCraftQuest.rows[0] as any).id);
        
        let randomQuestRows: any[] = [];
        try {
          if (excludeIds.length > 0) {
            const randomQuest = await db.execute(sql`
              SELECT * FROM daily_quest_templates 
              WHERE min_player_level <= ${playerLevel} AND min_player_level >= ${tierMinLevel}
                AND id NOT IN (${sql.join(excludeIds.map(id => sql`${id}`), sql`, `)})
              ORDER BY RANDOM() LIMIT 1
            `);
            randomQuestRows = randomQuest.rows as any[];
          } else {
            const randomQuest = await db.execute(sql`
              SELECT * FROM daily_quest_templates 
              WHERE min_player_level <= ${playerLevel} AND min_player_level >= ${tierMinLevel}
              ORDER BY RANDOM() LIMIT 1
            `);
            randomQuestRows = randomQuest.rows as any[];
          }
        } catch (e) {
          console.error('[DailyQuests] Random quest query failed, trying fallback:', e);
          try {
            const fallback = await db.execute(sql`
              SELECT * FROM daily_quest_templates 
              WHERE min_player_level <= ${playerLevel} AND min_player_level >= ${tierMinLevel}
              ORDER BY RANDOM() LIMIT 1
            `);
            randomQuestRows = fallback.rows as any[];
          } catch (e2) {
            console.error('[DailyQuests] Fallback also failed:', e2);
          }
        }

        const selectedTemplates = [
          ...killQuest.rows,
          ...gatherCraftQuest.rows,
          ...randomQuestRows,
        ] as any[];

        for (const template of selectedTemplates) {
          await db.execute(sql`
            INSERT INTO player_daily_quests (player_id, template_id, target_quantity, assigned_date)
            VALUES (${player.id}, ${template.id}, ${template.target_quantity}, ${today})
          `);
        }

        // Re-fetch quests
        quests = await db.execute(sql`
          SELECT pq.*, qt.quest_type, qt.target_type, qt.reward_items, qt.reward_gold, 
                 qt.difficulty, qt.name_translations, qt.description_translations
          FROM player_daily_quests pq
          JOIN daily_quest_templates qt ON pq.template_id = qt.id
          WHERE pq.player_id = ${player.id} AND pq.assigned_date = ${today}
        `);
      }

      res.json({ quests: quests.rows });
    } catch (error) {
      console.error('[DailyQuests] Error:', error);
      res.status(500).json({ error: 'Failed to get daily quests' });
    }
  });

  // Accept/start a daily quest
  app.post('/api/daily-quests/:questId/accept', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const { questId } = req.params;
      const today = new Date().toISOString().split('T')[0];

      const result = await db.execute(sql`
        UPDATE player_daily_quests 
        SET is_accepted = 1
        WHERE id = ${questId} AND player_id = ${player.id} AND assigned_date = ${today} AND is_accepted = 0
        RETURNING *
      `);

      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Quest not found or already accepted' });
      }

      res.json({ success: true, quest: result.rows[0] });
    } catch (error) {
      console.error('[DailyQuests] Accept error:', error);
      res.status(500).json({ error: 'Failed to accept quest' });
    }
  });

  // Get active (accepted, unclaimed) daily quests - lightweight endpoint for login
  app.get('/api/daily-quests/active', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const today = new Date().toISOString().split('T')[0];

      const quests = await db.execute(sql`
        SELECT qt.quest_type, qt.target_type
        FROM player_daily_quests pq
        JOIN daily_quest_templates qt ON pq.template_id = qt.id
        WHERE pq.player_id = ${player.id} AND pq.assigned_date = ${today}
          AND pq.is_accepted = 1 AND pq.is_claimed = 0
      `);

      res.json({ quests: quests.rows.map((q: any) => ({ questType: q.quest_type, targetType: q.target_type })) });
    } catch (error) {
      console.error('[DailyQuests] Active quests error:', error);
      res.status(500).json({ error: 'Failed to get active quests' });
    }
  });

  // Update quest progress (called from game actions)
  app.post('/api/daily-quests/progress', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const { questType, targetType, amount } = req.body;
      const today = new Date().toISOString().split('T')[0];

      // Find matching quests and update progress
      const safeAmount = Math.min(Math.floor(amount || 1), 1000);
      let result;
      if (targetType) {
        result = await db.execute(sql`
          UPDATE player_daily_quests pq
          SET current_progress = LEAST(pq.current_progress + ${safeAmount}, pq.target_quantity),
              is_completed = CASE WHEN pq.current_progress + ${safeAmount} >= pq.target_quantity THEN 1 ELSE 0 END,
              completed_at = CASE WHEN pq.current_progress + ${safeAmount} >= pq.target_quantity AND pq.is_completed = 0 THEN NOW() ELSE pq.completed_at END
          FROM daily_quest_templates qt
          WHERE pq.template_id = qt.id 
            AND pq.player_id = ${player.id}
            AND pq.assigned_date = ${today}
            AND pq.is_accepted = 1
            AND pq.is_claimed = 0
            AND qt.quest_type = ${questType}
            AND qt.target_type = ${targetType}
          RETURNING pq.*
        `);
      } else {
        result = await db.execute(sql`
          UPDATE player_daily_quests pq
          SET current_progress = LEAST(pq.current_progress + ${safeAmount}, pq.target_quantity),
              is_completed = CASE WHEN pq.current_progress + ${safeAmount} >= pq.target_quantity THEN 1 ELSE 0 END,
              completed_at = CASE WHEN pq.current_progress + ${safeAmount} >= pq.target_quantity AND pq.is_completed = 0 THEN NOW() ELSE pq.completed_at END
          FROM daily_quest_templates qt
          WHERE pq.template_id = qt.id 
            AND pq.player_id = ${player.id}
            AND pq.assigned_date = ${today}
            AND pq.is_accepted = 1
            AND pq.is_claimed = 0
            AND qt.quest_type = ${questType}
            AND (qt.target_type IS NULL OR qt.target_type = '')
          RETURNING pq.*
        `);
      }

      res.json({ updated: result.rows.length });
    } catch (error) {
      console.error('[DailyQuests] Progress error:', error);
      res.status(500).json({ error: 'Failed to update quest progress' });
    }
  });

  // Batch update quest progress (called from saveToServer - optimized)
  app.post('/api/daily-quests/progress-batch', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const { progress } = req.body as { progress: Array<{ questType: string; targetType: string | null; amount: number }> };
      if (!progress || !Array.isArray(progress) || progress.length === 0) {
        return res.json({ updated: 0 });
      }
      const today = new Date().toISOString().split('T')[0];
      let totalUpdated = 0;
      for (const { questType, targetType, amount } of progress) {
        if (!questType || amount <= 0) continue;
        const safeAmount = Math.min(Math.floor(amount), 1000);
        let result;
        if (targetType) {
          result = await db.execute(sql`
            UPDATE player_daily_quests pq
            SET current_progress = LEAST(pq.current_progress + ${safeAmount}, pq.target_quantity),
                is_completed = CASE WHEN pq.current_progress + ${safeAmount} >= pq.target_quantity THEN 1 ELSE 0 END,
                completed_at = CASE WHEN pq.current_progress + ${safeAmount} >= pq.target_quantity AND pq.is_completed = 0 THEN NOW() ELSE pq.completed_at END
            FROM daily_quest_templates qt
            WHERE pq.template_id = qt.id 
              AND pq.player_id = ${player.id}
              AND pq.assigned_date = ${today}
              AND pq.is_accepted = 1
              AND pq.is_claimed = 0
              AND qt.quest_type = ${questType}
              AND qt.target_type = ${targetType}
            RETURNING pq.*
          `);
        } else {
          result = await db.execute(sql`
            UPDATE player_daily_quests pq
            SET current_progress = LEAST(pq.current_progress + ${safeAmount}, pq.target_quantity),
                is_completed = CASE WHEN pq.current_progress + ${safeAmount} >= pq.target_quantity THEN 1 ELSE 0 END,
                completed_at = CASE WHEN pq.current_progress + ${safeAmount} >= pq.target_quantity AND pq.is_completed = 0 THEN NOW() ELSE pq.completed_at END
            FROM daily_quest_templates qt
            WHERE pq.template_id = qt.id 
              AND pq.player_id = ${player.id}
              AND pq.assigned_date = ${today}
              AND pq.is_accepted = 1
              AND pq.is_claimed = 0
              AND qt.quest_type = ${questType}
              AND (qt.target_type IS NULL OR qt.target_type = '')
            RETURNING pq.*
          `);
        }
        totalUpdated += result.rows.length;
      }
      res.json({ updated: totalUpdated });
    } catch (error) {
      console.error('[DailyQuests] Batch progress error:', error);
      res.status(500).json({ error: 'Failed to update quest progress' });
    }
  });

  // Claim quest reward
  app.post('/api/daily-quests/:questId/claim', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const { questId } = req.params;

      // Get the quest
      const questResult = await db.execute(sql`
        SELECT pq.*, qt.reward_items, qt.reward_gold
        FROM player_daily_quests pq
        JOIN daily_quest_templates qt ON pq.template_id = qt.id
        WHERE pq.id = ${questId} AND pq.player_id = ${player.id}
      `);

      if (questResult.rows.length === 0) {
        return res.status(404).json({ error: 'Quest not found' });
      }

      const quest = questResult.rows[0] as any;

      if (quest.is_completed !== 1) {
        return res.status(400).json({ error: 'Quest not completed' });
      }

      if (quest.is_claimed === 1) {
        return res.status(400).json({ error: 'Quest already claimed' });
      }

      // Add rewards to inventory (keys go to player_dungeon_keys table)
      const rewardItems = quest.reward_items as Array<{ itemId: string; quantity: number }>;
      const QUEST_KEY_TYPES = ['bronze_key', 'silver_key', 'gold_key', 'void_key'];
      for (const item of rewardItems) {
        const canonicalItemId = await getCanonicalItemId(item.itemId);
        if (QUEST_KEY_TYPES.includes(canonicalItemId)) {
          const keyType = canonicalItemId.replace('_key', '');
          const existing = await db.select().from(playerDungeonKeys)
            .where(and(eq(playerDungeonKeys.playerId, player.id), eq(playerDungeonKeys.keyType, keyType)))
            .limit(1);
          if (existing.length > 0) {
            await db.update(playerDungeonKeys)
              .set({ quantity: sql`${playerDungeonKeys.quantity} + ${item.quantity}` } as any)
              .where(eq(playerDungeonKeys.id, existing[0].id));
          } else {
            await db.insert(playerDungeonKeys).values({ playerId: player.id, keyType, quantity: item.quantity } as any);
          }
        } else {
          await db.execute(sql`
            UPDATE players 
            SET inventory = jsonb_set(
              COALESCE(inventory, '{}'),
              ARRAY[${canonicalItemId}],
              to_jsonb(COALESCE((inventory->>${canonicalItemId})::integer, 0) + ${item.quantity})
            )
            WHERE id = ${player.id}
          `);
        }
      }

      // Add gold if any
      if (quest.reward_gold > 0) {
        await db.execute(sql`
          UPDATE players SET gold = gold + ${quest.reward_gold} WHERE id = ${player.id}
        `);
      }

      // Mark as claimed
      await db.execute(sql`
        UPDATE player_daily_quests SET is_claimed = 1 WHERE id = ${questId}
      `);

      res.json({
        success: true,
        rewards: rewardItems,
        gold: quest.reward_gold,
      });
    } catch (error) {
      console.error('[DailyQuests] Claim error:', error);
      res.status(500).json({ error: 'Failed to claim quest reward' });
    }
  });

  // ============================================================
  // ACHIEVEMENTS
  // ============================================================

  app.get('/api/achievements', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const allAchievements = await storage.getAllAchievements();
      res.json(allAchievements);
    } catch (error) {
      console.error('Error fetching achievements:', error);
      res.status(500).json({ error: 'Failed to fetch achievements' });
    }
  });

  app.get('/api/player-achievements', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const progress = await storage.getPlayerAchievements(player.id);
      res.json(progress);
    } catch (error) {
      console.error('Error fetching player achievements:', error);
      res.status(500).json({ error: 'Failed to fetch player achievements' });
    }
  });

  app.get('/api/achievement-buffs', authenticatePlayer, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const [allAchievements, playerProgress] = await Promise.all([
        storage.getAllAchievements(),
        storage.getPlayerAchievements(player.id),
      ]);

      const progressMap = new Map(playerProgress.map(p => [p.achievementId, p]));

      const completedCountByCategory: Record<string, number> = {};
      for (const achievement of allAchievements) {
        const category = achievement.category || 'general';
        if (!completedCountByCategory[category]) {
          completedCountByCategory[category] = 0;
        }
        const tiersList = (achievement.tiers as any[]) || [];
        const playerAch = progressMap.get(achievement.id);
        const completedTiers = (playerAch?.completedTiers as number[]) || [];
        if (tiersList.length > 0 && completedTiers.length >= tiersList.length) {
          completedCountByCategory[category]++;
        }
      }

      const { calculateAchievementBuffs } = await import('@shared/achievementBuffs');
      const activeBuffs = calculateAchievementBuffs(completedCountByCategory);

      res.json({ activeBuffs, completedCountByCategory });
    } catch (error) {
      console.error('Error fetching achievement buffs:', error);
      res.status(500).json({ error: 'Failed to fetch achievement buffs' });
    }
  });

  app.post('/api/achievement-progress', authenticatePlayer, validateSessionToken, async (req: AuthenticatedPlayerRequest, res) => {
    try {
      const player = req.player!;
      const { updates } = req.body;
      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ error: 'Missing updates array' });
      }

      const allAchievements = await storage.getAllAchievements();
      const achByTrackingKey = new Map<string, typeof allAchievements>();
      for (const a of allAchievements) {
        const existing = achByTrackingKey.get(a.trackingKey) || [];
        existing.push(a);
        achByTrackingKey.set(a.trackingKey, existing);
      }
      const existingProgress = await storage.getPlayerAchievements(player.id);
      const progressMap = new Map(existingProgress.map(p => [p.achievementId, p]));

      const existingBadgesForRetro = await storage.getPlayerBadges(player.id);
      const ownedBadgeIds = new Set(existingBadgesForRetro.map(b => b.badgeId));
      for (const pa of existingProgress) {
        const achievement = allAchievements.find(a => a.id === pa.achievementId);
        if (!achievement) continue;
        const tiersList = (achievement.tiers as any[]) || [];
        const completedTiers = (pa.completedTiers as number[]) || [];
        for (const t of tiersList) {
          if (t.badgeId && completedTiers.includes(t.tier) && !ownedBadgeIds.has(t.badgeId)) {
            try {
              const badge = await storage.getBadge(t.badgeId);
              if (badge) {
                await storage.awardBadge(player.id, t.badgeId);
                ownedBadgeIds.add(t.badgeId);
              }
            } catch (e) {}
          }
        }
      }

      const newlyCompleted: { achievementId: string; tier: number; badgeId?: string; rewardGold?: number }[] = [];

      for (const update of updates) {
        const { trackingKey, value, mode = "increment" } = update as { trackingKey: string; value: number; mode?: string };
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

          await storage.upsertPlayerAchievement(player.id, achievement.id, newProgress, newCompletedTiers);
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
              const existingBadges = await storage.getPlayerBadges(player.id);
              if (!existingBadges.some(b => b.badgeId === c.badgeId)) {
                await storage.awardBadge(player.id, c.badgeId);
              }
            }
          } catch (e) {
            // Badge doesn't exist, skip
          }
        }
      }

      if (totalGoldReward > 0) {
        await db.execute(sql`UPDATE players SET gold = gold + ${totalGoldReward} WHERE id = ${player.id}`);
      }

      res.json({
        success: true,
        newlyCompleted,
        totalGoldReward,
      });
    } catch (error) {
      console.error('Error updating achievement progress:', error);
      res.status(500).json({ error: 'Failed to update achievement progress' });
    }
  });

  // Admin achievement management
  app.get('/api/admin/achievements', adminAuth, async (req, res) => {
    try {
      const allAchievements = await storage.getAllAchievements();
      res.json(allAchievements);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch achievements' });
    }
  });

  app.post('/api/admin/achievements', adminAuth, async (req, res) => {
    try {
      const achievement = await storage.createAchievement(req.body);
      bumpGameDataVersion();
      res.json(achievement);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create achievement' });
    }
  });

  app.put('/api/admin/achievements/:id', adminAuth, async (req, res) => {
    try {
      const updated = await storage.updateAchievement(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Achievement not found' });
      bumpGameDataVersion();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update achievement' });
    }
  });

  app.delete('/api/admin/achievements/:id', adminAuth, async (req, res) => {
    try {
      await storage.deleteAchievement(req.params.id);
      bumpGameDataVersion();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete achievement' });
    }
  });

  app.post('/api/admin/seed-achievements', adminAuth, async (req, res) => {
    try {
      const { generateAchievements } = await import('./achievementSeeds');
      const seeds = generateAchievements();
      const count = await storage.bulkCreateAchievements(seeds);
      bumpGameDataVersion();
      res.json({ success: true, count, total: seeds.length });
    } catch (error) {
      console.error('Error seeding achievements:', error);
      res.status(500).json({ error: 'Failed to seed achievements' });
    }
  });

  registerDungeonV2Routes(app, authenticatePlayer, adminAuth);

  const httpServer = createServer(app);
  
  // Setup Trade WebSocket
  setupTradeWebSocket(httpServer);
  
  // Setup Party WebSocket
  setupPartyWebSocket(httpServer);

  // Cleanup stale dungeon sessions from previous server instances
  import("./services/dungeonSessionManager").then(m => m.dungeonSessionManager.cleanupStaleSessionsOnStartup());
  
  return httpServer;
}
