import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useLanguage } from "@/context/LanguageContext";
import { useGame } from "@/context/GameContext";
import { t, type Language } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import GuestRestrictionBanner from "@/components/game/GuestRestrictionBanner";
import { 
  UsersThree, 
  Crown, 
  Shield, 
  Sword, 
  Heart, 
  Plus, 
  SignOut, 
  MagnifyingGlass, 
  Check, 
  X, 
  UserMinus, 
  PaperPlaneTilt,
  GlobeSimple,
  Lock,
  Sparkle,
  Lightning,
  Package,
  Info,
  Flask,
  Fish,
  Fire,
  Knife,
  Scroll,
  HouseLine,
  Circle
} from "@phosphor-icons/react";
import { Pickaxe, TreePine, Swords } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useMobile } from "@/hooks/useMobile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePartyInvites, type SentInviteData } from "@/hooks/usePartyInvites";
import { getLocalizedMonsterName, getLocalizedRegionName } from "@/lib/gameTranslations";
import { getSubClass } from "@shared/subClasses";

import PartyMemberDetailDialog, { AVATAR_MAP } from "@/components/game/PartyMemberDetailDialog";
import type { PartyMemberData } from "@/components/game/PartyMemberDetailDialog";

const SKILL_ICONS: Record<string, React.ElementType> = {
  mining: Pickaxe,
  woodcutting: TreePine,
  fishing: Fish,
  cooking: Fire,
  alchemy: Flask,
  crafting: Knife,
  runecrafting: Scroll,
  construction: HouseLine,
  smithing: Knife,
  hunting: Knife,
};


interface PartyData {
  id: string;
  leaderId: string;
  name: string | null;
  description: string | null;
  status: string;
  maxSize: number;
  isPublic: number;
  regionId: string | null;
  members: PartyMemberData[];
}

interface PublicPartyData {
  id: string;
  leaderId: string;
  leaderUsername: string | null;
  name: string | null;
  description: string | null;
  status: string;
  maxSize: number;
  isPublic: number;
  regionId: string | null;
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


export default function PartyPage() {
  const { language } = useLanguage();
  const { player, isGuest } = useGame();
  const { toast } = useToast();
  const { isMobile } = useMobile();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ playerId: string; username: string; isOnline: boolean; totalLevel: number }>>([]);
  const [isSearchingPlayer, setIsSearchingPlayer] = useState(false);
  const [createPartyDialogOpen, setCreatePartyDialogOpen] = useState(false);
  const [newPartyDescription, setNewPartyDescription] = useState("");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [disbandDialogOpen, setDisbandDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<PartyMemberData | null>(null);
  const [memberDetailOpen, setMemberDetailOpen] = useState(false);
  const partyVersionRef = useRef<number>(0);

  const { data: currentParty, isLoading: isLoadingParty } = useQuery<PartyData | null>({
    queryKey: ["/api/parties/current"],
    queryFn: async () => {
      try {
        const cached = queryClient.getQueryData<PartyData | null>(["/api/parties/current"]);
        const canUseVersion = partyVersionRef.current > 0 && cached !== undefined;
        const versionParam = canUseVersion ? `?sinceVersion=${partyVersionRef.current}` : '';
        const res = await apiRequest("GET", `/api/parties/current${versionParam}`);
        const data = await res.json();
        if (data.partyVersion) {
          partyVersionRef.current = data.partyVersion;
        }
        if (data.changed === false && cached !== undefined) {
          return cached;
        }
        return data.party || null;
      } catch (error: any) {
        if (error.message?.includes("404") || error.message?.includes("not in a party")) {
          partyVersionRef.current = 0;
          return null;
        }
        throw error;
      }
    },
    refetchInterval: 10000,
    staleTime: 5000,
    enabled: !isGuest,
  });

  const { data: pendingInvites = [] } = useQuery<PartyInviteData[]>({
    queryKey: ["/api/party-invites"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/party-invites");
      const data = await res.json();
      return data.invites || [];
    },
    enabled: !currentParty && !isGuest,
    refetchInterval: 30000,
  });

  const { sentInvites: partySentInvites, inviteMutation: partyInviteMutation, cancelInviteMutation: cancelSentInviteMutation } = usePartyInvites(currentParty?.id);

  const isPartyLeader = currentParty && player?.id === currentParty.leaderId;

  const { data: nearbyPlayers = [], isLoading: isLoadingNearby } = useQuery<Array<{
    id: string;
    username: string;
    avatar: string | null;
    totalLevel: number;
    currentRegion: string;
    isInCombat: number;
    currentMonsterId: string | null;
    activeSkill: string | null;
  }>>({
    queryKey: ["/api/nearby-players"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/nearby-players");
      const data = await res.json();
      return data.players || [];
    },
    refetchInterval: 30000,
    staleTime: 15000,
    enabled: !isGuest && (!currentParty || (isPartyLeader && (currentParty.members || []).length < currentParty.maxSize)),
  });

  const { data: publicParties = [], isLoading: isLoadingPublicParties } = useQuery<PublicPartyData[]>({
    queryKey: ["/api/parties/public"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/parties/public");
      const data = await res.json();
      return data.parties || [];
    },
    enabled: !currentParty && !isGuest,
    refetchInterval: 30000,
  });

  const createPartyMutation = useMutation({
    mutationFn: async (description?: string) => {
      const res = await apiRequest("POST", "/api/parties", { 
        description: description && description.trim() ? description.trim() : null 
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      setCreatePartyDialogOpen(false);
      setNewPartyDescription("");
      toast({ title: t(language, 'partyCreateParty') + "!" });
    },
    onError: (error: any) => {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    },
  });

  const leavePartyMutation = useMutation({
    mutationFn: async (partyId: string) => {
      const res = await apiRequest("POST", `/api/parties/${partyId}/leave`);
      return res.json();
    },
    onSuccess: (_data, partyId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      queryClient.removeQueries({ queryKey: ['/api/party', partyId, 'combat'] });
      setLeaveDialogOpen(false);
      toast({ title: t(language, 'partyLeaveParty') });
    },
    onError: (error: any) => {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
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
      toast({ title: t(language, 'partyJoinParty') + "!" });
    },
    onError: (error: any) => {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    },
  });

  const declineInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await apiRequest("POST", `/api/party-invites/${inviteId}/decline`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/party-invites"] });
      toast({ title: t(language, 'partyDecline') });
    },
    onError: (error: any) => {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
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
      toast({ title: t(language, 'partyJoinParty') + "!" });
    },
    onError: (error: any) => {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    },
  });


  const disbandMutation = useMutation({
    mutationFn: async (partyId: string) => {
      const res = await apiRequest("POST", `/api/parties/${partyId}/disband`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      setDisbandDialogOpen(false);
      toast({ title: t(language, 'partyDisbandParty') });
    },
    onError: (error: any) => {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    },
  });

  const togglePublicMutation = useMutation({
    mutationFn: async (partyId: string) => {
      const res = await apiRequest("POST", `/api/parties/${partyId}/toggle-public`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
    },
    onError: (error: any) => {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    },
  });

  const kickMemberMutation = useMutation({
    mutationFn: async ({ partyId, playerId }: { partyId: string; playerId: string }) => {
      const res = await apiRequest("POST", `/api/parties/${partyId}/kick/${playerId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      toast({ title: "Player kicked from party" });
    },
    onError: (error: any) => {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    },
  });

  const searchPlayers = useCallback(async () => {
    if (inviteUsername.length < 2) {
      toast({ title: "Enter at least 2 characters", variant: "destructive" });
      return;
    }
    setIsSearchingPlayer(true);
    try {
      const res = await apiRequest("GET", `/api/players/search?username=${encodeURIComponent(inviteUsername)}`);
      const data = await res.json();
      if (data.found && data.players) {
        const filteredPlayers = (data.players || []).filter((p: any) => 
          p.playerId !== player?.id && 
          !(currentParty?.members || []).some((m) => m.playerId === p.playerId)
        );
        setSearchResults(filteredPlayers);
        if (filteredPlayers.length === 0) {
          toast({ title: "No players found to invite" });
        }
      } else {
        setSearchResults([]);
        toast({ title: "Player not found" });
      }
    } catch (error) {
      toast({ title: "Search error", variant: "destructive" });
    } finally {
      setIsSearchingPlayer(false);
    }
  }, [inviteUsername, player?.id, currentParty?.members, toast]);

  const getMemberStatusDisplay = (member: PartyMemberData) => {
    const isOffline = member.isOnline !== 1;
    if (member.isInCombat === 1 && member.currentMonsterId) {
      const monsterName = getLocalizedMonsterName(language as Language, member.currentMonsterId);
      return { icon: Swords, color: isOffline ? "text-gray-400" : "text-red-400", label: monsterName || (language === 'tr' ? "Savaşta" : "In Combat") };
    }
    if (member.activeTask?.type === 'skill' && member.activeTask.skillType) {
      const SkillIcon = SKILL_ICONS[member.activeTask.skillType] || Circle;
      const skillName = member.activeTask.skillType.charAt(0).toUpperCase() + member.activeTask.skillType.slice(1);
      return { icon: SkillIcon, color: isOffline ? "text-gray-400" : "text-amber-400", label: skillName };
    }
    if (isOffline) {
      return { icon: Circle, color: "text-gray-500", label: language === 'tr' ? "Çevrimdışı" : "Offline" };
    }
    if (member.currentRegion) {
      const regionName = getLocalizedRegionName(language as Language, member.currentRegion);
      return { icon: Circle, color: "text-green-400", label: regionName || member.currentRegion.replace(/_/g, " ") };
    }
    return { icon: Circle, color: "text-green-400", label: language === 'tr' ? "Çevrimiçi" : "Online" };
  };

  if (isLoadingParty) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground text-sm">{t(language, 'loading')}</div>
      </div>
    );
  }

  if (isGuest) {
    return (
      <div className={cn("container max-w-4xl mx-auto p-4 space-y-6", isMobile && "pb-24")}>
        <Card className="bg-card/50 border-border">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <UsersThree className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-4">{t(language, 'partyTitle')}</h2>
            <GuestRestrictionBanner feature={getPartyFeatureText(language)} variant="card" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentParty) {
    return (
      <div className={cn("container max-w-4xl mx-auto p-4 space-y-6", isMobile && "pb-24")}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <UsersThree className="w-7 h-7 text-primary" weight="fill" />
            {t(language, 'partyTitle')}
          </h1>
        </div>

        <Card className="bg-card/50 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t(language, 'partyNoParty')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Join a party to fight alongside other players and earn bonus rewards!
            </p>
            <Button 
              onClick={() => setCreatePartyDialogOpen(true)}
              className="w-full"
              data-testid="button-create-party"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t(language, 'partyCreateParty')}
            </Button>
          </CardContent>
        </Card>

        {pendingInvites.length > 0 && (
          <Card className="bg-card/50 border-border border-amber-500/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <PaperPlaneTilt className="w-5 h-5 text-amber-400" />
                {t(language, 'partyPendingInvites')}
                <Badge variant="secondary" className="ml-2">{pendingInvites.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingInvites.map((invite) => (
                <div 
                  key={invite.id} 
                  className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border"
                  data-testid={`party-invite-${invite.id}`}
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {invite.partyName || `${invite.inviterUsername}'s Party`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      From: {invite.inviterUsername}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => declineInviteMutation.mutate(invite.id)}
                      disabled={declineInviteMutation.isPending}
                      data-testid={`decline-invite-${invite.id}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => acceptInviteMutation.mutate(invite.id)}
                      disabled={acceptInviteMutation.isPending}
                      data-testid={`accept-invite-${invite.id}`}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      {t(language, 'partyAccept')}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="bg-card/50 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Lightning className="w-5 h-5 text-green-400" weight="fill" />
              {t(language, 'nearbyPlayers')}
              {player?.currentRegion && (
                <Badge variant="outline" className="text-xs ml-2">
                  {getLocalizedRegionName(language as Language, player.currentRegion)}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingNearby ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                {t(language, 'loading')}
              </div>
            ) : nearbyPlayers.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                {t(language, 'nearbyPlayersEmpty')}
              </div>
            ) : (
              <ScrollArea className="max-h-[250px]">
                <div className="space-y-2">
                  {nearbyPlayers.map((np) => {
                    const avatarSrc = np.avatar ? AVATAR_MAP[np.avatar] : AVATAR_MAP['warrior'];
                    return (
                      <div 
                        key={np.id} 
                        className="flex items-center gap-3 p-2.5 bg-background/50 rounded-lg border border-border hover:border-primary/30 transition-colors"
                        data-testid={`nearby-player-${np.id}`}
                      >
                        <div className="relative">
                          <img 
                            src={avatarSrc} 
                            alt={np.username} 
                            className="w-10 h-10 rounded-full object-cover border-2 border-border"
                          />
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background bg-green-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground text-sm truncate">{np.username}</span>
                            <span className="text-xs text-muted-foreground">Lv. {np.totalLevel}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {np.isInCombat && np.currentMonsterId ? (
                              <span className="text-amber-400 flex items-center gap-1">
                                <Sword className="w-3 h-3" weight="fill" />
                                {getLocalizedMonsterName(language as Language, np.currentMonsterId)}
                              </span>
                            ) : np.activeSkill ? (
                              <span className="text-blue-400 capitalize flex items-center gap-1">
                                {(() => {
                                  const SkillIcon = SKILL_ICONS[np.activeSkill] || Package;
                                  return <SkillIcon className="w-3 h-3" />;
                                })()}
                                {np.activeSkill}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Idle</span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground px-2">Online</span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MagnifyingGlass className="w-5 h-5" />
              {t(language, 'partyPartyFinder')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingPublicParties ? (
              <div className="text-center py-8 text-muted-foreground">
                {t(language, 'loading')}
              </div>
            ) : publicParties.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No public parties available. Create your own!
              </div>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-3">
                  {publicParties.map((party) => (
                    <div 
                      key={party.id} 
                      className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border hover:border-primary/50 transition-colors"
                      data-testid={`public-party-${party.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {party.name || `${party.leaderUsername}'s Party`}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {(party.members || []).length}/{party.maxSize}
                          </Badge>
                        </div>
                        {party.description && (
                          <p className="text-xs text-muted-foreground mt-1">{party.description}</p>
                        )}
                        {party.regionId && (
                          <p className="text-xs text-primary/70 mt-1">
                            {getLocalizedRegionName(language as Language, party.regionId)}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => joinPartyMutation.mutate(party.id)}
                        disabled={joinPartyMutation.isPending || (party.members || []).length >= party.maxSize}
                        data-testid={`join-party-${party.id}`}
                      >
                        {t(language, 'partyJoinParty')}
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Dialog open={createPartyDialogOpen} onOpenChange={setCreatePartyDialogOpen}>
          <DialogContent aria-describedby={undefined} data-testid="create-party-dialog">
            <DialogHeader>
              <DialogTitle>{t(language, 'partyCreateParty')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  {t(language, 'partyDescription')}
                </label>
                <Input
                  value={newPartyDescription}
                  onChange={(e) => setNewPartyDescription(e.target.value.slice(0, 100))}
                  placeholder={t(language, 'partyDescriptionPlaceholder')}
                  maxLength={100}
                  data-testid="input-party-description"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t(language, 'partyDescriptionCharLimit').replace('{0}', String(newPartyDescription.length))}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreatePartyDialogOpen(false)}>
                {t(language, 'cancel')}
              </Button>
              <Button 
                onClick={() => createPartyMutation.mutate(newPartyDescription)}
                disabled={createPartyMutation.isPending}
                data-testid="button-confirm-create-party"
              >
                {t(language, 'partyCreateParty')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className={cn("container max-w-4xl mx-auto p-4 space-y-6", isMobile && "pb-24")}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <UsersThree className="w-7 h-7 text-primary" weight="fill" />
          {currentParty.name || t(language, 'partyTitle')}
        </h1>
        <div className="flex items-center gap-2">
          {currentParty.isPublic === 1 ? (
            <Badge variant="outline" className="text-green-400 border-green-500/50">
              <GlobeSimple className="w-3 h-3 mr-1" />
              Public
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <Lock className="w-3 h-3 mr-1" />
              Private
            </Badge>
          )}
        </div>
      </div>

      {currentParty.description && (
        <p className="text-sm text-muted-foreground -mt-4 mb-4">{currentParty.description}</p>
      )}

      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <UsersThree className="w-5 h-5" />
              {t(language, 'partyPartyMembers')}
              <Badge variant="secondary">{(currentParty.members || []).length}/{currentParty.maxSize}</Badge>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(currentParty.members || []).map((member) => {
            const isLeader = member.playerId === currentParty.leaderId;
            const isMe = member.playerId === player?.id;
            const subClass = getSubClass(member.cachedWeaponType, null);
            const status = getMemberStatusDisplay(member);
            const StatusIcon = status.icon;
            const avatarSrc = member.avatar ? AVATAR_MAP[member.avatar] : AVATAR_MAP['warrior'];

            return (
              <div
                key={member.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/40",
                  isMe ? "bg-violet-500/10 border-violet-500/30" : "bg-muted/20 border-border/30"
                )}
                data-testid={`party-member-${member.playerId}`}
                onClick={() => {
                  setSelectedMember(member);
                  setMemberDetailOpen(true);
                }}
              >
                <div className="relative">
                  <img
                    src={avatarSrc}
                    alt={member.username}
                    className="w-10 h-10 rounded-full object-cover border border-border"
                  />
                  <div className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
                    member.isOnline === 1 ? "bg-green-500" : "bg-gray-500"
                  )} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "font-medium truncate text-sm",
                      isMe && "text-violet-300"
                    )}>
                      {member.username}
                    </span>
                    {isLeader && <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" weight="fill" />}
                    {isMe && <Badge variant="secondary" className="text-[10px] px-1 py-0">You</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1" style={{ color: subClass.color }}>
                      <span className="text-xs">{subClass.icon}</span>
                      {subClass.name}
                    </span>
                    <span>•</span>
                    <span>Lv.{member.totalLevel}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-xs">
                    <StatusIcon className={cn("w-3 h-3 shrink-0", status.color)} />
                    <span className={cn("truncate", status.color)}>{status.label}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <PartyMemberDetailDialog
        member={selectedMember}
        party={currentParty ? { leaderId: currentParty.leaderId } : null}
        currentPlayerId={player?.id}
        isOpen={memberDetailOpen}
        onClose={() => setMemberDetailOpen(false)}
        onKick={(playerId) => { if (currentParty?.id) kickMemberMutation.mutate({ partyId: currentParty.id, playerId }); }}
      />

      <div className="p-3 rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-900/10 to-blue-900/10">
        <div className="flex items-center gap-2 mb-2">
          <Sparkle className="w-4 h-4 text-purple-400" weight="fill" />
          <span className="text-sm font-semibold text-purple-300">{language === 'tr' ? 'Parti Bonusları' : 'Party Bonuses'}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 cursor-help" data-testid="bonus-same-monster">
                  <Sword className="w-3 h-3 mr-1" weight="fill" />
                  {language === 'tr' ? 'Savaş' : 'Combat'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                <p className="font-medium text-amber-400 mb-1">{language === 'tr' ? 'Aynı Canavar Bonusu' : 'Same Monster Bonus'}</p>
                <p className="text-muted-foreground">{language === 'tr' ? 'Aynı canavarla savaşırken %40, farklı %25 loot paylaşımı' : '40% loot sharing on same monster, 25% on different'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="text-[10px] px-1.5 py-0.5 bg-green-500/15 text-green-400 border border-green-500/30 cursor-help" data-testid="bonus-loot">
                  <Package className="w-3 h-3 mr-1" weight="fill" />
                  Loot 25-40%
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                <p className="font-medium text-green-400 mb-1">{language === 'tr' ? 'Loot Paylaşımı' : 'Loot Sharing'}</p>
                <p className="text-muted-foreground">{language === 'tr' ? 'Aynı canavar %40, farklı canavar %25 loot paylaşım şansı' : '40% loot share on same monster, 25% on different'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="text-[10px] px-1.5 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/30 cursor-help" data-testid="bonus-tank">
                  <Shield className="w-3 h-3 mr-1" weight="fill" />
                  Tank +15% DEF
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[180px]">
                <p className="font-medium text-blue-400 mb-1">Tank Passive</p>
                <p className="text-muted-foreground">{language === 'tr' ? '1. Tank +15%, 2. +7%, 3.+ +3% Savunma' : '1st tank +15%, 2nd +7%, 3rd+ +3% Defense'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="text-[10px] px-1.5 py-0.5 bg-red-500/15 text-red-400 border border-red-500/30 cursor-help" data-testid="bonus-dps">
                  <Lightning className="w-3 h-3 mr-1" weight="fill" />
                  DPS +10% ATK
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[180px]">
                <p className="font-medium text-red-400 mb-1">DPS Passive</p>
                <p className="text-muted-foreground">{language === 'tr' ? '1. DPS +10%, 2. +5%, 3.+ +2% Saldırı' : '1st DPS +10%, 2nd +5%, 3rd+ +2% Attack'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="text-[10px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 cursor-help" data-testid="bonus-healer">
                  <Heart className="w-3 h-3 mr-1" weight="fill" />
                  Heal +20%
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[180px]">
                <p className="font-medium text-emerald-400 mb-1">Healer Passive</p>
                <p className="text-muted-foreground">{language === 'tr' ? '1. İyileştirici +20%, 2. +10%, 3.+ +5% Yemek İyileştirme' : '1st healer +20%, 2nd +10%, 3rd+ +5% Food Healing'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {isPartyLeader && (currentParty.members || []).length < currentParty.maxSize && (
        <Card className="bg-card/50 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightning className="w-4 h-4 text-green-400" weight="fill" />
              {t(language, 'nearbyPlayers')}
              {player?.currentRegion && (
                <Badge variant="outline" className="text-[10px] ml-1">
                  {getLocalizedRegionName(language as Language, player.currentRegion)}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingNearby ? (
              <div className="text-center py-3 text-muted-foreground text-xs">{t(language, 'loading')}</div>
            ) : nearbyPlayers.length === 0 ? (
              <div className="text-center py-3 text-muted-foreground text-xs">{t(language, 'nearbyPlayersEmpty')}</div>
            ) : (
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-1.5">
                  {nearbyPlayers.filter(np => !(currentParty.members || []).some((m: any) => m.playerId === np.id)).map((np) => {
                    const avatarSrc = np.avatar ? AVATAR_MAP[np.avatar] : AVATAR_MAP['warrior'];
                    return (
                      <div
                        key={np.id}
                        className="flex items-center gap-2.5 p-2 bg-background/50 rounded-lg border border-border hover:border-primary/30 transition-colors"
                        data-testid={`nearby-player-inparty-${np.id}`}
                      >
                        <div className="relative">
                          <img src={avatarSrc} alt={np.username} className="w-8 h-8 rounded-full object-cover border border-border" />
                          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background bg-green-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground text-xs truncate">{np.username}</span>
                            <span className="text-[10px] text-muted-foreground">Lv.{np.totalLevel}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {np.isInCombat && np.currentMonsterId ? (
                              <span className="text-amber-400 flex items-center gap-0.5">
                                <Sword className="w-2.5 h-2.5" weight="fill" />
                                {getLocalizedMonsterName(language as Language, np.currentMonsterId)}
                              </span>
                            ) : np.activeSkill ? (
                              <span className="text-blue-400 capitalize">{np.activeSkill}</span>
                            ) : (
                              <span>Idle</span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[10px] h-6 px-2"
                          onClick={() => partyInviteMutation.mutate(np.id)}
                          disabled={partyInviteMutation.isPending}
                          data-testid={`invite-nearby-inparty-${np.id}`}
                        >
                          <PaperPlaneTilt className="w-3 h-3 mr-0.5" />
                          {t(language, 'partyInvite')}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {partySentInvites.length > 0 && (
        <Card className="bg-card/50 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <PaperPlaneTilt className="w-5 h-5" />
              {t(language, 'partyPendingInvites')}
              <Badge variant="secondary">{partySentInvites.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {partySentInvites.map((invite) => (
              <div 
                key={invite.id} 
                className="flex items-center justify-between p-2 bg-background/50 rounded-lg border border-border"
                data-testid={`sent-invite-${invite.id}`}
              >
                <span className="text-sm text-foreground">{invite.invitee.username}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300"
                  onClick={() => cancelSentInviteMutation.mutate(invite.id)}
                  disabled={cancelSentInviteMutation.isPending}
                  data-testid={`cancel-invite-${invite.id}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setInviteDialogOpen(true)}
            data-testid="button-invite-player"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t(language, 'partyInvitePlayer')}
          </Button>

          {isPartyLeader && (
            <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border">
              <span className="text-sm text-foreground">Party Visibility</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {currentParty.isPublic === 1 ? "Public" : "Private"}
                </span>
                <Switch
                  checked={currentParty.isPublic === 1}
                  onCheckedChange={() => { if (currentParty?.id) togglePublicMutation.mutate(currentParty.id); }}
                  disabled={togglePublicMutation.isPending}
                  data-testid="switch-party-visibility"
                />
              </div>
            </div>
          )}

          <Separator />

          <Button
            variant="outline"
            className="w-full justify-start text-amber-400 hover:text-amber-300 border-amber-500/30 hover:border-amber-500/50"
            onClick={() => setLeaveDialogOpen(true)}
            data-testid="button-leave-party"
          >
            <SignOut className="w-4 h-4 mr-2" />
            {t(language, 'partyLeaveParty')}
          </Button>

          {isPartyLeader && (
            <Button
              variant="outline"
              className="w-full justify-start text-red-400 hover:text-red-300 border-red-500/30 hover:border-red-500/50"
              onClick={() => setDisbandDialogOpen(true)}
              data-testid="button-disband-party"
            >
              <UserMinus className="w-4 h-4 mr-2" />
              {t(language, 'partyDisbandParty')}
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent aria-describedby={undefined} data-testid="invite-player-dialog">
          <DialogHeader>
            <DialogTitle>{t(language, 'partyInvitePlayer')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter username..."
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchPlayers()}
                data-testid="input-invite-username"
              />
              <Button 
                onClick={searchPlayers}
                disabled={isSearchingPlayer}
                data-testid="button-search-players"
              >
                <MagnifyingGlass className="w-4 h-4" />
              </Button>
            </div>
            {searchResults.length > 0 && (
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-2">
                  {searchResults.map((result) => (
                    <div 
                      key={result.playerId}
                      className="flex items-center justify-between p-2 bg-background/50 rounded-lg border border-border"
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          result.isOnline ? "bg-green-500" : "bg-gray-500"
                        )} />
                        <span className="text-sm text-foreground">{result.username}</span>
                        <span className="text-xs text-muted-foreground">Lv. {result.totalLevel}</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => { partyInviteMutation.mutate(result.playerId); setInviteUsername(""); setSearchResults([]); }}
                        disabled={partyInviteMutation.isPending}
                        data-testid={`invite-player-${result.playerId}`}
                      >
                        Invite
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent aria-describedby={undefined} data-testid="leave-party-dialog">
          <DialogHeader>
            <DialogTitle>{t(language, 'partyLeaveDialogTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to leave this party?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>
              {t(language, 'cancel')}
            </Button>
            <Button 
              variant="destructive"
              onClick={() => { if (currentParty?.id) leavePartyMutation.mutate(currentParty.id); }}
              disabled={leavePartyMutation.isPending || !currentParty?.id}
              data-testid="button-confirm-leave"
            >
              {t(language, 'partyLeaveParty')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disbandDialogOpen} onOpenChange={setDisbandDialogOpen}>
        <DialogContent aria-describedby={undefined} data-testid="disband-party-dialog">
          <DialogHeader>
            <DialogTitle>{t(language, 'partyDisbandParty')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to disband this party? All members will be removed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisbandDialogOpen(false)}>
              {t(language, 'cancel')}
            </Button>
            <Button 
              variant="destructive"
              onClick={() => { if (currentParty?.id) disbandMutation.mutate(currentParty.id); }}
              disabled={disbandMutation.isPending || !currentParty?.id}
              data-testid="button-confirm-disband"
            >
              {t(language, 'partyDisbandParty')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getPartyFeatureText(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "party features",
    zh: "组队功能",
    hi: "पार्टी सुविधाएं",
    es: "funciones de grupo",
    fr: "les fonctionnalités de groupe",
    ar: "ميزات الحفلة",
    ru: "функции группы",
    tr: "parti özellikleri",
  };
  return texts[lang];
}
