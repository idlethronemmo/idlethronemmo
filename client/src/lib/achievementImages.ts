import { MONSTER_IMAGES } from "./monsterImages";

const ASSET_BASE = "https://pub-87034a8f89f94b3d9149a9af7048ee14.r2.dev/";
const img = (f: string) => ASSET_BASE + "generated_images/" + f;

const ACHIEVEMENT_IMAGES: Record<string, string> = {};

const MONSTERS = [
  "rabbit", "chicken", "deer", "wild_boar", "young_treant", "goblin", "forest_spider",
  "mountain_goat", "wolf", "bandit", "cave_bat", "goblin_king", "rock_beetle", "skeleton",
  "cave_serpent", "rock_golem", "zombie", "cave_troll", "mine_foreman", "desert_scorpion",
  "desert_fox", "cactus_beast", "sand_elemental", "sand_worm", "lich_lord", "giant_spider",
  "mummy", "orc_grunt", "frost_giant", "dark_panther", "ice_wolf", "djinn", "ice_elemental",
  "orc_warrior", "shadow_wolf", "frost_tiger", "frost_witch", "hill_giant", "shadow_stalker",
  "void_wraith", "ancient_ice_golem", "ancient_dragon", "dark_knight", "shadow_demon",
  "frost_dragon", "void_beast", "young_wyvern", "void_elemental", "wyvern", "void_knight",
  "dark_lord", "fire_drake", "void_lord", "void_king", "elder_dragon", "dragon_king"
];

for (const m of MONSTERS) {
  if (MONSTER_IMAGES[m]) {
    ACHIEVEMENT_IMAGES[`kill_${m}`] = MONSTER_IMAGES[m];
  }
}

ACHIEVEMENT_IMAGES["chicken_maniac"] = MONSTER_IMAGES["chicken"];
ACHIEVEMENT_IMAGES["djinn_destroyer"] = MONSTER_IMAGES["djinn"];
ACHIEVEMENT_IMAGES["dragon_slayer_legend"] = MONSTER_IMAGES["dragon_king"];
ACHIEVEMENT_IMAGES["void_emperor"] = MONSTER_IMAGES["void_king"];
ACHIEVEMENT_IMAGES["frost_conqueror"] = MONSTER_IMAGES["frost_dragon"];
ACHIEVEMENT_IMAGES["dark_lords_bane"] = MONSTER_IMAGES["dark_lord"];
ACHIEVEMENT_IMAGES["wolf_exterminator"] = MONSTER_IMAGES["wolf"];
ACHIEVEMENT_IMAGES["spider_phobia"] = MONSTER_IMAGES["giant_spider"];

ACHIEVEMENT_IMAGES["total_kills"] = img("achievement_combat_icon.png");
ACHIEVEMENT_IMAGES["total_damage"] = img("achievement_damage_icon.png");
ACHIEVEMENT_IMAGES["total_deaths"] = img("achievement_death_icon.png");
ACHIEVEMENT_IMAGES["kill_streak"] = img("achievement_kill_streak_icon.png");
ACHIEVEMENT_IMAGES["combat_xp"] = img("achievement_combat_icon.png");
ACHIEVEMENT_IMAGES["hp_healed"] = img("achievement_hitpoints_icon.png");
ACHIEVEMENT_IMAGES["raid_damage"] = img("achievement_raid_icon.png");
ACHIEVEMENT_IMAGES["raids_participated"] = img("achievement_raid_icon.png");
ACHIEVEMENT_IMAGES["party_kills"] = img("achievement_party_icon.png");

ACHIEVEMENT_IMAGES["region_kills_verdant"] = MONSTER_IMAGES["young_treant"] || img("normal_tree_icon.webp");
ACHIEVEMENT_IMAGES["region_kills_quarry"] = MONSTER_IMAGES["rock_golem"];
ACHIEVEMENT_IMAGES["region_kills_dunes"] = MONSTER_IMAGES["djinn"];
ACHIEVEMENT_IMAGES["region_kills_obsidian"] = MONSTER_IMAGES["dark_lord"];
ACHIEVEMENT_IMAGES["region_kills_dragonspire"] = MONSTER_IMAGES["dragon_king"];
ACHIEVEMENT_IMAGES["region_kills_frozen_wastes"] = MONSTER_IMAGES["frost_dragon"];
ACHIEVEMENT_IMAGES["region_kills_void_realm"] = MONSTER_IMAGES["void_king"];
ACHIEVEMENT_IMAGES["verdant_veteran"] = MONSTER_IMAGES["goblin_king"] || img("normal_tree_icon.webp");
ACHIEVEMENT_IMAGES["void_walker"] = MONSTER_IMAGES["void_elemental"];
ACHIEVEMENT_IMAGES["dragonspire_legend"] = MONSTER_IMAGES["fire_drake"];

ACHIEVEMENT_IMAGES["level_attack"] = img("achievement_strength_icon.png");
ACHIEVEMENT_IMAGES["level_defence"] = img("achievement_defense_icon.png");
ACHIEVEMENT_IMAGES["level_hitpoints"] = img("achievement_hitpoints_icon.png");
ACHIEVEMENT_IMAGES["level_woodcutting"] = img("void_logs_icon.webp");
ACHIEVEMENT_IMAGES["level_mining"] = img("material_void_crystal.webp");
ACHIEVEMENT_IMAGES["level_fishing"] = img("material_void_fish.webp");
ACHIEVEMENT_IMAGES["level_hunting"] = img("void_beast_icon.webp");
ACHIEVEMENT_IMAGES["level_crafting"] = img("void_soulreaver_icon.png");
ACHIEVEMENT_IMAGES["level_cooking"] = img("void_feast_icon.png");
ACHIEVEMENT_IMAGES["level_alchemy"] = img("jurax_gem_icon.png");
ACHIEVEMENT_IMAGES["level_firemaking"] = img("void_ash_icon.png");
ACHIEVEMENT_IMAGES["total_level"] = img("crown_of_flames_pixel_art.webp");

ACHIEVEMENT_IMAGES["strength_xp"] = img("achievement_strength_icon.png");

ACHIEVEMENT_IMAGES["woodcutting_actions"] = img("oak_logs_icon.png");
ACHIEVEMENT_IMAGES["woodcutting_xp"] = img("magic_logs_icon.webp");
ACHIEVEMENT_IMAGES["mining_actions"] = img("iron_ore_pixel_art_icon.webp");
ACHIEVEMENT_IMAGES["mining_xp"] = img("mithril_ore_chunk_icon.webp");
ACHIEVEMENT_IMAGES["fishing_actions"] = img("trout_fish_pixel_art_icon.webp");
ACHIEVEMENT_IMAGES["fishing_xp"] = img("salmon_fish_pixel_art_icon.webp");
ACHIEVEMENT_IMAGES["hunting_actions"] = img("deer_icon.webp");
ACHIEVEMENT_IMAGES["hunting_xp"] = img("celestial_stag_icon.webp");

ACHIEVEMENT_IMAGES["crafting_actions"] = img("iron_sword_pixel_art.webp");
ACHIEVEMENT_IMAGES["craft_common"] = img("bronze_sword_pixel_art.webp");
ACHIEVEMENT_IMAGES["craft_uncommon"] = img("iron_sword_pixel_art.webp");
ACHIEVEMENT_IMAGES["craft_rare"] = img("mithril_sword_pixel_art.webp");
ACHIEVEMENT_IMAGES["craft_epic"] = img("rune_sword_pixel_art.webp");
ACHIEVEMENT_IMAGES["craft_legendary"] = img("dragon_sword_pixel_art.webp");
ACHIEVEMENT_IMAGES["craft_mythic"] = img("void_soulreaver_icon.png");
ACHIEVEMENT_IMAGES["crafting_xp"] = img("adamant_shield_pixel_art.webp");

ACHIEVEMENT_IMAGES["cooking_actions"] = img("cooked_meat_pixel_art.webp");
ACHIEVEMENT_IMAGES["cooking_xp"] = img("dragon_steak_food_item.webp");
ACHIEVEMENT_IMAGES["food_eaten"] = img("cooked_shrimp_pixel_art.webp");

ACHIEVEMENT_IMAGES["alchemy_actions"] = img("achievement_potion_icon.png");
ACHIEVEMENT_IMAGES["alchemy_xp"] = img("jurax_gem_icon.png");
ACHIEVEMENT_IMAGES["potions_used"] = img("achievement_potion_icon.png");

ACHIEVEMENT_IMAGES["firemaking_actions"] = img("basic_ash_icon.png");
ACHIEVEMENT_IMAGES["firemaking_xp"] = img("magic_ash_icon.png");

ACHIEVEMENT_IMAGES["gold_earned"] = img("gold_coins_icon.png");
ACHIEVEMENT_IMAGES["gold_spent"] = img("gold_coins_icon.png");
ACHIEVEMENT_IMAGES["market_sales"] = img("achievement_market_icon.png");
ACHIEVEMENT_IMAGES["market_purchases"] = img("achievement_market_icon.png");
ACHIEVEMENT_IMAGES["trades_completed"] = img("achievement_market_icon.png");
ACHIEVEMENT_IMAGES["npc_purchases"] = img("achievement_npc_shop_icon.png");

ACHIEVEMENT_IMAGES["guild_contributions"] = img("achievement_guild_icon.png");
ACHIEVEMENT_IMAGES["guild_xp_contributed"] = img("achievement_guild_icon.png");
ACHIEVEMENT_IMAGES["chat_messages"] = img("achievement_chat_icon.png");

ACHIEVEMENT_IMAGES["regions_visited"] = img("achievement_region_icon.png");
ACHIEVEMENT_IMAGES["travel_count"] = img("achievement_travel_icon.png");
ACHIEVEMENT_IMAGES["login_days"] = img("achievement_login_icon.png");
ACHIEVEMENT_IMAGES["playtime_hours"] = img("achievement_playtime_icon.png");

ACHIEVEMENT_IMAGES["items_equipped"] = img("achievement_equipment_icon.png");
ACHIEVEMENT_IMAGES["equipment_repaired"] = img("achievement_repair_icon.png");
ACHIEVEMENT_IMAGES["items_studied"] = img("achievement_study_icon.png");
ACHIEVEMENT_IMAGES["items_salvaged"] = img("achievement_salvage_icon.png");
ACHIEVEMENT_IMAGES["enhancements_attempted"] = img("achievement_enhance_icon.png");
ACHIEVEMENT_IMAGES["enhancements_succeeded"] = img("achievement_enhance_icon.png");
ACHIEVEMENT_IMAGES["mastery_dagger"] = img("achievement_mastery_icon.png");
ACHIEVEMENT_IMAGES["mastery_sword_shield"] = img("achievement_mastery_icon.png");
ACHIEVEMENT_IMAGES["mastery_2h_sword"] = img("achievement_mastery_icon.png");
ACHIEVEMENT_IMAGES["mastery_2h_axe"] = img("achievement_mastery_icon.png");
ACHIEVEMENT_IMAGES["mastery_2h_warhammer"] = img("achievement_mastery_icon.png");
ACHIEVEMENT_IMAGES["mastery_bow"] = img("achievement_mastery_icon.png");
ACHIEVEMENT_IMAGES["mastery_staff"] = img("achievement_mastery_icon.png");

ACHIEVEMENT_IMAGES["dungeons_entered"] = img("achievement_dungeon_icon.png");
ACHIEVEMENT_IMAGES["dungeons_completed"] = img("void_key_icon.png");
ACHIEVEMENT_IMAGES["dungeon_floors_cleared"] = img("gold_key_icon.png");
ACHIEVEMENT_IMAGES["dungeon_bosses_killed"] = MONSTER_IMAGES["lich_lord"];
ACHIEVEMENT_IMAGES["dungeon_keys_used"] = img("bronze_key_icon.png");

ACHIEVEMENT_IMAGES["items_looted"] = img("achievement_loot_icon.png");
ACHIEVEMENT_IMAGES["rare_drops"] = img("crown_of_flames_pixel_art.webp");
ACHIEVEMENT_IMAGES["daily_quests_completed"] = img("achievement_daily_quest_icon.png");
ACHIEVEMENT_IMAGES["daily_login_claimed"] = img("achievement_login_icon.png");
ACHIEVEMENT_IMAGES["offline_progress_sessions"] = img("achievement_offline_icon.png");
ACHIEVEMENT_IMAGES["crown_collector"] = img("crown_of_flames_pixel_art.webp");

export function getAchievementImage(achievementId: string): string | undefined {
  return ACHIEVEMENT_IMAGES[achievementId];
}
