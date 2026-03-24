import { cn } from "@/lib/utils";

interface DurabilityBarProps {
  durability: number;
  size?: "xs" | "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const sizeStyles = {
  xs: { height: "h-1", rounded: "rounded-full" },
  sm: { height: "h-1.5", rounded: "rounded-full" },
  md: { height: "h-2", rounded: "rounded-full" },
  lg: { height: "h-2.5", rounded: "rounded-full" },
};

export function DurabilityBar({ 
  durability, 
  size = "sm", 
  showLabel = false,
  className 
}: DurabilityBarProps) {
  const { height, rounded } = sizeStyles[size];
  
  const getBarColor = (dur: number) => {
    if (dur > 50) return "bg-gradient-to-r from-emerald-500 to-green-400";
    if (dur >= 25) return "bg-gradient-to-r from-amber-500 to-yellow-400";
    return "bg-gradient-to-r from-red-600 to-red-400";
  };
  
  const getGlowColor = (dur: number) => {
    if (dur > 50) return "shadow-[0_0_6px_rgba(52,211,153,0.5)]";
    if (dur >= 25) return "shadow-[0_0_6px_rgba(251,191,36,0.5)]";
    return "shadow-[0_0_6px_rgba(239,68,68,0.5)]";
  };
  
  const getTextColor = (dur: number) => {
    if (dur > 50) return "text-emerald-400";
    if (dur >= 25) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn(
        "flex-1 bg-black/50 backdrop-blur-sm overflow-hidden border border-white/10",
        height,
        rounded
      )}>
        <div 
          className={cn(
            "h-full transition-all duration-300 ease-out",
            rounded,
            getBarColor(durability),
            getGlowColor(durability)
          )}
          style={{ width: `${Math.max(durability, 0)}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn(
          "text-xs font-bold tabular-nums min-w-[36px] text-right",
          getTextColor(durability)
        )}>
          {Math.floor(durability)}%
        </span>
      )}
    </div>
  );
}

export function DurabilityBarMini({ durability }: { durability: number }) {
  const getBarColor = (dur: number) => {
    if (dur > 50) return "bg-gradient-to-r from-emerald-500 to-green-400";
    if (dur >= 25) return "bg-gradient-to-r from-amber-500 to-yellow-400";
    return "bg-gradient-to-r from-red-600 to-red-400";
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60 backdrop-blur-sm z-30 overflow-hidden rounded-b">
      <div 
        className={cn(
          "h-full transition-all duration-300 ease-out",
          getBarColor(durability),
          "shadow-[0_0_4px_rgba(0,0,0,0.3)]"
        )}
        style={{ width: `${Math.max(durability, 0)}%` }}
      />
    </div>
  );
}

export default DurabilityBar;
