import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

interface RaidLockContextType {
  isRaidLocked: boolean;
  setRaidLocked: (locked: boolean) => void;
  isDungeonLocked: boolean;
  setDungeonLocked: (locked: boolean) => void;
}

const RaidLockContext = createContext<RaidLockContextType | null>(null);

export function RaidLockProvider({ children }: { children: ReactNode }) {
  const [isRaidLocked, setIsRaidLocked] = useState(false);
  const [isDungeonLocked, setIsDungeonLocked] = useState(false);

  const setRaidLocked = useCallback((locked: boolean) => {
    setIsRaidLocked(locked);
  }, []);

  const setDungeonLocked = useCallback((locked: boolean) => {
    setIsDungeonLocked(locked);
  }, []);

  useEffect(() => {
    if (!isRaidLocked && !isDungeonLocked) return;
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      const msg = isDungeonLocked
        ? "You are in an active dungeon. Are you sure you want to leave?"
        : "You are in an active raid. Are you sure you want to leave?";
      e.returnValue = msg;
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isRaidLocked, isDungeonLocked]);

  return (
    <RaidLockContext.Provider value={{ isRaidLocked, setRaidLocked, isDungeonLocked, setDungeonLocked }}>
      {children}
    </RaidLockContext.Provider>
  );
}

export function useRaidLock() {
  const context = useContext(RaidLockContext);
  if (!context) {
    return { isRaidLocked: false, setRaidLocked: () => {}, isDungeonLocked: false, setDungeonLocked: () => {} };
  }
  return context;
}
