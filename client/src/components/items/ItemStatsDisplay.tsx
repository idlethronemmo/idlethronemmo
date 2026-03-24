import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/LanguageContext";
import { Sword, Shield, Heart, Zap, Sparkles, Users, Timer, Coins, Crosshair } from "lucide-react";
import type { ItemStats } from "@/lib/items-types";

interface ItemStatsDisplayProps {
  stats: ItemStats | null | undefined;
  variant?: "list" | "badge";
  className?: string;
  showContainer?: boolean;
}

export function ItemStatsDisplay({ 
  stats, 
  variant = "list", 
  className = "",
  showContainer = true 
}: ItemStatsDisplayProps) {
  const { t } = useLanguage();
  
  if (!stats) return null;
  
  const hasAnyStats = 
    (stats.attackBonus && stats.attackBonus > 0) ||
    (stats.strengthBonus && stats.strengthBonus > 0) ||
    (stats.defenceBonus !== undefined && stats.defenceBonus !== 0) ||
    (stats.hitpointsBonus && stats.hitpointsBonus > 0) ||
    (stats.accuracyBonus && stats.accuracyBonus > 0) ||
    (stats.skillDamageBonus && stats.skillDamageBonus > 0) ||
    (stats.attackSpeedBonus && stats.attackSpeedBonus > 0) ||
    (stats.healingReceivedBonus && stats.healingReceivedBonus > 0) ||
    (stats.onHitHealingPercent && stats.onHitHealingPercent > 0) ||
    (stats.buffDurationBonus && stats.buffDurationBonus > 0) ||
    (stats.partyDpsBuff && stats.partyDpsBuff > 0) ||
    (stats.partyDefenceBuff && stats.partyDefenceBuff > 0) ||
    (stats.partyAttackSpeedBuff && stats.partyAttackSpeedBuff > 0) ||
    (stats.lootChanceBonus && stats.lootChanceBonus > 0);
  
  if (!hasAnyStats) return null;

  if (variant === "badge") {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {stats.attackBonus && stats.attackBonus > 0 && (
          <Badge variant="secondary" className="text-xs">
            <Sword className="w-3 h-3 mr-1" />+{stats.attackBonus} {t('attack')}
          </Badge>
        )}
        {stats.strengthBonus && stats.strengthBonus > 0 && (
          <Badge variant="secondary" className="text-xs">
            +{stats.strengthBonus} {t('strength')}
          </Badge>
        )}
        {stats.defenceBonus !== undefined && stats.defenceBonus !== 0 && (
          <Badge variant="secondary" className={`text-xs ${stats.defenceBonus < 0 ? 'text-red-400' : ''}`}>
            <Shield className="w-3 h-3 mr-1" />{stats.defenceBonus > 0 ? '+' : ''}{stats.defenceBonus} {t('defence')}
          </Badge>
        )}
        {stats.hitpointsBonus && stats.hitpointsBonus > 0 && (
          <Badge variant="secondary" className="text-xs text-red-400">
            <Heart className="w-3 h-3 mr-1" />+{stats.hitpointsBonus} {t('hp')}
          </Badge>
        )}
      </div>
    );
  }

  const content = (
    <div className={`space-y-1.5 text-sm ${className}`}>
      {stats.attackBonus && stats.attackBonus > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('attack')}:</span>
          <span className="text-red-400 font-bold">+{stats.attackBonus}</span>
        </div>
      )}
      {stats.strengthBonus && stats.strengthBonus > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('strength')}:</span>
          <span className="text-orange-400 font-bold">+{stats.strengthBonus}</span>
        </div>
      )}
      {stats.defenceBonus !== undefined && stats.defenceBonus !== 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('defence')}:</span>
          <span className={stats.defenceBonus > 0 ? "text-blue-400 font-bold" : "text-red-400 font-bold"}>
            {stats.defenceBonus > 0 ? '+' : ''}{stats.defenceBonus}
          </span>
        </div>
      )}
      {stats.hitpointsBonus && stats.hitpointsBonus > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('hitpoints')}:</span>
          <span className="text-pink-400 font-bold">+{stats.hitpointsBonus}</span>
        </div>
      )}
      {stats.accuracyBonus && stats.accuracyBonus > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('accuracy')}:</span>
          <span className="text-green-400 font-bold">+{stats.accuracyBonus}</span>
        </div>
      )}
      {stats.skillDamageBonus && stats.skillDamageBonus > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground flex items-center gap-1">
            <Sparkles className="w-3 h-3" />{t('skill_damage')}:
          </span>
          <span className="text-purple-400 font-bold">+{stats.skillDamageBonus}%</span>
        </div>
      )}
      {stats.attackSpeedBonus && stats.attackSpeedBonus > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground flex items-center gap-1">
            <Zap className="w-3 h-3" />{t('attack_speed')}:
          </span>
          <span className="text-yellow-400 font-bold">+{stats.attackSpeedBonus}%</span>
        </div>
      )}
      {stats.healingReceivedBonus && stats.healingReceivedBonus > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground flex items-center gap-1">
            <Heart className="w-3 h-3" />{t('healing_received')}:
          </span>
          <span className="text-green-400 font-bold">+{stats.healingReceivedBonus}%</span>
        </div>
      )}
      {stats.onHitHealingPercent && stats.onHitHealingPercent > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('on_hit_healing')}:</span>
          <span className="text-emerald-400 font-bold">+{stats.onHitHealingPercent}%</span>
        </div>
      )}
      {stats.buffDurationBonus && stats.buffDurationBonus > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground flex items-center gap-1">
            <Timer className="w-3 h-3" />{t('buff_duration')}:
          </span>
          <span className="text-cyan-400 font-bold">+{stats.buffDurationBonus}%</span>
        </div>
      )}
      {stats.partyDpsBuff && stats.partyDpsBuff > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground flex items-center gap-1">
            <Users className="w-3 h-3" />{t('party_dps')}:
          </span>
          <span className="text-red-400 font-bold">+{stats.partyDpsBuff}%</span>
        </div>
      )}
      {stats.partyDefenceBuff && stats.partyDefenceBuff > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground flex items-center gap-1">
            <Users className="w-3 h-3" />{t('party_defence')}:
          </span>
          <span className="text-blue-400 font-bold">+{stats.partyDefenceBuff}%</span>
        </div>
      )}
      {stats.partyAttackSpeedBuff && stats.partyAttackSpeedBuff > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground flex items-center gap-1">
            <Users className="w-3 h-3" />{t('party_speed')}:
          </span>
          <span className="text-yellow-400 font-bold">+{stats.partyAttackSpeedBuff}%</span>
        </div>
      )}
      {stats.lootChanceBonus && stats.lootChanceBonus > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground flex items-center gap-1">
            <Coins className="w-3 h-3" />{t('loot_chance')}:
          </span>
          <span className="text-amber-400 font-bold">+{stats.lootChanceBonus}%</span>
        </div>
      )}
    </div>
  );

  if (!showContainer) return content;

  return (
    <div className={`bg-[#1a1d23] rounded-lg p-3 border border-border/30 ${className}`}>
      <div className="text-xs text-muted-foreground mb-2 font-medium">{t('stats')}</div>
      {content}
    </div>
  );
}
