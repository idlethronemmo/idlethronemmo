import { db } from "../db";
import { gameItems, gameRecipes, type InsertGameItem, type InsertGameRecipe } from "../shared/schema";
import { ITEMS, RECIPES } from "../client/src/lib/items-data";

async function migrateItems() {
  console.log("Starting items migration...");
  console.log(`Found ${ITEMS.length} items to migrate`);

  const gameItemsData: InsertGameItem[] = ITEMS.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    type: item.type,
    equipSlot: item.equipSlot || null,
    stats: item.stats || null,
    levelRequired: item.levelRequired || null,
    skillRequired: item.skillRequired || null,
    vendorPrice: item.vendorPrice || null,
    untradable: item.untradable ? 1 : 0,
    duration: item.duration || null,
    effect: item.effect || null,
    weaponCategory: item.weaponCategory || null,
    attackSpeedMs: item.attackSpeedMs || null,
    lifestealPercent: item.lifestealPercent || null,
    weaponSkills: item.weaponSkills || [],
    icon: item.icon || null,
    healAmount: (item as any).healAmount || null,
  }));

  let insertedItems = 0;
  const batchSize = 100;
  
  for (let i = 0; i < gameItemsData.length; i += batchSize) {
    const batch = gameItemsData.slice(i, i + batchSize);
    try {
      await db.insert(gameItems).values(batch).onConflictDoNothing();
      insertedItems += batch.length;
      console.log(`Inserted items batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(gameItemsData.length / batchSize)}`);
    } catch (error) {
      console.error(`Error inserting batch starting at index ${i}:`, error);
    }
  }

  console.log(`Migrated ${insertedItems} items`);
  return insertedItems;
}

async function migrateRecipes() {
  console.log("\nStarting recipes migration...");
  console.log(`Found ${RECIPES.length} recipes to migrate`);

  const gameRecipesData: InsertGameRecipe[] = RECIPES.map((recipe) => ({
    id: recipe.id,
    resultItemId: recipe.resultItemId,
    resultQuantity: recipe.resultQuantity,
    materials: recipe.materials,
    skill: recipe.skill,
    levelRequired: recipe.levelRequired,
    xpReward: recipe.xpReward,
    craftTime: recipe.craftTime,
    category: recipe.category || null,
  }));

  let insertedRecipes = 0;
  const batchSize = 100;
  
  for (let i = 0; i < gameRecipesData.length; i += batchSize) {
    const batch = gameRecipesData.slice(i, i + batchSize);
    try {
      await db.insert(gameRecipes).values(batch).onConflictDoNothing();
      insertedRecipes += batch.length;
      console.log(`Inserted recipes batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(gameRecipesData.length / batchSize)}`);
    } catch (error) {
      console.error(`Error inserting batch starting at index ${i}:`, error);
    }
  }

  console.log(`Migrated ${insertedRecipes} recipes`);
  return insertedRecipes;
}

async function main() {
  console.log("=== Game Data Migration ===\n");
  
  try {
    const itemCount = await migrateItems();
    const recipeCount = await migrateRecipes();
    
    console.log("\n=== Migration Complete ===");
    console.log(`Total items migrated: ${itemCount}`);
    console.log(`Total recipes migrated: ${recipeCount}`);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
