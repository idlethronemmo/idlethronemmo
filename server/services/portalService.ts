// @ts-nocheck
import { db } from "../../db";
import { eq, and, lt } from "drizzle-orm";
import {
  dungeonPortals,
  dungeons,
  type DungeonPortal,
  type Dungeon,
} from "@shared/schema";

const DEFAULT_PORTAL_DURATION_MINUTES = 30;
const PORTAL_SPAWN_CHANCE = 0.05; // 5% chance to spawn portal after dungeon clear

export interface PortalWithDungeon extends DungeonPortal {
  dungeon: Dungeon | null;
}

export class PortalService {
  async spawnPortal(
    playerId: string,
    dungeonId: string,
    durationMinutes: number = DEFAULT_PORTAL_DURATION_MINUTES
  ): Promise<DungeonPortal> {
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

    const [portal] = await db
      .insert(dungeonPortals)
      .values({
        playerId,
        dungeonId,
        expiresAt,
        isUsed: 0,
      })
      .returning();

    return portal;
  }

  async getActivePortals(playerId: string): Promise<PortalWithDungeon[]> {
    const now = new Date();

    const portals = await db
      .select()
      .from(dungeonPortals)
      .where(
        and(
          eq(dungeonPortals.playerId, playerId),
          eq(dungeonPortals.isUsed, 0)
        )
      );

    const activePortals = portals.filter((p) => new Date(p.expiresAt) > now);

    const result: PortalWithDungeon[] = [];
    for (const portal of activePortals) {
      const [dungeon] = await db
        .select()
        .from(dungeons)
        .where(eq(dungeons.id, portal.dungeonId))
        .limit(1);

      result.push({
        ...portal,
        dungeon: dungeon || null,
      });
    }

    return result;
  }

  async usePortal(
    portalId: string
  ): Promise<{ success: boolean; dungeon?: Dungeon; error?: string }> {
    const [portal] = await db
      .select()
      .from(dungeonPortals)
      .where(eq(dungeonPortals.id, portalId))
      .limit(1);

    if (!portal) {
      return { success: false, error: "Portal not found" };
    }

    if (portal.isUsed === 1) {
      return { success: false, error: "Portal already used" };
    }

    const now = new Date();
    if (new Date(portal.expiresAt) <= now) {
      return { success: false, error: "Portal has expired" };
    }

    await db
      .update(dungeonPortals)
      .set({ isUsed: 1 })
      .where(eq(dungeonPortals.id, portalId));

    const [dungeon] = await db
      .select()
      .from(dungeons)
      .where(eq(dungeons.id, portal.dungeonId))
      .limit(1);

    return { success: true, dungeon: dungeon || undefined };
  }

  async cleanupExpiredPortals(): Promise<number> {
    const now = new Date();

    const result = await db
      .delete(dungeonPortals)
      .where(lt(dungeonPortals.expiresAt, now))
      .returning();

    return result.length;
  }

  async checkRandomPortalSpawn(
    playerId: string,
    dungeonId: string
  ): Promise<DungeonPortal | null> {
    const roll = Math.random();

    if (roll < PORTAL_SPAWN_CHANCE) {
      const portal = await this.spawnPortal(
        playerId,
        dungeonId,
        DEFAULT_PORTAL_DURATION_MINUTES
      );
      return portal;
    }

    return null;
  }
}

export const portalService = new PortalService();

