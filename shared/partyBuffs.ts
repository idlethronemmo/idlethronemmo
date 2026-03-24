// Party passive buffs based on weapon types

export interface PartyPassiveBuffs {
  foodHealBonus: number;      // Healer bonus: yemekler X% daha fazla HP verir
  defenseBonus: number;       // Tank bonus: defense X% artar
  attackBonus: number;        // DPS bonus: attack X% artar
  attackSpeedBonus: number;   // Staff bonus: attack speed X% artar
  hasHealer: boolean;
  hasTank: boolean;
  hasDps: boolean;
}

// Staff equipment bonuses interface
export interface StaffEquipmentBuffs {
  partyDpsBuff: number;
  partyDefenceBuff: number;
  partyAttackSpeedBuff: number;
  lootChanceBonus: number;
  onHitHealingPercent: number;
  buffDurationBonus: number;
}

// Weapon type to role mapping
export function getWeaponRole(weaponType: string | null | undefined): 'healer' | 'tank' | 'dps' | null {
  if (!weaponType) return null;
  
  switch (weaponType) {
    case 'staff':
      return 'healer';
    case 'sword_shield':
    case '2h_warhammer':
      return 'tank';
    case 'dagger':
    case '2h_sword':
    case '2h_axe':
    case 'bow':
      return 'dps';
    default:
      return 'dps';
  }
}

// Calculate party passive buffs based on members' weapons
export function calculatePartyPassiveBuffs(memberWeaponTypes: (string | null)[]): PartyPassiveBuffs {
  let hasHealer = false;
  let hasTank = false;
  let hasDps = false;
  let healerCount = 0;
  let tankCount = 0;
  let dpsCount = 0;
  
  for (const weaponType of memberWeaponTypes) {
    const role = getWeaponRole(weaponType);
    if (role === 'healer') {
      hasHealer = true;
      healerCount++;
    } else if (role === 'tank') {
      hasTank = true;
      tankCount++;
    } else if (role === 'dps') {
      hasDps = true;
      dpsCount++;
    }
  }
  
  // Bonus values (stack with multiple of same role, diminishing returns)
  // First healer: +20% food heal, second: +10%, third+: +5%
  // First tank: +15% defense, second: +7%, third+: +3%
  // First dps: +10% attack, second: +5%, third+: +2%
  
  let foodHealBonus = 0;
  for (let i = 0; i < healerCount; i++) {
    if (i === 0) foodHealBonus += 0.20;
    else if (i === 1) foodHealBonus += 0.10;
    else foodHealBonus += 0.05;
  }
  
  let defenseBonus = 0;
  for (let i = 0; i < tankCount; i++) {
    if (i === 0) defenseBonus += 0.15;
    else if (i === 1) defenseBonus += 0.07;
    else defenseBonus += 0.03;
  }
  
  let attackBonus = 0;
  for (let i = 0; i < dpsCount; i++) {
    if (i === 0) attackBonus += 0.10;
    else if (i === 1) attackBonus += 0.05;
    else attackBonus += 0.02;
  }
  
  return {
    foodHealBonus,
    defenseBonus,
    attackBonus,
    attackSpeedBonus: 0,
    hasHealer,
    hasTank,
    hasDps
  };
}

// Calculate party passive buffs including staff equipment bonuses
export function calculatePartyPassiveBuffsWithEquipment(
  memberWeaponTypes: (string | null)[],
  staffBuffs: StaffEquipmentBuffs[]
): PartyPassiveBuffs {
  const baseBuffs = calculatePartyPassiveBuffs(memberWeaponTypes);
  
  let totalPartyDpsBuff = 0;
  let totalPartyDefenceBuff = 0;
  let totalPartyAttackSpeedBuff = 0;
  
  for (const buff of staffBuffs) {
    totalPartyDpsBuff += buff.partyDpsBuff || 0;
    totalPartyDefenceBuff += buff.partyDefenceBuff || 0;
    totalPartyAttackSpeedBuff += buff.partyAttackSpeedBuff || 0;
  }
  
  return {
    foodHealBonus: baseBuffs.foodHealBonus,
    defenseBonus: baseBuffs.defenseBonus + (totalPartyDefenceBuff / 100),
    attackBonus: baseBuffs.attackBonus + (totalPartyDpsBuff / 100),
    attackSpeedBonus: totalPartyAttackSpeedBuff / 100,
    hasHealer: baseBuffs.hasHealer,
    hasTank: baseBuffs.hasTank,
    hasDps: baseBuffs.hasDps
  };
}

// For offline loot sharing - calculate loot based on party kills
export interface PartyKillsForLoot {
  playerId: string;
  playerName: string;
  monsterId: string;
  monsterName: string;
  killCount: number;
  regionId: string;
}

// Loot share chance for offline party kills
// Same region/monster as you: 10%, different: 5%
export function calculateOfflineLootShareChance(
  myMonsterId: string | null,
  myRegion: string | null,
  killMonsterId: string,
  killRegion: string
): number {
  if (!myMonsterId || !myRegion) return 0.05;
  
  if (myMonsterId === killMonsterId && myRegion === killRegion) {
    return 0.10;
  }
  return 0.05;
}
