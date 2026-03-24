import { memo } from "react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/gameMath";
import { getSubClass } from "@shared/subClasses";
import {
  Sword, Shield, Heart, Lightning, Skull, Target, Warning,
} from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DungeonMemberSnapshot } from "@/hooks/useDungeonSessionWs";

const ROLE_ICONS: Record<string, any> = {
  tank: Shield,
  dps: Sword,
  healer: Heart,
  hybrid: Lightning,
};

const ROLE_COLORS: Record<string, string> = {
  tank: "text-blue-400",
  dps: "text-red-400",
  healer: "text-green-400",
  hybrid: "text-yellow-400",
};

const ROLE_BG_COLORS: Record<string, string> = {
  tank: "border-blue-500/40",
  dps: "border-red-500/40",
  healer: "border-green-500/40",
  hybrid: "border-yellow-500/40",
};

const ROLE_GRADIENT_BG: Record<string, string> = {
  tank: "bg-gradient-to-br from-blue-700/80 to-blue-900/90",
  dps: "bg-gradient-to-br from-red-700/80 to-red-900/90",
  healer: "bg-gradient-to-br from-green-700/80 to-green-900/90",
  hybrid: "bg-gradient-to-br from-yellow-700/80 to-yellow-900/90",
};

function getHpBarColor(pct: number): string {
  if (pct > 60) return "bg-gradient-to-r from-green-600 to-green-500";
  if (pct > 30) return "bg-gradient-to-r from-yellow-600 to-orange-500";
  return "bg-gradient-to-r from-red-600 to-red-500";
}

interface PartyShowcaseCardProps {
  member: DungeonMemberSnapshot;
  isMe: boolean;
  accPct?: number;
  hasAggro?: boolean;
  flash?: { type: "damage" | "heal" | "attack"; value: number; ts: number; skillName?: string; isCrit?: boolean };
  index: number;
  totalMembers: number;
}

export const PartyShowcaseCard = memo(function PartyShowcaseCard({
  member,
  isMe,
  accPct,
  hasAggro,
  flash,
  index,
  totalMembers,
}: PartyShowcaseCardProps) {
  const role = member.role || "dps";
  const RoleIcon = ROLE_ICONS[role] || Sword;
  const roleColor = ROLE_COLORS[role] || "text-gray-400";
  const roleBg = ROLE_BG_COLORS[role] || "border-gray-600/40";
  const roleGradient = ROLE_GRADIENT_BG[role] || "bg-gradient-to-br from-gray-700/80 to-gray-900/90";
  const hpPct = member.maxHp > 0 ? Math.max(0, (member.currentHp / member.maxHp) * 100) : 0;
  const subClass = getSubClass(member.weaponType || null, member.armorType || null);
  const isRecentFlash = flash && (Date.now() - flash.ts) < 600;
  const isTank = member.role === "tank";
  const flashBorderColor = isRecentFlash
    ? flash.type === "damage"
      ? isTank
        ? "border-blue-500/80 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
        : "border-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
      : flash.type === "heal" ? "border-green-500/80 shadow-[0_0_8px_rgba(34,197,94,0.4)]"
      : "border-cyan-500/60 shadow-[0_0_6px_rgba(6,182,212,0.3)]"
    : null;

  const mid = (totalMembers - 1) / 2;
  const dist = Math.abs(index - mid);
  const arcY = totalMembers >= 3 ? Math.round(dist * 2) : 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "w-[100px] sm:w-[120px] lg:w-[130px] p-2 rounded-lg border transition-all duration-200 relative cursor-help overflow-hidden",
              !member.isAlive
                ? "bg-red-950/20 border-red-900/40 opacity-50 grayscale"
                : member.isExtracted
                  ? "bg-gray-800/20 border-gray-700/30 opacity-50"
                  : member.isDisconnected
                    ? "bg-yellow-950/20 border-yellow-700/40"
                    : flashBorderColor
                      ? `bg-gray-800/40 ${flashBorderColor}`
                      : hasAggro
                        ? "bg-red-950/25 border-red-600/50"
                        : isMe
                          ? "bg-purple-950/30 border-purple-600/50"
                          : `bg-gray-800/40 ${roleBg}`
            )}
            style={{ transform: `translateY(${arcY}px)` }}
            data-testid={`party-frame-${member.playerId}`}
          >
            {!member.isAlive && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 z-10">
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                  member.status === 'left' ? "bg-gray-800/80 text-gray-400" : "bg-red-950/80 text-red-400"
                )}>
                  {member.status === 'left' ? 'Left' : 'Dead'}
                </span>
              </div>
            )}
            {member.isAlive && member.isExtracted && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30 z-10">
                <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider bg-green-950/80 px-2 py-0.5 rounded">Extracted</span>
              </div>
            )}

            {isRecentFlash && flash.type === "heal" && (
              <div className="absolute inset-0 rounded-lg pointer-events-none z-15" style={{ animation: "healGlow 600ms ease-out forwards" }} />
            )}

            {isRecentFlash && flash.type === "heal" && (
              <>
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={`heal-particle-${flash.ts}-${i}`}
                    className="absolute text-green-400 font-bold pointer-events-none z-20 text-[10px]"
                    style={{
                      left: `${20 + i * 18}%`,
                      bottom: "30%",
                      animation: `healParticleBurst 800ms ease-out ${i * 80}ms forwards`,
                      opacity: 0,
                    }}
                  >
                    +
                  </div>
                ))}
              </>
            )}

            {isRecentFlash && flash.type === "heal" && flash.skillName && (
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-bold text-green-300 pointer-events-none z-30 whitespace-nowrap"
                style={{
                  animation: "skillNamePop 1s ease-out forwards",
                  textShadow: "0 0 6px rgba(34,197,94,0.6), 0 1px 2px rgba(0,0,0,0.8)",
                }}
              >
                {flash.skillName}
              </div>
            )}

            {isRecentFlash && flash.type === "damage" && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none z-20"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ animation: "slashFade 600ms ease-out forwards" }}
              >
                <line x1="15" y1="10" x2="85" y2="90" stroke="rgba(239,68,68,0.8)" strokeWidth="3" strokeLinecap="round" />
                <line x1="20" y1="15" x2="80" y2="85" stroke="rgba(255,100,100,0.4)" strokeWidth="5" strokeLinecap="round" />
              </svg>
            )}

            {isRecentFlash && flash.type === "damage" && (
              <div
                className="absolute inset-0 rounded-lg pointer-events-none z-15"
                style={{ animation: "cardDamageFlash 400ms ease-out forwards" }}
              />
            )}

            {isRecentFlash && flash.type === "attack" && flash.skillName && (
              <div
                className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-orange-400 pointer-events-none z-30 whitespace-nowrap"
                style={{
                  animation: "skillNamePop 1.2s ease-out forwards",
                  textShadow: "0 0 6px rgba(251,146,60,0.6), 0 1px 2px rgba(0,0,0,0.8)",
                }}
              >
                {flash.skillName}
              </div>
            )}

            {isRecentFlash && flash.type === "attack" && flash.isCrit && (
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-extrabold text-yellow-300 pointer-events-none z-30"
                style={{
                  animation: "skillNamePop 1s ease-out forwards",
                  textShadow: "0 0 8px rgba(253,224,71,0.7), 0 1px 3px rgba(0,0,0,0.9)",
                  marginTop: flash.skillName ? "-12px" : "0",
                }}
              >
                CRIT!
              </div>
            )}

            {isRecentFlash && (
              <div
                className={cn(
                  "absolute top-0 pointer-events-none z-20 font-bold",
                  flash.type === "damage"
                    ? "text-xs text-red-400"
                    : flash.type === "heal"
                      ? "text-[10px] text-green-400"
                      : "text-[10px] text-cyan-300"
                )}
                style={{
                  animation: "floatUp 1s ease-out forwards",
                  right: flash.type === "damage" ? `${2 + Math.random() * 8}px` : "4px",
                  filter: flash.type === "damage" ? "drop-shadow(0 1px 3px rgba(239,68,68,0.6))" : undefined,
                }}
              >
                {flash.type === "damage" ? `-${formatNumber(flash.value)}` : flash.type === "heal" ? `+${formatNumber(flash.value)}` : ""}
              </div>
            )}

            <div className="flex items-center gap-1.5 mb-1">
              <div
                className={cn(
                  "w-6 h-6 flex items-center justify-center rounded shrink-0 border border-white/10",
                  roleGradient,
                  !member.isAlive && "grayscale"
                )}
                data-testid={`party-char-icon-${member.playerId}`}
              >
                <RoleIcon className="w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" weight="fill" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-0.5">
                  <span className={cn(
                    "text-[10px] font-medium truncate flex-1",
                    !member.isAlive && "line-through text-red-400",
                  )}>
                    {member.username || member.playerId.slice(0, 6)}
                    {isMe && " (You)"}
                  </span>
                  {hasAggro && member.isAlive && !member.isExtracted && (
                    isTank ? (
                      <Shield className="w-3 h-3 text-blue-400 shrink-0 animate-pulse" weight="fill" />
                    ) : (
                      <Target className="w-3 h-3 text-red-400 shrink-0 animate-pulse" weight="fill" />
                    )
                  )}
                  {member.isDisconnected && <Warning className="w-3 h-3 text-yellow-400 shrink-0 animate-pulse" />}
                </div>
                {subClass && (
                  <span className={cn("text-[7px] leading-tight truncate", roleColor)} data-testid={`party-subclass-${member.playerId}`}>
                    {subClass.name}
                  </span>
                )}
              </div>
            </div>

            <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden border border-gray-700/40">
              <div
                className={cn("h-full rounded-full transition-all duration-300", getHpBarColor(hpPct))}
                style={{ width: `${hpPct}%` }}
              />
            </div>
            <div className="text-[8px] text-gray-400 text-center mt-0.5">
              {formatNumber(Math.max(0, member.currentHp))}/{formatNumber(member.maxHp)}
            </div>

            {member.isAlive && !member.isExtracted && (
              <div className="h-1 w-full bg-black/30 rounded-full overflow-hidden mt-0.5">
                <div
                  className={cn("h-full rounded-full transition-none", role === "healer" ? "bg-green-600/60" : "bg-cyan-600/60")}
                  style={{ width: `${accPct ?? Math.min(100, ((member.attackAccumulator || 0) / (member.attackSpeedMs || 2000)) * 100)}%` }}
                />
              </div>
            )}

            {member.isDisconnected && (
              <div className="text-[8px] text-yellow-400/70 text-center mt-0.5">Reconnecting...</div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs bg-gray-900 border-gray-700 text-gray-200">
          <div className="space-y-1">
            <p className="font-bold text-sm">{member.username || member.playerId.slice(0, 6)}</p>
            {subClass && (
              <>
                <p className="text-xs font-semibold text-amber-300">{subClass.name}</p>
                <p className="text-[10px] text-gray-400 italic">{subClass.passive.description}</p>
              </>
            )}
            <p className="text-xs capitalize text-gray-300">{member.role || "DPS"}</p>
            {!member.isAlive ? (
              <div className="space-y-0.5 mt-1">
                <p className="text-xs text-red-400 font-semibold">Killed in Battle</p>
                <div className="grid grid-cols-2 gap-x-2 text-xs text-gray-400">
                  <span>Total DMG: {formatNumber(member.totalDamageDealt || 0)}</span>
                  <span>Healed: {formatNumber(member.totalHealingDone || 0)}</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-2 text-xs text-gray-400 mt-1">
                <span>DPS: {formatNumber(Math.round(member.dps || 0))}</span>
                <span>DEF: {formatNumber(member.defense || 0)}</span>
                <span>SPD: {((member.attackSpeedMs || 2000) / 1000).toFixed(1)}s</span>
                <span>DMG: {formatNumber(member.totalDamageDealt || 0)}</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
