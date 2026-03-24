import { useState, memo, useRef, useEffect, useCallback, useMemo, Component, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Sword, 
  ShieldStar, 
  Backpack, 
  Scroll, 
  UsersThree, 
  GearSix, 
  MapTrifold, 
  Hammer,
  List,
  Axe,
  FishSimple,
  Fire,
  CookingPot,
  Flask,
  TestTube,
  UserCircle,
  Trophy,
  Storefront,
  Handshake,
  Skull,
  Door,
  Target,
  Gift,
  ShoppingCart,
  Sparkle,
  DiscordLogo,
  Medal,
  Shield,
  Crown,
  Circle,
  SignOut,
  Lightning,
  Check,
  X,
} from "@phosphor-icons/react";
import { Swords, Pickaxe, TreePine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import StatsBar from "./StatsBar";
import NotificationBell from "./NotificationBell";
import MobileBottomNav from "./MobileBottomNav";
import MobileTopHUD from "./MobileTopHUD";
import ItemNotificationStack from "./ItemNotificationStack";
import GuildInvitePopup from "./GuildInvitePopup";
import PartyInvitePopup from "./PartyInvitePopup";
import { DungeonPartyInvitePopup } from "./DungeonPartyInvitePopup";
import QueueFAB from "./QueueFAB";

class SilentErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() {}
  render() { return this.state.hasError ? null : this.props.children; }
}
import PartyMemberDetailDialog from "./PartyMemberDetailDialog";
import type { PartyMemberData } from "./PartyMemberDetailDialog";
import ActiveBuffsDisplay from "./ActiveBuffsDisplay";
import ActiveTaskIndicator from "./ActiveTaskIndicator";
import { useGame, useGameStatus } from "@/context/GameContext";
import { useGuild } from "@/context/GuildContext";
import { useRaidLock } from "@/context/RaidLockContext";
import { useAudio } from "@/context/AudioContext";
import { useMobile } from "@/hooks/useMobile";
import { t, Language } from "@/lib/i18n";
import { useFirebaseAuth, getAuthHeaders } from "@/context/FirebaseAuthContext";
import { useDevMode } from "@/context/DevModeContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { WarningCircle, Heart, Bell } from "@phosphor-icons/react";
import { restoreConsoleForAdmin } from "@/lib/consoleGuard";
import { useMarketWebSocket } from "@/hooks/useMarketWebSocket";
import { usePartyWebSocket } from "@/hooks/usePartyWebSocket";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { translateItemName } from "@/lib/items";
import { apiRequest } from "@/lib/queryClient";
import { getSubClass } from "@shared/subClasses";
import { getLocalizedMonsterName, getLocalizedRegionName } from "@/lib/gameTranslations";
import { Badge } from "@/components/ui/badge";

const PARTY_ROLE_ICONS: Record<string, React.ElementType> = {
  tank: Shield,
  dps: Sword,
  healer: Heart,
  hybrid: Lightning,
};

const PARTY_ROLE_COLORS: Record<string, string> = {
  tank: "text-blue-400",
  dps: "text-red-400",
  healer: "text-green-400",
  hybrid: "text-yellow-400",
};

const COMPACT_SKILL_ICONS: Record<string, React.ElementType> = {
  mining: Pickaxe,
  woodcutting: TreePine,
  fishing: FishSimple,
  cooking: Fire,
  alchemy: Flask,
  crafting: Hammer,
};

const ADMIN_ALLOWED_EMAILS = ["betelgeusestd@gmail.com", "yusufakgn61@gmail.com"];
const ADMIN_ROUTE = "/ctrl-x9k3m7pnl";

import avatarKnight from "@/assets/generated_images/pixel_art_knight_portrait.png";
import avatarMage from "@/assets/generated_images/pixel_art_mage_portrait.png";
import avatarArcher from "@/assets/generated_images/pixel_art_archer_portrait.png";
import avatarWarrior from "@/assets/generated_images/pixel_art_warrior_portrait.png";
import avatarRogue from "@/assets/generated_images/pixel_art_rogue_portrait.png";
import avatarHealer from "@/assets/generated_images/pixel_art_healer_portrait.png";
import avatarNecromancer from "@/assets/generated_images/pixel_art_necromancer_portrait.png";
import avatarPaladin from "@/assets/generated_images/pixel_art_paladin_portrait.png";
import avatarBerserker from "@/assets/generated_images/pixel_art_berserker_portrait.png";
import avatarDruid from "@/assets/generated_images/pixel_art_druid_portrait.png";

const AVATAR_IMAGES: Record<string, string> = {
  knight: avatarKnight,
  mage: avatarMage,
  archer: avatarArcher,
  warrior: avatarWarrior,
  rogue: avatarRogue,
  healer: avatarHealer,
  necromancer: avatarNecromancer,
  paladin: avatarPaladin,
  berserker: avatarBerserker,
  druid: avatarDruid,
};

type NavItem = {
  icon?: React.ElementType;
  labelKey: string;
  path?: string;
  isHeader?: boolean;
  isSpacer?: boolean;
  skillId?: string;
};

const NAV_ITEMS: NavItem[] = [
  // Personal (at top)
  { labelKey: "menuPersonal", isHeader: true },
  { icon: UserCircle, labelKey: "profile", path: "/profile" },
  { icon: Backpack, labelKey: "inventory", path: "/inventory" },
  { icon: MapTrifold, labelKey: "travel", path: "/travel" },

  // Combat
  { icon: Sword, labelKey: "combat", path: "/combat" },

  // Economy
  { labelKey: "menuEconomy", isHeader: true },
  { icon: Storefront, labelKey: "market", path: "/market" },
  { icon: ShoppingCart, labelKey: "npcShop", path: "/npc-shop" },
  { icon: Sparkle, labelKey: "enhancement", path: "/enhancement" },
  { icon: Handshake, labelKey: "trade", path: "/trade" },
  { icon: Gift, labelKey: "dailyRewards", path: "/daily-rewards" },

  // Social
  { labelKey: "menuSocial", isHeader: true },
  { icon: UsersThree, labelKey: "guild", path: "/guild" },
  { icon: Skull, labelKey: "raids", path: "/raids" },
  { icon: Door, labelKey: "dungeons", path: "/dungeons" },
  { icon: Trophy, labelKey: "scoreboard", path: "/scoreboard" },
  { icon: Medal, labelKey: "achievements", path: "/achievements" },
  
  // Skills
  { labelKey: "skills", isHeader: true },
  { icon: Axe, labelKey: "woodcutting", path: "/skill/woodcutting", skillId: "woodcutting" },
  { icon: Pickaxe, labelKey: "mining", path: "/skill/mining", skillId: "mining" },
  { icon: FishSimple, labelKey: "fishing", path: "/skill/fishing", skillId: "fishing" },
  { icon: Target, labelKey: "hunting", path: "/skill/hunting", skillId: "hunting" },
  { icon: Hammer, labelKey: "crafting", path: "/crafting", skillId: "crafting" },
  { icon: CookingPot, labelKey: "cooking", path: "/skill/cooking", skillId: "cooking" },
  { icon: Flask, labelKey: "alchemy", path: "/alchemy", skillId: "alchemy" },
  { icon: Fire, labelKey: "firemaking", path: "/skill/firemaking", skillId: "firemaking" },

  // Spacer before settings
  { labelKey: "", isSpacer: true },

  // Settings alone at bottom
  { icon: GearSix, labelKey: "settings", path: "/settings" },
];

interface DevPlayer {
  id: string;
  username: string;
  avatar: string | null;
  totalLevel: number;
  isBot: number;
  currentRegion: string;
}

interface NavContentProps {
  player: any;
  totalLevel: number;
  skills: Record<string, { xp: number; level: number }>;
  language: Language;
  location: string;
  navigate: (path: string) => void;
  onMobileClose?: () => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  hasUnreadGuildMessages?: boolean;
  onGuildClick?: () => void;
  isAdminUser?: boolean;
  staffRole?: string | null;
  hasDailyRewardAvailable?: boolean;
  hasPendingTrade?: boolean;
  onlinePlayerCount?: number;
  realOnlineCount?: number | null;
  isDevMode?: boolean;
}

const NavContent = memo(function NavContent({ 
  player, 
  totalLevel, 
  skills, 
  language, 
  location, 
  navigate, 
  onMobileClose,
  scrollRef,
  hasUnreadGuildMessages,
  onGuildClick,
  isAdminUser,
  staffRole,
  hasDailyRewardAvailable,
  hasPendingTrade,
  onlinePlayerCount,
  realOnlineCount,
  isDevMode: isDevModeProp
}: NavContentProps) {
  const [devSwitcherOpen, setDevSwitcherOpen] = useState(false);
  const [devPlayers, setDevPlayers] = useState<DevPlayer[]>([]);
  const [devSearch, setDevSearch] = useState("");
  const [devSwitching, setDevSwitching] = useState(false);

  useEffect(() => {
    if (!isDevModeProp || !devSwitcherOpen || devPlayers.length > 0) return;
    fetch('/api/players/dev/list', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setDevPlayers(data.players || []))
      .catch(() => {});
  }, [isDevModeProp, devSwitcherOpen, devPlayers.length]);

  const filteredDevPlayers = useMemo(() => {
    if (!devSearch.trim()) return devPlayers;
    const q = devSearch.toLowerCase();
    return devPlayers.filter(p => p.username.toLowerCase().includes(q));
  }, [devPlayers, devSearch]);

  const handleDevSwitch = useCallback(async (targetId: string) => {
    if (devSwitching || targetId === player?.id) return;
    setDevSwitching(true);
    try {
      localStorage.setItem('devTargetPlayerId', targetId);
      window.location.reload();
    } catch {
      setDevSwitching(false);
    }
  }, [devSwitching, player?.id]);
  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="p-6 flex flex-col items-center border-b border-sidebar-border bg-sidebar/50">
        {onlinePlayerCount !== undefined && onlinePlayerCount > 0 && (
          <div className="w-full flex items-center justify-center gap-1.5 mb-3 px-3 py-1.5 bg-green-500/10 rounded-lg border border-green-500/20">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-green-400">
              {onlinePlayerCount.toLocaleString()} {t(language, 'online')}
            </span>
            {realOnlineCount !== null && realOnlineCount !== undefined && (
              <span className="text-xs text-muted-foreground ml-1">
                ({realOnlineCount})
              </span>
            )}
          </div>
        )}
        {isDevModeProp ? (
          <Popover open={devSwitcherOpen} onOpenChange={setDevSwitcherOpen}>
            <PopoverTrigger asChild>
              <button className="flex flex-col items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity group" data-testid="dev-account-switcher">
                <div className="relative w-20 h-20 mb-1 rounded-xl bg-card border-2 border-amber-500 shadow-[0_0_15px_rgba(234,179,8,0.3)] overflow-hidden group-hover:border-amber-400 transition-colors">
                  {player && AVATAR_IMAGES[player.avatar] ? (
                    <img src={AVATAR_IMAGES[player.avatar]} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">👤</div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-amber-600/90 text-[8px] text-white text-center py-0.5 font-bold">
                    DEV SWITCH
                  </div>
                </div>
                <h2 className="font-display font-bold text-lg text-sidebar-primary tracking-wide">
                  {player?.username || t(language, 'player')}
                </h2>
                <p className="font-ui text-xs text-muted-foreground uppercase tracking-widest">
                  {t(language, 'level')} {totalLevel}
                </p>
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="start" className="w-72 p-0 max-h-[400px] flex flex-col" data-testid="dev-account-popover">
              <div className="p-2 border-b border-border">
                <input
                  type="text"
                  placeholder="Search players..."
                  value={devSearch}
                  onChange={(e) => setDevSearch(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="dev-search-input"
                />
              </div>
              <ScrollArea className="flex-1 max-h-[340px]">
                <div className="p-1">
                  {filteredDevPlayers.length === 0 ? (
                    <div className="text-center py-4 text-xs text-muted-foreground">
                      {devPlayers.length === 0 ? 'Loading...' : 'No players found'}
                    </div>
                  ) : (
                    filteredDevPlayers.map((dp) => {
                      const isCurrentPlayer = dp.id === player?.id;
                      const avatarSrc = dp.avatar ? AVATAR_IMAGES[dp.avatar] : null;
                      return (
                        <button
                          key={dp.id}
                          onClick={() => handleDevSwitch(dp.id)}
                          disabled={isCurrentPlayer || devSwitching}
                          className={cn(
                            "w-full flex items-center gap-2 p-1.5 rounded-md text-left transition-colors text-xs",
                            isCurrentPlayer 
                              ? "bg-primary/15 border border-primary/30 cursor-default" 
                              : "hover:bg-accent/50 cursor-pointer",
                            devSwitching && !isCurrentPlayer && "opacity-50"
                          )}
                          data-testid={`dev-player-${dp.id}`}
                        >
                          <div className="w-7 h-7 rounded-md bg-card border border-border overflow-hidden flex-shrink-0">
                            {avatarSrc ? (
                              <img src={avatarSrc} alt={dp.username} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-sm">👤</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-medium truncate">{dp.username}</span>
                              {dp.isBot === 1 && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 text-amber-400 border-amber-500/30">BOT</Badge>
                              )}
                              {isCurrentPlayer && (
                                <Check className="w-3 h-3 text-primary flex-shrink-0" weight="bold" />
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Lv.{dp.totalLevel} · {dp.currentRegion}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        ) : (
          <>
            <div className="relative w-20 h-20 mb-3 rounded-xl bg-card border-2 border-primary shadow-[0_0_15px_rgba(234,179,8,0.3)] overflow-hidden">
              {player && AVATAR_IMAGES[player.avatar] ? (
                <img src={AVATAR_IMAGES[player.avatar]} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl">👤</div>
              )}
            </div>
            <h2 className="font-display font-bold text-lg text-sidebar-primary tracking-wide">
              {player?.username || t(language, 'player')}
            </h2>
            <p className="font-ui text-xs text-muted-foreground uppercase tracking-widest">
              {t(language, 'level')} {totalLevel}
            </p>
          </>
        )}
        <a
          href="https://thronecreator.itch.io/idlethrone/donate"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white text-xs font-medium rounded-full shadow-lg transition-all hover:scale-105"
          data-testid="button-donate"
        >
          <Heart className="w-3.5 h-3.5" weight="fill" />
          {t(language, "donate")}
        </a>
      </div>

      <div ref={scrollRef} className="flex-1 py-4 overflow-y-auto">
        <nav className="space-y-1 px-2">
          {NAV_ITEMS.map((item, index) => {
            if (item.isSpacer) {
              return <div key={`spacer-${index}`} className="h-4" />;
            }
            
            if (item.isHeader) {
              return (
                <div key={`header-${index}`} className="px-4 pt-4 pb-2 text-xs font-bold text-muted-foreground uppercase tracking-widest font-ui opacity-70">
                  {t(language, item.labelKey as any)}
                </div>
              );
            }

            const isActive = location === item.path;
            const Icon = item.icon!;
            
            const skillLevel = item.skillId ? skills[item.skillId]?.level ?? 0 : null;
            
            const isGuildItem = item.path === '/guild';
            const showGuildIndicator = isGuildItem && hasUnreadGuildMessages && !isActive;
            const isDailyRewardsItem = item.path === '/daily-rewards';
            const showDailyRewardIndicator = isDailyRewardsItem && hasDailyRewardAvailable && !isActive;
            const isTradeItem = item.path === '/trade';
            const showTradeIndicator = isTradeItem && hasPendingTrade && !isActive;
            
            return (
              <button
                type="button"
                key={item.path} 
                onClick={() => { 
                  if (isGuildItem && onGuildClick) onGuildClick();
                  navigate(item.path!); 
                  onMobileClose?.(); 
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-200 rounded-md cursor-pointer font-ui tracking-wide group text-left",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary border-l-2 border-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-primary",
                  showDailyRewardIndicator && "bg-amber-500/10",
                  showTradeIndicator && "bg-cyan-500/10"
                )}
              >
                <div className="relative">
                  <Icon className={cn("w-5 h-5 shrink-0", isActive ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-sidebar-primary", showDailyRewardIndicator && "text-amber-400", showTradeIndicator && "text-cyan-400")} weight="bold" />
                  {showGuildIndicator && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse" />
                  )}
                  {showDailyRewardIndicator && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse" />
                  )}
                  {showTradeIndicator && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-cyan-400 rounded-full animate-pulse" />
                  )}
                </div>
                <span className="flex-1">{t(language, item.labelKey as any)}</span>
                {skillLevel !== null && (
                  <span className="text-xs text-muted-foreground font-mono">
                    ({skillLevel}/100)
                  </span>
                )}
              </button>
            );
          })}
          
          {isAdminUser && (
            <>
              <div className="px-4 pt-4 pb-2 text-xs font-bold text-muted-foreground uppercase tracking-widest font-ui opacity-70">
                Admin
              </div>
              <button
                type="button"
                onClick={() => { 
                  navigate(ADMIN_ROUTE); 
                  onMobileClose?.(); 
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-200 rounded-md cursor-pointer font-ui tracking-wide group text-left",
                  location === ADMIN_ROUTE
                    ? "bg-red-500/20 text-red-400 border-l-2 border-red-500"
                    : "text-sidebar-foreground hover:bg-red-500/10 hover:text-red-400"
                )}
              >
                <ShieldStar className={cn("w-5 h-5 shrink-0", location === ADMIN_ROUTE ? "text-red-400" : "text-muted-foreground group-hover:text-red-400")} weight="bold" />
                <span className="flex-1">Admin Panel</span>
              </button>
            </>
          )}
          {!isAdminUser && staffRole && (
            <>
              <div className="px-4 pt-4 pb-2 text-xs font-bold text-muted-foreground uppercase tracking-widest font-ui opacity-70">
                Staff
              </div>
              <button
                type="button"
                onClick={() => { 
                  navigate(ADMIN_ROUTE + '?staff=1'); 
                  onMobileClose?.(); 
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-200 rounded-md cursor-pointer font-ui tracking-wide group text-left",
                  location === ADMIN_ROUTE
                    ? "bg-amber-500/20 text-amber-400 border-l-2 border-amber-500"
                    : "text-sidebar-foreground hover:bg-amber-500/10 hover:text-amber-400"
                )}
              >
                <ShieldStar className={cn("w-5 h-5 shrink-0", location === ADMIN_ROUTE ? "text-amber-400" : "text-muted-foreground group-hover:text-amber-400")} weight="bold" />
                <span className="flex-1">{staffRole === 'moderator' ? 'Mod Panel' : 'Translator Panel'}</span>
              </button>
            </>
          )}
        </nav>
      </div>
      
      <div className="p-4 border-t border-sidebar-border">
        <div className="text-xs text-center text-muted-foreground font-ui">
          {t(language, 'serverTime')}: {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
});

export default function GameLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { debugMode, toggleDebugMode, player, totalLevel, skills, language, onlinePlayerCount, realOnlineCount, staffRole } = useGame();
  const { pendingTradeCount } = useGameStatus();
  const { hasUnreadMessages, markMessagesRead } = useGuild();
  const { isRaidLocked, isDungeonLocked } = useRaidLock();
  const { playSfx } = useAudio();
  const { isMobile } = useMobile();
  const { user } = useFirebaseAuth();
  const { isDevMode } = useDevMode();
  const { toast } = useToast();
  const isAdminUser = user?.email ? ADMIN_ALLOWED_EMAILS.includes(user.email) : false;
  const canAccessTestMode = player?.isTester === 1 || isDevMode || (isDevMode && isAdminUser);

  useEffect(() => {
    if (isAdminUser || staffRole || player?.isTester === 1) {
      restoreConsoleForAdmin();
    }
  }, [isAdminUser, staffRole, player?.isTester]);

  const handleMarketSale = useCallback((payload: { itemId: string; quantitySold: number; goldEarned: number }) => {
    const itemName = translateItemName(payload.itemId, language);
    toast({
      title: language === 'tr' ? 'Eşya Satıldı!' : 'Item Sold!',
      description: language === 'tr' 
        ? `${payload.quantitySold}x ${itemName} satıldı! ${payload.goldEarned} altın kazandın.`
        : `${payload.quantitySold}x ${itemName} sold! You earned ${payload.goldEarned} gold.`,
    });
  }, [toast, language]);

  useMarketWebSocket({
    playerId: player?.id || null,
    enabled: !!player,
    onMarketSale: handleMarketSale,
  });

  const { data: currentParty } = useQuery<any>({
    queryKey: ['/api/parties/current'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/parties/current");
      if (!res.ok) return null;
      const data = await res.json();
      return data.party || null;
    },
    enabled: !!player,
    staleTime: 5000,
    refetchInterval: 15000,
  });

  const { data: partyInvites } = useQuery<any[]>({
    queryKey: ['/api/party-invites'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/party-invites");
      return res.json();
    },
    enabled: !!player && !currentParty,
    staleTime: 30000,
  });

  usePartyWebSocket({
    playerId: player?.id || null,
    partyId: currentParty?.id || null,
    enabled: !!player,
  });

  const [partyPopoverOpen, setPartyPopoverOpen] = useState(false);
  const [selectedPartyMember, setSelectedPartyMember] = useState<PartyMemberData | null>(null);
  const [partyMemberDetailOpen, setPartyMemberDetailOpen] = useState(false);
  const queryClient = useQueryClient();

  const leavePartyMutation = useMutation({
    mutationFn: async () => {
      if (!currentParty?.id) return;
      await apiRequest("POST", `/api/parties/${currentParty.id}/leave`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parties/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/parties/public'] });
      setPartyPopoverOpen(false);
      toast({ title: t(language, 'leftParty') || (language === 'tr' ? 'Partiden ayrıldın' : 'Left party') });
    },
  });

  const acceptInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      await apiRequest("POST", `/api/party-invites/${inviteId}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parties/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/party-invites'] });
      setPartyPopoverOpen(false);
    },
  });

  const declineInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      await apiRequest("POST", `/api/party-invites/${inviteId}/decline`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/party-invites'] });
    },
  });

  const getCompactMemberStatus = (member: any) => {
    if (member.isInCombat === 1 && member.currentMonsterId) {
      const monsterName = getLocalizedMonsterName(language as Language, member.currentMonsterId);
      return { icon: Swords, color: member.isOnline !== 1 ? "text-gray-400" : "text-red-400", label: monsterName || (language === 'tr' ? "Savaşta" : "In Combat") };
    }
    if (member.activeTask?.type === 'skill' && member.activeTask.skillType) {
      const SkillIcon = COMPACT_SKILL_ICONS[member.activeTask.skillType] || Circle;
      return { icon: SkillIcon, color: member.isOnline !== 1 ? "text-gray-400" : "text-amber-400", label: member.activeTask.skillType.charAt(0).toUpperCase() + member.activeTask.skillType.slice(1) };
    }
    if (member.isOnline !== 1) {
      return { icon: Circle, color: "text-gray-500", label: language === 'tr' ? "Çevrimdışı" : "Offline" };
    }
    if (member.currentRegion) {
      const regionName = getLocalizedRegionName(language as Language, member.currentRegion);
      return { icon: Circle, color: "text-green-400", label: regionName || member.currentRegion.replace(/_/g, " ") };
    }
    return { icon: Circle, color: "text-green-400", label: language === 'tr' ? "Çevrimiçi" : "Online" };
  };

  const { data: dailyLoginData } = useQuery<{ canClaim: boolean; quests?: any[] }>({
    queryKey: ['/api/daily-login-status-nav'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const [loginRes, questRes] = await Promise.all([
        fetch('/api/daily-login', { credentials: 'include', headers }),
        fetch('/api/daily-quests', { credentials: 'include', headers }),
      ]);
      const loginData = loginRes.ok ? await loginRes.json() : { canClaim: false };
      const questData = questRes.ok ? await questRes.json() : { quests: [] };
      return {
        canClaim: loginData.canClaim || false,
        quests: questData.quests || [],
      };
    },
    enabled: !!player,
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const hasDailyRewardAvailable = useMemo(() => {
    if (!dailyLoginData) return false;
    if (dailyLoginData.canClaim) return true;
    const quests = dailyLoginData.quests || [];
    const hasCompletedQuest = quests.some((q: any) => q.is_completed === 1 && q.is_claimed !== 1);
    const hasUnacceptedQuest = quests.some((q: any) => q.is_accepted !== 1 && q.is_claimed !== 1);
    return hasCompletedQuest || hasUnacceptedQuest;
  }, [dailyLoginData]);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<number>(0);
  const [raidWarningOpen, setRaidWarningOpen] = useState(false);
  const [dungeonWarningOpen, setDungeonWarningOpen] = useState(false);
  const [dungeonReconnectOpen, setDungeonReconnectOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [alphaDialogOpen, setAlphaDialogOpen] = useState(false);

  // Keyboard listener for "a" key to open alpha notification dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if not typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setAlphaDialogOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAlphaConfirm = useCallback(() => {
    setAlphaDialogOpen(false);
    window.open('https://thronecreator.itch.io/idlethrone', '_blank');
  }, []);

  // Wrap navigate to preserve scroll position and check raid lock
  const handleNavigate = useCallback((path: string) => {
    if (isRaidLocked && path !== "/raids") {
      setPendingPath(path);
      setRaidWarningOpen(true);
      return;
    }
    if (isDungeonLocked && path !== "/party-dungeon-run") {
      setPendingPath(path);
      setDungeonWarningOpen(true);
      return;
    }
    if (sidebarScrollRef.current) {
      scrollPositionRef.current = sidebarScrollRef.current.scrollTop;
    }
    navigate(path);
  }, [navigate, isRaidLocked, isDungeonLocked]);

  const handleConfirmLeaveRaid = useCallback(() => {
    if (pendingPath) {
      if (sidebarScrollRef.current) {
        scrollPositionRef.current = sidebarScrollRef.current.scrollTop;
      }
      navigate(pendingPath);
    }
    setRaidWarningOpen(false);
    setPendingPath(null);
  }, [pendingPath, navigate]);

  const handleCancelLeaveRaid = useCallback(() => {
    setRaidWarningOpen(false);
    setPendingPath(null);
  }, []);

  // Restore scroll position after location change
  useEffect(() => {
    if (sidebarScrollRef.current && scrollPositionRef.current > 0) {
      sidebarScrollRef.current.scrollTop = scrollPositionRef.current;
      // Clear after restoring to prevent re-applying on subsequent renders
      scrollPositionRef.current = 0;
    }
  }, [location]);

  // Auto-mark guild messages as read when entering guild page
  useEffect(() => {
    if (location === '/guild' && hasUnreadMessages) {
      markMessagesRead();
    }
  }, [location, hasUnreadMessages, markMessagesRead]);

  const [activeDungeonChecked, setActiveDungeonChecked] = useState(false);
  useEffect(() => {
    if (!player || activeDungeonChecked) return;
    if (location === '/party-dungeon-run') return;
    const checkActive = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/v2/dungeon-party/session/active', { credentials: 'include', headers });
        if (res.ok) {
          const data = await res.json();
          if (data.active && data.snapshot) {
            setDungeonReconnectOpen(true);
          }
        }
      } catch {}
      setActiveDungeonChecked(true);
    };
    checkActive();
  }, [player?.id]);

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="min-h-dvh bg-background text-foreground selection:bg-primary/20 grid-bg">
        {/* Alpha Test Banner - Mobile */}
        <div className="w-full bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 text-white text-center py-1 px-2 text-xs font-medium shadow-md z-50 fixed top-0 left-0 right-0 flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="animate-pulse">&#9888;</span>
            <span>{t(language, 'alphaTestBannerMobile')}</span>
            <span className="animate-pulse">&#9888;</span>
          </span>
          <a
            href="https://discord.gg/kwk6K4GJrr"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 px-2 py-0.5 rounded-full text-white transition-colors shrink-0"
            data-testid="discord-banner-mobile"
          >
            <DiscordLogo className="w-3 h-3" weight="bold" />
            <span>Discord</span>
          </a>
        </div>
        <MobileTopHUD />
        
        <main className="pt-[4.5rem] px-3 pb-24" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="max-w-lg mx-auto">
            {/* Active Buffs Display for Mobile */}
            <div className="mb-3">
              <ActiveBuffsDisplay />
            </div>
            {children}
          </div>
        </main>
        
        <ItemNotificationStack />
        <GuildInvitePopup />
        <SilentErrorBoundary><PartyInvitePopup /></SilentErrorBoundary>
        <DungeonPartyInvitePopup />
        <MobileBottomNav />
      </div>
    );
  }

  // Desktop/Tablet Layout
  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden selection:bg-primary/20 grid-bg">
      {/* Alpha Test Banner - Clickable for feedback */}
      <div className="w-full bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 text-white text-center py-1.5 px-4 text-sm font-medium shrink-0 shadow-md z-50 flex items-center justify-center gap-3">
        <button 
          onClick={() => { playSfx('ui', 'dialog_open'); setAlphaDialogOpen(true); }}
          className="inline-flex items-center gap-2 hover:scale-105 transition-transform cursor-pointer"
          data-testid="alpha-test-banner-button"
        >
          <span className="animate-pulse">&#9888;</span>
          <span>{t(language, 'alphaTestBanner')}</span>
          <Bell className="w-4 h-4 ml-1" weight="fill" />
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{t(language, 'feedback')}</span>
          <span className="animate-pulse">&#9888;</span>
        </button>
        <a
          href="https://discord.gg/kwk6K4GJrr"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded-full text-white text-xs font-medium transition-colors shrink-0"
          data-testid="discord-banner-desktop"
        >
          <DiscordLogo className="w-4 h-4" weight="bold" />
          <span>Discord</span>
        </a>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 h-full z-30">
        <NavContent 
          player={player}
          totalLevel={totalLevel}
          skills={skills}
          language={language}
          location={location}
          navigate={handleNavigate}
          scrollRef={sidebarScrollRef}
          hasUnreadGuildMessages={hasUnreadMessages}
          onGuildClick={markMessagesRead}
          isAdminUser={isAdminUser}
          staffRole={staffRole}
          hasDailyRewardAvailable={hasDailyRewardAvailable}
          hasPendingTrade={pendingTradeCount > 0}
          onlinePlayerCount={onlinePlayerCount}
          realOnlineCount={realOnlineCount}
          isDevMode={isDevMode}
        />
      </aside>

      {/* Mobile Sidebar (for tablet) */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          <NavContent 
            player={player}
            totalLevel={totalLevel}
            skills={skills}
            language={language}
            location={location}
            navigate={handleNavigate}
            onMobileClose={() => setIsMobileOpen(false)}
            hasUnreadGuildMessages={hasUnreadMessages}
            onGuildClick={markMessagesRead}
            isAdminUser={isAdminUser}
            staffRole={staffRole}
            hasDailyRewardAvailable={hasDailyRewardAvailable}
            hasPendingTrade={pendingTradeCount > 0}
            isDevMode={isDevMode}
          />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-20 flex items-center px-4 md:px-6 justify-between shrink-0">
          <div className="flex items-center gap-2 md:hidden shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setIsMobileOpen(true)}>
              <List className="w-6 h-6" weight="bold" />
            </Button>
          </div>
          
          <div className="flex-1 min-w-0 max-w-4xl mx-auto flex items-center gap-4">
             <StatsBar />
             
             {/* Active Buffs Display */}
             <div className="hidden lg:block">
               <ActiveBuffsDisplay />
             </div>

             {/* Party Indicator - Desktop */}
             <div className="hidden lg:block">
               <Popover open={partyPopoverOpen} onOpenChange={setPartyPopoverOpen}>
                 <PopoverTrigger asChild>
                   {currentParty && currentParty.members && currentParty.members.length > 0 ? (
                     <Button
                       variant="ghost"
                       size="sm"
                       className="relative flex items-center gap-1.5 px-2 h-9"
                       data-testid="button-party-header-indicator"
                     >
                       <UsersThree className="w-4 h-4 text-violet-400" weight="fill" />
                       <span className="text-xs text-foreground/80 max-w-[80px] truncate">{currentParty.name || t(language, 'party')}</span>
                       <span className="text-[10px] text-violet-300 bg-violet-500/20 px-1.5 py-0.5 rounded-full font-bold">
                         {currentParty.members.length}/{currentParty.maxSize || 5}
                       </span>
                     </Button>
                   ) : (
                     <Button
                       variant="ghost"
                       size="sm"
                       className={cn("relative h-9 px-2", partyInvites && partyInvites.length > 0 && "text-amber-400")}
                       data-testid="button-party-header-no-party"
                     >
                       <UsersThree className="w-4 h-4" weight={partyInvites && partyInvites.length > 0 ? "fill" : "regular"} />
                       {partyInvites && partyInvites.length > 0 && (
                         <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
                       )}
                     </Button>
                   )}
                 </PopoverTrigger>
                 <PopoverContent className="w-[280px] p-0 border-border/50 bg-background/95 backdrop-blur-md" align="end" data-testid="party-header-popover">
                   {currentParty && currentParty.members && currentParty.members.length > 0 ? (
                     <div className="p-3 space-y-2">
                       <div className="flex items-center justify-between">
                         <span className="text-sm font-semibold truncate">{currentParty.name || (language === 'tr' ? 'Parti' : 'Party')}</span>
                         <span className="text-[10px] text-muted-foreground">{currentParty.members.length}/{currentParty.maxSize || 5}</span>
                       </div>
                       <div className="space-y-1">
                         {currentParty.members.map((member: any) => {
                           const isLeader = member.playerId === currentParty.leaderId;
                           const subClass = getSubClass(member.cachedWeaponType || null, null);
                           const role = subClass.baseRole === 'hybrid' ? 'dps' : subClass.baseRole;
                           const RoleIcon = PARTY_ROLE_ICONS[role] || Sword;
                           const roleColor = PARTY_ROLE_COLORS[role] || "text-gray-400";
                           const status = getCompactMemberStatus(member);
                           const StatusIcon = status.icon;
                           const avatarSrc = member.avatar ? AVATAR_IMAGES[member.avatar] : null;
                           return (
                             <div key={member.id} className={cn(
                               "flex items-center gap-2 p-1.5 rounded-lg border transition-colors cursor-pointer hover:bg-muted/40",
                               member.playerId === player?.id ? "bg-violet-500/10 border-violet-500/30" : "bg-muted/20 border-border/30"
                             )} data-testid={`party-compact-member-${member.playerId}`}
                             onClick={() => {
                               setPartyPopoverOpen(false);
                               setSelectedPartyMember(member);
                               setPartyMemberDetailOpen(true);
                             }}>
                               <div className="relative shrink-0">
                                 {avatarSrc ? (
                                   <img src={avatarSrc} alt={member.username} className="w-7 h-7 rounded-full object-cover border border-border" />
                                 ) : (
                                   <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                                     <RoleIcon className={cn("w-3 h-3", roleColor)} weight="fill" />
                                   </div>
                                 )}
                                 <div className={cn(
                                   "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-background",
                                   member.isOnline === 1 ? "bg-green-500" : "bg-gray-500"
                                 )} />
                               </div>
                               <div className="flex-1 min-w-0">
                                 <div className="flex items-center gap-1">
                                   <span className="text-xs font-medium truncate">{member.username}</span>
                                   {isLeader && <Crown className="w-2.5 h-2.5 text-yellow-400 shrink-0" weight="fill" />}
                                 </div>
                                 <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                   <StatusIcon className={cn("w-2.5 h-2.5 shrink-0", status.color)} weight="fill" />
                                   <span className="truncate">{status.label}</span>
                                 </div>
                               </div>
                               <div className="flex items-center gap-1 shrink-0">
                                 <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-4 border-0 bg-muted/40", roleColor)}>
                                   <RoleIcon className="w-2 h-2 mr-0.5" weight="fill" />
                                   {subClass.name.length > 10 ? role.toUpperCase() : subClass.name}
                                 </Badge>
                               </div>
                             </div>
                           );
                         })}
                       </div>
                       <div className="flex items-center gap-1.5 pt-1 border-t border-border/30">
                         <Button
                           variant="ghost"
                           size="sm"
                           className="flex-1 h-7 text-[10px] text-muted-foreground hover:text-foreground"
                           onClick={() => { setPartyPopoverOpen(false); navigate("/party"); }}
                           data-testid="button-party-popover-manage"
                         >
                           {language === 'tr' ? 'Partiyi Yönet' : 'Manage Party'}
                         </Button>
                         <Button
                           variant="ghost"
                           size="sm"
                           className="h-7 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                           onClick={() => leavePartyMutation.mutate()}
                           disabled={leavePartyMutation.isPending}
                           data-testid="button-party-popover-leave"
                         >
                           <SignOut className="w-3 h-3 mr-1" />
                           {language === 'tr' ? 'Ayrıl' : 'Leave'}
                         </Button>
                       </div>
                     </div>
                   ) : (
                     <div className="p-3 space-y-2">
                       {partyInvites && partyInvites.length > 0 ? (
                         <>
                           <span className="text-xs font-semibold text-amber-400">{language === 'tr' ? 'Bekleyen Davetler' : 'Pending Invites'}</span>
                           <div className="space-y-1">
                             {partyInvites.map((invite: any) => (
                               <div key={invite.id} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-muted/20 border border-border/30">
                                 <div className="min-w-0">
                                   <p className="text-xs font-medium truncate">{invite.partyName || invite.inviterUsername}</p>
                                   <p className="text-[9px] text-muted-foreground">{language === 'tr' ? `${invite.inviterUsername} tarafından` : `from ${invite.inviterUsername}`}</p>
                                 </div>
                                 <div className="flex items-center gap-1 shrink-0">
                                   <Button size="sm" className="h-5 w-5 p-0 bg-green-600 hover:bg-green-700" onClick={() => acceptInviteMutation.mutate(invite.id)} disabled={acceptInviteMutation.isPending} data-testid={`button-accept-invite-${invite.id}`}>
                                     <Check className="w-3 h-3" weight="bold" />
                                   </Button>
                                   <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400 hover:bg-red-500/20" onClick={() => declineInviteMutation.mutate(invite.id)} disabled={declineInviteMutation.isPending} data-testid={`button-decline-invite-${invite.id}`}>
                                     <X className="w-3 h-3" weight="bold" />
                                   </Button>
                                 </div>
                               </div>
                             ))}
                           </div>
                         </>
                       ) : (
                         <p className="text-xs text-muted-foreground text-center py-1">{language === 'tr' ? 'Bir partide değilsin' : 'Not in a party'}</p>
                       )}
                       <div className="flex items-center gap-1.5 pt-1 border-t border-border/30">
                         <Button
                           variant="ghost"
                           size="sm"
                           className="flex-1 h-7 text-[10px]"
                           onClick={() => { setPartyPopoverOpen(false); navigate("/party"); }}
                           data-testid="button-party-popover-find"
                         >
                           {language === 'tr' ? 'Parti Bul / Oluştur' : 'Find / Create Party'}
                         </Button>
                       </div>
                     </div>
                   )}
                 </PopoverContent>
               </Popover>
             </div>
             
             {/* Notification Bell */}
             <NotificationBell />
             
             {/* Test Mode Toggle - Only visible in dev mode for admin users */}
             {canAccessTestMode && (
               <div className="hidden md:block">
                 <Button 
                   variant={debugMode ? "destructive" : "secondary"} 
                   size="sm" 
                   onClick={toggleDebugMode}
                   className={cn("font-bold transition-all", debugMode && "animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]")}
                 >
                   <TestTube className="w-5 h-5 mr-2" weight="fill" />
                   {debugMode ? t(language, 'testModeOn') : t(language, 'testMode')}
                 </Button>
               </div>
             )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6 relative">
           <div className="max-w-6xl mx-auto min-h-full flex flex-col">
             {children}
           </div>
           
        </main>
        
        <ItemNotificationStack />
        <GuildInvitePopup />
        <SilentErrorBoundary><PartyInvitePopup /></SilentErrorBoundary>
        <DungeonPartyInvitePopup />
        <ActiveTaskIndicator />
        
        <Dialog open={raidWarningOpen} onOpenChange={setRaidWarningOpen}>
          <DialogContent className="sm:max-w-md" data-testid="raid-warning-dialog-desktop">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-400">
                <WarningCircle className="w-5 h-5" weight="fill" />
                {t(language, "raidInProgress")}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t(language, "raidLeaveWarning")}
            </p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleCancelLeaveRaid} data-testid="button-stay-in-raid-desktop">
                {t(language, "stayInRaid")}
              </Button>
              <Button variant="destructive" onClick={handleConfirmLeaveRaid} data-testid="button-leave-raid-desktop">
                {t(language, "leaveRaid")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dungeonWarningOpen} onOpenChange={setDungeonWarningOpen}>
          <DialogContent className="sm:max-w-md" data-testid="dungeon-warning-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-400">
                <WarningCircle className="w-5 h-5" weight="fill" />
                Active Dungeon
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              You are in an active dungeon. Leaving will disconnect you from your party.
            </p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => { setDungeonWarningOpen(false); setPendingPath(null); }} data-testid="button-stay-in-dungeon">
                Stay
              </Button>
              <Button variant="destructive" onClick={() => { setDungeonWarningOpen(false); if (pendingPath) navigate(pendingPath); setPendingPath(null); }} data-testid="button-leave-dungeon">
                Leave
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dungeonReconnectOpen} onOpenChange={setDungeonReconnectOpen}>
          <DialogContent className="sm:max-w-md" data-testid="dungeon-reconnect-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-400">
                <Door className="w-5 h-5" weight="fill" />
                Active Dungeon Session
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Your party is still fighting in a dungeon. Would you like to rejoin?
            </p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => {
                setDungeonReconnectOpen(false);
              }} data-testid="button-leave-dungeon-session">
                Dismiss
              </Button>
              <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => { setDungeonReconnectOpen(false); navigate('/party-dungeon-run'); }} data-testid="button-rejoin-dungeon">
                Rejoin
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Alpha Test Notification Dialog */}
        <Dialog open={alphaDialogOpen} onOpenChange={(open) => { if (!open) playSfx('ui', 'dialog_close'); setAlphaDialogOpen(open); }}>
          <DialogContent className="sm:max-w-md" data-testid="alpha-notification-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-400">
                <Bell className="w-5 h-5" weight="fill" />
                {t(language, "alphaTestNotification")}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t(language, "alphaTestDescription")}
              </DialogDescription>
            </DialogHeader>
            <a 
              href="https://thronecreator.itch.io/idlethrone" 
              target="_blank" 
              rel="noopener noreferrer"
              className="block text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors cursor-pointer"
              onClick={() => setAlphaDialogOpen(false)}
            >
              {t(language, "alphaTestLink")}
            </a>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setAlphaDialogOpen(false)} data-testid="button-cancel-alpha">
                {t(language, "close")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      <PartyMemberDetailDialog
        member={selectedPartyMember}
        party={currentParty ? { leaderId: currentParty.leaderId } : null}
        currentPlayerId={player?.id}
        isOpen={partyMemberDetailOpen}
        onClose={() => { setPartyMemberDetailOpen(false); setSelectedPartyMember(null); }}
      />

      <QueueFAB />

      </div>
      </div>
    </div>
  );
}
