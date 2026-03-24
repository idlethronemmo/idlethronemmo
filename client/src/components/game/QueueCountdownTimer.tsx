import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface QueueCountdownTimerProps {
  startTime: number;
  durationMs: number;
  onStop: () => void;
  className?: string;
  compact?: boolean;
}

export function QueueCountdownTimer({ startTime, durationMs, onStop, className, compact = false }: QueueCountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => {
    const elapsed = Date.now() - startTime;
    return Math.max(0, durationMs - elapsed);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setRemaining(Math.max(0, durationMs - elapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, durationMs]);

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
  const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const progress = Math.max(0, Math.min(100, ((durationMs - remaining) / durationMs) * 100));
  const isLow = remaining < 10 * 60 * 1000;
  const isCritical = remaining < 2 * 60 * 1000;

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg bg-card/80 border border-border/50", className)}>
        <span className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          isCritical ? "text-red-400 animate-pulse" : isLow ? "text-amber-400" : "text-emerald-400"
        )}>
          {formattedTime}
        </span>
        <button
          onClick={onStop}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          data-testid="btn-stop-timer-compact"
        >
          <X className="w-3.5 h-3.5 text-red-400" weight="bold" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/80 border border-border/50 backdrop-blur-sm",
      className
    )}>
      <div className="flex flex-col gap-1">
        <span className={cn(
          "font-mono text-lg font-bold tracking-wide tabular-nums",
          isCritical ? "text-red-400 animate-pulse" : isLow ? "text-amber-400" : "text-emerald-400"
        )}>
          {formattedTime}
        </span>
        <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all duration-1000",
              isCritical ? "bg-red-400" : isLow ? "bg-amber-400" : "bg-emerald-400"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <button
        onClick={onStop}
        className="p-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 transition-colors"
        data-testid="btn-stop-timer"
      >
        <X className="w-4 h-4 text-red-400" weight="bold" />
      </button>
    </div>
  );
}
