import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getXpForLevel, getLevelProgress, formatNumber } from "@/lib/gameMath";
import { useLanguage } from "@/context/LanguageContext";
import { t } from "@/lib/i18n";
import { ComponentType } from "react";

function formatTimeToLevel(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface SkillProgressBarProps {
  level: number;
  xp: number;
  skillName?: string;
  icon?: ComponentType<{ className?: string; weight?: string }>;
  iconColor?: string;
  variant?: "compact" | "full" | "badge" | "inline";
  showXpPerHour?: boolean;
  xpPerHour?: number;
  className?: string;
  progressClassName?: string;
}

export function SkillProgressBar({
  level,
  xp,
  skillName,
  icon: Icon,
  iconColor = "text-primary",
  variant = "compact",
  showXpPerHour = false,
  xpPerHour = 0,
  className,
  progressClassName,
}: SkillProgressBarProps) {
  const { language } = useLanguage();
  
  const nextLevelXp = getXpForLevel(level + 1);
  const currentLevelXp = getXpForLevel(level);
  const progressPercent = getLevelProgress(xp);
  const xpInCurrentLevel = xp - currentLevelXp;
  const xpNeededForLevel = nextLevelXp - currentLevelXp;
  const xpRemaining = nextLevelXp - xp;
  const timeToLevelSec = xpPerHour > 0 ? (xpRemaining / xpPerHour) * 3600 : 0;

  if (variant === "badge") {
    return (
      <Badge variant="secondary" className={cn("text-xs", className)}>
        {t(language, 'level')} {level}
      </Badge>
    );
  }

  if (variant === "inline") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {Icon && <Icon className={cn("w-4 h-4", iconColor)} weight="bold" />}
        <span className="text-sm font-medium">{t(language, 'level')} {level}</span>
        <Progress value={progressPercent} className={cn("h-2 flex-1", progressClassName)} />
        <span className="text-xs text-muted-foreground" title={`${xpInCurrentLevel.toLocaleString()} / ${xpNeededForLevel.toLocaleString()}`}>
          {formatNumber(xpInCurrentLevel)}/{formatNumber(xpNeededForLevel)}
        </span>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("space-y-1", className)}>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {Icon && <Icon className={cn("w-4 h-4", iconColor)} weight="bold" />}
            <span className="font-medium">{t(language, 'level')} {level}</span>
          </div>
          <span className="text-muted-foreground text-xs" title={`${xp.toLocaleString()} / ${nextLevelXp.toLocaleString()} XP`}>
            {formatNumber(xp)} / {formatNumber(nextLevelXp)} {t(language, 'xp')}
          </span>
        </div>
        <Progress value={progressPercent} className={cn("h-2", progressClassName)} />
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="p-2 bg-black/50 rounded-lg border border-white/10">
            <Icon className={cn("w-6 h-6", iconColor)} weight="bold" />
          </div>
        )}
        <div className="flex-1">
          {skillName && (
            <h3 className="text-lg font-display font-bold">{skillName}</h3>
          )}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-white/10 border-white/20 text-[10px] py-0">
              {t(language, 'level')} {level}
            </Badge>
            <span className="text-muted-foreground text-[10px] cursor-help" title={`${xp.toLocaleString()} / ${nextLevelXp.toLocaleString()} XP\n${t(language, 'remaining') || 'Remaining'}: ${xpRemaining.toLocaleString()} XP`}>
              {xp.toLocaleString()} / {nextLevelXp.toLocaleString()} {t(language, 'xp')}
            </span>
          </div>
        </div>
        {showXpPerHour && (
          <div className="text-right bg-black/50 px-2 py-1 rounded-lg">
            <div className="text-[9px] text-muted-foreground uppercase">{t(language, 'xpPerHour')}</div>
            <div className="text-sm font-bold text-green-400 font-mono" title={`${Math.round(xpPerHour).toLocaleString()} XP/h`}>
              {formatNumber(xpPerHour)}
            </div>
            {timeToLevelSec > 0 && (
              <div className="text-[9px] text-cyan-400 font-mono mt-0.5" title={`${t(language, 'remaining') || 'Remaining'}: ${xpRemaining.toLocaleString()} XP`}>
                {formatTimeToLevel(timeToLevelSec)}
              </div>
            )}
          </div>
        )}
      </div>
      <Progress value={progressPercent} className={cn("h-2 bg-white/10", progressClassName)} />
    </div>
  );
}

export function SkillLevelBadge({
  level,
  skillName,
  icon: Icon,
  iconColor = "text-primary",
  className,
}: {
  level: number;
  skillName?: string;
  icon?: ComponentType<{ className?: string; weight?: string }>;
  iconColor?: string;
  className?: string;
}) {
  const { language } = useLanguage();
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {Icon && <Icon className={cn("w-4 h-4", iconColor)} weight="bold" />}
      {skillName && <span className="text-sm font-medium">{skillName}</span>}
      <Badge variant="secondary" className="text-xs">
        {t(language, 'level')} {level}
      </Badge>
    </div>
  );
}
