import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Users,
  User,
  Star,
  CaretRight,
  Spinner,
  Lightning,
  MagnifyingGlass
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/useMobile";
import { useLanguage } from "@/context/LanguageContext";
import { useGame } from "@/context/GameContext";
import { t } from "@/lib/i18n";

const AVATARS: Record<string, string> = {
  knight: '🛡️',
  mage: '🧙',
  archer: '🏹',
  warrior: '⚔️',
  rogue: '🗡️',
  healer: '✨',
};

interface Player {
  id: string;
  username: string;
  avatar: string;
  totalLevel: number;
  skills: Record<string, { xp: number; level: number }>;
  activeTask: any | null;
  lastSeen: string | null;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getOnlineStatus(player: Player, onlineLabel: string): { isOnline: boolean; label: string } {
  if (!player.lastSeen) {
    if (player.activeTask) {
      return { isOnline: true, label: onlineLabel };
    }
    return { isOnline: false, label: '' };
  }
  
  const lastSeenDate = new Date(player.lastSeen);
  const now = new Date();
  const diffMs = now.getTime() - lastSeenDate.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  
  if (diffMinutes < 5 || player.activeTask) {
    return { isOnline: true, label: onlineLabel };
  }
  
  return { isOnline: false, label: '' };
}

export default function ScoreboardPage() {
  const { isMobile } = useMobile();
  const { language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  
  const { player } = useGame();
  const { data: players, isLoading, error } = useQuery<Player[]>({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const response = await fetch('/api/players/leaderboard', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      return response.json();
    },
    enabled: !!player,
  });

  const shuffledPlayers = useMemo(() => {
    if (!players) return [];
    return shuffleArray(players);
  }, [players]);

  const filteredPlayers = useMemo(() => {
    if (!searchQuery.trim()) return shuffledPlayers;
    const query = searchQuery.toLowerCase();
    return shuffledPlayers.filter(player => 
      player.username.toLowerCase().includes(query)
    );
  }, [shuffledPlayers, searchQuery]);

  return (
      <div className={cn("flex flex-col", isMobile ? "pb-24" : "h-full")}>
        <div className={cn("flex items-center gap-3", isMobile ? "mb-4" : "mb-6")}>
          <div className={cn("rounded-xl bg-primary/20 border border-primary/30", isMobile ? "p-2" : "p-3")}>
            <Users className={cn("text-primary", isMobile ? "w-6 h-6" : "w-8 h-8")} weight="bold" />
          </div>
          <div>
            <h1 className={cn("font-display font-bold text-foreground", isMobile ? "text-xl" : "text-3xl")}>{t(language, 'players')}</h1>
            <p className={cn("text-muted-foreground font-ui", isMobile && "text-sm")}>{t(language, 'searchPlayers')}</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t(language, 'searchPlayers')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-players"
            />
          </div>
        </div>

        <Card className="flex-1 bg-card/50 backdrop-blur border-border overflow-hidden">
          {!isMobile && (
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between text-sm font-ui text-muted-foreground uppercase tracking-wider">
                <span>{t(language, 'player')}</span>
                <span>{t(language, 'totalLevel')}</span>
              </div>
            </CardHeader>
          )}
          <CardContent className="p-0">
            <ScrollArea className={cn(isMobile ? "h-[calc(100vh-260px)]" : "h-[calc(100vh-360px)]")}>
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Spinner className="w-8 h-8 text-primary animate-spin" />
                </div>
              )}

              {error && (
                <div className="text-center py-12 text-red-500 font-ui">
                  {t(language, 'loadingScoreboard')}
                </div>
              )}

              {filteredPlayers && filteredPlayers.length === 0 && !isLoading && (
                <div className="text-center py-12 text-muted-foreground font-ui">
                  {t(language, 'noPlayersYet')}
                </div>
              )}

              {filteredPlayers && filteredPlayers.map((player) => {
                const onlineStatus = getOnlineStatus(player, t(language, 'online'));
                
                if (isMobile) {
                  return (
                    <Link
                      key={player.id}
                      href={`/profile/${player.username}`}
                      className="block"
                    >
                      <div
                        className="p-3 border-b bg-card/50 border-border transition-colors hover:bg-muted/30 cursor-pointer"
                        data-testid={`player-row-${player.username}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <div className="w-10 h-10 rounded-lg bg-card border border-border flex items-center justify-center text-xl">
                              {AVATARS[player.avatar] || '👤'}
                            </div>
                            {onlineStatus.isOnline && (
                              <div 
                                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 bg-green-500/30 border-green-500 flex items-center justify-center"
                              >
                                <Lightning 
                                  className="w-2.5 h-2.5 text-green-400"
                                  weight="fill" 
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-display font-bold text-foreground truncate text-sm">
                                {player.username}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <Star className="w-4 h-4 text-primary" weight="fill" />
                                <span className="text-base font-display font-bold text-foreground">
                                  {player.totalLevel}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{Object.values(player.skills || {}).filter((s: any) => s.level > 0).length} {t(language, 'skillsCount')}</span>
                              {onlineStatus.isOnline && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] text-green-400 bg-green-500/20">
                                  {t(language, 'online')}
                                </span>
                              )}
                            </div>
                          </div>
                          <CaretRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </div>
                      </div>
                    </Link>
                  );
                }
                
                return (
                  <Link
                    key={player.id}
                    href={`/profile/${player.username}`}
                    className="block"
                  >
                    <div
                      className="flex items-center justify-between p-4 border-b bg-card/50 border-border transition-colors hover:bg-muted/30 cursor-pointer"
                      data-testid={`player-row-${player.username}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center text-2xl">
                            {AVATARS[player.avatar] || '👤'}
                          </div>
                          {onlineStatus.isOnline && (
                            <div 
                              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 bg-green-500/30 border-green-500 shadow-green-500/30 flex items-center justify-center shadow-md"
                              title={t(language, 'online')}
                              data-testid={`online-indicator-${player.username}`}
                            >
                              <Lightning 
                                className="w-3 h-3 text-green-400"
                                weight="fill" 
                              />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-display font-bold text-foreground flex items-center gap-2">
                            {player.username}
                            {onlineStatus.isOnline && (
                              <span className="text-[10px] font-ui font-medium px-1.5 py-0.5 rounded text-green-400 bg-green-500/20">
                                {t(language, 'online')}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-ui">
                            {Object.values(player.skills || {}).filter((s: any) => s.level > 0).length} {t(language, 'activeSkillsCount')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Star className="w-5 h-5 text-primary" weight="fill" />
                          <span className="text-xl font-display font-bold text-foreground">
                            {player.totalLevel}
                          </span>
                        </div>
                        <div className="text-muted-foreground hover:text-primary flex items-center gap-1">
                          <User className="w-4 h-4" weight="bold" />
                          <CaretRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
  );
}
