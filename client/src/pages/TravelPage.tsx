import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { useMobile } from "@/hooks/useMobile";
import { 
  MapPin, Lock, Compass, Swords, Clock, X, Skull, Pickaxe, 
  TreePine, Fish, FlameKindling, FlaskConical, Hammer, Coins, Timer,
  Plane, XCircle, ChevronRight, ChevronDown, Moon, Heart, Sparkles, Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GoldDisplay } from "@/components/game/GoldDisplay";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { trackTravel, trackRegionVisited } from "@/hooks/useAchievementTracker";
import { getLocalizedRegionName, getLocalizedRegionDescription, getLocalizedMonsterName } from "@/lib/gameTranslations";
import type { Language } from "@/lib/i18n";
import { calculateTravelTime, calculateTravelCost, calculateTravelDistance, isNightTime, formatTravelDuration } from "@shared/travelUtils";
import { getItemImage } from "@/lib/itemImages";
import { translateItemName, buildDraftQuery } from "@/lib/items";
import { getMonsterImage } from "@/lib/monsterImages";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useAudio } from "@/context/AudioContext";

interface MapPosition {
  x: number;
  y: number;
}

interface Region {
  id: string;
  name: string;
  description: string;
  levelRangeMin: number;
  levelRangeMax: number;
  color: string;
  sortOrder: number;
  icon?: string;
  travelCost: number;
  travelTime: number;
  mapPosition: MapPosition;
  nameTranslations?: Record<string, string>;
  descriptionTranslations?: Record<string, string>;
}

interface Monster {
  id: string;
  name: string;
  regionId: string;
  maxHitpoints: number;
  attackLevel: number;
  strengthLevel: number;
  defenceLevel: number;
  icon?: string;
  nameTranslations?: Record<string, string>;
  loot?: { itemId: string; chance: number; minQty: number; maxQty: number }[];
  xpReward?: { attack: number; strength: number; defence: number; hitpoints: number };
  skills?: any[];
}

interface SkillAction {
  id: string;
  skill: string;
  name: string;
  levelRequired: number;
  xpReward: number;
  regionId?: string;
  icon?: string;
  nameTranslations?: Record<string, string>;
  itemId?: string;
}

interface Recipe {
  id: string;
  skill: string;
  name: string;
  levelRequired: number;
  xpReward: number;
  regionId?: string;
  regionIds?: string[];
  icon?: string;
  nameTranslations?: Record<string, string>;
  resultItemId?: string;
  resultQuantity?: number;
  materials?: { itemId: string; quantity: number }[];
  category?: string;
  craftTime?: number;
}

const REGION_COLORS: Record<string, { bg: string; border: string; text: string; gradient: string; glow: string }> = {
  verdant: { 
    bg: "bg-green-500/20", 
    border: "border-green-500/50", 
    text: "text-green-400",
    gradient: "from-green-600/30 to-green-900/50",
    glow: "shadow-green-500/50"
  },
  quarry: { 
    bg: "bg-amber-500/20", 
    border: "border-amber-500/50", 
    text: "text-amber-400",
    gradient: "from-amber-600/30 to-amber-900/50",
    glow: "shadow-amber-500/50"
  },
  dunes: { 
    bg: "bg-yellow-500/20", 
    border: "border-yellow-500/50", 
    text: "text-yellow-400",
    gradient: "from-yellow-600/30 to-yellow-900/50",
    glow: "shadow-yellow-500/50"
  },
  obsidian: { 
    bg: "bg-purple-500/20", 
    border: "border-purple-500/50", 
    text: "text-purple-400",
    gradient: "from-purple-600/30 to-purple-900/50",
    glow: "shadow-purple-500/50"
  },
  dragonspire: { 
    bg: "bg-red-500/20", 
    border: "border-red-500/50", 
    text: "text-red-400",
    gradient: "from-red-600/30 to-red-900/50",
    glow: "shadow-red-500/50"
  },
  frozen_wastes: { 
    bg: "bg-blue-500/20", 
    border: "border-blue-500/50", 
    text: "text-blue-400",
    gradient: "from-blue-600/30 to-blue-900/50",
    glow: "shadow-blue-500/50"
  },
  void_realm: { 
    bg: "bg-violet-500/20", 
    border: "border-violet-500/50", 
    text: "text-violet-400",
    gradient: "from-violet-600/30 to-violet-900/50",
    glow: "shadow-violet-500/50"
  },
};

const REGION_ICONS: Record<string, string> = {
  verdant: "🌲",
  quarry: "⛏️",
  dunes: "🏜️",
  obsidian: "🌋",
  dragonspire: "🐉",
  frozen_wastes: "❄️",
  void_realm: "🌀",
};

function MiniMapPreview({ region, allRegions, language }: { region: Region; allRegions: Region[]; language: Language }) {
  const position = region.mapPosition || { x: 50, y: 50 };
  const style = REGION_COLORS[region.id] || REGION_COLORS.verdant;
  
  return (
    <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border/50">
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ 
          backgroundImage: `url('/images/world-map.webp')`,
          backgroundPosition: `${position.x}% ${position.y}%`,
          transform: 'scale(2.5)',
          transformOrigin: `${position.x}% ${position.y}%`
        }}
      />
      <div className="absolute inset-0 bg-black/40" />
      
      {allRegions.map((r) => {
        const rPos = r.mapPosition || { x: 50, y: 50 };
        const rStyle = REGION_COLORS[r.id] || REGION_COLORS.verdant;
        const isTarget = r.id === region.id;
        
        const relX = 50 + (rPos.x - position.x) * 2.5;
        const relY = 50 + (rPos.y - position.y) * 2.5;
        
        if (relX < -10 || relX > 110 || relY < -10 || relY > 110) return null;
        
        return (
          <div
            key={r.id}
            className={`
              absolute transform -translate-x-1/2 -translate-y-1/2
              rounded-full flex items-center justify-center
              ${isTarget ? 'w-10 h-10 ring-2 ring-white animate-pulse' : 'w-6 h-6 opacity-50'}
              ${rStyle.bg} ${rStyle.border} border
            `}
            style={{
              left: `${relX}%`,
              top: `${relY}%`,
            }}
          >
            <span className={isTarget ? 'text-lg' : 'text-xs'}>
              {REGION_ICONS[r.id] || "📍"}
            </span>
          </div>
        );
      })}
      
      <div className={`absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-medium ${style.bg} ${style.text} border ${style.border}`}>
        {REGION_ICONS[region.id]} {getLocalizedRegionName(language, region.id) || region.name}
      </div>
    </div>
  );
}

function MobileRegionCard({ 
  region, 
  isCurrentLocation, 
  isLocked, 
  onClick,
  gold,
  language,
  dynamicTravelCost,
  dynamicTravelTime,
  isNight
}: { 
  region: Region; 
  isCurrentLocation: boolean;
  isLocked: boolean;
  onClick: () => void;
  gold: number;
  language: Language;
  dynamicTravelCost: number;
  dynamicTravelTime: number;
  isNight: boolean;
}) {
  const style = REGION_COLORS[region.id] || REGION_COLORS.verdant;
  const canAfford = gold >= dynamicTravelCost;
  
  return (
    <Card 
      className={`
        relative overflow-hidden cursor-pointer transition-all
        ${isCurrentLocation ? `ring-2 ring-primary ${style.bg}` : 'hover:bg-card/80'}
        ${isLocked ? 'opacity-60' : ''}
        ${style.border} border
      `}
      onClick={onClick}
      data-testid={`mobile-region-card-${region.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className={`
            w-12 h-12 rounded-full flex items-center justify-center shrink-0
            ${style.bg} ${style.border} border-2
          `}>
            <span className="text-2xl">{REGION_ICONS[region.id] || "📍"}</span>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-semibold truncate ${style.text}`}>
                {getLocalizedRegionName(language, region.id) || region.name}
              </span>
              {isCurrentLocation && (
                <Badge variant="default" className="shrink-0 text-[10px] px-1.5">
                  <MapPin className="w-3 h-3 mr-0.5" />
                  {language === 'tr' ? 'Buradasınız' : 'Here'}
                </Badge>
              )}
              {isLocked && (
                <Lock className="w-4 h-4 text-destructive shrink-0" />
              )}
            </div>
            
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <Badge variant="outline" className={`${style.border} ${style.text} text-[10px]`}>
                Lv {region.levelRangeMin}-{region.levelRangeMax}
              </Badge>
              
              {!isCurrentLocation && (
                <>
                  <span className={`flex items-center gap-1 ${canAfford ? 'text-yellow-400' : 'text-destructive'}`}>
                    <Coins className="w-3 h-3" />
                    {dynamicTravelCost > 0 ? dynamicTravelCost : (language === 'tr' ? 'Ücretsiz' : 'Free')}
                    {isNight && <Moon className="w-2.5 h-2.5 text-indigo-400" />}
                  </span>
                  <span className="flex items-center gap-1 text-blue-400">
                    <Timer className="w-3 h-3" />
                    {dynamicTravelTime > 0 ? formatTravelTimeShort(dynamicTravelTime) : (language === 'tr' ? 'Anında' : 'Instant')}
                  </span>
                </>
              )}
            </div>
          </div>
          
          <ChevronRight className={`w-5 h-5 shrink-0 ${style.text}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function formatTravelTimeShort(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m`;
}

export default function TravelPage() {
  const { currentRegion, setCurrentRegion, totalLevel, activeCombat, activeTask, isInCombat, gold, activeTravel, completeTravel, cancelTravel, skills, inventory, debugMode, stopTask, clearQueue, taskQueue } = useGame();
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const { isMobile } = useMobile();
  const { playThemeMusic } = useAudio();

  useEffect(() => {
    playThemeMusic();
  }, [playThemeMusic]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [travelingTo, setTravelingTo] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [skillActions, setSkillActions] = useState<SkillAction[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isNight, setIsNight] = useState(isNightTime());
  const [teleportConfirmRegion, setTeleportConfirmRegion] = useState<Region | null>(null);
  const [taskStopConfirm, setTaskStopConfirm] = useState<{ region: Region; useTeleportStone: boolean } | null>(null);
  const [expandedMonsters, setExpandedMonsters] = useState<Set<string>>(new Set());
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapBounds, setMapBounds] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    const MAP_RATIO = 1408 / 768;

    const calcBounds = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;
      const containerRatio = cw / ch;

      let renderW: number, renderH: number, offsetX: number, offsetY: number;
      if (containerRatio > MAP_RATIO) {
        renderH = ch;
        renderW = ch * MAP_RATIO;
        offsetX = (cw - renderW) / 2;
        offsetY = 0;
      } else {
        renderW = cw;
        renderH = cw / MAP_RATIO;
        offsetX = 0;
        offsetY = (ch - renderH) / 2;
      }
      setMapBounds({ left: offsetX, top: offsetY, width: renderW, height: renderH });
    };

    calcBounds();
    const ro = new ResizeObserver(calcBounds);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const checkNight = () => setIsNight(isNightTime());
    checkNight();
    const interval = setInterval(checkNight, 60000);
    return () => clearInterval(interval);
  }, []);

  const getDynamicTravelTime = useCallback((toRegion: string) => {
    return calculateTravelTime(currentRegion, toRegion);
  }, [currentRegion]);

  const getDynamicTravelCost = useCallback((toRegion: string) => {
    return calculateTravelCost(currentRegion, toRegion);
  }, [currentRegion]);

  const teleportStoneCount = inventory["teleport_stone"] || 0;
  const getTeleportStoneCost = useCallback((toRegion: string) => {
    return calculateTravelDistance(currentRegion, toRegion);
  }, [currentRegion]);

  useEffect(() => {
    async function fetchRegions() {
      try {
        const response = await fetch('/api/game/regions');
        if (response.ok) {
          const data = await response.json();
          setRegions(data.sort((a: Region, b: Region) => a.sortOrder - b.sortOrder));
        }
      } catch (error) {
        console.error("Failed to fetch regions:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchRegions();
  }, []);

  useEffect(() => {
    if (selectedRegion) {
      fetchRegionDetails(selectedRegion.id);
      setExpandedMonsters(new Set());
      setExpandedSkills(new Set());
    }
  }, [selectedRegion]);

  useEffect(() => {
    if (!activeTravel) {
      setRemainingTime(0);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, activeTravel.endTime - now);
      setRemainingTime(remaining);

      if (remaining <= 0) {
        handleTravelComplete();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [activeTravel]);

  const handleTravelComplete = useCallback(async () => {
    if (!activeTravel) return;
    
    const targetRegion = activeTravel.targetRegion;
    await completeTravel();
    
    const region = regions.find(r => r.id === targetRegion);
    const localizedName = region 
      ? (getLocalizedRegionName(language, targetRegion) || region.name)
      : targetRegion;
    
    toast({
      title: language === 'tr' ? "Varış" : "Arrived",
      description: `${language === 'tr' ? "Varış noktası" : "Arrived at"}: ${localizedName}`,
    });
  }, [activeTravel, completeTravel, regions, language, toast]);

  const handleCancelTravel = useCallback(async () => {
    if (!activeTravel || isCancelling) return;
    
    setIsCancelling(true);
    try {
      await cancelTravel();
      toast({
        title: language === 'tr' ? "Seyahat İptal Edildi" : "Travel Cancelled",
        description: language === 'tr' 
          ? `${activeTravel.cost} altın iade edildi` 
          : `${activeTravel.cost} gold refunded`,
      });
    } finally {
      setIsCancelling(false);
    }
  }, [activeTravel, cancelTravel, isCancelling, language, toast]);

  async function fetchRegionDetails(regionId: string) {
    setIsLoadingDetails(true);
    try {
      const [monstersRes, skillActionsRes, recipesRes] = await Promise.all([
        fetch(buildDraftQuery('/api/game/monsters')),
        fetch(buildDraftQuery('/api/game/skill-actions')),
        fetch(buildDraftQuery('/api/game/recipes'))
      ]);

      if (monstersRes.ok) {
        const allMonsters = await monstersRes.json();
        setMonsters(allMonsters.filter((m: Monster) => m.regionId === regionId));
      }

      if (skillActionsRes.ok) {
        const allActions = await skillActionsRes.json();
        setSkillActions(allActions.filter((a: SkillAction) => 
          a.regionId === regionId
        ));
      }

      if (recipesRes.ok) {
        const allRecipes = await recipesRes.json();
        setRecipes(allRecipes.filter((r: Recipe) => {
          const regions = (r.regionIds && Array.isArray(r.regionIds) && r.regionIds.length > 0) ? r.regionIds as string[] : (r.regionId ? [r.regionId] : []);
          return regions.includes(regionId);
        }));
      }
    } catch (error) {
      console.error("Failed to fetch region details:", error);
    } finally {
      setIsLoadingDetails(false);
    }
  }

  // Calculate skill level requirements from actions and recipes for the selected region
  const skillRequirements = useMemo(() => {
    const reqs: Record<string, { min: number; max: number; count: number }> = {};
    
    // Process skill actions (mining, woodcutting, fishing, hunting, firemaking)
    skillActions.forEach((action) => {
      const skill = action.skill;
      if (!reqs[skill]) {
        reqs[skill] = { min: Infinity, max: 0, count: 0 };
      }
      reqs[skill].min = Math.min(reqs[skill].min, action.levelRequired);
      reqs[skill].max = Math.max(reqs[skill].max, action.levelRequired);
      reqs[skill].count++;
    });
    
    // Process recipes (cooking, alchemy, crafting)
    recipes.forEach((recipe) => {
      const skill = recipe.skill;
      if (!reqs[skill]) {
        reqs[skill] = { min: Infinity, max: 0, count: 0 };
      }
      reqs[skill].min = Math.min(reqs[skill].min, recipe.levelRequired);
      reqs[skill].max = Math.max(reqs[skill].max, recipe.levelRequired);
      reqs[skill].count++;
    });
    
    // Fix Infinity values and enforce region minimum level
    const regionMin = selectedRegion?.levelRangeMin || 1;
    Object.keys(reqs).forEach((skill) => {
      if (reqs[skill].min === Infinity) reqs[skill].min = regionMin;
      else reqs[skill].min = Math.max(reqs[skill].min, regionMin);
    });
    
    return reqs;
  }, [skillActions, recipes, selectedRegion]);

  const MIN_SKILLS_REQUIRED = 3;
  const { skillWarnings, skillsMet, skillsBlocked } = useMemo(() => {
    const warnings: string[] = [];
    let met = 0;
    const totalReqs = Object.keys(skillRequirements).length;
    Object.entries(skillRequirements).forEach(([skill, req]) => {
      const playerLevel = skills[skill as keyof typeof skills]?.level || 1;
      if (playerLevel < req.min) {
        warnings.push(skill);
      } else {
        met++;
      }
    });
    const requiredMet = Math.min(MIN_SKILLS_REQUIRED, totalReqs);
    return { skillWarnings: warnings, skillsMet: met, skillsBlocked: debugMode ? false : met < requiredMet };
  }, [skillRequirements, skills, debugMode]);

  const canTravel = !isInCombat && !activeTravel;
  const travelBlockedReason = isInCombat 
    ? (language === 'tr' ? "Savaştasınız" : "You are in combat")
    : activeTravel
      ? (language === 'tr' ? "Zaten seyahat ediyorsunuz" : "Already traveling")
      : null;

  const handleTravel = async (region: Region, useTeleportStone: boolean = false, skipTeleportCheck: boolean = false) => {
    if (!canTravel) {
      toast({
        title: language === 'tr' ? "Seyahat Edilemiyor" : "Cannot Travel",
        description: travelBlockedReason || (language === 'tr' ? "Şu anda seyahat edemezsiniz" : "You cannot travel right now"),
        variant: "destructive",
      });
      return;
    }

    if (activeTask) {
      setTaskStopConfirm({ region, useTeleportStone });
      return;
    }

    if (!debugMode && totalLevel < region.levelRangeMin) {
      toast({
        title: language === 'tr' ? "Seviye Çok Düşük" : "Level Too Low",
        description: `${language === 'tr' ? "Gereken seviye" : "Required level"}: ${region.levelRangeMin}`,
        variant: "destructive",
      });
      return;
    }

    if (skillsBlocked) {
      toast({
        title: language === 'tr' ? "Beceri Seviyesi Yetersiz" : "Skill Level Too Low",
        description: language === 'tr' 
          ? `Bu bölge için en az ${MIN_SKILLS_REQUIRED} beceri gereksinimini karşılamalısınız (${skillsMet} karşılandı)`
          : `You need to meet at least ${MIN_SKILLS_REQUIRED} skill requirements (${skillsMet} met)`,
        variant: "destructive",
      });
      return;
    }

    const dynamicCost = getDynamicTravelCost(region.id);
    const dynamicTime = getDynamicTravelTime(region.id);

    if (region.id === currentRegion) {
      toast({
        title: language === 'tr' ? "Zaten Buradasınız" : "Already Here",
        description: language === 'tr' 
          ? "Zaten bu bölgedesiniz" 
          : "You are already in this region",
      });
      return;
    }

    if (!useTeleportStone && !skipTeleportCheck) {
      const stoneCost = getTeleportStoneCost(region.id);
      if (teleportStoneCount >= stoneCost && stoneCost > 0) {
        setTeleportConfirmRegion(region);
        return;
      }
    }

    if (!useTeleportStone && dynamicCost > 0 && gold < dynamicCost) {
      toast({
        title: language === 'tr' ? "Yetersiz Altın" : "Not Enough Gold",
        description: `${language === 'tr' ? "Gereken" : "Required"}: ${dynamicCost} ${language === 'tr' ? "altın" : "gold"}`,
        variant: "destructive",
      });
      return;
    }

    setTeleportConfirmRegion(null);
    setTravelingTo(region.id);
    setSelectedRegion(null);
    
    try {
      console.log('[TravelPage] Initiating travel to:', region.id, 'useTeleportStone:', useTeleportStone);
      await setCurrentRegion(region.id, useTeleportStone ? { useTeleportStone: true } : undefined);
      trackTravel();
      trackRegionVisited(region.id);
      const localizedName = getLocalizedRegionName(language, region.id) || region.name;
      
      if (useTeleportStone) {
        const stoneCost = getTeleportStoneCost(region.id);
        toast({
          title: language === 'tr' ? "Işınlanma!" : "Teleported!",
          description: language === 'tr' 
            ? `${localizedName} bölgesine ışınlandınız! (${stoneCost} Teleport Stone kullanıldı)`
            : `Teleported to ${localizedName}! (${stoneCost} Teleport Stone used)`,
        });
      } else if (dynamicTime > 0) {
        const timeStr = formatTravelDuration(dynamicTime);
        
        toast({
          title: language === 'tr' ? "Seyahat Başladı" : "Journey Started",
          description: language === 'tr' 
            ? `${localizedName} bölgesine seyahat ediliyor... (${timeStr})`
            : `Traveling to ${localizedName}... (${timeStr})`,
        });
      } else {
        toast({
          title: language === 'tr' ? "Varış" : "Arrived",
          description: `${language === 'tr' ? "Varış noktası" : "Arrived at"}: ${localizedName}`,
        });
      }
    } catch (error: any) {
      console.error('[TravelPage] Travel failed:', error);
      
      let errorTitle: string;
      let errorDescription: string;
      
      if (error?.name === 'TypeError' || error?.message?.includes('fetch') || error?.message?.includes('network')) {
        errorTitle = language === 'tr' ? "Bağlantı Hatası" : "Connection Error";
        errorDescription = language === 'tr' 
          ? "Sunucuya bağlanılamıyor. İnternet bağlantınızı kontrol edin ve tekrar deneyin."
          : "Could not connect to server. Check your connection and try again.";
      } else {
        errorTitle = language === 'tr' ? "Seyahat Hatası" : "Travel Error";
        errorDescription = error?.message || (language === 'tr' ? "Seyahat başarısız oldu" : "Travel failed");
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive",
      });
    } finally {
      setTravelingTo(null);
    }
  };

  const formatRemainingTime = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `${secs}s`;
  };

  const getRegionStyle = (regionId: string) => {
    return REGION_COLORS[regionId] || REGION_COLORS.verdant;
  };

  const formatTravelTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const getSkillIcon = (skill: string) => {
    switch (skill) {
      case 'mining': return <Pickaxe className="w-4 h-4" />;
      case 'woodcutting': return <TreePine className="w-4 h-4" />;
      case 'fishing': return <Fish className="w-4 h-4" />;
      case 'cooking': return <FlameKindling className="w-4 h-4" />;
      case 'alchemy': return <FlaskConical className="w-4 h-4" />;
      case 'crafting': return <Hammer className="w-4 h-4" />;
      default: return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="text-muted-foreground">{t('loading')}</div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="min-h-full pb-24">
        <div className="p-4 border-b border-border/50 bg-card/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/40">
                <Compass className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-primary">
                  {language === 'tr' ? "Dünya Haritası" : "World Map"}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {language === 'tr' ? "Bir bölge seçin" : "Select a region"}
                </p>
              </div>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-card border border-border">
              <GoldDisplay amount={gold} size="sm" />
            </div>
          </div>
          
          {!canTravel && !activeTravel && (
            <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2">
              {isInCombat ? <Swords className="w-4 h-4 text-destructive" /> : <Clock className="w-4 h-4 text-destructive" />}
              <span className="text-xs text-destructive">{travelBlockedReason}</span>
            </div>
          )}
          
          {activeTravel && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Plane className="w-5 h-5 text-primary animate-pulse" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {language === 'tr' ? "Seyahat ediliyor..." : "Traveling to..."}
                    </p>
                    <p className="text-sm font-semibold text-primary">
                      {(() => {
                        const targetRegion = regions.find(r => r.id === activeTravel.targetRegion);
                        return targetRegion 
                          ? (getLocalizedRegionName(language, activeTravel.targetRegion) || targetRegion.name)
                          : activeTravel.targetRegion;
                      })()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-primary font-mono">
                    {formatRemainingTime(remainingTime)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelTravel}
                    disabled={isCancelling}
                    className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"
                    data-testid="mobile-cancel-travel"
                  >
                    <XCircle className="w-5 h-5" />
                  </Button>
                </div>
              </div>
              <Progress 
                value={Math.max(0, 100 - (remainingTime / (activeTravel.endTime - activeTravel.startTime)) * 100)} 
                className="h-1.5"
              />
            </div>
          )}
        </div>

        {isNight && (
          <div className="mx-4 mb-2 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center gap-2">
            <Moon className="w-4 h-4 text-indigo-400" />
            <span className="text-xs text-indigo-400">
              {language === 'tr' 
                ? "Gece seyahati: Daha yavaş ve pahalı (00:00-07:00 UTC)" 
                : "Night travel: Slower and more expensive (00:00-07:00 UTC)"}
            </span>
          </div>
        )}

        <ScrollArea className="h-[calc(100vh-12rem)]">
          <div className="p-4 space-y-3">
            {regions.map((region) => (
              <MobileRegionCard
                key={region.id}
                region={region}
                isCurrentLocation={region.id === currentRegion}
                isLocked={!debugMode && totalLevel < region.levelRangeMin}
                onClick={() => setSelectedRegion(region)}
                gold={gold}
                language={language}
                dynamicTravelCost={getDynamicTravelCost(region.id)}
                dynamicTravelTime={getDynamicTravelTime(region.id)}
                isNight={isNight}
              />
            ))}
          </div>
        </ScrollArea>

        <Dialog open={!!selectedRegion} onOpenChange={(open) => !open && setSelectedRegion(null)}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-hidden p-0">
            {selectedRegion && (
              <>
                <MiniMapPreview region={selectedRegion} allRegions={regions} language={language} />
                
                <div className="p-4">
                  <DialogHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center
                        ${getRegionStyle(selectedRegion.id).bg} 
                        ${getRegionStyle(selectedRegion.id).border} border-2
                      `}>
                        <span className="text-xl">{REGION_ICONS[selectedRegion.id] || "📍"}</span>
                      </div>
                      <div>
                        <DialogTitle className={`text-lg ${getRegionStyle(selectedRegion.id).text}`}>
                          {getLocalizedRegionName(language, selectedRegion.id) || selectedRegion.name}
                        </DialogTitle>
                        <Badge 
                          variant="outline" 
                          className={`mt-1 text-xs ${getRegionStyle(selectedRegion.id).border} ${getRegionStyle(selectedRegion.id).text}`}
                        >
                          Lv {selectedRegion.levelRangeMin} - {selectedRegion.levelRangeMax}
                        </Badge>
                      </div>
                    </div>
                  </DialogHeader>

                  <ScrollArea className="h-[calc(90vh-22rem)]">
                    <div className="space-y-4 pr-2">
                      <DialogDescription className="text-sm text-muted-foreground">
                        {getLocalizedRegionDescription(language, selectedRegion.id) || selectedRegion.description}
                      </DialogDescription>

                      {(() => {
                        const dialogTravelCost = getDynamicTravelCost(selectedRegion.id);
                        const dialogTravelTime = getDynamicTravelTime(selectedRegion.id);
                        return (
                          <div className="space-y-2">
                            <div className="flex gap-4">
                              <div className="flex items-center gap-2 text-sm">
                                <Coins className="w-4 h-4 text-yellow-400" />
                                <span className={gold >= dialogTravelCost ? "text-yellow-400" : "text-destructive"}>
                                  {dialogTravelCost > 0 ? dialogTravelCost.toLocaleString() : language === 'tr' ? 'Ücretsiz' : 'Free'}
                                </span>
                                {isNight && <Moon className="w-3 h-3 text-indigo-400" />}
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <Timer className="w-4 h-4 text-blue-400" />
                                <span className="text-blue-400">
                                  {dialogTravelTime > 0 ? formatTravelDuration(dialogTravelTime) : language === 'tr' ? 'Anında' : 'Instant'}
                                </span>
                              </div>
                            </div>
                            {isNight && (
                              <div className="flex items-center gap-1.5 text-xs text-indigo-400">
                                <Moon className="w-3 h-3" />
                                {language === 'tr' 
                                  ? "Gece seyahati aktif (2.5x zaman, 2x maliyet)" 
                                  : "Night travel active (2.5x time, 2x cost)"}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <Separator />

                      <div>
                        <h3 className="flex items-center gap-2 text-sm font-semibold mb-2">
                          <Skull className="w-4 h-4 text-red-400" />
                          {language === 'tr' ? "Canavarlar & Düşürmeler" : "Monsters & Drops"}
                        </h3>
                        {isLoadingDetails ? (
                          <Skeleton className="h-8 w-full" />
                        ) : monsters.length > 0 ? (
                          <div className="space-y-1">
                            {monsters.map((monster) => {
                              const monsterLevel = Math.round((monster.attackLevel + monster.strengthLevel + monster.defenceLevel) / 3);
                              const isExpanded = expandedMonsters.has(monster.id);
                              const totalXp = monster.xpReward ? (monster.xpReward.attack + monster.xpReward.strength + monster.xpReward.defence + monster.xpReward.hitpoints) : 0;
                              return (
                                <div key={monster.id} className="rounded-md border border-border/60 bg-muted/30 overflow-hidden">
                                  <button
                                    className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted/50 transition-colors"
                                    onClick={() => {
                                      const next = new Set(expandedMonsters);
                                      if (next.has(monster.id)) next.delete(monster.id);
                                      else next.add(monster.id);
                                      setExpandedMonsters(next);
                                    }}
                                    data-testid={`monster-toggle-${monster.id}`}
                                  >
                                    <img src={getMonsterImage(monster.id)} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                                    <span className="text-xs font-medium flex-1 truncate">
                                      {getLocalizedMonsterName(language as Language, monster.id)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">Lv {monsterLevel}</span>
                                    <span className="flex items-center gap-0.5 text-[10px] text-red-400">
                                      <Heart className="w-3 h-3" />{monster.maxHitpoints}
                                    </span>
                                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                                  </button>
                                  {isExpanded && (
                                    <div className="px-2 pb-2 space-y-1.5 border-t border-border/40">
                                      {totalXp > 0 && (
                                        <div className="flex items-center gap-1 text-[10px] text-amber-400 pt-1.5">
                                          <Sparkles className="w-3 h-3" />
                                          <span>{totalXp} XP</span>
                                        </div>
                                      )}
                                      {monster.loot && monster.loot.length > 0 ? (
                                        <div className="space-y-1">
                                          <span className="text-[10px] font-medium text-muted-foreground">
                                            {language === 'tr' ? "Düşürmeler" : "Drops"}:
                                          </span>
                                          {monster.loot.map((drop, i) => (
                                            <div key={i} className="flex items-center gap-1.5 pl-1">
                                              <img src={getItemImage(drop.itemId)} alt="" className="w-5 h-5 rounded object-cover shrink-0" />
                                              <span className="text-[11px] flex-1 truncate">{translateItemName(drop.itemId, language)}</span>
                                              <span className="text-[10px] text-muted-foreground">
                                                {drop.minQty === drop.maxQty ? drop.minQty : `${drop.minQty}-${drop.maxQty}`}
                                              </span>
                                              <span className="text-[10px] text-yellow-400 font-medium">
                                                {Math.round(drop.chance)}%
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-[10px] text-muted-foreground pt-1">
                                          {language === 'tr' ? "Drop yok" : "No drops"}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {language === 'tr' ? "Bu bölgede canavar yok" : "No monsters"}
                          </p>
                        )}
                      </div>

                      <div>
                        <h3 className="flex items-center gap-2 text-sm font-semibold mb-2">
                          <Pickaxe className="w-4 h-4 text-amber-400" />
                          {language === 'tr' ? "Beceri Gereksinimleri" : "Skill Requirements"}
                        </h3>
                        {isLoadingDetails ? (
                          <Skeleton className="h-8 w-full" />
                        ) : Object.keys(skillRequirements).length > 0 ? (
                          <div className="space-y-1">
                            {['mining', 'woodcutting', 'fishing', 'hunting', 'firemaking', 'cooking', 'alchemy', 'crafting'].map((skill) => {
                              const req = skillRequirements[skill];
                              if (!req || req.count === 0) return null;
                              const playerLevel = skills[skill as keyof typeof skills]?.level || 1;
                              const isLow = playerLevel < req.min;
                              return (
                                <div key={skill}>
                                  <div 
                                    onClick={() => {
                                      const next = new Set(expandedSkills);
                                      if (next.has(skill)) next.delete(skill);
                                      else next.add(skill);
                                      setExpandedSkills(next);
                                    }}
                                    className={`flex items-center justify-between text-xs p-1.5 rounded cursor-pointer transition-colors ${isLow ? 'bg-red-500/20 border border-red-500/40' : 'bg-muted/30 hover:bg-muted/50'}`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      {getSkillIcon(skill)}
                                      <span className="capitalize">{skill}</span>
                                      {(() => {
                                        const skillRecipes = recipes.filter(r => r.skill === skill);
                                        const skillGatherCount = skillActions.filter(a => a.skill === skill).length;
                                        const totalCount = skillRecipes.length + skillGatherCount;
                                        return totalCount > 0 ? (
                                          <span className="text-[10px] text-muted-foreground">({totalCount})</span>
                                        ) : null;
                                      })()}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={isLow ? 'text-red-400' : 'text-muted-foreground'}>
                                        Lv {req.min}-{req.max}
                                      </span>
                                      <span className={`font-bold ${isLow ? 'text-red-400' : 'text-green-400'}`}>
                                        ({language === 'tr' ? 'Sen' : 'You'}: {playerLevel})
                                      </span>
                                      {(recipes.filter(r => r.skill === skill).length > 0 || skillActions.filter(a => a.skill === skill).length > 0) && (
                                        expandedSkills.has(skill) 
                                          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> 
                                          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                      )}
                                    </div>
                                  </div>
                                  {expandedSkills.has(skill) && (() => {
                                    const skillRecipes = recipes.filter(r => r.skill === skill);
                                    const skillGatherActions = skillActions.filter(a => a.skill === skill);
                                    if (skillRecipes.length === 0 && skillGatherActions.length === 0) return null;
                                    return (
                                      <div className="ml-6 mt-1 space-y-0.5 mb-1">
                                        {skillGatherActions.map((action) => (
                                          <div key={action.id} className="flex items-center gap-2 p-1 rounded bg-muted/20 text-[11px]">
                                            {action.itemId && (
                                              <img src={getItemImage(action.itemId)} alt="" className="w-5 h-5 rounded object-cover shrink-0" />
                                            )}
                                            <span className="flex-1 truncate">
                                              {action.itemId ? translateItemName(action.itemId, language) : (action.nameTranslations?.[language] || action.name)}
                                            </span>
                                            <span className="text-muted-foreground shrink-0">Lv {action.levelRequired}</span>
                                          </div>
                                        ))}
                                        {skillRecipes.map((recipe) => (
                                          <div key={recipe.id} className="flex items-center gap-2 p-1 rounded bg-muted/20 text-[11px]">
                                            {recipe.resultItemId && (
                                              <img src={getItemImage(recipe.resultItemId)} alt="" className="w-5 h-5 rounded object-cover shrink-0" />
                                            )}
                                            <span className="flex-1 truncate">
                                              {recipe.resultItemId ? translateItemName(recipe.resultItemId, language) : (recipe.nameTranslations?.[language] || recipe.name)}
                                            </span>
                                            <span className="text-muted-foreground shrink-0">Lv {recipe.levelRequired}</span>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {language === 'tr' ? "Bu bölgede beceri yok" : "No skills in this region"}
                          </p>
                        )}
                        {skillWarnings.length > 0 && (
                          <div className={cn("mt-2 p-2 rounded border", skillsBlocked ? "bg-red-500/20 border-red-500/40" : "bg-amber-500/10 border-amber-500/30")}>
                            <p className={cn("text-xs flex items-center gap-1", skillsBlocked ? "text-red-400" : "text-amber-400")}>
                              {skillsBlocked ? <Lock className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                              {skillsBlocked
                                ? (language === 'tr' 
                                    ? `En az ${MIN_SKILLS_REQUIRED} beceri gereksinimi karşılanmalı (${skillsMet} karşılandı)`
                                    : `Meet at least ${MIN_SKILLS_REQUIRED} skill requirements (${skillsMet} met)`)
                                : (language === 'tr'
                                    ? `${skillWarnings.length} beceri için seviyeniz düşük ama seyahat edebilirsiniz`
                                    : `${skillWarnings.length} skill(s) below level but you can still travel`)}
                            </p>
                          </div>
                        )}
                      </div>

                    </div>
                  </ScrollArea>

                  <div className="pt-4 border-t border-border mt-4">
                    {(() => {
                      const btnTravelCost = getDynamicTravelCost(selectedRegion.id);
                      const btnTravelTime = getDynamicTravelTime(selectedRegion.id);
                      return selectedRegion.id === currentRegion ? (
                        <div className="w-full p-3 text-center rounded-md bg-primary/10 border border-primary/30">
                          <span className="flex items-center justify-center gap-2 text-sm text-primary">
                            <MapPin className="w-4 h-4" />
                            {language === 'tr' ? "Şu an buradasınız" : "You are here"}
                          </span>
                        </div>
                      ) : (
                        <Button
                          data-testid={`mobile-travel-button-${selectedRegion.id}`}
                          onClick={() => handleTravel(selectedRegion)}
                          disabled={
                            (!debugMode && totalLevel < selectedRegion.levelRangeMin) || 
                            skillsBlocked ||
                            !canTravel || 
                            travelingTo === selectedRegion.id ||
                            (btnTravelCost > 0 && gold < btnTravelCost && !(teleportStoneCount >= getTeleportStoneCost(selectedRegion.id) && getTeleportStoneCost(selectedRegion.id) > 0))
                          }
                          className={`
                            w-full h-11
                            ${(!debugMode && totalLevel < selectedRegion.levelRangeMin) || skillsBlocked || !canTravel || (btnTravelCost > 0 && gold < btnTravelCost && !(teleportStoneCount >= getTeleportStoneCost(selectedRegion.id) && getTeleportStoneCost(selectedRegion.id) > 0))
                              ? 'bg-muted text-muted-foreground' 
                              : `bg-gradient-to-r ${getRegionStyle(selectedRegion.id).gradient} hover:opacity-90 text-white border ${getRegionStyle(selectedRegion.id).border}`
                            }
                          `}
                          variant={(!debugMode && totalLevel < selectedRegion.levelRangeMin) || skillsBlocked || !canTravel ? "secondary" : "default"}
                        >
                          {travelingTo === selectedRegion.id ? (
                            <><span className="animate-spin mr-2">⏳</span>{language === 'tr' ? "Seyahat ediliyor..." : "Traveling..."}</>
                          ) : !debugMode && totalLevel < selectedRegion.levelRangeMin ? (
                            <><Lock className="w-4 h-4 mr-2" />{language === 'tr' ? "Gereken" : "Requires"} Lv {selectedRegion.levelRangeMin}</>
                          ) : skillsBlocked ? (
                            <><Lock className="w-4 h-4 mr-2" />{language === 'tr' ? "Beceri Seviyesi Yetersiz" : "Skills Too Low"}</>
                          ) : !canTravel ? (
                            <><Lock className="w-4 h-4 mr-2" />{language === 'tr' ? "Seyahat Edilemez" : "Cannot Travel"}</>
                          ) : btnTravelCost > 0 && gold < btnTravelCost ? (
                            <><Coins className="w-4 h-4 mr-2" />{language === 'tr' ? "Yetersiz Altın" : "Not Enough Gold"}</>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Compass className="w-5 h-5" />
                              <span>{t('travel')}</span>
                              {(btnTravelCost > 0 || btnTravelTime > 0) && (
                                <span className="text-xs opacity-75">
                                  ({btnTravelCost > 0 && `${btnTravelCost}g`}
                                  {btnTravelCost > 0 && btnTravelTime > 0 && ' • '}
                                  {btnTravelTime > 0 && formatTravelDuration(btnTravelTime)})
                                </span>
                              )}
                            </div>
                          )}
                        </Button>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {teleportConfirmRegion && (
          <Dialog open={!!teleportConfirmRegion} onOpenChange={(open) => !open && setTeleportConfirmRegion(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <img src={getItemImage("teleport_stone")} alt="Teleport Stone" className="w-8 h-8 rounded" />
                  {language === 'tr' ? 'Teleport Stone Kullan' : 'Use Teleport Stone'}
                </DialogTitle>
                <DialogDescription>
                  {language === 'tr' 
                    ? `${getLocalizedRegionName(language, teleportConfirmRegion.id) || teleportConfirmRegion.name} bölgesine anında ışınlanmak ister misiniz?`
                    : `Would you like to teleport instantly to ${getLocalizedRegionName(language, teleportConfirmRegion.id) || teleportConfirmRegion.name}?`
                  }
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                  <div className="flex items-center gap-2">
                    <img src={getItemImage("teleport_stone")} alt="Teleport Stone" className="w-6 h-6 rounded" />
                    <span className="text-sm font-medium text-purple-300">
                      {language === 'tr' ? 'Gereken' : 'Required'}: {getTeleportStoneCost(teleportConfirmRegion.id)} Teleport Stone
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {language === 'tr' ? 'Mevcut' : 'Available'}: {teleportStoneCount}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
                  <span className="text-sm text-muted-foreground">
                    {language === 'tr' ? 'Normal seyahat' : 'Normal travel'}:
                  </span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="flex items-center gap-1 text-yellow-400">
                      <Coins className="w-3.5 h-3.5" />
                      {getDynamicTravelCost(teleportConfirmRegion.id)}
                    </span>
                    <span className="flex items-center gap-1 text-blue-400">
                      <Clock className="w-3.5 h-3.5" />
                      {formatTravelDuration(getDynamicTravelTime(teleportConfirmRegion.id))}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    const region = teleportConfirmRegion;
                    setTeleportConfirmRegion(null);
                    if (region) handleTravel(region, false, true);
                  }}
                  disabled={gold < getDynamicTravelCost(teleportConfirmRegion.id)}
                  data-testid="mobile-travel-normal-btn"
                >
                  <Coins className="w-4 h-4 mr-1.5 text-yellow-400" />
                  {language === 'tr' ? 'Normal Seyahat' : 'Normal Travel'}
                </Button>
                <Button 
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  onClick={() => handleTravel(teleportConfirmRegion, true)}
                  data-testid="mobile-travel-teleport-btn"
                >
                  <Plane className="w-4 h-4 mr-1.5" />
                  {language === 'tr' ? 'Işınlan' : 'Teleport'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {taskStopConfirm && (
          <Dialog open={!!taskStopConfirm} onOpenChange={(open) => !open && setTaskStopConfirm(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {language === 'tr' ? 'Görevi Durdur' : 'Stop Task'}
                </DialogTitle>
                <DialogDescription>
                  {taskQueue.length > 0
                    ? language === 'tr'
                      ? `Aktif göreviniz ve sıradaki ${taskQueue.length} görev iptal edilecek. Seyahat etmek istiyor musunuz?`
                      : `Your active task and ${taskQueue.length} queued task${taskQueue.length > 1 ? 's' : ''} will be cancelled. Continue to travel?`
                    : language === 'tr'
                    ? 'Seyahat etmek için aktif görevinizi durdurmak ister misiniz?'
                    : 'Would you like to stop your active task to travel?'}
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setTaskStopConfirm(null)}
                  data-testid="task-stop-cancel-btn"
                >
                  {language === 'tr' ? 'İptal' : 'Cancel'}
                </Button>
                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                  onClick={async () => {
                    const { region, useTeleportStone } = taskStopConfirm;
                    setTaskStopConfirm(null);
                    // Stop task with skipQueueAdvance=true AND clear queue so it never re-shows the dialog
                    await stopTask(undefined, true);
                    await clearQueue();
                    setTimeout(() => handleTravel(region, useTeleportStone, true), 100);
                  }}
                  data-testid="task-stop-confirm-btn"
                >
                  {language === 'tr' ? 'Durdur ve Seyahat Et' : 'Stop & Travel'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <div ref={mapContainerRef} className="relative w-full h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] overflow-hidden">
      <div 
        className="absolute inset-0 bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: `url('/images/world-map.webp')` }}
      >
        <div className="absolute inset-0 bg-black/30" />
      </div>

      <div className="absolute top-4 left-4 right-4 z-10">
        <div className="bg-card/90 backdrop-blur-md border border-border rounded-lg p-3 md:p-4 max-w-md">
          <div className="flex items-center gap-3">
            <Compass className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-lg md:text-xl font-display text-primary">
                {language === 'tr' ? "Dünya Haritası" : "World Map"}
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                {language === 'tr' 
                  ? "Bir bölge seçin ve keşfedin"
                  : "Select a region to explore"}
              </p>
            </div>
          </div>
          
          {!canTravel && !activeTravel && (
            <div className="mt-3 p-2 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2">
              {isInCombat ? (
                <Swords className="w-4 h-4 text-destructive" />
              ) : (
                <Clock className="w-4 h-4 text-destructive" />
              )}
              <span className="text-xs text-destructive">
                {travelBlockedReason}
              </span>
            </div>
          )}
        </div>
      </div>

      {activeTravel && (
        <div className="absolute top-24 left-4 right-4 z-10 md:top-28 md:max-w-md">
          <div className="bg-card/95 backdrop-blur-md border border-primary/50 rounded-lg p-4 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 animate-pulse">
                  <Plane className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {language === 'tr' ? "Seyahat ediliyor..." : "Traveling to..."}
                  </p>
                  <p className="text-sm font-semibold text-primary truncate">
                    {(() => {
                      const targetRegion = regions.find(r => r.id === activeTravel.targetRegion);
                      return targetRegion 
                        ? (getLocalizedRegionName(language, activeTravel.targetRegion) || targetRegion.name)
                        : activeTravel.targetRegion;
                    })()}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-center">
                  <div className="text-xl font-bold text-primary font-mono">
                    {formatRemainingTime(remainingTime)}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {language === 'tr' ? "kalan" : "remaining"}
                  </p>
                </div>
                
                <Button
                  data-testid="cancel-travel-button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelTravel}
                  disabled={isCancelling}
                  className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"
                >
                  {isCancelling ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                </Button>
              </div>
            </div>
            
            <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-1000 ease-linear"
                style={{
                  width: `${Math.max(0, 100 - (remainingTime / (activeTravel.endTime - activeTravel.startTime)) * 100)}%`
                }}
              />
            </div>
            
            <p className="mt-2 text-[10px] text-muted-foreground text-center">
              {language === 'tr' 
                ? `İptal edilirse ${activeTravel.cost} altın iade edilir`
                : `Cancel to refund ${activeTravel.cost} gold`}
            </p>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 right-4 z-10">
        <div className="bg-card/90 backdrop-blur-md border border-border rounded-lg px-3 py-2">
          <GoldDisplay amount={gold} size="sm" />
        </div>
      </div>

      <div
        className="absolute"
        style={mapBounds ? {
          left: mapBounds.left,
          top: mapBounds.top,
          width: mapBounds.width,
          height: mapBounds.height,
        } : {
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
        }}
      >
          {regions.map((region) => {
            const style = getRegionStyle(region.id);
            const isCurrentLocation = region.id === currentRegion;
            const isLocked = !debugMode && totalLevel < region.levelRangeMin;
            const isTraveling = travelingTo === region.id;
            const position = region.mapPosition || { x: 50, y: 50 };
            
            return (
              <button
                key={region.id}
                data-testid={`region-icon-${region.id}`}
                onClick={() => setSelectedRegion(region)}
                disabled={isTraveling}
                className={`
                  absolute transform -translate-x-1/2 -translate-y-1/2
                  w-12 h-12 md:w-16 md:h-16 rounded-full
                  flex items-center justify-center
                  border-2 ${style.border}
                  ${style.bg} backdrop-blur-sm
                  transition-all duration-300
                  ${isCurrentLocation 
                    ? `ring-4 ring-primary ring-offset-2 ring-offset-transparent shadow-lg ${style.glow} shadow-xl animate-pulse` 
                    : 'hover:scale-110 hover:shadow-lg'}
                  ${isLocked ? 'opacity-50 grayscale' : ''}
                  ${isTraveling ? 'animate-bounce' : ''}
                  group cursor-pointer
                `}
                style={{
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                }}
              >
                <span className="text-xl md:text-2xl">
                  {REGION_ICONS[region.id] || "📍"}
                </span>
                
                {isCurrentLocation && (
                  <div className="absolute -top-1 -right-1">
                    <div className="w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                      <MapPin className="w-3 h-3 text-primary-foreground" />
                    </div>
                  </div>
                )}
                
                {isLocked && (
                  <div className="absolute -top-1 -right-1">
                    <div className="w-4 h-4 bg-destructive rounded-full flex items-center justify-center">
                      <Lock className="w-2.5 h-2.5 text-destructive-foreground" />
                    </div>
                  </div>
                )}

                <div className={`
                  absolute -bottom-8 left-1/2 -translate-x-1/2 
                  whitespace-nowrap px-2 py-1 rounded-md
                  bg-card/95 backdrop-blur-sm border ${style.border}
                  opacity-0 group-hover:opacity-100 transition-opacity
                  text-xs ${style.text} font-medium
                  pointer-events-none
                `}>
                  {getLocalizedRegionName(language, region.id) || region.name}
                </div>
              </button>
            );
          })}
      </div>

      <Dialog open={!!selectedRegion} onOpenChange={(open) => !open && setSelectedRegion(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden">
          {selectedRegion && (
            <>
              <DialogHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className={`
                    w-12 h-12 rounded-full flex items-center justify-center
                    ${getRegionStyle(selectedRegion.id).bg} 
                    ${getRegionStyle(selectedRegion.id).border} border-2
                  `}>
                    <span className="text-2xl">{REGION_ICONS[selectedRegion.id] || "📍"}</span>
                  </div>
                  <div>
                    <DialogTitle className={`text-xl ${getRegionStyle(selectedRegion.id).text}`}>
                      {getLocalizedRegionName(language, selectedRegion.id) || selectedRegion.name}
                    </DialogTitle>
                    <Badge 
                      variant="outline" 
                      className={`mt-1 ${getRegionStyle(selectedRegion.id).border} ${getRegionStyle(selectedRegion.id).text}`}
                    >
                      Lv {selectedRegion.levelRangeMin} - {selectedRegion.levelRangeMax}
                    </Badge>
                  </div>
                </div>
              </DialogHeader>

              <ScrollArea className="h-[calc(90vh-16rem)] pr-4">
                <div className="space-y-6">
                  <DialogDescription className="text-sm text-muted-foreground">
                    {getLocalizedRegionDescription(language, selectedRegion.id) || selectedRegion.description}
                  </DialogDescription>

                  {(() => {
                    const desktopTravelCost = getDynamicTravelCost(selectedRegion.id);
                    const desktopTravelTime = getDynamicTravelTime(selectedRegion.id);
                    return (
                      <div className="space-y-2">
                        <div className="flex gap-4">
                          <div className="flex items-center gap-2 text-sm">
                            <Coins className="w-4 h-4 text-yellow-400" />
                            <span className={gold >= desktopTravelCost ? "text-yellow-400" : "text-destructive"}>
                              {desktopTravelCost > 0 ? desktopTravelCost.toLocaleString() : language === 'tr' ? 'Ücretsiz' : 'Free'}
                            </span>
                            {isNight && <Moon className="w-3 h-3 text-indigo-400" />}
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Timer className="w-4 h-4 text-blue-400" />
                            <span className="text-blue-400">
                              {desktopTravelTime > 0 ? formatTravelDuration(desktopTravelTime) : language === 'tr' ? 'Anında' : 'Instant'}
                            </span>
                          </div>
                        </div>
                        {isNight && (
                          <div className="flex items-center gap-1.5 text-xs text-indigo-400">
                            <Moon className="w-3 h-3" />
                            {language === 'tr' 
                              ? "Gece seyahati aktif (2.5x zaman, 2x maliyet)" 
                              : "Night travel active (2.5x time, 2x cost)"}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <Separator />

                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
                      <Skull className="w-4 h-4 text-red-400" />
                      {language === 'tr' ? "Canavarlar & Düşürmeler" : "Monsters & Drops"}
                    </h3>
                    {isLoadingDetails ? (
                      <div className="space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    ) : monsters.length > 0 ? (
                      <div className="space-y-2">
                        {monsters.map((monster) => {
                          const monsterLevel = Math.round((monster.attackLevel + monster.strengthLevel + monster.defenceLevel) / 3);
                          const isExpanded = expandedMonsters.has(monster.id);
                          const totalXp = monster.xpReward ? (monster.xpReward.attack + monster.xpReward.strength + monster.xpReward.defence + monster.xpReward.hitpoints) : 0;
                          return (
                            <div key={monster.id} className="rounded-lg border border-border bg-muted/40 overflow-hidden">
                              <button
                                className="w-full flex items-center gap-2.5 p-2.5 text-left hover:bg-muted/60 transition-colors"
                                onClick={() => {
                                  const next = new Set(expandedMonsters);
                                  if (next.has(monster.id)) next.delete(monster.id);
                                  else next.add(monster.id);
                                  setExpandedMonsters(next);
                                }}
                                data-testid={`desktop-monster-toggle-${monster.id}`}
                              >
                                <img src={getMonsterImage(monster.id)} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                                <span className="text-sm font-medium flex-1 truncate">
                                  {getLocalizedMonsterName(language as Language, monster.id)}
                                </span>
                                <span className="text-xs text-muted-foreground">Lv {monsterLevel}</span>
                                <span className="flex items-center gap-1 text-xs text-red-400">
                                  <Heart className="w-3.5 h-3.5" />{monster.maxHitpoints}
                                </span>
                                {totalXp > 0 && (
                                  <span className="flex items-center gap-1 text-xs text-amber-400">
                                    <Sparkles className="w-3.5 h-3.5" />{totalXp}
                                  </span>
                                )}
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                              </button>
                              {isExpanded && (
                                <div className="px-3 pb-3 border-t border-border/40">
                                  {monster.loot && monster.loot.length > 0 ? (
                                    <div className="pt-2">
                                      <span className="text-xs font-medium text-muted-foreground mb-1.5 block">
                                        {language === 'tr' ? "Düşürmeler" : "Drops"}
                                      </span>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        {monster.loot.map((drop, i) => (
                                          <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-background/50 border border-border/30">
                                            <img src={getItemImage(drop.itemId)} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <span className="text-xs truncate block">{translateItemName(drop.itemId, language)}</span>
                                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                <span>{drop.minQty === drop.maxQty ? drop.minQty : `${drop.minQty}-${drop.maxQty}`}</span>
                                                <span className="text-yellow-400 font-medium">{Math.round(drop.chance)}%</span>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground pt-2">
                                      {language === 'tr' ? "Drop yok" : "No drops"}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {language === 'tr' ? "Bu bölgede canavar yok" : "No monsters in this region"}
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
                      <Pickaxe className="w-4 h-4 text-amber-400" />
                      {language === 'tr' ? "Beceri Gereksinimleri" : "Skill Requirements"}
                    </h3>
                    {isLoadingDetails ? (
                      <div className="space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    ) : Object.keys(skillRequirements).length > 0 ? (
                      <div className="space-y-2">
                        {['mining', 'woodcutting', 'fishing', 'hunting', 'firemaking', 'cooking', 'alchemy', 'crafting'].map((skill) => {
                          const req = skillRequirements[skill];
                          if (!req || req.count === 0) return null;
                          const playerLevel = skills[skill as keyof typeof skills]?.level || 1;
                          const isLow = playerLevel < req.min;
                          return (
                            <div key={skill}>
                              <div 
                                onClick={() => {
                                  const next = new Set(expandedSkills);
                                  if (next.has(skill)) next.delete(skill);
                                  else next.add(skill);
                                  setExpandedSkills(next);
                                }}
                                className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${isLow ? 'bg-red-500/20 border border-red-500/40' : 'bg-muted/50 border border-border hover:bg-muted/70'}`}
                              >
                                <div className="flex items-center gap-2">
                                  {getSkillIcon(skill)}
                                  <span className="text-sm font-medium capitalize">{skill}</span>
                                  <span className="text-xs text-muted-foreground">({(() => {
                                    const rc = recipes.filter(r => r.skill === skill).length;
                                    const gc = skillActions.filter(a => a.skill === skill).length;
                                    return rc + gc;
                                  })()})</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={`text-sm ${isLow ? 'text-red-400' : 'text-muted-foreground'}`}>
                                    Lv {req.min} - {req.max}
                                  </span>
                                  <Badge variant={isLow ? "destructive" : "secondary"} className="text-xs">
                                    {language === 'tr' ? 'Sen' : 'You'}: {playerLevel}
                                  </Badge>
                                  {(recipes.filter(r => r.skill === skill).length > 0 || skillActions.filter(a => a.skill === skill).length > 0) && (
                                    expandedSkills.has(skill) 
                                      ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> 
                                      : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                  )}
                                </div>
                              </div>
                              {expandedSkills.has(skill) && (() => {
                                const skillRecipes = recipes.filter(r => r.skill === skill);
                                const skillGatherActions = skillActions.filter(a => a.skill === skill);
                                if (skillRecipes.length === 0 && skillGatherActions.length === 0) return null;
                                return (
                                  <div className="ml-7 mt-1.5 space-y-1 mb-1.5">
                                    {skillGatherActions.map((action) => (
                                      <div key={action.id} className="flex items-center gap-2 p-1.5 rounded-md bg-muted/30 border border-border/30">
                                        {action.itemId && (
                                          <img src={getItemImage(action.itemId)} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                                        )}
                                        <span className="text-xs font-medium flex-1 truncate">
                                          {action.itemId ? translateItemName(action.itemId, language) : (action.nameTranslations?.[language] || action.name)}
                                        </span>
                                        <span className="text-xs text-muted-foreground shrink-0">Lv {action.levelRequired}</span>
                                      </div>
                                    ))}
                                    {skillRecipes.map((recipe) => (
                                      <div key={recipe.id} className="flex items-center gap-2 p-1.5 rounded-md bg-muted/30 border border-border/30">
                                        {recipe.resultItemId && (
                                          <img src={getItemImage(recipe.resultItemId)} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                                        )}
                                        <span className="text-xs font-medium flex-1 truncate">
                                          {recipe.resultItemId ? translateItemName(recipe.resultItemId, language) : (recipe.nameTranslations?.[language] || recipe.name)}
                                        </span>
                                        <span className="text-xs text-muted-foreground shrink-0">Lv {recipe.levelRequired}</span>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                        {skillWarnings.length > 0 && (
                          <div className={cn("mt-3 p-3 rounded-md border", skillsBlocked ? "bg-red-500/20 border-red-500/40" : "bg-amber-500/10 border-amber-500/30")}>
                            <p className={cn("text-sm flex items-center gap-2", skillsBlocked ? "text-red-400" : "text-amber-400")}>
                              {skillsBlocked ? <Lock className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                              {skillsBlocked
                                ? (language === 'tr' 
                                    ? `En az ${MIN_SKILLS_REQUIRED} beceri gereksinimi karşılanmalı (${skillsMet} karşılandı)`
                                    : `Meet at least ${MIN_SKILLS_REQUIRED} skill requirements (${skillsMet} met)`)
                                : (language === 'tr'
                                    ? `${skillWarnings.length} beceri için seviyeniz düşük ama seyahat edebilirsiniz`
                                    : `${skillWarnings.length} skill(s) below level but you can still travel`)}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {language === 'tr' ? "Bu bölgede beceri yok" : "No skills in this region"}
                      </p>
                    )}
                  </div>

                </div>
              </ScrollArea>

              <div className="pt-4 border-t border-border">
                {(() => {
                  const desktopBtnCost = getDynamicTravelCost(selectedRegion.id);
                  const desktopBtnTime = getDynamicTravelTime(selectedRegion.id);
                  return selectedRegion.id === currentRegion ? (
                    <div className="w-full p-3 text-center rounded-md bg-primary/10 border border-primary/30">
                      <span className="flex items-center justify-center gap-2 text-sm text-primary">
                        <MapPin className="w-4 h-4" />
                        {language === 'tr' ? "Şu an buradasınız" : "You are currently here"}
                      </span>
                    </div>
                  ) : (
                    <Button
                      data-testid={`travel-button-${selectedRegion.id}`}
                      onClick={() => handleTravel(selectedRegion)}
                      disabled={
                        (!debugMode && totalLevel < selectedRegion.levelRangeMin) || 
                        skillsBlocked ||
                        !canTravel || 
                        travelingTo === selectedRegion.id ||
                        (desktopBtnCost > 0 && gold < desktopBtnCost && !(teleportStoneCount >= getTeleportStoneCost(selectedRegion.id) && getTeleportStoneCost(selectedRegion.id) > 0))
                      }
                      className={`
                        w-full h-12 text-base transition-all
                        ${(!debugMode && totalLevel < selectedRegion.levelRangeMin) || skillsBlocked || !canTravel || (desktopBtnCost > 0 && gold < desktopBtnCost && !(teleportStoneCount >= getTeleportStoneCost(selectedRegion.id) && getTeleportStoneCost(selectedRegion.id) > 0))
                          ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                          : `bg-gradient-to-r ${getRegionStyle(selectedRegion.id).gradient} hover:opacity-90 text-white border ${getRegionStyle(selectedRegion.id).border}`
                        }
                      `}
                      variant={(!debugMode && totalLevel < selectedRegion.levelRangeMin) || skillsBlocked || !canTravel ? "secondary" : "default"}
                    >
                      {travelingTo === selectedRegion.id ? (
                        <>
                          <span className="animate-spin mr-2">⏳</span>
                          {language === 'tr' ? "Seyahat ediliyor..." : "Traveling..."}
                        </>
                      ) : !debugMode && totalLevel < selectedRegion.levelRangeMin ? (
                        <>
                          <Lock className="w-4 h-4 mr-2" />
                          {language === 'tr' ? "Gereken" : "Requires"} Lv {selectedRegion.levelRangeMin}
                        </>
                      ) : skillsBlocked ? (
                        <>
                          <Lock className="w-4 h-4 mr-2" />
                          {language === 'tr' ? "Beceri Seviyesi Yetersiz" : "Skills Too Low"}
                        </>
                      ) : !canTravel ? (
                        <>
                          <Lock className="w-4 h-4 mr-2" />
                          {language === 'tr' ? "Seyahat Edilemez" : "Cannot Travel"}
                        </>
                      ) : desktopBtnCost > 0 && gold < desktopBtnCost ? (
                        <>
                          <Coins className="w-4 h-4 mr-2" />
                          {language === 'tr' ? "Yetersiz Altın" : "Not Enough Gold"}
                        </>
                      ) : (
                        <div className="flex items-center gap-3">
                          <Compass className="w-5 h-5" />
                          <span>{t('travel')}</span>
                          {(desktopBtnCost > 0 || desktopBtnTime > 0) && (
                            <span className="text-xs opacity-75">
                              ({desktopBtnCost > 0 && `${desktopBtnCost}g`}
                              {desktopBtnCost > 0 && desktopBtnTime > 0 && ' • '}
                              {desktopBtnTime > 0 && formatTravelDuration(desktopBtnTime)})
                            </span>
                          )}
                        </div>
                      )}
                    </Button>
                  );
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {regions.length === 0 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-card/90 backdrop-blur-md border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">
              {language === 'tr' ? "Bölge bulunamadı" : "No regions available"}
            </p>
          </div>
        </div>
      )}

      {teleportConfirmRegion && (
        <Dialog open={!!teleportConfirmRegion} onOpenChange={(open) => !open && setTeleportConfirmRegion(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <img src={getItemImage("teleport_stone")} alt="Teleport Stone" className="w-8 h-8 rounded" />
                {language === 'tr' ? 'Teleport Stone Kullan' : 'Use Teleport Stone'}
              </DialogTitle>
              <DialogDescription>
                {language === 'tr' 
                  ? `${getLocalizedRegionName(language, teleportConfirmRegion.id) || teleportConfirmRegion.name} bölgesine anında ışınlanmak ister misiniz?`
                  : `Would you like to teleport instantly to ${getLocalizedRegionName(language, teleportConfirmRegion.id) || teleportConfirmRegion.name}?`
                }
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                <div className="flex items-center gap-2">
                  <img src={getItemImage("teleport_stone")} alt="Teleport Stone" className="w-6 h-6 rounded" />
                  <span className="text-sm font-medium text-purple-300">
                    {language === 'tr' ? 'Gereken' : 'Required'}: {getTeleportStoneCost(teleportConfirmRegion.id)} Teleport Stone
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {language === 'tr' ? 'Mevcut' : 'Available'}: {teleportStoneCount}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
                <span className="text-sm text-muted-foreground">
                  {language === 'tr' ? 'Normal seyahat' : 'Normal travel'}:
                </span>
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1 text-yellow-400">
                    <Coins className="w-3.5 h-3.5" />
                    {getDynamicTravelCost(teleportConfirmRegion.id)}
                  </span>
                  <span className="flex items-center gap-1 text-blue-400">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTravelDuration(getDynamicTravelTime(teleportConfirmRegion.id))}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => {
                  const region = teleportConfirmRegion;
                  setTeleportConfirmRegion(null);
                  if (region) handleTravel(region, false, true);
                }}
                disabled={gold < getDynamicTravelCost(teleportConfirmRegion.id)}
                data-testid="travel-normal-btn"
              >
                <Coins className="w-4 h-4 mr-1.5 text-yellow-400" />
                {language === 'tr' ? 'Normal Seyahat' : 'Normal Travel'}
              </Button>
              <Button 
                className="flex-1 bg-purple-600 hover:bg-purple-700"
                onClick={() => handleTravel(teleportConfirmRegion, true)}
                data-testid="travel-teleport-btn"
              >
                <Plane className="w-4 h-4 mr-1.5" />
                {language === 'tr' ? 'Işınlan' : 'Teleport'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
