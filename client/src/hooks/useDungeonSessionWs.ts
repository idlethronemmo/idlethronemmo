import { useEffect, useRef, useState, useCallback } from "react";
import { useGame } from "@/context/GameContext";
import { usePartyWebSocket } from "./usePartyWebSocket";
import { apiRequest } from "@/lib/queryClient";

export interface DungeonMemberSnapshot {
  playerId: string;
  username?: string;
  role?: string;
  status?: 'alive' | 'dead' | 'extracted' | 'disconnected' | 'left';
  currentHp: number;
  maxHp: number;
  isAlive: boolean;
  isExtracted: boolean;
  isDisconnected?: boolean;
  attackAccumulator: number;
  attackSpeedMs: number;
  currentThreat: number;
  dps?: number;
  defense?: number;
  totalDamageDealt?: number;
  totalHealingDone?: number;
  personalGold?: number;
  personalXp?: number;
  weaponType?: string;
  armorType?: string;
}

export interface DungeonMonsterSnapshot {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  attackSpeedMs: number;
  attackAccumulator: number;
  isBoss: boolean;
  skills: { type: string; chance?: number; value?: number; cooldownMs?: number }[];
  enraged: boolean;
  stunUntil?: number;
  reflectDamage?: number;
  powerMultiplier?: number;
}

export interface CombatEvent {
  index: number;
  type: string;
  timestamp: number;
  data: Record<string, any>;
}

export interface VoteInfo {
  nextMultiplier: number;
  currentSegment: number;
  deadline: number;
}

export interface BossPreviewInfo {
  floor: number;
  monster: DungeonMonsterSnapshot;
  readyPlayers: string[];
  autoStartAt: number;
}

export interface DungeonSessionSnapshot {
  sessionId: string;
  partyId: string;
  dungeonId: string;
  phase: "initializing" | "active" | "intermission" | "ended" | "advancing" | "voting" | "boss_preview";
  currentFloor: number;
  floorsCleared: number;
  maxFloors: number;
  multiplier: number;
  riskLevel: number;
  securedLootCheckpoints: number;
  members: DungeonMemberSnapshot[];
  monster: DungeonMonsterSnapshot | null;
  advancingUntil?: number;
  currentSegment?: number;
  difficultyMultiplier?: number;
}

interface UseDungeonSessionOptions {
  partyId: string | null;
  sessionId: string | null;
  enabled?: boolean;
}

export function useDungeonSessionWs({ partyId, sessionId, enabled = true }: UseDungeonSessionOptions) {
  const { player } = useGame();
  const [snapshot, setSnapshot] = useState<DungeonSessionSnapshot | null>(null);
  const [combatEvents, setCombatEvents] = useState<CombatEvent[]>([]);
  const [phase, setPhase] = useState<string>("initializing");
  const [ended, setEnded] = useState<{ reason: string; members: any[] } | null>(null);
  const [nextMonsters, setNextMonsters] = useState<Array<{ floor: number; name: string; isBoss: boolean; monsterId?: string; maxHitpoints?: number; attackLevel?: number; defenceLevel?: number; attackSpeed?: number; skills?: any[] }>>([]);
  const [voteInfo, setVoteInfo] = useState<VoteInfo | null>(null);
  const [playerVotes, setPlayerVotes] = useState<Record<string, boolean>>({});
  const [voteResult, setVoteResult] = useState<{ continued: boolean; nextMultiplier?: number } | null>(null);
  const [bossPreview, setBossPreview] = useState<BossPreviewInfo | null>(null);
  const [syncing, setSyncing] = useState(false);
  const lastEventIndexRef = useRef(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const hadSnapshotRef = useRef(false);

  const handleEvent = useCallback((event: any) => {
    const type = event.type;
    const payload = event.payload || {};

    if (type === "dungeon_session:started") {
      setSyncing(false);
      hadSnapshotRef.current = true;
      setSnapshot(prev => ({
        ...(prev || {} as any),
        sessionId: payload.sessionId,
        partyId: partyId || "",
        dungeonId: payload.dungeonId,
        phase: payload.phase || "initializing",
        currentFloor: 1,
        floorsCleared: 0,
        maxFloors: payload.maxFloors || 15,
        multiplier: 100,
        riskLevel: 0,
        securedLootCheckpoints: 0,
        members: payload.members || [],
        monster: null,
        currentSegment: 1,
        difficultyMultiplier: 1,
      }));
      setPhase("initializing");
    }

    if (type === "dungeon_session:monster_preview") {
      setSnapshot(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          monster: payload.monster || null,
        };
      });
    }

    if (type === "dungeon_session:phase_change") {
      setPhase(payload.phase);
      if (payload.phase !== "intermission") {
        setNextMonsters([]);
      }
      if (payload.phase === "active") {
        setBossPreview(null);
        setVoteInfo(null);
        setPlayerVotes({});
        setVoteResult(null);
      }
      setSnapshot(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: payload.phase,
          currentFloor: payload.floor ?? prev.currentFloor,
          monster: payload.monster || prev.monster || null,
          currentSegment: payload.currentSegment ?? prev.currentSegment,
          difficultyMultiplier: payload.difficultyMultiplier ?? prev.difficultyMultiplier,
        };
      });
    }

    if (type === "dungeon_session:combat_batch") {
      setSyncing(false);
      hadSnapshotRef.current = true;
      const newEvents = payload.events || [];
      setCombatEvents(prev => {
        const existingIndexes = new Set(prev.map((e: CombatEvent) => e.index));
        const unique = newEvents.filter((e: CombatEvent) => !existingIndexes.has(e.index));
        if (unique.length === 0) return prev;
        return [...prev, ...unique].slice(-200);
      });

      setSnapshot(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: payload.phase || prev.phase,
          currentFloor: payload.floor ?? prev.currentFloor,
          floorsCleared: payload.floorsCleared ?? prev.floorsCleared,
          members: payload.members || prev.members,
          monster: payload.monster ?? prev.monster,
        };
      });
    }

    if (type === "dungeon_session:intermission") {
      setPhase("intermission");
      if (payload.nextMonsters) {
        setNextMonsters(payload.nextMonsters);
      }
      setSnapshot(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: "intermission",
          securedLootCheckpoints: payload.checkpoint ?? prev.securedLootCheckpoints,
          floorsCleared: payload.floorsCleared ?? prev.floorsCleared,
          monster: null,
        };
      });
    }

    if (type === "dungeon_session:floor_advancing") {
      setPhase("advancing");
      setSnapshot(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: "advancing",
          currentFloor: payload.nextFloor ?? prev.currentFloor,
          monster: null,
        };
      });
    }

    if (type === "dungeon_session:next_floor") {
      setSnapshot(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          currentFloor: payload.floor ?? prev.currentFloor,
          monster: payload.monster || null,
        };
      });
    }

    if (type === "dungeon_session:vote_started") {
      setPhase("voting");
      const deadlineMs = payload.deadline || (Date.now() + (payload.timeoutMs || 60000));
      setVoteInfo({
        nextMultiplier: payload.nextDifficulty || payload.nextMultiplier || 2,
        currentSegment: payload.currentSegment || 1,
        deadline: deadlineMs,
      });
      setPlayerVotes({});
      setVoteResult(null);
      setSnapshot(prev => {
        if (!prev) return prev;
        return { ...prev, phase: "voting", monster: null };
      });
    }

    if (type === "dungeon_session:vote_cast") {
      setPlayerVotes(prev => ({
        ...prev,
        [payload.playerId]: payload.vote,
      }));
    }

    if (type === "dungeon_session:vote_resolved") {
      const continued = payload.result === 'continue' || payload.continued === true;
      const mult = payload.newDifficulty || payload.nextMultiplier || 1;
      setVoteResult({
        continued,
        nextMultiplier: mult,
      });
      if (continued) {
        setSnapshot(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            maxFloors: payload.maxFloors ?? payload.newMaxFloors ?? prev.maxFloors,
            difficultyMultiplier: mult,
            currentSegment: payload.newSegment ?? ((prev.currentSegment || 1) + 1),
          };
        });
      }
    }

    if (type === "dungeon_session:boss_preview") {
      setPhase("boss_preview");
      setBossPreview({
        floor: payload.floor,
        monster: payload.monster,
        readyPlayers: [],
        autoStartAt: Date.now() + 10000,
      });
      setSnapshot(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: "boss_preview",
          monster: payload.monster || null,
          currentFloor: payload.floor ?? prev.currentFloor,
        };
      });
    }

    if (type === "dungeon_session:boss_ready_update" || type === "dungeon_session:boss_ready") {
      setBossPreview(prev => {
        if (!prev) return prev;
        const readyPlayers = payload.readyPlayers || (payload.playerId ? [...prev.readyPlayers.filter(p => p !== payload.playerId), payload.playerId] : prev.readyPlayers);
        return { ...prev, readyPlayers };
      });
    }

    if (type === "dungeon_session:ended") {
      setPhase("ended");
      setEnded({ reason: payload.reason, members: payload.members || [] });
      setSnapshot(prev => {
        if (!prev) return prev;
        return { ...prev, phase: "ended", monster: null };
      });
    }

    if (type === "dungeon_session:member_disconnected") {
      setSnapshot(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          members: prev.members.map(m =>
            m.playerId === payload.playerId ? { ...m, isDisconnected: true } : m
          ),
        };
      });
    }

    if (type === "dungeon_session:member_reconnected") {
      setSnapshot(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          members: prev.members.map(m =>
            m.playerId === payload.playerId ? { ...m, isDisconnected: false } : m
          ),
        };
      });
    }

    if (type === "dungeon_session:member_extracted") {
      setSnapshot(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          members: prev.members.map(m =>
            m.playerId === payload.playerId ? { ...m, isExtracted: true, isAlive: false } : m
          ),
        };
      });
    }

    if (type === "dungeon_session:food_used" || type === "dungeon_session:boss_enraged") {
      if (payload.currentHp !== undefined && payload.playerId) {
        setSnapshot(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            members: prev.members.map(m =>
              m.playerId === payload.playerId ? { ...m, currentHp: payload.currentHp } : m
            ),
          };
        });
      }
    }
  }, [partyId]);

  const { sendMessage, connected } = usePartyWebSocket({
    playerId: player?.id || null,
    partyId,
    enabled: enabled && !!player,
    onEvent: handleEvent,
  });

  useEffect(() => {
    if (!connected && hadSnapshotRef.current && enabled) {
      setSyncing(true);
    }
    if (connected && syncing) {
      const t = setTimeout(() => setSyncing(false), 3000);
      return () => clearTimeout(t);
    }
  }, [connected, enabled]);

  useEffect(() => {
    if (!enabled || !player) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    if (connected) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const res = await apiRequest("GET", `/api/v2/dungeon-party/session/state?sinceEvent=${lastEventIndexRef.current}`);
        const data = await res.json();
        consecutiveErrorsRef.current = 0;
        if (!data.active) return;

        setSnapshot({
          sessionId: data.sessionId,
          partyId: data.partyId,
          dungeonId: data.dungeonId,
          phase: data.phase,
          currentFloor: data.currentFloor,
          floorsCleared: data.floorsCleared,
          maxFloors: data.maxFloors,
          multiplier: data.multiplier,
          riskLevel: data.riskLevel,
          securedLootCheckpoints: data.securedLootCheckpoints,
          members: data.members || [],
          monster: data.monster || null,
          advancingUntil: data.advancingUntil,
          currentSegment: data.currentSegment,
          difficultyMultiplier: data.difficultyMultiplier,
        });
        setPhase(data.phase);

        if (data.phase === 'ended') {
          const endedEvent = (data.events || []).find((e: any) => e.type === 'dungeon_session:ended');
          if (endedEvent) {
            setEnded({ reason: endedEvent.data?.reason || 'unknown', members: endedEvent.data?.members || data.members || [] });
          }
        }

        if (data.events && data.events.length > 0) {
          setCombatEvents(prev => {
            const existingIndexes = new Set(prev.map((e: CombatEvent) => e.index));
            const unique = data.events.filter((e: CombatEvent) => !existingIndexes.has(e.index));
            if (unique.length === 0) return prev;
            return [...prev, ...unique].slice(-200);
          });
        }

        if (data.latestEventIndex) {
          lastEventIndexRef.current = data.latestEventIndex;
        }
      } catch {
        consecutiveErrorsRef.current++;
      }
    };

    consecutiveErrorsRef.current = 0;
    poll();
    pollingRef.current = setInterval(() => {
      if (consecutiveErrorsRef.current >= 5) return;
      poll();
    }, 1000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [enabled, player, connected]);

  const applyFullSnapshot = useCallback((snap: DungeonSessionSnapshot) => {
    setSnapshot(snap);
    setPhase(snap.phase);
  }, []);

  return {
    snapshot,
    combatEvents,
    phase,
    ended,
    connected,
    syncing,
    sendMessage,
    applyFullSnapshot,
    nextMonsters,
    voteInfo,
    playerVotes,
    voteResult,
    bossPreview,
  };
}
