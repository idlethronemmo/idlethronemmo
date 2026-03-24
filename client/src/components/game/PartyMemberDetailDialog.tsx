import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { getBaseItem, parseItemWithRarity, getItemRarityBgColor } from "@/lib/items";
import type { EquipmentSlot } from "@/lib/items";
import { getItemImage } from "@/lib/itemImages";
import { RetryImage } from "@/components/ui/retry-image";
import { Crown, Shield, Sword, Heart, Star, Lightning, UserCircle, UserMinus } from "@phosphor-icons/react";
import type { PartyRole } from "@shared/schema";
import { useState } from "react";

const PREMIUM_BADGE_IDS = ['alpha_upholder'];

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

export const AVATAR_MAP: Record<string, string> = {
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

export const PARTY_ROLE_ICONS: Record<PartyRole, React.ElementType> = {
  tank: Shield,
  dps: Sword,
  healer: Heart,
  hybrid: Star,
};

export const PARTY_ROLE_COLORS: Record<PartyRole, string> = {
  tank: "text-blue-400",
  dps: "text-red-400",
  healer: "text-green-400",
  hybrid: "text-purple-400",
};

export const PARTY_ROLE_BG_COLORS: Record<PartyRole, string> = {
  tank: "border-blue-500/50 shadow-blue-500/30",
  dps: "border-red-500/50 shadow-red-500/30",
  healer: "border-green-500/50 shadow-green-500/30",
  hybrid: "border-purple-500/50 shadow-purple-500/30",
};

interface ActiveTask {
  type: string;
  skillType?: string;
  actionId?: string;
  startedAt?: number;
}

export interface PartyMemberData {
  id: string;
  playerId: string;
  role: PartyRole;
  position: number;
  isReady: number;
  username: string;
  totalLevel: number;
  avatar?: string;
  isOnline?: number;
  currentRegion?: string | null;
  currentMonsterId?: string | null;
  isInCombat?: number;
  activeTask?: ActiveTask | null;
  cachedWeaponType?: string | null;
  weaponMasteryLevel?: number;
  lastSeen?: string | null;
}

export interface PartyMemberDetails {
  id: string;
  username: string;
  avatar: string;
  totalLevel: number;
  skills: Record<string, { xp: number; level: number }>;
  equipment: Record<string, string | null>;
  gold: number;
  itemModifications?: Record<string, { addedStats: Record<string, number>; addedSkills: string[]; enhancementLevel: number }>;
  cursedItems?: string[];
  selectedBadge?: string | null;
}

interface PartyMemberDetailDialogProps {
  member: PartyMemberData | null;
  party: { leaderId: string } | null;
  currentPlayerId: string | undefined;
  isOpen: boolean;
  onClose: () => void;
  onKick?: (playerId: string) => void;
}

export default function PartyMemberDetailDialog({
  member,
  party,
  currentPlayerId,
  isOpen,
  onClose,
  onKick
}: PartyMemberDetailDialogProps) {
  const { t } = useLanguage();
  const [, navigate] = useLocation();

  const { data: memberDetails, isLoading } = useQuery<PartyMemberDetails | null>({
    queryKey: ["/api/players", member?.playerId],
    queryFn: async () => {
      if (!member?.playerId) return null;
      const res = await apiRequest("GET", `/api/players/${member.playerId}`);
      return res.json();
    },
    enabled: isOpen && !!member?.playerId,
  });

  const [badgeTooltipVisible, setBadgeTooltipVisible] = useState(false);

  if (!member) return null;

  const isLeader = party ? party.leaderId === currentPlayerId : false;
  const isSelf = member.playerId === currentPlayerId;
  const canKick = onKick && isLeader && !isSelf;
  const isMemberLeader = party ? member.playerId === party.leaderId : false;
  const RoleIcon = PARTY_ROLE_ICONS[member.role];
  const avatarSrc = member.avatar && AVATAR_MAP[member.avatar] ? AVATAR_MAP[member.avatar] : avatarKnight;

  const selectedBadge = memberDetails?.selectedBadge;
  const isPremiumBadge = selectedBadge ? PREMIUM_BADGE_IDS.includes(selectedBadge) : false;

  const combatSkills = memberDetails?.skills ? [
    { key: 'attack', icon: Sword, color: 'text-red-400', bgColor: 'bg-red-500/20', level: memberDetails.skills.attack?.level || 1 },
    { key: 'strength', icon: Lightning, color: 'text-orange-400', bgColor: 'bg-orange-500/20', level: memberDetails.skills.strength?.level || 1 },
    { key: 'defence', icon: Shield, color: 'text-blue-400', bgColor: 'bg-blue-500/20', level: memberDetails.skills.defence?.level || 1 },
    { key: 'hitpoints', icon: Heart, color: 'text-green-400', bgColor: 'bg-green-500/20', level: memberDetails.skills.hitpoints?.level || 10 },
  ] : [];

  const equipmentSlots: EquipmentSlot[] = ['helmet', 'amulet', 'cape', 'weapon', 'body', 'shield', 'legs', 'gloves', 'boots', 'ring'];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent aria-describedby={undefined} className={cn(
        "max-w-md bg-gradient-to-b from-card to-card/95 z-[10001] overflow-hidden",
        isPremiumBadge ? "border-amber-500/50" : "border-violet-500/30"
      )}>
        {isPremiumBadge && (
          <div className="absolute inset-0 pointer-events-none z-0 bg-gradient-to-bl from-amber-500/15 via-transparent to-transparent" />
        )}
        <DialogHeader className="relative z-[1]">
          <DialogTitle className="flex items-center gap-3">
            <div className="relative">
              <div className={cn(
                "w-14 h-14 rounded-full border-2 overflow-hidden",
                isPremiumBadge
                  ? "border-amber-400/60 shadow-[0_0_12px_rgba(251,191,36,0.4)]"
                  : PARTY_ROLE_BG_COLORS[member.role]
              )}>
                <img src={avatarSrc} alt={member.username} className="w-full h-full object-cover" />
              </div>
              {isMemberLeader && (
                <Crown className="absolute -top-1 -right-1 w-5 h-5 text-yellow-400 drop-shadow-lg" weight="fill" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  isPremiumBadge && "bg-gradient-to-r from-amber-300 to-yellow-500 bg-clip-text text-transparent font-bold"
                )}>{member.username}</span>
                <Badge variant="outline" className={cn("text-xs", PARTY_ROLE_COLORS[member.role])}>
                  <RoleIcon className="w-3 h-3 mr-1" weight="fill" />
                  {member.role.toUpperCase()}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground font-normal">
                {t('level')} {member.totalLevel}
              </div>
            </div>
            {selectedBadge && (
              <div
                className="relative shrink-0"
                onMouseEnter={() => setBadgeTooltipVisible(true)}
                onMouseLeave={() => setBadgeTooltipVisible(false)}
                data-testid={`badge-icon-${member.playerId}`}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg border-2 overflow-hidden flex items-center justify-center",
                  isPremiumBadge
                    ? "border-amber-400/60 shadow-[0_0_10px_rgba(251,191,36,0.4)] bg-gradient-to-br from-amber-500/20 to-yellow-500/20"
                    : "border-violet-500/40 bg-muted/30"
                )}>
                  <RetryImage
                    src={`/images/badges/${selectedBadge.replace(/_t\d+$/, '')}.webp`}
                    alt={selectedBadge}
                    className="w-full h-full object-cover"
                  />
                </div>
                {badgeTooltipVisible && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 whitespace-nowrap z-50 shadow-lg" data-testid={`badge-tooltip-${member.playerId}`}>
                    {selectedBadge.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </div>
                )}
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 relative z-[1]">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : memberDetails ? (
          <div className="space-y-4 relative z-[1]">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('combatStats')}</h4>
              <div className="grid grid-cols-4 gap-2">
                {combatSkills.map(skill => {
                  const SkillIcon = skill.icon;
                  return (
                    <div
                      key={skill.key}
                      className={cn(
                        "flex flex-col items-center p-2 rounded-lg border border-border/50",
                        skill.bgColor
                      )}
                    >
                      <SkillIcon className={cn("w-5 h-5 mb-1", skill.color)} weight="fill" />
                      <span className="text-lg font-bold">{skill.level}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">{t(skill.key as any)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('equipment')}</h4>
              <div className="grid grid-cols-5 gap-1.5">
                {equipmentSlots.map(slot => {
                  const itemId = memberDetails.equipment?.[slot];
                  const baseItem = itemId ? getBaseItem(itemId) : null;
                  const itemImg = itemId ? getItemImage(itemId) : null;
                  const { rarity } = itemId ? parseItemWithRarity(itemId) : { rarity: null };
                  const mods = itemId && memberDetails.itemModifications ? memberDetails.itemModifications[itemId] : null;
                  const enhLevel = mods?.enhancementLevel || 0;
                  const isCursed = itemId && Array.isArray(memberDetails.cursedItems) && memberDetails.cursedItems.includes(itemId);

                  return (
                    <div
                      key={slot}
                      className={cn(
                        "aspect-square rounded-lg border flex items-center justify-center relative",
                        itemId && rarity
                          ? getItemRarityBgColor(itemId)
                          : "border-border/50 bg-muted/30"
                      )}
                      title={baseItem?.name ? `${baseItem.name}${enhLevel > 0 ? ` +${enhLevel}` : ''}` : t(slot as any)}
                    >
                      {itemImg ? (
                        <RetryImage src={itemImg} alt={baseItem?.name} className="w-[90%] h-[90%] object-contain pixelated" />
                      ) : (
                        <span className="text-[8px] text-muted-foreground uppercase">{t(`${slot}Short` as any)}</span>
                      )}
                      {enhLevel >= 9 && <div className="absolute inset-0 rounded-lg pointer-events-none shadow-[inset_0_0_14px_rgba(239,68,68,0.8)] animate-pulse" />}
                      {enhLevel >= 7 && enhLevel < 9 && <div className="absolute inset-0 rounded-lg pointer-events-none shadow-[inset_0_0_12px_rgba(6,182,212,0.75)]" />}
                      {enhLevel > 0 && (
                        <div className="absolute top-0 left-0.5 text-[7px] font-bold text-cyan-400 font-mono z-[2]">
                          +{enhLevel}
                        </div>
                      )}
                      {isCursed && (
                        <div className="absolute inset-0 rounded-lg border border-red-500/80 pointer-events-none">
                          <span className="absolute top-0 right-0.5 text-red-500 text-[7px]">☠</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {memberDetails?.username && (
              <div className="pt-2 border-t border-border/30">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    navigate(`/profile/${memberDetails.username}`);
                    onClose();
                  }}
                  data-testid={`view-profile-${member.playerId}`}
                >
                  <UserCircle className="w-4 h-4 mr-2" />
                  {t('viewProfile') || 'Profile'}
                </Button>
              </div>
            )}

            {canKick && (
              <div className="pt-2 border-t border-border/30">
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    onKick!(member.playerId);
                    onClose();
                  }}
                  data-testid={`kick-member-${member.playerId}`}
                >
                  <UserMinus className="w-4 h-4 mr-2" weight="bold" />
                  {t('kickFromParty') || 'Kick from Party'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-4">
            {t('playerNotFound')}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
