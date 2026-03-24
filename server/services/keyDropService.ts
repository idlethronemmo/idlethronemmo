import { db } from "../../db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  dungeonKeyConfig,
  playerDungeonKeys,
  type DungeonKeyConfig,
  type PlayerDungeonKey,
} from "@shared/schema";

export type KeyType = 'bronze' | 'silver' | 'gold' | 'void';

export interface KeyDropResult {
  keyType: KeyType;
  quantity: number;
}

export class KeyDropService {
  private configCache: DungeonKeyConfig[] = [];
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private async refreshCacheIfNeeded(): Promise<void> {
    if (Date.now() < this.cacheExpiry && this.configCache.length > 0) {
      return;
    }

    const configs = await db.select().from(dungeonKeyConfig)
      .where(eq(dungeonKeyConfig.isActive, 1));
    
    this.configCache = configs;
    this.cacheExpiry = Date.now() + this.CACHE_DURATION;
  }

  async getKeyDropConfigs(): Promise<DungeonKeyConfig[]> {
    await this.refreshCacheIfNeeded();
    return this.configCache;
  }

  calculateKeyDrop(monsterTier: number, isBoss: boolean): KeyDropResult | null {
    if (this.configCache.length === 0) {
      return null;
    }

    const matchingConfigs = this.configCache.filter(config => 
      monsterTier >= config.monsterTierMin && 
      monsterTier <= config.monsterTierMax
    );

    if (matchingConfigs.length === 0) {
      return null;
    }

    for (const config of matchingConfigs) {
      const dropChance = isBoss ? config.bossDropChance : config.dropChance;

      const roll = Math.floor(Math.random() * 10000);
      
      if (roll < dropChance) {
        return {
          keyType: config.keyType as KeyType,
          quantity: 1,
        };
      }
    }

    return null;
  }

  async awardKey(playerId: string, keyType: string, quantity: number = 1): Promise<PlayerDungeonKey> {
    const existing = await db.select()
      .from(playerDungeonKeys)
      .where(and(
        eq(playerDungeonKeys.playerId, playerId),
        eq(playerDungeonKeys.keyType, keyType)
      ))
      .limit(1);

    if (existing.length > 0) {
      const updated = await db.update(playerDungeonKeys)
        .set({ 
          quantity: sql`${playerDungeonKeys.quantity} + ${quantity}` 
        })
        .where(eq(playerDungeonKeys.id, existing[0].id))
        .returning();
      return updated[0];
    } else {
      const inserted = await db.insert(playerDungeonKeys)
        .values({
          playerId,
          keyType,
          quantity,
        })
        .returning();
      return inserted[0];
    }
  }

  async getPlayerKeys(playerId: string): Promise<PlayerDungeonKey[]> {
    return await db.select()
      .from(playerDungeonKeys)
      .where(eq(playerDungeonKeys.playerId, playerId));
  }

  async consumeKey(playerId: string, keyType: string): Promise<{ success: boolean; error?: string }> {
    const existing = await db.select()
      .from(playerDungeonKeys)
      .where(and(
        eq(playerDungeonKeys.playerId, playerId),
        eq(playerDungeonKeys.keyType, keyType)
      ))
      .limit(1);

    if (existing.length === 0 || existing[0].quantity < 1) {
      return { success: false, error: `No ${keyType} keys available` };
    }

    await db.update(playerDungeonKeys)
      .set({ 
        quantity: sql`${playerDungeonKeys.quantity} - 1` 
      })
      .where(eq(playerDungeonKeys.id, existing[0].id));

    return { success: true };
  }

  async processMonsterKill(playerId: string, monsterTier: number, isBoss: boolean): Promise<KeyDropResult | null> {
    await this.refreshCacheIfNeeded();
    
    const drop = this.calculateKeyDrop(monsterTier, isBoss);
    
    if (drop) {
      await this.awardKey(playerId, drop.keyType, drop.quantity);
    }
    
    return drop;
  }

  async processBulkMonsterKills(
    playerId: string, 
    kills: Array<{ monsterTier: number; isBoss: boolean; count: number }>
  ): Promise<Record<KeyType, number>> {
    await this.refreshCacheIfNeeded();
    
    const keyDrops: Record<KeyType, number> = {
      bronze: 0,
      silver: 0,
      gold: 0,
      void: 0,
    };

    for (const killBatch of kills) {
      for (let i = 0; i < killBatch.count; i++) {
        const drop = this.calculateKeyDrop(killBatch.monsterTier, killBatch.isBoss);
        if (drop) {
          keyDrops[drop.keyType] += drop.quantity;
        }
      }
    }

    for (const [keyType, quantity] of Object.entries(keyDrops)) {
      if (quantity > 0) {
        await this.awardKey(playerId, keyType, quantity);
      }
    }

    return keyDrops;
  }

  async getPlayerKeyCount(playerId: string, keyType: string): Promise<number> {
    const result = await db.select()
      .from(playerDungeonKeys)
      .where(and(
        eq(playerDungeonKeys.playerId, playerId),
        eq(playerDungeonKeys.keyType, keyType)
      ))
      .limit(1);

    return result.length > 0 ? result[0].quantity : 0;
  }

  clearCache(): void {
    this.configCache = [];
    this.cacheExpiry = 0;
  }
}

export const keyDropService = new KeyDropService();
