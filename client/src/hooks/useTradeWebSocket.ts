import { useEffect, useRef, useCallback, useState } from 'react';

interface ActiveTradeState {
  tradeId: string;
  senderId: string;
  receiverId: string;
  senderItems: Record<string, number>;
  receiverItems: Record<string, number>;
  senderGold: number;
  receiverGold: number;
  senderConfirmed: boolean;
  receiverConfirmed: boolean;
}

interface TradeRequest {
  tradeId: string;
  fromPlayerId: string;
  fromPlayerName: string;
}

interface UseTradeWebSocketOptions {
  playerId: string | null;
  enabled?: boolean;
  onTradeRequest?: (request: TradeRequest) => void;
  onTradeStarted?: (trade: ActiveTradeState) => void;
  onTradeUpdate?: (trade: Partial<ActiveTradeState> & { tradeId: string }) => void;
  onTradeCompleted?: (tradeId: string) => void;
  onTradeCancelled?: (tradeId: string) => void;
  onTradeDeclined?: (tradeId: string) => void;
  onTradeError?: (tradeId: string, message: string) => void;
  onOnlineUsers?: (users: { playerId: string; playerName: string }[]) => void;
  onPlayerDataUpdate?: () => void;
}

export function useTradeWebSocket({
  playerId,
  enabled = true,
  onTradeRequest,
  onTradeStarted,
  onTradeUpdate,
  onTradeCompleted,
  onTradeCancelled,
  onTradeDeclined,
  onTradeError,
  onOnlineUsers,
  onPlayerDataUpdate,
}: UseTradeWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [connected, setConnected] = useState(false);

  const callbacksRef = useRef({
    onTradeRequest,
    onTradeStarted,
    onTradeUpdate,
    onTradeCompleted,
    onTradeCancelled,
    onTradeDeclined,
    onTradeError,
    onOnlineUsers,
    onPlayerDataUpdate,
  });
  callbacksRef.current = {
    onTradeRequest,
    onTradeStarted,
    onTradeUpdate,
    onTradeCompleted,
    onTradeCancelled,
    onTradeDeclined,
    onTradeError,
    onOnlineUsers,
    onPlayerDataUpdate,
  };

  const connect = useCallback(() => {
    if (!playerId || !enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/trade`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setConnected(true);
      ws.send(JSON.stringify({ type: 'register', playerId }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const cb = callbacksRef.current;

        switch (data.type) {
          case 'online_users':
            cb.onOnlineUsers?.(data.users || []);
            break;
          case 'trade_request':
            cb.onTradeRequest?.({
              tradeId: data.tradeId,
              fromPlayerId: data.fromPlayerId,
              fromPlayerName: data.fromPlayerName,
            });
            break;
          case 'trade_request_sent':
            break;
          case 'trade_started':
            cb.onTradeStarted?.({
              tradeId: data.tradeId,
              senderId: data.senderId,
              receiverId: data.receiverId,
              senderItems: data.senderItems || {},
              receiverItems: data.receiverItems || {},
              senderGold: data.senderGold || 0,
              receiverGold: data.receiverGold || 0,
              senderConfirmed: !!data.senderConfirmed,
              receiverConfirmed: !!data.receiverConfirmed,
            });
            break;
          case 'trade_update':
            cb.onTradeUpdate?.({
              tradeId: data.tradeId,
              senderItems: data.senderItems,
              receiverItems: data.receiverItems,
              senderGold: data.senderGold,
              receiverGold: data.receiverGold,
              senderConfirmed: !!data.senderConfirmed,
              receiverConfirmed: !!data.receiverConfirmed,
            });
            break;
          case 'trade_completed':
            cb.onTradeCompleted?.(data.tradeId);
            break;
          case 'trade_cancelled':
            cb.onTradeCancelled?.(data.tradeId);
            break;
          case 'trade_declined':
            cb.onTradeDeclined?.(data.tradeId);
            break;
          case 'trade_error':
            cb.onTradeError?.(data.tradeId, data.message);
            break;
          case 'trade_blocked':
            cb.onTradeError?.('', data.message);
            break;
          case 'player_data_update':
            cb.onPlayerDataUpdate?.();
            break;
          case 'game_update':
            break;
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      if (reconnectAttemptsRef.current < 5) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {};
  }, [playerId, enabled]);

  const sendMessage = useCallback((msg: Record<string, any>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const requestTrade = useCallback((targetPlayerId: string) => {
    sendMessage({ type: 'trade_request', targetPlayerId });
  }, [sendMessage]);

  const acceptTrade = useCallback((tradeId: string) => {
    sendMessage({ type: 'trade_accept', tradeId });
  }, [sendMessage]);

  const declineTrade = useCallback((tradeId: string) => {
    sendMessage({ type: 'trade_decline', tradeId });
  }, [sendMessage]);

  const updateItems = useCallback((tradeId: string, items: Record<string, number>) => {
    sendMessage({ type: 'trade_update_items', tradeId, items });
  }, [sendMessage]);

  const updateGold = useCallback((tradeId: string, gold: number) => {
    sendMessage({ type: 'trade_update_gold', tradeId, gold });
  }, [sendMessage]);

  const confirmTrade = useCallback((tradeId: string) => {
    sendMessage({ type: 'trade_confirm', tradeId });
  }, [sendMessage]);

  const unconfirmTrade = useCallback((tradeId: string) => {
    sendMessage({ type: 'trade_unconfirm', tradeId });
  }, [sendMessage]);

  const cancelTrade = useCallback((tradeId: string) => {
    sendMessage({ type: 'trade_cancel', tradeId });
  }, [sendMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    connected,
    requestTrade,
    acceptTrade,
    declineTrade,
    updateItems,
    updateGold,
    confirmTrade,
    unconfirmTrade,
    cancelTrade,
  };
}
