import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RetryImage } from "@/components/ui/retry-image";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { 
  Sword, 
  Shield, 
  Heart, 
  Skull,
  Trophy,
  Timer,
  Target,
  Lightning,
  Cookie,
  CheckCircle,
  TreeEvergreen,
  Mountains,
  Sun,
  Wall,
  Fire,
  Warning,
  X,
  Eye,
  Package,
  CaretLeft,
  CaretRight,
  Play,
  Stop,
  CaretDown,
  TShirt,
  ShieldStar,
  ArrowsClockwise,
  Flask,
  Backpack,
  Snowflake,
  Spiral,
  Key,
  Crown,
  UsersThree,
  Star,
  UserMinus,
  Bell,
  Plus,
  SignOut,
  Check,
  PaperPlaneTilt,
  MagnifyingGlass,
  Sparkle,
  Trash,
  GlobeSimple,
  Clock,
  Axe,
  UserCircle,
  Hammer,
  ListPlus,
  type Icon
} from "@phosphor-icons/react";
import { Swords } from "lucide-react";
import { SkillDetailPopup } from "@/components/game/SkillDetailPopup";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getAuthHeaders } from "@/context/FirebaseAuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGame } from "@/context/GameContext";
import { AddToQueueDialog } from "@/components/game/QueueDialog";
import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from "react";
import { MONSTERS, COMBAT_REGIONS, getMonsterById, getMonstersByRegion, isMonstersLoaded, loadMonstersData, getCombatRegions, isMonstersLoadedFromApi } from "@/lib/monsters";
import { getItemById, RARITY_COLORS, RARITY_BG_COLORS, EQUIPMENT_SLOTS, EquipmentSlot, getBaseItem, parseItemWithRarity, getItemStatsWithRarity, getItemStatsWithEnhancement, getItemRarityColor, getItemRarityBgColor, getTotalEquipmentBonus, formatItemIdAsName, translateItemName } from "@/lib/items";
import { getItemImage } from "@/lib/itemImages";
import { getMonsterImage } from "@/lib/monsterImages";
import { MonsterCard, calculateDangerLevel } from "@/components/game/MonsterCard";
import { 
  calculateMaxHit,
  calculateMinHit,
  calculateFinalMaxHit,
  calculateFinalMinHit,
  calculateDefenseMultiplier,
  calculateDamageReduction,
  calculateAccuracyRating, 
  calculateEvasionRating, 
  calculateHitChance,
  COMBAT_HP_SCALE,
  COMBAT_STYLE_MODIFIERS,
  PLAYER_ATTACK_SPEED,
  RESPAWN_DELAY,
  CombatDebuff
} from "@shared/schema";
import { getLevelFromXp, formatNumber, getLevelProgress, getXpForLevel } from "@/lib/gameMath";
import { isFood, getFoodHealAmount, getFoodById } from "@/lib/foods";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/useMobile";
import { useToast } from "@/hooks/use-toast";
import { useItemInspect } from "@/context/ItemInspectContext";
import { useGuild } from "@/context/GuildContext";
import { DurabilityBarMini } from "@/components/game/DurabilityBar";
import { getEquipmentIcon } from "@/components/game/EquipmentPanel";
import { DurationPickerDialog, InlineDurationPicker } from "@/components/game/DurationPickerDialog";
import { QueueCountdownTimer } from "@/components/game/QueueCountdownTimer";
import { getUsedQueueTimeMs } from "@shared/schema";
import { useLanguage } from "@/context/LanguageContext";
import { getLocalizedMonsterName, getLocalizedRegionName, getLocalizedRegionDescription } from "@/lib/gameTranslations";
import type { PartyRole } from "@shared/schema";
import { calculateSameMonsterBonus, calculateLootShareChance, rollPartySkill, type PartyMemberStatus, type PartySkillTemplate } from "@shared/partyBonuses";
import { Link } from "wouter";
import { MasteryCompactWidget } from "@/components/game/MasteryCompactWidget";
import { EquipmentPanel } from "@/components/game/EquipmentPanel";

import PartyMemberDetailDialog, { AVATAR_MAP, PARTY_ROLE_ICONS, PARTY_ROLE_COLORS, PARTY_ROLE_BG_COLORS } from "@/components/game/PartyMemberDetailDialog";

import { CombatHpBar } from "@/components/game/CombatHpBar";
import { FloatingDamageNumbers, PlayerFloatingDamage, CombatFloatingLayer, MonsterFloatingLayer, PlayerFloatingLayer, PartyLootFloatLayer } from "@/components/game/FloatingDamageNumbers";
import type { CombatFloatingLayerHandle, MonsterFloatingLayerHandle, PlayerFloatingLayerHandle, PartyLootFloatLayerHandle } from "@/components/game/FloatingDamageNumbers";
import { CombatLogPanel } from "@/components/game/CombatLogPanel";
import type { DamageEvent, PlayerDamageEvent } from "@/components/game/FloatingDamageNumbers";
import type { CombatLogEntry, FormulaLogEntry } from "@/components/game/CombatLogPanel";
import { BuffCountdownText, DebuffCountdownText, RespawnCountdownText } from "@/components/game/SelfUpdatingTimers";
import { useAudio } from "@/context/AudioContext";

const WEAPON_TYPE_ICONS: Record<string, React.ElementType> = {
  sword: Sword,
  longsword: Sword,
  axe: Axe,
  "2h_axe": Axe,
  "2h_sword": Sword,
  "2h_warhammer": Hammer,
  dagger: Sword,
  mace: Hammer,
  warhammer: Hammer,
  bow: Swords,
  staff: Flask,
};

interface PartyMemberData {
  id: string;
  playerId: string;
  role: PartyRole;
  position: number;
  isReady: number;
  username: string;
  totalLevel: number;
  avatar?: string;
}

interface PartyData {
  id: string;
  leaderId: string;
  name: string | null;
  status: string;
  maxSize: number;
  isPublic: number;
  regionId: string | null;
  members: PartyMemberData[];
}



interface PartyMemberCombatState {
  playerId: string;
  lastAction: 'attack' | 'heal' | 'buff' | 'damaged' | null;
  lastActionTime: number;
  lastDamage: number;
  lastHeal: number;
  currentHp: number;
  maxHp: number;
  isCritical?: boolean;
  isActive?: number;
  weaponSpeed?: number;
  lastAttackTime?: number;
}

interface FloatingText {
  id: string;
  playerId: string;
  value: number;
  type: 'damage' | 'heal' | 'critical' | 'party_skill';
  timestamp: number;
  fromPlayerName?: string;
  skillName?: string;
}

const COMBAT_ANIMATION_STYLES = `
@keyframes damage-flash {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  50% { box-shadow: 0 0 20px 4px rgba(239, 68, 68, 0.8); }
}

@keyframes heal-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
  50% { box-shadow: 0 0 20px 4px rgba(34, 197, 94, 0.8); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}

@keyframes float-up {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-24px); }
}

@keyframes attack-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.12); }
}

@keyframes buff-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0); }
  50% { box-shadow: 0 0 16px 4px rgba(168, 85, 247, 0.7); }
}

@keyframes action-icon-fade {
  0% { opacity: 1; transform: scale(1); }
  70% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.8); }
}

@keyframes critical-bounce {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  30% { transform: translateY(-12px) scale(1.2); }
  60% { transform: translateY(-20px) scale(1.1); }
  100% { opacity: 0; transform: translateY(-28px) scale(1); }
}

.party-damage-effect {
  animation: damage-flash 0.4s ease-out, shake 0.3s ease-in-out;
}

.party-heal-effect {
  animation: heal-glow 0.5s ease-out;
}

.party-attack-effect {
  animation: attack-pulse 0.3s ease-out;
}

.party-buff-effect {
  animation: buff-glow 0.5s ease-out;
}

.party-float-damage {
  animation: float-up 0.8s ease-out forwards;
}

.party-float-heal {
  animation: float-up 0.8s ease-out forwards;
}

.party-float-critical {
  animation: critical-bounce 1s ease-out forwards;
}

.animate-shake {
  animation: shake 0.3s ease-in-out;
}

.animate-float-up {
  animation: float-up 1s ease-out forwards;
}

.party-action-icon {
  animation: action-icon-fade 2s ease-out forwards;
}

@keyframes floatUp {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  30% { opacity: 1; transform: translateY(-10px) scale(1.1); }
  100% { opacity: 0; transform: translateY(-40px) scale(0.9); }
}
`;

// Inject combat animation styles once into document head
let combatStylesInjected = false;
function injectCombatStyles() {
  if (combatStylesInjected || typeof document === 'undefined') return;
  const styleEl = document.createElement('style');
  styleEl.id = 'party-combat-animations';
  styleEl.textContent = COMBAT_ANIMATION_STYLES;
  document.head.appendChild(styleEl);
  combatStylesInjected = true;
}

const REGION_ICONS: Record<string, React.ReactNode> = {
  verdant: <TreeEvergreen className="w-5 h-5" weight="fill" />,
  quarry: <Mountains className="w-5 h-5" weight="fill" />,
  dunes: <Sun className="w-5 h-5" weight="fill" />,
  obsidian: <Wall className="w-5 h-5" weight="fill" />,
  dragonspire: <Fire className="w-5 h-5" weight="fill" />,
  frozen_wastes: <Snowflake className="w-5 h-5" weight="fill" />,
  void_realm: <Spiral className="w-5 h-5" weight="fill" />,
};

const REGION_COLORS: Record<string, { bg: string; border: string; text: string; gradient: string; radialGradient: string }> = {
  verdant: { 
    bg: "bg-green-500/20", 
    border: "border-green-500/50", 
    text: "text-green-400",
    gradient: "from-green-600/30 to-green-900/50",
    radialGradient: "radial-gradient(ellipse at center, #166534 0%, #14532d 40%, #052e16 100%)"
  },
  quarry: { 
    bg: "bg-amber-500/20", 
    border: "border-amber-500/50", 
    text: "text-amber-400",
    gradient: "from-amber-600/30 to-amber-900/50",
    radialGradient: "radial-gradient(ellipse at center, #b45309 0%, #78350f 40%, #451a03 100%)"
  },
  dunes: { 
    bg: "bg-yellow-500/20", 
    border: "border-yellow-500/50", 
    text: "text-yellow-400",
    gradient: "from-yellow-600/30 to-yellow-900/50",
    radialGradient: "radial-gradient(ellipse at center, #a16207 0%, #713f12 40%, #422006 100%)"
  },
  obsidian: { 
    bg: "bg-purple-500/20", 
    border: "border-purple-500/50", 
    text: "text-purple-400",
    gradient: "from-purple-600/30 to-purple-900/50",
    radialGradient: "radial-gradient(ellipse at center, #7c3aed 0%, #581c87 40%, #2e1065 100%)"
  },
  dragonspire: { 
    bg: "bg-red-500/20", 
    border: "border-red-500/50", 
    text: "text-red-400",
    gradient: "from-red-600/30 to-red-900/50",
    radialGradient: "radial-gradient(ellipse at center, #dc2626 0%, #7f1d1d 40%, #450a0a 100%)"
  },
  frozen_wastes: { 
    bg: "bg-cyan-500/20", 
    border: "border-cyan-500/50", 
    text: "text-cyan-400",
    gradient: "from-cyan-600/30 to-cyan-900/50",
    radialGradient: "radial-gradient(ellipse at center, #0891b2 0%, #155e75 40%, #083344 100%)"
  },
  void_realm: { 
    bg: "bg-indigo-500/20", 
    border: "border-indigo-500/50", 
    text: "text-indigo-400",
    gradient: "from-indigo-600/30 to-indigo-900/50",
    radialGradient: "radial-gradient(ellipse at center, #4f46e5 0%, #3730a3 40%, #1e1b4b 100%)"
  },
};

// Dungeon key colors matching DungeonPage
const KEY_COLORS: Record<string, { bg: string; border: string; text: string; color: string }> = {
  bronze: { 
    bg: "bg-amber-600/20", 
    border: "border-amber-600/40", 
    text: "text-amber-500",
    color: "#b45309"
  },
  silver: { 
    bg: "bg-slate-400/20", 
    border: "border-slate-400/40", 
    text: "text-slate-300",
    color: "#94a3b8"
  },
  gold: { 
    bg: "bg-yellow-500/20", 
    border: "border-yellow-500/40", 
    text: "text-yellow-400",
    color: "#eab308"
  },
  void: { 
    bg: "bg-purple-600/20", 
    border: "border-purple-600/40", 
    text: "text-purple-400",
    color: "#9333ea"
  },
};

interface PlayerKey {
  keyType: string;
  quantity: number;
}

interface PartyMemberStatusInfo {
  playerId: string;
  playerName: string | null;
  currentRegion: string | null;
  currentMonsterId: string | null;
  isInCombat: number;
  cachedWeaponType: string | null;
  currentSkill: string | null;
  lastSyncAt: string | null;
  memberMinHit?: number;
  memberMaxHit?: number;
}

function PartyMembersPanel({
  party,
  currentPlayerId,
  onMemberClick,
  isCompact = false,
  combatStates = [],
  floatingTexts = [],
  onNudge,
  onKick,
  membersStatus = [],
  currentPlayerMonsterId = null
}: {
  party: PartyData;
  currentPlayerId: string | undefined;
  onMemberClick: (member: PartyMemberData) => void;
  isCompact?: boolean;
  combatStates?: PartyMemberCombatState[];
  floatingTexts?: FloatingText[];
  onNudge?: (playerId: string) => void;
  onKick?: (playerId: string) => void;
  membersStatus?: PartyMemberStatusInfo[];
  currentPlayerMonsterId?: string | null;
}) {
  const { t, language } = useLanguage();
  const { isMobile } = useMobile();
  const now = Date.now();
  const EFFECT_DURATION = 500;
  const ACTION_ICON_DURATION = 2000;

  const isLeader = currentPlayerId === party.leaderId;
  const getCombatState = (playerId: string) => combatStates.find(s => s.playerId === playerId);
  const getFloatingTextsForMember = (playerId: string) => floatingTexts.filter(ft => ft.playerId === playerId);
  const getMemberStatus = (playerId: string) => membersStatus.find(s => s.playerId === playerId);

  const getHpBarColor = (currentHp: number, maxHp: number) => {
    const percent = (currentHp / maxHp) * 100;
    if (percent > 50) return "bg-green-500";
    if (percent > 25) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getActionIcon = (action: PartyMemberCombatState['lastAction']) => {
    switch (action) {
      case 'attack': return <Sword className="w-3 h-3 text-red-400" weight="fill" />;
      case 'heal': return <Heart className="w-3 h-3 text-green-400" weight="fill" />;
      case 'buff': return <Shield className="w-3 h-3 text-purple-400" weight="fill" />;
      case 'damaged': return <Skull className="w-3 h-3 text-orange-400" weight="fill" />;
      default: return null;
    }
  };

  useEffect(() => {
    injectCombatStyles();
  }, []);

  return (
    <div className={cn(
      "flex items-center gap-2 p-2 rounded-xl bg-gradient-to-r from-violet-900/30 to-indigo-900/30 border border-violet-500/30",
      isCompact ? "flex-wrap" : ""
    )}>
      <div className="flex items-center gap-1.5 shrink-0">
        <UsersThree className="w-4 h-4 text-violet-400" weight="fill" />
        <span className="text-xs font-medium text-violet-300">{party.name || t('party')}</span>
      </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-violet-500/30">
          {(party.members || []).map((member) => {
            const RoleIcon = PARTY_ROLE_ICONS[member.role];
            const isMemberLeader = member.playerId === party.leaderId;
            const isSelf = member.playerId === currentPlayerId;
            const avatarSrc = member.avatar && AVATAR_MAP[member.avatar] ? AVATAR_MAP[member.avatar] : AVATAR_MAP['knight'];
            const combatState = getCombatState(member.playerId);
            const memberFloatingTexts = getFloatingTextsForMember(member.playerId);
            const memberStatus = getMemberStatus(member.playerId);
            const isMemberInactive = combatState?.isActive === 0;
            
            const isRecentAction = combatState && (now - combatState.lastActionTime) < EFFECT_DURATION;
            const showActionIcon = combatState && combatState.lastAction && (now - combatState.lastActionTime) < ACTION_ICON_DURATION;
            
            const effectClass = isRecentAction ? (
              combatState.lastAction === 'damaged' ? 'party-damage-effect' :
              combatState.lastAction === 'heal' ? 'party-heal-effect' :
              combatState.lastAction === 'attack' ? 'party-attack-effect' :
              combatState.lastAction === 'buff' ? 'party-buff-effect' : ''
            ) : '';

            const avatarSize = isCompact ? (isMobile ? "w-9 h-9" : "w-10 h-10") : (isMobile ? "w-11 h-11" : "w-12 h-12");
            
            const memberMonsterId = memberStatus?.currentMonsterId;
            const isFightingSameMonster = !isSelf && memberMonsterId && currentPlayerMonsterId && memberMonsterId === currentPlayerMonsterId;
            const isOnline = memberStatus?.lastSyncAt ? (Date.now() - new Date(memberStatus.lastSyncAt).getTime()) < 60000 : true;
            const memberMonster = memberMonsterId ? getMonsterById(memberMonsterId) : null;
            const memberMonsterName = memberMonster ? getLocalizedMonsterName(language, memberMonster.id) : null;
            
            return (
              <TooltipProvider key={member.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "relative shrink-0 flex flex-col items-center gap-0.5",
                      isMemberInactive && "opacity-50",
                      isFightingSameMonster && "ring-2 ring-purple-500/50 rounded-lg p-0.5 bg-purple-500/10"
                    )} data-testid={`party-member-container-${member.playerId}`}>
                <button
                  onClick={() => onMemberClick(member)}
                  className={cn(
                    "relative group",
                    avatarSize
                  )}
                  data-testid={`party-member-avatar-${member.playerId}`}
                >
                  <div 
                    key={combatState?.lastActionTime || 'static'}
                    className={cn(
                      "w-full h-full rounded-full border-2 overflow-hidden transition-all duration-200",
                      "hover:scale-105 hover:shadow-lg",
                      PARTY_ROLE_BG_COLORS[member.role],
                      isSelf && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                      effectClass,
                      isMemberInactive && "grayscale"
                    )}
                  >
                    <img
                      src={avatarSrc}
                      alt={member.username}
                      className={cn(
                        "w-full h-full object-cover",
                        isMemberInactive && "grayscale"
                      )}
                    />
                  </div>
                  
                  {isMemberLeader && (
                    <Crown 
                      className="absolute -top-1 -right-1 w-4 h-4 text-yellow-400 drop-shadow-lg z-10" 
                      weight="fill" 
                    />
                  )}
                  
                  {isMemberInactive && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] px-1 py-0 h-4 z-20"
                      data-testid={`party-member-inactive-badge-${member.playerId}`}
                    >
                      Inactive
                    </Badge>
                  )}
                  
                  <div className={cn(
                    "absolute -bottom-0.5 left-1/2 -translate-x-1/2 p-0.5 rounded-full z-10",
                    member.role === "tank" ? "bg-blue-500" :
                    member.role === "dps" ? "bg-red-500" :
                    member.role === "healer" ? "bg-green-500" : "bg-purple-500"
                  )}>
                    <RoleIcon className="w-2.5 h-2.5 text-white" weight="fill" />
                  </div>
                  
                  {memberStatus?.cachedWeaponType && WEAPON_TYPE_ICONS[memberStatus.cachedWeaponType] && (() => {
                    const WeaponIcon = WEAPON_TYPE_ICONS[memberStatus.cachedWeaponType!];
                    return (
                      <div className="absolute -bottom-0.5 -left-0.5 p-0.5 rounded-full bg-amber-600 z-10">
                        <WeaponIcon className="w-2 h-2 text-white" weight="fill" />
                      </div>
                    );
                  })()}
                  
                  {showActionIcon && (
                    <div 
                      key={`action-${combatState.lastActionTime}`}
                      className="absolute -top-1 -left-1 p-0.5 bg-card/90 rounded-full border border-border/50 shadow-md party-action-icon z-20"
                    >
                      {getActionIcon(combatState.lastAction)}
                    </div>
                  )}
                  
                  <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end justify-center pb-1">
                    <span className="text-[8px] text-white font-medium truncate max-w-[90%]">{member.username}</span>
                  </div>
                  
                  {memberFloatingTexts.map((ft) => (
                    <div
                      key={ft.id}
                      className={cn(
                        "absolute left-1/2 -translate-x-1/2 -top-2 font-bold pointer-events-none z-30 whitespace-nowrap",
                        ft.type === 'damage' && "text-red-400 text-xs party-float-damage",
                        ft.type === 'heal' && "text-green-400 text-xs party-float-heal",
                        ft.type === 'critical' && "text-yellow-400 text-sm party-float-critical"
                      )}
                      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
                    >
                      {ft.type === 'damage' ? `-${ft.value}` : `+${ft.value}`}
                    </div>
                  ))}
                </button>
                
                {combatState && (
                  <div className={cn(
                    "w-full h-1 rounded-full bg-black/40 overflow-hidden",
                    isCompact ? "max-w-[36px]" : "max-w-[44px]"
                  )}>
                    <div 
                      className={cn(
                        "h-full transition-all duration-300 rounded-full",
                        getHpBarColor(combatState.currentHp, combatState.maxHp)
                      )}
                      style={{ width: `${Math.max(0, Math.min(100, (combatState.currentHp / combatState.maxHp) * 100))}%` }}
                    />
                  </div>
                )}
                
                {isMobile && !isSelf && (
                  <div className="text-[8px] text-center truncate max-w-[48px] mt-0.5" data-testid={`party-member-activity-${member.playerId}`}>
                    {memberStatus?.isInCombat && memberMonsterName ? (
                      <span className={cn("text-red-400", isFightingSameMonster && "text-purple-400")}>
                        ⚔️ {memberMonsterName}
                      </span>
                    ) : memberStatus?.currentSkill ? (
                      <span className="text-blue-400">
                        {t(memberStatus.currentSkill as any)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t('partyMemberIdle')}</span>
                    )}
                  </div>
                )}
                
                {isLeader && isMemberInactive && !isSelf && (
                  <div className="flex items-center gap-1 mt-0.5">
                    {onNudge && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onNudge(member.playerId); }}
                        className="p-1 rounded-full bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
                        title="Dürt"
                        data-testid={`party-member-nudge-${member.playerId}`}
                      >
                        <Bell className="w-3 h-3 text-amber-400" weight="fill" />
                      </button>
                    )}
                    {onKick && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onKick(member.playerId); }}
                        className="p-1 rounded-full bg-red-500/20 border border-red-500/40 hover:bg-red-500/30 transition-colors"
                        title="At"
                        data-testid={`party-member-kick-${member.playerId}`}
                      >
                        <UserMinus className="w-3 h-3 text-red-400" weight="fill" />
                      </button>
                    )}
                  </div>
                )}
                
                {/* Online/Offline Indicator */}
                {!isOnline && !isSelf && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-gray-500 rounded-full border border-gray-400" 
                    title={t('partyMemberOffline')}
                    data-testid={`party-member-offline-${member.playerId}`}
                  />
                )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs p-2" data-testid={`party-member-tooltip-${member.playerId}`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <RoleIcon className={cn("w-4 h-4", PARTY_ROLE_COLORS[member.role])} weight="fill" />
                        <span className="font-medium">{member.username}</span>
                        {isMemberLeader && <Crown className="w-3 h-3 text-yellow-400" weight="fill" />}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {memberStatus?.isInCombat && memberMonsterName ? (
                          <span className={cn(
                            "flex items-center gap-1",
                            isFightingSameMonster && "text-purple-400 font-medium"
                          )}>
                            <Sword className="w-3 h-3" />
                            {t('partyMemberFighting').replace('{monster}', memberMonsterName)}
                            {isFightingSameMonster && <Sparkle className="w-3 h-3 text-purple-400" weight="fill" />}
                          </span>
                        ) : memberStatus?.currentSkill ? (
                          <span className="flex items-center gap-1 text-blue-400">
                            <Star className="w-3 h-3" />
                            {t(memberStatus.currentSkill as any)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {t('partyMemberIdle')}
                          </span>
                        )}
                      </div>
                      {memberStatus?.cachedWeaponType && WEAPON_TYPE_ICONS[memberStatus.cachedWeaponType] && (() => {
                        const WpnIcon = WEAPON_TYPE_ICONS[memberStatus.cachedWeaponType!];
                        return (
                          <div className="text-xs text-amber-400/80 flex items-center gap-1">
                            <WpnIcon className="w-3 h-3" weight="fill" />
                            <span className="capitalize">{memberStatus.cachedWeaponType}</span>
                          </div>
                        );
                      })()}
                      {!isOnline && (
                        <div className="text-xs text-gray-400 flex items-center gap-1">
                          <GlobeSimple className="w-3 h-3" />
                          {t('partyMemberOffline')}
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
    </div>
  );
}

interface AttackProgressHandle {
  setProgress: (value: number) => void;
}

const AttackProgressBar = forwardRef<
  AttackProgressHandle,
  { className?: string; indicatorClassName?: string }
>(({ className, indicatorClassName }, ref) => {
  const indicatorRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    setProgress: (value: number) => {
      if (indicatorRef.current) {
        indicatorRef.current.style.transform = `translateX(-${100 - Math.min(100, Math.max(0, value))}%)`;
      }
    },
  }));

  return (
    <div className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
      className
    )}>
      <div
        ref={indicatorRef}
        className={cn("h-full w-full flex-1 bg-primary transition-transform duration-75 ease-linear", indicatorClassName)}
        style={{ transform: "translateX(-100%)" }}
      />
    </div>
  );
});
AttackProgressBar.displayName = "AttackProgressBar";

type MonsterAnimationType = "idle" | "attacking" | "hit" | "dying" | "spawning";

export default function CombatPage() {
  const { 
    skills, 
    currentHitpoints, 
    maxHitpoints, 
    activeCombat, 
    startCombat, 
    stopCombat,
    forceClearCombat,
    dealDamageToMonster, 
    takeDamage, 
    healPlayer,
    grantCombatXp,
    addLoot,
    debugMode,
    inventory,
    selectedFood,
    setSelectedFood,
    autoEatEnabled,
    setAutoEatEnabled,
    autoEatThreshold,
    setAutoEatThreshold,
    selectedPotion,
    setSelectedPotion,
    autoPotionEnabled,
    setAutoPotionEnabled,
    eatFood,
    eatFoodUntilFull,
    currentHitpointsRef,
    equipment,
    equipItem,
    unequipItem,
    trackCombatKill,
    trackCombatDeath,
    trackCombatLoot,
    trackCombatXp,
    getBuffEffect,
    usePotion,
    activeBuffs,
    combatStyle,
    setCombatStyle,
    equipmentDurability,
    getSlotDurability,
    applyCombatDurabilityLoss,
    applyDeathDurabilityPenalty,
    hasLowDurabilityEquipment,
    registerCombatCallbacks,
    unregisterCombatCallbacks,
    combatDebuffs,
    currentRegion,
    activeTravel,
    itemModifications,
    cursedItems,
    activeTask,
    taskQueue,
    maxQueueSlotsCount,
    isQueueV2,
    maxQueueTimeMsTotal,
    startCombatWithDuration,
    addToQueue,
    removeFromQueue,
    player,
    isGuest,
    setPartyCombatBonuses,
    combatOfflineProgress,
  } = useGame();

  const { isMobile } = useMobile();
  const { toast } = useToast();
  const { openInspect } = useItemInspect();
  const { myBonuses } = useGuild();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const { playSfx, preloadCombatSounds } = useAudio();
  const [queueDialogMonster, setQueueDialogMonster] = useState<any>(null);
  const [durationPickerMonster, setDurationPickerMonster] = useState<any>(null);
  const [fabDurationSheetOpen, setFabDurationSheetOpen] = useState(false);
  
  // Track monsters data loading state and API status
  const [monstersLoaded, setMonstersLoaded] = useState(isMonstersLoaded());
  const [loadedFromApi, setLoadedFromApi] = useState(isMonstersLoadedFromApi());
  
  useEffect(() => {
    if (isMonstersLoaded()) {
      setMonstersLoaded(true);
      setLoadedFromApi(isMonstersLoadedFromApi());
      return;
    }
    
    loadMonstersData().then(() => {
      setMonstersLoaded(true);
      setLoadedFromApi(isMonstersLoadedFromApi());
    });
  }, []);
  
  // Fetch player dungeon keys
  const { data: keysData, refetch: refetchKeys } = useQuery({
    queryKey: ["/api/player/keys"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/player/keys", {
        credentials: "include",
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch keys");
      return res.json();
    },
    refetchInterval: 120000,
    staleTime: 15000,
    enabled: !!player,
  });
  
  const playerKeys: PlayerKey[] = keysData?.keys || [];
  const prevKeysRef = useRef<Record<string, number>>({});

  const preloadedRef = useRef(false);
  useEffect(() => {
    if (activeCombat && !preloadedRef.current) {
      preloadedRef.current = true;
      const wId = equipment?.weapon;
      const wItem = wId ? getBaseItem(wId) : null;
      preloadCombatSounds(wItem?.weaponCategory || null);
    }
    if (!activeCombat) preloadedRef.current = false;
  }, [activeCombat, equipment, preloadCombatSounds]);
  
  const [showLeavePartyForCombat, setShowLeavePartyForCombat] = useState(false);
  
  const { data: currentParty } = useQuery<PartyData | null>({
    queryKey: ["/api/parties/current"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/parties/current");
        const data = await res.json();
        if (data.party) return data.party;
        return null;
      } catch (error: any) {
        if (error.message?.includes("404") || error.message?.includes("not in a party")) {
          return null;
        }
        throw error;
      }
    },
    staleTime: 30000,
    enabled: !isGuest,
  });

  const leavePartyMutation = useMutation({
    mutationFn: async (partyId: string) => {
      const res = await apiRequest("POST", `/api/parties/${partyId}/leave`);
      return res.json();
    },
    onSuccess: (_data, partyId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      queryClient.removeQueries({ queryKey: ['/api/party', partyId, 'combat'] });
      queryClient.removeQueries({ queryKey: ['/api/party', partyId, 'combat', 'logs'] });
      toast({ title: language === 'tr' ? "Partiden ayrıldın" : "Left party" });
    },
    onError: (error: any) => {
      toast({ title: t('error'), description: error.message, variant: "destructive" });
    },
  });


  // Client-side party combat: Each player runs their own combat loop
  // Old server-authoritative party combat queries have been removed
  // Party sync happens via POST /api/parties/:id/sync endpoint
  const isInPartyCombat = false; // Deprecated: party members now use individual combat
  const isPartyLeader = currentParty && player?.id === currentParty.leaderId;

  const getMemberUsername = useCallback((playerId: string) => {
    return currentParty?.members?.find(m => m.playerId === playerId)?.username || 'Unknown';
  }, [currentParty?.members]);

  // Send heartbeat every 30 seconds while in party combat to prevent being marked inactive
  useEffect(() => {
    if (!isInPartyCombat || !currentParty?.id) return;
    
    const sendHeartbeat = async () => {
      try {
        await apiRequest("POST", `/api/parties/${currentParty.id}/heartbeat`);
      } catch (error) {
        console.error("Heartbeat failed:", error);
      }
    };
    
    // Send immediately on mount/activation
    sendHeartbeat();
    
    // Then every 30 seconds
    const interval = setInterval(sendHeartbeat, 30000);
    
    return () => clearInterval(interval);
  }, [isInPartyCombat, currentParty?.id]);

  // Client-side party combat - no server mutation needed
  // Each party member runs their own combat loop, party sync happens via polling

  // Client-side party combat - stop is handled by each member's local stopCombat

  const claimPartyLootMutation = useMutation({
    mutationFn: async () => {
      if (!currentParty?.id) return null;
      const response = await apiRequest("POST", `/api/party/${currentParty.id}/combat/claim-loot`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data?.claimedItems?.length > 0) {
        for (const item of data.claimedItems) {
          addLogEntryRef.current?.(`Received: ${formatItemIdAsName(item.itemId)} x${item.quantity}`, "loot");
        }
        queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      }
    },
    onError: (error: any) => {
      console.error('[PartyCombat] Loot claim error:', error);
    }
  });
  
  const [selectedPartyMember, setSelectedPartyMember] = useState<PartyMemberData | null>(null);
  const [showMemberDetailDialog, setShowMemberDetailDialog] = useState(false);
  
  const [partyMemberCombatStates, setPartyMemberCombatStates] = useState<PartyMemberCombatState[]>([]);
  const [partyFloatingTexts, setPartyFloatingTexts] = useState<FloatingText[]>([]);
  const [partyPlayerAttackProgress, setPartyPlayerAttackProgress] = useState(0);
  const [partyMonsterAttackProgress, setPartyMonsterAttackProgress] = useState(0);
  const floatingTextIdRef = useRef(0);
  const processedLogIdsRef = useRef<Set<string>>(new Set());
  
  // Monster animation state
  const [monsterAnimation, setMonsterAnimation] = useState<MonsterAnimationType>("idle");
  const monsterAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Helper to trigger monster animation with auto-reset
  const triggerMonsterAnimation = useCallback((animation: MonsterAnimationType, duration: number) => {
    if (monsterAnimationTimeoutRef.current) {
      clearTimeout(monsterAnimationTimeoutRef.current);
    }
    setMonsterAnimation(animation);
    // All animations reset to idle after duration (including dying)
    if (animation !== "idle") {
      monsterAnimationTimeoutRef.current = setTimeout(() => {
        setMonsterAnimation("idle");
      }, duration);
    }
  }, []);
  
  // Party sync state for individual combat synchronization
  const [partyMembersStatus, setPartyMembersStatus] = useState<PartyMemberStatusInfo[]>([]);

  // Shared skill events from party members
  const [partySkillEvents, setPartySkillEvents] = useState<Array<{
    id: string;
    fromPlayerId: string;
    fromPlayerName: string;
    skillName: string;
    skillDamage: number;
    skillChance: number;
    skillEffect: string;
    timestamp: number;
  }>>([]);

  // Shared loot notifications
  const [partyLootNotifications, setPartyLootNotifications] = useState<Array<{
    id: string;
    fromPlayerName: string;
    itemName: string;
    itemRarity: string;
    timestamp: number;
  }>>([]);

  // Same monster bonus
  const [sameMonsterBonus, setSameMonsterBonus] = useState<{
    dpsBonus: number;
    defenseBonus: number;
    sameMonsterCount: number;
  }>({ dpsBonus: 0, defenseBonus: 0, sameMonsterCount: 0 });

  const combatFloatingMobileRef = useRef<CombatFloatingLayerHandle>(null);
  const combatFloatingDesktopRef = useRef<CombatFloatingLayerHandle>(null);
  const monsterFloatingMobileRef = useRef<MonsterFloatingLayerHandle>(null);
  const monsterFloatingDesktopRef = useRef<MonsterFloatingLayerHandle>(null);
  const partyLootMobileRef = useRef<PartyLootFloatLayerHandle>(null);
  const partyLootDesktopRef = useRef<PartyLootFloatLayerHandle>(null);
  const playerFloatingRef = useRef<PlayerFloatingLayerHandle>(null);
  const playerHpContainerRef = useRef<HTMLDivElement>(null);

  const addMonsterFloatingDamage = useCallback((damage: number, skillName: string, playerName: string) => {
    monsterFloatingMobileRef.current?.add(damage, skillName, playerName);
    monsterFloatingDesktopRef.current?.add(damage, skillName, playerName);
  }, []);

  const addPartyLootFloat = useCallback((itemId: string, quantity: number) => {
    partyLootMobileRef.current?.add(itemId, quantity);
    partyLootDesktopRef.current?.add(itemId, quantity);
  }, []);

  const addCombatFloatingDamage = useCallback((damage: number, isCrit: boolean = false, skillName?: string, effectType?: 'damage' | 'heal' | 'buff' | 'debuff' | 'lifesteal') => {
    combatFloatingMobileRef.current?.add(damage, isCrit, skillName, effectType);
    combatFloatingDesktopRef.current?.add(damage, isCrit, skillName, effectType);
  }, []);

  const addPlayerFloatingDamage = useCallback((damage: number, isCrit: boolean = false) => {
    playerFloatingRef.current?.addDamage(damage, isCrit);
  }, []);

  const addPlayerSkillFloat = useCallback((amount: number, skillName: string, isHeal: boolean, isBuff: boolean) => {
    playerFloatingRef.current?.addSkillFloat(amount, skillName, isHeal, isBuff);
  }, []);

  // Party sync effect - sync own combat state and fetch party members' status
  useEffect(() => {
    if (!currentParty?.id || !activeCombat || !activeCombat.monsterId) return;
    
    const partyId = currentParty.id;
    
    const weaponId = equipment["weapon"];
    const weaponItem = weaponId ? getBaseItem(weaponId) : null;
    const currentWeaponType = weaponItem?.weaponCategory || null;
    
    const syncOwnState = async () => {
      try {
        await apiRequest("POST", `/api/parties/${partyId}/sync`, {
          currentRegion: currentRegion,
          currentMonsterId: activeCombat.monsterId,
          isInCombat: true,
          weaponType: currentWeaponType
        });
      } catch { }
    };
    
    const fetchMembersStatus = async () => {
      try {
        const res = await apiRequest("GET", `/api/parties/${partyId}/members-status`);
        const data = await res.json();
        if (data.members) {
          setPartyMembersStatus(data.members);
          queryClient.setQueryData(['/api/parties/current'], (old: any) => {
            if (!old?.members) return old;
            const statusMap = new Map(data.members.map((m: any) => [m.playerId, m]));
            return {
              ...old,
              members: old.members.map((m: any) => {
                const fresh = statusMap.get(m.playerId);
                if (!fresh) return m;
                return { ...m, currentMonsterId: fresh.currentMonsterId, isInCombat: fresh.isInCombat, currentRegion: fresh.currentRegion };
              })
            };
          });
        }
      } catch { }
    };
    
    syncOwnState();
    fetchMembersStatus();
    
    const syncInterval = setInterval(() => {
      syncOwnState();
      fetchMembersStatus();
    }, 30000);
    
    return () => clearInterval(syncInterval);
  }, [currentParty?.id, activeCombat?.monsterId, currentRegion, equipment]);

  // Clear combat state when combat stops
  useEffect(() => {
    if (!currentParty?.id || activeCombat) return;
    
    const partyId = currentParty.id;
    
    const clearCombatState = async () => {
      try {
        await apiRequest("POST", `/api/parties/${partyId}/sync`, {
          currentRegion: currentRegion,
          currentMonsterId: null,
          isInCombat: false
        });
      } catch { }
    };
    
    clearCombatState();
  }, [currentParty?.id, activeCombat]);

  // Update same monster bonus when party status changes
  useEffect(() => {
    if (!currentParty || !activeCombat?.monsterId || !player?.id) {
      setSameMonsterBonus({ dpsBonus: 0, defenseBonus: 0, sameMonsterCount: 0 });
      return;
    }
    
    const members: PartyMemberStatus[] = partyMembersStatus.map(m => ({
      playerId: m.playerId,
      playerName: m.playerName || '',
      currentRegion: m.currentRegion,
      currentMonsterId: m.currentMonsterId,
      isInCombat: m.isInCombat
    }));
    
    const bonus = calculateSameMonsterBonus(
      activeCombat.monsterId,
      currentRegion,
      members,
      player.id
    );
    
    setSameMonsterBonus(bonus);
  }, [partyMembersStatus, activeCombat?.monsterId, currentRegion, player?.id, currentParty]);

  // Propagate same-monster bonuses to GameContext for combat calculations
  useEffect(() => {
    if (sameMonsterBonus.dpsBonus > 0 || sameMonsterBonus.defenseBonus > 0) {
      setPartyCombatBonuses({
        dpsBonus: sameMonsterBonus.dpsBonus,
        defenseBonus: sameMonsterBonus.defenseBonus
      });
    } else {
      setPartyCombatBonuses(null);
    }
    
    // Cleanup when component unmounts or bonuses reset
    return () => {
      setPartyCombatBonuses(null);
    };
  }, [sameMonsterBonus.dpsBonus, sameMonsterBonus.defenseBonus, setPartyCombatBonuses]);

  // Poll for party events every 30 seconds
  const partyEventsStoppedRef = useRef(false);
  useEffect(() => {
    const partyId = currentParty?.id;
    if (!partyId || typeof partyId !== 'string' || !activeCombat) {
      partyEventsStoppedRef.current = false;
      return;
    }
    partyEventsStoppedRef.current = false;
    
    const pollPartyEvents = async () => {
      if (partyEventsStoppedRef.current) return;
      try {
        const res = await apiRequest("GET", `/api/parties/${partyId}/events?since=${Date.now() - 5000}`);
        const data = await res.json();
        
        if (data.skillEvents && Array.isArray(data.skillEvents)) {
          setPartySkillEvents(prev => {
            const existingIds = new Set(prev.map(e => e.id));
            const newEvents = data.skillEvents.filter((e: any) => !existingIds.has(e.id));
            return [...prev.slice(-20), ...newEvents];
          });
        }
        
        if (data.lootNotifications && Array.isArray(data.lootNotifications)) {
          for (const loot of data.lootNotifications) {
            toast({
              title: t('loot'),
              description: t('partyLootNotification').replace('{playerName}', loot.fromPlayerName).replace('{itemName}', loot.itemName),
            });
            
            if (loot.itemId) {
              setLootDrops(prev => {
                const existing = prev.find(d => d.itemId === loot.itemId);
                if (existing) {
                  return prev.map(d => d.itemId === loot.itemId ? { ...d, quantity: d.quantity + 1 } : d);
                }
                return [{ itemId: loot.itemId, quantity: 1 }, ...prev].slice(0, 50);
              });
            }
          }
          setPartyLootNotifications(prev => {
            const existingIds = new Set(prev.map(e => e.id));
            const newLoot = data.lootNotifications.filter((e: any) => !existingIds.has(e.id));
            return [...prev.slice(-10), ...newLoot];
          });
        }
        
        if (data.newPartyLoot && Array.isArray(data.newPartyLoot)) {
          for (const loot of data.newPartyLoot) {
            addLootRef.current?.(loot.itemId, loot.quantity);
            setLootDrops(prev => {
              const existing = prev.find(d => d.itemId === loot.itemId);
              if (existing) {
                return prev.map(d => d.itemId === loot.itemId ? { ...d, quantity: d.quantity + loot.quantity } : d);
              }
              return [{ itemId: loot.itemId, quantity: loot.quantity }, ...prev].slice(0, 50);
            });
            addPartyLootFloat(loot.itemId, loot.quantity);
            addLogEntryRef.current?.(`${formatItemIdAsName(loot.itemId)} x${loot.quantity}`, 'party_loot');
          }
        }
      } catch (error: any) {
        if (error?.message?.includes('403') || error?.message?.includes('400') || error?.message?.includes('Not a member') || error?.message?.includes('Invalid party')) {
          console.warn('[PartyEvents] Error received — stopping poll, refreshing party state');
          partyEventsStoppedRef.current = true;
          queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
          return;
        }
        console.error('Failed to poll party events:', error);
      }
    };
    
    const eventInterval = setInterval(pollPartyEvents, 30000);
    return () => clearInterval(eventInterval);
  }, [currentParty?.id, activeCombat, toast]);

  // Stable ref for party skill timer - defined outside useEffect for stability
  const partySkillTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // NEW: Interval-based party skill system - rolls every 1-3 seconds
  // This system doesn't rely on skill syncing - just checks if party members are in combat
  useEffect(() => {
    // Clear any existing timer when dependencies change
    if (partySkillTimerRef.current) {
      clearTimeout(partySkillTimerRef.current);
      partySkillTimerRef.current = null;
    }
    
    if (!currentParty || !activeCombat || !player?.id) return;
    
    const rollPartySkills = () => {
      const myMonsterId = activeCombat.monsterId;
      const myRegion = currentRegion;
      
      // Check each party member who is in combat and in the same region
      partyMembersStatus.forEach(member => {
        if (member.playerId === player.id) return; // Skip self
        if (!member.isInCombat || !member.cachedWeaponType) return; // Only process members in combat
        if (member.currentRegion !== myRegion) return; // Only share skills within same region
        
        const isSameMonster = member.currentMonsterId === myMonsterId && member.currentRegion === myRegion;
        const triggeredSkill = rollPartySkill(member.cachedWeaponType, isSameMonster);
        
        if (triggeredSkill) {
          if (triggeredSkill.type === 'heal') {
            const memberPower = member.memberMaxHit || 10;
            const healAmount = Math.max(1, Math.floor(memberPower * (triggeredSkill.healPercent || 0.1) * 3));
            healPlayer(healAmount);
            addLogEntryRef.current?.(`${member.playerName}: ${triggeredSkill.name}! +${healAmount} HP`, 'party_heal');
            addMonsterFloatingDamage(healAmount, `+${healAmount} HP`, member.playerName || 'Party Member');
          } else if (triggeredSkill.type === 'buff') {
            addLogEntryRef.current?.(`${member.playerName}: ${triggeredSkill.name}!`, 'loot');
            addMonsterFloatingDamage(0, triggeredSkill.name, member.playerName || 'Party Member');
          } else {
            // Damage-dealing skill (damage, critical, stun, poison, debuff)
            const mMinHit = member.memberMinHit || 5;
            const mMaxHit = member.memberMaxHit || 10;
            const baseDamage = mMinHit + Math.floor(Math.random() * (mMaxHit - mMinHit + 1));
            const damage = Math.floor(baseDamage * (triggeredSkill.damageMultiplier || 1.0));
            if (damage > 0) {
              dealDamageToMonster(damage);
              addMonsterFloatingDamage(damage, triggeredSkill.name, member.playerName || 'Party Member');
              addLogEntryRef.current?.(`${member.playerName}: ${triggeredSkill.name}! -${damage}`, 'party_attack');
            }
          }
        }
      });
    };
    
    // Schedule next roll with random 1-3 second delay
    const scheduleNextRoll = () => {
      const delay = 1000 + Math.random() * 2000;
      partySkillTimerRef.current = setTimeout(() => {
        rollPartySkills();
        scheduleNextRoll();
      }, delay);
    };
    
    scheduleNextRoll();
    
    return () => {
      if (partySkillTimerRef.current) {
        clearTimeout(partySkillTimerRef.current);
        partySkillTimerRef.current = null;
      }
    };
  }, [currentParty?.id, activeCombat?.monsterId, currentRegion, partyMembersStatus, player?.id, dealDamageToMonster, addMonsterFloatingDamage, maxHitpoints, healPlayer]);

  // Initialize party member combat states for UI display
  useEffect(() => {
    if (!currentParty || (currentParty.members || []).length === 0) {
      setPartyMemberCombatStates([]);
      return;
    }
    
    setPartyMemberCombatStates(
      (currentParty.members || []).map(m => ({
        playerId: m.playerId,
        lastAction: null,
        lastActionTime: 0,
        lastDamage: 0,
        lastHeal: 0,
        currentHp: 100,
        maxHp: 100,
      }))
    );
  }, [currentParty?.id, currentParty?.members?.length]);

  useEffect(() => {
    if (partyFloatingTexts.length === 0) return;
    
    const cleanup = setTimeout(() => {
      const now = Date.now();
      setPartyFloatingTexts(prev => prev.filter(ft => now - ft.timestamp < 1000));
    }, 1000);
    
    return () => clearTimeout(cleanup);
  }, [partyFloatingTexts]);

  // Track previous party combat state for wipe detection
  const prevIsInPartyCombatRef = useRef(false);
  useEffect(() => {
    if (prevIsInPartyCombatRef.current && !isInPartyCombat && currentParty) {
      // Combat was active but now stopped - check if all members were dead (wipe)
      const allDead = partyMemberCombatStates.every(m => m.currentHp <= 0);
      if (allDead && partyMemberCombatStates.length > 0) {
        toast({
          title: "Party Wipe!",
          description: "All party members have fallen. Combat has ended.",
          variant: "destructive"
        });
      }
    }
    prevIsInPartyCombatRef.current = isInPartyCombat;
    
    // Clear processed logs when combat ends
    if (!isInPartyCombat) {
      processedLogIdsRef.current.clear();
    }
  }, [isInPartyCombat, currentParty, partyMemberCombatStates, toast]);

  
  const kickMemberMutation = useMutation({
    mutationFn: async ({ partyId, playerId }: { partyId: string; playerId: string }) => {
      const res = await apiRequest("POST", `/api/parties/${partyId}/kick/${playerId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      toast({ title: "Üye partiden atıldı" });
    },
    onError: (error: any) => {
      toast({ 
        title: t('error'), 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const nudgeMemberMutation = useMutation({
    mutationFn: async ({ partyId, playerId }: { partyId: string; playerId: string }) => {
      const res = await apiRequest("POST", `/api/parties/${partyId}/nudge/${playerId}`);
      if (!res.ok) throw new Error("Failed to nudge member");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Bildirim gönderildi",
        description: "Oyuncuya dürtme bildirimi gönderildi."
      });
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "Bildirim gönderilemedi",
        variant: "destructive"
      });
    }
  });

  const handleMemberClick = useCallback((member: PartyMemberData) => {
    setSelectedPartyMember(member);
    setShowMemberDetailDialog(true);
  }, []);

  const handleKickMember = useCallback((playerId: string) => {
    if (currentParty) {
      kickMemberMutation.mutate({ partyId: currentParty.id, playerId });
    }
  }, [currentParty, kickMemberMutation]);

  const handleNudgeMember = useCallback((playerId: string) => {
    if (currentParty) {
      nudgeMemberMutation.mutate({ partyId: currentParty.id, playerId });
    }
  }, [currentParty, nudgeMemberMutation]);

  // Detect key drops and show toast notification
  useEffect(() => {
    const currentKeyMap: Record<string, number> = {};
    playerKeys.forEach(k => { currentKeyMap[k.keyType] = k.quantity; });
    
    // Check for new keys (quantity increased)
    for (const keyType of ['bronze', 'silver', 'gold', 'void']) {
      const prevCount = prevKeysRef.current[keyType] || 0;
      const newCount = currentKeyMap[keyType] || 0;
      
      if (newCount > prevCount && prevKeysRef.current[keyType] !== undefined) {
        const diff = newCount - prevCount;
        const keyColors = KEY_COLORS[keyType];
        const keyName = keyType.charAt(0).toUpperCase() + keyType.slice(1);
        
        toast({
          title: `🔑 Key Found!`,
          description: `You found ${diff} ${keyName} Key!`,
          duration: 4000,
          className: cn(keyColors?.bg, keyColors?.border, "border"),
        });
      }
    }
    
    prevKeysRef.current = currentKeyMap;
  }, [playerKeys, toast]);

  const [combatLog, setCombatLog] = useState<CombatLogEntry[]>([]);
  const [selectedMonsterId, setSelectedMonsterId] = useState<string | null>(null);
  const [pendingDangerousMonster, setPendingDangerousMonster] = useState<string | null>(null);
  const [autoEatWarningOpen, setAutoEatWarningOpen] = useState(false);
  const [autoEatWarningMonsterId, setAutoEatWarningMonsterId] = useState<string | null>(null);
  const pendingAutoEatActionRef = useRef<(() => void) | null>(null);
  // Use currentRegion directly from context - no local state needed
  const selectedRegion = currentRegion || "verdant";
  const [isRespawning, setIsRespawning] = useState(false);
  const respawnStartTimeRef = useRef(0);
  const respawnDurationRef = useRef(0);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showInlineStats, setShowInlineStats] = useState(false);
  const [showLootModal, setShowLootModal] = useState(false);
  const [previewMonsterId, setPreviewMonsterId] = useState<string | null>(null);
  // Monster action popup state (appears when clicking other monsters during combat)
  const [actionPopupMonsterId, setActionPopupMonsterId] = useState<string | null>(null);
  const [actionPopupView, setActionPopupView] = useState<'menu' | 'details' | 'loot' | 'duration_start' | 'duration_queue'>('menu');
  // Track if pending dangerous monster came from popup (should auto-start combat on confirm)
  const [dangerousFromPopup, setDangerousFromPopup] = useState(false);
  const playerProgressBarRef = useRef<AttackProgressHandle>(null);
  const monsterProgressBarRef = useRef<AttackProgressHandle>(null);
  const playerProgressBarDesktopRef = useRef<AttackProgressHandle>(null);
  const monsterProgressBarDesktopRef = useRef<AttackProgressHandle>(null);
  const [combatLogOpen, setCombatLogOpen] = useState(false);
  const [foodOpen, setFoodOpen] = useState(false);
  const [potionOpen, setPotionOpen] = useState(false);
  const [pendingPotionId, setPendingPotionId] = useState<string | null>(null);
  const [pendingFoodId, setPendingFoodId] = useState<string | null>(null);
  const [mobileEquipmentSlot, setMobileEquipmentSlot] = useState<EquipmentSlot | null>(null);
  const [consumablesSheetOpen, setConsumablesSheetOpen] = useState(false);
  const [consumableActionItem, setConsumableActionItem] = useState<{ itemId: string; type: "food" | "potion" } | null>(null);
  
  // Monster skill animation state
  const [monsterSkillActive, setMonsterSkillActive] = useState<{ name: string; type: string } | null>(null);
  const skillAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Player weapon skill animation state
  const [playerWeaponSkillActive, setPlayerWeaponSkillActive] = useState<{ name: string; type: string } | null>(null);
  const playerSkillAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [monsterDebuffEffect, setMonsterDebuffEffect] = useState<{ type: string; name: string } | null>(null);
  const monsterDebuffTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const skillJustFiredRef = useRef(false);
  // Loot drops - persist to localStorage, stack by itemId
  const LOOT_STORAGE_KEY = "combat_loot_drops";
  const [lootDrops, setLootDrops] = useState<Array<{ itemId: string; quantity: number }>>(() => {
    try {
      const saved = localStorage.getItem(LOOT_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  // Save loot drops to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(LOOT_STORAGE_KEY, JSON.stringify(lootDrops));
    } catch {}
  }, [lootDrops]);

  // Track which offline progress we've already added to loot drops (prevent duplicates)
  const processedOfflineProgressRef = useRef<number | null>(null);
  
  // Add offline loot to lootDrops when combatOfflineProgress is received
  useEffect(() => {
    if (!combatOfflineProgress?.lootGained) return;
    
    // Use offlineStartTime as unique identifier for this offline session
    const progressId = combatOfflineProgress.offlineStartTime || Date.now();
    
    // Skip if we've already processed this offline progress
    if (processedOfflineProgressRef.current === progressId) return;
    processedOfflineProgressRef.current = progressId;
    
    // Add each loot item from offline progress to lootDrops
    const lootItems = Object.entries(combatOfflineProgress.lootGained);
    if (lootItems.length > 0) {
      setLootDrops(prev => {
        let updated = [...prev];
        for (const [itemId, quantity] of lootItems) {
          const existing = updated.find(d => d.itemId === itemId);
          if (existing) {
            updated = updated.map(d => d.itemId === itemId ? { ...d, quantity: d.quantity + quantity } : d);
          } else {
            updated = [{ itemId, quantity }, ...updated];
          }
        }
        return updated.slice(0, 50); // Cap at 50 unique items
      });
    }
  }, [combatOfflineProgress]);

  
  // Helper to add loot with stacking (capped at 50 unique items)
  const addLootDrop = useCallback((itemId: string, quantity: number) => {
    setLootDrops(prev => {
      const existing = prev.find(d => d.itemId === itemId);
      if (existing) {
        return prev.map(d => d.itemId === itemId ? { ...d, quantity: d.quantity + quantity } : d);
      }
      // Add new item at start, cap at 50 unique items
      return [{ itemId, quantity }, ...prev].slice(0, 50);
    });
  }, []);
  const [formulaPanelTab, setFormulaPanelTab] = useState<"formulas" | "buffs" | "breakdown">("formulas");
  const [showFormulasInLog, setShowFormulasInLog] = useState(false);
  const pendingFormulaRef = useRef<{ type: 'player_attack' | 'monster_attack'; formula: string } | null>(null);
  const [formulaLog, setFormulaLog] = useState<FormulaLogEntry[]>([]);
  const logIdRef = useRef(0);
  const logEpochRef = useRef(0);
  const addLogEntryRef = useRef<((message: string, type: CombatLogEntry["type"]) => void) | null>(null);
  const addLootRef = useRef<((itemId: string, quantity: number) => void) | null>(null);
  const combatLoopRef = useRef<number | null>(null);
  const respawnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastPlayerAttackRef = useRef(0);
  const lastMonsterAttackRef = useRef(0);
  const monsterHpRef = useRef(0);
  const isProcessingLootRef = useRef(false);
  const combatLogScrollRef = useRef<HTMLDivElement>(null);
  const combatLogScrollMobileRef = useRef<HTMLDivElement>(null);
  const lastProgressUpdateRef = useRef(0);
  const playerProgressRef = useRef(0);
  const monsterProgressRef = useRef(0);
  const lastAutoEatRef = useRef(0);
  const lastHpRegenRef = useRef(0);
  const foodClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const foodClickCountRef = useRef(0);
  const lastClickedFoodRef = useRef<string | null>(null);

  const selectedMonster = selectedMonsterId ? getMonsterById(selectedMonsterId) : null;
  const currentMonster = activeCombat ? getMonsterById(activeCombat.monsterId) : null;
  const displayMonster = activeCombat ? currentMonster : selectedMonster;

  const attackLevel = skills.attack?.level || 1;
  const strengthLevel = skills.strength?.level || 1;
  const defenceLevel = skills.defence?.level || 1;
  const playerCombatLevel = Math.floor((attackLevel + strengthLevel + defenceLevel) / 3);

  const equipmentBonuses = getTotalEquipmentBonus(equipment, itemModifications);

  const getEffectiveItemStats = (itemId: string) => {
    return getItemStatsWithEnhancement(itemId, itemModifications) || null;
  };

  const weaponBaseItem = equipment.weapon ? getBaseItem(equipment.weapon) : null;
  const baseAttackSpeedMs = weaponBaseItem?.attackSpeedMs || PLAYER_ATTACK_SPEED;
  const totalAttackSpeedBonus = (equipmentBonuses.attackSpeedBonus || 0) + (equipmentBonuses.partyAttackSpeedBuff || 0);
  const attackSpeedReduction = totalAttackSpeedBonus > 0 ? (1 - totalAttackSpeedBonus / 100) : 1;
  const actualAttackSpeedMs = Math.max(500, Math.floor(baseAttackSpeedMs * attackSpeedReduction));

  // Get buff effects for combat
  const attackBuffPercent = getBuffEffect("attack_boost");
  const strengthBuffPercent = getBuffEffect("strength_boost");
  const defenceBuffPercent = getBuffEffect("defence_boost");
  const critChanceBuffPercent = getBuffEffect("crit_chance");
  const damageReductionBuffPercent = getBuffEffect("damage_reduction");
  const hpRegenBuffValue = getBuffEffect("hp_regen"); // HP per second
  
  // Combat style modifiers
  // Attack mode: +20% damage, -25% defense
  // Defence mode: -25% damage, +25% defense  
  // Balanced: +5% accuracy bonus
  // Use shared combat style modifiers for consistency with offline simulation
  const styleModifiers = COMBAT_STYLE_MODIFIERS[combatStyle];
  const combatStyleDamageMod = styleModifiers.damageMod;
  const combatStyleDefenceMod = styleModifiers.defenceMod;
  const combatStyleAccuracyMod = styleModifiers.accuracyMod;
  
  // Base max hit (without monster defense) - for display purposes
  const playerBaseMaxHit = calculateMaxHit(strengthLevel, equipmentBonuses.strengthBonus ?? 0) * COMBAT_HP_SCALE;
  // Final max/min hit against current monster (with defense reduction applied) - scaled
  const monsterDefence = currentMonster?.defenceLevel ?? selectedMonster?.defenceLevel ?? 0;
  
  // Apply strength buff, combat style, and guild combat power bonus to damage calculations
  const guildCombatPowerMod = 1 + ((myBonuses?.combatPower || 0) / 100);
  const baseMaxHit = calculateFinalMaxHit(strengthLevel, equipmentBonuses.strengthBonus ?? 0, monsterDefence) * COMBAT_HP_SCALE;
  const baseMinHit = calculateFinalMinHit(strengthLevel, equipmentBonuses.strengthBonus ?? 0, monsterDefence) * COMBAT_HP_SCALE;
  const playerMaxHit = Math.floor(baseMaxHit * (1 + strengthBuffPercent / 100) * combatStyleDamageMod * guildCombatPowerMod);
  const playerMinHit = Math.floor(baseMinHit * (1 + strengthBuffPercent / 100) * combatStyleDamageMod * guildCombatPowerMod);
  
  // Apply attack buff, combat style, and power ratio to accuracy
  const baseAccuracy = calculateAccuracyRating(attackLevel, equipmentBonuses.attackBonus ?? 0);
  
  // Power ratio accuracy bonus: stronger players hit more often against weaker enemies
  // Player power = attack + strength + equipment bonuses (total offensive capability)
  // Power ratio = player power / max(enemy defense, 1)
  // Modifier: ratio > 2 gives up to +20% bonus, ratio < 0.5 gives up to -20% penalty
  const playerPower = attackLevel + strengthLevel + (equipmentBonuses.attackBonus ?? 0) + (equipmentBonuses.strengthBonus ?? 0);
  const effectiveMonsterDefence = Math.max(monsterDefence, 1);
  const powerRatio = playerPower / effectiveMonsterDefence;
  // Clamp power ratio modifier between 0.8 (-20%) and 1.2 (+20%)
  // Linear scaling: ratio 0.5 = 0.8x, ratio 1.0 = 1.0x, ratio 2.0 = 1.2x
  const powerRatioMod = Math.max(0.8, Math.min(1.2, 0.8 + (powerRatio - 0.5) * 0.267));
  
  const playerAccuracy = Math.floor(baseAccuracy * (1 + attackBuffPercent / 100) * combatStyleAccuracyMod * powerRatioMod);
  
  // Apply defence buff and combat style to evasion
  const baseEvasion = calculateEvasionRating(defenceLevel, equipmentBonuses.defenceBonus ?? 0);
  const playerEvasion = Math.floor(baseEvasion * (1 + defenceBuffPercent / 100) * combatStyleDefenceMod);
  
  // Calculate player's total defense for damage reduction (includes combat style, buffs, and guild defense bonus)
  const guildDefensePowerMod = 1 + ((myBonuses?.defensePower || 0) / 100);
  const playerTotalDefense = Math.floor(
    (defenceLevel + (equipmentBonuses.defenceBonus ?? 0)) * 
    (1 + defenceBuffPercent / 100) * 
    combatStyleDefenceMod *
    guildDefensePowerMod
  );
  const playerDamageReduction = Math.min(0.75, calculateDamageReduction(playerTotalDefense)) + (damageReductionBuffPercent / 100);
  const playerDamageReductionCapped = Math.min(0.85, playerDamageReduction); // Cap at 85%

  // --- Combat XP rate calculations ---
  const combatXpRates = useMemo(() => {
    if (!displayMonster) return null;
    const monsterHp = (displayMonster.maxHitpoints ?? 0) * COMBAT_HP_SCALE;
    const defenceLevel = displayMonster.defenceLevel ?? 0;
    const monsterEvasion = calculateEvasionRating(defenceLevel);
    const hitChancePct = calculateHitChance(playerAccuracy, monsterEvasion); // 0-100
    const avgDamage = (playerMinHit + playerMaxHit) / 2;
    const effectiveDmgPerAttack = avgDamage * (hitChancePct / 100);
    const attacksPerSec = 1000 / actualAttackSpeedMs;
    const dps = effectiveDmgPerAttack * attacksPerSec;
    if (!Number.isFinite(dps) || dps <= 0 || !Number.isFinite(monsterHp) || monsterHp <= 0) return null;
    const timePerKillSec = monsterHp / dps;
    const killsPerHour = 3600 / timePerKillSec;
    const totalCombatXp = (displayMonster.xpReward?.attack || 0) + (displayMonster.xpReward?.strength || 0) + (displayMonster.xpReward?.defence || 0);
    let atkXp: number, strXp: number, defXp: number;
    if (combatStyle === "attack") {
      atkXp = totalCombatXp * 0.70;
      strXp = totalCombatXp * 0.20;
      defXp = totalCombatXp - atkXp - strXp;
    } else if (combatStyle === "defence") {
      defXp = totalCombatXp * 0.70;
      strXp = totalCombatXp * 0.20;
      atkXp = totalCombatXp - defXp - strXp;
    } else {
      atkXp = totalCombatXp * 0.33;
      defXp = totalCombatXp * 0.33;
      strXp = totalCombatXp - atkXp - defXp;
    }
    const hpXp = displayMonster.xpReward?.hitpoints || 0;
    return {
      attack: atkXp * killsPerHour,
      strength: strXp * killsPerHour,
      defence: defXp * killsPerHour,
      hitpoints: hpXp * killsPerHour,
      timePerKillSec,
      killsPerHour,
    };
  }, [displayMonster, playerAccuracy, playerMinHit, playerMaxHit, actualAttackSpeedMs, combatStyle]);

  function fmtTimeToLevel(xpPerHour: number, currentXp: number, level: number): string {
    if (!Number.isFinite(xpPerHour) || xpPerHour <= 0) return '—';
    if (level >= 99) return '—';
    const nextLvlXp = getXpForLevel(level + 1);
    const remaining = Math.max(0, nextLvlXp - currentXp);
    if (remaining <= 0) return '—';
    const sec = (remaining / xpPerHour) * 3600;
    if (!Number.isFinite(sec) || sec <= 0) return '—';
    if (sec < 60) return `<1m`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m > 0 ? `${h}h${m}m` : `${h}h`;
  }

  function fmtXpToNextLevel(currentXp: number, level: number): string {
    if (level >= 99) return '—';
    const nextLvlXp = getXpForLevel(level + 1);
    const remaining = Math.max(0, nextLvlXp - currentXp);
    if (remaining <= 0) return '—';
    return formatNumber(remaining);
  }

  const addLogEntry = useCallback((message: string, type: CombatLogEntry["type"]) => {
    const currentEpoch = logEpochRef.current;
    logIdRef.current += 1;
    const newId = logIdRef.current; // Capture ID before setState to avoid race conditions
    const timestamp = Date.now();
    setCombatLog(prev => {
      // Filter out entries from previous epochs (stale entries from before respawn)
      const filtered = prev.filter(e => e.epoch === currentEpoch);
      return [...filtered.slice(-49), { id: newId, message, type, timestamp, epoch: currentEpoch }];
    });
  }, []);

  // Keep refs updated for use in effects that run before this definition
  addLogEntryRef.current = addLogEntry;
  addLootRef.current = addLoot;

  const doStartCombatWithMonster = useCallback(async (monsterId: string, durationMs?: number) => {
    const monster = getMonsterById(monsterId);
    if (!monster) return;
    if (activeTravel) return;
    
    setSelectedMonsterId(monsterId);
    logEpochRef.current += 1;
    setFormulaLog([]);
    pendingFormulaRef.current = null;
    setLootDrops([]);
    isProcessingLootRef.current = false;
    const now = Date.now();
    lastPlayerAttackRef.current = now;
    lastMonsterAttackRef.current = now;
    lastHpRegenRef.current = now;
    const scaledMonsterHp = monster.maxHitpoints * COMBAT_HP_SCALE;
    monsterHpRef.current = scaledMonsterHp;
    const monsterStats = {
      maxHp: monster.maxHitpoints * COMBAT_HP_SCALE,
      attackLevel: monster.attackLevel,
      strengthLevel: monster.strengthLevel,
      defenceLevel: monster.defenceLevel,
      attackBonus: monster.attackBonus,
      strengthBonus: monster.strengthBonus,
      attackSpeed: monster.attackSpeed,
      loot: monster.loot,
      xpReward: monster.xpReward,
      skills: monster.skills,
    };
    if (durationMs && startCombatWithDuration) {
      await startCombatWithDuration(monsterId, scaledMonsterHp, durationMs, monsterStats);
    } else {
      await startCombat(monsterId, scaledMonsterHp, monsterStats);
    }
    addLogEntry(`${getLocalizedMonsterName(language, monsterId)} ${t('combatStarted')}`, "player_hit");
  }, [startCombat, startCombatWithDuration, addLogEntry, activeTravel, language, t]);

  const startCombatWithMonster = useCallback(async (monsterId: string) => {
    if (!autoEatEnabled || !selectedFood) {
      pendingAutoEatActionRef.current = async () => {
        if (isQueueV2) {
          const monster = getMonsterById(monsterId);
          if (monster) setDurationPickerMonster(monster);
        } else {
          await doStartCombatWithMonster(monsterId);
        }
      };
      setAutoEatWarningMonsterId(monsterId);
      setAutoEatWarningOpen(true);
      return;
    }
    if (isQueueV2) {
      const monster = getMonsterById(monsterId);
      if (monster) {
        setDurationPickerMonster(monster);
      }
      return;
    }
    await doStartCombatWithMonster(monsterId);
  }, [isQueueV2, doStartCombatWithMonster, autoEatEnabled, selectedFood]);

  const handleStartCombat = useCallback(async () => {
    if (!selectedMonster) return;
    if (activeTravel) return;

    if (!autoEatEnabled || !selectedFood) {
      pendingAutoEatActionRef.current = async () => {
        if (isQueueV2) {
          if (isMobile) {
            setFabDurationSheetOpen(true);
          } else {
            setDurationPickerMonster(selectedMonster);
          }
        } else {
          logEpochRef.current += 1;
          setLootDrops([]);
          isProcessingLootRef.current = false;
          const now = Date.now();
          lastPlayerAttackRef.current = now;
          lastMonsterAttackRef.current = now;
          lastHpRegenRef.current = now;
          const scaledMonsterHp = selectedMonster.maxHitpoints * COMBAT_HP_SCALE;
          monsterHpRef.current = scaledMonsterHp;
          await startCombat(selectedMonster.id, scaledMonsterHp, {
            maxHp: selectedMonster.maxHitpoints * COMBAT_HP_SCALE,
            attackLevel: selectedMonster.attackLevel,
            strengthLevel: selectedMonster.strengthLevel,
            defenceLevel: selectedMonster.defenceLevel,
            attackBonus: selectedMonster.attackBonus,
            strengthBonus: selectedMonster.strengthBonus,
            attackSpeed: selectedMonster.attackSpeed,
            loot: selectedMonster.loot,
            xpReward: selectedMonster.xpReward,
            skills: selectedMonster.skills,
          });
          addLogEntry(`${getLocalizedMonsterName(language, selectedMonster.id)} ${t('combatStarted')}`, "player_hit");
        }
      };
      setAutoEatWarningMonsterId(selectedMonster.id);
      setAutoEatWarningOpen(true);
      return;
    }

    if (isQueueV2) {
      if (isMobile) {
        setFabDurationSheetOpen(true);
      } else {
        setDurationPickerMonster(selectedMonster);
      }
      return;
    }
    
    logEpochRef.current += 1;
    setLootDrops([]);
    isProcessingLootRef.current = false;
    const now = Date.now();
    lastPlayerAttackRef.current = now;
    lastMonsterAttackRef.current = now;
    lastHpRegenRef.current = now;
    const scaledMonsterHp = selectedMonster.maxHitpoints * COMBAT_HP_SCALE;
    monsterHpRef.current = scaledMonsterHp;
    await startCombat(selectedMonster.id, scaledMonsterHp, {
      maxHp: selectedMonster.maxHitpoints * COMBAT_HP_SCALE,
      attackLevel: selectedMonster.attackLevel,
      strengthLevel: selectedMonster.strengthLevel,
      defenceLevel: selectedMonster.defenceLevel,
      attackBonus: selectedMonster.attackBonus,
      strengthBonus: selectedMonster.strengthBonus,
      attackSpeed: selectedMonster.attackSpeed,
      loot: selectedMonster.loot,
      xpReward: selectedMonster.xpReward,
      skills: selectedMonster.skills,
    });
    addLogEntry(`${getLocalizedMonsterName(language, selectedMonster.id)} ${t('combatStarted')}`, "player_hit");
  }, [selectedMonster, startCombat, addLogEntry, activeTravel, player, language, t, isQueueV2, isMobile, autoEatEnabled, selectedFood]);

  const handleLeavePartyAndStartCombat = useCallback(async () => {
    if (!currentParty || !selectedMonster || activeTravel) return;
    try {
      await leavePartyMutation.mutateAsync(currentParty.id);
      logEpochRef.current += 1;
      setLootDrops([]);
      isProcessingLootRef.current = false;
      const now = Date.now();
      lastPlayerAttackRef.current = now;
      lastMonsterAttackRef.current = now;
      lastHpRegenRef.current = now;
      const scaledMonsterHp = selectedMonster.maxHitpoints * COMBAT_HP_SCALE;
      monsterHpRef.current = scaledMonsterHp;
      await startCombat(selectedMonster.id, scaledMonsterHp, {
        maxHp: selectedMonster.maxHitpoints * COMBAT_HP_SCALE,
        attackLevel: selectedMonster.attackLevel,
        strengthLevel: selectedMonster.strengthLevel,
        defenceLevel: selectedMonster.defenceLevel,
        attackBonus: selectedMonster.attackBonus,
        strengthBonus: selectedMonster.strengthBonus,
        attackSpeed: selectedMonster.attackSpeed,
        loot: selectedMonster.loot,
        xpReward: selectedMonster.xpReward,
        skills: selectedMonster.skills,
      });
      addLogEntry(`${getLocalizedMonsterName(language, selectedMonster.id)} ${t('combatStarted')}`, "player_hit");
    } catch (error) {
      console.error('Failed to leave party:', error);
    }
    setShowLeavePartyForCombat(false);
  }, [currentParty, selectedMonster, leavePartyMutation, startCombat, addLogEntry, language, t, activeTravel]);

  const handleStopCombat = useCallback(async () => {
    // Client-side party combat - each member stops their own combat independently
    isProcessingLootRef.current = false;
    await stopCombat();
    setIsRespawning(false);
    playerProgressBarRef.current?.setProgress(0);
    playerProgressBarDesktopRef.current?.setProgress(0);
    monsterProgressBarRef.current?.setProgress(0);
    monsterProgressBarDesktopRef.current?.setProgress(0);
    setMonsterAnimation("idle");
    lastHpRegenRef.current = 0;
    if (respawnTimerRef.current) {
      clearTimeout(respawnTimerRef.current);
    }
    addLogEntry(t('fleeCombat') + "!", "death");
  }, [stopCombat, addLogEntry, t]);

  const processLoot = useCallback((monster: typeof MONSTERS[0]) => {
    (monster.loot || []).forEach(lootItem => {
      const roll = Math.floor(Math.random() * 100000);
      const threshold = Math.floor(lootItem.chance * 1000);
      if (roll < threshold) {
        const qty = Math.floor(Math.random() * (lootItem.maxQty - lootItem.minQty + 1)) + lootItem.minQty;
        addLoot(lootItem.itemId, qty);
        const item = getItemById(lootItem.itemId);
        addLogEntry(`${t('loot')}: ${qty}x ${item?.name || formatItemIdAsName(lootItem.itemId)}`, "loot");
        addLootDrop(lootItem.itemId, qty);
        
        // Track loot in combat session stats (summary shown when combat stops)
        trackCombatLoot(lootItem.itemId, qty);
      }
    });
  }, [addLoot, addLogEntry, addLootDrop, trackCombatLoot]);
  
  // Process individual loot item from context callback (loot is already added by context)
  const processLootItem = useCallback((itemId: string, quantity: number) => {
    addLootDrop(itemId, quantity);
    trackCombatLoot(itemId, quantity);
  }, [addLootDrop, trackCombatLoot]);

  const respawnMonster = useCallback(() => {
    if (!currentMonster) return;
    setIsRespawning(false);
    // Trigger spawn animation when monster respawns
    triggerMonsterAnimation("spawning", 300);
    const now = Date.now();
    lastPlayerAttackRef.current = now;
    lastMonsterAttackRef.current = now;
    lastHpRegenRef.current = now; // Reset HP regen timer on respawn
    const scaledMonsterHp = currentMonster.maxHitpoints * COMBAT_HP_SCALE;
    monsterHpRef.current = scaledMonsterHp;
    isProcessingLootRef.current = false;
    startCombat(currentMonster.id, scaledMonsterHp, {
      maxHp: currentMonster.maxHitpoints * COMBAT_HP_SCALE,
      attackLevel: currentMonster.attackLevel,
      strengthLevel: currentMonster.strengthLevel,
      defenceLevel: currentMonster.defenceLevel,
      attackBonus: currentMonster.attackBonus,
      strengthBonus: currentMonster.strengthBonus,
      attackSpeed: currentMonster.attackSpeed,
      loot: currentMonster.loot,
      xpReward: currentMonster.xpReward,
      skills: currentMonster.skills,
    });
    // Increment epoch so old log entries get filtered out
    logEpochRef.current += 1;
    addLogEntry(`Yeni bir ${currentMonster.name} belirdi!`, "player_hit");
  }, [currentMonster, startCombat, addLogEntry]);

  // Register combat event callbacks for UI updates from GameContext combat tick
  useEffect(() => {
    registerCombatCallbacks({
      onCombatLog: (message: string, type: string) => {
        const pending = pendingFormulaRef.current;
        let formula: string | undefined;
        if (pending && (
          (pending.type === 'player_attack' && (type === 'player_hit' || type === 'player_miss')) ||
          (pending.type === 'monster_attack' && (type === 'monster_hit' || type === 'monster_miss'))
        )) {
          formula = pending.formula;
          pendingFormulaRef.current = null;
        }
        const currentEpoch = logEpochRef.current;
        logIdRef.current += 1;
        const newId = logIdRef.current;
        const timestamp = Date.now();
        setCombatLog(prev => {
          const filtered = prev.filter(e => e.epoch === currentEpoch);
          return [...filtered.slice(-49), { id: newId, message, type: type as CombatLogEntry["type"], timestamp, epoch: currentEpoch, formula }];
        });
        if (type === "player_hit" || type === "monster_hit") {
          triggerMonsterAnimation("hit", 300);
        }
      },
      onPlayerAttackProgress: (progress: number) => {
        playerProgressRef.current = progress;
        playerProgressBarRef.current?.setProgress(progress);
        playerProgressBarDesktopRef.current?.setProgress(progress);
      },
      onMonsterAttackProgress: (progress: number) => {
        if (monsterProgressRef.current > 80 && progress < 20) {
          triggerMonsterAnimation("attacking", 400);
        }
        monsterProgressRef.current = progress;
        monsterProgressBarRef.current?.setProgress(progress);
        monsterProgressBarDesktopRef.current?.setProgress(progress);
      },
      onRespawnStart: (delay: number) => {
        respawnStartTimeRef.current = Date.now();
        respawnDurationRef.current = delay;
        setIsRespawning(true);
        playerProgressBarRef.current?.setProgress(0);
        playerProgressBarDesktopRef.current?.setProgress(0);
        monsterProgressBarRef.current?.setProgress(0);
        monsterProgressBarDesktopRef.current?.setProgress(0);
        playerProgressRef.current = 0;
        monsterProgressRef.current = 0;
      },
      onRespawnEnd: () => {
        setIsRespawning(false);
        // Trigger fast spawn animation when respawn timer ends
        triggerMonsterAnimation("spawning", 300);
        const now = Date.now();
        lastPlayerAttackRef.current = now;
        lastMonsterAttackRef.current = now;
        lastHpRegenRef.current = now;
        isProcessingLootRef.current = false;
        logEpochRef.current += 1;
      },
      onLootDrop: (itemId: string, quantity: number) => {
        processLootItem(itemId, quantity);
      },
      onDeath: () => {
        // Durability penalty is handled in GameContext
        // This callback is for UI notifications only
      },
      onVictory: (monsterName: string) => {
        isProcessingLootRef.current = true;
        // Trigger death animation
        triggerMonsterAnimation("dying", 600);
        // Refetch keys to detect any key drops from the kill
        refetchKeys();
      },
      onMonsterSkillUse: (skillName: string, skillType: string) => {
        // Clear any existing animation timeout
        if (skillAnimationTimeoutRef.current) {
          clearTimeout(skillAnimationTimeoutRef.current);
        }
        // Show skill animation for 1.5 seconds
        setMonsterSkillActive({ name: skillName, type: skillType });
        skillAnimationTimeoutRef.current = setTimeout(() => {
          setMonsterSkillActive(null);
        }, 1500);
      },
      onPlayerWeaponSkillUse: (skillName: string, skillType: string) => {
        if (playerSkillAnimationTimeoutRef.current) {
          clearTimeout(playerSkillAnimationTimeoutRef.current);
        }
        setPlayerWeaponSkillActive({ name: skillName, type: skillType });
        skillJustFiredRef.current = true;
        playerSkillAnimationTimeoutRef.current = setTimeout(() => {
          setPlayerWeaponSkillActive(null);
          skillJustFiredRef.current = false;
        }, 10000);

        if (monsterDebuffTimeoutRef.current) {
          clearTimeout(monsterDebuffTimeoutRef.current);
        }
        const debuffMap: Record<string, string> = {
          stun: 'stun',
          frost_burst: 'stun',
          thunder_strike: 'stun',
          poison: 'poison',
          armor_break: 'armor_break',
          slow_crit: 'stun',
          meteor: 'burn',
          lifesteal_burst: 'lifesteal',
        };
        const debuffType = debuffMap[skillType];
        if (debuffType) {
          setMonsterDebuffEffect({ type: debuffType, name: skillName });
          monsterDebuffTimeoutRef.current = setTimeout(() => {
            setMonsterDebuffEffect(null);
          }, 3000);
        }
      },
      onComboHit: (hitNumber: number, totalHits: number, damage: number) => {
        // Show floating damage for each combo hit
        addCombatFloatingDamage(damage, false);
      },
      onSkillDamage: (damage: number, skillName: string) => {
        // Show floating damage for skill damage (not marked as crit since it's already special)
        addCombatFloatingDamage(damage, false);
      },
      onPlayerDamage: (damage: number, isCritical: boolean) => {
        if (skillJustFiredRef.current) {
          skillJustFiredRef.current = false;
        } else {
          setPlayerWeaponSkillActive(null);
          if (playerSkillAnimationTimeoutRef.current) {
            clearTimeout(playerSkillAnimationTimeoutRef.current);
          }
        }
        addCombatFloatingDamage(damage, isCritical);
      },
      onPlayerMiss: () => {
        if (skillJustFiredRef.current) {
          skillJustFiredRef.current = false;
        } else {
          setPlayerWeaponSkillActive(null);
          if (playerSkillAnimationTimeoutRef.current) {
            clearTimeout(playerSkillAnimationTimeoutRef.current);
          }
        }
      },
      onPlayerTakeDamage: (damage: number, isCritical: boolean) => {
        addPlayerFloatingDamage(damage, isCritical);
      },
      onPlayerSkillEffect: (amount: number, skillName: string, effectType: 'damage' | 'heal' | 'buff' | 'debuff' | 'lifesteal') => {
        if (effectType === 'damage') {
          addCombatFloatingDamage(0, false, skillName, 'damage');
        } else if (effectType === 'heal' || effectType === 'lifesteal') {
          addPlayerSkillFloat(amount, skillName, true, false);
        } else if (effectType === 'buff') {
          addPlayerSkillFloat(amount, skillName, false, true);
        } else if (effectType === 'debuff') {
          addCombatFloatingDamage(amount, false, skillName, 'debuff');
        }
      },
      onFormulaLog: (type, formula, result, hit) => {
        pendingFormulaRef.current = { type, formula };
        setFormulaLog(prev => {
          const newEntry = { id: Date.now() + Math.random(), type, timestamp: Date.now(), formula, result, hit };
          return [...prev.slice(-49), newEntry];
        });
      }
    });
    
    return () => {
      unregisterCombatCallbacks();
    };
  }, [registerCombatCallbacks, unregisterCombatCallbacks, addLogEntry, processLootItem, triggerMonsterAnimation, addCombatFloatingDamage, addPlayerFloatingDamage, addPlayerSkillFloat]);
  
  // Sync monsterHpRef from context when combat is active
  useEffect(() => {
    if (activeCombat && monsterHpRef.current === 0) {
      monsterHpRef.current = activeCombat.monsterCurrentHp;
    }
  }, [activeCombat]);

  // Trigger spawn animation when combat first starts
  const prevActiveCombatRef = useRef<boolean>(false);
  useEffect(() => {
    if (activeCombat && !prevActiveCombatRef.current) {
      // Combat just started, trigger spawn animation
      triggerMonsterAnimation("spawning", 500);
    }
    prevActiveCombatRef.current = !!activeCombat;
  }, [activeCombat, triggerMonsterAnimation]);

  // Cleanup animation timeout on unmount
  useEffect(() => {
    return () => {
      if (monsterAnimationTimeoutRef.current) {
        clearTimeout(monsterAnimationTimeoutRef.current);
      }
    };
  }, []);



  useEffect(() => {
    if (combatLogScrollRef.current) {
      combatLogScrollRef.current.scrollTop = 0;
    }
    if (combatLogScrollMobileRef.current) {
      combatLogScrollMobileRef.current.scrollTop = 0;
    }
  }, [combatLog]);

  // Visibility change handler: sync combat state when returning to tab
  // This fixes the issue where combat button gets stuck after switching tabs
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // When returning to tab, reset UI state if combat is not active on server
        // The GameContext visibility handler will sync the actual activeCombat state
        // We just need to reset local UI state here
        if (!activeCombat) {
          setIsRespawning(false);
          playerProgressBarRef.current?.setProgress(0);
          playerProgressBarDesktopRef.current?.setProgress(0);
          monsterProgressBarRef.current?.setProgress(0);
          monsterProgressBarDesktopRef.current?.setProgress(0);
          if (respawnTimerRef.current) {
            clearTimeout(respawnTimerRef.current);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeCombat]);

  // Only get monsters once they're loaded from API
  const regionMonsters = monstersLoaded ? getMonstersByRegion(selectedRegion) : [];
  
  const handleMonsterClick = (monsterId: string) => {
    // If in combat and clicking a different monster, show action popup
    if (activeCombat && monsterId !== activeCombat.monsterId) {
      setActionPopupMonsterId(monsterId);
      setActionPopupView('menu');
      return;
    }
    
    const monster = getMonsterById(monsterId);
    if (monster && maxHitpoints) {
      const dangerLevel = calculateDangerLevel(
        monster.strengthLevel, 
        monster.strengthBonus || 0, 
        maxHitpoints, 
        playerDamageReductionCapped
      );
      if (dangerLevel === 'canOneShot') {
        setPendingDangerousMonster(monsterId);
        return;
      }
    }
    setSelectedMonsterId(monsterId);
  };
  
  const confirmDangerousMonster = async () => {
    if (pendingDangerousMonster) {
      const monsterId = pendingDangerousMonster;
      const shouldAutoStart = dangerousFromPopup;
      setPendingDangerousMonster(null);
      setDangerousFromPopup(false);
      
      if (shouldAutoStart) {
        if (isQueueV2) {
          setTimeout(() => startCombatWithMonster(monsterId), 150);
        } else {
          if (activeCombat) {
            await stopCombat();
          }
          await startCombatWithMonster(monsterId);
        }
      } else {
        // Normal flow: just select the monster
        setSelectedMonsterId(monsterId);
      }
    }
  };
  
  // Monster to show in loot modal (preview monster if set, otherwise current/selected)
  const lootModalMonster = previewMonsterId ? getMonsterById(previewMonsterId) : displayMonster;

  // Use getCombatRegions() for API-loaded regions instead of static COMBAT_REGIONS
  const combatRegions = getCombatRegions();
  const selectedRegionData = combatRegions.find(r => r.id === selectedRegion);
  const regionIndex = combatRegions.findIndex(r => r.id === selectedRegion);

  // Show loading while monsters data is being fetched
  if (!monstersLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground text-sm">{t('loading')}...</p>
        </div>
      </div>
    );
  }
  
  // Show warning banner if using static fallback data (API failed)
  const showApiWarning = monstersLoaded && !loadedFromApi;

  if (isMobile) {
    return (
      <>
        <div className="space-y-3 pb-24">
          {/* API Warning Banner - shown when using static fallback data */}
          {showApiWarning && (
            <div className="bg-amber-500/20 border border-amber-500/40 rounded-lg p-2 text-xs text-amber-300 flex items-center gap-2">
              <span>⚠️</span>
              <span>{'Using cached data. Some monsters may be outdated.'}</span>
            </div>
          )}
          
          {/* Mobile Header */}
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-red-500/20 border border-red-500/30">
              <Sword className="w-5 h-5 text-red-400" weight="duotone" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground">{t('battleArena')}</h1>
              <p className="text-muted-foreground text-[10px]">{t('fightMonsters')}</p>
            </div>
          </div>

          {/* Mobile Equipment Sheet */}
          <Sheet open={mobileEquipmentSlot !== null} onOpenChange={(open) => !open && setMobileEquipmentSlot(null)}>
            <SheetContent side="bottom" className="max-h-[70vh] rounded-t-xl">
              {mobileEquipmentSlot && (() => {
                const itemId = equipment[mobileEquipmentSlot];
                const baseItem = itemId ? getBaseItem(itemId) : null;
                const { rarity } = itemId ? parseItemWithRarity(itemId) : { rarity: null };
                const currentStats = itemId ? getEffectiveItemStats(itemId) : null;
                const itemImg = itemId ? getItemImage(itemId) : null;
                
                const compatibleItems = Object.keys(inventory)
                  .filter(invItemId => {
                    if (invItemId === itemId) return false;
                    const bi = getBaseItem(invItemId);
                    return bi && bi.type === "equipment" && bi.equipSlot === mobileEquipmentSlot && inventory[invItemId] > 0;
                  })
                  .sort((a, b) => {
                    const statsA = getItemStatsWithRarity(a);
                    const statsB = getItemStatsWithRarity(b);
                    const totalA = (statsA?.attackBonus || 0) + (statsA?.strengthBonus || 0) + (statsA?.defenceBonus || 0);
                    const totalB = (statsB?.attackBonus || 0) + (statsB?.strengthBonus || 0) + (statsB?.defenceBonus || 0);
                    return totalB - totalA;
                  });
                
                return (
                  <>
                    <SheetHeader className="pb-3 border-b border-border/50">
                      <SheetTitle className="flex items-center gap-2">
                        <ShieldStar className="w-5 h-5 text-violet-400" weight="bold" />
                        {t(mobileEquipmentSlot)}
                      </SheetTitle>
                    </SheetHeader>
                    
                    <div className="py-4 space-y-4">
                      {/* Current Equipment */}
                      {baseItem && currentStats && (
                        <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                          <div className="flex items-center gap-3 mb-3">
                            {itemImg && (
                              <RetryImage src={itemImg} alt={baseItem.name} className="w-12 h-12 object-contain rounded-lg bg-violet-500/20 p-1 pixelated" />
                            )}
                            <div className="flex-1">
                              <div className={cn("font-medium flex items-center gap-1", rarity ? getItemRarityColor(itemId!) : "")}>
                                {translateItemName(baseItem.id, language)}
                                {itemModifications[itemId!]?.enhancementLevel > 0 && (
                                  <span className="text-cyan-400 text-sm font-bold">+{itemModifications[itemId!].enhancementLevel}</span>
                                )}
                              </div>
                              <Badge variant="outline" className="text-[10px] mt-1">{t('equipped')}</Badge>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-red-400 border-red-500/50 hover:bg-red-500/20"
                              onClick={() => {
                                unequipItem(mobileEquipmentSlot);
                                setMobileEquipmentSlot(null);
                              }}
                            >
                              {t('unequip')}
                            </Button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            {currentStats.attackBonus !== undefined && currentStats.attackBonus > 0 && (
                              <div className="flex justify-between px-2 py-1 rounded bg-red-500/10">
                                <span className="text-muted-foreground">{t('attack')}:</span>
                                <span className="text-red-400 font-medium">+{currentStats.attackBonus}</span>
                              </div>
                            )}
                            {currentStats.strengthBonus !== undefined && currentStats.strengthBonus > 0 && (
                              <div className="flex justify-between px-2 py-1 rounded bg-orange-500/10">
                                <span className="text-muted-foreground">{t('strength')}:</span>
                                <span className="text-orange-400 font-medium">+{currentStats.strengthBonus}</span>
                              </div>
                            )}
                            {currentStats.defenceBonus !== undefined && currentStats.defenceBonus > 0 && (
                              <div className="flex justify-between px-2 py-1 rounded bg-blue-500/10">
                                <span className="text-muted-foreground">{t('defence')}:</span>
                                <span className="text-blue-400 font-medium">+{currentStats.defenceBonus}</span>
                              </div>
                            )}
                            {currentStats.accuracyBonus !== undefined && currentStats.accuracyBonus > 0 && (
                              <div className="flex justify-between px-2 py-1 rounded bg-cyan-500/10">
                                <span className="text-muted-foreground">{t('accuracy')}:</span>
                                <span className="text-cyan-400 font-medium">+{currentStats.accuracyBonus}</span>
                              </div>
                            )}
                            {currentStats.hitpointsBonus !== undefined && currentStats.hitpointsBonus > 0 && (
                              <div className="flex justify-between px-2 py-1 rounded bg-green-500/10">
                                <span className="text-muted-foreground">HP:</span>
                                <span className="text-green-400 font-medium">+{currentStats.hitpointsBonus}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Empty Slot Message */}
                      {!baseItem && compatibleItems.length === 0 && (
                        <div className="text-center py-6 text-muted-foreground text-sm">
                          {t('noSuitableItem')}
                        </div>
                      )}
                      
                      {/* Available Items */}
                      {compatibleItems.length > 0 && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-2">{t('inventoryItems')}</div>
                          <ScrollArea className="max-h-[200px]">
                            <div className="space-y-2">
                              {compatibleItems.map(invItemId => {
                                const invItem = getBaseItem(invItemId);
                                const invStats = getEffectiveItemStats(invItemId);
                                const invImg = getItemImage(invItemId);
                                const { rarity: invRarity } = parseItemWithRarity(invItemId);
                                
                                return (
                                  <button
                                    key={invItemId}
                                    onClick={() => {
                                      equipItem(invItemId);
                                      setMobileEquipmentSlot(null);
                                    }}
                                    className="w-full flex items-center gap-3 p-2 rounded-lg border border-border/50 bg-card hover:bg-muted/50 transition-all text-left"
                                    data-testid={`mobile-equip-${invItemId}`}
                                  >
                                    {invImg && (
                                      <RetryImage src={invImg} alt={invItem?.name} className="w-10 h-10 object-contain rounded bg-muted/30 p-1" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className={cn("text-sm font-medium truncate flex items-center gap-1", invRarity ? getItemRarityColor(invItemId) : "")}>
                                        {translateItemName(invItem?.id || '', language)}
                                        {itemModifications[invItemId]?.enhancementLevel > 0 && (
                                          <span className="text-cyan-400 text-[10px] font-bold flex-shrink-0">+{itemModifications[invItemId].enhancementLevel}</span>
                                        )}
                                      </div>
                                      <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                                        {invStats?.attackBonus ? <span className="text-red-400">+{invStats.attackBonus} Atk</span> : null}
                                        {invStats?.strengthBonus ? <span className="text-orange-400">+{invStats.strengthBonus} Str</span> : null}
                                        {invStats?.defenceBonus ? <span className="text-blue-400">+{invStats.defenceBonus} Def</span> : null}
                                      </div>
                                    </div>
                                    <Badge className="bg-primary/20 text-primary border-primary/50 text-[10px]">{t('equip')}</Badge>
                                  </button>
                                );
                              })}
                            </div>
                          </ScrollArea>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </SheetContent>
          </Sheet>

          {/* Mobile Region Selector */}
          <div 
            className={cn("rounded-lg p-3", "bg-gradient-to-br", REGION_COLORS[selectedRegion]?.gradient)}
          >
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <div className="flex items-center justify-center gap-1.5">
                  <span className={cn("text-lg", REGION_COLORS[selectedRegion]?.text)}>
                    {REGION_ICONS[selectedRegion]}
                  </span>
                  <h2 className="text-base font-bold text-white">{selectedRegionData ? getLocalizedRegionName(language, selectedRegionData.id) : ""}</h2>
                </div>
                <Badge variant="outline" className="bg-black/30 border-white/30 text-white/90 text-[10px] py-0 mt-1">
                  Lv.{selectedRegionData?.levelRange.min}-{selectedRegionData?.levelRange.max}
                </Badge>
              </div>
            </div>
          </div>

          {/* Mobile Monster Grid */}
          <div className="grid grid-cols-3 gap-2">
            {regionMonsters.map(monster => {
              const colors = REGION_COLORS[monster.region];
              const membersOnMonster = partyMembersStatus
                .filter(m => m.currentMonsterId === monster.id && m.currentRegion === selectedRegion && Boolean(m.isInCombat) && m.playerId !== player?.id)
                .map(m => ({ playerId: m.playerId, playerName: m.playerName || 'Unknown' }));
              const isPopupOpen = actionPopupMonsterId === monster.id;
              const scaledHp = monster.maxHitpoints * COMBAT_HP_SCALE;
              const dangerLevel = maxHitpoints ? calculateDangerLevel(monster.strengthLevel, monster.strengthBonus || 0, maxHitpoints, playerDamageReductionCapped) : 'safe';
              const monsterName = getLocalizedMonsterName(language, monster.id);
              const monsterCombatLvl = monster.attackLevel + monster.strengthLevel + monster.defenceLevel;
              
              return (
                <Popover 
                  key={monster.id} 
                  open={isPopupOpen} 
                  onOpenChange={(open) => { 
                    if (!open) { 
                      setActionPopupMonsterId(null); 
                      setActionPopupView('menu'); 
                    } 
                  }}
                >
                  <PopoverTrigger asChild>
                    <div>
                      <MonsterCard
                        monster={monster}
                        playerCombatLevel={playerCombatLevel}
                        playerMaxHp={maxHitpoints}
                        playerDamageReduction={playerDamageReductionCapped}
                        hpScale={COMBAT_HP_SCALE}
                        isSelected={selectedMonsterId === monster.id}
                        isInCombat={activeCombat?.monsterId === monster.id}
                        colors={colors}
                        variant="compact"
                        onClick={() => handleMonsterClick(monster.id)}
                        testId={`monster-card-mobile-${monster.id}`}
                        partyMembersOnMonster={membersOnMonster}
                      />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent 
                    className="w-64 p-0 rounded-xl overflow-hidden" 
                    side="bottom" 
                    align="center"
                    data-testid="monster-action-popup"
                  >
                    {/* Header */}
                    <div className="flex items-center gap-2 p-2 bg-gradient-to-r from-muted/50 to-transparent border-b border-border/50">
                      <RetryImage 
                        src={getMonsterImage(monster.id)} 
                        alt={monsterName}
                        className="w-10 h-10 rounded-lg object-cover bg-black/30"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs truncate">{monsterName}</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span>Lv.{monsterCombatLvl}</span>
                          {dangerLevel === 'canOneShot' && (
                            <Badge className="text-[8px] py-0 px-1 bg-red-500/30 text-red-300 animate-pulse">!</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Menu View */}
                    {actionPopupView === 'menu' && (
                      <div className="p-2 space-y-1">
                        <button
                          onClick={() => setActionPopupView('details')}
                          className="w-full flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                          data-testid="monster-action-details"
                        >
                          <Eye className="w-4 h-4 text-blue-400" weight="duotone" />
                          <span className="font-medium text-xs">{t('monsterActionDetails')}</span>
                        </button>
                        <button
                          onClick={() => setActionPopupView('loot')}
                          className="w-full flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                          data-testid="monster-action-loot"
                        >
                          <Package className="w-4 h-4 text-amber-400" weight="duotone" />
                          <span className="font-medium text-xs">{t('monsterActionLoot')}</span>
                        </button>
                        <button
                          onClick={async () => {
                            const monsterId = monster.id;
                            if (dangerLevel === 'canOneShot') {
                              setActionPopupMonsterId(null);
                              setActionPopupView('menu');
                              setDangerousFromPopup(true);
                              setPendingDangerousMonster(monsterId);
                              return;
                            }
                            if (!autoEatEnabled || !selectedFood) {
                              pendingAutoEatActionRef.current = async () => {
                                if (isQueueV2) {
                                  setActionPopupView('duration_queue');
                                } else {
                                  setActionPopupMonsterId(null);
                                  setActionPopupView('menu');
                                  if (activeCombat) await stopCombat();
                                  await startCombatWithMonster(monsterId);
                                }
                              };
                              setAutoEatWarningMonsterId(monsterId);
                              setAutoEatWarningOpen(true);
                              return;
                            }
                            if (isQueueV2) {
                              setActionPopupView('duration_queue');
                            } else {
                              setActionPopupMonsterId(null);
                              setActionPopupView('menu');
                              if (activeCombat) {
                                await stopCombat();
                              }
                              await startCombatWithMonster(monsterId);
                            }
                          }}
                          className="w-full flex items-center gap-2 p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 transition-colors text-left"
                          data-testid="monster-action-fight"
                        >
                          {isQueueV2 && (activeTask || activeCombat) ? (
                            <>
                              <ListPlus className="w-4 h-4 text-amber-400" weight="duotone" />
                              <span className="font-medium text-xs text-amber-300">{t('addToQueue')}</span>
                            </>
                          ) : (
                            <>
                              <Sword className="w-4 h-4 text-red-400" weight="duotone" />
                              <span className="font-medium text-xs text-red-300">{t('monsterActionFight')}</span>
                            </>
                          )}
                        </button>
                        {!isQueueV2 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionPopupMonsterId(null);
                            setQueueDialogMonster(monster);
                          }}
                          className="w-full flex items-center gap-2 p-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 transition-colors text-left"
                          data-testid="monster-action-queue"
                        >
                          <ListPlus className="w-4 h-4 text-amber-400" weight="duotone" />
                          <span className="font-medium text-xs text-amber-300">{t('addToQueue')}</span>
                        </button>
                        )}
                      </div>
                    )}

                    {/* Inline Duration Picker View */}
                    {(actionPopupView === 'duration_start' || actionPopupView === 'duration_queue') && (
                      <div className="p-2">
                        <InlineDurationPicker
                          onConfirm={async (durationMs) => {
                            setActionPopupMonsterId(null);
                            setActionPopupView('menu');
                            addToQueue({
                              type: 'combat',
                              monsterId: monster.id,
                              name: getLocalizedMonsterName(language, monster.id),
                              durationMs,
                            });
                          }}
                          onBack={() => setActionPopupView('menu')}
                          maxAvailableMs={maxQueueTimeMsTotal - getUsedQueueTimeMs(taskQueue, activeTask, activeCombat)}
                          activityName={monsterName}
                          mode={(activeTask || activeCombat) ? 'queue' : 'start'}
                        />
                      </div>
                    )}
                    
                    {/* Details View */}
                    {actionPopupView === 'details' && (
                      <div className="p-2">
                        <button
                          onClick={() => setActionPopupView('menu')}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mb-1.5"
                        >
                          <CaretLeft className="w-3 h-3" />
                          {t('back')}
                        </button>
                        <div className="space-y-1 text-[10px]">
                          <div className="flex justify-between p-1.5 bg-muted/20 rounded">
                            <span className="text-muted-foreground">HP</span>
                            <span className="font-medium text-red-400">{scaledHp.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between p-1.5 bg-muted/20 rounded">
                            <span className="text-muted-foreground">{t('attack')}</span>
                            <span className="font-medium">{monster.attackLevel}</span>
                          </div>
                          <div className="flex justify-between p-1.5 bg-muted/20 rounded">
                            <span className="text-muted-foreground">{t('strength')}</span>
                            <span className="font-medium">{monster.strengthLevel}</span>
                          </div>
                          <div className="flex justify-between p-1.5 bg-muted/20 rounded">
                            <span className="text-muted-foreground">{t('defence')}</span>
                            <span className="font-medium">{monster.defenceLevel}</span>
                          </div>
                          <div className="p-1.5 bg-muted/20 rounded">
                            <span className="text-muted-foreground text-[9px]">{t('xpReward')}</span>
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              <Badge variant="outline" className="text-[8px] text-orange-400 py-0 px-0.5">ATK +{monster.xpReward.attack}</Badge>
                              <Badge variant="outline" className="text-[8px] text-yellow-400 py-0 px-0.5">STR +{monster.xpReward.strength}</Badge>
                              <Badge variant="outline" className="text-[8px] text-blue-400 py-0 px-0.5">DEF +{monster.xpReward.defence}</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Loot View */}
                    {actionPopupView === 'loot' && (
                      <div className="p-2">
                        <button
                          onClick={() => setActionPopupView('menu')}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mb-1.5"
                        >
                          <CaretLeft className="w-3 h-3" />
                          {t('back')}
                        </button>
                        <ScrollArea className="max-h-36">
                          <div className="space-y-1 pr-1">
                            {(monster.loot || []).map(loot => {
                              const item = getItemById(loot.itemId);
                              const itemImg = getItemImage(loot.itemId);
                              const itemName = translateItemName(loot.itemId, language);
                              const itemRarity = item?.rarity;
                              const rarityColor = itemRarity ? RARITY_COLORS[itemRarity] : null;
                              const isRareDrop = loot.chance < 1;
                              const isUncommonDrop = loot.chance < 5 && loot.chance >= 1;
                              return (
                                <div 
                                  key={loot.itemId}
                                  className={cn(
                                    "p-1.5 rounded border text-[10px]",
                                    isRareDrop && "bg-purple-500/10 border-purple-500/30",
                                    isUncommonDrop && !isRareDrop && "bg-blue-500/10 border-blue-500/30",
                                    !isRareDrop && !isUncommonDrop && "bg-muted/20 border-border/30"
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center gap-1 min-w-0">
                                      {itemImg ? (
                                        <RetryImage src={itemImg} alt={itemName} className="w-4 h-4 object-contain pixelated flex-shrink-0" />
                                      ) : (
                                        <Package className="w-3 h-3 text-amber-400 flex-shrink-0" weight="fill" />
                                      )}
                                      <span style={rarityColor ? { color: rarityColor } : undefined} className="truncate">{itemName}</span>
                                    </div>
                                    <span className={cn(
                                      "shrink-0",
                                      isRareDrop ? "text-purple-400" : isUncommonDrop ? "text-blue-400" : "text-muted-foreground"
                                    )}>
                                      {loot.chance >= 1 ? `${loot.chance}%` : `1/${Math.round(100/loot.chance)}`}
                                    </span>
                                  </div>
                                  {(loot.minQty !== 1 || loot.maxQty !== 1) && (
                                    <div className="text-[9px] text-muted-foreground mt-0.5">
                                      x{loot.minQty}-{loot.maxQty}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>

          {/* Mobile Combat Style & Skills Panel */}
          <div className="rounded-lg bg-card/80 border border-border/50 overflow-hidden">
            <div className="flex items-stretch gap-2 p-2">
              {/* Combat Style Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCombatStyle("attack")}
                  disabled={activeCombat !== null}
                  className={cn(
                    "p-2 rounded border transition-all",
                    combatStyle === "attack" 
                      ? "bg-red-500/30 border-red-500/60" 
                      : "bg-muted/20 border-border/50 hover:bg-red-500/10",
                    activeCombat !== null && "opacity-50 cursor-not-allowed"
                  )}
                  data-testid="combat-style-attack-mobile"
                >
                  <Sword className={cn("w-5 h-5", combatStyle === "attack" ? "text-red-400" : "text-muted-foreground")} weight="duotone" />
                </button>
                <button
                  onClick={() => setCombatStyle("balanced")}
                  disabled={activeCombat !== null}
                  className={cn(
                    "p-2 rounded border transition-all",
                    combatStyle === "balanced" 
                      ? "bg-amber-500/30 border-amber-500/60" 
                      : "bg-muted/20 border-border/50 hover:bg-amber-500/10",
                    activeCombat !== null && "opacity-50 cursor-not-allowed"
                  )}
                  data-testid="combat-style-balanced-mobile"
                >
                  <ShieldStar className={cn("w-5 h-5", combatStyle === "balanced" ? "text-amber-400" : "text-muted-foreground")} weight="duotone" />
                </button>
                <button
                  onClick={() => setCombatStyle("defence")}
                  disabled={activeCombat !== null}
                  className={cn(
                    "p-2 rounded border transition-all",
                    combatStyle === "defence" 
                      ? "bg-blue-500/30 border-blue-500/60" 
                      : "bg-muted/20 border-border/50 hover:bg-blue-500/10",
                    activeCombat !== null && "opacity-50 cursor-not-allowed"
                  )}
                  data-testid="combat-style-defence-mobile"
                >
                  <Shield className={cn("w-5 h-5", combatStyle === "defence" ? "text-blue-400" : "text-muted-foreground")} weight="duotone" />
                </button>
              </div>
              <div className="w-px bg-border/50" />
              {/* Skill Levels */}
              <div className="flex items-center gap-2 flex-1 justify-center">
                <div className={cn("px-2 py-1 rounded text-center", combatStyle === "attack" && "bg-red-500/20")}>
                  <div className="text-xs font-bold text-red-400">{attackLevel}</div>
                  <div className="text-[7px] text-muted-foreground">{t('attack')}</div>
                  {combatXpRates && <div className="text-[7px] text-green-400 font-mono font-bold">{formatNumber(combatXpRates.attack)}/h</div>}
                </div>
                <div className={cn("px-2 py-1 rounded text-center", combatStyle === "balanced" && "bg-orange-500/20")}>
                  <div className="text-xs font-bold text-orange-400">{strengthLevel}</div>
                  <div className="text-[7px] text-muted-foreground">{t('strength')}</div>
                  {combatXpRates && <div className="text-[7px] text-green-400 font-mono font-bold">{formatNumber(combatXpRates.strength)}/h</div>}
                </div>
                <div className={cn("px-2 py-1 rounded text-center", combatStyle === "defence" && "bg-blue-500/20")}>
                  <div className="text-xs font-bold text-blue-400">{defenceLevel}</div>
                  <div className="text-[7px] text-muted-foreground">{t('defence')}</div>
                  {combatXpRates && <div className="text-[7px] text-green-400 font-mono font-bold">{formatNumber(combatXpRates.defence)}/h</div>}
                </div>
                <div className="px-2 py-1 rounded text-center bg-green-500/10">
                  <div className="text-xs font-bold text-green-400">{skills.hitpoints?.level || 10}</div>
                  <div className="text-[7px] text-muted-foreground">HP</div>
                  {combatXpRates && <div className="text-[7px] text-green-400 font-mono font-bold">{formatNumber(combatXpRates.hitpoints)}/h</div>}
                </div>
              </div>
            </div>
            {/* Mobile XP rate detail row */}
            {combatXpRates && (
              <div className="flex items-center justify-around px-2 pb-2 gap-1">
                {([
                  { label: t('attack'), xph: combatXpRates.attack, xp: skills.attack?.xp || 0, level: skills.attack?.level || 1, color: 'text-red-400' },
                  { label: t('strength'), xph: combatXpRates.strength, xp: skills.strength?.xp || 0, level: skills.strength?.level || 1, color: 'text-orange-400' },
                  { label: t('defence'), xph: combatXpRates.defence, xp: skills.defence?.xp || 0, level: skills.defence?.level || 1, color: 'text-blue-400' },
                  { label: 'HP', xph: combatXpRates.hitpoints, xp: skills.hitpoints?.xp || 0, level: skills.hitpoints?.level || 1, color: 'text-green-400' },
                ] as const).map(({ label, xph, xp, level, color }) => (
                  <div key={label} className="flex-1 bg-muted/20 rounded px-1 py-0.5 text-center">
                    <div className={cn("text-[7px] font-medium", color)}>{label}</div>
                    <div className="text-[8px] text-amber-400 font-mono">{fmtTimeToLevel(xph, xp, level)}</div>
                    <div className="text-[7px] text-muted-foreground">{fmtXpToNextLevel(xp, level)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mobile Monster Display Panel */}
          <Card className="bg-card/50 border-border/50 min-h-[320px]">
            <CardContent className="p-3">
              {displayMonster ? (
                <>
                  {/* Monster Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-base font-bold" data-testid="monster-name-mobile">
                        {getLocalizedMonsterName(language, displayMonster.id)}
                      </h2>
                      {activeCombat && (
                        <Badge className="bg-red-500/30 text-red-300 border-red-500/50 animate-pulse text-[10px] py-0">
                          {t('inCombat')}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setShowInlineStats(!showInlineStats)}
                        className={cn("h-7 w-7", showInlineStats && "bg-blue-500/20")}
                        data-testid="button-show-stats-mobile"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setShowLootModal(true)}
                        className="h-7 w-7"
                        data-testid="button-show-loot-mobile"
                      >
                        <Package className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Inline Stats Panel - Inside Card */}
                  {showInlineStats && (
                    <div className="mb-3 p-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
                      <div className="grid grid-cols-4 gap-1.5">
                        <div className="p-1.5 bg-muted/30 rounded text-center">
                          <div className="text-[9px] text-muted-foreground">{t('attack')}</div>
                          <div className="text-xs font-bold text-orange-400">{displayMonster.attackLevel}</div>
                        </div>
                        <div className="p-1.5 bg-muted/30 rounded text-center">
                          <div className="text-[9px] text-muted-foreground">{t('strength')}</div>
                          <div className="text-xs font-bold text-yellow-400">{displayMonster.strengthLevel}</div>
                        </div>
                        <div className="p-1.5 bg-muted/30 rounded text-center">
                          <div className="text-[9px] text-muted-foreground">{t('defence')}</div>
                          <div className="text-xs font-bold text-blue-400">{displayMonster.defenceLevel}</div>
                        </div>
                        <div className="p-1.5 bg-muted/30 rounded text-center">
                          <div className="text-[9px] text-muted-foreground">HP</div>
                          <div className="text-xs font-bold text-red-400">{displayMonster.maxHitpoints * COMBAT_HP_SCALE}</div>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-wrap mt-1.5">
                        <Badge variant="outline" className="text-[8px] text-orange-400 py-0 px-1">{t('attack')}: +{displayMonster.xpReward.attack}</Badge>
                        <Badge variant="outline" className="text-[8px] text-yellow-400 py-0 px-1">{t('strength')}: +{displayMonster.xpReward.strength}</Badge>
                        <Badge variant="outline" className="text-[8px] text-blue-400 py-0 px-1">{t('defence')}: +{displayMonster.xpReward.defence}</Badge>
                      </div>
                    </div>
                  )}

                  {/* Monster Image with Skill Icons */}
                  <div className="flex justify-center items-center gap-2 py-2">
                    {/* Skill Icons - Left Side */}
                    {displayMonster.skills && displayMonster.skills.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {displayMonster.skills.map((skill, idx) => (
                          <SkillDetailPopup key={skill.id || idx} skill={skill} variant="icon" isMonsterSkill />
                        ))}
                      </div>
                    )}
                    
                    {/* Monster Image Wrapper - relative for floating damage, no overflow-hidden */}
                    <div className="relative w-28 h-28">
                      {/* Monster Image Container */}
                      <div 
                        className={cn(
                          "absolute inset-0 rounded-xl flex items-center justify-center overflow-hidden"
                        )}
                        style={{ background: REGION_COLORS[displayMonster.region]?.radialGradient }}
                      >
                        {/* Show respawn skull only after death animation completes */}
                        {isRespawning && monsterAnimation !== "dying" ? (
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <Skull className="w-12 h-12 opacity-30" weight="duotone" />
                            <RespawnCountdownText startTime={respawnStartTimeRef.current} duration={respawnDurationRef.current} className="text-xs mt-1 opacity-70" />
                          </div>
                        ) : getMonsterImage(displayMonster.id) ? (
                          <RetryImage 
                            src={getMonsterImage(displayMonster.id)} 
                            alt={getLocalizedMonsterName(language, displayMonster.id)}
                            className={cn(
                              "w-full h-full object-contain p-1 pixelated",
                              monsterAnimation === "attacking" && "monster-attacking",
                              monsterAnimation === "hit" && "monster-hit",
                              monsterAnimation === "dying" && "monster-dying",
                              monsterAnimation === "spawning" && "monster-spawning"
                            )}
                            data-testid="monster-image-mobile"
                          />
                        ) : (
                          <Skull 
                            className={cn(
                              "w-16 h-16",
                              REGION_COLORS[displayMonster.region]?.text,
                              monsterAnimation === "attacking" && "monster-attacking",
                              monsterAnimation === "hit" && "monster-hit",
                              monsterAnimation === "dying" && "monster-dying",
                              monsterAnimation === "spawning" && "monster-spawning"
                            )} 
                            weight="duotone" 
                          />
                        )}
                      </div>

                      {monsterDebuffEffect && (
                        <div className={cn(
                          "absolute inset-0 rounded-xl pointer-events-none z-10 transition-all duration-300",
                          monsterDebuffEffect.type === 'stun' && "border-2 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.6),inset_0_0_15px_rgba(250,204,21,0.3)] animate-pulse",
                          monsterDebuffEffect.type === 'poison' && "border-2 border-green-400 shadow-[0_0_15px_rgba(74,222,128,0.6),inset_0_0_15px_rgba(74,222,128,0.3)] animate-pulse",
                          monsterDebuffEffect.type === 'burn' && "border-2 border-orange-400 shadow-[0_0_15px_rgba(251,146,60,0.6),inset_0_0_15px_rgba(251,146,60,0.3)] animate-pulse",
                          monsterDebuffEffect.type === 'armor_break' && "border-2 border-red-400 shadow-[0_0_15px_rgba(248,113,113,0.6),inset_0_0_15px_rgba(248,113,113,0.3)] animate-pulse",
                          monsterDebuffEffect.type === 'lifesteal' && "border-2 border-purple-400 shadow-[0_0_15px_rgba(192,132,252,0.6),inset_0_0_15px_rgba(192,132,252,0.3)] animate-pulse"
                        )}>
                          <div className={cn(
                            "absolute top-1 right-1 text-xs font-bold px-1 py-0.5 rounded-md",
                            monsterDebuffEffect.type === 'stun' && "bg-yellow-500/30 text-yellow-300",
                            monsterDebuffEffect.type === 'poison' && "bg-green-500/30 text-green-300",
                            monsterDebuffEffect.type === 'burn' && "bg-orange-500/30 text-orange-300",
                            monsterDebuffEffect.type === 'armor_break' && "bg-red-500/30 text-red-300",
                            monsterDebuffEffect.type === 'lifesteal' && "bg-purple-500/30 text-purple-300"
                          )}>
                            {monsterDebuffEffect.type === 'stun' && '⚡'}
                            {monsterDebuffEffect.type === 'poison' && '☠'}
                            {monsterDebuffEffect.type === 'burn' && '🔥'}
                            {monsterDebuffEffect.type === 'armor_break' && '💥'}
                            {monsterDebuffEffect.type === 'lifesteal' && '💜'}
                          </div>
                        </div>
                      )}
                      
                      <CombatFloatingLayer ref={combatFloatingMobileRef} t={t} sizeClass="mobile" />
                      <MonsterFloatingLayer ref={monsterFloatingMobileRef} sizeClass="mobile" />
                      <PartyLootFloatLayer ref={partyLootMobileRef} getItemImage={getItemImage} RetryImageComponent={RetryImage} PackageIcon={Package} getItemById={getItemById} translateItemName={translateItemName} language={language} sizeClass="mobile" />
                    </div>
                  </div>

                {/* Health Bars - Player and Monster Side by Side */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Player HP Bar - Color changes based on active debuffs */}
                  {(() => {
                    const activeDebuff = combatDebuffs[0];
                    const debuffBarStyles = {
                      stun: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", barBg: "bg-yellow-950/50", text: "text-yellow-400" },
                      poison: { bg: "bg-green-500/10", border: "border-green-500/30", barBg: "bg-green-950/50", text: "text-green-400" },
                      burn: { bg: "bg-orange-500/10", border: "border-orange-500/30", barBg: "bg-orange-950/50", text: "text-orange-400" },
                    };
                    const normalStyle = { bg: "bg-green-500/10", border: "border-green-500/30", barBg: "bg-green-950/50", text: "text-green-400" };
                    const style = activeDebuff ? (debuffBarStyles[activeDebuff.type as keyof typeof debuffBarStyles] || normalStyle) : normalStyle;
                    
                    return (
                      <div ref={playerHpContainerRef} className={cn(
                        "space-y-1 p-2 rounded-lg transition-colors duration-300 relative",
                        style.bg, 
                        style.border
                      )}>
                        <PlayerFloatingLayer ref={playerFloatingRef} hpContainerRef={playerHpContainerRef} />
                        <div className="flex justify-between items-center text-xs">
                          <span className={cn("flex items-center gap-1 font-medium", style.text)}>
                            {activeDebuff ? (
                              <>
                                {activeDebuff.type === "stun" && <Lightning className="w-3 h-3" weight="fill" />}
                                {activeDebuff.type === "poison" && <Skull className="w-3 h-3" weight="fill" />}
                                {activeDebuff.type === "burn" && <Fire className="w-3 h-3" weight="fill" />}
                              </>
                            ) : (
                              <Heart className="w-3 h-3" weight="fill" />
                            )}
                            {t('you')}
                          </span>
                          <span className={cn("font-medium text-[10px]", style.text)}>
                            {currentHitpoints}/{maxHitpoints}
                          </span>
                        </div>
                        <Progress 
                          value={(currentHitpoints / maxHitpoints) * 100} 
                          className={cn("h-2.5 transition-colors duration-300", style.barBg)}
                        />
                      </div>
                    );
                  })()}
                  
                  {/* Monster HP Bar - Yellow when using skill */}
                  {(() => {
                    const isUsingSkill = monsterSkillActive !== null;
                    const skillStyle = { bg: "bg-yellow-500/10", border: "border-yellow-500/30", barBg: "bg-yellow-950/50", text: "text-yellow-400" };
                    const normalStyle = { bg: "bg-red-500/10", border: "border-red-500/30", barBg: "bg-red-950/50", text: "text-red-400" };
                    const style = isUsingSkill ? skillStyle : normalStyle;
                    
                    // Monster HP state (individual combat mode)
                    const maxMonsterHp = displayMonster.maxHitpoints * COMBAT_HP_SCALE;
                    
                    return (
                      <div className={cn("space-y-1 p-2 rounded-lg transition-colors duration-300", style.bg, style.border)}>
                        {/* Header with kill counter for party combat */}
                        <div className="flex justify-between items-center text-xs">
                          <span className={cn("flex items-center gap-1 font-medium", style.text)}>
                            {isUsingSkill ? (
                              <Lightning className="w-3 h-3 animate-pulse" weight="fill" />
                            ) : (
                              <Heart className="w-3 h-3" weight="fill" />
                            )}
                            {isUsingSkill ? t('usingSkill') : t('enemy')}
                          </span>
                          <span className={cn("font-medium text-[10px]", style.text)}>
                            {activeCombat 
                              ? activeCombat.monsterCurrentHp 
                              : maxMonsterHp
                            }/{maxMonsterHp}
                          </span>
                        </div>
                        
                        <Progress 
                          value={activeCombat 
                            ? (activeCombat.monsterCurrentHp / maxMonsterHp) * 100 
                            : 100
                          } 
                          className={cn("h-2.5 transition-colors duration-300", style.barBg)}
                        />
                        
                        {isUsingSkill && (
                          <div className="text-[9px] text-yellow-400 font-bold text-center animate-pulse">
                            {monsterSkillActive.name}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Active Debuffs Display */}
                {combatDebuffs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {combatDebuffs.map((debuff, idx) => {
                      const debuffColors = {
                        stun: { bg: "bg-yellow-500/20", border: "border-yellow-500/50", text: "text-yellow-400" },
                        poison: { bg: "bg-green-500/20", border: "border-green-500/50", text: "text-green-400" },
                        burn: { bg: "bg-orange-500/20", border: "border-orange-500/50", text: "text-orange-400" },
                      };
                      const colors = debuffColors[debuff.type as keyof typeof debuffColors] || debuffColors.burn;
                      const debuffPrefix = debuff.type === "stun" ? `Sersem (${debuff.stunCyclesRemaining || 0})` :
                                           debuff.type === "poison" ? `Zehir${debuff.stackCount && debuff.stackCount > 1 ? ` x${debuff.stackCount}` : ""}` :
                                           debuff.type === "burn" ? t('burning') :
                                           debuff.name;
                      return (
                        <div 
                          key={debuff.id || idx}
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] flex items-center gap-1 border",
                            colors.bg, colors.border, colors.text
                          )}
                          data-testid={`debuff-${debuff.type}-${idx}`}
                        >
                          {debuff.type === "stun" && <Lightning className="w-3 h-3" weight="fill" />}
                          {debuff.type === "poison" && <Skull className="w-3 h-3" weight="fill" />}
                          {debuff.type === "burn" && <Fire className="w-3 h-3" weight="fill" />}
                          {debuff.type === "stun" ? (
                            <span className="font-medium">{debuffPrefix}</span>
                          ) : (
                            <DebuffCountdownText expiresAt={debuff.expiresAt} prefix={debuffPrefix} className="font-medium" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Party Same Monster Bonus Indicator */}
                {sameMonsterBonus.sameMonsterCount > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 p-2 bg-purple-500/20 rounded-lg border border-purple-500/30 mt-2 animate-pulse shadow-lg shadow-purple-500/20" data-testid="party-same-monster-bonus">
                          <Sparkle className="w-4 h-4 text-purple-400" weight="fill" />
                          <UsersThree className="w-4 h-4 text-purple-400" weight="fill" />
                          <span className="text-xs text-purple-300 font-medium">
                            {t('partySameMonsterPlayers').replace('{count}', String(sameMonsterBonus.sameMonsterCount))}
                          </span>
                          <Badge className="bg-green-500/30 text-green-300 text-xs border border-green-500/40 shadow-sm shadow-green-500/20">
                            {t('partyDpsBonus').replace('{percent}', String(Math.round(sameMonsterBonus.dpsBonus * 100)))}
                          </Badge>
                          <Badge className="bg-blue-500/30 text-blue-300 text-xs border border-blue-500/40 shadow-sm shadow-blue-500/20">
                            {t('partyDefenseBonus').replace('{percent}', String(Math.round(sameMonsterBonus.defenseBonus * 100)))}
                          </Badge>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <p className="font-medium text-purple-300">{t('partyCombatBonusActive')}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('partySameMonsterPlayers').replace('{count}', String(sameMonsterBonus.sameMonsterCount))} - {t('partyBonusesApplied')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Attack Timers - Solo Combat */}
                {activeCombat && !isRespawning && !isInPartyCombat && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="space-y-0.5">
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        {playerWeaponSkillActive ? (
                          <Lightning className="w-2.5 h-2.5 text-yellow-400 animate-pulse" weight="fill" />
                        ) : (
                          <Sword className="w-2.5 h-2.5 text-green-400" />
                        )}
                        {playerWeaponSkillActive ? (
                          <span className="text-yellow-400 font-semibold animate-pulse">{playerWeaponSkillActive.name}</span>
                        ) : (
                          "Sen"
                        )}
                      </div>
                      <AttackProgressBar 
                        ref={playerProgressBarRef}
                        className={cn(
                          "h-1.5",
                          playerWeaponSkillActive ? "bg-yellow-950/50 shadow-[0_0_8px_rgba(234,179,8,0.4)]" : "bg-green-950/50"
                        )}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Sword className="w-2.5 h-2.5 text-orange-400" />
                        {t('enemy')}
                      </div>
                      <AttackProgressBar 
                        ref={monsterProgressBarRef}
                        className="h-1.5 bg-orange-950/50"
                      />
                    </div>
                  </div>
                )}
                
                {/* Party Combat Attack Timers - Deprecated: party members now use individual combat */}
                {false && (() => {
                  return (
                    <div className="mt-2 space-y-2" data-testid="party-combat-attack-timers">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Sword className="w-2.5 h-2.5 text-violet-400" />
                            {t('partyCombatActive')}
                          </div>
                          <Progress 
                            value={partyPlayerAttackProgress} 
                            className="h-1.5 bg-violet-950/50"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Sword className="w-2.5 h-2.5 text-orange-400" />
                            {t('enemy')}
                          </div>
                          <Progress 
                            value={partyMonsterAttackProgress} 
                            className="h-1.5 bg-orange-950/50"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <div className="flex -space-x-1">
                          {partyMemberCombatStates.slice(0, 5).map((ms, idx) => (
                            <div 
                              key={ms.playerId || idx}
                              className={cn(
                                "w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold",
                                ms.currentHp > 0 
                                  ? "bg-green-500/30 border-green-500/50 text-green-400" 
                                  : "bg-red-500/30 border-red-500/50 text-red-400"
                              )}
                            >
                              {ms.currentHp > 0 ? '✓' : '✗'}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Respawn Timer */}
                {isRespawning && (
                  <div className="text-center py-1.5 mt-2 bg-muted/20 rounded-lg text-xs">
                    <Timer className="w-4 h-4 inline mr-1 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      <RespawnCountdownText startTime={respawnStartTimeRef.current} duration={respawnDurationRef.current} /> {t('respawnIn')}
                    </span>
                  </div>
                )}

                </>
              ) : (
                /* Placeholder when no monster selected */
                <div className="flex flex-col items-center justify-center h-full min-h-[280px]">
                  <div className="w-28 h-28 rounded-xl bg-muted/30 border border-border/50 flex items-center justify-center mb-4">
                    <Skull className="w-16 h-16 text-muted-foreground/50" weight="duotone" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">{t('selectMonster')}</p>
                  <p className="text-xs text-muted-foreground/60 text-center mt-1">{t('selectMonsterAbove')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mobile Combat Stats Summary - Expanded to match desktop */}
          {(() => {
            const monsterEvasion = displayMonster ? calculateEvasionRating(displayMonster.defenceLevel) : 0;
            const hitChanceVsEnemy = displayMonster ? calculateHitChance(playerAccuracy, monsterEvasion) : 0;
            const defenseMultiplier = displayMonster ? calculateDefenseMultiplier(displayMonster.defenceLevel) : 1;
            const enemyDamageReduction = ((1 - defenseMultiplier) * 100).toFixed(0);
            const avgDamage = ((playerMinHit + playerMaxHit) / 2).toFixed(1);
            const attacksPerSecond = (1000 / actualAttackSpeedMs).toFixed(2);
            const dps = (parseFloat(avgDamage) * parseFloat(attacksPerSecond)).toFixed(1);
            
            return (
              <div className="grid grid-cols-4 gap-1 p-2 rounded-lg bg-card/80 border border-border/50">
                <div className="p-1 rounded bg-green-500/10 border border-green-500/30 text-center">
                  <div className="text-[10px] font-bold text-green-400">{playerMinHit}-{playerMaxHit}</div>
                  <div className="text-[7px] text-muted-foreground">{t('damage')}</div>
                </div>
                <div className="p-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-center">
                  <div className="text-[10px] font-bold text-cyan-400">%{displayMonster ? hitChanceVsEnemy.toFixed(0) : playerAccuracy}</div>
                  <div className="text-[7px] text-muted-foreground">{t('hitRate')}</div>
                </div>
                <div className="p-1 rounded bg-blue-500/10 border border-blue-500/30 text-center">
                  <div className="text-[10px] font-bold text-blue-400">%{(playerDamageReductionCapped * 100).toFixed(0)}</div>
                  <div className="text-[7px] text-muted-foreground">{t('defence')}</div>
                </div>
                <div className="p-1 rounded bg-orange-500/10 border border-orange-500/30 text-center">
                  <div className="text-[10px] font-bold text-orange-400">{dps}</div>
                  <div className="text-[7px] text-muted-foreground">{t('dps')}</div>
                </div>
                <div className="p-1 rounded bg-yellow-500/10 border border-yellow-500/30 text-center">
                  <div className="text-[10px] font-bold text-yellow-400">{attacksPerSecond}/s</div>
                  <div className="text-[7px] text-muted-foreground">{t('attackSpeed')}</div>
                </div>
                <div className="p-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-center">
                  <div className="text-[10px] font-bold text-emerald-400">{avgDamage}</div>
                  <div className="text-[7px] text-muted-foreground">{t('avgDamage')}</div>
                </div>
                <div className="p-1 rounded bg-red-500/10 border border-red-500/30 text-center">
                  <div className="text-[10px] font-bold text-red-400">%{displayMonster ? enemyDamageReduction : '0'}</div>
                  <div className="text-[7px] text-muted-foreground">{t('enemyDefense')}</div>
                </div>
                <div className="p-1 rounded bg-purple-500/10 border border-purple-500/30 text-center">
                  <div className="text-[10px] font-bold text-purple-400">%{((equipmentBonuses.critChance || 0) + critChanceBuffPercent).toFixed(1)}</div>
                  <div className="text-[7px] text-muted-foreground">{t('critChance')}</div>
                </div>
                
                {/* Party Bonus Stats - Mobile */}
                {sameMonsterBonus.sameMonsterCount > 0 && (
                  <>
                    <div className="p-1 rounded bg-purple-500/20 border border-purple-500/40 text-center col-span-2">
                      <div className="text-[10px] font-bold text-purple-400 flex items-center justify-center gap-1">
                        <UsersThree className="w-3 h-3" weight="fill" />
                        +{sameMonsterBonus.sameMonsterCount}
                      </div>
                      <div className="text-[7px] text-muted-foreground">{t('party')}</div>
                    </div>
                    <div className="p-1 rounded bg-green-500/20 border border-green-500/40 text-center">
                      <div className="text-[10px] font-bold text-green-400">+{Math.round(sameMonsterBonus.dpsBonus * 100)}%</div>
                      <div className="text-[7px] text-muted-foreground">DPS</div>
                    </div>
                    <div className="p-1 rounded bg-blue-500/20 border border-blue-500/40 text-center">
                      <div className="text-[10px] font-bold text-blue-400">+{Math.round(sameMonsterBonus.defenseBonus * 100)}%</div>
                      <div className="text-[7px] text-muted-foreground">{t('defence')}</div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Mobile Equipment Panel */}
          <div className="rounded-lg bg-card/80 border border-border/50 p-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <ShieldStar className="w-4 h-4 text-violet-400" weight="bold" />
                <span className="text-xs font-medium text-foreground">{t('equipment')}</span>
              </div>
              <MasteryCompactWidget />
            </div>
            <div className="grid grid-cols-10 gap-0.5">
              {EQUIPMENT_SLOTS.map(slot => {
                const itemId = equipment[slot];
                const baseItem = itemId ? getBaseItem(itemId) : null;
                const { rarity } = itemId ? parseItemWithRarity(itemId) : { rarity: null };
                const Icon = getEquipmentIcon(slot);
                const itemImg = itemId ? getItemImage(itemId) : null;
                const durability = itemId ? getSlotDurability(slot) : 100;
                
                return (
                  <div key={slot} className="flex flex-col items-center">
                    <button
                      onClick={() => setMobileEquipmentSlot(slot)}
                      className={cn(
                        "w-full aspect-square rounded border flex items-center justify-center transition-all relative overflow-hidden",
                        baseItem 
                          ? (rarity ? getItemRarityBgColor(itemId!) : "border-violet-500/50 bg-violet-500/10")
                          : "border-border bg-card/50 border-dashed"
                      )}
                      data-testid={`mobile-equipment-slot-${slot}`}
                    >
                      {baseItem ? (
                        <>
                          {itemImg ? (
                            <RetryImage src={itemImg} alt={baseItem.name} loading="lazy" className="w-[90%] h-[90%] object-contain pixelated" />
                          ) : (
                            <Icon className={cn("w-[70%] h-[70%]", rarity ? getItemRarityColor(itemId!) : "text-violet-400")} weight="fill" />
                          )}
                          {durability < 100 && <DurabilityBarMini durability={durability} />}
                        </>
                      ) : (
                        <span className="text-[5px] text-muted-foreground uppercase leading-tight text-center">{t(`${slot}Short` as any)}</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile Loot Drops Panel - Compact Icons with Scroll Indicators */}
          {lootDrops.length > 0 && (
            <Card className="bg-card/50 border-border/50 border-amber-500/30">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-amber-400" weight="duotone" />
                  {t('droppedItems')}
                  {lootDrops.length > 5 && (
                    <span className="text-[9px] text-amber-400/70 ml-auto flex items-center gap-0.5">
                      <CaretLeft className="w-3 h-3" />
                      {t('swipe')}
                      <CaretRight className="w-3 h-3" />
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="py-0 px-2 pb-2">
                <div className="relative">
                  {lootDrops.length > 5 && (
                    <>
                      <div className="absolute left-0 top-0 bottom-1 w-4 bg-gradient-to-r from-card/80 to-transparent z-10 pointer-events-none" />
                      <div className="absolute right-0 top-0 bottom-1 w-4 bg-gradient-to-l from-card/80 to-transparent z-10 pointer-events-none" />
                    </>
                  )}
                  <div className="loot-scroll-container flex gap-1.5 overflow-x-auto pb-1 touch-pan-x">
                    {lootDrops.map((drop, index) => {
                      const item = getItemById(drop.itemId);
                      const itemImg = getItemImage(drop.itemId);
                      const parsed = parseItemWithRarity(drop.itemId);
                      const hasRarityBorder = parsed?.rarity;
                      const isGold = drop.itemId === "Gold Coins";
                      const rarityClasses = isGold
                        ? "bg-yellow-500/20 border-yellow-400/70"
                        : hasRarityBorder 
                          ? getItemRarityBgColor(drop.itemId)
                          : "bg-amber-500/10 border-amber-500/50";
                      
                      return (
                        <div
                          key={`mobile-${drop.itemId}-${index}`}
                          onClick={isGold ? undefined : () => openInspect({ name: drop.itemId, quantity: drop.quantity })}
                          className={cn(
                            "flex-shrink-0 w-11 h-11 rounded border-2 transition-all relative flex items-center justify-center",
                            rarityClasses,
                            isGold ? "" : "cursor-pointer hover:scale-105"
                          )}
                          data-testid={`loot-drop-mobile-${drop.itemId}`}
                          title={isGold ? `${drop.quantity} ${t('gold')}` : (item?.name || formatItemIdAsName(drop.itemId))}
                        >
                          {itemImg ? (
                            <RetryImage src={itemImg} alt={item?.name || formatItemIdAsName(drop.itemId)} className="w-7 h-7 object-contain pixelated" />
                          ) : (
                            <Package className="w-5 h-5 text-amber-400" weight="fill" />
                          )}
                          {drop.quantity > 1 && (
                            <span className={cn(
                              "absolute -bottom-1 -right-1 bg-black/80 text-[8px] font-bold px-1 rounded border",
                              isGold ? "text-yellow-300 border-yellow-500/50" : "text-amber-300 border-amber-500/50"
                            )}>
                              {drop.quantity}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Collapsible Combat Log */}
          <Collapsible open={combatLogOpen} onOpenChange={setCombatLogOpen}>
            <Card className="bg-card/50 border-border/50">
              <CollapsibleTrigger asChild>
                <CardHeader className="py-2 px-3 cursor-pointer hover:bg-muted/10" data-testid="trigger-combat-log-mobile">
                  <CardTitle className="text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Trophy className="w-4 h-4 text-yellow-400" weight="duotone" />
                      {t('combatLog')}
                      {combatLog.length > 0 && (
                        <Badge variant="secondary" className="text-[9px] py-0 px-1">
                          {combatLog.length}
                        </Badge>
                      )}
                    </span>
                    <CaretDown className={cn(
                      "w-4 h-4 transition-transform",
                      combatLogOpen && "rotate-180"
                    )} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="py-0 px-2 pb-2">
                  <div className="flex justify-end mb-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowFormulasInLog(prev => !prev); }}
                      className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded border transition-colors",
                        showFormulasInLog ? "bg-purple-500/20 border-purple-500/50 text-purple-300" : "bg-muted/20 border-border/50 text-muted-foreground"
                      )}
                      data-testid="toggle-formulas-mobile"
                    >
                      Advanced
                    </button>
                  </div>
                  {!showFormulasInLog ? (
                  <div ref={combatLogScrollMobileRef} className="h-32 overflow-y-auto">
                    <div className="space-y-0.5 pr-2 font-mono text-[10px]">
                      {combatLog.length === 0 ? (
                        <div className="text-muted-foreground text-center py-3 text-[10px]">
                          {t('combatLogEmpty')}
                        </div>
                      ) : (
                        combatLog.slice().reverse().map(entry => (
                          <div key={entry.id}>
                          <div 
                            className={cn(
                              "py-0.5 px-1 rounded",
                              entry.type === "player_hit" && "text-green-400",
                              entry.type === "player_miss" && "text-gray-400",
                              entry.type === "monster_hit" && "text-red-400",
                              entry.type === "monster_miss" && "text-gray-400",
                              entry.type === "loot" && "text-amber-400 bg-amber-500/10",
                              entry.type === "death" && "text-red-500 bg-red-500/10",
                              entry.type === "victory" && "text-green-500 bg-green-500/10",
                              entry.type === "party_attack" && "text-blue-400 bg-blue-500/10",
                              entry.type === "party_heal" && "text-emerald-400 bg-emerald-500/10",
                              entry.type === "party_damaged" && "text-orange-400 bg-orange-500/10",
                              entry.type === "party_loot" && "text-emerald-300 bg-emerald-500/10"
                            )}
                          >
                            {entry.message}
                          </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  ) : (
                  <div>
                      <div className="flex gap-1 mb-1.5">
                        {(["formulas", "buffs", "breakdown"] as const).map(tab => (
                          <button
                            key={tab}
                            onClick={() => setFormulaPanelTab(tab)}
                            className={cn(
                              "px-2 py-0.5 rounded text-[9px] font-medium transition-all",
                              formulaPanelTab === tab
                                ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300"
                                : "bg-muted/20 border border-border/30 text-muted-foreground hover:bg-muted/40"
                            )}
                          >
                            {tab === "formulas" ? (language === 'tr' ? "Formüller" : "Formulas") : tab === "buffs" ? (language === 'tr' ? "Bufflar" : "Buffs") : (language === 'tr' ? "Detaylı" : "Breakdown")}
                          </button>
                        ))}
                      </div>

                      {formulaPanelTab === "formulas" && (
                        <div className="h-32 overflow-y-auto">
                          <div className="space-y-1 pr-2 font-mono text-[9px]">
                            {formulaLog.length === 0 ? (
                              <div className="text-muted-foreground text-center py-3 text-[10px]">
                                {t('formulasAppearHere')}
                              </div>
                            ) : (
                              [...formulaLog].reverse().map(entry => (
                                <div
                                  key={entry.id}
                                  className={cn(
                                    "py-1 px-2 rounded border",
                                    entry.type === "player_attack" && entry.hit && "bg-green-500/10 border-green-500/30 text-green-300",
                                    entry.type === "player_attack" && !entry.hit && "bg-gray-500/10 border-gray-500/30 text-gray-400",
                                    entry.type === "monster_attack" && entry.hit && "bg-red-500/10 border-red-500/30 text-red-300",
                                    entry.type === "monster_attack" && !entry.hit && "bg-gray-500/10 border-gray-500/30 text-gray-400"
                                  )}
                                >
                                  <div className="flex items-center gap-1 mb-0.5">
                                    {entry.type === "player_attack" ? (
                                      <Sword className="w-3 h-3" weight="duotone" />
                                    ) : (
                                      <Skull className="w-3 h-3" weight="duotone" />
                                    )}
                                    <span className="font-bold">
                                      {entry.hit ? `= ${entry.result}` : "ISKALA"}
                                    </span>
                                  </div>
                                  <div className="text-[8px] opacity-80 break-all">
                                    {entry.formula}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      {formulaPanelTab === "buffs" && (
                        <div className="h-32 overflow-y-auto space-y-1.5 pr-1">
                          {activeBuffs.length > 0 && (
                            <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30">
                              <div className="text-[9px] font-medium text-purple-300 mb-1">{t('activeBuffs')}</div>
                              <div className="space-y-0.5">
                                {activeBuffs.map(buff => {
                                  const effectLabel = buff.effectType === "attack_boost" ? t('attack') :
                                                     buff.effectType === "strength_boost" ? t('strength') :
                                                     buff.effectType === "defence_boost" ? t('defence') :
                                                     buff.effectType === "crit_chance" ? t('critical') :
                                                     buff.effectType === "damage_reduction" ? t('protection') :
                                                     buff.effectType === "hp_regen" ? t('hpRegen') : "";
                                  return (
                                    <div key={buff.potionId} className="flex items-center gap-1.5 text-[9px]">
                                      <RetryImage src={getItemImage(buff.potionId)} alt="" className="w-4 h-4 object-contain" spinnerClassName="w-3 h-3" />
                                      <span className="text-purple-200 flex-1 truncate">{translateItemName(buff.potionId, language)}</span>
                                      <span className="text-cyan-300">+{buff.value}{buff.effectType === "hp_regen" ? "/s" : "%"} {effectLabel}</span>
                                      <BuffCountdownText expiresAt={buff.expiresAt} className="text-amber-300 font-mono" />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {activeBuffs.length === 0 && (
                            <div className="text-muted-foreground text-center py-1.5 text-[9px]">{language === 'tr' ? 'Aktif buff yok' : 'No active buffs'}</div>
                          )}

                          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                            <div className="text-[9px] font-medium text-cyan-300 mb-1">{t('style')}</div>
                            <div className="flex flex-wrap gap-2 text-[9px]">
                              <span className={cn("font-medium capitalize", combatStyle === "attack" ? "text-red-400" : combatStyle === "defence" ? "text-blue-400" : "text-green-400")}>{t(combatStyle as any)}</span>
                              <span className="text-orange-300">Dmg x{combatStyleDamageMod.toFixed(2)}</span>
                              <span className="text-blue-300">Def x{combatStyleDefenceMod.toFixed(2)}</span>
                              <span className="text-green-300">Acc x{combatStyleAccuracyMod.toFixed(2)}</span>
                            </div>
                          </div>

                          {weaponBaseItem && (
                            <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30">
                              <div className="text-[9px] font-medium text-orange-300 mb-1">{language === 'tr' ? 'Silah' : 'Weapon'}</div>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
                                <div className="flex justify-between"><span className="text-muted-foreground">Name:</span><span className="text-orange-200 truncate ml-1">{weaponBaseItem.name}</span></div>
                                {weaponBaseItem.weaponCategory && <div className="flex justify-between"><span className="text-muted-foreground">Type:</span><span className="text-orange-200 capitalize">{weaponBaseItem.weaponCategory}</span></div>}
                                <div className="flex justify-between"><span className="text-muted-foreground">Speed:</span><span className="text-amber-300">{actualAttackSpeedMs}ms</span></div>
                                {totalAttackSpeedBonus > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Bonus:</span><span className="text-green-400">+{totalAttackSpeedBonus}%</span></div>}
                                {equipment.weapon && itemModifications[equipment.weapon]?.addedSkills?.length > 0 && (
                                  <div className="col-span-2 flex gap-1 flex-wrap mt-0.5">
                                    <span className="text-muted-foreground">{t('weaponSkillsLabel')}:</span>
                                    {itemModifications[equipment.weapon].addedSkills.map((skill: string, i: number) => (
                                      <Badge key={i} variant="outline" className="text-[8px] py-0 px-1 border-orange-500/40 text-orange-300">{skill}</Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {(myBonuses?.combatPower || myBonuses?.defensePower) ? (
                            <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/30">
                              <div className="text-[9px] font-medium text-green-300 mb-1">{t('guild')} Bonuses</div>
                              <div className="flex gap-3 text-[9px]">
                                {myBonuses?.combatPower ? <span className="text-red-300">{language === 'tr' ? 'Savaş' : 'Combat'}: +{myBonuses.combatPower}%</span> : null}
                                {myBonuses?.defensePower ? <span className="text-blue-300">{language === 'tr' ? 'Savunma' : 'Defense'}: +{myBonuses.defensePower}%</span> : null}
                              </div>
                            </div>
                          ) : null}

                          {sameMonsterBonus.sameMonsterCount > 0 && (
                            <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
                              <div className="text-[9px] font-medium text-indigo-300 mb-0.5">{t('party')} Bonus</div>
                              <div className="flex gap-3 text-[9px]">
                                <span className="text-red-300">DPS +{Math.round(sameMonsterBonus.dpsBonus * 100)}%</span>
                                <span className="text-blue-300">Def +{Math.round(sameMonsterBonus.defenseBonus * 100)}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {formulaPanelTab === "breakdown" && (
                        <div className="h-32 overflow-y-auto space-y-1.5 pr-1">
                          <div className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30">
                            <div className="text-[9px] font-medium text-red-300 mb-1">{language === 'tr' ? 'Hasar' : 'Damage'}</div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] font-mono">
                              <div className="flex justify-between"><span className="text-muted-foreground">Base Max:</span><span className="text-red-200">{playerBaseMaxHit}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Str Buff:</span><span className={strengthBuffPercent > 0 ? "text-green-400" : "text-gray-500"}>{strengthBuffPercent > 0 ? `+${strengthBuffPercent}%` : "-"}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Style:</span><span className="text-orange-300">x{combatStyleDamageMod.toFixed(2)}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Guild:</span><span className={guildCombatPowerMod > 1 ? "text-green-400" : "text-gray-500"}>x{guildCombatPowerMod.toFixed(2)}</span></div>
                              <div className="col-span-2 flex justify-between border-t border-red-500/20 pt-0.5 mt-0.5">
                                <span className="text-red-300 font-medium">Final:</span>
                                <span className="text-red-200 font-bold">{playerMinHit}-{playerMaxHit}</span>
                              </div>
                            </div>
                          </div>

                          <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/30">
                            <div className="text-[9px] font-medium text-green-300 mb-1">{language === 'tr' ? 'İsabet' : 'Accuracy'}</div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] font-mono">
                              <div className="flex justify-between"><span className="text-muted-foreground">Base:</span><span className="text-green-200">{baseAccuracy}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Atk Buff:</span><span className={attackBuffPercent > 0 ? "text-green-400" : "text-gray-500"}>{attackBuffPercent > 0 ? `+${attackBuffPercent}%` : "-"}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Style:</span><span className="text-orange-300">x{combatStyleAccuracyMod.toFixed(2)}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Power:</span><span className="text-cyan-300">x{powerRatioMod.toFixed(3)}</span></div>
                              <div className="col-span-2 flex justify-between border-t border-green-500/20 pt-0.5 mt-0.5">
                                <span className="text-green-300 font-medium">Final:</span>
                                <span className="text-green-200 font-bold">{playerAccuracy}</span>
                              </div>
                            </div>
                          </div>

                          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30">
                            <div className="text-[9px] font-medium text-blue-300 mb-1">{language === 'tr' ? 'Savunma' : 'Defense'}</div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] font-mono">
                              <div className="flex justify-between"><span className="text-muted-foreground">Evasion:</span><span className="text-blue-200">{baseEvasion}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Def Buff:</span><span className={defenceBuffPercent > 0 ? "text-green-400" : "text-gray-500"}>{defenceBuffPercent > 0 ? `+${defenceBuffPercent}%` : "-"}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Style:</span><span className="text-orange-300">x{combatStyleDefenceMod.toFixed(2)}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Crit:</span><span className="text-purple-300">{((equipmentBonuses.critChance || 0) + critChanceBuffPercent).toFixed(1)}%</span></div>
                              <div className="col-span-2 flex justify-between border-t border-blue-500/20 pt-0.5 mt-0.5">
                                <span className="text-blue-300 font-medium">Dmg Reduction:</span>
                                <span className="text-blue-200 font-bold">{(playerDamageReductionCapped * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Floating Action Bar - Combat button with trapezoid inventory button on top */}
          <div className="fixed bottom-20 left-0 right-0 z-40 flex justify-center items-end pointer-events-none">
            {/* Combat Button + Inventory Tab - centered */}
            <div className="flex flex-col items-center pointer-events-auto">
              {!activeCombat && hasLowDurabilityEquipment() && (
                <div className="px-3 py-1 mb-1 bg-orange-500/80 rounded-full text-[10px] font-bold text-white animate-pulse">
                  {t('lowDurability')}
                </div>
              )}
              {(activeCombat || isInPartyCombat) ? (
                <>
                  {isQueueV2 && activeCombat?.queueDurationMs ? (
                    <QueueCountdownTimer
                      startTime={activeCombat.combatStartTime}
                      durationMs={activeCombat.queueDurationMs}
                      onStop={handleStopCombat}
                      compact
                    />
                  ) : null}
                  <div className="flex flex-col items-center">
                    {/* Trapezoid Inventory Button - on top of combat button */}
                    <button
                      onClick={() => setConsumablesSheetOpen(true)}
                      className={cn(
                        "relative px-6 py-1.5 text-[11px] font-bold transition-all",
                        "bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400",
                        "text-amber-950 shadow-md",
                        "rounded-t-lg",
                        autoEatEnabled && "ring-2 ring-amber-300"
                      )}
                      style={{ 
                        clipPath: 'polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%)',
                        marginBottom: '-1px'
                      }}
                      data-testid="fab-open-consumables"
                    >
                      <span className="flex items-center gap-1">
                        <Backpack className="w-3.5 h-3.5" weight="fill" />
                        {language === 'tr' ? 'Envanter' : 'Inventory'}
                      </span>
                      {activeBuffs.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                          {activeBuffs.length}
                        </span>
                      )}
                    </button>
                    <Button 
                      onClick={handleStopCombat} 
                      variant="destructive" 
                      size="lg"
                      className="h-14 px-8 rounded-full shadow-lg shadow-red-500/30 text-base"
                      data-testid="fab-stop-combat"
                      disabled={isInPartyCombat && !isPartyLeader}
                    >
                      <Stop className="w-5 h-5 mr-2" weight="fill" />
                      {isInPartyCombat ? t('stopPartyCombat') : t('flee')}
                    </Button>
                  </div>
                  {isInPartyCombat && !isPartyLeader && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      {language === 'tr' ? 'Sadece lider durdurabilir' : 'Only leader can stop'}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center">
                  {currentHitpoints <= 0 && (
                    <div className="px-3 py-1.5 mb-1 rounded-full bg-red-500/30 border border-red-500/50 text-sm text-red-300 whitespace-nowrap">
                      {t('needToEatFood')}
                    </div>
                  )}
                  {/* Combat button with inventory icon */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setConsumablesSheetOpen(true)}
                      className={cn(
                        "relative h-14 w-14 flex items-center justify-center transition-all",
                        "bg-gradient-to-r from-amber-800/90 to-amber-700/90 hover:from-amber-700/90 hover:to-amber-600/90",
                        "text-amber-200 shadow-lg border border-amber-600/40",
                        "rounded-full",
                        autoEatEnabled && "ring-2 ring-amber-500/50"
                      )}
                      data-testid="fab-open-consumables-idle"
                    >
                      <Backpack className="w-6 h-6" weight="fill" />
                      {activeBuffs.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                          {activeBuffs.length}
                        </span>
                      )}
                    </button>
                    <Button 
                      onClick={handleStartCombat} 
                      disabled={!selectedMonsterId || currentHitpoints <= 0}
                      size="lg"
                      className="h-14 px-8 rounded-full shadow-lg bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-base"
                      data-testid="fab-start-combat"
                    >
                      {isQueueV2 && (activeTask || activeCombat) ? (
                        <>
                          <ListPlus className="w-5 h-5 mr-2" weight="bold" />
                          {t('addToQueue')}
                        </>
                      ) : (
                        <>
                          <Play className="w-5 h-5 mr-2" weight="fill" />
                          {t('combat')}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Consumables Sheet */}
          <Sheet open={consumablesSheetOpen} onOpenChange={setConsumablesSheetOpen}>
            <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl">
              <SheetHeader className="pb-2">
                <SheetTitle className="flex items-center gap-2">
                  <Backpack className="w-5 h-5 text-amber-400" weight="fill" />
                  {t('consumables')}
                </SheetTitle>
              </SheetHeader>
              
              <Tabs defaultValue="food" className="w-full" onValueChange={() => playSfx('ui', 'tab_switch')}>
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="food" className="flex items-center gap-1.5">
                    <Cookie className="w-4 h-4" weight="fill" />
                    {t('food')}
                  </TabsTrigger>
                  <TabsTrigger value="potions" className="flex items-center gap-1.5">
                    <Flask className="w-4 h-4" weight="fill" />
                    {t('potions')}
                  </TabsTrigger>
                </TabsList>

                {/* Food Tab */}
                <TabsContent value="food" className="space-y-4">
                  {/* Auto-Eat Settings */}
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cookie className="w-5 h-5 text-amber-400" weight="fill" />
                        <span className="text-sm font-medium">{t('autoEat')}</span>
                      </div>
                      <Switch 
                        checked={autoEatEnabled} 
                        onCheckedChange={setAutoEatEnabled}
                        data-testid="switch-auto-eat-mobile"
                      />
                    </div>
                    
                    {autoEatEnabled && (
                      <>
                        {/* Selected Food */}
                        {selectedFood && (
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/20">
                            <RetryImage 
                              src={getItemImage(selectedFood)} 
                              alt={selectedFood} 
                              className="w-8 h-8 object-contain"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-amber-300 truncate">{getItemById(selectedFood)?.name || selectedFood}</div>
                              <div className="text-xs text-amber-400/70">+{getFoodHealAmount(selectedFood)} HP • x{inventory[selectedFood] || 0}</div>
                            </div>
                          </div>
                        )}
                        
                        {/* Threshold */}
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{t('hpThreshold')}:</span>
                          <Slider
                            value={[autoEatThreshold]}
                            onValueChange={(value) => setAutoEatThreshold(value[0])}
                            min={10}
                            max={90}
                            step={5}
                            className="flex-1"
                            data-testid="slider-auto-eat-threshold-mobile"
                          />
                          <Badge className="bg-amber-500/30 text-amber-300 border-amber-500/50 text-xs py-0.5 px-2">
                            %{autoEatThreshold}
                          </Badge>
                        </div>
                        
                      </>
                    )}
                  </div>

                  {/* Selected Food Action Panel */}
                  {consumableActionItem?.type === "food" && (() => {
                    const foodItem = getItemById(consumableActionItem.itemId);
                    const healAmount = getFoodHealAmount(consumableActionItem.itemId);
                    const isCurrentAutoEat = selectedFood === consumableActionItem.itemId;
                    return (
                      <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30 space-y-3">
                        <div className="flex items-center gap-3">
                          <RetryImage 
                            src={getItemImage(consumableActionItem.itemId)} 
                            alt={foodItem?.name || consumableActionItem.itemId}
                            className="w-12 h-12 object-contain"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-green-300">{foodItem?.name}</div>
                            <div className="text-sm text-green-400">+{healAmount} HP • x{inventory[consumableActionItem.itemId] || 0}</div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConsumableActionItem(null)}
                            className="text-muted-foreground"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            onClick={() => {
                              if (currentHitpoints < maxHitpoints) {
                                const ate = eatFood(consumableActionItem.itemId);
                                if (ate) {
                                  addLogEntry(`${foodItem?.name || consumableActionItem.itemId} ${t('ateFood')} ${healAmount} HP!`, "loot");
                                }
                              }
                            }}
                            disabled={currentHitpoints >= maxHitpoints}
                            className="flex-1 bg-green-600 hover:bg-green-700 active:bg-green-800 touch-manipulation min-h-[44px]"
                            data-testid="btn-eat-food-inline"
                          >
                            <Cookie className="w-4 h-4 mr-2" weight="fill" />
                            {t('eat')}
                          </Button>
                          <Button
                            onClick={() => {
                              if (isCurrentAutoEat) {
                                setSelectedFood(null);
                              } else {
                                setSelectedFood(consumableActionItem.itemId);
                              }
                            }}
                            variant={isCurrentAutoEat ? "destructive" : "secondary"}
                            className="flex-1 touch-manipulation min-h-[44px]"
                            data-testid="btn-auto-eat-inline"
                          >
                            {isCurrentAutoEat ? (
                              <>
                                <X className="w-4 h-4 mr-2" weight="bold" />
                                {t('cancelAutoEat')}
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4 mr-2" weight="fill" />
                                {t('selectAutoEat')}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Food List */}
                  <ScrollArea className="h-[25vh]">
                    <div className="grid grid-cols-4 gap-2 pr-2">
                      {Object.entries(inventory)
                        .filter(([itemId, qty]) => isFood(itemId) && qty > 0)
                        .map(([itemId, qty]) => {
                          const food = getItemById(itemId);
                          const healAmount = getFoodHealAmount(itemId);
                          const isAutoEatSelected = selectedFood === itemId;
                          const isActionSelected = consumableActionItem?.itemId === itemId && consumableActionItem?.type === "food";
                          return (
                            <button
                              key={itemId}
                              onClick={() => setConsumableActionItem({ itemId, type: "food" })}
                              className={cn(
                                "relative p-2 rounded-xl border transition-all flex flex-col items-center gap-1 touch-manipulation min-h-[60px]",
                                isActionSelected
                                  ? "bg-green-500/30 border-green-500/60 ring-2 ring-green-500/50"
                                  : isAutoEatSelected
                                    ? "bg-amber-500/30 border-amber-500/60"
                                    : "bg-muted/30 border-border/50 hover:bg-amber-500/10 active:bg-amber-500/20"
                              )}
                              data-testid={`sheet-food-${itemId}`}
                            >
                              <RetryImage 
                                src={getItemImage(itemId)} 
                                alt={itemId} 
                                className="w-10 h-10 object-contain"
                              />
                              <span className="text-[10px] text-green-400 font-bold">+{healAmount}</span>
                              <span className="absolute -top-1 -right-1 text-[9px] bg-black/80 text-white px-1 rounded-full">
                                {qty}
                              </span>
                              {isAutoEatSelected && (
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] bg-amber-500 text-white px-1.5 rounded-full">
                                  {t('auto')}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      {Object.entries(inventory).filter(([itemId, qty]) => isFood(itemId) && qty > 0).length === 0 && (
                        <div className="col-span-4 text-center text-sm text-muted-foreground py-8">
                          {t('noFood')}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                  <p className="text-sm font-semibold text-amber-400/80 text-center mt-3 py-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                    {t('tapFoodHint')}
                  </p>
                </TabsContent>

                {/* Potions Tab */}
                <TabsContent value="potions" className="space-y-4">
                  {/* Auto-Potion Settings */}
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Flask className="w-5 h-5 text-purple-400" weight="fill" />
                        <span className="text-sm font-medium">{t('autoPotion')}</span>
                      </div>
                      <Switch 
                        checked={autoPotionEnabled} 
                        onCheckedChange={setAutoPotionEnabled}
                        data-testid="switch-auto-potion-mobile"
                      />
                    </div>
                    
                    {autoPotionEnabled && (
                      <>
                        {/* Selected Potion */}
                        {selectedPotion ? (
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-500/20">
                            <RetryImage 
                              src={getItemImage(selectedPotion)} 
                              alt={selectedPotion} 
                              className="w-8 h-8 object-contain"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-purple-300 truncate">{getItemById(selectedPotion)?.name || selectedPotion}</div>
                              <div className="text-xs text-purple-400/70">x{inventory[selectedPotion] || 0} {t('pieces')}</div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs text-red-400 hover:text-red-300"
                              onClick={() => setSelectedPotion(null)}
                            >
                              {t('remove')}
                            </Button>
                          </div>
                        ) : (
                          <div className="text-xs text-purple-400/70 text-center py-2">
                            {t('selectPotionHint')}
                          </div>
                        )}
                        <p className="text-[10px] text-purple-400/60 text-center">
                          {t('autoPotionHint')}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Active Buffs - Horizontal Icon Row with Popover */}
                  {activeBuffs.length > 0 && (
                    <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30">
                      <div className="text-xs font-medium text-purple-300 mb-2">{t('activeBuffs')}</div>
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-purple-500/30 scrollbar-track-transparent">
                        {activeBuffs.map(buff => {
                          const potionItem = getItemById(buff.potionId);
                          const effectLabel = buff.effectType === "attack_boost" ? t('attack') :
                                             buff.effectType === "strength_boost" ? t('strength') :
                                             buff.effectType === "defence_boost" ? t('defence') :
                                             buff.effectType === "crit_chance" ? t('critical') :
                                             buff.effectType === "damage_reduction" ? t('protection') :
                                             buff.effectType === "hp_regen" ? t('hpRegen') : "";
                          return (
                            <Popover key={buff.potionId}>
                              <PopoverTrigger asChild>
                                <button 
                                  className="relative p-1.5 rounded-lg bg-purple-500/20 border border-purple-500/40 hover:bg-purple-500/30 transition-all shrink-0"
                                >
                                  <RetryImage 
                                    src={getItemImage(buff.potionId)} 
                                    alt={potionItem?.name || buff.potionId}
                                    className="w-8 h-8 object-contain"
                                  />
                                  <BuffCountdownText expiresAt={buff.expiresAt} className="absolute -bottom-1 -right-1 text-[9px] bg-purple-900/90 text-purple-200 px-1 rounded font-medium" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="bottom" className="w-auto min-w-[180px] bg-card/95 backdrop-blur-sm border-purple-500/50 p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <RetryImage 
                                    src={getItemImage(buff.potionId)} 
                                    alt={potionItem?.name || buff.potionId}
                                    className="w-8 h-8 object-contain"
                                  />
                                  <div>
                                    <div className="text-sm font-medium text-purple-200">{potionItem?.name}</div>
                                    <div className="text-xs text-purple-400">{effectLabel} +{buff.value}%</div>
                                  </div>
                                </div>
                                <div className="text-xs text-purple-300 flex items-center gap-1">
                                  <Timer className="w-3 h-3" />
                                  <BuffCountdownText expiresAt={buff.expiresAt} /> {t('remaining')}
                                </div>
                              </PopoverContent>
                            </Popover>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Selected Potion Action Panel */}
                  {consumableActionItem?.type === "potion" && (() => {
                    const potionItem = getItemById(consumableActionItem.itemId);
                    const isCurrentAutoPotion = selectedPotion === consumableActionItem.itemId;
                    const isActivePotion = activeBuffs.some(b => b.potionId === consumableActionItem.itemId);
                    return (
                      <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 space-y-3">
                        <div className="flex items-center gap-3">
                          <RetryImage 
                            src={getItemImage(consumableActionItem.itemId)} 
                            alt={potionItem?.name || consumableActionItem.itemId}
                            className="w-12 h-12 object-contain"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-purple-300">{potionItem?.name}</div>
                            {potionItem?.effect && potionItem?.duration && (
                              <div className="text-sm text-purple-400">
                                {potionItem.effect.type === "attack_boost" && t('attack')}
                                {potionItem.effect.type === "strength_boost" && t('strength')}
                                {potionItem.effect.type === "defence_boost" && t('defence')}
                                {potionItem.effect.type === "crit_chance" && t('critical')}
                                {potionItem.effect.type === "damage_reduction" && t('protection')}
                                {potionItem.effect.type === "hp_regen" && t('hpRegen')}
                                {potionItem.effect.type === "hp_regen" 
                                  ? ` ${potionItem.effect.value} ${t('hpPerSec')} • ${Math.floor(potionItem.duration / 60)} ${t('minutes')}`
                                  : ` +${potionItem.effect.value}% • ${Math.floor(potionItem.duration / 60)} ${t('minutes')}`
                                }
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConsumableActionItem(null)}
                            className="text-muted-foreground"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            onClick={() => {
                              const success = usePotion(consumableActionItem.itemId);
                              if (success) {
                                addLogEntry(`${potionItem?.name || consumableActionItem.itemId} ${t('drankPotion')}`, "loot");
                              }
                            }}
                            disabled={isActivePotion}
                            className="flex-1 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 touch-manipulation min-h-[44px]"
                            data-testid="btn-drink-potion-inline"
                          >
                            <Flask className="w-4 h-4 mr-2" weight="fill" />
                            {t('drink')}
                          </Button>
                          <Button
                            onClick={() => {
                              if (isCurrentAutoPotion) {
                                setSelectedPotion(null);
                              } else {
                                setSelectedPotion(consumableActionItem.itemId);
                              }
                            }}
                            variant={isCurrentAutoPotion ? "destructive" : "secondary"}
                            className="flex-1 touch-manipulation min-h-[44px]"
                            data-testid="btn-auto-potion-inline"
                          >
                            {isCurrentAutoPotion ? (
                              <>
                                <X className="w-4 h-4 mr-2" weight="bold" />
                                {t('cancel')}
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4 mr-2" weight="fill" />
                                {t('autoPotion')}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Potions List */}
                  <ScrollArea className="h-[25vh]">
                    <div className="space-y-2 pr-2">
                      {Object.entries(inventory)
                        .filter(([itemId, qty]) => {
                          const item = getItemById(itemId);
                          return item?.type === "potion" && qty > 0;
                        })
                        .map(([itemId, qty]) => {
                          const item = getItemById(itemId);
                          const isActive = activeBuffs.some(b => b.potionId === itemId);
                          const isAutoPotion = selectedPotion === itemId;
                          const isActionSelected = consumableActionItem?.itemId === itemId && consumableActionItem?.type === "potion";
                          return (
                            <button
                              key={itemId}
                              onClick={() => {
                                if (!isActive) {
                                  setConsumableActionItem({ itemId, type: "potion" });
                                }
                              }}
                              disabled={isActive}
                              className={cn(
                                "w-full p-3 rounded-xl border flex items-center gap-3 transition-all relative touch-manipulation min-h-[60px]",
                                isActionSelected
                                  ? "bg-purple-500/40 border-purple-500/70 ring-2 ring-purple-500/50"
                                  : isActive
                                    ? "bg-purple-500/30 border-purple-500/50 opacity-60"
                                    : isAutoPotion
                                      ? "bg-purple-500/20 border-purple-500/60"
                                      : "bg-muted/30 border-border/50 hover:bg-purple-500/10 hover:border-purple-500/30 active:bg-purple-500/20"
                              )}
                              data-testid={`sheet-potion-${itemId}`}
                            >
                              <RetryImage 
                                src={getItemImage(itemId)} 
                                alt={item?.name || formatItemIdAsName(itemId)}
                                className="w-10 h-10 object-contain"
                              />
                              <div className="flex-1 text-left">
                                <div className="text-sm font-medium">{item?.name || formatItemIdAsName(itemId)}</div>
                                {item?.effect && item?.duration && (
                                  <div className="text-xs text-purple-400">
                                    {item.effect.type === "attack_boost" && t('attack')}
                                    {item.effect.type === "strength_boost" && t('strength')}
                                    {item.effect.type === "defence_boost" && t('defence')}
                                    {item.effect.type === "crit_chance" && t('critical')}
                                    {item.effect.type === "damage_reduction" && t('protection')}
                                    {item.effect.type === "hp_regen" && t('hpRegen')}
                                    {item.effect.type === "hp_regen" 
                                      ? ` ${item.effect.value} ${t('hpPerSec')} • ${Math.floor(item.duration / 60)} ${t('minutes')}`
                                      : ` +${item.effect.value}% • ${Math.floor(item.duration / 60)} ${t('minutes')}`
                                    }
                                  </div>
                                )}
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                x{qty}
                              </Badge>
                              {isActive && (
                                <Badge className="bg-purple-500/50 text-purple-100 text-[10px]">{t('active')}</Badge>
                              )}
                              {isAutoPotion && !isActive && (
                                <Badge className="absolute -top-1 -right-1 bg-purple-500 text-white text-[8px] px-1.5">{t('auto')}</Badge>
                              )}
                            </button>
                          );
                        })}
                      {Object.entries(inventory).filter(([itemId]) => {
                        const item = getItemById(itemId);
                        return item?.type === "potion";
                      }).length === 0 && (
                        <div className="text-center text-sm text-muted-foreground py-8">
                          {t('noPotion')}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </SheetContent>
          </Sheet>

          {isQueueV2 && selectedMonster && (
            <Sheet open={fabDurationSheetOpen} onOpenChange={setFabDurationSheetOpen}>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetHeader className="pb-2">
                  <SheetTitle className="flex items-center gap-2">
                    <Sword className="w-5 h-5 text-red-400" weight="duotone" />
                    {getLocalizedMonsterName(language, selectedMonster.id)}
                  </SheetTitle>
                </SheetHeader>
                <InlineDurationPicker
                  onConfirm={async (durationMs) => {
                    const monster = selectedMonster;
                    setFabDurationSheetOpen(false);
                    addToQueue({
                      type: 'combat',
                      monsterId: monster.id,
                      name: getLocalizedMonsterName(language, monster.id),
                      durationMs,
                    });
                  }}
                  onBack={() => setFabDurationSheetOpen(false)}
                  maxAvailableMs={maxQueueTimeMsTotal - getUsedQueueTimeMs(taskQueue, activeTask, activeCombat)}
                  activityName={getLocalizedMonsterName(language, selectedMonster.id)}
                  mode={(activeTask || activeCombat) ? 'queue' : 'start'}
                />
              </SheetContent>
            </Sheet>
          )}
        </div>

        {/* Loot Modal */}
        <Dialog open={showLootModal} onOpenChange={(open) => { setShowLootModal(open); if (!open) setPreviewMonsterId(null); }}>
          <DialogContent className="max-w-[90vw] rounded-xl" data-testid="modal-monster-loot-mobile">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <Package className="w-4 h-4 text-amber-400" />
                {lootModalMonster?.name} - {t('loots')}
              </DialogTitle>
            </DialogHeader>
            {lootModalMonster && (
              <ScrollArea className="max-h-60">
                <div className="space-y-1.5 pr-2">
                  {lootModalMonster.loot.map(loot => {
                    const item = getItemById(loot.itemId);
                    const itemImg = getItemImage(loot.itemId);
                    const itemName = translateItemName(loot.itemId, language);
                    const itemRarity = item?.rarity;
                    const rarityColor = itemRarity ? RARITY_COLORS[itemRarity] : null;
                    const isRareDrop = loot.chance < 1;
                    const isUncommonDrop = loot.chance < 5 && loot.chance >= 1;
                    return (
                      <div 
                        key={loot.itemId}
                        className={cn(
                          "p-2 rounded-lg border text-xs",
                          isRareDrop && "bg-purple-500/10 border-purple-500/30",
                          isUncommonDrop && !isRareDrop && "bg-blue-500/10 border-blue-500/30",
                          !isRareDrop && !isUncommonDrop && "bg-muted/20 border-border/30"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {itemImg ? (
                              <RetryImage src={itemImg} alt={itemName} className="w-6 h-6 object-contain pixelated flex-shrink-0" />
                            ) : (
                              <Package className="w-4 h-4 text-amber-400 flex-shrink-0" weight="fill" />
                            )}
                            <span className={cn(
                              "font-medium truncate",
                              rarityColor || (isRareDrop ? "text-purple-400" : isUncommonDrop ? "text-blue-400" : "")
                            )}>
                              {itemName}
                            </span>
                            {itemRarity && (
                              <Badge className={cn("text-[8px] py-0 px-1 flex-shrink-0", RARITY_BG_COLORS[itemRarity], rarityColor)}>{itemRarity}</Badge>
                            )}
                            {isRareDrop && !itemRarity && (
                              <Badge className="text-[8px] py-0 px-1 bg-purple-500/30 text-purple-300 flex-shrink-0">{t('rare')}</Badge>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span className={cn(
                              "font-bold",
                              isRareDrop ? "text-purple-400" : isUncommonDrop ? "text-blue-400" : "text-muted-foreground"
                            )}>
                              {loot.chance < 1 ? `${loot.chance}%` : `${Math.round(loot.chance)}%`}
                            </span>
                          </div>
                        </div>
                        {loot.minQty !== loot.maxQty && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 pl-7">
                            {loot.minQty}-{loot.maxQty} {t('pieces')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>

      </>
    );
  }

  return (
    <>
      <div className="p-4 lg:p-6 space-y-4">
        {/* API Warning Banner - shown when using static fallback data */}
        {showApiWarning && (
          <div className="bg-amber-500/20 border border-amber-500/40 rounded-lg p-3 text-sm text-amber-300 flex items-center gap-2 mb-4">
            <span>⚠️</span>
            <span>Using cached data. Some monsters may be outdated.</span>
          </div>
        )}
        
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30">
            <Sword className="w-8 h-8 text-red-400" weight="duotone" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">{t('battleArena')}</h1>
            <p className="text-muted-foreground text-sm">{t('fightMonsters')}</p>
          </div>
        </div>

        {/* Unified Combat Control Bar - Desktop */}
        <div className="flex items-stretch gap-4 p-3 rounded-lg bg-card/80 border border-border/50 mb-4">
          {/* Combat Style Buttons - Vertically Centered */}
          <div className="flex items-center gap-2 self-center">
            <span className="text-sm font-medium text-muted-foreground mr-1">{t("style")}:</span>
            <button
              onClick={() => setCombatStyle("attack")}
              disabled={activeCombat !== null}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded border transition-all",
                combatStyle === "attack" 
                  ? "bg-red-500/30 border-red-500/60 ring-1 ring-red-500/50" 
                  : "bg-muted/20 border-border/50 hover:bg-red-500/10 hover:border-red-500/40",
                activeCombat !== null && "opacity-50 cursor-not-allowed"
              )}
              title={t('attackStyle')}
              data-testid="combat-style-attack"
            >
              <Sword className={cn("w-5 h-5", combatStyle === "attack" ? "text-red-400" : "text-muted-foreground")} weight="duotone" />
              <span className={cn("text-sm font-medium", combatStyle === "attack" ? "text-red-400" : "text-muted-foreground")}>{t('attack')}</span>
            </button>
            <button
              onClick={() => setCombatStyle("balanced")}
              disabled={activeCombat !== null}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded border transition-all",
                combatStyle === "balanced" 
                  ? "bg-amber-500/30 border-amber-500/60 ring-1 ring-amber-500/50" 
                  : "bg-muted/20 border-border/50 hover:bg-amber-500/10 hover:border-amber-500/40",
                activeCombat !== null && "opacity-50 cursor-not-allowed"
              )}
              title={t('balancedStyle')}
              data-testid="combat-style-balanced"
            >
              <ShieldStar className={cn("w-5 h-5", combatStyle === "balanced" ? "text-amber-400" : "text-muted-foreground")} weight="duotone" />
              <span className={cn("text-sm font-medium", combatStyle === "balanced" ? "text-amber-400" : "text-muted-foreground")}>{t('balanced')}</span>
            </button>
            <button
              onClick={() => setCombatStyle("defence")}
              disabled={activeCombat !== null}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded border transition-all",
                combatStyle === "defence" 
                  ? "bg-blue-500/30 border-blue-500/60 ring-1 ring-blue-500/50" 
                  : "bg-muted/20 border-border/50 hover:bg-blue-500/10 hover:border-blue-500/40",
                activeCombat !== null && "opacity-50 cursor-not-allowed"
              )}
              title={t('defenceStyle')}
              data-testid="combat-style-defence"
            >
              <Shield className={cn("w-5 h-5", combatStyle === "defence" ? "text-blue-400" : "text-muted-foreground")} weight="duotone" />
              <span className={cn("text-sm font-medium", combatStyle === "defence" ? "text-blue-400" : "text-muted-foreground")}>{t('defence')}</span>
            </button>
          </div>

          {/* Separator */}
          <div className="w-px bg-border/50 self-stretch" />

          {/* Consumables Section - Potions and Food Bars */}
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            {/* Potions Row */}
            <div className="flex items-center gap-3 min-w-0">
            {/* Auto-Potion Toggle */}
            <button
              onClick={() => setAutoPotionEnabled(!autoPotionEnabled)}
              className={cn(
                "p-2 rounded-lg border transition-all shrink-0",
                autoPotionEnabled
                  ? "bg-purple-500/30 border-purple-500/60 ring-1 ring-purple-500/50"
                  : "bg-muted/20 border-border/50 hover:bg-purple-500/10"
              )}
              title={autoPotionEnabled ? t('autoPotionOn') : t('autoPotionOff')}
            >
              <Flask className={cn("w-5 h-5", autoPotionEnabled ? "text-purple-400" : "text-muted-foreground")} weight="duotone" />
            </button>
            
            {/* Scrollable Potion Container */}
            <div className="flex-1 overflow-x-auto potion-scroll-container">
              <div className="flex items-center gap-2 min-w-max">
            
            {/* Active Buffs - Icon Only with Tooltip */}
            {activeBuffs.map(buff => {
              const potionItem = getItemById(buff.potionId);
              const effectLabel = buff.effectType === "attack_boost" ? t('attack') :
                                 buff.effectType === "strength_boost" ? t('strength') :
                                 buff.effectType === "defence_boost" ? t('defence') :
                                 buff.effectType === "crit_chance" ? t('critical') :
                                 buff.effectType === "damage_reduction" ? t('protection') :
                                 buff.effectType === "hp_regen" ? t('hpRegen') : "";
              return (
                <TooltipProvider key={buff.potionId}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button 
                        className="relative p-1.5 rounded-lg bg-purple-500/30 border border-purple-500/50 hover:bg-purple-500/40 transition-all shrink-0"
                      >
                        <RetryImage 
                          src={getItemImage(buff.potionId)} 
                          alt={potionItem?.name || buff.potionId}
                          className="w-7 h-7 object-contain"
                        />
                        <BuffCountdownText expiresAt={buff.expiresAt} className="absolute -bottom-1 -right-1 text-[9px] bg-purple-900/90 text-purple-200 px-1 rounded font-medium" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-card/95 backdrop-blur-sm border-purple-500/50">
                      <div className="flex items-center gap-2">
                        <RetryImage 
                          src={getItemImage(buff.potionId)} 
                          alt={potionItem?.name || buff.potionId}
                          className="w-6 h-6 object-contain"
                          spinnerClassName="w-3 h-3"
                        />
                        <div>
                          <div className="text-sm font-medium text-purple-200">{potionItem?.name}</div>
                          <div className="text-xs text-purple-400">{effectLabel} +{buff.value}%</div>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
            
            {/* Quick Potion Buttons - Compact (image + qty badge) */}
            {Object.entries(inventory)
              .filter(([itemId, qty]) => {
                const item = getItemById(itemId);
                return item?.type === "potion" && qty > 0;
              })
              .map(([itemId, qty]) => {
                const item = getItemById(itemId);
                const isActive = activeBuffs.some(b => b.potionId === itemId);
                if (isActive) return null;
                const isPending = pendingPotionId === itemId;
                return (
                  <Popover key={itemId} open={isPending} onOpenChange={(open) => setPendingPotionId(open ? itemId : null)}>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          "relative p-1.5 rounded border-2 transition-all",
                          selectedPotion === itemId && autoPotionEnabled
                            ? "bg-purple-500/40 border-purple-400 ring-2 ring-purple-400/50"
                            : isPending 
                              ? "bg-purple-500/30 border-purple-500/70 ring-1 ring-purple-500/50" 
                              : "bg-muted/30 border-border/50 hover:bg-purple-500/20 hover:border-purple-500/50"
                        )}
                        title={item?.name}
                        data-testid={`quick-potion-${itemId}`}
                      >
                        <RetryImage 
                          src={getItemImage(itemId)} 
                          alt={item?.name || formatItemIdAsName(itemId)}
                          className="w-7 h-7 object-contain"
                        />
                        <span className="absolute -bottom-1 -right-1 text-[8px] bg-black/80 text-purple-300 px-1 rounded">
                          x{qty}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent 
                      side="bottom" 
                      align="start" 
                      className="w-auto min-w-[200px] bg-card/95 backdrop-blur-sm border-purple-500/50 p-3"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <RetryImage 
                          src={getItemImage(itemId)} 
                          alt={item?.name || formatItemIdAsName(itemId)}
                          className="w-10 h-10 object-contain rounded-lg bg-purple-500/20 p-1"
                        />
                        <div>
                          <div className="text-sm font-bold text-purple-200">{item?.name || formatItemIdAsName(itemId)}</div>
                          <div className="text-xs text-muted-foreground">{t("inInventory")}: {qty} {t("pieces")}</div>
                        </div>
                      </div>
                      {item?.effect && item?.duration && (
                        <div className="text-sm text-purple-300 mb-3 p-2 bg-purple-500/15 rounded-lg border border-purple-500/30">
                          <div className="font-medium">
                            {item.effect.type === "attack_boost" && t('attack')}
                            {item.effect.type === "strength_boost" && t('strength')}
                            {item.effect.type === "defence_boost" && t('defence')}
                            {item.effect.type === "crit_chance" && t('critical')}
                            {item.effect.type === "damage_reduction" && t('protection')}
                            {item.effect.type === "hp_regen" && t('hpRegen')}
                          </div>
                          <div className="text-purple-400 mt-0.5">
                            {item.effect.type === "hp_regen" 
                              ? `${item.effect.value} ${t('hpPerSec')} • ${Math.floor(item.duration / 60)} ${t('minutes')}`
                              : `+${item.effect.value}% • ${Math.floor(item.duration / 60)} ${t('minutes')}`
                            }
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const success = usePotion(itemId);
                              if (success) {
                                addLogEntry(`${item?.name || formatItemIdAsName(itemId)} ${t('drankPotion')}`, "loot");
                              }
                              setPendingPotionId(null);
                            }}
                            className="flex-1 px-3 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
                          >
                            {t('drink')}
                          </button>
                          <button
                            onClick={() => setPendingPotionId(null)}
                            className="flex-1 px-3 py-2 text-sm bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors"
                          >
                            {t('cancel')}
                          </button>
                        </div>
                        <button
                          onClick={() => {
                            if (selectedPotion === itemId) {
                              setSelectedPotion(null);
                            } else {
                              setSelectedPotion(itemId);
                            }
                            setPendingPotionId(null);
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-sm rounded-lg font-medium transition-colors flex items-center justify-center gap-2",
                            selectedPotion === itemId
                              ? "bg-red-600 hover:bg-red-500 text-white"
                              : "bg-purple-500/30 hover:bg-purple-500/50 text-purple-200 border border-purple-500/50"
                          )}
                        >
                          {selectedPotion === itemId ? (
                            <>
                              <X className="w-4 h-4" weight="bold" />
                              {t('cancelAutoPotion')}
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4" weight="fill" />
                              {t('selectAutoPotion')}
                            </>
                          )}
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              })}
            
            {/* Empty state */}
            {activeBuffs.length === 0 && Object.entries(inventory).filter(([itemId, qty]) => {
              const item = getItemById(itemId);
              return item?.type === "potion" && qty > 0;
            }).length === 0 && (
              <span className="text-xs text-muted-foreground">{t('noPotion')}</span>
            )}
              </div>
            </div>
            </div>

            {/* Food Row */}
            <div className="flex items-center gap-3 min-w-0">
              {/* Auto-Eat Toggle */}
              <button
                onClick={() => setAutoEatEnabled(!autoEatEnabled)}
                className={cn(
                  "p-2 rounded-lg border transition-all shrink-0",
                  autoEatEnabled
                    ? "bg-amber-500/30 border-amber-500/60 ring-1 ring-amber-500/50"
                    : "bg-muted/20 border-border/50 hover:bg-amber-500/10"
                )}
                title={autoEatEnabled ? t('autoEatOn') : t('autoEatOff')}
                data-testid="btn-auto-eat-bar"
              >
                <Cookie className={cn("w-5 h-5", autoEatEnabled ? "text-amber-400" : "text-muted-foreground")} weight="duotone" />
              </button>
              
              {/* Threshold Slider - Compact */}
              {autoEatEnabled && (
                <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 shrink-0">
                  <span className="text-[10px] text-amber-400 font-medium">%{autoEatThreshold}</span>
                  <Slider
                    value={[autoEatThreshold]}
                    onValueChange={(value) => setAutoEatThreshold(value[0])}
                    min={10}
                    max={90}
                    step={5}
                    className="w-20"
                    data-testid="slider-auto-eat-bar"
                  />
                </div>
              )}
              
              {/* Scrollable Food Container */}
              <div className="flex-1 overflow-x-auto food-scroll-container">
                <div className="flex items-center gap-2 min-w-max">
                  {/* Food Items */}
                  {Object.entries(inventory)
                    .filter(([itemId, qty]) => isFood(itemId) && qty > 0)
                    .map(([itemId, qty]) => {
                      const item = getItemById(itemId);
                      const healAmount = getFoodHealAmount(itemId);
                      const isPendingFood = pendingFoodId === itemId;
                      return (
                        <Popover key={itemId} open={isPendingFood} onOpenChange={(open) => setPendingFoodId(open ? itemId : null)}>
                          <PopoverTrigger asChild>
                            <button
                              className={cn(
                                "relative p-1.5 rounded border-2 transition-all",
                                selectedFood === itemId && autoEatEnabled
                                  ? "bg-amber-500/40 border-amber-400 ring-2 ring-amber-400/50"
                                  : isPendingFood 
                                    ? "bg-amber-500/30 border-amber-500/70 ring-1 ring-amber-500/50" 
                                    : "bg-muted/30 border-border/50 hover:bg-amber-500/20 hover:border-amber-500/50"
                              )}
                              title={`${item?.name || formatItemIdAsName(itemId)} (+${healAmount} HP)`}
                              data-testid={`quick-food-${itemId}`}
                            >
                              <RetryImage 
                                src={getItemImage(itemId)} 
                                alt={item?.name || formatItemIdAsName(itemId)}
                                className="w-7 h-7 object-contain"
                              />
                              <span className="absolute -bottom-1 -right-1 text-[8px] bg-black/80 text-amber-300 px-1 rounded">
                                x{qty}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent 
                            side="bottom" 
                            align="start" 
                            className="w-auto min-w-[180px] bg-card/95 backdrop-blur-sm border-amber-500/50 p-3"
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <RetryImage 
                                src={getItemImage(itemId)} 
                                alt={item?.name || formatItemIdAsName(itemId)}
                                className="w-10 h-10 object-contain rounded-lg bg-amber-500/20 p-1"
                              />
                              <div>
                                <div className="text-sm font-bold text-amber-200">{item?.name || formatItemIdAsName(itemId)}</div>
                                <div className="text-xs text-green-400">+{healAmount} HP • x{qty}</div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => {
                                  const ate = eatFood(itemId);
                                  if (ate) {
                                    addLogEntry(`${item?.name || formatItemIdAsName(itemId)} ${t('ateFood')} ${healAmount} HP!`, "loot");
                                  }
                                  setPendingFoodId(null);
                                }}
                                disabled={currentHitpoints >= maxHitpoints}
                                className="w-full px-3 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                                data-testid={`food-eat-${itemId}`}
                              >
                                {t('eat')}
                              </button>
                              <button
                                onClick={() => {
                                  if (selectedFood === itemId) {
                                    setSelectedFood(null);
                                  } else {
                                    setSelectedFood(itemId);
                                  }
                                  setPendingFoodId(null);
                                }}
                                className={cn(
                                  "w-full px-3 py-2 text-sm rounded-lg font-medium transition-colors flex items-center justify-center gap-2",
                                  selectedFood === itemId
                                    ? "bg-red-600 hover:bg-red-500 text-white"
                                    : "bg-amber-500/30 hover:bg-amber-500/50 text-amber-200 border border-amber-500/50"
                                )}
                                data-testid={`food-auto-select-${itemId}`}
                              >
                                {selectedFood === itemId ? (
                                  <>
                                    <X className="w-4 h-4" weight="bold" />
                                    {t('cancelAutoSelect')}
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4" weight="fill" />
                                    {t('autoSelect')}
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => setPendingFoodId(null)}
                                className="w-full px-3 py-2 text-sm bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors"
                                data-testid={`food-cancel-${itemId}`}
                              >
                                {t('cancel')}
                              </button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      );
                    })}
                  
                  {/* Empty state */}
                  {Object.entries(inventory).filter(([itemId, qty]) => isFood(itemId) && qty > 0).length === 0 && (
                    <span className="text-xs text-muted-foreground">{t('noFood')}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* XP Distribution Panel with Level Bars - Desktop */}
        <div className="grid grid-cols-4 gap-2 px-3 py-3 rounded-lg bg-muted/20 border border-border/30 mb-4">
          {/* Attack */}
          <div className={cn(
            "p-2 rounded-lg border transition-all",
            combatStyle === "attack" ? "bg-red-500/20 border-red-500/50" : "bg-red-500/10 border-red-500/30"
          )}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Sword className="w-4 h-4 text-red-400" weight="duotone" />
                <span className="text-xs font-medium text-red-400">{t('attack')}</span>
              </div>
              <span className={cn("text-xs font-bold", combatStyle === "attack" ? "text-red-400" : "text-red-400/60")}>
                %{combatStyle === "attack" ? "70" : combatStyle === "defence" ? "10" : "33"}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-red-300 w-8">Lv {skills.attack?.level || 1}</span>
              <div className="flex-1 h-1.5 bg-red-900/50 rounded-full overflow-hidden">
                <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${getLevelProgress(skills.attack?.xp || 0)}%` }} />
              </div>
            </div>
            {combatXpRates && (
              <div className="flex items-center justify-between text-[9px] mt-0.5">
                <span className="text-green-400 font-bold font-mono">{formatNumber(combatXpRates.attack)}<span className="text-muted-foreground font-normal">/h</span></span>
                <span className="text-muted-foreground">{fmtXpToNextLevel(skills.attack?.xp || 0, skills.attack?.level || 1)} xp</span>
                <span className="text-amber-400 font-mono">{fmtTimeToLevel(combatXpRates.attack, skills.attack?.xp || 0, skills.attack?.level || 1)}</span>
              </div>
            )}
          </div>
          
          {/* Strength */}
          <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Lightning className="w-4 h-4 text-orange-400" weight="duotone" />
                <span className="text-xs font-medium text-orange-400">{t('strength')}</span>
              </div>
              <span className="text-xs font-bold text-orange-400/80">
                %{combatStyle === "attack" ? "20" : combatStyle === "defence" ? "20" : "34"}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-orange-300 w-8">Lv {skills.strength?.level || 1}</span>
              <div className="flex-1 h-1.5 bg-orange-900/50 rounded-full overflow-hidden">
                <div className="h-full bg-orange-400 rounded-full transition-all" style={{ width: `${getLevelProgress(skills.strength?.xp || 0)}%` }} />
              </div>
            </div>
            {combatXpRates && (
              <div className="flex items-center justify-between text-[9px] mt-0.5">
                <span className="text-green-400 font-bold font-mono">{formatNumber(combatXpRates.strength)}<span className="text-muted-foreground font-normal">/h</span></span>
                <span className="text-muted-foreground">{fmtXpToNextLevel(skills.strength?.xp || 0, skills.strength?.level || 1)} xp</span>
                <span className="text-amber-400 font-mono">{fmtTimeToLevel(combatXpRates.strength, skills.strength?.xp || 0, skills.strength?.level || 1)}</span>
              </div>
            )}
          </div>
          
          {/* Defence */}
          <div className={cn(
            "p-2 rounded-lg border transition-all",
            combatStyle === "defence" ? "bg-blue-500/20 border-blue-500/50" : "bg-blue-500/10 border-blue-500/30"
          )}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-blue-400" weight="duotone" />
                <span className="text-xs font-medium text-blue-400">{t('defence')}</span>
              </div>
              <span className={cn("text-xs font-bold", combatStyle === "defence" ? "text-blue-400" : "text-blue-400/60")}>
                %{combatStyle === "attack" ? "10" : combatStyle === "defence" ? "70" : "33"}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-blue-300 w-8">Lv {skills.defence?.level || 1}</span>
              <div className="flex-1 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${getLevelProgress(skills.defence?.xp || 0)}%` }} />
              </div>
            </div>
            {combatXpRates && (
              <div className="flex items-center justify-between text-[9px] mt-0.5">
                <span className="text-green-400 font-bold font-mono">{formatNumber(combatXpRates.defence)}<span className="text-muted-foreground font-normal">/h</span></span>
                <span className="text-muted-foreground">{fmtXpToNextLevel(skills.defence?.xp || 0, skills.defence?.level || 1)} xp</span>
                <span className="text-amber-400 font-mono">{fmtTimeToLevel(combatXpRates.defence, skills.defence?.xp || 0, skills.defence?.level || 1)}</span>
              </div>
            )}
          </div>
          
          {/* Hitpoints */}
          <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/50">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-green-400" weight="fill" />
                <span className="text-xs font-medium text-green-400">HP</span>
              </div>
              <span className="text-xs font-bold text-green-400">%100</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-green-300 w-8">Lv {skills.hitpoints?.level || 1}</span>
              <div className="flex-1 h-1.5 bg-green-900/50 rounded-full overflow-hidden">
                <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${getLevelProgress(skills.hitpoints?.xp || 0)}%` }} />
              </div>
            </div>
            {combatXpRates && (
              <div className="flex items-center justify-between text-[9px] mt-0.5">
                <span className="text-green-400 font-bold font-mono">{formatNumber(combatXpRates.hitpoints)}<span className="text-muted-foreground font-normal">/h</span></span>
                <span className="text-muted-foreground">{fmtXpToNextLevel(skills.hitpoints?.xp || 0, skills.hitpoints?.level || 1)} xp</span>
                <span className="text-amber-400 font-mono">{fmtTimeToLevel(combatXpRates.hitpoints, skills.hitpoints?.xp || 0, skills.hitpoints?.level || 1)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Left Column - Region & Monster Selection */}
          <div className="xl:col-span-3 space-y-4">
            {/* Region Selector */}
            <Card className="bg-card/50 border-border/50 overflow-hidden">
              <div className={cn(
                "bg-gradient-to-br p-4",
                REGION_COLORS[selectedRegion]?.gradient
              )}>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className={cn("text-2xl", REGION_COLORS[selectedRegion]?.text)}>
                      {REGION_ICONS[selectedRegion]}
                    </span>
                    <h2 className="text-xl font-bold text-white">{selectedRegionData ? getLocalizedRegionName(language, selectedRegionData.id) : ""}</h2>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Badge variant="outline" className="bg-black/30 border-white/30 text-white/90">
                      {t('level')} {selectedRegionData?.levelRange.min}-{selectedRegionData?.levelRange.max}
                    </Badge>
                  </div>
                  <p className="text-white/70 text-xs mt-2">{selectedRegionData ? getLocalizedRegionDescription(language, selectedRegionData.id) : ""}</p>
                </div>
              </div>

              <CardContent className="p-3">
                <ScrollArea className="h-[320px]">
                  <div className="grid grid-cols-2 gap-2 pr-2">
                    {regionMonsters.map(monster => {
                      const colors = REGION_COLORS[monster.region];
                      const membersOnMonster = partyMembersStatus
                        .filter(m => m.currentMonsterId === monster.id && m.currentRegion === selectedRegion && Boolean(m.isInCombat) && m.playerId !== player?.id)
                        .map(m => ({ playerId: m.playerId, playerName: m.playerName || 'Unknown' }));
                      const isPopupOpen = actionPopupMonsterId === monster.id;
                      const scaledHp = monster.maxHitpoints * COMBAT_HP_SCALE;
                      const dangerLevel = maxHitpoints ? calculateDangerLevel(monster.strengthLevel, monster.strengthBonus || 0, maxHitpoints, playerDamageReductionCapped) : 'safe';
                      const monsterName = getLocalizedMonsterName(language, monster.id);
                      const monsterCombatLvl = monster.attackLevel + monster.strengthLevel + monster.defenceLevel;
                      
                      return (
                        <Popover 
                          key={monster.id} 
                          open={isPopupOpen} 
                          onOpenChange={(open) => { 
                            if (!open) { 
                              setActionPopupMonsterId(null); 
                              setActionPopupView('menu'); 
                            } 
                          }}
                        >
                          <PopoverTrigger asChild>
                            <div>
                              <MonsterCard
                                monster={monster}
                                playerCombatLevel={playerCombatLevel}
                                playerMaxHp={maxHitpoints}
                                playerDamageReduction={playerDamageReductionCapped}
                                hpScale={COMBAT_HP_SCALE}
                                isSelected={selectedMonsterId === monster.id}
                                isInCombat={activeCombat?.monsterId === monster.id}
                                colors={colors}
                                variant="default"
                                onClick={() => handleMonsterClick(monster.id)}
                                testId={`monster-card-${monster.id}`}
                                partyMembersOnMonster={membersOnMonster}
                              />
                            </div>
                          </PopoverTrigger>
                          <PopoverContent 
                            className="w-64 p-0 rounded-xl overflow-hidden" 
                            side="right" 
                            align="start"
                            data-testid="monster-action-popup-desktop"
                          >
                            {/* Header */}
                            <div className="flex items-center gap-2 p-2 bg-gradient-to-r from-muted/50 to-transparent border-b border-border/50">
                              <RetryImage 
                                src={getMonsterImage(monster.id)} 
                                alt={monsterName}
                                className="w-10 h-10 rounded-lg object-cover bg-black/30"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-xs truncate">{monsterName}</div>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                  <span>Lv.{monsterCombatLvl}</span>
                                  {dangerLevel === 'canOneShot' && (
                                    <Badge className="text-[8px] py-0 px-1 bg-red-500/30 text-red-300 animate-pulse">!</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {/* Menu View */}
                            {actionPopupView === 'menu' && (
                              <div className="p-2 space-y-1">
                                <button
                                  onClick={() => setActionPopupView('details')}
                                  className="w-full flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                                  data-testid="monster-action-details"
                                >
                                  <Eye className="w-4 h-4 text-blue-400" weight="duotone" />
                                  <span className="font-medium text-xs">{t('monsterActionDetails')}</span>
                                </button>
                                <button
                                  onClick={() => setActionPopupView('loot')}
                                  className="w-full flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                                  data-testid="monster-action-loot"
                                >
                                  <Package className="w-4 h-4 text-amber-400" weight="duotone" />
                                  <span className="font-medium text-xs">{t('monsterActionLoot')}</span>
                                </button>
                                <button
                                  onClick={async () => {
                                    const monsterId = monster.id;
                                    if (dangerLevel === 'canOneShot') {
                                      setActionPopupMonsterId(null);
                                      setActionPopupView('menu');
                                      setDangerousFromPopup(true);
                                      setPendingDangerousMonster(monsterId);
                                      return;
                                    }
                                    if (!autoEatEnabled || !selectedFood) {
                                      pendingAutoEatActionRef.current = async () => {
                                        if (isQueueV2) {
                                          setActionPopupView('duration_queue');
                                        } else {
                                          setActionPopupMonsterId(null);
                                          setActionPopupView('menu');
                                          if (activeCombat) await stopCombat();
                                          await startCombatWithMonster(monsterId);
                                        }
                                      };
                                      setAutoEatWarningMonsterId(monsterId);
                                      setAutoEatWarningOpen(true);
                                      return;
                                    }
                                    if (isQueueV2) {
                                      setActionPopupView('duration_queue');
                                    } else {
                                      setActionPopupMonsterId(null);
                                      setActionPopupView('menu');
                                      if (activeCombat) {
                                        await stopCombat();
                                      }
                                      await startCombatWithMonster(monsterId);
                                    }
                                  }}
                                  className="w-full flex items-center gap-2 p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 transition-colors text-left"
                                  data-testid="monster-action-fight"
                                >
                                  {isQueueV2 && (activeTask || activeCombat) ? (
                                    <>
                                      <ListPlus className="w-4 h-4 text-amber-400" weight="duotone" />
                                      <span className="font-medium text-xs text-amber-300">{t('addToQueue')}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Sword className="w-4 h-4 text-red-400" weight="duotone" />
                                      <span className="font-medium text-xs text-red-300">{t('monsterActionFight')}</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            )}

                            {/* Inline Duration Picker View (Desktop) */}
                            {(actionPopupView === 'duration_start' || actionPopupView === 'duration_queue') && (
                              <div className="p-2">
                                <InlineDurationPicker
                                  onConfirm={async (durationMs) => {
                                    setActionPopupMonsterId(null);
                                    setActionPopupView('menu');
                                    addToQueue({
                                      type: 'combat',
                                      monsterId: monster.id,
                                      name: getLocalizedMonsterName(language, monster.id),
                                      durationMs,
                                    });
                                  }}
                                  onBack={() => setActionPopupView('menu')}
                                  maxAvailableMs={maxQueueTimeMsTotal - getUsedQueueTimeMs(taskQueue, activeTask, activeCombat)}
                                  activityName={monsterName}
                                  mode={(activeTask || activeCombat) ? 'queue' : 'start'}
                                />
                              </div>
                            )}
                            
                            {/* Details View */}
                            {actionPopupView === 'details' && (
                              <div className="p-2">
                                <button
                                  onClick={() => setActionPopupView('menu')}
                                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mb-1.5"
                                >
                                  <CaretLeft className="w-3 h-3" />
                                  {t('back')}
                                </button>
                                <div className="space-y-1 text-[10px]">
                                  <div className="flex justify-between p-1.5 bg-muted/20 rounded">
                                    <span className="text-muted-foreground">HP</span>
                                    <span className="font-medium text-red-400">{scaledHp.toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between p-1.5 bg-muted/20 rounded">
                                    <span className="text-muted-foreground">{t('attack')}</span>
                                    <span className="font-medium">{monster.attackLevel}</span>
                                  </div>
                                  <div className="flex justify-between p-1.5 bg-muted/20 rounded">
                                    <span className="text-muted-foreground">{t('strength')}</span>
                                    <span className="font-medium">{monster.strengthLevel}</span>
                                  </div>
                                  <div className="flex justify-between p-1.5 bg-muted/20 rounded">
                                    <span className="text-muted-foreground">{t('defence')}</span>
                                    <span className="font-medium">{monster.defenceLevel}</span>
                                  </div>
                                  <div className="p-1.5 bg-muted/20 rounded">
                                    <span className="text-muted-foreground text-[9px]">{t('xpReward')}</span>
                                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                                      <Badge variant="outline" className="text-[8px] text-orange-400 py-0 px-0.5">ATK +{monster.xpReward.attack}</Badge>
                                      <Badge variant="outline" className="text-[8px] text-yellow-400 py-0 px-0.5">STR +{monster.xpReward.strength}</Badge>
                                      <Badge variant="outline" className="text-[8px] text-blue-400 py-0 px-0.5">DEF +{monster.xpReward.defence}</Badge>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Loot View */}
                            {actionPopupView === 'loot' && (
                              <div className="p-2">
                                <button
                                  onClick={() => setActionPopupView('menu')}
                                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mb-1.5"
                                >
                                  <CaretLeft className="w-3 h-3" />
                                  {t('back')}
                                </button>
                                <ScrollArea className="max-h-36">
                                  <div className="space-y-1 pr-1">
                                    {(monster.loot || []).map(loot => {
                                      const item = getItemById(loot.itemId);
                                      const itemImg = getItemImage(loot.itemId);
                                      const itemName = translateItemName(loot.itemId, language);
                                      const itemRarity = item?.rarity;
                                      const rarityColor = itemRarity ? RARITY_COLORS[itemRarity] : null;
                                      const isRareDrop = loot.chance < 1;
                                      const isUncommonDrop = loot.chance < 5 && loot.chance >= 1;
                                      return (
                                        <div 
                                          key={loot.itemId}
                                          className={cn(
                                            "p-1.5 rounded border text-[10px]",
                                            isRareDrop && "bg-purple-500/10 border-purple-500/30",
                                            isUncommonDrop && !isRareDrop && "bg-blue-500/10 border-blue-500/30",
                                            !isRareDrop && !isUncommonDrop && "bg-muted/20 border-border/30"
                                          )}
                                        >
                                          <div className="flex items-center justify-between gap-1">
                                            <div className="flex items-center gap-1 min-w-0">
                                              {itemImg ? (
                                                <RetryImage src={itemImg} alt={itemName} className="w-4 h-4 object-contain pixelated flex-shrink-0" />
                                              ) : (
                                                <Package className="w-3 h-3 text-amber-400 flex-shrink-0" weight="fill" />
                                              )}
                                              <span style={rarityColor ? { color: rarityColor } : undefined} className="truncate">{itemName}</span>
                                            </div>
                                            <span className={cn(
                                              "shrink-0",
                                              isRareDrop ? "text-purple-400" : isUncommonDrop ? "text-blue-400" : "text-muted-foreground"
                                            )}>
                                              {loot.chance >= 1 ? `${loot.chance}%` : `1/${Math.round(100/loot.chance)}`}
                                            </span>
                                          </div>
                                          {(loot.minQty !== 1 || loot.maxQty !== 1) && (
                                            <div className="text-[9px] text-muted-foreground mt-0.5">
                                              x{loot.minQty}-{loot.maxQty}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </ScrollArea>
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Center Column - Combat Arena */}
          <div className="xl:col-span-6 space-y-4">
            {/* Monster Panel */}
            <Card className="bg-card/50 border-border/50 min-h-[400px]">
              <CardContent className="p-4">
                {displayMonster ? (
                  <div className="flex flex-col h-full">
                    {/* Monster Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge className={cn(
                          "text-sm",
                          REGION_COLORS[displayMonster.region]?.bg,
                          REGION_COLORS[displayMonster.region]?.text,
                          REGION_COLORS[displayMonster.region]?.border
                        )}>
                          {getLocalizedRegionName(language, displayMonster.region)}
                        </Badge>
                        {(activeCombat || isInPartyCombat) && (
                          <Badge className={cn(
                            "animate-pulse",
                            isInPartyCombat 
                              ? "bg-purple-500/30 text-purple-300 border-purple-500/50" 
                              : "bg-red-500/30 text-red-300 border-red-500/50"
                          )}>
                            {isInPartyCombat ? t('inCombat') + ' (Party)' : t('inCombat')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setShowStatsModal(true)}
                          className="h-8 px-2"
                          data-testid="button-show-stats"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          {t('stats')}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setShowLootModal(true)}
                          className="h-8 px-2"
                          data-testid="button-show-loot"
                        >
                          <Package className="w-4 h-4 mr-1" />
                          {t('loot')}
                        </Button>
                      </div>
                    </div>

                    {/* Monster Name */}
                    <h2 className="text-2xl font-bold text-center mb-2" data-testid="monster-name">
                      {getLocalizedMonsterName(language, displayMonster.id)}
                    </h2>

                    {/* Monster Image with Skill Icons (Desktop) */}
                    <div className="flex-1 flex items-center justify-center py-4 gap-4">
                      {/* Skill Icons - Left Side */}
                      {displayMonster.skills && displayMonster.skills.length > 0 && (
                        <div className="flex flex-col gap-2">
                          {displayMonster.skills.map((skill, idx) => (
                            <SkillDetailPopup key={skill.id || idx} skill={skill} variant="icon" isMonsterSkill />
                          ))}
                        </div>
                      )}
                      
                      {/* Monster Image Wrapper - relative for floating damage, no overflow-hidden */}
                      <div className="relative w-48 h-48">
                        {/* Monster Image Container */}
                        <div 
                          className={cn(
                            "absolute inset-0 rounded-2xl flex items-center justify-center overflow-hidden"
                          )}
                          style={{ background: REGION_COLORS[displayMonster.region]?.radialGradient }}
                        >
                          {/* Show respawn skull only after death animation completes */}
                          {isRespawning && monsterAnimation !== "dying" ? (
                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                              <Skull className="w-20 h-20 opacity-30" weight="duotone" />
                              <RespawnCountdownText startTime={respawnStartTimeRef.current} duration={respawnDurationRef.current} className="text-sm mt-2 opacity-70" />
                            </div>
                          ) : getMonsterImage(displayMonster.id) ? (
                            <RetryImage 
                              src={getMonsterImage(displayMonster.id)} 
                              alt={getLocalizedMonsterName(language, displayMonster.id)}
                              className={cn(
                                "w-full h-full object-contain p-2 relative z-10 pixelated",
                                monsterAnimation === "attacking" && "monster-attacking",
                                monsterAnimation === "hit" && "monster-hit",
                                monsterAnimation === "dying" && "monster-dying",
                                monsterAnimation === "spawning" && "monster-spawning"
                              )}
                              data-testid="monster-image"
                            />
                          ) : (
                            <Skull 
                              className={cn(
                                "w-32 h-32 relative z-10",
                                REGION_COLORS[displayMonster.region]?.text,
                                monsterAnimation === "attacking" && "monster-attacking",
                                monsterAnimation === "hit" && "monster-hit",
                                monsterAnimation === "dying" && "monster-dying",
                                monsterAnimation === "spawning" && "monster-spawning"
                              )} 
                              weight="duotone" 
                            />
                          )}
                        </div>

                        {monsterDebuffEffect && (
                          <div className={cn(
                            "absolute inset-0 rounded-2xl pointer-events-none z-10 transition-all duration-300",
                            monsterDebuffEffect.type === 'stun' && "border-[3px] border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6),inset_0_0_20px_rgba(250,204,21,0.3)] animate-pulse",
                            monsterDebuffEffect.type === 'poison' && "border-[3px] border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.6),inset_0_0_20px_rgba(74,222,128,0.3)] animate-pulse",
                            monsterDebuffEffect.type === 'burn' && "border-[3px] border-orange-400 shadow-[0_0_20px_rgba(251,146,60,0.6),inset_0_0_20px_rgba(251,146,60,0.3)] animate-pulse",
                            monsterDebuffEffect.type === 'armor_break' && "border-[3px] border-red-400 shadow-[0_0_20px_rgba(248,113,113,0.6),inset_0_0_20px_rgba(248,113,113,0.3)] animate-pulse",
                            monsterDebuffEffect.type === 'lifesteal' && "border-[3px] border-purple-400 shadow-[0_0_20px_rgba(192,132,252,0.6),inset_0_0_20px_rgba(192,132,252,0.3)] animate-pulse"
                          )}>
                            <div className={cn(
                              "absolute top-2 right-2 text-sm font-bold px-1.5 py-0.5 rounded-md",
                              monsterDebuffEffect.type === 'stun' && "bg-yellow-500/30 text-yellow-300",
                              monsterDebuffEffect.type === 'poison' && "bg-green-500/30 text-green-300",
                              monsterDebuffEffect.type === 'burn' && "bg-orange-500/30 text-orange-300",
                              monsterDebuffEffect.type === 'armor_break' && "bg-red-500/30 text-red-300",
                              monsterDebuffEffect.type === 'lifesteal' && "bg-purple-500/30 text-purple-300"
                            )}>
                              {monsterDebuffEffect.type === 'stun' && '⚡'}
                              {monsterDebuffEffect.type === 'poison' && '☠'}
                              {monsterDebuffEffect.type === 'burn' && '🔥'}
                              {monsterDebuffEffect.type === 'armor_break' && '💥'}
                              {monsterDebuffEffect.type === 'lifesteal' && '💜'}
                            </div>
                          </div>
                        )}
                        
                        <CombatFloatingLayer ref={combatFloatingDesktopRef} t={t} sizeClass="desktop" />
                        <MonsterFloatingLayer ref={monsterFloatingDesktopRef} sizeClass="desktop" />
                        <PartyLootFloatLayer ref={partyLootDesktopRef} getItemImage={getItemImage} RetryImageComponent={RetryImage} PackageIcon={Package} getItemById={getItemById} translateItemName={translateItemName} language={language} sizeClass="desktop" />
                      </div>
                    </div>

                    {/* Health Bar - Monster (Yellow when using skill) */}
                    <div className="space-y-2 mt-auto">
                      {(() => {
                        const isUsingSkill = monsterSkillActive !== null;
                        const skillStyle = { bg: "bg-yellow-500/10", border: "border-yellow-500/50", barBg: "bg-yellow-950/50", text: "text-yellow-400" };
                        const normalStyle = { bg: "bg-transparent", border: "border-transparent", barBg: "bg-red-950/50", text: "text-red-400" };
                        const style = isUsingSkill ? skillStyle : normalStyle;
                        
                        return (
                          <div className={cn("space-y-1 p-2 rounded-lg transition-colors duration-300", style.bg, style.border)}>
                            <div className="flex justify-between text-sm">
                              <span className={cn("flex items-center gap-1", isUsingSkill ? style.text : "text-muted-foreground")}>
                                {isUsingSkill ? (
                                  <Lightning className="w-4 h-4 animate-pulse" weight="fill" />
                                ) : (
                                  <Heart className="w-4 h-4 text-red-400" weight="fill" />
                                )}
                                {isUsingSkill ? t('usingSkill') : t('health')}
                              </span>
                              <span className={cn("font-medium", style.text)}>
                                {activeCombat 
                                  ? activeCombat.monsterCurrentHp 
                                  : displayMonster.maxHitpoints * COMBAT_HP_SCALE
                                } / {displayMonster.maxHitpoints * COMBAT_HP_SCALE}
                              </span>
                            </div>
                            <Progress 
                              value={activeCombat 
                                ? (activeCombat.monsterCurrentHp / (displayMonster.maxHitpoints * COMBAT_HP_SCALE)) * 100 
                                : 100
                              } 
                              className={cn("h-4 transition-colors duration-300", style.barBg)}
                            />
                            {isUsingSkill && (
                              <div className="text-xs text-yellow-400 font-bold text-center animate-pulse">
                                {monsterSkillActive.name}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Active Debuffs Display (Desktop) */}
                      {combatDebuffs.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2">
                          {combatDebuffs.map((debuff, idx) => {
                            const debuffColors = {
                              stun: { bg: "bg-yellow-500/20", border: "border-yellow-500/50", text: "text-yellow-400" },
                              poison: { bg: "bg-green-500/20", border: "border-green-500/50", text: "text-green-400" },
                              burn: { bg: "bg-orange-500/20", border: "border-orange-500/50", text: "text-orange-400" },
                            };
                            const colors = debuffColors[debuff.type as keyof typeof debuffColors] || debuffColors.burn;
                            const debuffPrefix = debuff.type === "stun" ? `${t('stunned')} (${debuff.stunCyclesRemaining || 0} ${t('turn')})` :
                                                 debuff.type === "poison" ? `${t('poison')}${debuff.stackCount && debuff.stackCount > 1 ? ` x${debuff.stackCount}` : ""}` :
                                                 debuff.type === "burn" ? t('burning') :
                                                 debuff.name;
                            return (
                              <div 
                                key={debuff.id || idx}
                                className={cn(
                                  "px-2.5 py-1 rounded text-xs flex items-center gap-1.5 border",
                                  colors.bg, colors.border, colors.text
                                )}
                                data-testid={`desktop-debuff-${debuff.type}-${idx}`}
                              >
                                {debuff.type === "stun" && <Lightning className="w-3.5 h-3.5" weight="fill" />}
                                {debuff.type === "poison" && <Skull className="w-3.5 h-3.5" weight="fill" />}
                                {debuff.type === "burn" && <Fire className="w-3.5 h-3.5" weight="fill" />}
                                {debuff.type === "stun" ? (
                                  <span className="font-medium">{debuffPrefix}</span>
                                ) : (
                                  <DebuffCountdownText expiresAt={debuff.expiresAt} prefix={debuffPrefix} className="font-medium" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Party Same Monster Bonus Indicator (Desktop) */}
                      {sameMonsterBonus.sameMonsterCount > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2 p-2 bg-purple-500/20 rounded-lg border border-purple-500/30 mt-2 animate-pulse shadow-lg shadow-purple-500/20" data-testid="desktop-party-same-monster-bonus">
                                <Sparkle className="w-4 h-4 text-purple-400" weight="fill" />
                                <UsersThree className="w-4 h-4 text-purple-400" weight="fill" />
                                <span className="text-xs text-purple-300 font-medium">
                                  {t('partySameMonsterPlayers').replace('{count}', String(sameMonsterBonus.sameMonsterCount))}
                                </span>
                                <Badge className="bg-green-500/30 text-green-300 text-xs border border-green-500/40 shadow-sm shadow-green-500/20">
                                  {t('partyDpsBonus').replace('{percent}', String(Math.round(sameMonsterBonus.dpsBonus * 100)))}
                                </Badge>
                                <Badge className="bg-blue-500/30 text-blue-300 text-xs border border-blue-500/40 shadow-sm shadow-blue-500/20">
                                  {t('partyDefenseBonus').replace('{percent}', String(Math.round(sameMonsterBonus.defenseBonus * 100)))}
                                </Badge>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              <p className="font-medium text-purple-300">{t('partyCombatBonusActive')}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {t('partySameMonsterPlayers').replace('{count}', String(sameMonsterBonus.sameMonsterCount))} - {t('partyBonusesApplied')}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      {/* Attack Timers */}
                      {activeCombat && !isRespawning && (
                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              {playerWeaponSkillActive ? (
                                <Lightning className="w-3 h-3 text-yellow-400 animate-pulse" weight="fill" />
                              ) : (
                                <Sword className="w-3 h-3 text-green-400" />
                              )}
                              {playerWeaponSkillActive ? (
                                <span className="text-yellow-400 font-semibold animate-pulse">{playerWeaponSkillActive.name}</span>
                              ) : (
                                t('yourAttack')
                              )}
                            </div>
                            <AttackProgressBar 
                              ref={playerProgressBarDesktopRef}
                              className={cn(
                                "h-2",
                                playerWeaponSkillActive ? "bg-yellow-950/50 shadow-[0_0_8px_rgba(234,179,8,0.4)]" : "bg-green-950/50"
                              )}
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Sword className="w-3 h-3 text-orange-400" />
                              {t('enemyAttack')}
                            </div>
                            <AttackProgressBar 
                              ref={monsterProgressBarDesktopRef}
                              className="h-2 bg-orange-950/50"
                            />
                          </div>
                        </div>
                      )}

                      {/* Respawn Timer */}
                      {isRespawning && (
                        <div className="text-center py-2 bg-muted/20 rounded-lg">
                          <Timer className="w-5 h-5 inline mr-1 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            <RespawnCountdownText startTime={respawnStartTimeRef.current} duration={respawnDurationRef.current} /> {t('respawnIn')}
                          </span>
                        </div>
                      )}

                      {/* Combat Buttons + Idle Timer */}
                      <div className="pt-2 space-y-2">
                        {!activeCombat && hasLowDurabilityEquipment() && (
                          <div className="px-3 py-2 bg-orange-500/20 border border-orange-500/30 rounded-lg text-center">
                            <span className="text-orange-400 text-sm font-medium animate-pulse">
                              ⚠️ {t('equipmentDamaged')}
                            </span>
                          </div>
                        )}
                        {(activeCombat || isInPartyCombat) ? (
                          <>
                            {isQueueV2 && activeCombat?.queueDurationMs ? (
                              <div className="flex justify-center">
                                <QueueCountdownTimer
                                  startTime={activeCombat.combatStartTime}
                                  durationMs={activeCombat.queueDurationMs}
                                  onStop={handleStopCombat}
                                />
                              </div>
                            ) : null}
                            <Button 
                              onClick={handleStopCombat} 
                              variant="destructive" 
                              className="w-full h-12 text-lg"
                              data-testid="button-stop-combat"
                              disabled={isInPartyCombat && !isPartyLeader}
                            >
                              <Stop className="w-5 h-5 mr-2" weight="fill" />
                              {isInPartyCombat ? t('stopPartyCombat') : t('fleeCombat')}
                            </Button>
                            {isInPartyCombat && !isPartyLeader && (
                              <p className="text-xs text-muted-foreground text-center">
                                {language === 'tr' ? 'Sadece parti lideri savaşı durdurabilir' : 'Only party leader can stop combat'}
                              </p>
                            )}
                          </>
                        ) : (
                          <div className="space-y-2 w-full">
                            <Button 
                              onClick={handleStartCombat} 
                              disabled={!selectedMonsterId || currentHitpoints <= 0}
                              className="w-full h-12 text-lg bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500"
                              data-testid="button-start-combat"
                            >
                              <Play className="w-5 h-5 mr-2" weight="fill" />
                              {t('startCombat')}
                            </Button>
                            {currentHitpoints <= 0 && (
                              <div className="p-2 rounded-lg bg-red-500/20 border border-red-500/40 text-center">
                                <p className="text-sm text-red-300">{t('needToEatFood')}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12">
                    <Target className="w-20 h-20 text-muted-foreground/30 mb-4" weight="duotone" />
                    <h3 className="text-xl font-semibold text-muted-foreground">{t('selectMonster')}</h3>
                    <p className="text-sm text-muted-foreground/70 mt-2">
                      {t('selectMonsterHint')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Player Stats Bar - Color changes based on active debuffs */}
            {(() => {
              const activeDebuff = combatDebuffs[0];
              const debuffBarStyles = {
                stun: { bg: "bg-yellow-500/10", border: "border-yellow-500/50", barBg: "bg-yellow-950", text: "text-yellow-400" },
                poison: { bg: "bg-green-500/10", border: "border-green-500/50", barBg: "bg-green-950", text: "text-green-400" },
                burn: { bg: "bg-orange-500/10", border: "border-orange-500/50", barBg: "bg-orange-950", text: "text-orange-400" },
              };
              const normalStyle = { bg: "bg-card/50", border: "border-border/50", barBg: "bg-red-950", text: "text-red-400" };
              const style = activeDebuff ? (debuffBarStyles[activeDebuff.type as keyof typeof debuffBarStyles] || normalStyle) : normalStyle;
              
              return (
                <Card className={cn("transition-colors duration-300", style.bg, style.border)}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className={cn("flex items-center gap-1", style.text)}>
                            {activeDebuff ? (
                              <>
                                {activeDebuff.type === "stun" && <Lightning className="w-4 h-4" weight="fill" />}
                                {activeDebuff.type === "poison" && <Skull className="w-4 h-4" weight="fill" />}
                                {activeDebuff.type === "burn" && <Fire className="w-4 h-4" weight="fill" />}
                              </>
                            ) : (
                              <Heart className="w-4 h-4" weight="fill" />
                            )}
                            HP
                          </span>
                          <span className={style.text}>{currentHitpoints} / {maxHitpoints}</span>
                        </div>
                        <Progress value={(currentHitpoints / maxHitpoints) * 100} className={cn("h-4 transition-colors duration-300", style.barBg)} />
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Sword className="w-3 h-3 text-orange-400" />
                          {attackLevel}
                        </Badge>
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Lightning className="w-3 h-3 text-yellow-400" />
                          {strengthLevel}
                        </Badge>
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Shield className="w-3 h-3 text-blue-400" />
                          {defenceLevel}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Combat Log - Under Monster Panel */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-400" weight="duotone" />
                    {t('combatLog')}
                  </span>
                  <button
                    onClick={() => setShowFormulasInLog(prev => !prev)}
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                      showFormulasInLog ? "bg-purple-500/20 border-purple-500/50 text-purple-300" : "bg-muted/20 border-border/50 text-muted-foreground"
                    )}
                    data-testid="toggle-formulas-desktop"
                  >
                    Advanced
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                {!showFormulasInLog ? (
                <div ref={combatLogScrollRef} className="h-32 overflow-y-auto">
                  <div className="space-y-1 pr-2 font-mono text-[11px]">
                    {combatLog.length === 0 ? (
                      <div className="text-muted-foreground text-center py-4 text-xs">
                        {t('combatLogEmpty')}
                      </div>
                    ) : (
                      combatLog.slice().reverse().map(entry => (
                        <div key={entry.id}>
                        <div 
                          className={cn(
                            "py-0.5 px-1.5 rounded",
                            entry.type === "player_hit" && "text-green-400",
                            entry.type === "player_miss" && "text-gray-400",
                            entry.type === "monster_hit" && "text-red-400",
                            entry.type === "monster_miss" && "text-gray-400",
                            entry.type === "loot" && "text-amber-400 bg-amber-500/10",
                            entry.type === "death" && "text-red-500 bg-red-500/10",
                            entry.type === "victory" && "text-green-500 bg-green-500/10",
                            entry.type === "party_attack" && "text-blue-400 bg-blue-500/10",
                            entry.type === "party_heal" && "text-emerald-400 bg-emerald-500/10",
                            entry.type === "party_damaged" && "text-orange-400 bg-orange-500/10"
                          )}
                        >
                          {entry.message}
                        </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                ) : (
                <div>
                    <div className="flex gap-1 mb-2">
                      {(["formulas", "buffs", "breakdown"] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setFormulaPanelTab(tab)}
                          className={cn(
                            "px-2.5 py-1 rounded text-[10px] font-medium transition-all",
                            formulaPanelTab === tab
                              ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300"
                              : "bg-muted/20 border border-border/30 text-muted-foreground hover:bg-muted/40"
                          )}
                        >
                          {tab === "formulas" ? (language === 'tr' ? "Formüller" : "Formulas") : tab === "buffs" ? (language === 'tr' ? "Bufflar & Bonuslar" : "Buffs & Modifiers") : (language === 'tr' ? "Detaylı Hesaplama" : "Breakdown")}
                        </button>
                      ))}
                    </div>

                    {formulaPanelTab === "formulas" && (
                      <div className="h-32 overflow-y-auto">
                        <div className="space-y-1 pr-2 font-mono text-[10px]">
                          {formulaLog.length === 0 ? (
                            <div className="text-muted-foreground text-center py-4 text-xs">
                              {t('formulasAppearHere')}
                            </div>
                          ) : (
                            [...formulaLog].reverse().map(entry => (
                              <div
                                key={entry.id}
                                className={cn(
                                  "py-1.5 px-2 rounded border",
                                  entry.type === "player_attack" && entry.hit && "bg-green-500/10 border-green-500/30 text-green-300",
                                  entry.type === "player_attack" && !entry.hit && "bg-gray-500/10 border-gray-500/30 text-gray-400",
                                  entry.type === "monster_attack" && entry.hit && "bg-red-500/10 border-red-500/30 text-red-300",
                                  entry.type === "monster_attack" && !entry.hit && "bg-gray-500/10 border-gray-500/30 text-gray-400"
                                )}
                              >
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  {entry.type === "player_attack" ? (
                                    <Sword className="w-3 h-3" weight="duotone" />
                                  ) : (
                                    <Skull className="w-3 h-3" weight="duotone" />
                                  )}
                                  <span className="font-bold">
                                    {entry.hit ? `= ${entry.result}` : "ISKALA"}
                                  </span>
                                </div>
                                <div className="text-[9px] opacity-80 break-all">
                                  {entry.formula}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {formulaPanelTab === "buffs" && (
                      <div className="h-32 overflow-y-auto space-y-2 pr-1">
                        {activeBuffs.length > 0 && (
                          <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
                            <div className="text-[10px] font-medium text-purple-300 mb-1.5">{t('activeBuffs')}</div>
                            <div className="space-y-1">
                              {activeBuffs.map(buff => {
                                const effectLabel = buff.effectType === "attack_boost" ? t('attack') :
                                                   buff.effectType === "strength_boost" ? t('strength') :
                                                   buff.effectType === "defence_boost" ? t('defence') :
                                                   buff.effectType === "crit_chance" ? t('critical') :
                                                   buff.effectType === "damage_reduction" ? t('protection') :
                                                   buff.effectType === "hp_regen" ? t('hpRegen') : "";
                                return (
                                  <div key={buff.potionId} className="flex items-center gap-2 text-[10px]">
                                    <RetryImage src={getItemImage(buff.potionId)} alt="" className="w-5 h-5 object-contain" spinnerClassName="w-3 h-3" />
                                    <span className="text-purple-200 flex-1">{translateItemName(buff.potionId, language)}</span>
                                    <span className="text-cyan-300">+{buff.value}{buff.effectType === "hp_regen" ? "/s" : "%"} {effectLabel}</span>
                                    <BuffCountdownText expiresAt={buff.expiresAt} className="text-amber-300 font-mono" />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {activeBuffs.length === 0 && (
                          <div className="text-muted-foreground text-center py-2 text-[10px]">{language === 'tr' ? 'Aktif buff yok' : 'No active buffs'}</div>
                        )}

                        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                          <div className="text-[10px] font-medium text-cyan-300 mb-1.5">{t('style')}</div>
                          <div className="flex gap-3 text-[10px]">
                            <span className="text-muted-foreground">Mode:</span>
                            <span className={cn("font-medium capitalize", combatStyle === "attack" ? "text-red-400" : combatStyle === "defence" ? "text-blue-400" : "text-green-400")}>{t(combatStyle as any)}</span>
                            <span className="text-orange-300">Dmg: x{combatStyleDamageMod.toFixed(2)}</span>
                            <span className="text-blue-300">Def: x{combatStyleDefenceMod.toFixed(2)}</span>
                            <span className="text-green-300">Acc: x{combatStyleAccuracyMod.toFixed(2)}</span>
                          </div>
                        </div>

                        {weaponBaseItem && (
                          <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
                            <div className="text-[10px] font-medium text-orange-300 mb-1.5">{language === 'tr' ? 'Silah' : 'Weapon'}</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                              <div className="flex justify-between"><span className="text-muted-foreground">Name:</span><span className="text-orange-200">{weaponBaseItem.name}</span></div>
                              {weaponBaseItem.weaponCategory && <div className="flex justify-between"><span className="text-muted-foreground">Type:</span><span className="text-orange-200 capitalize">{weaponBaseItem.weaponCategory}</span></div>}
                              <div className="flex justify-between"><span className="text-muted-foreground">Base Speed:</span><span className="text-amber-300">{baseAttackSpeedMs}ms</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Actual Speed:</span><span className="text-amber-300">{actualAttackSpeedMs}ms</span></div>
                              {totalAttackSpeedBonus > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Speed Bonus:</span><span className="text-green-400">+{totalAttackSpeedBonus}%</span></div>}
                              {equipment.weapon && itemModifications[equipment.weapon]?.addedSkills?.length > 0 && (
                                <div className="col-span-2 flex gap-1 flex-wrap mt-0.5">
                                  <span className="text-muted-foreground">{t('weaponSkillsLabel')}:</span>
                                  {itemModifications[equipment.weapon].addedSkills.map((skill: string, i: number) => (
                                    <Badge key={i} variant="outline" className="text-[9px] py-0 px-1 border-orange-500/40 text-orange-300">{skill}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {(myBonuses?.combatPower || myBonuses?.defensePower) ? (
                          <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                            <div className="text-[10px] font-medium text-green-300 mb-1.5">{t('guild')} Bonuses</div>
                            <div className="flex gap-4 text-[10px]">
                              {myBonuses?.combatPower ? <span className="text-red-300">{language === 'tr' ? 'Savaş Gücü' : 'Combat Power'}: +{myBonuses.combatPower}%</span> : null}
                              {myBonuses?.defensePower ? <span className="text-blue-300">{language === 'tr' ? 'Savunma Gücü' : 'Defense Power'}: +{myBonuses.defensePower}%</span> : null}
                            </div>
                          </div>
                        ) : null}

                        {sameMonsterBonus.sameMonsterCount > 0 && (
                          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
                            <div className="text-[10px] font-medium text-indigo-300 mb-1">{t('party')} Bonus</div>
                            <div className="flex gap-4 text-[10px]">
                              <span className="text-red-300">DPS: +{Math.round(sameMonsterBonus.dpsBonus * 100)}%</span>
                              <span className="text-blue-300">Defense: +{Math.round(sameMonsterBonus.defenseBonus * 100)}%</span>
                              <span className="text-muted-foreground">({sameMonsterBonus.sameMonsterCount} players)</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {formulaPanelTab === "breakdown" && (
                      <div className="h-32 overflow-y-auto space-y-2 pr-1">
                        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30">
                          <div className="text-[10px] font-medium text-red-300 mb-1.5">{language === 'tr' ? 'Hasar Hesaplama' : 'Damage Calculation'}</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono">
                            <div className="flex justify-between"><span className="text-muted-foreground">Base Max Hit:</span><span className="text-red-200">{playerBaseMaxHit}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Str Buff:</span><span className={strengthBuffPercent > 0 ? "text-green-400" : "text-gray-500"}>{strengthBuffPercent > 0 ? `+${strengthBuffPercent}%` : "none"}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Style Dmg Mod:</span><span className="text-orange-300">x{combatStyleDamageMod.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Guild Power:</span><span className={guildCombatPowerMod > 1 ? "text-green-400" : "text-gray-500"}>x{guildCombatPowerMod.toFixed(2)}</span></div>
                            <div className="col-span-2 flex justify-between border-t border-red-500/20 pt-0.5 mt-0.5">
                              <span className="text-red-300 font-medium">Final Hit Range:</span>
                              <span className="text-red-200 font-bold">{playerMinHit} - {playerMaxHit}</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                          <div className="text-[10px] font-medium text-green-300 mb-1.5">{language === 'tr' ? 'İsabet Hesaplama' : 'Accuracy Calculation'}</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono">
                            <div className="flex justify-between"><span className="text-muted-foreground">Base Accuracy:</span><span className="text-green-200">{baseAccuracy}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Atk Buff:</span><span className={attackBuffPercent > 0 ? "text-green-400" : "text-gray-500"}>{attackBuffPercent > 0 ? `+${attackBuffPercent}%` : "none"}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Style Acc Mod:</span><span className="text-orange-300">x{combatStyleAccuracyMod.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Power Ratio:</span><span className="text-cyan-300">x{powerRatioMod.toFixed(3)}</span></div>
                            <div className="col-span-2 flex justify-between border-t border-green-500/20 pt-0.5 mt-0.5">
                              <span className="text-green-300 font-medium">Final Accuracy:</span>
                              <span className="text-green-200 font-bold">{playerAccuracy}</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
                          <div className="text-[10px] font-medium text-blue-300 mb-1.5">{language === 'tr' ? 'Savunma Hesaplama' : 'Defense Calculation'}</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono">
                            <div className="flex justify-between"><span className="text-muted-foreground">Base Evasion:</span><span className="text-blue-200">{baseEvasion}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Def Buff:</span><span className={defenceBuffPercent > 0 ? "text-green-400" : "text-gray-500"}>{defenceBuffPercent > 0 ? `+${defenceBuffPercent}%` : "none"}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Style Def Mod:</span><span className="text-orange-300">x{combatStyleDefenceMod.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Final Evasion:</span><span className="text-blue-200">{playerEvasion}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Dmg Reduction Buff:</span><span className={damageReductionBuffPercent > 0 ? "text-green-400" : "text-gray-500"}>{damageReductionBuffPercent > 0 ? `+${damageReductionBuffPercent}%` : "none"}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Crit Chance:</span><span className="text-purple-300">{((equipmentBonuses.critChance || 0) + critChanceBuffPercent).toFixed(1)}%</span></div>
                            <div className="col-span-2 flex justify-between border-t border-blue-500/20 pt-0.5 mt-0.5">
                              <span className="text-blue-300 font-medium">Final Dmg Reduction:</span>
                              <span className="text-blue-200 font-bold">{(playerDamageReductionCapped * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Stats & Food */}
          <div className="xl:col-span-3 space-y-4">
            {/* Combat Stats Panel */}
            {displayMonster && (
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="w-4 h-4 text-cyan-400" weight="duotone" />
                    {t('combatStats')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  {(() => {
                    const monsterEvasion = calculateEvasionRating(displayMonster.defenceLevel);
                    const hitChanceVsEnemy = calculateHitChance(playerAccuracy, monsterEvasion);
                    const defenseMultiplier = calculateDefenseMultiplier(displayMonster.defenceLevel);
                    const damageReduction = ((1 - defenseMultiplier) * 100).toFixed(1);
                    const avgDamage = ((playerMinHit + playerMaxHit) / 2).toFixed(1);
                    const attacksPerSecond = (1000 / actualAttackSpeedMs).toFixed(2);
                    const dps = (parseFloat(avgDamage) * parseFloat(attacksPerSecond)).toFixed(2);
                    
                    return (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                          <div className="text-[10px] text-muted-foreground mb-0.5">{t('hitRate')}</div>
                          <div className="text-sm font-bold text-cyan-400">%{hitChanceVsEnemy.toFixed(1)}</div>
                        </div>
                        <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
                          <div className="text-[10px] text-muted-foreground mb-0.5">{t('critChance')}</div>
                          <div className="text-sm font-bold text-purple-400">{(equipmentBonuses.critChance || 0).toFixed(1)}%</div>
                        </div>
                        <div className="p-2 rounded-lg bg-pink-500/10 border border-pink-500/30">
                          <div className="text-[10px] text-muted-foreground mb-0.5">{t('critMultiplier')}</div>
                          <div className="text-sm font-bold text-pink-400">x{(1 + (equipmentBonuses.critDamage || 0) / 100).toFixed(2)}</div>
                        </div>
                        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                          <div className="text-[10px] text-muted-foreground mb-0.5">{t('minMaxDamage')}</div>
                          <div className="text-sm font-bold text-green-400">{playerMinHit} - {playerMaxHit}</div>
                        </div>
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                          <div className="text-[10px] text-muted-foreground mb-0.5">{t('avgDamage')}</div>
                          <div className="text-sm font-bold text-emerald-400">{avgDamage}</div>
                        </div>
                        <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                          <div className="text-[10px] text-muted-foreground mb-0.5">{t('attackSpeed')}</div>
                          <div className="text-sm font-bold text-yellow-400">{attacksPerSecond}/{t('seconds')}</div>
                        </div>
                        <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
                          <div className="text-[10px] text-muted-foreground mb-0.5">{t('dps')}</div>
                          <div className="text-sm font-bold text-orange-400">{dps}</div>
                        </div>
                        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
                          <div className="text-[10px] text-muted-foreground mb-0.5">{t('yourDefense')}</div>
                          <div className="text-sm font-bold text-blue-400">%{(playerDamageReductionCapped * 100).toFixed(1)}</div>
                        </div>
                        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30">
                          <div className="text-[10px] text-muted-foreground mb-0.5">{t('enemyDefense')}</div>
                          <div className="text-sm font-bold text-red-400">%{damageReduction}</div>
                        </div>
                        
                        {/* Party Bonus Stats */}
                        {sameMonsterBonus.sameMonsterCount > 0 && (
                          <>
                            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
                              <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
                                <UsersThree className="w-3 h-3 text-purple-400" weight="fill" />
                                {t('party')}
                              </div>
                              <div className="text-sm font-bold text-purple-400">+{sameMonsterBonus.sameMonsterCount}</div>
                            </div>
                            <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                              <div className="text-[10px] text-muted-foreground mb-0.5">DPS</div>
                              <div className="text-sm font-bold text-green-400">+{Math.round(sameMonsterBonus.dpsBonus * 100)}%</div>
                            </div>
                            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
                              <div className="text-[10px] text-muted-foreground mb-0.5">{t('defence')}</div>
                              <div className="text-sm font-bold text-blue-400">+{Math.round(sameMonsterBonus.defenseBonus * 100)}%</div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Loot Drops Panel - Compact Icons with Scroll Indicators */}
            {lootDrops.length > 0 && (
              <Card className="bg-card/50 border-border/50 border-amber-500/30">
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-400" weight="duotone" />
                    {t('droppedItems')}
                    <span className="text-[10px] text-amber-400/70 ml-auto flex items-center gap-0.5">
                      <CaretLeft className="w-3 h-3" />
                      {t('swipe')}
                      <CaretRight className="w-3 h-3" />
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <div className="relative">
                    {lootDrops.length > 6 && (
                      <>
                        <div className="absolute left-0 top-0 bottom-2 w-6 bg-gradient-to-r from-card/90 to-transparent z-10 pointer-events-none" />
                        <div className="absolute right-0 top-0 bottom-2 w-6 bg-gradient-to-l from-card/90 to-transparent z-10 pointer-events-none" />
                      </>
                    )}
                    <div className="loot-scroll-container flex gap-2 overflow-x-auto pb-2 touch-pan-x">
                      {lootDrops.map((drop, index) => {
                        const item = getItemById(drop.itemId);
                        const itemImg = getItemImage(drop.itemId);
                        const parsed = parseItemWithRarity(drop.itemId);
                        const hasRarityBorder = parsed?.rarity;
                        const isGold = drop.itemId === "Gold Coins";
                        const rarityClasses = isGold
                          ? "bg-yellow-500/20 border-yellow-400/70"
                          : hasRarityBorder 
                            ? getItemRarityBgColor(drop.itemId)
                            : "bg-amber-500/10 border-amber-500/50";
                        
                        return (
                          <div
                            key={`desktop-${drop.itemId}-${index}`}
                            onClick={isGold ? undefined : () => openInspect({ name: drop.itemId, quantity: drop.quantity })}
                            className={cn(
                              "flex-shrink-0 w-14 h-14 rounded-lg border-2 transition-all relative flex items-center justify-center",
                              rarityClasses,
                              isGold ? "" : "cursor-pointer hover:scale-105"
                            )}
                            data-testid={`loot-drop-${drop.itemId}`}
                            title={isGold ? `${drop.quantity} ${t('gold')}` : (item?.name || formatItemIdAsName(drop.itemId))}
                          >
                            {itemImg ? (
                              <RetryImage src={itemImg} alt={item?.name || formatItemIdAsName(drop.itemId)} className="w-9 h-9 object-contain pixelated" />
                            ) : (
                              <Package className="w-6 h-6 text-amber-400" weight="fill" />
                            )}
                            {drop.quantity > 1 && (
                              <span className={cn(
                                "absolute -bottom-1 -right-1 bg-black/80 text-[9px] font-bold px-1.5 rounded border",
                                isGold ? "text-yellow-300 border-yellow-500/50" : "text-amber-300 border-amber-500/50"
                              )}>
                                {drop.quantity}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Equipment Panel */}
            <EquipmentPanel 
              equipment={equipment}
              inventory={inventory}
              equipItem={equipItem}
              unequipItem={unequipItem}
              bonuses={equipmentBonuses}
              getSlotDurability={getSlotDurability}
              itemModifications={itemModifications}
              cursedItems={cursedItems}
              compact
              showBonusSummary
              showMasteryWidget
              testIdPrefix="combat"
            />

          </div>

        </div>
      </div>

      {/* Stats Modal */}
      <Dialog open={showStatsModal} onOpenChange={setShowStatsModal}>
        <DialogContent className="max-w-sm" data-testid="modal-monster-stats">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-400" />
              {displayMonster?.name} - {t('stats')}
            </DialogTitle>
          </DialogHeader>
          {displayMonster && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-muted/30 rounded-lg" data-testid="stat-monster-attack">
                  <div className="text-xs text-muted-foreground">{t('attackLevel')}</div>
                  <div className="text-lg font-bold text-orange-400">{displayMonster.attackLevel}</div>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg" data-testid="stat-monster-strength">
                  <div className="text-xs text-muted-foreground">{t('strengthLevel')}</div>
                  <div className="text-lg font-bold text-yellow-400">{displayMonster.strengthLevel}</div>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg" data-testid="stat-monster-defence">
                  <div className="text-xs text-muted-foreground">{t('defenceLevel')}</div>
                  <div className="text-lg font-bold text-blue-400">{displayMonster.defenceLevel}</div>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg" data-testid="stat-monster-combat-level">
                  <div className="text-xs text-muted-foreground">{t('combatLevel')}</div>
                  <div className="text-lg font-bold text-purple-400">
                    {Math.floor((displayMonster.attackLevel + displayMonster.strengthLevel + displayMonster.defenceLevel) / 3)}
                  </div>
                </div>
              </div>
              <div className="border-t border-border/30 pt-3 space-y-2">
                <div className="flex justify-between text-sm" data-testid="stat-monster-hp">
                  <span className="text-muted-foreground">{t('maxHp')}</span>
                  <span className="text-red-400 font-medium">{displayMonster.maxHitpoints * COMBAT_HP_SCALE}</span>
                </div>
                <div className="flex justify-between text-sm" data-testid="stat-monster-max-hit">
                  <span className="text-muted-foreground">{t('maxDamage')}</span>
                  <span className="text-orange-400 font-medium">{calculateMaxHit(displayMonster.strengthLevel, displayMonster.strengthBonus ?? 0) * COMBAT_HP_SCALE}</span>
                </div>
                <div className="flex justify-between text-sm" data-testid="stat-monster-attack-speed">
                  <span className="text-muted-foreground">{t('attackSpeed')}</span>
                  <span className="text-yellow-400 font-medium">{(displayMonster.attackSpeed / 1000).toFixed(1)}s</span>
                </div>
              </div>
              <div className="border-t border-border/30 pt-3">
                <div className="text-xs text-muted-foreground mb-2">{t('xpReward')}</div>
                <div className="flex gap-2 flex-wrap" data-testid="stat-monster-xp-rewards">
                  <Badge variant="outline" className="text-orange-400">{t('attack')}: +{displayMonster.xpReward.attack}</Badge>
                  <Badge variant="outline" className="text-yellow-400">{t('strength')}: +{displayMonster.xpReward.strength}</Badge>
                  <Badge variant="outline" className="text-blue-400">{t('defence')}: +{displayMonster.xpReward.defence}</Badge>
                  <Badge variant="outline" className="text-red-400">HP: +{displayMonster.xpReward.hitpoints}</Badge>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Loot Modal */}
      <Dialog open={showLootModal} onOpenChange={(open) => { setShowLootModal(open); if (!open) setPreviewMonsterId(null); }}>
        <DialogContent className="max-w-sm" data-testid="modal-monster-loot">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-400" />
              {lootModalMonster?.name} - {t('loots')}
            </DialogTitle>
          </DialogHeader>
          {lootModalMonster && (
            <ScrollArea className="max-h-80">
              <div className="space-y-2 pr-2">
                {lootModalMonster.loot.map(loot => {
                  const item = getItemById(loot.itemId);
                  const itemImg = getItemImage(loot.itemId);
                  const itemName = translateItemName(loot.itemId, language);
                  const itemRarity = item?.rarity;
                  const rarityColor = itemRarity ? RARITY_COLORS[itemRarity] : null;
                  const isRareDrop = loot.chance < 1;
                  const isUncommonDrop = loot.chance < 5 && loot.chance >= 1;
                  return (
                    <div 
                      key={loot.itemId}
                      className={cn(
                        "p-3 rounded-lg border",
                        isRareDrop && "bg-purple-500/10 border-purple-500/30",
                        isUncommonDrop && !isRareDrop && "bg-blue-500/10 border-blue-500/30",
                        !isRareDrop && !isUncommonDrop && "bg-muted/20 border-border/30"
                      )}
                      data-testid={`loot-item-${loot.itemId.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {itemImg ? (
                            <RetryImage src={itemImg} alt={itemName} className="w-8 h-8 object-contain pixelated flex-shrink-0" />
                          ) : (
                            <Package className="w-5 h-5 text-amber-400 flex-shrink-0" weight="fill" />
                          )}
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cn(
                              "font-medium truncate",
                              rarityColor || (isRareDrop ? "text-purple-400" : isUncommonDrop ? "text-blue-400" : "")
                            )}>
                              {itemName}
                            </span>
                            {itemRarity && (
                              <Badge className={cn("text-[10px] flex-shrink-0", RARITY_BG_COLORS[itemRarity], rarityColor)}>{itemRarity}</Badge>
                            )}
                            {isRareDrop && !itemRarity && (
                              <Badge className="text-[10px] bg-purple-500/30 text-purple-300 flex-shrink-0">{t("rare")}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={cn(
                            "text-sm font-bold",
                            isRareDrop ? "text-purple-400" : isUncommonDrop ? "text-blue-400" : "text-muted-foreground"
                          )}>
                            {loot.chance < 1 ? `${loot.chance}%` : `${Math.round(loot.chance)}%`}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {loot.minQty === loot.maxQty ? `${loot.minQty} ${t(language, 'quantity')}` : `${loot.minQty}-${loot.maxQty} ${t(language, 'quantity')}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Party Member Detail Dialog */}
      <PartyMemberDetailDialog
        member={selectedPartyMember}
        party={currentParty ?? null}
        currentPlayerId={player?.id}
        isOpen={showMemberDetailDialog}
        onClose={() => {
          setShowMemberDetailDialog(false);
          setSelectedPartyMember(null);
        }}
        onKick={handleKickMember}
      />


      <AlertDialog open={showLeavePartyForCombat} onOpenChange={setShowLeavePartyForCombat}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('leavePartyConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('leavePartyForCombatDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeavePartyAndStartCombat}>
              {t('leaveParty')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={autoEatWarningOpen} onOpenChange={(open) => {
        if (!open) {
          setAutoEatWarningOpen(false);
          setAutoEatWarningMonsterId(null);
          pendingAutoEatActionRef.current = null;
        }
      }}>
        <AlertDialogContent
          className="border-amber-500/50 bg-gradient-to-b from-amber-950/20 to-card"
          onPointerDownOutside={() => {
            setAutoEatWarningOpen(false);
            setAutoEatWarningMonsterId(null);
            pendingAutoEatActionRef.current = null;
          }}
          onEscapeKeyDown={() => {
            setAutoEatWarningOpen(false);
            setAutoEatWarningMonsterId(null);
            pendingAutoEatActionRef.current = null;
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-400 flex items-center gap-2">
              <Cookie className="w-5 h-5" weight="fill" />
              {t('autoEatWarningTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t('autoEatWarningDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const action = pendingAutoEatActionRef.current;
                pendingAutoEatActionRef.current = null;
                setAutoEatWarningOpen(false);
                setAutoEatWarningMonsterId(null);
                await action?.();
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {(activeCombat || activeTask) ? t('addToQueue') : t('continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDangerousMonster} onOpenChange={(open) => !open && setPendingDangerousMonster(null)}>
        <AlertDialogContent className="border-red-500/50 bg-gradient-to-b from-red-950/20 to-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400 flex items-center gap-2">
              <Warning className="w-5 h-5" weight="fill" />
              {t('dangerousMonsterTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t('dangerousMonsterDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDangerousMonster} className="bg-red-600 hover:bg-red-700">
              {t('dangerousMonsterConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {queueDialogMonster && (
        <AddToQueueDialog
          open={!!queueDialogMonster}
          onClose={() => setQueueDialogMonster(null)}
          queueItem={{
            type: 'combat',
            name: queueDialogMonster.name,
            monsterId: queueDialogMonster.id,
            monsterData: {
              maxHp: queueDialogMonster.maxHitpoints,
              attackLevel: queueDialogMonster.attackLevel,
              strengthLevel: queueDialogMonster.strengthLevel,
              defenceLevel: queueDialogMonster.defenceLevel,
              attackBonus: queueDialogMonster.attackBonus,
              strengthBonus: queueDialogMonster.strengthBonus,
              attackSpeed: queueDialogMonster.attackSpeed,
              loot: queueDialogMonster.loot || [],
              xpReward: queueDialogMonster.xpReward || { attack: 0, strength: 0, defence: 0, hitpoints: 0 },
              skills: queueDialogMonster.skills,
            },
          }}
        />
      )}

      {isQueueV2 && durationPickerMonster && (
        <DurationPickerDialog
          open={!!durationPickerMonster}
          onClose={() => { setDurationPickerMonster(null); }}
          onConfirm={async (durationMs) => {
            const monster = durationPickerMonster;
            setDurationPickerMonster(null);
            addToQueue({
              type: 'combat',
              monsterId: monster.id,
              name: getLocalizedMonsterName(language, monster.id),
              durationMs,
            });
          }}
          maxAvailableMs={maxQueueTimeMsTotal - getUsedQueueTimeMs(taskQueue, activeTask, activeCombat)}
          activityName={getLocalizedMonsterName(language, durationPickerMonster.id)}
          mode="queue"
          taskQueue={taskQueue}
          onRemoveFromQueue={removeFromQueue}
        />
      )}

    </>
  );
}
