/**
 * Enhancement System Configuration
 * 
 * Three enhancement materials with different effects:
 * - Chaos Stone: Adds a random new stat to equipment
 * - Jurax Gem: Upgrades equipment level (+5% stats per level)
 * - Death Liquid: Adds a random skill to equipment
 * 
 * Failed enhancements (except Jurax Gem) result in the item becoming "Cursed"
 */

// Stats that can be added via Chaos Stone
export const ADDABLE_STATS = [
  { id: 'bonusAttack', name: 'Attack', minValue: 5, maxValue: 25 },
  { id: 'bonusDefence', name: 'Defence', minValue: 5, maxValue: 25 },
  { id: 'bonusStrength', name: 'Strength', minValue: 5, maxValue: 25 },
  { id: 'bonusHitpoints', name: 'Hitpoints', minValue: 10, maxValue: 50 },
  { id: 'accuracy', name: 'Accuracy', minValue: 3, maxValue: 15 },
  { id: 'evasion', name: 'Evasion', minValue: 3, maxValue: 15 },
  { id: 'critChance', name: 'Crit Chance', minValue: 1, maxValue: 5 },
  { id: 'critDamage', name: 'Crit Damage', minValue: 5, maxValue: 20 },
  { id: 'lifesteal', name: 'Lifesteal', minValue: 1, maxValue: 5 },
  { id: 'damageReduction', name: 'Damage Reduction', minValue: 1, maxValue: 5 },
  { id: 'attackSpeed', name: 'Attack Speed', minValue: 1, maxValue: 3 },
] as const;

// Skills that can be added via Death Liquid
export const ADDABLE_SKILLS = [
  { id: 'poison', name: 'Poison', description: 'Deals damage over time', chance: 10 },
  { id: 'burn', name: 'Burn', description: 'Burns enemy for fire damage', chance: 10 },
  { id: 'bleed', name: 'Bleed', description: 'Causes bleeding damage', chance: 10 },
  { id: 'stun', name: 'Stun', description: 'Chance to stun enemy', chance: 5 },
  { id: 'freeze', name: 'Freeze', description: 'Slows enemy attacks', chance: 8 },
  { id: 'vampiric', name: 'Vampiric', description: 'Heal on hit', chance: 8 },
  { id: 'execute', name: 'Execute', description: 'Deal bonus damage to low HP enemies', chance: 5 },
  { id: 'armor_pierce', name: 'Armor Pierce', description: 'Ignore some enemy defense', chance: 10 },
] as const;

// Enhancement configuration
export const ENHANCEMENT_CONFIG = {
  // Jurax Gem upgrade levels (+0 to +10)
  MAX_LEVEL: 10,
  STAT_BONUS_PER_LEVEL: 5, // +5% per level
  
  // Jurax Gem success rates per level (0 -> 1, 1 -> 2, etc.)
  SUCCESS_RATES: [100, 90, 80, 70, 60, 50, 40, 30, 20, 15],
  
  // Jurax Gem burn rates per level
  BURN_RATES: [0, 0, 0, 5, 10, 15, 25, 35, 45, 55],
  
  // Chaos Stone (add stat) success rate - flat percentage
  CHAOS_STONE_SUCCESS_RATE: 60,
  
  // Death Liquid (add skill) success rate - flat percentage
  DEATH_LIQUID_SUCCESS_RATE: 50,
  
  // Maximum additional stats per item
  MAX_ADDED_STATS: 3,
  
  // Maximum additional skills per item
  MAX_ADDED_SKILLS: 2,
  
  // Material item IDs
  MATERIALS: {
    chaos_stone: {
      id: 'chaos_stone',
      name: 'Chaos Stone',
      effect: 'add_stat',
      successRate: 60,
    },
    jurax_gem: {
      id: 'jurax_gem', 
      name: 'Jurax Gem',
      effect: 'upgrade_level',
      successBonus: 15, // +15% success rate bonus (old system compatibility)
    },
    death_liquid: {
      id: 'death_liquid',
      name: 'Death Liquid',
      effect: 'add_skill',
      successRate: 50,
    },
  },
};

// Types for item modifications
export interface ItemModification {
  addedStats: { [statId: string]: number }; // e.g., { accuracy: 10, critChance: 3 }
  addedSkills: string[]; // e.g., ['poison', 'burn']
  enhancementLevel: number; // 0-10
}

export interface CursedItemInfo {
  itemId: string;
  cursedAt: number; // timestamp
  reason: 'chaos_stone_fail' | 'death_liquid_fail';
}

// Helper functions
export function getRandomStat(existingStats: string[]): typeof ADDABLE_STATS[number] | null {
  const availableStats = ADDABLE_STATS.filter(stat => !existingStats.includes(stat.id));
  if (availableStats.length === 0) return null;
  return availableStats[Math.floor(Math.random() * availableStats.length)];
}

export function getRandomSkill(existingSkills: string[]): typeof ADDABLE_SKILLS[number] | null {
  const availableSkills = ADDABLE_SKILLS.filter(skill => !existingSkills.includes(skill.id));
  if (availableSkills.length === 0) return null;
  return availableSkills[Math.floor(Math.random() * availableSkills.length)];
}

export function getRandomStatValue(stat: typeof ADDABLE_STATS[number]): number {
  return Math.floor(Math.random() * (stat.maxValue - stat.minValue + 1)) + stat.minValue;
}

export function isEnhancementSuccess(successRate: number): boolean {
  return Math.random() * 100 < successRate;
}

export function isBurnFailure(burnRate: number): boolean {
  return Math.random() * 100 < burnRate;
}
