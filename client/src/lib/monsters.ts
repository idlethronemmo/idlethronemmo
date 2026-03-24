import type { Monster, CombatRegion, MonsterSkill, GameCombatRegion, GameMonster } from "@shared/schema";
import { MONSTERS as STATIC_MONSTERS } from "./monsters-data";

export const COMBAT_REGIONS: CombatRegion[] = [
  { 
    id: "verdant", 
    name: "Yeşil Vadi", 
    description: "Yeni başlayanlar için uygun orman ve çayırlar",
    levelRange: { min: 1, max: 18 },
    color: "green"
  },
  { 
    id: "quarry", 
    name: "Küllü Ocak", 
    description: "Demir ve kömür açısından zengin terkedilmiş maden",
    levelRange: { min: 10, max: 28 },
    color: "amber"
  },
  { 
    id: "dunes", 
    name: "Yıldız Çölü", 
    description: "Gizemli yaratıkların yaşadığı büyülü çöl",
    levelRange: { min: 18, max: 36 },
    color: "yellow"
  },
  { 
    id: "obsidian", 
    name: "Obsidyen Kale", 
    description: "Karanlık şövalyelerin ve güçlü düşmanların kalesi",
    levelRange: { min: 30, max: 50 },
    color: "purple"
  },
  { 
    id: "dragonspire", 
    name: "Ejder Zirvesi", 
    description: "Sadece en güçlü savaşçılar için ejder yuvası",
    levelRange: { min: 38, max: 70 },
    color: "red"
  },
  { 
    id: "frozen_wastes", 
    name: "Buzul Çölü", 
    description: "Dondurucu rüzgarların ve buz yaratıklarının diyarı",
    levelRange: { min: 55, max: 85 },
    color: "cyan"
  },
  { 
    id: "void_realm", 
    name: "Boşluk Diyarı", 
    description: "Gerçekliğin sınırlarındaki karanlık ve gizemli boyut",
    levelRange: { min: 70, max: 100 },
    color: "indigo"
  },
];

let _monsters: Monster[] | null = null;
let _regions: CombatRegion[] | null = null;
let _loadPromise: Promise<void> | null = null;
let _useApiData = true;
let _loadedFromApi = false;
let _isTester = false;

export function setTesterMode(isTester: boolean): void {
  _isTester = isTester;
}

function buildDraftQuery(existingParams: string): string {
  if (!_isTester) return existingParams;
  const separator = existingParams.includes('?') ? '&' : '?';
  return `${existingParams}${separator}includeDrafts=1`;
}

function convertGameMonsterToMonster(gameMonster: GameMonster): Monster {
  const skills = (gameMonster.skills as MonsterSkill[]) || [];

  return {
    id: gameMonster.id,
    name: gameMonster.name,
    region: gameMonster.regionId as Monster["region"],
    maxHitpoints: gameMonster.maxHitpoints,
    attackLevel: gameMonster.attackLevel,
    strengthLevel: gameMonster.strengthLevel,
    defenceLevel: gameMonster.defenceLevel,
    attackBonus: gameMonster.attackBonus ?? 0,
    strengthBonus: gameMonster.strengthBonus ?? 0,
    attackSpeed: gameMonster.attackSpeed,
    loot: gameMonster.loot as Monster["loot"],
    xpReward: gameMonster.xpReward as Monster["xpReward"],
    skills: skills.length > 0 ? skills : undefined,
  };
}

function convertGameRegionToCombatRegion(gameRegion: GameCombatRegion): CombatRegion {
  return {
    id: gameRegion.id,
    name: gameRegion.name,
    description: gameRegion.description,
    levelRange: { min: gameRegion.levelRangeMin, max: gameRegion.levelRangeMax },
    color: gameRegion.color,
  };
}

export function isMonstersLoaded(): boolean {
  return _monsters !== null;
}

export function isMonstersLoadedFromApi(): boolean {
  return _loadedFromApi;
}

// Force reload monsters data from API, clearing any cached data
export async function reloadMonstersData(): Promise<void> {
  _monsters = null;
  _regions = null;
  _loadPromise = null;
  _loadedFromApi = false;
  return loadMonstersData();
}

export async function loadMonstersData(): Promise<void> {
  if (_monsters !== null) return Promise.resolve();
  if (_loadPromise) return _loadPromise;
  
  _loadPromise = (async () => {
    if (_useApiData) {
      try {
        // Add cache-busting timestamp to prevent browser caching
        const cacheBuster = `?t=${Date.now()}`;
        const [monstersRes, regionsRes] = await Promise.all([
          fetch(buildDraftQuery(`/api/game/monsters${cacheBuster}`)),
          fetch(buildDraftQuery(`/api/game/regions${cacheBuster}`))
        ]);
        
        if (monstersRes.ok && regionsRes.ok) {
          const gameMonsters: GameMonster[] = await monstersRes.json();
          const gameRegions: GameCombatRegion[] = await regionsRes.json();
          _monsters = gameMonsters.map(convertGameMonsterToMonster);
          _regions = gameRegions.map(convertGameRegionToCombatRegion);
          _loadedFromApi = true;
          return;
        }
      } catch (error) {
        console.warn('Failed to load monsters from API, falling back to static data:', error);
      }
    }
    
    // Fallback to static data
    _loadedFromApi = false;
    const data = await import("./monsters-data");
    _monsters = data.MONSTERS;
    _regions = COMBAT_REGIONS;
  })();
  
  return _loadPromise;
}

export function preloadMonstersData(): void {
  if (_monsters === null) {
    loadMonstersData();
  }
}

function getEffectiveMonsters(): Monster[] {
  return (_monsters && _monsters.length > 0) ? _monsters : STATIC_MONSTERS;
}

function getEffectiveRegions(): CombatRegion[] {
  return (_regions && _regions.length > 0) ? _regions : COMBAT_REGIONS;
}

export function getMonsters(): Monster[] {
  return getEffectiveMonsters();
}

export const MONSTERS: Monster[] = new Proxy([] as Monster[], {
  get(target, prop) {
    const monsters = getEffectiveMonsters();
    return Reflect.get(monsters, prop);
  }
});

export function getMonsterById(id: string): Monster | undefined {
  return getEffectiveMonsters().find((m) => m.id === id);
}

export function getMonstersByRegion(region: string): Monster[] {
  return getEffectiveMonsters().filter((m) => m.region === region);
}

export function getMonstersByLevel(maxCombatLevel: number): Monster[] {
  return getEffectiveMonsters().filter((m) => {
    const combatLevel = Math.floor((m.attackLevel + m.strengthLevel + m.defenceLevel) / 3);
    return combatLevel <= maxCombatLevel;
  });
}

export function getRegionById(id: string): CombatRegion | undefined {
  return getEffectiveRegions().find((r) => r.id === id);
}

export function getCombatRegions(): CombatRegion[] {
  return getEffectiveRegions();
}
