import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useItemInspect } from "@/context/ItemInspectContext";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/gameMath";
import { RetryImage } from "@/components/ui/retry-image";
import { 
  getBaseItem, 
  parseItemWithRarity,
  stripInstanceSuffix,
  hasRarity, 
  getItemRarityColor, 
  getItemRarityBgColor,
  getItemStatsBreakdown,
  getItemStatsWithEnhancement,
  getVendorPrice,
  translateItemDescription,
  translateItemName,
  isItemsLoaded,
  loadItemsData
} from "@/lib/items";
import { getItemImage, BROKEN_ITEM_IMAGE } from "@/lib/itemImages";
import { 
  Backpack, 
  Sword, 
  Shield, 
  HardHat, 
  Shirt, 
  Footprints, 
  Hand,
  Axe,
  Fish,
  Lock,
  Check,
  Heart,
  Crosshair,
  Swords,
  Skull,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Zap
} from "lucide-react";
import { Pickaxe } from "lucide-react";
import type { Item } from "@/lib/items-types";
import { RoleStatsDisplay } from "@/components/items";
import { getItemRole } from "@/lib/itemUtils";
import { mapWeaponCategoryToMasteryType, getMasteryFieldName } from "@shared/masterySystem";
import type { TranslationKeys } from "@/lib/i18n";
import { SkillDetailPopup } from "./SkillDetailPopup";
import { useChatItemShare } from "@/context/ChatItemShareContext";
import { Share2 } from "lucide-react";

const ITEM_METADATA: Record<string, { icon: any; color: string; rarity: string; description: string; skill: string }> = {
  "Normal Tree": { icon: Axe, color: "text-amber-600", rarity: "common", description: "Basic logs from a common tree.", skill: "Woodcutting" },
  "Oak Tree": { icon: Axe, color: "text-amber-600", rarity: "common", description: "Sturdy oak logs.", skill: "Woodcutting" },
  "Willow Tree": { icon: Axe, color: "text-amber-600", rarity: "uncommon", description: "Flexible willow wood.", skill: "Woodcutting" },
  "Maple Tree": { icon: Axe, color: "text-amber-600", rarity: "uncommon", description: "Beautiful maple logs.", skill: "Woodcutting" },
  "Yew Tree": { icon: Axe, color: "text-amber-600", rarity: "rare", description: "Ancient yew wood.", skill: "Woodcutting" },
  "Magic Tree": { icon: Axe, color: "text-amber-600", rarity: "legendary", description: "Legendary magic wood.", skill: "Woodcutting" },
  "Copper Ore": { icon: Pickaxe, color: "text-orange-400", rarity: "common", description: "Raw copper ore.", skill: "Mining" },
  "Tin Ore": { icon: Pickaxe, color: "text-slate-400", rarity: "common", description: "Raw tin ore.", skill: "Mining" },
  "Iron Ore": { icon: Pickaxe, color: "text-slate-500", rarity: "uncommon", description: "Dense iron ore.", skill: "Mining" },
  "Silver Ore": { icon: Pickaxe, color: "text-gray-300", rarity: "uncommon", description: "Precious silver ore.", skill: "Mining" },
  "Coal": { icon: Pickaxe, color: "text-zinc-800", rarity: "uncommon", description: "Coal for smelting.", skill: "Mining" },
  "Gold Ore": { icon: Pickaxe, color: "text-yellow-400", rarity: "rare", description: "Valuable gold ore.", skill: "Mining" },
  "Raw Shrimp": { icon: Fish, color: "text-pink-400", rarity: "common", description: "Tiny pink shrimp.", skill: "Fishing" },
  "Raw Sardine": { icon: Fish, color: "text-blue-300", rarity: "common", description: "Small oily fish.", skill: "Fishing" },
  "Raw Herring": { icon: Fish, color: "text-blue-400", rarity: "common", description: "Silver-scaled herring.", skill: "Fishing" },
  "Raw Trout": { icon: Fish, color: "text-blue-500", rarity: "uncommon", description: "Freshwater trout.", skill: "Fishing" },
  "Raw Salmon": { icon: Fish, color: "text-orange-400", rarity: "uncommon", description: "Powerful salmon.", skill: "Fishing" },
};

const RARITY_LABELS: Record<string, { text: string; color: string }> = {
  common: { text: "Common", color: "text-zinc-400" },
  uncommon: { text: "Uncommon", color: "text-emerald-400" },
  rare: { text: "Rare", color: "text-blue-400" },
  epic: { text: "Epic", color: "text-purple-400" },
  legendary: { text: "Legendary", color: "text-yellow-400" },
  mythic: { text: "Mythic", color: "text-red-400" },
};

const STAT_CONFIG: { key: string; label: keyof TranslationKeys; color: string; suffix?: string }[] = [
  { key: "attackBonus", label: "attack", color: "text-red-400" },
  { key: "strengthBonus", label: "strength", color: "text-orange-400" },
  { key: "defenceBonus", label: "defence", color: "text-blue-400" },
  { key: "hitpointsBonus", label: "hitpoints", color: "text-pink-400" },
  { key: "accuracyBonus", label: "accuracy", color: "text-green-400" },
  { key: "critChance", label: "critChance" as any, color: "text-yellow-400", suffix: "%" },
  { key: "critDamage", label: "critDamage" as any, color: "text-yellow-400", suffix: "%" },
  { key: "skillDamageBonus", label: "skill_damage", color: "text-purple-400", suffix: "%" },
  { key: "attackSpeedBonus", label: "attack_speed", color: "text-cyan-400", suffix: "%" },
  { key: "healingReceivedBonus", label: "healing_received", color: "text-emerald-400", suffix: "%" },
  { key: "onHitHealingPercent", label: "on_hit_healing", color: "text-emerald-400", suffix: "%" },
  { key: "buffDurationBonus", label: "buff_duration", color: "text-teal-400", suffix: "%" },
  { key: "partyDpsBuff", label: "party_dps", color: "text-orange-300", suffix: "%" },
  { key: "partyDefenceBuff", label: "party_defence", color: "text-blue-300", suffix: "%" },
  { key: "partyAttackSpeedBuff", label: "party_speed", color: "text-cyan-300", suffix: "%" },
  { key: "lootChanceBonus", label: "loot_chance", color: "text-amber-400", suffix: "%" },
];

function EnhancedStatRow({ label, value, enhBonus, color, suffix, t }: {
  label: string; value: number; enhBonus: number; color: string; suffix?: string; t: any;
}) {
  if (!value || value === 0) return null;
  const baseValue = value - enhBonus;
  
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="flex items-center gap-1">
        <span className={cn("font-bold text-sm", color)}>
          {baseValue > 0 ? '+' : ''}{baseValue}{suffix || ''}
        </span>
        {enhBonus > 0 && (
          <span className="text-amber-400 font-bold text-xs">
            (+{enhBonus}{suffix || ''})
          </span>
        )}
      </span>
    </div>
  );
}

export function ItemInspectPopup() {
  const { inspectedItem, closeInspect } = useItemInspect();
  const { skills, debugMode, getMasteryLevel, itemModifications, cursedItems, equipment } = useGame();
  const { t, language } = useLanguage();
  const chatItemShare = useChatItemShare();
  const [, forceUpdate] = useState(0);
  
  const itemsCurrentlyLoading = !isItemsLoaded();
  const baseItem = inspectedItem ? getBaseItem(inspectedItem.name) : null;

  useEffect(() => {
    if (!inspectedItem || baseItem || !itemsCurrentlyLoading) return;
    let cancelled = false;
    loadItemsData().then(() => {
      if (!cancelled) forceUpdate(n => n + 1);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [inspectedItem?.name, itemsCurrentlyLoading, baseItem]);
  
  if (!inspectedItem) return null;
  const isEquipment = baseItem?.type === "equipment";
  const itemRarity = hasRarity(inspectedItem.name) ? parseItemWithRarity(inspectedItem.name).rarity : null;
  const meta = ITEM_METADATA[inspectedItem.name];
  const rarityLabel = meta ? RARITY_LABELS[meta.rarity] : null;
  const mods = itemModifications[inspectedItem.name];
  const enhLevel = mods?.enhancementLevel || 0;
  const isCursed = cursedItems.includes(inspectedItem.name);
  
  const getRequirementInfo = () => {
    if (!baseItem?.levelRequired || !isEquipment) return null;
    let requiredSkill = baseItem.skillRequired;
    if (!requiredSkill) {
      requiredSkill = baseItem.equipSlot === "weapon" ? "attack" : "defence";
    }
    const playerLevel = skills[requiredSkill]?.level || 1;
    const meetsRequirement = debugMode || playerLevel >= baseItem.levelRequired;
    const skillTranslationKey = requiredSkill as 'attack' | 'defence' | 'strength' | 'hitpoints';
    return { skill: requiredSkill, skillName: t(skillTranslationKey), requiredLevel: baseItem.levelRequired, playerLevel, meetsRequirement };
  };
  
  const getMasteryRequirementInfo = () => {
    if (!baseItem?.masteryRequired || !baseItem?.weaponCategory || baseItem?.equipSlot !== "weapon") return null;
    const masteryType = mapWeaponCategoryToMasteryType(baseItem.weaponCategory);
    if (!masteryType) return null;
    const playerMasteryLevel = getMasteryLevel(masteryType);
    const meetsMasteryReq = debugMode || playerMasteryLevel >= baseItem.masteryRequired;
    const masteryFieldName = getMasteryFieldName(masteryType);
    return { masteryType, masteryFieldName, requiredLevel: baseItem.masteryRequired, playerMasteryLevel, meetsMasteryReq };
  };
  
  const requirementInfo = getRequirementInfo();
  const masteryRequirementInfo = getMasteryRequirementInfo();

  const renderEquipmentContent = () => {
    if (!baseItem) return null;
    
    const breakdown = getItemStatsBreakdown(inspectedItem.name, itemModifications);
    const enhancedStats = breakdown?.enhanced;
    const enhBonus = breakdown?.enhancementBonus || {};

    return (
      <div className="flex flex-col h-full">
        <div className="relative px-4 pt-5 pb-3">
          <div className="flex items-start gap-3">
            <div className={cn(
              "w-16 h-16 rounded-xl border-2 overflow-hidden flex items-center justify-center shrink-0 relative",
              isCursed ? "border-red-500/60 bg-red-950/30" :
              itemRarity ? getItemRarityBgColor(inspectedItem.name) : "bg-zinc-800/60 border-zinc-600/40"
            )}>
              {(() => {
                const itemImg = getItemImage(inspectedItem.name);
                if (itemImg) return <RetryImage src={itemImg} alt={inspectedItem.name} className="w-[85%] h-[85%] object-contain pixelated" />;
                const iconClass = cn("w-10 h-10", itemRarity ? getItemRarityColor(inspectedItem.name) : "text-gray-400");
                switch (baseItem.equipSlot) {
                  case "weapon": return <Sword className={iconClass} />;
                  case "shield": return <Shield className={iconClass} />;
                  case "helmet": return <HardHat className={iconClass} />;
                  case "body": return <Shirt className={iconClass} />;
                  case "legs": case "boots": return <Footprints className={iconClass} />;
                  case "gloves": return <Hand className={iconClass} />;
                  default: return <Backpack className={iconClass} />;
                }
              })()}
              {isCursed && <Skull className="absolute -top-1 -right-1 w-4 h-4 text-red-500" />}
              {(() => {
                if (enhLevel >= 9) return <div className="absolute inset-0 rounded-xl pointer-events-none shadow-[inset_0_0_14px_rgba(239,68,68,0.7)] animate-pulse" />;
                if (enhLevel >= 7) return <div className="absolute inset-0 rounded-xl pointer-events-none shadow-[inset_0_0_12px_rgba(6,182,212,0.6)]" />;
                return null;
              })()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("font-display text-lg leading-tight truncate", itemRarity ? getItemRarityColor(inspectedItem.name) : "text-white")}>
                  {translateItemName(parseItemWithRarity(inspectedItem.name).baseId, language)}
                </span>
                {enhLevel > 0 && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold font-mono">
                    +{enhLevel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className={cn("text-xs", itemRarity ? getItemRarityColor(inspectedItem.name) : "text-zinc-400")}>
                  {itemRarity || "Common"}
                </span>
                {(() => {
                  const role = getItemRole(baseItem);
                  if (!role) return null;
                  const roleConfig = {
                    tank: { icon: Shield, color: "text-cyan-400", bgColor: "bg-cyan-500/15", label: t('tankRole') },
                    dps: { icon: Swords, color: "text-orange-400", bgColor: "bg-orange-500/15", label: t('dpsRole') },
                    healer: { icon: Heart, color: "text-green-400", bgColor: "bg-green-500/15", label: t('healerRole') }
                  };
                  const config = roleConfig[role];
                  const RoleIcon = config.icon;
                  return (
                    <span className={cn("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full", config.bgColor, config.color)}>
                      <RoleIcon className="w-2.5 h-2.5" />
                      {config.label}
                    </span>
                  );
                })()}
                {isCursed && (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">
                    <Skull className="w-2.5 h-2.5" />
                    {t('cursedItem')}
                  </span>
                )}
              </div>
              {(requirementInfo || masteryRequirementInfo) && (
                <div className="flex items-center gap-1.5 mt-1">
                  {requirementInfo && (
                    <span className={cn("flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                      requirementInfo.meetsRequirement ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                    )}>
                      {requirementInfo.meetsRequirement ? <Check className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                      Lv.{requirementInfo.requiredLevel}
                      <span className="opacity-60 ml-0.5">{requirementInfo.playerLevel}/{requirementInfo.requiredLevel}</span>
                    </span>
                  )}
                  {masteryRequirementInfo && (
                    <span className={cn("flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                      masteryRequirementInfo.meetsMasteryReq ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                    )}>
                      M.{masteryRequirementInfo.requiredLevel}
                      <span className="opacity-60 ml-0.5">{masteryRequirementInfo.playerMasteryLevel}/{masteryRequirementInfo.requiredLevel}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3">
          {enhancedStats && (
            <div className="rounded-xl bg-[#15181e] border border-border/20 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs text-muted-foreground font-medium">{t('stats')}</span>
                {enhLevel > 0 && (
                  <span className="text-[10px] text-amber-400/70">
                    ({enhLevel * 5}% {t('bonus')})
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {STAT_CONFIG.map(({ key, label, color, suffix }) => {
                  const val = (enhancedStats as any)[key];
                  if (!val || val === 0) return null;
                  const bonus = enhBonus[key] || 0;
                  return (
                    <EnhancedStatRow
                      key={key}
                      label={t(label)}
                      value={val}
                      enhBonus={bonus}
                      color={color}
                      suffix={suffix}
                      t={t}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {mods && (mods.addedSkills || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {mods.addedSkills.map((skill: string, i: number) => (
                <span key={i} className="px-2 py-1 rounded-full text-[11px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/25 capitalize flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {skill.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}

          <RoleStatsDisplay item={baseItem} variant="list" />

          {baseItem.equipSlot === "weapon" && (baseItem.attackSpeedMs || baseItem.lifestealPercent || baseItem.weaponSkills) && (
            <div className="rounded-xl bg-[#15181e] border border-border/20 p-3">
              <div className="text-xs text-muted-foreground mb-2 font-medium">{t('weaponProperties')}</div>
              <div className="space-y-1 text-sm">
                {baseItem.attackSpeedMs && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('attackSpeed')}</span>
                    <span className="text-cyan-400 font-bold">{(baseItem.attackSpeedMs / 1000).toFixed(1)}s</span>
                  </div>
                )}
                {baseItem.lifestealPercent && baseItem.lifestealPercent > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('lifesteal')}</span>
                    <span className="text-rose-400 font-bold">{baseItem.lifestealPercent}%</span>
                  </div>
                )}
              </div>
              {baseItem.weaponSkills && baseItem.weaponSkills.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/15">
                  <div className="flex flex-wrap gap-1.5">
                    {baseItem.weaponSkills.map((skill: any, idx: number) => (
                      <SkillDetailPopup key={idx} skill={skill} variant="badge" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-xs px-1">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">
                {t('slot')}: <span className="text-white font-medium">{t(baseItem.equipSlot as any)}</span>
              </span>
              {inspectedItem.quantity && (
                <span className="text-muted-foreground">
                  x<span className="text-primary font-bold font-mono">{formatNumber(inspectedItem.quantity)}</span>
                </span>
              )}
            </div>
            <span className="text-yellow-400 font-bold">
              {formatNumber(getVendorPrice(inspectedItem.name))} {t('gold')}
            </span>
          </div>

          {renderComparison()}
        </div>
      </div>
    );
  };

  const renderComparison = () => {
    if (!baseItem?.equipSlot) return null;
    const equippedItemId = equipment[baseItem.equipSlot as keyof typeof equipment];
    if (equippedItemId === inspectedItem.name) return null;

    const inspectedStats = getItemStatsWithEnhancement(inspectedItem.name, itemModifications);
    if (!inspectedStats) return null;

    const statKeys: { key: string; label: keyof TranslationKeys }[] = [
      { key: "attackBonus", label: "attack" },
      { key: "strengthBonus", label: "strength" },
      { key: "defenceBonus", label: "defence" },
      { key: "hitpointsBonus", label: "hitpoints" },
      { key: "accuracyBonus", label: "accuracy" },
      { key: "skillDamageBonus", label: "skill_damage" },
      { key: "attackSpeedBonus", label: "attack_speed" },
      { key: "healingReceivedBonus", label: "healing_received" },
      { key: "onHitHealingPercent", label: "on_hit_healing" },
      { key: "buffDurationBonus", label: "buff_duration" },
      { key: "partyDpsBuff", label: "party_dps" },
      { key: "partyDefenceBuff", label: "party_defence" },
      { key: "partyAttackSpeedBuff", label: "party_speed" },
      { key: "lootChanceBonus", label: "loot_chance" },
    ];

    if (!equippedItemId) {
      const gains = statKeys
        .map(({ key, label }) => ({ label, value: (inspectedStats as any)[key] || 0 }))
        .filter(({ value }) => value !== 0);

      return (
        <div className="rounded-xl bg-[#15181e] border border-emerald-500/20 p-3" data-testid="item-comparison-panel">
          <div className="text-xs text-emerald-400 mb-1 font-medium">{t('comparedToEquipped')}</div>
          <div className="text-[10px] text-muted-foreground mb-2 italic">{t('noItemEquipped')}</div>
          {gains.length > 0 && (
            <div className="space-y-0.5 text-sm">
              {gains.map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t(label)}</span>
                  <span className="flex items-center gap-1 text-emerald-400 font-bold">
                    <ArrowUp className="w-3 h-3" />+{value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    const equippedStats = getItemStatsWithEnhancement(equippedItemId, itemModifications) || {};
    const equippedBase = getBaseItem(equippedItemId);

    const diffs = statKeys
      .map(({ key, label }) => {
        const inspVal = (inspectedStats as any)[key] || 0;
        const equipVal = (equippedStats as any)[key] || 0;
        return { label, diff: inspVal - equipVal };
      })
      .filter(({ diff }) => diff !== 0);

    const weaponDiffs: { label: string; diff: number; display: string }[] = [];
    if (baseItem.equipSlot === "weapon" && equippedBase) {
      const inspSpeed = baseItem.attackSpeedMs || 0;
      const equipSpeed = equippedBase.attackSpeedMs || 0;
      if (inspSpeed !== equipSpeed) {
        weaponDiffs.push({ label: t('attackSpeed'), diff: -(inspSpeed - equipSpeed), display: `${(Math.abs(inspSpeed - equipSpeed) / 1000).toFixed(1)}s` });
      }
      const inspLifesteal = baseItem.lifestealPercent || 0;
      const equipLifesteal = equippedBase.lifestealPercent || 0;
      if (inspLifesteal !== equipLifesteal) {
        weaponDiffs.push({ label: t('lifesteal'), diff: inspLifesteal - equipLifesteal, display: `${Math.abs(inspLifesteal - equipLifesteal)}%` });
      }
    }

    const equippedImg = getItemImage(equippedItemId);
    const equippedName = translateItemName(parseItemWithRarity(equippedItemId).baseId, language);

    return (
      <div className="rounded-xl bg-[#15181e] border border-amber-500/20 p-3" data-testid="item-comparison-panel">
        <div className="text-xs text-amber-400 mb-1.5 font-medium">{t('comparedToEquipped')}</div>
        <div className="flex items-center gap-2 mb-2">
          {equippedImg && (
            <RetryImage src={equippedImg} alt={equippedName} className="w-5 h-5 object-contain pixelated" spinnerClassName="w-3 h-3" />
          )}
          <span className={cn("text-xs font-medium", hasRarity(equippedItemId) ? getItemRarityColor(equippedItemId) : "text-white")}>
            {equippedName}
          </span>
        </div>
        {diffs.length > 0 || weaponDiffs.length > 0 ? (
          <div className="space-y-0.5 text-sm">
            {diffs.map(({ label, diff }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{t(label)}</span>
                <span className={cn("flex items-center gap-1 font-bold", diff > 0 ? "text-emerald-400" : "text-red-400")}>
                  {diff > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  {diff > 0 ? `+${diff}` : diff}
                </span>
              </div>
            ))}
            {weaponDiffs.map(({ label, diff, display }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className={cn("flex items-center gap-1 font-bold", diff > 0 ? "text-emerald-400" : "text-red-400")}>
                  {diff > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  {diff > 0 ? "+" : "-"}{display}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">{t('noStatDifference')}</div>
        )}
      </div>
    );
  };

  const renderNonEquipmentContent = () => {
    const displayItem = meta || baseItem;
    if (!displayItem) {
      if (itemsCurrentlyLoading) {
        return (
          <div className="px-4 py-6 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-zinc-800/80 border border-zinc-700 animate-pulse" />
            <div className="text-muted-foreground text-sm">{t('loading')}</div>
          </div>
        );
      }
      return (
        <div className="px-4 py-6 flex flex-col items-center gap-3">
          <img src={BROKEN_ITEM_IMAGE} alt="broken item" className="w-14 h-14" />
          <div className="text-red-400 text-sm font-medium">{t('unknownItem')}</div>
          <div className="text-muted-foreground text-xs font-mono text-center break-all max-w-full px-2">{inspectedItem.name}</div>
        </div>
      );
    }
    
    return (
      <div className="px-4 py-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-14 h-14 rounded-xl border overflow-hidden flex items-center justify-center",
            meta ? `bg-zinc-900/50 border-${meta.rarity === 'legendary' ? 'yellow' : meta.rarity === 'rare' ? 'blue' : meta.rarity === 'uncommon' ? 'emerald' : 'zinc'}-500/30` : "bg-zinc-800/80 border-zinc-700"
          )}>
            {getItemImage(inspectedItem.name) ? (
              <RetryImage src={getItemImage(inspectedItem.name)!} alt={inspectedItem.name} className="w-[85%] h-[85%] object-cover rounded" />
            ) : meta ? (
              <meta.icon className={cn("w-8 h-8", meta.color)} />
            ) : (
              <Backpack className="w-8 h-8 text-gray-400" />
            )}
          </div>
          <div>
            <div className="text-white font-display text-lg">{translateItemName(inspectedItem.name, language)}</div>
            <div className={cn("text-xs", meta ? RARITY_LABELS[meta.rarity]?.color : "text-zinc-400")}>
              {meta ? RARITY_LABELS[meta.rarity]?.text : (baseItem?.type === "food" ? t('food') : baseItem?.type === "material" ? t('material') : t('item'))}
            </div>
          </div>
        </div>
        
        <p className="text-muted-foreground text-sm leading-relaxed">
          {baseItem ? translateItemDescription(baseItem.name || baseItem.id, language) : t('anInventoryItem')}
        </p>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {meta ? t('skill') : t('type')}: <span className="text-white font-medium">{meta?.skill || (baseItem?.type === "food" ? t('food') : baseItem?.type === "material" ? t('material') : t('item'))}</span>
          </span>
          {inspectedItem.quantity && (
            <span className="text-muted-foreground">
              x<span className="text-primary font-bold font-mono">{formatNumber(inspectedItem.quantity)}</span>
            </span>
          )}
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('vendorPrice')}</span>
          <span className="text-yellow-400 font-bold">{formatNumber(getVendorPrice(inspectedItem.name))} {t('gold')}</span>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={!!inspectedItem} onOpenChange={(open) => !open && closeInspect()}>
      <DialogContent 
        className={cn(
          "bg-[#0c0e12] border-border/40 p-0 max-w-md overflow-hidden",
          "rounded-t-2xl sm:rounded-2xl",
          "max-h-[85vh] flex flex-col",
          "fixed bottom-0 sm:bottom-auto sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%]",
          "w-full sm:w-auto",
          "z-[10002]",
          "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
          "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:fade-in-0"
        )}
        overlayClassName="z-[10001]"
        data-testid="item-inspect-dialog"
      >
        <div className="w-12 h-1 rounded-full bg-zinc-600 mx-auto mt-2 sm:hidden" />
        
        {isEquipment && baseItem ? renderEquipmentContent() : renderNonEquipmentContent()}
        
        <div className="px-4 pb-4 pt-2 border-t border-border/20 bg-[#0c0e12] flex gap-2">
          <Button 
            onClick={closeInspect}
            variant="outline"
            className="flex-1 rounded-xl border-border/40 text-muted-foreground hover:text-white"
            data-testid="button-close-inspect"
          >
            {t('close')}
          </Button>
          {!inspectedItem.fromChat && (
            <Button
              onClick={() => {
                const { addItem, requestOpenChat } = chatItemShare;
                const itemNameClean = stripInstanceSuffix(inspectedItem.name);
                addItem({ itemName: itemNameClean, enhancementLevel: enhLevel || undefined });
                requestOpenChat();
                closeInspect();
              }}
              variant="outline"
              className="rounded-xl border-primary/40 text-primary hover:bg-primary/10"
              size="icon"
              data-testid="button-share-item-chat"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
