import { storage } from "./storage";
import { dungeonService } from "./services/dungeonService";
import { getEquipmentBonuses, isFood, getFoodHealAmount, getBestFood, getEquipmentDropChance, isPotion, getPotionData, PotionEffectType, rollRarityForDrop, rollRarity, getWeaponAttackSpeed, getWeaponLifesteal, WeaponSkill, WEAPON_SKILLS } from "./combatUtils";
import { isEquipmentItem, EQUIPMENT_BASE_IDS, canonicalizeItemId } from "@shared/itemData";
import { calculateSkillSynergyBonus, type PartyMemberSkillStatus } from "@shared/partySynergyBonus";
import { calculateXpScaling, applyMasteryXpScaling, estimateContentLevel, calculateMonsterCombatLevel, calculateCombatLevel } from "@shared/xpScaling";
import { getLevelFromXp } from "@shared/gameMath";
import { type GuildBonuses, partyMembers, partyInvites, parties, players, ENHANCEMENT_CONFIG } from "@shared/schema";
import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { botService } from "./services/botService";
import { 
  notifyCombatDeath, 
  notifyIdleTimerExpired, 
  notifyMaterialsDepleted, 
  notifySpecialLoot, 
  notifyItemBreak, 
  notifyDurabilityWarning,
  notifyFoodDepleted,
  notifyPotionDepleted,
  notifyMythicDrop,
  notifyMythicCraft
} from "./utils/push";
// Note: We don't use isPlayerOnline here because players stay "online" via WebSocket
// even when on different pages. We rely on lastClientTick to detect if combat page is active.
import { 
  calculateMaxHit, 
  calculateMinHit, 
  calculateFinalMaxHit, 
  calculateFinalMinHit, 
  calculateDamageReduction, 
  calculateAccuracyRating, 
  calculateEvasionRating, 
  calculateHitChance, 
  COMBAT_HP_SCALE, 
  COMBAT_STYLE_MODIFIERS, 
  RESPAWN_DELAY,
  ActiveCombat,
  CombatDebuff,
  GUILD_BANK_CONTRIBUTION,
  getItemResourceCategory,
  DEATH_DURABILITY_LOSS_MIN,
  DEATH_DURABILITY_LOSS_MAX,
  calculateGuildContribution,
  MAX_INVENTORY_SLOTS
} from "@shared/schema";
import { rollDungeonKeyDrop } from "@shared/dungeonKeyDrops";
import { 
  shouldSkillTrigger, 
  executeMonsterSkill, 
  processDebuffTick, 
  addOrStackDebuff,
  getStunCyclesRemaining,
  decrementStunCycle,
  getHealingReduction,
  getArmorBreakPercent,
  filterExpiredDebuffs
} from "@shared/combatSkills";
import { combatStates, clearCombatState, type PlayerCombatState } from "./schedulerState";
import { calculatePartyPassiveBuffs, getWeaponRole } from "@shared/partyBuffs";
import { mapWeaponCategoryToMasteryType, calculateMasteryXpGain, getWeaponTierFromLevel, getMasteryFieldName, WeaponMasteryType } from '../shared/masterySystem';

const MIN_DURABILITY = 10;
const MAX_DURABILITY = 100;
const DURABILITY_WARNING_THRESHOLD = 20;
const COMBAT_WEAR_RATE = 0.0025;
const IDLE_LIMIT_MS = 6 * 60 * 60 * 1000;
const CLIENT_STALE_THRESHOLD = 2000; // Consider client stale if no update in 2 seconds (faster offline takeover)

// Guest cleanup settings - run daily, clean guests inactive for 7 days
const GUEST_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const GUEST_MAX_INACTIVE_DAYS = 7;

// Stale party cleanup - run every 6 hours, clean parties inactive for 24 hours
const STALE_PARTY_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Bot activity settings
const BOT_ACTIVITY_INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes

// Auto-sell market listings settings
const AUTO_SELL_INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes

// Debug logging - disable in production for performance
const DEBUG_SCHEDULER = process.env.DEBUG_SCHEDULER === 'true' || process.env.NODE_ENV === 'development';
function debugLog(...args: any[]) {
  if (DEBUG_SCHEDULER) {
    console.log(...args);
  }
}

// Convert monster ID (e.g. "goblin_raider") to readable name (e.g. "Goblin Raider")
function getReadableMonsterName(monsterId: string): string {
  if (!monsterId) return "Savaş";
  return monsterId.split('_').map(w => 
    w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');
}

// Cache for item names (id -> name) for push notifications
// Also used as the full set of known canonical item IDs across all item types
export let cachedItemNames = new Map<string, string>();

// Get readable item name from cache, or format from ID as fallback
function getReadableItemName(itemId: string): string {
  if (!itemId) return "Item";
  // Check cache first
  const cachedName = cachedItemNames.get(itemId);
  if (cachedName) return cachedName;
  // Fallback: format from ID (e.g. "cooked_fish" -> "Cooked Fish")
  return itemId.split('_').map(w => 
    w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');
}

let isRunning = false;
let lastGuestCleanup = 0;
let lastStalePartyCleanup = 0;
let lastBotActivity = 0;
let lastAutoSell = 0;
let lastBotCreation = 0;
let botSkillFixDone = false;
let botMigrationDone = false;

// Item cache for database-backed weapon stats AND equipment bonuses (parity with online combat)
export interface CachedItemData {
  attackSpeedMs?: number | null;
  lifestealPercent?: number | null;
  weaponCategory?: string | null;
  stats?: {
    attackBonus?: number;
    strengthBonus?: number;
    defenceBonus?: number;
    accuracyBonus?: number;
    hitpointsBonus?: number;
    // Role stats for party combat
    critChance?: number;
    critDamage?: number;
    healPower?: number;
    buffPower?: number;
    // Armor-type specific bonuses
    skillDamageBonus?: number;
    attackSpeedBonus?: number;
    healingReceivedBonus?: number;
    // Staff-specific bonuses
    onHitHealingPercent?: number;
    buffDurationBonus?: number;
    partyDpsBuff?: number;
    partyDefenceBuff?: number;
    partyAttackSpeedBuff?: number;
  } | null;
}
export let cachedGameItems: Map<string, CachedItemData> = new Map();
let lastItemCacheRefresh = 0;
const ITEM_CACHE_TTL = 60000; // Refresh cache every 60 seconds

// Cleanup inactive guest accounts (7+ days without activity)
async function cleanupInactiveGuests(): Promise<void> {
  try {
    const cutoffDate = new Date(Date.now() - GUEST_MAX_INACTIVE_DAYS * 24 * 60 * 60 * 1000);
    
    // Find inactive guest players
    const inactiveGuests = await db.query.players.findMany({
      where: (players, { and, eq, lt, isNull, or }) => and(
        eq(players.isGuest, 1),
        or(
          lt(players.lastSeen, cutoffDate),
          isNull(players.lastSeen)
        )
      ),
      columns: { id: true, username: true, lastSeen: true }
    });
    
    if (inactiveGuests.length === 0) {
      console.log("[Scheduler] Guest cleanup: No inactive guests found");
      return;
    }
    
    console.log(`[Scheduler] Guest cleanup: Found ${inactiveGuests.length} inactive guest accounts to remove`);
    
    for (const guest of inactiveGuests) {
      try {
        // Remove from party if member
        await db.delete(partyMembers).where(eq(partyMembers.playerId, guest.id));
        
        // Delete player completely (handles all related data)
        await storage.deletePlayerCompletely(guest.id);
        
        console.log(`[Scheduler] Guest cleanup: Removed ${guest.username} (last seen: ${guest.lastSeen || 'never'})`);
      } catch (error) {
        console.error(`[Scheduler] Guest cleanup error for ${guest.id}:`, error);
      }
    }
    
    console.log(`[Scheduler] Guest cleanup complete: Removed ${inactiveGuests.length} inactive guests`);
  } catch (error) {
    console.error("[Scheduler] Guest cleanup failed:", error);
  }
}

async function cleanupStaleParties(): Promise<void> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const staleParties = await db.select({ id: parties.id })
      .from(parties)
      .where(and(
        sql`${parties.status} IN ('forming', 'locked')`,
        sql`${parties.updatedAt} < ${oneHourAgo}`,
        sql`NOT EXISTS (
          SELECT 1 FROM party_members pm 
          WHERE pm.party_id = ${parties.id} 
          AND pm.last_sync_at > ${oneHourAgo}
        )`,
      ));

    if (staleParties.length > 0) {
      for (const party of staleParties) {
        await db.delete(partyMembers).where(eq(partyMembers.partyId, party.id)).catch(() => {});
        await db.update(parties)
          .set({ status: 'disbanded', updatedAt: new Date() })
          .where(eq(parties.id, party.id));
      }
      console.log(`[Scheduler] Stale party cleanup: Disbanded ${staleParties.length} inactive parties`);
    }

    await db.execute(sql`
      UPDATE parties SET status = 'disbanded', updated_at = NOW()
      WHERE status != 'disbanded'
      AND NOT EXISTS (SELECT 1 FROM party_members pm WHERE pm.party_id = parties.id)
    `);

    await db.execute(sql`
      DELETE FROM party_members pm
      WHERE EXISTS (SELECT 1 FROM parties p WHERE p.id = pm.party_id AND p.status = 'disbanded')
    `);
  } catch (error) {
    console.error("[Scheduler] Stale party cleanup failed:", error);
  }
}

async function cleanupExpiredInvites(): Promise<void> {
  try {
    const result = await db.update(partyInvites)
      .set({ status: 'expired' })
      .where(and(
        eq(partyInvites.status, 'pending'),
        sql`${partyInvites.expiresAt} < NOW()`
      ))
      .returning({ id: partyInvites.id });

    if (result.length > 0) {
      console.log(`[Scheduler] Invite cleanup: Expired ${result.length} pending invites`);
    }
  } catch (error) {
    console.error("[Scheduler] Invite cleanup failed:", error);
  }
}

export async function refreshItemCache(): Promise<void> {
  try {
    const items = await storage.getAllGameItems();
    const newCache = new Map<string, CachedItemData>();
    const newNameCache = new Map<string, string>();
    let weaponCount = 0;
    let equipmentCount = 0;
    
    for (const item of items) {
      // Cache item name for push notifications (all items)
      if (item.name) {
        newNameCache.set(item.id, item.name);
      }
      
      // Cache items that have stats, attackSpeedMs, or lifestealPercent
      const hasStats = item.stats && typeof item.stats === 'object';
      const hasWeaponData = item.attackSpeedMs || item.lifestealPercent;
      
      if (hasStats || hasWeaponData) {
        newCache.set(item.id, { 
          attackSpeedMs: item.attackSpeedMs, 
          lifestealPercent: item.lifestealPercent,
          weaponCategory: item.weaponCategory,
          stats: item.stats as CachedItemData['stats']
        });
        
        if (hasWeaponData) weaponCount++;
        if (hasStats) equipmentCount++;
      }
    }
    cachedGameItems = newCache;
    cachedItemNames = newNameCache;
    lastItemCacheRefresh = Date.now();
    console.log(`[Scheduler] Item cache refreshed: ${weaponCount} weapons, ${equipmentCount} equipment with stats, ${newNameCache.size} item names loaded`);
  } catch (error) {
    console.error("[Scheduler] Failed to refresh item cache:", error);
  }
}

// RARITY_MULTIPLIERS for equipment stat scaling (same as combatUtils)
const SCHEDULER_RARITY_MULTIPLIERS: Record<string, number> = {
  "Common": 1.0,
  "Uncommon": 1.15,
  "Rare": 1.3,
  "Epic": 1.5,
  "Legendary": 1.75,
  "Mythic": 2.0,
};

// Parse item ID to get base name and rarity (matches client logic)
function parseItemWithRarityForCache(itemId: string): { baseItem: string; rarity: string } {
  // Check for parenthetical rarity format: "Bronze Sword (Rare)" or "Bronze Sword (Rare)#uniqueId"
  const parenMatch = itemId.match(/^(.+?)\s*\((\w+)\)(#[\w]+)?$/);
  if (parenMatch) {
    return { baseItem: parenMatch[1].trim(), rarity: parenMatch[2] };
  }
  
  // Check for underscore format: "Bronze Sword_rare"
  const underscoreRarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  for (const rarity of underscoreRarities) {
    if (itemId.toLowerCase().endsWith(`_${rarity}`)) {
      const baseItem = itemId.substring(0, itemId.lastIndexOf('_'));
      return { baseItem, rarity: rarity.charAt(0).toUpperCase() + rarity.slice(1) };
    }
  }
  
  return { baseItem: itemId, rarity: "Common" };
}

// Get equipment bonuses from database cache (replaces static EQUIPMENT_STATS lookup)
export function getEquipmentBonusesFromCache(
  equipment: Record<string, string | null>,
  enhancementLevels: Map<string, number> = new Map(),
  itemModifications: Record<string, any> = {}
): {
  attackBonus: number;
  strengthBonus: number;
  defenceBonus: number;
  accuracyBonus: number;
  hitpointsBonus: number;
  critChance: number;
  critDamage: number;
  healPower: number;
  buffPower: number;
  skillDamageBonus: number;
  attackSpeedBonus: number;
  healingReceivedBonus: number;
  onHitHealingPercent: number;
  buffDurationBonus: number;
  partyDpsBuff: number;
  partyDefenceBuff: number;
  partyAttackSpeedBuff: number;
  [key: string]: number; // Allow dynamic stats
} {
  const total: Record<string, number> = {};

  // Check if main hand is a dagger for dual wield off-hand reduction
  const mainWeaponId = equipment.weapon;
  let isDualWieldDagger = false;
  if (mainWeaponId) {
    const { baseItem: mainBaseItem } = parseItemWithRarityForCache(mainWeaponId);
    const mainCachedItem = cachedGameItems.get(mainBaseItem);
    isDualWieldDagger = mainCachedItem?.weaponCategory === "dagger";
  }

  const slots = ["weapon", "shield", "helmet", "body", "legs", "gloves", "boots", "amulet", "ring"];
  let debugMissingItems: string[] = [];
  
  for (const slot of slots) {
    const itemId = equipment[slot];
    if (!itemId) continue;
    
    const { baseItem, rarity: parsedRarity } = parseItemWithRarityForCache(itemId);
    const cachedItem = cachedGameItems.get(baseItem);
    
    // Use craftedRarity from itemModifications if available (raid gear with rarity stored separately)
    // Normalize to Title Case since DB may store lowercase (uncommon → Uncommon)
    const rawCraftedRarity = itemModifications[baseItem]?.craftedRarity || itemModifications[itemId]?.craftedRarity;
    const normalizedCraftedRarity = rawCraftedRarity ? rawCraftedRarity.charAt(0).toUpperCase() + rawCraftedRarity.slice(1).toLowerCase() : null;
    const rarity = normalizedCraftedRarity && normalizedCraftedRarity !== 'Common' ? normalizedCraftedRarity : parsedRarity;
    
    if (cachedItem?.stats) {
      const rarityMultiplier = SCHEDULER_RARITY_MULTIPLIERS[rarity] || 1.0;
      
      const isOffhandDagger = slot === "shield" && cachedItem.weaponCategory === "dagger";
      if (isOffhandDagger && !isDualWieldDagger) continue;
      const dualWieldMultiplier = (isOffhandDagger && isDualWieldDagger) ? 0.5 : 1.0;
      
      // Get enhancement level for this item (5% bonus per level)
      // Check both full itemId and baseItem for enhancement lookup
      const enhancementLevel = enhancementLevels.get(itemId) || enhancementLevels.get(baseItem) || 0;
      const enhancementMultiplier = 1 + (enhancementLevel * ENHANCEMENT_CONFIG.STAT_BONUS_PER_LEVEL);
      
      // Combined multiplier: rarity * dual wield * enhancement
      const combinedMultiplier = rarityMultiplier * dualWieldMultiplier * enhancementMultiplier;
      
      // Dynamically apply ALL stats from the cached item
      // This ensures new stats are automatically included without code changes
      const stats = cachedItem.stats as Record<string, number>;
      for (const statKey of Object.keys(stats)) {
        if (typeof stats[statKey] === 'number') {
          total[statKey] = (total[statKey] || 0) + Math.floor(stats[statKey] * combinedMultiplier);
        }
      }
    } else if (itemId) {
      debugMissingItems.push(`${slot}:${baseItem}`);
    }
  }
  
  if (DEBUG_SCHEDULER && debugMissingItems.length > 0) {
    console.log(`[Scheduler] WARNING: Missing items in cache: ${debugMissingItems.join(', ')}, cacheSize=${cachedGameItems.size}`);
  }

  // Apply addedStats from Chaos Stone enhancements (itemModifications)
  for (const slot of slots) {
    const itemId = equipment[slot];
    if (!itemId) continue;
    const mods = itemModifications[itemId];
    if (mods?.addedStats) {
      const ADDED_STAT_MAP: Record<string, string> = {
        bonusAttack: 'attackBonus',
        bonusDefence: 'defenceBonus',
        bonusStrength: 'strengthBonus',
        bonusHitpoints: 'hitpointsBonus',
        accuracy: 'accuracyBonus',
        critChance: 'critChance',
        critDamage: 'critDamage',
        attackSpeed: 'attackSpeedBonus',
      };
      for (const [addedKey, addedValue] of Object.entries(mods.addedStats)) {
        const statKey = ADDED_STAT_MAP[addedKey] || addedKey;
        if (typeof addedValue === 'number') {
          total[statKey] = (total[statKey] || 0) + addedValue;
        }
      }
    }
  }

  // Return with default values for expected stats (backwards compatibility)
  return {
    attackBonus: total.attackBonus || 0,
    strengthBonus: total.strengthBonus || 0,
    defenceBonus: total.defenceBonus || 0,
    accuracyBonus: total.accuracyBonus || 0,
    hitpointsBonus: total.hitpointsBonus || 0,
    critChance: total.critChance || 0,
    critDamage: total.critDamage || 0,
    healPower: total.healPower || 0,
    buffPower: total.buffPower || 0,
    skillDamageBonus: total.skillDamageBonus || 0,
    attackSpeedBonus: total.attackSpeedBonus || 0,
    healingReceivedBonus: total.healingReceivedBonus || 0,
    onHitHealingPercent: total.onHitHealingPercent || 0,
    buffDurationBonus: total.buffDurationBonus || 0,
    partyDpsBuff: total.partyDpsBuff || 0,
    partyDefenceBuff: total.partyDefenceBuff || 0,
    partyAttackSpeedBuff: total.partyAttackSpeedBuff || 0,
    ...total, // Include any dynamic stats
  };
}

// Get weapon skills from cache (uses weaponCategory for consistent dual-dagger detection)
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

export function getWeaponSkillsFromCache(equipment: Record<string, string | null>, itemModifications?: Record<string, any>): WeaponSkill[] {
  const allSkills: WeaponSkill[] = [];
  
  const weaponId = equipment.weapon;
  if (!weaponId) return allSkills;
  
  const { baseItem } = parseItemWithRarityForCache(weaponId);
  const mainSkills = WEAPON_SKILLS[baseItem] || [];
  allSkills.push(...mainSkills);
  
  // Check if main hand is a dagger using cached weaponCategory
  const mainWeaponData = cachedGameItems.get(baseItem);
  const isDagger = mainWeaponData?.weaponCategory === "dagger";
  
  // Off-hand skills (for dual daggers only)
  if (isDagger) {
    const offhandId = equipment.shield;
    if (offhandId) {
      const { baseItem: offhandBase } = parseItemWithRarityForCache(offhandId);
      const offhandData = cachedGameItems.get(offhandBase);
      const offhandIsDagger = offhandData?.weaponCategory === "dagger";
      if (offhandIsDagger) {
        const offhandSkills = WEAPON_SKILLS[offhandBase] || [];
        for (const skill of offhandSkills) {
          if (!allSkills.some(s => s.id === skill.id)) {
            allSkills.push(skill);
          }
        }
      }
    }
  }
  
  // Add enhancement skills from Death Liquid (addedSkills in itemModifications)
  if (itemModifications && itemModifications[weaponId]) {
    const mods = itemModifications[weaponId];
    for (const skillId of (mods.addedSkills || [])) {
      const skillDef = ENHANCEMENT_SKILL_DEFINITIONS[skillId];
      if (skillDef && !allSkills.some(s => s.id === skillDef.id)) {
        allSkills.push(skillDef as any);
      }
    }
  }
  
  return allSkills;
}

// Get weapon attack speed from database cache (mirrors online behavior)
export function getWeaponAttackSpeedFromDb(equipment: Record<string, string | null>): number {
  const DEFAULT_SPEED = 2400;
  const weaponId = equipment.weapon;
  if (!weaponId) return DEFAULT_SPEED;
  
  // Use unified parsing function to extract base item name
  const { baseItem } = parseItemWithRarityForCache(weaponId);
  
  const weaponData = cachedGameItems.get(baseItem);
  if (weaponData?.attackSpeedMs) {
    return weaponData.attackSpeedMs;
  }
  
  // Fallback to combatUtils static data if not in DB cache
  return getWeaponAttackSpeed(equipment);
}

// Get weapon lifesteal from database cache (mirrors online behavior)
// Supports dual daggers: sums lifesteal from both main hand and off-hand
export function getWeaponLifestealFromDb(equipment: Record<string, string | null>): number {
  let totalLifesteal = 0;
  
  // Main hand weapon
  const weaponId = equipment.weapon;
  if (weaponId) {
    const { baseItem } = parseItemWithRarityForCache(weaponId);
    const weaponData = cachedGameItems.get(baseItem);
    if (weaponData?.lifestealPercent) {
      totalLifesteal += weaponData.lifestealPercent;
    }
  }
  
  const offhandId = equipment.shield;
  if (offhandId && weaponId) {
    const { baseItem: mainBase } = parseItemWithRarityForCache(weaponId);
    const mainData = cachedGameItems.get(mainBase);
    const { baseItem } = parseItemWithRarityForCache(offhandId);
    const offhandData = cachedGameItems.get(baseItem);
    if (mainData?.weaponCategory === "dagger" && offhandData?.weaponCategory === "dagger" && offhandData?.lifestealPercent) {
      totalLifesteal += offhandData.lifestealPercent * 0.25;
    }
  }
  
  // Use total if found from DB, otherwise fallback to static data
  if (totalLifesteal > 0) {
    return totalLifesteal;
  }
  
  // Fallback to combatUtils static data if not in DB cache
  return getWeaponLifesteal(equipment);
}

const PARTY_LOOT_CHECK_INTERVAL = 30000;
const PARTY_LOOT_SAME_MONSTER_CONTRIBUTION = 6;
const PARTY_LOOT_DIFF_MONSTER_CONTRIBUTION = 3;
const PARTY_LOOT_DIMINISHING_FACTOR = 0.75;
const PARTY_LOOT_HARD_CAP = 20;
const PARTY_LOOT_QUANTITY_MULTIPLIER = 0.5;
const PARTY_LOOT_EQUIPMENT_RETRIES = 3;

const partyLootLastCheck: Map<string, number> = new Map();

async function processPartyLootSharing(
  playerId: string, 
  partyId: string, 
  currentMonsterId: string,
  inventory: Record<string, number>,
  lootGained: Record<string, number>
): Promise<{ sharedLoot: Record<string, number>; notifications: string[] }> {
  const sharedLoot: Record<string, number> = {};
  const notifications: string[] = [];
  const now = Date.now();
  
  const lastCheck = partyLootLastCheck.get(playerId) || 0;
  if (now - lastCheck < PARTY_LOOT_CHECK_INTERVAL) {
    return { sharedLoot, notifications };
  }
  partyLootLastCheck.set(playerId, now);
  
  try {
    const allMembers = await db.select()
      .from(partyMembers)
      .where(eq(partyMembers.partyId, partyId));
    
    const otherMembers = allMembers.filter(m => m.playerId !== playerId);
    if (otherMembers.length === 0) return { sharedLoot, notifications };
    
    const activeMembers: Array<{ playerId: string; monsterId: string; isSameMonster: boolean }> = [];
    
    for (const member of otherMembers) {
      let memberMonsterId = member.currentMonsterId;
      
      if (!memberMonsterId) {
        try {
          const [memberPlayer] = await db.select({ activeCombat: players.activeCombat })
            .from(players)
            .where(eq(players.id, member.playerId));
          if (memberPlayer?.activeCombat) {
            const combat = typeof memberPlayer.activeCombat === 'string' 
              ? JSON.parse(memberPlayer.activeCombat) 
              : memberPlayer.activeCombat;
            memberMonsterId = combat?.monsterId || null;
          }
        } catch {
        }
      }
      
      if (!memberMonsterId) continue;
      
      activeMembers.push({
        playerId: member.playerId,
        monsterId: memberMonsterId,
        isSameMonster: memberMonsterId === currentMonsterId
      });
    }
    
    if (activeMembers.length === 0) return { sharedLoot, notifications };
    
    activeMembers.sort((a, b) => (b.isSameMonster ? 1 : 0) - (a.isSameMonster ? 1 : 0));
    
    let consolidatedChance = 0;
    for (let i = 0; i < activeMembers.length; i++) {
      const baseContribution = activeMembers[i].isSameMonster
        ? PARTY_LOOT_SAME_MONSTER_CONTRIBUTION
        : PARTY_LOOT_DIFF_MONSTER_CONTRIBUTION;
      consolidatedChance += baseContribution * Math.pow(PARTY_LOOT_DIMINISHING_FACTOR, i);
    }
    consolidatedChance = Math.min(consolidatedChance, PARTY_LOOT_HARD_CAP);
    
    if (Math.random() * 100 >= consolidatedChance) {
      return { sharedLoot, notifications };
    }
    
    const pickedMember = activeMembers[Math.floor(Math.random() * activeMembers.length)];
    const monsterLoot = await getMonsterLootTable(pickedMember.monsterId);
    if (!monsterLoot || monsterLoot.length === 0) return { sharedLoot, notifications };
    
    let selectedDrop: { itemId: string; chance: number; minQty: number; maxQty: number } | null = null;
    for (let attempt = 0; attempt <= PARTY_LOOT_EQUIPMENT_RETRIES; attempt++) {
      const successfulRolls = monsterLoot.filter(d => Math.random() * 100 < d.chance);
      if (successfulRolls.length === 0) continue;
      const candidate = successfulRolls[Math.floor(Math.random() * successfulRolls.length)];
      
      if (!isEquipmentItem(candidate.itemId)) {
        selectedDrop = candidate;
        break;
      }
    }
    
    if (!selectedDrop) return { sharedLoot, notifications };
    
    let qty = selectedDrop.minQty + Math.floor(Math.random() * (selectedDrop.maxQty - selectedDrop.minQty + 1));
    qty = Math.max(1, Math.ceil(qty * PARTY_LOOT_QUANTITY_MULTIPLIER));
    
    const finalItemId = selectedDrop.itemId;
    sharedLoot[finalItemId] = (sharedLoot[finalItemId] || 0) + qty;
    lootGained[finalItemId] = (lootGained[finalItemId] || 0) + qty;
    notifications.push(`${getReadableItemName(finalItemId)} x${qty} from party`);
    
    if (Object.keys(sharedLoot).length > 0) {
      debugLog(`[Scheduler] Party loot sharing for ${playerId} (chance=${consolidatedChance.toFixed(1)}%): ${JSON.stringify(sharedLoot)}`);
    }
  } catch (error) {
    debugLog(`[Scheduler] Party loot sharing error for ${playerId}:`, error);
  }
  
  return { sharedLoot, notifications };
}

// Get monster loot table from database
async function getMonsterLootTable(monsterId: string): Promise<Array<{ itemId: string; chance: number; minQty: number; maxQty: number }> | null> {
  try {
    // Query gameMonsters table directly for monster loot
    const monster = await storage.getGameMonster(monsterId);
    if (monster && monster.loot) {
      return monster.loot as Array<{ itemId: string; chance: number; minQty: number; maxQty: number }>;
    }
    return null;
  } catch {
    return null;
  }
}

export function startScheduler(): void {
  if (isRunning) {
    console.log("[Scheduler] Already running");
    return;
  }
  
  isRunning = true;
  console.log("[Scheduler] Initialized (no background timers - triggers on player connect)");
  
  refreshItemCache();
}

export function stopScheduler(): void {
  isRunning = false;
  console.log("[Scheduler] Stopped");
}

export async function onPlayerConnect(playerId: string): Promise<void> {
  if (!isRunning) return;
  
  try {
    const now = Date.now();

    if (now - lastItemCacheRefresh > ITEM_CACHE_TTL) {
      await refreshItemCache();
    }

    if (!botSkillFixDone) {
      botSkillFixDone = true;
      botService.fixExistingBotSkillLevels().catch(err =>
        console.error("[Scheduler] Bot skill fix error:", err)
      );
    }

    if (!botMigrationDone) {
      botMigrationDone = true;
      botService.migrateExistingBots().catch(err =>
        console.error("[Scheduler] Bot migration error:", err)
      );
      botService.backfillBotBadges().catch(err =>
        console.error("[Scheduler] Bot badge backfill error:", err)
      );
    }

    if (now - lastGuestCleanup > GUEST_CLEANUP_INTERVAL_MS) {
      lastGuestCleanup = now;
      cleanupInactiveGuests().catch(err =>
        console.error("[Scheduler] Guest cleanup error:", err)
      );
    }

    if (now - lastStalePartyCleanup > STALE_PARTY_CLEANUP_INTERVAL_MS) {
      lastStalePartyCleanup = now;
      cleanupStaleParties().catch(err =>
        console.error("[Scheduler] Stale party cleanup error:", err)
      );
      cleanupExpiredInvites().catch(err =>
        console.error("[Scheduler] Invite cleanup error:", err)
      );
    }

    if (now - lastBotActivity > BOT_ACTIVITY_INTERVAL_MS) {
      lastBotActivity = now;
      botService.runBotActivityCycle().catch(err =>
        console.error("[Scheduler] Bot activity error:", err)
      );
    }

    if (now - lastAutoSell > AUTO_SELL_INTERVAL_MS) {
      lastAutoSell = now;
      storage.processAutoSellListings().catch(err =>
        console.error("[Scheduler] Auto-sell error:", err)
      );
    }

    dungeonService.processOfflineDungeon(playerId).catch(err =>
      console.error("[Scheduler] Dungeon offline processing error:", err)
    );

    // Retroactive badge check - award any missing badges for completed achievement tiers
    try {
      const allAchievements = await storage.getAllAchievements();
      const playerAchievements = await storage.getPlayerAchievements(playerId);
      if (playerAchievements.length > 0) {
        const existingBadges = await storage.getPlayerBadges(playerId);
        const ownedBadgeIds = new Set(existingBadges.map(b => b.badgeId));
        let awardedCount = 0;
        for (const pa of playerAchievements) {
          const achievement = allAchievements.find(a => a.id === pa.achievementId);
          if (!achievement) continue;
          const tiersList = (achievement.tiers as any[]) || [];
          const completedTiers = (pa.completedTiers as number[]) || [];
          for (const t of tiersList) {
            if (t.badgeId && completedTiers.includes(t.tier) && !ownedBadgeIds.has(t.badgeId)) {
              try {
                const badge = await storage.getBadge(t.badgeId);
                if (badge) {
                  await storage.awardBadge(playerId, t.badgeId);
                  ownedBadgeIds.add(t.badgeId);
                  awardedCount++;
                }
              } catch (e) {}
            }
          }
        }
        if (awardedCount > 0) {
          console.log(`[Scheduler] Awarded ${awardedCount} retroactive badges to player ${playerId}`);
        }
      }
    } catch (e) {
      // Non-critical, don't block connect
    }

  } catch (error) {
    console.error("[Scheduler] onPlayerConnect error:", error);
  }
}

// Process travel - complete travel when time elapses (offline support)
async function processTravelTick(player: any, now: number): Promise<void> {
  const activeTravel = player.activeTravel as {
    targetRegion: string;
    startTime: number;
    endTime: number;
    cost: number;
    fromRegion: string;
  } | null;

  if (!activeTravel) return;

  // Check if travel time has elapsed
  if (now >= activeTravel.endTime) {
    debugLog(`[Scheduler] Travel complete for player ${player.id}: ${activeTravel.fromRegion} -> ${activeTravel.targetRegion}`);
    
    // Complete the travel
    await storage.updatePlayer(player.id, {
      currentRegion: activeTravel.targetRegion,
      activeTravel: null
    });
  }
}

async function processCombatTick(player: any, now: number): Promise<void> {
  // Use let so we can update the local reference after saving timestamps
  let activeCombat = player.activeCombat as ActiveCombat | null;
  if (!activeCombat) return;
  
  // Skip if combat was stopped (e.g., player died and must eat food to recover)
  if (activeCombat.stopped) {
    return;
  }
  
  // Skip if client was recently active (client is handling combat)
  const MIN_VALID_TIMESTAMP = 1704067200000; // Jan 1, 2024
  
  // Use lastClientTick if valid, otherwise fall back to player.lastSaved or combat startTime
  // This handles legacy combat data that was started before lastClientTick was added
  let lastClientTick = activeCombat.lastClientTick || 0;
  const isLegacyCombat = lastClientTick < MIN_VALID_TIMESTAMP;
  if (isLegacyCombat) {
    // Legacy combat - use lastSaved timestamp as fallback
    const lastSavedTime = player.lastSaved ? new Date(player.lastSaved).getTime() : 0;
    const combatStartTime = activeCombat.combatStartTime || 0;
    lastClientTick = lastSavedTime > MIN_VALID_TIMESTAMP ? lastSavedTime : combatStartTime;
    
    if (lastClientTick < MIN_VALID_TIMESTAMP) {
      // Still no valid timestamp - clear this stale combat
      debugLog(`[Scheduler] Clearing stale combat for player ${player.id} (no valid timestamps)`);
      await storage.updatePlayer(player.id, { activeCombat: null });
      combatStates.delete(player.id);
      return;
    }
    // Only log fallback message once when first taking over (not every tick)
    if (!combatStates.has(player.id)) {
      debugLog(`[Scheduler] Using fallback timestamp for legacy combat: player ${player.id}, lastClientTick=${lastClientTick}`);
    }
  }
  
  const timeSinceClientTick = now - lastClientTick;
  if (timeSinceClientTick < CLIENT_STALE_THRESHOLD) {
    // DIAGNOSTIC: Log only once per minute when client is active
    const skipLogKey = `combat_skip_${player.id}`;
    if (!combatStates.has(player.id)) {
      debugLog(`[Scheduler] Combat for ${player.id}: client active (${Math.round(timeSinceClientTick / 1000)}s ago), skipping`);
    }
    return; // Client is actively processing combat
  }
  
  // V2 queue combat uses queueDurationMs as hard stop
  const isV2Combat = !!(activeCombat as any).queueDurationMs;
  let combatExpiry: number | null = null;
  if (isV2Combat) {
    const combatStart = activeCombat.combatStartTime || activeCombat.startTime || 0;
    combatExpiry = combatStart + ((activeCombat as any).queueDurationMs as number);
  } else if (activeCombat.limitExpiresAt) {
    combatExpiry = activeCombat.limitExpiresAt;
  }

  const OFFLINE_SKIP_THRESHOLD = 5 * 60 * 1000;
  // Skip scheduler combat processing for offline players — EXCEPT for online players
  // (isOnline === 1) who may have a stale lastLogoutAt after a recent reconnect but
  // still have an expired V2 combat that the offline helper may have missed.
  const isPlayerOfflineAndInactive = (player.isOnline === 0 || player.lastLogoutAt) && timeSinceClientTick > OFFLINE_SKIP_THRESHOLD;
  const isV2CombatExpiredAndPlayerOnline = isV2Combat && combatExpiry !== null && now >= combatExpiry && player.isOnline === 1;
  if (isPlayerOfflineAndInactive && !isV2CombatExpiredAndPlayerOnline) {
    return;
  }

  if (combatExpiry && now >= combatExpiry) {
    // Skip non-V2 combat expiry for offline/recently-offline players — the offline helper
    // handles V2 combat cleanup at login. V2 combat with online players is handled above.
    if (!isV2Combat && (player.isOnline === 0 || player.lastLogoutAt) && timeSinceClientTick > OFFLINE_SKIP_THRESHOLD) {
      return;
    }

    if (isV2Combat) {
      const taskQueue = (player as any).taskQueue;
      if (taskQueue && Array.isArray(taskQueue) && taskQueue.length > 0) {
        const nextItem = taskQueue[0];
        const remainingQueue = taskQueue.slice(1);
        if (nextItem.type === 'combat' && nextItem.monsterId) {
          const md = nextItem.monsterData || {};
          const nextCombat: any = {
            monsterId: nextItem.monsterId,
            monsterCurrentHp: (md.maxHp || 10) * 10,
            monsterMaxHp: (md.maxHp || 10) * 10,
            monsterAttackLevel: md.attackLevel || 1,
            monsterStrengthLevel: md.strengthLevel || 1,
            monsterDefenceLevel: md.defenceLevel || 1,
            monsterAttackBonus: md.attackBonus || 0,
            monsterStrengthBonus: md.strengthBonus || 0,
            monsterAttackSpeed: md.attackSpeed || 4000,
            monsterLoot: md.loot || [],
            monsterXpReward: md.xpReward || {},
            monsterSkills: md.skills || [],
            playerLastAttackTime: now,
            monsterLastAttackTime: now,
            combatStartTime: now,
            startTime: now,
            limitExpiresAt: now + (nextItem.durationMs || 6 * 60 * 60 * 1000),
            autoEatEnabled: true,
            autoEatThreshold: 40,
            selectedFood: null,
            autoPotionEnabled: false,
            selectedPotion: null,
            combatStyle: 'balanced',
            queueDurationMs: nextItem.durationMs,
            name: nextItem.name,
            lastClientTick: now,
          };
          await storage.updatePlayer(player.id, { activeCombat: nextCombat, taskQueue: remainingQueue } as any);
        } else {
          const nextTask: any = {
            skillId: nextItem.skillId,
            actionId: nextItem.actionId,
            startTime: now,
            startedAt: new Date(now).toISOString(),
            duration: nextItem.actionDuration || nextItem.duration || 3000,
            name: nextItem.name,
            xpReward: nextItem.xpReward || 0,
            limitExpiresAt: now + (nextItem.durationMs || 6 * 60 * 60 * 1000),
            lastClientTick: now,
            producedCount: 0,
            queueDurationMs: nextItem.durationMs,
          };
          if (nextItem.materials) nextTask.materials = nextItem.materials;
          if (nextItem.itemId) nextTask.itemId = nextItem.itemId;
          if (nextItem.requiredBait) nextTask.requiredBait = nextItem.requiredBait;
          if (nextItem.baitAmount) nextTask.baitAmount = nextItem.baitAmount;
          await storage.updatePlayer(player.id, { activeCombat: null, activeTask: nextTask, taskQueue: remainingQueue } as any);
        }
      } else {
        await storage.updatePlayer(player.id, { activeCombat: null });
      }
    } else {
      await storage.updatePlayer(player.id, { activeCombat: null });
      try {
        const monsterName = getReadableMonsterName(activeCombat.monsterId || "");
        await notifyIdleTimerExpired(player.id, monsterName);
      } catch (e) {}
    }
    combatStates.delete(player.id);
    return;
  }
  
  // Log when scheduler takes over (only log occasionally to avoid spam)
  if (!combatStates.has(player.id)) {
    debugLog(`[Scheduler] Taking over combat for player ${player.id} (client stale for ${Math.round(timeSinceClientTick / 1000)}s)`);
  }
  
  let state = combatStates.get(player.id);
  
  // CRITICAL FIX: Check if monster changed - if so, clear old state and create fresh one
  // This fixes the bug where switching monsters quickly before logout causes scheduler 
  // to use the old monster's cached state instead of the new monster's data
  if (state) {
    // Compare current activeCombat.monsterId with what we had when state was created
    const stateHasWrongMonster = state.monsterId !== activeCombat.monsterId;
    if (stateHasWrongMonster) {
      debugLog(`[Scheduler] Monster changed for player ${player.id}: old=${state.monsterId}, new=${activeCombat.monsterId} - clearing state`);
      combatStates.delete(player.id);
      state = undefined;
    }
  }
  
  if (!state) {
    const storedDebuffs = activeCombat.combatDebuffs || [];
    const validDebuffs = storedDebuffs.filter(d => d.expiresAt > now);
    
    const initialMonsterHp = activeCombat.monsterCurrentHp ?? (activeCombat.monsterMaxHp ?? (100 * COMBAT_HP_SCALE));
    const needsRespawn = initialMonsterHp <= 0;
    
    const clientAttackTime = lastClientTick || now;
    const storedAttackTime = activeCombat.playerLastAttackTime;
    
    const playerLastAttackTimeValue = (storedAttackTime && storedAttackTime <= clientAttackTime) 
      ? storedAttackTime 
      : clientAttackTime;
    const monsterLastAttackTimeValue = (activeCombat.monsterLastAttackTime && activeCombat.monsterLastAttackTime <= clientAttackTime)
      ? activeCombat.monsterLastAttackTime
      : clientAttackTime;
    
    debugLog(`[Scheduler] Combat state init for ${player.id}: clientAttackTime=${clientAttackTime}, storedAttackTime=${storedAttackTime}, using=${playerLastAttackTimeValue}, now=${now}, gap=${now - playerLastAttackTimeValue}ms`);
    
    state = {
      playerId: player.id,
      monsterId: activeCombat.monsterId,
      lastProcessedAt: now,
      monsterHp: initialMonsterHp,
      playerHp: player.currentHitpoints ?? 100 * COMBAT_HP_SCALE,
      playerLastAttackTime: playerLastAttackTimeValue,
      monsterLastAttackTime: monsterLastAttackTimeValue,
      isRespawning: needsRespawn,
      respawnStartTime: needsRespawn ? playerLastAttackTimeValue : 0,
      combatDebuffs: validDebuffs,
      lastDebuffTick: now,
    };
    combatStates.set(player.id, state);
    
    debugLog(`[Scheduler] Taking over combat for player ${player.id}`);
  }
  
  const elapsedMs = now - state.lastProcessedAt;
  if (elapsedMs < 100) {
    return;
  }
  
  state.lastProcessedAt = now;
  
  const skills = player.skills as Record<string, { xp: number; level: number }>;
  const equipment = player.equipment as Record<string, string | null>;
  const inventory = player.inventory as Record<string, number>;
  const equipmentDurability = (player.equipmentDurability || {}) as Record<string, number>;
  
  // Fetch guild bonuses for this player
  const guildBonuses = await storage.getPlayerGuildBonuses(player.id);
  
  // Get party passive buffs for offline combat
  let partyBuffs = { foodHealBonus: 0, defenseBonus: 0, attackBonus: 0, hasHealer: false, hasTank: false, hasDps: false };
  let membership: { partyId: string } | null = null;
  try {
    // Find player's party membership
    const [foundMembership] = await db.select()
      .from(partyMembers)
      .where(eq(partyMembers.playerId, player.id));
    
    if (foundMembership) {
      membership = foundMembership;
      // Get all party members' weapon types
      const allMembers = await db.select({ cachedWeaponType: partyMembers.cachedWeaponType })
        .from(partyMembers)
        .where(eq(partyMembers.partyId, foundMembership.partyId));
      
      const weaponTypes = allMembers.map(m => m.cachedWeaponType);
      partyBuffs = calculatePartyPassiveBuffs(weaponTypes);
    }
  } catch (e) {
    // Ignore party buff errors - continue without buffs
  }
  
  const attackLevel = skills.attack?.level || 1;
  const strengthLevel = skills.strength?.level || 1;
  const defenceLevel = skills.defence?.level || 1;
  const hitpointsLevel = skills.hitpoints?.level || 10;
  
  const combatStyle = activeCombat.combatStyle || "balanced";
  const styleModifiers = COMBAT_STYLE_MODIFIERS[combatStyle];
  
  // Use player's activeBuffs with expiration checking (not static snapshot)
  const activeBuffs = (player.activeBuffs || []) as Array<{
    effectType: string;
    value: number;
    expiresAt: number;
  }>;
  
  // Helper to get buff value only if not expired
  const getBuffValue = (effectType: string): number => {
    const buff = activeBuffs.find(b => b.effectType === effectType && b.expiresAt > now);
    return buff?.value || 0;
  };
  
  // Load player's weapon enhancement levels from database
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
  } catch (e) {
    // Ignore enhancement errors - continue without bonuses
  }
  
  // Load player's item modifications (addedStats from Chaos Stone, addedSkills from Death Liquid)
  const itemModifications = (player.itemModifications as Record<string, any>) || {};
  
  // CRITICAL FIX: Use database-cached equipment bonuses instead of static EQUIPMENT_STATS
  // This ensures scheduler has the same item data as client (database-driven items)
  // Now also applies enhancement bonuses (5% per level) dynamically to all stats
  // Also applies addedStats from itemModifications (Chaos Stone enhancements)
  const equipBonuses = getEquipmentBonusesFromCache(equipment, enhancementLevels, itemModifications);
  
  // CRITICAL FIX: Include equipment hitpointsBonus in maxPlayerHp calculation
  // Previously this was missing, causing auto-eat to trigger at wrong threshold
  let maxPlayerHp = (hitpointsLevel * COMBAT_HP_SCALE) + equipBonuses.hitpointsBonus;

  // Apply maxHpBoost buff if active (Vitality Potions)
  const maxHpBoostBuff = activeBuffs.find(b => b.effectType === "maxHpBoost" && b.expiresAt > now);
  if (maxHpBoostBuff) {
    maxPlayerHp = Math.floor(maxPlayerHp * (1 + maxHpBoostBuff.value / 100));
  }
  
  // Debug logging for combat calculations (helps debug production issues) - only first tick or every 60s
  const combatStartedAt = activeCombat.combatStartTime || now;
  const isFirstTick = (now - combatStartedAt) < 2000;
  if (DEBUG_SCHEDULER && isFirstTick) {
    const enhancedItems = Array.from(enhancementLevels.entries()).map(([k, v]) => `${k}:+${v}`).join(', ');
    console.log(`[Scheduler] Combat start for ${activeCombat.monsterId}: HpLvl=${hitpointsLevel}, EquipHP=${equipBonuses.hitpointsBonus}, MaxHP=${maxPlayerHp}, EquipDef=${equipBonuses.defenceBonus}, CacheSize=${cachedGameItems.size}${enhancedItems ? `, Enhancements: ${enhancedItems}` : ''}`);
  }
  const attackBoost = getBuffValue("attack_boost");
  const strengthBoost = getBuffValue("strength_boost");
  const defenceBoost = getBuffValue("defence_boost");
  const critChance = getBuffValue("crit_chance");
  const drBuff = getBuffValue("damage_reduction");
  const hpRegenValue = getBuffValue("hp_regen");
  const xpBoostValue = getBuffValue("xp_boost"); // XP boost percentage from potions
  const lifestealBuffValue = getBuffValue("lifesteal"); // Lifesteal percentage from potions
  
  // Note: For damage/accuracy, we apply buffs AFTER base calculation (like online)
  // effectiveDefenceLevel is still used for evasion calculation
  
  // NOTE: activeCombat.monsterMaxHp is already scaled by client (maxHitpoints * COMBAT_HP_SCALE)
  // So we should NOT multiply by COMBAT_HP_SCALE again here
  const monsterMaxHp = activeCombat.monsterMaxHp ?? (10 * COMBAT_HP_SCALE);
  const monsterAttackLevel = activeCombat.monsterAttackLevel ?? 1;
  const monsterStrengthLevel = activeCombat.monsterStrengthLevel ?? 1;
  const monsterDefenceLevel = activeCombat.monsterDefenceLevel ?? 1;
  const monsterAttackBonus = activeCombat.monsterAttackBonus ?? 0;
  const monsterStrengthBonus = activeCombat.monsterStrengthBonus ?? 0;
  const monsterAttackSpeed = activeCombat.monsterAttackSpeed ?? 2400;
  const monsterLoot = activeCombat.monsterLoot || [];
  const monsterXpReward = activeCombat.monsterXpReward || { attack: 10, strength: 10, defence: 10, hitpoints: 10 };
  
  const autoEatEnabled = activeCombat.autoEatEnabled ?? false;
  const autoEatThreshold = activeCombat.autoEatThreshold ?? 50;
  const selectedFood = activeCombat.selectedFood;
  
  // Auto-potion settings
  const autoPotionEnabled = activeCombat.autoPotionEnabled ?? false;
  const selectedPotion = activeCombat.selectedPotion;
  
  let playerHp = state.playerHp;
  let monsterHp = state.monsterHp;
  let playerLastAttackTime = state.playerLastAttackTime;
  let monsterLastAttackTime = state.monsterLastAttackTime;
  let isRespawning = state.isRespawning;
  let respawnStartTime = state.respawnStartTime;
  
  const brokenItems: string[] = [];
  const durabilityWarningItems: string[] = [];
  const specialLootFound: string[] = [];
  let lootGained: Record<string, number> = {};
  let partySharedLootAccum: Record<string, number> = {};
  let xpGained: Record<string, number> = { attack: 0, strength: 0, defence: 0, hitpoints: 0 };
  let masteryXpGained: Record<string, number> = {};
  let playerDied = false;
  let monstersKilled = 0;
  
  // Combat analysis tracking
  let combatStats = {
    playerAttacks: 0,
    playerHits: 0,
    playerTotalDamage: 0,
    monsterAttacks: 0,
    monsterHits: 0,
    monsterTotalDamage: 0,
    foodConsumed: 0,
    autoEatTriggers: 0
  };
  
  // Process respawn if needed (don't return early - handle in combat loop)
  if (isRespawning && now >= respawnStartTime + RESPAWN_DELAY) {
    monsterHp = monsterMaxHp;
    isRespawning = false;
    state.monsterStunCycles = 0;
    // CRITICAL FIX: Reset both attack times to respawn end time
    // This ensures BOTH monster AND player respect the respawn delay
    // Without this, player could attack immediately after respawn ignoring the 3s delay
    const respawnEndTime = respawnStartTime + RESPAWN_DELAY;
    monsterLastAttackTime = respawnEndTime;
    playerLastAttackTime = respawnEndTime;
  }
  
  // Power ratio accuracy bonus: stronger players hit more often against weaker enemies
  // Match online: use base levels for power calculation
  const playerPower = attackLevel + strengthLevel + (equipBonuses.attackBonus ?? 0) + (equipBonuses.strengthBonus ?? 0);
  const effectiveMonsterDefence = Math.max(monsterDefenceLevel, 1);
  const powerRatio = playerPower / effectiveMonsterDefence;
  // Clamp power ratio modifier between 0.8 (-20%) and 1.2 (+20%)
  const powerRatioMod = Math.max(0.8, Math.min(1.2, 0.8 + (powerRatio - 0.5) * 0.267));

  // Match online: calculate base values first, then apply buffs and style modifiers AFTER
  const baseAccuracy = calculateAccuracyRating(attackLevel, equipBonuses.attackBonus ?? 0);
  const playerAccuracy = Math.floor(baseAccuracy * (1 + attackBoost / 100) * styleModifiers.accuracyMod * powerRatioMod);
  
  const baseEvasion = calculateEvasionRating(defenceLevel, equipBonuses.defenceBonus ?? 0);
  const playerEvasion = Math.floor(baseEvasion * (1 + defenceBoost / 100) * styleModifiers.defenceMod);
  
  const baseMaxHit = calculateFinalMaxHit(strengthLevel, equipBonuses.strengthBonus ?? 0, monsterDefenceLevel) * COMBAT_HP_SCALE;
  const baseMinHit = calculateFinalMinHit(strengthLevel, equipBonuses.strengthBonus ?? 0, monsterDefenceLevel) * COMBAT_HP_SCALE;
  // Apply guild combat power bonus (guildBonuses.combatPower is a percentage)
  const guildCombatMod = 1 + ((guildBonuses?.combatPower || 0) / 100);
  // Apply party attack bonus and healer staff party DPS buff
  const partyAttackMod = 1 + partyBuffs.attackBonus + (equipBonuses.partyDpsBuff / 100);
  const playerMaxHit = Math.floor(baseMaxHit * (1 + strengthBoost / 100) * styleModifiers.damageMod * guildCombatMod * partyAttackMod);
  const playerMinHit = Math.floor(baseMinHit * (1 + strengthBoost / 100) * styleModifiers.damageMod * guildCombatMod * partyAttackMod);
  // Match online: apply style modifier and buff to total defense for DR calculation
  // Apply guild defense power bonus, party defense bonus, and healer staff party defence buff
  const guildDefenseMod = 1 + ((guildBonuses?.defensePower || 0) / 100);
  const partyDefenseMod = 1 + partyBuffs.defenseBonus + (equipBonuses.partyDefenceBuff / 100);
  const playerTotalDefense = Math.floor((defenceLevel + (equipBonuses.defenceBonus ?? 0)) * (1 + defenceBoost / 100) * styleModifiers.defenceMod * guildDefenseMod * partyDefenseMod);
  const baseDR = calculateDamageReduction(playerTotalDefense);
  const totalDR = Math.min(0.85, Math.min(0.75, baseDR) + (drBuff / 100));
  
  // Use monster bonuses for accuracy and damage (match online combat)
  const monsterAccuracy = calculateAccuracyRating(monsterAttackLevel, monsterAttackBonus);
  const monsterEvasion = calculateEvasionRating(monsterDefenceLevel, 0);
  const monsterMaxHitDmg = calculateMaxHit(monsterStrengthLevel, monsterStrengthBonus) * COMBAT_HP_SCALE;
  const monsterMinHitDmg = calculateMinHit(monsterStrengthLevel, monsterStrengthBonus) * COMBAT_HP_SCALE;
  
  // Process debuff ticks (DoT damage) before attacks
  let debuffs = state.combatDebuffs || [];
  const lastDebuffTick = state.lastDebuffTick || 0;
  if (now - lastDebuffTick >= 1000 && debuffs.length > 0) {
    state.lastDebuffTick = now;
    const tickResult = processDebuffTick(debuffs, playerHp, maxPlayerHp);
    debuffs = tickResult.updatedDebuffs;
    state.combatDebuffs = debuffs;
    
    if (tickResult.dotDamage > 0) {
      // Apply armor break effect to DR for DoT damage
      const armorBreakPercent = getArmorBreakPercent(debuffs);
      const effectiveDRForDoT = totalDR * (1 - armorBreakPercent);
      const dotDmg = Math.max(1, Math.floor(tickResult.dotDamage * (1 - effectiveDRForDoT * 0.5)));
      playerHp = Math.max(0, playerHp - dotDmg);
      
      // DEATH PREVENTION for DoT damage: If HP would be 0 but player has food, save them
      if (autoEatEnabled && playerHp <= 0) {
        let survivalFoodDoT = selectedFood && inventory[selectedFood] > 0 
          ? selectedFood 
          : getBestFood(inventory);
        
        if (survivalFoodDoT && inventory[survivalFoodDoT] > 0) {
          const healingReductionForDoT = getHealingReduction(debuffs);
          while (playerHp <= 0 && survivalFoodDoT && inventory[survivalFoodDoT] > 0) {
            const baseHeal = getFoodHealAmount(survivalFoodDoT);
            const healingReceivedModDoT = 1 + (equipBonuses.healingReceivedBonus / 100);
            const healAmount = Math.floor(baseHeal * (1 - healingReductionForDoT) * (1 + partyBuffs.foodHealBonus) * healingReceivedModDoT);
            playerHp = Math.min(maxPlayerHp, playerHp + healAmount);
            inventory[survivalFoodDoT] = (inventory[survivalFoodDoT] || 0) - 1;
            if (inventory[survivalFoodDoT] <= 0) {
              delete inventory[survivalFoodDoT];
              if (!state.foodDepletedNotified) {
                state.foodDepletedNotified = true;
                try {
                  await notifyFoodDepleted(player.id, getReadableItemName(survivalFoodDoT));
                } catch (e) {
                  console.error("Food depletion push notification failed:", e);
                }
              }
              survivalFoodDoT = getBestFood(inventory);
            }
          }
        }
      }
      
      if (playerHp <= 0) {
        playerDied = true;
        state.combatDebuffs = [];
        debugLog(`[Scheduler] DEATH DETECTED from DoT for player ${player.id}: HP=${playerHp}, autoEat=${autoEatEnabled}, hasFood=${!!getBestFood(inventory)}`);
      }
    }
  }
  
  // Check for stun before player attack
  let stunCycles = getStunCyclesRemaining(debuffs);
  
  // Get dynamic weapon attack speed, lifesteal, and skills (from database for parity with online)
  const baseWeaponAttackSpeed = getWeaponAttackSpeedFromDb(equipment);
  // Apply attack speed bonus from leather armor + healer staff party attack speed buff (reduces attack speed = faster attacks)
  const totalAttackSpeedBonus = equipBonuses.attackSpeedBonus + equipBonuses.partyAttackSpeedBuff;
  const attackSpeedReduction = totalAttackSpeedBonus > 0 ? (1 - totalAttackSpeedBonus / 100) : 1;
  const weaponAttackSpeed = Math.max(500, Math.floor(baseWeaponAttackSpeed * attackSpeedReduction));
  const weaponLifesteal = getWeaponLifestealFromDb(equipment);
  const weaponSkills = getWeaponSkillsFromCache(equipment, itemModifications);
  
  // CRITICAL: Use while loop to process ALL accumulated attacks since last tick
  // This ensures offline combat catches up properly (e.g., 18 minutes = hundreds of attacks)
  // Maximum iterations to prevent infinite loops
  const MAX_COMBAT_ITERATIONS = 10000;
  let combatIterations = 0;
  
  // Debug: Log initial state before while loop
  const initialGap = now - playerLastAttackTime;
  const canAttack = now >= playerLastAttackTime + weaponAttackSpeed;
  if (initialGap > 5000) { // Only log if gap is significant (>5s)
    debugLog(`[Scheduler] Combat loop check for ${player.id}: gap=${initialGap}ms, weaponSpeed=${weaponAttackSpeed}ms, canAttack=${canAttack}, isRespawning=${isRespawning}, playerDied=${playerDied}`);
    debugLog(`[Scheduler] Combat stats: Str=${strengthLevel}, StrBonus=${equipBonuses.strengthBonus ?? 0}, MonsterDef=${monsterDefenceLevel}`);
    debugLog(`[Scheduler] Damage: baseMax=${baseMaxHit}, playerMax=${playerMaxHit}, playerMin=${playerMinHit}, monsterHP=${monsterMaxHp}`);
    debugLog(`[Scheduler] Equipment: ${JSON.stringify(equipment)}`);
    debugLog(`[Scheduler] EquipBonuses: ${JSON.stringify(equipBonuses)}`);
  }
  
  const loopStartKills = monstersKilled;
  while (now >= playerLastAttackTime + weaponAttackSpeed && !isRespawning && !playerDied && combatIterations < MAX_COMBAT_ITERATIONS) {
    combatIterations++;
    // Increment by attack speed instead of setting to now - allows catching up
    playerLastAttackTime += weaponAttackSpeed;
    
    // Also advance monster attack time proportionally to stay in sync
    // Monster attacks happen during the same time window
    
    if (stunCycles > 0) {
      state.combatDebuffs = decrementStunCycle(debuffs);
    } else {
      combatStats.playerAttacks++;
      const hitChance = calculateHitChance(playerAccuracy, monsterEvasion);
      if (Math.random() * 100 <= hitChance) {
        combatStats.playerHits++;
        let damage = Math.floor(Math.random() * (playerMaxHit - playerMinHit + 1)) + playerMinHit;
        const cappedCritChance = Math.min(50, critChance);
        let isCritical = cappedCritChance > 0 && Math.random() * 100 < cappedCritChance;
        
        // Check for weapon skill activation
        for (const skill of weaponSkills) {
          if (Math.random() * 100 <= skill.chance) {
            if (skill.type === "stun" && skill.stunCycles) {
              // Stun the monster - skip their next attack(s)
              state.monsterStunCycles = skill.stunCycles;
            } else if (skill.type === "slow_crit") {
              // Guaranteed critical with higher multiplier + slow monster
              isCritical = true;
              const critMultiplier = skill.critMultiplier || 1.5;
              damage = Math.floor(damage * critMultiplier);
              // Slow effect: stun for 1 cycle
              if (skill.slowMultiplier && skill.slowMultiplier > 1) {
                state.monsterStunCycles = 1;
              }
            } else if (skill.type === "critical") {
              isCritical = true;
              const critMultiplier = skill.damageMultiplier || 2.0;
              damage = Math.floor(damage * critMultiplier);
            } else if (skill.type === "armor_break" && skill.armorBreakPercent) {
              // Armor break temporarily increases damage
              const armorBreakBonus = 1 + (skill.armorBreakPercent / 100);
              damage = Math.floor(damage * armorBreakBonus);
            } else if (skill.type === "poison" && skill.dotDamage && skill.dotDuration) {
              // Apply poison DoT to monster (simplified: extra damage)
              const poisonDamage = skill.dotDamage * skill.dotDuration;
              damage += poisonDamage;
            } else if (skill.type === "combo" && skill.hits) {
              // Multiple hits
              const comboMultiplier = skill.damageMultiplier || 1.0;
              damage = Math.floor(damage * skill.hits * comboMultiplier);
            } else if (skill.type === "lifesteal_burst") {
              // Burst heal based on damage
              const burstHeal = Math.floor(damage * 0.5);
              playerHp = Math.min(maxPlayerHp, playerHp + burstHeal);
            } else if (skill.type === "damage" && skill.damage) {
              // Extra flat damage from staff - apply cloth armor skill damage bonus
              const skillDamageMod = 1 + (equipBonuses.skillDamageBonus / 100);
              damage += Math.floor(skill.damage * skillDamageMod);
            } else if ((skill.type === "heal" || skill.type === "groupHeal") && (skill.healAmount || skill.healPercent)) {
              // Heal player from staff skill (groupHeal treated as regular heal)
              // Support both static healAmount and percentage-based healPercent
              let healAmt = 0;
              if (skill.healPercent) {
                healAmt = Math.floor(maxPlayerHp * skill.healPercent / 100);
              } else if (skill.healAmount) {
                healAmt = skill.healAmount;
              }
              playerHp = Math.min(maxPlayerHp, playerHp + healAmt);
            } else if (skill.type === "lifesteal" && skill.lifestealPercent) {
              // Lifesteal from staff skill
              const healAmount = Math.floor(damage * (skill.lifestealPercent / 100));
              playerHp = Math.min(maxPlayerHp, playerHp + healAmount);
            } else if (skill.type === "buff" && skill.buffType === "regen" && skill.healPerTick) {
              // Regen buff from staff
              playerHp = Math.min(maxPlayerHp, playerHp + skill.healPerTick);
            } else if (skill.type === "buff" && skill.buffType === "shield" && skill.shieldAmount) {
              // Shield buff from staff - simplified as temporary HP boost
              playerHp = Math.min(maxPlayerHp, playerHp + Math.floor(skill.shieldAmount * 0.5));
            } else if (skill.type === "buff" && skill.buffType === "defence" && skill.defenceBoost) {
              // Defence buff from staff - simplified as small HP boost
              playerHp = Math.min(maxPlayerHp, playerHp + Math.floor(skill.defenceBoost * 0.3));
            } else if (skill.type === "debuff" && skill.debuffType === "armor_break" && skill.armorReduction) {
              // Armor break debuff from staff
              const armorBreakBonus = 1 + (skill.armorReduction / 100);
              damage = Math.floor(damage * armorBreakBonus);
            } else if (skill.type === "aoe" && skill.damage) {
              // AoE damage from staff (solo = extra damage) - apply cloth armor skill damage bonus
              const skillDamageMod = 1 + (equipBonuses.skillDamageBonus / 100);
              damage += Math.floor(skill.damage * skillDamageMod);
            }
            break; // Only one skill can activate per attack
          }
        }
        
        // Apply standard critical if skill didn't already
        if (isCritical && damage === Math.floor(Math.random() * (playerMaxHit - playerMinHit + 1)) + playerMinHit) {
          damage = Math.floor(damage * 1.5);
        }
        
        combatStats.playerTotalDamage += damage;
        monsterHp = Math.max(0, monsterHp - damage);
        
        // Apply lifesteal healing from weapon + potion buff
        const totalLifestealPercent = weaponLifesteal + lifestealBuffValue;
        if (totalLifestealPercent > 0 && damage > 0) {
          const lifestealHeal = Math.floor(damage * (totalLifestealPercent / 100));
          if (lifestealHeal > 0) {
            playerHp = Math.min(maxPlayerHp, playerHp + lifestealHeal);
          }
        }
        
        // Apply on-hit healing from healer staff (onHitHealingPercent)
        if (equipBonuses.onHitHealingPercent > 0 && damage > 0) {
          const onHitHeal = Math.floor(damage * (equipBonuses.onHitHealingPercent / 100));
          if (onHitHeal > 0) {
            playerHp = Math.min(maxPlayerHp, playerHp + onHitHeal);
          }
        }
        
        // Enhancement weapon skills (from Death Liquid - addedSkills in itemModifications)
        const weaponId = equipment.weapon;
        const weaponMods = weaponId ? itemModifications[weaponId] : null;
        if (weaponMods?.addedSkills?.length > 0 && damage > 0) {
          const ENHANCEMENT_SKILLS: Record<string, { chance: number; type: string; damage?: number; duration?: number }> = {
            'poison': { chance: 15, type: 'dot', damage: 5, duration: 5 },
            'burn': { chance: 15, type: 'dot', damage: 8, duration: 3 },
            'bleed': { chance: 15, type: 'dot', damage: 4, duration: 8 },
            'stun': { chance: 10, type: 'stun', duration: 1 },
            'freeze': { chance: 10, type: 'stun', duration: 2 },
            'vampiric': { chance: 20, type: 'lifesteal' },
            'execute': { chance: 10, type: 'critical' },
            'armor_pierce': { chance: 15, type: 'armor_break' },
          };
          for (const skillId of weaponMods.addedSkills) {
            const skill = ENHANCEMENT_SKILLS[skillId];
            if (skill && Math.random() * 100 < skill.chance) {
              if (skill.type === 'dot') {
                const dotTotal = (skill.damage || 0) * (skill.duration || 1);
                monsterHp = Math.max(0, monsterHp - dotTotal);
              } else if (skill.type === 'lifesteal') {
                const healAmount = Math.floor(damage * 0.15);
                playerHp = Math.min(playerHp + healAmount, maxPlayerHp);
              } else if (skill.type === 'critical') {
                monsterHp = Math.max(0, monsterHp - Math.floor(damage * 1.5));
              }
            }
          }
        }
        
        if (monsterHp <= 0) {
          monstersKilled++;
          state.combatDebuffs = [];
          
          const xpDistribution = combatStyle === "attack" ? { attack: 0.7, strength: 0.2, defence: 0.1 }
            : combatStyle === "defence" ? { attack: 0.1, strength: 0.2, defence: 0.7 }
            : { attack: 0.33, strength: 0.34, defence: 0.33 };
          
          const baseXp = monsterXpReward.attack + monsterXpReward.strength + monsterXpReward.defence;
          // Apply XP boost from potions (percentage-based) and guild XP bonus
          const guildXpBonus = guildBonuses?.xpBonus || 0;
          const xpMultiplier = 1 + (xpBoostValue / 100) + (guildXpBonus / 100);
          
          // Apply XP scaling based on player combat level vs monster level
          // Use shared function for consistent calculation between client and server
          const monsterCombatLevel = calculateMonsterCombatLevel({
            attackLevel: activeCombat.monsterAttackLevel,
            strengthLevel: activeCombat.monsterStrengthLevel,
            defenceLevel: activeCombat.monsterDefenceLevel
          });
          const playerCombatLevel = calculateCombatLevel({
            attack: attackLevel,
            strength: strengthLevel,
            defence: defenceLevel
          });
          const combatXpScaling = calculateXpScaling(playerCombatLevel, monsterCombatLevel);
          
          xpGained.attack += Math.floor(baseXp * xpDistribution.attack * xpMultiplier * combatXpScaling.multiplier);
          xpGained.strength += Math.floor(baseXp * xpDistribution.strength * xpMultiplier * combatXpScaling.multiplier);
          xpGained.defence += Math.floor(baseXp * xpDistribution.defence * xpMultiplier * combatXpScaling.multiplier);
          xpGained.hitpoints += Math.floor(monsterXpReward.hitpoints * xpMultiplier * combatXpScaling.multiplier);
          
          // Weapon Mastery XP calculation for monster kill (with level scaling)
          const weaponId = equipment.weapon;
          if (weaponId) {
            const { baseItem } = parseItemWithRarityForCache(weaponId);
            const weaponData = cachedGameItems.get(baseItem);
            const weaponCategory = weaponData?.weaponCategory;
            const masteryType = mapWeaponCategoryToMasteryType(weaponCategory);
            
            if (masteryType) {
              // Weapon tier based on player attack level (proxy for weapon requirements)
              const weaponTier = getWeaponTierFromLevel(attackLevel);
              const baseMasteryXp = calculateMasteryXpGain(monsterCombatLevel, weaponTier, true);
              
              // Apply mastery XP scaling based on mastery level vs monster level
              const masteryField = getMasteryFieldName(masteryType);
              const currentMasteryXp = (player.masteries as Record<string, number>)?.[masteryField] || 0;
              const currentMasteryLevel = getLevelFromXp(currentMasteryXp);
              const scaledMasteryXp = applyMasteryXpScaling(baseMasteryXp, currentMasteryLevel, monsterCombatLevel);
              
              masteryXpGained[masteryField] = (masteryXpGained[masteryField] || 0) + scaledMasteryXp;
            }
          }
          
          // Dungeon key drop chance based on region tier
          const dungeonKey = rollDungeonKeyDrop(player.currentRegion || 'verdant', false);
          if (dungeonKey) {
            lootGained[dungeonKey] = (lootGained[dungeonKey] || 0) + 1;
          }
          
          for (const drop of monsterLoot) {
            // Apply guild loot bonus to drop chance for equipment items
            let dropChance = drop.chance;
            if (isEquipmentItem(drop.itemId) && guildBonuses?.lootBonus) {
              // Increase chance for equipment drops by guild loot bonus percentage
              dropChance = dropChance * (1 + (guildBonuses.lootBonus / 100));
            }
            
            if (Math.random() * 100 <= dropChance) {
              let qty = drop.minQty + Math.floor(Math.random() * (drop.maxQty - drop.minQty + 1));
              
              // Apply guild gold bonus to Gold Coins drops
              if (drop.itemId === "Gold Coins" && guildBonuses?.goldBonus) {
                qty = Math.floor(qty * (1 + (guildBonuses.goldBonus / 100)));
              }
              
              // For equipment, roll rarity and create item with rarity suffix
              let finalItemId = drop.itemId;
              if (isEquipmentItem(drop.itemId)) {
                const rarity = rollRarityForDrop();
                finalItemId = `${drop.itemId} (${rarity})`;
                
                // Special loot notification for non-common equipment
                if (rarity !== "Common") {
                  specialLootFound.push(`${getReadableItemName(drop.itemId)} (${rarity})`);
                }
                
                // Mythic drop notification
                if (rarity === "Mythic") {
                  try {
                    await notifyMythicDrop(state.playerId, getReadableItemName(drop.itemId), getReadableMonsterName(activeCombat.monsterId || ""));
                  } catch (e) {
                    console.error("Mythic drop push notification failed:", e);
                  }
                  // Track mythic drop for popup display
                  if (!state.pendingMythicDrops) {
                    state.pendingMythicDrops = [];
                  }
                  state.pendingMythicDrops.push({ itemId: finalItemId, monsterId: activeCombat.monsterId });
                }
              } else if (drop.chance < 1) {
                // Special loot for rare non-equipment drops
                specialLootFound.push(getReadableItemName(drop.itemId));
              }
              
              lootGained[finalItemId] = (lootGained[finalItemId] || 0) + qty;
            }
          }
          
          // Hidden enhancement gem drops (0.025% chance each, not shown in monster loot table)
          const HIDDEN_ENHANCEMENT_DROPS = [
            { itemId: 'chaos_stone', chance: 0.025 },
            { itemId: 'jurax_gem', chance: 0.025 },
            { itemId: 'death_liquid', chance: 0.025 },
            { itemId: 'teleport_stone', chance: 0.025 }
          ];
          for (const drop of HIDDEN_ENHANCEMENT_DROPS) {
            if (Math.random() * 100 < drop.chance) {
              lootGained[drop.itemId] = (lootGained[drop.itemId] || 0) + 1;
            }
          }
          
          isRespawning = true;
          respawnStartTime = playerLastAttackTime; // Use simulated time, not real time
          
          // Check if respawn completes within current tick
          if (playerLastAttackTime + RESPAWN_DELAY <= now) {
            // Respawn completes, spawn new monster
            monsterHp = monsterMaxHp;
            isRespawning = false;
            state.monsterStunCycles = 0;
            // Advance time past respawn
            playerLastAttackTime = respawnStartTime + RESPAWN_DELAY;
            // CRITICAL FIX: Reset monster attack time when new monster spawns
            // This prevents the new monster from "catching up" with attacks from the previous monster's timeline
            monsterLastAttackTime = playerLastAttackTime;
          }
          // If respawn doesn't complete, loop will exit due to isRespawning check
        }
      }
    }
    
    // Update stun cycles for next iteration
    stunCycles = getStunCyclesRemaining(debuffs);
  }
  
  // FIXED: Process monster attacks SEPARATELY based on monster's own attack speed
  // This ensures monster attacks at its actual rate, not synced to player attacks
  // Monster should attack based on monsterAttackSpeed, independent of player attacks
  while (monsterHp > 0 && !isRespawning && !playerDied && 
         playerLastAttackTime >= monsterLastAttackTime + monsterAttackSpeed &&
         combatIterations < MAX_COMBAT_ITERATIONS) {
    combatIterations++;
    monsterLastAttackTime += monsterAttackSpeed;
    
    const monsterIsStunned = state.monsterStunCycles && state.monsterStunCycles > 0;
    if (monsterIsStunned) {
      state.monsterStunCycles!--;
      continue;
    }
    
    combatStats.monsterAttacks++;
    const hitChance = calculateHitChance(monsterAccuracy, playerEvasion);
    if (Math.random() * 100 <= hitChance) {
      combatStats.monsterHits++;
      let damage = 0;
      let skillTriggered = false;
      const monsterSkills = activeCombat.monsterSkills || [];
      
      const currentDebuffs = state.combatDebuffs || [];
      const armorBreakForAttack = getArmorBreakPercent(currentDebuffs);
      const effectiveDRForAttack = totalDR * (1 - armorBreakForAttack);
      
      for (const skill of monsterSkills) {
        if (shouldSkillTrigger(skill)) {
          // activeCombat.monsterMaxHp is already scaled by client
          const monsterMaxHpScaled = activeCombat.monsterMaxHp || (100 * COMBAT_HP_SCALE);
          const result = executeMonsterSkill(
            skill,
            monsterStrengthLevel,
            monsterStrengthBonus,
            monsterHp,
            monsterMaxHpScaled,
            effectiveDRForAttack
          );
          
          if (result.triggered) {
            skillTriggered = true;
            
            if (result.totalDamage) {
              damage = result.totalDamage;
            } else if (result.isEnraged) {
              damage = Math.floor(monsterMaxHitDmg * 1.5 * (1 - effectiveDRForAttack));
            }
            
            if (result.newDebuff) {
              state.combatDebuffs = addOrStackDebuff(state.combatDebuffs || [], result.newDebuff);
              debuffs = state.combatDebuffs;
            }
            
            break;
          }
        }
      }
      
      if (!skillTriggered) {
        damage = Math.floor(Math.random() * (monsterMaxHitDmg - monsterMinHitDmg + 1)) + monsterMinHitDmg;
      }
      
      const finalDamage = Math.max(1, Math.floor(damage * (1 - effectiveDRForAttack)));
      combatStats.monsterTotalDamage += finalDamage;
      playerHp = Math.max(0, playerHp - finalDamage);
      
      // FIXED: Auto-eat behavior now EXACTLY matches client eatFoodUntilFullInternal
      // Client algorithm: calculate food needed to reach maxHp, eat only that food type, no switching
      if (autoEatEnabled) {
        const thresholdHp = maxPlayerHp * (autoEatThreshold / 100);
        
        // Trigger auto-eat when HP drops to 0 or below threshold
        if (playerHp <= 0 || playerHp < thresholdHp) {
          const foodId = selectedFood && inventory[selectedFood] > 0 ? selectedFood : getBestFood(inventory);
          if (foodId && inventory[foodId] > 0) {
            combatStats.autoEatTriggers++;
            
            // Client algorithm: calculate exact food needed (no healing reduction, no food switching)
            // Apply party food heal bonus and plate armor healing received bonus
            const baseHealPerFood = getFoodHealAmount(foodId);
            const healingReceivedMod = 1 + (equipBonuses.healingReceivedBonus / 100);
            const healPerFood = Math.floor(baseHealPerFood * (1 + partyBuffs.foodHealBonus) * healingReceivedMod);
            if (healPerFood > 0) {
              const hpNeeded = maxPlayerHp - playerHp;
              const foodNeeded = Math.ceil(hpNeeded / healPerFood);
              const foodAvailable = inventory[foodId] || 0;
              const foodToConsume = Math.min(foodNeeded, foodAvailable);
              
              if (foodToConsume > 0) {
                const totalHeal = Math.min(foodToConsume * healPerFood, hpNeeded);
                playerHp = Math.min(maxPlayerHp, playerHp + totalHeal);
                inventory[foodId] = foodAvailable - foodToConsume;
                combatStats.foodConsumed += foodToConsume;
                
                if (inventory[foodId] <= 0) {
                  delete inventory[foodId];
                  if (!state.foodDepletedNotified) {
                    state.foodDepletedNotified = true;
                    try {
                      notifyFoodDepleted(player.id, getReadableItemName(foodId));
                    } catch (e) {}
                  }
                }
              }
            }
          }
        }
      }
      
      if (playerHp <= 0) {
        playerDied = true;
        state.combatDebuffs = [];
        debugLog(`[Scheduler] DEATH DETECTED from monster attack for player ${player.id}: HP=${playerHp}, autoEat=${autoEatEnabled}, hasFood=${!!getBestFood(inventory)}`);
      }
    }
  }
  
  // Log combat iterations if any catch-up occurred
  const loopKills = monstersKilled - loopStartKills;
  if (combatIterations > 0 && initialGap > 5000) {
    debugLog(`[Scheduler] Combat loop result for ${player.id}: ${combatIterations} iterations, ${loopKills} kills this loop, total ${monstersKilled} kills`);
    debugLog(`[Scheduler] Loop exit state: playerDied=${playerDied}, isRespawning=${isRespawning}, playerHP=${playerHp}, now=${now}, lastAttack=${playerLastAttackTime}, nextAttackDue=${playerLastAttackTime + weaponAttackSpeed}`);
  }
  
  // Detailed combat analysis log - only log when significant combat occurred (more than 3 attacks or kills)
  const significantCombat = combatStats.playerAttacks >= 3 || loopKills > 0 || combatStats.foodConsumed >= 3;
  if (significantCombat) {
    const playerHitRate = combatStats.playerAttacks > 0 ? ((combatStats.playerHits / combatStats.playerAttacks) * 100).toFixed(1) : '0';
    const monsterHitRate = combatStats.monsterAttacks > 0 ? ((combatStats.monsterHits / combatStats.monsterAttacks) * 100).toFixed(1) : '0';
    const avgPlayerDmg = combatStats.playerHits > 0 ? Math.floor(combatStats.playerTotalDamage / combatStats.playerHits) : 0;
    const avgMonsterDmg = combatStats.monsterHits > 0 ? Math.floor(combatStats.monsterTotalDamage / combatStats.monsterHits) : 0;
    const foodPerKill = loopKills > 0 ? (combatStats.foodConsumed / loopKills).toFixed(1) : 'N/A';
    
    // Calculate expected hit chances (with minimum floor) for debugging
    const expectedPlayerHitChance = calculateHitChance(playerAccuracy, monsterEvasion);
    const expectedMonsterHitChance = calculateHitChance(monsterAccuracy, playerEvasion);
    
    // Combat difficulty warning - check if player is fighting above their level
    const levelDiff = monsterDefenceLevel - attackLevel;
    const combatMismatch = levelDiff > 30 && expectedPlayerHitChance < 30;
    if (combatMismatch && combatStats.foodConsumed > 5) {
      console.log(`[COMBAT-WARNING] Player ${player.username}: Fighting ${activeCombat.monsterId} with significant level disadvantage (Atk ${attackLevel} vs Def ${monsterDefenceLevel}). High food consumption (${combatStats.foodConsumed}) with low hit rate (${expectedPlayerHitChance.toFixed(1)}%)`);
    }
    
    // Display HP values divided by COMBAT_HP_SCALE for readability (e.g., 80 instead of 800)
    const displayPlayerHp = Math.round(playerHp / COMBAT_HP_SCALE);
    const displayMaxPlayerHp = Math.round(maxPlayerHp / COMBAT_HP_SCALE);
    const displayMonsterHp = Math.round(monsterHp / COMBAT_HP_SCALE);
    const displayMonsterMaxHp = Math.round(monsterMaxHp / COMBAT_HP_SCALE);
    
    console.log(`[COMBAT-ANALYSIS] Player ${player.username} vs ${activeCombat.monsterId}:`);
    console.log(`  Player: ${combatStats.playerHits}/${combatStats.playerAttacks} hits (${playerHitRate}%), expected=${expectedPlayerHitChance.toFixed(1)}%, totalDmg=${combatStats.playerTotalDamage}, avgDmg=${avgPlayerDmg}`);
    console.log(`  Monster: ${combatStats.monsterHits}/${combatStats.monsterAttacks} hits (${monsterHitRate}%), expected=${expectedMonsterHitChance.toFixed(1)}%, totalDmg=${combatStats.monsterTotalDamage}, avgDmg=${avgMonsterDmg}`);
    console.log(`  AutoEat: ${combatStats.autoEatTriggers} triggers, ${combatStats.foodConsumed} food consumed, ${foodPerKill} food/kill`);
    console.log(`  Kills: ${loopKills}, PlayerHP: ${displayPlayerHp}/${displayMaxPlayerHp}, MonsterHP: ${displayMonsterHp}/${displayMonsterMaxHp}`);
    console.log(`  Stats: AttLvl=${attackLevel}, DefLvl=${defenceLevel}, StrLvl=${strengthLevel}, MonsterDef=${monsterDefenceLevel}`);
    console.log(`  Calculated: PlayerMaxHit=${playerMaxHit}, MonsterMaxHit=${monsterMaxHitDmg}, DR=${(totalDR*100).toFixed(1)}%, EquipDefBonus=${equipBonuses.defenceBonus}, EquipHpBonus=${equipBonuses.hitpointsBonus}`);
  }
  
  // Apply HP regen from buffs (once per tick, ~1 second)
  if (hpRegenValue > 0 && playerHp > 0 && playerHp < maxPlayerHp) {
    playerHp = Math.min(maxPlayerHp, playerHp + hpRegenValue);
  }
  
  if (membership && activeCombat.monsterId) {
    try {
      const { sharedLoot, notifications } = await processPartyLootSharing(
        player.id,
        membership.partyId,
        activeCombat.monsterId,
        inventory,
        lootGained
      );
      
      if (Object.keys(sharedLoot).length > 0) {
        for (const [k, v] of Object.entries(sharedLoot)) {
          partySharedLootAccum[k] = (partySharedLootAccum[k] || 0) + v;
        }
      }
    } catch (e) {
      debugLog(`[Scheduler] Party loot sharing error:`, e);
    }
  }
  
  state.playerHp = playerHp;
  state.monsterHp = monsterHp;
  state.playerLastAttackTime = playerLastAttackTime;
  state.monsterLastAttackTime = monsterLastAttackTime;
  state.isRespawning = isRespawning;
  state.respawnStartTime = respawnStartTime;
  
  if (playerDied || monstersKilled > 0 || Object.keys(lootGained).length > 0 || brokenItems.length > 0 || state) {
    const getXpForLevel = (level: number): number => {
      let total = 0;
      for (let l = 1; l < level; l++) {
        total += Math.floor(l + 300 * Math.pow(2, l / 7));
      }
      return Math.floor(total / 3.2);
    };
    
    const getLevelFromXp = (xp: number): number => {
      const MAX_LEVEL = 99;
      for (let l = 1; l <= MAX_LEVEL; l++) {
        if (xp < getXpForLevel(l + 1)) return l;
      }
      return MAX_LEVEL;
    };
    
    for (const skillId of ['attack', 'strength', 'defence', 'hitpoints']) {
      const xpGain = xpGained[skillId] || 0;
      if (xpGain > 0) {
        const currentSkill = skills[skillId] || { xp: 0, level: 1 };
        const newXp = currentSkill.xp + xpGain;
        const newLevel = getLevelFromXp(newXp);
        skills[skillId] = { xp: newXp, level: newLevel };
      }
    }
    
    let goldGained = 0;
    const lootKnownIds = cachedItemNames.size > 0 ? new Set(cachedItemNames.keys()) : null;
    for (const [rawItemId, qty] of Object.entries(lootGained)) {
      if (rawItemId === "Gold Coins") {
        goldGained += qty;
      } else {
        const itemId = lootKnownIds
          ? (canonicalizeItemId(rawItemId, lootKnownIds) ?? rawItemId)
          : rawItemId;
        const currentSlots = Object.keys(inventory).length;
        const isNewItem = !inventory[itemId] || inventory[itemId] === 0;
        if (isNewItem && currentSlots >= MAX_INVENTORY_SLOTS) {
          continue;
        }
        inventory[itemId] = (inventory[itemId] || 0) + qty;
      }
    }
    
    const newTotalLevel = Object.values(skills).reduce((sum, s) => sum + s.level, 0);
    
    const currentDebuffs = filterExpiredDebuffs(state.combatDebuffs || [], now);
    
    const updatedActiveCombat = {
      ...activeCombat,
      monsterCurrentHp: monsterHp,
      playerLastAttackTime,
      monsterLastAttackTime,
      combatDebuffs: currentDebuffs,
      limitExpiresAt: now + IDLE_LIMIT_MS,
    };
    
    const validBuffs = activeBuffs.filter(b => b.expiresAt > now);
    
    if (playerDied) {
      const DEATH_BASE_BREAK_CHANCE = 0.10;
      const DEATH_DURABILITY_FACTOR = 0.30;
      const DEATH_RARITY_MULTIPLIERS: Record<string, number> = {
        "Common": 1.0, "Uncommon": 0.8, "Rare": 0.6,
        "Epic": 0.4, "Legendary": 0.2, "Mythic": 0.1,
      };
      const HIGH_RARITY_PROTECTED = ["Epic", "Legendary", "Mythic"];
      
      for (const [slot, itemId] of Object.entries(equipment)) {
        if (!itemId || brokenItems.includes(itemId)) continue;
        
        const durabilityBeforeDeath = equipmentDurability[slot] ?? 100;
        const rarityMatch = itemId.match(/\((Common|Uncommon|Rare|Epic|Legendary|Mythic)\)/);
        const rarity = rarityMatch ? rarityMatch[1] : "Common";
        
        const isProtected = HIGH_RARITY_PROTECTED.includes(rarity) && durabilityBeforeDeath >= 85;
        
        if (isProtected) {
          const durabilityLoss = 5 + Math.random() * 5;
          const newDur = Math.max(MIN_DURABILITY, durabilityBeforeDeath - durabilityLoss);
          equipmentDurability[slot] = newDur;
          debugLog(`[Scheduler] Death penalty (protected): ${slot} durability ${durabilityBeforeDeath.toFixed(0)}% -> ${newDur.toFixed(0)}%`);
          continue;
        }
        
        const durabilityPenaltyFactor = (100 - durabilityBeforeDeath) / 100;
        const rarityMultiplier = DEATH_RARITY_MULTIPLIERS[rarity] || 1.0;
        const directBreakChance = durabilityBeforeDeath >= 60 ? 0 : (DEATH_BASE_BREAK_CHANCE + DEATH_DURABILITY_FACTOR * durabilityPenaltyFactor) * rarityMultiplier;
        
        if (Math.random() < directBreakChance) {
          brokenItems.push(itemId);
          equipment[slot] = null;
          delete equipmentDurability[slot];
          debugLog(`[Scheduler] Death penalty: ${itemId} broke!`);
        } else {
          const durabilityLoss = DEATH_DURABILITY_LOSS_MIN + Math.random() * (DEATH_DURABILITY_LOSS_MAX - DEATH_DURABILITY_LOSS_MIN);
          const newDur = Math.max(MIN_DURABILITY, durabilityBeforeDeath - durabilityLoss);
          equipmentDurability[slot] = newDur;
          debugLog(`[Scheduler] Death penalty: ${slot} durability ${durabilityBeforeDeath.toFixed(0)}% -> ${newDur.toFixed(0)}%`);
        }
      }
    }
    
    const updateData: any = {
      skills,
      inventory,
      equipment,
      equipmentDurability,
      currentHitpoints: playerDied ? 0 : playerHp,
      activeCombat: playerDied ? null : updatedActiveCombat,
      totalLevel: newTotalLevel,
      activeBuffs: validBuffs,
    };
    
    for (const [masteryField, xp] of Object.entries(masteryXpGained)) {
      if (xp > 0) {
        const currentMasteryXp = (player as any)[masteryField] || 0;
        updateData[masteryField] = currentMasteryXp + xp;
      }
    }
    
    if (goldGained > 0) {
      updateData.gold = (player.gold || 0) + goldGained;
      
      const guildContribution = Math.floor(goldGained * GUILD_BANK_CONTRIBUTION.goldFromCombat);
      if (guildContribution > 0) {
        try {
          const playerGuild = await storage.getPlayerGuild(player.id);
          if (playerGuild) {
            await storage.creditGuildBankResources(playerGuild.guild.id, { gold: guildContribution });
          }
        } catch (e) {}
      }
    }
    
    for (const [itemId, qty] of Object.entries(lootGained)) {
      if (itemId !== "Gold Coins" && Math.random() < GUILD_BANK_CONTRIBUTION.materialFromGathering) {
        const category = getItemResourceCategory(itemId);
        if (category && category !== 'gold') {
          try {
            const playerGuild = await storage.getPlayerGuild(player.id);
            if (playerGuild) {
              await storage.creditGuildBankResources(playerGuild.guild.id, { [category]: Math.max(1, Math.floor(qty * 0.5)) });
            }
          } catch (e) {}
        }
      }
    }
    
    const totalCombatXp = (xpGained.attack || 0) + (xpGained.strength || 0) + (xpGained.defence || 0) + (xpGained.hitpoints || 0);
    if (totalCombatXp > 0) {
      try {
        const guildXpContribution = calculateGuildContribution(totalCombatXp, player.totalLevel || 1);
        if (guildXpContribution > 0) {
          await storage.addGuildContribution(player.id, guildXpContribution);
        }
      } catch (e) {}
    }
    
    await storage.updatePlayer(player.id, updateData);
    
    if (playerDied) {
      combatStates.delete(player.id);
      
      try {
        await notifyCombatDeath(player.id);
      } catch (e) {
        console.error("Push notification failed:", e);
      }
      
      if (brokenItems.length > 0) {
        try {
          await notifyItemBreak(player.id, brokenItems);
        } catch (e) {
          console.error("Item break push notification failed:", e);
        }
      }
    }
    
    if (durabilityWarningItems.length > 0) {
      try {
        await notifyDurabilityWarning(player.id, durabilityWarningItems);
      } catch (e) {
        console.error("Durability warning push notification failed:", e);
      }
    }
  }
}

const taskStates = new Map<string, {
  lastProcessedTick: number;
  accumulatedXp: Record<string, number>;
  accumulatedItems: Record<string, number>;
  actionsCompleted: number;
  thisTickCraftedItems?: Record<string, number>;
}>();

async function processTaskTick(player: any, now: number): Promise<void> {
  const activeTask = player.activeTask;
  if (!activeTask) return;
  
  // Skip task processing if combat is also active (shouldn't happen with proper exclusivity)
  if (player.activeCombat) {
    debugLog(`[Scheduler] Skipping task for player ${player.id} - combat is active`);
    return;
  }
  
  // Check if client is actively processing (same logic as combat)
  const MIN_VALID_TIMESTAMP = 1704067200000; // Jan 1, 2024
  
  // Use lastClientTick if valid, otherwise fall back to player.lastSaved or task startTime
  // This handles legacy task data that was started before lastClientTick was added
  let lastClientTick = activeTask.lastClientTick || 0;
  const isLegacyTask = lastClientTick < MIN_VALID_TIMESTAMP;
  if (isLegacyTask) {
    // Legacy task - use lastSaved timestamp as fallback
    // Support both new format (startTime) and legacy format (startedAt as ISO string)
    const lastSavedTime = player.lastSaved ? new Date(player.lastSaved).getTime() : 0;
    let taskStartTime = activeTask.startTime || 0;
    if (!taskStartTime && activeTask.startedAt) {
      taskStartTime = new Date(activeTask.startedAt).getTime();
    }
    lastClientTick = lastSavedTime > MIN_VALID_TIMESTAMP ? lastSavedTime : taskStartTime;
    
    if (lastClientTick < MIN_VALID_TIMESTAMP) {
      // Still no valid timestamp - skip this task
      debugLog(`[Scheduler] Skipping task for player ${player.id} (no valid timestamps)`);
      return;
    }
    // Only log fallback message once when first taking over (not every tick)
    if (!taskStates.has(player.id)) {
      debugLog(`[Scheduler] Using fallback timestamp for legacy task: player ${player.id}, lastClientTick=${lastClientTick}`);
    }
  }
  
  const timeSinceClientTick = now - lastClientTick;
  if (timeSinceClientTick < CLIENT_STALE_THRESHOLD) {
    return; // Client is actively processing task
  }
  
  const OFFLINE_SKIP_THRESHOLD = 5 * 60 * 1000;
  if ((player.isOnline === 0 || player.lastLogoutAt) && timeSinceClientTick > OFFLINE_SKIP_THRESHOLD) {
    return;
  }
  
  // Support both new format (startTime) and legacy format (startedAt as ISO string)
  let taskStartTimeForLimit = activeTask.startTime || 0;
  if (!taskStartTimeForLimit && activeTask.startedAt) {
    taskStartTimeForLimit = new Date(activeTask.startedAt).getTime();
  }

  // V2 queue tasks use queueDurationMs as the hard stop, V1 uses idle limit
  const isV2Task = !!(activeTask as any).queueDurationMs;
  let effectiveExpiry: number;
  if (isV2Task) {
    effectiveExpiry = taskStartTimeForLimit + ((activeTask as any).queueDurationMs as number);
  } else {
    effectiveExpiry = activeTask.limitExpiresAt || (taskStartTimeForLimit + IDLE_LIMIT_MS);
  }
  
  // Check timer expiry — only for connected players
  if (now >= effectiveExpiry) {
    if ((player.isOnline === 0 || player.lastLogoutAt) && timeSinceClientTick > OFFLINE_SKIP_THRESHOLD) {
      return;
    }

    if (isV2Task) {
      const taskQueue = (player as any).taskQueue;
      if (taskQueue && Array.isArray(taskQueue) && taskQueue.length > 0) {
        const nextItem = taskQueue[0];
        const remainingQueue = taskQueue.slice(1);
        if (nextItem.type === 'combat' && nextItem.monsterId) {
          const md = nextItem.monsterData || {};
          const nextCombat: any = {
            monsterId: nextItem.monsterId,
            monsterCurrentHp: (md.maxHp || 10) * 10,
            monsterMaxHp: (md.maxHp || 10) * 10,
            monsterAttackLevel: md.attackLevel || 1,
            monsterStrengthLevel: md.strengthLevel || 1,
            monsterDefenceLevel: md.defenceLevel || 1,
            monsterAttackBonus: md.attackBonus || 0,
            monsterStrengthBonus: md.strengthBonus || 0,
            monsterAttackSpeed: md.attackSpeed || 4000,
            monsterLoot: md.loot || [],
            monsterXpReward: md.xpReward || {},
            monsterSkills: md.skills || [],
            playerLastAttackTime: now,
            monsterLastAttackTime: now,
            combatStartTime: now,
            startTime: now,
            limitExpiresAt: now + (nextItem.durationMs || 6 * 60 * 60 * 1000),
            autoEatEnabled: true,
            autoEatThreshold: 40,
            selectedFood: null,
            autoPotionEnabled: false,
            selectedPotion: null,
            combatStyle: 'balanced',
            queueDurationMs: nextItem.durationMs,
            name: nextItem.name,
            lastClientTick: now,
          };
          await storage.updatePlayer(player.id, { activeTask: null, activeCombat: nextCombat, taskQueue: remainingQueue } as any);
        } else if (nextItem.type === 'study' && nextItem.studyItemId) {
          const nextTask: any = {
            skillId: 'studying',
            actionId: 0,
            startTime: now,
            startedAt: new Date(now).toISOString(),
            duration: nextItem.actionDuration || 10000,
            name: nextItem.studyItemId,
            xpReward: nextItem.xpReward || 0,
            limitExpiresAt: now + (nextItem.durationMs || 6 * 60 * 60 * 1000),
            lastClientTick: now,
            producedCount: 0,
            queueDurationMs: nextItem.durationMs,
            materials: [{ itemId: nextItem.studyItemId, quantity: 1 }],
          };
          await storage.updatePlayer(player.id, { activeTask: nextTask, taskQueue: remainingQueue } as any);
        } else {
          const nextTask: any = {
            skillId: nextItem.skillId,
            actionId: nextItem.actionId,
            startTime: now,
            startedAt: new Date(now).toISOString(),
            duration: nextItem.actionDuration || nextItem.duration || 3000,
            name: nextItem.name,
            xpReward: nextItem.xpReward || 0,
            limitExpiresAt: now + (nextItem.durationMs || 6 * 60 * 60 * 1000),
            lastClientTick: now,
            producedCount: 0,
            queueDurationMs: nextItem.durationMs,
          };
          if (nextItem.materials) nextTask.materials = nextItem.materials;
          if (nextItem.itemId) nextTask.itemId = nextItem.itemId;
          if (nextItem.requiredBait) nextTask.requiredBait = nextItem.requiredBait;
          if (nextItem.baitAmount) nextTask.baitAmount = nextItem.baitAmount;
          await storage.updatePlayer(player.id, { activeTask: nextTask, taskQueue: remainingQueue } as any);
        }
      } else {
        await storage.updatePlayer(player.id, { activeTask: null });
      }
    } else {
      await storage.updatePlayer(player.id, { activeTask: null });
      try {
        await notifyIdleTimerExpired(player.id, (activeTask.name || activeTask.item) || (activeTask.skillId || activeTask.skill));
      } catch (e) {}
    }
    taskStates.delete(player.id);
    return;
  }
  
  let state = taskStates.get(player.id);
  if (!state) {
    debugLog(`[Scheduler] Taking over task for player ${player.id} (client stale for ${Math.round(timeSinceClientTick / 1000)}s)`);
    
    state = {
      lastProcessedTick: lastClientTick,
      accumulatedXp: {},
      accumulatedItems: {},
      actionsCompleted: 0,
    };
    taskStates.set(player.id, state);
  }
  
  // Fetch party skill synergy bonuses for offline skilling
  let synergySpeedBonus = 0;
  let synergyXpBonus = 0;
  try {
    // Find player's party membership
    const [partyMembership] = await db.select()
      .from(partyMembers)
      .where(eq(partyMembers.playerId, player.id));
    
    if (partyMembership) {
      const taskSkillId = activeTask.skillId || activeTask.skill;
      if (taskSkillId) {
        // Get all party members with their current skills (active within last 30 seconds)
        const thirtySecondsAgo = new Date(Date.now() - 30000);
        const allMembers = await db.select({
          playerId: partyMembers.playerId,
          currentSkill: partyMembers.currentSkill,
          currentRegion: partyMembers.currentRegion,
          lastActive: partyMembers.lastActive
        })
        .from(partyMembers)
        .where(eq(partyMembers.partyId, partyMembership.partyId));
        
        const memberStatuses: PartyMemberSkillStatus[] = allMembers
          .filter(m => m.lastActive && new Date(m.lastActive) >= thirtySecondsAgo)
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
    }
  } catch (e) {
    // Silent fail - synergy is not critical
  }
  
  // Process ticks since last processed
  // Support both new format (skillId, name, duration) and legacy format (skill, item, durationMs)
  const baseTaskDuration = activeTask.duration || activeTask.durationMs;
  // Apply synergy speed bonus to reduce task duration (dividing by 1+bonus for speed increase)
  const taskDuration = synergySpeedBonus > 0 
    ? Math.floor(baseTaskDuration / (1 + synergySpeedBonus)) 
    : baseTaskDuration;
  const skillId = activeTask.skillId || activeTask.skill;
  const taskName = activeTask.name || activeTask.item;
  const xpReward = activeTask.xpReward || 0;
  const materials = activeTask.materials as { itemId: string; quantity: number }[] | undefined;
  
  // Validate required fields
  if (!taskDuration || !skillId) {
    debugLog(`[Scheduler] Skipping task for player ${player.id} - missing duration (${taskDuration}) or skillId (${skillId})`);
    return;
  }
  
  let inventory = { ...player.inventory } as Record<string, number>;
  let skills = { ...player.skills };
  
  // Calculate how many actions could have completed
  const timeSinceLastProcess = now - state.lastProcessedTick;
  const possibleActions = Math.floor(timeSinceLastProcess / taskDuration);
  
  if (possibleActions <= 0) {
    return; // Not enough time for a full action
  }
  
  let actionsToProcess = possibleActions;
  let stoppedEarly = false;
  let stopReason: 'materials' | 'items' | 'target_reached' | null = null;
  
  // Check target quantity limit (0 or undefined = infinite)
  const targetQuantity = (activeTask as any).targetQuantity;
  const currentProduced = (activeTask as any).producedCount || 0;
  if (targetQuantity && targetQuantity > 0) {
    const remaining = targetQuantity - currentProduced;
    if (remaining <= 0) {
      stoppedEarly = true;
      stopReason = 'target_reached';
      actionsToProcess = 0;
    } else if (remaining < actionsToProcess) {
      actionsToProcess = remaining;
      stoppedEarly = true;
      stopReason = 'target_reached';
    }
  }
  
  // For studying, check available items
  if (skillId === "studying" && taskName) {
    const itemId = taskName;
    const available = inventory[itemId] || 0;
    if (available < actionsToProcess) {
      actionsToProcess = available;
      if (actionsToProcess === 0) {
        stoppedEarly = true;
        stopReason = 'items';
      }
    }
  }
  
  // For crafting with materials, check available materials
  if (materials && materials.length > 0 && skillId !== "studying") {
    let maxActions = actionsToProcess;
    for (const mat of materials) {
      const available = inventory[mat.itemId] || 0;
      const possibleWithMat = Math.floor(available / mat.quantity);
      maxActions = Math.min(maxActions, possibleWithMat);
    }
    if (maxActions < actionsToProcess) {
      actionsToProcess = maxActions;
      if (actionsToProcess === 0) {
        stoppedEarly = true;
        stopReason = 'materials';
      }
    }
  }
  
  // For firemaking, check available logs (requiredBait)
  const requiredBait = (activeTask as any).requiredBait;
  const baitAmount = (activeTask as any).baitAmount || 1;
  if (skillId === "firemaking" && requiredBait) {
    const available = inventory[requiredBait] || 0;
    const possibleWithBait = Math.floor(available / baitAmount);
    if (possibleWithBait < actionsToProcess) {
      actionsToProcess = possibleWithBait;
      if (actionsToProcess === 0) {
        stoppedEarly = true;
        stopReason = 'materials';
      }
    }
  }
  
  // Process the actions
  if (actionsToProcess > 0) {
    // Calculate XP scaling based on skill level vs content level
    const effectiveSkillId = skillId === "studying" ? "crafting" : skillId;
    const currentSkillData = (skills as Record<string, { xp: number; level: number }>)[effectiveSkillId] || { xp: 0, level: 1 };
    const currentSkillLevel = currentSkillData.level || 1;
    const taskContentLevel = estimateContentLevel(xpReward);
    const taskXpScaling = calculateXpScaling(currentSkillLevel, taskContentLevel);
    
    // Consume materials for studying
    if (skillId === "studying" && taskName) {
      const itemId = taskName;
      inventory[itemId] = (inventory[itemId] || 0) - actionsToProcess;
      if (inventory[itemId] <= 0) delete inventory[itemId];
      
      // Gain Smithing XP for studying (with level scaling + synergy bonus)
      const xpGained = Math.floor(xpReward * actionsToProcess * taskXpScaling.multiplier * (1 + synergyXpBonus));
      state.accumulatedXp["crafting"] = (state.accumulatedXp["crafting"] || 0) + xpGained;
    }
    // Firemaking: consume logs (requiredBait), produce ash (itemId)
    else if (skillId === "firemaking" && requiredBait) {
      // Consume logs
      inventory[requiredBait] = (inventory[requiredBait] || 0) - (baitAmount * actionsToProcess);
      if (inventory[requiredBait] <= 0) delete inventory[requiredBait];
      
      // Produce ash (itemId)
      const ashItem = (activeTask as any).itemId;
      if (ashItem) {
        state.accumulatedItems[ashItem] = (state.accumulatedItems[ashItem] || 0) + actionsToProcess;
        state.thisTickCraftedItems = state.thisTickCraftedItems || {};
        state.thisTickCraftedItems[ashItem] = (state.thisTickCraftedItems[ashItem] || 0) + actionsToProcess;
      }
      
      // Gain firemaking XP (with level scaling + synergy bonus)
      const xpGained = Math.floor(xpReward * actionsToProcess * taskXpScaling.multiplier * (1 + synergyXpBonus));
      state.accumulatedXp[skillId] = (state.accumulatedXp[skillId] || 0) + xpGained;
    }
    // Consume materials for crafting
    else if (materials && materials.length > 0) {
      for (const mat of materials) {
        inventory[mat.itemId] = (inventory[mat.itemId] || 0) - (mat.quantity * actionsToProcess);
        if (inventory[mat.itemId] <= 0) delete inventory[mat.itemId];
      }
      
      // Produce the crafted item - with rarity for equipment
      // Track items produced THIS TICK for database update
      const baseItemName = taskName;
      if (baseItemName) {
        const isEquipment = EQUIPMENT_BASE_IDS.has(baseItemName);
        if (isEquipment) {
          // Equipment: Roll rarity for each action separately
          for (let i = 0; i < actionsToProcess; i++) {
            const rarity = rollRarity();
            const craftedItemKey = `${baseItemName} (${rarity})`;
            state.accumulatedItems[craftedItemKey] = (state.accumulatedItems[craftedItemKey] || 0) + 1;
            // Also track in thisTickCraftedItems for inventory update
            state.thisTickCraftedItems = state.thisTickCraftedItems || {};
            state.thisTickCraftedItems[craftedItemKey] = (state.thisTickCraftedItems[craftedItemKey] || 0) + 1;
          }
        } else {
          // Non-equipment: stack normally
          state.accumulatedItems[baseItemName] = (state.accumulatedItems[baseItemName] || 0) + actionsToProcess;
          state.thisTickCraftedItems = state.thisTickCraftedItems || {};
          state.thisTickCraftedItems[baseItemName] = (state.thisTickCraftedItems[baseItemName] || 0) + actionsToProcess;
        }
      }
      
      // Gain skill XP (with level scaling + synergy bonus)
      const xpGained = Math.floor(xpReward * actionsToProcess * taskXpScaling.multiplier * (1 + synergyXpBonus));
      state.accumulatedXp[skillId] = (state.accumulatedXp[skillId] || 0) + xpGained;
    }
    // Gathering skills (no materials consumed, item produced)
    else {
      const itemName = taskName;
      if (itemName) {
        state.accumulatedItems[itemName] = (state.accumulatedItems[itemName] || 0) + actionsToProcess;
      }
      
      // Gain skill XP (with level scaling + synergy bonus)
      const xpGained = Math.floor(xpReward * actionsToProcess * taskXpScaling.multiplier * (1 + synergyXpBonus));
      state.accumulatedXp[skillId] = (state.accumulatedXp[skillId] || 0) + xpGained;
    }
    
    state.actionsCompleted += actionsToProcess;
    state.lastProcessedTick = state.lastProcessedTick + (actionsToProcess * taskDuration);
    
    // Calculate XP and items gained THIS TICK ONLY (based on task type, with level scaling)
    const thisTickXp = Math.floor(xpReward * actionsToProcess * taskXpScaling.multiplier);
    const xpSkillId = skillId === "studying" ? "crafting" : skillId;
    
    // Update database with THIS TICK's progress only
    const updatedSkills = { ...player.skills };
    if (updatedSkills[xpSkillId]) {
      updatedSkills[xpSkillId] = {
        ...updatedSkills[xpSkillId],
        experience: updatedSkills[xpSkillId].experience + thisTickXp
      };
    }
    
    const updatedInventory = { ...player.inventory };
    
    // Add produced items based on task type (NOT for studying)
    if (skillId !== "studying" && taskName) {
      // For firemaking and crafting with materials - use thisTickCraftedItems
      if ((skillId === "firemaking" || (materials && materials.length > 0)) && state.thisTickCraftedItems) {
        const knownItemIds = cachedItemNames.size > 0 ? new Set(cachedItemNames.keys()) : null;
        for (const [rawItemKey, qty] of Object.entries(state.thisTickCraftedItems)) {
          const itemKey = knownItemIds ? (canonicalizeItemId(rawItemKey, knownItemIds) ?? rawItemKey) : rawItemKey;
          updatedInventory[itemKey] = (updatedInventory[itemKey] || 0) + (qty as number);
        }
        // Clear thisTickCraftedItems after use
        state.thisTickCraftedItems = {};
      } else {
        // Gathering skills - MUST use itemId (the actual item produced)
        // taskName is the action name (e.g., "Normal Tree"), itemId is the product (e.g., "normal_logs")
        const rawItemToAdd = (activeTask as any).itemId;
        if (rawItemToAdd) {
          const knownItemIds = cachedItemNames.size > 0 ? new Set(cachedItemNames.keys()) : null;
          const itemToAdd = knownItemIds ? (canonicalizeItemId(rawItemToAdd, knownItemIds) ?? rawItemToAdd) : rawItemToAdd;
          updatedInventory[itemToAdd] = (updatedInventory[itemToAdd] || 0) + actionsToProcess;
        } else {
          console.error(`[Scheduler] Missing itemId for task ${taskName} in skill ${skillId} - no item added to inventory`);
        }
      }
    }
    
    // Apply material consumption to inventory (from the mutated inventory reference)
    if (skillId === "studying" && taskName) {
      updatedInventory[taskName] = inventory[taskName] || 0;
      if (updatedInventory[taskName] <= 0) delete updatedInventory[taskName];
    } else if (skillId === "firemaking" && requiredBait) {
      // Firemaking consumes logs (requiredBait)
      updatedInventory[requiredBait] = inventory[requiredBait] || 0;
      if (updatedInventory[requiredBait] <= 0) delete updatedInventory[requiredBait];
    } else if (materials && materials.length > 0) {
      for (const mat of materials) {
        updatedInventory[mat.itemId] = inventory[mat.itemId] || 0;
        if (updatedInventory[mat.itemId] <= 0) delete updatedInventory[mat.itemId];
      }
    }
    
    const newProducedCount = (currentProduced || 0) + actionsToProcess;
    
    const updatedTask = stoppedEarly ? null : {
      ...activeTask,
      lastClientTick: state.lastProcessedTick,
      producedCount: newProducedCount,
      limitExpiresAt: now + IDLE_LIMIT_MS,
    };
    
    if (thisTickXp > 0) {
      try {
        const guildXpContribution = calculateGuildContribution(thisTickXp, player.totalLevel || 1);
        if (guildXpContribution > 0) {
          await storage.addGuildContribution(player.id, guildXpContribution);
        }
      } catch (e) {}
    }
    
    await storage.updatePlayer(player.id, {
      skills: updatedSkills,
      inventory: updatedInventory,
      activeTask: updatedTask,
    });
    
    if (stoppedEarly) {
      taskStates.delete(player.id);
      try {
        if (stopReason === 'items') {
          await notifyMaterialsDepleted(player.id, 'study', taskName);
        } else if (stopReason === 'materials') {
          const craftType = skillId === "cooking" ? "cooking" : "craft";
          await notifyMaterialsDepleted(player.id, craftType as 'craft' | 'cooking', taskName || "Item");
        }
      } catch (e) {
        console.error("Materials depleted push notification failed:", e);
      }
    }
  }
  
  if (stoppedEarly && actionsToProcess === 0) {
    await storage.updatePlayer(player.id, { activeTask: null });
    taskStates.delete(player.id);
    
    try {
      if (stopReason === 'items') {
        await notifyMaterialsDepleted(player.id, 'study', taskName);
      } else if (stopReason === 'materials') {
        const craftType = skillId === "cooking" ? "cooking" : "craft";
        await notifyMaterialsDepleted(player.id, craftType as 'craft' | 'cooking', taskName || "Item");
      }
    } catch (e) {
      console.error("Materials depleted push notification failed:", e);
    }
  }
}

// Export function to clear task state when client returns
export function clearTaskState(playerId: string): void {
  taskStates.delete(playerId);
}
