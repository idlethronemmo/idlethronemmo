import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { usePartyWebSocket } from "@/hooks/usePartyWebSocket";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  UsersThree, Crown, Sword, Shield, Heart, Lightning,
  UserPlus, MagnifyingGlass, CaretLeft, Play, Check,
  XCircle, Spiral, UserMinus, Stairs, ChatDots, PaperPlaneRight,
} from "@phosphor-icons/react";
import { DungeonEntrySequence } from "@/components/dungeon/DungeonEntrySequence";

interface DungeonPartyMember {
  playerId: string;
  username: string;
  avatar: string | null;
  role: string;
  subClassName?: string;
  subClassColor?: string;
  isReady: number;
  totalLevel: number;
  weaponType?: string | null;
  armorType?: string | null;
}

interface DungeonPartyInvite {
  id: string;
  inviteeId: string;
  inviteeName: string;
  inviteeAvatar: string | null;
  status: string;
  expiresAt: string;
}

interface DungeonPartyState {
  party: {
    id: string;
    leaderId: string;
    status: string;
    partyType: string;
    dungeonId: string | null;
    maxSize: number;
  } | null;
  members: DungeonPartyMember[];
  invites: DungeonPartyInvite[];
}

interface DungeonData {
  id: string;
  name: string;
  recommendedLevel: number;
  floorCount: number | null;
  isEndless: number;
}

const ROLE_ICONS: Record<string, any> = {
  tank: Shield,
  dps: Sword,
  healer: Heart,
  hybrid: Lightning,
};

const ROLE_COLORS: Record<string, string> = {
  tank: "text-blue-400",
  dps: "text-red-400",
  healer: "text-green-400",
  hybrid: "text-yellow-400",
};

export default function DungeonPartyCreatePage() {
  const { player, language } = useGame();
  const { t } = useLanguage();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = new URLSearchParams(search);
  const dungeonId = params.get("dungeonId") || "";

  const [searchInput, setSearchInput] = useState("");
  const [searchDebounce, setSearchDebounce] = useState("");
  const creatingRef = useRef(false);
  const hasLeftRef = useRef(false);
  const dungeonStartedRef = useRef(false);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [showEntrySequence, setShowEntrySequence] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);

  const { data: dungeonsData } = useQuery({
    queryKey: ["/api/v2/dungeons", `lang=${language}`],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/v2/dungeons?lang=${language}`);
        return res.json();
      } catch { return { dungeons: [] }; }
    },
    enabled: !!player,
  });

  const { data: partyState, refetch: refetchParty } = useQuery<DungeonPartyState>({
    queryKey: ["/api/v2/dungeon-party/my"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/v2/dungeon-party/my");
        const data = await res.json();
        
        // If we expect to be in a party but server says we aren't, redirect
        if (player && !data.party && !creatingRef.current && !hasLeftRef.current) {
          toast({ title: "You are no longer in the party" });
          navigate("/dungeons");
        }
        
        return data;
      } catch { return { party: null, members: [], invites: [] }; }
    },
    enabled: !!player,
    refetchInterval: 5000,
  });

  const { data: activeSessionData } = useQuery({
    queryKey: ["/api/v2/dungeon-party/session/active"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/v2/dungeon-party/session/active");
        return res.json();
      } catch { return null; }
    },
    enabled: !!player && !!partyState?.party,
    refetchInterval: 3000,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeon-party/session/active"] });
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [queryClient]);

  useEffect(() => {
    if (activeSessionData?.sessionId && !showEntrySequence) {
      dungeonStartedRef.current = true;
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeon-party/session/active"] });
      setShowEntrySequence(true);
      setEntryLoading(false);
      setEntryError(null);
    }
  }, [activeSessionData, showEntrySequence, queryClient]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeon-party/session/active"] });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [queryClient]);

  const party = partyState?.party || null;
  const members: DungeonPartyMember[] = partyState?.members ?? [];
  const invites: DungeonPartyInvite[] = partyState?.invites ?? [];
  const isLeader = !!(player && party && party.leaderId === player.id);
  const allReady = members.length >= 2 && members.every(m => m.isReady === 1);
  const currentMember = members.find(m => m.playerId === player?.id);

  const currentDungeonId = party?.dungeonId || dungeonId;
  const dungeonInfo = (dungeonsData?.dungeons ?? []).find((d: DungeonData) => d.id === currentDungeonId);

  const { data: lobbyChatData, refetch: refetchChat } = useQuery<{ messages: Array<{ id: string; playerId: string; username: string; content: string; timestamp: number }> }>({
    queryKey: ["/api/v2/dungeon-party/lobby-chat", party?.id],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/v2/dungeon-party/lobby-chat/${party!.id}`);
        return res.json();
      } catch { return { messages: [] }; }
    },
    enabled: !!player && !!party,
    refetchInterval: 3000,
  });

  const lobbyMessages = lobbyChatData?.messages ?? [];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lobbyMessages.length]);

  const handleSendChat = async () => {
    if (!party || !chatInput.trim()) return;
    try {
      const res = await apiRequest("POST", "/api/v2/dungeon-party/lobby-chat", { partyId: party.id, content: chatInput.trim() });
      if (res.status === 403) {
        queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeon-party/my"] });
        return;
      }
      setChatInput("");
      refetchChat();
    } catch {
      toast({ title: "Failed to send message", variant: "destructive" });
    }
  };

  const handleWsEvent = useCallback((event: any) => {
    const type = event.type;

    if (type === 'dungeon_party:created' || type === 'party_member_joined' || type === 'party_member_left' || type === 'party_member_kicked') {
      refetchParty();
    }
    if (type === 'party_invite_created' || type === 'party_invite_cancelled') {
      refetchParty();
    }
    if (type === 'party_ready_updated' || type === 'party_role_changed') {
      refetchParty();
    }
    if (type === 'party_updated' && event.payload?.action === 'start_failed') {
      toast({ title: "Start Failed", description: event.payload.error, variant: "destructive" });
    }
    if (type === 'party_started' && event.payload?.sessionId) {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeon-party/session/active"] });
      if (!showEntrySequence) {
        setShowEntrySequence(true);
        setEntryLoading(false);
        setEntryError(null);
      } else {
        setEntryLoading(false);
      }
    }
    if (type === 'party_disbanded') {
      toast({ title: "Party disbanded" });
      navigate("/dungeons");
    }
    if (type === 'party_member_kicked' && event.payload?.playerId === player?.id) {
      toast({ title: "You were kicked from the party" });
      navigate("/dungeons");
    }
    if (type === 'lobby_chat_message') {
      refetchChat();
    }
  }, [refetchParty, refetchChat, navigate, toast, player?.id, queryClient]);

  usePartyWebSocket({
    playerId: player?.id || null,
    partyId: party?.id || null,
    enabled: !!player,
    onEvent: handleWsEvent,
  });

  useEffect(() => {
    if (!player || party || creatingRef.current) return;
    if (!dungeonId) return;
    if (hasLeftRef.current) return;

    creatingRef.current = true;
    apiRequest("POST", "/api/v2/dungeon-party/create", { dungeonId })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          refetchParty();
        } else {
          toast({ title: "Failed to create party", description: data.error, variant: "destructive" });
          navigate("/dungeons");
        }
      })
      .catch(err => {
        toast({ title: "Error", description: "Failed to create dungeon party", variant: "destructive" });
        navigate("/dungeons");
      })
      .finally(() => {
        creatingRef.current = false;
      });
  }, [player?.id, dungeonId]);

  useEffect(() => {
    if (!party?.id) return;
    const currentPartyId = party.id;
    let mounted = true;
    const mountTime = Date.now();

    const leaveOnExit = () => {
      if (hasLeftRef.current || dungeonStartedRef.current || creatingRef.current) return;
      hasLeftRef.current = true;
      const payload = JSON.stringify({ partyId: currentPartyId });
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/v2/dungeon-party/leave-beacon", blob);
      } else {
        fetch("/api/v2/dungeon-party/leave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener("pagehide", leaveOnExit);
    window.addEventListener("beforeunload", leaveOnExit);

    return () => {
      mounted = false;
      window.removeEventListener("pagehide", leaveOnExit);
      window.removeEventListener("beforeunload", leaveOnExit);
      if (Date.now() - mountTime < 500) return;
      if (!hasLeftRef.current && !dungeonStartedRef.current && !creatingRef.current) {
        hasLeftRef.current = true;
        apiRequest("POST", "/api/v2/dungeon-party/leave", { partyId: currentPartyId }).catch(() => {});
      }
    };
  }, [party?.id]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: searchResults } = useQuery({
    queryKey: ["/api/players/search", searchDebounce],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/players/search?username=${encodeURIComponent(searchDebounce)}`);
        return res.json();
      } catch { return { players: [] }; }
    },
    enabled: !!searchDebounce && searchDebounce.length >= 2 && !!party,
  });

  const filteredResults = (searchResults?.players ?? []).filter(
    (p: any) => !(members ?? []).some(m => m.playerId === p.playerId) && p.playerId !== player?.id
  );

  const handleInvite = async (inviteeId: string) => {
    if (!party) return;
    try {
      const res = await apiRequest("POST", "/api/v2/dungeon-party/invite", { partyId: party.id, inviteeId });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Invite sent" });
        refetchParty();
      } else {
        toast({ title: "Failed to invite", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to invite", variant: "destructive" });
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!party) return;
    try {
      await apiRequest("POST", "/api/v2/dungeon-party/invite/cancel", { inviteId });
      refetchParty();
    } catch {
      toast({ title: "Failed to cancel invite", variant: "destructive" });
    }
  };

  const handleToggleReady = async () => {
    if (!party || !currentMember) return;
    try {
      await apiRequest("POST", "/api/v2/dungeon-party/ready", { partyId: party.id, isReady: currentMember.isReady !== 1 });
      refetchParty();
    } catch {
      toast({ title: "Failed to update ready status", variant: "destructive" });
    }
  };

  const handleStart = async () => {
    if (!party || !dungeonId) return;
    setShowEntrySequence(true);
    setEntryLoading(true);
    setEntryError(null);
    try {
      const res = await apiRequest("POST", "/api/v2/dungeon-party/start", { partyId: party.id, dungeonId: party.dungeonId || dungeonId });
      const data = await res.json();
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeon-party/session/active"] });
        setEntryLoading(false);
      } else {
        setEntryError(data.error || "Failed to start dungeon");
        setEntryLoading(false);
      }
    } catch (err: any) {
      setEntryError("Could not start dungeon");
      setEntryLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!party) return;
    hasLeftRef.current = true;
    try {
      await apiRequest("POST", "/api/v2/dungeon-party/leave", { partyId: party.id });
      navigate("/dungeons");
    } catch {
      hasLeftRef.current = false;
      toast({ title: "Failed to leave party", variant: "destructive" });
    }
  };

  const handleKick = async (targetPlayerId: string) => {
    if (!party) return;
    try {
      await apiRequest("POST", "/api/v2/dungeon-party/kick", { partyId: party.id, targetPlayerId });
      refetchParty();
    } catch {
      toast({ title: "Failed to kick member", variant: "destructive" });
    }
  };

  const handleRoleChange = async (targetPlayerId: string, role: string) => {
    if (!party) return;
    try {
      const res = await apiRequest("POST", "/api/v2/dungeon-party/role", { partyId: party.id, targetPlayerId, role });
      if (res.status === 403) {
        queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeon-party/my"] });
        return;
      }
      refetchParty();
    } catch {
      toast({ title: "Failed to change role", variant: "destructive" });
    }
  };

  const handleEntryReady = useCallback(() => {
    sessionStorage.setItem("dungeonEntryPlayed", "true");
    navigate("/party-dungeon-run");
  }, [navigate]);

  const handleEntryCancel = useCallback(() => {
    setShowEntrySequence(false);
    setEntryError(null);
  }, []);

  if (!party) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px]">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spiral className="w-4 h-4 animate-spin" />
          Creating dungeon party...
        </div>
      </div>
    );
  }

  if (showEntrySequence) {
    return (
      <DungeonEntrySequence
        dungeon={{ name: dungeonInfo?.name || "Dungeon", icon: undefined }}
        partyMembers={members.map(m => ({
          id: m.playerId,
          name: m.username,
          role: m.role || "dps",
          avatar: m.avatar,
        }))}
        isLoading={entryLoading}
        loadError={entryError}
        onReadyToEnter={handleEntryReady}
        onCancel={handleEntryCancel}
      />
    );
  }

  return (
    <div className="space-y-4 p-2 md:p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/dungeons")}
          data-testid="btn-back-dungeons"
        >
          <CaretLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <UsersThree className="w-6 h-6 text-purple-400" />
          Dungeon Party
        </h1>
        <Badge className="bg-purple-900/50 text-purple-300 ml-auto">
          {members.length}/{party.maxSize || 5}
        </Badge>
      </div>

      {dungeonInfo && (
        <Card className="bg-card/80 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Stairs className="w-5 h-5 text-purple-400" />
              {dungeonInfo.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Recommended Level:</span>
              <span className="font-semibold text-yellow-400">Lv.{dungeonInfo.recommendedLevel}</span>
            </div>
            {dungeonInfo.isEndless === 1 ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Type:</span>
                <span className="font-semibold text-blue-400">Endless</span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Floors:</span>
                <span className="font-semibold text-blue-400">{dungeonInfo.floorCount || 'Unknown'}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/80 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Members</span>
            {currentMember && (
              <Button
                size="sm"
                variant={currentMember?.isReady === 1 ? "default" : "outline"}
                onClick={handleToggleReady}
                className={cn(
                  currentMember?.isReady === 1
                    ? "bg-green-600 hover:bg-green-700"
                    : "border-green-600 text-green-400 hover:bg-green-900/30"
                )}
                data-testid="btn-toggle-ready"
              >
                <Check className="w-4 h-4 mr-1" />
                {currentMember?.isReady === 1 ? "Ready" : "Set Ready"}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(members ?? []).map((member) => {
            const RoleIcon = ROLE_ICONS[member.role] || Sword;
            const roleColor = ROLE_COLORS[member.role] || "text-gray-400";
            return (
              <div
                key={member.playerId}
                className="flex items-center gap-3 p-2 rounded-lg bg-gray-800/50 border border-gray-700/50"
                data-testid={`member-${member.playerId}`}
              >
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold">
                  {(member.username || '?')[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {party.leaderId === member.playerId && (
                      <Crown className="w-3.5 h-3.5 text-yellow-400" weight="fill" />
                    )}
                    <span className="text-sm font-medium truncate">{member.username}</span>
                    <span className="text-xs text-muted-foreground">Lv.{member.totalLevel}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={cn("flex items-center gap-0.5 text-xs", roleColor)}>
                      <RoleIcon className="w-3 h-3" weight="fill" />
                      {member.subClassName || member.role.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {member.isReady === 1 ? (
                    <Badge className="bg-green-900/50 text-green-300 text-xs">Ready</Badge>
                  ) : (
                    <Badge className="bg-gray-800 text-gray-400 text-xs">Not Ready</Badge>
                  )}
                  {isLeader && member.playerId !== player?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleKick(member.playerId)}
                      className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                      data-testid={`btn-kick-${member.playerId}`}
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {members.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">No members yet</div>
          )}
        </CardContent>
      </Card>

      {isLeader && (
        <div className="flex gap-2">
          <Button
            onClick={handleStart}
            disabled={!allReady || members.length < 2}
            className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
            data-testid="btn-start-dungeon"
          >
            <Play className="w-4 h-4 mr-2" weight="fill" />
            Start Dungeon
          </Button>
          <Button
            variant="outline"
            onClick={handleLeave}
            className="border-red-700 text-red-400 hover:bg-red-900/30"
            data-testid="btn-disband"
          >
            Disband
          </Button>
        </div>
      )}

      {!isLeader && (
        <Button
          variant="outline"
          onClick={handleLeave}
          className="w-full border-red-700 text-red-400 hover:bg-red-900/30"
          data-testid="btn-leave-party"
        >
          Leave Party
        </Button>
      )}

      {isLeader && members.length < (party.maxSize || 5) && (
        <Card className="bg-card/80 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-purple-400" />
              Invite Players
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search by username..."
                className="pl-9 bg-gray-800/50 border-gray-700"
                data-testid="input-search-player"
              />
            </div>

            {filteredResults.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {filteredResults.map((p: any) => (
                  <div key={p.playerId} className="flex items-center justify-between p-2 rounded bg-gray-800/30 border border-gray-700/30">
                    <span className="text-sm">{p.username}</span>
                    <Button
                      size="sm"
                      onClick={() => handleInvite(p.playerId)}
                      className="h-7 bg-purple-600 hover:bg-purple-700"
                      data-testid={`btn-invite-${p.playerId}`}
                    >
                      <UserPlus className="w-3 h-3 mr-1" />
                      Invite
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {(invites ?? []).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Pending Invites</p>
                <div className="space-y-1">
                  {(invites ?? []).map(inv => (
                    <div key={inv.id} className="flex items-center justify-between p-2 rounded bg-gray-800/30 border border-yellow-900/30">
                      <span className="text-sm text-yellow-300">{inv.inviteeName}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelInvite(inv.id)}
                        className="h-6 text-xs text-red-400"
                        data-testid={`btn-cancel-invite-${inv.id}`}
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/80 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ChatDots className="w-4 h-4 text-purple-400" />
            Lobby Chat
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="h-36 overflow-y-auto rounded bg-gray-900/50 border border-gray-700/50 p-2 space-y-1" data-testid="lobby-chat-messages">
            {lobbyMessages.length === 0 && (
              <div className="text-center text-muted-foreground text-xs py-4">No messages yet. Say hello!</div>
            )}
            {lobbyMessages.map((msg) => (
              <div key={msg.id} className="text-xs" data-testid={`chat-msg-${msg.id}`}>
                <span className={cn("font-semibold", msg.playerId === player?.id ? "text-purple-300" : "text-blue-300")}>
                  {msg.username}:
                </span>{" "}
                <span className="text-gray-200">{msg.content}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2">
            <Input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSendChat(); }}
              placeholder="Type a message..."
              className="bg-gray-800/50 border-gray-700 text-sm"
              maxLength={200}
              data-testid="input-lobby-chat"
            />
            <Button
              size="sm"
              onClick={handleSendChat}
              disabled={!chatInput.trim()}
              className="bg-purple-600 hover:bg-purple-700 px-3"
              data-testid="btn-send-lobby-chat"
            >
              <PaperPlaneRight className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
