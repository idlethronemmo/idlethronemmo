import { Switch, Route, Redirect, useLocation } from "wouter";
import { GameProvider, useGame } from "@/context/GameContext";
import { ItemNotificationProvider } from "@/context/ItemNotificationContext";
import { AudioProvider } from "@/context/AudioContext";
import { TradeProvider } from "@/context/TradeContext";
import { GuildProvider } from "@/context/GuildContext";
import { ItemInspectProvider } from "@/context/ItemInspectContext";
import { ChatItemShareProvider, useChatItemShare } from "@/context/ChatItemShareContext";
import { RaidLockProvider } from "@/context/RaidLockContext";
import { StartupPhase, useStartupPhase } from "@/context/StartupPhaseContext";
import { GameUpdatePopup } from "@/components/game/GameUpdatePopup";
import { ItemInspectPopup } from "@/components/game/ItemInspectPopup";
import { MythicCraftPopup } from "@/components/game/MythicCraftPopup";
import { MythicDropPopup } from "@/components/game/MythicDropPopup";
import { PushNotificationPrompt } from "@/components/game/PushNotificationPrompt";
import { GuildBonusSyncer } from "@/components/game/GuildBonusSyncer";
import { AudioGameBridge } from "@/components/game/AudioGameBridge";
import GameLayout from "@/components/game/GameLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { lazy, Suspense, useEffect, memo, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import GlobalChatSidebar from "@/components/game/GlobalChatSidebar";
import PrivateMessagePanel from "@/components/game/PrivateMessagePanel";
import MobileChatFAB from "@/components/game/MobileChatFAB";
import { apiRequest } from "@/lib/queryClient";
import { getAuthHeaders } from "@/context/FirebaseAuthContext";
import { hideSplash } from "./lib/splash";
import { useAchievementTracker } from "@/hooks/useAchievementTracker";
import { t } from "@/lib/i18n";
import GameDashboard from "@/pages/GameDashboard";

const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const SkillPage = lazy(() => import("@/pages/SkillPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const Skills = lazy(() => import("@/pages/Skills"));
const InventoryPage = lazy(() => import("@/pages/InventoryPage"));
const CombatPage = lazy(() => import("@/pages/CombatPage"));
const CraftingPage = lazy(() => import("@/pages/CraftingPage"));
const CookingPage = lazy(() => import("@/pages/CookingPage"));
const AlchemyPage = lazy(() => import("@/pages/AlchemyPage"));
const FireMakingPage = lazy(() => import("@/pages/FireMakingPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const MarketPage = lazy(() => import("@/pages/MarketPage"));
const TradePage = lazy(() => import("@/pages/TradePage"));
const GuildPage = lazy(() => import("@/pages/GuildPage"));
const PartyPage = lazy(() => import("@/pages/PartyPage"));
const RaidPage = lazy(() => import("@/pages/RaidPage"));
const ScoreboardPage = lazy(() => import("@/pages/ScoreboardPage"));
const TravelPage = lazy(() => import("@/pages/TravelPage"));
const CreatePartyPage = lazy(() => import("@/pages/CreatePartyPage"));
const DungeonPage = lazy(() => import("@/pages/DungeonPage"));
const DungeonRunPage = lazy(() => import("@/pages/DungeonRunPage"));
const DungeonPartyCreatePage = lazy(() => import("@/pages/DungeonPartyCreatePage"));
const PartyDungeonRunPage = lazy(() => import("@/pages/PartyDungeonRunPage"));
const ComingSoon = lazy(() => import("@/pages/ComingSoon"));
const DailyRewardsPage = lazy(() => import("@/pages/DailyRewardsPage"));
const NpcShopPage = lazy(() => import("@/pages/NpcShopPage"));
const EnhancementPage = lazy(() => import("@/pages/EnhancementPage"));
const AchievementsPage = lazy(() => import("@/pages/AchievementsPage"));
const NotFound = lazy(() => import("@/pages/not-found"));

const preloadPages = () => {
  const preloaders = [
    () => import("@/pages/CombatPage"),
    () => import("@/pages/InventoryPage"),
    () => import("@/pages/SkillPage"),
    () => import("@/pages/GuildPage"),
  ];
  
  let index = 0;
  const preloadNext = () => {
    if (index >= preloaders.length) return;
    preloaders[index]();
    index++;
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(preloadNext, { timeout: 3000 });
    } else {
      setTimeout(preloadNext, 100);
    }
  };
  
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(preloadNext, { timeout: 2000 });
  } else {
    setTimeout(preloadNext, 1000);
  }
};

function PageFallback() {
  const { language } = useGame();
  return (
    <div className="flex-1 flex items-center justify-center min-h-[200px]">
      <div className="text-muted-foreground text-sm">{t(language, 'loading')}</div>
    </div>
  );
}

const AchievementTrackerInit = memo(function AchievementTrackerInit() {
  useAchievementTracker();
  return null;
});

const GameRoutes = memo(function GameRoutes() {
  useEffect(() => {
    preloadPages();
  }, []);

  return (
    <Switch>
      <Route path="/">
        <Redirect to="/profile" />
      </Route>
      <Route path="/profile">
        <Suspense fallback={<PageFallback />}>
          <ProfilePage />
        </Suspense>
      </Route>
      <Route path="/profile/:username">
        {(params) => (
          <Suspense fallback={<PageFallback />}>
            <ProfilePage />
          </Suspense>
        )}
      </Route>
      <Route path="/skill/crafting">
        <Redirect to="/crafting" />
      </Route>
      <Route path="/skill/alchemy">
        <Redirect to="/alchemy" />
      </Route>
      <Route path="/skill/cooking">
        <Suspense fallback={<PageFallback />}>
          <CookingPage />
        </Suspense>
      </Route>
      <Route path="/skill/firemaking">
        <Suspense fallback={<PageFallback />}>
          <FireMakingPage />
        </Suspense>
      </Route>
      <Route path="/skill/:id">
        {(params) => (
          <Suspense fallback={<PageFallback />}>
            <SkillPage />
          </Suspense>
        )}
      </Route>
      <Route path="/skills">
        <Suspense fallback={<PageFallback />}>
          <Skills />
        </Suspense>
      </Route>
      <Route path="/combat">
        <Suspense fallback={<PageFallback />}>
          <CombatPage />
        </Suspense>
      </Route>
      <Route path="/travel">
        <Suspense fallback={<PageFallback />}>
          <TravelPage />
        </Suspense>
      </Route>
      <Route path="/dungeons">
        <Suspense fallback={<PageFallback />}>
          <DungeonPage />
        </Suspense>
      </Route>
      <Route path="/dungeon-run">
        <Suspense fallback={<PageFallback />}>
          <DungeonRunPage />
        </Suspense>
      </Route>
      <Route path="/dungeon-party">
        <Suspense fallback={<PageFallback />}>
          <DungeonPartyCreatePage />
        </Suspense>
      </Route>
      <Route path="/party-dungeon-run">
        <Suspense fallback={<PageFallback />}>
          <PartyDungeonRunPage />
        </Suspense>
      </Route>
      <Route path="/inventory">
        <Suspense fallback={<PageFallback />}>
          <InventoryPage />
        </Suspense>
      </Route>
      <Route path="/market">
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <MarketPage />
          </Suspense>
        </ErrorBoundary>
      </Route>
      <Route path="/crafting">
        <Suspense fallback={<PageFallback />}>
          <CraftingPage />
        </Suspense>
      </Route>
      <Route path="/alchemy">
        <Suspense fallback={<PageFallback />}>
          <AlchemyPage />
        </Suspense>
      </Route>
      <Route path="/quests">
        <Suspense fallback={<PageFallback />}>
          <ComingSoon />
        </Suspense>
      </Route>
      <Route path="/guild">
        <Suspense fallback={<PageFallback />}>
          <GuildPage />
        </Suspense>
      </Route>
      <Route path="/party">
        <Suspense fallback={<PageFallback />}>
          <PartyPage />
        </Suspense>
      </Route>
      <Route path="/create-party">
        <Suspense fallback={<PageFallback />}>
          <CreatePartyPage />
        </Suspense>
      </Route>
      <Route path="/raids">
        <Suspense fallback={<PageFallback />}>
          <RaidPage />
        </Suspense>
      </Route>
      <Route path="/trade">
        <Suspense fallback={<PageFallback />}>
          <TradePage />
        </Suspense>
      </Route>
      <Route path="/scoreboard">
        <Suspense fallback={<PageFallback />}>
          <ScoreboardPage />
        </Suspense>
      </Route>
      <Route path="/achievements">
        <Suspense fallback={<PageFallback />}>
          <AchievementsPage />
        </Suspense>
      </Route>
      <Route path="/settings">
        <Suspense fallback={<PageFallback />}>
          <SettingsPage />
        </Suspense>
      </Route>
      <Route path="/daily-rewards">
        <Suspense fallback={<PageFallback />}>
          <DailyRewardsPage />
        </Suspense>
      </Route>
      <Route path="/npc-shop">
        <Suspense fallback={<PageFallback />}>
          <NpcShopPage />
        </Suspense>
      </Route>
      <Route path="/enhancement">
        <Suspense fallback={<PageFallback />}>
          <EnhancementPage />
        </Suspense>
      </Route>
      <Route path="/ctrl-x9k3m7pnl">
        <Suspense fallback={<PageFallback />}>
          <AdminPage />
        </Suspense>
      </Route>
      <Route>
        <Suspense fallback={<PageFallback />}>
          <NotFound />
        </Suspense>
      </Route>
    </Switch>
  );
});

function GameRouter() {
  const { needsOnboarding, completeOnboarding, isLoading, language } = useGame();
  const { advanceToPhase } = useStartupPhase();
  const splashHiddenRef = useRef(false);

  useEffect(() => {
    if (!isLoading) {
      advanceToPhase(StartupPhase.PLAYER);
      // Hide splash when game is ready
      if (!splashHiddenRef.current) {
        splashHiddenRef.current = true;
        hideSplash();
      }
    }
  }, [isLoading, advanceToPhase]);

  // Show loading indicator with inline styles (works before CSS loads)
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'hsl(230, 25%, 12%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'hsl(220, 15%, 60%)', fontSize: '14px' }}>{t(language, 'gameLoading')}</div>
      </div>
    );
  }

  if (needsOnboarding) {
    return (
      <Suspense fallback={null}>
        <OnboardingPage onComplete={completeOnboarding} />
      </Suspense>
    );
  }

  return (
    <GameLayout>
      <GameRoutes />
    </GameLayout>
  );
}

function MessagingLayer() {
  const isMobile = useIsMobile();
  const { player } = useGame();
  const [location] = useLocation();
  const [isGlobalChatOpen, setIsGlobalChatOpen] = useState(false);
  const [isPmPanelOpen, setIsPmPanelOpen] = useState(false);
  const [unreadGlobalCount, setUnreadGlobalCount] = useState(0);
  const globalChatWasOpenRef = useRef(false);
  const { openChatRequested, clearOpenChatRequest } = useChatItemShare();

  useEffect(() => {
    if (openChatRequested) {
      setIsGlobalChatOpen(true);
      clearOpenChatRequest();
    }
  }, [openChatRequested, clearOpenChatRequest]);

  const markGlobalChatRead = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/chat/global/mark-read");
      setUnreadGlobalCount(0);
    } catch {}
  }, []);
  
  useEffect(() => {
    if (isMobile && isGlobalChatOpen) {
      setIsGlobalChatOpen(false);
    }
  }, [location]);

  useEffect(() => {
    if (isGlobalChatOpen && !globalChatWasOpenRef.current) {
      markGlobalChatRead();
    }
    globalChatWasOpenRef.current = isGlobalChatOpen;
  }, [isGlobalChatOpen, markGlobalChatRead]);

  const { pollGlobalChatUnreadCount, pollPmUnreadCount } = useGame();
  
  useEffect(() => {
    if (!isGlobalChatOpen) {
      setUnreadGlobalCount(pollGlobalChatUnreadCount);
    }
  }, [pollGlobalChatUnreadCount, isGlobalChatOpen]);

  const handleOpenGlobalChat = useCallback(() => {
    setUnreadGlobalCount(0);
    markGlobalChatRead();
    setIsGlobalChatOpen(true);
  }, [markGlobalChatRead]);

  const handleCloseGlobalChat = useCallback(() => {
    markGlobalChatRead();
    setIsGlobalChatOpen(false);
  }, [markGlobalChatRead]);
  
  const unreadCount = pollPmUnreadCount;
  
  return (
    <>
      {!isMobile && (
        <GlobalChatSidebar
          isOpen={isGlobalChatOpen}
          onToggle={() => setIsGlobalChatOpen(prev => {
            if (prev) {
              markGlobalChatRead();
              return false;
            }
            setUnreadGlobalCount(0);
            markGlobalChatRead();
            return true;
          })}
          onOpenPm={() => setIsPmPanelOpen(true)}
          unreadPmCount={unreadCount}
          unreadGlobalCount={unreadGlobalCount}
        />
      )}
      
      <PrivateMessagePanel
        isOpen={isPmPanelOpen}
        onClose={() => setIsPmPanelOpen(false)}
      />
      
      {isMobile && (
        <MobileChatFAB
          unreadPmCount={unreadCount}
          unreadGlobalCount={unreadGlobalCount}
          onOpenGlobalChat={handleOpenGlobalChat}
          onOpenPrivateMessages={() => setIsPmPanelOpen(true)}
        />
      )}
      
      {isMobile && isGlobalChatOpen && (
        <GlobalChatSidebar
          isOpen={true}
          onToggle={handleCloseGlobalChat}
          fullScreen
          onOpenPm={() => {
            setIsGlobalChatOpen(false);
            setIsPmPanelOpen(true);
          }}
          unreadPmCount={unreadCount}
          unreadGlobalCount={0}
        />
      )}
    </>
  );
}

function EnhancementPrefetch() {
  const { player } = useGame();
  const queryClient = useQueryClient();
  const prefetched = useRef(false);
  useEffect(() => {
    if (!player || prefetched.current) return;
    prefetched.current = true;
    queryClient.prefetchQuery({
      queryKey: ["/api/enhancements"],
      queryFn: async () => {
        const headers = await getAuthHeaders();
        const response = await fetch("/api/enhancements", { credentials: "include", headers });
        if (!response.ok) throw new Error("Failed to fetch enhancements");
        return response.json();
      },
      staleTime: 30000,
    });
  }, [player, queryClient]);
  return null;
}

export default function AuthenticatedApp() {
  return (
    <ItemNotificationProvider>
      <AudioProvider>
      <GameProvider>
        <GuildProvider>
          <GuildBonusSyncer />
          <AudioGameBridge />
          <RaidLockProvider>
            <TradeProvider>
              <ItemInspectProvider>
                <ChatItemShareProvider>
                  <EnhancementPrefetch />
                  <AchievementTrackerInit />
                  <GameRouter />
                  <MessagingLayer />
                  <ItemInspectPopup />
                  <MythicCraftPopup />
                  <MythicDropPopup />
                  <PushNotificationPrompt />
                  <GameUpdatePopup />
                </ChatItemShareProvider>
              </ItemInspectProvider>
            </TradeProvider>
          </RaidLockProvider>
        </GuildProvider>
      </GameProvider>
      </AudioProvider>
    </ItemNotificationProvider>
  );
}
