import { useState, useEffect, useRef } from "react";
import { useGuild } from "@/context/GuildContext";
import { useGame } from "@/context/GameContext";
import PartyMemberDetailDialog from "@/components/game/PartyMemberDetailDialog";
import type { PartyMemberData } from "@/components/game/PartyMemberDetailDialog";
import { trackGuildContribution, trackChatMessage } from "@/hooks/useAchievementTracker";
import { useLanguage } from "@/context/LanguageContext";
import { t } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { UsersThree, Crown, Shield, User, Chat, Gear, Trophy, ArrowUp, MagnifyingGlass, Plus, SignOut, UserMinus, Star, Coins, Clock, ArrowClockwise, PaperPlaneTilt, Megaphone, Check, X, ShieldStar, Info } from "@phosphor-icons/react";
import { GoldDisplay } from "@/components/game/GoldDisplay";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GUILD_EMBLEMS, GUILD_UPGRADES, getGuildLevelXp, GUILD_CREATION_COST, getUpgradeResourceCosts, canAffordUpgrade, type GuildBankResources, EMPTY_GUILD_BANK } from "@shared/schema";
import { getItemImage } from "@/lib/itemImages";
import { ITEMS } from "@/lib/items-data";
import { formatNumber } from "@/lib/gameMath";
import { useToast } from "@/hooks/use-toast";
import { useMobile } from "@/hooks/useMobile";

const GUILD_UPGRADE_TRANSLATION_KEYS: Record<string, { name: string; desc: string }> = {
  member_capacity: { name: 'guildUpgMemberCapacity', desc: 'guildUpgMemberCapacityDesc' },
  gathering_bonus: { name: 'guildUpgGatheringBonus', desc: 'guildUpgGatheringBonusDesc' },
  idle_bonus: { name: 'guildUpgIdleBonus', desc: 'guildUpgIdleBonusDesc' },
  xp_bonus: { name: 'guildUpgXpBonus', desc: 'guildUpgXpBonusDesc' },
  gold_bonus: { name: 'guildUpgGoldBonus', desc: 'guildUpgGoldBonusDesc' },
  loot_bonus: { name: 'guildUpgLootBonus', desc: 'guildUpgLootBonusDesc' },
  combat_power: { name: 'guildUpgCombatPower', desc: 'guildUpgCombatPowerDesc' },
  defense_power: { name: 'guildUpgDefensePower', desc: 'guildUpgDefensePowerDesc' },
  crafting_bonus: { name: 'guildUpgCraftingBonus', desc: 'guildUpgCraftingBonusDesc' },
};

const EMBLEM_ICONS: Record<string, string> = {
  shield: "🛡️",
  sword: "⚔️",
  crown: "👑",
  dragon: "🐉",
  lion: "🦁",
  eagle: "🦅",
  wolf: "🐺",
  bear: "🐻",
  phoenix: "🔥",
  skull: "💀",
  star: "⭐",
  flame: "🔥",
};

const ROLE_COLORS: Record<string, string> = {
  leader: "text-yellow-400",
  officer: "text-blue-400",
  member: "text-gray-400",
};

const LANGUAGE_TO_LOCALE: Record<string, string> = {
  en: 'en-US',
  zh: 'zh-CN',
  hi: 'hi-IN',
  es: 'es-ES',
  fr: 'fr-FR',
  ar: 'ar-SA',
  ru: 'ru-RU',
  tr: 'tr-TR',
};

export default function GuildPage() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const { gold, player, inventory } = useGame();
  const { isMobile } = useMobile();
  
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'leader': return t(language, 'roleLeader');
      case 'officer': return t(language, 'roleOfficer');
      case 'member': return t(language, 'roleMember');
      default: return role;
    }
  };
  const {
    myGuild,
    myMembership,
    myUpgrades,
    isInGuild,
    isLoading,
    allGuilds,
    isLoadingGuilds,
    refetchGuilds,
    messages,
    isLoadingMessages,
    refetchMessages,
    joinRequests,
    isLoadingRequests,
    createGuild,
    isCreatingGuild,
    joinGuild,
    leaveGuild,
    kickMember,
    updateMemberRole,
    transferLeadership,
    disbandGuild,
    respondToRequest,
    sendMessage,
    purchaseUpgrade,
    updateGuildSettings,
    refetchMyGuild,
    guildDetails,
    guildMembers,
    fetchGuildDetails,
    sentInvites,
    cancelInvite,
    sendInvite,
  } = useGuild();

  const [searchTerm, setSearchTerm] = useState("");
  const [inviteSearchTerm, setInviteSearchTerm] = useState("");
  const [inviteSearchResults, setInviteSearchResults] = useState<{ playerId: string; username: string; isOnline: boolean; totalLevel: number }[]>([]);
  const [isSearchingPlayers, setIsSearchingPlayers] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newGuildName, setNewGuildName] = useState("");
  const [newGuildDesc, setNewGuildDesc] = useState("");
  const [newGuildEmblem, setNewGuildEmblem] = useState("shield");
  const [newGuildColor, setNewGuildColor] = useState("#8b5cf6");
  const [newGuildEntryType, setNewGuildEntryType] = useState<"public" | "request" | "invite">("request");
  const [newGuildMinLevel, setNewGuildMinLevel] = useState(10);
  const [chatMessage, setChatMessage] = useState("");
  const [selectedTab, setSelectedTab] = useState("overview");
  const [selectedMember, setSelectedMember] = useState<PartyMemberData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Scroll chat to bottom
  const scrollChatToBottom = (smooth = true) => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'instant'
      });
    }
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (selectedTab === 'chat' && messages.length > 0) {
      scrollChatToBottom(true);
    }
  }, [messages, selectedTab]);

  // Scroll to bottom immediately when entering chat tab
  useEffect(() => {
    if (selectedTab === 'chat') {
      setTimeout(() => scrollChatToBottom(false), 50);
    }
  }, [selectedTab]);

  // Auto-fetch guild details when entering guild page
  useEffect(() => {
    if (myGuild?.id) {
      fetchGuildDetails(myGuild.id);
    }
  }, [myGuild?.id, fetchGuildDetails]);

  const handleCreateGuild = async () => {
    try {
      await createGuild({
        name: newGuildName,
        description: newGuildDesc || undefined,
        emblem: newGuildEmblem,
        emblemColor: newGuildColor,
        entryType: newGuildEntryType,
        minTotalLevel: newGuildMinLevel,
      });
      setCreateDialogOpen(false);
      setNewGuildName("");
      setNewGuildDesc("");
      toast({ title: t(language, 'guildCreated') });
    } catch (error: any) {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    }
  };

  const handleJoinGuild = async (guildId: string) => {
    try {
      const result = await joinGuild(guildId);
      if (result.joined) {
        toast({ title: t(language, 'joinedGuild') });
      } else if (result.requestSent) {
        toast({ title: t(language, 'applicationSent') });
      }
    } catch (error: any) {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    }
  };

  const handleLeaveGuild = async () => {
    try {
      await leaveGuild();
      toast({ title: t(language, 'leftGuild') });
    } catch (error: any) {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    }
  };

  const handleSendMessage = async () => {
    if (!chatMessage.trim()) return;
    try {
      await sendMessage(chatMessage.trim());
      trackChatMessage();
      setChatMessage("");
    } catch (error: any) {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    }
  };

  const handleRespondToRequest = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      await respondToRequest(requestId, action);
      toast({ title: action === 'accept' ? t(language, 'applicationAccepted') : t(language, 'applicationRejected') });
    } catch (error: any) {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    }
  };

  const searchPlayersForInvite = async () => {
    if (inviteSearchTerm.length < 2) {
      toast({ title: t(language, 'minCharsEnter'), variant: "destructive" });
      return;
    }
    setIsSearchingPlayers(true);
    try {
      const res = await fetch(`/api/players/search?username=${encodeURIComponent(inviteSearchTerm)}`);
      const data = await res.json();
      if (data.found && data.players) {
        const filteredPlayers = (data.players || []).filter((p: any) => 
          p.playerId !== player?.id && 
          !(guildMembers ?? []).some((m) => m.playerId === p.playerId) &&
          !sentInvites.some((i) => i.targetPlayerId === p.playerId)
        );
        setInviteSearchResults(filteredPlayers);
        if (filteredPlayers.length === 0) {
          toast({ title: t(language, 'noPlayersToInvite') });
        }
      } else {
        setInviteSearchResults([]);
        toast({ title: t(language, 'playerNotFoundShort') });
      }
    } catch (error) {
      toast({ title: t(language, 'searchError'), variant: "destructive" });
    } finally {
      setIsSearchingPlayers(false);
    }
  };

  const handleSendInviteFromSearch = async (targetPlayerId: string) => {
    setIsSendingInvite(true);
    try {
      await sendInvite(targetPlayerId);
      toast({ title: t(language, 'inviteSentSuccess') });
      setInviteSearchResults(prev => prev.filter(p => p.playerId !== targetPlayerId));
    } catch (error: any) {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handlePurchaseUpgrade = async (upgradeType: string) => {
    try {
      await purchaseUpgrade(upgradeType);
      trackGuildContribution();
      toast({ title: t(language, 'upgradePurchased') });
    } catch (error: any) {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    }
  };

  const filteredGuilds = allGuilds.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );
  }

  if (!isInGuild) {
    return (
        <div className={cn("p-4 md:p-6 space-y-6", isMobile && "pb-24")}>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <UsersThree className="w-7 h-7 text-primary" weight="fill" />
              {t(language, 'guilds')}
            </h1>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-guild">
                  <Plus className="w-4 h-4 mr-2" /> {t(language, 'createGuild')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{t(language, 'newGuildCreate')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground">{t(language, 'guildName')}</label>
                    <Input 
                      value={newGuildName}
                      onChange={(e) => setNewGuildName(e.target.value)}
                      placeholder={t(language, 'guildNamePlaceholder')}
                      maxLength={32}
                      data-testid="input-guild-name"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">{t(language, 'description')}</label>
                    <Textarea 
                      value={newGuildDesc}
                      onChange={(e) => setNewGuildDesc(e.target.value)}
                      placeholder={t(language, 'guildDescPlaceholder')}
                      rows={3}
                      data-testid="input-guild-description"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">{t(language, 'emblem')}</label>
                      <Select value={newGuildEmblem} onValueChange={setNewGuildEmblem}>
                        <SelectTrigger data-testid="select-guild-emblem">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GUILD_EMBLEMS.map(emblem => (
                            <SelectItem key={emblem} value={emblem}>
                              {EMBLEM_ICONS[emblem]} {emblem}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">{t(language, 'color')}</label>
                      <Input 
                        type="color"
                        value={newGuildColor}
                        onChange={(e) => setNewGuildColor(e.target.value)}
                        className="h-10 p-1"
                        data-testid="input-guild-color"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">{t(language, 'entryType')}</label>
                      <Select value={newGuildEntryType} onValueChange={(v) => setNewGuildEntryType(v as any)}>
                        <SelectTrigger data-testid="select-entry-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">{t(language, 'entryPublic')}</SelectItem>
                          <SelectItem value="request">{t(language, 'entryRequest')}</SelectItem>
                          <SelectItem value="invite">{t(language, 'entryInvite')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">{t(language, 'minLevel')}</label>
                      <Input 
                        type="number"
                        value={newGuildMinLevel}
                        onChange={(e) => setNewGuildMinLevel(parseInt(e.target.value) || 0)}
                        min={0}
                        data-testid="input-min-level"
                      />
                    </div>
                  </div>
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-2">
                    <span className="text-sm">{t(language, 'cost')}:</span>
                    <GoldDisplay amount={GUILD_CREATION_COST} size="md" />
                    {gold < GUILD_CREATION_COST && (
                      <span className="text-xs text-red-400 ml-auto">{t(language, 'insufficientGoldShort')}</span>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    onClick={handleCreateGuild}
                    disabled={!newGuildName || newGuildName.length < 3 || gold < GUILD_CREATION_COST || isCreatingGuild}
                    data-testid="button-confirm-create-guild"
                  >
                    {isCreatingGuild ? t(language, 'creatingGuild') : t(language, 'createGuild')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input 
              placeholder={t(language, 'searchGuilds')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-guilds"
            />
          </div>

          {isLoadingGuilds ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredGuilds.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UsersThree className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t(language, 'noGuildsYet')}</p>
            </div>
          ) : (
            <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "md:grid-cols-2 lg:grid-cols-3")}>
              {filteredGuilds.map(guild => (
                <Card key={guild.id} className="hover:border-primary/50 transition-colors" data-testid={`guild-card-${guild.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div 
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                        style={{ backgroundColor: `${guild.emblemColor}20`, borderColor: guild.emblemColor, borderWidth: 2 }}
                      >
                        {EMBLEM_ICONS[guild.emblem] || "🛡️"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold truncate">{guild.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Trophy className="w-4 h-4" /> Lv.{guild.level}
                          </span>
                          <span className="flex items-center gap-1">
                            <UsersThree className="w-4 h-4" /> {guild.memberCount}/{guild.baseMemberLimit}
                          </span>
                        </div>
                        {guild.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{guild.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {guild.entryType === 'public' ? t(language, 'entryPublic') : guild.entryType === 'request' ? t(language, 'entryRequest') : t(language, 'entryInvite')}
                      </Badge>
                      <Button 
                        size="sm"
                        onClick={() => handleJoinGuild(guild.id)}
                        disabled={guild.entryType === 'invite' || (player?.totalLevel || 0) < guild.minTotalLevel}
                        data-testid={`button-join-${guild.id}`}
                      >
                        {guild.entryType === 'public' ? t(language, 'join') : guild.entryType === 'request' ? t(language, 'apply') : t(language, 'inviteRequired')}
                      </Button>
                    </div>
                    {(player?.totalLevel || 0) < guild.minTotalLevel && (
                      <p className="text-xs text-red-400 mt-2">{t(language, 'minLevel')}: {guild.minTotalLevel}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
    );
  }

  const guildXpNeeded = getGuildLevelXp(myGuild?.level || 1);
  const guildXpProgress = ((myGuild?.xp || 0) / guildXpNeeded) * 100;

  return (
    <>
      <div className={cn("p-4 md:p-6 space-y-6", isMobile && "pb-24")}>
        <div className="flex items-start gap-4">
          <div 
            className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl shrink-0"
            style={{ backgroundColor: `${myGuild?.emblemColor}20`, borderColor: myGuild?.emblemColor, borderWidth: 2 }}
          >
            {EMBLEM_ICONS[myGuild?.emblem || 'shield']}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-display font-bold truncate">{myGuild?.name}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Trophy className="w-4 h-4 text-yellow-400" /> {t(language, 'level')} {myGuild?.level}
              </span>
              <span className="flex items-center gap-1">
                <UsersThree className="w-4 h-4" /> {myGuild?.memberCount} {t(language, 'members')}
              </span>
              <Badge className={cn(ROLE_COLORS[myMembership?.role || 'member'])}>
                {getRoleLabel(myMembership?.role || 'member')}
              </Badge>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={guildXpProgress} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatNumber(myGuild?.xp || 0)} / {formatNumber(guildXpNeeded)} XP
              </span>
            </div>
          </div>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className={cn("w-full justify-start overflow-x-auto", isMobile && "flex-nowrap pb-1")}>
            <TabsTrigger value="overview" data-testid="tab-overview" className={cn(isMobile && "text-xs px-2")}>
              <Shield className={cn("mr-1", isMobile ? "w-3 h-3" : "w-4 h-4")} /> {t(language, 'overview')}
            </TabsTrigger>
            <TabsTrigger value="members" data-testid="tab-members" className={cn(isMobile && "text-xs px-2")}>
              <UsersThree className={cn("mr-1", isMobile ? "w-3 h-3" : "w-4 h-4")} /> {t(language, 'members')}
            </TabsTrigger>
            <TabsTrigger value="chat" data-testid="tab-chat" className={cn(isMobile && "text-xs px-2")}>
              <Chat className={cn("mr-1", isMobile ? "w-3 h-3" : "w-4 h-4")} /> {t(language, 'chat')}
            </TabsTrigger>
            <TabsTrigger value="upgrades" data-testid="tab-upgrades" className={cn(isMobile && "text-xs px-2")}>
              <ArrowUp className={cn("mr-1", isMobile ? "w-3 h-3" : "w-4 h-4")} /> {isMobile ? t(language, 'bonus') : t(language, 'upgrades')}
            </TabsTrigger>
            {(myMembership?.role === 'leader' || myMembership?.role === 'officer') && (
              <TabsTrigger value="manage" data-testid="tab-manage" className={cn(isMobile && "text-xs px-2")}>
                <Gear className={cn("mr-1", isMobile ? "w-3 h-3" : "w-4 h-4")} /> {isMobile ? t(language, 'manage') : t(language, 'management')}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t(language, 'guildInfo')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {myGuild?.description && (
                  <p className="text-muted-foreground">{myGuild.description}</p>
                )}
                <div className={cn("grid gap-3", isMobile ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4 gap-4")}>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground">{t(language, 'totalContribution')}</div>
                    <div className="text-lg font-bold">{formatNumber(myGuild?.totalContribution || 0)}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground">{t(language, 'yourContribution')}</div>
                    <div className="text-lg font-bold">{formatNumber(myMembership?.totalContribution || 0)}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground">{t(language, 'dailyContribution')}</div>
                    <div className="text-lg font-bold">{formatNumber(myMembership?.dailyContribution || 0)} / 10,000</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs text-muted-foreground">{t(language, 'entryType')}</div>
                    <div className="text-lg font-bold capitalize">
                      {myGuild?.entryType === 'public' ? t(language, 'entryPublic') : myGuild?.entryType === 'request' ? t(language, 'entryRequest') : t(language, 'entryInvite')}
                    </div>
                  </div>
                </div>

                {myMembership?.role !== 'leader' && (
                  <Button variant="destructive" size="sm" onClick={handleLeaveGuild} data-testid="button-leave-guild">
                    <SignOut className="w-4 h-4 mr-2" /> {t(language, 'leaveGuild')}
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t(language, 'activeBonuses')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {Object.entries(GUILD_UPGRADES).map(([key, upgrade]) => {
                    const current = myUpgrades.find(u => u.upgradeType === key);
                    const level = current?.level || 0;
                    const effect = level > 0 ? upgrade.effect(level) : 0;
                    return (
                      <div key={key} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                        <span className="text-sm">{t(language, (GUILD_UPGRADE_TRANSLATION_KEYS[key]?.name || key) as any)}</span>
                        <span className={cn("text-sm font-bold", level > 0 ? "text-green-400" : "text-muted-foreground")}>
                          {level > 0 ? `+${effect}%` : t(language, 'none')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="members">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">{t(language, 'members')} ({myGuild?.memberCount})</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => fetchGuildDetails(myGuild?.id || '')}>
                  <ArrowClockwise className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className={cn(isMobile ? "h-[calc(100vh-320px)]" : "h-[400px]")}>
                  <div className="space-y-2">
                    {guildMembers.map((member) => (
                      <div 
                        key={member.id}
                        className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                        data-testid={`member-row-${member.playerId}`}
                        onClick={() => {
                          setSelectedMember({
                            id: member.playerId,
                            playerId: member.playerId,
                            username: member.player.username,
                            role: 'dps',
                            position: 0,
                            isReady: 0,
                            totalLevel: member.player.totalLevel,
                          });
                          setDetailOpen(true);
                        }}
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          {member.role === 'leader' ? (
                            <Crown className="w-5 h-5 text-yellow-400" weight="fill" />
                          ) : member.role === 'officer' ? (
                            <ShieldStar className="w-5 h-5 text-blue-400" weight="fill" />
                          ) : (
                            <User className="w-5 h-5 text-muted-foreground" weight="fill" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold truncate">{member.player.username}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>Lv.{member.player.totalLevel}</span>
                            <span>{t(language, 'contribution')}: {formatNumber(member.totalContribution)}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn("text-xs", ROLE_COLORS[member.role])}>
                          {getRoleLabel(member.role)}
                        </Badge>
                        {myMembership?.role === 'leader' && member.role !== 'leader' && (
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => updateMemberRole(member.playerId, member.role === 'officer' ? 'member' : 'officer')}
                              title={member.role === 'officer' ? t(language, 'makeMember') : t(language, 'makeOfficer')}
                            >
                              <Star className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => kickMember(member.playerId)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <UserMinus className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chat">
            <Card className={cn("flex flex-col overflow-hidden", isMobile ? "h-[400px]" : "h-[500px]")}>
              <CardHeader className="py-3 shrink-0">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Chat className="w-5 h-5" /> {t(language, 'guildChat')}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col min-h-0 px-3 pb-3 overflow-hidden">
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto min-h-0">
                  <div className="flex flex-col gap-1 px-1">
                    {[...messages].reverse().map((msg) => {
                      const isOwnMessage = msg.playerId === player?.id;
                      const isSystem = msg.messageType === 'system';
                      const isAnnouncement = msg.messageType === 'announcement';
                      
                      if (isSystem) {
                        return (
                          <div key={msg.id} className="flex justify-center my-1">
                            <span className="text-xs text-muted-foreground italic bg-muted/30 px-2 py-1 rounded-full">
                              {msg.content} · {new Date(msg.createdAt!).toLocaleTimeString(LANGUAGE_TO_LOCALE[language] || 'en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        );
                      }
                      
                      if (isAnnouncement) {
                        return (
                          <div key={msg.id} className="flex justify-center my-2">
                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 max-w-[85%]">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <Megaphone className="w-3.5 h-3.5 text-yellow-400" />
                                <span className="font-semibold text-xs text-yellow-400">{msg.playerName}</span>
                              </div>
                              <p className="text-sm">{msg.content}</p>
                              <span className="text-[10px] text-yellow-400/70 block text-right mt-1">
                                {new Date(msg.createdAt!).toLocaleTimeString(LANGUAGE_TO_LOCALE[language] || 'en-US', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        );
                      }
                      
                      return (
                        <div 
                          key={msg.id}
                          className={cn(
                            "flex",
                            isOwnMessage ? "justify-end" : "justify-start"
                          )}
                        >
                          <div 
                            className={cn(
                              "max-w-[75%] px-3 py-1.5 rounded-2xl",
                              isOwnMessage 
                                ? "bg-primary/80 text-primary-foreground rounded-br-sm" 
                                : "bg-muted/70 rounded-bl-sm"
                            )}
                          >
                            {!isOwnMessage && (
                              <button
                                className="text-xs font-semibold text-muted-foreground block mb-0.5 hover:text-foreground transition-colors text-left"
                                onClick={() => {
                                  setSelectedMember({
                                    id: msg.playerId,
                                    playerId: msg.playerId,
                                    username: msg.playerName,
                                    role: 'dps',
                                    position: 0,
                                    isReady: 0,
                                    totalLevel: 0,
                                  });
                                  setDetailOpen(true);
                                }}
                                data-testid={`chat-sender-${msg.id}`}
                              >
                                {msg.playerName}
                              </button>
                            )}
                            <p className="text-sm break-words">{msg.content}</p>
                            <span className={cn(
                              "text-[10px] block text-right mt-0.5",
                              isOwnMessage ? "text-primary-foreground/70" : "text-muted-foreground"
                            )}>
                              {new Date(msg.createdAt!).toLocaleTimeString(LANGUAGE_TO_LOCALE[language] || 'en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {messages.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground">
                        <Chat className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>{t(language, 'noMessagesYet')}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-2 pt-2 border-t border-border">
                  <Input 
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder={t(language, 'writeMessage')}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    maxLength={500}
                    className="rounded-full"
                    data-testid="input-chat-message"
                  />
                  <Button onClick={handleSendMessage} size="icon" className="rounded-full shrink-0" data-testid="button-send-message">
                    <PaperPlaneTilt className="w-5 h-5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="upgrades">
            {/* Bank Resources Display */}
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Coins className="w-5 h-5 text-yellow-400" />
                  {t(language, 'guildBank')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const bankResources = (myGuild?.bankResources as GuildBankResources) || EMPTY_GUILD_BANK;
                  const resourceInfo: Record<string, { label: string; color: string; description: string; examples: string }> = {
                    gold: { 
                      label: t(language, 'goldResource'), 
                      color: 'text-yellow-400',
                      description: t(language, 'goldResourceDesc'),
                      examples: t(language, 'goldResourceExamples')
                    },
                    wood: { 
                      label: t(language, 'woodResource'), 
                      color: 'text-amber-600',
                      description: t(language, 'woodResourceDesc'),
                      examples: t(language, 'woodResourceExamples')
                    },
                    ore: { 
                      label: t(language, 'oreResource'), 
                      color: 'text-slate-400',
                      description: t(language, 'oreResourceDesc'),
                      examples: t(language, 'oreResourceExamples')
                    },
                    metal: { 
                      label: t(language, 'metalResource'), 
                      color: 'text-gray-300',
                      description: t(language, 'metalResourceDesc'),
                      examples: t(language, 'metalResourceExamples')
                    },
                    food: { 
                      label: t(language, 'foodResource'), 
                      color: 'text-red-400',
                      description: t(language, 'foodResourceDesc'),
                      examples: t(language, 'foodResourceExamples')
                    },
                    monster: { 
                      label: t(language, 'monsterResource'), 
                      color: 'text-purple-400',
                      description: t(language, 'monsterResourceDesc'),
                      examples: t(language, 'monsterResourceExamples')
                    },
                    rare: { 
                      label: t(language, 'rareResource'), 
                      color: 'text-cyan-400',
                      description: t(language, 'rareResourceDesc'),
                      examples: t(language, 'rareResourceExamples')
                    },
                  };
                  
                  const ResourceInfoIcon = ({ resourceKey, info }: { resourceKey: string; info: typeof resourceInfo[string] }) => {
                    const content = (
                      <div className="p-2 max-w-[200px]">
                        <p className="font-semibold text-sm mb-1">{info.label}</p>
                        <p className="text-xs text-muted-foreground mb-2">{info.description}</p>
                        <p className="text-xs"><span className="text-muted-foreground">{t(language, 'examples')}:</span> {info.examples}</p>
                      </div>
                    );
                    
                    if (isMobile) {
                      return (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="ml-1 opacity-60 hover:opacity-100 transition-opacity">
                              <Info className="w-3 h-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" side="top">
                            {content}
                          </PopoverContent>
                        </Popover>
                      );
                    }
                    
                    return (
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="ml-1 opacity-60 hover:opacity-100 transition-opacity cursor-help">
                              <Info className="w-3 h-3 inline" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="p-0">
                            {content}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  };
                  
                  return (
                    <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
                      {Object.entries(resourceInfo).map(([key, info]) => (
                        <div key={key} className="flex flex-col items-center p-2 bg-muted/30 rounded-lg">
                          <span className={cn("text-xs flex items-center", info.color)}>
                            {info.label}
                            <ResourceInfoIcon resourceKey={key} info={info} />
                          </span>
                          <span className="font-bold">{formatNumber(bankResources[key as keyof GuildBankResources] || 0)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {t(language, 'membersContributePassively')}
                </p>
              </CardContent>
            </Card>
            
            <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "md:grid-cols-2")}>
              {Object.entries(GUILD_UPGRADES).map(([key, upgrade]) => {
                const current = myUpgrades.find(u => u.upgradeType === key);
                const currentLevel = current?.level || 0;
                const isMaxed = currentLevel >= upgrade.maxLevel;
                
                const bankResources = (myGuild?.bankResources as GuildBankResources) || EMPTY_GUILD_BANK;
                const resourceCosts = getUpgradeResourceCosts(key, currentLevel);
                const canAfford = canAffordUpgrade(bankResources, key, currentLevel);
                
                const resourceLabels: Record<string, string> = {
                  gold: t(language, 'goldResource'),
                  wood: t(language, 'woodResource'),
                  ore: t(language, 'oreResource'),
                  metal: t(language, 'metalResource'),
                  food: t(language, 'foodResource'),
                  monster: t(language, 'monsterResource'),
                  rare: t(language, 'rareResource'),
                };

                return (
                  <Card key={key} className={cn(isMaxed && "opacity-60")} data-testid={`upgrade-card-${key}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-bold">{t(language, (GUILD_UPGRADE_TRANSLATION_KEYS[key]?.name || key) as any)}</h3>
                          <p className="text-sm text-muted-foreground">{t(language, (GUILD_UPGRADE_TRANSLATION_KEYS[key]?.desc || key) as any)}</p>
                        </div>
                        <Badge variant={isMaxed ? "secondary" : "outline"}>
                          Lv.{currentLevel}/{upgrade.maxLevel}
                        </Badge>
                      </div>
                      {currentLevel > 0 && (
                        <div className="text-sm text-green-400 mb-2">
                          {t(language, 'activeLabel')}: +{upgrade.effect(currentLevel)}%
                        </div>
                      )}
                      {!isMaxed && (
                        <>
                          <div className="text-sm text-muted-foreground mb-2">
                            {t(language, 'nextLevel')}: +{upgrade.effect(currentLevel + 1)}%
                          </div>
                          
                          <div className="space-y-1 mb-3">
                            {resourceCosts.map((rc) => {
                              const bankHas = bankResources[rc.category] || 0;
                              const hasEnough = bankHas >= rc.amount;
                              return (
                                <div key={rc.category} className="flex items-center gap-2">
                                  <span className={cn("text-sm", hasEnough ? "text-green-400" : "text-red-400")}>
                                    {formatNumber(rc.amount)} {resourceLabels[rc.category]}
                                    <span className="text-muted-foreground ml-1">({formatNumber(bankHas)})</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          
                          <Button 
                            size="sm"
                            className="w-full"
                            disabled={!canAfford || myMembership?.role !== 'leader'}
                            onClick={() => handlePurchaseUpgrade(key)}
                            data-testid={`button-upgrade-${key}`}
                          >
                            {t(language, 'upgrade')}
                          </Button>
                          {myMembership?.role !== 'leader' && (
                            <p className="text-xs text-muted-foreground mt-2 text-center">{t(language, 'onlyLeaderCanUpgrade')}</p>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {(myMembership?.role === 'leader' || myMembership?.role === 'officer') && (
            <TabsContent value="manage" className="space-y-4">
              {joinRequests.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t(language, 'pendingApplications')} ({joinRequests.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {joinRequests.map((req) => (
                        <div key={req.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                          <div className="flex-1">
                            <div className="font-bold">{req.playerName}</div>
                            <div className="text-xs text-muted-foreground">
                              {t(language, 'totalLevel')}: {req.playerTotalLevel}
                            </div>
                            {req.message && (
                              <p className="text-sm mt-1 italic">{req.message}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-green-400"
                              onClick={() => handleRespondToRequest(req.id, 'accept')}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-red-400"
                              onClick={() => handleRespondToRequest(req.id, 'reject')}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {(myMembership?.role === 'leader' || myMembership?.role === 'officer') && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <PaperPlaneTilt className="w-5 h-5" />
                      {t(language, 'invitePlayer')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder={t(language, 'searchPlayerName')}
                        value={inviteSearchTerm}
                        onChange={(e) => setInviteSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchPlayersForInvite()}
                        data-testid="input-invite-search"
                      />
                      <Button 
                        onClick={searchPlayersForInvite} 
                        disabled={isSearchingPlayers || inviteSearchTerm.length < 2}
                        data-testid="button-search-players"
                      >
                        <MagnifyingGlass className="w-4 h-4 mr-1" />
                        {t(language, 'search')}
                      </Button>
                    </div>
                    {inviteSearchResults.length > 0 && (
                      <div className="space-y-2">
                        {inviteSearchResults.map((p) => (
                          <div key={p.playerId} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg" data-testid={`search-result-${p.playerId}`}>
                            <div className={cn("w-2 h-2 rounded-full", p.isOnline ? "bg-green-500" : "bg-gray-500")} />
                            <div className="flex-1">
                              <div className="font-bold">{p.username}</div>
                              <div className="text-xs text-muted-foreground">
                                {t(language, 'level')}: {p.totalLevel}
                              </div>
                            </div>
                            <Button 
                              size="sm" 
                              onClick={() => handleSendInviteFromSearch(p.playerId)}
                              disabled={isSendingInvite}
                              data-testid={`button-invite-${p.playerId}`}
                            >
                              <PaperPlaneTilt className="w-4 h-4 mr-1" />
                              {t(language, 'inviteToGuild')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t(language, 'sentInvites')} ({sentInvites.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {sentInvites.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">{t(language, 'noPendingInvites')}</p>
                  ) : (
                    <div className="space-y-2">
                      {sentInvites.map((invite) => (
                        <div key={invite.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg" data-testid={`invite-${invite.id}`}>
                          <div className="flex-1">
                            <div className="font-bold">{invite.targetPlayerName}</div>
                            <div className="text-xs text-muted-foreground">
                              {t(language, 'invitedBy')}: {invite.inviterName}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-red-400"
                            onClick={() => cancelInvite(invite.id)}
                            data-testid={`button-cancel-invite-${invite.id}`}
                          >
                            <X className="w-4 h-4 mr-1" />
                            {t(language, 'cancel')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {myMembership?.role === 'leader' && (
                <Card className="border-red-500/30">
                  <CardHeader>
                    <CardTitle className="text-lg text-red-400">{t(language, 'dangerZone')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg">
                      <div>
                        <div className="font-bold">{t(language, 'transferLeadership')}</div>
                        <p className="text-sm text-muted-foreground">{t(language, 'transferLeadershipDesc')}</p>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">{t(language, 'transfer')}</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{t(language, 'transferLeadership')}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-2">
                            {guildMembers.filter(m => m.role !== 'leader').map((member) => (
                              <Button 
                                key={member.id}
                                variant="outline"
                                className="w-full justify-start"
                                onClick={() => transferLeadership(member.playerId)}
                              >
                                {member.player.username}
                              </Button>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg">
                      <div>
                        <div className="font-bold">{t(language, 'disbandGuild')}</div>
                        <p className="text-sm text-muted-foreground">{t(language, 'disbandWarning')}</p>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="destructive" size="sm">{t(language, 'disband')}</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{t(language, 'disbandConfirmTitle')}</DialogTitle>
                          </DialogHeader>
                          <p className="text-muted-foreground">
                            {t(language, 'disbandConfirmMessage')}
                          </p>
                          <DialogFooter>
                            <Button variant="destructive" onClick={disbandGuild}>
                              {t(language, 'yesDisband')}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
      <PartyMemberDetailDialog
        member={selectedMember}
        party={null}
        currentPlayerId={player?.id}
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </>
  );
}
