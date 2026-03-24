import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Heart, Skull, Warning, Trophy } from "@phosphor-icons/react";
import { getMonsterImage } from "@/lib/monsterImages";
import { useLanguage } from "@/context/LanguageContext";
import { getLocalizedMonsterName } from "@/lib/gameTranslations";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { calculateMaxHit, COMBAT_HP_SCALE } from "@shared/schema";
import { RetryImage } from "@/components/ui/retry-image";

interface RegionColors {
  bg: string;
  border: string;
  text: string;
  radialGradient: string;
}

interface PartyMemberOnMonster {
  playerId: string;
  playerName: string;
  avatar?: string;
}

export type DangerLevel = 'safe' | 'needsFood' | 'canOneShot';

interface MonsterCardProps {
  monster: {
    id: string;
    attackLevel: number;
    strengthLevel: number;
    strengthBonus?: number;
    defenceLevel: number;
    maxHitpoints: number;
    region: string;
    loot?: Array<{ chance: number }>;
  };
  playerCombatLevel: number;
  playerMaxHp?: number;
  playerDamageReduction?: number;
  hpScale?: number;
  isSelected?: boolean;
  isInCombat?: boolean;
  colors: RegionColors;
  variant?: "compact" | "default";
  onClick?: () => void;
  className?: string;
  testId?: string;
  partyMembersOnMonster?: PartyMemberOnMonster[];
}

export function calculateDangerLevel(
  monsterStrengthLevel: number,
  monsterStrengthBonus: number,
  playerMaxHp: number,
  playerDamageReduction: number
): DangerLevel {
  const monsterMaxHit = calculateMaxHit(monsterStrengthLevel, monsterStrengthBonus) * COMBAT_HP_SCALE;
  const effectiveDamage = Math.max(1, Math.floor(monsterMaxHit * (1 - playerDamageReduction)));
  const damagePercent = effectiveDamage / playerMaxHp;
  
  if (damagePercent >= 0.8) return 'canOneShot';
  if (damagePercent >= 0.3) return 'needsFood';
  return 'safe';
}

export function MonsterCard({
  monster,
  playerCombatLevel,
  playerMaxHp,
  playerDamageReduction = 0,
  hpScale = 10,
  isSelected = false,
  isInCombat = false,
  colors,
  variant = "default",
  onClick,
  className,
  testId,
  partyMembersOnMonster = [],
}: MonsterCardProps) {
  const { language } = useLanguage();
  
  const monsterCombatLevel = Math.floor(
    (monster.attackLevel + monster.strengthLevel + monster.defenceLevel) / 3
  );
  const hasRareDrop = monster.loot?.some(l => l.chance < 1) ?? false;
  
  const dangerLevel = playerMaxHp 
    ? calculateDangerLevel(monster.strengthLevel, monster.strengthBonus || 0, playerMaxHp, playerDamageReduction)
    : 'safe';
  const canOneShot = dangerLevel === 'canOneShot';
  const needsFood = dangerLevel === 'needsFood';
  
  const isAbovePlayerLevel = monsterCombatLevel > playerCombatLevel + 5;
  const isDangerous = canOneShot || monsterCombatLevel > playerCombatLevel + 15;
  const monsterImg = getMonsterImage(monster.id);
  const monsterName = getLocalizedMonsterName(language, monster.id);
  const scaledHp = monster.maxHitpoints * hpScale;

  if (variant === "compact") {
    return (
      <div
        onClick={onClick}
        className={cn(
          "relative p-1.5 rounded-lg border-2 cursor-pointer transition-all",
          isSelected || isInCombat
            ? `${colors.bg} ${colors.border} shadow-lg`
            : "bg-muted/20 border-border/30",
          className
        )}
        data-testid={testId}
      >
        <div className="absolute top-0.5 right-0.5 flex gap-0.5">
          {canOneShot && (
            <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center animate-pulse">
              <Warning className="w-2.5 h-2.5 text-white" weight="fill" />
            </div>
          )}
          {!canOneShot && needsFood && (
            <div className="w-4 h-4 rounded-full bg-amber-500/90 flex items-center justify-center">
              <Warning className="w-2.5 h-2.5 text-white" weight="fill" />
            </div>
          )}
          {hasRareDrop && (
            <div className="w-4 h-4 rounded-full bg-purple-500/80 flex items-center justify-center">
              <Trophy className="w-2.5 h-2.5 text-white" weight="fill" />
            </div>
          )}
        </div>

        <div 
          className="aspect-square rounded flex items-center justify-center overflow-hidden mb-1"
          style={{ background: colors.radialGradient }}
        >
          {monsterImg ? (
            <RetryImage 
              src={monsterImg} 
              alt={monsterName}
              className="w-full h-full object-contain p-0.5 pixelated"
            />
          ) : (
            <Skull className={cn("w-8 h-8", colors.text)} weight="duotone" />
          )}
        </div>

        <div className="text-center">
          <h3 className="text-[10px] font-semibold text-foreground truncate">{monsterName}</h3>
          <div className="flex items-center justify-center gap-1">
            <span className={cn(
              "text-[9px]",
              isDangerous && "text-red-400",
              !isDangerous && isAbovePlayerLevel && "text-orange-400"
            )}>
              Lv.{monsterCombatLevel}
            </span>
          </div>
        </div>

        {/* Party members fighting this monster */}
        {partyMembersOnMonster.length > 0 && (
          <div className="flex items-center justify-center gap-0.5 mt-1">
            <TooltipProvider delayDuration={0}>
              {partyMembersOnMonster.slice(0, 3).map((member) => (
                <Tooltip key={member.playerId}>
                  <TooltipTrigger asChild>
                    <div className="w-4 h-4 rounded-full bg-zinc-800 border border-purple-500/50 flex items-center justify-center overflow-hidden">
                      {member.avatar ? (
                        <img src={member.avatar} alt={member.playerName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[8px] font-bold text-purple-400">{member.playerName.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-700 text-white text-xs py-1 px-2">
                    {member.playerName}
                  </TooltipContent>
                </Tooltip>
              ))}
              {partyMembersOnMonster.length > 3 && (
                <span className="text-[8px] text-muted-foreground">+{partyMembersOnMonster.length - 3}</span>
              )}
            </TooltipProvider>
          </div>
        )}

        {isInCombat && (
          <div className="absolute inset-0 rounded-lg border-2 border-red-500 animate-pulse pointer-events-none" />
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative p-2 rounded-lg border-2 cursor-pointer transition-all group",
        isSelected || isInCombat
          ? `${colors.bg} ${colors.border} shadow-lg`
          : "bg-muted/20 border-border/30 hover:bg-muted/40 hover:border-border/60",
        className
      )}
      data-testid={testId}
    >
      <div className="absolute top-1 right-1 flex gap-1">
        {canOneShot && (
          <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center animate-pulse">
            <Warning className="w-3 h-3 text-white" weight="fill" />
          </div>
        )}
        {!canOneShot && needsFood && (
          <div className="w-5 h-5 rounded-full bg-amber-500/90 flex items-center justify-center">
            <Warning className="w-3 h-3 text-white" weight="fill" />
          </div>
        )}
        {hasRareDrop && (
          <div className="w-5 h-5 rounded-full bg-purple-500/80 flex items-center justify-center">
            <Trophy className="w-3 h-3 text-white" weight="fill" />
          </div>
        )}
      </div>

      <div 
        className="aspect-square rounded-lg flex items-center justify-center overflow-hidden mb-2"
        style={{ background: colors.radialGradient }}
      >
        {monsterImg ? (
          <RetryImage 
            src={monsterImg} 
            alt={monsterName}
            className="w-full h-full object-contain p-1 group-hover:scale-110 transition-transform pixelated"
          />
        ) : (
          <Skull className={cn("w-12 h-12", colors.text)} weight="duotone" />
        )}
      </div>

      <div className="text-center">
        <h3 className="text-sm font-semibold text-foreground truncate">{monsterName}</h3>
        <div className="flex items-center justify-center gap-2 mt-1">
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] py-0",
              isDangerous && "text-red-400 border-red-500/50",
              !isDangerous && isAbovePlayerLevel && "text-orange-400 border-orange-500/50"
            )}
          >
            Lv.{monsterCombatLevel}
          </Badge>
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Heart className="w-3 h-3 text-red-400" weight="fill" />
            {scaledHp}
          </span>
        </div>
      </div>

      {/* Party members fighting this monster */}
      {partyMembersOnMonster.length > 0 && (
        <div className="flex items-center justify-center gap-1 mt-2">
          <TooltipProvider delayDuration={0}>
            {partyMembersOnMonster.slice(0, 4).map((member) => (
              <Tooltip key={member.playerId}>
                <TooltipTrigger asChild>
                  <div className="w-5 h-5 rounded-full bg-zinc-800 border border-purple-500/50 flex items-center justify-center overflow-hidden shadow-sm">
                    {member.avatar ? (
                      <img src={member.avatar} alt={member.playerName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[9px] font-bold text-purple-400">{member.playerName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-700 text-white text-xs py-1 px-2">
                  {member.playerName}
                </TooltipContent>
              </Tooltip>
            ))}
            {partyMembersOnMonster.length > 4 && (
              <span className="text-[9px] text-muted-foreground">+{partyMembersOnMonster.length - 4}</span>
            )}
          </TooltipProvider>
        </div>
      )}

      {isInCombat && (
        <div className="absolute inset-0 rounded-lg border-2 border-red-500 animate-pulse pointer-events-none" />
      )}
    </div>
  );
}

export function MonsterHpBar({
  currentHp,
  maxHp,
  isUsingSkill = false,
  className,
}: {
  currentHp: number;
  maxHp: number;
  isUsingSkill?: boolean;
  className?: string;
}) {
  const hpPercent = (currentHp / maxHp) * 100;
  
  return (
    <div className={cn("w-full", className)}>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span className="flex items-center gap-1">
          <Heart className="w-3 h-3 text-red-400" weight="fill" />
          HP
        </span>
        <span>{currentHp}/{maxHp}</span>
      </div>
      <div className="h-3 bg-muted/50 rounded-full overflow-hidden">
        <div 
          className={cn(
            "h-full rounded-full transition-all duration-200",
            isUsingSkill 
              ? "bg-gradient-to-r from-yellow-500 to-orange-500" 
              : "bg-gradient-to-r from-red-500 to-red-600"
          )}
          style={{ width: `${hpPercent}%` }}
        />
      </div>
    </div>
  );
}
