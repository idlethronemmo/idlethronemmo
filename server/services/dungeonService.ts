import { db } from "../../db";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import {
  dungeons,
  dungeonFloorTemplates,
  dungeonModifiers,
  dungeonLootTables,
  dungeonRuns,
  playerDungeonProgress,
  playerDungeonKeys,
  dungeonLeaderboard,
  players,
  gameMonsters,
  type Dungeon,
  type DungeonFloorTemplate,
  type DungeonModifier,
  type DungeonModifierEffect,
  type DungeonLootTable,
  type DungeonRun,
  type PlayerDungeonProgress,
  type PlayerDungeonKey,
  type DungeonLeaderboard,
  type DungeonPossibleDrop,
  type Player,
  type DungeonCombatState,
  COMBAT_HP_SCALE,
  calculateMaxHit,
  calculateMinHit,
  calculateFinalMaxHit,
  calculateFinalMinHit,
  calculateAccuracyRating,
  calculateEvasionRating,
  calculateHitChance,
  calculateDamageReduction,
  applyDamageReduction,
} from "@shared/schema";
import { resolveEquipmentStats } from "@shared/statResolver";
import { buildSlotsFromCache } from "../statAdapters";
import { cachedGameItems, refreshItemCache } from "../scheduler";
import { getLevelFromXp } from "@shared/gameMath";
import { resolvePlayerCombatStats } from "../playerStatsResolver";

export interface FloorMonsterDetail {
  id: string;
  name: string;
  maxHitpoints: number;
  attackLevel: number;
  strengthLevel: number;
  defenceLevel: number;
  attackSpeed: number;
  icon: string | null;
  skills: any[];
  nameTranslations: Record<string, string> | null;
}

export interface FloorGenerationResult {
  floor: number;
  monsters: string[];
  monsterDetails: FloorMonsterDetail[];
  isBossFloor: boolean;
  bossMonsters: string[];
  lootMultiplier: number;
  powerMultiplier: number;
  modifierChance: number;
}

export interface ModifierEffects {
  lootBonus: number;
  xpBonus: number;
  damageBonus: number;
  defenceBonus: number;
  mobHpBonus: number;
  mobDamageBonus: number;
  specialEffects: string[];
}

export interface LootResult {
  items: Record<string, number>;
  bonusApplied: number;
}

export interface DungeonWithFloorTemplates extends Dungeon {
  floorTemplates: DungeonFloorTemplate[];
}

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  highestFloor: number;
  totalFloorsCleared: number;
  rank: number;
}

export class DungeonService {
  private dungeonCache: Map<string, Dungeon> = new Map();
  private floorTemplateCache: Map<string, DungeonFloorTemplate[]> = new Map();
  private modifierCache: Map<string, DungeonModifier> = new Map();
  private lootTableCache: Map<string, DungeonLootTable[]> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private async refreshCacheIfNeeded(): Promise<void> {
    if (Date.now() < this.cacheExpiry) return;

    const [allDungeons, allFloorTemplates, allModifiers, allLootTables] = await Promise.all([
      db.select().from(dungeons).where(eq(dungeons.isActive, 1)),
      db.select().from(dungeonFloorTemplates),
      db.select().from(dungeonModifiers).where(eq(dungeonModifiers.isActive, 1)),
      db.select().from(dungeonLootTables),
    ]);

    this.dungeonCache.clear();
    this.floorTemplateCache.clear();
    this.modifierCache.clear();
    this.lootTableCache.clear();

    for (const dungeon of allDungeons) {
      this.dungeonCache.set(dungeon.id, dungeon);
    }

    for (const template of allFloorTemplates) {
      const existing = this.floorTemplateCache.get(template.dungeonId) || [];
      existing.push(template);
      this.floorTemplateCache.set(template.dungeonId, existing);
    }

    for (const modifier of allModifiers) {
      this.modifierCache.set(modifier.id, modifier);
    }

    for (const lootTable of allLootTables) {
      const existing = this.lootTableCache.get(lootTable.dungeonId) || [];
      existing.push(lootTable);
      this.lootTableCache.set(lootTable.dungeonId, existing);
    }

    this.cacheExpiry = Date.now() + this.CACHE_DURATION;
  }

  private getLocalizedName(dungeon: Dungeon, language: string = 'en'): string {
    const translations = dungeon.nameTranslations as Record<string, string>;
    return translations[language] || translations.en || dungeon.name;
  }

  private getLocalizedDescription(dungeon: Dungeon, language: string = 'en'): string {
    const translations = dungeon.descriptionTranslations as Record<string, string>;
    return translations[language] || translations.en || dungeon.description;
  }

  async getDungeons(language: string = 'en'): Promise<(Dungeon & { localizedName: string; localizedDescription: string })[]> {
    await this.refreshCacheIfNeeded();
    
    return Array.from(this.dungeonCache.values()).map(dungeon => ({
      ...dungeon,
      localizedName: this.getLocalizedName(dungeon, language),
      localizedDescription: this.getLocalizedDescription(dungeon, language),
    }));
  }

  async getDungeonById(id: string, language: string = 'en'): Promise<DungeonWithFloorTemplates | null> {
    await this.refreshCacheIfNeeded();
    
    const dungeon = this.dungeonCache.get(id);
    if (!dungeon) return null;

    const floorTemplates = this.floorTemplateCache.get(id) || [];
    
    return {
      ...dungeon,
      floorTemplates: floorTemplates.sort((a, b) => a.floorRangeStart - b.floorRangeStart),
    };
  }

  async canEnterDungeon(playerId: string, dungeonId: string): Promise<{ canEnter: boolean; reason?: string }> {
    await this.refreshCacheIfNeeded();
    
    const dungeon = this.dungeonCache.get(dungeonId);
    if (!dungeon) {
      return { canEnter: false, reason: 'Dungeon not found' };
    }

    if (dungeon.isActive !== 1) {
      return { canEnter: false, reason: 'Dungeon is not active' };
    }

    const [activeRun] = await db.select()
      .from(dungeonRuns)
      .where(and(
        eq(dungeonRuns.playerId, playerId),
        eq(dungeonRuns.status, 'active')
      ))
      .limit(1);

    if (activeRun) {
      return { canEnter: false, reason: 'You already have an active dungeon run' };
    }

    const [player] = await db.select()
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    if (!player) {
      return { canEnter: false, reason: 'Player not found' };
    }

    const inventoryKeyId = `${dungeon.keyType}_key`;
    const inventory = player.inventory as Record<string, number> || {};
    const keyCount = inventory[inventoryKeyId] || 0;

    if (keyCount < 1) {
      return { canEnter: false, reason: `Requires a ${dungeon.keyType} key` };
    }

    return { canEnter: true };
  }

  async startDungeonRun(
    playerId: string, 
    dungeonId: string, 
    modifierIds: string[] = []
  ): Promise<{ success: boolean; run?: DungeonRun; error?: string }> {
    const canEnter = await this.canEnterDungeon(playerId, dungeonId);
    if (!canEnter.canEnter) {
      return { success: false, error: canEnter.reason };
    }

    const dungeon = this.dungeonCache.get(dungeonId)!;

    const validModifiers: string[] = [];
    for (const modId of modifierIds) {
      const modifier = this.modifierCache.get(modId);
      if (modifier && modifier.tier <= dungeon.tier) {
        validModifiers.push(modId);
      }
    }

    try {
      const inventoryKeyId = `${dungeon.keyType}_key`;
      const [player] = await db.select()
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      if (!player) {
        return { success: false, error: 'Player not found' };
      }

      const inventory = player.inventory as Record<string, number> || {};
      const keyCount = inventory[inventoryKeyId] || 0;

      if (keyCount < 1) {
        return { success: false, error: `Requires a ${dungeon.keyType} key` };
      }

      const updatedInventory = { ...inventory };
      if (keyCount <= 1) {
        delete updatedInventory[inventoryKeyId];
      } else {
        updatedInventory[inventoryKeyId] = keyCount - 1;
      }

      await db.update(players)
        .set({ inventory: updatedInventory })
        .where(eq(players.id, playerId));

      const [newRun] = await db.insert(dungeonRuns)
        .values({
          playerId,
          dungeonId,
          currentFloor: 1,
          floorsCleared: 0,
          modifiersSelected: validModifiers,
          lootEarned: {},
          status: 'active',
        })
        .returning();

      return { success: true, run: newRun };
    } catch (error) {
      console.error('Failed to start dungeon run:', error);
      return { success: false, error: 'Failed to start dungeon run' };
    }
  }

  async getCurrentRun(playerId: string): Promise<(DungeonRun & { dungeon: Dungeon; floorInfo: FloorGenerationResult; dungeonCombatState: DungeonCombatState | null; inCombat: number; continueOffline: number; goldEarned: number; xpEarned: number }) | null> {
    const [activeRun] = await db.select()
      .from(dungeonRuns)
      .where(and(
        eq(dungeonRuns.playerId, playerId),
        eq(dungeonRuns.status, 'active')
      ))
      .limit(1);

    if (!activeRun) return null;

    await this.refreshCacheIfNeeded();
    
    const dungeon = this.dungeonCache.get(activeRun.dungeonId);
    if (!dungeon) return null;

    let floorInfo: FloorGenerationResult;
    const storedFloorInfo = activeRun.currentFloorInfo as FloorGenerationResult | null;
    if (storedFloorInfo && storedFloorInfo.floor === activeRun.currentFloor) {
      floorInfo = storedFloorInfo;
    } else {
      floorInfo = await this.generateFloorInfo(activeRun.dungeonId, activeRun.currentFloor);
      await db.update(dungeonRuns)
        .set({ currentFloorInfo: floorInfo })
        .where(eq(dungeonRuns.id, activeRun.id));
    }

    return {
      ...activeRun,
      dungeon,
      floorInfo,
      dungeonCombatState: (activeRun.dungeonCombatState as DungeonCombatState | null) || null,
      inCombat: activeRun.inCombat,
      continueOffline: activeRun.continueOffline,
      goldEarned: activeRun.goldEarned,
      xpEarned: activeRun.xpEarned,
    };
  }

  async generateFloorInfo(dungeonId: string, floorNumber: number): Promise<FloorGenerationResult> {
    await this.refreshCacheIfNeeded();
    
    const templates = this.floorTemplateCache.get(dungeonId) || [];
    
    let template = templates.find(t => 
      floorNumber >= t.floorRangeStart && floorNumber <= t.floorRangeEnd
    );

    if (!template && templates.length > 0) {
      const sorted = [...templates].sort((a, b) => b.floorRangeEnd - a.floorRangeEnd);
      template = sorted[0];
    }

    if (!template) {
      return {
        floor: floorNumber,
        monsters: [],
        monsterDetails: [],
        isBossFloor: false,
        bossMonsters: [],
        lootMultiplier: 100,
        powerMultiplier: 100,
        modifierChance: 0,
      };
    }

    const isOverflow = floorNumber > template.floorRangeEnd;
    const overflowMultiplier = isOverflow
      ? 1 + Math.log(1 + (floorNumber - template.floorRangeEnd) / 5) * 0.5
      : 1;

    const monsterPool = (template.monsterPool as string[]) || [];
    const monsterCount = Math.floor(Math.random() * (template.monsterCountMax - template.monsterCountMin + 1)) + template.monsterCountMin;
    
    const selectedMonsters: string[] = [];
    for (let i = 0; i < monsterCount && monsterPool.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * monsterPool.length);
      selectedMonsters.push(monsterPool[randomIndex]);
    }

    const bossMonsterIds = (template.bossMonsterIds as string[]) || [];
    const isBossFloor = isOverflow
      ? (floorNumber % 5 === 0 && bossMonsterIds.length > 0)
      : template.isBossFloor === 1;

    const allMonsterIds = Array.from(new Set([...selectedMonsters, ...(isBossFloor ? bossMonsterIds : [])]));
    const monsterRows = allMonsterIds.length > 0 
      ? await db.select().from(gameMonsters).where(inArray(gameMonsters.id, allMonsterIds))
      : [];
    const monsterDetails: FloorMonsterDetail[] = monsterRows.map(m => ({
      id: m.id,
      name: m.name,
      maxHitpoints: m.maxHitpoints,
      attackLevel: m.attackLevel,
      strengthLevel: m.strengthLevel,
      defenceLevel: m.defenceLevel,
      attackSpeed: m.attackSpeed || 3000,
      icon: m.icon,
      skills: (m.skills as any[]) || [],
      nameTranslations: m.nameTranslations as Record<string, string> | null,
    }));

    return {
      floor: floorNumber,
      monsters: selectedMonsters,
      monsterDetails,
      isBossFloor,
      bossMonsters: isBossFloor ? bossMonsterIds : [],
      lootMultiplier: Math.floor(template.lootMultiplier * overflowMultiplier),
      powerMultiplier: Math.floor(template.powerMultiplier * overflowMultiplier),
      modifierChance: template.modifierChance,
    };
  }

  async progressFloor(runId: string): Promise<{ success: boolean; floorInfo?: FloorGenerationResult; completed?: boolean; error?: string }> {
    const [run] = await db.select()
      .from(dungeonRuns)
      .where(eq(dungeonRuns.id, runId))
      .limit(1);

    if (!run) {
      return { success: false, error: 'Run not found' };
    }

    if (run.status !== 'active') {
      return { success: false, error: 'Run is not active' };
    }

    await this.refreshCacheIfNeeded();
    const dungeon = this.dungeonCache.get(run.dungeonId);
    if (!dungeon) {
      return { success: false, error: 'Dungeon not found' };
    }

    const nextFloor = run.currentFloor + 1;

    if (dungeon.floorCount && nextFloor > dungeon.floorCount && dungeon.isEndless !== 1) {
      await this.completeDungeonRun(runId, true);
      return { success: true, completed: true };
    }

    await db.update(dungeonRuns)
      .set({
        currentFloor: nextFloor,
        floorsCleared: run.floorsCleared + 1,
      })
      .where(eq(dungeonRuns.id, runId));

    const floorInfo = await this.generateFloorInfo(run.dungeonId, nextFloor);

    return { success: true, floorInfo };
  }

  async completeDungeonRun(runId: string, success: boolean): Promise<{ success: boolean; loot?: LootResult; error?: string }> {
    const [run] = await db.select()
      .from(dungeonRuns)
      .where(eq(dungeonRuns.id, runId))
      .limit(1);

    if (!run) {
      return { success: false, error: 'Run not found' };
    }

    const status = success ? 'completed' : 'failed';
    const loot = success ? await this.calculateLoot(run) : { items: {}, bonusApplied: 0 };

    await db.update(dungeonRuns)
      .set({
        status,
        endedAt: new Date(),
        lootEarned: loot.items,
      })
      .where(eq(dungeonRuns.id, runId));

    if (success) {
      await this.updatePlayerProgress(run.playerId, run.dungeonId, run.floorsCleared + 1);
      await this.updateLeaderboard(run.playerId, run.dungeonId, run.floorsCleared + 1);
    }

    return { success: true, loot };
  }

  async calculateLoot(run: DungeonRun): Promise<LootResult> {
    await this.refreshCacheIfNeeded();
    
    const lootTables = this.lootTableCache.get(run.dungeonId) || [];
    const modifierEffects = await this.getModifierEffects(run.modifiersSelected as string[]);
    
    const items: Record<string, number> = {};
    
    const lootTable = lootTables.find(t => 
      run.currentFloor >= t.floorRangeStart && run.currentFloor <= t.floorRangeEnd
    );

    if (lootTable) {
      const guaranteedDrops = (lootTable.guaranteedDrops as string[]) || [];
      for (const itemId of guaranteedDrops) {
        items[itemId] = (items[itemId] || 0) + 1;
      }

      const possibleDrops = (lootTable.possibleDrops as DungeonPossibleDrop[]) || [];
      if (possibleDrops.length > 0) {
        const totalWeight = possibleDrops.reduce((sum, drop) => sum + drop.weight, 0);
        const roll = Math.random() * totalWeight;
        
        let currentWeight = 0;
        for (const drop of possibleDrops) {
          currentWeight += drop.weight;
          if (roll < currentWeight) {
            items[drop.itemId] = (items[drop.itemId] || 0) + 1;
            break;
          }
        }
      }
    }

    const lootBonus = modifierEffects.lootBonus;
    if (lootBonus > 0) {
      for (const itemId in items) {
        const bonusChance = Math.random() * 100;
        if (bonusChance < lootBonus) {
          items[itemId] = Math.ceil(items[itemId] * (1 + lootBonus / 100));
        }
      }
    }

    const floorTemplates = this.floorTemplateCache.get(run.dungeonId) || [];
    const currentTemplate = floorTemplates.find(t => 
      run.currentFloor >= t.floorRangeStart && run.currentFloor <= t.floorRangeEnd
    );
    const isBossFloor = currentTemplate?.isBossFloor === 1;

    if (isBossFloor) {
      for (const itemId in items) {
        items[itemId] = Math.ceil(items[itemId] * 2);
      }

      const bossGoldBonus = Math.floor(run.currentFloor * 15 + Math.random() * run.currentFloor * 10);
      items['Gold Coins'] = (items['Gold Coins'] || 0) + bossGoldBonus;
    }

    return { items, bonusApplied: lootBonus };
  }

  async getModifierEffects(modifierIds: string[]): Promise<ModifierEffects> {
    await this.refreshCacheIfNeeded();
    
    const effects: ModifierEffects = {
      lootBonus: 0,
      xpBonus: 0,
      damageBonus: 0,
      defenceBonus: 0,
      mobHpBonus: 0,
      mobDamageBonus: 0,
      specialEffects: [],
    };

    for (const modId of modifierIds) {
      const modifier = this.modifierCache.get(modId);
      if (!modifier) continue;

      const effect = modifier.effect as DungeonModifierEffect;
      if (effect.lootBonus) effects.lootBonus += effect.lootBonus;
      if (effect.xpBonus) effects.xpBonus += effect.xpBonus;
      if (effect.damageBonus) effects.damageBonus += effect.damageBonus;
      if (effect.defenceBonus) effects.defenceBonus += effect.defenceBonus;
      if (effect.mobHpBonus) effects.mobHpBonus += effect.mobHpBonus;
      if (effect.mobDamageBonus) effects.mobDamageBonus += effect.mobDamageBonus;
      if (effect.specialEffect) effects.specialEffects.push(effect.specialEffect);
    }

    return effects;
  }

  applyModifiersToCombatStats(
    baseStats: { attack: number; strength: number; defence: number },
    effects: ModifierEffects
  ): { attack: number; strength: number; defence: number } {
    return {
      attack: Math.floor(baseStats.attack * (1 + effects.damageBonus / 100)),
      strength: Math.floor(baseStats.strength * (1 + effects.damageBonus / 100)),
      defence: Math.floor(baseStats.defence * (1 + effects.defenceBonus / 100)),
    };
  }

  applyModifiersToMonsterStats(
    baseStats: { hp: number; damage: number },
    effects: ModifierEffects
  ): { hp: number; damage: number } {
    return {
      hp: Math.floor(baseStats.hp * (1 + effects.mobHpBonus / 100)),
      damage: Math.floor(baseStats.damage * (1 + effects.mobDamageBonus / 100)),
    };
  }

  private async resolvePlayerStats(player: Player): Promise<ReturnType<typeof resolvePlayerCombatStats>> {
    const skills = (player.skills as Record<string, { xp: number; level: number }>) || {};
    const equipment = (player.equipment as Record<string, string | null>) || {};
    const activeBuffs = (player.activeBuffs || []) as Array<{ effectType: string; value: number; expiresAt: number }>;
    const itemModifications = (player.itemModifications as Record<string, any>) || {};

    if (cachedGameItems.size === 0) await refreshItemCache();

    let enhancementLevels = new Map<string, number>();
    try {
      const result = await db.execute(sql`
        SELECT item_id, enhancement_level 
        FROM weapon_enhancements 
        WHERE player_id = ${player.id}
      `);
      for (const row of result.rows as any[]) {
        if (row.enhancement_level > 0) {
          enhancementLevels.set(row.item_id, row.enhancement_level);
        }
      }
    } catch (e) {}

    return resolvePlayerCombatStats({
      skills,
      equipment,
      itemModifications,
      activeBuffs,
      enhancementLevels,
    });
  }

  private async updatePlayerProgress(playerId: string, dungeonId: string, floorsCleared: number): Promise<void> {
    const [existing] = await db.select()
      .from(playerDungeonProgress)
      .where(and(
        eq(playerDungeonProgress.playerId, playerId),
        eq(playerDungeonProgress.dungeonId, dungeonId)
      ))
      .limit(1);

    if (existing) {
      await db.update(playerDungeonProgress)
        .set({
          highestFloor: Math.max(existing.highestFloor, floorsCleared),
          totalClears: existing.totalClears + 1,
          weeklyClears: existing.weeklyClears + 1,
          lastRunAt: new Date(),
        })
        .where(eq(playerDungeonProgress.id, existing.id));
    } else {
      await db.insert(playerDungeonProgress)
        .values({
          playerId,
          dungeonId,
          highestFloor: floorsCleared,
          totalClears: 1,
          weeklyClears: 1,
          lastRunAt: new Date(),
        });
    }
  }

  private async updateLeaderboard(playerId: string, dungeonId: string, floorsCleared: number): Promise<void> {
    const weekStart = this.getWeekStart(new Date());

    const [existing] = await db.select()
      .from(dungeonLeaderboard)
      .where(and(
        eq(dungeonLeaderboard.playerId, playerId),
        eq(dungeonLeaderboard.dungeonId, dungeonId),
        eq(dungeonLeaderboard.weekStart, weekStart)
      ))
      .limit(1);

    if (existing) {
      await db.update(dungeonLeaderboard)
        .set({
          highestFloor: Math.max(existing.highestFloor, floorsCleared),
          totalFloorsCleared: existing.totalFloorsCleared + floorsCleared,
        })
        .where(eq(dungeonLeaderboard.id, existing.id));
    } else {
      await db.insert(dungeonLeaderboard)
        .values({
          playerId,
          dungeonId,
          weekStart,
          highestFloor: floorsCleared,
          totalFloorsCleared: floorsCleared,
        });
    }
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async getDungeonLeaderboard(dungeonId: string, weekStart: Date): Promise<LeaderboardEntry[]> {
    const entries = await db.select({
      playerId: dungeonLeaderboard.playerId,
      highestFloor: dungeonLeaderboard.highestFloor,
      totalFloorsCleared: dungeonLeaderboard.totalFloorsCleared,
      playerName: players.username,
    })
      .from(dungeonLeaderboard)
      .innerJoin(players, eq(dungeonLeaderboard.playerId, players.id))
      .where(and(
        eq(dungeonLeaderboard.dungeonId, dungeonId),
        eq(dungeonLeaderboard.weekStart, weekStart)
      ))
      .orderBy(desc(dungeonLeaderboard.highestFloor), desc(dungeonLeaderboard.totalFloorsCleared))
      .limit(100);

    return entries.map((entry, index) => ({
      playerId: entry.playerId,
      playerName: entry.playerName,
      highestFloor: entry.highestFloor,
      totalFloorsCleared: entry.totalFloorsCleared,
      rank: index + 1,
    }));
  }

  async abandonRun(playerId: string): Promise<{ success: boolean; error?: string }> {
    const [run] = await db.select()
      .from(dungeonRuns)
      .where(and(
        eq(dungeonRuns.playerId, playerId),
        eq(dungeonRuns.status, 'active')
      ))
      .limit(1);

    if (!run) {
      return { success: false, error: 'No active run found' };
    }

    if (run.inCombat === 1) {
      return { success: false, error: 'Cannot abandon during active combat' };
    }

    await db.update(dungeonRuns)
      .set({
        status: 'abandoned',
        endedAt: new Date(),
      })
      .where(eq(dungeonRuns.id, run.id));

    return { success: true };
  }

  async startFloorCombat(runId: string, playerId: string): Promise<{ success: boolean; combatState?: DungeonCombatState; error?: string }> {
    const [run] = await db.select()
      .from(dungeonRuns)
      .where(and(
        eq(dungeonRuns.id, runId),
        eq(dungeonRuns.playerId, playerId),
        eq(dungeonRuns.status, 'active')
      ))
      .limit(1);

    if (!run) {
      return { success: false, error: 'No active run found' };
    }

    if (run.inCombat === 1) {
      const existingCombat = run.dungeonCombatState as DungeonCombatState | null;
      if (existingCombat && existingCombat.lastTickAt) {
        const stuckDuration = Date.now() - existingCombat.lastTickAt;
        if (stuckDuration > 5 * 60 * 1000) {
          await db.update(dungeonRuns)
            .set({ inCombat: 0, dungeonCombatState: null })
            .where(eq(dungeonRuns.id, run.id));
        } else {
          return { success: false, error: 'Already in combat' };
        }
      } else {
        return { success: false, error: 'Already in combat' };
      }
    }

    let floorInfo: FloorGenerationResult;
    const storedFloorInfo = run.currentFloorInfo as FloorGenerationResult | null;
    if (storedFloorInfo && storedFloorInfo.floor === run.currentFloor) {
      floorInfo = storedFloorInfo;
    } else {
      floorInfo = await this.generateFloorInfo(run.dungeonId, run.currentFloor);
      await db.update(dungeonRuns)
        .set({ currentFloorInfo: floorInfo })
        .where(eq(dungeonRuns.id, run.id));
    }

    let monsterId: string;
    if (floorInfo.isBossFloor && floorInfo.bossMonsters.length > 0) {
      monsterId = floorInfo.bossMonsters[0];
    } else if (floorInfo.monsters.length > 0) {
      monsterId = floorInfo.monsters[0];
    } else {
      return { success: false, error: 'No monsters on this floor' };
    }

    const [monster] = await db.select().from(gameMonsters).where(eq(gameMonsters.id, monsterId)).limit(1);
    if (!monster) {
      return { success: false, error: 'Monster not found' };
    }

    const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    const stats = await this.resolvePlayerStats(player);
    const playerMaxHp = stats.maxHp;
    const playerHp = Math.min(player.currentHitpoints, playerMaxHp);

    const powerMult = (floorInfo.powerMultiplier || 100) / 100;
    const dungeon = this.dungeonCache.get(run.dungeonId);
    const totalFloors = dungeon?.floorCount || 100;
    const randomBonus = this.getFloorRandomBonus(run.currentFloor, totalFloors, floorInfo.isBossFloor);
    const scaledAttack = Math.floor(monster.attackLevel * powerMult * randomBonus);
    const scaledDefence = Math.floor(monster.defenceLevel * powerMult * randomBonus);
    const scaledMaxHp = Math.floor(monster.maxHitpoints * powerMult * randomBonus) * COMBAT_HP_SCALE;

    const combatState: DungeonCombatState = {
      monsterId: monster.id,
      monsterName: monster.name,
      monsterLevel: scaledAttack,
      monsterHp: scaledMaxHp,
      monsterMaxHp: scaledMaxHp,
      monsterAttack: scaledAttack,
      monsterDefence: scaledDefence,
      monsterAttackSpeed: monster.attackSpeed || 3000,
      monsterImage: monster.icon || undefined,
      playerHp,
      playerMaxHp,
      isBossFloor: floorInfo.isBossFloor,
      powerMultiplier: powerMult,
      combatStartedAt: Date.now(),
      lastTickAt: Date.now(),
    };

    await db.update(dungeonRuns)
      .set({
        inCombat: 1,
        dungeonCombatState: combatState,
      })
      .where(eq(dungeonRuns.id, runId));

    return { success: true, combatState };
  }

  async processDungeonCombatTick(runId: string, playerId: string): Promise<{
    success: boolean;
    playerHit?: boolean;
    playerDamage?: number;
    monsterHit?: boolean;
    monsterDamage?: number;
    monsterDefeated?: boolean;
    playerDied?: boolean;
    combatState?: DungeonCombatState;
    floorCleared?: boolean;
    dungeonCompleted?: boolean;
    loot?: Record<string, number>;
    goldGained?: number;
    xpGained?: number;
    error?: string;
  }> {
    const [run] = await db.select()
      .from(dungeonRuns)
      .where(and(
        eq(dungeonRuns.id, runId),
        eq(dungeonRuns.playerId, playerId),
        eq(dungeonRuns.status, 'active')
      ))
      .limit(1);

    if (!run) {
      return { success: false, error: 'No active run found' };
    }

    if (run.inCombat !== 1 || !run.dungeonCombatState) {
      return { success: false, error: 'Not in combat' };
    }

    const combatState = run.dungeonCombatState as DungeonCombatState;

    const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    const stats = await this.resolvePlayerStats(player);
    const { attackLevel, strengthLevel, defenceLevel } = stats;
    const equipBonuses = stats.equipBonuses;

    const baseAccuracy = calculateAccuracyRating(attackLevel, equipBonuses.attackBonus || 0);
    const playerAccuracy = Math.floor(baseAccuracy * (1 + stats.buffs.attackBoostPercent / 100) * stats.styleModifiers.accuracyMod);
    const monsterEvasion = calculateEvasionRating(combatState.monsterDefence, 0);
    const playerHitChance = calculateHitChance(playerAccuracy, monsterEvasion);

    let playerHit = false;
    let playerDamage = 0;

    if (Math.random() * 100 < playerHitChance) {
      playerHit = true;
      const maxHit = calculateFinalMaxHit(strengthLevel, equipBonuses.strengthBonus || 0, combatState.monsterDefence);
      const minHit = calculateFinalMinHit(strengthLevel, equipBonuses.strengthBonus || 0, combatState.monsterDefence);
      const baseHit = Math.floor(Math.random() * (maxHit - minHit + 1)) + minHit;
      playerDamage = Math.max(0, Math.floor(baseHit * (1 + stats.buffs.strengthBoostPercent / 100) * stats.styleModifiers.damageMod));
    }

    combatState.monsterHp -= playerDamage;
    if (combatState.monsterHp < 0) combatState.monsterHp = 0;

    let monsterHit = false;
    let monsterDamage = 0;
    let playerDied = false;
    let monsterDefeated = combatState.monsterHp <= 0;

    if (!monsterDefeated) {
      const monsterAccuracy = calculateAccuracyRating(combatState.monsterAttack, 0);
      const baseEvasion = calculateEvasionRating(defenceLevel, equipBonuses.defenceBonus || 0);
      const playerEvasion = Math.floor(baseEvasion * (1 + stats.buffs.defenceBoostPercent / 100) * stats.styleModifiers.defenceMod);
      const monsterHitChance = calculateHitChance(monsterAccuracy, playerEvasion);

      if (Math.random() * 100 < monsterHitChance) {
        monsterHit = true;
        const monsterMaxHit = calculateMaxHit(combatState.monsterAttack, 0);
        const monsterMinHit = calculateMinHit(combatState.monsterAttack, 0);
        const rawDamage = Math.floor(Math.random() * (monsterMaxHit - monsterMinHit + 1)) + monsterMinHit;
        const totalDefence = Math.floor((defenceLevel + (equipBonuses.defenceBonus || 0)) * (1 + stats.buffs.defenceBoostPercent / 100) * stats.styleModifiers.defenceMod);
        monsterDamage = applyDamageReduction(rawDamage, totalDefence);
        if (monsterDamage < 0) monsterDamage = 0;
      }

      combatState.playerHp -= monsterDamage;
      if (combatState.playerHp < 0) combatState.playerHp = 0;
      playerDied = combatState.playerHp <= 0;
    }

    combatState.lastTickAt = Date.now();

    if (monsterDefeated) {
      const lootResult = await this.calculateLoot(run);
      const existingLoot = (run.lootEarned as Record<string, number>) || {};
      const mergedLoot = { ...existingLoot };
      for (const [itemId, qty] of Object.entries(lootResult.items)) {
        mergedLoot[itemId] = (mergedLoot[itemId] || 0) + qty;
      }

      const [monster] = await db.select().from(gameMonsters).where(eq(gameMonsters.id, combatState.monsterId)).limit(1);

      const rewardMult = combatState.powerMultiplier || 1;
      const isBossKill2 = combatState.isBossFloor === true;
      const bossRewardMult2 = isBossKill2 ? 3 : 1;
      let goldGained = Math.floor((Math.random() * 16 + 5) * run.currentFloor * rewardMult * bossRewardMult2);
      let xpGained = Math.floor(combatState.monsterLevel * 10 * rewardMult * (isBossKill2 ? 2 : 1));

      if (monster) {
        const xpReward = monster.xpReward as Record<string, number> | null;
        if (xpReward) {
          xpGained = Math.floor(Object.values(xpReward).reduce((sum, val) => sum + (val || 0), 0) * rewardMult * (isBossKill2 ? 2 : 1));
        }
      }

      const newFloorsCleared = run.floorsCleared + 1;

      await this.refreshCacheIfNeeded();
      const dungeon = this.dungeonCache.get(run.dungeonId);
      const dungeonCompleted = dungeon?.floorCount && dungeon.isEndless !== 1 ? newFloorsCleared >= dungeon.floorCount : false;

      if (dungeonCompleted) {
        await db.update(dungeonRuns)
          .set({
            inCombat: 0,
            dungeonCombatState: null,
            floorsCleared: newFloorsCleared,
            lootEarned: mergedLoot,
            goldEarned: run.goldEarned + goldGained,
            xpEarned: run.xpEarned + xpGained,
            status: 'completed',
            endedAt: new Date(),
          })
          .where(eq(dungeonRuns.id, runId));

        await this.updatePlayerProgress(playerId, run.dungeonId, newFloorsCleared);
        await this.updateLeaderboard(playerId, run.dungeonId, newFloorsCleared);
      } else {
        await db.update(dungeonRuns)
          .set({
            inCombat: 0,
            dungeonCombatState: null,
            floorsCleared: newFloorsCleared,
            currentFloor: run.currentFloor + 1,
            lootEarned: mergedLoot,
            goldEarned: run.goldEarned + goldGained,
            xpEarned: run.xpEarned + xpGained,
          })
          .where(eq(dungeonRuns.id, runId));
      }

      return {
        success: true,
        playerHit,
        playerDamage,
        monsterHit: false,
        monsterDamage: 0,
        monsterDefeated: true,
        playerDied: false,
        combatState,
        floorCleared: true,
        dungeonCompleted,
        loot: lootResult.items,
        goldGained,
        xpGained,
      };
    }

    if (playerDied) {
      await db.update(dungeonRuns)
        .set({
          inCombat: 0,
          dungeonCombatState: null,
          status: 'failed',
          endedAt: new Date(),
        })
        .where(eq(dungeonRuns.id, runId));

      await db.update(players)
        .set({ currentHitpoints: combatState.playerMaxHp })
        .where(eq(players.id, playerId));

      return {
        success: true,
        playerHit,
        playerDamage,
        monsterHit,
        monsterDamage,
        monsterDefeated: false,
        playerDied: true,
        combatState,
        floorCleared: false,
      };
    }

    await db.update(dungeonRuns)
      .set({ dungeonCombatState: combatState })
      .where(eq(dungeonRuns.id, runId));

    return {
      success: true,
      playerHit,
      playerDamage,
      monsterHit,
      monsterDamage,
      monsterDefeated: false,
      playerDied: false,
      combatState,
      floorCleared: false,
    };
  }

  async fleeFromFloor(runId: string, playerId: string): Promise<{ success: boolean; completed?: boolean; skipFloorsUsed?: number; skipFloorsMax?: number; error?: string }> {
    const [run] = await db.select()
      .from(dungeonRuns)
      .where(and(
        eq(dungeonRuns.id, runId),
        eq(dungeonRuns.playerId, playerId),
        eq(dungeonRuns.status, 'active')
      ))
      .limit(1);

    if (!run) {
      return { success: false, error: 'No active run found' };
    }

    if (run.inCombat === 1) {
      return { success: false, error: 'Cannot skip during active combat' };
    }

    const skipUsed = run.skipFloorsUsed || 0;
    const skipMax = run.skipFloorsMax || 3;
    if (skipUsed >= skipMax) {
      return { success: false, error: 'No skip attempts remaining' };
    }

    await this.refreshCacheIfNeeded();
    const dungeon = this.dungeonCache.get(run.dungeonId);
    if (!dungeon) {
      return { success: false, error: 'Dungeon not found' };
    }

    const newFloorsCleared = run.floorsCleared + 1;
    const nextFloor = run.currentFloor + 1;
    const newSkipUsed = skipUsed + 1;
    const dungeonCompleted = dungeon.floorCount && dungeon.isEndless !== 1 ? newFloorsCleared >= dungeon.floorCount : false;

    if (dungeonCompleted) {
      await db.update(dungeonRuns)
        .set({
          floorsCleared: newFloorsCleared,
          skipFloorsUsed: newSkipUsed,
          status: 'completed',
          endedAt: new Date(),
        })
        .where(eq(dungeonRuns.id, runId));

      await this.updatePlayerProgress(playerId, run.dungeonId, newFloorsCleared);
      await this.updateLeaderboard(playerId, run.dungeonId, newFloorsCleared);

      return { success: true, completed: true, skipFloorsUsed: newSkipUsed, skipFloorsMax: skipMax };
    }

    await db.update(dungeonRuns)
      .set({
        currentFloor: nextFloor,
        floorsCleared: newFloorsCleared,
        skipFloorsUsed: newSkipUsed,
        dungeonCombatState: null,
        inCombat: 0,
        currentFloorInfo: null,
      })
      .where(eq(dungeonRuns.id, runId));

    return { success: true, completed: false, skipFloorsUsed: newSkipUsed, skipFloorsMax: skipMax };
  }

  async reportMonsterDefeated(runId: string, playerId: string, playerHp: number): Promise<{
    success: boolean;
    floorCleared?: boolean;
    dungeonCompleted?: boolean;
    loot?: Record<string, number>;
    goldGained?: number;
    xpGained?: number;
    nextFloorCombatState?: DungeonCombatState;
    error?: string;
  }> {
    const [run] = await db.select()
      .from(dungeonRuns)
      .where(and(
        eq(dungeonRuns.id, runId),
        eq(dungeonRuns.playerId, playerId),
        eq(dungeonRuns.status, 'active')
      ))
      .limit(1);

    if (!run) {
      return { success: false, error: 'No active run found' };
    }

    if (run.inCombat !== 1 || !run.dungeonCombatState) {
      return { success: false, error: 'Not in combat' };
    }

    const combatState = run.dungeonCombatState as DungeonCombatState;

    const lootResult = await this.calculateLoot(run);
    const existingLoot = (run.lootEarned as Record<string, number>) || {};
    const mergedLoot = { ...existingLoot };
    for (const [itemId, qty] of Object.entries(lootResult.items)) {
      mergedLoot[itemId] = (mergedLoot[itemId] || 0) + qty;
    }

    const [monster] = await db.select().from(gameMonsters).where(eq(gameMonsters.id, combatState.monsterId)).limit(1);

    const rewardMult = combatState.powerMultiplier || 1;
    const isBossKill = combatState.isBossFloor === true;
    const bossRewardMult = isBossKill ? 3 : 1;
    let goldGained = Math.floor((Math.random() * 16 + 5) * run.currentFloor * rewardMult * bossRewardMult);
    let xpGained = Math.floor(combatState.monsterLevel * 10 * rewardMult * (isBossKill ? 2 : 1));

    if (monster) {
      const xpReward = monster.xpReward as Record<string, number> | null;
      if (xpReward) {
        xpGained = Math.floor(Object.values(xpReward).reduce((sum, val) => sum + (val || 0), 0) * rewardMult * (isBossKill ? 2 : 1));
      }
    }

    const newFloorsCleared = run.floorsCleared + 1;

    await this.refreshCacheIfNeeded();
    const dungeon = this.dungeonCache.get(run.dungeonId);
    const dungeonCompleted = dungeon?.floorCount && dungeon.isEndless !== 1 ? newFloorsCleared >= dungeon.floorCount : false;

    if (dungeonCompleted) {
      await db.update(dungeonRuns)
        .set({
          floorsCleared: newFloorsCleared,
          lootEarned: mergedLoot,
          goldEarned: run.goldEarned + goldGained,
          xpEarned: run.xpEarned + xpGained,
          inCombat: 0,
          dungeonCombatState: null,
          status: 'completed',
          endedAt: new Date(),
        })
        .where(eq(dungeonRuns.id, runId));

      await this.updatePlayerProgress(playerId, run.dungeonId, newFloorsCleared);
      await this.updateLeaderboard(playerId, run.dungeonId, newFloorsCleared);

      return {
        success: true,
        floorCleared: true,
        dungeonCompleted: true,
        loot: lootResult.items,
        goldGained,
        xpGained,
      };
    }

    const nextFloor = run.currentFloor + 1;

    const nextFloorInfo = await this.generateFloorInfo(run.dungeonId, nextFloor);
    let nextMonsterId: string;
    if (nextFloorInfo.isBossFloor && nextFloorInfo.bossMonsters.length > 0) {
      nextMonsterId = nextFloorInfo.bossMonsters[0];
    } else if (nextFloorInfo.monsters.length > 0) {
      nextMonsterId = nextFloorInfo.monsters[0];
    } else {
      await db.update(dungeonRuns)
        .set({
          currentFloor: nextFloor,
          floorsCleared: newFloorsCleared,
          lootEarned: mergedLoot,
          goldEarned: run.goldEarned + goldGained,
          xpEarned: run.xpEarned + xpGained,
          inCombat: 0,
          dungeonCombatState: null,
          currentFloorInfo: null,
        })
        .where(eq(dungeonRuns.id, runId));

      return {
        success: true,
        floorCleared: true,
        dungeonCompleted: false,
        loot: lootResult.items,
        goldGained,
        xpGained,
      };
    }

    const [nextMonster] = await db.select().from(gameMonsters).where(eq(gameMonsters.id, nextMonsterId)).limit(1);
    if (!nextMonster) {
      await db.update(dungeonRuns)
        .set({
          currentFloor: nextFloor,
          floorsCleared: newFloorsCleared,
          lootEarned: mergedLoot,
          goldEarned: run.goldEarned + goldGained,
          xpEarned: run.xpEarned + xpGained,
          inCombat: 0,
          dungeonCombatState: null,
          currentFloorInfo: null,
        })
        .where(eq(dungeonRuns.id, runId));

      return {
        success: true,
        floorCleared: true,
        dungeonCompleted: false,
        loot: lootResult.items,
        goldGained,
        xpGained,
      };
    }

    const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player) return { success: false, error: 'Player not found' };
    const stats = await this.resolvePlayerStats(player);
    const playerMaxHpCalc = stats.maxHp;

    const nextPowerMult = (nextFloorInfo.powerMultiplier || 100) / 100;
    const totalFloors2 = dungeon?.floorCount || 100;
    const nextRandomBonus = this.getFloorRandomBonus(nextFloor, totalFloors2, nextFloorInfo.isBossFloor);
    const nextScaledAttack = Math.floor(nextMonster.attackLevel * nextPowerMult * nextRandomBonus);
    const nextScaledDefence = Math.floor(nextMonster.defenceLevel * nextPowerMult * nextRandomBonus);
    const nextScaledMaxHp = Math.floor(nextMonster.maxHitpoints * nextPowerMult * nextRandomBonus) * COMBAT_HP_SCALE;

    const nextCombatState: DungeonCombatState = {
      monsterId: nextMonster.id,
      monsterName: nextMonster.name,
      monsterLevel: nextScaledAttack,
      monsterHp: nextScaledMaxHp,
      monsterMaxHp: nextScaledMaxHp,
      monsterAttack: nextScaledAttack,
      monsterDefence: nextScaledDefence,
      monsterAttackSpeed: nextMonster.attackSpeed || 3000,
      monsterImage: nextMonster.icon || undefined,
      playerHp: Math.min(playerHp, playerMaxHpCalc),
      playerMaxHp: playerMaxHpCalc,
      isBossFloor: nextFloorInfo.isBossFloor,
      powerMultiplier: nextPowerMult,
      combatStartedAt: Date.now(),
      lastTickAt: Date.now(),
    };

    await db.update(dungeonRuns)
      .set({
        currentFloor: nextFloor,
        floorsCleared: newFloorsCleared,
        lootEarned: mergedLoot,
        goldEarned: run.goldEarned + goldGained,
        xpEarned: run.xpEarned + xpGained,
        inCombat: 1,
        dungeonCombatState: nextCombatState,
        currentFloorInfo: nextFloorInfo,
      })
      .where(eq(dungeonRuns.id, runId));

    return {
      success: true,
      floorCleared: true,
      dungeonCompleted: false,
      loot: lootResult.items,
      goldGained,
      xpGained,
      nextFloorCombatState: nextCombatState,
    };
  }

  async toggleOfflineMode(runId: string, playerId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
    const [run] = await db.select()
      .from(dungeonRuns)
      .where(and(
        eq(dungeonRuns.id, runId),
        eq(dungeonRuns.playerId, playerId),
        eq(dungeonRuns.status, 'active')
      ))
      .limit(1);

    if (!run) {
      return { success: false, error: 'No active run found' };
    }

    await db.update(dungeonRuns)
      .set({ continueOffline: enabled ? 1 : 0 })
      .where(eq(dungeonRuns.id, runId));

    return { success: true };
  }

  async processOfflineDungeon(playerId: string): Promise<{
    processed: boolean;
    floorsCleared?: number;
    monstersKilled?: number;
    goldEarned?: number;
    xpEarned?: number;
    lootGained?: Record<string, number>;
    playerDied?: boolean;
    dungeonCompleted?: boolean;
  }> {
    const [run] = await db.select()
      .from(dungeonRuns)
      .where(and(
        eq(dungeonRuns.playerId, playerId),
        eq(dungeonRuns.status, 'active')
      ))
      .limit(1);

    if (!run) return { processed: false };
    if (run.continueOffline !== 1) {
      if (run.inCombat === 1 && run.dungeonCombatState) {
        return { processed: false };
      }
      return { processed: false };
    }

    const combatState = run.dungeonCombatState as DungeonCombatState | null;
    if (!combatState && run.inCombat !== 1) {
      return { processed: false };
    }

    const now = Date.now();
    const lastTick = combatState?.lastTickAt || now;
    const elapsedMs = now - lastTick;
    const TICK_INTERVAL = 600;
    const ticksToProcess = Math.min(Math.floor(elapsedMs / TICK_INTERVAL), 10000);

    if (ticksToProcess < 1) return { processed: false };

    const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player) return { processed: false };

    const skills = (player.skills as Record<string, { xp: number; level: number }>) || {};
    const attackLevel = skills['attack']?.level || getLevelFromXp(skills['attack']?.xp || 0);
    const strengthLevel = skills['strength']?.level || getLevelFromXp(skills['strength']?.xp || 0);
    const defenceLevel = skills['defence']?.level || getLevelFromXp(skills['defence']?.xp || 0);
    const hitpointsLevel = skills['hitpoints']?.level || getLevelFromXp(skills['hitpoints']?.xp || 0);
    const equipment = (player.equipment as Record<string, string | null>) || {};
    if (cachedGameItems.size === 0) await refreshItemCache();
    const enhancementLevels = new Map<string, number>();
    const itemModifications = (player.itemModifications as Record<string, any>) || {};
    const equipSlots = buildSlotsFromCache(equipment, enhancementLevels, itemModifications, cachedGameItems);
    const equipBonuses = resolveEquipmentStats(equipSlots);

    let currentRun = { ...run };
    let currentCombat: DungeonCombatState | null = combatState ? { ...combatState } : null;
    let totalFloorsCleared = 0;
    let totalMonstersKilled = 0;
    let totalGold = 0;
    let totalXp = 0;
    let totalLoot: Record<string, number> = {};
    let playerDied = false;
    let dungeonCompleted = false;

    for (let tick = 0; tick < ticksToProcess; tick++) {
      if (!currentCombat) {
        const floorInfo = await this.generateFloorInfo(currentRun.dungeonId, currentRun.currentFloor);
        const monsterPool = floorInfo.isBossFloor && floorInfo.bossMonsters.length > 0
          ? floorInfo.bossMonsters
          : floorInfo.monsters;

        if (monsterPool.length === 0) break;

        const monsterId = monsterPool[Math.floor(Math.random() * monsterPool.length)];
        const [monster] = await db.select().from(gameMonsters).where(eq(gameMonsters.id, monsterId)).limit(1);

        if (!monster) break;

        const offlinePowerMult = (floorInfo.powerMultiplier || 100) / 100;
        const offlineScaledAttack = Math.floor(monster.attackLevel * offlinePowerMult);
        const offlineScaledDefence = Math.floor(monster.defenceLevel * offlinePowerMult);
        const offlineScaledMaxHp = Math.floor((monster.maxHitpoints || 10) * offlinePowerMult) * COMBAT_HP_SCALE;
        const playerMaxHp = (hitpointsLevel * COMBAT_HP_SCALE) + (equipBonuses.hitpointsBonus || 0);

        const prevPlayerHp = player.currentHitpoints ?? playerMaxHp;
        currentCombat = {
          monsterId: monster.id,
          monsterName: monster.name,
          monsterLevel: offlineScaledAttack,
          monsterHp: offlineScaledMaxHp,
          monsterMaxHp: offlineScaledMaxHp,
          monsterAttack: offlineScaledAttack,
          monsterDefence: offlineScaledDefence,
          monsterAttackSpeed: monster.attackSpeed || 3000,
          monsterImage: monster.icon || undefined,
          playerHp: prevPlayerHp,
          playerMaxHp: playerMaxHp,
          isBossFloor: floorInfo.isBossFloor,
          powerMultiplier: offlinePowerMult,
          combatStartedAt: now,
          lastTickAt: now,
        };
      }

      const playerAccuracy = calculateAccuracyRating(attackLevel, equipBonuses.attackBonus || 0);
      const monsterEvasion = calculateEvasionRating(currentCombat.monsterDefence, 0);
      const playerHitChance = calculateHitChance(playerAccuracy, monsterEvasion);

      if (Math.random() * 100 < playerHitChance) {
        const maxHit = calculateFinalMaxHit(strengthLevel, equipBonuses.strengthBonus || 0, currentCombat.monsterDefence);
        const minHit = calculateFinalMinHit(strengthLevel, equipBonuses.strengthBonus || 0, currentCombat.monsterDefence);
        const damage = Math.floor(Math.random() * (maxHit - minHit + 1)) + minHit;
        currentCombat.monsterHp -= Math.max(0, damage);
        if (currentCombat.monsterHp < 0) currentCombat.monsterHp = 0;
      }

      if (currentCombat.monsterHp <= 0) {
        totalMonstersKilled++;
        const lootResult = await this.calculateLoot(currentRun as any);
        for (const [itemId, qty] of Object.entries(lootResult.items)) {
          totalLoot[itemId] = (totalLoot[itemId] || 0) + qty;
        }

        const [monster] = await db.select().from(gameMonsters).where(eq(gameMonsters.id, currentCombat.monsterId)).limit(1);
        const offlineRewardMult = currentCombat.powerMultiplier || 1;
        let goldGained = Math.floor((Math.random() * 16 + 5) * currentRun.currentFloor * offlineRewardMult);
        let xpGained = Math.floor(currentCombat.monsterLevel * 10 * offlineRewardMult);
        if (monster) {
          const xpReward = monster.xpReward as Record<string, number> | null;
          if (xpReward) {
            xpGained = Math.floor(Object.values(xpReward).reduce((sum, val) => sum + (val || 0), 0) * offlineRewardMult);
          }
        }
        totalGold += goldGained;
        totalXp += xpGained;
        totalFloorsCleared++;

        await this.refreshCacheIfNeeded();
        const dungeon = this.dungeonCache.get(currentRun.dungeonId);
        const newFloorsCleared = currentRun.floorsCleared + totalFloorsCleared;
        if (dungeon?.floorCount && dungeon.isEndless !== 1 && newFloorsCleared >= dungeon.floorCount) {
          dungeonCompleted = true;
          break;
        }

        currentRun = {
          ...currentRun,
          currentFloor: currentRun.currentFloor + 1,
        };
        currentCombat = null;
        continue;
      }

      const monsterAccuracy = calculateAccuracyRating(currentCombat.monsterAttack, 0);
      const playerEvasion = calculateEvasionRating(defenceLevel, equipBonuses.defenceBonus || 0);
      const monsterHitChance = calculateHitChance(monsterAccuracy, playerEvasion);

      if (Math.random() * 100 < monsterHitChance) {
        const monsterMaxHit = calculateMaxHit(currentCombat.monsterAttack, 0);
        const monsterMinHit = calculateMinHit(currentCombat.monsterAttack, 0);
        const rawDamage = Math.floor(Math.random() * (monsterMaxHit - monsterMinHit + 1)) + monsterMinHit;
        const damage = applyDamageReduction(rawDamage, defenceLevel + (equipBonuses.defenceBonus || 0));
        currentCombat.playerHp -= Math.max(0, damage);
        if (currentCombat.playerHp < 0) currentCombat.playerHp = 0;
      }

      if (currentCombat.playerHp <= 0) {
        playerDied = true;
        break;
      }
    }

    const existingLoot = (run.lootEarned as Record<string, number>) || {};
    const mergedLoot = { ...existingLoot };
    for (const [itemId, qty] of Object.entries(totalLoot)) {
      mergedLoot[itemId] = (mergedLoot[itemId] || 0) + qty;
    }

    const newFloorsCleared = run.floorsCleared + totalFloorsCleared;

    if (playerDied) {
      await db.update(dungeonRuns)
        .set({
          inCombat: 0,
          dungeonCombatState: null,
          floorsCleared: newFloorsCleared,
          currentFloor: currentRun.currentFloor,
          lootEarned: mergedLoot,
          goldEarned: run.goldEarned + totalGold,
          xpEarned: run.xpEarned + totalXp,
          status: 'failed',
          endedAt: new Date(),
        })
        .where(eq(dungeonRuns.id, run.id));

      const playerMaxHp = (hitpointsLevel * COMBAT_HP_SCALE) + (equipBonuses.hitpointsBonus || 0);
      await db.update(players)
        .set({ currentHitpoints: playerMaxHp })
        .where(eq(players.id, playerId));
    } else if (dungeonCompleted) {
      await db.update(dungeonRuns)
        .set({
          inCombat: 0,
          dungeonCombatState: null,
          floorsCleared: newFloorsCleared,
          currentFloor: currentRun.currentFloor,
          lootEarned: mergedLoot,
          goldEarned: run.goldEarned + totalGold,
          xpEarned: run.xpEarned + totalXp,
          status: 'completed',
          endedAt: new Date(),
        })
        .where(eq(dungeonRuns.id, run.id));

      await this.updatePlayerProgress(playerId, run.dungeonId, newFloorsCleared);
      await this.updateLeaderboard(playerId, run.dungeonId, newFloorsCleared);
    } else {
      await db.update(dungeonRuns)
        .set({
          inCombat: currentCombat ? 1 : 0,
          dungeonCombatState: currentCombat || null,
          floorsCleared: newFloorsCleared,
          currentFloor: currentRun.currentFloor,
          lootEarned: mergedLoot,
          goldEarned: run.goldEarned + totalGold,
          xpEarned: run.xpEarned + totalXp,
        })
        .where(eq(dungeonRuns.id, run.id));

      if (currentCombat) {
        await db.update(players)
          .set({ currentHitpoints: currentCombat.playerHp })
          .where(eq(players.id, playerId));
      }
    }

    return {
      processed: totalFloorsCleared > 0 || playerDied,
      floorsCleared: totalFloorsCleared,
      monstersKilled: totalMonstersKilled,
      goldEarned: totalGold,
      xpEarned: totalXp,
      lootGained: totalLoot,
      playerDied,
      dungeonCompleted,
    };
  }

  async getPlayerKeys(playerId: string): Promise<{ keyType: string; quantity: number }[]> {
    const [player] = await db.select()
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    if (!player) return [];

    const inventory = player.inventory as Record<string, number> || {};
    const keyTypes = ['bronze', 'silver', 'gold', 'void'];
    const result: { keyType: string; quantity: number }[] = [];

    for (const keyType of keyTypes) {
      const inventoryKeyId = `${keyType}_key`;
      const quantity = inventory[inventoryKeyId] || 0;
      if (quantity > 0) {
        result.push({ keyType, quantity });
      }
    }

    return result;
  }

  async addPlayerKey(playerId: string, keyType: string, quantity: number = 1): Promise<void> {
    const inventoryKeyId = `${keyType}_key`;
    const [player] = await db.select()
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    if (!player) return;

    const inventory = player.inventory as Record<string, number> || {};
    const updatedInventory = { ...inventory };
    updatedInventory[inventoryKeyId] = (updatedInventory[inventoryKeyId] || 0) + quantity;

    await db.update(players)
      .set({ inventory: updatedInventory })
      .where(eq(players.id, playerId));
  }

  async getPlayerProgress(playerId: string): Promise<PlayerDungeonProgress[]> {
    return db.select()
      .from(playerDungeonProgress)
      .where(eq(playerDungeonProgress.playerId, playerId));
  }

  async getAvailableModifiers(dungeonTier?: number): Promise<DungeonModifier[]> {
    await this.refreshCacheIfNeeded();
    
    if (dungeonTier !== undefined) {
      return Array.from(this.modifierCache.values())
        .filter(mod => mod.tier <= dungeonTier);
    }
    
    return Array.from(this.modifierCache.values());
  }

  async getWeeklyLeaderboard(dungeonId: string, limit: number = 50): Promise<LeaderboardEntry[]> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const entries = await db.select({
      playerId: dungeonLeaderboard.playerId,
      highestFloor: dungeonLeaderboard.highestFloor,
      totalFloorsCleared: dungeonLeaderboard.totalFloorsCleared,
    })
      .from(dungeonLeaderboard)
      .where(and(
        eq(dungeonLeaderboard.dungeonId, dungeonId),
        gte(dungeonLeaderboard.weekStart, weekStart)
      ))
      .orderBy(desc(dungeonLeaderboard.highestFloor), desc(dungeonLeaderboard.totalFloorsCleared))
      .limit(limit);

    const result: LeaderboardEntry[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const [player] = await db.select({ username: players.username })
        .from(players)
        .where(eq(players.id, entry.playerId))
        .limit(1);

      result.push({
        playerId: entry.playerId,
        playerName: player?.username || 'Unknown',
        highestFloor: entry.highestFloor,
        totalFloorsCleared: entry.totalFloorsCleared,
        rank: i + 1,
      });
    }

    return result;
  }

  async startDungeonRunWithoutKey(
    playerId: string, 
    dungeonId: string, 
    modifierIds: string[] = []
  ): Promise<{ success: boolean; run?: DungeonRun; error?: string }> {
    await this.refreshCacheIfNeeded();
    
    const dungeon = this.dungeonCache.get(dungeonId);
    if (!dungeon) {
      return { success: false, error: 'Dungeon not found' };
    }

    if (dungeon.isActive !== 1) {
      return { success: false, error: 'Dungeon is not active' };
    }

    const [activeRun] = await db.select()
      .from(dungeonRuns)
      .where(and(
        eq(dungeonRuns.playerId, playerId),
        eq(dungeonRuns.status, 'active')
      ))
      .limit(1);

    if (activeRun) {
      return { success: false, error: 'You already have an active dungeon run' };
    }

    const [player] = await db.select()
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    const validModifiers: string[] = [];
    for (const modId of modifierIds) {
      const modifier = this.modifierCache.get(modId);
      if (modifier && modifier.tier <= dungeon.tier) {
        validModifiers.push(modId);
      }
    }

    try {
      const [newRun] = await db.insert(dungeonRuns)
        .values({
          playerId,
          dungeonId,
          currentFloor: 1,
          floorsCleared: 0,
          modifiersSelected: validModifiers,
          lootEarned: {},
          status: 'active',
        })
        .returning();

      return { success: true, run: newRun };
    } catch (error) {
      console.error('Failed to start dungeon run without key:', error);
      return { success: false, error: 'Failed to start dungeon run' };
    }
  }

  private getFloorRandomBonus(floorNumber: number, totalFloors: number, isBossFloor: boolean): number {
    let bonus = 1 + (floorNumber / totalFloors) * (Math.random() * 0.3 + 0.05);
    if (isBossFloor) {
      bonus *= 1.15;
    }
    return bonus;
  }

  async invalidateCache(): Promise<void> {
    this.cacheExpiry = 0;
  }
}

export const dungeonService = new DungeonService();
