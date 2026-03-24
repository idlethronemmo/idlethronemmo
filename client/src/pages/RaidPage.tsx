import { useState, useEffect, useRef, useCallback } from "react";
import { useGame } from "@/context/GameContext";
import { useGuild } from "@/context/GuildContext";
import PartyMemberDetailDialog from "@/components/game/PartyMemberDetailDialog";
import type { PartyMemberData } from "@/components/game/PartyMemberDetailDialog";
import { useLanguage } from "@/context/LanguageContext";
import { useRaidLock } from "@/context/RaidLockContext";
import { getAuthHeaders } from "@/context/FirebaseAuthContext";
import { t, type Language } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Skull, Sword, Shield, Trophy, Lightning, Fire, Snowflake, Moon, ShoppingCart, Coins, Target, Users, Clock, TrendUp, Heart, Timer, Sparkle, CaretUp, Cookie, Flask, Lock, Hammer, CheckCircle, Star, Package } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNumber } from "@/lib/gameMath";
import { useToast } from "@/hooks/use-toast";
import { useMobile } from "@/hooks/useMobile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getItems, getItemById, translateItemDescription, translateItemName, formatItemIdAsName } from "@/lib/items";
import { getItemImage } from "@/lib/itemImages";

const BOSS_ICONS: Record<string, any> = {
  flame: Fire,
  snowflake: Snowflake,
  moon: Moon,
  zap: Lightning,
  skull: Skull,
};

const DIFFICULTY_COLORS: Record<string, string> = {
  normal: "bg-gray-600",
  hard: "bg-blue-600",
  nightmare: "bg-purple-600",
  mythic: "bg-orange-600",
};

const getDifficultyLabel = (difficulty: string, language: Language) => {
  const labels: Record<string, string> = {
    normal: t(language, 'difficultyNormal'),
    hard: t(language, 'difficultyHard'),
    nightmare: t(language, 'difficultyNightmare'),
    mythic: t(language, 'difficultyMythic'),
  };
  return labels[difficulty] || difficulty;
};

const DIFFICULTY_GLOW: Record<string, string> = {
  normal: "shadow-gray-500/50",
  hard: "shadow-blue-500/50",
  nightmare: "shadow-purple-500/50",
  mythic: "shadow-orange-500/50",
};

interface FloatingDamage {
  id: number;
  value: number;
  x: number;
  y: number;
  isPlayer?: boolean;
}

interface CombatLogEntry {
  id: number;
  message: string;
  type: "damage" | "critical" | "skill" | "info" | "boss_hit" | "heal" | "death" | "debuff";
  timestamp: number;
}

interface ServerCombatEvent {
  time: number;
  type: string;
  message: string;
  damage?: number;
}

export default function RaidPage() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const { 
    player, 
    currentHitpoints, 
    maxHitpoints,
    inventory,
    selectedFood,
    setSelectedFood,
    autoEatEnabled,
    setAutoEatEnabled,
    autoEatThreshold,
    setAutoEatThreshold,
    activeBuffs,
    usePotion,
    debugMode
  } = useGame();
  const { isInGuild, myGuild, myMembership } = useGuild();
  const { isMobile } = useMobile();
  const queryClient = useQueryClient();
  const { setRaidLocked } = useRaidLock();
  
  const [selectedTab, setSelectedTab] = useState("boss");
  const [startRaidOpen, setStartRaidOpen] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState("normal");
  const [isAttacking, setIsAttacking] = useState(false);
  const [combatTimer, setCombatTimer] = useState(0);
  const [playerAttackProgress, setPlayerAttackProgress] = useState(0);
  const [bossAttackProgress, setBossAttackProgress] = useState(0);
  const [playerCurrentHp, setPlayerCurrentHp] = useState(100);
  const [playerMaxHp, setPlayerMaxHp] = useState(100);
  const [displayBossHp, setDisplayBossHp] = useState(0);
  const [floatingDamages, setFloatingDamages] = useState<FloatingDamage[]>([]);
  const [combatLog, setCombatLog] = useState<CombatLogEntry[]>([]);
  const [showResultModal, setShowResultModal] = useState(false);
  const [lastAttackResult, setLastAttackResult] = useState<any>(null);
  const [bossShake, setBossShake] = useState(false);
  const [playerShake, setPlayerShake] = useState(false);
  const [pendingPotionId, setPendingPotionId] = useState<string | null>(null);
  const [activeDebuffs, setActiveDebuffs] = useState<string[]>([]);
  const [selectedMember, setSelectedMember] = useState<PartyMemberData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const damageIdRef = useRef(0);
  const logIdRef = useRef(0);
  const combatLogRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const lastPlayerAttackTimeRef = useRef(0);
  const lastBossAttackTimeRef = useRef(0);
  
  // Daily reset countdown state
  const [resetCountdown, setResetCountdown] = useState("");
  
  // Raid Forge state
  const [forgePopupRecipe, setForgePopupRecipe] = useState<any>(null);
  const [craftResult, setCraftResult] = useState<{ rarity: string; itemId: string } | null>(null);
  const craftingRecipeRef = useRef<any>(null);

  // Boss Chest state
  const [chestPopupId, setChestPopupId] = useState<string | null>(null);
  const [chestRewards, setChestRewards] = useState<any[] | null>(null);
  
  // Calculate time until next UTC midnight (daily reset)
  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      const utcMidnight = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0, 0
      ));
      const diff = utcMidnight.getTime() - now.getTime();
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setResetCountdown(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };
    
    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: currentBoss, isLoading: bossLoading } = useQuery({
    queryKey: ["/api/raids/current-boss"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/current-boss", {
        credentials: "include",
        headers: authHeaders
      });
      return res.json();
    },
    enabled: !!player,
  });

  const { data: activeRaid, isLoading: raidLoading, refetch: refetchRaid } = useQuery({
    queryKey: ["/api/raids/active"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/active", { 
        credentials: "include",
        headers: authHeaders
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isInGuild,
  });

  const { data: raidTokens } = useQuery({
    queryKey: ["/api/raids/tokens"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/tokens", { 
        credentials: "include",
        headers: authHeaders
      });
      if (!res.ok) return { balance: 0, totalEarned: 0, totalSpent: 0 };
      return res.json();
    },
    enabled: !!player,
  });

  const { data: shopItems, isLoading: shopLoading, error: shopError } = useQuery({
    queryKey: ["/api/raids/shop"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/shop", {
        credentials: "include",
        headers: authHeaders
      });
      if (!res.ok) {
        throw new Error("Failed to fetch shop items");
      }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!player,
  });

  const { data: forgeRecipes, isLoading: forgeLoading } = useQuery({
    queryKey: ["/api/raids/forge/recipes"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/forge/recipes", {
        credentials: "include",
        headers: authHeaders
      });
      if (!res.ok) throw new Error("Failed to fetch forge recipes");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!player,
  });

  const craftForgeMutation = useMutation({
    mutationFn: async (recipeId: string) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/forge/craft", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ recipeId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Crafting failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setCraftResult({ rarity: data.rarity, itemId: data.item?.id || craftingRecipeRef.current?.result_item_id || "" });
      queryClient.invalidateQueries({ queryKey: ["/api/player"] });
      queryClient.invalidateQueries({ queryKey: ["/api/raids/forge/recipes"] });
    },
    onError: (err: any) => {
      toast({ title: "Craft Failed", description: err.message, variant: "destructive" });
    },
  });

  const openChestMutation = useMutation({
    mutationFn: async (chestItemId: string) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/open-chest", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ chestItemId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to open chest");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setChestRewards(data.rewards || []);
      queryClient.invalidateQueries({ queryKey: ["/api/player"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to Open Chest", description: err.message, variant: "destructive" });
    },
  });

  const { data: activityPoints } = useQuery({
    queryKey: ["/api/raids/activity-points"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/activity-points", { 
        credentials: "include",
        headers: authHeaders
      });
      if (!res.ok) return { current: 0, total: 0 };
      return res.json();
    },
    enabled: isInGuild,
  });


  const { data: completedRaid, refetch: refetchCompletedRaid } = useQuery({
    queryKey: ["/api/raids/completed"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/completed", { 
        credentials: "include",
        headers: authHeaders
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isInGuild && !activeRaid?.raid,
  });

  const [showRewardsDialog, setShowRewardsDialog] = useState(false);
  const [claimedRewards, setClaimedRewards] = useState<any>(null);
  const [isClaimingRewards, setIsClaimingRewards] = useState(false);

  const startRaidMutation = useMutation({
    mutationFn: async ({ bossId, difficulty }: { bossId: string; difficulty: string }) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({ bossId, difficulty }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to start raid");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t(language, 'raidStarted'), description: t(language, 'raidStartedDesc') });
      refetchRaid();
      setStartRaidOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: t(language, 'error'), description: error.message, variant: "destructive" });
    }
  });

  const attackMutation = useMutation({
    mutationFn: async (params: { autoEatEnabled: boolean; autoEatThreshold: number; selectedFood: string | null; testMode?: boolean }) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to attack");
      }
      return res.json();
    },
    onError: (error: Error) => {
      toast({ title: t(language, 'attackFailed'), description: error.message, variant: "destructive" });
      setIsAttacking(false);
    }
  });

  const purchaseItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/shop/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({ itemId }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to purchase");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.grantedBadge) {
        toast({ title: "🏆 Raid Conqueror Badge Earned!", description: "The legendary Raid Conqueror badge has been added to your account." });
        queryClient.invalidateQueries({ queryKey: ["/api/player/badges"] });
      } else {
        toast({ title: t(language, 'purchaseSuccessful'), description: t(language, 'purchaseSuccessfulDesc') });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/raids/tokens"] });
    },
    onError: (error: Error) => {
      toast({ title: t(language, 'purchaseFailed'), description: error.message, variant: "destructive" });
    }
  });

  const resetAttacksMutation = useMutation({
    mutationFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/reset-attacks", {
        method: "POST",
        credentials: "include",
        headers: authHeaders,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to reset");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t(language, 'attacksReset'), description: t(language, 'attacksResetDesc') });
      refetchRaid();
    },
    onError: (error: Error) => {
      toast({ title: t(language, 'resetFailed'), description: error.message, variant: "destructive" });
    }
  });

  const handleClaimRewards = async () => {
    setIsClaimingRewards(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/raids/claim-completion-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        toast({ title: t(language, 'error'), description: error.error, variant: "destructive" });
        return;
      }
      const data = await res.json();
      setClaimedRewards(data);
      setShowRewardsDialog(true);
      refetchCompletedRaid();
      queryClient.invalidateQueries({ queryKey: ["/api/raids/tokens"] });
    } catch (error) {
      toast({ title: t(language, 'error'), description: "Failed to claim rewards", variant: "destructive" });
    } finally {
      setIsClaimingRewards(false);
    }
  };

  const isDev = import.meta.env.DEV;

  const addFloatingDamage = useCallback((value: number, isPlayer: boolean = false) => {
    const id = damageIdRef.current++;
    const x = 30 + Math.random() * 40;
    const y = 20 + Math.random() * 30;
    setFloatingDamages(prev => [...prev, { id, value, x, y, isPlayer }]);
    setTimeout(() => {
      setFloatingDamages(prev => prev.filter(d => d.id !== id));
    }, 1500);
  }, []);

  const addCombatLog = useCallback((message: string, type: CombatLogEntry["type"]) => {
    const id = logIdRef.current++;
    setCombatLog(prev => [{ id, message, type, timestamp: Date.now() }, ...prev.slice(0, 20)]);
  }, []);

  // Animation speed: 1x means real-time playback
  // Bars fill at actual attack speed (2.4s for player, 3.0s for boss)
  const ANIMATION_SPEED = 1;
  
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setRaidLocked(isAttacking);
    return () => setRaidLocked(false);
  }, [isAttacking, setRaidLocked]);
  
  const handleAttack = async () => {
    // Cannot attack with 0 HP - must eat food first
    if (currentHitpoints <= 0) {
      toast({ title: t(language, 'cannotAttack'), description: t(language, 'needToEatFood'), variant: "destructive" });
      return;
    }
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    setIsAttacking(true);
    setCombatLog([]);
    setActiveDebuffs([]);
    setPlayerAttackProgress(0);
    setBossAttackProgress(0);
    
    const initialBossHp = activeRaid?.raid?.current_hp || 0;
    setDisplayBossHp(initialBossHp);
    
    addCombatLog(t(language, 'combatStarted'), "info");
    
    try {
      const data = await attackMutation.mutateAsync({
        autoEatEnabled,
        autoEatThreshold,
        selectedFood,
        testMode: debugMode,
      });
      setLastAttackResult(data);
      setPlayerMaxHp(data.playerMaxHp || 240);
      setPlayerCurrentHp(data.playerMaxHp || 240);
      
      const serverLog: ServerCombatEvent[] = data.combatLog || [];
      const playerAttackSpeed = data.playerAttackSpeed || 2.4;
      const bossAttackSpeed = data.bossAttackSpeed || 3.0;
      
      if (serverLog.length === 0) {
        setShowResultModal(true);
        setIsAttacking(false);
        refetchRaid();
        queryClient.invalidateQueries({ queryKey: ["/api/raids/tokens"] });
        return;
      }
      
      const maxTime = Math.max(...serverLog.map(e => e.time));
      const animationDuration = (maxTime / ANIMATION_SPEED) * 1000;
      
      let currentPlayerHp = data.playerMaxHp || 240;
      let currentBossHp = initialBossHp;
      let eventIndex = 0;
      const startTime = Date.now();
      
      // Reset refs at start of combat
      lastPlayerAttackTimeRef.current = 0;
      lastBossAttackTimeRef.current = 0;
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const simTime = (elapsed / 1000) * ANIMATION_SPEED;
        
        setCombatTimer(Math.max(0, Math.ceil((animationDuration - elapsed) / 1000)));
        
        // FIRST: Process events and update attack times
        while (eventIndex < serverLog.length && serverLog[eventIndex].time <= simTime) {
          const event = serverLog[eventIndex];
          
          switch (event.type) {
            case 'player_hit':
              lastPlayerAttackTimeRef.current = event.time;
              currentBossHp = Math.max(0, currentBossHp - (event.damage || 0));
              setDisplayBossHp(currentBossHp);
              addFloatingDamage(event.damage || 0, false);
              setBossShake(true);
              setTimeout(() => setBossShake(false), 150);
              addCombatLog(event.message, "damage");
              break;
            case 'player_crit':
              lastPlayerAttackTimeRef.current = event.time;
              currentBossHp = Math.max(0, currentBossHp - (event.damage || 0));
              setDisplayBossHp(currentBossHp);
              addFloatingDamage(event.damage || 0, false);
              setBossShake(true);
              setTimeout(() => setBossShake(false), 200);
              addCombatLog(event.message, "critical");
              break;
            case 'player_miss':
              lastPlayerAttackTimeRef.current = event.time;
              addCombatLog(event.message, "info");
              break;
            case 'boss_hit':
              lastBossAttackTimeRef.current = event.time;
              currentPlayerHp = Math.max(0, currentPlayerHp - (event.damage || 0));
              setPlayerCurrentHp(currentPlayerHp);
              setPlayerShake(true);
              setTimeout(() => setPlayerShake(false), 150);
              addCombatLog(event.message, "boss_hit");
              break;
            case 'boss_burst':
              lastBossAttackTimeRef.current = event.time;
              currentPlayerHp = Math.max(0, currentPlayerHp - (event.damage || 0));
              setPlayerCurrentHp(currentPlayerHp);
              setPlayerShake(true);
              setTimeout(() => setPlayerShake(false), 250);
              addCombatLog(event.message, "boss_hit");
              break;
            case 'boss_miss':
              lastBossAttackTimeRef.current = event.time;
              addCombatLog(event.message, "info");
              break;
            case 'auto_eat':
            case 'heal_reduced':
              const healMatch = event.message.match(/(\d+) HP/);
              if (healMatch) {
                currentPlayerHp = Math.min(data.playerMaxHp, currentPlayerHp + parseInt(healMatch[1]));
                setPlayerCurrentHp(currentPlayerHp);
              }
              addCombatLog(event.message, "heal");
              break;
            case 'boss_skill':
              setActiveDebuffs(prev => [...prev, 'mortal_wounds']);
              addCombatLog(event.message, "debuff");
              break;
            case 'death':
              addCombatLog(event.message, "death");
              break;
            case 'penalty':
              addCombatLog(event.message, "info");
              break;
            default:
              addCombatLog(event.message, "info");
          }
          
          eventIndex++;
        }
        
        // THEN: Calculate progress based on updated attack times
        const timeSincePlayerAttack = simTime - lastPlayerAttackTimeRef.current;
        const timeSinceBossAttack = simTime - lastBossAttackTimeRef.current;
        const playerProgress = Math.min(100, (timeSincePlayerAttack / playerAttackSpeed) * 100);
        const bossProgress = Math.min(100, (timeSinceBossAttack / bossAttackSpeed) * 100);
        setPlayerAttackProgress(playerProgress);
        setBossAttackProgress(bossProgress);
        
        if (elapsed < animationDuration) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          animationRef.current = null;
          setIsAttacking(false);
          setCombatTimer(0);
          setPlayerAttackProgress(0);
          setBossAttackProgress(0);
          setShowResultModal(true);
          refetchRaid();
          queryClient.invalidateQueries({ queryKey: ["/api/raids/tokens"] });
        }
      };
      
      animationRef.current = requestAnimationFrame(animate);
      
    } catch (error: any) {
      toast({ title: t(language, 'attackFailed'), description: error.message, variant: "destructive" });
      setIsAttacking(false);
    }
  };

  useEffect(() => {
    if (combatLogRef.current) {
      combatLogRef.current.scrollTop = 0;
    }
  }, [combatLog]);

  if (!isInGuild) {
    return (
      <div className={cn("container mx-auto p-4", isMobile && "pb-24")}>
        <Card className="bg-card/80 backdrop-blur border-border/50">
          <CardContent className="p-8 text-center">
            <Skull className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">{t(language, 'guildRequired')}</h2>
            <p className="text-muted-foreground">
              {t(language, 'guildRequiredDesc')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const raid = activeRaid?.raid;
  const participation = activeRaid?.participation;
  const leaderboard = activeRaid?.leaderboard || [];

  const BossIcon = raid ? BOSS_ICONS[raid.boss_icon] || Skull : (currentBoss ? BOSS_ICONS[currentBoss.icon] || Skull : Skull);
  const hpPercent = raid ? (raid.current_hp / raid.max_hp) * 100 : 100;

  return (
    <>
    <div className={cn("container mx-auto p-2 md:p-4 space-y-3 md:space-y-4", isMobile && "pb-24")}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-2 md:mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Skull className="w-6 h-6 md:w-8 md:h-8 text-red-500" />
            {t(language, 'guildRaids')}
          </h1>
          <p className="text-sm text-muted-foreground">{t(language, 'guildRaidsDesc')}</p>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex items-center gap-1.5 md:gap-2 bg-purple-900/30 px-3 py-1.5 md:px-4 md:py-2 rounded-lg">
            <Coins className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
            <span className="font-bold text-purple-300 text-sm md:text-base">{formatNumber(raidTokens?.balance || 0)}</span>
            <span className="text-xs text-muted-foreground hidden md:inline">{t(language, 'tokens')}</span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 bg-amber-900/30 px-3 py-1.5 md:px-4 md:py-2 rounded-lg">
            <TrendUp className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
            <span className="font-bold text-amber-300 text-sm md:text-base">{formatNumber(activityPoints?.current || 0)}</span>
            <span className="text-xs text-muted-foreground hidden md:inline">{t(language, 'activity')}</span>
          </div>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4 h-10 md:h-11">
          <TabsTrigger value="boss" className="flex items-center gap-1 text-xs md:text-sm" data-testid="tab-boss">
            <Target className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">{t(language, 'bossBattle')}</span>
            <span className="sm:hidden">Boss</span>
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="flex items-center gap-1 text-xs md:text-sm" data-testid="tab-leaderboard">
            <Trophy className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">{t(language, 'leaderboard')}</span>
            <span className="sm:hidden">Ranks</span>
          </TabsTrigger>
          <TabsTrigger value="shop" className="flex items-center gap-1 text-xs md:text-sm" data-testid="tab-shop">
            <ShoppingCart className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">{t(language, 'tokenShop')}</span>
            <span className="sm:hidden">Shop</span>
          </TabsTrigger>
          <TabsTrigger value="forge" className="flex items-center gap-1 text-xs md:text-sm" data-testid="tab-forge">
            <Hammer className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Raid Forge</span>
            <span className="sm:hidden">Forge</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="boss" className="space-y-3 md:space-y-4 mt-3 md:mt-4">
          {!raid ? (
            <>
            {completedRaid?.raid && (
              <Card className="bg-gradient-to-br from-amber-900/40 to-green-900/40 border-amber-500/50 overflow-hidden animate-pulse-slow" data-testid="completed-raid-banner">
                <CardContent className="p-4 md:p-6">
                  <div className="flex flex-col md:flex-row items-center gap-4">
                    <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-amber-800/60 to-green-800/60 rounded-2xl flex items-center justify-center border border-amber-500/40 overflow-hidden flex-shrink-0">
                      {completedRaid.raid.boss_icon_path ? (
                        <img src={`/${completedRaid.raid.boss_icon_path}`} alt={completedRaid.raid.boss_name} className="w-full h-full object-cover" />
                      ) : (
                        <Trophy className="w-10 h-10 text-amber-400" weight="fill" />
                      )}
                    </div>
                    <div className="flex-1 text-center md:text-left">
                      <div className="flex items-center gap-2 justify-center md:justify-start mb-1">
                        <Badge className={completedRaid.raid.status === 'completed' ? "bg-green-600" : "bg-red-600"}>
                          {completedRaid.raid.status === 'completed' ? t(language, 'bossDefeated') : t(language, 'raidFailed')}
                        </Badge>
                        <Badge className={cn(DIFFICULTY_COLORS[completedRaid.raid.difficulty])}>
                          {getDifficultyLabel(completedRaid.raid.difficulty, language)}
                        </Badge>
                      </div>
                      <h3 className="text-lg md:text-xl font-bold">{completedRaid.raid.boss_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t(language, 'yourDamage')}: {formatNumber(completedRaid.participation?.total_damage || 0)} | {t(language, 'tokensEarned')}: {completedRaid.participation?.tokens_earned || 0}
                      </p>
                    </div>
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-amber-500 to-green-500 hover:from-amber-600 hover:to-green-600 text-black font-bold shadow-lg shadow-amber-500/30 h-14 px-8"
                      onClick={handleClaimRewards}
                      disabled={isClaimingRewards}
                      data-testid="btn-claim-raid-rewards"
                    >
                      <Trophy className="w-5 h-5 mr-2" weight="fill" />
                      {isClaimingRewards ? t(language, 'claiming') : t(language, 'collectRewards')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 border-border/50 overflow-hidden">
              <CardContent className="p-4 md:p-6">
                {currentBoss ? (
                  <div className="space-y-4 md:space-y-6">
                    <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6">
                      <div className="relative">
                        <div className="w-28 h-28 md:w-32 md:h-32 bg-gradient-to-br from-red-900/60 to-orange-900/60 rounded-2xl flex items-center justify-center shadow-2xl shadow-red-500/20 border border-red-500/30 overflow-hidden">
                          {currentBoss.icon_path ? (
                            <img 
                              src={`/${currentBoss.icon_path}`} 
                              alt={currentBoss.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <BossIcon className="w-16 h-16 md:w-20 md:h-20 text-red-400 drop-shadow-lg" />
                          )}
                        </div>
                        <div className="absolute -top-2 -right-2">
                          <Badge variant="outline" className="text-amber-400 border-amber-400/50 bg-black/50 text-[10px] md:text-xs">
                            {t(language, 'thisWeek')}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex-1 text-center md:text-left">
                        <h2 className="text-xl md:text-2xl font-bold mb-1">{currentBoss.name}</h2>
                        <p className="text-muted-foreground text-sm">{currentBoss.description}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                      <div className="bg-gray-800/50 rounded-lg p-2.5 md:p-3 text-center border border-red-500/20">
                        <p className="text-[10px] md:text-xs text-muted-foreground">{t(language, 'baseHp')}</p>
                        <p className="text-base md:text-lg font-bold text-red-400">{formatNumber(currentBoss.base_hp)}</p>
                      </div>
                      <div className="bg-gray-800/50 rounded-lg p-2.5 md:p-3 text-center border border-orange-500/20">
                        <p className="text-[10px] md:text-xs text-muted-foreground">{t(language, 'attack')}</p>
                        <p className="text-base md:text-lg font-bold text-orange-400">{currentBoss.attack_level}</p>
                      </div>
                      <div className="bg-gray-800/50 rounded-lg p-2.5 md:p-3 text-center border border-amber-500/20">
                        <p className="text-[10px] md:text-xs text-muted-foreground">{t(language, 'strength')}</p>
                        <p className="text-base md:text-lg font-bold text-amber-400">{currentBoss.strength_level}</p>
                      </div>
                      <div className="bg-gray-800/50 rounded-lg p-2.5 md:p-3 text-center border border-green-500/20">
                        <p className="text-[10px] md:text-xs text-muted-foreground">{t(language, 'defence')}</p>
                        <p className="text-base md:text-lg font-bold text-green-400">{currentBoss.defence_level}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm text-muted-foreground">{t(language, 'bossSkills')}</h3>
                      <div className="flex flex-wrap gap-2">
                        {currentBoss.skills?.map((skill: any) => (
                          <TooltipProvider key={skill.id}>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="secondary" className="bg-red-900/30 text-red-300 border border-red-500/30">
                                  <Lightning className="w-3 h-3 mr-1" />
                                  {skill.name}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{skill.description}</p>
                                <p className="text-xs text-muted-foreground">{Math.round(skill.chance * 100)}% {t(language, 'chance')}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ))}
                      </div>
                    </div>

                    {['leader', 'officer'].includes(myMembership?.role || '') && (
                      <div className="flex flex-col md:flex-row gap-3">
                        <Dialog open={startRaidOpen} onOpenChange={setStartRaidOpen}>
                          <DialogTrigger asChild>
                            <Button size="lg" className="flex-1 h-12 md:h-14 text-base md:text-lg bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 shadow-lg shadow-red-500/25" data-testid="btn-start-raid">
                              <Sword className="w-5 h-5 md:w-6 md:h-6 mr-2" />
                              {t(language, 'startGuildRaid')}
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Start Raid - {currentBoss.name}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div>
                                <label className="text-sm font-medium mb-2 block">{t(language, 'difficulty')}</label>
                                <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="normal">{t(language, 'normalDesc')}</SelectItem>
                                    <SelectItem value="hard">{t(language, 'hardDesc')}</SelectItem>
                                    <SelectItem value="nightmare">{t(language, 'nightmareDesc')}</SelectItem>
                                    <SelectItem value="mythic">{t(language, 'mythicDesc')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="bg-muted/50 rounded-lg p-4">
                                <p className="text-sm">
                                  <strong>{t(language, 'duration')}:</strong> {t(language, 'sevenDays')}
                                </p>
                                <p className="text-sm">
                                  <strong>{t(language, 'bossHp')}:</strong> {formatNumber(currentBoss.base_hp * (selectedDifficulty === 'normal' ? 1 : selectedDifficulty === 'hard' ? 3 : selectedDifficulty === 'nightmare' ? 10 : 25))}
                                </p>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setStartRaidOpen(false)}>{t(language, 'cancel')}</Button>
                              <Button
                                onClick={() => startRaidMutation.mutate({ bossId: currentBoss.id, difficulty: selectedDifficulty })}
                                disabled={startRaidMutation.isPending}
                                className="bg-gradient-to-r from-red-600 to-orange-600"
                              >
                                {t(language, 'startRaid')}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Skull className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">{t(language, 'noBossAvailable')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
            </>
          ) : (
            <div className="space-y-3 md:space-y-4">
              <Card className={cn(
                "bg-gradient-to-br from-gray-900/95 to-gray-800/95 border-border/50 overflow-hidden relative",
                isAttacking && "border-red-500/50"
              )}>
                {isAttacking && (
                  <div className="absolute inset-0 bg-gradient-to-t from-red-900/20 to-transparent pointer-events-none animate-pulse" />
                )}
                <CardContent className="p-3 md:p-6 space-y-4 md:space-y-6">
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={cn(DIFFICULTY_COLORS[raid.difficulty], "text-xs md:text-sm")}>
                        {getDifficultyLabel(raid.difficulty, language)}
                      </Badge>
                      <Badge variant="outline" className="text-muted-foreground text-xs">
                        <Clock className="w-3 h-3 mr-1" />
                        {t(language, 'ends')} {new Date(raid.ends_at).toLocaleDateString()}
                      </Badge>
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-center">{raid.boss_name}</h2>
                  </div>

                  <div className="relative flex flex-col items-center">
                    <div 
                      className={cn(
                        "relative w-36 h-36 md:w-48 md:h-48 rounded-2xl flex items-center justify-center transition-all duration-100",
                        "bg-gradient-to-br from-red-900/60 to-orange-900/60",
                        "shadow-2xl border-2",
                        DIFFICULTY_GLOW[raid.difficulty],
                        isAttacking ? "border-red-500 shadow-red-500/40" : "border-red-500/30",
                        bossShake && "translate-x-1"
                      )}
                      style={{
                        boxShadow: isAttacking ? '0 0 60px rgba(239, 68, 68, 0.4)' : undefined
                      }}
                    >
                      {(raid.boss_icon_path || currentBoss?.icon_path) ? (
                        <img 
                          src={`/${raid.boss_icon_path || currentBoss?.icon_path}`} 
                          alt={raid.boss_name}
                          className={cn(
                            "w-full h-full object-cover transition-transform",
                            isAttacking && "animate-pulse"
                          )}
                        />
                      ) : (
                        <BossIcon 
                          className={cn(
                            "w-20 h-20 md:w-28 md:h-28 text-red-400 drop-shadow-lg transition-transform",
                            isAttacking && "animate-pulse"
                          )} 
                        />
                      )}
                      
                      {floatingDamages.map(fd => (
                        <div
                          key={fd.id}
                          className="absolute font-bold text-yellow-300 text-lg md:text-xl animate-bounce pointer-events-none"
                          style={{
                            left: `${fd.x}%`,
                            top: `${fd.y}%`,
                            animation: 'floatUp 1.5s ease-out forwards',
                            textShadow: '0 0 10px rgba(234, 179, 8, 0.8)'
                          }}
                        >
                          -{formatNumber(fd.value)}
                        </div>
                      ))}
                    </div>

                    {isAttacking && (
                      <div className="mt-4 w-full max-w-md space-y-3">
                        <div className="flex items-center gap-3 bg-red-900/40 px-4 py-2 rounded-full border border-red-500/50 justify-center">
                          <Timer className="w-5 h-5 text-red-400 animate-spin" />
                          <span className="font-bold text-xl text-red-300">{combatTimer}s</span>
                          <span className="text-sm text-red-200">{t(language, 'combatInProgress')}</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-blue-300 flex items-center gap-1">
                                <Sword className="w-3 h-3" /> {t(language, 'yourAttack')}
                              </span>
                              <span className="text-blue-400 font-mono text-[10px]">
                                {Math.round(playerAttackProgress)}%
                              </span>
                            </div>
                            <div className={cn(
                              "h-3 bg-gray-800 rounded-full overflow-hidden border",
                              playerAttackProgress >= 95 ? "border-blue-400 shadow-blue-400/50 shadow-md" : "border-blue-500/30"
                            )}>
                              <div 
                                className={cn(
                                  "h-full bg-gradient-to-r from-blue-500 to-blue-400",
                                  playerAttackProgress >= 95 && "from-blue-400 to-cyan-300"
                                )}
                                style={{ width: `${playerAttackProgress}%` }}
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-red-300 flex items-center gap-1">
                                <Skull className="w-3 h-3" /> {t(language, 'bossAttack')}
                              </span>
                              <span className="text-red-400 font-mono text-[10px]">
                                {Math.round(bossAttackProgress)}%
                              </span>
                            </div>
                            <div className={cn(
                              "h-3 bg-gray-800 rounded-full overflow-hidden border",
                              bossAttackProgress >= 95 ? "border-red-400 shadow-red-400/50 shadow-md" : "border-red-500/30"
                            )}>
                              <div 
                                className={cn(
                                  "h-full bg-gradient-to-r from-red-600 to-red-500",
                                  bossAttackProgress >= 95 && "from-red-500 to-orange-400"
                                )}
                                style={{ width: `${bossAttackProgress}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className={cn(
                              "flex items-center gap-1",
                              playerShake && "text-red-400"
                            )}>
                              <Heart className="w-3 h-3" weight="fill" /> {t(language, 'yourHp')}
                            </span>
                            <span className={cn(
                              "font-bold",
                              playerCurrentHp / playerMaxHp > 0.5 ? "text-green-400" :
                              playerCurrentHp / playerMaxHp > 0.25 ? "text-yellow-400" : "text-red-400"
                            )}>
                              {playerCurrentHp} / {playerMaxHp}
                            </span>
                          </div>
                          <div className={cn(
                            "h-4 bg-gray-800 rounded-full overflow-hidden border transition-all",
                            playerShake ? "border-red-500 shadow-red-500/50 shadow-lg" : "border-green-500/30"
                          )}>
                            <div 
                              className={cn(
                                "h-full transition-all duration-200",
                                playerCurrentHp / playerMaxHp > 0.5 ? "bg-gradient-to-r from-green-600 to-green-500" :
                                playerCurrentHp / playerMaxHp > 0.25 ? "bg-gradient-to-r from-yellow-600 to-yellow-500" :
                                "bg-gradient-to-r from-red-600 to-red-500"
                              )}
                              style={{ width: `${(playerCurrentHp / playerMaxHp) * 100}%` }}
                            />
                          </div>
                        </div>
                        
                        {activeDebuffs.length > 0 && (
                          <div className="flex items-center gap-2 justify-center">
                            {activeDebuffs.includes('mortal_wounds') && (
                              <Badge className="bg-purple-900/60 text-purple-300 border-purple-500/50 animate-pulse">
                                <Skull className="w-3 h-3 mr-1" />
                                {t(language, 'mortalWounds')}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="flex items-center gap-1.5">
                        <Heart className="w-4 h-4 text-red-400" weight="fill" />
                        {t(language, 'bossHp')}
                      </span>
                      <span className="font-bold text-red-400">
                        {formatNumber(isAttacking ? displayBossHp : raid.current_hp)} / {formatNumber(raid.max_hp)}
                      </span>
                    </div>
                    <div className="relative">
                      <Progress 
                        value={isAttacking ? (displayBossHp / raid.max_hp) * 100 : hpPercent} 
                        className="h-5 md:h-6 bg-gray-800 rounded-full overflow-hidden"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-white drop-shadow-lg">
                          {(isAttacking ? (displayBossHp / raid.max_hp) * 100 : hpPercent).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] md:text-xs text-muted-foreground px-1">
                      {[100, 75, 50, 25, 0].map(m => (
                        <span key={m} className={cn(hpPercent <= m && m !== 100 && "text-green-400 font-bold")}>
                          {m === 0 ? t(language, 'kill') : `${m}%`}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                    <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/40 rounded-xl p-2.5 md:p-3 border border-purple-500/30">
                      <p className="text-[10px] md:text-xs text-purple-300">{t(language, 'yourDamage')}</p>
                      <p className="text-lg md:text-xl font-bold text-purple-400">{formatNumber(participation?.total_damage || 0)}</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/40 rounded-xl p-2.5 md:p-3 border border-blue-500/30">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] md:text-xs text-blue-300">{t(language, 'attacksToday')}</p>
                        {isDev && (
                          <button 
                            onClick={() => resetAttacksMutation.mutate()}
                            disabled={resetAttacksMutation.isPending}
                            className="text-[9px] bg-blue-600 hover:bg-blue-700 px-1.5 py-0.5 rounded text-white"
                            data-testid="btn-reset-attacks"
                          >
                            {t(language, 'reset')}
                          </button>
                        )}
                      </div>
                      <p className="text-lg md:text-xl font-bold text-blue-400">{participation?.attacks_today || 0} / 5</p>
                    </div>
                    <div className="bg-gradient-to-br from-amber-900/40 to-amber-800/40 rounded-xl p-2.5 md:p-3 border border-amber-500/30">
                      <p className="text-[10px] md:text-xs text-amber-300">{t(language, 'streak')}</p>
                      <div className="flex items-center gap-1">
                        <p className="text-lg md:text-xl font-bold text-amber-400">{participation?.current_streak || 0}</p>
                        <Fire className="w-4 h-4 text-amber-400" weight="fill" />
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-green-900/40 to-green-800/40 rounded-xl p-2.5 md:p-3 border border-green-500/30">
                      <p className="text-[10px] md:text-xs text-green-300">{t(language, 'guildDamage')}</p>
                      <p className="text-lg md:text-xl font-bold text-green-400">{formatNumber(raid.total_damage)}</p>
                    </div>
                  </div>

                  {combatLog.length > 0 && (
                    <div className={cn(
                      "bg-black/40 rounded-xl border p-3 transition-all",
                      isAttacking ? "border-red-500/50" : "border-gray-700"
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Sword className="w-4 h-4 text-amber-400" />
                          <span className="text-sm font-semibold">{t(language, 'combatLog')}</span>
                        </div>
                        {isAttacking && (
                          <Badge variant="outline" className="text-red-400 border-red-500/50 animate-pulse text-xs">
                            {t(language, 'live')}
                          </Badge>
                        )}
                      </div>
                      <ScrollArea className="h-24 md:h-32">
                        <div ref={combatLogRef} className="space-y-1 font-mono text-[11px] md:text-xs">
                          {combatLog.map(entry => (
                            <div 
                              key={entry.id}
                              className={cn(
                                "py-0.5",
                                entry.type === "damage" && "text-green-400",
                                entry.type === "critical" && "text-yellow-400 font-bold",
                                entry.type === "skill" && "text-purple-400",
                                entry.type === "info" && "text-gray-400",
                                entry.type === "boss_hit" && "text-red-400",
                                entry.type === "heal" && "text-emerald-400",
                                entry.type === "death" && "text-red-600 font-bold",
                                entry.type === "debuff" && "text-purple-500 font-semibold"
                              )}
                            >
                              {entry.message}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Auto-Eat & Potion Section */}
                  <div className={cn(
                    "bg-gradient-to-r from-amber-900/20 to-purple-900/20 rounded-xl border p-3 space-y-3",
                    isMobile ? "border-amber-500/30" : "border-amber-500/20"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cookie className="w-4 h-4 text-amber-400" weight="duotone" />
                        <span className="text-sm font-medium text-amber-300">{t(language, 'raidConsumables')}</span>
                      </div>
                      <Badge variant="outline" className="text-xs text-muted-foreground border-border/50">
                        {t(language, 'hp')}: {currentHitpoints}/{maxHitpoints}
                      </Badge>
                    </div>
                    
                    {/* Auto-Eat Toggle & Threshold */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={autoEatEnabled} 
                          onCheckedChange={setAutoEatEnabled}
                          data-testid="switch-raid-auto-eat"
                        />
                        <span className="text-xs text-muted-foreground">{t(language, 'autoEat')}</span>
                      </div>
                      
                      {autoEatEnabled && (
                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30">
                          <span className="text-[10px] text-amber-400 font-medium">%{autoEatThreshold}</span>
                          <Slider
                            value={[autoEatThreshold]}
                            onValueChange={([v]) => setAutoEatThreshold(v)}
                            min={10}
                            max={90}
                            step={5}
                            className="w-20"
                            data-testid="slider-raid-auto-eat"
                          />
                        </div>
                      )}
                    </div>
                    
                    {/* Food & Potions Row */}
                    <div className="flex flex-wrap gap-2">
                      {/* Food Items */}
                      {(() => {
                        const allItems = getItems();
                        const foodItems = Object.entries(inventory)
                          .filter(([itemId, qty]) => {
                            if (qty <= 0) return false;
                            const item = allItems.find(i => i.id === itemId);
                            return item?.type === "food";
                          })
                          .slice(0, isMobile ? 4 : 6);
                        
                        return foodItems.map(([itemId, qty]) => {
                          const itemData = allItems.find(i => i.id === itemId);
                          const isSelected = selectedFood === itemId;
                          return (
                            <TooltipProvider key={itemId}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => setSelectedFood(isSelected ? null : itemId)}
                                    className={cn(
                                      "relative p-1.5 rounded border-2 transition-all",
                                      isSelected
                                        ? "bg-amber-500/40 border-amber-400 ring-2 ring-amber-400/50"
                                        : "bg-card/50 border-border/50 hover:border-amber-500/50"
                                    )}
                                    data-testid={`btn-raid-food-${itemId}`}
                                  >
                                    <div className="w-8 h-8 flex items-center justify-center">
                                      {itemData?.name && getItemImage(itemData.name) ? (
                                        <img src={getItemImage(itemData.name)!} alt={itemData.name} className="w-[90%] h-[90%] object-contain pixelated" />
                                      ) : (
                                        <Cookie className="w-[70%] h-[70%] text-amber-400" weight="fill" />
                                      )}
                                    </div>
                                    <span className="absolute -bottom-1 -right-1 text-[9px] bg-black/80 px-1 rounded text-amber-300">
                                      {qty}
                                    </span>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">{itemData?.name || translateItemName(itemId, language)}</p>
                                  <p className="text-xs text-muted-foreground">{t(language, 'clickToSelectAutoEat')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        });
                      })()}
                      
                      {/* Divider */}
                      {(() => {
                        const allItems = getItems();
                        const hasPotions = Object.entries(inventory).some(([id, q]) => {
                          if (q <= 0) return false;
                          const item = allItems.find(i => i.id === id);
                          return item?.type === "potion";
                        });
                        return hasPotions ? <div className="w-px h-10 bg-border/50 mx-1" /> : null;
                      })()}
                      
                      {/* Potion Items */}
                      {(() => {
                        const allItems = getItems();
                        const potionItems = Object.entries(inventory)
                          .filter(([itemId, qty]) => {
                            if (qty <= 0) return false;
                            const item = allItems.find(i => i.id === itemId);
                            return item?.type === "potion";
                          })
                          .slice(0, isMobile ? 3 : 5);
                        
                        return potionItems.map(([itemId, qty]) => {
                          const item = getItemById(itemId);
                          const isActive = activeBuffs.some(b => b.potionId === itemId);
                          const isPending = pendingPotionId === itemId;
                          if (isActive) return (
                            <TooltipProvider key={itemId}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className="relative p-1.5 rounded border-2 bg-purple-500/40 border-purple-400 ring-2 ring-purple-400/50 opacity-60"
                                    data-testid={`btn-raid-potion-${itemId}`}
                                  >
                                    <div className="w-8 h-8 flex items-center justify-center">
                                      <img src={getItemImage(itemId)} alt={item?.name || formatItemIdAsName(itemId)} className="w-[90%] h-[90%] object-contain pixelated" />
                                    </div>
                                    <span className="absolute -bottom-1 -right-1 text-[9px] bg-black/80 px-1 rounded text-purple-300">{qty}</span>
                                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-medium">{item?.name || formatItemIdAsName(itemId)}</p>
                                  <p className="text-xs text-purple-300">{t(language, 'activeStatus')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                          return (
                            <Popover key={itemId} open={isPending} onOpenChange={(open) => setPendingPotionId(open ? itemId : null)}>
                              <PopoverTrigger asChild>
                                <button
                                  className={cn(
                                    "relative p-1.5 rounded border-2 transition-all",
                                    isPending
                                      ? "bg-purple-500/30 border-purple-500/70 ring-1 ring-purple-500/50"
                                      : "bg-card/50 border-border/50 hover:border-purple-500/50"
                                  )}
                                  data-testid={`btn-raid-potion-${itemId}`}
                                >
                                  <div className="w-8 h-8 flex items-center justify-center">
                                    <img src={getItemImage(itemId)} alt={item?.name || formatItemIdAsName(itemId)} className="w-[90%] h-[90%] object-contain pixelated" />
                                  </div>
                                  <span className="absolute -bottom-1 -right-1 text-[9px] bg-black/80 px-1 rounded text-purple-300">{qty}</span>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="bottom" align="start" className="w-auto min-w-[220px] bg-gray-900/95 border-purple-500/50 backdrop-blur-sm p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <img src={getItemImage(itemId)} alt={item?.name || formatItemIdAsName(itemId)} className="w-10 h-10 object-contain rounded-lg bg-purple-500/20 p-1" />
                                  <div>
                                    <div className="text-sm font-bold text-purple-200">{item?.name || formatItemIdAsName(itemId)}</div>
                                    <div className="text-xs text-gray-400">{t(language, 'inInventory')}: {qty}</div>
                                  </div>
                                </div>
                                {item?.effect && item?.duration && (
                                  <div className="text-sm text-purple-300 mb-3 p-2 bg-purple-500/15 rounded-lg border border-purple-500/30">
                                    <div className="font-medium">
                                      {item.effect.type === "attack_boost" && t(language, 'attack')}
                                      {item.effect.type === "strength_boost" && t(language, 'strength')}
                                      {item.effect.type === "defence_boost" && t(language, 'defence')}
                                      {item.effect.type === "crit_chance" && t(language, 'critical')}
                                      {item.effect.type === "damage_reduction" && t(language, 'protection')}
                                      {item.effect.type === "hp_regen" && t(language, 'hpRegen')}
                                      {item.effect.type === "xp_boost" && "XP Boost"}
                                      {item.effect.type === "maxHpBoost" && "Max HP Boost"}
                                      {item.effect.type === "lifesteal" && "Lifesteal"}
                                      {item.effect.type === "poison_immunity" && t(language, 'poisonImmunity')}
                                    </div>
                                    <div className="text-purple-400 mt-0.5">
                                      {item.effect.type === "hp_regen"
                                        ? `${item.effect.value} HP/s • ${Math.floor(item.duration / 60)} ${t(language, 'minutes')}`
                                        : `+${item.effect.value}% • ${Math.floor(item.duration / 60)} ${t(language, 'minutes')}`
                                      }
                                    </div>
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      usePotion(itemId);
                                      setPendingPotionId(null);
                                    }}
                                    className="flex-1 px-3 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
                                  >
                                    {t(language, 'drink')}
                                  </button>
                                  <button
                                    onClick={() => setPendingPotionId(null)}
                                    className="flex-1 px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
                                  >
                                    {t(language, 'cancel')}
                                  </button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  <Button
                    size="lg"
                    className={cn(
                      "w-full h-14 md:h-16 text-base md:text-lg font-bold transition-all",
                      currentHitpoints <= 0
                        ? "bg-gray-700 cursor-not-allowed"
                        : isAttacking 
                          ? "bg-gray-700 cursor-not-allowed" 
                          : "bg-gradient-to-r from-red-600 via-orange-600 to-red-600 hover:from-red-700 hover:via-orange-700 hover:to-red-700 shadow-lg shadow-red-500/30 hover:shadow-red-500/50"
                    )}
                    onClick={handleAttack}
                    disabled={isAttacking || attackMutation.isPending || (participation?.attacks_today || 0) >= 5 || currentHitpoints <= 0}
                    data-testid="btn-attack"
                  >
                    {isAttacking ? (
                      <div className="flex items-center gap-2">
                        <Sword className="w-5 h-5 md:w-6 md:h-6 animate-pulse" />
                        <span>{t(language, 'fighting')} {combatTimer}s</span>
                      </div>
                    ) : (participation?.attacks_today || 0) >= 5 ? (
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 md:w-6 md:h-6" />
                        <span>{t(language, 'dailyLimitReached')}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Sword className="w-5 h-5 md:w-6 md:h-6" />
                        <span>{t(language, 'attackBoss')}</span>
                        <Badge variant="secondary" className="bg-black/30 text-white">
                          {5 - (participation?.attacks_today || 0)} {t(language, 'leftRemaining')}
                        </Badge>
                      </div>
                    )}
                  </Button>
                  
                  {/* Feedback message when attack is disabled */}
                  {currentHitpoints <= 0 && (
                    <div className="mt-2 p-2 rounded-lg bg-red-500/20 border border-red-500/40 text-center">
                      <p className="text-sm text-red-300">{t(language, 'needToEatFood')}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      {t(language, 'milestoneRewards')}
                    </h3>
                    <div className="grid grid-cols-4 gap-1.5 md:gap-2">
                      {[75, 50, 25, 0].map((milestone) => {
                        const reached = hpPercent <= milestone;
                        const rewards = raid.milestone_rewards?.[String(milestone)];
                        return (
                          <div 
                            key={milestone}
                            className={cn(
                              "rounded-lg p-2 text-center border transition-all",
                              reached 
                                ? "bg-green-900/40 border-green-500/60 shadow-lg shadow-green-500/20" 
                                : "bg-gray-800/50 border-gray-700"
                            )}
                          >
                            <p className={cn(
                              "text-xs md:text-sm font-bold",
                              reached ? "text-green-400" : "text-gray-400"
                            )}>
                              {milestone === 0 ? t(language, 'kill') : `${milestone}%`}
                            </p>
                            {rewards && (
                              <p className="text-[10px] md:text-xs text-amber-400">{rewards.raidTokens} tokens</p>
                            )}
                            {reached && <Sparkle className="w-3 h-3 mx-auto mt-1 text-green-400" weight="fill" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-3 md:mt-4">
          <Card className="bg-card/80 backdrop-blur border-border/50">
            <CardHeader className="pb-2 md:pb-4">
              <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                <Trophy className="w-5 h-5 text-amber-400" />
                {t(language, 'damageLeaderboard')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {leaderboard.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">{t(language, 'noParticipantsYet')}</p>
              ) : (
                <ScrollArea className="h-[350px] md:h-[400px]">
                  <div className="space-y-2">
                    {leaderboard.map((entry: any, index: number) => (
                      <div
                        key={entry.player_id}
                        className={cn(
                          "flex items-center justify-between p-2.5 md:p-3 rounded-lg transition-all",
                          index === 0 ? "bg-gradient-to-r from-amber-900/40 to-amber-800/40 border border-amber-500/50" :
                          index === 1 ? "bg-gradient-to-r from-gray-600/40 to-gray-500/40 border border-gray-400/50" :
                          index === 2 ? "bg-gradient-to-r from-orange-900/40 to-orange-800/40 border border-orange-500/50" :
                          "bg-gray-800/30 border border-gray-700/50"
                        )}
                      >
                        <div className="flex items-center gap-2 md:gap-3">
                          <span className={cn(
                            "w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full font-bold text-sm",
                            index === 0 ? "bg-amber-500 text-black" :
                            index === 1 ? "bg-gray-400 text-black" :
                            index === 2 ? "bg-orange-600 text-white" :
                            "bg-gray-700"
                          )}>
                            {index + 1}
                          </span>
                          <button
                            className="font-medium text-sm md:text-base hover:underline hover:text-primary transition-colors text-left"
                            onClick={() => {
                              setSelectedMember({
                                id: entry.player_id,
                                playerId: entry.player_id,
                                username: entry.username,
                                role: 'dps',
                                position: index,
                                isReady: 0,
                                totalLevel: 0,
                              });
                              setDetailOpen(true);
                            }}
                            data-testid={`leaderboard-player-${entry.player_id}`}
                          >
                            {entry.username}
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-amber-400 text-sm md:text-base">{formatNumber(entry.total_damage)}</p>
                          <p className="text-[10px] md:text-xs text-muted-foreground">{t(language, 'damage')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shop" className="mt-3 md:mt-4">
          <Card className="bg-card/80 backdrop-blur border-border/50">
            <CardHeader className="pb-2 md:pb-4">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-lg md:text-xl">
                  <ShoppingCart className="w-5 h-5 text-purple-400" />
                  {t(language, 'raidTokenShop')}
                </div>
                <Badge className="bg-purple-900/50 text-purple-300">
                  {formatNumber(raidTokens?.balance || 0)} tokens
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {shopLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading shop items...
                </div>
              ) : shopError ? (
                <div className="text-center py-8 text-red-400">
                  Failed to load shop items
                </div>
              ) : !shopItems || shopItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No items available in the shop
                </div>
              ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {shopItems.map((item: any) => {
                  const guildLevel = myGuild?.level || 0;
                  const requiredLevel = item.min_guild_level || 1;
                  const isLocked = guildLevel < requiredLevel;
                  const canAfford = (raidTokens?.balance || 0) >= item.token_cost;
                  
                  return (
                    <Card 
                      key={item.id} 
                      className={cn(
                        "border transition-all relative",
                        isLocked 
                          ? "bg-gray-900/70 border-gray-700/50 opacity-75" 
                          : "bg-gray-800/50 border-gray-700 hover:border-purple-500/50"
                      )}
                    >
                      {isLocked && (
                        <div className="absolute top-2 right-2 z-10">
                          <Badge className="bg-gray-700 text-gray-300 flex items-center gap-1">
                            <Lock className="w-3 h-3" weight="fill" />
                            Lvl {requiredLevel}
                          </Badge>
                        </div>
                      )}
                      <CardContent className="p-3 md:p-4">
                        <div className="flex items-start gap-3 mb-2 md:mb-3">
                          <div className={cn(
                            "w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden border bg-gray-900/50 flex-shrink-0",
                            isLocked ? "border-gray-600/30 grayscale" : "border-purple-500/30"
                          )}>
                            <img 
                              src={item.icon_path ? `/${item.icon_path}` : (getItemImage(item.item_id) || '')}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const fallback = getItemImage(item.item_id);
                                if (fallback && e.currentTarget.src !== fallback) {
                                  e.currentTarget.src = fallback;
                                }
                              }}
                            />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className={cn(
                                  "font-semibold text-sm md:text-base",
                                  isLocked && "text-gray-400",
                                  item.item_id === 'raid_conqueror_badge' && "text-amber-300"
                                )}>{item.item_id ? translateItemName(item.item_id, language) : item.name}</h3>
                                <p className="text-[10px] md:text-xs text-muted-foreground">{translateItemDescription(item.item_id || item.name || item.id, language) || item.description || ''}</p>
                                {item.item_id === 'raid_conqueror_badge' && (
                                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-amber-400 bg-amber-900/30 border border-amber-500/30 rounded px-1.5 py-0.5">
                                    🏆 Grants permanent badge — does not go to inventory
                                  </span>
                                )}
                              </div>
                              {item.quantity > 1 && (
                                <Badge variant="outline" className="text-xs">x{item.quantity}</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        {(() => {
                          if (!item.item_id) return null;
                          const allItems = getItems();
                          const gameItem = allItems.find(i => i.id === item.item_id);
                          if (!gameItem || gameItem.type !== 'equipment' || !gameItem.stats) return null;
                          const stats = gameItem.stats as any;
                          return (
                            <div className="mb-2 p-2 rounded bg-gray-900/60 border border-gray-700/50">
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] md:text-xs">
                                {stats.attackBonus > 0 && (
                                  <span className="text-red-400"><Sword className="w-3 h-3 inline mr-0.5" /> +{stats.attackBonus} ATK</span>
                                )}
                                {stats.strengthBonus > 0 && (
                                  <span className="text-orange-400"><Lightning className="w-3 h-3 inline mr-0.5" /> +{stats.strengthBonus} STR</span>
                                )}
                                {stats.defenceBonus > 0 && (
                                  <span className="text-blue-400"><Shield className="w-3 h-3 inline mr-0.5" /> +{stats.defenceBonus} DEF</span>
                                )}
                                {stats.hitpointsBonus > 0 && (
                                  <span className="text-green-400"><Heart className="w-3 h-3 inline mr-0.5" weight="fill" /> +{stats.hitpointsBonus} HP</span>
                                )}
                                {stats.accuracyBonus > 0 && (
                                  <span className="text-yellow-400"><Target className="w-3 h-3 inline mr-0.5" /> +{stats.accuracyBonus} ACC</span>
                                )}
                              </div>
                              {gameItem.levelRequired && (
                                <p className="text-[9px] md:text-[10px] text-muted-foreground mt-1">Lvl {gameItem.levelRequired} required</p>
                              )}
                            </div>
                          );
                        })()}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Coins className={cn("w-4 h-4", isLocked ? "text-gray-500" : "text-purple-400")} />
                            <span className={cn("font-bold", isLocked ? "text-gray-500" : "text-purple-300")}>{item.token_cost}</span>
                          </div>
                          {isLocked ? (
                            <Button
                              size="sm"
                              disabled
                              className="bg-gray-700 text-gray-400 cursor-not-allowed"
                              data-testid={`btn-buy-${item.id}`}
                            >
                              <Lock className="w-3 h-3 mr-1" />
                              {t(language, 'locked')}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => purchaseItemMutation.mutate(item.id)}
                              disabled={!canAfford || purchaseItemMutation.isPending}
                              className="bg-purple-600 hover:bg-purple-700"
                              data-testid={`btn-buy-${item.id}`}
                            >
                              {t(language, 'buy')}
                            </Button>
                          )}
                        </div>
                        {item.max_purchases && (
                          <p className="text-[10px] md:text-xs text-muted-foreground mt-2">
                            {item.reset_period === 'never'
                              ? 'One-time purchase only'
                              : `Limit: ${item.max_purchases} ${item.reset_period ? `per ${item.reset_period}` : ''}`}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Raid Forge Tab ── */}
        <TabsContent value="forge" className="mt-3 md:mt-4 space-y-4">
          {(() => {
            const BOSS_ESSENCE_MAP: Record<string, string> = {
              infernal_titan: "infernal_essence",
              frost_wyrm: "frost_essence",
              shadow_colossus: "shadow_essence",
              thunder_god: "thunder_essence",
              any: "any_essence",
            };
            const BOSS_SLOT_MAP: Record<string, string> = {
              infernal_titan: "Helmet",
              frost_wyrm: "Body",
              shadow_colossus: "Legs",
              thunder_god: "Boots",
            };
            const BOSS_DISPLAY: Record<string, { name: string; icon: any; color: string; border: string; bg: string }> = {
              infernal_titan: { name: "Infernal Titan", icon: Fire, color: "text-red-300", border: "border-red-500/30", bg: "bg-red-900/40" },
              frost_wyrm: { name: "Frost Wyrm", icon: Snowflake, color: "text-blue-300", border: "border-blue-500/30", bg: "bg-blue-900/40" },
              shadow_colossus: { name: "Shadow Colossus", icon: Moon, color: "text-purple-300", border: "border-purple-500/30", bg: "bg-purple-900/40" },
              thunder_god: { name: "Thunder God", icon: Lightning, color: "text-yellow-300", border: "border-yellow-500/30", bg: "bg-yellow-900/40" },
              any: { name: "Any Boss", icon: Star, color: "text-amber-300", border: "border-amber-500/30", bg: "bg-amber-900/40" },
            };
            const RARITY_STYLE: Record<string, { text: string; border: string; bg: string; label: string }> = {
              uncommon: { text: "text-green-400", border: "border-green-500/50", bg: "bg-green-900/30", label: "Uncommon" },
              rare:     { text: "text-blue-400",  border: "border-blue-500/50",  bg: "bg-blue-900/30",  label: "Rare" },
              epic:     { text: "text-purple-400", border: "border-purple-500/50", bg: "bg-purple-900/30", label: "Epic" },
              legendary:{ text: "text-amber-400", border: "border-amber-500/50", bg: "bg-amber-900/30", label: "Legendary" },
            };

            const getPlayerEssenceCount = (essenceType: string) => {
              if (essenceType === "any_essence") {
                const essenceIds = ["infernal_essence","frost_essence","shadow_essence","thunder_essence"];
                return essenceIds.reduce((max, id) => Math.max(max, (inventory as any)[id] || 0), 0);
              }
              return (inventory as any)[essenceType] || 0;
            };

            const isObtained = (itemId: string) => {
              const invCount = (inventory as any)[itemId] || 0;
              if (invCount > 0) return true;
              const eq = player?.equipment as any;
              if (!eq) return false;
              return Object.values(eq).some((v: any) => v === itemId || (typeof v === 'object' && v?.itemId === itemId));
            };

            const recipes = forgeRecipes || [];
            const bosses = ["infernal_titan","frost_wyrm","shadow_colossus","thunder_god"];
            const anyRecipes = recipes.filter((r: any) => r.boss_id === "any");
            const setRecipes = recipes.filter((r: any) => r.boss_id !== "any");

            return (
              <>
                {/* Header */}
                <Card className="bg-gradient-to-br from-orange-900/20 to-purple-900/20 border-orange-500/30">
                  <CardContent className="p-3 md:p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Hammer className="w-5 h-5 text-orange-400" weight="fill" />
                      <span className="font-bold text-orange-300 text-sm md:text-base">Raid Forge</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use essences dropped by raid bosses to forge powerful raid set pieces. Each boss drops their own essence — collect enough to craft armor with a chance at higher rarities.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2 text-[10px] md:text-xs text-muted-foreground">
                      <span className="bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full">45% Uncommon</span>
                      <span className="bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded-full">33% Rare</span>
                      <span className="bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded-full">17% Epic</span>
                      <span className="bg-amber-900/30 text-amber-400 px-2 py-0.5 rounded-full">5% Legendary</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Boss Chests section */}
                {(() => {
                  const CHEST_INFO: Record<string, { name: string; icon: any; color: string; border: string; bg: string; essenceLabel: string }> = {
                    infernal_boss_chest: { name: "Infernal Chest", icon: Fire, color: "text-red-400", border: "border-red-500/30", bg: "bg-red-900/20", essenceLabel: "Infernal Essence" },
                    frost_boss_chest:    { name: "Frost Chest",    icon: Snowflake, color: "text-blue-400", border: "border-blue-500/30", bg: "bg-blue-900/20", essenceLabel: "Frost Essence" },
                    shadow_boss_chest:   { name: "Shadow Chest",   icon: Moon, color: "text-purple-400", border: "border-purple-500/30", bg: "bg-purple-900/20", essenceLabel: "Shadow Essence" },
                    thunder_boss_chest:  { name: "Thunder Chest",  icon: Lightning, color: "text-yellow-400", border: "border-yellow-500/30", bg: "bg-yellow-900/20", essenceLabel: "Thunder Essence" },
                  };
                  const ownedChests = Object.keys(CHEST_INFO).filter(id => ((inventory as any)[id] || 0) > 0);
                  if (ownedChests.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-1 py-0.5">
                        <Package className="w-4 h-4 text-amber-400" weight="fill" />
                        <span className="font-semibold text-sm text-amber-300">Boss Chests</span>
                        <span className="text-xs text-muted-foreground ml-auto">Open for essences & gear</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                        {ownedChests.map(chestId => {
                          const info = CHEST_INFO[chestId];
                          const ChestIcon = info.icon;
                          const qty = (inventory as any)[chestId] || 0;
                          return (
                            <Card
                              key={chestId}
                              className={cn("relative overflow-hidden cursor-pointer transition-all border hover:shadow-lg bg-gray-800/60", info.border, "hover:brightness-110")}
                              onClick={() => { setChestPopupId(chestId); setChestRewards(null); }}
                              data-testid={`chest-card-${chestId}`}
                            >
                              <CardContent className="p-2 md:p-3 flex flex-col items-center gap-1.5">
                                <div className={cn("w-14 h-14 md:w-16 md:h-16 rounded-lg flex items-center justify-center", info.bg)}>
                                  <ChestIcon className={cn("w-8 h-8 md:w-10 md:h-10", info.color)} weight="fill" />
                                </div>
                                <div className="text-center">
                                  <p className="text-[10px] md:text-xs font-semibold leading-tight">{info.name}</p>
                                  <Badge className={cn("text-[9px] mt-0.5 px-1 py-0", info.bg, info.color)}>x{qty}</Badge>
                                </div>
                                <Button
                                  size="sm"
                                  className={cn("w-full h-7 text-[10px] font-semibold mt-0.5", info.bg, info.color, "border", info.border, "hover:brightness-110")}
                                  onClick={(e) => { e.stopPropagation(); setChestPopupId(chestId); setChestRewards(null); }}
                                  data-testid={`btn-open-chest-${chestId}`}
                                >
                                  Open
                                </Button>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Boss sections */}
                {forgeLoading ? (
                  <div className="text-center py-12 text-muted-foreground">Loading forge recipes...</div>
                ) : (
                  <>
                    {bosses.map(bossId => {
                      const bossInfo = BOSS_DISPLAY[bossId];
                      const BossIcon = bossInfo.icon;
                      const essenceId = BOSS_ESSENCE_MAP[bossId];
                      const playerEssenceCount = getPlayerEssenceCount(essenceId);
                      const bossRecipes = setRecipes.filter((r: any) => r.boss_id === bossId);
                      if (bossRecipes.length === 0) return null;
                      return (
                        <div key={bossId} className="space-y-2">
                          <div className={cn("flex items-center gap-2 px-1 py-0.5 rounded-lg", bossInfo.bg || "")}>
                            <BossIcon className={cn("w-4 h-4", bossInfo.color)} weight="fill" />
                            <span className={cn("font-semibold text-sm", bossInfo.color)}>{bossInfo.name}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {BOSS_SLOT_MAP[bossId]} Slot
                            </span>
                            <Badge className={cn("text-[10px] ml-1", bossInfo.bg, bossInfo.color)}>
                              {playerEssenceCount}x {translateItemName(essenceId, language)}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 md:gap-3">
                            {bossRecipes.map((recipe: any) => {
                              const obtained = isObtained(recipe.result_item_id);
                              const canAfford = playerEssenceCount >= recipe.required_essence_amount;
                              const rarityInfo = RARITY_STYLE["epic"] || RARITY_STYLE.epic;
                              return (
                                <Card
                                  key={recipe.id}
                                  className={cn(
                                    "relative overflow-hidden cursor-pointer transition-all border hover:shadow-lg",
                                    obtained
                                      ? "border-gray-600/30 bg-gray-900/50"
                                      : cn("bg-gray-800/60 hover:border-opacity-80", bossInfo.border)
                                  )}
                                  onClick={() => {
                                    setForgePopupRecipe(recipe);
                                    setCraftResult(null);
                                  }}
                                  data-testid={`forge-card-${recipe.result_item_id}`}
                                >
                                  {obtained && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-950/70 backdrop-blur-[1px]">
                                      <CheckCircle className="w-8 h-8 text-green-400 mb-1" weight="fill" />
                                      <span className="text-[10px] font-bold text-green-400 tracking-wider uppercase">Obtained!</span>
                                    </div>
                                  )}
                                  <CardContent className="p-2 md:p-3 flex flex-col items-center gap-1.5">
                                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-lg overflow-hidden border border-gray-700/50 bg-gray-900/50 flex-shrink-0">
                                      <img
                                        src={getItemImage(recipe.result_item_id) || ''}
                                        alt={translateItemName(recipe.result_item_id, language)}
                                        className="w-full h-full object-cover"
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                      />
                                    </div>
                                    <div className="text-center">
                                      <p className="text-[10px] md:text-xs font-semibold leading-tight line-clamp-2">
                                        {translateItemName(recipe.result_item_id, language)}
                                      </p>
                                      <Badge className={cn("text-[9px] mt-0.5 px-1 py-0", rarityInfo.bg, rarityInfo.text)}>
                                        {rarityInfo.label}
                                      </Badge>
                                    </div>
                                    <div className={cn(
                                      "flex items-center gap-1 text-[10px] rounded-md px-1.5 py-0.5 mt-0.5 w-full justify-center",
                                      canAfford ? "text-amber-300 bg-amber-900/20" : "text-red-400 bg-red-900/20"
                                    )}>
                                      <Package className="w-3 h-3 flex-shrink-0" />
                                      <span>{recipe.required_essence_amount}x needed</span>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Enhancement Stone section */}
                    {anyRecipes.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-1 py-0.5">
                          <Star className="w-4 h-4 text-amber-400" weight="fill" />
                          <span className="font-semibold text-sm text-amber-300">Universal Recipes</span>
                          <span className="text-xs text-muted-foreground ml-auto">Any Essence</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                          {anyRecipes.map((recipe: any) => {
                            const allEssences = ["infernal_essence","frost_essence","shadow_essence","thunder_essence"];
                            const bestEssenceCount = allEssences.reduce((max, id) => Math.max(max, (inventory as any)[id] || 0), 0);
                            const canAfford = bestEssenceCount >= recipe.required_essence_amount;
                            const rarityInfo = RARITY_STYLE["epic"] || RARITY_STYLE.uncommon;
                            return (
                              <Card
                                key={recipe.id}
                                className={cn(
                                  "relative overflow-hidden cursor-pointer transition-all border hover:shadow-lg bg-gray-800/60 border-amber-500/30 hover:border-amber-500/60"
                                )}
                                onClick={() => {
                                  setForgePopupRecipe(recipe);
                                  setCraftResult(null);
                                }}
                                data-testid={`forge-card-${recipe.result_item_id}`}
                              >
                                <CardContent className="p-2 md:p-3 flex flex-col items-center gap-1.5">
                                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-lg overflow-hidden border border-amber-700/50 bg-gray-900/50">
                                    <img
                                      src={getItemImage(recipe.result_item_id) || ''}
                                      alt={translateItemName(recipe.result_item_id, language)}
                                      className="w-full h-full object-cover"
                                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                    />
                                  </div>
                                  <div className="text-center">
                                    <p className="text-[10px] md:text-xs font-semibold leading-tight line-clamp-2">
                                      {translateItemName(recipe.result_item_id, language)}
                                    </p>
                                    <Badge className={cn("text-[9px] mt-0.5 px-1 py-0", rarityInfo.bg, rarityInfo.text)}>
                                      {rarityInfo.label}
                                    </Badge>
                                  </div>
                                  <div className={cn(
                                    "flex items-center gap-1 text-[10px] rounded-md px-1.5 py-0.5 mt-0.5 w-full justify-center",
                                    canAfford ? "text-amber-300 bg-amber-900/20" : "text-red-400 bg-red-900/20"
                                  )}>
                                    <Package className="w-3 h-3 flex-shrink-0" />
                                    <span>{recipe.required_essence_amount}x any essence</span>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Forge Recipe Popup */}
                <Dialog open={!!forgePopupRecipe} onOpenChange={(o) => { if (!o) { setForgePopupRecipe(null); setCraftResult(null); } }}>
                  <DialogContent className="max-w-sm z-[11000]">
                    {forgePopupRecipe && (() => {
                      const recipe = forgePopupRecipe;
                      const bossId = recipe.boss_id;
                      const bossInfo = BOSS_DISPLAY[bossId] || BOSS_DISPLAY.any;
                      const BossIcon = bossInfo.icon;
                      const essenceId = BOSS_ESSENCE_MAP[bossId] || "any_essence";
                      const playerEssenceCount = getPlayerEssenceCount(essenceId);
                      const canAfford = playerEssenceCount >= recipe.required_essence_amount;
                      const obtained = isObtained(recipe.result_item_id);
                      const rarityInfo = RARITY_STYLE["epic"] || RARITY_STYLE.epic;
                      const resultRarityInfo = craftResult ? (RARITY_STYLE[craftResult.rarity] || RARITY_STYLE.uncommon) : null;
                      const isPending = craftForgeMutation.isPending;
                      return (
                        <>
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <Hammer className="w-5 h-5 text-orange-400" weight="fill" />
                              Raid Forge
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-2">
                            {/* Item display */}
                            <div className="flex items-center gap-3">
                              <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-600 bg-gray-900 flex-shrink-0">
                                <img
                                  src={getItemImage(recipe.result_item_id) || ''}
                                  alt={translateItemName(recipe.result_item_id, language)}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
                              </div>
                              <div>
                                <p className="font-semibold text-base">{translateItemName(recipe.result_item_id, language)}</p>
                                <Badge className={cn("text-xs mt-1", rarityInfo.bg, rarityInfo.text)}>
                                  {rarityInfo.label} (base)
                                </Badge>
                                <div className="flex items-center gap-1 mt-1">
                                  <BossIcon className={cn("w-3.5 h-3.5", bossInfo.color)} weight="fill" />
                                  <span className={cn("text-xs", bossInfo.color)}>{bossInfo.name}</span>
                                </div>
                                {(() => {
                                  const allItems = getItems();
                                  const gameItem = allItems.find(i => i.id === recipe.result_item_id);
                                  if (!gameItem || gameItem.type !== 'equipment' || !gameItem.stats) return null;
                                  const stats = gameItem.stats as any;
                                  return (
                                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[10px]">
                                      {stats.attackBonus > 0 && <span className="text-red-400"><Sword className="w-2.5 h-2.5 inline mr-0.5" />+{stats.attackBonus} ATK</span>}
                                      {stats.strengthBonus > 0 && <span className="text-orange-400"><Lightning className="w-2.5 h-2.5 inline mr-0.5" />+{stats.strengthBonus} STR</span>}
                                      {stats.defenceBonus > 0 && <span className="text-blue-400"><Shield className="w-2.5 h-2.5 inline mr-0.5" />+{stats.defenceBonus} DEF</span>}
                                      {stats.hitpointsBonus > 0 && <span className="text-green-400"><Heart className="w-2.5 h-2.5 inline mr-0.5" weight="fill" />+{stats.hitpointsBonus} HP</span>}
                                      {stats.accuracyBonus > 0 && <span className="text-yellow-400"><Target className="w-2.5 h-2.5 inline mr-0.5" />+{stats.accuracyBonus} ACC</span>}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Rarity odds */}
                            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                              <p className="text-xs font-medium text-muted-foreground mb-2">Rarity Chances</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {[
                                  { label: "Uncommon", pct: "45%", style: RARITY_STYLE.uncommon },
                                  { label: "Rare",     pct: "33%", style: RARITY_STYLE.rare },
                                  { label: "Epic",     pct: "17%", style: RARITY_STYLE.epic },
                                  { label: "Legendary",pct: "5%",  style: RARITY_STYLE.legendary },
                                ].map(r => (
                                  <div key={r.label} className={cn("flex items-center justify-between rounded px-2 py-1", r.style.bg)}>
                                    <span className={cn("text-[11px] font-medium", r.style.text)}>{r.label}</span>
                                    <span className={cn("text-[11px]", r.style.text)}>{r.pct}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Essence cost */}
                            <div className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2.5 border",
                              canAfford ? "bg-amber-900/20 border-amber-500/30" : "bg-red-900/20 border-red-500/30"
                            )}>
                              <div className="flex-1">
                                <p className="text-xs text-muted-foreground">Required</p>
                                <p className="font-medium text-sm">
                                  {recipe.required_essence_amount}x {bossId === "any" ? "Any Essence" : translateItemName(essenceId, language)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">You have</p>
                                <p className={cn("font-bold text-sm", canAfford ? "text-green-400" : "text-red-400")}>
                                  {playerEssenceCount}
                                </p>
                              </div>
                            </div>

                            {/* Craft result */}
                            {craftResult && resultRarityInfo && (
                              <div className={cn(
                                "rounded-xl p-4 border text-center space-y-2 animate-in fade-in-0 zoom-in-95",
                                resultRarityInfo.bg, resultRarityInfo.border
                              )}>
                                <CheckCircle className={cn("w-8 h-8 mx-auto", resultRarityInfo.text)} weight="fill" />
                                <p className="font-bold text-base">Crafted Successfully!</p>
                                <Badge className={cn("text-sm px-3 py-1", resultRarityInfo.bg, resultRarityInfo.text)}>
                                  {resultRarityInfo.label} {translateItemName(craftResult.itemId, language)}
                                </Badge>
                              </div>
                            )}
                          </div>
                          <DialogFooter>
                            {craftResult ? (
                              <Button className="w-full" onClick={() => { setForgePopupRecipe(null); setCraftResult(null); }}>
                                Close
                              </Button>
                            ) : (
                              <Button
                                className={cn(
                                  "w-full font-semibold",
                                  canAfford && !obtained
                                    ? "bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700"
                                    : ""
                                )}
                                disabled={!canAfford || isPending}
                                onClick={async () => {
                                  craftingRecipeRef.current = recipe;
                                  await craftForgeMutation.mutateAsync(recipe.id);
                                }}
                              >
                                {isPending ? (
                                  <span className="flex items-center gap-2"><Hammer className="w-4 h-4 animate-pulse" /> Forging...</span>
                                ) : !canAfford ? (
                                  `Need ${recipe.required_essence_amount - playerEssenceCount} more essence`
                                ) : (
                                  <span className="flex items-center gap-2"><Hammer className="w-4 h-4" weight="fill" /> Forge Item</span>
                                )}
                              </Button>
                            )}
                          </DialogFooter>
                        </>
                      );
                    })()}
                  </DialogContent>
                </Dialog>

                {/* Boss Chest Open Popup */}
                <Dialog open={!!chestPopupId} onOpenChange={(o) => { if (!o) { setChestPopupId(null); setChestRewards(null); } }}>
                  <DialogContent className="max-w-sm z-[11000]">
                    {chestPopupId && (() => {
                      const CHEST_INFO: Record<string, { name: string; icon: any; color: string; border: string; bg: string; essenceLabel: string }> = {
                        infernal_boss_chest: { name: "Infernal Chest", icon: Fire, color: "text-red-400", border: "border-red-500/30", bg: "bg-red-900/20", essenceLabel: "Infernal Essence" },
                        frost_boss_chest:    { name: "Frost Chest",    icon: Snowflake, color: "text-blue-400", border: "border-blue-500/30", bg: "bg-blue-900/20", essenceLabel: "Frost Essence" },
                        shadow_boss_chest:   { name: "Shadow Chest",   icon: Moon, color: "text-purple-400", border: "border-purple-500/30", bg: "bg-purple-900/20", essenceLabel: "Shadow Essence" },
                        thunder_boss_chest:  { name: "Thunder Chest",  icon: Lightning, color: "text-yellow-400", border: "border-yellow-500/30", bg: "bg-yellow-900/20", essenceLabel: "Thunder Essence" },
                      };
                      const info = CHEST_INFO[chestPopupId];
                      if (!info) return null;
                      const ChestIcon = info.icon;
                      const qty = (inventory as any)[chestPopupId] || 0;
                      const isPending = openChestMutation.isPending;
                      const RARITY_STYLE2: Record<string, { text: string; border: string; bg: string; label: string }> = {
                        uncommon: { text: "text-green-400", border: "border-green-500/50", bg: "bg-green-900/30", label: "Uncommon" },
                        rare:     { text: "text-blue-400",  border: "border-blue-500/50",  bg: "bg-blue-900/30",  label: "Rare" },
                        epic:     { text: "text-purple-400", border: "border-purple-500/50", bg: "bg-purple-900/30", label: "Epic" },
                        legendary:{ text: "text-amber-400", border: "border-amber-500/50", bg: "bg-amber-900/30", label: "Legendary" },
                      };
                      return (
                        <>
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <ChestIcon className={cn("w-5 h-5", info.color)} weight="fill" />
                              {info.name}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-2">
                            {/* Chest visual */}
                            <div className={cn("rounded-xl p-5 flex flex-col items-center gap-3 border", info.bg, info.border)}>
                              <ChestIcon className={cn("w-16 h-16", info.color)} weight="fill" />
                              <Badge className={cn("text-sm px-3 py-1", info.bg, info.color)}>
                                {qty} remaining
                              </Badge>
                            </div>

                            {/* Possible rewards info */}
                            {!chestRewards && (
                              <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700 space-y-1.5">
                                <p className="text-xs font-medium text-muted-foreground mb-1.5">Possible Rewards</p>
                                <div className="flex items-center gap-2 text-xs">
                                  <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" weight="fill" />
                                  <span>3-5x {info.essenceLabel} <span className="text-green-400">(Guaranteed)</span></span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <CheckCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" weight="fill" />
                                  <span>Raidbreaker piece <span className="text-blue-400">(25%)</span></span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <CheckCircle className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" weight="fill" />
                                  <span>Raidbreaker Enhancement Stone <span className="text-purple-400">(10%)</span></span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <CheckCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" weight="fill" />
                                  <span>Raid Set piece <span className="text-amber-400">(5%)</span></span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <CheckCircle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" weight="fill" />
                                  <span>Forge Core <span className="text-orange-400">(1%)</span></span>
                                </div>
                              </div>
                            )}

                            {/* Rewards display */}
                            {chestRewards && (
                              <div className="space-y-2 animate-in fade-in-0 slide-in-from-bottom-2">
                                <p className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
                                  <Trophy className="w-3.5 h-3.5" weight="fill" /> You received:
                                </p>
                                {chestRewards.map((reward: any, i: number) => {
                                  const rarityStyle = reward.craftedRarity ? (RARITY_STYLE2[reward.craftedRarity] || RARITY_STYLE2.uncommon) : null;
                                  return (
                                    <div key={i} className={cn(
                                      "flex items-center gap-2 rounded-lg px-3 py-2 border",
                                      rarityStyle ? cn(rarityStyle.bg, rarityStyle.border) : "bg-gray-800/60 border-gray-700"
                                    )}>
                                      <img
                                        src={getItemImage(reward.id) || ''}
                                        alt={translateItemName(reward.id, language)}
                                        className="w-8 h-8 rounded object-cover flex-shrink-0"
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium leading-tight truncate">
                                          {translateItemName(reward.id, language)}
                                        </p>
                                        {rarityStyle && (
                                          <Badge className={cn("text-[10px] mt-0.5", rarityStyle.bg, rarityStyle.text)}>{rarityStyle.label}</Badge>
                                        )}
                                      </div>
                                      <span className="text-sm font-bold text-amber-300 flex-shrink-0">x{reward.quantity}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <DialogFooter>
                            {chestRewards ? (
                              <div className="flex gap-2 w-full">
                                {qty > 0 && (
                                  <Button
                                    className={cn("flex-1 font-semibold", info.bg, info.color, "border", info.border)}
                                    onClick={() => { setChestRewards(null); openChestMutation.mutate(chestPopupId); }}
                                    disabled={isPending}
                                    data-testid={`btn-open-another-chest-${chestPopupId}`}
                                  >
                                    Open Another ({qty} left)
                                  </Button>
                                )}
                                <Button className="flex-1" variant="outline" onClick={() => { setChestPopupId(null); setChestRewards(null); }}>
                                  Close
                                </Button>
                              </div>
                            ) : (
                              <Button
                                className={cn("w-full font-semibold", info.bg, info.color, "border", info.border, "hover:brightness-110")}
                                disabled={qty < 1 || isPending}
                                onClick={() => openChestMutation.mutate(chestPopupId)}
                                data-testid={`btn-confirm-open-chest-${chestPopupId}`}
                              >
                                {isPending ? (
                                  <span className="flex items-center gap-2"><ChestIcon className="w-4 h-4 animate-pulse" weight="fill" /> Opening...</span>
                                ) : (
                                  <span className="flex items-center gap-2"><ChestIcon className="w-4 h-4" weight="fill" /> Open Chest</span>
                                )}
                              </Button>
                            )}
                          </DialogFooter>
                        </>
                      );
                    })()}
                  </DialogContent>
                </Dialog>
              </>
            );
          })()}
        </TabsContent>
      </Tabs>

      <Dialog open={showRewardsDialog} onOpenChange={setShowRewardsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Trophy className="w-6 h-6 text-amber-400" weight="fill" />
              {claimedRewards?.raidStatus === 'completed' ? t(language, 'raidVictory') : t(language, 'raidComplete')}
            </DialogTitle>
          </DialogHeader>
          {claimedRewards && (
            <div className="space-y-4 py-2">
              <div className="bg-gradient-to-br from-amber-900/40 to-orange-900/40 rounded-xl p-4 border border-amber-500/30 text-center">
                <p className="text-sm text-amber-300 mb-1">{claimedRewards.bossName}</p>
                <p className="text-sm text-muted-foreground">
                  {t(language, 'yourDamage')}: {formatNumber(claimedRewards.totalDamage || 0)} / {formatNumber(claimedRewards.raidTotalDamage || 0)}
                </p>
              </div>

              {claimedRewards.rewards.tokens > 0 && (
                <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-500/30 flex items-center gap-3">
                  <Coins className="w-8 h-8 text-purple-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-purple-300">{t(language, 'raidTokens')}</p>
                    <p className="text-2xl font-bold text-purple-400">+{formatNumber(claimedRewards.rewards.tokens)}</p>
                  </div>
                </div>
              )}

              {claimedRewards.rewards.guildCoins > 0 && (
                <div className="bg-amber-900/30 rounded-lg p-4 border border-amber-500/30 flex items-center gap-3">
                  <Coins className="w-8 h-8 text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-amber-300">{t(language, 'guildCoins')}</p>
                    <p className="text-2xl font-bold text-amber-400">+{formatNumber(claimedRewards.rewards.guildCoins)}</p>
                  </div>
                </div>
              )}

              {claimedRewards.rewards.items.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">{t(language, 'itemsReceived')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {claimedRewards.rewards.items.map((item: { itemId: string; qty: number }, idx: number) => (
                      <div key={idx} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                          <Sparkle className="w-5 h-5 text-amber-400" weight="fill" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{translateItemName(item.itemId, language)}</p>
                          <p className="text-xs text-muted-foreground">x{item.qty}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowRewardsDialog(false)} className="w-full bg-gradient-to-r from-amber-600 to-green-600 hover:from-amber-700 hover:to-green-700">
              {t(language, 'continue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sword className="w-6 h-6 text-amber-400" />
              {t(language, 'combatComplete')}
            </DialogTitle>
          </DialogHeader>
          {lastAttackResult && (
            <div className="space-y-4 py-4">
              <div className="bg-gradient-to-br from-amber-900/40 to-orange-900/40 rounded-xl p-4 border border-amber-500/30 text-center">
                <p className="text-sm text-amber-300 mb-1">{t(language, 'totalDamageDealt')}</p>
                <p className="text-3xl font-bold text-amber-400">{formatNumber(lastAttackResult.damage)}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-purple-900/30 rounded-lg p-3 text-center border border-purple-500/30">
                  <Coins className="w-5 h-5 mx-auto mb-1 text-purple-400" />
                  <p className="text-xs text-purple-300">{t(language, 'tokensEarned')}</p>
                  <p className="text-lg font-bold text-purple-400">+{lastAttackResult.tokensEarned}</p>
                </div>
                <div className="bg-amber-900/30 rounded-lg p-3 text-center border border-amber-500/30">
                  <Fire className="w-5 h-5 mx-auto mb-1 text-amber-400" weight="fill" />
                  <p className="text-xs text-amber-300">{t(language, 'streakBonus')}</p>
                  <p className="text-lg font-bold text-amber-400">{lastAttackResult.streak} {t(language, 'days')}</p>
                </div>
              </div>

              <div className="text-center text-sm text-muted-foreground space-y-1">
                <p>{lastAttackResult.attacksRemaining} {t(language, 'attacksRemainingToday')}</p>
                <p className="flex items-center justify-center gap-1 text-xs text-amber-400">
                  <Clock className="w-3 h-3" />
                  {t(language, 'resetsIn')}: {resetCountdown}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowResultModal(false)} className="w-full">
              {t(language, 'continue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes floatUp {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          50% {
            opacity: 1;
            transform: translateY(-20px) scale(1.2);
          }
          100% {
            opacity: 0;
            transform: translateY(-40px) scale(0.8);
          }
        }
      `}</style>
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
