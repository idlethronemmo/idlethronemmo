export interface Food {
  id: string;
  name: string;
  healAmount: number;
  description: string;
}

// Balanced food healing values based on monster damage per tier:
// Tier 1-2 (1-2 dmg): Basic foods 1-3 HP
// Tier 3 (4-5 dmg): Herring 5 HP
// Tier 4-5 (6-8 dmg): Trout 7 HP
// Tier 6-7 (8-12 dmg): Salmon 9 HP
// Tier 8-9 (12-16 dmg): Tuna/Lobster 12-14 HP
// Tier 10-11 (15-18 dmg): Swordfish 17 HP
// Tier 12-13 (22-24 dmg): Shark 20 HP
// Tier 14-15 (30 dmg): Manta Ray 24 HP
// Tier 16-17 (36-44 dmg): Sea Turtle 28 HP

export const FOODS: Food[] = [
  // Basic Foods - Tier 1-2
  { id: "Raw Shrimp", name: "Raw Shrimp", healAmount: 5, description: "Çiğ karides. 5 HP iyileştirir." },
  { id: "Cooked Shrimp", name: "Cooked Shrimp", healAmount: 25, description: "Pişmiş karides. 25 HP iyileştirir." },
  { id: "Raw Chicken", name: "Raw Chicken", healAmount: 5, description: "Çiğ tavuk eti. 5 HP iyileştirir." },
  { id: "Chicken", name: "Cooked Chicken", healAmount: 30, description: "Pişmiş tavuk. 30 HP iyileştirir." },
  { id: "Raw Rabbit", name: "Raw Rabbit", healAmount: 5, description: "Çiğ tavşan eti. 5 HP iyileştirir." },
  { id: "Cooked Rabbit", name: "Cooked Rabbit", healAmount: 35, description: "Pişmiş tavşan. 35 HP iyileştirir." },
  { id: "Raw Meat", name: "Raw Meat", healAmount: 8, description: "Çiğ et. 8 HP iyileştirir." },
  { id: "Cooked Meat", name: "Cooked Meat", healAmount: 45, description: "Pişmiş et. 45 HP iyileştirir." },
  
  // Fish - Raw (very low healing, encourages cooking)
  { id: "Raw Herring", name: "Raw Herring", healAmount: 10, description: "Çiğ ringa. 10 HP iyileştirir." },
  { id: "Raw Trout", name: "Raw Trout", healAmount: 12, description: "Çiğ alabalık. 12 HP iyileştirir." },
  { id: "Raw Salmon", name: "Raw Salmon", healAmount: 15, description: "Çiğ somon. 15 HP iyileştirir." },
  { id: "Raw Tuna", name: "Raw Tuna", healAmount: 18, description: "Çiğ ton balığı. 18 HP iyileştirir." },
  { id: "Raw Lobster", name: "Raw Lobster", healAmount: 20, description: "Çiğ ıstakoz. 20 HP iyileştirir." },
  { id: "Raw Swordfish", name: "Raw Swordfish", healAmount: 25, description: "Çiğ kılıç balığı. 25 HP iyileştirir." },
  { id: "Raw Shark", name: "Raw Shark", healAmount: 30, description: "Çiğ köpekbalığı. 30 HP iyileştirir." },
  { id: "Raw Manta Ray", name: "Raw Manta Ray", healAmount: 35, description: "Çiğ manta. 35 HP iyileştirir." },
  { id: "Raw Sea Turtle", name: "Raw Sea Turtle", healAmount: 40, description: "Çiğ deniz kaplumbağası. 40 HP iyileştirir." },
  
  // Fish - Cooked (primary combat food)
  { id: "Cooked Herring", name: "Cooked Herring", healAmount: 55, description: "Pişmiş ringa. 55 HP iyileştirir." },
  { id: "Cooked Trout", name: "Cooked Trout", healAmount: 70, description: "Pişmiş alabalık. 70 HP iyileştirir." },
  { id: "Cooked Salmon", name: "Cooked Salmon", healAmount: 90, description: "Pişmiş somon. 90 HP iyileştirir." },
  { id: "Cooked Tuna", name: "Cooked Tuna", healAmount: 110, description: "Pişmiş ton balığı. 110 HP iyileştirir." },
  { id: "Cooked Lobster", name: "Cooked Lobster", healAmount: 135, description: "Pişmiş ıstakoz. 135 HP iyileştirir." },
  { id: "Cooked Swordfish", name: "Cooked Swordfish", healAmount: 165, description: "Pişmiş kılıç balığı. 165 HP iyileştirir." },
  { id: "Cooked Shark", name: "Cooked Shark", healAmount: 200, description: "Pişmiş köpekbalığı. 200 HP iyileştirir." },
  { id: "Cooked Manta Ray", name: "Cooked Manta Ray", healAmount: 250, description: "Pişmiş manta. 250 HP iyileştirir." },
  { id: "Cooked Sea Turtle", name: "Cooked Sea Turtle", healAmount: 310, description: "Pişmiş deniz kaplumbağası. 310 HP iyileştirir." },

  // Sardine
  { id: "Raw Sardine", name: "Raw Sardine", healAmount: 8, description: "Çiğ sardalya. 8 HP iyileştirir." },
  { id: "Cooked Sardine", name: "Cooked Sardine", healAmount: 20, description: "Pişmiş sardalya. 20 HP iyileştirir." },

  // Void Fish
  { id: "Void Fish", name: "Void Fish", healAmount: 45, description: "Boşluk balığı. 45 HP iyileştirir." },

  // Regional Cooked Fish
  { id: "Cooked Spirit Fish", name: "Cooked Spirit Fish", healAmount: 25, description: "Pişmiş ruh balığı. 25 HP iyileştirir." },
  { id: "Cooked Sand Eel", name: "Cooked Sand Eel", healAmount: 60, description: "Pişmiş kum yılan balığı. 60 HP iyileştirir." },
  { id: "Cooked Cave Fish", name: "Cooked Cave Fish", healAmount: 45, description: "Pişmiş mağara balığı. 45 HP iyileştirir." },
  { id: "Cooked Lava Fish", name: "Cooked Lava Fish", healAmount: 80, description: "Pişmiş lav balığı. 80 HP iyileştirir." },
  { id: "Cooked Dragon Fish", name: "Cooked Dragon Fish", healAmount: 100, description: "Pişmiş ejder balığı. 100 HP iyileştirir." },
  { id: "Cooked Frost Fish", name: "Cooked Frost Fish", healAmount: 38, description: "Pişmiş buz balığı. 38 HP iyileştirir." },
  { id: "Cooked Void Fish", name: "Cooked Void Fish", healAmount: 45, description: "Pişmiş boşluk balığı. 45 HP iyileştirir." },
  
  // Special Foods (crafted/rare)
  { id: "dungeon_ration", name: "Dungeon Ration", healAmount: 200, description: "Zindan erzağı. 200 HP iyileştirir." },
  { id: "cursed_bone_broth", name: "Cursed Bone Broth", healAmount: 350, description: "Lanetli kemik suyu. 350 HP iyileştirir." },
  { id: "shadow_stew", name: "Shadow Stew", healAmount: 500, description: "Gölge yahnisi. 500 HP iyileştirir." },
  { id: "dragon_bone_soup", name: "Dragon Bone Soup", healAmount: 700, description: "Ejder kemiği çorbası. 700 HP iyileştirir." },
  { id: "void_feast", name: "Void Feast", healAmount: 950, description: "Boşluk ziyafeti. 950 HP iyileştirir." },
  { id: "Goblin Kebab", name: "Goblin Kebab", healAmount: 110, description: "Baharatlı goblin kebabı. 110 HP iyileştirir." },
  { id: "Spider Soup", name: "Spider Soup", healAmount: 175, description: "Egzotik örümcek çorbası. 175 HP iyileştirir." },
  { id: "Meat Pie", name: "Meat Pie", healAmount: 105, description: "Lezzetli etli börek. 105 HP iyileştirir." },
  { id: "Fish Stew", name: "Fish Stew", healAmount: 155, description: "Doyurucu balık yahnisi. 155 HP iyileştirir." },
  { id: "Orc Roast", name: "Orc Roast", healAmount: 230, description: "Devasa ork rostosu. 230 HP iyileştirir." },
  { id: "Wyvern Steak", name: "Wyvern Steak", healAmount: 35, description: "Wyvern bifteği. 35 HP iyileştirir." },
  { id: "Drake Roast", name: "Drake Roast", healAmount: 40, description: "Drake rostosu. 40 HP iyileştirir." },
  { id: "Dragon Steak", name: "Dragon Steak", healAmount: 42, description: "Efsanevi ejder bifteği. 42 HP iyileştirir." },
  { id: "Frost Dragon Stew", name: "Frost Dragon Stew", healAmount: 50, description: "Buz ejderi yahnisi. 50 HP iyileştirir." },
  { id: "Void Stew", name: "Void Stew", healAmount: 55, description: "Boşluk yahnisi. 55 HP iyileştirir." },
  { id: "Spirit Feast", name: "Spirit Feast", healAmount: 65, description: "Ruh ziyafeti. 65 HP iyileştirir." },
  
  // Non-edible
  { id: "Bones", name: "Bones", healAmount: 0, description: "Canavar kemikleri. Yenilemez." }
];

export function getFoodById(id: string): Food | undefined {
  return FOODS.find(food => food.id === id);
}

export function isFood(itemId: string): boolean {
  const food = getFoodById(itemId);
  return food !== undefined && food.healAmount > 0;
}

export function getFoodHealAmount(itemId: string): number {
  const food = getFoodById(itemId);
  return food?.healAmount || 0;
}
