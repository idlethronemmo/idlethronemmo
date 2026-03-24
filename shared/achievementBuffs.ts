export interface AchievementMilestoneBuff {
  category: string;
  thresholds: number[];
  buffType: string;
  values: number[];
  skillId?: string;
}

export const ACHIEVEMENT_MILESTONE_BUFFS: AchievementMilestoneBuff[] = [
  { category: 'combat', thresholds: [3, 6, 9, 12], buffType: 'attackPercent', values: [0.5, 1, 1.5, 2] },
  { category: 'equipment', thresholds: [3, 6, 9, 12], buffType: 'defencePercent', values: [0.5, 1, 1.5, 2] },
  { category: 'skills', thresholds: [3, 6, 9, 12], buffType: 'maxHp', values: [5, 10, 15, 20] },
  { category: 'gathering', thresholds: [3, 6, 9, 12], buffType: 'skillSpeed', values: [1, 2, 3, 4], skillId: 'gathering' },
  { category: 'crafting', thresholds: [3, 6, 9, 12], buffType: 'skillSpeed', values: [1, 2, 3, 4], skillId: 'crafting' },
  { category: 'cooking', thresholds: [3, 6, 9, 12], buffType: 'skillSpeed', values: [1, 2, 3, 4], skillId: 'cooking' },
  { category: 'alchemy', thresholds: [3, 6, 9, 12], buffType: 'skillSpeed', values: [1, 2, 3, 4], skillId: 'alchemy' },
  { category: 'firemaking', thresholds: [3, 6, 9, 12], buffType: 'skillSpeed', values: [1, 2, 3, 4], skillId: 'firemaking' },
  { category: 'economy', thresholds: [3, 6, 9, 12], buffType: 'goldBonus', values: [0.5, 1, 1.5, 2] },
  { category: 'social', thresholds: [3, 6, 9, 12], buffType: 'xpBonus', values: [0.5, 1, 1.5, 2] },
  { category: 'exploration', thresholds: [3, 6, 9, 12], buffType: 'lootChance', values: [0.5, 1, 1.5, 2] },
  { category: 'dungeons', thresholds: [3, 6, 9, 12], buffType: 'defencePercent', values: [0.5, 1, 1.5, 2] },
  { category: 'general', thresholds: [3, 6, 9, 12], buffType: 'xpBonus', values: [0.5, 1, 1.5, 2] },
];

export interface ActiveAchievementBuff {
  category: string;
  buffType: string;
  value: number;
  currentMilestone: number;
  completedCount: number;
  nextThreshold: number | null;
  skillId?: string;
}

export function calculateAchievementBuffs(completedCountByCategory: Record<string, number>): ActiveAchievementBuff[] {
  const activeBuffs: ActiveAchievementBuff[] = [];

  for (const config of ACHIEVEMENT_MILESTONE_BUFFS) {
    const completedCount = completedCountByCategory[config.category] || 0;

    let milestoneIndex = -1;
    for (let i = config.thresholds.length - 1; i >= 0; i--) {
      if (completedCount >= config.thresholds[i]) {
        milestoneIndex = i;
        break;
      }
    }

    const nextThresholdIndex = milestoneIndex + 1;
    const nextThreshold = nextThresholdIndex < config.thresholds.length
      ? config.thresholds[nextThresholdIndex]
      : null;

    const buff: ActiveAchievementBuff = {
      category: config.category,
      buffType: config.buffType,
      value: milestoneIndex >= 0 ? config.values[milestoneIndex] : 0,
      currentMilestone: milestoneIndex + 1,
      completedCount,
      nextThreshold,
      ...(config.skillId ? { skillId: config.skillId } : {}),
    };

    activeBuffs.push(buff);
  }

  return activeBuffs;
}
