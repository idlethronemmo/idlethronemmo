import { useState, useEffect, useCallback, useRef, ReactNode, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGame } from "@/context/GameContext";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  useDungeonSessionWs,
  DungeonSessionSnapshot,
  DungeonMemberSnapshot,
  CombatEvent,
} from "@/hooks/useDungeonSessionWs";
import { usePartyWebSocket } from "@/hooks/usePartyWebSocket";
import { useRaidLock } from "@/context/RaidLockContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getMonsterImage } from "@/lib/monsterImages";
import { formatNumber } from "@/lib/gameMath";
import { getTotalEquipmentBonus, formatItemIdAsName } from "@/lib/items";
import { EquipmentPanel } from "@/components/game/EquipmentPanel";
import { SkillDetailPopup } from "@/components/game/SkillDetailPopup";
import {
  Sword, Shield, Heart, Lightning, Skull, ArrowsOut,
  Eye, Timer, Trophy, Fire, Cookie, CaretLeft,
  Crown, SignOut, ChatCircle, PaperPlaneTilt,
  Warning, Stairs, Star, Target, UsersThree, Package,
} from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getSubClass } from "@shared/subClasses";
import { DungeonBackground } from "@/components/dungeon/DungeonBackground";
import { PartyDungeonArena } from "@/components/dungeon/PartyDungeonArena";
import { BossStage } from "@/components/dungeon/BossStage";
import { PartyShowcaseCard } from "@/components/dungeon/PartyShowcaseCard";
import { LootLane } from "@/components/dungeon/LootLane";
import { FloorTransition } from "@/components/dungeon/FloorTransition";
import { EscapeOverlay } from "@/components/dungeon/EscapeOverlay";

const ROLE_ICONS: Record<string, any> = {
  tank: Shield,
  dps: Sword,
  healer: Heart,
  hybrid: Lightning,
};

const ROLE_COLORS: Record<string, string> = {
  tank: "text-blue-400",
  dps: "text-red-400",
  healer: "text-green-400",
  hybrid: "text-yellow-400",
};

const ROLE_BG_COLORS: Record<string, string> = {
  tank: "border-blue-500/40",
  dps: "border-red-500/40",
  healer: "border-green-500/40",
  hybrid: "border-yellow-500/40",
};

interface FloatingNumber {
  id: number;
  x: number;
  y: number;
  value: number;
  type: "damage" | "heal" | "crit" | "monster_damage" | "skill" | "block";
  timestamp: number;
  skillName?: string;
}

interface ChatMessage {
  id: string;
  playerId: string;
  username: string;
  content: string;
  timestamp: number;
}

let floatingIdCounter = 0;
const MAX_FLOATING = 40;

function useInterpolatedAccumulators(
  snapshot: DungeonSessionSnapshot | null,
  phase: string | null
) {
  const [interpolated, setInterpolated] = useState<Record<string, number>>({});
  const lastSnapshotTimeRef = useRef(0);
  const baseValuesRef = useRef<Record<string, { acc: number; speedMs: number }>>({});
  const prevBaseValuesRef = useRef<Record<string, { acc: number }>>({});
  const rafRef = useRef(0);
  const lastValsRef = useRef<Record<string, number>>({});
  const resetUntilRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!snapshot) return;
    const now = performance.now();
    const prevBases = prevBaseValuesRef.current;
    const bases: Record<string, { acc: number; speedMs: number }> = {};
    for (const m of snapshot.members || []) {
      const newAcc = m.attackAccumulator || 0;
      const prevAcc = prevBases[m.playerId]?.acc ?? newAcc;
      if (newAcc < prevAcc) {
        resetUntilRef.current[m.playerId] = now + 100;
      }
      bases[m.playerId] = { acc: newAcc, speedMs: m.attackSpeedMs || 2000 };
    }
    if (snapshot.monster) {
      const newAcc = snapshot.monster.attackAccumulator || 0;
      const prevAcc = prevBases["monster"]?.acc ?? newAcc;
      if (newAcc < prevAcc) {
        resetUntilRef.current["monster"] = now + 100;
      }
      bases["monster"] = { acc: newAcc, speedMs: snapshot.monster.attackSpeedMs || 2000 };
    }
    prevBaseValuesRef.current = Object.fromEntries(
      Object.entries(bases).map(([k, v]) => [k, { acc: v.acc }])
    );
    baseValuesRef.current = bases;
    lastSnapshotTimeRef.current = now;
  }, [snapshot]);

  useEffect(() => {
    if (phase !== "active") {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setInterpolated({});
      lastValsRef.current = {};
      return;
    }

    let lastTickTime = 0;
    const tick = (time: number) => {
      if (time - lastTickTime < 50) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastTickTime = time;

      const now = performance.now();
      const elapsed = now - lastSnapshotTimeRef.current;
      const newVals: Record<string, number> = {};
      let changed = false;
      for (const [id, base] of Object.entries(baseValuesRef.current)) {
        const resetUntil = resetUntilRef.current[id] || 0;
        let pct: number;
        if (now < resetUntil) {
          pct = 0;
        } else {
          const projected = base.acc + elapsed;
          pct = Math.min(99, (projected / base.speedMs) * 100);
        }
        const rounded = Math.round(pct);
        newVals[id] = rounded;
        if (lastValsRef.current[id] !== rounded) changed = true;
      }
      if (changed) {
        lastValsRef.current = newVals;
        setInterpolated(newVals);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase]);

  return interpolated;
}

function getHpBarColor(percent: number): string {
  if (percent > 60) return "bg-gradient-to-r from-green-600 to-green-500";
  if (percent > 30) return "bg-gradient-to-r from-yellow-600 to-yellow-500";
  return "bg-gradient-to-r from-red-600 to-red-500";
}

export function PartyDungeonRunView() {
  const { player, equipment, inventory, equipItem, unequipItem, getSlotDurability, itemModifications, cursedItems } = useGame();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [floatingNumbers, setFloatingNumbers] = useState<FloatingNumber[]>([]);
  const [showCombatLog, setShowCombatLog] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [initStage, setInitStage] = useState(0);
  const [combatStartTime, setCombatStartTime] = useState(0);
  const [aggroTargetId, setAggroTargetId] = useState<string | null>(null);
  const [memberFlashes, setMemberFlashes] = useState<Record<string, { type: "damage" | "heal" | "attack"; value: number; ts: number; skillName?: string; isCrit?: boolean }>>({});
  const [summonAddsAnim, setSummonAddsAnim] = useState(false);
  const [monsterHitKey, setMonsterHitKey] = useState(0);
  const [bossSkillName, setBossSkillName] = useState<string | null>(null);
  const [bossSkillKey, setBossSkillKey] = useState(0);
  const [lootPool, setLootPool] = useState<Array<{ itemId: string; playerId: string; playerName: string; qty: number; floor: number }>>([]);
  const [showEscapeOverlay, setShowEscapeOverlay] = useState(false);
  const combatLogRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const lastProcessedEventRef = useRef(0);
  const { setDungeonLocked } = useRaidLock();

  const { data: activeSession, isLoading: isLoadingSession } = useQuery({
    queryKey: ["/api/v2/dungeon-party/session/active"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/v2/dungeon-party/session/active");
        return res.json();
      } catch {
        return { active: false };
      }
    },
    enabled: !!player,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.active) return false;
      return 3000;
    },
  });

  const sessionSnap = activeSession?.snapshot;
  const partyId = sessionSnap?.partyId || null;
  const sessionId = sessionSnap?.sessionId || null;

  const {
    snapshot,
    combatEvents,
    phase,
    ended,
    connected,
    syncing,
    applyFullSnapshot,
    nextMonsters,
    sendMessage,
    voteInfo,
    playerVotes,
    voteResult,
    bossPreview,
  } = useDungeonSessionWs({
    partyId,
    sessionId,
    enabled: !!partyId,
  });

  const accPcts = useInterpolatedAccumulators(snapshot, phase);
  const now = Date.now();
  const isCombatPaused = phase === "active" && combatStartTime > now;

  useEffect(() => {
    if (sessionSnap && !snapshot) {
      applyFullSnapshot(sessionSnap);
    }
  }, [sessionSnap, snapshot, applyFullSnapshot]);

  const handleChatWsEvent = useCallback((event: any) => {
    if (event.type === 'lobby_chat_message') {
      const p = event.payload;
      if (p) {
        const msg: ChatMessage = {
          id: p.id || `ws-${Date.now()}`,
          playerId: p.playerId,
          username: p.username,
          content: p.content,
          timestamp: p.timestamp || Date.now(),
        };
        setChatMessages(prev => [...prev.slice(-49), msg]);
        if (!showChat) {
          setUnreadCount(prev => prev + 1);
        }
      }
    }
  }, [showChat]);

  usePartyWebSocket({
    playerId: player?.id || null,
    partyId,
    enabled: !!partyId && !!player,
    onEvent: handleChatWsEvent,
  });

  useEffect(() => {
    if (!partyId) return;
    apiRequest("GET", `/api/v2/dungeon-party/lobby-chat/${partyId}`)
      .then(r => r.json())
      .then(data => {
        if (data.messages) setChatMessages(data.messages.slice(-50));
      })
      .catch(() => {});
  }, [partyId]);

  const extractMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v2/dungeon-party/session/extract");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Extracted!", description: `Got ${data.loot?.gold || 0} gold (${data.loot?.extractionPercent || 0}%)` });
      } else {
        toast({ title: "Failed", description: data.error, variant: "destructive" });
      }
    },
  });

  useEffect(() => {
    const currentLen = combatEvents.length;
    if (currentLen <= lastProcessedEventRef.current) return;
    const newEvents = combatEvents.slice(lastProcessedEventRef.current);
    lastProcessedEventRef.current = currentLen;

    const newFloats: FloatingNumber[] = [];
    const flashes: Record<string, { type: "damage" | "heal" | "attack"; value: number; ts: number; skillName?: string; isCrit?: boolean }> = {};
    const now = Date.now();

    for (const event of newEvents.slice(-15)) {
      if (event.type === "phase_change") {
        if (event.data.phase === "active") {
          setCombatStartTime(Date.now() + (event.data.combatDelayMs || 0));
        }
      }
      if (event.type === "player_attack") {
        const hasSkill = !!event.data.skillName;
        newFloats.push({
          id: floatingIdCounter++,
          x: 30 + Math.random() * 40,
          y: 10 + Math.random() * 30,
          value: event.data.damage,
          type: hasSkill ? "skill" : event.data.isCrit ? "crit" : "damage",
          timestamp: now,
          skillName: event.data.skillName,
        });
        if (event.data.playerId) {
          flashes[event.data.playerId] = { type: "attack", value: event.data.damage, ts: now, skillName: event.data.skillName, isCrit: event.data.isCrit };
        }
        setMonsterHitKey(prev => prev + 1);
      }
      if (event.type === "monster_attack" || event.type === "monster_multi_attack") {
        if (event.data.targetId) {
          setAggroTargetId(event.data.targetId);
          flashes[event.data.targetId] = { type: "damage", value: event.data.damage, ts: now };
        }
        if (event.data.tankBlock && event.data.blocked > 0) {
          newFloats.push({
            id: floatingIdCounter++,
            x: 50 + Math.random() * 20,
            y: 60 + Math.random() * 15,
            value: event.data.blocked,
            type: "block",
            timestamp: now,
          });
        }
      }
      if (event.type === "heal") {
        if (event.data.targetId) {
          flashes[event.data.targetId] = { type: "heal", value: event.data.amount, ts: now, skillName: event.data.skillName };
        }
        if (event.data.sourceId) {
          flashes[event.data.sourceId] = { type: "heal", value: event.data.amount, ts: now, skillName: event.data.skillName };
        }
      }
      if (event.type === "monster_skill") {
        const skillLabel = (event.data.skill || event.data.type || "").replace(/_/g, " ");
        if (skillLabel) {
          setBossSkillName(skillLabel);
          setBossSkillKey(prev => prev + 1);
        }
      }
      if (event.type === "monster_skill" && event.data.skill === "summon_adds") {
        newFloats.push({
          id: floatingIdCounter++,
          x: 35 + Math.random() * 30,
          y: 20 + Math.random() * 20,
          value: event.data.addedHp || 0,
          type: "heal",
          timestamp: now,
        });
        setSummonAddsAnim(true);
        setTimeout(() => setSummonAddsAnim(false), 1200);
      }
      if (event.type === "monster_defeated" && event.data.items) {
        const items = event.data.items as Array<{ itemId: string; playerId: string; playerName: string; qty: number }>;
        if (items.length > 0) {
          setLootPool(prev => [...prev, ...items.map(it => ({ ...it, floor: event.data.floor || 0 }))]);
        }
      }
    }
    if (newFloats.length > 0) {
      setFloatingNumbers(prev => [...prev.slice(-(MAX_FLOATING - newFloats.length)), ...newFloats]);
    }
    if (Object.keys(flashes).length > 0) {
      setMemberFlashes(prev => ({ ...prev, ...flashes }));
    }
  }, [combatEvents.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - 2000;
      setFloatingNumbers(prev => {
        const filtered = prev.filter(f => f.timestamp > cutoff);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (combatLogRef.current) {
      combatLogRef.current.scrollTop = combatLogRef.current.scrollHeight;
    }
  }, [combatEvents.length, showCombatLog]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages.length, showChat]);

  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || !partyId) return;
    const msg = chatInput.trim();
    setChatInput("");
    try {
      await apiRequest("POST", "/api/v2/dungeon-party/lobby-chat", { partyId, content: msg });
    } catch {}
  }, [chatInput, partyId]);

  const currentMember = snapshot?.members?.find(m => m.playerId === player?.id);
  const isAlive = currentMember?.isAlive ?? false;
  const isExtracted = currentMember?.isExtracted ?? false;
  const displayPhase = phase || snapshot?.phase || "initializing";
  const monster = snapshot?.monster;

  useEffect(() => {
    const active = !!snapshot && displayPhase !== "ended" && !ended;
    setDungeonLocked(active);
    return () => setDungeonLocked(false);
  }, [!!snapshot, displayPhase, ended, setDungeonLocked]);

  useEffect(() => {
    if (displayPhase !== "active") {
      setAggroTargetId(null);
      setMemberFlashes({});
    }
  }, [displayPhase]);

  const snapshotPhase = snapshot?.phase;
  const entryAlreadyPlayed = useRef(
    typeof sessionStorage !== "undefined" && sessionStorage.getItem("dungeonEntryPlayed") === "true"
  );
  useEffect(() => {
    if (entryAlreadyPlayed.current) {
      sessionStorage.removeItem("dungeonEntryPlayed");
      setInitStage(0);
      return;
    }
    if (snapshotPhase !== "initializing") {
      setInitStage(0);
      return;
    }
    setInitStage(1);
    const t2 = setTimeout(() => setInitStage(2), 1000);
    const t3 = setTimeout(() => setInitStage(3), 1500);
    const t4 = setTimeout(() => setInitStage(4), 3000);
    const t5 = setTimeout(() => setInitStage(5), 4500);
    return () => { clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, [snapshotPhase]);

  const monsterNameLower = (monster?.id || monster?.name || "").toLowerCase().replace(/\s+/g, "_");
  const monsterImg = getMonsterImage(monsterNameLower) || getMonsterImage((monster?.name || "").toLowerCase().replace(/\s+/g, "_"));

  const aggroTargetName = useMemo(() => {
    if (!aggroTargetId) return undefined;
    const t = (snapshot?.members ?? []).find(m => m.playerId === aggroTargetId);
    return t?.username || "Player";
  }, [aggroTargetId, snapshot?.members]);

  const members = snapshot?.members ?? [];

  if (!snapshot && !activeSession?.active) {
    if (isLoadingSession) {
      return (
        <div className="flex-1 flex items-center justify-center min-h-[60vh]" data-testid="party-run-loading">
          <div className="text-center space-y-2">
            <Timer className="w-12 h-12 text-purple-400 animate-pulse mx-auto" />
            <p className="text-lg font-bold">Loading session...</p>
            <p className="text-sm text-muted-foreground">Connecting to dungeon</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px]" data-testid="party-run-no-session">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">No active dungeon session</p>
          <Button onClick={() => navigate("/dungeons")} data-testid="btn-back-to-dungeons">
            <CaretLeft className="w-4 h-4 mr-1" /> Back to Dungeons
          </Button>
        </div>
      </div>
    );
  }

  if (ended) {
    const endMembers = ended.members ?? [];
    const totalDamage = endMembers.reduce((s: number, m: any) => s + (m.totalDamageDealt || 0), 0);
    const totalHealing = endMembers.reduce((s: number, m: any) => s + (m.totalHealingDone || 0), 0);
    const monstersKilled = combatEvents.filter(e => e.type === "monster_defeated").length;
    const bossKills = combatEvents.filter(e => e.type === "monster_defeated" && e.data?.isBoss).length;
    const statusIcon = (s: string) => {
      if (s === 'dead') return <Skull className="w-4 h-4 text-red-400" weight="fill" />;
      if (s === 'extracted') return <ArrowsOut className="w-4 h-4 text-green-400" />;
      if (s === 'left') return <SignOut className="w-4 h-4 text-gray-400" />;
      if (s === 'disconnected') return <Warning className="w-4 h-4 text-yellow-400" />;
      return <Heart className="w-4 h-4 text-green-400" weight="fill" />;
    };
    const statusColor = (s: string) => {
      if (s === 'dead') return "text-red-400";
      if (s === 'extracted') return "text-green-400";
      if (s === 'left') return "text-gray-400";
      if (s === 'disconnected') return "text-yellow-400";
      return "text-green-300";
    };
    const isWipe = ended.reason === "all_dead";

    return (
      <div className="space-y-3 p-2 md:p-4 max-w-2xl mx-auto overflow-y-auto max-h-[90vh]" data-testid="party-run-ended">
        <Card className={cn(
          "border-amber-700/30 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]",
          isWipe && "border-red-700/30"
        )}>
          <div className={cn("h-1 w-full", isWipe ? "bg-gradient-to-r from-red-700 via-red-500 to-red-700" : "bg-gradient-to-r from-amber-700 via-yellow-500 to-amber-700")} />
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-2">
              {isWipe ? <Skull className="w-6 h-6 text-red-400" weight="fill" /> : <Trophy className="w-6 h-6 text-yellow-400" weight="fill" />}
              <span className="text-lg font-bold text-gray-100">{isWipe ? "Party Wiped" : "Dungeon Complete"}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {ended.reason === "completed" ? "All floors cleared!" : isWipe ? "Your party has fallen..." : ended.reason === "all_extracted" ? "Everyone extracted safely." : ended.reason?.replace(/_/g, " ")}
            </p>
          </CardContent>
        </Card>

        <Card className="border-gray-700/30 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Stairs className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-bold text-gray-200">Run Overview</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="text-center p-2 rounded bg-black/30 border border-gray-700/30">
                <div className="text-sm font-bold text-blue-300" data-testid="end-stat-floors">{snapshot?.floorsCleared || 0}</div>
                <div className="text-[9px] text-gray-500 uppercase">Floors Cleared</div>
              </div>
              <div className="text-center p-2 rounded bg-black/30 border border-gray-700/30">
                <div className="text-sm font-bold text-purple-300" data-testid="end-stat-segment">{snapshot?.currentSegment || 1}</div>
                <div className="text-[9px] text-gray-500 uppercase">Segment</div>
              </div>
              <div className="text-center p-2 rounded bg-black/30 border border-gray-700/30">
                <div className="text-sm font-bold text-orange-300" data-testid="end-stat-monsters">{monstersKilled}</div>
                <div className="text-[9px] text-gray-500 uppercase">Monsters</div>
              </div>
              <div className="text-center p-2 rounded bg-black/30 border border-gray-700/30">
                <div className="text-sm font-bold text-red-300" data-testid="end-stat-bosses">{bossKills}</div>
                <div className="text-[9px] text-gray-500 uppercase">Bosses</div>
              </div>
            </div>
            {(snapshot?.difficultyMultiplier ?? 1) > 1 && (
              <div className="mt-2 text-center text-xs text-amber-400">Difficulty: {snapshot?.difficultyMultiplier}x</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-700/30 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <UsersThree className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-bold text-gray-200">Party Performance</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-400 mb-2">
              <div className="flex items-center gap-1"><Sword className="w-3 h-3 text-red-400" weight="fill" /> Total DMG: {formatNumber(totalDamage)}</div>
              <div className="flex items-center gap-1"><Heart className="w-3 h-3 text-green-400" weight="fill" /> Total Healing: {formatNumber(totalHealing)}</div>
            </div>
            {endMembers.map((m: any) => {
              const status = m.status || (m.isAlive ? 'alive' : 'dead');
              const dmgPct = totalDamage > 0 ? Math.round((m.totalDamageDealt || 0) / totalDamage * 100) : 0;
              return (
                <div key={m.playerId} className="p-2.5 rounded-lg bg-black/30 border border-gray-700/30" data-testid={`result-member-${m.playerId}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {statusIcon(status)}
                      <span className={cn("font-medium text-sm", statusColor(status))}>
                        {m.username}
                      </span>
                      <span className={cn("text-[9px] uppercase px-1.5 py-0.5 rounded-full border",
                        status === 'dead' ? "border-red-700/50 text-red-400 bg-red-950/30" :
                        status === 'extracted' ? "border-green-700/50 text-green-400 bg-green-950/30" :
                        status === 'left' ? "border-gray-600/50 text-gray-400 bg-gray-900/30" :
                        status === 'disconnected' ? "border-yellow-700/50 text-yellow-400 bg-yellow-950/30" :
                        "border-green-700/50 text-green-400 bg-green-950/30"
                      )}>
                        {status}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 capitalize">{m.role || "DPS"}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
                    <div className="flex items-center gap-1 text-red-300">
                      <Sword className="w-3 h-3" weight="fill" />
                      {formatNumber(m.totalDamageDealt || 0)}
                      {dmgPct > 0 && <span className="text-gray-500">({dmgPct}%)</span>}
                    </div>
                    <div className="flex items-center gap-1 text-green-300">
                      <Heart className="w-3 h-3" weight="fill" />
                      {formatNumber(m.totalHealingDone || 0)}
                    </div>
                    <div className="flex items-center gap-1 text-yellow-300">
                      <Star className="w-3 h-3" weight="fill" />
                      {formatNumber(m.personalGold || 0)} gold
                    </div>
                    <div className="flex items-center gap-1 text-purple-300">
                      <Lightning className="w-3 h-3" weight="fill" />
                      {formatNumber(m.personalXp || 0)} XP
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {lootPool.length > 0 && (
          <Card className="border-gray-700/30 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-green-400" weight="fill" />
                <span className="text-sm font-bold text-gray-200">Loot Collected ({lootPool.length})</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {lootPool.map((item: any, i: number) => (
                  <div key={`${item.itemId}-${i}`} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-black/20 border border-gray-800/30">
                    <span className="text-green-400 font-medium">{item.qty}x</span>
                    <span className="text-gray-200 truncate flex-1">{formatItemIdAsName(item.itemId)}</span>
                    <span className="text-gray-500 text-[10px] shrink-0">{item.playerName}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Button
          onClick={() => navigate("/dungeons")}
          className="w-full bg-gradient-to-r from-purple-700 to-indigo-600 hover:from-purple-600 hover:to-indigo-500 font-bold"
          data-testid="btn-back-to-dungeons-end"
        >
          <CaretLeft className="w-4 h-4 mr-1" /> Back to Dungeons
        </Button>
      </div>
    );
  }

  if (displayPhase === "initializing") {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh] relative overflow-hidden" data-testid="party-run-init">
        <style>{`
          @keyframes portalExpand {
            0% { transform: scale(0.3); opacity: 0; }
            60% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes portalGlow {
            0%, 100% { box-shadow: 0 0 40px 10px rgba(139,92,246,0.3), inset 0 0 60px 15px rgba(139,92,246,0.15); }
            50% { box-shadow: 0 0 80px 25px rgba(139,92,246,0.5), inset 0 0 80px 20px rgba(139,92,246,0.25); }
          }
          @keyframes portalRing {
            0% { transform: scale(0.8); opacity: 0.6; }
            50% { transform: scale(1.15); opacity: 0.2; }
            100% { transform: scale(0.8); opacity: 0.6; }
          }
          @keyframes fadeSlideUp {
            0% { opacity: 0; transform: translateY(16px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes memberSlideLeft {
            0% { opacity: 0; transform: translateX(-30px); }
            100% { opacity: 1; transform: translateX(0); }
          }
          @keyframes memberSlideRight {
            0% { opacity: 0; transform: translateX(30px); }
            100% { opacity: 1; transform: translateX(0); }
          }
          @keyframes flashBurst {
            0% { opacity: 0; transform: scale(0.5); }
            30% { opacity: 1; transform: scale(1.2); }
            100% { opacity: 0; transform: scale(2); }
          }
          @keyframes textGlow {
            0% { opacity: 0; text-shadow: 0 0 10px rgba(139,92,246,0); }
            50% { opacity: 1; text-shadow: 0 0 30px rgba(139,92,246,0.8), 0 0 60px rgba(139,92,246,0.4); }
            100% { opacity: 1; text-shadow: 0 0 15px rgba(139,92,246,0.5); }
          }
          @keyframes shimmer {
            0% { background-position: -200% center; }
            100% { background-position: 200% center; }
          }
          @keyframes monsterFadeIn {
            0% { opacity: 0; transform: scale(0.8) translateY(20px); filter: blur(10px); }
            100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
          }
          @keyframes dungeonStartedBurst {
            0% { opacity: 0; transform: scale(0.4); }
            40% { opacity: 1; transform: scale(1.15); }
            60% { opacity: 1; transform: scale(1.0); }
            80% { opacity: 0.9; transform: scale(1.0); text-shadow: 0 0 40px rgba(255,215,0,0.9), 0 0 80px rgba(255,165,0,0.5); }
            100% { opacity: 0; transform: scale(1.1); }
          }
          @keyframes dungeonStartedGlow {
            0% { box-shadow: 0 0 0 0 rgba(255,215,0,0); }
            40% { box-shadow: 0 0 80px 40px rgba(255,215,0,0.3); }
            100% { box-shadow: 0 0 0 0 rgba(255,215,0,0); }
          }
        `}</style>

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1a0a2e_0%,_#0d0d1a_50%,_#000000_100%)]" />

        {initStage >= 1 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="w-[50vw] h-[50vw] max-w-[280px] max-h-[280px] md:max-w-[350px] md:max-h-[350px] rounded-full border-2 border-purple-500/40"
              style={{
                animation: 'portalExpand 1s cubic-bezier(0.16, 1, 0.3, 1) forwards, portalGlow 2s ease-in-out infinite 0.8s',
                background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(88,28,135,0.08) 40%, transparent 70%)',
              }}
            />
            <div
              className="absolute w-[60vw] h-[60vw] max-w-[330px] max-h-[330px] md:max-w-[420px] md:max-h-[420px] rounded-full border border-purple-400/20"
              style={{ animation: 'portalRing 2s ease-in-out infinite' }}
            />
            <div
              className="absolute w-[70vw] h-[70vw] max-w-[380px] max-h-[380px] md:max-w-[490px] md:max-h-[490px] rounded-full border border-purple-300/10"
              style={{ animation: 'portalRing 2.5s ease-in-out infinite 0.5s' }}
            />
          </div>
        )}

        <div className="relative z-10 flex flex-col items-center gap-4 md:gap-6 px-4 w-full max-w-md">
          {initStage >= 1 && initStage < 4 && (
            <div className="flex flex-col items-center gap-3" style={{ animation: 'monsterFadeIn 0.8s ease-out forwards' }}>
              {monsterImg ? (
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-2xl" />
                  <img
                    src={monsterImg}
                    alt={monster?.name || 'Monster'}
                    className="w-28 h-28 md:w-40 md:h-40 object-contain relative z-10 drop-shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                    data-testid="init-monster-image"
                  />
                </div>
              ) : (
                <div className="w-28 h-28 md:w-40 md:h-40 rounded-full bg-purple-900/30 border-2 border-purple-500/40 flex items-center justify-center" style={{ animation: 'portalGlow 2s ease-in-out infinite' }}>
                  <Skull className="w-12 h-12 md:w-16 md:h-16 text-purple-400" weight="bold" />
                </div>
              )}
              {monster?.name && (
                <p className="text-base md:text-xl font-bold text-purple-100 tracking-wide text-center" data-testid="init-monster-name">
                  {monster.name}
                </p>
              )}
              <p className="text-xs md:text-sm text-purple-400/70 tracking-wider uppercase">Floor 1</p>
            </div>
          )}

          {initStage >= 2 && initStage < 4 && members.length > 0 && (
            <div className="w-full space-y-1.5 md:space-y-2 mt-1">
              {members.map((m, i) => {
                const RoleIcon = ROLE_ICONS[m.role || 'dps'] || Sword;
                const roleColor = ROLE_COLORS[m.role || 'dps'] || 'text-red-400';
                const isLeft = i % 2 === 0;
                return (
                  <div
                    key={m.playerId}
                    className="flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-lg bg-black/40 border border-purple-900/30 backdrop-blur-sm"
                    style={{
                      animation: `${isLeft ? 'memberSlideLeft' : 'memberSlideRight'} 0.5s ease-out ${i * 0.15}s both`,
                    }}
                  >
                    <div className={cn("w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full bg-black/50", roleColor)}>
                      <RoleIcon className="w-3 h-3 md:w-3.5 md:h-3.5" weight="fill" />
                    </div>
                    <span className="text-xs md:text-sm font-medium text-gray-200 truncate flex-1">
                      {m.username || 'Adventurer'}
                    </span>
                    <span className={cn("text-[10px] md:text-xs uppercase tracking-wider font-semibold", roleColor)}>
                      {m.role || 'dps'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {initStage === 3 && (
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div
                className="rounded-full"
                style={{ animation: 'dungeonStartedGlow 1.5s ease-out forwards' }}
              />
              <p
                className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-500 tracking-wider uppercase"
                style={{
                  animation: 'dungeonStartedBurst 1.5s ease-out forwards',
                  textShadow: '0 0 30px rgba(255,215,0,0.8), 0 0 60px rgba(255,165,0,0.4)',
                  WebkitTextStroke: '1px rgba(255,215,0,0.3)',
                }}
                data-testid="init-dungeon-started-text"
              >
                Dungeon Started!
              </p>
            </div>
          )}

          {/* Init Stage 4: Loading Dungeon */}
          {initStage === 4 && (
            <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
              <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              <span className="text-xl font-bold text-purple-200 tracking-widest uppercase">
                Loading Dungeon...
              </span>
            </div>
          )}

          {/* Init Stage 5: Monster Reveal */}
          {initStage === 5 && (
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <div className="absolute inset-0 bg-purple-500/20 blur-3xl rounded-full animate-pulse" />
                <img
                  src={monsterImg}
                  alt={monster?.name}
                  className="w-48 h-48 object-contain relative z-10"
                  style={{ animation: "monsterFadeIn 0.8s ease-out forwards" }}
                />
              </div>
              <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300 fill-mode-both">
                <span className="text-sm text-purple-400 font-medium uppercase tracking-[0.2em] mb-1 block">
                  First Guardian
                </span>
                <h2 className="text-4xl font-black text-white tracking-tight drop-shadow-2xl">
                  {monster?.name || "The Unknown"}
                </h2>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (displayPhase === "voting") {
    const timeLeft = voteInfo ? Math.max(0, Math.floor((voteInfo.deadline - Date.now()) / 1000)) : 0;
    const myVote = player?.id ? playerVotes[player.id] : undefined;
    const aliveMembers = members.filter(m => m.isAlive && !m.isExtracted);

    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh] relative overflow-hidden" data-testid="party-run-voting">
        <style>{`
          @keyframes voteSlideIn {
            0% { opacity: 0; transform: translateY(20px) scale(0.95); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes votePulse {
            0%, 100% { box-shadow: 0 0 20px 5px rgba(168,85,247,0.2); }
            50% { box-shadow: 0 0 40px 15px rgba(168,85,247,0.4); }
          }
        `}</style>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1a0a2e_0%,_#0d0d1a_50%,_#000000_100%)]" />
        <div className="relative z-10 flex flex-col items-center gap-4 px-4 w-full max-w-md" style={{ animation: 'voteSlideIn 0.5s ease-out forwards' }}>
          {voteResult ? (
            <div className="text-center space-y-4">
              {voteResult.continued ? (
                <>
                  <div className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-green-300 to-emerald-500">
                    Continuing!
                  </div>
                  <p className="text-lg text-green-400 font-bold">{voteResult.nextMultiplier}x Difficulty</p>
                  <p className="text-sm text-gray-400">Next segment starting...</p>
                </>
              ) : (
                <>
                  <Trophy className="w-12 h-12 text-yellow-400 mx-auto" weight="fill" />
                  <div className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-amber-500">
                    Dungeon Complete!
                  </div>
                  <p className="text-sm text-gray-400">Collecting rewards...</p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="text-center space-y-2">
                <Star className="w-10 h-10 text-amber-400 mx-auto" weight="fill" />
                <h2 className="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-b from-purple-300 to-purple-500">
                  Segment Complete!
                </h2>
                <p className="text-sm text-gray-400">
                  Continue at <span className="text-amber-400 font-bold">{voteInfo?.nextMultiplier || 2}x</span> difficulty?
                </p>
              </div>

              <div className="w-full space-y-2">
                {aliveMembers.map(m => {
                  const vote = playerVotes[m.playerId];
                  return (
                    <div key={m.playerId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border border-gray-700/40" data-testid={`vote-member-${m.playerId}`}>
                      <span className="text-sm text-gray-200 flex-1 truncate">{m.username || 'Player'}</span>
                      {vote === true && (
                        <Badge className="bg-green-900/50 text-green-300 text-xs">Yes</Badge>
                      )}
                      {vote === false && (
                        <Badge className="bg-red-900/50 text-red-300 text-xs">No</Badge>
                      )}
                      {vote === undefined && (
                        <Badge className="bg-gray-800 text-gray-400 text-xs animate-pulse">Voting...</Badge>
                      )}
                    </div>
                  );
                })}
              </div>

              {myVote === undefined && (
                <div className="flex gap-3 w-full">
                  <Button
                    onClick={() => sendMessage({ type: 'dungeon_party:cast_vote', vote: true })}
                    className="flex-1 bg-green-700 hover:bg-green-600 text-white font-bold py-3"
                    data-testid="btn-vote-yes"
                  >
                    Continue
                  </Button>
                  <Button
                    onClick={() => sendMessage({ type: 'dungeon_party:cast_vote', vote: false })}
                    className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold py-3"
                    data-testid="btn-vote-no"
                  >
                    End Run
                  </Button>
                </div>
              )}

              {myVote !== undefined && (
                <p className="text-sm text-gray-400">
                  You voted <span className={myVote ? "text-green-400 font-bold" : "text-red-400 font-bold"}>{myVote ? "Yes" : "No"}</span>. Waiting for others...
                </p>
              )}

              <div className="w-full">
                <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden border border-gray-700/30">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-1000"
                    style={{ width: `${Math.min(100, (timeLeft / 60) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-500 text-center mt-1">{timeLeft}s remaining</p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (displayPhase === "boss_preview" && bossPreview) {
    const bossMonster = bossPreview.monster;
    const bossImgKey = (bossMonster?.id || bossMonster?.name || "").toLowerCase().replace(/\s+/g, "_");
    const bossImg = getMonsterImage(bossImgKey) || getMonsterImage((bossMonster?.name || "").toLowerCase().replace(/\s+/g, "_"));
    const aliveMembers = members.filter(m => m.isAlive && !m.isExtracted);
    const allReady = aliveMembers.length > 0 && aliveMembers.every(m => bossPreview.readyPlayers.includes(m.playerId));
    const iAmReady = player?.id ? bossPreview.readyPlayers.includes(player.id) : false;
    const autoStartRemaining = Math.max(0, Math.floor((bossPreview.autoStartAt - Date.now()) / 1000));

    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh] relative overflow-hidden" data-testid="party-run-boss-preview">
        <style>{`
          @keyframes bossReveal {
            0% { opacity: 0; transform: scale(0.7); }
            60% { opacity: 1; transform: scale(1.05); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes bossAura {
            0%, 100% { box-shadow: 0 0 30px 10px rgba(234,179,8,0.2), 0 0 60px 20px rgba(234,179,8,0.1); }
            50% { box-shadow: 0 0 50px 20px rgba(234,179,8,0.4), 0 0 80px 30px rgba(234,179,8,0.2); }
          }
          @keyframes statSlide {
            0% { opacity: 0; transform: translateX(-10px); }
            100% { opacity: 1; transform: translateX(0); }
          }
        `}</style>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1a0a0a_0%,_#0d0d1a_50%,_#000000_100%)]" />
        <div className="relative z-10 flex flex-col items-center gap-4 px-4 w-full max-w-md">
          <div className="text-center">
            <Crown className="w-8 h-8 text-yellow-400 mx-auto mb-1" weight="fill" />
            <h2 className="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-400 to-orange-500 tracking-wider uppercase">
              Boss Approaching
            </h2>
            <p className="text-xs text-gray-500 mt-1">Floor {bossPreview.floor}</p>
          </div>

          <div
            className="relative rounded-xl border-2 border-yellow-500/60 overflow-hidden bg-black/60 flex items-center justify-center w-[140px] h-[140px] md:w-[180px] md:h-[180px]"
            style={{ animation: 'bossReveal 0.8s ease-out forwards, bossAura 2s ease-in-out infinite 0.8s' }}
            data-testid="boss-preview-portrait"
          >
            {bossImg ? (
              <img src={bossImg} alt={bossMonster.name} className="w-full h-full object-cover" />
            ) : (
              <Skull className="w-16 h-16 text-red-400" weight="fill" />
            )}
          </div>

          <h3 className="text-lg font-bold text-yellow-200" data-testid="boss-preview-name">{bossMonster.name}</h3>

          <div className="grid grid-cols-2 gap-2 w-full max-w-xs" data-testid="boss-preview-stats">
            {[
              { icon: Heart, color: "text-red-400", label: "HP", value: formatNumber(bossMonster.maxHp) },
              { icon: Sword, color: "text-orange-400", label: "ATK", value: formatNumber(bossMonster.attack) },
              { icon: Shield, color: "text-blue-400", label: "DEF", value: formatNumber(bossMonster.defense || 0) },
              { icon: Timer, color: "text-purple-400", label: "SPD", value: `${((bossMonster.attackSpeedMs || 2000) / 1000).toFixed(1)}s` },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-gray-700/40"
                style={{ animation: `statSlide 0.4s ease-out ${i * 0.1}s both` }}
              >
                <stat.icon className={cn("w-4 h-4", stat.color)} weight="fill" />
                <span className="text-xs text-gray-400">{stat.label}</span>
                <span className="text-sm font-bold text-gray-200 ml-auto">{stat.value}</span>
              </div>
            ))}
          </div>

          {(bossMonster.skills ?? []).length > 0 && (
            <div className="w-full max-w-xs" data-testid="boss-preview-skills">
              <p className="text-xs font-semibold text-amber-400 mb-1.5">Boss Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {(bossMonster.skills ?? []).map((s: any, i: number) => (
                  <SkillDetailPopup key={i} skill={s} variant="badge" isMonsterSkill />
                ))}
              </div>
            </div>
          )}

          <div className="w-full space-y-2 mt-2">
            <div className="flex flex-wrap gap-1.5 justify-center">
              {aliveMembers.map(m => (
                <div key={m.playerId} className="flex items-center gap-1 px-2 py-1 rounded bg-black/40 border border-gray-700/30 text-xs">
                  <span className="text-gray-300">{m.username}</span>
                  {bossPreview.readyPlayers.includes(m.playerId) ? (
                    <span className="text-green-400">✓</span>
                  ) : (
                    <span className="text-gray-500 animate-pulse">...</span>
                  )}
                </div>
              ))}
            </div>

            {!iAmReady ? (
              <Button
                onClick={() => sendMessage({ type: 'dungeon_party:boss_ready' })}
                className="w-full bg-gradient-to-r from-red-700 to-orange-600 hover:from-red-600 hover:to-orange-500 font-bold"
                data-testid="btn-boss-ready"
              >
                <Sword className="w-4 h-4 mr-2" weight="bold" />
                Ready to Fight!
              </Button>
            ) : (
              <p className="text-sm text-center text-gray-400">
                Waiting for party... ({autoStartRemaining}s)
              </p>
            )}

            <div className="h-1 w-full bg-black/40 rounded-full overflow-hidden border border-gray-700/30">
              <div
                className="h-full rounded-full bg-gradient-to-r from-yellow-600 to-orange-500 transition-all duration-1000"
                style={{ width: `${Math.max(0, (autoStartRemaining / 10) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const headerNode = (
    <div className="flex items-center justify-between" data-testid="party-run-header">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dungeons")} className="h-7 px-2 text-gray-400 hover:text-gray-200" data-testid="btn-back">
          <CaretLeft className="w-4 h-4" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <Sword className="w-4 h-4 text-purple-400" weight="bold" />
            <span className="text-sm font-bold text-gray-100">Party Dungeon</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Floor {snapshot?.currentFloor || 1} / {snapshot?.maxFloors || 15}</span>
            <span>·</span>
            <span>Seg {snapshot?.currentSegment || 1}</span>
            {(snapshot?.difficultyMultiplier ?? 1) > 1 && (
              <>
                <span>·</span>
                <span className="text-amber-400 font-semibold">{snapshot?.difficultyMultiplier}x</span>
              </>
            )}
            <span>·</span>
            <span>Party ({members.filter(m => m.isAlive && !m.isExtracted).length}/{members.length})</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!connected && (
          <Badge variant="outline" className="text-xs border-yellow-600 text-yellow-400 animate-pulse" data-testid="ws-status">
            <Warning className="w-3 h-3 mr-1" /> Polling
          </Badge>
        )}
        {(() => {
          const me = members.find(m => m.playerId === player?.id);
          if (!me) return null;
          return (
            <div className="text-right text-xs space-y-0.5" data-testid="running-rewards">
              <div className="text-yellow-400 font-medium">{formatNumber(me.personalGold || 0)} gold</div>
              <div className="text-cyan-400 font-medium">{formatNumber(me.personalXp || 0)} XP</div>
            </div>
          );
        })()}
        <div className="text-right text-xs text-muted-foreground">
          <div>Risk: {snapshot?.riskLevel || 0}</div>
          <div>{snapshot?.multiplier || 100}% mult</div>
        </div>
      </div>
    </div>
  );

  const bossStageNode = monster && (displayPhase === "active" || displayPhase === "advancing") ? (
    <BossStage
      monster={monster}
      monsterImg={monsterImg || null}
      currentFloor={snapshot?.currentFloor || 1}
      floatingNumbers={floatingNumbers}
      accPct={accPcts["monster"]}
      aggroTargetId={aggroTargetId}
      aggroTargetName={aggroTargetName}
      summonAddsAnim={summonAddsAnim}
      monsterHitKey={monsterHitKey}
      bossSkillName={bossSkillName}
      bossSkillKey={bossSkillKey}
    />
  ) : displayPhase === "advancing" && !monster ? (
    <Card className="border-purple-700/30 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]">
      <CardContent className="p-4 text-center">
        <Sword className="w-8 h-8 text-purple-400 animate-pulse mx-auto mb-2" weight="bold" />
        <p className="text-sm font-bold">Advancing to Floor {snapshot?.currentFloor || "?"}...</p>
        <p className="text-xs text-muted-foreground">Preparing next encounter</p>
      </CardContent>
    </Card>
  ) : null;

  const vsDividerNode = monster && displayPhase === "active" ? (
    <div className="flex items-center gap-2 py-0.5" data-testid="vs-divider">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-red-600/40 to-transparent" />
      <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-red-800/30 bg-red-950/20">
        <Sword className="w-3.5 h-3.5 text-red-400" weight="bold" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">vs</span>
        <Sword className="w-3.5 h-3.5 text-red-400 scale-x-[-1]" weight="bold" />
      </div>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-red-600/40 to-transparent" />
    </div>
  ) : undefined;

  const partyRowNode = (displayPhase === "active" || displayPhase === "advancing") ? (
    <div className="flex gap-1.5 flex-wrap justify-center" data-testid="party-formation">
      {members.map((member, i) => (
        <PartyShowcaseCard
          key={member.playerId}
          member={member}
          isMe={member.playerId === player?.id}
          accPct={accPcts[member.playerId]}
          hasAggro={aggroTargetId === member.playerId}
          flash={memberFlashes[member.playerId]}
          index={i}
          totalMembers={members.length}
        />
      ))}
    </div>
  ) : displayPhase === "intermission" ? (
    <div className="flex gap-1.5 flex-wrap justify-center" data-testid="party-formation-intermission">
      {members.map((member, i) => (
        <PartyShowcaseCard
          key={member.playerId}
          member={member}
          isMe={member.playerId === player?.id}
          accPct={0}
          hasAggro={false}
          flash={undefined}
          index={i}
          totalMembers={members.length}
        />
      ))}
    </div>
  ) : <div />;

  const controlsNode = (
    <div className="flex gap-2 flex-wrap" data-testid="control-panel">
      {isAlive && !isExtracted && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowEscapeOverlay(true)}
          disabled={displayPhase === "active" || displayPhase === "boss_preview"}
          className={cn(
            "border-amber-700/50 text-amber-300 hover:bg-amber-950/50",
            (displayPhase === "active" || displayPhase === "boss_preview") && "opacity-50 cursor-not-allowed"
          )}
          title={displayPhase === "active" ? "Can only extract during intermission" : undefined}
          data-testid="btn-extract"
        >
          <SignOut className="w-3.5 h-3.5 mr-1" weight="bold" />
          {displayPhase === "active" ? "In Combat" : "Extract"}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowCombatLog(!showCombatLog)}
        className={cn("border-gray-600", showCombatLog ? "text-purple-300 border-purple-600/50" : "text-gray-400")}
        data-testid="btn-toggle-log"
      >
        <Eye className="w-3.5 h-3.5 mr-1" />
        {showCombatLog ? "Hide" : "Show"} Log
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setShowChat(!showChat); if (!showChat) setUnreadCount(0); }}
        className={cn("border-gray-600 relative", showChat ? "text-blue-300 border-blue-600/50" : "text-gray-400")}
        data-testid="btn-toggle-chat"
      >
        <ChatCircle className="w-3.5 h-3.5 mr-1" />
        Chat
        {unreadCount > 0 && !showChat && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>
    </div>
  );

  const combatLogNode = showCombatLog ? (
    <Card className="border-gray-700/30 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]" data-testid="combat-log-panel">
      <CardContent className="p-2 max-h-52 overflow-y-auto text-xs space-y-0.5" ref={combatLogRef}>
        {(combatEvents ?? []).length === 0 && (
          <p className="text-gray-500 text-center py-2">Waiting for combat...</p>
        )}
        {(combatEvents ?? []).slice(-80).map(event => (
          <CombatLogEntry key={event.index} event={event} />
        ))}
      </CardContent>
    </Card>
  ) : undefined;

  const chatNode = showChat ? (
    <Card className="border-blue-700/30 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]" data-testid="party-chat-panel">
      <CardContent className="p-2 space-y-2">
        <div className="max-h-32 overflow-y-auto text-xs space-y-1" ref={chatRef}>
          {chatMessages.length === 0 && (
            <p className="text-gray-500 text-center py-2">No messages yet</p>
          )}
          {chatMessages.map(msg => (
            <div key={msg.id} className="flex gap-1.5">
              <span className={cn("font-semibold shrink-0", msg.playerId === player?.id ? "text-purple-300" : "text-blue-300")}>
                {msg.username}:
              </span>
              <span className="text-gray-300 break-all">{msg.content}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendChatMessage()}
            placeholder="Type a message..."
            maxLength={200}
            className="flex-1 bg-black/30 border border-gray-700/50 rounded px-2 py-1 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-blue-600/50"
            data-testid="chat-input"
          />
          <Button size="sm" onClick={sendChatMessage} disabled={!chatInput.trim()} className="h-7 px-2 bg-blue-700 hover:bg-blue-600" data-testid="btn-send-chat">
            <PaperPlaneTilt className="w-3.5 h-3.5" weight="fill" />
          </Button>
        </div>
      </CardContent>
    </Card>
  ) : undefined;

  const runSummaryNode = (
    <Card className="border-gray-700/50 bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#16162a_40%,_#0d0d1a_100%)]" data-testid="run-stats-card">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="w-4 h-4 text-amber-400" weight="fill" />
          <span className="text-sm font-bold text-gray-200">Run Summary</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <div className="text-center p-1.5 rounded bg-black/30 border border-gray-700/30">
            <div className="text-sm font-bold text-blue-300" data-testid="stat-floors">{snapshot?.floorsCleared || 0}</div>
            <div className="text-[8px] text-gray-500 uppercase">Floors</div>
          </div>
          <div className="text-center p-1.5 rounded bg-black/30 border border-gray-700/30">
            <div className="text-sm font-bold text-yellow-300" data-testid="stat-gold">{formatNumber(currentMember?.personalGold || 0)}</div>
            <div className="text-[8px] text-gray-500 uppercase">Gold</div>
          </div>
          <div className="text-center p-1.5 rounded bg-black/30 border border-gray-700/30">
            <div className="text-sm font-bold text-purple-300" data-testid="stat-xp">{formatNumber(currentMember?.personalXp || 0)}</div>
            <div className="text-[8px] text-gray-500 uppercase">XP</div>
          </div>
          <div className="text-center p-1.5 rounded bg-black/30 border border-gray-700/30">
            <div className="text-sm font-bold text-amber-300" data-testid="stat-dmg">{formatNumber(currentMember?.totalDamageDealt || 0)}</div>
            <div className="text-[8px] text-gray-500 uppercase">DMG</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const intermissionNode = displayPhase === "intermission" ? (
    <>
      <Card className="border-green-700/30 bg-[radial-gradient(ellipse_at_center,_#0d1a0d_0%,_#101a16_40%,_#0d0d1a_100%)]" data-testid="intermission-panel">
        <div className="h-1 w-full bg-gradient-to-r from-green-700 via-emerald-500 to-green-700 animate-pulse" />
        <CardContent className="p-4 text-center space-y-3">
          <Cookie className="w-8 h-8 text-green-400 mx-auto" />
          <p className="text-sm font-bold text-green-300">INTERMISSION</p>
          <p className="text-xs text-muted-foreground">
            Checkpoint {snapshot?.securedLootCheckpoints || 0} reached — loot secured!
          </p>
          <p className="text-xs text-green-400/80">Next floor starts automatically</p>

          {nextMonsters.length > 0 && (
            <div className="mt-3 text-left" data-testid="next-monsters-preview">
              <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                Upcoming Encounters
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {nextMonsters.map((m, i) => {
                  const mNameLower = (m.monsterId || m.name || "").toLowerCase().replace(/\s+/g, "_");
                  const mImg = getMonsterImage(mNameLower) || getMonsterImage(m.name.toLowerCase().replace(/\s+/g, "_"));
                  return (
                    <TooltipProvider key={i}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={cn(
                            "shrink-0 w-[90px] rounded-lg border p-1.5 cursor-help transition-colors",
                            m.isBoss
                              ? "border-yellow-600/50 bg-yellow-950/20"
                              : "border-gray-700/40 bg-black/30 hover:border-gray-600/60"
                          )}>
                            <div className="text-[9px] text-gray-500 text-center mb-1">F{m.floor}</div>
                            <div className={cn(
                              "w-14 h-14 mx-auto rounded-lg border overflow-hidden bg-black/40 flex items-center justify-center",
                              m.isBoss ? "border-yellow-500/50" : "border-gray-600/40"
                            )}>
                              {mImg ? (
                                <img src={mImg} alt={m.name} className="w-full h-full object-cover" />
                              ) : (
                                <Skull className="w-6 h-6 text-gray-500" />
                              )}
                            </div>
                            <div className={cn(
                              "text-[10px] text-center mt-1 truncate",
                              m.isBoss ? "text-red-400 font-semibold" : "text-gray-300"
                            )}>
                              {m.name}
                            </div>
                            {m.isBoss && (
                              <div className="flex justify-center mt-0.5">
                                <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-red-600/50 text-red-400">
                                  <Crown className="w-2 h-2 mr-0.5" weight="fill" />
                                  BOSS
                                </Badge>
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[200px] bg-gray-900 border-gray-700 text-gray-200">
                          <div className="space-y-1">
                            <p className="font-bold text-sm">{m.name}</p>
                            {m.maxHitpoints != null && m.maxHitpoints > 0 && (
                              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                                <div className="flex items-center gap-1">
                                  <Heart className="w-3 h-3 text-red-400" weight="fill" />
                                  <span>{formatNumber(m.maxHitpoints)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Sword className="w-3 h-3 text-orange-400" weight="fill" />
                                  <span>{m.attackLevel}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Shield className="w-3 h-3 text-blue-400" weight="fill" />
                                  <span>{m.defenceLevel}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Timer className="w-3 h-3 text-purple-400" weight="fill" />
                                  <span>{((m.attackSpeed || 2500) / 1000).toFixed(1)}s</span>
                                </div>
                              </div>
                            )}
                            {(m.skills ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-0.5 mt-0.5">
                                {(m.skills ?? []).map((s: any, si: number) => (
                                  <SkillDetailPopup key={si} skill={s} variant="badge" isMonsterSkill />
                                ))}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {partyRowNode}

      <EquipmentPanel
        equipment={equipment}
        inventory={inventory}
        equipItem={equipItem}
        unequipItem={unequipItem}
        bonuses={getTotalEquipmentBonus(equipment, itemModifications)}
        getSlotDurability={getSlotDurability}
        itemModifications={itemModifications}
        cursedItems={cursedItems}
        compact
        showBonusSummary
        testIdPrefix="dungeon-intermission"
      />
    </>
  ) : undefined;

  return (
    <>
      <EscapeOverlay
        isActive={showEscapeOverlay}
        canExtract={displayPhase !== "active"}
        isPending={extractMutation.isPending}
        onExtract={() => {
          extractMutation.mutate();
          setShowEscapeOverlay(false);
        }}
        onStay={() => setShowEscapeOverlay(false)}
      />

      {syncing && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" data-testid="syncing-overlay">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-lg font-bold text-purple-300">Syncing Dungeon...</p>
            <p className="text-sm text-gray-400">Reconnecting to your session</p>
          </div>
        </div>
      )}

      <PartyDungeonArena
        header={headerNode}
        bossStage={bossStageNode}
        vsDivider={vsDividerNode}
        partyRow={partyRowNode}
        controls={controlsNode}
        combatLog={combatLogNode}
        chat={chatNode}
        runSummary={runSummaryNode}
        lootLane={<LootLane lootPool={lootPool} />}
        floorTransition={<FloorTransition currentFloor={snapshot?.currentFloor || 1} />}
        background={<DungeonBackground currentFloor={snapshot?.currentFloor || 1} maxFloors={snapshot?.maxFloors || 100} />}
        intermission={intermissionNode}
        isIntermission={displayPhase === "intermission"}
      />
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
    </>
  );
}

function CombatLogEntry({ event }: { event: CombatEvent }) {
  const d = event.data || {};
  const mn = d.monsterName || "Monster";

  const getRoleColor = (name: string) => {
    if (d.role === "tank") return "text-blue-400";
    if (d.role === "healer") return "text-green-400";
    if (d.role === "hybrid") return "text-yellow-400";
    return "text-cyan-300";
  };

  let content: ReactNode;
  let className = "py-0.5 px-1.5 rounded flex items-start gap-1.5 leading-relaxed";

  switch (event.type) {
    case "player_attack":
      if (d.skillName) {
        className += " bg-orange-950/20";
        content = (
          <>
            <Sword className="w-3 h-3 text-orange-400 shrink-0 mt-0.5" weight="fill" />
            <span>
              <span className={getRoleColor(d.playerName)}>{d.playerName || "Player"}</span>
              <span className="text-orange-400 font-semibold"> {d.skillName} </span>
              <span className="text-gray-400">{d.targetName || mn}</span>
              <span className="text-orange-300 font-bold"> {formatNumber(d.damage)}!</span>
            </span>
          </>
        );
      } else if (d.isCrit) {
        className += " bg-yellow-950/20";
        content = (
          <>
            <Sword className="w-3 h-3 text-yellow-400 shrink-0 mt-0.5" weight="fill" />
            <span>
              <span className={getRoleColor(d.playerName)}>{d.playerName || "Player"}</span>
              <span className="text-yellow-400 font-bold"> CRIT </span>
              <span className="text-gray-400">{d.targetName || mn}</span>
              <span className="text-yellow-300 font-bold"> {formatNumber(d.damage)}!</span>
            </span>
          </>
        );
      } else {
        content = (
          <>
            <Sword className="w-3 h-3 text-cyan-400 shrink-0 mt-0.5" weight="fill" />
            <span>
              <span className={getRoleColor(d.playerName)}>{d.playerName || "Player"}</span>
              <span className="text-gray-500"> hit </span>
              <span className="text-gray-400">{d.targetName || mn}</span>
              <span className="text-white font-medium"> {formatNumber(d.damage)}</span>
            </span>
          </>
        );
      }
      break;

    case "monster_attack":
      className += " bg-red-950/15";
      content = (
        <>
          <Skull className="w-3 h-3 text-red-400 shrink-0 mt-0.5" weight="fill" />
          <span>
            <span className="text-red-400 font-medium">{mn}</span>
            <span className="text-gray-500"> hit </span>
            <span className="text-gray-300">{d.targetName || "player"}</span>
            <span className="text-red-300 font-medium"> -{formatNumber(d.damage)}</span>
            {d.tankBlock && d.blocked > 0 && (
              <span className="text-blue-400 font-semibold"> (🛡 -{formatNumber(d.blocked)})</span>
            )}
          </span>
        </>
      );
      break;

    case "monster_multi_attack":
      className += " bg-red-950/20";
      content = (
        <>
          <Fire className="w-3 h-3 text-red-400 shrink-0 mt-0.5" weight="fill" />
          <span>
            <span className="text-red-400 font-medium">{mn}</span>
            <span className="text-gray-500"> multi-attack </span>
            <span className="text-gray-300">{d.targetName || "player"}</span>
            <span className="text-red-300 font-medium"> -{formatNumber(d.damage)}</span>
          </span>
        </>
      );
      break;

    case "heal":
      content = (
        <>
          <Heart className="w-3 h-3 text-green-400 shrink-0 mt-0.5" weight="fill" />
          <span>
            <span className="text-green-400">{d.healerName || "Healer"}</span>
            {d.skillName ? (
              <span className="text-emerald-400 font-semibold"> {d.skillName} </span>
            ) : (
              <span className="text-gray-500"> healed </span>
            )}
            <span className="text-gray-300">{d.targetName || "player"}</span>
            <span className="text-green-300 font-medium"> +{formatNumber(d.amount)}</span>
          </span>
        </>
      );
      break;

    case "monster_skill":
      className += " bg-orange-950/20";
      content = (
        <>
          <Crown className="w-3 h-3 text-orange-400 shrink-0 mt-0.5" weight="fill" />
          <span>
            <span className="text-orange-400 font-medium">{mn}</span>
            <span className="text-orange-300"> used </span>
            <span className="text-orange-200 font-semibold">{(d.skill || d.type || "").replace(/_/g, " ")}</span>
          </span>
        </>
      );
      break;

    case "member_died":
      className += " bg-red-950/30";
      content = (
        <>
          <Skull className="w-3 h-3 text-red-300 shrink-0 mt-0.5" weight="fill" />
          <span className="text-red-300 font-medium">
            {d.playerName || "A party member"} was slain!
          </span>
        </>
      );
      break;

    case "monster_defeated":
      className += " bg-green-950/30";
      content = (
        <>
          <Trophy className="w-3 h-3 text-green-300 shrink-0 mt-0.5" weight="fill" />
          <span>
            <span className="text-green-300 font-medium">{d.monsterName || "Monster"} defeated!</span>
            <span className="text-gray-400"> +{formatNumber(d.xpGained || 0)} XP, +{formatNumber(d.goldGained || 0)} gold</span>
          </span>
        </>
      );
      break;

    case "reflect_damage":
      className += " bg-cyan-950/20";
      content = (
        <>
          <Shield className="w-3 h-3 text-cyan-400 shrink-0 mt-0.5" weight="fill" />
          <span>
            <span className="text-cyan-400">{mn}</span>
            <span className="text-gray-500"> reflected </span>
            <span className="text-cyan-300 font-medium">{formatNumber(d.damage)}</span>
            <span className="text-gray-500"> to </span>
            <span className="text-gray-300">{d.playerName || "player"}</span>
          </span>
        </>
      );
      break;

    case "monster_enrage":
      className += " bg-orange-950/25";
      content = (
        <>
          <Fire className="w-3 h-3 text-orange-400 shrink-0 mt-0.5 animate-pulse" weight="fill" />
          <span className="text-orange-300 font-semibold">
            {mn} enraged! ({event.data.multiplier ? `${event.data.multiplier.toFixed(1)}x` : "+ATK"})
          </span>
        </>
      );
      break;

    default:
      content = <span className="text-gray-500">{event.type.replace(/_/g, " ")}</span>;
  }

  return <div className={className}>{content}</div>;
}
