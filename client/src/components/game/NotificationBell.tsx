import { Bell, Check, Coins, Package, Tag, X, UsersThree, UserMinus, UserPlus, XCircle, Handshake } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useGame } from "@/context/GameContext";
import { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/context/LanguageContext";

const TYPE_ICONS: Record<string, React.ElementType> = {
  MARKET_SOLD: Coins,
  MARKET_SALE: Coins,
  MARKET_PURCHASE: Package,
  MARKET_LISTING_CREATED: Tag,
  MARKET_LISTING_CANCELLED: X,
  GUILD_INVITE: UsersThree,
  GUILD_KICKED: UserMinus,
  GUILD_REQUEST_ACCEPTED: UserPlus,
  GUILD_REQUEST_REJECTED: XCircle,
  trade_offer: Handshake,
};

const TYPE_COLORS: Record<string, string> = {
  MARKET_SOLD: "text-yellow-400",
  MARKET_SALE: "text-yellow-400",
  MARKET_PURCHASE: "text-green-400",
  MARKET_LISTING_CREATED: "text-blue-400",
  MARKET_LISTING_CANCELLED: "text-red-400",
  GUILD_INVITE: "text-purple-400",
  GUILD_KICKED: "text-red-500",
  GUILD_REQUEST_ACCEPTED: "text-green-500",
  GUILD_REQUEST_REJECTED: "text-orange-400",
  trade_offer: "text-cyan-400",
};

export default function NotificationBell() {
  const { notifications, unreadNotificationCount, markNotificationsRead } = useGame();
  const [isOpen, setIsOpen] = useState(false);
  const hasMarkedReadRef = useRef(false);
  const { t } = useLanguage();

  // Auto-mark all as read when dropdown opens (with debounce to avoid double calls)
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (isOpen && unreadNotificationCount > 0 && !hasMarkedReadRef.current) {
      hasMarkedReadRef.current = true;
      // Small delay to ensure UI shows before marking
      timer = setTimeout(() => {
        markNotificationsRead();
      }, 500);
    }
    
    // Reset when dropdown closes
    if (!isOpen) {
      hasMarkedReadRef.current = false;
    }
    
    // Cleanup timer when dropdown closes or component unmounts
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isOpen, unreadNotificationCount, markNotificationsRead]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return t('justNow');
    if (diffMins < 60) return `${diffMins} ${t('minutesAgo')}`;
    if (diffHours < 24) return `${diffHours} ${t('hoursAgo')}`;
    return `${diffDays} ${t('daysAgo')}`;
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="notification-bell"
        >
          <Bell className="w-5 h-5" weight={unreadNotificationCount > 0 ? "fill" : "regular"} />
          {unreadNotificationCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
              {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80" data-testid="notification-dropdown">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="font-semibold text-sm">{t('notifications')}</span>
          {unreadNotificationCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={markNotificationsRead}
              data-testid="mark-all-read"
            >
              <Check className="w-3 h-3 mr-1" />
              {t('markAllAsRead')}
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {t('noNotifications')}
            </div>
          ) : (
            notifications.map((notif) => {
              const Icon = TYPE_ICONS[notif.type] || Bell;
              const colorClass = TYPE_COLORS[notif.type] || "text-muted-foreground";
              
              return (
                <DropdownMenuItem
                  key={notif.id}
                  className={cn(
                    "flex items-start gap-3 p-3 cursor-default focus:bg-muted/50",
                    notif.read === 0 && "bg-primary/5"
                  )}
                  data-testid={`notification-${notif.id}`}
                >
                  <div className={cn("mt-0.5 p-1.5 rounded-full bg-muted", colorClass)}>
                    <Icon className="w-4 h-4" weight="fill" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm leading-tight", notif.read === 0 && "font-medium")}>
                      {notif.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatTime(notif.createdAt)}
                    </p>
                  </div>
                  {notif.read === 0 && (
                    <div className="w-2 h-2 bg-primary rounded-full mt-1.5 shrink-0" />
                  )}
                </DropdownMenuItem>
              );
            })
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
