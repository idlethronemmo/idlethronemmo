import { db } from "../../db";
import { eq } from "drizzle-orm";
import { partyLootConfig, type PartyLootConfig } from "@shared/schema";

export interface LootItem {
  itemId: string;
  quantity: number;
  rarity?: string;
}

export interface PlayerRoll {
  choice: 'need' | 'greed' | 'pass';
  value: number;
  timestamp: number;
}

export interface PendingLootRoll {
  rollId: string;
  partyId: string;
  itemId: string;
  itemRarity: string;
  rolls: Map<string, PlayerRoll>;
  createdAt: number;
  timeout: number;
}

export interface LootConfigSettings {
  rollRange?: number;
  needBonus?: number;
  rollTimeout?: number;
}

export interface DistributionResult {
  itemId: string;
  quantity: number;
  winnerId: string | null;
  method: string;
}

const DEFAULT_ROLL_RANGE = 100;
const DEFAULT_NEED_BONUS = 100;
const DEFAULT_ROLL_TIMEOUT = 30000;

export class PartyLootService {
  private pendingRolls: Map<string, PendingLootRoll> = new Map();
  private configCache: PartyLootConfig[] | null = null;
  private configCacheTime: number = 0;
  private readonly CONFIG_CACHE_TTL = 60000;

  async getLootConfigs(): Promise<PartyLootConfig[]> {
    const now = Date.now();
    if (this.configCache && now - this.configCacheTime < this.CONFIG_CACHE_TTL) {
      return this.configCache;
    }

    const configs = await db.select().from(partyLootConfig);
    this.configCache = configs;
    this.configCacheTime = now;
    return configs;
  }

  async getDefaultConfig(): Promise<PartyLootConfig | null> {
    const configs = await this.getLootConfigs();
    const defaultConfig = configs.find(c => c.isDefault === 1);
    if (defaultConfig) return defaultConfig;
    
    return configs.find(c => c.distributionType === 'need_greed') || configs[0] || null;
  }

  async getConfigByType(distributionType: string): Promise<PartyLootConfig | null> {
    const configs = await this.getLootConfigs();
    return configs.find(c => c.distributionType === distributionType) || null;
  }

  private getSettings(config: PartyLootConfig | null): LootConfigSettings {
    if (!config || !config.settings) return {};
    return config.settings as LootConfigSettings;
  }

  startLootRoll(partyId: string, itemId: string, itemRarity: string): PendingLootRoll {
    const rollId = `roll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    const pendingRoll: PendingLootRoll = {
      rollId,
      partyId,
      itemId,
      itemRarity,
      rolls: new Map(),
      createdAt: now,
      timeout: DEFAULT_ROLL_TIMEOUT,
    };

    this.pendingRolls.set(rollId, pendingRoll);
    return pendingRoll;
  }

  getPendingRoll(rollId: string): PendingLootRoll | undefined {
    return this.pendingRolls.get(rollId);
  }

  getPendingRollsForParty(partyId: string): PendingLootRoll[] {
    const rolls: PendingLootRoll[] = [];
    Array.from(this.pendingRolls.values()).forEach(roll => {
      if (roll.partyId === partyId) {
        rolls.push(roll);
      }
    });
    return rolls;
  }

  async submitRoll(
    rollId: string, 
    playerId: string, 
    choice: 'need' | 'greed' | 'pass'
  ): Promise<{ success: boolean; error?: string }> {
    const pendingRoll = this.pendingRolls.get(rollId);
    if (!pendingRoll) {
      return { success: false, error: 'Roll not found' };
    }

    const now = Date.now();
    if (now - pendingRoll.createdAt > pendingRoll.timeout) {
      return { success: false, error: 'Roll has timed out' };
    }

    if (pendingRoll.rolls.has(playerId)) {
      return { success: false, error: 'You have already rolled' };
    }

    const config = await this.getDefaultConfig();
    const settings = this.getSettings(config);
    const rollRange = settings.rollRange || DEFAULT_ROLL_RANGE;
    const needBonus = settings.needBonus || DEFAULT_NEED_BONUS;

    const rollValue = this.calculateRollResult(choice, rollRange, needBonus);

    pendingRoll.rolls.set(playerId, {
      choice,
      value: rollValue,
      timestamp: now,
    });

    return { success: true };
  }

  calculateRollResult(
    choice: 'need' | 'greed' | 'pass', 
    rollRange: number = DEFAULT_ROLL_RANGE, 
    needBonus: number = DEFAULT_NEED_BONUS
  ): number {
    if (choice === 'pass') {
      return -1;
    }

    const baseRoll = Math.floor(Math.random() * rollRange) + 1;
    
    if (choice === 'need') {
      return baseRoll + needBonus;
    }

    return baseRoll;
  }

  resolveRoll(rollId: string): { winnerId: string | null; roll: PlayerRoll | null } {
    const pendingRoll = this.pendingRolls.get(rollId);
    if (!pendingRoll) {
      return { winnerId: null, roll: null };
    }

    let winnerId: string | null = null;
    let winningRoll: PlayerRoll | null = null;

    Array.from(pendingRoll.rolls.entries()).forEach(([playerId, roll]) => {
      if (roll.choice === 'pass') return;

      if (!winningRoll) {
        winnerId = playerId;
        winningRoll = roll;
        return;
      }

      if (roll.value > winningRoll.value) {
        winnerId = playerId;
        winningRoll = roll;
      } else if (roll.value === winningRoll.value && roll.timestamp < winningRoll.timestamp) {
        winnerId = playerId;
        winningRoll = roll;
      }
    });

    this.pendingRolls.delete(rollId);

    return { winnerId, roll: winningRoll };
  }

  async distributeLoot(
    partyId: string, 
    lootItems: LootItem[], 
    distributionType: string,
    partyMemberIds: string[],
    leaderId?: string
  ): Promise<DistributionResult[]> {
    const results: DistributionResult[] = [];

    if (partyMemberIds.length === 0) {
      return results;
    }

    switch (distributionType) {
      case 'equal':
        return this.distributeEqual(lootItems, partyMemberIds);
      
      case 'master_loot':
        return this.distributeMasterLoot(lootItems, leaderId || partyMemberIds[0]);
      
      case 'need_greed':
      default:
        return this.startNeedGreedRolls(partyId, lootItems);
    }
  }

  private distributeEqual(lootItems: LootItem[], memberIds: string[]): DistributionResult[] {
    const results: DistributionResult[] = [];
    
    for (const item of lootItems) {
      const randomIndex = Math.floor(Math.random() * memberIds.length);
      const winnerId = memberIds[randomIndex];
      
      results.push({
        itemId: item.itemId,
        quantity: item.quantity,
        winnerId,
        method: 'equal',
      });
    }

    return results;
  }

  private distributeMasterLoot(lootItems: LootItem[], leaderId: string): DistributionResult[] {
    return lootItems.map(item => ({
      itemId: item.itemId,
      quantity: item.quantity,
      winnerId: leaderId,
      method: 'master_loot',
    }));
  }

  private startNeedGreedRolls(partyId: string, lootItems: LootItem[]): DistributionResult[] {
    const results: DistributionResult[] = [];

    for (const item of lootItems) {
      const roll = this.startLootRoll(partyId, item.itemId, item.rarity || 'common');
      
      results.push({
        itemId: item.itemId,
        quantity: item.quantity,
        winnerId: null,
        method: 'need_greed',
      });
    }

    return results;
  }

  cleanupExpiredRolls(): number {
    const now = Date.now();
    let cleaned = 0;
    const toDelete: string[] = [];

    Array.from(this.pendingRolls.entries()).forEach(([rollId, roll]) => {
      if (now - roll.createdAt > roll.timeout) {
        toDelete.push(rollId);
        cleaned++;
      }
    });

    toDelete.forEach(rollId => this.pendingRolls.delete(rollId));

    return cleaned;
  }

  autoPassExpiredPlayers(rollId: string, expectedPlayerIds: string[]): void {
    const pendingRoll = this.pendingRolls.get(rollId);
    if (!pendingRoll) return;

    const now = Date.now();
    if (now - pendingRoll.createdAt <= pendingRoll.timeout) return;

    for (const playerId of expectedPlayerIds) {
      if (!pendingRoll.rolls.has(playerId)) {
        pendingRoll.rolls.set(playerId, {
          choice: 'pass',
          value: -1,
          timestamp: now,
        });
      }
    }
  }

  invalidateCache(): void {
    this.configCache = null;
    this.configCacheTime = 0;
  }
}

export const partyLootService = new PartyLootService();
