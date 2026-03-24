export const UNTRADABLE_ITEM_IDS = new Set<string>([
  // Gold is now a separate currency, not an inventory item
]);

// Complete list of all equipment base IDs (synced from game_items DB where type='equipment')
// This is the authoritative source for checking if an item is equipment
// Also includes crafting task names (wood types) that produce equipment-like outputs
export const EQUIPMENT_BASE_IDS = new Set<string>([
  "Adamant Amulet",
  "Adamant Boots",
  "Adamant Fortress",
  "Adamant Gloves",
  "Adamant Helmet",
  "Adamant Platebody",
  "Adamant Platelegs",
  "Adamant Ring",
  "Adamant Shield",
  "Adamant Sword",
  "Adamant Warhammer",
  "Bat Wing Cloak",
  "Bronze Amulet",
  "Bronze Boots",
  "Bronze Buckler",
  "Bronze Dagger",
  "Bronze Gloves",
  "Bronze Helmet",
  "Bronze Platebody",
  "Bronze Platelegs",
  "Bronze Ring",
  "Bronze Shield",
  "Bronze Sword",
  "Bronze Warhammer",
  "Crown of Flames",
  "Dark Knight Sword",
  "Dark Lord Crown",
  "Dark Mithril Boots",
  "Dark Mithril Gloves",
  "Dark Mithril Helmet",
  "Dark Mithril Platebody",
  "Dark Mithril Platelegs",
  "Desert Boots",
  "Desert Cape",
  "Desert Gloves",
  "Desert Guardian Armor",
  "Desert Helmet",
  "Desert Platebody",
  "Desert Platelegs",
  "Dragon Amulet",
  "Dragon Boots",
  "Dragon Cloak",
  "Dragon Essence Ring",
  "Dragon Gloves",
  "Dragon Helmet",
  "Dragon Platebody",
  "Dragon Platelegs",
  "Dragon Shield",
  "Dragon Sword",
  "Dragon Warhammer",
  "Dragonbone Blade",
  "Dragonbone Bulwark",
  "Dragonfire Cape",
  "Dragonscale Cape",
  "Drake Fire Sword",
  "Drake Staff",
  "Earthstone Platebody",
  "Frostfire Blade",
  "Fur Hunter Mask",
  "Goblin Barrier",
  "Goblin Blade",
  "Gold Amulet",
  "Gold Ring",
  "Infernal Armor",
  "Infernal Cape",
  "Iron Amulet",
  "Iron Boots",
  "Iron Dagger",
  "Iron Gloves",
  "Iron Helmet",
  "Iron Kite Shield",
  "Iron Longsword",
  "Iron Platebody",
  "Iron Platelegs",
  "Iron Ring",
  "Iron Shield",
  "Iron Sword",
  "Iron Warhammer",
  "Mithril Amulet",
  "Mithril Armor",
  "Mithril Battleaxe",
  "Mithril Boots",
  "Mithril Defender",
  "Mithril Gloves",
  "Mithril Helmet",
  "Mithril Platebody",
  "Mithril Platelegs",
  "Mithril Ring",
  "Mithril Shield",
  "Mithril Sword",
  "Mithril Warhammer",
  "Mummy Lord Staff",
  "Nature Warden Ring",
  "Nightfall Amulet",
  "Nightmare Guard",
  "Nightmare Sword",
  "Obsidian Cape",
  "Orc Shaman Staff",
  "Orc Warlord Axe",
  "Orcish Bulwark",
  "Orcish Cleaver",
  "Orcish Mithril Boots",
  "Orcish Mithril Gloves",
  "Orcish Mithril Helmet",
  "Orcish Mithril Platebody",
  "Orcish Mithril Platelegs",
  "Quarry Amulet",
  "Rune Amulet",
  "Rune Boots",
  "Rune Gloves",
  "Rune Helmet",
  "Rune Platebody",
  "Rune Platelegs",
  "Rune Ring",
  "Rune Shield",
  "Rune Sword",
  "Rune Warhammer",
  "Scorpion Stinger Spear",
  "Shadow Barrier",
  "Shadow Blade",
  "Shadow Cape",
  "Shadow Dagger",
  "Shadow Helm",
  "Shadow Hunter Dagger",
  "Shadow Lord Staff",
  "Shadow Platebody",
  "Shadow Platelegs",
  "Silken Guard",
  "Silver Amulet",
  "Silver Dagger",
  "Silver Ring",
  "Silver Tiara",
  "Spider Fang Sword",
  "Spider Queen Ring",
  "Spider Queen Staff",
  "Spider Silk Hood",
  "Starlit Amulet",
  "Steel Amulet",
  "Steel Boots",
  "Steel Buckler",
  "Steel Gloves",
  "Steel Helmet",
  "Steel Platebody",
  "Steel Platelegs",
  "Steel Ring",
  "Steel Scimitar",
  "Steel Shield",
  "Steel Sword",
  "Steel Tower Shield",
  "Steel Warhammer",
  "Tusk Blade",
  "Tusked Shield",
  "Venom Ward",
  "Venomous Dagger",
  "Void Aegis",
  "Void Amulet",
  "Void Battleaxe",
  "Void Blade",
  "Void Boots",
  "Void Dagger",
  "Void Gloves",
  "Void Helmet",
  "Void King Staff",
  "Void Lord Ring",
  "Void Platebody",
  "Void Platelegs",
  "Void Ring",
  "Void Shield",
  "Wolf Cloak",
  "Wyvern Cape",
  "Wyvern Mithril Boots",
  "Wyvern Mithril Gloves",
  "Wyvern Mithril Helmet",
  "Wyvern Mithril Platebody",
  "Wyvern Mithril Platelegs",
  "Wyvern Scale Armor",
  "abyssal_dagger",
  "abyssal_staff",
  "arcane_hat_t5",
  "arcane_robe_t5",
  "arcane_sandals_t5",
  "arcane_skirt_t5",
  "arcane_wraps_t5",
  "assassin_boots_t5",
  "assassin_gloves_t5",
  "assassin_hood_t5",
  "assassin_pants_t5",
  "assassin_vest_t5",
  "bone_dagger",
  "boneclaw_dagger",
  "celestial_hat_t7",
  "celestial_robe_t7",
  "celestial_sandals_t7",
  "celestial_skirt_t7",
  "celestial_wraps_t7",
  "composite_bow",
  "crypt_shortbow",
  "crypt_ward_shield",
  "darkwood_bow",
  "divine_hat_t6",
  "divine_robe_t6",
  "divine_sandals_t6",
  "divine_skirt_t6",
  "divine_wraps_t6",
  "dragon_bow",
  "dragon_dagger",
  "dragon_fang_blade",
  "dragon_scale_shield",
  "dragon_staff",
  "dragonbone_longbow",
  "dragonclaw_gauntlets",
  "dragonhide_boots_t7",
  "dragonhide_gloves_t7",
  "dragonhide_hood_t7",
  "dragonhide_pants_t7",
  "dragonhide_vest_t7",
  "dragonscale_armor",
  "dunes_boots",
  "dunes_helm",
  "dunes_platebody",
  "dunes_platelegs",
  "dustwalker_boots",
  "elder_bow",
  "elder_staff",
  "erenion_bow",
  "flamescale_staff",
  "frost_blade",
  "frost_boots",
  "frost_bow",
  "frost_helm",
  "frost_platebody",
  "frost_platelegs",
  "goblin_blade",
  "goblin_crown",
  "hardened_boots_t2",
  "hardened_gloves_t2",
  "hardened_hood_t2",
  "hardened_pants_t2",
  "hardened_vest_t2",
  "hunters_bow",
  "infernal_staff",
  "leather_boots_t1",
  "leather_gloves_t1",
  "leather_hood_t1",
  "leather_pants_t1",
  "leather_vest_t1",
  "lich_staff",
  "linen_hat_t1",
  "linen_robe_t1",
  "linen_sandals_t1",
  "linen_skirt_t1",
  "linen_wraps_t1",
  "longbow",
  "magic_bow",
  "magic_staff",
  "maple_bow",
  "maple_staff",
  "mithril_dagger",
  "mystic_hat_t3",
  "mystic_robe_t3",
  "mystic_sandals_t3",
  "mystic_skirt_t3",
  "mystic_wraps_t3",
  "oak_bow",
  "oak_staff",
  "obsidian_blade",
  "obsidian_boots",
  "obsidian_helm",
  "obsidian_platebody",
  "obsidian_platelegs",
  "oracle_hat_t4",
  "oracle_robe_t4",
  "oracle_sandals_t4",
  "oracle_skirt_t4",
  "oracle_wraps_t4",
  "phantom_dagger",
  "phoenix_helm",
  "phoenix_staff",
  "quarry_boots",
  "quarry_helm",
  "quarry_pickaxe",
  "quarry_platebody",
  "quarry_platelegs",
  "raidbreaker_armor",
  "raidbreaker_blade",
  "raidbreaker_helm",
  "ranger_boots_t4",
  "ranger_gloves_t4",
  "ranger_hood_t4",
  "ranger_pants_t4",
  "ranger_vest_t4",
  "rune_dagger",
  "serpent_dagger",
  "shadow_boots_t6",
  "shadow_gloves_t6",
  "shadow_hood_t6",
  "shadow_pants_t6",
  "shadow_vest_t6",
  "shortbow",
  "silk_hat_t2",
  "silk_robe_t2",
  "silk_sandals_t2",
  "silk_skirt_t2",
  "silk_wraps_t2",
  "soulfire_bow",
  "steel_dagger",
  "studded_boots_t3",
  "studded_gloves_t3",
  "studded_hood_t3",
  "studded_pants_t3",
  "studded_vest_t3",
  "sun_blade",
  "thunder_hammer",
  "triple_loot_staff",
  "verdant_boots",
  "verdant_helm",
  "verdant_platebody",
  "verdant_platelegs",
  "verdant_sword",
  "void_bow",
  "void_cloth_hat_t8",
  "void_cloth_robe_t8",
  "void_cloth_sandals_t8",
  "void_cloth_skirt_t8",
  "void_cloth_wraps_t8",
  "void_heart_amulet",
  "void_helm",
  "void_leather_boots_t8",
  "void_leather_gloves_t8",
  "void_leather_hood_t8",
  "void_leather_pants_t8",
  "void_leather_vest_t8",
  "void_soulreaver",
  "void_staff",
  "void_sword",
  "void_warhammer",
  "voidstrike_bow",
  "voidwalker_boots",
  "willow_bow",
  "willow_staff",
  "wraith_boots",
  "yew_bow",
  "yew_staff",
  "Petrified Wood",
  "Darkwood",
  "Ice Wood",
  "Normal Tree",
  "Oak Tree",
  "Willow Tree",
  "Maple Tree",
  "Yew Tree",
  "Magic Tree",
  "Elderwood",
  "Cactus Wood",
  "Dragon Wood",
  "Void Root",
]);

export function isItemTradable(itemId: string): boolean {
  const strippedId = itemId.replace(/#[a-z0-9]{6}$/, '');
  const baseItemId = strippedId.replace(/\s*\((Common|Uncommon|Rare|Epic|Legendary|Mythic)\)$/, '');
  return !UNTRADABLE_ITEM_IDS.has(baseItemId);
}

export function isEquipmentItem(itemId: string): boolean {
  const strippedId = itemId.replace(/#[a-z0-9]{6}$/, '');
  const baseId = strippedId.replace(/\s*\((Common|Uncommon|Rare|Epic|Legendary|Mythic)\)$/, '');
  return EQUIPMENT_BASE_IDS.has(baseId);
}

/**
 * Strips rarity suffix and instance suffix from an item ID, returning the canonical base ID.
 * Handles: "(Rare)", "#abc123" suffixes and leading/trailing whitespace.
 */
export function extractBaseItemId(rawId: string): string {
  return rawId
    .trim()
    .replace(/\s*\((Common|Uncommon|Rare|Epic|Legendary|Mythic)\)\s*$/i, '')
    .replace(/#[a-z0-9]+$/i, '')
    .trim();
}

/**
 * Splits a raw item ID into its base component and any trailing suffix
 * (rarity tag like " (Rare)" or instance tag like "#abc123").
 * The base is returned trimmed; the suffix string captures all trailing tags
 * in order (rarity, then optional instance tag) so they can be reattached to
 * a normalized base without data loss.
 *
 * Supported suffix forms (may appear together, in order):
 *   rarity tag  — " (Common|Uncommon|Rare|Epic|Legendary|Mythic)"
 *   instance tag — "#<alphanumeric>"
 *
 * Examples:
 *   " iron sword (Rare)"        → { base: "iron sword", suffix: " (Rare)" }
 *   "Steel Sword#abc123"        → { base: "Steel Sword", suffix: "#abc123" }
 *   "Iron Sword (Rare)#abc123"  → { base: "Iron Sword",  suffix: " (Rare)#abc123" }
 *   "Iron Sword"                → { base: "Iron Sword",  suffix: "" }
 */
export function splitItemIdSuffix(rawId: string): { base: string; suffix: string } {
  const trimmed = rawId.trim();
  // Parse optional rarity tag followed by optional instance tag, both anchored at end.
  // Regex groups:
  //   1 - base (everything before any suffix)
  //   2 - rarity tag including surrounding whitespace (optional)
  //   3 - instance tag (optional)
  const fullMatch = trimmed.match(
    /^(.*?)(\s*\((Common|Uncommon|Rare|Epic|Legendary|Mythic)\))?(#[a-z0-9]+)?\s*$/i
  );
  if (fullMatch) {
    const base = fullMatch[1].trim();
    const rarityPart = fullMatch[2] ? ' ' + fullMatch[2].trim() : '';
    const instancePart = fullMatch[4] ?? '';
    const suffix = rarityPart + instancePart;
    return { base, suffix };
  }
  return { base: trimmed, suffix: '' };
}

/**
 * Returns a canonical item ID: normalizes the base portion against known IDs
 * while preserving any rarity/instance suffix verbatim.
 * Returns null if the base ID cannot be resolved to a known item.
 */
export function canonicalizeItemId(rawId: string, knownIds: ReadonlySet<string>): string | null {
  const { base, suffix } = splitItemIdSuffix(rawId);
  const normalizedBase = normalizeItemId(base, knownIds);
  if (!knownIds.has(normalizedBase)) return null;
  return normalizedBase + suffix;
}

/**
 * Normalizes a raw item ID string so it can be matched against known item definitions.
 * - Trims whitespace
 * - Strips rarity suffixes and instance suffixes
 * - Attempts to fix casing by trying both the as-is form and a Title Case conversion
 *   (e.g. "iron sword" -> "Iron Sword", "IRON_SWORD" -> "Iron Sword" via underscore split)
 *
 * Returns the normalized ID if a known match is found, otherwise returns the best-effort
 * stripped ID (callers should then validate separately).
 */
export function normalizeItemId(rawId: string, knownIds: ReadonlySet<string>): string {
  const stripped = extractBaseItemId(rawId);

  // Exact match (most common case — already correct)
  if (knownIds.has(stripped)) return stripped;

  // Try replacing underscores with spaces in Title Case (admin panels often use snake_case)
  const titleCase = stripped
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  if (knownIds.has(titleCase)) return titleCase;

  // Try lowercase (some IDs are all lowercase in the DB)
  const lower = stripped.toLowerCase().replace(/_/g, ' ');
  for (const known of knownIds) {
    if (known.toLowerCase() === lower) return known;
  }

  // Try converting display-name format (spaces) to snake_case (for items added via migration)
  // e.g. "Frost Dragon Scale" -> "frost_dragon_scale"
  const snakeCase = stripped.toLowerCase().replace(/\s+/g, '_');
  if (knownIds.has(snakeCase)) return snakeCase;

  // No match found — return the stripped form so the caller can validate/reject
  return stripped;
}

/**
 * Returns true if the given item ID (after normalization) corresponds to a known item.
 * `knownIds` should be a Set of all valid base item IDs from the game items DB.
 */
export function isKnownItemId(rawId: string, knownIds: ReadonlySet<string>): boolean {
  const normalized = normalizeItemId(rawId, knownIds);
  return knownIds.has(normalized);
}
