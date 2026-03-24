import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface SentInviteData {
  id: string;
  inviteeId: string;
  createdAt: string;
  expiresAt: string;
  invitee: { id: string; username: string; avatar: string | null };
}

export function usePartyInvites(partyId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: sentInvites = [] } = useQuery<SentInviteData[]>({
    queryKey: ["/api/parties", partyId, "invites"],
    queryFn: async () => {
      if (!partyId) return [];
      const res = await apiRequest("GET", `/api/parties/${partyId}/invites`);
      const data = await res.json();
      return data.invites || [];
    },
    enabled: !!partyId,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const inviteMutation = useMutation({
    mutationFn: async (inviteeId: string) => {
      if (!partyId) throw new Error("No party");
      const res = await apiRequest("POST", `/api/parties/${partyId}/invite`, { inviteeId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invite sent!" });
      queryClient.invalidateQueries({ queryKey: ["/api/parties", partyId, "invites"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!partyId) throw new Error("No party");
      const res = await apiRequest("DELETE", `/api/parties/${partyId}/invites/${inviteId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invite cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/parties", partyId, "invites"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return { sentInvites, inviteMutation, cancelInviteMutation };
}
