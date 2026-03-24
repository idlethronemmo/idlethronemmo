import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  UsersThree, 
  Crown, 
  Shield, 
  Sword, 
  Heart, 
  Star,
  CaretDown,
  SignOut,
  Check,
  X,
  Axe,
  FishSimple,
  Flame,
  Flask,
  Hammer,
  Circle,
  Lightning,
  PaperPlaneTilt,
  MagnifyingGlass,
  Sparkle,
  Trash,
  GlobeSimple,
  Clock,
  Plus,
  PencilSimple,
  MapPin,
  Leaf,
  Info
} from "@phosphor-icons/react";
import { Swords, Pickaxe, TreePine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { PartyRole } from "@shared/schema";
import { getSubClass } from "@shared/subClasses";
import { getLocalizedMonsterName, getLocalizedRegionName } from "@/lib/gameTranslations";
import type { Language } from "@/lib/i18n";
import PartyMemberDetailDialog, { AVATAR_MAP, PARTY_ROLE_ICONS, PARTY_ROLE_COLORS, PARTY_ROLE_BG_COLORS } from "./PartyMemberDetailDialog";

const SKILL_ICONS: Record<string, React.ElementType> = {
  mining: Pickaxe,
  woodcutting: TreePine,
  fishing: FishSimple,
  cooking: Flame,
  alchemy: Flask,
  crafting: Hammer,
  combat: Swords,
};

const WEAPON_TYPE_ICONS: Record<string, React.ElementType> = {
  sword: Sword,
  longsword: Sword,
  axe: Axe,
  "2h_axe": Axe,
  "2h_sword": Sword,
  "2h_warhammer": Hammer,
  dagger: Sword,
  mace: Hammer,
  warhammer: Hammer,
  bow: Swords,
  staff: Flask,
};

import type { PartyMemberData } from "./PartyMemberDetailDialog";

interface PartyData {
  id: string;
  leaderId: string;
  name: string | null;
  description: string | null;
  status: string;
  maxSize: number;
  isPublic: number;
  regionId: string | null;
  partyType?: string;
  members: PartyMemberData[];
}

interface PartyInviteData {
  id: string;
  partyId: string;
  inviterId: string;
  inviterUsername: string;
  partyName: string | null;
  expiresAt: string;
}

interface PartySynergyBonuses {
  attackBonus?: number;
  defenceBonus?: number;
  strengthBonus?: number;
  hitpointsBonus?: number;
  xpBonus?: number;
}

interface SynergyData {
  id: string;
  name: string;
  description: string;
  bonuses: PartySynergyBonuses;
  isActive: boolean;
}

interface PublicPartyData {
  id: string;
  leaderId: string;
  leaderUsername: string | null;
  leaderRegion: string | null;
  name: string | null;
  description: string | null;
  status: string;
  maxSize: number;
  isPublic: number;
  regionId: string | null;
  members: PartyMemberData[];
}

interface PartyPanelProps {
  compact?: boolean;
  className?: string;
  showHeader?: boolean;
  defaultOpen?: boolean;
  showInviteTab?: boolean;
  showSynergies?: boolean;
  slowPolling?: boolean;
}

export default function PartyPanel({ 
  compact = false, 
  className,
  showHeader = true,
  defaultOpen = true,
  showInviteTab = true,
  showSynergies = true,
  slowPolling = false
}: PartyPanelProps) {
  const { player, isGuest } = useGame();
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selectedMember, setSelectedMember] = useState<PartyMemberData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [partyPanelTab, setPartyPanelTab] = useState<"members" | "invite" | "actions">("members");
  const [inviteUsername, setInviteUsername] = useState("");
  const [isSearchingPlayer, setIsSearchingPlayer] = useState(false);
  const [searchResults, setSearchResults] = useState<{ playerId: string; username: string; totalLevel: number }[]>([]);
  const [partyFinderOpen, setPartyFinderOpen] = useState(false);
  const [createPartyDialogOpen, setCreatePartyDialogOpen] = useState(false);
  const [newPartyDescription, setNewPartyDescription] = useState("");
  const [leaveDungeonConfirmOpen, setLeaveDungeonConfirmOpen] = useState(false);
  const [leaveDungeonAction, setLeaveDungeonAction] = useState<'create' | 'find' | 'join' | null>(null);
  const [pendingJoinPartyId, setPendingJoinPartyId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [editDescriptionValue, setEditDescriptionValue] = useState("");

  const { data: currentParty, isLoading } = useQuery<PartyData | null>({
    queryKey: ["/api/parties/current"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/parties/current");
        const data = await res.json();
        const party = data.party || null;
        if (party && (party.status === 'disbanded' || !party.members || party.members.length === 0)) {
          return null;
        }
        return party;
      } catch (error: any) {
        if (error.message?.includes("404") || error.message?.includes("not in a party")) {
          return null;
        }
        throw error;
      }
    },
    refetchInterval: slowPolling ? 120000 : 30000,
    staleTime: 25000,
    enabled: !isGuest,
  });

  const effectiveParty = (currentParty?.partyType === 'dungeon' || currentParty?.status === 'disbanded' || (currentParty && (!currentParty.members || currentParty.members.length === 0))) ? null : currentParty;

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [queryClient]);

  const { data: pendingInvites = [] } = useQuery<PartyInviteData[]>({
    queryKey: ["/api/party-invites"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/party-invites");
      const data = await res.json();
      return data.invites || [];
    },
    enabled: !effectiveParty && !isGuest,
    refetchInterval: slowPolling ? 120000 : 30000,
    staleTime: 25000,
  });

  const { data: partySentInvites = [] } = useQuery<Array<{
    id: string;
    inviteeId: string;
    createdAt: string;
    expiresAt: string;
    invitee: { id: string; username: string; avatar: string | null };
  }>>({
    queryKey: ["/api/parties", effectiveParty?.id, "invites"],
    queryFn: async () => {
      if (!effectiveParty?.id) return [];
      const res = await apiRequest("GET", `/api/parties/${effectiveParty.id}/invites`);
      const data = await res.json();
      return data.invites || [];
    },
    enabled: !!effectiveParty?.id,
    refetchInterval: slowPolling ? 120000 : 30000,
    staleTime: 25000,
  });

  const { data: synergies = [] } = useQuery<SynergyData[]>({
    queryKey: ["/api/parties", effectiveParty?.id, "synergies"],
    queryFn: async () => {
      if (!effectiveParty?.id) return [];
      const res = await apiRequest("GET", `/api/parties/${effectiveParty.id}/synergies`);
      const data = await res.json();
      return data.synergies || [];
    },
    enabled: !!effectiveParty?.id && showSynergies,
  });

  const { data: publicParties = [], isLoading: isLoadingPublicParties } = useQuery<PublicPartyData[]>({
    queryKey: ["/api/parties/public"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/parties/public`);
      const data = await res.json();
      return data.parties || [];
    },
    enabled: partyFinderOpen,
    refetchInterval: slowPolling ? 120000 : 30000,
    staleTime: 25000,
  });

  const leavePartyMutation = useMutation({
    mutationFn: async (partyId: string) => {
      const res = await apiRequest("POST", `/api/parties/${partyId}/leave`);
      return res.json();
    },
    onSuccess: (_data, partyId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      queryClient.removeQueries({ queryKey: ['/api/party', partyId, 'combat'] });
      queryClient.removeQueries({ queryKey: ['/api/party', partyId, 'combat', 'logs'] });
      toast({ title: language === 'tr' ? "Partiden ayrıldın" : "Left party" });
    },
    onError: (error: any) => {
      if (error.message?.includes("not in a party") || error.message?.includes("404")) {
        queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
        queryClient.invalidateQueries({ queryKey: ["/api/parties/my/snapshot"] });
        toast({ title: language === 'tr' ? "Partiden zaten ayrılmışsın" : "Already left the party" });
      } else {
        toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const kickMemberMutation = useMutation({
    mutationFn: async ({ partyId, playerId }: { partyId: string; playerId: string }) => {
      const res = await apiRequest("POST", `/api/parties/${partyId}/kick/${playerId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      toast({ title: language === 'tr' ? "Üye partiden atıldı" : "Member kicked" });
    },
    onError: (error: any) => {
      toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const acceptInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await apiRequest("POST", `/api/party-invites/${inviteId}/accept`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/party-invites"] });
      toast({ title: language === 'tr' ? "Partiye katıldın!" : "Joined party!" });
    },
    onError: (error: any) => {
      toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const declineInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await apiRequest("POST", `/api/party-invites/${inviteId}/decline`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/party-invites"] });
      toast({ title: language === 'tr' ? "Davet reddedildi" : "Invite declined" });
    },
    onError: (error: any) => {
      toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const cancelSentInviteMutation = useMutation({
    mutationFn: async ({ partyId, inviteId }: { partyId: string; inviteId: string }) => {
      const res = await apiRequest("DELETE", `/api/parties/${partyId}/invites/${inviteId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties", effectiveParty?.id, "invites"] });
      toast({ title: language === 'tr' ? "Davet iptal edildi" : "Invite cancelled" });
    },
    onError: (error: any) => {
      toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ partyId, playerId }: { partyId: string; playerId: string }) => {
      const res = await apiRequest("POST", `/api/parties/${partyId}/invite`, { inviteeId: playerId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: language === 'tr' ? "Davet gönderildi!" : "Invite sent!" });
      setInviteUsername("");
      setSearchResults([]);
    },
    onError: (error: any) => {
      toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const togglePublicMutation = useMutation({
    mutationFn: async (partyId: string) => {
      const res = await apiRequest("POST", `/api/parties/${partyId}/toggle-public`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      const isNowPublic = data.party?.isPublic === 1;
      toast({ title: isNowPublic 
        ? (language === 'tr' ? "Parti artık herkese açık" : "Party is now public") 
        : (language === 'tr' ? "Parti artık özel" : "Party is now private") 
      });
    },
    onError: (error: any) => {
      toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleReadyMutation = useMutation({
    mutationFn: async ({ partyId, isReady }: { partyId: string; isReady: boolean }) => {
      const res = await apiRequest("PATCH", `/api/parties/${partyId}/ready`, { isReady });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
    },
    onError: (error: any) => {
      toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: async ({ partyId, name }: { partyId: string; name: string | null }) => {
      const res = await apiRequest("PATCH", `/api/parties/${partyId}/name`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      setEditingName(false);
      toast({ title: language === 'tr' ? "Parti adı güncellendi" : "Party name updated" });
    },
    onError: (error: any) => {
      toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateDescriptionMutation = useMutation({
    mutationFn: async ({ partyId, description }: { partyId: string; description: string | null }) => {
      const res = await apiRequest("PATCH", `/api/parties/${partyId}/description`, { description });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      setEditingDescription(false);
      toast({ title: language === 'tr' ? "Açıklama güncellendi" : "Description updated" });
    },
    onError: (error: any) => {
      toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const disbandMutation = useMutation({
    mutationFn: async (partyId: string) => {
      const res = await apiRequest("POST", `/api/parties/${partyId}/disband`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      toast({ title: language === 'tr' ? "Parti dağıtıldı" : "Party disbanded" });
    },
    onError: (error: any) => {
      toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const createPartyMutation = useMutation({
    mutationFn: async (description?: string) => {
      const res = await apiRequest("POST", "/api/parties", { 
        description: description && description.trim() ? description.trim() : null,
        partyType: 'social'
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      setCreatePartyDialogOpen(false);
      setNewPartyDescription("");
      toast({ title: language === 'tr' ? "Parti oluşturuldu!" : "Party created!" });
    },
    onError: (error: any) => {
      toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const joinPartyMutation = useMutation({
    mutationFn: async (partyId: string) => {
      const res = await apiRequest("POST", `/api/parties/${partyId}/join`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parties/public"] });
      setPartyFinderOpen(false);
      toast({ title: language === 'tr' ? "Partiye katıldın!" : "Joined party!" });
    },
    onError: (error: any) => {
      toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const autoJoinMutation = useMutation({
    mutationFn: async (regionId: string) => {
      const res = await apiRequest("POST", `/api/parties/auto-join?regionId=${encodeURIComponent(regionId)}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parties/public"] });
      setPartyFinderOpen(false);
      toast({ title: language === 'tr' ? "Partiye katıldın!" : "Joined party!" });
    },
    onError: (error: any) => {
      toast({ title: language === 'tr' ? "Hata" : "Error", description: error.message, variant: "destructive" });
    },
  });

  const searchPlayers = async () => {
    if (inviteUsername.length < 2) {
      toast({ title: language === 'tr' ? "En az 2 karakter girin" : "Enter at least 2 characters", variant: "destructive" });
      return;
    }
    setIsSearchingPlayer(true);
    try {
      const res = await apiRequest("GET", `/api/players/search?username=${encodeURIComponent(inviteUsername)}`);
      const data = await res.json();
      if (data.found && data.players) {
        const filteredPlayers = (data.players || []).filter((p: any) => 
          p.playerId !== player?.id && 
          !(effectiveParty?.members || []).some((m) => m.playerId === p.playerId)
        );
        setSearchResults(filteredPlayers);
        if (filteredPlayers.length === 0) {
          toast({ title: language === 'tr' ? "Davet edilecek oyuncu bulunamadı" : "No players found to invite" });
        }
      } else {
        setSearchResults([]);
        toast({ title: language === 'tr' ? "Oyuncu bulunamadı" : "Player not found" });
      }
    } catch (error) {
      toast({ title: language === 'tr' ? "Arama hatası" : "Search error", variant: "destructive" });
    } finally {
      setIsSearchingPlayer(false);
    }
  };

  if (isGuest) return null;

  const isPartyLeader = effectiveParty && player?.id === effectiveParty.leaderId;
  const myMembership = (effectiveParty?.members || []).find(m => m.playerId === player?.id);
  const activeSynergies = Array.isArray(synergies) ? synergies.filter(s => s.isActive) : [];
  const isSocialParty = !effectiveParty?.partyType || effectiveParty?.partyType === 'social';

  const getPartyCategory = (members: PartyMemberData[]) => {
    if (!members || members.length === 0) return 'idle';
    let gatherCount = 0;
    let combatCount = 0;
    for (const m of members) {
      if (m.isInCombat === 1 || m.activeTask?.skillType === 'combat') {
        combatCount++;
      } else if (m.activeTask?.type === 'skill' && m.activeTask.skillType) {
        gatherCount++;
      }
    }
    const activeCount = gatherCount + combatCount;
    if (activeCount === 0) return 'idle';
    if (gatherCount > combatCount) return 'gather';
    if (combatCount > gatherCount) return 'combat';
    return 'mixed';
  };

  const partyCategoryForPublic = (members: PartyMemberData[]) => {
    const cat = getPartyCategory(members);
    if (cat === 'gather') return { label: language === 'tr' ? 'Toplama' : 'Gather', color: 'text-green-400 border-green-500/50 bg-green-500/10', icon: Leaf };
    if (cat === 'combat') return { label: language === 'tr' ? 'Savaş' : 'Combat', color: 'text-red-400 border-red-500/50 bg-red-500/10', icon: Swords };
    if (cat === 'mixed') return { label: language === 'tr' ? 'Karma' : 'Mixed', color: 'text-amber-400 border-amber-500/50 bg-amber-500/10', icon: Star };
    return null;
  };

  const getMemberStatusDisplay = (member: PartyMemberData) => {
    const isOffline = member.isOnline !== 1;

    if (member.isInCombat === 1 && member.currentMonsterId) {
      const monsterName = getLocalizedMonsterName(language as Language, member.currentMonsterId);
      return { 
        icon: Swords, 
        color: isOffline ? "text-gray-400" : "text-red-400", 
        label: monsterName || (language === 'tr' ? "Savaşta" : "In Combat")
      };
    }
    if (member.activeTask?.type === 'skill' && member.activeTask.skillType) {
      const SkillIcon = SKILL_ICONS[member.activeTask.skillType] || Circle;
      const skillName = member.activeTask.skillType.charAt(0).toUpperCase() + member.activeTask.skillType.slice(1);
      return { 
        icon: SkillIcon, 
        color: isOffline ? "text-gray-400" : "text-amber-400", 
        label: skillName 
      };
    }
    if (isOffline) {
      return { 
        icon: Circle, 
        color: "text-gray-500", 
        label: language === 'tr' ? "Çevrimdışı" : "Offline" 
      };
    }
    if (member.currentRegion) {
      const regionName = getLocalizedRegionName(language as Language, member.currentRegion);
      return { 
        icon: Circle, 
        color: "text-green-400", 
        label: regionName || member.currentRegion.replace(/_/g, " ") 
      };
    }
    return { 
      icon: Circle, 
      color: "text-green-400", 
      label: language === 'tr' ? "Çevrimiçi" : "Online" 
    };
  };

  const renderMember = (member: PartyMemberData) => {
    const isLeader = member.playerId === effectiveParty!.leaderId;
    const isSelf = member.playerId === player?.id;
    const RoleIcon = PARTY_ROLE_ICONS[member.role];
    const roleColor = PARTY_ROLE_COLORS[member.role];
    const status = getMemberStatusDisplay(member);
    const StatusIcon = status.icon;
    const avatarSrc = member.avatar ? AVATAR_MAP[member.avatar] : null;
    const memberIsReady = member.isReady === 1;
    const memberSubClass = getSubClass(member.cachedWeaponType || null, null);

    return (
      <TooltipProvider key={member.id}>
        <Tooltip>
          <TooltipTrigger asChild>
      <div
        className={cn(
          "flex items-center gap-2 p-1.5 rounded-lg border transition-colors cursor-pointer hover:bg-muted/40",
          isSelf ? "bg-violet-500/10 border-violet-500/30" : "bg-muted/20 border-border/30",
          compact ? "text-xs" : "text-sm"
        )}
        data-testid={`party-member-${member.playerId}`}
        onClick={() => {
          setSelectedMember(member);
          setDetailOpen(true);
        }}
      >
        <div className="relative">
          {avatarSrc ? (
            <img 
              src={avatarSrc} 
              alt={member.username} 
              className={cn(
                "rounded-full object-cover border border-border",
                compact ? "w-6 h-6" : "w-8 h-8"
              )}
            />
          ) : (
            <div className={cn(
              "rounded-full bg-muted flex items-center justify-center",
              compact ? "w-6 h-6" : "w-8 h-8"
            )}>
              <RoleIcon className={cn("w-3 h-3", roleColor)} weight="fill" />
            </div>
          )}
          <div className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full border border-background",
            member.isOnline === 1 ? "bg-green-500" : "bg-gray-500",
            "w-2.5 h-2.5"
          )} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={cn(
              "truncate font-medium",
              compact ? "text-[10px]" : "text-xs",
              isSelf && "text-violet-300"
            )}>
              {member.username}
            </span>
            {isLeader && <Crown className="w-2.5 h-2.5 text-yellow-400 shrink-0" weight="fill" />}
            {!isSocialParty && memberIsReady && <Check className="w-2.5 h-2.5 text-green-400 shrink-0" weight="bold" />}
            {member.cachedWeaponType && WEAPON_TYPE_ICONS[member.cachedWeaponType] && (() => {
              const WeaponIcon = WEAPON_TYPE_ICONS[member.cachedWeaponType!];
              return <WeaponIcon className="w-2.5 h-2.5 text-amber-400/70 shrink-0" weight="fill" />;
            })()}
          </div>
          <div className={cn(
            "flex items-center gap-1",
            compact ? "text-[8px]" : "text-[9px]",
            "text-muted-foreground"
          )}>
            <StatusIcon className={cn("w-2.5 h-2.5 shrink-0", status.color)} weight="fill" />
            <span className="truncate">{status.label}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <span className={cn(
            "text-muted-foreground font-mono shrink-0",
            compact ? "text-[8px]" : "text-[9px]"
          )}>
            Lv.{member.totalLevel}
          </span>
          {isPartyLeader && !isSelf && (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0 text-red-400 hover:bg-red-500/20"
              onClick={(e) => {
                e.stopPropagation();
                kickMemberMutation.mutate({ partyId: effectiveParty!.id, playerId: member.playerId });
              }}
              data-testid={`button-kick-member-${member.playerId}`}
            >
              <X className="w-3 h-3" weight="bold" />
            </Button>
          )}
        </div>
      </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-bold text-sm">{member.username}</p>
              <p className="text-xs" style={{ color: memberSubClass.color }}>{memberSubClass.icon} {memberSubClass.name}</p>
              <p className="text-xs text-amber-300 font-semibold">{memberSubClass.passive.name}</p>
              <p className="text-xs text-muted-foreground">{memberSubClass.passive.description}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const renderPartyContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-3">
          <div className={cn(
            "border-2 border-primary border-t-transparent rounded-full animate-spin",
            compact ? "w-4 h-4" : "w-5 h-5"
          )} />
        </div>
      );
    }

    if (effectiveParty) {
      const currentCategory = partyCategoryForPublic(effectiveParty.members || []);

      return (
        <div className="space-y-2">
          <div className="space-y-1 pb-1.5 border-b border-border/30">
            <div className="flex items-center gap-1.5">
              {editingName && isPartyLeader ? (
                <div className="flex items-center gap-1 flex-1">
                  <Input
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    className="h-6 text-xs flex-1"
                    maxLength={30}
                    placeholder={language === 'tr' ? "Parti adı..." : "Party name..."}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && effectiveParty?.id) updateNameMutation.mutate({ partyId: effectiveParty.id, name: editNameValue.trim() || null });
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                    autoFocus
                    data-testid="input-edit-party-name"
                  />
                  <Button size="sm" className="h-6 px-1.5" onClick={() => { if (effectiveParty?.id) updateNameMutation.mutate({ partyId: effectiveParty.id, name: editNameValue.trim() || null }); }} disabled={updateNameMutation.isPending} data-testid="button-save-party-name">
                    <Check className="w-3 h-3" weight="bold" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => setEditingName(false)} data-testid="button-cancel-edit-name">
                    <X className="w-3 h-3" weight="bold" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className={cn("font-semibold truncate", compact ? "text-xs" : "text-sm")}>
                    {effectiveParty.name || (language === 'tr' ? "İsimsiz Parti" : "Unnamed Party")}
                  </span>
                  {isPartyLeader && (
                    <button className="text-muted-foreground hover:text-foreground" onClick={() => { setEditNameValue(effectiveParty.name || ""); setEditingName(true); }} data-testid="button-edit-party-name">
                      <PencilSimple className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
              {currentCategory && (
                <Badge className={cn("py-0 ml-auto shrink-0 border", currentCategory.color, compact ? "text-[7px] px-1" : "text-[8px] px-1.5")} data-testid="badge-party-category">
                  <currentCategory.icon className="w-2.5 h-2.5 mr-0.5" />
                  {currentCategory.label}
                </Badge>
              )}
            </div>
            {editingDescription && isPartyLeader ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editDescriptionValue}
                  onChange={(e) => setEditDescriptionValue(e.target.value)}
                  className="h-5 text-[10px] flex-1"
                  maxLength={100}
                  placeholder={language === 'tr' ? "Açıklama..." : "Description..."}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && effectiveParty?.id) updateDescriptionMutation.mutate({ partyId: effectiveParty.id, description: editDescriptionValue.trim() || null });
                    if (e.key === 'Escape') setEditingDescription(false);
                  }}
                  autoFocus
                  data-testid="input-edit-party-description"
                />
                <Button size="sm" className="h-5 px-1" onClick={() => { if (effectiveParty?.id) updateDescriptionMutation.mutate({ partyId: effectiveParty.id, description: editDescriptionValue.trim() || null }); }} disabled={updateDescriptionMutation.isPending} data-testid="button-save-party-description">
                  <Check className="w-2.5 h-2.5" weight="bold" />
                </Button>
                <Button size="sm" variant="ghost" className="h-5 px-1" onClick={() => setEditingDescription(false)} data-testid="button-cancel-edit-description">
                  <X className="w-2.5 h-2.5" weight="bold" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className={cn("text-muted-foreground truncate", compact ? "text-[8px]" : "text-[10px]")}>
                  {effectiveParty.description || (language === 'tr' ? "Açıklama yok" : "No description")}
                </span>
                {isPartyLeader && (
                  <button className="text-muted-foreground hover:text-foreground shrink-0" onClick={() => { setEditDescriptionValue(effectiveParty.description || ""); setEditingDescription(true); }} data-testid="button-edit-party-description">
                    <PencilSimple className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-violet-500/5 border border-violet-500/20 cursor-help" data-testid="party-bonuses-summary">
                  <Info className={cn("shrink-0 text-violet-400", compact ? "w-3 h-3" : "w-3.5 h-3.5")} weight="fill" />
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <span className={cn("text-amber-400", compact ? "text-[8px]" : "text-[9px]")}>{language === 'tr' ? "Hız" : "Speed"} +3-10%</span>
                    <span className={cn("text-yellow-400", compact ? "text-[8px]" : "text-[9px]")}>XP +2-6%</span>
                    <span className={cn("text-blue-400", compact ? "text-[8px]" : "text-[9px]")}>{language === 'tr' ? "Loot Paylaşımı" : "Loot Share"} 7-12%</span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px] text-xs space-y-1.5 p-3">
                <p className="font-semibold text-violet-300">{language === 'tr' ? "Parti Bonusları" : "Party Bonuses"}</p>
                <div className="space-y-1 text-[10px]">
                  <p className="text-amber-400">{language === 'tr' ? "Hız Bonusu: Aynı beceri +3% (2 üye) - +10% (5 üye)" : "Speed Bonus: Same skill +3% (2 members) - +10% (5 members)"}</p>
                  <p className="text-yellow-400">{language === 'tr' ? "XP Bonusu: Aynı beceri +2% (3 üye) - +6% (5 üye)" : "XP Bonus: Same skill +2% (3 members) - +6% (5 members)"}</p>
                  <p className="text-red-400">{language === 'tr' ? "Savaş DPS: Aynı canavar +15% (2) - +50% (5)" : "Combat DPS: Same monster +15% (2) - +50% (5)"}</p>
                  <p className="text-blue-400">{language === 'tr' ? "Savaş Savunma: Aynı canavar +10% (2) - +40% (5)" : "Combat Defense: Same monster +10% (2) - +40% (5)"}</p>
                  <p className="text-green-400">{language === 'tr' ? "Loot Paylaşımı: Aynı canavar %12, farklı %7" : "Loot Share: Same monster 12%, different 7%"}</p>
                  <p className="text-pink-400">{language === 'tr' ? "Tank: +15% savunma • İyileştirici: +20% yemek iyileştirme • DPS: +10% saldırı" : "Tank: +15% defense • Healer: +20% food healing • DPS: +10% attack"}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {showSynergies && activeSynergies.length > 0 && (
            <div className="flex flex-wrap gap-1 pb-1 border-b border-border/30">
              {activeSynergies.map((synergy) => (
                <TooltipProvider key={synergy.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className={cn(
                        "py-0 bg-violet-500/20 text-violet-300 border border-violet-500/50",
                        compact ? "text-[8px] px-1" : "text-[9px] px-1.5"
                      )}>
                        <Sparkle className={cn("mr-0.5", compact ? "w-2 h-2" : "w-2.5 h-2.5")} weight="fill" />
                        {synergy.name}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                      <p className="font-medium mb-1">{synergy.name}</p>
                      <p className="text-muted-foreground">{synergy.description}</p>
                      <div className="mt-1 space-y-0.5 text-[10px]">
                        {synergy.bonuses.attackBonus && <div className="text-orange-400">+{synergy.bonuses.attackBonus} ATK</div>}
                        {synergy.bonuses.defenceBonus && <div className="text-blue-400">+{synergy.bonuses.defenceBonus} DEF</div>}
                        {synergy.bonuses.strengthBonus && <div className="text-red-400">+{synergy.bonuses.strengthBonus} STR</div>}
                        {synergy.bonuses.hitpointsBonus && <div className="text-green-400">+{synergy.bonuses.hitpointsBonus} HP</div>}
                        {synergy.bonuses.xpBonus && <div className="text-yellow-400">+{synergy.bonuses.xpBonus}% XP</div>}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          )}

          <Tabs value={partyPanelTab} onValueChange={(v) => setPartyPanelTab(v as typeof partyPanelTab)} className="w-full">
            <TabsList className={cn("w-full bg-muted/30", compact ? "h-6" : "h-7")}>
              <TabsTrigger value="members" className={cn("flex-1 data-[state=active]:bg-violet-500/20", compact ? "text-[9px] h-5" : "text-[10px] h-6")}>
                <UsersThree className={cn("mr-0.5", compact ? "w-3 h-3" : "w-3 h-3")} weight="fill" />
                {language === 'tr' ? "Üyeler" : "Members"}
              </TabsTrigger>
              {showInviteTab && isPartyLeader && (
                <TabsTrigger value="invite" className={cn("flex-1 data-[state=active]:bg-violet-500/20", compact ? "text-[9px] h-5" : "text-[10px] h-6")}>
                  <PaperPlaneTilt className={cn("mr-0.5", compact ? "w-3 h-3" : "w-3 h-3")} weight="fill" />
                  {language === 'tr' ? "Davet" : "Invite"}
                </TabsTrigger>
              )}
              <TabsTrigger value="actions" className={cn("flex-1 data-[state=active]:bg-violet-500/20", compact ? "text-[9px] h-5" : "text-[10px] h-6")}>
                <Star className={cn("mr-0.5", compact ? "w-3 h-3" : "w-3 h-3")} weight="fill" />
                {language === 'tr' ? "Ayarlar" : "Actions"}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="members" className={cn("space-y-1", compact ? "mt-1.5" : "mt-2")}>
              {(effectiveParty.members || []).map(renderMember)}
            </TabsContent>

            {showInviteTab && isPartyLeader && (
              <TabsContent value="invite" className={cn("space-y-1.5", compact ? "mt-1.5" : "mt-2")}>
                <div className="flex gap-1">
                  <Input
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    placeholder={language === 'tr' ? "Kullanıcı adı..." : "Username..."}
                    className={cn(compact ? "h-7 text-xs" : "h-7 text-xs")}
                    onKeyDown={(e) => e.key === 'Enter' && searchPlayers()}
                    data-testid="input-invite-username"
                  />
                  <Button
                    size="sm"
                    className="h-7 px-2"
                    onClick={searchPlayers}
                    disabled={isSearchingPlayer}
                    data-testid="button-search-player"
                  >
                    <MagnifyingGlass className="w-3.5 h-3.5" weight="bold" />
                  </Button>
                </div>
                {searchResults.length > 0 && (
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {searchResults.slice(0, 3).map((p) => (
                      <div
                        key={p.playerId}
                        className={cn(
                          "flex items-center justify-between p-1.5 rounded-lg bg-muted/30 border border-border/30",
                          compact ? "text-xs" : "text-xs"
                        )}
                        data-testid={`search-result-${p.playerId}`}
                      >
                        <div>
                          <div className="font-medium">{p.username}</div>
                          <div className="text-[9px] text-muted-foreground">Lv.{p.totalLevel}</div>
                        </div>
                        <Button
                          size="sm"
                          className={cn("bg-violet-600 hover:bg-violet-700", compact ? "h-5 px-2 text-[10px]" : "h-6 px-2 text-[10px]")}
                          onClick={() => { if (effectiveParty?.id) inviteMutation.mutate({ partyId: effectiveParty.id, playerId: p.playerId }); }}
                          disabled={inviteMutation.isPending}
                          data-testid={`button-invite-${p.playerId}`}
                        >
                          <PaperPlaneTilt className="w-3 h-3 mr-1" weight="fill" />
                          {language === 'tr' ? "Davet" : "Invite"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {partySentInvites.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <div className="text-[10px] text-muted-foreground mb-1">
                      {language === 'tr' ? 'Bekleyen Davetler' : 'Pending Invites'}
                    </div>
                    <div className="space-y-1 max-h-20 overflow-y-auto">
                      {partySentInvites.map((invite) => (
                        <div key={invite.id} className="flex items-center justify-between p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-xs">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span className="truncate">{invite.invitee.username}</span>
                          </div>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-5 px-2 text-[10px] text-red-400 hover:text-red-300" 
                            onClick={() => { if (effectiveParty?.id) cancelSentInviteMutation.mutate({ partyId: effectiveParty.id, inviteId: invite.id }); }}
                            disabled={cancelSentInviteMutation.isPending}
                            data-testid={`cancel-invite-${invite.id}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            )}

            <TabsContent value="actions" className={cn("space-y-1.5", compact ? "mt-1.5" : "mt-2")}>
              {!isSocialParty && (
                <div className="flex items-center justify-between p-1.5 rounded-lg bg-muted/20 border border-border/30">
                  <span className={cn(compact ? "text-[10px]" : "text-xs")}>
                    {language === 'tr' ? "Hazır" : "Ready"}
                  </span>
                  <Button
                    size="sm"
                    variant={myMembership?.isReady === 1 ? "default" : "outline"}
                    className={cn(
                      "h-6 px-2 text-[10px]",
                      myMembership?.isReady === 1 && "bg-green-600 hover:bg-green-700"
                    )}
                    onClick={() => { if (effectiveParty?.id) toggleReadyMutation.mutate({ 
                      partyId: effectiveParty.id, 
                      isReady: myMembership?.isReady !== 1 
                    }); }}
                    disabled={toggleReadyMutation.isPending}
                    data-testid="button-toggle-ready"
                  >
                    <Check className="w-3 h-3 mr-1" weight="bold" />
                    {myMembership?.isReady === 1 
                      ? (language === 'tr' ? "Hazırım" : "Ready") 
                      : (language === 'tr' ? "Hazır Değil" : "Not Ready")
                    }
                  </Button>
                </div>
              )}

              {isPartyLeader && (
                <div className="flex items-center justify-between p-1.5 rounded-lg bg-muted/20 border border-border/30">
                  <span className={cn("flex items-center gap-1", compact ? "text-[10px]" : "text-xs")}>
                    <GlobeSimple className="w-3 h-3" />
                    {language === 'tr' ? "Herkese Açık" : "Public Party"}
                  </span>
                  <Switch
                    checked={effectiveParty?.isPublic === 1}
                    onCheckedChange={() => { if (effectiveParty?.id) togglePublicMutation.mutate(effectiveParty.id); }}
                    disabled={togglePublicMutation.isPending}
                    className="scale-75"
                    data-testid="switch-public-party"
                  />
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/30",
                  compact ? "h-7 text-[10px]" : "h-7 text-xs"
                )}
                onClick={() => { if (effectiveParty?.id) leavePartyMutation.mutate(effectiveParty.id); }}
                disabled={leavePartyMutation.isPending || !effectiveParty?.id}
                data-testid="button-leave-party-panel"
              >
                <SignOut className="w-3 h-3 mr-1" />
                {language === 'tr' ? "Partiden Ayrıl" : "Leave Party"}
              </Button>

              {isPartyLeader && (
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-full text-red-500 hover:text-red-400 hover:bg-red-500/20 border-red-500/50",
                    compact ? "h-7 text-[10px]" : "h-7 text-xs"
                  )}
                  onClick={() => { if (effectiveParty?.id) disbandMutation.mutate(effectiveParty.id); }}
                  disabled={disbandMutation.isPending || !effectiveParty?.id}
                  data-testid="button-disband-party"
                >
                  <Trash className="w-3 h-3 mr-1" weight="bold" />
                  {language === 'tr' ? "Partiyi Dağıt" : "Disband Party"}
                </Button>
              )}
            </TabsContent>
          </Tabs>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {currentParty?.partyType === 'dungeon' && (
          <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-[10px] text-orange-300">
            <Shield className="w-3 h-3 shrink-0" weight="fill" />
            {language === 'tr' ? "Zindan partisinde bulunuyorsunuz" : "You're in a dungeon party"}
          </div>
        )}
        {pendingInvites.length > 0 ? (
          <div className="space-y-1.5">
            <div className={cn("font-medium text-amber-400", compact ? "text-[10px]" : "text-[10px] uppercase tracking-wide px-1")}>
              {language === 'tr' ? "Bekleyen Davetler" : "Pending Invites"}
            </div>
            {pendingInvites.slice(0, 3).map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30"
                data-testid={`party-invite-${invite.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className={cn("font-medium truncate", compact ? "text-[10px]" : "text-xs")}>{invite.partyName || (language === 'tr' ? "Parti" : "Party")}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{invite.inviterUsername}</div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    className="h-6 w-6 p-0 bg-green-600 hover:bg-green-700"
                    onClick={() => acceptInviteMutation.mutate(invite.id)}
                    disabled={acceptInviteMutation.isPending}
                    data-testid={`button-accept-invite-${invite.id}`}
                  >
                    <Check className="w-3 h-3" weight="bold" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 w-6 p-0 border-red-500/30 text-red-400 hover:bg-red-500/10"
                    onClick={() => declineInviteMutation.mutate(invite.id)}
                    disabled={declineInviteMutation.isPending}
                    data-testid={`button-decline-invite-${invite.id}`}
                  >
                    <X className="w-3 h-3" weight="bold" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-2">
            <p className={cn("text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>
              {language === 'tr' ? "Parti kurarak grup halinde savaşın" : "Fight together with a party"}
            </p>
          </div>
        )}

        <div className={cn("flex", compact ? "gap-1" : "gap-2")}>
          <Button
            size="sm"
            className={cn(
              "flex-1 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/50",
              compact ? "h-7 text-[10px]" : "text-xs h-8 bg-violet-600 hover:bg-violet-700"
            )}
            onClick={() => {
              if (currentParty?.partyType === 'dungeon') {
                setLeaveDungeonAction('create');
                setLeaveDungeonConfirmOpen(true);
              } else {
                setCreatePartyDialogOpen(true);
              }
            }}
            disabled={createPartyMutation.isPending}
            data-testid="button-create-party"
          >
            <Plus className={cn("mr-1", compact ? "w-3 h-3" : "w-3.5 h-3.5")} weight="bold" />
            {language === 'tr' ? "Parti Oluştur" : "Create Party"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "border-violet-500/30 text-violet-400 hover:bg-violet-500/10",
              compact ? "flex-1 h-7 text-[10px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/50" : "text-xs h-8"
            )}
            onClick={() => {
              if (currentParty?.partyType === 'dungeon') {
                setLeaveDungeonAction('find');
                setLeaveDungeonConfirmOpen(true);
              } else {
                setPartyFinderOpen(true);
              }
            }}
            data-testid="button-find-party"
          >
            <MagnifyingGlass className={cn("mr-1", compact ? "w-3 h-3" : "w-3.5 h-3.5")} weight="bold" />
            {language === 'tr' ? "Parti Bul" : "Find Party"}
          </Button>
        </div>
        {compact && (
          <p className="text-[8px] text-muted-foreground text-center">
            {language === 'tr' ? "Parti Bul butonu ile başka partilere katılın" : "Use Find Party to join other parties"}
          </p>
        )}
      </div>
    );
  };

  const panelContent = (
    <>
      {renderPartyContent()}

      <PartyMemberDetailDialog
        member={selectedMember}
        party={effectiveParty ? { leaderId: effectiveParty.leaderId } : null}
        currentPlayerId={player?.id}
        isOpen={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedMember(null);
        }}
        onKick={(playerId) => {
          if (effectiveParty) {
            kickMemberMutation.mutate({ partyId: effectiveParty.id, playerId });
          }
        }}
      />

      <Sheet open={partyFinderOpen} onOpenChange={setPartyFinderOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MagnifyingGlass className="w-5 h-5" />
              {language === 'tr' ? "Parti Bul" : "Find Party"}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            {player?.currentRegion && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  if (currentParty?.partyType === 'dungeon') {
                    setLeaveDungeonAction('find');
                    setLeaveDungeonConfirmOpen(true);
                    setPartyFinderOpen(false);
                  } else {
                    autoJoinMutation.mutate(player.currentRegion!);
                  }
                }}
                disabled={autoJoinMutation.isPending}
                data-testid="button-auto-join"
              >
                <Lightning className="w-4 h-4 mr-2" />
                {language === 'tr' ? "Otomatik Katıl (Rastgele Parti)" : "Auto-Join (Random Party)"}
              </Button>
            )}
            
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {language === 'tr' ? "Tüm Açık Partiler" : "All Public Parties"}
              </h4>
              {isLoadingPublicParties ? (
                <p className="text-sm text-muted-foreground">{language === 'tr' ? "Yükleniyor..." : "Loading..."}</p>
              ) : publicParties.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {language === 'tr' ? "Açık parti bulunamadı" : "No public parties found"}
                </p>
              ) : (
                <ScrollArea className="max-h-[300px]">
                  <div className="space-y-2">
                    {publicParties.map((party) => {
                      const pubCategory = partyCategoryForPublic(party.members || []);
                      const regionName = party.leaderRegion ? getLocalizedRegionName(language as Language, party.leaderRegion) : null;
                      const isSameRegion = player?.currentRegion && party.leaderRegion === player.currentRegion;

                      return (
                        <div
                          key={party.id}
                          className={cn("flex items-center justify-between p-3 rounded-lg border bg-muted/30", isSameRegion && "border-green-500/30")}
                          data-testid={`public-party-${party.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium truncate">{party.name || (language === 'tr' ? "İsimsiz Parti" : "Unnamed Party")}</p>
                              {pubCategory && (
                                <Badge className={cn("py-0 shrink-0 border text-[7px] px-1", pubCategory.color)}>
                                  <pubCategory.icon className="w-2 h-2 mr-0.5" />
                                  {pubCategory.label}
                                </Badge>
                              )}
                            </div>
                            {party.description && (
                              <p className="text-xs text-muted-foreground/80 truncate" title={party.description}>
                                {party.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-violet-400">
                                {language === 'tr' ? "Lider" : "Leader"}: {party.leaderUsername || (party.members || []).find(m => m.playerId === party.leaderId)?.username || '?'}
                              </span>
                              {regionName && (
                                <span className={cn("flex items-center gap-0.5", isSameRegion ? "text-green-400" : "text-muted-foreground")}>
                                  <MapPin className="w-2.5 h-2.5" weight="fill" />
                                  {regionName}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate" title={party.members?.map(m => m.username).join(', ')}>
                              {party.members?.length || 0}/{party.maxSize} {language === 'tr' ? "üye" : "members"} • {party.members?.slice(0, 3).map(m => m.username).join(', ')}{(party.members?.length || 0) > 3 ? '...' : ''}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (currentParty?.partyType === 'dungeon') {
                                setPendingJoinPartyId(party.id);
                                setLeaveDungeonAction('join');
                                setLeaveDungeonConfirmOpen(true);
                                setPartyFinderOpen(false);
                              } else {
                                joinPartyMutation.mutate(party.id);
                              }
                            }}
                            disabled={joinPartyMutation.isPending || (party.members || []).length >= party.maxSize}
                            data-testid={`button-join-party-${party.id}`}
                          >
                            {language === 'tr' ? "Katıl" : "Join"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={createPartyDialogOpen} onOpenChange={setCreatePartyDialogOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{language === 'tr' ? "Parti Oluştur" : "Create Party"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder={language === 'tr' ? "Parti açıklaması (isteğe bağlı)" : "Party description (optional)"}
              value={newPartyDescription}
              onChange={(e) => setNewPartyDescription(e.target.value.slice(0, 100))}
              data-testid="input-party-description"
            />
            <p className="text-xs text-muted-foreground">
              {(language === 'tr' ? '{0}/100 karakter' : '{0}/100 characters').replace('{0}', String(newPartyDescription.length))}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePartyDialogOpen(false)}>
              {language === 'tr' ? "İptal" : "Cancel"}
            </Button>
            <Button
              onClick={() => createPartyMutation.mutate(newPartyDescription)}
              disabled={createPartyMutation.isPending}
              data-testid="button-confirm-create-party"
            >
              {language === 'tr' ? "Oluştur" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leaveDungeonConfirmOpen} onOpenChange={setLeaveDungeonConfirmOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{language === 'tr' ? "Zindan Partisinden Ayrıl" : "Leave Dungeon Party"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {language === 'tr' 
              ? "Şu anda bir zindan partisinde bulunuyorsunuz. Bu işlem sizi zindan partisinden çıkaracak. Devam etmek istiyor musunuz?"
              : "You're in a dungeon party. This will remove you from it. Continue?"}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setLeaveDungeonConfirmOpen(false);
              setLeaveDungeonAction(null);
              setPendingJoinPartyId(null);
            }}>
              {language === 'tr' ? "İptal" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              disabled={leavePartyMutation.isPending}
              data-testid="button-confirm-leave-dungeon"
              onClick={async () => {
                if (!currentParty) return;
                try {
                  await leavePartyMutation.mutateAsync(currentParty.id);
                  setLeaveDungeonConfirmOpen(false);
                  if (leaveDungeonAction === 'create') {
                    setCreatePartyDialogOpen(true);
                  } else if (leaveDungeonAction === 'find') {
                    setPartyFinderOpen(true);
                  } else if (leaveDungeonAction === 'join' && pendingJoinPartyId) {
                    joinPartyMutation.mutate(pendingJoinPartyId);
                  }
                  setLeaveDungeonAction(null);
                  setPendingJoinPartyId(null);
                } catch (e) {
                }
              }}
            >
              {language === 'tr' ? "Ayrıl ve Devam Et" : "Leave & Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (!showHeader) {
    return (
      <div className={className}>
        {panelContent}
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn(
        "bg-card/50 border-border/50 transition-colors",
        effectiveParty && "border-violet-500/30",
        pendingInvites.length > 0 && !effectiveParty && "border-amber-500/30",
        className
      )}>
        <CollapsibleTrigger asChild>
          <CardHeader className={cn(
            "cursor-pointer hover:bg-muted/30 transition-colors",
            compact ? "py-1.5 px-2" : "pb-2 pt-3 px-3"
          )}>
            <CardTitle className={cn(
              "flex items-center gap-2",
              compact ? "text-xs" : "text-sm"
            )}>
              <UsersThree className={cn("w-4 h-4", effectiveParty ? "text-violet-400" : "text-muted-foreground")} weight="duotone" />
              {language === 'tr' ? "Parti" : "Party"}
              {effectiveParty && (
                <Badge variant="outline" className={cn(
                  "py-0 border-violet-500/50 text-violet-300",
                  compact ? "text-[8px] px-1" : "text-[10px] px-1.5"
                )}>
                  {(effectiveParty.members || []).length}/{effectiveParty.maxSize}
                </Badge>
              )}
              {pendingInvites.length > 0 && !effectiveParty && (
                <Badge className={cn(
                  "py-0 bg-amber-500/20 text-amber-300 border border-amber-500/50",
                  compact ? "text-[9px] px-1" : "text-[10px] px-1.5"
                )}>
                  {pendingInvites.length} {language === 'tr' ? "davet" : "invite"}
                </Badge>
              )}
              <CaretDown className={cn(
                "ml-auto transition-transform text-muted-foreground",
                compact ? "w-3 h-3" : "w-4 h-4",
                isOpen && "rotate-180"
              )} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className={cn(
            "pt-0",
            compact ? "p-1.5" : "p-2"
          )}>
            {panelContent}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
