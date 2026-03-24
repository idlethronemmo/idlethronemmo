import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { getAuthHeaders } from "@/context/FirebaseAuthContext";
import { useGame } from "@/context/GameContext";
import { reloadItemsData } from "@/lib/items";
import { reloadMonstersData } from "@/lib/monsters";
import { queryClient } from "@/lib/queryClient";
import { useTradeWebSocket } from "@/hooks/useTradeWebSocket";

function useTradeGameData(): { playerId: string | null; refreshPlayer: () => Promise<void> } {
  try {
    const { player, refreshPlayer } = useGame();
    return { playerId: player?.id || null, refreshPlayer };
  } catch {
    return { playerId: null, refreshPlayer: async () => {} };
  }
}

interface TradeOffer {
  id: string;
  senderId: string;
  receiverId: string;
  senderItems: Record<string, number>;
  receiverItems: Record<string, number>;
  senderGold: number;
  receiverGold: number;
  senderConfirmed: number;
  receiverConfirmed: number;
  status: string;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  completedAt: string | null;
  otherPlayerName: string;
  otherPlayerAvatar: string | null;
  otherPlayerLevel: number;
  isSender: boolean;
}

export interface ActiveTrade {
  tradeId: string;
  senderId: string;
  receiverId: string;
  myItems: Record<string, number>;
  partnerItems: Record<string, number>;
  myGold: number;
  partnerGold: number;
  myConfirmed: boolean;
  partnerConfirmed: boolean;
}

interface TradeContextType {
  offers: TradeOffer[];
  isLoading: boolean;
  fetchOffers: (type?: 'incoming' | 'outgoing' | 'all') => Promise<void>;
  createOffer: (receiverId: string, senderItems: Record<string, number>, senderGold: number, message?: string) => Promise<{ success: boolean; error?: string }>;
  respondToOffer: (tradeId: string, action: 'decline' | 'counter', items?: Record<string, number>, gold?: number) => Promise<{ success: boolean; error?: string }>;
  confirmOffer: (tradeId: string) => Promise<{ success: boolean; error?: string; status?: string }>;
  cancelOffer: (tradeId: string) => Promise<{ success: boolean; error?: string }>;
  gameUpdateAvailable: boolean;
  clearGameUpdate: () => void;
  playerDataUpdateAvailable: boolean;
  clearPlayerDataUpdate: () => void;
  activeTrade: ActiveTrade | null;
  updateMyItems: (items: Record<string, number>) => void;
  updateMyGold: (gold: number) => void;
  confirmTrade: () => void;
  unconfirmTrade: () => void;
  cancelTrade: () => void;
  pendingTradeRequest: { tradeId: string; fromPlayerName: string } | null;
  pendingRequest: { tradeId: string; fromPlayerName: string } | null;
  acceptTradeRequest: () => void;
  declineTradeRequest: () => void;
  requestRealtimeTrade: (targetPlayerId: string) => void;
  sendTradeRequest: (targetPlayerId: string) => void;
  wsConnected: boolean;
  isConnected: boolean;
  pendingOutgoingRequest: boolean;
}

const TradeContext = createContext<TradeContextType | undefined>(undefined);

export function TradeProvider({ children }: { children: React.ReactNode }) {
  const { playerId, refreshPlayer } = useTradeGameData();
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [gameUpdateAvailable, setGameUpdateAvailable] = useState(false);
  const [playerDataUpdateAvailable, setPlayerDataUpdateAvailable] = useState(false);
  const [activeTrade, setActiveTrade] = useState<ActiveTrade | null>(null);
  const [pendingTradeRequest, setPendingTradeRequest] = useState<{ tradeId: string; fromPlayerName: string } | null>(null);
  const [pendingOutgoingRequest, setPendingOutgoingRequest] = useState(false);
  const activeTradeRef = useRef<ActiveTrade | null>(null);
  const playerIdRef = useRef(playerId);
  playerIdRef.current = playerId;

  const refreshPlayerAfterTrade = useCallback(() => {
    refreshPlayer();
  }, [refreshPlayer]);

  const {
    connected: wsConnected,
    requestTrade: wsRequestTrade,
    acceptTrade: wsAcceptTrade,
    declineTrade: wsDeclineTrade,
    updateItems: wsUpdateItems,
    updateGold: wsUpdateGold,
    confirmTrade: wsConfirmTrade,
    unconfirmTrade: wsUnconfirmTrade,
    cancelTrade: wsCancelTrade,
  } = useTradeWebSocket({
    playerId,
    enabled: !!playerId,
    onTradeRequest: (request) => {
      setPendingTradeRequest({
        tradeId: request.tradeId,
        fromPlayerName: request.fromPlayerName,
      });
    },
    onTradeStarted: (trade) => {
      const pid = playerIdRef.current;
      if (!pid) return;
      const isSender = trade.senderId === pid;
      const newActiveTrade: ActiveTrade = {
        tradeId: trade.tradeId,
        senderId: trade.senderId,
        receiverId: trade.receiverId,
        myItems: isSender ? trade.senderItems : trade.receiverItems,
        partnerItems: isSender ? trade.receiverItems : trade.senderItems,
        myGold: isSender ? trade.senderGold : trade.receiverGold,
        partnerGold: isSender ? trade.receiverGold : trade.senderGold,
        myConfirmed: isSender ? trade.senderConfirmed : trade.receiverConfirmed,
        partnerConfirmed: isSender ? trade.receiverConfirmed : trade.senderConfirmed,
      };
      setActiveTrade(newActiveTrade);
      activeTradeRef.current = newActiveTrade;
      setPendingTradeRequest(null);
      setPendingOutgoingRequest(false);
    },
    onTradeUpdate: (update) => {
      const pid = playerIdRef.current;
      if (!pid) return;
      setActiveTrade(prev => {
        if (!prev || prev.tradeId !== update.tradeId) return prev;
        const isSender = prev.senderId === pid;
        const updated: ActiveTrade = {
          ...prev,
          myItems: (isSender ? update.senderItems : update.receiverItems) ?? prev.myItems,
          partnerItems: (isSender ? update.receiverItems : update.senderItems) ?? prev.partnerItems,
          myGold: (isSender ? update.senderGold : update.receiverGold) ?? prev.myGold,
          partnerGold: (isSender ? update.receiverGold : update.senderGold) ?? prev.partnerGold,
          myConfirmed: (isSender ? update.senderConfirmed : update.receiverConfirmed) ?? prev.myConfirmed,
          partnerConfirmed: (isSender ? update.receiverConfirmed : update.senderConfirmed) ?? prev.partnerConfirmed,
        };
        activeTradeRef.current = updated;
        return updated;
      });
    },
    onTradeCompleted: () => {
      setActiveTrade(null);
      activeTradeRef.current = null;
      refreshPlayerAfterTrade();
    },
    onTradeCancelled: () => {
      setActiveTrade(null);
      activeTradeRef.current = null;
    },
    onTradeDeclined: () => {
      setPendingTradeRequest(null);
    },
    onTradeError: () => {
      setActiveTrade(null);
      activeTradeRef.current = null;
    },
    onPlayerDataUpdate: () => {
      refreshPlayerAfterTrade();
    },
  });

  const fetchOffers = useCallback(async (type: 'incoming' | 'outgoing' | 'all' = 'all') => {
    setIsLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`/api/trades?type=${type}`, {
        credentials: 'include',
        headers: { ...authHeaders },
      });
      if (response.ok) {
        const data = await response.json();
        setOffers(data.offers || []);
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createOffer = useCallback(async (receiverId: string, senderItems: Record<string, number>, senderGold: number, message?: string) => {
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        credentials: 'include',
        body: JSON.stringify({ receiverId, senderItems, senderGold, message }),
      });
      const data = await response.json();
      if (!response.ok) return { success: false, error: data.error };
      await fetchOffers();
      return { success: true };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }, [fetchOffers]);

  const respondToOffer = useCallback(async (tradeId: string, action: 'decline' | 'counter', items?: Record<string, number>, gold?: number) => {
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`/api/trades/${tradeId}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        credentials: 'include',
        body: JSON.stringify({ action, items, gold }),
      });
      const data = await response.json();
      if (!response.ok) return { success: false, error: data.error };
      await fetchOffers();
      return { success: true };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }, [fetchOffers]);

  const confirmOffer = useCallback(async (tradeId: string) => {
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`/api/trades/${tradeId}/confirm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) return { success: false, error: data.error };
      await fetchOffers();
      if (data.status === 'completed') {
        refreshPlayerAfterTrade();
      }
      return { success: true, status: data.status };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }, [fetchOffers, refreshPlayerAfterTrade]);

  const cancelOffer = useCallback(async (tradeId: string) => {
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`/api/trades/${tradeId}`, {
        method: 'DELETE',
        headers: { ...authHeaders },
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) return { success: false, error: data.error };
      await fetchOffers();
      return { success: true };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }, [fetchOffers]);

  const updateMyItems = useCallback((items: Record<string, number>) => {
    const current = activeTradeRef.current;
    if (!current) return;
    wsUpdateItems(current.tradeId, items);
  }, [wsUpdateItems]);

  const updateMyGold = useCallback((gold: number) => {
    const current = activeTradeRef.current;
    if (!current) return;
    wsUpdateGold(current.tradeId, gold);
  }, [wsUpdateGold]);

  const confirmTradeWs = useCallback(() => {
    const current = activeTradeRef.current;
    if (!current) return;
    wsConfirmTrade(current.tradeId);
  }, [wsConfirmTrade]);

  const unconfirmTradeWs = useCallback(() => {
    const current = activeTradeRef.current;
    if (!current) return;
    wsUnconfirmTrade(current.tradeId);
  }, [wsUnconfirmTrade]);

  const cancelTradeWs = useCallback(() => {
    const current = activeTradeRef.current;
    if (!current) return;
    wsCancelTrade(current.tradeId);
  }, [wsCancelTrade]);

  const acceptTradeRequest = useCallback(() => {
    const req = pendingTradeRequest;
    if (!req) return;
    wsAcceptTrade(req.tradeId);
    setPendingTradeRequest(null);
  }, [wsAcceptTrade, pendingTradeRequest]);

  const declineTradeRequest = useCallback(() => {
    const req = pendingTradeRequest;
    if (req) {
      wsDeclineTrade(req.tradeId);
    }
    setPendingTradeRequest(null);
  }, [wsDeclineTrade, pendingTradeRequest]);

  const requestRealtimeTrade = useCallback((targetPlayerId: string) => {
    wsRequestTrade(targetPlayerId);
    setPendingOutgoingRequest(true);
  }, [wsRequestTrade]);

  const clearGameUpdate = useCallback(() => setGameUpdateAvailable(false), []);
  const clearPlayerDataUpdate = useCallback(() => setPlayerDataUpdateAvailable(false), []);

  useEffect(() => {
    const handleGameDataUpdate = () => {
      Promise.all([reloadItemsData(), reloadMonstersData()]).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/raids/current-boss"] });
        queryClient.invalidateQueries({ queryKey: ["/api/raids/active"] });
        queryClient.invalidateQueries({ queryKey: ["/api/raids/shop"] });
        queryClient.invalidateQueries({ queryKey: ["/api/raids/bosses"] });
        queryClient.invalidateQueries({ queryKey: ["/api/game/items"] });
        queryClient.invalidateQueries({ queryKey: ["/api/game/monsters"] });
        queryClient.invalidateQueries({ queryKey: ["/api/game/regions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/game/recipes"] });
        setGameUpdateAvailable(true);
      }).catch(() => setGameUpdateAvailable(true));
    };
    const handlePlayerDataUpdate = () => setPlayerDataUpdateAvailable(true);

    window.addEventListener('trade:gameDataUpdate', handleGameDataUpdate);
    window.addEventListener('trade:playerDataUpdate', handlePlayerDataUpdate);
    return () => {
      window.removeEventListener('trade:gameDataUpdate', handleGameDataUpdate);
      window.removeEventListener('trade:playerDataUpdate', handlePlayerDataUpdate);
    };
  }, []);

  return (
    <TradeContext.Provider value={{
      offers, isLoading, fetchOffers, createOffer, respondToOffer, confirmOffer, cancelOffer,
      gameUpdateAvailable, clearGameUpdate, playerDataUpdateAvailable, clearPlayerDataUpdate,
      activeTrade,
      updateMyItems,
      updateMyGold,
      confirmTrade: confirmTradeWs,
      unconfirmTrade: unconfirmTradeWs,
      cancelTrade: cancelTradeWs,
      pendingTradeRequest,
      pendingRequest: pendingTradeRequest,
      acceptTradeRequest,
      declineTradeRequest,
      requestRealtimeTrade,
      sendTradeRequest: requestRealtimeTrade,
      wsConnected,
      isConnected: wsConnected,
      pendingOutgoingRequest,
    }}>
      {children}
    </TradeContext.Provider>
  );
}

export function useTrade() {
  const context = useContext(TradeContext);
  if (!context) throw new Error("useTrade must be used within TradeProvider");
  return context;
}
