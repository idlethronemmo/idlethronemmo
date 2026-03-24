import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/context/LanguageContext";
import type { Item } from "@/lib/items-types";
import type { ItemStats } from "@/lib/items-types";

interface RoleStatsDisplayProps {
  item?: Item | null;
  stats?: ItemStats | null;
  variant?: "list" | "badge" | "grid";
  className?: string;
  showContainer?: boolean;
}

export function RoleStatsDisplay({ 
  item, 
  stats,
  variant = "list", 
  className = "",
  showContainer = true 
}: RoleStatsDisplayProps) {
  const { t } = useLanguage();
  
  const critChance = item?.critChance ?? stats?.critChance ?? 0;
  const critDamage = item?.critDamage ?? stats?.critDamage ?? 0;
  const healPower = item?.healPower ?? stats?.healPower ?? 0;
  const buffPower = item?.buffPower ?? stats?.buffPower ?? 0;
  
  const hasAnyStats = critChance > 0 || critDamage > 0 || healPower > 0 || buffPower > 0;
  
  if (!hasAnyStats) return null;

  if (variant === "badge") {
    const content = (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {critChance > 0 && (
          <Badge variant="secondary" className="text-xs text-orange-400">
            +{critChance}% {t('critChance')}
          </Badge>
        )}
        {critDamage > 0 && (
          <Badge variant="secondary" className="text-xs text-orange-400">
            +{critDamage}% {t('critDamage')}
          </Badge>
        )}
        {healPower > 0 && (
          <Badge variant="secondary" className="text-xs text-green-400">
            +{healPower} {t('healPower')}
          </Badge>
        )}
        {buffPower > 0 && (
          <Badge variant="secondary" className="text-xs text-emerald-400">
            +{buffPower} {t('buffPower')}
          </Badge>
        )}
      </div>
    );
    return content;
  }

  if (variant === "grid") {
    const content = (
      <div className={`grid grid-cols-2 gap-3 ${className}`}>
        {critChance > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-sm">{t('critChance')}:</span>
            <span className="text-orange-400 font-bold">+{critChance}%</span>
          </div>
        )}
        {critDamage > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-sm">{t('critDamage')}:</span>
            <span className="text-orange-400 font-bold">+{critDamage}%</span>
          </div>
        )}
        {healPower > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-sm">{t('healPower')}:</span>
            <span className="text-green-400 font-bold">+{healPower}</span>
          </div>
        )}
        {buffPower > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-sm">{t('buffPower')}:</span>
            <span className="text-emerald-400 font-bold">+{buffPower}</span>
          </div>
        )}
      </div>
    );

    if (!showContainer) return content;
    
    return (
      <div className={`bg-card/60 rounded-xl p-4 border border-border/30 ${className}`}>
        <div className="text-xs text-muted-foreground mb-3 font-medium">{t('roleStats')}</div>
        {content}
      </div>
    );
  }

  const content = (
    <div className={`space-y-1.5 text-sm ${className}`}>
      {critChance > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('critChance')}:</span>
          <span className="text-orange-400 font-bold">+{critChance}%</span>
        </div>
      )}
      {critDamage > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('critDamage')}:</span>
          <span className="text-red-400 font-bold">+{critDamage}%</span>
        </div>
      )}
      {healPower > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('healPower')}:</span>
          <span className="text-green-400 font-bold">+{healPower}</span>
        </div>
      )}
      {buffPower > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('buffPower')}:</span>
          <span className="text-emerald-400 font-bold">+{buffPower}</span>
        </div>
      )}
    </div>
  );

  if (!showContainer) return content;

  return (
    <div className={`bg-[#1a1d23] rounded-lg p-3 border border-border/30 ${className}`}>
      <div className="text-xs text-muted-foreground mb-2 font-medium">{t('roleStats')}</div>
      {content}
    </div>
  );
}
