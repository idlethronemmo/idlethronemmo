import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGame } from "@/context/GameContext";
import { usePartyWebSocket } from "@/hooks/usePartyWebSocket";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UsersThree, Check, X } from "@phosphor-icons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DungeonPartyInviteData {
  id: string;
  partyId: string;
  partyType: string;
  dungeonId: string | null;
  inviter: { id: string; username: string; avatar: string | null };
  expiresAt: string;
  createdAt: string;
}

export function DungeonPartyInvitePopup() {
  const { player, activeTask, isInCombat, stopTask, stopCombat } = useGame();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [wsInvites, setWsInvites] = useState<DungeonPartyInviteData[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<DungeonPartyInviteData | null>(null);

  const { data: polledInvites } = useQuery<{ invites: DungeonPartyInviteData[] }>({
    queryKey: ["/api/v2/dungeon-party/invites"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/v2/dungeon-party/invites");
        return res.json();
      } catch { return { invites: [] }; }
    },
    enabled: !!player,
    refetchInterval: 15000,
  });

  const handleWsEvent = useCallback((event: any) => {
    if (event.type === 'party_invite_received') {
      const p = event.payload;
      const realId = p.invite?.id || p.inviteId || null;
      if (!realId) {
        queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeon-party/invites"] });
        return;
      }
      const newInvite: DungeonPartyInviteData = {
        id: realId,
        partyId: p.partyId || event.partyId,
        partyType: p.partyType || 'dungeon',
        dungeonId: p.dungeonId || null,
        inviter: p.inviter || { id: '', username: p.inviterName || 'Unknown', avatar: null },
        expiresAt: p.invite?.expiresAt || new Date(Date.now() + 5 * 60000).toISOString(),
        createdAt: new Date().toISOString(),
      };
      setWsInvites(prev => {
        if (prev.some(i => i.id === newInvite.id || i.partyId === newInvite.partyId)) return prev;
        return [...prev, newInvite];
      });
    }
    if (event.type === 'party_invite_cancelled') {
      const inviteId = event.payload?.inviteId;
      if (inviteId) {
        setWsInvites(prev => prev.filter(i => i.id !== inviteId));
        setDismissedIds(prev => new Set(Array.from(prev).concat(inviteId)));
        if (pendingInvite?.id === inviteId) {
          setPendingInvite(null);
          setShowConflictDialog(false);
        }
      }
    }
  }, [queryClient, pendingInvite]);

  usePartyWebSocket({
    playerId: player?.id || null,
    partyId: null,
    enabled: !!player,
    onEvent: handleWsEvent,
  });

  const seenIds = new Set<string>();
  const seenPartyIds = new Set<string>();
  const allInvites: DungeonPartyInviteData[] = [];

  for (const inv of wsInvites) {
    if (!dismissedIds.has(inv.id) && !seenIds.has(inv.id) && !seenPartyIds.has(inv.partyId)) {
      allInvites.push(inv);
      seenIds.add(inv.id);
      seenPartyIds.add(inv.partyId);
    }
  }

  for (const inv of (polledInvites?.invites ?? [])) {
    if (!dismissedIds.has(inv.id) && !seenIds.has(inv.id) && !seenPartyIds.has(inv.partyId)) {
      allInvites.push(inv);
      seenIds.add(inv.id);
      seenPartyIds.add(inv.partyId);
    }
  }

  // Filter to only dungeon party invites
  const dungeonInvites = allInvites.filter(i => i.partyType === 'dungeon');

  const executeAccept = useCallback(async (invite: DungeonPartyInviteData) => {
    if (processingIds.has(invite.id)) return;
    setProcessingIds(prev => new Set(Array.from(prev).concat(invite.id)));
    try {
      // If we have active tasks or combat, cancel them first
      if (activeTask) {
        await stopTask();
      }
      if (isInCombat) {
        await stopCombat();
      }

      const res = await apiRequest("POST", `/api/v2/dungeon-party/invite/accept`, { inviteId: invite.id, forceLeave: true });
      const data = await res.json();
      if (data.success) {
        setWsInvites(prev => prev.filter(i => i.id !== invite.id));
        setDismissedIds(prev => new Set(Array.from(prev).concat(invite.id)));
        queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeon-party/my"] });
        queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeon-party/invites"] });
        queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
        navigate(`/dungeon-party?dungeonId=${invite.dungeonId || ''}`);
      } else {
        toast({ title: "Failed", description: data.error || "Could not accept invite", variant: "destructive" });
      }
    } catch (err: any) {
      setWsInvites(prev => prev.filter(i => i.id !== invite.id));
      setDismissedIds(prev => new Set(Array.from(prev).concat(invite.id)));
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeon-party/invites"] });
      toast({ title: "Error", description: err.message || "Failed to accept invite", variant: "destructive" });
    } finally {
      setProcessingIds(prev => { const n = new Set(Array.from(prev)); n.delete(invite.id); return n; });
    }
  }, [navigate, toast, queryClient, processingIds, activeTask, isInCombat, stopTask, stopCombat]);

  const handleAccept = useCallback((invite: DungeonPartyInviteData) => {
    if (activeTask || isInCombat) {
      setPendingInvite(invite);
      setShowConflictDialog(true);
    } else {
      executeAccept(invite);
    }
  }, [activeTask, isInCombat, executeAccept]);

  const handleDecline = useCallback(async (invite: DungeonPartyInviteData) => {
    setWsInvites(prev => prev.filter(i => i.id !== invite.id));
    setDismissedIds(prev => new Set(Array.from(prev).concat(invite.id)));
    try {
      await apiRequest("POST", `/api/v2/dungeon-party/invite/decline`, { inviteId: invite.id });
    } catch {}
    queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeon-party/invites"] });
  }, [queryClient]);

  if (dungeonInvites.length === 0) return null;

  const conflictType = activeTask ? "task" : "combat";

  return (
    <>
      <div className="fixed bottom-28 right-4 z-[10000] flex flex-col gap-2 max-w-xs" data-testid="dungeon-party-invite-popup">
        {dungeonInvites.map(invite => (
          <div
            key={invite.id}
            className="bg-purple-950/95 border border-purple-500/50 rounded-lg p-3 shadow-xl backdrop-blur animate-in slide-in-from-right-5 duration-300"
            data-testid={`dungeon-invite-card-${invite.id}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <UsersThree className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-purple-200">Dungeon Party Invite</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              <span className="text-white font-medium">{invite.inviter?.username || 'Unknown'}</span> invited you to a dungeon party
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleAccept(invite)}
                disabled={processingIds.has(invite.id)}
                className="flex-1 h-7 bg-green-600 hover:bg-green-700 text-xs"
                data-testid={`btn-accept-invite-${invite.id}`}
              >
                <Check className="w-3 h-3 mr-1" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDecline(invite)}
                disabled={processingIds.has(invite.id)}
                className="flex-1 h-7 border-red-700 text-red-400 hover:bg-red-900/30 text-xs"
                data-testid={`btn-decline-invite-${invite.id}`}
              >
                <X className="w-3 h-3 mr-1" />
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Active {conflictType === 'task' ? 'Task' : 'Combat'} in Progress</AlertDialogTitle>
            <AlertDialogDescription>
              You have an active {conflictType}. Joining this party will cancel it. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingInvite(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingInvite) {
                  executeAccept(pendingInvite);
                }
                setShowConflictDialog(false);
                setPendingInvite(null);
              }}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
