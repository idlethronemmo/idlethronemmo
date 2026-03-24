import { Coins } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/gameMath";

type GoldDisplaySize = "xs" | "sm" | "md" | "lg";

interface GoldDisplayProps {
  amount: number;
  size?: GoldDisplaySize;
  label?: string;
  showSign?: boolean;
  className?: string;
  iconClassName?: string;
}

const sizeConfig: Record<GoldDisplaySize, { icon: string; text: string }> = {
  xs: { icon: "w-3 h-3", text: "text-xs" },
  sm: { icon: "w-4 h-4", text: "text-sm" },
  md: { icon: "w-5 h-5", text: "text-base" },
  lg: { icon: "w-6 h-6", text: "text-lg" },
};

export function GoldDisplay({
  amount,
  size = "sm",
  label,
  showSign = false,
  className,
  iconClassName,
}: GoldDisplayProps) {
  const config = sizeConfig[size];
  const displayAmount = showSign && amount > 0 ? `+${formatNumber(amount)}` : formatNumber(amount);

  return (
    <div className={cn("flex items-center gap-1 text-yellow-400", className)}>
      <Coins 
        className={cn(config.icon, iconClassName)} 
        weight="fill" 
      />
      {label && <span className={cn(config.text, "text-muted-foreground mr-1")}>{label}</span>}
      <span className={cn(config.text, "font-bold")} data-testid="gold-amount">
        {displayAmount}
      </span>
    </div>
  );
}

export function GoldBadge({
  amount,
  size = "sm",
  className,
}: {
  amount: number;
  size?: GoldDisplaySize;
  className?: string;
}) {
  const config = sizeConfig[size];
  
  return (
    <div className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-400",
      className
    )}>
      <Coins className={config.icon} weight="fill" />
      <span className={cn(config.text, "font-bold")}>{formatNumber(amount)}</span>
    </div>
  );
}

export function GoldPrice({
  price,
  originalPrice,
  size = "sm",
  className,
}: {
  price: number;
  originalPrice?: number;
  size?: GoldDisplaySize;
  className?: string;
}) {
  const config = sizeConfig[size];
  const hasDiscount = originalPrice && originalPrice > price;
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center gap-1 text-yellow-400">
        <Coins className={config.icon} weight="fill" />
        <span className={cn(config.text, "font-bold")}>{formatNumber(price)}</span>
      </div>
      {hasDiscount && (
        <span className={cn(config.text, "text-muted-foreground line-through")}>
          {formatNumber(originalPrice)}
        </span>
      )}
    </div>
  );
}
