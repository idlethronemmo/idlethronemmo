import { useGame } from "@/context/GameContext";
import { useLocation } from "wouter";
import { getLocalizedMonsterName } from "@/lib/gameTranslations";
import type { Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/useMobile";
import { 
  Axe, 
  FishSimple, 
  Fire, 
  CookingPot, 
  Flask,
  Hammer,
  Sword,
  Heart,
  Target,
  Users,
  Skull,
  Stairs
} from "@phosphor-icons/react";
import { formatBonusPercent } from "@shared/partySynergyBonus";
import { Pickaxe } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/context/FirebaseAuthContext";
import { getMonsterById } from "@/lib/monsters";
import { COMBAT_HP_SCALE } from "@shared/schema";
import { getTotalEquipmentBonus } from "@/lib/items";
import { useLanguage } from "@/context/LanguageContext";
import { getItemImage } from "@/lib/itemImages";
import type { BurningSlot } from "@/context/GameContext";

const SKILL_ICONS: Record<string, React.ElementType> = {
  woodcutting: Axe,
  mining: Pickaxe,
  fishing: FishSimple,
  hunting: Target,
  crafting: Hammer,
  cooking: CookingPot,
  alchemy: Flask,
  firemaking: Fire,
};

const SKILL_PATHS: Record<string, string> = {
  woodcutting: "/skill/woodcutting",
  mining: "/skill/mining",
  fishing: "/skill/fishing",
  hunting: "/skill/hunting",
  crafting: "/crafting",
  cooking: "/skill/cooking",
  alchemy: "/alchemy",
  firemaking: "/skill/firemaking",
};

const SKILL_COLORS: Record<string, string> = {
  woodcutting: "text-green-400",
  mining: "text-amber-400",
  fishing: "text-blue-400",
  hunting: "text-amber-500",
  crafting: "text-orange-400",
  cooking: "text-red-400",
  alchemy: "text-purple-400",
  firemaking: "text-orange-500",
};

export default function ActiveTaskIndicator() {
  const { activeTask, activeCombat, currentHitpoints, skills, equipment, partySynergyBonuses, itemModifications, isQueueV2 } = useGame();
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const { isMobile } = useMobile();
  const progressBarRef = useRef<HTMLDivElement>(null);
  const { t, language } = useLanguage();

  const { data: dungeonRunData } = useQuery({
    queryKey: ["/api/dungeon-runs/current"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/dungeon-runs/current", {
        credentials: "include",
        headers,
      });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const activeDungeonRun = dungeonRunData?.run;

  useEffect(() => {
    if (!activeTask) {
      if (progressBarRef.current) progressBarRef.current.style.width = '0%';
      return;
    }

    const updateProgress = () => {
      if (!progressBarRef.current) return;
      const now = Date.now();
      const elapsed = now - activeTask.startTime;
      const percent = Math.min(100, (elapsed / activeTask.duration) * 100);
      progressBarRef.current.style.width = `${percent}%`;
    };

    updateProgress();
    const interval = setInterval(updateProgress, 200);
    return () => clearInterval(interval);
  }, [activeTask]);

  // Don't show on mobile (MobileTaskPuck handles this)
  if (isMobile) return null;

  // Combat indicator (priority over skill tasks)
  if (activeCombat) {
    // Don't show on combat page itself
    if (location === "/combat") return null;
    
    const monster = getMonsterById(activeCombat.monsterId);
    const monsterName = getLocalizedMonsterName(language as Language, activeCombat.monsterId);
    const monsterMaxHp = (monster?.maxHitpoints || 10) * COMBAT_HP_SCALE;
    const monsterCurrentHp = activeCombat.monsterCurrentHp;
    const monsterHpPercent = Math.max(0, Math.min(100, (monsterCurrentHp / monsterMaxHp) * 100));
    
    const hpBonus = getTotalEquipmentBonus(equipment, itemModifications).hitpointsBonus || 0;
    const hitpointsLevel = skills.hitpoints?.level || 10;
    const playerMaxHp = (hitpointsLevel * COMBAT_HP_SCALE) + hpBonus;
    const playerHpPercent = Math.max(0, Math.min(100, (currentHitpoints / playerMaxHp) * 100));

    return (
      <div 
        onClick={() => setLocation("/combat")}
        className={cn(
          isQueueV2 ? "fixed bottom-6 right-24 z-[45]" : "fixed bottom-6 right-6 z-[45]",
          "bg-card/95 border border-red-500/30 rounded-xl shadow-xl backdrop-blur-sm",
          "px-4 py-3 cursor-pointer min-w-[240px]",
          "transition-all duration-200 hover:border-red-500/50 hover:shadow-red-500/20 hover:shadow-lg"
        )}
        data-testid="active-combat-indicator-desktop"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
            <Sword className="w-5 h-5" weight="fill" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-red-400 uppercase tracking-wide mb-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              {t('combatInProgress')}
            </div>
            <div className="text-sm font-semibold text-foreground truncate mb-1.5">
              {monsterName}
            </div>
            
            {/* HP Bars */}
            <div className="space-y-1">
              {/* Player HP */}
              <div className="flex items-center gap-2">
                <Heart className="w-3 h-3 text-green-400" weight="fill" />
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{ width: `${playerHpPercent}%` }}
                  />
                </div>
                <span className="text-[10px] text-green-400 w-8 text-right">
                  {Math.round(playerHpPercent)}%
                </span>
              </div>
              
              {/* Monster HP */}
              <div className="flex items-center gap-2">
                <Sword className="w-3 h-3 text-red-400" weight="fill" />
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-red-500 transition-all duration-300"
                    style={{ width: `${monsterHpPercent}%` }}
                  />
                </div>
                <span className="text-[10px] text-red-400 w-8 text-right">
                  {Math.round(monsterHpPercent)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeDungeonRun && activeDungeonRun.status === 'active' && location !== "/dungeon-run") {
    const combatState = activeDungeonRun.dungeonCombatState;
    const dungeonName = activeDungeonRun.dungeon?.name || "Dungeon";
    const inCombat = activeDungeonRun.inCombat === 1;
    const hasValidCombatState = combatState && combatState.playerMaxHp > 0 && combatState.monsterMaxHp > 0;

    return (
      <div 
        onClick={() => setLocation("/dungeon-run")}
        className={cn(
          isQueueV2 ? "fixed bottom-6 right-24 z-[45]" : "fixed bottom-6 right-6 z-[45]",
          "bg-card/95 border border-purple-500/30 rounded-xl shadow-xl backdrop-blur-sm",
          "px-4 py-3 cursor-pointer min-w-[240px]",
          "transition-all duration-200 hover:border-purple-500/50 hover:shadow-purple-500/20 hover:shadow-lg"
        )}
        data-testid="active-dungeon-indicator-desktop"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
            <Skull className="w-5 h-5" weight="fill" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-purple-400 uppercase tracking-wide mb-0.5 flex items-center gap-1">
              {inCombat && <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />}
              {inCombat ? "Dungeon Combat" : "Dungeon Run"}
            </div>
            <div className="text-sm font-semibold text-foreground truncate mb-1">
              {dungeonName}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Stairs className="w-3 h-3" />
              <span>Floor {activeDungeonRun.currentFloor}</span>
            </div>
            {hasValidCombatState && inCombat && (
              <div className="space-y-1 mt-1.5">
                <div className="flex items-center gap-2">
                  <Heart className="w-3 h-3 text-green-400" weight="fill" />
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, (combatState.playerHp / combatState.playerMaxHp) * 100))}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Sword className="w-3 h-3 text-red-400" weight="fill" />
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-500 transition-all duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, (combatState.monsterHp / combatState.monsterMaxHp) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Skill task indicator
  if (!activeTask) return null;

  const Icon = SKILL_ICONS[activeTask.skillId] || Axe;
  const path = SKILL_PATHS[activeTask.skillId] || "/";
  const colorClass = SKILL_COLORS[activeTask.skillId] || "text-primary";

  // Don't show if already on that skill's page
  if (location === path) return null;

  const handleClick = () => {
    setLocation(path);
  };

  const hasSynergyBonus = partySynergyBonuses.membersDoingSameSkill >= 2;

  if (activeTask.skillId === "firemaking") {
    return (
      <FiremakingTaskIndicator
        handleClick={handleClick}
        hasSynergyBonus={hasSynergyBonus}
        partySynergyBonuses={partySynergyBonuses}
        t={t}
      />
    );
  }

  return (
    <div 
      onClick={handleClick}
      className={cn(
        isQueueV2 ? "fixed bottom-6 right-24 z-[45]" : "fixed bottom-6 right-6 z-[45]",
        "bg-card/95 border border-border/50 rounded-xl shadow-xl backdrop-blur-sm",
        "px-4 py-3 cursor-pointer min-w-[200px]",
        "transition-all duration-200 hover:border-primary/50 hover:shadow-primary/20 hover:shadow-lg"
      )}
      data-testid="active-task-indicator-desktop"
    >
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg bg-muted", colorClass)}>
          <Icon className="w-5 h-5" weight="fill" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
              {t('activeTask')}
            </div>
            {hasSynergyBonus && (
              <div 
                className="flex items-center gap-1 text-[10px] text-cyan-400 bg-cyan-500/15 px-1.5 py-0.5 rounded-full"
                title={`Party Synergy: ${partySynergyBonuses.membersDoingSameSkill} members • Speed +${formatBonusPercent(partySynergyBonuses.speedBonus)}${partySynergyBonuses.xpBonus > 0 ? ` • XP +${formatBonusPercent(partySynergyBonuses.xpBonus)}` : ''}`}
              >
                <Users className="w-2.5 h-2.5" weight="fill" />
                <span>{partySynergyBonuses.membersDoingSameSkill}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground truncate">
              {activeTask.name}
            </span>
            <span className="text-xs text-primary font-medium shrink-0">
              +{activeTask.xpReward} XP
            </span>
          </div>
          <div className="relative h-1.5 mt-2 w-full overflow-hidden rounded-full bg-primary/20">
            <div ref={progressBarRef} className="h-full bg-primary transition-[width] duration-200 rounded-full" style={{ width: '0%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FiremakingSlotCircle({ slot }: { slot: BurningSlot }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 200);
    return () => clearInterval(interval);
  }, []);

  const now = Date.now();
  const progress = Math.min(1, Math.max(0, (now - slot.startTime) / slot.duration));
  const size = 28;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  const logImg = getItemImage(slot.logId);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
        className="absolute inset-0"
      >
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#334155" strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#f97316" strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-150"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {logImg ? (
          <img src={logImg} alt="" className="w-[18px] h-[18px] rounded-full object-cover pixelated" />
        ) : (
          <Fire className="w-3.5 h-3.5 text-orange-400" weight="fill" />
        )}
      </div>
    </div>
  );
}

function FiremakingTaskIndicator({
  handleClick,
  hasSynergyBonus,
  partySynergyBonuses,
  t,
}: {
  handleClick: () => void;
  hasSynergyBonus: boolean;
  partySynergyBonuses: { membersDoingSameSkill: number; speedBonus: number; xpBonus: number };
  t: (key: any) => string;
}) {
  const { firemakingSlots, isQueueV2 } = useGame();
  const activeSlots = firemakingSlots.filter((s): s is BurningSlot => s !== null);

  return (
    <div
      onClick={handleClick}
      className={cn(
        isQueueV2 ? "fixed bottom-6 right-24 z-[45]" : "fixed bottom-6 right-6 z-[45]",
        "bg-card/95 border border-orange-500/30 rounded-xl shadow-xl backdrop-blur-sm",
        "px-3 py-2.5 cursor-pointer",
        "transition-all duration-200 hover:border-orange-500/50 hover:shadow-orange-500/20 hover:shadow-lg"
      )}
      data-testid="active-task-indicator-desktop"
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-orange-500/20 text-orange-500">
          <Fire className="w-4 h-4" weight="fill" />
        </div>
        <div className="flex items-center gap-1.5">
          {activeSlots.map((slot, i) => (
            <FiremakingSlotCircle key={i} slot={slot} />
          ))}
        </div>
        {hasSynergyBonus && (
          <div
            className="flex items-center gap-1 text-[10px] text-cyan-400 bg-cyan-500/15 px-1.5 py-0.5 rounded-full"
            title={`Party Synergy: ${partySynergyBonuses.membersDoingSameSkill} members`}
          >
            <Users className="w-2.5 h-2.5" weight="fill" />
            <span>{partySynergyBonuses.membersDoingSameSkill}</span>
          </div>
        )}
      </div>
    </div>
  );
}
