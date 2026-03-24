import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface PartyWsEvent {
  type: string;
  partyId: string;
  version: number;
  payload: Record<string, any>;
  timestamp: number;
}

interface UsePartyWebSocketOptions {
  playerId: string | null;
  partyId: string | null;
  enabled?: boolean;
  onEvent?: (event: PartyWsEvent) => void;
}

export function usePartyWebSocket({ playerId, partyId, enabled = true, onEvent }: UsePartyWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const subscribedPartyRef = useRef<string | null>(null);
  const partyIdRef = useRef(partyId);
  partyIdRef.current = partyId;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/party`;
  }, []);

  const invalidatePartyQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/parties/current'] });
    queryClient.invalidateQueries({ queryKey: ['/api/parties/my/snapshot'] });
    queryClient.invalidateQueries({ queryKey: ['/api/party-invites'] });
    const pid = partyIdRef.current;
    if (pid) {
      queryClient.invalidateQueries({ queryKey: [`/api/parties/${pid}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/parties/${pid}/snapshot`] });
    }
  }, [queryClient]);

  const connect = useCallback(() => {
    if (!playerId || !enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const MAX_RECONNECT_ATTEMPTS = 5;

    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        ws.send(JSON.stringify({ type: 'register', playerId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'registered') {
            setConnected(true);
            const currentPartyId = partyIdRef.current;
            if (currentPartyId) {
              ws.send(JSON.stringify({ type: 'subscribe_party', partyId: currentPartyId }));
              subscribedPartyRef.current = currentPartyId;
            }
            return;
          }

          if (data.type === 'subscribed') return;
          if (data.type === 'pong') return;

          if (data.type === 'market_sale' || data.type === 'market_listing_updated') {
            return;
          }

          if (data.type === 'public_parties_updated') {
            queryClient.invalidateQueries({ queryKey: ['/api/parties/public'] });
            return;
          }

          if (data.type === 'party_member_activity') {
            invalidatePartyQueries();
            return;
          }

          if (data.type === 'party_disbanded' || 
              (data.type === 'party_member_kicked' && data.payload?.playerId === playerId)) {
            queryClient.setQueryData(['/api/parties/current'], null);
          }
          invalidatePartyQueries();
          onEventRef.current?.(data as PartyWsEvent);
        } catch { }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        subscribedPartyRef.current = null;

        if (enabled && playerId && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(2000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch { }
  }, [playerId, enabled, getWsUrl, invalidatePartyQueries]);

  useEffect(() => {
    if (!enabled || !playerId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [playerId, enabled, connect]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (subscribedPartyRef.current && subscribedPartyRef.current !== partyId) {
      ws.send(JSON.stringify({ type: 'unsubscribe_party', partyId: subscribedPartyRef.current }));
      subscribedPartyRef.current = null;
    }

    if (partyId && subscribedPartyRef.current !== partyId) {
      ws.send(JSON.stringify({ type: 'subscribe_party', partyId }));
      subscribedPartyRef.current = partyId;
    }
  }, [partyId]);

  const sendMessage = useCallback((msg: Record<string, any>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { connected, sendMessage };
}
