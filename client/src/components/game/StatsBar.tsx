import { useGame } from "@/context/GameContext";
import { cn } from "@/lib/utils";
import { Heart, Swords } from "lucide-react";
import { GoldDisplay } from "@/components/game/GoldDisplay";

export default function StatsBar() {
  const { currentHitpoints, maxHitpoints, gold, skills } = useGame();

  const hpPercent = maxHitpoints > 0 ? Math.round((currentHitpoints / maxHitpoints) * 100) : 100;
  
  const attackLevel = skills.attack?.level ?? 1;
  const strengthLevel = skills.strength?.level ?? 1;
  const defenceLevel = skills.defence?.level ?? 1;
  const combatLevel = Math.floor((attackLevel + strengthLevel + defenceLevel) / 3);

  return (
    <div className="flex items-center justify-center gap-6 w-full">
      <div className="flex items-center gap-3 bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg px-4 py-2">
        <Heart className="w-4 h-4 text-red-500 shrink-0" />
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden border border-border/30">
            <div 
              className={cn(
                "h-full transition-all duration-300",
                hpPercent > 50 
                  ? "bg-gradient-to-r from-red-600 to-red-500" 
                  : hpPercent > 25 
                    ? "bg-gradient-to-r from-orange-600 to-orange-500"
                    : "bg-gradient-to-r from-red-800 to-red-600"
              )}
              style={{ width: `${hpPercent}%` }}
            />
          </div>
          <span className="text-xs font-mono text-muted-foreground min-w-[60px]">
            {currentHitpoints}/{maxHitpoints}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg px-4 py-2">
        <Swords className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-bold text-primary">
          {combatLevel}
        </span>
      </div>

      <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg px-4 py-2">
        <GoldDisplay amount={gold} size="sm" />
      </div>
    </div>
  );
}
