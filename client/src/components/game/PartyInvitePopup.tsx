import { useGame } from "@/context/GameContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { UsersThree, Check, X, Crown, Sword, Shield } from "@phosphor-icons/react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface PartyInvite {
  id: string;
  partyId: string;
  inviterId: string;
  inviteeId: string;
  status: string;
  createdAt: string;
  party: {
    id: string;
    name: string | null;
    partyType: string;
  };
  inviter: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

export default function PartyInvitePopup() {
  const { addNotification, player } = useGame();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const previousInviteIdsRef = useRef<Set<string>>(new Set());
  const [confirmInvite, setConfirmInvite] = useState<PartyInvite | null>(null);

  const { data: currentParty } = useQuery<any>({
    queryKey: ["/api/parties/current"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/parties/current");
        if (!res.ok) return null;
        const data = await res.json();
        return data.party || null;
      } catch {
        return null;
      }
    },
    enabled: !!player,
    refetchInterval: 60000,
    staleTime: 15000,
  });

  const { data: pendingInvites = [] } = useQuery<PartyInvite[]>({
    queryKey: ["/api/party-invites"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/party-invites");
        const data = await res.json();
        return data.invites || [];
      } catch {
        return [];
      }
    },
    enabled: !!player,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const acceptMutation = useMutation({
    mutationFn: async ({ inviteId, forceLeave }: { inviteId: string; forceLeave?: boolean }) => {
      const res = await apiRequest("POST", `/api/party-invites/${inviteId}/accept`, forceLeave ? { forceLeave: true } : undefined);
      const data = await res.json();
      if (!data.success && data.errorCode === 'ALREADY_IN_PARTY') {
        throw Object.assign(new Error(data.error), { errorCode: data.errorCode });
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/party-invites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      await apiRequest("POST", `/api/party-invites/${inviteId}/decline`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/party-invites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
    },
  });

  useEffect(() => {
    const currentIds = new Set(pendingInvites.map((i) => i.id));
    const prevIds = previousInviteIdsRef.current;

    pendingInvites.forEach((invite) => {
      if (!prevIds.has(invite.id)) {
        addNotification(
          "party_invite",
          `${invite.inviter?.username || 'Someone'} invited you to ${invite.party?.name || "a party"}`,
          {}
        );
      }
    });

    previousInviteIdsRef.current = currentIds;
  }, [pendingInvites, addNotification]);

  if (pendingInvites.length === 0) {
    return null;
  }

  const visibleInvites = pendingInvites.filter(
    (invite) => !dismissed.has(invite.id) && invite.party?.partyType !== 'dungeon'
  );

  if (visibleInvites.length === 0) {
    return null;
  }

  const handleRespond = async (inviteId: string, accept: boolean, partyName?: string, forceLeave?: boolean) => {
    setRespondingTo(inviteId);
    try {
      if (accept) {
        await acceptMutation.mutateAsync({ inviteId, forceLeave });
      } else {
        await declineMutation.mutateAsync(inviteId);
      }
      toast({
        title: accept ? "Joined Party" : "Invite Declined",
        description: accept
          ? `You joined ${partyName || "the party"}`
          : "You declined the party invite.",
        variant: accept ? "default" : "destructive",
      });
    } catch (error: any) {
      if (error?.errorCode === 'ALREADY_IN_PARTY') {
        const invite = pendingInvites.find(i => i.id === inviteId);
        if (invite) {
          setConfirmInvite(invite);
        }
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to respond to invite",
          variant: "destructive",
        });
      }
    } finally {
      setRespondingTo(null);
    }
  };

  const handleConfirmLeaveAndJoin = async () => {
    if (!confirmInvite) return;
    const invite = confirmInvite;
    setConfirmInvite(null);
    await handleRespond(invite.id, true, invite.party?.name || undefined, true);
  };

  const handleDismiss = (inviteId: string) => {
    setDismissed((prev) => {
      const newSet = new Set(prev);
      newSet.add(inviteId);
      return newSet;
    });
  };

  const getPartyTypeBadge = (partyType: string) => {
    if (partyType === 'dungeon') {
      return (
        <Badge className="text-[9px] px-1 py-0 bg-indigo-500/20 text-indigo-300 border border-indigo-500/50">
          <Sword className="w-2.5 h-2.5 mr-0.5" weight="fill" />
          Dungeon
        </Badge>
      );
    }
    return (
      <Badge className="text-[9px] px-1 py-0 bg-green-500/20 text-green-300 border border-green-500/50">
        <Shield className="w-2.5 h-2.5 mr-0.5" weight="fill" />
        Social
      </Badge>
    );
  };

  return (
    <>
      <div className="fixed bottom-16 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {visibleInvites.slice(0, 3).map((invite) => (
          <Card
            key={invite.id}
            className="bg-background/95 backdrop-blur-sm border-violet-500/50 shadow-lg animate-in slide-in-from-right"
            data-testid={`party-invite-${invite.id}`}
          >
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UsersThree className="w-4 h-4 text-violet-500" weight="fill" />
                  Party Invite
                  {invite.party?.partyType && getPartyTypeBadge(invite.party.partyType)}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleDismiss(invite.id)}
                  data-testid={`button-dismiss-party-invite-${invite.id}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-violet-600/30">
                  <UsersThree className="w-6 h-6 text-violet-400" weight="fill" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {invite.party?.name || "Party"}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Crown className="w-3 h-3" weight="fill" />
                    Invited by {invite.inviter?.username || "Unknown"}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                  onClick={() => handleRespond(invite.id, false, invite.party?.name || undefined)}
                  disabled={respondingTo === invite.id}
                  data-testid={`button-decline-party-invite-${invite.id}`}
                >
                  <X className="w-4 h-4 mr-1" />
                  Decline
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={() => handleRespond(invite.id, true, invite.party?.name || undefined)}
                  disabled={respondingTo === invite.id}
                  data-testid={`button-accept-party-invite-${invite.id}`}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Accept
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {visibleInvites.length > 3 && (
          <div className="text-center text-xs text-muted-foreground">
            +{visibleInvites.length - 3} more invite{visibleInvites.length - 3 > 1 ? "s" : ""}
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmInvite} onOpenChange={(open) => { if (!open) setConfirmInvite(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Current Party?</AlertDialogTitle>
            <AlertDialogDescription>
              You are currently in a party. To join "{confirmInvite?.party?.name || 'this party'}" you need to leave your current party first. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-violet-600 hover:bg-violet-700"
              onClick={handleConfirmLeaveAndJoin}
              data-testid="button-confirm-leave-and-join"
            >
              Leave & Join
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
