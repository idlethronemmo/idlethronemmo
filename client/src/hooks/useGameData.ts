import { useState, useEffect } from "react";
import { loadItemsData, isItemsLoaded } from "@/lib/items";
import { loadMonstersData, isMonstersLoaded } from "@/lib/monsters";

export function useItemsData() {
  const [isLoaded, setIsLoaded] = useState(isItemsLoaded());

  useEffect(() => {
    if (isItemsLoaded()) {
      setIsLoaded(true);
      return;
    }

    loadItemsData().then(() => {
      setIsLoaded(true);
    });
  }, []);

  return { isLoaded };
}

export function useMonstersData() {
  const [isLoaded, setIsLoaded] = useState(isMonstersLoaded());

  useEffect(() => {
    if (isMonstersLoaded()) {
      setIsLoaded(true);
      return;
    }

    loadMonstersData().then(() => {
      setIsLoaded(true);
    });
  }, []);

  return { isLoaded };
}

export function useGameData() {
  const { isLoaded: itemsLoaded } = useItemsData();
  const { isLoaded: monstersLoaded } = useMonstersData();

  return {
    isLoaded: itemsLoaded && monstersLoaded,
    itemsLoaded,
    monstersLoaded
  };
}
