import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/context/FirebaseAuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/useMobile";
import { getItemImage } from "@/lib/itemImages";
import { isFood, getFoodHealAmount } from "@/lib/foods";
import { getMonsterImage } from "@/lib/monsterImages";
import { getBaseItem, getItemRarityColor, getItemRarityBgColor, formatItemIdAsName, translateItemName } from "@/lib/items";
import { getLocalizedMonsterName } from "@/lib/gameTranslations";
import type { Language } from "@/lib/i18n";
import { formatNumber } from "@/lib/gameMath";
import { GoldDisplay } from "@/components/game/GoldDisplay";
import { CombatHpBar } from "@/components/game/CombatHpBar";
import { FloatingDamageNumbers } from "@/components/game/FloatingDamageNumbers";
import type { DamageEvent } from "@/components/game/FloatingDamageNumbers";
import { BossStage } from "@/components/dungeon/BossStage";
import { CombatLogPanel } from "@/components/game/CombatLogPanel";
import type { CombatLogEntry } from "@/components/game/CombatLogPanel";
import type { DungeonCurse, DungeonCurseType } from "@shared/schema";
import { COMBAT_HP_SCALE, dungeonPlayerDamageWithCrit, dungeonMonsterDamage, randomHit } from "@shared/dungeonCombat";
import type { DungeonReplayEvent } from "@shared/dungeonEngine";
import { getDungeonRole } from "@shared/dungeonRoles";
import { usePartyWebSocket } from "@/hooks/usePartyWebSocket";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Skull, Sword, Shield, Heart, Lightning, Trophy, Warning, CaretLeft,
  Stairs, Package, Star, Crown, Timer, CheckCircle, SignOut, Play,
  Target, Moon, ChatDots, ArrowsClockwise, Users, Fire, Drop, Eye,
  GearSix, CaretDown, CaretUp, Pause, Cookie, FirstAid
} from "@phosphor-icons/react";

interface NextFloor {
  floor: number;
  monsterName: string;
  monsterHp: number;
  monsterAttack: number;
  monsterDefence: number;
  monsterAttackSpeed: number;
  monsterImage: string | null;
  isBoss: boolean;
}

interface FloorResult {
  floor: number;
  monsterDefeated: boolean;
  playerAlive: boolean;
  playerHp: number;
  playerMaxHp: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  loot: Record<string, number>;
  gold: number;
  xp: number;
  riskLevel: number;
  extractionPercent: number;
  curses: DungeonCurse[];
  chaosMeter: number;
  multiplier: number;
  sessionStatus: string;
  nextFloor: NextFloor | null;
}

interface SoloSession {
  id: string;
  dungeonId: string;
  dungeonName: string;
  mode: "solo";
  status: string;
  currentFloor: number;
  isOffline: number;
  riskLevel: number;
  extractionPercent: number;
  chaosMeter: number;
  multiplier: number;
  curses: DungeonCurse[];
  totalGold: number;
  totalXp: number;
  lootPool: Record<string, number>;
  startedAt: string;
  nextFloor: NextFloor | null;
  maxFloors: number | null;
  maxRunTimeMinutes: number;
  playerHp: number;
  playerMaxHp: number;
  playerAttackSpeed: number;
  playerDps: number;
  playerAttack: number;
  playerDefense: number;
  playerWeaponType: string | null;
  playerMinHit: number;
  playerMaxHit: number;
  playerCritChance: number;
  playerCritDamage: number;
}

interface PartyMember {
  playerId: string;
  playerName: string;
  role: string;
  hp: number;
  maxHp: number;
  threat: number;
  status: "alive" | "dead" | "exited";
  weaponType: string | null;
  attackSpeed: number | null;
  dps: number | null;
  defense: number | null;
}

interface PartyVote {
  playerId: string;
  vote: "continue" | "exit";
}

interface PartySession {
  id: string;
  dungeonId: string;
  dungeonName: string;
  mode: "party";
  status: string;
  currentFloor: number;
  riskLevel: number;
  extractionPercent: number;
  chaosMeter: number;
  multiplier: number;
  curses: DungeonCurse[];
  totalGold: number;
  totalXp: number;
  lootPool: Record<string, number>;
  startedAt: string;
  nextFloor: NextFloor | null;
  maxFloors: number | null;
  members?: PartyMember[];
  votes?: PartyVote[];
  voteDeadline: string | null;
  maxRunTimeMinutes: number;
}

interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  content: string;
  createdAt: string;
}

type Session = SoloSession | PartySession;

function isPartySession(s: Session): s is PartySession {
  return s.mode === "party";
}

const CURSE_LABELS: Record<DungeonCurseType, { label: string; icon: typeof Warning; tooltip: string; tooltipTr: string }> = {
  reduced_heal: { label: "-Heal", icon: Warning, tooltip: "Healing effectiveness reduced by 20% per stack", tooltipTr: "İyileşme etkinliği yığın başına %20 azalır" },
  increased_durability_loss: { label: "+Durability Loss", icon: Warning, tooltip: "Equipment durability loss increased by 25% per stack", tooltipTr: "Ekipman dayanıklılık kaybı yığın başına %25 artar" },
  increased_enemy_damage: { label: "+Enemy DMG", icon: Warning, tooltip: "Enemy damage increased by 15% per stack", tooltipTr: "Düşman hasarı yığın başına %15 artar" },
  increased_multiplier_gain: { label: "+Multiplier", icon: Lightning, tooltip: "Multiplier gain rate increased by 30% per stack (more risk, more reward)", tooltipTr: "Çarpan kazanım hızı yığın başına %30 artar (daha fazla risk, daha fazla ödül)" },
};

function getRiskColor(risk: number): { text: string; bar: string; label: string } {
  if (risk <= 5) return { text: "text-green-400", bar: "bg-green-500", label: "Low" };
  if (risk <= 10) return { text: "text-yellow-400", bar: "bg-yellow-500", label: "Medium" };
  if (risk <= 15) return { text: "text-orange-400", bar: "bg-orange-500", label: "High" };
  return { text: "text-red-400", bar: "bg-red-500", label: "Extreme" };
}

function getHpBarColor(percent: number): string {
  if (percent > 50) return "bg-gradient-to-r from-green-600 to-green-500";
  if (percent > 25) return "bg-gradient-to-r from-yellow-600 to-yellow-500";
  return "bg-gradient-to-r from-red-600 to-red-500";
}

function formatTimeSince(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m ago`;
  return `${minutes}m ago`;
}

function formatCountdown(deadline: string): string {
  const remaining = new Date(deadline).getTime() - Date.now();
  if (remaining <= 0) return "0s";
  const seconds = Math.ceil(remaining / 1000);
  return `${seconds}s`;
}

const PARTY_EXCLUSIVE_ITEMS = new Set([
  'goblin_war_banner', 'goblin_treasure_key',
  'lich_soul_fragment', 'necrotic_essence',
  'dragon_heart', 'molten_dragon_scale',
  'void_crown_shard', 'dimensional_tear', 'void_fragment'
]);

export default function DungeonRunPage() {
  const { t, language } = useLanguage();
  const { player, applyServerData, setHasActiveDungeonRun, inventory: gameInventory, selectedFood, selectedPotion, activeBuffs } = useGame();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { isMobile } = useMobile();

  const [lastFloorResult, setLastFloorResult] = useState<FloorResult | null>(null);
  const [combatAnimPhase, setCombatAnimPhase] = useState<"idle" | "fighting" | "result">("idle");
  const [combatLogs, setCombatLogs] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [voteCountdown, setVoteCountdown] = useState("");
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [soloCombatActive, setSoloCombatActive] = useState(false);
  const [soloCombatPlayerHp, setSoloCombatPlayerHp] = useState(0);
  const [soloCombatMonsterHp, setSoloCombatMonsterHp] = useState(0);
  const [soloCombatMonsterMaxHp, setSoloCombatMonsterMaxHp] = useState(0);
  const [soloCombatPlayerMaxHp, setSoloCombatPlayerMaxHp] = useState(0);
  const [soloCombatPlayerAccPct, setSoloCombatPlayerAccPct] = useState(0);
  const [soloCombatMonsterAccPct, setSoloCombatMonsterAccPct] = useState(0);
  const [playerHpShake, setPlayerHpShake] = useState(false);
  const [monsterAnimation, setMonsterAnimation] = useState<"idle" | "hit" | "attacking">("idle");
  const [soloMonsterHitKey, setSoloMonsterHitKey] = useState(0);
  const [soloFloatingNumbers, setSoloFloatingNumbers] = useState<{ id: number; x: number; y: number; value: number; type: "damage" | "heal" | "crit" | "monster_damage" | "skill" | "block"; timestamp: number; skillName?: string }[]>([]);
  const soloFloatIdRef = useRef(0);
  const [soloCombatPlayerAtkSpeed, setSoloCombatPlayerAtkSpeed] = useState(2500);
  const [soloCombatMonsterAtkSpeed, setSoloCombatMonsterAtkSpeed] = useState(3000);
  const soloCombatRef = useRef<{ running: boolean; playerAcc: number; monsterAcc: number; playerAtkSpeed: number; monsterAtkSpeed: number }>({ running: false, playerAcc: 0, monsterAcc: 0, playerAtkSpeed: 2500, monsterAtkSpeed: 3000 });

  const [autoFloorEnabled, setAutoFloorEnabled] = useState(false);
  const [autoFloorSettingsOpen, setAutoFloorSettingsOpen] = useState(false);
  const [autoFloorSettings, setAutoFloorSettings] = useState({
    stopOnBoss: true,
    stopOnHighChaos: true,
    chaosThreshold: 70,
    stopOnLowFood: true,
    foodThreshold: 3,
    stopOnLowHp: true,
    hpThreshold: 30,
  });
  const autoFloorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFloorEnabledRef = useRef(false);

  const [dungeonLogEntries, setDungeonLogEntries] = useState<CombatLogEntry[]>([]);
  const dungeonLogIdRef = useRef(0);
  const [partyDmgEvents, setPartyDmgEvents] = useState<DamageEvent[]>([]);
  const floorFightInProgressRef = useRef(false);
  const [partyReplayAtkAcc, setPartyReplayAtkAcc] = useState<Record<string, number>>({});
  const [partyReplayMonsterAtkAcc, setPartyReplayMonsterAtkAcc] = useState(0);

  const [dungeonSelectedFood, setDungeonSelectedFood] = useState<string | null>(selectedFood);
  const [dungeonSelectedPotion, setDungeonSelectedPotion] = useState<string | null>(selectedPotion);
  const [eatCooldownEnd, setEatCooldownEnd] = useState(0);
  const [eatCooldownDisplay, setEatCooldownDisplay] = useState("");
  const [autoEatEnabled, setAutoEatEnabled] = useState(false);
  const [autoPotionEnabled, setAutoPotionEnabled] = useState(false);
  const [consumeMessage, setConsumeMessage] = useState<string | null>(null);
  const [foodSelectorOpen, setFoodSelectorOpen] = useState(false);
  const [potionSelectorOpen, setPotionSelectorOpen] = useState(false);
  const [localInventory, setLocalInventory] = useState<Record<string, number>>(gameInventory);

  useEffect(() => {
    setLocalInventory(gameInventory);
  }, [gameInventory]);

  useEffect(() => {
    if (eatCooldownEnd <= Date.now()) {
      setEatCooldownDisplay("");
      return;
    }
    const interval = setInterval(() => {
      const remaining = eatCooldownEnd - Date.now();
      if (remaining <= 0) {
        setEatCooldownDisplay("");
        clearInterval(interval);
      } else {
        setEatCooldownDisplay(`${Math.ceil(remaining / 1000)}s`);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [eatCooldownEnd]);

  const replayAbortRef = useRef(false);
  const [partyReplayEvents, setPartyReplayEvents] = useState<DungeonReplayEvent[]>([]);
  const [partyReplayPlaying, setPartyReplayPlaying] = useState(false);
  const [partyReplayLogs, setPartyReplayLogs] = useState<string[]>([]);
  const [partyReplayHp, setPartyReplayHp] = useState<Record<string, number>>({});
  const [partyReplayMonsterHp, setPartyReplayMonsterHp] = useState(0);
  const [partyReplayMonsterMaxHp, setPartyReplayMonsterMaxHp] = useState(0);
  const [partyReplayFrenzyActive, setPartyReplayFrenzyActive] = useState<Record<string, boolean>>({});
  const [partyReplayMonsterSilenced, setPartyReplayMonsterSilenced] = useState(false);
  const [partyReplayPassiveCounts, setPartyReplayPassiveCounts] = useState<Record<string, number>>({});

  const { data: sessionData, isLoading: sessionLoading } = useQuery({
    queryKey: ["/api/v2/dungeons/solo/active"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/v2/dungeons/solo/active");
        return res.json();
      } catch { return { session: null }; }
    },
    enabled: !!player,
    staleTime: 0,
    refetchInterval: 10000,
  });

  const session: Session | null = sessionData?.session || null;
  const isParty = session ? isPartySession(session) : false;
  const partySession = isParty ? (session as PartySession) : null;
  const partySessionRef = useRef(partySession);
  partySessionRef.current = partySession;

  const { data: partyStateData } = useQuery({
    queryKey: ["/api/v2/dungeons/party/state", session?.id],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/v2/dungeons/party/state/${session!.id}`);
        return res.json();
      } catch { return null; }
    },
    enabled: !!session && isParty,
    refetchInterval: 8000,
  });

  const { data: chatData, refetch: refetchChat } = useQuery({
    queryKey: ["/api/v2/dungeons/party/chat", session?.id],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/v2/dungeons/party/chat/${session!.id}`);
        return res.json();
      } catch { return { messages: [] }; }
    },
    enabled: !!session && isParty,
    refetchInterval: 15000,
  });

  const chatMessages: ChatMessage[] = chatData?.messages || [];

  useEffect(() => {
    if (partyStateData?.session && session) {
      queryClient.setQueryData(["/api/v2/dungeons/solo/active"], { session: partyStateData.session });
    }
  }, [partyStateData]);

  useEffect(() => {
    return () => { replayAbortRef.current = true; };
  }, []);

  useEffect(() => {
    if (!session && !sessionLoading) {
      const timeout = setTimeout(() => navigate("/dungeons"), 1500);
      return () => clearTimeout(timeout);
    }
  }, [session, sessionLoading, navigate]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages.length]);

  useEffect(() => {
    if (!partySession?.voteDeadline) return;
    const interval = setInterval(() => {
      setVoteCountdown(formatCountdown(partySession.voteDeadline!));
    }, 1000);
    return () => clearInterval(interval);
  }, [partySession?.voteDeadline]);

  const isActiveDungeon = !!session && session.status !== "completed" && session.status !== "failed" && session.status !== "extracted";

  useEffect(() => {
    if (!isActiveDungeon) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isActiveDungeon]);

  const handleBackClick = useCallback(() => {
    if (isActiveDungeon) {
      setShowLeaveWarning(true);
    } else {
      navigate("/dungeons");
    }
  }, [isActiveDungeon, navigate]);

  const [isLeaving, setIsLeaving] = useState(false);

  const handleConfirmLeave = useCallback(async () => {
    try {
      setIsLeaving(true);
      if (session?.id) {
        if (isParty) {
          await apiRequest("POST", "/api/v2/dungeons/party/exit", { sessionId: session.id });
        } else {
          await apiRequest("POST", "/api/v2/dungeons/solo/extract", { sessionId: session.id });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      navigate("/dungeons");
    } catch (e) {
      console.error("Failed to leave dungeon:", e);
      navigate("/dungeons");
    } finally {
      setIsLeaving(false);
      setShowLeaveWarning(false);
    }
  }, [navigate, session, isParty, queryClient]);

  const startSoloCombat = useCallback(() => {
    if (!session || !session.nextFloor || soloCombatActive) return;
    const nf = session.nextFloor;
    const soloSession = session as SoloSession;
    const pHp = soloSession.playerHp || soloSession.playerMaxHp || 100;
    const pMaxHp = soloSession.playerMaxHp || 100;

    setSoloCombatActive(true);
    setSoloCombatPlayerHp(pHp);
    setSoloCombatPlayerMaxHp(pMaxHp);
    setSoloCombatMonsterHp(nf.monsterHp);
    setSoloCombatMonsterMaxHp(nf.monsterHp);
    setSoloFloatingNumbers([]);
    setDungeonLogEntries([]);
    setCombatAnimPhase("fighting");
    setLastFloorResult(null);

    const playerAttackSpeed = soloSession.playerAttackSpeed || 2500;
    const monsterAttackSpd = nf.monsterAttackSpeed || 3000;
    const playerDefense = soloSession.playerDefense || 0;
    const monsterDefence = nf.monsterDefence || 0;

    const pMinHit = soloSession.playerMinHit || 1;
    const pMaxHit = soloSession.playerMaxHit || 2;
    const pCritChance = soloSession.playerCritChance || 0;
    const pCritDamage = soloSession.playerCritDamage || 150;
    const monsterAtk = nf.monsterAttack;

    setSoloCombatPlayerAtkSpeed(playerAttackSpeed);
    setSoloCombatMonsterAtkSpeed(monsterAttackSpd);
    setSoloCombatPlayerAccPct(0);
    setSoloCombatMonsterAccPct(0);

    const ref = soloCombatRef.current;
    ref.running = true;
    ref.playerAcc = 0;
    ref.monsterAcc = 0;
    ref.playerAtkSpeed = playerAttackSpeed;
    ref.monsterAtkSpeed = monsterAttackSpd;

    let mHp = nf.monsterHp;
    let pH = pHp;
    let lastTime = performance.now();

    const tick = (now: number) => {
      if (!ref.running) return;
      const dt = Math.min(now - lastTime, 200);
      lastTime = now;

      ref.playerAcc += dt;
      ref.monsterAcc += dt;

      setSoloCombatPlayerAccPct(Math.min(100, (ref.playerAcc / playerAttackSpeed) * 100));
      setSoloCombatMonsterAccPct(Math.min(100, (ref.monsterAcc / monsterAttackSpd) * 100));

      if (ref.playerAcc >= playerAttackSpeed) {
        ref.playerAcc -= playerAttackSpeed;
        const { damage: finalDmg, isCrit } = dungeonPlayerDamageWithCrit(pMinHit, pMaxHit, monsterDefence, pCritChance, pCritDamage);
        mHp = Math.max(0, mHp - finalDmg);
        setSoloCombatMonsterHp(mHp);
        setSoloMonsterHitKey(prev => prev + 1);
        const fId = ++soloFloatIdRef.current;
        setSoloFloatingNumbers(prev => [...prev.slice(-8), {
          id: fId,
          x: 25 + Math.random() * 50,
          y: 20 + Math.random() * 40,
          value: finalDmg,
          type: isCrit ? "crit" as const : "damage" as const,
          timestamp: Date.now(),
        }]);
        const logId = ++dungeonLogIdRef.current;
        setDungeonLogEntries(prev => [...prev.slice(-30), { id: logId, message: isCrit ? `💥 Critical hit for ${formatNumber(finalDmg)}!` : `⚔️ You hit for ${formatNumber(finalDmg)}`, type: 'player_hit' as const, timestamp: Date.now(), epoch: logId }]);
      }

      if (ref.monsterAcc >= monsterAttackSpd && mHp > 0) {
        ref.monsterAcc -= monsterAttackSpd;
        const dmg = dungeonMonsterDamage(monsterAtk, playerDefense);
        pH = Math.max(0, pH - dmg);
        setSoloCombatPlayerHp(pH);
        setPlayerHpShake(true);
        setTimeout(() => setPlayerHpShake(false), 400);
        const logId = ++dungeonLogIdRef.current;
        setDungeonLogEntries(prev => [...prev.slice(-30), { id: logId, message: `💥 Monster hit you for ${formatNumber(dmg)}`, type: 'monster_hit' as const, timestamp: Date.now(), epoch: logId }]);
      }

      if (mHp <= 0 || pH <= 0) {
        ref.running = false;
        setSoloCombatActive(false);
        submitFloorResult.mutate();
        return;
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [session, soloCombatActive]);

  useEffect(() => {
    autoFloorEnabledRef.current = autoFloorEnabled;
  }, [autoFloorEnabled]);

  useEffect(() => {
    return () => {
      soloCombatRef.current.running = false;
      if (autoFloorTimerRef.current) clearTimeout(autoFloorTimerRef.current);
    };
  }, []);


  useEffect(() => {
    if (soloFloatingNumbers.length > 0) {
      const timer = setTimeout(() => {
        setSoloFloatingNumbers(prev => prev.slice(1));
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [soloFloatingNumbers]);

  useEffect(() => {
    if (partyDmgEvents.length > 0) {
      const timer = setTimeout(() => {
        setPartyDmgEvents(prev => prev.slice(1));
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [partyDmgEvents]);

  const submitFloorResult = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("No active session");
      const endpoint = "/api/v2/dungeons/solo/floor";
      const res = await apiRequest("POST", endpoint, { sessionId: session.id });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to process floor" }));
        throw new Error(err.error || "Failed to process floor");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.result?.completed) {
        setSoloCombatActive(false);
        setAutoFloorEnabled(false);
        queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
        return;
      }
      if (data.result) {
        setSoloCombatPlayerHp(data.result.playerHp || 0);
        setSoloCombatPlayerMaxHp(data.result.playerMaxHp || soloCombatPlayerMaxHp);
        setLastFloorResult(data.result);
        setCombatAnimPhase("result");
      }
      setSoloCombatActive(false);
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
    },
    onError: (error: Error) => {
      setCombatAnimPhase("idle");
      setSoloCombatActive(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!autoFloorEnabledRef.current || !lastFloorResult || isParty) return;
    if (!lastFloorResult.monsterDefeated || !lastFloorResult.playerAlive) {
      setAutoFloorEnabled(false);
      return;
    }

    const result = lastFloorResult;
    const nf = session?.nextFloor;

    if (autoFloorSettings.stopOnBoss && nf?.isBoss) {
      setAutoFloorEnabled(false);
      toast({ title: "Auto-Floor Stopped", description: "Boss floor ahead — proceed manually.", variant: "default" });
      return;
    }

    if (autoFloorSettings.stopOnHighChaos && (result.chaosMeter ?? 0) >= autoFloorSettings.chaosThreshold) {
      setAutoFloorEnabled(false);
      toast({ title: "Auto-Floor Stopped", description: `Chaos meter reached ${result.chaosMeter}% (threshold: ${autoFloorSettings.chaosThreshold}%).`, variant: "default" });
      return;
    }

    if (autoFloorSettings.stopOnLowFood) {
      const foodCount = dungeonSelectedFood ? (localInventory[dungeonSelectedFood] || 0) : 0;
      if (foodCount <= autoFloorSettings.foodThreshold) {
        setAutoFloorEnabled(false);
        toast({ title: "Auto-Floor Stopped", description: dungeonSelectedFood ? `Food supply low (${foodCount} remaining).` : "No food selected for dungeon.", variant: "default" });
        return;
      }
    }

    if (autoFloorSettings.stopOnLowHp && result.playerMaxHp > 0) {
      const hpPct = (result.playerHp / result.playerMaxHp) * 100;
      if (hpPct <= autoFloorSettings.hpThreshold) {
        setAutoFloorEnabled(false);
        toast({ title: "Auto-Floor Stopped", description: `HP is low (${Math.round(hpPct)}%, threshold: ${autoFloorSettings.hpThreshold}%).`, variant: "default" });
        return;
      }
    }

    if (!nf) return;

    autoFloorTimerRef.current = setTimeout(() => {
      if (autoFloorEnabledRef.current && !soloCombatActive) {
        startSoloCombat();
      }
    }, 1500);

    return () => {
      if (autoFloorTimerRef.current) clearTimeout(autoFloorTimerRef.current);
    };
  }, [lastFloorResult, session?.nextFloor]);

  const playPartyReplay = useCallback(async (replay: DungeonReplayEvent[], monsterHp: number, members: PartyMember[] = []) => {
    if (!members || members.length === 0) { setPartyReplayPlaying(false); return; }
    replayAbortRef.current = false;
    setPartyReplayPlaying(true);
    setPartyReplayMonsterHp(monsterHp);
    setPartyReplayMonsterMaxHp(monsterHp);
    setPartyReplayLogs([]);
    setPartyDmgEvents([]);
    setDungeonLogEntries([]);
    setPartyReplayFrenzyActive({});
    setPartyReplayMonsterSilenced(false);
    setPartyReplayPassiveCounts({});
    const initAcc: Record<string, number> = {};
    const hpMap: Record<string, number> = {};
    for (const m of members) { hpMap[m.playerId] = m.hp; initAcc[m.playerId] = 0; }
    setPartyReplayHp({ ...hpMap });
    setPartyReplayAtkAcc(initAcc);
    setPartyReplayMonsterAtkAcc(0);

    let currentMonsterHp = monsterHp;
    const passiveCounts: Record<string, number> = {};
    const memberLastAtk: Record<string, number> = {};
    let monsterLastAtk = 0;

    for (let i = 0; i < replay.length; i++) {
      if (replayAbortRef.current) break;
      const ev = replay[i];
      const rawDelay = i === 0 ? 500 : (ev.timestamp - (replay[i - 1]?.timestamp || 0));
      const delay = i === 0 ? 500 : Math.max(150, Math.min(800, rawDelay));

      const accUpdate: Record<string, number> = {};
      for (const m of members) {
        const atkSpd = m.attackSpeed || 2500;
        const lastT = memberLastAtk[m.playerId] || 0;
        accUpdate[m.playerId] = Math.min(100, ((ev.timestamp - lastT) / atkSpd) * 100);
      }
      setPartyReplayAtkAcc(accUpdate);
      const monsterAtkSpd = 3000;
      setPartyReplayMonsterAtkAcc(Math.min(100, ((ev.timestamp - monsterLastAtk) / monsterAtkSpd) * 100));

      await new Promise(r => setTimeout(r, delay));
      if (replayAbortRef.current) break;

      const memberName = (pid: string) => (members || []).find(m => String(m.playerId) === String(pid))?.playerName || pid;

      switch (ev.type) {
        case 'attack': {
          const msg = `⚔️ ${memberName(ev.sourceId)} hit monster for ${formatNumber(ev.damage || 0)}`;
          setPartyReplayLogs(prev => [...prev.slice(-12), msg]);
          currentMonsterHp = Math.max(0, currentMonsterHp - (ev.damage || 0));
          setPartyReplayMonsterHp(currentMonsterHp);
          memberLastAtk[ev.sourceId] = ev.timestamp;
          setPartyReplayAtkAcc(prev => ({ ...prev, [ev.sourceId]: 0 }));
          const dmgId = `pa-${i}`;
          setPartyDmgEvents(prev => [...prev.slice(-8), { id: dmgId, damage: ev.damage || 0, isCrit: false, x: 55 + Math.random() * 35, y: 5 + Math.random() * 25 }]);
          const lId = ++dungeonLogIdRef.current;
          setDungeonLogEntries(prev => [...prev.slice(-30), { id: lId, message: msg, type: 'party_attack' as const, timestamp: Date.now(), epoch: lId }]);
          break;
        }
        case 'monster_attack': {
          const msg = `💥 Monster hit ${memberName(ev.targetId)} for ${formatNumber(ev.damage || 0)}`;
          setPartyReplayLogs(prev => [...prev.slice(-12), msg]);
          setPartyReplayHp(prev => ({ ...prev, [ev.targetId]: Math.max(0, (prev[ev.targetId] || 0) - (ev.damage || 0)) }));
          monsterLastAtk = ev.timestamp;
          setPartyReplayMonsterAtkAcc(0);
          const dmgId = `pm-${i}`;
          setPartyDmgEvents(prev => [...prev.slice(-8), { id: dmgId, damage: ev.damage || 0, isCrit: false, x: 5 + Math.random() * 35, y: 5 + Math.random() * 25, effectType: 'damage' as const }]);
          const lId = ++dungeonLogIdRef.current;
          setDungeonLogEntries(prev => [...prev.slice(-30), { id: lId, message: msg, type: 'party_damaged' as const, timestamp: Date.now(), epoch: lId }]);
          break;
        }
        case 'skill_stun':
          setPartyReplayLogs(prev => [...prev.slice(-12), `⚡ Monster STUNNED ${memberName(ev.targetId)}!`]);
          break;
        case 'skill_poison':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🧪 Monster POISONED ${memberName(ev.targetId)}!`]);
          break;
        case 'skill_armor_break':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🛡️ Monster broke ${memberName(ev.targetId)}'s armor!`]);
          break;
        case 'skill_aoe':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔥 AoE hit ${memberName(ev.targetId)} for ${formatNumber(ev.damage || 0)}`]);
          setPartyReplayHp(prev => ({ ...prev, [ev.targetId]: Math.max(0, (prev[ev.targetId] || 0) - (ev.damage || 0)) }));
          break;
        case 'poison_tick':
          setPartyReplayLogs(prev => [...prev.slice(-12), `☠️ Poison ticked ${memberName(ev.targetId)} for ${formatNumber(ev.damage || 0)}`]);
          setPartyReplayHp(prev => ({ ...prev, [ev.targetId]: Math.max(0, (prev[ev.targetId] || 0) - (ev.damage || 0)) }));
          break;
        case 'heal': {
          const healMsg = `💚 ${memberName(ev.sourceId)} healed ${memberName(ev.targetId)} for ${formatNumber(ev.healing || 0)}`;
          setPartyReplayLogs(prev => [...prev.slice(-12), healMsg]);
          setPartyReplayHp(prev => ({ ...prev, [ev.targetId]: Math.min(((members || []).find(m => String(m.playerId) === String(ev.targetId))?.maxHp || 999999), (prev[ev.targetId] || 0) + (ev.healing || 0)) }));
          const healDmgId = `ph-${i}`;
          setPartyDmgEvents(prev => [...prev.slice(-8), { id: healDmgId, damage: ev.healing || 0, isCrit: false, x: 10 + Math.random() * 30, y: 10 + Math.random() * 20, effectType: 'heal' as const }]);
          const healLId = ++dungeonLogIdRef.current;
          setDungeonLogEntries(prev => [...prev.slice(-30), { id: healLId, message: healMsg, type: 'party_heal' as const, timestamp: Date.now(), epoch: healLId }]);
          break;
        }
        case 'death':
          setPartyReplayLogs(prev => [...prev.slice(-12), `💀 ${memberName(ev.targetId)} has been slain!`]);
          await new Promise(r => setTimeout(r, 400));
          break;
        case 'monster_death':
          setPartyReplayLogs(prev => [...prev.slice(-12), `✅ Monster defeated!`]);
          setPartyReplayMonsterHp(0);
          setPartyReplayMonsterAtkAcc(0);
          await new Promise(r => setTimeout(r, 400));
          break;
        case 'dodge':
          passiveCounts['dodge'] = (passiveCounts['dodge'] || 0) + 1;
          setPartyReplayPassiveCounts({ ...passiveCounts });
          setPartyReplayLogs(prev => [...prev.slice(-12), `🗡️ ${memberName(ev.sourceId)} DODGED the attack!`]);
          break;
        case 'skill_blocked':
          passiveCounts['skill_blocked'] = (passiveCounts['skill_blocked'] || 0) + 1;
          setPartyReplayPassiveCounts({ ...passiveCounts });
          setPartyReplayLogs(prev => [...prev.slice(-12), `🛡️ ${memberName(ev.sourceId)} BLOCKED monster's skill!`]);
          break;
        case 'silence':
          passiveCounts['silence'] = (passiveCounts['silence'] || 0) + 1;
          setPartyReplayPassiveCounts({ ...passiveCounts });
          setPartyReplayMonsterSilenced(true);
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔇 ${memberName(ev.sourceId)} SILENCED the monster!`]);
          setTimeout(() => setPartyReplayMonsterSilenced(false), ev.duration || 2000);
          break;
        case 'frenzy_activate':
          passiveCounts['frenzy_activate'] = (passiveCounts['frenzy_activate'] || 0) + 1;
          setPartyReplayPassiveCounts({ ...passiveCounts });
          setPartyReplayFrenzyActive(prev => ({ ...prev, [ev.sourceId]: true }));
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔥 ${memberName(ev.sourceId)} entered FRENZY mode!`]);
          break;
        case 'execute_bonus':
          passiveCounts['execute_bonus'] = (passiveCounts['execute_bonus'] || 0) + 1;
          setPartyReplayPassiveCounts({ ...passiveCounts });
          setPartyReplayLogs(prev => [...prev.slice(-12), `💀 ${memberName(ev.sourceId)} EXECUTE bonus: +${formatNumber(ev.damage || 0)} damage!`]);
          break;
        case 'boss_self_heal':
          currentMonsterHp = Math.min(monsterHp, currentMonsterHp + (ev.healing || 0));
          setPartyReplayMonsterHp(currentMonsterHp);
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: Self-heal for ${formatNumber(ev.healing || 0)}!`]);
          break;
        case 'boss_heal_on_player_heal':
          currentMonsterHp = Math.min(monsterHp, currentMonsterHp + (ev.healing || 0));
          setPartyReplayMonsterHp(currentMonsterHp);
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: Healed on player heal for ${formatNumber(ev.healing || 0)}!`]);
          break;
        case 'boss_reflect':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: Reflection activated! Damage reflected to ${memberName(ev.targetId)}`]);
          break;
        case 'boss_execute':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: EXECUTE on ${memberName(ev.targetId)} for ${formatNumber(ev.damage || 0)} damage!`]);
          setPartyReplayHp(prev => ({ ...prev, [ev.targetId]: Math.max(0, (prev[ev.targetId] || 0) - (ev.damage || 0)) }));
          break;
        case 'boss_summon':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: Summoned minion! (${ev.skillName || 'Unknown'})`]);
          break;
        case 'boss_aggro_swap':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: Aggro swap to ${memberName(ev.targetId)}!`]);
          break;
        case 'boss_buff_punish':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: Buff punish! Cleansed buffs and dealt ${formatNumber(ev.damage || 0)} damage!`]);
          setPartyReplayHp(prev => ({ ...prev, [ev.targetId]: Math.max(0, (prev[ev.targetId] || 0) - (ev.damage || 0)) }));
          break;
        case 'boss_root':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: ROOT on ${memberName(ev.targetId)}!`]);
          break;
        case 'boss_mass_stun':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: MASS STUN! All party members stunned!`]);
          break;
        case 'boss_mass_armor_break':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: MASS ARMOR BREAK! Everyone's armor broken!`]);
          break;
        case 'boss_multi_attack':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: Multi-attack! Hit ${memberName(ev.targetId)} for ${formatNumber(ev.damage || 0)} damage!`]);
          setPartyReplayHp(prev => ({ ...prev, [ev.targetId]: Math.max(0, (prev[ev.targetId] || 0) - (ev.damage || 0)) }));
          break;
        case 'boss_aggro_reset':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: Aggro reset! Threat cleared!`]);
          break;
        case 'boss_regenerate':
          currentMonsterHp = Math.min(monsterHp, currentMonsterHp + (ev.healing || 0));
          setPartyReplayMonsterHp(currentMonsterHp);
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: Regenerate for ${formatNumber(ev.healing || 0)} HP!`]);
          break;
        case 'boss_mass_burn':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: MASS BURN! DoT applied to all!`]);
          break;
        case 'boss_mass_poison':
          setPartyReplayLogs(prev => [...prev.slice(-12), `🔴 BOSS SKILL: MASS POISON! All poisoned!`]);
          break;
      }
    }

    await new Promise(r => setTimeout(r, 1000));
    if (!replayAbortRef.current) setPartyReplayPlaying(false);
  }, []);

  const handleDungeonWsEvent = useCallback((event: any) => {
    if (event.type === 'dungeon_floor_result' && !floorFightInProgressRef.current) {
      const p = event.payload;
      if (p?.combatReplay?.length > 0 && partySessionRef.current) {
        playPartyReplay(p.combatReplay, p.monster?.hp || 1000, partySessionRef.current.members || []);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/party/state"] });
    }
    if (event.type === 'dungeon_vote_started' || event.type === 'dungeon_vote_cast' || event.type === 'dungeon_vote_resolved') {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/party/state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
    }
    if (event.type === 'dungeon_chat_message') {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/party/chat"] });
    }
  }, [queryClient, playPartyReplay]);

  usePartyWebSocket({
    playerId: player?.id ? String(player.id) : null,
    partyId: partySession?.partyId ? String(partySession.partyId) : session?.partyId ? String(session.partyId) : null,
    enabled: !!player && isParty,
    onEvent: handleDungeonWsEvent,
  });

  const fightFloorMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("No active session");

      if (!isParty) {
        startSoloCombat();
        return null;
      }

      floorFightInProgressRef.current = true;
      setCombatAnimPhase("fighting");
      setCombatLogs([]);
      setLastFloorResult(null);
      const endpoint = "/api/v2/dungeons/party/floor";
      const res = await apiRequest("POST", endpoint, {
        sessionId: session.id,
        autoEat: autoEatEnabled,
        autoPotion: autoPotionEnabled,
        foodId: dungeonSelectedFood || undefined,
        potionId: dungeonSelectedPotion || undefined,
        hpThresholdPercent: 50,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to process floor" }));
        throw new Error(err.error || "Failed to process floor");
      }
      return res.json();
    },
    onSuccess: async (data) => {
      floorFightInProgressRef.current = false;
      if (!data) return;
      if (data.result) {
        const r = data.result;

        const currentPartySession = partySessionRef.current;
        if (r.combatReplay && r.combatReplay.length > 0 && currentPartySession) {
          await playPartyReplay(r.combatReplay, r.monster?.hp || 1000, currentPartySession.members || []);
        } else if (isParty) {
          const monsterName = r.monster?.id?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Monster";
          const logs: string[] = [`⚔️ Engaging ${monsterName}...`];
          if (r.membersAfter) {
            for (const m of r.membersAfter) {
              if (m.damageDealt > 0) logs.push(`🗡️ ${(currentPartySession?.members || []).find(p => String(p.playerId) === String(m.playerId))?.playerName || 'Player'} dealt ${formatNumber(m.damageDealt)}`);
            }
          }
          const allAlive = r.membersAfter?.every((m: any) => m.isAlive) ?? true;
          logs.push(allAlive ? `✅ ${monsterName} defeated!` : `💀 Party wiped!`);
          setPartyReplayLogs(logs);
          await new Promise(res => setTimeout(res, 1200));
        }

        if (r.autoConsume) {
          if (r.autoConsume.foodConsumed) {
            const fc = r.autoConsume.foodConsumed;
            const foodName = translateItemName(fc.itemId, language);
            const logId = ++dungeonLogIdRef.current;
            setDungeonLogEntries(prev => [...prev.slice(-30), { id: logId, message: `🍖 Auto-ate ${foodName} (+${formatNumber(fc.healAmount)} HP)`, type: 'party_heal' as const, timestamp: Date.now(), epoch: logId }]);
            const healEvId = `auto-heal-${logId}`;
            setPartyDmgEvents(prev => [...prev.slice(-8), { id: healEvId, damage: fc.healAmount, isCrit: false, x: 10 + Math.random() * 30, y: 10 + Math.random() * 20, effectType: 'heal' as const }]);
            setConsumeMessage(`Ate ${foodName} (+${formatNumber(fc.healAmount)} HP)`);
            setTimeout(() => setConsumeMessage(null), 3000);
            if (dungeonSelectedFood) {
              setLocalInventory(prev => {
                const updated = { ...prev };
                updated[dungeonSelectedFood] = Math.max(0, (updated[dungeonSelectedFood] || 0) - 1);
                if (updated[dungeonSelectedFood] <= 0) delete updated[dungeonSelectedFood];
                return updated;
              });
            }
          }
          if (r.autoConsume.potionConsumed) {
            const pc = r.autoConsume.potionConsumed;
            const potionName = translateItemName(pc.itemId, language);
            const logId = ++dungeonLogIdRef.current;
            setDungeonLogEntries(prev => [...prev.slice(-30), { id: logId, message: `🧪 Auto-drank ${potionName} (${pc.buffApplied})`, type: 'party_heal' as const, timestamp: Date.now(), epoch: logId }]);
            setConsumeMessage(`Drank ${potionName}`);
            setTimeout(() => setConsumeMessage(null), 3000);
            if (dungeonSelectedPotion) {
              setLocalInventory(prev => {
                const updated = { ...prev };
                updated[dungeonSelectedPotion] = Math.max(0, (updated[dungeonSelectedPotion] || 0) - 1);
                if (updated[dungeonSelectedPotion] <= 0) delete updated[dungeonSelectedPotion];
                return updated;
              });
            }
          }
        }

        if (r.membersAfter && isParty && player?.id) {
          const me = r.membersAfter.find((m: any) => String(m.playerId) === String(player.id));
          r.damageDealt = me?.damageDealt ?? 0;
          r.damageTaken = me?.damageTaken ?? 0;
          r.healingDone = me?.healingDone ?? 0;
          r.playerAlive = me?.isAlive ?? !r.allDead;
        }
        r.loot = r.lootGenerated ?? r.loot;
        r.gold = r.goldGenerated ?? r.gold ?? 0;
        r.xp = r.xpGenerated ?? r.xp ?? 0;

        setLastFloorResult(r);
        setCombatAnimPhase("result");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
    },
    onError: (error: Error) => {
      floorFightInProgressRef.current = false;
      setCombatAnimPhase("idle");
      setSoloCombatActive(false);
      setPartyReplayPlaying(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const extractMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("No active session");
      const res = await apiRequest("POST", "/api/v2/dungeons/solo/extract", { sessionId: session.id });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to extract" }));
        throw new Error(err.error || "Failed to extract");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("No active session");
      const res = await apiRequest("POST", "/api/v2/dungeons/solo/claim", { sessionId: session.id });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to claim" }));
        throw new Error(err.error || "Failed to claim");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.result) {
        applyServerData({ gold: data.result.gold });
      }
      setHasActiveDungeonRun(false);
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const voteMutation = useMutation({
    mutationFn: async (vote: "continue" | "exit") => {
      if (!session) throw new Error("No active session");
      const res = await apiRequest("POST", "/api/v2/dungeons/party/vote", { sessionId: session.id, vote });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Vote failed" }));
        throw new Error(err.error || "Vote failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const exitPartyMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("No active session");
      const res = await apiRequest("POST", "/api/v2/dungeons/party/exit", { sessionId: session.id });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Exit failed" }));
        throw new Error(err.error || "Exit failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setHasActiveDungeonRun(false);
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
      navigate("/dungeons");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const sendChatMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!session) throw new Error("No active session");
      const res = await apiRequest("POST", "/api/v2/dungeons/party/chat", { sessionId: session.id, content });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      setChatInput("");
      refetchChat();
    },
  });

  const handleSendChat = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    sendChatMutation.mutate(trimmed);
  };

  const consumeMutation = useMutation({
    mutationFn: async ({ type, itemId }: { type: 'food' | 'potion'; itemId: string }) => {
      if (!session) throw new Error("No active session");
      const res = await apiRequest("POST", `/api/v2/dungeons/sessions/${session.id}/consume`, { type, itemId });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to consume" }));
        if (err.cooldownRemaining) {
          setEatCooldownEnd(Date.now() + err.cooldownRemaining * 1000);
        }
        throw new Error(err.error || "Failed to consume");
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      if (data.newInventory) {
        setLocalInventory(data.newInventory);
        applyServerData({ inventory: data.newInventory });
      }
      if (variables.type === 'food' && data.healAmount) {
        const foodName = translateItemName(variables.itemId, language);
        setConsumeMessage(`Ate ${foodName} (+${formatNumber(data.healAmount)} HP)`);
        setTimeout(() => setConsumeMessage(null), 3000);
        const fId = ++soloFloatIdRef.current;
        setSoloFloatingNumbers(prev => [...prev.slice(-8), {
          id: fId,
          x: 25 + Math.random() * 50,
          y: 20 + Math.random() * 40,
          value: data.healAmount,
          type: "heal" as const,
          timestamp: Date.now(),
        }]);
        if (data.newHp != null) {
          setSoloCombatPlayerHp(data.newHp);
        }
        setEatCooldownEnd(Date.now() + 3000);
        const logId = ++dungeonLogIdRef.current;
        setDungeonLogEntries(prev => [...prev.slice(-30), {
          id: logId,
          message: `🍖 Ate ${foodName} (+${formatNumber(data.healAmount)} HP)`,
          type: 'party_heal' as const,
          timestamp: Date.now(),
          epoch: logId,
        }]);
      }
      if (variables.type === 'potion' && data.buffApplied) {
        const potionName = translateItemName(variables.itemId, language);
        setConsumeMessage(`Used ${potionName}`);
        setTimeout(() => setConsumeMessage(null), 3000);
        toast({ title: "Buff Applied", description: `${potionName} active!` });
        const logId = ++dungeonLogIdRef.current;
        setDungeonLogEntries(prev => [...prev.slice(-30), {
          id: logId,
          message: `🧪 Used ${potionName}`,
          type: 'party_heal' as const,
          timestamp: Date.now(),
          epoch: logId,
        }]);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player"] });
    },
    onError: (error: Error) => {
      toast({ title: "Cannot consume", description: error.message, variant: "destructive" });
    },
  });

  const handleEatFood = useCallback(() => {
    if (!dungeonSelectedFood || !session) return;
    if (soloCombatActive || partyReplayPlaying) return;
    if (eatCooldownEnd > Date.now()) return;
    consumeMutation.mutate({ type: 'food', itemId: dungeonSelectedFood });
  }, [dungeonSelectedFood, session, soloCombatActive, partyReplayPlaying, eatCooldownEnd]);

  const handleDrinkPotion = useCallback(() => {
    if (!dungeonSelectedPotion || !session) return;
    if (soloCombatActive || partyReplayPlaying) return;
    consumeMutation.mutate({ type: 'potion', itemId: dungeonSelectedPotion });
  }, [dungeonSelectedPotion, session, soloCombatActive, partyReplayPlaying]);

  const foodItems = Object.entries(localInventory).filter(([id, qty]) => {
    if (qty <= 0) return false;
    return isFood(id);
  });

  const potionItems = Object.entries(localInventory).filter(([id, qty]) => {
    if (qty <= 0) return false;
    const item = getBaseItem(id);
    return item?.type === 'potion' && item?.effect;
  });

  const currentFoodCount = dungeonSelectedFood ? (localInventory[dungeonSelectedFood] || 0) : 0;
  const currentPotionCount = dungeonSelectedPotion ? (localInventory[dungeonSelectedPotion] || 0) : 0;

  const isHpFull = (() => {
    if (!session) return true;
    if (!isPartySession(session)) {
      const soloSession = session as SoloSession;
      const displayHp = soloCombatActive ? soloCombatPlayerHp : (lastFloorResult ? lastFloorResult.playerHp : soloSession.playerHp);
      const displayMaxHp = soloCombatActive ? soloCombatPlayerMaxHp : (lastFloorResult ? lastFloorResult.playerMaxHp : soloSession.playerMaxHp);
      return displayHp >= displayMaxHp;
    }
    return false;
  })();

  const hasActivePotionBuff = (() => {
    if (!dungeonSelectedPotion) return false;
    const item = getBaseItem(dungeonSelectedPotion);
    if (!item?.effect) return false;
    const now = Date.now();
    return activeBuffs.some(b => b.effectType === (item.effect as any)?.type && b.expiresAt > now);
  })();

  if (sessionLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px]" data-testid="dungeon-run-loading">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <ArrowsClockwise className="w-4 h-4 animate-spin" />
          Loading dungeon...
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px]" data-testid="dungeon-run-empty">
        <div className="text-muted-foreground text-sm">No active dungeon session</div>
      </div>
    );
  }

  const isCompleted = session.status === "completed" || session.status === "failed" || session.status === "extracted";
  const isSoloOffline = session.mode === "solo" && (session as SoloSession).isOffline === 1 && !isCompleted;
  const isVoting = session.status === "voting";

  if (isCompleted) {
    const handleReturnFromResult = async () => {
      try {
        await apiRequest("POST", "/api/v2/dungeons/solo/dismiss", { sessionId: session.id });
      } catch (e) {}
      setHasActiveDungeonRun(false);
      queryClient.invalidateQueries({ queryKey: ["/api/v2/dungeons/solo/active"] });
      navigate("/dungeons");
    };
    return <ResultScreen session={session} language={language} isMobile={isMobile} onClaim={handleReturnFromResult} claiming={false} />;
  }

  if (isSoloOffline) {
    return <OfflineScreen session={session as SoloSession} isMobile={isMobile} onClaim={() => claimMutation.mutate()} claiming={claimMutation.isPending} />;
  }

  const risk = getRiskColor(session.riskLevel || 0);
  const nextFloor = session.nextFloor;
  const lootEntries = Object.entries(session.lootPool || {});
  const extractedGold = Math.floor((session.totalGold || 0) * ((session.extractionPercent || 100) / 100));

  return (
    <div className={cn("flex flex-col gap-3 p-3 sm:p-4 max-w-4xl mx-auto w-full", isMobile && "pb-24")} data-testid="dungeon-run-page">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackClick}
            className="gap-1 text-muted-foreground hover:text-foreground"
            data-testid="back-to-dungeons"
          >
            <CaretLeft className="w-4 h-4" />
            {!isMobile && "Back"}
          </Button>
          <div className="p-2 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)] rounded-lg border border-gray-700/50">
            <Skull className="w-5 h-5 text-gray-300" weight="fill" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground" data-testid="dungeon-name">{session.dungeonName}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Stairs className="w-3.5 h-3.5" weight="duotone" />
              <span data-testid="current-floor">Floor {session.currentFloor}{session.maxFloors ? ` / ${session.maxFloors}` : ""}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-gray-700/50 bg-black/30" data-testid="risk-display">
            <Warning className={cn("w-3.5 h-3.5", risk.text)} weight="fill" />
            <div className="w-16 h-2 bg-black/40 rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full transition-all", risk.bar)} style={{ width: `${Math.min(100, ((session.riskLevel || 0) / 20) * 100)}%` }} />
            </div>
            <span className={cn("text-[10px] font-bold", risk.text)}>{risk.label}</span>
          </div>
        </div>
      </div>

      {session.curses && session.curses.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="curses-display">
          {(session.curses || []).map((curse, idx) => {
            const info = CURSE_LABELS[curse.type];
            const tooltipText = language === 'tr' ? (info?.tooltipTr || info?.tooltip) : info?.tooltip;
            return (
              <TooltipProvider key={`${curse.type}-${idx}`}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/40 text-red-300 border border-red-700/30 cursor-help"
                      data-testid={`curse-${curse.type}-${idx}`}
                    >
                      {info?.label || curse.type}
                      {curse.stackCount > 1 && ` ×${curse.stackCount}`}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-sm">{tooltipText}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      )}

      {!isParty && (() => {
        const soloSession = session as SoloSession;
        const displayHp = soloCombatActive ? soloCombatPlayerHp : (lastFloorResult ? lastFloorResult.playerHp : soloSession.playerHp);
        const displayMaxHp = soloCombatActive ? soloCombatPlayerMaxHp : (lastFloorResult ? lastFloorResult.playerMaxHp : soloSession.playerMaxHp);
        return (
          <div className="px-1" data-testid="always-visible-hp-bar">
            <CombatHpBar
              current={displayHp || 0}
              max={displayMaxHp || 1}
              label="❤️ Your HP"
              showText={true}
              size="md"
            />
          </div>
        );
      })()}

      {isParty && partySession && (() => {
        const me = (partySession.members || []).find(m => String(m.playerId) === String(player?.id));
        if (!me) return null;
        const myHp = partyReplayPlaying ? (partyReplayHp[me.playerId] ?? me.hp) : me.hp;
        return (
          <div className="px-1" data-testid="always-visible-hp-bar">
            <CombatHpBar
              current={myHp || 0}
              max={me.maxHp || 1}
              label="❤️ Your HP"
              showText={true}
              size="md"
            />
          </div>
        );
      })()}

      <Card className="border-gray-700/50 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]" data-testid="consumables-panel">
        <CardContent className={cn("space-y-2", isMobile ? "p-3" : "p-4")}>
          <div className="flex items-center gap-2 mb-1">
            <Cookie className="w-4 h-4 text-amber-400" weight="fill" />
            <span className="text-sm font-bold text-gray-200">Consumables</span>
          </div>

          {consumeMessage && (
            <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded px-2 py-1 animate-in fade-in duration-300" data-testid="consume-message">
              {consumeMessage}
            </div>
          )}

          <div className={cn("flex gap-3", isMobile ? "flex-col" : "")}>
            <div className="flex-1 flex items-center gap-2 p-2 rounded-lg bg-black/30 border border-gray-700/30" data-testid="food-row">
              <div className="relative">
                {dungeonSelectedFood ? (
                  <button
                    onClick={() => setFoodSelectorOpen(!foodSelectorOpen)}
                    className="w-9 h-9 rounded border border-gray-600/50 bg-black/40 flex items-center justify-center hover:border-amber-500/50 transition-colors"
                    data-testid="food-icon-button"
                  >
                    {(() => {
                      const img = getItemImage(dungeonSelectedFood);
                      return img ? (
                        <img src={img} alt="" className="w-7 h-7 object-contain" />
                      ) : (
                        <Cookie className="w-5 h-5 text-amber-400" weight="fill" />
                      );
                    })()}
                  </button>
                ) : (
                  <button
                    onClick={() => setFoodSelectorOpen(!foodSelectorOpen)}
                    className="w-9 h-9 rounded border border-dashed border-gray-600/50 bg-black/40 flex items-center justify-center hover:border-amber-500/50 transition-colors"
                    data-testid="food-icon-button"
                  >
                    <Cookie className="w-5 h-5 text-gray-500" />
                  </button>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-gray-300 font-medium truncate" data-testid="food-name">
                  {dungeonSelectedFood ? translateItemName(dungeonSelectedFood, language) : "No food selected"}
                </div>
                <div className="text-[10px] text-gray-500">
                  {dungeonSelectedFood ? (
                    <span>
                      {currentFoodCount} left
                      {getFoodHealAmount(dungeonSelectedFood) > 0 && ` · +${getFoodHealAmount(dungeonSelectedFood)} HP`}
                    </span>
                  ) : "Click to select"}
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                className={cn(
                  "h-7 px-2 text-[10px] font-bold border-amber-700/50 text-amber-300 hover:bg-amber-950/50",
                  eatCooldownDisplay && "opacity-50"
                )}
                onClick={handleEatFood}
                disabled={
                  !dungeonSelectedFood ||
                  currentFoodCount <= 0 ||
                  soloCombatActive ||
                  partyReplayPlaying ||
                  isHpFull ||
                  !!eatCooldownDisplay ||
                  consumeMutation.isPending
                }
                data-testid="eat-food-button"
              >
                {eatCooldownDisplay ? eatCooldownDisplay : "Eat"}
              </Button>

              <div className="flex items-center gap-1">
                <Label htmlFor="auto-eat-toggle" className="text-[9px] text-gray-500 whitespace-nowrap">Auto</Label>
                <Switch
                  id="auto-eat-toggle"
                  checked={autoEatEnabled}
                  onCheckedChange={setAutoEatEnabled}
                  className="scale-[0.6] data-[state=checked]:bg-amber-600"
                  data-testid="auto-eat-toggle"
                />
              </div>
            </div>

            <div className="flex-1 flex items-center gap-2 p-2 rounded-lg bg-black/30 border border-gray-700/30" data-testid="potion-row">
              <div className="relative">
                {dungeonSelectedPotion ? (
                  <button
                    onClick={() => setPotionSelectorOpen(!potionSelectorOpen)}
                    className="w-9 h-9 rounded border border-gray-600/50 bg-black/40 flex items-center justify-center hover:border-purple-500/50 transition-colors"
                    data-testid="potion-icon-button"
                  >
                    {(() => {
                      const img = getItemImage(dungeonSelectedPotion);
                      return img ? (
                        <img src={img} alt="" className="w-7 h-7 object-contain" />
                      ) : (
                        <Drop className="w-5 h-5 text-purple-400" weight="fill" />
                      );
                    })()}
                  </button>
                ) : (
                  <button
                    onClick={() => setPotionSelectorOpen(!potionSelectorOpen)}
                    className="w-9 h-9 rounded border border-dashed border-gray-600/50 bg-black/40 flex items-center justify-center hover:border-purple-500/50 transition-colors"
                    data-testid="potion-icon-button"
                  >
                    <Drop className="w-5 h-5 text-gray-500" />
                  </button>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-gray-300 font-medium truncate" data-testid="potion-name">
                  {dungeonSelectedPotion ? translateItemName(dungeonSelectedPotion, language) : "No potion selected"}
                </div>
                <div className="text-[10px] text-gray-500">
                  {dungeonSelectedPotion ? `${currentPotionCount} left` : "Click to select"}
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[10px] font-bold border-purple-700/50 text-purple-300 hover:bg-purple-950/50"
                onClick={handleDrinkPotion}
                disabled={
                  !dungeonSelectedPotion ||
                  currentPotionCount <= 0 ||
                  soloCombatActive ||
                  partyReplayPlaying ||
                  hasActivePotionBuff ||
                  consumeMutation.isPending
                }
                data-testid="drink-potion-button"
              >
                {hasActivePotionBuff ? "Active" : "Drink"}
              </Button>

              <div className="flex items-center gap-1">
                <Label htmlFor="auto-potion-toggle" className="text-[9px] text-gray-500 whitespace-nowrap">Auto</Label>
                <Switch
                  id="auto-potion-toggle"
                  checked={autoPotionEnabled}
                  onCheckedChange={setAutoPotionEnabled}
                  className="scale-[0.6] data-[state=checked]:bg-purple-600"
                  data-testid="auto-potion-toggle"
                />
              </div>
            </div>
          </div>

          {foodSelectorOpen && (
            <div className="p-2 rounded-lg bg-black/50 border border-gray-700/30 space-y-1 max-h-40 overflow-y-auto" data-testid="food-selector">
              {foodItems.length === 0 ? (
                <div className="text-[10px] text-gray-500 text-center py-2">No food in inventory</div>
              ) : (
                foodItems.map(([id, qty]) => {
                  const img = getItemImage(id);
                  const name = translateItemName(id, language);
                  const heal = getFoodHealAmount(id);
                  return (
                    <button
                      key={id}
                      onClick={() => { setDungeonSelectedFood(id); setFoodSelectorOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-amber-500/10 transition-colors",
                        dungeonSelectedFood === id && "bg-amber-500/15 border border-amber-500/30"
                      )}
                      data-testid={`food-option-${id}`}
                    >
                      {img ? (
                        <img src={img} alt="" className="w-5 h-5 object-contain" />
                      ) : (
                        <Cookie className="w-4 h-4 text-amber-400" />
                      )}
                      <span className="text-[10px] text-gray-300 flex-1 truncate">{name}</span>
                      {heal > 0 && <span className="text-[9px] text-green-400">+{heal}</span>}
                      <span className="text-[9px] text-gray-500">×{qty}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {potionSelectorOpen && (
            <div className="p-2 rounded-lg bg-black/50 border border-gray-700/30 space-y-1 max-h-40 overflow-y-auto" data-testid="potion-selector">
              {potionItems.length === 0 ? (
                <div className="text-[10px] text-gray-500 text-center py-2">No potions in inventory</div>
              ) : (
                potionItems.map(([id, qty]) => {
                  const img = getItemImage(id);
                  const name = translateItemName(id, language);
                  return (
                    <button
                      key={id}
                      onClick={() => { setDungeonSelectedPotion(id); setPotionSelectorOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-purple-500/10 transition-colors",
                        dungeonSelectedPotion === id && "bg-purple-500/15 border border-purple-500/30"
                      )}
                      data-testid={`potion-option-${id}`}
                    >
                      {img ? (
                        <img src={img} alt="" className="w-5 h-5 object-contain" />
                      ) : (
                        <Drop className="w-4 h-4 text-purple-400" />
                      )}
                      <span className="text-[10px] text-gray-300 flex-1 truncate">{name}</span>
                      <span className="text-[9px] text-gray-500">×{qty}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-12")}>
        <div className={cn(isMobile ? "" : isParty ? "col-span-8" : "col-span-12", "space-y-3")}>
          {nextFloor && !isParty && (
            <>
              <BossStage
                monster={{
                  name: getLocalizedMonsterName(language, nextFloor.monsterName.toLowerCase().replace(/\s+/g, '_')) || nextFloor.monsterName,
                  id: nextFloor.monsterName.toLowerCase().replace(/\s+/g, '_'),
                  hp: soloCombatActive ? soloCombatMonsterHp : nextFloor.monsterHp,
                  maxHp: soloCombatActive ? soloCombatMonsterMaxHp : nextFloor.monsterHp,
                  attack: nextFloor.monsterAttack,
                  defense: nextFloor.monsterDefence,
                  attackSpeedMs: nextFloor.monsterAttackSpeed,
                  attackAccumulator: 0,
                  isBoss: nextFloor.isBoss,
                  enraged: nextFloor.isBoss && soloCombatActive && soloCombatMonsterHp > 0 && soloCombatMonsterMaxHp > 0 && (soloCombatMonsterHp / soloCombatMonsterMaxHp) < 0.25,
                  powerMultiplier: (session as SoloSession)?.multiplier ? (session as SoloSession).multiplier / 100 : undefined,
                }}
                monsterImg={(() => {
                  const monsterNameLower = nextFloor.monsterName.toLowerCase().replace(/\s+/g, '_');
                  return getMonsterImage(monsterNameLower) || nextFloor.monsterImage;
                })()}
                currentFloor={nextFloor.floor}
                floatingNumbers={soloFloatingNumbers}
                accPct={soloCombatActive ? soloCombatMonsterAccPct : 0}
                aggroTargetId={null}
                summonAddsAnim={false}
                monsterHitKey={soloMonsterHitKey}
              />

              <Card className="border-gray-700/50 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]">
                <CardContent className="p-3 space-y-3">
                  <div className={cn("space-y-0.5", playerHpShake && "animate-shake")}>
                    <CombatHpBar
                      current={(() => {
                        const soloSession = session as SoloSession;
                        return soloCombatActive ? soloCombatPlayerHp : (lastFloorResult ? lastFloorResult.playerHp : soloSession.playerHp);
                      })()}
                      max={(() => {
                        const soloSession = session as SoloSession;
                        return soloCombatActive ? soloCombatPlayerMaxHp : (lastFloorResult ? lastFloorResult.playerMaxHp : soloSession.playerMaxHp);
                      })()}
                      label="Your Health"
                      showText={true}
                      size="sm"
                      barClassName="bg-green-950/30"
                    />
                    {soloCombatActive && (
                      <div className="h-1 w-full bg-black/40 rounded-full overflow-hidden border border-cyan-900/20">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-teal-500 transition-none"
                          style={{ width: `${soloCombatPlayerAccPct}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      className={cn(
                        "flex-1 font-bold text-white",
                        autoFloorEnabled
                          ? "bg-gradient-to-r from-purple-700 to-indigo-600 hover:from-purple-600 hover:to-indigo-500 ring-2 ring-purple-400/50 animate-pulse"
                          : "bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500"
                      )}
                      onClick={() => {
                        if (autoFloorEnabled) {
                          setAutoFloorEnabled(false);
                          if (autoFloorTimerRef.current) clearTimeout(autoFloorTimerRef.current);
                        } else {
                          setCombatAnimPhase("idle");
                          startSoloCombat();
                        }
                      }}
                      disabled={fightFloorMutation.isPending || combatAnimPhase === "fighting" || soloCombatActive}
                      data-testid="fight-floor-button"
                    >
                      {autoFloorEnabled ? (
                        <span className="flex items-center gap-1.5">
                          <Pause className="w-4 h-4" weight="bold" />
                          Auto Running...
                        </span>
                      ) : combatAnimPhase === "fighting" ? (
                        <span className="flex items-center gap-1.5">
                          <Sword className="w-4 h-4 animate-pulse" weight="bold" />
                          Fighting...
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <Sword className="w-4 h-4" weight="bold" />
                          Fight Floor
                        </span>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-amber-700/50 text-amber-300 hover:bg-amber-950/50"
                      onClick={() => extractMutation.mutate()}
                      disabled={extractMutation.isPending || fightFloorMutation.isPending || combatAnimPhase === "fighting" || soloCombatActive || autoFloorEnabled}
                      data-testid="extract-button"
                    >
                      {extractMutation.isPending ? (
                        <ArrowsClockwise className="w-4 h-4 animate-spin" />
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <SignOut className="w-4 h-4" weight="bold" />
                          Extract
                        </span>
                      )}
                    </Button>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-gray-700/30" data-testid="auto-floor-panel">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setAutoFloorSettingsOpen(!autoFloorSettingsOpen)}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                        data-testid="toggle-auto-floor-settings"
                      >
                        <GearSix className="w-3.5 h-3.5" weight="fill" />
                        <span className="font-semibold uppercase tracking-wider">Auto Floor</span>
                        {autoFloorSettingsOpen ? <CaretUp className="w-3 h-3" /> : <CaretDown className="w-3 h-3" />}
                      </button>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="auto-floor-toggle" className="text-[10px] text-gray-500">
                          {autoFloorEnabled ? "ON" : "OFF"}
                        </Label>
                        <Switch
                          id="auto-floor-toggle"
                          checked={autoFloorEnabled}
                          onCheckedChange={(checked) => {
                            setAutoFloorEnabled(checked);
                            if (checked && !soloCombatActive && combatAnimPhase !== "fighting") {
                              setCombatAnimPhase("idle");
                              startSoloCombat();
                            }
                            if (!checked && autoFloorTimerRef.current) {
                              clearTimeout(autoFloorTimerRef.current);
                            }
                          }}
                          className="data-[state=checked]:bg-purple-600"
                          data-testid="auto-floor-toggle"
                        />
                      </div>
                    </div>

                    {autoFloorSettingsOpen && (
                      <div className="space-y-3 p-3 rounded-lg bg-black/30 border border-gray-700/30" data-testid="auto-floor-settings">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs text-gray-300">
                            <Crown className="w-3.5 h-3.5 text-yellow-400" weight="fill" />
                            <span>Stop on Boss Floor</span>
                          </div>
                          <Switch
                            checked={autoFloorSettings.stopOnBoss}
                            onCheckedChange={(v) => setAutoFloorSettings(s => ({ ...s, stopOnBoss: v }))}
                            className="scale-75 data-[state=checked]:bg-yellow-600"
                            data-testid="setting-stop-on-boss"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-gray-300">
                              <Warning className="w-3.5 h-3.5 text-orange-400" weight="fill" />
                              <span>Stop on High Chaos</span>
                            </div>
                            <Switch
                              checked={autoFloorSettings.stopOnHighChaos}
                              onCheckedChange={(v) => setAutoFloorSettings(s => ({ ...s, stopOnHighChaos: v }))}
                              className="scale-75 data-[state=checked]:bg-orange-600"
                              data-testid="setting-stop-on-chaos"
                            />
                          </div>
                          {autoFloorSettings.stopOnHighChaos && (
                            <div className="flex items-center gap-2 pl-5">
                              <span className="text-[10px] text-gray-500 min-w-[24px]">{autoFloorSettings.chaosThreshold}%</span>
                              <Slider
                                value={[autoFloorSettings.chaosThreshold]}
                                onValueChange={([v]) => setAutoFloorSettings(s => ({ ...s, chaosThreshold: v }))}
                                min={20}
                                max={100}
                                step={5}
                                className="flex-1"
                                data-testid="slider-chaos-threshold"
                              />
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-gray-300">
                              <Cookie className="w-3.5 h-3.5 text-amber-400" weight="fill" />
                              <span>Stop on Low Food</span>
                            </div>
                            <Switch
                              checked={autoFloorSettings.stopOnLowFood}
                              onCheckedChange={(v) => setAutoFloorSettings(s => ({ ...s, stopOnLowFood: v }))}
                              className="scale-75 data-[state=checked]:bg-amber-600"
                              data-testid="setting-stop-on-food"
                            />
                          </div>
                          {autoFloorSettings.stopOnLowFood && (
                            <div className="flex items-center gap-2 pl-5">
                              <span className="text-[10px] text-gray-500 min-w-[24px]">≤{autoFloorSettings.foodThreshold}</span>
                              <Slider
                                value={[autoFloorSettings.foodThreshold]}
                                onValueChange={([v]) => setAutoFloorSettings(s => ({ ...s, foodThreshold: v }))}
                                min={0}
                                max={20}
                                step={1}
                                className="flex-1"
                                data-testid="slider-food-threshold"
                              />
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-gray-300">
                              <FirstAid className="w-3.5 h-3.5 text-red-400" weight="fill" />
                              <span>Stop on Low HP</span>
                            </div>
                            <Switch
                              checked={autoFloorSettings.stopOnLowHp}
                              onCheckedChange={(v) => setAutoFloorSettings(s => ({ ...s, stopOnLowHp: v }))}
                              className="scale-75 data-[state=checked]:bg-red-600"
                              data-testid="setting-stop-on-hp"
                            />
                          </div>
                          {autoFloorSettings.stopOnLowHp && (
                            <div className="flex items-center gap-2 pl-5">
                              <span className="text-[10px] text-gray-500 min-w-[24px]">{autoFloorSettings.hpThreshold}%</span>
                              <Slider
                                value={[autoFloorSettings.hpThreshold]}
                                onValueChange={([v]) => setAutoFloorSettings(s => ({ ...s, hpThreshold: v }))}
                                min={5}
                                max={80}
                                step={5}
                                className="flex-1"
                                data-testid="slider-hp-threshold"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {nextFloor && isParty && (
            <Card className="border-gray-700/50 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]" data-testid="next-floor-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sword className={cn("w-5 h-5", nextFloor.isBoss ? "text-yellow-400" : "text-red-400")} weight="fill" />
                    <span className={cn("font-bold", nextFloor.isBoss ? "text-yellow-400" : "text-gray-100")}>
                      Floor {nextFloor.floor}
                    </span>
                  </div>
                  {nextFloor.isBoss && (
                    <Badge className="text-[10px] bg-gradient-to-r from-red-600 to-orange-600 border-0 text-white">
                      <Crown className="w-3 h-3 mr-0.5" weight="fill" />
                      BOSS
                    </Badge>
                  )}
                </div>

                <div className={cn("flex gap-4", isMobile ? "flex-col items-center" : "items-start")}>
                  <div className={cn(
                    "rounded-xl border-2 overflow-hidden bg-black/50 flex items-center justify-center shrink-0",
                    isMobile ? "w-28 h-28" : "w-32 h-32",
                    nextFloor.isBoss ? "border-yellow-500/50" : "border-gray-600/50"
                  )} data-testid="monster-portrait">
                    {(() => {
                      const monsterNameLower = nextFloor.monsterName.toLowerCase().replace(/\s+/g, '_');
                      const img = getMonsterImage(monsterNameLower) || nextFloor.monsterImage;
                      return img ? (
                        <img src={img} alt={nextFloor.monsterName} className={cn("w-full h-full object-cover", monsterAnimation === "hit" && "animate-shake brightness-150", monsterAnimation === "attacking" && "scale-110 translate-y-1")} />
                      ) : (
                        <Skull className="w-12 h-12 text-red-400" weight="fill" />
                      );
                    })()}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2 w-full">
                    <div>
                      <h3 className="text-base font-bold text-gray-100" data-testid="monster-name">
                        {getLocalizedMonsterName(language, nextFloor.monsterName.toLowerCase().replace(/\s+/g, '_')) || nextFloor.monsterName}
                      </h3>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <Sword className="w-3.5 h-3.5 text-orange-400" weight="fill" />
                        <span>ATK:</span>
                        <span className="text-gray-200 font-semibold" data-testid="monster-attack">{nextFloor.monsterAttack}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <Shield className="w-3.5 h-3.5 text-blue-400" weight="fill" />
                        <span>DEF:</span>
                        <span className="text-gray-200 font-semibold" data-testid="monster-defence">{nextFloor.monsterDefence}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <Timer className="w-3.5 h-3.5 text-purple-400" weight="fill" />
                        <span>SPD:</span>
                        <span className="text-gray-200 font-semibold" data-testid="monster-speed">{(nextFloor.monsterAttackSpeed / 1000).toFixed(1)}s</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    className="flex-1 font-bold text-white bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500"
                    onClick={() => {
                      setCombatAnimPhase("idle");
                      fightFloorMutation.mutate();
                    }}
                    disabled={fightFloorMutation.isPending || isVoting || combatAnimPhase === "fighting" || partyReplayPlaying}
                    data-testid="fight-floor-button"
                  >
                    {fightFloorMutation.isPending || combatAnimPhase === "fighting" ? (
                      <span className="flex items-center gap-1.5">
                        <Sword className="w-4 h-4 animate-pulse" weight="bold" />
                        Fighting...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Sword className="w-4 h-4" weight="bold" />
                        Fight Floor
                      </span>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}


          {partyReplayPlaying && isParty && partySession && (
            <Card className="border-purple-700/30 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)] overflow-hidden" data-testid="party-replay-card">
              <div className="h-1 w-full bg-gradient-to-r from-purple-700 via-pink-500 to-purple-700 animate-pulse" />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-4 h-4 text-purple-400 animate-pulse" weight="bold" />
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-400">Combat Replay</span>
                </div>

                <div className="space-y-2">
                  <div className="space-y-1" data-testid="replay-monster-hp">
                    <div className="flex items-center gap-1.5 text-xs text-gray-300">
                      <Skull className={cn("w-3.5 h-3.5", partyReplayMonsterSilenced ? "text-gray-500" : "text-red-400")} weight="fill" />
                      <span className={cn("font-semibold", partyReplayMonsterSilenced && "text-gray-500")}>Monster</span>
                      {partyReplayMonsterSilenced && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 border-gray-500/50 text-gray-400 bg-gray-800/50 animate-pulse" data-testid="replay-silence-indicator">
                          🔇 Silenced
                        </Badge>
                      )}
                      <span className="ml-auto text-[10px] text-gray-500">{formatNumber(partyReplayMonsterHp)} / {formatNumber(partyReplayMonsterMaxHp)}</span>
                    </div>
                    <div className={cn("h-2.5 w-full bg-black/50 rounded-full overflow-hidden border", partyReplayMonsterSilenced ? "border-gray-600/50" : "border-gray-700/50")}>
                      <div
                        className={cn("h-full rounded-full transition-all duration-200", partyReplayMonsterSilenced ? "bg-gradient-to-r from-gray-600 to-gray-500" : "bg-gradient-to-r from-red-600 to-red-500")}
                        style={{ width: `${partyReplayMonsterMaxHp > 0 ? (partyReplayMonsterHp / partyReplayMonsterMaxHp) * 100 : 0}%` }}
                      />
                    </div>
                    {partyReplayPlaying && (
                      <div className="mt-0.5">
                        <div className="h-1 w-full bg-black/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-red-700 to-orange-500 rounded-full"
                            style={{ width: `${partyReplayMonsterAtkAcc}%`, transition: 'width 300ms linear' }}
                          />
                        </div>
                        <span className="text-[7px] text-red-400/60">ATK</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {(partySession.members || []).filter(m => m.status !== 'exited').map(member => {
                      const hp = partyReplayHp[member.playerId] ?? member.hp;
                      const replayRole = getDungeonRole(member.weaponType);
                      const isFrenzied = partyReplayFrenzyActive[member.playerId];
                      return (
                        <div key={member.playerId} className={cn("p-1.5 rounded border bg-black/20", isFrenzied ? "border-orange-500/60 shadow-[0_0_8px_rgba(249,115,22,0.3)]" : "border-gray-700/30")} data-testid={`replay-member-${member.playerId}`}>
                          <div className="flex items-center gap-1 mb-1">
                            <RoleIcon role={member.role} />
                            <span className="text-[10px] font-semibold text-gray-300 truncate">{member.playerName}</span>
                            {replayRole && (
                              <Badge
                                variant="outline"
                                className="text-[7px] px-0.5 py-0 ml-auto border-opacity-50"
                                style={{ borderColor: replayRole.roleColor, color: replayRole.roleColor, backgroundColor: `${replayRole.roleColor}15` }}
                                data-testid={`replay-role-badge-${member.playerId}`}
                              >
                                <span className="mr-0.5">{replayRole.passiveIcon}</span>
                                {replayRole.roleName}
                              </Badge>
                            )}
                          </div>
                          <CombatHpBar
                            current={hp}
                            max={member.maxHp}
                            showText={false}
                            size="sm"
                            className={cn(isFrenzied && "ring-1 ring-orange-400/40 rounded")}
                          />
                          {partyReplayPlaying && (
                            <div className="mt-0.5">
                              <div className="h-1 w-full bg-black/40 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-amber-600 to-yellow-400 rounded-full"
                                  style={{ width: `${partyReplayAtkAcc[member.playerId] ?? 0}%`, transition: 'width 300ms linear' }}
                                />
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-0.5">
                            {isFrenzied && (
                              <span className="text-[8px] text-orange-400 font-bold animate-pulse" data-testid={`replay-frenzy-${member.playerId}`}>
                                🔥 FRENZY
                              </span>
                            )}
                            <span className="text-[8px] text-gray-500 ml-auto">
                              {formatNumber(hp)}/{formatNumber(member.maxHp)}
                              {member.attackSpeed != null && ` · ${(member.attackSpeed / 1000).toFixed(1)}s`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {Object.keys(partyReplayPassiveCounts).length > 0 && (
                  <div className="flex flex-wrap gap-1.5" data-testid="replay-passive-counts">
                    {partyReplayPassiveCounts['dodge'] > 0 && (
                      <Badge variant="outline" className="text-[9px] bg-purple-500/10 border-purple-500/30 text-purple-400">
                        🗡️ Dodges: {partyReplayPassiveCounts['dodge']}
                      </Badge>
                    )}
                    {partyReplayPassiveCounts['skill_blocked'] > 0 && (
                      <Badge variant="outline" className="text-[9px] bg-blue-500/10 border-blue-500/30 text-blue-400">
                        🛡️ Blocked: {partyReplayPassiveCounts['skill_blocked']}
                      </Badge>
                    )}
                    {partyReplayPassiveCounts['silence'] > 0 && (
                      <Badge variant="outline" className="text-[9px] bg-gray-500/10 border-gray-500/30 text-gray-400">
                        🔇 Silences: {partyReplayPassiveCounts['silence']}
                      </Badge>
                    )}
                    {partyReplayPassiveCounts['frenzy_activate'] > 0 && (
                      <Badge variant="outline" className="text-[9px] bg-orange-500/10 border-orange-500/30 text-orange-400">
                        🔥 Frenzy: {partyReplayPassiveCounts['frenzy_activate']}
                      </Badge>
                    )}
                    {partyReplayPassiveCounts['execute_bonus'] > 0 && (
                      <Badge variant="outline" className="text-[9px] bg-red-500/10 border-red-500/30 text-red-400">
                        💀 Executes: {partyReplayPassiveCounts['execute_bonus']}
                      </Badge>
                    )}
                  </div>
                )}

                <div className="relative">
                  <FloatingDamageNumbers events={partyDmgEvents} />
                </div>

                <ScrollArea className="h-[100px]">
                  <div className="space-y-0.5 pr-2">
                    {partyReplayLogs.map((log, i) => (
                      <div key={i} className="text-[11px] text-gray-300 animate-in fade-in slide-in-from-left-1 duration-200">
                        {log}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {!nextFloor && !isCompleted && combatAnimPhase !== "fighting" && (
            <Card className="border-gray-700/50 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]">
              <CardContent className="p-6 text-center space-y-3">
                <ArrowsClockwise className="w-8 h-8 text-muted-foreground mx-auto animate-spin" />
                <p className="text-sm text-muted-foreground">Loading next floor...</p>
              </CardContent>
            </Card>
          )}

          {lastFloorResult && (
            <Card className={cn(
              "border",
              lastFloorResult.playerAlive ? "border-green-700/50" : "border-red-700/50",
              "bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]"
            )} data-testid="floor-result-card">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {lastFloorResult.playerAlive ? (
                    <CheckCircle className="w-5 h-5 text-green-400" weight="fill" />
                  ) : (
                    <Skull className="w-5 h-5 text-red-400" weight="fill" />
                  )}
                  <span className={cn("font-bold text-sm", lastFloorResult.playerAlive ? "text-green-400" : "text-red-400")} data-testid="floor-result-title">
                    {lastFloorResult.playerAlive
                      ? `Floor ${lastFloorResult.floor} cleared!`
                      : `Defeated on Floor ${lastFloorResult.floor}`}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center gap-1 text-gray-400">
                    <Sword className="w-3 h-3 text-orange-400" weight="fill" />
                    <span>Dealt: <span className="text-gray-200 font-semibold">{formatNumber(lastFloorResult.damageDealt)}</span></span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-400">
                    <Heart className="w-3 h-3 text-red-400" weight="fill" />
                    <span>Taken: <span className="text-gray-200 font-semibold">{formatNumber(lastFloorResult.damageTaken)}</span></span>
                  </div>
                  {lastFloorResult.healingDone > 0 && (
                    <div className="flex items-center gap-1 text-gray-400">
                      <Heart className="w-3 h-3 text-green-400" weight="fill" />
                      <span>Healed: <span className="text-gray-200 font-semibold">{formatNumber(lastFloorResult.healingDone)}</span></span>
                    </div>
                  )}
                </div>

                {Object.keys(lastFloorResult.loot || {}).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {Object.entries(lastFloorResult.loot || {}).map(([itemId, qty]) => {
                      const img = getItemImage(itemId);
                      const name = translateItemName(itemId, language);
                      return (
                        <div
                          key={itemId}
                          className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px]", getItemRarityBgColor(itemId))}
                          title={name}
                          data-testid={`floor-loot-${itemId}`}
                        >
                          {img ? (
                            <img src={img} alt={name} className="w-4 h-4 object-contain" />
                          ) : (
                            <Package className="w-3 h-3 text-gray-500" />
                          )}
                          <span className={cn("font-medium", getItemRarityColor(itemId) || "text-gray-300")}>{name}</span>
                          {qty > 1 && <span className="text-gray-400">×{qty}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {(lastFloorResult.gold > 0 || lastFloorResult.xp > 0) && (
                  <div className="flex items-center gap-3 text-xs pt-1">
                    {lastFloorResult.gold > 0 && <GoldDisplay amount={lastFloorResult.gold} size="xs" />}
                    {lastFloorResult.xp > 0 && (
                      <div className="flex items-center gap-1 text-purple-400">
                        <Star className="w-3 h-3" weight="fill" />
                        <span className="font-semibold">+{formatNumber(lastFloorResult.xp)} XP</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {dungeonLogEntries.length > 0 && (
            <div data-testid="dungeon-combat-log">
              <CombatLogPanel
                entries={dungeonLogEntries}
                compact={true}
                collapsible={true}
                defaultOpen={true}
                logTitle="Combat Log"
                className="border-gray-700/50"
              />
            </div>
          )}

          {isVoting && partySession && (
            <Card className="border-amber-600/50 bg-[radial-gradient(ellipse_at_center,_#2a2215_0%,_#1f1a10_40%,_#0d0d0a_100%)]" data-testid="vote-panel">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-amber-400" weight="fill" />
                    <span className="font-bold text-amber-300">Vote: Continue or Exit?</span>
                  </div>
                  {partySession.voteDeadline && (
                    <Badge variant="outline" className="text-xs bg-amber-500/10 border-amber-500/30 text-amber-400" data-testid="vote-countdown">
                      <Timer className="w-3 h-3 mr-1" weight="fill" />
                      {voteCountdown}
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 italic">Default: exit if time runs out</p>

                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-gradient-to-r from-green-700 to-green-600 hover:from-green-600 hover:to-green-500 text-white font-bold"
                    onClick={() => voteMutation.mutate("continue")}
                    disabled={voteMutation.isPending}
                    data-testid="vote-continue-button"
                  >
                    <Play className="w-4 h-4 mr-1" weight="fill" />
                    Continue
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-red-700/50 text-red-300 hover:bg-red-950/50"
                    onClick={() => voteMutation.mutate("exit")}
                    disabled={voteMutation.isPending}
                    data-testid="vote-exit-button"
                  >
                    <SignOut className="w-4 h-4 mr-1" weight="bold" />
                    Exit
                  </Button>
                </div>

                {partySession?.members && partySession.members.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    {(partySession.members || []).filter(m => m.status === "alive").map((member) => {
                      const memberVote = (partySession.votes || []).find(v => String(v.playerId) === String(member.playerId));
                      return (
                        <Badge
                          key={member.playerId}
                          variant="outline"
                          className={cn(
                            memberVote
                              ? memberVote.vote === "continue"
                                ? "bg-green-500/10 border-green-500/30 text-green-400"
                                : "bg-red-500/10 border-red-500/30 text-red-400"
                              : "bg-gray-500/10 border-gray-500/30 text-gray-400 animate-pulse"
                          )}
                          data-testid={`vote-${member.playerId}`}
                        >
                          {memberVote ? (memberVote.vote === "continue" ? "✓" : "✗") : "?"} {member.playerName || "Unknown"}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!isParty && (
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-blue-500/10 border-blue-500/30 text-blue-400">
                  Floor {session.currentFloor - 1}
                </Badge>
                <div className="flex items-center gap-1.5">
                  <GoldDisplay amount={session.totalGold || 0} size="xs" />
                  <span className="text-[10px] text-gray-500">({formatNumber(extractedGold)}g)</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-purple-500/10 border-purple-500/30 text-purple-400">
                  <Star className="w-2.5 h-2.5 mr-1" weight="fill" />
                  {formatNumber(session.totalXp || 0)} XP
                </Badge>
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 border-amber-500/30 text-amber-400">
                  {session.extractionPercent || 100}% Ext
                </Badge>
              </div>
            </div>
          )}

          {isParty && (
            <Card className="border-gray-700/50 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]" data-testid="run-stats-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="w-4 h-4 text-amber-400" weight="fill" />
                  <span className="text-sm font-bold text-gray-200">Run Stats</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="text-center p-2 rounded bg-black/30 border border-gray-700/30">
                    <Stairs className="w-4 h-4 mx-auto mb-1 text-blue-400" weight="duotone" />
                    <div className="text-lg font-bold text-blue-300" data-testid="stat-floors">{session.currentFloor - 1}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Cleared</div>
                  </div>
                  <div className="text-center p-2 rounded bg-black/30 border border-gray-700/30">
                    <div className="flex justify-center mb-1"><GoldDisplay amount={session.totalGold || 0} size="sm" /></div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider" data-testid="stat-gold">Gold</div>
                  </div>
                  <div className="text-center p-2 rounded bg-black/30 border border-gray-700/30">
                    <Star className="w-4 h-4 mx-auto mb-1 text-purple-400" weight="fill" />
                    <div className="text-lg font-bold text-purple-300" data-testid="stat-xp">{formatNumber(session.totalXp || 0)}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">XP</div>
                  </div>
                  <div className="text-center p-2 rounded bg-black/30 border border-gray-700/30">
                    <Target className="w-4 h-4 mx-auto mb-1 text-amber-400" weight="fill" />
                    <div className="text-lg font-bold text-amber-300" data-testid="stat-extraction">{session.extractionPercent || 100}%</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Extraction</div>
                  </div>
                </div>

                {session.multiplier && session.multiplier > 100 && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Monster Stats:</span>
                    <span className="text-yellow-400 font-bold" data-testid="stat-multiplier">
                      x{(session.multiplier / 100).toFixed(1)}
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-gray-500 cursor-help text-xs">ⓘ</span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <p className="text-sm">
                            {language === 'tr' 
                              ? `Canavar HP, ATK ve DEF değerleri x${(session.multiplier / 100).toFixed(1)} ile çarpılır. Daha yüksek çarpan = daha zor canavarlar ama daha iyi ödüller.`
                              : `Monster HP, ATK and DEF values are multiplied by x${(session.multiplier / 100).toFixed(1)}. Higher multiplier = harder monsters but better rewards.`
                            }
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
                {isParty && partySession && partySession.members && partySession.members.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">{language === 'tr' ? 'Parti Loot Bonusu:' : 'Party Loot Bonus:'}</span>
                    <span className="text-emerald-400 font-bold" data-testid="stat-party-loot-bonus">
                      +{Math.round((partySession.members.length - 1) * 15)}%
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-gray-500 cursor-help text-xs">ⓘ</span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <p className="text-sm">
                            {language === 'tr'
                              ? `Her ek parti üyesi loot, altın ve XP kazancını %15 artırır. ${partySession.members.length} üye = +${Math.round((partySession.members.length - 1) * 15)}% bonus.`
                              : `Each additional party member increases loot, gold and XP gains by 15%. ${partySession.members.length} members = +${Math.round((partySession.members.length - 1) * 15)}% bonus.`
                            }
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {lootEntries.length > 0 && (
            <Card className="border-gray-700/50 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]" data-testid="loot-pool-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-amber-400" weight="fill" />
                  <span className="text-sm font-bold text-gray-200">Loot Pool</span>
                  <Badge variant="outline" className="text-[10px] border-gray-600/50 text-gray-400 ml-auto">{lootEntries.length} items</Badge>
                </div>

                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                  {lootEntries.map(([itemId, qty]) => {
                    const img = getItemImage(itemId);
                    const name = translateItemName(itemId, language);
                    return (
                      <div
                        key={itemId}
                        className={cn(
                          "relative aspect-square rounded-lg border p-1 flex items-center justify-center hover:scale-105 transition-transform cursor-default",
                          getItemRarityBgColor(itemId)
                        )}
                        title={`${name} ×${qty}`}
                        data-testid={`loot-pool-item-${itemId}`}
                      >
                        {img ? (
                          <img src={img} alt={name} className="w-full h-full object-contain" />
                        ) : (
                          <Package className="w-5 h-5 text-muted-foreground" />
                        )}
                        {qty > 1 && (
                          <span className="absolute -bottom-0.5 -right-0.5 text-[9px] bg-black/80 px-1 rounded-tl rounded-br font-bold text-white/90">
                            {qty}
                          </span>
                        )}
                        {PARTY_EXCLUSIVE_ITEMS.has(itemId) && (
                          <span className="absolute -top-0.5 -left-0.5 text-[7px] bg-emerald-900/90 text-emerald-400 px-0.5 rounded-br rounded-tl font-bold border border-emerald-700/30">
                            P
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-700/30">
                  <div className="flex items-center gap-2">
                    <GoldDisplay amount={session.totalGold || 0} size="xs" />
                  </div>
                  <div className="text-gray-400">
                    Extraction {session.extractionPercent || 100}% → You get: <span className="text-amber-400 font-bold" data-testid="extraction-gold">{formatNumber(extractedGold)}g</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {isParty && (
            <Card className="border-gray-700/50 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]" data-testid="party-chat-card">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <ChatDots className="w-4 h-4 text-blue-400" weight="fill" />
                  <span className="text-sm font-bold text-gray-200">Party Chat</span>
                </div>
                <ScrollArea className="h-[120px]">
                  <div ref={chatScrollRef} className="space-y-1 pr-2">
                    {chatMessages.length === 0 && (
                      <p className="text-xs text-gray-500 italic text-center py-4">No messages yet</p>
                    )}
                    {chatMessages.map((msg) => (
                      <div key={msg.id} className="text-xs" data-testid={`chat-msg-${msg.id}`}>
                        <span className="font-semibold text-blue-300">{msg.playerName}: </span>
                        <span className="text-gray-300">{msg.content}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="flex gap-2">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                    placeholder="Type a message..."
                    className="text-xs h-8 bg-black/30 border-gray-700/50"
                    maxLength={200}
                    data-testid="chat-input"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 border-gray-700/50"
                    onClick={handleSendChat}
                    disabled={sendChatMutation.isPending || !chatInput.trim()}
                    data-testid="chat-send-button"
                  >
                    Send
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {isParty && partySession && (
          <div className={cn(isMobile ? "" : "col-span-4", "space-y-3")}>
            <Card className="border-gray-700/50 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]" data-testid="party-members-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" weight="fill" />
                  <span className="text-sm font-bold text-gray-200">Party Members</span>
                </div>

                <div className="space-y-2">
                  {(partySession.members || []).map((member) => {
                    const isDead = member.status === "dead";
                    const isExited = member.status === "exited";
                    const dungeonRole = getDungeonRole(member.weaponType);
                    return (
                      <div
                        key={member.playerId}
                        className={cn(
                          "p-2 rounded-lg border",
                          isDead ? "border-red-800/50 bg-red-950/20 opacity-60" :
                          isExited ? "border-gray-700/30 bg-gray-900/20 opacity-50" :
                          "border-gray-700/40 bg-black/20"
                        )}
                        data-testid={`party-member-${member.playerId}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <RoleIcon role={member.role} />
                            <span className={cn("text-xs font-semibold", isDead ? "text-red-400 line-through" : isExited ? "text-gray-500" : "text-gray-200")}>
                              {member.playerName}
                            </span>
                            {dungeonRole && !isDead && !isExited && (
                              <Badge
                                variant="outline"
                                className="text-[8px] px-1 py-0 border-opacity-50"
                                style={{ borderColor: dungeonRole.roleColor, color: dungeonRole.roleColor, backgroundColor: `${dungeonRole.roleColor}15` }}
                                data-testid={`role-badge-${member.playerId}`}
                              >
                                <span className="mr-0.5">{dungeonRole.passiveIcon}</span>
                                {dungeonRole.roleName}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {isDead && <Badge variant="outline" className="text-[8px] border-red-700/50 text-red-400 bg-red-950/30">Dead</Badge>}
                            {isExited && <Badge variant="outline" className="text-[8px] border-gray-600/50 text-gray-500 bg-gray-900/30">Exited</Badge>}
                            {member.threat > 0 && !isDead && !isExited && (
                              <Badge variant="outline" className="text-[8px] border-orange-700/50 text-orange-400 bg-orange-950/30" data-testid={`threat-${member.playerId}`}>
                                <Fire className="w-2.5 h-2.5 mr-0.5" weight="fill" />
                                {member.threat}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {!isExited && (
                          <CombatHpBar
                            current={member.hp}
                            max={member.maxHp}
                            showText={true}
                            size="sm"
                            className="mt-0.5"
                          />
                        )}
                        {!isDead && !isExited && (member.dps != null || member.defense != null || member.attackSpeed != null) && (
                          <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-500" data-testid={`member-stats-${member.playerId}`}>
                            {member.dps != null && (
                              <span className="flex items-center gap-0.5" title="DPS">
                                <Sword className="w-2.5 h-2.5 text-orange-400" weight="fill" />
                                {formatNumber(Math.floor(member.dps))}
                              </span>
                            )}
                            {member.defense != null && (
                              <span className="flex items-center gap-0.5" title="Defense">
                                <Shield className="w-2.5 h-2.5 text-blue-400" weight="fill" />
                                {formatNumber(Math.floor(member.defense))}
                              </span>
                            )}
                            {member.attackSpeed != null && (
                              <span className="flex items-center gap-0.5" title="Attack Speed">
                                <Timer className="w-2.5 h-2.5 text-purple-400" weight="fill" />
                                {(member.attackSpeed / 1000).toFixed(1)}s
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-red-800/50 text-red-400 hover:bg-red-950/50 text-xs"
                  onClick={() => exitPartyMutation.mutate()}
                  disabled={exitPartyMutation.isPending}
                  data-testid="exit-party-button"
                >
                  <SignOut className="w-3.5 h-3.5 mr-1" weight="bold" />
                  Leave Dungeon
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <AlertDialog open={showLeaveWarning} onOpenChange={setShowLeaveWarning}>
        <AlertDialogContent className="bg-[#1a1a2e] border-gray-700/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-400">
              <Warning className="w-5 h-5" weight="fill" />
              Leave Dungeon?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              You'll lose your progress if you haven't extracted. Any unclaimed loot and gold will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-gray-700/50 text-gray-300 hover:bg-gray-800"
              data-testid="cancel-leave-dungeon"
            >
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmLeave}
              className="bg-red-700 hover:bg-red-600 text-white"
              data-testid="confirm-leave-dungeon"
              disabled={isLeaving}
            >
              {isLeaving ? "Leaving..." : "Leave Dungeon"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RoleIcon({ role }: { role: string }) {
  switch (role) {
    case "tank":
      return <Shield className="w-3.5 h-3.5 text-blue-400" weight="fill" />;
    case "dps":
      return <Sword className="w-3.5 h-3.5 text-red-400" weight="fill" />;
    case "healer":
      return <Heart className="w-3.5 h-3.5 text-green-400" weight="fill" />;
    default:
      return <Star className="w-3.5 h-3.5 text-gray-400" weight="fill" />;
  }
}

function OfflineScreen({
  session,
  isMobile,
  onClaim,
  claiming,
}: {
  session: SoloSession;
  isMobile: boolean;
  onClaim: () => void;
  claiming: boolean;
}) {
  const [, navigate] = useLocation();
  const [elapsed, setElapsed] = useState(formatTimeSince(session.startedAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(formatTimeSince(session.startedAt));
    }, 60000);
    return () => clearInterval(interval);
  }, [session.startedAt]);

  return (
    <div className={cn("flex flex-col gap-4 p-4 max-w-xl mx-auto w-full", isMobile && "pb-24")} data-testid="offline-screen">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/dungeons")}
          className="gap-1 text-muted-foreground hover:text-foreground"
          data-testid="back-to-dungeons"
        >
          <CaretLeft className="w-4 h-4" />
          Back
        </Button>
        <div className="p-2 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)] rounded-lg border border-gray-700/50">
          <Skull className="w-5 h-5 text-gray-300" weight="fill" />
        </div>
        <h1 className="text-lg font-bold text-foreground" data-testid="offline-dungeon-name">{session.dungeonName}</h1>
      </div>

      <Card className="border-indigo-800/40 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]">
        <CardContent className="p-8 text-center space-y-5">
          <Moon className="w-16 h-16 text-indigo-400 mx-auto opacity-80" weight="fill" />

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-100" data-testid="offline-title">Dungeon in Progress...</h2>
            <p className="text-sm text-gray-400">Your hero explores the depths while you rest.</p>
          </div>

          <div className="space-y-1.5 text-sm text-gray-400">
            <div className="flex items-center justify-center gap-2">
              <Timer className="w-4 h-4 text-indigo-400" weight="fill" />
              <span>Started: <span className="text-gray-200 font-semibold" data-testid="offline-elapsed">{elapsed}</span></span>
            </div>
            {session.maxRunTimeMinutes > 0 && (
              <div className="flex items-center justify-center gap-2">
                <Timer className="w-4 h-4 text-gray-500" />
                <span>Max Duration: <span className="text-gray-200 font-semibold">{Math.floor(session.maxRunTimeMinutes / 60)}h</span></span>
              </div>
            )}
          </div>

          <Button
            className="w-full h-12 text-base font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white"
            onClick={onClaim}
            disabled={claiming}
            data-testid="claim-offline-button"
          >
            {claiming ? (
              <span className="flex items-center gap-2">
                <ArrowsClockwise className="w-5 h-5 animate-spin" />
                Claiming...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Star className="w-5 h-5" weight="fill" />
                Claim Results
              </span>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ResultScreen({
  session,
  language,
  isMobile,
  onClaim,
  claiming,
}: {
  session: Session;
  language: Language;
  isMobile: boolean;
  onClaim: () => void;
  claiming: boolean;
}) {
  const isSuccess = session.status === "completed" || session.status === "extracted";
  const lootEntries = Object.entries(session.lootPool || {});
  const extractedGold = Math.floor((session.totalGold || 0) * ((session.extractionPercent || 100) / 100));

  return (
    <div className={cn("flex flex-col gap-4 p-4 max-w-xl mx-auto w-full", isMobile && "pb-24")} data-testid="result-screen">
      <Card className={cn(
        "border overflow-hidden",
        isSuccess ? "border-green-700/40" : "border-red-700/40",
        "bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]"
      )}>
        <div className={cn(
          "h-1.5 w-full",
          isSuccess
            ? "bg-gradient-to-r from-green-600 via-emerald-400 to-green-600"
            : "bg-gradient-to-r from-red-700 via-red-500 to-red-700"
        )} />

        <CardContent className="p-6 sm:p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className={cn(
              "p-5 rounded-full",
              isSuccess
                ? "bg-gradient-to-br from-green-500/20 to-emerald-500/10 border-2 border-green-500/50"
                : "bg-gradient-to-br from-red-500/20 to-red-900/10 border-2 border-red-500/50"
            )}>
              {isSuccess ? (
                <Trophy className="w-14 h-14 text-green-400" weight="fill" />
              ) : (
                <Skull className="w-14 h-14 text-red-400" weight="fill" />
              )}
            </div>
          </div>

          <div>
            <h1 className={cn("text-2xl sm:text-3xl font-black", isSuccess ? "text-green-400" : "text-red-400")} data-testid="result-title">
              {session.status === "completed"
                ? "Dungeon Completed!"
                : session.status === "extracted"
                ? "Loot Extracted!"
                : "Dungeon Failed"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm" data-testid="result-dungeon-name">{session.dungeonName}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-black/30 rounded-xl p-3 border border-gray-700/30">
              <Stairs className="w-5 h-5 mx-auto mb-1 text-blue-400" weight="duotone" />
              <div className="text-xl font-bold text-blue-300" data-testid="result-floors">{session.currentFloor - 1}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Floors</div>
            </div>
            <div className="bg-black/30 rounded-xl p-3 border border-gray-700/30">
              <div className="flex justify-center mb-1">
                <GoldDisplay amount={extractedGold} size="sm" />
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider" data-testid="result-gold">Gold</div>
            </div>
            <div className="bg-black/30 rounded-xl p-3 border border-gray-700/30">
              <Star className="w-5 h-5 mx-auto mb-1 text-purple-400" weight="fill" />
              <div className="text-xl font-bold text-purple-300" data-testid="result-xp">{formatNumber(session.totalXp || 0)}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">XP</div>
            </div>
            <div className="bg-black/30 rounded-xl p-3 border border-gray-700/30">
              <Target className="w-5 h-5 mx-auto mb-1 text-amber-400" weight="fill" />
              <div className="text-xl font-bold text-amber-300" data-testid="result-extraction">{session.extractionPercent || 100}%</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Extraction</div>
            </div>
          </div>

          {lootEntries.length > 0 && (
            <div className="text-left space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-amber-400">
                <Package className="w-4 h-4" weight="fill" />
                Loot Earned
              </h4>
              <ScrollArea className="h-[160px]">
                <div className="space-y-1">
                  {lootEntries.map(([itemId, qty]) => {
                    const img = getItemImage(itemId);
                    const name = translateItemName(itemId, language);
                    const rarityColor = getItemRarityColor(itemId);
                    return (
                      <div
                        key={itemId}
                        className={cn("flex items-center gap-2 px-2 py-1.5 rounded border", getItemRarityBgColor(itemId))}
                        data-testid={`result-loot-${itemId}`}
                      >
                        {img ? (
                          <img src={img} alt={name} className="w-6 h-6 object-contain rounded" />
                        ) : (
                          <div className="w-6 h-6 bg-gray-700 rounded flex items-center justify-center">
                            <Package className="w-4 h-4 text-gray-500" />
                          </div>
                        )}
                        <span className={cn("text-xs flex-1 font-medium", rarityColor || "text-gray-300")}>{name}</span>
                        {PARTY_EXCLUSIVE_ITEMS.has(itemId) && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 border-emerald-700/30 text-emerald-400 bg-emerald-900/20 ml-1">
                            <Users className="w-2 h-2 mr-0.5" />{language === 'tr' ? 'Parti' : 'Party'}
                          </Badge>
                        )}
                        <span className="text-xs text-gray-400 font-mono">×{qty}</span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          <Button
            className={cn(
              "w-full h-14 text-lg font-bold rounded-xl transition-all",
              isSuccess
                ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500"
                : "bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500"
            )}
            onClick={onClaim}
            disabled={claiming}
            data-testid="claim-rewards-button"
          >
            {claiming ? (
              <span className="flex items-center gap-2">
                <ArrowsClockwise className="w-5 h-5 animate-spin" />
                Claiming...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle className="w-6 h-6" weight="fill" />
                Claim & Return
              </span>
            )}
          </Button>
        </CardContent>
      </Card>

      <style>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-30px); }
        }
        @keyframes ghostLeft {
          0% { opacity: 0.6; transform: translateX(-20px) scale(0.9); }
          60% { opacity: 0.3; transform: translateX(-5px) scale(0.95); }
          100% { opacity: 0; transform: translateX(0) scale(1); }
        }
        @keyframes ghostRight {
          0% { opacity: 0.6; transform: translateX(20px) scale(0.9); }
          60% { opacity: 0.3; transform: translateX(5px) scale(0.95); }
          100% { opacity: 0; transform: translateX(0) scale(1); }
        }
        @keyframes monsterShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          40% { transform: translateX(3px); }
          60% { transform: translateX(-2px); }
          80% { transform: translateX(2px); }
        }
        @keyframes bossHitFlash {
          0% { opacity: 0.5; }
          100% { opacity: 0; }
        }
        @keyframes bossSkillPop {
          0% { opacity: 0; transform: scale(0.8); }
          15% { opacity: 1; transform: scale(1.2); }
          30% { opacity: 1; transform: scale(1.0); }
          80% { opacity: 1; transform: scale(1.0); }
          100% { opacity: 0; transform: scale(1.1) translateY(-10px); }
        }
        @keyframes enrageAura {
          0%, 100% { box-shadow: 0 0 8px 2px rgba(239,68,68,0.3), inset 0 0 6px 1px rgba(239,68,68,0.1); }
          50% { box-shadow: 0 0 18px 6px rgba(239,68,68,0.6), inset 0 0 12px 3px rgba(239,68,68,0.2); }
        }
        @keyframes healParticleBurst {
          0% { opacity: 0; transform: translateY(0) scale(0.5); }
          30% { opacity: 1; transform: translateY(-8px) scale(1.2); }
          100% { opacity: 0; transform: translateY(-25px) scale(0.8) translateX(var(--scatter, 0px)); }
        }
        @keyframes healGlow {
          0% { background: rgba(34,197,94,0.3); }
          100% { background: rgba(34,197,94,0); }
        }
        @keyframes slashFade {
          0% { opacity: 0.9; transform: scale(0.8); }
          20% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.05); }
        }
        @keyframes skillNamePop {
          0% { opacity: 0; transform: translateX(-50%) scale(0.7) translateY(4px); }
          15% { opacity: 1; transform: translateX(-50%) scale(1.2) translateY(0); }
          35% { opacity: 1; transform: translateX(-50%) scale(1.0) translateY(0); }
          80% { opacity: 0.8; transform: translateX(-50%) scale(1.0) translateY(-6px); }
          100% { opacity: 0; transform: translateX(-50%) scale(1.0) translateY(-12px); }
        }
        @keyframes cardDamageFlash {
          0% { background: rgba(239,68,68,0.3); }
          100% { background: rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}
