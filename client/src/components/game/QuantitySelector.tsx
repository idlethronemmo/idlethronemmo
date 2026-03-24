import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Infinity as InfinityIcon, Hash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { t, Language } from "@/lib/i18n";

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  language: Language;
  maxQuantity?: number;
  className?: string;
}

const QUICK_OPTIONS = [1, 5, 10, 25, 0];

export function QuantitySelector({
  value,
  onChange,
  language,
  maxQuantity,
  className,
}: QuantitySelectorProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const handleQuickSelect = (qty: number) => {
    setShowCustomInput(false);
    onChange(qty);
  };

  const handleCustomSubmit = () => {
    const num = parseInt(customValue, 10);
    if (!isNaN(num) && num >= 0) {
      const finalValue = maxQuantity && num > maxQuantity ? maxQuantity : num;
      onChange(finalValue);
      setShowCustomInput(false);
      setCustomValue("");
    }
  };

  const getButtonLabel = (qty: number) => {
    if (qty === 0) return t(language, "infinite");
    return `${qty}x`;
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_OPTIONS.map((qty) => (
          <Button
            key={qty}
            variant={value === qty && !showCustomInput ? "default" : "outline"}
            size="sm"
            onClick={() => handleQuickSelect(qty)}
            className={cn(
              "h-7 px-2.5 text-xs font-medium",
              value === qty && !showCustomInput
                ? "bg-amber-600 hover:bg-amber-700 border-amber-500"
                : "border-border/50 hover:border-amber-500/50 hover:bg-amber-500/10"
            )}
          >
            {qty === 0 ? (
              <InfinityIcon className="w-3.5 h-3.5" weight="bold" />
            ) : (
              getButtonLabel(qty)
            )}
          </Button>
        ))}
        <Button
          variant={showCustomInput ? "default" : "outline"}
          size="sm"
          onClick={() => setShowCustomInput(!showCustomInput)}
          className={cn(
            "h-7 px-2.5 text-xs font-medium",
            showCustomInput
              ? "bg-amber-600 hover:bg-amber-700 border-amber-500"
              : "border-border/50 hover:border-amber-500/50 hover:bg-amber-500/10"
          )}
        >
          <Hash className="w-3.5 h-3.5" weight="bold" />
        </Button>
      </div>
      
      {showCustomInput && (
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            max={maxQuantity}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder={t(language, "customQuantity")}
            className="h-8 text-sm bg-background/50"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCustomSubmit();
            }}
          />
          <Button
            size="sm"
            onClick={handleCustomSubmit}
            className="h-8 px-3 bg-amber-600 hover:bg-amber-700"
          >
            OK
          </Button>
        </div>
      )}
    </div>
  );
}

interface ProductionCounterProps {
  produced: number;
  target: number;
  language: Language;
  className?: string;
}

export function ProductionCounter({
  produced,
  target,
  language,
  className,
}: ProductionCounterProps) {
  const isInfinite = target === 0 || target === undefined;
  
  return (
    <div className={cn("flex items-center gap-2 text-sm", className)}>
      <span className="text-muted-foreground">
        {isInfinite ? (
          <span className="flex items-center gap-1">
            {produced}x <InfinityIcon className="w-4 h-4 text-amber-400" weight="bold" />
          </span>
        ) : (
          t(language, "produced")
            .replace("{0}", String(produced))
            .replace("{1}", String(target))
        )}
      </span>
      {!isInfinite && (
        <div className="flex-1 h-1.5 bg-background/50 rounded-full overflow-hidden min-w-[60px]">
          <div
            className="h-full bg-amber-500 rounded-full transition-all"
            style={{ width: `${Math.min(100, (produced / target) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
