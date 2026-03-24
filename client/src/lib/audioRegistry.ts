export interface AudioEntry {
  src: string;
  volume: number;
  loop?: boolean;
}

export interface WeaponAudioSet {
  variants: AudioEntry[];
}

export const MONSTER_HIT_SFX: AudioEntry[] = [
  { src: '/audio/Custom/Hit_01.wav', volume: 0.7 },
  { src: '/audio/Custom/Hit_02.wav', volume: 0.7 },
  { src: '/audio/Custom/Hit_03.wav', volume: 0.7 },
];

export type WeaponCategory = 'sword' | 'axe' | 'dagger' | 'hammer' | 'bow' | 'staff';

export const WEAPON_SFX: Record<WeaponCategory, WeaponAudioSet> = {
  sword: {
    variants: [
      { src: '/audio/Custom/Weapons/Sword_01.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Sword_02.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Sword_03.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Sword_04.ogg', volume: 0.7 },
    ],
  },
  axe: {
    variants: [
      { src: '/audio/Custom/Weapons/Axe_01.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Axe_02.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Axe_03.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Axe_04.ogg', volume: 0.7 },
    ],
  },
  dagger: {
    variants: [
      { src: '/audio/Custom/Weapons/Dagger_01.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Dagger_02.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Dagger_03.ogg', volume: 0.7 },
    ],
  },
  hammer: {
    variants: [
      { src: '/audio/Custom/Weapons/Hammer_01.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Hammer_02.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Hammer_03.ogg', volume: 0.7 },
    ],
  },
  bow: {
    variants: [
      { src: '/audio/Custom/Weapons/Bow_01.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Bow_02.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Bow_03.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Bow_04.ogg', volume: 0.7 },
    ],
  },
  staff: {
    variants: [
      { src: '/audio/Custom/Weapons/Staff_01.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Staff_02.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Staff_03.ogg', volume: 0.7 },
      { src: '/audio/Custom/Weapons/Staff_04.ogg', volume: 0.7 },
    ],
  },
};

export const WEAPON_CATEGORY_MAP: Record<string, WeaponCategory> = {
  sword: 'sword',
  '2h_sword': 'sword',
  axe: 'axe',
  '2h_axe': 'axe',
  dagger: 'dagger',
  hammer: 'hammer',
  '2h_warhammer': 'hammer',
  bow: 'bow',
  staff: 'staff',
};

export const AUDIO_REGISTRY = {
  music: {
    theme: { src: '/audio/Custom/ThemeMusic_01.ogg', volume: 0.35, loop: true },
  },
  ambient: {
    fishing:     { src: '/audio/Custom/Skills/Fishing.ogg',     volume: 0.4,  loop: true },
    woodcutting: { src: '/audio/Custom/Skills/Woodcutting.ogg', volume: 0.4,  loop: true },
    mining:      { src: '/audio/Custom/Skills/Mining.ogg',      volume: 0.4,  loop: true },
    hunting:     { src: '/audio/Custom/Skills/Hunting.ogg',     volume: 0.4,  loop: true },
    cooking:     { src: '/audio/Custom/Skills/Cooking.ogg',     volume: 0.4,  loop: true },
    firemaking:  { src: '/audio/Custom/Skills/Firemaking.ogg',  volume: 0.4,  loop: true },
    crafting:    { src: '/audio/Custom/Skills/Crafting.ogg',    volume: 0.4,  loop: true },
    alchemy:     { src: '/audio/Custom/Skills/Alchemy.ogg',     volume: 0.4,  loop: true },
    enhancement: { src: '/audio/Custom/Skills/Crafting.ogg',    volume: 0.4,  loop: true },
  },
  sfx: {
    playerSkills: {
      earthquake:        { src: '/audio/sfx/combat/earthquake.ogg',         volume: 0.85 },
      venom_strike:      { src: '/audio/sfx/combat/venom-strike.ogg',       volume: 0.75 },
      death_combo:       { src: '/audio/sfx/combat/death-combo.ogg',        volume: 0.85 },
      shadow_strike:     { src: '/audio/sfx/combat/shadow-strike.ogg',      volume: 0.8  },
      brutal_cleave:     { src: '/audio/sfx/combat/brutal-cleave.ogg',      volume: 0.85 },
      crushing_blow:     { src: '/audio/sfx/combat/crushing-blow.ogg',      volume: 0.85 },
      lifesteal_burst:   { src: '/audio/sfx/combat/lifesteal-burst.ogg',    volume: 0.8  },
      meteor_strike:     { src: '/audio/sfx/combat/meteor-strike.ogg',      volume: 0.9  },
      frost_nova:        { src: '/audio/sfx/combat/frost-nova.ogg',         volume: 0.8  },
      thunder_strike:    { src: '/audio/sfx/combat/thunder-strike.ogg',     volume: 0.85 },
      inferno_blast:     { src: '/audio/sfx/combat/inferno-blast.ogg',      volume: 0.9  },
      void_strike:       { src: '/audio/sfx/combat/void-strike.ogg',        volume: 0.85 },
      crypt_shot:        { src: '/audio/sfx/combat/crypt-shot.ogg',         volume: 0.75 },
      bone_scrape:       { src: '/audio/sfx/combat/bone-scrape.ogg',        volume: 0.75 },
      soulfire_arrow:    { src: '/audio/sfx/combat/soulfire-arrow.ogg',     volume: 0.8  },
      phantom_slash:     { src: '/audio/sfx/combat/phantom-slash.ogg',      volume: 0.8  },
      poison:            { src: '/audio/sfx/combat/poison.ogg',             volume: 0.7  },
      burn:              { src: '/audio/sfx/combat/burn.ogg',               volume: 0.7  },
      bleed:             { src: '/audio/sfx/combat/bleed.ogg',              volume: 0.7  },
      stun:              { src: '/audio/sfx/combat/stun.ogg',               volume: 0.7  },
      freeze:            { src: '/audio/sfx/combat/freeze.ogg',             volume: 0.7  },
      vampiric:          { src: '/audio/sfx/combat/vampiric.ogg',           volume: 0.75 },
      execute:           { src: '/audio/sfx/combat/execute.ogg',            volume: 0.85 },
      armor_pierce:      { src: '/audio/sfx/combat/armor-pierce.ogg',       volume: 0.75 },
    },
    monsterSkills: {
      fire_breath:       { src: '/audio/sfx/monsters/fire-breath.ogg',      volume: 0.9  },
      dragon_fire_breath:{ src: '/audio/sfx/monsters/dragon-fire-breath.ogg', volume: 0.9 },
      earthquake:        { src: '/audio/sfx/monsters/earthquake.ogg',       volume: 0.85 },
      venomous_bite:     { src: '/audio/sfx/monsters/venomous-bite.ogg',    volume: 0.8  },
      sandstorm:         { src: '/audio/sfx/monsters/sandstorm.ogg',        volume: 0.85 },
      void_pulse:        { src: '/audio/sfx/monsters/void-pulse.ogg',       volume: 0.85 },
      soul_drain:        { src: '/audio/sfx/monsters/soul-drain.ogg',       volume: 0.85 },
      howling_wail:      { src: '/audio/sfx/monsters/howling-wail.ogg',     volume: 0.85 },
      troll_smash:       { src: '/audio/sfx/monsters/troll-smash.ogg',      volume: 0.9  },
      multi_head_strike: { src: '/audio/sfx/monsters/multi-head-strike.ogg', volume: 0.85 },
      natures_wrath:     { src: '/audio/sfx/monsters/natures-wrath.ogg',    volume: 0.85 },
      goblin_frenzy:     { src: '/audio/sfx/monsters/goblin-frenzy.ogg',    volume: 0.8  },
      war_cry:           { src: '/audio/sfx/monsters/war-cry.ogg',          volume: 0.85 },
      monster_poison:    { src: '/audio/sfx/monsters/monster-poison.ogg',   volume: 0.75 },
      monster_burn:      { src: '/audio/sfx/monsters/monster-burn.ogg',     volume: 0.75 },
      monster_bleed:     { src: '/audio/sfx/monsters/monster-bleed.ogg',    volume: 0.75 },
      monster_stun:      { src: '/audio/sfx/monsters/monster-stun.ogg',     volume: 0.75 },
      monster_freeze:    { src: '/audio/sfx/monsters/monster-freeze.ogg',   volume: 0.75 },
    },
    combat: {
      miss:          { src: '/audio/sfx/combat/miss.ogg',           volume: 0.6  },
      player_death:  { src: '/audio/sfx/combat/player-death.ogg',  volume: 0.85 },
      monster_death: { src: '/audio/sfx/combat/monster-death.ogg', volume: 0.8  },
    },
    ui: {
      click:        { src: '/audio/Custom/UI/Click.ogg',          volume: 0.5  },
      dialog_open:  { src: '/audio/sfx/ui/dialog-open.ogg',    volume: 0.5  },
      dialog_close: { src: '/audio/sfx/ui/dialog-close.ogg',   volume: 0.4  },
      tab_switch:   { src: '/audio/Custom/UI/Click.ogg',     volume: 0.4  },
      buy:          { src: '/audio/Custom/UI/Buy.ogg',         volume: 0.6  },
      notification: { src: '/audio/Custom/UI/Notification.ogg', volume: 0.55 },
    },
    loot: {
      normal:  { src: '/audio/sfx/loot/loot-normal.ogg',  volume: 0.6  },
      rare:    { src: '/audio/sfx/loot/loot-rare.ogg',    volume: 0.7  },
      epic:    { src: '/audio/sfx/loot/loot-epic.ogg',    volume: 0.75 },
      mythic:  { src: '/audio/sfx/loot/loot-mythic.ogg',  volume: 0.85 },
      collect_pop_1: { src: '/audio/Custom/Skills/CollectPop/Collect_01.ogg', volume: 0.65 },
      collect_pop_2: { src: '/audio/Custom/Skills/CollectPop/Collect_02.ogg', volume: 0.65 },
      collect_pop_3: { src: '/audio/Custom/Skills/CollectPop/Collect_03.ogg', volume: 0.65 },
    },
    progression: {
      level_up:       { src: '/audio/sfx/progression/level-up.ogg',       volume: 0.85 },
      skill_level_up: { src: '/audio/sfx/progression/skill-level-up.ogg', volume: 0.75 },
    },
    queue: {
      add:      { src: '/audio/sfx/queue/queue-add.ogg',      volume: 0.5  },
      complete: { src: '/audio/sfx/queue/queue-complete.ogg', volume: 0.65 },
    },
    equipment: {
      equip: { src: '/audio/Custom/UI/Equip.ogg', volume: 0.65 },
      sell:  { src: '/audio/Custom/UI/Sell.ogg',  volume: 0.55 },
    },
  },
} as const;

export type AmbientId = keyof typeof AUDIO_REGISTRY.ambient;
export type PlayerSkillSfxId = keyof typeof AUDIO_REGISTRY.sfx.playerSkills;
export type MonsterSkillSfxId = keyof typeof AUDIO_REGISTRY.sfx.monsterSkills;
export type SfxRegistrySection = typeof AUDIO_REGISTRY.sfx;
export type SfxSectionKey = keyof SfxRegistrySection;
export type SfxIdForSection<K extends SfxSectionKey> = keyof SfxRegistrySection[K];

export const SKILL_TO_AMBIENT_MAP: Record<string, AmbientId | null> = {
  fishing:    'fishing',
  woodcutting:'woodcutting',
  mining:     'mining',
  hunting:    'hunting',
  cooking:    'cooking',
  firemaking: 'firemaking',
  crafting:   'crafting',
  alchemy:    'alchemy',
};

export const PLAYER_SKILL_NAME_TO_SFX: Record<string, PlayerSkillSfxId | null> = {
  'Earthquake':      'earthquake',
  'Venom Strike':    'venom_strike',
  'Death Combo':     'death_combo',
  'Shadow Strike':   'shadow_strike',
  'Brutal Cleave':   'brutal_cleave',
  'Crushing Blow':   'crushing_blow',
  'Lifesteal Burst': 'lifesteal_burst',
  'Meteor Strike':   'meteor_strike',
  'Frost Nova':      'frost_nova',
  'Thunder Strike':  'thunder_strike',
  'Inferno Blast':   'inferno_blast',
  'Void Strike':     'void_strike',
  'Crypt Shot':      'crypt_shot',
  'Bone Scrape':     'bone_scrape',
  'Soulfire Arrow':  'soulfire_arrow',
  'Phantom Slash':   'phantom_slash',
  'Poison':          'poison',
  'Burn':            'burn',
  'Bleed':           'bleed',
  'Stun':            'stun',
  'Freeze':          'freeze',
  'Vampiric':        'vampiric',
  'Execute':         'execute',
  'Armor Pierce':    'armor_pierce',
};

export const MONSTER_SKILL_NAME_TO_SFX: Record<string, MonsterSkillSfxId | null> = {
  'Fire Breath':        'fire_breath',
  'Dragon Fire Breath': 'dragon_fire_breath',
  'Earthquake':         'earthquake',
  'Venomous Bite':      'venomous_bite',
  'Sandstorm':          'sandstorm',
  'Void Pulse':         'void_pulse',
  'Soul Drain':         'soul_drain',
  'Howling Wail':       'howling_wail',
  'Troll Smash':        'troll_smash',
  'Multi-Head Strike':  'multi_head_strike',
  "Nature's Wrath":     'natures_wrath',
  'Goblin Frenzy':      'goblin_frenzy',
  'War Cry':            'war_cry',
  'Poison':             'monster_poison',
  'Burn':               'monster_burn',
  'Bleed':              'monster_bleed',
  'Stun':               'monster_stun',
  'Freeze':             'monster_freeze',
};

export function getRandomWeaponSfx(weaponCategory: string | null | undefined): AudioEntry {
  const mapped = weaponCategory ? WEAPON_CATEGORY_MAP[weaponCategory] : null;
  const set = mapped ? WEAPON_SFX[mapped] : WEAPON_SFX.sword;
  const idx = Math.floor(Math.random() * set.variants.length);
  return set.variants[idx];
}
