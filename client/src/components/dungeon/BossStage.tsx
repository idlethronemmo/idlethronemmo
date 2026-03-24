import { memo, ReactNode, useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/gameMath";
import { SkillDetailPopup } from "@/components/game/SkillDetailPopup";
import {
  Sword, Shield, Heart, Timer, Skull, Crown, Fire, Target,
} from "@phosphor-icons/react";

interface FloatingNumber {
  id: number;
  x: number;
  y: number;
  value: number;
  type: "damage" | "heal" | "crit" | "monster_damage" | "skill" | "block";
  timestamp: number;
  skillName?: string;
}

interface MonsterData {
  name: string;
  id?: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  attackSpeedMs: number;
  attackAccumulator: number;
  isBoss?: boolean;
  enraged?: boolean;
  reflectDamage?: number;
  skills?: any[];
  powerMultiplier?: number;
}

interface BossStageProps {
  monster: MonsterData;
  monsterImg: string | null;
  currentFloor: number;
  floatingNumbers: FloatingNumber[];
  accPct?: number;
  aggroTargetId: string | null;
  aggroTargetName?: string;
  summonAddsAnim: boolean;
  monsterHitKey?: number;
  bossSkillName?: string | null;
  bossSkillKey?: number;
}

export const BossStage = memo(function BossStage({
  monster,
  monsterImg,
  currentFloor,
  floatingNumbers,
  accPct,
  aggroTargetId,
  aggroTargetName,
  summonAddsAnim,
  monsterHitKey,
  bossSkillName,
  bossSkillKey,
}: BossStageProps) {
  const monsterHpPct = monster.maxHp > 0 ? Math.max(0, (monster.hp / monster.maxHp) * 100) : 0;

  const [shaking, setShaking] = useState(false);
  const [hitFlash, setHitFlash] = useState(false);
  const prevHitKeyRef = useRef(monsterHitKey);
  const [skillDisplay, setSkillDisplay] = useState<string | null>(null);
  const prevSkillKeyRef = useRef(bossSkillKey);

  useEffect(() => {
    if (monsterHitKey && monsterHitKey !== prevHitKeyRef.current) {
      prevHitKeyRef.current = monsterHitKey;
      setShaking(false);
      setHitFlash(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setShaking(true));
      });
      const t1 = setTimeout(() => setShaking(false), 400);
      const t2 = setTimeout(() => setHitFlash(false), 150);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [monsterHitKey]);

  useEffect(() => {
    if (bossSkillKey && bossSkillKey !== prevSkillKeyRef.current && bossSkillName) {
      prevSkillKeyRef.current = bossSkillKey;
      setSkillDisplay(bossSkillName);
      const t = setTimeout(() => setSkillDisplay(null), 2000);
      return () => clearTimeout(t);
    }
  }, [bossSkillKey, bossSkillName]);

  return (
    <Card className={cn(
      "border-gray-700/50 bg-[radial-gradient(ellipse_at_center,_#1a0a0a_0%,_#16162a_50%,_#0d0d1a_100%)] overflow-hidden relative",
      monster.isBoss && "border-yellow-600/50",
      monster.enraged && "border-red-600/60",
      (monster.reflectDamage ?? 0) > 0 && "border-cyan-500/40",
    )} data-testid="monster-arena">
      <div className={cn(
        "h-1 w-full",
        monster.isBoss
          ? "bg-gradient-to-r from-yellow-700 via-orange-500 to-yellow-700 animate-pulse"
          : "bg-gradient-to-r from-red-800 via-red-600 to-red-800"
      )} />
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-red-400">
              Floor {currentFloor}
            </span>
            {monster.isBoss && (
              <Badge className="text-[10px] bg-gradient-to-r from-red-600 to-orange-600 border-0 text-white" data-testid="boss-badge">
                <Crown className="w-3 h-3 mr-0.5" weight="fill" />
                BOSS
              </Badge>
            )}
            {monster.enraged && (
              <Badge className="text-[10px] bg-gradient-to-r from-orange-600 to-red-600 border-0 text-white animate-pulse" data-testid="enrage-badge">
                <Fire className="w-3 h-3 mr-0.5" weight="fill" />
                ENRAGED
              </Badge>
            )}
            {(monster.reflectDamage ?? 0) > 0 && (
              <Badge className="text-[10px] bg-gradient-to-r from-cyan-600 to-blue-600 border-0 text-white" data-testid="reflect-badge">
                REFLECT
              </Badge>
            )}
            {(monster.powerMultiplier ?? 0) > 1 && (
              <Badge
                className={cn(
                  "text-[10px] border-0 text-white font-bold",
                  (monster.powerMultiplier ?? 1) >= 4 ? "bg-gradient-to-r from-red-600 to-red-500" :
                  (monster.powerMultiplier ?? 1) >= 2 ? "bg-gradient-to-r from-orange-600 to-orange-500" :
                  "bg-gradient-to-r from-yellow-600 to-yellow-500"
                )}
                data-testid="power-multiplier-badge"
              >
                {(monster.powerMultiplier ?? 1).toFixed(1)}x
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-4 w-full">
            <div className="flex-1 flex flex-col items-end gap-1 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-gray-400">ATK</span>
                <Sword className="w-3 h-3 text-orange-400" weight="fill" />
                <span className="text-gray-200 font-bold" data-testid="monster-atk">{monster.attack || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-400">DEF</span>
                <Shield className="w-3 h-3 text-blue-400" weight="fill" />
                <span className="text-gray-200 font-bold" data-testid="monster-def">{monster.defense || 0}</span>
              </div>
            </div>

            <div className={cn(
              "relative rounded-xl border-2 overflow-hidden bg-black/60 flex items-center justify-center shrink-0 w-[120px] h-[120px] md:w-[140px] md:h-[140px]",
              monster.isBoss ? "border-yellow-500/60 shadow-[0_0_20px_rgba(234,179,8,0.2)]" : "border-gray-600/50",
              monster.enraged && "border-red-500/70"
            )} data-testid="monster-portrait" style={monster.enraged ? { animation: "enrageAura 1.5s ease-in-out infinite" } : undefined}>
              {summonAddsAnim && (
                <>
                  <div className="absolute inset-0 z-10 pointer-events-none" style={{ animation: "ghostLeft 0.8s ease-out forwards" }}>
                    {monsterImg ? <img src={monsterImg} alt="" className="w-full h-full object-cover opacity-50" /> : null}
                  </div>
                  <div className="absolute inset-0 z-10 pointer-events-none" style={{ animation: "ghostRight 0.8s ease-out forwards" }}>
                    {monsterImg ? <img src={monsterImg} alt="" className="w-full h-full object-cover opacity-50" /> : null}
                  </div>
                </>
              )}
              <div className="w-full h-full" style={
                shaking
                  ? { animation: "monsterShake 0.4s ease-in-out" }
                  : summonAddsAnim
                    ? { animation: "monsterShake 0.4s ease-in-out 0.6s" }
                    : undefined
              }>
                {monsterImg ? (
                  <img src={monsterImg} alt={monster.name} className="w-full h-full object-cover" />
                ) : (
                  <Skull className="w-12 h-12 text-red-400" weight="fill" />
                )}
              </div>

              {hitFlash && (
                <div className="absolute inset-0 z-15 pointer-events-none bg-red-500/30" style={{ animation: "bossHitFlash 0.15s ease-out forwards" }} />
              )}

              {skillDisplay && (
                <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
                  <div
                    className="text-center px-2"
                    style={{
                      animation: "bossSkillPop 2s ease-out forwards",
                    }}
                  >
                    <span className="text-base md:text-lg font-black uppercase tracking-wider"
                      style={{
                        color: "#fbbf24",
                        textShadow: "0 0 10px rgba(220,38,38,0.8), 0 0 20px rgba(220,38,38,0.5), 0 2px 4px rgba(0,0,0,0.8)",
                      }}
                    >
                      {skillDisplay}
                    </span>
                  </div>
                </div>
              )}

              {floatingNumbers.filter(f => f.type === "damage" || f.type === "crit" || f.type === "heal" || f.type === "skill" || f.type === "block").map(f => (
                <div
                  key={f.id}
                  className={cn(
                    "absolute font-bold pointer-events-none z-20",
                    f.type === "crit" ? "text-yellow-400 text-base" :
                    f.type === "skill" ? "text-orange-400 text-base" :
                    f.type === "heal" ? "text-green-400 text-base" :
                    f.type === "block" ? "text-blue-400 text-xs" :
                    "text-white text-sm"
                  )}
                  style={{
                    left: `${f.x}%`,
                    top: `${f.y}%`,
                    animation: "floatUp 1.5s ease-out forwards",
                  }}
                >
                  {f.type === "skill" && f.skillName ? (
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] text-orange-300">{f.skillName}</span>
                      <span>{formatNumber(f.value)}!</span>
                    </div>
                  ) : f.type === "crit" ? `${formatNumber(f.value)}!` :
                    f.type === "heal" ? `+${formatNumber(f.value)}` :
                    f.type === "block" ? `🛡 ${formatNumber(f.value)}` :
                    formatNumber(f.value)}
                </div>
              ))}
            </div>

            <div className="flex-1 flex flex-col items-start gap-1 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-gray-200 font-bold" data-testid="monster-spd">{((monster.attackSpeedMs || 2000) / 1000).toFixed(1)}s</span>
                <Timer className="w-3 h-3 text-purple-400" weight="fill" />
                <span className="text-gray-400">SPD</span>
              </div>
              {(monster.skills ?? []).length > 0 && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {(monster.skills ?? []).slice(0, 3).map((s, i) => (
                    <SkillDetailPopup key={i} skill={s} variant="badge" isMonsterSkill />
                  ))}
                </div>
              )}
            </div>
          </div>

          <h3 className="text-sm font-bold text-gray-100" data-testid="monster-name">
            {monster.name || "Monster"}
          </h3>
        </div>

        <div className="space-y-1">
          <div className="h-3.5 w-full bg-black/50 rounded-full overflow-hidden border border-red-900/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-300"
              style={{ width: `${monsterHpPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-gray-400 px-0.5">
            <span className="flex items-center gap-1">
              <Heart className="w-3 h-3 text-red-400" weight="fill" />
              {formatNumber(Math.max(0, monster.hp))} / {formatNumber(monster.maxHp)}
            </span>
            {aggroTargetId && aggroTargetName && (
              <span className="flex items-center gap-0.5 text-red-400" data-testid="aggro-target-name">
                <Target className="w-3 h-3" weight="fill" />
                {aggroTargetName}
              </span>
            )}
          </div>
        </div>

        <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden border border-orange-900/30">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-600 to-red-500 transition-none"
            style={{ width: `${accPct ?? Math.min(100, ((monster.attackAccumulator || 0) / (monster.attackSpeedMs || 2000)) * 100)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}, (prev, next) => {
  return prev.monster.hp === next.monster.hp &&
    prev.monster.attackAccumulator === next.monster.attackAccumulator &&
    prev.monster.enraged === next.monster.enraged &&
    prev.monster.reflectDamage === next.monster.reflectDamage &&
    prev.floatingNumbers.length === next.floatingNumbers.length &&
    prev.accPct === next.accPct &&
    prev.aggroTargetId === next.aggroTargetId &&
    prev.summonAddsAnim === next.summonAddsAnim &&
    prev.currentFloor === next.currentFloor &&
    prev.monsterHitKey === next.monsterHitKey &&
    prev.bossSkillKey === next.bossSkillKey;
});
