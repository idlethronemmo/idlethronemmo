import { db } from '../db';
import { eq, sql, inArray } from 'drizzle-orm';
import { gameItems, gameMonsters, gameCombatRegions, gameRecipes, gameSkillActions, dailyLoginRewards, dailyQuestTemplates, dungeonFloorTemplates, dungeonLootTables, dungeons, players, marketListings, badges } from '@shared/schema';
import type { InsertGameItem, InsertGameMonster, InsertGameCombatRegion, InsertGameRecipe, InsertGameSkillAction, InsertDailyLoginReward, InsertDailyQuestTemplate, InsertBadge } from '@shared/schema';

const SKILL_ACTIONS_DATA: InsertGameSkillAction[] = [
  // Woodcutting - All regions
  { id: "woodcutting_normal_tree", skill: "woodcutting", name: "Normal Tree", description: "A basic tree for beginner woodcutters", itemId: "normal_logs", levelRequired: 0, xpReward: 10, duration: 12000, sortOrder: 1, regionId: "verdant" },
  { id: "woodcutting_oak_tree", skill: "woodcutting", name: "Oak Tree", description: "A sturdy oak tree", itemId: "oak_logs", levelRequired: 15, xpReward: 25, duration: 20000, sortOrder: 2, regionId: "quarry" },
  { id: "woodcutting_willow_tree", skill: "woodcutting", name: "Willow Tree", description: "A flexible willow tree", itemId: "willow_logs", levelRequired: 30, xpReward: 45, duration: 32000, sortOrder: 3, regionId: "quarry" },
  { id: "woodcutting_maple_tree", skill: "woodcutting", name: "Maple Tree", description: "A hard maple tree", itemId: "maple_logs", levelRequired: 45, xpReward: 80, duration: 48000, sortOrder: 4, regionId: "dunes" },
  { id: "woodcutting_elderwood", skill: "woodcutting", name: "Elderwood Log", description: "Cut elderwood from Verdant", itemId: "elderwood_logs", levelRequired: 5, xpReward: 20, duration: 15000, sortOrder: 5, regionId: "verdant" },
  { id: "woodcutting_yew_tree", skill: "woodcutting", name: "Yew Tree", description: "A dense yew tree", itemId: "yew_logs", levelRequired: 60, xpReward: 150, duration: 80000, sortOrder: 5, regionId: "obsidian" },
  { id: "woodcutting_magic_tree", skill: "woodcutting", name: "Magic Tree", description: "An enchanted magic tree", itemId: "magic_logs", levelRequired: 75, xpReward: 300, duration: 140000, sortOrder: 6, regionId: "dragonspire" },
  { id: "woodcutting_petrified_wood", skill: "woodcutting", name: "Petrified Wood Log", description: "Harvest petrified wood from the Quarry", itemId: "petrified_logs", levelRequired: 18, xpReward: 45, duration: 20000, sortOrder: 18, regionId: "quarry" },
  { id: "woodcutting_cactus_wood", skill: "woodcutting", name: "Cactus Wood", description: "Harvest cactus wood from the Dunes", itemId: "cactus_logs", levelRequired: 28, xpReward: 70, duration: 24000, sortOrder: 28, regionId: "dunes" },
  { id: "woodcutting_darkwood", skill: "woodcutting", name: "Darkwood Log", description: "Harvest darkwood from Obsidian", itemId: "darkwood_logs", levelRequired: 40, xpReward: 100, duration: 26000, sortOrder: 40, regionId: "obsidian" },
  { id: "woodcutting_dragon_wood", skill: "woodcutting", name: "Dragon Wood Log", description: "Harvest dragon wood from Dragonspire", itemId: "dragon_logs", levelRequired: 55, xpReward: 150, duration: 28000, sortOrder: 55, regionId: "dragonspire" },
  { id: "woodcutting_ice_wood", skill: "woodcutting", name: "Ice Wood Log", description: "Harvest ice wood from the Frozen Wastes", itemId: "ice_logs", levelRequired: 70, xpReward: 200, duration: 30000, sortOrder: 70, regionId: "frozen_wastes" },
  { id: "woodcutting_void_root", skill: "woodcutting", name: "Void Root", description: "Harvest void roots from the Void Realm", itemId: "void_logs", levelRequired: 85, xpReward: 280, duration: 32000, sortOrder: 85, regionId: "void_realm" },
  
  // Mining - All regions
  { id: "mining_moonstone", skill: "mining", name: "Moonstone", description: "Mine moonstone ore from Verdant", itemId: "Moonstone", levelRequired: 5, xpReward: 20, duration: 15000, sortOrder: 5, regionId: "verdant" },
  { id: "mining_copper_ore", skill: "mining", name: "Copper Ore", description: "Basic copper ore deposit", itemId: "Copper Ore", levelRequired: 0, xpReward: 10, duration: 12000, sortOrder: 10, regionId: "verdant" },
  { id: "mining_tin_ore", skill: "mining", name: "Tin Ore", description: "Basic tin ore deposit", itemId: "Tin Ore", levelRequired: 0, xpReward: 10, duration: 12000, sortOrder: 11, regionId: "verdant" },
  { id: "mining_iron_ore", skill: "mining", name: "Iron Ore", description: "Iron ore deposit", itemId: "Iron Ore", levelRequired: 15, xpReward: 35, duration: 24000, sortOrder: 12, regionId: "quarry" },
  { id: "mining_coal", skill: "mining", name: "Coal", description: "Coal deposit for smelting", itemId: "Coal", levelRequired: 15, xpReward: 25, duration: 12000, sortOrder: 13, regionId: "quarry" },
  { id: "mining_silver_ore", skill: "mining", name: "Silver Ore", description: "Precious silver ore", itemId: "Silver Ore", levelRequired: 20, xpReward: 40, duration: 32000, sortOrder: 14, regionId: "quarry" },
  { id: "mining_gold_ore", skill: "mining", name: "Gold Ore", description: "Valuable gold ore", itemId: "Gold Ore", levelRequired: 40, xpReward: 65, duration: 60000, sortOrder: 15, regionId: "obsidian" },
  { id: "mining_mithril_ore", skill: "mining", name: "Mithril Ore", description: "Rare mithril ore", itemId: "Mithril Ore", levelRequired: 50, xpReward: 90, duration: 72000, sortOrder: 16, regionId: "dragonspire" },
  { id: "mining_adamant_ore", skill: "mining", name: "Adamant Ore", description: "Dense adamant ore", itemId: "Adamant Ore", levelRequired: 70, xpReward: 120, duration: 100000, sortOrder: 17, regionId: "frozen_wastes" },
  { id: "mining_shadow_ore", skill: "mining", name: "Shadow Ore", description: "Mine shadow ore from the Quarry", itemId: "Shadow Ore", levelRequired: 18, xpReward: 45, duration: 20000, sortOrder: 18, regionId: "quarry" },
  { id: "mining_rune_ore", skill: "mining", name: "Rune Ore", description: "Magical rune ore", itemId: "Rune Ore", levelRequired: 85, xpReward: 180, duration: 140000, sortOrder: 18, regionId: "void_realm" },
  { id: "mining_sun_crystal", skill: "mining", name: "Sun Crystal", description: "Mine sun crystals from the Dunes", itemId: "Sun Crystal", levelRequired: 28, xpReward: 70, duration: 24000, sortOrder: 28, regionId: "dunes" },
  { id: "mining_obsidian_shard", skill: "mining", name: "Obsidian Shard", description: "Mine obsidian shards from Obsidian", itemId: "Obsidian Shard", levelRequired: 40, xpReward: 100, duration: 26000, sortOrder: 40, regionId: "obsidian" },
  { id: "mining_dragonstone", skill: "mining", name: "Dragonstone", description: "Mine dragonstone from Dragonspire", itemId: "Dragonstone", levelRequired: 55, xpReward: 150, duration: 28000, sortOrder: 55, regionId: "dragonspire" },
  { id: "mining_froststone", skill: "mining", name: "Froststone", description: "Mine froststone from the Frozen Wastes", itemId: "Froststone", levelRequired: 70, xpReward: 200, duration: 30000, sortOrder: 70, regionId: "frozen_wastes" },
  { id: "mining_void_crystal", skill: "mining", name: "Void Crystal", description: "Mine void crystals from the Void Realm", itemId: "Void Crystal", levelRequired: 85, xpReward: 280, duration: 32000, sortOrder: 85, regionId: "void_realm" },
  
  // Fishing - All regions
  { id: "fishing_spirit_fish", skill: "fishing", name: "Spirit Fish", description: "Catch spirit fish from Verdant", itemId: "Raw Spirit Fish", levelRequired: 5, xpReward: 20, duration: 15000, sortOrder: 5, regionId: "verdant" },
  { id: "fishing_shrimp", skill: "fishing", name: "Raw Shrimp", description: "Small shrimp in shallow waters", itemId: "Raw Shrimp", levelRequired: 0, xpReward: 10, duration: 12000, requiredBait: "Feather", baitAmount: 1, sortOrder: 20, regionId: "verdant" },
  { id: "fishing_sardine", skill: "fishing", name: "Raw Sardine", description: "Sardine fish", itemId: "Raw Sardine", levelRequired: 5, xpReward: 20, duration: 16000, requiredBait: "Feather", baitAmount: 1, sortOrder: 21, regionId: "verdant" },
  { id: "fishing_herring", skill: "fishing", name: "Raw Herring", description: "Herring fish", itemId: "Raw Herring", levelRequired: 10, xpReward: 30, duration: 20000, requiredBait: "Feather", baitAmount: 1, sortOrder: 22, regionId: "quarry" },
  { id: "fishing_trout", skill: "fishing", name: "Raw Trout", description: "Freshwater trout", itemId: "Raw Trout", levelRequired: 20, xpReward: 50, duration: 28000, requiredBait: "Feather", baitAmount: 1, sortOrder: 23, regionId: "quarry" },
  { id: "fishing_salmon", skill: "fishing", name: "Raw Salmon", description: "Fresh salmon", itemId: "Raw Salmon", levelRequired: 30, xpReward: 70, duration: 36000, requiredBait: "Feather", baitAmount: 1, sortOrder: 24, regionId: "dragonspire" },
  { id: "fishing_tuna", skill: "fishing", name: "Raw Tuna", description: "Large tuna fish", itemId: "Raw Tuna", levelRequired: 40, xpReward: 90, duration: 48000, requiredBait: "Feather", baitAmount: 2, sortOrder: 25, regionId: "obsidian" },
  { id: "fishing_lobster", skill: "fishing", name: "Raw Lobster", description: "Lobster from deep waters", itemId: "Raw Lobster", levelRequired: 50, xpReward: 120, duration: 60000, requiredBait: "Feather", baitAmount: 2, sortOrder: 26, regionId: "dragonspire" },
  { id: "fishing_swordfish", skill: "fishing", name: "Raw Swordfish", description: "Rare swordfish", itemId: "Raw Swordfish", levelRequired: 60, xpReward: 160, duration: 80000, requiredBait: "Feather", baitAmount: 3, sortOrder: 27, regionId: "dragonspire" },
  { id: "fishing_shark", skill: "fishing", name: "Raw Shark", description: "Dangerous shark", itemId: "Raw Shark", levelRequired: 70, xpReward: 200, duration: 100000, requiredBait: "Feather", baitAmount: 3, sortOrder: 28, regionId: "frozen_wastes" },
  { id: "fishing_cave_fish", skill: "fishing", name: "Cave Fish", description: "Catch cave fish from the Quarry", itemId: "Raw Cave Fish", levelRequired: 18, xpReward: 45, duration: 20000, sortOrder: 18, regionId: "obsidian" },
  { id: "fishing_sand_eel", skill: "fishing", name: "Sand Eel", description: "Catch sand eels from the Dunes", itemId: "Raw Sand Eel", levelRequired: 28, xpReward: 70, duration: 24000, sortOrder: 28, regionId: "dunes" },
  { id: "fishing_lava_fish", skill: "fishing", name: "Lava Fish", description: "Catch lava fish from Obsidian", itemId: "Raw Lava Fish", levelRequired: 40, xpReward: 100, duration: 26000, sortOrder: 40, regionId: "obsidian" },
  { id: "fishing_dragon_fish", skill: "fishing", name: "Dragon Fish", description: "Catch dragon fish from Dragonspire", itemId: "Raw Dragon Fish", levelRequired: 55, xpReward: 150, duration: 28000, sortOrder: 55, regionId: "dragonspire" },
  { id: "fishing_frost_fish", skill: "fishing", name: "Frost Fish", description: "Catch frost fish from the Frozen Wastes", itemId: "Raw Frost Fish", levelRequired: 70, xpReward: 200, duration: 30000, sortOrder: 70, regionId: "frozen_wastes" },
  { id: "fishing_void_fish", skill: "fishing", name: "Void Fish", description: "Catch void fish from the Void Realm", itemId: "Raw Void Fish", levelRequired: 85, xpReward: 280, duration: 32000, sortOrder: 85, regionId: "void_realm" },
  
  // Hunting - All regions (NEW)
  { id: "hunting_rabbit", skill: "hunting", name: "Rabbit", description: "Hunt wild rabbits", itemId: "raw_hide", levelRequired: 1, xpReward: 15, duration: 10000, sortOrder: 1, regionId: "verdant" },
  { id: "hunting_deer", skill: "hunting", name: "Deer", description: "Hunt forest deer", itemId: "leather_strip", levelRequired: 10, xpReward: 25, duration: 15000, sortOrder: 2, regionId: "verdant" },
  { id: "hunting_sheep", skill: "hunting", name: "Sheep", description: "Shear wild sheep for wool", itemId: "linen_cloth", levelRequired: 5, xpReward: 20, duration: 12000, sortOrder: 3, regionId: "verdant" },
  { id: "hunting_boar", skill: "hunting", name: "Wild Boar", description: "Hunt wild boars", itemId: "hardened_leather", levelRequired: 20, xpReward: 40, duration: 18000, sortOrder: 4, regionId: "quarry" },
  { id: "hunting_mountain_goat", skill: "hunting", name: "Mountain Goat", description: "Hunt mountain goats", itemId: "silk_thread", levelRequired: 25, xpReward: 45, duration: 20000, sortOrder: 5, regionId: "quarry" },
  { id: "hunting_desert_fox", skill: "hunting", name: "Desert Fox", description: "Hunt swift desert foxes", itemId: "studded_leather", levelRequired: 30, xpReward: 55, duration: 22000, sortOrder: 6, regionId: "dunes" },
  { id: "hunting_camel", skill: "hunting", name: "Wild Camel", description: "Hunt desert camels", itemId: "mystic_cloth", levelRequired: 35, xpReward: 65, duration: 25000, sortOrder: 7, regionId: "dunes" },
  { id: "hunting_shadow_wolf", skill: "hunting", name: "Shadow Wolf", description: "Hunt shadow wolves", itemId: "ranger_leather", levelRequired: 45, xpReward: 80, duration: 28000, sortOrder: 8, regionId: "obsidian" },
  { id: "hunting_dark_panther", skill: "hunting", name: "Dark Panther", description: "Hunt dark panthers", itemId: "arcane_silk", levelRequired: 50, xpReward: 90, duration: 30000, sortOrder: 9, regionId: "obsidian" },
  { id: "hunting_ice_bear", skill: "hunting", name: "Ice Bear", description: "Hunt massive ice bears", itemId: "shadow_leather", levelRequired: 60, xpReward: 110, duration: 35000, sortOrder: 10, regionId: "frozen_wastes" },
  { id: "hunting_frost_tiger", skill: "hunting", name: "Frost Tiger", description: "Hunt frost tigers", itemId: "divine_cloth", levelRequired: 65, xpReward: 120, duration: 38000, sortOrder: 11, regionId: "frozen_wastes" },
  { id: "hunting_wyvern", skill: "hunting", name: "Wyvern", description: "Hunt lesser wyverns", itemId: "dragon_leather", levelRequired: 75, xpReward: 150, duration: 45000, sortOrder: 12, regionId: "dragonspire" },
  { id: "hunting_celestial_stag", skill: "hunting", name: "Celestial Stag", description: "Hunt celestial stags", itemId: "void_silk", levelRequired: 80, xpReward: 175, duration: 50000, sortOrder: 13, regionId: "dragonspire" },
  { id: "hunting_void_beast", skill: "hunting", name: "Void Beast", description: "Hunt void beasts", itemId: "void_leather", levelRequired: 90, xpReward: 200, duration: 55000, sortOrder: 14, regionId: "void_realm" },
  { id: "hunting_abyssal_creature", skill: "hunting", name: "Abyssal Creature", description: "Hunt abyssal creatures", itemId: "void_silk", levelRequired: 95, xpReward: 250, duration: 60000, sortOrder: 15, regionId: "void_realm" },
];

const COMBAT_REGIONS_DATA: InsertGameCombatRegion[] = [
  { 
    id: "verdant", 
    name: "Yeşil Vadi", 
    description: "Yeni başlayanlar için uygun orman ve çayırlar",
    levelRangeMin: 1,
    levelRangeMax: 18,
    color: "green",
    sortOrder: 1
  },
  { 
    id: "quarry", 
    name: "Küllü Ocak", 
    description: "Demir ve kömür açısından zengin terkedilmiş maden",
    levelRangeMin: 10,
    levelRangeMax: 28,
    color: "amber",
    sortOrder: 2
  },
  { 
    id: "dunes", 
    name: "Yıldız Çölü", 
    description: "Gizemli yaratıkların yaşadığı büyülü çöl",
    levelRangeMin: 18,
    levelRangeMax: 36,
    color: "yellow",
    sortOrder: 3
  },
  { 
    id: "forest", 
    name: "Karanlık Orman", 
    description: "Tehlikeli yaratıkların yuvalandığı büyülü orman",
    levelRangeMin: 30,
    levelRangeMax: 55,
    color: "emerald",
    sortOrder: 4
  },
  { 
    id: "volcano", 
    name: "Ateş Dağı", 
    description: "En güçlü canavarların yaşadığı volkanik bölge",
    levelRangeMin: 45,
    levelRangeMax: 99,
    color: "red",
    sortOrder: 5
  }
];

export async function seedGameData(): Promise<{
  items: number;
  monsters: number;
  regions: number;
  recipes: number;
  skillActions: number;
  skipped: { items: number; monsters: number; regions: number; recipes: number; skillActions: number };
}> {
  const results = {
    items: 0,
    monsters: 0,
    regions: 0,
    recipes: 0,
    skillActions: 0,
    skipped: { items: 0, monsters: 0, regions: 0, recipes: 0, skillActions: 0 }
  };

  try {
    const { ITEMS, RECIPES } = await import('../client/src/lib/items-data');
    const { MONSTERS } = await import('../client/src/lib/monsters-data');

    const existingItems = await db.select({ id: gameItems.id }).from(gameItems);
    const existingItemIds = new Set(existingItems.map((i: { id: string }) => i.id));
    
    const existingMonsters = await db.select({ id: gameMonsters.id }).from(gameMonsters);
    const existingMonsterIds = new Set(existingMonsters.map((m: { id: string }) => m.id));
    
    const existingRegions = await db.select({ id: gameCombatRegions.id }).from(gameCombatRegions);
    const existingRegionIds = new Set(existingRegions.map((r: { id: string }) => r.id));
    
    const existingRecipes = await db.select({ id: gameRecipes.id }).from(gameRecipes);
    const existingRecipeIds = new Set(existingRecipes.map((r: { id: string }) => r.id));
    
    const existingSkillActions = await db.select({ id: gameSkillActions.id }).from(gameSkillActions);
    const existingSkillActionIds = new Set(existingSkillActions.map((s: { id: string }) => s.id));

    for (const region of COMBAT_REGIONS_DATA) {
      if (existingRegionIds.has(region.id)) {
        results.skipped.regions++;
        continue;
      }
      await db.insert(gameCombatRegions).values(region);
      results.regions++;
    }

    for (const item of ITEMS) {
      if (existingItemIds.has(item.id)) {
        results.skipped.items++;
        continue;
      }
      const dbItem: InsertGameItem = {
        id: item.id,
        name: item.name,
        description: item.description,
        type: item.type,
        equipSlot: (item as any).equipSlot,
        stats: (item as any).stats,
        levelRequired: (item as any).levelRequired,
        skillRequired: (item as any).skillRequired,
        vendorPrice: item.vendorPrice,
        untradable: (item as any).untradable ? 1 : 0,
        duration: (item as any).duration,
        effect: (item as any).effect,
        weaponCategory: (item as any).weaponCategory,
        attackSpeedMs: (item as any).attackSpeedMs,
        lifestealPercent: (item as any).lifestealPercent,
        weaponSkills: (item as any).weaponSkills,
        icon: (item as any).icon,
        healAmount: (item as any).healAmount,
      };
      await db.insert(gameItems).values(dbItem);
      results.items++;
    }

    let sortOrder = 1;
    for (const monster of MONSTERS) {
      if (existingMonsterIds.has(monster.id)) {
        results.skipped.monsters++;
        continue;
      }
      const dbMonster: InsertGameMonster = {
        id: monster.id,
        name: monster.name,
        regionId: (monster as any).region,
        maxHitpoints: monster.maxHitpoints,
        attackLevel: monster.attackLevel,
        strengthLevel: monster.strengthLevel,
        defenceLevel: monster.defenceLevel,
        attackBonus: monster.attackBonus,
        strengthBonus: monster.strengthBonus,
        attackSpeed: monster.attackSpeed,
        loot: monster.loot as any,
        xpReward: monster.xpReward as any,
        skills: (monster as any).skills,
        icon: (monster as any).icon,
        sortOrder: sortOrder++,
      };
      await db.insert(gameMonsters).values(dbMonster);
      results.monsters++;
    }

    for (const recipe of RECIPES) {
      if (existingRecipeIds.has(recipe.id)) {
        results.skipped.recipes++;
        continue;
      }
      const dbRecipe: InsertGameRecipe = {
        id: recipe.id,
        resultItemId: recipe.resultItemId,
        resultQuantity: recipe.resultQuantity,
        materials: recipe.materials as any,
        skill: recipe.skill,
        levelRequired: recipe.levelRequired,
        xpReward: recipe.xpReward,
        craftTime: recipe.craftTime,
        category: recipe.category,
      };
      await db.insert(gameRecipes).values(dbRecipe);
      results.recipes++;
    }

    // Seed skill actions
    for (const skillAction of SKILL_ACTIONS_DATA) {
      if (existingSkillActionIds.has(skillAction.id)) {
        results.skipped.skillActions++;
        continue;
      }
      await db.insert(gameSkillActions).values(skillAction);
      results.skillActions++;
    }

    await db.update(gameItems).set({ weaponCategory: '2h_sword' }).where(eq(gameItems.weaponCategory, 'spear'));
    await db.update(gameItems).set({ weaponCategory: '2h_axe' }).where(eq(gameItems.weaponCategory, 'battleaxe'));
    await db.update(gameRecipes).set({ category: '2h_sword' }).where(eq(gameRecipes.category, 'spear'));
    await db.update(gameRecipes).set({ category: '2h_axe' }).where(eq(gameRecipes.category, 'battleaxe'));

    console.log('[Seed] Game data seeding complete:', results);
    return results;
  } catch (error) {
    console.error('[Seed] Error seeding game data:', error);
    throw error;
  }
}

// Daily Login Rewards Data (15-day cycle)
const DAILY_LOGIN_REWARDS_DATA: Omit<InsertDailyLoginReward, 'id'>[] = [
  { day: 1, rewards: [{ itemId: "Minor Healing Potion", quantity: 10 }], isBonus: 0 },
  { day: 2, rewards: [{ itemId: "Gold Coins", quantity: 5000 }], isBonus: 0 },
  { day: 3, rewards: [{ itemId: "Chicken", quantity: 20 }], isBonus: 0 },
  { day: 4, rewards: [{ itemId: "Cooked Salmon", quantity: 10 }], isBonus: 0 },
  { day: 5, rewards: [{ itemId: "bronze_key", quantity: 3 }, { itemId: "Gold Coins", quantity: 15000 }], isBonus: 1 },
  { day: 6, rewards: [{ itemId: "Iron Bar", quantity: 50 }], isBonus: 0 },
  { day: 7, rewards: [{ itemId: "Cooked Lobster", quantity: 10 }], isBonus: 0 },
  { day: 8, rewards: [{ itemId: "Gold Coins", quantity: 25000 }], isBonus: 0 },
  { day: 9, rewards: [{ itemId: "silver_key", quantity: 2 }], isBonus: 0 },
  { day: 10, rewards: [{ itemId: "chaos_stone", quantity: 1 }, { itemId: "Gold Coins", quantity: 50000 }], isBonus: 1 },
  { day: 11, rewards: [{ itemId: "Mithril Bar", quantity: 30 }], isBonus: 0 },
  { day: 12, rewards: [{ itemId: "gold_key", quantity: 1 }], isBonus: 0 },
  { day: 13, rewards: [{ itemId: "XP Boost Potion", quantity: 3 }], isBonus: 0 },
  { day: 14, rewards: [{ itemId: "jurax_gem", quantity: 1 }], isBonus: 0 },
  { day: 15, rewards: [{ itemId: "void_key", quantity: 1 }, { itemId: "chaos_stone", quantity: 2 }, { itemId: "Gold Coins", quantity: 100000 }], isBonus: 1 },
];

// Daily Quest Templates Data
const DAILY_QUEST_TEMPLATES_DATA: InsertDailyQuestTemplate[] = [
  {
    id: "kill_any_10",
    questType: "kill_monsters",
    targetType: null,
    targetQuantity: 10,
    rewardItems: [{ itemId: "Minor Healing Potion", quantity: 5 }],
    rewardGold: 1000,
    rewardXp: null,
    difficulty: "easy",
    weight: 150,
    minPlayerLevel: 1,
    nameTranslations: { ar: "قاتل الوحوش", en: "Monster Slayer", es: "Cazador de Monstruos", fr: "Tueur de Monstres", hi: "राक्षस वधक", ru: "Охотник на Монстров", tr: "Canavar Avcısı", zh: "怪物杀手" },
    descriptionTranslations: { ar: "اقتل 10 وحوش", en: "Kill 10 monsters", es: "Mata 10 monstruos", fr: "Tuez 10 monstres", hi: "10 राक्षसों को मारें", ru: "Убейте 10 монстров", tr: "10 canavar öldür", zh: "击杀10只怪物" },
  },
  {
    id: "kill_any_25",
    questType: "kill_monsters",
    targetType: null,
    targetQuantity: 25,
    rewardItems: [{ itemId: "Cooked Salmon", quantity: 5 }],
    rewardGold: 3000,
    rewardXp: null,
    difficulty: "normal",
    weight: 100,
    minPlayerLevel: 10,
    nameTranslations: { ar: "محارب", en: "Warrior", es: "Guerrero", fr: "Guerrier", hi: "योद्धा", ru: "Воин", tr: "Savaşçı", zh: "战士" },
    descriptionTranslations: { ar: "اقتل 25 وحوش", en: "Kill 25 monsters", es: "Mata 25 monstruos", fr: "Tuez 25 monstres", hi: "25 राक्षसों को मारें", ru: "Убейте 25 монстров", tr: "25 canavar öldür", zh: "击杀25只怪物" },
  },
  {
    id: "kill_any_50",
    questType: "kill_monsters",
    targetType: null,
    targetQuantity: 50,
    rewardItems: [{ itemId: "bronze_key", quantity: 1 }],
    rewardGold: 5000,
    rewardXp: null,
    difficulty: "hard",
    weight: 50,
    minPlayerLevel: 20,
    nameTranslations: { ar: "بطل", en: "Champion", es: "Campeón", fr: "Champion", hi: "चैंपियन", ru: "Чемпион", tr: "Şampiyon", zh: "冠军" },
    descriptionTranslations: { ar: "اقتل 50 وحوش", en: "Kill 50 monsters", es: "Mata 50 monstruos", fr: "Tuez 50 monstres", hi: "50 राक्षसों को मारें", ru: "Убейте 50 монстров", tr: "50 canavar öldür", zh: "击杀50只怪物" },
  },
  {
    id: "gather_wood_25",
    questType: "gather_resources",
    targetType: "woodcutting",
    targetQuantity: 25,
    rewardItems: [{ itemId: "Gold Coins", quantity: 2000 }],
    rewardGold: 0,
    rewardXp: null,
    difficulty: "easy",
    weight: 100,
    minPlayerLevel: 1,
    nameTranslations: { ar: "حطاب", en: "Lumberjack", es: "Leñador", fr: "Bûcheron", hi: "लकड़हारा", ru: "Дровосек", tr: "Oduncu", zh: "伐木工" },
    descriptionTranslations: { ar: "اجمع 25 قطعة خشب", en: "Gather 25 logs", es: "Recoge 25 troncos", fr: "Récoltez 25 bûches", hi: "25 लकड़ी इकट्ठा करें", ru: "Соберите 25 брёвен", tr: "25 odun topla", zh: "收集25根木头" },
  },
  {
    id: "gather_ore_20",
    questType: "gather_resources",
    targetType: "mining",
    targetQuantity: 20,
    rewardItems: [{ itemId: "Gold Coins", quantity: 2500 }],
    rewardGold: 0,
    rewardXp: null,
    difficulty: "normal",
    weight: 100,
    minPlayerLevel: 5,
    nameTranslations: { ar: "عامل منجم", en: "Miner", es: "Minero", fr: "Mineur", hi: "खनिक", ru: "Шахтёр", tr: "Madenci", zh: "矿工" },
    descriptionTranslations: { ar: "استخرج 20 خام", en: "Mine 20 ores", es: "Extrae 20 minerales", fr: "Extrayez 20 minerais", hi: "20 अयस्क खोदें", ru: "Добудьте 20 руды", tr: "20 cevher kaz", zh: "开采20矿石" },
  },
  {
    id: "gather_fish_15",
    questType: "gather_resources",
    targetType: "fishing",
    targetQuantity: 15,
    rewardItems: [{ itemId: "Cooked Trout", quantity: 10 }],
    rewardGold: 1500,
    rewardXp: null,
    difficulty: "easy",
    weight: 80,
    minPlayerLevel: 1,
    nameTranslations: { ar: "صياد", en: "Fisherman", es: "Pescador", fr: "Pêcheur", hi: "मछुआरा", ru: "Рыбак", tr: "Balıkçı", zh: "渔夫" },
    descriptionTranslations: { ar: "اصطد 15 سمكة", en: "Catch 15 fish", es: "Pesca 15 peces", fr: "Pêchez 15 poissons", hi: "15 मछली पकड़ें", ru: "Поймайте 15 рыб", tr: "15 balık tut", zh: "钓15条鱼" },
  },
  {
    id: "craft_items_5",
    questType: "craft_items",
    targetType: null,
    targetQuantity: 5,
    rewardItems: [{ itemId: "Cooked Lobster", quantity: 5 }],
    rewardGold: 2000,
    rewardXp: null,
    difficulty: "normal",
    weight: 80,
    minPlayerLevel: 10,
    nameTranslations: { ar: "حرفي", en: "Artisan", es: "Artesano", fr: "Artisan", hi: "कारीगर", ru: "Ремесленник", tr: "Zanaatkar", zh: "工匠" },
    descriptionTranslations: { ar: "اصنع 5 عناصر", en: "Craft 5 items", es: "Fabrica 5 objetos", fr: "Fabriquez 5 objets", hi: "5 वस्तुएं बनाएं", ru: "Создайте 5 предметов", tr: "5 eşya üret", zh: "制作5件物品" },
  },
  {
    id: "cook_food_10",
    questType: "craft_items",
    targetType: "cooking",
    targetQuantity: 10,
    rewardItems: [{ itemId: "Cooked Meat", quantity: 10 }],
    rewardGold: 1000,
    rewardXp: null,
    difficulty: "easy",
    weight: 100,
    minPlayerLevel: 1,
    nameTranslations: { ar: "طاهي", en: "Chef", es: "Chef", fr: "Chef", hi: "रसोइया", ru: "Повар", tr: "Aşçı", zh: "厨师" },
    descriptionTranslations: { ar: "اطبخ 10 وجبات", en: "Cook 10 meals", es: "Cocina 10 comidas", fr: "Cuisinez 10 repas", hi: "10 भोजन पकाएं", ru: "Приготовьте 10 блюд", tr: "10 yemek pişir", zh: "烹饪10道菜" },
  },
];

// Migration: Fix invalid item IDs in daily login rewards
async function migrateDailyRewardsItemIds(): Promise<void> {
  try {
    // Check if any rewards have old invalid item IDs
    const existingRewards = await db.select().from(dailyLoginRewards);
    let needsMigration = false;
    
    for (const reward of existingRewards) {
      const rewardsJson = JSON.stringify(reward.rewards);
      if (rewardsJson.includes('health_potion') || 
          rewardsJson.includes('cooked_chicken') || 
          rewardsJson.includes('strength_potion') ||
          rewardsJson.includes('attack_potion') ||
          rewardsJson.includes('iron_bar') ||
          rewardsJson.includes('mithril_bar') ||
          rewardsJson.includes('xp_boost_potion')) {
        needsMigration = true;
        break;
      }
    }
    
    if (!needsMigration) return;
    
    console.log('[Migration] Fixing invalid item IDs in daily login rewards...');
    
    // Delete all and reinsert with correct data
    await db.delete(dailyLoginRewards);
    for (const reward of DAILY_LOGIN_REWARDS_DATA) {
      await db.insert(dailyLoginRewards).values(reward);
    }
    
    console.log('[Migration] Daily login rewards item IDs fixed');
  } catch (error) {
    console.error('[Migration] Error fixing daily rewards item IDs:', error);
  }
}

// Migration: Fix invalid item IDs in daily quest templates
async function migrateQuestTemplatesItemIds(): Promise<void> {
  try {
    // Check if any templates have old invalid item IDs
    const existingTemplates = await db.select().from(dailyQuestTemplates);
    let needsMigration = false;
    
    for (const template of existingTemplates) {
      const rewardsJson = JSON.stringify(template.rewardItems);
      if (rewardsJson.includes('health_potion') || 
          rewardsJson.includes('strength_potion') ||
          rewardsJson.includes('attack_potion') ||
          rewardsJson.includes('cooked_fish')) {
        needsMigration = true;
        break;
      }
    }
    
    if (!needsMigration) return;
    
    console.log('[Migration] Fixing invalid item IDs in daily quest templates...');
    
    // First delete player daily quests (they reference templates)
    await db.execute(sql`DELETE FROM player_daily_quests`);
    
    // Then delete all templates and reinsert with correct data
    await db.delete(dailyQuestTemplates);
    for (const template of DAILY_QUEST_TEMPLATES_DATA) {
      await db.insert(dailyQuestTemplates).values(template);
    }
    
    console.log('[Migration] Daily quest templates item IDs fixed (player quests reset)');
  } catch (error) {
    console.error('[Migration] Error fixing quest templates item IDs:', error);
  }
}

// Seed daily login rewards and quest templates
export async function seedDailyData(): Promise<{ loginRewards: number; questTemplates: number }> {
  const results = { loginRewards: 0, questTemplates: 0 };
  
  try {
    // First, run migrations to fix any invalid item IDs
    await migrateDailyRewardsItemIds();
    await migrateQuestTemplatesItemIds();
    
    // Check if daily login rewards exist
    const existingRewards = await db.select().from(dailyLoginRewards);
    if (existingRewards.length === 0) {
      for (const reward of DAILY_LOGIN_REWARDS_DATA) {
        await db.insert(dailyLoginRewards).values(reward);
        results.loginRewards++;
      }
      console.log(`[Seed] Inserted ${results.loginRewards} daily login rewards`);
    } else {
      console.log(`[Seed] Daily login rewards already exist (${existingRewards.length} rows), skipping`);
    }
    
    // Check if daily quest templates exist
    const existingTemplates = await db.select().from(dailyQuestTemplates);
    if (existingTemplates.length === 0) {
      for (const template of DAILY_QUEST_TEMPLATES_DATA) {
        await db.insert(dailyQuestTemplates).values(template);
        results.questTemplates++;
      }
      console.log(`[Seed] Inserted ${results.questTemplates} daily quest templates`);
    } else {
      console.log(`[Seed] Daily quest templates already exist (${existingTemplates.length} rows), skipping`);
    }
    
    return results;
  } catch (error) {
    console.error('[Seed] Error seeding daily data:', error);
    throw error;
  }
}

const FLOOR_TEMPLATES = [
  { id: 'gc_early', dungeonId: 'goblin_caves', floorRangeStart: 1, floorRangeEnd: 7, monsterPool: ['goblin', 'forest_spider'], monsterCountMin: 1, monsterCountMax: 2, modifierChance: 5, lootMultiplier: 100, isBossFloor: 0, bossMonsterIds: [], powerMultiplier: 100 },
  { id: 'gc_mid', dungeonId: 'goblin_caves', floorRangeStart: 8, floorRangeEnd: 8, monsterPool: ['goblin', 'forest_spider', 'wolf'], monsterCountMin: 1, monsterCountMax: 2, modifierChance: 10, lootMultiplier: 200, isBossFloor: 1, bossMonsterIds: ['goblin_king'], powerMultiplier: 130 },
  { id: 'gc_late', dungeonId: 'goblin_caves', floorRangeStart: 9, floorRangeEnd: 14, monsterPool: ['wolf', 'bandit', 'forest_spider'], monsterCountMin: 1, monsterCountMax: 3, modifierChance: 15, lootMultiplier: 200, isBossFloor: 0, bossMonsterIds: [], powerMultiplier: 160 },
  { id: 'gc_boss', dungeonId: 'goblin_caves', floorRangeStart: 15, floorRangeEnd: 15, monsterPool: ['bandit'], monsterCountMin: 1, monsterCountMax: 1, modifierChance: 0, lootMultiplier: 400, isBossFloor: 1, bossMonsterIds: ['goblin_king'], powerMultiplier: 200 },
  { id: 'sc_early', dungeonId: 'shadow_crypt', floorRangeStart: 1, floorRangeEnd: 8, monsterPool: ['cave_bat', 'skeleton'], monsterCountMin: 1, monsterCountMax: 2, modifierChance: 5, lootMultiplier: 120, isBossFloor: 0, bossMonsterIds: [], powerMultiplier: 100 },
  { id: 'sc_mid', dungeonId: 'shadow_crypt', floorRangeStart: 9, floorRangeEnd: 12, monsterPool: ['skeleton', 'zombie', 'rock_golem'], monsterCountMin: 1, monsterCountMax: 2, modifierChance: 10, lootMultiplier: 180, isBossFloor: 0, bossMonsterIds: [], powerMultiplier: 140 },
  { id: 'sc_midboss', dungeonId: 'shadow_crypt', floorRangeStart: 13, floorRangeEnd: 13, monsterPool: ['cave_troll'], monsterCountMin: 1, monsterCountMax: 1, modifierChance: 0, lootMultiplier: 300, isBossFloor: 1, bossMonsterIds: ['lich_lord'], powerMultiplier: 180 },
  { id: 'sc_late', dungeonId: 'shadow_crypt', floorRangeStart: 14, floorRangeEnd: 24, monsterPool: ['zombie', 'cave_troll', 'rock_golem'], monsterCountMin: 1, monsterCountMax: 3, modifierChance: 20, lootMultiplier: 250, isBossFloor: 0, bossMonsterIds: [], powerMultiplier: 200 },
  { id: 'sc_boss', dungeonId: 'shadow_crypt', floorRangeStart: 25, floorRangeEnd: 25, monsterPool: ['cave_troll'], monsterCountMin: 1, monsterCountMax: 1, modifierChance: 0, lootMultiplier: 500, isBossFloor: 1, bossMonsterIds: ['lich_lord'], powerMultiplier: 260 },
  { id: 'dl_early', dungeonId: 'dragons_lair', floorRangeStart: 1, floorRangeEnd: 10, monsterPool: ['orc_grunt', 'orc_warrior', 'desert_scorpion'], monsterCountMin: 1, monsterCountMax: 2, modifierChance: 5, lootMultiplier: 150, isBossFloor: 0, bossMonsterIds: [], powerMultiplier: 100 },
  { id: 'dl_mid', dungeonId: 'dragons_lair', floorRangeStart: 11, floorRangeEnd: 16, monsterPool: ['orc_warrior', 'hill_giant', 'shadow_stalker'], monsterCountMin: 1, monsterCountMax: 2, modifierChance: 15, lootMultiplier: 250, isBossFloor: 0, bossMonsterIds: [], powerMultiplier: 150 },
  { id: 'dl_midboss', dungeonId: 'dragons_lair', floorRangeStart: 17, floorRangeEnd: 17, monsterPool: ['shadow_stalker'], monsterCountMin: 1, monsterCountMax: 1, modifierChance: 0, lootMultiplier: 350, isBossFloor: 1, bossMonsterIds: ['ancient_dragon_boss'], powerMultiplier: 200 },
  { id: 'dl_late', dungeonId: 'dragons_lair', floorRangeStart: 18, floorRangeEnd: 34, monsterPool: ['shadow_stalker', 'dark_knight', 'wyvern', 'fire_drake'], monsterCountMin: 1, monsterCountMax: 3, modifierChance: 25, lootMultiplier: 350, isBossFloor: 0, bossMonsterIds: [], powerMultiplier: 240 },
  { id: 'dl_boss', dungeonId: 'dragons_lair', floorRangeStart: 35, floorRangeEnd: 35, monsterPool: ['dark_knight'], monsterCountMin: 1, monsterCountMax: 1, modifierChance: 0, lootMultiplier: 600, isBossFloor: 1, bossMonsterIds: ['ancient_dragon_boss'], powerMultiplier: 320 },
  { id: 'va_early', dungeonId: 'void_abyss', floorRangeStart: 1, floorRangeEnd: 14, monsterPool: ['void_wraith', 'shadow_demon'], monsterCountMin: 1, monsterCountMax: 2, modifierChance: 10, lootMultiplier: 200, isBossFloor: 0, bossMonsterIds: [], powerMultiplier: 100 },
  { id: 'va_mid', dungeonId: 'void_abyss', floorRangeStart: 15, floorRangeEnd: 22, monsterPool: ['shadow_demon', 'void_elemental', 'void_knight'], monsterCountMin: 1, monsterCountMax: 2, modifierChance: 20, lootMultiplier: 300, isBossFloor: 0, bossMonsterIds: [], powerMultiplier: 160 },
  { id: 'va_midboss', dungeonId: 'void_abyss', floorRangeStart: 23, floorRangeEnd: 23, monsterPool: ['void_knight'], monsterCountMin: 1, monsterCountMax: 1, modifierChance: 0, lootMultiplier: 400, isBossFloor: 1, bossMonsterIds: ['void_king'], powerMultiplier: 220 },
  { id: 'va_late', dungeonId: 'void_abyss', floorRangeStart: 24, floorRangeEnd: 49, monsterPool: ['void_knight', 'void_lord', 'void_elemental'], monsterCountMin: 1, monsterCountMax: 3, modifierChance: 30, lootMultiplier: 500, isBossFloor: 0, bossMonsterIds: [], powerMultiplier: 280 },
  { id: 'va_boss', dungeonId: 'void_abyss', floorRangeStart: 50, floorRangeEnd: 50, monsterPool: ['void_lord'], monsterCountMin: 1, monsterCountMax: 1, modifierChance: 0, lootMultiplier: 800, isBossFloor: 1, bossMonsterIds: ['void_king'], powerMultiplier: 380 },
];

const LOOT_TABLES = [
  { id: 'gc_loot_early', dungeonId: 'goblin_caves', floorRangeStart: 1, floorRangeEnd: 7, commonChance: 55, uncommonChance: 28, rareChance: 12, epicChance: 4, legendaryChance: 1, mythicChance: 0, guaranteedDrops: ['dungeon_dust'], possibleDrops: [{itemId: 'cursed_bone', weight: 35}, {itemId: 'shadow_shard', weight: 15}] },
  { id: 'gc_loot_mid', dungeonId: 'goblin_caves', floorRangeStart: 8, floorRangeEnd: 8, commonChance: 40, uncommonChance: 28, rareChance: 16, epicChance: 10, legendaryChance: 4, mythicChance: 2, guaranteedDrops: ['dungeon_dust', 'shadow_shard'], possibleDrops: [{itemId: 'cursed_bone', weight: 40}, {itemId: 'goblin_treasure_sack', weight: 20}, {itemId: 'goblin_crown', weight: 5}, {itemId: 'goblin_blade', weight: 5}], partyExclusiveDrops: [{itemId: 'goblin_war_banner', partyWeight: 1, soloWeight: 0.01}] },
  { id: 'gc_loot_late', dungeonId: 'goblin_caves', floorRangeStart: 9, floorRangeEnd: 14, commonChance: 40, uncommonChance: 30, rareChance: 15, epicChance: 10, legendaryChance: 4, mythicChance: 1, guaranteedDrops: ['dungeon_dust', 'shadow_shard'], possibleDrops: [{itemId: 'goblin_treasure_sack', weight: 25}, {itemId: 'cursed_bone', weight: 30}, {itemId: 'goblin_crown', weight: 4}, {itemId: 'goblin_blade', weight: 4}] },
  { id: 'gc_loot_boss', dungeonId: 'goblin_caves', floorRangeStart: 15, floorRangeEnd: 15, commonChance: 25, uncommonChance: 25, rareChance: 20, epicChance: 16, legendaryChance: 10, mythicChance: 4, guaranteedDrops: ['goblin_treasure_sack', 'shadow_shard'], possibleDrops: [{itemId: 'goblin_crown', weight: 15}, {itemId: 'goblin_blade', weight: 15}, {itemId: 'soul_gem', weight: 10}], partyExclusiveDrops: [{itemId: 'goblin_war_banner', partyWeight: 3, soloWeight: 0.03}, {itemId: 'goblin_treasure_key', partyWeight: 5, soloWeight: 0.05}] },
  { id: 'sc_loot_early', dungeonId: 'shadow_crypt', floorRangeStart: 1, floorRangeEnd: 8, commonChance: 50, uncommonChance: 28, rareChance: 14, epicChance: 6, legendaryChance: 2, mythicChance: 0, guaranteedDrops: ['dungeon_dust'], possibleDrops: [{itemId: 'cursed_bone', weight: 35}, {itemId: 'undead_essence', weight: 25}] },
  { id: 'sc_loot_mid', dungeonId: 'shadow_crypt', floorRangeStart: 9, floorRangeEnd: 12, commonChance: 40, uncommonChance: 28, rareChance: 16, epicChance: 10, legendaryChance: 4, mythicChance: 2, guaranteedDrops: ['dungeon_dust', 'cursed_bone'], possibleDrops: [{itemId: 'undead_essence', weight: 30}, {itemId: 'soul_gem', weight: 12}, {itemId: 'shadow_shard', weight: 20}] },
  { id: 'sc_loot_midboss', dungeonId: 'shadow_crypt', floorRangeStart: 13, floorRangeEnd: 13, commonChance: 25, uncommonChance: 25, rareChance: 20, epicChance: 16, legendaryChance: 10, mythicChance: 4, guaranteedDrops: ['shadow_shard', 'cursed_bone'], possibleDrops: [{itemId: 'soul_gem', weight: 20}, {itemId: 'undead_essence', weight: 25}, {itemId: 'crypt_ward_shield', weight: 6}, {itemId: 'lich_staff', weight: 6}], partyExclusiveDrops: [{itemId: 'lich_soul_fragment', partyWeight: 1.5, soloWeight: 0.015}] },
  { id: 'sc_loot_late', dungeonId: 'shadow_crypt', floorRangeStart: 14, floorRangeEnd: 24, commonChance: 30, uncommonChance: 26, rareChance: 20, epicChance: 14, legendaryChance: 7, mythicChance: 3, guaranteedDrops: ['shadow_shard', 'undead_essence'], possibleDrops: [{itemId: 'soul_gem', weight: 22}, {itemId: 'crypt_ward_shield', weight: 4}, {itemId: 'lich_staff', weight: 4}] },
  { id: 'sc_loot_boss', dungeonId: 'shadow_crypt', floorRangeStart: 25, floorRangeEnd: 25, commonChance: 20, uncommonChance: 22, rareChance: 22, epicChance: 18, legendaryChance: 12, mythicChance: 6, guaranteedDrops: ['soul_gem', 'undead_essence'], possibleDrops: [{itemId: 'crypt_ward_shield', weight: 14}, {itemId: 'lich_staff', weight: 14}, {itemId: 'dragon_scale', weight: 6}], partyExclusiveDrops: [{itemId: 'lich_soul_fragment', partyWeight: 3, soloWeight: 0.03}, {itemId: 'necrotic_essence', partyWeight: 4, soloWeight: 0.04}] },
  { id: 'dl_loot_early', dungeonId: 'dragons_lair', floorRangeStart: 1, floorRangeEnd: 10, commonChance: 45, uncommonChance: 28, rareChance: 14, epicChance: 8, legendaryChance: 3, mythicChance: 2, guaranteedDrops: ['shadow_shard'], possibleDrops: [{itemId: 'cursed_bone', weight: 30}, {itemId: 'dragon_bone', weight: 20}] },
  { id: 'dl_loot_mid', dungeonId: 'dragons_lair', floorRangeStart: 11, floorRangeEnd: 16, commonChance: 35, uncommonChance: 26, rareChance: 18, epicChance: 12, legendaryChance: 6, mythicChance: 3, guaranteedDrops: ['shadow_shard', 'dragon_bone'], possibleDrops: [{itemId: 'dragon_scale', weight: 22}, {itemId: 'soul_gem', weight: 12}, {itemId: 'dragon_fang_blade', weight: 3}, {itemId: 'dragonscale_armor', weight: 3}] },
  { id: 'dl_loot_midboss', dungeonId: 'dragons_lair', floorRangeStart: 17, floorRangeEnd: 17, commonChance: 20, uncommonChance: 22, rareChance: 22, epicChance: 18, legendaryChance: 12, mythicChance: 6, guaranteedDrops: ['dragon_bone', 'dragon_scale'], possibleDrops: [{itemId: 'soul_gem', weight: 15}, {itemId: 'dragon_fang_blade', weight: 8}, {itemId: 'dragonscale_armor', weight: 8}], partyExclusiveDrops: [{itemId: 'dragon_heart', partyWeight: 1, soloWeight: 0.01}] },
  { id: 'dl_loot_late', dungeonId: 'dragons_lair', floorRangeStart: 18, floorRangeEnd: 34, commonChance: 25, uncommonChance: 24, rareChance: 20, epicChance: 16, legendaryChance: 9, mythicChance: 6, guaranteedDrops: ['dragon_bone', 'dragon_scale'], possibleDrops: [{itemId: 'dragon_fang_blade', weight: 5}, {itemId: 'dragonscale_armor', weight: 5}, {itemId: 'void_essence_crystal', weight: 8}] },
  { id: 'dl_loot_boss', dungeonId: 'dragons_lair', floorRangeStart: 35, floorRangeEnd: 35, commonChance: 15, uncommonChance: 20, rareChance: 22, epicChance: 20, legendaryChance: 14, mythicChance: 9, guaranteedDrops: ['dragon_scale', 'dragon_bone'], possibleDrops: [{itemId: 'dragon_fang_blade', weight: 12}, {itemId: 'dragonscale_armor', weight: 12}, {itemId: 'void_essence_crystal', weight: 10}], partyExclusiveDrops: [{itemId: 'dragon_heart', partyWeight: 2, soloWeight: 0.02}, {itemId: 'molten_dragon_scale', partyWeight: 4, soloWeight: 0.04}] },
  { id: 'va_loot_early', dungeonId: 'void_abyss', floorRangeStart: 1, floorRangeEnd: 14, commonChance: 40, uncommonChance: 25, rareChance: 16, epicChance: 11, legendaryChance: 5, mythicChance: 3, guaranteedDrops: ['shadow_shard'], possibleDrops: [{itemId: 'dragon_bone', weight: 25}, {itemId: 'dragon_scale', weight: 18}, {itemId: 'void_essence_crystal', weight: 12}] },
  { id: 'va_loot_mid', dungeonId: 'void_abyss', floorRangeStart: 15, floorRangeEnd: 22, commonChance: 30, uncommonChance: 24, rareChance: 20, epicChance: 14, legendaryChance: 8, mythicChance: 4, guaranteedDrops: ['dragon_scale', 'void_essence_crystal'], possibleDrops: [{itemId: 'soul_gem', weight: 22}, {itemId: 'void_heart_amulet', weight: 3}] },
  { id: 'va_loot_midboss', dungeonId: 'void_abyss', floorRangeStart: 23, floorRangeEnd: 23, commonChance: 15, uncommonChance: 20, rareChance: 22, epicChance: 20, legendaryChance: 14, mythicChance: 9, guaranteedDrops: ['void_essence_crystal', 'dragon_scale'], possibleDrops: [{itemId: 'soul_gem', weight: 18}, {itemId: 'void_heart_amulet', weight: 6}, {itemId: 'void_soulreaver', weight: 6}], partyExclusiveDrops: [{itemId: 'void_fragment', partyWeight: 2, soloWeight: 0.02}] },
  { id: 'va_loot_late', dungeonId: 'void_abyss', floorRangeStart: 24, floorRangeEnd: 49, commonChance: 20, uncommonChance: 20, rareChance: 22, epicChance: 18, legendaryChance: 12, mythicChance: 8, guaranteedDrops: ['void_essence_crystal'], possibleDrops: [{itemId: 'void_soulreaver', weight: 4}, {itemId: 'void_heart_amulet', weight: 5}, {itemId: 'dragon_fang_blade', weight: 7}] },
  { id: 'va_loot_boss', dungeonId: 'void_abyss', floorRangeStart: 50, floorRangeEnd: 50, commonChance: 10, uncommonChance: 15, rareChance: 22, epicChance: 22, legendaryChance: 18, mythicChance: 13, guaranteedDrops: ['void_essence_crystal', 'void_essence_crystal'], possibleDrops: [{itemId: 'void_soulreaver', weight: 10}, {itemId: 'void_heart_amulet', weight: 10}, {itemId: 'dragonscale_armor', weight: 7}], partyExclusiveDrops: [{itemId: 'void_fragment', partyWeight: 5, soloWeight: 0.05}, {itemId: 'void_crown_shard', partyWeight: 2, soloWeight: 0.02}, {itemId: 'dimensional_tear', partyWeight: 3, soloWeight: 0.03}] },
];

const DUNGEON_MONSTERS = [
  {
    id: 'goblin_king', name: 'Goblin King', regionId: 'dungeon',
    maxHitpoints: 400, attackLevel: 45, strengthLevel: 50, defenceLevel: 35,
    attackBonus: 0, strengthBonus: 0, attackSpeed: 2800,
    loot: [{chance: 100, itemId: 'Gold Coins', maxQty: 500, minQty: 200}, {chance: 5, itemId: 'goblin_crown', maxQty: 1, minQty: 1}, {chance: 3.33, itemId: 'goblin_blade', maxQty: 1, minQty: 1}, {chance: 16.67, itemId: 'goblin_treasure_sack', maxQty: 3, minQty: 1}],
    xpReward: {attack: 30, strength: 30, defence: 30, hitpoints: 15},
    skills: [
      {id: 'goblin_frenzy', hits: 3, name: 'Goblin Frenzy', type: 'combo', chance: 25},
      {id: 'war_cry', name: 'War Cry', type: 'enrage', chance: 100, enrageThreshold: 40, enrageDamageBoost: 1.3},
      {id: 'goblin_rally', name: 'Goblin Rally', type: 'summon_adds', chance: 30, summonCount: 2, summonHpPercent: 15, activateAtHpPercent: 60, maxActivations: 1}
    ],
    icon: 'goblin_king', sortOrder: 0,
    nameTranslations: {ar: 'ملك العفاريت', es: 'Rey Goblin', fr: 'Roi Gobelin', hi: 'गोब्लिन राजा', ru: 'Король гоблинов', tr: 'Goblin Kralı', zh: '哥布林之王'}
  },
  {
    id: 'lich_lord', name: 'Lich Lord', regionId: 'dungeon',
    maxHitpoints: 2500, attackLevel: 90, strengthLevel: 100, defenceLevel: 80,
    attackBonus: 0, strengthBonus: 0, attackSpeed: 2600,
    loot: [{chance: 100, itemId: 'Gold Coins', maxQty: 1200, minQty: 500}, {chance: 2.67, itemId: 'lich_staff', maxQty: 1, minQty: 1}, {chance: 3.33, itemId: 'crypt_ward_shield', maxQty: 1, minQty: 1}, {chance: 13.33, itemId: 'soul_gem', maxQty: 3, minQty: 1}, {chance: 20, itemId: 'undead_essence', maxQty: 5, minQty: 2}],
    xpReward: {attack: 65, strength: 65, defence: 65, hitpoints: 25},
    skills: [
      {id: 'soul_drain', name: 'Soul Drain', type: 'lifesteal', chance: 30, lifestealPercent: 50},
      {id: 'curse_of_undeath', name: 'Curse of Undeath', type: 'poison', chance: 25, dotDamage: 80, dotDuration: 8},
      {id: 'dark_resurrection', name: 'Dark Resurrection', type: 'enrage', chance: 100, enrageThreshold: 30, enrageDamageBoost: 1.5},
      {id: 'soul_harvest', name: 'Soul Harvest', type: 'heal_on_player_heal', chance: 100, healPercent: 5},
      {id: 'death_coil', name: 'Death Coil', type: 'aggro_swap', chance: 100, aggroSwapInterval: 3, aggroSwapBonusDmg: 3}
    ],
    icon: 'lich_lord', sortOrder: 0,
    nameTranslations: {ar: 'سيد اللعنة', es: 'Señor Lich', fr: 'Seigneur Liche', hi: 'लिच लॉर्ड', ru: 'Лич Лорд', tr: 'Lich Lord', zh: '巫妖之王'}
  },
  {
    id: 'ancient_dragon_boss', name: 'Ancient Dragon', regionId: 'dungeon',
    maxHitpoints: 6000, attackLevel: 160, strengthLevel: 180, defenceLevel: 150,
    attackBonus: 0, strengthBonus: 0, attackSpeed: 3000,
    loot: [{chance: 100, itemId: 'Gold Coins', maxQty: 3000, minQty: 1500}, {chance: 15, itemId: 'dragon_scale', maxQty: 5, minQty: 2}, {chance: 10, itemId: 'dragon_bone', maxQty: 3, minQty: 1}, {chance: 3, itemId: 'dragon_fang_blade', maxQty: 1, minQty: 1}, {chance: 3, itemId: 'dragonscale_armor', maxQty: 1, minQty: 1}],
    xpReward: {attack: 150, strength: 150, defence: 150, hitpoints: 50},
    skills: [
      {id: 'fire_breath', name: 'Fire Breath', type: 'mass_burn', chance: 35, massBurnDamage: 100, massBurnDuration: 5},
      {id: 'dragon_fire_breath', name: 'Dragon Fire Breath', type: 'mass_stun', chance: 20, stunDuration: 2},
      {id: 'tail_sweep', name: 'Tail Sweep', type: 'mass_armor_break', chance: 25, massArmorBreakPercent: 40, massArmorBreakDuration: 5000},
      {id: 'molten_armor', name: 'Molten Armor', type: 'reflect_damage', chance: 100, reflectPercent: 4, flatReflect: 25, activateAtHpPercent: 50},
      {id: 'dragon_rage', name: 'Dragon Rage', type: 'enrage', chance: 100, enrageThreshold: 40, enrageDamageBoost: 1.5}
    ],
    icon: 'ancient_dragon', sortOrder: 0,
    nameTranslations: {ar: 'التنين القديم', es: 'Dragón Ancestral', fr: 'Dragon Ancien', hi: 'प्राचीन ड्रैगन', ru: 'Древний дракон', tr: 'Kadim Ejderha', zh: '远古巨龙'}
  },
  {
    id: 'void_king', name: 'Void King', regionId: 'dungeon',
    maxHitpoints: 12000, attackLevel: 250, strengthLevel: 280, defenceLevel: 230,
    attackBonus: 0, strengthBonus: 0, attackSpeed: 2800,
    loot: [{chance: 100, itemId: 'Gold Coins', maxQty: 8000, minQty: 4000}, {chance: 20, itemId: 'void_essence_crystal', maxQty: 5, minQty: 2}, {chance: 5, itemId: 'void_soulreaver', maxQty: 1, minQty: 1}, {chance: 5, itemId: 'void_heart_amulet', maxQty: 1, minQty: 1}],
    xpReward: {attack: 300, strength: 300, defence: 300, hitpoints: 100},
    skills: [
      {id: 'void_pulse', name: 'Void Pulse', type: 'mass_stun', chance: 30, stunDuration: 2},
      {id: 'reality_warp', name: 'Reality Warp', type: 'aggro_reset', chance: 20},
      {id: 'void_drain', name: 'Void Drain', type: 'lifesteal', chance: 35, lifestealPercent: 60},
      {id: 'dimensional_rift', name: 'Dimensional Rift', type: 'buff_punish', chance: 100, buffPunishMultiplier: 0.25},
      {id: 'oblivion', name: 'Oblivion', type: 'enrage', chance: 100, enrageThreshold: 25, enrageDamageBoost: 2.0},
      {id: 'void_execute', name: 'Void Execute', type: 'execute_player', chance: 40, executeThreshold: 15}
    ],
    icon: 'void_king', sortOrder: 0,
    nameTranslations: {ar: 'ملك الفراغ', es: 'Rey del Vacío', fr: 'Roi du Vide', hi: 'शून्य राजा', ru: 'Король Пустоты', tr: 'Boşluk Kralı', zh: '虚空之王'}
  },
  {
    id: 'mother_of_nature', name: 'Mother of Nature', regionId: 'dungeon',
    maxHitpoints: 4000, attackLevel: 120, strengthLevel: 135, defenceLevel: 110,
    attackBonus: 0, strengthBonus: 0, attackSpeed: 3200,
    loot: [{chance: 100, itemId: 'Gold Coins', maxQty: 2500, minQty: 1200}, {chance: 20, itemId: 'verdant_heartwood', maxQty: 3, minQty: 1}, {chance: 4, itemId: 'natures_crown', maxQty: 1, minQty: 1}, {chance: 4, itemId: 'vine_lash_whip', maxQty: 1, minQty: 1}],
    xpReward: {attack: 120, strength: 120, defence: 120, hitpoints: 40},
    skills: [
      {id: 'natures_wrath', name: "Nature's Wrath", type: 'buff_punish', chance: 100, buffPunishMultiplier: 1.0},
      {id: 'regeneration', name: 'Regeneration', type: 'self_heal_percent', chance: 100, selfHealPercent: 3},
      {id: 'vine_grasp', name: 'Vine Grasp', type: 'root', chance: 30, rootDuration: 3000, rootTargets: 2},
      {id: 'photosynthesis', name: 'Photosynthesis', type: 'heal_on_player_heal', chance: 100, healPercent: 8}
    ],
    icon: 'mother_of_nature', sortOrder: 0,
    nameTranslations: {ar: 'أم الطبيعة', es: 'Madre Naturaleza', fr: 'Mère Nature', hi: 'प्रकृति माता', ru: 'Мать Природы', tr: 'Doğa Anası', zh: '自然之母'}
  },
  {
    id: 'abyssal_hydra', name: 'Abyssal Hydra', regionId: 'dungeon',
    maxHitpoints: 8000, attackLevel: 200, strengthLevel: 230, defenceLevel: 190,
    attackBonus: 0, strengthBonus: 0, attackSpeed: 2600,
    loot: [{chance: 100, itemId: 'Gold Coins', maxQty: 5000, minQty: 2500}, {chance: 20, itemId: 'hydra_scale', maxQty: 5, minQty: 2}, {chance: 3, itemId: 'hydra_fang_dagger', maxQty: 1, minQty: 1}, {chance: 3, itemId: 'abyssal_trident', maxQty: 1, minQty: 1}],
    xpReward: {attack: 200, strength: 200, defence: 200, hitpoints: 70},
    skills: [
      {id: 'multi_head_strike', name: 'Multi-Head Strike', type: 'multi_target_attack', chance: 40, multiTargetCount: 3},
      {id: 'head_regeneration', name: 'Head Regeneration', type: 'regenerate_on_no_stun', chance: 100, regenTurns: 3, regenPercent: 8},
      {id: 'acid_spray', name: 'Acid Spray', type: 'mass_armor_break', chance: 25, massArmorBreakPercent: 50, massArmorBreakDuration: 5000},
      {id: 'devour', name: 'Devour', type: 'execute_player', chance: 40, executeThreshold: 15}
    ],
    icon: 'abyssal_hydra', sortOrder: 0,
    nameTranslations: {ar: 'هيدرا الأعماق', es: 'Hidra Abisal', fr: 'Hydre Abyssale', hi: 'अथाह हाइड्रा', ru: 'Бездонная Гидра', tr: 'Abyssal Hydra', zh: '深渊九头蛇'}
  }
];

const DUNGEON_ITEMS: any[] = [
  { id: 'dungeon_dust', name: 'Dungeon Dust', description: 'Fine dust collected from dungeon corridors.', type: 'material', vendorPrice: 25, nameTranslations: {es: 'Polvo de Mazmorra', fr: 'Poussière de Donjon', ru: 'Пыль подземелья', tr: 'Zindan Tozu', zh: '地牢尘埃'}, descriptionTranslations: {es: 'Polvo fino recogido de los corredores de la mazmorra.', fr: 'Fine poussière collectée dans les couloirs du donjon.', ru: 'Мелкая пыль, собранная в коридорах подземелья.', tr: 'Zindan koridorlarından toplanan ince toz.', zh: '从地牢走廊收集的细小尘埃。'} },
  { id: 'cursed_bone', name: 'Cursed Bone', description: 'A bone fragment tainted by dark magic.', type: 'material', vendorPrice: 50, nameTranslations: {es: 'Hueso Maldito', fr: 'Os Maudit', ru: 'Проклятая кость', tr: 'Lanetli Kemik', zh: '诅咒之骨'}, descriptionTranslations: {es: 'Un fragmento de hueso contaminado por magia oscura.', fr: "Un fragment d'os souillé par la magie noire.", ru: 'Фрагмент кости, осквернённый тёмной магией.', tr: 'Karanlık büyü ile lekelenmiş bir kemik parçası.', zh: '被黑暗魔法污染的骨骼碎片。'} },
  { id: 'shadow_shard', name: 'Shadow Shard', description: 'A shard of crystallized shadow energy.', type: 'material', vendorPrice: 75, nameTranslations: {es: 'Fragmento de Sombra', fr: "Éclat d'Ombre", ru: 'Осколок тени', tr: 'Gölge Parçası', zh: '暗影碎片'}, descriptionTranslations: {es: 'Un fragmento de energía de sombra cristalizada.', fr: "Un éclat d'énergie d'ombre cristallisée.", ru: 'Осколок кристаллизованной теневой энергии.', tr: 'Kristalleşmiş gölge enerjisi parçası.', zh: '结晶暗影能量碎片。'} },
  { id: 'soul_gem', name: 'Soul Gem', description: 'A gem that captures the essence of defeated souls.', type: 'material', vendorPrice: 200, nameTranslations: {es: 'Gema del Alma', fr: "Gemme d'Âme", ru: 'Камень душ', tr: 'Ruh Taşı', zh: '灵魂宝石'}, descriptionTranslations: {es: 'Una gema que captura la esencia de las almas derrotadas.', fr: "Une gemme qui capture l'essence des âmes vaincues.", ru: 'Камень, захватывающий сущность побеждённых душ.', tr: 'Yenilmiş ruhların özünü yakalayan bir taş.', zh: '捕获被击败灵魂精华的宝石。'} },
  { id: 'undead_essence', name: 'Undead Essence', description: 'Dark essence harvested from undead creatures.', type: 'material', vendorPrice: 100, nameTranslations: {es: 'Esencia No-Muerta', fr: 'Essence Mort-Vivante', ru: 'Эссенция нежити', tr: 'Ölümsüz Özü', zh: '亡灵精华'}, descriptionTranslations: {es: 'Esencia oscura cosechada de criaturas no-muertas.', fr: 'Essence sombre récoltée de créatures mort-vivantes.', ru: 'Тёмная эссенция, добытая из нежити.', tr: 'Ölümsüz yaratıklardan toplanan karanlık öz.', zh: '从亡灵生物中收获的黑暗精华。'} },
  { id: 'void_essence_crystal', name: 'Void Essence Crystal', description: 'A crystal pulsating with void energy.', type: 'material', vendorPrice: 300, nameTranslations: {es: 'Cristal de Esencia del Vacío', fr: "Cristal d'Essence du Vide", ru: 'Кристалл сущности пустоты', tr: 'Boşluk Özü Kristali', zh: '虚空精华水晶'}, descriptionTranslations: {es: 'Un cristal pulsante con energía del vacío.', fr: "Un cristal pulsant d'énergie du vide.", ru: 'Кристалл, пульсирующий энергией пустоты.', tr: 'Boşluk enerjisiyle titreşen bir kristal.', zh: '充满虚空能量的脉动水晶。'} },
  { id: 'void_crystal_shard', name: 'Void Crystal Shard', description: 'A small shard broken from a void crystal.', type: 'material', vendorPrice: 150, nameTranslations: {es: 'Fragmento de Cristal del Vacío', fr: 'Éclat de Cristal du Vide', ru: 'Осколок кристалла пустоты', tr: 'Boşluk Kristal Parçası', zh: '虚空水晶碎片'}, descriptionTranslations: {es: 'Un pequeño fragmento roto de un cristal del vacío.', fr: "Un petit éclat brisé d'un cristal du vide.", ru: 'Небольшой осколок от кристалла пустоты.', tr: 'Bir boşluk kristalinden kırılmış küçük parça.', zh: '从虚空水晶中断裂的小碎片。'} },
  { id: 'shadow_essence_gem', name: 'Shadow Essence Gem', description: 'A gem infused with concentrated shadow energy.', type: 'material', vendorPrice: 250, nameTranslations: {es: 'Gema de Esencia de Sombra', fr: "Gemme d'Essence d'Ombre", ru: 'Камень теневой сущности', tr: 'Gölge Özü Taşı', zh: '暗影精华宝石'}, descriptionTranslations: {es: 'Una gema infundida con energía de sombra concentrada.', fr: "Une gemme imprégnée d'énergie d'ombre concentrée.", ru: 'Камень, пропитанный концентрированной теневой энергией.', tr: 'Yoğunlaştırılmış gölge enerjisi ile dolu bir taş.', zh: '注入浓缩暗影能量的宝石。'} },
  { id: 'goblin_treasure_sack', name: 'Goblin Treasure Sack', description: 'A sack of pilfered treasures from the goblin hoard.', type: 'material', vendorPrice: 150, nameTranslations: {es: 'Saco de Tesoro Goblin', fr: 'Sac de Trésor Gobelin', ru: 'Мешок сокровищ гоблинов', tr: 'Goblin Hazine Çuvalı', zh: '哥布林宝袋'}, descriptionTranslations: {es: 'Un saco de tesoros robados del tesoro goblin.', fr: 'Un sac de trésors pillés du trésor gobelin.', ru: 'Мешок награбленных сокровищ из клада гоблинов.', tr: 'Goblin hazinesinden çalınmış bir çuval dolusu hazine.', zh: '从哥布林宝库中掠夺的一袋宝物。'} },
  { id: 'goblin_crown', name: 'Goblin Crown', description: 'A crude but powerful crown worn by the Goblin King.', type: 'equipment', equipSlot: 'helmet', stats: {attackBonus: 15, defenceBonus: 22, hitpointsBonus: 80}, levelRequired: 15, vendorPrice: 0, untradable: 1, weaponCategory: null, attackSpeedMs: null, icon: 'goblin_crown', nameTranslations: {es: 'Corona Goblin', fr: 'Couronne Gobelin', ru: 'Корона гоблинов', tr: 'Goblin Tacı', zh: '哥布林王冠'}, descriptionTranslations: {es: 'Una corona cruda pero poderosa usada por el Rey Goblin.', fr: 'Une couronne brute mais puissante portée par le Roi Gobelin.', ru: 'Грубая, но мощная корона, которую носил Король гоблинов.', tr: 'Goblin Kralı tarafından takılan kaba ama güçlü bir taç.', zh: '哥布林之王所戴的粗糙但强大的王冠。'} },
  { id: 'goblin_blade', name: 'Goblin Blade', description: 'A jagged blade forged in goblin fires.', type: 'equipment', equipSlot: 'weapon', stats: {attackBonus: 28, accuracyBonus: 35, strengthBonus: 22}, levelRequired: 15, vendorPrice: 0, untradable: 1, weaponCategory: 'sword', attackSpeedMs: 1800, icon: 'goblin_blade', nameTranslations: {es: 'Espada Goblin', fr: 'Lame Gobeline', ru: 'Клинок гоблинов', tr: 'Goblin Kılıcı', zh: '哥布林之刃'}, descriptionTranslations: {es: 'Una espada dentada forjada en fuegos goblin.', fr: 'Une lame dentelée forgée dans les feux gobelins.', ru: 'Зазубренный клинок, выкованный в гоблинском огне.', tr: 'Goblin ateşlerinde dövülmüş tırtıklı bir kılıç.', zh: '在哥布林之火中锻造的锯齿状刀刃。'} },
  { id: 'lich_staff', name: 'Lich Staff', description: 'A staff crackling with necrotic energy from the Shadow Crypt.', type: 'equipment', equipSlot: 'weapon', stats: {attackBonus: 52, defenceBonus: 15, hitpointsBonus: 120}, levelRequired: 35, vendorPrice: 0, untradable: 1, weaponCategory: 'staff', attackSpeedMs: 2200, icon: 'lich_staff', nameTranslations: {es: 'Bastón del Lich', fr: 'Bâton de Liche', ru: 'Посох лича', tr: 'Lich Asası', zh: '巫妖法杖'}, descriptionTranslations: {es: 'Un bastón crepitante con energía necrótica de la Cripta de las Sombras.', fr: "Un bâton crépitant d'énergie nécrotique de la Crypte des Ombres.", ru: 'Посох, потрескивающий некротической энергией из Склепа Теней.', tr: 'Gölge Mahzeninden nekrotik enerji ile çatlayan bir asa.', zh: '来自暗影地穴的死灵能量法杖。'} },
  { id: 'crypt_ward_shield', name: 'Crypt Ward Shield', description: 'A shield imbued with protective wards from the ancient crypt.', type: 'equipment', equipSlot: 'shield', stats: {defenceBonus: 55, hitpointsBonus: 90}, levelRequired: 35, vendorPrice: 0, untradable: 1, weaponCategory: null, attackSpeedMs: null, icon: 'crypt_ward_shield', nameTranslations: {es: 'Escudo de Guardia de Cripta', fr: 'Bouclier de Garde de Crypte', ru: 'Щит Стража Склепа', tr: 'Mahzen Koruma Kalkanı', zh: '地穴守护之盾'}, descriptionTranslations: {es: 'Un escudo imbuido con protecciones de la antigua cripta.', fr: "Un bouclier imprégné de protections de l'ancienne crypte.", ru: 'Щит, пропитанный защитными чарами древнего склепа.', tr: 'Antik mahzenin koruyucu büyüleriyle dolu bir kalkan.', zh: '注入古老地穴守护力量的盾牌。'} },
  { id: 'dragon_fang_blade', name: 'Dragon Fang Blade', description: 'A sword forged from the fang of an ancient dragon.', type: 'equipment', equipSlot: 'weapon', stats: {attackBonus: 78, accuracyBonus: 95, strengthBonus: 62}, levelRequired: 55, vendorPrice: 0, untradable: 1, weaponCategory: 'sword', attackSpeedMs: 1600, icon: 'dragon_fang_blade', nameTranslations: {es: 'Espada Colmillo de Dragón', fr: 'Lame Croc de Dragon', ru: 'Клинок Драконьего Клыка', tr: 'Ejderha Diş Kılıcı', zh: '龙牙之刃'}, descriptionTranslations: {es: 'Una espada forjada del colmillo de un dragón ancestral.', fr: "Une épée forgée à partir du croc d'un dragon ancestral.", ru: 'Меч, выкованный из клыка древнего дракона.', tr: 'Kadim bir ejderhanın dişinden dövülmüş bir kılıç.', zh: '用远古之龙的獠牙锻造的剑。'} },
  { id: 'dragonscale_armor', name: 'Dragonscale Armor', description: 'Legendary armor crafted from impenetrable dragon scales.', type: 'equipment', equipSlot: 'body', stats: {defenceBonus: 95, hitpointsBonus: 200}, levelRequired: 55, vendorPrice: 0, untradable: 1, weaponCategory: null, attackSpeedMs: null, icon: 'dragonscale_armor', nameTranslations: {es: 'Armadura de Escamas de Dragón', fr: 'Armure en Écailles de Dragon', ru: 'Доспех из драконьей чешуи', tr: 'Ejderha Pulu Zırhı', zh: '龙鳞铠甲'}, descriptionTranslations: {es: 'Armadura legendaria hecha de escamas de dragón impenetrables.', fr: "Armure légendaire fabriquée à partir d'écailles de dragon impénétrables.", ru: 'Легендарная броня из непробиваемой драконьей чешуи.', tr: 'Geçilmez ejderha pullarından yapılmış efsanevi zırh.', zh: '用坚不可摧的龙鳞打造的传奇铠甲。'} },
  { id: 'void_soulreaver', name: 'Void Soulreaver', description: 'A weapon that devours the souls of its victims.', type: 'equipment', equipSlot: 'weapon', stats: {attackBonus: 95, strengthBonus: 80, hitpointsBonus: 150}, levelRequired: 80, vendorPrice: 0, untradable: 1, weaponCategory: '2h_sword', attackSpeedMs: 2400, icon: 'void_soulreaver', nameTranslations: {es: 'Segador de Almas del Vacío', fr: "Faucheur d'Âmes du Vide", ru: 'Пожиратель душ Пустоты', tr: 'Boşluk Ruh Biçicisi', zh: '虚空噬魂者'}, descriptionTranslations: {es: 'Un arma que devora las almas de sus víctimas.', fr: 'Une arme qui dévore les âmes de ses victimes.', ru: 'Оружие, пожирающее души жертв.', tr: 'Kurbanlarının ruhlarını yutan bir silah.', zh: '吞噬受害者灵魂的武器。'} },
  { id: 'void_heart_amulet', name: 'Void Heart Amulet', description: 'An amulet containing a fragment of the void itself.', type: 'equipment', equipSlot: 'amulet', stats: {attackBonus: 40, defenceBonus: 40, hitpointsBonus: 250}, levelRequired: 80, vendorPrice: 0, untradable: 1, weaponCategory: null, attackSpeedMs: null, icon: 'void_heart_amulet', nameTranslations: {es: 'Amuleto del Corazón del Vacío', fr: 'Amulette du Cœur du Vide', ru: 'Амулет сердца пустоты', tr: 'Boşluk Kalbi Muskası', zh: '虚空之心护符'}, descriptionTranslations: {es: 'Un amuleto que contiene un fragmento del vacío.', fr: 'Une amulette contenant un fragment du vide.', ru: 'Амулет, содержащий фрагмент самой пустоты.', tr: 'Boşluğun bir parçasını içeren bir muska.', zh: '包含虚空碎片的护符。'} },
  { id: 'crypt_shortbow', name: 'Crypt Shortbow', description: 'A short bow carved from cursed bones found deep in the Goblin Caves.', type: 'equipment', equipSlot: 'weapon', stats: {attackBonus: 22, accuracyBonus: 65, strengthBonus: 10}, levelRequired: 15, vendorPrice: 0, untradable: 1, weaponCategory: 'bow', attackSpeedMs: 2600, masteryRequired: 1, critChance: 6, critDamage: 145, weaponType: 'bow', weaponSkills: [{id:'crypt_shot',name:'Crypt Shot',type:'poison',chance:15,damageMultiplier:1.4,duration:3}], nameTranslations: {tr: 'Mahzen Kısa Yayı', es: 'Arco Corto de la Cripta', fr: 'Arc Court de la Crypte', ru: 'Короткий лук Склепа', zh: '地穴短弓'}, descriptionTranslations: {tr: 'Goblin Mağaralarının derinliklerinde bulunan lanetli kemiklerden oyulmuş bir kısa yay.', es: 'Un arco corto tallado de huesos malditos encontrados en las Cuevas Goblin.', fr: 'Un arc court sculpté dans des os maudits trouvés dans les Grottes Gobelines.', ru: 'Короткий лук, вырезанный из проклятых костей из глубин Гоблинских пещер.', zh: '用地精洞穴深处发现的诅咒之骨雕刻的短弓。'} },
  { id: 'boneclaw_dagger', name: 'Boneclaw Dagger', description: 'A razor-sharp dagger fashioned from a goblin chieftain bone claw.', type: 'equipment', equipSlot: 'weapon', stats: {attackBonus: 12, strengthBonus: 14}, levelRequired: 15, vendorPrice: 150, untradable: 1, weaponCategory: 'dagger', attackSpeedMs: 1400, masteryRequired: 1, critChance: 7, critDamage: 125, lifestealPercent: 5, weaponType: 'dagger', weaponSkills: [{id:'bone_scrape',name:'Bone Scrape',type:'damage',chance:15,damageMultiplier:1.4}], nameTranslations: {tr: 'Kemik Pençe Hançeri', es: 'Daga Garra de Hueso', fr: "Dague Griffe d'Os", ru: 'Кинжал Костяного Когтя', zh: '骨爪匕首'}, descriptionTranslations: {tr: 'Goblin reisinin kemik pençesinden yapılmış jilet gibi keskin bir hançer.', es: 'Una daga afilada hecha de la garra ósea de un jefe goblin.', fr: "Une dague tranchante façonnée à partir de la griffe osseuse d'un chef gobelin.", ru: 'Острый как бритва кинжал, сделанный из костяного когтя вождя гоблинов.', zh: '用地精首领的骨爪制成的锋利匕首。'} },
  { id: 'dustwalker_boots', name: 'Dustwalker Boots', description: 'Enchanted boots infused with dungeon dust, granting swift movement.', type: 'equipment', equipSlot: 'boots', stats: {defenceBonus: 8, hitpointsBonus: 18, attackBonus: 3}, levelRequired: 15, vendorPrice: 0, untradable: 1, nameTranslations: {tr: 'Toz Yürüyücü Botları', es: 'Botas del Caminante de Polvo', fr: 'Bottes du Marcheur de Poussière', ru: 'Сапоги Пылевого Странника', zh: '尘行者之靴'}, descriptionTranslations: {tr: 'Zindan tozuyla güçlendirilmiş, hızlı hareket sağlayan büyülü botlar.', es: 'Botas encantadas imbuidas con polvo de mazmorra que otorgan movimiento rápido.', fr: 'Des bottes enchantées imprégnées de poussière de donjon, offrant une vitesse accrue.', ru: 'Зачарованные сапоги, наполненные подземельной пылью, дающие быстрое передвижение.', zh: '注入地牢尘埃的附魔靴子，赋予迅捷移动。'} },
  { id: 'soulfire_bow', name: 'Soulfire Bow', description: 'A bow that burns with spectral flames from the Shadow Crypt.', type: 'equipment', equipSlot: 'weapon', stats: {attackBonus: 38, accuracyBonus: 78, strengthBonus: 16}, levelRequired: 30, vendorPrice: 0, untradable: 1, weaponCategory: 'bow', attackSpeedMs: 2400, masteryRequired: 2, critChance: 8, critDamage: 155, weaponType: 'bow', weaponSkills: [{id:'soulfire_arrow',name:'Soulfire Arrow',type:'burn',chance:18,damageMultiplier:1.6,duration:3}], nameTranslations: {tr: 'Ruh Ateşi Yayı', es: 'Arco de Fuego del Alma', fr: "Arc de Feu de l'Âme", ru: 'Лук Огня Душ', zh: '魂火之弓'}, descriptionTranslations: {tr: 'Gölge Mahzeninden gelen hayalet alevlerle yanan bir yay.', es: 'Un arco que arde con llamas espectrales de la Cripta de las Sombras.', fr: 'Un arc qui brûle de flammes spectrales de la Crypte des Ombres.', ru: 'Лук, пылающий призрачным пламенем из Склепа Теней.', zh: '燃烧着暗影地穴幽灵火焰的弓。'} },
  { id: 'phantom_dagger', name: 'Phantom Dagger', description: 'A ghostly dagger that phases through armor, forged from shadow shards.', type: 'equipment', equipSlot: 'weapon', stats: {attackBonus: 32, strengthBonus: 26}, levelRequired: 30, vendorPrice: 900, untradable: 1, weaponCategory: 'dagger', attackSpeedMs: 1300, masteryRequired: 3, critChance: 10, critDamage: 145, lifestealPercent: 6, weaponType: 'dagger', weaponSkills: [{id:'phantom_slash',name:'Phantom Slash',type:'damage',chance:20,damageMultiplier:1.6}], nameTranslations: {tr: 'Hayalet Hançer', es: 'Daga Fantasma', fr: 'Dague Fantôme', ru: 'Призрачный Кинжал', zh: '幻影匕首'}, descriptionTranslations: {tr: 'Gölge parçalarından dövülmüş, zırhı delip geçen hayaletimsi bir hançer.', es: 'Una daga fantasmal que atraviesa armaduras, forjada de fragmentos de sombra.', fr: "Une dague fantomatique qui traverse les armures, forgée de fragments d'ombre.", ru: 'Призрачный кинжал, проходящий сквозь броню, выкованный из осколков тени.', zh: '由暗影碎片锻造的幽灵匕首，可穿透盔甲。'} },
  { id: 'wraith_boots', name: 'Wraith Boots', description: 'Boots wreathed in shadow energy that quicken the wearer attack speed.', type: 'equipment', equipSlot: 'boots', stats: {defenceBonus: 16, hitpointsBonus: 28, attackBonus: 5}, levelRequired: 30, vendorPrice: 0, untradable: 1, attackSpeedBonus: 5, nameTranslations: {tr: 'Hortlak Botları', es: 'Botas del Espectro', fr: 'Bottes du Spectre', ru: 'Сапоги Призрака', zh: '幽灵之靴'}, descriptionTranslations: {tr: 'Gölge enerjisiyle sarılmış, kullanıcının saldırı hızını artıran botlar.', es: 'Botas envueltas en energía de sombra que aceleran la velocidad de ataque.', fr: "Des bottes enveloppées d'énergie d'ombre qui accélèrent la vitesse d'attaque.", ru: 'Сапоги, окутанные теневой энергией, ускоряющие атаку владельца.', zh: '被暗影能量笼罩的靴子，加快穿戴者的攻击速度。'} },
  { id: 'dragonbone_longbow', name: 'Dragonbone Longbow', description: 'A massive longbow crafted from dragon bones, capable of devastating shots.', type: 'equipment', equipSlot: 'weapon', stats: {attackBonus: 65, accuracyBonus: 95, strengthBonus: 26}, levelRequired: 50, vendorPrice: 0, untradable: 1, weaponCategory: 'bow', attackSpeedMs: 2100, masteryRequired: 4, critChance: 10, critDamage: 175, weaponType: 'bow', weaponSkills: [{id:'dragon_arrow',name:'Dragon Arrow',type:'burn',chance:22,damageMultiplier:2.0,duration:4}], nameTranslations: {tr: 'Ejder Kemiği Uzun Yayı', es: 'Arco Largo de Hueso de Dragón', fr: 'Arc Long en Os de Dragon', ru: 'Длинный лук из Драконьей Кости', zh: '龙骨长弓'}, descriptionTranslations: {tr: 'Ejder kemiklerinden yapılmış, yıkıcı atışlar yapabilen devasa bir uzun yay.', es: 'Un arco largo masivo hecho de huesos de dragón, capaz de disparos devastadores.', fr: "Un arc long massif fabriqué à partir d'os de dragon, capable de tirs dévastateurs.", ru: 'Массивный длинный лук из костей дракона, способный наносить разрушительные выстрелы.', zh: '用龙骨打造的巨大长弓，能射出毁灭性箭矢。'} },
  { id: 'flamescale_staff', name: 'Flamescale Staff', description: 'A staff adorned with dragon scales that radiates intense heat.', type: 'equipment', equipSlot: 'weapon', stats: {attackBonus: 45, defenceBonus: 10, hitpointsBonus: 95}, levelRequired: 50, vendorPrice: 0, untradable: 1, weaponCategory: 'staff', attackSpeedMs: 2600, masteryRequired: 1, nameTranslations: {tr: 'Alev Pullu Asa', es: 'Bastón de Escamas de Fuego', fr: "Bâton d'Écailles de Flamme", ru: 'Посох Пламенной Чешуи', zh: '焰鳞法杖'}, descriptionTranslations: {tr: 'Ejder pullarıyla süslenmiş, yoğun ısı yayan bir asa.', es: 'Un bastón adornado con escamas de dragón que irradia calor intenso.', fr: "Un bâton orné d'écailles de dragon qui irradie une chaleur intense.", ru: 'Посох, украшенный драконьей чешуёй, излучающий сильный жар.', zh: '饰有龙鳞的法杖，散发着灼热高温。'} },
  { id: 'dragonclaw_gauntlets', name: 'Dragonclaw Gauntlets', description: 'Gauntlets forged from dragon claws, increasing critical strike power.', type: 'equipment', equipSlot: 'gloves', stats: {attackBonus: 18, defenceBonus: 28, hitpointsBonus: 30, strengthBonus: 8}, levelRequired: 50, vendorPrice: 0, untradable: 1, nameTranslations: {tr: 'Ejder Pençesi Eldivenleri', es: 'Guanteletes de Garra de Dragón', fr: 'Gantelets de Griffe de Dragon', ru: 'Рукавицы Драконьего Когтя', zh: '龙爪护手'}, descriptionTranslations: {tr: 'Ejder pençelerinden dövülmüş, kritik vuruş gücünü artıran eldivenler.', es: 'Guanteletes forjados de garras de dragón que aumentan el poder de golpe crítico.', fr: 'Des gantelets forgés à partir de griffes de dragon, augmentant la puissance des coups critiques.', ru: 'Рукавицы, выкованные из когтей дракона, увеличивающие силу критических ударов.', zh: '用龙爪锻造的护手，提升暴击力量。'} },
  { id: 'voidstrike_bow', name: 'Voidstrike Bow', description: 'A bow infused with void energy, its arrows tear through reality itself.', type: 'equipment', equipSlot: 'weapon', stats: {attackBonus: 92, accuracyBonus: 125, strengthBonus: 38}, levelRequired: 70, vendorPrice: 0, untradable: 1, weaponCategory: 'bow', attackSpeedMs: 1800, masteryRequired: 5, critChance: 12, critDamage: 195, weaponType: 'bow', weaponSkills: [{id:'void_arrow',name:'Void Arrow',type:'lifesteal_burst',chance:20,damageMultiplier:2.3,lifestealPercent:20}], nameTranslations: {tr: 'Boşluk Vuruşu Yayı', es: 'Arco de Golpe del Vacío', fr: 'Arc de Frappe du Vide', ru: 'Лук Удара Пустоты', zh: '虚空打击之弓'}, descriptionTranslations: {tr: 'Boşluk enerjisiyle dolu, okları gerçekliği yırtıp geçen bir yay.', es: 'Un arco imbuido con energía del vacío, sus flechas desgarran la realidad misma.', fr: "Un arc imprégné d'énergie du vide, ses flèches déchirent la réalité elle-même.", ru: 'Лук, наполненный энергией пустоты, его стрелы пронзают саму реальность.', zh: '注入虚空能量的弓，箭矢撕裂现实本身。'} },
  { id: 'abyssal_dagger', name: 'Abyssal Dagger', description: 'A dagger forged in the deepest void, striking with blinding speed.', type: 'equipment', equipSlot: 'weapon', stats: {attackBonus: 78, strengthBonus: 68}, levelRequired: 70, vendorPrice: 12000, untradable: 1, weaponCategory: 'dagger', attackSpeedMs: 1100, masteryRequired: 5, critChance: 15, critDamage: 180, lifestealPercent: 8, weaponType: 'dagger', weaponSkills: [{id:'abyssal_pierce',name:'Abyssal Pierce',type:'lifesteal_burst',chance:20,damageMultiplier:2.2,lifestealPercent:25}], nameTranslations: {tr: 'Uçurum Hançeri', es: 'Daga Abisal', fr: 'Dague Abyssale', ru: 'Бездонный Кинжал', zh: '深渊匕首'}, descriptionTranslations: {tr: 'En derin boşlukta dövülmüş, kör edici hızla saldıran bir hançer.', es: 'Una daga forjada en el vacío más profundo, golpeando con velocidad cegadora.', fr: 'Une dague forgée dans le vide le plus profond, frappant à une vitesse aveuglante.', ru: 'Кинжал, выкованный в глубочайшей пустоте, наносящий удары с ослепляющей скоростью.', zh: '在最深虚空中锻造的匕首，以致盲速度打击。'} },
  { id: 'voidwalker_boots', name: 'Voidwalker Boots', description: 'Boots that allow the wearer to step between dimensions, greatly enhancing combat ability.', type: 'equipment', equipSlot: 'boots', stats: {defenceBonus: 40, hitpointsBonus: 70, attackBonus: 12}, levelRequired: 70, vendorPrice: 0, untradable: 1, attackSpeedBonus: 8, nameTranslations: {tr: 'Boşluk Yürüyücü Botları', es: 'Botas del Caminante del Vacío', fr: 'Bottes du Marcheur du Vide', ru: 'Сапоги Странника Пустоты', zh: '虚空行者之靴'}, descriptionTranslations: {tr: 'Kullanıcının boyutlar arası adım atmasını sağlayan, savaş yeteneğini büyük ölçüde artıran botlar.', es: 'Botas que permiten al portador caminar entre dimensiones, mejorando enormemente la capacidad de combate.', fr: 'Des bottes qui permettent au porteur de se déplacer entre les dimensions, améliorant grandement ses capacités de combat.', ru: 'Сапоги, позволяющие владельцу перемещаться между измерениями, значительно усиливая боевые способности.', zh: '允许穿戴者在维度间穿行的靴子，大幅增强战斗能力。'} },
  { id: 'goblin_war_banner', name: 'Goblin War Banner', description: 'A tattered war banner captured from the Goblin King. A trophy of party combat.', type: 'material', vendorPrice: 500, untradable: 1, nameTranslations: {tr: 'Goblin Savaş Bayrağı', es: 'Estandarte de Guerra Goblin', fr: 'Bannière de Guerre Gobeline', ru: 'Боевое знамя гоблинов', zh: '哥布林战旗', ar: 'راية حرب العفاريت', hi: 'गोब्लिन युद्ध ध्वज'}, descriptionTranslations: {tr: 'Goblin Kralından ele geçirilmiş yıpranmış savaş bayrağı. Parti savaşının bir ganimeti.', es: 'Un estandarte de guerra capturado del Rey Goblin. Un trofeo del combate en grupo.', fr: 'Une bannière de guerre en lambeaux capturée au Roi Gobelin. Un trophée de combat en groupe.', ru: 'Потрёпанное боевое знамя, захваченное у Короля гоблинов. Трофей группового боя.', zh: '从哥布林之王手中夺取的破旧战旗。团队战斗的战利品。', ar: 'راية حرب ممزقة من ملك العفاريت. غنيمة قتال جماعي.', hi: 'गोब्लिन राजा से छीना गया फटा युद्ध ध्वज। पार्टी लड़ाई की ट्रॉफी।'} },
  { id: 'shadow_crypt_relic', name: 'Shadow Crypt Relic', description: 'An ancient relic pulsing with dark energy, found only by party expeditions.', type: 'material', vendorPrice: 1000, rarity: 'epic', nameTranslations: {es: 'Reliquia de la Cripta de Sombras', fr: 'Relique de la Crypte des Ombres', ru: 'Реликвия теневой крипты', tr: 'Gölge Mahzeni Kalıntısı', zh: '暗影地穴遗物', ar: 'بقايا سرداب الظلال', hi: 'शैडो क्रिप्ट अवशेष'}, descriptionTranslations: {tr: 'Sadece parti keşifleri tarafından bulunan, karanlık enerjiyle atan kadim bir kalıntı.'} },
  { id: 'dragon_heart', name: 'Dragon Heart', description: 'The still-beating heart of an ancient dragon. Radiates immense heat.', type: 'material', vendorPrice: 3000, untradable: 1, nameTranslations: {tr: 'Ejderha Kalbi', es: 'Corazón de Dragón', fr: 'Cœur de Dragon', ru: 'Сердце дракона', zh: '龙之心', ar: 'قلب التنين', hi: 'ड्रैगन का दिल'}, descriptionTranslations: {tr: 'Kadim bir ejderhanın hâlâ atan kalbi. Muazzam ısı yayar.', es: 'El corazón aún latente de un dragón ancestral. Irradia un calor inmenso.', fr: "Le cœur encore battant d'un dragon ancestral. Dégage une chaleur immense.", ru: 'Всё ещё бьющееся сердце древнего дракона. Излучает невероятный жар.', zh: '一颗仍在跳动的远古巨龙之心。散发着巨大的热量。', ar: 'قلب تنين قديم لا يزال ينبض. يشع حرارة هائلة.', hi: 'एक प्राचीन ड्रैगन का अभी भी धड़कता दिल। अत्यधिक गर्मी विकीर्ण करता है।'} },
  { id: 'void_fragment', name: 'Void Fragment', description: 'A shard of pure void energy, impossibly rare outside of party combat.', type: 'material', vendorPrice: 3000, rarity: 'legendary', nameTranslations: {es: 'Fragmento del Vacío', fr: 'Fragment du Vide', ru: 'Фрагмент пустоты', tr: 'Boşluk Parçası', zh: '虚空碎片', ar: 'شظية الفراغ', hi: 'वॉइड फ्रैगमेंट'}, descriptionTranslations: {tr: 'Parti savaşı dışında imkansız derecede nadir olan saf boşluk enerjisi parçası.'} },
  { id: 'abyssal_staff', name: 'Abyssal Staff', description: 'A staff channeling pure void energy, warping space around its wielder.', type: 'equipment', equipSlot: 'weapon', stats: {attackBonus: 75, defenceBonus: 18, hitpointsBonus: 165}, levelRequired: 70, vendorPrice: 0, untradable: 1, weaponCategory: 'staff', attackSpeedMs: 2200, masteryRequired: 1, nameTranslations: {tr: 'Uçurum Asası', es: 'Bastón Abisal', fr: 'Bâton Abyssal', ru: 'Посох Бездны', zh: '深渊法杖'}, descriptionTranslations: {tr: 'Saf boşluk enerjisini kanalize eden, kullanıcının etrafındaki uzayı büken bir asa.', es: 'Un bastón que canaliza energía pura del vacío, deformando el espacio alrededor.', fr: "Un bâton canalisant l'énergie pure du vide, déformant l'espace autour de son porteur.", ru: 'Посох, направляющий чистую энергию пустоты, искажающий пространство вокруг владельца.', zh: '引导纯虚空能量的法杖，扭曲持有者周围的空间。'} },
  { id: 'goblin_treasure_key', name: 'Goblin Treasure Key', description: 'A golden key that once unlocked the goblin hoard. Valuable to collectors.', type: 'material', vendorPrice: 750, untradable: 1, nameTranslations: {tr: 'Goblin Hazine Anahtarı', es: 'Llave del Tesoro Goblin', fr: 'Clé du Trésor Gobelin', ru: 'Ключ от сокровищ гоблинов', zh: '哥布林宝藏钥匙', ar: 'مفتاح كنز العفاريت', hi: 'गोब्लिन खजाने की चाबी'}, descriptionTranslations: {tr: 'Goblin hazinesini açan altın bir anahtar. Koleksiyoncular için değerli.', es: 'Una llave dorada que abría el tesoro goblin. Valiosa para coleccionistas.', fr: "Une clé en or qui déverrouillait le trésor gobelin. Précieuse pour les collectionneurs.", ru: 'Золотой ключ от гоблинского клада. Ценный для коллекционеров.', zh: '曾打开哥布林宝库的金钥匙。对收藏家来说很有价值。', ar: 'مفتاح ذهبي كان يفتح كنز العفاريت. قيّم للهواة.', hi: 'एक सुनहरी चाबी जो गोब्लिन खजाने को खोलती थी। संग्रहकर्ताओं के लिए मूल्यवान।'} },
  { id: 'lich_soul_fragment', name: 'Lich Soul Fragment', description: 'A fragment of the Lich Lord soul. Pulses with dark necrotic energy.', type: 'material', vendorPrice: 1200, untradable: 1, nameTranslations: {tr: 'Lich Ruh Parçası', es: 'Fragmento de Alma del Lich', fr: "Fragment d'Âme de Liche", ru: 'Фрагмент души Лича', zh: '巫妖灵魂碎片', ar: 'شظية روح اللعنة', hi: 'लिच आत्मा खंड'}, descriptionTranslations: {tr: 'Lich Lord ruhunun bir parçası. Karanlık nekrotik enerjiyle titreşiyor.', es: 'Un fragmento del alma del Señor Lich. Pulsa con energía necrótica oscura.', fr: "Un fragment de l'âme du Seigneur Liche. Pulse d'énergie nécrotique sombre.", ru: 'Фрагмент души Лич Лорда. Пульсирует тёмной некротической энергией.', zh: '巫妖之王灵魂的碎片。闪烁着黑暗的死灵能量。', ar: 'شظية من روح سيد اللعنة. تنبض بطاقة الموت المظلمة.', hi: 'लिच लॉर्ड की आत्मा का टुकड़ा। अंधेरी मृत ऊर्जा से स्पंदित।'} },
  { id: 'necrotic_essence', name: 'Necrotic Essence', description: 'Concentrated necrotic essence from the Shadow Crypt. Used in powerful enchantments.', type: 'material', vendorPrice: 800, untradable: 1, nameTranslations: {tr: 'Nekrotik Öz', es: 'Esencia Necrótica', fr: 'Essence Nécrotique', ru: 'Некротическая сущность', zh: '死灵精华', ar: 'جوهر الموت', hi: 'मृत सार'}, descriptionTranslations: {tr: 'Gölge Mahzeninden yoğunlaştırılmış nekrotik öz. Güçlü büyülerde kullanılır.', es: 'Esencia necrótica concentrada de la Cripta de las Sombras. Usada en encantamientos poderosos.', fr: "Essence nécrotique concentrée de la Crypte des Ombres. Utilisée pour de puissants enchantements.", ru: 'Концентрированная некротическая сущность из Склепа Теней. Используется в мощных зачарованиях.', zh: '来自暗影地穴的浓缩死灵精华。用于强力附魔。', ar: 'جوهر موت مركّز من سرداب الظلال. يُستخدم في التعاويذ القوية.', hi: 'छाया तहखाने से संकेंद्रित मृत सार। शक्तिशाली मंत्रमुग्धता में उपयोग।'} },
  { id: 'molten_dragon_scale', name: 'Molten Dragon Scale', description: 'A dragon scale still glowing with molten fire. Used to forge legendary armor.', type: 'material', vendorPrice: 2000, untradable: 1, nameTranslations: {tr: 'Erimiş Ejderha Pulu', es: 'Escama de Dragón Fundida', fr: 'Écaille de Dragon en Fusion', ru: 'Расплавленная драконья чешуя', zh: '熔岩龙鳞', ar: 'حرشفة تنين منصهرة', hi: 'पिघली ड्रैगन शल्क'}, descriptionTranslations: {tr: 'Hâlâ erimiş ateşle parlayan bir ejderha pulu. Efsanevi zırh dövmek için kullanılır.', es: 'Una escama de dragón aún brillando con fuego fundido. Usada para forjar armadura legendaria.', fr: "Une écaille de dragon encore incandescente. Utilisée pour forger une armure légendaire.", ru: 'Драконья чешуя, всё ещё пылающая расплавленным огнём. Используется для ковки легендарной брони.', zh: '仍在燃烧着熔岩之火的龙鳞。用于锻造传奇铠甲。', ar: 'حرشفة تنين لا تزال متوهجة بالنار المنصهرة. تُستخدم لصنع دروع أسطورية.', hi: 'अभी भी पिघले अग्नि से चमकता ड्रैगन शल्क। महाकाव्य कवच बनाने में उपयोग।'} },
  { id: 'void_crown_shard', name: 'Void Crown Shard', description: 'A shard from the Void King crown. Warps reality around it.', type: 'material', vendorPrice: 5000, untradable: 1, nameTranslations: {tr: 'Boşluk Taç Parçası', es: 'Fragmento de Corona del Vacío', fr: 'Éclat de Couronne du Vide', ru: 'Осколок короны Пустоты', zh: '虚空王冠碎片', ar: 'شظية تاج الفراغ', hi: 'शून्य मुकुट खंड'}, descriptionTranslations: {tr: 'Boşluk Kralının tacından bir parça. Etrafındaki gerçekliği büküyor.', es: 'Un fragmento de la corona del Rey del Vacío. Distorsiona la realidad a su alrededor.', fr: "Un éclat de la couronne du Roi du Vide. Déforme la réalité autour de lui.", ru: 'Осколок короны Короля Пустоты. Искажает реальность вокруг себя.', zh: '虚空之王王冠的碎片。扭曲周围的现实。', ar: 'شظية من تاج ملك الفراغ. يشوّه الواقع حوله.', hi: 'शून्य राजा के मुकुट का एक टुकड़ा। अपने चारों ओर वास्तविकता को मोड़ता है।'} },
  { id: 'dimensional_tear', name: 'Dimensional Tear', description: 'A crystallized tear in the fabric of dimensions. Pulsates with void energy.', type: 'material', vendorPrice: 4000, untradable: 1, nameTranslations: {tr: 'Boyutsal Yırtık', es: 'Desgarro Dimensional', fr: 'Déchirure Dimensionnelle', ru: 'Пространственный разрыв', zh: '次元裂隙', ar: 'تمزق بُعدي', hi: 'आयामी दरार'}, descriptionTranslations: {tr: 'Boyutların dokusundaki kristalleşmiş bir yırtık. Boşluk enerjisiyle titreşiyor.', es: 'Un desgarro cristalizado en el tejido dimensional. Pulsa con energía del vacío.', fr: "Une déchirure cristallisée dans le tissu des dimensions. Pulse d'énergie du vide.", ru: 'Кристаллизованный разрыв в ткани измерений. Пульсирует энергией пустоты.', zh: '维度织物中的结晶裂隙。闪烁着虚空能量。', ar: 'تمزق متبلور في نسيج الأبعاد. ينبض بطاقة الفراغ.', hi: 'आयामों के ताने-बाने में क्रिस्टलीकृत दरार। शून्य ऊर्जा से स्पंदित।'} },
];

const DUNGEON_RECIPES: any[] = [
  { id: 'craft_dg_verdant_platebody', resultItemId: 'verdant_platebody', resultQuantity: 1, materials: [{itemId: 'dungeon_dust', quantity: 8}, {itemId: 'shadow_shard', quantity: 2}], skill: 'crafting', levelRequired: 15, xpReward: 55, craftTime: 8000, category: 'body' },
  { id: 'craft_dg_quarry_platebody', resultItemId: 'quarry_platebody', resultQuantity: 1, materials: [{itemId: 'shadow_shard', quantity: 5}, {itemId: 'cursed_bone', quantity: 5}, {itemId: 'Steel Bar', quantity: 2}], skill: 'crafting', levelRequired: 25, xpReward: 100, craftTime: 10000, category: 'body' },
  { id: 'craft_dg_dunes_platebody', resultItemId: 'dunes_platebody', resultQuantity: 1, materials: [{itemId: 'soul_gem', quantity: 1}, {itemId: 'undead_essence', quantity: 6}, {itemId: 'shadow_shard', quantity: 4}], skill: 'crafting', levelRequired: 36, xpReward: 150, craftTime: 12000, category: 'body' },
  { id: 'craft_dg_obsidian_blade', resultItemId: 'obsidian_blade', resultQuantity: 1, materials: [{itemId: 'dragon_bone', quantity: 5}, {itemId: 'soul_gem', quantity: 2}, {itemId: 'shadow_shard', quantity: 5}], skill: 'crafting', levelRequired: 46, xpReward: 200, craftTime: 15000, category: 'sword' },
  { id: 'craft_dg_obsidian_platebody', resultItemId: 'obsidian_platebody', resultQuantity: 1, materials: [{itemId: 'dragon_scale', quantity: 4}, {itemId: 'dragon_bone', quantity: 6}, {itemId: 'soul_gem', quantity: 1}], skill: 'crafting', levelRequired: 46, xpReward: 200, craftTime: 15000, category: 'body' },
  { id: 'craft_dg_crypt_shortbow', resultItemId: 'crypt_shortbow', resultQuantity: 1, materials: [{itemId: 'dungeon_dust', quantity: 6}, {itemId: 'cursed_bone', quantity: 4}], skill: 'crafting', levelRequired: 15, xpReward: 55, craftTime: 8000, category: 'bow' },
  { id: 'craft_dg_boneclaw_dagger', resultItemId: 'boneclaw_dagger', resultQuantity: 1, materials: [{itemId: 'cursed_bone', quantity: 5}, {itemId: 'dungeon_dust', quantity: 3}], skill: 'crafting', levelRequired: 14, xpReward: 50, craftTime: 8000, category: 'dagger' },
  { id: 'craft_dg_dustwalker_boots', resultItemId: 'dustwalker_boots', resultQuantity: 1, materials: [{itemId: 'dungeon_dust', quantity: 8}, {itemId: 'cursed_bone', quantity: 3}], skill: 'crafting', levelRequired: 16, xpReward: 60, craftTime: 8000, category: 'boots' },
  { id: 'craft_dg_soulfire_bow', resultItemId: 'soulfire_bow', resultQuantity: 1, materials: [{itemId: 'shadow_shard', quantity: 5}, {itemId: 'undead_essence', quantity: 4}, {itemId: 'soul_gem', quantity: 1}], skill: 'crafting', levelRequired: 30, xpReward: 130, craftTime: 12000, category: 'bow' },
  { id: 'craft_dg_phantom_dagger', resultItemId: 'phantom_dagger', resultQuantity: 1, materials: [{itemId: 'undead_essence', quantity: 5}, {itemId: 'shadow_shard', quantity: 3}, {itemId: 'cursed_bone', quantity: 4}], skill: 'crafting', levelRequired: 28, xpReward: 110, craftTime: 12000, category: 'dagger' },
  { id: 'craft_dg_wraith_boots', resultItemId: 'wraith_boots', resultQuantity: 1, materials: [{itemId: 'shadow_shard', quantity: 4}, {itemId: 'undead_essence', quantity: 3}, {itemId: 'soul_gem', quantity: 1}], skill: 'crafting', levelRequired: 32, xpReward: 140, craftTime: 12000, category: 'boots' },
  { id: 'craft_dg_dragonbone_longbow', resultItemId: 'dragonbone_longbow', resultQuantity: 1, materials: [{itemId: 'dragon_bone', quantity: 5}, {itemId: 'dragon_scale', quantity: 2}, {itemId: 'soul_gem', quantity: 2}], skill: 'crafting', levelRequired: 48, xpReward: 230, craftTime: 15000, category: 'bow' },
  { id: 'craft_dg_flamescale_staff', resultItemId: 'flamescale_staff', resultQuantity: 1, materials: [{itemId: 'dragon_scale', quantity: 3}, {itemId: 'dragon_bone', quantity: 4}, {itemId: 'soul_gem', quantity: 1}], skill: 'crafting', levelRequired: 50, xpReward: 250, craftTime: 15000, category: 'staff' },
  { id: 'craft_dg_dragonclaw_gauntlets', resultItemId: 'dragonclaw_gauntlets', resultQuantity: 1, materials: [{itemId: 'dragon_bone', quantity: 4}, {itemId: 'dragon_scale', quantity: 2}], skill: 'crafting', levelRequired: 46, xpReward: 210, craftTime: 15000, category: 'gloves' },
  { id: 'craft_dg_voidstrike_bow', resultItemId: 'voidstrike_bow', resultQuantity: 1, materials: [{itemId: 'void_essence_crystal', quantity: 3}, {itemId: 'dragon_bone', quantity: 4}, {itemId: 'dragon_scale', quantity: 2}], skill: 'crafting', levelRequired: 68, xpReward: 380, craftTime: 20000, category: 'bow' },
  { id: 'craft_dg_abyssal_dagger', resultItemId: 'abyssal_dagger', resultQuantity: 1, materials: [{itemId: 'void_essence_crystal', quantity: 3}, {itemId: 'dragon_bone', quantity: 3}, {itemId: 'soul_gem', quantity: 2}], skill: 'crafting', levelRequired: 65, xpReward: 350, craftTime: 20000, category: 'dagger' },
  { id: 'craft_dg_voidwalker_boots', resultItemId: 'voidwalker_boots', resultQuantity: 1, materials: [{itemId: 'void_essence_crystal', quantity: 4}, {itemId: 'dragon_scale', quantity: 2}, {itemId: 'soul_gem', quantity: 2}], skill: 'crafting', levelRequired: 70, xpReward: 400, craftTime: 20000, category: 'boots' },
  { id: 'craft_dg_abyssal_staff', resultItemId: 'abyssal_staff', resultQuantity: 1, materials: [{itemId: 'void_essence_crystal', quantity: 4}, {itemId: 'dragon_bone', quantity: 3}, {itemId: 'dragon_scale', quantity: 2}], skill: 'crafting', levelRequired: 72, xpReward: 420, craftTime: 20000, category: 'staff' },
];

export async function seedDungeonData(): Promise<void> {
  try {
    let templatesInserted = 0;
    let templatesUpdated = 0;
    for (const template of FLOOR_TEMPLATES) {
      const existing = await db.select().from(dungeonFloorTemplates).where(eq(dungeonFloorTemplates.id, template.id));
      if (existing.length === 0) {
        await db.insert(dungeonFloorTemplates).values(template);
        templatesInserted++;
        console.log(`[Seed] Inserted dungeon floor template: ${template.id}`);
      } else {
        await db.update(dungeonFloorTemplates).set({
          dungeonId: template.dungeonId,
          floorRangeStart: template.floorRangeStart,
          floorRangeEnd: template.floorRangeEnd,
          monsterPool: template.monsterPool,
          monsterCountMin: template.monsterCountMin,
          monsterCountMax: template.monsterCountMax,
          modifierChance: template.modifierChance,
          lootMultiplier: template.lootMultiplier,
          isBossFloor: template.isBossFloor,
          bossMonsterIds: template.bossMonsterIds,
          powerMultiplier: template.powerMultiplier,
        }).where(eq(dungeonFloorTemplates.id, template.id));
        templatesUpdated++;
        console.log(`[Seed] Updated dungeon floor template: ${template.id}`);
      }
    }
    if (templatesInserted > 0 || templatesUpdated > 0) {
      console.log(`[Seed] Floor templates: ${templatesInserted} inserted, ${templatesUpdated} updated`);
    }

    let lootInserted = 0;
    let lootUpdated = 0;
    for (const loot of LOOT_TABLES) {
      const existing = await db.select().from(dungeonLootTables).where(eq(dungeonLootTables.id, loot.id));
      if (existing.length === 0) {
        await db.insert(dungeonLootTables).values(loot);
        lootInserted++;
        console.log(`[Seed] Inserted dungeon loot table: ${loot.id}`);
      } else {
        await db.update(dungeonLootTables).set({
          dungeonId: loot.dungeonId,
          floorRangeStart: loot.floorRangeStart,
          floorRangeEnd: loot.floorRangeEnd,
          commonChance: loot.commonChance,
          uncommonChance: loot.uncommonChance,
          rareChance: loot.rareChance,
          epicChance: loot.epicChance,
          legendaryChance: loot.legendaryChance,
          mythicChance: loot.mythicChance,
          guaranteedDrops: loot.guaranteedDrops,
          possibleDrops: loot.possibleDrops,
          partyExclusiveDrops: loot.partyExclusiveDrops ?? null,
        }).where(eq(dungeonLootTables.id, loot.id));
        lootUpdated++;
        console.log(`[Seed] Updated dungeon loot table: ${loot.id}`);
      }
    }
    if (lootInserted > 0 || lootUpdated > 0) {
      console.log(`[Seed] Loot tables: ${lootInserted} inserted, ${lootUpdated} updated`);
    }

    let monstersInserted = 0;
    let monstersUpdated = 0;
    for (const monster of DUNGEON_MONSTERS) {
      const existing = await db.select().from(gameMonsters).where(eq(gameMonsters.id, monster.id));
      if (existing.length === 0) {
        await db.insert(gameMonsters).values(monster);
        monstersInserted++;
        console.log(`[Seed] Inserted dungeon monster: ${monster.id}`);
      } else {
        await db.update(gameMonsters).set({
          maxHitpoints: monster.maxHitpoints,
          attackLevel: monster.attackLevel,
          strengthLevel: monster.strengthLevel,
          defenceLevel: monster.defenceLevel,
          attackBonus: monster.attackBonus,
          strengthBonus: monster.strengthBonus,
          attackSpeed: monster.attackSpeed,
          loot: monster.loot,
          xpReward: monster.xpReward,
          skills: monster.skills,
          nameTranslations: monster.nameTranslations,
        }).where(eq(gameMonsters.id, monster.id));
        monstersUpdated++;
        console.log(`[Seed] Updated dungeon monster: ${monster.id}`);
      }
    }
    if (monstersInserted > 0 || monstersUpdated > 0) {
      console.log(`[Seed] Dungeon monsters: ${monstersInserted} inserted, ${monstersUpdated} updated`);
    }

    let itemsInserted = 0;
    let itemsTranslationsUpdated = 0;
    for (const item of DUNGEON_ITEMS) {
      const existing = await db.select().from(gameItems).where(eq(gameItems.id, item.id));
      if (existing.length === 0) {
        await db.insert(gameItems).values(item);
        itemsInserted++;
        console.log(`[Seed] Inserted dungeon item: ${item.id}`);
      } else if (item.nameTranslations || item.descriptionTranslations) {
        const updateData: any = {};
        if (item.nameTranslations) updateData.nameTranslations = item.nameTranslations;
        if (item.descriptionTranslations) updateData.descriptionTranslations = item.descriptionTranslations;
        await db.update(gameItems).set(updateData).where(eq(gameItems.id, item.id));
        itemsTranslationsUpdated++;
        console.log(`[Seed] Updated translations for dungeon item: ${item.id}`);
      }
    }
    if (itemsInserted > 0 || itemsTranslationsUpdated > 0) {
      console.log(`[Seed] Dungeon items: ${itemsInserted} inserted, ${itemsTranslationsUpdated} translations updated`);
    }

    const oldDuplicateRecipes = ['craft_dg_iron_longsword', 'craft_dg_steel_platebody', 'craft_dg_mithril_platebody'];
    for (const oldId of oldDuplicateRecipes) {
      const existing = await db.select().from(gameRecipes).where(eq(gameRecipes.id, oldId));
      if (existing.length > 0) {
        await db.delete(gameRecipes).where(eq(gameRecipes.id, oldId));
        console.log(`[Seed] Removed deprecated dungeon recipe: ${oldId}`);
      }
    }

    let recipesSeeded = 0;
    for (const recipe of DUNGEON_RECIPES) {
      const existing = await db.select().from(gameRecipes).where(eq(gameRecipes.id, recipe.id));
      if (existing.length === 0) {
        await db.insert(gameRecipes).values({
          id: recipe.id,
          resultItemId: recipe.resultItemId,
          resultQuantity: recipe.resultQuantity,
          materials: recipe.materials,
          skill: recipe.skill,
          levelRequired: recipe.levelRequired,
          xpReward: recipe.xpReward,
          craftTime: recipe.craftTime,
          category: recipe.category,
        });
        recipesSeeded++;
        console.log(`[Seed] Inserted dungeon recipe: ${recipe.id}`);
      }
    }
    if (recipesSeeded > 0) {
      console.log(`[Seed] Inserted ${recipesSeeded} dungeon recipes`);
    } else {
      console.log(`[Seed] All dungeon recipes already exist, skipping`);
    }

    const DUNGEON_FLOOR_COUNTS: Record<string, number> = {};
    for (const t of FLOOR_TEMPLATES) {
      if (!DUNGEON_FLOOR_COUNTS[t.dungeonId] || t.floorRangeEnd > DUNGEON_FLOOR_COUNTS[t.dungeonId]) {
        DUNGEON_FLOOR_COUNTS[t.dungeonId] = t.floorRangeEnd;
      }
    }
    for (const [dungeonId, floorCount] of Object.entries(DUNGEON_FLOOR_COUNTS)) {
      const existing = await db.select().from(dungeons).where(eq(dungeons.id, dungeonId));
      if (existing.length > 0 && existing[0].floorCount !== floorCount) {
        await db.update(dungeons).set({ floorCount }).where(eq(dungeons.id, dungeonId));
        console.log(`[Seed] Updated ${dungeonId} floor_count: ${existing[0].floorCount} → ${floorCount}`);
      }
    }
  } catch (error) {
    console.error('[Seed] Error seeding dungeon data:', error);
    throw error;
  }
}

const FOOD_HEAL_AMOUNTS: Record<string, number> = {
  "Cooked Shrimp": 25,
  "Cooked Sardine": 20,
  "Chicken": 30,
  "Cooked Rabbit": 35,
  "Cooked Meat": 45,
  "Cooked Spirit Fish": 25,
  "Cooked Herring": 55,
  "Cooked Trout": 70,
  "Cooked Salmon": 90,
  "Cooked Sand Eel": 60,
  "Cooked Cave Fish": 45,
  "Cooked Lava Fish": 80,
  "Cooked Tuna": 110,
  "Cooked Lobster": 135,
  "Cooked Swordfish": 165,
  "Cooked Shark": 200,
  "Cooked Dragon Fish": 100,
  "Cooked Frost Fish": 38,
  "Cooked Manta Ray": 250,
  "Cooked Sea Turtle": 310,
  "Cooked Void Fish": 45,
  "Void Fish": 45,
  "dungeon_ration": 200,
  "cursed_bone_broth": 350,
  "shadow_stew": 500,
  "dragon_bone_soup": 700,
  "void_feast": 950,
  "Meat Pie": 105,
  "Goblin Kebab": 110,
  "Fish Stew": 155,
  "Spider Soup": 175,
  "Orc Roast": 230,
  "Wyvern Steak": 35,
  "Drake Roast": 40,
  "Dragon Steak": 42,
  "Frost Dragon Stew": 50,
  "Void Stew": 55,
  "Spirit Feast": 65,
};

// Run migrations independently of seeding
export async function runMigrations(): Promise<void> {
  try {
    // Migration: Merge weapon category into sword category
    const weaponRecipes = await db.select().from(gameRecipes).where(eq(gameRecipes.category, 'weapon'));
    if (weaponRecipes.length > 0) {
      await db.update(gameRecipes).set({ category: 'sword' }).where(eq(gameRecipes.category, 'weapon'));
      console.log(`[Migration] Migrated ${weaponRecipes.length} weapon recipes to sword category`);
    }

    // Migration: Fix invalid wood/tree item IDs in inventories and market
    const WOOD_TO_LOGS_MAP: Record<string, string> = {
      'Petrified Wood': 'petrified_logs',
      'Darkwood': 'darkwood_logs',
      'Ice Wood': 'ice_logs',
      'Normal Tree': 'normal_logs',
      'Oak Tree': 'oak_logs',
      'Willow Tree': 'willow_logs',
      'Maple Tree': 'maple_logs',
      'Yew Tree': 'yew_logs',
      'Magic Tree': 'magic_logs',
      'Elderwood': 'elderwood_logs',
      'Cactus Wood': 'cactus_logs',
      'Dragon Wood': 'dragon_logs',
      'Void Root': 'void_logs',
    };

    const invalidItemIds = Object.keys(WOOD_TO_LOGS_MAP);

    // Remove invalid market listings
    const deletedListings = await db.delete(marketListings)
      .where(inArray(marketListings.itemId, invalidItemIds));
    if (deletedListings.rowCount && deletedListings.rowCount > 0) {
      console.log(`[Migration] Removed ${deletedListings.rowCount} invalid wood/tree market listings`);
    }

    // Fix player inventories: convert old wood/tree IDs to correct log IDs
    for (const [oldId, newId] of Object.entries(WOOD_TO_LOGS_MAP)) {
      const playersWithOldItem = await db.execute(sql`
        SELECT id, inventory FROM players WHERE inventory ? ${oldId}
      `);
      for (const player of playersWithOldItem.rows) {
        const inventory = player.inventory as Record<string, number>;
        const qty = inventory[oldId] || 0;
        if (qty > 0) {
          const existingQty = inventory[newId] || 0;
          inventory[newId] = existingQty + qty;
          delete inventory[oldId];
          await db.update(players).set({ inventory }).where(eq(players.id, player.id as string));
          console.log(`[Migration] Fixed player ${player.id}: ${oldId}(${qty}) → ${newId}(${inventory[newId]})`);
        }
      }
    }

    // Remove duplicate game_items with tree-style IDs (e.g., "Normal Tree", "Oak Tree")
    const duplicateTreeItems = await db.select({ id: gameItems.id }).from(gameItems)
      .where(inArray(gameItems.id, invalidItemIds));
    if (duplicateTreeItems.length > 0) {
      await db.delete(gameItems).where(inArray(gameItems.id, invalidItemIds));
      console.log(`[Migration] Removed ${duplicateTreeItems.length} duplicate tree-named game_items: ${duplicateTreeItems.map(i => i.id).join(', ')}`);
    }

    // Sync food heal amounts to game_items table
    for (const [itemId, healAmount] of Object.entries(FOOD_HEAL_AMOUNTS)) {
      const existing = await db.select({ id: gameItems.id, healAmount: gameItems.healAmount }).from(gameItems).where(eq(gameItems.id, itemId));
      if (existing.length > 0 && existing[0].healAmount !== healAmount) {
        await db.update(gameItems).set({ healAmount }).where(eq(gameItems.id, itemId));
        console.log(`[Migration] Updated ${itemId} heal_amount: ${existing[0].healAmount} → ${healAmount}`);
      }
    }
  } catch (error) {
    console.error('[Migration] Error running migrations:', error);
    throw error;
  }
}

const BADGES_DATA: InsertBadge[] = [
  { id: "alpha_tester_v1", name: "Alpha Tester V1", description: "One of the brave souls who tested the game in its earliest days", icon: "flask", color: "purple", rarity: "rare", imageUrl: "/images/badges/alpha_tester_v1.webp", nameTranslations: { tr: "Alfa Test Kullanıcısı V1", ru: "Альфа-тестер V1", ar: "مختبر ألفا V1", fr: "Testeur Alpha V1", es: "Probador Alfa V1", zh: "内测玩家 V1", hi: "अल्फा टेस्टर V1" }, descriptionTranslations: { tr: "Oyunu en erken günlerinde test eden cesur ruhlardan biri", ru: "Один из смельчаков, тестировавших игру в самые первые дни", ar: "أحد الأرواح الشجاعة التي اختبرت اللعبة في أيامها الأولى", fr: "Une des âmes courageuses qui ont testé le jeu à ses débuts", es: "Una de las almas valientes que probó el juego en sus primeros días", zh: "在游戏最早期进行测试的勇敢灵魂之一", hi: "उन बहादुर आत्माओं में से एक जिन्होंने गेम के शुरुआती दिनों में इसका परीक्षण किया" } },
  { id: "language_master", name: "Language Master", description: "Contributed to translating the game into multiple languages", icon: "globe", color: "cyan", rarity: "rare", imageUrl: "/images/badges/language_master.webp", nameTranslations: { tr: "Dil Ustası", ru: "Мастер языков", ar: "سيد اللغات", fr: "Maître des Langues", es: "Maestro de Idiomas", zh: "语言大师", hi: "भाषा विशेषज्ञ" }, descriptionTranslations: { tr: "Oyunun birden fazla dile çevrilmesine katkıda bulundu", ru: "Внёс вклад в перевод игры на несколько языков", ar: "ساهم في ترجمة اللعبة إلى لغات متعددة", fr: "A contribué à la traduction du jeu en plusieurs langues", es: "Contribuyó a traducir el juego a múltiples idiomas", zh: "为游戏翻译成多种语言做出了贡献", hi: "गेम को कई भाषाओं में अनुवाद करने में योगदान दिया" } },
  { id: "beta_tester", name: "Beta Tester", description: "Participated in beta testing and helped shape the game", icon: "bug", color: "green", rarity: "rare", imageUrl: "/images/badges/beta_tester.webp", nameTranslations: { tr: "Beta Test Kullanıcısı", ru: "Бета-тестер", ar: "مختبر بيتا", fr: "Testeur Bêta", es: "Probador Beta", zh: "公测玩家", hi: "बीटा टेस्टर" }, descriptionTranslations: { tr: "Beta testine katılarak oyunun şekillenmesine yardımcı oldu", ru: "Участвовал в бета-тестировании и помог сформировать игру", ar: "شارك في اختبار بيتا وساعد في تشكيل اللعبة", fr: "A participé aux tests bêta et aidé à façonner le jeu", es: "Participó en las pruebas beta y ayudó a dar forma al juego", zh: "参与了测试并帮助塑造了游戏", hi: "बीटा टेस्टिंग में भाग लिया और गेम को आकार देने में मदद की" } },
  { id: "bug_hunter", name: "Bug Hunter", description: "Found and reported critical bugs that improved the game", icon: "magnifying-glass", color: "orange", rarity: "rare", imageUrl: "/images/badges/bug_hunter.webp", nameTranslations: { tr: "Hata Avcısı", ru: "Охотник за багами", ar: "صائد الأخطاء", fr: "Chasseur de Bugs", es: "Cazador de Bugs", zh: "Bug猎人", hi: "बग हंटर" }, descriptionTranslations: { tr: "Oyunu geliştiren kritik hataları buldu ve bildirdi", ru: "Нашёл и сообщил о критических багах, улучшивших игру", ar: "وجد وأبلغ عن أخطاء حرجة حسّنت اللعبة", fr: "A trouvé et signalé des bugs critiques qui ont amélioré le jeu", es: "Encontró e informó errores críticos que mejoraron el juego", zh: "发现并报告了改善游戏的关键Bug", hi: "गेम को बेहतर बनाने वाले गंभीर बग ढूंढे और रिपोर्ट किए" } },
  { id: "veteran_warrior", name: "Veteran Warrior", description: "A seasoned fighter who has proven their worth in countless battles", icon: "sword", color: "red", rarity: "uncommon", imageUrl: "/images/badges/veteran_warrior.webp", nameTranslations: { tr: "Kıdemli Savaşçı", ru: "Ветеран-воин", ar: "المحارب المخضرم", fr: "Guerrier Vétéran", es: "Guerrero Veterano", zh: "老兵战士", hi: "अनुभवी योद्धा" }, descriptionTranslations: { tr: "Sayısız savaşta değerini kanıtlamış deneyimli bir savaşçı", ru: "Опытный боец, доказавший свою ценность в бесчисленных битвах", ar: "مقاتل متمرس أثبت جدارته في معارك لا تُحصى", fr: "Un combattant aguerri qui a prouvé sa valeur dans d'innombrables batailles", es: "Un luchador experimentado que ha demostrado su valor en innumerables batallas", zh: "在无数战斗中证明了自己价值的经验丰富的战士", hi: "एक अनुभवी लड़ाकू जिसने अनगिनत लड़ाइयों में अपनी योग्यता साबित की" } },
  { id: "master_craftsman", name: "Master Craftsman", description: "Achieved mastery in the art of crafting legendary equipment", icon: "hammer", color: "amber", rarity: "uncommon", imageUrl: "/images/badges/master_craftsman.webp", nameTranslations: { tr: "Usta Zanaatkar", ru: "Мастер-ремесленник", ar: "الحرفي الماهر", fr: "Maître Artisan", es: "Maestro Artesano", zh: "大师工匠", hi: "मास्टर शिल्पकार" }, descriptionTranslations: { tr: "Efsanevi ekipman yapma sanatında ustalığa ulaştı", ru: "Достиг мастерства в искусстве создания легендарного снаряжения", ar: "حقق إتقان فن صنع المعدات الأسطورية", fr: "A atteint la maîtrise dans l'art de fabriquer des équipements légendaires", es: "Alcanzó la maestría en el arte de crear equipo legendario", zh: "在制作传说装备的艺术上达到了大师级别", hi: "महान उपकरण बनाने की कला में महारत हासिल की" } },
  { id: "guild_champion", name: "Guild Champion", description: "Led their guild to greatness and achieved remarkable feats", icon: "crown", color: "gold", rarity: "legendary", imageUrl: "/images/badges/guild_champion.webp", nameTranslations: { tr: "Lonca Şampiyonu", ru: "Чемпион гильдии", ar: "بطل النقابة", fr: "Champion de Guilde", es: "Campeón del Gremio", zh: "公会冠军", hi: "गिल्ड चैंपियन" }, descriptionTranslations: { tr: "Loncasını büyüklüğe taşıdı ve olağanüstü başarılar elde etti", ru: "Привёл свою гильдию к величию и совершил выдающиеся подвиги", ar: "قاد نقابته إلى العظمة وحقق إنجازات رائعة", fr: "A mené sa guilde vers la grandeur et accompli des exploits remarquables", es: "Llevó a su gremio a la grandeza y logró hazañas notables", zh: "带领公会走向辉煌并取得了非凡成就", hi: "अपने गिल्ड को महानता तक ले गए और उल्लेखनीय उपलब्धियां हासिल कीं" } },
  { id: "dungeon_conqueror", name: "Dungeon Conqueror", description: "Conquered the deepest floors of the most dangerous dungeons", icon: "castle", color: "violet", rarity: "rare", imageUrl: "/images/badges/dungeon_conqueror.webp", nameTranslations: { tr: "Zindan Fatihi", ru: "Покоритель подземелий", ar: "قاهر الزنزانات", fr: "Conquérant de Donjon", es: "Conquistador de Mazmorra", zh: "地牢征服者", hi: "कालकोठरी विजेता" }, descriptionTranslations: { tr: "En tehlikeli zindanların en derin katlarını fethetti", ru: "Покорил самые глубокие этажи самых опасных подземелий", ar: "قهر أعمق طوابق أخطر الزنزانات", fr: "A conquis les étages les plus profonds des donjons les plus dangereux", es: "Conquistó los pisos más profundos de las mazmorras más peligrosas", zh: "征服了最危险地牢的最深层", hi: "सबसे खतरनाक कालकोठरियों की गहरी मंजिलों को जीता" } },
  { id: "dragon_slayer", name: "Dragon Slayer", description: "Defeated the mighty dragons of Dragonspire", icon: "fire", color: "red", rarity: "legendary", imageUrl: "/images/badges/dragon_slayer.webp", nameTranslations: { tr: "Ejderha Avcısı", ru: "Убийца драконов", ar: "قاتل التنين", fr: "Tueur de Dragons", es: "Cazador de Dragones", zh: "屠龙者", hi: "ड्रैगन स्लेयर" }, descriptionTranslations: { tr: "Dragonspire'ın güçlü ejderhalarını yendi", ru: "Победил могучих драконов Драгонспайра", ar: "هزم تنانين قلعة التنين العظيمة", fr: "A vaincu les puissants dragons de Dragonspire", es: "Derrotó a los poderosos dragones de Dragonspire", zh: "击败了龙尖塔的强大巨龙", hi: "ड्रैगनस्पायर के शक्तिशाली ड्रैगन को हराया" } },
  { id: "void_walker", name: "Void Walker", description: "Survived the treacherous Void Realm and returned to tell the tale", icon: "eye", color: "indigo", rarity: "legendary", imageUrl: "/images/badges/void_walker.webp", nameTranslations: { tr: "Boşluk Yürüyücüsü", ru: "Странник Пустоты", ar: "سائر الفراغ", fr: "Marcheur du Vide", es: "Caminante del Vacío", zh: "虚空行者", hi: "शून्य यात्री" }, descriptionTranslations: { tr: "Tehlikeli Boşluk Diyarı'ndan sağ salim döndü", ru: "Выжил в коварном Царстве Пустоты и вернулся рассказать об этом", ar: "نجا من عالم الفراغ الغادر وعاد ليروي الحكاية", fr: "A survécu au traître Royaume du Vide et est revenu raconter l'histoire", es: "Sobrevivió al traicionero Reino del Vacío y regresó para contar la historia", zh: "在险恶的虚空领域中幸存并归来讲述故事", hi: "विश्वासघाती शून्य क्षेत्र में जीवित रहे और कहानी सुनाने लौटे" } },
  { id: "merchant_king", name: "Merchant King", description: "Amassed a great fortune through trade and commerce", icon: "coins", color: "yellow", rarity: "uncommon", imageUrl: "/images/badges/merchant_king.webp", nameTranslations: { tr: "Tüccar Kralı", ru: "Король торговцев", ar: "ملك التجار", fr: "Roi Marchand", es: "Rey Mercader", zh: "商业之王", hi: "व्यापार राजा" }, descriptionTranslations: { tr: "Ticaret yoluyla büyük bir servet biriktirdi", ru: "Накопил огромное состояние через торговлю и коммерцию", ar: "جمع ثروة كبيرة من خلال التجارة", fr: "A amassé une grande fortune grâce au commerce", es: "Acumuló una gran fortuna a través del comercio", zh: "通过贸易和商业积累了巨大财富", hi: "व्यापार और वाणिज्य के माध्यम से बड़ी संपत्ति जमा की" } },
  { id: "first_blood", name: "First Blood", description: "One of the first warriors to draw blood in IdleThrone", icon: "drop", color: "red", rarity: "common", imageUrl: "/images/badges/first_blood.webp", nameTranslations: { tr: "İlk Kan", ru: "Первая кровь", ar: "الدم الأول", fr: "Premier Sang", es: "Primera Sangre", zh: "第一滴血", hi: "पहला खून" }, descriptionTranslations: { tr: "IdleThrone'da kan döken ilk savaşçılardan biri", ru: "Один из первых воинов, пролившх кровь в IdleThrone", ar: "أحد أوائل المحاربين الذين سفكوا الدم في IdleThrone", fr: "Un des premiers guerriers à verser le sang dans IdleThrone", es: "Uno de los primeros guerreros en derramar sangre en IdleThrone", zh: "IdleThrone中最早流血的战士之一", hi: "IdleThrone में खून बहाने वाले पहले योद्धाओं में से एक" } },
  { id: "supporter", name: "Supporter", description: "Supported the development of IdleThrone through premium membership", icon: "heart", color: "pink", rarity: "uncommon", imageUrl: "/images/badges/supporter.webp", nameTranslations: { tr: "Destekçi", ru: "Поддержка", ar: "الداعم", fr: "Supporter", es: "Patrocinador", zh: "支持者", hi: "समर्थक" }, descriptionTranslations: { tr: "Premium üyelik ile IdleThrone'un geliştirilmesini destekledi", ru: "Поддержал разработку IdleThrone через премиум-подписку", ar: "دعم تطوير IdleThrone من خلال العضوية المميزة", fr: "A soutenu le développement d'IdleThrone via l'abonnement premium", es: "Apoyó el desarrollo de IdleThrone a través de la membresía premium", zh: "通过高级会员支持了IdleThrone的开发", hi: "प्रीमियम सदस्यता के माध्यम से IdleThrone के विकास का समर्थन किया" } },
  { id: "community_hero", name: "Community Hero", description: "Made exceptional contributions to the community", icon: "users", color: "blue", rarity: "rare", imageUrl: "/images/badges/community_hero.webp", nameTranslations: { tr: "Topluluk Kahramanı", ru: "Герой сообщества", ar: "بطل المجتمع", fr: "Héros Communautaire", es: "Héroe de la Comunidad", zh: "社区英雄", hi: "समुदाय नायक" }, descriptionTranslations: { tr: "Topluluğa olağanüstü katkılarda bulundu", ru: "Внёс исключительный вклад в сообщество", ar: "قدم مساهمات استثنائية للمجتمع", fr: "A apporté des contributions exceptionnelles à la communauté", es: "Hizo contribuciones excepcionales a la comunidad", zh: "为社区做出了杰出贡献", hi: "समुदाय में असाधारण योगदान दिया" } },
  { id: "speed_runner", name: "Speed Runner", description: "Achieved incredible speed records in dungeon runs", icon: "timer", color: "lime", rarity: "rare", imageUrl: "/images/badges/speed_runner.webp", nameTranslations: { tr: "Hız Koşucusu", ru: "Спидраннер", ar: "المتسابق السريع", fr: "Speed Runner", es: "Corredor Rápido", zh: "速通玩家", hi: "स्पीड रनर" }, descriptionTranslations: { tr: "Zindan koşularında inanılmaz hız rekorları kırdı", ru: "Установил невероятные рекорды скорости в подземельях", ar: "حقق أرقامًا قياسية لا تصدق في سرعة إتمام الزنزانات", fr: "A établi des records de vitesse incroyables dans les donjons", es: "Logró récords de velocidad increíbles en las mazmorras", zh: "在地牢挑战中创造了惊人的速通记录", hi: "कालकोठरी रन में अविश्वसनीय गति रिकॉर्ड हासिल किए" } },
  { id: "legendary_smith", name: "Legendary Smith", description: "Forged legendary weapons and armor of unmatched quality", icon: "anvil", color: "orange", rarity: "uncommon", imageUrl: "/images/badges/legendary_smith.webp", nameTranslations: { tr: "Efsanevi Demirci", ru: "Легендарный кузнец", ar: "الحداد الأسطوري", fr: "Forgeron Légendaire", es: "Herrero Legendario", zh: "传奇铁匠", hi: "महान लोहार" }, descriptionTranslations: { tr: "Eşsiz kalitede efsanevi silahlar ve zırhlar dövdü", ru: "Выковал легендарное оружие и доспехи непревзойдённого качества", ar: "صنع أسلحة ودروعًا أسطورية لا مثيل لها", fr: "A forgé des armes et armures légendaires d'une qualité inégalée", es: "Forjó armas y armaduras legendarias de calidad inigualable", zh: "锻造了无与伦比的传说级武器和护甲", hi: "बेजोड़ गुणवत्ता के महान हथियार और कवच बनाए" } },
  { id: "frost_survivor", name: "Frost Survivor", description: "Endured the harsh conditions of the Frozen Wastes", icon: "snowflake", color: "sky", rarity: "uncommon", imageUrl: "/images/badges/frost_survivor.webp", nameTranslations: { tr: "Buz Hayatta Kalanı", ru: "Выживший во льдах", ar: "ناجي الصقيع", fr: "Survivant du Gel", es: "Superviviente del Hielo", zh: "冰霜幸存者", hi: "हिम जीवी" }, descriptionTranslations: { tr: "Donmuş Çorak Arazilerin zorlu koşullarına dayandı", ru: "Выдержал суровые условия Ледяных Пустошей", ar: "تحمّل الظروف القاسية للأراضي المتجمدة", fr: "A enduré les conditions difficiles des Terres Gelées", es: "Soportó las duras condiciones de los Páramos Helados", zh: "在冰封荒原的恶劣条件下生存了下来", hi: "जमे हुए बंजर भूमि की कठोर परिस्थितियों में जीवित रहे" } },
  { id: "mythic_finder", name: "Mythic Finder", description: "Discovered an incredibly rare mythic item", icon: "star", color: "fuchsia", rarity: "legendary", imageUrl: "/images/badges/mythic_finder.webp", nameTranslations: { tr: "Mitik Bulucu", ru: "Нашедший мифический предмет", ar: "مكتشف الأسطوري", fr: "Trouveur Mythique", es: "Buscador Mítico", zh: "神话发现者", hi: "पौराणिक खोजकर्ता" }, descriptionTranslations: { tr: "İnanılmaz derecede nadir bir mitik eşya keşfetti", ru: "Обнаружил невероятно редкий мифический предмет", ar: "اكتشف قطعة أسطورية نادرة للغاية", fr: "A découvert un objet mythique incroyablement rare", es: "Descubrió un objeto mítico increíblemente raro", zh: "发现了一件极其稀有的神话物品", hi: "एक अविश्वसनीय रूप से दुर्लभ पौराणिक वस्तु खोजी" } },

  // Achievement-earned badges (very hard to get)
  { id: "badge_chicken_maniac", name: "Chicken Maniac", description: "Killed 100,000 chickens. Why?", icon: "skull", color: "yellow", rarity: "legendary", imageUrl: "/images/badges/badge_chicken_maniac.webp", nameTranslations: { tr: "Tavuk Manyağı", ru: "Куриный Маньяк", ar: "هوس الدجاج", fr: "Maniaque du Poulet", es: "Maníaco del Pollo", zh: "屠鸡狂魔", hi: "चिकन पागल" }, descriptionTranslations: { tr: "100.000 tavuk öldürdü. Neden?", ru: "Убил 100.000 куриц. Зачем?", ar: "قتل 100,000 دجاجة. لماذا؟", fr: "A tué 100 000 poulets. Pourquoi?", es: "Mató 100.000 pollos. ¿Por qué?", zh: "杀死了10万只鸡。为什么？", hi: "100,000 मुर्गियों को मारा। क्यों?" } },
  { id: "badge_djinn_destroyer", name: "Djinn Destroyer", description: "Slain 10,000 Djinns in the Star Desert", icon: "fire", color: "amber", rarity: "legendary", imageUrl: "/images/badges/badge_djinn_destroyer.webp", nameTranslations: { tr: "Cin Yok Edici", ru: "Уничтожитель Джиннов", ar: "مُبيد الجن", fr: "Destructeur de Djinns", es: "Destructor de Djinns", zh: "灯神毁灭者", hi: "जिन्न विनाशक" }, descriptionTranslations: { tr: "Yıldız Çölü'nde 10.000 Cin öldürdü", ru: "Убил 10.000 Джиннов в Звёздной Пустыне", ar: "قتل 10,000 جني في صحراء النجوم", fr: "A tué 10 000 Djinns dans le Désert des Étoiles", es: "Mató 10.000 Djinns en el Desierto Estelar", zh: "在星辰沙漠中消灭了10000个灯神", hi: "स्टार डेजर्ट में 10,000 जिन्न को मारा" } },
  { id: "badge_dragon_slayer_legend", name: "Dragon Slayer Legend", description: "Killed the Dragon King 5,000 times", icon: "skull", color: "red", rarity: "legendary", imageUrl: "/images/badges/badge_dragon_slayer_legend.webp", nameTranslations: { tr: "Efsanevi Ejderha Avcısı", ru: "Легенда-Убийца Драконов", ar: "أسطورة قاتل التنين", fr: "Légende Tueur de Dragons", es: "Leyenda Cazadragones", zh: "屠龙传奇", hi: "ड्रैगन स्लेयर लीजेंड" }, descriptionTranslations: { tr: "Ejderha Kralı'nı 5.000 kez öldürdü", ru: "Убил Короля Драконов 5.000 раз", ar: "قتل ملك التنانين 5,000 مرة", fr: "A tué le Roi Dragon 5 000 fois", es: "Mató al Rey Dragón 5.000 veces", zh: "击杀龙王5000次", hi: "ड्रैगन किंग को 5,000 बार मारा" } },
  { id: "badge_void_emperor", name: "Void Emperor", description: "Dethroned The Void King 10,000 times", icon: "crown", color: "indigo", rarity: "legendary", imageUrl: "/images/badges/badge_void_emperor.webp", nameTranslations: { tr: "Boşluk İmparatoru", ru: "Император Пустоты", ar: "إمبراطور الفراغ", fr: "Empereur du Vide", es: "Emperador del Vacío", zh: "虚空帝王", hi: "शून्य सम्राट" }, descriptionTranslations: { tr: "Boşluk Kralı'nı 10.000 kez tahtından indirdi", ru: "Сверг Короля Пустоты 10.000 раз", ar: "أسقط ملك الفراغ من عرشه 10,000 مرة", fr: "A détrôné le Roi du Vide 10 000 fois", es: "Destronó al Rey del Vacío 10.000 veces", zh: "废黜虚空之王10000次", hi: "वॉइड किंग को 10,000 बार सिंहासन से उतारा" } },
  { id: "badge_frost_conqueror", name: "Frost Conqueror", description: "Killed 10,000 Frost Dragons", icon: "snowflake", color: "sky", rarity: "legendary", imageUrl: "/images/badges/badge_frost_conqueror.webp", nameTranslations: { tr: "Buz Fatihi", ru: "Покоритель Мороза", ar: "قاهر الصقيع", fr: "Conquérant du Gel", es: "Conquistador del Hielo", zh: "冰霜征服者", hi: "हिम विजेता" }, descriptionTranslations: { tr: "10.000 Buz Ejderhası öldürdü", ru: "Убил 10.000 Ледяных Драконов", ar: "قتل 10,000 تنين جليدي", fr: "A tué 10 000 Dragons de Givre", es: "Mató 10.000 Dragones de Hielo", zh: "击杀10000条冰霜巨龙", hi: "10,000 फ्रॉस्ट ड्रैगन को मारा" } },
  { id: "badge_dark_lords_bane", name: "Dark Lord's Bane", description: "Ended the Dark Lord 10,000 times", icon: "skull", color: "violet", rarity: "legendary", imageUrl: "/images/badges/badge_dark_lords_bane.webp", nameTranslations: { tr: "Karanlık Lord'un Belası", ru: "Погибель Тёмного Лорда", ar: "لعنة اللورد المظلم", fr: "Fléau du Seigneur Noir", es: "Perdición del Señor Oscuro", zh: "暗黑领主之祸", hi: "डार्क लॉर्ड का अंत" }, descriptionTranslations: { tr: "Karanlık Lord'u 10.000 kez sona erdirdi", ru: "Уничтожил Тёмного Лорда 10.000 раз", ar: "أنهى اللورد المظلم 10,000 مرة", fr: "A mis fin au Seigneur Noir 10 000 fois", es: "Acabó con el Señor Oscuro 10.000 veces", zh: "终结暗黑领主10000次", hi: "डार्क लॉर्ड को 10,000 बार समाप्त किया" } },
  { id: "badge_wolf_exterminator", name: "Wolf Exterminator", description: "Killed 50,000 wolves", icon: "paw", color: "gray", rarity: "rare", imageUrl: "/images/badges/badge_wolf_exterminator.webp", nameTranslations: { tr: "Kurt Avcısı", ru: "Истребитель Волков", ar: "مُبيد الذئاب", fr: "Exterminateur de Loups", es: "Exterminador de Lobos", zh: "灭狼者", hi: "भेड़िया विनाशक" }, descriptionTranslations: { tr: "50.000 kurt öldürdü", ru: "Убил 50.000 волков", ar: "قتل 50,000 ذئب", fr: "A tué 50 000 loups", es: "Mató 50.000 lobos", zh: "击杀50000只狼", hi: "50,000 भेड़ियों को मारा" } },
  { id: "badge_arachnophobia", name: "Arachnophobia Cure", description: "Killed 25,000 Giant Spiders", icon: "bug", color: "green", rarity: "rare", imageUrl: "/images/badges/badge_arachnophobia.webp", nameTranslations: { tr: "Araknofobi Tedavisi", ru: "Лекарство от Арахнофобии", ar: "علاج رهاب العناكب", fr: "Remède Arachnophobie", es: "Cura de Aracnofobia", zh: "蛛恐治愈", hi: "अरैक्नोफोबिया इलाज" }, descriptionTranslations: { tr: "25.000 Dev Örümcek öldürdü", ru: "Убил 25.000 Гигантских Пауков", ar: "قتل 25,000 عنكبوت عملاق", fr: "A tué 25 000 Araignées Géantes", es: "Mató 25.000 Arañas Gigantes", zh: "击杀25000只巨型蜘蛛", hi: "25,000 विशाल मकड़ियों को मारा" } },
  { id: "badge_crown_collector", name: "Crown Collector", description: "Collected Crown of Flames 50 times (0.1% drop rate)", icon: "crown", color: "red", rarity: "legendary", imageUrl: "/images/badges/badge_crown_collector.webp", nameTranslations: { tr: "Taç Koleksiyoncusu", ru: "Коллекционер Корон", ar: "جامع التيجان", fr: "Collectionneur de Couronnes", es: "Coleccionista de Coronas", zh: "王冠收藏家", hi: "ताज संग्रहकर्ता" }, descriptionTranslations: { tr: "Alev Tacı'nı 50 kez düşürdü (%0.1 düşme şansı)", ru: "Собрал Корону Пламени 50 раз (шанс выпадения 0,1%)", ar: "جمع تاج اللهب 50 مرة (معدل سقوط 0.1%)", fr: "A collecté la Couronne de Flammes 50 fois (0,1% de chance)", es: "Recolectó la Corona de Llamas 50 veces (0,1% de probabilidad)", zh: "收集烈焰之冠50次（0.1%掉率）", hi: "क्राउन ऑफ फ्लेम्स 50 बार इकट्ठा किया (0.1% ड्रॉप दर)" } },
  { id: "badge_verdant_veteran", name: "Verdant Veteran", description: "Killed 50,000 monsters in Verdant Valley", icon: "tree", color: "green", rarity: "rare", imageUrl: "/images/badges/badge_verdant_veteran.webp", nameTranslations: { tr: "Yeşil Vadi Kıdemlisi", ru: "Ветеран Зелёной Долины", ar: "محارب الوادي الأخضر", fr: "Vétéran de la Vallée Verdoyante", es: "Veterano del Valle Verde", zh: "翠绿谷老兵", hi: "वर्डेंट वेली वयोवृद्ध" }, descriptionTranslations: { tr: "Yeşil Vadi'de 50.000 canavar öldürdü", ru: "Убил 50.000 монстров в Зелёной Долине", ar: "قتل 50,000 وحش في الوادي الأخضر", fr: "A tué 50 000 monstres dans la Vallée Verdoyante", es: "Mató 50.000 monstruos en el Valle Verde", zh: "在翠绿谷击杀50000只怪物", hi: "वर्डेंट वैली में 50,000 राक्षसों को मारा" } },
  { id: "badge_void_walker_region", name: "Void Walker", description: "Killed 25,000 monsters in Void Realm", icon: "eye", color: "indigo", rarity: "legendary", imageUrl: "/images/badges/badge_void_walker_region.webp", nameTranslations: { tr: "Boşluk Yürüyücüsü", ru: "Странник Пустоты", ar: "سائر الفراغ", fr: "Marcheur du Vide", es: "Caminante del Vacío", zh: "虚空行者", hi: "शून्य यात्री" }, descriptionTranslations: { tr: "Boşluk Diyarı'nda 25.000 canavar öldürdü", ru: "Убил 25.000 монстров в Царстве Пустоты", ar: "قتل 25,000 وحش في عالم الفراغ", fr: "A tué 25 000 monstres dans le Royaume du Vide", es: "Mató 25.000 monstruos en el Reino del Vacío", zh: "在虚空领域击杀25000只怪物", hi: "वॉइड रीयलम में 25,000 राक्षसों को मारा" } },
  { id: "badge_dragonspire_legend", name: "Dragonspire Legend", description: "Killed 25,000 monsters in Dragonspire", icon: "fire", color: "red", rarity: "legendary", imageUrl: "/images/badges/badge_dragonspire_legend.webp", nameTranslations: { tr: "Dragonspire Efsanesi", ru: "Легенда Драгонспайра", ar: "أسطورة قلعة التنين", fr: "Légende de Dragonspire", es: "Leyenda de Dragonspire", zh: "龙尖塔传奇", hi: "ड्रैगनस्पायर लीजेंड" }, descriptionTranslations: { tr: "Dragonspire'da 25.000 canavar öldürdü", ru: "Убил 25.000 монстров в Драгонспайре", ar: "قتل 25,000 وحش في قلعة التنين", fr: "A tué 25 000 monstres à Dragonspire", es: "Mató 25.000 monstruos en Dragonspire", zh: "在龙尖塔击杀25000只怪物", hi: "ड्रैगनस्पायर में 25,000 राक्षसों को मारा" } },
  { id: "badge_battle_hardened", name: "Battle Hardened", description: "Killed 1,000,000 monsters in total", icon: "skull", color: "red", rarity: "legendary", imageUrl: "/images/badges/badge_battle_hardened.webp", nameTranslations: { tr: "Savaşta Pişmiş", ru: "Закалённый в бою", ar: "محنك في المعارك", fr: "Endurci au Combat", es: "Curtido en Batalla", zh: "百战老兵", hi: "युद्ध में तपा हुआ" }, descriptionTranslations: { tr: "Toplamda 1.000.000 canavar öldürdü", ru: "Убил 1.000.000 монстров в сумме", ar: "قتل 1,000,000 وحش إجمالاً", fr: "A tué 1 000 000 de monstres au total", es: "Mató 1.000.000 de monstruos en total", zh: "总共击杀1000000只怪物", hi: "कुल मिलाकर 1,000,000 राक्षसों को मारा" } },
  { id: "badge_damage_dealer", name: "Damage Dealer", description: "Dealt 100,000,000 total damage", icon: "lightning", color: "orange", rarity: "legendary", imageUrl: "/images/badges/badge_damage_dealer.webp", nameTranslations: { tr: "Hasar Makinesi", ru: "Машина Урона", ar: "آلة الضرر", fr: "Machine à Dégâts", es: "Máquina de Daño", zh: "伤害制造者", hi: "डैमेज डीलर" }, descriptionTranslations: { tr: "Toplamda 100.000.000 hasar verdi", ru: "Нанёс 100.000.000 единиц урона", ar: "ألحق 100,000,000 من الضرر الإجمالي", fr: "A infligé 100 000 000 de dégâts au total", es: "Infligió 100.000.000 de daño total", zh: "总共造成100000000点伤害", hi: "कुल 100,000,000 डैमेज दिया" } },
  { id: "badge_never_give_up", name: "Never Give Up", description: "Died 5,000 times but kept fighting", icon: "heart_broken", color: "pink", rarity: "rare", imageUrl: "/images/badges/badge_never_give_up.webp", nameTranslations: { tr: "Asla Vazgeçme", ru: "Никогда не сдавайся", ar: "لا تستسلم أبداً", fr: "N'Abandonne Jamais", es: "Nunca Te Rindas", zh: "永不放弃", hi: "कभी हार मत मानो" }, descriptionTranslations: { tr: "5.000 kez öldü ama savaşmaya devam etti", ru: "Умер 5.000 раз, но продолжил сражаться", ar: "مات 5,000 مرة لكنه واصل القتال", fr: "Est mort 5 000 fois mais a continué à se battre", es: "Murió 5.000 veces pero siguió luchando", zh: "死亡5000次但仍继续战斗", hi: "5,000 बार मरे लेकिन लड़ते रहे" } },
  { id: "badge_unstoppable", name: "Unstoppable", description: "10,000 kill streak without dying", icon: "fire", color: "orange", rarity: "legendary", imageUrl: "/images/badges/badge_unstoppable.webp", nameTranslations: { tr: "Durdurulamaz", ru: "Неудержимый", ar: "لا يمكن إيقافه", fr: "Inarrêtable", es: "Imparable", zh: "势不可挡", hi: "अजेय" }, descriptionTranslations: { tr: "Ölmeden 10.000 ardışık öldürme", ru: "10.000 убийств подряд без смерти", ar: "10,000 قتل متتالي بدون موت", fr: "10 000 kills consécutifs sans mourir", es: "10.000 muertes consecutivas sin morir", zh: "不死亡连续击杀10000只", hi: "बिना मरे 10,000 लगातार किल" } },
  { id: "badge_raid_champion", name: "Raid Champion", description: "Dealt massive damage in guild raids", icon: "skull", color: "red", rarity: "legendary", imageUrl: "/images/badges/badge_raid_champion.webp", nameTranslations: { tr: "Baskın Şampiyonu", ru: "Чемпион Рейдов", ar: "بطل الغارات", fr: "Champion de Raid", es: "Campeón de Raid", zh: "团本冠军", hi: "रेड चैंपियन" }, descriptionTranslations: { tr: "Lonca baskınlarında devasa hasar verdi", ru: "Нанёс огромный урон в рейдах гильдии", ar: "ألحق ضرراً هائلاً في غارات النقابة", fr: "A infligé des dégâts massifs dans les raids de guilde", es: "Infligió daño masivo en raids de gremio", zh: "在公会团本中造成巨大伤害", hi: "गिल्ड रेड में भारी डैमेज दिया" } },
  { id: "badge_raid_veteran", name: "Raid Veteran", description: "Participated in 2,000 guild raids", icon: "skull", color: "violet", rarity: "legendary", imageUrl: "/images/badges/badge_raid_veteran.webp", nameTranslations: { tr: "Baskın Kıdemlisi", ru: "Ветеран Рейдов", ar: "محارب غارات مخضرم", fr: "Vétéran de Raid", es: "Veterano de Raid", zh: "团本老手", hi: "रेड वयोवृद्ध" }, descriptionTranslations: { tr: "2.000 lonca baskınına katıldı", ru: "Участвовал в 2.000 рейдах гильдии", ar: "شارك في 2,000 غارة نقابة", fr: "A participé à 2 000 raids de guilde", es: "Participó en 2.000 raids de gremio", zh: "参加了2000次公会团本", hi: "2,000 गिल्ड रेड में भाग लिया" } },
  { id: "badge_afk_champion", name: "AFK Champion", description: "Completed 5,000 offline progress sessions", icon: "clock", color: "blue", rarity: "rare", imageUrl: "/images/badges/badge_afk_champion.webp", nameTranslations: { tr: "AFK Şampiyonu", ru: "Чемпион AFK", ar: "بطل AFK", fr: "Champion AFK", es: "Campeón AFK", zh: "挂机冠军", hi: "AFK चैंपियन" }, descriptionTranslations: { tr: "5.000 çevrimdışı ilerleme oturumu tamamladı", ru: "Завершил 5.000 сеансов оффлайн-прогресса", ar: "أكمل 5,000 جلسة تقدم دون اتصال", fr: "A complété 5 000 sessions de progression hors-ligne", es: "Completó 5.000 sesiones de progreso sin conexión", zh: "完成5000次离线进度", hi: "5,000 ऑफलाइन प्रोग्रेस सेशन पूरे किए" } },
  { id: "badge_loyal", name: "Loyal Player", description: "Logged in for 365 consecutive days", icon: "calendar", color: "gold", rarity: "legendary", imageUrl: "/images/badges/badge_loyal.webp", nameTranslations: { tr: "Sadık Oyuncu", ru: "Верный Игрок", ar: "اللاعب الوفي", fr: "Joueur Fidèle", es: "Jugador Leal", zh: "忠诚玩家", hi: "वफादार खिलाड़ी" }, descriptionTranslations: { tr: "365 ardışık gün giriş yaptı", ru: "Заходил 365 дней подряд", ar: "سجّل دخولاً لمدة 365 يوماً متتالياً", fr: "S'est connecté pendant 365 jours consécutifs", es: "Inició sesión durante 365 días consecutivos", zh: "连续365天登录", hi: "365 लगातार दिनों तक लॉगिन किया" } },
  { id: "alpha_upholder", name: "Alpha Upholder", description: "A generous soul who supported the game during its earliest days. Exclusive cosmetics await!", icon: "heart", color: "amber", rarity: "epic", imageUrl: "/images/badges/alpha_upholder.webp", nameTranslations: { tr: "Alfa Destekçisi", ru: "Альфа-покровитель", ar: "داعم ألفا", fr: "Bienfaiteur Alpha", es: "Benefactor Alfa", zh: "内测赞助者", hi: "अल्फा सहायक" }, descriptionTranslations: { tr: "Oyunun en erken günlerinde destek veren cömert bir ruh. Özel kozmetikler sizi bekliyor!", ru: "Щедрая душа, поддержавшая игру в самые первые дни. Эксклюзивная косметика ждёт!", ar: "روح كريمة دعمت اللعبة في أيامها الأولى. مستحضرات تجميل حصرية بانتظارك!", fr: "Une âme généreuse qui a soutenu le jeu à ses débuts. Des cosmétiques exclusifs vous attendent !", es: "Un alma generosa que apoyó el juego en sus primeros días. ¡Cosméticos exclusivos te esperan!", zh: "在游戏最早期慷慨支持的灵魂。独家外观等着你！", hi: "शुरुआती दिनों में गेम का समर्थन करने वाली उदार आत्मा। विशेष कॉस्मेटिक्स आपका इंतजार कर रहे हैं!" } },
  { id: "itchio_supporter", name: "Itch.io Supporter", description: "Rated and supported the game on itch.io. Exclusive cosmetics await!", icon: "star", color: "cyan", rarity: "epic", imageUrl: "/images/badges/itchio_supporter.webp", nameTranslations: { tr: "Itch.io Destekçisi", ru: "Поддержавший на Itch.io", ar: "داعم Itch.io", fr: "Supporter Itch.io", es: "Supporter Itch.io", zh: "Itch.io 支持者", hi: "Itch.io समर्थक" }, descriptionTranslations: { tr: "Oyunu itch.io'da değerlendirip destekledi. Özel kozmetikler sizi bekliyor!", ru: "Оценил и поддержал игру на itch.io. Эксклюзивная косметика ждёт!", ar: "قيّم ودعم اللعبة على itch.io. مستحضرات تجميل حصرية بانتظارك!", fr: "A noté et soutenu le jeu sur itch.io. Des cosmétiques exclusifs vous attendent !", es: "Valoró y apoyó el juego en itch.io. ¡Cosméticos exclusivos te esperan!", zh: "在itch.io上评价并支持了游戏。独家外观等着你！", hi: "itch.io पर गेम को रेट और सपोर्ट किया। विशेष कॉस्मेटिक्स आपका इंतजार कर रहे हैं!" } },
];

export async function seedBadges() {
  try {
    const existing = await db.select({ id: badges.id, imageUrl: badges.imageUrl }).from(badges);
    const existingIds = new Set(existing.map(b => b.id));
    const newBadges = BADGES_DATA.filter(b => !existingIds.has(b.id));
    if (newBadges.length > 0) {
      for (const badge of newBadges) {
        await db.insert(badges).values(badge).onConflictDoNothing();
      }
      console.log(`[Seed] Inserted ${newBadges.length} new badges`);
    }
    const badgesNeedingImageUpdate = existing.filter(b => {
      const data = BADGES_DATA.find(bd => bd.id === b.id);
      if (!data?.imageUrl) return false;
      return !b.imageUrl || b.imageUrl === '' || b.imageUrl !== data.imageUrl;
    });
    for (const b of badgesNeedingImageUpdate) {
      const data = BADGES_DATA.find(bd => bd.id === b.id);
      if (data?.imageUrl) {
        await db.update(badges).set({ imageUrl: data.imageUrl }).where(eq(badges.id, b.id));
      }
    }
    if (badgesNeedingImageUpdate.length > 0) {
      console.log(`[Seed] Updated imageUrl for ${badgesNeedingImageUpdate.length} badges`);
    }
  } catch (error) {
    console.error('[Seed] Error seeding badges:', error);
  }
}

export async function seedSpecialBadges() {
  try {
    const specialBadges = [
      {
        id: 'first_dungeon_steps',
        name: 'First Dungeon Steps!',
        description: 'Awarded to brave alpha testers who were the first to explore the dungeons.',
        icon: '🏰',
        color: 'purple',
        rarity: 'legendary',
        nameTranslations: { tr: 'İlk Zindan Adımları!', es: 'Primeros Pasos en Mazmorra', fr: 'Premiers Pas en Donjon', ru: 'Первые шаги в подземелье!', zh: '地牢初探！', ar: 'خطوات الزنزانة الأولى!', hi: 'पहले डंजन कदम!' },
        descriptionTranslations: { tr: 'Alpha testinde zindanları ilk keşfeden cesur oyunculara verilir.', es: 'Otorgado a los valientes alfa testers que fueron los primeros en explorar las mazmorras.', fr: 'Décerné aux courageux testeurs alpha qui ont été les premiers à explorer les donjons.', ru: 'Присуждается смелым альфа-тестерам, первыми исследовавшим подземелья.', zh: '授予首批探索地牢的勇敢Alpha测试者。', ar: 'يُمنح لمختبري ألفا الشجعان الذين كانوا أول من استكشف الأبراج المحصنة.', hi: 'उन बहादुर अल्फा टेस्टर्स को दिया जाता है जिन्होंने सबसे पहले डंजन की खोज की।' },
      },
    ];

    const existing = await db.select({ id: badges.id }).from(badges);
    const existingIds = new Set(existing.map(b => b.id));

    let created = 0;
    for (const badge of specialBadges) {
      if (!existingIds.has(badge.id)) {
        await db.insert(badges).values({
          id: badge.id,
          name: badge.name,
          description: badge.description,
          icon: badge.icon,
          color: badge.color,
          rarity: badge.rarity,
          imageUrl: null,
          nameTranslations: badge.nameTranslations,
          descriptionTranslations: badge.descriptionTranslations,
        }).onConflictDoNothing();
        created++;
      }
    }

    if (created > 0) {
      console.log(`[Seed] Special badges: ${created} created`);
    } else {
      console.log(`[Seed] All special badges already exist`);
    }
  } catch (error) {
    console.error('[Seed] Error seeding special badges:', error);
  }
}

export async function seedAchievementTierBadges() {
  try {
    const { generateAchievements } = await import('./achievementSeeds');
    const achievements = generateAchievements();

    const tierBadgeEntries: Array<{
      badgeId: string;
      achievementName: string;
      achievementIcon: string;
      achievementDesc: string;
      achievementNameTr: Record<string, string>;
      achievementDescTr: Record<string, string>;
      tier: number;
      totalTiers: number;
    }> = [];

    for (const ach of achievements) {
      const tiersList = (ach.tiers as any[]) || [];
      for (const t of tiersList) {
        if (t.badgeId) {
          tierBadgeEntries.push({
            badgeId: t.badgeId,
            achievementName: ach.name || ach.id,
            achievementIcon: ach.icon || 'trophy',
            achievementDesc: ach.description || '',
            achievementNameTr: (ach.nameTranslations as Record<string, string>) || {},
            achievementDescTr: (ach.descriptionTranslations as Record<string, string>) || {},
            tier: t.tier,
            totalTiers: tiersList.length,
          });
        }
      }
    }

    const existing = await db.select({ id: badges.id }).from(badges);
    const existingIds = new Set(existing.map(b => b.id));

    const RARITY_BY_TIER: Record<number, string> = {
      1: 'legendary', 2: 'legendary', 3: 'epic', 4: 'rare', 5: 'uncommon',
      6: 'uncommon', 7: 'uncommon', 8: 'uncommon',
    };

    const ICON_MAP: Record<string, string> = {
      'sword': 'sword', 'skull': 'skull', 'lightning': 'lightning',
      'shield': 'shield', 'heart': 'heart', 'star': 'star',
      'tree': 'tree', 'fire': 'fire', 'crown': 'crown',
      'hammer': 'hammer', 'coins': 'coins', 'trophy': 'trophy',
    };

    let created = 0;
    let updated = 0;
    for (const entry of tierBadgeEntries) {
      const name = `${entry.achievementName} (Tier ${entry.tier})`;
      const description = `${entry.achievementDesc} - Tier ${entry.tier}`;
      const icon = ICON_MAP[entry.achievementIcon] || entry.achievementIcon || 'trophy';

      const baseBadgeId = entry.badgeId.replace(/_t\d+$/, '');
      const imageUrl = `/images/badges/${baseBadgeId}.webp`;

      const nameTranslations: Record<string, string> = {};
      const descTranslations: Record<string, string> = {};
      for (const [lang, val] of Object.entries(entry.achievementNameTr)) {
        nameTranslations[lang] = `${val} (Tier ${entry.tier})`;
      }
      for (const [lang, val] of Object.entries(entry.achievementDescTr)) {
        descTranslations[lang] = `${val} - Tier ${entry.tier}`;
      }

      if (!existingIds.has(entry.badgeId)) {
        await db.insert(badges).values({
          id: entry.badgeId,
          name,
          description,
          icon,
          color: 'amber',
          rarity: RARITY_BY_TIER[entry.tier] || 'rare',
          imageUrl,
          nameTranslations,
          descriptionTranslations: descTranslations,
        }).onConflictDoNothing();
        created++;
      } else {
        await db.update(badges).set({
          name,
          description,
          icon,
          rarity: RARITY_BY_TIER[entry.tier] || 'rare',
          imageUrl,
          nameTranslations,
          descriptionTranslations: descTranslations,
        }).where(eq(badges.id, entry.badgeId));
        updated++;
      }
    }

    if (created > 0 || updated > 0) {
      console.log(`[Seed] Achievement tier badges: ${created} created, ${updated} updated`);
    } else {
      console.log(`[Seed] All achievement tier badges already exist`);
    }
  } catch (error) {
    console.error('[Seed] Error seeding achievement tier badges:', error);
  }
}

export async function seedRaidV2Items(): Promise<void> {
  try {
    const items = [
      // Essences
      { id: 'infernal_essence', name: 'Infernal Essence', description: 'A blazing essence collected from the Infernal Titan. Used in the Raid Forge to craft powerful armor.', type: 'material', vendor_price: 50, untradable: 0, name_translations: { en: 'Infernal Essence', de: 'Infernalesssenz', es: 'Esencia Infernal', fr: 'Essence Infernale', ru: 'Адская Эссенция', zh: '炼狱精华', tr: 'Cehennem Özü', pt: 'Essência Infernal' }, description_translations: { en: 'A blazing essence collected from the Infernal Titan. Used in the Raid Forge to craft powerful armor.' } },
      { id: 'frost_essence', name: 'Frost Essence', description: 'A frozen essence from the Frost Wyrm. Used in the Raid Forge to craft powerful armor.', type: 'material', vendor_price: 50, untradable: 0, name_translations: { en: 'Frost Essence', de: 'Frostessenz', es: 'Esencia Helada', fr: 'Essence de Givre', ru: 'Ледяная Эссенция', zh: '寒霜精华', tr: 'Buz Özü', pt: 'Essência de Gelo' }, description_translations: { en: 'A frozen essence from the Frost Wyrm. Used in the Raid Forge to craft powerful armor.' } },
      { id: 'shadow_essence', name: 'Shadow Essence', description: 'A dark essence from the Shadow Colossus. Used in the Raid Forge to craft powerful armor.', type: 'material', vendor_price: 50, untradable: 0, name_translations: { en: 'Shadow Essence', de: 'Schattenessenz', es: 'Esencia de Sombra', fr: "Essence d'Ombre", ru: 'Теневая Эссенция', zh: '暗影精华', tr: 'Gölge Özü', pt: 'Essência das Sombras' }, description_translations: { en: 'A dark essence from the Shadow Colossus. Used in the Raid Forge to craft powerful armor.' } },
      { id: 'thunder_essence', name: 'Thunder Essence', description: 'A crackling essence from the Thunder God. Used in the Raid Forge to craft powerful armor.', type: 'material', vendor_price: 50, untradable: 0, name_translations: { en: 'Thunder Essence', de: 'Donneressenz', es: 'Esencia del Trueno', fr: 'Essence du Tonnerre', ru: 'Громовая Эссенция', zh: '雷霆精华', tr: 'Gök Gürültüsü Özü', pt: 'Essência do Trovão' }, description_translations: { en: 'A crackling essence from the Thunder God. Used in the Raid Forge to craft powerful armor.' } },
      // Boss chests
      { id: 'infernal_boss_chest', name: 'Infernal Boss Chest', description: 'A chest earned from defeating the Infernal Titan. Contains essences and rare raid set pieces.', type: 'material', vendor_price: 0, untradable: 1, name_translations: { en: 'Infernal Boss Chest', de: 'Infernaler Bosskiste', es: 'Cofre del Jefe Infernal', fr: 'Coffre du Boss Infernal', ru: 'Ящик Адского Босса', zh: '炼狱首领宝箱', tr: 'İnfernal Boss Sandığı', pt: 'Baú do Chefe Infernal' }, description_translations: { en: 'A chest earned from defeating the Infernal Titan. Contains essences and rare raid set pieces.' } },
      { id: 'frost_boss_chest', name: 'Frost Boss Chest', description: 'A chest earned from defeating the Frost Wyrm. Contains essences and rare raid set pieces.', type: 'material', vendor_price: 0, untradable: 1, name_translations: { en: 'Frost Boss Chest', de: 'Frostbosskiste', es: 'Cofre del Jefe de Hielo', fr: 'Coffre du Boss de Givre', ru: 'Ящик Ледяного Босса', zh: '寒霜首领宝箱', tr: 'Buz Boss Sandığı', pt: 'Baú do Chefe de Gelo' }, description_translations: { en: 'A chest earned from defeating the Frost Wyrm. Contains essences and rare raid set pieces.' } },
      { id: 'shadow_boss_chest', name: 'Shadow Boss Chest', description: 'A chest earned from defeating the Shadow Colossus. Contains essences and rare raid set pieces.', type: 'material', vendor_price: 0, untradable: 1, name_translations: { en: 'Shadow Boss Chest', de: 'Schattenbosskiste', es: 'Cofre del Jefe de Sombra', fr: 'Coffre du Boss des Ombres', ru: 'Ящик Теневого Босса', zh: '暗影首领宝箱', tr: 'Gölge Boss Sandığı', pt: 'Baú do Chefe das Sombras' }, description_translations: { en: 'A chest earned from defeating the Shadow Colossus. Contains essences and rare raid set pieces.' } },
      { id: 'thunder_boss_chest', name: 'Thunder Boss Chest', description: 'A chest earned from defeating the Thunder God. Contains essences and rare raid set pieces.', type: 'material', vendor_price: 0, untradable: 1, name_translations: { en: 'Thunder Boss Chest', de: 'Donnerbosskiste', es: 'Cofre del Jefe del Trueno', fr: 'Coffre du Boss du Tonnerre', ru: 'Ящик Громового Босса', zh: '雷霆首领宝箱', tr: 'Gök Gürültüsü Boss Sandığı', pt: 'Baú do Chefe do Trovão' }, description_translations: { en: 'A chest earned from defeating the Thunder God. Contains essences and rare raid set pieces.' } },
      // Forge core & enhancement stone
      { id: 'forge_core', name: 'Forge Core', description: 'An extremely rare crystal that powers the Raid Forge. Occasionally found in boss chests.', type: 'material', vendor_price: 0, untradable: 1, name_translations: { en: 'Forge Core', de: 'Schmiedekern', es: 'Núcleo de Forja', fr: 'Noyau de Forge', ru: 'Кузнечное Ядро', zh: '锻造核心', tr: 'Dövme Çekirdeği', pt: 'Núcleo de Forja' }, description_translations: { en: 'An extremely rare crystal that powers the Raid Forge. Occasionally found in boss chests.' } },
      { id: 'raidbreaker_enhancement_stone', name: 'Raidbreaker Enhancement Stone', description: 'A special stone used to enhance Raidbreaker equipment beyond normal limits.', type: 'material', vendor_price: 0, untradable: 1, name_translations: { en: 'Raidbreaker Enhancement Stone', de: 'Raidbrecherverbesserungsstein', es: 'Piedra de Mejora Romperedadas', fr: 'Pierre Amélioration Brise-Raid', ru: 'Камень Улучшения Разрушителя', zh: '突袭破碎强化石', tr: 'Raid Kırıcı Güçlendirme Taşı', pt: 'Pedra de Melhoria Quebradora de Raid' }, description_translations: { en: 'A special stone used to enhance Raidbreaker equipment beyond normal limits.' } },
      // Raid armor - Infernal Titan (helmets)
      { id: 'raid_plate_helm', name: 'Raid Plate Helm', description: 'Heavy plate helmet forged with Infernal Titan essence. Grants exceptional defence and strength.', type: 'equipment', equip_slot: 'helmet', stats: { attackBonus: 28, defenceBonus: 105, strengthBonus: 22, hitpointsBonus: 115 }, level_required: 85, vendor_price: 40000, untradable: 0, armor_type: 'plate', name_translations: { en: 'Raid Plate Helm', de: 'Raid-Plattenpanzerhelm', es: 'Yelmo de Placas de Raid', fr: 'Heaume de Plaques de Raid', ru: 'Рейдовый Пластинчатый Шлем', zh: '突袭板甲头盔', tr: 'Raid Plaka Kask', pt: 'Elmo de Placas de Raid' }, description_translations: { en: 'Heavy plate helmet forged with Infernal Titan essence. Grants exceptional defence and strength.' } },
      { id: 'raid_leather_hood', name: 'Raid Leather Hood', description: 'Supple leather hood infused with Infernal energy. Enhances accuracy and attack.', type: 'equipment', equip_slot: 'helmet', stats: { attackBonus: 35, defenceBonus: 78, accuracyBonus: 88, hitpointsBonus: 42 }, level_required: 85, vendor_price: 35000, untradable: 0, armor_type: 'leather', name_translations: { en: 'Raid Leather Hood', de: 'Raid-Lederkapuze', es: 'Capucha de Cuero de Raid', fr: 'Capuche en Cuir de Raid', ru: 'Рейдовый Кожаный Капюшон', zh: '突袭皮革兜帽', tr: 'Raid Deri Kapüşon', pt: 'Capuz de Couro de Raid' }, description_translations: { en: 'Supple leather hood infused with Infernal energy. Enhances accuracy and attack.' } },
      { id: 'raid_cloth_hat', name: 'Raid Cloth Hat', description: 'Arcane cloth hat woven from Infernal threads. Provides great magical protection and vitality.', type: 'equipment', equip_slot: 'helmet', stats: { defenceBonus: 62, hitpointsBonus: 172 }, level_required: 85, vendor_price: 30000, untradable: 0, armor_type: 'cloth', name_translations: { en: 'Raid Cloth Hat', de: 'Raid-Stoffhut', es: 'Sombrero de Tela de Raid', fr: 'Chapeau de Tissu de Raid', ru: 'Рейдовая Тканевая Шляпа', zh: '突袭布甲帽子', tr: 'Raid Kumaş Şapka', pt: 'Chapéu de Tecido de Raid' }, description_translations: { en: 'Arcane cloth hat woven from Infernal threads. Provides great magical protection and vitality.' } },
      // Raid armor - Frost Wyrm (bodies)
      { id: 'raid_plate_body', name: 'Raid Plate Body', description: 'Massive plate chestpiece reinforced with Frost Wyrm scales. Provides immense protection.', type: 'equipment', equip_slot: 'body', stats: { defenceBonus: 160, strengthBonus: 30, hitpointsBonus: 190 }, level_required: 85, vendor_price: 50000, untradable: 0, armor_type: 'plate', name_translations: { en: 'Raid Plate Body', de: 'Raid-Plattenrüstung', es: 'Peto de Placas de Raid', fr: 'Cuirasse de Plaques de Raid', ru: 'Рейдовый Пластинчатый Нагрудник', zh: '突袭板甲胸甲', tr: 'Raid Plaka Zırh', pt: 'Peitoral de Placas de Raid' }, description_translations: { en: 'Massive plate chestpiece reinforced with Frost Wyrm scales. Provides immense protection.' } },
      { id: 'raid_leather_vest', name: 'Raid Leather Vest', description: 'Agile leather vest treated with Frost Wyrm oil. Boosts attack power and accuracy.', type: 'equipment', equip_slot: 'body', stats: { attackBonus: 52, defenceBonus: 120, accuracyBonus: 108 }, level_required: 85, vendor_price: 45000, untradable: 0, armor_type: 'leather', name_translations: { en: 'Raid Leather Vest', de: 'Raid-Lederweste', es: 'Chaleco de Cuero de Raid', fr: 'Veste en Cuir de Raid', ru: 'Рейдовый Кожаный Жилет', zh: '突袭皮革背心', tr: 'Raid Deri Yelek', pt: 'Colete de Couro de Raid' }, description_translations: { en: 'Agile leather vest treated with Frost Wyrm oil. Boosts attack power and accuracy.' } },
      { id: 'raid_cloth_robe', name: 'Raid Cloth Robe', description: 'Flowing robe woven from Frost Wyrm silk. Exceptional vitality for mages.', type: 'equipment', equip_slot: 'body', stats: { defenceBonus: 98, hitpointsBonus: 278 }, level_required: 85, vendor_price: 40000, untradable: 0, armor_type: 'cloth', name_translations: { en: 'Raid Cloth Robe', de: 'Raid-Stoffrobe', es: 'Túnica de Tela de Raid', fr: 'Robe en Tissu de Raid', ru: 'Рейдовое Тканевое Одеяние', zh: '突袭布甲长袍', tr: 'Raid Kumaş Cüppe', pt: 'Manto de Tecido de Raid' }, description_translations: { en: 'Flowing robe woven from Frost Wyrm silk. Exceptional vitality for mages.' } },
      // Raid armor - Shadow Colossus (legs)
      { id: 'raid_plate_legs', name: 'Raid Plate Legs', description: 'Sturdy plate greaves tempered with Shadow Colossus essence. Excellent protection.', type: 'equipment', equip_slot: 'legs', stats: { defenceBonus: 128, strengthBonus: 24, hitpointsBonus: 148 }, level_required: 85, vendor_price: 42000, untradable: 0, armor_type: 'plate', name_translations: { en: 'Raid Plate Legs', de: 'Raid-Plattenbeinschutz', es: 'Grebas de Placas de Raid', fr: 'Jambières de Plaques de Raid', ru: 'Рейдовые Пластинчатые Поножи', zh: '突袭板甲护腿', tr: 'Raid Plaka Bacaklık', pt: 'Grevas de Placas de Raid' }, description_translations: { en: 'Sturdy plate greaves tempered with Shadow Colossus essence. Excellent protection.' } },
      { id: 'raid_leather_pants', name: 'Raid Leather Pants', description: 'Swift leather pants imbued with Shadow essence. Boosts agility and accuracy.', type: 'equipment', equip_slot: 'legs', stats: { attackBonus: 40, defenceBonus: 92, accuracyBonus: 95 }, level_required: 85, vendor_price: 38000, untradable: 0, armor_type: 'leather', name_translations: { en: 'Raid Leather Pants', de: 'Raid-Lederhose', es: 'Pantalones de Cuero de Raid', fr: 'Pantalon en Cuir de Raid', ru: 'Рейдовые Кожаные Штаны', zh: '突袭皮革裤子', tr: 'Raid Deri Pantolon', pt: 'Calças de Couro de Raid' }, description_translations: { en: 'Swift leather pants imbued with Shadow essence. Boosts agility and accuracy.' } },
      { id: 'raid_cloth_skirt', name: 'Raid Cloth Skirt', description: 'Mystic cloth skirt woven with Shadow threads. High vitality for cloth wearers.', type: 'equipment', equip_slot: 'legs', stats: { defenceBonus: 78, hitpointsBonus: 210 }, level_required: 85, vendor_price: 34000, untradable: 0, armor_type: 'cloth', name_translations: { en: 'Raid Cloth Skirt', de: 'Raid-Stoffrock', es: 'Falda de Tela de Raid', fr: 'Robe en Tissu de Raid', ru: 'Рейдовая Тканевая Юбка', zh: '突袭布甲裙子', tr: 'Raid Kumaş Etek', pt: 'Saia de Tecido de Raid' }, description_translations: { en: 'Mystic cloth skirt woven with Shadow threads. High vitality for cloth wearers.' } },
      // Raid armor - Thunder God (boots)
      { id: 'raid_plate_boots', name: 'Raid Plate Boots', description: 'Heavy plate boots charged with Thunder God energy. Strong and grounding.', type: 'equipment', equip_slot: 'boots', stats: { defenceBonus: 70, strengthBonus: 16, hitpointsBonus: 105 }, level_required: 85, vendor_price: 32000, untradable: 0, armor_type: 'plate', name_translations: { en: 'Raid Plate Boots', de: 'Raid-Plattenstiefeln', es: 'Botas de Placas de Raid', fr: 'Bottes de Plaques de Raid', ru: 'Рейдовые Пластинчатые Сапоги', zh: '突袭板甲靴子', tr: 'Raid Plaka Çizme', pt: 'Botas de Placas de Raid' }, description_translations: { en: 'Heavy plate boots charged with Thunder God energy. Strong and grounding.' } },
      { id: 'raid_leather_boots', name: 'Raid Leather Boots', description: 'Nimble leather boots crackling with Thunder essence. Exceptional accuracy bonus.', type: 'equipment', equip_slot: 'boots', stats: { defenceBonus: 58, accuracyBonus: 72 }, level_required: 85, vendor_price: 28000, untradable: 0, armor_type: 'leather', name_translations: { en: 'Raid Leather Boots', de: 'Raid-Lederstiefel', es: 'Botas de Cuero de Raid', fr: 'Bottes en Cuir de Raid', ru: 'Рейдовые Кожаные Сапоги', zh: '突袭皮革靴子', tr: 'Raid Deri Bot', pt: 'Botas de Couro de Raid' }, description_translations: { en: 'Nimble leather boots crackling with Thunder essence. Exceptional accuracy bonus.' } },
      { id: 'raid_cloth_sandals', name: 'Raid Cloth Sandals', description: 'Enchanted sandals woven with Thunder God silk. Adds surprising vitality.', type: 'equipment', equip_slot: 'boots', stats: { defenceBonus: 46, hitpointsBonus: 128 }, level_required: 85, vendor_price: 24000, untradable: 0, armor_type: 'cloth', name_translations: { en: 'Raid Cloth Sandals', de: 'Raid-Stoffsandalen', es: 'Sandalias de Tela de Raid', fr: 'Sandales en Tissu de Raid', ru: 'Рейдовые Тканевые Сандалии', zh: '突袭布甲凉鞋', tr: 'Raid Kumaş Sandalet', pt: 'Sandálias de Tecido de Raid' }, description_translations: { en: 'Enchanted sandals woven with Thunder God silk. Adds surprising vitality.' } },
    ];

    let upserted = 0;
    for (const item of items) {
      await db.execute(sql`
        INSERT INTO game_items (id, name, description, type, equip_slot, stats, level_required, vendor_price, untradable, armor_type, name_translations, description_translations, created_at, updated_at)
        VALUES (
          ${item.id}, ${item.name}, ${item.description}, ${item.type},
          ${(item as any).equip_slot || null},
          ${(item as any).stats ? JSON.stringify((item as any).stats) : null}::jsonb,
          ${(item as any).level_required || null},
          ${item.vendor_price}, ${item.untradable},
          ${(item as any).armor_type || null},
          ${JSON.stringify(item.name_translations)}::jsonb,
          ${JSON.stringify(item.description_translations)}::jsonb,
          NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          type = EXCLUDED.type,
          equip_slot = EXCLUDED.equip_slot,
          stats = EXCLUDED.stats,
          level_required = EXCLUDED.level_required,
          vendor_price = EXCLUDED.vendor_price,
          untradable = EXCLUDED.untradable,
          armor_type = EXCLUDED.armor_type,
          name_translations = EXCLUDED.name_translations,
          description_translations = EXCLUDED.description_translations,
          updated_at = NOW()
      `);
      upserted++;
    }

    console.log(`[Seed] Raid V2 items: ${upserted} items upserted`);
  } catch (error) {
    console.error('[Seed] Error seeding Raid V2 items:', error);
  }
}
