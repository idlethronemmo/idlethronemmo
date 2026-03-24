// Party bonus calculations for client-side party combat system

export interface PartyMemberStatus {
  playerId: string;
  playerName: string;
  currentRegion: string | null;
  currentMonsterId: string | null;
  isInCombat: number;
}

// Same monster bonus scaling: 2 players = +15% DPS, +10% Defense
// 3 players = +25% DPS, +20% Defense
// 4 players = +40% DPS, +30% Defense
// 5 players = +50% DPS, +40% Defense
export function calculateSameMonsterBonus(
  myMonsterId: string | null,
  myRegion: string | null,
  partyMembers: PartyMemberStatus[],
  myPlayerId: string
): { dpsBonus: number; defenseBonus: number; sameMonsterCount: number } {
  if (!myMonsterId || !myRegion) {
    return { dpsBonus: 0, defenseBonus: 0, sameMonsterCount: 0 };
  }

  // Count how many party members are fighting the same monster
  const sameMonsterCount = partyMembers.filter(m => 
    m.playerId !== myPlayerId && 
    m.currentMonsterId === myMonsterId && 
    m.currentRegion === myRegion && 
    m.isInCombat === 1
  ).length;

  if (sameMonsterCount === 0) {
    return { dpsBonus: 0, defenseBonus: 0, sameMonsterCount: 0 };
  }

  // Scaling based on number of players fighting same monster
  const bonusTable: { [key: number]: { dps: number; defense: number } } = {
    1: { dps: 0.15, defense: 0.10 },  // 2 players total (you + 1)
    2: { dps: 0.25, defense: 0.20 },  // 3 players total
    3: { dps: 0.40, defense: 0.30 },  // 4 players total
    4: { dps: 0.50, defense: 0.40 },  // 5 players total (max)
  };

  const bonus = bonusTable[Math.min(sameMonsterCount, 4)] || bonusTable[4];
  
  return {
    dpsBonus: bonus.dps,
    defenseBonus: bonus.defense,
    sameMonsterCount: sameMonsterCount + 1  // Include self
  };
}

// Skill sharing chance - happens every time a skill triggers
export interface SharedSkillEvent {
  fromPlayerId: string;
  fromPlayerName: string;
  skillName: string;
  skillDamage: number;
  skillEffect: string;  // 'damage' | 'heal' | 'lifesteal' | 'debuff'
  skillChance: number;  // Original skill trigger chance (e.g., 0.25 for 25%)
  timestamp: number;
}

// Loot sharing calculation
// Different monster: 7% chance
// Same monster: 12% chance
export function calculateLootShareChance(
  myMonsterId: string | null,
  myRegion: string | null,
  lootDropperMonsterId: string | null,
  lootDropperRegion: string | null
): number {
  if (!myMonsterId || !myRegion || !lootDropperMonsterId || !lootDropperRegion) {
    return 0;
  }
  
  if (myMonsterId === lootDropperMonsterId && myRegion === lootDropperRegion) {
    return 0.12; // 12% for same monster
  }
  
  return 0.07; // 7% for different monster in party
}

// Skill sharing calculation
// Party member skills can trigger on your monster
// Chance is ~55% of the original skill trigger chance
export const PARTY_SKILL_SHARE_MULTIPLIER = 0.55;

// Calculate if a party member's skill should trigger on your monster
export function shouldTriggerSharedSkill(
  originalSkillChance: number,
  isSameMonster: boolean
): boolean {
  // If same monster, slightly higher chance
  const bonusMultiplier = isSameMonster ? 1.15 : 1.0;
  const chance = originalSkillChance * PARTY_SKILL_SHARE_MULTIPLIER * bonusMultiplier;
  return Math.random() < chance;
}

export interface SharedLootEvent {
  fromPlayerId: string;
  fromPlayerName: string;
  itemId: string;
  itemName: string;
  itemRarity: string;
  timestamp: number;
}

// Party skill sharing by weapon type - each weapon type has representative skills
// These are used when a party member is in combat to randomly trigger skills
export interface PartySkillTemplate {
  name: string;
  type: 'damage' | 'heal' | 'buff' | 'debuff' | 'stun' | 'poison' | 'critical';
  chance: number; // Base chance to trigger (0-1)
  damageMultiplier?: number;
  healPercent?: number;
  buffType?: string;
  duration?: number;
}

// Weapon type to skill templates - used for party skill sharing
export const WEAPON_TYPE_SKILLS: Record<string, PartySkillTemplate[]> = {
  dagger: [
    { name: "Shadow Strike", type: "critical", chance: 0.15, damageMultiplier: 2.0 },
    { name: "Venom Strike", type: "poison", chance: 0.12, damageMultiplier: 0.5, duration: 6 },
  ],
  sword: [
    { name: "Death Combo", type: "damage", chance: 0.12, damageMultiplier: 1.5 },
    { name: "Ice Strike", type: "stun", chance: 0.08, damageMultiplier: 1.0 },
  ],
  sword_shield: [
    { name: "Shield Bash", type: "stun", chance: 0.10, damageMultiplier: 0.8 },
    { name: "Counter Attack", type: "damage", chance: 0.15, damageMultiplier: 1.2 },
  ],
  "2h_sword": [
    { name: "Void Strike", type: "critical", chance: 0.12, damageMultiplier: 2.5 },
    { name: "Dragon Rage", type: "damage", chance: 0.10, damageMultiplier: 1.8 },
  ],
  "2h_axe": [
    { name: "Brutal Cleave", type: "debuff", chance: 0.15, damageMultiplier: 1.3 },
    { name: "Rending Cut", type: "critical", chance: 0.10, damageMultiplier: 2.0 },
  ],
  axe: [
    { name: "Brutal Cleave", type: "debuff", chance: 0.15, damageMultiplier: 1.3 },
    { name: "Rending Cut", type: "critical", chance: 0.10, damageMultiplier: 2.0 },
  ],
  "2h_warhammer": [
    { name: "Earthquake", type: "stun", chance: 0.12, damageMultiplier: 1.0 },
    { name: "Crushing Blow", type: "critical", chance: 0.08, damageMultiplier: 2.2 },
  ],
  hammer: [
    { name: "Earthquake", type: "stun", chance: 0.12, damageMultiplier: 1.0 },
    { name: "Crushing Blow", type: "critical", chance: 0.08, damageMultiplier: 2.2 },
  ],
  bow: [
    { name: "Precise Shot", type: "critical", chance: 0.15, damageMultiplier: 2.0 },
    { name: "Rain of Arrows", type: "damage", chance: 0.10, damageMultiplier: 1.5 },
  ],
  staff: [
    { name: "Healing Light", type: "heal", chance: 0.20, healPercent: 0.15 },
    { name: "Fireball", type: "damage", chance: 0.12, damageMultiplier: 1.8 },
    { name: "Regeneration", type: "buff", chance: 0.10, buffType: "regen", duration: 5 },
  ],
};

// Get a random skill for a weapon type, or null if no skills defined
export function getRandomPartySkill(weaponType: string): PartySkillTemplate | null {
  const skills = WEAPON_TYPE_SKILLS[weaponType];
  if (!skills || skills.length === 0) return null;
  return skills[Math.floor(Math.random() * skills.length)];
}

// Roll to see if a party skill should trigger
// Returns the skill if it triggers, null otherwise
export function rollPartySkill(weaponType: string, isSameMonster: boolean): PartySkillTemplate | null {
  const skill = getRandomPartySkill(weaponType);
  if (!skill) return null;
  
  // Apply party share multiplier and same monster bonus
  const bonusMultiplier = isSameMonster ? 1.15 : 1.0;
  const finalChance = skill.chance * PARTY_SKILL_SHARE_MULTIPLIER * bonusMultiplier;
  
  if (Math.random() < finalChance) {
    return skill;
  }
  return null;
}
