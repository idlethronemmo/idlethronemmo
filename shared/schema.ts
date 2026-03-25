// @ts-nocheck
import { sql, desc } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, integer, index, serial, uniqueIndex, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage (express-session / connect-pg-simple)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage (OAuth / profile metadata)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export interface QueueItem {
  id: string;
  type: 'skill' | 'combat' | 'study';
  skillId?: string;
  actionId?: number;
  recipeId?: string;
  name: string;
  xpReward?: number;
  studyItemId?: string;
  monsterId?: string;
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
  requiredBait?: string;
  baitAmount?: number;
  materials?: { itemId: string; quantity: number }[];
  itemId?: string;
  actionDuration?: number;
  targetQuantity?: number;
  durationMs: number;
  addedAt: number;
  startedAt?: number;
  status: 'pending' | 'running' | 'completed';
  firemakingPrimarySlotIndex?: number;
  firemakingExtraSlots?: { slotIndex: number; logId: string; logName: string; actionId: number; itemId: string; xpReward: number; actionDuration: number }[];
}

export const ALLOWED_QUEUE_DURATIONS = [
  15 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  2 * 60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
];

export const MARKET_BUY_TAX = 0.18;
export const MARKET_BUY_ORDER_TAX = 0.18;
export const MARKET_LISTING_FEE = 0.15;

export function maxQueueSlots(playerBadgeIds: string[]): number {
  if (playerBadgeIds.includes('alpha_upholder')) return 3;
  return 2;
}

export const QUEUE_V2_TESTERS_ONLY = false;

export function isQueueV2Player(playerBadgeIds: string[], isTester?: number): boolean {
  if (!QUEUE_V2_TESTERS_ONLY) return true;
  if (isTester === 1) return true;
  return playerBadgeIds.includes('alpha_tester') || playerBadgeIds.includes('alpha_upholder');
}

const BASE_QUEUE_TIME_MS = 6 * 60 * 60 * 1000;
const UPHOLDER_BONUS_MS = 1 * 60 * 60 * 1000;

export function maxQueueTimeMs(playerBadgeIds: string[]): number {
  let total = BASE_QUEUE_TIME_MS;
  if (playerBadgeIds.includes('alpha_upholder')) total += UPHOLDER_BONUS_MS;
  return total;
}

export function getUsedQueueTimeMs(
  taskQueue: QueueItem[],
  activeTask?: { startTime?: number; queueDurationMs?: number; queueExpiresAt?: number } | null,
  activeCombat?: { combatStartTime?: number; queueDurationMs?: number; queueExpiresAt?: number } | null,
): number {
  let used = 0;
  for (const item of taskQueue) {
    used += item.durationMs;
  }
  const now = Date.now();
  if (activeTask?.queueDurationMs) {
    const remaining = activeTask.queueExpiresAt
      ? Math.max(0, activeTask.queueExpiresAt - now)
      : Math.max(0, activeTask.queueDurationMs - Math.max(0, now - (activeTask.startTime || now)));
    used += remaining;
  }
  if (activeCombat?.queueDurationMs) {
    const remaining = activeCombat.queueExpiresAt
      ? Math.max(0, activeCombat.queueExpiresAt - now)
      : Math.max(0, activeCombat.queueDurationMs - Math.max(0, now - (activeCombat.combatStartTime || now)));
    used += remaining;
  }
  return used;
}

export interface PartySnapshotMember {
  playerId: string;
  playerName: string;
  role: string;
  cachedWeaponType: string | null;
}

export interface PartySnapshotAtLogout {
  partyId: string;
  members: PartySnapshotMember[];
  snapshotAt: number; // timestamp ms
}

export const players = pgTable("players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  username: text("username").notNull().unique(),
  email: varchar("email").unique(),
  firebaseUid: varchar("firebase_uid").unique(),
  isGuest: integer("is_guest").notNull().default(0),
  avatar: varchar("avatar").notNull().default('knight'),
  language: varchar("language").notNull().default('en'),
  skills: jsonb("skills").notNull().default('{}'),
  inventory: jsonb("inventory").notNull().default('{}'),
  gold: integer("gold").notNull().default(0),
  activeTask: jsonb("active_task"),
  totalLevel: integer("total_level").notNull().default(0),
  currentHitpoints: integer("current_hitpoints").notNull().default(100),
  equipment: jsonb("equipment").notNull().default('{}'),
  activeCombat: jsonb("active_combat"),
  pendingCombatOfflineProgress: jsonb("pending_combat_offline_progress"),
  lastLogoutAt: timestamp("last_logout_at"),
  lastLoginAt: timestamp("last_login_at"),
  isOnline: integer("is_online").notNull().default(0),
  combatSessionStats: jsonb("combat_session_stats"),
  activeBuffs: jsonb("active_buffs").notNull().default('[]'),
  equipmentDurability: jsonb("equipment_durability").notNull().default('{}'),
  inventoryDurability: jsonb("inventory_durability").notNull().default('{}'),
  tradeEnabled: integer("trade_enabled").notNull().default(1),
  sessionToken: varchar("session_token"),
  dataVersion: integer("data_version").notNull().default(1),
  afkTimerExpiresAt: timestamp("afk_timer_expires_at"),
  currentRegion: varchar("current_region").notNull().default('verdant'),
  activeTravel: jsonb("active_travel"), // {targetRegion, startTime, endTime, cost}
  isTester: integer("is_tester").notNull().default(0), // 1 = can access test mode
  staffRole: varchar("staff_role"), // null = regular player, 'moderator' | 'translator'
  isBot: integer("is_bot").notNull().default(0), // 1 = AI bot player
  botLastActivity: timestamp("bot_last_activity"), // Last time bot performed an action
  // Weapon Mastery System - XP stored, level calculated from XP
  masteryDagger: integer("mastery_dagger").notNull().default(0),
  masterySwordShield: integer("mastery_sword_shield").notNull().default(0),
  mastery2hSword: integer("mastery_2h_sword").notNull().default(0),
  mastery2hAxe: integer("mastery_2h_axe").notNull().default(0),
  mastery2hWarhammer: integer("mastery_2h_warhammer").notNull().default(0),
  masteryBow: integer("mastery_bow").notNull().default(0),
  masteryStaff: integer("mastery_staff").notNull().default(0),
  // Enhancement System
  cursedItems: jsonb("cursed_items").notNull().default('[]'), // Array of cursed item IDs
  itemModifications: jsonb("item_modifications").notNull().default('{}'), // {itemId: {stats: {...}, skills: [...]}}
  enhancementPity: jsonb("enhancement_pity").notNull().default('{"statFails":0,"skillFails":0,"upgradeFails":0}'), // Player-wide pity counters
  isBanned: integer("is_banned").notNull().default(0),
  banReason: text("ban_reason"),
  bannedAt: timestamp("banned_at"),
  firemakingSlots: jsonb("firemaking_slots").notNull().default('{}'),
  lootCarry: jsonb("loot_carry").$type<Record<string, number>>(),
  taskProgressCarry: jsonb("task_progress_carry").$type<Record<string, number>>().default({}),
  partySnapshotAtLogout: jsonb("party_snapshot_at_logout").$type<PartySnapshotAtLogout | null>(),
  taskQueue: jsonb("task_queue").$type<QueueItem[]>().default([]),
  selectedBadge: varchar("selected_badge"),
  lastSeenGlobalChat: timestamp("last_seen_global_chat"),
  lastSaved: timestamp("last_saved").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  lastOfflineProcessedAt: timestamp("last_offline_processed_at"),
});

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
  lastSaved: true,
  lastSeen: true,
  totalLevel: true,
});

export const updatePlayerSchema = createInsertSchema(players).omit({
  id: true,
  username: true,
}).partial();

export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type UpdatePlayer = z.infer<typeof updatePlayerSchema>;
export type Player = typeof players.$inferSelect;

export const suspiciousActivities = pgTable("suspicious_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull(),
  playerUsername: text("player_username").notNull(),
  type: text("type").notNull(),
  details: jsonb("details").notNull().default('{}'),
  severity: text("severity").notNull().default('medium'),
  reviewed: integer("reviewed").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SuspiciousActivity = typeof suspiciousActivities.$inferSelect;

export const bannedEmails = pgTable("banned_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(),
  playerUsername: text("player_username"),
  reason: text("reason"),
  bannedAt: timestamp("banned_at").defaultNow(),
});

export type BannedEmail = typeof bannedEmails.$inferSelect;

// Combat types
export interface CombatStats {
  attack: number;
  strength: number;
  defence: number;
  hitpoints: number;
}

// =============================================================================
// ROLE SYSTEM
// =============================================================================

export type ArmorType = 'plate' | 'leather' | 'cloth';
export type WeaponType = 'sword_shield' | 'dagger' | '2h_sword' | '2h_axe' | '2h_warhammer' | 'bow' | 'staff';
export type BuffType = 'damage' | 'defence' | 'speed';
export type PlayerRole = 'tank' | 'dps' | 'healer' | 'hybrid';

// Base aggro values for armor types
export const ARMOR_TYPE_AGGRO: Record<ArmorType, number> = {
  plate: 150,    // Tank - high aggro
  leather: 80,   // DPS - medium aggro
  cloth: 40,     // Healer - low aggro
};

// Weapon type aggro modifiers
export const WEAPON_TYPE_AGGRO: Record<WeaponType, number> = {
  sword_shield: 50,   // Tank weapon
  '2h_warhammer': 30, // Tank/DPS hybrid
  dagger: -20,        // DPS - low aggro
  '2h_sword': 0,      // DPS - neutral
  '2h_axe': 10,       // DPS - slight aggro
  bow: -30,           // DPS - ranged, low aggro
  staff: -40,         // Healer - lowest aggro
};

// Role stat bonuses
export const ARMOR_TYPE_BONUSES: Record<ArmorType, { defenceMultiplier: number; damageMultiplier: number; healMultiplier: number }> = {
  plate: { defenceMultiplier: 1.3, damageMultiplier: 0.85, healMultiplier: 0.7 },
  leather: { defenceMultiplier: 1.0, damageMultiplier: 1.15, healMultiplier: 0.9 },
  cloth: { defenceMultiplier: 0.7, damageMultiplier: 0.9, healMultiplier: 1.3 },
};

// Extended combat stats with role system
export interface ExtendedCombatStats extends CombatStats {
  aggro: number;
  critChance: number;
  critDamage: number;
  healPower: number;
  buffPower: number;
  buffType?: BuffType;
  role: PlayerRole;
}

export interface Equipment {
  weapon?: string | null;
  helmet?: string | null;
  body?: string | null;
  legs?: string | null;
  shield?: string | null;
  gloves?: string | null;
  boots?: string | null;
  cape?: string | null;
  ring?: string | null;
  amulet?: string | null;
}

// =============================================================================
// DURABILITY SYSTEM
// =============================================================================

// Durability per equipment slot (slot -> current durability percentage, 10-100)
export interface EquipmentDurability {
  weapon?: number;
  helmet?: number;
  body?: number;
  legs?: number;
  shield?: number;
  gloves?: number;
  boots?: number;
  cape?: number;
  ring?: number;
  amulet?: number;
}

// Maximum inventory slots (unique item types)
export const MAX_INVENTORY_SLOTS = 24;

// Maximum durability is always 100 (percentage-based system)
export const MAX_DURABILITY = 100;
export const MIN_DURABILITY = 10; // Can't go below 10%, this is danger zone
export const DURABILITY_WARNING_THRESHOLD = 20; // Send push notification at 20%

// Durability loss per combat action (very slow: 1000 monsters ~= 5% loss)
// 1000 monsters * 2 hits avg = 2000 actions, 5% loss = 0.0025% per action
export const DURABILITY_LOSS_PER_HIT = 0.0025;

// Death durability loss: random between 25-50%
export const DEATH_DURABILITY_LOSS_MIN = 25;
export const DEATH_DURABILITY_LOSS_MAX = 50;

// Breakage chances when durability is at MIN_DURABILITY (10%)
// Items can only break during combat when at 10%, never on death if above 10%
// Higher rarity = lower breakage chance
export const BREAKAGE_CHANCES: Record<string, number> = {
  Common: 0.45,      // 45%
  Uncommon: 0.35,    // 35%
  Rare: 0.25,        // 25%
  Epic: 0.15,        // 15%
  Legendary: 0.08,   // 8%
  Mythic: 0.05,      // 5%
};

// Repair cost per durability point restored (gold per 1%)
export const REPAIR_COST_PER_POINT: Record<string, number> = {
  Common: 6,
  Uncommon: 15,
  Rare: 35,
  Epic: 90,
  Legendary: 220,
  Mythic: 600,
};

// Equipment drop chances by rarity (percentage 0-100)
// Used when equipment drops from monsters - rarity determines drop rate
export const EQUIPMENT_DROP_CHANCE_BY_RARITY: Record<string, number> = {
  Common: 20,        // 20%
  Uncommon: 10,      // 10%
  Rare: 6,           // 6%
  Epic: 3,           // 3%
  Legendary: 0.5,    // 0.5%
  Mythic: 0.1,       // 0.1%
};

export interface ActiveCombat {
  monsterId: string;
  monsterCurrentHp: number;
  playerLastAttackTime: number;
  monsterLastAttackTime: number;
  combatStartTime: number;
  limitExpiresAt?: number; // 6 hour idle limit - combat stops when this time is reached
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
  selectedFood?: string | null;
  // Auto-potion settings for offline combat
  autoPotionEnabled?: boolean;
  selectedPotion?: string | null;
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
  // Accumulated offline progress from scheduler (displayed in offline dialog)
  offlineProgress?: {
    monstersKilled: number;
    totalXpGained: { attack: number; strength: number; defence: number; hitpoints: number };
    lootGained: Record<string, number>;
    foodEaten: Record<string, number>;
    potionsConsumed: Record<string, number>;
    playerDied: boolean;
    brokenItems: string[];
    durabilityLosses: Record<string, { itemName: string; startDur: number; endDur: number }>;
    mythicDrops: { itemId: string; monsterId: string }[];
    offlineStartTime: number;
  };
  // Scheduler timestamps for offline progress calculation
  offlineStartTime?: number;
  schedulerTakeoverTime?: number;
  queueDurationMs?: number;
  queueExpiresAt?: number; // Absolute timestamp (ms) when queue slot expires — persisted to DB
  // Combat stopped flag (e.g., player died, idle timer expired)
  stopped?: boolean;
  // Flag indicating player died during offline combat
  playerDiedOffline?: boolean;
}

// Combat style modifiers (shared between online and offline)
// Attack style: +20% damage, -25% defense, +10% accuracy (aggressive, risk/reward)
// Defence style: -25% damage, +25% defense, -10% accuracy (defensive, survive longer)
// Balanced: +5% accuracy (no damage/defense changes)
export const COMBAT_STYLE_MODIFIERS = {
  attack: { damageMod: 1.20, defenceMod: 0.75, accuracyMod: 1.10 },
  defence: { damageMod: 0.75, defenceMod: 1.25, accuracyMod: 0.90 },
  balanced: { damageMod: 1.0, defenceMod: 1.0, accuracyMod: 1.05 },
};

// Combat constants (shared between online and offline)
export const PLAYER_ATTACK_SPEED = 2400; // Default player attack speed in ms (sword speed)
export const DEFAULT_WEAPON_SPEED = 2400; // Fallback when no weapon equipped
export const RESPAWN_DELAY = 3000; // ms

// Weapon categories and their characteristics
export type WeaponCategory = "dagger" | "sword" | "axe" | "hammer" | "bow" | "staff" | "2h_sword" | "2h_axe" | "2h_warhammer";

// Weapon skill types (player weapon skills)
export type WeaponSkillType = "critical" | "combo" | "armor_break" | "poison" | "lifesteal_burst";

export interface WeaponSkill {
  id: string;
  name: string;
  chance: number;
  type: WeaponSkillType;
  hits?: number;
  damageMultiplier?: number;
  armorBreakPercent?: number;
  dotDamage?: number;
  dotDuration?: number;
}

export interface CombatSessionStats {
  monstersKilled: number;
  foodEaten: number;
  deaths: number;
  loot: Record<string, number>;
  xpGained: Record<string, number>;
  startTime: number;
}

// Monster Skill Types
export type MonsterSkillType = 
  | "stun"           // Player can't attack for N attack cycles
  | "poison"         // DoT damage that stacks
  | "burn"           // DoT damage + reduces food healing by 50%
  | "critical"       // Guaranteed max damage hit
  | "combo"          // Multiple hits in succession
  | "enrage"         // Monster deals more damage when low HP
  | "armor_break"    // Reduces player defense temporarily
  | "heal_on_player_heal"    // Boss heals when any party member receives healing (food/staff)
  | "buff_punish"            // Boss deals extra damage based on number of buffed players
  | "aggro_swap"             // Boss periodically switches target to 2nd highest threat, bonus dmg if not tank
  | "aggro_reset"            // Boss resets all aggro and hits random target with x5 damage
  | "self_heal_percent"      // Boss heals % of max HP each turn
  | "reflect_damage"         // Boss reflects % of incoming damage back to attacker
  | "mass_stun"              // Boss stuns ALL party members
  | "mass_armor_break"       // Boss reduces ALL party members' defense
  | "execute_player"         // Boss instantly kills any player below 15% HP
  | "regenerate_on_no_stun"  // Boss heals if not stunned/silenced for N turns
  | "multi_target_attack"    // Boss attacks multiple targets per turn
  | "summon_adds"            // Boss summons additional monsters (extra HP pool)
  | "root"                   // Boss roots random players (they can't attack for duration)
  | "mass_burn"              // AoE burn damage to ALL party members
  | "mass_poison"            // AoE poison damage to ALL party members
  | "lifesteal"              // Monster heals for % of damage dealt
  | "evasion_aura"           // Monster has bonus evasion (passive, rewards high-accuracy weapons like bow)
  | "magic_shield"           // Monster takes reduced physical damage, staff/magic bypasses
  | "armor_repair";          // Monster gains stacking defense each turn, armor break resets

export interface MonsterSkill {
  id: string;
  name: string;
  nameTranslations?: Record<string, string>;
  chance: number;           // % chance to trigger on attack (0-100)
  type: MonsterSkillType;
  hits?: number;            // For combo skills - number of consecutive hits
  stunDuration?: number;    // For stun - number of player attack cycles to skip
  dotDamage?: number;       // For poison/burn - damage per tick (scaled)
  dotDuration?: number;     // For poison/burn - duration in seconds
  healingReduction?: number; // For burn/curse - reduce food healing (0.5 = 50% reduction)
  enrageThreshold?: number; // For enrage - HP % threshold to activate
  enrageDamageBoost?: number; // For enrage - damage multiplier when active
  armorBreakPercent?: number; // For armor_break - defense reduction %
  armorBreakDuration?: number; // For armor_break - duration in seconds
  healPercent?: number;          // For heal_on_player_heal - % of boss max HP healed per heal event
  selfHealPercent?: number;      // For self_heal_percent - % of max HP healed per turn
  reflectPercent?: number;       // For reflect_damage - % of damage reflected
  flatReflect?: number;          // For reflect_damage - flat damage reflected per hit (punishes fast weapons)
  buffPunishMultiplier?: number; // For buff_punish - damage multiplier per buffed player
  executeThreshold?: number;     // For execute_player - HP % threshold (default 15)
  regenTurns?: number;           // For regenerate_on_no_stun - turns without stun to trigger heal
  regenPercent?: number;         // For regenerate_on_no_stun - heal % when triggered
  summonCount?: number;          // For summon_adds - number of adds
  summonHpPercent?: number;      // For summon_adds - each add's HP as % of boss max HP
  rootDuration?: number;         // For root - duration in ms
  rootTargets?: number;          // For root - number of targets to root
  multiTargetCount?: number;     // For multi_target_attack - number of targets per attack
  massArmorBreakPercent?: number; // For mass_armor_break - defense reduction %
  massArmorBreakDuration?: number; // For mass_armor_break - duration in ms
  aggroSwapInterval?: number;    // For aggro_swap - every N attacks
  aggroSwapBonusDmg?: number;    // For aggro_swap - bonus damage multiplier on non-tank
  activateAtHpPercent?: number;  // For skills that activate at a specific boss HP threshold (e.g., reflect at <50%)
  maxActivations?: number;       // For skills with limited uses (e.g., summon_adds once)
  lifestealPercent?: number;     // For lifesteal - % of damage healed
  massBurnDamage?: number;       // For mass_burn - burn damage per tick
  massBurnDuration?: number;     // For mass_burn - duration in seconds
  massPoisonDamage?: number;     // For mass_poison - poison damage per tick
  massPoisonDuration?: number;   // For mass_poison - duration in seconds
  evasionBonus?: number;         // For evasion_aura - bonus evasion added to monster
  magicShieldPercent?: number;   // For magic_shield - % physical damage reduction (0-100)
  armorRepairPerTurn?: number;   // For armor_repair - defense gained per monster attack
  armorRepairCap?: number;       // For armor_repair - max stacked defense
}

export interface CombatDebuff {
  id: string;
  type: MonsterSkillType;
  name: string;
  expiresAt: number;        // Timestamp when debuff expires
  dotDamage?: number;       // For DoT debuffs - damage per second (scaled)
  healingReduction?: number; // For healing reduction debuffs
  stunCyclesRemaining?: number; // For stun - remaining attack cycles
  armorBreakPercent?: number; // For armor break - defense reduction %
  stackCount?: number;       // For stackable debuffs like poison
}

export interface Monster {
  id: string;
  name: string;
  region: "verdant" | "quarry" | "dunes" | "obsidian" | "dragonspire" | "frozen_wastes" | "void_realm";
  maxHitpoints: number;
  attackLevel: number;
  strengthLevel: number;
  defenceLevel: number;
  attackBonus?: number; // Monster's attack bonus (accuracy)
  strengthBonus?: number; // Monster's strength bonus (damage)
  attackSpeed: number; // ms between attacks
  loot: { itemId: string; chance: number; minQty: number; maxQty: number }[];
  xpReward: { attack: number; strength: number; defence: number; hitpoints: number };
  skills?: MonsterSkill[]; // Optional special skills
}

export interface CombatRegion {
  id: string;
  name: string;
  description: string;
  levelRange: { min: number; max: number };
  color: string;
}

// =============================================================================
// COMBAT SCALE CONSTANT
// =============================================================================
// All HP values (player HP, healing, monster damage) are scaled by this factor
// to make numbers feel more substantial (e.g., 160 HP instead of 16 HP)
export const COMBAT_HP_SCALE = 10;
export const DEFENCE_DR_CONSTANT = 200;

// =============================================================================
// COMBAT FORMULAS
// =============================================================================

// 1) Max Hit
// MaxHit = floor(1 + (StrengthLevel × 0.5) + (StrengthBonus × 1.5))
export function calculateMaxHit(strengthLevel: number, strengthBonus: number = 0): number {
  return Math.floor(1 + (strengthLevel * 0.5) + (strengthBonus * 1.5));
}

// 2) Min Hit
// MinHit = floor(1 + (StrengthLevel × 0.12) + (StrengthBonus × 0.40))
export function calculateMinHit(strengthLevel: number, strengthBonus: number = 0): number {
  return Math.floor(1 + (strengthLevel * 0.12) + (strengthBonus * 0.40));
}

// 3) Average Hit
// AverageHit = (MinHit + MaxHit) / 2
export function calculateAverageHit(strengthLevel: number, strengthBonus: number = 0): number {
  const minHit = calculateMinHit(strengthLevel, strengthBonus);
  const maxHit = calculateMaxHit(strengthLevel, strengthBonus);
  return (minHit + maxHit) / 2;
}

// 4) Defense Multiplier (for PLAYER attacking MONSTER)
// Used when player attacks monster - reduces player's damage based on monster's defence
// DefenseMultiplier = max(0.25, 80 / (80 + EnemyDefenceLevel))
export function calculateDefenseMultiplier(enemyDefenceLevel: number): number {
  return Math.max(0.25, 80 / (80 + enemyDefenceLevel));
}

// 4b) Damage Reduction (for MONSTER attacking PLAYER)
// Used when monster attacks player - reduces monster's damage based on player's defence
// DamageReduction% = min(75%, TotalDefence / (TotalDefence + DEFENCE_DR_CONSTANT))
// FinalDamage = max(1, floor(RawDamage × (1 - DamageReduction%)))
// TotalDefence = DefenceLevel + DefenceBonus (from equipment)
export function calculateDamageReduction(totalDefence: number): number {
  return Math.min(0.75, totalDefence / (totalDefence + DEFENCE_DR_CONSTANT));
}

export function applyDamageReduction(rawDamage: number, totalDefence: number): number {
  const reduction = calculateDamageReduction(totalDefence);
  return Math.max(1, Math.floor(rawDamage * (1 - reduction)));
}

// 5) Final Damage (used in combat)
// FinalDamage = max(1, floor(Random(MinHit, MaxHit) × DefenseMultiplier))
export function calculateFinalMaxHit(strengthLevel: number, strengthBonus: number, enemyDefenceLevel: number): number {
  const maxHit = calculateMaxHit(strengthLevel, strengthBonus);
  const defenseMultiplier = calculateDefenseMultiplier(enemyDefenceLevel);
  return Math.max(1, Math.floor(maxHit * defenseMultiplier));
}

export function calculateFinalMinHit(strengthLevel: number, strengthBonus: number, enemyDefenceLevel: number): number {
  const minHit = calculateMinHit(strengthLevel, strengthBonus);
  const defenseMultiplier = calculateDefenseMultiplier(enemyDefenceLevel);
  const finalMinHit = Math.max(1, Math.floor(minHit * defenseMultiplier));
  const finalMaxHit = calculateFinalMaxHit(strengthLevel, strengthBonus, enemyDefenceLevel);
  return Math.min(finalMinHit, finalMaxHit);
}

// 6) Accuracy Rating
// Accuracy = (AttackLevel + 9) × (AttackBonus + 64)
export function calculateAccuracyRating(attackLevel: number, attackBonus: number = 0): number {
  return (attackLevel + 9) * (attackBonus + 64);
}

// 7) Evasion Rating
// Evasion = (DefenceLevel + 9) × (DefenceBonus + 64)
export function calculateEvasionRating(defenceLevel: number, defenceBonus: number = 0): number {
  return (defenceLevel + 9) * (defenceBonus + 64);
}

// 8) Hit Chance
// If Accuracy < Evasion: HitChance = (Accuracy / (2 × Evasion)) × 100
// Else: HitChance = (1 - Evasion / (2 × Accuracy)) × 100
export function calculateHitChance(accuracy: number, evasion: number): number {
  if (accuracy < evasion) {
    return (accuracy / (2 * evasion)) * 100;
  }
  return (1 - evasion / (2 * accuracy)) * 100;
}

// 9) Player Attack Speed: 2400 ms
// 10) Enemy Respawn Time: 3000 ms

// =============================================================================
// MONSTER ATTACK FORMULAS (Monster attacking Player)
// =============================================================================

// 1) Monster Accuracy
// MonsterAccuracy = (MonsterAttackLevel + 9) × (MonsterAttackBonus + 64)
// (Uses calculateAccuracyRating function above)

// 2) Player Evasion
// PlayerEvasion = (PlayerDefenceLevel + 9) × (PlayerDefenceBonus + 64)
// (Uses calculateEvasionRating function above)

// 3) Monster Hit Chance
// If MonsterAccuracy < PlayerEvasion:
//   HitChance = (MonsterAccuracy / (2 × PlayerEvasion)) × 100
// Else:
//   HitChance = (1 - PlayerEvasion / (2 × MonsterAccuracy)) × 100
// (Uses calculateHitChance function above)

// 4) Player Defense Multiplier
// PlayerDefenseValue = PlayerDefenceLevel + PlayerDefenceBonus
// PlayerDefenseMultiplier = max(0.25, 80 / (80 + PlayerDefenseValue))
export function calculatePlayerDefenseMultiplier(playerDefenceLevel: number, playerDefenceBonus: number = 0): number {
  const playerDefenseValue = playerDefenceLevel + playerDefenceBonus;
  return Math.max(0.25, 80 / (80 + playerDefenseValue));
}

// 5) Monster Raw Damage
// RawDamage = Random(1, MonsterMaxHit)

// 6) Final Damage to Player
// FinalDamage = max(1, floor(RawDamage × PlayerDefenseMultiplier))
export function calculateMonsterDamageToPlayer(
  monsterMaxHit: number,
  playerDefenceLevel: number,
  playerDefenceBonus: number = 0
): { minDamage: number; maxDamage: number } {
  const defenseMultiplier = calculatePlayerDefenseMultiplier(playerDefenceLevel, playerDefenceBonus);
  const minDamage = Math.max(1, Math.floor(1 * defenseMultiplier));
  const maxDamage = Math.max(1, Math.floor(monsterMaxHit * defenseMultiplier));
  return { minDamage, maxDamage };
}

// =============================================================================

// Badges/Achievements system
export const badges = pgTable("badges", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: varchar("icon").notNull().default('trophy'),
  color: varchar("color").notNull().default('amber'),
  rarity: varchar("rarity").notNull().default('common'),
  imageUrl: text("image_url"),
  nameTranslations: jsonb("name_translations").default('{}'),
  descriptionTranslations: jsonb("description_translations").default('{}'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const playerBadges = pgTable("player_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id),
  badgeId: varchar("badge_id").notNull().references(() => badges.id),
  earnedAt: timestamp("earned_at").defaultNow(),
}, (table) => [
  index("IDX_player_badges_player").on(table.playerId),
  index("IDX_player_badges_badge").on(table.badgeId),
]);

export type Badge = typeof badges.$inferSelect;
export type InsertBadge = typeof badges.$inferInsert;
export type PlayerBadge = typeof playerBadges.$inferSelect;

// Market system
export const marketListings = pgTable("market_listings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sellerId: varchar("seller_id").notNull().references(() => players.id),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull(),
  pricePerItem: integer("price_per_item").notNull(),
  enhancementData: jsonb("enhancement_data"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  autoSellAt: timestamp("auto_sell_at"),
  region: text("region"),
}, (table) => [
  index("IDX_market_listings_seller").on(table.sellerId),
  index("IDX_market_listings_item").on(table.itemId),
  index("IDX_market_listings_region").on(table.region),
]);

export const insertMarketListingSchema = createInsertSchema(marketListings).omit({
  id: true,
  createdAt: true,
});

export type MarketListing = typeof marketListings.$inferSelect;
export type InsertMarketListing = z.infer<typeof insertMarketListingSchema>;

export const buyOrders = pgTable("buy_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  buyerId: varchar("buyer_id").notNull().references(() => players.id),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull(),
  remainingQuantity: integer("remaining_quantity").notNull(),
  pricePerItem: integer("price_per_item").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("IDX_buy_orders_buyer").on(table.buyerId),
  index("IDX_buy_orders_item_status").on(table.itemId, table.status),
]);

export const insertBuyOrderSchema = createInsertSchema(buyOrders).omit({
  id: true,
  createdAt: true,
  remainingQuantity: true,
  status: true,
});

export type BuyOrder = typeof buyOrders.$inferSelect;
export type InsertBuyOrder = z.infer<typeof insertBuyOrderSchema>;

export const marketPriceHistory = pgTable("market_price_history", {
  id: serial("id").primaryKey(),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull(),
  pricePerItem: integer("price_per_item").notNull(),
  sellerId: varchar("seller_id").notNull(),
  buyerId: varchar("buyer_id").notNull(),
  region: text("region"),
  soldAt: timestamp("sold_at").defaultNow(),
}, (table) => [
  index("IDX_market_price_history_item").on(table.itemId),
  index("IDX_market_price_history_sold_at").on(table.soldAt),
  index("IDX_market_price_history_item_sold").on(table.itemId, table.soldAt),
]);

export const insertMarketPriceHistorySchema = createInsertSchema(marketPriceHistory).omit({
  id: true,
  soldAt: true,
});

export type MarketPriceHistory = typeof marketPriceHistory.$inferSelect;
export type InsertMarketPriceHistory = z.infer<typeof insertMarketPriceHistorySchema>;

// Notifications system
// Persistent notification types - these stay until read, then deleted. Max 30 days.
export const PERSISTENT_NOTIFICATION_TYPES = [
  'OFFLINE_PROGRESS',
  'GUILD_INVITE', 
  'MARKET_SOLD',
] as const;

// Check if a notification type is persistent
export function isNotificationPersistent(type: string): boolean {
  return PERSISTENT_NOTIFICATION_TYPES.includes(type as typeof PERSISTENT_NOTIFICATION_TYPES[number]);
}

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id),
  type: varchar("type").notNull(), // MARKET_SOLD, MARKET_PAYMENT, MARKET_LISTING_CREATED, MARKET_LISTING_CANCELLED, MARKET_PURCHASE, GUILD_INVITE, OFFLINE_PROGRESS
  category: varchar("category").notNull().default('transient'), // 'persistent' or 'transient'
  message: text("message").notNull(),
  payload: jsonb("payload").default('{}'), // Extra data like itemId, quantity, goldAmount, buyerName
  read: integer("read").notNull().default(0), // 0 = unread, 1 = read
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_notifications_player").on(table.playerId),
  index("IDX_notifications_player_read").on(table.playerId, table.read),
  index("IDX_notifications_category").on(table.playerId, table.category),
]);

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  read: true,
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// Trade Offer system (offline-compatible)
export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull().references(() => players.id),
  receiverId: varchar("receiver_id").notNull().references(() => players.id),
  senderItems: jsonb("sender_items").notNull().default('{}'),
  receiverItems: jsonb("receiver_items").notNull().default('{}'),
  senderGold: integer("sender_gold").notNull().default(0),
  receiverGold: integer("receiver_gold").notNull().default(0),
  senderConfirmed: integer("sender_confirmed").notNull().default(0),
  receiverConfirmed: integer("receiver_confirmed").notNull().default(0),
  status: varchar("status").notNull().default('pending'),
  message: varchar("message", { length: 200 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("IDX_trades_sender").on(table.senderId),
  index("IDX_trades_receiver").on(table.receiverId),
  index("IDX_trades_status").on(table.status),
]);

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  senderConfirmed: true,
  receiverConfirmed: true,
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;

export interface TradeItems {
  [itemId: string]: number;
}

// ==================== GUILD SYSTEM ====================

// Guild entry types
export type GuildEntryType = 'public' | 'request' | 'invite';
export type GuildMemberRole = 'leader' | 'officer' | 'member';

// Main guilds table
export const guilds = pgTable("guilds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 32 }).notNull().unique(),
  description: text("description"),
  emblem: varchar("emblem").notNull().default('shield'), // Emblem identifier
  emblemColor: varchar("emblem_color").notNull().default('#8b5cf6'), // Primary color
  leaderId: varchar("leader_id").notNull().references(() => players.id),
  
  // Guild progression
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  totalContribution: integer("total_contribution").notNull().default(0),
  
  // Entry settings
  entryType: varchar("entry_type").notNull().default('request'), // public, request, invite
  minTotalLevel: integer("min_total_level").notNull().default(10),
  
  // Member limits (base + upgrades)
  baseMemberLimit: integer("base_member_limit").notNull().default(20),
  
  // Guild Bank Resources (passive contribution from member activities)
  bankResources: jsonb("bank_resources").notNull().default('{}'),
  
  // Dungeon v2 fields
  activeDungeonSessionId: varchar("active_dungeon_session_id"),
  dungeonNotificationFlag: integer("dungeon_notification_flag").notNull().default(0),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_guilds_leader").on(table.leaderId),
  index("IDX_guilds_level").on(table.level),
]);

// Guild members table
export const guildMembers = pgTable("guild_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: 'cascade' }),
  playerId: varchar("player_id").notNull().references(() => players.id).unique(), // Player can only be in 1 guild
  role: varchar("role").notNull().default('member'), // leader, officer, member
  
  // Contribution tracking
  totalContribution: integer("total_contribution").notNull().default(0),
  dailyContribution: integer("daily_contribution").notNull().default(0),
  lastContributionReset: timestamp("last_contribution_reset").defaultNow(),
  
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("IDX_guild_members_guild").on(table.guildId),
  index("IDX_guild_members_player").on(table.playerId),
]);

// Guild upgrades table
export const guildUpgrades = pgTable("guild_upgrades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: 'cascade' }),
  upgradeType: varchar("upgrade_type").notNull(), // member_capacity, gathering_bonus, idle_bonus, xp_bonus
  level: integer("level").notNull().default(1),
  purchasedAt: timestamp("purchased_at").defaultNow(),
}, (table) => [
  index("IDX_guild_upgrades_guild").on(table.guildId),
]);

// Guild messages (chat + announcements)
export const guildMessages = pgTable("guild_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: 'cascade' }),
  playerId: varchar("player_id").references(() => players.id, { onDelete: 'set null' }),
  playerName: varchar("player_name").notNull(), // Cached for deleted players
  messageType: varchar("message_type").notNull().default('chat'), // chat, announcement, system
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_guild_messages_guild").on(table.guildId),
  index("IDX_guild_messages_created").on(table.createdAt),
]);

// Guild join requests
export const guildJoinRequests = pgTable("guild_join_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: 'cascade' }),
  playerId: varchar("player_id").notNull().references(() => players.id),
  playerName: varchar("player_name").notNull(),
  playerTotalLevel: integer("player_total_level").notNull(),
  message: text("message"), // Optional join message
  status: varchar("status").notNull().default('pending'), // pending, accepted, rejected
  createdAt: timestamp("created_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
  respondedBy: varchar("responded_by").references(() => players.id),
}, (table) => [
  index("IDX_guild_join_requests_guild").on(table.guildId),
  index("IDX_guild_join_requests_player").on(table.playerId),
  index("IDX_guild_join_requests_status").on(table.status),
]);

// Guild invites (sent by guild leaders/officers to players)
export const guildInvites = pgTable("guild_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: 'cascade' }),
  guildName: varchar("guild_name").notNull(), // Cached for display
  targetPlayerId: varchar("target_player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  targetPlayerName: varchar("target_player_name").notNull(), // Cached for display
  inviterId: varchar("inviter_id").notNull().references(() => players.id),
  inviterName: varchar("inviter_name").notNull(), // Cached for display
  status: varchar("status").notNull().default('pending'), // pending, accepted, rejected, expired
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Optional expiry
  respondedAt: timestamp("responded_at"),
}, (table) => [
  index("IDX_guild_invites_guild").on(table.guildId),
  index("IDX_guild_invites_target").on(table.targetPlayerId),
  index("IDX_guild_invites_status").on(table.status),
]);

// Push subscriptions (for web push notifications - persisted to survive server restarts)
export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  endpoint: text("endpoint").notNull(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_push_subscriptions_player").on(table.playerId),
]);

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
export type InsertPushSubscription = {
  playerId: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
};

// Insert schemas
export const insertGuildSchema = createInsertSchema(guilds).omit({
  id: true,
  level: true,
  xp: true,
  totalContribution: true,
  baseMemberLimit: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGuildMemberSchema = createInsertSchema(guildMembers).omit({
  id: true,
  totalContribution: true,
  dailyContribution: true,
  lastContributionReset: true,
  joinedAt: true,
});

export const insertGuildUpgradeSchema = createInsertSchema(guildUpgrades).omit({
  id: true,
  purchasedAt: true,
});

export const insertGuildMessageSchema = createInsertSchema(guildMessages).omit({
  id: true,
  createdAt: true,
});

export const insertGuildJoinRequestSchema = createInsertSchema(guildJoinRequests).omit({
  id: true,
  status: true,
  createdAt: true,
  respondedAt: true,
  respondedBy: true,
});

export const insertGuildInviteSchema = createInsertSchema(guildInvites).omit({
  id: true,
  status: true,
  createdAt: true,
  respondedAt: true,
});

// Types
export type Guild = typeof guilds.$inferSelect;
export type InsertGuild = z.infer<typeof insertGuildSchema>;
export type GuildMember = typeof guildMembers.$inferSelect;
export type InsertGuildMember = z.infer<typeof insertGuildMemberSchema>;
export type GuildUpgrade = typeof guildUpgrades.$inferSelect;
export type InsertGuildUpgrade = z.infer<typeof insertGuildUpgradeSchema>;
export type GuildMessage = typeof guildMessages.$inferSelect;
export type InsertGuildMessage = z.infer<typeof insertGuildMessageSchema>;
export type GuildJoinRequest = typeof guildJoinRequests.$inferSelect;
export type InsertGuildJoinRequest = z.infer<typeof insertGuildJoinRequestSchema>;
export type GuildInvite = typeof guildInvites.$inferSelect;
export type InsertGuildInvite = z.infer<typeof insertGuildInviteSchema>;

// Guild upgrade definitions
export interface WoodCost {
  itemId: string;
  baseAmount: number;
  multiplier: number;
}

export interface GuildUpgradeDefinition {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
  effect: (level: number) => number;
  woodCosts: WoodCost[];
  resourceCosts?: { category: 'wood' | 'ore' | 'metal' | 'food' | 'monster' | 'rare' | 'gold'; baseAmount: number; multiplier: number }[];
}

// Helper to calculate wood cost at a specific level
export function getWoodCostForLevel(woodCost: WoodCost, level: number): number {
  return Math.floor(woodCost.baseAmount * Math.pow(woodCost.multiplier, level));
}

// Get all wood costs for an upgrade at a specific level
export function getUpgradeWoodCosts(upgradeType: string, targetLevel: number): { itemId: string; amount: number }[] {
  const upgrade = GUILD_UPGRADES[upgradeType];
  if (!upgrade) return [];
  
  return upgrade.woodCosts.map(wc => ({
    itemId: wc.itemId,
    amount: getWoodCostForLevel(wc, targetLevel)
  }));
}

export const GUILD_UPGRADES: Record<string, GuildUpgradeDefinition> = {
  member_capacity: {
    id: 'member_capacity',
    name: 'Üye Kapasitesi',
    description: 'Maksimum üye sayısını artırır',
    maxLevel: 10,
    baseCost: 5000,
    costMultiplier: 1.5,
    effect: (level) => level * 5,
    woodCosts: [
      { itemId: 'Oak Tree', baseAmount: 50, multiplier: 1.5 },
      { itemId: 'Willow Tree', baseAmount: 25, multiplier: 1.6 },
    ],
    resourceCosts: [
      { category: 'gold', baseAmount: 500, multiplier: 1.5 },
      { category: 'wood', baseAmount: 50, multiplier: 1.5 },
      { category: 'food', baseAmount: 30, multiplier: 1.4 },
    ],
  },
  gathering_bonus: {
    id: 'gathering_bonus',
    name: 'Toplama Bonusu',
    description: 'Tüm üyelerin toplama hızını artırır',
    maxLevel: 10,
    baseCost: 10000,
    costMultiplier: 1.8,
    effect: (level) => level * 2,
    woodCosts: [
      { itemId: 'Oak Tree', baseAmount: 100, multiplier: 1.4 },
      { itemId: 'Maple Tree', baseAmount: 30, multiplier: 1.5 },
    ],
    resourceCosts: [
      { category: 'gold', baseAmount: 800, multiplier: 1.6 },
      { category: 'wood', baseAmount: 80, multiplier: 1.5 },
      { category: 'ore', baseAmount: 40, multiplier: 1.5 },
    ],
  },
  idle_bonus: {
    id: 'idle_bonus',
    name: 'Idle Bonusu',
    description: 'Çevrimdışı kazançları artırır',
    maxLevel: 10,
    baseCost: 15000,
    costMultiplier: 2.0,
    effect: (level) => level * 3,
    woodCosts: [
      { itemId: 'Willow Tree', baseAmount: 75, multiplier: 1.5 },
      { itemId: 'Yew Tree', baseAmount: 20, multiplier: 1.6 },
    ],
    resourceCosts: [
      { category: 'gold', baseAmount: 1000, multiplier: 1.7 },
      { category: 'wood', baseAmount: 60, multiplier: 1.5 },
      { category: 'food', baseAmount: 40, multiplier: 1.5 },
    ],
  },
  xp_bonus: {
    id: 'xp_bonus',
    name: 'XP Bonusu',
    description: 'Tüm üyelerin XP kazancını artırır',
    maxLevel: 10,
    baseCost: 20000,
    costMultiplier: 2.2,
    effect: (level) => level * 1,
    woodCosts: [
      { itemId: 'Maple Tree', baseAmount: 60, multiplier: 1.5 },
      { itemId: 'Yew Tree', baseAmount: 25, multiplier: 1.6 },
      { itemId: 'Magic Tree', baseAmount: 5, multiplier: 1.8 },
    ],
    resourceCosts: [
      { category: 'gold', baseAmount: 1200, multiplier: 1.8 },
      { category: 'rare', baseAmount: 5, multiplier: 1.6 },
      { category: 'food', baseAmount: 50, multiplier: 1.5 },
    ],
  },
  gold_bonus: {
    id: 'gold_bonus',
    name: 'Altın Bonusu',
    description: 'Canavarlardan düşen altını artırır',
    maxLevel: 10,
    baseCost: 12000,
    costMultiplier: 1.8,
    effect: (level) => level * 2,
    woodCosts: [
      { itemId: 'Oak Tree', baseAmount: 80, multiplier: 1.4 },
      { itemId: 'Willow Tree', baseAmount: 40, multiplier: 1.5 },
    ],
    resourceCosts: [
      { category: 'gold', baseAmount: 1500, multiplier: 1.6 },
      { category: 'monster', baseAmount: 20, multiplier: 1.5 },
      { category: 'metal', baseAmount: 15, multiplier: 1.4 },
    ],
  },
  loot_bonus: {
    id: 'loot_bonus',
    name: 'Loot Şansı',
    description: 'Nadir eşya düşme şansını artırır',
    maxLevel: 10,
    baseCost: 25000,
    costMultiplier: 2.5,
    effect: (level) => level * 1,
    woodCosts: [
      { itemId: 'Yew Tree', baseAmount: 50, multiplier: 1.6 },
      { itemId: 'Magic Tree', baseAmount: 15, multiplier: 1.8 },
    ],
    resourceCosts: [
      { category: 'gold', baseAmount: 2000, multiplier: 1.8 },
      { category: 'rare', baseAmount: 10, multiplier: 1.7 },
      { category: 'monster', baseAmount: 30, multiplier: 1.6 },
    ],
  },
  combat_power: {
    id: 'combat_power',
    name: 'Savaş Gücü',
    description: 'Tüm üyelerin hasarını artırır',
    maxLevel: 10,
    baseCost: 18000,
    costMultiplier: 2.0,
    effect: (level) => level * 1.5,
    woodCosts: [
      { itemId: 'Maple Tree', baseAmount: 70, multiplier: 1.5 },
      { itemId: 'Yew Tree', baseAmount: 35, multiplier: 1.6 },
    ],
    resourceCosts: [
      { category: 'gold', baseAmount: 1000, multiplier: 1.7 },
      { category: 'metal', baseAmount: 30, multiplier: 1.6 },
      { category: 'monster', baseAmount: 25, multiplier: 1.5 },
    ],
  },
  defense_power: {
    id: 'defense_power',
    name: 'Savunma Gücü',
    description: 'Tüm üyelerin savunmasını artırır',
    maxLevel: 10,
    baseCost: 18000,
    costMultiplier: 2.0,
    effect: (level) => level * 1.5,
    woodCosts: [
      { itemId: 'Maple Tree', baseAmount: 70, multiplier: 1.5 },
      { itemId: 'Yew Tree', baseAmount: 35, multiplier: 1.6 },
    ],
    resourceCosts: [
      { category: 'gold', baseAmount: 1000, multiplier: 1.7 },
      { category: 'metal', baseAmount: 35, multiplier: 1.6 },
      { category: 'ore', baseAmount: 20, multiplier: 1.5 },
    ],
  },
  crafting_bonus: {
    id: 'crafting_bonus',
    name: 'Zanaat Bonusu',
    description: 'Crafting hızını artırır',
    maxLevel: 10,
    baseCost: 15000,
    costMultiplier: 1.9,
    effect: (level) => level * 2,
    woodCosts: [
      { itemId: 'Willow Tree', baseAmount: 60, multiplier: 1.5 },
      { itemId: 'Maple Tree', baseAmount: 40, multiplier: 1.5 },
    ],
    resourceCosts: [
      { category: 'gold', baseAmount: 800, multiplier: 1.6 },
      { category: 'metal', baseAmount: 40, multiplier: 1.5 },
      { category: 'ore', baseAmount: 30, multiplier: 1.5 },
    ],
  },
};

// Guild bonus types for easy access
export interface GuildBonuses {
  memberCapacity: number;      // Flat bonus to max members
  gatheringBonus: number;      // % bonus to gathering speed
  idleBonus: number;           // % bonus to offline gains
  xpBonus: number;             // % bonus to XP gains
  goldBonus: number;           // % bonus to gold drops
  lootBonus: number;           // % bonus to rare loot chance
  combatPower: number;         // % bonus to damage
  defensePower: number;        // % bonus to defense
  craftingBonus: number;       // % bonus to crafting speed
}

// Calculate all guild bonuses from upgrade levels
export function calculateGuildBonuses(upgrades: Record<string, number>): GuildBonuses {
  return {
    memberCapacity: GUILD_UPGRADES.member_capacity.effect(upgrades.member_capacity || 0),
    gatheringBonus: GUILD_UPGRADES.gathering_bonus.effect(upgrades.gathering_bonus || 0),
    idleBonus: GUILD_UPGRADES.idle_bonus.effect(upgrades.idle_bonus || 0),
    xpBonus: GUILD_UPGRADES.xp_bonus.effect(upgrades.xp_bonus || 0),
    goldBonus: GUILD_UPGRADES.gold_bonus.effect(upgrades.gold_bonus || 0),
    lootBonus: GUILD_UPGRADES.loot_bonus.effect(upgrades.loot_bonus || 0),
    combatPower: GUILD_UPGRADES.combat_power.effect(upgrades.combat_power || 0),
    defensePower: GUILD_UPGRADES.defense_power.effect(upgrades.defense_power || 0),
    craftingBonus: GUILD_UPGRADES.crafting_bonus.effect(upgrades.crafting_bonus || 0),
  };
}

// Guild level XP requirements (exponential curve)
export function getGuildLevelXp(level: number): number {
  return Math.floor(1000 * Math.pow(1.5, level - 1));
}

// Guild contribution from player activity
export function calculateGuildContribution(xpGained: number, playerLevel: number): number {
  // Higher level players contribute more, but with diminishing returns
  const levelMultiplier = 1 + Math.log10(playerLevel + 1) * 0.5;
  return Math.floor(xpGained * 0.1 * levelMultiplier);
}

// Daily contribution cap to prevent exploitation
export const DAILY_CONTRIBUTION_CAP = 10000;

// Guild creation cost
export const GUILD_CREATION_COST = 50000; // 50k gold

// Guild emblems available
export const GUILD_EMBLEMS = [
  'shield', 'sword', 'crown', 'dragon', 'lion', 'eagle', 
  'wolf', 'bear', 'phoenix', 'skull', 'star', 'flame'
] as const;

export type GuildEmblem = typeof GUILD_EMBLEMS[number];

// ==================== GUILD BANK RESOURCE SYSTEM ====================

// Resource categories for guild bank
export type GuildResourceCategory = 'wood' | 'ore' | 'metal' | 'food' | 'monster' | 'rare' | 'gold';

// Guild bank resources structure
export interface GuildBankResources {
  gold: number;
  wood: number;      // Logs from woodcutting
  ore: number;       // Ores from mining
  metal: number;     // Bars from crafting
  food: number;      // Fish, cooked food
  monster: number;   // Monster drops (fangs, scales, etc.)
  rare: number;      // Rare essences and special drops
}

// Default empty bank
export const EMPTY_GUILD_BANK: GuildBankResources = {
  gold: 0,
  wood: 0,
  ore: 0,
  metal: 0,
  food: 0,
  monster: 0,
  rare: 0,
};

// Contribution rates
export const GUILD_BANK_CONTRIBUTION = {
  goldFromCombat: 0.15,        // 15% of gold from monsters
  materialFromGathering: 0.20, // 20% chance to add resource to bank
  materialFromCrafting: 0.25,  // 25% chance to add materials to bank
};

// Map item IDs to resource categories
export function getItemResourceCategory(itemId: string): GuildResourceCategory | null {
  const lowerItem = itemId.toLowerCase();
  
  // Wood (logs/trees)
  if (lowerItem.includes('tree') || lowerItem.includes('log')) {
    return 'wood';
  }
  
  // Ores
  if (lowerItem.includes('ore') || lowerItem.includes('coal')) {
    return 'ore';
  }
  
  // Metal bars
  if (lowerItem.includes('bar') || lowerItem.includes('metal scrap')) {
    return 'metal';
  }
  
  // Food (fish, cooked items)
  if (lowerItem.includes('raw ') || lowerItem.includes('cooked ') || 
      lowerItem.includes('fish') || lowerItem.includes('meat') ||
      lowerItem.includes('stew') || lowerItem.includes('pie') ||
      lowerItem.includes('kebab') || lowerItem.includes('roast') ||
      lowerItem.includes('soup') || lowerItem.includes('steak')) {
    return 'food';
  }
  
  // Rare essences
  if (lowerItem.includes('essence') || lowerItem.includes('dark ') || 
      lowerItem.includes('dragon') || lowerItem.includes('mythic')) {
    return 'rare';
  }
  
  // Monster drops
  if (lowerItem.includes('fang') || lowerItem.includes('scale') || 
      lowerItem.includes('pelt') || lowerItem.includes('hide') ||
      lowerItem.includes('bone') || lowerItem.includes('claw') ||
      lowerItem.includes('wing') || lowerItem.includes('tail') ||
      lowerItem.includes('stinger') || lowerItem.includes('bandage') ||
      lowerItem.includes('mask') || lowerItem.includes('ear') ||
      lowerItem.includes('cloak') || lowerItem.includes('sac')) {
    return 'monster';
  }
  
  return null;
}

// Upgrade resource costs (replaces woodCosts)
export interface UpgradeResourceCost {
  category: GuildResourceCategory;
  baseAmount: number;
  multiplier: number;
}

// Get resource cost for a level
export function getResourceCostForLevel(cost: UpgradeResourceCost, level: number): number {
  return Math.floor(cost.baseAmount * Math.pow(cost.multiplier, level));
}

// Get all resource costs for an upgrade at a specific level
export function getUpgradeResourceCosts(upgradeType: string, targetLevel: number): { category: GuildResourceCategory; amount: number }[] {
  const upgrade = GUILD_UPGRADES[upgradeType];
  if (!upgrade || !upgrade.resourceCosts) return [];
  
  return upgrade.resourceCosts.map(rc => ({
    category: rc.category,
    amount: getResourceCostForLevel(rc, targetLevel)
  }));
}

// Check if guild has enough resources for upgrade
export function canAffordUpgrade(bankResources: GuildBankResources, upgradeType: string, targetLevel: number): boolean {
  const costs = getUpgradeResourceCosts(upgradeType, targetLevel);
  
  for (const cost of costs) {
    const available = bankResources[cost.category] || 0;
    if (available < cost.amount) {
      return false;
    }
  }
  
  return true;
}

// Deduct resources from bank for upgrade
export function deductUpgradeCosts(bankResources: GuildBankResources, upgradeType: string, targetLevel: number): GuildBankResources {
  const costs = getUpgradeResourceCosts(upgradeType, targetLevel);
  const newResources = { ...bankResources };
  
  for (const cost of costs) {
    newResources[cost.category] = Math.max(0, (newResources[cost.category] || 0) - cost.amount);
  }
  
  return newResources;
}

// =============================================================================
// GAME DATA TABLES (Items, Recipes, Regions, Monsters)
// =============================================================================

// Items table - stores all game items (equipment, materials, food, potions)
export const gameItems = pgTable("game_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(), // material, equipment, food, potion, misc
  equipSlot: text("equip_slot"), // weapon, helmet, body, legs, etc.
  stats: jsonb("stats"), // {attackBonus, strengthBonus, defenceBonus, accuracyBonus, hitpointsBonus}
  levelRequired: integer("level_required"),
  skillRequired: text("skill_required"),
  vendorPrice: integer("vendor_price"),
  untradable: integer("untradable").default(0), // 0 = tradable, 1 = untradable
  duration: integer("duration"), // for potions - duration in ms
  effect: jsonb("effect"), // for potions - {type, value}
  weaponCategory: text("weapon_category"), // dagger, sword, axe, hammer, bow, staff, 2h_sword, 2h_axe, 2h_warhammer
  attackSpeedMs: integer("attack_speed_ms"),
  lifestealPercent: integer("lifesteal_percent"),
  weaponSkills: jsonb("weapon_skills").default('[]'), // full skill objects with id, name, chance, type, etc.
  icon: text("icon"),
  healAmount: integer("heal_amount"), // for food items
  nameTranslations: jsonb("name_translations").default('{}'), // {en: "...", tr: "...", ru: "...", de: "...", fr: "...", es: "...", zh: "...", pt: "..."}
  descriptionTranslations: jsonb("description_translations").default('{}'), // Same format as nameTranslations
  // Role system fields
  armorType: text("armor_type"), // plate, leather, cloth - determines role bonuses
  weaponType: text("weapon_type"), // sword_shield, dagger, 2h_sword, 2h_axe, 2h_warhammer, bow, staff
  aggroModifier: integer("aggro_modifier").default(0), // affects aggro in party combat
  critChance: integer("crit_chance").default(0), // critical hit chance percentage
  critDamage: integer("crit_damage").default(0), // critical hit damage bonus percentage
  healPower: integer("heal_power").default(0), // healing effectiveness for staff weapons
  buffPower: integer("buff_power").default(0), // buff effectiveness percentage
  buffType: text("buff_type"), // damage, defence, speed - for staff weapons
  staffType: text("staff_type"), // dps or healer - determines staff role
  // New armor-type specific bonuses
  skillDamageBonus: integer("skill_damage_bonus").default(0), // % skill damage increase - for cloth armor
  attackSpeedBonus: integer("attack_speed_bonus").default(0), // % attack speed increase - for leather armor
  healingReceivedBonus: integer("healing_received_bonus").default(0), // % healing received increase - for plate/metal armor
  // New staff-specific bonuses (healer staffs)
  onHitHealingPercent: integer("on_hit_healing_percent").default(0), // % of damage dealt heals party members
  buffDurationBonus: integer("buff_duration_bonus").default(0), // % buff/potion duration increase
  partyDpsBuff: integer("party_dps_buff").default(0), // % DPS boost for party members
  partyDefenceBuff: integer("party_defence_buff").default(0), // % defence boost for party members
  partyAttackSpeedBuff: integer("party_attack_speed_buff").default(0), // % attack speed boost for party
  lootChanceBonus: integer("loot_chance_bonus").default(0), // % extra loot drop chance for party
  // Weapon Mastery System
  masteryRequired: integer("mastery_required").default(1), // Minimum mastery level to equip this weapon
  salvageOverride: jsonb("salvage_override"), // {minScrap: number, maxScrap: number} - overrides formula-based salvage
  isDraft: integer("is_draft").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGameItemSchema = createInsertSchema(gameItems).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertGameItem = z.infer<typeof insertGameItemSchema>;
export type GameItem = typeof gameItems.$inferSelect;

// Equipment Sets table - defines set bonuses for equipment collections
export const equipmentSets = pgTable("equipment_sets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  pieces: jsonb("pieces").notNull(), // Array of item IDs that belong to this set
  bonuses: jsonb("bonuses").notNull(), // Array of {requiredPieces: number, effects: {statName: value}}
  icon: text("icon"),
  nameTranslations: jsonb("name_translations").default('{}'),
  descriptionTranslations: jsonb("description_translations").default('{}'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEquipmentSetSchema = createInsertSchema(equipmentSets).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertEquipmentSet = z.infer<typeof insertEquipmentSetSchema>;
export type EquipmentSet = typeof equipmentSets.$inferSelect;

// Set bonus effect interface
export interface SetBonusEffect {
  requiredPieces: number;
  effects: {
    attackBonus?: number;
    strengthBonus?: number;
    defenceBonus?: number;
    hitpointsBonus?: number;
    accuracyBonus?: number;
    damageReduction?: number;
    critChance?: number;
    lifesteal?: number;
    xpBoost?: number;
  };
  description?: string;
  descriptionTranslations?: Record<string, string>;
}

// Recipes table - stores all crafting recipes
export const gameRecipes = pgTable("game_recipes", {
  id: text("id").primaryKey(),
  resultItemId: text("result_item_id").notNull(),
  resultQuantity: integer("result_quantity").notNull().default(1),
  materials: jsonb("materials").notNull(), // [{itemId, quantity}]
  skill: text("skill").notNull(), // crafting, cooking, alchemy
  levelRequired: integer("level_required").notNull(),
  xpReward: integer("xp_reward").notNull(),
  craftTime: integer("craft_time").notNull(), // ms
  category: text("category"), // smelting, sword, shield, armor, accessory, cooking, potion
  regionId: text("region_id"), // Legacy single region (kept for backward compat)
  regionIds: jsonb("region_ids").default('[]'), // Array of region IDs where this recipe is available (empty = all regions)
  isDraft: integer("is_draft").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGameRecipeSchema = createInsertSchema(gameRecipes).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertGameRecipe = z.infer<typeof insertGameRecipeSchema>;
export type GameRecipe = typeof gameRecipes.$inferSelect;

// Combat Regions table - stores combat areas
export const gameCombatRegions = pgTable("game_combat_regions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  levelRangeMin: integer("level_range_min").notNull(),
  levelRangeMax: integer("level_range_max").notNull(),
  color: text("color").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  icon: text("icon"),
  travelCost: integer("travel_cost").notNull().default(0), // Gold cost to travel here
  travelTime: integer("travel_time").notNull().default(0), // Seconds to travel here
  mapPosition: jsonb("map_position").default('{}'), // {x: number, y: number} for lore map
  nameTranslations: jsonb("name_translations").default('{}'), // {en: "...", tr: "...", etc.}
  descriptionTranslations: jsonb("description_translations").default('{}'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGameCombatRegionSchema = createInsertSchema(gameCombatRegions).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertGameCombatRegion = z.infer<typeof insertGameCombatRegionSchema>;
export type GameCombatRegion = typeof gameCombatRegions.$inferSelect;

// Monsters table - stores all monsters
export const gameMonsters = pgTable("game_monsters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  regionId: text("region_id").notNull(), // references gameCombatRegions.id
  maxHitpoints: integer("max_hitpoints").notNull(),
  attackLevel: integer("attack_level").notNull(),
  strengthLevel: integer("strength_level").notNull(),
  defenceLevel: integer("defence_level").notNull(),
  attackBonus: integer("attack_bonus").default(0),
  strengthBonus: integer("strength_bonus").default(0),
  attackSpeed: integer("attack_speed").notNull(), // ms between attacks
  loot: jsonb("loot").notNull().default('[]'), // [{itemId, chance, minQty, maxQty}]
  xpReward: jsonb("xp_reward").notNull(), // {attack, strength, defence, hitpoints}
  skills: jsonb("skills").default('[]'), // full skill objects with id, name, chance, type, etc.
  icon: text("icon"),
  sortOrder: integer("sort_order").default(0),
  nameTranslations: jsonb("name_translations").default('{}'), // {en: "...", tr: "...", etc.}
  isDraft: integer("is_draft").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGameMonsterSchema = createInsertSchema(gameMonsters).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertGameMonster = z.infer<typeof insertGameMonsterSchema>;
export type GameMonster = typeof gameMonsters.$inferSelect;

// =============================================================================
// SKILL ACTIONS TABLE (Woodcutting, Mining, Fishing actions)
// =============================================================================

export const gameSkillActions = pgTable("game_skill_actions", {
  id: text("id").primaryKey(), // e.g., "woodcutting_normal_tree"
  skill: text("skill").notNull(), // woodcutting, mining, fishing
  name: text("name").notNull(), // Display name (Normal Tree)
  description: text("description"), // Optional description
  itemId: text("item_id").notNull(), // ID of item produced (matches game_items.id)
  levelRequired: integer("level_required").notNull().default(0),
  xpReward: integer("xp_reward").notNull(),
  duration: integer("duration").notNull(), // ms
  requiredBait: text("required_bait"), // For fishing
  baitAmount: integer("bait_amount"), // For fishing
  icon: text("icon"),
  regionId: text("region_id"), // Region where this action is available (null = all regions)
  sortOrder: integer("sort_order").default(0),
  nameTranslations: jsonb("name_translations").default('{}'), // {en: "...", tr: "...", etc.}
  descriptionTranslations: jsonb("description_translations").default('{}'),
  isDraft: integer("is_draft").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGameSkillActionSchema = createInsertSchema(gameSkillActions).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertGameSkillAction = z.infer<typeof insertGameSkillActionSchema>;
export type GameSkillAction = typeof gameSkillActions.$inferSelect;

// ==================== DRAFT SNAPSHOTS ====================

export const gameDraftSnapshots = pgTable("game_draft_snapshots", {
  id: serial("id").primaryKey(),
  tableName: text("table_name").notNull(),
  recordId: text("record_id").notNull(),
  snapshotData: jsonb("snapshot_data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== GUILD RAID SYSTEM ====================

// Raid boss definitions - static boss data
export const raidBosses = pgTable("raid_bosses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  
  // Base stats (multiplied by difficulty)
  baseHp: integer("base_hp").notNull(), // e.g., 10,000,000
  attackLevel: integer("attack_level").notNull(),
  strengthLevel: integer("strength_level").notNull(),
  defenceLevel: integer("defence_level").notNull(),
  attackSpeed: integer("attack_speed").notNull().default(3000), // ms
  
  // Boss skills - array of skill objects
  skills: jsonb("skills").notNull().default('[]'),
  
  // Loot table - items dropped on kill
  loot: jsonb("loot").notNull().default('[]'), // [{itemId, chance, minQty, maxQty}]
  
  // Milestone rewards
  milestoneRewards: jsonb("milestone_rewards").notNull().default('{}'), // {75: [...], 50: [...], 25: [...], 0: [...]}
  
  // Raid token reward on kill
  tokenReward: integer("token_reward").notNull().default(100),
  
  // Rotation week (1-4, determines which week this boss appears)
  rotationWeek: integer("rotation_week").notNull().default(1),
  
  // Is this a premium boss (requires activity points to unlock)?
  isPremium: integer("is_premium").notNull().default(0),
  premiumActivityCost: integer("premium_activity_cost").default(5000),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRaidBossSchema = createInsertSchema(raidBosses).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertRaidBoss = z.infer<typeof insertRaidBossSchema>;
export type RaidBoss = typeof raidBosses.$inferSelect;

// Active guild raids - tracks current/past raids for each guild
export const guildRaids = pgTable("guild_raids", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: 'cascade' }),
  bossId: text("boss_id").notNull(), // references raidBosses.id
  
  // Difficulty settings
  difficulty: varchar("difficulty").notNull().default('normal'), // normal, hard, nightmare, mythic
  difficultyMultiplier: integer("difficulty_multiplier").notNull().default(1), // 1, 3, 10, 25
  
  // Boss state
  maxHp: integer("max_hp").notNull(),
  currentHp: integer("current_hp").notNull(),
  
  // Milestone tracking (which milestones have been reached)
  milestone75Reached: integer("milestone_75_reached").notNull().default(0),
  milestone50Reached: integer("milestone_50_reached").notNull().default(0),
  milestone25Reached: integer("milestone_25_reached").notNull().default(0),
  
  // Total damage dealt
  totalDamage: integer("total_damage").notNull().default(0),
  
  // Status
  status: varchar("status").notNull().default('active'), // scheduled, active, completed, failed, expired
  
  // Timing
  scheduledAt: timestamp("scheduled_at"), // When raid is scheduled to start (null = immediate)
  startedAt: timestamp("started_at").defaultNow(),
  endsAt: timestamp("ends_at").notNull(), // When raid expires
  completedAt: timestamp("completed_at"),
  
  // Who started this raid (leader/officer)
  startedBy: varchar("started_by").references(() => players.id),
}, (table) => [
  index("IDX_guild_raids_guild").on(table.guildId),
  index("IDX_guild_raids_status").on(table.status),
  index("IDX_guild_raids_ends_at").on(table.endsAt),
]);

export const insertGuildRaidSchema = createInsertSchema(guildRaids).omit({
  id: true,
  totalDamage: true,
  milestone75Reached: true,
  milestone50Reached: true,
  milestone25Reached: true,
  status: true,
  startedAt: true,
  completedAt: true,
});

export type InsertGuildRaid = z.infer<typeof insertGuildRaidSchema>;
export type GuildRaid = typeof guildRaids.$inferSelect;

// Player participation in raids
export const raidParticipation = pgTable("raid_participation", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  raidId: varchar("raid_id").notNull().references(() => guildRaids.id, { onDelete: 'cascade' }),
  playerId: varchar("player_id").notNull().references(() => players.id),
  
  // Damage tracking
  totalDamage: integer("total_damage").notNull().default(0),
  attacksToday: integer("attacks_today").notNull().default(0),
  lastAttackReset: timestamp("last_attack_reset").defaultNow(),
  
  // Streak tracking (consecutive days of participation)
  currentStreak: integer("current_streak").notNull().default(0),
  lastParticipationDate: timestamp("last_participation_date"),
  
  // Reward tracking
  tokensEarned: integer("tokens_earned").notNull().default(0),
  milestone75Claimed: integer("milestone_75_claimed").notNull().default(0),
  milestone50Claimed: integer("milestone_50_claimed").notNull().default(0),
  milestone25Claimed: integer("milestone_25_claimed").notNull().default(0),
  killRewardClaimed: integer("kill_reward_claimed").notNull().default(0),
  weeklyChestAwarded: integer("weekly_chest_awarded").notNull().default(0),
  
  // Participation day tracking for weekly chest
  daysParticipated: integer("days_participated").notNull().default(0),
  lastDayParticipated: text("last_day_participated"), // YYYY-MM-DD UTC
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_raid_participation_raid").on(table.raidId),
  index("IDX_raid_participation_player").on(table.playerId),
  index("IDX_raid_participation_damage").on(table.totalDamage),
]);

export const insertRaidParticipationSchema = createInsertSchema(raidParticipation).omit({
  id: true,
  totalDamage: true,
  attacksToday: true,
  lastAttackReset: true,
  currentStreak: true,
  lastParticipationDate: true,
  tokensEarned: true,
  milestone75Claimed: true,
  milestone50Claimed: true,
  milestone25Claimed: true,
  killRewardClaimed: true,
  createdAt: true,
});

export type InsertRaidParticipation = z.infer<typeof insertRaidParticipationSchema>;
export type RaidParticipation = typeof raidParticipation.$inferSelect;

// Player raid tokens (currency for raid shop)
export const raidTokens = pgTable("raid_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id).unique(),
  
  // Token balance
  balance: integer("balance").notNull().default(0),
  totalEarned: integer("total_earned").notNull().default(0),
  totalSpent: integer("total_spent").notNull().default(0),
  
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_raid_tokens_player").on(table.playerId),
]);

export type RaidToken = typeof raidTokens.$inferSelect;

// Raid shop items
export const raidShopItems = pgTable("raid_shop_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  
  // Item details
  itemId: text("item_id").notNull(), // The actual item given when purchased
  quantity: integer("quantity").notNull().default(1),
  
  // Price in raid tokens
  tokenCost: integer("token_cost").notNull(),
  
  // Purchase limits
  maxPurchases: integer("max_purchases"), // null = unlimited
  resetPeriod: varchar("reset_period"), // null, 'daily', 'weekly', 'monthly'
  
  // Requirements
  minGuildLevel: integer("min_guild_level").default(1),
  
  // Boss-specific rotating item (null = always visible, bossId = only visible that boss's week)
  bossId: text("boss_id"),
  
  // Availability
  isActive: integer("is_active").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type RaidShopItem = typeof raidShopItems.$inferSelect;

// Player purchases from raid shop (for tracking limits)
export const raidShopPurchases = pgTable("raid_shop_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id),
  shopItemId: text("shop_item_id").notNull(),
  
  purchaseCount: integer("purchase_count").notNull().default(0),
  lastPurchaseAt: timestamp("last_purchase_at").defaultNow(),
  lastResetAt: timestamp("last_reset_at").defaultNow(),
}, (table) => [
  index("IDX_raid_shop_purchases_player").on(table.playerId),
  index("IDX_raid_shop_purchases_item").on(table.shopItemId),
]);

export type RaidShopPurchase = typeof raidShopPurchases.$inferSelect;

// Guild activity points (for premium boss unlocks)
export const guildActivityPoints = pgTable("guild_activity_points", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: varchar("guild_id").notNull().references(() => guilds.id, { onDelete: 'cascade' }).unique(),
  
  // Current points for unlocking premium boss
  currentPoints: integer("current_points").notNull().default(0),
  totalPointsEarned: integer("total_points_earned").notNull().default(0),
  
  // Last premium boss unlock
  lastPremiumUnlock: timestamp("last_premium_unlock"),
  
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_guild_activity_points_guild").on(table.guildId),
]);

export type GuildActivityPoints = typeof guildActivityPoints.$inferSelect;

// Raid difficulty multipliers and requirements
export const RAID_DIFFICULTY = {
  normal: { multiplier: 1, rewardMultiplier: 1, minGuildLevel: 1 },
  hard: { multiplier: 3, rewardMultiplier: 2, minGuildLevel: 5 },
  nightmare: { multiplier: 10, rewardMultiplier: 4, minGuildLevel: 10 },
  mythic: { multiplier: 25, rewardMultiplier: 8, minGuildLevel: 15 },
} as const;

export type RaidDifficulty = keyof typeof RAID_DIFFICULTY;

// Raid constants
export const RAID_CONSTANTS = {
  // Attack limits
  DAILY_ATTACKS: 2,
  PREMIUM_DAILY_ATTACKS: 3,
  ATTACK_DURATION_MS: 60000, // 60 seconds
  
  // Streak bonuses
  STREAK_3_BONUS: 0.10, // 10%
  STREAK_7_BONUS: 0.25, // 25%
  STREAK_14_BONUS: 0.50, // 50%
  
  // Timing
  WEEKLY_RAID_DURATION_DAYS: 7,
  PREMIUM_RAID_DURATION_HOURS: 48,
  
  // Token rewards
  MILESTONE_75_TOKENS: 10,
  MILESTONE_50_TOKENS: 25,
  MILESTONE_25_TOKENS: 50,
  PARTICIPATION_TOKENS: 20,
  
  // Activity point earning
  ACTIVITY_PER_100_KILLS: 1,
  ACTIVITY_PER_5_CRAFTS: 1,
  MAX_DAILY_ACTIVITY: 50,
} as const;

// =============================================================================
// DUNGEON SYSTEM
// =============================================================================

// Key types for dungeon access
export type DungeonKeyType = 'bronze' | 'silver' | 'gold' | 'void';
export type DungeonRunStatus = 'active' | 'completed' | 'failed' | 'abandoned';

// Dungeon definitions (DB-driven, no hardcoding)
export const dungeons = pgTable("dungeons", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  tier: integer("tier").notNull(), // 1-8
  keyType: varchar("key_type").notNull(), // bronze/silver/gold/void
  floorCount: integer("floor_count"), // null for endless
  bossFloors: jsonb("boss_floors").notNull().default('[]'), // array of floor numbers
  minLevel: integer("min_level").notNull().default(1),
  recommendedLevel: integer("recommended_level").notNull().default(1),
  isEndless: integer("is_endless").notNull().default(0), // 0/1
  isActive: integer("is_active").notNull().default(1), // 0/1
  icon: text("icon"),
  nameTranslations: jsonb("name_translations").notNull().default('{}'),
  descriptionTranslations: jsonb("description_translations").notNull().default('{}'),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_dungeons_tier").on(table.tier),
  index("IDX_dungeons_key_type").on(table.keyType),
  index("IDX_dungeons_active").on(table.isActive),
]);

export const insertDungeonSchema = createInsertSchema(dungeons).omit({
  createdAt: true,
});

export type Dungeon = typeof dungeons.$inferSelect;
export type InsertDungeon = z.infer<typeof insertDungeonSchema>;

// Floor configuration templates
export const dungeonFloorTemplates = pgTable("dungeon_floor_templates", {
  id: varchar("id").primaryKey(),
  dungeonId: varchar("dungeon_id").notNull().references(() => dungeons.id, { onDelete: 'cascade' }),
  floorRangeStart: integer("floor_range_start").notNull(),
  floorRangeEnd: integer("floor_range_end").notNull(),
  monsterPool: jsonb("monster_pool").notNull().default('[]'), // array of monster_ids
  monsterCountMin: integer("monster_count_min").notNull().default(1),
  monsterCountMax: integer("monster_count_max").notNull().default(3),
  modifierChance: integer("modifier_chance").notNull().default(0), // 0-100
  lootMultiplier: integer("loot_multiplier").notNull().default(100), // 100 = 1x
  powerMultiplier: integer("power_multiplier").notNull().default(100), // 100 = 1x, 1000 = 10x
  isBossFloor: integer("is_boss_floor").notNull().default(0), // 0/1
  bossMonsterIds: jsonb("boss_monster_ids").default('[]'), // optional
}, (table) => [
  index("IDX_dungeon_floor_templates_dungeon").on(table.dungeonId),
  index("IDX_dungeon_floor_templates_range").on(table.dungeonId, table.floorRangeStart, table.floorRangeEnd),
]);

export const insertDungeonFloorTemplateSchema = createInsertSchema(dungeonFloorTemplates);

export type DungeonFloorTemplate = typeof dungeonFloorTemplates.$inferSelect;
export type InsertDungeonFloorTemplate = z.infer<typeof insertDungeonFloorTemplateSchema>;

// Modifier definitions (fully DB-driven)
export const dungeonModifiers = pgTable("dungeon_modifiers", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  effect: jsonb("effect").notNull().default('{}'), // {lootBonus, xpBonus, damageBonus, defenceBonus, mobHpBonus, mobDamageBonus, specialEffect}
  icon: text("icon"),
  tier: integer("tier").notNull().default(1), // which dungeons can have this
  isActive: integer("is_active").notNull().default(1), // 0/1
  nameTranslations: jsonb("name_translations").notNull().default('{}'),
  descriptionTranslations: jsonb("description_translations").notNull().default('{}'),
}, (table) => [
  index("IDX_dungeon_modifiers_tier").on(table.tier),
  index("IDX_dungeon_modifiers_active").on(table.isActive),
]);

export const insertDungeonModifierSchema = createInsertSchema(dungeonModifiers);

export type DungeonModifier = typeof dungeonModifiers.$inferSelect;
export type InsertDungeonModifier = z.infer<typeof insertDungeonModifierSchema>;

// Modifier effect interface
export interface DungeonModifierEffect {
  lootBonus?: number;
  xpBonus?: number;
  damageBonus?: number;
  defenceBonus?: number;
  mobHpBonus?: number;
  mobDamageBonus?: number;
  specialEffect?: string;
}

// Loot configuration
export const dungeonLootTables = pgTable("dungeon_loot_tables", {
  id: varchar("id").primaryKey(),
  dungeonId: varchar("dungeon_id").notNull().references(() => dungeons.id, { onDelete: 'cascade' }),
  floorRangeStart: integer("floor_range_start").notNull(),
  floorRangeEnd: integer("floor_range_end").notNull(),
  commonChance: integer("common_chance").notNull().default(0),
  uncommonChance: integer("uncommon_chance").notNull().default(0),
  rareChance: integer("rare_chance").notNull().default(0),
  epicChance: integer("epic_chance").notNull().default(0),
  legendaryChance: integer("legendary_chance").notNull().default(0),
  mythicChance: integer("mythic_chance").notNull().default(0),
  guaranteedDrops: jsonb("guaranteed_drops").notNull().default('[]'), // array of item_ids
  possibleDrops: jsonb("possible_drops").notNull().default('[]'), // array of {itemId, weight}
  partyExclusiveDrops: jsonb("party_exclusive_drops").default('[]'),
}, (table) => [
  index("IDX_dungeon_loot_tables_dungeon").on(table.dungeonId),
  index("IDX_dungeon_loot_tables_range").on(table.dungeonId, table.floorRangeStart, table.floorRangeEnd),
]);

export const insertDungeonLootTableSchema = createInsertSchema(dungeonLootTables);

export type DungeonLootTable = typeof dungeonLootTables.$inferSelect;
export type InsertDungeonLootTable = z.infer<typeof insertDungeonLootTableSchema>;

// Possible drop interface
export interface DungeonPossibleDrop {
  itemId: string;
  weight: number;
}

// Key drop rate configuration
export const dungeonKeyConfig = pgTable("dungeon_key_config", {
  id: varchar("id").primaryKey(),
  keyType: varchar("key_type").notNull(), // bronze/silver/gold/void
  monsterTierMin: integer("monster_tier_min").notNull(),
  monsterTierMax: integer("monster_tier_max").notNull(),
  dropChance: integer("drop_chance").notNull(), // out of 10000 for precision
  bossDropChance: integer("boss_drop_chance").notNull(),
  isActive: integer("is_active").notNull().default(1), // 0/1
}, (table) => [
  index("IDX_dungeon_key_config_type").on(table.keyType),
  index("IDX_dungeon_key_config_tier").on(table.monsterTierMin, table.monsterTierMax),
]);

export const insertDungeonKeyConfigSchema = createInsertSchema(dungeonKeyConfig);

export type DungeonKeyConfig = typeof dungeonKeyConfig.$inferSelect;
export type InsertDungeonKeyConfig = z.infer<typeof insertDungeonKeyConfigSchema>;

// Player key inventory
export const playerDungeonKeys = pgTable("player_dungeon_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  keyType: varchar("key_type").notNull(), // bronze/silver/gold/void
  quantity: integer("quantity").notNull().default(0),
}, (table) => [
  index("IDX_player_dungeon_keys_player").on(table.playerId),
  index("IDX_player_dungeon_keys_player_type").on(table.playerId, table.keyType),
]);

export const insertPlayerDungeonKeySchema = createInsertSchema(playerDungeonKeys).omit({
  id: true,
});

export type PlayerDungeonKey = typeof playerDungeonKeys.$inferSelect;
export type InsertPlayerDungeonKey = z.infer<typeof insertPlayerDungeonKeySchema>;

// Player dungeon progress
export const playerDungeonProgress = pgTable("player_dungeon_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  dungeonId: varchar("dungeon_id").notNull().references(() => dungeons.id, { onDelete: 'cascade' }),
  highestFloor: integer("highest_floor").notNull().default(0),
  currentCheckpoint: integer("current_checkpoint").notNull().default(0),
  totalClears: integer("total_clears").notNull().default(0),
  weeklyClears: integer("weekly_clears").notNull().default(0),
  lastRunAt: timestamp("last_run_at"),
}, (table) => [
  index("IDX_player_dungeon_progress_player").on(table.playerId),
  index("IDX_player_dungeon_progress_dungeon").on(table.dungeonId),
  index("IDX_player_dungeon_progress_player_dungeon").on(table.playerId, table.dungeonId),
]);

export const insertPlayerDungeonProgressSchema = createInsertSchema(playerDungeonProgress).omit({
  id: true,
});

export type PlayerDungeonProgress = typeof playerDungeonProgress.$inferSelect;
export type InsertPlayerDungeonProgress = z.infer<typeof insertPlayerDungeonProgressSchema>;

// Active and completed runs
export const dungeonRuns = pgTable("dungeon_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  dungeonId: varchar("dungeon_id").notNull().references(() => dungeons.id, { onDelete: 'cascade' }),
  currentFloor: integer("current_floor").notNull().default(1),
  floorsCleared: integer("floors_cleared").notNull().default(0),
  modifiersSelected: jsonb("modifiers_selected").notNull().default('[]'),
  lootEarned: jsonb("loot_earned").notNull().default('{}'),
  goldEarned: integer("gold_earned").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  inCombat: integer("in_combat").notNull().default(0),
  continueOffline: integer("continue_offline").notNull().default(0),
  dungeonCombatState: jsonb("dungeon_combat_state"),
  currentFloorInfo: jsonb("current_floor_info"),
  skipFloorsUsed: integer("skip_floors_used").notNull().default(0),
  skipFloorsMax: integer("skip_floors_max").notNull().default(3),
  status: varchar("status").notNull().default('active'),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
}, (table) => [
  index("IDX_dungeon_runs_player").on(table.playerId),
  index("IDX_dungeon_runs_dungeon").on(table.dungeonId),
  index("IDX_dungeon_runs_status").on(table.status),
  index("IDX_dungeon_runs_player_status").on(table.playerId, table.status),
]);

export const insertDungeonRunSchema = createInsertSchema(dungeonRuns).omit({
  id: true,
  startedAt: true,
  endedAt: true,
});

export type DungeonRun = typeof dungeonRuns.$inferSelect;
export type InsertDungeonRun = z.infer<typeof insertDungeonRunSchema>;

export interface DungeonCombatState {
  monsterId: string;
  monsterName: string;
  monsterLevel: number;
  monsterHp: number;
  monsterMaxHp: number;
  monsterAttack: number;
  monsterDefence: number;
  monsterAttackSpeed: number;
  monsterImage?: string;
  playerHp: number;
  playerMaxHp: number;
  isBossFloor: boolean;
  powerMultiplier?: number;
  combatStartedAt: number;
  lastTickAt: number;
}

// Weekly leaderboard
export const dungeonLeaderboard = pgTable("dungeon_leaderboard", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  dungeonId: varchar("dungeon_id").notNull().references(() => dungeons.id, { onDelete: 'cascade' }),
  weekStart: timestamp("week_start").notNull(),
  highestFloor: integer("highest_floor").notNull().default(0),
  totalFloorsCleared: integer("total_floors_cleared").notNull().default(0),
}, (table) => [
  index("IDX_dungeon_leaderboard_player").on(table.playerId),
  index("IDX_dungeon_leaderboard_dungeon").on(table.dungeonId),
  index("IDX_dungeon_leaderboard_player_dungeon_week").on(table.playerId, table.dungeonId, table.weekStart),
  index("idx_dungeon_leaderboard_rank").on(table.dungeonId, table.weekStart, desc(table.highestFloor)),
]);

export const insertDungeonLeaderboardSchema = createInsertSchema(dungeonLeaderboard).omit({
  id: true,
});

export type DungeonLeaderboard = typeof dungeonLeaderboard.$inferSelect;
export type InsertDungeonLeaderboard = z.infer<typeof insertDungeonLeaderboardSchema>;

// Active portal spawns
export const dungeonPortals = pgTable("dungeon_portals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  dungeonId: varchar("dungeon_id").notNull().references(() => dungeons.id, { onDelete: 'cascade' }),
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: integer("is_used").notNull().default(0), // 0/1
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_dungeon_portals_player").on(table.playerId),
  index("IDX_dungeon_portals_dungeon").on(table.dungeonId),
  index("IDX_dungeon_portals_expires").on(table.expiresAt),
]);

export const insertDungeonPortalSchema = createInsertSchema(dungeonPortals).omit({
  id: true,
  createdAt: true,
});

export type DungeonPortal = typeof dungeonPortals.$inferSelect;
export type InsertDungeonPortal = z.infer<typeof insertDungeonPortalSchema>;

// =============================================================================
// DUNGEON V2 SYSTEM
// =============================================================================

export type DungeonV2Mode = 'solo' | 'party';
export type DungeonSessionStatus = 'active' | 'voting' | 'completed' | 'failed' | 'extracted';
export type DungeonVoteChoice = 'continue' | 'exit';
export type DungeonCurseType = 'reduced_heal' | 'increased_durability_loss' | 'increased_enemy_damage' | 'increased_multiplier_gain';

export interface DungeonCurse {
  type: DungeonCurseType;
  stackCount: number;
  appliedAtFloor: number;
}

export interface BossTriggerRules {
  minCurseStack: number;
  minFloor: number;
  minChaosTriggers: number;
}

export interface DungeonV2ConfigSnapshot {
  requiredKeys: number;
  maxMembers: number;
  maxFloors: number;
  maxRunTimeMinutes: number;
  voteInterval: number;
  voteDuration: number;
  baseExtraction: number;
  penaltyCoef: number;
  minExtraction: number;
  maxExtraction: number;
  maxRisk: number;
  chaosThreshold: number;
  multiplierCap: number;
  curseCap: number;
  durabilityMultiplier: number;
  itemDestructionChance: number;
  threatDecay: number;
  bossTriggerRules: BossTriggerRules;
  maxLootPerSession: number;
}

export interface MemberStatsSnapshot {
  attackLevel: number;
  strengthLevel: number;
  defenceLevel: number;
  hitpointsLevel: number;
  maxHp: number;
  equipBonuses: Record<string, number>;
  weaponType: string | null;
  attackSpeed: number;
  dps: number;
  healEfficiency: number;
}

export const dungeonV2Config = pgTable("dungeon_v2_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dungeonId: varchar("dungeon_id").notNull().references(() => dungeons.id, { onDelete: 'cascade' }),
  mode: varchar("mode").notNull().default('solo'),
  requiredKeys: integer("required_keys").notNull().default(1),
  maxMembers: integer("max_members").notNull().default(5),
  maxFloors: integer("max_floors").notNull().default(100),
  maxRunTimeMinutes: integer("max_run_time_minutes").notNull().default(480),
  voteInterval: integer("vote_interval").notNull().default(5),
  voteDuration: integer("vote_duration").notNull().default(60),
  baseExtraction: integer("base_extraction").notNull().default(100),
  penaltyCoef: integer("penalty_coef").notNull().default(5),
  minExtraction: integer("min_extraction").notNull().default(20),
  maxExtraction: integer("max_extraction").notNull().default(100),
  maxRisk: integer("max_risk").notNull().default(20),
  chaosThreshold: integer("chaos_threshold").notNull().default(10),
  multiplierCap: integer("multiplier_cap").notNull().default(500),
  curseCap: integer("curse_cap").notNull().default(5),
  durabilityMultiplier: integer("durability_multiplier").notNull().default(100),
  itemDestructionChance: integer("item_destruction_chance").notNull().default(0),
  threatDecay: integer("threat_decay").notNull().default(10),
  bossTriggerRules: jsonb("boss_trigger_rules").notNull().default('{"minCurseStack":3,"minFloor":20,"minChaosTriggers":5}'),
  maxLootPerSession: integer("max_loot_per_session").notNull().default(500),
  isActive: integer("is_active").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_dungeon_v2_config_dungeon").on(table.dungeonId),
  index("IDX_dungeon_v2_config_mode").on(table.mode),
]);

export const insertDungeonV2ConfigSchema = createInsertSchema(dungeonV2Config).omit({
  id: true,
  updatedAt: true,
});

export type DungeonV2Config = typeof dungeonV2Config.$inferSelect;
export type InsertDungeonV2Config = z.infer<typeof insertDungeonV2ConfigSchema>;

export const dungeonSessions = pgTable("dungeon_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dungeonId: varchar("dungeon_id").notNull().references(() => dungeons.id, { onDelete: 'cascade' }),
  mode: varchar("mode").notNull(),
  status: varchar("status").notNull().default('active'),
  playerId: varchar("player_id").references(() => players.id, { onDelete: 'cascade' }),
  isOffline: integer("is_offline").notNull().default(0),
  offlineSeed: varchar("offline_seed"),
  offlineStartedAt: timestamp("offline_started_at"),
  partyId: varchar("party_id").references(() => parties.id, { onDelete: 'set null' }),
  guildId: varchar("guild_id").references(() => guilds.id, { onDelete: 'set null' }),
  currentFloor: integer("current_floor").notNull().default(1),
  floorsCleared: integer("floors_cleared").notNull().default(0),
  riskLevel: integer("risk_level").notNull().default(0),
  chaosMeter: integer("chaos_meter").notNull().default(0),
  chaosTriggerCount: integer("chaos_trigger_count").notNull().default(0),
  activeCurses: jsonb("active_curses").notNull().default('[]'),
  curseStack: integer("curse_stack").notNull().default(0),
  currentMultiplier: integer("current_multiplier").notNull().default(100),
  lootPool: jsonb("loot_pool").notNull().default('{}'),
  goldPool: integer("gold_pool").notNull().default(0),
  xpPool: integer("xp_pool").notNull().default(0),
  configSnapshot: jsonb("config_snapshot").notNull().default('{}'),
  hiddenBossSpawned: integer("hidden_boss_spawned").notNull().default(0),
  hiddenBossDefeated: integer("hidden_boss_defeated").notNull().default(0),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  lastFloorAt: timestamp("last_floor_at").defaultNow(),
  lastDbWriteFloor: integer("last_db_write_floor").notNull().default(0),
  sessionSeed: varchar("session_seed"),
  intermissionFloor: integer("intermission_floor").notNull().default(0),
}, (table) => [
  index("IDX_dungeon_sessions_dungeon").on(table.dungeonId),
  index("IDX_dungeon_sessions_player").on(table.playerId),
  index("IDX_dungeon_sessions_party").on(table.partyId),
  index("IDX_dungeon_sessions_guild").on(table.guildId),
  index("IDX_dungeon_sessions_status").on(table.status),
  index("IDX_dungeon_sessions_player_status").on(table.playerId, table.status),
]);

export const insertDungeonSessionSchema = createInsertSchema(dungeonSessions).omit({
  id: true,
  startedAt: true,
  lastFloorAt: true,
});

export type DungeonSession = typeof dungeonSessions.$inferSelect;
export type InsertDungeonSession = z.infer<typeof insertDungeonSessionSchema>;

export const dungeonMemberStates = pgTable("dungeon_member_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => dungeonSessions.id, { onDelete: 'cascade' }),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  isAlive: integer("is_alive").notNull().default(1),
  hasExited: integer("has_exited").notNull().default(0),
  exitedAtFloor: integer("exited_at_floor"),
  exitExtractionPercent: integer("exit_extraction_percent"),
  diedAtFloor: integer("died_at_floor"),
  statsSnapshot: jsonb("stats_snapshot").notNull().default('{}'),
  currentThreat: integer("current_threat").notNull().default(0),
  totalDamageDealt: integer("total_damage_dealt").notNull().default(0),
  totalHealingDone: integer("total_healing_done").notNull().default(0),
  personalLootEarned: jsonb("personal_loot_earned").notNull().default('{}'),
  personalGoldEarned: integer("personal_gold_earned").notNull().default(0),
  personalXpEarned: integer("personal_xp_earned").notNull().default(0),
  durabilityLost: integer("durability_lost").notNull().default(0),
  role: varchar("role").notNull().default('dps'),
  joinedAt: timestamp("joined_at").defaultNow(),
  currentHp: integer("current_hp").notNull().default(0),
  maxHp: integer("max_hp").notNull().default(0),
  isExtracted: integer("is_extracted").notNull().default(0),
  isDisconnected: integer("is_disconnected").notNull().default(0),
  disconnectedAt: timestamp("disconnected_at"),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  durabilitySnapshot: jsonb("durability_snapshot").notNull().default('{}'),
  buffsSnapshot: jsonb("buffs_snapshot").notNull().default('{}'),
}, (table) => [
  index("IDX_dungeon_member_states_session").on(table.sessionId),
  index("IDX_dungeon_member_states_player").on(table.playerId),
  index("IDX_dungeon_member_states_session_player").on(table.sessionId, table.playerId),
]);

export const insertDungeonMemberStateSchema = createInsertSchema(dungeonMemberStates).omit({
  id: true,
  joinedAt: true,
});

export type DungeonMemberState = typeof dungeonMemberStates.$inferSelect;
export type InsertDungeonMemberState = z.infer<typeof insertDungeonMemberStateSchema>;

export const dungeonVotes = pgTable("dungeon_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => dungeonSessions.id, { onDelete: 'cascade' }),
  floor: integer("floor").notNull(),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  vote: varchar("vote").notNull(),
  votedAt: timestamp("voted_at").defaultNow(),
}, (table) => [
  index("IDX_dungeon_votes_session").on(table.sessionId),
  index("IDX_dungeon_votes_session_floor").on(table.sessionId, table.floor),
  index("IDX_dungeon_votes_session_floor_player").on(table.sessionId, table.floor, table.playerId),
]);

export const insertDungeonVoteSchema = createInsertSchema(dungeonVotes).omit({
  id: true,
  votedAt: true,
});

export type DungeonVote = typeof dungeonVotes.$inferSelect;
export type InsertDungeonVote = z.infer<typeof insertDungeonVoteSchema>;

export const dungeonChatMessages = pgTable("dungeon_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => dungeonSessions.id, { onDelete: 'cascade' }),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  playerName: varchar("player_name").notNull(),
  content: text("content").notNull(),
  messageType: varchar("message_type").notNull().default('chat'),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_dungeon_chat_session").on(table.sessionId),
  index("IDX_dungeon_chat_created").on(table.createdAt),
]);

export const insertDungeonChatMessageSchema = createInsertSchema(dungeonChatMessages).omit({
  id: true,
  createdAt: true,
});

export type DungeonChatMessage = typeof dungeonChatMessages.$inferSelect;
export type InsertDungeonChatMessage = z.infer<typeof insertDungeonChatMessageSchema>;

export const dungeonSessionEvents = pgTable("dungeon_session_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => dungeonSessions.id, { onDelete: 'cascade' }),
  eventIndex: integer("event_index").notNull(),
  eventType: varchar("event_type").notNull(),
  payload: jsonb("payload").notNull().default('{}'),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_dungeon_session_events_session").on(table.sessionId),
  index("IDX_dungeon_session_events_session_index").on(table.sessionId, table.eventIndex),
]);

export const insertDungeonSessionEventSchema = createInsertSchema(dungeonSessionEvents).omit({
  id: true,
  createdAt: true,
});

export type DungeonSessionEvent = typeof dungeonSessionEvents.$inferSelect;
export type InsertDungeonSessionEvent = z.infer<typeof insertDungeonSessionEventSchema>;

export const dungeonHiddenBosses = pgTable("dungeon_hidden_bosses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dungeonId: varchar("dungeon_id").notNull().references(() => dungeons.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  hitpoints: integer("hitpoints").notNull().default(10000),
  attackLevel: integer("attack_level").notNull().default(100),
  strengthLevel: integer("strength_level").notNull().default(100),
  defenceLevel: integer("defence_level").notNull().default(100),
  attackSpeed: integer("attack_speed").notNull().default(3000),
  lootTable: jsonb("loot_table").notNull().default('[]'),
  guaranteedDrops: jsonb("guaranteed_drops").notNull().default('[]'),
  goldReward: integer("gold_reward").notNull().default(0),
  xpReward: integer("xp_reward").notNull().default(0),
  nameTranslations: jsonb("name_translations").notNull().default('{}'),
  icon: text("icon"),
  isActive: integer("is_active").notNull().default(1),
}, (table) => [
  index("IDX_dungeon_hidden_bosses_dungeon").on(table.dungeonId),
]);

export const insertDungeonHiddenBossSchema = createInsertSchema(dungeonHiddenBosses).omit({
  id: true,
});

export type DungeonHiddenBoss = typeof dungeonHiddenBosses.$inferSelect;
export type InsertDungeonHiddenBoss = z.infer<typeof insertDungeonHiddenBossSchema>;

// =============================================================================
// PARTY SYSTEM
// =============================================================================

// Party status and role types (canonical definition is PARTY_STATUSES below)
export type PartyRole = 'tank' | 'dps' | 'healer' | 'hybrid';
export type PartyType = 'social' | 'dungeon';
export type PartyInviteStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type LootDistributionType = 'equal' | 'need_greed' | 'master_loot';

// Party definitions
export const parties = pgTable("parties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leaderId: varchar("leader_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  name: text("name"),
  description: varchar("description", { length: 100 }), // Optional party description, max 100 chars
  status: varchar("status").notNull().default('forming'), // forming/ready/in_dungeon/disbanded
  partyType: varchar("party_type").notNull().default('social'), // social/dungeon
  maxSize: integer("max_size").notNull().default(5),
  isPublic: integer("is_public").notNull().default(0), // 0 = private, 1 = public
  regionId: varchar("region_id"), // Current region for party matching
  dungeonId: varchar("dungeon_id").references(() => dungeons.id, { onDelete: 'set null' }),
  dungeonRunId: varchar("dungeon_run_id").references(() => dungeonRuns.id, { onDelete: 'set null' }),
  partyVersion: integer("party_version").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_parties_leader").on(table.leaderId),
  index("IDX_parties_status").on(table.status),
  index("IDX_parties_dungeon").on(table.dungeonId),
  index("IDX_parties_public_region").on(table.isPublic, table.regionId),
]);

export const PARTY_STATUSES = ['forming', 'locked', 'in_dungeon', 'completed', 'disbanded'] as const;
export type PartyStatus = typeof PARTY_STATUSES[number];

export const insertPartySchema = createInsertSchema(parties).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  partyVersion: true,
});

export type Party = typeof parties.$inferSelect;
export type InsertParty = z.infer<typeof insertPartySchema>;

// Party membership
export const partyMembers = pgTable("party_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partyId: varchar("party_id").notNull().references(() => parties.id, { onDelete: 'cascade' }),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  role: varchar("role").notNull().default('dps'), // tank/dps/healer/hybrid
  position: integer("position").notNull().default(1), // 1-6 for grid position
  isReady: integer("is_ready").notNull().default(0), // 0/1
  // Combat sync fields for client-side party system
  currentRegion: varchar("current_region"),
  currentMonsterId: varchar("current_monster_id"),
  isInCombat: integer("is_in_combat").notNull().default(0),
  lastSyncAt: timestamp("last_sync_at"),
  // Skill synergy fields - current skill for party synergy bonuses
  currentSkill: varchar("current_skill"), // mining, woodcutting, fishing, etc.
  // Skill sharing fields - last used skill info for other party members to see
  lastSkillName: varchar("last_skill_name"),
  lastSkillDamage: integer("last_skill_damage"),
  lastSkillChance: integer("last_skill_chance"),  // Original skill chance as percentage (e.g., 25 for 25%)
  lastSkillTime: timestamp("last_skill_time"),
  // Offline kill tracking for loot sharing
  offlineKillCount: integer("offline_kill_count").notNull().default(0),
  offlineKillMonsterId: varchar("offline_kill_monster_id"),
  offlineKillRegion: varchar("offline_kill_region"),
  lastOfflineKillAt: timestamp("last_offline_kill_at"),
  // Weapon type cache for party buffs
  cachedWeaponType: varchar("cached_weapon_type"),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("IDX_party_members_party").on(table.partyId),
  index("IDX_party_members_player").on(table.playerId),
  index("IDX_party_members_party_player").on(table.partyId, table.playerId),
  uniqueIndex("UQ_party_members_party_player").on(table.partyId, table.playerId),
]);

export const insertPartyMemberSchema = createInsertSchema(partyMembers).omit({
  id: true,
  joinedAt: true,
});

export type PartyMember = typeof partyMembers.$inferSelect;
export type InsertPartyMember = z.infer<typeof insertPartyMemberSchema>;

// Party invitations
export const partyInvites = pgTable("party_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partyId: varchar("party_id").notNull().references(() => parties.id, { onDelete: 'cascade' }),
  inviterId: varchar("inviter_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  inviteeId: varchar("invitee_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  status: varchar("status").notNull().default('pending'), // pending/accepted/declined/expired
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_party_invites_party").on(table.partyId),
  index("IDX_party_invites_inviter").on(table.inviterId),
  index("IDX_party_invites_invitee").on(table.inviteeId),
  index("IDX_party_invites_status").on(table.status),
]);

export const insertPartyInviteSchema = createInsertSchema(partyInvites).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PartyInvite = typeof partyInvites.$inferSelect;
export type InsertPartyInvite = z.infer<typeof insertPartyInviteSchema>;

// Party finder listings
export const partyFinder = pgTable("party_finder", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partyId: varchar("party_id").notNull().references(() => parties.id, { onDelete: 'cascade' }),
  dungeonId: varchar("dungeon_id").notNull().references(() => dungeons.id, { onDelete: 'cascade' }),
  requiredRoles: jsonb("required_roles").notNull().default('[]'), // array: ['tank', 'healer']
  minLevel: integer("min_level").notNull().default(1),
  description: text("description"),
  isPublic: integer("is_public").notNull().default(1), // 0/1
  guildOnly: integer("guild_only").notNull().default(0), // 0/1
  guildId: varchar("guild_id").references(() => guilds.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => [
  index("IDX_party_finder_party").on(table.partyId),
  index("IDX_party_finder_dungeon").on(table.dungeonId),
  index("IDX_party_finder_public").on(table.isPublic),
  index("IDX_party_finder_guild").on(table.guildId),
  index("IDX_party_finder_expires").on(table.expiresAt),
]);

export const insertPartyFinderSchema = createInsertSchema(partyFinder).omit({
  id: true,
  createdAt: true,
});

export type PartyFinder = typeof partyFinder.$inferSelect;
export type InsertPartyFinder = z.infer<typeof insertPartyFinderSchema>;

// Synergy bonus configuration (DB-driven)
export const partySynergies = pgTable("party_synergies", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  requiredRoles: jsonb("required_roles").notNull().default('[]'), // array of roles
  requiredConditions: jsonb("required_conditions").notNull().default('{}'), // {sameGuild, minSize, maxSize}
  bonuses: jsonb("bonuses").notNull().default('{}'), // {lootBonus, xpBonus, damageBonus, defenceBonus}
  isActive: integer("is_active").notNull().default(1), // 0/1
  nameTranslations: jsonb("name_translations").notNull().default('{}'),
  descriptionTranslations: jsonb("description_translations").notNull().default('{}'),
}, (table) => [
  index("IDX_party_synergies_active").on(table.isActive),
]);

export const insertPartySynergySchema = createInsertSchema(partySynergies);

export type PartySynergy = typeof partySynergies.$inferSelect;
export type InsertPartySynergy = z.infer<typeof insertPartySynergySchema>;

// Party synergy interfaces
export interface PartySynergyConditions {
  sameGuild?: boolean;
  minSize?: number;
  maxSize?: number;
}

export interface PartySynergyBonuses {
  lootBonus?: number;
  xpBonus?: number;
  damageBonus?: number;
  defenceBonus?: number;
}

// Loot distribution configuration
export const partyLootConfig = pgTable("party_loot_config", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  distributionType: varchar("distribution_type").notNull(), // equal/need_greed/master_loot
  settings: jsonb("settings").notNull().default('{}'),
  isDefault: integer("is_default").notNull().default(0), // 0/1
}, (table) => [
  index("IDX_party_loot_config_type").on(table.distributionType),
  index("IDX_party_loot_config_default").on(table.isDefault),
]);

export const insertPartyLootConfigSchema = createInsertSchema(partyLootConfig);

export type PartyLootConfig = typeof partyLootConfig.$inferSelect;
export type InsertPartyLootConfig = z.infer<typeof insertPartyLootConfigSchema>;

// ==================== PARTY COMBAT STATE SYSTEM ====================

// Party Combat State Table (Central Source of Truth)
export const partyCombatState = pgTable("party_combat_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partyId: varchar("party_id").notNull().references(() => parties.id, { onDelete: 'cascade' }).unique(),
  regionId: varchar("region_id").notNull(),
  monsterId: varchar("monster_id").notNull(),
  monsterCurrentHp: integer("monster_current_hp").notNull(),
  monsterMaxHp: integer("monster_max_hp").notNull(),
  monsterLastAttackTime: timestamp("monster_last_attack_time").notNull(),
  monstersKilled: integer("monsters_killed").notNull().default(0),
  isActive: integer("is_active").notNull().default(1),
  startedAt: timestamp("started_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_party_combat_party").on(table.partyId),
  index("IDX_party_combat_active").on(table.isActive),
]);

export const insertPartyCombatStateSchema = createInsertSchema(partyCombatState).omit({
  id: true,
  startedAt: true,
  updatedAt: true,
});

export type PartyCombatState = typeof partyCombatState.$inferSelect;
export type InsertPartyCombatState = z.infer<typeof insertPartyCombatStateSchema>;

// Party Member Combat State Table
export const partyMemberCombatState = pgTable("party_member_combat_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partyCombatId: varchar("party_combat_id").notNull().references(() => partyCombatState.id, { onDelete: 'cascade' }),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  currentHp: integer("current_hp").notNull(),
  maxHp: integer("max_hp").notNull(),
  lastAttackTime: timestamp("last_attack_time").notNull(),
  lastHealTime: timestamp("last_heal_time"),
  totalDamageDealt: integer("total_damage_dealt").notNull().default(0),
  totalHealingDone: integer("total_healing_done").notNull().default(0),
  monstersKilledContribution: integer("monsters_killed_contribution").notNull().default(0),
  isAlive: integer("is_alive").notNull().default(1),
  isActive: integer("is_active").notNull().default(1),
  lastActiveTime: timestamp("last_active_time").notNull().defaultNow(),
  weaponSpeed: integer("weapon_speed").notNull().default(2400),
  role: varchar("role").notNull().default('dps'),
  aggro: integer("aggro").notNull().default(100),
}, (table) => [
  index("IDX_party_member_combat_party").on(table.partyCombatId),
  index("IDX_party_member_combat_player").on(table.playerId),
]);

export const insertPartyMemberCombatStateSchema = createInsertSchema(partyMemberCombatState).omit({
  id: true,
});

export type PartyMemberCombatState = typeof partyMemberCombatState.$inferSelect;
export type InsertPartyMemberCombatState = z.infer<typeof insertPartyMemberCombatStateSchema>;

// Party Combat Log Table (for syncing events)
export const partyCombatLog = pgTable("party_combat_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partyCombatId: varchar("party_combat_id").notNull().references(() => partyCombatState.id, { onDelete: 'cascade' }),
  eventType: varchar("event_type").notNull(),
  actorId: varchar("actor_id"),
  targetId: varchar("target_id"),
  value: integer("value"),
  isCritical: integer("is_critical").default(0),
  itemId: varchar("item_id"),
  quantity: integer("quantity"),
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => [
  index("IDX_party_combat_log_combat").on(table.partyCombatId),
  index("IDX_party_combat_log_timestamp").on(table.timestamp),
]);

export const insertPartyCombatLogSchema = createInsertSchema(partyCombatLog).omit({
  id: true,
  timestamp: true,
});

export type PartyCombatLog = typeof partyCombatLog.$inferSelect;
export type InsertPartyCombatLog = z.infer<typeof insertPartyCombatLogSchema>;

// Party Loot Queue Table
export const partyLootQueue = pgTable("party_loot_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partyCombatId: varchar("party_combat_id").notNull().references(() => partyCombatState.id, { onDelete: 'cascade' }),
  itemId: varchar("item_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  distributedTo: varchar("distributed_to"),
  droppedAt: timestamp("dropped_at").defaultNow(),
}, (table) => [
  index("IDX_party_loot_combat").on(table.partyCombatId),
  index("IDX_party_loot_distributed").on(table.distributedTo),
]);

export const insertPartyLootQueueSchema = createInsertSchema(partyLootQueue).omit({
  id: true,
  droppedAt: true,
});

export type PartyLootQueue = typeof partyLootQueue.$inferSelect;
export type InsertPartyLootQueue = z.infer<typeof insertPartyLootQueueSchema>;

// Private Messages Table
export const privateMessages = pgTable("private_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  receiverId: varchar("receiver_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  content: text("content").notNull(),
  isRead: integer("is_read").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_pm_sender").on(table.senderId),
  index("IDX_pm_receiver").on(table.receiverId),
  index("IDX_pm_created").on(table.createdAt),
]);

export const insertPrivateMessageSchema = createInsertSchema(privateMessages).omit({
  id: true,
  createdAt: true,
});

export type PrivateMessage = typeof privateMessages.$inferSelect;
export type InsertPrivateMessage = z.infer<typeof insertPrivateMessageSchema>;

// Global Chat Messages Table
export const globalChatMessages = pgTable("global_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_global_chat_player").on(table.playerId),
  index("IDX_global_chat_created").on(table.createdAt),
]);

export const insertGlobalChatMessageSchema = createInsertSchema(globalChatMessages).omit({
  id: true,
  createdAt: true,
});

export type GlobalChatMessage = typeof globalChatMessages.$inferSelect;
export type InsertGlobalChatMessage = z.infer<typeof insertGlobalChatMessageSchema>;

// =============================================================================
// NPC SHOP SYSTEM
// =============================================================================

// NPC Shop Configuration per region
export const npcShops = pgTable("npc_shops", {
  id: varchar("id").primaryKey(),
  regionId: text("region_id").notNull(),
  name: text("name").notNull(),
  nameTranslations: jsonb("name_translations").default('{}'),
  description: text("description"),
  descriptionTranslations: jsonb("description_translations").default('{}'),
  icon: text("icon"),
  baseStock: jsonb("base_stock").notNull().default('[]'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNpcShopSchema = createInsertSchema(npcShops).omit({
  createdAt: true,
});

export type NpcShop = typeof npcShops.$inferSelect;
export type InsertNpcShop = z.infer<typeof insertNpcShopSchema>;

// NPC Shop Daily Stock - resets at 00:00 UTC
export const npcShopStock = pgTable("npc_shop_stock", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopId: varchar("shop_id").notNull().references(() => npcShops.id, { onDelete: 'cascade' }),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull(),
  pricePerItem: integer("price_per_item").notNull(),
  resetDate: timestamp("reset_date").notNull(),
}, (table) => [
  index("IDX_npc_stock_shop").on(table.shopId),
  index("IDX_npc_stock_reset").on(table.resetDate),
]);

export const insertNpcShopStockSchema = createInsertSchema(npcShopStock).omit({
  id: true,
});

export type NpcShopStock = typeof npcShopStock.$inferSelect;
export type InsertNpcShopStock = z.infer<typeof insertNpcShopStockSchema>;

// Player NPC Shop Purchases - tracks what players bought today
export const npcShopPurchases = pgTable("npc_shop_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  stockId: varchar("stock_id").notNull().references(() => npcShopStock.id, { onDelete: 'cascade' }),
  quantityPurchased: integer("quantity_purchased").notNull(),
  purchasedAt: timestamp("purchased_at").defaultNow(),
}, (table) => [
  index("IDX_npc_purchases_player").on(table.playerId),
  index("IDX_npc_purchases_stock").on(table.stockId),
]);

export const insertNpcShopPurchaseSchema = createInsertSchema(npcShopPurchases).omit({
  id: true,
  purchasedAt: true,
});

export type NpcShopPurchase = typeof npcShopPurchases.$inferSelect;
export type InsertNpcShopPurchase = z.infer<typeof insertNpcShopPurchaseSchema>;

// =============================================================================
// WEAPON ENHANCEMENT SYSTEM
// =============================================================================

export const weaponEnhancements = pgTable("weapon_enhancements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  itemId: text("item_id").notNull(),
  enhancementLevel: integer("enhancement_level").notNull().default(0),
  addedStats: jsonb("added_stats").default({}),
  addedSkills: jsonb("added_skills").default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_weapon_enhancement_player").on(table.playerId),
  index("IDX_weapon_enhancement_item").on(table.itemId),
]);

export const insertWeaponEnhancementSchema = createInsertSchema(weaponEnhancements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type WeaponEnhancement = typeof weaponEnhancements.$inferSelect;
export type InsertWeaponEnhancement = z.infer<typeof insertWeaponEnhancementSchema>;

// Enhancement system constants
export const ENHANCEMENT_CONFIG = {
  MAX_LEVEL: 10,
  SUCCESS_RATES: [100, 90, 80, 70, 60, 50, 40, 30, 20, 15], // % chance per level 0-9
  BURN_RATES: [0, 0, 0, 5, 10, 15, 25, 35, 45, 55], // % chance of destruction on fail per level
  STAT_BONUS_PER_LEVEL: 0.05, // 5% per enhancement level
  MATERIALS: {
    chaos_stone: { successBonus: 0, burnProtection: false, price: 1000000 },
    jurax_gem: { successBonus: 15, burnProtection: false, price: 1500000 },
    death_liquid: { successBonus: 0, burnProtection: true, price: 750000 },
  },
} as const;

// =============================================================================
// DAILY LOGIN REWARDS SYSTEM (15-day cycle)
// =============================================================================

export const dailyLoginRewards = pgTable("daily_login_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  day: integer("day").notNull().unique(), // 1-15
  rewards: jsonb("rewards").notNull(), // Array of { itemId: string, quantity: number }
  isBonus: integer("is_bonus").notNull().default(0), // 0/1 - special milestone days (5, 10, 15)
});

export const insertDailyLoginRewardSchema = createInsertSchema(dailyLoginRewards).omit({
  id: true,
});

export type DailyLoginReward = typeof dailyLoginRewards.$inferSelect;
export type InsertDailyLoginReward = z.infer<typeof insertDailyLoginRewardSchema>;

// Player login tracking
export const playerDailyLogin = pgTable("player_daily_login", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  currentDay: integer("current_day").notNull().default(1), // 1-15 cycle
  lastClaimDate: varchar("last_claim_date"), // YYYY-MM-DD format
  totalDaysClaimed: integer("total_days_claimed").notNull().default(0),
  streakCount: integer("streak_count").notNull().default(0),
  cycleStartDate: varchar("cycle_start_date"), // When 15-day cycle started
}, (table) => [
  index("IDX_player_daily_login_player").on(table.playerId),
]);

export const insertPlayerDailyLoginSchema = createInsertSchema(playerDailyLogin).omit({
  id: true,
});

export type PlayerDailyLogin = typeof playerDailyLogin.$inferSelect;
export type InsertPlayerDailyLogin = z.infer<typeof insertPlayerDailyLoginSchema>;

// =============================================================================
// DAILY QUESTS SYSTEM
// =============================================================================

export const dailyQuestTemplates = pgTable("daily_quest_templates", {
  id: varchar("id").primaryKey(),
  questType: varchar("quest_type").notNull(), // kill_monsters, gather_resources, craft_items, complete_dungeon
  targetType: varchar("target_type"), // monster_id, item_id, skill_id, dungeon_id (optional)
  targetQuantity: integer("target_quantity").notNull(),
  rewardItems: jsonb("reward_items").notNull(), // Array of { itemId: string, quantity: number }
  rewardGold: integer("reward_gold").notNull().default(0),
  rewardXp: jsonb("reward_xp"), // { skill: amount } for skill XP
  difficulty: varchar("difficulty").notNull().default('normal'), // easy, normal, hard
  weight: integer("weight").notNull().default(100), // Selection weight for random quest
  minPlayerLevel: integer("min_player_level").notNull().default(1),
  nameTranslations: jsonb("name_translations"), // { en, tr, zh, ... }
  descriptionTranslations: jsonb("description_translations"),
});

export const insertDailyQuestTemplateSchema = createInsertSchema(dailyQuestTemplates);

export type DailyQuestTemplate = typeof dailyQuestTemplates.$inferSelect;
export type InsertDailyQuestTemplate = z.infer<typeof insertDailyQuestTemplateSchema>;

// Player active daily quests
export const playerDailyQuests = pgTable("player_daily_quests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  templateId: varchar("template_id").notNull().references(() => dailyQuestTemplates.id),
  currentProgress: integer("current_progress").notNull().default(0),
  targetQuantity: integer("target_quantity").notNull(),
  isAccepted: integer("is_accepted").notNull().default(0), // 0/1
  isCompleted: integer("is_completed").notNull().default(0), // 0/1
  isClaimed: integer("is_claimed").notNull().default(0), // 0/1
  assignedDate: varchar("assigned_date").notNull(), // YYYY-MM-DD
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("IDX_player_daily_quests_player").on(table.playerId),
  index("IDX_player_daily_quests_date").on(table.assignedDate),
]);

export const insertPlayerDailyQuestSchema = createInsertSchema(playerDailyQuests).omit({
  id: true,
  completedAt: true,
});

export type PlayerDailyQuest = typeof playerDailyQuests.$inferSelect;
export type InsertPlayerDailyQuest = z.infer<typeof insertPlayerDailyQuestSchema>;

// =============================================================================
// ACHIEVEMENTS SYSTEM
// =============================================================================

export const ACHIEVEMENT_CATEGORIES = [
  'combat', 'skills', 'crafting', 'gathering', 'cooking', 'alchemy',
  'firemaking', 'economy', 'social', 'exploration', 'equipment', 'dungeons', 'general'
] as const;

export type AchievementCategory = typeof ACHIEVEMENT_CATEGORIES[number];

export type AchievementTier = {
  tier: number;
  threshold: number;
  rewardGold?: number;
  rewardXp?: Record<string, number>;
  rewardItems?: { itemId: string; quantity: number }[];
  badgeId?: string;
};

export const achievements = pgTable("achievements", {
  id: varchar("id").primaryKey(),
  category: varchar("category").notNull().default('general'),
  trackingKey: varchar("tracking_key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: varchar("icon").default('trophy'),
  tiers: jsonb("tiers").notNull().default('[]'),
  nameTranslations: jsonb("name_translations").default('{}'),
  descriptionTranslations: jsonb("description_translations").default('{}'),
  sortOrder: integer("sort_order").notNull().default(0),
  isHidden: integer("is_hidden").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAchievementSchema = createInsertSchema(achievements).omit({
  createdAt: true,
});

export type Achievement = typeof achievements.$inferSelect;
export type InsertAchievement = z.infer<typeof insertAchievementSchema>;

export const playerAchievements = pgTable("player_achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  achievementId: varchar("achievement_id").notNull().references(() => achievements.id, { onDelete: 'cascade' }),
  progress: integer("progress").notNull().default(0),
  completedTiers: jsonb("completed_tiers").notNull().default('[]'),
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => [
  index("IDX_player_achievements_player").on(table.playerId),
  index("IDX_player_achievements_achievement").on(table.achievementId),
]);

export const insertPlayerAchievementSchema = createInsertSchema(playerAchievements).omit({
  id: true,
  lastUpdated: true,
});

export type PlayerAchievement = typeof playerAchievements.$inferSelect;
export type InsertPlayerAchievement = z.infer<typeof insertPlayerAchievementSchema>;

// =============================================================================
// DUNGEON-SCOPED PARTY SYSTEM
// =============================================================================

export const DUNGEON_PARTY_STATUSES = ['recruiting', 'ready', 'locked', 'in_dungeon', 'completed', 'disbanded'] as const;
export type DungeonPartyStatus = typeof DUNGEON_PARTY_STATUSES[number];

export const dungeonParties = pgTable("dungeon_parties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dungeonId: varchar("dungeon_id").notNull().references(() => dungeons.id),
  leaderId: varchar("leader_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  status: varchar("status").notNull().default('recruiting'),
  maxSize: integer("max_size").notNull().default(5),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_dungeon_parties_leader").on(table.leaderId),
  index("IDX_dungeon_parties_status").on(table.status),
  index("IDX_dungeon_parties_dungeon").on(table.dungeonId),
]);

export const insertDungeonPartySchema = createInsertSchema(dungeonParties).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DungeonParty = typeof dungeonParties.$inferSelect;
export type InsertDungeonParty = z.infer<typeof insertDungeonPartySchema>;

export const dungeonPartyMembers = pgTable("dungeon_party_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dungeonPartyId: varchar("dungeon_party_id").notNull().references(() => dungeonParties.id, { onDelete: 'cascade' }),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  role: varchar("role").notNull().default('dps'),
  isReady: integer("is_ready").notNull().default(0),
  decision: varchar("decision"),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  unique().on(table.dungeonPartyId, table.playerId),
  index("IDX_dungeon_party_members_party").on(table.dungeonPartyId),
  index("IDX_dungeon_party_members_player").on(table.playerId),
]);

export const insertDungeonPartyMemberSchema = createInsertSchema(dungeonPartyMembers).omit({
  id: true,
  joinedAt: true,
});

export type DungeonPartyMember = typeof dungeonPartyMembers.$inferSelect;
export type InsertDungeonPartyMember = z.infer<typeof insertDungeonPartyMemberSchema>;

export const dungeonPartyChat = pgTable("dungeon_party_chat", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dungeonPartyId: varchar("dungeon_party_id").notNull().references(() => dungeonParties.id, { onDelete: 'cascade' }),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: 'cascade' }),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_dungeon_party_chat_party").on(table.dungeonPartyId),
  index("IDX_dungeon_party_chat_created").on(table.createdAt),
]);

export const insertDungeonPartyChatSchema = createInsertSchema(dungeonPartyChat).omit({
  id: true,
  createdAt: true,
});

export type DungeonPartyChatMessage = typeof dungeonPartyChat.$inferSelect;
export type InsertDungeonPartyChatMessage = z.infer<typeof insertDungeonPartyChatSchema>;

// Raid Forge Recipes — craftable raid set pieces using boss essences
export const raidForgeRecipes = pgTable("raid_forge_recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  
  // What this recipe produces
  resultItemId: text("result_item_id").notNull(),
  resultArmorType: varchar("result_armor_type").notNull(), // 'plate', 'leather', 'cloth', 'material'
  resultSlot: varchar("result_slot").notNull(), // 'helmet', 'body', 'legs', 'boots', 'material'
  
  // Boss this recipe is associated with (for display grouping)
  bossId: text("boss_id").notNull(),
  
  // Essence requirement
  requiredEssenceType: text("required_essence_type").notNull(), // 'infernal_essence', 'frost_essence', etc.
  requiredEssenceAmount: integer("required_essence_amount").notNull().default(30),
  
  // Display
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active").notNull().default(1),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRaidForgeRecipeSchema = createInsertSchema(raidForgeRecipes).omit({
  createdAt: true,
});
export type InsertRaidForgeRecipe = z.infer<typeof insertRaidForgeRecipeSchema>;
export type RaidForgeRecipe = typeof raidForgeRecipes.$inferSelect;

export const dungeonLeaveVotes = pgTable("dungeon_leave_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dungeonSessionId: varchar("dungeon_session_id").notNull().references(() => dungeonSessions.id, { onDelete: 'cascade' }),
  dungeonPartyId: varchar("dungeon_party_id").notNull().references(() => dungeonParties.id, { onDelete: 'cascade' }),
  floorNumber: integer("floor_number").notNull(),
  initiatedBy: varchar("initiated_by").notNull().references(() => players.id),
  expiresAt: timestamp("expires_at").notNull(),
  status: varchar("status").notNull().default('active'),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_dungeon_leave_votes_session").on(table.dungeonSessionId),
  index("IDX_dungeon_leave_votes_party").on(table.dungeonPartyId),
  index("IDX_dungeon_leave_votes_status").on(table.status),
]);

export const insertDungeonLeaveVoteSchema = createInsertSchema(dungeonLeaveVotes).omit({
  id: true,
  createdAt: true,
});

export type DungeonLeaveVote = typeof dungeonLeaveVotes.$inferSelect;
export type InsertDungeonLeaveVote = z.infer<typeof insertDungeonLeaveVoteSchema>;
