import { useGame } from "@/context/GameContext";
import { useGuild } from "@/context/GuildContext";
import { useLanguage } from "@/context/LanguageContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Circle, Handshake, UserPlus } from "@phosphor-icons/react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";

export default function OnlinePlayersPanel() {
  const { player } = useGame();
  const { myGuild, myMembership, sendInvite } = useGuild();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [, navigate] = useLocation();
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [onlinePlayers, setOnlinePlayers] = useState<{ playerId: string; playerName: string }[]>([]);

  const fetchOnlinePlayers = useCallback(async () => {
    try {
      const response = await fetch('/api/online-players', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setOnlinePlayers(data.players || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchOnlinePlayers();
    const interval = setInterval(fetchOnlinePlayers, 60000);
    return () => clearInterval(interval);
  }, [fetchOnlinePlayers]);

  const canInvite = myGuild && (myMembership?.role === 'leader' || myMembership?.role === 'officer');

  const handleSendInvite = async (targetPlayerId: string, playerName: string) => {
    setSendingInvite(targetPlayerId);
    try {
      await sendInvite(targetPlayerId);
      toast({ title: t('inviteSent'), description: t('guildInviteSentToPlayer').replace('{0}', playerName) });
    } catch (error: any) {
      toast({ title: t('error'), description: error.message || t('couldNotSendInvite'), variant: "destructive" });
    } finally {
      setSendingInvite(null);
    }
  };

  const otherPlayers = onlinePlayers.filter(p => p.playerId !== player?.id);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Users className="w-5 h-5" weight="fill" />
            {t('onlinePlayers')}
            <span className="text-xs text-muted-foreground font-normal">({otherPlayers.length})</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {otherPlayers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('noOtherOnlinePlayers')}</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {otherPlayers.map(p => (
                <div key={p.playerId} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border" data-testid={`online-player-${p.playerId}`}>
                  <div className="flex items-center gap-2">
                    <Circle className="w-3 h-3 text-green-500" weight="fill" />
                    <span className="font-medium">{p.playerName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {canInvite && (
                      <Button size="sm" variant="ghost" onClick={() => handleSendInvite(p.playerId, p.playerName)} disabled={sendingInvite === p.playerId} data-testid={`button-invite-${p.playerId}`} title={`${myGuild?.name} ${t('inviteToGuildOf')}`}>
                        <UserPlus className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => navigate('/trade')} data-testid={`button-trade-${p.playerId}`}>
                      <Handshake className="w-4 h-4 mr-1" />
                      {t('trade')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
