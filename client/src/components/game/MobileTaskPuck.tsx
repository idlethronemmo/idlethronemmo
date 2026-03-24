import { useGame } from "@/context/GameContext";
import { useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { getItemImage } from "@/lib/itemImages";
import { 
  Axe, 
  FishSimple, 
  Fire, 
  CookingPot, 
  Flask,
  Hammer,
  Sword,
  Target,
  Users,
  Clock
} from "@phosphor-icons/react";
import { Pickaxe } from "lucide-react";
import { getMonsterById } from "@/lib/monsters";
import { cn } from "@/lib/utils";
import { COMBAT_HP_SCALE, getUsedQueueTimeMs } from "@shared/schema";

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
  woodcutting: "#22c55e",
  mining: "#f59e0b",
  fishing: "#3b82f6",
  hunting: "#f59e0b",
  crafting: "#f97316",
  cooking: "#ef4444",
  alchemy: "#a855f7",
  firemaking: "#f97316",
  combat: "#dc2626",
};

interface ActiveEngagement {
  type: "skill" | "combat";
  icon: React.ElementType;
  progress: number;
  color: string;
  route: string;
}

function useActiveEngagement(): ActiveEngagement | null {
  const { activeTask, activeCombat } = useGame();
  const [skillProgress, setSkillProgress] = useState(0);

  useEffect(() => {
    if (!activeTask) {
      setSkillProgress(0);
      return;
    }

    const updateProgress = () => {
      const now = Date.now();
      const elapsed = now - activeTask.startTime;
      const percent = Math.min(1, Math.max(0, elapsed / activeTask.duration));
      setSkillProgress(percent);
    };

    updateProgress();
    const interval = setInterval(updateProgress, 100);
    return () => clearInterval(interval);
  }, [activeTask]);

  return useMemo(() => {
    if (activeCombat) {
      const monster = getMonsterById(activeCombat.monsterId);
      const maxHp = (monster?.maxHitpoints || 10) * COMBAT_HP_SCALE;
      const currentHp = activeCombat.monsterCurrentHp;
      const progress = Math.min(1, Math.max(0, 1 - (currentHp / maxHp)));
      
      return {
        type: "combat",
        icon: Sword,
        progress,
        color: SKILL_COLORS.combat,
        route: "/combat",
      };
    }

    if (activeTask) {
      return {
        type: "skill",
        icon: SKILL_ICONS[activeTask.skillId] || Axe,
        progress: skillProgress,
        color: SKILL_COLORS[activeTask.skillId] || "#eab308",
        route: SKILL_PATHS[activeTask.skillId] || "/",
      };
    }

    return null;
  }, [activeCombat, activeTask, skillProgress]);
}

interface MobileTaskPuckProps {
  className?: string;
  style?: React.CSSProperties;
  onQueueBadgeClick?: () => void;
}

function formatRemainingTime(ms: number): string {
  if (ms <= 0) return "0m";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.ceil((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h${minutes > 0 ? minutes + 'm' : ''}`;
  return `${minutes}m`;
}

export default function MobileTaskPuck({ className, style, onQueueBadgeClick }: MobileTaskPuckProps) {
  const [, setLocation] = useLocation();
  const { partySynergyBonuses, activeTask, firemakingSlots: contextFiremakingSlots, taskQueue, isQueueV2, activeCombat, maxQueueTimeMsTotal } = useGame();
  const engagement = useActiveEngagement();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isQueueV2 || taskQueue.length === 0) return;
    const interval = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(interval);
  }, [isQueueV2, taskQueue.length]);

  const isFiremaking = activeTask?.skillId === "firemaking";

  if (!engagement) return null;

  const { icon: Icon, progress, color, route } = engagement;
  const hasSynergyBonus = engagement.type === "skill" && partySynergyBonuses.membersDoingSameSkill >= 2;

  const handleClick = () => {
    if (isQueueV2) {
      onQueueBadgeClick?.();
      return;
    }
    setLocation(route);
  };

  const activeSlots = isFiremaking ? contextFiremakingSlots.filter((s): s is NonNullable<typeof s> => s !== null) : [];

  if (isFiremaking && activeSlots.length > 0) {
    return (
      <FiremakingMobilePuck
        activeSlots={activeSlots}
        onClick={handleClick}
        hasSynergyBonus={hasSynergyBonus}
        className={className}
        style={style}
      />
    );
  }

  const size = 56;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference * (1 - progress);

  return (
    <button
      onClick={handleClick}
      className={cn(
        "relative flex items-center justify-center",
        "w-14 h-14",
        "bg-background border-2 border-border rounded-full",
        "shadow-lg transition-transform active:scale-95",
        className
      )}
      style={{ 
        boxShadow: `0 0 12px ${color}40`,
        ...style
      }}
      data-testid="mobile-task-puck"
    >
      <svg
        className="absolute inset-0"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={progressOffset}
          className="transition-all duration-150"
        />
      </svg>
      
      <div 
        className="relative z-10"
        style={{ color }}
      >
        <Icon className="w-6 h-6" weight="fill" />
      </div>
      
      {hasSynergyBonus && (
        <div className="absolute -top-1 -right-1 z-20 flex items-center justify-center w-4 h-4 bg-cyan-500 rounded-full border border-background">
          <Users className="w-2.5 h-2.5 text-white" weight="fill" />
        </div>
      )}
      {taskQueue.length > 0 && (
        <div
          className="absolute -bottom-1 -right-1 z-20 flex items-center gap-0.5 bg-amber-500 rounded-full border-2 border-background cursor-pointer px-1.5 h-5"
          data-testid="badge-queue-count"
          onClick={(e) => { e.stopPropagation(); onQueueBadgeClick?.(); }}
        >
          {isQueueV2 ? (
            <>
              <Clock className="w-2.5 h-2.5 text-white" weight="bold" />
              <span className="text-[9px] font-bold text-white">
                {formatRemainingTime(maxQueueTimeMsTotal - getUsedQueueTimeMs(taskQueue, activeTask, activeCombat))}
              </span>
            </>
          ) : (
            <>
              <span className="text-[9px] text-white">{taskQueue[0].type === 'combat' ? '⚔️' : '🔧'}</span>
              <span className="text-[10px] font-bold text-white">{taskQueue.length}</span>
            </>
          )}
        </div>
      )}
    </button>
  );
}

function FiremakingMobilePuck({ 
  activeSlots, 
  onClick, 
  hasSynergyBonus,
  className,
  style,
}: { 
  activeSlots: NonNullable<ReturnType<typeof useGame>['firemakingSlots'][number]>[];
  onClick: () => void;
  hasSynergyBonus: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 200);
    return () => clearInterval(interval);
  }, []);

  const slotCount = activeSlots.length;
  const slotSize = 22;
  const strokeWidth = 2.5;
  const slotR = (slotSize - strokeWidth) / 2;
  const slotCircumference = 2 * Math.PI * slotR;
  const puckSize = slotCount <= 2 ? 56 : 64;
  const center = puckSize / 2;
  const orbitRadius = slotCount === 1 ? 0 : slotCount <= 3 ? 14 : 17;

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center",
        slotCount <= 2 ? "w-14 h-14" : "w-16 h-16",
        "bg-background border-2 border-orange-500/40 rounded-full",
        "shadow-lg transition-transform active:scale-95",
        className
      )}
      style={{ 
        boxShadow: `0 0 12px #f9731640`,
        ...style
      }}
      data-testid="mobile-task-puck"
    >
      <svg
        className="absolute inset-0"
        width={puckSize}
        height={puckSize}
        viewBox={`0 0 ${puckSize} ${puckSize}`}
      >
        {activeSlots.map((slot, i) => {
          const now = Date.now();
          const slotProgress = Math.min(1, Math.max(0, (now - slot.startTime) / slot.duration));
          const slotOffset = slotCircumference * (1 - slotProgress);
          const logImg = getItemImage(slot.logId);
          const imgSize = slotSize - 6;

          let cx: number, cy: number;
          if (slotCount === 1) {
            cx = center;
            cy = center;
          } else {
            const angle = (i / slotCount) * 2 * Math.PI - Math.PI / 2;
            cx = center + Math.cos(angle) * orbitRadius;
            cy = center + Math.sin(angle) * orbitRadius;
          }

          return (
            <g key={i}>
              <clipPath id={`fm-puck-clip-${i}`}>
                <circle cx={cx} cy={cy} r={slotR - 1} />
              </clipPath>
              {logImg && (
                <image
                  href={logImg}
                  x={cx - imgSize / 2}
                  y={cy - imgSize / 2}
                  width={imgSize}
                  height={imgSize}
                  clipPath={`url(#fm-puck-clip-${i})`}
                  style={{ imageRendering: 'pixelated' }}
                />
              )}
              <g style={{ transform: `rotate(-90deg)`, transformOrigin: `${cx}px ${cy}px` }}>
                <circle cx={cx} cy={cy} r={slotR} fill="none" stroke="#334155" strokeWidth={strokeWidth} opacity={0.5} />
                <circle
                  cx={cx} cy={cy} r={slotR}
                  fill="none"
                  stroke="#f97316"
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={slotCircumference}
                  strokeDashoffset={slotOffset}
                />
              </g>
            </g>
          );
        })}
      </svg>
      
      {hasSynergyBonus && (
        <div className="absolute -top-1 -right-1 z-20 flex items-center justify-center w-4 h-4 bg-cyan-500 rounded-full border border-background">
          <Users className="w-2.5 h-2.5 text-white" weight="fill" />
        </div>
      )}
    </button>
  );
}
