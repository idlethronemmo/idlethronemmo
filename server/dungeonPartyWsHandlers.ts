import { WebSocket } from 'ws';
import { db } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  parties, partyMembers, partyInvites, players,
  dungeonSessions, dungeonMemberStates,
} from "@shared/schema";
import {
  broadcastToParty, sendToPlayer, createPartyEvent,
  getPlayerIdFromSocket, subscribeSocketToParty,
} from "./partyWs";
import { partyService } from "./services/partyService";
import { partyDungeonService } from "./services/partyDungeonService";
import { dungeonSessionManager } from "./services/dungeonSessionManager";

function sendJson(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(data)); } catch {}
  }
}

function sendError(ws: WebSocket, action: string, error: string) {
  sendJson(ws, { type: `${action}:error`, error });
}

export async function handleDungeonPartyMessage(ws: WebSocket, msg: any) {
  const playerId = getPlayerIdFromSocket(ws);
  if (!playerId) {
    sendError(ws, msg.type, 'Not registered');
    return;
  }

  switch (msg.type) {
    case 'dungeon_party:create':
      await handleCreate(ws, playerId, msg);
      break;
    case 'dungeon_party:invite':
      await handleInvite(ws, playerId, msg);
      break;
    case 'dungeon_party:invite_accept':
      await handleInviteAccept(ws, playerId, msg);
      break;
    case 'dungeon_party:invite_decline':
      await handleInviteDecline(ws, playerId, msg);
      break;
    case 'dungeon_party:invite_cancel':
      await handleInviteCancel(ws, playerId, msg);
      break;
    case 'dungeon_party:ready_set':
      await handleReadySet(ws, playerId, msg);
      break;
    case 'dungeon_party:start_requested':
      await handleStartRequested(ws, playerId, msg);
      break;
    case 'dungeon_party:leave':
      await handleLeave(ws, playerId, msg);
      break;
    case 'dungeon_party:kick':
      await handleKick(ws, playerId, msg);
      break;
    case 'dungeon_party:role_change':
      await handleRoleChange(ws, playerId, msg);
      break;
    case 'dungeon_party:cast_vote':
      handleCastVote(ws, playerId, msg);
      break;
    case 'dungeon_party:boss_ready':
      handleBossReady(ws, playerId, msg);
      break;
  }
}

async function handleCreate(ws: WebSocket, playerId: string, msg: any) {
  const dungeonId = msg.dungeonId || null;
  console.log(`[PartyTrack] WS_CREATE_PARTY player=${playerId} partyType=dungeon dungeonId=${dungeonId} result=pending`);

  const result = await partyService.createParty(playerId, null, null, 'dungeon');

  if (!result.success) {
    console.log(`[PartyTrack] WS_CREATE_PARTY player=${playerId} partyType=dungeon result=error reason=${result.error}`);
    sendError(ws, 'dungeon_party:create', result.error || 'Failed to create party');
    return;
  }

  const party = result.party!;
  console.log(`[PartyTrack] WS_CREATE_PARTY player=${playerId} party=${party.id} partyType=dungeon result=ok`);

  if (dungeonId) {
    await db.update(parties)
      .set({ dungeonId } as any)
      .where(eq(parties.id, party.id));
  }

  subscribeSocketToParty(ws, party.id);

  const fullParty = await partyService.getParty(party.id);

  sendJson(ws, {
    type: 'dungeon_party:created',
    partyId: party.id,
    party: fullParty ? {
      id: fullParty.id,
      leaderId: fullParty.leaderId,
      status: fullParty.status,
      partyType: fullParty.partyType,
      dungeonId: dungeonId || fullParty.dungeonId,
      members: (fullParty.members || []).map(m => ({
        playerId: m.playerId,
        username: m.player?.username || 'Unknown',
        avatar: m.player?.avatar || null,
        role: m.role,
        isReady: m.isReady,
        totalLevel: m.player?.totalLevel || 0,
      })),
      invites: [],
    } : null,
  });
}

async function handleInvite(ws: WebSocket, playerId: string, msg: any) {
  const { partyId, inviteeId } = msg;
  if (!partyId || !inviteeId) {
    sendError(ws, 'dungeon_party:invite', 'partyId and inviteeId required');
    return;
  }

  const partyCheck = await partyService.getParty(partyId);
  if (!partyCheck) {
    sendError(ws, 'dungeon_party:invite', 'Party not found');
    return;
  }
  if (partyCheck.status !== 'forming') {
    sendError(ws, 'dungeon_party:invite', 'Party is not accepting members');
    return;
  }

  const result = await partyService.invitePlayer(partyId, playerId, inviteeId);

  if (!result.success) {
    sendError(ws, 'dungeon_party:invite', result.error || 'Failed to invite');
    return;
  }

  const [inviteePlayer] = await db.select({
    id: players.id,
    username: players.username,
    avatar: players.avatar,
  }).from(players).where(eq(players.id, inviteeId));

  broadcastToParty(partyId, createPartyEvent('party_invite_created', partyId, 0, {
    invite: result.invite,
    invitee: inviteePlayer || { id: inviteeId, username: 'Unknown', avatar: null },
  }));

  const [inviterPlayer] = await db.select({
    id: players.id,
    username: players.username,
    avatar: players.avatar,
  }).from(players).where(eq(players.id, playerId));

  sendToPlayer(inviteeId, createPartyEvent('party_invite_received', partyId, 0, {
    invite: result.invite,
    partyId,
    partyType: 'dungeon',
    inviter: inviterPlayer || { id: playerId, username: 'Unknown', avatar: null },
    dungeonId: partyCheck.dungeonId,
  }));

  sendJson(ws, {
    type: 'dungeon_party:invite_sent',
    inviteeId,
    invite: result.invite,
  });
}

async function handleInviteAccept(ws: WebSocket, playerId: string, msg: any) {
  const { inviteId, forceLeave } = msg;
  if (!inviteId) {
    sendError(ws, 'dungeon_party:invite_accept', 'inviteId required');
    return;
  }

  console.log(`[PartyTrack] WS_ACCEPT_INVITE player=${playerId} inviteId=${inviteId} partyType=dungeon result=pending`);
  const result = await partyService.acceptInvite(inviteId, playerId, forceLeave);

  if (!result.success) {
    console.log(`[PartyTrack] WS_ACCEPT_INVITE player=${playerId} inviteId=${inviteId} partyType=dungeon result=error reason=${result.error}`);
    sendError(ws, 'dungeon_party:invite_accept', result.error || 'Failed to accept invite');
    sendJson(ws, {
      type: 'dungeon_party:invite_accept_failed',
      error: result.error,
      errorCode: result.errorCode,
      currentPartyType: result.currentPartyType,
    });
    return;
  }

  const party = result.party;
  if (!party) {
    sendError(ws, 'dungeon_party:invite_accept', 'Party not found after accept');
    return;
  }

  subscribeSocketToParty(ws, party.id);

  const fullParty = await partyService.getParty(party.id);

  const [acceptedPlayer] = await db.select({
    id: players.id,
    username: players.username,
    avatar: players.avatar,
    totalLevel: players.totalLevel,
  }).from(players).where(eq(players.id, playerId));

  broadcastToParty(party.id, createPartyEvent('party_member_joined', party.id, 0, {
    playerId,
    player: acceptedPlayer || { id: playerId, username: 'Unknown', avatar: null, totalLevel: 0 },
  }));

  const memberCount = fullParty?.members?.length || 0;
  if (memberCount >= (fullParty?.maxSize || 5)) {
    const pendingInvites = await db.select()
      .from(partyInvites)
      .where(and(
        eq(partyInvites.partyId, party.id),
        eq(partyInvites.status, 'pending'),
      ));

    if (pendingInvites.length > 0) {
      for (const inv of pendingInvites) {
        await db.update(partyInvites)
          .set({ status: 'cancelled', updatedAt: new Date() } as any)
          .where(eq(partyInvites.id, inv.id));
        sendToPlayer(inv.inviteeId, createPartyEvent('party_invite_cancelled', party.id, 0, {
          inviteId: inv.id,
          reason: 'party_full',
        }));
      }
    }
  }

  console.log(`[PartyTrack] WS_ACCEPT_INVITE player=${playerId} party=${party.id} partyType=dungeon result=ok`);
  sendJson(ws, {
    type: 'dungeon_party:joined',
    partyId: party.id,
    party: fullParty ? {
      id: fullParty.id,
      leaderId: fullParty.leaderId,
      status: fullParty.status,
      partyType: fullParty.partyType,
      dungeonId: fullParty.dungeonId,
      members: (fullParty.members || []).map(m => ({
        playerId: m.playerId,
        username: m.player?.username || 'Unknown',
        avatar: m.player?.avatar || null,
        role: m.role,
        isReady: m.isReady,
        totalLevel: m.player?.totalLevel || 0,
      })),
      invites: [],
    } : null,
  });
}

async function handleInviteDecline(ws: WebSocket, playerId: string, msg: any) {
  const { inviteId } = msg;
  if (!inviteId) {
    sendError(ws, 'dungeon_party:invite_decline', 'inviteId required');
    return;
  }

  const result = await partyService.declineInvite(inviteId, playerId);

  if (!result.success) {
    sendError(ws, 'dungeon_party:invite_decline', result.error || 'Failed to decline');
    return;
  }

  sendJson(ws, { type: 'dungeon_party:invite_declined', inviteId });
}

async function handleInviteCancel(ws: WebSocket, playerId: string, msg: any) {
  const { inviteId, partyId } = msg;
  if (!inviteId) {
    sendError(ws, 'dungeon_party:invite_cancel', 'inviteId required');
    return;
  }

  const [invite] = await db.select()
    .from(partyInvites)
    .where(eq(partyInvites.id, inviteId));

  if (!invite || invite.status !== 'pending') {
    sendError(ws, 'dungeon_party:invite_cancel', 'Invite not found or not pending');
    return;
  }

  const party = await partyService.getParty(invite.partyId);
  if (!party || (party.leaderId !== playerId && invite.inviterId !== playerId)) {
    sendError(ws, 'dungeon_party:invite_cancel', 'Not authorized to cancel');
    return;
  }

  await db.update(partyInvites)
    .set({ status: 'cancelled', updatedAt: new Date() } as any)
    .where(eq(partyInvites.id, inviteId));

  sendToPlayer(invite.inviteeId, createPartyEvent('party_invite_cancelled', invite.partyId, 0, {
    inviteId,
    reason: 'cancelled',
  }));

  broadcastToParty(invite.partyId, createPartyEvent('party_invite_cancelled', invite.partyId, 0, {
    inviteId,
  }));

  sendJson(ws, { type: 'dungeon_party:invite_cancelled', inviteId });
}

async function handleReadySet(ws: WebSocket, playerId: string, msg: any) {
  const { partyId, isReady } = msg;
  if (!partyId || isReady === undefined) {
    sendError(ws, 'dungeon_party:ready_set', 'partyId and isReady required');
    return;
  }

  const [membership] = await db.select()
    .from(partyMembers)
    .where(and(
      eq(partyMembers.partyId, partyId),
      eq(partyMembers.playerId, playerId),
    ));

  if (!membership) {
    sendError(ws, 'dungeon_party:ready_set', 'Not a member of this party');
    return;
  }

  const readyVal = isReady ? 1 : 0;
  await db.update(partyMembers)
    .set({ isReady: readyVal } as any)
    .where(eq(partyMembers.id, membership.id));

  broadcastToParty(partyId, createPartyEvent('party_ready_updated', partyId, 0, {
    playerId,
    isReady: readyVal,
  }));

  sendJson(ws, { type: 'dungeon_party:ready_ack', isReady: readyVal });
}

async function handleStartRequested(ws: WebSocket, playerId: string, msg: any) {
  const { partyId, dungeonId } = msg;
  if (!partyId || !dungeonId) {
    sendError(ws, 'dungeon_party:start_requested', 'partyId and dungeonId required');
    return;
  }

  const party = await partyService.getParty(partyId);
  if (!party) {
    sendError(ws, 'dungeon_party:start_requested', 'Party not found');
    return;
  }
  if (party.leaderId !== playerId) {
    sendError(ws, 'dungeon_party:start_requested', 'Only the leader can start');
    return;
  }

  const members = party.members || [];
  if (members.length < 2) {
    sendError(ws, 'dungeon_party:start_requested', 'Need at least 2 members');
    return;
  }
  const notReady = members.filter(m => m.isReady !== 1);
  if (notReady.length > 0) {
    sendError(ws, 'dungeon_party:start_requested', 'All members must be ready');
    return;
  }

  const memberIds = members.map(m => m.playerId);
  const result = await dungeonSessionManager.createSessionFromParty(partyId, dungeonId, memberIds);

  if (!result.success) {
    broadcastToParty(partyId, createPartyEvent('party_updated', partyId, 0, {
      action: 'start_failed',
      error: result.error,
    }));
    sendError(ws, 'dungeon_party:start_requested', result.error || 'Failed to start dungeon');
    return;
  }

  broadcastToParty(partyId, createPartyEvent('party_started', partyId, 0, {
    sessionId: result.sessionId,
    dungeonId,
  }));

  sendJson(ws, {
    type: 'dungeon_party:start_success',
    sessionId: result.sessionId,
    dungeonId,
  });
}

async function handleLeave(ws: WebSocket, playerId: string, msg: any) {
  const { partyId } = msg;
  if (!partyId) {
    sendError(ws, 'dungeon_party:leave', 'partyId required');
    return;
  }

  console.log(`[PartyTrack] WS_LEAVE_PARTY player=${playerId} party=${partyId} partyType=dungeon result=pending`);
  const result = await partyService.leaveParty(playerId, partyId);

  if (!result.success) {
    console.log(`[PartyTrack] WS_LEAVE_PARTY player=${playerId} party=${partyId} partyType=dungeon result=error reason=${result.error}`);
    sendError(ws, 'dungeon_party:leave', result.error || 'Failed to leave party');
    return;
  }

  console.log(`[PartyTrack] WS_LEAVE_PARTY player=${playerId} party=${partyId} partyType=dungeon result=ok`);
  broadcastToParty(partyId, createPartyEvent('party_member_left', partyId, 0, {
    playerId,
  }));

  sendJson(ws, { type: 'dungeon_party:left', partyId });
}

async function handleKick(ws: WebSocket, playerId: string, msg: any) {
  const { partyId, targetPlayerId } = msg;
  if (!partyId || !targetPlayerId) {
    sendError(ws, 'dungeon_party:kick', 'partyId and targetPlayerId required');
    return;
  }

  console.log(`[PartyTrack] WS_KICK_MEMBER player=${playerId} target=${targetPlayerId} party=${partyId} partyType=dungeon result=pending`);
  const result = await partyService.kickMember(partyId, playerId, targetPlayerId);

  if (!result.success) {
    console.log(`[PartyTrack] WS_KICK_MEMBER player=${playerId} target=${targetPlayerId} party=${partyId} partyType=dungeon result=error reason=${result.error}`);
    sendError(ws, 'dungeon_party:kick', result.error || 'Failed to kick member');
    return;
  }

  console.log(`[PartyTrack] WS_KICK_MEMBER player=${playerId} target=${targetPlayerId} party=${partyId} partyType=dungeon result=ok`);
  broadcastToParty(partyId, createPartyEvent('party_member_kicked', partyId, 0, {
    playerId: targetPlayerId,
    kickedBy: playerId,
  }));

  sendToPlayer(targetPlayerId, createPartyEvent('party_member_kicked', partyId, 0, {
    playerId: targetPlayerId,
    kickedBy: playerId,
  }));

  sendJson(ws, { type: 'dungeon_party:kick_success', targetPlayerId });
}

async function handleRoleChange(ws: WebSocket, playerId: string, msg: any) {
  const { partyId, targetPlayerId, role } = msg;
  if (!partyId || !targetPlayerId || !role) {
    sendError(ws, 'dungeon_party:role_change', 'partyId, targetPlayerId, and role required');
    return;
  }

  const validRoles = ['tank', 'dps', 'healer', 'hybrid'];
  if (!validRoles.includes(role)) {
    sendError(ws, 'dungeon_party:role_change', 'Invalid role');
    return;
  }

  const [membership] = await db.select()
    .from(partyMembers)
    .where(and(
      eq(partyMembers.partyId, partyId),
      eq(partyMembers.playerId, targetPlayerId),
    ));

  if (!membership) {
    sendError(ws, 'dungeon_party:role_change', 'Player not in party');
    return;
  }

  const party = await partyService.getParty(partyId);
  if (!party) {
    sendError(ws, 'dungeon_party:role_change', 'Party not found');
    return;
  }
  if (party.leaderId !== playerId && targetPlayerId !== playerId) {
    sendError(ws, 'dungeon_party:role_change', 'Not authorized');
    return;
  }

  await db.update(partyMembers)
    .set({ role } as any)
    .where(eq(partyMembers.id, membership.id));

  broadcastToParty(partyId, createPartyEvent('party_role_changed', partyId, 0, {
    playerId: targetPlayerId,
    role,
  }));

  sendJson(ws, { type: 'dungeon_party:role_changed', targetPlayerId, role });
}

function handleCastVote(ws: WebSocket, playerId: string, msg: any) {
  const vote = msg.vote === true;
  dungeonSessionManager.handleVoteCast(playerId, vote);
}

function handleBossReady(ws: WebSocket, playerId: string, msg: any) {
  dungeonSessionManager.handleBossReady(playerId);
}
