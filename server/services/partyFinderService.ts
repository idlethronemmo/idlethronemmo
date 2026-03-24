import { db } from "../../db";
import { eq, and, or, gte, lt, desc, sql, isNull } from "drizzle-orm";
import {
  partyFinder,
  parties,
  partyMembers,
  dungeons,
  players,
  guilds,
  type PartyFinder,
  type Party,
  type PartyMember,
  type Player,
  type PartyRole,
} from "@shared/schema";

const DEFAULT_EXPIRATION_HOURS = 4;

export interface PartyWithDetails {
  id: string;
  leaderId: string;
  name: string | null;
  status: string;
  maxSize: number;
  members: (PartyMember & { player: Pick<Player, 'id' | 'username' | 'avatar' | 'totalLevel'> })[];
  leader: Pick<Player, 'id' | 'username' | 'avatar'>;
}

export interface PartyFinderListingWithDetails extends PartyFinder {
  party: PartyWithDetails;
  dungeon: { id: string; name: string; minLevel: number; recommendedLevel: number };
  guild?: { id: string; name: string } | null;
  memberCount: number;
  rolesFilled: PartyRole[];
}

export interface CreateListingOptions {
  requiredRoles?: string[];
  minLevel?: number;
  description?: string;
  guildOnly?: boolean;
  guildId?: string;
}

export interface ListingSearchQuery {
  dungeonId?: string;
  roleNeeded?: string;
  minLevel?: number;
  guildId?: string;
}

export interface ListingUpdateOptions {
  requiredRoles?: string[];
  minLevel?: number;
  description?: string;
  guildOnly?: boolean;
}

export class PartyFinderService {
  async listPartyFinder(options?: {
    dungeonId?: string;
    minLevel?: number;
    guildId?: string;
  }): Promise<PartyFinderListingWithDetails[]> {
    const now = new Date();
    
    const conditions = [
      eq(partyFinder.isPublic, 1),
      gte(partyFinder.expiresAt, now),
    ];

    if (options?.dungeonId) {
      conditions.push(eq(partyFinder.dungeonId, options.dungeonId));
    }

    if (options?.minLevel !== undefined) {
      conditions.push(gte(partyFinder.minLevel, options.minLevel));
    }

    if (options?.guildId) {
      conditions.push(
        or(
          eq(partyFinder.guildOnly, 0),
          eq(partyFinder.guildId, options.guildId)
        )!
      );
    } else {
      conditions.push(eq(partyFinder.guildOnly, 0));
    }

    const listings = await db.select()
      .from(partyFinder)
      .innerJoin(parties, eq(partyFinder.partyId, parties.id))
      .innerJoin(dungeons, eq(partyFinder.dungeonId, dungeons.id))
      .leftJoin(guilds, eq(partyFinder.guildId, guilds.id))
      .where(and(...conditions))
      .orderBy(desc(partyFinder.createdAt));

    const result: PartyFinderListingWithDetails[] = [];

    for (const row of listings) {
      const partyWithDetails = await this.getPartyWithDetails(row.parties.id);
      if (!partyWithDetails) continue;

      if (partyWithDetails.members.length >= row.parties.maxSize) continue;

      result.push({
        ...row.party_finder,
        party: partyWithDetails,
        dungeon: {
          id: row.dungeons.id,
          name: row.dungeons.name,
          minLevel: row.dungeons.minLevel,
          recommendedLevel: row.dungeons.recommendedLevel,
        },
        guild: row.guilds ? { id: row.guilds.id, name: row.guilds.name } : null,
        memberCount: partyWithDetails.members.length,
        rolesFilled: partyWithDetails.members.map(m => m.role as PartyRole),
      });
    }

    return result;
  }

  async createListing(
    partyId: string,
    dungeonId: string,
    options: CreateListingOptions = {}
  ): Promise<{ success: boolean; listing?: PartyFinder; error?: string }> {
    try {
      const [party] = await db.select()
        .from(parties)
        .where(eq(parties.id, partyId))
        .limit(1);

      if (!party) {
        return { success: false, error: 'Party not found' };
      }

      const [dungeon] = await db.select()
        .from(dungeons)
        .where(eq(dungeons.id, dungeonId))
        .limit(1);

      if (!dungeon) {
        return { success: false, error: 'Dungeon not found' };
      }

      const [existingListing] = await db.select()
        .from(partyFinder)
        .where(eq(partyFinder.partyId, partyId))
        .limit(1);

      if (existingListing) {
        return { success: false, error: 'Party already has an active listing' };
      }

      if (options.guildOnly && !options.guildId) {
        return { success: false, error: 'Guild ID is required for guild-only listings' };
      }

      const expiresAt = new Date(Date.now() + DEFAULT_EXPIRATION_HOURS * 60 * 60 * 1000);

      const [newListing] = await db.insert(partyFinder)
        .values({
          partyId,
          dungeonId,
          requiredRoles: options.requiredRoles || [],
          minLevel: options.minLevel || 1,
          description: options.description || null,
          isPublic: 1,
          guildOnly: options.guildOnly ? 1 : 0,
          guildId: options.guildId || null,
          expiresAt,
        })
        .returning();

      return { success: true, listing: newListing };
    } catch (error) {
      console.error('Failed to create party finder listing:', error);
      return { success: false, error: 'Failed to create listing' };
    }
  }

  async updateListing(
    listingId: string,
    leaderId: string,
    updates: ListingUpdateOptions
  ): Promise<{ success: boolean; listing?: PartyFinder; error?: string }> {
    try {
      const [listing] = await db.select()
        .from(partyFinder)
        .innerJoin(parties, eq(partyFinder.partyId, parties.id))
        .where(eq(partyFinder.id, listingId))
        .limit(1);

      if (!listing) {
        return { success: false, error: 'Listing not found' };
      }

      if (listing.parties.leaderId !== leaderId) {
        return { success: false, error: 'Only the party leader can update the listing' };
      }

      const updateData: Partial<PartyFinder> = {};
      
      if (updates.requiredRoles !== undefined) {
        updateData.requiredRoles = updates.requiredRoles;
      }
      if (updates.minLevel !== undefined) {
        updateData.minLevel = updates.minLevel;
      }
      if (updates.description !== undefined) {
        updateData.description = updates.description;
      }
      if (updates.guildOnly !== undefined) {
        updateData.guildOnly = updates.guildOnly ? 1 : 0;
      }

      const [updatedListing] = await db.update(partyFinder)
        .set(updateData)
        .where(eq(partyFinder.id, listingId))
        .returning();

      return { success: true, listing: updatedListing };
    } catch (error) {
      console.error('Failed to update party finder listing:', error);
      return { success: false, error: 'Failed to update listing' };
    }
  }

  async removeListing(
    listingId: string,
    leaderId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [listing] = await db.select()
        .from(partyFinder)
        .innerJoin(parties, eq(partyFinder.partyId, parties.id))
        .where(eq(partyFinder.id, listingId))
        .limit(1);

      if (!listing) {
        return { success: false, error: 'Listing not found' };
      }

      if (listing.parties.leaderId !== leaderId) {
        return { success: false, error: 'Only the party leader can remove the listing' };
      }

      await db.delete(partyFinder)
        .where(eq(partyFinder.id, listingId));

      return { success: true };
    } catch (error) {
      console.error('Failed to remove party finder listing:', error);
      return { success: false, error: 'Failed to remove listing' };
    }
  }

  async removeListingByParty(partyId: string): Promise<void> {
    try {
      await db.delete(partyFinder)
        .where(eq(partyFinder.partyId, partyId));
    } catch (error) {
      console.error('Failed to remove party finder listing by party:', error);
    }
  }

  async getListingByParty(partyId: string): Promise<PartyFinderListingWithDetails | null> {
    const [row] = await db.select()
      .from(partyFinder)
      .innerJoin(parties, eq(partyFinder.partyId, parties.id))
      .innerJoin(dungeons, eq(partyFinder.dungeonId, dungeons.id))
      .leftJoin(guilds, eq(partyFinder.guildId, guilds.id))
      .where(eq(partyFinder.partyId, partyId))
      .limit(1);

    if (!row) return null;

    const partyWithDetails = await this.getPartyWithDetails(row.parties.id);
    if (!partyWithDetails) return null;

    return {
      ...row.party_finder,
      party: partyWithDetails,
      dungeon: {
        id: row.dungeons.id,
        name: row.dungeons.name,
        minLevel: row.dungeons.minLevel,
        recommendedLevel: row.dungeons.recommendedLevel,
      },
      guild: row.guilds ? { id: row.guilds.id, name: row.guilds.name } : null,
      memberCount: partyWithDetails.members.length,
      rolesFilled: partyWithDetails.members.map(m => m.role as PartyRole),
    };
  }

  async searchListings(query: ListingSearchQuery): Promise<PartyFinderListingWithDetails[]> {
    const now = new Date();
    
    const conditions = [
      eq(partyFinder.isPublic, 1),
      gte(partyFinder.expiresAt, now),
    ];

    if (query.dungeonId) {
      conditions.push(eq(partyFinder.dungeonId, query.dungeonId));
    }

    if (query.minLevel !== undefined) {
      conditions.push(gte(partyFinder.minLevel, query.minLevel));
    }

    if (query.guildId) {
      conditions.push(
        or(
          eq(partyFinder.guildOnly, 0),
          eq(partyFinder.guildId, query.guildId)
        )!
      );
    } else {
      conditions.push(eq(partyFinder.guildOnly, 0));
    }

    const listings = await db.select()
      .from(partyFinder)
      .innerJoin(parties, eq(partyFinder.partyId, parties.id))
      .innerJoin(dungeons, eq(partyFinder.dungeonId, dungeons.id))
      .leftJoin(guilds, eq(partyFinder.guildId, guilds.id))
      .where(and(...conditions))
      .orderBy(desc(partyFinder.createdAt));

    const result: PartyFinderListingWithDetails[] = [];

    for (const row of listings) {
      const partyWithDetails = await this.getPartyWithDetails(row.parties.id);
      if (!partyWithDetails) continue;

      if (partyWithDetails.members.length >= row.parties.maxSize) continue;

      if (query.roleNeeded) {
        const rolesFilled = partyWithDetails.members.map(m => m.role);
        const requiredRoles = (row.party_finder.requiredRoles as string[]) || [];
        
        if (!requiredRoles.includes(query.roleNeeded) && !rolesFilled.includes(query.roleNeeded)) {
          continue;
        }
        
        const roleCounts = rolesFilled.filter(r => r === query.roleNeeded).length;
        const requiredCount = requiredRoles.filter(r => r === query.roleNeeded).length;
        if (roleCounts >= requiredCount && requiredCount > 0) {
          continue;
        }
      }

      result.push({
        ...row.party_finder,
        party: partyWithDetails,
        dungeon: {
          id: row.dungeons.id,
          name: row.dungeons.name,
          minLevel: row.dungeons.minLevel,
          recommendedLevel: row.dungeons.recommendedLevel,
        },
        guild: row.guilds ? { id: row.guilds.id, name: row.guilds.name } : null,
        memberCount: partyWithDetails.members.length,
        rolesFilled: partyWithDetails.members.map(m => m.role as PartyRole),
      });
    }

    return result;
  }

  async cleanupExpiredListings(): Promise<number> {
    try {
      const now = new Date();
      
      const result = await db.delete(partyFinder)
        .where(lt(partyFinder.expiresAt, now))
        .returning();

      return result.length;
    } catch (error) {
      console.error('Failed to cleanup expired listings:', error);
      return 0;
    }
  }

  async autoRemoveFullPartyListings(): Promise<void> {
    try {
      const listings = await db.select()
        .from(partyFinder)
        .innerJoin(parties, eq(partyFinder.partyId, parties.id));

      for (const row of listings) {
        const memberCount = await db.select({ count: sql<number>`count(*)` })
          .from(partyMembers)
          .where(eq(partyMembers.partyId, row.parties.id));

        const count = memberCount[0]?.count || 0;
        if (count >= row.parties.maxSize) {
          await db.delete(partyFinder)
            .where(eq(partyFinder.id, row.party_finder.id));
        }
      }
    } catch (error) {
      console.error('Failed to auto-remove full party listings:', error);
    }
  }

  private async getPartyWithDetails(partyId: string): Promise<{
    id: string;
    leaderId: string;
    name: string | null;
    status: string;
    maxSize: number;
    members: (PartyMember & { player: Pick<Player, 'id' | 'username' | 'avatar' | 'totalLevel'> })[];
    leader: Pick<Player, 'id' | 'username' | 'avatar'>;
  } | null> {
    const [party] = await db.select()
      .from(parties)
      .where(eq(parties.id, partyId))
      .limit(1);

    if (!party) return null;

    const [leader] = await db.select({
      id: players.id,
      username: players.username,
      avatar: players.avatar,
    })
      .from(players)
      .where(eq(players.id, party.leaderId))
      .limit(1);

    if (!leader) return null;

    const membersWithPlayers = await db.select({
      member: partyMembers,
      player: {
        id: players.id,
        username: players.username,
        avatar: players.avatar,
        totalLevel: players.totalLevel,
      },
    })
      .from(partyMembers)
      .innerJoin(players, eq(partyMembers.playerId, players.id))
      .where(eq(partyMembers.partyId, partyId))
      .orderBy(partyMembers.position);

    return {
      id: party.id,
      leaderId: party.leaderId,
      name: party.name,
      status: party.status,
      maxSize: party.maxSize,
      members: membersWithPlayers.map(row => ({
        ...row.member,
        player: row.player,
      })),
      leader,
    };
  }
}

export const partyFinderService = new PartyFinderService();
