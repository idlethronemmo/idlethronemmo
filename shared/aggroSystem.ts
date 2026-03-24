export interface EquipmentAggroStats {
  critChance?: number;
  critDamage?: number;
  healPower?: number;
  buffPower?: number;
}

export interface AggroModifiers {
  baseAggro: number;
  armorModifier: number;
  weaponModifier: number;
  buffModifier: number;
  totalAggro: number;
}

export interface PartyMember {
  id: string;
  name: string;
  currentHp: number;
  maxHp: number;
  aggro: number;
  isAlive: boolean;
}

export const ARMOR_TYPE_AGGRO: Record<string, number> = {
  plate: 150,
  leather: 80,
  cloth: 40,
  none: 100,
};

export const WEAPON_TYPE_AGGRO: Record<string, number> = {
  sword_shield: 50,
  sword: 50,
  "2h_warhammer": 30,
  hammer: 30,
  "2h_axe": 10,
  battleaxe: 10,
  "2h_sword": 0,
  greatsword: 0,
  spear: 0,
  dagger: -20,
  bow: -30,
  staff: -40,
  none: 0,
};

export function computeAggroMultiplier(armorType: string | null | undefined, weaponType: string | null | undefined): number {
  const armorAggro = ARMOR_TYPE_AGGRO[armorType || 'none'] ?? 100;
  const weaponAggro = WEAPON_TYPE_AGGRO[weaponType || 'none'] ?? 0;
  return (armorAggro / 100) * ((100 + weaponAggro) / 100);
}

export function calculateBaseAggro(armorType: string | undefined): number {
  return ARMOR_TYPE_AGGRO[armorType || "none"] || 100;
}

export function calculateWeaponAggroModifier(weaponType: string | undefined): number {
  return WEAPON_TYPE_AGGRO[weaponType || "none"] || 0;
}

export function calculateTotalAggro(
  equipmentBonuses: EquipmentAggroStats,
  armorType: string | undefined,
  weaponType: string | undefined,
  buffAggroModifier: number = 0
): AggroModifiers {
  const baseAggro = 100;
  const armorModifier = calculateBaseAggro(armorType) - 100;
  const weaponModifier = calculateWeaponAggroModifier(weaponType);
  
  const totalAggro = Math.max(1, baseAggro + armorModifier + weaponModifier + buffAggroModifier);
  
  return {
    baseAggro,
    armorModifier,
    weaponModifier,
    buffModifier: buffAggroModifier,
    totalAggro,
  };
}

export function selectTargetByAggro(partyMembers: PartyMember[]): PartyMember | null {
  const aliveMembers = partyMembers.filter(m => m.isAlive && m.currentHp > 0);
  
  if (aliveMembers.length === 0) {
    return null;
  }
  
  if (aliveMembers.length === 1) {
    return aliveMembers[0];
  }
  
  const totalAggro = aliveMembers.reduce((sum, m) => sum + m.aggro, 0);
  
  if (totalAggro <= 0) {
    return aliveMembers[Math.floor(Math.random() * aliveMembers.length)];
  }
  
  const roll = Math.random() * totalAggro;
  let cumulative = 0;
  
  for (const member of aliveMembers) {
    cumulative += member.aggro;
    if (roll <= cumulative) {
      return member;
    }
  }
  
  return aliveMembers[aliveMembers.length - 1];
}

export function getAggroPercentage(memberAggro: number, totalPartyAggro: number): number {
  if (totalPartyAggro <= 0) return 0;
  return Math.round((memberAggro / totalPartyAggro) * 100);
}

export function getDominantArmorType(
  armorTypesBySlot: Record<string, string | undefined>
): string | undefined {
  const armorTypes: Record<string, number> = {};
  
  for (const armorType of Object.values(armorTypesBySlot)) {
    if (armorType) {
      armorTypes[armorType] = (armorTypes[armorType] || 0) + 1;
    }
  }
  
  let maxCount = 0;
  let dominantType: string | undefined;
  
  for (const [type, count] of Object.entries(armorTypes)) {
    if (count > maxCount) {
      maxCount = count;
      dominantType = type;
    }
  }
  
  return dominantType;
}

export interface AggroItemData {
  armorType?: string;
  weaponType?: string;
}

export function calculateAggroFromItems(items: AggroItemData[]): {
  armorType: string | undefined;
  weaponType: string | undefined;
} {
  let armorType: string | undefined;
  let weaponType: string | undefined;
  
  const armorTypeCounts: Record<string, number> = {};
  
  for (const item of items) {
    if (item.armorType) {
      armorTypeCounts[item.armorType] = (armorTypeCounts[item.armorType] || 0) + 1;
    }
    
    if (item.weaponType) {
      weaponType = item.weaponType;
    }
  }
  
  let maxCount = 0;
  for (const [type, count] of Object.entries(armorTypeCounts)) {
    if (count > maxCount) {
      maxCount = count;
      armorType = type;
    }
  }
  
  return { armorType, weaponType };
}
