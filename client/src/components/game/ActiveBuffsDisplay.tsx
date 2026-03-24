import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { getBaseItem, isItemsLoaded } from "@/lib/items";
import { getItemImage } from "@/lib/itemImages";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Flask, Timer } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMobile } from "@/hooks/useMobile";

const EFFECT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  attack_boost: { bg: "bg-red-500/20", border: "border-red-500/50", text: "text-red-400" },
  strength_boost: { bg: "bg-orange-500/20", border: "border-orange-500/50", text: "text-orange-400" },
  defence_boost: { bg: "bg-blue-500/20", border: "border-blue-500/50", text: "text-blue-400" },
  hp_regen: { bg: "bg-green-500/20", border: "border-green-500/50", text: "text-green-400" },
  poison_immunity: { bg: "bg-emerald-500/20", border: "border-emerald-500/50", text: "text-emerald-400" },
  crit_chance: { bg: "bg-yellow-500/20", border: "border-yellow-500/50", text: "text-yellow-400" },
  damage_reduction: { bg: "bg-cyan-500/20", border: "border-cyan-500/50", text: "text-cyan-400" },
  xp_boost: { bg: "bg-violet-500/20", border: "border-violet-500/50", text: "text-violet-400" },
  maxHpBoost: { bg: "bg-pink-500/20", border: "border-pink-500/50", text: "text-pink-400" },
};

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${seconds}s`;
}

export default function ActiveBuffsDisplay() {
  const { activeBuffs } = useGame();
  const { t } = useLanguage();
  const isMobile = useMobile();
  const [, setTick] = useState(0);
  
  const EFFECT_LABELS: Record<string, string> = {
    attack_boost: t('attack'),
    strength_boost: t('strength'),
    defence_boost: t('defence'),
    hp_regen: t('hpRegen'),
    poison_immunity: t('poisonImmunity'),
    crit_chance: t('critical'),
    damage_reduction: t('damageReduction'),
    xp_boost: t('xpBonus'),
    maxHpBoost: t('maxHp') || 'Max HP',
  };
  
  useEffect(() => {
    if (activeBuffs.length === 0) return;
    
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [activeBuffs.length]);
  
  if (activeBuffs.length === 0) {
    return null;
  }
  
  const now = Date.now();
  const validBuffs = activeBuffs.filter(buff => buff.expiresAt > now);
  
  if (validBuffs.length === 0) {
    return null;
  }
  
  return (
    <div 
      className="flex gap-1.5 overflow-x-auto scrollbar-thin scrollbar-thumb-purple-500/30 scrollbar-track-transparent pb-0.5" 
      data-testid="active-buffs-display"
    >
      {validBuffs.map((buff) => {
        const potionItem = isItemsLoaded() ? getBaseItem(buff.potionId) : null;
        const potionImage = getItemImage(buff.potionId);
        const timeRemaining = buff.expiresAt - now;
        const isLowTime = timeRemaining < 30000;
        const colors = EFFECT_COLORS[buff.effectType] || { bg: "bg-violet-500/20", border: "border-violet-500/50", text: "text-violet-400" };
        
        const buffContent = (
          <div className="flex items-center gap-2 p-2">
            <div className="w-8 h-8 flex items-center justify-center">
              {potionImage ? (
                <img 
                  src={potionImage} 
                  alt={potionItem?.name || buff.potionId} 
                  className="w-8 h-8 object-contain"
                />
              ) : (
                <Flask className="w-6 h-6" weight="fill" />
              )}
            </div>
            <div>
              <div className={cn("text-sm font-medium", colors.text)}>
                {potionItem?.name || EFFECT_LABELS[buff.effectType] || buff.effectType}
              </div>
              <div className="text-xs text-muted-foreground">
                {EFFECT_LABELS[buff.effectType]} +{buff.value}%
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Timer className="w-3 h-3" />
                {formatTimeRemaining(timeRemaining)} {t('remaining')}
              </div>
            </div>
          </div>
        );

        const iconButton = (
          <button
            className={cn(
              "relative p-1.5 rounded-lg border transition-all shrink-0",
              colors.bg,
              colors.border,
              isLowTime && "animate-pulse",
              "hover:opacity-80"
            )}
            data-testid={`buff-${buff.effectType}`}
          >
            <div className="w-6 h-6 flex items-center justify-center">
              {potionImage ? (
                <img 
                  src={potionImage} 
                  alt={potionItem?.name || buff.potionId} 
                  className="w-6 h-6 object-contain"
                />
              ) : (
                <Flask className="w-5 h-5" weight="fill" />
              )}
            </div>
            <span className={cn(
              "absolute -bottom-1 -right-1 text-[8px] px-1 rounded font-medium",
              "bg-black/80",
              colors.text
            )}>
              {formatTimeRemaining(timeRemaining)}
            </span>
          </button>
        );

        if (isMobile) {
          return (
            <Popover key={`${buff.potionId}-${buff.effectType}`}>
              <PopoverTrigger asChild>
                {iconButton}
              </PopoverTrigger>
              <PopoverContent 
                side="bottom" 
                align="start"
                className={cn("w-auto min-w-[180px] bg-card/95 backdrop-blur-sm p-0", colors.border)}
              >
                {buffContent}
              </PopoverContent>
            </Popover>
          );
        }

        return (
          <TooltipProvider key={`${buff.potionId}-${buff.effectType}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                {iconButton}
              </TooltipTrigger>
              <TooltipContent 
                side="bottom" 
                className={cn("bg-card/95 backdrop-blur-sm p-0", colors.border)}
              >
                {buffContent}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}
