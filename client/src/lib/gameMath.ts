// Import and re-export core XP functions from shared module
import { getXpForLevel as sharedGetXpForLevel, getLevelFromXp as sharedGetLevelFromXp } from "@shared/gameMath";

export const getXpForLevel = sharedGetXpForLevel;
export const getLevelFromXp = sharedGetLevelFromXp;

const MAX_LEVEL = 99;

// Get progress percentage to next level
export function getLevelProgress(xp: number): number {
  const currentLevel = getLevelFromXp(xp);
  if (currentLevel >= MAX_LEVEL) return 100;

  const currentLevelXp = getXpForLevel(currentLevel);
  const nextLevelXp = getXpForLevel(currentLevel + 1);
  
  return ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
}

export function formatNumber(num: number): string {
  if (num == null || isNaN(num)) return "0";
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}
