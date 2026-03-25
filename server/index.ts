import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { startScheduler, stopScheduler } from "./scheduler";
import { storage } from "./storage";
import { db } from "../db";
import { sql } from "drizzle-orm";

console.log("ENV CHECK:", process.env.FIREBASE_CLIENT_EMAIL);
// One-time migration: move dungeon keys from players.inventory to player_dungeon_keys table
async function migrateDungeonKeysToTable() {
  try {
    const result = await db.execute(sql`
      SELECT id, inventory FROM players 
      WHERE inventory IS NOT NULL 
        AND (inventory ? 'bronze_key' OR inventory ? 'silver_key' OR inventory ? 'gold_key' OR inventory ? 'void_key')
    `);
    
    if (result.rows.length === 0) return;
    
    console.log(`[Migration] Migrating dungeon keys for ${result.rows.length} players from inventory to player_dungeon_keys...`);
    
    const keyTypes = ['bronze', 'silver', 'gold', 'void'];
    
    for (const row of result.rows) {
      const player = row as any;
      const inventory = player.inventory as Record<string, any>;
      
      for (const keyType of keyTypes) {
        const inventoryKey = `${keyType}_key`;
        const qty = parseInt(inventory[inventoryKey] || '0', 10);
        if (qty <= 0) continue;
        
        const existing = await db.execute(sql`
          SELECT id, quantity FROM player_dungeon_keys 
          WHERE player_id = ${player.id} AND key_type = ${keyType}
        `);
        
        if (existing.rows.length > 0) {
          await db.execute(sql`
            UPDATE player_dungeon_keys 
            SET quantity = quantity + ${qty} 
            WHERE player_id = ${player.id} AND key_type = ${keyType}
          `);
        } else {
          await db.execute(sql`
            INSERT INTO player_dungeon_keys (player_id, key_type, quantity) 
            VALUES (${player.id}, ${keyType}, ${qty})
          `);
        }
      }
      
      await db.execute(sql`
        UPDATE players 
        SET inventory = inventory - 'bronze_key' - 'silver_key' - 'gold_key' - 'void_key'
        WHERE id = ${player.id}
      `);
    }
    
    console.log(`[Migration] Dungeon keys migrated for ${result.rows.length} players`);
  } catch (error) {
    console.error('[Migration] Error migrating dungeon keys:', error);
  }
}

// One-time fix for bot market listing prices
async function fixBotMarketPrices() {
  try {
    // Check if prices need fixing by looking at average multiplier
    const checkResult = await db.execute(sql`
      SELECT AVG(ml.price_per_item::decimal / NULLIF(gi.vendor_price, 0)) as avg_mult
      FROM market_listings ml
      JOIN players p ON ml.seller_id = p.id
      LEFT JOIN game_items gi ON SPLIT_PART(ml.item_id, ' (', 1) = gi.id OR ml.item_id = gi.id
      WHERE p.is_bot = 1 AND gi.vendor_price > 0
      LIMIT 100
    `);
    
    const avgMult = parseFloat((checkResult.rows[0] as any)?.avg_mult || '0');
    
    // If average multiplier is less than 10, prices need fixing
    if (avgMult > 0 && avgMult < 10) {
      console.log(`[Migration] Bot prices too low (avg ${avgMult.toFixed(1)}x), fixing...`);
      
      // Fix material prices (20-50x)
      const matResult = await db.execute(sql`
        UPDATE market_listings ml
        SET price_per_item = FLOOR(gi.vendor_price * GREATEST(20, LEAST(50, 20 + FLOOR(LEAST(3, COALESCE(gi.level_required, 1) / 20.0)) * 10 + (RANDOM() - 0.5) * 10)))
        FROM players p, game_items gi
        WHERE ml.seller_id = p.id 
        AND p.is_bot = 1
        AND gi.type = 'material'
        AND (SPLIT_PART(ml.item_id, ' (', 1) = gi.id OR ml.item_id = gi.id)
      `);
      console.log(`[Migration] Fixed ${matResult.rowCount} material listings`);
      
      // Fix potion prices (100-400x)
      const potResult = await db.execute(sql`
        UPDATE market_listings ml
        SET price_per_item = FLOOR(gi.vendor_price * GREATEST(100, LEAST(400, (100 + FLOOR(LEAST(3, COALESCE(gi.level_required, 1) / 25.0)) * 100) * (0.9 + RANDOM() * 0.2))))
        FROM players p, game_items gi
        WHERE ml.seller_id = p.id 
        AND p.is_bot = 1
        AND gi.type = 'potion'
        AND (SPLIT_PART(ml.item_id, ' (', 1) = gi.id OR ml.item_id = gi.id)
      `);
      console.log(`[Migration] Fixed ${potResult.rowCount} potion listings`);
      
      // Fix equipment prices (100-1000x, Mythic up to 2500x)
      const eqResult = await db.execute(sql`
        UPDATE market_listings ml
        SET price_per_item = FLOOR(
          gi.vendor_price * GREATEST(100, LEAST(
            CASE WHEN ml.item_id LIKE '% (Mythic)' THEN 2500 ELSE 1000 END,
            (100 + FLOOR(LEAST(4, COALESCE(gi.level_required, 1) / 15.0)) * 80) * 
            CASE 
              WHEN ml.item_id LIKE '% (Mythic)' THEN 4.5
              WHEN ml.item_id LIKE '% (Legendary)' THEN 1.8
              ELSE 1
            END *
            (0.9 + RANDOM() * 0.2)
          ))
        )
        FROM players p, game_items gi
        WHERE ml.seller_id = p.id 
        AND p.is_bot = 1
        AND gi.type = 'equipment'
        AND gi.vendor_price IS NOT NULL
        AND gi.vendor_price > 0
        AND SPLIT_PART(ml.item_id, ' (', 1) = gi.id
      `);
      console.log(`[Migration] Fixed ${eqResult.rowCount} equipment listings`);
      
      console.log('[Migration] Bot market prices fixed successfully');
    } else if (avgMult > 0) {
      console.log(`[Migration] Bot prices OK (avg ${avgMult.toFixed(1)}x), skipping fix`);
    }
  } catch (error) {
    console.error('[Migration] Error fixing bot prices:', error);
  }
}

// One-time reprice mythic bot listings to be much more expensive
async function repriceMythicBotListings() {
  try {
    const result = await db.execute(sql`
      UPDATE market_listings ml
      SET price_per_item = FLOOR(
        gi.vendor_price * GREATEST(400, LEAST(2500,
          (100 + FLOOR(LEAST(4, COALESCE(gi.level_required, 1) / 15.0)) * 80) * 4.5 *
          (0.9 + RANDOM() * 0.2)
        ))
      )
      FROM players p, game_items gi
      WHERE ml.seller_id = p.id 
      AND p.is_bot = 1
      AND ml.item_id LIKE '% (Mythic)'
      AND gi.type = 'equipment'
      AND gi.vendor_price IS NOT NULL
      AND gi.vendor_price > 0
      AND SPLIT_PART(ml.item_id, ' (', 1) = gi.id
    `);
    if ((result.rowCount || 0) > 0) {
      console.log(`[Migration] Repriced ${result.rowCount} mythic bot listings to higher prices`);
    }
  } catch (error) {
    console.error('[Migration] Error repricing mythic listings:', error);
  }
}

// Run inventory item migrations on startup
async function runItemMigrations() {
  // Item conversions: old -> new
  const migrations = [
    { old: 'Normal Tree', new: 'normal_logs' },
    { old: 'Raw Rabbit', new: 'rabbit_pelt' },
    { old: 'Oak Tree', new: 'oak_logs' },
    { old: 'Willow Tree', new: 'willow_logs' },
    { old: 'Maple Tree', new: 'maple_logs' },
    { old: 'Yew Tree', new: 'yew_logs' },
    { old: 'Magic Tree', new: 'magic_logs' },
    { old: 'raw_hide', new: 'rabbit_pelt' },
    { old: 'Sheep', new: 'wool' },
    { old: 'Petrified Wood', new: 'petrified_logs' },
    { old: 'Elderwood Log', new: 'elderwood_logs' },
    { old: 'Rabbit', new: 'Raw Rabbit' },
  ];

  // Items to remove (no valid conversion)
  const itemsToRemove = [
    'linen_cloth', 
    'Rune Sword',
    // Old format equipment with rarity suffix
    'Bronze Buckler (Epic)',
    'Bronze Dagger (Common)',
    'Bronze Dagger (Legendary)',
    'Bronze Platebody (Common)',
    'Bronze Platebody (Epic)',
    'Bronze Ring (Common)',
    'Bronze Ring (Legendary)',
    'Bronze Shield (Uncommon)',
    'Bronze Sword (Legendary)',
    'Dark Mithril Boots (Epic)',
    'Goblin Barrier (Common)',
    'Mithril Battleaxe (Epic)',
    'Mithril Battleaxe (Legendary)',
    'Steel Scimitar (Mythic)',
    'leather_vest_t1 (Epic)',
    'linen_skirt_t1 (Epic)',
    'oak_staff (Common)',
    'oak_staff (Rare)',
    'oak_staff (Uncommon)',
  ];

  for (const { old: oldItem, new: newItem } of migrations) {
    try {
      const result = await db.execute(sql`
        UPDATE players 
        SET inventory = (
          inventory 
          - ${oldItem}::text
          || jsonb_build_object(${newItem}::text, COALESCE((inventory->>${newItem}::text)::int, 0) + COALESCE((inventory->>${oldItem}::text)::int, 0))
        )
        WHERE inventory ? ${oldItem}::text
      `);
      if (result.rowCount && result.rowCount > 0) {
        console.log(`[Migration] Converted ${oldItem} -> ${newItem} for ${result.rowCount} players`);
      }
    } catch (error) {
      console.error(`[Migration] Error migrating ${oldItem}:`, error);
    }
  }

  // Remove deprecated items
  for (const itemToRemove of itemsToRemove) {
    try {
      const result = await db.execute(sql`
        UPDATE players 
        SET inventory = inventory - ${itemToRemove}::text
        WHERE inventory ? ${itemToRemove}::text
      `);
      if (result.rowCount && result.rowCount > 0) {
        console.log(`[Migration] Removed deprecated item ${itemToRemove} from ${result.rowCount} players`);
      }
    } catch (error) {
      console.error(`[Migration] Error removing ${itemToRemove}:`, error);
    }
  }
}

// Add shared drops to monsters that should have them
async function addSharedMonsterDrops() {
  try {
    // Define which monster types should get which common drops
    // Only add if they don't already have the drop
    const sharedDrops: Record<string, { itemId: string; chance: number; minQty: number; maxQty: number }[]> = {
      // Beasts that should drop Raw Meat and Bones
      bandit: [
        { itemId: 'Bones', chance: 60, minQty: 1, maxQty: 1 },
      ],
      orc_warrior: [
        { itemId: 'Raw Meat', chance: 50, minQty: 2, maxQty: 3 },
        { itemId: 'Bones', chance: 40, minQty: 1, maxQty: 2 },
      ],
      dark_knight: [
        { itemId: 'Bones', chance: 70, minQty: 1, maxQty: 2 },
      ],
      wyvern: [
        { itemId: 'Bones', chance: 60, minQty: 2, maxQty: 4 },
      ],
      // Giants should drop more Raw Meat and Bones
      frost_giant: [
        { itemId: 'Bones', chance: 80, minQty: 2, maxQty: 4 },
      ],
      // Mummies have Ancient Bandage but should also drop Bones
      mummy: [
        { itemId: 'Bones', chance: 90, minQty: 2, maxQty: 3 },
      ],
      // Trolls have meat already but not bones
      cave_troll: [
        { itemId: 'Bones', chance: 60, minQty: 1, maxQty: 2 },
      ],
    };

    for (const [monsterId, drops] of Object.entries(sharedDrops)) {
      for (const drop of drops) {
        // Check if this monster already has this drop
        const checkResult = await db.execute(sql`
          SELECT loot FROM game_monsters WHERE id = ${monsterId}
        `);
        
        if (checkResult.rows.length === 0) continue;
        
        const currentLoot = (checkResult.rows[0] as any).loot || [];
        const hasItem = currentLoot.some((l: any) => l.itemId === drop.itemId);
        
        if (!hasItem) {
          // Add the new drop
          const newLoot = [...currentLoot, drop];
          await db.execute(sql`
            UPDATE game_monsters 
            SET loot = ${JSON.stringify(newLoot)}::jsonb
            WHERE id = ${monsterId}
          `);
          console.log(`[Migration] Added ${drop.itemId} drop to ${monsterId}`);
        }
      }
    }
  } catch (error) {
    console.error('[Migration] Error adding shared monster drops:', error);
  }
}

// Seed NPC Shops for each region
async function seedNpcShops() {
  try {
    // Check if shops already exist
    const existingShops = await db.execute(sql`SELECT COUNT(*) as count FROM npc_shops`);
    if (parseInt((existingShops.rows[0] as any)?.count || '0') > 0) {
      return;
    }

    console.log('[Seed] Creating NPC shops...');

    // Define shops for each region
    const shops = [
      {
        id: 'shop_verdant',
        regionId: 'verdant',
        name: 'Village Merchant',
        nameTranslations: { en: 'Village Merchant', tr: 'Köy Tüccarı', de: 'Dorfhändler', fr: 'Marchand du Village', es: 'Mercader del Pueblo', pt: 'Comerciante da Vila', ru: 'Деревенский Торговец', zh: '村庄商人' },
        description: 'Basic supplies for adventurers',
        baseStock: [
          { itemId: 'Minor HP Potion', minQty: 5, maxQty: 15, priceMultiplier: 3 },
          { itemId: 'Chicken', minQty: 10, maxQty: 25, priceMultiplier: 2 },
          { itemId: 'Cooked Meat', minQty: 8, maxQty: 20, priceMultiplier: 2 },
        ]
      },
      {
        id: 'shop_quarry',
        regionId: 'quarry',
        name: 'Mining Supplies',
        nameTranslations: { en: 'Mining Supplies', tr: 'Maden Malzemeleri', de: 'Bergbaubedarf', fr: 'Fournitures Minières', es: 'Suministros Mineros', pt: 'Suprimentos de Mineração', ru: 'Горные Припасы', zh: '采矿用品' },
        description: 'Equipment for miners and warriors',
        baseStock: [
          { itemId: 'Small HP Potion', minQty: 8, maxQty: 20, priceMultiplier: 3 },
          { itemId: 'Coal', minQty: 20, maxQty: 50, priceMultiplier: 2 },
          { itemId: 'Iron Bar', minQty: 5, maxQty: 15, priceMultiplier: 3 },
        ]
      },
      {
        id: 'shop_dunes',
        regionId: 'dunes',
        name: 'Desert Oasis Trader',
        nameTranslations: { en: 'Desert Oasis Trader', tr: 'Çöl Vahası Tüccarı', de: 'Wüstenoasenhändler', fr: 'Marchand de l\'Oasis', es: 'Comerciante del Oasis', pt: 'Comerciante do Oásis', ru: 'Торговец Оазиса', zh: '绿洲商人' },
        description: 'Rare goods from the desert',
        baseStock: [
          { itemId: 'Cooked Trout', minQty: 5, maxQty: 12, priceMultiplier: 3 },
          { itemId: 'Sand Essence', minQty: 3, maxQty: 10, priceMultiplier: 4 },
          { itemId: 'Gold Bar', minQty: 2, maxQty: 8, priceMultiplier: 3 },
        ]
      },
      {
        id: 'shop_obsidian',
        regionId: 'obsidian',
        name: 'Shadow Market',
        nameTranslations: { en: 'Shadow Market', tr: 'Gölge Pazarı', de: 'Schattenmarkt', fr: 'Marché des Ombres', es: 'Mercado de Sombras', pt: 'Mercado das Sombras', ru: 'Теневой Рынок', zh: '暗影市场' },
        description: 'Dark artifacts and potions',
        baseStock: [
          { itemId: 'Cooked Salmon', minQty: 5, maxQty: 10, priceMultiplier: 3 },
          { itemId: 'Dark Essence', minQty: 5, maxQty: 15, priceMultiplier: 4 },
          { itemId: 'Mithril Bar', minQty: 3, maxQty: 8, priceMultiplier: 3 },
        ]
      },
      {
        id: 'shop_dragonspire',
        regionId: 'dragonspire',
        name: 'Dragon\'s Hoard',
        nameTranslations: { en: 'Dragon\'s Hoard', tr: 'Ejder Hazinesi', de: 'Drachenhort', fr: 'Trésor du Dragon', es: 'Tesoro del Dragón', pt: 'Tesouro do Dragão', ru: 'Сокровище Дракона', zh: '龙之宝藏' },
        description: 'Legendary items and enhancement gems',
        baseStock: [
          { itemId: 'Cooked Shark', minQty: 3, maxQty: 8, priceMultiplier: 3 },
          { itemId: 'Dragon Scale', minQty: 2, maxQty: 6, priceMultiplier: 5 },
          { itemId: 'chaos_stone', minQty: -1, maxQty: -1, priceMultiplier: 1, fixedPrice: 1000000, unlimited: true },
        ]
      },
      {
        id: 'shop_frozen',
        regionId: 'frozen_wastes',
        name: 'Frost Emporium',
        nameTranslations: { en: 'Frost Emporium', tr: 'Buz Mağazası', de: 'Frostemporium', fr: 'Emporium de Glace', es: 'Emporio de Escarcha', pt: 'Empório de Gelo', ru: 'Ледяной Эмпориум', zh: '冰霜商场' },
        description: 'Frozen treasures and enhancement materials',
        baseStock: [
          { itemId: 'Cooked Swordfish', minQty: 5, maxQty: 12, priceMultiplier: 3 },
          { itemId: 'Froststone', minQty: 5, maxQty: 15, priceMultiplier: 4 },
          { itemId: 'jurax_gem', minQty: -1, maxQty: -1, priceMultiplier: 1, fixedPrice: 1500000, unlimited: true },
        ]
      },
      {
        id: 'shop_void',
        regionId: 'void_realm',
        name: 'Void Nexus',
        nameTranslations: { en: 'Void Nexus', tr: 'Boşluk Bağlantısı', de: 'Leerennexus', fr: 'Nexus du Vide', es: 'Nexo del Vacío', pt: 'Nexo do Vazio', ru: 'Пустотный Нексус', zh: '虚空枢纽' },
        description: 'Ultimate power awaits the worthy',
        baseStock: [
          { itemId: 'Cooked Void Fish', minQty: 8, maxQty: 20, priceMultiplier: 3 },
          { itemId: 'Void Crystal', minQty: 3, maxQty: 10, priceMultiplier: 5 },
          { itemId: 'death_liquid', minQty: -1, maxQty: -1, priceMultiplier: 1, fixedPrice: 750000, unlimited: true },
          { itemId: 'chaos_stone', minQty: -1, maxQty: -1, priceMultiplier: 1, fixedPrice: 1000000, unlimited: true },
          { itemId: 'jurax_gem', minQty: -1, maxQty: -1, priceMultiplier: 1, fixedPrice: 1500000, unlimited: true },
        ]
      },
    ];

    for (const shop of shops) {
      await db.execute(sql`
        INSERT INTO npc_shops (id, region_id, name, name_translations, description, base_stock)
        VALUES (${shop.id}, ${shop.regionId}, ${shop.name}, ${JSON.stringify(shop.nameTranslations)}::jsonb, ${shop.description}, ${JSON.stringify(shop.baseStock)}::jsonb)
      `);
    }

    console.log(`[Seed] Created ${shops.length} NPC shops`);
  } catch (error) {
    console.error('[Seed] Error seeding NPC shops:', error);
  }
}

// Fix existing NPC shop base_stock with correct item IDs (migration)
async function migrateNpcShopItems() {
  try {
    // Check if any shop has old item IDs
    const checkResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM npc_shops 
      WHERE base_stock::text LIKE '%Basic Health Potion%' 
         OR base_stock::text LIKE '%Cooked Chicken%'
         OR base_stock::text LIKE '%Health Potion%'
    `);
    
    if (parseInt((checkResult.rows[0] as any)?.count || '0') === 0) {
      return; // Already migrated
    }
    
    console.log('[Migration] Updating NPC shop item IDs...');
    
    // Update base_stock with correct item IDs for each shop
    const updates = [
      { id: 'shop_verdant', baseStock: [
        { itemId: 'Minor HP Potion', minQty: 5, maxQty: 15, priceMultiplier: 3 },
        { itemId: 'Chicken', minQty: 10, maxQty: 25, priceMultiplier: 2 },
        { itemId: 'Cooked Meat', minQty: 8, maxQty: 20, priceMultiplier: 2 },
      ]},
      { id: 'shop_quarry', baseStock: [
        { itemId: 'Small HP Potion', minQty: 8, maxQty: 20, priceMultiplier: 3 },
        { itemId: 'Coal', minQty: 20, maxQty: 50, priceMultiplier: 2 },
        { itemId: 'Iron Bar', minQty: 5, maxQty: 15, priceMultiplier: 3 },
      ]},
      { id: 'shop_dunes', baseStock: [
        { itemId: 'Cooked Trout', minQty: 5, maxQty: 12, priceMultiplier: 3 },
        { itemId: 'Sand Essence', minQty: 3, maxQty: 10, priceMultiplier: 4 },
        { itemId: 'Gold Bar', minQty: 2, maxQty: 8, priceMultiplier: 3 },
      ]},
      { id: 'shop_obsidian', baseStock: [
        { itemId: 'Cooked Salmon', minQty: 5, maxQty: 10, priceMultiplier: 3 },
        { itemId: 'Dark Essence', minQty: 5, maxQty: 15, priceMultiplier: 4 },
        { itemId: 'Mithril Bar', minQty: 3, maxQty: 8, priceMultiplier: 3 },
      ]},
      { id: 'shop_dragonspire', baseStock: [
        { itemId: 'Cooked Shark', minQty: 3, maxQty: 8, priceMultiplier: 3 },
        { itemId: 'Dragon Scale', minQty: 2, maxQty: 6, priceMultiplier: 5 },
        { itemId: 'chaos_stone', minQty: -1, maxQty: -1, priceMultiplier: 1, fixedPrice: 1000000, unlimited: true },
      ]},
      { id: 'shop_frozen', baseStock: [
        { itemId: 'Cooked Swordfish', minQty: 5, maxQty: 12, priceMultiplier: 3 },
        { itemId: 'Froststone', minQty: 5, maxQty: 15, priceMultiplier: 4 },
        { itemId: 'jurax_gem', minQty: -1, maxQty: -1, priceMultiplier: 1, fixedPrice: 1500000, unlimited: true },
      ]},
      { id: 'shop_void', baseStock: [
        { itemId: 'Cooked Void Fish', minQty: 8, maxQty: 20, priceMultiplier: 3 },
        { itemId: 'Void Crystal', minQty: 3, maxQty: 10, priceMultiplier: 5 },
        { itemId: 'death_liquid', minQty: -1, maxQty: -1, priceMultiplier: 1, fixedPrice: 750000, unlimited: true },
        { itemId: 'chaos_stone', minQty: -1, maxQty: -1, priceMultiplier: 1, fixedPrice: 1000000, unlimited: true },
        { itemId: 'jurax_gem', minQty: -1, maxQty: -1, priceMultiplier: 1, fixedPrice: 1500000, unlimited: true },
      ]},
    ];
    
    for (const update of updates) {
      await db.execute(sql`
        UPDATE npc_shops SET base_stock = ${JSON.stringify(update.baseStock)}::jsonb
        WHERE id = ${update.id}
      `);
    }
    
    // Clear old stock to force regeneration
    await db.execute(sql`DELETE FROM npc_shop_stock`);
    
    console.log('[Migration] NPC shop item IDs updated, stock cleared for regeneration');
  } catch (error) {
    console.error('[Migration] Error migrating NPC shop items:', error);
  }
}

import { refreshNpcShopStock } from "./npcShopUtils";

async function migrateImagePathsToWebp() {
  try {
    const badgeResult = await db.execute(sql`
      UPDATE badges SET image_url = REPLACE(image_url, '.png', '.webp')
      WHERE image_url LIKE '%.png'
    `);
    const itemResult = await db.execute(sql`
      UPDATE game_items SET icon = REPLACE(icon, '.png', '.webp')
      WHERE icon LIKE '%.png'
    `);
    const badgeCount = (badgeResult as any).rowCount || 0;
    const itemCount = (itemResult as any).rowCount || 0;
    if (badgeCount > 0 || itemCount > 0) {
      console.log(`[Migration] Image paths migrated to .webp: ${badgeCount} badges, ${itemCount} items`);
    }
  } catch (error) {
    console.error('[Migration] Error migrating image paths to .webp:', error);
  }
}

async function grantRetroactiveBadges() {
  try {
    const allAchievements = await storage.getAllAchievements();
    const allBadges = await storage.getAllBadges();
    const badgeIdSet = new Set(allBadges.map(b => b.id));

    const achBadgeMap = new Map<string, { tier: number; badgeId: string }[]>();
    for (const ach of allAchievements) {
      const tiers = (ach.tiers as any[]) || [];
      for (const t of tiers) {
        if (t.badgeId && badgeIdSet.has(t.badgeId)) {
          if (!achBadgeMap.has(ach.id)) achBadgeMap.set(ach.id, []);
          achBadgeMap.get(ach.id)!.push({ tier: Number(t.tier), badgeId: t.badgeId });
        }
      }
    }

    if (achBadgeMap.size === 0) return;

    const achIds = Array.from(achBadgeMap.keys());
    const paRows = await db.execute(sql`
      SELECT player_id, achievement_id, completed_tiers FROM player_achievements
      WHERE completed_tiers IS NOT NULL AND completed_tiers != '[]'::jsonb
        AND achievement_id = ANY(${sql.raw(`ARRAY[${achIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',')}]`)})
    `);
    const playerAchievements = (paRows as any).rows || [];
    if (playerAchievements.length === 0) return;

    const existingBadges = await db.execute(sql`SELECT player_id, badge_id FROM player_badges`);
    const ownedSet = new Set(
      ((existingBadges as any).rows || []).map((r: any) => `${r.player_id}:${r.badge_id}`)
    );

    let granted = 0;
    for (const pa of playerAchievements) {
      const completedTiers: number[] = (pa.completed_tiers || []).map(Number);
      const matching = achBadgeMap.get(pa.achievement_id);
      if (!matching) continue;
      for (const m of matching) {
        if (completedTiers.includes(m.tier) && !ownedSet.has(`${pa.player_id}:${m.badgeId}`)) {
          try {
            await storage.awardBadge(pa.player_id, m.badgeId);
            ownedSet.add(`${pa.player_id}:${m.badgeId}`);
            granted++;
          } catch (e) {}
        }
      }
    }
    if (granted > 0) {
      console.log(`[Migration] Retroactive badges granted: ${granted}`);
    }
  } catch (error) {
    console.error('[Migration] Error granting retroactive badges:', error);
  }
}

const app = express();

app.use(compression());

// Redirect .replit.app to custom domain in production
const CUSTOM_DOMAIN = 'idlethrone.com';
app.use((req, res, next) => {
  const host = req.get('host') || '';
  // Only redirect in production and only for .replit.app domains
  if (process.env.NODE_ENV === 'production' && host.includes('.replit.app')) {
    const newUrl = `https://${CUSTOM_DOMAIN}${req.originalUrl}`;
    return res.redirect(301, newUrl);
  }
  next();
});

// PNG to WebP fallback: if a .png image is requested but only .webp exists, serve the .webp
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.endsWith('.png')) {
    const webpPath = req.path.replace(/\.png$/, '.webp');
    const fsPath = path.resolve(process.cwd(), req.path.startsWith('/') ? req.path.slice(1) : req.path);
    const webpFsPath = fsPath.replace(/\.png$/, '.webp');
    if (!fs.existsSync(fsPath) && fs.existsSync(webpFsPath)) {
      return res.redirect(301, webpPath);
    }
  }
  next();
});

// Serve attached_assets as static files for game images
// Use process.cwd() for reliable path resolution in both ESM and CJS
app.use('/attached_assets', express.static(path.resolve(process.cwd(), 'attached_assets')));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  const httpServer = await registerRoutes(app);

  // Weekly participation chest scheduler — runs every 10 minutes, distributes chests at Friday midnight UTC
  let lastWeeklyChestCheck = '';
  setInterval(async () => {
    const now = new Date();
    const dayUTC = now.getUTCDay(); // 0=Sun, 5=Fri
    const hourUTC = now.getUTCHours();
    const minuteUTC = now.getUTCMinutes();
    const checkKey = `${now.toISOString().split('T')[0]}`;
    if (dayUTC === 5 && hourUTC === 0 && minuteUTC < 10 && checkKey !== lastWeeklyChestCheck) {
      lastWeeklyChestCheck = checkKey;
      try {
        const result = await storage.awardWeeklyParticipationChests();
        log(`[WeeklyChest] Awarded chests to ${result.awarded} players`);
      } catch (e: any) {
        log(`[WeeklyChest] Error: ${e.message}`);
      }
    }
  }, 10 * 60 * 1000);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);

  app.listen(port, () => {
    log(`serving on port ${port}`);
  
    runStartupTasks().catch(err => {
      console.error("[Startup] Error in startup tasks:", err);
    });
  });
    
  process.on('SIGTERM', () => {
    log('SIGTERM received, stopping scheduler...');
    stopScheduler();
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    log('SIGINT received, stopping scheduler...');
    stopScheduler();
    process.exit(0);
  });
})();

async function runStartupTasks() {
  try { await storage.seedRaidBosses(); } catch (err) { console.error('[Seed] Error seeding raid bosses:', err); }
  try { await (storage as any).seedRaidForgeRecipes(); } catch (err) { console.error('[Seed] Error seeding raid forge recipes:', err); }

  try {
    const { runMigrations } = await import('./seedGameData');
    await runMigrations();
  } catch (err) { console.error('[Migration] Error running migrations:', err); }

  try {
    const { seedDailyData } = await import('./seedGameData');
    await seedDailyData();
  } catch (err) { console.error('[Seed] Error seeding daily data:', err); }

  try {
    const { seedDungeonData } = await import('./seedGameData');
    await seedDungeonData();
  } catch (err) { console.error('[Seed] Error seeding dungeon data:', err); }

  try {
    const { seedBadges } = await import('./seedGameData');
    await seedBadges();
  } catch (err) { console.error('[Seed] Error seeding badges:', err); }

  try {
    const { generateAchievements } = await import('./achievementSeeds');
    const seeds = generateAchievements();
    await storage.bulkCreateAchievements(seeds);
  } catch (err) { console.error('[Seed] Error seeding achievements:', err); }

  try {
    const { seedSpecialBadges } = await import('./seedGameData');
    await seedSpecialBadges();
  } catch (err) { console.error('[Seed] Error seeding special badges:', err); }

  try {
    const { seedAchievementTierBadges } = await import('./seedGameData');
    await seedAchievementTierBadges();
  } catch (err) { console.error('[Seed] Error seeding achievement tier badges:', err); }

  try {
    const { seedRaidV2Items } = await import('./seedGameData');
    await seedRaidV2Items();
  } catch (err) { console.error('[Seed] Error seeding Raid V2 items:', err); }

  await runItemMigrations();
  await addSharedMonsterDrops();
  await seedNpcShops();
  await migrateNpcShopItems();
  await refreshNpcShopStock();
  await fixBotMarketPrices();
  await repriceMythicBotListings();
  await migrateDungeonKeysToTable();
  await migrateImagePathsToWebp();
  await grantRetroactiveBadges();
  await ensureAdminRoles();

  startScheduler();
}

async function ensureAdminRoles() {
  try {
    await db.execute(sql`
      UPDATE players SET staff_role = 'admin'
      WHERE email = 'betelgeusestd@gmail.com' AND (staff_role IS NULL OR staff_role = '')
    `);
  } catch (error) {
    console.error('[Migration] Error setting admin roles:', error);
  }
}
