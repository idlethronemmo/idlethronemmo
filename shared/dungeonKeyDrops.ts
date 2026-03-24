export const REGION_TO_TIER: Record<string, number> = {
  verdant: 1,
  quarry: 3,
  dunes: 5,
  obsidian: 6,
  dragonspire: 7,
  frozen_wastes: 7,
  void_realm: 8
};

export interface DungeonKeyConfig {
  keyType: string;
  monsterTierMin: number;
  monsterTierMax: number;
  dropChance: number;
  bossDropChance: number;
}

export const DUNGEON_KEY_CONFIGS: DungeonKeyConfig[] = [
  { keyType: 'bronze_key', monsterTierMin: 1, monsterTierMax: 2, dropChance: 3, bossDropChance: 150 },
  { keyType: 'bronze_key', monsterTierMin: 3, monsterTierMax: 4, dropChance: 4, bossDropChance: 150 },
  { keyType: 'silver_key', monsterTierMin: 3, monsterTierMax: 4, dropChance: 2, bossDropChance: 100 },
  { keyType: 'silver_key', monsterTierMin: 5, monsterTierMax: 6, dropChance: 5, bossDropChance: 150 },
  { keyType: 'gold_key', monsterTierMin: 5, monsterTierMax: 6, dropChance: 2, bossDropChance: 80 },
  { keyType: 'gold_key', monsterTierMin: 7, monsterTierMax: 8, dropChance: 7, bossDropChance: 150 },
  { keyType: 'void_key', monsterTierMin: 7, monsterTierMax: 8, dropChance: 3, bossDropChance: 100 },
];

export function getMonsterTier(regionId: string): number {
  return REGION_TO_TIER[regionId] || 1;
}

export function rollDungeonKeyDrop(regionId: string, isBoss: boolean = false): string | null {
  const tier = getMonsterTier(regionId);
  
  const applicableConfigs = DUNGEON_KEY_CONFIGS.filter(
    config => tier >= config.monsterTierMin && tier <= config.monsterTierMax
  );
  
  if (applicableConfigs.length === 0) return null;
  
  for (const config of applicableConfigs) {
    const dropChance = isBoss ? config.bossDropChance : config.dropChance;
    const roll = Math.random() * 10000;
    
    if (roll < dropChance) {
      return config.keyType;
    }
  }
  
  return null;
}
