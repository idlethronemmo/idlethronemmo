import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface UseMarketWebSocketOptions {
  playerId: string | null;
  enabled?: boolean;
  onMarketSale?: (payload: { listingId: string; itemId: string; quantitySold: number; remainingQuantity: number; goldEarned: number }) => void;
  onListingUpdated?: (payload: { listingId: string; itemId: string; newQuantity: number; action?: string }) => void;
}

export function useMarketWebSocket({ playerId, enabled = true, onMarketSale, onListingUpdated }: UseMarketWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const onMarketSaleRef = useRef(onMarketSale);
  onMarketSaleRef.current = onMarketSale;
  const onListingUpdatedRef = useRef(onListingUpdated);
  onListingUpdatedRef.current = onListingUpdated;
  const queryClient = useQueryClient();

  const connect = useCallback(() => {
    if (!playerId || !enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/party`);
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
            return;
          }
          if (data.type === 'pong' || data.type === 'subscribed') return;

          if (data.type === 'market_sale') {
            onMarketSaleRef.current?.(data.payload);
            queryClient.invalidateQueries({ queryKey: ['market-grouped'] });
            queryClient.invalidateQueries({ queryKey: ['market-item-listings'] });
            queryClient.invalidateQueries({ queryKey: ['/api/market/my-listings'] });
            return;
          }

          if (data.type === 'market_listing_updated') {
            onListingUpdatedRef.current?.(data);
            queryClient.invalidateQueries({ queryKey: ['market-grouped'] });
            queryClient.invalidateQueries({ queryKey: ['market-item-listings'] });
            queryClient.invalidateQueries({ queryKey: ['/api/market/my-listings'] });
            return;
          }
        } catch { }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;

        if (enabled && playerId && reconnectAttemptsRef.current < 3) {
          const delay = Math.min(5000 * Math.pow(2, reconnectAttemptsRef.current), 60000);
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch { }
  }, [playerId, enabled, queryClient]);

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

  return { connected };
}
