import { useState, useRef, useEffect } from "react";
import { Heart, Lightning, UsersThree, Crown, SignOut, Check, X, Circle, FishSimple, Flame, Flask, Hammer } from "@phosphor-icons/react";
import { Swords, Pickaxe, TreePine } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import NotificationBell from "./NotificationBell";
import { GoldDisplay } from "@/components/game/GoldDisplay";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { t } from "@/lib/i18n";
import { getSubClass } from "@shared/subClasses";
import { getLocalizedMonsterName, getLocalizedRegionName } from "@/lib/gameTranslations";
import type { Language } from "@/lib/i18n";
import PartyMemberDetailDialog, { PARTY_ROLE_ICONS, PARTY_ROLE_COLORS } from "./PartyMemberDetailDialog";
import type { PartyMemberData } from "./PartyMemberDetailDialog";
import { Sword } from "@phosphor-icons/react";
import { getAuthHeaders } from "@/context/FirebaseAuthContext";

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

const COMPACT_SKILL_ICONS: Record<string, React.ElementType> = {
  mining: Pickaxe,
  woodcutting: TreePine,
  fishing: FishSimple,
  cooking: Flame,
  alchemy: Flask,
  crafting: Hammer,
};

export default function MobileTopHUD() {
  const { currentHitpoints, maxHitpoints, gold, onlinePlayerCount, realOnlineCount, totalLevel, isGuest, player } = useGame();
  const { language } = useLanguage();
  const [partyDropdownOpen, setPartyDropdownOpen] = useState(false);
  const [selectedPartyMember, setSelectedPartyMember] = useState<PartyMemberData | null>(null);
  const [partyMemberDetailOpen, setPartyMemberDetailOpen] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const currentParty = queryClient.getQueryData<any>(["/api/parties/current"]);
  const hasParty = currentParty && currentParty.id;

  const hp = currentHitpoints;
  const maxHp = maxHitpoints;
  const hpPercent = Math.round((hp / maxHp) * 100);
  const memberCount = hasParty ? (currentParty.members?.length || 0) : 0;

  const { data: partyInvites } = useQuery<any[]>({
    queryKey: ['/api/party-invites'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/party-invites", { credentials: 'include', headers });
      return res.json();
    },
    enabled: !!player && !hasParty,
    staleTime: 30000,
  });

  const leavePartyMutation = useMutation({
    mutationFn: async () => {
      if (!currentParty?.id) return;
      await apiRequest("POST", `/api/parties/${currentParty.id}/leave`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parties/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/parties/public'] });
      setPartyDropdownOpen(false);
      toast({ title: t(language, 'leftParty') || (language === 'tr' ? 'Partiden ayrıldın' : 'Left party') });
    },
  });

  const acceptInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      await apiRequest("POST", `/api/party-invites/${inviteId}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parties/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/party-invites'] });
      setPartyDropdownOpen(false);
    },
  });

  const declineInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      await apiRequest("POST", `/api/party-invites/${inviteId}/decline`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/party-invites'] });
    },
  });

  useEffect(() => {
    if (!partyDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setPartyDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [partyDropdownOpen]);

  const handlePartyButtonClick = () => {
    if (partyDropdownOpen) {
      setPartyDropdownOpen(false);
      navigate("/party");
    } else {
      setPartyDropdownOpen(true);
    }
  };

  const getCompactMemberStatus = (member: any) => {
    if (member.isInCombat === 1 && member.currentMonsterId) {
      const monsterName = getLocalizedMonsterName(language as Language, member.currentMonsterId);
      return { icon: Swords, color: member.isOnline !== 1 ? "text-gray-400" : "text-red-400", label: monsterName || (language === 'tr' ? "Savaşta" : "In Combat") };
    }
    if (member.activeTask?.type === 'skill' && member.activeTask.skillType) {
      const SkillIcon = COMPACT_SKILL_ICONS[member.activeTask.skillType] || Circle;
      return { icon: SkillIcon, color: member.isOnline !== 1 ? "text-gray-400" : "text-amber-400", label: member.activeTask.skillType.charAt(0).toUpperCase() + member.activeTask.skillType.slice(1) };
    }
    if (member.isOnline !== 1) {
      return { icon: Circle, color: "text-gray-500", label: language === 'tr' ? "Çevrimdışı" : "Offline" };
    }
    if (member.currentRegion) {
      const regionName = getLocalizedRegionName(language as Language, member.currentRegion);
      return { icon: Circle, color: "text-green-400", label: regionName || member.currentRegion.replace(/_/g, " ") };
    }
    return { icon: Circle, color: "text-green-400", label: language === 'tr' ? "Çevrimiçi" : "Online" };
  };

  return (
    <div 
      className="fixed top-6 left-0 right-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border safe-area-top"
      data-testid="mobile-top-hud"
    >
      <div className="flex items-center justify-between h-12 px-3">
        {onlinePlayerCount > 0 && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/10 rounded-full border border-green-500/20 shrink-0 mr-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-medium text-green-400 whitespace-nowrap">
              {onlinePlayerCount.toLocaleString()}
            </span>
            {realOnlineCount !== null && realOnlineCount !== undefined && (
              <span className="text-[10px] text-muted-foreground ml-0.5">
                ({realOnlineCount})
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-1">
          <Heart className="w-4 h-4 text-red-500 shrink-0" weight="fill" />
          <div className="flex-1 max-w-[80px] h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-300",
                hpPercent > 50 ? "bg-red-500" : hpPercent > 25 ? "bg-orange-500" : "bg-red-700"
              )}
              style={{ width: `${hpPercent}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground min-w-[40px]">
            {hp}/{maxHp}
          </span>
        </div>

        <div className="px-2">
          <GoldDisplay amount={gold} size="sm" />
        </div>

        {!isGuest && (
          <div className="px-1 relative">
            <Button
              ref={buttonRef}
              variant="ghost"
              size="sm"
              className="relative h-8 w-8 p-0"
              onClick={handlePartyButtonClick}
              data-testid="button-mobile-party"
            >
              <UsersThree className={cn("w-4 h-4", hasParty ? "text-violet-400" : "text-muted-foreground")} weight={hasParty ? "fill" : "duotone"} />
              {memberCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[9px] bg-violet-500 text-white border-0 flex items-center justify-center">
                  {memberCount}
                </Badge>
              )}
              {!hasParty && partyInvites && partyInvites.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
              )}
            </Button>
          </div>
        )}

        <div className="px-1">
          <NotificationBell />
        </div>

        <div className="flex items-center gap-1.5 flex-1 justify-end">
          <Lightning className="w-4 h-4 text-primary shrink-0" weight="fill" />
          <span className="text-xs font-mono font-semibold text-primary">
            Lv. {totalLevel}
          </span>
        </div>
      </div>

      {partyDropdownOpen && (
        <>
          <div className="fixed inset-0 z-[49] bg-black/30" onClick={() => setPartyDropdownOpen(false)} />
          <div
            ref={dropdownRef}
            className="absolute top-full right-3 z-50 w-[280px] border border-border/50 bg-background/95 backdrop-blur-md rounded-lg shadow-xl overflow-hidden"
            data-testid="mobile-party-dropdown"
          >
            {hasParty && currentParty.members && currentParty.members.length > 0 ? (
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold truncate">{currentParty.name || (language === 'tr' ? 'Parti' : 'Party')}</span>
                  <span className="text-[10px] text-muted-foreground">{currentParty.members.length}/{currentParty.maxSize || 5}</span>
                </div>
                <div className="space-y-1">
                  {currentParty.members.map((member: any) => {
                    const isLeader = member.playerId === currentParty.leaderId;
                    const subClass = getSubClass(member.cachedWeaponType || null, null);
                    const role = subClass.baseRole === 'hybrid' ? 'dps' : subClass.baseRole;
                    const RoleIcon = PARTY_ROLE_ICONS[role] || Sword;
                    const roleColor = PARTY_ROLE_COLORS[role] || "text-gray-400";
                    const status = getCompactMemberStatus(member);
                    const StatusIcon = status.icon;
                    const avatarSrc = member.avatar ? AVATAR_IMAGES[member.avatar] : null;
                    return (
                      <div key={member.id} className={cn(
                        "flex items-center gap-2 p-1.5 rounded-lg border transition-colors cursor-pointer hover:bg-muted/40",
                        member.playerId === player?.id ? "bg-violet-500/10 border-violet-500/30" : "bg-muted/20 border-border/30"
                      )} data-testid={`party-compact-member-mobile-${member.playerId}`}
                      onClick={() => {
                        setPartyDropdownOpen(false);
                        setSelectedPartyMember(member);
                        setPartyMemberDetailOpen(true);
                      }}>
                        <div className="relative shrink-0">
                          {avatarSrc ? (
                            <img src={avatarSrc} alt={member.username} className="w-7 h-7 rounded-full object-cover border border-border" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                              <RoleIcon className={cn("w-3 h-3", roleColor)} weight="fill" />
                            </div>
                          )}
                          <div className={cn(
                            "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-background",
                            member.isOnline === 1 ? "bg-green-500" : "bg-gray-500"
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-medium truncate">{member.username}</span>
                            {isLeader && <Crown className="w-2.5 h-2.5 text-yellow-400 shrink-0" weight="fill" />}
                          </div>
                          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                            <StatusIcon className={cn("w-2.5 h-2.5 shrink-0", status.color)} />
                            <span className="truncate">{status.label}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-4 border-0 bg-muted/40", roleColor)}>
                            <RoleIcon className="w-2 h-2 mr-0.5" weight="fill" />
                            {subClass.name.length > 10 ? role.toUpperCase() : subClass.name}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5 pt-1 border-t border-border/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 h-7 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => { setPartyDropdownOpen(false); navigate("/party"); }}
                    data-testid="button-mobile-party-manage"
                  >
                    {language === 'tr' ? 'Partiyi Yönet' : 'Manage Party'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    onClick={() => leavePartyMutation.mutate()}
                    disabled={leavePartyMutation.isPending}
                    data-testid="button-mobile-party-leave"
                  >
                    <SignOut className="w-3 h-3 mr-1" />
                    {language === 'tr' ? 'Ayrıl' : 'Leave'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {partyInvites && partyInvites.length > 0 ? (
                  <>
                    <span className="text-xs font-semibold text-amber-400">{language === 'tr' ? 'Bekleyen Davetler' : 'Pending Invites'}</span>
                    <div className="space-y-1">
                      {partyInvites.map((invite: any) => (
                        <div key={invite.id} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-muted/20 border border-border/30">
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{invite.partyName || invite.inviterUsername}</p>
                            <p className="text-[9px] text-muted-foreground">{language === 'tr' ? `${invite.inviterUsername} tarafından` : `from ${invite.inviterUsername}`}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" className="h-5 w-5 p-0 bg-green-600 hover:bg-green-700" onClick={() => acceptInviteMutation.mutate(invite.id)} disabled={acceptInviteMutation.isPending} data-testid={`button-mobile-accept-invite-${invite.id}`}>
                              <Check className="w-3 h-3" weight="bold" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400 hover:bg-red-500/20" onClick={() => declineInviteMutation.mutate(invite.id)} disabled={declineInviteMutation.isPending} data-testid={`button-mobile-decline-invite-${invite.id}`}>
                              <X className="w-3 h-3" weight="bold" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-1">{language === 'tr' ? 'Bir partide değilsin' : 'Not in a party'}</p>
                )}
                <div className="flex items-center gap-1.5 pt-1 border-t border-border/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 h-7 text-[10px]"
                    onClick={() => { setPartyDropdownOpen(false); navigate("/party"); }}
                    data-testid="button-mobile-party-find"
                  >
                    {language === 'tr' ? 'Parti Bul / Oluştur' : 'Find / Create Party'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <PartyMemberDetailDialog
        member={selectedPartyMember}
        party={hasParty ? { leaderId: currentParty.leaderId } : null}
        currentPlayerId={player?.id}
        isOpen={partyMemberDetailOpen}
        onClose={() => {
          setPartyMemberDetailOpen(false);
          setSelectedPartyMember(null);
        }}
      />
    </div>
  );
}
