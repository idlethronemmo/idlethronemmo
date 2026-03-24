import { useGuild } from "@/context/GuildContext";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Check, X, Users, Crown } from "@phosphor-icons/react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function GuildInvitePopup() {
  const { pendingInvites, respondToInvite, isInGuild } = useGuild();
  const { addNotification } = useGame();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const previousInviteIdsRef = useRef<Set<string>>(new Set());

  // Send notification when new invites arrive
  useEffect(() => {
    const currentIds = new Set(pendingInvites.map(i => i.id));
    const prevIds = previousInviteIdsRef.current;
    
    pendingInvites.forEach(invite => {
      if (!prevIds.has(invite.id)) {
        addNotification("guild_invite", t('receivedGuildInvite').replace('{0}', invite.guildName), {
          inviteId: invite.id,
          guildName: invite.guildName,
          inviterName: invite.inviterName
        });
      }
    });
    
    previousInviteIdsRef.current = currentIds;
  }, [pendingInvites, addNotification]);

  if (isInGuild || pendingInvites.length === 0) {
    return null;
  }

  const visibleInvites = pendingInvites.filter(invite => !dismissed.has(invite.id));
  
  if (visibleInvites.length === 0) {
    return null;
  }

  const handleRespond = async (inviteId: string, accept: boolean, guildName?: string) => {
    setRespondingTo(inviteId);
    try {
      await respondToInvite(inviteId, accept);
      toast({
        title: accept ? t('joinedGuild') : t('inviteRejected'),
        description: accept 
          ? t('joinedGuildDesc').replace('{0}', guildName || '') 
          : t('inviteRejectedDesc'),
        variant: accept ? "default" : "destructive",
      });
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message || t('operationFailed'),
        variant: "destructive",
      });
    } finally {
      setRespondingTo(null);
    }
  };

  const handleDismiss = (inviteId: string) => {
    setDismissed(prev => {
      const newSet = new Set(prev);
      newSet.add(inviteId);
      return newSet;
    });
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {visibleInvites.slice(0, 3).map((invite) => (
        <Card 
          key={invite.id} 
          className="bg-background/95 backdrop-blur-sm border-amber-500/50 shadow-lg animate-in slide-in-from-right"
          data-testid={`guild-invite-${invite.id}`}
        >
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-500" weight="fill" />
                {t('guildInviteTitle')}
              </CardTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6"
                onClick={() => handleDismiss(invite.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="flex items-center gap-3 mb-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                style={{ backgroundColor: invite.guildColor || '#6B7280' }}
              >
                {invite.guildEmblem || '⚔️'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{invite.guildName}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Crown className="w-3 h-3" weight="fill" />
                  {t('invitedByPlayer').replace('{0}', invite.inviterName)}
                </p>
                {invite.guildLevel && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {t('guildLevel').replace('{0}', String(invite.guildLevel))}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                onClick={() => handleRespond(invite.id, false, invite.guildName)}
                disabled={respondingTo === invite.id}
                data-testid={`button-reject-invite-${invite.id}`}
              >
                <X className="w-4 h-4 mr-1" />
                {t('reject')}
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => handleRespond(invite.id, true, invite.guildName)}
                disabled={respondingTo === invite.id}
                data-testid={`button-accept-invite-${invite.id}`}
              >
                <Check className="w-4 h-4 mr-1" />
                {t('acceptBtn')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      
      {visibleInvites.length > 3 && (
        <div className="text-center text-xs text-muted-foreground">
          {t('moreInvites').replace('{0}', String(visibleInvites.length - 3))}
        </div>
      )}
    </div>
  );
}
