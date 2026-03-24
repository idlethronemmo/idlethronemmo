import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Axe, 
  FishSimple, 
  Fire, 
  Hammer, 
  CookingPot, 
  Flask,
  ArrowRight,
  Target
} from "@phosphor-icons/react";
import { Pickaxe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGame } from "@/context/GameContext";
import { getLevelProgress, getXpForLevel, getLevelFromXp, formatNumber } from "@/lib/gameMath";
import { useIsMobile } from "@/hooks/use-mobile";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/context/LanguageContext";

const SKILL_CONFIG = [
  { 
    id: "woodcutting", 
    nameKey: "woodcutting", 
    descKey: "woodcuttingDesc",
    icon: Axe, 
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
    barColor: "bg-gradient-to-r from-amber-500 to-amber-400",
    path: "/skill/woodcutting"
  },
  { 
    id: "mining", 
    nameKey: "mining", 
    descKey: "miningDesc",
    icon: Pickaxe, 
    color: "text-slate-300",
    bgColor: "bg-slate-500/20",
    barColor: "bg-gradient-to-r from-slate-400 to-slate-300",
    path: "/skill/mining"
  },
  { 
    id: "fishing", 
    nameKey: "fishing", 
    descKey: "fishingDesc",
    icon: FishSimple, 
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/20",
    barColor: "bg-gradient-to-r from-cyan-500 to-cyan-400",
    path: "/skill/fishing"
  },
  { 
    id: "hunting", 
    nameKey: "hunting", 
    descKey: "huntingDesc",
    icon: Target, 
    color: "text-amber-500",
    bgColor: "bg-amber-500/20",
    barColor: "bg-gradient-to-r from-amber-600 to-amber-400",
    path: "/skill/hunting"
  },
  { 
    id: "crafting", 
    nameKey: "crafting", 
    descKey: "craftingDesc",
    icon: Hammer, 
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
    barColor: "bg-gradient-to-r from-orange-500 to-orange-400",
    path: "/crafting"
  },
  { 
    id: "cooking", 
    nameKey: "cooking", 
    descKey: "cookingDesc",
    icon: CookingPot, 
    color: "text-rose-400",
    bgColor: "bg-rose-500/20",
    barColor: "bg-gradient-to-r from-rose-500 to-rose-400",
    path: "/skill/cooking"
  },
  { 
    id: "alchemy", 
    nameKey: "alchemy", 
    descKey: "alchemyDesc",
    icon: Flask, 
    color: "text-violet-400",
    bgColor: "bg-violet-500/20",
    barColor: "bg-gradient-to-r from-violet-500 to-violet-400",
    path: "/alchemy"
  },
  { 
    id: "firemaking", 
    nameKey: "firemaking", 
    descKey: "firemakingDesc",
    icon: Fire, 
    color: "text-red-400",
    bgColor: "bg-red-500/20",
    barColor: "bg-gradient-to-r from-red-500 to-orange-500",
    path: "/skill/firemaking"
  }
];

export default function Skills() {
  const { skills } = useGame();
  const { language } = useLanguage();
  const isMobile = useIsMobile();

  return (
      <div className="space-y-4 md:space-y-6">
        <div>
          <h1 className={cn(
            "font-display font-bold text-primary tracking-tight mb-1 md:mb-2",
            isMobile ? "text-2xl" : "text-3xl"
          )}>{t(language, 'skills')}</h1>
          <p className="text-muted-foreground font-ui text-sm md:text-base">
            {t(language, 'skillsSubtitle')}
          </p>
        </div>

        <div className={cn(
          "grid gap-3 md:gap-4",
          isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        )}>
          {SKILL_CONFIG.map((skillConfig) => {
            const Icon = skillConfig.icon;
            const playerSkill = skills[skillConfig.id];
            const xp = playerSkill?.xp ?? 0;
            const level = getLevelFromXp(xp);
            const progress = getLevelProgress(xp);
            const currentLevelXp = getXpForLevel(level);
            const nextLevelXp = getXpForLevel(level + 1);
            const xpInCurrentLevel = xp - currentLevelXp;
            const xpNeeded = nextLevelXp - currentLevelXp;
            
            const CardWrapper = Link;
            const wrapperProps = { href: skillConfig.path, className: "block no-underline" };
            
            return (
              <CardWrapper key={skillConfig.id} {...wrapperProps as any}>
                <Card 
                  className={cn(
                    "bg-card/50 backdrop-blur-sm border-border transition-all group relative overflow-hidden",
                    "hover:border-primary/50 hover:scale-[1.02] cursor-pointer active:scale-[0.98]"
                  )}
                  data-testid={`skill-card-${skillConfig.id}`}
                >
                  <div className={cn(
                    "absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none", 
                    skillConfig.barColor
                  )} />
                  
                  <CardHeader className={cn("pb-2", isMobile && "py-3")}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "rounded-lg border border-white/5",
                          skillConfig.bgColor,
                          isMobile ? "p-1.5" : "p-2"
                        )}>
                          <Icon className={cn(
                            skillConfig.color,
                            isMobile ? "w-5 h-5" : "w-6 h-6"
                          )} />
                        </div>
                        <div>
                          <CardTitle className={cn(
                            "font-display tracking-wide",
                            isMobile ? "text-base" : "text-lg"
                          )}>
                            {t(language, skillConfig.nameKey as any)}
                          </CardTitle>
                          <div className="text-xs font-mono text-muted-foreground">
                            {t(language, 'level')} {level}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {level >= 20 && (
                          <Badge 
                            variant="outline" 
                            className="border-yellow-500/50 text-yellow-500 bg-yellow-500/10 text-[10px] uppercase tracking-wider"
                          >
                            {t(language, 'mastery')}
                          </Badge>
                        )}
                                              </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className={cn("space-y-3 md:space-y-4", isMobile && "pb-3")}>
                    {!isMobile && (
                      <p className="text-xs text-muted-foreground font-ui line-clamp-2 h-8">
                        {t(language, skillConfig.descKey as any)}
                      </p>
                    )}
                    
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-ui uppercase tracking-wider">
                        <span className="text-muted-foreground">{t(language, 'skillProgress')}</span>
                        <span>{formatNumber(xpInCurrentLevel)} / {formatNumber(xpNeeded)} {t(language, 'xp')}</span>
                      </div>
                      <Progress 
                        value={progress} 
                        className="h-1.5 bg-black/40" 
                        indicatorClassName={skillConfig.barColor}
                      />
                    </div>

                    <div className={cn(
                        "flex items-center justify-between text-sm font-display font-bold tracking-wide text-primary/80 group-hover:text-primary transition-colors",
                        isMobile && "pt-1"
                      )}>
                        <span>{t(language, 'trainSkill')} {t(language, skillConfig.nameKey as any)}</span>
                        <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                      </div>
                  </CardContent>
                </Card>
              </CardWrapper>
            );
          })}
        </div>
      </div>
  );
}
