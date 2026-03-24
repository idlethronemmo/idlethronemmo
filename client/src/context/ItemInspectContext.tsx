import { createContext, useContext, useState, ReactNode } from "react";

interface InspectItem {
  name: string;
  quantity?: number;
  fromChat?: boolean;
}

interface ItemInspectContextType {
  inspectedItem: InspectItem | null;
  openInspect: (item: InspectItem) => void;
  closeInspect: () => void;
}

const ItemInspectContext = createContext<ItemInspectContextType | null>(null);

export function ItemInspectProvider({ children }: { children: ReactNode }) {
  const [inspectedItem, setInspectedItem] = useState<InspectItem | null>(null);

  const openInspect = (item: InspectItem) => {
    setInspectedItem(item);
  };

  const closeInspect = () => {
    setInspectedItem(null);
  };

  return (
    <ItemInspectContext.Provider value={{ inspectedItem, openInspect, closeInspect }}>
      {children}
    </ItemInspectContext.Provider>
  );
}

export function useItemInspect() {
  const context = useContext(ItemInspectContext);
  if (!context) {
    throw new Error("useItemInspect must be used within an ItemInspectProvider");
  }
  return context;
}
