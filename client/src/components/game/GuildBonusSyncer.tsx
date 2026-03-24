import { useEffect } from "react";
import { useGame } from "@/context/GameContext";
import { useGuild } from "@/context/GuildContext";

export function GuildBonusSyncer() {
  const { setGuildBonuses } = useGame();
  const { myBonuses } = useGuild();
  
  useEffect(() => {
    setGuildBonuses(myBonuses);
  }, [myBonuses, setGuildBonuses]);
  
  return null;
}
