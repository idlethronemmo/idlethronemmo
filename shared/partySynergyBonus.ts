// Party skill synergy bonus system
// When party members are doing the same skill, they receive speed and XP bonuses

export interface PartySynergyBonuses {
  speedBonus: number;      // Percentage speed bonus (0-10%)
  xpBonus: number;         // Percentage XP bonus (0-6%)
  membersDoingSameSkill: number;  // Count of members doing same skill (including self)
  skillId: string | null;  // The skill that has synergy, or null if no synergy
}

// Speed bonus table (2+ members doing same skill)
// Returns percentage as decimal (e.g., 0.03 = 3%)
const SPEED_BONUS_TABLE: Record<number, number> = {
  2: 0.03,   // 2 members: 3% speed bonus
  3: 0.05,   // 3 members: 5% speed bonus
  4: 0.07,   // 4 members: 7% speed bonus
  5: 0.10,   // 5 members: 10% speed bonus (max party size)
};

// XP bonus table (3+ members doing same skill)
// Returns percentage as decimal (e.g., 0.02 = 2%)
const XP_BONUS_TABLE: Record<number, number> = {
  3: 0.02,   // 3 members: 2% XP bonus
  4: 0.04,   // 4 members: 4% XP bonus
  5: 0.06,   // 5 members: 6% XP bonus (max party size)
};

export interface PartyMemberSkillStatus {
  playerId: string;
  playerName: string;
  currentSkill: string | null;
  currentRegion: string | null;
}

/**
 * Calculate synergy bonuses based on party members doing the same skill
 * @param mySkillId - The skill I'm currently doing
 * @param partyMembers - Array of party member skill statuses
 * @param myPlayerId - My player ID (to exclude self from count calculation)
 * @returns Synergy bonuses object
 */
export function calculateSkillSynergyBonus(
  mySkillId: string | null,
  partyMembers: PartyMemberSkillStatus[],
  myPlayerId: string,
  myRegion?: string | null
): PartySynergyBonuses {
  if (!mySkillId) {
    return { speedBonus: 0, xpBonus: 0, membersDoingSameSkill: 0, skillId: null };
  }

  const othersDoingSameSkill = partyMembers.filter(m => 
    m.playerId !== myPlayerId && 
    m.currentSkill === mySkillId &&
    (myRegion != null && m.currentRegion != null && m.currentRegion === myRegion)
  ).length;

  if (othersDoingSameSkill === 0) {
    return { speedBonus: 0, xpBonus: 0, membersDoingSameSkill: 1, skillId: mySkillId };
  }

  // Total members doing same skill (including self)
  const totalMembers = othersDoingSameSkill + 1;
  const cappedMembers = Math.min(totalMembers, 5);

  // Look up bonuses from tables
  const speedBonus = SPEED_BONUS_TABLE[cappedMembers] || 0;
  const xpBonus = XP_BONUS_TABLE[cappedMembers] || 0;

  return {
    speedBonus,
    xpBonus,
    membersDoingSameSkill: totalMembers,
    skillId: mySkillId,
  };
}

/**
 * Apply speed bonus to task duration
 * Speed bonus reduces time, so we divide by (1 + bonus)
 * @param baseDuration - Base task duration in milliseconds
 * @param speedBonus - Speed bonus as decimal (e.g., 0.03 = 3%)
 * @returns Adjusted duration in milliseconds
 */
export function applySpeedBonus(baseDuration: number, speedBonus: number): number {
  if (speedBonus <= 0) return baseDuration;
  // Speed bonus reduces time: duration / (1 + speedBonus)
  return Math.floor(baseDuration / (1 + speedBonus));
}

/**
 * Apply XP bonus to base XP reward
 * @param baseXp - Base XP reward
 * @param xpBonus - XP bonus as decimal (e.g., 0.02 = 2%)
 * @returns Adjusted XP reward
 */
export function applyXpBonus(baseXp: number, xpBonus: number): number {
  if (xpBonus <= 0) return baseXp;
  return Math.floor(baseXp * (1 + xpBonus));
}

/**
 * Format synergy bonus for display in UI
 * @param bonuses - The synergy bonuses
 * @returns Human-readable string or null if no bonuses
 */
export function formatSynergyBonus(bonuses: PartySynergyBonuses): string | null {
  if (bonuses.membersDoingSameSkill < 2) {
    return null;
  }

  const parts: string[] = [];
  
  if (bonuses.speedBonus > 0) {
    parts.push(`+${Math.round(bonuses.speedBonus * 100)}% Speed`);
  }
  
  if (bonuses.xpBonus > 0) {
    parts.push(`+${Math.round(bonuses.xpBonus * 100)}% XP`);
  }

  if (parts.length === 0) {
    return null;
  }

  return `Party Synergy (${bonuses.membersDoingSameSkill}): ${parts.join(', ')}`;
}

/**
 * Format a bonus percentage for display (e.g., 0.03 -> "3%")
 */
export function formatBonusPercent(bonus: number): string {
  return `${Math.round(bonus * 100)}%`;
}

/**
 * Get skill name from skill ID for display
 * Maps skill IDs to human-readable names
 */
export function getSkillDisplayName(skillId: string): string {
  const skillNames: Record<string, string> = {
    mining: 'Mining',
    woodcutting: 'Woodcutting',
    fishing: 'Fishing',
    hunting: 'Hunting',
    alchemy: 'Alchemy',
    smithing: 'Smithing',
    cooking: 'Cooking',
    crafting: 'Crafting',
    attack: 'Attack',
    strength: 'Strength',
    defence: 'Defence',
    hitpoints: 'Hitpoints',
  };
  return skillNames[skillId] || skillId.charAt(0).toUpperCase() + skillId.slice(1);
}
