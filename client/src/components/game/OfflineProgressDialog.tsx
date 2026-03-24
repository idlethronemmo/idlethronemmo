import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Clock, Star, CaretRight, Skull, Sword, Heart, Warning, ShieldSlash, UsersThree } from "@phosphor-icons/react";
import { getItemImage } from "@/lib/itemImages";
import { getMonsterImage } from "@/lib/monsterImages";
import { getBaseItem, parseItemWithRarity, RARITY_COLORS, translateItemName, formatItemIdAsName } from "@/lib/items";
import { cn } from "@/lib/utils";
import { DurabilityBar } from "./DurabilityBar";
import { useLanguage } from "@/context/LanguageContext";
import { MASTERY_TYPE_NAMES, type WeaponMasteryType } from "@shared/masterySystem";
import { RetryImage } from "@/components/ui/retry-image";

function formatBuffDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}

const MAX_ITEMS_TO_SHOW = 15;

function SafeItemDisplay({ 
  itemId, 
  qty, 
  language, 
  bgClass, 
  borderClass,
  textClass = ""
}: { 
  itemId: string; 
  qty: number; 
  language: string;
  bgClass?: string;
  borderClass?: string;
  textClass?: string;
}) {
  try {
    const itemImage = getItemImage(itemId);
    const displayName = translateItemName(itemId, language);
    const { rarity } = parseItemWithRarity(itemId);
    const rarityTextColor = rarity ? RARITY_COLORS[rarity] : "";
    const resolvedBg = bgClass ?? (rarity ? "bg-zinc-900/50" : "bg-muted/40");
    const resolvedBorder = borderClass ?? (rarity && rarity !== "Common" ? ({
      Uncommon: "border-emerald-500/50",
      Rare: "border-blue-500/50",
      Epic: "border-purple-500/50",
      Legendary: "border-yellow-500/50",
      Mythic: "border-red-500/50",
    } as Record<string, string>)[rarity] || "border-border/30" : "border-border/30");
    return (
      <div className={cn("flex items-center gap-1 px-2 py-1 rounded border", resolvedBg, resolvedBorder)}>
        {itemImage ? (
          <RetryImage src={itemImage} alt={displayName} className="w-5 h-5 object-contain pixelated" spinnerClassName="w-3 h-3" />
        ) : (
          <span className="text-xs">📦</span>
        )}
        <span className={cn("text-xs font-medium", textClass || rarityTextColor)}>{qty}x {displayName}</span>
      </div>
    );
  } catch {
    const fallbackName = formatItemIdAsName(itemId);
    return (
      <div className={cn("flex items-center gap-1 px-2 py-1 rounded border", bgClass || "bg-muted/40", borderClass || "border-border/30")}>
        <span className="text-xs">📦</span>
        <span className={cn("text-xs font-medium", textClass)}>{qty}x {fallbackName}</span>
      </div>
    );
  }
}

interface OfflineProgress {
  offlineTimeMs: number;
  offlineTimeFormatted: string;
  skillId: string;
  skillName: string;
  xpEarned: number;
  itemsEarned: number;
  itemName: string;
  taskStopped: boolean;
  wasOverMaxTime: boolean;
  mythicCrafts?: { itemId: string; rarity: string }[];
  craftedItems?: Record<string, number>;
}

interface CombatOfflineProgress {
  offlineTimeMs: number;
  offlineTimeFormatted: string;
  monstersKilled: number;
  playerDied: boolean;
  totalXpGained: { attack: number; strength: number; defence: number; hitpoints: number };
  lootGained: Record<string, number>;
  finalPlayerHp: number;
  foodEaten?: Record<string, number>;
  potionsConsumed?: Record<string, number>;
  brokenItems?: string[];
  durabilityLosses?: Record<string, { itemName: string; startDur: number; endDur: number }>;
  mythicDrops?: { itemId: string; monsterId: string }[];
  monsterId?: string;
  partyBuffsApplied?: {
    foodHealBonus: number;
    defenseBonus: number;
    attackBonus: number;
    hasHealer: boolean;
    hasTank: boolean;
    hasDps: boolean;
  };
  masteryXpGained?: Record<string, number>;
  partySharedLoot?: Record<string, number>;
  partyMemberBuffDetails?: Array<{
    playerId: string;
    playerName: string;
    role: string;
    weaponType: string | null;
    buffType: 'healer' | 'tank' | 'dps';
    buffValue: number;
    buffLabel: string;
    durationMs: number;
    totalOfflineMs: number;
  }>;
}

const FIELD_TO_MASTERY_TYPE: Record<string, WeaponMasteryType> = {
  masteryDagger: 'dagger',
  masterySwordShield: 'sword_shield',
  mastery2hSword: '2h_sword',
  mastery2hAxe: '2h_axe',
  mastery2hWarhammer: '2h_warhammer',
  masteryBow: 'bow',
  masteryStaff: 'staff',
};

function getMasteryDisplayName(fieldName: string): string {
  const masteryType = FIELD_TO_MASTERY_TYPE[fieldName];
  return masteryType ? MASTERY_TYPE_NAMES[masteryType] : fieldName;
}

interface FiremakingSlotProgress {
  logId: string;
  ashId: string;
  burnedCount: number;
  xpEarned: number;
}

interface FiremakingOfflineProgress {
  offlineTimeMs: number;
  offlineTimeFormatted: string;
  totalXpEarned: number;
  slots: FiremakingSlotProgress[];
  ashProduced: Record<string, number>;
  logsConsumed: Record<string, number>;
}

interface QueueStepResult {
  name: string;
  type: 'skill' | 'combat';
  durationMs: number;
  xpEarned?: number;
  itemsEarned?: number;
  monstersKilled?: number;
  playerDied?: boolean;
  skillId?: string;
  itemName?: string;
  goldEarned?: number;
  lootItems?: Record<string, number>;
}

interface OfflineProgressDialogProps {
  open: boolean;
  onClose: () => void;
  progress: OfflineProgress | null;
  combatProgress?: CombatOfflineProgress | null;
  firemakingProgress?: FiremakingOfflineProgress | null;
  offlineAchievements?: { achievementId: string; tier: number; badgeId?: string; rewardGold?: number }[] | null;
  queueSteps?: QueueStepResult[];
}

const SKILL_ICONS: Record<string, string> = {
  woodcutting: "🪓",
  mining: "⛏️",
  fishing: "🎣",
  hunting: "🎯",
  crafting: "🔨",
  cooking: "🍳",
  attack: "⚔️",
  strength: "💪",
  defence: "🛡️",
  hitpoints: "❤️",
};

function formatMonsterName(monsterId: string): string {
  if (!monsterId) return "";
  return monsterId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatOfflineDuration(ms: number, t: (key: string) => string): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours} ${t('timeHours')} ${remainingMinutes} ${t('timeMinutes')}`;
  } else if (minutes > 0) {
    return `${minutes} ${t('timeMinutes')}`;
  } else {
    return `${seconds} ${t('timeSeconds')}`;
  }
}

export default function OfflineProgressDialog({ open, onClose, progress, combatProgress, firemakingProgress, offlineAchievements, queueSteps }: OfflineProgressDialogProps) {
  const { t, language } = useLanguage();
  
  if (!progress && !combatProgress && !firemakingProgress && (!offlineAchievements || offlineAchievements.length === 0) && (!queueSteps || queueSteps.length === 0)) return null;

  // Calculate total combat XP (attack + strength + defence) and hitpoints XP separately
  const combatXp = combatProgress?.totalXpGained 
    ? (combatProgress.totalXpGained.attack || 0) + 
      (combatProgress.totalXpGained.strength || 0) + 
      (combatProgress.totalXpGained.defence || 0)
    : 0;
  const healthXp = combatProgress?.totalXpGained?.hitpoints || 0;

  // Show combat section if there's any combat activity (kills, death, XP, loot, food, potions, durability, or party shared loot)
  const hasCombatProgress = combatProgress && (
    combatProgress.monstersKilled > 0 || 
    combatProgress.playerDied || 
    combatXp > 0 ||
    healthXp > 0 ||
    Object.keys(combatProgress.lootGained || {}).length > 0 ||
    Object.keys(combatProgress.partySharedLoot || {}).length > 0 ||
    Object.keys(combatProgress.foodEaten || {}).length > 0 ||
    Object.keys(combatProgress.potionsConsumed || {}).length > 0 ||
    Object.keys(combatProgress.durabilityLosses || {}).length > 0 ||
    (combatProgress.brokenItems && combatProgress.brokenItems.length > 0) ||
    (combatProgress.mythicDrops && combatProgress.mythicDrops.length > 0)
  );
  // Show task section if there's any progress object (even with 0 XP, show offline time)
  const hasTaskProgress = !!progress;

  const hasFiremakingProgress = firemakingProgress && firemakingProgress.totalXpEarned > 0;

  // Determine if we have floating image
  const hasFloatingImage = (hasCombatProgress && combatProgress?.monsterId) || 
                           (hasTaskProgress && !hasCombatProgress && progress?.itemName) ||
                           (hasFiremakingProgress && !hasCombatProgress && !hasTaskProgress);

  // ──────────────────────────────────────────────────────────────────────────
  // QUEUE V2 MODE: Unified "Offline Summary" view
  // ──────────────────────────────────────────────────────────────────────────
  if (queueSteps && queueSteps.length > 0) {
    type UnifiedStep = {
      type: 'combat' | 'skill';
      name: string;
      skillId?: string;
      durationMs: number;
      xpEarned?: number;
      monstersKilled?: number;
      itemsEarned?: number;
      itemName?: string;
      lootItems?: Record<string, number>;
      goldEarned?: number;
      playerDied?: boolean;
    };

    const activeStep: UnifiedStep | null = (() => {
      if (combatProgress && (combatProgress.monstersKilled > 0 || combatXp > 0 || combatProgress.playerDied)) {
        return {
          type: 'combat',
          name: combatProgress.monsterId ? formatMonsterName(combatProgress.monsterId) : 'Combat',
          durationMs: combatProgress.offlineTimeMs || 0,
          xpEarned: combatXp + healthXp,
          monstersKilled: combatProgress.monstersKilled || 0,
          lootItems: combatProgress.lootGained as Record<string, number> | undefined,
          playerDied: combatProgress.playerDied,
        };
      }
      if (progress) {
        return {
          type: 'skill',
          name: progress.skillName || translateItemName(progress.itemName, language),
          skillId: progress.skillId,
          durationMs: progress.offlineTimeMs || 0,
          xpEarned: progress.xpEarned || 0,
          itemsEarned: progress.itemsEarned || 0,
          itemName: progress.itemName,
        };
      }
      return null;
    })();

    const allSteps: UnifiedStep[] = [
      ...(activeStep ? [activeStep] : []),
      ...queueSteps.map(s => ({
        type: s.type as 'combat' | 'skill',
        name: s.name,
        skillId: s.skillId,
        durationMs: s.durationMs,
        xpEarned: s.xpEarned,
        monstersKilled: s.monstersKilled,
        itemsEarned: s.itemsEarned,
        itemName: s.itemName,
        lootItems: s.lootItems,
        goldEarned: s.goldEarned,
        playerDied: s.playerDied,
      })),
    ];

    const totalXp = allSteps.reduce((a, s) => a + (s.xpEarned || 0), 0);
    const totalKills = allSteps.reduce((a, s) => a + (s.monstersKilled || 0), 0);
    const totalItems = allSteps.reduce((a, s) => a + (s.itemsEarned || 0), 0);
    const totalGold = allSteps.reduce((a, s) => a + (s.goldEarned || 0), 0);
    const totalOfflineMs = combatProgress?.offlineTimeMs || progress?.offlineTimeMs || allSteps.reduce((sum, s) => sum + s.durationMs, 0);

    const fmtStepDuration = (ms: number) => {
      const mins = Math.round(ms / 60000);
      if (mins >= 60) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
      }
      return `${mins}m`;
    };

    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="sm:max-w-[420px] p-0 bg-transparent border-0 shadow-none overflow-visible">
          <VisuallyHidden><DialogTitle>Offline Progress</DialogTitle></VisuallyHidden>
          <div className="rounded-xl border border-border/60 bg-card shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-border/30 flex items-center gap-3">
              <span className="text-2xl">📋</span>
              <div>
                <div className="text-sm font-bold text-foreground">Offline Progress</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" weight="bold" />
                  <span>{formatOfflineDuration(totalOfflineMs, t)}</span>
                  <span className="mx-0.5">·</span>
                  <span>{allSteps.length} {allSteps.length === 1 ? 'step' : 'steps'} completed</span>
                </div>
              </div>
            </div>

            {/* Summary chips */}
            {(totalKills > 0 || totalItems > 0 || totalXp > 0 || totalGold > 0) && (
              <div className="flex gap-1.5 px-3 py-2 bg-muted/10 flex-wrap border-b border-border/20">
                {totalKills > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30">
                    <Sword className="w-3 h-3 text-red-400" weight="fill" />
                    <span className="text-[11px] font-semibold text-red-300">{totalKills.toLocaleString()} kills</span>
                  </div>
                )}
                {totalItems > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30">
                    <span className="text-[11px] font-semibold text-green-300">📦 {totalItems.toLocaleString()} items</span>
                  </div>
                )}
                {totalXp > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                    <Star className="w-3 h-3 text-amber-400" weight="fill" />
                    <span className="text-[11px] font-semibold text-amber-300">
                      {totalXp >= 1000 ? `${(totalXp / 1000).toFixed(0)}K` : totalXp.toLocaleString()} XP
                    </span>
                  </div>
                )}
                {totalGold > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/30">
                    <span className="text-[11px] font-semibold text-yellow-300">🪙 +{totalGold >= 1000 ? `${(totalGold / 1000).toFixed(0)}K` : totalGold.toLocaleString()} gold</span>
                  </div>
                )}
              </div>
            )}

            {/* Step list */}
            <div className="max-h-[55vh] overflow-y-auto px-3 py-2 space-y-2">
              {allSteps.map((step, idx) => {
                const skillIconFallback = step.type === 'combat' ? '⚔️' : (SKILL_ICONS[step.skillId || ''] || '🔧');
                const stepImg = step.type === 'combat'
                  ? (step.name ? getMonsterImage(step.name.toLowerCase().replace(/\s+/g, '_')) : undefined)
                  : (step.itemName ? getItemImage(step.itemName) : undefined);
                const lootEntries = step.lootItems ? Object.entries(step.lootItems) : [];
                return (
                  <div key={idx} className={cn(
                    "rounded-lg border bg-muted/20 p-2.5",
                    step.playerDied ? "border-red-500/40 bg-red-900/10" : "border-border/40"
                  )}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-muted-foreground/50 w-4 shrink-0">#{idx + 1}</span>
                        {stepImg
                          ? <RetryImage src={stepImg} alt={step.name} className="w-5 h-5 object-contain pixelated shrink-0" spinnerClassName="w-3 h-3" />
                          : <span className="text-sm shrink-0">{skillIconFallback}</span>
                        }
                        <span className="text-xs font-semibold text-foreground">{step.name}</span>
                        {step.playerDied && <span className="text-xs ml-0.5 text-red-400">☠️ Died</span>}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{fmtStepDuration(step.durationMs)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 ml-5 text-[10px]">
                      {(step.xpEarned || 0) > 0 && (
                        <span className="text-amber-400">+{(step.xpEarned!).toLocaleString()} XP</span>
                      )}
                      {(step.monstersKilled || 0) > 0 && (
                        <span className="text-red-400">{step.monstersKilled} kills</span>
                      )}
                      {(step.itemsEarned || 0) > 0 && (
                        <span className="text-green-400">+{step.itemsEarned} {step.itemName ? translateItemName(step.itemName, language) : 'items'}</span>
                      )}
                      {(step.goldEarned || 0) > 0 && (
                        <span className="text-yellow-400">+{step.goldEarned!.toLocaleString()} gold</span>
                      )}
                    </div>
                    {lootEntries.length > 0 && (
                      <div className="ml-5 mt-1.5 flex flex-wrap gap-1">
                        {lootEntries.slice(0, 8).map(([itemId, qty]) => {
                          const { rarity } = parseItemWithRarity(itemId);
                          const isRare = rarity && rarity !== 'Common';
                          const rarityTextClass = isRare ? RARITY_COLORS[rarity!] : undefined;
                          const lootImg = getItemImage(itemId);
                          return (
                            <span key={itemId} className={cn(
                              "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border",
                              isRare
                                ? `${rarityTextClass} bg-muted/20 border-current/30`
                                : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                            )}>
                              {lootImg && <RetryImage src={lootImg} alt={itemId} className="w-3.5 h-3.5 object-contain pixelated" spinnerClassName="w-2 h-2" />}
                              {translateItemName(itemId, language)} ×{qty}
                            </span>
                          );
                        })}
                        {lootEntries.length > 8 && (
                          <span className="text-[10px] text-muted-foreground/60">+{lootEntries.length - 8} more</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Achievements */}
              {offlineAchievements && offlineAchievements.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-2 text-amber-400 px-0.5">
                    <Star className="w-3.5 h-3.5" weight="fill" />
                    <span className="text-xs font-bold">Achievements Unlocked</span>
                  </div>
                  {offlineAchievements.map((ach, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded border bg-amber-950/30 border-amber-700/30">
                      {ach.badgeId ? (
                        <RetryImage src={`/images/badges/${ach.badgeId.replace(/_t\d+$/, '')}.webp`} alt="" className="w-5 h-5 object-contain" spinnerClassName="w-3 h-3" />
                      ) : (
                        <Star className="w-4 h-4 text-amber-400" weight="fill" />
                      )}
                      <span className="text-xs font-medium text-amber-200 flex-1">
                        {ach.achievementId.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        <span className="text-amber-400/70 ml-1">Tier {ach.tier}</span>
                      </span>
                      {ach.rewardGold && ach.rewardGold > 0 && (
                        <span className="text-xs text-yellow-400 font-medium">+{ach.rewardGold.toLocaleString()} gold</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Continue button */}
            <div className="px-3 pb-3 pt-2 border-t border-border/30">
              <Button
                onClick={onClose}
                className="w-full h-9 bg-primary/90 hover:bg-primary text-sm font-medium"
                data-testid="button-close-offline-dialog"
              >
                {t('continueBtn')}
                <CaretRight className="w-4 h-4 ml-1" weight="bold" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[380px] p-0 bg-transparent border-0 shadow-none overflow-visible">
        <VisuallyHidden><DialogTitle>Offline Progress</DialogTitle></VisuallyHidden>
        {/* Floating Image - Positioned outside the card for no clipping */}
        {hasCombatProgress && combatProgress?.monsterId && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
            <div className="w-20 h-20 rounded-xl border-4 border-card bg-gradient-to-br from-red-900/40 to-red-950/60 shadow-xl overflow-hidden flex items-center justify-center">
              {getMonsterImage(combatProgress.monsterId) ? (
                <RetryImage 
                  src={getMonsterImage(combatProgress.monsterId)} 
                  alt={formatMonsterName(combatProgress.monsterId)}
                  className="w-[90%] h-[90%] object-contain drop-shadow-lg"
                />
              ) : (
                <Sword className="w-10 h-10 text-red-400" weight="fill" />
              )}
            </div>
            <span className="mt-1 text-sm font-semibold text-foreground bg-card/90 px-2 py-0.5 rounded shadow">
              {formatMonsterName(combatProgress.monsterId)}
            </span>
          </div>
        )}
        
        {/* Floating Image for Firemaking (only when no combat or task) */}
        {hasFiremakingProgress && !hasCombatProgress && !hasTaskProgress && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
            <div className="w-20 h-20 rounded-xl border-4 border-card bg-gradient-to-br from-orange-900/40 to-orange-950/60 shadow-xl overflow-hidden flex items-center justify-center">
              <span className="text-3xl">🔥</span>
            </div>
            <span className="mt-1 text-sm font-semibold text-foreground bg-card/90 px-2 py-0.5 rounded shadow">
              Firemaking
            </span>
          </div>
        )}
        
        {/* Floating Image for Task (only when no combat) */}
        {!hasCombatProgress && hasTaskProgress && progress?.itemName && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
            <div className="w-20 h-20 rounded-xl border-4 border-card bg-gradient-to-br from-emerald-900/40 to-emerald-950/60 shadow-xl overflow-hidden flex items-center justify-center">
              {getItemImage(progress.itemName) ? (
                <RetryImage 
                  src={getItemImage(progress.itemName)} 
                  alt={progress.itemName}
                  className="w-[90%] h-[90%] object-contain drop-shadow-lg pixelated"
                />
              ) : (
                <span className="text-3xl">{SKILL_ICONS[progress.skillId] || "⭐"}</span>
              )}
            </div>
            <span className="mt-1 text-sm font-semibold text-foreground bg-card/90 px-2 py-0.5 rounded shadow">
              {translateItemName(progress.itemName, language)}
            </span>
          </div>
        )}

        {/* Main Card Content */}
        <div className={cn(
          "relative bg-card/98 border border-border/50 rounded-lg shadow-2xl max-h-[85vh] overflow-y-auto",
          hasFloatingImage ? "mt-12" : ""
        )}>
          <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent rounded-lg" />
          
          <div className="relative p-5 space-y-4">
            {/* Combat Progress Section */}
            {hasCombatProgress && combatProgress && (
              <>

                <div className="flex items-center justify-center gap-2">
                  <Sword className="w-5 h-5 text-red-400" weight="bold" />
                  <span className="text-base font-semibold text-foreground">{t('combatProgress')}</span>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" weight="bold" />
                  <span className="text-sm text-muted-foreground">{t('offlineTime')}</span>
                  <span className="text-sm font-semibold text-foreground">{formatOfflineDuration(combatProgress.offlineTimeMs, t)}</span>
                </div>

                {/* Combat Stats - Monsters Killed */}
                <div className="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
                  <div className="text-2xl font-bold text-foreground">{combatProgress.monstersKilled}</div>
                  <div className="text-xs text-muted-foreground">{t('monstersKilled')}</div>
                </div>

                {/* Party Buffs Applied - Per-member details */}
                {combatProgress?.partyMemberBuffDetails && combatProgress.partyMemberBuffDetails.length > 0 && (
                  <div className="bg-purple-900/20 border border-purple-700/40 rounded-lg p-3 mt-3">
                    <div className="flex items-center gap-2 text-purple-300 font-medium text-sm mb-2">
                      <UsersThree className="w-4 h-4" weight="bold" />
                      <span>{t('partyBonusesApplied')}</span>
                    </div>
                    <div className="space-y-2">
                      {combatProgress.partyMemberBuffDetails.map((member, idx) => {
                        const durationRatio = member.totalOfflineMs > 0 ? member.durationMs / member.totalOfflineMs : 0;
                        const isPartial = durationRatio < 0.95;
                        const buffIcon = member.buffType === 'healer' ? '🍖' : member.buffType === 'tank' ? '🛡️' : '⚔️';
                        const buffColor = member.buffType === 'healer' ? 'text-green-300' : member.buffType === 'tank' ? 'text-blue-300' : 'text-red-300';
                        const roleLabel = member.buffType === 'healer' ? t('foodHealBonus') : member.buffType === 'tank' ? t('defence') : t('attack');
                        
                        return (
                          <div key={member.playerId + idx} className="flex items-center gap-2 px-2 py-1.5 rounded bg-purple-900/30 border border-purple-700/20">
                            <span className="text-sm">{buffIcon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-medium text-purple-200 truncate">{member.playerName}</span>
                                {isPartial && (
                                  <span className="text-[10px] text-yellow-400/70">({formatBuffDuration(member.durationMs)})</span>
                                )}
                              </div>
                              <div className={cn("text-[10px]", buffColor)}>
                                +{(member.buffValue * 100).toFixed(0)}% {roleLabel}
                                {isPartial && (
                                  <span className="text-muted-foreground ml-1">({Math.round(durationRatio * 100)}%)</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Keep the old fallback for when no member details available */}
                {combatProgress?.partyBuffsApplied && !combatProgress?.partyMemberBuffDetails && (
                  (combatProgress.partyBuffsApplied.attackBonus ?? 0) > 0 || 
                  (combatProgress.partyBuffsApplied.defenseBonus ?? 0) > 0 || 
                  (combatProgress.partyBuffsApplied.foodHealBonus ?? 0) > 0
                ) && (
                  <div className="bg-purple-900/20 border border-purple-700/40 rounded-lg p-3 mt-3">
                    <div className="flex items-center gap-2 text-purple-300 font-medium text-sm mb-2">
                      <span>⚔️</span>
                      <span>{t('partyBonusesApplied')}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {(combatProgress.partyBuffsApplied.attackBonus ?? 0) > 0 && (
                        <div className="flex items-center gap-1 text-red-300">
                          <span>⚔️</span>
                          <span>+{((combatProgress.partyBuffsApplied.attackBonus ?? 0) * 100).toFixed(0)}% {t('attack')}</span>
                        </div>
                      )}
                      {(combatProgress.partyBuffsApplied.defenseBonus ?? 0) > 0 && (
                        <div className="flex items-center gap-1 text-blue-300">
                          <span>🛡️</span>
                          <span>+{((combatProgress.partyBuffsApplied.defenseBonus ?? 0) * 100).toFixed(0)}% {t('defence')}</span>
                        </div>
                      )}
                      {(combatProgress.partyBuffsApplied.foodHealBonus ?? 0) > 0 && (
                        <div className="flex items-center gap-1 text-green-300">
                          <span>🍖</span>
                          <span>+{((combatProgress.partyBuffsApplied.foodHealBonus ?? 0) * 100).toFixed(0)}% {t('foodHealBonus')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* XP Stats - Combat XP and Health XP */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Sword className="w-4 h-4 text-red-400" weight="fill" />
                      <span className="text-lg font-bold text-red-400">+{combatXp.toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{t('combatXP')}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Heart className="w-4 h-4 text-pink-400" weight="fill" />
                      <span className="text-lg font-bold text-pink-400">+{healthXp.toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{t('healthXP')}</div>
                  </div>
                </div>

                {/* Mastery XP Gained */}
                {combatProgress.masteryXpGained && Object.entries(combatProgress.masteryXpGained).some(([_, xp]) => xp > 0) && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground text-center">Mastery XP Gained</div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {Object.entries(combatProgress.masteryXpGained)
                        .filter(([_, xp]) => xp > 0)
                        .map(([masteryField, xp]) => (
                          <div key={masteryField} className="flex items-center gap-1 px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/30">
                            <span className="text-xs">⚔️</span>
                            <span className="text-xs font-medium text-yellow-400">
                              {getMasteryDisplayName(masteryField)}: +{xp.toLocaleString()} XP
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Food Consumed */}
                {combatProgress.foodEaten && Object.keys(combatProgress.foodEaten).length > 0 && (() => {
                  const foodEntries = Object.entries(combatProgress.foodEaten);
                  const displayEntries = foodEntries.slice(0, MAX_ITEMS_TO_SHOW);
                  const hiddenCount = foodEntries.length - displayEntries.length;
                  return (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground text-center">{t('foodEaten')}</div>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {displayEntries.map(([foodId, qty]) => (
                          <SafeItemDisplay 
                            key={foodId} 
                            itemId={foodId} 
                            qty={qty} 
                            language={language} 
                            bgClass="bg-amber-500/10" 
                            borderClass="border-amber-500/30"
                            textClass="text-amber-400"
                          />
                        ))}
                        {hiddenCount > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30">
                            <span className="text-xs font-medium text-amber-400/70">+{hiddenCount} more...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Potions Consumed */}
                {combatProgress.potionsConsumed && Object.keys(combatProgress.potionsConsumed).length > 0 && (() => {
                  const potionEntries = Object.entries(combatProgress.potionsConsumed);
                  const displayEntries = potionEntries.slice(0, MAX_ITEMS_TO_SHOW);
                  const hiddenCount = potionEntries.length - displayEntries.length;
                  return (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground text-center">{t('potionsConsumed')}</div>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {displayEntries.map(([potionId, qty]) => (
                          <SafeItemDisplay 
                            key={potionId} 
                            itemId={potionId} 
                            qty={qty} 
                            language={language} 
                            bgClass="bg-purple-500/10" 
                            borderClass="border-purple-500/30"
                            textClass="text-purple-400"
                          />
                        ))}
                        {hiddenCount > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded bg-purple-500/10 border border-purple-500/30">
                            <span className="text-xs font-medium text-purple-400/70">+{hiddenCount} more...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Loot Items */}
                {Object.keys(combatProgress.lootGained || {}).length > 0 && (() => {
                  const lootEntries = Object.entries(combatProgress.lootGained);
                  const displayEntries = lootEntries.slice(0, MAX_ITEMS_TO_SHOW);
                  const hiddenCount = lootEntries.length - displayEntries.length;
                  return (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground text-center">{t('itemsGained')}</div>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {displayEntries.map(([itemId, qty]) => (
                          <SafeItemDisplay key={itemId} itemId={itemId} qty={qty} language={language} />
                        ))}
                        {hiddenCount > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded bg-muted/40 border border-border/30">
                            <span className="text-xs font-medium text-muted-foreground">+{hiddenCount} more...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Party Shared Loot Section */}
                {combatProgress.partySharedLoot && Object.keys(combatProgress.partySharedLoot).length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 justify-center">
                      <UsersThree className="w-4 h-4 text-emerald-400" weight="duotone" />
                      <span className="text-xs font-semibold text-emerald-400">{t('partySharedLoot')}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {Object.entries(combatProgress.partySharedLoot).map(([itemId, qty]) => (
                        <SafeItemDisplay 
                          key={itemId} 
                          itemId={itemId} 
                          qty={qty as number} 
                          language={language}
                          bgClass="bg-emerald-500/10"
                          borderClass="border-emerald-500/30"
                          textClass="text-emerald-300"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Broken Items Section */}
                {combatProgress.brokenItems && combatProgress.brokenItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 text-red-400">
                      <ShieldSlash className="w-4 h-4" weight="fill" />
                      <span className="text-xs font-semibold">{t('brokenEquipment')}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {combatProgress.brokenItems.map((itemName, idx) => {
                        const { baseId, rarity } = parseItemWithRarity(itemName);
                        const baseItem = getBaseItem(baseId);
                        const itemImage = getItemImage(itemName);
                        const rarityColor = rarity ? RARITY_COLORS[rarity] : "text-gray-400";
                        return (
                          <div key={idx} className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/20 border border-red-500/40">
                            {itemImage ? (
                              <RetryImage src={itemImage} alt={itemName} className="w-5 h-5 object-contain grayscale opacity-60 pixelated" spinnerClassName="w-3 h-3" />
                            ) : (
                              <span className="text-xs">💔</span>
                            )}
                            <span className={cn("text-xs font-medium line-through", rarityColor)}>
                              {translateItemName(itemName, language)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Durability Losses Section (only show if player died AND no broken items) */}
                {combatProgress.playerDied && 
                  (!combatProgress.brokenItems || combatProgress.brokenItems.length === 0) && 
                  combatProgress.durabilityLosses && 
                  Object.keys(combatProgress.durabilityLosses).length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 text-amber-400">
                      <Warning className="w-4 h-4" weight="fill" />
                      <span className="text-xs font-semibold">{t('durabilityLoss')}</span>
                    </div>
                    <div className="space-y-1.5">
                      {Object.entries(combatProgress.durabilityLosses).map(([slot, info]) => {
                        const { baseId, rarity } = parseItemWithRarity(info.itemName);
                        const baseItem = getBaseItem(baseId);
                        const itemImage = getItemImage(info.itemName);
                        const rarityColor = rarity ? RARITY_COLORS[rarity] : "text-gray-400";
                        return (
                          <div key={slot} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30 border border-border/30">
                            {itemImage ? (
                              <RetryImage src={itemImage} alt={info.itemName} className="w-5 h-5 object-contain pixelated" spinnerClassName="w-3 h-3" />
                            ) : (
                              <span className="text-xs">🛡️</span>
                            )}
                            <span className={cn("text-xs font-medium flex-1 truncate", rarityColor)}>
                              {translateItemName(info.itemName, language)}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="text-muted-foreground">{info.startDur}%</span>
                              <span className="text-muted-foreground">→</span>
                              <span className={info.endDur < 25 ? "text-red-400 font-medium" : "text-amber-400"}>
                                {info.endDur}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Death/HP Status */}
                <div className={cn(
                  "flex items-center justify-center gap-2 text-xs py-1.5 px-3 rounded",
                  combatProgress.playerDied 
                    ? "text-red-400/90 bg-red-500/10" 
                    : "text-emerald-400/90 bg-emerald-500/10"
                )}>
                  {combatProgress.playerDied ? (
                    <>
                      <Skull className="w-4 h-4" weight="fill" />
                      <span>{t('youDiedCombatStopped')}</span>
                    </>
                  ) : (
                    <>
                      <Heart className="w-4 h-4" weight="fill" />
                      <span>{t('combatContinues')}</span>
                    </>
                  )}
                </div>

                {/* Separator if both progress types exist */}
                {hasTaskProgress && (
                  <div className="border-t border-border/30 my-3" />
                )}
              </>
            )}

            {/* Task Progress Section (Gathering/Crafting) */}
            {hasTaskProgress && progress && (
              <>
                {!hasCombatProgress && (
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" weight="bold" />
                    <span className="text-sm text-muted-foreground">{t('offlineTime')}</span>
                    <span className="text-sm font-semibold text-foreground">{formatOfflineDuration(progress.offlineTimeMs, t)}</span>
                  </div>
                )}

                {progress.wasOverMaxTime && (
                  <div className="text-center text-xs text-amber-400/90 bg-amber-500/10 rounded px-2 py-1.5">
                    {t('max6HoursOffline')}
                  </div>
                )}

                {/* Task Stats */}
                {progress.craftedItems && Object.keys(progress.craftedItems).length > 0 ? (
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div className="text-center mb-2">
                      <span className="text-2xl font-bold text-foreground">+{progress.itemsEarned.toLocaleString()}</span>
                      <div className="text-xs text-muted-foreground">{translateItemName(progress.itemName, language)}</div>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-center" data-testid="offline-crafted-items">
                      {Object.entries(progress.craftedItems).map(([itemKey, qty]) => {
                        const { rarity } = parseItemWithRarity(itemKey);
                        const rarityColor = rarity ? RARITY_COLORS[rarity] : undefined;
                        return (
                          <div key={itemKey} className="flex items-center gap-1 px-2 py-0.5 rounded border border-border/30 bg-muted/40">
                            {getItemImage(itemKey) && (
                              <RetryImage src={getItemImage(itemKey)!} alt={itemKey} className="w-4 h-4 object-contain pixelated" spinnerClassName="w-3 h-3" />
                            )}
                            <span className="text-xs font-medium" style={rarityColor ? { color: rarityColor } : undefined}>
                              {qty}x {rarity || "Common"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-2xl font-bold text-foreground">+{progress.itemsEarned.toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{translateItemName(progress.itemName, language)}</div>
                  </div>
                )}

                {/* XP Earned */}
                <div className="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Star className="w-4 h-4 text-amber-400" weight="fill" />
                    <span className="text-lg font-bold text-amber-400">+{progress.xpEarned.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{progress.skillName} XP</div>
                </div>

                <div className={cn(
                  "text-center text-xs py-1.5 px-3 rounded",
                  progress.taskStopped 
                    ? "text-orange-400/90 bg-orange-500/10" 
                    : "text-emerald-400/90 bg-emerald-500/10"
                )}>
                  {progress.taskStopped 
                    ? t('taskStoppedLimit')
                    : t('taskContinues')}
                </div>
              </>
            )}

            {/* Firemaking Offline Progress Section */}
            {firemakingProgress && firemakingProgress.totalXpEarned > 0 && (
              <>
                {(hasCombatProgress || hasTaskProgress) && (
                  <div className="border-t border-border/30 my-3" />
                )}

                <div className="flex items-center justify-center gap-2">
                  <span className="text-lg">🔥</span>
                  <span className="text-base font-semibold text-orange-400">Firemaking</span>
                </div>

                {!hasCombatProgress && !hasTaskProgress && (
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" weight="bold" />
                    <span className="text-sm text-muted-foreground">{t('offlineTime')}</span>
                    <span className="text-sm font-semibold text-foreground">{formatOfflineDuration(firemakingProgress.offlineTimeMs, t)}</span>
                  </div>
                )}

                <div className="p-3 rounded-lg bg-muted/30 border border-border/30 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Star className="w-4 h-4 text-amber-400" weight="fill" />
                    <span className="text-lg font-bold text-amber-400">+{firemakingProgress.totalXpEarned.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Firemaking XP</div>
                </div>

                {Object.keys(firemakingProgress.ashProduced).length > 0 && (
                  <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-700/30">
                    <div className="text-xs text-muted-foreground mb-2 text-center">Ash</div>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {Object.entries(firemakingProgress.ashProduced).map(([ashId, qty]) => (
                        <SafeItemDisplay key={ashId} itemId={ashId} qty={qty} language={language} bgClass="bg-orange-900/20" borderClass="border-orange-700/30" textClass="text-orange-300" />
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(firemakingProgress.logsConsumed).length > 0 && (
                  <div className="p-3 rounded-lg bg-muted/20 border border-border/20">
                    <div className="text-xs text-muted-foreground mb-2 text-center">Logs</div>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {Object.entries(firemakingProgress.logsConsumed).map(([logId, qty]) => (
                        <SafeItemDisplay key={logId} itemId={logId} qty={qty} language={language} bgClass="bg-red-900/20" borderClass="border-red-700/30" textClass="text-red-300" />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {offlineAchievements && offlineAchievements.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-400">
                  <Star className="w-4 h-4" weight="fill" />
                  <span className="text-sm font-bold">Achievements Unlocked</span>
                </div>
                <div className="space-y-1.5">
                  {offlineAchievements.map((ach, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded border bg-amber-950/30 border-amber-700/30">
                      {ach.badgeId ? (
                        <RetryImage src={`/images/badges/${ach.badgeId.replace(/_t\d+$/, '')}.webp`} alt="" className="w-6 h-6 object-contain" spinnerClassName="w-3 h-3" />
                      ) : (
                        <Star className="w-5 h-5 text-amber-400" weight="fill" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-amber-200">
                          {ach.achievementId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </span>
                        <span className="text-xs text-amber-400/70 ml-1">Tier {ach.tier}</span>
                      </div>
                      {ach.rewardGold && ach.rewardGold > 0 && (
                        <span className="text-xs text-yellow-400 font-medium">+{ach.rewardGold.toLocaleString()} gold</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button 
              onClick={onClose} 
              className="w-full h-9 bg-primary/90 hover:bg-primary text-sm font-medium"
              data-testid="button-close-offline-dialog"
            >
              {t('continueBtn')}
              <CaretRight className="w-4 h-4 ml-1" weight="bold" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
