import { useRef, useCallback, useEffect } from "react";
import { getAuthHeaders } from "@/context/FirebaseAuthContext";
import { useQueryClient } from "@tanstack/react-query";

const SYNC_INTERVAL = 30000;

type AchievementCounters = Record<string, number>;

let incrementCounters: AchievementCounters = {};
let setCounters: AchievementCounters = {};
let dirty = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let isSyncing = false;

async function syncToServer(queryClient: any) {
  if (!dirty || isSyncing) return;
  isSyncing = true;

  const updates: { trackingKey: string; value: number; mode: "increment" | "set" }[] = [];
  for (const [key, value] of Object.entries(incrementCounters)) {
    if (value > 0) {
      updates.push({ trackingKey: key, value, mode: "increment" });
    }
  }
  for (const [key, value] of Object.entries(setCounters)) {
    if (value > 0) {
      updates.push({ trackingKey: key, value, mode: "set" });
    }
  }

  if (updates.length === 0) {
    isSyncing = false;
    return;
  }

  const snapshotIncrement = { ...incrementCounters };
  const snapshotSet = { ...setCounters };

  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/achievement-progress", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        "x-session-token": localStorage.getItem("gameSessionToken") || "",
      },
      body: JSON.stringify({ updates }),
    });

    if (res.ok) {
      const data = await res.json();
      for (const key of Object.keys(snapshotIncrement)) {
        incrementCounters[key] = (incrementCounters[key] || 0) - (snapshotIncrement[key] || 0);
        if (incrementCounters[key] <= 0) delete incrementCounters[key];
      }
      for (const key of Object.keys(snapshotSet)) {
        if (setCounters[key] === snapshotSet[key]) {
          delete setCounters[key];
        }
      }
      const hasRemainingIncrements = Object.keys(incrementCounters).length > 0;
      const hasRemainingSets = Object.keys(setCounters).length > 0;
      dirty = hasRemainingIncrements || hasRemainingSets;

      if (data.newlyCompleted && data.newlyCompleted.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/player-achievements"] });
        window.dispatchEvent(new CustomEvent("achievement:completed", {
          detail: { completed: data.newlyCompleted, goldReward: data.totalGoldReward }
        }));
      }
    }
  } catch (e) {
    // Retry next cycle
  } finally {
    isSyncing = false;
  }
}

export function incrementAchievement(key: string, amount: number = 1) {
  incrementCounters[key] = (incrementCounters[key] || 0) + amount;
  dirty = true;
}

export function setAchievementValue(key: string, value: number) {
  if (value > (setCounters[key] || 0)) {
    setCounters[key] = value;
    dirty = true;
  }
}

export function getPendingCounters(): { increments: AchievementCounters; sets: AchievementCounters } {
  return { increments: { ...incrementCounters }, sets: { ...setCounters } };
}

export function trackKill(monsterId: string, regionId?: string) {
  incrementAchievement(`kill_${monsterId}`);
  incrementAchievement("total_kills");
  if (regionId) {
    incrementAchievement(`region_kills_${regionId}`);
  }
}

export function trackDamage(amount: number) {
  incrementAchievement("total_damage", amount);
}

export function trackDeath() {
  incrementAchievement("total_deaths");
}

export function trackSkillAction(skillId: string, xpGained?: number) {
  if (["woodcutting", "mining", "fishing", "hunting"].includes(skillId)) {
    incrementAchievement(`${skillId}_actions`);
    if (xpGained) incrementAchievement(`${skillId}_xp`, xpGained);
  } else if (skillId === "crafting") {
    incrementAchievement("crafting_actions");
    if (xpGained) incrementAchievement("crafting_xp", xpGained);
  } else if (skillId === "cooking") {
    incrementAchievement("cooking_actions");
    if (xpGained) incrementAchievement("cooking_xp", xpGained);
  } else if (skillId === "alchemy") {
    incrementAchievement("alchemy_actions");
    if (xpGained) incrementAchievement("alchemy_xp", xpGained);
  } else if (skillId === "firemaking") {
    incrementAchievement("firemaking_actions");
    if (xpGained) incrementAchievement("firemaking_xp", xpGained);
  }
}

export function trackCraft(rarity?: string) {
  if (rarity) {
    const key = `craft_${rarity}`;
    incrementAchievement(key);
  }
}

export function trackCombatXp(amount: number) {
  incrementAchievement("combat_xp", amount);
}

export function trackFoodEaten() {
  incrementAchievement("food_eaten");
}

export function trackPotionUsed() {
  incrementAchievement("potions_used");
}

export function trackGoldEarned(amount: number) {
  incrementAchievement("gold_earned", amount);
}

export function trackGoldSpent(amount: number) {
  incrementAchievement("gold_spent", amount);
}

export function trackMarketSale() {
  incrementAchievement("market_sales");
}

export function trackMarketPurchase() {
  incrementAchievement("market_purchases");
}

export function trackTradeCompleted() {
  incrementAchievement("trades_completed");
}

export function trackItemLooted(isRare?: boolean) {
  incrementAchievement("items_looted");
  if (isRare) incrementAchievement("rare_drops");
}

export function trackItemDrop(itemId: string) {
  incrementAchievement(`drop_${itemId}`);
}

export function trackTravel() {
  incrementAchievement("travel_count");
}

export function trackSkillLevel(skillId: string, level: number) {
  setAchievementValue(`level_${skillId}`, level);
}

export function trackTotalLevel(totalLevel: number) {
  setAchievementValue("total_level", totalLevel);
}

export function trackHpHealed(amount: number) {
  incrementAchievement("hp_healed", amount);
}

export function trackEnhancementAttempt(succeeded: boolean) {
  incrementAchievement("enhancements_attempted");
  if (succeeded) incrementAchievement("enhancements_succeeded");
}

export function trackDungeonEntered() {
  incrementAchievement("dungeons_entered");
}

export function trackDungeonCompleted() {
  incrementAchievement("dungeons_completed");
}

export function trackDungeonFloorCleared() {
  incrementAchievement("dungeon_floors_cleared");
}

export function trackDungeonBossKilled() {
  incrementAchievement("dungeon_bosses_killed");
}

export function trackPartyKill() {
  incrementAchievement("party_kills");
}

export function trackWeaponMastery(weaponType: string, level: number) {
  setAchievementValue(`mastery_${weaponType}`, level);
}

export function trackNpcPurchase() {
  incrementAchievement("npc_purchases");
}

export function trackGuildContribution() {
  incrementAchievement("guild_contributions");
}

export function trackGuildXpContributed(amount: number) {
  incrementAchievement("guild_xp_contributed", amount);
}

export function trackChatMessage() {
  incrementAchievement("chat_messages");
}

export function trackRegionVisited(regionId: string) {
  incrementAchievement("regions_visited");
}

export function trackItemEquipped() {
  incrementAchievement("items_equipped");
}

export function trackEquipmentRepaired() {
  incrementAchievement("equipment_repaired");
}

export function trackItemStudied() {
  incrementAchievement("items_studied");
}

export function trackItemSalvaged() {
  incrementAchievement("items_salvaged");
}

export function trackDungeonKeyUsed() {
  incrementAchievement("dungeon_keys_used");
}

export function trackDailyQuestCompleted() {
  incrementAchievement("daily_quests_completed");
}

export function trackDailyLoginClaimed() {
  incrementAchievement("daily_login_claimed");
}

export function useAchievementTracker() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const load = async () => {
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch("/api/player-achievements", {
          credentials: "include",
          headers: { ...authHeaders, "x-session-token": localStorage.getItem("gameSessionToken") || "" },
        });
        if (res.ok) {
          await res.json();
        }
      } catch (e) {}
    };

    load();

    syncTimer = setInterval(() => syncToServer(queryClient), SYNC_INTERVAL);

    const handleBeforeUnload = () => {
      if (dirty) {
        const updates: { trackingKey: string; value: number; mode: "increment" | "set" }[] = [];
        for (const [key, value] of Object.entries(incrementCounters)) {
          if (value > 0) updates.push({ trackingKey: key, value, mode: "increment" });
        }
        for (const [key, value] of Object.entries(setCounters)) {
          if (value > 0) updates.push({ trackingKey: key, value, mode: "set" });
        }
        if (updates.length > 0) {
          const sessionToken = localStorage.getItem("gameSessionToken") || "";
          const blob = new Blob([JSON.stringify({ updates, sessionToken })], { type: "application/json" });
          navigator.sendBeacon("/api/achievement-progress", blob);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (syncTimer) clearInterval(syncTimer);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [queryClient]);

  const forceSync = useCallback(() => syncToServer(queryClient), [queryClient]);

  return { forceSync };
}
