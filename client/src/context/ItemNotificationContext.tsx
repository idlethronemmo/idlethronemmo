import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from "react";

interface ItemNotification {
  id: number;
  itemName: string;
  quantity: number;
  iconUrl?: string;
}

interface ItemNotificationContextType {
  notifications: ItemNotification[];
  showItemNotification: (itemName: string, quantity: number, iconUrl?: string) => void;
}

const ItemNotificationContext = createContext<ItemNotificationContextType | undefined>(undefined);

let globalShowItemNotification: ((itemName: string, quantity: number, iconUrl?: string) => void) | null = null;

export function getShowItemNotification() {
  return globalShowItemNotification;
}

export function ItemNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<ItemNotification[]>([]);
  const idCounter = useRef(0);

  const showItemNotification = useCallback((itemName: string, quantity: number, iconUrl?: string) => {
    const id = ++idCounter.current;
    
    setNotifications(prev => [...prev, { id, itemName, quantity, iconUrl }]);
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 2000);
  }, []);

  globalShowItemNotification = showItemNotification;

  const value = useMemo(() => ({ notifications, showItemNotification }), [notifications, showItemNotification]);

  return (
    <ItemNotificationContext.Provider value={value}>
      {children}
    </ItemNotificationContext.Provider>
  );
}

export function useItemNotification() {
  const context = useContext(ItemNotificationContext);
  if (!context) {
    throw new Error("useItemNotification must be used within ItemNotificationProvider");
  }
  return context;
}
