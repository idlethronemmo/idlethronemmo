export type WeaponMasteryType = 'dagger' | 'sword_shield' | '2h_sword' | '2h_axe' | '2h_warhammer' | 'bow' | 'staff';

export const WEAPON_MASTERY_MAX_LEVEL = 99;

const MASTERY_XP_TABLE: number[] = [];
for (let level = 1; level <= WEAPON_MASTERY_MAX_LEVEL; level++) {
  const xpForLevel = Math.floor(level * level * 15 + level * 50);
  MASTERY_XP_TABLE.push(xpForLevel);
}

export function getMasteryLevelFromXp(xp: number): number {
  let totalXp = 0;
  for (let level = 1; level <= WEAPON_MASTERY_MAX_LEVEL; level++) {
    totalXp += MASTERY_XP_TABLE[level - 1];
    if (xp < totalXp) {
      return level;
    }
  }
  return WEAPON_MASTERY_MAX_LEVEL;
}

export function getXpForMasteryLevel(level: number): number {
  if (level <= 1) return 0;
  let totalXp = 0;
  for (let i = 1; i < level && i <= WEAPON_MASTERY_MAX_LEVEL; i++) {
    totalXp += MASTERY_XP_TABLE[i - 1];
  }
  return totalXp;
}

export function getXpToNextMasteryLevel(currentXp: number): { current: number; required: number; progress: number } {
  const currentLevel = getMasteryLevelFromXp(currentXp);
  if (currentLevel >= WEAPON_MASTERY_MAX_LEVEL) {
    return { current: currentXp, required: currentXp, progress: 100 };
  }
  
  const xpForCurrentLevel = getXpForMasteryLevel(currentLevel);
  const xpForNextLevel = getXpForMasteryLevel(currentLevel + 1);
  const xpInCurrentLevel = currentXp - xpForCurrentLevel;
  const xpNeededForLevel = xpForNextLevel - xpForCurrentLevel;
  
  return {
    current: xpInCurrentLevel,
    required: xpNeededForLevel,
    progress: Math.floor((xpInCurrentLevel / xpNeededForLevel) * 100)
  };
}

export function calculateMasteryXpGain(
  monsterLevel: number,
  weaponTier: number,
  isKill: boolean
): number {
  const baseXp = monsterLevel * 1.2;
  const tierMultiplier = 1 + weaponTier * 0.1;
  const killBonus = isKill ? 2.5 : 1;
  
  return Math.floor(baseXp * tierMultiplier * killBonus);
}

export function getWeaponTierFromLevel(levelRequired: number): number {
  if (levelRequired <= 1) return 1;
  if (levelRequired <= 10) return 2;
  if (levelRequired <= 25) return 3;
  if (levelRequired <= 40) return 4;
  if (levelRequired <= 55) return 5;
  if (levelRequired <= 70) return 6;
  if (levelRequired <= 85) return 7;
  return 8;
}

export function mapWeaponCategoryToMasteryType(weaponCategory: string | null | undefined): WeaponMasteryType | null {
  if (!weaponCategory) return null;
  
  switch (weaponCategory.toLowerCase()) {
    case 'dagger':
      return 'dagger';
    case 'sword':
    case 'sword_shield':
      return 'sword_shield';
    case '2h_sword':
    case 'greatsword':
      return '2h_sword';
    case 'axe':
    case '2h_axe':
      return '2h_axe';
    case 'hammer':
    case 'warhammer':
    case '2h_warhammer':
      return '2h_warhammer';
    case 'bow':
      return 'bow';
    case 'staff':
      return 'staff';
    default:
      return null;
  }
}

export function getMasteryFieldName(masteryType: WeaponMasteryType): string {
  switch (masteryType) {
    case 'dagger': return 'masteryDagger';
    case 'sword_shield': return 'masterySwordShield';
    case '2h_sword': return 'mastery2hSword';
    case '2h_axe': return 'mastery2hAxe';
    case '2h_warhammer': return 'mastery2hWarhammer';
    case 'bow': return 'masteryBow';
    case 'staff': return 'masteryStaff';
  }
}

export const MASTERY_TYPE_NAMES: Record<WeaponMasteryType, string> = {
  dagger: 'Dagger',
  sword_shield: 'Sword & Shield',
  '2h_sword': 'Two-Handed Sword',
  '2h_axe': 'Two-Handed Axe',
  '2h_warhammer': 'Warhammer',
  bow: 'Bow',
  staff: 'Staff'
};

export interface PlayerMasteries {
  masteryDagger: number;
  masterySwordShield: number;
  mastery2hSword: number;
  mastery2hAxe: number;
  mastery2hWarhammer: number;
  masteryBow: number;
  masteryStaff: number;
}

export function getPlayerMasteryXp(player: PlayerMasteries, masteryType: WeaponMasteryType): number {
  switch (masteryType) {
    case 'dagger': return player.masteryDagger || 0;
    case 'sword_shield': return player.masterySwordShield || 0;
    case '2h_sword': return player.mastery2hSword || 0;
    case '2h_axe': return player.mastery2hAxe || 0;
    case '2h_warhammer': return player.mastery2hWarhammer || 0;
    case 'bow': return player.masteryBow || 0;
    case 'staff': return player.masteryStaff || 0;
  }
}

export function getPlayerMasteryLevel(player: PlayerMasteries, masteryType: WeaponMasteryType): number {
  const xp = getPlayerMasteryXp(player, masteryType);
  return getMasteryLevelFromXp(xp);
}

export function canEquipWeapon(player: PlayerMasteries, masteryType: WeaponMasteryType, masteryRequired: number): boolean {
  const playerLevel = getPlayerMasteryLevel(player, masteryType);
  return playerLevel >= masteryRequired;
}
