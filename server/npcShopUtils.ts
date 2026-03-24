import { db } from "../db";
import { sql } from "drizzle-orm";

interface FixedItem {
  itemId: string;
  minQty: number;
  maxQty: number;
  unlimited?: boolean;
  fixedPrice?: number;
}

interface PoolItem {
  itemId: string;
}

interface ShopPoolConfig {
  fixed: FixedItem[];
  pool: PoolItem[];
  poolSize: { min: number; max: number };
}

const REGION_PRICE_MULTIPLIER: Record<string, { min: number; max: number }> = {
  shop_verdant: { min: 15, max: 24 },
  shop_quarry: { min: 30, max: 45 },
  shop_dunes: { min: 50, max: 75 },
  shop_obsidian: { min: 80, max: 120 },
  shop_frozen: { min: 120, max: 180 },
  shop_dragonspire: { min: 150, max: 225 },
  shop_void: { min: 180, max: 270 },
};

const SHOP_POOL_CONFIG: Record<string, ShopPoolConfig> = {
  shop_verdant: {
    fixed: [
      { itemId: 'Feather', minQty: 150, maxQty: 300 },
    ],
    pool: [
      { itemId: 'Raw Chicken' }, { itemId: 'Raw Meat' }, { itemId: 'Raw Rabbit' },
      { itemId: 'Cooked Meat' }, { itemId: 'Cooked Shrimp' }, { itemId: 'Chicken' },
      { itemId: 'Cooked Rabbit' }, { itemId: 'Wolf Pelt' }, { itemId: 'Spider Silk' },
      { itemId: 'Wolf Fang' }, { itemId: 'Soft Fur' }, { itemId: 'Goblin Ear' },
      { itemId: 'Bones' }, { itemId: 'Bandit Mask' }, { itemId: 'oak_logs' },
      { itemId: 'rabbit_pelt' }, { itemId: 'deer_hide' }, { itemId: 'Iron Ore' },
      { itemId: 'Copper Ore' }, { itemId: 'Tin Ore' }, { itemId: 'Bronze Bar' },
      { itemId: 'Minor Healing Potion' }, { itemId: 'Soft Fur Tonic' },
      { itemId: 'Wolf Fang Elixir' }, { itemId: 'Moonlight Elixir' }, { itemId: 'normal_logs' },
    ],
    poolSize: { min: 5, max: 7 },
  },
  shop_quarry: {
    fixed: [
      { itemId: 'Feather', minQty: 200, maxQty: 350 },
    ],
    pool: [
      { itemId: 'Coal' }, { itemId: 'Iron Ore' }, { itemId: 'Iron Bar' },
      { itemId: 'Silver Ore' }, { itemId: 'Steel Bar' }, { itemId: 'Mithril Ore' },
      { itemId: 'Bat Wing' }, { itemId: 'Bones' }, { itemId: 'Rotten Flesh' },
      { itemId: 'Raw Meat' }, { itemId: 'Golem Core' }, { itemId: 'Troll Hammer Piece' },
      { itemId: 'willow_logs' }, { itemId: 'Cooked Trout' }, { itemId: 'Cooked Cave Fish' },
      { itemId: 'Cooked Herring' }, { itemId: 'Small HP Potion' }, { itemId: 'Bat Wing Brew' },
      { itemId: 'Shadow Draught' }, { itemId: 'Antidote Potion' }, { itemId: 'goat_pelt' },
      { itemId: 'boar_hide' }, { itemId: 'petrified_logs' },
    ],
    poolSize: { min: 5, max: 7 },
  },
  shop_dunes: {
    fixed: [
      { itemId: 'Feather', minQty: 250, maxQty: 400 },
    ],
    pool: [
      { itemId: 'Sand Essence' }, { itemId: 'Venom Sac' }, { itemId: 'Scorpion Stinger' },
      { itemId: 'Ancient Bandage' }, { itemId: 'Gold Ore' }, { itemId: 'Gold Bar' },
      { itemId: 'Spider Silk' }, { itemId: 'Spider Queen Fang' }, { itemId: 'Djinn Essence' },
      { itemId: 'Mithril Bar' }, { itemId: 'willow_logs' }, { itemId: 'Cooked Trout' },
      { itemId: 'Cooked Sand Eel' }, { itemId: 'Cooked Salmon' }, { itemId: 'Cooked Lava Fish' },
      { itemId: 'Sand Storm Elixir' }, { itemId: "Mummy's Curse Antidote" },
      { itemId: 'Djinn Essence Potion' }, { itemId: 'Goblin Kebab' }, { itemId: 'Spider Soup' },
      { itemId: 'camel_hide' }, { itemId: 'cactus_logs' },
    ],
    poolSize: { min: 5, max: 7 },
  },
  shop_obsidian: {
    fixed: [
      { itemId: 'Feather', minQty: 300, maxQty: 450 },
    ],
    pool: [
      { itemId: 'Dark Essence' }, { itemId: 'Orc Tusk' }, { itemId: 'Mithril Bar' },
      { itemId: 'Mithril Ore' }, { itemId: 'Rune Bar' }, { itemId: 'Steel Bar' },
      { itemId: 'Shadow Cloak' }, { itemId: 'Orc Axe Piece' },
      { itemId: 'Dark Knight Sword Piece' }, { itemId: 'Shadow Dagger Piece' },
      { itemId: "Giant's Hammer Shard" }, { itemId: 'Dark Lord Fragment' },
      { itemId: 'Raw Meat' }, { itemId: 'maple_logs' }, { itemId: 'Cooked Salmon' },
      { itemId: 'Cooked Tuna' }, { itemId: 'Orc Roast' }, { itemId: 'Obsidian Potion' },
      { itemId: 'Orc War Potion' }, { itemId: 'Dark Essence Elixir' },
      { itemId: 'shadow_stew' }, { itemId: 'magic_core' }, { itemId: 'panther_pelt' },
      { itemId: 'shadow_wolf_pelt' }, { itemId: 'darkwood_logs' }, { itemId: 'Obsidian Shard' },
    ],
    poolSize: { min: 5, max: 7 },
  },
  shop_frozen: {
    fixed: [
      { itemId: 'Feather', minQty: 350, maxQty: 500 },
      { itemId: 'jurax_gem', minQty: -1, maxQty: -1, unlimited: true, fixedPrice: 1000000 },
    ],
    pool: [
      { itemId: 'Froststone' }, { itemId: 'Frozen Essence' }, { itemId: 'Frozen Crystal' },
      { itemId: 'Frozen Pelt' }, { itemId: 'Giant Ice Shard' }, { itemId: 'Frost Heart' },
      { itemId: 'Ancient Froststone' }, { itemId: 'Wyrm Scale' }, { itemId: 'Golem Core' },
      { itemId: 'Raw Meat' }, { itemId: 'yew_logs' }, { itemId: 'maple_logs' },
      { itemId: 'Cooked Swordfish' }, { itemId: 'Cooked Frost Fish' }, { itemId: 'Cooked Lobster' },
      { itemId: 'Frostbite Serum' }, { itemId: 'Frost Resistance Potion' },
      { itemId: 'XL Vitality Potion' }, { itemId: 'elder_core' }, { itemId: 'ice_bear_pelt' },
      { itemId: 'frost_tiger_pelt' }, { itemId: 'fox_pelt' }, { itemId: 'ice_logs' },
    ],
    poolSize: { min: 5, max: 7 },
  },
  shop_dragonspire: {
    fixed: [
      { itemId: 'Feather', minQty: 400, maxQty: 550 },
      { itemId: 'chaos_stone', minQty: -1, maxQty: -1, unlimited: true, fixedPrice: 1000000 },
    ],
    pool: [
      { itemId: 'Dragon Bone' }, { itemId: 'Dragon Scale' }, { itemId: 'Drake Scale' },
      { itemId: 'Fire Essence' }, { itemId: 'Wyvern Scale' }, { itemId: 'Wyvern Wing Fragment' },
      { itemId: 'Drake Fire Essence' }, { itemId: 'Raw Wyvern Meat' }, { itemId: 'dragon_core' },
      { itemId: 'Elder Dragon Heart' }, { itemId: 'Bones' }, { itemId: 'Cooked Shark' },
      { itemId: 'Cooked Dragon Fish' }, { itemId: 'Dragon Steak' }, { itemId: 'Wyvern Steak' },
      { itemId: 'Dragon Fire Elixir' }, { itemId: 'Dragonfire Elixir' },
      { itemId: 'Wyvern Scale Potion' }, { itemId: 'Infernal Potion' },
      { itemId: 'dragon_logs' }, { itemId: 'dragon_bone_soup' }, { itemId: 'wyvern_leather' },
    ],
    poolSize: { min: 5, max: 7 },
  },
  shop_void: {
    fixed: [
      { itemId: 'Feather', minQty: 450, maxQty: 600 },
      { itemId: 'death_liquid', minQty: -1, maxQty: -1, unlimited: true, fixedPrice: 1000000 },
      { itemId: 'chaos_stone', minQty: -1, maxQty: -1, unlimited: true, fixedPrice: 1000000 },
      { itemId: 'jurax_gem', minQty: -1, maxQty: -1, unlimited: true, fixedPrice: 1000000 },
    ],
    pool: [
      { itemId: 'Void Crystal' }, { itemId: 'Void Essence' }, { itemId: 'Shadow Shard' },
      { itemId: 'Demon Shard' }, { itemId: 'Shadow Core' }, { itemId: 'Pure Void Crystal' },
      { itemId: 'Void Fragment' }, { itemId: 'Void Knight Fragment' }, { itemId: 'Emperor Fragment' },
      { itemId: 'celestial_fabric' }, { itemId: 'oracle_fabric' }, { itemId: 'void_core' },
      { itemId: 'Cooked Void Fish' }, { itemId: 'Void Stew' }, { itemId: 'Void Fish' },
      { itemId: 'void_feast' }, { itemId: 'Void Essence Potion' }, { itemId: 'Void Defence Potion' },
      { itemId: 'Void Strength Potion' }, { itemId: 'void_essence_draught' },
      { itemId: 'Cosmic Elixir' }, { itemId: 'void_logs' }, { itemId: 'void_beast_hide' },
      { itemId: 'celestial_hide' },
    ],
    poolSize: { min: 5, max: 7 },
  },
};

function getQuantityRange(vendorPrice: number, itemType?: string): { min: number; max: number } {
  if (itemType === 'potion') {
    return { min: 10, max: 40 };
  }
  if (itemType === 'food') {
    if (vendorPrice > 100) return { min: 8, max: 30 };
    return { min: 15, max: 50 };
  }
  if (vendorPrice <= 10) return { min: 100, max: 200 };
  if (vendorPrice <= 40) return { min: 80, max: 180 };
  if (vendorPrice <= 100) return { min: 30, max: 80 };
  if (vendorPrice <= 300) return { min: 15, max: 45 };
  if (vendorPrice <= 1000) return { min: 5, max: 20 };
  return { min: 2, max: 8 };
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleAndPick<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export async function refreshNpcShopStock() {
  try {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const blockStart = Math.floor(currentHour / 4) * 4;
    const resetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), blockStart, 0, 0));

    const existingStock = await db.execute(sql`
      SELECT COUNT(*) as count FROM npc_shop_stock WHERE reset_date = ${resetDate}
    `);

    if (parseInt((existingStock.rows[0] as any)?.count || '0') > 0) {
      return;
    }

    const lockResult = await db.execute(sql`SELECT pg_try_advisory_lock(42424242)`);
    const gotLock = (lockResult.rows[0] as any)?.pg_try_advisory_lock;
    if (!gotLock) {
      await new Promise(r => setTimeout(r, 500));
      return;
    }

    try {
      const recheck = await db.execute(sql`
        SELECT COUNT(*) as count FROM npc_shop_stock WHERE reset_date = ${resetDate}
      `);
      if (parseInt((recheck.rows[0] as any)?.count || '0') > 0) {
        return;
      }

      console.log('[NPC Shop] Generating pool-based stock for 4-hour block:', resetDate.toISOString());

      await db.execute(sql`DELETE FROM npc_shop_stock WHERE reset_date < ${resetDate}`);

      const allItemsResult = await db.execute(sql`SELECT id, vendor_price, type FROM game_items`);
      const itemLookup = new Map<string, { vendorPrice: number; type: string }>();
      for (const row of allItemsResult.rows as any[]) {
        itemLookup.set(row.id, { vendorPrice: row.vendor_price || 0, type: row.type || 'material' });
      }

      for (const [shopId, config] of Object.entries(SHOP_POOL_CONFIG)) {
        for (const fixedItem of config.fixed) {
          let quantity: number;
          let price: number;

          if (fixedItem.unlimited) {
            quantity = -1;
            price = fixedItem.fixedPrice || 1000000;
          } else if (fixedItem.fixedPrice) {
            quantity = randomInt(fixedItem.minQty, fixedItem.maxQty);
            price = fixedItem.fixedPrice;
          } else {
            const info = itemLookup.get(fixedItem.itemId);
            const vendorPrice = info?.vendorPrice || 1;
            const range = getQuantityRange(vendorPrice, info?.type);
            quantity = randomInt(fixedItem.minQty || range.min, fixedItem.maxQty || range.max);
            const regionMult = REGION_PRICE_MULTIPLIER[shopId] || { min: 15, max: 24 };
            price = Math.floor(vendorPrice * randomInt(regionMult.min, regionMult.max));
          }

          await db.execute(sql`
            INSERT INTO npc_shop_stock (shop_id, item_id, quantity, price_per_item, reset_date)
            VALUES (${shopId}, ${fixedItem.itemId}, ${quantity}, ${price}, ${resetDate})
            ON CONFLICT DO NOTHING
          `);
        }

        if (Math.random() < 0.80) {
          const teleportQty = randomInt(1, 3);
          await db.execute(sql`
            INSERT INTO npc_shop_stock (shop_id, item_id, quantity, price_per_item, reset_date)
            VALUES (${shopId}, ${'teleport_stone'}, ${teleportQty}, ${370000}, ${resetDate})
            ON CONFLICT DO NOTHING
          `);
        }

        const poolCount = randomInt(config.poolSize.min, config.poolSize.max);
        const selectedPool = shuffleAndPick(config.pool, poolCount);

        for (const poolItem of selectedPool) {
          const info = itemLookup.get(poolItem.itemId);
          const vendorPrice = info?.vendorPrice || 1;
          const itemType = info?.type || 'material';
          const range = getQuantityRange(vendorPrice, itemType);
          const quantity = randomInt(range.min, range.max);
          const regionMult = REGION_PRICE_MULTIPLIER[shopId] || { min: 15, max: 24 };
          const price = Math.floor(vendorPrice * randomInt(regionMult.min, regionMult.max));

          await db.execute(sql`
            INSERT INTO npc_shop_stock (shop_id, item_id, quantity, price_per_item, reset_date)
            VALUES (${shopId}, ${poolItem.itemId}, ${quantity}, ${price}, ${resetDate})
            ON CONFLICT DO NOTHING
          `);
        }
      }

      console.log('[NPC Shop] Pool-based stock refreshed for block:', resetDate.toISOString());
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(42424242)`);
    }
  } catch (error) {
    console.error('[NPC Shop] Error refreshing stock:', error);
    try { await db.execute(sql`SELECT pg_advisory_unlock(42424242)`); } catch {}
  }
}
