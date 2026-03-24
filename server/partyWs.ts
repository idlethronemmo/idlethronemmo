import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { handleDungeonPartyMessage } from './dungeonPartyWsHandlers';

export interface PartyWsEvent {
  type: PartyEventType;
  partyId: string;
  version: number;
  payload: Record<string, any>;
  timestamp: number;
}

export type PartyEventType =
  | 'party_invite_created'
  | 'party_invite_cancelled'
  | 'party_invite_declined'
  | 'party_invite_received'
  | 'party_member_joined'
  | 'party_member_left'
  | 'party_member_kicked'
  | 'party_ready_updated'
  | 'party_role_changed'
  | 'party_started'
  | 'party_disbanded'
  | 'party_updated'
  | 'public_parties_updated'
  | 'party_member_activity'
  | 'dungeon_floor_result'
  | 'dungeon_vote_started'
  | 'dungeon_vote_cast'
  | 'dungeon_vote_resolved'
  | 'dungeon_chat_message'
  | 'dungeon_session:started'
  | 'dungeon_session:combat_event_batch'
  | 'dungeon_session:snapshot'
  | 'dungeon_session:rejoin_prompt'
  | 'dungeon_session:ended'
  | 'lobby_chat_message';

const partyConnections = new Map<string, Set<WebSocket>>();
const playerConnections = new Map<string, Set<WebSocket>>();
const socketToPlayer = new WeakMap<WebSocket, string>();
const socketLastPong = new WeakMap<WebSocket, number>();
const socketMissedPongs = new WeakMap<WebSocket, number>();
const playerDisconnectTimers = new Map<string, NodeJS.Timeout>();

const HEARTBEAT_INTERVAL = 30_000;
const IDLE_TIMEOUT = 5 * 60_000;
const MAX_MISSED_PONGS = 2;
const DUNGEON_DISCONNECT_TIMEOUT = 60_000;

function getPlayerSockets(playerId: string): Set<WebSocket> {
  let sockets = playerConnections.get(playerId);
  if (!sockets) {
    sockets = new Set();
    playerConnections.set(playerId, sockets);
  }
  return sockets;
}

function getPartySockets(partyId: string): Set<WebSocket> {
  let sockets = partyConnections.get(partyId);
  if (!sockets) {
    sockets = new Set();
    partyConnections.set(partyId, sockets);
  }
  return sockets;
}

export function getPlayerIdFromSocket(ws: WebSocket): string | null {
  return socketToPlayer.get(ws) || null;
}

export function subscribeSocketToParty(ws: WebSocket, partyId: string) {
  getPartySockets(partyId).add(ws);
}

export function isPlayerOnlineWs(playerId: string): boolean {
  const sockets = playerConnections.get(playerId);
  if (!sockets || sockets.size === 0) return false;
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) return true;
  }
  return false;
}

function removeSocket(ws: WebSocket) {
  const playerId = socketToPlayer.get(ws);
  if (!playerId) return;

  const playerSocks = playerConnections.get(playerId);
  if (playerSocks) {
    playerSocks.delete(ws);
    if (playerSocks.size === 0) {
      playerConnections.delete(playerId);

      const timer = setTimeout(async () => {
        playerDisconnectTimers.delete(playerId);
        try {
          const currentSockets = playerConnections.get(playerId);
          if (currentSockets && currentSockets.size > 0) {
            return;
          }
          import("./services/dungeonSessionManager").then(m => {
            m.dungeonSessionManager.handlePlayerDisconnect(playerId).catch(() => {});
          }).catch(() => {});
        } catch (err) {
          console.error(`[PartyWS] Error in disconnect timer for ${playerId}:`, err);
        }
      }, DUNGEON_DISCONNECT_TIMEOUT);
      playerDisconnectTimers.set(playerId, timer);
    }
  }

  for (const [partyId, sockets] of partyConnections) {
    sockets.delete(ws);
    if (sockets.size === 0) partyConnections.delete(partyId);
  }
}

function sendJson(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch { /* ignore send errors */ }
  }
}

export function broadcastToParty(partyId: string, event: PartyWsEvent) {
  const sockets = partyConnections.get(partyId);
  if (!sockets) return;

  const msg = JSON.stringify(event);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch { /* ignore */ }
    }
  }
}

export function sendToPlayer(playerId: string, event: PartyWsEvent) {
  const sockets = playerConnections.get(playerId);
  if (!sockets) return;

  const msg = JSON.stringify(event);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch { /* ignore */ }
    }
  }
}

export function broadcastToPartyAndPlayer(partyId: string, targetPlayerId: string, event: PartyWsEvent) {
  broadcastToParty(partyId, event);
  sendToPlayer(targetPlayerId, event);
}

export function broadcastToAllPlayers(event: Record<string, any>) {
  const msg = JSON.stringify(event);
  for (const sockets of playerConnections.values()) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(msg); } catch { /* ignore */ }
      }
    }
  }
}

export function createPartyEvent(
  type: PartyEventType,
  partyId: string,
  version: number,
  payload: Record<string, any> = {}
): PartyWsEvent {
  return { type, partyId, version, payload, timestamp: Date.now() };
}

export function setupPartyWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    if (url.pathname === '/ws/party') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    wss.clients.forEach((ws) => {
      const missed = socketMissedPongs.get(ws) ?? 0;

      if (missed >= MAX_MISSED_PONGS) {
        ws.terminate();
        removeSocket(ws);
        return;
      }

      const lastPong = socketLastPong.get(ws) ?? now;
      if (now - lastPong > IDLE_TIMEOUT) {
        ws.close(4000, 'Idle timeout');
        removeSocket(ws);
        return;
      }

      if (ws.readyState === WebSocket.OPEN) {
        socketMissedPongs.set(ws, missed + 1);
        ws.ping();
      }
    });
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (ws: WebSocket) => {
    socketLastPong.set(ws, Date.now());
    socketMissedPongs.set(ws, 0);

    ws.on('pong', () => {
      socketLastPong.set(ws, Date.now());
      socketMissedPongs.set(ws, 0);
    });

    ws.on('message', (data: Buffer) => {
      socketLastPong.set(ws, Date.now());
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case 'register': {
            const { playerId } = msg;
            if (!playerId || typeof playerId !== 'string') return;

            // Clear disconnect timer if player reconnects
            const timer = playerDisconnectTimers.get(playerId);
            if (timer) {
              clearTimeout(timer);
              playerDisconnectTimers.delete(playerId);
            }

            socketToPlayer.set(ws, playerId);
            getPlayerSockets(playerId).add(ws);

            sendJson(ws, { type: 'registered', playerId });
            break;
          }

          case 'subscribe_party': {
            const { partyId } = msg;
            if (!partyId || typeof partyId !== 'string') return;

            getPartySockets(partyId).add(ws);
            sendJson(ws, { type: 'subscribed', partyId });
            break;
          }

          case 'unsubscribe_party': {
            const { partyId } = msg;
            if (!partyId) return;

            const sockets = partyConnections.get(partyId);
            if (sockets) {
              sockets.delete(ws);
              if (sockets.size === 0) partyConnections.delete(partyId);
            }
            break;
          }

          case 'ping': {
            sendJson(ws, { type: 'pong' });
            break;
          }

          default: {
            if (typeof msg.type === 'string' && msg.type.startsWith('dungeon_party:')) {
              handleDungeonPartyMessage(ws, msg).catch(err => {
                console.error('[PartyWS] Dungeon party handler error:', err);
              });
            }
            break;
          }
        }
      } catch { /* ignore malformed messages */ }
    });

    ws.on('close', () => removeSocket(ws));
    ws.on('error', () => removeSocket(ws));
  });

  console.log('[PartyWS] WebSocket server initialized on /ws/party');
}
