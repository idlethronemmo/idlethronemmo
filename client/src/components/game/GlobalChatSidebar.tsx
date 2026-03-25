import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, X, Shield, Swords, Heart, Target, Pickaxe, TreePine, Fish, CookingPot, FlaskConical, Hammer, Users, Mail, UserPlus } from "lucide-react";
import { Sword as PhSword, Lightning, UserCircle, Shield as PhShield, Heart as PhHeart } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { useItemInspect } from "@/context/ItemInspectContext";
import { useChatItemShare } from "@/context/ChatItemShareContext";
import { Language, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import SaveAccountDialog from "./SaveAccountDialog";
import PartyPanel from "./PartyPanel";
import ItemSlot from "./ItemSlot";
import { translateItemName, getBaseItem, parseItemWithRarity, hasRarity, getItemRarityColor, getItemRarityBgColor } from "@/lib/items";
import type { EquipmentSlot } from "@/lib/items";
import { getItemImage } from "@/lib/itemImages";
import { RetryImage } from "@/components/ui/retry-image";
import { AVATAR_MAP } from "./PartyMemberDetailDialog";

const AVATARS: Record<string, string> = {
  knight: "⚔️",
  mage: "🧙",
  archer: "🏹",
  warrior: "🛡️",
  rogue: "🗡️",
  paladin: "✨",
  necromancer: "💀",
  druid: "🌿",
};

const SKILL_ICONS: Record<string, React.ReactNode> = {
  attack: <Swords className="w-3.5 h-3.5 text-red-400" />,
  strength: <Target className="w-3.5 h-3.5 text-orange-400" />,
  defence: <Shield className="w-3.5 h-3.5 text-blue-400" />,
  hitpoints: <Heart className="w-3.5 h-3.5 text-pink-400" />,
  mining: <Pickaxe className="w-3.5 h-3.5 text-stone-400" />,
  woodcutting: <TreePine className="w-3.5 h-3.5 text-green-400" />,
  fishing: <Fish className="w-3.5 h-3.5 text-cyan-400" />,
  cooking: <CookingPot className="w-3.5 h-3.5 text-amber-400" />,
  alchemy: <FlaskConical className="w-3.5 h-3.5 text-purple-400" />,
  crafting: <Hammer className="w-3.5 h-3.5 text-yellow-400" />,
};

interface PlayerProfile {
  id: string;
  username: string;
  avatar: string;
  totalLevel: number;
  skills: Record<string, { level: number; xp: number }>;
  equipment?: Record<string, string | null>;
  itemModifications?: Record<string, { addedStats: Record<string, number>; addedSkills: string[]; enhancementLevel: number }>;
  cursedItems?: string[];
  selectedBadge?: string | null;
  guildId?: string | null;
  currentRegion?: string;
}

const PREMIUM_BADGE_IDS = ['alpha_upholder'];

interface ChatMessage {
  id: string;
  playerId: string;
  username: string;
  level: number;
  content: string;
  createdAt: string;
  currentRegion?: string;
  selectedBadge?: string | null;
  badgeName?: string | null;
  badgeRarity?: string | null;
  badgeIcon?: string | null;
  badgeImageUrl?: string | null;
  badgeNameTranslations?: Record<string, string> | null;
}

const REGION_ICONS: Record<string, string> = {
  verdant: "🌲",
  quarry: "⛏️",
  dunes: "🏜️",
  obsidian: "🌋",
  dragonspire: "🐉",
  frozen_wastes: "❄️",
  void_realm: "🌀",
};

interface GlobalChatSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  fullScreen?: boolean;
  onOpenPm?: () => void;
  unreadPmCount?: number;
  unreadGlobalCount?: number;
}

function getLevelColor(level: number): string {
  if (level >= 100) return "text-purple-400";
  if (level >= 75) return "text-yellow-400";
  if (level >= 50) return "text-blue-400";
  if (level >= 25) return "text-green-400";
  return "text-muted-foreground";
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();

  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const utcNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diffDays = Math.floor((utcNow.getTime() - utcDate.getTime()) / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });

  if (diffDays === 0) {
    return timeStr;
  }
  if (diffDays === 1) {
    return `Yesterday ${timeStr}`;
  }
  if (diffDays <= 3) {
    return `${diffDays} days ago`;
  }
  const day = date.getUTCDate();
  const month = date.toLocaleString("en", { month: "long", timeZone: "UTC" });
  return `${day} ${month} ${timeStr}`;
}

interface PartyData {
  id: string;
  leaderId: string;
  name: string | null;
  members: Array<{
    id: string;
    playerId: string;
    username: string;
    totalLevel: number;
  }>;
}

function parseMessageWithItems(content: string, openInspect: (item: { name: string; quantity?: number }) => void, language: Language) {
  const regex = /\[item:([^\]#]+)(?:#(\d+))?\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const itemName = match[1];
    const enhLevel = match[2] ? parseInt(match[2]) : 0;
    const itemHasRarity = hasRarity(itemName);
    const rarityColor = itemHasRarity ? getItemRarityColor(itemName) : "";
    const rarityBg = itemHasRarity ? getItemRarityBgColor(itemName) : "bg-muted/80 border-border/40";
    const { baseId } = parseItemWithRarity(itemName);
    parts.push(
      <button
        key={`item-${match.index}`}
        className={cn(
          "inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded border hover:brightness-110 cursor-pointer transition-all",
          rarityBg
        )}
        onClick={(e) => {
          e.stopPropagation();
          openInspect({ name: itemName, fromChat: true } as any);
        }}
        data-testid={`chat-item-link-${match.index}`}
      >
        <ItemSlot itemName={itemName} size="xs" className="!w-5 !h-5" hideGlow />
        <span className={cn("text-xs font-medium", rarityColor || "text-foreground/90")}>
          {translateItemName(baseId, language)}
        </span>
        {enhLevel > 0 && (
          <span className="text-[10px] text-amber-400 font-bold">+{enhLevel}</span>
        )}
      </button>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : content;
}

export default function GlobalChatSidebar({ isOpen, onToggle, fullScreen = false, onOpenPm, unreadPmCount = 0, unreadGlobalCount = 0 }: GlobalChatSidebarProps) {
  const { player, isGuest, activeTask, activeCombat } = useGame();
  const { language } = useLanguage();
  const { openInspect } = useItemInspect();
  const [, navigate] = useLocation();
  const { pendingItems, removeItem, clearItems } = useChatItemShare();
  const hasActiveEngagement = !!(activeTask || activeCombat);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastTimestamp, setLastTimestamp] = useState<number | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [saveAccountOpen, setSaveAccountOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "party">("chat");
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [viewportOffsetTop, setViewportOffsetTop] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollYRef = useRef(0);

  useEffect(() => {
    if (!fullScreen || !isOpen) {
      setViewportHeight(null);
      setViewportOffsetTop(0);
      return;
    }

    savedScrollYRef.current = window.scrollY;
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    document.body.style.setProperty('overflow', 'hidden', 'important');
    document.body.style.setProperty('overscroll-behavior', 'none', 'important');

    const preventBgScroll = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const scrollable = target.closest('[data-chat-scrollable]');
      if (!scrollable) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventBgScroll, { passive: false });

    const vv = window.visualViewport;
    if (!vv) {
      return () => {
        document.removeEventListener('touchmove', preventBgScroll);
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        document.body.style.overscrollBehavior = '';
        window.scrollTo(0, savedScrollYRef.current);
      };
    }

    const handleResize = () => {
      setViewportHeight(vv.height);
      setViewportOffsetTop(vv.offsetTop);
    };

    handleResize();
    vv.addEventListener('resize', handleResize);
    vv.addEventListener('scroll', handleResize);

    return () => {
      document.removeEventListener('touchmove', preventBgScroll);
      vv.removeEventListener('resize', handleResize);
      vv.removeEventListener('scroll', handleResize);
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
      window.scrollTo(0, savedScrollYRef.current);
    };
  }, [fullScreen, isOpen]);

  const { data: currentParty } = useQuery<PartyData | null>({
    queryKey: ["/api/parties/current"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/parties/current");
        const data = await res.json();
        return data.party || null;
      } catch (error: any) {
        if (error.message?.includes("404") || error.message?.includes("not in a party")) {
          return null;
        }
        throw error;
      }
    },
    refetchInterval: isOpen ? 60000 : false,
    staleTime: 30000,
    enabled: isOpen && !isGuest,
  });

  const { data: selectedProfile, isLoading: profileLoading } = useQuery<PlayerProfile>({
    queryKey: ["/api/players", selectedPlayerId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/players/${selectedPlayerId}`);
      return res.json();
    },
    enabled: !!selectedPlayerId && profileOpen,
  });

  const handleUsernameClick = (playerId: string) => {
    setSelectedPlayerId(playerId);
    setProfileOpen(true);
  };

  const { data: initialMessages, isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/global"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/chat/global");
      return res.json();
    },
    enabled: isOpen,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
      const last = initialMessages[initialMessages.length - 1].createdAt;
      setLastTimestamp(new Date(last).getTime());
    }
  }, [initialMessages]);

  const { data: newMessages } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/global/since", lastTimestamp],
    queryFn: async () => {
      if (!lastTimestamp) return [];
      const res = await apiRequest("GET", `/api/chat/global/since/${lastTimestamp}`);
      return res.json();
    },
    enabled: isOpen && !!lastTimestamp,
    refetchInterval: isOpen ? 15000 : false,
    staleTime: 0,
  });

  useEffect(() => {
    if (newMessages && newMessages.length > 0) {
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const uniqueNew = newMessages.filter((m) => !existingIds.has(m.id));
        if (uniqueNew.length === 0) return prev;
        const updated = [...prev, ...uniqueNew]
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .slice(-100);
        return updated;
      });
      const lastNew = newMessages[newMessages.length - 1].createdAt;
      setLastTimestamp(new Date(lastNew).getTime());
    }
  }, [newMessages]);

  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (viewportHeight) {
      setTimeout(scrollToBottom, 100);
    }
  }, [viewportHeight, scrollToBottom]);

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/chat/global", { content });
      return res.json();
    },
    onSuccess: (newMessage: ChatMessage) => {
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        if (existingIds.has(newMessage.id)) return prev;
        return [...prev, newMessage].slice(-100);
      });
      setLastTimestamp(new Date(newMessage.createdAt).getTime());
      setMessage("");
      scrollToBottom();
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const res = await apiRequest("DELETE", `/api/global-chat/${messageId}`);
      return res.json();
    },
    onSuccess: (_, messageId) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    },
  });

  const handleDeleteMessage = (messageId: string) => {
    if (!player?.isTester) return;
    deleteMessageMutation.mutate(messageId);
  };

  const handleSend = () => {
    const trimmed = message.trim();
    const hasItems = pendingItems.length > 0;
    if ((!trimmed && !hasItems) || sendMessageMutation.isPending) return;
    
    let finalContent = trimmed;
    if (hasItems) {
      const itemTags = pendingItems.map(item => {
        if (item.enhancementLevel && item.enhancementLevel > 0) {
          return `[item:${item.itemName}#${item.enhancementLevel}]`;
        }
        return `[item:${item.itemName}]`;
      }).join(" ");
      finalContent = finalContent ? `${itemTags} ${finalContent}` : itemTags;
    }
    
    sendMessageMutation.mutate(finalContent);
    clearItems();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return createPortal(
    <>
      {!fullScreen && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn(
            "h-10 w-10 rounded-full bg-background/95 backdrop-blur border shadow-lg",
            isOpen && "hidden",
            unreadGlobalCount > 0 ? "border-orange-500/60" : "border-border"
          )}
          style={{ position: 'fixed', right: '1rem', top: '6.5rem', zIndex: 9999 }}
          data-testid="button-toggle-global-chat"
        >
          <MessageSquare className={cn("h-5 w-5", unreadGlobalCount > 0 && "text-orange-400")} />
          {unreadGlobalCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-orange-500 text-white rounded-full border-2 border-background">
              {unreadGlobalCount > 99 ? "99+" : unreadGlobalCount}
            </span>
          )}
        </Button>
      )}

      <div
        ref={chatContainerRef}
        className={cn(
          "flex flex-col bg-background/95 backdrop-blur transition-transform duration-300",
          fullScreen 
            ? "fixed left-0 right-0 z-[10000] overflow-hidden" 
            : cn(
                "fixed right-0 top-16 z-[60] border-l border-border",
                isOpen ? "translate-x-0" : "translate-x-full"
              )
        )}
        style={fullScreen ? {
          top: `${viewportOffsetTop}px`,
          height: viewportHeight ? `${viewportHeight}px` : '100dvh',
          maxHeight: viewportHeight ? `${viewportHeight}px` : '-webkit-fill-available',
        } : {
          width: "320px",
          height: "calc(100vh - 64px)",
        }}
        data-testid="global-chat-sidebar"
        data-chat-scrollable
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            {currentParty ? (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "chat" | "party")} className="flex-1">
                <TabsList className="h-8 bg-muted/50">
                  <TabsTrigger value="chat" className="text-xs h-7 px-3 data-[state=active]:bg-primary/20" data-testid="tab-chat">
                    <MessageSquare className="h-4 w-4 mr-1.5" />
                    {t(language, "chat")}
                  </TabsTrigger>
                  <TabsTrigger value="party" className="text-xs h-7 px-3 data-[state=active]:bg-violet-500/20" data-testid="tab-party">
                    <Users className="h-4 w-4 mr-1.5" />
                    {t(language, "party")}
                    <span className="ml-1 text-[10px] text-violet-300">({(currentParty.members || []).length})</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            ) : (
              <>
                <MessageSquare className="h-5 w-5 text-primary" />
                <span className="font-semibold text-sm">Global Chat</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            {onOpenPm && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenPm}
                className={cn(
                  "h-8 w-8 relative",
                  unreadPmCount > 0 && ""
                )}
                style={unreadPmCount > 0 ? {
                  boxShadow: '0 0 12px 2px rgba(250, 204, 21, 0.6)',
                  backgroundColor: 'rgba(250, 204, 21, 0.15)'
                } : undefined}
                data-testid="button-open-pm"
              >
                <Mail className={cn("h-4 w-4", unreadPmCount > 0 && "text-yellow-400")} />
                {unreadPmCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 border-2 border-background">
                    {unreadPmCount > 99 ? "99+" : unreadPmCount}
                  </span>
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8"
              data-testid="button-close-global-chat"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {activeTab === "party" && currentParty ? (
          <div className="flex-1 p-3 overflow-auto">
            <PartyPanel showHeader={false} compact={false} className="border-none bg-transparent" />
          </div>
        ) : (
        <ScrollArea className="flex-1 p-3" ref={scrollAreaRef}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
              <MessageSquare className="h-12 w-12 opacity-30 mb-2" />
              <p>No messages yet</p>
              <p className="text-xs">Be the first to say something!</p>
            </div>
          ) : (
            <div className={cn("space-y-2", fullScreen && hasActiveEngagement && "pb-32", fullScreen && !hasActiveEngagement && "pb-20")}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "p-2 rounded-md text-sm group relative",
                    msg.playerId === player?.id
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-muted/50"
                  )}
                  data-testid={`chat-message-${msg.id}`}
                >
                  <div className="flex items-start gap-1 flex-wrap">
                    <span className={cn("font-medium", getLevelColor(msg.level))}>
                      [Lv.{msg.level}]
                    </span>
                    {msg.currentRegion && REGION_ICONS[msg.currentRegion] && (
                      <span 
                        className="text-xs" 
                        title={msg.currentRegion.replace(/_/g, " ")}
                        data-testid={`chat-region-${msg.id}`}
                      >
                        {REGION_ICONS[msg.currentRegion]}
                      </span>
                    )}
                    {msg.selectedBadge && msg.badgeName && (() => {
                      const isPremium = PREMIUM_BADGE_IDS.includes(msg.selectedBadge!);
                      const badgeDisplayName = (msg.badgeNameTranslations as any)?.[language] || msg.badgeName;
                      return (
                        <span 
                          className={cn(
                            "inline-flex items-center justify-center w-5 h-5 rounded-sm border shrink-0",
                            isPremium
                              ? "bg-gradient-to-r from-amber-500/30 to-yellow-500/30 border-amber-400/60 shadow-[0_0_6px_rgba(251,191,36,0.4)] animate-pulse"
                              : msg.badgeRarity === 'rare' ? "bg-rose-500/20 border-rose-500/40" :
                                msg.badgeRarity === 'legendary' ? "bg-amber-500/20 border-amber-500/40" :
                                msg.badgeRarity === 'epic' ? "bg-violet-500/20 border-violet-500/40" :
                                msg.badgeRarity === 'uncommon' ? "bg-emerald-500/20 border-emerald-500/40" :
                                "bg-slate-500/20 border-slate-500/40"
                          )}
                          title={badgeDisplayName}
                          data-testid={`chat-badge-${msg.id}`}
                        >
                          {isPremium ? (
                            <span className="text-[10px]">👑</span>
                          ) : msg.badgeImageUrl ? (
                            <img src={msg.badgeImageUrl} alt="" className="w-3.5 h-3.5 rounded-sm object-cover" />
                          ) : (
                            <span className="text-[9px]">🏅</span>
                          )}
                        </span>
                      );
                    })()}
                    <button
                      onClick={() => handleUsernameClick(msg.playerId)}
                      className={cn(
                        "font-semibold hover:underline cursor-pointer transition-colors",
                        msg.selectedBadge && PREMIUM_BADGE_IDS.includes(msg.selectedBadge)
                          ? "text-amber-400 hover:text-amber-300 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]"
                          : "text-foreground hover:text-primary"
                      )}
                      data-testid={`chat-username-${msg.playerId}`}
                    >
                      {msg.username}:
                    </button>
                  </div>
                  <p className="text-foreground/90 break-words mt-0.5 leading-relaxed">
                    {parseMessageWithItems(msg.content, openInspect, language)}
                  </p>
                  <div className="absolute top-1 right-1 flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {formatTimestamp(msg.createdAt)}
                    </span>
                    {player?.isTester === 1 && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 p-0.5 hover:bg-red-500/20 rounded"
                        disabled={deleteMessageMutation.isPending}
                        title={t(language, "deleteMessage")}
                        data-testid={`button-delete-message-${msg.id}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        )}

        {activeTab === "chat" && (
        <div className="p-3 border-t border-border">
          {isGuest ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <p className="text-xs text-amber-400/80 text-center">
                {getGuestChatRestriction(language)}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveAccountOpen(true)}
                className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                data-testid="button-register-for-chat"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {getRegisterButtonText(language)}
              </Button>
            </div>
          ) : (
            <>
              {pendingItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2 p-2 bg-muted/30 rounded-lg border border-border/30" data-testid="chat-pending-items">
                  {pendingItems.map((item, idx) => {
                    const pendingRarityBg = hasRarity(item.itemName) ? getItemRarityBgColor(item.itemName) : "";
                    return (
                    <div key={idx} className={cn("relative group rounded", pendingRarityBg)} data-testid={`chat-pending-item-${idx}`}>
                      <ItemSlot itemName={item.itemName} size="xs" hideGlow />
                      {item.enhancementLevel && item.enhancementLevel > 0 && (
                        <span className="absolute -top-1 -left-1 text-[8px] bg-amber-500/90 text-white px-1 rounded font-bold">
                          +{item.enhancementLevel}
                        </span>
                      )}
                      <button
                        onClick={() => removeItem(idx)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`button-remove-pending-item-${idx}`}
                      >
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    if (fullScreen) {
                      setTimeout(scrollToBottom, 300);
                    }
                  }}
                  placeholder={t(language, "chatPlaceholder")}
                  maxLength={500}
                  disabled={!player || sendMessageMutation.isPending}
                  className="flex-1 bg-muted/50 border-border"
                  data-testid="input-global-chat-message"
                />
                <Button
                  onClick={handleSend}
                  disabled={(!message.trim() && pendingItems.length === 0) || !player || sendMessageMutation.isPending}
                  size="icon"
                  className="shrink-0"
                  data-testid="button-send-global-chat"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {!player && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t(language, "loginToSendMessages")}
                </p>
              )}
            </>
          )}
        </div>
        )}
      </div>

      <SaveAccountDialog open={saveAccountOpen} onOpenChange={setSaveAccountOpen} />

      {/* Player Profile Dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        {profileOpen && (
          <div className="fixed inset-0 z-[10000] bg-black/80" onClick={() => setProfileOpen(false)} />
        )}
        <DialogContent aria-describedby={undefined} className={cn(
          "max-w-md bg-gradient-to-b from-card to-card/95 border-violet-500/30 z-[10001]",
          selectedProfile?.selectedBadge && PREMIUM_BADGE_IDS.includes(selectedProfile.selectedBadge) && "border-amber-500/50"
        )}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="relative">
                <div className={cn(
                  "w-14 h-14 rounded-full border-2 overflow-hidden",
                  selectedProfile?.selectedBadge && PREMIUM_BADGE_IDS.includes(selectedProfile.selectedBadge)
                    ? "border-amber-400/60 shadow-[0_0_12px_rgba(251,191,36,0.4)]"
                    : "border-violet-500/50 shadow-violet-500/30"
                )}>
                  <img
                    src={selectedProfile?.avatar && AVATAR_MAP[selectedProfile.avatar] ? AVATAR_MAP[selectedProfile.avatar] : AVATAR_MAP.knight}
                    alt={selectedProfile?.username}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    selectedProfile?.selectedBadge && PREMIUM_BADGE_IDS.includes(selectedProfile.selectedBadge)
                      ? "bg-gradient-to-r from-amber-300 to-yellow-500 bg-clip-text text-transparent font-bold"
                      : ""
                  )}>
                    {selectedProfile?.username}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground font-normal">
                  {t(language, "totalLevel")} {selectedProfile?.totalLevel}
                </div>
                {selectedProfile?.currentRegion && (
                  <div className="text-xs text-muted-foreground/70 capitalize font-normal">
                    {selectedProfile.currentRegion.replace(/_/g, " ")}
                  </div>
                )}
              </div>
              {selectedProfile?.selectedBadge && (
                <div className={cn(
                  "w-12 h-12 rounded-lg border-2 overflow-hidden shrink-0",
                  PREMIUM_BADGE_IDS.includes(selectedProfile.selectedBadge)
                    ? "border-amber-400/60 shadow-[0_0_10px_rgba(251,191,36,0.4)] bg-gradient-to-br from-amber-500/20 to-yellow-500/20"
                    : "border-violet-500/40 bg-muted/30"
                )}>
                  <RetryImage
                    src={`/images/badges/${selectedProfile.selectedBadge.replace(/_t\d+$/, '')}.webp`}
                    alt={selectedProfile.selectedBadge}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </DialogTitle>
          </DialogHeader>

          {profileLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : selectedProfile ? (
            <div className="space-y-4">
              {(() => {
                const combatSkills = selectedProfile.skills ? [
                  { key: 'attack', icon: PhSword, color: 'text-red-400', bgColor: 'bg-red-500/20', level: selectedProfile.skills.attack?.level || 1 },
                  { key: 'strength', icon: Lightning, color: 'text-orange-400', bgColor: 'bg-orange-500/20', level: selectedProfile.skills.strength?.level || 1 },
                  { key: 'defence', icon: PhShield, color: 'text-blue-400', bgColor: 'bg-blue-500/20', level: selectedProfile.skills.defence?.level || 1 },
                  { key: 'hitpoints', icon: PhHeart, color: 'text-green-400', bgColor: 'bg-green-500/20', level: selectedProfile.skills.hitpoints?.level || 10 },
                ] : [];
                return combatSkills.length > 0 ? (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">{t(language, "combatStats") || "Combat Stats"}</h4>
                    <div className="grid grid-cols-4 gap-2">
                      {combatSkills.map(skill => {
                        const SkillIcon = skill.icon;
                        return (
                          <div
                            key={skill.key}
                            className={cn("flex flex-col items-center p-2 rounded-lg border border-border/50", skill.bgColor)}
                          >
                            <SkillIcon className={cn("w-5 h-5 mb-1", skill.color)} weight="fill" />
                            <span className="text-lg font-bold">{skill.level}</span>
                            <span className="text-[10px] text-muted-foreground capitalize">{t(language, skill.key as any) || skill.key}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null;
              })()}

              {selectedProfile.equipment && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">{t(language, "equipment") || "Equipment"}</h4>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(['helmet', 'amulet', 'cape', 'weapon', 'body', 'shield', 'legs', 'gloves', 'boots', 'ring'] as EquipmentSlot[]).map(slot => {
                      const itemId = selectedProfile.equipment?.[slot];
                      const baseItem = itemId ? getBaseItem(itemId) : null;
                      const itemImg = itemId ? getItemImage(itemId) : null;
                      const { rarity } = itemId ? parseItemWithRarity(itemId) : { rarity: null };
                      const mods = itemId && selectedProfile.itemModifications ? selectedProfile.itemModifications[itemId] : null;
                      const enhLevel = mods?.enhancementLevel || 0;
                      const isCursed = itemId && Array.isArray(selectedProfile.cursedItems) && selectedProfile.cursedItems.includes(itemId);

                      return (
                        <div
                          key={slot}
                          className={cn(
                            "aspect-square rounded-lg border flex items-center justify-center relative",
                            itemId && rarity ? getItemRarityBgColor(itemId) : "border-border/50 bg-muted/30"
                          )}
                          title={baseItem?.name ? `${baseItem.name}${enhLevel > 0 ? ` +${enhLevel}` : ''}` : slot}
                        >
                          {itemImg ? (
                            <RetryImage src={itemImg} alt={baseItem?.name} className="w-[90%] h-[90%] object-contain pixelated" />
                          ) : (
                            <span className="text-[8px] text-muted-foreground uppercase">{slot.slice(0, 4)}</span>
                          )}
                          {enhLevel >= 9 && <div className="absolute inset-0 rounded-lg pointer-events-none shadow-[inset_0_0_14px_rgba(239,68,68,0.8)] animate-pulse" />}
                          {enhLevel >= 7 && enhLevel < 9 && <div className="absolute inset-0 rounded-lg pointer-events-none shadow-[inset_0_0_12px_rgba(6,182,212,0.75)]" />}
                          {enhLevel > 0 && (
                            <div className="absolute top-0 left-0.5 text-[7px] font-bold text-cyan-400 font-mono z-[2]">+{enhLevel}</div>
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
              )}

              {selectedProfile.username && (
                <div className="pt-2 border-t border-border/30">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      navigate(`/profile/${selectedProfile.username}`);
                      setProfileOpen(false);
                    }}
                    data-testid={`view-profile-${selectedPlayerId}`}
                  >
                    <UserCircle className="w-4 h-4 mr-2" />
                    {t(language, "viewProfile") || "Profile"}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-4">
              {t(language, "playerNotFound") || "Player not found"}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>,
    document.body
  );
}

function getGuestChatRestriction(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "Register to send messages in chat",
    zh: "注册后才能发送聊天消息",
    hi: "चैट में संदेश भेजने के लिए पंजीकरण करें",
    es: "Regístrate para enviar mensajes en el chat",
    fr: "Inscrivez-vous pour envoyer des messages",
    ar: "سجل لإرسال رسائل في الدردشة",
    ru: "Зарегистрируйтесь, чтобы отправлять сообщения",
    tr: "Sohbette mesaj göndermek için kayıt ol",
  };
  return texts[lang];
}

function getRegisterButtonText(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "Register Now",
    zh: "立即注册",
    hi: "अभी पंजीकरण करें",
    es: "Regístrate ahora",
    fr: "S'inscrire maintenant",
    ar: "سجل الآن",
    ru: "Зарегистрироваться",
    tr: "Şimdi Kayıt Ol",
  };
  return texts[lang];
}
