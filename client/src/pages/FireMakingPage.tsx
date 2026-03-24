import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Fire,
  Timer,
  Lock,
  X,
  Plus,
  Flame,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useGame, BurningSlot, LOG_TO_ASH_MAP } from "@/context/GameContext";
import { formatNumber } from "@/lib/gameMath";
import { SkillProgressBar } from "@/components/game/SkillProgressBar";
import { QueueCountdownTimer } from "@/components/game/QueueCountdownTimer";
import { DurationPickerDialog } from "@/components/game/DurationPickerDialog";
import { getUsedQueueTimeMs } from "@shared/schema";
import { getItemImage } from "@/lib/itemImages";
import { translateItemName, getItemById, buildDraftQuery } from "@/lib/items";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useMobile } from "@/hooks/useMobile";
import { useLanguage } from "@/context/LanguageContext";
import { useAudio } from "@/context/AudioContext";
import { t } from "@/lib/i18n";

interface FiremakingAction {
  id: number;
  name: string;
  itemId: string;
  levelRequired: number;
  xpReward: number;
  duration: number;
  requiredBait: string;
  baitAmount: number;
  nameTranslations?: Record<string, string>;
}

interface LogItem {
  id: string;
  name: string;
  quantity: number;
  levelRequired: number;
  xpReward: number;
  duration: number;
  actionId: number;
  itemId: string;
}

const SLOT_REQUIREMENTS = [
  { level: 1, slots: 1 },
  { level: 20, slots: 2 },
  { level: 35, slots: 3 },
  { level: 50, slots: 4 },
  { level: 70, slots: 5 },
  { level: 85, slots: 6 },
];

function getUnlockedSlots(level: number, debugMode: boolean): number {
  if (debugMode) return 6;
  for (let i = SLOT_REQUIREMENTS.length - 1; i >= 0; i--) {
    if (level >= SLOT_REQUIREMENTS[i].level) {
      return SLOT_REQUIREMENTS[i].slots;
    }
  }
  return 1;
}

function getNextSlotLevel(level: number): number | null {
  for (const req of SLOT_REQUIREMENTS) {
    if (level < req.level) {
      return req.level;
    }
  }
  return null;
}

function CampfireAnimation({ isActive }: { isActive: boolean }) {
  return (
    <div className="relative w-32 h-32 mx-auto">
      <div className="absolute inset-0 flex items-end justify-center">
        <div className="relative">
          <div className={cn(
            "absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-6 rounded-full blur-sm transition-colors duration-500",
            isActive ? "bg-amber-900/60" : "bg-slate-800/40"
          )} />
          <div className="relative flex items-end justify-center gap-0.5">
            <div className={cn(
              "w-3 h-8 rounded-t-sm transform -rotate-12 origin-bottom transition-colors duration-500",
              isActive ? "bg-gradient-to-t from-amber-800 to-amber-700" : "bg-gradient-to-t from-slate-700 to-slate-600"
            )} />
            <div className={cn(
              "w-3 h-10 rounded-t-sm transform rotate-6 origin-bottom transition-colors duration-500",
              isActive ? "bg-gradient-to-t from-amber-800 to-amber-700" : "bg-gradient-to-t from-slate-700 to-slate-600"
            )} />
            <div className={cn(
              "w-3 h-9 rounded-t-sm transform -rotate-3 origin-bottom transition-colors duration-500",
              isActive ? "bg-gradient-to-t from-amber-800 to-amber-700" : "bg-gradient-to-t from-slate-700 to-slate-600"
            )} />
            <div className={cn(
              "w-3 h-7 rounded-t-sm transform rotate-15 origin-bottom transition-colors duration-500",
              isActive ? "bg-gradient-to-t from-amber-800 to-amber-700" : "bg-gradient-to-t from-slate-700 to-slate-600"
            )} />
          </div>
        </div>
      </div>
      {isActive && (
        <>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center">
            <div className="fire-flame fire-flame-1" />
            <div className="fire-flame fire-flame-2" />
            <div className="fire-flame fire-flame-3" />
          </div>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-16 h-16 bg-orange-500/30 rounded-full blur-xl animate-pulse" />
        </>
      )}
      {isActive && (
        <style>{`
          .fire-flame {
            position: absolute;
            border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
            filter: blur(1px);
          }
          .fire-flame-1 {
            width: 24px;
            height: 40px;
            background: linear-gradient(to top, #f97316, #fbbf24, #fef3c7);
            animation: flicker1 0.3s ease-in-out infinite alternate;
            bottom: 0;
          }
          .fire-flame-2 {
            width: 18px;
            height: 32px;
            background: linear-gradient(to top, #ea580c, #f97316, #fbbf24);
            animation: flicker2 0.4s ease-in-out infinite alternate;
            bottom: 4px;
            left: -8px;
          }
          .fire-flame-3 {
            width: 16px;
            height: 28px;
            background: linear-gradient(to top, #dc2626, #ea580c, #f97316);
            animation: flicker3 0.35s ease-in-out infinite alternate;
            bottom: 2px;
            right: -6px;
          }
          @keyframes flicker1 {
            0% { transform: scaleY(1) scaleX(1) translateY(0); opacity: 1; }
            100% { transform: scaleY(1.1) scaleX(0.95) translateY(-2px); opacity: 0.9; }
          }
          @keyframes flicker2 {
            0% { transform: scaleY(1) scaleX(1) rotate(-5deg); opacity: 0.8; }
            100% { transform: scaleY(1.15) scaleX(0.9) rotate(5deg); opacity: 1; }
          }
          @keyframes flicker3 {
            0% { transform: scaleY(1) scaleX(1) rotate(3deg); opacity: 0.85; }
            100% { transform: scaleY(1.08) scaleX(0.92) rotate(-3deg); opacity: 0.95; }
          }
        `}</style>
      )}
    </div>
  );
}

function BurningSlotComponent({
  slot,
  index,
  totalSlots,
  onClear,
  isPaused,
}: {
  slot: BurningSlot | null;
  index: number;
  totalSlots: number;
  onClear: (index: number) => void;
  isPaused?: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!slot) {
      setProgress(0);
      return;
    }

    if (isPaused) {
      return;
    }

    const updateProgress = () => {
      const currentTime = Date.now();
      setNow(currentTime);
      const elapsed = currentTime - slot.startTime;
      const percent = Math.min(100, (elapsed / slot.duration) * 100);
      setProgress(percent);

      if (elapsed >= slot.duration) {
        // GameContext tick handles rewards and slot advancement
      }
    };

    updateProgress();
    const interval = setInterval(updateProgress, 100);
    return () => clearInterval(interval);
  }, [slot, index, isPaused]);

  const angle = (360 / 6) * index - 90;
  const radius = 85;
  const x = Math.cos((angle * Math.PI) / 180) * radius;
  const y = Math.sin((angle * Math.PI) / 180) * radius;

  const isLocked = index >= totalSlots;
  const nextLevel = SLOT_REQUIREMENTS.find((r) => r.slots > index)?.level;

  const remainingMs = slot ? Math.max(0, slot.duration - (now - slot.startTime)) : 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  const logImg = slot ? getItemImage(slot.logId) : null;

  return (
    <div
      className="absolute w-14 h-14"
      style={{
        left: `calc(50% + ${x}px - 28px)`,
        top: `calc(50% + ${y}px - 28px)`,
      }}
      data-testid={`burning-slot-${index}`}
    >
      <div
        className={cn(
          "w-full h-full rounded-full border-2 flex items-center justify-center transition-all relative",
          isLocked
            ? "bg-slate-800/50 border-slate-600/30 cursor-not-allowed"
            : slot && isPaused
            ? "bg-slate-600/30 border-slate-400/50 shadow-lg shadow-slate-500/20"
            : slot
            ? "bg-orange-500/20 border-orange-500/50 shadow-lg shadow-orange-500/20"
            : "bg-slate-700/50 border-slate-500/30 hover:border-orange-400/50 hover:bg-orange-500/10 cursor-pointer"
        )}
      >
        {isLocked ? (
          <div className="flex flex-col items-center">
            <Lock className="w-4 h-4 text-slate-500" weight="fill" />
            <span className="text-[8px] text-slate-500 mt-0.5">Lv.{nextLevel}</span>
          </div>
        ) : slot ? (
          <>
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 transition-all",
                  isPaused ? "bg-gradient-to-t from-slate-500/40 to-transparent" : "bg-gradient-to-t from-orange-500/40 to-transparent"
                )}
                style={{ height: `${progress}%` }}
              />
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onClear(index); }}
              className="absolute -top-1 -right-1 z-20 w-5 h-5 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors shadow-md"
              data-testid={`clear-slot-${index}`}
            >
              <X className="w-3 h-3 text-white" weight="bold" />
            </button>
            <div className="relative z-10 flex flex-col items-center">
              {logImg ? (
                <img src={logImg} alt="" className={cn("w-8 h-8 object-contain pixelated", isPaused && "opacity-50")} />
              ) : (
                <Flame className={cn("w-6 h-6 text-orange-400", !isPaused && "animate-pulse")} weight="fill" />
              )}
              {isPaused ? (
                <span className="text-[9px] text-slate-400 font-mono">||</span>
              ) : (
                <span className="text-[9px] text-orange-300 font-mono">{remainingSeconds}s</span>
              )}
            </div>
            <div className="absolute -bottom-5 left-0 right-0 text-center">
              <span className="text-[9px] text-slate-400 font-mono" data-testid={`text-remaining-logs-${index}`}>
                {(slot.quantity || 1) - (slot.burnedCount || 0)}/{slot.quantity || 1}
              </span>
            </div>
            <div className="absolute -bottom-1 left-0 right-0 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  isPaused ? "bg-gradient-to-r from-slate-500 to-slate-400" : "bg-gradient-to-r from-orange-500 to-amber-400"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        ) : (
          <Plus className="w-5 h-5 text-slate-400" weight="bold" />
        )}
      </div>
    </div>
  );
}

function LogInventoryItem({
  logId,
  logName,
  quantity,
  levelRequired,
  isLocked,
  isSelected,
  onClick,
  language,
}: {
  logId: string;
  logName: string;
  quantity: number;
  levelRequired: number;
  isLocked: boolean;
  isSelected: boolean;
  onClick: () => void;
  language: string;
}) {
  const logImg = getItemImage(logId);
  const displayName = translateItemName(logId, language as any) || logName;

  return (
    <button
      onClick={onClick}
      disabled={isLocked || quantity === 0}
      className={cn(
        "p-2 rounded-lg border transition-all text-left flex items-center gap-2",
        isSelected
          ? "bg-orange-500/20 border-orange-500/50 shadow-lg"
          : isLocked || quantity === 0
          ? "bg-slate-800/30 border-slate-700/30 opacity-50 cursor-not-allowed"
          : "bg-slate-800/50 border-slate-600/30 hover:border-orange-400/50"
      )}
      data-testid={`log-item-${logId}`}
    >
      <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center overflow-hidden">
        {logImg ? (
          <img src={logImg} alt="" className="w-[90%] h-[90%] object-contain pixelated" />
        ) : (
          <Fire className="w-[70%] h-[70%] text-orange-400" weight="fill" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{displayName}</div>
        <div className="text-[10px] text-muted-foreground">
          {isLocked ? (
            <span className="text-red-400">Lv.{levelRequired}</span>
          ) : (
            <span className="text-orange-400">{formatNumber(quantity)} {t(language as any, "fm_items")}</span>
          )}
        </div>
      </div>
      {!isLocked && quantity > 0 && (
        <Badge className="bg-green-500/30 text-green-300 text-[10px] hover:bg-green-500/50">{t(language as any, "fm_add")}</Badge>
      )}
    </button>
  );
}

export default function FireMakingPage() {
  const {
    skills,
    activeTask,
    startTask,
    startTaskWithDuration,
    stopTask,
    inventory,
    debugMode,
    firemakingSlots: burningSlots,
    setFiremakingSlots: setBurningSlots,
    isQueueV2,
    taskQueue,
    activeCombat,
    maxQueueTimeMsTotal,
    addToQueue,
  } = useGame();
  const { isMobile } = useMobile();
  const { language } = useLanguage();
  const { toast } = useToast();
  const { playAmbient, stopAmbient } = useAudio();

  useEffect(() => {
    if (activeTask?.skillId === 'firemaking') {
      playAmbient('firemaking');
    } else {
      stopAmbient();
    }
    return () => { stopAmbient(); };
  }, [activeTask, playAmbient, stopAmbient]);

  const [firemakingActions, setFiremakingActions] = useState<FiremakingAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [slotPickerOpen, setSlotPickerOpen] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const pausedAtRef = useRef<number | null>(null);

  // Staging: holds log selections before firemaking actually starts (inactive mode only)
  const [stagedSlots, setStagedSlots] = useState<(LogItem | null)[]>([null, null, null, null, null, null]);
  const [startBurningPickerOpen, setStartBurningPickerOpen] = useState(false);

  // Queued slots: holds log selections after adding to queue (shows while waiting in queue)
  const [queuedSlots, setQueuedSlots] = useState<(LogItem | null)[]>([null, null, null, null, null, null]);
  
  // Track claimed logs per type within the same tick to prevent race conditions
  const claimedLogsRef = useRef<Record<string, number>>({});
  const lastClaimTickRef = useRef<number>(0);

  const skillState = skills.firemaking || { xp: 0, level: 1 };
  const unlockedSlots = getUnlockedSlots(skillState.level, debugMode);
  const nextSlotLevel = getNextSlotLevel(skillState.level);

  const prevFiremakingActiveRef = useRef(false);
  useEffect(() => {
    const isFiremakingNow = !!(activeTask && activeTask.skillId === "firemaking");
    if (prevFiremakingActiveRef.current && !isFiremakingNow && !isPaused) {
      setBurningSlots([null, null, null, null, null, null]);
    }
    prevFiremakingActiveRef.current = isFiremakingNow;
  }, [activeTask, isPaused]);

  // Clear queued slots when the firemaking queue entry is removed (deleted by user)
  // or when firemaking becomes active (slots transition to burning slots display)
  useEffect(() => {
    const hasFiremakingQueued = taskQueue.some(q => q.skillId === 'firemaking');
    const isFiremakingNow = !!(activeTask && activeTask.skillId === "firemaking");
    if (!hasFiremakingQueued && !isFiremakingNow) {
      setQueuedSlots([null, null, null, null, null, null]);
    }
  }, [taskQueue, activeTask]);

  useEffect(() => {
    const loadActions = async () => {
      setActionsLoading(true);
      try {
        const res = await fetch(buildDraftQuery(`/api/game/skill-actions?skill=firemaking&t=${Date.now()}`));
        if (res.ok) {
          const data = await res.json();
          const actions: FiremakingAction[] = data
            .filter((a: any) => a.skill === "firemaking")
            .map((a: any) => ({
              id: a.id,
              name: a.name,
              itemId: a.itemId || LOG_TO_ASH_MAP[a.requiredBait] || "basic_ash",
              levelRequired: a.levelRequired,
              xpReward: a.xpReward,
              duration: a.duration,
              requiredBait: a.requiredBait,
              baitAmount: a.baitAmount || 1,
              nameTranslations: a.nameTranslations,
            }))
            .sort((a: FiremakingAction, b: FiremakingAction) => a.levelRequired - b.levelRequired);
          setFiremakingActions(actions);
        }
      } catch (error) {
        console.warn("Failed to load firemaking actions:", error);
      }
      setActionsLoading(false);
    };
    loadActions();
  }, []);

  const logItems = useMemo(() => {
    const logTypes = [
      { id: "normal_logs", level: 1 },
      { id: "oak_logs", level: 15 },
      { id: "willow_logs", level: 30 },
      { id: "maple_logs", level: 45 },
      { id: "yew_logs", level: 60 },
      { id: "magic_logs", level: 75 },
    ];

    // Count logs currently assigned to burning slots (quantity - burnedCount = remaining)
    const logsInSlots: Record<string, number> = {};
    burningSlots.forEach((slot) => {
      if (slot) {
        const remaining = (slot.quantity || 1) - (slot.burnedCount || 0);
        logsInSlots[slot.logId] = (logsInSlots[slot.logId] || 0) + remaining;
      }
    });

    // Count logs currently staged using cross-slot reservation (same algorithm as batch start)
    // This ensures displayed "available" count accurately reflects what the user can stage
    // Note: logsInSlots at this point only contains burning slot reservations
    const stagedClaimedByLog: Record<string, number> = {};
    stagedSlots.forEach((staged) => {
      if (staged) {
        const logId = staged.id;
        const inInventory = inventory[logId] || 0;
        const inBurningSlots = logsInSlots[logId] || 0; // burning slots only (not yet modified by staged)
        const alreadyStagedClaimed = stagedClaimedByLog[logId] || 0;
        const available = Math.max(0, inInventory - inBurningSlots - alreadyStagedClaimed);
        const reserved = Math.min(available, 250);
        stagedClaimedByLog[logId] = alreadyStagedClaimed + reserved;
      }
    });
    // Now apply staged claims to logsInSlots
    for (const [logId, claimed] of Object.entries(stagedClaimedByLog)) {
      logsInSlots[logId] = (logsInSlots[logId] || 0) + claimed;
    }

    if (firemakingActions.length > 0) {
      return firemakingActions.map((action) => {
        const inInventory = inventory[action.requiredBait] || 0;
        const inSlots = logsInSlots[action.requiredBait] || 0;
        return {
          id: action.requiredBait,
          name: action.name,
          quantity: Math.max(0, inInventory - inSlots),
          levelRequired: action.levelRequired,
          xpReward: action.xpReward,
          duration: action.duration,
          actionId: action.id,
          itemId: action.itemId,  // Ash output item
        };
      });
    }

    return logTypes.map((log) => {
      const inInventory = inventory[log.id] || 0;
      const inSlots = logsInSlots[log.id] || 0;
      return {
        id: log.id,
        name: getItemById(log.id)?.name || log.id,
        quantity: Math.max(0, inInventory - inSlots),
        levelRequired: log.level,
        xpReward: log.level * 2 + 10,
        duration: 4000 + log.level * 150,
        actionId: 0,
        itemId: LOG_TO_ASH_MAP[log.id] || "basic_ash",  // Use proper mapping
      };
    });
  }, [firemakingActions, inventory, burningSlots, stagedSlots]);

  const selectedLog = logItems.find((l) => l.id === selectedLogId);

  const handleSlotClick = (slotIndex: number) => {
    if (slotIndex >= unlockedSlots) return;
    const isFiremakingActive = activeTask && activeTask.skillId === "firemaking";
    if (isFiremakingActive) {
      // Active: normal slot picker behavior
      if (burningSlots[slotIndex]) return;
      setSlotPickerOpen(slotIndex);
    } else {
      // Inactive: staging mode — allow clearing or opening picker for empty staged slots
      if (stagedSlots[slotIndex]) {
        // Clear staged slot
        const updated = [...stagedSlots];
        updated[slotIndex] = null;
        setStagedSlots(updated);
      } else {
        setSlotPickerOpen(slotIndex);
      }
    }
  };

  const MAX_LOGS_PER_SLOT = 250;

  const doStartFiremaking = (log: any, slotIndex: number, durationMs?: number, slotOnly?: boolean, sharedStartTime?: number) => {
    if (isPaused) {
      setIsPaused(false);
      pausedAtRef.current = null;
    }

    const logsToAdd = Math.min(log.quantity, MAX_LOGS_PER_SLOT);
    const sameLogCount = burningSlots.filter((s) => s?.logId === log.id).length;
    const slotBonusMs = sameLogCount * 4000;
    const adjustedDuration = log.duration + slotBonusMs;

    const newSlot: BurningSlot = {
      logId: log.id,
      logName: log.name,
      startTime: sharedStartTime ?? Date.now(),
      duration: adjustedDuration,
      xpReward: log.xpReward,
      actionId: log.actionId,
      itemId: log.itemId,
      quantity: logsToAdd,
      burnedCount: 0,
    };

    const newSlots = [...burningSlots];
    newSlots[slotIndex] = newSlot;
    setBurningSlots(newSlots);

    if (slotOnly) {
      return;
    }

    if (isQueueV2 && durationMs) {
      startTaskWithDuration(
        "firemaking",
        log.actionId,
        adjustedDuration,
        log.name,
        log.xpReward,
        durationMs,
        log.id,
        1,
        undefined,
        log.itemId
      );
    } else {
      startTask(
        "firemaking",
        log.actionId,
        adjustedDuration,
        log.name,
        log.xpReward,
        log.id,
        1,
        undefined,
        log.itemId
      );
    }
  };

  const handleSelectLogForSlot = (log: LogItem, targetSlotIndex?: number) => {
    const slotIndex = targetSlotIndex ?? slotPickerOpen;
    if (slotIndex === null) return;
    if (log.quantity === 0) return;
    if (!debugMode && skillState.level < log.levelRequired) return;

    const isFiremakingActive = activeTask && activeTask.skillId === "firemaking";

    if (!isFiremakingActive) {
      // Staging mode: just record the log for this slot, no dialog yet
      const updated = [...stagedSlots];
      updated[slotIndex] = log;
      setStagedSlots(updated);
      setSlotPickerOpen(null);
      return;
    }

    // Firemaking is already active: add log immediately to this slot
    const slotOnly = isQueueV2 && !!isFiremakingActive;
    doStartFiremaking(log, slotIndex, undefined, slotOnly);

    setSlotPickerOpen(null);
  };

  // Click on log card to auto-add to first empty slot
  const handleLogCardClick = (log: LogItem) => {
    if (log.quantity === 0) return;
    if (!debugMode && skillState.level < log.levelRequired) return;

    const isFiremakingActive = activeTask && activeTask.skillId === "firemaking";

    if (isFiremakingActive) {
      // Firemaking already running: add to first empty burning slot
      const emptySlotIndex = burningSlots.findIndex((slot, idx) => slot === null && idx < unlockedSlots);
      if (emptySlotIndex === -1) {
        toast({
          title: t(language, "fm_slots_full"),
          description: t(language, "fm_slots_full_desc"),
          variant: "destructive",
        });
        return;
      }
      handleSelectLogForSlot(log, emptySlotIndex);
    } else {
      // Not active: stage to first empty staged slot
      const emptySlotIndex = stagedSlots.findIndex((slot, idx) => slot === null && idx < unlockedSlots);
      if (emptySlotIndex === -1) {
        toast({
          title: t(language, "fm_slots_full"),
          description: t(language, "fm_slots_full_desc"),
          variant: "destructive",
        });
        return;
      }
      const updated = [...stagedSlots];
      updated[emptySlotIndex] = log;
      setStagedSlots(updated);
    }
  };

  const handleClearSlot = useCallback((slotIndex: number) => {
    const newSlots = [...burningSlots];
    newSlots[slotIndex] = null;
    setBurningSlots(newSlots);
    
    const remainingActive = newSlots.filter((s) => s !== null).length;
    if (remainingActive === 0) {
      if (activeTask?.skillId === "firemaking") {
        stopTask();
      }
      setIsPaused(false);
      pausedAtRef.current = null;
    }
  }, [burningSlots, activeTask, stopTask]);

  const handlePauseAll = useCallback(() => {
    setIsPaused(true);
    pausedAtRef.current = Date.now();
    if (activeTask?.skillId === "firemaking") {
      stopTask(true);
    }
  }, [activeTask, stopTask]);

  const handleResumeAll = useCallback(() => {
    if (!pausedAtRef.current) {
      setIsPaused(false);
      return;
    }
    const pausedDuration = Date.now() - pausedAtRef.current;
    const resumed = burningSlots.map(slot => {
      if (!slot) return null;
      return { ...slot, startTime: slot.startTime + pausedDuration };
    });
    setBurningSlots(resumed);
    setIsPaused(false);
    pausedAtRef.current = null;

    const firstActive = resumed.find(s => s !== null);
    if (firstActive) {
      const logData = logItems.find(l => l.id === firstActive.logId);
      if (logData) {
        if (isQueueV2 && activeTask?.queueDurationMs) {
          const remainingMs = Math.max(0, activeTask.queueDurationMs - pausedDuration);
          startTaskWithDuration(
            "firemaking",
            logData.actionId,
            firstActive.duration,
            logData.name,
            logData.xpReward,
            remainingMs,
            logData.id,
            1,
            undefined,
            logData.itemId
          );
        } else {
          startTask(
            "firemaking",
            logData.actionId,
            firstActive.duration,
            logData.name,
            logData.xpReward,
            logData.id,
            1,
            undefined,
            logData.itemId
          );
        }
      }
    }
  }, [burningSlots, logItems, startTask, startTaskWithDuration, isQueueV2, activeTask]);

  // Handle "Start Burning" button — called after duration picker confirms
  const handleBatchStart = useCallback(async (durationMs: number | undefined, mode: 'start' | 'queue') => {
    const filled = stagedSlots.map((s, i) => ({ log: s, idx: i })).filter(({ log }) => log !== null);
    if (filled.length === 0) return;

    const sharedStartTime = Date.now();

    if (mode === 'queue') {
      // Queue path: add first staged log to queue, carry extra slots as metadata
      const first = filled[0];
      const extraSlots = filled.slice(1).map(({ log, idx }) => ({
        slotIndex: idx,
        logId: log!.id,
        logName: log!.name,
        actionId: log!.actionId,
        itemId: log!.itemId,
        xpReward: log!.xpReward,
        actionDuration: log!.duration,
      }));
      const success = await addToQueue({
        type: 'skill',
        skillId: 'firemaking',
        actionId: first.log!.actionId,
        name: first.log!.name,
        xpReward: first.log!.xpReward,
        durationMs: durationMs!,
        actionDuration: first.log!.duration,
        requiredBait: first.log!.id,
        baitAmount: 1,
        itemId: first.log!.itemId,
        firemakingPrimarySlotIndex: first.idx,
        ...(extraSlots.length > 0 ? { firemakingExtraSlots: extraSlots } : {}),
      });
      if (!success) {
        setStartBurningPickerOpen(false);
        return;
      }
      // Persist staged slots as queued slots so they remain visible while waiting
      setQueuedSlots([...stagedSlots]);
    } else {
      // Start path: build full slots array at once to avoid React batching issues
      // Compute available inventory fresh, deducting what previous slots in this batch already claimed
      const claimedByLog: Record<string, number> = {};
      const newSlots = [...burningSlots];
      filled.forEach(({ log, idx }) => {
        const logId = log!.id;
        const inInventory = inventory[logId] || 0;
        const alreadyClaimed = claimedByLog[logId] || 0;
        const available = Math.max(0, inInventory - alreadyClaimed);
        const logsToAdd = Math.min(available, MAX_LOGS_PER_SLOT);
        if (logsToAdd === 0) return; // skip if no inventory left for this log
        claimedByLog[logId] = alreadyClaimed + logsToAdd;

        const sameLogCount = newSlots.filter((s) => s?.logId === logId).length;
        const slotBonusMs = sameLogCount * 4000;
        const adjustedDuration = log!.duration + slotBonusMs;
        const newSlot: BurningSlot = {
          logId,
          logName: log!.name,
          startTime: sharedStartTime,
          duration: adjustedDuration,
          xpReward: log!.xpReward,
          actionId: log!.actionId,
          itemId: log!.itemId,
          quantity: logsToAdd,
          burnedCount: 0,
        };
        newSlots[idx] = newSlot;
      });
      setBurningSlots(newSlots);

      // Start the task using the first staged log
      const firstLog = filled[0].log!;
      if (isQueueV2 && durationMs) {
        startTaskWithDuration(
          "firemaking",
          firstLog.actionId,
          firstLog.duration,
          firstLog.name,
          firstLog.xpReward,
          durationMs,
          firstLog.id,
          1,
          undefined,
          firstLog.itemId
        );
      } else {
        startTask(
          "firemaking",
          firstLog.actionId,
          firstLog.duration,
          firstLog.name,
          firstLog.xpReward,
          firstLog.id,
          1,
          undefined,
          firstLog.itemId
        );
      }
    }

    setStagedSlots([null, null, null, null, null, null]);
    setStartBurningPickerOpen(false);
  }, [stagedSlots, burningSlots, inventory, addToQueue, setBurningSlots, startTask, startTaskWithDuration, isQueueV2]);

  const activeBurningCount = burningSlots.filter((s) => s !== null).length;
  const stagedCount = stagedSlots.filter((s) => s !== null).length;
  const isFiremakingActive = activeTask?.skillId === "firemaking";
  const hasSlotsWithLogs = activeBurningCount > 0;
  const hasOtherActiveTask = (activeTask && activeTask.skillId !== "firemaking") || !!activeCombat;
  const showStartBurning = !isFiremakingActive && stagedCount > 0 && !isPaused;

  return (
    <div className="space-y-4 pb-24">
      <div className="rounded-lg overflow-hidden border border-border p-4 bg-gradient-to-b from-slate-900 to-slate-950">
        <SkillProgressBar
          level={skillState.level}
          xp={skillState.xp}
          skillName={t(language, "firemaking")}
          icon={Fire as any}
          iconColor="text-orange-400"
          variant="full"
          showXpPerHour={isFiremakingActive}
          xpPerHour={
            isFiremakingActive && activeTask
              ? (activeTask.xpReward / (activeTask.duration / 1000)) * 3600
              : 0
          }
        />
      </div>

      <Card className="bg-gradient-to-b from-slate-900/90 to-slate-950/90 border-orange-900/30">
        <CardContent className="p-4">
          <div className="text-center mb-4">
            <h3 className="text-lg font-bold text-orange-400 flex items-center justify-center gap-2">
              <Fire className="w-5 h-5" weight="fill" />
              {t(language, "firemaking")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {isPaused && hasSlotsWithLogs
                ? t(language, "fm_logs_paused").replace("{count}", String(activeBurningCount))
                : activeBurningCount > 0
                ? t(language, "fm_logs_burning").replace("{count}", String(activeBurningCount))
                : showStartBurning
                ? t(language, "fm_staged_prompt")
                : t(language, "fm_select_log_prompt")}
            </p>
          </div>

          <div className="relative w-64 h-64 mx-auto">
            <CampfireAnimation isActive={hasSlotsWithLogs && !isPaused} />
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const staged = !isFiremakingActive ? stagedSlots[i] : null;
              const queued = !isFiremakingActive && !staged ? queuedSlots[i] : null;
              const angle = (360 / 6) * i - 90;
              const radius = 85;
              const x = Math.cos((angle * Math.PI) / 180) * radius;
              const y = Math.sin((angle * Math.PI) / 180) * radius;
              const isLocked = i >= unlockedSlots;

              if (!isFiremakingActive && staged) {
                // Show staged slot with amber style
                const logImg = getItemImage(staged.id);
                return (
                  <div
                    key={i}
                    className="absolute w-14 h-14"
                    style={{ left: `calc(50% + ${x}px - 28px)`, top: `calc(50% + ${y}px - 28px)` }}
                    data-testid={`staged-slot-${i}`}
                  >
                    <div className="w-full h-full rounded-full border-2 bg-amber-500/20 border-amber-500/50 shadow-lg shadow-amber-500/20 flex items-center justify-center relative cursor-pointer"
                      onClick={() => handleSlotClick(i)}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); const u = [...stagedSlots]; u[i] = null; setStagedSlots(u); }}
                        className="absolute -top-1 -right-1 z-20 w-5 h-5 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors shadow-md"
                        data-testid={`clear-staged-slot-${i}`}
                      >
                        <X className="w-3 h-3 text-white" weight="bold" />
                      </button>
                      <div className="flex flex-col items-center">
                        {logImg ? (
                          <img src={logImg} alt="" className="w-8 h-8 object-contain pixelated opacity-80" />
                        ) : (
                          <Flame className="w-6 h-6 text-amber-400" weight="fill" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              if (queued) {
                // Show queued slot with amber style and "Queued" label
                const logImg = getItemImage(queued.id);
                return (
                  <div
                    key={i}
                    className="absolute w-14 h-14"
                    style={{ left: `calc(50% + ${x}px - 28px)`, top: `calc(50% + ${y}px - 28px)` }}
                    data-testid={`queued-slot-${i}`}
                  >
                    <div className="w-full h-full rounded-full border-2 bg-amber-500/20 border-amber-500/50 shadow-lg shadow-amber-500/20 flex items-center justify-center relative">
                      <div className="flex flex-col items-center">
                        {logImg ? (
                          <img src={logImg} alt="" className="w-8 h-8 object-contain pixelated opacity-80" />
                        ) : (
                          <Flame className="w-6 h-6 text-amber-400" weight="fill" />
                        )}
                      </div>
                    </div>
                    <div className="absolute -bottom-5 left-0 right-0 text-center">
                      <span className="text-[9px] text-amber-400 font-mono font-bold">Queued</span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} onClick={() => !burningSlots[i] && !isLocked && !isPaused && handleSlotClick(i)}>
                  <BurningSlotComponent
                    slot={burningSlots[i]}
                    index={i}
                    totalSlots={unlockedSlots}
                    onClear={handleClearSlot}
                    isPaused={isPaused}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="bg-orange-500/10 border-orange-500/30 text-orange-400">
              {t(language, "fm_slots_open").replace("{count}", String(unlockedSlots))}
            </Badge>
            {nextSlotLevel && (
              <Badge variant="outline" className="bg-slate-700/50 border-slate-600/30">
                {t(language, "fm_next_slot").replace("{level}", String(nextSlotLevel))}
              </Badge>
            )}
          </div>

          {showStartBurning && (
            <div className="mt-4 flex justify-center">
              <Button
                size="lg"
                className="bg-orange-600 hover:bg-orange-500 text-white font-bold px-8 shadow-lg shadow-orange-900/40"
                onClick={() => {
                  if (isQueueV2) {
                    setStartBurningPickerOpen(true);
                  } else {
                    handleBatchStart(undefined, 'start');
                  }
                }}
                data-testid="btn-start-burning"
              >
                <Flame className="w-5 h-5 mr-2" weight="fill" />
                {t(language, "fm_start_burning")}
                <Badge className="ml-2 bg-white/20 text-white text-xs">{stagedCount}</Badge>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isFiremakingActive && isQueueV2 && activeTask?.queueDurationMs ? (
        <Card className="bg-orange-500/10 border-orange-500/30">
          <CardContent className="p-3">
            <QueueCountdownTimer
              startTime={activeTask.startTime}
              durationMs={activeTask.queueDurationMs}
              onStop={handlePauseAll}
            />
          </CardContent>
        </Card>
      ) : null}

      {isPaused && hasSlotsWithLogs && !isFiremakingActive && (
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Fire className="w-5 h-5 text-amber-400" />
              <span className="text-sm text-amber-300">{t(language, "fm_slots_paused").replace("{count}", String(activeBurningCount))}</span>
            </div>
            <Button
              size="sm"
              className="bg-orange-600 hover:bg-orange-500 text-white"
              onClick={handleResumeAll}
              data-testid="btn-resume-firemaking"
            >
              <Fire className="w-4 h-4 mr-1" weight="fill" />
              {t(language, "fm_resume")}
            </Button>
          </CardContent>
        </Card>
      )}

      {slotPickerOpen !== null && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70" onClick={() => setSlotPickerOpen(null)}>
          <Card className="bg-slate-900 border-orange-500/50 w-[90%] max-w-md max-h-[70vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-orange-400 flex items-center gap-2">
                  <Fire className="w-5 h-5" weight="fill" />
                  {t(language, "fm_select_log_for_slot").replace("{slot}", String(slotPickerOpen + 1))}
                </h3>
                <Button variant="ghost" size="icon" onClick={() => setSlotPickerOpen(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <ScrollArea className="h-[50vh]">
                <div className="space-y-2 pr-2">
                  {logItems.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-4">
                      {t(language, "fm_no_logs_found")}
                    </p>
                  ) : (
                    logItems.map((log) => {
                      const isLocked = !debugMode && skillState.level < log.levelRequired;
                      // Count same log type already in burning+staged slots for duration bonus preview
                      const sameLogBurning = burningSlots.filter((s) => s?.logId === log.id).length;
                      const sameLogStaged = stagedSlots.filter((s) => s?.id === log.id).length;
                      const sameLogCount = sameLogBurning + sameLogStaged;
                      const slotBonus = sameLogCount * 4;
                      const totalDuration = log.duration + slotBonus;
                      return (
                        <button
                          key={log.id}
                          disabled={isLocked || log.quantity === 0}
                          onClick={() => handleSelectLogForSlot(log)}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                            isLocked || log.quantity === 0
                              ? "opacity-50 cursor-not-allowed border-slate-700/50 bg-slate-800/30"
                              : "border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 hover:border-orange-500/50"
                          )}
                        >
                          <img
                            src={getItemImage(log.id)}
                            alt={log.name}
                            className="w-10 h-10 rounded object-contain"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {translateItemName(log.id, language as any) || log.name}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Timer className="w-3 h-3" />
                                {(totalDuration / 1000).toFixed(0)}s
                              </span>
                              <span className="text-orange-400">+{log.xpReward} XP</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline" className={cn(
                              "text-xs",
                              log.quantity > 0 ? "border-green-500/50 text-green-400" : "border-red-500/50 text-red-400"
                            )}>
                              x{formatNumber(log.quantity)}
                            </Badge>
                            {isLocked && (
                              <div className="flex items-center gap-1 text-xs text-red-400 mt-1">
                                <Lock className="w-3 h-3" />
                                Lv.{log.levelRequired}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="bg-slate-900/90 border-slate-700/50">
        <CardContent className="p-4">
          <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Fire className="w-4 h-4 text-orange-400" weight="fill" />
            {t(language, "fm_log_inventory")}
          </h4>

          {actionsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Fire className="w-8 h-8 text-orange-400 animate-pulse" weight="fill" />
            </div>
          ) : logItems.length === 0 ? (
            <div className="text-center p-4 text-muted-foreground text-sm">
              {t(language, "fm_no_logs_inventory")}
            </div>
          ) : (
            <div className={cn("grid gap-2", isMobile ? "grid-cols-1" : "grid-cols-2")}>
              {logItems.map((log) => {
                const isLocked = !debugMode && skillState.level < log.levelRequired;
                return (
                  <LogInventoryItem
                    key={log.id}
                    logId={log.id}
                    logName={log.name}
                    quantity={log.quantity}
                    levelRequired={log.levelRequired}
                    isLocked={isLocked}
                    isSelected={selectedLogId === log.id}
                    onClick={() => handleLogCardClick(log)}
                    language={language}
                  />
                );
              })}
            </div>
          )}

          {selectedLog && (
            <div className="mt-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <div className="flex items-center justify-between text-sm">
                <span className="text-orange-300">{t(language, "fm_selected_log")}</span>
                <span className="font-bold">{translateItemName(selectedLog.id, language as any) || selectedLog.name}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                <span>{t(language, "fm_burn_time")}</span>
                <span>{(selectedLog.duration / 1000).toFixed(1)}s</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>XP:</span>
                <span className="text-orange-400">+{selectedLog.xpReward}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t(language, "fm_stock")}</span>
                <span>{formatNumber(selectedLog.quantity)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                {t(language, "fm_click_empty_slot")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {isQueueV2 && startBurningPickerOpen && (
        <DurationPickerDialog
          open={startBurningPickerOpen}
          onClose={() => setStartBurningPickerOpen(false)}
          onConfirm={(durationMs) => {
            const mode = hasOtherActiveTask ? 'queue' : 'start';
            handleBatchStart(durationMs, mode);
          }}
          maxAvailableMs={maxQueueTimeMsTotal - getUsedQueueTimeMs(taskQueue, activeTask, activeCombat)}
          activityName={t(language, "firemaking")}
          mode={hasOtherActiveTask ? 'queue' : 'start'}
        />
      )}

    </div>
  );
}
