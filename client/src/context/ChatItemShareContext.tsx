import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface SharedItem {
  itemName: string;
  enhancementLevel?: number;
}

interface ChatItemShareContextType {
  pendingItems: SharedItem[];
  addItem: (item: SharedItem) => void;
  removeItem: (index: number) => void;
  clearItems: () => void;
  openChatRequested: boolean;
  requestOpenChat: () => void;
  clearOpenChatRequest: () => void;
}

const ChatItemShareContext = createContext<ChatItemShareContextType | null>(null);

export function ChatItemShareProvider({ children }: { children: ReactNode }) {
  const [pendingItems, setPendingItems] = useState<SharedItem[]>([]);
  const [openChatRequested, setOpenChatRequested] = useState(false);

  const addItem = useCallback((item: SharedItem) => {
    setPendingItems((prev) => {
      if (prev.length >= 5) return prev;
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    setPendingItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearItems = useCallback(() => {
    setPendingItems([]);
  }, []);

  const requestOpenChat = useCallback(() => {
    setOpenChatRequested(true);
  }, []);

  const clearOpenChatRequest = useCallback(() => {
    setOpenChatRequested(false);
  }, []);

  return (
    <ChatItemShareContext.Provider value={{ pendingItems, addItem, removeItem, clearItems, openChatRequested, requestOpenChat, clearOpenChatRequest }}>
      {children}
    </ChatItemShareContext.Provider>
  );
}

export function useChatItemShare() {
  const context = useContext(ChatItemShareContext);
  if (!context) {
    throw new Error("useChatItemShare must be used within a ChatItemShareProvider");
  }
  return context;
}
