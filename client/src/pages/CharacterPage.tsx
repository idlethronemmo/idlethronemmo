import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useGame } from "@/context/GameContext";
import { getLevelProgress, getXpForLevel, formatNumber } from "@/lib/gameMath";
import { cn } from "@/lib/utils";
import { 
  Axe, 
  FishSimple, 
  Fire, 
  Hammer, 
  CookingPot, 
  Flask,
  User,
  Trophy,
  Sword,
  ShieldStar,
  Clock,
  Star,
  Crown,
  Target,
  Lightning,
  X
} from "@phosphor-icons/react";
import { Pickaxe } from "lucide-react";
import { EquipmentSlot, EQUIPMENT_SLOTS, getItemById, getTotalEquipmentBonus, getItemRarityColor, getItemRarityBgColor, parseItemWithRarity, getBaseItem, hasRarity, translateItemName } from "@/lib/items";
import { getItemImage } from "@/lib/itemImages";
import { useMobile } from "@/hooks/useMobile";
import { useLanguage } from "@/context/LanguageContext";
import { SkillProgressBar } from "@/components/game/SkillProgressBar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getSubClass } from "@shared/subClasses";
import { useMemo } from "react";

const SKILL_CONFIG = {
  woodcutting: { 
    name: "Woodcutting", 
    icon: Axe, 
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
    barColor: "bg-gradient-to-r from-amber-500 to-amber-400"
  },
  mining: { 
    name: "Mining", 
    icon: Pickaxe, 
    color: "text-slate-300",
    bgColor: "bg-slate-500/20",
    barColor: "bg-gradient-to-r from-slate-400 to-slate-300"
  },
  fishing: { 
    name: "Fishing", 
    icon: FishSimple, 
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/20",
    barColor: "bg-gradient-to-r from-cyan-500 to-cyan-400"
  },
  hunting: { 
    name: "Hunting", 
    icon: Target, 
    color: "text-amber-500",
    bgColor: "bg-amber-500/20",
    barColor: "bg-gradient-to-r from-amber-600 to-amber-500"
  },
  crafting: { 
    name: "Crafting", 
    icon: Hammer, 
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
    barColor: "bg-gradient-to-r from-orange-500 to-orange-400"
  },
  cooking: { 
    name: "Cooking", 
    icon: CookingPot, 
    color: "text-rose-400",
    bgColor: "bg-rose-500/20",
    barColor: "bg-gradient-to-r from-rose-500 to-rose-400"
  },
  alchemy: { 
    name: "Alchemy", 
    icon: Flask, 
    color: "text-violet-400",
    bgColor: "bg-violet-500/20",
    barColor: "bg-gradient-to-r from-violet-500 to-violet-400"
  },
  firemaking: { 
    name: "Firemaking", 
    icon: Fire, 
    color: "text-red-400",
    bgColor: "bg-red-500/20",
    barColor: "bg-gradient-to-r from-red-500 to-orange-500"
  }
};

export default function CharacterPage() {
  const { isMobile } = useMobile();
  const { t, language } = useLanguage();
  const { skills, inventory, activeTask, equipment, unequipItem, getEquipmentBonuses } = useGame();
  const bonuses = getEquipmentBonuses();

  const playerSubClass = useMemo(() => {
    const weaponId = equipment?.weapon;
    const bodyId = equipment?.body;
    const weaponItem = weaponId ? getItemById(parseItemWithRarity(weaponId).baseId) : null;
    const bodyItem = bodyId ? getItemById(parseItemWithRarity(bodyId).baseId) : null;
    return getSubClass(weaponItem?.weaponType || null, bodyItem?.armorType || null);
  }, [equipment]);

  const totalLevel = Object.values(skills).reduce((sum, skill) => sum + skill.level, 0);
  const totalXp = Object.values(skills).reduce((sum, skill) => sum + skill.xp, 0);
  const maxTotalLevel = Object.keys(SKILL_CONFIG).length * 99;
  const inventoryCount = Object.values(inventory).reduce((sum, count) => sum + count, 0);
  const uniqueItems = Object.keys(inventory).length;

  const highestSkill = Object.entries(skills).reduce((highest, [id, skill]) => {
    if (skill.level > highest.level) {
      return { id, ...skill };
    }
    return highest;
  }, { id: "", level: 0, xp: 0 });

  const masteredSkills = Object.values(skills).filter(s => s.level >= 50).length;

  return (
      <div className={cn("space-y-6", isMobile && "pb-24")}>
        <Card className="bg-gradient-to-br from-primary/10 to-violet-900/20 border-primary/30 overflow-hidden relative shadow-lg">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet-500/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          
          <CardContent className="pt-6 relative">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              <div className="relative">
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary/30 to-violet-600/30 border-2 border-primary/50 flex items-center justify-center shadow-lg shadow-primary/20">
                  <User className="w-14 h-14 text-primary" weight="bold" />
                </div>
                {activeTask && (
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center animate-pulse">
                    <Lightning className="w-5 h-5 text-green-400" weight="fill" />
                  </div>
                )}
              </div>

              <div className="flex-1 text-center md:text-left">
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-2">
                  <h1 className="text-3xl font-display font-bold text-foreground tracking-tight" data-testid="text-username">
                    Player1
                  </h1>
                  <div className="flex items-center justify-center md:justify-start gap-2">
                    {isMobile ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Badge variant="outline" className="border-primary/50 text-primary bg-primary/10 font-medium cursor-pointer" style={{ borderColor: playerSubClass.color + '80', color: playerSubClass.color }} data-testid="badge-subclass">
                            <Crown className="w-4 h-4 mr-1" weight="bold" />
                            {playerSubClass.icon} {playerSubClass.name}
                          </Badge>
                        </PopoverTrigger>
                        <PopoverContent side="bottom" className="w-64 bg-gray-900/95 border-gray-600/40 p-3">
                          <div className="space-y-1">
                            <p className="font-bold text-sm" style={{ color: playerSubClass.color }}>{playerSubClass.name}</p>
                            <p className="text-xs text-amber-300 font-semibold">{playerSubClass.passive.name}</p>
                            <p className="text-xs text-gray-300">{playerSubClass.passive.description}</p>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="border-primary/50 text-primary bg-primary/10 font-medium cursor-help" style={{ borderColor: playerSubClass.color + '80', color: playerSubClass.color }} data-testid="badge-subclass">
                              <Crown className="w-4 h-4 mr-1" weight="bold" />
                              {playerSubClass.icon} {playerSubClass.name}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <div className="space-y-1">
                              <p className="font-bold text-sm" style={{ color: playerSubClass.color }}>{playerSubClass.name}</p>
                              <p className="text-xs text-amber-300 font-semibold">{playerSubClass.passive.name}</p>
                              <p className="text-xs text-muted-foreground">{playerSubClass.passive.description}</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {activeTask && (
                      <Badge variant="outline" className="border-emerald-400/50 text-emerald-400 bg-emerald-500/20 animate-pulse font-medium">
                        Active
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-500" weight="bold" />
                    <span className="font-ui">Total Level: <span className="text-foreground font-bold">{totalLevel}</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-sky-500" weight="bold" />
                    <span className="font-ui">Total XP: <span className="text-foreground font-bold">{formatNumber(totalXp)}</span></span>
                  </div>
                </div>

                <div className="mt-4 max-w-md mx-auto md:mx-0">
                  <div className="flex justify-between text-xs font-ui mb-1">
                    <span className="text-muted-foreground">Total Level Progress</span>
                    <span>{totalLevel} / {maxTotalLevel}</span>
                  </div>
                  <Progress 
                    value={(totalLevel / maxTotalLevel) * 100} 
                    className="h-2 bg-black/40"
                    indicatorClassName="bg-gradient-to-r from-primary to-purple-500"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-amber-500/10 border-amber-500/30 shadow-sm">
            <CardContent className="pt-4 text-center">
              <Trophy className="w-8 h-8 mx-auto mb-2 text-amber-400" weight="bold" />
              <div className="text-2xl font-display font-bold text-foreground" data-testid="stat-total-level">{totalLevel}</div>
              <div className="text-xs font-ui text-muted-foreground uppercase tracking-wider">Total Level</div>
            </CardContent>
          </Card>
          
          <Card className="bg-rose-500/10 border-rose-500/30 shadow-sm">
            <CardContent className="pt-4 text-center">
              <Sword className="w-8 h-8 mx-auto mb-2 text-rose-400" weight="bold" />
              <div className="text-2xl font-display font-bold text-foreground" data-testid="stat-mastered">{masteredSkills}</div>
              <div className="text-xs font-ui text-muted-foreground uppercase tracking-wider">Mastered Skills</div>
            </CardContent>
          </Card>
          
          <Card className="bg-cyan-500/10 border-cyan-500/30 shadow-sm">
            <CardContent className="pt-4 text-center">
              <ShieldStar className="w-8 h-8 mx-auto mb-2 text-cyan-400" weight="bold" />
              <div className="text-2xl font-display font-bold text-foreground" data-testid="stat-items">{inventoryCount}</div>
              <div className="text-xs font-ui text-muted-foreground uppercase tracking-wider">Items Collected</div>
            </CardContent>
          </Card>
          
          <Card className="bg-emerald-500/10 border-emerald-500/30 shadow-sm">
            <CardContent className="pt-4 text-center">
              <Clock className="w-8 h-8 mx-auto mb-2 text-emerald-400" weight="bold" />
              <div className="text-2xl font-display font-bold text-foreground" data-testid="stat-unique">{uniqueItems}</div>
              <div className="text-xs font-ui text-muted-foreground uppercase tracking-wider">Unique Items</div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-display">
              <Star className="w-5 h-5 text-amber-500" weight="bold" />
              Skills Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(skills).map(([skillId, skill]) => {
                const config = SKILL_CONFIG[skillId as keyof typeof SKILL_CONFIG];
                if (!config) return null;
                
                const Icon = config.icon;
                const isActive = activeTask?.skillId === skillId;

                return (
                  <div 
                    key={skillId}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-all",
                      isActive 
                        ? "border-emerald-500/50 bg-emerald-500/10" 
                        : "border-border bg-card/50 hover:border-primary/30 hover:bg-card"
                    )}
                    data-testid={`skill-card-${skillId}`}
                  >
                    <div className={cn("p-2 rounded-lg border border-white/5", config.bgColor)}>
                      <Icon className={cn("w-6 h-6", config.color)} weight="bold" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-ui text-sm truncate">{config.name}</span>
                        <div className="flex items-center gap-2">
                          {isActive && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          )}
                          <SkillProgressBar
                            level={skill.level}
                            xp={skill.xp}
                            variant="badge"
                          />
                        </div>
                      </div>
                      
                      <SkillProgressBar
                        level={skill.level}
                        xp={skill.xp}
                        variant="inline"
                        progressClassName={config.barColor}
                        className="text-[10px]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {Object.keys(inventory).length > 0 && (
          <Card className="bg-card border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-display">
                <ShieldStar className="w-5 h-5 text-sky-500" weight="bold" />
                Inventory Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Object.entries(inventory).map(([item, count]) => {
                  const isRarityItem = hasRarity(item);
                  const { baseId, rarity } = parseItemWithRarity(item);
                  const baseItem = getBaseItem(item);
                  
                  return (
                    <div 
                      key={item}
                      className={cn(
                        "p-3 rounded-lg border text-center transition-colors",
                        isRarityItem 
                          ? getItemRarityBgColor(item) 
                          : "border-border bg-card/50 hover:border-primary/30 hover:bg-card"
                      )}
                      data-testid={`inventory-item-${item}`}
                    >
                      <div className={cn(
                        "text-sm font-ui truncate mb-1",
                        isRarityItem ? getItemRarityColor(item) : ""
                      )}>
                        {baseItem?.name || translateItemName(baseId, language)}
                      </div>
                      {rarity && (
                        <div className={cn("text-xs mb-1", getItemRarityColor(item))}>
                          {rarity}
                        </div>
                      )}
                      <Badge variant="outline" className="font-mono">
                        x{formatNumber(count)}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {highestSkill.id && (
          <Card className="bg-gradient-to-r from-amber-500/15 to-amber-500/5 border-amber-500/30 shadow-sm">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-amber-400" weight="bold" />
                </div>
                <div>
                  <div className="text-sm font-ui text-amber-400 uppercase tracking-wider">Highest Skill</div>
                  <div className="font-display text-lg text-foreground">
                    {SKILL_CONFIG[highestSkill.id as keyof typeof SKILL_CONFIG]?.name || highestSkill.id} - Level {highestSkill.level}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-display">
              <ShieldStar className="w-5 h-5 text-violet-500" weight="bold" />
              {t('equipment')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {EQUIPMENT_SLOTS.map(slot => {
                const itemId = equipment[slot];
                const baseItem = itemId ? getBaseItem(itemId) : null;
                const { rarity } = itemId ? parseItemWithRarity(itemId) : { rarity: null };
                
                return (
                  <div 
                    key={slot}
                    className={cn(
                      "p-3 rounded-lg border text-center transition-colors",
                      baseItem 
                        ? (rarity ? getItemRarityBgColor(itemId!) : "border-violet-500/50 bg-violet-500/10")
                        : "border-border bg-card/50"
                    )}
                    data-testid={`equipment-slot-${slot}`}
                  >
                    <div className="text-xs text-muted-foreground uppercase mb-1">{t(slot as any)}</div>
                    {baseItem ? (
                      <div className="flex flex-col items-center w-full">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {(() => {
                              const itemImg = getItemImage(itemId!);
                              return itemImg ? (
                                <img src={itemImg} alt={baseItem.name} loading="lazy" className="w-[90%] h-[90%] object-contain shrink-0 pixelated" />
                              ) : (
                                <Sword className={cn("w-[70%] h-[70%] shrink-0", rarity ? getItemRarityColor(itemId!) : "text-violet-400")} weight="fill" />
                              );
                            })()}
                            <span className={cn(
                              "text-sm font-ui truncate",
                              rarity ? getItemRarityColor(itemId!) : ""
                            )}>
                              {baseItem.name}
                            </span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0 ml-1 shrink-0"
                            onClick={() => unequipItem(slot)}
                            data-testid={`button-unequip-${slot}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                        {rarity && (
                          <span className={cn("text-xs", getItemRarityColor(itemId!))}>
                            {rarity}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t('empty')}</span>
                    )}
                  </div>
                );
              })}
            </div>
            
            <Separator className="my-4" />
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-center">
                <div className="text-xs text-muted-foreground">{t('attack')}</div>
                <div className="text-lg font-bold text-red-400">+{bonuses.attackBonus || 0}</div>
              </div>
              <div className="p-2 rounded bg-orange-500/10 border border-orange-500/30 text-center">
                <div className="text-xs text-muted-foreground">{t('strength')}</div>
                <div className="text-lg font-bold text-orange-400">+{bonuses.strengthBonus || 0}</div>
              </div>
              <div className="p-2 rounded bg-blue-500/10 border border-blue-500/30 text-center">
                <div className="text-xs text-muted-foreground">{t('defence')}</div>
                <div className="text-lg font-bold text-blue-400">+{bonuses.defenceBonus || 0}</div>
              </div>
              <div className="p-2 rounded bg-green-500/10 border border-green-500/30 text-center">
                <div className="text-xs text-muted-foreground">{t('accuracy')}</div>
                <div className="text-lg font-bold text-green-400">+{bonuses.accuracyBonus || 0}</div>
              </div>
            </div>
            
            {/* Role System Stats */}
            {((bonuses.critChance || 0) > 0 || (bonuses.critDamage || 0) > 0 || (bonuses.healPower || 0) > 0) && (
              <>
                <Separator className="my-4" />
                <div className="text-sm font-medium mb-3">{t('roleStats') || 'Role Stats'}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(bonuses.critChance || 0) > 0 && (
                    <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/30 text-center">
                      <div className="text-xs text-muted-foreground">{t('critChance') || 'Crit Chance'}</div>
                      <div className="text-lg font-bold text-yellow-400">{bonuses.critChance || 0}%</div>
                    </div>
                  )}
                  {(bonuses.critDamage || 0) > 0 && (
                    <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-center">
                      <div className="text-xs text-muted-foreground">{t('critDamage') || 'Crit Damage'}</div>
                      <div className="text-lg font-bold text-amber-400">+{bonuses.critDamage || 0}%</div>
                    </div>
                  )}
                  {(bonuses.healPower || 0) > 0 && (
                    <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-center">
                      <div className="text-xs text-muted-foreground">{t('healPower') || 'Heal Power'}</div>
                      <div className="text-lg font-bold text-emerald-400">+{bonuses.healPower || 0}</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
