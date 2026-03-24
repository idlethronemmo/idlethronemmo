import type { InsertAchievement, AchievementTier } from "@shared/schema";

function tiers(thresholds: number[], opts?: { gold?: number[]; badgeTier?: number; badgeId?: string; xpSkill?: string; xpAmounts?: number[] }): AchievementTier[] {
  return thresholds.map((threshold, i) => {
    const tier: AchievementTier = { tier: i + 1, threshold };
    const goldBase = opts?.gold?.[i] ?? Math.round(threshold * 0.5);
    if (goldBase > 0) tier.rewardGold = goldBase;
    if (opts?.xpSkill && opts?.xpAmounts?.[i]) tier.rewardXp = { [opts.xpSkill]: opts.xpAmounts[i] };
    if (opts?.badgeId && opts?.badgeTier && i + 1 >= opts.badgeTier) {
      tier.badgeId = `${opts.badgeId}_t${i + 1}`;
    }
    return tier;
  });
}

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

const MONSTER_NAMES: Record<string, string> = {
  rabbit: "Rabbit", chicken: "Chicken", deer: "Deer", wild_boar: "Wild Boar",
  young_treant: "Young Treant", goblin: "Goblin", forest_spider: "Forest Spider",
  mountain_goat: "Mountain Goat", wolf: "Wolf", bandit: "Bandit", cave_bat: "Cave Bat",
  goblin_king: "Goblin King", rock_beetle: "Rock Beetle", skeleton: "Skeleton",
  cave_serpent: "Cave Serpent", rock_golem: "Rock Golem", zombie: "Zombie",
  cave_troll: "Cave Troll", mine_foreman: "Mine Foreman", desert_scorpion: "Desert Scorpion",
  desert_fox: "Desert Fox", cactus_beast: "Cactus Beast", sand_elemental: "Sand Elemental",
  sand_worm: "Sand Worm", lich_lord: "Lich Lord", giant_spider: "Giant Spider",
  mummy: "Mummy", orc_grunt: "Orc Grunt", frost_giant: "Frost Giant",
  dark_panther: "Dark Panther", ice_wolf: "Ice Wolf", djinn: "Djinn",
  ice_elemental: "Ice Elemental", orc_warrior: "Orc Warrior", shadow_wolf: "Shadow Wolf",
  frost_tiger: "Frost Tiger", frost_witch: "Frost Witch", hill_giant: "Hill Giant",
  shadow_stalker: "Shadow Stalker", void_wraith: "Void Wraith",
  ancient_ice_golem: "Ancient Ice Golem", ancient_dragon: "Ancient Dragon",
  dark_knight: "Dark Knight", shadow_demon: "Shadow Demon", frost_dragon: "Frost Dragon",
  void_beast: "Void Beast", young_wyvern: "Young Wyvern", void_elemental: "Void Elemental",
  wyvern: "Wyvern", void_knight: "Void Knight", dark_lord: "Dark Lord",
  fire_drake: "Fire Drake", void_lord: "Void Lord", void_king: "The Void King",
  elder_dragon: "Elder Dragon", dragon_king: "Dragon King"
};

export function generateAchievements(): InsertAchievement[] {
  const all: InsertAchievement[] = [];
  let order = 0;

  // ============================================================
  // COMBAT - Monster Kill Achievements (per monster = ~56 * 5 tiers = 280)
  // ============================================================
  for (const m of MONSTERS) {
    const name = MONSTER_NAMES[m] || m;
    const isEndgame = ["void_king", "dragon_king", "elder_dragon", "void_lord", "dark_lord"].includes(m);
    const isBoss = ["goblin_king", "mine_foreman", "lich_lord", "frost_witch", "void_king", "dragon_king", "elder_dragon"].includes(m);
    const isSpecial = ["djinn", "ancient_dragon", "frost_dragon", "wyvern", "fire_drake"].includes(m);

    const killTiers = isEndgame
      ? [100, 500, 2500, 10000, 50000]
      : isBoss
      ? [50, 250, 1000, 5000, 25000]
      : isSpecial
      ? [100, 1000, 5000, 25000, 100000]
      : [100, 500, 2500, 10000, 50000];

    const badgeId = (isBoss || isSpecial || isEndgame) ? `badge_${m}_slayer` : undefined;
    const badgeTier = badgeId ? (isEndgame ? 3 : 4) : undefined;

    all.push({
      id: `kill_${m}`,
      category: "combat",
      trackingKey: `kill_${m}`,
      name: `${name} Slayer`,
      description: `Kill ${name}s`,
      icon: "sword",
      tiers: tiers(killTiers, { badgeId, badgeTier }) as any,
      sortOrder: order++,
    });
  }

  // Total kills achievement
  all.push({
    id: "total_kills",
    category: "combat",
    trackingKey: "total_kills",
    name: "Battle Hardened",
    description: "Kill monsters in total",
    icon: "skull",
    tiers: tiers([100, 500, 2500, 10000, 50000, 200000, 500000, 1000000], {
      badgeId: "badge_battle_hardened", badgeTier: 4,
      gold: [500, 2000, 10000, 50000, 200000, 500000, 1000000, 2000000]
    }) as any,
    sortOrder: order++,
  });

  // Total damage dealt
  all.push({
    id: "total_damage",
    category: "combat",
    trackingKey: "total_damage",
    name: "Damage Dealer",
    description: "Deal damage to monsters in total",
    icon: "lightning",
    tiers: tiers([10000, 100000, 1000000, 10000000, 100000000], {
      badgeId: "badge_damage_dealer", badgeTier: 3,
      gold: [1000, 5000, 25000, 100000, 500000]
    }) as any,
    sortOrder: order++,
  });

  // Deaths
  all.push({
    id: "total_deaths",
    category: "combat",
    trackingKey: "total_deaths",
    name: "Never Give Up",
    description: "Die in combat",
    icon: "heart_broken",
    tiers: tiers([10, 50, 200, 1000, 5000], {
      badgeId: "badge_never_give_up", badgeTier: 4
    }) as any,
    sortOrder: order++,
  });

  // Combat region kills
  const REGIONS = [
    { id: "verdant", name: "Verdant Valley" },
    { id: "quarry", name: "Ashen Quarry" },
    { id: "dunes", name: "Star Desert" },
    { id: "obsidian", name: "Obsidian Fortress" },
    { id: "dragonspire", name: "Dragonspire" },
    { id: "frozen_wastes", name: "Frozen Wastes" },
    { id: "void_realm", name: "Void Realm" },
  ];

  for (const r of REGIONS) {
    all.push({
      id: `region_kills_${r.id}`,
      category: "combat",
      trackingKey: `region_kills_${r.id}`,
      name: `${r.name} Conqueror`,
      description: `Kill monsters in ${r.name}`,
      icon: "map",
      tiers: tiers([100, 500, 2500, 10000, 50000], {
        badgeId: `badge_${r.id}_conqueror`, badgeTier: 4
      }) as any,
      sortOrder: order++,
    });
  }

  // Kill streak (no death run)
  all.push({
    id: "kill_streak",
    category: "combat",
    trackingKey: "kill_streak",
    name: "Unstoppable",
    description: "Kill monsters in a row without dying",
    icon: "fire",
    tiers: tiers([25, 100, 500, 2500, 10000], {
      badgeId: "badge_unstoppable", badgeTier: 3,
      gold: [500, 2500, 10000, 50000, 200000]
    }) as any,
    sortOrder: order++,
  });

  // ============================================================
  // SKILLS - Level Achievements
  // ============================================================
  const SKILLS = [
    { id: "attack", name: "Attack" }, { id: "defence", name: "Defence" },
    { id: "hitpoints", name: "Hitpoints" },
    { id: "woodcutting", name: "Woodcutting" }, { id: "mining", name: "Mining" },
    { id: "fishing", name: "Fishing" }, { id: "hunting", name: "Hunting" },
    { id: "crafting", name: "Crafting" }, { id: "cooking", name: "Cooking" },
    { id: "alchemy", name: "Alchemy" }, { id: "firemaking", name: "Firemaking" },
  ];

  for (const s of SKILLS) {
    all.push({
      id: `level_${s.id}`,
      category: "skills",
      trackingKey: `level_${s.id}`,
      name: `${s.name} Master`,
      description: `Reach ${s.name} milestones`,
      icon: "star",
      tiers: tiers([10, 25, 50, 75, 99], {
        badgeId: `badge_${s.id}_master`, badgeTier: 4,
        gold: [500, 2500, 10000, 50000, 250000]
      }) as any,
      sortOrder: order++,
    });
  }

  // Total level
  all.push({
    id: "total_level",
    category: "skills",
    trackingKey: "total_level",
    name: "Well Rounded",
    description: "Reach total level milestones",
    icon: "trophy",
    tiers: tiers([100, 250, 500, 750, 999, 1089], {
      badgeId: "badge_well_rounded", badgeTier: 3,
      gold: [5000, 25000, 100000, 500000, 1000000, 5000000]
    }) as any,
    sortOrder: order++,
  });

  // ============================================================
  // GATHERING - Action Counts
  // ============================================================
  const GATHERING_SKILLS = [
    { id: "woodcutting", name: "Woodcutting", action: "chop" },
    { id: "mining", name: "Mining", action: "mine" },
    { id: "fishing", name: "Fishing", action: "catch" },
    { id: "hunting", name: "Hunting", action: "hunt" },
  ];

  for (const s of GATHERING_SKILLS) {
    all.push({
      id: `${s.id}_actions`,
      category: "gathering",
      trackingKey: `${s.id}_actions`,
      name: `${s.name} Expert`,
      description: `Perform ${s.name} actions`,
      icon: s.id === "woodcutting" ? "axe" : s.id === "mining" ? "pickaxe" : s.id === "fishing" ? "fish" : "target",
      tiers: tiers([100, 500, 2500, 10000, 50000, 200000, 500000], {
        badgeId: `badge_${s.id}_expert`, badgeTier: 5,
        xpSkill: s.id, xpAmounts: [100, 500, 2500, 10000, 50000, 200000, 500000]
      }) as any,
      sortOrder: order++,
    });
  }

  // XP earned per gathering skill
  for (const s of GATHERING_SKILLS) {
    all.push({
      id: `${s.id}_xp`,
      category: "gathering",
      trackingKey: `${s.id}_xp`,
      name: `${s.name} Dedication`,
      description: `Earn ${s.name} XP`,
      icon: "star",
      tiers: tiers([1000, 10000, 100000, 1000000, 10000000], {
        gold: [200, 1000, 5000, 25000, 100000]
      }) as any,
      sortOrder: order++,
    });
  }

  // ============================================================
  // CRAFTING
  // ============================================================
  all.push({
    id: "crafting_actions",
    category: "crafting",
    trackingKey: "crafting_actions",
    name: "Artisan",
    description: "Craft items",
    icon: "hammer",
    tiers: tiers([50, 250, 1000, 5000, 25000, 100000], {
      badgeId: "badge_artisan", badgeTier: 4,
      xpSkill: "crafting", xpAmounts: [100, 500, 2500, 10000, 50000, 200000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "craft_common",
    category: "crafting",
    trackingKey: "craft_common",
    name: "Common Crafter",
    description: "Craft common items",
    icon: "hammer",
    tiers: tiers([25, 100, 500, 2500, 10000]) as any,
    sortOrder: order++,
  });

  all.push({
    id: "craft_uncommon",
    category: "crafting",
    trackingKey: "craft_uncommon",
    name: "Uncommon Crafter",
    description: "Craft uncommon items",
    icon: "hammer",
    tiers: tiers([10, 50, 250, 1000, 5000]) as any,
    sortOrder: order++,
  });

  all.push({
    id: "craft_rare",
    category: "crafting",
    trackingKey: "craft_rare",
    name: "Rare Crafter",
    description: "Craft rare items",
    icon: "hammer",
    tiers: tiers([10, 50, 250, 1000, 5000], {
      badgeId: "badge_rare_crafter", badgeTier: 4
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "craft_epic",
    category: "crafting",
    trackingKey: "craft_epic",
    name: "Epic Crafter",
    description: "Craft epic items",
    icon: "hammer",
    tiers: tiers([5, 25, 100, 500, 2000], {
      badgeId: "badge_epic_crafter", badgeTier: 3,
      gold: [1000, 5000, 25000, 100000, 500000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "craft_legendary",
    category: "crafting",
    trackingKey: "craft_legendary",
    name: "Legendary Crafter",
    description: "Craft legendary items",
    icon: "sparkle",
    tiers: tiers([1, 5, 25, 100, 500], {
      badgeId: "badge_legendary_crafter", badgeTier: 2,
      gold: [5000, 25000, 100000, 500000, 2000000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "craft_mythic",
    category: "crafting",
    trackingKey: "craft_mythic",
    name: "Mythic Forger",
    description: "Craft mythic items",
    icon: "sparkle",
    tiers: tiers([1, 5, 20, 100, 500], {
      badgeId: "badge_mythic_forger", badgeTier: 1,
      gold: [10000, 50000, 250000, 1000000, 5000000]
    }) as any,
    sortOrder: order++,
  });

  // Crafting XP
  all.push({
    id: "crafting_xp",
    category: "crafting",
    trackingKey: "crafting_xp",
    name: "Master Craftsman",
    description: "Earn Crafting XP",
    icon: "star",
    tiers: tiers([1000, 10000, 100000, 1000000, 10000000], {
      gold: [200, 1000, 5000, 25000, 100000]
    }) as any,
    sortOrder: order++,
  });

  // ============================================================
  // COOKING
  // ============================================================
  all.push({
    id: "cooking_actions",
    category: "cooking",
    trackingKey: "cooking_actions",
    name: "Chef",
    description: "Cook food items",
    icon: "cooking",
    tiers: tiers([50, 250, 1000, 5000, 25000, 100000], {
      badgeId: "badge_chef", badgeTier: 4,
      xpSkill: "cooking", xpAmounts: [100, 500, 2500, 10000, 50000, 200000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "cooking_xp",
    category: "cooking",
    trackingKey: "cooking_xp",
    name: "Culinary Master",
    description: "Earn Cooking XP",
    icon: "star",
    tiers: tiers([1000, 10000, 100000, 1000000, 10000000], {
      gold: [200, 1000, 5000, 25000, 100000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "food_eaten",
    category: "cooking",
    trackingKey: "food_eaten",
    name: "Gourmand",
    description: "Eat food items",
    icon: "apple",
    tiers: tiers([50, 250, 1000, 5000, 25000, 100000], {
      badgeId: "badge_gourmand", badgeTier: 5
    }) as any,
    sortOrder: order++,
  });

  // ============================================================
  // ALCHEMY
  // ============================================================
  all.push({
    id: "alchemy_actions",
    category: "alchemy",
    trackingKey: "alchemy_actions",
    name: "Alchemist",
    description: "Brew potions",
    icon: "flask",
    tiers: tiers([50, 250, 1000, 5000, 25000, 100000], {
      badgeId: "badge_alchemist", badgeTier: 4,
      xpSkill: "alchemy", xpAmounts: [100, 500, 2500, 10000, 50000, 200000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "alchemy_xp",
    category: "alchemy",
    trackingKey: "alchemy_xp",
    name: "Potion Master",
    description: "Earn Alchemy XP",
    icon: "star",
    tiers: tiers([1000, 10000, 100000, 1000000, 10000000], {
      gold: [200, 1000, 5000, 25000, 100000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "potions_used",
    category: "alchemy",
    trackingKey: "potions_used",
    name: "Potion Addict",
    description: "Use potions in combat",
    icon: "flask",
    tiers: tiers([25, 100, 500, 2500, 10000, 50000], {
      badgeId: "badge_potion_addict", badgeTier: 5
    }) as any,
    sortOrder: order++,
  });

  // ============================================================
  // FIREMAKING
  // ============================================================
  all.push({
    id: "firemaking_actions",
    category: "firemaking",
    trackingKey: "firemaking_actions",
    name: "Pyromaniac",
    description: "Burn logs",
    icon: "fire",
    tiers: tiers([50, 250, 1000, 5000, 25000, 100000], {
      badgeId: "badge_pyromaniac", badgeTier: 4,
      xpSkill: "firemaking", xpAmounts: [100, 500, 2500, 10000, 50000, 200000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "firemaking_xp",
    category: "firemaking",
    trackingKey: "firemaking_xp",
    name: "Fire Master",
    description: "Earn Firemaking XP",
    icon: "star",
    tiers: tiers([1000, 10000, 100000, 1000000, 10000000], {
      gold: [200, 1000, 5000, 25000, 100000]
    }) as any,
    sortOrder: order++,
  });

  // ============================================================
  // ECONOMY
  // ============================================================
  all.push({
    id: "gold_earned",
    category: "economy",
    trackingKey: "gold_earned",
    name: "Wealthy",
    description: "Earn gold in total",
    icon: "coin",
    tiers: tiers([1000, 10000, 100000, 1000000, 10000000, 100000000], {
      badgeId: "badge_wealthy", badgeTier: 4
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "gold_spent",
    category: "economy",
    trackingKey: "gold_spent",
    name: "Big Spender",
    description: "Spend gold in total",
    icon: "coin",
    tiers: tiers([1000, 10000, 100000, 1000000, 10000000, 100000000], {
      badgeId: "badge_big_spender", badgeTier: 5
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "market_sales",
    category: "economy",
    trackingKey: "market_sales",
    name: "Merchant",
    description: "Sell items on the market",
    icon: "storefront",
    tiers: tiers([10, 50, 250, 1000, 5000], {
      badgeId: "badge_merchant", badgeTier: 3,
      gold: [500, 2500, 10000, 50000, 200000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "market_purchases",
    category: "economy",
    trackingKey: "market_purchases",
    name: "Shopaholic",
    description: "Buy items from the market",
    icon: "cart",
    tiers: tiers([10, 50, 250, 1000, 5000], {
      gold: [500, 2500, 10000, 50000, 200000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "trades_completed",
    category: "economy",
    trackingKey: "trades_completed",
    name: "Trader",
    description: "Complete player trades",
    icon: "handshake",
    tiers: tiers([5, 25, 100, 500, 2000], {
      badgeId: "badge_trader", badgeTier: 3,
      gold: [500, 2500, 10000, 50000, 200000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "npc_purchases",
    category: "economy",
    trackingKey: "npc_purchases",
    name: "NPC Regular",
    description: "Buy items from NPC shops",
    icon: "storefront",
    tiers: tiers([10, 50, 250, 1000, 5000]) as any,
    sortOrder: order++,
  });

  // ============================================================
  // SOCIAL
  // ============================================================
  all.push({
    id: "guild_contributions",
    category: "social",
    trackingKey: "guild_contributions",
    name: "Guild Supporter",
    description: "Contribute to your guild",
    icon: "users",
    tiers: tiers([10, 50, 200, 1000, 5000], {
      badgeId: "badge_guild_supporter", badgeTier: 3,
      gold: [500, 2500, 10000, 50000, 200000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "guild_xp_contributed",
    category: "social",
    trackingKey: "guild_xp_contributed",
    name: "Guild Pillar",
    description: "Contribute guild XP",
    icon: "users",
    tiers: tiers([1000, 10000, 100000, 500000, 2000000], {
      badgeId: "badge_guild_pillar", badgeTier: 4
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "chat_messages",
    category: "social",
    trackingKey: "chat_messages",
    name: "Social Butterfly",
    description: "Send chat messages",
    icon: "chat",
    tiers: tiers([50, 250, 1000, 5000, 25000], {
      badgeId: "badge_social_butterfly", badgeTier: 4
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "party_kills",
    category: "social",
    trackingKey: "party_kills",
    name: "Team Player",
    description: "Kill monsters while in a party",
    icon: "users",
    tiers: tiers([100, 500, 2500, 10000, 50000], {
      badgeId: "badge_team_player", badgeTier: 4
    }) as any,
    sortOrder: order++,
  });

  // ============================================================
  // EXPLORATION
  // ============================================================
  all.push({
    id: "regions_visited",
    category: "exploration",
    trackingKey: "regions_visited",
    name: "Explorer",
    description: "Visit different regions",
    icon: "compass",
    tiers: tiers([3, 5, 7], {
      badgeId: "badge_explorer", badgeTier: 3,
      gold: [1000, 5000, 25000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "travel_count",
    category: "exploration",
    trackingKey: "travel_count",
    name: "Wanderer",
    description: "Travel between regions",
    icon: "compass",
    tiers: tiers([10, 50, 250, 1000, 5000], {
      badgeId: "badge_wanderer", badgeTier: 4
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "login_days",
    category: "exploration",
    trackingKey: "login_days",
    name: "Dedicated Player",
    description: "Log in on different days",
    icon: "calendar",
    tiers: tiers([7, 30, 90, 180, 365], {
      badgeId: "badge_dedicated", badgeTier: 3,
      gold: [1000, 5000, 25000, 100000, 500000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "playtime_hours",
    category: "exploration",
    trackingKey: "playtime_hours",
    name: "Veteran",
    description: "Accumulate playtime hours",
    icon: "clock",
    tiers: tiers([10, 50, 200, 500, 1000, 5000], {
      badgeId: "badge_veteran", badgeTier: 4,
      gold: [500, 2500, 10000, 50000, 200000, 1000000]
    }) as any,
    sortOrder: order++,
  });

  // ============================================================
  // EQUIPMENT
  // ============================================================
  all.push({
    id: "items_equipped",
    category: "equipment",
    trackingKey: "items_equipped",
    name: "Gear Collector",
    description: "Equip different items",
    icon: "shield",
    tiers: tiers([10, 50, 200, 1000, 5000]) as any,
    sortOrder: order++,
  });

  all.push({
    id: "equipment_repaired",
    category: "equipment",
    trackingKey: "equipment_repaired",
    name: "Handyman",
    description: "Repair equipment",
    icon: "wrench",
    tiers: tiers([10, 50, 250, 1000, 5000], {
      gold: [200, 1000, 5000, 25000, 100000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "items_studied",
    category: "equipment",
    trackingKey: "items_studied",
    name: "Scholar",
    description: "Study equipment for crafting XP",
    icon: "book",
    tiers: tiers([10, 50, 250, 1000, 5000], {
      badgeId: "badge_scholar", badgeTier: 4
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "items_salvaged",
    category: "equipment",
    trackingKey: "items_salvaged",
    name: "Salvager",
    description: "Salvage equipment for materials",
    icon: "recycle",
    tiers: tiers([10, 50, 250, 1000, 5000]) as any,
    sortOrder: order++,
  });

  // Enhancement
  all.push({
    id: "enhancements_attempted",
    category: "equipment",
    trackingKey: "enhancements_attempted",
    name: "Enhancement Addict",
    description: "Attempt equipment enhancements",
    icon: "sparkle",
    tiers: tiers([10, 50, 250, 1000, 5000], {
      badgeId: "badge_enhancer", badgeTier: 4
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "enhancements_succeeded",
    category: "equipment",
    trackingKey: "enhancements_succeeded",
    name: "Lucky Enhancer",
    description: "Succeed at equipment enhancements",
    icon: "sparkle",
    tiers: tiers([5, 25, 100, 500, 2000], {
      badgeId: "badge_lucky_enhancer", badgeTier: 3,
      gold: [1000, 5000, 25000, 100000, 500000]
    }) as any,
    sortOrder: order++,
  });

  // Weapon mastery
  const WEAPON_TYPES = [
    { id: "dagger", name: "Dagger" }, { id: "sword_shield", name: "Sword & Shield" },
    { id: "2h_sword", name: "Two-Handed Sword" }, { id: "2h_axe", name: "Two-Handed Axe" },
    { id: "2h_warhammer", name: "Warhammer" }, { id: "bow", name: "Bow" },
    { id: "staff", name: "Staff" },
  ];

  for (const w of WEAPON_TYPES) {
    all.push({
      id: `mastery_${w.id}`,
      category: "equipment",
      trackingKey: `mastery_${w.id}`,
      name: `${w.name} Mastery`,
      description: `Reach ${w.name} mastery milestones`,
      icon: "sword",
      tiers: tiers([10, 25, 50, 75, 99], {
        badgeId: `badge_mastery_${w.id}`, badgeTier: 4,
        gold: [500, 2500, 10000, 50000, 250000]
      }) as any,
      sortOrder: order++,
    });
  }

  // ============================================================
  // DUNGEONS
  // ============================================================
  all.push({
    id: "dungeons_entered",
    category: "dungeons",
    trackingKey: "dungeons_entered",
    name: "Dungeon Explorer",
    description: "Enter dungeons",
    icon: "door",
    tiers: tiers([5, 25, 100, 500, 2000], {
      badgeId: "badge_dungeon_explorer", badgeTier: 3,
      gold: [1000, 5000, 25000, 100000, 500000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "dungeons_completed",
    category: "dungeons",
    trackingKey: "dungeons_completed",
    name: "Dungeon Master",
    description: "Complete dungeons",
    icon: "door",
    tiers: tiers([3, 15, 50, 200, 1000], {
      badgeId: "badge_dungeon_master", badgeTier: 2,
      gold: [2000, 10000, 50000, 200000, 1000000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "dungeon_floors_cleared",
    category: "dungeons",
    trackingKey: "dungeon_floors_cleared",
    name: "Floor Sweeper",
    description: "Clear dungeon floors",
    icon: "stairs",
    tiers: tiers([25, 100, 500, 2500, 10000], {
      gold: [500, 2500, 10000, 50000, 200000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "dungeon_bosses_killed",
    category: "dungeons",
    trackingKey: "dungeon_bosses_killed",
    name: "Boss Hunter",
    description: "Kill dungeon bosses",
    icon: "skull",
    tiers: tiers([5, 25, 100, 500, 2000], {
      badgeId: "badge_boss_hunter", badgeTier: 3,
      gold: [1000, 5000, 25000, 100000, 500000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "dungeon_keys_used",
    category: "dungeons",
    trackingKey: "dungeon_keys_used",
    name: "Key Collector",
    description: "Use dungeon keys",
    icon: "key",
    tiers: tiers([10, 50, 200, 1000, 5000]) as any,
    sortOrder: order++,
  });

  // ============================================================
  // GENERAL / MISC
  // ============================================================
  all.push({
    id: "items_looted",
    category: "general",
    trackingKey: "items_looted",
    name: "Hoarder",
    description: "Loot items from monsters",
    icon: "chest",
    tiers: tiers([100, 1000, 10000, 100000, 500000], {
      badgeId: "badge_hoarder", badgeTier: 4,
      gold: [500, 2500, 10000, 50000, 200000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "rare_drops",
    category: "general",
    trackingKey: "rare_drops",
    name: "Lucky Looter",
    description: "Get rare drops from monsters",
    icon: "sparkle",
    tiers: tiers([5, 25, 100, 500, 2000], {
      badgeId: "badge_lucky_looter", badgeTier: 3,
      gold: [1000, 5000, 25000, 100000, 500000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "daily_quests_completed",
    category: "general",
    trackingKey: "daily_quests_completed",
    name: "Quest Completionist",
    description: "Complete daily quests",
    icon: "scroll",
    tiers: tiers([10, 50, 200, 1000, 5000], {
      badgeId: "badge_quest_completionist", badgeTier: 4,
      gold: [500, 2500, 10000, 50000, 200000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "daily_login_claimed",
    category: "general",
    trackingKey: "daily_login_claimed",
    name: "Loyal Player",
    description: "Claim daily login rewards",
    icon: "gift",
    tiers: tiers([7, 30, 90, 180, 365], {
      badgeId: "badge_loyal", badgeTier: 4,
      gold: [500, 2500, 10000, 50000, 200000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "combat_xp",
    category: "combat",
    trackingKey: "combat_xp",
    name: "Warrior Spirit",
    description: "Earn combat XP (Attack + Defence + Hitpoints)",
    icon: "sword",
    tiers: tiers([10000, 100000, 1000000, 10000000, 100000000], {
      gold: [1000, 5000, 25000, 100000, 500000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "hp_healed",
    category: "combat",
    trackingKey: "hp_healed",
    name: "Survivor",
    description: "Heal HP in combat",
    icon: "heart",
    tiers: tiers([1000, 10000, 100000, 1000000, 10000000], {
      gold: [200, 1000, 5000, 25000, 100000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "offline_progress_sessions",
    category: "general",
    trackingKey: "offline_progress_sessions",
    name: "AFK Champion",
    description: "Complete offline progress sessions",
    icon: "clock",
    tiers: tiers([10, 50, 200, 1000, 5000], {
      badgeId: "badge_afk_champion", badgeTier: 4,
      gold: [200, 1000, 5000, 25000, 100000]
    }) as any,
    sortOrder: order++,
  });

  // Raid achievements
  all.push({
    id: "raid_damage",
    category: "combat",
    trackingKey: "raid_damage",
    name: "Raid Champion",
    description: "Deal damage in raids",
    icon: "skull",
    tiers: tiers([10000, 100000, 1000000, 10000000, 100000000], {
      badgeId: "badge_raid_champion", badgeTier: 3,
      gold: [1000, 5000, 25000, 100000, 500000]
    }) as any,
    sortOrder: order++,
  });

  all.push({
    id: "raids_participated",
    category: "combat",
    trackingKey: "raids_participated",
    name: "Raid Veteran",
    description: "Participate in guild raids",
    icon: "skull",
    tiers: tiers([5, 25, 100, 500, 2000], {
      badgeId: "badge_raid_veteran", badgeTier: 4
    }) as any,
    sortOrder: order++,
  });

  // ============================================================
  // SPECIFIC MONSTER BADGE ACHIEVEMENTS (hard-to-earn badges)
  // ============================================================

  all.push({
    id: "chicken_maniac",
    category: "combat",
    trackingKey: "kill_chicken",
    name: "Chicken Maniac",
    description: "Are you really killing that many chickens?",
    icon: "skull",
    tiers: [
      { tier: 1, threshold: 10000, rewardGold: 5000 },
      { tier: 2, threshold: 50000, rewardGold: 25000 },
      { tier: 3, threshold: 100000, rewardGold: 100000, badgeId: "badge_chicken_maniac" },
    ] as any,
    sortOrder: order++,
  });

  all.push({
    id: "djinn_destroyer",
    category: "combat",
    trackingKey: "kill_djinn",
    name: "Djinn Destroyer",
    description: "Master of the desert, slayer of Djinns",
    icon: "fire",
    tiers: [
      { tier: 1, threshold: 1000, rewardGold: 5000 },
      { tier: 2, threshold: 5000, rewardGold: 25000 },
      { tier: 3, threshold: 10000, rewardGold: 100000, badgeId: "badge_djinn_destroyer" },
    ] as any,
    sortOrder: order++,
  });

  all.push({
    id: "dragon_slayer_legend",
    category: "combat",
    trackingKey: "kill_dragon_king",
    name: "Dragon Slayer Legend",
    description: "The one true Dragon Slayer",
    icon: "skull",
    tiers: [
      { tier: 1, threshold: 500, rewardGold: 10000 },
      { tier: 2, threshold: 2000, rewardGold: 50000 },
      { tier: 3, threshold: 5000, rewardGold: 250000, badgeId: "badge_dragon_slayer_legend" },
    ] as any,
    sortOrder: order++,
  });

  all.push({
    id: "void_emperor",
    category: "combat",
    trackingKey: "kill_void_king",
    name: "Void Emperor",
    description: "Dethrone The Void King thousands of times",
    icon: "crown",
    tiers: [
      { tier: 1, threshold: 1000, rewardGold: 15000 },
      { tier: 2, threshold: 5000, rewardGold: 75000 },
      { tier: 3, threshold: 10000, rewardGold: 500000, badgeId: "badge_void_emperor" },
    ] as any,
    sortOrder: order++,
  });

  all.push({
    id: "frost_conqueror",
    category: "combat",
    trackingKey: "kill_frost_dragon",
    name: "Frost Conqueror",
    description: "Conquer the frozen dragons",
    icon: "snowflake",
    tiers: [
      { tier: 1, threshold: 1000, rewardGold: 8000 },
      { tier: 2, threshold: 5000, rewardGold: 40000 },
      { tier: 3, threshold: 10000, rewardGold: 200000, badgeId: "badge_frost_conqueror" },
    ] as any,
    sortOrder: order++,
  });

  all.push({
    id: "dark_lords_bane",
    category: "combat",
    trackingKey: "kill_dark_lord",
    name: "Dark Lord's Bane",
    description: "End the Dark Lord's reign again and again",
    icon: "skull",
    tiers: [
      { tier: 1, threshold: 1000, rewardGold: 10000 },
      { tier: 2, threshold: 5000, rewardGold: 50000 },
      { tier: 3, threshold: 10000, rewardGold: 300000, badgeId: "badge_dark_lords_bane" },
    ] as any,
    sortOrder: order++,
  });

  all.push({
    id: "wolf_exterminator",
    category: "combat",
    trackingKey: "kill_wolf",
    name: "Wolf Exterminator",
    description: "Wolves fear your name",
    icon: "paw",
    tiers: [
      { tier: 1, threshold: 5000, rewardGold: 3000 },
      { tier: 2, threshold: 25000, rewardGold: 15000 },
      { tier: 3, threshold: 50000, rewardGold: 75000, badgeId: "badge_wolf_exterminator" },
    ] as any,
    sortOrder: order++,
  });

  all.push({
    id: "spider_phobia",
    category: "combat",
    trackingKey: "kill_giant_spider",
    name: "Arachnophobia Cure",
    description: "Kill Giant Spiders until you're no longer afraid",
    icon: "bug",
    tiers: [
      { tier: 1, threshold: 2500, rewardGold: 5000 },
      { tier: 2, threshold: 10000, rewardGold: 25000 },
      { tier: 3, threshold: 25000, rewardGold: 100000, badgeId: "badge_arachnophobia" },
    ] as any,
    sortOrder: order++,
  });

  // ============================================================
  // ULTRA RARE DROP ACHIEVEMENT
  // ============================================================

  all.push({
    id: "crown_collector",
    category: "equipment",
    trackingKey: "drop_Crown of Flames",
    name: "Crown Collector",
    description: "Collect the legendary Crown of Flames (0.1% drop rate from Dragon King)",
    icon: "crown",
    tiers: [
      { tier: 1, threshold: 1, rewardGold: 50000 },
      { tier: 2, threshold: 5, rewardGold: 150000 },
      { tier: 3, threshold: 15, rewardGold: 500000 },
      { tier: 4, threshold: 50, rewardGold: 2000000, badgeId: "badge_crown_collector" },
    ] as any,
    sortOrder: order++,
  });

  // ============================================================
  // REGION DOMINATION BADGES (very high kill counts)
  // ============================================================

  all.push({
    id: "verdant_veteran",
    category: "exploration",
    trackingKey: "region_kills_verdant",
    name: "Verdant Veteran",
    description: "A true master of Verdant Valley",
    icon: "tree",
    tiers: [
      { tier: 1, threshold: 10000, rewardGold: 5000 },
      { tier: 2, threshold: 25000, rewardGold: 15000 },
      { tier: 3, threshold: 50000, rewardGold: 50000, badgeId: "badge_verdant_veteran" },
    ] as any,
    sortOrder: order++,
  });

  all.push({
    id: "void_walker",
    category: "exploration",
    trackingKey: "region_kills_void_realm",
    name: "Void Walker",
    description: "One with the Void",
    icon: "eye",
    tiers: [
      { tier: 1, threshold: 5000, rewardGold: 15000 },
      { tier: 2, threshold: 15000, rewardGold: 75000 },
      { tier: 3, threshold: 25000, rewardGold: 250000, badgeId: "badge_void_walker" },
    ] as any,
    sortOrder: order++,
  });

  all.push({
    id: "dragonspire_legend",
    category: "exploration",
    trackingKey: "region_kills_dragonspire",
    name: "Dragonspire Legend",
    description: "Legend of the Dragonspire",
    icon: "fire",
    tiers: [
      { tier: 1, threshold: 5000, rewardGold: 12000 },
      { tier: 2, threshold: 15000, rewardGold: 60000 },
      { tier: 3, threshold: 25000, rewardGold: 200000, badgeId: "badge_dragonspire_legend" },
    ] as any,
    sortOrder: order++,
  });

  return all;
}
