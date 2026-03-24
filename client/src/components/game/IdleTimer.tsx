import { ArrowsClockwise, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

interface IdleTimerProps {
  expiresAt: number;
  onRefresh: () => void;
  onStop: () => void;
  className?: string;
  compact?: boolean;
}

export function IdleTimer({ expiresAt, onRefresh, onStop, className, compact = false }: IdleTimerProps) {
  const [remaining, setRemaining] = useState(Math.max(0, expiresAt - Date.now()));
  const { t } = useLanguage();

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, expiresAt - now);
      setRemaining(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  // Format time as HH:MM:SS
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
  const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Color based on remaining time
  const isLow = remaining < 30 * 60 * 1000; // Less than 30 min
  const isCritical = remaining < 10 * 60 * 1000; // Less than 10 min

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg bg-card/80 border border-border/50", className)}>
        <span className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          isCritical ? "text-red-400 animate-pulse" : isLow ? "text-amber-400" : "text-emerald-400"
        )}>
          {formattedTime}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onRefresh}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title={t('refreshTimer6Hours')}
            data-testid="btn-refresh-timer-compact"
          >
            <ArrowsClockwise className="w-3.5 h-3.5 text-emerald-400" weight="bold" />
          </button>
          <button
            onClick={onStop}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title={t('stopShort')}
            data-testid="btn-stop-timer-compact"
          >
            <X className="w-3.5 h-3.5 text-red-400" weight="bold" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/80 border border-border/50 backdrop-blur-sm",
      className
    )}>
      <span className={cn(
        "font-mono text-lg font-bold tracking-wide tabular-nums",
        isCritical ? "text-red-400 animate-pulse" : isLow ? "text-amber-400" : "text-emerald-400"
      )}>
        {formattedTime}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={onRefresh}
          className="p-1.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 transition-colors"
          title={t('refreshTimer6Hours')}
          data-testid="btn-refresh-timer"
        >
          <ArrowsClockwise className="w-4 h-4 text-emerald-400" weight="bold" />
        </button>
        <button
          onClick={onStop}
          className="p-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 transition-colors"
          title={t('stopTask')}
          data-testid="btn-stop-timer"
        >
          <X className="w-4 h-4 text-red-400" weight="bold" />
        </button>
      </div>
    </div>
  );
}
