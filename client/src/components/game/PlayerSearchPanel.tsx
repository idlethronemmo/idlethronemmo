import { useState, useCallback } from "react";
import { useTrade } from "@/context/TradeContext";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MagnifyingGlass, Circle, Handshake, WifiHigh, WifiSlash, User, Check, Warning, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface PlayerResult {
  playerId: string;
  username: string;
  isOnline: boolean;
  tradeEnabled: boolean;
  totalLevel: number;
  avatar: string;
}

interface SearchResponse {
  found: boolean;
  players: PlayerResult[];
}

export default function PlayerSearchPanel() {
  const { isConnected, sendTradeRequest, pendingOutgoingRequest } = useTrade();
  const { player } = useGame();
  const { t } = useLanguage();
  const [searchInput, setSearchInput] = useState("");
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!searchInput.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`/api/players/search?username=${encodeURIComponent(searchInput.trim())}`);
      const data = await response.json();
      setSearchResponse(data);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResponse({ found: false, players: [] });
    } finally {
      setIsSearching(false);
    }
  }, [searchInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  }, [handleSearch]);

  const handleTrade = useCallback((playerId: string) => {
    sendTradeRequest(playerId);
  }, [sendTradeRequest]);

  const filteredPlayers = searchResponse?.players?.filter(p => p.playerId !== player?.id) || [];

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <MagnifyingGlass className="w-5 h-5" weight="fill" />
            Oyuncu Ara
          </span>
          <span className={cn(
            "flex items-center gap-1 text-xs",
            isConnected ? "text-green-500" : "text-red-500"
          )}>
            {isConnected ? (
              <>
                <WifiHigh className="w-4 h-4" />
                {t('connected')}
              </>
            ) : (
              <>
                <WifiSlash className="w-4 h-4" />
                {t('connecting')}
              </>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder={t('enterCharacterName')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            data-testid="input-player-search"
          />
          <Button 
            onClick={handleSearch} 
            disabled={!searchInput.trim() || isSearching}
            variant="outline"
            data-testid="button-search-player"
          >
            <MagnifyingGlass className="w-4 h-4" />
          </Button>
        </div>

        {searchResponse && (
          <div className="space-y-2">
            {!searchResponse.found || filteredPlayers.length === 0 ? (
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <X className="w-5 h-5 text-red-500" weight="bold" />
                  <span>{t('playerNotFoundSearch')}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {filteredPlayers.map((result) => {
                  const canTrade = result.isOnline && result.tradeEnabled && !pendingOutgoingRequest;
                  
                  return (
                    <div 
                      key={result.playerId}
                      className="p-3 rounded-lg bg-muted/50 border border-border space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <User className="w-6 h-6 text-primary" weight="fill" />
                          </div>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {result.username}
                              {result.isOnline && (
                                <Check className="w-4 h-4 text-green-500" weight="bold" />
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t('level')}: {result.totalLevel}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Circle 
                            className={cn(
                              "w-3 h-3",
                              result.isOnline ? "text-green-500" : "text-gray-500"
                            )} 
                            weight="fill" 
                          />
                          <span className={cn(
                            "text-xs",
                            result.isOnline ? "text-green-500" : "text-muted-foreground"
                          )}>
                            {result.isOnline ? t('online') : t('offline')}
                          </span>
                        </div>
                      </div>

                      {!result.isOnline && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                          <Warning className="w-3 h-3 text-amber-500" />
                          <span>{t('offline')}</span>
                        </div>
                      )}

                      {result.isOnline && !result.tradeEnabled && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                          <Warning className="w-3 h-3 text-amber-500" />
                          <span>{t('tradeDisabled')}</span>
                        </div>
                      )}

                      <Button
                        className="w-full"
                        size="sm"
                        onClick={() => handleTrade(result.playerId)}
                        disabled={!canTrade}
                        data-testid={`button-trade-${result.playerId}`}
                      >
                        <Handshake className="w-4 h-4 mr-2" />
                        {t('sendTradeRequest')}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!searchResponse && (
          <div className="text-center py-6 text-muted-foreground">
            <MagnifyingGlass className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('searchTradePrompt')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
