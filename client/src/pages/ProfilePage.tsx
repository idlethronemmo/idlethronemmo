import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { useGame } from "@/context/GameContext";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useGuild } from "@/context/GuildContext";
import { useToast } from "@/hooks/use-toast";
import { getLevelProgress, getXpForLevel, formatNumber } from "@/lib/gameMath";
import { cn } from "@/lib/utils";
import { Spinner } from "@phosphor-icons/react";
import { EquipmentSlot, EQUIPMENT_SLOTS, getBaseItem, parseItemWithRarity, getItemRarityColor, getItemRarityBgColor, getTotalEquipmentBonus } from "@/lib/items";
import { getItemImage } from "@/lib/itemImages";
import { RetryImage } from "@/components/ui/retry-image";
import { mapWeaponCategoryToMasteryType, MASTERY_TYPE_NAMES, WeaponMasteryType } from "@shared/masterySystem";
import type { TranslationKeys } from "@/lib/i18n";
import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { 
  Axe, 
  FishSimple, 
  Fire, 
  Hammer, 
  CookingPot, 
  Flask,
  User,
  Trophy,
  Sword,
  Shield,
  ShieldStar,
  Clock,
  Star,
  Crown,
  Target,
  Lightning,
  Medal,
  GameController,
  Backpack,
  Heart,
  ArrowUp,
  Sparkle,
  Skull,
  CalendarBlank,
  Timer,
  TrendUp,
  TShirt,
  X,
  Handshake,
  UserPlus,
  UsersThree
} from "@phosphor-icons/react";
import { Pickaxe, MessageSquare } from "lucide-react";
import { useMobile } from "@/hooks/useMobile";
import { useLanguage } from "@/context/LanguageContext";
import { SkillProgressBar } from "@/components/game/SkillProgressBar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getItemById } from "@/lib/items";
import { getSubClass } from "@shared/subClasses";

import avatarKnight from "@/assets/generated_images/pixel_art_knight_portrait.png";
import avatarMage from "@/assets/generated_images/pixel_art_mage_portrait.png";
import avatarArcher from "@/assets/generated_images/pixel_art_archer_portrait.png";
import avatarWarrior from "@/assets/generated_images/pixel_art_warrior_portrait.png";
import avatarRogue from "@/assets/generated_images/pixel_art_rogue_portrait.png";
import avatarHealer from "@/assets/generated_images/pixel_art_healer_portrait.png";
import avatarNecromancer from "@/assets/generated_images/pixel_art_necromancer_portrait.png";
import avatarPaladin from "@/assets/generated_images/pixel_art_paladin_portrait.png";
import avatarBerserker from "@/assets/generated_images/pixel_art_berserker_portrait.png";
import avatarDruid from "@/assets/generated_images/pixel_art_druid_portrait.png";

const AVATAR_IMAGES: Record<string, string> = {
  knight: avatarKnight,
  mage: avatarMage,
  archer: avatarArcher,
  warrior: avatarWarrior,
  rogue: avatarRogue,
  healer: avatarHealer,
  necromancer: avatarNecromancer,
  paladin: avatarPaladin,
  berserker: avatarBerserker,
  druid: avatarDruid,
};

const PREMIUM_BADGE_IDS = ['alpha_upholder'];

const BADGE_RARITY_ORDER = ['rare', 'legendary', 'epic', 'uncommon', 'common'] as const;

const BADGE_RARITY_CONFIG: Record<string, { color: string; bgColor: string; borderColor: string; glowColor?: string }> = {
  common: { color: "text-slate-300", bgColor: "bg-slate-500/20", borderColor: "border-slate-500/50" },
  uncommon: { color: "text-emerald-400", bgColor: "bg-emerald-500/20", borderColor: "border-emerald-500/50" },
  epic: { color: "text-violet-400", bgColor: "bg-violet-500/20", borderColor: "border-violet-500/50" },
  legendary: { color: "text-amber-400", bgColor: "bg-amber-500/20", borderColor: "border-amber-500/50" },
  rare: { color: "text-rose-400", bgColor: "bg-rose-500/20", borderColor: "border-rose-500/50", glowColor: "shadow-rose-500/30" },
};

const BADGE_ICON_MAP: Record<string, any> = {
  star: Star,
  trophy: Trophy,
  medal: Medal,
  crown: Crown,
  sparkle: Sparkle,
  lightning: Lightning,
  flask: Flask,
  "flask-round": Flask,
  globe: GameController,
  bug: Skull,
  "magnifying-glass": Target,
  sword: Sword,
  hammer: Hammer,
  castle: ShieldStar,
  fire: Fire,
  flame: Fire,
  eye: Sparkle,
  coins: Trophy,
  coin: Trophy,
  drop: Heart,
  heart: Heart,
  heart_broken: Heart,
  users: UserPlus,
  timer: Timer,
  clock: Timer,
  calendar: Timer,
  anvil: Hammer,
  snowflake: Star,
  cooking: CookingPot,
  axe: Axe,
  pickaxe: Hammer,
  fish: FishSimple,
  tree: Axe,
  skull: Skull,
  scroll: Star,
  book: Star,
  compass: Target,
  map: Target,
  target: Target,
  chest: ShieldStar,
  door: ShieldStar,
  gift: Star,
  apple: Heart,
  paw: Skull,
  chat: MessageSquare,
  handshake: UserPlus,
  storefront: Trophy,
};

function getTimeLabel(diffMinutes: number, diffHours: number, diffDays: number, t: (key: string) => string): string {
  if (diffMinutes < 60) {
    return `${diffMinutes} ${t('minAgo')}`;
  }
  if (diffHours < 24) {
    return `${diffHours} ${t('hoursAgo')}`;
  }
  return `${diffDays} ${t('daysAgo')}`;
}

function getOnlineStatus(activeTask: any, lastSeen: string | null, t: (key: any) => string): { status: 'working' | 'online' | 'offline'; label: string } {
  if (!lastSeen) {
    if (activeTask) {
      return { status: 'working', label: t('working') };
    }
    return { status: 'offline', label: '' };
  }
  
  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffMs = now.getTime() - lastSeenDate.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  // First check if online (recent heartbeat)
  if (diffMinutes < 2) {
    return { status: 'online', label: 'Online' };
  }
  
  const timeLabel = getTimeLabel(diffMinutes, diffHours, diffDays, t);
  
  // If offline but has active task, show working + time
  if (activeTask) {
    return { status: 'working', label: `${t('working')} • ${timeLabel}` };
  }
  
  // Just offline
  return { status: 'offline', label: timeLabel };
}

const SKILL_CONFIG = {
  woodcutting: { 
    name: "Woodcutting", 
    icon: Axe, 
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
    barColor: "bg-gradient-to-r from-amber-500 to-amber-400"
  },
  mining: { 
    name: "Mining", 
    icon: Pickaxe, 
    color: "text-slate-300",
    bgColor: "bg-slate-500/20",
    barColor: "bg-gradient-to-r from-slate-400 to-slate-300"
  },
  fishing: { 
    name: "Fishing", 
    icon: FishSimple, 
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/20",
    barColor: "bg-gradient-to-r from-cyan-500 to-cyan-400"
  },
  hunting: { 
    name: "Hunting", 
    icon: Target, 
    color: "text-amber-500",
    bgColor: "bg-amber-500/20",
    barColor: "bg-gradient-to-r from-amber-600 to-amber-500"
  },
  crafting: { 
    name: "Crafting", 
    icon: Hammer, 
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
    barColor: "bg-gradient-to-r from-orange-500 to-orange-400"
  },
  cooking: { 
    name: "Cooking", 
    icon: CookingPot, 
    color: "text-rose-400",
    bgColor: "bg-rose-500/20",
    barColor: "bg-gradient-to-r from-rose-500 to-rose-400"
  },
  alchemy: { 
    name: "Alchemy", 
    icon: Flask, 
    color: "text-violet-400",
    bgColor: "bg-violet-500/20",
    barColor: "bg-gradient-to-r from-violet-500 to-violet-400"
  },
  firemaking: { 
    name: "Firemaking", 
    icon: Fire, 
    color: "text-red-400",
    bgColor: "bg-red-500/20",
    barColor: "bg-gradient-to-r from-red-500 to-orange-500"
  }
};

const COMBAT_SKILL_CONFIG = {
  attack: { 
    nameKey: "attack", 
    icon: Sword, 
    color: "text-red-400",
    bgColor: "bg-red-500/20",
    barColor: "bg-gradient-to-r from-red-500 to-red-400"
  },
  strength: { 
    nameKey: "strength", 
    icon: Lightning, 
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
    barColor: "bg-gradient-to-r from-orange-500 to-orange-400"
  },
  defence: { 
    nameKey: "defence", 
    icon: Shield, 
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    barColor: "bg-gradient-to-r from-blue-500 to-blue-400"
  },
  hitpoints: { 
    nameKey: "hitpoints", 
    icon: Heart, 
    color: "text-green-400",
    bgColor: "bg-green-500/20",
    barColor: "bg-gradient-to-r from-green-500 to-green-400"
  }
};

function getEquipmentIcon(slot: EquipmentSlot) {
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

function EquipmentPanel({ 
  equipment, 
  unequipItem, 
  bonuses,
  SLOT_NAMES,
  t,
  getMasteryLevel,
  itemModifications = {},
  cursedItems = []
}: { 
  equipment: Record<EquipmentSlot, string | null>;
  unequipItem: (slot: EquipmentSlot) => void;
  bonuses: { attackBonus?: number; strengthBonus?: number; defenceBonus?: number; accuracyBonus?: number };
  SLOT_NAMES: Record<EquipmentSlot, string>;
  t: (key: keyof TranslationKeys) => string;
  getMasteryLevel: (type: WeaponMasteryType) => number;
  itemModifications?: Record<string, { addedStats: Record<string, number>; addedSkills: string[]; enhancementLevel: number }>;
  cursedItems?: string[];
}) {
  const [tooltip, setTooltip] = useState<{ 
    visible: boolean; 
    x: number; 
    y: number; 
    item: any; 
    rarity: string | null;
    slot: EquipmentSlot | null;
  }>({ visible: false, x: 0, y: 0, item: null, rarity: null, slot: null });

  const handleMouseMove = (e: React.MouseEvent, slot: EquipmentSlot) => {
    const itemId = equipment[slot];
    if (!itemId) return;
    const baseItem = getBaseItem(itemId);
    const { rarity } = parseItemWithRarity(itemId);
    setTooltip({
      visible: true,
      x: e.clientX + 15,
      y: e.clientY + 15,
      item: baseItem,
      rarity,
      slot
    });
  };

  const handleMouseLeave = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border shadow-lg">
      <CardHeader className="border-b border-border/50 bg-muted/20">
        <CardTitle className="flex items-center gap-3 text-xl font-display">
          <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <ShieldStar className="w-5 h-5 text-violet-400" weight="bold" />
          </div>
          {t('equipment')}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="flex flex-wrap justify-center gap-3 mb-4">
          {EQUIPMENT_SLOTS.map(slot => {
            const itemId = equipment[slot];
            const baseItem = itemId ? getBaseItem(itemId) : null;
            const { rarity } = itemId ? parseItemWithRarity(itemId) : { rarity: null };
            const Icon = getEquipmentIcon(slot);
            
            const weaponId = equipment.weapon;
            const weaponBase = weaponId ? getBaseItem(weaponId) : null;
            const isOffHandLocked = slot === 'shield' && weaponBase?.weaponCategory && 
              ['staff', 'bow'].includes(weaponBase.weaponCategory);
            
            return (
              <div 
                key={slot}
                className={cn(
                  "w-16 h-16 rounded-lg border-2 flex items-center justify-center transition-all relative",
                  isOffHandLocked
                    ? "border-zinc-700/50 bg-zinc-800/30"
                    : baseItem 
                      ? (rarity ? getItemRarityBgColor(itemId!) : "border-violet-500/50 bg-violet-500/10")
                      : "border-border bg-card/50 border-dashed"
                )}
                data-testid={`equipment-slot-${slot}`}
                onMouseMove={(e) => handleMouseMove(e, slot)}
                onMouseLeave={handleMouseLeave}
              >
                {isOffHandLocked ? (
                  (() => {
                    const weaponImg = getItemImage(weaponId!);
                    return weaponImg ? (
                      <RetryImage src={weaponImg} alt="Two-handed" loading="lazy" className="w-10 h-10 object-contain pixelated opacity-30 grayscale" />
                    ) : (
                      <Icon className="w-8 h-8 text-zinc-600 opacity-40" weight="fill" />
                    );
                  })()
                ) : baseItem ? (
                  <>
                    {(() => {
                      const itemImg = getItemImage(itemId!);
                      return itemImg ? (
                        <RetryImage src={itemImg} alt={baseItem.name} loading="lazy" className="w-10 h-10 object-contain pixelated" />
                      ) : (
                        <Icon className={cn("w-8 h-8", rarity ? getItemRarityColor(itemId!) : "text-violet-400")} weight="fill" />
                      );
                    })()}
                    {(() => {
                      const enhLevel = itemModifications[itemId!]?.enhancementLevel || 0;
                      if (enhLevel >= 9) return <div className="absolute inset-0 rounded-lg pointer-events-none z-[1] shadow-[inset_0_0_18px_rgba(239,68,68,0.8)] animate-pulse" />;
                      if (enhLevel >= 7) return <div className="absolute inset-0 rounded-lg pointer-events-none z-[1] shadow-[inset_0_0_16px_rgba(6,182,212,0.75)]" />;
                      return null;
                    })()}
                    {itemModifications[itemId!]?.enhancementLevel > 0 && (
                      <div className="absolute top-0 left-0.5 text-[8px] font-bold text-cyan-400 font-mono z-[2]">
                        +{itemModifications[itemId!].enhancementLevel}
                      </div>
                    )}
                    {cursedItems.includes(itemId!) && (
                      <div className="absolute inset-0 rounded-lg border-2 border-red-500/80 pointer-events-none z-[3]">
                        <span className="absolute top-0.5 right-0.5 text-red-500 text-[8px]">☠</span>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-[10px] text-muted-foreground uppercase">{SLOT_NAMES[slot]}</span>
                )}
              </div>
            );
          })}
        </div>
        
        <Separator className="my-4" />
        
        <div className="grid grid-cols-4 gap-2">
          <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-center">
            <div className="text-[10px] text-muted-foreground">{t('attack')}</div>
            <div className="text-sm font-bold text-red-400">+{bonuses.attackBonus || 0}</div>
          </div>
          <div className="p-2 rounded bg-orange-500/10 border border-orange-500/30 text-center">
            <div className="text-[10px] text-muted-foreground">{t('strength')}</div>
            <div className="text-sm font-bold text-orange-400">+{bonuses.strengthBonus || 0}</div>
          </div>
          <div className="p-2 rounded bg-blue-500/10 border border-blue-500/30 text-center">
            <div className="text-[10px] text-muted-foreground">{t('defence')}</div>
            <div className="text-sm font-bold text-blue-400">+{bonuses.defenceBonus || 0}</div>
          </div>
          <div className="p-2 rounded bg-green-500/10 border border-green-500/30 text-center">
            <div className="text-[10px] text-muted-foreground">{t('accuracyBonus')}</div>
            <div className="text-sm font-bold text-green-400">+{bonuses.accuracyBonus || 0}</div>
          </div>
        </div>
      </CardContent>

      {/* Cursor-following Tooltip - rendered via portal */}
      {tooltip.visible && tooltip.item && createPortal(
        <div 
          className="fixed pointer-events-none bg-popover border border-border rounded-lg shadow-2xl p-3 min-w-[180px] max-w-[200px]"
          style={{ 
            left: Math.min(tooltip.x, window.innerWidth - 220), 
            top: Math.min(tooltip.y, window.innerHeight - 200),
            zIndex: 9999 
          }}
        >
          <div className={cn("font-bold text-sm mb-1", tooltip.rarity ? getItemRarityColor(`item (${tooltip.rarity})`) : "")}>
            {tooltip.item.name}
            {tooltip.slot && equipment[tooltip.slot] && itemModifications[equipment[tooltip.slot]!]?.enhancementLevel > 0 && (
              <span className="text-cyan-400 ml-1">+{itemModifications[equipment[tooltip.slot]!].enhancementLevel}</span>
            )}
          </div>
          {tooltip.rarity && (
            <div className={cn("text-xs mb-2", getItemRarityColor(`item (${tooltip.rarity})`))}>
              {tooltip.rarity}
            </div>
          )}
          {tooltip.slot && equipment[tooltip.slot] && itemModifications[equipment[tooltip.slot]!]?.enhancementLevel > 0 && (
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <span className="text-amber-400">✦</span> Enhancement
              </span>
              <span className="text-amber-400 font-bold">+{itemModifications[equipment[tooltip.slot]!].enhancementLevel} ({itemModifications[equipment[tooltip.slot]!].enhancementLevel * 5}%)</span>
            </div>
          )}
          {tooltip.item.stats && (
            <div className="space-y-1 text-xs">
              {tooltip.item.stats.attackBonus && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('attackBonus')}:</span>
                  <span className="text-red-400">+{tooltip.item.stats.attackBonus}</span>
                </div>
              )}
              {tooltip.item.stats.strengthBonus && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('strengthBonus')}:</span>
                  <span className="text-orange-400">+{tooltip.item.stats.strengthBonus}</span>
                </div>
              )}
              {tooltip.item.stats.defenceBonus && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('defenceBonus')}:</span>
                  <span className="text-blue-400">+{tooltip.item.stats.defenceBonus}</span>
                </div>
              )}
              {tooltip.item.stats.accuracyBonus && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('accuracyBonus')}:</span>
                  <span className="text-green-400">+{tooltip.item.stats.accuracyBonus}</span>
                </div>
              )}
            </div>
          )}
          {/* Mastery Requirement Display in Tooltip */}
          {tooltip.item.equipSlot === "weapon" && tooltip.item.masteryRequired && tooltip.item.masteryRequired > 1 && (() => {
            const masteryType = mapWeaponCategoryToMasteryType(tooltip.item.weaponCategory);
            if (!masteryType) return null;
            const playerMasteryLevel = getMasteryLevel(masteryType);
            const meetsRequirement = playerMasteryLevel >= tooltip.item.masteryRequired;
            return (
              <div className={cn(
                "mt-2 pt-2 border-t border-border/30 text-xs",
                meetsRequirement ? "text-purple-400" : "text-red-400"
              )}>
                <div className="flex items-center justify-between gap-2">
                  <span>⚔️ {MASTERY_TYPE_NAMES[masteryType]}:</span>
                  <span className="font-mono">
                    {playerMasteryLevel} / {tooltip.item.masteryRequired}
                  </span>
                </div>
                {!meetsRequirement && (
                  <div className="text-[10px] mt-1">{t('masteryNotMet')}</div>
                )}
              </div>
            );
          })()}
        </div>,
        document.body
      )}
    </Card>
  );
}

const safeStr = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return '';
};

export default function ProfilePage() {
  const { isMobile } = useMobile();
  const { t, language } = useLanguage();
  const params = useParams<{ username?: string }>();
  const { skills: ownSkills, inventory: ownInventory, activeTask: ownActiveTask, player: ownPlayer, equipment, unequipItem, getEquipmentBonuses, getMasteryLevel, itemModifications: ownItemModifications, cursedItems: ownCursedItems, updatePlayerMeta } = useGame();
  const { user: firebaseUser } = useFirebaseAuth();
  const [, navigate] = useLocation();
  const { myGuild, myMembership, sendInvite } = useGuild();
  const { toast } = useToast();
  const [sendingInvite, setSendingInvite] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<any>(null);
  const [createPartyDialogOpen, setCreatePartyDialogOpen] = useState(false);
  const [sendingPartyInvite, setSendingPartyInvite] = useState(false);
  const queryClient = useQueryClient();

  const selectBadgeMutation = useMutation({
    mutationFn: async (badgeId: string | null) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          headers['Authorization'] = `Bearer ${idToken}`;
        } catch (e) {}
      }
      const sessionToken = localStorage.getItem('gameSessionToken');
      if (sessionToken) {
        headers['x-session-token'] = sessionToken;
      }
      const res = await fetch('/api/players/selected-badge', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ badgeId }),
      });
      if (!res.ok) throw new Error('Failed to set badge');
      return res.json();
    },
    onSuccess: (data, badgeId) => {
      updatePlayerMeta({ selectedBadge: badgeId });
      toast({ title: t('success'), duration: 2000 });
    },
  });
  const ownBonuses = getEquipmentBonuses();
  
  const SLOT_NAMES: Record<EquipmentSlot, string> = {
    helmet: t('helmet'),
    amulet: t('amulet'),
    cape: t('cape'),
    weapon: t('weapon'),
    body: t('body'),
    shield: t('shield'),
    legs: t('legs'),
    gloves: t('gloves'),
    boots: t('boots'),
    ring: t('ring')
  };

  const { data: otherPlayer, isLoading } = useQuery({
    queryKey: ['player', params.username],
    queryFn: async () => {
      const response = await fetch(`/api/players/username/${params.username}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Player not found');
      return response.json();
    },
    enabled: !!params.username && params.username !== ownPlayer?.username,
  });

  const isOwnProfile = !params.username || params.username === ownPlayer?.username;
  const displayPlayer = isOwnProfile ? ownPlayer : otherPlayer;
  const selectedChatBadge = (displayPlayer as any)?.selectedBadge;
  
  const canInvite = !isOwnProfile && myGuild && (myMembership?.role === 'leader' || myMembership?.role === 'officer');

  const handleSendInvite = async () => {
    if (!displayPlayer?.id) return;
    setSendingInvite(true);
    try {
      await sendInvite(displayPlayer.id);
      toast({
        title: t('inviteSent'),
        description: `${displayPlayer.username} ${t('guildInviteSent')}`,
      });
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message || t('inviteFailed'),
        variant: "destructive",
      });
    } finally {
      setSendingInvite(false);
    }
  };

  const { data: currentParty } = useQuery({
    queryKey: ['currentParty'],
    queryFn: async () => {
      const response = await fetch('/api/parties/current', { credentials: 'include' });
      if (!response.ok) return null;
      return response.json();
    },
    staleTime: 30000,
    enabled: !isOwnProfile,
  });

  const canPartyInvite = useMemo(() => {
    if (isOwnProfile) return false;
    if (!currentParty) return true; // Not in party — can create one
    const myRole = currentParty.myRole;
    const memberCount = currentParty.members?.length || 1;
    return myRole === 'leader' && memberCount < 5;
  }, [isOwnProfile, currentParty]);

  const handlePartyInvite = async () => {
    if (!displayPlayer?.id) return;
    setSendingPartyInvite(true);
    try {
      let partyId = currentParty?.party?.id;
      if (!partyId) {
        const createRes = await fetch('/api/parties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: `${ownPlayer?.username}'s Party`, isPublic: false, partyType: 'social' }),
        });
        if (!createRes.ok) throw new Error('Failed to create party');
        const createData = await createRes.json();
        partyId = createData.party?.id || createData.id;
        queryClient.invalidateQueries({ queryKey: ['currentParty'] });
      }
      const inviteRes = await fetch(`/api/parties/${partyId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ inviteeId: displayPlayer.id }),
      });
      if (!inviteRes.ok) {
        const err = await inviteRes.json();
        throw new Error(err.message || 'Failed to invite');
      }
      toast({ title: t('inviteSent'), description: `${displayPlayer.username} ${t('guildInviteSent')}` });
      setCreatePartyDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['currentParty'] });
    } catch (error: any) {
      toast({ title: t('error'), description: error.message || t('inviteFailed'), variant: 'destructive' });
    } finally {
      setSendingPartyInvite(false);
    }
  };

  const { data: playerBadges = [] } = useQuery({
    queryKey: ['playerBadges', displayPlayer?.id],
    queryFn: async () => {
      const response = await fetch(`/api/players/${displayPlayer?.id}/badges`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!displayPlayer?.id,
  });

  const dedupedBadges = useMemo(() => {
    try {
      if (!Array.isArray(playerBadges)) return [];
      
      const tierRegex = /^(.+)_t(\d+)$/;
      const highestTierMap = new Map<string, { pb: any; tier: number }>();
      const nonTierBadges: any[] = [];

      for (const pb of playerBadges as any[]) {
        if (!pb || typeof pb !== 'object') continue;
        const badgeId = typeof pb.badge?.id === 'string' ? pb.badge.id : '';
        const match = badgeId.match(tierRegex);
        if (match) {
          const baseId = match[1];
          const tier = parseInt(match[2], 10);
          const existing = highestTierMap.get(baseId);
          if (!existing || tier < existing.tier) {
            highestTierMap.set(baseId, { pb, tier });
          }
        } else {
          nonTierBadges.push(pb);
        }
      }

      return [
        ...nonTierBadges,
        ...Array.from(highestTierMap.values()).map(v => v.pb),
      ];
    } catch {
      return [];
    }
  }, [playerBadges]);

  const skills: Record<string, { xp: number; level: number }> = useMemo(() => {
    try {
      const raw = isOwnProfile ? ownSkills : (otherPlayer?.skills || {});
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const sanitized: Record<string, { xp: number; level: number }> = {};
      for (const [key, val] of Object.entries(raw)) {
        if (val && typeof val === 'object' && !Array.isArray(val) && typeof (val as any).level === 'number') {
          sanitized[key] = { xp: Number((val as any).xp) || 0, level: Number((val as any).level) || 0 };
        }
      }
      return sanitized;
    } catch {
      return {};
    }
  }, [isOwnProfile, ownSkills, otherPlayer?.skills]);
  const inventory: Record<string, number> = isOwnProfile ? ownInventory : (otherPlayer?.inventory || {});
  const activeTask = isOwnProfile ? ownActiveTask : (otherPlayer?.activeTask ?? null);
  const displayEquipment = isOwnProfile ? equipment : (otherPlayer?.equipment || {});
  const displayItemModifications: Record<string, { addedStats: Record<string, number>; addedSkills: string[]; enhancementLevel: number }> = isOwnProfile ? ownItemModifications : (otherPlayer?.itemModifications || {});
  const displayCursedItems: string[] = isOwnProfile ? ownCursedItems : (Array.isArray(otherPlayer?.cursedItems) ? otherPlayer.cursedItems : []);

  const bonuses = useMemo(() => {
    if (isOwnProfile) return ownBonuses;
    return getTotalEquipmentBonus(displayEquipment as Record<EquipmentSlot, string | null>, displayItemModifications);
  }, [isOwnProfile, ownBonuses, displayEquipment, displayItemModifications]);

  const playerSubClass = useMemo(() => {
    try {
      const eq = displayEquipment as Record<string, string | null>;
      const weaponId = eq?.weapon;
      const bodyId = eq?.body;
      
      const weaponItem = typeof weaponId === 'string' ? getItemById(parseItemWithRarity(weaponId).baseId) : null;
      const bodyItem = typeof bodyId === 'string' ? getItemById(parseItemWithRarity(bodyId).baseId) : null;
      
      return getSubClass(weaponItem?.weaponType || null, bodyItem?.armorType || null);
    } catch {
      return {
        name: 'Adventurer',
        baseRole: 'dps',
        color: '#95a5a6',
        icon: '⚔️',
        passive: { name: 'Versatility', description: 'Jack of all trades — no specialized bonus' },
      };
    }
  }, [displayEquipment]);

  if (!isOwnProfile && isLoading) {
    return (
        <div className="flex items-center justify-center h-full">
          <Spinner className="w-12 h-12 text-primary animate-spin" />
        </div>
    );
  }

  if (!isOwnProfile && !otherPlayer) {
    return (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground font-ui">{t('playerNotFound')}</p>
        </div>
    );
  }

  const totalLevel = Object.values(skills).reduce((sum, skill) => sum + skill.level, 0);
  const totalXp = Object.values(skills).reduce((sum, skill) => sum + skill.xp, 0);
  const maxTotalLevel = Object.keys(SKILL_CONFIG).length * 99;
  const inventoryCount = Object.values(inventory).reduce((sum, count) => sum + count, 0);
  const uniqueItems = Object.keys(inventory).length;

  const highestSkill = Object.entries(skills).reduce((highest, [id, skill]) => {
    if (skill.level > highest.level) {
      return { id, ...skill };
    }
    return highest;
  }, { id: "", level: 0, xp: 0 });

  const masteredSkills = Object.values(skills).filter(s => s.level >= 50).length;
  const combatLevel = Math.floor(totalLevel / 7) + 1;

  const player = displayPlayer;
  const onlineStatus = getOnlineStatus(activeTask, (displayPlayer as any)?.lastSeen, t);
  const isOnline = onlineStatus.status === 'working' || onlineStatus.status === 'online';
  
  // Combat session stats
  const combatStats = (displayPlayer as any)?.combatSessionStats || {};
  const monstersKilled = combatStats.monstersKilled || 0;
  const actionsCompleted = combatStats.actionsCompleted || inventoryCount;

  return (
    <>
      <div className={cn("space-y-6", isMobile ? "pb-24" : "pb-8")}>
        
        {/* Hero Profile Section */}
        <Card className="bg-gradient-to-br from-primary/10 via-violet-900/20 to-background border-primary/30 overflow-hidden relative shadow-xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          
          <CardContent className="pt-8 pb-8 relative">
            <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
              
              {/* Avatar Section */}
              <div className="relative flex-shrink-0">
                <div className="w-36 h-36 rounded-2xl overflow-hidden border-4 border-primary/50 shadow-2xl shadow-primary/20 bg-gradient-to-br from-primary/20 to-violet-600/20">
                  <img 
                    src={player?.avatar ? AVATAR_IMAGES[player.avatar] || avatarKnight : avatarKnight} 
                    alt="Character Avatar" 
                    className="w-full h-full object-cover"
                    data-testid="img-avatar"
                  />
                </div>
                {isOnline && (
                  <div className={cn(
                    "absolute -bottom-2 -right-2 w-10 h-10 rounded-full border-3 flex items-center justify-center shadow-lg",
                    onlineStatus.status === 'working' 
                      ? "bg-amber-500/30 border-amber-500 shadow-amber-500/30 animate-pulse" 
                      : "bg-green-500/30 border-green-500 shadow-green-500/30"
                  )}>
                    <Lightning className={cn(
                      "w-5 h-5",
                      onlineStatus.status === 'working' ? "text-amber-400" : "text-green-400"
                    )} weight="fill" />
                  </div>
                )}
                <div className="absolute -top-2 -left-2 px-3 py-1 bg-gradient-to-r from-amber-500 to-amber-400 rounded-full text-xs font-bold text-black shadow-lg">
                  <Crown className="w-3 h-3 inline mr-1" weight="fill" />
                  VIP
                </div>
              </div>

              {/* Character Info */}
              <div className="flex-1 text-center lg:text-left space-y-4">
                <div>
                  <h1 className="text-4xl font-display font-bold text-foreground tracking-tight mb-2" data-testid="text-profile-name">
                    {safeStr(player?.username) || "Adventurer"}
                  </h1>
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2">
                    {isMobile ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Badge className="bg-gradient-to-r from-violet-600 to-violet-500 text-white border-0 px-3 py-1 text-sm font-bold cursor-pointer" data-testid="badge-subclass">
                            <Sword className="w-4 h-4 mr-1" weight="bold" />
                            {safeStr(playerSubClass.icon)} {safeStr(playerSubClass.name)}
                          </Badge>
                        </PopoverTrigger>
                        <PopoverContent side="bottom" className="w-64 bg-gray-900/95 border-gray-600/40 p-3">
                          <div className="space-y-1">
                            <p className="font-bold text-sm" style={{ color: playerSubClass.color }}>{safeStr(playerSubClass.name)}</p>
                            <p className="text-xs text-amber-300 font-semibold">{safeStr(playerSubClass.passive?.name)}</p>
                            <p className="text-xs text-gray-300">{safeStr(playerSubClass.passive?.description)}</p>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className="bg-gradient-to-r from-violet-600 to-violet-500 text-white border-0 px-3 py-1 text-sm font-bold cursor-help" data-testid="badge-subclass">
                              <Sword className="w-4 h-4 mr-1" weight="bold" />
                              {safeStr(playerSubClass.icon)} {safeStr(playerSubClass.name)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <div className="space-y-1">
                              <p className="font-bold text-sm" style={{ color: playerSubClass.color }}>{safeStr(playerSubClass.name)}</p>
                              <p className="text-xs text-amber-300 font-semibold">{safeStr(playerSubClass.passive?.name)}</p>
                              <p className="text-xs text-muted-foreground">{safeStr(playerSubClass.passive?.description)}</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10">
                      <Medal className="w-4 h-4 mr-1" weight="bold" />
                      Level {combatLevel}
                    </Badge>
                    {onlineStatus.label && (
                      <Badge className={cn(
                        onlineStatus.status === 'working' 
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/50 animate-pulse" 
                          : onlineStatus.status === 'online'
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
                            : "bg-muted/50 text-muted-foreground border-muted"
                      )}>
                        <GameController className="w-4 h-4 mr-1" weight="bold" />
                        {safeStr(onlineStatus.label)}
                      </Badge>
                    )}
                    {!isOwnProfile && isOnline && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-primary/50 text-primary hover:bg-primary/10"
                        onClick={() => navigate('/trade')}
                        disabled={false}
                        data-testid="button-profile-trade"
                      >
                        <Handshake className="w-4 h-4 mr-1" weight="bold" />
                        {t('tradeBtn')}
                      </Button>
                    )}
                    {canInvite && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                        onClick={handleSendInvite}
                        disabled={sendingInvite}
                        data-testid="button-profile-invite"
                      >
                        <UserPlus className="w-4 h-4 mr-1" weight="bold" />
                        {t('inviteToGuild')}
                      </Button>
                    )}
                    {canPartyInvite && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => currentParty ? handlePartyInvite() : setCreatePartyDialogOpen(true)}
                        disabled={sendingPartyInvite}
                        data-testid="button-profile-party-invite"
                      >
                        {sendingPartyInvite
                          ? <Spinner className="w-4 h-4 mr-1 animate-spin" />
                          : <UsersThree className="w-4 h-4 mr-1" weight="bold" />
                        }
                        {t('inviteToParty')}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Quick Stats Row */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Star className="w-5 h-5 text-amber-500" weight="bold" />
                    <span className="font-ui">Total Level: <span className="text-foreground font-bold">{totalLevel}</span></span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Target className="w-5 h-5 text-sky-500" weight="bold" />
                    <span className="font-ui">Total XP: <span className="text-foreground font-bold">{formatNumber(totalXp)}</span></span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Backpack className="w-5 h-5 text-orange-500" weight="bold" />
                    <span className="font-ui">Items: <span className="text-foreground font-bold">{inventoryCount}</span></span>
                  </div>
                </div>

                {/* Total Level Progress */}
                <div className="max-w-lg mx-auto lg:mx-0">
                  <div className="flex justify-between text-xs font-ui mb-2">
                    <span className="text-muted-foreground">Overall Progress</span>
                    <span className="font-bold">{totalLevel} / {maxTotalLevel}</span>
                  </div>
                  <Progress 
                    value={(totalLevel / maxTotalLevel) * 100} 
                    className="h-3 bg-black/40"
                    indicatorClassName="bg-gradient-to-r from-primary via-violet-500 to-purple-500"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className={cn("grid gap-4", isMobile ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
          <Card className="bg-gradient-to-br from-amber-500/15 to-amber-500/5 border-amber-500/30 shadow-lg hover:shadow-amber-500/10 transition-shadow">
            <CardContent className="pt-5 pb-5 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                <Trophy className="w-7 h-7 text-amber-400" weight="bold" />
              </div>
              <div className="text-3xl font-display font-bold text-foreground" data-testid="stat-total-level">{totalLevel}</div>
              <div className="text-xs font-ui text-muted-foreground uppercase tracking-wider mt-1">Total Level</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-violet-500/15 to-violet-500/5 border-violet-500/30 shadow-lg hover:shadow-violet-500/10 transition-shadow">
            <CardContent className="pt-5 pb-5 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                <Sword className="w-7 h-7 text-violet-400" weight="bold" />
              </div>
              <div className="text-3xl font-display font-bold text-foreground" data-testid="stat-combat">{combatLevel}</div>
              <div className="text-xs font-ui text-muted-foreground uppercase tracking-wider mt-1">Combat Level</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 border-emerald-500/30 shadow-lg hover:shadow-emerald-500/10 transition-shadow">
            <CardContent className="pt-5 pb-5 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <TrendUp className="w-7 h-7 text-emerald-400" weight="bold" />
              </div>
              <div className="text-3xl font-display font-bold text-foreground" data-testid="stat-mastered">{masteredSkills}</div>
              <div className="text-xs font-ui text-muted-foreground uppercase tracking-wider mt-1">Skills 50+</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-cyan-500/15 to-cyan-500/5 border-cyan-500/30 shadow-lg hover:shadow-cyan-500/10 transition-shadow">
            <CardContent className="pt-5 pb-5 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                <Backpack className="w-7 h-7 text-cyan-400" weight="bold" />
              </div>
              <div className="text-3xl font-display font-bold text-foreground" data-testid="stat-items">{uniqueItems}</div>
              <div className="text-xs font-ui text-muted-foreground uppercase tracking-wider mt-1">Unique Items</div>
            </CardContent>
          </Card>
        </div>

        {/* Badges Section */}
        {dedupedBadges.length > 0 && (
          <Card className="bg-card/80 backdrop-blur-sm border-border shadow-lg" data-testid="badges-section">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="flex items-center gap-3 text-xl font-display">
                <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <Medal className="w-5 h-5 text-violet-400" weight="bold" />
                </div>
                {t('badges')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              {BADGE_RARITY_ORDER.map(rarity => {
                const badgesInRarity = dedupedBadges.filter((pb: any) => {
                  const r = pb.badge?.rarity || 'common';
                  return r === rarity;
                });
                if (badgesInRarity.length === 0) return null;
                
                const rarityConfig = BADGE_RARITY_CONFIG[rarity] || BADGE_RARITY_CONFIG.common;
                const rarityLabel = { rare: "Rare", legendary: "Legendary", epic: "Epic", uncommon: "Uncommon", common: "Common" }[rarity] || rarity;
                
                return (
                  <div key={rarity}>
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkle className={cn("w-4 h-4", rarityConfig.color)} weight="fill" />
                      <span className={cn("text-sm font-display font-bold uppercase tracking-wider", rarityConfig.color)}>
                        {rarityLabel}
                      </span>
                      <div className={cn("flex-1 h-px", rarityConfig.bgColor)} />
                    </div>
                    <div className={cn(
                      "grid gap-3",
                      isMobile ? "grid-cols-3" : "grid-cols-4 lg:grid-cols-6"
                    )}>
                      {badgesInRarity.map((pb: any) => {
                        const badge = pb.badge;
                        const badgeRarityConfig = BADGE_RARITY_CONFIG[badge.rarity] || BADGE_RARITY_CONFIG.common;
                        const BadgeIcon = BADGE_ICON_MAP[badge.icon] || Star;
                        const isPremium = PREMIUM_BADGE_IDS.includes(badge.id);
                        return (
                              <button
                                key={pb.id}
                                className={cn(
                                  "relative flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all hover:scale-[1.05] cursor-pointer",
                                  isPremium
                                    ? "bg-gradient-to-br from-amber-500/25 to-yellow-500/15 border-amber-400/70 shadow-lg shadow-amber-500/30"
                                    : cn(badgeRarityConfig.bgColor, badgeRarityConfig.borderColor),
                                  badge.rarity === 'rare' && !isPremium && badgeRarityConfig.glowColor && `shadow-lg ${badgeRarityConfig.glowColor}`
                                )}
                                style={isPremium ? {
                                  animation: 'premium-badge-glow 2s ease-in-out infinite alternate',
                                } : undefined}
                                onClick={() => setSelectedBadge(pb)}
                                data-testid={`badge-${badge.id}`}
                              >
                                {isPremium && (
                                  <div className="absolute -top-2 -left-2 text-sm z-10">👑</div>
                                )}
                                <div className={cn(
                                  "w-14 h-14 shrink-0 rounded-lg flex items-center justify-center border overflow-hidden",
                                  isPremium
                                    ? "bg-amber-500/20 border-amber-400/50"
                                    : cn(badgeRarityConfig.bgColor, badgeRarityConfig.borderColor)
                                )}>
                                  {badge.imageUrl ? (
                                    <RetryImage src={badge.imageUrl} alt={safeStr(badge.name)} className="w-full h-full object-cover" />
                                  ) : (
                                    <BadgeIcon className={cn("w-7 h-7", isPremium ? "text-amber-300" : badgeRarityConfig.color)} weight="fill" />
                                  )}
                                </div>
                                {selectedChatBadge === badge.id && (
                                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                    <MessageSquare className="w-2.5 h-2.5 text-primary-foreground" />
                                  </div>
                                )}
                                <div className={cn("font-display font-bold text-xs text-center leading-tight", isPremium ? "text-amber-300" : badgeRarityConfig.color)}>
                                  {safeStr(badge.nameTranslations?.[language]) || safeStr(badge.name)}
                                </div>
                              </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Equipment Section */}
        <EquipmentPanel 
          equipment={displayEquipment} 
          unequipItem={isOwnProfile ? unequipItem : () => {}} 
          bonuses={bonuses}
          SLOT_NAMES={SLOT_NAMES}
          t={t}
          getMasteryLevel={getMasteryLevel}
          itemModifications={displayItemModifications}
          cursedItems={displayCursedItems}
        />

        {isOwnProfile && (<>
        {/* Combat Skills Section */}
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-lg">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="flex items-center gap-3 text-xl font-display">
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <Sword className="w-5 h-5 text-red-400" weight="bold" />
              </div>
              {t('combatSkills')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className={cn("grid gap-4", isMobile ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
              {Object.entries(COMBAT_SKILL_CONFIG).map(([skillId, config]) => {
                const skill = skills[skillId] || { xp: 0, level: skillId === 'hitpoints' ? 10 : 1 };
                const Icon = config.icon;

                return (
                  <div 
                    key={skillId}
                    className={cn(
                      "flex flex-col items-center p-4 rounded-xl border transition-all",
                      "border-border bg-card/50 hover:border-primary/30 hover:bg-card"
                    )}
                    data-testid={`profile-combat-skill-${skillId}`}
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center border border-white/10 mb-2",
                      config.bgColor
                    )}>
                      <Icon className={cn("w-6 h-6", config.color)} weight="bold" />
                    </div>
                    <span className="font-display font-bold text-sm mb-1">{t(config.nameKey as keyof TranslationKeys)}</span>
                    <SkillProgressBar
                      level={skill.level}
                      xp={skill.xp}
                      variant="badge"
                      className="mb-2"
                    />
                    <SkillProgressBar
                      level={skill.level}
                      xp={skill.xp}
                      variant="compact"
                      progressClassName={config.barColor}
                      className="w-full text-[10px]"
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Skills Section */}
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-lg">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="flex items-center gap-3 text-xl font-display">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Star className="w-5 h-5 text-primary" weight="bold" />
              </div>
              Skills
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(skills).map(([skillId, skill]) => {
                const config = SKILL_CONFIG[skillId as keyof typeof SKILL_CONFIG];
                if (!config) return null;
                
                const Icon = config.icon;
                const isActive = activeTask?.skillId === skillId;

                return (
                  <div 
                    key={skillId}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border transition-all",
                      isActive 
                        ? "border-emerald-500/50 bg-emerald-500/10 shadow-lg shadow-emerald-500/5" 
                        : "border-border bg-card/50 hover:border-primary/30 hover:bg-card"
                    )}
                    data-testid={`profile-skill-${skillId}`}
                  >
                    <div className={cn(
                      "w-14 h-14 rounded-xl flex items-center justify-center border border-white/10 relative",
                      config.bgColor
                    )}>
                      <Icon className={cn("w-7 h-7", config.color)} weight="bold" />
                      {isActive && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 animate-pulse" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-display font-bold text-base">{config.name}</span>
                        <SkillProgressBar
                          level={skill.level}
                          xp={skill.xp}
                          variant="badge"
                        />
                      </div>
                      
                      <SkillProgressBar
                        level={skill.level}
                        xp={skill.xp}
                        variant="compact"
                        progressClassName={config.barColor}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Statistics & Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Game Statistics */}
          <Card className="bg-card/80 backdrop-blur-sm border-border shadow-lg">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="flex items-center gap-3 text-lg font-display">
                <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20">
                  <Target className="w-5 h-5 text-sky-400" weight="bold" />
                </div>
                Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-3">
                    <Star className="w-5 h-5 text-amber-400" weight="bold" />
                    <span className="font-ui text-sm">Total XP Earned</span>
                  </div>
                  <span className="font-mono font-bold text-foreground">{formatNumber(totalXp)}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-3">
                    <Backpack className="w-5 h-5 text-orange-400" weight="bold" />
                    <span className="font-ui text-sm">Items Collected</span>
                  </div>
                  <span className="font-mono font-bold text-foreground">{inventoryCount}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-3">
                    <Skull className="w-5 h-5 text-red-400" weight="bold" />
                    <span className="font-ui text-sm">Monsters Slain</span>
                  </div>
                  <span className="font-mono font-bold text-foreground">{formatNumber(monstersKilled)}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-3">
                    <Timer className="w-5 h-5 text-emerald-400" weight="bold" />
                    <span className="font-ui text-sm">Actions Completed</span>
                  </div>
                  <span className="font-mono font-bold text-foreground">{formatNumber(actionsCompleted)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Highest Skill & Achievements */}
          <Card className="bg-card/80 backdrop-blur-sm border-border shadow-lg">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="flex items-center gap-3 text-lg font-display">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Medal className="w-5 h-5 text-amber-400" weight="bold" />
                </div>
                Achievements
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                
                {/* Highest Skill */}
                {highestSkill.id && (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/15 to-amber-500/5 border border-amber-500/30">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                        <Trophy className="w-6 h-6 text-amber-400" weight="bold" />
                      </div>
                      <div>
                        <div className="text-xs font-ui text-amber-400 uppercase tracking-wider">Highest Skill</div>
                        <div className="font-display font-bold text-foreground">
                          {SKILL_CONFIG[highestSkill.id as keyof typeof SKILL_CONFIG]?.name} - Lv {highestSkill.level}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Achievement Badges */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
                    <Sparkle className="w-6 h-6 mx-auto mb-2 text-violet-400" weight="bold" />
                    <div className="text-xs font-ui text-muted-foreground">Beginner</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center opacity-40">
                    <ArrowUp className="w-6 h-6 mx-auto mb-2 text-emerald-400" weight="bold" />
                    <div className="text-xs font-ui text-muted-foreground">Skilled</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center opacity-40">
                    <Crown className="w-6 h-6 mx-auto mb-2 text-amber-400" weight="bold" />
                    <div className="text-xs font-ui text-muted-foreground">Master</div>
                  </div>
                </div>

                {/* Guild */}
                {isOwnProfile && myGuild && (
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <ShieldStar className="w-6 h-6 text-primary" weight="bold" />
                      </div>
                      <div>
                        <div className="text-xs font-ui text-muted-foreground uppercase tracking-wider">{t('guild')}</div>
                        <div className="font-display font-bold text-foreground">{safeStr(myGuild.name)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        </>)}

      {selectedBadge && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={() => setSelectedBadge(null)}
          data-testid="badge-detail-overlay"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div 
            className={cn(
              "relative w-full max-w-sm rounded-2xl border-2 p-6 shadow-2xl",
              "bg-card",
              (BADGE_RARITY_CONFIG[selectedBadge.badge?.rarity] || BADGE_RARITY_CONFIG.common).borderColor
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setSelectedBadge(null)}
              data-testid="button-close-badge-detail"
            >
              <X size={20} weight="bold" />
            </button>

            {(() => {
              const badge = selectedBadge.badge;
              const rarityConfig = BADGE_RARITY_CONFIG[badge?.rarity] || BADGE_RARITY_CONFIG.common;
              const BadgeIcon = BADGE_ICON_MAP[badge?.icon] || Star;
              const earnedDate = selectedBadge.earnedAt ? new Date(selectedBadge.earnedAt) : null;
              const isPremiumBadge = badge?.id && PREMIUM_BADGE_IDS.includes(badge.id);
              
              const rarityLabels: Record<string, string> = {
                common: "Common",
                uncommon: "Uncommon",
                epic: "Epic",
                rare: "Rare",
                legendary: "Legendary",
              };

              const tierMatch = badge?.id?.match(/^(.+)_t(\d+)$/);
              const baseBadgeId = tierMatch ? tierMatch[1] : null;
              const currentTier = tierMatch ? parseInt(tierMatch[2], 10) : null;
              const allTiersForBase = baseBadgeId
                ? (playerBadges as any[])
                    .filter((pb: any) => {
                      const m = pb.badge?.id?.match(/^(.+)_t(\d+)$/);
                      return m && m[1] === baseBadgeId;
                    })
                    .map((pb: any) => {
                      const m = pb.badge?.id?.match(/^(.+)_t(\d+)$/);
                      return { tier: parseInt(m![2], 10), name: safeStr(pb.badge?.nameTranslations?.[language]) || safeStr(pb.badge?.name) };
                    })
                    .sort((a: any, b: any) => a.tier - b.tier)
                : [];

              return (
                <div className="flex flex-col items-center text-center gap-4">
                  {isPremiumBadge && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/30 to-yellow-500/20 border border-amber-400/50 text-amber-300 text-xs font-bold">
                      <span>👑</span>
                      <span>Supporter</span>
                    </div>
                  )}
                  <div className={cn(
                    "w-20 h-20 rounded-2xl flex items-center justify-center border-2 overflow-hidden",
                    isPremiumBadge
                      ? "bg-amber-500/20 border-amber-400/60 shadow-lg shadow-amber-500/30"
                      : cn(rarityConfig.bgColor, rarityConfig.borderColor)
                  )}>
                    {badge?.imageUrl ? (
                      <RetryImage src={badge.imageUrl} alt={safeStr(badge?.name)} className="w-full h-full object-cover" />
                    ) : (
                      <BadgeIcon className={cn("w-10 h-10", isPremiumBadge ? "text-amber-300" : rarityConfig.color)} weight="fill" />
                    )}
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className={cn("font-display font-bold text-xl", isPremiumBadge ? "text-amber-300" : rarityConfig.color)}>
                      {safeStr(badge?.nameTranslations?.[language]) || safeStr(badge?.name)}
                    </h3>
                    <div className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border",
                      isPremiumBadge
                        ? "bg-amber-500/20 border-amber-400/50 text-amber-300"
                        : cn(rarityConfig.bgColor, rarityConfig.borderColor, rarityConfig.color)
                    )}>
                      <Sparkle className="w-3 h-3" weight="fill" />
                      {rarityLabels[badge?.rarity] || safeStr(badge?.rarity)}
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {safeStr(badge?.descriptionTranslations?.[language]) || safeStr(badge?.description)}
                  </p>

                  {allTiersForBase.length > 1 && (
                    <div className="w-full text-left space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="text-xs font-ui font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        {language === 'tr' ? 'Kazanılan Tier\'lar' : 'Earned Tiers'}
                      </div>
                      {allTiersForBase.map((t: any) => (
                        <div key={t.tier} className={cn(
                          "flex items-center gap-2 text-xs px-2 py-1 rounded",
                          t.tier === currentTier ? "bg-primary/10 border border-primary/30 font-bold" : "opacity-60"
                        )}>
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            t.tier === currentTier ? "bg-primary" : "bg-muted-foreground"
                          )} />
                          <span className={t.tier === currentTier ? "text-primary" : "text-muted-foreground"}>
                            {safeStr(t.name)}
                          </span>
                          {t.tier === currentTier && (
                            <span className="ml-auto text-primary text-[10px]">★</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {earnedDate && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2 border-t border-border/50 w-full justify-center">
                      <CalendarBlank className="w-3.5 h-3.5" />
                      <span>{earnedDate.toLocaleDateString(language === 'tr' ? 'tr-TR' : language === 'ru' ? 'ru-RU' : language === 'ar' ? 'ar-SA' : language === 'fr' ? 'fr-FR' : language === 'es' ? 'es-ES' : language === 'zh' ? 'zh-CN' : language === 'hi' ? 'hi-IN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                  )}

                  {isOwnProfile && (
                    <Button
                      variant={selectedChatBadge === badge?.id ? "destructive" : "default"}
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => {
                        selectBadgeMutation.mutate(selectedChatBadge === badge?.id ? null : badge?.id);
                        setSelectedBadge(null);
                      }}
                      disabled={selectBadgeMutation.isPending}
                      data-testid={`badge-select-chat-${badge?.id}`}
                    >
                      {selectedChatBadge === badge?.id 
                        ? (language === 'tr' ? 'Sohbetten Kaldır' : 'Remove from Chat')
                        : (language === 'tr' ? 'Sohbette Göster' : 'Use in Chat')
                      }
                    </Button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      </div>

      {/* Party invite confirmation dialog (shown when not in a party) */}
      <AlertDialog open={createPartyDialogOpen} onOpenChange={setCreatePartyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UsersThree className="w-5 h-5 text-emerald-400" weight="fill" />
              {t('inviteToParty')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('createPartyInvite')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setCreatePartyDialogOpen(false)} disabled={sendingPartyInvite}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handlePartyInvite}
              disabled={sendingPartyInvite}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-confirm-party-invite"
            >
              {sendingPartyInvite
                ? <Spinner className="w-4 h-4 mr-2 animate-spin" />
                : <UsersThree className="w-4 h-4 mr-2" weight="fill" />
              }
              {t('createPartyInviteBtn')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
