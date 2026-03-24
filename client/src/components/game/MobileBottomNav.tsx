import { useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  Sword, 
  Backpack, 
  DotsThree,
  Axe,
  Trophy,
  Storefront,
  Gear,
  User,
  X,
  Handshake,
  UsersThree,
  UsersFour,
  Skull,
  Warning,
  Shield,
  Compass,
  Door,
  Bell,
  Heart,
  Gift,
  ShoppingCart,
  Sparkle,
  Medal
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useGameStatus } from "@/context/GameContext";
import { useRaidLock } from "@/context/RaidLockContext";
import { t } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-mobile";
import MobileTaskPuck from "./MobileTaskPuck";
import { QueueManagementSheet } from "./QueueDialog";
import { ListPlus } from "@phosphor-icons/react";
import { useFirebaseAuth, getAuthHeaders } from "@/context/FirebaseAuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ADMIN_ALLOWED_EMAILS = ["betelgeusestd@gmail.com", "yusufakgn61@gmail.com"];

type NavItem = {
  icon: React.ElementType;
  labelKey: string;
  path: string;
};

const MOBILE_NAV_ITEMS: NavItem[] = [
  { icon: Compass, labelKey: "travel", path: "/travel" },
  { icon: Sword, labelKey: "combat", path: "/combat" },
  { icon: Axe, labelKey: "skills", path: "/skills" },
  { icon: Backpack, labelKey: "inventory", path: "/inventory" },
];

// Menu item with optional group header
type MenuGroup = {
  groupKey?: string;
  items: NavItem[];
};

const MORE_MENU_GROUPS: MenuGroup[] = [
  // Personal - Profile at top
  {
    groupKey: "personal",
    items: [
      { icon: User, labelKey: "profile", path: "/profile" },
    ]
  },
  // Economy
  {
    groupKey: "economy",
    items: [
      { icon: Storefront, labelKey: "market", path: "/market" },
      { icon: ShoppingCart, labelKey: "npcShop", path: "/npc-shop" },
      { icon: Sparkle, labelKey: "enhancement", path: "/enhancement" },
      { icon: Handshake, labelKey: "trade", path: "/trade" },
      { icon: Gift, labelKey: "dailyRewards", path: "/daily-rewards" },
    ]
  },
  // Social/Group Content
  {
    groupKey: "social",
    items: [
      { icon: UsersFour, labelKey: "party", path: "/party" },
      { icon: UsersThree, labelKey: "guild", path: "/guild" },
      { icon: Skull, labelKey: "raids", path: "/raids" },
      { icon: Door, labelKey: "dungeons", path: "/dungeons" },
      { icon: Trophy, labelKey: "scoreboard", path: "/scoreboard" },
      { icon: Medal, labelKey: "achievements", path: "/achievements" },
    ]
  },
  // Settings alone at bottom (no group header)
  {
    items: [
      { icon: Gear, labelKey: "settings", path: "/settings" },
    ]
  },
];

// Flatten for backward compatibility
const MORE_MENU_ITEMS: NavItem[] = MORE_MENU_GROUPS.flatMap(g => g.items);

export default function MobileBottomNav() {
  const [location, navigate] = useLocation();
  const { language, activeTask, isInCombat, pendingTradeCount, staffRole } = useGameStatus();
  const { isRaidLocked, isDungeonLocked } = useRaidLock();
  const { user } = useFirebaseAuth();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [raidWarningOpen, setRaidWarningOpen] = useState(false);
  const [queueSheetOpen, setQueueSheetOpen] = useState(false);
  const [dungeonWarningOpen, setDungeonWarningOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [alphaDialogOpen, setAlphaDialogOpen] = useState(false);
  const isMobile = useIsMobile();
  
  const hasActiveEngagement = !!(activeTask || isInCombat);
  const isAdmin = user?.email ? ADMIN_ALLOWED_EMAILS.includes(user.email) : false;

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
    enabled: !!user,
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
    navigate(path);
  }, [navigate, isRaidLocked, isDungeonLocked]);

  const handleConfirmLeaveRaid = useCallback(() => {
    if (pendingPath) {
      navigate(pendingPath);
    }
    setRaidWarningOpen(false);
    setPendingPath(null);
  }, [pendingPath, navigate]);

  const handleCancelLeaveRaid = useCallback(() => {
    setRaidWarningOpen(false);
    setPendingPath(null);
  }, []);

  const handleAlphaConfirm = useCallback(() => {
    setAlphaDialogOpen(false);
    window.open('https://thronecreator.itch.io/idlethrone', '_blank');
  }, []);

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    if (path === "/skills") return location.startsWith("/skill") || location === "/skills";
    return location.startsWith(path);
  };

  const menuGroups: MenuGroup[] = isAdmin 
    ? [...MORE_MENU_GROUPS, { items: [{ icon: Shield, labelKey: "admin", path: "/ctrl-x9k3m7pnl" }] }]
    : !isAdmin && staffRole
    ? [...MORE_MENU_GROUPS, { items: [{ icon: Shield, labelKey: "staff", path: "/ctrl-x9k3m7pnl?staff=1" }] }]
    : MORE_MENU_GROUPS;
  
  // Flatten for active check
  const menuItems = menuGroups.flatMap(g => g.items);
  const isMoreActive = menuItems.some(item => isActive(item.path));

  const handleMoreClick = useCallback(() => {
    setMoreMenuOpen(prev => !prev);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMoreMenuOpen(false);
  }, []);

  if (!isMobile) {
    return null;
  }

  const navContent = (
    <>
      {moreMenuOpen && (
        <div 
          className="fixed inset-0 z-[9997] bg-black/50 backdrop-blur-sm"
          onClick={handleCloseMenu}
          data-testid="more-menu-overlay"
        />
      )}
      
      {moreMenuOpen && (
        <div 
          className="fixed right-4 z-[9998] bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[180px]"
          style={{ 
            bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
          }}
          data-testid="more-menu-popup"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
            <span className="font-display font-bold text-sm">{t(language, "menu")}</span>
            <button 
              onClick={handleCloseMenu}
              className="p-1 rounded-md hover:bg-accent"
              data-testid="close-more-menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="py-2 max-h-[60vh] overflow-y-auto">
            {menuGroups.map((group, groupIndex) => (
              <div key={groupIndex}>
                {group.groupKey && (
                  <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium border-t border-border/30 mt-1 first:mt-0 first:border-t-0">
                    {t(language, `menu${group.groupKey.charAt(0).toUpperCase() + group.groupKey.slice(1)}` as any)}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  const isDailyRewards = item.path === '/daily-rewards';
                  const showDailyIndicator = isDailyRewards && hasDailyRewardAvailable && !active;
                  const isTrade = item.path === '/trade';
                  const showTradeIndicator = isTrade && pendingTradeCount > 0 && !active;
                  return (
                    <button
                      type="button"
                      key={item.path}
                      onClick={() => {
                        handleCloseMenu();
                        handleNavigate(item.path);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        active 
                          ? "text-primary bg-primary/10" 
                          : "text-foreground hover:bg-accent",
                        showDailyIndicator && "bg-amber-500/10",
                        showTradeIndicator && "bg-cyan-500/10"
                      )}
                      data-testid={`more-menu-${item.labelKey}`}
                    >
                      <div className="relative">
                        <Icon className={cn("w-5 h-5", showDailyIndicator && "text-amber-400", showTradeIndicator && "text-cyan-400")} weight={active ? "fill" : "regular"} />
                        {showDailyIndicator && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                        )}
                        {showTradeIndicator && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                        )}
                      </div>
                      <span className="font-ui text-sm">
                        {t(language, item.labelKey as any)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            
            {/* Alpha Test & Donate Buttons */}
            <div className="border-t border-border/30 mt-2 pt-2 px-2 space-y-1">
              <button
                type="button"
                onClick={() => {
                  handleCloseMenu();
                  setAlphaDialogOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors text-amber-400 hover:bg-amber-500/10 rounded-md"
                data-testid="more-menu-alpha-test"
              >
                <Bell className="w-5 h-5" weight="fill" />
                <span className="font-ui text-sm">{t(language, "alphaNotification")}</span>
              </button>
              <a
                href="https://thronecreator.itch.io/idlethrone/donate"
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleCloseMenu}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors text-pink-400 hover:bg-pink-500/10 rounded-md"
                data-testid="more-menu-donate"
              >
                <Heart className="w-5 h-5" weight="fill" />
                <span className="font-ui text-sm">{t(language, "donate")}</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {hasActiveEngagement && (
        <>
          <MobileTaskPuck className="fixed left-3 z-[9999]" style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }} onQueueBadgeClick={() => setQueueSheetOpen(true)} />
          <QueueManagementSheet open={queueSheetOpen} onClose={() => setQueueSheetOpen(false)} />
        </>
      )}
      
      <nav 
        className="fixed left-0 right-0 bottom-0 z-[9999] bg-background/95 backdrop-blur-lg border-t border-border"
        style={{ 
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: 'translate3d(0,0,0)',
          WebkitTransform: 'translate3d(0,0,0)',
          position: 'fixed',
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden',
          willChange: 'transform',
          containIntrinsicSize: 'auto',
        }}
        data-testid="mobile-bottom-nav"
      >
        <div className="flex items-center justify-around h-16 px-2">
          {MOBILE_NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            
            return (
              <button
                type="button"
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-w-[56px] h-full px-2 rounded-lg transition-all duration-200",
                  active
                    ? "text-primary"
                    : "text-muted-foreground active:bg-accent"
                )}
                data-testid={`nav-${item.labelKey}`}
              >
                <div className={cn(
                  "relative p-1.5 rounded-full transition-all",
                  active && "bg-primary/20"
                )}>
                  <Icon 
                    className={cn("w-6 h-6", active && "drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]")} 
                    weight={active ? "fill" : "regular"} 
                  />
                </div>
                <span className={cn(
                  "text-[10px] font-ui tracking-wide",
                  active && "font-semibold"
                )}>
                  {t(language, item.labelKey as any)}
                </span>
              </button>
            );
          })}
          
          <button
            type="button"
            onClick={handleMoreClick}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 min-w-[56px] h-full px-2 rounded-lg transition-all duration-200",
              (moreMenuOpen || isMoreActive)
                ? "text-primary"
                : "text-muted-foreground active:bg-accent"
            )}
            data-testid="nav-more"
          >
            <div className={cn(
              "relative p-1.5 rounded-full transition-all",
              (moreMenuOpen || isMoreActive) && "bg-primary/20"
            )}>
              <DotsThree 
                className={cn("w-6 h-6", (moreMenuOpen || isMoreActive) && "drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]")} 
                weight={(moreMenuOpen || isMoreActive) ? "fill" : "regular"} 
              />
              {hasDailyRewardAvailable && !moreMenuOpen && (
                <span className="absolute top-0.5 right-0 w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse" />
              )}
              {pendingTradeCount > 0 && !hasDailyRewardAvailable && !moreMenuOpen && (
                <span className="absolute top-0.5 right-0 w-2.5 h-2.5 bg-cyan-400 rounded-full animate-pulse" />
              )}
            </div>
            <span className={cn(
              "text-[10px] font-ui tracking-wide",
              (moreMenuOpen || isMoreActive) && "font-semibold"
            )}>
              {t(language, "more")}
            </span>
          </button>
        </div>
      </nav>

      <Dialog open={raidWarningOpen} onOpenChange={setRaidWarningOpen}>
        <DialogContent className="sm:max-w-md" data-testid="raid-warning-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <Warning className="w-5 h-5" weight="fill" />
              {t(language, "raidInProgress")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t(language, "raidLeaveWarning")}
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancelLeaveRaid} data-testid="button-stay-in-raid">
              {t(language, "stayInRaid")}
            </Button>
            <Button variant="destructive" onClick={handleConfirmLeaveRaid} data-testid="button-leave-raid">
              {t(language, "leaveRaid")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dungeonWarningOpen} onOpenChange={setDungeonWarningOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dungeon-warning-dialog-mobile">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <Warning className="w-5 h-5" weight="fill" />
              Active Dungeon
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You are in an active dungeon. Leaving will disconnect you from your party.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setDungeonWarningOpen(false); setPendingPath(null); }} data-testid="button-stay-in-dungeon-mobile">
              Stay
            </Button>
            <Button variant="destructive" onClick={() => { setDungeonWarningOpen(false); if (pendingPath) navigate(pendingPath); setPendingPath(null); }} data-testid="button-leave-dungeon-mobile">
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alpha Test Notification Dialog */}
      <Dialog open={alphaDialogOpen} onOpenChange={setAlphaDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="alpha-notification-dialog-mobile">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <Bell className="w-5 h-5" weight="fill" />
              {t(language, "alphaTestNotification")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t(language, "alphaTestDescription")}
          </p>
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
            <Button variant="outline" onClick={() => setAlphaDialogOpen(false)} data-testid="button-cancel-alpha-mobile">
              {t(language, "close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return createPortal(navContent, document.body);
}
