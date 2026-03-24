import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/gameMath";
import { useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";

export interface DamageEvent {
  id: string;
  damage: number;
  isCrit: boolean;
  x: number;
  y: number;
  skillName?: string;
  effectType?: 'damage' | 'heal' | 'buff' | 'debuff' | 'lifesteal';
}

export interface PlayerDamageEvent {
  id: string;
  damage: number;
  isCrit: boolean;
  isHeal?: boolean;
  isBuff?: boolean;
  skillName?: string;
}

export interface MonsterFloatingDamage {
  id: string;
  damage: number;
  skillName: string;
  playerName: string;
  x: number;
  y: number;
  timestamp: number;
}

export interface PartyLootFloat {
  id: string;
  itemId: string;
  quantity: number;
  x: number;
  y: number;
  timestamp: number;
}

const FLOATING_DAMAGE_STYLES = `
@keyframes combatFloatUp {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  30% { opacity: 1; transform: translateY(-10px) scale(1.1); }
  100% { opacity: 0; transform: translateY(-40px) scale(0.9); }
}
@keyframes combatFloatUpFast {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-24px); }
}
`;

let floatingStylesInjected = false;
function injectFloatingStyles() {
  if (floatingStylesInjected || typeof document === 'undefined') return;
  const styleEl = document.createElement('style');
  styleEl.id = 'floating-damage-styles';
  styleEl.textContent = FLOATING_DAMAGE_STYLES;
  document.head.appendChild(styleEl);
  floatingStylesInjected = true;
}

interface FloatingDamageNumbersProps {
  events: DamageEvent[];
  className?: string;
}

export function FloatingDamageNumbers({ events, className }: FloatingDamageNumbersProps) {
  injectFloatingStyles();

  return (
    <>
      {events.map(fd => {
        const isSkillDmg = fd.skillName && fd.effectType === 'damage';
        const isDebuff = fd.skillName && fd.effectType === 'debuff';
        const isHeal = fd.effectType === 'heal' || fd.effectType === 'lifesteal';
        const isBuff = fd.effectType === 'buff';

        let color = '#ef4444';
        let glowColor = 'rgba(0,0,0,0.5)';

        if (isHeal) {
          color = '#22c55e';
          glowColor = 'rgba(34,197,94,0.7)';
        } else if (isBuff) {
          color = '#3b82f6';
          glowColor = 'rgba(59,130,246,0.7)';
        } else if (isDebuff) {
          color = '#a855f7';
          glowColor = 'rgba(168,85,247,0.7)';
        } else if (isSkillDmg) {
          color = '#f59e0b';
          glowColor = 'rgba(245,158,11,0.7)';
        }

        return (
          <div
            key={fd.id}
            className={cn(
              "absolute pointer-events-none z-20",
              isSkillDmg ? "text-3xl font-black" : "font-bold text-xl",
              className
            )}
            style={{
              left: `${fd.x}%`,
              top: `${fd.y}%`,
              animation: isSkillDmg ? 'combatFloatUp 2s ease-out forwards' : 'combatFloatUp 1.5s ease-out forwards',
              color,
              textShadow: isSkillDmg
                ? `0 0 14px ${glowColor}, 0 0 28px ${glowColor}, 0 0 42px ${glowColor}`
                : `0 0 10px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.7), 0 0 30px ${glowColor}`
            }}
            data-testid={`floating-damage-${fd.id}`}
          >
            {isHeal && <span>+{formatNumber(fd.damage)}</span>}
            {isBuff && fd.skillName && <div className="text-sm font-bold whitespace-nowrap"><span className="bg-blue-500/30 px-1.5 py-0.5 rounded">🛡 {fd.skillName}</span></div>}
            {isDebuff && <div className="text-sm font-bold whitespace-nowrap"><span className="bg-purple-500/30 px-1.5 py-0.5 rounded">💀 {fd.skillName}</span></div>}
            {isSkillDmg && <div className="text-sm font-bold whitespace-nowrap"><span className="bg-amber-500/30 px-1.5 py-0.5 rounded">⚔ {fd.skillName}</span></div>}
            {!isHeal && !isBuff && !isDebuff && !isSkillDmg && (
              <>
                {fd.isCrit && <span className="text-sm">CRIT </span>}
                <span className={fd.isCrit ? "text-2xl" : ""}>{fd.damage > 0 ? formatNumber(fd.damage) : ''}</span>
              </>
            )}
            {(isSkillDmg || isDebuff) && fd.damage > 0 && (
              <span className={isSkillDmg ? "" : ""}>{formatNumber(fd.damage)}</span>
            )}
          </div>
        );
      })}
    </>
  );
}

interface PlayerFloatingDamageProps {
  events: PlayerDamageEvent[];
  className?: string;
}

export function PlayerFloatingDamage({ events, className }: PlayerFloatingDamageProps) {
  injectFloatingStyles();

  return (
    <>
      {events.map((fd) => (
        <div
          key={fd.id}
          className={cn(
            "absolute text-sm font-bold pointer-events-none z-10",
            fd.isHeal ? "text-green-400" : fd.isBuff ? "text-blue-400" : fd.isCrit ? "text-orange-400 text-base" : "text-red-400",
            className
          )}
          style={{
            right: '8px',
            top: '0px',
            animation: 'combatFloatUpFast 1s ease-out forwards',
            textShadow: fd.isHeal ? '0 0 6px rgba(34,197,94,0.7)' : fd.isBuff ? '0 0 6px rgba(59,130,246,0.7)' : undefined
          }}
          data-testid={`player-floating-damage-${fd.id}`}
        >
          {fd.isHeal ? (
            <><span className="text-[9px]">💚 {fd.skillName}</span> +{formatNumber(fd.damage)}</>
          ) : fd.isBuff ? (
            <><span className="text-[9px]">🛡 {fd.skillName}</span> +{formatNumber(fd.damage)}</>
          ) : (
            <>-{fd.damage}</>
          )}
        </div>
      ))}
    </>
  );
}

export interface CombatFloatingLayerHandle {
  add: (damage: number, isCrit?: boolean, skillName?: string, effectType?: 'damage' | 'heal' | 'buff' | 'debuff' | 'lifesteal') => void;
}

export const CombatFloatingLayer = forwardRef<CombatFloatingLayerHandle, { t: (key: any) => string; sizeClass?: 'mobile' | 'desktop' }>(
  function CombatFloatingLayer({ t, sizeClass = 'desktop' }, ref) {
    const [events, setEvents] = useState<DamageEvent[]>([]);
    const idRef = useRef(0);

    const add = useCallback((damage: number, isCrit: boolean = false, skillName?: string, effectType?: 'damage' | 'heal' | 'buff' | 'debuff' | 'lifesteal') => {
      const id = `cfd-${idRef.current++}`;
      const x = 40 + Math.random() * 20;
      const y = 20 + Math.random() * 20;
      const event: DamageEvent = { id, damage, isCrit, x, y, skillName, effectType };
      setEvents(prev => [...prev, event]);
      setTimeout(() => {
        setEvents(prev => prev.filter(d => d.id !== id));
      }, skillName ? 2000 : 1500);
    }, []);

    useImperativeHandle(ref, () => ({ add }), [add]);

    injectFloatingStyles();

    return (
      <>
        {events.map(fd => {
          const isSkillDmg = fd.skillName && fd.effectType === 'damage';
          const isDebuff = fd.skillName && fd.effectType === 'debuff';
          const color = isDebuff ? '#a855f7' : isSkillDmg ? '#f59e0b' : '#ef4444';
          const glowColor = isDebuff ? 'rgba(168,85,247,0.7)' : isSkillDmg ? 'rgba(245,158,11,0.7)' : 'rgba(0,0,0,0.5)';
          const isMobile = sizeClass === 'mobile';
          return (
            <div
              key={fd.id}
              className={cn(
                "absolute pointer-events-none z-20",
                isSkillDmg ? (isMobile ? "text-2xl font-black" : "text-3xl font-black") : (isMobile ? "font-bold text-lg" : "font-bold text-xl")
              )}
              style={{
                left: `${fd.x}%`,
                top: `${fd.y}%`,
                animation: isSkillDmg ? 'floatUp 2s ease-out forwards' : 'floatUp 1.5s ease-out forwards',
                color,
                textShadow: isSkillDmg
                  ? `0 0 ${isMobile ? 12 : 14}px ${glowColor}, 0 0 ${isMobile ? 24 : 28}px ${glowColor}, 0 0 ${isMobile ? 36 : 42}px ${glowColor}`
                  : `0 0 ${isMobile ? 8 : 10}px rgba(0,0,0,0.9), 0 0 ${isMobile ? 16 : 20}px rgba(0,0,0,0.7), 0 0 ${isMobile ? 24 : 30}px ${glowColor}`
              }}
              data-testid={`${isMobile ? '' : 'desktop-'}combat-damage-${fd.id}`}
            >
              {fd.isCrit && !isSkillDmg && <span className={isMobile ? "text-xs" : "text-sm"}>{t('crit')}</span>}
              {isSkillDmg && <div className={cn("font-bold whitespace-nowrap", isMobile ? "text-xs" : "text-sm")}><span className="bg-amber-500/30 px-1 py-0.5 rounded">⚔ {fd.skillName}</span></div>}
              {isDebuff && <div className={cn("font-bold whitespace-nowrap", isMobile ? "text-xs" : "text-sm")}><span className="bg-purple-500/30 px-1 py-0.5 rounded">💀 {fd.skillName}</span></div>}
              <span className={fd.isCrit && !isSkillDmg ? (isMobile ? "text-xl" : "text-2xl") : ""}>{fd.damage > 0 ? formatNumber(fd.damage) : ''}</span>
            </div>
          );
        })}
      </>
    );
  }
);

export interface MonsterFloatingLayerHandle {
  add: (damage: number, skillName: string, playerName: string) => void;
}

export const MonsterFloatingLayer = forwardRef<MonsterFloatingLayerHandle, { sizeClass?: 'mobile' | 'desktop' }>(
  function MonsterFloatingLayer({ sizeClass = 'desktop' }, ref) {
    const [events, setEvents] = useState<MonsterFloatingDamage[]>([]);
    const idRef = useRef(0);

    const add = useCallback((damage: number, skillName: string, playerName: string) => {
      const id = `mfd-${idRef.current++}`;
      const x = 30 + Math.random() * 40;
      const y = 10 + Math.random() * 30;
      setEvents(prev => [...prev, { id, damage, skillName, playerName, x, y, timestamp: Date.now() }]);
      setTimeout(() => {
        setEvents(prev => prev.filter(d => d.id !== id));
      }, 2000);
    }, []);

    useImperativeHandle(ref, () => ({ add }), [add]);

    const isMobile = sizeClass === 'mobile';

    return (
      <>
        {events.map(fd => (
          <div
            key={fd.id}
            className={cn("absolute font-bold pointer-events-none z-20", isMobile ? "text-sm md:text-base" : "text-base")}
            style={{
              left: `${fd.x}%`,
              top: `${fd.y}%`,
              animation: 'floatUp 2s ease-out forwards',
              color: '#fbbf24',
              textShadow: isMobile
                ? '0 0 8px rgba(251, 191, 36, 0.8), 0 2px 4px rgba(0,0,0,0.8)'
                : '0 0 10px rgba(251, 191, 36, 0.9), 0 2px 6px rgba(0,0,0,0.9)'
            }}
            data-testid={`${isMobile ? '' : 'desktop-'}party-skill-damage-${fd.id}`}
          >
            <div className={cn("text-orange-300 font-medium whitespace-nowrap", isMobile ? "text-[10px]" : "text-xs")}>{fd.playerName}</div>
            <div className="flex items-center gap-0.5">
              <span className="text-yellow-300">{fd.skillName}!</span>
              <span className="text-white ml-1">-{formatNumber(fd.damage)}</span>
            </div>
          </div>
        ))}
      </>
    );
  }
);

export interface PlayerFloatingLayerHandle {
  addDamage: (damage: number, isCrit?: boolean) => void;
  addSkillFloat: (amount: number, skillName: string, isHeal: boolean, isBuff: boolean) => void;
}

export const PlayerFloatingLayer = forwardRef<PlayerFloatingLayerHandle, { hpContainerRef?: React.RefObject<HTMLDivElement | null> }>(
  function PlayerFloatingLayer({ hpContainerRef }, ref) {
    const [events, setEvents] = useState<PlayerDamageEvent[]>([]);
    const idRef = useRef(0);

    const addDamage = useCallback((damage: number, isCrit: boolean = false) => {
      const id = `pfd-${idRef.current++}`;
      setEvents(prev => [...prev, { id, damage, isCrit }]);
      if (hpContainerRef?.current) {
        hpContainerRef.current.classList.add('animate-shake');
        setTimeout(() => {
          hpContainerRef?.current?.classList.remove('animate-shake');
        }, 300);
      }
      setTimeout(() => {
        setEvents(prev => prev.filter(d => d.id !== id));
      }, 1200);
    }, [hpContainerRef]);

    const addSkillFloat = useCallback((amount: number, skillName: string, isHeal: boolean, isBuff: boolean) => {
      const id = `psf-${idRef.current++}`;
      setEvents(prev => [...prev, { id, damage: amount, isCrit: false, isHeal, isBuff, skillName }]);
      setTimeout(() => {
        setEvents(prev => prev.filter(d => d.id !== id));
      }, 1500);
    }, []);

    useImperativeHandle(ref, () => ({ addDamage, addSkillFloat }), [addDamage, addSkillFloat]);

    injectFloatingStyles();

    return (
      <>
        {events.map((fd) => (
          <div
            key={fd.id}
            className={cn(
              "absolute text-sm font-bold pointer-events-none z-10 animate-float-up",
              fd.isHeal ? "text-green-400" : fd.isBuff ? "text-blue-400" : fd.isCrit ? "text-orange-400 text-base" : "text-red-400"
            )}
            style={{
              right: '8px',
              top: '0px',
              textShadow: fd.isHeal ? '0 0 6px rgba(34,197,94,0.7)' : fd.isBuff ? '0 0 6px rgba(59,130,246,0.7)' : undefined
            }}
          >
            {fd.isHeal ? (
              <><span className="text-[9px]">💚 {fd.skillName}</span> +{formatNumber(fd.damage)}</>
            ) : fd.isBuff ? (
              <><span className="text-[9px]">🛡 {fd.skillName}</span> +{formatNumber(fd.damage)}</>
            ) : (
              <>-{fd.damage}</>
            )}
          </div>
        ))}
      </>
    );
  }
);

export interface PartyLootFloatLayerHandle {
  add: (itemId: string, quantity: number) => void;
}

export const PartyLootFloatLayer = forwardRef<PartyLootFloatLayerHandle, { getItemImage: (id: string) => string | undefined; RetryImageComponent: React.ComponentType<any>; PackageIcon: React.ComponentType<any>; getItemById: (id: string) => any; translateItemName: (id: string, lang: any) => string; language: any; sizeClass?: 'mobile' | 'desktop' }>(
  function PartyLootFloatLayer({ getItemImage, RetryImageComponent, PackageIcon, getItemById, translateItemName, language, sizeClass = 'desktop' }, ref) {
    const [events, setEvents] = useState<PartyLootFloat[]>([]);
    const idRef = useRef(0);

    const add = useCallback((itemId: string, quantity: number) => {
      const id = `plf-${idRef.current++}`;
      const x = 20 + Math.random() * 60;
      const y = 20 + Math.random() * 40;
      setEvents(prev => [...prev, { id, itemId, quantity, x, y, timestamp: Date.now() }]);
      setTimeout(() => {
        setEvents(prev => prev.filter(d => d.id !== id));
      }, 2500);
    }, []);

    useImperativeHandle(ref, () => ({ add }), [add]);

    return (
      <>
        {events.map(plf => {
          const itemImg = getItemImage(plf.itemId);
          const item = getItemById(plf.itemId);
          const name = item ? translateItemName(item.id, language) : plf.itemId;
          return (
            <div
              key={plf.id}
              className="absolute pointer-events-none z-20 flex items-center gap-1"
              style={{
                left: `${plf.x}%`,
                top: `${plf.y}%`,
                animation: 'floatUp 2.5s ease-out forwards',
              }}
            >
              {itemImg ? (
                <RetryImageComponent src={itemImg} alt="" className="w-6 h-6 object-contain pixelated drop-shadow-lg" spinnerClassName="w-3 h-3" />
              ) : (
                <PackageIcon className="w-5 h-5 text-emerald-400" weight="fill" />
              )}
              <span className="text-sm font-bold text-emerald-300 whitespace-nowrap drop-shadow-lg">
                +{plf.quantity} {name}
              </span>
            </div>
          );
        })}
      </>
    );
  }
);
