export interface DungeonWeaponRole {
  weaponType: string;
  roleName: string;
  roleColor: string;
  passiveName: string;
  passiveDescription: string;
  passiveIcon: string;
}

export interface AssassinPassive {
  evasionChance: number;
}

export interface GuardianPassive {
  partyShieldPercent: number;
}

export interface BerserkerPassive {
  frenzyThreshold: number;
  frenzyDpsBoost: number;
}

export interface ExecutionerPassive {
  executeThreshold: number;
  executeDmgBoost: number;
}

export interface WardenPassive {
  disruptionChance: number;
}

export interface RangerPassive {
  silenceAfterHits: number;
  silenceChance: number;
  silenceDuration: number;
}

export interface HealerPassive {
  healEfficiencyBase: number;
}

export type DungeonPassiveParams =
  | AssassinPassive
  | GuardianPassive
  | BerserkerPassive
  | ExecutionerPassive
  | WardenPassive
  | RangerPassive
  | HealerPassive;

export const DUNGEON_WEAPON_ROLES: Record<string, DungeonWeaponRole> = {
  dagger: {
    weaponType: 'dagger',
    roleName: 'Assassin',
    roleColor: '#9b59b6',
    passiveName: 'Evasion',
    passiveDescription: '15% chance to dodge monster attacks entirely',
    passiveIcon: '🗡️',
  },
  sword_shield: {
    weaponType: 'sword_shield',
    roleName: 'Guardian',
    roleColor: '#3498db',
    passiveName: 'Party Shield',
    passiveDescription: 'Absorbs first 10% of damage dealt to allies per floor',
    passiveIcon: '🛡️',
  },
  '2h_sword': {
    weaponType: '2h_sword',
    roleName: 'Berserker',
    roleColor: '#e74c3c',
    passiveName: 'Frenzy',
    passiveDescription: 'DPS +20% when below 50% HP',
    passiveIcon: '⚔️',
  },
  '2h_axe': {
    weaponType: '2h_axe',
    roleName: 'Executioner',
    roleColor: '#e67e22',
    passiveName: 'Execute',
    passiveDescription: '+50% damage when monster below 30% HP',
    passiveIcon: '🪓',
  },
  '2h_warhammer': {
    weaponType: '2h_warhammer',
    roleName: 'Warden',
    roleColor: '#f1c40f',
    passiveName: 'Disruption',
    passiveDescription: '25% chance monster skill fails',
    passiveIcon: '🔨',
  },
  bow: {
    weaponType: 'bow',
    roleName: 'Ranger',
    roleColor: '#2ecc71',
    passiveName: 'Silence Shot',
    passiveDescription: 'After 3 attacks, 40% chance to silence monster 1 skill cycle',
    passiveIcon: '🏹',
  },
  staff: {
    weaponType: 'staff',
    roleName: 'Healer',
    roleColor: '#1abc9c',
    passiveName: 'Restoration',
    passiveDescription: 'Heals allies based on heal efficiency',
    passiveIcon: '🪄',
  },
};

export const DUNGEON_ROLE_PASSIVES: Record<string, DungeonPassiveParams> = {
  dagger: { evasionChance: 0.15 } as AssassinPassive,
  sword_shield: { partyShieldPercent: 0.10 } as GuardianPassive,
  '2h_sword': { frenzyThreshold: 0.50, frenzyDpsBoost: 0.20 } as BerserkerPassive,
  '2h_axe': { executeThreshold: 0.30, executeDmgBoost: 0.50 } as ExecutionerPassive,
  '2h_warhammer': { disruptionChance: 0.25 } as WardenPassive,
  bow: { silenceAfterHits: 3, silenceChance: 0.40, silenceDuration: 1 } as RangerPassive,
  staff: { healEfficiencyBase: 0.60 } as HealerPassive,
};

export function getDungeonRole(weaponType: string | null | undefined): DungeonWeaponRole | null {
  if (!weaponType) return null;
  return DUNGEON_WEAPON_ROLES[weaponType] || null;
}

export function getDungeonPassive(weaponType: string | null | undefined): DungeonPassiveParams | null {
  if (!weaponType) return null;
  return DUNGEON_ROLE_PASSIVES[weaponType] || null;
}
