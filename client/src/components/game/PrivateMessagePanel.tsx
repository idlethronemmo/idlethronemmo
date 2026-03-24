import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Send, ArrowLeft, Search, User, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useGame } from "@/context/GameContext";
import { cn } from "@/lib/utils";

interface InboxMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  content: string;
  isRead: number;
  createdAt: string;
}

interface ConversationMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  receiverId: string;
  receiverUsername: string;
  content: string;
  isRead: number;
  createdAt: string;
}

interface PlayerSearchResult {
  playerId: string;
  username: string;
  isOnline: boolean;
  totalLevel: number;
}

interface SearchResponse {
  found: boolean;
  players: PlayerSearchResult[];
}

interface PrivateMessagePanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialRecipientId?: string;
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatFullTimestamp(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PrivateMessagePanel({
  isOpen,
  onClose,
  initialRecipientId,
}: PrivateMessagePanelProps) {
  const { player } = useGame();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"inbox" | "new">("inbox");
  const [selectedConversation, setSelectedConversation] = useState<{
    playerId: string;
    username: string;
  } | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const { data: inboxMessages, isLoading: isLoadingInbox } = useQuery<InboxMessage[]>({
    queryKey: ["/api/messages/inbox"],
    enabled: isOpen && !selectedConversation,
    refetchInterval: 60000,
  });

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    enabled: isOpen,
    refetchInterval: 60000,
  });

  const { data: conversationMessages, isLoading: isLoadingConversation } = useQuery<
    ConversationMessage[]
  >({
    queryKey: ["/api/messages/conversation", selectedConversation?.playerId],
    queryFn: async () => {
      if (!selectedConversation?.playerId) return [];
      const res = await apiRequest(
        "GET",
        `/api/messages/conversation/${selectedConversation.playerId}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.messages || [];
    },
    enabled: isOpen && !!selectedConversation?.playerId,
    refetchInterval: 30000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ receiverId, content }: { receiverId: string; content: string }) => {
      const res = await apiRequest("POST", "/api/messages/send", { receiverId, content });
      return res.json();
    },
    onSuccess: () => {
      setMessageInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages/inbox"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/messages/conversation", selectedConversation?.playerId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      scrollToBottom();
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const res = await apiRequest("POST", `/api/messages/${messageId}/read`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
    },
  });

  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, []);

  useEffect(() => {
    if (conversationMessages && conversationMessages.length > 0) {
      scrollToBottom();
      conversationMessages.forEach((msg) => {
        if (msg.receiverId === player?.id && !msg.isRead) {
          markAsReadMutation.mutate(msg.id);
        }
      });
    }
  }, [conversationMessages, player?.id]);

  useEffect(() => {
    if (initialRecipientId && isOpen) {
      setSelectedConversation({
        playerId: initialRecipientId,
        username: "Player",
      });
    }
  }, [initialRecipientId, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedConversation(null);
      setActiveTab("inbox");
      setSearchInput("");
      setSearchResults(null);
      setMessageInput("");
    }
  }, [isOpen]);

  const handleSearch = useCallback(async () => {
    if (!searchInput.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/players/search?username=${encodeURIComponent(searchInput.trim())}`,
        { credentials: "include" }
      );
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults({ found: false, players: [] });
    } finally {
      setIsSearching(false);
    }
  }, [searchInput]);

  const handleSendMessage = () => {
    const trimmed = messageInput.trim();
    if (!trimmed || !selectedConversation?.playerId || sendMessageMutation.isPending)
      return;
    sendMessageMutation.mutate({
      receiverId: selectedConversation.playerId,
      content: trimmed,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const openConversation = (playerId: string, username: string) => {
    setSelectedConversation({ playerId, username });
    setActiveTab("inbox");
    setSearchResults(null);
    setSearchInput("");
  };

  const groupedInboxMessages = inboxMessages
    ? Object.values(
        inboxMessages.reduce((acc, msg) => {
          if (!acc[msg.senderId]) {
            acc[msg.senderId] = msg;
          }
          return acc;
        }, {} as Record<string, InboxMessage>)
      ).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    : [];

  const filteredSearchPlayers =
    searchResults?.players?.filter((p) => p.playerId !== player?.id) || [];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-[400px] sm:w-[400px] p-0 flex flex-col bg-background/98 backdrop-blur border-l border-border"
        data-testid="private-message-panel"
      >
        <SheetHeader className="p-4 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2">
            {selectedConversation ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedConversation(null)}
                  className="h-8 w-8 mr-1"
                  data-testid="button-back-to-inbox"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <User className="h-5 w-5 text-primary" />
                <span className="truncate">{selectedConversation.username}</span>
              </>
            ) : (
              <>
                <Mail className="h-5 w-5 text-primary" />
                <span>Messages</span>
                {unreadCount && unreadCount.count > 0 && (
                  <span
                    className="ml-2 px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full"
                    data-testid="text-unread-count"
                  >
                    {unreadCount.count}
                  </span>
                )}
              </>
            )}
          </SheetTitle>
        </SheetHeader>

        {!selectedConversation ? (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "inbox" | "new")}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <TabsList className="mx-4 mt-3 grid grid-cols-2 shrink-0">
              <TabsTrigger value="inbox" data-testid="tab-inbox">
                Inbox
              </TabsTrigger>
              <TabsTrigger value="new" data-testid="tab-new-message">
                New Message
              </TabsTrigger>
            </TabsList>

            <TabsContent value="inbox" className="flex-1 overflow-hidden m-0">
              <ScrollArea className="h-full p-4">
                {isLoadingInbox ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    Loading messages...
                  </div>
                ) : groupedInboxMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <Mail className="h-12 w-12 opacity-30 mb-2" />
                    <p className="text-sm">No messages yet</p>
                    <p className="text-xs">
                      Start a conversation with another player
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupedInboxMessages.map((msg) => (
                      <button
                        key={msg.id}
                        onClick={() =>
                          openConversation(msg.senderId, msg.senderUsername)
                        }
                        className={cn(
                          "w-full p-3 rounded-lg border border-border text-left transition-colors hover:bg-muted/50",
                          !msg.isRead && "bg-primary/5 border-primary/20"
                        )}
                        data-testid={`inbox-message-${msg.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {!msg.isRead && (
                              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                            )}
                            <span
                              className={cn(
                                "font-medium truncate",
                                !msg.isRead && "font-bold"
                              )}
                            >
                              {msg.senderUsername}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatTimestamp(msg.createdAt)}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "text-sm text-muted-foreground mt-1 line-clamp-2",
                            !msg.isRead && "text-foreground"
                          )}
                        >
                          {msg.content}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="new" className="flex-1 overflow-hidden m-0">
              <div className="p-4 space-y-4 h-full flex flex-col">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by username..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="flex-1 bg-muted/50 border-border"
                    data-testid="input-search-player"
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={!searchInput.trim() || isSearching}
                    variant="outline"
                    size="icon"
                    data-testid="button-search-player"
                  >
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <ScrollArea className="flex-1">
                  {searchResults ? (
                    filteredSearchPlayers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <X className="h-8 w-8 opacity-30 mb-2" />
                        <p className="text-sm">No players found</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredSearchPlayers.map((p) => (
                          <button
                            key={p.playerId}
                            onClick={() => openConversation(p.playerId, p.username)}
                            className="w-full p-3 rounded-lg border border-border text-left transition-colors hover:bg-muted/50"
                            data-testid={`search-result-${p.playerId}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                                  <User className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                  <div className="font-medium flex items-center gap-2">
                                    {p.username}
                                    {p.isOnline && (
                                      <span className="w-2 h-2 rounded-full bg-green-500" />
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Level: {p.totalLevel}
                                  </div>
                                </div>
                              </div>
                              <Mail className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Search className="h-12 w-12 opacity-30 mb-2" />
                      <p className="text-sm">Search for a player</p>
                      <p className="text-xs">Enter a username to start messaging</p>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
              {isLoadingConversation ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading conversation...
                </div>
              ) : conversationMessages && conversationMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <Mail className="h-12 w-12 opacity-30 mb-2" />
                  <p className="text-sm">No messages yet</p>
                  <p className="text-xs">Send a message to start the conversation</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {conversationMessages?.map((msg) => {
                    const isSent = msg.senderId === player?.id;
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex flex-col max-w-[80%]",
                          isSent ? "ml-auto items-end" : "mr-auto items-start"
                        )}
                        data-testid={`conversation-message-${msg.id}`}
                      >
                        <div
                          className={cn(
                            "p-3 rounded-lg text-sm",
                            isSent
                              ? "bg-primary text-primary-foreground rounded-br-none"
                              : "bg-muted border border-border rounded-bl-none"
                          )}
                        >
                          {msg.content}
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1 px-1">
                          {formatFullTimestamp(msg.createdAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            <div className="p-4 border-t border-border shrink-0">
              <div className="flex gap-2">
                <Input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  maxLength={1000}
                  disabled={sendMessageMutation.isPending}
                  className="flex-1 bg-muted/50 border-border"
                  data-testid="input-message"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || sendMessageMutation.isPending}
                  size="icon"
                  className="shrink-0"
                  data-testid="button-send-message"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
