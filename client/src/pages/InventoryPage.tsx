import { ItemSlot } from "@/components/game/ItemSlot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RetryImage } from "@/components/ui/retry-image";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Backpack,
  Axe, 
  Pickaxe, 
  Fish,
  ChevronDown,
  Sword,
  Shield,
  HardHat,
  Shirt,
  Footprints,
  Hand,
  X,
  Lock,
  Check,
  ArrowUp,
  ArrowDown,
  Wrench,
  MoreHorizontal,
  Share2,
} from "lucide-react";
import { ShieldStar, TShirt, SortAscending, FunnelSimple, CaretDown, ArrowsClockwise, Drop, Lightning, Skull, Target, Sword as SwordPhosphor, CheckSquare, Hammer, MagnifyingGlass, XCircle } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useGame } from "@/context/GameContext";
import { formatNumber } from "@/lib/gameMath";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMobile } from "@/hooks/useMobile";
import { trackItemEquipped, trackEquipmentRepaired, trackItemStudied, trackItemSalvaged } from "@/hooks/useAchievementTracker";
import { useLanguage } from "@/context/LanguageContext";
import { useChatItemShare } from "@/context/ChatItemShareContext";
import { 
  getBaseItem, 
  parseItemWithRarity,
  stripInstanceSuffix,
  hasRarity, 
  getItemRarityColor, 
  getItemRarityBgColor,
  getItemStatsWithRarity,
  getItemStatsWithEnhancement,
  getItemStatsBreakdown,
  getVendorPrice,
  RARITY_COLORS as EQUIPMENT_RARITY_COLORS,
  RARITY_BG_COLORS as EQUIPMENT_RARITY_BG_COLORS,
  Rarity,
  EquipmentSlot,
  EQUIPMENT_SLOTS,
  getStudyInfo,
  STUDY_DURATION,
  getSalvageInfo,
  translateItemName,
  translateItemDescription,
  getRecipes,
  getItemById
} from "@/lib/items";
import { RoleStatsDisplay } from "@/components/items";
import { getItemImage, BROKEN_ITEM_IMAGE } from "@/lib/itemImages";
import { DurabilityBar } from "@/components/game/DurabilityBar";
import { useToast } from "@/hooks/use-toast";
import { mapWeaponCategoryToMasteryType, MASTERY_TYPE_NAMES, WeaponMasteryType } from "@shared/masterySystem";
import { MasteryCompactWidget } from "@/components/game/MasteryCompactWidget";
import { EquipmentPanel } from "@/components/game/EquipmentPanel";
import { getFoodHealAmount } from "@/lib/foods";
import { SkillDetailPopup } from "@/components/game/SkillDetailPopup";
import { useAudio } from "@/context/AudioContext";

// Item metadata for display (maps item names to their display info)
const ITEM_METADATA: Record<string, { icon: any; color: string; rarity: string; description: string; skill: string }> = {
  // Woodcutting
  "Normal Tree": { icon: Axe, color: "text-amber-600", rarity: "common", description: "Basic logs from a common tree. Good for starting fires or basic crafting.", skill: "Woodcutting" },
  "Oak Tree": { icon: Axe, color: "text-amber-600", rarity: "common", description: "Sturdy oak logs. Stronger than normal wood, useful for better construction.", skill: "Woodcutting" },
  "Willow Tree": { icon: Axe, color: "text-amber-600", rarity: "uncommon", description: "Flexible willow wood. Prized for its magical properties and bow-making.", skill: "Woodcutting" },
  "Maple Tree": { icon: Axe, color: "text-amber-600", rarity: "uncommon", description: "Beautiful maple logs with a sweet aroma. Used in fine crafting.", skill: "Woodcutting" },
  "Yew Tree": { icon: Axe, color: "text-amber-600", rarity: "rare", description: "Ancient yew wood infused with natural energy. Highly valued by enchanters.", skill: "Woodcutting" },
  "Magic Tree": { icon: Axe, color: "text-amber-600", rarity: "legendary", description: "Legendary wood pulsing with arcane power. The rarest and most valuable timber.", skill: "Woodcutting" },
  // Mining
  "Copper Ore": { icon: Pickaxe, color: "text-orange-400", rarity: "common", description: "Raw copper ore. Can be smelted into copper bars for basic tools.", skill: "Mining" },
  "Tin Ore": { icon: Pickaxe, color: "text-slate-400", rarity: "common", description: "Raw tin ore. Combine with copper to create bronze.", skill: "Mining" },
  "Iron Ore": { icon: Pickaxe, color: "text-slate-500", rarity: "uncommon", description: "Dense iron ore. Essential for forging strong weapons and armor.", skill: "Mining" },
  "Silver Ore": { icon: Pickaxe, color: "text-gray-300", rarity: "uncommon", description: "Precious silver ore. Used in jewelry and has anti-undead properties.", skill: "Mining" },
  "Coal": { icon: Pickaxe, color: "text-zinc-800", rarity: "uncommon", description: "Black coal for smelting. Burns hot enough to work stronger metals.", skill: "Mining" },
  "Gold Ore": { icon: Pickaxe, color: "text-yellow-400", rarity: "rare", description: "Valuable gold ore. Highly sought after for wealth and magical items.", skill: "Mining" },
  // Fishing
  "Raw Shrimp": { icon: Fish, color: "text-pink-400", rarity: "common", description: "Tiny pink shrimp. A simple catch that provides basic nourishment.", skill: "Fishing" },
  "Raw Sardine": { icon: Fish, color: "text-blue-300", rarity: "common", description: "Small oily fish. Popular among cats and beginner fishermen.", skill: "Fishing" },
  "Raw Herring": { icon: Fish, color: "text-blue-400", rarity: "common", description: "Silver-scaled herring. A staple food in coastal villages.", skill: "Fishing" },
  "Raw Trout": { icon: Fish, color: "text-blue-500", rarity: "uncommon", description: "Freshwater trout with spotted skin. Delicious when cooked properly.", skill: "Fishing" },
  "Raw Salmon": { icon: Fish, color: "text-orange-400", rarity: "uncommon", description: "Powerful salmon that swims upstream. Provides excellent nutrition.", skill: "Fishing" },
};

const RARITY_LABEL_COLORS: Record<string, string> = {
  common: "text-zinc-400",
  uncommon: "text-emerald-400",
  rare: "text-blue-400",
  epic: "text-purple-400",
  legendary: "text-yellow-400",
  mythic: "text-red-400",
};

const RARITY_COLORS: Record<string, string> = {
  common: "bg-zinc-900/50 border-transparent",
  uncommon: "bg-zinc-900/50 border-emerald-500",
  rare: "bg-zinc-900/50 border-blue-500",
  epic: "bg-zinc-900/50 border-purple-500",
  legendary: "bg-zinc-900/50 border-yellow-500",
  mythic: "bg-zinc-900/50 border-red-500",
};


function getDurabilityTextColor(durability: number): string {
  if (durability <= 10) return "text-red-400";
  if (durability <= 25) return "text-orange-400";
  if (durability <= 50) return "text-yellow-400";
  return "text-green-400";
}

function getSkillTypeIcon(type: string) {
  switch (type) {
    case "poison": return Drop;
    case "stun": return Lightning;
    case "critical": return Target;
    case "lifesteal_burst": return Skull;
    case "armor_break": return SwordPhosphor;
    case "combo": return Lightning;
    case "slow_crit": return Target;
    default: return Lightning;
  }
}

function getSkillTypeStyles(type: string): { bg: string; text: string } {
  switch (type) {
    case "poison": return { bg: "bg-green-500/20", text: "text-green-400" };
    case "stun": return { bg: "bg-yellow-500/20", text: "text-yellow-400" };
    case "critical": return { bg: "bg-red-500/20", text: "text-red-400" };
    case "lifesteal_burst": return { bg: "bg-pink-500/20", text: "text-pink-400" };
    case "armor_break": return { bg: "bg-orange-500/20", text: "text-orange-400" };
    case "combo": return { bg: "bg-blue-500/20", text: "text-blue-400" };
    case "slow_crit": return { bg: "bg-purple-500/20", text: "text-purple-400" };
    default: return { bg: "bg-gray-500/20", text: "text-gray-400" };
  }
}

export default function InventoryPage() {
  const { isMobile } = useMobile();
  const chatItemShare = useChatItemShare();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { playSfx } = useAudio();
  const { 
    inventory, 
    equipItem, 
    equipment, 
    unequipItem, 
    getEquipmentBonuses, 
    sellItem,
    bulkSellItems,
    usePotion, 
    skills, 
    debugMode,
    equipmentDurability,
    getSlotDurability,
    repairEquipment,
    repairAllEquipment,
    getRepairCost,
    getTotalRepairCost,
    gold,
    getAdjustedVendorPrice,
    inventoryDurability,
    repairInventoryItem,
    getItemDurability,
    activeTask,
    startStudy,
    addToQueue,
    salvageItem,
    getMasteryLevel,
    itemModifications,
    cursedItems
  } = useGame();
  const bonuses = getEquipmentBonuses();
  // selectedItem now tracks inventoryKey (actual key in inventory, may have instance suffix) along with display name and quantity
  const [selectedItem, setSelectedItem] = useState<{ name: string; quantity: number; inventoryKey: string } | null>(null);
  const [sellQuantity, setSellQuantity] = useState(1);
  const [mobileTab, setMobileTab] = useState<"equipment" | "inventory">("inventory");
  const [isMounted, setIsMounted] = useState(false);
  
  // Sorting and filtering state
  type FilterType = "all" | "material" | "equipment" | "food";
  type SortType = "name" | "quantity" | "rarity" | "value" | "vendor_price";
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("name");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showPotionConfirm, setShowPotionConfirm] = useState(false);
  const [showSalvageConfirm, setShowSalvageConfirm] = useState(false);
  const [salvageQuantity, setSalvageQuantity] = useState(1);
  const [openSlot, setOpenSlot] = useState<EquipmentSlot | null>(null);
  const [showRepairAllConfirm, setShowRepairAllConfirm] = useState(false);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showBulkSellConfirm, setShowBulkSellConfirm] = useState(false);

  const handleSwapEquipment = (itemId: string) => {
    equipItem(itemId);
    setOpenSlot(null);
  };

  const handleUnequipFromPopover = (slot: EquipmentSlot) => {
    unequipItem(slot);
    setOpenSlot(null);
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  useEffect(() => {
    setShowPotionConfirm(false);
  }, [selectedItem]);
  const [tooltip, setTooltip] = useState<{ 
    visible: boolean; 
    x: number; 
    y: number; 
    item: any; 
    rarity: string | null;
    slot: EquipmentSlot | null;
  }>({ visible: false, x: 0, y: 0, item: null, rarity: null, slot: null });

  // Helper to get vendor sell price (adjusted for durability on equipment)
  const getSellPrice = (itemName: string): number => {
    const basePrice = getVendorPrice(itemName);
    const baseItem = getBaseItem(itemName);
    if (baseItem?.type === "equipment") {
      return getAdjustedVendorPrice(itemName, basePrice);
    }
    return basePrice;
  };

  // Helper function to get item type (normalize to filter categories)
  const getItemType = (itemName: string): "material" | "equipment" | "food" | "misc" => {
    const baseItem = getBaseItem(itemName);
    if (baseItem) {
      // Normalize item types to filter categories
      if (baseItem.type === "equipment") return "equipment";
      if (baseItem.type === "food") return "food";
      // Treat material, resource, and any other types as material
      return "material";
    }
    const meta = ITEM_METADATA[itemName];
    if (meta) {
      if (meta.skill === "Fishing" || meta.skill === "Cooking") return "food";
      return "material";
    }
    return "material"; // Default to material for unknown items
  };

  // Helper to get rarity order for sorting
  const getRarityOrder = (itemName: string): number => {
    const baseItem = getBaseItem(itemName);
    if (baseItem?.type === "equipment") {
      const { rarity } = parseItemWithRarity(itemName);
      if (rarity === "Mythic") return 5;
      if (rarity === "Legendary") return 4;
      if (rarity === "Rare") return 3;
      if (rarity === "Uncommon") return 2;
      return 1;
    }
    const meta = ITEM_METADATA[itemName];
    if (meta) {
      if (meta.rarity === "legendary") return 4;
      if (meta.rarity === "rare") return 3;
      if (meta.rarity === "uncommon") return 2;
    }
    return 1;
  };

  // Convert inventory object to array and apply search/filter/sort
  const inventoryItems = Object.entries(inventory)
    .filter(([itemName]) => {
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const displayName = translateItemName(itemName, language).toLowerCase();
        const baseId = itemName.split('#')[0].split('::')[0].toLowerCase();
        if (!displayName.includes(query) && !baseId.includes(query)) return false;
      }
      if (filter === "all") return true;
      const type = getItemType(itemName);
      if (filter === "food") return type === "food";
      if (filter === "equipment") return type === "equipment";
      if (filter === "material") return type === "material" || type === "misc";
      return true;
    })
    .sort((a, b) => {
      const [nameA, qtyA] = a;
      const [nameB, qtyB] = b;
      
      switch (sort) {
        case "name":
          return nameA.localeCompare(nameB, 'tr');
        case "quantity":
          return qtyB - qtyA;
        case "rarity":
          return getRarityOrder(nameB) - getRarityOrder(nameA);
        case "value":
          const valueA = getSellPrice(nameA) * qtyA;
          const valueB = getSellPrice(nameB) * qtyB;
          return valueB - valueA;
        case "vendor_price":
          return getSellPrice(nameB) - getSellPrice(nameA);
        default:
          return 0;
      }
    });
  
  const FILTER_LABELS: Record<FilterType, string> = {
    all: t('all'),
    material: t('material'),
    equipment: t('equipment'),
    food: t('food')
  };
  
  const SORT_LABELS: Record<SortType, string> = {
    name: t('name'),
    quantity: t('quantity'),
    rarity: t('rarity'),
    value: t('value'),
    vendor_price: t('vendorPrice'),
  };

  const toggleItemSelection = (itemName: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemName)) {
        next.delete(itemName);
      } else {
        next.add(itemName);
      }
      return next;
    });
  };

  const selectAllItems = () => {
    setSelectedItems(new Set(inventoryItems.map(([name]) => name)));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const toggleBulkMode = () => {
    setBulkSelectMode(prev => !prev);
    setSelectedItems(new Set());
  };

  const getSelectedTotalValue = (): number => {
    let total = 0;
    Array.from(selectedItems).forEach(itemName => {
      const qty = inventory[itemName] || 0;
      total += getSellPrice(itemName) * qty;
    });
    return total;
  };

  const confirmBulkSell = () => {
    if (selectedItems.size === 0) return;
    setShowBulkSellConfirm(true);
  };

  const executeBulkSell = () => {
    const items = Array.from(selectedItems).map(itemName => ({
      itemId: itemName,
      quantity: inventory[itemName] || 0,
    })).filter(i => i.quantity > 0);
    
    if (items.length === 0) return;
    
    const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
    const totalGold = bulkSellItems(items);
    if (totalGold <= 0) {
      toast({
        title: language === 'tr' ? 'Satış Başarısız' : 'Sell Failed',
        description: language === 'tr' ? 'Satış işlemi gerçekleştirilemedi.' : 'Sell operation failed.',
        variant: "destructive",
      });
    } else {
      toast({
        title: t('sellSelected'),
        description: t('bulkSellSuccess').replace('{0}', String(totalQty)).replace('{1}', formatNumber(totalGold)),
      });
    }
    setSelectedItems(new Set());
    setBulkSelectMode(false);
    setShowBulkSellConfirm(false);
  };

  const getInventoryRepairCost = (itemId: string): number => {
    const dur = inventoryDurability[itemId] ?? 100;
    if (dur >= 100) return 0;
    const { rarity: parsedRarity } = parseItemWithRarity(itemId);
    const rarity = parsedRarity || "Common";
    const costPerPointMap: Record<string, number> = { Common: 60, Uncommon: 90, Rare: 150, Epic: 300, Legendary: 900, Mythic: 6000 };
    return Math.ceil((100 - dur) * (costPerPointMap[rarity] || 60));
  };

  const getDamagedInventoryItems = (): string[] => {
    return Object.keys(inventory).filter(itemId => {
      const base = getBaseItem(itemId);
      if (!base || base.type !== "equipment") return false;
      return (inventoryDurability[itemId] ?? 100) < 100;
    });
  };

  const getSelectedDamagedItems = (): string[] => {
    return Array.from(selectedItems).filter(itemId => {
      const base = getBaseItem(itemId);
      if (!base || base.type !== "equipment") return false;
      return (inventoryDurability[itemId] ?? 100) < 100;
    });
  };

  const repairSelectedItems = async () => {
    const damaged = getSelectedDamagedItems();
    let repairedCount = 0;
    for (const itemId of damaged) {
      const result = await repairInventoryItem(itemId);
      if (result.success) repairedCount++;
    }
    if (repairedCount > 0) {
      trackEquipmentRepaired();
      toast({
        title: language === 'tr' ? 'Onarıldı!' : 'Repaired!',
        description: language === 'tr' ? `${repairedCount} item onarıldı.` : `${repairedCount} item(s) repaired.`,
      });
    }
  };

  const repairAllInventoryItems = async () => {
    const damaged = getDamagedInventoryItems();
    let repairedCount = 0;
    for (const itemId of damaged) {
      const result = await repairInventoryItem(itemId);
      if (result.success) repairedCount++;
    }
    if (repairedCount > 0) {
      trackEquipmentRepaired();
      toast({
        title: language === 'tr' ? 'Onarıldı!' : 'Repaired!',
        description: language === 'tr' ? `${repairedCount} envanter itemi onarıldı.` : `${repairedCount} inventory item(s) repaired.`,
      });
    }
  };

  const handleEquipMouseMove = (e: React.MouseEvent, slot: EquipmentSlot) => {
    const itemId = equipment[slot];
    if (!itemId) return;
    const baseItem = getBaseItem(itemId);
    const { rarity } = parseItemWithRarity(itemId);
    const enhancedStats = getItemStatsWithEnhancement(itemId, itemModifications);
    const itemWithEnhancedStats = baseItem ? { ...baseItem, stats: enhancedStats || baseItem?.stats } : baseItem;
    setTooltip({
      visible: true,
      x: e.clientX + 15,
      y: e.clientY + 15,
      item: itemWithEnhancedStats,
      rarity,
      slot
    });
  };

  const handleEquipMouseLeave = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };

  // Check if selected item is equipment (with or without rarity)
  const selectedBaseItem = selectedItem ? getBaseItem(selectedItem.name) : null;
  const isEquipment = selectedBaseItem?.type === "equipment";
  const isPotion = selectedBaseItem?.type === "potion";
  const selectedItemRarity = selectedItem && hasRarity(selectedItem.name) ? parseItemWithRarity(selectedItem.name).rarity : null;
  const selectedMeta = selectedItem ? ITEM_METADATA[selectedItem.name] : null;
  const selectedRarityColor = selectedMeta ? RARITY_LABEL_COLORS[selectedMeta.rarity] : null;
  
  // Check equipment requirements for selected item
  const getSelectedItemRequirement = () => {
    if (!selectedBaseItem?.levelRequired || !isEquipment) return null;
    
    let requiredSkill = selectedBaseItem.skillRequired;
    if (!requiredSkill) {
      requiredSkill = selectedBaseItem.equipSlot === "weapon" ? "attack" : "defence";
    }
    
    const playerLevel = skills[requiredSkill]?.level || 1;
    const meetsRequirement = debugMode || playerLevel >= selectedBaseItem.levelRequired;
    
    return {
      skill: requiredSkill,
      skillName: t(requiredSkill as any) || requiredSkill,
      requiredLevel: selectedBaseItem.levelRequired,
      playerLevel,
      meetsRequirement
    };
  };
  
  const selectedItemRequirement = getSelectedItemRequirement();
  
  // Check mastery requirements for selected weapon item
  const getSelectedItemMasteryRequirement = () => {
    if (!selectedBaseItem || !isEquipment) return null;
    if (selectedBaseItem.equipSlot !== "weapon") return null;
    if (!selectedBaseItem.masteryRequired || selectedBaseItem.masteryRequired <= 1) return null;
    
    const masteryType = mapWeaponCategoryToMasteryType(selectedBaseItem.weaponCategory);
    if (!masteryType) return null;
    
    const playerMasteryLevel = getMasteryLevel(masteryType);
    const meetsRequirement = debugMode || playerMasteryLevel >= selectedBaseItem.masteryRequired;
    
    return {
      masteryType,
      masteryName: MASTERY_TYPE_NAMES[masteryType] || masteryType,
      requiredLevel: selectedBaseItem.masteryRequired,
      playerLevel: playerMasteryLevel,
      meetsRequirement
    };
  };
  
  const selectedItemMasteryRequirement = getSelectedItemMasteryRequirement();


  const getUsedInRecipes = (itemId: string) => {
    const recipes = getRecipes();
    const item = getItemById(itemId);
    const possibleIds = new Set([itemId]);
    if (item) {
      possibleIds.add(item.id);
      possibleIds.add(item.name);
    }
    return recipes.filter(recipe => 
      recipe.materials?.some(mat => possibleIds.has(mat.itemId))
    ).slice(0, 8);
  };
  
  const handleUsePotion = () => {
    if (selectedItem && isPotion) {
      const success = usePotion(selectedItem.name);
      if (success) {
        const newQty = selectedItem.quantity - 1;
        if (newQty <= 0) {
          setSelectedItem(null);
        } else {
          setSelectedItem({ ...selectedItem, quantity: newQty });
        }
      }
      setShowPotionConfirm(false);
    }
  };
  
  const handleEquip = () => {
    if (selectedItem && isEquipment) {
      const success = equipItem(selectedItem.name);
      if (success) {
        playSfx('equipment', 'equip');
        trackItemEquipped();
        setSelectedItem(null);
      }
    }
  };

  const handleSell = (itemName: string, qty: number): ReturnType<typeof sellItem> => {
    const result = sellItem(itemName, qty);
    if (result.gold > 0) playSfx('equipment', 'sell');
    return result;
  };

  const getItemEquipIcon = (slot?: string) => {
    switch (slot) {
      case "weapon": return Sword;
      case "shield": return Shield;
      case "helmet": return HardHat;
      case "body": return Shirt;
      case "legs": return Footprints;
      case "gloves": return Hand;
      case "boots": return Footprints;
      default: return Backpack;
    }
  };

  const renderMobileItemSlot = (itemName: string, quantity: number) => {
    const baseItem = getBaseItem(itemName);
    const isEquipmentItem = baseItem?.type === "equipment";
    const itemHasRarity = hasRarity(itemName);
    
    let meta = ITEM_METADATA[itemName];
    let Icon = Backpack;
    let iconColor = "text-muted-foreground";
    let rarityClass = RARITY_COLORS.common;
    let displayName = itemName;
    
    if (isEquipmentItem) {
      if (itemHasRarity) {
        const { baseId } = parseItemWithRarity(itemName);
        displayName = baseId;
        rarityClass = getItemRarityBgColor(itemName);
        iconColor = getItemRarityColor(itemName);
      } else {
        displayName = itemName;
        rarityClass = "bg-gray-500/20 border-gray-500/30";
        iconColor = "text-gray-400";
      }
      Icon = getItemEquipIcon(baseItem?.equipSlot);
    } else if (meta) {
      Icon = meta.icon;
      iconColor = meta.color;
      rarityClass = RARITY_COLORS[meta.rarity] || RARITY_COLORS.common;
    }

    const getMobileGlowOverlay = () => {
      if (!itemHasRarity) return null;
      const { rarity } = parseItemWithRarity(itemName);
      const glowColors: Record<string, string> = {
        Uncommon: "shadow-[inset_0_0_12px_rgba(52,211,153,0.7)]",
        Rare: "shadow-[inset_0_0_14px_rgba(59,130,246,0.7)]",
        Epic: "shadow-[inset_0_0_16px_rgba(168,85,247,0.75)]",
        Legendary: "shadow-[inset_0_0_18px_rgba(234,179,8,0.8)]",
        Mythic: "shadow-[inset_0_0_20px_rgba(239,68,68,0.85)]",
      };
      return rarity && glowColors[rarity] ? glowColors[rarity] : null;
    };
    const mobileGlowOverlay = getMobileGlowOverlay();

    return (
      <div 
        key={itemName}
        onClick={() => { setSelectedItem({ name: itemName, quantity, inventoryKey: itemName }); setSellQuantity(1); }}
        data-testid={`mobile-item-slot-${itemName.toLowerCase().replace(/\s+/g, '-')}`}
        className={cn(
          "aspect-square rounded-lg flex items-center justify-center relative transition-all select-none cursor-pointer active:scale-95 overflow-hidden",
          `border-2 ${rarityClass} shadow-md`
        )}
      >
        <div className="absolute top-0.5 left-1 text-[11px] font-bold text-white drop-shadow-md z-20 font-mono">
          {formatNumber(quantity)}
        </div>

        <div className="w-[90%] h-[90%] flex items-center justify-center">
          {(() => {
            const itemImg = getItemImage(itemName) || getItemImage(displayName);
            return itemImg ? (
              <RetryImage 
                src={itemImg} 
                alt={itemName} 
                className="w-full h-full object-contain rounded drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]"
              />
            ) : (
              <Icon className={cn("w-[70%] h-[70%] drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]", iconColor)} />
            );
          })()}
        </div>

        {mobileGlowOverlay && (
          <div className={cn("absolute inset-0 rounded-lg pointer-events-none z-10", mobileGlowOverlay)} />
        )}

        {(() => {
          const enhLevel = itemModifications[itemName]?.enhancementLevel || 0;
          if (enhLevel >= 9) return <div className="absolute inset-0 rounded-lg pointer-events-none z-11 shadow-[inset_0_0_18px_rgba(239,68,68,0.8)] animate-pulse" />;
          if (enhLevel >= 7) return <div className="absolute inset-0 rounded-lg pointer-events-none z-11 shadow-[inset_0_0_16px_rgba(6,182,212,0.75)]" />;
          return null;
        })()}

        {cursedItems.includes(itemName) && (
          <div className="absolute inset-0 rounded-lg border-2 border-red-500/80 pointer-events-none z-30">
            <Skull className="absolute top-0.5 right-0.5 w-3.5 h-3.5 text-red-500" weight="fill" />
          </div>
        )}
        {itemModifications[itemName]?.enhancementLevel > 0 && (
          <div className="absolute bottom-0.5 left-1 text-[9px] font-bold text-cyan-400 font-mono z-20">
            +{itemModifications[itemName].enhancementLevel}
          </div>
        )}

        {isEquipmentItem && (
          <div className="absolute bottom-0.5 right-1 text-[9px] font-bold text-yellow-400/90 font-mono z-20">
            EQ
          </div>
        )}
      </div>
    );
  };

  // Mobile Layout
  if (isMobile) {
    return (
      <>
        <div className="flex flex-col pb-24">
          <div className="px-3 py-3 space-y-3">
            {/* Equipment Section - Always visible at top */}
            <EquipmentPanel
              equipment={equipment}
              inventory={inventory}
              equipItem={handleSwapEquipment as any}
              unequipItem={handleUnequipFromPopover}
              bonuses={bonuses}
              getSlotDurability={getSlotDurability}
              itemModifications={itemModifications}
              cursedItems={cursedItems}
              compact
              showBonusSummary
              testIdPrefix="mobile"
            />
            <div className="bg-card/60 rounded-xl p-3 border border-border/30">
              {/* Repair Section - Always visible */}
              {(() => {
                const totalCost = getTotalRepairCost();
                const hasItemsToRepair = totalCost > 0;
                return (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30 relative z-10">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">{t('repair')}:</span>
                      <span className={cn("font-bold", hasItemsToRepair ? "text-yellow-400" : "text-muted-foreground")}>
                        {hasItemsToRepair ? `${formatNumber(totalCost)} ${t('gold')}` : t('notRequired')}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={cn(
                        "h-7 text-xs px-2 rounded-md border font-medium transition-all duration-150 touch-manipulation select-none",
                        hasItemsToRepair && gold >= totalCost
                          ? "bg-yellow-500/10 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/20 active:bg-yellow-500/30 active:scale-95"
                          : "bg-muted/50 border-border/50 text-muted-foreground opacity-50"
                      )}
                      aria-disabled={!hasItemsToRepair || gold < totalCost}
                      onClick={() => {
                        if (hasItemsToRepair && gold >= totalCost) {
                          setShowRepairAllConfirm(true);
                        } else {
                          toast({
                            title: hasItemsToRepair ? t('notEnoughGold') : t('notRequired'),
                            variant: "destructive",
                            duration: 2000,
                          });
                        }
                      }}
                      data-testid="mobile-repair-all-button"
                    >
                      {t('repairAllEquipment')}
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Slot Counter and Filter/Sort Controls */}
            <div className="flex items-center justify-between mb-2">
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                inventoryItems.length >= 24 
                  ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                  : "bg-muted/30 text-muted-foreground border border-border/30"
              )}>
                {inventoryItems.length}/24 {t('inventory')}
              </span>
              <MasteryCompactWidget />
            </div>
            <div className="relative">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchItems')}
                className="w-full pl-9 pr-8 py-2 rounded-lg bg-muted/30 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                data-testid="inventory-search-input"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  data-testid="inventory-search-clear"
                >
                  <XCircle className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {/* Filter Dropdown */}
              <div className="relative flex-1 z-[200]">
                <button
                  onClick={() => { setShowFilterMenu(!showFilterMenu); setShowSortMenu(false); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50 text-sm"
                  data-testid="filter-dropdown"
                >
                  <div className="flex items-center gap-2">
                    <FunnelSimple className="w-4 h-4 text-muted-foreground" weight="bold" />
                    <span>{FILTER_LABELS[filter]}</span>
                  </div>
                  <CaretDown className={cn("w-3 h-3 text-muted-foreground transition-transform", showFilterMenu && "rotate-180")} />
                </button>
                {showFilterMenu && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-[200] overflow-hidden">
                    {(["all", "material", "equipment", "food"] as FilterType[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => { setFilter(f); setShowFilterMenu(false); }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors",
                          filter === f && "bg-primary/10 text-primary"
                        )}
                        data-testid={`filter-option-${f}`}
                      >
                        {FILTER_LABELS[f]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sort Dropdown */}
              <div className="relative flex-1 z-[200]">
                <button
                  onClick={() => { setShowSortMenu(!showSortMenu); setShowFilterMenu(false); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50 text-sm"
                  data-testid="sort-dropdown"
                >
                  <div className="flex items-center gap-2">
                    <SortAscending className="w-4 h-4 text-muted-foreground" weight="bold" />
                    <span>{SORT_LABELS[sort]}</span>
                  </div>
                  <CaretDown className={cn("w-3 h-3 text-muted-foreground transition-transform", showSortMenu && "rotate-180")} />
                </button>
                {showSortMenu && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-[200] overflow-hidden">
                    {(["name", "quantity", "rarity", "value", "vendor_price"] as SortType[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => { setSort(s); setShowSortMenu(false); }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors",
                          sort === s && "bg-primary/10 text-primary"
                        )}
                        data-testid={`sort-option-${s}`}
                      >
                        {SORT_LABELS[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Bulk Select Toggle */}
              <button
                onClick={toggleBulkMode}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm whitespace-nowrap transition-all",
                  bulkSelectMode
                    ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                    : "bg-muted/30 border-border/50 text-muted-foreground"
                )}
                data-testid="mobile-bulk-select-toggle"
              >
                <CheckSquare className="w-4 h-4" weight={bulkSelectMode ? "fill" : "bold"} />
                <span>{t('bulkSelect')}</span>
              </button>
            </div>

            {bulkSelectMode && (
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={selectAllItems}
                  className="flex-1 text-xs"
                  data-testid="mobile-bulk-select-all"
                >
                  {t('selectAll')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearSelection}
                  className="flex-1 text-xs"
                  data-testid="mobile-bulk-clear-selection"
                >
                  {t('clearSelection')}
                </Button>
              </div>
            )}

            {/* Inventory Grid */}
            {inventoryItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Backpack className="w-16 h-16 mb-3 opacity-30" />
                <p className="text-base font-ui">{t('inventoryEmpty')}</p>
                <p className="text-sm">{t('startGathering')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {inventoryItems.map(([itemName, quantity]) => {
                  const baseItem = getBaseItem(itemName);
                  const itemDurability = baseItem?.type === "equipment" ? inventoryDurability[itemName] : undefined;
                  return (
                    <ItemSlot
                      key={itemName}
                      itemName={itemName}
                      quantity={quantity}
                      size="md"
                      selected={bulkSelectMode && selectedItems.has(itemName)}
                      onClick={() => {
                        if (bulkSelectMode) {
                          toggleItemSelection(itemName);
                        } else {
                          setSelectedItem({ name: itemName, quantity, inventoryKey: itemName });
                          setSellQuantity(1);
                        }
                      }}
                      testId={`mobile-item-slot-${itemName.toLowerCase().replace(/\s+/g, '-')}`}
                      durability={itemDurability}
                      overlay={
                        <>
                          {(() => {
                            const enhLevel = itemModifications[itemName]?.enhancementLevel || 0;
                            if (enhLevel >= 9) return <div className="absolute inset-0 rounded-lg pointer-events-none z-11 shadow-[inset_0_0_18px_rgba(239,68,68,0.8)] animate-pulse" />;
                            if (enhLevel >= 7) return <div className="absolute inset-0 rounded-lg pointer-events-none z-11 shadow-[inset_0_0_16px_rgba(6,182,212,0.75)]" />;
                            return null;
                          })()}
                          {cursedItems.includes(itemName) && (
                            <div className="absolute inset-0 rounded-lg border-2 border-red-500/80 pointer-events-none z-30">
                              <Skull className="absolute top-0.5 right-0.5 w-3.5 h-3.5 text-red-500" weight="fill" />
                            </div>
                          )}
                          {bulkSelectMode && selectedItems.has(itemName) && (
                            <div className="absolute inset-0 rounded-lg bg-amber-500/20 border-2 border-amber-400 pointer-events-none z-40 flex items-center justify-center">
                              <Check className="w-5 h-5 text-amber-400 drop-shadow-lg" />
                            </div>
                          )}
                        </>
                      }
                      bottomLeftBadge={
                        itemModifications[itemName]?.enhancementLevel > 0 ? (
                          <span className="text-[9px] font-bold text-cyan-400 font-mono">
                            +{itemModifications[itemName].enhancementLevel}
                          </span>
                        ) : undefined
                      }
                    />
                  );
                })}
                {[...Array(Math.max(0, 16 - inventoryItems.length))].map((_, i) => (
                  <div 
                    key={`empty-${i}`}
                    className="aspect-square rounded-lg bg-[#13161c] border border-dashed border-white/10 flex items-center justify-center"
                  >
                    <span className="text-[10px] text-white/15 font-mono select-none">{t('empty')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Floating Bulk Sell Bar */}
        {bulkSelectMode && selectedItems.size > 0 && (
          <div className="fixed bottom-20 left-0 right-0 z-[9999] px-3" data-testid="mobile-bulk-sell-bar">
            <div className="bg-[#1a1d24] border border-amber-500/40 rounded-xl p-3 shadow-2xl shadow-amber-500/10 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{selectedItems.size} {t('itemsSelected')}</span>
                  <span className="text-sm font-bold text-yellow-400">{t('totalValue')}: {formatNumber(getSelectedTotalValue())} {t('gold')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const damagedSelected = getSelectedDamagedItems();
                    if (damagedSelected.length === 0) return null;
                    const totalRepairCost = damagedSelected.reduce((sum, id) => sum + getInventoryRepairCost(id), 0);
                    return (
                      <Button
                        size="sm"
                        onClick={repairSelectedItems}
                        disabled={gold < totalRepairCost}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs px-3"
                        data-testid="mobile-bulk-repair-button"
                      >
                        <Wrench className="w-3 h-3 mr-1" /> {formatNumber(totalRepairCost)}g
                      </Button>
                    );
                  })()}
                  <Button
                    onClick={confirmBulkSell}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4"
                    data-testid="mobile-bulk-sell-button"
                  >
                    {t('sellSelected')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Item Detail Modal */}
        {isMounted && selectedItem && createPortal(
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => setSelectedItem(null)}
            />
            <div className={cn(
              "relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl animate-in fade-in zoom-in-95 duration-200 shadow-2xl",
              isEquipment && cursedItems.includes(selectedItem.inventoryKey) ? "bg-[#0f1115] border border-red-500/30 shadow-red-500/10" : "bg-[#0f1115] border border-border/40"
            )}>
            <div className={cn(
              "flex items-center justify-between px-3 py-2.5 border-b shrink-0",
              isEquipment && cursedItems.includes(selectedItem.inventoryKey) ? "border-red-500/30" : "border-border/30"
            )}>
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className={cn(
                  "p-1.5 rounded-lg border relative shrink-0",
                  isEquipment && selectedItemRarity ? getItemRarityBgColor(selectedItem.name) 
                  : isEquipment ? "bg-gray-500/20 border-gray-500/30"
                  : selectedMeta ? RARITY_COLORS[selectedMeta.rarity] : "bg-zinc-800/80 border-zinc-700",
                  isEquipment && cursedItems.includes(selectedItem.inventoryKey) && "ring-2 ring-red-500/50"
                )}>
                  {isEquipment && selectedBaseItem ? (
                    (() => {
                      const itemImg = getItemImage(selectedItem.name);
                      if (itemImg) return <RetryImage src={itemImg} alt={selectedItem.name} loading="lazy" className="w-7 h-7 object-contain pixelated" />;
                      const IconComp = getItemEquipIcon(selectedBaseItem.equipSlot);
                      return <IconComp className={cn("w-6 h-6", selectedItemRarity ? getItemRarityColor(selectedItem.name) : "text-gray-400")} />;
                    })()
                  ) : getItemImage(selectedItem.name) ? (
                    <RetryImage src={getItemImage(selectedItem.name)!} alt={selectedItem.name} loading="lazy" className="w-7 h-7 object-contain pixelated" />
                  ) : selectedMeta ? (
                    <selectedMeta.icon className={cn("w-6 h-6", selectedMeta.color)} />
                  ) : (
                    <Backpack className="w-6 h-6 text-muted-foreground" />
                  )}
                  {isEquipment && cursedItems.includes(selectedItem.inventoryKey) && (
                    <div className="absolute -top-1 -right-1 bg-red-900 rounded-full p-0.5">
                      <Skull className="w-2.5 h-2.5 text-red-400" weight="fill" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn("font-bold text-sm leading-tight truncate", isEquipment && selectedItemRarity ? getItemRarityColor(selectedItem.name) : "text-white")}>
                    {isEquipment ? translateItemName(parseItemWithRarity(selectedItem.name).baseId, language) : translateItemName(selectedItem.name, language)}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn("text-[10px]", isEquipment && selectedItemRarity ? getItemRarityColor(selectedItem.name) : selectedMeta ? RARITY_LABEL_COLORS[selectedMeta.rarity] : "text-zinc-400")}>
                      {isEquipment ? (selectedItemRarity || "Common") : (selectedMeta ? t(selectedMeta.rarity as any) : (selectedBaseItem?.type === "food" ? t('food') : t('item')))}
                    </span>
                    {isEquipment && selectedBaseItem && <span className="text-[10px] text-muted-foreground">{t(selectedBaseItem.equipSlot as any)}</span>}
                    <span className="text-[10px] text-muted-foreground">x{formatNumber(selectedItem.quantity)}</span>
                    {isEquipment && selectedItemRequirement && (
                      <span className={cn("text-[10px] font-medium", selectedItemRequirement.meetsRequirement ? "text-emerald-400" : "text-red-400")}>
                        Lv.{selectedItemRequirement.requiredLevel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    if (!selectedItem) return;
                    const enhLevel = itemModifications[selectedItem.inventoryKey]?.enhancementLevel || undefined;
                    const itemNameClean = stripInstanceSuffix(selectedItem.name);
                    chatItemShare.addItem({ itemName: itemNameClean, enhancementLevel: enhLevel });
                    chatItemShare.requestOpenChat();
                    setSelectedItem(null);
                  }}
                  className="p-1.5 rounded-lg bg-muted/30 text-primary/70 hover:text-primary transition-colors"
                  data-testid="mobile-button-share-item"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button onClick={() => setSelectedItem(null)} className="p-1.5 rounded-lg bg-muted/30 text-muted-foreground hover:text-white transition-colors" data-testid="mobile-close-item-modal">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0 mobile-modal-scroll">
              {isEquipment && selectedBaseItem?.stats && (() => {
                const breakdown = getItemStatsBreakdown(selectedItem.name, itemModifications);
                if (!breakdown) return null;
                const { enhanced: stats, enhancementBonus: enhBonus } = breakdown;
                const mods = itemModifications[selectedItem.inventoryKey];
                const enhLevel = mods?.enhancementLevel || 0;
                const statRows: { key: string; label: string; color: string; suffix?: string }[] = [
                  { key: "attackBonus", label: t('attackBonus'), color: "text-red-400" },
                  { key: "strengthBonus", label: t('strengthBonus'), color: "text-orange-400" },
                  { key: "defenceBonus", label: t('defenceBonus'), color: "text-blue-400" },
                  { key: "hitpointsBonus", label: t('hpBonus'), color: "text-pink-400" },
                  { key: "accuracyBonus", label: t('accuracyBonus'), color: "text-green-400" },
                  { key: "critChance", label: "Crit", color: "text-yellow-400", suffix: "%" },
                  { key: "critDamage", label: "CritD", color: "text-yellow-400", suffix: "%" },
                  { key: "skillDamageBonus", label: "SkillD", color: "text-purple-400", suffix: "%" },
                  { key: "attackSpeedBonus", label: "AtkSpd", color: "text-cyan-400", suffix: "%" },
                  { key: "evasionBonus", label: "Evasion", color: "text-emerald-400" },
                  { key: "healingReceivedBonus", label: "HealR", color: "text-emerald-400", suffix: "%" },
                  { key: "onHitHealingPercent", label: "OnHitH", color: "text-emerald-400", suffix: "%" },
                ];
                const activeStats = statRows.filter(({ key }) => { const val = (stats as any)[key]; return val && val !== 0; });
                if (activeStats.length === 0) return null;
                return (
                  <div className="pt-2 border-t border-border/20">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{t('stats')}</span>
                      {enhLevel > 0 && <span className="text-[10px] text-amber-400/70">+{enhLevel * 5}%</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                      {activeStats.map(({ key, label, color, suffix }) => {
                        const val = (stats as any)[key];
                        const bonus = enhBonus[key] || 0;
                        const baseVal = val - bonus;
                        return (
                          <div key={key} className="flex justify-between">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="flex items-center gap-0.5">
                              <span className={cn(color, "font-bold")}>{baseVal > 0 ? '+' : ''}{baseVal}{suffix || ''}</span>
                              {bonus > 0 && <span className="text-amber-400 text-[10px]">+{bonus}</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {mods && (mods.addedSkills || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-border/20">
                        {mods.addedSkills.map((skill: string, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/25 capitalize">{skill.replace(/_/g, ' ')}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {isEquipment && selectedBaseItem?.weaponSkills?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1.5 px-0.5">
                  {selectedBaseItem.weaponSkills.map((skill: any, idx: number) => (
                    <SkillDetailPopup key={idx} skill={skill} variant="badge" />
                  ))}
                </div>
              )}

              {isEquipment && selectedBaseItem && <RoleStatsDisplay item={selectedBaseItem} variant="grid" />}

              {isEquipment && (() => {
                const durability = getItemDurability(selectedItem.inventoryKey);
                if (durability >= 100) return null;
                return (
                  <div className="flex items-center gap-2 pt-1.5">
                    <div className="flex-1"><DurabilityBar durability={durability} size="sm" showLabel /></div>
                  </div>
                );
              })()}

              {isEquipment && selectedBaseItem && (() => {
                if (!selectedBaseItem?.equipSlot) return null;
                const equippedItemId = equipment[selectedBaseItem.equipSlot as keyof typeof equipment];
                if (equippedItemId === selectedItem.name) return null;
                const inspectedStats = getItemStatsWithEnhancement(selectedItem.name, itemModifications);
                if (!inspectedStats) return null;
                const statKeys: { key: string; label: string }[] = [
                  { key: "attackBonus", label: "attack" }, { key: "strengthBonus", label: "strength" }, { key: "defenceBonus", label: "defence" },
                  { key: "hitpointsBonus", label: "hitpoints" }, { key: "accuracyBonus", label: "accuracy" }, { key: "skillDamageBonus", label: "skill_damage" },
                  { key: "attackSpeedBonus", label: "attack_speed" }, { key: "healingReceivedBonus", label: "healing_received" }, { key: "onHitHealingPercent", label: "on_hit_healing" },
                  { key: "buffDurationBonus", label: "buff_duration" }, { key: "partyDpsBuff", label: "party_dps" }, { key: "partyDefenceBuff", label: "party_defence" },
                  { key: "partyAttackSpeedBuff", label: "party_speed" }, { key: "lootChanceBonus", label: "loot_chance" },
                ];
                if (!equippedItemId) {
                  const gains = statKeys.map(({ key, label }) => ({ label, value: (inspectedStats as any)[key] || 0 })).filter(({ value }) => value !== 0);
                  const weaponGains: { label: string; value: string }[] = [];
                  if (selectedBaseItem.equipSlot === "weapon") {
                    if (selectedBaseItem.attackSpeedMs) weaponGains.push({ label: t('attackSpeed'), value: `${(selectedBaseItem.attackSpeedMs / 1000).toFixed(1)}s` });
                    if (selectedBaseItem.lifestealPercent && selectedBaseItem.lifestealPercent > 0) weaponGains.push({ label: t('lifesteal'), value: `${selectedBaseItem.lifestealPercent}%` });
                  }
                  if (gains.length === 0 && weaponGains.length === 0) return null;
                  return (
                    <div className="pt-2 mt-1 border-t border-amber-500/20" data-testid="mobile-item-comparison-panel">
                      <div className="text-[10px] text-amber-400 font-medium uppercase tracking-wider mb-1">{t('comparedToEquipped')}</div>
                      <div className="text-[10px] text-muted-foreground italic mb-1">{t('noItemEquipped')}</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                        {gains.map(({ label, value }) => (<div key={label} className="flex items-center justify-between"><span className="text-muted-foreground">{t(label as any)}</span><span className="text-emerald-400 font-bold">+{value}</span></div>))}
                        {weaponGains.map(({ label, value }) => (<div key={label} className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><span className="text-emerald-400 font-bold">{value}</span></div>))}
                      </div>
                    </div>
                  );
                }
                const equippedStats = getItemStatsWithEnhancement(equippedItemId, itemModifications) || {};
                const equippedBase = getBaseItem(equippedItemId);
                const equippedName = translateItemName(parseItemWithRarity(equippedItemId).baseId, language);
                const equippedImg = getItemImage(equippedItemId);
                const diffs = statKeys.map(({ key, label }) => ({ label, diff: ((inspectedStats as any)[key] || 0) - ((equippedStats as any)[key] || 0) })).filter(({ diff }) => diff !== 0);
                const weaponDiffs: { label: string; diff: number; display: string }[] = [];
                if (selectedBaseItem.equipSlot === "weapon" && equippedBase) {
                  const diffMs = (selectedBaseItem.attackSpeedMs || 0) - (equippedBase.attackSpeedMs || 0);
                  if (diffMs !== 0) weaponDiffs.push({ label: t('attackSpeed'), diff: -diffMs, display: `${(Math.abs(diffMs) / 1000).toFixed(1)}s` });
                  const diffLs = (selectedBaseItem.lifestealPercent || 0) - (equippedBase.lifestealPercent || 0);
                  if (diffLs !== 0) weaponDiffs.push({ label: t('lifesteal'), diff: diffLs, display: `${Math.abs(diffLs)}%` });
                }
                return (
                  <div className="pt-2 mt-1 border-t border-amber-500/20" data-testid="mobile-item-comparison-panel">
                    <div className="text-[10px] text-amber-400 font-medium uppercase tracking-wider mb-1">{t('comparedToEquipped')}</div>
                    <div className="flex items-center gap-1.5 mb-1">
                      {equippedImg && <RetryImage src={equippedImg} alt={equippedName} className="w-4 h-4 object-contain pixelated" spinnerClassName="w-2 h-2" />}
                      <span className={cn("text-[10px] font-medium truncate", hasRarity(equippedItemId) ? getItemRarityColor(equippedItemId) : "text-white")}>{equippedName}</span>
                    </div>
                    {diffs.length > 0 || weaponDiffs.length > 0 ? (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                        {diffs.map(({ label, diff }) => (<div key={label} className="flex items-center justify-between"><span className="text-muted-foreground">{t(label as any)}</span><span className={cn("font-bold flex items-center gap-0.5", diff > 0 ? "text-emerald-400" : "text-red-400")}>{diff > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}{diff > 0 ? `+${diff}` : diff}</span></div>))}
                        {weaponDiffs.map(({ label, diff, display }) => (<div key={label} className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><span className={cn("font-bold flex items-center gap-0.5", diff > 0 ? "text-emerald-400" : "text-red-400")}>{diff > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}{diff > 0 ? "+" : "-"}{display}</span></div>))}
                      </div>
                    ) : (<div className="text-[10px] text-muted-foreground">{t('noStatDifference')}</div>)}
                  </div>
                );
              })()}

              {!isEquipment && (
                <p className="text-muted-foreground text-xs leading-relaxed px-1 pt-1">
                  {selectedBaseItem ? translateItemDescription(selectedBaseItem.name || selectedBaseItem.id, language) : t('anInventoryItem')}
                </p>
              )}

              {!isEquipment && (() => {
                const foodHeal = getFoodHealAmount(selectedItem.name);
                if (foodHeal <= 0) return null;
                return (
                  <div className="flex items-center gap-1.5 px-1 pt-1">
                    <span className="text-xs text-green-400 font-medium">{t('healsHp')} +{foodHeal} {t('hp')}</span>
                  </div>
                );
              })()}

              {(() => {
                const usedInRecipes = getUsedInRecipes(selectedItem.name);
                if (usedInRecipes.length === 0) return null;
                return (
                  <div className="pt-2 mt-1 border-t border-border/20">
                    <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">{language === 'tr' ? 'Tarifler' : 'Recipes'}</div>
                    <div className="flex flex-wrap gap-1">
                      {usedInRecipes.map((recipe) => {
                        const resultImg = getItemImage(recipe.resultItemId);
                        return (
                          <div key={recipe.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/20 border border-border/10">
                            <div className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                              {resultImg ? <RetryImage src={resultImg} alt="" className="w-full h-full object-contain pixelated" /> : <Hammer className="w-3 h-3 text-muted-foreground" weight="bold" />}
                            </div>
                            <span className="text-[10px] text-white truncate max-w-[100px]">{translateItemName(recipe.resultItemId, language)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {isPotion && selectedBaseItem?.effect && selectedBaseItem?.duration && (
                <div className="pt-2 mt-1 border-t border-violet-500/20">
                  <div className="text-xs text-violet-300 mb-1 font-medium">{t('effect')}</div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {selectedBaseItem.effect.type === "attack_boost" && t('attackBonus2')}
                      {selectedBaseItem.effect.type === "strength_boost" && t('strengthBonus2')}
                      {selectedBaseItem.effect.type === "defence_boost" && t('defenceBonus2')}
                      {selectedBaseItem.effect.type === "hp_regen" && t('hpRegen')}
                      {selectedBaseItem.effect.type === "poison_immunity" && t('poisonImmunity')}
                      {selectedBaseItem.effect.type === "crit_chance" && t('critChance')}
                      {selectedBaseItem.effect.type === "damage_reduction" && t('damageReduction')}
                      {selectedBaseItem.effect.type === "xp_boost" && t('xpBonus')}
                    </span>
                    <span className="text-violet-400 font-bold">+{selectedBaseItem.effect.value}%</span>
                  </div>
                  <div className="flex justify-between text-xs mt-0.5">
                    <span className="text-muted-foreground">{t('duration')}</span>
                    <span className="text-violet-400">{Math.floor(selectedBaseItem.duration / 60)} {t('minutes')}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="px-3 py-2.5 border-t border-border/30 bg-[#0c0e12] rounded-b-2xl" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom, 0px))' }}>
              {isPotion && !showPotionConfirm && (
                <div className="flex items-center gap-2 mb-1.5">
                  <Button onClick={() => setShowPotionConfirm(true)} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm h-9" data-testid="mobile-button-use-potion">{t('use')}</Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 px-3" data-testid="mobile-button-actions-potion"><MoreHorizontal className="w-4 h-4" /></Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 p-3 z-[10002]" data-testid="mobile-actions-popover-potion">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Slider value={[sellQuantity]} onValueChange={([val]) => setSellQuantity(val)} min={1} max={selectedItem.quantity} step={1} className="flex-1" data-testid="mobile-slider-sell-quantity" />
                        <span className="text-xs font-mono text-white min-w-[24px] text-right">{sellQuantity}</span>
                        <Button variant="outline" size="sm" onClick={() => setSellQuantity(selectedItem.quantity)} className="text-[10px] h-6 px-1.5">{t('max')}</Button>
                      </div>
                      <Button
                        onClick={() => {
                          const actualQty = Math.min(sellQuantity, inventory[selectedItem.name] || 0);
                          if (actualQty <= 0) return;
                          const result = handleSell(selectedItem.name, actualQty);
                          if (result.gold <= 0) return;
                          toast({ title: language === 'tr' ? 'Satıldı!' : 'Sold!', description: `${result.soldQty}x → ${formatNumber(result.gold)} ${language === 'tr' ? 'altın' : 'gold'}` });
                          const remainingQty = selectedItem.quantity - result.soldQty;
                          if (remainingQty <= 0) { setSelectedItem(null); } else { setSelectedItem({ ...selectedItem, quantity: remainingQty }); setSellQuantity(Math.min(sellQuantity, remainingQty)); }
                        }}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8"
                        data-testid="mobile-button-sell"
                      >
                        {t('sell')} ({formatNumber(getSellPrice(selectedItem.name) * sellQuantity)} {t('gold')})
                      </Button>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              {isPotion && showPotionConfirm && (
                <div className="space-y-1.5 mb-1.5">
                  <div className="text-center text-xs text-violet-300 font-medium">{selectedBaseItem?.name} {t('confirmUse')}</div>
                  <div className="flex gap-2">
                    <Button onClick={handleUsePotion} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm h-9" data-testid="mobile-button-confirm-potion">{t('yesUse')}</Button>
                    <Button onClick={() => setShowPotionConfirm(false)} variant="outline" className="flex-1 text-sm h-9" data-testid="mobile-button-cancel-potion">{t('cancel')}</Button>
                  </div>
                </div>
              )}
              {isEquipment && (
                <div className="flex items-center gap-2">
                  <Button onClick={handleEquip} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-bold text-sm h-9" data-testid="mobile-button-equip">{t('equip')}</Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 px-3" data-testid="mobile-button-actions-equip"><MoreHorizontal className="w-4 h-4" /></Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-3 space-y-3 z-[10002]" data-testid="mobile-actions-popover-equip">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Slider value={[sellQuantity]} onValueChange={([val]) => setSellQuantity(val)} min={1} max={selectedItem.quantity} step={1} className="flex-1" data-testid="mobile-slider-sell-quantity" />
                          <span className="text-xs font-mono text-white min-w-[24px] text-right">{sellQuantity}</span>
                          <Button variant="outline" size="sm" onClick={() => setSellQuantity(selectedItem.quantity)} className="text-[10px] h-6 px-1.5">{t('max')}</Button>
                        </div>
                        <Button
                          onClick={() => {
                            const actualQty = Math.min(sellQuantity, inventory[selectedItem.name] || 0);
                            if (actualQty <= 0) return;
                            const result = handleSell(selectedItem.name, actualQty);
                            if (result.gold <= 0) return;
                            toast({ title: language === 'tr' ? 'Satıldı!' : 'Sold!', description: `${result.soldQty}x → ${formatNumber(result.gold)} ${language === 'tr' ? 'altın' : 'gold'}` });
                            const remainingQty = selectedItem.quantity - result.soldQty;
                            if (remainingQty <= 0) { setSelectedItem(null); } else { setSelectedItem({ ...selectedItem, quantity: remainingQty }); setSellQuantity(Math.min(sellQuantity, remainingQty)); }
                          }}
                          className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8"
                          data-testid="mobile-button-sell"
                        >
                          {t('sell')} ({formatNumber(getSellPrice(selectedItem.name) * sellQuantity)} {t('gold')})
                        </Button>
                      </div>
                      {(() => {
                        const salvageInfo = getSalvageInfo(selectedItem.name);
                        if (!salvageInfo) return null;
                        return (
                          <div className="border-t border-border/20 pt-2">
                            <div className="flex items-center justify-between text-[10px] mb-1">
                              <span className="text-orange-400 font-medium uppercase tracking-wider">{t('salvage')}</span>
                              <span className="text-orange-400">{salvageInfo.scrapAmount.min}-{salvageInfo.scrapAmount.max} {t('scrap')}</span>
                            </div>
                            {!showSalvageConfirm ? (
                              <>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Slider value={[salvageQuantity]} onValueChange={([val]) => setSalvageQuantity(val)} min={1} max={selectedItem.quantity} step={1} className="flex-1" data-testid="mobile-slider-salvage-quantity" />
                                  <span className="text-[10px] font-mono text-white min-w-[24px] text-right">{salvageQuantity}</span>
                                </div>
                                <Button onClick={() => setShowSalvageConfirm(true)} size="sm" className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs h-8" data-testid="mobile-button-salvage">
                                  {t('salvage')} x{salvageQuantity}
                                </Button>
                              </>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="text-center text-[10px] text-orange-300">{salvageQuantity}x {translateItemName(parseItemWithRarity(selectedItem.name).baseId, language)} {t('confirmSalvage') || '?'}</div>
                                <div className="flex gap-1.5">
                                  <Button onClick={() => { const result = salvageItem(selectedItem.name, salvageQuantity); if (result.success) { trackItemSalvaged(); const newQty = selectedItem.quantity - salvageQuantity; if (newQty <= 0) { setSelectedItem(null); } else { setSelectedItem({ ...selectedItem, quantity: newQty }); setSalvageQuantity(Math.min(salvageQuantity, newQty)); } } setShowSalvageConfirm(false); }} size="sm" className="flex-1 bg-orange-600 hover:bg-orange-700 text-white text-xs h-7" data-testid="mobile-button-confirm-salvage">{t('yes')}</Button>
                                  <Button onClick={() => setShowSalvageConfirm(false)} variant="outline" size="sm" className="flex-1 text-xs h-7" data-testid="mobile-button-cancel-salvage">{t('cancel')}</Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {(() => {
                        const studyInfo = getStudyInfo(selectedItem.name);
                        if (!studyInfo) return null;
                        const isStudying = activeTask?.skillId === "studying" && activeTask?.name === selectedItem.name;
                        return (
                          <div className="border-t border-border/20 pt-2">
                            <Button onClick={async () => { await addToQueue({ type: 'study', studyItemId: selectedItem.name, name: selectedItem.name, durationMs: STUDY_DURATION, xpReward: studyInfo.studyXp }); trackItemStudied(); setSelectedItem(null); }} disabled={isStudying} size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-8" data-testid="mobile-button-study">
                              {isStudying ? t('studying') : t('study')} (+{studyInfo.studyXp.toFixed(0)} XP)
                            </Button>
                          </div>
                        );
                      })()}
                      {(() => {
                        const durability = getItemDurability(selectedItem.inventoryKey);
                        if (durability >= 100) return null;
                        const repairCost = getInventoryRepairCost(selectedItem.inventoryKey);
                        const canAfford = gold >= repairCost;
                        return (
                          <div className="border-t border-border/20 pt-2">
                            <Button
                              onClick={async () => { const result = await repairInventoryItem(selectedItem.inventoryKey); if (result.success) { trackEquipmentRepaired(); setSelectedItem(null); } }}
                              disabled={!canAfford}
                              size="sm"
                              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs h-8"
                              data-testid="mobile-button-repair"
                            >
                              <Wrench className="w-3 h-3 mr-1" /> {t('repair')} ({formatNumber(repairCost)} {t('gold')})
                            </Button>
                          </div>
                        );
                      })()}
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              {!isEquipment && !isPotion && (
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-9 text-sm" data-testid="mobile-button-actions-generic"><MoreHorizontal className="w-4 h-4 mr-1.5" /> {language === 'tr' ? 'İşlemler' : 'Actions'}</Button>
                    </PopoverTrigger>
                    <PopoverContent align="center" className="w-64 p-3 z-[10002]" data-testid="mobile-actions-popover-generic">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Slider value={[sellQuantity]} onValueChange={([val]) => setSellQuantity(val)} min={1} max={selectedItem.quantity} step={1} className="flex-1" data-testid="mobile-slider-sell-quantity" />
                        <span className="text-xs font-mono text-white min-w-[24px] text-right">{sellQuantity}</span>
                        <Button variant="outline" size="sm" onClick={() => setSellQuantity(selectedItem.quantity)} className="text-[10px] h-6 px-1.5">{t('max')}</Button>
                      </div>
                      <Button
                        onClick={() => {
                          const actualQty = Math.min(sellQuantity, inventory[selectedItem.name] || 0);
                          if (actualQty <= 0) return;
                          const result = handleSell(selectedItem.name, actualQty);
                          if (result.gold <= 0) return;
                          toast({ title: language === 'tr' ? 'Satıldı!' : 'Sold!', description: `${result.soldQty}x → ${formatNumber(result.gold)} ${language === 'tr' ? 'altın' : 'gold'}` });
                          const remainingQty = selectedItem.quantity - result.soldQty;
                          if (remainingQty <= 0) { setSelectedItem(null); } else { setSelectedItem({ ...selectedItem, quantity: remainingQty }); setSellQuantity(Math.min(sellQuantity, remainingQty)); }
                        }}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8"
                        data-testid="mobile-button-sell"
                      >
                        {t('sell')} ({formatNumber(getSellPrice(selectedItem.name) * sellQuantity)} {t('gold')})
                      </Button>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
            </div>
          </div>,
          document.body
        )}

        {/* Bulk Sell Confirmation Dialog */}
        <AlertDialog open={showBulkSellConfirm} onOpenChange={setShowBulkSellConfirm}>
          <AlertDialogContent className="border-amber-500/50 bg-card">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-amber-400">
                {t('confirmBulkSell')}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-foreground/80">
                  <div className="mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t('itemsSelected').replace('{0}', String(selectedItems.size))}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-muted-foreground">{t('totalValue')}:</span>
                      <span className="text-yellow-400 font-bold text-lg">{formatNumber(getSelectedTotalValue())} {t('gold')}</span>
                    </div>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-bulk-sell">
                {t('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={(e) => { e.preventDefault(); executeBulkSell(); }}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                data-testid="button-confirm-bulk-sell"
              >
                {t('sellSelected')} ({formatNumber(getSelectedTotalValue())} {t('gold')})
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Repair All Confirmation Dialog - Mobile */}
        <AlertDialog open={showRepairAllConfirm} onOpenChange={setShowRepairAllConfirm}>
          <AlertDialogContent className="border-yellow-500/50 bg-card">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-yellow-400">
                <ArrowsClockwise className="w-6 h-6" weight="fill" />
                {t('repairAllEquipment')}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-foreground/80">
                {t('allDamagedWillBeRepaired')}
                <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('totalCost')}:</span>
                    <span className="text-yellow-400 font-bold text-lg">{formatNumber(getTotalRepairCost())} {t('gold')}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-muted-foreground">{t('currentGold')}:</span>
                    <span className="text-green-400 font-bold">{formatNumber(gold)} {t('gold')}</span>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-repair-all-mobile">
                {t('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    const result = await repairAllEquipment();
                    if (result.success) {
                      toast({
                        title: t('repairSuccess'),
                        description: t('allEquipmentRepaired'),
                        duration: 3000,
                      });
                    } else if (result.error) {
                      toast({
                        title: t('repairFailed'),
                        description: result.error,
                        variant: "destructive",
                        duration: 3000,
                      });
                    }
                  } catch (err) {
                    console.error("Repair all error:", err);
                    toast({
                      title: t('repairFailed'),
                      description: t('serverError'),
                      variant: "destructive",
                      duration: 3000,
                    });
                  }
                  setShowRepairAllConfirm(false);
                }}
                className="bg-yellow-500 hover:bg-yellow-600 text-black"
                data-testid="button-confirm-repair-all-mobile"
              >
                {t('repair')} ({formatNumber(getTotalRepairCost())} {t('gold')})
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Desktop Layout - 2 column: inventory grid + fixed detail panel
  return (
    <>
      <div className="h-[calc(100vh-8rem)] flex gap-4 p-4">
        {/* Left Column - Equipment & Inventory */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Equipment Panel */}
          <EquipmentPanel
            equipment={equipment}
            inventory={inventory}
            equipItem={handleSwapEquipment as any}
            unequipItem={handleUnequipFromPopover}
            bonuses={bonuses}
            getSlotDurability={getSlotDurability}
            itemModifications={itemModifications}
            cursedItems={cursedItems}
            compact={false}
            showBonusSummary
            showMasteryWidget
            testIdPrefix="equipment"
          />
          <Card className="bg-card/80 backdrop-blur-sm border-border shadow-lg">
            <CardContent className="pt-4">
              {/* Repair Section - Desktop */}
              {(() => {
                const totalCost = getTotalRepairCost();
                const hasItemsToRepair = totalCost > 0;
                if (!hasItemsToRepair) return null;
                return (
                  <>
                    <Separator className="my-4" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{t('repairFee')}:</span>
                        <span className="text-yellow-400 font-bold">{formatNumber(totalCost)} {t('gold')}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="px-4"
                        onClick={() => setShowRepairAllConfirm(true)}
                        disabled={gold < totalCost}
                        data-testid="desktop-repair-all-button"
                      >
                        {t('repairAllEquipment')}
                      </Button>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* Inventory Grid */}
          <Card className="bg-[#0f1115] border-border/40 shadow-xl">
            <CardHeader className="border-b border-border/20 bg-[#15181e] py-3">
              <CardTitle className="flex items-center gap-3 text-lg font-display">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Backpack className="w-5 h-5 text-amber-400" />
                </div>
                {t('inventory')}
                <span className={cn(
                  "text-xs font-normal px-2 py-0.5 rounded-full",
                  inventoryItems.length >= 24 
                    ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                    : "bg-muted/30 text-muted-foreground"
                )}>
                  {inventoryItems.length}/24
                </span>
                
                {/* Desktop Search, Filter and Sort Controls */}
                <div className="ml-auto flex gap-2 items-center">
                  <div className="relative">
                    <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('searchItems')}
                      className="w-40 pl-8 pr-7 py-1.5 rounded-lg bg-muted/30 border border-border/50 text-sm font-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      data-testid="desktop-inventory-search-input"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        data-testid="desktop-inventory-search-clear"
                      >
                        <XCircle className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    )}
                  </div>
                  {/* Filter Dropdown */}
                  <div className="relative z-[200]">
                    <button
                      onClick={() => { setShowFilterMenu(!showFilterMenu); setShowSortMenu(false); }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/50 text-sm font-normal"
                      data-testid="desktop-filter-dropdown"
                    >
                      <FunnelSimple className="w-4 h-4 text-muted-foreground" weight="bold" />
                      <span>{FILTER_LABELS[filter]}</span>
                      <CaretDown className={cn("w-3 h-3 text-muted-foreground transition-transform", showFilterMenu && "rotate-180")} />
                    </button>
                    {showFilterMenu && (
                      <div className="absolute top-full right-0 mt-1 min-w-[120px] bg-card border border-border rounded-lg shadow-lg z-[200] overflow-hidden">
                        {(["all", "material", "equipment", "food"] as FilterType[]).map((f) => (
                          <button
                            key={f}
                            onClick={() => { setFilter(f); setShowFilterMenu(false); }}
                            className={cn(
                              "w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors",
                              filter === f && "bg-primary/10 text-primary"
                            )}
                            data-testid={`desktop-filter-option-${f}`}
                          >
                            {FILTER_LABELS[f]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Sort Dropdown */}
                  <div className="relative z-[200]">
                    <button
                      onClick={() => { setShowSortMenu(!showSortMenu); setShowFilterMenu(false); }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/50 text-sm font-normal"
                      data-testid="desktop-sort-dropdown"
                    >
                      <SortAscending className="w-4 h-4 text-muted-foreground" weight="bold" />
                      <span>{SORT_LABELS[sort]}</span>
                      <CaretDown className={cn("w-3 h-3 text-muted-foreground transition-transform", showSortMenu && "rotate-180")} />
                    </button>
                    {showSortMenu && (
                      <div className="absolute top-full right-0 mt-1 min-w-[120px] bg-card border border-border rounded-lg shadow-lg z-[200] overflow-hidden">
                        {(["name", "quantity", "rarity", "value", "vendor_price"] as SortType[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => { setSort(s); setShowSortMenu(false); }}
                            className={cn(
                              "w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors",
                              sort === s && "bg-primary/10 text-primary"
                            )}
                            data-testid={`desktop-sort-option-${s}`}
                          >
                            {SORT_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bulk Select Toggle */}
                  <button
                    onClick={toggleBulkMode}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-normal whitespace-nowrap transition-all",
                      bulkSelectMode
                        ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                        : "bg-muted/30 border-border/50 text-muted-foreground"
                    )}
                    data-testid="desktop-bulk-select-toggle"
                  >
                    <CheckSquare className="w-4 h-4" weight={bulkSelectMode ? "fill" : "bold"} />
                    <span>{t('bulkSelect')}</span>
                  </button>
                </div>
              </CardTitle>
              {bulkSelectMode && (
                <div className="flex items-center gap-2 mt-2 px-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={selectAllItems}
                    className="text-xs"
                    data-testid="desktop-bulk-select-all"
                  >
                    {t('selectAll')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearSelection}
                    className="text-xs"
                    data-testid="desktop-bulk-clear-selection"
                  >
                    {t('clearSelection')}
                  </Button>
                  {selectedItems.size > 0 && (
                    <div className="ml-auto flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{selectedItems.size} {t('itemsSelected')}</span>
                      <span className="text-sm font-bold text-yellow-400">{formatNumber(getSelectedTotalValue())} {t('gold')}</span>
                      {(() => {
                        const damagedSelected = getSelectedDamagedItems();
                        if (damagedSelected.length === 0) return null;
                        const totalRepairCost = damagedSelected.reduce((sum, id) => sum + getInventoryRepairCost(id), 0);
                        return (
                          <Button
                            size="sm"
                            onClick={repairSelectedItems}
                            disabled={gold < totalRepairCost}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold"
                            data-testid="desktop-bulk-repair-button"
                          >
                            <Wrench className="w-3.5 h-3.5 mr-1" /> {t('repair')} ({formatNumber(totalRepairCost)} {t('gold')})
                          </Button>
                        );
                      })()}
                      <Button
                        size="sm"
                        onClick={confirmBulkSell}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
                        data-testid="desktop-bulk-sell-button"
                      >
                        {t('sellSelected')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {!bulkSelectMode && (() => {
                const damagedInv = getDamagedInventoryItems();
                if (damagedInv.length === 0) return null;
                const totalCost = damagedInv.reduce((sum, id) => sum + getInventoryRepairCost(id), 0);
                return (
                  <div className="flex items-center justify-end gap-2 mt-2 px-2">
                    <span className="text-xs text-muted-foreground">{damagedInv.length} {language === 'tr' ? 'hasarlı item' : 'damaged'}</span>
                    <Button
                      size="sm"
                      onClick={repairAllInventoryItems}
                      disabled={gold < totalCost}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs"
                      data-testid="desktop-repair-inventory-button"
                    >
                      <Wrench className="w-3 h-3 mr-1" /> {language === 'tr' ? 'Envanteri Onar' : 'Repair Inventory'} ({formatNumber(totalCost)} {t('gold')})
                    </Button>
                  </div>
                );
              })()}
            </CardHeader>
            <CardContent className="p-4 bg-[#0f1115]">
              {inventoryItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <Backpack className="w-16 h-16 mb-4 opacity-30" />
                  <p className="text-lg font-ui">{t('inventoryEmpty')}</p>
                  <p className="text-sm">{t('startGathering')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-6 md:grid-cols-8 gap-4">
                  {inventoryItems.map(([itemName, quantity]) => {
                    const baseItem = getBaseItem(itemName);
                    const itemDurability = baseItem?.type === "equipment" ? inventoryDurability[itemName] : undefined;
                    return (
                      <ItemSlot
                        key={itemName}
                        itemName={itemName}
                        quantity={quantity}
                        size="md"
                        selected={bulkSelectMode ? selectedItems.has(itemName) : selectedItem?.inventoryKey === itemName}
                        onClick={() => {
                          if (bulkSelectMode) {
                            toggleItemSelection(itemName);
                          } else {
                            setSelectedItem({ name: itemName, quantity, inventoryKey: itemName });
                            setSellQuantity(1);
                          }
                        }}
                        testId={`item-slot-${itemName.toLowerCase().replace(/\s+/g, '-')}`}
                        durability={itemDurability}
                        overlay={
                          <>
                            {(() => {
                              const enhLevel = itemModifications[itemName]?.enhancementLevel || 0;
                              if (enhLevel >= 9) return <div className="absolute inset-0 rounded-lg pointer-events-none z-11 shadow-[inset_0_0_18px_rgba(239,68,68,0.8)] animate-pulse" />;
                              if (enhLevel >= 7) return <div className="absolute inset-0 rounded-lg pointer-events-none z-11 shadow-[inset_0_0_16px_rgba(6,182,212,0.75)]" />;
                              return null;
                            })()}
                            {cursedItems.includes(itemName) && (
                              <div className="absolute inset-0 rounded-lg border-2 border-red-500/80 pointer-events-none z-30">
                                <Skull className="absolute top-0.5 right-0.5 w-3.5 h-3.5 text-red-500" weight="fill" />
                              </div>
                            )}
                            {bulkSelectMode && selectedItems.has(itemName) && (
                              <div className="absolute inset-0 rounded-lg bg-amber-500/20 border-2 border-amber-400 pointer-events-none z-40 flex items-center justify-center">
                                <Check className="w-5 h-5 text-amber-400 drop-shadow-lg" />
                              </div>
                            )}
                          </>
                        }
                        bottomLeftBadge={
                          itemModifications[itemName]?.enhancementLevel > 0 ? (
                            <span className="text-[9px] font-bold text-cyan-400 font-mono">
                              +{itemModifications[itemName].enhancementLevel}
                            </span>
                          ) : undefined
                        }
                      />
                    );
                  })}
                  
                  {[...Array(Math.max(0, 24 - inventoryItems.length))].map((_, i) => (
                    <div 
                      key={`empty-${i}`}
                      className="aspect-square rounded-lg bg-[#13161c] border border-dashed border-white/5 flex items-center justify-center"
                    >
                      <span className="text-[10px] text-white/10 font-mono select-none">{t('empty')}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Fixed Item Detail Panel */}
        <div className="w-80 flex-shrink-0">
          <Card className="bg-[#0f1115] border-border/40 shadow-xl h-full">
            <CardHeader className="border-b border-border/20 bg-[#15181e] py-3">
              <CardTitle className="flex items-center gap-3 text-lg font-display">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <ShieldStar className="w-5 h-5 text-cyan-400" weight="bold" />
                </div>
                {t('itemDetail')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 14rem)" }}>
              {selectedItem ? (
                <>
                  {isEquipment && selectedBaseItem ? (
                    <div className={cn("flex flex-col h-full", cursedItems.includes(selectedItem.inventoryKey) && "bg-red-950/40 rounded-lg p-2 border border-red-500/20")}>
                      <div className="flex-1 space-y-0 overflow-y-auto">
                        <div className="flex items-center gap-2.5 pb-2">
                          <div className={cn(
                            "p-2 rounded-lg border overflow-hidden relative shrink-0",
                            selectedItemRarity ? getItemRarityBgColor(selectedItem.name) : "bg-gray-500/20 border-gray-500/30",
                            cursedItems.includes(selectedItem.inventoryKey) && "ring-2 ring-red-500/50"
                          )}>
                            {(() => {
                              const itemImg = getItemImage(selectedItem.name);
                              if (itemImg) return <RetryImage src={itemImg} alt={selectedItem.name} loading="lazy" className="w-10 h-10 object-contain pixelated" />;
                              const IconComp = getItemEquipIcon(selectedBaseItem.equipSlot);
                              return <IconComp className={cn("w-8 h-8", selectedItemRarity ? getItemRarityColor(selectedItem.name) : "text-gray-400")} />;
                            })()}
                            {cursedItems.includes(selectedItem.inventoryKey) && (
                              <div className="absolute -top-1 -right-1 bg-red-900 rounded-full p-0.5"><Skull className="w-3 h-3 text-red-400" weight="fill" /></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={cn("font-display text-base leading-tight truncate", selectedItemRarity ? getItemRarityColor(selectedItem.name) : "text-white")}>
                              {translateItemName(parseItemWithRarity(selectedItem.name).baseId, language)}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={cn("text-xs", selectedItemRarity ? getItemRarityColor(selectedItem.name) : "text-gray-400")}>{selectedItemRarity || "Common"}</span>
                              <span className="text-[10px] text-muted-foreground">{t(selectedBaseItem.equipSlot as any) || selectedBaseItem.equipSlot}</span>
                              <span className="text-[10px] text-muted-foreground">x{formatNumber(selectedItem.quantity)}</span>
                            </div>
                            {(selectedItemRequirement || selectedItemMasteryRequirement) && (
                              <div className="flex items-center gap-1 mt-0.5">
                                {selectedItemRequirement && (
                                  <span className={cn("flex items-center gap-0.5 text-[10px] font-medium px-1 py-0.5 rounded", selectedItemRequirement.meetsRequirement ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400")}>
                                    {selectedItemRequirement.meetsRequirement ? <Check className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                                    Lv.{selectedItemRequirement.requiredLevel}
                                  </span>
                                )}
                                {selectedItemMasteryRequirement && (
                                  <span className={cn("flex items-center gap-0.5 text-[10px] font-medium px-1 py-0.5 rounded", selectedItemMasteryRequirement.meetsRequirement ? "bg-purple-500/15 text-purple-400" : "bg-red-500/15 text-red-400")}>
                                    M.{selectedItemMasteryRequirement.requiredLevel}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {selectedBaseItem.stats && (() => {
                          const breakdown = getItemStatsBreakdown(selectedItem.name, itemModifications);
                          if (!breakdown) return null;
                          const { enhanced: stats, enhancementBonus: enhBonus } = breakdown;
                          const mods = itemModifications[selectedItem.inventoryKey];
                          const enhLevel = mods?.enhancementLevel || 0;
                          const statRows: { key: string; label: string; color: string; suffix?: string }[] = [
                            { key: "attackBonus", label: t('attackBonus'), color: "text-red-400" },
                            { key: "strengthBonus", label: t('strengthBonus'), color: "text-orange-400" },
                            { key: "defenceBonus", label: t('defenceBonus'), color: "text-blue-400" },
                            { key: "hitpointsBonus", label: t('hpBonus'), color: "text-pink-400" },
                            { key: "accuracyBonus", label: t('accuracyBonus'), color: "text-green-400" },
                            { key: "critChance", label: "Crit", color: "text-yellow-400", suffix: "%" },
                            { key: "critDamage", label: "CritD", color: "text-yellow-400", suffix: "%" },
                            { key: "skillDamageBonus", label: "SkillD", color: "text-purple-400", suffix: "%" },
                            { key: "attackSpeedBonus", label: "AtkSpd", color: "text-cyan-400", suffix: "%" },
                            { key: "evasionBonus", label: "Evasion", color: "text-emerald-400" },
                            { key: "healingReceivedBonus", label: "HealR", color: "text-emerald-400", suffix: "%" },
                            { key: "onHitHealingPercent", label: "OnHitH", color: "text-emerald-400", suffix: "%" },
                          ];
                          const activeStats = statRows.filter(({ key }) => { const val = (stats as any)[key]; return val && val !== 0; });
                          if (activeStats.length === 0) return null;
                          return (
                            <div className="pt-2 border-t border-border/20">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{t('stats')}</span>
                                {enhLevel > 0 && <span className="text-[10px] text-amber-400/70">+{enhLevel * 5}%</span>}
                              </div>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                                {activeStats.map(({ key, label, color, suffix }) => {
                                  const val = (stats as any)[key];
                                  const bonus = enhBonus[key] || 0;
                                  const baseVal = val - bonus;
                                  return (
                                    <div key={key} className="flex justify-between">
                                      <span className="text-muted-foreground">{label}</span>
                                      <span className="flex items-center gap-0.5">
                                        <span className={cn(color, "font-bold")}>{baseVal > 0 ? '+' : ''}{baseVal}{suffix || ''}</span>
                                        {bonus > 0 && <span className="text-amber-400 text-[10px]">+{bonus}</span>}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                              {mods && (mods.addedSkills || []).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-border/20">
                                  {mods.addedSkills.map((skill: string, i: number) => (
                                    <span key={i} className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/25 capitalize">{skill.replace(/_/g, ' ')}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {(selectedBaseItem.weaponSkills?.length > 0) && (
                          <div className="flex flex-wrap gap-1 pt-1.5 px-0.5">
                            {selectedBaseItem.weaponSkills.map((skill: any, idx: number) => (
                              <SkillDetailPopup key={idx} skill={skill} variant="badge" />
                            ))}
                          </div>
                        )}

                        <RoleStatsDisplay item={selectedBaseItem} variant="list" />

                        {(() => {
                          const durability = getItemDurability(selectedItem.inventoryKey);
                          if (durability >= 100) return null;
                          return (
                            <div className="flex items-center gap-2 pt-1.5">
                              <div className="flex-1"><DurabilityBar durability={durability} size="sm" showLabel /></div>
                            </div>
                          );
                        })()}

                        {(() => {
                          if (!selectedBaseItem?.equipSlot) return null;
                          const equippedItemId = equipment[selectedBaseItem.equipSlot as keyof typeof equipment];
                          if (equippedItemId === selectedItem.name) return null;
                          const inspectedStats = getItemStatsWithEnhancement(selectedItem.name, itemModifications);
                          if (!inspectedStats) return null;
                          const statKeys: { key: string; label: string }[] = [
                            { key: "attackBonus", label: "attack" }, { key: "strengthBonus", label: "strength" }, { key: "defenceBonus", label: "defence" },
                            { key: "hitpointsBonus", label: "hitpoints" }, { key: "accuracyBonus", label: "accuracy" }, { key: "skillDamageBonus", label: "skill_damage" },
                            { key: "attackSpeedBonus", label: "attack_speed" }, { key: "healingReceivedBonus", label: "healing_received" }, { key: "onHitHealingPercent", label: "on_hit_healing" },
                            { key: "buffDurationBonus", label: "buff_duration" }, { key: "partyDpsBuff", label: "party_dps" }, { key: "partyDefenceBuff", label: "party_defence" },
                            { key: "partyAttackSpeedBuff", label: "party_speed" }, { key: "lootChanceBonus", label: "loot_chance" },
                          ];
                          if (!equippedItemId) {
                            const gains = statKeys.map(({ key, label }) => ({ label, value: (inspectedStats as any)[key] || 0 })).filter(({ value }) => value !== 0);
                            const weaponGains: { label: string; value: string }[] = [];
                            if (selectedBaseItem.equipSlot === "weapon") {
                              if (selectedBaseItem.attackSpeedMs) weaponGains.push({ label: t('attackSpeed'), value: `${(selectedBaseItem.attackSpeedMs / 1000).toFixed(1)}s` });
                              if (selectedBaseItem.lifestealPercent && selectedBaseItem.lifestealPercent > 0) weaponGains.push({ label: t('lifesteal'), value: `${selectedBaseItem.lifestealPercent}%` });
                            }
                            if (gains.length === 0 && weaponGains.length === 0) return null;
                            return (
                              <div className="pt-2 mt-1 border-t border-amber-500/20" data-testid="item-comparison-panel">
                                <div className="text-[10px] text-amber-400 font-medium uppercase tracking-wider mb-1">{t('comparedToEquipped')}</div>
                                <div className="text-[10px] text-muted-foreground italic mb-1">{t('noItemEquipped')}</div>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                                  {gains.map(({ label, value }) => (
                                    <div key={label} className="flex items-center justify-between"><span className="text-muted-foreground">{t(label as any)}</span><span className="text-emerald-400 font-bold">+{value}</span></div>
                                  ))}
                                  {weaponGains.map(({ label, value }) => (
                                    <div key={label} className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><span className="text-emerald-400 font-bold">{value}</span></div>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                          const equippedStats = getItemStatsWithEnhancement(equippedItemId, itemModifications) || {};
                          const equippedBase = getBaseItem(equippedItemId);
                          const equippedName = translateItemName(parseItemWithRarity(equippedItemId).baseId, language);
                          const equippedImg = getItemImage(equippedItemId);
                          const diffs = statKeys.map(({ key, label }) => ({ label, diff: ((inspectedStats as any)[key] || 0) - ((equippedStats as any)[key] || 0) })).filter(({ diff }) => diff !== 0);
                          const weaponDiffs: { label: string; diff: number; display: string }[] = [];
                          if (selectedBaseItem.equipSlot === "weapon" && equippedBase) {
                            const diffMs = (selectedBaseItem.attackSpeedMs || 0) - (equippedBase.attackSpeedMs || 0);
                            if (diffMs !== 0) weaponDiffs.push({ label: t('attackSpeed'), diff: -diffMs, display: `${(Math.abs(diffMs) / 1000).toFixed(1)}s` });
                            const diffLs = (selectedBaseItem.lifestealPercent || 0) - (equippedBase.lifestealPercent || 0);
                            if (diffLs !== 0) weaponDiffs.push({ label: t('lifesteal'), diff: diffLs, display: `${Math.abs(diffLs)}%` });
                          }
                          return (
                            <div className="pt-2 mt-1 border-t border-amber-500/20" data-testid="item-comparison-panel">
                              <div className="text-[10px] text-amber-400 font-medium uppercase tracking-wider mb-1">{t('comparedToEquipped')}</div>
                              <div className="flex items-center gap-1.5 mb-1">
                                {equippedImg && <RetryImage src={equippedImg} alt={equippedName} className="w-4 h-4 object-contain pixelated" spinnerClassName="w-2 h-2" />}
                                <span className={cn("text-[10px] font-medium truncate", hasRarity(equippedItemId) ? getItemRarityColor(equippedItemId) : "text-white")}>{equippedName}</span>
                              </div>
                              {diffs.length > 0 || weaponDiffs.length > 0 ? (
                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                                  {diffs.map(({ label, diff }) => (
                                    <div key={label} className="flex items-center justify-between"><span className="text-muted-foreground">{t(label as any)}</span><span className={cn("font-bold flex items-center gap-0.5", diff > 0 ? "text-emerald-400" : "text-red-400")}>{diff > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}{diff > 0 ? `+${diff}` : diff}</span></div>
                                  ))}
                                  {weaponDiffs.map(({ label, diff, display }) => (
                                    <div key={label} className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><span className={cn("font-bold flex items-center gap-0.5", diff > 0 ? "text-emerald-400" : "text-red-400")}>{diff > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}{diff > 0 ? "+" : "-"}{display}</span></div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-[10px] text-muted-foreground">{t('noStatDifference')}</div>
                              )}
                            </div>
                          );
                        })()}

                        {(() => {
                          const usedInRecipes = getUsedInRecipes(selectedItem.name);
                          if (usedInRecipes.length === 0) return null;
                          return (
                            <div className="pt-2 mt-1 border-t border-border/20">
                              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">{language === 'tr' ? 'Tarifler' : 'Recipes'}</div>
                              <div className="flex flex-wrap gap-1">
                                {usedInRecipes.map((recipe) => {
                                  const resultImg = getItemImage(recipe.resultItemId);
                                  return (
                                    <div key={recipe.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/20 border border-border/10">
                                      <div className="w-4 h-4 rounded bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                                        {resultImg ? <RetryImage src={resultImg} alt="" className="w-full h-full object-contain pixelated" /> : <Hammer className="w-2.5 h-2.5 text-muted-foreground" weight="bold" />}
                                      </div>
                                      <span className="text-[10px] text-white truncate max-w-[80px]">{translateItemName(recipe.resultItemId, language)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex items-center gap-2 pt-3 mt-2 border-t border-border/30">
                        <Button
                          onClick={() => {
                            if (!selectedItem) return;
                            const enhLevel = itemModifications[selectedItem.inventoryKey]?.enhancementLevel || undefined;
                            const itemNameClean = stripInstanceSuffix(selectedItem.name);
                            chatItemShare.addItem({ itemName: itemNameClean, enhancementLevel: enhLevel });
                            chatItemShare.requestOpenChat();
                            setSelectedItem(null);
                          }}
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 border-primary/40 text-primary hover:bg-primary/10"
                          data-testid="button-share-item"
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          onClick={handleEquip}
                          disabled={!!(selectedItemRequirement && !selectedItemRequirement.meetsRequirement) || !!(selectedItemMasteryRequirement && !selectedItemMasteryRequirement.meetsRequirement)}
                          className={cn(
                            "flex-1 font-bold text-sm h-9",
                            (selectedItemRequirement && !selectedItemRequirement.meetsRequirement) || (selectedItemMasteryRequirement && !selectedItemMasteryRequirement.meetsRequirement)
                              ? "bg-gray-600 hover:bg-gray-600 cursor-not-allowed text-gray-400"
                              : "bg-yellow-600 hover:bg-yellow-700 text-white"
                          )}
                          data-testid="button-equip"
                        >
                          {selectedItemRequirement && !selectedItemRequirement.meetsRequirement 
                            ? `Lv.${selectedItemRequirement.requiredLevel}`
                            : selectedItemMasteryRequirement && !selectedItemMasteryRequirement.meetsRequirement
                            ? t('masteryNotMet')
                            : t('equip')
                          }
                        </Button>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 px-3" data-testid="button-actions-menu">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-72 p-3 space-y-3" data-testid="actions-popover">
                            <div>
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <Slider value={[sellQuantity]} onValueChange={([val]) => setSellQuantity(val)} min={1} max={selectedItem.quantity} step={1} className="flex-1" />
                                <span className="text-[10px] font-mono text-white min-w-[24px] text-right">{sellQuantity}</span>
                                <Button variant="outline" size="sm" onClick={() => setSellQuantity(selectedItem.quantity)} className="text-[10px] h-6 px-1.5">{t('max')}</Button>
                              </div>
                              <Button
                                onClick={() => {
                                  const result = handleSell(selectedItem.name, sellQuantity);
                                  if (result.gold <= 0) return;
                                  if (result.soldQty < sellQuantity) {
                                    toast({ title: language === 'tr' ? 'Kısmi Satış' : 'Partial Sell', description: language === 'tr' ? `${result.soldQty}/${sellQuantity} adet satıldı → ${formatNumber(result.gold)} altın` : `Sold ${result.soldQty}/${sellQuantity} → ${formatNumber(result.gold)} gold` });
                                  } else {
                                    toast({ title: language === 'tr' ? 'Satıldı!' : 'Sold!', description: language === 'tr' ? `${result.soldQty}x ${translateItemName(selectedItem.name, language)} → ${formatNumber(result.gold)} altın` : `Sold ${result.soldQty}x ${translateItemName(selectedItem.name, language)} → ${formatNumber(result.gold)} gold` });
                                  }
                                  const remainingQty = selectedItem.quantity - result.soldQty;
                                  if (remainingQty <= 0) { setSelectedItem(null); } else { setSelectedItem({ ...selectedItem, quantity: remainingQty }); setSellQuantity(Math.min(sellQuantity, remainingQty)); }
                                }}
                                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8"
                                data-testid="button-sell"
                              >
                                {t('sell')} ({formatNumber(getSellPrice(selectedItem.name) * sellQuantity)} {t('gold')})
                              </Button>
                            </div>
                            {(() => {
                              const salvageInfo = getSalvageInfo(selectedItem.name);
                              if (!salvageInfo) return null;
                              return (
                                <div className="border-t border-border/20 pt-2">
                                  <div className="flex items-center justify-between text-[10px] mb-1">
                                    <span className="text-orange-400 font-medium uppercase tracking-wider">{t('salvage')}</span>
                                    <span className="text-orange-400">{salvageInfo.scrapAmount.min}-{salvageInfo.scrapAmount.max} {t('scrap')}</span>
                                  </div>
                                  {!showSalvageConfirm ? (
                                    <>
                                      <div className="flex items-center gap-1.5 mb-1">
                                        <Slider value={[salvageQuantity]} onValueChange={([val]) => setSalvageQuantity(val)} min={1} max={selectedItem.quantity} step={1} className="flex-1" />
                                        <span className="text-[10px] font-mono text-white min-w-[24px] text-right">{salvageQuantity}</span>
                                      </div>
                                      <Button onClick={() => setShowSalvageConfirm(true)} size="sm" className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs h-8" data-testid="button-salvage">
                                        {t('salvage')} x{salvageQuantity}
                                      </Button>
                                    </>
                                  ) : (
                                    <div className="space-y-1.5">
                                      <div className="text-center text-[10px] text-orange-300">{salvageQuantity}x {translateItemName(parseItemWithRarity(selectedItem.name).baseId, language)} {t('confirmSalvage') || '?'}</div>
                                      <div className="flex gap-1.5">
                                        <Button onClick={() => { const result = salvageItem(selectedItem.name, salvageQuantity); if (result.success) { trackItemSalvaged(); const newQty = selectedItem.quantity - salvageQuantity; if (newQty <= 0) { setSelectedItem(null); } else { setSelectedItem({ ...selectedItem, quantity: newQty }); setSalvageQuantity(Math.min(salvageQuantity, newQty)); } } setShowSalvageConfirm(false); }} size="sm" className="flex-1 bg-orange-600 hover:bg-orange-700 text-white text-xs h-7" data-testid="button-confirm-salvage">
                                          {t('confirm')}
                                        </Button>
                                        <Button onClick={() => setShowSalvageConfirm(false)} variant="outline" size="sm" className="flex-1 text-xs h-7" data-testid="button-cancel-salvage">
                                          {t('cancel')}
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            {(() => {
                              const studyInfo = getStudyInfo(selectedItem.name);
                              if (!studyInfo) return null;
                              const isStudying = activeTask?.skillId === "studying" && activeTask?.name === selectedItem.name;
                              return (
                                <div className="border-t border-border/20 pt-2">
                                  <Button onClick={async () => { await addToQueue({ type: 'study', studyItemId: selectedItem.name, name: selectedItem.name, durationMs: STUDY_DURATION, xpReward: studyInfo.studyXp }); trackItemStudied(); setSelectedItem(null); }} disabled={isStudying} size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-8" data-testid="button-study">
                                    {isStudying ? t('studying') : t('study')} (+{studyInfo.studyXp.toFixed(0)} XP)
                                  </Button>
                                </div>
                              );
                            })()}
                            {(() => {
                              const durability = getItemDurability(selectedItem.inventoryKey);
                              if (durability >= 100) return null;
                              const repairCost = getInventoryRepairCost(selectedItem.inventoryKey);
                              const canAfford = gold >= repairCost;
                              return (
                                <div className="border-t border-border/20 pt-2">
                                  <Button
                                    onClick={async () => { const result = await repairInventoryItem(selectedItem.inventoryKey); if (result.success) { trackEquipmentRepaired(); setSelectedItem(null); } }}
                                    disabled={!canAfford}
                                    size="sm"
                                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs h-8"
                                    data-testid="button-repair"
                                  >
                                    <Wrench className="w-3 h-3 mr-1" /> {t('repair')} ({formatNumber(repairCost)} {t('gold')})
                                  </Button>
                                </div>
                              );
                            })()}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  ) : (selectedMeta || selectedBaseItem) ? (
                    <div className="flex flex-col h-full">
                      <div className="flex-1 space-y-0 overflow-y-auto">
                        <div className="flex items-center gap-2.5 pb-2">
                          <div className={cn(
                            "p-2 rounded-lg border overflow-hidden shrink-0",
                            selectedMeta ? (RARITY_COLORS[selectedMeta.rarity] || RARITY_COLORS.common) : "bg-zinc-800/80 border-zinc-700"
                          )}>
                            {getItemImage(selectedItem.name) ? (
                              <RetryImage src={getItemImage(selectedItem.name)!} alt={selectedItem.name} className="w-10 h-10 object-cover rounded" />
                            ) : selectedMeta ? (
                              <selectedMeta.icon className={cn("w-8 h-8", selectedMeta.color)} />
                            ) : (
                              <Backpack className="w-8 h-8 text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-display text-base leading-tight truncate">{translateItemName(selectedItem.name, language)}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={cn("text-xs", selectedMeta ? selectedRarityColor : "text-zinc-400")}>
                                {selectedMeta ? t(selectedMeta.rarity as any) : (selectedBaseItem?.type === "food" ? t('food') : selectedBaseItem?.type === "material" ? t('material') : t('item'))}
                              </span>
                              <span className="text-[10px] text-muted-foreground">x{formatNumber(selectedItem.quantity)}</span>
                            </div>
                          </div>
                        </div>

                        <p className="text-muted-foreground text-xs leading-relaxed pb-2">
                          {selectedBaseItem ? translateItemDescription(selectedBaseItem.name || selectedBaseItem.id, language) : t('anInventoryItem')}
                        </p>

                        {(() => {
                          const foodHeal = getFoodHealAmount(selectedItem.name);
                          if (foodHeal <= 0) return null;
                          return (
                            <div className="flex items-center gap-1.5 pb-2">
                              <span className="text-xs text-green-400 font-medium">{t('healsHp')} +{foodHeal} {t('hp')}</span>
                            </div>
                          );
                        })()}

                        {isPotion && selectedBaseItem?.effect && selectedBaseItem?.duration && (
                          <div className="pt-2 border-t border-violet-500/20">
                            <div className="text-xs text-violet-300 mb-1 font-medium">{t('effect')}</div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">
                                {selectedBaseItem.effect.type === "attack_boost" && t('attackBonus2')}
                                {selectedBaseItem.effect.type === "strength_boost" && t('strengthBonus2')}
                                {selectedBaseItem.effect.type === "defence_boost" && t('defenceBonus2')}
                                {selectedBaseItem.effect.type === "hp_regen" && t('hpRegen')}
                                {selectedBaseItem.effect.type === "poison_immunity" && t('poisonImmunity')}
                                {selectedBaseItem.effect.type === "crit_chance" && t('critChance')}
                                {selectedBaseItem.effect.type === "damage_reduction" && t('damageReduction')}
                                {selectedBaseItem.effect.type === "xp_boost" && t('xpBonus')}
                              </span>
                              <span className="text-violet-400 font-bold">+{selectedBaseItem.effect.value}%</span>
                            </div>
                            <div className="flex justify-between text-xs mt-0.5">
                              <span className="text-muted-foreground">{t('duration')}</span>
                              <span className="text-violet-400">{Math.floor(selectedBaseItem.duration / 60)} {t('minutes')}</span>
                            </div>
                          </div>
                        )}

                        {(() => {
                          const usedInRecipes = getUsedInRecipes(selectedItem.name);
                          if (usedInRecipes.length === 0) return null;
                          return (
                            <div className="pt-2 mt-1 border-t border-border/20">
                              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">{language === 'tr' ? 'Tarifler' : 'Recipes'}</div>
                              <div className="flex flex-wrap gap-1">
                                {usedInRecipes.map((recipe) => {
                                  const resultImg = getItemImage(recipe.resultItemId);
                                  return (
                                    <div key={recipe.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/20 border border-border/10">
                                      <div className="w-4 h-4 rounded bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                                        {resultImg ? <RetryImage src={resultImg} alt="" className="w-full h-full object-contain pixelated" /> : <Hammer className="w-2.5 h-2.5 text-muted-foreground" weight="bold" />}
                                      </div>
                                      <span className="text-[10px] text-white truncate max-w-[80px]">{translateItemName(recipe.resultItemId, language)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex items-center gap-2 pt-3 mt-2 border-t border-border/30">
                        <Button
                          onClick={() => {
                            if (!selectedItem) return;
                            const itemNameClean = stripInstanceSuffix(selectedItem.name);
                            chatItemShare.addItem({ itemName: itemNameClean });
                            chatItemShare.requestOpenChat();
                            setSelectedItem(null);
                          }}
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 border-primary/40 text-primary hover:bg-primary/10"
                          data-testid="button-share-item-nonequip"
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                        {isPotion && !showPotionConfirm && (
                          <Button onClick={() => setShowPotionConfirm(true)} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm h-9" data-testid="button-use-potion">{t('use')}</Button>
                        )}
                        {isPotion && showPotionConfirm && (
                          <div className="flex-1 space-y-1.5">
                            <div className="text-center text-xs text-violet-300 font-medium">{selectedBaseItem?.name} {t('confirmUse')}</div>
                            <div className="flex gap-2">
                              <Button onClick={handleUsePotion} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm h-9" data-testid="button-confirm-potion">{t('yesUse')}</Button>
                              <Button onClick={() => setShowPotionConfirm(false)} variant="outline" className="flex-1 text-sm h-9" data-testid="button-cancel-potion">{t('cancel')}</Button>
                            </div>
                          </div>
                        )}
                        {!isPotion && (
                          <div className="flex-1" />
                        )}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 px-3" data-testid="button-actions-menu-nonequip">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-72 p-3" data-testid="actions-popover-nonequip">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Slider value={[sellQuantity]} onValueChange={([val]) => setSellQuantity(val)} min={1} max={selectedItem.quantity} step={1} className="flex-1" />
                              <span className="text-[10px] font-mono text-white min-w-[24px] text-right">{sellQuantity}</span>
                              <Button variant="outline" size="sm" onClick={() => setSellQuantity(selectedItem.quantity)} className="text-[10px] h-6 px-1.5">{t('max')}</Button>
                            </div>
                            <Button
                              onClick={() => {
                                const result = handleSell(selectedItem.name, sellQuantity);
                                if (result.gold <= 0) return;
                                if (result.soldQty < sellQuantity) {
                                  toast({ title: language === 'tr' ? 'Kısmi Satış' : 'Partial Sell', description: language === 'tr' ? `${result.soldQty}/${sellQuantity} adet satıldı → ${formatNumber(result.gold)} altın` : `Sold ${result.soldQty}/${sellQuantity} → ${formatNumber(result.gold)} gold` });
                                } else {
                                  toast({ title: language === 'tr' ? 'Satıldı!' : 'Sold!', description: language === 'tr' ? `${result.soldQty}x ${translateItemName(selectedItem.name, language)} → ${formatNumber(result.gold)} altın` : `Sold ${result.soldQty}x ${translateItemName(selectedItem.name, language)} → ${formatNumber(result.gold)} gold` });
                                }
                                const remainingQty = selectedItem.quantity - result.soldQty;
                                if (remainingQty <= 0) { setSelectedItem(null); } else { setSelectedItem({ ...selectedItem, quantity: remainingQty }); setSellQuantity(Math.min(sellQuantity, remainingQty)); }
                              }}
                              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8"
                              data-testid="button-sell"
                            >
                              {t('sell')} ({formatNumber(getSellPrice(selectedItem.name) * sellQuantity)} {t('gold')})
                            </Button>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 space-y-2">
                      <img src={BROKEN_ITEM_IMAGE} alt="broken item" className="w-12 h-12 mx-auto" />
                      <div className="text-red-400 text-xs font-medium">{t('unknownItem')}</div>
                      <div className="text-muted-foreground text-[10px] font-mono break-all px-2">{selectedItem.name}</div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <ShieldStar className="w-16 h-16 mb-4 opacity-30" weight="bold" />
                  <p className="text-center text-sm">{t('selectItemToViewDetails')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Equipment Tooltip Portal */}
      {isMounted && tooltip.visible && tooltip.item && createPortal(
        <div 
          className="fixed pointer-events-none bg-popover border border-border rounded-lg shadow-2xl p-3 min-w-[180px]"
          style={{ left: tooltip.x, top: tooltip.y, zIndex: 9999 }}
        >
          <div className={cn("font-bold text-sm mb-1", tooltip.rarity ? getItemRarityColor(`item (${tooltip.rarity})`) : "")}>
            {translateItemName(tooltip.item.id || tooltip.item.name, language)}
          </div>
          {tooltip.rarity && (
            <div className={cn("text-xs mb-2", getItemRarityColor(`item (${tooltip.rarity})`))}>
              {tooltip.rarity}
            </div>
          )}
          {tooltip.item.stats && (
            <div className="space-y-1 text-xs">
              {tooltip.item.stats.attackBonus && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('attackBonus')}:</span>
                  <span className="text-red-400">+{tooltip.item.stats.attackBonus}</span>
                </div>
              )}
              {tooltip.item.stats.strengthBonus && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('strengthBonus')}:</span>
                  <span className="text-orange-400">+{tooltip.item.stats.strengthBonus}</span>
                </div>
              )}
              {tooltip.item.stats.defenceBonus !== undefined && tooltip.item.stats.defenceBonus !== 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('defenceBonus')}:</span>
                  <span className={tooltip.item.stats.defenceBonus > 0 ? "text-blue-400" : "text-red-400"}>
                    {tooltip.item.stats.defenceBonus > 0 ? '+' : ''}{tooltip.item.stats.defenceBonus}
                  </span>
                </div>
              )}
              {tooltip.item.stats.hitpointsBonus && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('hpBonus')}:</span>
                  <span className="text-pink-400">+{tooltip.item.stats.hitpointsBonus}</span>
                </div>
              )}
              {tooltip.item.stats.accuracyBonus && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t('accuracyBonus')}:</span>
                  <span className="text-green-400">+{tooltip.item.stats.accuracyBonus}</span>
                </div>
              )}
            </div>
          )}
          <RoleStatsDisplay item={tooltip.item} variant="list" showContainer={false} className="mt-2 pt-2 border-t border-border/30" />
          {/* Mastery Requirement Display in Tooltip */}
          {tooltip.item.equipSlot === "weapon" && tooltip.item.masteryRequired && tooltip.item.masteryRequired > 1 && (() => {
            const masteryType = mapWeaponCategoryToMasteryType(tooltip.item.weaponCategory);
            if (!masteryType) return null;
            const playerMasteryLevel = getMasteryLevel(masteryType);
            const meetsRequirement = playerMasteryLevel >= tooltip.item.masteryRequired;
            return (
              <div className={cn(
                "mt-2 pt-2 border-t border-border/30 text-xs",
                meetsRequirement ? "text-purple-400" : "text-red-400"
              )}>
                <div className="flex items-center justify-between gap-2">
                  <span>⚔️ {MASTERY_TYPE_NAMES[masteryType]}:</span>
                  <span className="font-mono">
                    {playerMasteryLevel} / {tooltip.item.masteryRequired}
                  </span>
                </div>
                {!meetsRequirement && (
                  <div className="text-[10px] mt-1">{t('masteryNotMet')}</div>
                )}
              </div>
            );
          })()}
          <div className="mt-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
            {t('tapToUnequip')}
          </div>
        </div>,
        document.body
      )}

      {/* Repair All Confirmation Dialog */}
      <AlertDialog open={showRepairAllConfirm} onOpenChange={setShowRepairAllConfirm}>
        <AlertDialogContent className="border-yellow-500/50 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-yellow-400">
              <ArrowsClockwise className="w-6 h-6" weight="fill" />
              {t('repairAllEquipment')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/80">
              {t('allDamagedWillBeRepaired')}
              <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('totalCost')}:</span>
                  <span className="text-yellow-400 font-bold text-lg">{formatNumber(getTotalRepairCost())} {t('gold')}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-muted-foreground">{t('currentGold')}:</span>
                  <span className="text-green-400 font-bold">{formatNumber(gold)} {t('gold')}</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-repair-all">
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={async (e) => {
                e.preventDefault();
                try {
                  const result = await repairAllEquipment();
                  if (result.success) {
                    toast({
                      title: t('repairSuccess'),
                      description: t('allEquipmentRepaired'),
                      duration: 3000,
                    });
                  } else if (result.error) {
                    toast({
                      title: t('repairFailed'),
                      description: result.error,
                      variant: "destructive",
                      duration: 3000,
                    });
                  }
                } catch (err) {
                  console.error("Repair all error:", err);
                  toast({
                    title: t('repairFailed'),
                    description: t('serverError'),
                    variant: "destructive",
                    duration: 3000,
                  });
                }
                setShowRepairAllConfirm(false);
              }}
              className="bg-yellow-500 hover:bg-yellow-600 text-black"
              data-testid="button-confirm-repair-all"
            >
              {t('repair')} ({formatNumber(getTotalRepairCost())} {t('gold')})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Sell Confirmation Dialog - Desktop */}
      <AlertDialog open={showBulkSellConfirm} onOpenChange={setShowBulkSellConfirm}>
        <AlertDialogContent className="border-amber-500/50 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-400">
              {t('confirmBulkSell')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-foreground/80">
                <div className="mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{selectedItems.size} {t('itemsSelected')}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-muted-foreground">{t('totalValue')}:</span>
                    <span className="text-yellow-400 font-bold text-lg">{formatNumber(getSelectedTotalValue())} {t('gold')}</span>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-sell-desktop">
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); executeBulkSell(); }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-confirm-bulk-sell-desktop"
            >
              {t('sellSelected')} ({formatNumber(getSelectedTotalValue())} {t('gold')})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
