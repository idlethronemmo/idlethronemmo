import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Guild, GuildMember, GuildUpgrade, GuildMessage, GuildJoinRequest, GUILD_UPGRADES, getGuildLevelXp, GuildBonuses } from "@shared/schema";
import { translateFromStorage } from "@/lib/i18n";
import { useFirebaseAuth } from "./FirebaseAuthContext";

interface GuildWithDetails extends Guild {
  memberCount: number;
  members?: (GuildMember & { player: any })[];
  upgrades?: GuildUpgrade[];
}

interface PlayerGuildData {
  guild: GuildWithDetails | null;
  membership: GuildMember | null;
  upgrades: GuildUpgrade[];
  bonuses?: GuildBonuses | null;
}

interface GuildInvite {
  id: string;
  guildId: string;
  guildName?: string;
  guildEmblem?: string;
  guildColor?: string;
  guildLevel?: number;
  inviterName?: string;
  targetPlayerId?: string;
  targetPlayerName?: string;
  targetPlayerLevel?: number;
  createdAt: Date;
}

interface GuildContextType {
  myGuild: GuildWithDetails | null;
  myMembership: GuildMember | null;
  myUpgrades: GuildUpgrade[];
  myBonuses: GuildBonuses | null;
  isInGuild: boolean;
  isLoading: boolean;
  
  allGuilds: GuildWithDetails[];
  isLoadingGuilds: boolean;
  refetchGuilds: () => void;
  
  guildDetails: GuildWithDetails | null;
  guildMembers: (GuildMember & { player: any })[];
  guildUpgrades: GuildUpgrade[];
  isLoadingDetails: boolean;
  fetchGuildDetails: (guildId: string) => void;
  
  messages: GuildMessage[];
  isLoadingMessages: boolean;
  refetchMessages: () => void;
  hasUnreadMessages: boolean;
  markMessagesRead: () => void;
  
  joinRequests: GuildJoinRequest[];
  isLoadingRequests: boolean;
  refetchRequests: () => void;
  
  pendingInvites: GuildInvite[];
  isLoadingInvites: boolean;
  refetchInvites: () => void;
  sentInvites: GuildInvite[];
  isLoadingSentInvites: boolean;
  refetchSentInvites: () => void;
  
  createGuild: (data: CreateGuildData) => Promise<Guild>;
  isCreatingGuild: boolean;
  
  joinGuild: (guildId: string, message?: string) => Promise<{ joined?: boolean; requestSent?: boolean }>;
  leaveGuild: () => Promise<void>;
  kickMember: (playerId: string) => Promise<void>;
  updateMemberRole: (playerId: string, role: 'officer' | 'member') => Promise<void>;
  transferLeadership: (playerId: string) => Promise<void>;
  disbandGuild: () => Promise<void>;
  
  respondToRequest: (requestId: string, action: 'accept' | 'reject') => Promise<void>;
  
  sendMessage: (content: string, isAnnouncement?: boolean) => Promise<GuildMessage>;
  
  purchaseUpgrade: (upgradeType: string) => Promise<void>;
  
  updateGuildSettings: (settings: { description?: string; entryType?: string; minTotalLevel?: number }) => Promise<void>;
  
  sendInvite: (targetPlayerId: string) => Promise<void>;
  respondToInvite: (inviteId: string, accept: boolean) => Promise<void>;
  cancelInvite: (inviteId: string) => Promise<void>;
  
  refetchMyGuild: () => void;
}

interface CreateGuildData {
  name: string;
  description?: string;
  emblem?: string;
  emblemColor?: string;
  entryType?: 'public' | 'request' | 'invite';
  minTotalLevel?: number;
}

const GuildContext = createContext<GuildContextType | undefined>(undefined);

const LAST_READ_KEY = 'guild_last_read_time';

export function GuildProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [lastReadTime, setLastReadTime] = useState<number>(() => {
    const stored = localStorage.getItem(LAST_READ_KEY);
    return stored ? parseInt(stored, 10) : 0;
  });
  const isOnGuildPage = location === '/guild';
  const { user: firebaseUser } = useFirebaseAuth();

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (firebaseUser) {
      try {
        const idToken = await firebaseUser.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      } catch (e) {
        console.error('Failed to get Firebase token:', e);
      }
    }
    return headers;
  }, [firebaseUser]);

  const { data: myGuildData, isLoading, refetch: refetchMyGuild } = useQuery<PlayerGuildData>({
    queryKey: ['/api/guilds/my'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/guilds/my', { headers, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch my guild');
      return res.json();
    },
    refetchInterval: isOnGuildPage ? 60000 : false,
  });

  const { data: allGuildsData, isLoading: isLoadingGuilds, refetch: refetchGuilds } = useQuery<GuildWithDetails[]>({
    queryKey: ['/api/guilds'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/guilds', { headers, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch guilds');
      return res.json();
    },
  });

  const { data: guildDetailsData, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['/api/guilds', selectedGuildId],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${selectedGuildId}`, { headers, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch guild details');
      return res.json();
    },
    enabled: !!selectedGuildId,
  });

  const { data: messagesData, isLoading: isLoadingMessages, refetch: refetchMessages } = useQuery<GuildMessage[]>({
    queryKey: ['/api/guilds', myGuildData?.guild?.id, 'messages'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${myGuildData?.guild?.id}/messages?limit=30`, { headers, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    enabled: !!myGuildData?.guild?.id,
    refetchInterval: isOnGuildPage ? 30000 : false,
  });

  const { data: requestsData, isLoading: isLoadingRequests, refetch: refetchRequests } = useQuery<GuildJoinRequest[]>({
    queryKey: ['/api/guilds', myGuildData?.guild?.id, 'requests'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${myGuildData?.guild?.id}/requests`, { headers, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch requests');
      return res.json();
    },
    enabled: !!myGuildData?.guild?.id && (myGuildData?.membership?.role === 'leader' || myGuildData?.membership?.role === 'officer'),
    refetchInterval: isOnGuildPage ? 30000 : false,
  });

  const { data: pendingInvitesData, isLoading: isLoadingInvites, refetch: refetchInvites } = useQuery<GuildInvite[]>({
    queryKey: ['/api/guilds/invites/my'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/guilds/invites/my', { headers, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch invites');
      return res.json();
    },
    refetchInterval: isOnGuildPage ? 30000 : 120000,
  });

  const { data: sentInvitesData, isLoading: isLoadingSentInvites, refetch: refetchSentInvites } = useQuery<GuildInvite[]>({
    queryKey: ['/api/guilds', myGuildData?.guild?.id, 'invites'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${myGuildData?.guild?.id}/invites`, { headers, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch sent invites');
      return res.json();
    },
    enabled: !!myGuildData?.guild?.id && (myGuildData?.membership?.role === 'leader' || myGuildData?.membership?.role === 'officer'),
    refetchInterval: isOnGuildPage ? 30000 : false,
  });

  // Auto-mark messages as read when on guild page
  useEffect(() => {
    if (isOnGuildPage && messagesData && messagesData.length > 0) {
      const latestMessageTime = Math.max(
        ...messagesData.map((m) => m.createdAt ? new Date(m.createdAt).getTime() : 0)
      );
      if (latestMessageTime > lastReadTime) {
        const now = Date.now();
        setLastReadTime(now);
        localStorage.setItem(LAST_READ_KEY, now.toString());
      }
    }
  }, [isOnGuildPage, messagesData, lastReadTime]);

  const createGuildMutation = useMutation({
    mutationFn: async (data: CreateGuildData) => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/guilds', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildCreateFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds'] });
      queryClient.invalidateQueries({ queryKey: ['/api/guilds/my'] });
      queryClient.invalidateQueries({ queryKey: ['/api/players/auth'] });
    },
  });

  const joinGuildMutation = useMutation({
    mutationFn: async ({ guildId, message }: { guildId: string; message?: string }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${guildId}/join`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildJoinFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds'] });
      queryClient.invalidateQueries({ queryKey: ['/api/guilds/my'] });
    },
  });

  const leaveGuildMutation = useMutation({
    mutationFn: async () => {
      const guildId = myGuildData?.guild?.id;
      if (!guildId) throw new Error(translateFromStorage('notInGuild'));
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${guildId}/leave`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildLeaveFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds'] });
      queryClient.invalidateQueries({ queryKey: ['/api/guilds/my'] });
    },
  });

  const kickMemberMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const guildId = myGuildData?.guild?.id;
      if (!guildId) throw new Error(translateFromStorage('notInGuild'));
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${guildId}/kick/${playerId}`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildKickFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds', myGuildData?.guild?.id] });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ playerId, role }: { playerId: string; role: string }) => {
      const guildId = myGuildData?.guild?.id;
      if (!guildId) throw new Error(translateFromStorage('notInGuild'));
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${guildId}/members/${playerId}/role`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildRoleUpdateFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds', myGuildData?.guild?.id] });
    },
  });

  const transferMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const guildId = myGuildData?.guild?.id;
      if (!guildId) throw new Error(translateFromStorage('notInGuild'));
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${guildId}/transfer/${playerId}`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildTransferFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds'] });
      queryClient.invalidateQueries({ queryKey: ['/api/guilds/my'] });
    },
  });

  const disbandMutation = useMutation({
    mutationFn: async () => {
      const guildId = myGuildData?.guild?.id;
      if (!guildId) throw new Error(translateFromStorage('notInGuild'));
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${guildId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildDisbandFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds'] });
      queryClient.invalidateQueries({ queryKey: ['/api/guilds/my'] });
    },
  });

  const respondMutation = useMutation({
    mutationFn: async ({ requestId, action }: { requestId: string; action: 'accept' | 'reject' }) => {
      const guildId = myGuildData?.guild?.id;
      if (!guildId) throw new Error(translateFromStorage('notInGuild'));
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${guildId}/requests/${requestId}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildRequestRespondFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds', myGuildData?.guild?.id, 'requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/guilds', myGuildData?.guild?.id] });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, isAnnouncement }: { content: string; isAnnouncement?: boolean }) => {
      const guildId = myGuildData?.guild?.id;
      if (!guildId) throw new Error(translateFromStorage('notInGuild'));
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${guildId}/messages`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ content, messageType: isAnnouncement ? 'announcement' : 'chat' }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildMessageSendFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds', myGuildData?.guild?.id, 'messages'] });
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async (upgradeType: string) => {
      const guildId = myGuildData?.guild?.id;
      if (!guildId) throw new Error(translateFromStorage('notInGuild'));
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${guildId}/upgrades`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ upgradeType }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildUpgradeFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds/my'] });
      queryClient.invalidateQueries({ queryKey: ['/api/players/auth'] });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: { description?: string; entryType?: string; minTotalLevel?: number }) => {
      const guildId = myGuildData?.guild?.id;
      if (!guildId) throw new Error(translateFromStorage('notInGuild'));
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${guildId}`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildUpdateFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds/my'] });
      queryClient.invalidateQueries({ queryKey: ['/api/guilds'] });
    },
  });

  const sendInviteMutation = useMutation({
    mutationFn: async (targetPlayerId: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/guilds/invites', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ targetPlayerId }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildInviteSendFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds', myGuildData?.guild?.id, 'invites'] });
    },
  });

  const respondToInviteMutation = useMutation({
    mutationFn: async ({ inviteId, accept }: { inviteId: string; accept: boolean }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/invites/${inviteId}/respond`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ accept }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildInviteRespondFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds/invites/my'] });
      queryClient.invalidateQueries({ queryKey: ['/api/guilds/my'] });
      queryClient.invalidateQueries({ queryKey: ['/api/guilds'] });
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const guildId = myGuildData?.guild?.id;
      if (!guildId) throw new Error(translateFromStorage('notInGuild'));
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/guilds/${guildId}/invites/${inviteId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || translateFromStorage('guildInviteCancelFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/guilds', myGuildData?.guild?.id, 'invites'] });
    },
  });

  const value: GuildContextType = {
    myGuild: myGuildData?.guild || null,
    myMembership: myGuildData?.membership || null,
    myUpgrades: myGuildData?.upgrades || [],
    myBonuses: myGuildData?.bonuses || null,
    isInGuild: !!myGuildData?.guild,
    isLoading,
    
    allGuilds: allGuildsData || [],
    isLoadingGuilds,
    refetchGuilds,
    
    guildDetails: guildDetailsData as GuildWithDetails || null,
    guildMembers: (guildDetailsData as any)?.members || [],
    guildUpgrades: (guildDetailsData as any)?.upgrades || [],
    isLoadingDetails,
    fetchGuildDetails: setSelectedGuildId,
    
    messages: messagesData || [],
    isLoadingMessages,
    refetchMessages,
    hasUnreadMessages: (() => {
      if (!messagesData || messagesData.length === 0) return false;
      const latestMessageTime = Math.max(
        ...messagesData.map((m) => m.createdAt ? new Date(m.createdAt).getTime() : 0)
      );
      return latestMessageTime > lastReadTime;
    })(),
    markMessagesRead: () => {
      const now = Date.now();
      setLastReadTime(now);
      localStorage.setItem(LAST_READ_KEY, now.toString());
    },
    
    joinRequests: requestsData || [],
    isLoadingRequests,
    refetchRequests,
    
    pendingInvites: pendingInvitesData || [],
    isLoadingInvites,
    refetchInvites,
    sentInvites: sentInvitesData || [],
    isLoadingSentInvites,
    refetchSentInvites,
    
    createGuild: createGuildMutation.mutateAsync,
    isCreatingGuild: createGuildMutation.isPending,
    
    joinGuild: (guildId, message) => joinGuildMutation.mutateAsync({ guildId, message }),
    leaveGuild: leaveGuildMutation.mutateAsync,
    kickMember: kickMemberMutation.mutateAsync,
    updateMemberRole: (playerId, role) => updateRoleMutation.mutateAsync({ playerId, role }),
    transferLeadership: transferMutation.mutateAsync,
    disbandGuild: disbandMutation.mutateAsync,
    
    respondToRequest: (requestId, action) => respondMutation.mutateAsync({ requestId, action }),
    
    sendMessage: (content, isAnnouncement) => sendMessageMutation.mutateAsync({ content, isAnnouncement }),
    
    purchaseUpgrade: upgradeMutation.mutateAsync,
    
    updateGuildSettings: updateSettingsMutation.mutateAsync,
    
    sendInvite: sendInviteMutation.mutateAsync,
    respondToInvite: (inviteId, accept) => respondToInviteMutation.mutateAsync({ inviteId, accept }),
    cancelInvite: cancelInviteMutation.mutateAsync,
    
    refetchMyGuild,
  };

  return (
    <GuildContext.Provider value={value}>
      {children}
    </GuildContext.Provider>
  );
}

export function useGuild() {
  const context = useContext(GuildContext);
  if (context === undefined) {
    throw new Error("useGuild must be used within a GuildProvider");
  }
  return context;
}
