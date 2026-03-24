import { ItemSlot } from "@/components/game/ItemSlot";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  CookingPot,
  Timer,
  PlayCircle,
  Lock,
  Check,
  X,
  Clock,
  Star,
  Heart,
  Fire,
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
  preloadItemSources,
  getItemSourcesSync,
  formatSkillName,
} from "@/lib/items";
import { getLocalizedMonsterName } from "@/lib/gameTranslations";
import { getFoodById } from "@/lib/foods";
import { getItemImage } from "@/lib/itemImages";
import { useState, useEffect } from "react";
import { useMobile } from "@/hooks/useMobile";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/LanguageContext";
import { useAudio } from "@/context/AudioContext";
import { t, Language } from "@/lib/i18n";
import { QuantitySelector, ProductionCounter } from "@/components/game/QuantitySelector";
import { AddToQueueDialog } from "@/components/game/QueueDialog";
import { DurationPickerDialog } from "@/components/game/DurationPickerDialog";
import { QueueCountdownTimer } from "@/components/game/QueueCountdownTimer";
import { getUsedQueueTimeMs } from "@shared/schema";

function CookingAnimation({ itemImage, size = "lg", isAnimating = true }: { itemImage?: string; size?: "sm" | "md" | "lg"; isAnimating?: boolean }) {
  const isSmall = size === "sm";
  const isMedium = size === "md";
  return (
    <div className={cn("relative mx-auto", isSmall ? "w-16 h-16" : isMedium ? "w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32" : "w-40 h-40 my-4")}>
      {isAnimating && (
        <div className={cn("absolute left-1/2 -translate-x-1/2 flex flex-col items-center", isSmall ? "bottom-0.5" : isMedium ? "bottom-1" : "bottom-2")}>
          <div className={cn("cooking-flame cooking-flame-1", isSmall && "!w-2 !h-4", isMedium && "!w-4 !h-6")} />
          <div className={cn("cooking-flame cooking-flame-2", isSmall && "!w-1.5 !h-3 !left-[-6px]", isMedium && "!w-3 !h-5 !left-[-10px]")} />
          <div className={cn("cooking-flame cooking-flame-3", isSmall && "!w-1.5 !h-3 !right-[-5px]", isMedium && "!w-3 !h-5 !right-[-8px]")} />
        </div>
      )}
      {!isAnimating && (
        <div className={cn("absolute left-1/2 -translate-x-1/2 flex flex-col items-center", isSmall ? "bottom-0.5" : isMedium ? "bottom-1" : "bottom-2")}>
          <div className={cn("w-5 h-2 bg-gradient-to-t from-stone-600 to-stone-500 rounded-full opacity-40", isMedium && "w-6 h-3")} />
        </div>
      )}
      <div className={cn("absolute left-1/2 -translate-x-1/2 rounded-full blur-xl", isAnimating ? "bg-orange-500/30 animate-pulse" : "bg-stone-700/20", isSmall ? "bottom-1 w-8 h-8" : isMedium ? "bottom-2 w-16 h-16" : "bottom-6 w-20 h-20")} />
      <div className={cn("absolute left-1/2 -translate-x-1/2 bg-gradient-to-t from-stone-700 via-stone-600 to-stone-500 rounded-b-full border-stone-800 flex items-center justify-center overflow-hidden", isSmall ? "bottom-2 w-10 h-7 border-2" : isMedium ? "bottom-3 w-16 h-12 border-2" : "bottom-8 w-24 h-16 border-4")}>
        <div className={cn("absolute inset-0 bg-gradient-to-t to-transparent", isAnimating ? "from-orange-600/40" : "from-stone-600/20")} />
        {isAnimating && (
          <>
            <div className="cooking-bubble cooking-bubble-1" />
            <div className="cooking-bubble cooking-bubble-2" />
            <div className="cooking-bubble cooking-bubble-3" />
          </>
        )}
        {itemImage && (
          <img src={itemImage} alt="" className={cn("object-contain pixelated relative z-10", isAnimating && "animate-pulse", isSmall ? "w-4 h-4" : isMedium ? "w-8 h-8" : "w-10 h-10")} style={{ mixBlendMode: 'multiply' }} />
        )}
      </div>
      {isAnimating && (size === "lg" || isMedium) && (
        <div className={cn("absolute left-1/2 -translate-x-1/2 flex gap-2", isMedium ? "bottom-[58px]" : "bottom-[85px]")}>
          <div className="cooking-steam cooking-steam-1" />
          <div className="cooking-steam cooking-steam-2" />
          <div className="cooking-steam cooking-steam-3" />
        </div>
      )}
      <style>{`
        .cooking-flame {
          position: absolute;
          border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
          filter: blur(1px);
        }
        .cooking-flame-1 {
          width: 20px;
          height: 32px;
          background: linear-gradient(to top, #f97316, #fbbf24, #fef3c7);
          animation: cookFlicker1 0.3s ease-in-out infinite alternate;
          bottom: 0;
        }
        .cooking-flame-2 {
          width: 14px;
          height: 24px;
          background: linear-gradient(to top, #ea580c, #f97316, #fbbf24);
          animation: cookFlicker2 0.4s ease-in-out infinite alternate;
          bottom: 2px;
          left: -12px;
        }
        .cooking-flame-3 {
          width: 14px;
          height: 22px;
          background: linear-gradient(to top, #dc2626, #ea580c, #f97316);
          animation: cookFlicker3 0.35s ease-in-out infinite alternate;
          bottom: 2px;
          right: -10px;
        }
        .cooking-bubble {
          position: absolute;
          background: rgba(255, 200, 150, 0.6);
          border-radius: 50%;
        }
        .cooking-bubble-1 {
          width: 6px;
          height: 6px;
          animation: bubble1 1.2s ease-in-out infinite;
          left: 30%;
        }
        .cooking-bubble-2 {
          width: 4px;
          height: 4px;
          animation: bubble2 1.5s ease-in-out infinite 0.3s;
          left: 55%;
        }
        .cooking-bubble-3 {
          width: 5px;
          height: 5px;
          animation: bubble3 1.3s ease-in-out infinite 0.6s;
          left: 70%;
        }
        .cooking-steam {
          width: 8px;
          height: 16px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          filter: blur(2px);
        }
        .cooking-steam-1 {
          animation: steam1 2s ease-out infinite;
        }
        .cooking-steam-2 {
          animation: steam2 2.2s ease-out infinite 0.5s;
        }
        .cooking-steam-3 {
          animation: steam3 1.8s ease-out infinite 1s;
        }
        @keyframes cookFlicker1 {
          0% { transform: scaleY(1) scaleX(1) translateY(0); opacity: 1; }
          100% { transform: scaleY(1.1) scaleX(0.95) translateY(-2px); opacity: 0.9; }
        }
        @keyframes cookFlicker2 {
          0% { transform: scaleY(1) scaleX(1) rotate(-5deg); opacity: 0.8; }
          100% { transform: scaleY(1.15) scaleX(0.9) rotate(5deg); opacity: 1; }
        }
        @keyframes cookFlicker3 {
          0% { transform: scaleY(1) scaleX(1) rotate(3deg); opacity: 0.85; }
          100% { transform: scaleY(1.08) scaleX(0.92) rotate(-3deg); opacity: 0.95; }
        }
        @keyframes bubble1 {
          0%, 100% { transform: translateY(0); opacity: 0; }
          20% { opacity: 0.8; }
          80% { opacity: 0.6; }
          100% { transform: translateY(-20px); opacity: 0; }
        }
        @keyframes bubble2 {
          0%, 100% { transform: translateY(0); opacity: 0; }
          20% { opacity: 0.7; }
          80% { opacity: 0.5; }
          100% { transform: translateY(-18px); opacity: 0; }
        }
        @keyframes bubble3 {
          0%, 100% { transform: translateY(0); opacity: 0; }
          20% { opacity: 0.75; }
          80% { opacity: 0.55; }
          100% { transform: translateY(-22px); opacity: 0; }
        }
        @keyframes steam1 {
          0% { transform: translateY(0) scale(1); opacity: 0.4; }
          100% { transform: translateY(-30px) scale(1.5); opacity: 0; }
        }
        @keyframes steam2 {
          0% { transform: translateY(0) scale(1) translateX(0); opacity: 0.35; }
          100% { transform: translateY(-35px) scale(1.4) translateX(5px); opacity: 0; }
        }
        @keyframes steam3 {
          0% { transform: translateY(0) scale(1) translateX(0); opacity: 0.38; }
          100% { transform: translateY(-28px) scale(1.3) translateX(-5px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function getFoodTier(recipe: Recipe): string {
  if (recipe.levelRequired >= 75) return "master";
  if (recipe.levelRequired >= 45) return "advanced";
  if (recipe.levelRequired >= 20) return "intermediate";
  return "basic";
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
        bg: "bg-purple-500/20",
        border: "border-purple-500/50",
        text: "text-purple-400",
        glow: "shadow-purple-500/30",
      };
    case "advanced":
      return {
        bg: "bg-red-500/20",
        border: "border-red-500/50",
        text: "text-red-400",
        glow: "shadow-red-500/30",
      };
    case "intermediate":
      return {
        bg: "bg-orange-500/20",
        border: "border-orange-500/50",
        text: "text-orange-400",
        glow: "shadow-orange-500/30",
      };
    default:
      return {
        bg: "bg-amber-500/20",
        border: "border-amber-500/50",
        text: "text-amber-400",
        glow: "shadow-amber-500/30",
      };
  }
}

function ActiveCookingPanel({
  activeTask,
  onStop,
  cookingRecipes,
  language,
  isQueueV2 = false,
}: {
  activeTask: any;
  onStop: () => void;
  isQueueV2?: boolean;
  cookingRecipes: Recipe[];
  language: Language;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!activeTask?.skillId || activeTask.skillId !== "cooking") return;

    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [activeTask]);

  if (!activeTask?.skillId || activeTask.skillId !== "cooking") return null;

  const activeRecipe = cookingRecipes.find((r) => r.resultItemId === activeTask.name);
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
  const itemImg = getItemImage(activeTask.name);

  return (
    <div
      className="mb-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/30"
      data-testid="active-cooking-panel"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center border border-orange-500/40 animate-pulse relative">
          {itemImg ? (
            <img src={itemImg} alt="" className="w-[90%] h-[90%] object-contain pixelated" />
          ) : (
            <CookingPot className="w-[70%] h-[70%] text-orange-400" weight="fill" />
          )}
          <Fire className="w-3 h-3 text-amber-400 absolute -bottom-0.5 -right-0.5" weight="fill" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-orange-400 truncate">
              {activeItem ? translateItemName(activeItem.id, language) : activeTask.name}
            </span>
            <span className="text-xs text-orange-400 font-mono">
              {remainingSeconds}{t(language, 'seconds')}
            </span>
          </div>
          <Progress value={progressPercent} className="h-1.5 bg-orange-900/50" />
        </div>
        <button
          onClick={onStop}
          className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400"
          data-testid="button-stop-active-cooking"
        >
          <X className="w-4 h-4" weight="bold" />
        </button>
      </div>
      
      {isQueueV2 && activeTask.queueDurationMs ? (
        <div className="mt-2 pt-2 border-t border-orange-500/20">
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
  const food = getFoodById(recipe.resultItemId);
  const tier = getFoodTier(recipe);
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
            <CookingPot className={cn("w-[70%] h-[70%]", colors.text)} weight="fill" />
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
            {food && food.healAmount > 0 && (
              <>
                <span>•</span>
                <span className="flex items-center gap-0.5 text-green-400">
                  <Heart className="w-3 h-3" weight="fill" />
                  {food.healAmount}
                </span>
              </>
            )}
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
  const food = getFoodById(recipe.resultItemId);
  const tier = getFoodTier(recipe);
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
                  <CookingPot className={cn("w-[70%] h-[70%]", colors.text)} weight="fill" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={cn("text-base font-bold leading-tight", colors.text)}>
                  {translateItemName(recipe.resultItemId, language)}
                </h3>
                <div className="flex items-center gap-2 mt-1 text-xs flex-wrap">
                  <Badge variant="outline" className={cn("text-xs py-0", colors.text)}>
                    <Star className="w-3 h-3 mr-1" weight="fill" />
                    {recipe.xpReward} {t(language, 'xp')}
                  </Badge>
                  <Badge variant="outline" className="text-xs py-0 text-muted-foreground">
                    <Clock className="w-3 h-3 mr-1" />
                    {Math.round(recipe.craftTime / 1000)}{t(language, 'seconds')}
                  </Badge>
                  {food && food.healAmount > 0 && (
                    <Badge variant="outline" className="text-xs py-0 text-green-400 border-green-500/50">
                      <Heart className="w-3 h-3 mr-1" weight="fill" />
                      +{food.healAmount} {t(language, 'hp')}
                    </Badge>
                  )}
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
                <div className="p-2 rounded-lg bg-orange-500/20 border border-orange-500/40 text-center">
                  <span className="text-sm text-orange-400">{t(language, 'cooking')}...</span>
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
                    data-testid="button-cook"
                  >
                    <PlayCircle className="w-4 h-4 mr-2" />
                    {selectedQuantity === 0 
                      ? t(language, 'cook')
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
            <CookingAnimation 
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

export default function CookingPage() {
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
    if (activeTask?.skillId === 'cooking') {
      playAmbient('cooking');
    } else {
      stopAmbient();
    }
    return () => { stopAmbient(); };
  }, [activeTask, playAmbient, stopAmbient]);

  useEffect(() => {
    preloadItemSources();
  }, []);

  const cookingRecipes = getRecipesForSkillAndRegion("cooking", currentRegion);
  const sortedRecipes = [...cookingRecipes].sort((a, b) => a.levelRequired - b.levelRequired);

  const cookingLevel = skills.cooking?.level || 0;
  const cookingXp = skills.cooking?.xp || 0;
  const levelProgress = getLevelProgress(cookingXp);

  const isRecipeLocked = (recipe: Recipe) => !debugMode && cookingLevel < recipe.levelRequired;

  const canCraftRecipe = (recipe: Recipe): boolean => {
    if (!debugMode && cookingLevel < recipe.levelRequired) return false;
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
          skillId: 'cooking',
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
      "cooking",
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
    return activeTask?.skillId === "cooking" && activeTask?.name === recipe.resultItemId;
  };

  useEffect(() => {
    if (!selectedRecipe && sortedRecipes.length > 0) {
      const firstUnlocked = sortedRecipes.find(r => !isRecipeLocked(r));
      if (firstUnlocked) {
        setSelectedRecipe(firstUnlocked);
      }
    }
  }, [sortedRecipes, selectedRecipe, cookingLevel, debugMode]);

  if (!isItemsLoaded()) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <CookingPot className="w-12 h-12 text-orange-400 animate-pulse mx-auto mb-2" weight="fill" />
          <p className="text-muted-foreground">{t(language, 'loading')}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", isMobile ? "pb-24" : "h-full")}>
      <div className="p-4 border-b border-border/50 bg-card/30">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center border border-orange-500/40 relative">
            <CookingPot className="w-6 h-6 text-orange-400" weight="fill" />
            <Fire className="w-3 h-3 text-amber-400 absolute -bottom-0.5 -right-0.5" weight="fill" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-orange-400">{t(language, 'cooking')}</h1>
            <p className="text-xs text-muted-foreground">
              {t(language, 'cookingDesc')}
            </p>
          </div>
        </div>
        <SkillProgressBar level={cookingLevel} xp={cookingXp} variant="compact" progressClassName="bg-orange-900/50" />
      </div>

      <ActiveCookingPanel activeTask={activeTask} onStop={handleStopTask} cookingRecipes={cookingRecipes} language={language} isQueueV2={isQueueV2} />


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
                  skillLevel={cookingLevel}
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
                      skillId: 'cooking',
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
                skillLevel={cookingLevel}
                inventory={inventory}
                isActive={isActiveRecipe(selectedRecipe)}
                debugMode={debugMode}
                targetQuantity={activeTask?.skillId === "cooking" && activeTask?.name === selectedRecipe.resultItemId ? activeTask.targetQuantity : undefined}
                producedCount={activeTask?.skillId === "cooking" && activeTask?.name === selectedRecipe.resultItemId ? activeTask.producedCount : undefined}
              />
            ) : (
              <div className="text-center text-muted-foreground py-8">
                {t(language, 'cooking')}
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
            skillId: 'cooking',
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
              skillId: 'cooking',
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
