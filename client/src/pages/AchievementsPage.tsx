import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGame } from "@/context/GameContext";
import { useToast } from "@/hooks/use-toast";
import { useMobile } from "@/hooks/useMobile";
import { useLanguage } from "@/context/LanguageContext";
import { formatNumber } from "@/lib/gameMath";
import { cn } from "@/lib/utils";
import { getAuthHeaders } from "@/context/FirebaseAuthContext";
import { getTranslation, type Language } from "@/lib/i18n";
import { getAchievementImage } from "@/lib/achievementImages";
import { getPendingCounters } from "@/hooks/useAchievementTracker";
import { RetryImage } from "@/components/ui/retry-image";
import {
  Trophy, Sword, Star, Hammer, FishSimple, Fire, Flask, CookingPot,
  Coins, UsersThree, Compass, Shield, Door, Medal, CheckCircle,
  Lock, CaretRight, Crown, Target, Axe
} from "@phosphor-icons/react";
import { Pickaxe } from "lucide-react";
import type { Achievement, AchievementTier, AchievementCategory } from "@shared/schema";
import type { ActiveAchievementBuff } from "@shared/achievementBuffs";
import { ACHIEVEMENT_MILESTONE_BUFFS } from "@shared/achievementBuffs";

function getBuffLabel(buffType: string, skillId?: string): string {
  switch (buffType) {
    case 'attackPercent': return 'Attack';
    case 'defencePercent': return 'Defence';
    case 'maxHp': return 'Max HP';
    case 'skillSpeed': return `${(skillId || 'Skill').charAt(0).toUpperCase() + (skillId || 'skill').slice(1)} Speed`;
    case 'goldBonus': return 'Gold Bonus';
    case 'xpBonus': return 'XP Bonus';
    case 'lootChance': return 'Loot Chance';
    default: return buffType;
  }
}

function formatBuffValue(buffType: string, value: number): string {
  if (buffType === 'maxHp') return `+${value}`;
  return `+${value}%`;
}

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; i18nKey: string; color: string }> = {
  all: { icon: Trophy, i18nKey: "achievementCatAll", color: "text-amber-400" },
  combat: { icon: Sword, i18nKey: "achievementCatCombat", color: "text-red-400" },
  skills: { icon: Star, i18nKey: "achievementCatSkills", color: "text-blue-400" },
  gathering: { icon: Axe, i18nKey: "achievementCatGathering", color: "text-green-400" },
  crafting: { icon: Hammer, i18nKey: "achievementCatCrafting", color: "text-orange-400" },
  cooking: { icon: CookingPot, i18nKey: "achievementCatCooking", color: "text-yellow-400" },
  alchemy: { icon: Flask, i18nKey: "achievementCatAlchemy", color: "text-purple-400" },
  firemaking: { icon: Fire, i18nKey: "achievementCatFiremaking", color: "text-red-300" },
  economy: { icon: Coins, i18nKey: "achievementCatEconomy", color: "text-amber-300" },
  social: { icon: UsersThree, i18nKey: "achievementCatSocial", color: "text-cyan-400" },
  exploration: { icon: Compass, i18nKey: "achievementCatExploration", color: "text-teal-400" },
  equipment: { icon: Shield, i18nKey: "achievementCatEquipment", color: "text-indigo-400" },
  dungeons: { icon: Door, i18nKey: "achievementCatDungeons", color: "text-violet-400" },
  general: { icon: Medal, i18nKey: "achievementCatGeneral", color: "text-zinc-300" },
};

function getCategoryLabel(cat: string, lang: Language): string {
  const config = CATEGORY_CONFIG[cat];
  if (!config) return cat;
  return getTranslation(lang, config.i18nKey as any);
}

function formatThreshold(val: number): string {
  if (val >= 1000000) return `${(val / 1000000).toFixed(val % 1000000 === 0 ? 0 : 1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
  return val.toString();
}

function AchievementCard({ achievement, playerProgress }: {
  achievement: Achievement;
  playerProgress?: { progress: number; completedTiers: number[] };
}) {
  const [expanded, setExpanded] = useState(false);
  const tiersList = (achievement.tiers as AchievementTier[]) || [];
  const progress = playerProgress?.progress || 0;
  const completedTiers = playerProgress?.completedTiers || [];
  const totalTiers = tiersList.length;
  const completedCount = completedTiers.length;
  const allComplete = completedCount === totalTiers;

  const currentTier = tiersList.find(t => !completedTiers.includes(t.tier));
  const currentThreshold = currentTier?.threshold || tiersList[tiersList.length - 1]?.threshold || 1;
  const prevThreshold = currentTier
    ? (tiersList.find(t => t.tier === currentTier.tier - 1)?.threshold || 0)
    : tiersList[tiersList.length - 1]?.threshold || 0;

  const tierProgress = allComplete
    ? 100
    : Math.min(100, Math.max(0, ((progress - prevThreshold) / (currentThreshold - prevThreshold)) * 100));

  const hasBadge = tiersList.some(t => t.badgeId);
  const catConfig = CATEGORY_CONFIG[achievement.category] || CATEGORY_CONFIG.general;
  const CatIcon = catConfig.icon;
  const achievementImg = getAchievementImage(achievement.id);

  return (
    <Card
      className={cn(
        "bg-card/40 border-border/50 transition-all cursor-pointer hover:bg-card/60",
        allComplete && "border-amber-500/30 bg-amber-950/10",
      )}
      onClick={() => setExpanded(!expanded)}
      data-testid={`achievement-card-${achievement.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden",
            allComplete ? "bg-amber-500/20 ring-1 ring-amber-500/40" : "bg-white/5"
          )}>
            {achievementImg ? (
              <RetryImage src={achievementImg} alt={achievement.name} className="w-10 h-10 object-contain" />
            ) : (
              <CatIcon className={cn("w-5 h-5", allComplete ? "text-amber-400" : catConfig.color)} weight="bold" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-sm font-medium truncate",
                allComplete ? "text-amber-300" : "text-foreground"
              )}>
                {achievement.name}
              </span>
              {hasBadge && (
                <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" weight="fill" />
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {achievement.description}
            </p>

            <div className="flex items-center gap-2 mt-1.5">
              <Progress
                value={tierProgress}
                className="h-1.5 flex-1 bg-white/5"
              />
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {allComplete ? (
                  <CheckCircle className="w-3.5 h-3.5 text-amber-400 inline" weight="fill" />
                ) : (
                  `${formatNumber(progress)}/${formatThreshold(currentThreshold)}`
                )}
              </span>
            </div>

            <div className="flex items-center gap-1 mt-1">
              {tiersList.map((t, i) => (
                <div
                  key={t.tier}
                  className={cn(
                    "w-2 h-2 rounded-full",
                    completedTiers.includes(t.tier)
                      ? "bg-amber-400"
                      : "bg-white/10"
                  )}
                />
              ))}
              <span className="text-[10px] text-muted-foreground ml-1">
                {completedCount}/{totalTiers}
              </span>
            </div>
          </div>

          <CaretRight className={cn(
            "w-4 h-4 text-muted-foreground shrink-0 transition-transform mt-1",
            expanded && "rotate-90"
          )} />
        </div>

        {expanded && (
          <div className="mt-3 space-y-1.5 border-t border-border/30 pt-2">
            {tiersList.map((t) => {
              const isCompleted = completedTiers.includes(t.tier);
              const isCurrent = currentTier?.tier === t.tier;
              return (
                <div
                  key={t.tier}
                  className={cn(
                    "flex items-center justify-between px-2 py-1.5 rounded text-xs",
                    isCompleted ? "bg-amber-500/10" : isCurrent ? "bg-white/5" : "opacity-50"
                  )}
                  data-testid={`achievement-tier-${achievement.id}-${t.tier}`}
                >
                  <div className="flex items-center gap-2">
                    {isCompleted ? (
                      <CheckCircle className="w-3.5 h-3.5 text-amber-400" weight="fill" />
                    ) : isCurrent ? (
                      <Target className="w-3.5 h-3.5 text-primary" weight="bold" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    <span className={cn(isCompleted ? "text-amber-300" : "text-foreground")}>
                      Tier {t.tier}: {formatThreshold(t.threshold)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.rewardGold && (
                      <span className="text-amber-400 flex items-center gap-0.5">
                        <Coins className="w-3 h-3" /> {formatThreshold(t.rewardGold)}
                      </span>
                    )}
                    {t.badgeId && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/50 text-amber-400">
                        Badge
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AchievementsPage() {
  const { isMobile } = useMobile();
  const { language } = useLanguage();
  const [activeCategory, setActiveCategory] = useState("all");
  const [showCompleted, setShowCompleted] = useState(true);
  const [localTick, setLocalTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setLocalTick(t => t + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  const { data: buffData } = useQuery({
    queryKey: ["/api/achievement-buffs"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/achievement-buffs", {
        credentials: "include",
        headers: { ...authHeaders, "x-session-token": localStorage.getItem("gameSessionToken") || "" },
      });
      return res.json() as Promise<{ activeBuffs: ActiveAchievementBuff[]; completedCountByCategory: Record<string, number> }>;
    },
    staleTime: 60000,
  });

  const { data: allAchievements = [], isLoading: achLoading } = useQuery({
    queryKey: ["/api/achievements"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/achievements", {
        credentials: "include",
        headers: { ...authHeaders, "x-session-token": localStorage.getItem("gameSessionToken") || "" },
      });
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: playerProgress = [], isLoading: progLoading } = useQuery({
    queryKey: ["/api/player-achievements"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/player-achievements", {
        credentials: "include",
        headers: { ...authHeaders, "x-session-token": localStorage.getItem("gameSessionToken") || "" },
      });
      return res.json();
    },
    staleTime: 30000,
  });

  const progressMap = useMemo(() => {
    const map = new Map<string, { progress: number; completedTiers: number[] }>();
    const pending = getPendingCounters();

    for (const p of playerProgress) {
      map.set(p.achievementId, { progress: p.progress, completedTiers: (p.completedTiers as number[]) || [] });
    }

    if (allAchievements.length > 0) {
      for (const ach of allAchievements) {
        const trackingKey = ach.trackingKey;
        const incrementValue = pending.increments[trackingKey] || 0;
        const setValue = pending.sets[trackingKey] || 0;

        if (incrementValue > 0 || setValue > 0) {
          const existing = map.get(ach.id);
          const currentProgress = existing?.progress || 0;
          let optimisticProgress = currentProgress;

          if (incrementValue > 0) {
            optimisticProgress += incrementValue;
          }
          if (setValue > 0) {
            optimisticProgress = Math.max(optimisticProgress, setValue);
          }

          map.set(ach.id, {
            progress: optimisticProgress,
            completedTiers: existing?.completedTiers || [],
          });
        }
      }
    }

    return map;
  }, [playerProgress, allAchievements, localTick]);

  const filteredAchievements = useMemo(() => {
    let filtered = allAchievements;
    if (activeCategory !== "all") {
      filtered = filtered.filter((a: Achievement) => a.category === activeCategory);
    }
    if (!showCompleted) {
      filtered = filtered.filter((a: Achievement) => {
        const prog = progressMap.get(a.id);
        const tiersList = (a.tiers as AchievementTier[]) || [];
        return !prog || (prog.completedTiers || []).length < tiersList.length;
      });
    }
    filtered = [...filtered].sort((a: Achievement, b: Achievement) => {
      const getPercent = (ach: Achievement) => {
        const tiersList = (ach.tiers as AchievementTier[]) || [];
        if (tiersList.length === 0) return -1;
        const prog = progressMap.get(ach.id);
        if (!prog) return -1;
        const completedCount = (prog.completedTiers || []).length;
        const tierPercent = completedCount / tiersList.length;
        if (tierPercent >= 1) return 1;
        const currentTier = tiersList.find(t => !(prog.completedTiers || []).includes(t.tier));
        if (!currentTier) return 1;
        const prevThreshold = tiersList.find(t => t.tier === currentTier.tier - 1)?.threshold || 0;
        const range = (currentTier.threshold || 1) - prevThreshold;
        const withinTier = range > 0
          ? Math.min(1, Math.max(0, ((prog.progress || 0) - prevThreshold) / range))
          : 0;
        return tierPercent + (withinTier / tiersList.length);
      };
      const diff = getPercent(b) - getPercent(a);
      if (diff !== 0) return diff;
      return (a.name || '').localeCompare(b.name || '');
    });
    return filtered;
  }, [allAchievements, activeCategory, showCompleted, progressMap]);

  const stats = useMemo(() => {
    let total = 0;
    let completed = 0;
    let totalTiers = 0;
    let completedTiers = 0;
    let badgesEarned = 0;

    for (const a of allAchievements) {
      total++;
      const tiersList = (a.tiers as AchievementTier[]) || [];
      totalTiers += tiersList.length;
      const prog = progressMap.get(a.id);
      const ct = prog?.completedTiers || [];
      completedTiers += ct.length;
      if (ct.length === tiersList.length && tiersList.length > 0) completed++;
      for (const t of tiersList) {
        if (t.badgeId && ct.includes(t.tier)) badgesEarned++;
      }
    }

    return { total, completed, totalTiers, completedTiers, badgesEarned };
  }, [allAchievements, progressMap]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const a of allAchievements) cats.add(a.category);

    const catArray = Array.from(cats);
    catArray.sort((a, b) => {
      const getPercent = (cat: string) => {
        const catAch = allAchievements.filter((ach: Achievement) => ach.category === cat);
        let totalTiers = 0;
        let completedTiers = 0;
        for (const ach of catAch) {
          const tiersList = (ach.tiers as any[]) || [];
          totalTiers += tiersList.length;
          const prog = progressMap.get(ach.id);
          const ct = (prog?.completedTiers as number[]) || [];
          completedTiers += ct.length;
        }
        return totalTiers > 0 ? completedTiers / totalTiers : 0;
      };
      return getPercent(b) - getPercent(a);
    });

    return ["all", ...catArray];
  }, [allAchievements, progressMap]);

  const isLoading = achLoading || progLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", isMobile ? "pb-24" : "")} data-testid="achievements-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-6 h-6 text-amber-400" weight="fill" />
          <h1 className="text-lg font-bold text-foreground">Achievements</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-xs">
            {stats.completedTiers}/{stats.totalTiers} Tiers
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="bg-card/40 border-border/30">
          <CardContent className="p-2 text-center">
            <div className="text-lg font-bold text-amber-400">{stats.completed}</div>
            <div className="text-[10px] text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
        <Card className="bg-card/40 border-border/30">
          <CardContent className="p-2 text-center">
            <div className="text-lg font-bold text-primary">{stats.total}</div>
            <div className="text-[10px] text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card className="bg-card/40 border-border/30">
          <CardContent className="p-2 text-center">
            <div className="text-lg font-bold text-purple-400">{stats.badgesEarned}</div>
            <div className="text-[10px] text-muted-foreground">Badges</div>
          </CardContent>
        </Card>
      </div>

      {buffData && buffData.activeBuffs && (
        <Card className="bg-card/40 border-border/30" data-testid="milestone-buffs-section">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-amber-400" weight="fill" />
              <span className="text-sm font-semibold text-foreground">Milestone Buffs</span>
            </div>
            <div className="space-y-1.5">
              {buffData.activeBuffs.map((buff) => {
                const config = CATEGORY_CONFIG[buff.category] || CATEGORY_CONFIG.general;
                const Icon = config.icon;
                const milestoneConfig = ACHIEVEMENT_MILESTONE_BUFFS.find(m => m.category === buff.category);
                const nextValue = milestoneConfig && buff.nextThreshold
                  ? milestoneConfig.values[buff.currentMilestone]
                  : null;
                const progressPercent = buff.nextThreshold
                  ? Math.min(100, (buff.completedCount / buff.nextThreshold) * 100)
                  : 100;

                return (
                  <div key={buff.category} className="flex items-center gap-2" data-testid={`milestone-buff-${buff.category}`}>
                    <Icon className={cn("w-3.5 h-3.5 shrink-0", config.color)} weight="bold" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground truncate">
                          {getCategoryLabel(buff.category, language as Language)}
                          <span className="text-foreground/60 ml-1">{buff.completedCount}/{buff.nextThreshold ?? buff.completedCount}</span>
                        </span>
                        <span className="shrink-0 ml-1">
                          {buff.value > 0 ? (
                            <span className="text-emerald-400 font-medium">
                              {formatBuffValue(buff.buffType, buff.value)} {getBuffLabel(buff.buffType, buff.skillId)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Progress value={progressPercent} className="h-1 flex-1 bg-white/5" />
                        {nextValue !== null && buff.nextThreshold && (
                          <span className="text-[9px] text-muted-foreground/70 shrink-0">
                            next: {formatBuffValue(buff.buffType, nextValue)}
                          </span>
                        )}
                        {buff.nextThreshold === null && buff.value > 0 && (
                          <span className="text-[9px] text-amber-400/70 shrink-0">MAX</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {categories.map(cat => {
          const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.general;
          const Icon = config.icon;
          const isActive = activeCategory === cat;
          const count = cat === "all"
            ? allAchievements.length
            : allAchievements.filter((a: Achievement) => a.category === cat).length;

          return (
            <Button
              key={cat}
              variant={isActive ? "default" : "ghost"}
              size="sm"
              className={cn(
                "shrink-0 h-8 px-2.5 text-xs gap-1.5",
                isActive ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActiveCategory(cat)}
              data-testid={`category-tab-${cat}`}
            >
              <Icon className="w-3.5 h-3.5" weight="bold" />
              <span>{getCategoryLabel(cat, language as Language)}</span>
              <span className="text-[10px] opacity-60">({count})</span>
            </Button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {filteredAchievements.length} {getTranslation(language as Language, "achievements")}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => setShowCompleted(!showCompleted)}
          data-testid="toggle-completed"
        >
          {showCompleted ? "Hide completed" : "Show completed"}
        </Button>
      </div>

      <div className="space-y-2">
        {filteredAchievements.map((a: Achievement) => (
          <AchievementCard
            key={a.id}
            achievement={a}
            playerProgress={progressMap.get(a.id)}
          />
        ))}
        {filteredAchievements.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm" data-testid="no-achievements">
            No achievements found
          </div>
        )}
      </div>
    </div>
  );
}
