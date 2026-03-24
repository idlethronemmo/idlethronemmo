import { db } from "../../db";
import { eq, and, desc, sql, ne, lt } from "drizzle-orm";
import {
  parties,
  partyMembers,
  partyInvites,
  players,
  type Party,
  type PartyMember,
  type PartyInvite,
  type PartyRole,
  type PartyType,
  type Player,
} from "@shared/schema";
import { broadcastToParty, sendToPlayer, broadcastToPartyAndPlayer, createPartyEvent } from "../partyWs";
import { getSubClass } from "@shared/subClasses";

const INVITE_EXPIRATION_MINUTES = 5;

function determineWeaponTypeFromEquipment(equipment: Record<string, string> | null): string | null {
  if (!equipment) return null;
  const weapon = equipment.weapon || '';
  const baseName = weapon.replace(/\s*\((Common|Uncommon|Rare|Epic|Legendary|Mythic)\)$/, '').toLowerCase();
  if (!baseName) return null;
  if (baseName.includes('staff')) return 'staff';
  if (baseName.includes('bow')) return 'bow';
  if (baseName.includes('dagger')) return 'dagger';
  if (baseName.includes('warhammer') || baseName.includes('hammer')) return '2h_warhammer';
  if (baseName.includes('battleaxe') || baseName.includes('axe') || baseName.includes('cleaver')) return '2h_axe';
  const shield = equipment.shield || '';
  if (shield && (baseName.includes('sword') || baseName.includes('blade'))) return 'sword_shield';
  if (baseName.includes('sword') || baseName.includes('blade') || baseName.includes('scimitar')) return '2h_sword';
  return 'sword_shield';
}

async function determineAutoRole(playerId: string): Promise<{ role: 'tank' | 'dps' | 'healer' | 'hybrid'; weaponType: string | null }> {
  const [p] = await db.select({ equipment: players.equipment }).from(players).where(eq(players.id, playerId)).limit(1);
  const equip = p?.equipment as Record<string, string> | null;
  const weaponType = determineWeaponTypeFromEquipment(equip);
  const subClass = getSubClass(weaponType, null);
  return { role: subClass.baseRole, weaponType };
}

export interface PartyWithMembers extends Party {
  members: (PartyMember & { player: Pick<Player, 'id' | 'username' | 'avatar' | 'totalLevel'> })[];
}

export interface PartyInviteWithDetails extends PartyInvite {
  party: Party;
  inviter: Pick<Player, 'id' | 'username' | 'avatar'>;
}

export class PartyService {
  private async getPlayerUsername(playerId: string): Promise<string> {
    const [p] = await db.select({ username: players.username }).from(players).where(eq(players.id, playerId)).limit(1);
    return p?.username || 'Unknown';
  }

  async createParty(leaderId: string, name?: string, description?: string, partyType: PartyType = 'social'): Promise<{ success: boolean; party?: Party; error?: string }> {
    try {
      console.log(`[PartyTrack] CREATE_PARTY_START player=${leaderId} partyType=${partyType}`);
      const existingMembership = await this.getPlayerParty(leaderId);
      if (existingMembership) {
        const existingType = existingMembership.partyType || 'social';
        if (existingType === 'dungeon') {
          return { success: false, error: 'You are already in a dungeon party. Leave it first.' };
        }
        if (existingType === 'social' && partyType === 'dungeon') {
          return { success: false, error: 'You are in a social party. You can create a dungeon party separately, but leave your social party first.' };
        }
        return { success: false, error: 'You are already in a party' };
      }

      const sanitizedDescription = description ? description.slice(0, 100) : null;

      const newParty = await db.transaction(async (tx) => {
        const existingResult = await tx.execute(
          sql`SELECT pm.id FROM party_members pm INNER JOIN parties p ON pm.party_id = p.id WHERE pm.player_id = ${leaderId} AND p.status != 'disbanded' LIMIT 1 FOR UPDATE`
        );
        if (((existingResult as any).rows || existingResult).length > 0) {
          throw new Error('ALREADY_IN_PARTY');
        }

        const validType: PartyType = partyType === 'dungeon' ? 'dungeon' : 'social';
        const [party] = await tx.insert(parties)
          .values({
            leaderId,
            name: name || null,
            description: sanitizedDescription,
            status: 'forming',
            partyType: validType,
            maxSize: 5,
          })
          .returning();

        const { role: autoRole, weaponType } = await determineAutoRole(leaderId);
        await tx.insert(partyMembers)
          .values({
            partyId: party.id,
            playerId: leaderId,
            role: autoRole,
            position: 1,
            isReady: 0,
            cachedWeaponType: weaponType,
          });

        return party;
      }).catch(err => {
        if (err.message === 'ALREADY_IN_PARTY') return null;
        throw err;
      });

      if (!newParty) {
        console.log(`[PartyTrack] CREATE_PARTY player=${leaderId} partyType=${partyType} result=error reason=already_in_party`);
        return { success: false, error: 'You are already in a party' };
      }

      const username = await this.getPlayerUsername(leaderId);
      console.log(`[PartyTrack] CREATE_PARTY player=${leaderId} username=${username} party=${newParty.id} partyType=${partyType} result=ok`);
      return { success: true, party: newParty };
    } catch (error) {
      console.error(`[PartyTrack] CREATE_PARTY player=${leaderId} partyType=${partyType} result=error`, error);
      return { success: false, error: 'Failed to create party' };
    }
  }

  async getParty(partyId: string): Promise<PartyWithMembers | null> {
    const [party] = await db.select()
      .from(parties)
      .where(eq(parties.id, partyId))
      .limit(1);

    if (!party) return null;

    const membersWithPlayers = await db.select({
      member: partyMembers,
      player: {
        id: players.id,
        username: players.username,
        avatar: players.avatar,
        totalLevel: players.totalLevel,
        activeTask: players.activeTask,
        activeCombat: players.activeCombat,
        currentRegion: players.currentRegion,
        lastSeen: players.lastSeen,
      },
    })
      .from(partyMembers)
      .innerJoin(players, eq(partyMembers.playerId, players.id))
      .where(eq(partyMembers.partyId, partyId))
      .orderBy(partyMembers.position);

    const { isPlayerOnline } = await import('../tradeWs');

    return {
      ...party,
      members: membersWithPlayers.map(row => {
        const wsOnline = isPlayerOnline(row.member.playerId);
        const lastSeenDate = row.player.lastSeen;
        const recentlyActive = lastSeenDate && (Date.now() - new Date(lastSeenDate).getTime()) < 2 * 60 * 1000;
        const activeTask = row.player.activeTask as Record<string, any> | null;
        const hasActiveCombat = !!row.player.activeCombat;
        const hasTaskCombat = activeTask?.type === 'combat' && activeTask?.monsterId;
        return {
          ...row.member,
          username: row.player.username,
          avatar: row.player.avatar,
          totalLevel: row.player.totalLevel,
          activeTask: row.player.activeTask,
          currentRegion: row.player.currentRegion,
          isInCombat: (hasActiveCombat || hasTaskCombat) ? 1 : 0,
          currentMonsterId: hasActiveCombat
            ? (row.player.activeCombat as any)?.monsterId || null
            : hasTaskCombat ? activeTask.monsterId : null,
          isOnline: (wsOnline || recentlyActive) ? 1 : 0,
          lastSeen: lastSeenDate ? new Date(lastSeenDate).toISOString() : null,
          player: row.player,
        };
      }),
    };
  }

  async getPlayerParty(playerId: string, partyType?: PartyType): Promise<PartyWithMembers | null> {
    const conditions = [
      eq(partyMembers.playerId, playerId),
      ne(parties.status, 'disbanded')
    ];
    if (partyType) {
      conditions.push(eq(parties.partyType, partyType));
    }

    const [membership] = await db.select()
      .from(partyMembers)
      .innerJoin(parties, eq(partyMembers.partyId, parties.id))
      .where(and(...conditions))
      .orderBy(desc(parties.createdAt))
      .limit(1);

    if (!membership) return null;

    const party = await this.getParty(membership.parties.id);
    if (!party || party.status === 'disbanded' || !party.members || party.members.length === 0) {
      return null;
    }
    return party;
  }

  async cleanupDuplicatePartyMemberships(playerId: string): Promise<void> {
    try {
      const allMemberships = await db.select({
        memberId: partyMembers.id,
        partyId: partyMembers.partyId,
        partyCreatedAt: parties.createdAt,
        partyStatus: parties.status,
        partyType: parties.partyType,
      })
        .from(partyMembers)
        .innerJoin(parties, eq(partyMembers.partyId, parties.id))
        .where(and(
          eq(partyMembers.playerId, playerId),
          ne(parties.status, 'disbanded'),
          eq(parties.partyType, 'social')
        ))
        .orderBy(desc(parties.createdAt));

      if (allMemberships.length <= 1) return;

      const toKeep = allMemberships[0];
      const toRemove = allMemberships.slice(1);

      for (const membership of toRemove) {
        try {
          await this.leaveParty(playerId, membership.partyId);
        } catch (leaveErr) {
          console.error(`[PartyCleanup] Failed to leave party ${membership.partyId}:`, leaveErr);
        }
      }

      console.log(`[PartyCleanup] Player ${playerId} had ${allMemberships.length} social party memberships, cleaned up ${toRemove.length}, kept party ${toKeep.partyId}`);
    } catch (error) {
      console.error(`[PartyCleanup] Failed for player ${playerId}:`, error);
    }
  }

  async invitePlayer(
    partyId: string, 
    inviterId: string, 
    inviteeId: string
  ): Promise<{ success: boolean; invite?: PartyInvite; error?: string }> {
    const party = await this.getParty(partyId);
    if (!party) {
      return { success: false, error: 'Party not found' };
    }

    if (party.status !== 'forming') {
      return { success: false, error: 'Party is no longer accepting members' };
    }

    if (party.leaderId !== inviterId) {
      const inviterMember = party.members.find(m => m.playerId === inviterId);
      if (!inviterMember) {
        return { success: false, error: 'You are not a member of this party' };
      }
    }

    if (party.members.length >= party.maxSize) {
      return { success: false, error: 'Party is full' };
    }

    const [existingInvite] = await db.select()
      .from(partyInvites)
      .where(and(
        eq(partyInvites.partyId, partyId),
        eq(partyInvites.inviteeId, inviteeId),
        eq(partyInvites.status, 'pending')
      ))
      .limit(1);

    if (existingInvite) {
      return { success: false, error: 'Player already has a pending invite to this party' };
    }

    const expiresAt = new Date(Date.now() + INVITE_EXPIRATION_MINUTES * 60 * 1000);

    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM parties WHERE id = ${partyId} FOR UPDATE`);
        
        const memberCountResult = await tx.execute(sql`SELECT COUNT(*) as count FROM party_members WHERE party_id = ${partyId}`);
        const memberCount = parseInt(((memberCountResult as any).rows?.[0] ?? (memberCountResult as any)[0])?.count as string) || 0;
        if (memberCount >= party.maxSize) throw new Error('Party is full');

        const [invite] = await tx.insert(partyInvites)
          .values({
            partyId,
            inviterId,
            inviteeId,
            status: 'pending',
            expiresAt,
          })
          .returning();

        const [updatedParty] = await tx.update(parties)
          .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() })
          .where(eq(parties.id, partyId))
          .returning();

        return { invite, version: updatedParty.partyVersion };
      });

      const inviterPlayer = party.members.find(m => m.playerId === inviterId);
      broadcastToParty(partyId, createPartyEvent('party_invite_created', partyId, result.version, {
        inviteId: result.invite.id, inviteeId, inviterId,
      }));
      sendToPlayer(inviteeId, createPartyEvent('party_invite_received', partyId, result.version, {
        inviteId: result.invite.id, inviterName: inviterPlayer?.username || 'Unknown',
        partyName: party.name || 'Party',
      }));

      return { success: true, invite: result.invite };
    } catch (error: any) {
      if (error?.message === 'Party is full') return { success: false, error: 'Party is full' };
      console.error('Failed to create invite:', error);
      return { success: false, error: 'Failed to create invite' };
    }
  }

  async getPendingInvites(playerId: string): Promise<PartyInviteWithDetails[]> {
    await this.expireOldInvites();

    const invites = await db.select({
      invite: partyInvites,
      party: parties,
      inviter: {
        id: players.id,
        username: players.username,
        avatar: players.avatar,
      },
    })
      .from(partyInvites)
      .innerJoin(parties, eq(partyInvites.partyId, parties.id))
      .innerJoin(players, eq(partyInvites.inviterId, players.id))
      .where(and(
        eq(partyInvites.inviteeId, playerId),
        eq(partyInvites.status, 'pending')
      ))
      .orderBy(desc(partyInvites.createdAt));

    return invites.map(row => ({
      ...row.invite,
      party: row.party,
      inviter: row.inviter,
    }));
  }

  async acceptInvite(inviteId: string, playerId: string, forceLeave: boolean = false): Promise<{ success: boolean; party?: PartyWithMembers; error?: string; errorCode?: string; currentPartyType?: string }> {
    try {
      const existingParty = await this.getPlayerParty(playerId);
      if (existingParty) {
        if (!forceLeave) {
          const currentType = existingParty.partyType || 'social';
          return { 
            success: false, 
            error: 'You are already in a party. Leave it first to accept this invite.', 
            errorCode: 'ALREADY_IN_PARTY',
            currentPartyType: currentType 
          };
        }
        const leaveResult = await this.leaveParty(playerId, existingParty.id);
        if (!leaveResult.success) {
          return { success: false, error: 'Failed to leave current party: ' + (leaveResult.error || 'Unknown error') };
        }
      }

      await db.transaction(async (tx) => {
        const [invite] = await tx.select()
          .from(partyInvites)
          .where(eq(partyInvites.id, inviteId))
          .limit(1);

        if (!invite) throw new Error('Invite not found');
        if (invite.inviteeId !== playerId) throw new Error('This invite is not for you');
        if (invite.status !== 'pending') throw new Error('This invite is no longer valid');
        if (new Date() > invite.expiresAt) {
          await tx.update(partyInvites)
            .set({ status: 'expired', updatedAt: new Date() })
            .where(eq(partyInvites.id, inviteId));
          throw new Error('This invite has expired');
        }

        const partyRows = await tx.execute(sql`SELECT * FROM parties WHERE id = ${invite.partyId} FOR UPDATE`);
        const partyRow = (partyRows as any).rows?.[0] ?? (partyRows as any)[0];
        if (!partyRow) throw new Error('Party no longer exists');
        if (partyRow.status === 'disbanded') throw new Error('Party has been disbanded');
        if (partyRow.status !== 'forming') throw new Error('Party is no longer accepting members');

        const memberCountResult = await tx.execute(sql`SELECT COUNT(*) as count FROM party_members WHERE party_id = ${invite.partyId}`);
        const memberCount = parseInt(((memberCountResult as any).rows?.[0] ?? (memberCountResult as any)[0])?.count as string) || 0;
        if (memberCount >= (partyRow.max_size as number)) throw new Error('Party is full');

        const existingResult = await tx.execute(sql`SELECT pm.id FROM party_members pm INNER JOIN parties p ON pm.party_id = p.id WHERE pm.player_id = ${playerId} AND p.status != 'disbanded' LIMIT 1`);
        if (((existingResult as any).rows || existingResult).length > 0) throw new Error('You are already in a party');

        const posResult = await tx.execute(sql`SELECT COALESCE(MAX(position), 0) + 1 as next_pos FROM party_members WHERE party_id = ${invite.partyId}`);
        const nextPosition = parseInt(((posResult as any).rows?.[0] ?? (posResult as any)[0])?.next_pos as string) || 1;

        const { role: autoRole, weaponType } = await determineAutoRole(playerId);
        await tx.insert(partyMembers)
          .values({
            partyId: invite.partyId,
            playerId,
            role: autoRole,
            position: nextPosition,
            isReady: 0,
            cachedWeaponType: weaponType,
          });

        await tx.update(partyInvites)
          .set({ status: 'accepted', updatedAt: new Date() })
          .where(eq(partyInvites.id, inviteId));

        await tx.update(parties)
          .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() })
          .where(eq(parties.id, invite.partyId));
      });

      const [invite] = await db.select().from(partyInvites).where(eq(partyInvites.id, inviteId)).limit(1);
      if (invite) {
        const updatedParty = await this.getParty(invite.partyId);
        const [latestParty] = await db.select().from(parties).where(eq(parties.id, invite.partyId)).limit(1);
        const version = latestParty?.partyVersion || 0;
        
        const joiner = await db.select({ username: players.username }).from(players).where(eq(players.id, playerId)).limit(1);
        broadcastToParty(invite.partyId, createPartyEvent('party_member_joined', invite.partyId, version, {
          playerId, username: joiner[0]?.username || 'Unknown',
        }));
        
        console.log(`[PartyTrack] ACCEPT_INVITE player=${playerId} username=${joiner[0]?.username || 'Unknown'} party=${invite.partyId} partyType=${updatedParty?.partyType || 'social'} result=ok`);
        return { success: true, party: updatedParty! };
      }
      console.log(`[PartyTrack] ACCEPT_INVITE player=${playerId} partyType=social result=ok`);
      return { success: true };
    } catch (error: any) {
      if (error?.message && !error.message.includes('Failed')) {
        console.log(`[PartyTrack] ACCEPT_INVITE player=${playerId} partyType=social result=error reason=${error.message}`);
        return { success: false, error: error.message };
      }
      console.error(`[PartyTrack] ACCEPT_INVITE player=${playerId} partyType=social result=error`, error);
      return { success: false, error: 'Failed to join party' };
    }
  }

  async declineInvite(
    inviteId: string, 
    playerId: string
  ): Promise<{ success: boolean; error?: string }> {
    const [invite] = await db.select()
      .from(partyInvites)
      .where(eq(partyInvites.id, inviteId))
      .limit(1);

    if (!invite) {
      return { success: false, error: 'Invite not found' };
    }

    if (invite.inviteeId !== playerId) {
      return { success: false, error: 'This invite is not for you' };
    }

    if (invite.status !== 'pending') {
      return { success: false, error: 'This invite is no longer valid' };
    }

    await db.update(partyInvites)
      .set({ status: 'declined' })
      .where(eq(partyInvites.id, inviteId));

    broadcastToParty(invite.partyId, createPartyEvent('party_invite_declined', invite.partyId, 0, {
      inviteId, inviteeId: playerId,
    }));

    return { success: true };
  }

  async getPartySentInvites(partyId: string): Promise<Array<PartyInvite & { invitee: Pick<Player, 'id' | 'username' | 'avatar'> }>> {
    await this.expireOldInvites();

    const invites = await db.select({
      invite: partyInvites,
      invitee: {
        id: players.id,
        username: players.username,
        avatar: players.avatar,
      },
    })
      .from(partyInvites)
      .innerJoin(players, eq(partyInvites.inviteeId, players.id))
      .where(and(
        eq(partyInvites.partyId, partyId),
        eq(partyInvites.status, 'pending')
      ))
      .orderBy(desc(partyInvites.createdAt));

    return invites.map(row => ({
      ...row.invite,
      invitee: row.invitee,
    }));
  }

  async cancelPartyInvite(
    inviteId: string,
    partyId: string,
    requesterId: string
  ): Promise<{ success: boolean; error?: string }> {
    const [invite] = await db.select()
      .from(partyInvites)
      .where(eq(partyInvites.id, inviteId))
      .limit(1);

    if (!invite) {
      return { success: false, error: 'Invite not found' };
    }

    if (invite.partyId !== partyId) {
      return { success: false, error: 'Invite does not belong to this party' };
    }

    const party = await this.getParty(partyId);
    if (!party) {
      return { success: false, error: 'Party not found' };
    }

    if (party.leaderId !== requesterId && invite.inviterId !== requesterId) {
      return { success: false, error: 'Only party leader or inviter can cancel invites' };
    }

    if (invite.status !== 'pending') {
      return { success: false, error: 'Invite is no longer pending' };
    }

    const [updatedParty] = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM parties WHERE id = ${partyId} FOR UPDATE`);
      await tx.update(partyInvites)
        .set({ status: 'cancelled' })
        .where(eq(partyInvites.id, inviteId));
      return await tx.update(parties)
        .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() })
        .where(eq(parties.id, partyId))
        .returning();
    });

    const version = updatedParty?.partyVersion || 0;
    broadcastToParty(partyId, createPartyEvent('party_invite_cancelled', partyId, version, {
      inviteId, inviteeId: invite.inviteeId,
    }));
    sendToPlayer(invite.inviteeId, createPartyEvent('party_invite_cancelled', partyId, version, {
      inviteId,
    }));

    return { success: true };
  }

  async leaveParty(playerId: string, targetPartyId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const playerParty = targetPartyId
        ? await this.getParty(targetPartyId)
        : await this.getPlayerParty(playerId);
      if (!playerParty) {
        console.log(`[PartyTrack] LEAVE_PARTY player=${playerId} result=error reason=not_in_party`);
        return { success: false, error: 'You are not in a party' };
      }
      if (targetPartyId && !playerParty.members?.some(m => m.playerId === playerId)) {
        return { success: false, error: 'You are not a member of this party' };
      }

      const partyId = playerParty.id;
      let disbanded = false;

      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM parties WHERE id = ${partyId} FOR UPDATE`);

        if (playerParty.leaderId === playerId) {
          const otherMembers = (playerParty.members || []).filter(m => m.playerId !== playerId);
          
          if (otherMembers.length === 0) {
            await tx.delete(partyMembers).where(eq(partyMembers.partyId, partyId));
            await tx.delete(partyInvites).where(eq(partyInvites.partyId, partyId));
            await tx.delete(parties).where(eq(parties.id, partyId));
            disbanded = true;
            return;
          }

          const newLeader = otherMembers.sort((a, b) => a.position - b.position)[0];
          await tx.update(parties)
            .set({ 
              leaderId: newLeader.playerId,
              isPublic: 1,
              partyVersion: sql`party_version + 1`,
              updatedAt: new Date(),
            })
            .where(eq(parties.id, partyId));
        } else {
          await tx.update(parties)
            .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() })
            .where(eq(parties.id, partyId));
        }

        await tx.delete(partyMembers)
          .where(and(
            eq(partyMembers.partyId, partyId),
            eq(partyMembers.playerId, playerId)
          ));

        if (!disbanded) {
          const remainingResult = await tx.execute(sql`SELECT COUNT(*) as count FROM party_members WHERE party_id = ${partyId}`);
          const remainingCount = parseInt(((remainingResult as any).rows?.[0] ?? (remainingResult as any)[0])?.count as string) || 0;
          if (remainingCount === 0) {
            await tx.delete(partyInvites).where(eq(partyInvites.partyId, partyId));
            await tx.delete(parties).where(eq(parties.id, partyId));
            disbanded = true;
          }
        }
      });

      const [latestParty] = await db.select().from(parties).where(eq(parties.id, partyId)).limit(1);
      const version = latestParty?.partyVersion || 0;

      const username = await this.getPlayerUsername(playerId);
      if (disbanded) {
        broadcastToParty(partyId, createPartyEvent('party_disbanded', partyId, version, { reason: 'leader_left' }));
        console.log(`[PartyTrack] LEAVE_PARTY player=${playerId} username=${username} party=${partyId} partyType=${playerParty.partyType || 'social'} result=ok disbanded=true`);
      } else {
        broadcastToParty(partyId, createPartyEvent('party_member_left', partyId, version, { playerId }));
        console.log(`[PartyTrack] LEAVE_PARTY player=${playerId} username=${username} party=${partyId} partyType=${playerParty.partyType || 'social'} result=ok`);
      }

      return { success: true };
    } catch (error) {
      console.error(`[PartyTrack] LEAVE_PARTY player=${playerId} result=error`, error);
      return { success: false, error: 'Failed to leave party' };
    }
  }

  async kickMember(partyId: string, kickerId: string, targetId: string): Promise<{ success: boolean; error?: string }> {
    const party = await this.getParty(partyId);
    if (!party) {
      return { success: false, error: 'Party not found' };
    }
    if (party.leaderId !== kickerId) {
      return { success: false, error: 'Only the party leader can kick members' };
    }
    if (kickerId === targetId) {
      return { success: false, error: 'You cannot kick yourself. Use leave party instead' };
    }
    const targetMember = party.members.find(m => m.playerId === targetId);
    if (!targetMember) {
      return { success: false, error: 'Player is not in this party' };
    }

    try {
      let disbanded = false;
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM parties WHERE id = ${partyId} FOR UPDATE`);
        await tx.delete(partyMembers)
          .where(and(
            eq(partyMembers.partyId, partyId),
            eq(partyMembers.playerId, targetId)
          ));
        await tx.update(parties)
          .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() })
          .where(eq(parties.id, partyId));
        await this.ensurePartyNotEmpty(partyId, tx);
        const remainingResult = await tx.execute(sql`SELECT COUNT(*)::int as count FROM party_members WHERE party_id = ${partyId}`);
        const remainingCount = (remainingResult as any).rows?.[0]?.count ?? 0;
        if (remainingCount === 0) disbanded = true;
      });

      const [latestParty] = await db.select().from(parties).where(eq(parties.id, partyId)).limit(1);
      const version = latestParty?.partyVersion || 0;
      if (disbanded) {
        broadcastToParty(partyId, createPartyEvent('party_disbanded', partyId, version, { reason: 'no_members' }));
      } else {
        broadcastToParty(partyId, createPartyEvent('party_member_kicked', partyId, version, { playerId: targetId }));
      }
      sendToPlayer(targetId, createPartyEvent('party_member_kicked', partyId, version, { playerId: targetId }));

      const kickerName = await this.getPlayerUsername(kickerId);
      const targetName = await this.getPlayerUsername(targetId);
      console.log(`[PartyTrack] KICK_MEMBER player=${targetId} username=${targetName} party=${partyId} partyType=${party.partyType || 'social'} result=ok kickedBy=${kickerId} kickerName=${kickerName}`);

      return { success: true };
    } catch (error) {
      console.error(`[PartyTrack] KICK_MEMBER player=${targetId} party=${partyId} result=error`, error);
      return { success: false, error: 'Failed to kick member' };
    }
  }

  async disbandParty(partyId: string, leaderId: string): Promise<{ success: boolean; error?: string }> {
    const party = await this.getParty(partyId);
    if (!party) {
      return { success: false, error: 'Party not found' };
    }
    if (party.leaderId !== leaderId) {
      return { success: false, error: 'Only the party leader can disband the party' };
    }

    try {
      const memberIds = (party.members || []).map(m => m.playerId);

      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM parties WHERE id = ${partyId} FOR UPDATE`);
        await tx.delete(partyMembers).where(eq(partyMembers.partyId, partyId));
        await tx.update(partyInvites)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(and(eq(partyInvites.partyId, partyId), eq(partyInvites.status, 'pending')));
        await tx.update(parties)
          .set({ status: 'disbanded', partyVersion: sql`party_version + 1`, updatedAt: new Date() })
          .where(eq(parties.id, partyId));
      });

      const [latestParty] = await db.select().from(parties).where(eq(parties.id, partyId)).limit(1);
      const version = latestParty?.partyVersion || 0;
      const event = createPartyEvent('party_disbanded', partyId, version, { reason: 'leader_disbanded' });
      broadcastToParty(partyId, event);
      for (const memberId of memberIds) {
        sendToPlayer(memberId, event);
      }

      const leaderName = await this.getPlayerUsername(leaderId);
      console.log(`[PartyTrack] DISBAND_PARTY player=${leaderId} username=${leaderName} party=${partyId} partyType=${party.partyType || 'social'} result=ok`);

      return { success: true };
    } catch (error) {
      console.error(`[PartyTrack] DISBAND_PARTY player=${leaderId} party=${partyId} result=error`, error);
      return { success: false, error: 'Failed to disband party' };
    }
  }

  async setMemberRole(
    partyId: string, 
    playerId: string, 
    role: PartyRole
  ): Promise<{ success: boolean; error?: string }> {
    const validRoles: PartyRole[] = ['tank', 'dps', 'healer', 'hybrid'];
    if (!validRoles.includes(role)) {
      return { success: false, error: 'Invalid role' };
    }

    const [partyData] = await db.select()
      .from(parties)
      .where(eq(parties.id, partyId))
      .limit(1);

    if (!partyData) {
      return { success: false, error: 'Party not found' };
    }

    if (partyData.status !== 'forming') {
      return { success: false, error: 'Party is no longer accepting changes' };
    }

    const [membership] = await db.select()
      .from(partyMembers)
      .where(and(
        eq(partyMembers.partyId, partyId),
        eq(partyMembers.playerId, playerId)
      ))
      .limit(1);

    if (!membership) {
      return { success: false, error: 'Player is not in this party' };
    }

    const [updatedParty] = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM parties WHERE id = ${partyId} FOR UPDATE`);
      await tx.update(partyMembers)
        .set({ role })
        .where(and(
          eq(partyMembers.partyId, partyId),
          eq(partyMembers.playerId, playerId)
        ));
      return await tx.update(parties)
        .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() })
        .where(eq(parties.id, partyId))
        .returning();
    });

    const version = updatedParty?.partyVersion || 0;
    broadcastToParty(partyId, createPartyEvent('party_role_changed', partyId, version, {
      playerId, role,
    }));

    return { success: true };
  }

  async setMemberReady(
    partyId: string, 
    playerId: string, 
    ready: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const [partyData] = await db.select()
      .from(parties)
      .where(eq(parties.id, partyId))
      .limit(1);

    if (!partyData) {
      return { success: false, error: 'Party not found' };
    }

    if (partyData.status !== 'forming') {
      return { success: false, error: 'Party is no longer accepting changes' };
    }

    const [membership] = await db.select()
      .from(partyMembers)
      .where(and(
        eq(partyMembers.partyId, partyId),
        eq(partyMembers.playerId, playerId)
      ))
      .limit(1);

    if (!membership) {
      return { success: false, error: 'Player is not in this party' };
    }

    const [updatedParty] = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM parties WHERE id = ${partyId} FOR UPDATE`);
      await tx.update(partyMembers)
        .set({ isReady: ready ? 1 : 0 })
        .where(and(
          eq(partyMembers.partyId, partyId),
          eq(partyMembers.playerId, playerId)
        ));
      return await tx.update(parties)
        .set({ partyVersion: sql`party_version + 1`, updatedAt: new Date() })
        .where(eq(parties.id, partyId))
        .returning();
    });

    const version = updatedParty?.partyVersion || 0;
    broadcastToParty(partyId, createPartyEvent('party_ready_updated', partyId, version, {
      playerId, isReady: ready,
    }));

    return { success: true };
  }

  async isPartyReady(partyId: string): Promise<boolean> {
    const party = await this.getParty(partyId);
    if (!party || party.members.length === 0) {
      return false;
    }

    return party.members.every(member => member.isReady === 1);
  }

  async setPartyDungeon(
    partyId: string, 
    dungeonId: string | null
  ): Promise<{ success: boolean; error?: string }> {
    const [party] = await db.select()
      .from(parties)
      .where(eq(parties.id, partyId))
      .limit(1);

    if (!party) {
      return { success: false, error: 'Party not found' };
    }

    await db.update(parties)
      .set({ 
        dungeonId,
        partyVersion: sql`party_version + 1`,
        updatedAt: new Date(),
      })
      .where(eq(parties.id, partyId));

    return { success: true };
  }

  async updatePartyStatus(
    partyId: string, 
    status: 'forming' | 'ready' | 'in_dungeon' | 'disbanded'
  ): Promise<{ success: boolean; error?: string }> {
    const [party] = await db.select()
      .from(parties)
      .where(eq(parties.id, partyId))
      .limit(1);

    if (!party) {
      return { success: false, error: 'Party not found' };
    }

    await db.update(parties)
      .set({ 
        status,
        partyVersion: sql`party_version + 1`,
        updatedAt: new Date(),
      })
      .where(eq(parties.id, partyId));

    return { success: true };
  }

  async updatePartyName(
    partyId: string,
    leaderId: string,
    name: string | null
  ): Promise<{ success: boolean; party?: Party; error?: string }> {
    const [party] = await db.select()
      .from(parties)
      .where(eq(parties.id, partyId))
      .limit(1);

    if (!party) {
      return { success: false, error: 'Party not found' };
    }

    if (party.leaderId !== leaderId) {
      return { success: false, error: 'Only the party leader can update the name' };
    }

    const sanitizedName = name ? name.slice(0, 30).trim() : null;

    const [updatedParty] = await db.update(parties)
      .set({
        name: sanitizedName || null,
        partyVersion: sql`party_version + 1`,
        updatedAt: new Date(),
      })
      .where(eq(parties.id, partyId))
      .returning();

    return { success: true, party: updatedParty };
  }

  async updatePartyDescription(
    partyId: string,
    leaderId: string,
    description: string | null
  ): Promise<{ success: boolean; party?: Party; error?: string }> {
    const [party] = await db.select()
      .from(parties)
      .where(eq(parties.id, partyId))
      .limit(1);

    if (!party) {
      return { success: false, error: 'Party not found' };
    }

    if (party.leaderId !== leaderId) {
      return { success: false, error: 'Only the party leader can update the description' };
    }

    const sanitizedDescription = description ? description.slice(0, 100) : null;

    const [updatedParty] = await db.update(parties)
      .set({
        description: sanitizedDescription,
        partyVersion: sql`party_version + 1`,
        updatedAt: new Date(),
      })
      .where(eq(parties.id, partyId))
      .returning();

    return { success: true, party: updatedParty };
  }

  async ensurePartyNotEmpty(partyId: string, tx?: any): Promise<void> {
    const executor = tx || db;
    const result = await executor.execute(
      sql`SELECT COUNT(*)::int as count FROM party_members WHERE party_id = ${partyId}`
    );
    const count = (result as any).rows?.[0]?.count ?? (result as any)[0]?.count ?? 0;
    if (count === 0) {
      await executor.delete(partyInvites).where(eq(partyInvites.partyId, partyId));
      await executor.delete(parties).where(eq(parties.id, partyId));
    }
  }

  private async expireOldInvites(): Promise<void> {
    await db.update(partyInvites)
      .set({ status: 'expired' })
      .where(and(
        eq(partyInvites.status, 'pending'),
        lt(partyInvites.expiresAt, new Date())
      ));
  }
}

export const partyService = new PartyService();
