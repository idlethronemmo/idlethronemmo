import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sword,
  Shield,
  ShieldStar,
  TShirt,
  ArrowsClockwise,
  Skull,
  X,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { RetryImage } from "@/components/ui/retry-image";
import { useState } from "react";
import {
  getBaseItem,
  parseItemWithRarity,
  getItemRarityColor,
  getItemRarityBgColor,
  getItemStatsWithRarity,
  getItemStatsWithEnhancement,
  getItemStatsBreakdown,
  EQUIPMENT_SLOTS,
  translateItemName,
} from "@/lib/items";
import type { EquipmentSlot } from "@/lib/items";
import { getItemImage } from "@/lib/itemImages";
import { DurabilityBarMini } from "@/components/game/DurabilityBar";
import { MasteryCompactWidget } from "@/components/game/MasteryCompactWidget";
import { useLanguage } from "@/context/LanguageContext";

interface EquipmentPanelProps {
  equipment: Record<string, string | null>;
  inventory: Record<string, number>;
  equipItem: (itemId: string) => boolean;
  unequipItem: (slot: EquipmentSlot) => void;
  bonuses: { attackBonus?: number; strengthBonus?: number; defenceBonus?: number; accuracyBonus?: number; hitpointsBonus?: number };
  getSlotDurability: (slot: EquipmentSlot) => number;
  itemModifications: Record<string, { addedStats: Record<string, number>; addedSkills: string[]; enhancementLevel: number }>;
  cursedItems: string[];
  compact?: boolean;
  showBonusSummary?: boolean;
  showMasteryWidget?: boolean;
  testIdPrefix?: string;
}

export function getEquipmentIcon(slot: EquipmentSlot) {
  switch (slot) {
    case "weapon": return Sword;
    case "shield": return Shield;
    case "helmet":
    case "body":
    case "legs":
    case "gloves":
    case "boots": return TShirt;
    default: return ShieldStar;
  }
}

function isTwoHandedWeapon(weaponCategory: string | undefined): boolean {
  return weaponCategory === "staff" || weaponCategory === "bow" || weaponCategory === "2h_sword" || weaponCategory === "2h_axe" || weaponCategory === "2h_warhammer";
}

function getDurabilityColor(durability: number): string {
  if (durability <= 10) return "bg-red-500";
  if (durability <= 25) return "bg-orange-500";
  if (durability <= 50) return "bg-yellow-500";
  return "bg-green-500";
}

export function EquipmentPanel({
  equipment,
  inventory,
  equipItem,
  unequipItem,
  bonuses,
  getSlotDurability,
  itemModifications,
  cursedItems,
  compact = true,
  showBonusSummary = false,
  showMasteryWidget = false,
  testIdPrefix = "equipment",
}: EquipmentPanelProps) {
  const [openSlot, setOpenSlot] = useState<EquipmentSlot | null>(null);
  const { t, language } = useLanguage();

  const getEffectiveStats = (itemId: string) => {
    return getItemStatsWithEnhancement(itemId, itemModifications) || null;
  };

  const getCompatibleItems = (slot: EquipmentSlot) => {
    const equippedItemId = equipment[slot];

    if (slot === "shield") {
      const currentWeaponId = equipment["weapon"];
      if (currentWeaponId) {
        const currentWeapon = getBaseItem(currentWeaponId);
        if (isTwoHandedWeapon(currentWeapon?.weaponCategory)) {
          return [];
        }
        if (currentWeapon?.weaponCategory === "dagger") {
          return Object.keys(inventory)
            .filter(itemId => {
              if (itemId === equippedItemId) return false;
              const baseItem = getBaseItem(itemId);
              return baseItem && baseItem.type === "equipment" && baseItem.weaponCategory === "dagger" && inventory[itemId] > 0;
            })
            .sort((a, b) => {
              const statsA = getItemStatsWithRarity(a);
              const statsB = getItemStatsWithRarity(b);
              const totalA = (statsA?.attackBonus || 0) + (statsA?.strengthBonus || 0) + (statsA?.defenceBonus || 0) + (statsA?.accuracyBonus || 0) + (statsA?.hitpointsBonus || 0);
              const totalB = (statsB?.attackBonus || 0) + (statsB?.strengthBonus || 0) + (statsB?.defenceBonus || 0) + (statsB?.accuracyBonus || 0) + (statsB?.hitpointsBonus || 0);
              return totalB - totalA;
            });
        }
      }
    }

    return Object.keys(inventory)
      .filter(itemId => {
        if (itemId === equippedItemId) return false;
        const baseItem = getBaseItem(itemId);
        return baseItem && baseItem.type === "equipment" && baseItem.equipSlot === slot && inventory[itemId] > 0;
      })
      .sort((a, b) => {
        const statsA = getItemStatsWithRarity(a);
        const statsB = getItemStatsWithRarity(b);
        const totalA = (statsA?.attackBonus || 0) + (statsA?.strengthBonus || 0) + (statsA?.defenceBonus || 0) + (statsA?.accuracyBonus || 0) + (statsA?.hitpointsBonus || 0);
        const totalB = (statsB?.attackBonus || 0) + (statsB?.strengthBonus || 0) + (statsB?.defenceBonus || 0) + (statsB?.accuracyBonus || 0) + (statsB?.hitpointsBonus || 0);
        return totalB - totalA;
      });
  };

  const handleSwap = (itemId: string, slot: EquipmentSlot) => {
    (equipItem as any)(itemId, slot);
    setOpenSlot(null);
  };

  const handleUnequip = (slot: EquipmentSlot) => {
    unequipItem(slot);
    setOpenSlot(null);
  };

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border shadow-lg">
      <CardHeader className={cn(
        "border-b border-border/50 bg-muted/20",
        compact ? "py-3 px-4" : "py-3"
      )}>
        <CardTitle className={cn(
          "flex items-center justify-between",
          compact ? "text-sm" : "text-lg font-display"
        )}>
          <div className={cn("flex items-center", compact ? "gap-2" : "gap-3")}>
            {!compact && (
              <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                <ShieldStar className="w-5 h-5 text-violet-400" weight="bold" />
              </div>
            )}
            {compact && <ShieldStar className="w-4 h-4 text-violet-400" weight="bold" />}
            {t('equipment')}
          </div>
          {showMasteryWidget && <MasteryCompactWidget />}
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? "p-3" : "pt-4"}>
        <div className={cn(
          compact ? "grid grid-cols-5 gap-2 mb-3" : "flex flex-wrap justify-center gap-3 mb-4"
        )}>
          {EQUIPMENT_SLOTS.map(slot => {
            const itemId = equipment[slot];
            const baseItem = itemId ? getBaseItem(itemId) : null;
            const { rarity } = itemId ? parseItemWithRarity(itemId) : { rarity: null };
            const Icon = getEquipmentIcon(slot);
            const compatibleItems = getCompatibleItems(slot);
            const hasAlternatives = compatibleItems.length > 0;
            const itemImg = itemId ? getItemImage(itemId) : null;
            const currentStats = itemId ? getEffectiveStats(itemId) : null;
            const durability = itemId ? getSlotDurability(slot) : 100;

            const weaponId = equipment["weapon"];
            const weaponItem = weaponId ? getBaseItem(weaponId) : null;
            const isTwoHandedBlocked = slot === "shield" && weaponItem && isTwoHandedWeapon(weaponItem.weaponCategory);

            return (
              <Popover key={slot} open={openSlot === slot} onOpenChange={(open) => setOpenSlot(open ? slot : null)}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "rounded-lg border-2 flex items-center justify-center transition-all relative group overflow-hidden",
                      compact ? "w-full aspect-square" : "w-14 h-14",
                      isTwoHandedBlocked
                        ? "border-zinc-700/50 bg-zinc-800/30 cursor-not-allowed"
                        : baseItem
                          ? (rarity ? getItemRarityBgColor(itemId!) : "border-violet-500/50 bg-violet-500/10")
                          : "border-border bg-card/50 border-dashed",
                      !compact && durability !== null && durability <= 25 && "ring-2 ring-orange-500/50",
                      !isTwoHandedBlocked && (baseItem || hasAlternatives) && "hover:border-primary/70 cursor-pointer"
                    )}
                    data-testid={`${testIdPrefix}-equipment-slot-${slot}`}
                    title={isTwoHandedBlocked ? t('twoHandedWeaponNoOffhand' as any) : t(slot as keyof typeof t)}
                  >
                    {isTwoHandedBlocked ? (
                      (() => {
                        const weaponImg = getItemImage(weaponId!);
                        return weaponImg ? (
                          <RetryImage src={weaponImg} alt="Two-handed" loading="lazy" className="w-[90%] h-[90%] object-contain pixelated opacity-30 grayscale" />
                        ) : (
                          <Sword className="w-[70%] h-[70%] text-zinc-600" />
                        );
                      })()
                    ) : baseItem ? (
                      <>
                        {itemImg ? (
                          <RetryImage src={itemImg} alt={baseItem.name} loading="lazy" className="w-[90%] h-[90%] object-contain pixelated" />
                        ) : (
                          <Icon className={cn("w-[70%] h-[70%]", rarity ? getItemRarityColor(itemId!) : "text-violet-400")} weight="fill" />
                        )}
                        {(() => {
                          const enhLevel = itemModifications[itemId!]?.enhancementLevel || 0;
                          if (enhLevel >= 9) return <div className="absolute inset-0 rounded-lg pointer-events-none z-11 shadow-[inset_0_0_18px_rgba(239,68,68,0.8)] animate-pulse" />;
                          if (enhLevel >= 7) return <div className="absolute inset-0 rounded-lg pointer-events-none z-11 shadow-[inset_0_0_16px_rgba(6,182,212,0.75)]" />;
                          return null;
                        })()}
                        {cursedItems.includes(itemId!) && (
                          <div className="absolute inset-0 rounded-lg border-2 border-red-500/80 pointer-events-none z-30">
                            <Skull className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-red-500" weight="fill" />
                          </div>
                        )}
                        {itemModifications[itemId!]?.enhancementLevel > 0 && (
                          <div className="absolute top-0 left-0.5 text-[8px] font-bold text-cyan-400 font-mono z-20">
                            +{itemModifications[itemId!].enhancementLevel}
                          </div>
                        )}
                        {compact ? (
                          durability < 100 && <DurabilityBarMini durability={durability} />
                        ) : (
                          durability !== null && durability < 100 && (
                            <div className="absolute bottom-1 left-1 right-1 h-1.5 bg-black/50 rounded-full overflow-hidden">
                              <div
                                className={cn("h-full transition-all", getDurabilityColor(durability))}
                                style={{ width: `${durability}%` }}
                              />
                            </div>
                          )
                        )}
                      </>
                    ) : (
                      <span className={cn(
                        "text-muted-foreground uppercase leading-tight text-center",
                        compact ? "text-[9px]" : "text-[9px]"
                      )}>{t(`${slot}Short` as any) || t(slot as any)}</span>
                    )}
                    {hasAlternatives && !baseItem && !isTwoHandedBlocked && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white">{compatibleItems.length}</span>
                      </div>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <div className="p-3 border-b border-border/50 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{t(slot as keyof typeof t)}</span>
                      {baseItem && (
                        <Badge variant="outline" className="text-[10px]">{t('equipped')}</Badge>
                      )}
                    </div>
                  </div>

                  {baseItem && currentStats && (
                    <div className="p-3 border-b border-border/30 bg-muted/10">
                      <div className="flex items-center justify-between mb-2">
                        <div className={cn("font-medium text-sm", rarity ? getItemRarityColor(itemId!) : "")}>
                          {translateItemName(baseItem.id, language)}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/20"
                          onClick={() => handleUnequip(slot)}
                          data-testid={`${testIdPrefix}-unequip-${slot}`}
                        >
                          <X className="w-3 h-3 mr-1" />
                          {t('unequip')}
                        </Button>
                      </div>
                      {(() => {
                        const breakdown = getItemStatsBreakdown(itemId!, itemModifications);
                        if (!breakdown) return null;
                        const { enhanced: eStats, enhancementBonus: enhBonus } = breakdown;
                        const statRows: { key: string; label: string; color: string; suffix?: string }[] = [
                          { key: "attackBonus", label: t('attack'), color: "text-red-400" },
                          { key: "strengthBonus", label: t('strength'), color: "text-orange-400" },
                          { key: "defenceBonus", label: t('defence'), color: "text-blue-400" },
                          { key: "accuracyBonus", label: t('accuracy'), color: "text-green-400" },
                          { key: "hitpointsBonus", label: t('hitpoints'), color: "text-pink-400" },
                          { key: "critChance", label: "Crit", color: "text-yellow-400", suffix: "%" },
                          { key: "critDamage", label: "Crit Dmg", color: "text-yellow-400", suffix: "%" },
                          { key: "skillDamageBonus", label: "Skill Dmg", color: "text-purple-400", suffix: "%" },
                          { key: "attackSpeedBonus", label: "Atk Spd", color: "text-cyan-400", suffix: "%" },
                          { key: "healingReceivedBonus", label: "Heal Recv", color: "text-emerald-400", suffix: "%" },
                          { key: "onHitHealingPercent", label: "On-Hit Heal", color: "text-emerald-400", suffix: "%" },
                        ];
                        return (
                          <div className="grid grid-cols-2 gap-1.5 text-xs">
                            {statRows.map(({ key, label, color, suffix }) => {
                              const val = (eStats as any)[key];
                              if (!val || val === 0) return null;
                              const bonus = enhBonus[key] || 0;
                              const baseVal = val - bonus;
                              return (
                                <div key={key} className="flex justify-between">
                                  <span className="text-muted-foreground">{label}:</span>
                                  <span className="flex items-center gap-0.5">
                                    <span className={color}>{baseVal > 0 ? '+' : ''}{baseVal}{suffix || ''}</span>
                                    {bonus > 0 && <span className="text-amber-400 text-[10px] font-bold">(+{bonus})</span>}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {itemModifications[itemId!] && (() => {
                        const mods = itemModifications[itemId!];
                        const hasContent = mods.enhancementLevel > 0 || Object.keys(mods.addedStats || {}).length > 0 || (mods.addedSkills || []).length > 0;
                        if (!hasContent) return null;
                        return (
                          <div className="mt-2 pt-2 border-t border-border/20">
                            {mods.enhancementLevel > 0 && (
                              <div className="flex justify-between items-center mb-1 text-xs">
                                <span className="text-muted-foreground flex items-center gap-1">
                                  <span className="text-amber-400">✦</span> Enhancement
                                </span>
                                <span className="text-amber-400 font-bold">+{mods.enhancementLevel} ({mods.enhancementLevel * 5}%)</span>
                              </div>
                            )}
                            {(mods.addedSkills || []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {mods.addedSkills.map((skill: string, i: number) => (
                                  <span key={i} className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/25 capitalize">
                                    {skill.replace(/_/g, ' ')}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {cursedItems.includes(itemId!) && (
                        <div className="mt-2 pt-2 border-t border-red-500/20 flex items-center gap-2">
                          <Skull className="w-4 h-4 text-red-500 shrink-0" weight="fill" />
                          <div>
                            <div className="text-red-400 font-medium text-[10px]">Cursed Item</div>
                            <div className="text-red-400/70 text-[9px]">Cannot be enhanced, sold, traded, or repaired</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="max-h-48 overflow-y-auto">
                    <div className="p-2 space-y-1">
                      {compatibleItems.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-3">
                          {t('noSuitableItem')}
                        </div>
                      ) : (
                        compatibleItems.map(altItemId => {
                          const altItem = getBaseItem(altItemId);
                          const { rarity: altRarity } = parseItemWithRarity(altItemId);
                          const altStats = getEffectiveStats(altItemId);
                          const altImg = getItemImage(altItemId);
                          const altMods = itemModifications[altItemId];
                          const altEnhLevel = altMods?.enhancementLevel || 0;
                          const altIsCursed = cursedItems.includes(altItemId);
                          if (!altItem) return null;

                          return (
                            <button
                              key={altItemId}
                              onClick={() => handleSwap(altItemId, slot)}
                              className={cn(
                                "w-full p-2 rounded border transition-all text-left flex items-center gap-2 group",
                                altRarity ? getItemRarityBgColor(altItemId) : "border-border/50 bg-muted/20",
                                altIsCursed && "border-red-500/50",
                                "hover:bg-primary/20 hover:border-primary/50"
                              )}
                              data-testid={`${testIdPrefix}-swap-item-${altItemId.replace(/\s+/g, '-').toLowerCase()}`}
                            >
                              <div className="w-10 h-10 rounded bg-muted/30 flex items-center justify-center flex-shrink-0 relative">
                                {altImg ? (
                                  <RetryImage src={altImg} alt={altItem.name} loading="lazy" className="w-[90%] h-[90%] object-contain" />
                                ) : (
                                  <Icon className="w-[70%] h-[70%] text-muted-foreground" weight="fill" />
                                )}
                                {altIsCursed && (
                                  <Skull className="absolute -top-1 -right-1 w-3 h-3 text-red-500" weight="fill" />
                                )}
                                {altEnhLevel > 0 && (
                                  <span className="absolute -bottom-1 -left-0.5 text-[8px] font-bold text-cyan-400 font-mono">+{altEnhLevel}</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={cn("text-xs font-medium truncate flex items-center gap-1", altRarity ? getItemRarityColor(altItemId) : "")}>
                                  {translateItemName(altItem.id, language)}
                                  {altEnhLevel > 0 && (
                                    <span className="text-cyan-400 text-[9px] font-bold flex-shrink-0">+{altEnhLevel}</span>
                                  )}
                                </div>
                                <div className="flex gap-2 text-[10px] text-muted-foreground flex-wrap">
                                  {altStats?.attackBonus && altStats.attackBonus > 0 && (
                                    <span className="text-red-400">+{altStats.attackBonus} Atk</span>
                                  )}
                                  {altStats?.strengthBonus && altStats.strengthBonus > 0 && (
                                    <span className="text-orange-400">+{altStats.strengthBonus} Str</span>
                                  )}
                                  {altStats?.defenceBonus && altStats.defenceBonus !== 0 && (
                                    <span className={altStats.defenceBonus > 0 ? "text-blue-400" : "text-red-400"}>
                                      {altStats.defenceBonus > 0 ? '+' : ''}{altStats.defenceBonus} Def
                                    </span>
                                  )}
                                  {altStats?.hitpointsBonus && altStats.hitpointsBonus > 0 && (
                                    <span className="text-pink-400">+{altStats.hitpointsBonus} HP</span>
                                  )}
                                  {altMods?.addedStats && Object.entries(altMods.addedStats).map(([stat, val]) => (
                                    <span key={stat} className="text-emerald-400">+{val} {stat.slice(0, 3)}</span>
                                  ))}
                                  {altMods?.addedSkills && altMods.addedSkills.length > 0 && (
                                    <span className="text-purple-400">{altMods.addedSkills.length} skill{altMods.addedSkills.length > 1 ? 's' : ''}</span>
                                  )}
                                </div>
                              </div>
                              <ArrowsClockwise className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>

        {showBonusSummary && (
          <div className={cn(
            compact ? "grid grid-cols-5 gap-1" : "grid grid-cols-5 gap-2"
          )}>
            <div className={cn("rounded bg-red-500/10 border border-red-500/30 text-center", compact ? "p-1.5" : "p-2")}>
              <div className={cn("text-muted-foreground", compact ? "text-[8px]" : "text-[10px]")}>{t('attack')}</div>
              <div className={cn("font-bold text-red-400", compact ? "text-xs" : "text-sm")}>+{bonuses.attackBonus || 0}</div>
            </div>
            <div className={cn("rounded bg-orange-500/10 border border-orange-500/30 text-center", compact ? "p-1.5" : "p-2")}>
              <div className={cn("text-muted-foreground", compact ? "text-[8px]" : "text-[10px]")}>{t('strength')}</div>
              <div className={cn("font-bold text-orange-400", compact ? "text-xs" : "text-sm")}>+{bonuses.strengthBonus || 0}</div>
            </div>
            <div className={cn("rounded bg-blue-500/10 border border-blue-500/30 text-center", compact ? "p-1.5" : "p-2")}>
              <div className={cn("text-muted-foreground", compact ? "text-[8px]" : "text-[10px]")}>{t('defence')}</div>
              <div className={cn("font-bold text-blue-400", compact ? "text-xs" : "text-sm")}>+{bonuses.defenceBonus || 0}</div>
            </div>
            <div className={cn("rounded bg-green-500/10 border border-green-500/30 text-center", compact ? "p-1.5" : "p-2")}>
              <div className={cn("text-muted-foreground", compact ? "text-[8px]" : "text-[10px]")}>{t('accuracy')}</div>
              <div className={cn("font-bold text-green-400", compact ? "text-xs" : "text-sm")}>+{bonuses.accuracyBonus || 0}</div>
            </div>
            <div className={cn("rounded bg-pink-500/10 border border-pink-500/30 text-center", compact ? "p-1.5" : "p-2")}>
              <div className={cn("text-muted-foreground", compact ? "text-[8px]" : "text-[10px]")}>{t('hitpoints')}</div>
              <div className={cn("font-bold text-pink-400", compact ? "text-xs" : "text-sm")}>+{bonuses.hitpointsBonus || 0}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
