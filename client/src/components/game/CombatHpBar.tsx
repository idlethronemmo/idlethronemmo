import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface CombatHpBarProps {
  current: number;
  max: number;
  label?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  barClassName?: string;
  shake?: boolean;
  children?: React.ReactNode;
}

const SIZE_MAP = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

function getHpColor(percent: number): string {
  if (percent > 50) return "bg-green-500";
  if (percent > 25) return "bg-yellow-500";
  return "bg-red-500";
}

function getHpBarBg(percent: number): string {
  if (percent > 50) return "bg-green-950/50";
  if (percent > 25) return "bg-yellow-950/50";
  return "bg-red-950/50";
}

function getHpTextColor(percent: number): string {
  if (percent > 50) return "text-green-400";
  if (percent > 25) return "text-yellow-400";
  return "text-red-400";
}

export function CombatHpBar({
  current,
  max,
  label,
  showText = true,
  size = 'md',
  className,
  barClassName,
  shake = false,
  children,
}: CombatHpBarProps) {
  const percent = max > 0 ? (current / max) * 100 : 0;
  const textColor = getHpTextColor(percent);

  return (
    <div
      className={cn(
        "space-y-1 transition-colors duration-300",
        shake && "animate-shake",
        className
      )}
      data-testid="combat-hp-bar"
    >
      {showText && (
        <div className="flex justify-between items-center text-xs">
          {label && (
            <span className={cn("flex items-center gap-1 font-medium", textColor)}>
              {label}
            </span>
          )}
          <span className={cn("font-medium", textColor)}>
            {current}/{max}
          </span>
        </div>
      )}
      <Progress
        value={Math.max(0, Math.min(100, percent))}
        className={cn(
          SIZE_MAP[size],
          "transition-all duration-300",
          getHpBarBg(percent),
          barClassName
        )}
        indicatorClassName={cn(
          "transition-all duration-300",
          getHpColor(percent)
        )}
      />
      {children}
    </div>
  );
}
