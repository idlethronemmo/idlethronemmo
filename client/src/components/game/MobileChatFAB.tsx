import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, Globe, Mail, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface MobileChatFABProps {
  unreadPmCount: number;
  unreadGlobalCount: number;
  onOpenGlobalChat: () => void;
  onOpenPrivateMessages: () => void;
}

interface Position {
  x: number;
  y: number;
}

const STORAGE_KEY = "chatFabPosition";
const FAB_SIZE = 56;
const SAFE_MARGIN = 16;
const HOLD_DELAY = 200;

function getDefaultPosition(): Position {
  if (typeof window === "undefined") {
    return { x: 16, y: 100 };
  }
  return {
    x: window.innerWidth - FAB_SIZE - SAFE_MARGIN,
    y: window.innerHeight - FAB_SIZE - 80 - SAFE_MARGIN,
  };
}

function loadPosition(): Position | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        return parsed;
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function savePosition(pos: Position) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // Ignore errors
  }
}

function clampPosition(pos: Position): Position {
  if (typeof window === "undefined") return pos;
  const maxX = window.innerWidth - FAB_SIZE - SAFE_MARGIN;
  const maxY = window.innerHeight - FAB_SIZE - 80;
  // Ensure valid values (protect against NaN or invalid stored values)
  const safeX = Number.isFinite(pos.x) ? pos.x : maxX;
  const safeY = Number.isFinite(pos.y) ? pos.y : maxY;
  return {
    x: Math.max(SAFE_MARGIN, Math.min(maxX, safeX)),
    y: Math.max(SAFE_MARGIN + 60, Math.min(maxY, safeY)),
  };
}

function snapToEdge(pos: Position): Position {
  const midX = window.innerWidth / 2;
  const snapX = pos.x + FAB_SIZE / 2 < midX 
    ? SAFE_MARGIN 
    : window.innerWidth - FAB_SIZE - SAFE_MARGIN;
  return clampPosition({ x: snapX, y: pos.y });
}

export default function MobileChatFAB({
  unreadPmCount,
  unreadGlobalCount,
  onOpenGlobalChat,
  onOpenPrivateMessages,
}: MobileChatFABProps) {
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [position, setPosition] = useState<Position>(getDefaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  
  const dragRef = useRef<{
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const stored = loadPosition();
    if (stored) {
      // Validate and clamp stored position
      const clamped = clampPosition(stored);
      setPosition(clamped);
      // If position was clamped significantly, save the new valid position
      if (Math.abs(clamped.x - stored.x) > 50 || Math.abs(clamped.y - stored.y) > 50) {
        savePosition(clamped);
      }
    } else {
      // No stored position, use default
      setPosition(getDefaultPosition());
    }
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => clampPosition(prev));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (menuOpen) return;
    const touch = e.touches[0];
    const rect = fabRef.current?.getBoundingClientRect();
    if (!rect) return;

    const offsetX = touch.clientX - rect.left;
    const offsetY = touch.clientY - rect.top;

    holdTimerRef.current = window.setTimeout(() => {
      setIsDragging(true);
      dragRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        offsetX,
        offsetY,
      };
    }, HOLD_DELAY);
  }, [menuOpen]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (holdTimerRef.current) {
      const touch = e.touches[0];
      const dragData = dragRef.current;
      if (dragData) {
        const dx = Math.abs(touch.clientX - dragData.startX);
        const dy = Math.abs(touch.clientY - dragData.startY);
        if (dx > 5 || dy > 5) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
      }
    }

    if (!isDragging || !dragRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const newX = touch.clientX - dragRef.current.offsetX;
    const newY = touch.clientY - dragRef.current.offsetY;
    setPosition(clampPosition({ x: newX, y: newY }));
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (isDragging) {
      const snapped = snapToEdge(position);
      setPosition(snapped);
      savePosition(snapped);
      setIsDragging(false);
      dragRef.current = null;
    }
  }, [isDragging, position]);

  const handleClick = useCallback(() => {
    if (!isDragging) {
      setMenuOpen((prev) => !prev);
    }
  }, [isDragging]);

  const handleGlobalChat = useCallback(() => {
    setMenuOpen(false);
    onOpenGlobalChat();
  }, [onOpenGlobalChat]);

  const handlePrivateMessages = useCallback(() => {
    setMenuOpen(false);
    onOpenPrivateMessages();
  }, [onOpenPrivateMessages]);

  const handleCloseMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  if (!isMobile) {
    return null;
  }

  const displayCount = unreadPmCount > 99 ? "99+" : unreadPmCount;
  const displayGlobalCount = unreadGlobalCount > 99 ? "99+" : unreadGlobalCount;
  const totalUnread = unreadPmCount + unreadGlobalCount;

  const content = (
    <>
      {menuOpen && (
        <div
          className="fixed inset-0 z-[9997]"
          onClick={handleCloseMenu}
          data-testid="chat-fab-overlay"
        />
      )}

      {menuOpen && (
        <div
          className={cn(
            "fixed z-[9998] bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-xl overflow-hidden min-w-[180px]",
            "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
          )}
          style={{
            left: position.x < window.innerWidth / 2 ? position.x : undefined,
            right: position.x >= window.innerWidth / 2 ? window.innerWidth - position.x - FAB_SIZE : undefined,
            bottom: window.innerHeight - position.y + 8,
          }}
          data-testid="chat-fab-menu"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
            <span className="font-display font-bold text-sm">Chat</span>
            <button
              onClick={handleCloseMenu}
              className="p-1 rounded-md hover:bg-accent"
              data-testid="chat-fab-close-menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="py-2">
            <button
              onClick={handleGlobalChat}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent active:bg-accent/80",
                unreadGlobalCount > 0 && "bg-orange-500/10"
              )}
              style={unreadGlobalCount > 0 ? {
                boxShadow: 'inset 0 0 20px rgba(249, 115, 22, 0.3)'
              } : undefined}
              data-testid="chat-fab-global-chat"
            >
              <Globe className={cn("w-5 h-5", unreadGlobalCount > 0 ? "text-orange-400" : "text-primary")} />
              <span className={cn("font-ui text-sm flex-1", unreadGlobalCount > 0 && "text-orange-300 font-medium")}>Global Chat</span>
              {unreadGlobalCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs font-bold bg-orange-500 text-white rounded-full">
                  {displayGlobalCount}
                </span>
              )}
            </button>
            <button
              onClick={handlePrivateMessages}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent active:bg-accent/80",
                unreadPmCount > 0 && "bg-yellow-500/10"
              )}
              style={unreadPmCount > 0 ? {
                boxShadow: 'inset 0 0 20px rgba(250, 204, 21, 0.3)'
              } : undefined}
              data-testid="chat-fab-private-messages"
            >
              <Mail className={cn("w-5 h-5", unreadPmCount > 0 ? "text-yellow-400" : "text-primary")} />
              <span className={cn("font-ui text-sm flex-1", unreadPmCount > 0 && "text-yellow-300 font-medium")}>Messages</span>
              {unreadPmCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs font-bold bg-red-500 text-white rounded-full">
                  {displayCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      <button
        ref={fabRef}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "fixed z-[9999] flex items-center justify-center",
          "w-12 h-12 rounded-full",
          "bg-gradient-to-br from-zinc-800 to-zinc-900",
          "text-zinc-300",
          "border border-zinc-600/50",
          "shadow-lg transition-all duration-200",
          "active:scale-95",
          isDragging && "scale-110 shadow-2xl from-zinc-700 to-zinc-800",
          !isVisible && "opacity-0 translate-y-4",
          isVisible && "opacity-100 translate-y-0"
        )}
        style={{
          left: position.x,
          top: position.y,
          boxShadow: isDragging
            ? "0 4px 20px rgba(0, 0, 0, 0.5)"
            : "0 2px 12px rgba(0, 0, 0, 0.4)",
          touchAction: "none",
        }}
        data-testid="mobile-chat-fab"
      >
        <MessageCircle className="w-5 h-5" />

        {totalUnread > 0 && !menuOpen && (
          <span
            className={cn(
              "absolute -top-1 -right-1",
              "min-w-[22px] h-[22px] px-1",
              "flex items-center justify-center",
              "text-xs font-bold",
              "text-white rounded-full",
              "border-2 border-background",
              unreadGlobalCount > 0 && unreadPmCount === 0 ? "bg-orange-500" : "bg-red-500"
            )}
          >
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>
    </>
  );

  return createPortal(content, document.body);
}
