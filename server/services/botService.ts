// @ts-nocheck
import { db } from "../../db";
import { players, guilds, guildMembers, marketListings, gameItems, globalChatMessages, parties, partyMembers, partyInvites, playerAchievements, playerBadges, badges } from "@shared/schema";
import { eq, and, sql, ne, isNull, isNotNull, gt, lt, desc, asc, or, lte, inArray } from "drizzle-orm";
import OpenAI from "openai";
import { getSubClass } from "@shared/subClasses";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const pendingBotResponses: Map<string, { botId: string; questionMessageId: string; respondAt: Date }> = new Map();

const TARGET_BOT_COUNT = 20;

const BOT_ACTIVITIES = [
  "training_attack",
  "training_mining", 
  "combat_verdant",
  "crafting",
  "fishing",
  "idle"
];

const NAME_PREFIXES = [
  "Shadow", "Dark", "Iron", "Storm", "Fire", "Ice", "Thunder", "Dragon",
  "Wolf", "Raven", "Blood", "Night", "Silver", "Golden", "Crystal", "Void",
  "Frost", "Flame", "Steel", "Stone", "Swift", "Silent", "Ancient", "Mystic",
  "Crimson", "Azure", "Ember", "Dawn", "Dusk", "Wild", "Grim", "Noble",
  "Savage", "Fierce", "Royal", "Ghost", "Spirit", "Soul", "Death", "Life",
  "War", "Peace", "Chaos", "Order", "Light", "Shade", "Star", "Moon",
  "Sun", "Wind", "Earth", "Ocean", "Sky", "Forest", "Mountain", "Valley"
];

const NAME_SUFFIXES = [
  "Blade", "Slayer", "Hunter", "Knight", "Warrior", "Mage", "Archer", "Guard",
  "Lord", "Master", "Seeker", "Walker", "Rider", "Bane", "Born", "Heart",
  "Fang", "Claw", "Wing", "Eye", "Hand", "Fist", "Storm", "Fire",
  "Fury", "Rage", "Wrath", "Doom", "Fall", "Rise", "Strike", "Shield",
  "Sword", "Spear", "Axe", "Bow", "Staff", "Hammer", "Dagger", "Lance",
  "Keeper", "Warden", "Sentinel", "Champion", "Legend", "Hero", "Phantom", "Specter",
  "Reaper", "Bringer", "Caller", "Weaver", "Forger", "Breaker", "Crusher", "Render"
];

const SINGLE_NAMES = [
  "Aethon", "Balthazar", "Caelius", "Draven", "Eirik", "Fenris", "Gideon", "Hadrian",
  "Icarus", "Jareth", "Kael", "Lucius", "Magnus", "Nero", "Orion", "Perseus",
  "Quintus", "Ragnar", "Seraph", "Theron", "Ulric", "Varian", "Wulfric", "Xander",
  "Yorick", "Zarek", "Aldric", "Brennan", "Corvin", "Dante", "Eamon", "Flynn",
  "Garrett", "Hector", "Ivan", "Jasper", "Kane", "Leander", "Marcus", "Nash",
  "Osric", "Phoenix", "Quinn", "Roland", "Saxon", "Tristan", "Uther", "Victor",
  "Warren", "Xavier", "Yuri", "Zephyr", "Alara", "Brynn", "Celeste", "Diana",
  "Elena", "Freya", "Gwen", "Helena", "Iris", "Jade", "Kira", "Luna",
  "Maya", "Nova", "Opal", "Petra", "Quinn", "Raven", "Selene", "Thalia",
  "Uma", "Vera", "Willow", "Xena", "Yara", "Zara", "Astrid", "Bianca"
];

const NUMBER_SUFFIXES = ["", "x", "X", "z", "Z", ""];

function generateBotName(): string {
  const style = Math.random();
  
  if (style < 0.4) {
    const prefix = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
    const suffix = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
    const numSuffix = Math.random() < 0.3 ? Math.floor(Math.random() * 99) + 1 : "";
    return `${prefix}${suffix}${numSuffix}`;
  } else if (style < 0.7) {
    const name = SINGLE_NAMES[Math.floor(Math.random() * SINGLE_NAMES.length)];
    const numSuffix = Math.random() < 0.4 ? Math.floor(Math.random() * 999) + 1 : "";
    const letterSuffix = NUMBER_SUFFIXES[Math.floor(Math.random() * NUMBER_SUFFIXES.length)];
    return `${name}${letterSuffix}${numSuffix}`;
  } else {
    const prefix = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
    const name = SINGLE_NAMES[Math.floor(Math.random() * SINGLE_NAMES.length)];
    return `${prefix}${name}`;
  }
}

const SKILL_NAMES = ["attack", "strength", "defence", "hitpoints", "mining", "woodcutting", "fishing", "cooking", "alchemy", "crafting"];
const ALL_REGIONS = ["verdant", "quarry", "dunes", "obsidian", "dragonspire", "frozen_wastes", "void_realm"];
const AVATARS = ["knight", "mage", "archer", "warrior", "rogue", "paladin", "necromancer", "druid"];

function getRandomRarity(): string {
  const roll = Math.random();
  if (roll < 0.55) return "Rare";
  if (roll < 0.85) return "Epic";
  return "Legendary";
}

function addRaritySuffix(itemName: string): string {
  const rarity = getRandomRarity();
  return `${itemName} (${rarity})`;
}

function stripRaritySuffix(itemName: string): string {
  return itemName.replace(/\s*\((Common|Uncommon|Rare|Epic|Legendary|Mythic)\)$/, '');
}

const EQUIPMENT_TIERS = {
  melee: {
    weapon: [
      ["Bronze Sword", "Bronze Dagger", "Bronze Warhammer"],
      ["Iron Sword", "Iron Dagger", "Iron Longsword", "Iron Warhammer"],
      ["Steel Sword", "steel_dagger", "Steel Scimitar", "Steel Warhammer"],
      ["Mithril Sword", "mithril_dagger", "Mithril Battleaxe", "Mithril Warhammer"],
      ["Adamant Sword", "Adamant Warhammer"],
      ["Rune Sword", "rune_dagger", "Rune Warhammer"],
      ["Dragon Sword", "dragon_dagger", "Dragon Warhammer"],
      ["Void Blade", "void_sword", "void_warhammer"],
    ],
    shield: [
      ["Bronze Shield", "Bronze Buckler"],
      ["Iron Shield", "Iron Kite Shield"],
      ["Steel Shield", "Steel Buckler", "Steel Tower Shield"],
      ["Mithril Shield", "Mithril Defender"],
      ["Adamant Shield", "Adamant Fortress"],
      ["Rune Shield"],
      ["Dragon Shield", "Dragonbone Bulwark"],
      ["Dragon Shield"],
    ],
    helmet: ["Bronze Helmet", "Iron Helmet", "Steel Helmet", "Mithril Helmet", "Adamant Helmet", "Rune Helmet", "Dragon Helmet", "void_helm"],
    body: ["Bronze Platebody", "Iron Platebody", "Steel Platebody", "Mithril Platebody", "Adamant Platebody", "Rune Platebody", "Dragon Platebody", "Void Platebody"],
    legs: ["Bronze Platelegs", "Iron Platelegs", "Steel Platelegs", "Mithril Platelegs", "Adamant Platelegs", "Rune Platelegs", "Dragon Platelegs", "void_platelegs"],
    boots: ["Bronze Boots", "Iron Boots", "Steel Boots", "Mithril Boots", "Adamant Boots", "Rune Boots", "Dragon Boots", "void_boots"],
    gloves: ["Bronze Gloves", "Iron Gloves", "Steel Gloves", "Mithril Gloves", "Adamant Gloves", "Rune Gloves", "Dragon Gloves", "Dragon Gloves"],
  },
  ranger: {
    weapon: [
      ["shortbow"],
      ["oak_bow", "hunters_bow"],
      ["willow_bow", "longbow"],
      ["maple_bow", "yew_bow"],
      ["Composite Bow"],
      ["Darkwood Bow"],
      ["Darkwood Bow"],
      ["Darkwood Bow"],
    ],
    helmet: ["leather_hood_t1", "leather_hood_t1", "hardened_hood_t2", "studded_hood_t3", "studded_hood_t3", "studded_hood_t3", "studded_hood_t3", "studded_hood_t3"],
    body: ["leather_vest_t1", "leather_vest_t1", "hardened_vest_t2", "studded_vest_t3", "studded_vest_t3", "studded_vest_t3", "studded_vest_t3", "studded_vest_t3"],
    legs: ["leather_pants_t1", "leather_pants_t1", "hardened_pants_t2", "studded_pants_t3", "studded_pants_t3", "studded_pants_t3", "studded_pants_t3", "studded_pants_t3"],
    boots: ["leather_boots_t1", "leather_boots_t1", "hardened_boots_t2", "studded_boots_t3", "studded_boots_t3", "studded_boots_t3", "studded_boots_t3", "studded_boots_t3"],
    gloves: ["leather_gloves_t1", "leather_gloves_t1", "hardened_gloves_t2", "studded_gloves_t3", "studded_gloves_t3", "studded_gloves_t3", "studded_gloves_t3", "studded_gloves_t3"],
  },
  mage: {
    weapon: [
      ["Oak Staff"],
      ["Willow Staff"],
      ["Maple Staff"],
      ["Yew Staff"],
      ["Magic Staff"],
      ["Elder Staff"],
      ["Dragon Staff"],
      ["Void Staff"],
    ],
    helmet: ["linen_hat_t1", "silk_hood_t2", "mystic_hood_t3", "oracle_hat_t4", "arcane_hat_t5", "divine_hat_t6", "celestial_hat_t7", "void_cloth_hat_t8"],
    body: ["linen_robe_t1", "silk_robe_t2", "mystic_robe_t3", "oracle_robe_t4", "arcane_robe_t5", "divine_robe_t6", "celestial_robe_t7", "void_cloth_robe_t8"],
    legs: ["linen_skirt_t1", "silk_pants_t2", "mystic_pants_t3", "oracle_skirt_t4", "arcane_skirt_t5", "divine_skirt_t6", "celestial_skirt_t7", "void_cloth_skirt_t8"],
    boots: ["linen_sandals_t1", "silk_boots_t2", "mystic_boots_t3", "oracle_sandals_t4", "arcane_sandals_t5", "divine_sandals_t6", "celestial_sandals_t7", "void_cloth_sandals_t8"],
    gloves: ["linen_wraps_t1", "silk_gloves_t2", "mystic_gloves_t3", "oracle_wraps_t4", "arcane_wraps_t5", "divine_wraps_t6", "celestial_wraps_t7", "void_cloth_wraps_t8"],
  }
};

const ACCESSORY_TIERS = {
  amulet: ["Bronze Amulet", "Iron Amulet", "Steel Amulet", "Silver Amulet", "Gold Amulet", "Mithril Amulet", "Adamant Amulet", "Rune Amulet"],
  ring: ["Bronze Ring", "Iron Ring", "Steel Ring", "Silver Ring", "Gold Ring", "Mithril Ring", "Adamant Ring", "Rune Ring"],
};

function getCapeForTier(tierIndex: number): string {
  if (tierIndex <= 2) return "Desert Cape";
  if (tierIndex <= 4) return "Obsidian Cape";
  return "Dragonfire Cape";
}

const TIER_LEVEL_REQUIREMENTS: Record<number, number> = {
  0: 1,
  1: 15,
  2: 30,
  3: 45,
  4: 50,
  5: 70,
  6: 85,
  7: 92,
};

const REGION_TIER_CONFIG: Record<string, { minTier: number; maxTier: number; minLevel: number; maxLevel: number }> = {
  verdant: { minTier: 0, maxTier: 1, minLevel: 1, maxLevel: 20 },
  quarry: { minTier: 1, maxTier: 2, minLevel: 15, maxLevel: 35 },
  dunes: { minTier: 2, maxTier: 3, minLevel: 25, maxLevel: 45 },
  obsidian: { minTier: 3, maxTier: 4, minLevel: 40, maxLevel: 55 },
  dragonspire: { minTier: 4, maxTier: 5, minLevel: 50, maxLevel: 75 },
  frozen_wastes: { minTier: 5, maxTier: 6, minLevel: 70, maxLevel: 90 },
  void_realm: { minTier: 6, maxTier: 7, minLevel: 85, maxLevel: 95 },
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getWeaponForTier(buildType: "melee" | "ranger" | "mage", tierIndex: number): string {
  const clampedTier = Math.min(tierIndex, EQUIPMENT_TIERS[buildType].weapon.length - 1);
  const options = EQUIPMENT_TIERS[buildType].weapon[clampedTier];
  return pickRandom(options);
}

function getShieldForTier(tierIndex: number): string {
  const clampedTier = Math.min(tierIndex, EQUIPMENT_TIERS.melee.shield.length - 1);
  const options = EQUIPMENT_TIERS.melee.shield[clampedTier];
  return pickRandom(options);
}

function getArmorForTier(buildType: "melee" | "ranger" | "mage", slot: "helmet" | "body" | "legs" | "boots" | "gloves", tierIndex: number): string {
  const tierList = EQUIPMENT_TIERS[buildType][slot] as string[];
  const clampedTier = Math.min(tierIndex, tierList.length - 1);
  return tierList[clampedTier];
}

function getRequiredLevelForTier(tierIndex: number): number {
  return TIER_LEVEL_REQUIREMENTS[tierIndex] || 1;
}

function upgradeSkillsForTier(
  skills: Record<string, { level: number; xp: number }>,
  tierIndex: number
): Record<string, { level: number; xp: number }> {
  const requiredLevel = getRequiredLevelForTier(tierIndex);
  const updatedSkills = { ...skills };
  
  // Upgrade all skills to be consistent with tier
  for (const skill of SKILL_NAMES) {
    const currentLevel = updatedSkills[skill]?.level || 1;
    // Combat skills need to match equipment tier
    // Non-combat skills should be at least half of the required level for consistency
    const minLevel = ['attack', 'strength', 'defence', 'hitpoints'].includes(skill)
      ? requiredLevel
      : Math.max(Math.floor(requiredLevel * 0.6), 1);
    
    if (currentLevel < minLevel) {
      const newLevel = minLevel + Math.floor(Math.random() * 8);
      updatedSkills[skill] = {
        level: newLevel,
        xp: Math.floor(Math.pow(newLevel, 2.5) * 100)
      };
    }
  }
  
  return updatedSkills;
}

const REGION_INVENTORY_ITEMS: Record<string, { food: string[]; materials: string[] }> = {
  verdant: {
    food: ["Cooked Chicken", "Cooked Meat", "Cooked Rabbit", "Cooked Trout", "Cooked Shrimp"],
    materials: ["Normal Logs", "Oak Logs", "Copper Ore", "Iron Ore", "Spider Silk", "Feather", "Rabbit Pelt"],
  },
  quarry: {
    food: ["Cooked Salmon", "Cooked Herring", "Meat Pie", "Cooked Cave Fish"],
    materials: ["Iron Ore", "Coal", "Iron Bar", "Steel Bar", "Bat Wing", "Ore Essence"],
  },
  dunes: {
    food: ["Cooked Sand Eel", "Cooked Lobster", "Goblin Kebab", "Orc Roast"],
    materials: ["Gold Ore", "Silver Ore", "Maple Logs", "Sand Essence", "Scorpion Stinger", "Fox Pelt"],
  },
  obsidian: {
    food: ["Cooked Swordfish", "Cooked Tuna", "Spider Soup", "Shadow Stew"],
    materials: ["Mithril Ore", "Gold Bar", "Magic Logs", "Dark Essence", "Shadow Shard", "Obsidian Shard"],
  },
  dragonspire: {
    food: ["Cooked Shark", "Cooked Manta Ray", "Dragon Steak", "Drake Roast", "Wyvern Steak"],
    materials: ["Adamant Ore", "Mithril Bar", "Darkwood Logs", "Drake Scale", "Fire Essence", "Dragon Scale"],
  },
  frozen_wastes: {
    food: ["Cooked Frost Fish", "Cooked Sea Turtle", "Frost Dragon Stew", "Fish Stew"],
    materials: ["Rune Ore", "Adamant Bar", "Ice Logs", "Froststone", "Frozen Crystal", "Frost Heart"],
  },
  void_realm: {
    food: ["Cooked Void Fish", "Void Stew", "Void Feast", "Spirit Feast", "Cooked Spirit Fish"],
    materials: ["Void Crystal", "Void Bar", "Void Logs", "Void Essence", "Soul Gem", "Void Fragment"],
  },
};

const REGION_MONSTERS: Record<string, string[]> = {
  verdant: ["rabbit", "chicken", "deer", "wild_boar", "young_treant", "goblin", "forest_spider", "wolf"],
  quarry: ["mountain_goat", "cave_bat", "rock_beetle", "skeleton", "cave_serpent", "rock_golem", "zombie", "cave_troll"],
  dunes: ["desert_scorpion", "desert_fox", "cactus_beast", "mummy", "orc_grunt", "orc_warrior", "sand_elemental", "sand_worm"],
  obsidian: ["giant_spider", "shadow_wolf", "dark_panther", "shadow_stalker", "hill_giant", "dark_knight", "shadow_demon"],
  dragonspire: ["young_wyvern", "fire_drake", "wyvern", "elder_dragon", "ancient_dragon"],
  frozen_wastes: ["ice_wolf", "frost_tiger", "ice_elemental", "frost_giant", "frost_witch", "ancient_ice_golem", "frost_dragon"],
  void_realm: ["void_wraith", "void_knight", "void_beast", "void_elemental", "void_lord", "void_king"],
};

const SKILL_ACHIEVEMENTS: Record<string, string> = {
  attack: "level_attack",
  strength: "level_attack",
  defence: "level_defence",
  hitpoints: "level_hitpoints",
  mining: "level_mining",
  woodcutting: "level_woodcutting",
  fishing: "level_fishing",
  cooking: "level_cooking",
  alchemy: "level_alchemy",
  crafting: "level_crafting",
};

const GENERAL_ACHIEVEMENTS = [
  "total_kills", "food_eaten", "gold_earned", "items_looted",
  "total_damage", "total_deaths", "combat_xp", "mining_xp", "fishing_xp",
  "woodcutting_xp", "cooking_xp", "crafting_xp", "equipment_repaired",
  "items_equipped", "potions_used", "hp_healed",
  "mining_actions", "fishing_actions", "woodcutting_actions", "cooking_actions",
];

function getWeaponMasteryField(weaponName: string): string | null {
  const base = weaponName.replace(/\s*\((Common|Uncommon|Rare|Epic|Legendary|Mythic)\)$/, '').toLowerCase();
  if (base.includes('staff')) return 'masteryStaff';
  if (base.includes('bow')) return 'masteryBow';
  if (base.includes('dagger')) return 'masteryDagger';
  if (base.includes('warhammer') || base.includes('hammer')) return 'mastery2hWarhammer';
  if (base.includes('battleaxe') || base.includes('axe') || base.includes('cleaver')) return 'mastery2hAxe';
  if (base.includes('sword') || base.includes('blade') || base.includes('scimitar') || base.includes('longsword')) {
    return 'masterySwordShield';
  }
  return 'masterySwordShield';
}

function generateVariedSkills(
  targetLevel: number,
  buildType: "melee" | "ranger" | "mage",
  region: string
): Record<string, { level: number; xp: number }> {
  const skills: Record<string, { level: number; xp: number }> = {};
  
  for (const skill of SKILL_NAMES) {
    let level: number;
    const isCombat = ['attack', 'strength', 'defence', 'hitpoints'].includes(skill);
    
    if (isCombat) {
      level = Math.max(1, targetLevel + Math.floor(Math.random() * 8) - 3);
      if (skill === 'hitpoints') {
        level = Math.max(10, level + Math.floor(Math.random() * 5));
      }
    } else {
      const focusRoll = Math.random();
      if (focusRoll < 0.15) {
        level = 1;
      } else if (focusRoll < 0.35) {
        level = Math.max(1, Math.floor(targetLevel * 0.2) + Math.floor(Math.random() * 5));
      } else if (focusRoll < 0.65) {
        level = Math.max(1, Math.floor(targetLevel * 0.5) + Math.floor(Math.random() * 8) - 3);
      } else {
        level = Math.max(1, targetLevel - Math.floor(Math.random() * 10));
      }
    }
    
    if (region === 'quarry' && skill === 'mining') {
      level = Math.max(level, targetLevel + Math.floor(Math.random() * 5));
    } else if (region === 'verdant' && skill === 'woodcutting') {
      level = Math.max(level, Math.floor(targetLevel * 0.8));
    } else if (['frozen_wastes', 'dragonspire'].includes(region) && skill === 'fishing') {
      level = Math.max(level, Math.floor(targetLevel * 0.6));
    }
    
    if (buildType === 'mage' && skill === 'alchemy') {
      level = Math.max(level, Math.floor(targetLevel * 0.7));
    }
    if (buildType === 'ranger' && skill === 'woodcutting') {
      level = Math.max(level, Math.floor(targetLevel * 0.5));
    }
    
    level = Math.min(99, Math.max(1, level));
    const xp = Math.floor(Math.pow(level, 2.5) * 100);
    skills[skill] = { level, xp };
  }
  
  return skills;
}

function generateRandomSkills(minLevel: number, maxLevel: number): Record<string, { level: number; xp: number }> {
  const skills: Record<string, { level: number; xp: number }> = {};
  for (const skill of SKILL_NAMES) {
    const level = Math.floor(Math.random() * (maxLevel - minLevel + 1)) + minLevel;
    const xp = Math.floor(Math.pow(level, 2.5) * 100);
    skills[skill] = { level, xp };
  }
  return skills;
}

function calculateTotalLevel(skills: Record<string, { level: number; xp: number }>): number {
  return Object.values(skills).reduce((sum, s) => sum + s.level, 0);
}

function getBotAverageCombatLevel(skills: Record<string, { level: number; xp: number }>): number {
  const combatSkills = ['attack', 'strength', 'defence', 'hitpoints'];
  let total = 0;
  let count = 0;
  for (const skill of combatSkills) {
    if (skills[skill]) {
      total += skills[skill].level;
      count++;
    }
  }
  return count > 0 ? Math.floor(total / count) : 1;
}


export class BotService {
  private botPartyJoinTimes: Map<string, number> = new Map();
  private botPartyLeaveAfter: Map<string, number> = new Map();
  private botTaskLockUntil: Map<string, number> = new Map();
  private botLockedTasks: Map<string, Record<string, any>> = new Map();

  private generatePartyStayDuration(): number {
    const minHours = 4;
    const maxHours = 30;
    const hours = minHours + Math.random() * (maxHours - minHours);
    return hours * 60 * 60 * 1000;
  }

  private isNightTime(): boolean {
    const hour = new Date().getUTCHours();
    return hour >= 21 || hour < 6;
  }

  async syncBotPartyCombatState(botId: string, monsterId: string | null, isInCombat: boolean, region?: string): Promise<void> {
    try {
      const botMembership = await db.select({ id: partyMembers.id, partyId: partyMembers.partyId })
        .from(partyMembers)
        .innerJoin(parties, eq(partyMembers.partyId, parties.id))
        .where(and(
          eq(partyMembers.playerId, botId),
          ne(parties.status, 'disbanded'),
        ))
        .limit(1);

      if (botMembership.length === 0) return;

      const updateSet: Record<string, any> = {
        currentMonsterId: monsterId,
        isInCombat: isInCombat ? 1 : 0,
        lastSyncAt: new Date(),
      };
      if (region) {
        updateSet.currentRegion = region;
      }

      await db.update(partyMembers)
        .set(updateSet)
        .where(eq(partyMembers.playerId, botId));
    } catch (error) {
    }
  }


  private getBotPartyId(botId: string): string | null {
    return this._botPartyIdCache.get(botId) || null;
  }

  private async ensureBotPartyIdCached(botId: string): Promise<string | null> {
    const cached = this._botPartyIdCache.get(botId);
    if (cached) return cached;
    try {
      const rows = await db.select({ partyId: partyMembers.partyId })
        .from(partyMembers)
        .innerJoin(parties, eq(partyMembers.partyId, parties.id))
        .where(and(
          eq(partyMembers.playerId, botId),
          ne(parties.status, 'disbanded'),
        ))
        .limit(1);
      if (rows.length > 0) {
        this._botPartyIdCache.set(botId, rows[0].partyId);
        return rows[0].partyId;
      }
      this._botPartyIdCache.delete(botId);
    } catch {}
    return null;
  }

  private _botPartyIdCache: Map<string, string> = new Map();

  private generateTaskLockDuration(): number {
    if (this.isNightTime()) {
      const hours = 8 + Math.random() * 4;
      return hours * 60 * 60 * 1000;
    }
    const hours = 4 + Math.random() * 8;
    return hours * 60 * 60 * 1000;
  }

  private trackBotPartyJoin(botId: string): void {
    this.botPartyJoinTimes.set(botId, Date.now());
    this.botPartyLeaveAfter.set(botId, this.generatePartyStayDuration());
  }

  private trackBotPartyLeave(botId: string): void {
    this.botPartyJoinTimes.delete(botId);
    this.botPartyLeaveAfter.delete(botId);
    this._botPartyIdCache.delete(botId);
  }

  async createBot(): Promise<{ success: boolean; botId?: string; username?: string; error?: string }> {
    try {
      let username = generateBotName();
      let attempts = 0;
      
      while (attempts < 10) {
        const existing = await db.select({ id: players.id })
          .from(players)
          .where(eq(players.username, username))
          .limit(1);
        
        if (existing.length === 0) break;
        username = generateBotName();
        attempts++;
      }
      
      if (attempts >= 10) {
        username = `${generateBotName()}${Date.now() % 10000}`;
      }
      
      const region = pickRandom(ALL_REGIONS);
      const regionConfig = REGION_TIER_CONFIG[region] || REGION_TIER_CONFIG.verdant;
      const tierIndex = Math.floor(Math.random() * (regionConfig.maxTier - regionConfig.minTier + 1)) + regionConfig.minTier;
      const baseLevel = TIER_LEVEL_REQUIREMENTS[tierIndex] || 1;
      const levelVariance = Math.floor(Math.random() * 10) - 3;
      const targetLevel = Math.max(regionConfig.minLevel, Math.min(regionConfig.maxLevel, baseLevel + levelVariance));
      
      const buildRoll = Math.random();
      const buildType: "melee" | "ranger" | "mage" = buildRoll < 0.5 ? "melee" : buildRoll < 0.75 ? "ranger" : "mage";
      
      const skills = generateVariedSkills(targetLevel, buildType, region);
      const totalLevel = calculateTotalLevel(skills);
      const gold = Math.floor(5000 + (targetLevel / 95) * 45000 + Math.random() * 5000);
      const avatar = pickRandom(AVATARS);
      const hasAmulet = Math.random() < 0.6;
      const hasCape = tierIndex >= 5 ? true : Math.random() < 0.9;
      
      const weaponBase = getWeaponForTier(buildType, tierIndex);
      const equipment: Record<string, string> = {
        weapon: addRaritySuffix(weaponBase),
        helmet: addRaritySuffix(getArmorForTier(buildType, "helmet", tierIndex)),
        body: addRaritySuffix(getArmorForTier(buildType, "body", tierIndex)),
        legs: addRaritySuffix(getArmorForTier(buildType, "legs", tierIndex)),
        boots: addRaritySuffix(getArmorForTier(buildType, "boots", tierIndex)),
        gloves: addRaritySuffix(getArmorForTier(buildType, "gloves", tierIndex)),
        ring: addRaritySuffix(ACCESSORY_TIERS.ring[Math.min(tierIndex, ACCESSORY_TIERS.ring.length - 1)]),
      };
      
      if (buildType === "melee") {
        equipment.shield = addRaritySuffix(getShieldForTier(tierIndex));
      }
      
      if (hasAmulet) {
        equipment.amulet = addRaritySuffix(ACCESSORY_TIERS.amulet[Math.min(tierIndex, ACCESSORY_TIERS.amulet.length - 1)]);
      }
      
      if (hasCape) {
        equipment.cape = getCapeForTier(tierIndex);
      }
      
      const equipmentDurability: Record<string, number> = {};
      for (const slot of Object.keys(equipment)) {
        equipmentDurability[slot] = Math.floor(Math.random() * 31) + 70;
      }
      
      const masteryField = getWeaponMasteryField(weaponBase);
      const masteryXp = Math.floor(targetLevel * targetLevel * (50 + Math.random() * 100));
      const masteryValues: Record<string, number> = {};
      if (masteryField) {
        masteryValues[masteryField] = masteryXp;
      }
      
      const levelScale = targetLevel / 95;
      const combatSessionStats = {
        monstersKilled: Math.floor(50 + levelScale * 8000 + Math.random() * 2000),
        foodEaten: Math.floor(5 + levelScale * 500 + Math.random() * 100),
        deaths: Math.floor(Math.random() * (3 + levelScale * 15)),
        goldEarned: Math.floor(300 + levelScale * 50000 + Math.random() * 10000),
        actionsCompleted: Math.floor(30 + levelScale * 5000 + Math.random() * 1000),
        itemsCollected: Math.floor(20 + levelScale * 3000 + Math.random() * 500),
        currentTask: pickRandom(BOT_ACTIVITIES),
        botOnlineStatus: Math.random() < 0.6,
      };
      
      const regionItems = REGION_INVENTORY_ITEMS[region] || REGION_INVENTORY_ITEMS.verdant;
      const inventory: Record<string, number> = {};
      const foodCount = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < foodCount; i++) {
        const food = pickRandom(regionItems.food);
        inventory[food] = (inventory[food] || 0) + Math.floor(Math.random() * 50) + 5;
      }
      const matCount = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < matCount; i++) {
        const mat = pickRandom(regionItems.materials);
        inventory[mat] = (inventory[mat] || 0) + Math.floor(Math.random() * 80) + 10;
      }
      
      const showBadge = Math.random() < 0.7 && targetLevel >= 15;
      
      const botUserId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const [newBot] = await db.insert(players).values({
        userId: botUserId,
        username,
        avatar,
        skills,
        gold,
        totalLevel,
        currentRegion: region,
        isBot: 1,
        botLastActivity: new Date(),
        currentHitpoints: 100 + (skills.hitpoints?.level || 10) * 10,
        equipment,
        equipmentDurability,
        combatSessionStats,
        inventory,
        ...(masteryField ? { [masteryField]: masteryXp } : {}),
      }).returning();
      
      await this.generateBotAchievements(newBot.id, targetLevel, region);
      
      if (showBadge) {
        await this.assignBotBadges(newBot.id, targetLevel);
      }
      
      console.log(`[BotService] Created bot: ${username} (Level ${totalLevel}, Region: ${region}, Tier: ${tierIndex}, Build: ${buildType})`);
      
      return { success: true, botId: newBot.id, username };
    } catch (error) {
      console.error("[BotService] Failed to create bot:", error);
      return { success: false, error: String(error) };
    }
  }
  
  private async generateBotAchievements(botId: string, targetLevel: number, region: string): Promise<void> {
    try {
      const levelScale = targetLevel / 95;
      const achievementRows: Array<{ playerId: string; achievementId: string; progress: number; completedTiers: number[] }> = [];
      
      const regionMonsters = REGION_MONSTERS[region] || REGION_MONSTERS.verdant;
      const monsterCount = Math.min(regionMonsters.length, Math.floor(Math.random() * 4) + 2);
      for (let i = 0; i < monsterCount; i++) {
        const monster = regionMonsters[i];
        const achId = `kill_${monster}`;
        const kills = Math.floor(50 + levelScale * 5000 + Math.random() * 2000);
        const tiers: number[] = [];
        const thresholds = [100, 500, 2500, 10000, 50000];
        for (let t = 0; t < thresholds.length; t++) {
          if (kills >= thresholds[t]) tiers.push(t + 1);
        }
        achievementRows.push({ playerId: botId, achievementId: achId, progress: kills, completedTiers: tiers });
      }
      
      const regionAchId = `region_kills_${region}`;
      const regionKills = Math.floor(100 + levelScale * 10000 + Math.random() * 3000);
      const regionTiers: number[] = [];
      const regionThresholds = [100, 500, 2500, 10000, 50000];
      for (let t = 0; t < regionThresholds.length; t++) {
        if (regionKills >= regionThresholds[t]) regionTiers.push(t + 1);
      }
      achievementRows.push({ playerId: botId, achievementId: regionAchId, progress: regionKills, completedTiers: regionTiers });
      
      const totalKills = Math.floor(200 + levelScale * 15000 + Math.random() * 5000);
      achievementRows.push({ playerId: botId, achievementId: "total_kills", progress: totalKills, completedTiers: [] });
      
      const foodEaten = Math.floor(10 + levelScale * 800 + Math.random() * 200);
      achievementRows.push({ playerId: botId, achievementId: "food_eaten", progress: foodEaten, completedTiers: [] });
      
      const goldEarned = Math.floor(1000 + levelScale * 100000 + Math.random() * 20000);
      achievementRows.push({ playerId: botId, achievementId: "gold_earned", progress: goldEarned, completedTiers: [] });
      
      const generalCount = Math.floor(Math.random() * 5) + 3;
      const shuffled = [...GENERAL_ACHIEVEMENTS].sort(() => Math.random() - 0.5).slice(0, generalCount);
      for (const achId of shuffled) {
        if (achievementRows.some(r => r.achievementId === achId)) continue;
        const progress = Math.floor(50 + levelScale * 3000 + Math.random() * 1000);
        achievementRows.push({ playerId: botId, achievementId: achId, progress, completedTiers: [] });
      }
      
      if (targetLevel >= 10) {
        achievementRows.push({ playerId: botId, achievementId: "total_level", progress: targetLevel * SKILL_NAMES.length, completedTiers: [] });
      }
      
      const existingAchievements = await db.select({ id: sql<string>`id` })
        .from(sql`achievements`)
        .limit(200);
      const validAchIds = new Set(existingAchievements.map((a: any) => a.id));
      
      const validRows = achievementRows.filter(r => validAchIds.has(r.achievementId));
      
      if (validRows.length > 0) {
        for (const row of validRows) {
          try {
            await db.insert(playerAchievements).values({
              playerId: row.playerId,
              achievementId: row.achievementId,
              progress: row.progress,
              completedTiers: row.completedTiers,
            });
          } catch {
          }
        }
      }
    } catch (error) {
      console.error(`[BotService] Failed to generate achievements for bot ${botId}:`, error);
    }
  }
  
  private async assignBotBadges(botId: string, targetLevel: number): Promise<number> {
    const EXCLUDED_BADGES = new Set([
      'alpha_upholder', 'alpha_tester', 'alpha_tester_v1', 'beta_tester',
      'bug_hunter', 'community_hero', 'itchio_supporter', 'language_master', 'supporter'
    ]);

    try {
      let badgeCount: number;
      let tierFilter: number;

      if (targetLevel <= 30) {
        if (Math.random() < 0.3) return 0;
        badgeCount = Math.floor(Math.random() * 3);
        tierFilter = 3;
      } else if (targetLevel <= 50) {
        badgeCount = 3 + Math.floor(Math.random() * 4);
        tierFilter = 4;
      } else if (targetLevel <= 70) {
        badgeCount = 6 + Math.floor(Math.random() * 5);
        tierFilter = 4;
      } else if (targetLevel <= 85) {
        badgeCount = 10 + Math.floor(Math.random() * 6);
        tierFilter = 5;
      } else {
        badgeCount = 15 + Math.floor(Math.random() * 6);
        tierFilter = 5;
      }

      if (badgeCount === 0) return 0;

      const availableBadges = await db.select({ id: badges.id })
        .from(badges)
        .orderBy(sql`RANDOM()`)
        .limit(80);

      if (availableBadges.length === 0) return 0;

      const suitableBadges = availableBadges.filter(b => {
        if (EXCLUDED_BADGES.has(b.id)) return false;
        const match = b.id.match(/_t(\d+)$/);
        if (!match) return true;
        return parseInt(match[1]) <= tierFilter;
      });

      if (suitableBadges.length === 0) return 0;

      const selected = suitableBadges.slice(0, Math.min(badgeCount, suitableBadges.length));
      let insertedCount = 0;

      for (const badge of selected) {
        try {
          await db.insert(playerBadges).values({
            playerId: botId,
            badgeId: badge.id,
          });
          insertedCount++;
        } catch {
        }
      }

      if (insertedCount > 0) {
        const displayBadge = pickRandom(selected);
        await db.update(players)
          .set({ selectedBadge: displayBadge.id })
          .where(eq(players.id, botId));
      }

      return insertedCount;
    } catch (error) {
      console.error(`[BotService] Failed to assign badges for bot ${botId}:`, error);
      return 0;
    }
  }

  async backfillBotBadges(): Promise<{ assigned: number; skipped: number }> {
    let assigned = 0;
    let skipped = 0;

    try {
      const allBots = await db.select({
        id: players.id,
        totalLevel: players.totalLevel,
        selectedBadge: players.selectedBadge,
        skills: players.skills,
      })
        .from(players)
        .where(eq(players.isBot, 1));

      if (allBots.length === 0) {
        return { assigned, skipped };
      }

      const botIds = allBots.map(b => b.id);
      if (botIds.length > 0) {
        await db.delete(playerBadges).where(inArray(playerBadges.playerId, botIds));
        await db.update(players)
          .set({ selectedBadge: null })
          .where(inArray(players.id, botIds));
      }

      for (const bot of allBots) {
        const skills = bot.skills as Record<string, { level: number; xp: number }>;
        const avgLevel = getBotAverageCombatLevel(skills);
        const count = await this.assignBotBadges(bot.id, avgLevel);
        if (count > 0) {
          assigned++;
        } else {
          skipped++;
        }
      }

      console.log(`[BotService] Badge backfill complete: ${assigned} bots got badges, ${skipped} bots with 0 badges`);
    } catch (error) {
      console.error('[BotService] Badge backfill error:', error);
    }

    return { assigned, skipped };
  }

  async createMultipleBots(count: number): Promise<{ created: number; failed: number }> {
    let created = 0;
    let failed = 0;
    
    for (let i = 0; i < count; i++) {
      const result = await this.createBot();
      if (result.success) {
        created++;
      } else {
        failed++;
      }
    }
    
    console.log(`[BotService] Batch creation complete: ${created} created, ${failed} failed`);
    return { created, failed };
  }
  
  async deleteBot(botId: string): Promise<boolean> {
    try {
      this.trackBotPartyLeave(botId);
      this.botTaskLockUntil.delete(botId);
      this.botLockedTasks.delete(botId);
      await db.delete(playerAchievements).where(eq(playerAchievements.playerId, botId));
      await db.delete(playerBadges).where(eq(playerBadges.playerId, botId));
      await db.delete(guildMembers).where(eq(guildMembers.playerId, botId));
      await db.delete(marketListings).where(eq(marketListings.sellerId, botId));
      await db.delete(globalChatMessages).where(eq(globalChatMessages.playerId, botId));
      await db.delete(players).where(eq(players.id, botId));
      return true;
    } catch (error) {
      console.error("[BotService] Failed to delete bot:", error);
      return false;
    }
  }
  
  async getBotCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(players)
      .where(eq(players.isBot, 1));
    return result[0]?.count || 0;
  }
  
  async ensureBotCount(): Promise<void> {
    const currentCount = await this.getBotCount();
    
    if (currentCount < TARGET_BOT_COUNT) {
      const toCreate = TARGET_BOT_COUNT - currentCount;
      console.log(`[BotService] Bot count ${currentCount} < ${TARGET_BOT_COUNT}, creating ${toCreate} bots`);
      await this.createMultipleBots(toCreate);
    } else if (currentCount > TARGET_BOT_COUNT) {
      const toDelete = currentCount - TARGET_BOT_COUNT;
      console.log(`[BotService] Bot count ${currentCount} > ${TARGET_BOT_COUNT}, deleting ${toDelete} bots`);
      
      const botsToDelete = await db.select({ id: players.id })
        .from(players)
        .where(eq(players.isBot, 1))
        .orderBy(asc(players.botLastActivity))
        .limit(toDelete);
      
      for (const bot of botsToDelete) {
        await this.deleteBot(bot.id);
      }
    }
  }
  
  async getRandomBot(): Promise<typeof players.$inferSelect | null> {
    const bots = await db.select()
      .from(players)
      .where(eq(players.isBot, 1))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return bots[0] || null;
  }
  
  async updateBotActivity(bot: typeof players.$inferSelect): Promise<void> {
    const currentTask = BOT_ACTIVITIES[Math.floor(Math.random() * BOT_ACTIVITIES.length)];
    const botOnlineStatus = Math.random() < 0.6;
    
    const currentStats = (bot.combatSessionStats as Record<string, any>) || {};
    const updatedStats = {
      ...currentStats,
      currentTask,
      botOnlineStatus,
    };
    
    await db.update(players)
      .set({ 
        combatSessionStats: updatedStats,
        botLastActivity: new Date()
      })
      .where(eq(players.id, bot.id));
  }
  
  async performBotMarketActivity(): Promise<void> {
    const bot = await this.getRandomBot();
    if (!bot) return;
    
    await this.botListItem(bot);
    
    await db.update(players)
      .set({ botLastActivity: new Date() })
      .where(eq(players.id, bot.id));
  }
  
  async performBotMarketBuying(): Promise<void> {
    const bot = await this.getRandomBot();
    if (!bot) return;
    
    await this.botBuyItem(bot);
    
    await db.update(players)
      .set({ botLastActivity: new Date() })
      .where(eq(players.id, bot.id));
  }
  
  private async botListItem(bot: typeof players.$inferSelect): Promise<void> {
    if (Math.random() > 0.25) return;
    
    const skills = bot.skills as Record<string, { level: number; xp: number }>;
    const avgCombatLevel = getBotAverageCombatLevel(skills);
    
    const itemTypeRoll = Math.random();
    let itemType: string;
    let quantity: number;
    let itemQuery;
    
    if (itemTypeRoll < 0.40) {
      itemType = 'material';
      const matRoll = Math.random();
      if (matRoll < 0.3) quantity = Math.floor(Math.random() * 200) + 50;
      else if (matRoll < 0.7) quantity = Math.floor(Math.random() * 800) + 200;
      else quantity = Math.floor(Math.random() * 3000) + 1000;
      itemQuery = await db.select()
        .from(gameItems)
        .where(
          and(
            eq(gameItems.type, 'material'),
            gt(gameItems.vendorPrice, 0),
            isNotNull(gameItems.icon),
            or(
              lte(gameItems.levelRequired, avgCombatLevel),
              isNull(gameItems.levelRequired)
            )
          )
        )
        .orderBy(sql`RANDOM()`)
        .limit(1);
    } else if (itemTypeRoll < 0.55) {
      itemType = 'food';
      const foodRoll = Math.random();
      if (foodRoll < 0.3) quantity = Math.floor(Math.random() * 100) + 30;
      else if (foodRoll < 0.7) quantity = Math.floor(Math.random() * 500) + 100;
      else quantity = Math.floor(Math.random() * 2000) + 500;
      itemQuery = await db.select()
        .from(gameItems)
        .where(
          and(
            eq(gameItems.type, 'food'),
            gt(gameItems.vendorPrice, 0),
            isNotNull(gameItems.icon),
            or(
              lte(gameItems.levelRequired, avgCombatLevel),
              isNull(gameItems.levelRequired)
            )
          )
        )
        .orderBy(sql`RANDOM()`)
        .limit(1);
    } else if (itemTypeRoll < 0.75) {
      itemType = 'potion';
      const potRoll = Math.random();
      if (potRoll < 0.3) quantity = Math.floor(Math.random() * 30) + 10;
      else if (potRoll < 0.7) quantity = Math.floor(Math.random() * 100) + 30;
      else quantity = Math.floor(Math.random() * 300) + 100;
      itemQuery = await db.select()
        .from(gameItems)
        .where(
          and(
            eq(gameItems.type, 'potion'),
            gt(gameItems.vendorPrice, 0),
            isNotNull(gameItems.icon),
            or(
              lte(gameItems.levelRequired, avgCombatLevel),
              isNull(gameItems.levelRequired)
            )
          )
        )
        .orderBy(sql`RANDOM()`)
        .limit(1);
    } else {
      itemType = 'equipment';
      quantity = 1;
      itemQuery = await db.select()
        .from(gameItems)
        .where(
          and(
            eq(gameItems.type, 'equipment'),
            gt(gameItems.vendorPrice, 0),
            isNotNull(gameItems.icon),
            or(
              lte(gameItems.levelRequired, avgCombatLevel),
              isNull(gameItems.levelRequired)
            )
          )
        )
        .orderBy(sql`RANDOM()`)
        .limit(1);
    }
    
    if (itemQuery.length === 0) {
      console.log(`[BotService] No valid ${itemType} items found for bot ${bot.username} (level ${avgCombatLevel})`);
      return;
    }
    
    const item = itemQuery[0];
    
    if (!item.id || !item.name || item.vendorPrice === null || item.vendorPrice === undefined) {
      console.warn(`[BotService] Invalid item found: id=${item.id}, name=${item.name}, vendorPrice=${item.vendorPrice}`);
      return;
    }
    
    const basePrice = item.vendorPrice;
    const itemLevel = item.levelRequired || 1;
    
    // Calculate price multiplier based on item type, tier (level), and rarity
    let priceMultiplier: number;
    let rarity: string | null = null;
    
    const botSeed = parseInt(bot.id.replace(/\D/g, '').slice(-4) || '50', 10) % 100 / 100;
    const personalBias = 0.6 + botSeed * 0.8;
    
    if (itemType === 'material') {
      const tierBonus = Math.min(3, Math.floor(itemLevel / 20));
      const baseMultiplier = 40 + tierBonus * 27;
      const variance = (Math.random() - 0.5) * 20;
      priceMultiplier = Math.max(40, Math.min(120, (baseMultiplier + variance) * personalBias));
    } else if (itemType === 'equipment') {
      // Equipment: 100-1000x based on tier and rarity, clamped
      const rarityRoll = Math.random();
      if (rarityRoll < 0.55) {
        rarity = 'Epic';
      } else if (rarityRoll < 0.93) {
        rarity = 'Legendary';
      } else {
        rarity = 'Mythic';
      }
      
      const tierBonus = Math.min(4, Math.floor(itemLevel / 15));
      const baseMultiplier = 200 + tierBonus * 150;
      
      // Rarity bonus
      const rarityBonus = rarity === 'Epic' ? 1 : rarity === 'Legendary' ? 1.8 : 4.5; // Mythic ~1.85x more expensive
      const rawMultiplier = baseMultiplier * rarityBonus * (0.9 + Math.random() * 0.2);
      const maxClamp = rarity === 'Mythic' ? 2500 : 1000;
      priceMultiplier = Math.max(100, Math.min(maxClamp, rawMultiplier)); // Mythic up to 2500x
    } else if (itemType === 'food') {
      const tierBonus = Math.min(3, Math.floor(itemLevel / 20));
      const baseMultiplier = 30 + tierBonus * 20;
      const variance = (Math.random() - 0.5) * 15;
      priceMultiplier = Math.max(20, Math.min(100, (baseMultiplier + variance) * personalBias));
    } else {
      const tierBonus = Math.min(3, Math.floor(itemLevel / 25));
      const baseMultiplier = 150 + tierBonus * 150;
      const variance = (Math.random() - 0.5) * 40;
      priceMultiplier = Math.max(150, Math.min(600, (baseMultiplier + variance) * personalBias));
    }
    
    const price = Math.floor(basePrice * priceMultiplier);
    
    let itemId = item.id;
    if (itemType === 'equipment' && rarity) {
      itemId = `${item.id} (${rarity})`;
    }
    
    try {
      await db.insert(marketListings).values({
        sellerId: bot.id,
        itemId,
        quantity,
        pricePerItem: price,
      });
      
      console.log(`[BotService] Bot ${bot.username} listed ${quantity}x ${itemId} for ${price}g each`);
    } catch (error) {
      console.warn(`[BotService] Failed to list item ${itemId} for bot ${bot.username}:`, error);
    }
  }
  
  private async botBuyItem(bot: typeof players.$inferSelect): Promise<void> {
    if (Math.random() > 0.30) return;
    
    const skills = bot.skills as Record<string, { level: number; xp: number }>;
    const avgCombatLevel = getBotAverageCombatLevel(skills);
    
    const budgetPercent = 0.05 + Math.random() * 0.10;
    const budget = Math.min(Math.floor(bot.gold * budgetPercent), 50000);
    
    if (budget < 10) return;
    
    const listings = await db.select()
      .from(marketListings)
      .where(
        and(
          ne(marketListings.sellerId, bot.id),
          lte(marketListings.pricePerItem, budget),
          isNull(marketListings.enhancementData)
        )
      )
      .orderBy(sql`RANDOM()`)
      .limit(5);
    
    if (listings.length === 0) return;
    
    const listing = listings[Math.floor(Math.random() * listings.length)];
    const baseItemId = listing.itemId.replace(/\s*\(.*?\)$/, '');
    const [itemMeta] = await db.select({ type: gameItems.type, vendorPrice: gameItems.vendorPrice, levelRequired: gameItems.levelRequired }).from(gameItems).where(eq(gameItems.id, baseItemId)).limit(1);
    const itemType = itemMeta?.type || 'material';

    // Bot price cap: skip listings priced more than 5× the bot's own reference sell price.
    // Uses the same pricing formula as botListItem (without random variance to produce a stable cap).
    if (itemMeta && itemMeta.vendorPrice !== null && itemMeta.vendorPrice !== undefined && itemMeta.vendorPrice > 0) {
      const basePrice = itemMeta.vendorPrice;
      const itemLevel = itemMeta.levelRequired || 1;
      const botSeed = parseInt(bot.id.replace(/\D/g, '').slice(-4) || '50', 10) % 100 / 100;
      const personalBias = 0.6 + botSeed * 0.8;
      let referenceMultiplier: number;
      if (itemType === 'material') {
        const tierBonus = Math.min(3, Math.floor(itemLevel / 20));
        const baseMultiplier = 40 + tierBonus * 27;
        referenceMultiplier = Math.max(40, Math.min(120, baseMultiplier * personalBias));
      } else if (itemType === 'equipment') {
        // Use the conservative Epic-tier baseline (no rarity bonus, no random variance)
        const tierBonus = Math.min(4, Math.floor(itemLevel / 15));
        const baseMultiplier = 200 + tierBonus * 150;
        referenceMultiplier = Math.max(100, Math.min(1000, baseMultiplier * personalBias));
      } else if (itemType === 'food') {
        const tierBonus = Math.min(3, Math.floor(itemLevel / 20));
        const baseMultiplier = 30 + tierBonus * 20;
        referenceMultiplier = Math.max(20, Math.min(100, baseMultiplier * personalBias));
      } else {
        // potion / other
        const tierBonus = Math.min(3, Math.floor(itemLevel / 25));
        const baseMultiplier = 150 + tierBonus * 150;
        referenceMultiplier = Math.max(150, Math.min(600, baseMultiplier * personalBias));
      }
      const botReferencePricePerUnit = Math.floor(basePrice * referenceMultiplier);
      const priceCapPerUnit = botReferencePricePerUnit * 5;
      if (listing.pricePerItem > priceCapPerUnit) {
        return;
      }
    }
    // If no vendor price is available, no cap can be computed — allow the purchase

    const typeMaxQty = itemType === 'equipment' ? 1 : itemType === 'potion' ? 15 : itemType === 'food' ? 30 : 50;
    const maxAffordable = Math.floor(budget / listing.pricePerItem);
    const buyQuantity = Math.min(listing.quantity, maxAffordable, typeMaxQty, Math.floor(Math.random() * typeMaxQty) + 1);
    
    if (buyQuantity <= 0) return;
    
    const totalPrice = listing.pricePerItem * buyQuantity;
    
    if (totalPrice > bot.gold || totalPrice > 50000) return;
    if (bot.gold - totalPrice < bot.gold * 0.5) return;
    
    try {
      if (buyQuantity >= listing.quantity) {
        await db.delete(marketListings)
          .where(eq(marketListings.id, listing.id));
      } else {
        await db.update(marketListings)
          .set({ quantity: listing.quantity - buyQuantity })
          .where(eq(marketListings.id, listing.id));
      }
      
      const inventory = bot.inventory as Record<string, number> || {};
      const newInventory = { 
        ...inventory, 
        [listing.itemId]: (inventory[listing.itemId] || 0) + buyQuantity 
      };
      
      await db.update(players)
        .set({ 
          inventory: newInventory,
          gold: bot.gold - totalPrice
        })
        .where(eq(players.id, bot.id));
      
      const [seller] = await db.select()
        .from(players)
        .where(eq(players.id, listing.sellerId))
        .limit(1);
      
      if (seller) {
        await db.update(players)
          .set({ gold: seller.gold + totalPrice })
          .where(eq(players.id, seller.id));
      }
      
      console.log(`[BotService] Bot ${bot.username} bought ${buyQuantity}x ${listing.itemId} for ${totalPrice}g`);
    } catch (error) {
      // Ignore errors silently
    }
  }
  
  async getBotChatContext(bot: typeof players.$inferSelect): Promise<string> {
    const skills = bot.skills as Record<string, { level: number; xp: number }>;
    const stats = (bot.combatSessionStats as Record<string, any>) || {};
    const currentTask = stats.currentTask || 'idle';
    const region = bot.currentRegion || 'verdant';
    
    const skillLevels = Object.entries(skills)
      .map(([name, data]) => `${name}: ${data.level}`)
      .join(', ');
    
    let marketContext = '';
    try {
      const expensiveListings = await db.select({
        itemId: marketListings.itemId,
        price: marketListings.pricePerItem,
      })
        .from(marketListings)
        .orderBy(desc(marketListings.pricePerItem))
        .limit(10);
      
      if (expensiveListings.length > 0) {
        const randomListings = expensiveListings
          .sort(() => Math.random() - 0.5)
          .slice(0, 3);
        marketContext = randomListings
          .map(l => `${l.itemId.replace(/\s*\(.*?\)/, '')} ${l.price}g`)
          .join(', ');
      }
    } catch (e) {
      // Ignore market query errors
    }
    
    return `Region: ${region}, Activity: ${currentTask}, Skills: ${skillLevels}${marketContext ? `, Market prices: ${marketContext}` : ''}`;
  }
  
  addRandomTypos(message: string): string {
    if (Math.random() > 0.3) return message;
    
    const typoReplacements: Record<string, string> = {
      'thanks': 'thx',
      'thank you': 'ty',
      'i dont know': 'idk',
      'i don\'t know': 'idk',
      'dont know': 'dk',
      'going to': 'gonna',
      'want to': 'wanna',
      'got to': 'gotta',
      'because': 'cuz',
      'you': 'u',
      'your': 'ur',
      'are': 'r',
      'okay': 'ok',
      'right now': 'rn',
      'though': 'tho',
      'probably': 'prob',
      'something': 'smth',
      'someone': 'sm1',
      'nothing': 'nth',
      'anyone': 'any1',
      'please': 'pls',
      'people': 'ppl',
      'really': 'rly',
      'about': 'abt',
      'level': 'lvl',
      'damage': 'dmg',
      'experience': 'xp',
      'equipment': 'equip',
    };
    
    let result = message.toLowerCase();
    const keys = Object.keys(typoReplacements);
    const numReplacements = Math.floor(Math.random() * 2) + 1;
    
    for (let i = 0; i < numReplacements; i++) {
      const key = keys[Math.floor(Math.random() * keys.length)];
      result = result.replace(new RegExp(key, 'gi'), typoReplacements[key]);
    }
    
    if (Math.random() < 0.2) {
      const words = result.split(' ');
      if (words.length > 2) {
        const idx = Math.floor(Math.random() * words.length);
        if (words[idx].length > 3) {
          const chars = words[idx].split('');
          const swapIdx = Math.floor(Math.random() * (chars.length - 1));
          [chars[swapIdx], chars[swapIdx + 1]] = [chars[swapIdx + 1], chars[swapIdx]];
          words[idx] = chars.join('');
        }
      }
      result = words.join(' ');
    }
    
    return result;
  }
  
  async performBotChat(): Promise<void> {
    // Global chat disabled for bots - they only chat in guild chat
    return;
    
    const bot = await this.getRandomBot();
    if (!bot) {
      console.log("[BotService] performBotChat: No bot found");
      return;
    }
    
    console.log(`[BotService] performBotChat: Starting for bot ${bot.username}`);
    const totalLevel = bot.totalLevel;
    const context = await this.getBotChatContext(bot);
    
    try {
      console.log(`[BotService] Calling OpenAI for bot ${bot.username}...`);
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: `You are ${bot.username}, a lvl ${totalLevel} player in IdleThrone (dark fantasy idle RPG).
Context: ${context}
Generate a SHORT casual chat msg (max 60 chars, English). Be super casual like a real gamer.
Use slang: lol, lmao, gg, rip, bruh, ngl, fr, tbh. Sometimes skip punctuation.
Topics: grinding, drops, lvling up, party/guild stuff, market prices.
Never mention AI. Just the message, no quotes.`
          },
          { 
            role: "user", 
            content: "Generate a chat message."
          }
        ],
        max_tokens: 50,
        temperature: 0.9,
      });
      
      console.log(`[BotService] OpenAI response received for ${bot.username}`);
      let chatMessage = response.choices[0]?.message?.content || "";
      console.log(`[BotService] Chat message: "${chatMessage}"`);
      
      if (chatMessage && chatMessage.length > 0) {
        chatMessage = this.addRandomTypos(chatMessage);
        
        await db.insert(globalChatMessages).values({
          playerId: bot.id,
          content: chatMessage.substring(0, 200),
        });
        
        console.log(`[BotService] Bot ${bot.username} chatted: "${chatMessage.substring(0, 50)}..."`);
      } else {
        console.log(`[BotService] Empty chat message for ${bot.username}`);
      }
    } catch (error: any) {
      console.error("[BotService] Failed to generate bot chat:", error?.message || error);
    }
    
    await db.update(players)
      .set({ botLastActivity: new Date() })
      .where(eq(players.id, bot.id));
  }
  
  async checkAndQueueMentionResponses(): Promise<void> {
    // Global chat disabled for bots - they only chat in guild chat
    return;
    
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      
      const allBots = await db.select({ id: players.id, username: players.username })
        .from(players)
        .where(eq(players.isBot, 1));
      
      if (allBots.length === 0) return;
      
      const recentMessages = await db.select({
        id: globalChatMessages.id,
        content: globalChatMessages.content,
        playerId: globalChatMessages.playerId,
        createdAt: globalChatMessages.createdAt,
      })
        .from(globalChatMessages)
        .where(gt(globalChatMessages.createdAt, thirtyMinutesAgo))
        .orderBy(desc(globalChatMessages.createdAt))
        .limit(20);
      
      for (const message of recentMessages) {
        if (pendingBotResponses.has(message.id)) continue;
        
        const messagePlayer = await db.select({ isBot: players.isBot })
          .from(players)
          .where(eq(players.id, message.playerId))
          .limit(1);
        
        if (messagePlayer.length > 0 && messagePlayer[0].isBot === 1) continue;
        
        const mentionedBot = allBots.find(bot => 
          message.content.toLowerCase().includes(bot.username.toLowerCase())
        );
        
        if (!mentionedBot) continue;
        
        const existingResponses = await db.select({ id: globalChatMessages.id })
          .from(globalChatMessages)
          .where(
            and(
              gt(globalChatMessages.createdAt, message.createdAt!),
              eq(globalChatMessages.playerId, mentionedBot.id)
            )
          )
          .limit(1);
        
        if (existingResponses.length > 0) continue;
        
        const delayMinutes = Math.floor(Math.random() * 177) + 3;
        const respondAt = new Date(Date.now() + delayMinutes * 60 * 1000);
        
        pendingBotResponses.set(message.id, {
          botId: mentionedBot.id,
          questionMessageId: message.id,
          respondAt,
        });
        
        console.log(`[BotService] ${mentionedBot.username} will respond to mention in ${delayMinutes} min`);
      }
    } catch (error) {
      console.error("[BotService] Failed to check mentions:", error);
    }
  }
  
  async processPendingBotResponses(): Promise<void> {
    // Global chat disabled for bots - they only chat in guild chat
    return;
    
    const now = new Date();
    
    for (const [messageId, pending] of Array.from(pendingBotResponses.entries())) {
      if (pending.respondAt > now) continue;
      
      pendingBotResponses.delete(messageId);
      
      try {
        const [bot] = await db.select()
          .from(players)
          .where(eq(players.id, pending.botId))
          .limit(1);
        
        if (!bot) continue;
        
        const [questionMsg] = await db.select({
          content: globalChatMessages.content,
        })
          .from(globalChatMessages)
          .where(eq(globalChatMessages.id, pending.questionMessageId))
          .limit(1);
        
        if (!questionMsg) continue;
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { 
              role: "system", 
              content: `You are ${bot.username}, lvl ${bot.totalLevel} in IdleThrone. Someone mentioned you: "${questionMsg.content}"
Generate a casual response (max 80 chars, English). Be like a real gamer.
Sometimes uncertain: "idk", "maybe", "not sure", "i think", "prob".
Use slang: lol, bruh, ngl, tbh. Sometimes skip punctuation.
Not always helpful. Natural, casual. Just the message, no quotes.`
            },
            { 
              role: "user", 
              content: "Generate a response."
            }
          ],
          max_tokens: 50,
          temperature: 0.9,
        });
        
        let chatMessage = response.choices[0]?.message?.content || "";
        
        if (chatMessage && chatMessage.length > 0) {
          chatMessage = this.addRandomTypos(chatMessage);
          
          await db.insert(globalChatMessages).values({
            playerId: bot.id,
            content: chatMessage.substring(0, 200),
          });
          
          console.log(`[BotService] Bot ${bot.username} responded: "${chatMessage.substring(0, 50)}..."`);
        }
        
        await db.update(players)
          .set({ botLastActivity: new Date() })
          .where(eq(players.id, bot.id));
      } catch (error) {
        console.error("[BotService] Failed to process pending response:", error);
      }
    }
  }
  
  async performBotGuildActivity(): Promise<void> {
    const bot = await this.getRandomBot();
    if (!bot) return;
    
    const membership = await db.select()
      .from(guildMembers)
      .where(eq(guildMembers.playerId, bot.id))
      .limit(1);
    
    if (membership.length === 0) {
      await this.botJoinGuild(bot);
    } else {
      await this.botContributeToGuild(bot, membership[0].guildId);
    }
  }
  
  private async botJoinGuild(bot: typeof players.$inferSelect): Promise<void> {
    const openGuilds = await db.select()
      .from(guilds)
      .where(eq(guilds.entryType, 'public'))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    
    if (openGuilds.length === 0) return;
    
    const guild = openGuilds[0];
    
    try {
      await db.insert(guildMembers).values({
        guildId: guild.id,
        playerId: bot.id,
        role: "member",
        totalContribution: 0,
      });
      
      console.log(`[BotService] Bot ${bot.username} joined guild ${guild.name}`);
    } catch (error) {
      // Ignore errors silently - probably already a member
    }
  }
  
  private async botContributeToGuild(bot: typeof players.$inferSelect, guildId: string): Promise<void> {
    const xpContribution = Math.floor(Math.random() * 100) + 10;
    
    try {
      await db.update(guildMembers)
        .set({ 
          totalContribution: sql`total_contribution + ${xpContribution}`,
          dailyContribution: sql`daily_contribution + ${xpContribution}`
        })
        .where(
          and(
            eq(guildMembers.guildId, guildId),
            eq(guildMembers.playerId, bot.id)
          )
        );
      
      await db.update(guilds)
        .set({ xp: sql`xp + ${xpContribution}` })
        .where(eq(guilds.id, guildId));
      
      console.log(`[BotService] Bot ${bot.username} contributed ${xpContribution} XP to guild`);
    } catch (error) {
      // Ignore errors silently
    }
  }
  
  async performBotSkillTraining(): Promise<void> {
    const bot = await this.getRandomBot();
    if (!bot) return;
    
    const skills = bot.skills as Record<string, { level: number; xp: number }>;
    const skillName = SKILL_NAMES[Math.floor(Math.random() * SKILL_NAMES.length)];
    const skill = skills[skillName] || { level: 1, xp: 0 };
    
    const xpGain = Math.floor(Math.random() * 500) + 100;
    const newXp = skill.xp + xpGain;
    const xpForNextLevel = Math.floor(Math.pow(skill.level + 1, 2.5) * 100);
    
    let newLevel = skill.level;
    if (newXp >= xpForNextLevel && skill.level < 99) {
      newLevel = skill.level + 1;
    }
    
    const updatedSkills = {
      ...skills,
      [skillName]: { level: newLevel, xp: newXp }
    };
    
    const totalLevel = calculateTotalLevel(updatedSkills);
    
    const currentStats = (bot.combatSessionStats as Record<string, any>) || {};
    const isCombatSkill = ['attack', 'strength', 'defence', 'hitpoints'].includes(skillName);
    const isGatheringSkill = ['mining', 'woodcutting', 'fishing'].includes(skillName);
    const isProcessingSkill = ['cooking', 'alchemy', 'crafting'].includes(skillName);
    
    let itemsGained = 0;
    if (isCombatSkill) {
      itemsGained = Math.floor(Math.random() * 2) + 1;
    } else if (isGatheringSkill) {
      itemsGained = Math.floor(Math.random() * 4) + 2;
    } else if (isProcessingSkill) {
      itemsGained = Math.floor(Math.random() * 3) + 1;
    }
    
    const currentTask = isCombatSkill 
      ? `training_${skillName}` 
      : isGatheringSkill 
        ? skillName 
        : 'crafting';
    
    const updatedStats = {
      ...currentStats,
      actionsCompleted: (currentStats.actionsCompleted || 0) + 1,
      monstersKilled: isCombatSkill 
        ? (currentStats.monstersKilled || 0) + Math.floor(Math.random() * 3) + 1 
        : (currentStats.monstersKilled || 0),
      goldEarned: isCombatSkill
        ? (currentStats.goldEarned || 0) + Math.floor(Math.random() * 50) + 10
        : (currentStats.goldEarned || 0),
      itemsCollected: (currentStats.itemsCollected || 0) + itemsGained,
      currentTask,
      botOnlineStatus: Math.random() < 0.6,
    };
    
    await db.update(players)
      .set({ 
        skills: updatedSkills,
        totalLevel,
        combatSessionStats: updatedStats,
        botLastActivity: new Date()
      })
      .where(eq(players.id, bot.id));

    if (isCombatSkill) {
      const region = bot.currentRegion || 'verdant';
      const regionMonsters = REGION_MONSTERS[region] || REGION_MONSTERS.verdant;
      const monsterId = pickRandom(regionMonsters);
      await this.syncBotPartyCombatState(bot.id, monsterId, true, region);
    } else {
      await this.syncBotPartyCombatState(bot.id, null, false);
    }
    
    if (newLevel > skill.level) {
      console.log(`[BotService] Bot ${bot.username} leveled up ${skillName} to ${newLevel}`);
    }
  }
  
  async performBotEquipmentUpgrade(): Promise<void> {
    const bot = await this.getRandomBot();
    if (!bot) return;
    
    const equipment = bot.equipment as Record<string, string> || {};
    const currentWeapon = equipment.weapon || "";
    
    const baseWeapon = stripRaritySuffix(currentWeapon).toLowerCase();
    let buildType: "melee" | "ranger" | "mage" = "melee";
    if (baseWeapon.includes("bow") || baseWeapon.includes("shortbow") || baseWeapon.includes("longbow")) buildType = "ranger";
    else if (baseWeapon.includes("staff")) buildType = "mage";
    
    const currentRegion = bot.currentRegion || "verdant";
    const regionConfig = REGION_TIER_CONFIG[currentRegion] || REGION_TIER_CONFIG.verdant;
    
    const armorSlots: Array<"helmet" | "body" | "legs" | "boots" | "gloves"> = ["helmet", "body", "legs", "boots", "gloves"];
    const randomArmorSlot = pickRandom(armorSlots);
    const tierList = EQUIPMENT_TIERS[buildType][randomArmorSlot] as string[];
    
    const currentItem = equipment[randomArmorSlot] || "";
    const baseCurrentItem = stripRaritySuffix(currentItem);
    const currentTierIndex = tierList.findIndex(item => item === baseCurrentItem);
    
    if (currentTierIndex >= regionConfig.maxTier || currentTierIndex >= tierList.length - 1) {
      const accSlot: "amulet" | "ring" = Math.random() < 0.5 ? "amulet" : "ring";
      const accTiers = ACCESSORY_TIERS[accSlot];
      const currentAcc = equipment[accSlot] || "";
      const baseCurrentAcc = stripRaritySuffix(currentAcc);
      const accIndex = accTiers.findIndex(item => item === baseCurrentAcc);
      
      if (accIndex < Math.min(regionConfig.maxTier, accTiers.length - 1)) {
        const newAccBase = accTiers[accIndex + 1];
        const newAcc = addRaritySuffix(newAccBase);
        const newEquipment = { ...equipment, [accSlot]: newAcc };
        
        await db.update(players)
          .set({ 
            equipment: newEquipment,
            botLastActivity: new Date()
          })
          .where(eq(players.id, bot.id));
        
        console.log(`[BotService] Bot ${bot.username} upgraded ${accSlot} to ${newAcc}`);
      }
      return;
    }
    
    const newTierIndex = currentTierIndex + 1;
    const newItemBase = tierList[newTierIndex];
    const newItem = addRaritySuffix(newItemBase);
    const newEquipment = { ...equipment, [randomArmorSlot]: newItem };
    
    if (Math.random() < 0.3) {
      newEquipment.weapon = addRaritySuffix(getWeaponForTier(buildType, newTierIndex));
      if (buildType === "melee") {
        newEquipment.shield = addRaritySuffix(getShieldForTier(newTierIndex));
      }
    }
    
    const currentSkills = bot.skills as Record<string, { level: number; xp: number }> || {};
    const updatedSkills = upgradeSkillsForTier(currentSkills, newTierIndex);
    const newTotalLevel = calculateTotalLevel(updatedSkills);
    
    await db.update(players)
      .set({ 
        equipment: newEquipment,
        skills: updatedSkills,
        totalLevel: newTotalLevel,
        botLastActivity: new Date()
      })
      .where(eq(players.id, bot.id));
    
    console.log(`[BotService] Bot ${bot.username} upgraded ${randomArmorSlot} to ${newItem} (skills upgraded to tier ${newTierIndex})`);
  }
  
  async fixExistingBotSkillLevels(): Promise<{ fixed: number; skipped: number }> {
    let fixed = 0;
    let skipped = 0;
    
    const allBots = await db.select()
      .from(players)
      .where(eq(players.isBot, 1));
    
    for (const bot of allBots) {
      const equipment = bot.equipment as Record<string, string> || {};
      const skills = bot.skills as Record<string, { level: number; xp: number }> || {};
      
      let maxTierIndex = 0;
      
      for (const [slot, item] of Object.entries(equipment)) {
        if (!item) continue;
        const baseItem = stripRaritySuffix(item).toLowerCase();
        
        if (baseItem.includes("void") || baseItem.includes("_t8")) {
          maxTierIndex = Math.max(maxTierIndex, 7);
        } else if (baseItem.includes("dragon") || baseItem.includes("celestial") || baseItem.includes("_t7")) {
          maxTierIndex = Math.max(maxTierIndex, 6);
        } else if (baseItem.includes("rune") || baseItem.includes("darkwood") || baseItem.includes("divine") || baseItem.includes("_t6") || baseItem.includes("elder")) {
          maxTierIndex = Math.max(maxTierIndex, 5);
        } else if (baseItem.includes("adamant") || baseItem.includes("composite") || baseItem.includes("arcane") || baseItem.includes("_t5") || baseItem.includes("magic staff")) {
          maxTierIndex = Math.max(maxTierIndex, 4);
        } else if (baseItem.includes("mithril") || baseItem.includes("yew") || baseItem.includes("oracle") || baseItem.includes("_t4") || baseItem.includes("studded")) {
          maxTierIndex = Math.max(maxTierIndex, 3);
        } else if (baseItem.includes("steel") || baseItem.includes("maple") || baseItem.includes("mystic") || baseItem.includes("_t3") || baseItem.includes("longbow") || baseItem.includes("hardened")) {
          maxTierIndex = Math.max(maxTierIndex, 2);
        } else if (baseItem.includes("iron") || baseItem.includes("willow") || baseItem.includes("silk") || baseItem.includes("_t2") || baseItem.includes("oak") || baseItem.includes("hunter")) {
          maxTierIndex = Math.max(maxTierIndex, 1);
        }
      }
      
      // Check if any skill is below expected level for tier (including tier 0 bots)
      const requiredLevel = getRequiredLevelForTier(maxTierIndex);
      const minNonCombatLevel = Math.max(Math.floor(requiredLevel * 0.6), 1);
      
      // Check all skills for consistency
      let needsFix = false;
      for (const skill of SKILL_NAMES) {
        const currentLevel = skills[skill]?.level || 1;
        const minLevel = ['attack', 'strength', 'defence', 'hitpoints'].includes(skill)
          ? requiredLevel
          : minNonCombatLevel;
        
        if (currentLevel < minLevel) {
          needsFix = true;
          break;
        }
      }
      
      if (!needsFix) {
        skipped++;
        continue;
      }
      
      const updatedSkills = upgradeSkillsForTier(skills, maxTierIndex);
      const newTotalLevel = calculateTotalLevel(updatedSkills);
      
      await db.update(players)
        .set({ 
          skills: updatedSkills,
          totalLevel: newTotalLevel
        })
        .where(eq(players.id, bot.id));
      
      fixed++;
      console.log(`[BotService] Fixed bot ${bot.username}: skills upgraded to tier ${maxTierIndex} (level ${requiredLevel}+)`);
    }
    
    console.log(`[BotService] Bot skill fix complete: ${fixed} fixed, ${skipped} skipped`);
    return { fixed, skipped };
  }
  
  async performBotPartyActivity(): Promise<void> {
    try {
      const roll = Math.random();

      if (roll < 0.30) {
        await this.botCreateParty();
      } else if (roll < 0.70) {
        await this.botJoinParty();
      } else if (roll < 0.75) {
        await this.botLeaveParty();
      } else if (roll < 0.85) {
        await this.botHandleInvites();
      } else {
        await this.cleanupBotOnlyParties();
      }
    } catch (error) {
      console.error('[BotService] Party activity error:', error);
    }
  }

  private async botCreateParty(): Promise<void> {
    const existingBotPartyRegions = await db.select({ regionId: parties.regionId })
      .from(parties)
      .innerJoin(players, eq(parties.leaderId, players.id))
      .where(and(
        eq(players.isBot, 1),
        ne(parties.status, 'disbanded'),
      ));
    const coveredRegions = new Set(existingBotPartyRegions.map(r => r.regionId).filter(Boolean));
    const uncoveredRegions = ALL_REGIONS.filter(r => !coveredRegions.has(r));

    const bot = await db.select({ id: players.id, username: players.username, currentRegion: players.currentRegion, equipment: players.equipment })
      .from(players)
      .where(eq(players.isBot, 1))
      .orderBy(sql`RANDOM()`)
      .limit(15);

    const sortedBots = [...bot].sort((a, b) => {
      const aRegion = a.currentRegion || 'verdant';
      const bRegion = b.currentRegion || 'verdant';
      const aUncovered = uncoveredRegions.includes(aRegion) ? 0 : 1;
      const bUncovered = uncoveredRegions.includes(bRegion) ? 0 : 1;
      return aUncovered - bUncovered;
    });

    for (const b of sortedBots) {
      const existing = await db.select({ id: partyMembers.id })
        .from(partyMembers)
        .innerJoin(parties, eq(partyMembers.partyId, parties.id))
        .where(and(eq(partyMembers.playerId, b.id), ne(parties.status, 'disbanded')))
        .limit(1);

      if (existing.length > 0) continue;

      const region = b.currentRegion || 'verdant';
      const equip = b.equipment as Record<string, string> | null;
      const weaponType = this.getWeaponTypeFromEquipment(equip);
      const subClass = getSubClass(weaponType, null);

      const existingBotParties = await db.select({
        partyId: parties.id,
        maxSize: parties.maxSize,
      })
        .from(parties)
        .innerJoin(players, eq(parties.leaderId, players.id))
        .where(and(
          eq(parties.isPublic, 1),
          eq(parties.status, 'forming'),
          eq(parties.partyType, 'social'),
          eq(players.isBot, 1),
          eq(parties.regionId, region),
        ))
        .limit(5);

      let joined = false;
      for (const ep of existingBotParties) {
        const memberCount = await db.select({ count: sql<number>`count(*)` })
          .from(partyMembers)
          .where(eq(partyMembers.partyId, ep.partyId));
        const count = Number(memberCount[0]?.count || 0);
        if (count >= ep.maxSize) continue;

        try {
          await db.transaction(async (tx) => {
            const recheck = await tx.select({ id: partyMembers.id })
              .from(partyMembers)
              .innerJoin(parties, eq(partyMembers.partyId, parties.id))
              .where(and(eq(partyMembers.playerId, b.id), ne(parties.status, 'disbanded')))
              .limit(1);
            if (recheck.length > 0) return;

            const posResult = await tx.select({ count: sql<number>`count(*)` })
              .from(partyMembers)
              .where(eq(partyMembers.partyId, ep.partyId));
            const pos = Number(posResult[0]?.count || 0) + 1;

            await tx.insert(partyMembers).values({
              partyId: ep.partyId,
              playerId: b.id,
              role: subClass.baseRole,
              position: pos,
              isReady: 0,
              cachedWeaponType: weaponType,
            });

            await tx.update(parties)
              .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() })
              .where(eq(parties.id, ep.partyId));
          });

          joined = true;
          this.trackBotPartyJoin(b.id);
          try {
            const { broadcastToAllPlayers } = await import('../partyWs');
            broadcastToAllPlayers({ type: 'public_parties_updated' });
          } catch {}
          console.log(`[BotService] Bot ${b.username} joined existing bot party ${ep.partyId} in ${region}`);
          break;
        } catch {}
      }

      if (joined) return;

      const partyNames = this.getPartyNamesForRegion(region);
      const name = pickRandom(partyNames);

      await db.transaction(async (tx) => {
        const recheck = await tx.select({ id: partyMembers.id })
          .from(partyMembers)
          .innerJoin(parties, eq(partyMembers.partyId, parties.id))
          .where(and(eq(partyMembers.playerId, b.id), ne(parties.status, 'disbanded')))
          .limit(1);
        if (recheck.length > 0) return;

        const [party] = await tx.insert(parties)
          .values({
            leaderId: b.id,
            name,
            description: null,
            status: 'forming',
            partyType: 'social',
            maxSize: 5,
            isPublic: 1,
            regionId: region,
            partyVersion: 1,
          })
          .returning();

        await tx.insert(partyMembers)
          .values({
            partyId: party.id,
            playerId: b.id,
            role: subClass.baseRole,
            position: 1,
            isReady: 0,
            cachedWeaponType: weaponType,
          });
      });

      this.trackBotPartyJoin(b.id);
      try {
        const { broadcastToAllPlayers } = await import('../partyWs');
        broadcastToAllPlayers({ type: 'public_parties_updated' });
      } catch {}

      console.log(`[BotService] Bot ${b.username} created party "${name}" in ${region}`);
      return;
    }
  }

  private async botJoinParty(): Promise<void> {
    const publicParties = await db.select({
      partyId: parties.id,
      leaderId: parties.leaderId,
      regionId: parties.regionId,
      maxSize: parties.maxSize,
    })
      .from(parties)
      .where(and(
        eq(parties.isPublic, 1),
        eq(parties.status, 'forming'),
        eq(parties.partyType, 'social')
      ))
      .limit(10);

    if (publicParties.length === 0) return;

    for (const party of publicParties) {
      const memberCount = await db.select({ count: sql<number>`count(*)` })
        .from(partyMembers)
        .where(eq(partyMembers.partyId, party.partyId));

      const count = Number(memberCount[0]?.count || 0);
      if (count >= party.maxSize) continue;

      const leader = await db.select({ currentRegion: players.currentRegion, totalLevel: players.totalLevel })
        .from(players)
        .where(eq(players.id, party.leaderId))
        .limit(1);

      const leaderRegion = leader[0]?.currentRegion || party.regionId || 'verdant';
      const leaderLevel = leader[0]?.totalLevel || 10;
      const minLevel = Math.max(1, leaderLevel - 30);
      const maxLevel = leaderLevel + 30;

      const candidates = await db.select({ id: players.id, username: players.username, equipment: players.equipment })
        .from(players)
        .where(and(
          eq(players.isBot, 1),
          eq(players.currentRegion, leaderRegion),
          gt(players.totalLevel, minLevel),
          lt(players.totalLevel, maxLevel),
        ))
        .orderBy(sql`RANDOM()`)
        .limit(3);

      for (const candidate of candidates) {
        const existing = await db.select({ id: partyMembers.id })
          .from(partyMembers)
          .innerJoin(parties, eq(partyMembers.partyId, parties.id))
          .where(and(eq(partyMembers.playerId, candidate.id), ne(parties.status, 'disbanded')))
          .limit(1);

        if (existing.length > 0) continue;

        const equip = candidate.equipment as Record<string, string> | null;
        const weaponType = this.getWeaponTypeFromEquipment(equip);
        const subClass = getSubClass(weaponType, null);

        let joined = false;
        await db.transaction(async (tx) => {
          const [partyCheck] = await tx.select({ status: parties.status, maxSize: parties.maxSize })
            .from(parties).where(eq(parties.id, party.partyId)).limit(1);
          if (!partyCheck || partyCheck.status !== 'forming') return;

          const countCheck = await tx.select({ count: sql<number>`count(*)` })
            .from(partyMembers).where(eq(partyMembers.partyId, party.partyId));
          if (Number(countCheck[0]?.count || 0) >= partyCheck.maxSize) return;

          const dupeCheck = await tx.select({ id: partyMembers.id })
            .from(partyMembers)
            .innerJoin(parties, eq(partyMembers.partyId, parties.id))
            .where(and(eq(partyMembers.playerId, candidate.id), ne(parties.status, 'disbanded')))
            .limit(1);
          if (dupeCheck.length > 0) return;

          const posResult = await tx.select({ maxPos: sql<number>`COALESCE(MAX(position), 0) + 1` })
            .from(partyMembers).where(eq(partyMembers.partyId, party.partyId));

          await tx.insert(partyMembers).values({
            partyId: party.partyId,
            playerId: candidate.id,
            role: subClass.baseRole,
            position: Number(posResult[0]?.maxPos || 1),
            isReady: 0,
            cachedWeaponType: weaponType,
          });

          await tx.update(parties)
            .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() })
            .where(eq(parties.id, party.partyId));

          joined = true;
        });

        if (joined) {
          this.trackBotPartyJoin(candidate.id);
          try {
            const { broadcastToAllPlayers } = await import('../partyWs');
            broadcastToAllPlayers({ type: 'public_parties_updated' });
          } catch {}
          console.log(`[BotService] Bot ${candidate.username} joined party ${party.partyId}`);
          return;
        }
      }
    }
  }

  private async botLeaveParty(): Promise<void> {
    const botMembers = await db.select({
      memberId: partyMembers.id,
      playerId: partyMembers.playerId,
      partyId: partyMembers.partyId,
      position: partyMembers.position,
    })
      .from(partyMembers)
      .innerJoin(players, eq(partyMembers.playerId, players.id))
      .innerJoin(parties, eq(partyMembers.partyId, parties.id))
      .where(and(
        eq(players.isBot, 1),
        ne(parties.status, 'disbanded'),
        eq(parties.partyType, 'social'),
      ))
      .orderBy(sql`RANDOM()`)
      .limit(5);

    if (botMembers.length === 0) return;

    let member = null;
    for (const candidate of botMembers) {
      const joinTime = this.botPartyJoinTimes.get(candidate.playerId);
      const leaveAfter = this.botPartyLeaveAfter.get(candidate.playerId);
      if (!joinTime || !leaveAfter) {
        this.trackBotPartyJoin(candidate.playerId);
        continue;
      }
      const elapsed = Date.now() - joinTime;
      if (elapsed >= leaveAfter) {
        member = candidate;
        break;
      }
    }

    if (!member) return;
    const partyId = member.partyId;

    const allMembers = await db.select({
      playerId: partyMembers.playerId,
      position: partyMembers.position,
    })
      .from(partyMembers)
      .where(eq(partyMembers.partyId, partyId))
      .orderBy(partyMembers.position);

    await db.delete(partyMembers)
      .where(eq(partyMembers.id, member.memberId));

    const remaining = allMembers.filter(m => m.playerId !== member.playerId);

    if (remaining.length === 0) {
      await db.update(parties)
        .set({ status: 'disbanded', partyVersion: sql`party_version + 1`, updatedAt: new Date() })
        .where(eq(parties.id, partyId));
    } else {
      const [currentParty] = await db.select({ leaderId: parties.leaderId })
        .from(parties).where(eq(parties.id, partyId)).limit(1);

      if (currentParty?.leaderId === member.playerId) {
        const realPlayers = [];
        for (const m of remaining) {
          const [p] = await db.select({ isBot: players.isBot }).from(players).where(eq(players.id, m.playerId)).limit(1);
          if (p && p.isBot === 0) realPlayers.push(m);
        }
        const newLeader = realPlayers.length > 0 ? realPlayers[0] : remaining[0];
        await db.update(parties)
          .set({ leaderId: newLeader.playerId, partyVersion: sql`party_version + 1`, updatedAt: new Date() })
          .where(eq(parties.id, partyId));
      } else {
        await db.update(parties)
          .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() })
          .where(eq(parties.id, partyId));
      }
    }

    try {
      const { broadcastToAllPlayers } = await import('../partyWs');
      broadcastToAllPlayers({ type: 'public_parties_updated' });
    } catch {}

    this.trackBotPartyLeave(member.playerId);
    const [botPlayer] = await db.select({ username: players.username }).from(players).where(eq(players.id, member.playerId)).limit(1);
    console.log(`[BotService] Bot ${botPlayer?.username} left party ${partyId}`);
  }

  private async botHandleInvites(): Promise<void> {
    const pendingInvites = await db.select({
      id: partyInvites.id,
      inviteeId: partyInvites.inviteeId,
      partyId: partyInvites.partyId,
    })
      .from(partyInvites)
      .innerJoin(players, eq(partyInvites.inviteeId, players.id))
      .where(and(
        eq(players.isBot, 1),
        eq(partyInvites.status, 'pending'),
      ))
      .limit(3);

    for (const invite of pendingInvites) {
      const accept = Math.random() < 0.6;

      if (accept) {
        const [botPlayer] = await db.select({ equipment: players.equipment })
          .from(players).where(eq(players.id, invite.inviteeId)).limit(1);

        const equip = botPlayer?.equipment as Record<string, string> | null;
        const weaponType = this.getWeaponTypeFromEquipment(equip);
        const subClass = getSubClass(weaponType, null);

        let accepted = false;
        await db.transaction(async (tx) => {
          const [partyCheck] = await tx.select({ status: parties.status, partyType: parties.partyType, maxSize: parties.maxSize })
            .from(parties).where(eq(parties.id, invite.partyId)).limit(1);
          if (!partyCheck || partyCheck.status === 'disbanded' || partyCheck.partyType !== 'social') {
            await tx.update(partyInvites).set({ status: 'declined', updatedAt: new Date() }).where(eq(partyInvites.id, invite.id));
            return;
          }

          const existing = await tx.select({ id: partyMembers.id })
            .from(partyMembers)
            .innerJoin(parties, eq(partyMembers.partyId, parties.id))
            .where(and(eq(partyMembers.playerId, invite.inviteeId), ne(parties.status, 'disbanded')))
            .limit(1);
          if (existing.length > 0) {
            await tx.update(partyInvites).set({ status: 'declined', updatedAt: new Date() }).where(eq(partyInvites.id, invite.id));
            return;
          }

          const countCheck = await tx.select({ count: sql<number>`count(*)` })
            .from(partyMembers).where(eq(partyMembers.partyId, invite.partyId));
          if (Number(countCheck[0]?.count || 0) >= partyCheck.maxSize) {
            await tx.update(partyInvites).set({ status: 'declined', updatedAt: new Date() }).where(eq(partyInvites.id, invite.id));
            return;
          }

          const posResult = await tx.select({ maxPos: sql<number>`COALESCE(MAX(position), 0) + 1` })
            .from(partyMembers).where(eq(partyMembers.partyId, invite.partyId));

          await tx.insert(partyMembers).values({
            partyId: invite.partyId,
            playerId: invite.inviteeId,
            role: subClass.baseRole,
            position: Number(posResult[0]?.maxPos || 1),
            isReady: 0,
            cachedWeaponType: weaponType,
          });

          await tx.update(partyInvites).set({ status: 'accepted', updatedAt: new Date() }).where(eq(partyInvites.id, invite.id));
          await tx.update(parties).set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() }).where(eq(parties.id, invite.partyId));
          accepted = true;
        });

        if (accepted) {
          this.trackBotPartyJoin(invite.inviteeId);
          try {
            const { broadcastToAllPlayers } = await import('../partyWs');
            broadcastToAllPlayers({ type: 'public_parties_updated' });
          } catch {}
        }
      } else {
        await db.update(partyInvites)
          .set({ status: 'declined', updatedAt: new Date() })
          .where(eq(partyInvites.id, invite.id));
      }
    }
  }

  private async cleanupBotOnlyParties(): Promise<void> {
    const activeParties = await db.select({
      partyId: parties.id,
      createdAt: parties.createdAt,
    })
      .from(parties)
      .where(and(
        eq(parties.partyType, 'social'),
        ne(parties.status, 'disbanded'),
      ));

    let botOnlyCount = 0;

    for (const party of activeParties) {
      const members = await db.select({
        playerId: partyMembers.playerId,
        isBot: players.isBot,
      })
        .from(partyMembers)
        .innerJoin(players, eq(partyMembers.playerId, players.id))
        .where(eq(partyMembers.partyId, party.partyId));

      const allBots = members.every(m => m.isBot === 1);
      if (!allBots) continue;

      botOnlyCount++;

      const ageMs = Date.now() - new Date(party.createdAt).getTime();
      const ageMinutes = ageMs / 60000;

      const isSingleMember = members.length <= 1;
      if ((isSingleMember && ageMinutes > 120) || (ageMinutes > 240 && (Math.random() < 0.25 || botOnlyCount > 14))) {
        for (const m of members) {
          this.trackBotPartyLeave(m.playerId);
        }
        await db.delete(partyMembers).where(eq(partyMembers.partyId, party.partyId));
        await db.update(parties)
          .set({ status: 'disbanded', partyVersion: sql`party_version + 1`, updatedAt: new Date() })
          .where(eq(parties.id, party.partyId));

        try {
          const { broadcastToAllPlayers } = await import('../partyWs');
          broadcastToAllPlayers({ type: 'public_parties_updated' });
        } catch {}

        console.log(`[BotService] Disbanded bot-only party ${party.partyId} (age: ${Math.round(ageMinutes)}min)`);
      }
    }
  }

  private async fillUnderpopulatedParties(): Promise<void> {
    try {
      const underpopulated = await db.select({
        partyId: parties.id,
        regionId: parties.regionId,
        maxSize: parties.maxSize,
        createdAt: parties.createdAt,
      })
        .from(parties)
        .where(and(
          eq(parties.isPublic, 1),
          eq(parties.status, 'forming'),
          eq(parties.partyType, 'social'),
          ne(parties.status, 'disbanded'),
        ))
        .limit(10);

      for (const party of underpopulated) {
        const partyAgeMs = party.createdAt ? Date.now() - new Date(party.createdAt).getTime() : 0;
        const partyAgeMinutes = partyAgeMs / 60000;
        if (partyAgeMinutes > 30) continue;

        const memberCountResult = await db.select({ count: sql<number>`count(*)` })
          .from(partyMembers)
          .where(eq(partyMembers.partyId, party.partyId));
        const count = Number(memberCountResult[0]?.count || 0);

        if (count >= 3 || count >= party.maxSize) continue;

        const region = party.regionId || 'verdant';
        const botsToAdd = Math.floor(Math.random() * 2) + 1;

        const candidates = await db.select({ id: players.id, username: players.username, equipment: players.equipment })
          .from(players)
          .where(and(
            eq(players.isBot, 1),
            eq(players.currentRegion, region),
          ))
          .orderBy(sql`RANDOM()`)
          .limit(botsToAdd + 2);

        let added = 0;
        for (const candidate of candidates) {
          if (added >= botsToAdd) break;
          if (count + added >= party.maxSize) break;

          const existing = await db.select({ id: partyMembers.id })
            .from(partyMembers)
            .innerJoin(parties, eq(partyMembers.partyId, parties.id))
            .where(and(eq(partyMembers.playerId, candidate.id), ne(parties.status, 'disbanded')))
            .limit(1);
          if (existing.length > 0) continue;

          const equip = candidate.equipment as Record<string, string> | null;
          const weaponType = this.getWeaponTypeFromEquipment(equip);
          const subClass = getSubClass(weaponType, null);

          try {
            await db.transaction(async (tx) => {
              const recheck = await tx.select({ id: partyMembers.id })
                .from(partyMembers)
                .innerJoin(parties, eq(partyMembers.partyId, parties.id))
                .where(and(eq(partyMembers.playerId, candidate.id), ne(parties.status, 'disbanded')))
                .limit(1);
              if (recheck.length > 0) return;

              const posResult = await tx.select({ maxPos: sql<number>`COALESCE(MAX(position), 0) + 1` })
                .from(partyMembers).where(eq(partyMembers.partyId, party.partyId));

              await tx.insert(partyMembers).values({
                partyId: party.partyId,
                playerId: candidate.id,
                role: subClass.baseRole,
                position: Number(posResult[0]?.maxPos || 1),
                isReady: 0,
                cachedWeaponType: weaponType,
              });

              await tx.update(parties)
                .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() })
                .where(eq(parties.id, party.partyId));
            });

            this.trackBotPartyJoin(candidate.id);
            added++;
          } catch {}
        }

        if (added > 0) {
          try {
            const { broadcastToAllPlayers } = await import('../partyWs');
            broadcastToAllPlayers({ type: 'public_parties_updated' });
          } catch {}
        }
      }
    } catch (error) {
      // Silent fail
    }
  }

  private getWeaponTypeFromEquipment(equipment: Record<string, string> | null): string | null {
    if (!equipment) return null;
    const weapon = equipment.weapon || '';
    const baseName = weapon.replace(/\s*\((Common|Uncommon|Rare|Epic|Legendary|Mythic)\)$/, '').toLowerCase();
    if (!baseName) return null;
    if (baseName.includes('staff')) return 'staff';
    if (baseName.includes('bow')) return 'bow';
    if (baseName.includes('dagger')) return 'dagger';
    if (baseName.includes('warhammer') || baseName.includes('hammer')) return '2h_warhammer';
    if (baseName.includes('battleaxe') || baseName.includes('axe') || baseName.includes('cleaver')) return '2h_axe';
    const shield = equipment.shield || '';
    if (shield && (baseName.includes('sword') || baseName.includes('blade'))) return 'sword_shield';
    if (baseName.includes('sword') || baseName.includes('blade') || baseName.includes('scimitar')) return '2h_sword';
    return 'sword_shield';
  }

  private getPartyNamesForRegion(region: string): string[] {
    const genericNames = [
      "grind grp", "come farm", "open party", "xp farm", "fast run",
      "chill party", "lets go", "grinding", "farm spot", "exp grind",
      "join pls", "party up", "casual grp", "noobs welcome", "active grp",
      "come join", "skill grp", "quick run", "leveling", "free carry",
      "lf healer", "lf dps", "need tank", "need 1 more", "come help",
      "anyone??", "joinnn", "ez farm", "afk grind", "boss hunt",
    ];
    const regionNames: Record<string, string[]> = {
      verdant: ["Goblin Slayers", "Forest Patrol", "Oak Cutters", "fishing spot", "woodcutting grp", "goblin farm"],
      quarry: ["Iron Miners", "Quarry Raiders", "mining crew", "golem grind", "mine grp", "iron farm"],
      dunes: ["Sand Warriors", "Desert Scouts", "scorpion farm", "sand grind", "dune run", "bandit hunt"],
      obsidian: ["Lava Walkers", "Flame Seekers", "obsidian mine", "fire farm", "lava grind", "forge crew"],
      dragonspire: ["Dragon Hunters", "Drake Slayers", "dragon farm", "spire climb", "scale hunt", "drake grp"],
      frozen_wastes: ["Frost Legion", "Ice Breakers", "frost farm", "troll hunt", "ice grind", "frozen run"],
      void_realm: ["Void Explorers", "Abyss Walkers", "void farm", "shadow grind", "void run", "abyss grp"],
    };
    const regional = regionNames[region] || regionNames.verdant;
    return [...regional, ...genericNames];
  }

  async updateBotsOnlineStatus(): Promise<void> {
    const workingCount = Math.floor(Math.random() * 4) + 14;
    
    const allBots = await db.select({ id: players.id, currentRegion: players.currentRegion })
      .from(players)
      .where(eq(players.isBot, 1))
      .orderBy(sql`RANDOM()`);
    
    if (allBots.length === 0) return;

    const nightTime = this.isNightTime();
    
    const regionTasks: Record<string, Array<Record<string, any>>> = {
      verdant: [
        { type: 'combat', monsterId: 'goblin' },
        { type: 'combat', monsterId: 'wolf' },
        { type: 'combat', monsterId: 'rabbit' },
        { type: 'skill', skillType: 'woodcutting' },
        { type: 'skill', skillType: 'fishing' },
        { type: 'skill', skillType: 'cooking' },
      ],
      quarry: [
        { type: 'combat', monsterId: 'rock_golem' },
        { type: 'combat', monsterId: 'cave_bat' },
        { type: 'combat', monsterId: 'skeleton' },
        { type: 'skill', skillType: 'mining' },
        { type: 'skill', skillType: 'smithing' },
        { type: 'skill', skillType: 'crafting' },
      ],
      dunes: [
        { type: 'combat', monsterId: 'desert_scorpion' },
        { type: 'combat', monsterId: 'sand_elemental' },
        { type: 'combat', monsterId: 'sand_worm' },
        { type: 'skill', skillType: 'mining' },
        { type: 'skill', skillType: 'cooking' },
      ],
      obsidian: [
        { type: 'combat', monsterId: 'orc_warrior' },
        { type: 'combat', monsterId: 'dark_knight' },
        { type: 'combat', monsterId: 'shadow_wolf' },
        { type: 'skill', skillType: 'mining' },
        { type: 'skill', skillType: 'smithing' },
      ],
      dragonspire: [
        { type: 'combat', monsterId: 'wyvern' },
        { type: 'combat', monsterId: 'fire_drake' },
        { type: 'combat', monsterId: 'young_wyvern' },
        { type: 'skill', skillType: 'crafting' },
      ],
      frozen_wastes: [
        { type: 'combat', monsterId: 'ice_elemental' },
        { type: 'combat', monsterId: 'frost_giant' },
        { type: 'combat', monsterId: 'ice_wolf' },
        { type: 'skill', skillType: 'fishing' },
      ],
      void_realm: [
        { type: 'combat', monsterId: 'void_wraith' },
        { type: 'combat', monsterId: 'shadow_demon' },
        { type: 'combat', monsterId: 'void_knight' },
        { type: 'skill', skillType: 'crafting' },
      ],
    };
    
    const botIds = allBots.map(b => b.id);
    const botPartyRegionMap = new Map<string, string>();
    const botPartyIdMap = new Map<string, string>();
    if (botIds.length > 0) {
      const botPartyData = await db.select({
        playerId: partyMembers.playerId,
        regionId: parties.regionId,
        partyId: parties.id,
      })
        .from(partyMembers)
        .innerJoin(parties, eq(partyMembers.partyId, parties.id))
        .where(and(
          inArray(partyMembers.playerId, botIds),
          ne(parties.status, 'disbanded'),
        ));
      for (const row of botPartyData) {
        if (row.regionId) {
          botPartyRegionMap.set(row.playerId, row.regionId);
        }
        botPartyIdMap.set(row.playerId, row.partyId);
        this._botPartyIdCache.set(row.playerId, row.partyId);
      }
    }

    const botsToMakeWorking = allBots.slice(0, Math.min(workingCount, allBots.length));
    const workingIds: string[] = [];
    for (const bot of botsToMakeWorking) {
      const partyRegion = botPartyRegionMap.get(bot.id);
      const lockUntil = this.botTaskLockUntil.get(bot.id);
      const now = Date.now();

      if (lockUntil && now < lockUntil) {
        const lockedTask = this.botLockedTasks.get(bot.id);
        if (lockedTask) {
          await db.update(players)
            .set({ 
              activeTask: lockedTask,
              botLastActivity: new Date(),
              lastSeen: new Date(),
            })
            .where(eq(players.id, bot.id));
          workingIds.push(bot.id);
          continue;
        }
      }

      let region: string;
      if (partyRegion) {
        region = Math.random() < 0.8 ? partyRegion : (bot.currentRegion || 'verdant');
      } else {
        const prevTask = this.botLockedTasks.get(bot.id);
        const prevRegion = prevTask?.region || bot.currentRegion || 'verdant';
        region = Math.random() < 0.9 ? prevRegion : (bot.currentRegion || 'verdant');
      }

      const tasks = regionTasks[region] || regionTasks.verdant;
      const prevTask = this.botLockedTasks.get(bot.id);
      let task: Record<string, any>;
      if (prevTask && prevTask.region === region && Math.random() < 0.7) {
        const sameTasks = tasks.filter((t: any) => t.type === prevTask.type);
        task = sameTasks.length > 0 ? pickRandom(sameTasks) : pickRandom(tasks);
      } else {
        task = pickRandom(tasks);
      }
      const fullTask = { ...task, region };

      const lockDuration = this.generateTaskLockDuration();
      this.botTaskLockUntil.set(bot.id, now + lockDuration);
      this.botLockedTasks.set(bot.id, fullTask);

      const updateData: Record<string, any> = {
        activeTask: fullTask,
        botLastActivity: new Date(),
        lastSeen: new Date(),
      };
      if (region !== bot.currentRegion) {
        updateData.currentRegion = region;
      }

      await db.update(players)
        .set(updateData)
        .where(eq(players.id, bot.id));

      if (task.type === 'combat' && task.monsterId) {
        const regionMonsters = REGION_MONSTERS[region] || REGION_MONSTERS.verdant;
        const actualMonsterId = regionMonsters.includes(task.monsterId) ? task.monsterId : pickRandom(regionMonsters);
        await this.syncBotPartyCombatState(bot.id, actualMonsterId, true, region);
      } else {
        await this.syncBotPartyCombatState(bot.id, null, false, region);
      }

      workingIds.push(bot.id);
    }

    const idleBots = allBots.filter(b => !workingIds.includes(b.id));
    const offlineCount = nightTime ? Math.floor(Math.random() * 3) + 2 : Math.floor(Math.random() * 2);
    const idleOnlineCount = Math.max(0, idleBots.length - offlineCount);

    for (const bot of idleBots.slice(0, idleOnlineCount)) {
      const lockUntil = this.botTaskLockUntil.get(bot.id);
      const now = Date.now();

      if (nightTime && lockUntil && now < lockUntil && Math.random() < 0.8) {
        const lockedTask = this.botLockedTasks.get(bot.id);
        if (lockedTask) {
          await db.update(players)
            .set({ activeTask: lockedTask, lastSeen: new Date() })
            .where(eq(players.id, bot.id));
          continue;
        }
      }

      await db.update(players)
        .set({ activeTask: null, lastSeen: new Date() })
        .where(eq(players.id, bot.id));
      await this.syncBotPartyCombatState(bot.id, null, false);
    }
  }
  
  async runBotActivityCycle(): Promise<void> {
    await this.ensureBotCount();
    
    const botCount = await this.getBotCount();
    if (botCount === 0) {
      return;
    }
    
    await this.updateBotsOnlineStatus();
    
    await this.checkAndQueueMentionResponses();
    await this.processPendingBotResponses();
    
    const spontanChatCount = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < spontanChatCount; i++) {
      await this.performBotChat();
    }

    const activeBotPartyCount = await db.select({ count: sql<number>`count(*)` })
      .from(parties)
      .innerJoin(partyMembers, eq(partyMembers.partyId, parties.id))
      .innerJoin(players, eq(players.id, parties.leaderId))
      .where(and(
        eq(parties.status, 'forming'),
        eq(players.isBot, 1),
      ));
    const currentBotParties = Number(activeBotPartyCount[0]?.count || 0);

    if (currentBotParties < 4) {
      const seedCount = 6 - currentBotParties;
      for (let i = 0; i < seedCount; i++) {
        await this.botCreateParty();
      }
    } else if (Math.random() < 0.40) {
      await this.performBotPartyActivity();
    }

    await this.fillUnderpopulatedParties();
    
    const activityCount = Math.min(Math.floor(botCount * 0.1) + 1, 10);
    
    for (let i = 0; i < activityCount; i++) {
      const activityType = Math.random();
      
      if (activityType < 0.25) {
        await this.performBotSkillTraining();
      } else if (activityType < 0.45) {
        await this.performBotMarketActivity();
      } else if (activityType < 0.55) {
        await this.performBotMarketBuying();
      } else if (activityType < 0.65) {
        await this.performBotGuildActivity();
      } else if (activityType < 0.80) {
        await this.performBotEquipmentUpgrade();
      } else {
        await this.performBotChat();
      }
      
      const bot = await this.getRandomBot();
      if (bot) {
        await this.updateBotActivity(bot);
      }
    }
  }
  async migrateExistingBots(): Promise<void> {
    try {
      const allBots = await db.select({
        id: players.id,
        username: players.username,
        currentRegion: players.currentRegion,
        skills: players.skills,
        equipment: players.equipment,
        totalLevel: players.totalLevel,
        gold: players.gold,
        inventory: players.inventory,
        equipmentDurability: players.equipmentDurability,
        combatSessionStats: players.combatSessionStats,
        selectedBadge: players.selectedBadge,
      })
        .from(players)
        .where(eq(players.isBot, 1));

      if (allBots.length === 0) {
        console.log('[BotService] No existing bots to migrate');
        return;
      }

      const regionIndex = allBots.map((_, i) => ALL_REGIONS[i % ALL_REGIONS.length]);
      let migrated = 0;

      for (let i = 0; i < allBots.length; i++) {
        const bot = allBots[i];
        const region = regionIndex[i];
        const regionConfig = REGION_TIER_CONFIG[region] || REGION_TIER_CONFIG.verdant;
        const tierIndex = Math.floor(Math.random() * (regionConfig.maxTier - regionConfig.minTier + 1)) + regionConfig.minTier;
        const baseLevel = TIER_LEVEL_REQUIREMENTS[tierIndex] || 1;
        const levelVariance = Math.floor(Math.random() * 10) - 3;
        const targetLevel = Math.max(regionConfig.minLevel, Math.min(regionConfig.maxLevel, baseLevel + levelVariance));

        const buildRoll = Math.random();
        const buildType: "melee" | "ranger" | "mage" = buildRoll < 0.5 ? "melee" : buildRoll < 0.75 ? "ranger" : "mage";

        const skills = generateVariedSkills(targetLevel, buildType, region);
        const totalLevel = calculateTotalLevel(skills);
        const gold = Math.floor(5000 + (targetLevel / 95) * 45000 + Math.random() * 5000);

        const weaponBase = getWeaponForTier(buildType, tierIndex);
        const equipment: Record<string, string> = {
          weapon: addRaritySuffix(weaponBase),
          helmet: addRaritySuffix(getArmorForTier(buildType, "helmet", tierIndex)),
          body: addRaritySuffix(getArmorForTier(buildType, "body", tierIndex)),
          legs: addRaritySuffix(getArmorForTier(buildType, "legs", tierIndex)),
          boots: addRaritySuffix(getArmorForTier(buildType, "boots", tierIndex)),
          gloves: addRaritySuffix(getArmorForTier(buildType, "gloves", tierIndex)),
          ring: addRaritySuffix(ACCESSORY_TIERS.ring[Math.min(tierIndex, ACCESSORY_TIERS.ring.length - 1)]),
        };

        if (buildType === "melee") {
          equipment.shield = addRaritySuffix(getShieldForTier(tierIndex));
        }
        if (Math.random() < 0.6) {
          equipment.amulet = addRaritySuffix(ACCESSORY_TIERS.amulet[Math.min(tierIndex, ACCESSORY_TIERS.amulet.length - 1)]);
        }
        const migrateCape = tierIndex >= 5 ? true : Math.random() < 0.9;
        if (migrateCape) {
          equipment.cape = getCapeForTier(tierIndex);
        }

        const equipmentDurability: Record<string, number> = {};
        for (const slot of Object.keys(equipment)) {
          equipmentDurability[slot] = Math.floor(Math.random() * 31) + 70;
        }

        const masteryField = getWeaponMasteryField(weaponBase);
        const masteryXp = Math.floor(targetLevel * targetLevel * (50 + Math.random() * 100));

        const levelScale = targetLevel / 95;
        const combatSessionStats = {
          monstersKilled: Math.floor(50 + levelScale * 8000 + Math.random() * 2000),
          foodEaten: Math.floor(5 + levelScale * 500 + Math.random() * 100),
          deaths: Math.floor(Math.random() * (3 + levelScale * 15)),
          goldEarned: Math.floor(300 + levelScale * 50000 + Math.random() * 10000),
          actionsCompleted: Math.floor(30 + levelScale * 5000 + Math.random() * 1000),
          itemsCollected: Math.floor(20 + levelScale * 3000 + Math.random() * 500),
          currentTask: pickRandom(BOT_ACTIVITIES),
          botOnlineStatus: Math.random() < 0.6,
        };

        const regionItems = REGION_INVENTORY_ITEMS[region] || REGION_INVENTORY_ITEMS.verdant;
        const inventory: Record<string, number> = {};
        const foodCount = Math.floor(Math.random() * 3) + 1;
        for (let f = 0; f < foodCount; f++) {
          const food = pickRandom(regionItems.food);
          inventory[food] = (inventory[food] || 0) + Math.floor(Math.random() * 50) + 5;
        }
        const matCount = Math.floor(Math.random() * 3) + 1;
        for (let m = 0; m < matCount; m++) {
          const mat = pickRandom(regionItems.materials);
          inventory[mat] = (inventory[mat] || 0) + Math.floor(Math.random() * 80) + 10;
        }

        const updateData: Record<string, any> = {
          currentRegion: region,
          skills,
          totalLevel,
          gold,
          equipment,
          equipmentDurability,
          combatSessionStats,
          inventory,
          currentHitpoints: 100 + (skills.hitpoints?.level || 10) * 10,
        };

        if (masteryField) {
          updateData[masteryField] = masteryXp;
        }

        if (Math.random() < 0.7 && targetLevel >= 15 && !bot.selectedBadge) {
          await this.assignBotBadges(bot.id, targetLevel);
        }

        await db.update(players)
          .set(updateData)
          .where(eq(players.id, bot.id));

        await db.delete(playerAchievements).where(eq(playerAchievements.playerId, bot.id));
        await this.generateBotAchievements(bot.id, targetLevel, region);

        migrated++;
      }

      console.log(`[BotService] Migration complete: ${migrated}/${allBots.length} bots updated with full profiles`);
    } catch (error) {
      console.error('[BotService] Bot migration error:', error);
    }
  }
}

export const botService = new BotService();

