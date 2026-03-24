import { ItemSlot } from "@/components/game/ItemSlot";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Flask,
  Timer,
  PlayCircle,
  Lock,
  Check,
  X,
  Clock,
  Star,
  ListPlus,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useGame } from "@/context/GameContext";
import { getLevelProgress, formatNumber } from "@/lib/gameMath";
import { SkillProgressBar } from "@/components/game/SkillProgressBar";
import {
  getRecipesForSkillAndRegion,
  getItemById,
  Recipe,
  isItemsLoaded,
  translateItemDescription,
  translateItemName,
  PotionEffect,
  preloadItemSources,
  getItemSourcesSync,
  formatSkillName,
} from "@/lib/items";
import { getLocalizedMonsterName } from "@/lib/gameTranslations";
import { getItemImage } from "@/lib/itemImages";
import { useState, useEffect } from "react";
import { useMobile } from "@/hooks/useMobile";
import { useToast } from "@/hooks/use-toast";
import { useAudio } from "@/context/AudioContext";
import { useLanguage } from "@/context/LanguageContext";
import { t, Language } from "@/lib/i18n";
import { QuantitySelector, ProductionCounter } from "@/components/game/QuantitySelector";
import { AddToQueueDialog } from "@/components/game/QueueDialog";
import { DurationPickerDialog } from "@/components/game/DurationPickerDialog";
import { QueueCountdownTimer } from "@/components/game/QueueCountdownTimer";
import { getUsedQueueTimeMs } from "@shared/schema";

function AlchemyAnimation({ itemImage, size = "lg", isAnimating = true }: { itemImage?: string; size?: "sm" | "md" | "lg"; isAnimating?: boolean }) {
  const isSmall = size === "sm";
  const isMedium = size === "md";
  return (
    <div className={cn("relative mx-auto", isSmall ? "w-14 h-16" : isMedium ? "w-20 h-24 sm:w-24 sm:h-28 md:w-28 md:h-32" : "w-40 h-44 my-4")}>
      <div className={cn("absolute left-1/2 -translate-x-1/2 rounded-full blur-xl", isAnimating ? "bg-violet-500/20 alchemy-glow" : "bg-stone-700/10", isSmall ? "bottom-0 w-10 h-10" : isMedium ? "bottom-0 w-16 h-16" : "bottom-0 w-24 h-24")} />
      <div className={cn("absolute left-1/2 -translate-x-1/2 flex flex-col items-center", isSmall ? "bottom-1" : isMedium ? "bottom-2" : "bottom-4")}>
        <div className={cn("rounded-t-lg border-violet-500/50", isAnimating ? "bg-gradient-to-b from-violet-300 to-violet-400" : "bg-gradient-to-b from-stone-400 to-stone-500", isSmall ? "w-3 h-1.5 border" : isMedium ? "w-5 h-2.5 border" : "w-8 h-4 border-2")} />
        <div className={cn("border-violet-500/50", isAnimating ? "bg-gradient-to-b from-violet-300/80 to-violet-400/80" : "bg-gradient-to-b from-stone-400/80 to-stone-500/80", isSmall ? "w-1.5 h-2 border-x" : isMedium ? "w-2.5 h-4 border-x" : "w-4 h-6 border-x-2")} />
        <div className={cn("rounded-b-full border-violet-500/40 relative overflow-hidden", isAnimating ? "bg-gradient-to-b from-violet-900/60 via-purple-800/50 to-violet-900/60" : "bg-gradient-to-b from-stone-800/60 via-stone-700/50 to-stone-800/60", isSmall ? "w-8 h-10 border" : isMedium ? "w-14 h-16 border" : "w-20 h-24 border-2")}>
          <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent", isAnimating ? "from-violet-500/50 via-purple-500/40 alchemy-liquid" : "from-stone-600/30", isSmall ? "h-6" : isMedium ? "h-10" : "h-16")} />
          {isAnimating && (
            <>
              <div className="alchemy-bubble alchemy-bubble-1" />
              <div className="alchemy-bubble alchemy-bubble-2" />
              {(isMedium || size === "lg") && <div className="alchemy-bubble alchemy-bubble-3" />}
              {size === "lg" && <div className="alchemy-bubble alchemy-bubble-4" />}
            </>
          )}
          {itemImage && (
            <img src={itemImage} alt="" className={cn("absolute inset-0 m-auto object-contain pixelated z-10", isSmall ? "w-4 h-4" : isMedium ? "w-7 h-7" : "w-10 h-10")} style={{ mixBlendMode: 'multiply' }} />
          )}
        </div>
      </div>
      {isAnimating && (isMedium || size === "lg") && (
        <>
          <div className="alchemy-sparkle alchemy-sparkle-1" />
          <div className="alchemy-sparkle alchemy-sparkle-2" />
          <div className="alchemy-sparkle alchemy-sparkle-3" />
          {size === "lg" && <div className="alchemy-sparkle alchemy-sparkle-4" />}
          {size === "lg" && <div className="alchemy-sparkle alchemy-sparkle-5" />}
        </>
      )}
      <style>{`
        .alchemy-glow {
          animation: alchemyGlow 3s ease-in-out infinite;
        }
        .alchemy-liquid {
          animation: alchemyLiquid 2s ease-in-out infinite;
        }
        .alchemy-bubble {
          position: absolute;
          background: rgba(200, 150, 255, 0.6);
          border-radius: 50%;
        }
        .alchemy-bubble-1 {
          width: 5px;
          height: 5px;
          animation: alchBubble 1.4s ease-in-out infinite;
          left: 25%;
          bottom: 8px;
        }
        .alchemy-bubble-2 {
          width: 4px;
          height: 4px;
          animation: alchBubble 1.8s ease-in-out infinite 0.4s;
          left: 50%;
          bottom: 6px;
        }
        .alchemy-bubble-3 {
          width: 6px;
          height: 6px;
          animation: alchBubble 1.6s ease-in-out infinite 0.8s;
          left: 65%;
          bottom: 10px;
        }
        .alchemy-bubble-4 {
          width: 3px;
          height: 3px;
          animation: alchBubble 1.5s ease-in-out infinite 1.2s;
          left: 40%;
          bottom: 5px;
        }
        .alchemy-sparkle {
          position: absolute;
          width: 4px;
          height: 4px;
          background: #e9d5ff;
          border-radius: 50%;
          filter: blur(0.5px);
        }
        .alchemy-sparkle-1 {
          animation: sparkle1 2.5s ease-in-out infinite;
          top: 20%;
          left: 20%;
        }
        .alchemy-sparkle-2 {
          animation: sparkle2 3s ease-in-out infinite 0.5s;
          top: 30%;
          right: 18%;
        }
        .alchemy-sparkle-3 {
          animation: sparkle3 2.2s ease-in-out infinite 1s;
          top: 50%;
          left: 12%;
        }
        .alchemy-sparkle-4 {
          animation: sparkle4 2.8s ease-in-out infinite 1.5s;
          top: 40%;
          right: 10%;
        }
        .alchemy-sparkle-5 {
          animation: sparkle5 2.4s ease-in-out infinite 0.8s;
          top: 60%;
          right: 25%;
        }
        @keyframes alchemyGlow {
          0%, 100% { background: rgba(139, 92, 246, 0.2); transform: scale(1); }
          50% { background: rgba(168, 85, 247, 0.35); transform: scale(1.1); }
        }
        @keyframes alchemyLiquid {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        @keyframes alchBubble {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0; }
          10% { opacity: 0.7; }
          90% { opacity: 0.5; }
          100% { transform: translateY(-40px) scale(0.5); opacity: 0; }
        }
        @keyframes sparkle1 {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes sparkle2 {
          0%, 100% { opacity: 0; transform: scale(0.5) rotate(0deg); }
          50% { opacity: 0.9; transform: scale(1.1) rotate(180deg); }
        }
        @keyframes sparkle3 {
          0%, 100% { opacity: 0; transform: translateY(0) scale(0.5); }
          50% { opacity: 1; transform: translateY(-5px) scale(1.3); }
        }
        @keyframes sparkle4 {
          0%, 100% { opacity: 0; transform: scale(0.6); }
          50% { opacity: 0.85; transform: scale(1); }
        }
        @keyframes sparkle5 {
          0%, 100% { opacity: 0; transform: scale(0.4) translateX(0); }
          50% { opacity: 0.95; transform: scale(1.1) translateX(3px); }
        }
      `}</style>
    </div>
  );
}

function getPotionTier(recipe: Recipe): string {
  if (recipe.levelRequired >= 70) return "master";
  if (recipe.levelRequired >= 50) return "expert";
  if (recipe.levelRequired >= 30) return "advanced";
  if (recipe.levelRequired >= 15) return "intermediate";
  return "beginner";
}

function getTierColors(tier: string): {
  bg: string;
  border: string;
  text: string;
  glow: string;
} {
  switch (tier) {
    case "master":
      return {
        bg: "bg-red-500/20",
        border: "border-red-500/50",
        text: "text-red-400",
        glow: "shadow-red-500/30",
      };
    case "expert":
      return {
        bg: "bg-purple-500/20",
        border: "border-purple-500/50",
        text: "text-purple-400",
        glow: "shadow-purple-500/30",
      };
    case "advanced":
      return {
        bg: "bg-blue-500/20",
        border: "border-blue-500/50",
        text: "text-blue-400",
        glow: "shadow-blue-500/30",
      };
    case "intermediate":
      return {
        bg: "bg-green-500/20",
        border: "border-green-500/50",
        text: "text-green-400",
        glow: "shadow-green-500/30",
      };
    default:
      return {
        bg: "bg-violet-500/20",
        border: "border-violet-500/50",
        text: "text-violet-400",
        glow: "shadow-violet-500/30",
      };
  }
}

function formatPotionEffect(effect: PotionEffect, duration: number | undefined, language: Language): string {
  const effectTypeToKey: Record<PotionEffect["type"], string> = {
    attack_boost: "attackBonusEffect",
    strength_boost: "strengthBonusEffect",
    defence_boost: "defenceBonusEffect",
    hp_regen: "hpRegenEffect",
    poison_immunity: "poisonImmunityEffect",
    crit_chance: "critChanceEffect",
    damage_reduction: "damageReductionEffect",
    xp_boost: "xpBoostEffect",
    maxHpBoost: "maxHp",
  };

  const effectName = t(language, effectTypeToKey[effect.type] as any) || effect.type;
  
  let valueStr = "";
  if (effect.type === "poison_immunity") {
    valueStr = "";
  } else if (effect.type === "hp_regen") {
    valueStr = `+${effect.value} HP/${t(language, 'seconds')}`;
  } else {
    valueStr = `+${effect.value}%`;
  }

  let durationStr = "";
  if (duration) {
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    if (minutes > 0 && seconds === 0) {
      durationStr = `${minutes} ${t(language, 'minutes')}`;
    } else if (minutes > 0) {
      durationStr = `${minutes}${t(language, 'minutes')} ${seconds}${t(language, 'seconds')}`;
    } else {
      durationStr = `${seconds}${t(language, 'seconds')}`;
    }
  }

  if (valueStr && durationStr) {
    return `${effectName} ${valueStr} (${durationStr})`;
  } else if (valueStr) {
    return `${effectName} ${valueStr}`;
  } else if (durationStr) {
    return `${effectName} (${durationStr})`;
  }
  return effectName;
}

function ActiveAlchemyPanel({
  activeTask,
  onStop,
  alchemyRecipes,
  language,
  isQueueV2 = false,
}: {
  activeTask: any;
  onStop: () => void;
  isQueueV2?: boolean;
  alchemyRecipes: Recipe[];
  language: Language;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!activeTask?.skillId || activeTask.skillId !== "alchemy") return;

    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [activeTask]);

  if (!activeTask?.skillId || activeTask.skillId !== "alchemy") return null;

  const activeRecipe = alchemyRecipes.find((r) => r.resultItemId === activeTask.name);
  const activeItem = activeRecipe
    ? getItemById(activeRecipe.resultItemId)
    : null;
  const progressPercent = activeTask.startTime
    ? Math.min(100, ((now - activeTask.startTime) / activeTask.duration) * 100)
    : 0;
  const remainingMs = activeTask.startTime
    ? Math.max(0, activeTask.duration - (now - activeTask.startTime))
    : activeTask.duration;
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  return (
    <div
      className="mb-3 p-3 rounded-lg bg-violet-500/10 border border-violet-500/30"
      data-testid="active-alchemy-panel"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center border border-violet-500/40 animate-pulse">
          <Flask className="w-6 h-6 text-violet-400" weight="fill" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-violet-400 truncate">
              {activeItem?.name || activeTask.name}
            </span>
            <span className="text-xs text-violet-400 font-mono">
              {remainingSeconds}{t(language, 'seconds')}
            </span>
          </div>
          <Progress value={progressPercent} className="h-1.5 bg-violet-900/50" />
        </div>
        <button
          onClick={onStop}
          className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400"
          data-testid="button-stop-active-alchemy"
        >
          <X className="w-4 h-4" weight="bold" />
        </button>
      </div>
      
      {isQueueV2 && activeTask.queueDurationMs ? (
        <div className="mt-2 pt-2 border-t border-violet-500/20">
          <QueueCountdownTimer
            startTime={activeTask.startTime}
            durationMs={activeTask.queueDurationMs}
            onStop={onStop}
          />
        </div>
      ) : null}
    </div>
  );
}

function RecipeCard({
  recipe,
  isSelected,
  onClick,
  canCraft,
  skillLevel,
  inventory,
  debugMode = false,
}: {
  recipe: Recipe;
  isSelected: boolean;
  onClick: () => void;
  canCraft: boolean;
  skillLevel: number;
  inventory: Record<string, number>;
  debugMode?: boolean;
}) {
  const { language } = useLanguage();
  const item = getItemById(recipe.resultItemId);
  const tier = getPotionTier(recipe);
  const colors = getTierColors(tier);
  const isLocked = !debugMode && skillLevel < recipe.levelRequired;
  const itemImg = getItemImage(recipe.resultItemId);

  return (
    <button
      onClick={() => !isLocked && onClick()}
      disabled={isLocked}
      className={cn(
        "w-full p-2 rounded-lg border transition-all text-left",
        isSelected && !isLocked
          ? `${colors.bg} ${colors.border} shadow-lg ${colors.glow}`
          : "bg-card/50 border-border/50",
        !isLocked && "hover:bg-card/80",
        isLocked && "opacity-40 cursor-not-allowed"
      )}
      data-testid={`recipe-card-${recipe.id}`}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center border",
            isLocked ? "bg-zinc-800/50 border-zinc-700" : `${colors.bg} ${colors.border}`
          )}
        >
          {isLocked ? (
            <Lock className="w-[70%] h-[70%] text-zinc-500" weight="bold" />
          ) : itemImg ? (
            <img src={itemImg} alt={item?.name} className="w-[90%] h-[90%] object-contain pixelated" />
          ) : (
            <Flask className={cn("w-[70%] h-[70%]", colors.text)} weight="fill" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className={cn("text-sm font-medium truncate", isLocked ? "text-muted-foreground" : colors.text)}>
              {item?.name || recipe.resultItemId}
            </span>
            {canCraft && !isLocked && (
              <Check className="w-4 h-4 text-green-400 shrink-0" weight="bold" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t(language, 'level')} {recipe.levelRequired}</span>
            <span>•</span>
            <span>{Math.round(recipe.craftTime / 1000)}{t(language, 'seconds')}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function RecipeDetails({
  recipe,
  onCraft,
  onQueue,
  canCraft,
  skillLevel,
  inventory,
  isActive,
  debugMode = false,
  targetQuantity,
  producedCount,
}: {
  recipe: Recipe;
  onCraft: (quantity: number) => void;
  onQueue: (recipe: Recipe, quantity?: number) => void;
  canCraft: boolean;
  skillLevel: number;
  inventory: Record<string, number>;
  isActive: boolean;
  debugMode?: boolean;
  targetQuantity?: number;
  producedCount?: number;
}) {
  const { language } = useLanguage();
  const { isMobile } = useMobile();
  const [selectedQuantity, setSelectedQuantity] = useState(0);
  const item = getItemById(recipe.resultItemId);
  const tier = getPotionTier(recipe);
  const colors = getTierColors(tier);
  const isLocked = !debugMode && skillLevel < recipe.levelRequired;
  const itemImg = getItemImage(recipe.resultItemId);
  
  const maxCraftable = debugMode ? 999 : Math.min(
    ...recipe.materials.map(mat => Math.floor((inventory[mat.itemId] || 0) / mat.quantity))
  );

  return (
    <Card className={cn("border overflow-hidden", colors.border, colors.bg)}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3 mb-3">
              <div
                className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center border-2 shrink-0",
                  colors.border,
                  colors.bg
                )}
              >
                {itemImg ? (
                  <img src={itemImg} alt={item?.name} className="w-[90%] h-[90%] object-contain pixelated" />
                ) : (
                  <Flask className={cn("w-[70%] h-[70%]", colors.text)} weight="fill" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={cn("text-base font-bold leading-tight", colors.text)}>
                  {translateItemName(recipe.resultItemId, language)}
                </h3>
                {item?.effect && (
                  <p className="text-xs text-emerald-400 mt-0.5">
                    <Flask className="w-3 h-3 inline mr-1" weight="fill" />
                    {formatPotionEffect(item.effect, item.duration, language)}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1 text-xs flex-wrap">
                  <Badge variant="outline" className={cn("text-xs py-0", colors.text)}>
                    <Star className="w-3 h-3 mr-1" weight="fill" />
                    {recipe.xpReward} {t(language, 'xp')}
                  </Badge>
                  <Badge variant="outline" className="text-xs py-0 text-muted-foreground">
                    <Clock className="w-3 h-3 mr-1" />
                    {Math.round(recipe.craftTime / 1000)}{t(language, 'seconds')}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="mb-3">
              <h4 className="text-xs font-medium text-muted-foreground mb-1.5">{t(language, 'materials')}</h4>
              <TooltipProvider>
                <div className="flex flex-wrap gap-1.5">
                  {recipe.materials.map((mat) => {
                    const matItem = getItemById(mat.itemId);
                    const owned = inventory[mat.itemId] || 0;
                    const hasEnough = debugMode || owned >= mat.quantity;
                    const matImg = getItemImage(mat.itemId);
                    
                    const materialContent = (
                      <div className="flex flex-col items-center cursor-pointer">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-lg border-2 flex items-center justify-center",
                            hasEnough ? "bg-green-500/10 border-green-500/40" : "bg-red-500/10 border-red-500/40"
                          )}
                        >
                          {matImg ? (
                            <img src={matImg} alt={matItem?.name} className="w-[90%] h-[90%] object-contain pixelated" />
                          ) : (
                            <ItemSlot itemName={matItem?.name || mat.itemId} itemId={mat.itemId} size="xs" />
                          )}
                        </div>
                        <span className={cn(
                          "text-[10px] font-bold mt-0.5",
                          hasEnough ? "text-green-400" : "text-red-400"
                        )}>
                          {owned}/{mat.quantity}
                        </span>
                      </div>
                    );
                    
                    return isMobile ? (
                      <Popover key={mat.itemId}>
                        <PopoverTrigger asChild>
                          {materialContent}
                        </PopoverTrigger>
                        <PopoverContent side="top" className="w-auto p-2 bg-zinc-900 border-zinc-700 text-white max-w-[200px]">
                          <p className="font-medium text-white text-sm">{translateItemName(mat.itemId, language)}</p>
                          {(() => {
                            const sources = getItemSourcesSync(mat.itemId);
                            if (sources.length === 0) return null;
                            return (
                              <div className="mt-1 space-y-0.5">
                                {sources.slice(0, 3).map((source, idx) => (
                                  <div key={idx} className="flex items-center gap-1 text-[10px]">
                                    <span>{source.type === 'gathering' ? '⛏️' : source.type === 'monster_drop' ? '💀' : source.type === 'crafting' ? '🔨' : source.type === 'dungeon_drop' ? '🏰' : '🏪'}</span>
                                    <span className="text-zinc-400">
                                      {source.type === 'gathering' ? (language === 'tr' ? `${formatSkillName(source.skill || '', language)} ile topla` : `Gather with ${formatSkillName(source.skill || '', language)}`) :
                                       source.type === 'monster_drop' ? (language === 'tr' ? `${getLocalizedMonsterName(language, source.detail)} düşürür` : `Dropped by ${getLocalizedMonsterName(language, source.detail)}`) :
                                       source.type === 'crafting' ? (language === 'tr' ? `${formatSkillName(source.skill || '', language)} ile üret` : `Craft with ${formatSkillName(source.skill || '', language)}`) :
                                       source.type === 'dungeon_drop' ? (language === 'tr' ? `${source.detail} Zindanı` : `${source.detail} Dungeon`) :
                                       (language === 'tr' ? 'NPC Dükkanı' : 'NPC Shop')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <Tooltip key={mat.itemId}>
                        <TooltipTrigger asChild>
                          {materialContent}
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-zinc-900 border-zinc-700 text-white max-w-[200px]">
                          <p className="font-medium text-white">{translateItemName(mat.itemId, language)}</p>
                          {(() => {
                            const sources = getItemSourcesSync(mat.itemId);
                            if (sources.length === 0) return null;
                            return (
                              <div className="mt-1 space-y-0.5">
                                {sources.slice(0, 3).map((source, idx) => (
                                  <div key={idx} className="flex items-center gap-1 text-[10px]">
                                    <span>{source.type === 'gathering' ? '⛏️' : source.type === 'monster_drop' ? '💀' : source.type === 'crafting' ? '🔨' : source.type === 'dungeon_drop' ? '🏰' : '🏪'}</span>
                                    <span className="text-zinc-400">
                                      {source.type === 'gathering' ? (language === 'tr' ? `${formatSkillName(source.skill || '', language)} ile topla` : `Gather with ${formatSkillName(source.skill || '', language)}`) :
                                       source.type === 'monster_drop' ? (language === 'tr' ? `${getLocalizedMonsterName(language, source.detail)} düşürür` : `Dropped by ${getLocalizedMonsterName(language, source.detail)}`) :
                                       source.type === 'crafting' ? (language === 'tr' ? `${formatSkillName(source.skill || '', language)} ile üret` : `Craft with ${formatSkillName(source.skill || '', language)}`) :
                                       source.type === 'dungeon_drop' ? (language === 'tr' ? `${source.detail} Zindanı` : `${source.detail} Dungeon`) :
                                       (language === 'tr' ? 'NPC Dükkanı' : 'NPC Shop')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </div>

            {isLocked ? (
              <div className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700 text-center">
                <Lock className="w-4 h-4 text-zinc-500 mx-auto mb-0.5" weight="bold" />
                <span className="text-xs text-zinc-500">{t(language, 'level')} {recipe.levelRequired} {t(language, 'levelRequired')}</span>
              </div>
            ) : isActive ? (
              <div className="space-y-2">
                <div className="p-2 rounded-lg bg-violet-500/20 border border-violet-500/40 text-center">
                  <span className="text-sm text-violet-400">{t(language, 'brewingPotion')}</span>
                </div>
                {targetQuantity !== undefined && (
                  <ProductionCounter
                    produced={producedCount || 0}
                    target={targetQuantity}
                    language={language}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t(language, 'quantity')}</div>
                  <QuantitySelector
                    value={selectedQuantity}
                    onChange={setSelectedQuantity}
                    language={language}
                    maxQuantity={maxCraftable}
                  />
                  {maxCraftable > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t(language, 'canCraft')}: {maxCraftable}x
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => onCraft(selectedQuantity)}
                    disabled={!canCraft}
                    className="flex-1 md:flex-none md:px-8"
                    data-testid="button-craft-1"
                  >
                    <PlayCircle className="w-4 h-4 mr-2" />
                    {selectedQuantity === 0 
                      ? t(language, 'brew')
                      : t(language, 'craftXItems').replace('{0}', String(selectedQuantity))
                    }
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onQueue(recipe, selectedQuantity)}
                    className="shrink-0"
                    data-testid="button-queue-recipe"
                  >
                    <ListPlus className="w-5 h-5 text-amber-400" weight="bold" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="hidden sm:flex w-32 md:w-44 lg:w-52 shrink-0 items-center justify-center">
            <AlchemyAnimation 
              itemImage={isActive ? getItemImage(recipe.resultItemId) : undefined} 
              size="lg" 
              isAnimating={isActive} 
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AlchemyPage() {
  const { skills, inventory, activeTask, startTask, stopTask, debugMode, currentRegion, activeCombat, taskQueue, isQueueV2, maxQueueTimeMsTotal, startTaskWithDuration, addToQueue, removeFromQueue } = useGame();
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [queueDialogRecipe, setQueueDialogRecipe] = useState<Recipe | null>(null);
  const [durationPickerRecipe, setDurationPickerRecipe] = useState<Recipe | null>(null);
  const [durationPickerMode, setDurationPickerMode] = useState<'start' | 'queue'>('start');
  const { isMobile } = useMobile();
  const { toast } = useToast();
  const { language } = useLanguage();
  const { playAmbient, stopAmbient } = useAudio();

  useEffect(() => {
    if (activeTask?.skillId === 'alchemy') {
      playAmbient('alchemy');
    } else {
      stopAmbient();
    }
    return () => { stopAmbient(); };
  }, [activeTask, playAmbient, stopAmbient]);

  useEffect(() => {
    preloadItemSources();
  }, []);

  const alchemyRecipes = getRecipesForSkillAndRegion("alchemy", currentRegion);
  const sortedRecipes = [...alchemyRecipes].sort((a, b) => a.levelRequired - b.levelRequired);

  const alchemyLevel = skills.alchemy?.level || 0;
  const alchemyXp = skills.alchemy?.xp || 0;
  const levelProgress = getLevelProgress(alchemyXp);

  const isRecipeLocked = (recipe: Recipe) => !debugMode && alchemyLevel < recipe.levelRequired;

  const canCraftRecipe = (recipe: Recipe): boolean => {
    if (!debugMode && alchemyLevel < recipe.levelRequired) return false;
    return debugMode || recipe.materials.every((mat) => (inventory[mat.itemId] || 0) >= mat.quantity);
  };

  const handleCraft = (recipe: Recipe, targetQuantity: number) => {
    if (isQueueV2) {
      if (targetQuantity > 0) {
        const FIFTEEN_MIN = 15 * 60 * 1000;
        const requestedMs = targetQuantity * recipe.craftTime;
        const roundedMs = Math.ceil(requestedMs / FIFTEEN_MIN) * FIFTEEN_MIN;
        const remainingMs = maxQueueTimeMsTotal - getUsedQueueTimeMs(taskQueue, activeTask, activeCombat);
        const effectiveMs = Math.floor(Math.min(roundedMs, remainingMs) / FIFTEEN_MIN) * FIFTEEN_MIN;
        if (effectiveMs < FIFTEEN_MIN) {
          toast({ title: 'Not enough time budget remaining', variant: 'destructive' });
          return;
        }
        addToQueue({
          type: 'skill',
          skillId: 'alchemy',
          recipeId: recipe.id,
          name: recipe.resultItemId,
          xpReward: recipe.xpReward,
          durationMs: effectiveMs,
          actionDuration: recipe.craftTime,
          materials: recipe.materials,
          targetQuantity,
        });
        return;
      }
      setDurationPickerMode('queue');
      setDurationPickerRecipe(recipe);
      return;
    }
    startTask(
      "alchemy",
      0,
      recipe.craftTime,
      recipe.resultItemId,
      recipe.xpReward,
      undefined,
      undefined,
      recipe.materials,
      undefined,
      targetQuantity,
    );
  };

  const handleStopTask = () => {
    stopTask();
  };

  const isActiveRecipe = (recipe: Recipe) => {
    return activeTask?.skillId === "alchemy" && activeTask?.name === recipe.resultItemId;
  };

  useEffect(() => {
    if (!selectedRecipe && sortedRecipes.length > 0) {
      const firstUnlocked = sortedRecipes.find(r => !isRecipeLocked(r));
      if (firstUnlocked) {
        setSelectedRecipe(firstUnlocked);
      }
    }
  }, [sortedRecipes, selectedRecipe, alchemyLevel, debugMode]);

  if (!isItemsLoaded()) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Flask className="w-12 h-12 text-violet-400 animate-pulse mx-auto mb-2" weight="fill" />
          <p className="text-muted-foreground">{t(language, 'loadingAlchemyRecipes')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", isMobile ? "pb-24" : "h-full")}>
      <div className="p-4 border-b border-border/50 bg-card/30">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center border border-violet-500/40">
            <Flask className="w-6 h-6 text-violet-400" weight="fill" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-violet-400">{t(language, 'alchemy')}</h1>
            <p className="text-xs text-muted-foreground">
              {t(language, 'brewPotionsAndTonics')}
            </p>
          </div>
        </div>
        <SkillProgressBar level={alchemyLevel} xp={alchemyXp} variant="compact" progressClassName="bg-violet-900/50" />
      </div>

      <ActiveAlchemyPanel activeTask={activeTask} onStop={handleStopTask} alchemyRecipes={alchemyRecipes} language={language} isQueueV2={isQueueV2} />


      <div className={cn("flex-1 flex overflow-hidden", isMobile && "flex-col-reverse")}>
        <div className={cn("border-r border-border/50", isMobile ? "h-1/2 border-r-0 border-t" : "w-1/3")}>
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {sortedRecipes.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  isSelected={selectedRecipe?.id === recipe.id}
                  onClick={() => setSelectedRecipe(recipe)}
                  canCraft={canCraftRecipe(recipe)}
                  skillLevel={alchemyLevel}
                  inventory={inventory}
                  debugMode={debugMode}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className={cn("flex-1 overflow-auto", isMobile ? "h-1/2" : "")}>
          <div className="p-4">
            {selectedRecipe ? (
              <RecipeDetails
                recipe={selectedRecipe}
                onCraft={(qty) => handleCraft(selectedRecipe, qty)}
                onQueue={(recipe, qty) => {
                  if (isQueueV2) {
                    const remainingMs = maxQueueTimeMsTotal - getUsedQueueTimeMs(taskQueue, activeTask, activeCombat);
                    const durationMs = (qty && qty > 0)
                      ? Math.min(qty * recipe.craftTime, Math.max(remainingMs, recipe.craftTime))
                      : Math.max(remainingMs, recipe.craftTime);
                    addToQueue({
                      type: 'skill',
                      skillId: 'alchemy',
                      recipeId: recipe.id,
                      name: recipe.resultItemId,
                      xpReward: recipe.xpReward,
                      durationMs,
                      actionDuration: recipe.craftTime,
                      materials: recipe.materials,
                    });
                  } else {
                    setQueueDialogRecipe(recipe);
                  }
                }}
                canCraft={canCraftRecipe(selectedRecipe)}
                skillLevel={alchemyLevel}
                inventory={inventory}
                isActive={isActiveRecipe(selectedRecipe)}
                debugMode={debugMode}
                targetQuantity={activeTask?.skillId === "alchemy" && activeTask?.name === selectedRecipe.resultItemId ? activeTask.targetQuantity : undefined}
                producedCount={activeTask?.skillId === "alchemy" && activeTask?.name === selectedRecipe.resultItemId ? activeTask.producedCount : undefined}
              />
            ) : (
              <div className="text-center text-muted-foreground py-8">
                {t(language, 'selectPotionRecipe')}
              </div>
            )}
          </div>
        </div>
      </div>

      {queueDialogRecipe && (
        <AddToQueueDialog
          open={!!queueDialogRecipe}
          onClose={() => setQueueDialogRecipe(null)}
          queueItem={{
            type: 'skill',
            skillId: 'alchemy',
            recipeId: queueDialogRecipe.id,
            name: queueDialogRecipe.resultItemId,
            xpReward: queueDialogRecipe.xpReward,
            actionDuration: queueDialogRecipe.craftTime,
            materials: queueDialogRecipe.materials,
          }}
        />
      )}

      {isQueueV2 && durationPickerRecipe && (
        <DurationPickerDialog
          open={!!durationPickerRecipe}
          onClose={() => setDurationPickerRecipe(null)}
          onConfirm={(durationMs) => {
            const recipe = durationPickerRecipe;
            addToQueue({
              type: 'skill',
              skillId: 'alchemy',
              recipeId: recipe.id,
              name: recipe.resultItemId,
              xpReward: recipe.xpReward,
              durationMs,
              actionDuration: recipe.craftTime,
              materials: recipe.materials,
            });
            setDurationPickerRecipe(null);
          }}
          maxAvailableMs={maxQueueTimeMsTotal - getUsedQueueTimeMs(taskQueue, activeTask, activeCombat)}
          activityName={translateItemName(durationPickerRecipe.resultItemId, language)}
          mode={durationPickerMode}
          taskQueue={taskQueue}
          onRemoveFromQueue={removeFromQueue}
        />
      )}
    </div>
  );
}
