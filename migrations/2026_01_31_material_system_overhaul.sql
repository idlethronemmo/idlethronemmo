-- ============================================================================
-- MATERIAL SYSTEM OVERHAUL MIGRATION
-- Date: 2026-01-31
-- Description: Renames woodcutting/hunting materials, adds ash system,
--              fire making skill, special equipment with skills
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE NEW LOG MATERIALS
-- ============================================================================
INSERT INTO game_items (id, name, type, vendor_price, description) VALUES
  ('normal_logs', 'Normal Logs', 'material', 4, 'Common logs from normal trees.'),
  ('elderwood_logs', 'Elderwood Logs', 'material', 8, 'Ancient logs from elder trees.'),
  ('oak_logs', 'Oak Logs', 'material', 15, 'Sturdy logs from oak trees.'),
  ('petrified_logs', 'Petrified Logs', 'material', 25, 'Fossilized logs from petrified trees.'),
  ('cactus_logs', 'Cactus Logs', 'material', 40, 'Desert cactus wood.'),
  ('willow_logs', 'Willow Logs', 'material', 60, 'Flexible logs from willow trees.'),
  ('darkwood_logs', 'Darkwood Logs', 'material', 90, 'Dark logs from shadow forests.'),
  ('maple_logs', 'Maple Logs', 'material', 150, 'Sweet-smelling maple logs.'),
  ('dragon_logs', 'Dragon Logs', 'material', 250, 'Fire-resistant dragon wood.'),
  ('yew_logs', 'Yew Logs', 'material', 400, 'Sacred yew tree logs.'),
  ('ice_logs', 'Ice Logs', 'material', 600, 'Frozen logs from frost region.'),
  ('magic_logs', 'Magic Logs', 'material', 900, 'Magical logs pulsing with energy.'),
  ('void_logs', 'Void Logs', 'material', 1400, 'Mysterious logs from the void.')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 2: CREATE NEW HUNTING MATERIALS
-- ============================================================================
INSERT INTO game_items (id, name, type, vendor_price, description) VALUES
  ('rabbit_pelt', 'Rabbit Pelt', 'material', 5, 'Soft pelt from a rabbit.'),
  ('wool', 'Wool', 'material', 8, 'Soft wool from sheep.'),
  ('deer_hide', 'Deer Hide', 'material', 15, 'Hide from a deer.'),
  ('boar_hide', 'Boar Hide', 'material', 25, 'Tough hide from a boar.'),
  ('goat_pelt', 'Goat Pelt', 'material', 40, 'Pelt from a mountain goat.'),
  ('fox_pelt', 'Fox Pelt', 'material', 65, 'Beautiful pelt from a desert fox.'),
  ('camel_hide', 'Camel Hide', 'material', 100, 'Thick hide from a camel.'),
  ('shadow_wolf_pelt', 'Shadow Wolf Pelt', 'material', 180, 'Dark pelt from a shadow wolf.'),
  ('panther_pelt', 'Dark Panther Pelt', 'material', 300, 'Sleek pelt from a dark panther.'),
  ('ice_bear_pelt', 'Ice Bear Pelt', 'material', 500, 'Thick pelt from an ice bear.'),
  ('frost_tiger_pelt', 'Frost Tiger Pelt', 'material', 800, 'Striped pelt from a frost tiger.'),
  ('wyvern_leather', 'Wyvern Leather', 'material', 1200, 'Tough leather from a wyvern.'),
  ('celestial_hide', 'Celestial Hide', 'material', 2000, 'Ethereal hide from a celestial stag.'),
  ('void_beast_hide', 'Void Beast Hide', 'material', 4500, 'Dark hide from a void beast.')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 3: CREATE ASH MATERIALS
-- ============================================================================
INSERT INTO game_items (id, name, type, vendor_price, description) VALUES
  ('basic_ash', 'Basic Ash', 'material', 3, 'Ash from burning normal logs. Used in basic potions.'),
  ('elder_ash', 'Elder Ash', 'material', 5, 'Ash from elderwood. Has minor healing properties.'),
  ('oak_ash', 'Oak Ash', 'material', 8, 'Sturdy oak ash. Good for strength potions.'),
  ('petrified_ash', 'Petrified Ash', 'material', 12, 'Ancient petrified ash with defensive properties.'),
  ('cactus_ash', 'Cactus Ash', 'material', 18, 'Desert cactus ash. Provides poison resistance.'),
  ('willow_ash', 'Willow Ash', 'material', 25, 'Flexible willow ash. Improves agility potions.'),
  ('darkwood_ash', 'Darkwood Ash', 'material', 35, 'Dark ash with shadow properties.'),
  ('maple_ash', 'Maple Ash', 'material', 50, 'Sweet maple ash. Enhances buff duration.'),
  ('dragon_ash', 'Dragon Ash', 'material', 80, 'Fiery ash from dragon wood. Used in powerful potions.'),
  ('yew_ash', 'Yew Ash', 'material', 120, 'Sacred yew ash. Increases potion potency.'),
  ('ice_ash', 'Ice Ash', 'material', 180, 'Frozen ash with frost properties.'),
  ('magic_ash', 'Magic Ash', 'material', 280, 'Magical ash with arcane properties.'),
  ('void_ash', 'Void Ash', 'material', 450, 'Mysterious void ash. Ultimate potion ingredient.')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 4: CREATE RARE DROP MATERIALS
-- ============================================================================
INSERT INTO game_items (id, name, type, vendor_price, description) VALUES
  ('phoenix_feather', 'Phoenix Feather', 'material', 5000, 'A blazing feather from the legendary Phoenix. Burns eternally.'),
  ('frost_dragon_scale', 'Frost Dragon Scale', 'material', 4500, 'An ice-cold scale from a Frost Dragon. Radiates frozen power.'),
  ('void_crystal_shard', 'Void Crystal Shard', 'material', 6000, 'A fragment of pure void energy. Pulses with dark power.'),
  ('ancient_dragon_core', 'Ancient Dragon Core', 'material', 7500, 'The crystallized heart of an Ancient Dragon.'),
  ('shadow_essence_gem', 'Shadow Essence Gem', 'material', 4000, 'Condensed shadow energy. Absorbs light around it.'),
  ('thunder_drake_horn', 'Thunder Drake Horn', 'material', 3500, 'A horn crackling with lightning from Thunder Drake.'),
  ('ice_phoenix_plume', 'Ice Phoenix Plume', 'material', 5500, 'A frozen feather that never melts. From the mythical Ice Phoenix.')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 5: UPDATE WOODCUTTING SKILL ACTIONS
-- ============================================================================
UPDATE game_skill_actions SET item_id = 'normal_logs' WHERE skill = 'woodcutting' AND item_id = 'Normal Tree';
UPDATE game_skill_actions SET item_id = 'elderwood_logs' WHERE skill = 'woodcutting' AND item_id = 'Elderwood';
UPDATE game_skill_actions SET item_id = 'oak_logs' WHERE skill = 'woodcutting' AND item_id = 'Oak Tree';
UPDATE game_skill_actions SET item_id = 'petrified_logs' WHERE skill = 'woodcutting' AND item_id = 'Petrified Wood';
UPDATE game_skill_actions SET item_id = 'cactus_logs' WHERE skill = 'woodcutting' AND item_id = 'Cactus Wood';
UPDATE game_skill_actions SET item_id = 'willow_logs' WHERE skill = 'woodcutting' AND item_id = 'Willow Tree';
UPDATE game_skill_actions SET item_id = 'darkwood_logs' WHERE skill = 'woodcutting' AND item_id = 'Darkwood';
UPDATE game_skill_actions SET item_id = 'maple_logs' WHERE skill = 'woodcutting' AND item_id = 'Maple Tree';
UPDATE game_skill_actions SET item_id = 'dragon_logs' WHERE skill = 'woodcutting' AND item_id = 'Dragon Wood';
UPDATE game_skill_actions SET item_id = 'yew_logs' WHERE skill = 'woodcutting' AND item_id = 'Yew Tree';
UPDATE game_skill_actions SET item_id = 'ice_logs' WHERE skill = 'woodcutting' AND item_id = 'Ice Wood';
UPDATE game_skill_actions SET item_id = 'magic_logs' WHERE skill = 'woodcutting' AND item_id = 'Magic Tree';
UPDATE game_skill_actions SET item_id = 'void_logs' WHERE skill = 'woodcutting' AND item_id = 'Void Root';

-- ============================================================================
-- PART 6: UPDATE HUNTING SKILL ACTIONS
-- ============================================================================
UPDATE game_skill_actions SET item_id = 'rabbit_pelt' WHERE skill = 'hunting' AND item_id = 'raw_hide';
UPDATE game_skill_actions SET item_id = 'wool' WHERE skill = 'hunting' AND item_id = 'linen_cloth';
UPDATE game_skill_actions SET item_id = 'deer_hide' WHERE skill = 'hunting' AND item_id = 'leather_strip';
UPDATE game_skill_actions SET item_id = 'boar_hide' WHERE skill = 'hunting' AND item_id = 'hardened_leather';
UPDATE game_skill_actions SET item_id = 'goat_pelt' WHERE skill = 'hunting' AND item_id = 'silk_thread';
UPDATE game_skill_actions SET item_id = 'fox_pelt' WHERE skill = 'hunting' AND item_id = 'studded_leather';
UPDATE game_skill_actions SET item_id = 'camel_hide' WHERE skill = 'hunting' AND item_id = 'mystic_cloth';
UPDATE game_skill_actions SET item_id = 'shadow_wolf_pelt' WHERE skill = 'hunting' AND item_id = 'ranger_leather';
UPDATE game_skill_actions SET item_id = 'panther_pelt' WHERE skill = 'hunting' AND item_id = 'arcane_silk';
UPDATE game_skill_actions SET item_id = 'ice_bear_pelt' WHERE skill = 'hunting' AND item_id = 'shadow_leather';
UPDATE game_skill_actions SET item_id = 'frost_tiger_pelt' WHERE skill = 'hunting' AND item_id = 'divine_cloth';
UPDATE game_skill_actions SET item_id = 'wyvern_leather' WHERE skill = 'hunting' AND item_id = 'dragon_leather';
UPDATE game_skill_actions SET item_id = 'celestial_hide' WHERE skill = 'hunting' AND item_id = 'void_silk';
UPDATE game_skill_actions SET item_id = 'void_beast_hide' WHERE skill = 'hunting' AND item_id = 'void_leather';

-- ============================================================================
-- PART 7: CREATE FIRE MAKING SKILL ACTIONS
-- ============================================================================
INSERT INTO game_skill_actions (id, skill, name, description, level_required, duration, xp_reward, item_id, required_bait, bait_amount, region_id) VALUES
  ('burn_normal_logs', 'firemaking', 'Burn Normal Logs', 'Burn normal logs to produce basic ash', 1, 4, 25, 'basic_ash', 'normal_logs', 1, NULL),
  ('burn_elderwood_logs', 'firemaking', 'Burn Elderwood Logs', 'Burn elderwood logs to produce elder ash', 5, 5, 40, 'elder_ash', 'elderwood_logs', 1, NULL),
  ('burn_oak_logs', 'firemaking', 'Burn Oak Logs', 'Burn oak logs to produce oak ash', 10, 6, 60, 'oak_ash', 'oak_logs', 1, NULL),
  ('burn_petrified_logs', 'firemaking', 'Burn Petrified Logs', 'Burn petrified logs to produce petrified ash', 15, 7, 85, 'petrified_ash', 'petrified_logs', 1, NULL),
  ('burn_cactus_logs', 'firemaking', 'Burn Cactus Logs', 'Burn cactus logs to produce cactus ash', 20, 8, 115, 'cactus_ash', 'cactus_logs', 1, NULL),
  ('burn_willow_logs', 'firemaking', 'Burn Willow Logs', 'Burn willow logs to produce willow ash', 25, 9, 150, 'willow_ash', 'willow_logs', 1, NULL),
  ('burn_darkwood_logs', 'firemaking', 'Burn Darkwood Logs', 'Burn darkwood logs to produce darkwood ash', 30, 10, 190, 'darkwood_ash', 'darkwood_logs', 1, NULL),
  ('burn_maple_logs', 'firemaking', 'Burn Maple Logs', 'Burn maple logs to produce maple ash', 40, 11, 240, 'maple_ash', 'maple_logs', 1, NULL),
  ('burn_dragon_logs', 'firemaking', 'Burn Dragon Logs', 'Burn dragon logs to produce dragon ash', 50, 12, 300, 'dragon_ash', 'dragon_logs', 1, NULL),
  ('burn_yew_logs', 'firemaking', 'Burn Yew Logs', 'Burn yew logs to produce yew ash', 60, 13, 370, 'yew_ash', 'yew_logs', 1, NULL),
  ('burn_ice_logs', 'firemaking', 'Burn Ice Logs', 'Burn ice logs to produce ice ash', 70, 14, 450, 'ice_ash', 'ice_logs', 1, NULL),
  ('burn_magic_logs', 'firemaking', 'Burn Magic Logs', 'Burn magic logs to produce magic ash', 80, 15, 540, 'magic_ash', 'magic_logs', 1, NULL),
  ('burn_void_logs', 'firemaking', 'Burn Void Logs', 'Burn void logs to produce void ash', 90, 16, 650, 'void_ash', 'void_logs', 1, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 8: UPDATE RECIPE MATERIALS (Woodcutting)
-- ============================================================================
UPDATE game_recipes SET materials = REPLACE(materials::text, '"Normal Tree"', '"normal_logs"')::jsonb WHERE materials::text LIKE '%Normal Tree%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"Elderwood"', '"elderwood_logs"')::jsonb WHERE materials::text LIKE '%Elderwood%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"Oak Tree"', '"oak_logs"')::jsonb WHERE materials::text LIKE '%Oak Tree%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"Petrified Wood"', '"petrified_logs"')::jsonb WHERE materials::text LIKE '%Petrified Wood%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"Cactus Wood"', '"cactus_logs"')::jsonb WHERE materials::text LIKE '%Cactus Wood%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"Willow Tree"', '"willow_logs"')::jsonb WHERE materials::text LIKE '%Willow Tree%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"Darkwood"', '"darkwood_logs"')::jsonb WHERE materials::text LIKE '%Darkwood%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"Maple Tree"', '"maple_logs"')::jsonb WHERE materials::text LIKE '%Maple Tree%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"Dragon Wood"', '"dragon_logs"')::jsonb WHERE materials::text LIKE '%Dragon Wood%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"Yew Tree"', '"yew_logs"')::jsonb WHERE materials::text LIKE '%Yew Tree%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"Ice Wood"', '"ice_logs"')::jsonb WHERE materials::text LIKE '%Ice Wood%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"Magic Tree"', '"magic_logs"')::jsonb WHERE materials::text LIKE '%Magic Tree%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"Void Root"', '"void_logs"')::jsonb WHERE materials::text LIKE '%Void Root%';

-- ============================================================================
-- PART 9: UPDATE RECIPE MATERIALS (Hunting)
-- ============================================================================
UPDATE game_recipes SET materials = REPLACE(materials::text, '"raw_hide"', '"rabbit_pelt"')::jsonb WHERE materials::text LIKE '%raw_hide%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"linen_cloth"', '"wool"')::jsonb WHERE materials::text LIKE '%linen_cloth%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"leather_strip"', '"deer_hide"')::jsonb WHERE materials::text LIKE '%leather_strip%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"hardened_leather"', '"boar_hide"')::jsonb WHERE materials::text LIKE '%hardened_leather%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"silk_thread"', '"goat_pelt"')::jsonb WHERE materials::text LIKE '%silk_thread%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"studded_leather"', '"fox_pelt"')::jsonb WHERE materials::text LIKE '%studded_leather%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"mystic_cloth"', '"camel_hide"')::jsonb WHERE materials::text LIKE '%mystic_cloth%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"ranger_leather"', '"shadow_wolf_pelt"')::jsonb WHERE materials::text LIKE '%ranger_leather%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"arcane_silk"', '"panther_pelt"')::jsonb WHERE materials::text LIKE '%arcane_silk%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"shadow_leather"', '"ice_bear_pelt"')::jsonb WHERE materials::text LIKE '%shadow_leather%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"divine_cloth"', '"frost_tiger_pelt"')::jsonb WHERE materials::text LIKE '%divine_cloth%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"dragon_leather"', '"wyvern_leather"')::jsonb WHERE materials::text LIKE '%dragon_leather%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"void_silk"', '"celestial_hide"')::jsonb WHERE materials::text LIKE '%void_silk%';
UPDATE game_recipes SET materials = REPLACE(materials::text, '"void_leather"', '"void_beast_hide"')::jsonb WHERE materials::text LIKE '%void_leather%';

-- ============================================================================
-- PART 10: UPDATE PLAYER INVENTORIES (Woodcutting materials)
-- Uses COALESCE to sum existing quantities and avoid data loss
-- ============================================================================
UPDATE players SET inventory = (inventory - 'Normal Tree') || jsonb_build_object('normal_logs', COALESCE((inventory->>'normal_logs')::int, 0) + COALESCE((inventory->>'Normal Tree')::int, 0)) WHERE inventory ? 'Normal Tree';
UPDATE players SET inventory = (inventory - 'Elderwood') || jsonb_build_object('elderwood_logs', COALESCE((inventory->>'elderwood_logs')::int, 0) + COALESCE((inventory->>'Elderwood')::int, 0)) WHERE inventory ? 'Elderwood';
UPDATE players SET inventory = (inventory - 'Oak Tree') || jsonb_build_object('oak_logs', COALESCE((inventory->>'oak_logs')::int, 0) + COALESCE((inventory->>'Oak Tree')::int, 0)) WHERE inventory ? 'Oak Tree';
UPDATE players SET inventory = (inventory - 'Petrified Wood') || jsonb_build_object('petrified_logs', COALESCE((inventory->>'petrified_logs')::int, 0) + COALESCE((inventory->>'Petrified Wood')::int, 0)) WHERE inventory ? 'Petrified Wood';
UPDATE players SET inventory = (inventory - 'Cactus Wood') || jsonb_build_object('cactus_logs', COALESCE((inventory->>'cactus_logs')::int, 0) + COALESCE((inventory->>'Cactus Wood')::int, 0)) WHERE inventory ? 'Cactus Wood';
UPDATE players SET inventory = (inventory - 'Willow Tree') || jsonb_build_object('willow_logs', COALESCE((inventory->>'willow_logs')::int, 0) + COALESCE((inventory->>'Willow Tree')::int, 0)) WHERE inventory ? 'Willow Tree';
UPDATE players SET inventory = (inventory - 'Darkwood') || jsonb_build_object('darkwood_logs', COALESCE((inventory->>'darkwood_logs')::int, 0) + COALESCE((inventory->>'Darkwood')::int, 0)) WHERE inventory ? 'Darkwood';
UPDATE players SET inventory = (inventory - 'Maple Tree') || jsonb_build_object('maple_logs', COALESCE((inventory->>'maple_logs')::int, 0) + COALESCE((inventory->>'Maple Tree')::int, 0)) WHERE inventory ? 'Maple Tree';
UPDATE players SET inventory = (inventory - 'Dragon Wood') || jsonb_build_object('dragon_logs', COALESCE((inventory->>'dragon_logs')::int, 0) + COALESCE((inventory->>'Dragon Wood')::int, 0)) WHERE inventory ? 'Dragon Wood';
UPDATE players SET inventory = (inventory - 'Yew Tree') || jsonb_build_object('yew_logs', COALESCE((inventory->>'yew_logs')::int, 0) + COALESCE((inventory->>'Yew Tree')::int, 0)) WHERE inventory ? 'Yew Tree';
UPDATE players SET inventory = (inventory - 'Ice Wood') || jsonb_build_object('ice_logs', COALESCE((inventory->>'ice_logs')::int, 0) + COALESCE((inventory->>'Ice Wood')::int, 0)) WHERE inventory ? 'Ice Wood';
UPDATE players SET inventory = (inventory - 'Magic Tree') || jsonb_build_object('magic_logs', COALESCE((inventory->>'magic_logs')::int, 0) + COALESCE((inventory->>'Magic Tree')::int, 0)) WHERE inventory ? 'Magic Tree';
UPDATE players SET inventory = (inventory - 'Void Root') || jsonb_build_object('void_logs', COALESCE((inventory->>'void_logs')::int, 0) + COALESCE((inventory->>'Void Root')::int, 0)) WHERE inventory ? 'Void Root';

-- ============================================================================
-- PART 11: UPDATE PLAYER INVENTORIES (Hunting materials)
-- Uses COALESCE to sum existing quantities and avoid data loss
-- ============================================================================
UPDATE players SET inventory = (inventory - 'raw_hide') || jsonb_build_object('rabbit_pelt', COALESCE((inventory->>'rabbit_pelt')::int, 0) + COALESCE((inventory->>'raw_hide')::int, 0)) WHERE inventory ? 'raw_hide';
UPDATE players SET inventory = (inventory - 'linen_cloth') || jsonb_build_object('wool', COALESCE((inventory->>'wool')::int, 0) + COALESCE((inventory->>'linen_cloth')::int, 0)) WHERE inventory ? 'linen_cloth';
UPDATE players SET inventory = (inventory - 'leather_strip') || jsonb_build_object('deer_hide', COALESCE((inventory->>'deer_hide')::int, 0) + COALESCE((inventory->>'leather_strip')::int, 0)) WHERE inventory ? 'leather_strip';
UPDATE players SET inventory = (inventory - 'hardened_leather') || jsonb_build_object('boar_hide', COALESCE((inventory->>'boar_hide')::int, 0) + COALESCE((inventory->>'hardened_leather')::int, 0)) WHERE inventory ? 'hardened_leather';
UPDATE players SET inventory = (inventory - 'silk_thread') || jsonb_build_object('goat_pelt', COALESCE((inventory->>'goat_pelt')::int, 0) + COALESCE((inventory->>'silk_thread')::int, 0)) WHERE inventory ? 'silk_thread';
UPDATE players SET inventory = (inventory - 'studded_leather') || jsonb_build_object('fox_pelt', COALESCE((inventory->>'fox_pelt')::int, 0) + COALESCE((inventory->>'studded_leather')::int, 0)) WHERE inventory ? 'studded_leather';
UPDATE players SET inventory = (inventory - 'mystic_cloth') || jsonb_build_object('camel_hide', COALESCE((inventory->>'camel_hide')::int, 0) + COALESCE((inventory->>'mystic_cloth')::int, 0)) WHERE inventory ? 'mystic_cloth';
UPDATE players SET inventory = (inventory - 'ranger_leather') || jsonb_build_object('shadow_wolf_pelt', COALESCE((inventory->>'shadow_wolf_pelt')::int, 0) + COALESCE((inventory->>'ranger_leather')::int, 0)) WHERE inventory ? 'ranger_leather';
UPDATE players SET inventory = (inventory - 'arcane_silk') || jsonb_build_object('panther_pelt', COALESCE((inventory->>'panther_pelt')::int, 0) + COALESCE((inventory->>'arcane_silk')::int, 0)) WHERE inventory ? 'arcane_silk';
UPDATE players SET inventory = (inventory - 'shadow_leather') || jsonb_build_object('ice_bear_pelt', COALESCE((inventory->>'ice_bear_pelt')::int, 0) + COALESCE((inventory->>'shadow_leather')::int, 0)) WHERE inventory ? 'shadow_leather';
UPDATE players SET inventory = (inventory - 'divine_cloth') || jsonb_build_object('frost_tiger_pelt', COALESCE((inventory->>'frost_tiger_pelt')::int, 0) + COALESCE((inventory->>'divine_cloth')::int, 0)) WHERE inventory ? 'divine_cloth';
UPDATE players SET inventory = (inventory - 'dragon_leather') || jsonb_build_object('wyvern_leather', COALESCE((inventory->>'wyvern_leather')::int, 0) + COALESCE((inventory->>'dragon_leather')::int, 0)) WHERE inventory ? 'dragon_leather';
UPDATE players SET inventory = (inventory - 'void_silk') || jsonb_build_object('celestial_hide', COALESCE((inventory->>'celestial_hide')::int, 0) + COALESCE((inventory->>'void_silk')::int, 0)) WHERE inventory ? 'void_silk';
UPDATE players SET inventory = (inventory - 'void_leather') || jsonb_build_object('void_beast_hide', COALESCE((inventory->>'void_beast_hide')::int, 0) + COALESCE((inventory->>'void_leather')::int, 0)) WHERE inventory ? 'void_leather';

-- ============================================================================
-- PART 12: ADD ASH MATERIALS TO ALCHEMY RECIPES (IDEMPOTENT)
-- Only adds ash if not already present in the recipe
-- ============================================================================
UPDATE game_recipes SET materials = materials || '[{"itemId": "basic_ash", "quantity": 1}]'::jsonb WHERE id = 'brew_minor_hp' AND NOT (materials::text LIKE '%basic_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "basic_ash", "quantity": 2}]'::jsonb WHERE id = 'brew_small_hp' AND NOT (materials::text LIKE '%basic_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "elder_ash", "quantity": 2}]'::jsonb WHERE id = 'alchemy_soft_fur_tonic' AND NOT (materials::text LIKE '%elder_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "basic_ash", "quantity": 3}]'::jsonb WHERE id = 'alchemy_minor_healing' AND NOT (materials::text LIKE '%basic_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "oak_ash", "quantity": 2}]'::jsonb WHERE id = 'alchemy_moonlight_elixir' AND NOT (materials::text LIKE '%oak_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "oak_ash", "quantity": 2}]'::jsonb WHERE id = 'alchemy_wolf_fang_elixir' AND NOT (materials::text LIKE '%oak_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "petrified_ash", "quantity": 2}]'::jsonb WHERE id = 'alchemy_bat_wing_brew' AND NOT (materials::text LIKE '%petrified_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "cactus_ash", "quantity": 3}]'::jsonb WHERE id = 'alchemy_antidote' AND NOT (materials::text LIKE '%cactus_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "willow_ash", "quantity": 2}]'::jsonb WHERE id = 'alchemy_shadow_draught' AND NOT (materials::text LIKE '%willow_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "cactus_ash", "quantity": 3}]'::jsonb WHERE id = 'alchemy_sand_storm_elixir' AND NOT (materials::text LIKE '%cactus_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "darkwood_ash", "quantity": 3}]'::jsonb WHERE id = 'alchemy_mummy_antidote' AND NOT (materials::text LIKE '%darkwood_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "darkwood_ash", "quantity": 2}]'::jsonb WHERE id = 'alchemy_sun_crystal_tonic' AND NOT (materials::text LIKE '%darkwood_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "maple_ash", "quantity": 2}]'::jsonb WHERE id = 'alchemy_djinn_essence' AND NOT (materials::text LIKE '%maple_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "maple_ash", "quantity": 3}]'::jsonb WHERE id = 'alchemy_orc_war_potion' AND NOT (materials::text LIKE '%maple_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "dragon_ash", "quantity": 2}]'::jsonb WHERE id = 'alchemy_dark_essence_elixir' AND NOT (materials::text LIKE '%dragon_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "dragon_ash", "quantity": 3}]'::jsonb WHERE id = 'alchemy_wyvern_scale_potion' AND NOT (materials::text LIKE '%dragon_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "dragon_ash", "quantity": 4}]'::jsonb WHERE id = 'alchemy_xp_boost' AND NOT (materials::text LIKE '%dragon_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "yew_ash", "quantity": 3}]'::jsonb WHERE id = 'alchemy_dragonfire_elixir' AND NOT (materials::text LIKE '%yew_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "yew_ash", "quantity": 2}]'::jsonb WHERE id = 'alchemy_dragon_fire_elixir' AND NOT (materials::text LIKE '%yew_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "ice_ash", "quantity": 3}]'::jsonb WHERE id = 'brew_frost_resistance' AND NOT (materials::text LIKE '%ice_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "ice_ash", "quantity": 4}]'::jsonb WHERE id = 'alchemy_frostbite_serum' AND NOT (materials::text LIKE '%ice_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "magic_ash", "quantity": 3}]'::jsonb WHERE id = 'alchemy_infernal_potion' AND NOT (materials::text LIKE '%magic_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "magic_ash", "quantity": 2}]'::jsonb WHERE id = 'brew_dragon_fire' AND NOT (materials::text LIKE '%magic_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "void_ash", "quantity": 3}]'::jsonb WHERE id = 'brew_void_defence' AND NOT (materials::text LIKE '%void_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "void_ash", "quantity": 3}]'::jsonb WHERE id = 'brew_void_strength' AND NOT (materials::text LIKE '%void_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "void_ash", "quantity": 5}]'::jsonb WHERE id = 'brew_cosmic_elixir' AND NOT (materials::text LIKE '%void_ash%');
UPDATE game_recipes SET materials = materials || '[{"itemId": "void_ash", "quantity": 4}]'::jsonb WHERE id = 'alchemy_void_essence_potion' AND NOT (materials::text LIKE '%void_ash%');

-- ============================================================================
-- PART 13: CREATE SPECIAL EQUIPMENT
-- ============================================================================
INSERT INTO game_items (id, name, type, equip_slot, weapon_type, level_required, stats, weapon_skills, description, attack_speed_ms) VALUES
  ('phoenix_staff', 'Phoenix Staff', 'equipment', 'weapon', 'staff', 55, 
   '{"attackBonus": 75, "strengthBonus": 45, "accuracyBonus": 60}',
   '[{"id": "meteor_strike", "chance": 25}]',
   'A legendary staff imbued with phoenix fire. Rains down meteors upon enemies.',
   3000),
  ('frost_bow', 'Frost Bow', 'equipment', 'weapon', 'bow', 60,
   '{"attackBonus": 85, "strengthBonus": 35, "accuracyBonus": 95}',
   '[{"id": "frost_nova", "chance": 20}]',
   'A bow carved from eternal ice. Freezes enemies in their tracks.',
   2400),
  ('thunder_hammer', 'Thunder Hammer', 'equipment', 'weapon', '2h_warhammer', 65,
   '{"attackBonus": 90, "strengthBonus": 70, "accuracyBonus": 40}',
   '[{"id": "thunder_bolt", "chance": 22}]',
   'A massive hammer crackling with lightning. Strikes with thunderous force.',
   3600),
  ('infernal_staff', 'Infernal Staff', 'equipment', 'weapon', 'staff', 75,
   '{"attackBonus": 95, "strengthBonus": 55, "accuracyBonus": 70}',
   '[{"id": "inferno_blast", "chance": 20}]',
   'A staff forged in hellfire. Unleashes devastating fire explosions.',
   3200),
  ('shadow_dagger', 'Shadow Dagger', 'equipment', 'weapon', 'dagger', 50,
   '{"attackBonus": 55, "strengthBonus": 40, "accuracyBonus": 80}',
   '[{"id": "death_combo", "chance": 25}, {"id": "lifesteal_burst", "chance": 15}]',
   'A dagger shrouded in shadow. Strikes rapidly and drains life.',
   1200),
  ('dragon_scale_shield', 'Dragon Scale Shield', 'equipment', 'shield', NULL, 70,
   '{"defenceBonus": 85, "hitpointsBonus": 120}',
   NULL,
   'A shield forged from dragon scales. Nearly impenetrable.',
   NULL),
  ('phoenix_helm', 'Phoenix Helm', 'equipment', 'helmet', NULL, 60,
   '{"defenceBonus": 55, "hitpointsBonus": 80, "attackBonus": 15}',
   NULL,
   'A helm imbued with phoenix essence. Protects against fire.',
   NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 14: CREATE SPECIAL EQUIPMENT CRAFTING RECIPES
-- ============================================================================
INSERT INTO game_recipes (id, skill, result_item_id, materials, level_required, xp_reward, craft_time, result_quantity) VALUES
  ('craft_phoenix_staff', 'crafting', 'phoenix_staff',
   '[{"itemId": "dragon_logs", "quantity": 10}, {"itemId": "phoenix_feather", "quantity": 5}, {"itemId": "Feather", "quantity": 20}, {"itemId": "dragon_ash", "quantity": 8}, {"itemId": "Fire Essence", "quantity": 5}]',
   55, 850, 120, 1),
  ('craft_frost_bow', 'crafting', 'frost_bow',
   '[{"itemId": "ice_logs", "quantity": 15}, {"itemId": "frost_dragon_scale", "quantity": 3}, {"itemId": "ice_ash", "quantity": 10}, {"itemId": "Frost Heart", "quantity": 2}]',
   60, 950, 150, 1),
  ('craft_thunder_hammer', 'crafting', 'thunder_hammer',
   '[{"itemId": "Adamant Bar", "quantity": 20}, {"itemId": "thunder_drake_horn", "quantity": 5}, {"itemId": "yew_logs", "quantity": 10}, {"itemId": "yew_ash", "quantity": 6}]',
   65, 1100, 180, 1),
  ('craft_infernal_staff', 'crafting', 'infernal_staff',
   '[{"itemId": "magic_logs", "quantity": 15}, {"itemId": "ancient_dragon_core", "quantity": 2}, {"itemId": "dragon_ash", "quantity": 15}, {"itemId": "Fire Essence", "quantity": 10}, {"itemId": "Dragonstone", "quantity": 3}]',
   75, 1400, 240, 1),
  ('craft_shadow_dagger', 'crafting', 'shadow_dagger',
   '[{"itemId": "Mithril Bar", "quantity": 10}, {"itemId": "shadow_essence_gem", "quantity": 3}, {"itemId": "darkwood_logs", "quantity": 8}, {"itemId": "darkwood_ash", "quantity": 5}]',
   50, 700, 90, 1),
  ('craft_dragon_scale_shield', 'crafting', 'dragon_scale_shield',
   '[{"itemId": "Dragon Scale", "quantity": 15}, {"itemId": "Rune Bar", "quantity": 20}, {"itemId": "ancient_dragon_core", "quantity": 1}, {"itemId": "dragon_logs", "quantity": 10}]',
   70, 1250, 200, 1),
  ('craft_phoenix_helm', 'crafting', 'phoenix_helm',
   '[{"itemId": "Adamant Bar", "quantity": 15}, {"itemId": "phoenix_feather", "quantity": 3}, {"itemId": "dragon_ash", "quantity": 6}, {"itemId": "Fire Essence", "quantity": 3}]',
   60, 900, 120, 1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 15: DELETE OLD MATERIAL ITEMS (Optional - run after verifying)
-- ============================================================================
-- DELETE FROM game_items WHERE id IN ('Normal Tree', 'Elderwood', 'Oak Tree', 'Petrified Wood', 'Cactus Wood', 'Willow Tree', 'Darkwood', 'Maple Tree', 'Dragon Wood', 'Yew Tree', 'Ice Wood', 'Magic Tree', 'Void Root');
-- DELETE FROM game_items WHERE id IN ('raw_hide', 'linen_cloth', 'leather_strip', 'hardened_leather', 'silk_thread', 'studded_leather', 'mystic_cloth', 'ranger_leather', 'arcane_silk', 'shadow_leather', 'divine_cloth', 'dragon_leather', 'void_silk', 'void_leather');

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
