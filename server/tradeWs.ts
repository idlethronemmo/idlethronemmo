import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { storage } from './storage';
import type { TradeItems, PartySnapshotAtLogout } from '@shared/schema';
import { partyMembers } from '@shared/schema';
import { isItemTradable } from '@shared/itemData';
import { notifyPlayerIdle, notifyPlayerWorking } from './utils/push';
import { db } from '../db';
import { eq } from 'drizzle-orm';

interface PlayerConnection {
  playerId: string;
  playerName: string;
  sockets: Set<WebSocket>; // All active WebSocket connections for this player
}

const players = new Map<string, PlayerConnection>();
const activeTrades = new Map<string, { initiatorId: string; targetId: string }>();
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DISCONNECT_NOTIFICATION_DELAY = 15000; // 15 seconds

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // Single interval: ping + idle check every 30s
const MAX_MISSED_PONGS = 2; // Terminate after 2 consecutive missed pongs
const socketLastActivity = new WeakMap<WebSocket, number>();
const socketMissedPongs = new WeakMap<WebSocket, number>();

function markActivity(ws: WebSocket): void {
  socketLastActivity.set(ws, Date.now());
}

function markAlive(ws: WebSocket): void {
  socketMissedPongs.set(ws, 0);
}

// Compatibility: clients getter for existing code that uses clients map
const clients = {
  has: (playerId: string) => players.has(playerId),
  get: (playerId: string): { ws: WebSocket; playerId: string; playerName: string } | undefined => {
    const player = players.get(playerId);
    if (!player || player.sockets.size === 0) return undefined;
    // Return first active socket for compatibility
    const socketsArray = Array.from(player.sockets);
    const ws = socketsArray[0];
    if (!ws) return undefined;
    return { ws, playerId: player.playerId, playerName: player.playerName };
  },
  delete: (playerId: string) => players.delete(playerId),
  forEach: (callback: (client: { ws: WebSocket; playerId: string; playerName: string }) => void) => {
    players.forEach((player) => {
      // Use first active socket for broadcasts
      const socketsArray = Array.from(player.sockets);
      const ws = socketsArray[0];
      if (ws) {
        callback({ ws, playerId: player.playerId, playerName: player.playerName });
      }
    });
  },
  keys: (): string[] => {
    return Array.from(players.keys());
  },
  values: function* (): Generator<{ ws: WebSocket; playerId: string; playerName: string }> {
    for (const player of Array.from(players.values())) {
      const socketsArray = Array.from(player.sockets);
      const ws = socketsArray[0];
      if (ws) {
        yield { ws, playerId: player.playerId, playerName: player.playerName };
      }
    }
  }
};

export function setupTradeWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    if (url.pathname === '/ws/trade') {
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
        let deadPlayerId: string | null = null;
        const entries = Array.from(players.entries());
        for (const [pid, conn] of entries) {
          if (conn.sockets.has(ws)) {
            deadPlayerId = pid;
            break;
          }
        }
        console.log(`[TradeWS] Terminating unresponsive socket for player ${deadPlayerId || 'unknown'} (${missed} missed pongs)`);
        ws.terminate();
        return;
      }

      const lastActivity = socketLastActivity.get(ws);
      if (lastActivity && now - lastActivity > IDLE_TIMEOUT_MS) {
        let idlePlayerId: string | null = null;
        const entries = Array.from(players.entries());
        for (const [pid, conn] of entries) {
          if (conn.sockets.has(ws)) {
            idlePlayerId = pid;
            break;
          }
        }
        console.log(`[TradeWS] Closing idle socket for player ${idlePlayerId || 'unknown'} (inactive ${Math.round((now - lastActivity) / 1000)}s)`);
        ws.close(4000, 'Idle timeout');
        return;
      }

      if (ws.readyState === WebSocket.OPEN) {
        socketMissedPongs.set(ws, missed + 1);
        ws.ping();
      }
    });
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (ws: WebSocket) => {
    let clientPlayerId: string | null = null;

    markActivity(ws);
    markAlive(ws);

    ws.on('pong', () => {
      markActivity(ws);
      markAlive(ws);
    });

    ws.on('message', async (data: Buffer) => {
      markActivity(ws);
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'register':
            clientPlayerId = message.playerId;
            const player = await storage.getPlayer(message.playerId);
            if (player) {
              // Cancel any pending disconnect notification if player reconnects
              const existingTimer = disconnectTimers.get(message.playerId);
              if (existingTimer) {
                clearTimeout(existingTimer);
                disconnectTimers.delete(message.playerId);
              }
              
              // Add socket to player's connection set
              let playerConn = players.get(message.playerId);
              if (!playerConn) {
                playerConn = {
                  playerId: message.playerId,
                  playerName: player.username,
                  sockets: new Set()
                };
                players.set(message.playerId, playerConn);
              }
              playerConn.sockets.add(ws);
              
              broadcastOnlineUsers();
            }
            break;

          case 'get_online_users':
            sendOnlineUsers(ws, clientPlayerId);
            break;

          case 'trade_request':
            await handleTradeRequest(clientPlayerId!, message.targetPlayerId);
            break;

          case 'trade_accept':
            await handleTradeAccept(message.tradeId, clientPlayerId!);
            break;

          case 'trade_decline':
            await handleTradeDecline(message.tradeId, clientPlayerId!);
            break;

          case 'trade_update_items':
            await handleTradeUpdateItems(message.tradeId, clientPlayerId!, message.items);
            break;

          case 'trade_update_gold':
            await handleTradeUpdateGold(message.tradeId, clientPlayerId!, message.gold);
            break;

          case 'trade_confirm':
            await handleTradeConfirm(message.tradeId, clientPlayerId!);
            break;

          case 'trade_unconfirm':
            await handleTradeUnconfirm(message.tradeId, clientPlayerId!);
            break;

          case 'trade_cancel':
            await handleTradeCancel(message.tradeId, clientPlayerId!);
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      if (clientPlayerId) {
        const playerId = clientPlayerId;
        const playerConn = players.get(playerId);
        
        if (playerConn) {
          // Remove this socket from the player's connection set
          playerConn.sockets.delete(ws);
          
          if (playerConn.sockets.size === 0) {
            // Last connection closed - remove player and start timer
            players.delete(playerId);
            broadcastOnlineUsers();
            cancelPlayerTrades(playerId);
            
            // Start disconnect notification timer
            const timer = setTimeout(async () => {
              disconnectTimers.delete(playerId);
              
              // Check if player is still offline (hasn't reconnected)
              if (players.has(playerId)) {
                return; // Player reconnected, don't send notification
              }
              
              try {
                const player = await storage.getPlayer(playerId);
                if (!player) return;
                
                // Save party snapshot on disconnect (same as logout route)
                try {
                  const [membership] = await db.select()
                    .from(partyMembers)
                    .where(eq(partyMembers.playerId, playerId));
                  
                  if (membership) {
                    const allMembers = await db.select({
                      playerId: partyMembers.playerId,
                      role: partyMembers.role,
                      cachedWeaponType: partyMembers.cachedWeaponType,
                    })
                      .from(partyMembers)
                      .where(eq(partyMembers.partyId, membership.partyId));
                    
                    const memberDetails = await Promise.all(
                      allMembers.filter(m => m.playerId !== playerId).map(async (m) => {
                        const memberPlayer = await storage.getPlayer(m.playerId);
                        return {
                          playerId: m.playerId,
                          playerName: memberPlayer?.username || 'Unknown',
                          role: m.role,
                          cachedWeaponType: m.cachedWeaponType,
                        };
                      })
                    );
                    
                    const partySnapshotAtLogout: PartySnapshotAtLogout = {
                      partyId: membership.partyId,
                      members: memberDetails,
                      snapshotAt: Date.now(),
                    };
                    
                    await storage.updatePlayer(playerId, {
                      lastLogoutAt: new Date(),
                      isOnline: 0,
                      partySnapshotAtLogout,
                    });
                    console.log(`[WS Disconnect] Player ${playerId} disconnected, party snapshot saved`);
                  } else {
                    await storage.updatePlayer(playerId, {
                      lastLogoutAt: new Date(),
                      isOnline: 0,
                    });
                  }
                } catch (e) {
                  console.error('[WS Disconnect] Party snapshot error:', e);
                  await storage.updatePlayer(playerId, {
                    lastLogoutAt: new Date(),
                    isOnline: 0,
                  });
                }
                
                const hasActiveTask = !!player.activeTask;
                const hasActiveCombat = !!(player.activeCombat as any)?.monsterId;
                
                if (hasActiveCombat) {
                  const monsterId = (player.activeCombat as any).monsterId;
                  const monsterName = monsterId.split('_').map((w: string) => 
                    w.charAt(0).toUpperCase() + w.slice(1)
                  ).join(' ');
                  await notifyPlayerWorking(playerId, monsterName, 'combat');
                } else if (hasActiveTask) {
                  const activeTask = player.activeTask as { name?: string; skillId?: string } | null;
                  const taskName = activeTask?.name || activeTask?.skillId || 'görev';
                  await notifyPlayerWorking(playerId, taskName, 'skill');
                } else {
                  await notifyPlayerIdle(playerId);
                }
              } catch (error) {
                console.error('Disconnect notification error:', error);
              }
            }, DISCONNECT_NOTIFICATION_DELAY);
            
            disconnectTimers.set(playerId, timer);
          }
          // If sockets.size > 0, player still has other tabs open - no action needed
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  return wss;
}

function broadcastOnlineUsers() {
  const onlineUsers = Array.from(clients.values()).map(c => ({
    playerId: c.playerId,
    playerName: c.playerName,
  }));

  const message = JSON.stringify({
    type: 'online_users',
    users: onlineUsers,
  });

  clients.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  });
}

export function broadcastGameUpdate(updateType: string) {
  const message = JSON.stringify({
    type: 'game_update',
    updateType,
    timestamp: Date.now(),
  });

  let sentCount = 0;
  // Send to ALL sockets for each player (all tabs)
  players.forEach((player) => {
    player.sockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        sentCount++;
      }
    });
  });
  
  console.log(`[WebSocket] Broadcasted game update (${updateType}) to ${sentCount} connections`);
}

export function sendPlayerDataUpdate(playerId: string) {
  const player = players.get(playerId);
  if (!player) return;
  
  const message = JSON.stringify({
    type: 'player_data_update',
    playerId,
    timestamp: Date.now(),
  });

  let sentCount = 0;
  player.sockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    }
  });
  
  console.log(`[WebSocket] Sent player data update to player ${playerId} (${sentCount} connections)`);
}

function sendOnlineUsers(ws: WebSocket, excludePlayerId: string | null) {
  const onlineUsers = Array.from(clients.values())
    .filter(c => c.playerId !== excludePlayerId)
    .map(c => ({
      playerId: c.playerId,
      playerName: c.playerName,
    }));

  ws.send(JSON.stringify({
    type: 'online_users',
    users: onlineUsers,
  }));
}

async function handleTradeRequest(fromPlayerId: string, targetPlayerId: string) {
  const targetClient = clients.get(targetPlayerId);
  if (!targetClient) {
    const fromClient = clients.get(fromPlayerId);
    if (fromClient?.ws.readyState === WebSocket.OPEN) {
      fromClient.ws.send(JSON.stringify({
        type: 'trade_error',
        message: 'Oyuncu çevrimdışı',
      }));
    }
    return;
  }

  const targetPlayer = await storage.getPlayer(targetPlayerId);
  if (targetPlayer && targetPlayer.tradeEnabled === 0) {
    const fromClient = clients.get(fromPlayerId);
    if (fromClient?.ws.readyState === WebSocket.OPEN) {
      fromClient.ws.send(JSON.stringify({
        type: 'trade_blocked',
        targetPlayerName: targetPlayer.username,
        message: 'Bu oyuncu takas isteklerini kapatmış',
      }));
    }
    return;
  }

  const trade = await storage.createTrade({
    senderId: fromPlayerId,
    receiverId: targetPlayerId,
    senderItems: {},
    receiverItems: {},
    senderGold: 0,
    receiverGold: 0,
    status: 'pending',
  });

  activeTrades.set(trade.id, { initiatorId: fromPlayerId, targetId: targetPlayerId });

  const fromPlayer = await storage.getPlayer(fromPlayerId);

  targetClient.ws.send(JSON.stringify({
    type: 'trade_request',
    tradeId: trade.id,
    fromPlayerId,
    fromPlayerName: fromPlayer?.username || 'Bilinmeyen',
  }));

  const fromClient = clients.get(fromPlayerId);
  if (fromClient?.ws.readyState === WebSocket.OPEN) {
    fromClient.ws.send(JSON.stringify({
      type: 'trade_request_sent',
      tradeId: trade.id,
      targetPlayerId,
      targetPlayerName: targetClient.playerName,
    }));
  }
}

async function handleTradeAccept(tradeId: string, playerId: string) {
  const trade = await storage.getTrade(tradeId);
  if (!trade || trade.receiverId !== playerId || trade.status !== 'pending') return;

  await storage.updateTrade(tradeId, { status: 'active' });

  const senderClient = clients.get(trade.senderId);
  const receiverClient = clients.get(trade.receiverId);

  const tradeState = {
    type: 'trade_started',
    tradeId,
    senderId: trade.senderId,
    receiverId: trade.receiverId,
    senderItems: {},
    receiverItems: {},
    senderGold: 0,
    receiverGold: 0,
    senderConfirmed: false,
    receiverConfirmed: false,
  };

  [senderClient, receiverClient].forEach(client => {
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(tradeState));
    }
  });
}

async function handleTradeDecline(tradeId: string, playerId: string) {
  const trade = await storage.getTrade(tradeId);
  if (!trade || trade.status !== 'pending') return;

  await storage.updateTrade(tradeId, { status: 'declined' });
  activeTrades.delete(tradeId);

  const senderClient = clients.get(trade.senderId);
  if (senderClient?.ws.readyState === WebSocket.OPEN) {
    senderClient.ws.send(JSON.stringify({
      type: 'trade_declined',
      tradeId,
    }));
  }
}

async function handleTradeUpdateItems(tradeId: string, playerId: string, items: TradeItems) {
  const trade = await storage.getTrade(tradeId);
  if (!trade || trade.status !== 'active') return;

  const isSender = trade.senderId === playerId;
  const isReceiver = trade.receiverId === playerId;
  if (!isSender && !isReceiver) return;

  const player = await storage.getPlayer(playerId);
  if (!player) return;

  const playerInventory = player.inventory as Record<string, number>;
  const cursedItems = (player.cursedItems as string[]) || [];
  const inventoryDurability = (player.inventoryDurability || {}) as Record<string, number>;
  for (const [itemId, qty] of Object.entries(items)) {
    if (!isItemTradable(itemId) || cursedItems.includes(itemId)) {
      const client = clients.get(playerId);
      if (client?.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'trade_error',
          tradeId,
          message: `Bu item takas edilemez: ${itemId}`,
        }));
      }
      return;
    }
    const durability = inventoryDurability[itemId] ?? 100;
    if (durability < 100) {
      const client = clients.get(playerId);
      if (client?.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'trade_error',
          tradeId,
          message: `Hasarlı ekipman takas edilemez: ${itemId}`,
        }));
      }
      return;
    }
    if (qty < 0 || (playerInventory[itemId] || 0) < qty) {
      const client = clients.get(playerId);
      if (client?.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'trade_error',
          tradeId,
          message: `Yetersiz item: ${itemId}`,
        }));
      }
      return;
    }
  }

  const updateData: any = {
    senderConfirmed: 0,
    receiverConfirmed: 0,
  };

  if (isSender) {
    updateData.senderItems = items;
  } else {
    updateData.receiverItems = items;
  }

  await storage.updateTrade(tradeId, updateData);

  const updatedTrade = await storage.getTrade(tradeId);
  if (!updatedTrade) return;

  const tradeUpdate = {
    type: 'trade_update',
    tradeId,
    senderItems: updatedTrade.senderItems,
    receiverItems: updatedTrade.receiverItems,
    senderGold: updatedTrade.senderGold,
    receiverGold: updatedTrade.receiverGold,
    senderConfirmed: updatedTrade.senderConfirmed === 1,
    receiverConfirmed: updatedTrade.receiverConfirmed === 1,
  };

  [trade.senderId, trade.receiverId].forEach(pid => {
    const client = clients.get(pid);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(tradeUpdate));
    }
  });
}

async function handleTradeUpdateGold(tradeId: string, playerId: string, gold: number) {
  const trade = await storage.getTrade(tradeId);
  if (!trade || trade.status !== 'active') return;

  const isSender = trade.senderId === playerId;
  const isReceiver = trade.receiverId === playerId;
  if (!isSender && !isReceiver) return;

  if (typeof gold !== 'number' || gold < 0 || !Number.isFinite(gold)) {
    const client = clients.get(playerId);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'trade_error',
        tradeId,
        message: 'Geçersiz altın miktarı',
      }));
    }
    return;
  }

  const player = await storage.getPlayer(playerId);
  if (!player) return;

  if (gold > player.gold) {
    const client = clients.get(playerId);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'trade_error',
        tradeId,
        message: 'Yetersiz altın',
      }));
    }
    return;
  }

  const updateData: any = {
    senderConfirmed: 0,
    receiverConfirmed: 0,
  };

  if (isSender) {
    updateData.senderGold = Math.floor(gold);
  } else {
    updateData.receiverGold = Math.floor(gold);
  }

  await storage.updateTrade(tradeId, updateData);

  const updatedTrade = await storage.getTrade(tradeId);
  if (!updatedTrade) return;

  const tradeUpdate = {
    type: 'trade_update',
    tradeId,
    senderItems: updatedTrade.senderItems,
    receiverItems: updatedTrade.receiverItems,
    senderGold: updatedTrade.senderGold,
    receiverGold: updatedTrade.receiverGold,
    senderConfirmed: updatedTrade.senderConfirmed === 1,
    receiverConfirmed: updatedTrade.receiverConfirmed === 1,
  };

  [trade.senderId, trade.receiverId].forEach(pid => {
    const client = clients.get(pid);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(tradeUpdate));
    }
  });
}

async function handleTradeConfirm(tradeId: string, playerId: string) {
  const trade = await storage.getTrade(tradeId);
  if (!trade || trade.status !== 'active') return;

  const isSender = trade.senderId === playerId;
  const isReceiver = trade.receiverId === playerId;
  if (!isSender && !isReceiver) return;

  if (isSender) {
    await storage.updateTrade(tradeId, { senderConfirmed: 1 });
  } else {
    await storage.updateTrade(tradeId, { receiverConfirmed: 1 });
  }

  const updatedTrade = await storage.getTrade(tradeId);
  if (!updatedTrade) return;

  if (updatedTrade.senderConfirmed === 1 && updatedTrade.receiverConfirmed === 1) {
    await executeTrade(tradeId);
  } else {
    const tradeUpdate = {
      type: 'trade_update',
      tradeId,
      senderItems: updatedTrade.senderItems,
      receiverItems: updatedTrade.receiverItems,
      senderGold: updatedTrade.senderGold,
      receiverGold: updatedTrade.receiverGold,
      senderConfirmed: updatedTrade.senderConfirmed === 1,
      receiverConfirmed: updatedTrade.receiverConfirmed === 1,
    };

    [trade.senderId, trade.receiverId].forEach(pid => {
      const client = clients.get(pid);
      if (client?.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(tradeUpdate));
      }
    });
  }
}

async function handleTradeUnconfirm(tradeId: string, playerId: string) {
  const trade = await storage.getTrade(tradeId);
  if (!trade || trade.status !== 'active') return;

  const isSender = trade.senderId === playerId;
  const isReceiver = trade.receiverId === playerId;
  if (!isSender && !isReceiver) return;

  if (isSender) {
    await storage.updateTrade(tradeId, { senderConfirmed: 0 });
  } else {
    await storage.updateTrade(tradeId, { receiverConfirmed: 0 });
  }

  const updatedTrade = await storage.getTrade(tradeId);
  if (!updatedTrade) return;

  const tradeUpdate = {
    type: 'trade_update',
    tradeId,
    senderItems: updatedTrade.senderItems,
    receiverItems: updatedTrade.receiverItems,
    senderGold: updatedTrade.senderGold,
    receiverGold: updatedTrade.receiverGold,
    senderConfirmed: updatedTrade.senderConfirmed === 1,
    receiverConfirmed: updatedTrade.receiverConfirmed === 1,
  };

  [trade.senderId, trade.receiverId].forEach(pid => {
    const client = clients.get(pid);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(tradeUpdate));
    }
  });
}

async function handleTradeCancel(tradeId: string, playerId: string) {
  const trade = await storage.getTrade(tradeId);
  if (!trade) return;

  if (trade.senderId !== playerId && trade.receiverId !== playerId) return;

  await storage.updateTrade(tradeId, { status: 'cancelled' });
  activeTrades.delete(tradeId);

  const message = {
    type: 'trade_cancelled',
    tradeId,
    reason: 'Takas iptal edildi',
  };

  [trade.senderId, trade.receiverId].forEach(pid => {
    const client = clients.get(pid);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  });
}

async function executeTrade(tradeId: string) {
  const trade = await storage.getTrade(tradeId);
  if (!trade || trade.status !== 'active') return;

  const result = await storage.executeTradeAtomic(tradeId);
  
  if (!result.success) {
    await sendTradeError(tradeId, trade.senderId, trade.receiverId, result.error || 'Trade failed');
    return;
  }

  activeTrades.delete(tradeId);

  const message = {
    type: 'trade_completed',
    tradeId,
    success: true,
    requiresRefresh: true,
  };

  [trade.senderId, trade.receiverId].forEach(pid => {
    const client = clients.get(pid);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
    sendPlayerDataUpdate(pid);
  });
}

async function sendTradeError(tradeId: string, senderId: string, receiverId: string, errorMessage: string) {
  await storage.updateTrade(tradeId, { status: 'failed' });
  activeTrades.delete(tradeId);

  const message = {
    type: 'trade_error',
    tradeId,
    message: errorMessage,
  };

  [senderId, receiverId].forEach(pid => {
    const client = clients.get(pid);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  });
}

function cancelPlayerTrades(playerId: string) {
  activeTrades.forEach(async (trade, tradeId) => {
    if (trade.initiatorId === playerId || trade.targetId === playerId) {
      await handleTradeCancel(tradeId, playerId);
    }
  });
}

export function getOnlinePlayerIds(): string[] {
  return Array.from(clients.keys());
}

export function isPlayerOnline(playerId: string): boolean {
  return clients.has(playerId);
}

export function getOnlinePlayersList(): { playerId: string; playerName: string }[] {
  return Array.from(players.values()).map(p => ({
    playerId: p.playerId,
    playerName: p.playerName,
  }));
}

export function hasPendingTradeForPlayer(playerId: string): boolean {
  let found = false;
  activeTrades.forEach((trade) => {
    if (trade.initiatorId === playerId || trade.targetId === playerId) {
      found = true;
    }
  });
  return found;
}

