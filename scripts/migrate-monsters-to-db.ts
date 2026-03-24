import { db } from "../db";
import { gameCombatRegions, gameMonsters, type InsertGameCombatRegion, type InsertGameMonster } from "../shared/schema";
import { MONSTERS } from "../client/src/lib/monsters-data";
import { COMBAT_REGIONS } from "../client/src/lib/monsters";

async function migrateRegions() {
  console.log("Starting regions migration...");
  console.log(`Found ${COMBAT_REGIONS.length} regions to migrate`);

  const regionsData: InsertGameCombatRegion[] = COMBAT_REGIONS.map((region, index) => ({
    id: region.id,
    name: region.name,
    description: region.description,
    levelRangeMin: region.levelRange.min,
    levelRangeMax: region.levelRange.max,
    color: region.color,
    sortOrder: index,
    icon: null,
  }));

  try {
    await db.insert(gameCombatRegions).values(regionsData).onConflictDoNothing();
    console.log(`Migrated ${regionsData.length} regions`);
    return regionsData.length;
  } catch (error) {
    console.error("Error inserting regions:", error);
    return 0;
  }
}

async function migrateMonsters() {
  console.log("\nStarting monsters migration...");
  console.log(`Found ${MONSTERS.length} monsters to migrate`);

  const monstersData: InsertGameMonster[] = MONSTERS.map((monster, index) => ({
    id: monster.id,
    name: monster.name,
    regionId: monster.region,
    maxHitpoints: monster.maxHitpoints,
    attackLevel: monster.attackLevel,
    strengthLevel: monster.strengthLevel,
    defenceLevel: monster.defenceLevel,
    attackBonus: monster.attackBonus || 0,
    strengthBonus: monster.strengthBonus || 0,
    attackSpeed: monster.attackSpeed,
    loot: monster.loot,
    xpReward: monster.xpReward,
    skills: monster.skills || [],
    icon: (monster as any).icon || null,
    sortOrder: index,
  }));

  let insertedMonsters = 0;
  const batchSize = 50;
  
  for (let i = 0; i < monstersData.length; i += batchSize) {
    const batch = monstersData.slice(i, i + batchSize);
    try {
      await db.insert(gameMonsters).values(batch).onConflictDoNothing();
      insertedMonsters += batch.length;
      console.log(`Inserted monsters batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(monstersData.length / batchSize)}`);
    } catch (error) {
      console.error(`Error inserting batch starting at index ${i}:`, error);
    }
  }

  console.log(`Migrated ${insertedMonsters} monsters`);
  return insertedMonsters;
}

async function main() {
  console.log("=== Monsters & Regions Migration ===\n");
  
  try {
    const regionCount = await migrateRegions();
    const monsterCount = await migrateMonsters();
    
    console.log("\n=== Migration Complete ===");
    console.log(`Total regions migrated: ${regionCount}`);
    console.log(`Total monsters migrated: ${monsterCount}`);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
