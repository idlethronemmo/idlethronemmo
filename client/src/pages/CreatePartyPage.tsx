import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  UsersThree,
  Plus,
  MagnifyingGlass,
  Crown,
  Sword,
  Skull,
  Check,
  ArrowLeft,
  PaperPlaneTilt,
  GlobeSimple,
  Circle,
} from "@phosphor-icons/react";

interface SearchResult {
  playerId: string;
  username: string;
  isOnline: boolean;
  totalLevel: number;
}

export default function CreatePartyPage() {
  const [, navigate] = useLocation();
  const { player } = useGame();
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [description, setDescription] = useState("");
  const [partyType, setPartyType] = useState<"social" | "dungeon">("social");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const { data: currentParty, isLoading: isLoadingParty } = useQuery<any>({
    queryKey: ["/api/parties/current"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/parties/current");
        const data = await res.json();
        return data.party || null;
      } catch {
        return null;
      }
    },
  });

  const searchPlayers = useCallback(async () => {
    if (searchQuery.length < 2) {
      toast({ title: "Enter at least 2 characters", variant: "destructive" });
      return;
    }
    setIsSearching(true);
    try {
      const res = await apiRequest("GET", `/api/players/search?username=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.found && data.players) {
        const filtered = (data.players as SearchResult[]).filter(
          (p) =>
            p.playerId !== player?.id &&
            !selectedPlayers.some((s) => s.playerId === p.playerId)
        );
        setSearchResults(filtered);
        if (filtered.length === 0) toast({ title: "No players found" });
      } else {
        setSearchResults([]);
        toast({ title: "No players found" });
      }
    } catch {
      toast({ title: "Search error", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, player?.id, selectedPlayers, toast]);

  const [createdPartyId, setCreatedPartyId] = useState<string | null>(null);

  const createPartyAndInvite = async (inviteeId: string) => {
    let partyId = createdPartyId;
    if (!partyId) {
      const res = await apiRequest("POST", "/api/parties", {
        description: description.trim() || null,
        name: null,
        partyType,
      });
      const data = await res.json();
      partyId = data.party?.id;
      if (!partyId) throw new Error("Failed to create party");
      setCreatedPartyId(partyId);
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      toast({ title: "Party created!" });
    }
    await apiRequest("POST", `/api/parties/${partyId}/invite`, { inviteeId });
    toast({ title: "Invite sent!" });
  };

  const inviteMutation = useMutation({
    mutationFn: async (inviteeId: string) => {
      await createPartyAndInvite(inviteeId);
      return inviteeId;
    },
    onError: (error: any, inviteeId: string) => {
      setSelectedPlayers(prev => prev.filter(p => p.playerId !== inviteeId));
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createEmptyPartyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/parties", {
        description: description.trim() || null,
        name: null,
        partyType,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties/current"] });
      toast({ title: "Party created!" });
      navigate("/party");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addPlayer = (p: SearchResult) => {
    setSelectedPlayers((prev) => [...prev, p]);
    setSearchResults((prev) => prev.filter((r) => r.playerId !== p.playerId));
    inviteMutation.mutate(p.playerId);
  };

  const removePlayer = (playerId: string) => {
    setSelectedPlayers((prev) => prev.filter((p) => p.playerId !== playerId));
  };

  if (isLoadingParty) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (currentParty) {
    return (
      <div className="container max-w-2xl mx-auto p-4 space-y-6 pb-24">
        <Card className="bg-card/50 border-violet-500/30">
          <CardContent className="flex flex-col items-center justify-center py-8 gap-4">
            <UsersThree className="w-16 h-16 text-violet-400" weight="fill" />
            <h2 className="text-xl font-bold text-foreground" data-testid="text-already-in-party">
              You are already in a party
            </h2>
            <Button
              onClick={() => navigate("/party")}
              className="bg-violet-600 hover:bg-violet-700"
              data-testid="button-go-to-party"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go to Party
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl mx-auto p-4 space-y-4 pb-24">
      <div className="flex items-center gap-3 mb-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/party")}
          data-testid="button-back-to-party"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <UsersThree className="w-7 h-7 text-violet-400" weight="fill" />
          Create Party
        </h1>
      </div>

      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="w-5 h-5 text-violet-400" weight="fill" />
            Party Type
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setPartyType("social")}
            className={cn(
              "p-3 rounded-lg border-2 transition-all text-left",
              partyType === "social"
                ? "border-violet-500 bg-violet-500/10"
                : "border-border bg-background/50 hover:border-violet-500/40"
            )}
            data-testid="button-party-type-social"
          >
            <div className="flex items-center gap-2 mb-1">
              <Sword className="w-5 h-5 text-violet-400" weight="fill" />
              <span className="font-bold text-sm text-foreground">Social</span>
            </div>
            <p className="text-xs text-muted-foreground">Combat page party for fighting together</p>
          </button>
          <button
            onClick={() => setPartyType("dungeon")}
            className={cn(
              "p-3 rounded-lg border-2 transition-all text-left",
              partyType === "dungeon"
                ? "border-violet-500 bg-violet-500/10"
                : "border-border bg-background/50 hover:border-violet-500/40"
            )}
            data-testid="button-party-type-dungeon"
          >
            <div className="flex items-center gap-2 mb-1">
              <Skull className="w-5 h-5 text-violet-400" weight="fill" />
              <span className="font-bold text-sm text-foreground">Dungeon</span>
            </div>
            <p className="text-xs text-muted-foreground">Party for dungeon runs</p>
          </button>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GlobeSimple className="w-5 h-5 text-violet-400" weight="fill" />
            Description
            <span className="text-xs text-muted-foreground font-normal ml-auto">
              {description.length}/100
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Optional party description..."
            value={description}
            onChange={(e) => {
              if (e.target.value.length <= 100) setDescription(e.target.value);
            }}
            maxLength={100}
            className="resize-none bg-background/50"
            rows={2}
            data-testid="input-party-description"
          />
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MagnifyingGlass className="w-5 h-5 text-violet-400" weight="fill" />
            Invite Players
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchPlayers()}
              className="bg-background/50"
              data-testid="input-player-search"
            />
            <Button
              onClick={searchPlayers}
              disabled={isSearching || searchQuery.length < 2}
              variant="secondary"
              data-testid="button-search-players"
            >
              <MagnifyingGlass className="w-4 h-4" />
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto" data-testid="search-results">
              {searchResults.map((p) => (
                <div
                  key={p.playerId}
                  className="flex items-center justify-between p-2.5 bg-background/50 rounded-lg border border-border"
                  data-testid={`search-result-${p.playerId}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Circle
                      className={cn("w-3 h-3 shrink-0", p.isOnline ? "text-green-400" : "text-gray-500")}
                      weight="fill"
                    />
                    <span className="font-medium text-sm text-foreground truncate">{p.username}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      Lv. {p.totalLevel}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-violet-500/50 text-violet-400 hover:bg-violet-500/10 shrink-0"
                    onClick={() => addPlayer(p)}
                    disabled={inviteMutation.isPending}
                    data-testid={`button-invite-player-${p.playerId}`}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    {inviteMutation.isPending ? "Sending..." : "Invite"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {selectedPlayers.length > 0 && (
            <div className="space-y-1.5" data-testid="selected-players">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <PaperPlaneTilt className="w-3.5 h-3.5 text-violet-400" />
                Invited ({selectedPlayers.length})
              </p>
              {selectedPlayers.map((p) => (
                <div
                  key={p.playerId}
                  className="flex items-center justify-between p-2 bg-violet-500/10 rounded-lg border border-violet-500/30"
                  data-testid={`selected-player-${p.playerId}`}
                >
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-violet-400" weight="bold" />
                    <span className="text-sm font-medium text-foreground">{p.username}</span>
                    <Badge variant="outline" className="text-xs">Lv. {p.totalLevel}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 h-7 w-7 p-0"
                    onClick={() => removePlayer(p.playerId)}
                    data-testid={`button-remove-player-${p.playerId}`}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {createdPartyId ? (
        <Button
          className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3"
          size="lg"
          onClick={() => navigate("/party")}
          data-testid="button-go-to-party-done"
        >
          <span className="flex items-center gap-2">
            <ArrowLeft className="w-5 h-5" />
            Go to Party
          </span>
        </Button>
      ) : (
        <Button
          className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-3"
          size="lg"
          variant="outline"
          onClick={() => createEmptyPartyMutation.mutate()}
          disabled={createEmptyPartyMutation.isPending}
          data-testid="button-create-party-no-invites"
        >
          {createEmptyPartyMutation.isPending ? (
            <span className="flex items-center gap-2">Creating...</span>
          ) : (
            <span className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create without invites
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
