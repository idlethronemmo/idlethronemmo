export * from "./items-types";
import type { Item, Recipe, EquipmentSlot, Rarity, ItemStats, WeaponSkill } from "./items-types";
import { EQUIPMENT_SLOTS, RARITY_CHANCES, RARITY_MULTIPLIERS, RARITY_COLORS, RARITY_BG_COLORS, isItemTradable } from "./items-types";
import type { GameItem, GameRecipe } from "@shared/schema";
import { ITEMS as STATIC_ITEMS, RECIPES as STATIC_RECIPES } from "./items-data";
import { getMonsters } from './monsters';

let _items: Item[] | null = null;
let _recipes: Recipe[] | null = null;
let _equipmentSets: EquipmentSetData[] | null = null;
let _loadPromise: Promise<void> | null = null;
let _useApiData = true;
let _isTester = false;

export function setTesterMode(isTester: boolean): void {
  _isTester = isTester;
}

export function buildDraftQuery(existingParams: string): string {
  if (!_isTester) return existingParams;
  const separator = existingParams.includes('?') ? '&' : '?';
  return `${existingParams}${separator}includeDrafts=1`;
}

export interface SetBonusEffect {
  requiredPieces: number;
  effects: {
    attackBonus?: number;
    strengthBonus?: number;
    defenceBonus?: number;
    hitpointsBonus?: number;
    accuracyBonus?: number;
    damageReduction?: number;
    critChance?: number;
    lifesteal?: number;
    xpBoost?: number;
  };
  description?: string;
  descriptionTranslations?: Record<string, string>;
}

export interface EquipmentSetData {
  id: string;
  name: string;
  description: string;
  pieces: string[];
  bonuses: SetBonusEffect[];
  icon?: string;
  nameTranslations?: Record<string, string>;
  descriptionTranslations?: Record<string, string>;
}

function convertGameItemToItem(gameItem: GameItem): Item {
  const weaponSkills = (gameItem.weaponSkills as WeaponSkill[]) || [];

  return {
    id: gameItem.id,
    name: gameItem.name,
    description: gameItem.description,
    type: gameItem.type as Item["type"],
    equipSlot: gameItem.equipSlot as Item["equipSlot"],
    stats: gameItem.stats as Item["stats"],
    levelRequired: gameItem.levelRequired ?? undefined,
    skillRequired: gameItem.skillRequired ?? undefined,
    vendorPrice: gameItem.vendorPrice ?? undefined,
    untradable: gameItem.untradable === 1,
    duration: gameItem.duration ?? undefined,
    effect: gameItem.effect as Item["effect"],
    weaponCategory: gameItem.weaponCategory as Item["weaponCategory"],
    attackSpeedMs: gameItem.attackSpeedMs ?? undefined,
    lifestealPercent: gameItem.lifestealPercent ?? undefined,
    weaponSkills: weaponSkills.length > 0 ? weaponSkills : undefined,
    icon: gameItem.icon ?? undefined,
    nameTranslations: (gameItem.nameTranslations as Record<string, string>) ?? undefined,
    descriptionTranslations: (gameItem.descriptionTranslations as Record<string, string>) ?? undefined,
    // Role system fields
    armorType: gameItem.armorType as Item["armorType"],
    weaponType: gameItem.weaponType as Item["weaponType"],
    critChance: gameItem.critChance ?? undefined,
    critDamage: gameItem.critDamage ?? undefined,
    healPower: gameItem.healPower ?? undefined,
    buffPower: gameItem.buffPower ?? undefined,
    buffType: gameItem.buffType as Item["buffType"],
    masteryRequired: gameItem.masteryRequired ?? undefined,
    salvageOverride: gameItem.salvageOverride as { minScrap: number; maxScrap: number } | undefined,
  };
}

export function getTranslatedItemName(item: Item | undefined, language: string): string {
  if (!item) return "";
  if (item.nameTranslations && item.nameTranslations[language]) {
    return item.nameTranslations[language];
  }
  return item.name;
}

export function getTranslatedItemDescription(item: Item | undefined, language: string): string {
  if (!item) return "";
  if (item.descriptionTranslations && item.descriptionTranslations[language]) {
    return item.descriptionTranslations[language];
  }
  return item.description;
}

// Convert underscore IDs to display names (e.g., "normal_logs" -> "Normal Logs")
export function formatItemIdAsName(itemId: string): string {
  return itemId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function translateItemName(itemId: string, language: string): string {
  const { baseId } = parseItemWithRarity(itemId);
  const item = getItemById(baseId);
  if (item?.nameTranslations?.[language]) {
    return item.nameTranslations[language];
  }
  // If item exists, use its name; otherwise format the ID nicely
  return item?.name ?? formatItemIdAsName(baseId);
}

export function translateItemDescription(itemId: string, language: string): string {
  const { baseId } = parseItemWithRarity(itemId);
  const item = getItemById(baseId);
  if (item?.descriptionTranslations?.[language]) {
    return item.descriptionTranslations[language];
  }
  return item?.description || "";
}

function convertGameRecipeToRecipe(gameRecipe: GameRecipe): Recipe {
  return {
    id: gameRecipe.id,
    resultItemId: gameRecipe.resultItemId,
    resultQuantity: gameRecipe.resultQuantity,
    materials: gameRecipe.materials as Recipe["materials"],
    skill: gameRecipe.skill,
    levelRequired: gameRecipe.levelRequired,
    xpReward: gameRecipe.xpReward,
    craftTime: gameRecipe.craftTime,
    category: gameRecipe.category as Recipe["category"],
    regionId: gameRecipe.regionId ?? undefined,
    regionIds: Array.isArray(gameRecipe.regionIds) ? gameRecipe.regionIds as string[] : undefined,
  };
}

export function isItemsLoaded(): boolean {
  return _items !== null && _recipes !== null;
}

// Force reload items data from API, clearing any cached data
export async function reloadItemsData(): Promise<void> {
  _items = null;
  _recipes = null;
  _equipmentSets = null;
  _loadPromise = null;
  return loadItemsData();
}

export async function loadItemsData(): Promise<void> {
  if (_items !== null && _recipes !== null) return Promise.resolve();
  if (_loadPromise) return _loadPromise;
  
  _loadPromise = (async () => {
    if (_useApiData) {
      try {
        const cacheBuster = `?t=${Date.now()}`;
        const [itemsRes, recipesRes, setsRes] = await Promise.all([
          fetch(buildDraftQuery(`/api/game/items${cacheBuster}`)),
          fetch(buildDraftQuery(`/api/game/recipes${cacheBuster}`)),
          fetch(buildDraftQuery(`/api/game/equipment-sets${cacheBuster}`))
        ]);
        
        if (itemsRes.ok && recipesRes.ok) {
          const gameItems: GameItem[] = await itemsRes.json();
          const gameRecipes: GameRecipe[] = await recipesRes.json();
          _items = gameItems.map(convertGameItemToItem);
          _recipes = gameRecipes.map(convertGameRecipeToRecipe);
          
          const staffItems = _items.filter(i => i.weaponCategory === 'staff');
          console.log('[loadItemsData] Loaded from API - total items:', _items.length, 'staff items:', staffItems.length, 'sample staff:', staffItems[0]);
          
          if (setsRes.ok) {
            _equipmentSets = await setsRes.json();
          }
          return;
        }
      } catch (error) {
        console.warn('Failed to load items from API, falling back to static data:', error);
      }
    }
    
    const data = await import("./items-data");
    _items = data.ITEMS;
    _recipes = data.RECIPES;
    console.log('[loadItemsData] Loaded from STATIC - total items:', _items.length);
  })();
  
  return _loadPromise;
}

export function getEquipmentSets(): EquipmentSetData[] {
  return _equipmentSets || [];
}

export function getEquipmentSetById(setId: string): EquipmentSetData | undefined {
  return getEquipmentSets().find(s => s.id === setId);
}

export function findSetForItem(itemId: string): EquipmentSetData | undefined {
  const baseId = parseItemWithRarity(itemId).baseId;
  return getEquipmentSets().find(set => set.pieces.includes(baseId));
}

export function preloadItemsData(): void {
  if (_items === null || _recipes === null) {
    loadItemsData();
  }
}

function getEffectiveItems(): Item[] {
  return (_items && _items.length > 0) ? _items : STATIC_ITEMS;
}

function getEffectiveRecipes(): Recipe[] {
  return (_recipes && _recipes.length > 0) ? _recipes : STATIC_RECIPES;
}

export function getItems(): Item[] {
  return getEffectiveItems();
}

export function getRecipes(): Recipe[] {
  return getEffectiveRecipes();
}

export const ITEMS: Item[] = new Proxy([] as Item[], {
  get(target, prop) {
    return Reflect.get(getEffectiveItems(), prop);
  }
});

export const RECIPES: Recipe[] = new Proxy([] as Recipe[], {
  get(target, prop) {
    return Reflect.get(getEffectiveRecipes(), prop);
  }
});

export function getItemById(id: string): Item | undefined {
  return getEffectiveItems().find((item) => item.id === id || item.name === id);
}

export function getRecipeByResultId(resultItemId: string): Recipe | undefined {
  return getEffectiveRecipes().find((r) => r.resultItemId === resultItemId);
}

export function getRecipeById(id: string): Recipe | undefined {
  return getEffectiveRecipes().find((recipe) => recipe.id === id);
}

export function getRecipesForSkill(skill: string): Recipe[] {
  return getEffectiveRecipes().filter((recipe) => recipe.skill === skill);
}

export function getRecipesByCategory(category: string): Recipe[] {
  return getEffectiveRecipes().filter((recipe) => recipe.category === category);
}

export function getRecipesByCategoryAndRegion(category: string, regionId: string): Recipe[] {
  return getEffectiveRecipes().filter((recipe) => {
    if (recipe.category !== category) return false;
    const regions = (recipe.regionIds && Array.isArray(recipe.regionIds) && recipe.regionIds.length > 0) ? recipe.regionIds as string[] : (recipe.regionId ? [recipe.regionId] : []);
    return regions.length === 0 || regions.includes(regionId);
  });
}

export function getRecipesForSkillAndRegion(skill: string, regionId: string): Recipe[] {
  return getEffectiveRecipes().filter((recipe) => {
    if (recipe.skill !== skill) return false;
    const regions = (recipe.regionIds && Array.isArray(recipe.regionIds) && recipe.regionIds.length > 0) ? recipe.regionIds as string[] : (recipe.regionId ? [recipe.regionId] : []);
    return regions.length === 0 || regions.includes(regionId);
  });
}

export function isEquipment(itemId: string): boolean {
  const item = getItemById(itemId);
  return item?.type === "equipment";
}

export function getValidRarities(baseItemId: string): Rarity[] {
  if (!isItemTradable(baseItemId)) return [];
  const allRarities: Rarity[] = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"];
  return allRarities.filter(rarity => {
    if (rarity === "Common") return true;
    const rarityItemId = `${baseItemId} (${rarity})`;
    return isItemTradable(rarityItemId) && isEquipment(baseItemId);
  });
}

export function buildBuyOrderItemId(baseItemId: string, rarity: Rarity): string {
  return rarity === "Common" ? baseItemId : `${baseItemId} (${rarity})`;
}

export function getEquipmentStats(itemId: string): ItemStats | undefined {
  const item = getItemById(itemId);
  return item?.stats;
}

export function canCraftRecipe(
  recipe: Recipe,
  inventory: Record<string, number>,
  skillLevel: number,
): boolean {
  if (skillLevel < recipe.levelRequired) return false;
  return recipe.materials.every(
    (mat) => (inventory[mat.itemId] || 0) >= mat.quantity,
  );
}

export interface ActiveSetBonus {
  setId: string;
  setName: string;
  equippedPieces: number;
  totalPieces: number;
  activeBonuses: SetBonusEffect[];
}

export function getActiveSetBonuses(
  equipment: Record<EquipmentSlot, string | null>,
): ActiveSetBonus[] {
  const sets = getEquipmentSets();
  if (sets.length === 0) return [];
  
  const equippedBaseIds = EQUIPMENT_SLOTS
    .map(slot => equipment[slot])
    .filter((id): id is string => id !== null)
    .map(id => parseItemWithRarity(id).baseId);
  
  const result: ActiveSetBonus[] = [];
  
  for (const set of sets) {
    const matchingPieces = set.pieces.filter(pieceId => equippedBaseIds.includes(pieceId));
    if (matchingPieces.length >= 2) {
      const activeBonuses = set.bonuses.filter(
        (bonus: SetBonusEffect) => matchingPieces.length >= bonus.requiredPieces
      );
      result.push({
        setId: set.id,
        setName: set.name,
        equippedPieces: matchingPieces.length,
        totalPieces: set.pieces.length,
        activeBonuses,
      });
    }
  }
  
  return result;
}

export function getTotalEquipmentBonus(
  equipment: Record<EquipmentSlot, string | null>,
  itemModifications?: Record<string, { addedStats: Record<string, number>; addedSkills: string[]; enhancementLevel: number }>
): ItemStats {
  const total: ItemStats = {
    attackBonus: 0,
    strengthBonus: 0,
    defenceBonus: 0,
    accuracyBonus: 0,
    hitpointsBonus: 0,
    critChance: 0,
    critDamage: 0,
    healPower: 0,
    buffPower: 0,
    skillDamageBonus: 0,
    attackSpeedBonus: 0,
    healingReceivedBonus: 0,
    onHitHealingPercent: 0,
    buffDurationBonus: 0,
    partyDpsBuff: 0,
    partyDefenceBuff: 0,
    partyAttackSpeedBuff: 0,
    lootChanceBonus: 0,
  };

  const ADDED_STAT_TO_ITEM_STAT: Record<string, keyof ItemStats> = {
    bonusAttack: 'attackBonus',
    bonusDefence: 'defenceBonus',
    bonusStrength: 'strengthBonus',
    bonusHitpoints: 'hitpointsBonus',
    accuracy: 'accuracyBonus',
    critChance: 'critChance',
    critDamage: 'critDamage',
    attackSpeed: 'attackSpeedBonus',
  };

  // Check if main hand is a dagger for dual wield off-hand reduction
  const mainWeaponId = equipment["weapon"];
  const mainWeapon = mainWeaponId ? getItemById(parseItemWithRarity(mainWeaponId).baseId) : null;
  const isDualWieldDagger = mainWeapon?.weaponCategory === "dagger";

  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = equipment[slot];
    if (itemId) {
      const stats = getItemStatsWithRarity(itemId);
      const item = getItemById(parseItemWithRarity(itemId).baseId);
      
      const isOffhandDagger = slot === "shield" && item?.weaponCategory === "dagger";
      if (isOffhandDagger && !isDualWieldDagger) continue;
      const statMultiplier = (isOffhandDagger && isDualWieldDagger) ? 0.5 : 1.0;

      const mods = itemModifications?.[itemId];
      const enhancementMultiplier = mods ? (1 + mods.enhancementLevel * 0.05) : 1.0;
      
      if (stats) {
        total.attackBonus! += Math.floor((stats.attackBonus || 0) * statMultiplier * enhancementMultiplier);
        total.strengthBonus! += Math.floor((stats.strengthBonus || 0) * statMultiplier * enhancementMultiplier);
        total.defenceBonus! += Math.floor((stats.defenceBonus || 0) * statMultiplier * enhancementMultiplier);
        total.accuracyBonus! += Math.floor((stats.accuracyBonus || 0) * statMultiplier * enhancementMultiplier);
        total.hitpointsBonus! += Math.floor((stats.hitpointsBonus || 0) * statMultiplier * enhancementMultiplier);
        total.skillDamageBonus! += Math.floor((stats.skillDamageBonus || 0) * statMultiplier * enhancementMultiplier);
        total.attackSpeedBonus! += Math.floor((stats.attackSpeedBonus || 0) * statMultiplier * enhancementMultiplier);
        total.healingReceivedBonus! += Math.floor((stats.healingReceivedBonus || 0) * statMultiplier * enhancementMultiplier);
        total.onHitHealingPercent! += Math.floor((stats.onHitHealingPercent || 0) * statMultiplier * enhancementMultiplier);
        total.buffDurationBonus! += Math.floor((stats.buffDurationBonus || 0) * statMultiplier * enhancementMultiplier);
        total.partyDpsBuff! += Math.floor((stats.partyDpsBuff || 0) * statMultiplier * enhancementMultiplier);
        total.partyDefenceBuff! += Math.floor((stats.partyDefenceBuff || 0) * statMultiplier * enhancementMultiplier);
        total.partyAttackSpeedBuff! += Math.floor((stats.partyAttackSpeedBuff || 0) * statMultiplier * enhancementMultiplier);
        total.lootChanceBonus! += Math.floor((stats.lootChanceBonus || 0) * statMultiplier * enhancementMultiplier);
      }
      if (item) {
        total.critChance! += (item.critChance || 0) * statMultiplier * enhancementMultiplier;
        total.critDamage! += (item.critDamage || 0) * statMultiplier * enhancementMultiplier;
        total.healPower! += (item.healPower || 0) * statMultiplier;
        total.buffPower! += (item.buffPower || 0) * statMultiplier;
      }

      if (mods && mods.addedStats) {
        for (const [statKey, statValue] of Object.entries(mods.addedStats)) {
          const mappedKey = ADDED_STAT_TO_ITEM_STAT[statKey];
          if (mappedKey && typeof statValue === 'number') {
            (total as any)[mappedKey] = ((total as any)[mappedKey] || 0) + statValue;
          }
        }
      }
    }
  }

  const activeSets = getActiveSetBonuses(equipment);
  for (const activeSet of activeSets) {
    for (const bonus of activeSet.activeBonuses) {
      total.attackBonus! += bonus.effects.attackBonus || 0;
      total.strengthBonus! += bonus.effects.strengthBonus || 0;
      total.defenceBonus! += bonus.effects.defenceBonus || 0;
      total.accuracyBonus! += bonus.effects.accuracyBonus || 0;
      total.hitpointsBonus! += bonus.effects.hitpointsBonus || 0;
    }
  }

  return total;
}

export function rollRarity(): Rarity {
  const roll = Math.random() * 100;
  let cumulative = 0;

  for (const [rarity, chance] of Object.entries(RARITY_CHANCES) as [
    Rarity,
    number,
  ][]) {
    cumulative += chance;
    if (roll < cumulative) {
      return rarity;
    }
  }

  return "Common";
}

export function rollRarityForDrop(): Rarity {
  const roll = Math.random() * 100;
  if (roll < 0.075) return "Mythic";
  if (roll < 0.575) return "Legendary";
  if (roll < 1.575) return "Epic";
  if (roll < 4.575) return "Rare";
  if (roll < 14.575) return "Uncommon";
  return "Common";
}

export function applyRarityToStats(
  stats: ItemStats,
  rarity: Rarity,
): ItemStats {
  const multiplier = RARITY_MULTIPLIERS[rarity];
  return {
    attackBonus: stats.attackBonus
      ? Math.floor(stats.attackBonus * multiplier)
      : undefined,
    strengthBonus: stats.strengthBonus
      ? Math.floor(stats.strengthBonus * multiplier)
      : undefined,
    defenceBonus: stats.defenceBonus
      ? Math.floor(stats.defenceBonus * multiplier)
      : undefined,
    accuracyBonus: stats.accuracyBonus
      ? Math.floor(stats.accuracyBonus * multiplier)
      : undefined,
    hitpointsBonus: stats.hitpointsBonus
      ? Math.floor(stats.hitpointsBonus * multiplier)
      : undefined,
  };
}

export function generateItemWithRarity(
  baseItemId: string,
): { itemId: string; rarity: Rarity; stats: ItemStats } | null {
  const item = getItemById(baseItemId);
  if (!item || item.type !== "equipment" || !item.stats) return null;

  const rarity = rollRarity();
  const modifiedStats = applyRarityToStats(item.stats, rarity);

  return {
    itemId: baseItemId,
    rarity,
    stats: modifiedStats,
  };
}

// Generate a random 6-character unique suffix for damaged equipment
export function generateInstanceSuffix(): string {
  return Math.random().toString(36).substring(2, 8);
}

// Check if an item ID has a unique instance suffix
export function hasInstanceSuffix(itemId: string): boolean {
  if (!itemId) return false;
  return /#[a-z0-9]{6}$/.test(itemId);
}

// Strip the unique instance suffix from an item ID (returns base item ID with rarity)
export function stripInstanceSuffix(itemId: string): string {
  if (!itemId) return '';
  return itemId.replace(/#[a-z0-9]{6}$/, '');
}

// Add unique instance suffix to an item ID
export function addInstanceSuffix(itemId: string): string {
  return `${itemId}#${generateInstanceSuffix()}`;
}

export function parseItemWithRarity(itemString: string | null | undefined): {
  baseId: string;
  rarity: Rarity | null;
} {
  if (!itemString) {
    return { baseId: '', rarity: null };
  }
  const strippedItem = stripInstanceSuffix(itemString);
  
  const match = strippedItem.match(
    /^(.+?) \((Common|Uncommon|Rare|Epic|Legendary|Mythic)\)$/,
  );
  if (match) {
    return { baseId: match[1], rarity: match[2] as Rarity };
  }
  return { baseId: strippedItem, rarity: null };
}

export function getItemRarityColor(itemString: string): string {
  const { rarity } = parseItemWithRarity(itemString);
  if (!rarity) return "text-gray-300";
  return RARITY_COLORS[rarity];
}

export function getItemRarityBgColor(itemString: string): string {
  const { rarity } = parseItemWithRarity(itemString);
  if (!rarity) return "bg-gray-500/10 border-gray-500/30";
  return RARITY_BG_COLORS[rarity];
}

export function hasRarity(itemString: string): boolean {
  return parseItemWithRarity(itemString).rarity !== null;
}

export function getItemStatsWithRarity(
  itemString: string,
): ItemStats | undefined {
  const { baseId, rarity } = parseItemWithRarity(itemString);
  const item = getItemById(baseId);
  if (!item || !item.stats) return undefined;

  if (rarity) {
    return applyRarityToStats(item.stats, rarity);
  }
  return item.stats;
}

export function getItemStatsWithEnhancement(
  itemString: string,
  itemModifications?: Record<string, { addedStats: Record<string, number>; addedSkills: string[]; enhancementLevel: number }>,
): ItemStats | undefined {
  const baseStats = getItemStatsWithRarity(itemString);
  if (!baseStats) return undefined;
  if (!itemModifications) return baseStats;
  
  const mods = itemModifications[itemString];
  if (!mods) return baseStats;
  
  const enhMultiplier = 1 + mods.enhancementLevel * 0.05;
  const effective = { ...baseStats };
  
  for (const key of Object.keys(effective) as (keyof ItemStats)[]) {
    if (typeof effective[key] === 'number') {
      (effective as any)[key] = Math.floor((effective[key] as number) * enhMultiplier);
    }
  }
  
  const STAT_MAP: Record<string, string> = {
    bonusAttack: 'attackBonus', bonusDefence: 'defenceBonus', bonusStrength: 'strengthBonus',
    bonusHitpoints: 'hitpointsBonus', accuracy: 'accuracyBonus', critChance: 'critChance',
    critDamage: 'critDamage', attackSpeed: 'attackSpeedBonus', evasion: 'evasionBonus',
    bonusSkillDamage: 'skillDamageBonus',
  };
  
  if (mods.addedStats) {
    for (const [stat, value] of Object.entries(mods.addedStats)) {
      const mapped = STAT_MAP[stat];
      if (mapped && typeof value === 'number') {
        (effective as any)[mapped] = ((effective as any)[mapped] || 0) + value;
      }
    }
  }
  
  return effective;
}

export function getItemStatsBreakdown(
  itemString: string,
  itemModifications?: Record<string, { addedStats: Record<string, number>; addedSkills: string[]; enhancementLevel: number }>,
): { base: ItemStats; enhanced: ItemStats; enhancementBonus: Record<string, number> } | undefined {
  const baseStats = getItemStatsWithRarity(itemString);
  if (!baseStats) return undefined;
  
  const base = { ...baseStats };
  const enhancementBonus: Record<string, number> = {};
  
  if (!itemModifications) return { base, enhanced: base, enhancementBonus };
  
  const mods = itemModifications[itemString];
  if (!mods) return { base, enhanced: base, enhancementBonus };
  
  const enhMultiplier = 1 + mods.enhancementLevel * 0.05;
  const enhanced = { ...baseStats };
  
  for (const key of Object.keys(enhanced) as (keyof ItemStats)[]) {
    if (typeof enhanced[key] === 'number') {
      const boosted = Math.floor((enhanced[key] as number) * enhMultiplier);
      const levelBonus = boosted - (base[key] as number);
      if (levelBonus !== 0) {
        enhancementBonus[key] = levelBonus;
      }
      (enhanced as any)[key] = boosted;
    }
  }
  
  const STAT_MAP: Record<string, string> = {
    bonusAttack: 'attackBonus', bonusDefence: 'defenceBonus', bonusStrength: 'strengthBonus',
    bonusHitpoints: 'hitpointsBonus', accuracy: 'accuracyBonus', critChance: 'critChance',
    critDamage: 'critDamage', attackSpeed: 'attackSpeedBonus', evasion: 'evasionBonus',
    bonusSkillDamage: 'skillDamageBonus',
  };
  
  if (mods.addedStats) {
    for (const [stat, value] of Object.entries(mods.addedStats)) {
      const mapped = STAT_MAP[stat];
      if (mapped && typeof value === 'number') {
        (enhanced as any)[mapped] = ((enhanced as any)[mapped] || 0) + value;
        enhancementBonus[mapped] = (enhancementBonus[mapped] || 0) + value;
      }
    }
  }
  
  return { base, enhanced, enhancementBonus };
}

export function getBaseItem(itemString: string): Item | undefined {
  const { baseId } = parseItemWithRarity(itemString);
  return getItemById(baseId);
}

export function getVendorPrice(itemString: string): number {
  const { baseId, rarity } = parseItemWithRarity(itemString);
  const item = getItemById(baseId);
  if (!item || !item.vendorPrice) return 1;

  if (rarity && item.type === "equipment") {
    return Math.floor(item.vendorPrice * RARITY_MULTIPLIERS[rarity]);
  }
  return item.vendorPrice;
}

// ===== STUDY / SALVAGE SYSTEM =====

// Study XP multipliers by rarity (relative to base craft XP)
export const STUDY_XP_MULTIPLIERS: Record<Rarity, number> = {
  Common: 0.2,
  Uncommon: 0.5,
  Rare: 1.0,
  Epic: 2.5,
  Legendary: 5.0,
  Mythic: 10.0,
};

// Metal scrap yield per bar used in crafting (min-max range)
export const SCRAP_PER_BAR: Record<string, { min: number; max: number }> = {
  "Bronze Bar": { min: 1, max: 1 },
  "Iron Bar": { min: 1, max: 1 },
  "Steel Bar": { min: 1, max: 2 },
  "Mithril Bar": { min: 2, max: 3 },
  "Adamant Bar": { min: 4, max: 5 },
  "Rune Bar": { min: 6, max: 7 },
};

// Study duration in milliseconds (10 seconds per item)
export const STUDY_DURATION = 10000;

// Get study info for an equipment item
export function getStudyInfo(itemString: string): {
  canStudy: boolean;
  baseXp: number;
  studyXp: number;
  duration: number;
} | null {
  const { baseId, rarity } = parseItemWithRarity(itemString);
  if (!rarity) return null; // Only equipment with rarity can be studied
  
  const recipe = getRecipeByResultId(baseId);
  if (!recipe || recipe.skill !== "crafting") return null; // Only crafting items
  
  const multiplier = STUDY_XP_MULTIPLIERS[rarity];
  const studyXp = Math.floor(recipe.xpReward * multiplier);
  
  return {
    canStudy: true,
    baseXp: recipe.xpReward,
    studyXp,
    duration: STUDY_DURATION,
  };
}

// Get salvage info for an equipment item
export function getSalvageInfo(itemString: string): {
  canSalvage: boolean;
  scrapAmount: { min: number; max: number };
  barType: string;
} | null {
  const { baseId, rarity } = parseItemWithRarity(itemString);
  if (!rarity) return null; // Only equipment with rarity can be salvaged
  
  const item = getItemById(baseId);
  if (item && (item as any).salvageOverride) {
    const override = (item as any).salvageOverride as { minScrap: number; maxScrap: number };
    if (override.minScrap > 0 || override.maxScrap > 0) {
      return {
        canSalvage: true,
        scrapAmount: { min: override.minScrap, max: override.maxScrap },
        barType: "ore_essence",
      };
    }
  }

  const recipe = getRecipeByResultId(baseId);
  if (!recipe || recipe.skill !== "crafting") return null; // Only crafting items
  
  // Find the bar material in the recipe
  let barType: string | null = null;
  let totalBars = 0;
  
  for (const mat of recipe.materials) {
    if (mat.itemId.endsWith(" Bar")) {
      barType = mat.itemId;
      totalBars = mat.quantity;
      break;
    }
  }
  
  if (!barType || !SCRAP_PER_BAR[barType]) return null;
  
  const scrapRates = SCRAP_PER_BAR[barType];
  const minScrap = scrapRates.min * totalBars;
  const maxScrap = scrapRates.max * totalBars;
  
  return {
    canSalvage: true,
    scrapAmount: { min: minScrap, max: maxScrap },
    barType,
  };
}

// Calculate actual scrap from salvaging
export function calculateSalvageScrap(itemString: string): number {
  const info = getSalvageInfo(itemString);
  if (!info) return 0;
  
  // Random amount between min and max
  return Math.floor(Math.random() * (info.scrapAmount.max - info.scrapAmount.min + 1)) + info.scrapAmount.min;
}

// Check if an item can be studied (is equipment with recipe)
export function canStudyItem(itemString: string): boolean {
  return getStudyInfo(itemString) !== null;
}

// Check if an item can be salvaged (is metal equipment)
export function canSalvageItem(itemString: string): boolean {
  return getSalvageInfo(itemString) !== null;
}

// ===== ITEM SOURCE SYSTEM =====

export interface ItemSource {
  type: 'gathering' | 'monster_drop' | 'crafting' | 'shop' | 'dungeon_drop';
  detail: string;
  skill?: string;
  level?: number;
  regionId?: string;
  dungeonName?: string;
}

let _skillActionsCache: any[] | null = null;
let _skillActionsPromise: Promise<any[]> | null = null;

let _dungeonLootCache: { dungeonId: string; dungeonName: string; itemIds: string[] }[] | null = null;
let _dungeonLootPromise: Promise<any> | null = null;

async function fetchDungeonLoot(): Promise<void> {
  if (_dungeonLootCache) return;
  if (_dungeonLootPromise) { await _dungeonLootPromise; return; }
  _dungeonLootPromise = (async () => {
    try {
      const [dungeonsRes, lootRes] = await Promise.all([
        fetch('/api/game/dungeons'),
        fetch('/api/game/dungeon-loot-tables')
      ]);
      if (!dungeonsRes.ok || !lootRes.ok) return;
      const dungeons = await dungeonsRes.json();
      const lootTables = await lootRes.json();
      const result: { dungeonId: string; dungeonName: string; itemIds: string[] }[] = [];
      for (const dungeon of dungeons) {
        const tables = lootTables.filter((t: any) => t.dungeonId === dungeon.id);
        const itemIds = new Set<string>();
        for (const table of tables) {
          const guaranteed = table.guaranteedDrops || [];
          const possible = table.possibleDrops || [];
          for (const itemId of guaranteed) { if (typeof itemId === 'string') itemIds.add(itemId); }
          for (const drop of possible) { if (drop.itemId) itemIds.add(drop.itemId); }
        }
        if (itemIds.size > 0) {
          result.push({ dungeonId: dungeon.id, dungeonName: dungeon.name, itemIds: Array.from(itemIds) });
        }
      }
      _dungeonLootCache = result;
    } catch (e) {}
  })();
  await _dungeonLootPromise;
}

async function fetchSkillActions(): Promise<any[]> {
  if (_skillActionsCache) return _skillActionsCache;
  if (_skillActionsPromise) return _skillActionsPromise;
  _skillActionsPromise = fetch(buildDraftQuery('/api/game/skill-actions'))
    .then(res => res.ok ? res.json() : [])
    .then(data => { _skillActionsCache = data; return data; })
    .catch(() => []);
  return _skillActionsPromise;
}

export function formatSkillName(skill: string, language: string): string {
  const skillNames: Record<string, Record<string, string>> = {
    mining: { en: 'Mining', tr: 'Madencilik' },
    woodcutting: { en: 'Woodcutting', tr: 'Ağaç Kesme' },
    fishing: { en: 'Fishing', tr: 'Balıkçılık' },
    hunting: { en: 'Hunting', tr: 'Avcılık' },
    crafting: { en: 'Crafting', tr: 'Üretim' },
    cooking: { en: 'Cooking', tr: 'Yemek Yapma' },
    alchemy: { en: 'Alchemy', tr: 'Simya' },
    firemaking: { en: 'Firemaking', tr: 'Ateş Yakma' },
  };
  return skillNames[skill]?.[language] || skillNames[skill]?.en || skill.charAt(0).toUpperCase() + skill.slice(1);
}

export function getItemSourcesSync(itemId: string): ItemSource[] {
  const sources: ItemSource[] = [];

  try {
    const monsters = getMonsters();
    for (const monster of monsters) {
      if (monster.loot) {
        for (const drop of monster.loot) {
          if (drop.itemId === itemId) {
            sources.push({
              type: 'monster_drop',
              detail: monster.id,
              regionId: monster.region,
            });
            break;
          }
        }
      }
    }
  } catch (e) {}

  const recipes = getRecipes();
  for (const recipe of recipes) {
    if (recipe.resultItemId === itemId) {
      sources.push({
        type: 'crafting',
        detail: recipe.skill,
        skill: recipe.skill,
        level: recipe.levelRequired,
        regionId: recipe.regionId,
      });
    }
  }

  const item = getItemById(itemId);
  if (item?.vendorPrice && item.vendorPrice > 0) {
    sources.push({
      type: 'shop',
      detail: 'NPC Shop',
    });
  }

  if (_skillActionsCache) {
    for (const action of _skillActionsCache) {
      if (action.itemId === itemId || action.item_id === itemId) {
        sources.push({
          type: 'gathering',
          detail: action.skill,
          skill: action.skill,
          level: action.levelRequired || action.level_required,
          regionId: action.regionId || action.region_id,
        });
      }
    }
  }

  if (_dungeonLootCache) {
    for (const dungeon of _dungeonLootCache) {
      if (dungeon.itemIds.includes(itemId)) {
        sources.push({
          type: 'dungeon_drop',
          detail: dungeon.dungeonName,
          dungeonName: dungeon.dungeonName,
        });
      }
    }
  }

  return sources;
}

export async function getItemSources(itemId: string): Promise<ItemSource[]> {
  await Promise.all([fetchSkillActions(), fetchDungeonLoot()]);
  return getItemSourcesSync(itemId);
}

export function preloadItemSources(): void {
  fetchSkillActions();
  fetchDungeonLoot();
}
