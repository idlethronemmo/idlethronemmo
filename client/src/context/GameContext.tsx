import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getLevelFromXp } from "@/lib/gameMath";
import { useToast } from "@/hooks/use-toast";
import OfflineProgressDialog from "@/components/game/OfflineProgressDialog";
import CommunityPopup from "@/components/game/CommunityPopup";
import { getFoodHealAmount, isFood } from "@/lib/foods";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { auth } from "@/lib/firebase";
import { 
  COMBAT_HP_SCALE, 
  CombatSessionStats, 
  EquipmentDurability, 
  MAX_DURABILITY, 
  MIN_DURABILITY, 
  DURABILITY_WARNING_THRESHOLD, 
  DURABILITY_LOSS_PER_HIT, 
  DEATH_DURABILITY_LOSS_MIN, 
  DEATH_DURABILITY_LOSS_MAX, 
  BREAKAGE_CHANCES,
  EQUIPMENT_DROP_CHANCE_BY_RARITY,
  COMBAT_STYLE_MODIFIERS,
  calculateMaxHit,
  calculateMinHit,
  calculateFinalMaxHit,
  calculateFinalMinHit,
  calculateAccuracyRating,
  calculateEvasionRating,
  calculateHitChance,
  calculateDamageReduction,
  CombatDebuff,
  MonsterSkill,
  type GuildBonuses,
  type QueueItem,
  maxQueueSlots,
  ALLOWED_QUEUE_DURATIONS,
  isQueueV2Player,
  maxQueueTimeMs,
  getUsedQueueTimeMs,
} from "@shared/schema";
import { getMonsterById, loadMonstersData, reloadMonstersData, setTesterMode as setMonstersTesterMode } from "@/lib/monsters";
import { getLocalizedMonsterName } from "@/lib/gameTranslations";
import { 
  shouldSkillTrigger, 
  executeMonsterSkill, 
  processDebuffTick, 
  getHealingReduction, 
  getStunCyclesRemaining, 
  decrementStunCycle, 
  addOrStackDebuff,
  getArmorBreakPercent
} from "@shared/combatSkills";
import { calculateXpScaling, applyMasteryXpScaling, estimateContentLevel, calculateMonsterCombatLevel, calculateCombatLevel } from "@shared/xpScaling";
import { EquipmentSlot, EQUIPMENT_SLOTS, getItemById, getTotalEquipmentBonus, ItemStats, rollRarity, rollRarityForDrop, RARITY_COLORS, getBaseItem, parseItemWithRarity, getRecipeByResultId, getVendorPrice, loadItemsData, reloadItemsData, hasInstanceSuffix, stripInstanceSuffix, addInstanceSuffix, getStudyInfo, getSalvageInfo, calculateSalvageScrap, STUDY_DURATION, STUDY_XP_MULTIPLIERS, formatItemIdAsName, setTesterMode as setItemsTesterMode } from "@/lib/items";
import { ActiveBuff, PotionEffect } from "@/lib/items-types";
import { trackKill, trackDeath, trackSkillAction, trackCombatXp, trackFoodEaten, trackGoldEarned, trackGoldSpent, trackItemLooted, trackTravel, trackSkillLevel, trackTotalLevel, trackHpHealed, trackDungeonEntered, trackDungeonCompleted, trackDungeonFloorCleared, trackCraft, trackPotionUsed, trackWeaponMastery, trackItemEquipped, trackGuildContribution, trackRegionVisited, trackItemDrop } from "@/hooks/useAchievementTracker";
import { Language, t as translateWithLang } from "@/lib/i18n";
import { useLanguage } from "@/context/LanguageContext";
import { getShowItemNotification } from "@/context/ItemNotificationContext";
import { getPlaySfx, getPlayWeaponSfx, getPlayMonsterHitSfx, getPlayPlayerSkillSfx, getPlayMonsterSkillSfx } from "@/context/AudioContext";
import { getItemImage } from "@/lib/itemImages";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useDevMode } from "@/context/DevModeContext";
import { 
  mapWeaponCategoryToMasteryType, 
  calculateMasteryXpGain, 
  getWeaponTierFromLevel, 
  WeaponMasteryType, 
  getMasteryLevelFromXp, 
  getXpToNextMasteryLevel,
  getMasteryFieldName,
  PlayerMasteries
} from '@shared/masterySystem';
import { 
  calculateSkillSynergyBonus, 
  applySpeedBonus, 
  applyXpBonus,
  PartySynergyBonuses,
  PartyMemberSkillStatus
} from '@shared/partySynergyBonus';
import { rollDungeonKeyDrop } from '@shared/dungeonKeyDrops';
import { getInventoryLimit as getInventoryLimitFn } from '@shared/inventoryLimits';
import { DeterministicRng, hashSeed } from '@shared/deterministicRng';
import { processCombatStep, MIN_ATTACK_SPEED_MS } from '@shared/combatEngine';
import type { CombatState, CombatEvent } from '@shared/combatTypes';
import type { ActiveAchievementBuff } from '@shared/achievementBuffs';

// Define the shape of our game state
interface SkillState {
  xp: number;
  level: number;
}

// Combat style affects XP distribution and combat modifiers
export type CombatStyle = "attack" | "defence" | "balanced";

const IDLE_LIMIT_MS = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

interface ActiveTask {
  skillId: string;
  actionId: number;
  startTime: number;
  duration: number;
  name: string; // Cache name for display
  xpReward: number;
  requiredBait?: string; // Bait item required (e.g., "Feather" for fishing)
  baitAmount?: number; // Amount of bait consumed per action
  limitExpiresAt: number; // 6 hour idle limit - task stops when this time is reached
  materials?: { itemId: string; quantity: number }[]; // Recipe materials for craft/cooking offline progress
  lastClientTick?: number; // Last time client processed this task - for scheduler takeover
  itemId?: string; // Item produced by this task (e.g., hunting produces different item than action name)
  targetQuantity?: number; // Target quantity to produce (0 or undefined = infinite)
  producedCount?: number; // Current count of items produced in this session
  queueDurationMs?: number; // Duration when started from queue
  queueExpiresAt?: number; // Absolute timestamp (ms) when queue slot expires — persisted to DB, not refreshed by Firemaking loop
}

interface OfflineProgress {
  offlineTimeMs: number;
  offlineTimeFormatted: string;
  skillId: string;
  skillName: string;
  xpEarned: number;
  itemsEarned: number;
  itemName: string;
  taskStopped: boolean;
  wasOverMaxTime: boolean;
  mythicCrafts?: { itemId: string; rarity: string }[];
  materialsDepleted?: boolean;
  offlineStartTime?: number; // Timestamp when offline period started - used for duplicate detection
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
  offlineStartTime?: number; // Timestamp when offline period started - used for duplicate detection
  masteryXpGained?: Record<string, number>; // Weapon mastery XP gained during offline combat
}

function hasActualOfflineContent(
  taskProg: OfflineProgress | null | undefined,
  combatProg: CombatOfflineProgress | null | undefined,
  firemakingProg?: any
): boolean {
  if (combatProg) {
    const combatXp = (combatProg.totalXpGained?.attack || 0) + 
                     (combatProg.totalXpGained?.strength || 0) + 
                     (combatProg.totalXpGained?.defence || 0) +
                     (combatProg.totalXpGained?.hitpoints || 0);
    if (combatProg.monstersKilled > 0 || combatProg.playerDied || combatXp > 0 ||
        Object.keys(combatProg.lootGained || {}).length > 0 ||
        Object.keys((combatProg as any).partySharedLoot || {}).length > 0 ||
        Object.keys((combatProg as any).foodEaten || {}).length > 0 ||
        Object.keys((combatProg as any).potionsConsumed || {}).length > 0 ||
        Object.keys((combatProg as any).durabilityLosses || {}).length > 0 ||
        ((combatProg as any).brokenItems && (combatProg as any).brokenItems.length > 0) ||
        ((combatProg as any).mythicDrops && (combatProg as any).mythicDrops.length > 0)) {
      return true;
    }
  }
  if (taskProg) {
    if (taskProg.xpEarned > 0 || taskProg.itemsEarned > 0 || taskProg.taskStopped || 
        taskProg.wasOverMaxTime || taskProg.materialsDepleted ||
        (taskProg.mythicCrafts && taskProg.mythicCrafts.length > 0)) {
      return true;
    }
  }
  if (firemakingProg && firemakingProg.totalXpEarned > 0) {
    return true;
  }
  return false;
}

interface PlayerMeta {
  id: string;
  username: string;
  avatar: string;
  totalLevel: number;
  currentRegion: string;
  isTester: number; // 1 = can access test mode
  selectedBadge?: string | null;
}

// Active travel state for delayed travel
interface ActiveTravel {
  targetRegion: string;
  startTime: number;
  endTime: number;
  cost: number;
  fromRegion: string;
}

interface ActiveCombat {
  monsterId: string;
  monsterCurrentHp: number;
  playerLastAttackTime: number;
  monsterLastAttackTime: number;
  combatStartTime: number;
  limitExpiresAt: number; // 6 hour idle limit - combat stops when this time is reached
  // Monster data for offline progress
  monsterMaxHp?: number;
  monsterAttackLevel?: number;
  monsterStrengthLevel?: number;
  monsterDefenceLevel?: number;
  monsterAttackBonus?: number;
  monsterStrengthBonus?: number;
  monsterAttackSpeed?: number;
  monsterLoot?: { itemId: string; chance: number; minQty: number; maxQty: number }[];
  monsterXpReward?: { attack: number; strength: number; defence: number; hitpoints: number };
  monsterSkills?: MonsterSkill[];
  // Auto-eat settings for offline combat
  autoEatEnabled?: boolean;
  autoEatThreshold?: number; // 0-100 percentage
  selectedFood?: string | null; // Which food to eat
  // Auto-potion settings for offline combat
  autoPotionEnabled?: boolean;
  selectedPotion?: string | null; // Which potion to auto-drink
  // Combat style for offline combat (attack/defence/balanced)
  combatStyle?: "attack" | "defence" | "balanced";
  // Timestamp of last client-side combat tick (for scheduler coordination)
  lastClientTick?: number;
  // Buff effects snapshot for offline combat (percentages)
  buffEffects?: {
    attackBoost?: number;
    strengthBoost?: number;
    defenceBoost?: number;
    critChance?: number;
    damageReduction?: number;
    hpRegen?: number;
  };
  // Active debuffs from monster skills (persisted for offline parity)
  combatDebuffs?: CombatDebuff[];
  queueDurationMs?: number; // Duration when started from queue
  queueExpiresAt?: number; // Absolute timestamp (ms) when queue slot expires — persisted to DB
  monsterData?: {
    maxHp: number;
    attackLevel: number;
    strengthLevel: number;
    defenceLevel: number;
    attackBonus?: number;
    strengthBonus?: number;
    attackSpeed: number;
    loot: { itemId: string; chance: number; minQty: number; maxQty: number }[];
    xpReward: { attack: number; strength: number; defence: number; hitpoints: number };
    skills?: MonsterSkill[];
  };
}

// Notification type for in-memory notifications (max 10, cleared on page refresh)
export interface GameNotification {
  id: string;
  type: string;
  message: string;
  payload: Record<string, any>;
  read: number;
  createdAt: string;
}

interface GameContextType {
  skills: Record<string, SkillState>;
  activeTask: ActiveTask | null;
  startTask: (skillId: string, actionId: number, duration: number, name: string, xpReward: number, requiredBait?: string, baitAmount?: number, materials?: { itemId: string; quantity: number }[], itemId?: string, targetQuantity?: number) => Promise<void>;
  stopTask: (isFiremakingPause?: boolean) => Promise<void>;
  resetTaskTimer: () => void; // Reset the 6-hour idle limit timer
  inventory: Record<string, number>;
  
  // Gold (currency)
  gold: number;
  addGold: (amount: number) => void;
  
  // Player metadata
  player: PlayerMeta | null;
  updatePlayerMeta: (updates: Partial<PlayerMeta>) => void;
  totalLevel: number;
  
  // Current region
  currentRegion: string;
  setCurrentRegion: (regionId: string, options?: { useTeleportStone?: boolean }) => Promise<void>;
  
  // Active travel (delayed travel in progress)
  activeTravel: ActiveTravel | null;
  completeTravel: () => Promise<void>;
  cancelTravel: () => Promise<void>;
  
  // Onboarding
  needsOnboarding: boolean;
  completeOnboarding: () => void;
  
  // Debug Mode
  debugMode: boolean;
  toggleDebugMode: () => void;

  // Loading state
  isLoading: boolean;
  
  // Online player count
  onlinePlayerCount: number;
  realOnlineCount: number | null;
  
  // Staff role (moderator/translator)
  staffRole: string | null;
  
  // Poll-sourced unread counts (from /api/poll, no separate polling needed)
  pollGlobalChatUnreadCount: number;
  pollPmUnreadCount: number;
  
  // Combat
  currentHitpoints: number;
  maxHitpoints: number;
  activeCombat: ActiveCombat | null;
  isInCombat: boolean; // Memoized boolean to prevent re-renders in navigation
  startCombat: (monsterId: string, monsterHp: number, monsterData?: {
    maxHp: number;
    attackLevel: number;
    strengthLevel: number;
    defenceLevel: number;
    attackBonus?: number;
    strengthBonus?: number;
    attackSpeed: number;
    loot: { itemId: string; chance: number; minQty: number; maxQty: number }[];
    xpReward: { attack: number; strength: number; defence: number; hitpoints: number };
    skills?: MonsterSkill[];
  }) => Promise<void>;
  stopCombat: (skipQueueAdvance?: boolean) => Promise<void>;
  forceClearCombat: () => Promise<void>;
  dealDamageToMonster: (damage: number) => void;
  takeDamage: (damage: number) => void;
  healPlayer: (amount: number) => void;
  grantCombatXp: (attackXp: number, strengthXp: number, defenceXp: number, hitpointsXp: number) => void;
  addLoot: (itemId: string, quantity: number) => void;
  setSkills: React.Dispatch<React.SetStateAction<Record<string, SkillState>>>;
  
  // Combat session stats
  combatSessionStats: CombatSessionStats | null;
  trackCombatKill: () => void;
  trackCombatDeath: () => void;
  trackCombatLoot: (itemId: string, quantity: number) => void;
  trackCombatXp: (skillId: string, xpAmount: number) => void;
  
  // Combat debuffs
  combatDebuffs: CombatDebuff[];
  
  // Food and auto-eat
  selectedFood: string | null;
  setSelectedFood: (foodId: string | null) => void;
  autoEatEnabled: boolean;
  setAutoEatEnabled: (enabled: boolean) => void;
  autoEatThreshold: number;
  setAutoEatThreshold: (threshold: number) => void;
  eatFood: (foodId: string) => boolean;
  
  // Potion and auto-potion
  selectedPotion: string | null;
  setSelectedPotion: (potionId: string | null) => void;
  autoPotionEnabled: boolean;
  setAutoPotionEnabled: (enabled: boolean) => void;
  eatFoodUntilFull: (foodId: string, currentHp: number, maxHp: number) => { count: number; healed: number };
  currentHitpointsRef: React.MutableRefObject<number>;
  removeFromInventory: (itemId: string, quantity: number) => void;
  sellItem: (itemId: string, quantity: number) => { gold: number; soldQty: number };
  bulkSellItems: (items: { itemId: string; quantity: number }[]) => number;
  
  // Equipment
  equipment: Record<EquipmentSlot, string | null>;
  equipItem: (itemId: string, targetSlot?: EquipmentSlot) => boolean;
  unequipItem: (slot: EquipmentSlot) => void;
  getEquipmentBonuses: () => ItemStats;
  
  // Equipment durability
  equipmentDurability: Record<string, number>;
  getSlotDurability: (slot: EquipmentSlot) => number;
  applyCombatDurabilityLoss: () => Promise<string[]>; // Returns broken items (breakage at 10%)
  applyDeathDurabilityPenalty: () => Promise<string[]>; // Only breaks if already at 10% before death
  hasLowDurabilityEquipment: () => boolean;
  repairEquipment: (slot: EquipmentSlot) => Promise<{ success: boolean; cost: number; error?: string }>;
  getRepairCost: (slot: EquipmentSlot) => number;
  getTotalRepairCost: () => number;
  repairAllEquipment: () => Promise<{ success: boolean; totalCost: number; error?: string }>;
  
  // Inventory durability (for unequipped items)
  inventoryDurability: Record<string, number>;
  getItemDurability: (itemId: string) => number;
  canListOnMarket: (itemId: string) => boolean;
  getAdjustedVendorPrice: (itemId: string, basePrice: number) => number;
  repairInventoryItem: (itemId: string) => Promise<{ success: boolean; cost: number; error?: string }>;
  
  // Recent crafts history
  recentCrafts: { itemId: string; rarity: string; timestamp: number }[];
  
  // Language
  language: Language;
  updateLanguage: (lang: Language) => Promise<void>;
  
  // Refresh player data from server
  refreshPlayer: () => Promise<void>;
  
  // Update inventory and gold directly from server response (prevents race conditions)
  applyServerData: (data: { gold?: number; inventory?: Record<string, number>; itemModifications?: Record<string, any> }) => void;
  
  // In-memory notifications (max 10, cleared on page refresh)
  notifications: GameNotification[];
  unreadNotificationCount: number;
  addNotification: (type: string, message: string, payload?: Record<string, any>) => void;
  markNotificationsRead: () => void;
  
  // Mythic craft popup tracking
  pendingMythicCrafts: { itemId: string; rarity: string }[];
  clearPendingMythicCrafts: () => void;
  
  // Mythic drop popup tracking (from combat)
  pendingMythicDrops: { itemId: string; monsterId: string }[];
  clearPendingMythicDrops: () => void;
  addPendingMythicDrop: (itemId: string, monsterId: string) => void;
  
  // Dungeon run state
  hasActiveDungeonRun: boolean;
  setHasActiveDungeonRun: (value: boolean) => void;
  
  // Guest account
  isGuest: boolean;
  guestLogin: () => Promise<void>;
  convertGuestAccount: (username: string) => Promise<void>;
  
  // Buff system
  activeBuffs: ActiveBuff[];
  usePotion: (potionId: string) => boolean;
  getBuffEffect: (effectType: PotionEffect["type"]) => number;
  hasActiveBuff: (effectType: PotionEffect["type"]) => boolean;
  
  // Combat style (attack/defence/balanced) - affects XP distribution and combat modifiers
  combatStyle: CombatStyle;
  setCombatStyle: (style: CombatStyle) => void;
  
  // Study and Salvage system
  startStudy: (itemId: string) => Promise<void>;
  salvageItem: (itemId: string, quantity: number) => { scrapGained: number; success: boolean };
  
  // Weapon Mastery System
  masteries: PlayerMasteries;
  getMasteryLevel: (masteryType: WeaponMasteryType) => number;
  getMasteryProgress: (masteryType: WeaponMasteryType) => { current: number; required: number; progress: number };
  
  // Combat event callbacks for CombatPage UI updates
  registerCombatCallbacks: (callbacks: {
    onCombatLog?: (message: string, type: string) => void;
    onPlayerAttackProgress?: (progress: number) => void;
    onMonsterAttackProgress?: (progress: number) => void;
    onRespawnStart?: (delay: number) => void;
    onRespawnEnd?: () => void;
    onLootDrop?: (itemId: string, quantity: number) => void;
    onDeath?: () => void;
    onVictory?: (monsterName: string) => void;
    onMonsterSkillUse?: (skillName: string, skillType: string) => void;
    onPlayerWeaponSkillUse?: (skillName: string, skillType: string) => void;
    onComboHit?: (hitNumber: number, totalHits: number, damage: number) => void;
    onSkillDamage?: (damage: number, skillName: string) => void;
    onPartySkillShare?: (skillName: string, damage: number, skillChance: number, effect: string) => void;
    onPlayerDamage?: (damage: number, isCritical: boolean) => void;
    onPlayerMiss?: () => void;
    onPlayerTakeDamage?: (damage: number, isCritical: boolean) => void;
    onPlayerSkillEffect?: (amount: number, skillName: string, effectType: 'damage' | 'heal' | 'buff' | 'debuff' | 'lifesteal') => void;
    onFormulaLog?: (type: 'player_attack' | 'monster_attack', formula: string, result: number, hit: boolean) => void;
  }) => void;
  unregisterCombatCallbacks: () => void;
  
  // Guild bonuses for online combat/task calculations
  setGuildBonuses: (bonuses: GuildBonuses | null) => void;
  
  // Party combat bonuses for same-monster bonus (dpsBonus, defenseBonus)
  setPartyCombatBonuses: (bonuses: { dpsBonus: number; defenseBonus: number } | null) => void;
  
  // Prepare for offline (set offlineStartTime before logout)
  prepareForOffline: () => Promise<void>;
  
  // Loading state for offline progress calculation
  isCalculatingOfflineProgress: boolean;
  
  // Combat offline progress (for loot display in CombatPage)
  combatOfflineProgress: CombatOfflineProgress | null;
  
  // Party skill synergy bonuses (speed/XP bonuses when party members do the same skill)
  partySynergyBonuses: PartySynergyBonuses;
  
  // Daily quest tracking - set active quests from DailyRewardsPage
  setActiveDailyQuests: (quests: Array<{ questType: string; targetType: string | null }>) => void;

  // Item modifications (enhancements)
  itemModifications: Record<string, { addedStats: Record<string, number>; addedSkills: string[]; enhancementLevel: number }>;
  // Cursed items list
  cursedItems: string[];

  // Firemaking slot system
  firemakingSlots: (BurningSlot | null)[];
  setFiremakingSlots: React.Dispatch<React.SetStateAction<(BurningSlot | null)[]>>;
  firemakingSlotsRef: React.MutableRefObject<(BurningSlot | null)[]>;

  taskQueue: QueueItem[];
  setTaskQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>;
  taskQueueRef: React.MutableRefObject<QueueItem[]>;
  maxQueueSlotsCount: number;
  addToQueue: (item: Omit<QueueItem, 'id' | 'addedAt' | 'status'>) => Promise<boolean>;
  removeFromQueue: (itemId: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  reorderQueueItem: (itemId: string, direction: 'up' | 'down') => Promise<void>;
  updateQueueItemDuration: (itemId: string, durationMs: number) => Promise<boolean>;
  startQueueFromItem: (itemId: string) => Promise<void>;
  isQueueV2: boolean;
  maxQueueTimeMsTotal: number;
  startTaskWithDuration: (skillId: string, actionId: number, duration: number, name: string, xpReward: number, durationMs: number, requiredBait?: string, baitAmount?: number, materials?: { itemId: string; quantity: number }[], itemId?: string, targetQuantity?: number) => void;
  startCombatWithDuration: (monsterId: string, monsterHp: number, durationMs: number, monsterData?: any) => void;
  pauseQueueOnCancel: boolean;
  setPauseQueueOnCancel: (value: boolean) => void;
  queueInterrupted: boolean;
  isQueuePaused: boolean;
  resumeQueue: () => Promise<void>;
  dismissQueueInterrupt: () => void;
}

export interface BurningSlot {
  logId: string;
  logName: string;
  startTime: number;
  duration: number;
  xpReward: number;
  actionId: number;
  itemId: string;
  quantity: number;
  burnedCount: number;
}

export const LOG_TO_ASH_MAP: Record<string, string> = {
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

const DEFAULT_SKILLS = {
  woodcutting: { xp: 0, level: 0 },
  mining: { xp: 0, level: 0 },
  fishing: { xp: 0, level: 0 },
  hunting: { xp: 0, level: 0 },
  crafting: { xp: 0, level: 0 },
  cooking: { xp: 0, level: 0 },
  alchemy: { xp: 0, level: 0 },
  firemaking: { xp: 0, level: 0 },
  attack: { xp: 0, level: 1 },
  strength: { xp: 0, level: 1 },
  defence: { xp: 0, level: 1 },
  hitpoints: { xp: 1154, level: 10 }, // Start at level 10 with 10 HP (1:1 scale)
};

const DEFAULT_EQUIPMENT: Record<EquipmentSlot, string | null> = {
  helmet: null,
  amulet: null,
  cape: null,
  weapon: null,
  body: null,
  shield: null,
  legs: null,
  gloves: null,
  boots: null,
  ring: null
};

function calculateTotalLevel(skills: Record<string, SkillState>): number {
  return Object.values(skills).reduce((total, skill) => total + skill.level, 0);
}

function cleanInventory(inv: Record<string, number>): Record<string, number> {
  const cleaned: Record<string, number> = {};
  for (const [key, val] of Object.entries(inv)) {
    if (typeof val === 'number' && val > 0) {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

// Lightweight context for navigation - only updates on language, activeTask, or combat start/stop
interface GameStatusContextType {
  language: Language;
  activeTask: ActiveTask | null;
  isInCombat: boolean;
  pendingTradeCount: number;
  staffRole: string | null;
}

const GameStatusContext = createContext<GameStatusContextType | undefined>(undefined);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { user: firebaseUser, loading: firebaseLoading, logout: firebaseLogout } = useFirebaseAuth();
  const { isDevMode } = useDevMode();
  const { language, setLanguage: setContextLanguage } = useLanguage();
  
  // Use the i18n t function that takes language as first param for consistency
  const t = (lang: Language, key: Parameters<typeof translateWithLang>[1]) => translateWithLang(lang, key);
  const [player, setPlayer] = useState<PlayerMeta | null>(null);
  const [currentRegion, setCurrentRegionState] = useState<string>('verdant');
  const currentRegionRef = useRef<string>('verdant');
  const [skills, setSkills] = useState<Record<string, SkillState>>(DEFAULT_SKILLS);
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null);
  const [pendingTradeCount, setPendingTradeCount] = useState(0);
  const pendingTradeCountRef = useRef(0);
  const [activeTravel, setActiveTravel] = useState<ActiveTravel | null>(null);
  const activeTravelRef = useRef<ActiveTravel | null>(null);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [gold, setGold] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [onlinePlayerCount, setOnlinePlayerCount] = useState(0);
  const [realOnlineCount, setRealOnlineCount] = useState<number | null>(null);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [hasActiveDungeonRun, setHasActiveDungeonRun] = useState(false);
  const hasActiveDungeonRunRef = useRef(false);
  useEffect(() => {
    hasActiveDungeonRunRef.current = hasActiveDungeonRun;
  }, [hasActiveDungeonRun]);
  const [offlineProgress, setOfflineProgress] = useState<OfflineProgress | null>(null);
  const [combatOfflineProgress, setCombatOfflineProgress] = useState<CombatOfflineProgress | null>(null);
  const [firemakingOfflineProgress, setFiremakingOfflineProgress] = useState<any>(null);
  const [offlineAchievements, setOfflineAchievements] = useState<{ achievementId: string; tier: number; badgeId?: string; rewardGold?: number }[] | null>(null);
  const [offlineQueueSteps, setOfflineQueueSteps] = useState<{ name: string; type: 'skill' | 'combat'; durationMs: number; xpEarned?: number; itemsEarned?: number; monstersKilled?: number; playerDied?: boolean; skillId?: string; itemName?: string; goldEarned?: number; lootItems?: Record<string, number> }[]>([]);
  const [showOfflineDialog, setShowOfflineDialog] = useState(false);
  const [showCommunityPopup, setShowCommunityPopup] = useState(false);
  const hasShownCommunityPopupRef = useRef(false);
  const [isCalculatingOfflineProgress, setIsCalculatingOfflineProgress] = useState(false);
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);
  
  
  // Party skill synergy state - tracks active bonuses when party members do the same skill
  const [partySynergyBonuses, setPartySynergyBonuses] = useState<PartySynergyBonuses>({
    speedBonus: 0,
    xpBonus: 0,
    membersDoingSameSkill: 0,
    skillId: null,
  });
  const partySynergyBonusesRef = useRef(partySynergyBonuses);
  const currentPartyIdRef = useRef<string | null>(null);
  
  const [pollGlobalChatUnreadCount, setPollGlobalChatUnreadCount] = useState(0);
  const [pollPmUnreadCount, setPollPmUnreadCount] = useState(0);
  
  // Achievement buffs - fetched from server, cached with long staleTime
  const achievementBuffsRef = useRef<ActiveAchievementBuff[]>([]);
  const achievementBuffsFetchedAtRef = useRef(0);
  const ACHIEVEMENT_BUFFS_STALE_TIME = 120000;
  const ACHIEVEMENT_BUFFS_REFETCH_INTERVAL = 300000;

  // Daily quest tracking - accumulate progress in refs, batch-send on save
  const activeDailyQuestsRef = useRef<Array<{ questType: string; targetType: string | null }>>([]);
  const dailyQuestProgressRef = useRef<Record<string, number>>({});
  const initPlayerRunningRef = useRef(false);
  
  const [taskQueue, setTaskQueue] = useState<QueueItem[]>([]);
  const taskQueueRef = useRef<QueueItem[]>([]);
  const [maxQueueSlotsCount, setMaxQueueSlotsCount] = useState(2);
  const [isQueueV2, setIsQueueV2] = useState(false);
  const [maxQueueTimeMsTotal, setMaxQueueTimeMsTotal] = useState(6 * 60 * 60 * 1000);
  const queueItemExpiresAtRef = useRef<number>(0);
  const lastStartedQueueItemIdRef = useRef<string | null>(null);
  const isPopAndStartRunningRef = useRef(false);

  // Combat state (scaled by COMBAT_HP_SCALE for bigger numbers)
  const [currentHitpoints, setCurrentHitpoints] = useState(10 * COMBAT_HP_SCALE);
  const [activeCombat, setActiveCombat] = useState<ActiveCombat | null>(null);
  const activeCombatRef = useRef(activeCombat);
  const currentHitpointsRef = useRef(currentHitpoints);
  
  // Track server's dataVersion to prevent stale data overwrites
  const dataVersionRef = useRef(2); // Start at 2 (migration version)
  
  // Combat session stats tracking
  const [combatSessionStats, setCombatSessionStats] = useState<CombatSessionStats | null>(null);
  const combatSessionStatsRef = useRef<CombatSessionStats | null>(null);
  
  // Food and auto-eat state - persisted to localStorage
  const AUTO_EAT_STORAGE_KEY = "guilds_autoeat_settings";
  const loadAutoEatSettings = () => {
    try {
      const saved = localStorage.getItem(AUTO_EAT_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  };
  const savedAutoEat = loadAutoEatSettings();
  const [selectedFood, setSelectedFood] = useState<string | null>(savedAutoEat?.selectedFood ?? null);
  const [autoEatEnabled, setAutoEatEnabled] = useState(savedAutoEat?.autoEatEnabled ?? true);
  const [autoEatThreshold, setAutoEatThreshold] = useState(savedAutoEat?.autoEatThreshold ?? 30); // 30% HP threshold
  
  // Persist auto-eat settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(AUTO_EAT_STORAGE_KEY, JSON.stringify({
        selectedFood,
        autoEatEnabled,
        autoEatThreshold
      }));
    } catch {}
  }, [selectedFood, autoEatEnabled, autoEatThreshold]);

  // Potion and auto-potion state - persisted to localStorage
  const AUTO_POTION_STORAGE_KEY = "guilds_autopotion_settings";
  const loadAutoPotionSettings = () => {
    try {
      const saved = localStorage.getItem(AUTO_POTION_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  };
  const savedAutoPotion = loadAutoPotionSettings();
  const [selectedPotion, setSelectedPotion] = useState<string | null>(savedAutoPotion?.selectedPotion ?? null);
  const [autoPotionEnabled, setAutoPotionEnabled] = useState(savedAutoPotion?.autoPotionEnabled ?? false);
  
  // Persist auto-potion settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(AUTO_POTION_STORAGE_KEY, JSON.stringify({
        selectedPotion,
        autoPotionEnabled
      }));
    } catch {}
  }, [selectedPotion, autoPotionEnabled]);

  // Queue cancel behavior - persisted to localStorage
  const QUEUE_SETTINGS_KEY = "guilds_queue_settings";
  const loadQueueSettings = () => {
    try {
      const saved = localStorage.getItem(QUEUE_SETTINGS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  };
  const savedQueueSettings = loadQueueSettings();
  const [pauseQueueOnCancel, setPauseQueueOnCancel] = useState<boolean>(savedQueueSettings?.pauseQueueOnCancel ?? false);
  const pauseQueueOnCancelRef = useRef(pauseQueueOnCancel);
  const [queueInterrupted, setQueueInterrupted] = useState(false);
  const queueInterruptedRef = useRef(false);
  const [isQueuePaused, setIsQueuePaused] = useState(false);
  const isQueuePausedRef = useRef(false);

  useEffect(() => {
    pauseQueueOnCancelRef.current = pauseQueueOnCancel;
    try {
      localStorage.setItem(QUEUE_SETTINGS_KEY, JSON.stringify({ pauseQueueOnCancel }));
    } catch {}
  }, [pauseQueueOnCancel]);

  // Equipment state
  const [equipment, setEquipment] = useState<Record<EquipmentSlot, string | null>>(DEFAULT_EQUIPMENT);
  
  // Equipment durability state (slot -> percentage 10-100)
  const [equipmentDurability, setEquipmentDurability] = useState<Record<string, number>>({});
  const equipmentDurabilityRef = useRef<Record<string, number>>({});
  
  // Inventory durability state (itemId -> percentage 10-100) - tracks durability of unequipped items
  const [inventoryDurability, setInventoryDurability] = useState<Record<string, number>>({});
  const inventoryDurabilityRef = useRef<Record<string, number>>({});

  // Recent crafts history (last 6 items)
  const [recentCrafts, setRecentCrafts] = useState<{ itemId: string; rarity: string; timestamp: number }[]>([]);

  // In-memory notifications (max 10, cleared on page refresh)
  const [notifications, setNotifications] = useState<GameNotification[]>([]);
  const notificationsRef = useRef<GameNotification[]>([]);

  // Active buffs from potions
  const [activeBuffs, setActiveBuffs] = useState<ActiveBuff[]>([]);
  const activeBuffsRef = useRef<ActiveBuff[]>([]);
  
  // Combat debuffs from monster skills (burn, poison, stun, etc.)
  const [combatDebuffs, setCombatDebuffs] = useState<CombatDebuff[]>([]);
  const combatDebuffsRef = useRef<CombatDebuff[]>([]);

  // Firemaking slot system state
  const [firemakingSlots, setFiremakingSlots] = useState<(BurningSlot | null)[]>([null, null, null, null, null, null]);
  const firemakingSlotsRef = useRef<(BurningSlot | null)[]>([null, null, null, null, null, null]);
  const firemakingSlotsRestoredRef = useRef(false);

  useEffect(() => {
    firemakingSlotsRef.current = firemakingSlots;
  }, [firemakingSlots]);

  const restoreFiremakingSlots = useCallback((serverSlots: any) => {
    if (firemakingSlotsRestoredRef.current) return;
    firemakingSlotsRestoredRef.current = true;
    
    try {
      localStorage.removeItem('firemaking_slots');

      if (!serverSlots) return;
      
      const slotsArray = Array.isArray(serverSlots) ? serverSlots : Object.values(serverSlots);
      if (!slotsArray || slotsArray.length === 0) return;

      const padded: (BurningSlot | null)[] = [null, null, null, null, null, null];
      for (let i = 0; i < Math.min(slotsArray.length, 6); i++) {
        padded[i] = slotsArray[i] || null;
      }
      
      setFiremakingSlots(padded);
      firemakingSlotsRef.current = padded;
    } catch (e) {
      console.warn('Failed to restore firemaking slots:', e);
    }
  }, []);

  useEffect(() => {
    if (!firemakingSlotsRestoredRef.current) return;
    if (activeTask && activeTask.skillId !== "firemaking") {
      setFiremakingSlots(prev => {
        if (prev.some(s => s !== null)) {
          return [null, null, null, null, null, null];
        }
        return prev;
      });
    }
  }, [activeTask]);

  // Game data loading state - true when items/monsters are loaded
  const [gameDataReady, setGameDataReady] = useState(false);
  
  // Pending data to process after game data loads
  const pendingPlayerDataRef = useRef<{
    equipment?: Record<EquipmentSlot, string | null>;
    currentHitpoints?: number;
    activeCombat?: ActiveCombat;
    skills?: Record<string, SkillState>;
    dataVersion?: number;
    playerId?: string;
  } | null>(null);

  const [debugMode, setDebugMode] = useState(false);
  
  // Combat style state - affects XP distribution and combat modifiers
  const [combatStyle, setCombatStyleState] = useState<CombatStyle>("balanced");
  const combatStyleRef = useRef<CombatStyle>("balanced");
  useEffect(() => { combatStyleRef.current = combatStyle; }, [combatStyle]);
  
  const setCombatStyle = useCallback((style: CombatStyle) => {
    setCombatStyleState(style);
    // Save to localStorage for persistence
    localStorage.setItem("combatStyle", style);
  }, []);
  
  // Load combat style from localStorage on mount
  useEffect(() => {
    const savedStyle = localStorage.getItem("combatStyle") as CombatStyle | null;
    if (savedStyle && ["attack", "defence", "balanced"].includes(savedStyle)) {
      setCombatStyleState(savedStyle);
    }
  }, []);
  
  // Weapon Mastery System - XP values for each weapon type
  const [masteries, setMasteries] = useState<PlayerMasteries>({
    masteryDagger: 0,
    masterySwordShield: 0,
    mastery2hSword: 0,
    mastery2hAxe: 0,
    mastery2hWarhammer: 0,
    masteryBow: 0,
    masteryStaff: 0,
  });
  const masteriesRef = useRef<PlayerMasteries>(masteries);
  useEffect(() => { masteriesRef.current = masteries; }, [masteries]);

  const [itemModifications, setItemModifications] = useState<Record<string, { addedStats: Record<string, number>; addedSkills: string[]; enhancementLevel: number }>>({});
  const itemModificationsRef = useRef(itemModifications);
  useEffect(() => { itemModificationsRef.current = itemModifications; }, [itemModifications]);

  const [cursedItems, setCursedItems] = useState<string[]>([]);
  const cursedItemsRef = useRef(cursedItems);
  useEffect(() => { cursedItemsRef.current = cursedItems; }, [cursedItems]);
  
  // Helper functions for mastery UI
  const getMasteryLevel = useCallback((masteryType: WeaponMasteryType): number => {
    const xp = masteriesRef.current[getMasteryFieldName(masteryType) as keyof PlayerMasteries] || 0;
    return getMasteryLevelFromXp(xp);
  }, []);
  
  const getMasteryProgress = useCallback((masteryType: WeaponMasteryType): { current: number; required: number; progress: number } => {
    const xp = masteriesRef.current[getMasteryFieldName(masteryType) as keyof PlayerMasteries] || 0;
    return getXpToNextMasteryLevel(xp);
  }, []);
  
  const stateSnapshot = useRef<{
    skills: Record<string, SkillState>;
    inventory: Record<string, number>;
    currentHitpoints: number;
  } | null>(null);

  // Calculate total level
  const totalLevel = calculateTotalLevel(skills);

  // Dirty flag for autosave optimization - only save when state has changed
  const isDirtyRef = useRef(false);
  const saveVersionRef = useRef(0);
  const markDirty = useCallback(() => { isDirtyRef.current = true; saveVersionRef.current++; }, []);

  // Use refs to track current state for saves without triggering effect reruns
  const skillsRef = useRef(skills);
  const inventoryRef = useRef(inventory);
  const goldRef = useRef(gold);
  const lastKnownServerGoldRef = useRef(gold);
  const activeTaskRef = useRef(activeTask);
  const playerRef = useRef(player);
  const debugModeRef = useRef(debugMode);
  const equipmentRef = useRef(equipment);
  const sessionTokenRef = useRef<string | null>(null);
  
  // APP VERSION CHECK: Force cache clear and logout when server version changes
  useEffect(() => {
    const checkAppVersion = async () => {
      try {
        if (sessionStorage.getItem('idlethrone_version_redirect')) {
          sessionStorage.removeItem('idlethrone_version_redirect');
          return;
        }
        
        const res = await fetch('/api/config');
        if (!res.ok) return;
        const config = await res.json();
        const serverVersion = config.appVersion;
        if (!serverVersion) return;

        const storedVersion = localStorage.getItem('idlethrone_app_version');

        if (!storedVersion) {
          const hasExistingSession = !!localStorage.getItem('gameSessionToken');
          if (!hasExistingSession) {
            localStorage.setItem('idlethrone_app_version', serverVersion);
            return;
          }
        }

        if (storedVersion === serverVersion) return;

        console.log('[AppVersion] Version changed from', storedVersion, 'to', serverVersion, '- forcing cache clear');

        const savedLanguage = localStorage.getItem('idlethrone_language');

        localStorage.clear();
        sessionStorage.clear();

        if (savedLanguage) localStorage.setItem('idlethrone_language', savedLanguage);
        localStorage.setItem('idlethrone_app_version', serverVersion);

        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
          }
        }

        if ('caches' in window) {
          const cacheNames = await caches.keys();
          for (const cacheName of cacheNames) {
            await caches.delete(cacheName);
          }
        }

        initPlayerRunningRef.current = true;

        try {
          const { getAuth, signOut } = await import('firebase/auth');
          const auth = getAuth();
          if (auth.currentUser) {
            await signOut(auth);
          }
        } catch (e) {
        }

        sessionStorage.setItem('idlethrone_version_redirect', '1');
        window.location.href = '/';
      } catch (err) {
        console.error('[AppVersion] Check failed:', err);
      }
    };

    checkAppVersion();
  }, []);

  // SINGLE SESSION ENFORCEMENT: BroadcastChannel for same-browser tab communication
  // When a new tab/session starts, it broadcasts to close all other tabs
  const sessionChannelRef = useRef<BroadcastChannel | null>(null);
  const [sessionInvalidated, setSessionInvalidated] = useState(false);
  
  useEffect(() => {
    // Create broadcast channel for session coordination
    const channel = new BroadcastChannel('idlethrone_session');
    sessionChannelRef.current = channel;
    
    // Listen for new session messages from other tabs
    channel.onmessage = async (event) => {
      if (event.data.type === 'NEW_SESSION' && event.data.token !== sessionTokenRef.current) {
        // Another tab started a new session - invalidate this one
        console.log('[BroadcastChannel] New session detected in another tab, invalidating this session');
        setSessionInvalidated(true);
        localStorage.removeItem('gameSessionToken');
        toast({
          title: t(language, 'sessionEnded'),
          description: t(language, 'anotherDeviceLogin'),
          variant: "destructive",
        });
        // Sign out of Firebase to prevent auto-login, then redirect
        try {
          await firebaseLogout();
        } catch (e) {
          console.error('[BroadcastChannel] Firebase logout error:', e);
        }
        window.location.href = "/";
      }
    };
    
    return () => {
      channel.close();
      sessionChannelRef.current = null;
    };
  }, [language, toast, firebaseLogout]);
  
  // Helper to get auth headers with session token (sync version)
  const getAuthHeaders = useCallback((contentType = true): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (contentType) {
      headers['Content-Type'] = 'application/json';
    }
    
    // Try ref first, then localStorage as fallback
    const token = sessionTokenRef.current || localStorage.getItem('gameSessionToken');
    if (token) {
      headers['x-session-token'] = token;
      // Sync ref with localStorage if needed
      if (!sessionTokenRef.current && token) {
        sessionTokenRef.current = token;
      }
    }
    return headers;
  }, []);
  
  // Async helper to get auth headers with Firebase Bearer token (for production)
  const getAsyncAuthHeaders = useCallback(async (contentType = true): Promise<Record<string, string>> => {
    const headers = getAuthHeaders(contentType);
    
    // Add Firebase Bearer token for production authentication
    if (firebaseUser) {
      try {
        const idToken = await firebaseUser.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      } catch (e) {
        console.error('Failed to get Firebase token:', e);
      }
    }
    return headers;
  }, [getAuthHeaders, firebaseUser]);
  
  // Session item tracking - tracks items collected during current task session (gathering + crafting)
  const [pendingMythicCrafts, setPendingMythicCrafts] = useState<{ itemId: string; rarity: string }[]>([]);
  // Mythic drops tracking - stores mythic items dropped from monsters
  const [pendingMythicDrops, setPendingMythicDrops] = useState<{ itemId: string; monsterId: string }[]>([]);
  const deferredShowOfflineDialogRef = useRef(false);
  const sessionItemsRef = useRef<Record<string, number>>({});
  
  // Session combat loot tracking - tracks loot collected during current combat session
  const sessionCombatLootRef = useRef<Record<string, number>>({});
  
  // Combat save throttling - last time combat state was saved
  const lastCombatSaveRef = useRef<number>(0);
  const COMBAT_SAVE_THROTTLE = 10000;

  // Combat tick refs - for background combat processing across all pages
  const combatTickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPlayerAttackTimeRef = useRef<number>(0);
  const lastMonsterAttackTimeRef = useRef<number>(0);
  const lastAutoEatTimeRef = useRef<number>(0);
  const isProcessingRespawnRef = useRef<boolean>(false);
  const respawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBreakSlotsRef = useRef<Set<string>>(new Set());
  const lastDebuffTickRef = useRef<number>(0);
  const guildBonusesRef = useRef<GuildBonuses | null>(null);
  const partyCombatBonusesRef = useRef<{ dpsBonus: number; defenseBonus: number } | null>(null);
  const passiveRegenTickRef = useRef<number>(0);
  const DEFAULT_ATTACK_SPEED = 2400; // Default attack speed (ms) when no weapon equipped
  const RESPAWN_DELAY = 3000; // 3 second respawn delay
  
  // Deterministic combat engine refs
  const combatRngRef = useRef<DeterministicRng | null>(null);
  const combatStateRef = useRef<CombatState | null>(null);
  const lastCombatTickTimeRef = useRef<number>(0);
  const lastCombatStateSyncRef = useRef<number>(0);
  const COMBAT_STATE_SYNC_INTERVAL = 500;
  const cachedEquipBonusRef = useRef<{ equip: any; mods: any; bonuses: ReturnType<typeof getTotalEquipmentBonus> } | null>(null);
  
  // Helper function to get equipped weapon's attack speed
  const getWeaponAttackSpeed = useCallback((): number => {
    const weaponId = equipmentRef.current.weapon;
    if (!weaponId) return DEFAULT_ATTACK_SPEED;
    
    const weapon = getBaseItem(weaponId);
    if (!weapon || !weapon.attackSpeedMs) return DEFAULT_ATTACK_SPEED;
    
    return weapon.attackSpeedMs;
  }, []);
  
  // Helper function to get equipped weapon's lifesteal percentage
  // Supports dual daggers: sums lifesteal from both main hand and off-hand
  const getWeaponLifesteal = useCallback((): number => {
    let totalLifesteal = 0;
    
    // Main hand weapon
    const weaponId = equipmentRef.current.weapon;
    if (weaponId) {
      const weapon = getBaseItem(weaponId);
      if (weapon?.lifestealPercent) {
        totalLifesteal += weapon.lifestealPercent;
      }
    }
    
    const offhandId = equipmentRef.current.shield;
    if (offhandId) {
      const mainWeapon = weaponId ? getBaseItem(weaponId) : null;
      const offhand = getBaseItem(offhandId);
      if (mainWeapon?.weaponCategory === "dagger" && offhand?.weaponCategory === "dagger" && offhand?.lifestealPercent) {
        totalLifesteal += offhand.lifestealPercent * 0.25;
      }
    }
    
    return totalLifesteal;
  }, []);
  
  const ENHANCEMENT_SKILL_DEFINITIONS: Record<string, { id: string; name: string; chance: number; type: string; [key: string]: any }> = {
    'poison': { id: 'enh_poison', name: 'Poison', chance: 15, type: 'poison', dotDamage: 5, dotDuration: 5 },
    'burn': { id: 'enh_burn', name: 'Burn', chance: 15, type: 'poison', dotDamage: 8, dotDuration: 3 },
    'bleed': { id: 'enh_bleed', name: 'Bleed', chance: 15, type: 'poison', dotDamage: 4, dotDuration: 8 },
    'stun': { id: 'enh_stun', name: 'Stun', chance: 10, type: 'stun', stunCycles: 1 },
    'freeze': { id: 'enh_freeze', name: 'Freeze', chance: 10, type: 'stun', stunCycles: 2 },
    'vampiric': { id: 'enh_vampiric', name: 'Vampiric', chance: 20, type: 'lifesteal_burst' },
    'execute': { id: 'enh_execute', name: 'Execute', chance: 10, type: 'critical', damageMultiplier: 2.5 },
    'armor_pierce': { id: 'enh_armor_pierce', name: 'Armor Pierce', chance: 15, type: 'armor_break', armorBreakPercent: 30 },
  };

  // Helper function to get equipped weapon's skills
  // Supports dual daggers: combines skills from both main hand and off-hand
  const getWeaponSkills = useCallback(() => {
    const allSkills: NonNullable<ReturnType<typeof getBaseItem>>["weaponSkills"] = [];
    
    // Main hand weapon skills
    const weaponId = equipmentRef.current.weapon;
    if (weaponId) {
      const weapon = getBaseItem(weaponId);
      if (weapon?.weaponSkills) {
        allSkills.push(...weapon.weaponSkills);
      }
      
      // Off-hand skills (for dual daggers only)
      if (weapon?.weaponCategory === "dagger") {
        const offhandId = equipmentRef.current.shield;
        if (offhandId) {
          const offhand = getBaseItem(offhandId);
          if (offhand?.weaponCategory === "dagger" && offhand?.weaponSkills) {
            // Add off-hand skills (avoid duplicates by skill id)
            for (const skill of offhand.weaponSkills) {
              if (!allSkills.some(s => s.id === skill.id)) {
                allSkills.push(skill);
              }
            }
          }
        }
      }

      // Add enhancement skills from Death Liquid
      if (itemModificationsRef.current[weaponId]) {
        const mods = itemModificationsRef.current[weaponId];
        for (const skillId of (mods.addedSkills || [])) {
          const skillDef = ENHANCEMENT_SKILL_DEFINITIONS[skillId];
          if (skillDef && !allSkills.some(s => s.id === skillDef.id)) {
            allSkills.push(skillDef as any);
          }
        }
      }
    }
    
    return allSkills || [];
  }, []);
  
  // Monster stun state - for player weapon skills that stun monsters
  const monsterStunCyclesRef = useRef<number>(0);
  
  const DEBUFF_TICK_INTERVAL = 1000; // Debuff ticks every 1 second
  
  // Combat event callbacks - for CombatPage UI updates
  const combatEventCallbacksRef = useRef<{
    onCombatLog?: (message: string, type: string) => void;
    onPlayerAttackProgress?: (progress: number) => void;
    onMonsterAttackProgress?: (progress: number) => void;
    onRespawnStart?: (delay: number) => void;
    onRespawnEnd?: () => void;
    onLootDrop?: (itemId: string, quantity: number) => void;
    onDeath?: () => void;
    onVictory?: (monsterName: string) => void;
    onMonsterSkillUse?: (skillName: string, skillType: string) => void;
    onPlayerWeaponSkillUse?: (skillName: string, skillType: string) => void;
    onComboHit?: (hitNumber: number, totalHits: number, damage: number) => void;
    onSkillDamage?: (damage: number, skillName: string) => void;
    onPartySkillShare?: (skillName: string, damage: number, skillChance: number, effect: string) => void;
    onPlayerDamage?: (damage: number, isCritical: boolean) => void;
    onPlayerMiss?: () => void;
    onPlayerTakeDamage?: (damage: number, isCritical: boolean) => void;
    onPlayerSkillEffect?: (amount: number, skillName: string, effectType: 'damage' | 'heal' | 'buff' | 'debuff' | 'lifesteal') => void;
    onFormulaLog?: (type: 'player_attack' | 'monster_attack', formula: string, result: number, hit: boolean) => void;
  }>({});
  
  // Pending skill damage timeouts - clear these when combat ends
  const pendingSkillTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const SKILL_CAST_DELAY = 600; // ms delay for skill bar to fill before damage applies
  const COMBO_HIT_DELAY = 150; // ms delay between combo hits

  // Language ref for combat loop
  const languageRef = useRef<Language>(language);
  useEffect(() => { languageRef.current = language; }, [language]);

  // Keep refs in sync
  useEffect(() => { skillsRef.current = skills; markDirty(); }, [skills]);
  useEffect(() => { inventoryRef.current = inventory; markDirty(); }, [inventory]);
  useEffect(() => { goldRef.current = gold; markDirty(); }, [gold]);
  useEffect(() => { activeTaskRef.current = activeTask; markDirty(); }, [activeTask]);
  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { debugModeRef.current = debugMode; }, [debugMode]);
  useEffect(() => { activeCombatRef.current = activeCombat; markDirty(); }, [activeCombat]);
  useEffect(() => { currentHitpointsRef.current = currentHitpoints; markDirty(); }, [currentHitpoints]);
  useEffect(() => { equipmentRef.current = equipment; markDirty(); }, [equipment]);
  useEffect(() => { equipmentDurabilityRef.current = equipmentDurability; markDirty(); }, [equipmentDurability]);
  useEffect(() => { combatSessionStatsRef.current = combatSessionStats; }, [combatSessionStats]);
  useEffect(() => { activeBuffsRef.current = activeBuffs; markDirty(); }, [activeBuffs]);
  useEffect(() => { taskQueueRef.current = taskQueue; markDirty(); }, [taskQueue]);
  
  // Update activeCombat when autoEat settings change during combat and persist to DB
  useEffect(() => {
    if (activeCombat && (
      activeCombat.autoEatEnabled !== autoEatEnabled || 
      activeCombat.autoEatThreshold !== autoEatThreshold ||
      activeCombat.selectedFood !== selectedFood
    )) {
      const updated = { ...activeCombat, autoEatEnabled, autoEatThreshold, selectedFood };
      activeCombatRef.current = updated;
      setActiveCombat(updated);
      // Force immediate save so offline combat uses the new settings
      saveCombatState(updated);
    }
  }, [autoEatEnabled, autoEatThreshold, selectedFood]); // Don't include activeCombat to avoid infinite loop
  
  // Update activeCombat when autoPotion settings change during combat and persist to DB
  useEffect(() => {
    if (activeCombat && (
      activeCombat.autoPotionEnabled !== autoPotionEnabled || 
      activeCombat.selectedPotion !== selectedPotion
    )) {
      const updated = { ...activeCombat, autoPotionEnabled, selectedPotion };
      activeCombatRef.current = updated;
      setActiveCombat(updated);
      saveCombatState(updated);
    }
  }, [autoPotionEnabled, selectedPotion]); // Don't include activeCombat to avoid infinite loop
  
  // Fetch achievement buffs from server with caching
  const fetchAchievementBuffs = useCallback(async () => {
    const now = Date.now();
    if (now - achievementBuffsFetchedAtRef.current < ACHIEVEMENT_BUFFS_STALE_TIME) return;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = await auth.currentUser?.getIdToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch('/api/achievement-buffs', { credentials: "include", headers });
      if (res.ok) {
        const data = await res.json();
        achievementBuffsRef.current = data.activeBuffs || [];
        achievementBuffsFetchedAtRef.current = now;
      }
    } catch (e) {}
  }, []);

  const getAchievementBuffValue = useCallback((buffType: string): number => {
    const buff = achievementBuffsRef.current.find(b => b.buffType === buffType && b.value > 0);
    return buff?.value || 0;
  }, []);

  // Periodically refetch achievement buffs
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAchievementBuffs();
    }, ACHIEVEMENT_BUFFS_REFETCH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAchievementBuffs]);

  // Calculate max hitpoints from hitpoints skill level + equipment bonus (scaled by COMBAT_HP_SCALE)
  const maxHitpoints = useMemo(() => {
    const hpBonus = getTotalEquipmentBonus(equipment, itemModifications).hitpointsBonus || 0;
    let maxHp = ((skills.hitpoints?.level || 10) * COMBAT_HP_SCALE) + hpBonus;
    // Apply maxHpBoost buff if active
    const maxHpBoostBuff = activeBuffs.find(b => b.effectType === "maxHpBoost" && b.expiresAt > Date.now());
    if (maxHpBoostBuff) {
      maxHp = Math.floor(maxHp * (1 + maxHpBoostBuff.value / 100));
    }
    // Apply achievement maxHp buff (flat HP)
    const achMaxHp = getAchievementBuffValue('maxHp');
    if (achMaxHp > 0) {
      maxHp += achMaxHp;
    }
    return maxHp;
  }, [equipment, skills.hitpoints?.level, activeBuffs, getAchievementBuffValue]);
  
  // Cap current HP when max HP decreases (e.g., equipment removed or broken)
  // Only run after initial loading is complete to avoid premature capping
  useEffect(() => {
    if (isLoading) return; // Don't cap during initial load
    if (currentHitpoints > maxHitpoints) {
      setCurrentHitpoints(maxHitpoints);
      currentHitpointsRef.current = maxHitpoints;
    }
  }, [maxHitpoints, currentHitpoints, isLoading]);
  
  // Memoized combat boolean - only changes on null ↔ non-null transitions
  const isInCombat = activeCombat !== null;
  
  // Memoized status context value - only changes on language, task, or combat toggle
  const gameStatusValue = useMemo(() => ({
    language,
    activeTask,
    isInCombat,
    pendingTradeCount,
    staffRole
  }), [language, activeTask, isInCombat, pendingTradeCount, staffRole]);

  // Load player on mount - Two-phase approach:
  // Phase 1: Auth → set basic player state → hide splash immediately
  // Phase 2: When data loads → recalculate equipment bonuses, restore combat
  useEffect(() => {
    let authDataStored = false;
    let dataLoaded = false;
    
    const checkPhase2Ready = () => {
      if (authDataStored && dataLoaded) {
        setGameDataReady(true);
      }
    };
    
    async function initPlayer() {
      if (initPlayerRunningRef.current) {
        console.log('[GameContext] initPlayer already running, skipping duplicate call');
        return;
      }
      initPlayerRunningRef.current = true;
      isLoadingFromServerRef.current = true;
      try {
        // Start loading items/monsters in background (non-blocking!)
        Promise.all([
          loadItemsData(),
          loadMonstersData(),
        ]).then(() => {
          dataLoaded = true;
          checkPhase2Ready();
        }).catch(e => {
          console.warn('Data load failed:', e);
          // Still mark as loaded so we don't block forever - functions handle missing data
          dataLoaded = true;
          checkPhase2Ready();
        });

        // Auth request - use Firebase ID token (or dev endpoint in dev mode)
        let response: Response;
        
        // Check for guest session token first
        const guestSessionToken = sessionTokenRef.current || localStorage.getItem('gameSessionToken') || '';
        
        if (isDevMode) {
          const devTargetId = localStorage.getItem('devTargetPlayerId');
          const devUrl = devTargetId ? `/api/players/dev?playerId=${devTargetId}` : '/api/players/dev';
          response = await fetch(devUrl, {
            credentials: 'include',
          });
        } else if (guestSessionToken && !firebaseUser) {
          response = await fetch(`/api/players/guest-session`, {
            credentials: 'include',
            headers: {
              "x-session-token": guestSessionToken,
            },
          });
        } else if (firebaseUser) {
          const idToken = await firebaseUser.getIdToken();
          response = await fetch(`/api/players/firebase`, {
            credentials: 'include',
            headers: {
              "Authorization": `Bearer ${idToken}`,
              "x-session-token": guestSessionToken,
            },
          });
        } else {
          throw new Error("No authentication method available");
        }

        if (!response.ok) {
          throw new Error("Failed to authenticate player");
        }

        const result = await response.json();
        
        console.log('[GameContext] Login response received:', {
          hasPlayer: !!result.player,
          hasOfflineProgress: !!result.offlineProgress,
          hasCombatOfflineProgress: !!result.combatOfflineProgress,
          combatOfflineProgress: result.combatOfflineProgress,
          hasSessionToken: !!result.sessionToken,
          sessionToken: result.sessionToken ? result.sessionToken.substring(0, 8) + '...' : 'none',
        });
        
        if (result.onboardingRequired) {
          setNeedsOnboarding(true);
          setIsLoading(false);
          return;
        }
        
        const data = result.player;

        const playerIsTester = !!(data.isTester);
        setItemsTesterMode(playerIsTester);
        setMonstersTesterMode(playerIsTester);
        if (playerIsTester) {
          reloadItemsData().catch(() => {});
          reloadMonstersData().catch(() => {});
        }

        setPlayer({
          id: data.id,
          username: data.username,
          avatar: data.avatar,
          totalLevel: data.totalLevel,
          currentRegion: data.currentRegion || 'verdant',
          isTester: data.isTester || 0,
          selectedBadge: data.selectedBadge || null,
        });
        setCurrentRegionState(data.currentRegion || 'verdant');
        currentRegionRef.current = data.currentRegion || 'verdant';
        const loadedSkills = data.skills as Record<string, SkillState>;
        setSkills(loadedSkills);
        skillsRef.current = loadedSkills;
        const loadedInventory = cleanInventory((data.inventory as Record<string, number>) || {});
        setInventory(loadedInventory);
        inventoryRef.current = loadedInventory;
        
        restoreFiremakingSlots(data.firemakingSlots);
        
        setGold(data.gold ?? 0);
        goldRef.current = data.gold ?? 0;
        lastKnownServerGoldRef.current = data.gold ?? 0;
        
        if (result.onlinePlayerCount) {
          setOnlinePlayerCount(result.onlinePlayerCount);
        }
        
        // Restore language from server
        if (data.language) {
          setContextLanguage(data.language as Language);
        }
        
        // Restore isGuest from server (handle both number 1 and boolean true)
        setIsGuest(data.isGuest === 1 || data.isGuest === true);
        
        // Restore active task if it exists (no data dependency)
        if (data.activeTask) {
          setActiveTask(data.activeTask as ActiveTask);
          const restoredTask = data.activeTask as ActiveTask;
          if (restoredTask.queueExpiresAt && restoredTask.queueExpiresAt > Date.now()) {
            queueItemExpiresAtRef.current = restoredTask.queueExpiresAt;
          }
        }
        
        if (data.taskQueue && Array.isArray(data.taskQueue)) {
          setTaskQueue(data.taskQueue as QueueItem[]);
          taskQueueRef.current = data.taskQueue as QueueItem[];
        }
        
        fetch('/api/queue', { credentials: 'include', headers: result.sessionToken ? { 'x-session-token': result.sessionToken } : {} })
          .then(r => r.ok ? r.json() : null)
          .then(qData => {
            if (qData?.isV2) {
              setIsQueueV2(true);
              if (qData.maxTimeMs) setMaxQueueTimeMsTotal(qData.maxTimeMs);
            } else {
              setIsQueueV2(false);
              if (qData?.maxSlots) setMaxQueueSlotsCount(qData.maxSlots);
            }
            if (qData?.queue && Array.isArray(qData.queue)) {
              setTaskQueue(qData.queue as QueueItem[]);
              taskQueueRef.current = qData.queue as QueueItem[];
            }
          })
          .catch(() => {});
        
        // Restore active travel if it exists
        if (data.activeTravel) {
          setActiveTravel(data.activeTravel as ActiveTravel);
          activeTravelRef.current = data.activeTravel as ActiveTravel;
        }
        
        // Restore equipment (set state immediately, bonuses calculated later)
        if (data.equipment) {
          const loadedEquipment = data.equipment as Record<EquipmentSlot, string | null>;
          setEquipment(loadedEquipment);
          equipmentRef.current = loadedEquipment;
        }
        
        // Restore equipment durability if it exists
        if (data.equipmentDurability) {
          const loadedDurability = data.equipmentDurability as Record<string, number>;
          setEquipmentDurability(loadedDurability);
          equipmentDurabilityRef.current = loadedDurability;
        }
        
        // Restore inventory durability if it exists
        if (data.inventoryDurability) {
          const loadedDurability = data.inventoryDurability as Record<string, number>;
          setInventoryDurability(loadedDurability);
          inventoryDurabilityRef.current = loadedDurability;
        }
        
        // Restore active buffs and filter out expired ones
        if (data.activeBuffs && Array.isArray(data.activeBuffs)) {
          const now = Date.now();
          const validBuffs = (data.activeBuffs as ActiveBuff[]).filter(buff => buff.expiresAt > now);
          setActiveBuffs(validBuffs);
          activeBuffsRef.current = validBuffs;
        }
        
        // Restore weapon masteries from server
        const loadedMasteries: PlayerMasteries = {
          masteryDagger: data.masteryDagger ?? 0,
          masterySwordShield: data.masterySwordShield ?? 0,
          mastery2hSword: data.mastery2hSword ?? 0,
          mastery2hAxe: data.mastery2hAxe ?? 0,
          mastery2hWarhammer: data.mastery2hWarhammer ?? 0,
          masteryBow: data.masteryBow ?? 0,
          masteryStaff: data.masteryStaff ?? 0,
        };
        setMasteries(loadedMasteries);
        masteriesRef.current = loadedMasteries;

        // Load item modifications (enhancements) in background
        getAsyncAuthHeaders(false).then(authHdrs => {
          fetch("/api/enhancements", { credentials: "include", headers: authHdrs })
            .then(res => res.ok ? res.json() : null)
            .then(enhData => {
              if (enhData?.itemModifications) {
                setItemModifications(enhData.itemModifications);
                itemModificationsRef.current = enhData.itemModifications;
              }
              if (enhData?.cursedItems) {
                setCursedItems(enhData.cursedItems);
                cursedItemsRef.current = enhData.cursedItems;
              }
            })
            .catch(() => {});
        });

        // Load active (accepted) daily quests for progress tracking
        getAsyncAuthHeaders(false).then(authHdrs => {
          fetch("/api/daily-quests/active", { credentials: "include", headers: authHdrs })
            .then(res => res.ok ? res.json() : null)
            .then(questData => {
              if (questData?.quests) {
                activeDailyQuestsRef.current = questData.quests;
              }
            })
            .catch(() => {});
        });

        fetchAchievementBuffs();
        
        // Show offline progress popup if there's progress to show
        // Note: offlineProgress is at root level of response (result), not inside player (data)
        let offlineDialogShown = false;
        if (result.offlineProgress || result.combatOfflineProgress || result.firemakingOfflineProgress) {
          // Get timestamp from progress to detect duplicate - use 0 if not available
          // Combat has offlineStartTime, task may have offlineStartTime field
          const combatProg = result.combatOfflineProgress as CombatOfflineProgress | undefined;
          const taskProg = result.offlineProgress as OfflineProgress | undefined;
          const progressTimestamp = combatProg?.offlineStartTime || taskProg?.offlineStartTime || 0;
          
          console.log('[GameContext] Offline progress check:', {
            hasProgress: true,
            progressTimestamp,
            lastShownTimestamp: lastShownProgressTimestampRef.current,
            willShow: progressTimestamp !== lastShownProgressTimestampRef.current,
            playerDied: combatProg?.playerDied,
          });
          
          // Only show if this is new progress (different timestamp than last shown)
          // CRITICAL: Treat timestamp 0 as "always new" to avoid blocking valid progress
          if (progressTimestamp === 0 || progressTimestamp !== lastShownProgressTimestampRef.current) {
            // Fail-safe: only show popup if there's actual meaningful content
            if (hasActualOfflineContent(taskProg, combatProg, result.firemakingOfflineProgress)) {
              hasShownOfflineProgressRef.current = true;
              lastShownProgressTimestampRef.current = progressTimestamp;
              offlineDialogShown = true;
              
              let hasMythicToShow = false;
              if (result.offlineProgress) {
                setOfflineProgress(result.offlineProgress as OfflineProgress);
                
                const offProg = result.offlineProgress as OfflineProgress;
                if (offProg.mythicCrafts && offProg.mythicCrafts.length > 0) {
                  setPendingMythicCrafts(prev => [...prev, ...offProg.mythicCrafts!]);
                  hasMythicToShow = true;
                }
              }
              
              if (result.combatOfflineProgress) {
                const combatProg = result.combatOfflineProgress as CombatOfflineProgress;
                setCombatOfflineProgress(combatProg);
                
                if (combatProg.mythicDrops && combatProg.mythicDrops.length > 0) {
                  setPendingMythicDrops(prev => [...prev, ...combatProg.mythicDrops!]);
                  hasMythicToShow = true;
                }
              }
              
              if (result.firemakingOfflineProgress) {
                setFiremakingOfflineProgress(result.firemakingOfflineProgress);
              }
              
              if (result.offlineAchievements) {
                setOfflineAchievements(result.offlineAchievements);
              }
              if (result.offlineQueueSteps) {
                setOfflineQueueSteps(result.offlineQueueSteps);
              }
              
              if (hasMythicToShow) {
                deferredShowOfflineDialogRef.current = true;
              } else {
                setShowOfflineDialog(true);
              }
            } else {
              console.log('[GameContext] Skipping empty offline progress popup (no meaningful content)');
              if (!hasShownCommunityPopupRef.current) {
                hasShownCommunityPopupRef.current = true;
                setTimeout(() => setShowCommunityPopup(true), 1000);
              }
            }
          }
        } else {
          console.log('[GameContext] No offline progress in response, playerHP:', data.currentHitpoints);
          if (!hasShownCommunityPopupRef.current) {
            hasShownCommunityPopupRef.current = true;
            setTimeout(() => setShowCommunityPopup(true), 1000);
          }
        }
        
        
        // FALLBACK: If player HP is 0 and no offline dialog was shown, show a toast notification
        // This handles edge cases where offline combat death might not have been displayed
        if (data.currentHitpoints <= 0 && !offlineDialogShown) {
          console.log('[GameContext] FALLBACK: Player HP is 0 but no offline dialog shown');
          setTimeout(() => {
            toast({
              title: t(language, 'youDied'),
              description: t(language, 'eatFoodToRecover'),
              variant: "destructive",
            });
          }, 500);
        }
        
        // Store session token for concurrent login detection (also in localStorage for page reloads)
        // Note: sessionToken is at root level of response (result), not inside player (data)
        if (result.sessionToken) {
          sessionTokenRef.current = result.sessionToken;
          localStorage.setItem('gameSessionToken', result.sessionToken);
          // SINGLE SESSION: Broadcast new session to close other tabs in same browser
          sessionChannelRef.current?.postMessage({ type: 'NEW_SESSION', token: result.sessionToken });
        }
        
        // Store pending data for Phase 2 (data-dependent operations)
        const dataVersion = data.dataVersion ?? 2;
        // Update the dataVersion ref with server's version
        dataVersionRef.current = Math.max(dataVersionRef.current, dataVersion);
        pendingPlayerDataRef.current = {
          equipment: data.equipment as Record<EquipmentSlot, string | null>,
          currentHitpoints: data.currentHitpoints,
          activeCombat: data.activeCombat as ActiveCombat,
          skills: data.skills as Record<string, SkillState>,
          dataVersion,
          playerId: data.id,
        };
        
        // Set initial HP WITH equipment bonus (use data.equipment directly, not useMemo)
        if (data.currentHitpoints !== undefined) {
          const hpLevel = (data.skills as Record<string, SkillState>).hitpoints?.level || 10;
          const needsMigration = dataVersion < 2;
          let hp = data.currentHitpoints;
          if (needsMigration) {
            hp = hp * COMBAT_HP_SCALE;
          }
          // Include equipment bonus in max HP calculation
          const equipData = data.equipment as Record<EquipmentSlot, string | null> || {};
          const hpBonus = getTotalEquipmentBonus(equipData, itemModificationsRef.current).hitpointsBonus || 0;
          const maxHpWithBonus = (hpLevel * COMBAT_HP_SCALE) + hpBonus;
          setCurrentHitpoints(Math.min(maxHpWithBonus, Math.max(0, hp)));
          currentHitpointsRef.current = Math.min(maxHpWithBonus, Math.max(0, hp));
        }
        
        // Mark auth data as stored, trigger Phase 2 if data is also loaded
        authDataStored = true;
        checkPhase2Ready();

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error("Failed to initialize player:", error);
        toastRef.current({
          title: t(language, 'error'),
          description: `${t(language, 'playerDataLoadFailed')} (${errorMsg})`,
          variant: "destructive",
        });
      } finally {
        initPlayerRunningRef.current = false;
        isLoadingFromServerRef.current = false;
        setIsLoading(false);
      }
    }

    if (firebaseLoading) return;
    
    const hasGuestSession = !!(sessionTokenRef.current || localStorage.getItem('gameSessionToken'));
    
    if (isDevMode || firebaseUser || hasGuestSession) {
      initPlayer();
    }
  }, [firebaseUser, firebaseLoading, isDevMode]);
  
  // Phase 2: Process data-dependent operations when game data is ready
  useEffect(() => {
    if (!gameDataReady || !pendingPlayerDataRef.current) return;
    
    const pending = pendingPlayerDataRef.current;
    pendingPlayerDataRef.current = null; // Clear to prevent re-running
    
    try {
      const { equipment: pendingEquip, currentHitpoints: savedHp, activeCombat: savedCombat, skills: savedSkills, dataVersion, playerId } = pending;
      const needsMigration = (dataVersion ?? 1) < 2;
      
      // Recalculate HP with equipment bonus now that items are loaded
      if (savedHp !== undefined && pendingEquip && savedSkills) {
        const hpLevel = savedSkills.hitpoints?.level || 10;
        const hpBonus = getTotalEquipmentBonus(pendingEquip, itemModificationsRef.current).hitpointsBonus || 0;
        const maxHp = (hpLevel * COMBAT_HP_SCALE) + hpBonus;
        let hp = savedHp;
        if (needsMigration) {
          hp = hp * COMBAT_HP_SCALE;
        }
        setCurrentHitpoints(Math.min(maxHp, Math.max(0, hp)));
      }
      
      // Restore active combat now that monsters are loaded
      if (savedCombat) {
        const combat = { ...savedCombat };
        let scaledMaxHp = combat.monsterMaxHp;
        if (!scaledMaxHp) {
          const monster = getMonsterById(combat.monsterId);
          if (monster) {
            scaledMaxHp = monster.maxHitpoints * COMBAT_HP_SCALE;
          }
        }
        
        // Ensure limitExpiresAt exists for existing combat data
        if (!combat.limitExpiresAt) {
          combat.limitExpiresAt = Date.now() + IDLE_LIMIT_MS;
        }
        
        if (scaledMaxHp) {
          if (needsMigration) {
            combat.monsterCurrentHp = combat.monsterCurrentHp * COMBAT_HP_SCALE;
          }
          // If monster HP is 0 or below (died before refresh), reset to full HP
          if (combat.monsterCurrentHp <= 0) {
            combat.monsterCurrentHp = scaledMaxHp;
          } else {
            combat.monsterCurrentHp = Math.min(combat.monsterCurrentHp, scaledMaxHp);
          }
          setActiveCombat(combat);
          activeCombatRef.current = combat;
          
          // Restore combat debuffs if present - update both ref and state
          if (combat.combatDebuffs && Array.isArray(combat.combatDebuffs) && combat.combatDebuffs.length > 0) {
            // Filter out expired debuffs
            const now = Date.now();
            const validDebuffs = combat.combatDebuffs.filter(d => d && d.expiresAt > now);
            combatDebuffsRef.current = validDebuffs;
            setCombatDebuffs(validDebuffs);
          }
        }
      }
      
      // Trigger migration save if needed
      if (needsMigration && playerId) {
        console.log("Migrating player data from version 1 to version 2 (10x HP scale)");
        setTimeout(async () => {
          try {
            await fetch(`/api/players/${playerId}`, {
              method: "PATCH",
              headers: getAuthHeaders(),
              credentials: 'include',
              body: JSON.stringify({
                currentHitpoints: currentHitpointsRef.current,
                activeCombat: activeCombatRef.current,
                dataVersion: dataVersionRef.current,
              }),
            });
            console.log("Migration save completed successfully");
          } catch (err) {
            console.error("Migration save failed:", err);
          }
        }, 100);
      }
    } catch (error) {
      console.error("Phase 2 data processing failed:", error);
      toast({
        title: t(language, 'warningTitle'),
        description: t(language, 'combatDataLoadError'),
        variant: "destructive",
      });
      // Clear combat state to prevent issues
      setActiveCombat(null);
      activeCombatRef.current = null;
      setCombatDebuffs([]);
      combatDebuffsRef.current = [];
    }
  }, [gameDataReady, toast]);

  // Track if we've already shown the offline progress popup this session
  const hasShownOfflineProgressRef = useRef(false);
  // Track the timestamp of the last shown offline progress to prevent re-showing same progress
  // Initialize to -1 so that even 0-timestamp progress (from legacy/invalid paths) is shown once
  const lastShownProgressTimestampRef = useRef<number>(-1);
  
  // Periodic offline progress check - shows offline progress popup when visibility change doesn't fire
  // NOTE: Session invalidation is now handled by BroadcastChannel (same browser) and 401 handling (different device)
  useEffect(() => {
    // Skip if session is already invalidated
    if (sessionInvalidated) return;
    
    const checkSession = async () => {
      const token = sessionTokenRef.current;
      if (!token || !playerRef.current) return;
      
      try {
        const headers = await getAsyncAuthHeaders(false);
        const response = await fetch(`/api/players/check-session?token=${token}`, {
          credentials: 'include',
          headers
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Session invalidation is now handled by 401 on save - just log here
          if (!data.valid && data.reason === "session_invalidated") {
            console.log('[CheckSession] Session invalidated - will be caught on next save');
            return; // Don't process further, save will handle logout
          }
          
          // Handle pending offline progress (combat or task) returned from check-session
          // Show popup only ONCE per session - when offline progress first arrives
          // This prevents repeated popups while user is actively playing
          if (data.valid && (data.combatOfflineProgress || data.offlineProgress) && !hasShownOfflineProgressRef.current) {
            const combatProg = data.combatOfflineProgress as CombatOfflineProgress | undefined;
            const taskProg = data.offlineProgress as OfflineProgress | undefined;
            const progressTimestamp = combatProg?.offlineStartTime || taskProg?.offlineStartTime || 0;
            
            // Only show if this is new progress (different timestamp than last shown)
            // CRITICAL: Treat timestamp 0 as "always new" - don't block progress just because
            // a previous progress also had timestamp 0 (this happens in edge cases with missing data)
            if (progressTimestamp === 0 || progressTimestamp !== lastShownProgressTimestampRef.current) {
              hasShownOfflineProgressRef.current = true;
              lastShownProgressTimestampRef.current = progressTimestamp;
              console.log('[GameContext] CheckSession returned offline progress, syncing full state from server');
              
              // CRITICAL: Sync full player state from server to prevent stale client data
              // This handles cases where visibility change didn't fire (common on mobile PWA)
              let hasMythicToShowCS = false;
              try {
                isLoadingFromServerRef.current = true;
                setIsCalculatingOfflineProgress(true);
                
                const syncResponse = await fetch(`/api/players/firebase?isSync=true`, {
                  credentials: 'include',
                  headers: {
                    ...headers,
                    'x-session-token': sessionTokenRef.current || '',
                  }
                });
                
                if (syncResponse.ok) {
                  const syncResult = await syncResponse.json();
                  const syncData = syncResult.player;
                  
                  // CRITICAL: Update session token FIRST, outside if(syncData) block
                  if (syncResult.sessionToken) {
                    sessionTokenRef.current = syncResult.sessionToken;
                    localStorage.setItem('gameSessionToken', syncResult.sessionToken);
                  }
                  
                  if (syncData) {
                    // Update all state from server
                    if (syncData.skills) {
                      const loadedSkills = syncData.skills as Record<string, SkillState>;
                      setSkills(loadedSkills);
                      skillsRef.current = loadedSkills;
                    }
                    if (syncData.inventory) {
                      const loadedInventory = cleanInventory((syncData.inventory as Record<string, number>) || {});
                      setInventory(loadedInventory);
                      inventoryRef.current = loadedInventory;
                    }
                    if (syncData.gold !== undefined) {
                      setGold(syncData.gold);
                      goldRef.current = syncData.gold;
                      lastKnownServerGoldRef.current = syncData.gold;
                    }
                    isDirtyRef.current = false;
                    if (syncData.currentHitpoints !== undefined) {
                      setCurrentHitpoints(syncData.currentHitpoints);
                      currentHitpointsRef.current = syncData.currentHitpoints;
                    }
                    if (syncData.activeTask !== undefined) {
                      setActiveTask(syncData.activeTask as ActiveTask | null);
                      activeTaskRef.current = syncData.activeTask as ActiveTask | null;
                      const t = syncData.activeTask as ActiveTask | null;
                      if (t?.queueExpiresAt && t.queueExpiresAt > Date.now()) {
                        queueItemExpiresAtRef.current = t.queueExpiresAt;
                      }
                    }
                    if (syncData.activeTravel !== undefined) {
                      setActiveTravel(syncData.activeTravel as ActiveTravel | null);
                      activeTravelRef.current = syncData.activeTravel as ActiveTravel | null;
                    }
                    if (syncData.activeCombat !== undefined) {
                      setActiveCombat(syncData.activeCombat as ActiveCombat | null);
                      activeCombatRef.current = syncData.activeCombat as ActiveCombat | null;
                    }
                    if (syncData.taskQueue !== undefined) {
                      setTaskQueue((syncData.taskQueue as QueueItem[]) || []);
                      taskQueueRef.current = (syncData.taskQueue as QueueItem[]) || [];
                    }
                    if (syncData.equipment) {
                      const loadedEquipment = syncData.equipment as Record<EquipmentSlot, string | null>;
                      setEquipment(loadedEquipment);
                      equipmentRef.current = loadedEquipment;
                    }
                    if (syncData.equipmentDurability) {
                      const loadedDurability = syncData.equipmentDurability as Record<string, number>;
                      setEquipmentDurability(loadedDurability);
                      equipmentDurabilityRef.current = loadedDurability;
                    }
                    if (syncData.inventoryDurability) {
                      const loadedDurability = syncData.inventoryDurability as Record<string, number>;
                      setInventoryDurability(loadedDurability);
                      inventoryDurabilityRef.current = loadedDurability;
                    }
                    if (syncData.activeBuffs && Array.isArray(syncData.activeBuffs)) {
                      const now = Date.now();
                      const validBuffs = (syncData.activeBuffs as ActiveBuff[]).filter(buff => buff.expiresAt > now);
                      setActiveBuffs(validBuffs);
                      activeBuffsRef.current = validBuffs;
                    }
                    if (syncData.itemModifications) {
                      setItemModifications(syncData.itemModifications);
                      itemModificationsRef.current = syncData.itemModifications;
                    }
                    if (syncData.firemakingSlots) {
                      const slotsArray = Array.isArray(syncData.firemakingSlots) ? syncData.firemakingSlots : Object.values(syncData.firemakingSlots);
                      const padded: (BurningSlot | null)[] = [null, null, null, null, null, null];
                      for (let i = 0; i < Math.min(slotsArray.length, 6); i++) {
                        padded[i] = slotsArray[i] || null;
                      }
                      setFiremakingSlots(padded);
                      firemakingSlotsRef.current = padded;
                    }
                    if (syncData.dataVersion !== undefined) {
                      dataVersionRef.current = Math.max(dataVersionRef.current, syncData.dataVersion);
                    }
                  }
                  
                  // Use offline progress from sync response if available, otherwise fall back to check-session data
                  // CRITICAL: Sync calls (isSync=true) don't return offline progress since it was already consumed
                  // So we must use the original combatProg/taskProg from check-session as fallback
                  const freshCombatProg = syncResult.combatOfflineProgress as CombatOfflineProgress | undefined;
                  const freshTaskProg = syncResult.offlineProgress as OfflineProgress | undefined;
                  
                  // Use fresh data if available, otherwise fall back to original check-session data
                  const finalCombatProg = freshCombatProg || combatProg;
                  const finalTaskProg = freshTaskProg || taskProg;
                  
                  if (finalCombatProg) {
                    setCombatOfflineProgress(finalCombatProg);
                    if (finalCombatProg.mythicDrops && finalCombatProg.mythicDrops.length > 0) {
                      setPendingMythicDrops(prev => [...prev, ...finalCombatProg.mythicDrops!]);
                      hasMythicToShowCS = true;
                    }
                  }
                  if (finalTaskProg) {
                    setOfflineProgress(finalTaskProg);
                    if (finalTaskProg.mythicCrafts && finalTaskProg.mythicCrafts.length > 0) {
                      setPendingMythicCrafts(prev => [...prev, ...finalTaskProg.mythicCrafts!]);
                      hasMythicToShowCS = true;
                    }
                  }
                }
              } catch (syncError) {
                console.error('[GameContext] Failed to sync state from server:', syncError);
                if (combatProg) {
                  setCombatOfflineProgress(combatProg);
                  if (combatProg.mythicDrops && combatProg.mythicDrops.length > 0) {
                    setPendingMythicDrops(prev => [...prev, ...combatProg.mythicDrops!]);
                    hasMythicToShowCS = true;
                  }
                }
                if (taskProg) {
                  setOfflineProgress(taskProg);
                  if (taskProg.mythicCrafts && taskProg.mythicCrafts.length > 0) {
                    setPendingMythicCrafts(prev => [...prev, ...taskProg.mythicCrafts!]);
                    hasMythicToShowCS = true;
                  }
                }
              } finally {
                isLoadingFromServerRef.current = false;
                setIsCalculatingOfflineProgress(false);
              }
              
              if (data.firemakingOfflineProgress) {
                setFiremakingOfflineProgress(data.firemakingOfflineProgress);
              }
              
              if (data.offlineAchievements) {
                setOfflineAchievements(data.offlineAchievements);
              }
              if (data.offlineQueueSteps) {
                setOfflineQueueSteps(data.offlineQueueSteps);
              }
              
              if (hasActualOfflineContent(taskProg, combatProg, data.firemakingOfflineProgress)) {
                if (hasMythicToShowCS) {
                  deferredShowOfflineDialogRef.current = true;
                } else {
                  setShowOfflineDialog(true);
                }
              } else {
                console.log('[GameContext] CheckSession: skipping empty offline progress popup');
              }
            }
          }
        }
      } catch (error) {
        console.error("Session check failed:", error);
      }
    };
    
    // Check every 60 seconds for offline progress only (session validation removed)
    // Session invalidation is now handled by BroadcastChannel + 401 on save
    const interval = setInterval(checkSession, 120000);
    
    // Also check immediately if player is already loaded
    if (playerRef.current) {
      checkSession();
    }
    
    return () => clearInterval(interval);
  }, [sessionInvalidated, player]);

  const completeOnboarding = useCallback(async () => {
    setNeedsOnboarding(false);
    setIsLoading(true);
    // Re-fetch player data after onboarding using Firebase ID token
    if (!firebaseUser) {
      setIsLoading(false);
      return;
    }
    const idToken = await firebaseUser.getIdToken();
    const existingToken = sessionTokenRef.current || localStorage.getItem('gameSessionToken') || '';
    fetch(`/api/players/firebase`, {
      credentials: 'include',
      headers: { 
        "Authorization": `Bearer ${idToken}`,
        "x-session-token": existingToken,
      },
    })
      .then(res => res.json())
      .then(result => {
        const data = result.player;
        if (data) {
          setPlayer({
            id: data.id,
            username: data.username,
            avatar: data.avatar,
            totalLevel: data.totalLevel,
            currentRegion: data.currentRegion || 'verdant',
            isTester: data.isTester || 0,
            selectedBadge: data.selectedBadge || null,
          });
          setCurrentRegionState(data.currentRegion || 'verdant');
          currentRegionRef.current = data.currentRegion || 'verdant';
          const loadedSkills = data.skills as Record<string, SkillState>;
          setSkills(loadedSkills);
          skillsRef.current = loadedSkills;
          const loadedInventory = cleanInventory((data.inventory as Record<string, number>) || {});
          setInventory(loadedInventory);
          inventoryRef.current = loadedInventory;
          
          restoreFiremakingSlots(data.firemakingSlots);
          
          setGold(data.gold ?? 0);
          goldRef.current = data.gold ?? 0;
          lastKnownServerGoldRef.current = data.gold ?? 0;
          // Store session token for concurrent login detection (also in localStorage)
          // Note: sessionToken is at root level of response (result), not inside player (data)
          if (result.sessionToken) {
            sessionTokenRef.current = result.sessionToken;
            localStorage.setItem('gameSessionToken', result.sessionToken);
            // SINGLE SESSION: Broadcast new session to close other tabs in same browser
            sessionChannelRef.current?.postMessage({ type: 'NEW_SESSION', token: result.sessionToken });
          }
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Guest login - creates a new guest account without Firebase auth
  const guestLogin = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/guest-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ language }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Guest login failed');
      }

      const result = await response.json();
      const data = result.player;

      if (data) {
        setPlayer({
          id: data.id,
          username: data.username,
          avatar: data.avatar,
          totalLevel: data.totalLevel,
          currentRegion: data.currentRegion || 'verdant',
          isTester: data.isTester || 0,
          selectedBadge: data.selectedBadge || null,
        });
        setCurrentRegionState(data.currentRegion || 'verdant');
        currentRegionRef.current = data.currentRegion || 'verdant';
        const loadedSkills = data.skills as Record<string, SkillState>;
        setSkills(loadedSkills);
        skillsRef.current = loadedSkills;
        const loadedInventory = cleanInventory((data.inventory as Record<string, number>) || {});
        setInventory(loadedInventory);
        inventoryRef.current = loadedInventory;
        
        restoreFiremakingSlots(data.firemakingSlots);
        
        setGold(data.gold ?? 0);
        goldRef.current = data.gold ?? 0;
        lastKnownServerGoldRef.current = data.gold ?? 0;
        setIsGuest(true);
        setNeedsOnboarding(false);

        if (result.sessionToken) {
          sessionTokenRef.current = result.sessionToken;
          localStorage.setItem('gameSessionToken', result.sessionToken);
          sessionChannelRef.current?.postMessage({ type: 'NEW_SESSION', token: result.sessionToken });
        }
      }
    } catch (error) {
      console.error('Guest login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [language]);

  // Convert guest account to registered account (requires Firebase auth)
  const convertGuestAccount = useCallback(async (username: string) => {
    if (!firebaseUser) {
      throw new Error('Firebase authentication required');
    }

    const guestPlayerId = playerRef.current?.id;
    const guestSessionToken = sessionTokenRef.current;

    if (!guestPlayerId || !guestSessionToken) {
      throw new Error('Guest session not found');
    }

    const idToken = await firebaseUser.getIdToken();
    const response = await fetch('/api/auth/convert-guest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      credentials: 'include',
      body: JSON.stringify({ guestPlayerId, guestSessionToken, username }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Account conversion failed');
    }

    const result = await response.json();
    const data = result.player;

    if (data) {
      setPlayer({
        id: data.id,
        username: data.username,
        avatar: data.avatar,
        totalLevel: data.totalLevel,
        currentRegion: data.currentRegion || 'verdant',
        isTester: data.isTester || 0,
        selectedBadge: data.selectedBadge || null,
      });
      setIsGuest(false);

      if (result.sessionToken) {
        sessionTokenRef.current = result.sessionToken;
        localStorage.setItem('gameSessionToken', result.sessionToken);
        sessionChannelRef.current?.postMessage({ type: 'NEW_SESSION', token: result.sessionToken });
      }
    }
  }, [firebaseUser]);

  // Save function that uses refs (doesn't depend on state)
  const saveToServer = useCallback(async () => {
    const currentPlayer = playerRef.current;
    const currentDebugMode = debugModeRef.current;
    
    if (!currentPlayer || currentDebugMode) return;
    
    // CRITICAL: Don't save while loading fresh data from server after visibility change
    // This prevents client's stale inventory from overwriting scheduler's offline progress
    if (isLoadingFromServerRef.current) {
      return;
    }
    
    const versionAtSaveStart = saveVersionRef.current;

    // Calculate current total level
    const currentTotalLevel = Object.values(skillsRef.current).reduce((sum, s) => sum + s.level, 0);

    try {
      // Include current debuffs with activeCombat for proper persistence
      const saveNow = Date.now();
      const activeCombatWithDebuffs = activeCombatRef.current ? {
        ...activeCombatRef.current,
        lastClientTick: saveNow,
        limitExpiresAt: saveNow + IDLE_LIMIT_MS,
        combatDebuffs: combatDebuffsRef.current
      } : null;
      
      // Include lastClientTick with activeTask for scheduler takeover (same as combat)
      const activeTaskWithTick = activeTaskRef.current ? {
        ...activeTaskRef.current,
        lastClientTick: saveNow,
        limitExpiresAt: saveNow + IDLE_LIMIT_MS,
      } : null;
      
      // Build headers - add Firebase auth and session token
      const headers: Record<string, string> = getAuthHeaders();
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          headers["Authorization"] = `Bearer ${idToken}`;
        } catch (e) {
          console.error("Failed to get Firebase token for save:", e);
        }
      }
      
      flushDailyQuestProgress();
      
      const response = await fetch(`/api/players/${currentPlayer.id}`, {
        method: "PATCH",
        headers,
        credentials: 'include',
        body: JSON.stringify({
          skills: skillsRef.current,
          inventory: inventoryRef.current,
          gold: goldRef.current,
          lastKnownServerGold: lastKnownServerGoldRef.current,
          activeTask: activeTaskWithTick,
          totalLevel: currentTotalLevel,
          currentHitpoints: currentHitpointsRef.current,
          activeCombat: activeCombatWithDebuffs,
          equipment: equipmentRef.current,
          equipmentDurability: equipmentDurabilityRef.current,
          inventoryDurability: inventoryDurabilityRef.current,
          activeBuffs: activeBuffsRef.current,
          dataVersion: dataVersionRef.current,
          masteryDagger: masteriesRef.current.masteryDagger,
          masterySwordShield: masteriesRef.current.masterySwordShield,
          mastery2hSword: masteriesRef.current.mastery2hSword,
          mastery2hAxe: masteriesRef.current.mastery2hAxe,
          mastery2hWarhammer: masteriesRef.current.mastery2hWarhammer,
          masteryBow: masteriesRef.current.masteryBow,
          masteryStaff: masteriesRef.current.masteryStaff,
          firemakingSlots: firemakingSlotsRef.current,
          itemModifications: itemModificationsRef.current,
          taskQueue: taskQueueRef.current,
        }),
      });
      
      if (response.ok) {
        if (saveVersionRef.current === versionAtSaveStart) {
          isDirtyRef.current = false;
        }
        lastKnownServerGoldRef.current = goldRef.current;
      }

      if (response.status === 409) {
        const data = await response.json().catch(() => ({}));
        if (data.requiresReload || data.serverDataVersion) {
          console.log('[Save] Data version mismatch (trade/admin) - reloading data from server');
          try {
            if (firebaseUser) {
              const idToken = await firebaseUser.getIdToken();
              const refreshRes = await fetch(`/api/players/firebase?isSync=true`, {
                credentials: 'include',
                headers: {
                  "Authorization": `Bearer ${idToken}`,
                  "x-session-token": sessionTokenRef.current || '',
                },
              });
              if (refreshRes.ok) {
                const result = await refreshRes.json();
                const d = result.player;
                if (d) {
                  const loadedInv = cleanInventory((d.inventory as Record<string, number>) || {});
                  setInventory(loadedInv);
                  inventoryRef.current = loadedInv;
                  if (d.gold !== undefined) {
                    setGold(d.gold);
                    goldRef.current = d.gold;
                    lastKnownServerGoldRef.current = d.gold;
                  }
                  if (d.itemModifications) {
                    setItemModifications(d.itemModifications);
                    itemModificationsRef.current = d.itemModifications;
                  }
                  if (d.inventoryDurability) {
                    const loadedDurability = (d.inventoryDurability || {}) as Record<string, number>;
                    setInventoryDurability(loadedDurability);
                    inventoryDurabilityRef.current = loadedDurability;
                  }
                  if (d.dataVersion !== undefined) {
                    dataVersionRef.current = d.dataVersion;
                  }
                  isDirtyRef.current = false;
                }
              }
            }
          } catch (e) {
            console.error('[Save] Failed to reload after version mismatch:', e);
          }
        }
      }
      
      // SINGLE SESSION: Handle 401 session invalidated
      if (response.status === 401) {
        const data = await response.json().catch(() => ({}));
        if (data.reason === "session_invalidated") {
          console.log('[Save] Session invalidated - another session is active');
          setSessionInvalidated(true);
          localStorage.removeItem('gameSessionToken');
          toast({
            title: t(language, 'sessionEnded'),
            description: t(language, 'anotherDeviceLogin'),
            variant: "destructive",
          });
          // Sign out of Firebase to prevent auto-login, then redirect
          try {
            await firebaseLogout();
          } catch (e) {
            console.error('[Save] Firebase logout error:', e);
          }
          window.location.href = "/";
        }
      }
    } catch (error) {
      console.error("Failed to save player data:", error);
    }
  }, [firebaseUser, firebaseLogout, getAuthHeaders, language, toast]); // Depends on firebaseUser for auth

  // Save combat state immediately (bypasses regular save throttle)
  // Used when combat starts or for important state changes
  // Track the latest client tick for scheduler coordination
  const lastClientTickRef = useRef<number>(Date.now());
  const pendingCombatSaveRef = useRef<ActiveCombat | null | undefined>(undefined); // undefined = no pending
  const combatSaveInProgressRef = useRef<boolean>(false);
  const throttleFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const saveCombatState = useCallback(async (combatData: ActiveCombat | null) => {
    const currentPlayer = playerRef.current;
    const currentDebugMode = debugModeRef.current;
    
    if (!currentPlayer || currentDebugMode) return;
    
    if (isLoadingFromServerRef.current) {
      return;
    }
    
    const now = Date.now();
    lastClientTickRef.current = now;
    
    if (combatSaveInProgressRef.current) {
      pendingCombatSaveRef.current = combatData;
      return;
    }
    
    const timeSinceLastSave = now - lastCombatSaveRef.current;
    if (timeSinceLastSave < COMBAT_SAVE_THROTTLE) {
      pendingCombatSaveRef.current = combatData;
      
      if (!throttleFlushTimerRef.current) {
        const remainingTime = COMBAT_SAVE_THROTTLE - timeSinceLastSave + 100;
        throttleFlushTimerRef.current = setTimeout(() => {
          throttleFlushTimerRef.current = null;
          if (pendingCombatSaveRef.current !== undefined) {
            const pending = pendingCombatSaveRef.current;
            pendingCombatSaveRef.current = undefined;
            saveCombatState(pending);
          }
        }, remainingTime);
      }
      return;
    }
    
    if (throttleFlushTimerRef.current) {
      clearTimeout(throttleFlushTimerRef.current);
      throttleFlushTimerRef.current = null;
    }
    
    lastCombatSaveRef.current = now;
    combatSaveInProgressRef.current = true;
    pendingCombatSaveRef.current = undefined;

    try {
      const combatWithTick = combatData ? { 
        ...combatData, 
        lastClientTick: lastClientTickRef.current,
        combatDebuffs: combatDebuffsRef.current 
      } : null;
      
      await fetch(`/api/players/${currentPlayer.id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          activeCombat: combatWithTick,
          currentHitpoints: currentHitpointsRef.current,
          dataVersion: dataVersionRef.current,
        }),
      });
    } catch (error) {
      console.error("Failed to save combat state:", error);
    } finally {
      combatSaveInProgressRef.current = false;
    }
  }, []);

  // Auto-save every 120 seconds with dirty flag optimization
  // CRITICAL: Skip auto-save when tab is hidden to prevent resetting lastClientTick
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden && isDirtyRef.current) {
        isDirtyRef.current = false;
        saveToServer();
      }
    }, 120000);

    return () => clearInterval(interval);
  }, [saveToServer]);

  // Save on unmount/page close with proper Content-Type
  // Uses sessionTokenRef for sendBeacon auth (sendBeacon can't send custom headers)
  useEffect(() => {
    const handleBeforeUnload = () => {
      const currentPlayer = playerRef.current;
      const currentDebugMode = debugModeRef.current;
      
      if (currentPlayer && !currentDebugMode) {
        const currentTotalLevel = Object.values(skillsRef.current).reduce((sum, s) => sum + s.level, 0);
        const beaconNow = Date.now();
        // Include current debuffs with activeCombat for proper persistence
        const activeCombatWithDebuffs = activeCombatRef.current ? {
          ...activeCombatRef.current,
          lastClientTick: beaconNow,
          limitExpiresAt: beaconNow + IDLE_LIMIT_MS,
          combatDebuffs: combatDebuffsRef.current
        } : null;
        // Include lastClientTick with activeTask for scheduler takeover (same as combat)
        const activeTaskWithTick = activeTaskRef.current ? {
          ...activeTaskRef.current,
          lastClientTick: beaconNow,
          limitExpiresAt: beaconNow + IDLE_LIMIT_MS,
        } : null;
        
        // Build data with sessionToken for Firebase auth (sendBeacon can't send headers)
        const saveData: Record<string, any> = {
          skills: skillsRef.current,
          inventory: inventoryRef.current,
          gold: goldRef.current,
          lastKnownServerGold: lastKnownServerGoldRef.current,
          activeTask: activeTaskWithTick,
          totalLevel: currentTotalLevel,
          currentHitpoints: currentHitpointsRef.current,
          activeCombat: activeCombatWithDebuffs,
          equipment: equipmentRef.current,
          equipmentDurability: equipmentDurabilityRef.current,
          inventoryDurability: inventoryDurabilityRef.current,
          dataVersion: dataVersionRef.current,
          taskQueue: taskQueueRef.current,
        };
        
        // Add sessionToken for Firebase users (sendBeacon can't use Authorization header)
        if (sessionTokenRef.current) {
          saveData.sessionToken = sessionTokenRef.current;
        }
        
        const data = JSON.stringify(saveData);
        
        // Use Blob with proper Content-Type for sendBeacon
        // sendBeacon only supports POST requests, so we use /save endpoint
        const blob = new Blob([data], { type: 'application/json' });
        navigator.sendBeacon(`/api/players/${currentPlayer.id}/save`, blob);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    
    // Also add pagehide for mobile browsers (more reliable than beforeunload on iOS/Android)
    window.addEventListener("pagehide", handleBeforeUnload);
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, []);

  const tabHiddenTimeRef = useRef<number | null>(null);
  const OFFLINE_THRESHOLD_MS = 3000;
  // CRITICAL: Flag to prevent saves while loading fresh data from server after visibility change
  // This prevents client's stale inventory from overwriting scheduler's offline progress
  const isLoadingFromServerRef = useRef<boolean>(false);

  // Electron environment detection - userAgent contains "Electron" in desktop app builds
  const isElectron = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);
  // Track whether the Electron window is currently blurred/minimized so heartbeat can be paused
  const isElectronBlurredRef = useRef<boolean>(false);
  
  // Save when tab becomes hidden (user switches to another tab)
  // This ensures lastClientTick is updated so scheduler can take over
  // When tab becomes visible again after being hidden for a while, reload data from server
  useEffect(() => {
    // Shared helper: called when the app goes "offline" (tab hidden OR Electron window minimized/blurred).
    // Saves state immediately and fires a beacon to set lastLogoutAt on the server.
    const handleGoOffline = () => {
      tabHiddenTimeRef.current = Date.now();
      const currentPlayer = playerRef.current;
      const currentDebugMode = debugModeRef.current;

      if (currentPlayer && !currentDebugMode) {
        const now = Date.now();
        // Update lastClientTick to current time before saving
        lastClientTickRef.current = now;

        // Force save combat state if in combat
        if (activeCombatRef.current) {
          saveCombatState(activeCombatRef.current);
        }

        // Update task's lastClientTick if task is active
        if (activeTaskRef.current) {
          const updatedTask = { ...activeTaskRef.current, lastClientTick: now };
          activeTaskRef.current = updatedTask;
          setActiveTask(updatedTask);
        }

        // Also save general game state (includes the updated task)
        saveToServer();

        // Also fire save beacon to set lastLogoutAt for server-authoritative offline progress
        const currentTotalLevel = Object.values(skillsRef.current).reduce((sum, s) => sum + s.level, 0);
        const activeCombatWithDebuffs = activeCombatRef.current ? {
          ...activeCombatRef.current,
          lastClientTick: now,
          limitExpiresAt: now + IDLE_LIMIT_MS,
          combatDebuffs: combatDebuffsRef.current
        } : null;
        const activeTaskWithTick = activeTaskRef.current ? {
          ...activeTaskRef.current,
          lastClientTick: now,
          limitExpiresAt: now + IDLE_LIMIT_MS,
        } : null;
        const beaconData: Record<string, any> = {
          skills: skillsRef.current,
          inventory: inventoryRef.current,
          gold: goldRef.current,
          lastKnownServerGold: lastKnownServerGoldRef.current,
          activeTask: activeTaskWithTick,
          totalLevel: currentTotalLevel,
          currentHitpoints: currentHitpointsRef.current,
          activeCombat: activeCombatWithDebuffs,
          equipment: equipmentRef.current,
          equipmentDurability: equipmentDurabilityRef.current,
          inventoryDurability: inventoryDurabilityRef.current,
          dataVersion: dataVersionRef.current,
          itemModifications: itemModificationsRef.current,
        };
        if (sessionTokenRef.current) {
          beaconData.sessionToken = sessionTokenRef.current;
        }
        const beaconBlob = new Blob([JSON.stringify(beaconData)], { type: 'application/json' });
        navigator.sendBeacon(`/api/players/${currentPlayer.id}/save`, beaconBlob);
      }
    };

    // Shared helper: called when the app comes "online" (tab visible OR Electron window restored/focused).
    // Fetches offline progress from server and shows the dialog if offline duration exceeded the threshold.
    const handleComeOnline = async (logTag: string) => {
      const currentPlayer = playerRef.current;
      const currentDebugMode = debugModeRef.current;
      const hiddenTime = tabHiddenTimeRef.current;
      tabHiddenTimeRef.current = null;

      if (currentPlayer && !currentDebugMode && hiddenTime) {
        const offlineDuration = Date.now() - hiddenTime;

        // Reset offline progress flag on EVERY visibility change
        // This allows new offline progress from this hidden period to be shown
        // Previously only reset for long periods, causing short (2-5s) offline progress to be missed
        hasShownOfflineProgressRef.current = false;

        // If hidden for more than threshold, fetch offline progress from server
        if (offlineDuration >= OFFLINE_THRESHOLD_MS) {

          // CRITICAL: Block saves until we've loaded fresh data from server
          // This prevents stale client inventory from overwriting scheduler's offline progress
          isLoadingFromServerRef.current = true;

          // Show loading indicator while calculating offline progress
          setIsCalculatingOfflineProgress(true);

          try {
            let response: Response;

            const currentFirebaseUser = auth.currentUser;
            if (currentFirebaseUser) {
              let idToken: string | undefined;
              try {
                idToken = await currentFirebaseUser.getIdToken();
              } catch (tokenErr) {
                console.error(`[GameContext][${logTag}] getIdToken failed, retrying in 1s:`, tokenErr);
                await new Promise(r => setTimeout(r, 1000));
                try {
                  idToken = await currentFirebaseUser.getIdToken(true);
                } catch (retryErr) {
                  console.error(`[GameContext][${logTag}] getIdToken retry failed:`, retryErr);
                }
              }
              if (!idToken) {
                console.error(`[GameContext][${logTag}] Could not get Firebase token for offline sync - offline progress will be lost`);
                isLoadingFromServerRef.current = false;
                setIsCalculatingOfflineProgress(false);
                return;
              }

              response = await fetch(`/api/players/firebase?isSync=true`, {
                credentials: 'include',
                headers: {
                  "Authorization": `Bearer ${idToken}`,
                  "x-session-token": sessionTokenRef.current || '',
                },
              });
            } else {
              const guestToken = sessionTokenRef.current || localStorage.getItem('gameSessionToken') || '';
              if (!guestToken) {
                console.error(`[GameContext][${logTag}] No session token for guest offline sync`);
                isLoadingFromServerRef.current = false;
                setIsCalculatingOfflineProgress(false);
                return;
              }
              response = await fetch(`/api/players/guest-session?isSync=true`, {
                credentials: 'include',
                headers: {
                  "x-session-token": guestToken,
                },
              });
            }

            if (response.ok) {
              const result = await response.json();
              const data = result.player;

              // CRITICAL: Update session token FIRST, outside if(data) block
              // This ensures token is updated even if player data is missing
              if (result.sessionToken) {
                sessionTokenRef.current = result.sessionToken;
                localStorage.setItem('gameSessionToken', result.sessionToken);
              }

              // Update local state with COMPLETE server data
              if (data) {
                // Update player metadata
                setPlayer({
                  id: data.id,
                  username: data.username,
                  avatar: data.avatar,
                  totalLevel: data.totalLevel,
                  currentRegion: data.currentRegion || 'verdant',
                  isTester: data.isTester || 0,
                  selectedBadge: data.selectedBadge || null,
                });
                playerRef.current = {
                  id: data.id,
                  username: data.username,
                  avatar: data.avatar,
                  totalLevel: data.totalLevel,
                  currentRegion: data.currentRegion || 'verdant',
                  isTester: data.isTester || 0,
                  selectedBadge: data.selectedBadge || null,
                };
                setCurrentRegionState(data.currentRegion || 'verdant');
                currentRegionRef.current = data.currentRegion || 'verdant';

                // Update skills
                if (data.skills) {
                  const loadedSkills = data.skills as Record<string, SkillState>;
                  setSkills(loadedSkills);
                  skillsRef.current = loadedSkills;
                }

                if (data.inventory) {
                  const loadedInventory = cleanInventory((data.inventory as Record<string, number>) || {});
                  setInventory(loadedInventory);
                  inventoryRef.current = loadedInventory;
                }

                if (data.gold !== undefined) {
                  setGold(data.gold);
                  goldRef.current = data.gold;
                  lastKnownServerGoldRef.current = data.gold;
                }

                isDirtyRef.current = false;

                if (data.currentHitpoints !== undefined) {
                  setCurrentHitpoints(data.currentHitpoints);
                  currentHitpointsRef.current = data.currentHitpoints;
                }

                if (data.activeTask !== undefined) {
                  let restoredTask = data.activeTask as ActiveTask | null;
                  if (restoredTask && restoredTask.startTime && restoredTask.duration > 0) {
                    const now2 = Date.now();
                    const elapsed = now2 - restoredTask.startTime;
                    if (elapsed > restoredTask.duration) {
                      const cyclePosition = elapsed % restoredTask.duration;
                      restoredTask = { ...restoredTask, startTime: now2 - cyclePosition };
                    }
                  }
                  setActiveTask(restoredTask);
                  activeTaskRef.current = restoredTask;
                  const t = restoredTask;
                  if (t?.queueExpiresAt && t.queueExpiresAt > Date.now()) {
                    queueItemExpiresAtRef.current = t.queueExpiresAt;
                  }
                }

                if (data.activeTravel !== undefined) {
                  setActiveTravel(data.activeTravel as ActiveTravel | null);
                  activeTravelRef.current = data.activeTravel as ActiveTravel | null;
                }

                if (data.activeCombat !== undefined) {
                  setActiveCombat(data.activeCombat as ActiveCombat | null);
                  activeCombatRef.current = data.activeCombat as ActiveCombat | null;
                }

                if (data.equipment) {
                  const loadedEquipment = data.equipment as Record<EquipmentSlot, string | null>;
                  setEquipment(loadedEquipment);
                  equipmentRef.current = loadedEquipment;
                }

                if (data.equipmentDurability) {
                  const loadedDurability = data.equipmentDurability as Record<string, number>;
                  setEquipmentDurability(loadedDurability);
                  equipmentDurabilityRef.current = loadedDurability;
                }

                if (data.inventoryDurability) {
                  const loadedDurability = data.inventoryDurability as Record<string, number>;
                  setInventoryDurability(loadedDurability);
                  inventoryDurabilityRef.current = loadedDurability;
                }

                if (data.activeBuffs && Array.isArray(data.activeBuffs)) {
                  const now = Date.now();
                  const validBuffs = (data.activeBuffs as ActiveBuff[]).filter(buff => buff.expiresAt > now);
                  setActiveBuffs(validBuffs);
                  activeBuffsRef.current = validBuffs;
                }

                if (data.firemakingSlots) {
                  const slotsArray = Array.isArray(data.firemakingSlots) ? data.firemakingSlots : Object.values(data.firemakingSlots);
                  const padded: (BurningSlot | null)[] = [null, null, null, null, null, null];
                  for (let i = 0; i < Math.min(slotsArray.length, 6); i++) {
                    padded[i] = slotsArray[i] || null;
                  }
                  setFiremakingSlots(padded);
                  firemakingSlotsRef.current = padded;
                }

                if (data.itemModifications) {
                  setItemModifications(data.itemModifications);
                  itemModificationsRef.current = data.itemModifications;
                }

                if (data.dataVersion !== undefined) {
                  dataVersionRef.current = Math.max(dataVersionRef.current, data.dataVersion);
                }

                // Show offline progress dialog if there's progress
                // Mark as shown to prevent duplicate popups from check-session interval
                if (result.offlineProgress || result.combatOfflineProgress || result.firemakingOfflineProgress) {
                  // Get timestamp from progress to detect duplicate - use 0 if not available
                  const combatProg = result.combatOfflineProgress as CombatOfflineProgress | undefined;
                  const taskProg = result.offlineProgress as OfflineProgress | undefined;
                  const progressTimestamp = combatProg?.offlineStartTime || taskProg?.offlineStartTime || 0;

                  if (progressTimestamp === 0 || progressTimestamp !== lastShownProgressTimestampRef.current) {
                    hasShownOfflineProgressRef.current = true;
                    lastShownProgressTimestampRef.current = progressTimestamp;

                    if (hasActualOfflineContent(taskProg, combatProg, result.firemakingOfflineProgress)) {
                      let hasMythicVis = false;
                      if (taskProg) {
                        setOfflineProgress(taskProg);

                        if (taskProg.mythicCrafts && taskProg.mythicCrafts.length > 0) {
                          setPendingMythicCrafts(prev => [...prev, ...taskProg.mythicCrafts!]);
                          hasMythicVis = true;
                        }
                      }

                      if (combatProg) {
                        setCombatOfflineProgress(combatProg);

                        if (combatProg.mythicDrops && combatProg.mythicDrops.length > 0) {
                          setPendingMythicDrops(prev => [...prev, ...combatProg.mythicDrops!]);
                          hasMythicVis = true;
                        }
                      }

                      if (result.firemakingOfflineProgress) {
                        setFiremakingOfflineProgress(result.firemakingOfflineProgress);
                      }

                      if (result.offlineAchievements) {
                        setOfflineAchievements(result.offlineAchievements);
                      }
                      if (result.offlineQueueSteps) {
                        setOfflineQueueSteps(result.offlineQueueSteps);
                      }

                      if (hasMythicVis) {
                        deferredShowOfflineDialogRef.current = true;
                      } else {
                        setShowOfflineDialog(true);
                      }
                    } else {
                      console.log(`[GameContext][${logTag}] skipping empty offline progress popup`);
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error(`[GameContext][${logTag}] Failed to fetch offline progress:`, error);
          } finally {
            // CRITICAL: Always re-enable saves after loading attempt completes
            isLoadingFromServerRef.current = false;
            // Hide loading indicator when done
            setIsCalculatingOfflineProgress(false);
          }
        }
      }
    };

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        // Tab is now hidden - save immediately so scheduler knows client is offline
        handleGoOffline();
      } else {
        // Tab is now visible again
        await handleComeOnline('Visibility');
      }
    };

    // PWA fallback: pageshow fires when page is restored from bfcache
    // This is more reliable than visibilitychange on mobile PWAs
    const handlePageShow = async (event: PageTransitionEvent) => {
      // event.persisted means page was restored from bfcache
      const currentFirebaseUser = auth.currentUser;
      if (event.persisted && playerRef.current && currentFirebaseUser && !debugModeRef.current) {
        console.log('[GameContext] pageshow event (bfcache restore) - forcing offline sync');
        
        // Reset the offline progress flag to allow showing popup
        hasShownOfflineProgressRef.current = false;
        
        // Block saves while syncing
        isLoadingFromServerRef.current = true;
        setIsCalculatingOfflineProgress(true);
        
        try {
          const idToken = await currentFirebaseUser.getIdToken();
          const response = await fetch(`/api/players/firebase?isSync=true`, {
            credentials: 'include',
            headers: {
              "Authorization": `Bearer ${idToken}`,
              "x-session-token": sessionTokenRef.current || '',
            },
          });
          
          if (response.ok) {
            const result = await response.json();
            const data = result.player;
            
            // CRITICAL: Update session token FIRST before any other state updates
            // This ensures the token is updated even if subsequent state updates fail
            if (result.sessionToken) {
              sessionTokenRef.current = result.sessionToken;
              localStorage.setItem('gameSessionToken', result.sessionToken);
            }
            
            if (data) {
              // Update all state from server
              if (data.skills) {
                const loadedSkills = data.skills as Record<string, SkillState>;
                setSkills(loadedSkills);
                skillsRef.current = loadedSkills;
              }
              if (data.inventory && !isDirtyRef.current) {
                const loadedInventory = cleanInventory((data.inventory as Record<string, number>) || {});
                setInventory(loadedInventory);
                inventoryRef.current = loadedInventory;
              }
              if (data.gold !== undefined && !isDirtyRef.current) {
                setGold(data.gold);
                goldRef.current = data.gold;
                lastKnownServerGoldRef.current = data.gold;
              }
              if (data.currentHitpoints !== undefined) {
                setCurrentHitpoints(data.currentHitpoints);
                currentHitpointsRef.current = data.currentHitpoints;
              }
              if (data.activeTask !== undefined) {
                let restoredTaskPs = data.activeTask as ActiveTask | null;
                if (restoredTaskPs && restoredTaskPs.startTime && restoredTaskPs.duration > 0) {
                  const now3 = Date.now();
                  const elapsed3 = now3 - restoredTaskPs.startTime;
                  if (elapsed3 > restoredTaskPs.duration) {
                    const cyclePos3 = elapsed3 % restoredTaskPs.duration;
                    restoredTaskPs = { ...restoredTaskPs, startTime: now3 - cyclePos3 };
                  }
                }
                setActiveTask(restoredTaskPs);
                activeTaskRef.current = restoredTaskPs;
                const t = restoredTaskPs;
                if (t?.queueExpiresAt && t.queueExpiresAt > Date.now()) {
                  queueItemExpiresAtRef.current = t.queueExpiresAt;
                }
              }
              if (data.activeTravel !== undefined) {
                setActiveTravel(data.activeTravel as ActiveTravel | null);
                activeTravelRef.current = data.activeTravel as ActiveTravel | null;
              }
              if (data.activeCombat !== undefined) {
                setActiveCombat(data.activeCombat as ActiveCombat | null);
                activeCombatRef.current = data.activeCombat as ActiveCombat | null;
              }
              if (data.equipment) {
                const loadedEquipment = data.equipment as Record<EquipmentSlot, string | null>;
                setEquipment(loadedEquipment);
                equipmentRef.current = loadedEquipment;
              }
              if (data.equipmentDurability) {
                const loadedDurability = data.equipmentDurability as Record<string, number>;
                setEquipmentDurability(loadedDurability);
                equipmentDurabilityRef.current = loadedDurability;
              }
              if (data.inventoryDurability) {
                const loadedDurability = data.inventoryDurability as Record<string, number>;
                setInventoryDurability(loadedDurability);
                inventoryDurabilityRef.current = loadedDurability;
              }
              if (data.activeBuffs && Array.isArray(data.activeBuffs)) {
                const now = Date.now();
                const validBuffs = (data.activeBuffs as ActiveBuff[]).filter(buff => buff.expiresAt > now);
                setActiveBuffs(validBuffs);
                activeBuffsRef.current = validBuffs;
              }
              
              // Update dataVersion to match server
              if (data.dataVersion !== undefined) {
                dataVersionRef.current = Math.max(dataVersionRef.current, data.dataVersion);
              }
            }
              
            // Show offline progress if available
            if (result.offlineProgress || result.combatOfflineProgress || result.firemakingOfflineProgress) {
              const combatProg = result.combatOfflineProgress as CombatOfflineProgress | undefined;
              const taskProg = result.offlineProgress as OfflineProgress | undefined;
              const progressTimestamp = combatProg?.offlineStartTime || taskProg?.offlineStartTime || 0;
              
              if (progressTimestamp === 0 || progressTimestamp !== lastShownProgressTimestampRef.current) {
                hasShownOfflineProgressRef.current = true;
                lastShownProgressTimestampRef.current = progressTimestamp;
                
                if (hasActualOfflineContent(taskProg, combatProg, result.firemakingOfflineProgress)) {
                  let hasMythicPS = false;
                  if (taskProg) {
                    setOfflineProgress(taskProg);
                    if (taskProg.mythicCrafts && taskProg.mythicCrafts.length > 0) {
                      setPendingMythicCrafts(prev => [...prev, ...taskProg.mythicCrafts!]);
                      hasMythicPS = true;
                    }
                  }
                  if (combatProg) {
                    setCombatOfflineProgress(combatProg);
                    if (combatProg.mythicDrops && combatProg.mythicDrops.length > 0) {
                      setPendingMythicDrops(prev => [...prev, ...combatProg.mythicDrops!]);
                      hasMythicPS = true;
                    }
                  }
                  if (result.firemakingOfflineProgress) {
                    setFiremakingOfflineProgress(result.firemakingOfflineProgress);
                  }
                  
                  if (result.offlineAchievements) {
                    setOfflineAchievements(result.offlineAchievements);
                  }
                  if (result.offlineQueueSteps) {
                    setOfflineQueueSteps(result.offlineQueueSteps);
                  }
                  
                  if (hasMythicPS) {
                    deferredShowOfflineDialogRef.current = true;
                  } else {
                    setShowOfflineDialog(true);
                  }
                } else {
                  console.log('[GameContext] Pageshow: skipping empty offline progress popup');
                }
              }
            }
          }
        } catch (error) {
          console.error('[GameContext] pageshow sync failed:', error);
        } finally {
          isLoadingFromServerRef.current = false;
          setIsCalculatingOfflineProgress(false);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);

    // Electron-specific: window blur/focus events fire when the desktop window is
    // minimized or loses focus, unlike browser tabs which use visibilitychange.
    // Delegates to the same shared helpers so behavior stays identical.
    const handleElectronBlur = () => {
      if (!isElectron) return;
      isElectronBlurredRef.current = true;
      handleGoOffline();
    };

    const handleElectronFocus = async () => {
      if (!isElectron) return;
      isElectronBlurredRef.current = false;
      await handleComeOnline('ElectronFocus');
    };

    if (isElectron) {
      window.addEventListener("blur", handleElectronBlur);
      window.addEventListener("focus", handleElectronFocus);
    }
    
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      if (isElectron) {
        window.removeEventListener("blur", handleElectronBlur);
        window.removeEventListener("focus", handleElectronFocus);
      }
    };
  }, [saveToServer, saveCombatState, firebaseUser]);

  // Execute the actual task start logic
  const executeStartTask = useCallback(async (skillId: string, actionId: number, duration: number, name: string, xpReward: number, requiredBait?: string, baitAmount?: number, materials?: { itemId: string; quantity: number }[], itemId?: string, targetQuantity?: number) => {
    if (hasActiveDungeonRunRef.current) {
      toast({
        title: "Error",
        description: "Cannot start tasks while in a dungeon. Complete or leave the dungeon first.",
        variant: "destructive",
      });
      return;
    }
    // Auto-stop combat if active
    if (activeCombatRef.current) {
      setActiveCombat(null);
      activeCombatRef.current = null;
    }
    // Check if bait is required and available
    if (requiredBait && baitAmount && !debugModeRef.current) {
      const currentBait = inventoryRef.current[requiredBait] || 0;
      if (currentBait < baitAmount) {
        toast({
          title: t(language, 'baitRequiredTitle'),
          description: t(language, 'activityRequiresX').replace('{0}', String(baitAmount)).replace('{1}', requiredBait),
          variant: "destructive",
        });
        return;
      }
    }
    
    // Apply guild bonus to duration
    const gatheringSkills = ['woodcutting', 'mining', 'fishing'];
    const craftingSkills = ['crafting', 'cooking', 'fletching', 'alchemy'];
    let effectiveDuration = duration;
    
    if (gatheringSkills.includes(skillId)) {
      const gatheringSpeedBonus = guildBonusesRef.current?.gatheringBonus || 0;
      effectiveDuration = Math.floor(duration * (1 - gatheringSpeedBonus / 100));
    } else if (craftingSkills.includes(skillId)) {
      const craftingSpeedBonus = guildBonusesRef.current?.craftingBonus || 0;
      effectiveDuration = Math.floor(duration * (1 - craftingSpeedBonus / 100));
    }
    
    const now = Date.now();
    // Reset session items tracking when starting new task
    sessionItemsRef.current = {};
    const newTask: ActiveTask = {
      skillId,
      actionId,
      startTime: now,
      duration: effectiveDuration,
      name,
      xpReward,
      requiredBait,
      baitAmount,
      limitExpiresAt: now + IDLE_LIMIT_MS,
      materials,
      lastClientTick: now, // For scheduler takeover tracking
      itemId, // Item produced by this task (for hunting, different from action name)
      targetQuantity, // Target quantity to produce (0 or undefined = infinite)
      producedCount: 0, // Start at 0 items produced
    };
    setActiveTask(newTask);
    // Update ref immediately so save uses latest data
    activeTaskRef.current = newTask;
    // AWAIT save when task starts - critical for offline progress and state sync
    await saveToServer();
  }, [toast, saveToServer]);

  const startTask = useCallback(async (skillId: string, actionId: number, duration: number, name: string, xpReward: number, requiredBait?: string, baitAmount?: number, materials?: { itemId: string; quantity: number }[], itemId?: string, targetQuantity?: number) => {
    // Players can now do tasks while in a party - no party leave required for skill activities
    await executeStartTask(skillId, actionId, duration, name, xpReward, requiredBait, baitAmount, materials, itemId, targetQuantity);
  }, [executeStartTask]);


  const stopTask = useCallback(async (isFiremakingPause?: boolean, skipQueueAdvance?: boolean) => {
    // Show session summary if items were collected using toast (not item notification to avoid conflict with combat loot)
    const sessionItems = sessionItemsRef.current;
    const itemEntries = Object.entries(sessionItems);
    if (itemEntries.length > 0) {
      const totalItems = itemEntries.reduce((sum, [, qty]) => sum + qty, 0);
      // Format items nicely: group by rarity for crafted items
      const itemList = itemEntries.map(([name, qty]) => `${qty}x ${name}`).join(", ");
      toast({
        title: t(language, "taskSummary"),
        description: t(language, "materialsCollected").replace("{0}", String(totalItems)).replace("{1}", itemList),
      });
    }
    // Reset session items
    sessionItemsRef.current = {};
    // Note: pendingMythicCrafts are NOT reset here - they're handled by MythicCraftPopup component
    if (activeTaskRef.current?.skillId === "firemaking" && !isFiremakingPause) {
      setFiremakingSlots([null, null, null, null, null, null]);
      firemakingSlotsRef.current = [null, null, null, null, null, null];
    }
    setActiveTask(null);
    // Update ref immediately so save uses latest data
    activeTaskRef.current = null;
    // Reset queue expiry so interval auto-start logic isn't blocked
    queueItemExpiresAtRef.current = 0;
    // AWAIT save when task stops (ensures task state is cleared on server)
    await saveToServer();

    // If not pausing queue and there are pending items, advance to next
    if (!skipQueueAdvance && !pauseQueueOnCancelRef.current && taskQueueRef.current.length > 0) {
      await popAndStartNextRef.current();
    } else if (pauseQueueOnCancelRef.current && taskQueueRef.current.length > 0) {
      // Mark queue as paused so the resume button appears in the queue sheet
      setIsQueuePaused(true);
      isQueuePausedRef.current = true;
    }
  }, [toast, saveToServer]);

  const resetTaskTimer = useCallback(async () => {
    if (!playerRef.current) return;
    
    try {
      const response = await fetch('/api/tasks/reset', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        // Update both task and combat timers if they exist
        setActiveTask(prev => {
          if (!prev) return null;
          const updated = { ...prev, limitExpiresAt: data.limitExpiresAt };
          activeTaskRef.current = updated;
          return updated;
        });
        setActiveCombat(prev => {
          if (!prev) return null;
          const updated = { ...prev, limitExpiresAt: data.limitExpiresAt };
          activeCombatRef.current = updated;
          return updated;
        });
        toast({
          title: t(language, "timerRefreshed"),
          description: t(language, "idleTimerReset"),
        });
      }
    } catch (error) {
      console.error("Error resetting task timer:", error);
    }
  }, [toast]);

  // Study system - consume equipment items to gain Smithing XP
  const startStudy = useCallback(async (itemId: string) => {
    // Check if item can be studied
    const studyInfo = getStudyInfo(itemId);
    if (!studyInfo) {
      toast({
        title: t(language, "cannotStudy"),
        description: t(language, "cannotStudyDesc"),
        variant: "destructive",
      });
      return;
    }

    // Check if player has the item
    const currentInventory = inventoryRef.current;
    const itemCount = currentInventory[itemId] || 0;
    if (itemCount < 1) {
      toast({
        title: t(language, "notEnoughItems"),
        description: t(language, "noItemInInventory"),
        variant: "destructive",
      });
      return;
    }

    // Auto-stop combat if active
    if (activeCombatRef.current) {
      setActiveCombat(null);
      activeCombatRef.current = null;
    }

    const now = Date.now();
    sessionItemsRef.current = {};

    // Create study task - skillId is "studying", name is the item being studied
    const newTask: ActiveTask = {
      skillId: "studying",
      actionId: 0,
      startTime: now,
      duration: STUDY_DURATION,
      name: itemId, // Store the full item ID with rarity
      xpReward: studyInfo.studyXp,
      limitExpiresAt: now + IDLE_LIMIT_MS,
      materials: [{ itemId: itemId, quantity: 1 }], // The item being consumed
      lastClientTick: now, // For scheduler takeover tracking
    };

    setActiveTask(newTask);
    activeTaskRef.current = newTask;
    // AWAIT save for study task
    await saveToServer();

    toast({
      title: t(language, "learningStarted"),
      description: t(language, "studyingItem").replace("{0}", itemId).replace("{1}", String(studyInfo.studyXp)),
    });
  }, [toast, saveToServer]);

  // Salvage system - instantly convert equipment to Metal Scrap
  const salvageItem = useCallback((itemId: string, quantity: number): { scrapGained: number; success: boolean } => {
    const salvageInfo = getSalvageInfo(itemId);
    if (!salvageInfo) {
      toast({
        title: t(language, "cannotRecycle"),
        description: t(language, "cannotRecycleDesc"),
        variant: "destructive",
      });
      return { scrapGained: 0, success: false };
    }

    const currentInventory = inventoryRef.current;
    const availableCount = currentInventory[itemId] || 0;
    if (availableCount < quantity) {
      toast({
        title: t(language, "notEnoughItems"),
        description: t(language, "onlyXAvailable").replace("{0}", String(availableCount)).replace("{1}", itemId),
        variant: "destructive",
      });
      return { scrapGained: 0, success: false };
    }

    // Calculate total scrap from salvaging
    let totalScrap = 0;
    for (let i = 0; i < quantity; i++) {
      totalScrap += calculateSalvageScrap(itemId);
    }

    // Update inventory - remove items and add scrap
    setInventory(prev => {
      const newInventory = { ...prev };
      
      // Remove salvaged items
      const newCount = (newInventory[itemId] || 0) - quantity;
      if (newCount <= 0) {
        delete newInventory[itemId];
      } else {
        newInventory[itemId] = newCount;
      }
      
      // Add Ore Essence
      newInventory["ore_essence"] = (newInventory["ore_essence"] || 0) + totalScrap;
      
      inventoryRef.current = newInventory;
      return newInventory;
    });

    // Also remove from inventory durability if it was a damaged item
    if (hasInstanceSuffix(itemId)) {
      setInventoryDurability(prev => {
        const newDurability = { ...prev };
        delete newDurability[itemId];
        inventoryDurabilityRef.current = newDurability;
        return newDurability;
      });
    }

    saveToServer();

    toast({
      title: t(language, "recyclingComplete"),
      description: `${quantity}x ${formatItemIdAsName(itemId)} → ${totalScrap}x ${t(language, "oreEssence")}`,
    });

    return { scrapGained: totalScrap, success: true };
  }, [toast, saveToServer]);
  
  // Combat functions
  const startCombat = useCallback(async (monsterId: string, monsterHp: number, monsterData?: {
    maxHp: number;
    attackLevel: number;
    strengthLevel: number;
    defenceLevel: number;
    attackBonus?: number;
    strengthBonus?: number;
    attackSpeed: number;
    loot: { itemId: string; chance: number; minQty: number; maxQty: number }[];
    xpReward: { attack: number; strength: number; defence: number; hitpoints: number };
    skills?: MonsterSkill[];
  }) => {
    // Cannot start combat with 0 HP - must eat food first
    if (currentHitpointsRef.current <= 0) {
      return;
    }

    if (hasActiveDungeonRunRef.current) {
      toast({
        title: "Error",
        description: "Cannot start combat while in a dungeon. Complete or leave the dungeon first.",
        variant: "destructive",
      });
      return;
    }
    
    // Auto-stop task if active and save to server immediately
    // This prevents the bug where both mining AND combat progress are calculated offline
    if (activeTaskRef.current) {
      setActiveTask(null);
      activeTaskRef.current = null;
    }
    
    // Only reset combat loot tracking on NEW combat (not respawn)
    // If activeCombat is null, this is a new combat session
    if (!activeCombatRef.current) {
      sessionCombatLootRef.current = {};
      // Clear any lingering debuffs from previous combat sessions - update both ref and state
      combatDebuffsRef.current = [];
      setCombatDebuffs([]);
    }
    
    const now = Date.now();
    
    // Reset all combat timing refs for fresh combat start
    lastPlayerAttackTimeRef.current = 0;
    lastMonsterAttackTimeRef.current = 0;
    lastAutoEatTimeRef.current = 0;
    isProcessingRespawnRef.current = false;
    combatRngRef.current = new DeterministicRng(hashSeed(`${monsterId}_${Date.now()}`));
    lastCombatTickTimeRef.current = 0;
    combatStateRef.current = null;
    
    // Initialize combat session stats
    const newStats: CombatSessionStats = {
      monstersKilled: 0,
      foodEaten: 0,
      deaths: 0,
      loot: {},
      xpGained: {},
      startTime: now,
    };
    setCombatSessionStats(newStats);
    combatSessionStatsRef.current = newStats;
    
    // Snapshot current buff effects for offline combat
    const currentBuffEffects = {
      attackBoost: getBuffEffectRef.current("attack_boost"),
      strengthBoost: getBuffEffectRef.current("strength_boost"),
      defenceBoost: getBuffEffectRef.current("defence_boost"),
      critChance: getBuffEffectRef.current("crit_chance"),
      damageReduction: getBuffEffectRef.current("damage_reduction"),
      hpRegen: getBuffEffectRef.current("hp_regen"),
    };
    
    // Create combat data object
    const combatData: ActiveCombat = {
      monsterId,
      monsterCurrentHp: monsterHp,
      playerLastAttackTime: now,
      monsterLastAttackTime: now,
      combatStartTime: now,
      limitExpiresAt: now + IDLE_LIMIT_MS,
      // Store monster data for offline progress
      monsterMaxHp: monsterData?.maxHp,
      monsterAttackLevel: monsterData?.attackLevel,
      monsterStrengthLevel: monsterData?.strengthLevel,
      monsterDefenceLevel: monsterData?.defenceLevel,
      monsterAttackBonus: monsterData?.attackBonus,
      monsterStrengthBonus: monsterData?.strengthBonus,
      monsterAttackSpeed: monsterData?.attackSpeed,
      monsterLoot: monsterData?.loot,
      monsterXpReward: monsterData?.xpReward,
      monsterSkills: monsterData?.skills,
      // Auto-eat settings for offline combat
      autoEatEnabled,
      autoEatThreshold,
      selectedFood,
      // Auto-potion settings for offline combat
      autoPotionEnabled,
      selectedPotion,
      // Combat style and buff effects for offline combat
      combatStyle: combatStyleRef.current,
      buffEffects: currentBuffEffects,
    };
    
    setActiveCombat(combatData);
    // Update ref immediately so save uses correct data
    activeCombatRef.current = combatData;
    // AWAIT force immediate save when combat starts - critical for activity sync
    await saveCombatState(combatData);
  }, [saveCombatState, autoEatEnabled, autoEatThreshold, selectedFood, autoPotionEnabled, selectedPotion]);
  
  const stopCombat = useCallback(async (skipQueueAdvance?: boolean) => {
    // Clear any pending skill damage timeouts
    pendingSkillTimeoutsRef.current.forEach(t => clearTimeout(t));
    pendingSkillTimeoutsRef.current = [];
    
    // Show combat loot summary if there were loot drops
    const combatLoot = sessionCombatLootRef.current;
    const lootEntries = Object.entries(combatLoot);
    if (lootEntries.length > 0) {
      const totalItems = lootEntries.reduce((sum, [, qty]) => sum + qty, 0);
      const itemList = lootEntries.map(([name, qty]) => `${qty}x ${name}`).join(", ");
      toast({
        title: t(language, 'combatSummary'),
        description: t(language, 'totalLootGained').replace('{0}', String(totalItems)).replace('{1}', itemList),
      });
    }
    // Reset combat loot tracking
    sessionCombatLootRef.current = {};
    
    // Reset queue expiry so interval auto-start logic isn't blocked
    queueItemExpiresAtRef.current = 0;

    setActiveCombat(null);
    activeCombatRef.current = null;
    combatRngRef.current = null;
    combatStateRef.current = null;
    lastCombatTickTimeRef.current = 0;
    // AWAIT save null combat state immediately
    await saveCombatState(null);

    // Mirror stopTask queue logic:
    // pauseQueueOnCancel=false (default) → auto-advance to next queue item
    // pauseQueueOnCancel=true → silently pause so resume button appears in queue sheet
    // skipQueueAdvance=true → caller will handle queue manually (e.g. startQueueFromItem)
    if (!skipQueueAdvance && !pauseQueueOnCancelRef.current && taskQueueRef.current.length > 0) {
      await popAndStartNextRef.current();
    } else if (!skipQueueAdvance && pauseQueueOnCancelRef.current && taskQueueRef.current.length > 0) {
      setIsQueuePaused(true);
      isQueuePausedRef.current = true;
    }
  }, [saveCombatState, toast]);
  
  // Force clear combat state - used when UI gets stuck
  // This clears both client and server state without showing loot summary
  const forceClearCombat = useCallback(async () => {
    // Clear any pending skill damage timeouts
    pendingSkillTimeoutsRef.current.forEach(t => clearTimeout(t));
    pendingSkillTimeoutsRef.current = [];
    
    // Reset combat loot tracking silently
    sessionCombatLootRef.current = {};
    
    // Clear local state
    setActiveCombat(null);
    activeCombatRef.current = null;
    combatRngRef.current = null;
    combatStateRef.current = null;
    lastCombatTickTimeRef.current = 0;
    
    // Force save null combat state to server
    await saveCombatState(null);
    
    toast({
      title: t(language, 'combatCleared'),
      description: t(language, 'combatClearedDesc'),
    });
  }, [saveCombatState, toast, language]);
  
  const addToQueue = useCallback(async (item: Omit<QueueItem, 'id' | 'addedAt' | 'status'>): Promise<boolean> => {
    try {
      const headers = await getAsyncAuthHeaders();
      const res = await fetch('/api/queue/add', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(item),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || t(languageRef.current, 'queueAddFailed'), variant: "destructive" });
        return false;
      }
      const data = await res.json();
      if (data.queue) {
        setTaskQueue(data.queue);
        taskQueueRef.current = data.queue;
      }
      if (data.isV2) {
        if (data.maxTimeMs) setMaxQueueTimeMsTotal(data.maxTimeMs);
      } else {
        if (data.maxSlots) setMaxQueueSlotsCount(data.maxSlots);
      }
      toast({ title: t(languageRef.current, 'queueItemAdded') });
      if (!activeTaskRef.current && !activeCombatRef.current) {
        await popAndStartNextRef.current();
      }
      return true;
    } catch {
      toast({ title: t(languageRef.current, 'queueAddFailed'), variant: "destructive" });
      return false;
    }
  }, [toast, getAsyncAuthHeaders]);

  const removeFromQueueFn = useCallback(async (itemId: string) => {
    try {
      const headers = await getAsyncAuthHeaders();
      const res = await fetch(`/api/queue/${itemId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.queue) {
          setTaskQueue(data.queue);
          taskQueueRef.current = data.queue;
          if (!activeTaskRef.current && !activeCombatRef.current && data.queue.length > 0) {
            await popAndStartNextRef.current();
          }
          return;
        }
      }
    } catch {}
    const updated = taskQueueRef.current.filter(q => q.id !== itemId);
    setTaskQueue(updated);
    taskQueueRef.current = updated;
    if (!activeTaskRef.current && !activeCombatRef.current && updated.length > 0) {
      await popAndStartNextRef.current();
    }
  }, [getAsyncAuthHeaders]);

  const clearQueueFn = useCallback(async () => {
    try {
      const headers = await getAsyncAuthHeaders();
      await fetch('/api/queue/clear', {
        method: 'POST',
        credentials: 'include',
        headers,
      });
    } catch {}
    setTaskQueue([]);
    taskQueueRef.current = [];
    setQueueInterrupted(false);
    queueInterruptedRef.current = false;
    setIsQueuePaused(false);
    isQueuePausedRef.current = false;
    stopTask(undefined, true);
    stopCombat();
  }, [getAsyncAuthHeaders, stopTask, stopCombat]);

  const resumeQueueFn = useCallback(async () => {
    setQueueInterrupted(false);
    queueInterruptedRef.current = false;
    setIsQueuePaused(false);
    isQueuePausedRef.current = false;
    lastStartedQueueItemIdRef.current = null;
    await popAndStartNextRef.current();
  }, []);

  const dismissQueueInterruptFn = useCallback(() => {
    setQueueInterrupted(false);
    queueInterruptedRef.current = false;
    // Keep isQueuePaused = true so the resume button stays visible
  }, []);

  const reorderQueueItemFn = useCallback(async (itemId: string, direction: 'up' | 'down') => {
    const current = taskQueueRef.current;
    const itemOrigIdx = current.findIndex((item) => item.id === itemId);
    if (itemOrigIdx === -1 || current[itemOrigIdx].status !== 'pending') return;

    const pendingIndices = current
      .map((item, i) => (item.status === 'pending' ? i : -1))
      .filter((i) => i !== -1);
    const pendingPos = pendingIndices.indexOf(itemOrigIdx);

    if (direction === 'up' && pendingPos === 0) return;
    if (direction === 'down' && pendingPos === pendingIndices.length - 1) return;

    const swapOrigIdx = direction === 'up'
      ? pendingIndices[pendingPos - 1]
      : pendingIndices[pendingPos + 1];

    const optimistic = [...current];
    [optimistic[itemOrigIdx], optimistic[swapOrigIdx]] = [optimistic[swapOrigIdx], optimistic[itemOrigIdx]];
    setTaskQueue(optimistic);
    taskQueueRef.current = optimistic;

    try {
      const headers = await getAsyncAuthHeaders();
      const res = await fetch('/api/queue/reorder', {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ itemId, direction }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.queue) {
          setTaskQueue(data.queue);
          taskQueueRef.current = data.queue;
        }
      } else {
        setTaskQueue(current);
        taskQueueRef.current = current;
      }
    } catch {
      setTaskQueue(current);
      taskQueueRef.current = current;
    }
  }, [getAsyncAuthHeaders]);

  const updateQueueItemDurationFn = useCallback(async (itemId: string, durationMs: number): Promise<boolean> => {
    const current = taskQueueRef.current;
    const itemIdx = current.findIndex((item) => item.id === itemId);
    if (itemIdx === -1) return false;

    const optimistic = [...current];
    optimistic[itemIdx] = { ...optimistic[itemIdx], durationMs };
    setTaskQueue(optimistic);
    taskQueueRef.current = optimistic;

    try {
      const headers = await getAsyncAuthHeaders();
      const res = await fetch(`/api/queue/${itemId}/duration`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ durationMs }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.queue) {
          setTaskQueue(data.queue);
          taskQueueRef.current = data.queue;
        }
        return true;
      } else {
        setTaskQueue(current);
        taskQueueRef.current = current;
        return false;
      }
    } catch {
      setTaskQueue(current);
      taskQueueRef.current = current;
      return false;
    }
  }, [getAsyncAuthHeaders]);

  const popAndStartNextQueueItem = useCallback(async () => {
    // Mutex: prevent concurrent calls from double-popping queue items.
    // stopCombat sets activeCombatRef=null synchronously then awaits a network
    // save — a second caller seeing null refs can race in and pop another item
    // before the first caller's popAndStartNext runs, consuming items without
    // ever starting them and leaving the queue empty.
    if (isPopAndStartRunningRef.current) return;
    isPopAndStartRunningRef.current = true;
    try {
    // Clear interrupted/paused state when queue naturally advances
    if (isQueuePausedRef.current || queueInterruptedRef.current) {
      setQueueInterrupted(false);
      queueInterruptedRef.current = false;
      setIsQueuePaused(false);
      isQueuePausedRef.current = false;
    }
    const queue = taskQueueRef.current;
    if (queue.length === 0) {
      queueItemExpiresAtRef.current = 0;
      return;
    }
    
    const next = queue[0];

    // Idempotency check: prevent same queue item from being started twice (race condition guard)
    if (lastStartedQueueItemIdRef.current === next.id) {
      return;
    }
    lastStartedQueueItemIdRef.current = next.id;

    const remaining = queue.slice(1);
    setTaskQueue(remaining);
    taskQueueRef.current = remaining;
    queueItemExpiresAtRef.current = Date.now() + next.durationMs;

    if (next.type === 'skill' && next.skillId && next.recipeId) {
      const hasMaterials = !next.materials || next.materials.every(m => (inventoryRef.current[m.itemId] || 0) >= m.quantity);
      if (!hasMaterials) {
        queueItemExpiresAtRef.current = 0;
        return;
      }
      await executeStartTask(
        next.skillId,
        0,
        next.actionDuration || 3000,
        next.name,
        next.xpReward || 0,
        undefined,
        undefined,
        next.materials,
        undefined
      );
      if (activeTaskRef.current) {
        const updated = { ...activeTaskRef.current, queueDurationMs: next.durationMs, queueExpiresAt: queueItemExpiresAtRef.current };
        setActiveTask(updated);
        activeTaskRef.current = updated;
      }
    } else if (next.type === 'skill' && next.skillId && next.actionId !== undefined) {
      const hasMaterials = !next.materials || next.materials.every(m => (inventoryRef.current[m.itemId] || 0) >= m.quantity);
      if (!hasMaterials) {
        queueItemExpiresAtRef.current = 0;
        return;
      }
      await executeStartTask(
        next.skillId,
        next.actionId,
        next.actionDuration || 3000,
        next.name,
        next.xpReward || 0,
        next.requiredBait,
        next.baitAmount,
        next.materials,
        next.itemId
      );
      if (activeTaskRef.current) {
        const updated = { ...activeTaskRef.current, queueDurationMs: next.durationMs, queueExpiresAt: queueItemExpiresAtRef.current };
        setActiveTask(updated);
        activeTaskRef.current = updated;
      }
      if (next.skillId === 'firemaking' && next.requiredBait && next.actionId !== undefined) {
        const sharedStartTime = Date.now();
        const newSlots: (BurningSlot | null)[] = [null, null, null, null, null, null];
        const claimedByLog: Record<string, number> = {};

        // Helper to compute quantity with cross-slot deduction
        const computeQty = (logId: string): number => {
          const inv = inventoryRef.current[logId] || 0;
          const claimed = claimedByLog[logId] || 0;
          const available = Math.max(0, inv - claimed);
          const qty = Math.min(available, 250);
          claimedByLog[logId] = (claimedByLog[logId] || 0) + qty;
          return qty;
        };

        // Helper to compute duration with same-log slot bonus (consistent with FireMakingPage)
        const computeDuration = (logId: string, baseDuration: number, beforeSlots: (BurningSlot | null)[]): number => {
          const sameLogCount = beforeSlots.filter((s) => s?.logId === logId).length;
          return baseDuration + sameLogCount * 4000;
        };

        const primarySlotIndex = next.firemakingPrimarySlotIndex ?? 0;
        const primaryQty = computeQty(next.requiredBait);
        const primaryDuration = computeDuration(next.requiredBait, next.actionDuration || 4000, newSlots);
        const initialSlot: BurningSlot = {
          logId: next.requiredBait,
          logName: next.name,
          startTime: sharedStartTime,
          duration: primaryDuration,
          xpReward: next.xpReward || 0,
          actionId: next.actionId,
          itemId: next.itemId || '',
          quantity: primaryQty,
          burnedCount: 0,
        };
        newSlots[primarySlotIndex] = initialSlot;
        if (next.firemakingExtraSlots && next.firemakingExtraSlots.length > 0) {
          for (const extra of next.firemakingExtraSlots) {
            const extraQty = computeQty(extra.logId);
            if (extraQty === 0) continue; // skip if no inventory left
            const extraDuration = computeDuration(extra.logId, extra.actionDuration, newSlots);
            const extraSlot: BurningSlot = {
              logId: extra.logId,
              logName: extra.logName,
              startTime: sharedStartTime,
              duration: extraDuration,
              xpReward: extra.xpReward,
              actionId: extra.actionId,
              itemId: extra.itemId,
              quantity: extraQty,
              burnedCount: 0,
            };
            newSlots[extra.slotIndex] = extraSlot;
          }
        }
        setFiremakingSlots(newSlots);
        firemakingSlotsRef.current = newSlots;
      }
    } else if (next.type === 'combat' && next.monsterId && next.monsterData) {
      await startCombat(next.monsterId, next.monsterData.maxHp, next.monsterData);
      if (activeCombatRef.current) {
        const updated = { ...activeCombatRef.current, queueDurationMs: next.durationMs, queueExpiresAt: queueItemExpiresAtRef.current };
        setActiveCombat(updated);
        activeCombatRef.current = updated;
      }
    } else if (next.type === 'study' && next.studyItemId) {
      const studyItemId = next.studyItemId;
      const studyInfo = getStudyInfo(studyItemId);
      const hasItemInInventory = (inventoryRef.current[studyItemId] || 0) >= 1;
      if (studyInfo && hasItemInInventory) {
        const now = Date.now();
        const newTask: ActiveTask = {
          skillId: "studying",
          actionId: 0,
          startTime: now,
          duration: STUDY_DURATION,
          name: studyItemId,
          xpReward: next.xpReward || studyInfo.studyXp,
          limitExpiresAt: now + IDLE_LIMIT_MS,
          materials: [{ itemId: studyItemId, quantity: 1 }],
          lastClientTick: now,
          queueDurationMs: next.durationMs,
          queueExpiresAt: queueItemExpiresAtRef.current,
        };
        setActiveTask(newTask);
        activeTaskRef.current = newTask;
        await saveToServer();
      }
    }

    // If start failed (no activeTask/activeCombat set), reset expiry so the
    // queue-transition interval can immediately try the next item
    const startSucceeded = !!activeTaskRef.current || !!activeCombatRef.current;
    if (!startSucceeded) {
      queueItemExpiresAtRef.current = 0;
      return;
    }

    toast({ title: t(languageRef.current, 'queueTransition'), description: next.name });
    markDirty();
    } finally {
      isPopAndStartRunningRef.current = false;
    }
  }, [toast, markDirty, executeStartTask, startCombat, saveToServer]);

  const popAndStartNextRef = useRef(popAndStartNextQueueItem);
  popAndStartNextRef.current = popAndStartNextQueueItem;

  const startQueueFromItemFn = useCallback(async (itemId: string) => {
    const queue = taskQueueRef.current;
    const idx = queue.findIndex(q => q.id === itemId);
    if (idx < 0) return;
    const newQueue = queue.slice(idx);
    setTaskQueue(newQueue);
    taskQueueRef.current = newQueue;
    await Promise.all([stopTask(undefined, true), stopCombat(true)]);
    lastStartedQueueItemIdRef.current = null;
    try {
      const headers = await getAsyncAuthHeaders();
      const idsToRemove = queue.slice(0, idx).map(q => q.id);
      await Promise.all(
        idsToRemove.map(id =>
          fetch(`/api/queue/${id}`, { method: 'DELETE', credentials: 'include', headers })
        )
      );
    } catch {}
    await popAndStartNextQueueItem();
  }, [getAsyncAuthHeaders, stopTask, stopCombat, popAndStartNextQueueItem]);

  const startTaskWithDuration = useCallback(async (
    skillId: string, actionId: number, duration: number, name: string, xpReward: number,
    durationMs: number,
    requiredBait?: string, baitAmount?: number, materials?: { itemId: string; quantity: number }[], itemId?: string, targetQuantity?: number
  ) => {
    await executeStartTask(skillId, actionId, duration, name, xpReward, requiredBait, baitAmount, materials, itemId, targetQuantity);
    if (activeTaskRef.current) {
      const expiresAt = Date.now() + durationMs;
      queueItemExpiresAtRef.current = expiresAt;
      const updated = { ...activeTaskRef.current, queueDurationMs: durationMs, queueExpiresAt: expiresAt };
      setActiveTask(updated);
      activeTaskRef.current = updated;
      await saveToServer();
    }
  }, [executeStartTask, saveToServer]);

  const startCombatWithDuration = useCallback(async (
    monsterId: string, monsterHp: number, durationMs: number, monsterData?: any
  ) => {
    await startCombat(monsterId, monsterHp, monsterData);
    if (activeCombatRef.current) {
      const expiresAt = Date.now() + durationMs;
      queueItemExpiresAtRef.current = expiresAt;
      const updated = { ...activeCombatRef.current, queueDurationMs: durationMs, queueExpiresAt: expiresAt };
      setActiveCombat(updated);
      activeCombatRef.current = updated;
      await saveToServer();
    }
  }, [startCombat, saveToServer]);

  useEffect(() => {
    const hasQueuedItems = taskQueueRef.current.length > 0;
    const hasQueuedTask = activeTaskRef.current?.queueDurationMs;
    const hasQueuedCombat = activeCombatRef.current?.queueDurationMs;
    const hasActiveQueueExpiry = queueItemExpiresAtRef.current > 0;
    if (!hasQueuedItems && !hasQueuedTask && !hasQueuedCombat && !hasActiveQueueExpiry) return;

    const checkQueueTransition = () => {
      const now = Date.now();
      const task = activeTaskRef.current;
      const combat = activeCombatRef.current;
      const expiresAt = queueItemExpiresAtRef.current;

      if (expiresAt > 0 && now >= expiresAt) {
        queueItemExpiresAtRef.current = 0;
        if (task) {
          if (task.skillId === "firemaking") {
            setFiremakingSlots([null, null, null, null, null, null]);
            firemakingSlotsRef.current = [null, null, null, null, null, null];
          }
          setActiveTask(null);
          activeTaskRef.current = null;
        }
        if (combat) {
          setActiveCombat(null);
          activeCombatRef.current = null;
        }
        if (taskQueueRef.current.length > 0) {
          popAndStartNextQueueItem();
        }
        return;
      }

      if (task && task.queueDurationMs) {
        const taskExpiresAt = task.queueExpiresAt || 0;
        const elapsed = taskExpiresAt ? 0 : now - task.startTime;
        const expired = taskExpiresAt ? now >= taskExpiresAt : elapsed >= task.queueDurationMs;
        if (expired) {
          if (task.skillId === "firemaking") {
            setFiremakingSlots([null, null, null, null, null, null]);
            firemakingSlotsRef.current = [null, null, null, null, null, null];
          }
          setActiveTask(null);
          activeTaskRef.current = null;
          queueItemExpiresAtRef.current = 0;
          if (taskQueueRef.current.length > 0) {
            popAndStartNextQueueItem();
          }
          return;
        }
      }
      if (combat && combat.queueDurationMs) {
        const combatExpiresAt = combat.queueExpiresAt || 0;
        const elapsed = combatExpiresAt ? 0 : now - (combat.combatStartTime || now);
        const expired = combatExpiresAt ? now >= combatExpiresAt : elapsed >= combat.queueDurationMs;
        if (expired) {
          setActiveCombat(null);
          activeCombatRef.current = null;
          queueItemExpiresAtRef.current = 0;
          if (taskQueueRef.current.length > 0) {
            popAndStartNextQueueItem();
          }
          return;
        }
      }

      if (!task && !combat && taskQueueRef.current.length > 0 && expiresAt === 0 && !isQueuePausedRef.current) {
        popAndStartNextQueueItem();
      }
    };

    const interval = setInterval(checkQueueTransition, 2000);
    return () => clearInterval(interval);
  }, [taskQueue, activeTask, activeCombat, popAndStartNextQueueItem]);

  const dealDamageToMonster = useCallback((damage: number) => {
    setActiveCombat(prev => {
      if (!prev) return null;
      const newHp = Math.max(0, prev.monsterCurrentHp - damage);
      const updated = { ...prev, monsterCurrentHp: newHp, playerLastAttackTime: Date.now() };
      // Update ref immediately for throttled save
      activeCombatRef.current = updated;
      // Throttled save (will only actually save every 5 seconds)
      saveCombatState(updated);
      return updated;
    });
  }, [saveCombatState]);
  
  const takeDamage = useCallback((damage: number) => {
    setCurrentHitpoints(prev => Math.max(0, prev - damage));
    setActiveCombat(prev => {
      if (!prev) return null;
      const updated = { ...prev, monsterLastAttackTime: Date.now() };
      // Update ref for saves
      activeCombatRef.current = updated;
      return updated;
    });
  }, []);
  
  const healPlayer = useCallback((amount: number) => {
    const hpBonus = getTotalEquipmentBonus(equipmentRef.current, itemModificationsRef.current).hitpointsBonus || 0;
    let max = ((skillsRef.current.hitpoints?.level || 10) * COMBAT_HP_SCALE) + hpBonus;
    // Apply maxHpBoost buff if active
    const maxHpBoostBuff = activeBuffsRef.current.find(b => b.effectType === "maxHpBoost" && b.expiresAt > Date.now());
    if (maxHpBoostBuff) {
      max = Math.floor(max * (1 + maxHpBoostBuff.value / 100));
    }
    setCurrentHitpoints(prev => Math.min(max, prev + amount));
  }, []);
  
  // Combat session stats tracking functions
  const trackCombatKill = useCallback(() => {
    setCombatSessionStats(prev => prev ? {
      ...prev,
      monstersKilled: prev.monstersKilled + 1
    } : null);
  }, []);
  
  const trackCombatDeath = useCallback(() => {
    setCombatSessionStats(prev => prev ? {
      ...prev,
      deaths: prev.deaths + 1
    } : null);
  }, []);
  
  const trackCombatLoot = useCallback((itemId: string, quantity: number) => {
    // Track in session for summary notification (shown on combat stop)
    sessionCombatLootRef.current[itemId] = (sessionCombatLootRef.current[itemId] || 0) + quantity;
    
    // Also track in combat session stats
    setCombatSessionStats(prev => {
      if (!prev) return null;
      return {
        ...prev,
        loot: {
          ...prev.loot,
          [itemId]: (prev.loot[itemId] || 0) + quantity
        }
      };
    });
  }, []);
  
  const trackCombatXp = useCallback((skillId: string, xpAmount: number) => {
    setCombatSessionStats(prev => {
      if (!prev) return null;
      return {
        ...prev,
        xpGained: {
          ...prev.xpGained,
          [skillId]: (prev.xpGained[skillId] || 0) + xpAmount
        }
      };
    });
  }, []);
  
  // Guild XP contribution - called when player earns skill XP
  const contributeToGuild = useCallback(async (xpAmount: number, skillId: string) => {
    try {
      await apiRequest("POST", "/api/guilds/my/contribute", { xpAmount, skillId });
    } catch (error) {
      // Silently fail - guild contribution is non-critical
      console.debug("Guild contribution failed:", error);
    }
  }, []);
  
  const grantCombatXp = useCallback((attackXp: number, strengthXp: number, defenceXp: number, hitpointsXp: number) => {
    // Apply XP boost buff if active - read directly from ref to avoid circular dependency
    const now = Date.now();
    const xpBoostBuff = activeBuffsRef.current.find(
      buff => buff.effectType === "xp_boost" && buff.expiresAt > now
    );
    const xpBoostPercent = xpBoostBuff?.value || 0;
    const xpMultiplier = 1 + (xpBoostPercent / 100);
    
    // Apply combat style XP distribution
    // Total combat XP (excluding hitpoints) is redistributed based on style
    const totalCombatXp = attackXp + strengthXp + defenceXp;
    const currentStyle = combatStyleRef.current;
    
    let finalAttackXp: number;
    let finalStrengthXp: number;
    let finalDefenceXp: number;
    
    if (currentStyle === "attack") {
      // Attack mode: Attack gets 70%, Strength gets 20%, Defence gets 10%
      finalAttackXp = Math.floor(totalCombatXp * 0.70);
      finalStrengthXp = Math.floor(totalCombatXp * 0.20);
      // Defence gets remainder to prevent XP loss from flooring
      finalDefenceXp = totalCombatXp - finalAttackXp - finalStrengthXp;
    } else if (currentStyle === "defence") {
      // Defence mode: Defence gets 70%, Strength gets 20%, Attack gets 10%
      finalDefenceXp = Math.floor(totalCombatXp * 0.70);
      finalStrengthXp = Math.floor(totalCombatXp * 0.20);
      // Attack gets remainder to prevent XP loss from flooring
      finalAttackXp = totalCombatXp - finalDefenceXp - finalStrengthXp;
    } else {
      // Balanced mode: Equal distribution (33% each)
      finalAttackXp = Math.floor(totalCombatXp * 0.33);
      finalDefenceXp = Math.floor(totalCombatXp * 0.33);
      // Strength gets remainder to prevent XP loss from flooring
      finalStrengthXp = totalCombatXp - finalAttackXp - finalDefenceXp;
    }
    
    // Hitpoints always receives its full XP regardless of style
    const finalHitpointsXp = hitpointsXp;
    
    setSkills(prev => {
      const newSkills = { ...prev };
      
      if (finalAttackXp > 0) {
        const current = prev.attack || { xp: 0, level: 1 };
        const boostedXp = Math.floor(finalAttackXp * xpMultiplier);
        const newXp = current.xp + boostedXp;
        const newLevel = getLevelFromXp(newXp);
        if (newLevel > current.level) {
          toast({ title: "Level Up!", description: `Attack is now level ${newLevel}!`, className: "bg-yellow-500/10 border-yellow-500/50 text-yellow-500" });
          trackSkillLevel('attack', newLevel);
        }
        newSkills.attack = { xp: newXp, level: newLevel };
      }
      
      if (finalStrengthXp > 0) {
        const current = prev.strength || { xp: 0, level: 1 };
        const boostedXp = Math.floor(finalStrengthXp * xpMultiplier);
        const newXp = current.xp + boostedXp;
        const newLevel = getLevelFromXp(newXp);
        if (newLevel > current.level) {
          toast({ title: "Level Up!", description: `Strength is now level ${newLevel}!`, className: "bg-yellow-500/10 border-yellow-500/50 text-yellow-500" });
          trackSkillLevel('strength', newLevel);
        }
        newSkills.strength = { xp: newXp, level: newLevel };
      }
      
      if (finalDefenceXp > 0) {
        const current = prev.defence || { xp: 0, level: 1 };
        const boostedXp = Math.floor(finalDefenceXp * xpMultiplier);
        const newXp = current.xp + boostedXp;
        const newLevel = getLevelFromXp(newXp);
        if (newLevel > current.level) {
          toast({ title: "Level Up!", description: `Defence is now level ${newLevel}!`, className: "bg-yellow-500/10 border-yellow-500/50 text-yellow-500" });
          trackSkillLevel('defence', newLevel);
        }
        newSkills.defence = { xp: newXp, level: newLevel };
      }
      
      if (finalHitpointsXp > 0) {
        const current = prev.hitpoints || { xp: 1154, level: 10 };
        const boostedXp = Math.floor(finalHitpointsXp * xpMultiplier);
        const newXp = current.xp + boostedXp;
        const newLevel = getLevelFromXp(newXp);
        if (newLevel > current.level) {
          toast({ title: "Level Up!", description: `Hitpoints is now level ${newLevel}! Max HP increased!`, className: "bg-yellow-500/10 border-yellow-500/50 text-yellow-500" });
          trackSkillLevel('hitpoints', newLevel);
          // Heal player to new max HP when hitpoints level up (scaled)
          setCurrentHitpoints(newLevel * COMBAT_HP_SCALE);
        }
        newSkills.hitpoints = { xp: newXp, level: newLevel };
      }
      
      // Sync ref immediately to prevent race condition with saves
      skillsRef.current = newSkills;
      const newTotalLevel = Object.values(newSkills).reduce((sum, s) => sum + s.level, 0);
      trackTotalLevel(newTotalLevel);
      return newSkills;
    });
    
    // Contribute total combat XP to guild (including hitpoints)
    const totalXpWithHp = totalCombatXp + hitpointsXp;
    if (totalXpWithHp > 0) {
      contributeToGuild(totalXpWithHp, 'combat');
    }
  }, [toast, contributeToGuild]);
  
  const addLoot = useCallback((itemId: string, quantity: number) => {
    // Handle Gold Coins specially - add to gold instead of inventory
    if (itemId === "Gold Coins") {
      setGold(prev => {
        const newGold = prev + quantity;
        goldRef.current = newGold;
        return newGold;
      });
      return;
    }
    setInventory(prev => {
      const currentQty = prev[itemId] || 0;
      const limit = getInventoryLimitFn(itemId);
      let addQty = quantity;
      if (limit !== null) {
        addQty = Math.min(quantity, Math.max(0, limit - currentQty));
        if (addQty <= 0) return prev;
      }
      const newInventory = {
        ...prev,
        [itemId]: currentQty + addQty
      };
      inventoryRef.current = newInventory;
      return newInventory;
    });
  }, []);
  
  const updatePlayerMeta = useCallback((updates: Partial<PlayerMeta>) => {
    setPlayer(prev => prev ? { ...prev, ...updates } : prev);
  }, []);

  const addGold = useCallback((amount: number) => {
    if (amount > 0) trackGoldEarned(amount);
    else if (amount < 0) trackGoldSpent(Math.abs(amount));
    setGold(prev => {
      const newGold = prev + amount;
      goldRef.current = newGold;
      return newGold;
    });
  }, []);
  
  const removeFromInventory = useCallback((itemId: string, quantity: number) => {
    setInventory(prev => {
      const current = prev[itemId] || 0;
      const newQty = current - quantity;
      let newInventory;
      if (newQty <= 0) {
        const { [itemId]: _, ...rest } = prev;
        newInventory = rest;
      } else {
        newInventory = { ...prev, [itemId]: newQty };
      }
      inventoryRef.current = newInventory;
      return newInventory;
    });
  }, []);

  const sellItem = useCallback((itemId: string, quantity: number): { gold: number; soldQty: number } => {
    const currentQty = inventoryRef.current[itemId] || 0;
    const actualQuantity = Math.min(quantity, currentQty);
    if (actualQuantity <= 0) return { gold: 0, soldQty: 0 };
    
    const basePrice = getVendorPrice(itemId);
    const baseItem = getBaseItem(itemId);
    let pricePerItem = basePrice;
    
    if (baseItem?.type === "equipment" || baseItem?.type === "weapon") {
      const durability = inventoryDurabilityRef.current[itemId] ?? MAX_DURABILITY;
      pricePerItem = Math.floor(basePrice * (durability / 100));
    }
    
    const totalGold = pricePerItem * actualQuantity;
    
    setInventory(prev => {
      const newInventory = { ...prev };
      const current = newInventory[itemId] || 0;
      const newQty = current - actualQuantity;
      if (newQty <= 0) {
        delete newInventory[itemId];
      } else {
        newInventory[itemId] = newQty;
      }
      inventoryRef.current = newInventory;
      return newInventory;
    });
    
    if ((inventoryRef.current[itemId] || 0) <= 0) {
      setInventoryDurability(prev => {
        const newDurability = { ...prev };
        delete newDurability[itemId];
        inventoryDurabilityRef.current = newDurability;
        return newDurability;
      });
    }
    
    setGold(prev => {
      const newGold = prev + totalGold;
      goldRef.current = newGold;
      return newGold;
    });
    
    isDirtyRef.current = true;
    
    return { gold: totalGold, soldQty: actualQuantity };
  }, []);

  const bulkSellItems = useCallback((items: { itemId: string; quantity: number }[]): number => {
    let totalGoldEarned = 0;
    for (const { itemId, quantity } of items) {
      totalGoldEarned += sellItem(itemId, quantity).gold;
    }
    return totalGoldEarned;
  }, [sellItem]);
  
  const eatFood = useCallback((foodId: string): boolean => {
    const currentInv = inventoryRef.current;
    const currentHp = currentHitpointsRef.current;
    const hpBonus = getTotalEquipmentBonus(equipmentRef.current, itemModificationsRef.current).hitpointsBonus || 0;
    let max = ((skillsRef.current.hitpoints?.level || 10) * COMBAT_HP_SCALE) + hpBonus;
    // Apply maxHpBoost buff if active
    const maxHpBoostBuff = activeBuffsRef.current.find(b => b.effectType === "maxHpBoost" && b.expiresAt > Date.now());
    if (maxHpBoostBuff) {
      max = Math.floor(max * (1 + maxHpBoostBuff.value / 100));
    }
    
    if (!currentInv[foodId] || currentInv[foodId] <= 0) {
      return false;
    }
    
    if (!isFood(foodId)) {
      return false;
    }
    
    if (currentHp >= max) {
      return false;
    }
    
    // Get heal amount (already scaled in foods.ts)
    const healAmount = getFoodHealAmount(foodId);
    if (healAmount <= 0) {
      return false;
    }
    
    removeFromInventory(foodId, 1);
    setCurrentHitpoints(prev => Math.min(max, prev + healAmount));
    
    // Track food eaten in combat session stats (always use functional update)
    setCombatSessionStats(prev => prev ? {
      ...prev,
      foodEaten: prev.foodEaten + 1
    } : null);
    
    return true;
  }, [removeFromInventory]);
  
  // Eat multiple foods at once until HP is full - handles ref staleness by calculating upfront
  const eatFoodUntilFull = useCallback((foodId: string, currentHp: number, maxHp: number): { count: number; healed: number } => {
    const currentInv = inventoryRef.current;
    
    if (!currentInv[foodId] || currentInv[foodId] <= 0) {
      return { count: 0, healed: 0 };
    }
    
    if (!isFood(foodId)) {
      return { count: 0, healed: 0 };
    }
    
    if (currentHp >= maxHp) {
      return { count: 0, healed: 0 };
    }
    
    const healPerFood = getFoodHealAmount(foodId);
    if (healPerFood <= 0) {
      return { count: 0, healed: 0 };
    }
    
    const hpNeeded = maxHp - currentHp;
    const foodNeeded = Math.ceil(hpNeeded / healPerFood);
    const foodAvailable = currentInv[foodId];
    const foodToEat = Math.min(foodNeeded, foodAvailable);
    
    if (foodToEat <= 0) {
      return { count: 0, healed: 0 };
    }
    
    // Calculate actual heal (capped at max HP)
    const totalHeal = Math.min(foodToEat * healPerFood, hpNeeded);
    
    // Remove all foods at once
    removeFromInventory(foodId, foodToEat);
    // Heal all at once
    setCurrentHitpoints(prev => Math.min(maxHp, prev + totalHeal));
    
    // Track food eaten in combat session stats (always use functional update, no ref check)
    if (foodToEat > 0) {
      setCombatSessionStats(prev => prev ? {
        ...prev,
        foodEaten: prev.foodEaten + foodToEat
      } : null);
    }
    
    return { count: foodToEat, healed: totalHeal };
  }, [removeFromInventory]);

  // Buff helper: get the value of a specific effect type from active buffs
  const getBuffEffect = useCallback((effectType: PotionEffect["type"]): number => {
    const now = Date.now();
    const activeBuff = activeBuffsRef.current.find(
      buff => buff.effectType === effectType && buff.expiresAt > now
    );
    return activeBuff?.value || 0;
  }, []);
  
  // Keep a ref to getBuffEffect for use in startCombat
  const getBuffEffectRef = useRef(getBuffEffect);
  useEffect(() => { getBuffEffectRef.current = getBuffEffect; }, [getBuffEffect]);

  // Buff helper: check if a buff of specific type is active
  const hasActiveBuff = useCallback((effectType: PotionEffect["type"]): boolean => {
    const now = Date.now();
    return activeBuffsRef.current.some(
      buff => buff.effectType === effectType && buff.expiresAt > now
    );
  }, []);

  // Use a potion from inventory
  const usePotion = useCallback((potionId: string): boolean => {
    const currentInv = inventoryRef.current;
    
    // Check if potion exists in inventory
    if (!currentInv[potionId] || currentInv[potionId] <= 0) {
      toast({
        title: t(language, 'error'),
        description: t(language, 'notAPotion'),
        variant: "destructive",
      });
      return false;
    }
    
    // Get potion item data
    const potionItem = getBaseItem(potionId);
    if (!potionItem || potionItem.type !== "potion" || !potionItem.effect || !potionItem.duration) {
      toast({
        title: t(language, 'error'),
        description: t(language, 'notAPotion'),
        variant: "destructive",
      });
      return false;
    }
    
    const now = Date.now();
    const effectType = potionItem.effect.type;
    const effectValue = potionItem.effect.value;
    const durationMs = potionItem.duration * 1000; // Convert seconds to ms
    
    // Remove from inventory first
    removeFromInventory(potionId, 1);
    
    // Create new buff
    const newBuff: ActiveBuff = {
      potionId,
      effectType,
      value: effectValue,
      startTime: now,
      duration: durationMs,
      expiresAt: now + durationMs,
    };
    
    // Replace existing buff of same type or add new one
    setActiveBuffs(prev => {
      const filtered = prev.filter(buff => buff.effectType !== effectType);
      const newBuffs = [...filtered, newBuff];
      // Sync ref immediately so getBuffEffect sees the new buff right away
      activeBuffsRef.current = newBuffs;
      return newBuffs;
    });
    
    // Show success toast
    const durationMinutes = Math.floor(potionItem.duration / 60);
    const durationSeconds = potionItem.duration % 60;
    const durationText = durationMinutes > 0 
      ? `${durationMinutes} dakika${durationSeconds > 0 ? ` ${durationSeconds} saniye` : ''}`
      : `${durationSeconds} saniye`;
    
    toast({
      title: t(language, 'potionUsed'),
      description: t(language, 'potionActiveFor').replace('{0}', potionItem.name).replace('{1}', durationText),
    });
    
    trackPotionUsed();
    return true;
  }, [removeFromInventory, toast]);

  // Buff tick timer - runs every second to:
  // 1. Check and remove expired buffs
  // 2. Apply periodic buff effects (HP regen) regardless of combat state
  useEffect(() => {
    const buffTick = () => {
      const now = Date.now();
      
      // Check expired buffs — only update state when something actually changed
      const prevBuffs = activeBuffsRef.current;
      const hasExpired = prevBuffs.some(buff => buff.expiresAt <= now);
      if (hasExpired) {
        const expiredBuffs = prevBuffs.filter(buff => buff.expiresAt <= now);
        const stillActive = prevBuffs.filter(buff => buff.expiresAt > now);
        expiredBuffs.forEach(buff => {
          const potionItem = getBaseItem(buff.potionId);
          if (potionItem) {
            toast({
              title: t(language, 'effectEnded'),
              description: t(language, 'effectEndedDesc').replace('{0}', potionItem.name),
            });
          }
        });
        activeBuffsRef.current = stillActive;
        setActiveBuffs(stillActive);
      }
      
      // Apply HP regen buff effect (works regardless of combat state)
      const currentBuffs = activeBuffsRef.current;
      const hpRegenBuff = currentBuffs.find(b => b.effectType === "hp_regen" && b.expiresAt > now);
      if (hpRegenBuff) {
        const currentSkills = skillsRef.current;
        const currentEquipment = equipmentRef.current;
        const equipmentBonuses = getTotalEquipmentBonus(currentEquipment, itemModificationsRef.current);
        const hpBonus = equipmentBonuses.hitpointsBonus || 0;
        let maxHp = ((currentSkills.hitpoints?.level || 10) * COMBAT_HP_SCALE) + hpBonus;
        // Apply maxHpBoost buff if active
        const maxHpBoostBuff = currentBuffs.find(b => b.effectType === "maxHpBoost" && b.expiresAt > now);
        if (maxHpBoostBuff) {
          maxHp = Math.floor(maxHp * (1 + maxHpBoostBuff.value / 100));
        }
        const currentHp = currentHitpointsRef.current;
        
        if (currentHp < maxHp) {
          const regenAmount = Math.min(hpRegenBuff.value, maxHp - currentHp);
          currentHitpointsRef.current = Math.min(maxHp, currentHp + regenAmount);
          setCurrentHitpoints(currentHitpointsRef.current);
        }
      }
      
      // Passive HP regen when NOT in combat (1 HP per minute = every 60 ticks)
      if (!activeCombatRef.current) {
        passiveRegenTickRef.current = passiveRegenTickRef.current + 1;
        if (passiveRegenTickRef.current >= 60) {
          passiveRegenTickRef.current = 0;
          const currentSkills = skillsRef.current;
          const currentEquipment = equipmentRef.current;
          const equipmentBonuses = getTotalEquipmentBonus(currentEquipment, itemModificationsRef.current);
          const hpBonus = equipmentBonuses.hitpointsBonus || 0;
          let maxHp = ((currentSkills.hitpoints?.level || 10) * COMBAT_HP_SCALE) + hpBonus;
          const maxHpBoostBuff = activeBuffsRef.current.find(b => b.effectType === "maxHpBoost" && b.expiresAt > now);
          if (maxHpBoostBuff) {
            maxHp = Math.floor(maxHp * (1 + maxHpBoostBuff.value / 100));
          }
          const currentHp = currentHitpointsRef.current;
          if (currentHp < maxHp) {
            currentHitpointsRef.current = Math.min(maxHp, currentHp + 1);
            setCurrentHitpoints(currentHitpointsRef.current);
          }
        }
      } else {
        // Reset passive regen counter when in combat
        passiveRegenTickRef.current = 0;
      }
    };
    
    const interval = setInterval(buffTick, 1000);
    return () => clearInterval(interval);
  }, [toast]);

  // Combat tick - runs in background regardless of which page user is on
  // CRITICAL: Empty dependency array so interval persists across page navigation
  useEffect(() => {
    // Combat tick function - uses deterministic combat engine
    const combatTick = () => {
      const combat = activeCombatRef.current;
      if (!combat) return;

      const currentMonster = getMonsterById(combat.monsterId);
      if (!currentMonster) return;

      const now = Date.now();
      if (lastCombatTickTimeRef.current === 0) {
        lastCombatTickTimeRef.current = now;
        return;
      }
      const deltaMs = now - lastCombatTickTimeRef.current;
      lastCombatTickTimeRef.current = now;
      if (deltaMs <= 0) return;

      const localizedMonsterName = getLocalizedMonsterName(languageRef.current as any, combat.monsterId);

      if (!combatRngRef.current) {
        combatRngRef.current = new DeterministicRng(hashSeed(`${combat.monsterId}_${now}`));
      }

      const currentSkills = skillsRef.current;
      const currentEquipment = equipmentRef.current;
      const currentBuffs = activeBuffsRef.current;
      const currentMods = itemModificationsRef.current;
      let equipmentBonuses: ReturnType<typeof getTotalEquipmentBonus>;
      if (cachedEquipBonusRef.current && cachedEquipBonusRef.current.equip === currentEquipment && cachedEquipBonusRef.current.mods === currentMods) {
        equipmentBonuses = cachedEquipBonusRef.current.bonuses;
      } else {
        equipmentBonuses = getTotalEquipmentBonus(currentEquipment, currentMods);
        cachedEquipBonusRef.current = { equip: currentEquipment, mods: currentMods, bonuses: equipmentBonuses };
      }

      const getBuffValue = (effectType: string) => {
        const buff = currentBuffs.find(b => b.effectType === effectType && b.expiresAt > now);
        return buff?.value || 0;
      };

      const baseWeaponAttackSpeed = getWeaponAttackSpeed();
      const totalAttackSpeedBonus = (equipmentBonuses.attackSpeedBonus || 0) + (equipmentBonuses.partyAttackSpeedBuff || 0);
      const attackSpeedReduction = totalAttackSpeedBonus > 0 ? (1 - totalAttackSpeedBonus / 100) : 1;
      const weaponAttackSpeed = Math.max(MIN_ATTACK_SPEED_MS, Math.floor(baseWeaponAttackSpeed * attackSpeedReduction));

      const hpBonus = equipmentBonuses.hitpointsBonus || 0;
      let maxHp = ((currentSkills.hitpoints?.level || 10) * COMBAT_HP_SCALE) + hpBonus;
      const maxHpBoostBuff = currentBuffs.find(b => b.effectType === "maxHpBoost" && b.expiresAt > now);
      if (maxHpBoostBuff) {
        maxHp = Math.floor(maxHp * (1 + maxHpBoostBuff.value / 100));
      }
      const achMaxHpBuff = getAchievementBuffValue('maxHp');
      if (achMaxHpBuff > 0) maxHp += achMaxHpBuff;

      const achAttackPercent = getAchievementBuffValue('attackPercent');
      const achDefencePercent = getAchievementBuffValue('defencePercent');
      const achXpBonus = getAchievementBuffValue('xpBonus');
      const achGoldBonus = getAchievementBuffValue('goldBonus');
      const achLootChance = getAchievementBuffValue('lootChance');

      const playerAttackLevel = currentSkills.attack?.level || 1;
      const playerDefenceLevel = currentSkills.defence?.level || 1;
      let effectiveAttackBonus = equipmentBonuses.attackBonus ?? 0;
      let effectiveDefenceBonus = equipmentBonuses.defenceBonus ?? 0;
      if (achAttackPercent > 0) {
        const totalAtk = playerAttackLevel + effectiveAttackBonus;
        effectiveAttackBonus = Math.floor(totalAtk * (1 + achAttackPercent / 100)) - playerAttackLevel;
      }
      if (achDefencePercent > 0) {
        const totalDef = playerDefenceLevel + effectiveDefenceBonus;
        effectiveDefenceBonus = Math.floor(totalDef * (1 + achDefencePercent / 100)) - playerDefenceLevel;
      }

      const selectedFoodId = combat.selectedFood || null;
      const foodInventory: Record<string, number> = {};
      if (selectedFoodId && inventoryRef.current[selectedFoodId]) {
        foodInventory[selectedFoodId] = inventoryRef.current[selectedFoodId];
      }
      const healPerFood = selectedFoodId ? getFoodHealAmount(selectedFoodId) : 0;

      const selectedPotionId = combat.selectedPotion || null;
      const potionInventory: Record<string, number> = {};
      let potionEffectType: string | null = null;
      let potionEffectValue = 0;
      let potionDurationMs = 0;
      if (selectedPotionId) {
        if (inventoryRef.current[selectedPotionId]) {
          potionInventory[selectedPotionId] = inventoryRef.current[selectedPotionId];
        }
        const potionItem = getBaseItem(selectedPotionId);
        if (potionItem && potionItem.type === "potion" && potionItem.effect) {
          potionEffectType = potionItem.effect.type;
          potionEffectValue = potionItem.effect.value;
          potionDurationMs = (potionItem.duration || 0) * 1000;
        }
      }

      if (!combatStateRef.current) {
        combatStateRef.current = {
          playerHp: currentHitpointsRef.current,
          maxPlayerHp: maxHp,
          monsterHp: combat.monsterCurrentHp,
          playerAttackAccumulator: 0,
          monsterAttackAccumulator: 0,
          weaponAttackSpeed,
          weaponLifesteal: getWeaponLifesteal(),
          weaponSkills: getWeaponSkills(),
          playerStats: {
            attackLevel: playerAttackLevel,
            strengthLevel: currentSkills.strength?.level || 1,
            defenceLevel: playerDefenceLevel,
            hitpointsLevel: currentSkills.hitpoints?.level || 10,
            attackBonus: effectiveAttackBonus,
            strengthBonus: equipmentBonuses.strengthBonus ?? 0,
            defenceBonus: effectiveDefenceBonus,
            hitpointsBonus: equipmentBonuses.hitpointsBonus ?? 0,
            critChance: equipmentBonuses.critChance ?? 0,
            critDamage: equipmentBonuses.critDamage ?? 0,
            attackSpeedBonus: equipmentBonuses.attackSpeedBonus ?? 0,
            healingReceivedBonus: equipmentBonuses.healingReceivedBonus ?? 0,
            onHitHealingPercent: equipmentBonuses.onHitHealingPercent ?? 0,
            skillDamageBonus: equipmentBonuses.skillDamageBonus ?? 0,
            partyDpsBuff: equipmentBonuses.partyDpsBuff ?? 0,
            partyDefenceBuff: equipmentBonuses.partyDefenceBuff ?? 0,
            partyAttackSpeedBuff: equipmentBonuses.partyAttackSpeedBuff ?? 0,
            lootChanceBonus: equipmentBonuses.lootChanceBonus ?? 0,
          },
          monsterStats: {
            id: currentMonster.id,
            maxHp: currentMonster.maxHitpoints * COMBAT_HP_SCALE,
            attackLevel: currentMonster.attackLevel,
            strengthLevel: currentMonster.strengthLevel,
            defenceLevel: currentMonster.defenceLevel,
            attackBonus: currentMonster.attackBonus || 0,
            strengthBonus: currentMonster.strengthBonus ?? 0,
            attackSpeed: currentMonster.attackSpeed,
            skills: currentMonster.skills || [],
            loot: currentMonster.loot,
            xpReward: currentMonster.xpReward,
          },
          buffs: {
            attackBoostPercent: getBuffValue("attack_boost"),
            strengthBoostPercent: getBuffValue("strength_boost"),
            defenceBoostPercent: getBuffValue("defence_boost"),
            critChancePercent: getBuffValue("crit_chance"),
            damageReductionPercent: getBuffValue("damage_reduction"),
            hpRegenValue: getBuffValue("hp_regen"),
            xpBoostPercent: getBuffValue("xp_boost"),
            lifestealPercent: getBuffValue("lifesteal"),
            maxHpBoostPercent: maxHpBoostBuff ? maxHpBoostBuff.value : 0,
          },
          modifiers: {
            combatStyle: combatStyleRef.current,
            guildCombatPowerPercent: guildBonusesRef.current?.combatPower || 0,
            guildDefensePowerPercent: guildBonusesRef.current?.defensePower || 0,
            guildXpBonusPercent: (guildBonusesRef.current?.xpBonus || 0) + achXpBonus,
            guildLootBonusPercent: (guildBonusesRef.current?.lootBonus || 0) + achLootChance,
            guildGoldBonusPercent: (guildBonusesRef.current?.goldBonus || 0) + achGoldBonus,
            partyDpsBonus: partyCombatBonusesRef.current?.dpsBonus || 0,
            partyDefenseBonus: partyCombatBonusesRef.current?.defenseBonus || 0,
            partyFoodHealBonus: 0,
            partyAttackBonus: 0,
          },
          food: {
            selectedFoodId,
            foodInventory,
            healPerFood,
            autoEatEnabled: combat.autoEatEnabled || false,
            autoEatThreshold: combat.autoEatThreshold || 30,
          },
          potion: {
            selectedPotionId,
            potionInventory,
            autoPotionEnabled: combat.autoPotionEnabled || false,
            potionEffectType,
            potionEffectValue,
            potionDurationMs,
          },
          debuffs: combatDebuffsRef.current.slice(),
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
      } else {
        combatStateRef.current.playerHp = currentHitpointsRef.current;
        combatStateRef.current.maxPlayerHp = maxHp;
        combatStateRef.current.weaponAttackSpeed = weaponAttackSpeed;
        combatStateRef.current.weaponLifesteal = getWeaponLifesteal();
        combatStateRef.current.weaponSkills = getWeaponSkills();
        combatStateRef.current.food.foodInventory = foodInventory;
        combatStateRef.current.food.healPerFood = healPerFood;
        combatStateRef.current.food.selectedFoodId = selectedFoodId;
        combatStateRef.current.food.autoEatEnabled = combat.autoEatEnabled || false;
        combatStateRef.current.food.autoEatThreshold = combat.autoEatThreshold || 30;
        combatStateRef.current.potion.potionInventory = potionInventory;
        combatStateRef.current.potion.selectedPotionId = selectedPotionId;
        combatStateRef.current.potion.autoPotionEnabled = combat.autoPotionEnabled || false;
        combatStateRef.current.potion.potionEffectType = potionEffectType;
        combatStateRef.current.potion.potionEffectValue = potionEffectValue;
        combatStateRef.current.potion.potionDurationMs = potionDurationMs;
        combatStateRef.current.buffs = {
          attackBoostPercent: getBuffValue("attack_boost"),
          strengthBoostPercent: getBuffValue("strength_boost"),
          defenceBoostPercent: getBuffValue("defence_boost"),
          critChancePercent: getBuffValue("crit_chance"),
          damageReductionPercent: getBuffValue("damage_reduction"),
          hpRegenValue: getBuffValue("hp_regen"),
          xpBoostPercent: getBuffValue("xp_boost"),
          lifestealPercent: getBuffValue("lifesteal"),
          maxHpBoostPercent: maxHpBoostBuff ? maxHpBoostBuff.value : 0,
        };
        combatStateRef.current.modifiers.combatStyle = combatStyleRef.current;
        combatStateRef.current.modifiers.guildXpBonusPercent = (guildBonusesRef.current?.xpBonus || 0) + achXpBonus;
        combatStateRef.current.modifiers.guildLootBonusPercent = (guildBonusesRef.current?.lootBonus || 0) + achLootChance;
        combatStateRef.current.modifiers.guildGoldBonusPercent = (guildBonusesRef.current?.goldBonus || 0) + achGoldBonus;
        combatStateRef.current.playerStats = {
          attackLevel: playerAttackLevel,
          strengthLevel: currentSkills.strength?.level || 1,
          defenceLevel: playerDefenceLevel,
          hitpointsLevel: currentSkills.hitpoints?.level || 10,
          attackBonus: effectiveAttackBonus,
          strengthBonus: equipmentBonuses.strengthBonus ?? 0,
          defenceBonus: effectiveDefenceBonus,
          hitpointsBonus: equipmentBonuses.hitpointsBonus ?? 0,
          critChance: equipmentBonuses.critChance ?? 0,
          critDamage: equipmentBonuses.critDamage ?? 0,
          attackSpeedBonus: equipmentBonuses.attackSpeedBonus ?? 0,
          healingReceivedBonus: equipmentBonuses.healingReceivedBonus ?? 0,
          onHitHealingPercent: equipmentBonuses.onHitHealingPercent ?? 0,
          skillDamageBonus: equipmentBonuses.skillDamageBonus ?? 0,
          partyDpsBuff: equipmentBonuses.partyDpsBuff ?? 0,
          partyDefenceBuff: equipmentBonuses.partyDefenceBuff ?? 0,
          partyAttackSpeedBuff: equipmentBonuses.partyAttackSpeedBuff ?? 0,
          lootChanceBonus: equipmentBonuses.lootChanceBonus ?? 0,
        };
      }

      if (!combatStateRef.current || !combatRngRef.current) return;
      const engineResult = processCombatStep(combatStateRef.current, deltaMs, combatRngRef.current);
      combatStateRef.current = engineResult.state;

      for (const event of engineResult.events) {
        switch (event.type) {
          case "player_hit":
          case "player_crit": {
            const isCrit = event.type === "player_crit";
            combatEventCallbacksRef.current.onPlayerDamage?.(event.damage || 0, isCrit);
            combatEventCallbacksRef.current.onCombatLog?.(
              isCrit
                ? t(languageRef.current, 'criticalDamageDealt').replace('{0}', String(event.damage || 0)).replace('{1}', localizedMonsterName)
                : t(languageRef.current, 'normalDamageDealt').replace('{0}', String(event.damage || 0)).replace('{1}', localizedMonsterName),
              "player_hit"
            );
            if (event.formulaString) {
              combatEventCallbacksRef.current.onFormulaLog?.('player_attack', event.formulaString, event.damage || 0, true);
            }
            {
              const wId = currentEquipment["weapon"];
              const wItem = wId ? getBaseItem(wId) : null;
              getPlayWeaponSfx()?.(wItem?.weaponCategory || null);
            }
            break;
          }

          case "player_miss": {
            combatEventCallbacksRef.current.onCombatLog?.(t(languageRef.current, 'missedMonster').replace('{0}', localizedMonsterName), "player_miss");
            combatEventCallbacksRef.current.onPlayerMiss?.();
            if (event.formulaString) {
              combatEventCallbacksRef.current.onFormulaLog?.('player_attack', event.formulaString, 0, false);
            }
            getPlaySfx()?.('combat', 'miss');
            break;
          }

          case "player_skill": {
            if (event.skillName && event.skillType) {
              const localizedWeaponSkillName = event.skillNameTranslations?.[languageRef.current] || event.skillName;
              combatEventCallbacksRef.current.onPlayerWeaponSkillUse?.(localizedWeaponSkillName, event.skillType);
              getPlayPlayerSkillSfx()?.(event.skillName);

              const skillType = event.skillType;
              let logMessage: string;
              if (skillType === "stun" || skillType === "force_aggro") {
                logMessage = t(languageRef.current, 'skillStunApplied').replace('{0}', localizedWeaponSkillName);
              } else if (skillType === "lifesteal_burst" || skillType === "lifesteal" || skillType === "heal" || skillType === "groupHeal") {
                logMessage = t(languageRef.current, 'skillHealApplied').replace('{0}', localizedWeaponSkillName).replace('{1}', String(event.healing || 0));
                if (event.healing && event.healing > 0) {
                  const healEffectType = (skillType === "lifesteal_burst" || skillType === "lifesteal") ? 'lifesteal' : 'heal';
                  combatEventCallbacksRef.current.onPlayerSkillEffect?.(event.healing, localizedWeaponSkillName, healEffectType);
                }
              } else if (skillType === "buff" && event.healing && event.healing > 0) {
                logMessage = t(languageRef.current, 'skillHealApplied').replace('{0}', localizedWeaponSkillName).replace('{1}', String(event.healing));
                combatEventCallbacksRef.current.onPlayerSkillEffect?.(event.healing, localizedWeaponSkillName, 'heal');
              } else if ((event.damage || 0) > 0) {
                logMessage = t(languageRef.current, 'skillDamageDealt').replace('{0}', localizedWeaponSkillName).replace('{1}', String(event.damage));
              } else {
                logMessage = t(languageRef.current, 'skillActivated').replace('{0}', localizedWeaponSkillName);
              }
              combatEventCallbacksRef.current.onCombatLog?.(logMessage, "loot");
              combatEventCallbacksRef.current.onPartySkillShare?.(event.skillName, event.damage || 0, 0, event.skillType);
            }
            break;
          }

          case "player_stunned": {
            combatEventCallbacksRef.current.onCombatLog?.(t(languageRef.current, 'stunnedTurnsRemaining').replace('{0}', String(0)), "death");
            break;
          }

          case "monster_hit": {
            combatEventCallbacksRef.current.onCombatLog?.(
              t(languageRef.current, 'monsterDealtDamage').replace('{0}', localizedMonsterName).replace('{1}', String(event.damage || 0)),
              "monster_hit"
            );
            combatEventCallbacksRef.current.onPlayerTakeDamage?.(event.damage || 0, false);
            if (event.formulaString) {
              combatEventCallbacksRef.current.onFormulaLog?.('monster_attack', event.formulaString, event.damage || 0, true);
            }
            getPlayMonsterHitSfx()?.();
            break;
          }

          case "monster_miss": {
            combatEventCallbacksRef.current.onCombatLog?.(t(languageRef.current, 'monsterMissed').replace('{0}', localizedMonsterName), "monster_miss");
            if (event.formulaString) {
              combatEventCallbacksRef.current.onFormulaLog?.('monster_attack', event.formulaString, 0, false);
            }
            getPlaySfx()?.('combat', 'miss');
            break;
          }

          case "monster_skill": {
            if (event.skillName && event.skillType) {
              const localizedSkillName = event.skillNameTranslations?.[languageRef.current] || event.skillName;
              combatEventCallbacksRef.current.onMonsterSkillUse?.(localizedSkillName, event.skillType);
              getPlayMonsterSkillSfx()?.(event.skillName);

              if (event.comboHits && event.comboHits > 1 && event.comboHitDamages) {
                combatEventCallbacksRef.current.onCombatLog?.(
                  t(languageRef.current, 'monsterComboAttack').replace('{0}', localizedMonsterName).replace('{1}', String(event.comboHits)),
                  "monster_hit"
                );
                event.comboHitDamages.forEach((hitDmg: number, idx: number) => {
                  combatEventCallbacksRef.current.onComboHit?.(idx + 1, event.comboHits!, hitDmg);
                  combatEventCallbacksRef.current.onCombatLog?.(
                    t(languageRef.current, 'comboHitDamage').replace('{0}', String(idx + 1)).replace('{1}', String(event.comboHits)).replace('{2}', String(hitDmg)),
                    "monster_hit"
                  );
                });
              } else {
                if (event.isCritical) {
                  combatEventCallbacksRef.current.onCombatLog?.(
                    t(languageRef.current, 'monsterCriticalHit').replace('{0}', localizedMonsterName),
                    "monster_hit"
                  );
                }
                combatEventCallbacksRef.current.onSkillDamage?.(event.damage || 0, event.skillName);
                combatEventCallbacksRef.current.onCombatLog?.(
                  t(languageRef.current, 'monsterDealtDamage').replace('{0}', localizedMonsterName).replace('{1}', String(event.damage || 0)),
                  "monster_hit"
                );
              }

              combatEventCallbacksRef.current.onPlayerTakeDamage?.(event.damage || 0, event.isCritical || false);
            }
            break;
          }

          case "monster_stunned": {
            combatEventCallbacksRef.current.onCombatLog?.(
              t(languageRef.current, 'monsterStunnedCantAttack').replace('{0}', String(engineResult.state.monsterStunCycles)),
              "loot"
            );
            break;
          }

          case "debuff_applied": {
            if (event.debuff) {
              combatDebuffsRef.current = engineResult.state.debuffs.slice();
              setCombatDebuffs(engineResult.state.debuffs.slice());
              if (event.debuff.type === "stun") {
                combatEventCallbacksRef.current.onCombatLog?.(t(languageRef.current, 'youWereStunnedTurns').replace('{0}', String(event.debuff.stunCyclesRemaining)), "death");
              } else if (event.debuff.type === "poison") {
                combatEventCallbacksRef.current.onCombatLog?.(t(languageRef.current, 'youWerePoisoned'), "death");
              } else if (event.debuff.type === "burn") {
                combatEventCallbacksRef.current.onCombatLog?.(t(languageRef.current, 'youAreBurning'), "death");
              } else if (event.debuff.type === "armor_break") {
                combatEventCallbacksRef.current.onCombatLog?.(t(languageRef.current, 'yourArmorBroken'), "death");
              }
            }
            break;
          }

          case "debuff_tick": {
            combatEventCallbacksRef.current.onCombatLog?.(
              t(languageRef.current, 'dotDamageDealt').replace('{0}', String(event.damage || 0)),
              "monster_hit"
            );
            combatEventCallbacksRef.current.onPlayerTakeDamage?.(event.damage || 0, false);
            combatDebuffsRef.current = engineResult.state.debuffs.slice();
            setCombatDebuffs(engineResult.state.debuffs.slice());
            break;
          }

          case "debuff_expired": {
            combatEventCallbacksRef.current.onCombatLog?.(
              t(languageRef.current, 'effectEndedDesc').replace('{0}', event.skillName || ''),
              "loot"
            );
            combatDebuffsRef.current = engineResult.state.debuffs.slice();
            setCombatDebuffs(engineResult.state.debuffs.slice());
            break;
          }

          case "auto_eat": {
            if (event.foodId && event.foodCount && event.foodCount > 0) {
              const prevQty = inventoryRef.current[event.foodId] || 0;
              const consumed = Math.min(event.foodCount, prevQty);
              if (consumed > 0) {
                const eatFoodId = event.foodId;
                setInventory(prev => {
                  const newQty = (prev[eatFoodId] || 0) - consumed;
                  const newInventory = newQty <= 0
                    ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== eatFoodId))
                    : { ...prev, [eatFoodId]: newQty };
                  inventoryRef.current = newInventory;
                  return newInventory;
                });
                setCombatSessionStats(prev => prev ? { ...prev, foodEaten: prev.foodEaten + consumed } : null);
                for (let i = 0; i < consumed; i++) trackFoodEaten();
                combatEventCallbacksRef.current.onCombatLog?.(
                  t(languageRef.current, 'autoAteHealed').replace('{0}', String(consumed)).replace('{1}', event.foodId).replace('{2}', String(event.healing || 0)),
                  "loot"
                );
              }
            }
            break;
          }

          case "auto_potion": {
            if (event.itemId) {
              const used = usePotionInternal(event.itemId);
              if (used) {
                const potionItem = getBaseItem(event.itemId);
                combatEventCallbacksRef.current.onCombatLog?.(
                  t(languageRef.current, 'autoDrankPotion').replace('{0}', potionItem?.name || event.itemId),
                  "loot"
                );
              }
            }
            break;
          }

          case "lifesteal": {
            combatEventCallbacksRef.current.onCombatLog?.(
              t(languageRef.current, 'lifestealHealed').replace('{0}', String(event.healing || 0)),
              "loot"
            );
            break;
          }

          case "hp_regen": {
            break;
          }

          case "reflect_damage": {
            combatEventCallbacksRef.current.onCombatLog?.(
              t(languageRef.current, 'reflectDamageDealt').replace('{0}', String(event.damage || 0)),
              "monster_hit"
            );
            combatEventCallbacksRef.current.onPlayerTakeDamage?.(event.damage || 0, false);
            break;
          }

          case "monster_regen": {
            combatEventCallbacksRef.current.onCombatLog?.(
              t(languageRef.current, 'monsterRegenerated').replace('{0}', String(event.healing || 0)),
              "monster_hit"
            );
            break;
          }

          case "armor_repair": {
            combatEventCallbacksRef.current.onCombatLog?.(
              t(languageRef.current, 'monsterArmorRepaired'),
              "monster_hit"
            );
            break;
          }

          case "durability_loss": {
            const combatBrokenItems = applyCombatDurabilityInternal();
            if (combatBrokenItems.length > 0) {
              combatBrokenItems.forEach(itemId => {
                combatEventCallbacksRef.current.onCombatLog?.(t(languageRef.current, 'itemBrokeDuringCombat').replace('{0}', itemId), "death");
              });
            }
            break;
          }

          case "monster_killed": {
            isProcessingRespawnRef.current = true;
            getPlaySfx()?.('combat', 'monster_death');
            combatEventCallbacksRef.current.onVictory?.(localizedMonsterName);
            combatEventCallbacksRef.current.onCombatLog?.(t(languageRef.current, 'defeatedMonster').replace('{0}', localizedMonsterName), "victory");

            setCombatSessionStats(prev => prev ? { ...prev, monstersKilled: prev.monstersKilled + 1 } : null);
            trackKill(currentMonster.id, currentRegionRef.current || undefined);
            trackDailyQuestProgress('kill_monsters', null);

            combatDebuffsRef.current = [];
            setCombatDebuffs([]);

            const equippedWeaponId = equipmentRef.current.weapon;
            const currentWeapon = equippedWeaponId ? getBaseItem(equippedWeaponId) : null;
            if (currentWeapon) {
              const masteryType = mapWeaponCategoryToMasteryType(currentWeapon.weaponCategory);
              if (masteryType) {
                const monsterLevel = calculateMonsterCombatLevel({
                  attackLevel: currentMonster.attackLevel,
                  strengthLevel: currentMonster.strengthLevel,
                  defenceLevel: currentMonster.defenceLevel
                });
                const weaponTier = getWeaponTierFromLevel(currentWeapon.levelRequired || 1);
                const masteryXpGain = calculateMasteryXpGain(monsterLevel, weaponTier, true);
                const masteryField = getMasteryFieldName(masteryType) as keyof PlayerMasteries;
                const currentMasteryXp = masteriesRef.current[masteryField] || 0;
                const currentMasteryLevel = getLevelFromXp(currentMasteryXp);
                const scaledMasteryXp = applyMasteryXpScaling(masteryXpGain, currentMasteryLevel, monsterLevel);
                const oldMasteryLevel = getMasteryLevelFromXp(currentMasteryXp);
                setMasteries(prev => {
                  const updated = { ...prev, [masteryField]: (prev[masteryField] || 0) + scaledMasteryXp };
                  masteriesRef.current = updated;
                  const newMasteryLevel = getMasteryLevelFromXp(updated[masteryField] || 0);
                  if (newMasteryLevel > oldMasteryLevel) {
                    trackWeaponMastery(masteryType, newMasteryLevel);
                  }
                  return updated;
                });
              }
            }

            const dungeonKey = rollDungeonKeyDrop(currentRegionRef.current || 'verdant', false);
            if (dungeonKey) {
              addLootInternal(dungeonKey, 1);
              combatEventCallbacksRef.current.onLootDrop?.(dungeonKey, 1);
              combatEventCallbacksRef.current.onCombatLog?.(`+1x ${formatItemIdAsName(dungeonKey)}`, "loot");
              sessionCombatLootRef.current[dungeonKey] = (sessionCombatLootRef.current[dungeonKey] || 0) + 1;
            }

            combatEventCallbacksRef.current.onRespawnStart?.(RESPAWN_DELAY);
            break;
          }

          case "loot_drop": {
            if (event.itemId && event.quantity) {
              const item = getItemById(event.itemId);
              const isEquipment = item && (item.type === "equipment" || item.type === "weapon");
              let finalItemId = event.itemId;
              let displayRarity: string | null = null;

              if (isEquipment) {
                const rarity = rollRarityForDrop();
                finalItemId = `${event.itemId} (${rarity})`;
                displayRarity = rarity;
                if (rarity === "Mythic") {
                  setPendingMythicDrops(prev => [...prev, { itemId: finalItemId, monsterId: currentMonster.id }]);
                }
              }

              addLootInternal(finalItemId, event.quantity);
              combatEventCallbacksRef.current.onLootDrop?.(finalItemId, event.quantity);
              if (displayRarity) {
                combatEventCallbacksRef.current.onCombatLog?.(`+${event.quantity}x ${finalItemId}`, "loot");
              } else {
                combatEventCallbacksRef.current.onCombatLog?.(`+${event.quantity}x ${event.itemId}`, "loot");
              }
              trackItemDrop(event.itemId);
              sessionCombatLootRef.current[finalItemId] = (sessionCombatLootRef.current[finalItemId] || 0) + event.quantity;
            }
            break;
          }

          case "xp_gain": {
            if (event.xp) {
              grantCombatXpInternal(event.xp.attack, event.xp.strength, event.xp.defence, event.xp.hitpoints);
            }
            break;
          }

          case "player_died": {
            getPlaySfx()?.('combat', 'player_death');
            combatEventCallbacksRef.current.onDeath?.();
            combatEventCallbacksRef.current.onCombatLog?.(t(languageRef.current, 'youWereDefeated'), "death");
            setCombatSessionStats(prev => prev ? { ...prev, deaths: prev.deaths + 1 } : null);
            trackDeath();

            const brokenItems = applyDeathDurabilityInternal();
            if (brokenItems.length > 0) {
              brokenItems.forEach(itemId => {
                combatEventCallbacksRef.current.onCombatLog?.(t(languageRef.current, 'itemBrokeDestroyed').replace('{0}', itemId), "death");
              });
            }

            pendingSkillTimeoutsRef.current.forEach(t => clearTimeout(t));
            pendingSkillTimeoutsRef.current = [];

            setTaskQueue([]);
            taskQueueRef.current = [];
            queueItemExpiresAtRef.current = 0;
            clearQueueFn();

            const stoppedCombat = activeCombatRef.current ? {
              ...activeCombatRef.current,
              stopped: true,
              monsterCurrentHp: 0,
            } : null;
            setActiveCombat(null);
            activeCombatRef.current = null;
            saveCombatState(stoppedCombat);

            currentHitpointsRef.current = 0;
            setCurrentHitpoints(0);

            lastPlayerAttackTimeRef.current = 0;
            lastMonsterAttackTimeRef.current = 0;
            isProcessingRespawnRef.current = false;
            combatDebuffsRef.current = [];
            setCombatDebuffs([]);
            combatStateRef.current = null;
            combatRngRef.current = null;
            lastCombatTickTimeRef.current = 0;
            return;
          }

          case "respawn": {
            isProcessingRespawnRef.current = false;
            const scaledMonsterHp = currentMonster.maxHitpoints * COMBAT_HP_SCALE;
            setActiveCombat(prev => {
              if (!prev) return null;
              const updated = { ...prev, monsterCurrentHp: scaledMonsterHp, playerLastAttackTime: Date.now(), monsterLastAttackTime: Date.now() };
              activeCombatRef.current = updated;
              saveCombatState(updated);
              return updated;
            });
            combatEventCallbacksRef.current.onRespawnEnd?.();
            combatEventCallbacksRef.current.onCombatLog?.(t(languageRef.current, 'newMonsterAppeared').replace('{0}', localizedMonsterName), "player_hit");
            break;
          }
        }
      }

      if (engineResult.state.playerHp <= 0) return;

      const newPlayerHp = engineResult.state.playerHp;
      const newMonsterHp = engineResult.state.monsterHp;
      const prevPlayerHp = currentHitpointsRef.current;
      const prevMonsterHp = activeCombatRef.current?.monsterCurrentHp;

      currentHitpointsRef.current = newPlayerHp;

      const hpChanged = prevPlayerHp !== newPlayerHp;
      const monsterHpChanged = prevMonsterHp !== newMonsterHp;

      if (monsterHpChanged) {
        const updated = activeCombatRef.current ? { ...activeCombatRef.current, monsterCurrentHp: newMonsterHp } : null;
        if (updated) activeCombatRef.current = updated;
      }

      const hasEvent = engineResult.events.length > 0;
      const timeSinceSync = now - lastCombatStateSyncRef.current;
      if ((hpChanged || monsterHpChanged) && (hasEvent || timeSinceSync >= COMBAT_STATE_SYNC_INTERVAL)) {
        lastCombatStateSyncRef.current = now;
        if (hpChanged) setCurrentHitpoints(newPlayerHp);
        if (monsterHpChanged) {
          setActiveCombat(prev => {
            if (!prev) return null;
            const updated = { ...prev, monsterCurrentHp: newMonsterHp };
            saveCombatState(updated);
            return updated;
          });
        }
      }

      const playerProgress = Math.min(100, (engineResult.state.playerAttackAccumulator / engineResult.state.weaponAttackSpeed) * 100);
      const monsterProgress = Math.min(100, (engineResult.state.monsterAttackAccumulator / engineResult.state.monsterStats.attackSpeed) * 100);
      combatEventCallbacksRef.current.onPlayerAttackProgress?.(playerProgress);
      combatEventCallbacksRef.current.onMonsterAttackProgress?.(monsterProgress);
    };
    
    // Internal helper functions that use refs directly (to avoid closure issues)
    const eatFoodInternal = (foodId: string): boolean => {
      const currentInv = inventoryRef.current;
      if (!currentInv[foodId] || currentInv[foodId] <= 0) return false;
      if (!isFood(foodId)) return false;
      
      // Remove from inventory
      setInventory(prev => {
        const newQty = (prev[foodId] || 0) - 1;
        const newInventory = newQty <= 0 
          ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== foodId))
          : { ...prev, [foodId]: newQty };
        inventoryRef.current = newInventory;
        return newInventory;
      });
      
      setCombatSessionStats(prev => prev ? { ...prev, foodEaten: prev.foodEaten + 1 } : null);
      trackFoodEaten();
      return true;
    };
    
    const eatFoodUntilFullInternal = (foodId: string, currentHp: number, maxHp: number): { count: number; healed: number } => {
      const currentInv = inventoryRef.current;
      if (!currentInv[foodId] || !isFood(foodId) || currentHp >= maxHp) return { count: 0, healed: 0 };
      
      const healPerFood = getFoodHealAmount(foodId);
      if (healPerFood <= 0) return { count: 0, healed: 0 };
      
      const hpNeeded = maxHp - currentHp;
      const foodNeeded = Math.ceil(hpNeeded / healPerFood);
      const foodToEat = Math.min(foodNeeded, currentInv[foodId]);
      if (foodToEat <= 0) return { count: 0, healed: 0 };
      
      const totalHeal = Math.min(foodToEat * healPerFood, hpNeeded);
      
      // Remove from inventory
      setInventory(prev => {
        const newQty = (prev[foodId] || 0) - foodToEat;
        const newInventory = newQty <= 0 
          ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== foodId))
          : { ...prev, [foodId]: newQty };
        inventoryRef.current = newInventory;
        return newInventory;
      });
      
      setCombatSessionStats(prev => prev ? { ...prev, foodEaten: prev.foodEaten + foodToEat } : null);
      for (let i = 0; i < foodToEat; i++) trackFoodEaten();
      trackHpHealed(totalHeal);
      return { count: foodToEat, healed: totalHeal };
    };
    
    // Internal potion function for auto-potion (no toast, uses refs directly)
    const usePotionInternal = (potionId: string): boolean => {
      const currentInv = inventoryRef.current;
      if (!currentInv[potionId] || currentInv[potionId] <= 0) return false;
      
      const potionItem = getBaseItem(potionId);
      if (!potionItem || potionItem.type !== "potion" || !potionItem.effect || !potionItem.duration) {
        return false;
      }
      
      const now = Date.now();
      const effectType = potionItem.effect.type;
      const effectValue = potionItem.effect.value;
      const durationMs = potionItem.duration * 1000;
      
      // Remove from inventory
      setInventory(prev => {
        const newQty = (prev[potionId] || 0) - 1;
        const newInventory = newQty <= 0 
          ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== potionId))
          : { ...prev, [potionId]: newQty };
        inventoryRef.current = newInventory;
        return newInventory;
      });
      
      // Create new buff
      const newBuff: ActiveBuff = {
        potionId,
        effectType,
        value: effectValue,
        startTime: now,
        duration: durationMs,
        expiresAt: now + durationMs,
      };
      
      // Replace existing buff of same type or add new one
      setActiveBuffs(prev => {
        const filtered = prev.filter(buff => buff.effectType !== effectType);
        const newBuffs = [...filtered, newBuff];
        activeBuffsRef.current = newBuffs;
        return newBuffs;
      });
      
      return true;
    };
    
    const addLootInternal = (itemId: string, quantity: number) => {
      if (itemId === "Gold Coins") {
        setGold(prev => {
          const newGold = prev + quantity;
          goldRef.current = newGold;
          return newGold;
        });
      } else {
        setInventory(prev => {
          const newInventory = { ...prev, [itemId]: (prev[itemId] || 0) + quantity };
          inventoryRef.current = newInventory;
          return newInventory;
        });
      }
    };
    
    const grantCombatXpInternal = (attackXp: number, strengthXp: number, defenceXp: number, hitpointsXp: number) => {
      const currentStyle = combatStyleRef.current;
      const totalCombatXp = attackXp + strengthXp + defenceXp;
      
      let finalAttackXp: number, finalStrengthXp: number, finalDefenceXp: number;
      if (currentStyle === "attack") {
        finalAttackXp = Math.floor(totalCombatXp * 0.70);
        finalStrengthXp = Math.floor(totalCombatXp * 0.20);
        finalDefenceXp = totalCombatXp - finalAttackXp - finalStrengthXp;
      } else if (currentStyle === "defence") {
        finalDefenceXp = Math.floor(totalCombatXp * 0.70);
        finalStrengthXp = Math.floor(totalCombatXp * 0.20);
        finalAttackXp = totalCombatXp - finalDefenceXp - finalStrengthXp;
      } else {
        finalAttackXp = Math.floor(totalCombatXp * 0.33);
        finalDefenceXp = Math.floor(totalCombatXp * 0.33);
        finalStrengthXp = totalCombatXp - finalAttackXp - finalDefenceXp;
      }
      
      setSkills(prev => {
        const newSkills = { ...prev };
        let anyCombatLevelUp = false;
        
        if (finalAttackXp > 0) {
          const current = prev.attack || { xp: 0, level: 1 };
          const newXp = current.xp + finalAttackXp;
          const newLevel = getLevelFromXp(newXp);
          if (newLevel > current.level) anyCombatLevelUp = true;
          newSkills.attack = { xp: newXp, level: newLevel };
        }
        if (finalStrengthXp > 0) {
          const current = prev.strength || { xp: 0, level: 1 };
          const newXp = current.xp + finalStrengthXp;
          const newLevel = getLevelFromXp(newXp);
          if (newLevel > current.level) anyCombatLevelUp = true;
          newSkills.strength = { xp: newXp, level: newLevel };
        }
        if (finalDefenceXp > 0) {
          const current = prev.defence || { xp: 0, level: 1 };
          const newXp = current.xp + finalDefenceXp;
          const newLevel = getLevelFromXp(newXp);
          if (newLevel > current.level) anyCombatLevelUp = true;
          newSkills.defence = { xp: newXp, level: newLevel };
        }
        if (hitpointsXp > 0) {
          const current = prev.hitpoints || { xp: 1154, level: 10 };
          const newXp = current.xp + hitpointsXp;
          const newLevel = getLevelFromXp(newXp);
          if (newLevel > current.level) anyCombatLevelUp = true;
          newSkills.hitpoints = { xp: newXp, level: newLevel };
        }
        
        if (anyCombatLevelUp) {
          getPlaySfx()?.('progression', 'level_up');
        }
        
        skillsRef.current = newSkills;
        return newSkills;
      });
      
      // Track achievement combat XP
      if (finalAttackXp > 0) trackCombatXp("attack", finalAttackXp);
      if (finalStrengthXp > 0) trackCombatXp("strength", finalStrengthXp);
      if (finalDefenceXp > 0) trackCombatXp("defence", finalDefenceXp);
      if (hitpointsXp > 0) trackCombatXp("hitpoints", hitpointsXp);
      
      // Track XP in session stats
      setCombatSessionStats(prev => {
        if (!prev) return null;
        return {
          ...prev,
          xpGained: {
            ...prev.xpGained,
            attack: (prev.xpGained.attack || 0) + finalAttackXp,
            strength: (prev.xpGained.strength || 0) + finalStrengthXp,
            defence: (prev.xpGained.defence || 0) + finalDefenceXp,
            hitpoints: (prev.xpGained.hitpoints || 0) + hitpointsXp
          }
        };
      });
    };
    
    // Internal durability functions - synchronous state updates with async API sync
    
    const applyCombatDurabilityInternal = (): string[] => {
      const currentEquipment = equipmentRef.current;
      const hasEquipment = Object.values(currentEquipment).some(item => item !== null);
      if (!hasEquipment) return [];

      const brokenItems: string[] = [];
      const slotsToBreak: string[] = [];
      const currentDurability = { ...equipmentDurabilityRef.current };
      let changed = false;
      
      for (const slot of Object.keys(currentEquipment)) {
        const itemId = currentEquipment[slot as EquipmentSlot];
        if (!itemId) continue;
        
        // Skip if already pending break for this slot
        if (pendingBreakSlotsRef.current.has(slot)) continue;
        
        if (currentDurability[slot] === undefined) {
          currentDurability[slot] = MAX_DURABILITY;
        }
        
        const prevDur = currentDurability[slot];
        const newDur = Math.max(MIN_DURABILITY, prevDur - DURABILITY_LOSS_PER_HIT);
        
        if (newDur !== prevDur) {
          currentDurability[slot] = newDur;
          changed = true;
          
          // Check for breakage when durability reaches 10%
          if (newDur <= MIN_DURABILITY) {
            const baseItem = getBaseItem(itemId);
            const rarity = baseItem?.rarity || "Common";
            const breakChance = BREAKAGE_CHANCES[rarity] || BREAKAGE_CHANCES["Common"];
            
            if (Math.random() < breakChance) {
              slotsToBreak.push(slot);
              brokenItems.push(itemId);
              pendingBreakSlotsRef.current.add(slot);
            }
          }
        }
      }
      
      // Synchronously update refs and state for durability
      if (changed) {
        equipmentDurabilityRef.current = currentDurability;
        setEquipmentDurability(currentDurability);
      }
      
      // Handle breakages: update state synchronously, API call async
      if (slotsToBreak.length > 0) {
        const newEquipment = { ...equipmentRef.current };
        const newDurability = { ...equipmentDurabilityRef.current };
        for (const slot of slotsToBreak) {
          newEquipment[slot as EquipmentSlot] = null;
          delete newDurability[slot];
        }
        equipmentRef.current = newEquipment;
        equipmentDurabilityRef.current = newDurability;
        setEquipment(newEquipment);
        setEquipmentDurability(newDurability);
        
        // Fire async API calls (don't await)
        slotsToBreak.forEach(slot => {
          fetch("/api/equipment/break", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: 'include',
            body: JSON.stringify({ slot }),
          }).catch(err => console.error(`Failed to sync break ${slot}:`, err))
            .finally(() => pendingBreakSlotsRef.current.delete(slot));
        });
      }
      
      return brokenItems;
    };
    
    const applyDeathDurabilityInternal = (): string[] => {
      const currentEquipment = equipmentRef.current;
      const brokenItems: string[] = [];
      const slotsToBreak: string[] = [];
      const currentDurability = { ...equipmentDurabilityRef.current };
      
      // Death break chance formula constants
      const DEATH_BASE_BREAK_CHANCE = 0.10; // 10% base for Common at 100% durability
      const DEATH_DURABILITY_FACTOR = 0.30; // Up to 30% additional at 0% durability
      const DEATH_RARITY_MULTIPLIERS: Record<string, number> = {
        "Common": 1.0,
        "Uncommon": 0.8,
        "Rare": 0.6,
        "Epic": 0.4,
        "Legendary": 0.2,
        "Mythic": 0.1,
      };
      
      for (const slot of Object.keys(currentEquipment)) {
        const itemId = currentEquipment[slot as EquipmentSlot];
        if (!itemId) continue;
        
        // Skip if already pending break for this slot
        if (pendingBreakSlotsRef.current.has(slot)) continue;
        
        if (currentDurability[slot] === undefined) {
          currentDurability[slot] = MAX_DURABILITY;
        }
        
        const durabilityBeforeDeath = currentDurability[slot];
        
        const durabilityPenaltyFactor = (100 - durabilityBeforeDeath) / 100;
        const baseItem = getBaseItem(itemId);
        const rarity = baseItem?.rarity || "Common";
        const rarityMultiplier = DEATH_RARITY_MULTIPLIERS[rarity] || 1.0;
        const directBreakChance = durabilityBeforeDeath >= 60 ? 0 : (DEATH_BASE_BREAK_CHANCE + DEATH_DURABILITY_FACTOR * durabilityPenaltyFactor) * rarityMultiplier;
        
        if (Math.random() < directBreakChance) {
          slotsToBreak.push(slot);
          brokenItems.push(itemId);
          pendingBreakSlotsRef.current.add(slot);
          continue;
        }
        
        // Apply durability penalty if item didn't break
        const penalty = DEATH_DURABILITY_LOSS_MIN + Math.random() * (DEATH_DURABILITY_LOSS_MAX - DEATH_DURABILITY_LOSS_MIN);
        const newDur = Math.max(MIN_DURABILITY, durabilityBeforeDeath - penalty);
        currentDurability[slot] = newDur;
      }
      
      // Synchronously update durability refs and state
      equipmentDurabilityRef.current = currentDurability;
      setEquipmentDurability(currentDurability);
      
      // Handle breakages: update state synchronously, API call async
      if (slotsToBreak.length > 0) {
        const newEquipment = { ...equipmentRef.current };
        const newDurability = { ...equipmentDurabilityRef.current };
        for (const slot of slotsToBreak) {
          newEquipment[slot as EquipmentSlot] = null;
          delete newDurability[slot];
        }
        equipmentRef.current = newEquipment;
        equipmentDurabilityRef.current = newDurability;
        setEquipment(newEquipment);
        setEquipmentDurability(newDurability);
        
        // Fire async API calls (don't await)
        slotsToBreak.forEach(slot => {
          fetch("/api/equipment/break", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: 'include',
            body: JSON.stringify({ slot }),
          }).catch(err => console.error(`Failed to sync break ${slot}:`, err))
            .finally(() => pendingBreakSlotsRef.current.delete(slot));
        });
      }
      
      return brokenItems;
    };
    
    // Start the interval
    combatTickIntervalRef.current = setInterval(combatTick, 100);
    
    return () => {
      if (combatTickIntervalRef.current) {
        clearInterval(combatTickIntervalRef.current);
        combatTickIntervalRef.current = null;
      }
      if (respawnTimerRef.current) {
        clearTimeout(respawnTimerRef.current);
        respawnTimerRef.current = null;
      }
    };
  }, []); // Empty deps - interval runs once and persists across page navigation
  
  // Function to register combat event callbacks (for CombatPage UI updates)
  const registerCombatCallbacks = useCallback((callbacks: typeof combatEventCallbacksRef.current) => {
    combatEventCallbacksRef.current = callbacks;
  }, []);
  
  // Function to unregister combat event callbacks
  const unregisterCombatCallbacks = useCallback(() => {
    combatEventCallbacksRef.current = {};
  }, []);

  const equipItem = useCallback((itemId: string, targetSlot?: EquipmentSlot): boolean => {
    // Handle items with instance suffix (damaged items have unique ID like "Bronze Sword (Uncommon)#a1b2c3")
    const hasUniqueSuffix = hasInstanceSuffix(itemId);
    const baseItemId = hasUniqueSuffix ? stripInstanceSuffix(itemId) : itemId;
    
    // Handle items with rarity suffix like "Bronze Sword (Uncommon)"
    const baseItem = getBaseItem(baseItemId);
    if (!baseItem || baseItem.type !== "equipment" || !baseItem.equipSlot) return false;
    if (!inventoryRef.current[itemId] || inventoryRef.current[itemId] < 1) return false;
    
    let slot = targetSlot || baseItem.equipSlot;
    
    // Dual dagger support: If equipping a dagger and main hand already has a dagger, put this in off-hand
    // Skip redirect when targetSlot is explicitly specified (e.g., from equipment panel swap)
    if (!targetSlot && baseItem.weaponCategory === "dagger" && slot === "weapon") {
      const currentWeaponId = equipmentRef.current["weapon"];
      if (currentWeaponId) {
        const currentWeapon = getBaseItem(currentWeaponId);
        if (currentWeapon?.weaponCategory === "dagger") {
          // Redirect to shield (off-hand) slot
          slot = "shield";
        }
      }
    }
    
    // Off-hand restrictions based on main hand weapon
    if (slot === "shield") {
      const currentWeaponId = equipmentRef.current["weapon"];
      if (currentWeaponId) {
        const currentWeapon = getBaseItem(currentWeaponId);
        if (currentWeapon?.weaponCategory === "staff" || currentWeapon?.weaponCategory === "bow" || currentWeapon?.weaponCategory === "2h_sword" || currentWeapon?.weaponCategory === "2h_axe" || currentWeapon?.weaponCategory === "2h_warhammer") {
          toast({
            title: t(language, 'cannotEquip'),
            description: t(language, 'twoHandedWeaponNoOffhand'),
            variant: "destructive"
          });
          return false;
        }
        // Dagger only allows another dagger in off-hand
        if (currentWeapon?.weaponCategory === "dagger") {
          if (baseItem.weaponCategory !== "dagger") {
            toast({
              title: t(language, 'cannotEquip'),
              description: t(language, 'daggerOnlyOffhand'),
              variant: "destructive"
            });
            return false;
          }
        }
      }
    }
    
    // Prevent equipping to slot with pending break operation (race condition guard)
    if (pendingBreakSlotsRef.current.has(slot)) {
      toast({
        title: t(language, 'pleaseWait'),
        description: t(language, 'operationInProgress'),
        variant: "destructive"
      });
      return false;
    }
    
    // Check level requirements (skip in debug mode)
    if (baseItem.levelRequired && !debugModeRef.current) {
      // Determine required skill: use skillRequired if specified, otherwise derive from slot
      let requiredSkill = baseItem.skillRequired;
      if (!requiredSkill) {
        // Weapons require Attack, armor/accessories require Defence
        requiredSkill = slot === "weapon" ? "attack" : "defence";
      }
      
      const playerSkillLevel = skillsRef.current[requiredSkill]?.level || 1;
      if (playerSkillLevel < baseItem.levelRequired) {
        const skillNames: Record<string, string> = {
          attack: t(language, 'skillAttack'),
          defence: t(language, 'skillDefence'),
          strength: t(language, 'skillStrength')
        };
        toast({
          title: t(language, 'levelInsufficient'),
          description: t(language, 'levelRequirementMessage').replace('{0}', skillNames[requiredSkill] || requiredSkill).replace('{1}', String(baseItem.levelRequired)),
          variant: "destructive"
        });
        return false;
      }
    }
    
    // Check mastery requirement for weapons (skip in debug mode)
    if (baseItem.masteryRequired && baseItem.masteryRequired > 1 && baseItem.weaponCategory && !debugModeRef.current) {
      const masteryType = mapWeaponCategoryToMasteryType(baseItem.weaponCategory);
      if (masteryType) {
        const playerMasteryLevel = getMasteryLevelFromXp(masteriesRef.current[getMasteryFieldName(masteryType) as keyof PlayerMasteries] || 0);
        if (playerMasteryLevel < baseItem.masteryRequired) {
          toast({
            title: t(language, 'cannotEquip'),
            description: t(language, 'masteryNotMet'),
            variant: "destructive"
          });
          return false;
        }
      }
    }
    
    let autoUnequipOffhandId: string | null = null;
    let autoUnequipOffhandDurability = MAX_DURABILITY;
    if (slot === "weapon") {
      const offhandItemId = equipmentRef.current["shield"];
      if (offhandItemId) {
        const offhandBaseId = hasInstanceSuffix(offhandItemId) ? stripInstanceSuffix(offhandItemId) : offhandItemId;
        const offhandBase = getBaseItem(offhandBaseId);
        const shouldUnequipOffhand = baseItem.weaponCategory === "dagger"
          ? (!offhandBase || offhandBase.weaponCategory !== "dagger")
          : (offhandBase?.weaponCategory === "dagger");
        if (shouldUnequipOffhand) {
          autoUnequipOffhandDurability = equipmentDurabilityRef.current["shield"] ?? MAX_DURABILITY;
          const offhandHasEnhancement = !!(itemModificationsRef.current[offhandItemId]);
          if (autoUnequipOffhandDurability < MAX_DURABILITY) {
            // Damaged item: always add/keep instance suffix
            autoUnequipOffhandId = hasInstanceSuffix(offhandItemId) ? offhandItemId : addInstanceSuffix(offhandItemId);
          } else if (offhandHasEnhancement && !hasInstanceSuffix(offhandItemId)) {
            // Enhancement safety: add instance suffix so enhancement key stays unique
            // This prevents colliding with another same-name item already in inventory
            autoUnequipOffhandId = addInstanceSuffix(offhandItemId);
          } else {
            autoUnequipOffhandId = offhandItemId;
          }
          // Transfer mods if key changes
          if (offhandItemId !== autoUnequipOffhandId) {
            const offhandMods = itemModificationsRef.current[offhandItemId];
            if (offhandMods) {
              setItemModifications(prev => {
                const updated = { ...prev };
                updated[autoUnequipOffhandId!] = offhandMods;
                delete updated[offhandItemId];
                itemModificationsRef.current = updated;
                return updated;
              });
            }
          }
          // Clear shield slot
          setEquipment(prev => {
            const newEquipment = { ...prev, shield: undefined as any };
            equipmentRef.current = newEquipment;
            return newEquipment;
          });
          setEquipmentDurability(prev => {
            const newDurability = { ...prev };
            delete newDurability["shield"];
            equipmentDurabilityRef.current = newDurability;
            return newDurability;
          });
        }
      }
    }

    const currentEquipped = equipmentRef.current[slot];
    
    // Compute returnItemId for currently equipped item (if any)
    let returnItemId: string | null = null;
    let currentEquippedDurability = MAX_DURABILITY;
    if (currentEquipped) {
      currentEquippedDurability = equipmentDurabilityRef.current[slot] ?? MAX_DURABILITY;
      if (currentEquippedDurability < MAX_DURABILITY) {
        returnItemId = hasInstanceSuffix(currentEquipped) ? currentEquipped : addInstanceSuffix(currentEquipped);
      } else {
        returnItemId = currentEquipped;
      }
    }
    
    // ATOMIC inventory update: add old item back + remove new item in ONE call
    const savedDurability = inventoryDurabilityRef.current[itemId];
    setInventory(prev => {
      const newInventory = { ...prev };
      // Add auto-unequipped off-hand item back to inventory
      if (autoUnequipOffhandId) {
        newInventory[autoUnequipOffhandId] = (newInventory[autoUnequipOffhandId] || 0) + 1;
      }
      // Add old equipped item back to inventory
      if (returnItemId) {
        newInventory[returnItemId] = (newInventory[returnItemId] || 0) + 1;
      }
      // Remove new item from inventory
      const currentQty = newInventory[itemId] || 0;
      if (currentQty <= 1) {
        delete newInventory[itemId];
      } else {
        newInventory[itemId] = currentQty - 1;
      }
      inventoryRef.current = newInventory;
      return newInventory;
    });
    
    // Transfer old equipped item mods to new inventory key (only if key changes due to damage suffix)
    if (currentEquipped && returnItemId && returnItemId !== currentEquipped) {
      const oldEquippedMods = itemModificationsRef.current[currentEquipped];
      if (oldEquippedMods) {
        setItemModifications(prev => {
          const updated = { ...prev };
          updated[returnItemId!] = oldEquippedMods;
          delete updated[currentEquipped!];
          itemModificationsRef.current = updated;
          return updated;
        });
      }
    }
    
    // Track durability for the returned item (only if damaged)
    if (returnItemId && currentEquippedDurability < MAX_DURABILITY) {
      setInventoryDurability(prev => {
        const newDurability = { ...prev, [returnItemId!]: currentEquippedDurability };
        inventoryDurabilityRef.current = newDurability;
        return newDurability;
      });
    }
    
    // Track durability for auto-unequipped off-hand item (only if damaged)
    if (autoUnequipOffhandId && autoUnequipOffhandDurability < MAX_DURABILITY) {
      setInventoryDurability(prev => {
        const newDurability = { ...prev, [autoUnequipOffhandId!]: autoUnequipOffhandDurability };
        inventoryDurabilityRef.current = newDurability;
        return newDurability;
      });
    }
    
    // Set new equipment - store full itemId (with hash) to preserve enhancement data lookups
    setEquipment(prev => {
      const newEquipment = { ...prev, [slot]: itemId };
      equipmentRef.current = newEquipment;
      return newEquipment;
    });
    
    // Set equipment durability from inventory or 100% for new items
    setEquipmentDurability(prev => {
      const newDurability = { ...prev, [slot]: savedDurability ?? MAX_DURABILITY };
      equipmentDurabilityRef.current = newDurability;
      return newDurability;
    });
    
    // Clear inventory durability for newly equipped item
    if (savedDurability !== undefined) {
      setInventoryDurability(prev => {
        const newDurability = { ...prev };
        delete newDurability[itemId];
        inventoryDurabilityRef.current = newDurability;
        return newDurability;
      });
    }
    
    trackItemEquipped();
    return true;
  }, [toast]);
  
  const unequipItem = useCallback((slot: EquipmentSlot): void => {
    const itemId = equipmentRef.current[slot];
    if (!itemId) return;
    
    // Get current durability before clearing it
    const currentDurability = equipmentDurabilityRef.current[slot] ?? MAX_DURABILITY;
    
    // For damaged items (<100%), add unique instance suffix to prevent stacking
    // Items at 100% durability can stack normally
    // If item already has a hash suffix, don't add another one (prevents double-hashing)
    const inventoryItemId = currentDurability < MAX_DURABILITY 
      ? (hasInstanceSuffix(itemId) ? itemId : addInstanceSuffix(itemId))
      : itemId;
    
    setInventory(prev => {
      const newInventory = {
        ...prev,
        [inventoryItemId]: (prev[inventoryItemId] || 0) + 1
      };
      inventoryRef.current = newInventory;
      return newInventory;
    });
    
    // Transfer itemModifications from equipment key (base ID) to inventory key
    if (itemModificationsRef.current[itemId]) {
      const mods = itemModificationsRef.current[itemId];
      setItemModifications(prev => {
        const updated = { ...prev, [inventoryItemId]: mods };
        if (inventoryItemId !== itemId) {
          delete updated[itemId];
        }
        itemModificationsRef.current = updated;
        return updated;
      });
    }
    
    setEquipment(prev => {
      const newEquipment = { ...prev, [slot]: null };
      equipmentRef.current = newEquipment;
      return newEquipment;
    });
    
    // Transfer durability to inventory durability (only for damaged items)
    if (currentDurability < MAX_DURABILITY) {
      setInventoryDurability(prev => {
        const newDurability = { ...prev, [inventoryItemId]: currentDurability };
        inventoryDurabilityRef.current = newDurability;
        return newDurability;
      });
    }
    
    // Clear durability tracking for this slot
    setEquipmentDurability(prev => {
      const newDurability = { ...prev };
      delete newDurability[slot];
      equipmentDurabilityRef.current = newDurability;
      return newDurability;
    });
  }, []);
  
  const getEquipmentBonuses = useCallback((): ItemStats => {
    return getTotalEquipmentBonus(equipmentRef.current, itemModificationsRef.current);
  }, []);

  // Apply very slow durability loss from combat actions (hitting or being hit)
  // Items can only break during combat when durability reaches 10%
  // Returns list of broken items
  const applyCombatDurabilityLoss = useCallback(async (): Promise<string[]> => {
    const currentEquipment = equipmentRef.current;
    const hasEquipment = Object.values(currentEquipment).some(item => item !== null);
    if (!hasEquipment) return [];

    const brokenItems: string[] = [];
    const slotsToBreak: string[] = [];
    const currentDurability = equipmentDurabilityRef.current;
    const newDurability = { ...currentDurability };
    let changed = false;
    
    for (const slot of Object.keys(currentEquipment)) {
      const itemId = currentEquipment[slot as EquipmentSlot];
      if (!itemId) continue;
      
      // Initialize at 100% if not tracked
      if (newDurability[slot] === undefined) {
        newDurability[slot] = MAX_DURABILITY;
      }
      
      const prevDur = newDurability[slot];
      // Apply very small durability loss (0.0025% per action)
      const newDur = Math.max(MIN_DURABILITY, prevDur - DURABILITY_LOSS_PER_HIT);
      
      if (newDur !== prevDur) {
        newDurability[slot] = newDur;
        changed = true;
        
        // Check for breakage when durability reaches 10%
        if (newDur <= MIN_DURABILITY) {
          const baseItem = getBaseItem(itemId);
          const rarity = baseItem?.rarity || "Common";
          const breakChance = BREAKAGE_CHANCES[rarity] || BREAKAGE_CHANCES["Common"];
          
          if (Math.random() < breakChance) {
            slotsToBreak.push(slot);
            brokenItems.push(itemId);
          }
        }
      }
    }
    
    if (changed) {
      setEquipmentDurability(newDurability);
      equipmentDurabilityRef.current = newDurability;
    }
    
    // Break items via API (immediate DB sync)
    for (const slot of slotsToBreak) {
      try {
        await fetch("/api/equipment/break", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: 'include',
          body: JSON.stringify({ slot }),
        });
        
        // Update local state
        setEquipment(prev => {
          const newEquipment = { ...prev, [slot as EquipmentSlot]: null };
          equipmentRef.current = newEquipment;
          return newEquipment;
        });
        
        // Remove durability tracking
        setEquipmentDurability(prev => {
          const updated = { ...prev };
          delete updated[slot];
          equipmentDurabilityRef.current = updated;
          return updated;
        });
      } catch (error) {
        console.error(`Failed to break equipment in slot ${slot}:`, error);
      }
    }
    
    return brokenItems;
  }, []);

  // Apply death durability penalty with direct break chance
  // Break chance is based on current durability AND rarity
  // Mythic at 100% = ~1%, Common at 10% = ~37%
  // Returns list of broken items
  const applyDeathDurabilityPenalty = useCallback(async (): Promise<string[]> => {
    const currentEquipment = equipmentRef.current;
    const currentDurability = equipmentDurabilityRef.current;
    const brokenItems: string[] = [];
    const slotsToBreak: string[] = [];
    
    // Death break chance formula constants (same as internal for parity)
    const DEATH_BASE_BREAK_CHANCE = 0.10; // 10% base for Common at 100% durability
    const DEATH_DURABILITY_FACTOR = 0.30; // Up to 30% additional at 0% durability
    const DEATH_RARITY_MULTIPLIERS: Record<string, number> = {
      "Common": 1.0,
      "Uncommon": 0.8,
      "Rare": 0.6,
      "Epic": 0.4,
      "Legendary": 0.2,
      "Mythic": 0.1,
    };
    
    // Calculate new durability and check for breakage
    const newDurability = { ...currentDurability };
    
    for (const slot of Object.keys(currentEquipment)) {
      const itemId = currentEquipment[slot as EquipmentSlot];
      if (!itemId) continue;
      
      // Initialize at 100% if not tracked
      if (newDurability[slot] === undefined) {
        newDurability[slot] = MAX_DURABILITY;
      }
      
      const durabilityBeforeDeath = newDurability[slot];
      
      const durabilityPenaltyFactor = (100 - durabilityBeforeDeath) / 100;
      const baseItem = getBaseItem(itemId);
      const rarity = baseItem?.rarity || "Common";
      const rarityMultiplier = DEATH_RARITY_MULTIPLIERS[rarity] || 1.0;
      const directBreakChance = durabilityBeforeDeath >= 60 ? 0 : (DEATH_BASE_BREAK_CHANCE + DEATH_DURABILITY_FACTOR * durabilityPenaltyFactor) * rarityMultiplier;
      
      if (Math.random() < directBreakChance) {
        slotsToBreak.push(slot);
        brokenItems.push(itemId);
        continue;
      }
      
      // Apply random death penalty (25-50%) if item didn't break
      const penalty = DEATH_DURABILITY_LOSS_MIN + Math.random() * (DEATH_DURABILITY_LOSS_MAX - DEATH_DURABILITY_LOSS_MIN);
      const newDur = Math.max(MIN_DURABILITY, durabilityBeforeDeath - penalty);
      newDurability[slot] = newDur;
    }
    
    // Update durability state
    setEquipmentDurability(newDurability);
    equipmentDurabilityRef.current = newDurability;
    
    // Break items via API (immediate DB sync)
    for (const slot of slotsToBreak) {
      try {
        await fetch("/api/equipment/break", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: 'include',
          body: JSON.stringify({ slot }),
        });
        
        // Update local state
        setEquipment(prev => {
          const newEquipment = { ...prev, [slot as EquipmentSlot]: null };
          equipmentRef.current = newEquipment;
          return newEquipment;
        });
        
        // Remove durability tracking
        setEquipmentDurability(prev => {
          const updated = { ...prev };
          delete updated[slot];
          equipmentDurabilityRef.current = updated;
          return updated;
        });
      } catch (error) {
        console.error(`Failed to break equipment in slot ${slot}:`, error);
      }
    }
    
    return brokenItems;
  }, []);

  // Get durability for a slot (returns percentage 10-100)
  const getSlotDurability = useCallback((slot: EquipmentSlot): number => {
    return equipmentDurabilityRef.current[slot] ?? MAX_DURABILITY;
  }, []);

  // Check if any equipment is in danger zone (at MIN_DURABILITY)
  const hasLowDurabilityEquipment = useCallback((): boolean => {
    const currentEquipment = equipmentRef.current;
    const currentDurability = equipmentDurabilityRef.current;
    
    for (const slot of Object.keys(currentEquipment)) {
      const itemId = currentEquipment[slot as EquipmentSlot];
      if (!itemId) continue;
      
      const dur = currentDurability[slot] ?? MAX_DURABILITY;
      if (dur <= MIN_DURABILITY) {
        return true;
      }
    }
    return false;
  }, []);
  
  // Get durability for an item in inventory (returns percentage, defaults to 100 if not tracked)
  const getItemDurability = useCallback((itemId: string): number => {
    return inventoryDurabilityRef.current[itemId] ?? MAX_DURABILITY;
  }, []);
  
  // Check if an item can be listed on the market (requires 100% durability for equipment)
  const canListOnMarket = useCallback((itemId: string): boolean => {
    const baseItem = getBaseItem(itemId);
    if (!baseItem || baseItem.type !== "equipment") return true; // Non-equipment can always be listed
    
    const durability = inventoryDurabilityRef.current[itemId] ?? MAX_DURABILITY;
    return durability >= MAX_DURABILITY; // Must be at 100% durability
  }, []);
  
  // Get vendor sell price adjusted for durability
  const getAdjustedVendorPrice = useCallback((itemId: string, basePrice: number): number => {
    const baseItem = getBaseItem(itemId);
    if (!baseItem || baseItem.type !== "equipment") return basePrice; // Non-equipment has full price
    
    const durability = inventoryDurabilityRef.current[itemId] ?? MAX_DURABILITY;
    // Price scales linearly with durability (50% durability = 50% price)
    return Math.floor(basePrice * (durability / 100));
  }, []);
  
  // Repair an item in inventory (restores durability to 100%)
  // For items with unique suffix (damaged items), converts back to normal format to allow stacking
  const repairInventoryItem = useCallback(async (itemId: string): Promise<{ success: boolean; cost: number; error?: string }> => {
    const currentDur = inventoryDurabilityRef.current[itemId] ?? MAX_DURABILITY;
    if (currentDur >= MAX_DURABILITY) {
      return { success: false, cost: 0, error: t(language, 'equipmentFullDurability') };
    }
    
    // Use actual item rarity from the item name (includes variant rarities like Epic, Legendary, etc.)
    const { rarity: parsedRarity } = parseItemWithRarity(itemId);
    const rarity = parsedRarity || "Common";
    const costPerPointMap: Record<string, number> = {
      Common: 60, Uncommon: 90, Rare: 150, Epic: 300, Legendary: 900, Mythic: 6000
    };
    const costPerPoint = costPerPointMap[rarity] || 60;
    const durabilityToRestore = MAX_DURABILITY - currentDur;
    const cost = Math.ceil(durabilityToRestore * costPerPoint);
    
    if (goldRef.current < cost) {
      return { success: false, cost, error: t(language, 'insufficientGoldRepair').replace('{0}', String(cost)) };
    }
    
    // Deduct gold
    setGold(prev => {
      const newGold = prev - cost;
      goldRef.current = newGold;
      return newGold;
    });
    
    // Remove from inventory durability (100% is the default, so we just delete the entry)
    setInventoryDurability(prev => {
      const newDurability = { ...prev };
      delete newDurability[itemId];
      inventoryDurabilityRef.current = newDurability;
      return newDurability;
    });
    
    if (hasInstanceSuffix(itemId)) {
      const hasEnhancement = itemModificationsRef.current[itemId] && 
        (itemModificationsRef.current[itemId].enhancementLevel > 0 || 
         itemModificationsRef.current[itemId].addedSkills?.length > 0 ||
         Object.keys(itemModificationsRef.current[itemId].addedStats || {}).length > 0);
      
      if (!hasEnhancement) {
        const normalItemId = stripInstanceSuffix(itemId);
        setInventory(prev => {
          const newInventory = { ...prev };
          const uniqueQty = newInventory[itemId] || 0;
          if (uniqueQty <= 1) {
            delete newInventory[itemId];
          } else {
            newInventory[itemId] = uniqueQty - 1;
          }
          newInventory[normalItemId] = (newInventory[normalItemId] || 0) + 1;
          inventoryRef.current = newInventory;
          return newInventory;
        });
      }
    }
    
    return { success: true, cost };
  }, []);

  // Repair equipment - restores durability to 100% for a gold cost
  const repairEquipment = useCallback(async (slot: EquipmentSlot): Promise<{ success: boolean; cost: number; error?: string }> => {
    const itemId = equipmentRef.current[slot];
    if (!itemId) {
      return { success: false, cost: 0, error: "Bu slotta ekipman yok" };
    }
    
    const currentDur = equipmentDurabilityRef.current[slot] ?? MAX_DURABILITY;
    if (currentDur >= MAX_DURABILITY) {
      return { success: false, cost: 0, error: t(language, 'equipmentFullDurability') };
    }
    
    // Calculate repair cost based on rarity and durability loss
    const baseItem = getBaseItem(itemId);
    const rarity = baseItem?.rarity || "Common";
    const costPerPoint = (await import("@shared/schema")).REPAIR_COST_PER_POINT[rarity] || 2;
    const durabilityToRestore = MAX_DURABILITY - currentDur;
    const cost = Math.ceil(durabilityToRestore * costPerPoint);
    
    if (goldRef.current < cost) {
      return { success: false, cost, error: t(language, 'insufficientGoldRepair').replace('{0}', String(cost)) };
    }
    
    try {
      const headers: Record<string, string> = getAuthHeaders();
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          headers["Authorization"] = `Bearer ${idToken}`;
        } catch (e) {
          console.error("Failed to get Firebase token for repair:", e);
        }
      }
      
      const response = await fetch("/api/equipment/repair", {
        method: "POST",
        headers,
        credentials: 'include',
        body: JSON.stringify({ slot, cost }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        return { success: false, cost, error: data.error || t(language, 'repairFailed') };
      }
      
      // Update local state
      setEquipmentDurability(prev => {
        const newDurability = { ...prev, [slot]: MAX_DURABILITY };
        equipmentDurabilityRef.current = newDurability;
        return newDurability;
      });
      
      setGold(prev => {
        const newGold = prev - cost;
        goldRef.current = newGold;
        return newGold;
      });
      
      return { success: true, cost };
    } catch (error) {
      console.error(`Failed to repair equipment in slot ${slot}:`, error);
      return { success: false, cost, error: t(language, 'serverError') };
    }
  }, [firebaseUser, getAuthHeaders]);

  // Get repair cost for a single equipment slot
  const getRepairCost = useCallback((slot: EquipmentSlot): number => {
    const itemId = equipmentRef.current[slot];
    if (!itemId) return 0;
    
    const currentDur = equipmentDurabilityRef.current[slot] ?? MAX_DURABILITY;
    if (currentDur >= MAX_DURABILITY) return 0;
    
    const baseItem = getBaseItem(itemId);
    const rarity = baseItem?.rarity || "Common";
    // Repair costs 10x increase (matching repairInventoryItem)
    const costPerPointMap: Record<string, number> = {
      Common: 60, Uncommon: 90, Rare: 150, Epic: 300, Legendary: 900, Mythic: 6000
    };
    const costPerPoint = costPerPointMap[rarity] || 60;
    const durabilityToRestore = MAX_DURABILITY - currentDur;
    return Math.ceil(durabilityToRestore * costPerPoint);
  }, []);

  // Get total repair cost for all equipped items
  const getTotalRepairCost = useCallback((): number => {
    const slots: EquipmentSlot[] = ['weapon', 'shield', 'helmet', 'body', 'legs', 'gloves', 'boots', 'cape', 'ring', 'amulet'];
    let totalCost = 0;
    for (const slot of slots) {
      totalCost += getRepairCost(slot);
    }
    return totalCost;
  }, [getRepairCost]);

  // Repair all equipment at once
  const repairAllEquipment = useCallback(async (): Promise<{ success: boolean; totalCost: number; error?: string }> => {
    const totalCost = getTotalRepairCost();
    if (totalCost === 0) {
      return { success: true, totalCost: 0 };
    }
    
    if (goldRef.current < totalCost) {
      return { success: false, totalCost, error: t(language, 'insufficientGoldTotal').replace('{0}', String(totalCost)) };
    }
    
    try {
      const headers: Record<string, string> = getAuthHeaders();
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          headers["Authorization"] = `Bearer ${idToken}`;
        } catch (e) {
          console.error("Failed to get Firebase token for repair-all:", e);
        }
      }
      
      const response = await fetch("/api/equipment/repair-all", {
        method: "POST",
        headers,
        credentials: 'include',
        body: JSON.stringify({ totalCost }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        return { success: false, totalCost, error: data.error || t(language, 'repairFailed') };
      }
      
      // Update all durabilities to 100%
      setEquipmentDurability(prev => {
        const newDurability: Record<string, number> = {};
        const slots: EquipmentSlot[] = ['weapon', 'shield', 'helmet', 'body', 'legs', 'gloves', 'boots', 'cape', 'ring', 'amulet'];
        for (const slot of slots) {
          if (equipmentRef.current[slot]) {
            newDurability[slot] = MAX_DURABILITY;
          }
        }
        equipmentDurabilityRef.current = newDurability;
        return newDurability;
      });
      
      setGold(prev => {
        const newGold = prev - totalCost;
        goldRef.current = newGold;
        return newGold;
      });
      
      return { success: true, totalCost };
    } catch (error) {
      console.error("Failed to repair all equipment:", error);
      return { success: false, totalCost, error: t(language, 'serverError') };
    }
  }, [getTotalRepairCost, firebaseUser, getAuthHeaders]);

  const toggleDebugMode = useCallback(() => {
    if (!debugMode) {
      // Entering debug mode: Snapshot current state
      stateSnapshot.current = {
        skills: JSON.parse(JSON.stringify(skills)),
        inventory: JSON.parse(JSON.stringify(inventory)),
        currentHitpoints
      };
      setDebugMode(true);
      toast({
        title: "Test Mode Activated",
        description: "All unlocks available. XP gained in this mode will not be saved.",
        variant: "destructive"
      });
    } else {
      // Exiting debug mode: Restore snapshot
      if (stateSnapshot.current) {
        setSkills(stateSnapshot.current.skills);
        skillsRef.current = stateSnapshot.current.skills;
        setInventory(stateSnapshot.current.inventory);
        inventoryRef.current = stateSnapshot.current.inventory;
        setCurrentHitpoints(stateSnapshot.current.currentHitpoints);
        currentHitpointsRef.current = stateSnapshot.current.currentHitpoints;
      }
      stopTask(); // Stop any active task from debug mode
      stopCombat(); // Stop any active combat from debug mode
      setDebugMode(false);
      stateSnapshot.current = null;
      toast({
        title: "Test Mode Deactivated",
        description: "State restored to previous save.",
      });
    }
  }, [debugMode, skills, inventory, currentHitpoints, stopTask, stopCombat, toast]);

  // Game Loop
  useEffect(() => {
    if (!activeTask) return;

    const interval = setInterval(() => {
      if (isLoadingFromServerRef.current) return;
      const now = Date.now();
      
      // Check 6-hour idle limit
      if (now >= activeTask.limitExpiresAt) {
        toast({
          title: t(language, "idleLimitExpired"),
          description: t(language, "idleLimitExpiredDesc"),
          variant: "destructive",
        });
        // Finalize partial progress before clearing the task:
        // 1. Save current skills/inventory/tick to the server (settles any unsaved state).
        // 2. Notify the server that the idle limit expired so it records lastLogoutAt.
        //    The server endpoint will null out activeTask/activeCombat server-side and
        //    record a reliable timestamp for offline-progress calculation on next login.
        const currentPlayer = playerRef.current;
        if (currentPlayer && !debugModeRef.current) {
          saveToServer().catch(() => {}).finally(() => {
            const authHeaders = getAuthHeaders();
            fetch(`/api/tasks/idle-limit-expired`, {
              method: "POST",
              headers: authHeaders,
              credentials: "include",
            }).catch(() => {});
          });
        }
        setActiveTask(null);
        return;
      }
      
      // Firemaking: each slot has its own duration, process independently without waiting for activeTask.duration
      if (activeTask.skillId === "firemaking") {
        const currentSlots = firemakingSlotsRef.current;
        let slotsChanged = false;
        const newSlots = [...currentSlots];
        
        for (let i = 0; i < newSlots.length; i++) {
          const slot = newSlots[i];
          if (!slot) continue;
          
          const slotElapsed = now - slot.startTime;
          if (slotElapsed >= slot.duration) {
            const ashId = LOG_TO_ASH_MAP[slot.logId] || slot.itemId;
            if (ashId) {
              addLoot(ashId, 1);
              const showNotification = getShowItemNotification();
              if (showNotification) {
                const ashItem = getItemById(ashId);
                const iconUrl = getItemImage(ashId);
                showNotification(ashItem?.name || ashId, 1, iconUrl);
              }
            }
            if (!debugModeRef.current) {
              setInventory(prev => {
                const current = prev[slot.logId] || 0;
                const newQty = Math.max(0, current - 1);
                const newInv = { ...prev, [slot.logId]: newQty };
                if (newQty === 0) delete newInv[slot.logId];
                inventoryRef.current = newInv;
                return newInv;
              });
            }
            
            const xpGained = slot.xpReward;
            if (xpGained > 0) {
              setSkills(prev => {
                const current = prev.firemaking || { xp: 0, level: 1 };
                const newXp = current.xp + xpGained;
                const newLevel = getLevelFromXp(newXp);
                if (newLevel > current.level) {
                  getPlaySfx()?.('progression', 'skill_level_up');
                }
                return { ...prev, firemaking: { xp: newXp, level: newLevel } };
              });
            }
            
            const newBurnedCount = slot.burnedCount + 1;
            if (newBurnedCount < slot.quantity) {
              newSlots[i] = {
                ...slot,
                startTime: now,
                burnedCount: newBurnedCount,
              };
            } else {
              newSlots[i] = null;
            }
            slotsChanged = true;
          }
        }
        
        if (slotsChanged) {
          setFiremakingSlots(newSlots);
          firemakingSlotsRef.current = newSlots;
        }
        
        const hasActive = newSlots.some(s => s !== null);
        if (hasActive) {
          const needsReactUpdate = slotsChanged || (now - (activeTaskRef.current?.lastClientTick || 0)) >= 5000;
          if (needsReactUpdate) {
            const updatedTask = { ...activeTask, startTime: now, lastClientTick: now, limitExpiresAt: now + IDLE_LIMIT_MS };
            setActiveTask(updatedTask);
            activeTaskRef.current = updatedTask;
          } else {
            activeTaskRef.current = { ...activeTask, lastClientTick: now, limitExpiresAt: now + IDLE_LIMIT_MS };
          }
        } else {
          setActiveTask(null);
          activeTaskRef.current = null;
        }
        return;
      }

      const elapsed = now - activeTask.startTime;

      // Apply guild speed bonuses to effective duration
      const gatheringSkills = ["mining", "woodcutting", "fishing"];
      const craftingSkills = ["crafting", "cooking", "alchemy"];
      
      let effectiveDuration = activeTask.duration;
      if (gatheringSkills.includes(activeTask.skillId)) {
        const gatheringSpeedBonus = guildBonusesRef.current?.gatheringBonus || 0;
        effectiveDuration = activeTask.duration * (1 - gatheringSpeedBonus / 100);
      } else if (craftingSkills.includes(activeTask.skillId)) {
        const craftingSpeedBonus = guildBonusesRef.current?.craftingBonus || 0;
        effectiveDuration = activeTask.duration * (1 - craftingSpeedBonus / 100);
      }
      
      // Apply achievement skill speed buff
      const achSkillSpeedBuff = achievementBuffsRef.current.find(
        b => b.buffType === 'skillSpeed' && b.value > 0 && (
          (b.skillId === 'gathering' && gatheringSkills.includes(activeTask.skillId)) ||
          (b.skillId === 'crafting' && craftingSkills.includes(activeTask.skillId)) ||
          (b.skillId === 'cooking' && activeTask.skillId === 'cooking') ||
          (b.skillId === 'alchemy' && activeTask.skillId === 'alchemy') ||
          (b.skillId === 'firemaking' && activeTask.skillId === 'firemaking')
        )
      );
      if (achSkillSpeedBuff) {
        effectiveDuration = effectiveDuration * (1 - achSkillSpeedBuff.value / 100);
      }

      // Apply party skill synergy speed bonus
      const synergySpeedBonus = partySynergyBonusesRef.current?.speedBonus || 0;
      if (synergySpeedBonus > 0) {
        effectiveDuration = applySpeedBonus(effectiveDuration, synergySpeedBonus);
      }

      if (elapsed >= effectiveDuration) {
        // Task Complete!
        const item = getItemById(activeTask.name);
        
        // Handle studying specially - consume equipment item and grant Smithing XP
        if (activeTask.skillId === "studying") {
          const studiedItemId = activeTask.name; // The item being studied (with rarity)
          const currentInventory = inventoryRef.current;
          const itemCount = currentInventory[studiedItemId] || 0;
          
          if (itemCount < 1 && !debugModeRef.current) {
            // No more items to study
            toast({
              title: t(language, "learningComplete"),
              description: t(language, "noItemsToStudy"),
            });
            setActiveTask(null);
            return;
          }
          
          // Consume one item
          const newInventory = { ...currentInventory };
          if (!debugModeRef.current) {
            const newCount = itemCount - 1;
            if (newCount <= 0) {
              delete newInventory[studiedItemId];
            } else {
              newInventory[studiedItemId] = newCount;
            }
          }
          
          // Update inventory ref and state
          inventoryRef.current = newInventory;
          setInventory(newInventory);
          
          // Also remove from inventory durability if it was a damaged item
          if (hasInstanceSuffix(studiedItemId)) {
            setInventoryDurability(prev => {
              const newDurability = { ...prev };
              delete newDurability[studiedItemId];
              inventoryDurabilityRef.current = newDurability;
              return newDurability;
            });
          }
          
          // Grant Smithing XP (with XP boost buff, guild XP bonus, synergy XP bonus, achievement bonus, and level scaling)
          const xpBoostPercent = getBuffEffect("xp_boost");
          const guildXpBonus = guildBonusesRef.current?.xpBonus || 0;
          const synergyXpBonus = partySynergyBonusesRef.current?.xpBonus || 0;
          const achXpBonusStudy = getAchievementBuffValue('xpBonus');
          const totalXpMod = 1 + (xpBoostPercent / 100) + (guildXpBonus / 100) + synergyXpBonus + (achXpBonusStudy / 100);
          
          // Apply XP scaling based on skill level vs content level
          const currentCraftingLevel = skillsRef.current.crafting?.level || 1;
          const contentLevel = estimateContentLevel(activeTask.xpReward);
          const taskXpScaling = calculateXpScaling(currentCraftingLevel, contentLevel);
          const boostedXpReward = Math.floor(activeTask.xpReward * totalXpMod * taskXpScaling.multiplier);
          
          setSkills(prev => {
            const currentSkill = prev["crafting"] || { xp: 0, level: 0 };
            const newXp = currentSkill.xp + boostedXpReward;
            const newLevel = getLevelFromXp(newXp);
            
            if (newLevel > currentSkill.level) {
              toast({
                title: "Level Up!",
                description: `Congratulations! You reached level ${newLevel} in Crafting.`,
                variant: "default",
                className: "bg-yellow-500/10 border-yellow-500/50 text-yellow-500"
              });
              trackSkillLevel('crafting', newLevel);
              getPlaySfx()?.('progression', 'skill_level_up');
            }

            const newSkills = {
              ...prev,
              crafting: {
                xp: newXp,
                level: newLevel
              }
            };
            skillsRef.current = newSkills;
            const newTotalLevel = Object.values(newSkills).reduce((sum, s) => sum + s.level, 0);
            trackTotalLevel(newTotalLevel);
            return newSkills;
          });
          
          // Contribute to guild
          contributeToGuild(activeTask.xpReward, "crafting");
          
          // Track in session
          sessionItemsRef.current[studiedItemId] = (sessionItemsRef.current[studiedItemId] || 0) + 1;
          
          // Check if more items remain
          const hasMoreItems = debugModeRef.current || (newInventory[studiedItemId] || 0) >= 1;
          
          if (hasMoreItems) {
            // CRITICAL: Update lastClientTick to prevent scheduler takeover while client is active
            const updatedTask = { ...activeTask, startTime: now, lastClientTick: now, limitExpiresAt: now + IDLE_LIMIT_MS };
            setActiveTask(updatedTask);
            activeTaskRef.current = updatedTask;
          } else {
            toast({
              title: t(language, "learningComplete"),
              description: t(language, "allItemsStudied").replace("{0}", studiedItemId),
            });
            setActiveTask(null);
            activeTaskRef.current = null;
          }
          return;
        }
        
        // Handle crafting, cooking, and alchemy crafts specially - atomic material check, deduction, and reward
        if (activeTask.skillId === "crafting" || activeTask.skillId === "cooking" || activeTask.skillId === "alchemy") {
          // Use materials stored in activeTask (passed when craft started) instead of looking up by result item
          // This fixes the bug where multiple recipes produce the same item (e.g., Bronze Bar from Ore vs ore_essence)
          const taskMaterials = activeTask.materials;
          if (!taskMaterials || taskMaterials.length === 0) {
            setActiveTask(null);
            return;
          }
          
          // Check materials using ref (synchronous read) - skip in debug mode
          const currentInventory = inventoryRef.current;
          const hasMaterials = debugModeRef.current || taskMaterials.every(
            mat => (currentInventory[mat.itemId] || 0) >= mat.quantity
          );
          
          if (!hasMaterials) {
            // Materials no longer available, cancel craft without XP
            toast({
              title: t(language, "craftCancelled"),
              description: t(language, "insufficientMaterials"),
              variant: "destructive"
            });
            setActiveTask(null);
            return;
          }
          
          // Roll rarity for equipment before inventory update
          const isEquipment = item && (item.type === "equipment" || item.type === "weapon");
          const rarity = isEquipment ? rollRarity() : null;
          const craftedItemKey = isEquipment ? `${activeTask.name} (${rarity})` : activeTask.name;
          
          // Calculate new inventory SYNCHRONOUSLY before any state updates
          // This ensures the ref is accurate for the hasMoreMaterials check
          const newInventory = { ...currentInventory };
          
          // Deduct materials (skip in debug mode) - use taskMaterials from activeTask
          if (!debugModeRef.current) {
            taskMaterials.forEach(mat => {
              const current = newInventory[mat.itemId] || 0;
              const newQty = current - mat.quantity;
              if (newQty <= 0) {
                delete newInventory[mat.itemId];
              } else {
                newInventory[mat.itemId] = newQty;
              }
            });
          }
          
          // Add crafted item
          newInventory[craftedItemKey] = (newInventory[craftedItemKey] || 0) + 1;
          
          // Update ref IMMEDIATELY (synchronously) before state update
          inventoryRef.current = newInventory;
          
          // Now update state with the calculated inventory
          setInventory(newInventory);
          
          // Track item in session
          sessionItemsRef.current[craftedItemKey] = (sessionItemsRef.current[craftedItemKey] || 0) + 1;
          
          // Track daily quest progress for craft_items
          trackDailyQuestProgress('craft_items', activeTask.skillId);
          
          // Track achievement progress for crafting
          trackSkillAction(activeTask.skillId, activeTask.xpReward);
          if (rarity) trackCraft(rarity.toLowerCase());
          
          // Show floating item notification for crafted item (like mining/woodcutting)
          const showNotification = getShowItemNotification();
          if (showNotification) {
            const craftedItem = getItemById(activeTask.name);
            // Display with rarity for equipment items
            const displayName = isEquipment && rarity 
              ? `${craftedItem?.name || activeTask.name} (${rarity})` 
              : (craftedItem?.name || activeTask.name);
            // Use getItemImage for correct asset path
            const iconUrl = getItemImage(activeTask.name);
            showNotification(displayName, 1, iconUrl);
          }
          // Rarity-aware craft complete SFX (only for rare+ items; common items use AudioGameBridge queue/complete)
          const playSfxGlobal = getPlaySfx();
          if (playSfxGlobal && rarity) {
            const r = rarity.toLowerCase();
            if (r === 'mythic') playSfxGlobal('loot', 'mythic');
            else if (r === 'epic') playSfxGlobal('loot', 'epic');
            else if (r === 'rare') playSfxGlobal('loot', 'rare');
          }
          
          // Check if enough materials remain for NEXT craft BEFORE granting XP
          // This uses the already-updated ref for accurate material check
          const hasMoreMaterials = debugModeRef.current || taskMaterials.every(
            mat => (newInventory[mat.itemId] || 0) >= mat.quantity
          );
          
          // Grant XP after successful craft (with XP boost buff, guild bonus, synergy XP bonus, achievement bonus, and level scaling)
          const xpBoostPercent = getBuffEffect("xp_boost");
          const guildXpBonus = guildBonusesRef.current?.xpBonus || 0;
          const synergyCraftXpBonus = partySynergyBonusesRef.current?.xpBonus || 0;
          const achXpBonusCraft = getAchievementBuffValue('xpBonus');
          const totalXpMod = 1 + (xpBoostPercent / 100) + (guildXpBonus / 100) + synergyCraftXpBonus + (achXpBonusCraft / 100);
          
          // Apply XP scaling based on skill level vs content level
          const currentSkillLevel = skillsRef.current[activeTask.skillId]?.level || 1;
          const craftContentLevel = estimateContentLevel(activeTask.xpReward);
          const craftXpScaling = calculateXpScaling(currentSkillLevel, craftContentLevel);
          const boostedXpReward = Math.floor(activeTask.xpReward * totalXpMod * craftXpScaling.multiplier);
          
          setSkills(prev => {
            const currentSkill = prev[activeTask.skillId] || { xp: 0, level: 0 };
            const newXp = currentSkill.xp + boostedXpReward;
            const newLevel = getLevelFromXp(newXp);
            
            if (newLevel > currentSkill.level) {
              toast({
                title: "Level Up!",
                description: `Congratulations! You reached level ${newLevel} in ${activeTask.skillId}.`,
                variant: "default",
                className: "bg-yellow-500/10 border-yellow-500/50 text-yellow-500"
              });
              trackSkillLevel(activeTask.skillId, newLevel);
              getPlaySfx()?.('progression', 'skill_level_up');
            }

            const newSkills = {
              ...prev,
              [activeTask.skillId]: {
                xp: newXp,
                level: newLevel
              }
            };
            // Sync ref immediately to prevent race condition with saves
            skillsRef.current = newSkills;
            const newTotalLevel = Object.values(newSkills).reduce((sum, s) => sum + s.level, 0);
            trackTotalLevel(newTotalLevel);
            return newSkills;
          });
          
          // Contribute crafting XP to guild
          contributeToGuild(activeTask.xpReward, activeTask.skillId);
          
          // Add to recent crafts for equipment (no individual notifications - batched at task stop)
          if (isEquipment && rarity) {
            setRecentCrafts(prev => {
              const newCraft = { itemId: activeTask.name, rarity, timestamp: Date.now() };
              return [newCraft, ...prev].slice(0, 6);
            });
            
            // Track mythic crafts for special popup (shown when task stops)
            if (rarity === "Mythic") {
              setPendingMythicCrafts(prev => [...prev, { itemId: craftedItemKey, rarity }]);
            }
          }
          // No per-craft notifications - batched notification shown on task stop
          
          // Increment produced count
          const newProducedCount = (activeTask.producedCount || 0) + 1;
          
          // Check if target quantity reached (0 or undefined = infinite)
          const targetReached = activeTask.targetQuantity && activeTask.targetQuantity > 0 && newProducedCount >= activeTask.targetQuantity;
          
          // Restart or stop based on material availability and target quantity
          if (hasMoreMaterials && !targetReached) {
            // CRITICAL: Update lastClientTick to prevent scheduler takeover while client is active
            const updatedTask = { ...activeTask, startTime: now, lastClientTick: now, limitExpiresAt: now + IDLE_LIMIT_MS, producedCount: newProducedCount };
            setActiveTask(updatedTask);
            activeTaskRef.current = updatedTask;
          } else {
            // Target reached or no materials - show completion message
            if (targetReached) {
              toast({
                title: t(language, "targetReached") || "Target Reached",
                description: (t(language, "producedXItems") || "Produced {0} items").replace("{0}", String(newProducedCount)),
              });
            }
            setActiveTask(null);
            activeTaskRef.current = null;
          }
        } else {
          // Non-crafting tasks: grant XP and add item normally
          
          // Check and consume bait if required (skip in debug mode)
          let baitRemainingAfterConsumption = Infinity;
          if (activeTask.requiredBait && activeTask.baitAmount && !debugModeRef.current) {
            const currentBait = inventoryRef.current[activeTask.requiredBait] || 0;
            if (currentBait < activeTask.baitAmount) {
              // Not enough bait - stop the task
              toast({
                title: t(language, "baitDepleted"),
                description: t(language, "baitDepletedDesc").replace("{0}", activeTask.requiredBait || ""),
                variant: "destructive",
              });
              setActiveTask(null);
              return;
            }
            // Calculate remaining bait after consumption (for restart check)
            baitRemainingAfterConsumption = currentBait - activeTask.baitAmount;
            // Consume bait and update ref synchronously
            setInventory(prev => {
              const newInventory = {
                ...prev,
                [activeTask.requiredBait!]: (prev[activeTask.requiredBait!] || 0) - activeTask.baitAmount!
              };
              inventoryRef.current = newInventory;
              return newInventory;
            });
          }
          
          // Apply XP boost buff, guild bonus, synergy XP bonus, achievement bonus, and level scaling to gathering skills
          const xpBoostPercentSkill = getBuffEffect("xp_boost");
          const guildXpBonusSkill = guildBonusesRef.current?.xpBonus || 0;
          const synergyGatherXpBonus = partySynergyBonusesRef.current?.xpBonus || 0;
          const achXpBonusGather = getAchievementBuffValue('xpBonus');
          const totalXpModSkill = 1 + (xpBoostPercentSkill / 100) + (guildXpBonusSkill / 100) + synergyGatherXpBonus + (achXpBonusGather / 100);
          
          // Apply XP scaling based on skill level vs content level
          const currentGatherSkillLevel = skillsRef.current[activeTask.skillId]?.level || 1;
          const gatherContentLevel = estimateContentLevel(activeTask.xpReward);
          const gatherXpScaling = calculateXpScaling(currentGatherSkillLevel, gatherContentLevel);
          const boostedXpRewardSkill = Math.floor(activeTask.xpReward * totalXpModSkill * gatherXpScaling.multiplier);
          
          setSkills(prev => {
            const currentSkill = prev[activeTask.skillId] || { xp: 0, level: 0 };
            const newXp = currentSkill.xp + boostedXpRewardSkill;
            const newLevel = getLevelFromXp(newXp);
            
            if (newLevel > currentSkill.level) {
              toast({
                title: "Level Up!",
                description: `Congratulations! You reached level ${newLevel} in ${activeTask.skillId}.`,
                variant: "default",
                className: "bg-yellow-500/10 border-yellow-500/50 text-yellow-500"
              });
              trackSkillLevel(activeTask.skillId, newLevel);
              getPlaySfx()?.('progression', 'skill_level_up');
            }

            const newSkills = {
              ...prev,
              [activeTask.skillId]: {
                xp: newXp,
                level: newLevel
              }
            };
            // Sync ref immediately to prevent race condition with saves
            skillsRef.current = newSkills;
            const newTotalLevel = Object.values(newSkills).reduce((sum, s) => sum + s.level, 0);
            trackTotalLevel(newTotalLevel);
            return newSkills;
          });
          
          // Contribute skill XP to guild (original value, not boosted)
          contributeToGuild(activeTask.xpReward, activeTask.skillId);
          
          // Use itemId if available (for hunting), otherwise use name
          const itemToAdd = activeTask.itemId || activeTask.name;
          setInventory(prev => {
            const newInventory = {
              ...prev,
              [itemToAdd]: (prev[itemToAdd] || 0) + 1
            };
            inventoryRef.current = newInventory;
            return newInventory;
          });
          
          // Track item in session (no instant notification - shown on task stop)
          sessionItemsRef.current[itemToAdd] = (sessionItemsRef.current[itemToAdd] || 0) + 1;
          
          // Track daily quest progress for gather_resources
          trackDailyQuestProgress('gather_resources', activeTask.skillId);
          
          // Track achievement progress for gathering
          trackSkillAction(activeTask.skillId, activeTask.xpReward);
          
          // Check if enough bait remains for next action using pre-calculated value
          if (activeTask.requiredBait && activeTask.baitAmount && !debugModeRef.current) {
            if (baitRemainingAfterConsumption < activeTask.baitAmount) {
              toast({
                title: t(language, "baitDepleted"),
                description: t(language, "baitDepletedDesc").replace("{0}", activeTask.requiredBait || ""),
                variant: "destructive",
              });
              // Show session summary before stopping using toast
              const sessionItems = sessionItemsRef.current;
              const itemEntries = Object.entries(sessionItems);
              if (itemEntries.length > 0) {
                const totalItems = itemEntries.reduce((sum, [, qty]) => sum + qty, 0);
                const itemList = itemEntries.map(([name, qty]) => `${qty}x ${name}`).join(", ");
                toast({
                  title: t(language, "taskSummary"),
                  description: t(language, "materialsCollected").replace("{0}", String(totalItems)).replace("{1}", itemList),
                });
              }
              sessionItemsRef.current = {};
              setActiveTask(null);
              return;
            }
          }
          
          // Restart task
          // CRITICAL: Update lastClientTick to prevent scheduler takeover while client is active
          const updatedTask = { ...activeTask, startTime: now, lastClientTick: now, limitExpiresAt: now + IDLE_LIMIT_MS };
          setActiveTask(updatedTask);
          activeTaskRef.current = updatedTask;
        }
      }
    }, 100); // Check every 100ms

    return () => clearInterval(interval);
  }, [activeTask, toast]);

  // Save after each task completion (debounced)
  const lastTaskCompletionRef = useRef<number>(0);
  useEffect(() => {
    // Trigger save when inventory changes (indicates task completion)
    const itemCount = Object.values(inventory).reduce((sum, n) => sum + n, 0);
    if (itemCount > 0 && itemCount !== lastTaskCompletionRef.current) {
      lastTaskCompletionRef.current = itemCount;
      
      // Debounced save - wait 2 seconds after last change
      const timer = setTimeout(() => {
        saveToServer();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [inventory, saveToServer]);

  // Update language function
  const updateLanguage = useCallback(async (lang: Language) => {
    // Update context language (this propagates to all components)
    setContextLanguage(lang);
    
    if (player && !debugMode) {
      try {
        await fetch(`/api/players/${player.id}/language`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({ language: lang }),
        });
      } catch (error) {
        console.error('Failed to update language:', error);
      }
    }
  }, [player, debugMode, setContextLanguage, getAuthHeaders]);

  // Internal travel function - executes travel without party check
  const executeSetCurrentRegion = useCallback(async (regionId: string, options?: { useTeleportStone?: boolean }) => {
    if (!player?.id) {
      console.warn('[Travel] No player ID, cannot travel');
      return;
    }
    if (hasActiveDungeonRunRef.current) {
      toast({
        title: "Error",
        description: "Cannot travel while in a dungeon. Complete or leave the dungeon first.",
        variant: "destructive",
      });
      return;
    }
    try {
      const currentDebugMode = debugModeRef.current;
      console.log('[Travel] Starting travel to:', regionId, 'testMode:', currentDebugMode);
      
      const res = await fetch(`/api/players/${player.id}/region`, {
        method: 'PATCH',
        headers: await getAsyncAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ regionId, testMode: currentDebugMode, useTeleportStone: options?.useTeleportStone }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('[Travel] API error:', res.status, errorData);
        throw new Error(errorData.error || 'Travel failed');
      }
      
      const data = await res.json();
      console.log('[Travel] API response:', data);
      
      // Deduct gold spent (if any) - only if not in test mode
      if (data.goldSpent && data.goldSpent > 0 && !data.testMode) {
        setGold(prev => prev - data.goldSpent);
        goldRef.current -= data.goldSpent;
      }
      
      if (data.teleportStonesUsed && data.teleportStonesUsed > 0) {
        setInventory(prev => {
          const updated = { ...prev };
          const current = updated["teleport_stone"] || 0;
          const remaining = current - data.teleportStonesUsed;
          if (remaining <= 0) {
            delete updated["teleport_stone"];
          } else {
            updated["teleport_stone"] = remaining;
          }
          return updated;
        });
        inventoryRef.current = { ...inventoryRef.current };
        const currentStones = inventoryRef.current["teleport_stone"] || 0;
        const remainingStones = currentStones - data.teleportStonesUsed;
        if (remainingStones <= 0) {
          delete inventoryRef.current["teleport_stone"];
        } else {
          inventoryRef.current["teleport_stone"] = remainingStones;
        }
      }
      
      if (data.travelComplete) {
        // Instant travel - update region immediately
        console.log('[Travel] Instant travel complete to:', data.currentRegion);
        setCurrentRegionState(data.currentRegion || regionId);
        currentRegionRef.current = data.currentRegion || regionId;
        setActiveTravel(null);
        activeTravelRef.current = null;
        setTaskQueue([]);
        taskQueueRef.current = [];
      } else if (data.activeTravel) {
        // Delayed travel - set activeTravel state
        console.log('[Travel] Delayed travel started:', data.activeTravel);
        setActiveTravel(data.activeTravel);
        activeTravelRef.current = data.activeTravel;
        setTaskQueue([]);
        taskQueueRef.current = [];
      } else {
        console.warn('[Travel] Unexpected response - no travelComplete or activeTravel');
      }
    } catch (error) {
      console.error('[Travel] Failed to change region:', error);
      throw error;
    }
  }, [player, getAsyncAuthHeaders]);
  
  const setCurrentRegion = useCallback(async (regionId: string, options?: { useTeleportStone?: boolean }) => {
    await executeSetCurrentRegion(regionId, options);
  }, [executeSetCurrentRegion]);

  // Complete travel when timer finishes
  const completeTravel = useCallback(async () => {
    if (!player?.id || !activeTravel) return;
    try {
      const res = await fetch(`/api/players/${player.id}/complete-travel`, {
        method: 'POST',
        headers: await getAsyncAuthHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCurrentRegionState(data.currentRegion);
          currentRegionRef.current = data.currentRegion;
          setActiveTravel(null);
          activeTravelRef.current = null;
          trackTravel();
          trackRegionVisited(data.currentRegion);
        }
      }
    } catch (error) {
      console.error('Failed to complete travel:', error);
    }
  }, [player, activeTravel, getAsyncAuthHeaders]);

  // Cancel travel and refund gold
  const cancelTravel = useCallback(async () => {
    if (!player?.id || !activeTravel) return;
    try {
      const res = await fetch(`/api/players/${player.id}/cancel-travel`, {
        method: 'POST',
        headers: await getAsyncAuthHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // Refund gold
          if (data.goldRefunded && data.goldRefunded > 0) {
            setGold(prev => prev + data.goldRefunded);
            goldRef.current += data.goldRefunded;
          }
          setActiveTravel(null);
          activeTravelRef.current = null;
        }
      }
    } catch (error) {
      console.error('Failed to cancel travel:', error);
    }
  }, [player, activeTravel, getAsyncAuthHeaders]);

  // Refresh player data from server (useful after market operations)
  const refreshPlayer = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch(`/api/players/firebase?isSync=true`, {
        credentials: 'include',
        headers: { 
          "Authorization": `Bearer ${idToken}`,
          "x-session-token": sessionTokenRef.current || '',
        },
      });
      if (response.ok) {
        const result = await response.json();
        const data = result.player;
        if (data) {
          const loadedInventory = cleanInventory((data.inventory as Record<string, number>) || {});
          setInventory(loadedInventory);
          inventoryRef.current = loadedInventory;
          const loadedSkills = data.skills as Record<string, SkillState>;
          setSkills(loadedSkills);
          skillsRef.current = loadedSkills;
          if (data.gold !== undefined) {
            setGold(data.gold);
            goldRef.current = data.gold;
            lastKnownServerGoldRef.current = data.gold;
          }
          isDirtyRef.current = false;
          if (data.equipment) {
            const loadedEquipment = data.equipment as Record<EquipmentSlot, string | null>;
            setEquipment(loadedEquipment);
            equipmentRef.current = loadedEquipment;
          }
          if (data.currentHitpoints !== undefined) {
            // HP is stored scaled (e.g., level 21 with COMBAT_HP_SCALE=10 means max=210)
            // Also include equipment HP bonus
            const hpLevel = (data.skills as Record<string, SkillState>).hitpoints?.level || 10;
            const equipmentData = data.equipment as Record<EquipmentSlot, string | null> || {};
            const hpBonus = getTotalEquipmentBonus(equipmentData, itemModificationsRef.current).hitpointsBonus || 0;
            const maxHp = (hpLevel * COMBAT_HP_SCALE) + hpBonus;
            // Clamp to valid range (0 to maxHp) - preserve saved HP, don't reset to full
            setCurrentHitpoints(Math.min(maxHp, Math.max(0, data.currentHitpoints)));
          }
          // Reload item modifications (enhancements) on refresh
          getAsyncAuthHeaders(false).then(authHdrs => {
            fetch("/api/enhancements", { credentials: "include", headers: authHdrs })
              .then(res => res.ok ? res.json() : null)
              .then(enhData => {
                if (enhData?.itemModifications) {
                  setItemModifications(enhData.itemModifications);
                  itemModificationsRef.current = enhData.itemModifications;
                }
                if (enhData?.cursedItems) {
                  setCursedItems(enhData.cursedItems);
                  cursedItemsRef.current = enhData.cursedItems;
                }
              })
              .catch(() => {});
          });

          // CRITICAL: Update session token from refreshPlayer response
          // Prevents "session_invalidated" error if server rotated token
          if (result.sessionToken) {
            sessionTokenRef.current = result.sessionToken;
            localStorage.setItem('gameSessionToken', result.sessionToken);
          }
        }
      }
    } catch (error) {
      console.error("Failed to refresh player data:", error);
    }
  }, [firebaseUser]);

  // Apply server data directly (prevents race conditions with client saves)
  // Used by market operations to immediately update state with authoritative server data
  const applyServerData = useCallback((data: { gold?: number; inventory?: Record<string, number>; itemModifications?: Record<string, any> }) => {
    if (data.gold !== undefined) {
      setGold(data.gold);
      goldRef.current = data.gold;
      lastKnownServerGoldRef.current = data.gold;
    }
    if (data.inventory !== undefined) {
      setInventory(data.inventory);
      inventoryRef.current = data.inventory;
    }
    if (data.itemModifications !== undefined) {
      setItemModifications(data.itemModifications);
      itemModificationsRef.current = data.itemModifications;
    }
  }, []);

  // Prepare for offline - sets offlineStartTime so scheduler knows when client went offline
  // CRITICAL: Must be called before dev mode logout to ensure offline progress popup works
  const trackDailyQuestProgress = useCallback((questType: string, targetType: string | null, amount: number = 1) => {
    const activeQuests = activeDailyQuestsRef.current;
    if (activeQuests.length === 0) return;
    const hasMatchingQuest = activeQuests.some(q => 
      q.questType === questType && (q.targetType === null || q.targetType === targetType)
    );
    if (!hasMatchingQuest) return;
    const key = `${questType}:${targetType || ''}`;
    dailyQuestProgressRef.current[key] = (dailyQuestProgressRef.current[key] || 0) + amount;
  }, []);

  const setActiveDailyQuests = useCallback((quests: Array<{ questType: string; targetType: string | null }>) => {
    activeDailyQuestsRef.current = quests;
  }, []);

  const flushDailyQuestProgress = useCallback(async () => {
    const progress = dailyQuestProgressRef.current;
    const entries = Object.entries(progress);
    if (entries.length === 0) return;
    dailyQuestProgressRef.current = {};
    const currentPlayer = playerRef.current;
    if (!currentPlayer) return;
    try {
      const headers: Record<string, string> = getAuthHeaders();
      await fetch('/api/daily-quests/progress-batch', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          progress: entries.map(([key, amount]) => {
            const [questType, targetType] = key.split(':');
            return { questType, targetType: targetType || null, amount };
          })
        })
      });
    } catch (e) {
      // Restore progress on failure so it retries next save
      entries.forEach(([key, amount]) => {
        dailyQuestProgressRef.current[key] = (dailyQuestProgressRef.current[key] || 0) + amount;
      });
    }
  }, []);

  const prepareForOffline = useCallback(async () => {
    // No-op: offline progress is now server-authoritative via lastLogoutAt
  }, []);

  // Heartbeat is now handled by the combined /api/poll endpoint below


  // Track last seen notification ID to avoid duplicate toasts
  const lastSeenNotificationIdRef = useRef<string | null>(null);
  const lastGameDataVersionRef = useRef<number>(0);
  const lastPlayerDataVersionRef = useRef<number>(0);

  // Combined poll - replaces separate notification, gold, heartbeat polling
  // Single /api/poll call every 30 seconds instead of multiple calls every 5-10s
  useEffect(() => {
    if (!player) return;
    
    const combinedPoll = async () => {
      if (document.hidden) return;
      if (isElectronBlurredRef.current) return;
      try {
        const headers = await getAsyncAuthHeaders(false);
        const response = await fetch('/api/poll', {
          credentials: 'include',
          headers
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        
        if (data.gold !== undefined && data.gold !== goldRef.current && !isDirtyRef.current) {
          setGold(data.gold);
          goldRef.current = data.gold;
          lastKnownServerGoldRef.current = data.gold;
        }
        
        if (data.notifications) {
          const serverNotifications = data.notifications as GameNotification[];
          const prevNotifs = notificationsRef.current;
          const existingIds = new Set(prevNotifs.map(n => n.id));
          const newNotifs = serverNotifications.filter(n => !existingIds.has(n.id));
          
          if (newNotifs.length > 0) {
            const now = Date.now();
            const TOAST_TIME_WINDOW = 30 * 1000;
            
            if (lastSeenNotificationIdRef.current) {
              newNotifs.forEach(notif => {
                const notifTime = new Date(notif.createdAt).getTime();
                if (now - notifTime <= TOAST_TIME_WINDOW) {
                  const notifTitleKey = notif.type?.toLowerCase() === 'guild_invite' ? 'guildInviteTitle' : 'newNotification';
                  toast({
                    title: t(languageRef.current, notifTitleKey),
                    description: notif.message,
                  });
                }
              });
            }
            
            if (serverNotifications.length > 0) {
              lastSeenNotificationIdRef.current = serverNotifications[0].id;
            }
            
            const allNotifs = [...newNotifs, ...prevNotifs];
            const uniqueNotifs = Array.from(new Map(allNotifs.map(n => [n.id, n])).values());
            const sorted = uniqueNotifs
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .slice(0, 20);
            notificationsRef.current = sorted;
            setNotifications(sorted);
          } else if (serverNotifications.length > 0) {
            lastSeenNotificationIdRef.current = serverNotifications[0].id;
          }
        }
        
        if (data.partyId !== undefined) {
          const prevPartyId = currentPartyIdRef.current;
          const newPartyId = data.partyId || null;
          if (prevPartyId !== newPartyId) {
            currentPartyIdRef.current = newPartyId;
            queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
          }
        }
        
        if (data.globalChatUnreadCount !== undefined) {
          setPollGlobalChatUnreadCount(data.globalChatUnreadCount);
        }
        if (data.pmUnreadCount !== undefined) {
          setPollPmUnreadCount(data.pmUnreadCount);
        }
        
        if (data.dungeonSummary) {
          const newDungeonState = data.dungeonSummary.hasActiveRun === true;
          setHasActiveDungeonRun(newDungeonState);
          hasActiveDungeonRunRef.current = newDungeonState;
        }

        const newPendingCount = data.pendingTradeCount || 0;
        if (newPendingCount > 0) {
          window.dispatchEvent(new CustomEvent('trade:pendingTrade', { detail: { count: newPendingCount } }));
        }
        if (newPendingCount > 0 && newPendingCount > pendingTradeCountRef.current) {
          toast({ title: t(language, 'tradeOfferReceived'), description: t(language, 'tradeOfferReceivedDesc'), variant: 'default' });
        }
        pendingTradeCountRef.current = newPendingCount;
        setPendingTradeCount(newPendingCount);

        if (data.gameDataVersion && data.gameDataVersion !== lastGameDataVersionRef.current) {
          if (lastGameDataVersionRef.current > 0) {
            window.dispatchEvent(new CustomEvent('trade:gameDataUpdate'));
            reloadItemsData().catch(() => {});
            reloadMonstersData().catch(() => {});
          }
          lastGameDataVersionRef.current = data.gameDataVersion;
        }

        if (data.playerDataVersion && data.playerDataVersion !== lastPlayerDataVersionRef.current) {
          if (lastPlayerDataVersionRef.current > 0) {
            window.dispatchEvent(new CustomEvent('trade:playerDataUpdate'));
          }
          lastPlayerDataVersionRef.current = data.playerDataVersion;
        }

        if (data.onlinePlayerCount !== undefined) {
          setOnlinePlayerCount(data.onlinePlayerCount);
        }
        if (data.realOnlineCount !== undefined) {
          setRealOnlineCount(data.realOnlineCount);
        }
        if (data.staffRole !== undefined) {
          setStaffRole(data.staffRole);
        }

        // Session invalidation detection via poll - faster than check-session (30s vs 60s)
        if (data.sessionInvalidated) {
          console.log('[Poll] Session invalidated by server - another session is active');
          setSessionInvalidated(true);
          localStorage.removeItem('gameSessionToken');
          toast({
            title: t(languageRef.current, 'sessionEnded'),
            description: t(languageRef.current, 'anotherDeviceLogin'),
            variant: "destructive",
          });
          if (firebaseUser) {
            try { await firebaseLogout(); } catch (e) { /* ignore */ }
          }
          window.location.href = "/";
          return;
        }
      } catch (error) {
        // Silent fail - polling is not critical
      }
    };

    combinedPoll();
    
    const interval = setInterval(combinedPoll, 30000);
    
    return () => clearInterval(interval);
  }, [player, toast, getAsyncAuthHeaders, firebaseUser, firebaseLogout]);

  // Party skill synergy sync effect - uses partyId from /api/poll (no separate fetch needed)
  useEffect(() => {
    if (!player?.id) return;
    
    const syncSkillSynergy = async () => {
      try {
        const partyId = currentPartyIdRef.current;
        
        if (!partyId) {
          if (partySynergyBonusesRef.current.membersDoingSameSkill > 0) {
            const emptyBonuses = { speedBonus: 0, xpBonus: 0, membersDoingSameSkill: 0, skillId: null };
            setPartySynergyBonuses(emptyBonuses);
            partySynergyBonusesRef.current = emptyBonuses;
          }
          return;
        }
        
        const headers = await getAsyncAuthHeaders(false);
        if (!headers) return;
        const currentSkill = activeTaskRef.current?.skillId || null;
        const region = currentRegionRef.current || null;
        
        await fetch(`/api/parties/${partyId}/heartbeat`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ currentSkill, currentRegion: region })
        });
        
        if (currentSkill) {
          const synergyResponse = await fetch(`/api/parties/${partyId}/skill-synergies`, {
            headers,
            credentials: 'include'
          });
          
          if (synergyResponse.ok) {
            const synergyData = await synergyResponse.json();
            const members = synergyData.members as PartyMemberSkillStatus[];
            
            const bonuses = calculateSkillSynergyBonus(currentSkill, members, player.id, region);
            
            if (bonuses.speedBonus !== partySynergyBonusesRef.current.speedBonus ||
                bonuses.xpBonus !== partySynergyBonusesRef.current.xpBonus ||
                bonuses.membersDoingSameSkill !== partySynergyBonusesRef.current.membersDoingSameSkill) {
              setPartySynergyBonuses(bonuses);
              partySynergyBonusesRef.current = bonuses;
            }
          }
        } else {
          if (partySynergyBonusesRef.current.membersDoingSameSkill > 0) {
            const emptyBonuses = { speedBonus: 0, xpBonus: 0, membersDoingSameSkill: 0, skillId: null };
            setPartySynergyBonuses(emptyBonuses);
            partySynergyBonusesRef.current = emptyBonuses;
          }
        }
      } catch (error) {
        // Silent fail - synergy is not critical
      }
    };
    
    syncSkillSynergy();
    const interval = setInterval(syncSkillSynergy, 30000);
    
    return () => clearInterval(interval);
  }, [player?.id, getAsyncAuthHeaders]);

  // Notification methods (in-memory, max 10)
  const addNotification = useCallback((type: string, message: string, payload: Record<string, any> = {}) => {
    const newNotification: GameNotification = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      message,
      payload,
      read: 0,
      createdAt: new Date().toISOString(),
    };
    
    setNotifications(prev => {
      const updated = [newNotification, ...prev].slice(0, 10);
      notificationsRef.current = updated;
      return updated;
    });
    
    // Show toast for new notification
    const addNotifTitleKey = type === 'guild_invite' ? 'guildInviteTitle' : 'newNotification';
    toast({
      title: t(languageRef.current, addNotifTitleKey),
      description: message,
    });
  }, [toast]);

  const markNotificationsRead = useCallback(async () => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: 1 }));
      notificationsRef.current = updated;
      return updated;
    });
    
    // Also mark as read on server
    try {
      await fetch('/api/notifications/read', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({})
      });
    } catch (error) {
      // Silent fail
    }
  }, [getAuthHeaders]);

  const unreadNotificationCount = useMemo(() => {
    return notifications.filter(n => n.read === 0).length;
  }, [notifications]);

  const clearPendingMythicCrafts = useCallback(() => {
    setPendingMythicCrafts([]);
  }, []);

  const clearPendingMythicDrops = useCallback(() => {
    setPendingMythicDrops([]);
  }, []);

  useEffect(() => {
    if (deferredShowOfflineDialogRef.current && pendingMythicDrops.length === 0 && pendingMythicCrafts.length === 0) {
      deferredShowOfflineDialogRef.current = false;
      setShowOfflineDialog(true);
    }
  }, [pendingMythicDrops.length, pendingMythicCrafts.length]);

  const addPendingMythicDrop = useCallback((itemId: string, monsterId: string) => {
    setPendingMythicDrops(prev => [...prev, { itemId, monsterId }]);
  }, []);

  const setGuildBonusesCb = useCallback((bonuses: GuildBonuses | null) => { guildBonusesRef.current = bonuses; }, []);
  const setPartyCombatBonusesCb = useCallback((bonuses: { dpsBonus: number; defenseBonus: number } | null) => { partyCombatBonusesRef.current = bonuses; }, []);

  const gameContextValue = useMemo(() => ({
    skills,
    activeTask,
    startTask,
    stopTask,
    resetTaskTimer,
    inventory,
    gold,
    addGold,
    player,
    updatePlayerMeta,
    totalLevel,
    currentRegion,
    setCurrentRegion,
    activeTravel,
    completeTravel,
    cancelTravel,
    needsOnboarding,
    completeOnboarding,
    debugMode,
    toggleDebugMode,
    isLoading,
    currentHitpoints,
    maxHitpoints,
    activeCombat,
    isInCombat,
    startCombat,
    stopCombat,
    forceClearCombat,
    dealDamageToMonster,
    takeDamage,
    healPlayer,
    grantCombatXp,
    addLoot,
    setSkills,
    combatSessionStats,
    trackCombatKill,
    trackCombatDeath,
    trackCombatLoot,
    trackCombatXp,
    selectedFood,
    setSelectedFood,
    autoEatEnabled,
    setAutoEatEnabled,
    autoEatThreshold,
    setAutoEatThreshold,
    eatFood,
    eatFoodUntilFull,
    currentHitpointsRef,
    removeFromInventory,
    sellItem,
    bulkSellItems,
    selectedPotion,
    setSelectedPotion,
    autoPotionEnabled,
    setAutoPotionEnabled,
    equipment,
    equipItem,
    unequipItem,
    getEquipmentBonuses,
    equipmentDurability,
    getSlotDurability,
    applyCombatDurabilityLoss,
    applyDeathDurabilityPenalty,
    hasLowDurabilityEquipment,
    repairEquipment,
    getRepairCost,
    getTotalRepairCost,
    repairAllEquipment,
    inventoryDurability,
    getItemDurability,
    canListOnMarket,
    getAdjustedVendorPrice,
    repairInventoryItem,
    recentCrafts,
    language,
    updateLanguage,
    refreshPlayer,
    applyServerData,
    notifications,
    unreadNotificationCount,
    addNotification,
    markNotificationsRead,
    pendingMythicCrafts,
    clearPendingMythicCrafts,
    pendingMythicDrops,
    clearPendingMythicDrops,
    addPendingMythicDrop,
    hasActiveDungeonRun,
    setHasActiveDungeonRun,
    isGuest,
    guestLogin,
    convertGuestAccount,
    activeBuffs,
    usePotion,
    getBuffEffect,
    hasActiveBuff,
    combatStyle,
    setCombatStyle,
    masteries,
    getMasteryLevel,
    getMasteryProgress,
    startStudy,
    salvageItem,
    registerCombatCallbacks,
    unregisterCombatCallbacks,
    combatDebuffs,
    setGuildBonuses: setGuildBonusesCb,
    setPartyCombatBonuses: setPartyCombatBonusesCb,
    prepareForOffline,
    isCalculatingOfflineProgress,
    combatOfflineProgress,
    partySynergyBonuses,
    setActiveDailyQuests,
    itemModifications,
    cursedItems,
    firemakingSlots,
    setFiremakingSlots,
    firemakingSlotsRef,
    taskQueue,
    setTaskQueue,
    taskQueueRef,
    maxQueueSlotsCount,
    addToQueue,
    removeFromQueue: removeFromQueueFn,
    clearQueue: clearQueueFn,
    reorderQueueItem: reorderQueueItemFn,
    updateQueueItemDuration: updateQueueItemDurationFn,
    startQueueFromItem: startQueueFromItemFn,
    isQueueV2,
    maxQueueTimeMsTotal,
    startTaskWithDuration,
    startCombatWithDuration,
    pauseQueueOnCancel,
    setPauseQueueOnCancel,
    queueInterrupted,
    isQueuePaused,
    resumeQueue: resumeQueueFn,
    dismissQueueInterrupt: dismissQueueInterruptFn,
    onlinePlayerCount,
    realOnlineCount,
    staffRole,
    pollGlobalChatUnreadCount,
    pollPmUnreadCount,
  }), [
    skills, activeTask, inventory, gold, player, totalLevel, currentRegion,
    activeTravel, needsOnboarding, debugMode, isLoading, currentHitpoints,
    maxHitpoints, activeCombat, isInCombat, combatSessionStats, selectedFood,
    autoEatEnabled, autoEatThreshold, selectedPotion, autoPotionEnabled,
    equipment, equipmentDurability, recentCrafts, language, notifications,
    unreadNotificationCount, pendingMythicCrafts, pendingMythicDrops,
    hasActiveDungeonRun, isGuest, activeBuffs, combatStyle, masteries,
    combatDebuffs, isCalculatingOfflineProgress, combatOfflineProgress,
    partySynergyBonuses, itemModifications, cursedItems, firemakingSlots,
    taskQueue, maxQueueSlotsCount, isQueueV2, maxQueueTimeMsTotal,
    onlinePlayerCount, realOnlineCount, staffRole, pollGlobalChatUnreadCount,
    pollPmUnreadCount, inventoryDurability, hasLowDurabilityEquipment,
    startTask, stopTask, resetTaskTimer, addGold, updatePlayerMeta,
    setCurrentRegion, completeTravel, cancelTravel, completeOnboarding,
    toggleDebugMode, startCombat, stopCombat, forceClearCombat,
    dealDamageToMonster, takeDamage, healPlayer, grantCombatXp, addLoot,
    setSkills, trackCombatKill, trackCombatDeath, trackCombatLoot,
    trackCombatXp, setSelectedFood, setAutoEatEnabled, setAutoEatThreshold,
    eatFood, eatFoodUntilFull, removeFromInventory, sellItem, bulkSellItems,
    setSelectedPotion, setAutoPotionEnabled, equipItem, unequipItem,
    getEquipmentBonuses, getSlotDurability, applyCombatDurabilityLoss,
    applyDeathDurabilityPenalty, repairEquipment, getRepairCost,
    getTotalRepairCost, repairAllEquipment, getItemDurability, canListOnMarket,
    getAdjustedVendorPrice, repairInventoryItem, updateLanguage, refreshPlayer,
    applyServerData, addNotification, markNotificationsRead,
    clearPendingMythicCrafts, clearPendingMythicDrops, addPendingMythicDrop,
    setHasActiveDungeonRun, guestLogin, convertGuestAccount, usePotion,
    getBuffEffect, hasActiveBuff, setCombatStyle, getMasteryLevel,
    getMasteryProgress, startStudy, salvageItem, registerCombatCallbacks,
    unregisterCombatCallbacks, setGuildBonusesCb, setPartyCombatBonusesCb,
    prepareForOffline, setActiveDailyQuests, setFiremakingSlots, setTaskQueue,
    addToQueue, removeFromQueueFn, clearQueueFn, reorderQueueItemFn, startQueueFromItemFn,
    startTaskWithDuration, startCombatWithDuration, pauseQueueOnCancel, setPauseQueueOnCancel,
    queueInterrupted, isQueuePaused, resumeQueueFn, dismissQueueInterruptFn,
  ]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen bg-background">
      <div className="text-center">
        <div className="text-2xl font-display font-bold text-primary mb-2">Loading...</div>
        <div className="text-sm text-muted-foreground">Preparing your adventure</div>
      </div>
    </div>;
  }

  return (
    <GameContext.Provider value={gameContextValue}>
      <GameStatusContext.Provider value={gameStatusValue}>
        {children}
        
        {/* Offline progress loading indicator */}
        {isCalculatingOfflineProgress && (
          <div className="fixed bottom-4 right-4 z-50 bg-card/95 backdrop-blur border border-border rounded-lg shadow-lg p-3 flex items-center gap-3 animate-in slide-in-from-right-5">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">{t(language, 'calculatingOfflineProgress')}</span>
          </div>
        )}
        
        <OfflineProgressDialog 
          open={showOfflineDialog} 
          onClose={() => {
            setShowOfflineDialog(false);
            setOfflineProgress(null);
            setCombatOfflineProgress(null);
            setFiremakingOfflineProgress(null);
            setOfflineAchievements(null);
            setOfflineQueueSteps([]);
            
            if (!hasShownCommunityPopupRef.current) {
              hasShownCommunityPopupRef.current = true;
              setTimeout(() => setShowCommunityPopup(true), 300);
            }
          }} 
          progress={offlineProgress}
          combatProgress={combatOfflineProgress}
          firemakingProgress={firemakingOfflineProgress}
          offlineAchievements={offlineAchievements}
          queueSteps={offlineQueueSteps.length > 0 ? offlineQueueSteps : undefined}
        />
        
        <CommunityPopup
          open={showCommunityPopup}
          onClose={() => setShowCommunityPopup(false)}
        />
        
      </GameStatusContext.Provider>
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return context;
}

// Use this hook for navigation components that only need language, activeTask, and isInCombat
// This prevents re-renders during combat when activeCombat state changes every 100ms
export function useGameStatus() {
  const context = useContext(GameStatusContext);
  if (!context) {
    throw new Error("useGameStatus must be used within a GameProvider");
  }
  return context;
}
