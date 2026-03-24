import { ItemSlot } from "@/components/game/ItemSlot";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Hammer,
  Fire,
  PlayCircle,
  Sword,
  Shield,
  TShirt,
  Lock,
  Check,
  X,
  Clock,
  Star,
  Heart,
  Diamond,
  Crosshair,
  Sparkle,
  ListPlus,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useGame } from "@/context/GameContext";
import { getLevelProgress, formatNumber } from "@/lib/gameMath";
import { SkillProgressBar } from "@/components/game/SkillProgressBar";
import {
  getItemById,
  Recipe,
  isItemsLoaded,
  translateItemName,
  translateItemDescription,
  preloadItemSources,
  getItemSourcesSync,
  formatSkillName,
  buildDraftQuery,
} from "@/lib/items";
import { getLocalizedMonsterName } from "@/lib/gameTranslations";
import { getItemImage } from "@/lib/itemImages";
import { useState, useEffect, useMemo, useRef } from "react";
import { useMobile } from "@/hooks/useMobile";
import { RoleStatsDisplay, ItemStatsDisplay } from "@/components/items";
import { useLanguage } from "@/context/LanguageContext";
import { useItemsData } from "@/hooks/useGameData";
import { useAudio } from "@/context/AudioContext";
import { t, Language, TranslationKeys } from "@/lib/i18n";
import { QuantitySelector, ProductionCounter } from "@/components/game/QuantitySelector";
import { useToast } from "@/hooks/use-toast";
import { AddToQueueDialog } from "@/components/game/QueueDialog";
import { DurationPickerDialog } from "@/components/game/DurationPickerDialog";
import { QueueCountdownTimer } from "@/components/game/QueueCountdownTimer";
import { getUsedQueueTimeMs } from "@shared/schema";
import { mapWeaponCategoryToMasteryType, getMasteryFieldName } from "@shared/masterySystem";

const CRAFT_SRC = '/audio/Custom/Skills/Crafting.ogg';
const CRAFT_BASE_VOL = 0.4;
const CRAFT_DUR = 1.2974;

function CraftingAnimation({ itemImage, size = "lg", isAnimating = true }: { itemImage?: string; size?: "sm" | "md" | "lg"; isAnimating?: boolean }) {
  const isSmall = size === "sm";
  const isMedium = size === "md";
  const isLarge = size === "lg";
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { settings, stopAmbient } = useAudio();
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (!isAnimating || !isLarge) return;
    stopAmbient();
    const audio = new Audio(CRAFT_SRC);
    audio.preload = 'auto';
    audio.loop = false;
    audioRef.current = audio;
    const vol = Math.min(1, Math.max(0, CRAFT_BASE_VOL * (settings.ambientVolume / 0.4)));
    audio.volume = settings.ambientEnabled ? vol : 0;
    const onEnded = () => {
      setAnimKey(k => k + 1);
      audio.currentTime = 0;
      audio.play().catch(() => {});
    };
    audio.addEventListener('ended', onEnded);
    audio.play().catch(() => {});
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [isAnimating, isLarge]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const vol = Math.min(1, Math.max(0, CRAFT_BASE_VOL * (settings.ambientVolume / 0.4)));
    audio.volume = settings.ambientEnabled ? vol : 0;
  }, [settings.ambientEnabled, settings.ambientVolume]);

  const d = CRAFT_DUR;

  return (
    <div className={cn("relative mx-auto", isSmall ? "w-16 h-16" : isMedium ? "w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32" : "w-44 h-44 my-4")}>
      <div className={cn("absolute left-1/2 -translate-x-1/2 rounded-full blur-xl", isAnimating ? "bg-amber-500/20 animate-pulse" : "bg-stone-700/10", isSmall ? "bottom-0 w-12 h-8" : isMedium ? "bottom-0 w-20 h-14" : "bottom-0 w-28 h-20")} />
      <div className={cn("absolute left-1/2 -translate-x-1/2", isSmall ? "bottom-0.5" : isMedium ? "bottom-1" : "bottom-2")}>
        <div className={cn("bg-gradient-to-b from-stone-500 to-stone-700 rounded-sm", isSmall ? "w-12 h-2" : isMedium ? "w-20 h-4" : "w-32 h-8")} />
        <div className={cn("bg-gradient-to-b from-stone-600 via-stone-700 to-stone-800 mx-auto -mt-0.5 rounded-b-sm relative", isSmall ? "w-10 h-3" : isMedium ? "w-16 h-5" : "w-28 h-10")}>
          {(isMedium || isLarge) && <div className={cn("absolute top-0.5 left-1/2 -translate-x-1/2 bg-gradient-to-b from-stone-500 to-stone-600 rounded-sm", isMedium ? "w-10 h-3" : "w-16 h-6")} />}
        </div>
      </div>
      <div key={isAnimating && isLarge ? animKey : 'static'} className={cn("absolute left-1/2 -translate-x-1/2 rounded-lg flex items-center justify-center", isAnimating ? "bg-gradient-to-br from-amber-500/40 via-orange-500/30 to-red-600/20 crafting-glow" : "bg-gradient-to-br from-stone-600/40 via-stone-500/30 to-stone-600/20", isSmall ? "bottom-[18px] w-6 h-6" : isMedium ? "bottom-[32px] w-10 h-10" : "bottom-[55px] w-14 h-14")}>
        {itemImage ? (
          <img src={itemImage} alt="" className={cn("object-contain pixelated", isSmall ? "w-4 h-4" : isMedium ? "w-7 h-7" : "w-10 h-10")} style={{ mixBlendMode: 'multiply' }} />
        ) : (
          <div className={cn("bg-gradient-to-br rounded", isAnimating ? "from-amber-400 to-orange-600 animate-pulse" : "from-stone-500 to-stone-600", isSmall ? "w-3 h-3" : isMedium ? "w-5 h-5" : "w-8 h-8")} />
        )}
      </div>
      <div key={isAnimating && isLarge ? `h-${animKey}` : 'h-static'} className={cn(isAnimating ? "crafting-hammer" : "crafting-hammer-static", isSmall && "!top-1 !right-[15%]", isMedium && "!top-2 !right-[20%]")}>
        <Hammer className={cn("text-stone-400", isSmall ? "w-4 h-4" : isMedium ? "w-7 h-7" : "w-10 h-10")} weight="fill" />
      </div>
      {isAnimating && (
        <>
          <div key={isLarge ? `cs1-${animKey}` : undefined} className="crafting-spark crafting-spark-1" />
          <div key={isLarge ? `cs2-${animKey}` : undefined} className="crafting-spark crafting-spark-2" />
          {(isMedium || isLarge) && <div key={isLarge ? `cs3-${animKey}` : undefined} className="crafting-spark crafting-spark-3" />}
          {(isMedium || isLarge) && <div key={isLarge ? `cs4-${animKey}` : undefined} className="crafting-spark crafting-spark-4" />}
          {isLarge && <div key={`cs5-${animKey}`} className="crafting-spark crafting-spark-5" />}
          {isLarge && <div key={`cs6-${animKey}`} className="crafting-spark crafting-spark-6" />}
        </>
      )}
      <style>{`
        .crafting-glow {
          animation: craftGlow ${d}s ease-in-out ${isAnimating && isLarge ? '1 forwards' : 'infinite'};
          box-shadow: 0 0 20px rgba(251, 146, 60, 0.4);
        }
        .crafting-hammer {
          position: absolute;
          top: 15px;
          right: 25%;
          transform-origin: bottom left;
          animation: hammerStrike ${d}s ease-in-out ${isAnimating && isLarge ? '1 forwards' : 'infinite'};
        }
        .crafting-hammer-static {
          position: absolute;
          top: 15px;
          right: 25%;
          transform-origin: bottom left;
          transform: rotate(-35deg);
        }
        .crafting-spark {
          position: absolute;
          width: 4px;
          height: 4px;
          background: linear-gradient(to right, #fbbf24, #f97316);
          border-radius: 50%;
          opacity: 0;
        }
        .crafting-spark-1 {
          animation: spark1 ${d}s ease-out ${isAnimating && isLarge ? '1 forwards' : 'infinite'};
          top: 45%;
          left: 35%;
        }
        .crafting-spark-2 {
          animation: spark2 ${d}s ease-out ${isAnimating && isLarge ? '1 forwards' : 'infinite'};
          top: 40%;
          left: 50%;
        }
        .crafting-spark-3 {
          animation: spark3 ${d}s ease-out ${isAnimating && isLarge ? '1 forwards' : 'infinite'};
          top: 50%;
          left: 60%;
        }
        .crafting-spark-4 {
          animation: spark4 ${d}s ease-out ${isAnimating && isLarge ? '1 forwards' : 'infinite'};
          top: 35%;
          left: 45%;
        }
        .crafting-spark-5 {
          animation: spark5 ${d}s ease-out 1 forwards;
          top: 48%;
          left: 40%;
        }
        .crafting-spark-6 {
          animation: spark6 ${d}s ease-out 1 forwards;
          top: 42%;
          left: 55%;
        }
        @keyframes craftGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(251, 146, 60, 0.3); }
          15% { box-shadow: 0 0 35px rgba(251, 146, 60, 0.7); }
          30% { box-shadow: 0 0 20px rgba(251, 146, 60, 0.3); }
        }
        @keyframes hammerStrike {
          0%, 100% { transform: rotate(-30deg); }
          10% { transform: rotate(-50deg); }
          15% { transform: rotate(10deg); }
          20% { transform: rotate(-30deg); }
        }
        @keyframes spark1 {
          0%, 14% { opacity: 0; transform: translate(0, 0) scale(1); }
          15% { opacity: 1; transform: translate(0, 0) scale(1); }
          30% { opacity: 0; transform: translate(-20px, -30px) scale(0.3); }
          100% { opacity: 0; }
        }
        @keyframes spark2 {
          0%, 14% { opacity: 0; transform: translate(0, 0) scale(1); }
          15% { opacity: 1; transform: translate(0, 0) scale(1); }
          30% { opacity: 0; transform: translate(15px, -35px) scale(0.3); }
          100% { opacity: 0; }
        }
        @keyframes spark3 {
          0%, 14% { opacity: 0; transform: translate(0, 0) scale(1); }
          15% { opacity: 1; transform: translate(0, 0) scale(1); }
          30% { opacity: 0; transform: translate(25px, -20px) scale(0.3); }
          100% { opacity: 0; }
        }
        @keyframes spark4 {
          0%, 14% { opacity: 0; transform: translate(0, 0) scale(1); }
          15% { opacity: 1; transform: translate(0, 0) scale(1); }
          30% { opacity: 0; transform: translate(-10px, -40px) scale(0.3); }
          100% { opacity: 0; }
        }
        @keyframes spark5 {
          0%, 14% { opacity: 0; transform: translate(0, 0) scale(1); }
          15% { opacity: 1; transform: translate(0, 0) scale(1); }
          30% { opacity: 0; transform: translate(-25px, -15px) scale(0.3); }
          100% { opacity: 0; }
        }
        @keyframes spark6 {
          0%, 14% { opacity: 0; transform: translate(0, 0) scale(1); }
          15% { opacity: 1; transform: translate(0, 0) scale(1); }
          30% { opacity: 0; transform: translate(20px, -28px) scale(0.3); }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

interface ApiRecipe {
  id: string;
  resultItemId: string;
  resultQuantity: number;
  materials: { itemId: string; quantity: number }[];
  skill: string;
  levelRequired: number;
  xpReward: number;
  craftTime: number;
  category: string;
  regionId: string | null;
  regionIds?: string[];
}

const WEAPON_CATEGORIES = ["weapon", "sword", "dagger", "bow", "staff", "hammer", "axe", "2h_sword", "2h_axe", "2h_warhammer"];

const CRAFTING_CATEGORIES = [
  { id: "smelting", name: "smelting", icon: Fire },
  { id: "weapons", name: "mainhand", icon: Sword },
  { id: "shield", name: "shield", icon: Shield },
  { id: "armor", name: "armor", icon: TShirt },
  { id: "accessory", name: "accessory", icon: Diamond },
];

function getMaterialTier(recipe: Recipe): string {
  if (recipe.levelRequired >= 85) return "rune";
  if (recipe.levelRequired >= 70) return "adamant";
  if (recipe.levelRequired >= 50) return "mithril";
  if (recipe.levelRequired >= 30) return "steel";
  if (recipe.levelRequired >= 15) return "iron";
  return "bronze";
}

function getTierColors(tier: string): {
  bg: string;
  border: string;
  text: string;
  glow: string;
} {
  switch (tier) {
    case "rune":
      return {
        bg: "bg-cyan-500/20",
        border: "border-cyan-500/50",
        text: "text-cyan-400",
        glow: "shadow-cyan-500/30",
      };
    case "adamant":
      return {
        bg: "bg-emerald-500/20",
        border: "border-emerald-500/50",
        text: "text-emerald-400",
        glow: "shadow-emerald-500/30",
      };
    case "mithril":
      return {
        bg: "bg-violet-500/20",
        border: "border-violet-500/50",
        text: "text-violet-400",
        glow: "shadow-violet-500/30",
      };
    case "steel":
      return {
        bg: "bg-slate-400/20",
        border: "border-slate-400/50",
        text: "text-slate-300",
        glow: "shadow-slate-500/30",
      };
    case "iron":
      return {
        bg: "bg-stone-400/20",
        border: "border-stone-400/50",
        text: "text-stone-300",
        glow: "shadow-stone-500/30",
      };
    default:
      return {
        bg: "bg-amber-600/20",
        border: "border-amber-600/50",
        text: "text-amber-500",
        glow: "shadow-amber-500/30",
      };
  }
}

function ActiveCraftingPanel({
  activeTask,
  onStop,
  craftingRecipes,
  language,
  isQueueV2 = false,
}: {
  activeTask: any;
  onStop: () => void;
  isQueueV2?: boolean;
  craftingRecipes: Recipe[];
  language: Language;
}) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const timerTextRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!activeTask?.skillId || activeTask.skillId !== "crafting") return;

    const update = () => {
      const now = Date.now();
      const elapsed = now - activeTask.startTime;
      const percent = Math.min(100, (elapsed / activeTask.duration) * 100);
      if (progressBarRef.current) progressBarRef.current.style.width = `${percent}%`;
      const remainMs = Math.max(0, activeTask.duration - elapsed);
      const remainSec = Math.ceil(remainMs / 1000);
      if (timerTextRef.current) timerTextRef.current.textContent = `${remainSec}${t(language, 'seconds')}`;
    };

    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [activeTask, language]);

  if (!activeTask?.skillId || activeTask.skillId !== "crafting") return null;

  const activeRecipe = craftingRecipes.find((r) => r.resultItemId === activeTask.name);
  const activeItem = activeRecipe ? getItemById(activeRecipe.resultItemId) : null;
  const itemImg = getItemImage(activeTask.name);

  return (
    <div
      className="mb-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/30"
      data-testid="active-crafting-panel"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center border border-orange-500/40 animate-pulse">
          {itemImg ? (
            <img src={itemImg} alt="" className="w-[90%] h-[90%] object-contain pixelated" />
          ) : (
            <Hammer className="w-[70%] h-[70%] text-orange-400" weight="fill" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-orange-400 truncate">
              {activeItem ? translateItemName(activeItem.id, language) : activeTask.name}
            </span>
            <span ref={timerTextRef} className="text-xs text-orange-400 font-mono" />
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-orange-900/50">
            <div ref={progressBarRef} className="h-full bg-primary transition-[width] duration-200 rounded-full" style={{ width: '0%' }} />
          </div>
        </div>
        <button
          onClick={onStop}
          className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400"
          data-testid="button-stop-active-crafting"
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
  const tier = getMaterialTier(recipe);
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
            <Lock className="w-[50%] h-[50%] text-zinc-500" weight="bold" />
          ) : itemImg ? (
            <img src={itemImg} alt={item?.name} className="w-[90%] h-[90%] object-contain pixelated" />
          ) : (
            <Hammer className={cn("w-[70%] h-[70%]", colors.text)} weight="fill" />
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
  const { getMasteryLevel } = useGame();
  const { isMobile } = useMobile();
  const [selectedQuantity, setSelectedQuantity] = useState(0);
  const item = getItemById(recipe.resultItemId);
  const tier = getMaterialTier(recipe);
  const colors = getTierColors(tier);
  const isLocked = !debugMode && skillLevel < recipe.levelRequired;
  const itemImg = getItemImage(recipe.resultItemId);
  
  const getMasteryRequirementInfo = () => {
    if (!item?.equipSlot || item.equipSlot !== 'weapon' || !item.masteryRequired || !item.weaponCategory) return null;
    const masteryType = mapWeaponCategoryToMasteryType(item.weaponCategory);
    if (!masteryType) return null;
    const playerMasteryLevel = getMasteryLevel(masteryType);
    const meetsMasteryReq = debugMode || playerMasteryLevel >= item.masteryRequired;
    const fieldName = getMasteryFieldName(masteryType);
    const translationKey = `mastery${fieldName.charAt(7).toUpperCase() + fieldName.slice(8)}` as keyof TranslationKeys;
    return { masteryType, playerMasteryLevel, meetsMasteryReq, translationKey, requiredLevel: item.masteryRequired };
  };
  const masteryInfo = getMasteryRequirementInfo();
  
  const maxCraftable = debugMode ? 999 : Math.min(
    ...recipe.materials.map(mat => Math.floor((inventory[mat.itemId] || 0) / mat.quantity))
  );

  return (
    <Card className={cn("border flex flex-col overflow-hidden", colors.border, colors.bg)}>
      <CardContent className="p-4 flex-1 flex flex-col">
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
                  <Hammer className={cn("w-[70%] h-[70%]", colors.text)} weight="fill" />
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
                </div>
              </div>
            </div>
            <ItemStatsDisplay stats={item?.stats} variant="badge" className="mb-1" showContainer={false} />
            <RoleStatsDisplay item={item} variant="badge" className="mb-1" showContainer={false} />
            {masteryInfo && (
              <div className="mb-2">
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    masteryInfo.meetsMasteryReq 
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                      : "bg-red-500/10 border-red-500/30 text-red-400"
                  )}
                >
                  <Sword className="w-3 h-3 mr-1" weight="fill" />
                  {t(language, masteryInfo.translationKey)} {t(language, 'lvl')} {masteryInfo.requiredLevel}
                  <span className="ml-1.5 font-mono text-[10px] opacity-75">
                    ({masteryInfo.playerMasteryLevel}/{masteryInfo.requiredLevel})
                  </span>
                </Badge>
              </div>
            )}
            {item?.weaponSkills && item.weaponSkills.length > 0 && (
              <div className="mb-2">
                <div className="flex flex-wrap gap-1">
                  {item.weaponSkills.map((skill, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs bg-purple-500/10 border-purple-500/30 text-purple-300">
                      <Sparkle className="w-3 h-3 mr-1" /> {skill.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

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
                  <span className="text-sm text-orange-400">{t(language, 'crafting')}...</span>
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
                    data-testid="button-craft"
                  >
                    <PlayCircle className="w-4 h-4 mr-2" />
                    {selectedQuantity === 0 
                      ? t(language, 'craft')
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
            <CraftingAnimation 
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

export default function CraftingPage() {
  const { skills, inventory, activeTask, startTask, stopTask, debugMode, currentRegion, activeTravel, activeCombat, taskQueue, isQueueV2, maxQueueTimeMsTotal, startTaskWithDuration, addToQueue, removeFromQueue } = useGame();
  const [selectedCategory, setSelectedCategory] = useState("smelting");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [queueDialogRecipe, setQueueDialogRecipe] = useState<Recipe | null>(null);
  const [durationPickerRecipe, setDurationPickerRecipe] = useState<Recipe | null>(null);
  const [durationPickerMode, setDurationPickerMode] = useState<'start' | 'queue'>('start');
  const { isMobile } = useMobile();
  const { toast } = useToast();
  const { language } = useLanguage();
  const { isLoaded: itemsLoaded } = useItemsData();
  useEffect(() => {
    preloadItemSources();
  }, []);
  
  const [allCraftingRecipes, setAllCraftingRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [recipesError, setRecipesError] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadRecipes = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    setRecipesLoading(true);
    setRecipesError(false);
    try {
      const res = await fetch(buildDraftQuery(`/api/game/recipes?t=${Date.now()}`), {
        signal: abortControllerRef.current.signal
      });
      if (res.ok) {
        const data: ApiRecipe[] = await res.json();
        const craftingRecipes = data
          .filter(r => r.skill === 'crafting')
          .map(r => ({
            id: r.id,
            resultItemId: r.resultItemId,
            resultQuantity: r.resultQuantity,
            materials: r.materials,
            skill: r.skill as "crafting",
            levelRequired: r.levelRequired,
            xpReward: r.xpReward,
            craftTime: r.craftTime,
            category: r.category as Recipe["category"],
            regionId: r.regionId ?? undefined,
            regionIds: Array.isArray(r.regionIds) ? r.regionIds as string[] : undefined,
          }));
        setAllCraftingRecipes(craftingRecipes);
      } else {
        setRecipesError(true);
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        setRecipesError(true);
      }
    }
    setRecipesLoading(false);
  };

  useEffect(() => {
    loadRecipes();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const apiRecipes = useMemo(() => {
    // If currentRegion is empty/undefined, show all recipes (no region filtering)
    // This ensures users always see recipes while region is loading
    if (!currentRegion) {
      return allCraftingRecipes;
    }
    return allCraftingRecipes.filter(r => {
      const regions = (r.regionIds && Array.isArray(r.regionIds) && r.regionIds.length > 0) ? r.regionIds as string[] : (r.regionId ? [r.regionId] : []);
      return regions.length === 0 || regions.includes(currentRegion);
    });
  }, [allCraftingRecipes, currentRegion]);

  const allRecipes = apiRecipes;
  const currentRecipes = apiRecipes.filter(r => {
    if (selectedCategory === "weapons") {
      return WEAPON_CATEGORIES.includes(r.category || "") || r.category === "";
    }
    return r.category === selectedCategory;
  });
  const sortedRecipes = [...currentRecipes].sort((a, b) => a.levelRequired - b.levelRequired);

  const craftingLevel = skills.crafting?.level || 0;
  const craftingXp = skills.crafting?.xp || 0;
  const levelProgress = getLevelProgress(craftingXp);

  const isRecipeLocked = (recipe: Recipe) => !debugMode && craftingLevel < recipe.levelRequired;

  const canCraftRecipe = (recipe: Recipe): boolean => {
    if (!debugMode && craftingLevel < recipe.levelRequired) return false;
    return debugMode || recipe.materials.every((mat) => (inventory[mat.itemId] || 0) >= mat.quantity);
  };

  const handleCraft = (recipe: Recipe, targetQuantity: number) => {
    if (activeTravel) return;
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
          skillId: 'crafting',
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
      "crafting",
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
    return activeTask?.skillId === "crafting" && activeTask?.name === recipe.resultItemId;
  };

  useEffect(() => {
    if (!selectedRecipe && sortedRecipes.length > 0) {
      const firstUnlocked = sortedRecipes.find(r => !isRecipeLocked(r));
      if (firstUnlocked) {
        setSelectedRecipe(firstUnlocked);
      }
    }
  }, [sortedRecipes, selectedRecipe, craftingLevel, debugMode]);

  useEffect(() => {
    const categoryRecipes = apiRecipes.filter(r => {
      if (selectedCategory === "weapons") {
        return WEAPON_CATEGORIES.includes(r.category || "") || r.category === "";
      }
      return r.category === selectedCategory;
    });
    const sorted = [...categoryRecipes].sort((a, b) => a.levelRequired - b.levelRequired);
    const firstUnlocked = sorted.find(r => !isRecipeLocked(r));
    if (firstUnlocked) {
      setSelectedRecipe(firstUnlocked);
    } else {
      setSelectedRecipe(null);
    }
  }, [selectedCategory, craftingLevel, debugMode, currentRegion, apiRecipes]);

  if (!itemsLoaded || recipesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Hammer className="w-12 h-12 text-orange-400 animate-pulse mx-auto mb-2" weight="fill" />
          <p className="text-muted-foreground">{t(language, 'loading')}...</p>
        </div>
      </div>
    );
  }

  if (recipesError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-4">
          <Hammer className="w-12 h-12 text-orange-400/50 mx-auto mb-2" weight="fill" />
          <p className="text-muted-foreground text-sm mb-3">{t(language, 'failedToLoad')}</p>
          <Button variant="outline" size="sm" onClick={loadRecipes} data-testid="button-retry-recipes">
            {t(language, 'retry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", isMobile ? "pb-24" : "h-full")}>
      <div className="p-4 border-b border-border/50 bg-card/30">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center border border-orange-500/40">
            <Hammer className="w-6 h-6 text-orange-400" weight="fill" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-orange-400">{t(language, 'crafting')}</h1>
            <p className="text-xs text-muted-foreground">
              {t(language, 'craftingDesc')}
            </p>
          </div>
        </div>
        <SkillProgressBar level={craftingLevel} xp={craftingXp} variant="compact" progressClassName="bg-orange-900/50" />

        <div className="flex gap-1 mt-3">
          {CRAFTING_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border transition-all",
                  isActive
                    ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                    : "bg-card/50 border-border/50 text-muted-foreground hover:bg-card/80"
                )}
                data-testid={`category-${cat.id}`}
              >
                <Icon className="w-5 h-5" weight="fill" />
                <span className="text-[10px] font-medium">{t(language, cat.name as any)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <ActiveCraftingPanel activeTask={activeTask} onStop={handleStopTask} craftingRecipes={allRecipes} language={language} isQueueV2={isQueueV2} />


      <div className={cn("flex-1 flex overflow-hidden", isMobile && "flex-col-reverse")}>
        <div className={cn("border-r border-border/50", isMobile ? "h-1/2 border-r-0 border-t" : "w-1/3")}>
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2 pb-8">
              {sortedRecipes.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  {t(language, 'noRecipesAvailable' as any) || 'No recipes available in this category'}
                </div>
              ) : null}
              {sortedRecipes.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  isSelected={selectedRecipe?.id === recipe.id}
                  onClick={() => setSelectedRecipe(recipe)}
                  canCraft={canCraftRecipe(recipe)}
                  skillLevel={craftingLevel}
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
                onCraft={(quantity: number) => handleCraft(selectedRecipe, quantity)}
                onQueue={(recipe, qty) => {
                  if (isQueueV2) {
                    const remainingMs = maxQueueTimeMsTotal - getUsedQueueTimeMs(taskQueue, activeTask, activeCombat);
                    const durationMs = (qty && qty > 0)
                      ? Math.min(qty * recipe.craftTime, Math.max(remainingMs, recipe.craftTime))
                      : Math.max(remainingMs, recipe.craftTime);
                    addToQueue({
                      type: 'skill',
                      skillId: 'crafting',
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
                skillLevel={craftingLevel}
                inventory={inventory}
                isActive={isActiveRecipe(selectedRecipe)}
                debugMode={debugMode}
                targetQuantity={isActiveRecipe(selectedRecipe) ? activeTask?.targetQuantity : undefined}
                producedCount={isActiveRecipe(selectedRecipe) ? activeTask?.producedCount : undefined}
              />
            ) : (
              <div className="text-center text-muted-foreground py-8">
                {t(language, 'crafting')}
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
            skillId: 'crafting',
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
              skillId: 'crafting',
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
