import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAudio } from "@/context/AudioContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Storefront, ShoppingCart, Tag, X, Package, CaretLeft, CaretRight, Users, Sword, Shield, Lightning, Drop, Skull, Target, Heart, ArrowUp, ArrowDown, Cookie, Flask, Cube, Diamond, MapPin, Fish, BookmarkSimple, Coins } from "@phosphor-icons/react";
import { TradingPostPanel } from "@/components/game/TradingPostPanel";
import { GoldDisplay } from "@/components/game/GoldDisplay";
import { cn } from "@/lib/utils";
import { useGame } from "@/context/GameContext";
import { formatNumber } from "@/lib/gameMath";
import { useToast } from "@/hooks/use-toast";
import { isItemTradable, getVendorPrice, parseItemWithRarity, RARITY_COLORS, RARITY_BG_COLORS, getBaseItem, translateItemDescription, translateItemName, getItemStatsWithEnhancement, hasRarity, getItemRarityColor, getItems, getValidRarities, buildBuyOrderItemId } from "@/lib/items";
import type { Rarity } from "@/lib/items-types";
import { getItemImage } from "@/lib/itemImages";
import { useMobile } from "@/hooks/useMobile";
import { DurabilityBar } from "@/components/game/DurabilityBar";
import { useLanguage } from "@/context/LanguageContext";
import { getAuthHeaders } from "@/context/FirebaseAuthContext";
import { trackMarketSale, trackMarketPurchase, trackGoldSpent } from "@/hooks/useAchievementTracker";
import { MARKET_BUY_TAX, MARKET_BUY_ORDER_TAX, MARKET_LISTING_FEE } from "@shared/schema";

interface Transaction {
  id: number;
  itemId: string;
  quantity: number;
  pricePerItem: number;
  soldAt: string | null;
  role: "buyer" | "seller";
  otherUsername: string;
}

interface BuyOrder {
  id: string;
  buyerId: string;
  itemId: string;
  quantity: number;
  remainingQuantity: number;
  pricePerItem: number;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  buyer: { id: string; username: string };
}

interface MarketListing {
  id: string;
  sellerId: string;
  itemId: string;
  quantity: number;
  pricePerItem: number;
  createdAt: string;
  seller?: {
    id: string;
    username: string;
  };
  enhancementData?: {
    enhancementLevel?: number;
    addedStats?: Record<string, number>;
    addedSkills?: string[];
  } | null;
}

interface GroupedItem {
  itemId: string;
  latestListing: MarketListing;
  listingCount: number;
  lowestPrice: number;
  highestPrice: number;
  totalQuantity: number;
}

interface GroupedMarketResponse {
  groups: GroupedItem[];
  totalGroups: number;
  page: number;
  limit: number;
}

const RARITY_GLOW: Record<Rarity, string> = {
  Common: "",
  Uncommon: "shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:shadow-[0_0_25px_rgba(34,197,94,0.5)]",
  Rare: "shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.5)]",
  Epic: "shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.5)]",
  Legendary: "shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_rgba(245,158,11,0.5)]",
  Mythic: "shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)]",
};

function SuggestedPriceHint({ itemId, currentPrice, isMobile, language }: { itemId: string; currentPrice: number; isMobile: boolean; language: string }) {
  const { data } = useQuery<{ suggestedPrice: number | null; stats24h: { avgPrice: number; saleCount: number }; stats7d: { avgPrice: number; saleCount: number }; trend: string }>({
    queryKey: ["/api/market/price-history", itemId],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/market/price-history/${encodeURIComponent(itemId)}`, { headers });
      return res.json();
    },
    staleTime: 60000,
  });

  const has24h = data?.stats24h?.saleCount && data.stats24h.saleCount > 0;
  const has7d = data?.stats7d?.saleCount && data.stats7d.saleCount > 0;
  if (!has24h && !has7d) return null;
  if (!data) return null;

  const marketAvg = has24h ? (data.stats24h?.avgPrice ?? 0) : (data.stats7d?.avgPrice ?? 0);
  if (!marketAvg) return null;
  const suggested = data?.suggestedPrice || marketAvg;
  const priceDiff = currentPrice > 0 ? ((currentPrice - marketAvg) / marketAvg) * 100 : 0;
  const isAbove = priceDiff > 10;
  const isBelow = priceDiff < -10;

  return (
    <div className={cn(
      "rounded-lg border p-2 space-y-1.5",
      isAbove ? "bg-red-950/20 border-red-700/20" : isBelow ? "bg-green-950/20 border-green-700/20" : "bg-blue-950/20 border-blue-700/20"
    )} data-testid="suggested-price-hint">
      <div className="flex items-center justify-between">
        <span className={cn("text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>Market avg ({has24h ? "24h" : "7d"}):</span>
        <span className={cn("font-bold text-amber-400", isMobile ? "text-xs" : "text-sm")}>{formatNumber(Math.round(marketAvg))} gold</span>
      </div>
      {suggested > 0 && (
        <div className="flex items-center justify-between">
          <span className={cn("text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>Suggested price:</span>
          <span className={cn("font-bold text-green-400", isMobile ? "text-xs" : "text-sm")}>{formatNumber(Math.round(suggested))} gold</span>
        </div>
      )}
      {currentPrice > 0 && Math.abs(priceDiff) > 10 && (
        <div className={cn("text-center", isMobile ? "text-[10px]" : "text-xs")}>
          {isAbove ? (
            <span className="text-red-400">{Math.round(priceDiff)}% above market average</span>
          ) : (
            <span className="text-green-400">{Math.abs(Math.round(priceDiff))}% below market average</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function MarketPage() {
  const { isMobile } = useMobile();
  const queryClient = useQueryClient();
  const { inventory, gold, player, refreshPlayer, applyServerData, addNotification, inventoryDurability, getItemDurability, itemModifications, cursedItems, equipment, staffRole } = useGame();
  const { toast } = useToast();
  const { playSfx } = useAudio();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState("browse");
  const [myListings, setMyListings] = useState<MarketListing[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [enhMinLevel, setEnhMinLevel] = useState<number>(0);
  const [enhSkillFilter, setEnhSkillFilter] = useState<string | null>(null);
  const [enhStatFilter, setEnhStatFilter] = useState<string | null>(null);
  const [userOnly, setUserOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [subCategoryFilter, setSubCategoryFilter] = useState<string | null>(null);
  const [armorTypeFilter, setArmorTypeFilter] = useState<string | null>(null);
  const isAdmin = staffRole === 'admin';


  const [sellSearchQuery, setSellSearchQuery] = useState("");
  const [sellCategoryFilter, setSellCategoryFilter] = useState<string | null>(null);
  const [sellSubCategoryFilter, setSellSubCategoryFilter] = useState<string | null>(null);
  const [sellArmorTypeFilter, setSellArmorTypeFilter] = useState<string | null>(null);
  const [listingsSearchQuery, setListingsSearchQuery] = useState("");

  const [sellDialogOpen, setSellDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ name: string; quantity: number } | null>(null);
  const [sellQuantity, setSellQuantity] = useState(1);
  const [sellPrice, setSellPrice] = useState(1);
  const [existingListing, setExistingListing] = useState<MarketListing | null>(null);

  const [purchasePopupOpen, setPurchasePopupOpen] = useState(false);
  const [selectedGroupItem, setSelectedGroupItem] = useState<GroupedItem | null>(null);
  const [selectedListing, setSelectedListing] = useState<MarketListing | null>(null);
  const [buyQuantity, setBuyQuantity] = useState(1);
  const [isBuying, setIsBuying] = useState(false);

  // Buy order state
  const [buyOrderSearchItem, setBuyOrderSearchItem] = useState("");
  const [buyOrderBaseItemId, setBuyOrderBaseItemId] = useState("");
  const [buyOrderRarity, setBuyOrderRarity] = useState<Rarity>("Common");
  const [buyOrderItemId, setBuyOrderItemId] = useState("");
  const [buyOrderQuantity, setBuyOrderQuantity] = useState(1);
  const [buyOrderPrice, setBuyOrderPrice] = useState(1);
  const [isCreatingBuyOrder, setIsCreatingBuyOrder] = useState(false);
  const [isFillingOrder, setIsFillingOrder] = useState<string | null>(null);

  const goldBalance = gold;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: groupedData, isLoading: groupedLoading, isError: groupedError, refetch: refetchGrouped } = useQuery<GroupedMarketResponse>({
    queryKey: ["market-grouped", currentPage, debouncedSearch, activeFilter, enhMinLevel, enhSkillFilter, enhStatFilter, userOnly, categoryFilter, subCategoryFilter, armorTypeFilter],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: "20",
      });
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }
      if (activeFilter) {
        params.set("sort", activeFilter);
      }
      if (activeFilter === "enhanced") {
        if (enhMinLevel > 0) params.set("enhMinLevel", String(enhMinLevel));
        if (enhSkillFilter) params.set("enhSkill", enhSkillFilter);
        if (enhStatFilter) params.set("enhStat", enhStatFilter);
      }
      if (userOnly) {
        params.set("userOnly", "true");
      }
      if (categoryFilter === "weapons") {
        params.set("itemType", "equipment");
        params.set("equipSlot", "weapon");
        if (subCategoryFilter) params.set("weaponCategory", subCategoryFilter);
      } else if (categoryFilter === "armor") {
        params.set("itemType", "equipment");
        params.set("equipSlot", subCategoryFilter ?? "_armor");
        if (armorTypeFilter) params.set("armorType", armorTypeFilter);
      } else if (categoryFilter === "accessories") {
        params.set("itemType", "equipment");
        params.set("equipSlot", subCategoryFilter ?? "_accessories");
      } else if (categoryFilter === "food") {
        params.set("itemType", "food");
      } else if (categoryFilter === "fish") {
        params.set("itemType", "fish");
      } else if (categoryFilter === "potions") {
        params.set("itemType", "potion");
      } else if (categoryFilter === "materials") {
        params.set("itemType", "material");
        if (subCategoryFilter) params.set("materialSub", subCategoryFilter);
      }
      const res = await fetch(`/api/market/grouped?${params}`, {
        credentials: "include",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to fetch grouped listings");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!player,
  });

  const { data: itemListings, isLoading: itemListingsLoading, isError: itemListingsError, refetch: refetchItemListings } = useQuery<MarketListing[]>({
    queryKey: ["market-item-listings", selectedGroupItem?.itemId],
    queryFn: async () => {
      if (!selectedGroupItem) return [];
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/market/item/${encodeURIComponent(selectedGroupItem.itemId)}/listings`, {
        credentials: "include",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to fetch item listings");
      return res.json();
    },
    enabled: !!selectedGroupItem,
    staleTime: 10000,
  });

  useEffect(() => {
    if (itemListings && itemListings.length > 0 && !selectedListing) {
      setSelectedListing(itemListings[0]);
      setBuyQuantity(1);
    }
  }, [itemListings, selectedListing]);

  const fetchMyListings = async () => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/market/my-listings", {
        credentials: "include",
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        setMyListings(data);
      }
    } catch (err) {
      console.error("Failed to fetch my listings:", err);
    }
  };

  useEffect(() => {
    fetchMyListings();
  }, []);

  // Buy orders: my orders
  const { data: myBuyOrders = [], refetch: refetchMyBuyOrders } = useQuery<BuyOrder[]>({
    queryKey: ["my-buy-orders"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/market/my-buy-orders", { credentials: "include", headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 10000,
  });

  // Transactions history
  const { data: myTransactions = [] } = useQuery<Transaction[]>({
    queryKey: ["my-transactions"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/market/my-transactions", { credentials: "include", headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30000,
    enabled: activeTab === "my-listings" || activeTab === "history",
  });

  // Buy orders: for item shown in sell dialog
  const { data: itemBuyOrders = [], refetch: refetchItemBuyOrders } = useQuery<BuyOrder[]>({
    queryKey: ["item-buy-orders", selectedItem?.name],
    queryFn: async () => {
      if (!selectedItem?.name) return [];
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/market/buy-orders?itemId=${encodeURIComponent(selectedItem.name)}`, { credentials: "include", headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: sellDialogOpen && !!selectedItem?.name,
    staleTime: 5000,
  });

  // Buy orders: for item shown in the unified purchase popup
  const { data: popupBuyOrders = [] } = useQuery<BuyOrder[]>({
    queryKey: ["popup-buy-orders", selectedGroupItem?.itemId],
    queryFn: async () => {
      if (!selectedGroupItem?.itemId) return [];
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/market/buy-orders?itemId=${encodeURIComponent(selectedGroupItem.itemId)}`, { credentials: "include", headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: purchasePopupOpen && !!selectedGroupItem?.itemId,
    staleTime: 10000,
  });

  // Cheapest sell price for selected buy order item (for reference hint)
  const { data: buyOrderItemSellPrice } = useQuery<{ lowestPrice: number | null }>({
    queryKey: ["buy-order-sell-price", buyOrderItemId],
    queryFn: async () => {
      if (!buyOrderItemId) return { lowestPrice: null };
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/market/item/${encodeURIComponent(buyOrderItemId)}/listings`, { credentials: "include", headers: authHeaders });
      if (!res.ok) return { lowestPrice: null };
      const listings: MarketListing[] = await res.json();
      const eligible = listings.filter(l => l.sellerId !== player?.id);
      if (eligible.length === 0) return { lowestPrice: null };
      const cheapest = Math.min(...eligible.map(l => l.pricePerItem));
      return { lowestPrice: cheapest };
    },
    enabled: !!buyOrderItemId,
    staleTime: 15000,
  });

  const handleCreateBuyOrder = async () => {
    if (!buyOrderItemId || buyOrderQuantity < 1 || buyOrderPrice < 1) return;
    const escrowBase = buyOrderQuantity * buyOrderPrice;
    const escrowWithTax = Math.floor(escrowBase * (1 + MARKET_BUY_ORDER_TAX));
    if (escrowWithTax > goldBalance) {
      toast({ title: t('notEnoughGold'), variant: "destructive" });
      return;
    }
    if (myBuyOrders.length >= 10) {
      toast({ title: t('buyOrderLimit'), variant: "destructive" });
      return;
    }
    setIsCreatingBuyOrder(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/market/buy-orders", {
        method: "POST",
        credentials: "include",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: buyOrderItemId, quantity: buyOrderQuantity, pricePerItem: buyOrderPrice }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error || "Error", variant: "destructive" }); return; }
      if (data.buyerInventory) {
        applyServerData({ gold: data.buyerGold, inventory: data.buyerInventory });
      } else {
        applyServerData({ gold: data.buyerGold });
      }
      await refetchMyBuyOrders();
      refetchGrouped();
      if (data.autoFilled && data.autoFilled > 0) {
        toast({
          title: data.order ? t('buyOrderCreated') : "Purchase complete",
          description: `${data.autoFilled}x ${translateItemName(buyOrderItemId, language)} purchased instantly`,
        });
      } else {
        toast({ title: t('buyOrderCreated') });
      }
      setBuyOrderBaseItemId("");
      setBuyOrderRarity("Common");
      setBuyOrderItemId("");
      setBuyOrderQuantity(1);
      setBuyOrderPrice(1);
      setBuyOrderSearchItem("");
    } catch (e) {
      toast({ title: "Error creating buy order", variant: "destructive" });
    } finally {
      setIsCreatingBuyOrder(false);
    }
  };

  const handleCancelBuyOrder = async (orderId: string) => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/market/buy-orders/${orderId}`, {
        method: "DELETE",
        credentials: "include",
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error || "Error", variant: "destructive" }); return; }
      if (data.buyerGold !== undefined) applyServerData({ gold: data.buyerGold });
      await refetchMyBuyOrders();
      toast({ title: t('buyOrderCancelled') });
    } catch (e) {
      toast({ title: "Error cancelling buy order", variant: "destructive" });
    }
  };

  const handleFillBuyOrder = async (orderId: string, qty: number, itemId: string) => {
    if (!inventory[itemId] || inventory[itemId] < qty) {
      toast({ title: t('notEnoughItems'), variant: "destructive" });
      return;
    }
    setIsFillingOrder(orderId);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/market/buy-orders/${orderId}/fill`, {
        method: "POST",
        credentials: "include",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error || "Error", variant: "destructive" }); return; }
      applyServerData({ gold: data.sellerGold, inventory: data.newInventory, itemModifications: data.newItemModifications });
      await refetchItemBuyOrders();
      refetchGrouped();
      toast({ title: t('buyOrderFilled'), description: `+${formatNumber(data.goldEarned)} gold` });
      setSellDialogOpen(false);
    } catch (e) {
      toast({ title: "Error filling buy order", variant: "destructive" });
    } finally {
      setIsFillingOrder(null);
    }
  };

  const handleCreateListing = async () => {
    if (!selectedItem) return;

    try {
      const authHeaders = await getAuthHeaders();

      let res;
      if (existingListing) {
        res = await fetch(`/api/market/${existingListing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders },
          credentials: "include",
          body: JSON.stringify({
            addQuantity: sellQuantity,
            pricePerItem: sellPrice,
          }),
        });
      } else {
        res = await fetch("/api/market", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          credentials: "include",
          body: JSON.stringify({
            itemId: selectedItem.name,
            quantity: sellQuantity,
            pricePerItem: sellPrice,
          }),
        });
      }

      const data = await res.json();
      if (res.ok) {
        trackMarketSale();
        if (data.notification) {
          addNotification(data.notification.type, data.notification.message, data.notification.payload);
        }
        setSellDialogOpen(false);
        setSelectedItem(null);
        setExistingListing(null);
        setSellQuantity(1);
        setSellPrice(1);
        refetchGrouped();
        fetchMyListings();
        refreshPlayer();
      } else {
        toast({ title: t('error'), description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: t('error'), description: t('listingCreationFailed'), variant: "destructive" });
    }
  };

  const handleCancelListing = async (listingId: string) => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/market/${listingId}`, {
        method: "DELETE",
        credentials: "include",
        headers: authHeaders,
      });

      const data = await res.json();
      if (res.ok) {
        if (data.notification) {
          addNotification(data.notification.type, data.notification.message, data.notification.payload);
        }
        refetchGrouped();
        fetchMyListings();
        refreshPlayer();
      } else {
        toast({ title: t('error'), description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: t('error'), description: t('listingCancelFailed'), variant: "destructive" });
    }
  };

  const handleBuy = async () => {
    if (!selectedGroupItem) return;
    if (isBuying) return;

    // Enhanced (non-stackable) items must use single-seller single-unit flow
    const isEnhanced = selectedListing?.enhancementData &&
      (selectedListing.enhancementData.enhancementLevel ?? 0) > 0;

    setIsBuying(true);
    const startTime = Date.now();

    try {
      const authHeaders = await getAuthHeaders();
      let res: Response;

      if (isEnhanced && selectedListing) {
        // Single-listing buy for enhanced items
        res = await fetch(`/api/market/${selectedListing.id}/buy`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          credentials: "include",
          body: JSON.stringify({ quantity: 1 }),
        });
      } else {
        // Bulk buy across multiple sellers (cheapest-first)
        res = await fetch(`/api/market/bulk-buy`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          credentials: "include",
          body: JSON.stringify({ itemId: selectedGroupItem.itemId, quantity: buyQuantity }),
        });
      }

      const data = await res.json();

      // Ensure at least 1 second of loading state
      const elapsed = Date.now() - startTime;
      if (elapsed < 1000) {
        await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
      }

      if (res.ok) {
        const totalCost = data.totalCost ?? (isEnhanced && selectedListing ? selectedListing.pricePerItem : 0);
        trackMarketPurchase();
        trackGoldSpent(totalCost);
        playSfx('ui', 'buy');
        if (data.notification) {
          addNotification(data.notification.type, data.notification.message, data.notification.payload);
        }
        toast({
          title: "Purchase Complete",
          description: `${isEnhanced ? 1 : buyQuantity}x ${selectedGroupItem.itemId} — ${totalCost.toLocaleString()} gold`,
        });
        if (data.buyerGold !== undefined && data.buyerInventory !== undefined) {
          applyServerData({ gold: data.buyerGold, inventory: data.buyerInventory, itemModifications: data.buyerItemModifications });
        } else {
          refreshPlayer();
        }
        setSelectedListing(null);
        setBuyQuantity(1);
        await queryClient.invalidateQueries({ queryKey: ["market-item-listings"] });
        const groupedResult = await refetchGrouped();
        const updatedListings = await refetchItemListings();
        if (!updatedListings.data || updatedListings.data.length === 0) {
          setPurchasePopupOpen(false);
          setSelectedGroupItem(null);
        }
      } else {
        toast({ title: t('error'), description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: t('error'), description: t('purchaseFailed'), variant: "destructive" });
    } finally {
      setIsBuying(false);
    }
  };

  // Compute cheapest-first cost breakdown for the buy dialog (exclude buyer's own and enhanced listings)
  const bulkBuyBreakdown = (() => {
    if (!itemListings || itemListings.length === 0 || buyQuantity <= 0) {
      return { totalCost: 0, contributingListings: new Set<string>(), listingContributions: {} as Record<string, number>, eligibleTotal: 0 };
    }
    const eligibleListings = itemListings.filter((l) => {
      if (l.sellerId === player?.id) return false;
      if (l.enhancementData && (l.enhancementData.enhancementLevel ?? 0) > 0) return false;
      return true;
    });
    const eligibleTotal = eligibleListings.reduce((sum, l) => sum + l.quantity, 0);
    const sorted = [...eligibleListings].sort((a, b) => a.pricePerItem - b.pricePerItem);
    let remaining = buyQuantity;
    let totalCost = 0;
    const contributingListings = new Set<string>();
    const listingContributions: Record<string, number> = {};
    for (const listing of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(listing.quantity, remaining);
      totalCost += listing.pricePerItem * take;
      contributingListings.add(listing.id);
      listingContributions[listing.id] = take;
      remaining -= take;
    }
    return { totalCost, contributingListings, listingContributions, eligibleTotal };
  })();

  const tradableItems = Object.entries(inventory).filter(
    ([itemName]) => isItemTradable(itemName)
  );

  const matchesCategory = (itemName: string, category: string | null, subCategory: string | null, armorType: string | null): boolean => {
    if (!category) return true;
    const { baseId } = parseItemWithRarity(itemName);
    const item = getBaseItem(itemName);
    if (!item) return false;

    const idLower = baseId.toLowerCase();
    const nameLower = (item.name || '').toLowerCase();

    if (category === 'weapons') {
      if (item.type !== 'equipment' || item.equipSlot !== 'weapon') return false;
      if (subCategory && item.weaponCategory !== subCategory) return false;
      return true;
    }
    if (category === 'armor') {
      if (item.type !== 'equipment') return false;
      const armorSlots = ['helmet', 'body', 'legs', 'gloves', 'boots', 'shield', 'cape'];
      if (!item.equipSlot || !armorSlots.includes(item.equipSlot)) return false;
      if (subCategory && item.equipSlot !== subCategory) return false;
      if (armorType && item.armorType !== armorType) return false;
      return true;
    }
    if (category === 'accessories') {
      if (item.type !== 'equipment') return false;
      if (!item.equipSlot || !['ring', 'amulet'].includes(item.equipSlot)) return false;
      if (subCategory && item.equipSlot !== subCategory) return false;
      return true;
    }
    if (category === 'food') {
      return item.type === 'food';
    }
    if (category === 'fish') {
      return item.type === 'material' && idLower.startsWith('raw ') && !idLower.includes('chicken') && !idLower.includes('meat') && !idLower.includes('rabbit') && !idLower.includes('wyvern');
    }
    if (category === 'potions') return item.type === 'potion';
    if (category === 'materials') {
      if (item.type !== 'material') return false;
      const isRawFish = idLower.startsWith('raw ') && !idLower.includes('chicken') && !idLower.includes('meat') && !idLower.includes('rabbit') && !idLower.includes('wyvern');
      if (isRawFish) return false;
      if (subCategory === 'ore') return idLower.includes('ore') || nameLower.includes('ore');
      if (subCategory === 'bar') return idLower.includes('bar') || nameLower.includes('bar');
      if (subCategory === 'log') return idLower.includes('log') || nameLower.includes('log');
      if (subCategory === 'hide') return idLower.includes('hide') || nameLower.includes('hide');
      if (subCategory === 'other') return !idLower.includes('ore') && !nameLower.includes('ore') && !idLower.includes('bar') && !nameLower.includes('bar') && !idLower.includes('log') && !nameLower.includes('log') && !idLower.includes('hide') && !nameLower.includes('hide');
      return true;
    }
    return true;
  };

  const filteredTradableItems = tradableItems.filter(([itemName]) => {
    if (sellSearchQuery) {
      const { baseId } = parseItemWithRarity(itemName);
      const displayName = translateItemName(baseId, language).toLowerCase();
      if (!displayName.includes(sellSearchQuery.toLowerCase()) && !baseId.toLowerCase().includes(sellSearchQuery.toLowerCase())) return false;
    }
    return matchesCategory(itemName, sellCategoryFilter, sellSubCategoryFilter, sellArmorTypeFilter);
  });

  const filteredMyListings = myListings.filter((listing) => {
    if (!listingsSearchQuery) return true;
    const { baseId } = parseItemWithRarity(listing.itemId);
    const displayName = translateItemName(baseId, language).toLowerCase();
    return displayName.includes(listingsSearchQuery.toLowerCase()) || baseId.toLowerCase().includes(listingsSearchQuery.toLowerCase());
  });

  const totalPages = Math.min(Math.ceil((groupedData?.totalGroups || 0) / 20), 20);

  const handleOpenPurchasePopup = (group: GroupedItem) => {
    setSelectedGroupItem(group);
    setSelectedListing(null);
    setBuyQuantity(1);
    setPurchasePopupOpen(true);
  };

  const handleFilterClick = (filter: string) => {
    if (activeFilter === filter) {
      setActiveFilter(null);
      if (filter === "enhanced") {
        setEnhMinLevel(0);
        setEnhSkillFilter(null);
        setEnhStatFilter(null);
      }
    } else {
      setActiveFilter(filter);
    }
    setCurrentPage(1);
  };

  const renderPagination = () => {
    if (totalPages <= 1) return (
      totalPages === 1 ? (
        <div className="flex items-center justify-center mt-3 pt-2 border-t border-border/20 shrink-0">
          <span className="text-[10px] text-muted-foreground/50" data-testid="pagination-info">
            {language === 'tr' ? `Sayfa 1 / 1` : `Page 1 / 1`}
          </span>
        </div>
      ) : null
    );

    if (isMobile) {
      return (
        <div className="flex items-center justify-center gap-2 mt-1.5 pt-1.5 border-t border-border/20 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="min-w-[32px] min-h-[32px] h-8 w-8 p-0"
            data-testid="pagination-prev"
          >
            <CaretLeft className="w-4 h-4" />
          </Button>
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums" data-testid="pagination-info">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="min-w-[32px] min-h-[32px] h-8 w-8 p-0"
            data-testid="pagination-next"
          >
            <CaretRight className="w-4 h-4" />
          </Button>
        </div>
      );
    }

    const pages: (number | string)[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== "...") {
        pages.push("...");
      }
    }

    return (
      <div className="flex flex-col items-center gap-1.5 mt-4">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            data-testid="pagination-prev"
          >
            <CaretLeft className="w-4 h-4" />
          </Button>
          {pages.map((page, idx) =>
            typeof page === "number" ? (
              <Button
                key={idx}
                variant={page === currentPage ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(page)}
                data-testid={`pagination-page-${page}`}
                className="min-w-[32px]"
              >
                {page}
              </Button>
            ) : (
              <span key={idx} className="px-2 text-muted-foreground">
                ...
              </span>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            data-testid="pagination-next"
          >
            <CaretRight className="w-4 h-4" />
          </Button>
        </div>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums" data-testid="pagination-info">
          {language === 'tr' ? `Sayfa ${currentPage} / ${totalPages}` : `Page ${currentPage} / ${totalPages}`}
        </span>
      </div>
    );
  };

  const renderItemStats = (baseItem: ReturnType<typeof getBaseItem>, enhancementData?: any) => {
    if (!baseItem?.stats) return null;
    const enhLevel = (enhancementData && typeof enhancementData === 'object') ? (enhancementData.enhancementLevel || 0) : 0;
    const enhMultiplier = 1 + enhLevel * 0.05;
    const rawAddedStats = enhancementData?.addedStats;
    const addedStats = (rawAddedStats && typeof rawAddedStats === 'object' && !Array.isArray(rawAddedStats)) ? rawAddedStats : {};
    const STAT_MAP: Record<string, string> = {
      bonusAttack: 'attackBonus', bonusDefence: 'defenceBonus', bonusStrength: 'strengthBonus',
      bonusHitpoints: 'hitpointsBonus', accuracy: 'accuracyBonus',
    };
    let attackBonus = Math.floor((baseItem.stats.attackBonus || 0) * enhMultiplier);
    let strengthBonus = Math.floor((baseItem.stats.strengthBonus || 0) * enhMultiplier);
    let defenceBonus = Math.floor((baseItem.stats.defenceBonus || 0) * enhMultiplier);
    let accuracyBonus = Math.floor((baseItem.stats.accuracyBonus || 0) * enhMultiplier);
    let hitpointsBonus = Math.floor((baseItem.stats.hitpointsBonus || 0) * enhMultiplier);
    for (const [stat, value] of Object.entries(addedStats)) {
      const mapped = STAT_MAP[stat];
      if (mapped === 'attackBonus') attackBonus += (value as number);
      else if (mapped === 'strengthBonus') strengthBonus += (value as number);
      else if (mapped === 'defenceBonus') defenceBonus += (value as number);
      else if (mapped === 'accuracyBonus') accuracyBonus += (value as number);
      else if (mapped === 'hitpointsBonus') hitpointsBonus += (value as number);
    }
    const hasStats = attackBonus || strengthBonus || defenceBonus || accuracyBonus || hitpointsBonus;
    if (!hasStats) return null;

    return (
      <div className="grid grid-cols-2 gap-2 text-xs">
        {attackBonus ? (
          <div className="flex items-center gap-1.5 text-red-400">
            <Sword className="w-3.5 h-3.5" weight="fill" />
            <span>+{attackBonus} {t('attack')}</span>
          </div>
        ) : null}
        {strengthBonus ? (
          <div className="flex items-center gap-1.5 text-orange-400">
            <Lightning className="w-3.5 h-3.5" weight="fill" />
            <span>+{strengthBonus} {t('strength')}</span>
          </div>
        ) : null}
        {defenceBonus ? (
          <div className="flex items-center gap-1.5 text-blue-400">
            <Shield className="w-3.5 h-3.5" weight="fill" />
            <span>+{defenceBonus} {t('defence')}</span>
          </div>
        ) : null}
        {accuracyBonus ? (
          <div className="flex items-center gap-1.5 text-yellow-400">
            <Target className="w-3.5 h-3.5" weight="fill" />
            <span>+{accuracyBonus} {t('accuracy')}</span>
          </div>
        ) : null}
        {hitpointsBonus ? (
          <div className="flex items-center gap-1.5 text-green-400">
            <Heart className="w-3.5 h-3.5" weight="fill" />
            <span>+{hitpointsBonus} HP</span>
          </div>
        ) : null}
      </div>
    );
  };

  const renderEnhancementInfo = (enhancementData: any) => {
    if (!enhancementData || typeof enhancementData !== 'object') return null;
    const { enhancementLevel, addedStats, addedSkills } = enhancementData;
    const safeAddedStats = addedStats && typeof addedStats === 'object' && !Array.isArray(addedStats) ? addedStats : null;
    const safeAddedSkills = Array.isArray(addedSkills) ? addedSkills : null;
    const hasEnhancement = (enhancementLevel && enhancementLevel > 0) || 
      (safeAddedStats && Object.keys(safeAddedStats).length > 0) || 
      (safeAddedSkills && safeAddedSkills.length > 0);
    if (!hasEnhancement) return null;

    const STAT_LABELS: Record<string, { label: string; color: string }> = {
      bonusAttack: { label: 'ATK', color: 'text-red-400' },
      bonusStrength: { label: 'STR', color: 'text-orange-400' },
      bonusDefence: { label: 'DEF', color: 'text-blue-400' },
      bonusHitpoints: { label: 'HP', color: 'text-green-400' },
      accuracy: { label: 'ACC', color: 'text-yellow-400' },
      critChance: { label: 'CRIT%', color: 'text-pink-400' },
      critDamage: { label: 'CRIT DMG', color: 'text-rose-400' },
    };

    const SKILL_COLORS: Record<string, string> = {
      poison: 'bg-green-500/20 text-green-400',
      burn: 'bg-orange-500/20 text-orange-400',
      bleed: 'bg-red-500/20 text-red-400',
      stun: 'bg-yellow-500/20 text-yellow-400',
      freeze: 'bg-cyan-500/20 text-cyan-400',
      vampiric: 'bg-purple-500/20 text-purple-400',
      execute: 'bg-rose-500/20 text-rose-400',
      armor_pierce: 'bg-amber-500/20 text-amber-400',
    };

    return (
      <div className="space-y-1">
        {enhancementLevel > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold">
              +{enhancementLevel}
            </span>
          </div>
        )}
        {safeAddedStats && Object.keys(safeAddedStats).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(safeAddedStats).map(([key, value]) => {
              const info = STAT_LABELS[key] || { label: key, color: 'text-muted-foreground' };
              return (
                <span key={key} className={cn("text-[9px] px-1 py-0.5 rounded bg-muted/50", info.color)}>
                  +{value as number} {info.label}
                </span>
              );
            })}
          </div>
        )}
        {safeAddedSkills && safeAddedSkills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {safeAddedSkills.map((skillId: string) => (
              <span key={skillId} className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium capitalize", SKILL_COLORS[skillId] || 'bg-muted/50 text-muted-foreground')}>
                {skillId}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderWeaponSkills = (baseItem: ReturnType<typeof getBaseItem>) => {
    if (!baseItem?.weaponSkills || baseItem.weaponSkills.length === 0) return null;

    return (
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">{t('weaponSkillsLabel')}:</div>
        <div className="flex flex-wrap gap-1.5">
          {baseItem.weaponSkills.map((skill, idx) => (
            <div
              key={idx}
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1",
                skill.type === "poison" && "bg-green-500/20 text-green-400",
                skill.type === "stun" && "bg-yellow-500/20 text-yellow-400",
                skill.type === "critical" && "bg-red-500/20 text-red-400",
                skill.type === "lifesteal_burst" && "bg-purple-500/20 text-purple-400",
                skill.type === "combo" && "bg-blue-500/20 text-blue-400",
                skill.type === "armor_break" && "bg-orange-500/20 text-orange-400",
                skill.type === "slow_crit" && "bg-cyan-500/20 text-cyan-400"
              )}
            >
              {skill.type === "poison" && <Drop className="w-3 h-3" weight="fill" />}
              {skill.type === "stun" && <Lightning className="w-3 h-3" weight="fill" />}
              {skill.type === "lifesteal_burst" && <Skull className="w-3 h-3" weight="fill" />}
              {skill.name} ({skill.chance}%)
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={cn(
        isMobile 
          ? "h-[calc(100vh-10rem)] flex flex-col pb-20" 
          : "h-[calc(100vh-8rem)] overflow-y-auto"
      )}>
        <div className={cn(isMobile ? "flex-1 flex flex-col p-3 min-h-0" : "space-y-4 p-4")}>
          <Card className={cn("bg-card/40 backdrop-blur-sm border-border/30 shadow-lg", isMobile && "flex-1 flex flex-col min-h-0")}>
            {!isMobile && (
              <CardHeader className="border-b border-border/20 bg-muted/10 py-3">
                <CardTitle className="flex items-center gap-3 font-display text-lg">
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2">
                    <Storefront className="w-5 h-5 text-amber-400" weight="bold" />
                  </div>
                  {t('marketplace')}
                  <div className="ml-auto text-sm font-normal">
                    <GoldDisplay amount={goldBalance} size="sm" />
                  </div>
                </CardTitle>
              </CardHeader>
            )}
            <CardContent className={cn(isMobile ? "pt-3 px-2 flex-1 flex flex-col min-h-0" : "pt-4")}>
              <Tabs value={activeTab} onValueChange={setActiveTab} className={cn(isMobile && "flex-1 flex flex-col min-h-0")}>
                <div className={cn(isMobile ? "mb-3" : "mb-4")}>
                  <TabsList className={cn(
                    "w-full grid grid-cols-5 p-0.5 bg-background/40 backdrop-blur-sm border border-border/20",
                    isMobile ? "h-9 rounded-lg" : "h-12 rounded-xl"
                  )}>
                    <TabsTrigger 
                      value="browse" 
                      data-testid="tab-browse"
                      className={cn(
                        "flex items-center justify-center gap-1 font-medium transition-all",
                        isMobile ? "rounded-md h-8 text-[10px]" : "rounded-lg h-10 text-xs gap-1.5",
                        "data-[state=active]:bg-amber-500 data-[state=active]:text-black data-[state=active]:shadow-sm",
                        "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/60"
                      )}
                    >
                      <ShoppingCart className={cn(isMobile ? "w-3 h-3" : "w-3.5 h-3.5")} weight="bold" />
                      <span className={isMobile ? "hidden sm:inline" : ""}>{t('browseFull')}</span>
                      <span className={isMobile ? "sm:hidden" : "hidden"}>Buy</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="sell" 
                      data-testid="tab-sell"
                      className={cn(
                        "flex items-center justify-center gap-1 font-medium transition-all",
                        isMobile ? "rounded-md h-8 text-[10px]" : "rounded-lg h-10 text-xs gap-1.5",
                        "data-[state=active]:bg-green-500 data-[state=active]:text-black data-[state=active]:shadow-sm",
                        "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/60"
                      )}
                    >
                      <Tag className={cn(isMobile ? "w-3 h-3" : "w-3.5 h-3.5")} weight="bold" />
                      <span>{t('sellTab')}</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="my-listings" 
                      data-testid="tab-my-listings"
                      className={cn(
                        "flex items-center justify-center gap-1 font-medium transition-all",
                        isMobile ? "rounded-md h-8 text-[10px]" : "rounded-lg h-10 text-xs gap-1.5",
                        "data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-sm",
                        "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/60"
                      )}
                    >
                      <Package className={cn(isMobile ? "w-3 h-3" : "w-3.5 h-3.5")} weight="bold" />
                      <span className={isMobile ? "hidden sm:inline" : ""}>{t('myListings')}</span>
                      <span className={isMobile ? "sm:hidden" : "hidden"}>Mine</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="buy-orders" 
                      data-testid="tab-buy-orders"
                      className={cn(
                        "flex items-center justify-center gap-1 font-medium transition-all",
                        isMobile ? "rounded-md h-8 text-[10px]" : "rounded-lg h-10 text-xs gap-1.5",
                        "data-[state=active]:bg-purple-500 data-[state=active]:text-white data-[state=active]:shadow-sm",
                        "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/60"
                      )}
                    >
                      <BookmarkSimple className={cn(isMobile ? "w-3 h-3" : "w-3.5 h-3.5")} weight="bold" />
                      <span className={isMobile ? "hidden sm:inline" : ""}>{t('buyOrdersTab')}</span>
                      <span className={isMobile ? "sm:hidden" : "hidden"}>Orders</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="history" 
                      data-testid="tab-history"
                      className={cn(
                        "flex items-center justify-center gap-1 font-medium transition-all",
                        isMobile ? "rounded-md h-8 text-[10px]" : "rounded-lg h-10 text-xs gap-1.5",
                        "data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm",
                        "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/60"
                      )}
                    >
                      <ArrowUp className={cn(isMobile ? "w-3 h-3" : "w-3.5 h-3.5")} weight="bold" />
                      <span className={isMobile ? "hidden sm:inline" : ""}>History</span>
                      <span className={isMobile ? "sm:hidden" : "hidden"}>Hist</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="browse" className={cn(isMobile && "flex-1 flex flex-col min-h-0")}>
                  <div className={cn(
                    "z-10 bg-card/80 backdrop-blur-sm -mx-1 px-1 shrink-0",
                    isMobile ? "pb-1.5 space-y-1.5" : "sticky top-0 pb-3 space-y-3"
                  )}>
                    {isMobile ? (
                      <>
                        <div className="flex gap-1.5">
                          <Input
                            placeholder={t('searchItems')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            data-testid="search-input"
                            className="h-8 text-xs border-border/30 bg-background/50 flex-1"
                          />
                        </div>
                        <div className="flex gap-1.5 items-center">
                          <select
                            value={categoryFilter || ""}
                            onChange={(e) => {
                              const val = e.target.value || null;
                              setCategoryFilter(val as any);
                              setSubCategoryFilter(null);
                              setArmorTypeFilter(null);
                              setCurrentPage(1);
                            }}
                            data-testid="category-select"
                            className="h-7 rounded-md border border-border/30 bg-background/50 text-[10px] text-foreground px-1.5 flex-1 min-w-0 appearance-none"
                          >
                            <option value="">{t('marketAllItems' as any)}</option>
                            <option value="weapons">{t('marketWeapons' as any)}</option>
                            <option value="armor">{t('marketArmor' as any)}</option>
                            <option value="accessories">{t('marketAccessories' as any)}</option>
                            <option value="food">{t('marketFood' as any)}</option>
                            <option value="fish">{t('marketFish' as any)}</option>
                            <option value="potions">{t('marketPotions' as any)}</option>
                            <option value="materials">{t('marketMaterials' as any)}</option>
                          </select>

                          {categoryFilter === "weapons" && (
                            <select
                              value={subCategoryFilter || ""}
                              onChange={(e) => { setSubCategoryFilter(e.target.value || null); setCurrentPage(1); }}
                              data-testid="subcategory-select"
                              className="h-7 rounded-md border border-red-500/30 bg-background/50 text-[10px] text-foreground px-1.5 flex-1 min-w-0 appearance-none"
                            >
                              <option value="">{t('marketAllItems' as any)}</option>
                              <option value="sword">{t('marketSword' as any)}</option>
                              <option value="dagger">{t('marketDagger' as any)}</option>
                              <option value="axe">{t('marketAxe' as any)}</option>
                              <option value="bow">{t('marketBow' as any)}</option>
                              <option value="staff">{t('marketStaff' as any)}</option>
                              <option value="hammer">{t('marketHammer' as any)}</option>
                              <option value="2h_sword">{t('market2hSword' as any)}</option>
                              <option value="2h_axe">{t('market2hAxe' as any)}</option>
                              <option value="2h_warhammer">{t('market2hWarhammer' as any)}</option>
                            </select>
                          )}

                          {categoryFilter === "armor" && (
                            <>
                              <select
                                value={subCategoryFilter || ""}
                                onChange={(e) => { setSubCategoryFilter(e.target.value || null); setCurrentPage(1); }}
                                data-testid="subcategory-select"
                                className="h-7 rounded-md border border-blue-500/30 bg-background/50 text-[10px] text-foreground px-1.5 flex-1 min-w-0 appearance-none"
                              >
                                <option value="">{t('marketSlot' as any)}</option>
                                <option value="helmet">{t('marketHelmet' as any)}</option>
                                <option value="body">{t('marketBody' as any)}</option>
                                <option value="legs">{t('marketLegs' as any)}</option>
                                <option value="gloves">{t('marketGloves' as any)}</option>
                                <option value="boots">{t('marketBoots' as any)}</option>
                                <option value="shield">{t('marketShield' as any)}</option>
                                <option value="cape">{t('marketCape' as any)}</option>
                              </select>
                              <select
                                value={armorTypeFilter || ""}
                                onChange={(e) => { setArmorTypeFilter(e.target.value || null); setCurrentPage(1); }}
                                data-testid="armortype-select"
                                className="h-7 rounded-md border border-teal-500/30 bg-background/50 text-[10px] text-foreground px-1.5 flex-1 min-w-0 appearance-none"
                              >
                                <option value="">{t('marketMaterial' as any)}</option>
                                <option value="plate">{t('marketPlate' as any)}</option>
                                <option value="leather">{t('marketLeather' as any)}</option>
                                <option value="cloth">{t('marketCloth' as any)}</option>
                              </select>
                            </>
                          )}

                          {categoryFilter === "accessories" && (
                            <select
                              value={subCategoryFilter || ""}
                              onChange={(e) => { setSubCategoryFilter(e.target.value || null); setCurrentPage(1); }}
                              data-testid="subcategory-select"
                              className="h-7 rounded-md border border-purple-500/30 bg-background/50 text-[10px] text-foreground px-1.5 flex-1 min-w-0 appearance-none"
                            >
                              <option value="">{t('marketAllItems' as any)}</option>
                              <option value="ring">{t('marketRing' as any)}</option>
                              <option value="amulet">{t('marketAmulet' as any)}</option>
                            </select>
                          )}

                          {categoryFilter === "materials" && (
                            <select
                              value={subCategoryFilter || ""}
                              onChange={(e) => { setSubCategoryFilter(e.target.value || null); setCurrentPage(1); }}
                              data-testid="subcategory-select"
                              className="h-7 rounded-md border border-emerald-500/30 bg-background/50 text-[10px] text-foreground px-1.5 flex-1 min-w-0 appearance-none"
                            >
                              <option value="">{t('marketAllItems' as any)}</option>
                              <option value="ore">{t('marketOre' as any)}</option>
                              <option value="bar">{t('marketBar' as any)}</option>
                              <option value="log">{t('marketLog' as any)}</option>
                              <option value="hide">{t('marketHide' as any)}</option>
                              <option value="other">{t('marketOther' as any)}</option>
                            </select>
                          )}

                          <select
                            value={activeFilter || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val) {
                                handleFilterClick(val);
                              } else {
                                setActiveFilter(null);
                                setEnhMinLevel(0);
                                setEnhSkillFilter(null);
                                setEnhStatFilter(null);
                                setCurrentPage(1);
                              }
                            }}
                            data-testid="sort-select"
                            className="h-7 rounded-md border border-border/30 bg-background/50 text-[10px] text-foreground px-1.5 min-w-[70px] appearance-none"
                          >
                            <option value="">{language === 'tr' ? 'Sırala' : 'Sort'}</option>
                            <option value="cheapest">{t('cheapest')}</option>
                            <option value="newest">{t('newest')}</option>
                            <option value="rarePlus">{t('rarePlus')}</option>
                            <option value="enhanced">{t('enhanced')}</option>
                          </select>
                          {isAdmin && (
                            <button
                              onClick={() => { setUserOnly(!userOnly); setCurrentPage(1); }}
                              className={cn(
                                "h-7 px-1.5 rounded-md border text-[10px]",
                                userOnly ? "bg-orange-600 border-orange-500 text-white" : "border-border/30 text-muted-foreground"
                              )}
                              data-testid="filter-user-only"
                            >
                              U
                            </button>
                          )}
                        </div>

                        {activeFilter === "enhanced" && (
                          <div className="p-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/5 space-y-1 text-[10px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-cyan-400 font-medium">+</span>
                              {[0, 1, 3, 5, 7, 10].map((level) => (
                                <button
                                  key={level}
                                  onClick={() => { setEnhMinLevel(level); setCurrentPage(1); }}
                                  className={cn(
                                    "px-1 py-0.5 rounded border min-w-[24px]",
                                    enhMinLevel === level ? "bg-cyan-600 border-cyan-500 text-white" : "border-border/30 text-muted-foreground"
                                  )}
                                  data-testid={`enh-level-${level}`}
                                >
                                  {level === 0 ? "All" : `+${level}`}
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-cyan-400 font-medium">Skill</span>
                              <select
                                value={enhSkillFilter || ""}
                                onChange={(e) => { setEnhSkillFilter(e.target.value || null); setCurrentPage(1); }}
                                className="h-6 rounded border border-border/30 bg-background/50 text-[10px] text-foreground px-1 flex-1"
                              >
                                <option value="">All</option>
                                <option value="poison">Poison</option>
                                <option value="burn">Burn</option>
                                <option value="bleed">Bleed</option>
                                <option value="stun">Stun</option>
                                <option value="freeze">Freeze</option>
                                <option value="vampiric">Vampiric</option>
                                <option value="execute">Execute</option>
                                <option value="armor_pierce">A.Pierce</option>
                              </select>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-cyan-400 font-medium">Stat</span>
                              <select
                                value={enhStatFilter || ""}
                                onChange={(e) => { setEnhStatFilter(e.target.value || null); setCurrentPage(1); }}
                                className="h-6 rounded border border-border/30 bg-background/50 text-[10px] text-foreground px-1 flex-1"
                              >
                                <option value="">All</option>
                                <option value="bonusAttack">ATK</option>
                                <option value="bonusStrength">STR</option>
                                <option value="bonusDefence">DEF</option>
                                <option value="bonusHitpoints">HP</option>
                                <option value="accuracy">ACC</option>
                                <option value="critChance">CRIT%</option>
                                <option value="critDamage">CRIT DMG</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <Input
                          placeholder={t('searchItems')}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          data-testid="search-input"
                          className="h-11 border-border/30 bg-background/50"
                        />
                        <div className="flex gap-1 flex-wrap">
                          {([
                            { key: null, label: 'marketAllItems', icon: Package },
                            { key: 'weapons', label: 'marketWeapons', icon: Sword },
                            { key: 'armor', label: 'marketArmor', icon: Shield },
                            { key: 'accessories', label: 'marketAccessories', icon: Diamond },
                            { key: 'food', label: 'marketFood', icon: Cookie },
                            { key: 'fish', label: 'marketFish', icon: Fish },
                            { key: 'potions', label: 'marketPotions', icon: Flask },
                            { key: 'materials', label: 'marketMaterials', icon: Cube },
                          ] as const).map(({ key, label, icon: Icon }) => (
                            <button
                              key={label}
                              onClick={() => {
                                setCategoryFilter(prev => prev === key ? null : key);
                                setSubCategoryFilter(null);
                                setArmorTypeFilter(null);
                                setCurrentPage(1);
                              }}
                              data-testid={`category-${key ?? 'all'}`}
                              className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded-md border transition-all duration-200 text-xs",
                                categoryFilter === key
                                  ? "bg-amber-600 border-amber-500 text-white shadow-[0_0_8px_rgba(245,158,11,0.3)]"
                                  : "border-border/30 text-muted-foreground hover:border-amber-500/40 hover:text-foreground bg-background/30"
                              )}
                            >
                              <Icon className="w-3.5 h-3.5" weight={categoryFilter === key ? "fill" : "regular"} />
                              {t(label as any)}
                            </button>
                          ))}
                        </div>

                        {categoryFilter === "weapons" && (
                          <div className="flex gap-1 flex-wrap pl-1 border-l-2 border-amber-500/30 ml-2">
                            {([
                              { key: 'sword', label: 'marketSword' },
                              { key: 'dagger', label: 'marketDagger' },
                              { key: 'axe', label: 'marketAxe' },
                              { key: 'bow', label: 'marketBow' },
                              { key: 'staff', label: 'marketStaff' },
                              { key: 'hammer', label: 'marketHammer' },
                              { key: '2h_sword', label: 'market2hSword' },
                              { key: '2h_axe', label: 'market2hAxe' },
                              { key: '2h_warhammer', label: 'market2hWarhammer' },
                            ] as const).map(({ key, label }) => (
                              <button
                                key={key}
                                onClick={() => { setSubCategoryFilter(prev => prev === key ? null : key); setCurrentPage(1); }}
                                data-testid={`weapon-${key}`}
                                className={cn(
                                  "px-1.5 py-0.5 rounded border transition-colors text-xs",
                                  subCategoryFilter === key
                                    ? "bg-red-600 border-red-500 text-white"
                                    : "border-border/30 text-muted-foreground hover:border-red-500/50"
                                )}
                              >
                                {t(label as any)}
                              </button>
                            ))}
                          </div>
                        )}

                        {categoryFilter === "armor" && (
                          <div className="space-y-1.5">
                            <div className="flex gap-1 flex-wrap items-center pl-1 border-l-2 border-amber-500/30 ml-2">
                              <span className="text-amber-400 font-medium shrink-0 text-[11px]">{t('marketSlot' as any)}</span>
                              {([
                                { key: 'helmet', label: 'marketHelmet' },
                                { key: 'body', label: 'marketBody' },
                                { key: 'legs', label: 'marketLegs' },
                                { key: 'gloves', label: 'marketGloves' },
                                { key: 'boots', label: 'marketBoots' },
                                { key: 'shield', label: 'marketShield' },
                                { key: 'cape', label: 'marketCape' },
                              ] as const).map(({ key, label }) => (
                                <button
                                  key={key}
                                  onClick={() => { setSubCategoryFilter(prev => prev === key ? null : key); setCurrentPage(1); }}
                                  data-testid={`armor-slot-${key}`}
                                  className={cn(
                                    "px-1.5 py-0.5 rounded border transition-colors text-xs",
                                    subCategoryFilter === key
                                      ? "bg-blue-600 border-blue-500 text-white"
                                      : "border-border/30 text-muted-foreground hover:border-blue-500/50"
                                  )}
                                >
                                  {t(label as any)}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-1 flex-wrap items-center pl-1 border-l-2 border-amber-500/30 ml-2">
                              <span className="text-amber-400 font-medium shrink-0 text-[11px]">{t('marketMaterial' as any)}</span>
                              {([
                                { key: 'plate', label: 'marketPlate' },
                                { key: 'leather', label: 'marketLeather' },
                                { key: 'cloth', label: 'marketCloth' },
                              ] as const).map(({ key, label }) => (
                                <button
                                  key={key}
                                  onClick={() => { setArmorTypeFilter(prev => prev === key ? null : key); setCurrentPage(1); }}
                                  data-testid={`armor-type-${key}`}
                                  className={cn(
                                    "px-1.5 py-0.5 rounded border transition-colors text-xs",
                                    armorTypeFilter === key
                                      ? "bg-teal-600 border-teal-500 text-white"
                                      : "border-border/30 text-muted-foreground hover:border-teal-500/50"
                                  )}
                                >
                                  {t(label as any)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {categoryFilter === "accessories" && (
                          <div className="flex gap-1 flex-wrap pl-1 border-l-2 border-amber-500/30 ml-2">
                            {([
                              { key: 'ring', label: 'marketRing' },
                              { key: 'amulet', label: 'marketAmulet' },
                            ] as const).map(({ key, label }) => (
                              <button
                                key={key}
                                onClick={() => { setSubCategoryFilter(prev => prev === key ? null : key); setCurrentPage(1); }}
                                data-testid={`accessory-${key}`}
                                className={cn(
                                  "px-1.5 py-0.5 rounded border transition-colors text-xs",
                                  subCategoryFilter === key
                                    ? "bg-purple-600 border-purple-500 text-white"
                                    : "border-border/30 text-muted-foreground hover:border-purple-500/50"
                                )}
                              >
                                {t(label as any)}
                              </button>
                            ))}
                          </div>
                        )}

                        {categoryFilter === "materials" && (
                          <div className="flex gap-1 flex-wrap pl-1 border-l-2 border-amber-500/30 ml-2">
                            {([
                              { key: 'ore', label: 'marketOre' },
                              { key: 'bar', label: 'marketBar' },
                              { key: 'log', label: 'marketLog' },
                              { key: 'hide', label: 'marketHide' },
                              { key: 'other', label: 'marketOther' },
                            ] as const).map(({ key, label }) => (
                              <button
                                key={key}
                                onClick={() => { setSubCategoryFilter(prev => prev === key ? null : key); setCurrentPage(1); }}
                                data-testid={`material-${key}`}
                                className={cn(
                                  "px-1.5 py-0.5 rounded border transition-colors text-xs",
                                  subCategoryFilter === key
                                    ? "bg-emerald-600 border-emerald-500 text-white"
                                    : "border-border/30 text-muted-foreground hover:border-emerald-500/50"
                                )}
                              >
                                {t(label as any)}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-1.5 flex-wrap">
                          <Button
                            variant={activeFilter === "cheapest" ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleFilterClick("cheapest")}
                            className={cn("h-8 text-xs border-border/30", activeFilter === "cheapest" && "bg-green-600 hover:bg-green-700")}
                            data-testid="filter-cheapest"
                          >
                            {t('cheapest')}
                          </Button>
                          <Button
                            variant={activeFilter === "newest" ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleFilterClick("newest")}
                            className={cn("h-8 text-xs border-border/30", activeFilter === "newest" && "bg-blue-600 hover:bg-blue-700")}
                            data-testid="filter-newest"
                          >
                            {t('newest')}
                          </Button>
                          <Button
                            variant={activeFilter === "rarePlus" ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleFilterClick("rarePlus")}
                            className={cn("h-8 text-xs border-border/30", activeFilter === "rarePlus" && "bg-purple-600 hover:bg-purple-700")}
                            data-testid="filter-rare"
                          >
                            {t('rarePlus')}
                          </Button>
                          <Button
                            variant={activeFilter === "enhanced" ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleFilterClick("enhanced")}
                            className={cn("h-8 text-xs border-border/30", activeFilter === "enhanced" && "bg-cyan-600 hover:bg-cyan-700")}
                            data-testid="filter-enhanced"
                          >
                            {t('enhanced')}
                            {activeFilter === "enhanced" && (enhMinLevel > 0 || enhSkillFilter || enhStatFilter) && (
                              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-white inline-block" />
                            )}
                          </Button>
                          {isAdmin && (
                            <Button
                              variant={userOnly ? "default" : "outline"}
                              size="sm"
                              onClick={() => { setUserOnly(!userOnly); setCurrentPage(1); }}
                              className={cn("h-8 text-xs border-border/30", userOnly && "bg-orange-600 hover:bg-orange-700")}
                              data-testid="filter-user-only"
                            >
                              User Items
                            </Button>
                          )}
                        </div>

                        {activeFilter === "enhanced" && (
                          <div className="mt-2 p-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 space-y-2 text-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-cyan-400 font-medium shrink-0">Min +</span>
                              <div className="flex gap-1 flex-wrap">
                                {[0, 1, 3, 5, 7, 10].map((level) => (
                                  <button
                                    key={level}
                                    onClick={() => { setEnhMinLevel(level); setCurrentPage(1); }}
                                    className={cn(
                                      "px-1.5 py-0.5 rounded border transition-colors min-w-[32px]",
                                      enhMinLevel === level
                                        ? "bg-cyan-600 border-cyan-500 text-white"
                                        : "border-border/30 text-muted-foreground hover:border-cyan-500/50"
                                    )}
                                    data-testid={`enh-level-${level}`}
                                  >
                                    {level === 0 ? "All" : `+${level}`}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-cyan-400 font-medium shrink-0">Skill</span>
                              <div className="flex gap-1 flex-wrap">
                                <button
                                  onClick={() => { setEnhSkillFilter(null); setCurrentPage(1); }}
                                  className={cn(
                                    "px-1.5 py-0.5 rounded border transition-colors",
                                    !enhSkillFilter ? "bg-cyan-600 border-cyan-500 text-white" : "border-border/30 text-muted-foreground hover:border-cyan-500/50"
                                  )}
                                  data-testid="enh-skill-all"
                                >
                                  All
                                </button>
                                {[
                                  { id: "poison", label: "Poison", color: "text-green-400" },
                                  { id: "burn", label: "Burn", color: "text-orange-400" },
                                  { id: "bleed", label: "Bleed", color: "text-red-400" },
                                  { id: "stun", label: "Stun", color: "text-yellow-400" },
                                  { id: "freeze", label: "Freeze", color: "text-cyan-300" },
                                  { id: "vampiric", label: "Vampiric", color: "text-purple-400" },
                                  { id: "execute", label: "Execute", color: "text-rose-400" },
                                  { id: "armor_pierce", label: "A.Pierce", color: "text-amber-400" },
                                ].map((skill) => (
                                  <button
                                    key={skill.id}
                                    onClick={() => { setEnhSkillFilter(enhSkillFilter === skill.id ? null : skill.id); setCurrentPage(1); }}
                                    className={cn(
                                      "px-1.5 py-0.5 rounded border transition-colors",
                                      enhSkillFilter === skill.id
                                        ? "bg-cyan-600 border-cyan-500 text-white"
                                        : cn("border-border/30 hover:border-cyan-500/50", skill.color)
                                    )}
                                    data-testid={`enh-skill-${skill.id}`}
                                  >
                                    {skill.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-cyan-400 font-medium shrink-0">Stat</span>
                              <div className="flex gap-1 flex-wrap">
                                <button
                                  onClick={() => { setEnhStatFilter(null); setCurrentPage(1); }}
                                  className={cn(
                                    "px-1.5 py-0.5 rounded border transition-colors",
                                    !enhStatFilter ? "bg-cyan-600 border-cyan-500 text-white" : "border-border/30 text-muted-foreground hover:border-cyan-500/50"
                                  )}
                                  data-testid="enh-stat-all"
                                >
                                  All
                                </button>
                                {[
                                  { id: "bonusAttack", label: "ATK", color: "text-red-400" },
                                  { id: "bonusStrength", label: "STR", color: "text-orange-400" },
                                  { id: "bonusDefence", label: "DEF", color: "text-blue-400" },
                                  { id: "bonusHitpoints", label: "HP", color: "text-green-400" },
                                  { id: "accuracy", label: "ACC", color: "text-yellow-400" },
                                  { id: "critChance", label: "CRIT%", color: "text-pink-400" },
                                  { id: "critDamage", label: "CRIT DMG", color: "text-rose-400" },
                                ].map((stat) => (
                                  <button
                                    key={stat.id}
                                    onClick={() => { setEnhStatFilter(enhStatFilter === stat.id ? null : stat.id); setCurrentPage(1); }}
                                    className={cn(
                                      "px-1.5 py-0.5 rounded border transition-colors",
                                      enhStatFilter === stat.id
                                        ? "bg-cyan-600 border-cyan-500 text-white"
                                        : cn("border-border/30 hover:border-cyan-500/50", stat.color)
                                    )}
                                    data-testid={`enh-stat-${stat.id}`}
                                  >
                                    {stat.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <ScrollArea className={cn(isMobile ? "flex-1 min-h-0" : "h-[480px]")}>
                    {groupedLoading ? (
                      <div className="flex items-center justify-center h-32">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : groupedError ? (
                      <div className="text-center text-destructive py-6">
                        <p className="mb-2 text-sm">{t('error')}</p>
                        <Button variant="outline" size="sm" onClick={() => refetchGrouped()} className="border-border/30">
                          {t('retry')}
                        </Button>
                      </div>
                    ) : !groupedData?.groups || groupedData.groups.length === 0 ? (
                      <div className="text-center text-muted-foreground py-6 text-sm">
                        {t('noListingsFound')}
                      </div>
                    ) : (
                      <div className={cn(
                        "grid gap-2 p-1",
                        isMobile ? "grid-cols-3" : "grid-cols-4 lg:grid-cols-5"
                      )}>
                        {groupedData.groups.map((group) => {
                          const { baseId, rarity } = parseItemWithRarity(group.itemId);
                          const itemImg = getItemImage(group.itemId);
                          const glowClass = rarity && rarity !== "Common" ? RARITY_GLOW[rarity] : "";
                          const enhLevel = group.latestListing.enhancementData && (group.latestListing.enhancementData as any).enhancementLevel > 0
                            ? (group.latestListing.enhancementData as any).enhancementLevel : 0;
                          
                          return (
                            <div
                              key={group.itemId}
                              onClick={() => handleOpenPurchasePopup(group)}
                              className={cn(
                                "relative flex flex-col items-center rounded-lg border transition-all duration-200 cursor-pointer group",
                                "hover:scale-[1.03] hover:z-10 active:scale-[0.97]",
                                isMobile ? "p-1.5 gap-1" : "p-2.5 gap-1.5",
                                glowClass,
                                rarity && rarity !== "Common" 
                                  ? RARITY_BG_COLORS[rarity] 
                                  : "bg-muted/15 border-border/20 hover:border-border/40"
                              )}
                              data-testid={`market-item-${group.itemId.toLowerCase().replace(/\s+/g, "-")}`}
                            >
                              {enhLevel > 0 && (
                                <div className="absolute top-1 left-1 bg-cyan-500/90 text-white text-[9px] font-bold px-1 py-0.5 rounded leading-none">
                                  +{enhLevel}
                                </div>
                              )}
                              {rarity && rarity !== "Common" && (
                                <div className={cn(
                                  "absolute top-1 right-1 text-[8px] font-bold px-1 py-0.5 rounded leading-none opacity-80",
                                  rarity === "Uncommon" && "bg-green-500/20 text-green-400",
                                  rarity === "Rare" && "bg-blue-500/20 text-blue-400",
                                  rarity === "Epic" && "bg-purple-500/20 text-purple-400",
                                  rarity === "Legendary" && "bg-amber-500/20 text-amber-400",
                                  rarity === "Mythic" && "bg-red-500/20 text-red-400"
                                )}>
                                  {rarity.charAt(0)}
                                </div>
                              )}

                              <div className={cn(
                                "rounded-lg flex items-center justify-center",
                                "bg-black/30 border border-border/10",
                                isMobile ? "w-12 h-12" : "w-14 h-14"
                              )}>
                                {itemImg ? (
                                  <img src={itemImg} alt={baseId} loading="lazy" className={cn("object-contain pixelated", isMobile ? "w-10 h-10" : "w-12 h-12")} />
                                ) : (
                                  <Package className={cn("text-muted-foreground", isMobile ? "w-6 h-6" : "w-7 h-7")} />
                                )}
                              </div>

                              <div className="w-full text-center min-w-0">
                                <div className={cn(
                                  "font-medium truncate leading-tight",
                                  isMobile ? "text-[10px]" : "text-xs",
                                  rarity && rarity !== "Common" ? RARITY_COLORS[rarity] : "text-foreground/90"
                                )}>
                                  {translateItemName(baseId, language)}
                                </div>
                              </div>

                              <div className="w-full flex items-center justify-center">
                                <GoldDisplay amount={group.lowestPrice} size="xs" />
                              </div>

                              <div className={cn(
                                "flex items-center gap-0.5 text-muted-foreground/60",
                                isMobile ? "text-[8px]" : "text-[10px]"
                              )}>
                                <Users className="w-2.5 h-2.5" />
                                {group.listingCount}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                  {renderPagination()}
                </TabsContent>

                <TabsContent value="sell" className={cn(isMobile && "flex-1 flex flex-col min-h-0")}>
                  <div className={cn(
                    "z-10 bg-card/80 backdrop-blur-sm -mx-1 px-1 shrink-0",
                    isMobile ? "pb-1.5 space-y-1.5" : "pb-3 space-y-2"
                  )}>
                    <Input
                      placeholder={t('searchItems')}
                      value={sellSearchQuery}
                      onChange={(e) => setSellSearchQuery(e.target.value)}
                      data-testid="sell-search-input"
                      className={cn("border-border/30 bg-background/50", isMobile ? "h-8 text-xs" : "h-11")}
                    />
                    <div className="flex gap-1 flex-wrap">
                      {([
                        { key: null, label: 'marketAllItems', icon: Package },
                        { key: 'weapons', label: 'marketWeapons', icon: Sword },
                        { key: 'armor', label: 'marketArmor', icon: Shield },
                        { key: 'accessories', label: 'marketAccessories', icon: Diamond },
                        { key: 'food', label: 'marketFood', icon: Cookie },
                        { key: 'fish', label: 'marketFish', icon: Fish },
                        { key: 'potions', label: 'marketPotions', icon: Flask },
                        { key: 'materials', label: 'marketMaterials', icon: Cube },
                      ] as const).map(({ key, label, icon: Icon }) => (
                        <button
                          key={label}
                          onClick={() => {
                            setSellCategoryFilter(prev => prev === key ? null : key);
                            setSellSubCategoryFilter(null);
                            setSellArmorTypeFilter(null);
                          }}
                          data-testid={`sell-category-${key ?? 'all'}`}
                          className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded-md border transition-all duration-200 text-xs",
                            sellCategoryFilter === key
                              ? "bg-green-600 border-green-500 text-white shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                              : "border-border/30 text-muted-foreground hover:border-green-500/40 hover:text-foreground bg-background/30"
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" weight={sellCategoryFilter === key ? "fill" : "regular"} />
                          {t(label as any)}
                        </button>
                      ))}
                    </div>

                    {sellCategoryFilter === "weapons" && (
                      <div className="flex gap-1 flex-wrap pl-1 border-l-2 border-green-500/30 ml-2">
                        {([
                          { key: 'sword', label: 'marketSword' },
                          { key: 'dagger', label: 'marketDagger' },
                          { key: 'axe', label: 'marketAxe' },
                          { key: 'bow', label: 'marketBow' },
                          { key: 'staff', label: 'marketStaff' },
                          { key: 'hammer', label: 'marketHammer' },
                          { key: '2h_sword', label: 'market2hSword' },
                          { key: '2h_axe', label: 'market2hAxe' },
                          { key: '2h_warhammer', label: 'market2hWarhammer' },
                        ] as const).map(({ key, label }) => (
                          <button
                            key={key}
                            onClick={() => setSellSubCategoryFilter(prev => prev === key ? null : key)}
                            data-testid={`sell-weapon-${key}`}
                            className={cn(
                              "px-1.5 py-0.5 rounded border transition-colors text-xs",
                              sellSubCategoryFilter === key
                                ? "bg-red-600 border-red-500 text-white"
                                : "border-border/30 text-muted-foreground hover:border-red-500/50"
                            )}
                          >
                            {t(label as any)}
                          </button>
                        ))}
                      </div>
                    )}

                    {sellCategoryFilter === "armor" && (
                      <div className="space-y-1.5">
                        <div className="flex gap-1 flex-wrap items-center pl-1 border-l-2 border-green-500/30 ml-2">
                          <span className="text-green-400 font-medium shrink-0 text-[11px]">{t('marketSlot' as any)}</span>
                          {([
                            { key: 'helmet', label: 'marketHelmet' },
                            { key: 'body', label: 'marketBody' },
                            { key: 'legs', label: 'marketLegs' },
                            { key: 'gloves', label: 'marketGloves' },
                            { key: 'boots', label: 'marketBoots' },
                            { key: 'shield', label: 'marketShield' },
                            { key: 'cape', label: 'marketCape' },
                          ] as const).map(({ key, label }) => (
                            <button
                              key={key}
                              onClick={() => setSellSubCategoryFilter(prev => prev === key ? null : key)}
                              data-testid={`sell-armor-slot-${key}`}
                              className={cn(
                                "px-1.5 py-0.5 rounded border transition-colors text-xs",
                                sellSubCategoryFilter === key
                                  ? "bg-blue-600 border-blue-500 text-white"
                                  : "border-border/30 text-muted-foreground hover:border-blue-500/50"
                              )}
                            >
                              {t(label as any)}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1 flex-wrap items-center pl-1 border-l-2 border-green-500/30 ml-2">
                          <span className="text-green-400 font-medium shrink-0 text-[11px]">{t('marketMaterial' as any)}</span>
                          {([
                            { key: 'plate', label: 'marketPlate' },
                            { key: 'leather', label: 'marketLeather' },
                            { key: 'cloth', label: 'marketCloth' },
                          ] as const).map(({ key, label }) => (
                            <button
                              key={key}
                              onClick={() => setSellArmorTypeFilter(prev => prev === key ? null : key)}
                              data-testid={`sell-armor-type-${key}`}
                              className={cn(
                                "px-1.5 py-0.5 rounded border transition-colors text-xs",
                                sellArmorTypeFilter === key
                                  ? "bg-teal-600 border-teal-500 text-white"
                                  : "border-border/30 text-muted-foreground hover:border-teal-500/50"
                              )}
                            >
                              {t(label as any)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {sellCategoryFilter === "accessories" && (
                      <div className="flex gap-1 flex-wrap pl-1 border-l-2 border-green-500/30 ml-2">
                        {([
                          { key: 'ring', label: 'marketRing' },
                          { key: 'amulet', label: 'marketAmulet' },
                        ] as const).map(({ key, label }) => (
                          <button
                            key={key}
                            onClick={() => setSellSubCategoryFilter(prev => prev === key ? null : key)}
                            data-testid={`sell-accessory-${key}`}
                            className={cn(
                              "px-1.5 py-0.5 rounded border transition-colors text-xs",
                              sellSubCategoryFilter === key
                                ? "bg-purple-600 border-purple-500 text-white"
                                : "border-border/30 text-muted-foreground hover:border-purple-500/50"
                            )}
                          >
                            {t(label as any)}
                          </button>
                        ))}
                      </div>
                    )}

                    {sellCategoryFilter === "materials" && (
                      <div className="flex gap-1 flex-wrap pl-1 border-l-2 border-green-500/30 ml-2">
                        {([
                          { key: 'ore', label: 'marketOre' },
                          { key: 'bar', label: 'marketBar' },
                          { key: 'log', label: 'marketLog' },
                          { key: 'hide', label: 'marketHide' },
                          { key: 'other', label: 'marketOther' },
                        ] as const).map(({ key, label }) => (
                          <button
                            key={key}
                            onClick={() => setSellSubCategoryFilter(prev => prev === key ? null : key)}
                            data-testid={`sell-material-${key}`}
                            className={cn(
                              "px-1.5 py-0.5 rounded border transition-colors text-xs",
                              sellSubCategoryFilter === key
                                ? "bg-emerald-600 border-emerald-500 text-white"
                                : "border-border/30 text-muted-foreground hover:border-emerald-500/50"
                            )}
                          >
                            {t(label as any)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <ScrollArea className={cn(isMobile ? "flex-1 min-h-0" : "h-[400px]")}>
                    {filteredTradableItems.length === 0 ? (
                      <div className="text-center text-muted-foreground py-6 text-sm">
                        {tradableItems.length === 0 ? t('noTradableItems') : t('noListingsFound')}
                      </div>
                    ) : (
                      <div className={cn(
                        "grid gap-2 p-1",
                        isMobile ? "grid-cols-3" : "grid-cols-4 lg:grid-cols-5"
                      )}>
                        {filteredTradableItems.map(([itemName, quantity]) => {
                          const { baseId, rarity } = parseItemWithRarity(itemName);
                          const itemImg = getItemImage(itemName);
                          const baseItem = getBaseItem(itemName);
                          const isEquipment = baseItem?.type === "equipment";
                          const durability = isEquipment ? getItemDurability(itemName) : 100;
                          const needsRepair = isEquipment && durability < 100;
                          const hasEnhancement = itemModifications[itemName]?.enhancementLevel > 0;
                          const existingList = !hasEnhancement ? myListings.find(l => l.itemId === itemName) : null;
                          const glowClass = !needsRepair && rarity && rarity !== "Common" ? RARITY_GLOW[rarity] : "";

                          return (
                            <div
                              key={itemName}
                              onClick={() => {
                                if (needsRepair) return;
                                setSelectedItem({ name: itemName, quantity });
                                setSellQuantity(1);
                                if (existingList) {
                                  setExistingListing(existingList);
                                  setSellPrice(existingList.pricePerItem);
                                } else {
                                  setExistingListing(null);
                                  setSellPrice(getVendorPrice(itemName));
                                }
                                setSellDialogOpen(true);
                              }}
                              className={cn(
                                "relative flex flex-col items-center rounded-lg border transition-all duration-200 group",
                                isMobile ? "p-1.5 gap-1" : "p-2.5 gap-1.5",
                                needsRepair
                                  ? "opacity-50 cursor-not-allowed bg-gray-800/40 border-gray-600/30"
                                  : "hover:scale-[1.03] hover:z-10 active:scale-[0.97] cursor-pointer",
                                !needsRepair && glowClass,
                                !needsRepair && (rarity && rarity !== "Common"
                                  ? RARITY_BG_COLORS[rarity]
                                  : "bg-muted/15 border-border/20 hover:border-border/40"),
                                needsRepair && "border-gray-600/30"
                              )}
                              data-testid={`sell-item-${itemName.toLowerCase().replace(/\s+/g, "-")}`}
                            >
                              {hasEnhancement && (
                                <div className="absolute top-1 left-1 bg-cyan-500/90 text-white text-[9px] font-bold px-1 py-0.5 rounded leading-none">
                                  +{itemModifications[itemName].enhancementLevel}
                                </div>
                              )}
                              {rarity && rarity !== "Common" && (
                                <div className={cn(
                                  "absolute top-1 right-1 text-[8px] font-bold px-1 py-0.5 rounded leading-none opacity-80",
                                  rarity === "Uncommon" && "bg-green-500/20 text-green-400",
                                  rarity === "Rare" && "bg-blue-500/20 text-blue-400",
                                  rarity === "Epic" && "bg-purple-500/20 text-purple-400",
                                  rarity === "Legendary" && "bg-amber-500/20 text-amber-400",
                                  rarity === "Mythic" && "bg-red-500/20 text-red-400"
                                )}>
                                  {rarity.charAt(0)}
                                </div>
                              )}
                              {cursedItems.includes(itemName) && (
                                <div className="absolute inset-0 rounded-lg border-2 border-red-500/80 pointer-events-none z-30">
                                  <Skull className="absolute top-0.5 left-0.5 w-3 h-3 text-red-500" weight="fill" />
                                </div>
                              )}

                              <div className={cn(
                                "rounded-lg flex items-center justify-center",
                                "bg-black/30 border border-border/10",
                                isMobile ? "w-12 h-12" : "w-14 h-14"
                              )}>
                                {itemImg ? (
                                  <img
                                    src={itemImg}
                                    alt={baseId}
                                    loading="lazy"
                                    className={cn("object-contain pixelated", isMobile ? "w-10 h-10" : "w-12 h-12", needsRepair && "grayscale")}
                                  />
                                ) : (
                                  <Package className={cn("text-muted-foreground", isMobile ? "w-6 h-6" : "w-7 h-7")} />
                                )}
                              </div>

                              <div className="w-full text-center min-w-0">
                                <div className={cn(
                                  "font-medium truncate leading-tight",
                                  isMobile ? "text-[10px]" : "text-xs",
                                  needsRepair ? "text-gray-400" : (rarity && rarity !== "Common" ? RARITY_COLORS[rarity] : "text-foreground/90")
                                )}>
                                  {translateItemName(baseId, language)}
                                </div>
                              </div>

                              {!needsRepair && itemModifications[itemName] && (
                                <div className="w-full">
                                  {renderEnhancementInfo({
                                    enhancementLevel: itemModifications[itemName].enhancementLevel,
                                    addedStats: itemModifications[itemName].addedStats,
                                    addedSkills: itemModifications[itemName].addedSkills,
                                  })}
                                </div>
                              )}

                              <div className="w-full flex items-center justify-center">
                                <span className={cn(
                                  "text-muted-foreground",
                                  isMobile ? "text-[9px]" : "text-[10px]"
                                )}>x{formatNumber(quantity)}</span>
                              </div>

                              {!needsRepair && (
                                <div className="w-full flex items-center justify-center">
                                  <GoldDisplay amount={getVendorPrice(itemName)} size="xs" />
                                </div>
                              )}

                              {existingList && (
                                <div className={cn(
                                  "text-amber-400 font-medium text-center leading-tight",
                                  isMobile ? "text-[8px]" : "text-[9px]"
                                )}>
                                  {language === 'tr' ? `Pazarda: ${existingList.quantity}x • ${formatNumber(existingList.pricePerItem)} g` : `Listed: ${existingList.quantity}x • ${formatNumber(existingList.pricePerItem)} g`}
                                </div>
                              )}

                              {needsRepair && (
                                <div className="w-full space-y-0.5">
                                  <DurabilityBar durability={durability} size="xs" />
                                  <div className={cn("text-red-400 font-medium text-center", isMobile ? "text-[8px]" : "text-[9px]")}>
                                    {t('repairRequired')} ({Math.floor(durability)}%)
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="my-listings" className={cn(isMobile && "flex-1 flex flex-col min-h-0")}>
                  <div className={cn(
                    "z-10 bg-card/80 backdrop-blur-sm -mx-1 px-1 shrink-0",
                    isMobile ? "pb-1.5" : "pb-3"
                  )}>
                    <Input
                      placeholder={t('searchItems')}
                      value={listingsSearchQuery}
                      onChange={(e) => setListingsSearchQuery(e.target.value)}
                      data-testid="listings-search-input"
                      className={cn("border-border/30 bg-background/50", isMobile ? "h-8 text-xs" : "h-11")}
                    />
                  </div>
                  <ScrollArea className={cn(isMobile ? "flex-1 min-h-0" : "h-[400px]")}>
                    {filteredMyListings.length === 0 ? (
                      <div className="text-center text-muted-foreground py-6 text-sm">
                        {myListings.length === 0 ? t('noActiveListings') : t('noListingsFound')}
                      </div>
                    ) : (
                      <div className={cn(
                        "grid gap-2 p-1",
                        isMobile ? "grid-cols-3" : "grid-cols-4 lg:grid-cols-5"
                      )}>
                        {filteredMyListings.map((listing) => {
                          const { baseId, rarity } = parseItemWithRarity(listing.itemId);
                          const itemImg = getItemImage(listing.itemId);
                          const enhLevel = (listing.enhancementData?.enhancementLevel ?? 0) > 0
                            ? (listing.enhancementData!.enhancementLevel ?? 0) : 0;
                          const glowClass = rarity && rarity !== "Common" ? RARITY_GLOW[rarity] : "";
                          return (
                            <div
                              key={listing.id}
                              className={cn(
                                "relative flex flex-col items-center rounded-lg border transition-all duration-200",
                                isMobile ? "p-1.5 gap-1" : "p-2.5 gap-1.5",
                                glowClass,
                                rarity && rarity !== "Common"
                                  ? RARITY_BG_COLORS[rarity]
                                  : "bg-muted/15 border-border/20"
                              )}
                              data-testid={`my-listing-${listing.id}`}
                            >
                              {enhLevel > 0 && (
                                <div className="absolute top-1 left-1 bg-cyan-500/90 text-white text-[9px] font-bold px-1 py-0.5 rounded leading-none">
                                  +{enhLevel}
                                </div>
                              )}
                              {rarity && rarity !== "Common" && (
                                <div className={cn(
                                  "absolute top-1 right-1 text-[8px] font-bold px-1 py-0.5 rounded leading-none opacity-80",
                                  rarity === "Uncommon" && "bg-green-500/20 text-green-400",
                                  rarity === "Rare" && "bg-blue-500/20 text-blue-400",
                                  rarity === "Epic" && "bg-purple-500/20 text-purple-400",
                                  rarity === "Legendary" && "bg-amber-500/20 text-amber-400",
                                  rarity === "Mythic" && "bg-red-500/20 text-red-400"
                                )}>
                                  {rarity.charAt(0)}
                                </div>
                              )}

                              <div className={cn(
                                "rounded-lg flex items-center justify-center",
                                "bg-black/30 border border-border/10",
                                isMobile ? "w-12 h-12" : "w-14 h-14"
                              )}>
                                {itemImg ? (
                                  <img src={itemImg} alt={baseId} loading="lazy" className={cn("object-contain pixelated", isMobile ? "w-10 h-10" : "w-12 h-12")} />
                                ) : (
                                  <Package className={cn("text-muted-foreground", isMobile ? "w-6 h-6" : "w-7 h-7")} />
                                )}
                              </div>

                              <div className="w-full text-center min-w-0">
                                <div className={cn(
                                  "font-medium truncate leading-tight",
                                  isMobile ? "text-[10px]" : "text-xs",
                                  rarity && rarity !== "Common" ? RARITY_COLORS[rarity] : "text-foreground/90"
                                )}>
                                  {translateItemName(baseId, language)}
                                </div>
                              </div>

                              {listing.enhancementData && (
                                <div className="w-full">
                                  {renderEnhancementInfo(listing.enhancementData)}
                                </div>
                              )}

                              <div className="w-full flex items-center justify-center">
                                <GoldDisplay amount={listing.pricePerItem} size="xs" />
                              </div>

                              <div className={cn(
                                "flex items-center gap-0.5 text-muted-foreground/60",
                                isMobile ? "text-[8px]" : "text-[10px]"
                              )}>
                                x{listing.quantity}
                              </div>

                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={(e) => { e.stopPropagation(); handleCancelListing(listing.id); }}
                                data-testid={`cancel-listing-${listing.id}`}
                                className={cn("w-full mt-auto", isMobile ? "h-6 text-[9px] px-1" : "h-7 text-[10px] px-2")}
                              >
                                <X className="w-3 h-3 mr-0.5" />
                                {t('cancel')}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>

                </TabsContent>

                <TabsContent value="buy-orders" className={cn(isMobile && "flex-1 flex flex-col min-h-0")}>
                  <ScrollArea className={cn(isMobile ? "flex-1" : "max-h-[600px]")}>
                    <div className={cn(isMobile ? "space-y-3 pb-4" : "space-y-4 pr-2 pb-4")}>
                      {/* Create Buy Order */}
                      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 space-y-3">
                        <div className="flex items-center gap-2">
                          <BookmarkSimple className="w-4 h-4 text-purple-400" weight="bold" />
                          <span className={cn("font-semibold text-purple-300", isMobile ? "text-xs" : "text-sm")}>{t('createBuyOrder')}</span>
                        </div>
                        {/* Item search — all tradable items */}
                        <div className="relative">
                          <Input
                            placeholder={t('searchItems')}
                            value={buyOrderSearchItem}
                            onChange={(e) => { setBuyOrderSearchItem(e.target.value); setBuyOrderBaseItemId(""); setBuyOrderItemId(""); setBuyOrderRarity("Common"); }}
                            data-testid="buy-order-item-search"
                            className={cn("border-border/30 bg-background/50", isMobile ? "h-8 text-xs" : "h-10")}
                          />
                          {buyOrderSearchItem.length > 1 && !buyOrderBaseItemId && (() => {
                            const query = buyOrderSearchItem.toLowerCase();
                            const allTradable = getItems().filter(item => isItemTradable(item.id) && !item.untradable);
                            const matches = allTradable.filter(item =>
                              translateItemName(item.id, language).toLowerCase().includes(query) ||
                              item.id.toLowerCase().includes(query)
                            ).slice(0, 8);
                            return matches.length > 0 ? (
                              <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg border border-border/30 bg-card shadow-xl overflow-hidden">
                                {matches.map((item) => {
                                  const { rarity } = parseItemWithRarity(item.id);
                                  return (
                                    <button key={item.id} onClick={() => {
                                      const baseId = item.id;
                                      const initialRarity: Rarity = "Common";
                                      setBuyOrderBaseItemId(baseId);
                                      setBuyOrderRarity(initialRarity);
                                      setBuyOrderItemId(buildBuyOrderItemId(baseId, initialRarity));
                                      setBuyOrderSearchItem(translateItemName(baseId, language));
                                    }} className="w-full text-left px-3 py-2 hover:bg-muted/40 text-xs flex items-center gap-2">
                                      {getItemImage(item.id) && <img src={getItemImage(item.id)!} alt="" className="w-5 h-5 object-contain" />}
                                      <span className={rarity && rarity !== "Common" ? RARITY_COLORS[rarity] : ""}>{translateItemName(item.id, language)}</span>
                                      {rarity && rarity !== "Common" && <span className={cn("text-[10px] ml-auto", RARITY_COLORS[rarity])}>{rarity}</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null;
                          })()}
                        </div>
                        {buyOrderBaseItemId && (
                          <div className={cn("rounded-lg bg-muted/20 border border-border/20 flex items-center gap-2", isMobile ? "p-2" : "p-3")}>
                            {getItemImage(buyOrderBaseItemId) && <img src={getItemImage(buyOrderBaseItemId)!} alt="" className="w-8 h-8 object-contain" />}
                            <div className="flex-1 min-w-0">
                              <div className={cn("font-medium", isMobile ? "text-xs" : "text-sm")}>{translateItemName(buyOrderBaseItemId, language)}</div>
                              {getValidRarities(buyOrderBaseItemId).length > 1 && (
                                <div className={cn("font-medium", isMobile ? "text-[10px]" : "text-xs", RARITY_COLORS[buyOrderRarity])}>{buyOrderRarity}</div>
                              )}
                              <div className={cn("text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>{t('inInventory')}: {inventory[buyOrderItemId] || 0}</div>
                              {buyOrderItemSellPrice?.lowestPrice != null && (
                                <div className={cn("text-amber-400", isMobile ? "text-[10px]" : "text-xs")}>
                                  Cheapest sell: {formatNumber(buyOrderItemSellPrice.lowestPrice)} gold
                                </div>
                              )}
                            </div>
                            <button onClick={() => { setBuyOrderBaseItemId(""); setBuyOrderItemId(""); setBuyOrderSearchItem(""); setBuyOrderRarity("Common"); }} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        )}
                        {buyOrderBaseItemId && (() => {
                          const availableRarities = getValidRarities(buyOrderBaseItemId);
                          if (availableRarities.length <= 1) return null;
                          return (
                            <div className="space-y-1">
                              <label className={cn("font-medium text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>Rarity</label>
                              <div className="flex flex-wrap gap-1">
                                {availableRarities.map((rarity) => (
                                  <button
                                    key={rarity}
                                    data-testid={`buy-order-rarity-${rarity.toLowerCase()}`}
                                    onClick={() => {
                                      setBuyOrderRarity(rarity);
                                      setBuyOrderItemId(buildBuyOrderItemId(buyOrderBaseItemId, rarity));
                                    }}
                                    className={cn(
                                      "px-2 py-0.5 rounded border text-[10px] font-medium transition-colors",
                                      buyOrderRarity === rarity
                                        ? cn(RARITY_COLORS[rarity], "border-current bg-current/10")
                                        : "border-border/30 text-muted-foreground hover:border-border/60"
                                    )}
                                  >
                                    {rarity}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={cn("font-medium mb-1 block text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>{t('quantityLabel')}</label>
                            <Input type="number" min={1} value={buyOrderQuantity} onChange={(e) => setBuyOrderQuantity(Math.max(1, parseInt(e.target.value) || 1))} data-testid="buy-order-quantity" className={cn("border-border/30 bg-background/50", isMobile ? "h-8 text-xs" : "h-10")} />
                          </div>
                          <div>
                            <label className={cn("font-medium mb-1 block text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>{t('maxPrice')} ({t('unitPriceGold')})</label>
                            <Input type="number" min={1} value={buyOrderPrice} onChange={(e) => setBuyOrderPrice(Math.max(1, parseInt(e.target.value) || 1))} data-testid="buy-order-price" className={cn("border-border/30 bg-background/50", isMobile ? "h-8 text-xs" : "h-10")} />
                          </div>
                        </div>
                        <div className={cn("rounded-lg bg-yellow-500/10 border border-yellow-500/20 space-y-1", isMobile ? "p-2" : "p-3")}>
                          <div className="flex items-center justify-between">
                            <span className={cn("text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>{t('goldReserved')}:</span>
                            <GoldDisplay amount={buyOrderQuantity * buyOrderPrice} size="xs" />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={cn("text-amber-400", isMobile ? "text-[10px]" : "text-xs")}>+{Math.round(MARKET_BUY_ORDER_TAX * 100)}% {language === 'tr' ? 'Market Vergisi' : 'Market Tax'}:</span>
                            <span className={cn("text-amber-400 font-medium", isMobile ? "text-[10px]" : "text-xs")}>{formatNumber(Math.floor(buyOrderQuantity * buyOrderPrice * MARKET_BUY_ORDER_TAX))} gold</span>
                          </div>
                          <div className="flex items-center justify-between border-t border-yellow-500/20 pt-1">
                            <span className={cn("font-semibold", isMobile ? "text-[10px]" : "text-xs")}>{language === 'tr' ? 'Toplam Rezerv' : 'Total Reserved'}:</span>
                            <GoldDisplay amount={Math.floor(buyOrderQuantity * buyOrderPrice * (1 + MARKET_BUY_ORDER_TAX))} size="sm" />
                          </div>
                        </div>
                        <Button onClick={handleCreateBuyOrder} disabled={isCreatingBuyOrder || !buyOrderItemId} data-testid="create-buy-order-btn" className={cn("w-full bg-purple-600 hover:bg-purple-500 text-white", isMobile ? "h-9 text-xs" : "h-10")}>
                          <Coins className="w-3.5 h-3.5 mr-1.5" weight="bold" />
                          {isCreatingBuyOrder ? "..." : t('createBuyOrder')}
                        </Button>
                        <p className={cn("text-center text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>{t('buyOrderLimit')} • {myBuyOrders.length}/10</p>
                      </div>

                      {/* My Active Buy Orders */}
                      {myBuyOrders.length > 0 && (
                        <div className="space-y-2">
                          <h3 className={cn("font-semibold text-foreground/80", isMobile ? "text-xs" : "text-sm")}>{t('myBuyOrders')} ({myBuyOrders.length})</h3>
                          {myBuyOrders.map(order => (
                            <div key={order.id} data-testid={`buy-order-${order.id}`} className={cn("rounded-lg border border-border/20 bg-card/60 flex items-center gap-2", isMobile ? "p-2" : "p-3")}>
                              {getItemImage(order.itemId) && <img src={getItemImage(order.itemId)!} alt="" className="w-8 h-8 object-contain shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <div className={cn("font-medium", isMobile ? "text-xs" : "text-sm")}>{translateItemName(order.itemId, language)}</div>
                                <div className={cn("text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>{t('wantedQty')}: {order.remainingQuantity}/{order.quantity} • {formatNumber(order.pricePerItem)} gold each</div>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className={cn("font-bold text-purple-400", isMobile ? "text-xs" : "text-sm")}>{formatNumber(order.remainingQuantity * order.pricePerItem)} g</span>
                                <button onClick={() => handleCancelBuyOrder(order.id)} data-testid={`cancel-buy-order-${order.id}`} className={cn("text-red-400 hover:text-red-300 transition-colors border border-red-500/30 rounded px-2 py-0.5 hover:bg-red-500/10", isMobile ? "text-[10px]" : "text-xs")}>
                                  {t('cancelBuyOrder')}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {myBuyOrders.length === 0 && (
                        <div className="text-center text-muted-foreground py-6">
                          <BookmarkSimple className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p className={cn(isMobile ? "text-xs" : "text-sm")}>{t('noBuyOrders')}</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="history" className={cn(isMobile && "flex-1 flex flex-col min-h-0")}>
                  <ScrollArea className={cn(isMobile ? "flex-1" : "max-h-[600px]")}>
                    <div className={cn(isMobile ? "space-y-2 pb-4" : "space-y-2 pr-2 pb-4")}>
                      <div className={cn("flex items-center gap-1.5 mb-2")}>
                        <ArrowUp className={cn(isMobile ? "w-3.5 h-3.5" : "w-4 h-4")} weight="bold" />
                        <ArrowDown className={cn(isMobile ? "w-3.5 h-3.5" : "w-4 h-4")} weight="bold" />
                        <span className={cn("font-semibold text-foreground/80", isMobile ? "text-xs" : "text-sm")}>Transaction History</span>
                        {myTransactions.length > 0 && <span className={cn("text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>({myTransactions.length})</span>}
                      </div>
                      {myTransactions.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                          <ArrowUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p className={cn(isMobile ? "text-xs" : "text-sm")}>{t('noTransactions')}</p>
                        </div>
                      ) : (
                        myTransactions.map(tx => {
                          const isSell = tx.role === "seller";
                          const total = tx.quantity * tx.pricePerItem;
                          const timeAgo = tx.soldAt ? (() => {
                            const diff = Date.now() - new Date(tx.soldAt).getTime();
                            const mins = Math.floor(diff / 60000);
                            const hrs = Math.floor(mins / 60);
                            const days = Math.floor(hrs / 24);
                            if (days > 0) return `${days}d ${t('ago')}`;
                            if (hrs > 0) return `${hrs}h ${t('ago')}`;
                            return `${mins}m ${t('ago')}`;
                          })() : "";
                          return (
                            <div key={tx.id} data-testid={`history-transaction-${tx.id}`} className={cn(
                              "rounded-lg border flex items-center gap-2",
                              isMobile ? "p-1.5" : "p-2.5",
                              isSell ? "border-green-500/20 bg-green-500/5" : "border-blue-500/20 bg-blue-500/5"
                            )}>
                              {getItemImage(tx.itemId) && <img src={getItemImage(tx.itemId)!} alt="" className="w-7 h-7 object-contain shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <div className={cn("font-medium truncate", isMobile ? "text-[10px]" : "text-xs")}>{translateItemName(tx.itemId, language)}</div>
                                <div className={cn("text-muted-foreground", isMobile ? "text-[10px]" : "text-[11px]")}>
                                  {isSell ? t('soldTo') : t('boughtFrom')} <span className="text-foreground/80">{tx.otherUsername}</span>
                                  {" · "}{tx.quantity}x
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className={cn("font-bold", isSell ? "text-green-400" : "text-blue-400", isMobile ? "text-xs" : "text-sm")}>
                                  {isSell ? "+" : "-"}{formatNumber(total)} g
                                </div>
                                <div className={cn("text-muted-foreground", isMobile ? "text-[10px]" : "text-[10px]")}>{timeAgo}</div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="trading-post" className={cn(isMobile && "flex-1 flex flex-col min-h-0")}>
                  <TradingPostPanel language={language} isMobile={isMobile} playerRegion={player?.currentRegion || "verdant"} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={sellDialogOpen} onOpenChange={setSellDialogOpen}>
        <DialogContent data-testid="sell-dialog" className={cn(
          "border-border/30 bg-card/95 backdrop-blur-md",
          isMobile && "w-[95vw] max-w-[95vw] rounded-xl p-4"
        )}>
          <DialogHeader className={cn(isMobile && "pb-2")}>
            <DialogTitle className={cn(isMobile && "text-base")}>
              {existingListing
                ? (language === 'tr' ? 'İlanı Güncelle' : 'Update Listing')
                : t('listForSale')}
            </DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className={cn(isMobile ? "space-y-3" : "space-y-4")}>
              <div className={cn(
                "rounded-lg bg-muted/20 border border-border/20",
                isMobile ? "p-2" : "p-3"
              )}>
                <div className={cn("font-medium", isMobile && "text-sm")}>
                  {itemModifications[selectedItem.name]?.enhancementLevel > 0 && (
                    <span className="text-cyan-400 font-bold mr-1">+{itemModifications[selectedItem.name].enhancementLevel}</span>
                  )}
                  {translateItemName(parseItemWithRarity(selectedItem.name).baseId, language)}
                  {cursedItems.includes(selectedItem.name) && (
                    <span className="text-red-500 text-[10px] ml-1.5 font-bold">Cursed</span>
                  )}
                </div>
                <div className={cn("text-muted-foreground", isMobile ? "text-xs" : "text-sm")}>
                  {t('inInventory')}: {selectedItem.quantity}
                </div>
              </div>

              {existingListing && (
                <div className={cn(
                  "rounded-lg bg-amber-500/10 border border-amber-500/20",
                  isMobile ? "p-2" : "p-3"
                )}>
                  <div className={cn("text-amber-400 font-medium mb-1", isMobile ? "text-xs" : "text-sm")}>
                    {language === 'tr' ? 'Mevcut İlan' : 'Current Listing'}
                  </div>
                  <div className={cn("text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>
                    {language === 'tr' ? 'Miktar' : 'Quantity'}: {existingListing.quantity} • {language === 'tr' ? 'Fiyat' : 'Price'}: {formatNumber(existingListing.pricePerItem)} gold
                  </div>
                </div>
              )}

              {cursedItems.includes(selectedItem.name) && (
                <div className="bg-red-500/10 rounded-lg p-2.5 border border-red-500/30 flex items-center gap-2">
                  <Skull className="w-4 h-4 text-red-500 shrink-0" weight="fill" />
                  <span className={cn("text-red-400 font-medium", isMobile ? "text-[10px]" : "text-xs")}>Cursed Item</span>
                </div>
              )}

              <div>
                <label className={cn("font-medium mb-1 block", isMobile ? "text-xs" : "text-sm")}>
                  {existingListing
                    ? (language === 'tr' ? 'Eklenecek Miktar' : 'Add Quantity')
                    : t('quantityLabel')}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={selectedItem.quantity}
                  value={sellQuantity}
                  onChange={(e) => setSellQuantity(Math.min(selectedItem.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                  data-testid="sell-quantity-input"
                  className={cn("border-border/30 bg-background/50", isMobile ? "h-9" : "h-11")}
                />
              </div>

              <div>
                <label className={cn("font-medium mb-1 block", isMobile ? "text-xs" : "text-sm")}>
                  {t('unitPriceGold')}
                  <span className={cn("text-muted-foreground ml-2", isMobile ? "text-[10px]" : "text-xs")}>
                    {t('suggested')}: {formatNumber(getVendorPrice(selectedItem.name))}
                  </span>
                </label>
                <Input
                  type="number"
                  min={1}
                  value={sellPrice}
                  onChange={(e) => setSellPrice(Math.max(1, parseInt(e.target.value) || 1))}
                  data-testid="sell-price-input"
                  className={cn("border-border/30 bg-background/50", isMobile ? "h-9" : "h-11")}
                />
              </div>

              <SuggestedPriceHint itemId={selectedItem.name} currentPrice={sellPrice} isMobile={isMobile} language={language} />

              <div className={cn(
                "rounded-lg bg-yellow-500/10 border border-yellow-500/20 space-y-1",
                isMobile ? "p-2" : "p-3"
              )}>
                {existingListing ? (
                  <>
                    <div className={cn("text-muted-foreground", isMobile ? "text-xs" : "text-sm")}>
                      {language === 'tr' ? 'Güncel toplam miktar' : 'New total quantity'}: {existingListing.quantity + sellQuantity}
                    </div>
                    <div className={cn("text-muted-foreground mt-0.5", isMobile ? "text-[10px]" : "text-xs")}>
                      {language === 'tr' ? 'Birim fiyat' : 'Unit price'}: {formatNumber(sellPrice)} gold
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className={cn("text-muted-foreground", isMobile ? "text-xs" : "text-sm")}>{t('totalPrice')}:</span>
                      <span className={cn("text-foreground", isMobile ? "text-xs" : "text-sm")}>{formatNumber(sellQuantity * sellPrice)} gold</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={cn("text-red-400", isMobile ? "text-[10px]" : "text-xs")}>−{Math.round(MARKET_LISTING_FEE * 100)}% {language === 'tr' ? 'İlan Ücreti (şimdi)' : 'Listing Fee (now)'}:</span>
                      <span className={cn("text-red-400 font-medium", isMobile ? "text-[10px]" : "text-xs")}>{formatNumber(Math.floor(sellQuantity * sellPrice * MARKET_LISTING_FEE))} gold</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-yellow-500/20 pt-1">
                      <span className={cn("font-semibold", isMobile ? "text-[10px]" : "text-xs")}>{language === 'tr' ? 'Ücret Sonrası Net' : 'Net After Fee'}:</span>
                      <GoldDisplay amount={sellQuantity * sellPrice - Math.floor(sellQuantity * sellPrice * MARKET_LISTING_FEE)} size={isMobile ? "xs" : "sm"} />
                    </div>
                  </>
                )}
              </div>

              {/* Active Buy Orders for this item */}
              {itemBuyOrders.length > 0 && (
                <div className="space-y-2">
                  <div className={cn("font-semibold text-purple-300 flex items-center gap-1.5", isMobile ? "text-xs" : "text-sm")}>
                    <BookmarkSimple className="w-3.5 h-3.5" weight="bold" />
                    {t('buyOrders')} ({itemBuyOrders.length})
                  </div>
                  {itemBuyOrders.slice(0, 5).map(order => {
                    const maxFill = Math.min(order.remainingQuantity, inventory[selectedItem?.name ?? ""] || 0);
                    const isOwn = order.buyerId === player?.id;
                    return (
                      <div key={order.id} data-testid={`sell-dialog-buy-order-${order.id}`} className={cn("rounded-lg border border-purple-500/20 bg-purple-500/5 flex items-center gap-2", isMobile ? "p-2" : "p-3")}>
                        <div className="flex-1 min-w-0">
                          <div className={cn("font-medium text-purple-200", isMobile ? "text-[10px]" : "text-xs")}>{order.buyer.username} {t('buyerWants')} {order.remainingQuantity}x</div>
                          <div className={cn("text-green-400 font-bold", isMobile ? "text-xs" : "text-sm")}>{formatNumber(order.pricePerItem)} gold each</div>
                          {maxFill > 0 && <div className={cn("text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>= {formatNumber(maxFill * order.pricePerItem)} gold for {maxFill}x</div>}
                        </div>
                        {!isOwn && maxFill > 0 && (
                          <Button onClick={() => handleFillBuyOrder(order.id, maxFill, selectedItem?.name ?? "")} disabled={isFillingOrder === order.id} data-testid={`quick-sell-btn-${order.id}`} className={cn("bg-purple-600 hover:bg-purple-500 text-white shrink-0", isMobile ? "h-8 text-[10px] px-2" : "h-9 text-xs px-3")}>
                            {isFillingOrder === order.id ? "..." : t('quickSell')}
                          </Button>
                        )}
                        {isOwn && <span className={cn("text-muted-foreground italic", isMobile ? "text-[10px]" : "text-xs")}>({language === 'tr' ? 'Sizin' : 'Yours'})</span>}
                        {!isOwn && maxFill <= 0 && <span className={cn("text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>{t('notEnoughItems')}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <DialogFooter className={cn(isMobile && "gap-2")}>
            <Button variant="outline" onClick={() => { setSellDialogOpen(false); setExistingListing(null); }} className={cn("border-border/30", isMobile ? "min-h-[40px] h-10" : "min-h-[44px]")}>
              {t('cancel')}
            </Button>
            <Button onClick={handleCreateListing} data-testid="confirm-sell-btn" className={cn(isMobile ? "min-h-[40px] h-10" : "min-h-[44px]")}>
              {existingListing
                ? (language === 'tr' ? 'İlanı Güncelle' : 'Update Listing')
                : t('listForSale')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={purchasePopupOpen} onOpenChange={(open) => {
        setPurchasePopupOpen(open);
        if (!open) {
          setSelectedGroupItem(null);
          setSelectedListing(null);
        }
      }}>
        <DialogContent 
          data-testid="purchase-popup" 
          className={cn(
            "max-w-lg border-border/30 bg-card/95 backdrop-blur-md",
            isMobile && "w-[95vw] max-w-[95vw] rounded-xl max-h-[80vh] p-3"
          )}
        >
          <DialogHeader className={cn(isMobile && "pb-2")}>
            <DialogTitle className={cn(isMobile && "text-base")}>{t('buyNow')}</DialogTitle>
          </DialogHeader>
          {selectedGroupItem && (
            <ScrollArea className={cn(isMobile ? "max-h-[65vh]" : "max-h-[70vh]")}>
              <div className={cn(isMobile ? "space-y-3 pr-1" : "space-y-4 pr-2")}>
                {(() => {
                  const { baseId, rarity } = parseItemWithRarity(selectedGroupItem.itemId);
                  const itemImg = getItemImage(selectedGroupItem.itemId);
                  const baseItem = getBaseItem(selectedGroupItem.itemId);
                  const glowClass = rarity && rarity !== "Common" ? RARITY_GLOW[rarity] : "";

                  return (
                    <>
                      <div className={cn(
                        "rounded-xl border",
                        isMobile ? "p-3" : "p-4",
                        glowClass,
                        rarity && rarity !== "Common" ? RARITY_BG_COLORS[rarity] : "bg-muted/20 border-border/20"
                      )}>
                        <div className={cn(isMobile ? "flex gap-3" : "flex gap-4")}>
                          <div className={cn(
                            "rounded-xl flex items-center justify-center shrink-0",
                            "bg-black/30 border border-border/20",
                            isMobile ? "w-16 h-16" : "w-24 h-24"
                          )}>
                            {itemImg ? (
                              <img src={itemImg} alt={baseId} loading="lazy" className={cn("object-contain pixelated", isMobile ? "w-12 h-12" : "w-20 h-20")} />
                            ) : (
                              <Package className={cn("text-muted-foreground", isMobile ? "w-8 h-8" : "w-12 h-12")} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={cn(
                              "font-bold",
                              isMobile ? "text-sm" : "text-lg",
                              rarity && rarity !== "Common" ? RARITY_COLORS[rarity] : ""
                            )}>
                              {selectedListing?.enhancementData && (selectedListing.enhancementData as any).enhancementLevel > 0 && (
                                <span className="text-cyan-400 mr-1">+{(selectedListing.enhancementData as any).enhancementLevel}</span>
                              )}
                              {translateItemName(baseId, language)}
                            </div>
                            {rarity && rarity !== "Common" && (
                              <div className={cn("font-medium", isMobile ? "text-xs" : "text-sm", RARITY_COLORS[rarity])}>{rarity}</div>
                            )}
                            {baseItem && (
                              <div className={cn("text-muted-foreground mt-1 line-clamp-2", isMobile ? "text-[10px]" : "text-xs")}>{translateItemDescription(baseItem.name || baseItem.id, language)}</div>
                            )}
                          </div>
                        </div>

                        {baseItem && (
                          <div className={cn("border-t border-border/30 space-y-2", isMobile ? "mt-3 pt-3" : "mt-4 pt-4 space-y-3")}>
                            {renderItemStats(baseItem, selectedListing?.enhancementData)}
                            {renderWeaponSkills(baseItem)}
                            {baseItem.lifestealPercent && (
                              <div className={cn("flex items-center gap-1.5 text-purple-400", isMobile ? "text-[10px]" : "text-xs")}>
                                <Heart className={cn(isMobile ? "w-3 h-3" : "w-3.5 h-3.5")} weight="fill" />
                                <span>{t('lifesteal')}: {baseItem.lifestealPercent}%</span>
                              </div>
                            )}
                            {renderEnhancementInfo(selectedListing?.enhancementData)}
                          </div>
                        )}

                        {baseItem?.type === "equipment" && baseItem?.equipSlot && (() => {
                          const equippedItemId = equipment[baseItem.equipSlot as keyof typeof equipment];
                          if (equippedItemId === selectedGroupItem.itemId) return null;

                          const marketItemEnhData = (selectedListing?.enhancementData && typeof selectedListing.enhancementData === 'object') ? selectedListing.enhancementData : null;
                          const marketMods = marketItemEnhData ? { 
                            [selectedGroupItem.itemId]: {
                              addedStats: (marketItemEnhData.addedStats && typeof marketItemEnhData.addedStats === 'object' && !Array.isArray(marketItemEnhData.addedStats)) ? marketItemEnhData.addedStats : {},
                              addedSkills: Array.isArray(marketItemEnhData.addedSkills) ? marketItemEnhData.addedSkills : [],
                              enhancementLevel: marketItemEnhData.enhancementLevel || 0
                            }
                          } : {};
                          const marketStats = getItemStatsWithEnhancement(selectedGroupItem.itemId, marketMods);
                          if (!marketStats) return null;

                          const statKeys = [
                            { key: "attackBonus", label: "attack" },
                            { key: "strengthBonus", label: "strength" },
                            { key: "defenceBonus", label: "defence" },
                            { key: "hitpointsBonus", label: "hitpoints" },
                            { key: "accuracyBonus", label: "accuracy" },
                            { key: "skillDamageBonus", label: "skill_damage" },
                            { key: "attackSpeedBonus", label: "attack_speed" },
                            { key: "healingReceivedBonus", label: "healing_received" },
                            { key: "onHitHealingPercent", label: "on_hit_healing" },
                            { key: "buffDurationBonus", label: "buff_duration" },
                            { key: "partyDpsBuff", label: "party_dps" },
                            { key: "partyDefenceBuff", label: "party_defence" },
                            { key: "partyAttackSpeedBuff", label: "party_speed" },
                            { key: "lootChanceBonus", label: "loot_chance" },
                          ];

                          if (!equippedItemId) {
                            const gains = statKeys
                              .map(({ key, label }) => ({ label, value: (marketStats as any)[key] || 0 }))
                              .filter(({ value }) => value !== 0);

                            const weaponGains: { label: string; value: string }[] = [];
                            if (baseItem.equipSlot === "weapon") {
                              if (baseItem.attackSpeedMs) weaponGains.push({ label: t('attackSpeed'), value: `${(baseItem.attackSpeedMs / 1000).toFixed(1)}s` });
                              if (baseItem.lifestealPercent && baseItem.lifestealPercent > 0) weaponGains.push({ label: t('lifesteal'), value: `${baseItem.lifestealPercent}%` });
                            }

                            if (gains.length === 0 && weaponGains.length === 0) return null;

                            return (
                              <div className={cn("border-t border-amber-500/20", isMobile ? "mt-3 pt-3" : "mt-4 pt-4")}>
                                <div className={cn("text-amber-400 font-medium mb-1.5", isMobile ? "text-[10px]" : "text-xs")}>{t('comparedToEquipped')}</div>
                                <div className={cn("text-muted-foreground italic mb-1.5", isMobile ? "text-[10px]" : "text-xs")}>{t('noItemEquipped')}</div>
                                <div className="space-y-1">
                                  {gains.map(({ label, value }) => (
                                    <div key={label} className={cn("flex items-center justify-between", isMobile ? "text-xs" : "text-sm")}>
                                      <span className="text-muted-foreground">{t(label as any)}</span>
                                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                                        <ArrowUp className="w-3 h-3" />+{value}
                                      </span>
                                    </div>
                                  ))}
                                  {weaponGains.map(({ label, value }) => (
                                    <div key={label} className={cn("flex items-center justify-between", isMobile ? "text-xs" : "text-sm")}>
                                      <span className="text-muted-foreground">{label}</span>
                                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                                        <ArrowUp className="w-3 h-3" />{value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <div className={cn("text-emerald-400/70 mt-1.5", isMobile ? "text-[9px]" : "text-[10px]")}>{t('allStatsAreNew')}</div>
                              </div>
                            );
                          }

                          const equippedStats = getItemStatsWithEnhancement(equippedItemId, itemModifications) || {};
                          const equippedBase = getBaseItem(equippedItemId);

                          const diffs = statKeys
                            .map(({ key, label }) => ({
                              label,
                              diff: ((marketStats as any)[key] || 0) - ((equippedStats as any)[key] || 0)
                            }))
                            .filter(({ diff }) => diff !== 0);

                          const weaponDiffs: { label: string; diff: number; display: string }[] = [];
                          if (baseItem.equipSlot === "weapon" && equippedBase) {
                            const inspSpeed = baseItem.attackSpeedMs || 0;
                            const equipSpeed = equippedBase.attackSpeedMs || 0;
                            if (inspSpeed !== equipSpeed) {
                              weaponDiffs.push({ label: t('attackSpeed'), diff: -(inspSpeed - equipSpeed), display: `${(Math.abs(inspSpeed - equipSpeed) / 1000).toFixed(1)}s` });
                            }
                            const inspLife = baseItem.lifestealPercent || 0;
                            const equipLife = equippedBase.lifestealPercent || 0;
                            if (inspLife !== equipLife) {
                              weaponDiffs.push({ label: t('lifesteal'), diff: inspLife - equipLife, display: `${Math.abs(inspLife - equipLife)}%` });
                            }
                          }

                          if (diffs.length === 0 && weaponDiffs.length === 0) return null;

                          const equippedImg = getItemImage(equippedItemId);
                          const equippedName = translateItemName(parseItemWithRarity(equippedItemId).baseId, language);

                          return (
                            <div className={cn("border-t border-amber-500/20", isMobile ? "mt-3 pt-3" : "mt-4 pt-4")}>
                              <div className={cn("text-amber-400 font-medium mb-1.5", isMobile ? "text-[10px]" : "text-xs")}>{t('comparedToEquipped')}</div>
                              <div className="flex items-center gap-2 mb-1.5">
                                {equippedImg && <img src={equippedImg} alt={equippedName} className="w-5 h-5 object-contain pixelated" />}
                                <span className={cn("font-medium", isMobile ? "text-[10px]" : "text-xs", hasRarity(equippedItemId) ? getItemRarityColor(equippedItemId) : "text-white")}>
                                  {equippedName}
                                </span>
                              </div>
                              <div className="space-y-1">
                                {diffs.map(({ label, diff }) => (
                                  <div key={label} className={cn("flex items-center justify-between", isMobile ? "text-xs" : "text-sm")}>
                                    <span className="text-muted-foreground">{t(label as any)}</span>
                                    <span className={cn("flex items-center gap-1 font-bold", diff > 0 ? "text-emerald-400" : "text-red-400")}>
                                      {diff > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                                      {diff > 0 ? `+${diff}` : diff}
                                    </span>
                                  </div>
                                ))}
                                {weaponDiffs.map(({ label, diff, display }) => (
                                  <div key={label} className={cn("flex items-center justify-between", isMobile ? "text-xs" : "text-sm")}>
                                    <span className="text-muted-foreground">{label}</span>
                                    <span className={cn("flex items-center gap-1 font-bold", diff > 0 ? "text-emerald-400" : "text-red-400")}>
                                      {diff > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                                      {diff > 0 ? "+" : "-"}{display}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {selectedGroupItem && (() => {
                          const isEnhancedItem = !!(selectedListing?.enhancementData &&
                            (selectedListing.enhancementData.enhancementLevel ?? 0) > 0);
                          const maxQty = isEnhancedItem ? 1 : bulkBuyBreakdown.eligibleTotal;
                          const baseSubtotal = isEnhancedItem
                            ? (selectedListing?.pricePerItem ?? 0)
                            : bulkBuyBreakdown.totalCost;
                          const taxAmount = Math.floor(baseSubtotal * MARKET_BUY_TAX);
                          const displayCost = baseSubtotal + taxAmount;
                          const cannotAfford = displayCost > goldBalance;
                          return (
                          <div className={cn("border-t border-border/30", isMobile ? "mt-3 pt-3" : "mt-4 pt-4")}>
                            <div className={cn("flex items-center", isMobile ? "gap-2" : "gap-3")}>
                              <div className="flex-1">
                                <label className={cn("text-muted-foreground mb-1 block", isMobile ? "text-[10px]" : "text-xs")}>{t('quantityLabel')} ({t('available')}: {maxQty})</label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={maxQty}
                                  value={buyQuantity}
                                  onChange={(e) => setBuyQuantity(Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)))}
                                  disabled={isEnhancedItem}
                                  data-testid="buy-quantity-input"
                                  className={cn("border-border/30 bg-background/50", isMobile ? "h-9" : "h-11")}
                                />
                              </div>
                            </div>

                            {baseSubtotal > 0 && (
                              <div className={cn("rounded-lg bg-muted/20 border border-border/20 space-y-1", isMobile ? "mt-2 p-2" : "mt-3 p-3")}>
                                <div className="flex items-center justify-between">
                                  <span className={cn("text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>{t('totalAmount')}:</span>
                                  <span className={cn("text-foreground", isMobile ? "text-[10px]" : "text-xs")}>{formatNumber(baseSubtotal)} gold</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className={cn("text-amber-400", isMobile ? "text-[10px]" : "text-xs")}>+{Math.round(MARKET_BUY_TAX * 100)}% {language === 'tr' ? 'Market Vergisi' : 'Market Tax'}:</span>
                                  <span className={cn("text-amber-400 font-medium", isMobile ? "text-[10px]" : "text-xs")}>{formatNumber(taxAmount)} gold</span>
                                </div>
                                <div className="flex items-center justify-between border-t border-border/20 pt-1">
                                  <span className={cn("font-semibold", isMobile ? "text-[10px]" : "text-xs")}>{language === 'tr' ? 'Toplam Ödeme' : 'Total Cost'}:</span>
                                  <GoldDisplay amount={displayCost} size={isMobile ? "xs" : "sm"} />
                                </div>
                              </div>
                            )}

                            {cannotAfford && (
                              <div className={cn("text-red-400 mt-2", isMobile ? "text-xs" : "text-sm")}>{t('notEnoughGold')}</div>
                            )}

                            <Button
                              className={cn("w-full", isMobile ? "mt-2 min-h-[40px] h-10" : "mt-3 min-h-[44px]")}
                              onClick={handleBuy}
                              disabled={isBuying || cannotAfford || buyQuantity < 1}
                              data-testid="confirm-buy-btn"
                            >
                              {isBuying ? (
                                <span className="flex items-center gap-2">
                                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  {t('buyNow')}
                                </span>
                              ) : t('buyNow')}
                            </Button>
                          </div>
                          );
                        })()}
                      </div>

                      {/* Active Buy Orders for this item */}
                      {popupBuyOrders.length > 0 && (
                        <div>
                          <div className={cn("font-medium flex items-center gap-2 mb-1.5", isMobile ? "text-xs" : "text-sm")}>
                            <BookmarkSimple className={cn(isMobile ? "w-3.5 h-3.5" : "w-4 h-4")} weight="bold" />
                            <span className="text-purple-300">Active Buy Orders ({popupBuyOrders.length})</span>
                          </div>
                          <div className="border border-purple-500/20 rounded-lg overflow-hidden divide-y divide-border/20">
                            {popupBuyOrders.map(order => (
                              <div key={order.id} className={cn("flex items-center gap-2", isMobile ? "px-2 py-1.5" : "px-3 py-2")}>
                                <div className="flex-1 min-w-0">
                                  <div className={cn("text-muted-foreground", isMobile ? "text-[10px]" : "text-xs")}>
                                    x{order.remainingQuantity}
                                    {isAdmin && <span className="text-muted-foreground/60 ml-1">({order.buyer.username})</span>}
                                  </div>
                                </div>
                                <div className={cn("text-purple-400 font-bold", isMobile ? "text-[10px]" : "text-xs")}>
                                  {formatNumber(order.pricePerItem)} g each
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {itemListings && itemListings.length > 0 && (
                        <div>
                          <div className={cn("font-medium flex items-center gap-2", isMobile ? "text-xs mb-1.5" : "text-sm mb-2")}>
                            <Users className={cn(isMobile ? "w-3.5 h-3.5" : "w-4 h-4")} />
                            {itemListings.length === 1 ? t('seller') : `${t('otherSellers')} (${itemListings.length})`}
                          </div>
                          <div className="border border-border/20 rounded-lg overflow-hidden">
                            {itemListingsLoading ? (
                              <div className="flex items-center justify-center h-16">
                                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              </div>
                            ) : itemListingsError ? (
                              <div className="flex flex-col items-center justify-center h-16 text-destructive">
                                <p className="text-xs mb-1">{t('error')}</p>
                                <Button variant="outline" size="sm" onClick={() => refetchItemListings()} className="h-7 text-xs border-border/30">
                                  {t('retry')}
                                </Button>
                              </div>
                            ) : (
                              <div className="divide-y divide-border/20">
                                {itemListings.map((listing, idx) => {
                                  const isCheapest = idx === 0;
                                  const isExpensive = idx === itemListings.length - 1 && itemListings.length > 1;
                                  const listingIsEnhanced = listing.enhancementData && (listing.enhancementData.enhancementLevel ?? 0) > 0;
                                  const isSelected = selectedListing?.id === listing.id;
                                  const isContributing = !listingIsEnhanced && bulkBuyBreakdown.contributingListings.has(listing.id);
                                  const takeQty = bulkBuyBreakdown.listingContributions[listing.id] ?? 0;

                                  return (
                                    <div
                                      key={listing.id}
                                      onClick={() => {
                                        setSelectedListing(listing);
                                        setBuyQuantity(1);
                                      }}
                                      className={cn(
                                        "cursor-pointer transition-all flex items-center justify-between gap-2",
                                        isMobile ? "px-2 py-2 min-h-[40px]" : "px-3 py-2.5 min-h-[48px]",
                                        listingIsEnhanced
                                          ? isSelected ? "bg-primary/20" : "hover:bg-muted/30"
                                          : isContributing
                                            ? "bg-primary/10 shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                                            : "opacity-60 hover:opacity-80"
                                      )}
                                      data-testid={`seller-listing-${listing.id}`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <div className={cn("text-muted-foreground shrink-0", isMobile ? "text-[10px]" : "text-xs")}>
                                          {!listingIsEnhanced && isContributing && takeQty > 0 ? (
                                            <span className="text-primary font-medium">x{takeQty}/{listing.quantity}</span>
                                          ) : (
                                            <span>x{listing.quantity}</span>
                                          )}
                                          {listing.seller?.username && (
                                            <span className="text-muted-foreground/60 ml-1">({listing.seller.username})</span>
                                          )}
                                        </div>
                                      </div>
                                      <GoldDisplay 
                                        amount={listing.pricePerItem} 
                                        size="xs"
                                        className={cn(
                                          isCheapest ? "text-green-400" : isExpensive ? "text-red-400" : "text-yellow-400"
                                        )}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
