export type BaseRole = 'tank' | 'dps' | 'healer' | 'hybrid';

export interface SubClassPassive {
  name: string;
  description: string;
}

export interface SubClassInfo {
  name: string;
  baseRole: BaseRole;
  color: string;
  icon: string;
  passive: SubClassPassive;
}

const SUB_CLASS_MAP: Record<string, Record<string, SubClassInfo>> = {
  dagger: {
    plate: { name: 'Shadow Knight', baseRole: 'dps', color: '#6c3483', icon: '🗡️', passive: { name: 'Shadow Armor', description: 'Takes 8% less damage while attacking' } },
    leather: { name: 'Shadow Assassin', baseRole: 'dps', color: '#9b59b6', icon: '🗡️', passive: { name: 'Lethal Precision', description: '+10% critical hit chance' } },
    cloth: { name: 'Phantom Blade', baseRole: 'dps', color: '#af7ac5', icon: '🗡️', passive: { name: 'Phantom Strike', description: '15% chance to deal double damage' } },
  },
  sword_shield: {
    plate: { name: 'Guardian', baseRole: 'tank', color: '#2980b9', icon: '🛡️', passive: { name: 'Fortress', description: 'Absorbs 12% of damage dealt to allies' } },
    leather: { name: 'Duelist', baseRole: 'tank', color: '#3498db', icon: '🛡️', passive: { name: 'Riposte', description: '10% chance to counter-attack when hit' } },
    cloth: { name: 'Templar', baseRole: 'tank', color: '#5dade2', icon: '🛡️', passive: { name: 'Holy Shield', description: 'Heals self for 5% of damage blocked' } },
  },
  '2h_sword': {
    plate: { name: 'Warlord', baseRole: 'dps', color: '#c0392b', icon: '⚔️', passive: { name: 'Iron Will', description: '+10% max HP and stun resistance' } },
    leather: { name: 'Blademaster', baseRole: 'dps', color: '#e74c3c', icon: '⚔️', passive: { name: 'Swift Strikes', description: '+8% attack speed' } },
    cloth: { name: 'Spellsword', baseRole: 'hybrid', color: '#ec7063', icon: '⚔️', passive: { name: 'Arcane Edge', description: 'Attacks deal 12% bonus magic damage' } },
  },
  '2h_axe': {
    plate: { name: 'Juggernaut', baseRole: 'dps', color: '#d35400', icon: '🪓', passive: { name: 'Unstoppable', description: 'Takes 10% less damage below 40% HP' } },
    leather: { name: 'Ravager', baseRole: 'dps', color: '#e67e22', icon: '🪓', passive: { name: 'Bloodlust', description: '5% lifesteal on all attacks' } },
    cloth: { name: 'Runic Cleaver', baseRole: 'hybrid', color: '#f0b27a', icon: '🪓', passive: { name: 'Runic Surge', description: 'Every 5th attack deals 30% bonus damage' } },
  },
  '2h_warhammer': {
    plate: { name: 'Ironclad', baseRole: 'tank', color: '#d4ac0d', icon: '🔨', passive: { name: 'Unyielding', description: '15% damage reduction and immune to knockback' } },
    leather: { name: 'Earthshaker', baseRole: 'dps', color: '#f1c40f', icon: '🔨', passive: { name: 'Aftershock', description: '20% chance attacks stagger the enemy' } },
    cloth: { name: 'Stormcaller', baseRole: 'hybrid', color: '#f9e79f', icon: '🔨', passive: { name: 'Thunder Clap', description: 'Attacks have 10% chance to chain to nearby foes' } },
  },
  bow: {
    plate: { name: 'Iron Archer', baseRole: 'dps', color: '#1e8449', icon: '🏹', passive: { name: 'Heavy Draw', description: '+8% damage and reduced knockback taken' } },
    leather: { name: 'Ranger', baseRole: 'dps', color: '#2ecc71', icon: '🏹', passive: { name: 'Eagle Eye', description: '+12% accuracy and critical hit chance' } },
    cloth: { name: 'Arcane Archer', baseRole: 'hybrid', color: '#82e0aa', icon: '🏹', passive: { name: 'Enchanted Arrows', description: 'Arrows deal 15% bonus elemental damage' } },
  },
  staff: {
    plate: { name: 'Paladin', baseRole: 'healer', color: '#1abc9c', icon: '🪄', passive: { name: 'Divine Protection', description: 'Heals are 15% more effective on low HP targets' } },
    leather: { name: 'Druid', baseRole: 'healer', color: '#27ae60', icon: '🪄', passive: { name: "Nature's Gift", description: 'Heals also grant a small regeneration effect' } },
    cloth: { name: 'Arch Mage', baseRole: 'healer', color: '#8e44ad', icon: '🪄', passive: { name: 'Arcane Surge', description: '+20% bonus healing power' } },
  },
};

const DEFAULT_SUB_CLASS: SubClassInfo = {
  name: 'Adventurer',
  baseRole: 'dps',
  color: '#95a5a6',
  icon: '⚔️',
  passive: { name: 'Versatility', description: 'Jack of all trades — no specialized bonus' },
};

export function getSubClass(weaponType: string | null | undefined, armorType: string | null | undefined): SubClassInfo {
  if (!weaponType) return DEFAULT_SUB_CLASS;
  const weaponMap = SUB_CLASS_MAP[weaponType];
  if (!weaponMap) return DEFAULT_SUB_CLASS;
  if (!armorType) return weaponMap['leather'] || DEFAULT_SUB_CLASS;
  return weaponMap[armorType] || weaponMap['leather'] || DEFAULT_SUB_CLASS;
}

export function getBaseRoleFromSubClass(subClass: SubClassInfo): 'tank' | 'dps' | 'healer' | 'hybrid' {
  return subClass.baseRole;
}

export function getBaseRoleIcon(baseRole: BaseRole): string {
  switch (baseRole) {
    case 'tank': return '🛡️';
    case 'dps': return '⚔️';
    case 'healer': return '💚';
    case 'hybrid': return '⚡';
    default: return '⚔️';
  }
}

export function getAllSubClasses(): SubClassInfo[] {
  const result: SubClassInfo[] = [];
  for (const weaponMap of Object.values(SUB_CLASS_MAP)) {
    for (const subClass of Object.values(weaponMap)) {
      result.push(subClass);
    }
  }
  return result;
}
