import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Shield, Plus, Pencil, Trash, Eye, EyeSlash, ArrowLeft, Warning, Broadcast, Database, MapTrifold, CloudArrowUp, ChatTeardrop } from "@phosphor-icons/react";
import { useLocation } from "wouter";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useDevMode } from "@/context/DevModeContext";
import { queryClient } from "@/lib/queryClient";
import ItemEditor from "./admin/ItemEditor";
import RecipeEditor from "./admin/RecipeEditor";
import MonsterEditor from "./admin/MonsterEditor";
import RegionEditor from "./admin/RegionEditor";
import SkillActionEditor from "./admin/SkillActionEditor";
import AchievementEditor from "./admin/AchievementEditor";

const ADMIN_KEY_STORAGE = "admin_panel_key";
const ADMIN_ALLOWED_EMAILS = ["betelgeusestd@gmail.com", "yusufakgn61@gmail.com"];

type TabType = "items" | "monsters" | "regions" | "recipes" | "skillActions" | "raidBosses" | "players" | "dungeons" | "dungeonSessions" | "dungeonModifiers" | "keyConfig" | "partySynergies" | "badges" | "achievements" | "security";

interface ApiConfig {
  endpoint: string;
  label: string;
  fields: { key: string; label: string; type: "text" | "number" | "textarea" | "json"; required?: boolean; displayUnit?: "seconds" }[];
  displayFields: string[];
  canDelete?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
}

const API_CONFIGS: Record<TabType, ApiConfig> = {
  items: {
    endpoint: "/api/admin/items",
    label: "Items",
    canDelete: true,
    canCreate: true,
    displayFields: ["id", "name", "type", "equipSlot", "levelRequired", "vendorPrice", "isDraft"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "type", label: "Type", type: "text", required: true },
      { key: "equipSlot", label: "Equip Slot", type: "text" },
      { key: "stats", label: "Stats (JSON)", type: "json" },
      { key: "levelRequired", label: "Level Required", type: "number" },
      { key: "skillRequired", label: "Skill Required", type: "text" },
      { key: "vendorPrice", label: "Vendor Price", type: "number" },
      { key: "untradable", label: "Untradable (0/1)", type: "number" },
      { key: "duration", label: "Duration (sec)", type: "number", displayUnit: "seconds" },
      { key: "effect", label: "Effect (JSON)", type: "json" },
      { key: "weaponCategory", label: "Weapon Category", type: "text" },
      { key: "attackSpeedMs", label: "Attack Speed (sec)", type: "number", displayUnit: "seconds" },
      { key: "lifestealPercent", label: "Lifesteal (%)", type: "number" },
      { key: "weaponSkills", label: "Weapon Skills (JSON)", type: "json" },
      { key: "rarity", label: "Rarity", type: "text" },
      { key: "healAmount", label: "Heal Amount", type: "number" },
      { key: "nameTranslations", label: "Name Translations (JSON)", type: "json" },
      { key: "descriptionTranslations", label: "Description Translations (JSON)", type: "json" },
      { key: "isDraft", label: "Draft (0/1)", type: "number" },
    ],
  },
  monsters: {
    endpoint: "/api/admin/monsters",
    label: "Monsters",
    canDelete: true,
    canCreate: true,
    displayFields: ["id", "name", "regionId", "maxHitpoints", "attackLevel", "defenceLevel", "isDraft"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "regionId", label: "Region ID", type: "text", required: true },
      { key: "maxHitpoints", label: "Max HP", type: "number", required: true },
      { key: "attackLevel", label: "Attack Level", type: "number", required: true },
      { key: "strengthLevel", label: "Strength Level", type: "number", required: true },
      { key: "defenceLevel", label: "Defence Level", type: "number", required: true },
      { key: "attackBonus", label: "Attack Bonus", type: "number" },
      { key: "strengthBonus", label: "Strength Bonus", type: "number" },
      { key: "attackSpeed", label: "Attack Speed (sec)", type: "number", required: true, displayUnit: "seconds" },
      { key: "loot", label: "Loot (JSON)", type: "json", required: true },
      { key: "xpReward", label: "XP Reward (JSON)", type: "json", required: true },
      { key: "skills", label: "Skills (JSON)", type: "json" },
      { key: "icon", label: "Icon URL", type: "text" },
      { key: "nameTranslations", label: "Name Translations (JSON)", type: "json" },
      { key: "isDraft", label: "Draft (0/1)", type: "number" },
    ],
  },
  regions: {
    endpoint: "/api/admin/regions",
    label: "Regions",
    canDelete: true,
    canCreate: true,
    displayFields: ["id", "name", "levelRangeMin", "levelRangeMax", "sortOrder"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "levelRangeMin", label: "Min Level", type: "number", required: true },
      { key: "levelRangeMax", label: "Max Level", type: "number", required: true },
      { key: "color", label: "Color", type: "text", required: true },
      { key: "sortOrder", label: "Sort Order", type: "number", required: true },
      { key: "icon", label: "Icon", type: "text" },
      { key: "nameTranslations", label: "Name Translations (JSON)", type: "json" },
      { key: "descriptionTranslations", label: "Description Translations (JSON)", type: "json" },
    ],
  },
  recipes: {
    endpoint: "/api/admin/recipes",
    label: "Recipes",
    canDelete: true,
    canCreate: true,
    displayFields: ["id", "resultItemId", "skill", "regionId", "levelRequired", "xpReward", "isDraft"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true },
      { key: "resultItemId", label: "Result Item ID", type: "text", required: true },
      { key: "resultQuantity", label: "Result Quantity", type: "number", required: true },
      { key: "materials", label: "Materials (JSON)", type: "json", required: true },
      { key: "skill", label: "Skill", type: "text", required: true },
      { key: "levelRequired", label: "Level Required", type: "number", required: true },
      { key: "xpReward", label: "XP Reward", type: "number", required: true },
      { key: "craftTime", label: "Craft Time (sec)", type: "number", required: true, displayUnit: "seconds" },
      { key: "category", label: "Category", type: "text" },
      { key: "regionId", label: "Region ID", type: "text" },
      { key: "isDraft", label: "Draft (0/1)", type: "number" },
    ],
  },
  raidBosses: {
    endpoint: "/api/admin/raid-bosses",
    label: "Raid Bosses",
    canDelete: false,
    canCreate: false,
    displayFields: ["id", "name", "baseHp", "attackLevel", "defenceLevel"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "icon", label: "Icon URL", type: "text" },
      { key: "baseHp", label: "Base HP", type: "number", required: true },
      { key: "attackLevel", label: "Attack Level", type: "number", required: true },
      { key: "strengthLevel", label: "Strength Level", type: "number", required: true },
      { key: "defenceLevel", label: "Defence Level", type: "number", required: true },
      { key: "attackSpeed", label: "Attack Speed (sec)", type: "number", required: true, displayUnit: "seconds" },
      { key: "skills", label: "Skills (JSON)", type: "json" },
      { key: "loot", label: "Loot (JSON)", type: "json" },
      { key: "milestoneRewards", label: "Milestone Rewards (JSON)", type: "json" },
      { key: "tokenReward", label: "Token Reward", type: "number" },
      { key: "rotationWeek", label: "Rotation Week", type: "number" },
    ],
  },
  skillActions: {
    endpoint: "/api/admin/skill-actions",
    label: "Skill Actions",
    canDelete: true,
    canCreate: true,
    displayFields: ["id", "skill", "name", "regionId", "levelRequired", "xpReward", "duration", "isDraft"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true },
      { key: "skill", label: "Skill", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "itemId", label: "Produced Item ID", type: "text", required: true },
      { key: "levelRequired", label: "Level Required", type: "number", required: true },
      { key: "xpReward", label: "XP Reward", type: "number", required: true },
      { key: "duration", label: "Duration (sec)", type: "number", required: true, displayUnit: "seconds" },
      { key: "requiredBait", label: "Required Bait (Fishing)", type: "text" },
      { key: "baitAmount", label: "Bait Amount", type: "number" },
      { key: "icon", label: "Icon URL", type: "text" },
      { key: "regionId", label: "Region ID", type: "text" },
      { key: "sortOrder", label: "Sort Order", type: "number" },
      { key: "nameTranslations", label: "Name Translations (JSON)", type: "json" },
      { key: "descriptionTranslations", label: "Description Translations (JSON)", type: "json" },
      { key: "isDraft", label: "Draft (0/1)", type: "number" },
    ],
  },
  players: {
    endpoint: "/api/admin/players",
    label: "Players",
    canDelete: true,
    canCreate: false,
    canEdit: false,
    displayFields: ["id", "username", "email", "totalLevel", "gold", "staffRole", "isTester"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true },
      { key: "username", label: "Username", type: "text", required: true },
      { key: "email", label: "Email", type: "text" },
      { key: "totalLevel", label: "Total Level", type: "number" },
      { key: "gold", label: "Gold", type: "number" },
      { key: "lastSaved", label: "Last Saved", type: "text" },
      { key: "lastSeen", label: "Last Seen", type: "text" },
    ],
  },
  dungeons: {
    endpoint: "/api/admin/dungeons",
    label: "Dungeons",
    canDelete: true,
    canCreate: true,
    displayFields: ["id", "name", "tier", "keyType", "floorCount", "isActive"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "tier", label: "Tier (1-8)", type: "number", required: true },
      { key: "keyType", label: "Key Type (bronze/silver/gold/void)", type: "text", required: true },
      { key: "floorCount", label: "Floor Count (null for endless)", type: "number" },
      { key: "bossFloors", label: "Boss Floors (JSON array)", type: "json" },
      { key: "minLevel", label: "Min Level", type: "number", required: true },
      { key: "recommendedLevel", label: "Recommended Level", type: "number", required: true },
      { key: "isEndless", label: "Is Endless (0/1)", type: "number" },
      { key: "isActive", label: "Is Active (0/1)", type: "number" },
      { key: "icon", label: "Icon URL", type: "text" },
      { key: "nameTranslations", label: "Name Translations (JSON)", type: "json" },
      { key: "descriptionTranslations", label: "Description Translations (JSON)", type: "json" },
    ],
  },
  dungeonSessions: {
    endpoint: "/api/admin/dungeon-sessions/active",
    label: "Dungeon Sessions",
    canDelete: false,
    canCreate: false,
    canEdit: false,
    displayFields: ["playerUsername", "dungeonId", "mode", "status", "currentFloor", "startedAt"],
    fields: [],
  },
  dungeonModifiers: {
    endpoint: "/api/admin/dungeon-modifiers",
    label: "Dungeon Modifiers",
    canDelete: true,
    canCreate: true,
    displayFields: ["id", "name", "tier", "isActive"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "effect", label: "Effect (JSON: lootBonus, xpBonus, damageBonus, etc.)", type: "json", required: true },
      { key: "icon", label: "Icon URL", type: "text" },
      { key: "tier", label: "Tier", type: "number", required: true },
      { key: "isActive", label: "Is Active (0/1)", type: "number" },
      { key: "nameTranslations", label: "Name Translations (JSON)", type: "json" },
      { key: "descriptionTranslations", label: "Description Translations (JSON)", type: "json" },
    ],
  },
  keyConfig: {
    endpoint: "/api/admin/key-config",
    label: "Key Drop Config",
    canDelete: true,
    canCreate: true,
    displayFields: ["id", "keyType", "monsterTierMin", "monsterTierMax", "dropChance", "bossDropChance"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true },
      { key: "keyType", label: "Key Type (bronze/silver/gold/void)", type: "text", required: true },
      { key: "monsterTierMin", label: "Monster Tier Min", type: "number", required: true },
      { key: "monsterTierMax", label: "Monster Tier Max", type: "number", required: true },
      { key: "dropChance", label: "Drop Chance (out of 10000)", type: "number", required: true },
      { key: "bossDropChance", label: "Boss Drop Chance (out of 10000)", type: "number", required: true },
      { key: "isActive", label: "Is Active (0/1)", type: "number" },
    ],
  },
  partySynergies: {
    endpoint: "/api/admin/party-synergies",
    label: "Party Synergies",
    canDelete: true,
    canCreate: true,
    displayFields: ["id", "name", "isActive"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "requiredRoles", label: "Required Roles (JSON array)", type: "json", required: true },
      { key: "requiredConditions", label: "Required Conditions (JSON)", type: "json" },
      { key: "bonuses", label: "Bonuses (JSON: lootBonus, xpBonus, etc.)", type: "json", required: true },
      { key: "isActive", label: "Is Active (0/1)", type: "number" },
      { key: "nameTranslations", label: "Name Translations (JSON)", type: "json" },
      { key: "descriptionTranslations", label: "Description Translations (JSON)", type: "json" },
    ],
  },
  badges: {
    endpoint: "/api/admin/badges",
    label: "Badges",
    canDelete: true,
    canCreate: true,
    displayFields: ["imageUrl", "id", "name", "icon", "color", "rarity"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "icon", label: "Icon Name", type: "text", required: true },
      { key: "color", label: "Color", type: "text", required: true },
      { key: "rarity", label: "Rarity (common/uncommon/rare/legendary)", type: "text", required: true },
      { key: "imageUrl", label: "Image URL", type: "text" },
      { key: "nameTranslations", label: "Name Translations (JSON)", type: "json" },
      { key: "descriptionTranslations", label: "Description Translations (JSON)", type: "json" },
    ],
  },
  achievements: {
    endpoint: "/api/admin/achievements",
    label: "Achievements",
    canDelete: true,
    canCreate: true,
    displayFields: ["id", "name", "category", "trackingKey"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "category", label: "Category", type: "text", required: true },
      { key: "trackingKey", label: "Tracking Key", type: "text", required: true },
    ],
  },
  security: {
    endpoint: "/api/admin/suspicious-activities",
    label: "Security",
    canDelete: false,
    canCreate: false,
    canEdit: false,
    displayFields: [],
    fields: [],
  },
};

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, loading: authLoading } = useFirebaseAuth();
  const { isDevMode } = useDevMode();
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem(ADMIN_KEY_STORAGE) || "");
  const [showKey, setShowKey] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("items");
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [isFullAdmin, setIsFullAdmin] = useState(false);
  const [staffLoginLoading, setStaffLoginLoading] = useState(false);
  
  const rawUserEmail = user?.email || null;
  const userEmail: string = isDevMode ? (rawUserEmail || "dev@localhost") : (rawUserEmail || "");
  const isAllowedEmail = isDevMode || (userEmail ? ADMIN_ALLOWED_EMAILS.includes(userEmail) : false);
  const [data, setData] = useState<Record<TabType, any[]>>({
    items: [],
    monsters: [],
    regions: [],
    recipes: [],
    skillActions: [],
    raidBosses: [],
    players: [],
    dungeons: [],
    dungeonSessions: [],
    dungeonModifiers: [],
    keyConfig: [],
    partySynergies: [],
    badges: [],
    achievements: [],
    security: [],
  });
  const [loading, setLoading] = useState<Record<TabType, boolean>>({
    items: false,
    monsters: false,
    regions: false,
    recipes: false,
    skillActions: false,
    raidBosses: false,
    players: false,
    dungeons: false,
    dungeonSessions: false,
    dungeonModifiers: false,
    keyConfig: false,
    partySynergies: false,
    badges: false,
    achievements: false,
    security: false,
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialLoadDoneRef = useRef(false);
  const loadedTabsRef = useRef<Set<TabType>>(new Set());
  const [tabErrors, setTabErrors] = useState<Record<TabType, string | null>>({
    items: null,
    monsters: null,
    regions: null,
    recipes: null,
    skillActions: null,
    raidBosses: null,
    players: null,
    dungeons: null,
    dungeonSessions: null,
    dungeonModifiers: null,
    keyConfig: null,
    partySynergies: null,
    badges: null,
    achievements: null,
    security: null,
  });

  const [playerDetailDialogOpen, setPlayerDetailDialogOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [playerDetailLoading, setPlayerDetailLoading] = useState(false);
  const [playerDetailTab, setPlayerDetailTab] = useState("info");
  const [playerGold, setPlayerGold] = useState<number>(0);
  const [playerSkills, setPlayerSkills] = useState<any[]>([]);
  const [playerInventory, setPlayerInventory] = useState<any[]>([]);
  const [playerEquipment, setPlayerEquipment] = useState<any[]>([]);
  const [savingPlayerData, setSavingPlayerData] = useState(false);
  const [newItemId, setNewItemId] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemEnhLevel, setNewItemEnhLevel] = useState(0);
  const [newItemSkills, setNewItemSkills] = useState<string[]>([]);
  const [newItemStats, setNewItemStats] = useState<{stat: string, value: number}[]>([]);
  const [pendingItemMods, setPendingItemMods] = useState<Record<string, {enhancementLevel: number, addedStats: Record<string, number>, addedSkills: string[]}>>({});
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");
  const [editingEnhItemId, setEditingEnhItemId] = useState<string | null>(null);
  const [resetConfirmDialogOpen, setResetConfirmDialogOpen] = useState(false);
  const [resettingCharacter, setResettingCharacter] = useState(false);
  const [editingUsername, setEditingUsername] = useState("");
  const [playerMasteries, setPlayerMasteries] = useState<Record<string, number>>({
    masteryDagger: 0,
    masterySwordShield: 0,
    mastery2hSword: 0,
    mastery2hAxe: 0,
    mastery2hWarhammer: 0,
    masteryBow: 0,
    masteryStaff: 0,
  });

  const [playerDungeonKeys, setPlayerDungeonKeys] = useState<Record<string, number>>({
    bronze: 0, silver: 0, gold: 0, void: 0,
  });

  const [playerBadges, setPlayerBadges] = useState<any[]>([]);
  const [loadingPlayerBadges, setLoadingPlayerBadges] = useState(false);
  const [selectedBadgeToAward, setSelectedBadgeToAward] = useState("");

  const [suspiciousActivities, setSuspiciousActivities] = useState<any[]>([]);
  const [loadingSuspicious, setLoadingSuspicious] = useState(false);
  const [bannedEmails, setBannedEmails] = useState<any[]>([]);
  const [loadingBannedEmails, setLoadingBannedEmails] = useState(false);
  const [banPlayerId, setBanPlayerId] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banningPlayer, setBanningPlayer] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [achievements, setAchievements] = useState<any[]>([]);
  const [editingAchievement, setEditingAchievement] = useState<any | null>(null);
  const [creatingAchievement, setCreatingAchievement] = useState(false);
  const [savingAchievement, setSavingAchievement] = useState(false);

  const getAdminHeaders = useCallback(async (key: string): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};
    if (key) headers["x-admin-key"] = key;
    if (user) {
      try {
        const idToken = await user.getIdToken();
        headers["Authorization"] = `Bearer ${idToken}`;
      } catch {}
    }
    return headers;
  }, [user]);

  const fetchSingleTab = useCallback(async (tab: TabType, key: string, email: string): Promise<{ success: boolean; data: any[]; error?: string }> => {
    try {
      const config = API_CONFIGS[tab];
      const headers = await getAdminHeaders(key);
      const response = await fetch(config.endpoint, {
        headers,
        credentials: "include",
      });
      if (!response.ok) {
        const errorMsg = response.status === 401 ? "Invalid admin key" : 
                         response.status === 403 ? "Access denied" : 
                         `Server error: ${response.status}`;
        console.error(`Failed to fetch ${tab}: ${response.status}`);
        return { success: false, data: [], error: errorMsg };
      }
      const result = await response.json();
      console.log(`[Admin] Loaded ${tab}: ${Array.isArray(result) ? result.length : 0} items`);
      return { success: true, data: Array.isArray(result) ? result : [] };
    } catch (error) {
      console.error(`Error fetching ${tab}:`, error);
      return { success: false, data: [], error: "Network error" };
    }
  }, []);

  const authenticateAndFetch = useCallback(async () => {
    if (!adminKey) {
      setAuthError("Please enter the admin key");
      return;
    }
    if (!isDevMode && !userEmail) {
      setAuthError("You must be logged in to access the admin panel");
      return;
    }
    if (!isAllowedEmail) {
      setAuthError("Your account does not have permission to access the admin panel");
      return;
    }
    
    setAuthError(null);
    localStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
    
    // Set all tabs to loading
    setLoading({
      items: true,
      monsters: true,
      regions: true,
      recipes: true,
      skillActions: true,
      raidBosses: true,
      players: true,
      dungeons: true,
      dungeonSessions: false,
      dungeonModifiers: true,
      keyConfig: true,
      partySynergies: true,
      badges: true,
      achievements: true,
      security: false,
    });
    
    try {
      // First, verify auth with items endpoint
      const testResponse = await fetch(API_CONFIGS.items.endpoint, {
        headers: await getAdminHeaders(adminKey),
        credentials: "include",
      });
      
      if (!testResponse.ok) {
        if (testResponse.status === 401) {
          setIsAuthenticated(false);
          setAuthError("Invalid admin key");
          setLoading({ items: false, monsters: false, regions: false, recipes: false, skillActions: false, raidBosses: false, players: false, dungeons: false, dungeonSessions: false, dungeonModifiers: false, keyConfig: false, partySynergies: false, badges: false, achievements: false, security: false });
          return;
        }
        if (testResponse.status === 403) {
          setIsAuthenticated(false);
          setAuthError("Access denied for this account");
          setLoading({ items: false, monsters: false, regions: false, recipes: false, skillActions: false, raidBosses: false, players: false, dungeons: false, dungeonSessions: false, dungeonModifiers: false, keyConfig: false, partySynergies: false, badges: false, achievements: false, security: false });
          return;
        }
        throw new Error("Authentication failed");
      }
      
      // Auth successful - now load ALL tabs in parallel
      const tabs: TabType[] = ["items", "monsters", "regions", "recipes", "skillActions", "raidBosses", "players", "dungeons", "dungeonModifiers", "keyConfig", "partySynergies", "badges", "achievements"];
      const results = await Promise.all(
        tabs.map(tab => fetchSingleTab(tab, adminKey, userEmail))
      );
      
      // Update all data at once, only mark successful tabs as loaded
      const newData: Record<TabType, any[]> = {
        items: results[0].data,
        monsters: results[1].data,
        regions: results[2].data,
        recipes: results[3].data,
        skillActions: results[4].data,
        raidBosses: results[5].data,
        players: results[6].data,
        dungeons: results[7].data,
        dungeonSessions: [],
        dungeonModifiers: results[8].data,
        keyConfig: results[9].data,
        partySynergies: results[10].data,
        badges: results[11].data,
        achievements: results[12].data,
        security: [],
      };
      
      const newErrors: Record<TabType, string | null> = {
        items: results[0].error || null,
        monsters: results[1].error || null,
        regions: results[2].error || null,
        recipes: results[3].error || null,
        skillActions: results[4].error || null,
        raidBosses: results[5].error || null,
        players: results[6].error || null,
        dungeons: results[7].error || null,
        dungeonSessions: null,
        dungeonModifiers: results[8].error || null,
        keyConfig: results[9].error || null,
        partySynergies: results[10].error || null,
        badges: results[11].error || null,
        achievements: results[12].error || null,
        security: null,
      };
      
      console.log("[Admin] All data loaded:", {
        items: newData.items.length,
        monsters: newData.monsters.length,
        regions: newData.regions.length,
        recipes: newData.recipes.length,
        skillActions: newData.skillActions.length,
        raidBosses: newData.raidBosses.length,
        players: newData.players.length,
      });
      
      setData(newData);
      setAchievements(newData.achievements);
      setTabErrors(newErrors);
      initialLoadDoneRef.current = true;
      // Only mark successfully loaded tabs
      tabs.forEach((tab, index) => {
        if (results[index].success) {
          loadedTabsRef.current.add(tab);
        }
      });
      setIsAuthenticated(true);
      setIsFullAdmin(true);
      setAuthError(null);
      toast({ title: "Authenticated successfully", duration: 2000 });
    } catch (error) {
      console.error(`Error authenticating:`, error);
      setAuthError("Failed to authenticate. Please check your admin key.");
    } finally {
      setLoading({ items: false, monsters: false, regions: false, recipes: false, skillActions: false, raidBosses: false, players: false, dungeons: false, dungeonSessions: false, dungeonModifiers: false, keyConfig: false, partySynergies: false, badges: false, achievements: false, security: false });
    }
  }, [adminKey, userEmail, isAllowedEmail, toast, fetchSingleTab, getAdminHeaders]);

  const handleStaffLogin = useCallback(async () => {
    if (!user) {
      setAuthError("You must be logged in to use staff login");
      return;
    }
    setStaffLoginLoading(true);
    setAuthError(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/staff/check", {
        headers: { "Authorization": `Bearer ${idToken}` },
        credentials: "include",
      });
      if (!response.ok) {
        const errText = await response.text();
        setAuthError(errText || "Staff login failed");
        setStaffLoginLoading(false);
        return;
      }
      const result = await response.json();
      if (result.staffRole) {
        setStaffRole(result.staffRole);
        setIsAuthenticated(true);
        setAuthError(null);

        const staffTabs: TabType[] = result.staffRole === 'moderator'
          ? ["items", "monsters", "regions", "recipes", "skillActions", "dungeons", "players"]
          : ["items", "monsters", "regions", "recipes", "skillActions", "dungeons"];
        setLoading({
          items: true, monsters: true, regions: true, recipes: true,
          skillActions: true, raidBosses: false, players: result.staffRole === 'moderator',
          dungeons: true, dungeonSessions: false, dungeonModifiers: false, keyConfig: false,
          partySynergies: false, badges: false, achievements: false, security: false,
        });

        const results = await Promise.all(
          staffTabs.map(tab => fetchSingleTab(tab, "", userEmail))
        );

        const newData: Partial<Record<TabType, any[]>> = {};
        staffTabs.forEach((tab, i) => {
          newData[tab] = results[i].data;
          if (results[i].success) loadedTabsRef.current.add(tab);
        });
        setData(prev => ({ ...prev, ...newData }));
        setLoading({
          items: false, monsters: false, regions: false, recipes: false,
          skillActions: false, raidBosses: false, players: false,
          dungeons: false, dungeonSessions: false, dungeonModifiers: false, keyConfig: false,
          partySynergies: false, badges: false, achievements: false, security: false,
        });

        toast({ title: `Staff login successful (${result.staffRole})`, duration: 2000 });
      } else {
        setAuthError("Your account does not have a staff role assigned");
      }
    } catch (error) {
      console.error("Staff login error:", error);
      setAuthError("Staff login failed. Please try again.");
    } finally {
      setStaffLoginLoading(false);
    }
  }, [user, userEmail, toast, fetchSingleTab]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('staff') === '1' && user && !isAuthenticated && !staffLoginLoading && !authLoading) {
      handleStaffLogin();
    }
  }, [user, isAuthenticated, staffLoginLoading, authLoading, handleStaffLogin]);

  const fetchData = useCallback(async (tab: TabType) => {
    if ((!adminKey && !staffRole) || !userEmail) return;
    setLoading((prev) => ({ ...prev, [tab]: true }));
    setTabErrors((prev) => ({ ...prev, [tab]: null }));
    try {
      const result = await fetchSingleTab(tab, adminKey, userEmail);
      setData((prev) => ({ ...prev, [tab]: result.data }));
      if (result.success) {
        loadedTabsRef.current.add(tab);
        setTabErrors((prev) => ({ ...prev, [tab]: null }));
      } else {
        setTabErrors((prev) => ({ ...prev, [tab]: result.error || "Unknown error" }));
        toast({ title: `Failed to load ${tab}: ${result.error}`, variant: "destructive" });
      }
    } catch (error) {
      console.error(`Error fetching ${tab}:`, error);
      setTabErrors((prev) => ({ ...prev, [tab]: "Network error" }));
      toast({ title: `Failed to load ${tab}`, variant: "destructive" });
    } finally {
      setLoading((prev) => ({ ...prev, [tab]: false }));
    }
  }, [adminKey, userEmail, isAllowedEmail, toast, fetchSingleTab]);

  // Only fetch when switching tabs AND data hasn't been loaded yet
  useEffect(() => {
    if (isAuthenticated && !loadedTabsRef.current.has(activeTab)) {
      fetchData(activeTab);
    }
  }, [activeTab, isAuthenticated, fetchData]);

  const fetchSuspiciousActivities = useCallback(async () => {
    setLoadingSuspicious(true);
    try {
      const headers = await getAdminHeaders(adminKey);
      const response = await fetch("/api/admin/suspicious-activities?limit=100", { headers, credentials: "include" });
      if (response.ok) {
        const result = await response.json();
        setSuspiciousActivities(Array.isArray(result) ? result : []);
      }
    } catch (error) {
      console.error("Error fetching suspicious activities:", error);
    } finally {
      setLoadingSuspicious(false);
    }
  }, [adminKey, getAdminHeaders]);

  const fetchBannedEmails = useCallback(async () => {
    setLoadingBannedEmails(true);
    try {
      const headers = await getAdminHeaders(adminKey);
      const response = await fetch("/api/admin/banned-emails", { headers, credentials: "include" });
      if (response.ok) {
        const result = await response.json();
        setBannedEmails(Array.isArray(result) ? result : []);
      }
    } catch (error) {
      console.error("Error fetching banned emails:", error);
    } finally {
      setLoadingBannedEmails(false);
    }
  }, [adminKey, getAdminHeaders]);

  const markActivityReviewed = useCallback(async (activityId: string) => {
    try {
      const headers = await getAdminHeaders(adminKey);
      const response = await fetch(`/api/admin/suspicious-activities/${activityId}/review`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "Activity marked as reviewed", duration: 2000 });
        fetchSuspiciousActivities();
      } else {
        toast({ title: "Failed to mark as reviewed", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error marking activity", variant: "destructive" });
    }
  }, [adminKey, getAdminHeaders, toast, fetchSuspiciousActivities]);

  const banPlayer = useCallback(async (playerId: string, reason: string) => {
    if (!playerId) return;
    try {
      const headers = await getAdminHeaders(adminKey);
      const response = await fetch(`/api/admin/ban/${playerId}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });
      if (response.ok) {
        toast({ title: "Player banned successfully", duration: 3000 });
        fetchSuspiciousActivities();
        fetchBannedEmails();
      } else {
        const err = await response.text();
        toast({ title: `Failed to ban player: ${err}`, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error banning player", variant: "destructive" });
    }
  }, [adminKey, getAdminHeaders, toast, fetchSuspiciousActivities, fetchBannedEmails]);

  const banPlayerFromForm = useCallback(async () => {
    if (!banPlayerId.trim()) {
      toast({ title: "Please enter a player ID", variant: "destructive" });
      return;
    }
    setBanningPlayer(true);
    await banPlayer(banPlayerId.trim(), banReason.trim() || "Manual admin ban");
    setBanPlayerId("");
    setBanReason("");
    setBanningPlayer(false);
  }, [banPlayerId, banReason, banPlayer, toast]);

  const unbanEmail = useCallback(async (email: string) => {
    try {
      const headers = await getAdminHeaders(adminKey);
      const response = await fetch(`/api/admin/banned-emails/${encodeURIComponent(email)}`, {
        method: "DELETE",
        headers,
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "Email unbanned successfully", duration: 2000 });
        fetchBannedEmails();
      } else {
        toast({ title: "Failed to unban email", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error unbanning email", variant: "destructive" });
    }
  }, [adminKey, getAdminHeaders, toast, fetchBannedEmails]);

  useEffect(() => {
    if (activeTab === "security" && isAuthenticated) {
      fetchSuspiciousActivities();
      fetchBannedEmails();
    }
  }, [activeTab, isAuthenticated, fetchSuspiciousActivities, fetchBannedEmails]);

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setIsCreating(false);
    const initialFormData: Record<string, any> = {};
    API_CONFIGS[activeTab].fields.forEach((field) => {
      const value = item[field.key];
      if (field.type === "json" && value !== null && value !== undefined) {
        initialFormData[field.key] = JSON.stringify(value, null, 2);
      } else if (field.displayUnit === "seconds" && value !== null && value !== undefined && value !== "") {
        initialFormData[field.key] = Number(value) / 1000;
      } else {
        initialFormData[field.key] = value ?? "";
      }
    });
    setFormData(initialFormData);
    setEditDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingItem(null);
    setIsCreating(true);
    const initialFormData: Record<string, any> = {};
    API_CONFIGS[activeTab].fields.forEach((field) => {
      initialFormData[field.key] = field.type === "number" ? 0 : "";
    });
    setFormData(initialFormData);
    setEditDialogOpen(true);
  };

  const handleDelete = (item: any) => {
    setEditingItem(item);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!editingItem || !userEmail) return;
    setSaving(true);
    try {
      const config = API_CONFIGS[activeTab];
      const response = await fetch(`${config.endpoint}/${editingItem.id}`, {
        method: "DELETE",
        headers: await getAdminHeaders(adminKey),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Delete failed");
      toast({ title: `${config.label.slice(0, -1)} deleted successfully` });
      setDeleteDialogOpen(false);
      fetchData(activeTab);
    } catch (error) {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEditorSave = async (payload: Record<string, any>) => {
    if (!userEmail) return;
    setSaving(true);
    try {
      const config = API_CONFIGS[activeTab];
      const url = isCreating ? config.endpoint : `${config.endpoint}/${editingItem?.id || payload.id}`;
      const method = isCreating ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: {
          ...await getAdminHeaders(adminKey),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Save failed");
      }

      toast({ title: `${config.label.slice(0, -1)} ${isCreating ? "created" : "updated"} successfully` });
      setEditDialogOpen(false);
      fetchData(activeTab);

      const cacheInvalidations: Record<TabType, string[]> = {
        items: ["/api/game-data/items"],
        monsters: ["/api/game-data/monsters", "/api/game-data/combat-regions"],
        regions: ["/api/game-data/combat-regions"],
        recipes: ["/api/game-data/recipes"],
        skillActions: ["/api/game-data/skill-actions"],
        raidBosses: ["/api/raids/active", "/api/raids/current-boss"],
        players: [],
        dungeons: ["/api/dungeons"],
        dungeonSessions: [],
        dungeonModifiers: ["/api/dungeons"],
        keyConfig: ["/api/dungeons"],
        partySynergies: ["/api/party"],
        badges: [],
        achievements: [],
        security: [],
      };
      const queriesToInvalidate = cacheInvalidations[activeTab] || [];
      queriesToInvalidate.forEach(queryKey => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
      });
    } catch (error: any) {
      toast({ title: error.message || "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!userEmail) return;
    setSaving(true);
    try {
      const config = API_CONFIGS[activeTab];
      const payload: Record<string, any> = {};
      
      for (const field of config.fields) {
        let value = formData[field.key];
        if (field.type === "json" && value) {
          try {
            payload[field.key] = typeof value === "string" ? JSON.parse(value) : value;
          } catch {
            toast({ title: `Invalid JSON in ${field.label}`, variant: "destructive" });
            setSaving(false);
            return;
          }
        } else if (field.type === "number") {
          let numVal = value === "" || value === null ? null : Number(value);
          if (numVal !== null && field.displayUnit === "seconds") {
            numVal = Math.round(numVal * 1000);
          }
          payload[field.key] = numVal;
        } else {
          payload[field.key] = value === "" ? null : value;
        }
      }

      const url = isCreating ? config.endpoint : `${config.endpoint}/${editingItem.id}`;
      const method = isCreating ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: {
          ...await getAdminHeaders(adminKey),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Save failed");
      }

      toast({ title: `${config.label.slice(0, -1)} ${isCreating ? "created" : "updated"} successfully` });
      setEditDialogOpen(false);
      fetchData(activeTab);
      
      // Invalidate all relevant caches so other pages see the updated data immediately
      // This is necessary because staleTime: Infinity means queries never refetch automatically
      const cacheInvalidations: Record<TabType, string[]> = {
        items: ["/api/game-data/items"],
        monsters: ["/api/game-data/monsters", "/api/game-data/combat-regions"],
        regions: ["/api/game-data/combat-regions"],
        recipes: ["/api/game-data/recipes"],
        skillActions: ["/api/game-data/skill-actions"],
        raidBosses: ["/api/raids/active", "/api/raids/current-boss"],
        players: [],
        dungeons: ["/api/dungeons"],
        dungeonSessions: [],
        dungeonModifiers: ["/api/dungeons"],
        keyConfig: ["/api/dungeons"],
        partySynergies: ["/api/party"],
        badges: [],
        achievements: [],
        security: [],
      };
      
      const queriesToInvalidate = cacheInvalidations[activeTab] || [];
      queriesToInvalidate.forEach(queryKey => {
        queryClient.invalidateQueries({ queryKey: [queryKey] });
      });
      
      // Also invalidate specific item/monster queries if we updated one
      if (activeTab === "items" && payload.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/game-data/items/${payload.id}`] });
      }
      if (activeTab === "monsters" && payload.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/game-data/monsters/${payload.id}`] });
      }
    } catch (error: any) {
      toast({ title: error.message || "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const [broadcasting, setBroadcasting] = useState(false);
  const [publishingDrafts, setPublishingDrafts] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [syncingRegions, setSyncingRegions] = useState(false);
  const [syncingGameData, setSyncingGameData] = useState(false);
  const [syncingToProduction, setSyncingToProduction] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState<{current: number, total: number, currentItem: string} | null>(null);
  const [clearingChat, setClearingChat] = useState(false);

  const syncRegions = useCallback(async () => {
    if (!userEmail) return;
    setSyncingRegions(true);
    try {
      const response = await fetch('/api/admin/sync-regions', {
        method: 'POST',
        headers: {
          ...await getAdminHeaders(adminKey),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }
      
      toast({ 
        title: "Regions synced successfully", 
        description: `Deleted: ${result.results.deleted}, Added: ${result.results.added}, Updated: ${result.results.updated}`,
        duration: 5000 
      });
      
      await authenticateAndFetch();
    } catch (error) {
      console.error('Error syncing regions:', error);
      toast({ title: "Failed to sync regions", description: String(error), variant: "destructive" });
    } finally {
      setSyncingRegions(false);
    }
  }, [adminKey, userEmail, toast, authenticateAndFetch, getAdminHeaders]);

  const syncGameData = useCallback(async () => {
    if (!userEmail) return;
    setSyncingGameData(true);
    try {
      const response = await fetch('/api/admin/sync-game-data', {
        method: 'POST',
        headers: {
          ...await getAdminHeaders(adminKey),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }
      
      toast({ 
        title: "Game data synced successfully", 
        description: `Skill Actions: ${result.results.totalSkillActions || result.results.skillActionsUpdated}, Recipes: ${result.results.totalRecipes || result.results.recipesUpdated}`,
        duration: 5000 
      });
      
      await authenticateAndFetch();
    } catch (error) {
      console.error('Error syncing game data:', error);
      toast({ title: "Failed to sync game data", description: String(error), variant: "destructive" });
    } finally {
      setSyncingGameData(false);
    }
  }, [adminKey, userEmail, toast, authenticateAndFetch, getAdminHeaders]);

  const syncToProduction = useCallback(async () => {
    if (!userEmail) return;
    
    // Confirm before proceeding - this is a major operation
    if (!window.confirm('This will sync ALL seed data from development to production database. Are you sure?')) {
      return;
    }
    
    setSyncingToProduction(true);
    try {
      const response = await fetch('/api/admin/sync-to-production', {
        method: 'POST',
        headers: {
          ...await getAdminHeaders(adminKey),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || result.message || 'Sync to production failed');
      }
      
      toast({ 
        title: "Synced to Production Successfully!", 
        description: result.message,
        duration: 10000 
      });
      
    } catch (error) {
      console.error('Error syncing to production:', error);
      toast({ title: "Failed to sync to production", description: String(error), variant: "destructive" });
    } finally {
      setSyncingToProduction(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders]);

  const seedGameData = useCallback(async () => {
    if (!userEmail) return;
    setSeeding(true);
    try {
      const response = await fetch('/api/admin/seed-game-data', {
        method: 'POST',
        headers: {
          ...await getAdminHeaders(adminKey),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Seed failed');
      }
      
      toast({ 
        title: "Game data initialized successfully", 
        description: `Inserted: ${result.inserted.items} items, ${result.inserted.monsters} monsters, ${result.inserted.regions} regions, ${result.inserted.recipes} recipes`,
        duration: 5000 
      });
      
      await authenticateAndFetch();
    } catch (error) {
      console.error('Error seeding game data:', error);
      toast({ title: "Failed to initialize game data", description: String(error), variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  }, [adminKey, userEmail, toast, authenticateAndFetch, getAdminHeaders]);

  const publishAllDrafts = useCallback(async () => {
    if (!userEmail) return;
    setPublishingDrafts(true);
    try {
      const response = await fetch('/api/admin/publish-drafts', {
        method: 'POST',
        headers: {
          ...await getAdminHeaders(adminKey),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Publish failed');
      }
      
      const result = await response.json();
      const counts = result.published;
      const total = counts.items + counts.recipes + counts.monsters + counts.skillActions;
      toast({ 
        title: `Published ${total} drafts`, 
        description: `Items: ${counts.items}, Recipes: ${counts.recipes}, Monsters: ${counts.monsters}, Skill Actions: ${counts.skillActions}`,
        duration: 5000 
      });
      await authenticateAndFetch();
    } catch (error) {
      console.error('Error publishing drafts:', error);
      toast({ title: "Failed to publish drafts", variant: "destructive" });
    } finally {
      setPublishingDrafts(false);
      setPublishConfirmOpen(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders, authenticateAndFetch]);

  const broadcastUpdate = useCallback(async () => {
    if (!userEmail) return;
    setBroadcasting(true);
    try {
      const response = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: {
          ...await getAdminHeaders(adminKey),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ categories: null }),
      });
      
      if (!response.ok) {
        throw new Error('Broadcast failed');
      }
      
      toast({ title: "Update broadcast sent to all players", duration: 3000 });
    } catch (error) {
      console.error('Error broadcasting update:', error);
      toast({ title: "Failed to broadcast update", variant: "destructive" });
    } finally {
      setBroadcasting(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders]);

  const clearGlobalChat = useCallback(async () => {
    if (!userEmail) return;
    setClearingChat(true);
    try {
      const response = await fetch('/api/admin/global-chat', {
        method: 'DELETE',
        headers: {
          ...await getAdminHeaders(adminKey),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to clear chat');
      }
      
      toast({ title: "Global chat cleared successfully", duration: 3000 });
    } catch (error) {
      console.error('Error clearing global chat:', error);
      toast({ title: "Failed to clear global chat", variant: "destructive" });
    } finally {
      setClearingChat(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders]);

  const translateAllItems = useCallback(async () => {
    if (!userEmail) return;
    setTranslating(true);
    setTranslateProgress(null);
    
    try {
      // Use fetch with headers for SSE (EventSource doesn't support custom headers)
      const response = await fetch('/api/admin/translate-items', {
        headers: await getAdminHeaders(adminKey),
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Translation request failed');
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No response body');
      }
      
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'started') {
                setTranslateProgress({ current: 0, total: data.total, currentItem: 'Starting...' });
              } else if (data.type === 'processing') {
                setTranslateProgress(prev => prev ? { ...prev, currentItem: data.itemName } : null);
              } else if (data.type === 'progress' || data.type === 'skipped' || data.type === 'error') {
                setTranslateProgress(prev => prev ? { 
                  ...prev, 
                  current: data.completed,
                  currentItem: data.itemName 
                } : null);
              } else if (data.type === 'complete') {
                toast({ 
                  title: "Translation complete", 
                  description: `Translated ${data.completed} items${data.errors > 0 ? ` (${data.errors} errors)` : ''}`,
                  duration: 5000 
                });
                await authenticateAndFetch();
              } else if (data.type === 'fatal') {
                throw new Error(data.error);
              }
            } catch (parseError) {
              console.error('Parse error:', parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error translating items:', error);
      toast({ title: "Translation failed", description: String(error), variant: "destructive" });
    } finally {
      setTranslating(false);
      setTranslateProgress(null);
    }
  }, [adminKey, userEmail, toast, authenticateAndFetch, getAdminHeaders]);

  const fetchPlayerDetails = useCallback(async (playerId: string) => {
    if (!adminKey || !userEmail) return;
    setPlayerDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}`, {
        headers: await getAdminHeaders(adminKey),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch player details");
      const playerData = await response.json();
      setSelectedPlayer(playerData);
      setPlayerGold(playerData.gold || 0);
      setEditingUsername(playerData.username || "");
      setPlayerMasteries({
        masteryDagger: playerData.masteryDagger || 0,
        masterySwordShield: playerData.masterySwordShield || 0,
        mastery2hSword: playerData.mastery2hSword || 0,
        mastery2hAxe: playerData.mastery2hAxe || 0,
        mastery2hWarhammer: playerData.mastery2hWarhammer || 0,
        masteryBow: playerData.masteryBow || 0,
        masteryStaff: playerData.masteryStaff || 0,
      });
      
      // Show ALL possible skills, merging with player data
      const ALL_SKILLS = [
        'mining', 'woodcutting', 'fishing', 'cooking', 'alchemy', 'crafting', 
        'firemaking', 'attack', 'strength', 'defence', 'hitpoints', 'studying',
        'runecrafting', 'construction', 'smithing', 'hunting'
      ];
      const skillsObj = playerData.skills || {};
      const skillsArray = ALL_SKILLS.map((skillId) => ({
        skillId,
        level: (skillsObj as any)[skillId]?.level || 1,
        xp: (skillsObj as any)[skillId]?.xp || 0,
      }));
      setPlayerSkills(skillsArray);
      
      // Convert inventory from object format {itemId: quantity} to array [{itemId, quantity}]
      const inventoryObj = playerData.inventory || {};
      const inventoryArray = Object.entries(inventoryObj).map(([itemId, quantity]) => ({
        itemId,
        quantity: Number(quantity) || 0,
      }));
      setPlayerInventory(inventoryArray);
      
      const existingMods = playerData.itemModifications || {};
      const normalizedMods: Record<string, {enhancementLevel: number, addedStats: Record<string, number>, addedSkills: string[]}> = {};
      for (const [itemId, mod] of Object.entries(existingMods)) {
        const m = mod as any;
        normalizedMods[itemId] = {
          enhancementLevel: m.enhancementLevel || 0,
          addedStats: m.addedStats || {},
          addedSkills: m.addedSkills || [],
        };
      }
      setPendingItemMods(normalizedMods);
      setEditingEnhItemId(null);
      setInventorySearchQuery("");
      
      // Convert equipment from object format {slot: itemName} to array [{slot, itemName}]
      const equipmentObj = playerData.equipment || {};
      const equipmentArray = Object.entries(equipmentObj).map(([slot, itemName]) => ({
        slot,
        itemName: itemName || null,
      }));
      setPlayerEquipment(equipmentArray);
      
      setPlayerDetailDialogOpen(true);

      try {
        const badgesRes = await fetch(`/api/admin/players/${playerId}/badges`, {
          headers: await getAdminHeaders(adminKey),
          credentials: "include",
        });
        if (badgesRes.ok) {
          const badgesData = await badgesRes.json();
          setPlayerBadges(badgesData);
        }
      } catch (e) {
        console.error("Error fetching player badges:", e);
      }

      try {
        const keysRes = await fetch(`/api/admin/players/${playerId}/dungeon-keys`, {
          headers: await getAdminHeaders(adminKey),
          credentials: "include",
        });
        if (keysRes.ok) {
          const keysData = await keysRes.json();
          const keysMap: Record<string, number> = { bronze: 0, silver: 0, gold: 0, void: 0 };
          for (const k of keysData) {
            keysMap[k.keyType] = k.quantity;
          }
          setPlayerDungeonKeys(keysMap);
        }
      } catch (e) {
        console.error("Error fetching dungeon keys:", e);
      }
    } catch (error) {
      console.error("Error fetching player details:", error);
      toast({ title: "Failed to load player details", variant: "destructive" });
    } finally {
      setPlayerDetailLoading(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders]);

  const awardPlayerBadge = useCallback(async (playerId: string, badgeId: string) => {
    if (!adminKey || !userEmail || !badgeId) return;
    try {
      const response = await fetch(`/api/admin/players/${playerId}/badges`, {
        method: "POST",
        headers: { ...(await getAdminHeaders(adminKey)), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ badgeId }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      toast({ title: "Badge awarded successfully" });
      setSelectedBadgeToAward("");
      const badgesRes = await fetch(`/api/admin/players/${playerId}/badges`, {
        headers: await getAdminHeaders(adminKey),
        credentials: "include",
      });
      if (badgesRes.ok) setPlayerBadges(await badgesRes.json());
    } catch (error: any) {
      toast({ title: error.message || "Failed to award badge", variant: "destructive" });
    }
  }, [adminKey, userEmail, toast, getAdminHeaders]);

  const removePlayerBadge = useCallback(async (playerId: string, badgeId: string) => {
    if (!adminKey || !userEmail) return;
    try {
      const response = await fetch(`/api/admin/players/${playerId}/badges/${badgeId}`, {
        method: "DELETE",
        headers: await getAdminHeaders(adminKey),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed");
      toast({ title: "Badge removed" });
      setPlayerBadges(prev => prev.filter(b => b.badgeId !== badgeId));
    } catch (error) {
      toast({ title: "Failed to remove badge", variant: "destructive" });
    }
  }, [adminKey, userEmail, toast, getAdminHeaders]);

  const savePlayerGold = useCallback(async (playerId: string, gold: number) => {
    if (!adminKey || !userEmail) return;
    
    // Validate gold is non-negative
    if (gold < 0 || !Number.isFinite(gold)) {
      toast({ title: "Gold must be a non-negative number", variant: "destructive" });
      return;
    }
    
    setSavingPlayerData(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/gold`, {
        method: "PUT",
        headers: {
          ...await getAdminHeaders(adminKey),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ gold }),
      });
      if (!response.ok) throw new Error("Failed to save gold");
      toast({ title: "Gold updated successfully" });
      setSelectedPlayer((prev: any) => prev ? { ...prev, gold } : prev);
      
      // Refresh players list to keep it in sync
      const result = await fetchSingleTab("players", adminKey, userEmail);
      if (result.success) {
        setData((prev) => ({ ...prev, players: result.data }));
      }
    } catch (error) {
      console.error("Error saving player gold:", error);
      toast({ title: "Failed to save gold", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, fetchSingleTab, getAdminHeaders]);

  const togglePlayerTester = useCallback(async (playerId: string, isTester: boolean) => {
    if (!adminKey || !userEmail) return;
    
    setSavingPlayerData(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/tester`, {
        method: "PUT",
        headers: {
          ...await getAdminHeaders(adminKey),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ isTester: isTester ? 1 : 0 }),
      });
      if (!response.ok) throw new Error("Failed to update tester status");
      toast({ title: isTester ? "Player is now a Tester" : "Tester access removed" });
      setSelectedPlayer((prev: any) => prev ? { ...prev, isTester: isTester ? 1 : 0 } : prev);
      
      // Refresh players list to keep it in sync
      const result = await fetchSingleTab("players", adminKey, userEmail);
      if (result.success) {
        setData((prev) => ({ ...prev, players: result.data }));
      }
    } catch (error) {
      console.error("Error updating tester status:", error);
      toast({ title: "Failed to update tester status", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, fetchSingleTab, getAdminHeaders]);

  const savePlayerRole = useCallback(async (playerId: string, staffRole: string | null, isTester: boolean) => {
    if (!adminKey || !userEmail) return;
    
    setSavingPlayerData(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/role`, {
        method: "PUT",
        headers: {
          ...await getAdminHeaders(adminKey),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ staffRole, isTester }),
      });
      if (!response.ok) throw new Error("Failed to update role");
      toast({ title: "Roles & permissions updated" });
      setSelectedPlayer((prev: any) => prev ? { ...prev, staffRole, isTester: isTester ? 1 : 0 } : prev);
      
      const result = await fetchSingleTab("players", adminKey, userEmail);
      if (result.success) {
        setData((prev) => ({ ...prev, players: result.data }));
      }
    } catch (error) {
      console.error("Error updating player role:", error);
      toast({ title: "Failed to update roles", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, fetchSingleTab, getAdminHeaders]);

  const savePlayerSkills = useCallback(async (playerId: string, skills: any[]) => {
    if (!adminKey || !userEmail) return;
    
    // Validate all skills have non-negative level and xp
    for (const skill of skills) {
      if (skill.level < 0 || !Number.isFinite(skill.level)) {
        toast({ title: `Level for ${skill.skillId} must be a non-negative number`, variant: "destructive" });
        return;
      }
      if (skill.xp < 0 || !Number.isFinite(skill.xp)) {
        toast({ title: `XP for ${skill.skillId} must be a non-negative number`, variant: "destructive" });
        return;
      }
    }
    
    setSavingPlayerData(true);
    try {
      // Convert skills array back to object format {skillId: {level, xp}} for API
      const skillsObj = Object.fromEntries(
        skills.map((s) => [s.skillId, { level: s.level, xp: s.xp }])
      );
      
      const response = await fetch(`/api/admin/players/${playerId}/skills`, {
        method: "PUT",
        headers: {
          ...await getAdminHeaders(adminKey),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ skills: skillsObj }),
      });
      if (!response.ok) throw new Error("Failed to save skills");
      toast({ title: "Skills updated successfully" });
      setSelectedPlayer((prev: any) => prev ? { ...prev, skills: skillsObj } : prev);
      
      // Refresh players list to keep it in sync
      const result = await fetchSingleTab("players", adminKey, userEmail);
      if (result.success) {
        setData((prev) => ({ ...prev, players: result.data }));
      }
    } catch (error) {
      console.error("Error saving player skills:", error);
      toast({ title: "Failed to save skills", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, fetchSingleTab, getAdminHeaders]);

  const savePlayerInventory = useCallback(async (playerId: string, inventory: any[], itemMods?: Record<string, any>) => {
    if (!adminKey || !userEmail) return;
    
    for (const item of inventory) {
      if (item.quantity < 0 || !Number.isFinite(item.quantity)) {
        toast({ title: `Quantity for ${item.itemId} must be a non-negative number`, variant: "destructive" });
        return;
      }
    }
    
    setSavingPlayerData(true);
    try {
      const inventoryObj = Object.fromEntries(
        inventory.map((i) => [i.itemId, i.quantity])
      );
      
      const bodyPayload: any = { inventory: inventoryObj };
      if (itemMods && Object.keys(itemMods).length > 0) {
        bodyPayload.itemModifications = itemMods;
      }
      
      const response = await fetch(`/api/admin/players/${playerId}/inventory`, {
        method: "PUT",
        headers: {
          ...await getAdminHeaders(adminKey),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(bodyPayload),
      });
      if (!response.ok) throw new Error("Failed to save inventory");
      toast({ title: "Inventory updated successfully" });
      setSelectedPlayer((prev: any) => prev ? { ...prev, inventory: inventoryObj } : prev);
      setPendingItemMods({});
      
      const result = await fetchSingleTab("players", adminKey, userEmail);
      if (result.success) {
        setData((prev) => ({ ...prev, players: result.data }));
      }
    } catch (error) {
      console.error("Error saving player inventory:", error);
      toast({ title: "Failed to save inventory", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, fetchSingleTab, getAdminHeaders]);

  const savePlayerEquipment = useCallback(async (playerId: string, equipment: any[]) => {
    if (!adminKey || !userEmail) return;
    
    setSavingPlayerData(true);
    try {
      // Convert equipment array back to object format {slot: itemName} for API
      const equipmentObj = Object.fromEntries(
        equipment.map((e) => [e.slot, e.itemName])
      );
      
      const response = await fetch(`/api/admin/players/${playerId}/equipment`, {
        method: "PUT",
        headers: {
          ...await getAdminHeaders(adminKey),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ equipment: equipmentObj }),
      });
      if (!response.ok) throw new Error("Failed to save equipment");
      toast({ title: "Equipment updated successfully" });
      setSelectedPlayer((prev: any) => prev ? { ...prev, equipment: equipmentObj } : prev);
    } catch (error) {
      console.error("Error saving player equipment:", error);
      toast({ title: "Failed to save equipment", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders]);

  const savePlayerUsername = useCallback(async (playerId: string, username: string) => {
    if (!adminKey || !userEmail) return;
    
    const trimmed = username.trim();
    if (!trimmed || trimmed.length > 20) {
      toast({ title: "Username must be between 1 and 20 characters", variant: "destructive" });
      return;
    }
    
    setSavingPlayerData(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/username`, {
        method: "PUT",
        headers: {
          ...await getAdminHeaders(adminKey),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ username: trimmed }),
      });
      if (!response.ok) throw new Error("Failed to update username");
      toast({ title: "Username updated successfully" });
      setSelectedPlayer((prev: any) => prev ? { ...prev, username: trimmed } : prev);
      
      const result = await fetchSingleTab("players", adminKey, userEmail);
      if (result.success) {
        setData((prev) => ({ ...prev, players: result.data }));
      }
    } catch (error) {
      console.error("Error saving username:", error);
      toast({ title: "Failed to update username", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, fetchSingleTab, getAdminHeaders]);

  const savePlayerMasteries = useCallback(async (playerId: string, masteries: Record<string, number>) => {
    if (!adminKey || !userEmail) return;
    
    setSavingPlayerData(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/mastery`, {
        method: "PUT",
        headers: {
          ...await getAdminHeaders(adminKey),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(masteries),
      });
      if (!response.ok) throw new Error("Failed to update masteries");
      toast({ title: "Masteries updated successfully" });
      setSelectedPlayer((prev: any) => prev ? { ...prev, ...masteries } : prev);
    } catch (error) {
      console.error("Error saving masteries:", error);
      toast({ title: "Failed to update masteries", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders]);

  const savePlayerDungeonKeys = useCallback(async (playerId: string, keys: Record<string, number>) => {
    if (!adminKey || !userEmail) return;
    setSavingPlayerData(true);
    try {
      const keysArray = Object.entries(keys).map(([keyType, quantity]) => ({ keyType, quantity }));
      const response = await fetch(`/api/admin/players/${playerId}/dungeon-keys`, {
        method: "PUT",
        headers: {
          ...await getAdminHeaders(adminKey),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ keys: keysArray }),
      });
      if (!response.ok) throw new Error("Failed to update dungeon keys");
      toast({ title: "Dungeon keys updated successfully" });
    } catch (error) {
      console.error("Error saving dungeon keys:", error);
      toast({ title: "Failed to update dungeon keys", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders]);

  const handleEquipmentChange = (index: number, value: string) => {
    setPlayerEquipment((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], itemName: value || null };
      return updated;
    });
  };

  const handleViewPlayerDetails = (player: any) => {
    setPlayerDetailTab("info");
    fetchPlayerDetails(player.id);
  };

  const handleForceLogout = useCallback(async (playerId: string) => {
    if (!adminKey || !userEmail) return;
    setSavingPlayerData(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/force-logout`, {
        method: "POST",
        headers: await getAdminHeaders(adminKey),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed");
      toast({ title: "Player session cleared - they will need to login again" });
    } catch (error) {
      toast({ title: "Failed to force logout", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders]);

  const handleClearActiveTask = useCallback(async (playerId: string) => {
    if (!adminKey || !userEmail) return;
    setSavingPlayerData(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/clear-active-task`, {
        method: "POST",
        headers: await getAdminHeaders(adminKey),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed");
      toast({ title: "Active task cleared successfully" });
      fetchPlayerDetails(playerId);
    } catch (error) {
      toast({ title: "Failed to clear active task", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders, fetchPlayerDetails]);

  const handleClearOfflineProgress = useCallback(async (playerId: string) => {
    if (!adminKey || !userEmail) return;
    setSavingPlayerData(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/clear-offline-progress`, {
        method: "POST",
        headers: await getAdminHeaders(adminKey),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed");
      toast({ title: "Offline progress cleared successfully" });
      fetchPlayerDetails(playerId);
    } catch (error) {
      toast({ title: "Failed to clear offline progress", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders, fetchPlayerDetails]);

  const handleClearActiveCombat = useCallback(async (playerId: string) => {
    if (!adminKey || !userEmail) return;
    setSavingPlayerData(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/clear-active-combat`, {
        method: "POST",
        headers: await getAdminHeaders(adminKey),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed");
      toast({ title: "Active combat cleared successfully" });
      fetchPlayerDetails(playerId);
    } catch (error) {
      toast({ title: "Failed to clear active combat", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders, fetchPlayerDetails]);

  const handleChangeRegion = useCallback(async (playerId: string, region: string) => {
    if (!adminKey || !userEmail) return;
    setSavingPlayerData(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/change-region`, {
        method: "POST",
        headers: { ...(await getAdminHeaders(adminKey)), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ region }),
      });
      if (!response.ok) throw new Error("Failed");
      toast({ title: `Region changed to ${region}` });
      fetchPlayerDetails(playerId);
    } catch (error) {
      toast({ title: "Failed to change region", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders, fetchPlayerDetails]);

  const handleBanPlayer = useCallback(async (playerId: string) => {
    if (!adminKey || !userEmail) return;
    const reason = prompt("Ban reason:");
    if (!reason) return;
    setSavingPlayerData(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/ban`, {
        method: "POST",
        headers: { ...(await getAdminHeaders(adminKey)), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error("Failed");
      toast({ title: "Player banned successfully" });
      fetchPlayerDetails(playerId);
    } catch (error) {
      toast({ title: "Failed to ban player", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders, fetchPlayerDetails]);

  const handleUnbanPlayer = useCallback(async (playerId: string) => {
    if (!adminKey || !userEmail) return;
    setSavingPlayerData(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/unban`, {
        method: "POST",
        headers: await getAdminHeaders(adminKey),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed");
      toast({ title: "Player unbanned successfully" });
      fetchPlayerDetails(playerId);
    } catch (error) {
      toast({ title: "Failed to unban player", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders, fetchPlayerDetails]);

  const handleClearBuffs = useCallback(async (playerId: string) => {
    if (!adminKey || !userEmail) return;
    setSavingPlayerData(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/clear-buffs`, {
        method: "POST",
        headers: await getAdminHeaders(adminKey),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed");
      toast({ title: "Buffs cleared successfully" });
      fetchPlayerDetails(playerId);
    } catch (error) {
      toast({ title: "Failed to clear buffs", variant: "destructive" });
    } finally {
      setSavingPlayerData(false);
    }
  }, [adminKey, userEmail, toast, getAdminHeaders, fetchPlayerDetails]);

  const resetPlayerCharacter = useCallback(async (playerId: string) => {
    if (!adminKey || !userEmail) return;
    
    setResettingCharacter(true);
    try {
      const response = await fetch(`/api/admin/players/${playerId}/reset`, {
        method: "POST",
        headers: {
          ...await getAdminHeaders(adminKey),
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to reset character");
      
      const result = await response.json();
      toast({ title: result.message || "Character reset successfully" });
      
      // Close dialogs and refresh player list
      setResetConfirmDialogOpen(false);
      setPlayerDetailDialogOpen(false);
      setSelectedPlayer(null);
      
      // Refresh players list
      const refreshResult = await fetchSingleTab("players", adminKey, userEmail);
      if (refreshResult.success) {
        setData((prev) => ({ ...prev, players: refreshResult.data }));
      }
    } catch (error) {
      console.error("Error resetting character:", error);
      toast({ title: "Failed to reset character", variant: "destructive" });
    } finally {
      setResettingCharacter(false);
    }
  }, [adminKey, userEmail, toast, fetchSingleTab, getAdminHeaders]);

  const handleSkillChange = (index: number, field: string, value: number) => {
    setPlayerSkills((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleInventoryChange = (index: number, field: string, value: string | number) => {
    setPlayerInventory((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemoveInventoryItem = (index: number) => {
    setPlayerInventory((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddInventoryItem = () => {
    if (!newItemId.trim()) {
      toast({ title: "Please enter an item ID", variant: "destructive" });
      return;
    }
    const itemId = newItemId.trim();
    setPlayerInventory((prev) => [
      ...prev,
      { itemId, quantity: newItemQuantity },
    ]);
    if (newItemEnhLevel > 0 || newItemSkills.length > 0 || newItemStats.length > 0) {
      const statsObj: Record<string, number> = {};
      for (const s of newItemStats) {
        if (s.stat && s.value) statsObj[s.stat] = s.value;
      }
      setPendingItemMods((prev) => ({
        ...prev,
        [itemId]: {
          enhancementLevel: newItemEnhLevel,
          addedStats: statsObj,
          addedSkills: [...newItemSkills],
        },
      }));
    }
    setNewItemId("");
    setNewItemQuantity(1);
    setNewItemEnhLevel(0);
    setNewItemSkills([]);
    setNewItemStats([]);
  };

  const renderTable = (tab: TabType) => {
    const config = API_CONFIGS[tab];
    const items = data[tab];
    const isLoading = loading[tab];

    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      );
    }

    const filteredItems = searchQuery.trim() 
      ? items.filter((item: any) => 
          Object.values(item).some(val => 
            String(val ?? '').toLowerCase().includes(searchQuery.toLowerCase())
          )
        )
      : items;

    if (!filteredItems.length) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">No data found</div>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow>
              {config.displayFields.map((field) => (
                <TableHead key={field} className="text-xs sm:text-sm whitespace-nowrap">{field}</TableHead>
              ))}
              <TableHead className="text-right text-xs sm:text-sm">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.map((item: any) => (
              <TableRow key={item.id}>
                {config.displayFields.map((field) => (
                  <TableCell key={field} className={`${field === 'imageUrl' ? 'w-10 p-1' : 'max-w-[100px] sm:max-w-[200px] truncate'} text-xs sm:text-sm`}>
                    {(field === "imageUrl" || field === "image_url") ? (
                      item[field] && (String(item[field]).startsWith('/') || String(item[field]).startsWith('http')) ? (
                        <img src={String(item[field])} alt="" className="w-8 h-8 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : <span className="text-muted-foreground">-</span>
                    ) : field === "isDraft" ? (
                      item[field] === 1 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">Draft</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Live</span>
                      )
                    ) : field === "regionId" && !item[field] && item.regionIds ? (
                      (() => {
                        const rids = typeof item.regionIds === "string" ? JSON.parse(item.regionIds) : item.regionIds;
                        return Array.isArray(rids) && rids.length > 0 ? rids.join(", ") : "-";
                      })()
                    ) : typeof item[field] === "object"
                      ? JSON.stringify(item[field])
                      : String(item[field] ?? "-")}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1 sm:gap-2">
                    {tab === "players" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewPlayerDetails(item)}
                        disabled={playerDetailLoading}
                        className="h-7 w-7 p-0 sm:h-8 sm:w-8"
                        data-testid={`view-details-${item.id}`}
                      >
                        <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                    )}
                    {config.canEdit !== false && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(item)}
                        className="h-7 w-7 p-0 sm:h-8 sm:w-8"
                        data-testid={`edit-${tab}-${item.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                    )}
                    {config.canDelete && (isFullAdmin || staffRole === 'moderator') && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(item)}
                        className="h-7 w-7 p-0 sm:h-8 sm:w-8"
                        data-testid={`delete-${tab}-${item.id}`}
                      >
                        <Trash className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderFormField = (field: { key: string; label: string; type: string; required?: boolean }) => {
    const value = formData[field.key] ?? "";
    
    if (field.type === "textarea" || field.type === "json") {
      return (
        <div key={field.key} className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {field.label} {field.required && <span className="text-red-500">*</span>}
          </label>
          <textarea
            className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
            value={value}
            onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
            data-testid={`input-${field.key}`}
          />
        </div>
      );
    }

    const isImageField = field.key === 'imageUrl' || field.key === 'image_url';
    if (isImageField) {
      return (
        <div key={field.key} className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {field.label} {field.required && <span className="text-red-500">*</span>}
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={value}
              onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
              className="flex-1"
              data-testid={`input-${field.key}`}
            />
            {value && (String(value).startsWith('/') || String(value).startsWith('http')) && (
              <img
                src={String(value)}
                alt=""
                className="w-10 h-10 rounded object-cover border border-border/30 shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={field.key} className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          {field.label} {field.required && <span className="text-red-500">*</span>}
        </label>
        <Input
          type={field.type === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
          disabled={!isCreating && field.key === "id"}
          data-testid={`input-${field.key}`}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4 md:p-8 pb-24 sm:pb-8">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="h-8 w-8 sm:h-10 sm:w-10">
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 sm:p-3 rounded-xl bg-red-500/20 border border-red-500/30">
              <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-red-400" weight="bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-3xl font-display font-bold text-foreground">Admin Panel</h1>
                {staffRole && !isFullAdmin && (
                  <span className="px-2 py-1 rounded text-xs font-medium bg-amber-800 text-amber-200" data-testid="badge-staff-role">
                    {staffRole.charAt(0).toUpperCase() + staffRole.slice(1)}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-base text-muted-foreground">Manage game data</p>
            </div>
          </div>
        </div>

        {!isDevMode && authLoading ? (
          <Card className="bg-card/80 backdrop-blur-sm border-border">
            <CardContent className="py-12">
              <div className="flex items-center justify-center">
                <div className="text-muted-foreground">Loading authentication...</div>
              </div>
            </CardContent>
          </Card>
        ) : !isDevMode && !user ? (
          <Card className="bg-card/80 backdrop-blur-sm border-border">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center gap-4">
                <Warning className="w-12 h-12 text-yellow-400" />
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-foreground">Authentication Required</h3>
                  <p className="text-muted-foreground mt-1">You must be logged in to access the admin panel</p>
                </div>
                <Button onClick={() => setLocation("/auth")} data-testid="button-go-login">
                  Go to Login
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : !isAllowedEmail && !staffRole ? (
          <Card className="bg-card/80 backdrop-blur-sm border-border">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="text-lg">Authentication</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground mb-3">Logged in as: {userEmail}</p>
              <p className="text-sm text-muted-foreground mb-4">If you have a staff role, you can access the panel without an admin key.</p>
              <Button onClick={handleStaffLogin} disabled={staffLoginLoading} className="w-full" data-testid="button-staff-login">
                {staffLoginLoading ? "Checking..." : "Staff Login"}
              </Button>
              {authError && (
                <p className="mt-2 text-sm text-red-400">{authError}</p>
              )}
            </CardContent>
          </Card>
        ) : staffRole && !isAllowedEmail ? (
          <Card className="bg-card/80 backdrop-blur-sm border-border">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="text-lg">{staffRole === 'moderator' ? 'Moderator Panel' : 'Translator Panel'}</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Logged in as: {userEmail} ({staffRole})</p>
              {isAuthenticated && (
                <p className="mt-2 text-sm text-green-400">Authenticated successfully</p>
              )}
              {authError && (
                <p className="mt-2 text-sm text-red-400">{authError}</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card/80 backdrop-blur-sm border-border">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="text-lg">Authentication</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-sm font-medium text-foreground">Admin Key</label>
                  <div className="relative">
                    <Input
                      type={showKey ? "text" : "password"}
                      value={adminKey}
                      onChange={(e) => setAdminKey(e.target.value)}
                      placeholder="Enter admin key..."
                      className="pr-10"
                      data-testid="input-admin-key"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showKey ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Logged in as: {userEmail}</p>
                </div>
                <Button onClick={authenticateAndFetch} disabled={!adminKey || loading[activeTab]} className="w-full sm:w-auto" data-testid="button-authenticate">
                  {loading[activeTab] ? "Authenticating..." : "Authenticate"}
                </Button>
              </div>
              {!isAuthenticated && user && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <Button variant="outline" onClick={handleStaffLogin} disabled={staffLoginLoading} className="w-full sm:w-auto" data-testid="button-staff-login">
                    {staffLoginLoading ? "Checking..." : "Staff Login (No Admin Key)"}
                  </Button>
                </div>
              )}
              {isAuthenticated && (
                <p className="mt-2 text-sm text-green-400">Authenticated successfully</p>
              )}
              {authError && (
                <p className="mt-2 text-sm text-red-400">{authError}</p>
              )}
            </CardContent>
          </Card>
        )}

        {isAuthenticated && (
          <Card className="bg-card/80 backdrop-blur-sm border-border">
            <CardContent className="pt-6">
              <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as TabType); setSearchQuery(""); }}>
                <div className="flex flex-col gap-4 mb-4">
                  <div className="overflow-x-auto -mx-2 px-2">
                    <TabsList className="w-max min-w-full flex-wrap h-auto gap-1 p-1">
                      <TabsTrigger value="items" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5" data-testid="tab-items">Items</TabsTrigger>
                      <TabsTrigger value="monsters" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5" data-testid="tab-monsters">Monsters</TabsTrigger>
                      <TabsTrigger value="regions" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5" data-testid="tab-regions">Regions</TabsTrigger>
                      <TabsTrigger value="recipes" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5" data-testid="tab-recipes">Recipes</TabsTrigger>
                      <TabsTrigger value="skillActions" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5" data-testid="tab-skill-actions">Skills</TabsTrigger>
                      {isFullAdmin && <TabsTrigger value="raidBosses" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5" data-testid="tab-raid-bosses">Raids</TabsTrigger>}
                      {(isFullAdmin || staffRole === 'moderator') && <TabsTrigger value="players" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5" data-testid="tab-players">Players</TabsTrigger>}
                      {staffRole !== 'translator' && <TabsTrigger value="dungeons" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5" data-testid="tab-dungeons">Dungeons</TabsTrigger>}
                      {isFullAdmin && <TabsTrigger value="dungeonSessions" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 bg-orange-900/30 text-orange-400 data-[state=active]:bg-orange-900 data-[state=active]:text-orange-200" data-testid="tab-dungeon-sessions">Sessions</TabsTrigger>}
                      {isFullAdmin && <TabsTrigger value="dungeonModifiers" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5" data-testid="tab-dungeon-modifiers">Modifiers</TabsTrigger>}
                      {isFullAdmin && <TabsTrigger value="keyConfig" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5" data-testid="tab-key-config">Key Config</TabsTrigger>}
                      {isFullAdmin && <TabsTrigger value="partySynergies" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5" data-testid="tab-party-synergies">Synergies</TabsTrigger>}
                      {staffRole !== 'translator' && <TabsTrigger value="badges" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5" data-testid="tab-badges">Badges</TabsTrigger>}
                      <TabsTrigger value="achievements" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5" data-testid="tab-achievements">Achievements</TabsTrigger>
                      {isFullAdmin && <TabsTrigger value="security" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 bg-red-900/30 text-red-400 data-[state=active]:bg-red-900 data-[state=active]:text-red-200" data-testid="tab-security">Security</TabsTrigger>}
                    </TabsList>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {(isFullAdmin || staffRole === 'moderator') && API_CONFIGS[activeTab].canCreate && (
                      <Button onClick={handleCreate} size="sm" className="text-xs sm:text-sm" data-testid="button-add-new">
                        <Plus className="w-4 h-4 mr-1 sm:mr-2" />
                        <span className="hidden sm:inline">Add New</span>
                        <span className="sm:hidden">Add</span>
                      </Button>
                    )}
                    {isFullAdmin && (
                      <>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={seedGameData} 
                      disabled={seeding}
                      className="border-green-500/50 text-green-400 hover:bg-green-500/20 text-xs sm:text-sm"
                      data-testid="button-seed-game-data"
                    >
                      <Database className="w-4 h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">{seeding ? "Initializing..." : "Initialize"}</span>
                      <span className="sm:hidden">{seeding ? "..." : "Init"}</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={syncRegions} 
                      disabled={syncingRegions}
                      className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/20 text-xs sm:text-sm"
                      data-testid="button-sync-regions"
                    >
                      <MapTrifold className="w-4 h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">{syncingRegions ? "Syncing..." : "Sync Regions"}</span>
                      <span className="sm:hidden">{syncingRegions ? "..." : "Sync"}</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={syncGameData} 
                      disabled={syncingGameData}
                      className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/20 text-xs sm:text-sm"
                      data-testid="button-sync-game-data"
                    >
                      <Database className="w-4 h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">{syncingGameData ? "Syncing..." : "Sync Data"}</span>
                      <span className="sm:hidden">{syncingGameData ? "..." : "Data"}</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={syncToProduction} 
                      disabled={syncingToProduction}
                      className="border-red-500/50 text-red-400 hover:bg-red-500/20 text-xs sm:text-sm"
                      data-testid="button-sync-to-production"
                    >
                      <CloudArrowUp className="w-4 h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">{syncingToProduction ? "Syncing..." : "To Production"}</span>
                      <span className="sm:hidden">{syncingToProduction ? "..." : "Prod"}</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={broadcastUpdate} 
                      disabled={broadcasting}
                      className="border-orange-500/50 text-orange-400 hover:bg-orange-500/20 text-xs sm:text-sm"
                      data-testid="button-broadcast-update"
                    >
                      <Broadcast className="w-4 h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">{broadcasting ? "Sending..." : "Broadcast"}</span>
                      <span className="sm:hidden">{broadcasting ? "..." : "Send"}</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setPublishConfirmOpen(true)} 
                      disabled={publishingDrafts}
                      className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20 text-xs sm:text-sm"
                      data-testid="button-publish-drafts"
                    >
                      <CloudArrowUp className="w-4 h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">{publishingDrafts ? "Publishing..." : "Publish Drafts"}</span>
                      <span className="sm:hidden">{publishingDrafts ? "..." : "Publish"}</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={clearGlobalChat} 
                      disabled={clearingChat}
                      className="border-pink-500/50 text-pink-400 hover:bg-pink-500/20 text-xs sm:text-sm"
                      data-testid="button-clear-global-chat"
                    >
                      <ChatTeardrop className="w-4 h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">{clearingChat ? "Clearing..." : "Clear Chat"}</span>
                      <span className="sm:hidden">{clearingChat ? "..." : "Chat"}</span>
                    </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 mb-2">
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="max-w-sm"
                    data-testid="input-admin-search"
                  />
                </div>

                <TabsContent value="items" className="mt-0">{renderTable("items")}</TabsContent>
                <TabsContent value="monsters" className="mt-0">{renderTable("monsters")}</TabsContent>
                <TabsContent value="regions" className="mt-0">{renderTable("regions")}</TabsContent>
                <TabsContent value="recipes" className="mt-0">{renderTable("recipes")}</TabsContent>
                <TabsContent value="skillActions" className="mt-0">{renderTable("skillActions")}</TabsContent>
                <TabsContent value="raidBosses" className="mt-0">{renderTable("raidBosses")}</TabsContent>
                <TabsContent value="players" className="mt-0">{renderTable("players")}</TabsContent>
                <TabsContent value="dungeons" className="mt-0">{renderTable("dungeons")}</TabsContent>
                <TabsContent value="dungeonSessions" className="mt-0"><DungeonSessionsPanel adminKey={adminKey} getAdminHeaders={getAdminHeaders} toast={toast} /></TabsContent>
                <TabsContent value="dungeonModifiers" className="mt-0">{renderTable("dungeonModifiers")}</TabsContent>
                <TabsContent value="keyConfig" className="mt-0">{renderTable("keyConfig")}</TabsContent>
                <TabsContent value="partySynergies" className="mt-0">{renderTable("partySynergies")}</TabsContent>
                <TabsContent value="badges" className="mt-0">{renderTable("badges")}</TabsContent>
                <TabsContent value="achievements" className="space-y-4">
                  {editingAchievement || creatingAchievement ? (
                    <AchievementEditor
                      achievement={editingAchievement}
                      isCreating={creatingAchievement}
                      onSave={async (data) => {
                        setSavingAchievement(true);
                        try {
                          const headers = await getAdminHeaders(adminKey);
                          const url = creatingAchievement ? '/api/admin/achievements' : `/api/admin/achievements/${data.id}`;
                          const method = creatingAchievement ? 'POST' : 'PUT';
                          const res = await fetch(url, {
                            method,
                            headers: { ...headers, 'Content-Type': 'application/json' },
                            body: JSON.stringify(data),
                          });
                          if (res.ok) {
                            const saved = await res.json();
                            if (creatingAchievement) {
                              setAchievements(prev => [...prev, saved]);
                            } else {
                              setAchievements(prev => prev.map(a => a.id === saved.id ? saved : a));
                            }
                            setEditingAchievement(null);
                            setCreatingAchievement(false);
                            toast({ title: creatingAchievement ? 'Achievement created' : 'Achievement saved' });
                          } else {
                            const err = await res.json();
                            toast({ title: err.error || 'Save failed', variant: 'destructive' });
                          }
                        } catch (e) {
                          toast({ title: 'Save failed', variant: 'destructive' });
                        } finally {
                          setSavingAchievement(false);
                        }
                      }}
                      onCancel={() => { setEditingAchievement(null); setCreatingAchievement(false); }}
                      saving={savingAchievement}
                      adminKey={adminKey}
                      allBadges={data.badges || []}
                      getAdminHeaders={getAdminHeaders}
                      staffRole={staffRole}
                    />
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">Achievements ({achievements.length})</h3>
                        <Button onClick={() => setCreatingAchievement(true)} data-testid="button-create-achievement">
                          <Plus weight="bold" className="w-4 h-4 mr-1" /> New Achievement
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {achievements.map((a: any) => (
                          <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent/50 cursor-pointer" onClick={() => setEditingAchievement(a)}>
                            <div className="flex items-center gap-3">
                              {a.icon && <img src={a.icon} alt="" className="w-8 h-8 rounded" />}
                              <div>
                                <div className="text-sm font-medium">{a.name || a.id}</div>
                                <div className="text-xs text-muted-foreground">{a.category} · {a.trackingKey} · {(a.tiers || []).length} tiers</div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setEditingAchievement(a); }}>Edit</Button>
                              {isFullAdmin && (
                                <Button variant="destructive" size="sm" onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm('Delete this achievement?')) return;
                                  try {
                                    const headers = await getAdminHeaders(adminKey);
                                    await fetch(`/api/admin/achievements/${a.id}`, { method: 'DELETE', headers });
                                    setAchievements(prev => prev.filter(x => x.id !== a.id));
                                    toast({ title: 'Achievement deleted' });
                                  } catch (e) {
                                    toast({ title: 'Delete failed', variant: 'destructive' });
                                  }
                                }}>Delete</Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </TabsContent>
                <TabsContent value="security" className="mt-0">
                  <div className="space-y-6">
                    <Card className="bg-card border-border">
                      <CardHeader>
                        <CardTitle className="text-red-400 flex items-center gap-2" data-testid="text-suspicious-activities-title">
                          <Shield className="w-5 h-5" />
                          Suspicious Activities
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {loadingSuspicious ? (
                          <p className="text-muted-foreground" data-testid="text-loading-suspicious">Loading suspicious activities...</p>
                        ) : suspiciousActivities.length === 0 ? (
                          <p className="text-muted-foreground" data-testid="text-no-suspicious">No suspicious activities found.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Player</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Severity</TableHead>
                                  <TableHead>Details</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {suspiciousActivities.map((activity: any) => (
                                  <>
                                    <TableRow
                                      key={`activity-${activity.id}`}
                                      className="cursor-pointer hover:bg-muted/50"
                                      onClick={() => setExpandedActivityId(expandedActivityId === activity.id ? null : activity.id)}
                                      data-testid={`row-activity-${activity.id}`}
                                    >
                                      <TableCell className="text-xs">{new Date(activity.createdAt).toLocaleString()}</TableCell>
                                      <TableCell data-testid={`text-player-${activity.id}`}>{activity.playerUsername || "Unknown"}</TableCell>
                                      <TableCell>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                          activity.type === "gold_manipulation" ? "bg-yellow-900/50 text-yellow-400" :
                                          activity.type === "invalid_items" ? "bg-red-900/50 text-red-400" :
                                          activity.type === "skill_manipulation" ? "bg-orange-900/50 text-orange-400" :
                                          "bg-gray-900/50 text-gray-400"
                                        }`} data-testid={`text-type-${activity.id}`}>{activity.type}</span>
                                      </TableCell>
                                      <TableCell>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                          activity.severity === "critical" ? "bg-red-900/50 text-red-400" :
                                          activity.severity === "high" ? "bg-orange-900/50 text-orange-400" :
                                          activity.severity === "medium" ? "bg-yellow-900/50 text-yellow-400" :
                                          "bg-gray-900/50 text-gray-400"
                                        }`} data-testid={`text-severity-${activity.id}`}>{activity.severity}</span>
                                      </TableCell>
                                      <TableCell className="text-xs max-w-[200px] truncate" data-testid={`text-details-${activity.id}`}>
                                        {JSON.stringify(activity.details || {}).substring(0, 100)}
                                      </TableCell>
                                      <TableCell>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                          activity.reviewed ? "bg-green-900/50 text-green-400" : "bg-yellow-900/50 text-yellow-400"
                                        }`} data-testid={`text-status-${activity.id}`}>
                                          {activity.reviewed ? "Reviewed" : "Pending"}
                                        </span>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                          {!activity.reviewed && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="text-xs"
                                              onClick={() => markActivityReviewed(activity.id)}
                                              data-testid={`button-review-${activity.id}`}
                                            >
                                              Mark Reviewed
                                            </Button>
                                          )}
                                          <Button
                                            size="sm"
                                            variant="destructive"
                                            className="text-xs"
                                            onClick={() => {
                                              if (window.confirm(`Are you sure you want to BAN player "${activity.playerUsername || activity.playerId}"?`)) {
                                                banPlayer(activity.playerId, `Banned for: ${activity.type}`);
                                              }
                                            }}
                                            data-testid={`button-ban-${activity.id}`}
                                          >
                                            BAN
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                    {expandedActivityId === activity.id && (
                                      <TableRow key={`activity-details-${activity.id}`}>
                                        <TableCell colSpan={7} className="bg-muted/30">
                                          <pre className="text-xs whitespace-pre-wrap break-all p-2" data-testid={`text-full-details-${activity.id}`}>
                                            {JSON.stringify(activity.details, null, 2)}
                                          </pre>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="bg-card border-border">
                      <CardHeader>
                        <CardTitle className="text-orange-400" data-testid="text-ban-player-title">Ban Player</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Input
                            placeholder="Player ID"
                            value={banPlayerId}
                            onChange={(e) => setBanPlayerId(e.target.value)}
                            className="sm:w-48"
                            data-testid="input-ban-player-id"
                          />
                          <Input
                            placeholder="Reason"
                            value={banReason}
                            onChange={(e) => setBanReason(e.target.value)}
                            className="sm:flex-1"
                            data-testid="input-ban-reason"
                          />
                          <Button
                            variant="destructive"
                            onClick={banPlayerFromForm}
                            disabled={banningPlayer || !banPlayerId.trim()}
                            data-testid="button-ban-player"
                          >
                            {banningPlayer ? "Banning..." : "Ban Player"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-card border-border">
                      <CardHeader>
                        <CardTitle className="text-red-400" data-testid="text-banned-emails-title">Banned Emails</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {loadingBannedEmails ? (
                          <p className="text-muted-foreground" data-testid="text-loading-banned">Loading banned emails...</p>
                        ) : bannedEmails.length === 0 ? (
                          <p className="text-muted-foreground" data-testid="text-no-banned">No banned emails found.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Email</TableHead>
                                  <TableHead>Username</TableHead>
                                  <TableHead>Reason</TableHead>
                                  <TableHead>Banned At</TableHead>
                                  <TableHead>Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {bannedEmails.map((ban: any, index: number) => (
                                  <TableRow key={`ban-${ban.email || index}`} data-testid={`row-banned-${index}`}>
                                    <TableCell className="text-sm" data-testid={`text-banned-email-${index}`}>{ban.email}</TableCell>
                                    <TableCell className="text-sm" data-testid={`text-banned-username-${index}`}>{ban.username || "—"}</TableCell>
                                    <TableCell className="text-sm" data-testid={`text-banned-reason-${index}`}>{ban.reason || "—"}</TableCell>
                                    <TableCell className="text-xs" data-testid={`text-banned-at-${index}`}>{ban.bannedAt ? new Date(ban.bannedAt).toLocaleString() : "—"}</TableCell>
                                    <TableCell>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs"
                                        onClick={() => unbanEmail(ban.email)}
                                        data-testid={`button-unban-${index}`}
                                      >
                                        Unban
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        <Dialog open={playerDetailDialogOpen} onOpenChange={setPlayerDetailDialogOpen}>
          <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto p-3 sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">Player Details</DialogTitle>
              <DialogDescription>
                {selectedPlayer && (
                  <div className="flex flex-col gap-1 mt-2 text-xs sm:text-sm">
                    <div className="flex items-center gap-2">
                      <strong>Username:</strong>
                      <Input
                        type="text"
                        value={editingUsername}
                        onChange={(e) => setEditingUsername(e.target.value)}
                        className="h-7 w-40 text-xs"
                        data-testid="input-edit-username"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={() => savePlayerUsername(selectedPlayer.id, editingUsername)}
                        disabled={savingPlayerData || editingUsername === selectedPlayer.username}
                        data-testid="button-save-username"
                      >
                        Save
                      </Button>
                    </div>
                    <span><strong>Email:</strong> {selectedPlayer.email || "N/A"}</span>
                    <span className="truncate"><strong>ID:</strong> {selectedPlayer.id}</span>
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>
            
            {playerDetailLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-muted-foreground">Loading player details...</div>
              </div>
            ) : selectedPlayer ? (
              <Tabs value={playerDetailTab} onValueChange={setPlayerDetailTab} className="mt-4">
                <TabsList className="w-full h-auto flex-wrap">
                  <TabsTrigger value="info" className="flex-1 text-xs sm:text-sm py-1.5">Info</TabsTrigger>
                  <TabsTrigger value="skills" className="flex-1 text-xs sm:text-sm py-1.5">Skills</TabsTrigger>
                  <TabsTrigger value="inventory" className="flex-1 text-xs sm:text-sm py-1.5">Inventory</TabsTrigger>
                  <TabsTrigger value="equipment" className="flex-1 text-xs sm:text-sm py-1.5">Equipment</TabsTrigger>
                </TabsList>
                
                <TabsContent value="info" className="mt-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Gold</label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          type="number"
                          value={playerGold}
                          onChange={(e) => setPlayerGold(Number(e.target.value))}
                          className="flex-1"
                          data-testid="input-player-gold"
                        />
                        <Button
                          onClick={() => savePlayerGold(selectedPlayer.id, playerGold)}
                          disabled={savingPlayerData}
                          className="w-full sm:w-auto"
                          data-testid="button-save-gold"
                        >
                          {savingPlayerData ? "Saving..." : "Save Gold"}
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                      <div><strong>Total Level:</strong> {selectedPlayer.totalLevel || 0}</div>
                      <div><strong>Combat Level:</strong> {selectedPlayer.combatLevel || 0}</div>
                      <div><strong>Last Saved:</strong> {selectedPlayer.lastSaved || "N/A"}</div>
                      <div><strong>Last Seen:</strong> {selectedPlayer.lastSeen || "N/A"}</div>
                    </div>
                    
                    {/* Weapon Masteries */}
                    <div className="space-y-3 pt-4 border-t">
                      <label className="text-sm font-medium text-foreground">Weapon Masteries (XP)</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                          { key: "masteryDagger", label: "Dagger" },
                          { key: "masterySwordShield", label: "Sword & Shield" },
                          { key: "mastery2hSword", label: "2H Sword" },
                          { key: "mastery2hAxe", label: "2H Axe" },
                          { key: "mastery2hWarhammer", label: "2H Warhammer" },
                          { key: "masteryBow", label: "Bow" },
                          { key: "masteryStaff", label: "Staff" },
                        ].map((m) => (
                          <div key={m.key} className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground w-28 shrink-0">{m.label}</label>
                            <Input
                              type="number"
                              value={playerMasteries[m.key] || 0}
                              onChange={(e) => setPlayerMasteries(prev => ({ ...prev, [m.key]: Number(e.target.value) || 0 }))}
                              className="h-8 text-xs flex-1"
                              min={0}
                              data-testid={`input-mastery-${m.key}`}
                            />
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={() => savePlayerMasteries(selectedPlayer.id, playerMasteries)}
                        disabled={savingPlayerData}
                        className="w-full"
                        size="sm"
                        data-testid="button-save-masteries"
                      >
                        {savingPlayerData ? "Saving..." : "Save Masteries"}
                      </Button>
                    </div>

                    <div className="space-y-3 pt-4 border-t">
                      <label className="text-sm font-medium text-foreground">Dungeon Keys</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { key: "bronze", label: "Bronze", color: "text-amber-600" },
                          { key: "silver", label: "Silver", color: "text-gray-400" },
                          { key: "gold", label: "Gold", color: "text-yellow-400" },
                          { key: "void", label: "Void", color: "text-purple-400" },
                        ].map((k) => (
                          <div key={k.key} className="flex flex-col gap-1">
                            <label className={`text-xs font-medium ${k.color}`}>{k.label}</label>
                            <Input
                              type="number"
                              value={playerDungeonKeys[k.key] || 0}
                              onChange={(e) => setPlayerDungeonKeys(prev => ({ ...prev, [k.key]: Number(e.target.value) || 0 }))}
                              className="h-8 text-xs"
                              min={0}
                              data-testid={`input-dungeon-key-${k.key}`}
                            />
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={() => savePlayerDungeonKeys(selectedPlayer.id, playerDungeonKeys)}
                        disabled={savingPlayerData}
                        className="w-full"
                        size="sm"
                        data-testid="button-save-dungeon-keys"
                      >
                        {savingPlayerData ? "Saving..." : "Save Keys"}
                      </Button>
                    </div>

                    <div className="space-y-3 pt-4 border-t">
                      <h4 className="text-sm font-medium text-muted-foreground">Player Badges</h4>
                      {playerBadges.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {playerBadges.map((pb: any) => (
                            <div key={pb.badgeId} className="flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1 text-xs">
                              <span className="font-medium">{pb.badge?.name || pb.badgeId}</span>
                              <span className="text-muted-foreground text-[10px]">({pb.badge?.rarity})</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-4 w-4 p-0 ml-1 text-red-400 hover:text-red-300"
                                onClick={() => removePlayerBadge(selectedPlayer.id, pb.badgeId)}
                                data-testid={`button-remove-badge-${pb.badgeId}`}
                              >
                                ×
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No badges assigned</p>
                      )}
                      <div className="flex gap-2">
                        <select
                          className="text-xs bg-background border rounded px-2 py-1.5 flex-1"
                          value={selectedBadgeToAward}
                          onChange={(e) => setSelectedBadgeToAward(e.target.value)}
                          data-testid="select-badge-to-award"
                        >
                          <option value="">Select badge to award...</option>
                          {(data.badges || [])
                            .filter((b: any) => !playerBadges.some((pb: any) => pb.badgeId === b.id))
                            .map((b: any) => (
                              <option key={b.id} value={b.id}>{b.name} ({b.rarity})</option>
                            ))}
                        </select>
                        <Button
                          size="sm"
                          onClick={() => awardPlayerBadge(selectedPlayer.id, selectedBadgeToAward)}
                          disabled={!selectedBadgeToAward}
                          data-testid="button-award-badge"
                        >
                          Award
                        </Button>
                      </div>
                    </div>

                    {isFullAdmin && (
                    <div className="space-y-3 pt-4 border-t">
                      <h4 className="text-sm font-medium text-muted-foreground">Roles & Permissions</h4>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-sm font-medium text-foreground">Staff Role</label>
                            <p className="text-xs text-muted-foreground">Assign admin panel access level</p>
                          </div>
                          <select
                            className="text-xs bg-background border rounded px-2 py-1.5"
                            value={selectedPlayer.staffRole || ""}
                            onChange={(e) => {
                              const val = e.target.value || null;
                              savePlayerRole(selectedPlayer.id, val, !!selectedPlayer.isTester);
                            }}
                            disabled={savingPlayerData}
                            data-testid="select-staff-role"
                          >
                            <option value="">None</option>
                            <option value="moderator">Moderator</option>
                            <option value="translator">Translator</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-sm font-medium text-foreground">Tester Mode Access</label>
                            <p className="text-xs text-muted-foreground">Allow this player to use Test Mode</p>
                          </div>
                          <Button
                            variant={selectedPlayer.isTester ? "default" : "outline"}
                            size="sm"
                            onClick={() => togglePlayerTester(selectedPlayer.id, !selectedPlayer.isTester)}
                            disabled={savingPlayerData}
                            data-testid="button-toggle-tester"
                          >
                            {selectedPlayer.isTester ? "Tester ✓" : "Not Tester"}
                          </Button>
                        </div>
                      </div>
                    </div>
                    )}
                    
                    {isFullAdmin && (
                    <div className="space-y-2 pt-4 border-t">
                      <h4 className="text-sm font-medium text-muted-foreground">Firebase Connection</h4>
                      <div className="grid grid-cols-1 gap-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <span className={selectedPlayer.firebaseUid ? "text-green-400" : selectedPlayer.isGuest === 1 ? "text-yellow-400" : "text-red-400"}>
                            {selectedPlayer.firebaseUid ? "Connected" : selectedPlayer.isGuest === 1 ? "Guest Account" : "Not Connected"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Firebase UID:</span>
                          <span className="font-mono text-xs max-w-[200px] truncate" title={selectedPlayer.firebaseUid || "None"}>
                            {selectedPlayer.firebaseUid || "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Email:</span>
                          <span className="text-xs max-w-[200px] truncate" title={selectedPlayer.email || "None"}>
                            {selectedPlayer.email || "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Account Type:</span>
                          <span>{selectedPlayer.isGuest === 1 ? "Guest" : "Firebase"}</span>
                        </div>
                      </div>
                      {selectedPlayer.firebaseUid && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (!adminKey || !userEmail || !selectedPlayer) return;
                            if (!confirm("Are you sure? This will disconnect the Firebase account. The player will need to log in again with the same email to re-link.")) return;
                            setSavingPlayerData(true);
                            try {
                              const response = await fetch(`/api/admin/players/${selectedPlayer.id}/reset-firebase-uid`, {
                                method: "POST",
                                headers: await getAdminHeaders(adminKey),
                                credentials: "include",
                              });
                              if (!response.ok) throw new Error("Failed");
                              const result = await response.json();
                              toast({ title: result.message || "Firebase UID reset successfully" });
                              fetchPlayerDetails(selectedPlayer.id);
                            } catch (error) {
                              toast({ title: "Failed to reset Firebase UID", variant: "destructive" });
                            } finally {
                              setSavingPlayerData(false);
                            }
                          }}
                          disabled={savingPlayerData}
                          data-testid="button-reset-firebase-uid"
                          className="text-xs w-full border-orange-500 text-orange-500 hover:bg-orange-500/10"
                        >
                          Reset Firebase UID
                        </Button>
                      )}
                    </div>
                    )}
                    
                    {/* Player Troubleshooting Actions */}
                    <div className="space-y-3 pt-4 border-t">
                      <h4 className="text-sm font-medium text-muted-foreground">Troubleshooting</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectedPlayer && handleForceLogout(selectedPlayer.id)}
                          disabled={savingPlayerData}
                          data-testid="button-force-logout"
                          className="text-xs"
                        >
                          Force Logout
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectedPlayer && handleClearActiveTask(selectedPlayer.id)}
                          disabled={savingPlayerData}
                          data-testid="button-clear-task"
                          className="text-xs"
                        >
                          Clear Active Task
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectedPlayer && handleClearOfflineProgress(selectedPlayer.id)}
                          disabled={savingPlayerData}
                          data-testid="button-clear-offline"
                          className="text-xs"
                        >
                          Clear Offline Progress
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectedPlayer && handleClearActiveCombat(selectedPlayer.id)}
                          disabled={savingPlayerData}
                          data-testid="button-clear-combat"
                          className="text-xs"
                        >
                          Clear Active Combat
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectedPlayer && handleClearBuffs(selectedPlayer.id)}
                          disabled={savingPlayerData}
                          data-testid="button-clear-buffs"
                          className="text-xs"
                        >
                          Clear Buffs
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-xs text-muted-foreground">Change Region:</span>
                        <select
                          className="text-xs bg-background border rounded px-2 py-1"
                          value={selectedPlayer?.currentRegion || ''}
                          onChange={(e) => selectedPlayer && handleChangeRegion(selectedPlayer.id, e.target.value)}
                          disabled={savingPlayerData}
                          data-testid="select-change-region"
                        >
                          <option value="verdant">Verdant</option>
                          <option value="quarry">Quarry</option>
                          <option value="obsidian">Obsidian</option>
                          <option value="dragonspire">Dragonspire</option>
                          <option value="frozen_wastes">Frozen Wastes</option>
                          <option value="void_realm">Void Realm</option>
                        </select>
                      </div>
                      {isFullAdmin && (
                      <div className="flex items-center gap-2 mt-3">
                        {selectedPlayer?.isBanned === 1 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => selectedPlayer && handleUnbanPlayer(selectedPlayer.id)}
                            disabled={savingPlayerData}
                            data-testid="button-unban"
                            className="text-xs border-green-500 text-green-500 hover:bg-green-500/10"
                          >
                            Unban Player
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => selectedPlayer && handleBanPlayer(selectedPlayer.id)}
                            disabled={savingPlayerData}
                            data-testid="button-ban"
                            className="text-xs border-red-500 text-red-500 hover:bg-red-500/10"
                          >
                            Ban Player
                          </Button>
                        )}
                        {selectedPlayer?.isBanned === 1 && selectedPlayer?.banReason && (
                          <span className="text-xs text-red-400">Reason: {selectedPlayer.banReason}</span>
                        )}
                      </div>
                      )}
                    </div>

                    {isFullAdmin && (
                    <div className="pt-4 border-t border-destructive/30">
                      <Button
                        variant="destructive"
                        onClick={() => setResetConfirmDialogOpen(true)}
                        className="w-full"
                        data-testid="button-reset-character"
                      >
                        <Warning className="w-4 h-4 mr-2" />
                        Reset Character
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2 text-center">
                        This will reset all skills, inventory, gold, and equipment to initial state.
                      </p>
                    </div>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="skills" className="mt-4">
                  <div className="space-y-4">
                    <div className="max-h-[300px] sm:max-h-[400px] overflow-y-auto -mx-3 px-3">
                      <Table className="min-w-[280px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs sm:text-sm">Skill</TableHead>
                            <TableHead className="text-xs sm:text-sm">Lvl</TableHead>
                            <TableHead className="text-xs sm:text-sm">XP</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {playerSkills.map((skill, index) => (
                            <TableRow key={skill.skillId || index}>
                              <TableCell className="font-medium text-xs sm:text-sm py-1">{skill.skillId || skill.name || `Skill ${index + 1}`}</TableCell>
                              <TableCell className="py-1">
                                <Input
                                  type="number"
                                  value={skill.level || 1}
                                  onChange={(e) => handleSkillChange(index, "level", Number(e.target.value))}
                                  className="w-14 sm:w-20 h-8 text-xs sm:text-sm"
                                  min={1}
                                  data-testid={`input-skill-level-${index}`}
                                />
                              </TableCell>
                              <TableCell className="py-1">
                                <Input
                                  type="number"
                                  value={skill.xp || 0}
                                  onChange={(e) => handleSkillChange(index, "xp", Number(e.target.value))}
                                  className="w-20 sm:w-28 h-8 text-xs sm:text-sm"
                                  min={0}
                                  data-testid={`input-skill-xp-${index}`}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Button
                      onClick={() => savePlayerSkills(selectedPlayer.id, playerSkills)}
                      disabled={savingPlayerData}
                      className="w-full"
                      data-testid="button-save-skills"
                    >
                      {savingPlayerData ? "Saving..." : "Save All Skills"}
                    </Button>
                  </div>
                </TabsContent>
                
                <TabsContent value="inventory" className="mt-4">
                  <div className="space-y-4">
                    <div className="space-y-3 p-3 rounded-lg border border-border/30 bg-background/30">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1 space-y-2">
                          <label className="text-sm font-medium text-foreground">Item ID</label>
                          <Input
                            type="text"
                            value={newItemId}
                            onChange={(e) => setNewItemId(e.target.value)}
                            placeholder="Enter item ID..."
                            data-testid="input-new-item-id"
                          />
                        </div>
                        <div className="w-24 space-y-2">
                          <label className="text-sm font-medium text-foreground">Qty</label>
                          <Input
                            type="number"
                            value={newItemQuantity}
                            onChange={(e) => setNewItemQuantity(Number(e.target.value))}
                            min={1}
                            data-testid="input-new-item-quantity"
                          />
                        </div>
                        <div className="w-20 space-y-2">
                          <label className="text-sm font-medium text-cyan-400">+Enh</label>
                          <Input
                            type="number"
                            value={newItemEnhLevel}
                            onChange={(e) => setNewItemEnhLevel(Math.min(10, Math.max(0, Number(e.target.value))))}
                            min={0}
                            max={10}
                            data-testid="input-new-item-enh-level"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-cyan-400">Skills (max 2)</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {["poison", "burn", "bleed", "stun", "freeze", "vampiric", "execute", "armor_pierce"].map((skill) => (
                            <button
                              key={skill}
                              onClick={() => {
                                setNewItemSkills((prev) => {
                                  if (prev.includes(skill)) return prev.filter((s) => s !== skill);
                                  if (prev.length >= 2) return prev;
                                  return [...prev, skill];
                                });
                              }}
                              data-testid={`enh-skill-toggle-${skill}`}
                              className={`px-2 py-1 rounded border text-xs transition-colors ${
                                newItemSkills.includes(skill)
                                  ? "bg-cyan-600 border-cyan-500 text-white"
                                  : "border-border/30 text-muted-foreground hover:border-cyan-500/50"
                              }`}
                            >
                              {skill.replace("_", " ")}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-cyan-400">Bonus Stats (max 3)</label>
                          {newItemStats.length < 3 && (
                            <button
                              onClick={() => setNewItemStats((prev) => [...prev, { stat: "bonusAttack", value: 1 }])}
                              className="text-xs text-cyan-400 hover:text-cyan-300"
                              data-testid="button-add-stat"
                            >
                              + Add Stat
                            </button>
                          )}
                        </div>
                        {newItemStats.map((entry, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <select
                              value={entry.stat}
                              onChange={(e) => {
                                setNewItemStats((prev) => prev.map((s, i) => i === idx ? { ...s, stat: e.target.value } : s));
                              }}
                              className="h-9 rounded-md border border-border/30 bg-background text-sm px-2 flex-1"
                              data-testid={`stat-type-${idx}`}
                            >
                              <option value="bonusAttack">ATK</option>
                              <option value="bonusStrength">STR</option>
                              <option value="bonusDefence">DEF</option>
                              <option value="bonusHitpoints">HP</option>
                              <option value="accuracy">ACC</option>
                              <option value="critChance">CRIT%</option>
                              <option value="critDamage">CRIT DMG</option>
                            </select>
                            <Input
                              type="number"
                              value={entry.value}
                              onChange={(e) => {
                                setNewItemStats((prev) => prev.map((s, i) => i === idx ? { ...s, value: Number(e.target.value) } : s));
                              }}
                              className="w-20"
                              min={1}
                              data-testid={`stat-value-${idx}`}
                            />
                            <button
                              onClick={() => setNewItemStats((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-red-400 hover:text-red-300 text-sm"
                              data-testid={`stat-remove-${idx}`}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      <Button onClick={handleAddInventoryItem} className="w-full" data-testid="button-add-item">
                        <Plus className="w-4 h-4 mr-2" />
                        {newItemEnhLevel > 0 || newItemSkills.length > 0 || newItemStats.length > 0
                          ? `Add +${newItemEnhLevel} Item${newItemSkills.length > 0 ? ` [${newItemSkills.join(", ")}]` : ""}${newItemStats.length > 0 ? ` (${newItemStats.length} stats)` : ""}`
                          : "Add Item"}
                      </Button>
                    </div>
                    
                    <div className="relative">
                      <Input
                        type="text"
                        value={inventorySearchQuery}
                        onChange={(e) => setInventorySearchQuery(e.target.value)}
                        placeholder="Search inventory items..."
                        className="mb-2"
                        data-testid="input-inventory-search"
                      />
                      {inventorySearchQuery.trim() && (
                        <span className="text-xs text-muted-foreground">
                          Showing {playerInventory.filter(item => item.itemId.toLowerCase().includes(inventorySearchQuery.toLowerCase())).length} of {playerInventory.length} items
                        </span>
                      )}
                    </div>

                    <div className="max-h-[350px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item ID</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {playerInventory
                            .map((item, index) => ({ item, index }))
                            .filter(({ item }) => !inventorySearchQuery.trim() || item.itemId.toLowerCase().includes(inventorySearchQuery.toLowerCase()))
                            .map(({ item, index }) => {
                            const mod = pendingItemMods[item.itemId];
                            const isEditing = editingEnhItemId === item.itemId;
                            const hasHash = item.itemId.includes('#');
                            return (
                            <React.Fragment key={index}>
                            <TableRow>
                              <TableCell>
                                <div className="space-y-1">
                                  <Input
                                    type="text"
                                    value={item.itemId || ""}
                                    onChange={(e) => handleInventoryChange(index, "itemId", e.target.value)}
                                    className="w-48"
                                    data-testid={`input-inventory-item-${index}`}
                                  />
                                  {mod && (
                                    <div className="flex gap-1 flex-wrap">
                                      {mod.enhancementLevel > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">+{mod.enhancementLevel}</span>
                                      )}
                                      {mod.addedSkills.map((s: string) => (
                                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-400 border border-purple-500/30">{s}</span>
                                      ))}
                                      {Object.entries(mod.addedStats).map(([k, v]) => (
                                        <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-400 border border-amber-500/30">{k.replace('bonus', '')}+{String(v)}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.quantity || 1}
                                  onChange={(e) => handleInventoryChange(index, "quantity", Number(e.target.value))}
                                  className="w-24"
                                  min={1}
                                  data-testid={`input-inventory-quantity-${index}`}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex gap-1 justify-end">
                                  {hasHash && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingEnhItemId(isEditing ? null : item.itemId)}
                                      className={isEditing ? "border-cyan-500 text-cyan-400" : ""}
                                      data-testid={`button-edit-enh-${index}`}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleRemoveInventoryItem(index)}
                                    data-testid={`button-remove-item-${index}`}
                                  >
                                    <Trash className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            {isEditing && (
                              <TableRow>
                                <TableCell colSpan={3}>
                                  <div className="space-y-3 p-3 rounded-lg border border-cyan-500/30 bg-cyan-950/10">
                                    <div className="text-xs font-medium text-cyan-400 mb-2">Edit Enhancement</div>
                                    <div className="flex gap-2 items-center">
                                      <label className="text-xs text-muted-foreground w-20">Level</label>
                                      <Input
                                        type="number"
                                        value={mod?.enhancementLevel || 0}
                                        onChange={(e) => {
                                          const val = Math.min(10, Math.max(0, Number(e.target.value)));
                                          setPendingItemMods(prev => ({
                                            ...prev,
                                            [item.itemId]: {
                                              enhancementLevel: val,
                                              addedStats: prev[item.itemId]?.addedStats || {},
                                              addedSkills: prev[item.itemId]?.addedSkills || [],
                                            }
                                          }));
                                        }}
                                        min={0}
                                        max={10}
                                        className="w-20"
                                        data-testid={`edit-enh-level-${index}`}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs text-muted-foreground">Skills (max 2)</label>
                                      <div className="flex gap-1.5 flex-wrap">
                                        {["poison", "burn", "bleed", "stun", "freeze", "vampiric", "execute", "armor_pierce"].map((skill) => {
                                          const currentSkills = mod?.addedSkills || [];
                                          return (
                                            <button
                                              key={skill}
                                              onClick={() => {
                                                setPendingItemMods(prev => {
                                                  const existing = prev[item.itemId] || { enhancementLevel: 0, addedStats: {}, addedSkills: [] };
                                                  const skills = existing.addedSkills.includes(skill)
                                                    ? existing.addedSkills.filter(s => s !== skill)
                                                    : existing.addedSkills.length >= 2 ? existing.addedSkills : [...existing.addedSkills, skill];
                                                  return { ...prev, [item.itemId]: { ...existing, addedSkills: skills } };
                                                });
                                              }}
                                              className={`px-2 py-1 rounded border text-xs transition-colors ${
                                                currentSkills.includes(skill)
                                                  ? "bg-cyan-600 border-cyan-500 text-white"
                                                  : "border-border/30 text-muted-foreground hover:border-cyan-500/50"
                                              }`}
                                              data-testid={`edit-enh-skill-${skill}-${index}`}
                                            >
                                              {skill.replace("_", " ")}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between">
                                        <label className="text-xs text-muted-foreground">Bonus Stats (max 3)</label>
                                        {(Object.keys(mod?.addedStats || {}).length || 0) < 3 && (
                                          <button
                                            onClick={() => {
                                              setPendingItemMods(prev => {
                                                const existing = prev[item.itemId] || { enhancementLevel: 0, addedStats: {}, addedSkills: [] };
                                                const usedStats = Object.keys(existing.addedStats);
                                                const allStats = ["bonusAttack", "bonusStrength", "bonusDefence", "bonusHitpoints", "accuracy", "critChance", "critDamage"];
                                                const available = allStats.find(s => !usedStats.includes(s)) || "bonusAttack";
                                                return { ...prev, [item.itemId]: { ...existing, addedStats: { ...existing.addedStats, [available]: 1 } } };
                                              });
                                            }}
                                            className="text-xs text-cyan-400 hover:text-cyan-300"
                                            data-testid={`edit-enh-add-stat-${index}`}
                                          >
                                            + Add Stat
                                          </button>
                                        )}
                                      </div>
                                      {Object.entries(mod?.addedStats || {}).map(([statKey, statVal], sIdx) => (
                                        <div key={statKey} className="flex gap-2 items-center">
                                          <select
                                            value={statKey}
                                            onChange={(e) => {
                                              setPendingItemMods(prev => {
                                                const existing = prev[item.itemId] || { enhancementLevel: 0, addedStats: {}, addedSkills: [] };
                                                const newStats = { ...existing.addedStats };
                                                const val = newStats[statKey];
                                                delete newStats[statKey];
                                                newStats[e.target.value] = val;
                                                return { ...prev, [item.itemId]: { ...existing, addedStats: newStats } };
                                              });
                                            }}
                                            className="h-9 rounded-md border border-border/30 bg-background text-sm px-2 flex-1"
                                            data-testid={`edit-enh-stat-type-${sIdx}-${index}`}
                                          >
                                            <option value="bonusAttack">ATK</option>
                                            <option value="bonusStrength">STR</option>
                                            <option value="bonusDefence">DEF</option>
                                            <option value="bonusHitpoints">HP</option>
                                            <option value="accuracy">ACC</option>
                                            <option value="critChance">CRIT%</option>
                                            <option value="critDamage">CRIT DMG</option>
                                          </select>
                                          <Input
                                            type="number"
                                            value={statVal as number}
                                            onChange={(e) => {
                                              setPendingItemMods(prev => {
                                                const existing = prev[item.itemId] || { enhancementLevel: 0, addedStats: {}, addedSkills: [] };
                                                return { ...prev, [item.itemId]: { ...existing, addedStats: { ...existing.addedStats, [statKey]: Number(e.target.value) } } };
                                              });
                                            }}
                                            className="w-20"
                                            min={1}
                                            data-testid={`edit-enh-stat-val-${sIdx}-${index}`}
                                          />
                                          <button
                                            onClick={() => {
                                              setPendingItemMods(prev => {
                                                const existing = prev[item.itemId] || { enhancementLevel: 0, addedStats: {}, addedSkills: [] };
                                                const newStats = { ...existing.addedStats };
                                                delete newStats[statKey];
                                                return { ...prev, [item.itemId]: { ...existing, addedStats: newStats } };
                                              });
                                            }}
                                            className="text-red-400 hover:text-red-300 text-sm"
                                            data-testid={`edit-enh-stat-remove-${sIdx}-${index}`}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                            </React.Fragment>
                            );
                          })}
                          {playerInventory.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                                No items in inventory
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    
                    <Button
                      onClick={() => savePlayerInventory(selectedPlayer.id, playerInventory, Object.keys(pendingItemMods).length > 0 ? pendingItemMods : undefined)}
                      disabled={savingPlayerData}
                      className="w-full"
                      data-testid="button-save-inventory"
                    >
                      {savingPlayerData ? "Saving..." : `Save Inventory${Object.keys(pendingItemMods).length > 0 ? ` (${Object.keys(pendingItemMods).length} enhanced)` : ""}`}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="equipment" className="mt-4">
                  <div className="space-y-4">
                    <div className="max-h-[350px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Slot</TableHead>
                            <TableHead>Item Name</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {playerEquipment.map((eq, index) => {
                            const eqItemName = eq.itemName || "";
                            const eqMod = eqItemName ? pendingItemMods[eqItemName] : null;
                            const eqHasHash = eqItemName.includes('#');
                            return (
                            <TableRow key={`${eq.slot}-${index}`}>
                              <TableCell className="font-medium capitalize">{eq.slot}</TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <Input
                                    type="text"
                                    value={eqItemName}
                                    onChange={(e) => handleEquipmentChange(index, e.target.value)}
                                    placeholder="Empty"
                                    className="w-64"
                                    data-testid={`input-equipment-${eq.slot}`}
                                  />
                                  {eqMod && (
                                    <div className="flex gap-1 flex-wrap">
                                      {eqMod.enhancementLevel > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">+{eqMod.enhancementLevel}</span>
                                      )}
                                      {eqMod.addedSkills.map((s: string) => (
                                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-400 border border-purple-500/30">{s}</span>
                                      ))}
                                      {Object.entries(eqMod.addedStats).map(([k, v]) => (
                                        <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-400 border border-amber-500/30">{k.replace('bonus', '')}+{String(v)}</span>
                                      ))}
                                    </div>
                                  )}
                                  {eqHasHash && !eqMod && (
                                    <span className="text-[10px] text-muted-foreground italic">Enhanced (no mods data)</span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                            );
                          })}
                          {playerEquipment.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                                No equipment slots found
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    
                    <Button
                      onClick={() => savePlayerEquipment(selectedPlayer.id, playerEquipment)}
                      disabled={savingPlayerData}
                      className="w-full"
                      data-testid="button-save-equipment"
                    >
                      {savingPlayerData ? "Saving..." : "Save Equipment"}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            ) : null}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setPlayerDetailDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className={`max-h-[90vh] overflow-y-auto ${(activeTab === "items" || activeTab === "monsters" || activeTab === "regions" || activeTab === "recipes" || activeTab === "skillActions") ? "max-w-4xl" : "max-w-2xl"}`}>
            {activeTab === "items" ? (
              <ItemEditor
                item={editingItem}
                isCreating={isCreating}
                onSave={handleEditorSave}
                onCancel={() => setEditDialogOpen(false)}
                saving={saving}
                regions={data.regions}
                allItems={data.items}
                adminKey={adminKey}
                allMonsters={data.monsters}
                getAdminHeaders={getAdminHeaders}
                staffRole={staffRole}
              />
            ) : activeTab === "recipes" ? (
              <RecipeEditor
                recipe={editingItem}
                isCreating={isCreating}
                onSave={handleEditorSave}
                onCancel={() => setEditDialogOpen(false)}
                saving={saving}
                regions={data.regions}
                allItems={data.items}
                adminKey={adminKey}
                getAdminHeaders={getAdminHeaders}
                staffRole={staffRole}
              />
            ) : activeTab === "monsters" ? (
              <MonsterEditor
                monster={editingItem}
                isCreating={isCreating}
                onSave={handleEditorSave}
                onCancel={() => setEditDialogOpen(false)}
                saving={saving}
                regions={data.regions}
                allItems={data.items}
                adminKey={adminKey}
                getAdminHeaders={getAdminHeaders}
                staffRole={staffRole}
              />
            ) : activeTab === "skillActions" ? (
              <SkillActionEditor
                skillAction={editingItem}
                isCreating={isCreating}
                onSave={handleEditorSave}
                onCancel={() => setEditDialogOpen(false)}
                saving={saving}
                regions={data.regions}
                allItems={data.items}
                adminKey={adminKey}
                getAdminHeaders={getAdminHeaders}
                staffRole={staffRole}
              />
            ) : activeTab === "regions" ? (
              <RegionEditor
                region={editingItem}
                isCreating={isCreating}
                onSave={handleEditorSave}
                onCancel={() => setEditDialogOpen(false)}
                saving={saving}
                adminKey={adminKey}
                allMonsters={data.monsters}
                allItems={data.items}
                allRegions={data.regions}
                getAdminHeaders={getAdminHeaders}
                staffRole={staffRole}
              />
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {isCreating ? `Create New ${API_CONFIGS[activeTab].label.slice(0, -1)}` : `Edit ${API_CONFIGS[activeTab].label.slice(0, -1)}`}
                  </DialogTitle>
                  <DialogDescription>
                    {isCreating ? "Fill in the details below to create a new entry." : "Modify the fields below and save your changes."}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {API_CONFIGS[activeTab].fields.map(renderFormField)}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving} data-testid="button-save">
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Delete</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{editingItem?.name || editingItem?.id}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={saving} data-testid="button-confirm-delete">
                {saving ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Character Confirmation Dialog */}
        <Dialog open={resetConfirmDialogOpen} onOpenChange={setResetConfirmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Warning className="w-5 h-5" />
                Reset Character
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to reset <strong>{selectedPlayer?.username}</strong>'s character?
                <br /><br />
                This will permanently delete all progress including:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>All skills reset to level 1</li>
                  <li>All inventory items removed</li>
                  <li>All equipment removed</li>
                  <li>Gold set to 0</li>
                  <li>Region reset to Verdant</li>
                </ul>
                <br />
                <strong className="text-destructive">This action cannot be undone!</strong>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetConfirmDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => selectedPlayer && resetPlayerCharacter(selectedPlayer.id)} 
                disabled={resettingCharacter}
                data-testid="button-confirm-reset"
              >
                {resettingCharacter ? "Resetting..." : "Yes, Reset Character"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Publish Drafts Confirmation Dialog */}
        <Dialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-400">
                <CloudArrowUp className="w-5 h-5" />
                Publish All Drafts
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to publish all draft items?
                <br /><br />
                This will make all items, recipes, monsters, and skill actions currently marked as <strong className="text-red-400">Draft</strong> visible to <strong>all players</strong>.
                <br /><br />
                This action will set isDraft = 0 for all draft entries across all game data tables.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPublishConfirmOpen(false)}>
                Cancel
              </Button>
              <Button 
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={publishAllDrafts} 
                disabled={publishingDrafts}
                data-testid="button-confirm-publish"
              >
                {publishingDrafts ? "Publishing..." : "Yes, Publish All"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function DungeonSessionsPanel({ adminKey, getAdminHeaders, toast }: { adminKey: string; getAdminHeaders: (key: string) => Promise<Record<string, string>>; toast: any }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [forceClosingId, setForceClosingId] = useState<string | null>(null);
  const [searchUsername, setSearchUsername] = useState("");
  const [closingByUsername, setClosingByUsername] = useState(false);
  const [cleaningStale, setCleaningStale] = useState(false);

  const fetchActiveSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const headers = await getAdminHeaders(adminKey);
      const res = await fetch("/api/admin/dungeon-sessions/active", { headers });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch {}
    setLoadingSessions(false);
  }, [adminKey, getAdminHeaders]);

  useEffect(() => { fetchActiveSessions(); }, [fetchActiveSessions]);

  const forceCloseSession = async (sessionId: string) => {
    setForceClosingId(sessionId);
    try {
      const headers = await getAdminHeaders(adminKey);
      headers["Content-Type"] = "application/json";
      const res = await fetch(`/api/admin/dungeon-sessions/force-close/${sessionId}`, { method: "POST", headers });
      const data = await res.json();
      if (data.success) {
        toast({ title: `Session closed${data.partyReset ? " (party reset)" : ""}`, duration: 3000 });
        fetchActiveSessions();
      } else {
        toast({ title: data.error || "Failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    }
    setForceClosingId(null);
  };

  const forceCloseByUsername = async () => {
    if (!searchUsername.trim()) return;
    setClosingByUsername(true);
    try {
      const headers = await getAdminHeaders(adminKey);
      headers["Content-Type"] = "application/json";
      const res = await fetch("/api/admin/dungeon-sessions/force-close-player", {
        method: "POST",
        headers,
        body: JSON.stringify({ username: searchUsername.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `Closed ${data.closedSessions} session(s) for ${data.playerUsername}${data.resetParties ? ` (${data.resetParties} party reset)` : ""}`, duration: 4000 });
        setSearchUsername("");
        fetchActiveSessions();
      } else {
        toast({ title: data.error || "Failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    }
    setClosingByUsername(false);
  };

  const cleanupStaleSessions = async () => {
    setCleaningStale(true);
    try {
      const headers = await getAdminHeaders(adminKey);
      headers["Content-Type"] = "application/json";
      const res = await fetch("/api/admin/dungeon-sessions/cleanup", {
        method: "POST",
        headers,
        body: JSON.stringify({ hoursThreshold: 1 }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `Cleaned ${data.closedSessions} stale session(s), ${data.resetParties} party(ies) reset`, duration: 4000 });
        fetchActiveSessions();
      } else {
        toast({ title: data.error || "Failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    }
    setCleaningStale(false);
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ${mins % 60}m ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-2 flex-1">
          <Input
            placeholder="Username to force-close..."
            value={searchUsername}
            onChange={(e) => setSearchUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && forceCloseByUsername()}
            className="max-w-xs text-sm"
            data-testid="input-session-username"
          />
          <Button
            size="sm"
            variant="destructive"
            onClick={forceCloseByUsername}
            disabled={closingByUsername || !searchUsername.trim()}
            data-testid="button-close-by-username"
          >
            {closingByUsername ? "Closing..." : "Close Player Sessions"}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchActiveSessions} disabled={loadingSessions} data-testid="button-refresh-sessions">
            {loadingSessions ? "Loading..." : "Refresh"}
          </Button>
          <Button size="sm" variant="destructive" onClick={cleanupStaleSessions} disabled={cleaningStale} className="bg-red-900/50 hover:bg-red-900" data-testid="button-cleanup-stale">
            {cleaningStale ? "Cleaning..." : "Clean Stale (1h+)"}
          </Button>
        </div>
      </div>

      {loadingSessions ? (
        <div className="text-center py-8 text-muted-foreground">Loading active sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No active dungeon sessions found.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Player</TableHead>
                <TableHead className="text-xs">Dungeon</TableHead>
                <TableHead className="text-xs">Mode</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Floor</TableHead>
                <TableHead className="text-xs">Started</TableHead>
                <TableHead className="text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm font-medium">{s.playerUsername || s.playerId || "-"}</TableCell>
                  <TableCell className="text-sm">{s.dungeonId}</TableCell>
                  <TableCell className="text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs ${s.mode === "party" ? "bg-blue-900/50 text-blue-300" : "bg-green-900/50 text-green-300"}`}>
                      {s.mode}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs ${s.status === "voting" ? "bg-yellow-900/50 text-yellow-300" : "bg-orange-900/50 text-orange-300"}`}>
                      {s.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{s.currentFloor}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatTime(s.startedAt)}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => forceCloseSession(s.id)}
                      disabled={forceClosingId === s.id}
                      className="text-xs h-7"
                      data-testid={`button-force-close-${s.id}`}
                    >
                      {forceClosingId === s.id ? "..." : "Force Close"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="text-xs text-muted-foreground mt-2">{sessions.length} active session(s)</div>
        </div>
      )}
    </div>
  );
}
