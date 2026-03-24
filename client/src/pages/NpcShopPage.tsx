import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGame } from "@/context/GameContext";
import { useAudio } from "@/context/AudioContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { apiRequest } from "@/lib/queryClient";
import { translateItemName } from "@/lib/items";
import { formatNumber } from "@/lib/gameMath";
import { useToast } from "@/hooks/use-toast";
import { Clock, Coins, ShoppingCart } from "@phosphor-icons/react";
import { getLocalizedRegionName } from "@/lib/gameTranslations";
import { getItemImage, ITEM_PLACEHOLDER } from "@/lib/itemImages";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/useMobile";
import { trackNpcPurchase, trackGoldSpent } from "@/hooks/useAchievementTracker";
import { getInventoryLimit } from "@shared/inventoryLimits";

interface ShopStock {
  id: string;
  shop_id: string;
  item_id: string;
  quantity: number;
  price_per_item: number;
  reset_date: string;
  item_name: string | null;
  item_icon: string | null;
  name_translations: Record<string, string> | null;
  remainingQuantity: number;
  purchasedToday: number;
}

interface NpcShop {
  id: string;
  region_id: string;
  name: string;
  name_translations: Record<string, string>;
  description: string | null;
  description_translations: Record<string, string>;
  stock: ShopStock[];
}

interface ShopResponse {
  shop: NpcShop | null;
  timeUntilReset: number;
}

const REGION_COLORS: Record<string, { bg: string; border: string; text: string; plate: string }> = {
  verdant: { bg: "bg-green-500/20", border: "border-green-500/40", text: "text-green-400", plate: "bg-green-600/30" },
  quarry: { bg: "bg-amber-500/20", border: "border-amber-500/40", text: "text-amber-400", plate: "bg-amber-600/30" },
  dunes: { bg: "bg-yellow-500/20", border: "border-yellow-500/40", text: "text-yellow-400", plate: "bg-yellow-600/30" },
  obsidian: { bg: "bg-purple-500/20", border: "border-purple-500/40", text: "text-purple-400", plate: "bg-purple-600/30" },
  dragonspire: { bg: "bg-red-500/20", border: "border-red-500/40", text: "text-red-400", plate: "bg-red-600/30" },
  frozen_wastes: { bg: "bg-blue-500/20", border: "border-blue-500/40", text: "text-blue-400", plate: "bg-blue-600/30" },
  void_realm: { bg: "bg-violet-500/20", border: "border-violet-500/40", text: "text-violet-400", plate: "bg-violet-600/30" },
};

export default function NpcShopPage() {
  const { player, language, gold, currentRegion, refreshPlayer, inventory } = useGame();
  const { toast } = useToast();
  const { playSfx } = useAudio();
  const queryClient = useQueryClient();
  const { isMobile } = useMobile();
  const [buyPopoverOpen, setBuyPopoverOpen] = useState<string | null>(null);
  const [buyQuantity, setBuyQuantity] = useState(1);
  
  const getItemName = (item: ShopStock) => {
    if (item.name_translations?.[language]) {
      return item.name_translations[language];
    }
    return translateItemName(item.item_id, language);
  };

  const { data, isLoading, isError, error } = useQuery<ShopResponse>({
    queryKey: ["/api/npc-shops", currentRegion],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/npc-shops/${currentRegion}`);
      return response.json();
    },
    refetchInterval: 60000,
    enabled: !!currentRegion && !!player,
    retry: 2,
  });

  const buyMutation = useMutation({
    mutationFn: async ({ stockId, quantity }: { stockId: string; quantity: number }) => {
      const response = await apiRequest("POST", `/api/npc-shops/${stockId}/buy`, { quantity });
      return response.json();
    },
    onMutate: async ({ stockId, quantity }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/npc-shops", currentRegion] });
      const previousData = queryClient.getQueryData<ShopResponse>(["/api/npc-shops", currentRegion]);
      if (previousData?.shop) {
        const updatedStock = previousData.shop.stock
          .map((item) => {
            if (item.id !== stockId) return item;
            const newRemaining = item.remainingQuantity === -1 ? -1 : item.remainingQuantity - quantity;
            return { ...item, remainingQuantity: newRemaining, purchasedToday: item.purchasedToday + quantity };
          })
          .filter((item) => item.remainingQuantity === -1 || item.remainingQuantity > 0);
        queryClient.setQueryData<ShopResponse>(["/api/npc-shops", currentRegion], {
          ...previousData,
          shop: { ...previousData.shop, stock: updatedStock },
        });
      }
      return { previousData };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/npc-shops"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player"] });
      refreshPlayer();
      trackNpcPurchase();
      playSfx('ui', 'buy');
      if (data.totalCost) trackGoldSpent(data.totalCost);
      toast({
        title: "Purchase Successful",
        description: `Bought ${data.quantity}x ${translateItemName(data.itemId || data.item_id, language)}`,
      });
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["/api/npc-shops", currentRegion], context.previousData);
      }
      let description = error.message || "Could not complete purchase";
      try {
        const parsed = JSON.parse(error.message || "{}");
        if (parsed.error === "INVENTORY_LIMIT") {
          description = `Inventory limit reached (${parsed.currentQty}/${parsed.limit})`;
        }
      } catch {}
      toast({
        title: "Purchase Failed",
        description,
        variant: "destructive",
      });
    },
  });

  const formatTimeUntilReset = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="text-destructive font-medium">Failed to load shop</div>
        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/npc-shops", currentRegion] })}>
          Retry
        </Button>
      </div>
    );
  }

  const shop = data?.shop || null;
  const timeUntilReset = data?.timeUntilReset || 0;
  const colors = REGION_COLORS[currentRegion || "verdant"] || REGION_COLORS.verdant;

  return (
    <div className={cn("container mx-auto p-4 max-w-4xl", isMobile && "pb-24")}>
      {/* Region Header - horizontal single line at top */}
      <div 
        data-testid="npc-shop-region-header"
        className={cn(
          "w-full text-center py-3 rounded-xl font-semibold text-lg mb-4",
          colors.plate,
          colors.text,
          colors.border,
          "border"
        )}
      >
        {getLocalizedRegionName(language, currentRegion || "verdant")}
      </div>

      {/* Items Grid */}
      {shop && shop.stock && shop.stock.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {shop.stock.map((item) => {
              const canAfford = gold >= item.price_per_item;
              const inStock = item.remainingQuantity === -1 || item.remainingQuantity > 0;
              const invLimit = getInventoryLimit(item.item_id);
              const currentOwned = inventory[item.item_id] || 0;
              const atLimit = invLimit !== null && currentOwned >= invLimit;
              const spaceLeft = invLimit !== null ? Math.max(0, invLimit - currentOwned) : Infinity;
              
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    colors.bg,
                    colors.border,
                    (!canAfford || atLimit) && "opacity-60"
                  )}
                >
                  {/* Item Image */}
                  <div className="w-14 h-14 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={getItemImage(item.item_id)}
                      alt={getItemName(item)}
                      className="w-12 h-12 object-contain"
                      onError={(e) => { e.currentTarget.src = ITEM_PLACEHOLDER; }}
                    />
                  </div>
                  
                  {/* Item Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground truncate">
                      {getItemName(item)}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-yellow-500 font-medium text-sm">
                        <Coins className="w-4 h-4" weight="fill" />
                        {formatNumber(item.price_per_item)}
                      </span>
                      {item.remainingQuantity !== -1 && (
                        <span className="text-xs text-muted-foreground">
                          Stock: {item.remainingQuantity}
                        </span>
                      )}
                      {invLimit !== null && (
                        <span className={cn("text-xs font-mono", atLimit ? "text-red-400" : "text-muted-foreground")}>
                          {currentOwned}/{invLimit}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Buy Button with Bulk Buy Popover */}
                  <Popover
                    open={buyPopoverOpen === item.id}
                    onOpenChange={(open) => {
                      if (open) {
                        setBuyPopoverOpen(item.id);
                        setBuyQuantity(1);
                      } else {
                        setBuyPopoverOpen(null);
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        size="sm"
                        data-testid={`button-buy-${item.item_id}`}
                        disabled={buyMutation.isPending || !inStock || !canAfford || atLimit}
                        className={cn(
                          "min-w-[70px] font-semibold",
                          canAfford && inStock 
                            ? "bg-amber-600 hover:bg-amber-500 text-white border border-amber-500/50" 
                            : "bg-slate-700 text-slate-400 border border-slate-600",
                          "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                      >
                        <ShoppingCart className="w-4 h-4 mr-1" />
                        {!inStock ? "Sold" : "Buy"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 bg-card border-border" side="top" align="end">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">Quantity</span>
                          <span className="text-sm font-bold text-foreground">{buyQuantity}</span>
                        </div>
                        <Slider
                          value={[buyQuantity]}
                          onValueChange={(val) => setBuyQuantity(val[0])}
                          min={1}
                          max={Math.max(1, Math.min(
                            item.remainingQuantity === -1 ? 999 : item.remainingQuantity,
                            Math.floor(gold / item.price_per_item),
                            spaceLeft === Infinity ? 999 : spaceLeft
                          ))}
                          step={1}
                          className="w-full"
                        />
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Total</span>
                          <span className="text-yellow-400 font-bold">
                            {formatNumber(item.price_per_item * buyQuantity)} gold
                          </span>
                        </div>
                        {gold < item.price_per_item * buyQuantity && (
                          <div className="text-xs text-red-400">Not enough gold</div>
                        )}
                        <Button
                          size="sm"
                          className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold"
                          disabled={gold < item.price_per_item * buyQuantity || buyMutation.isPending}
                          onClick={() => {
                            buyMutation.mutate({ stockId: item.id, quantity: buyQuantity });
                            setBuyPopoverOpen(null);
                          }}
                          data-testid={`button-confirm-buy-${item.item_id}`}
                        >
                          {buyMutation.isPending ? "..." : `Buy ${buyQuantity}x`}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              );
            })}
          </div>
          
          {/* Refresh Timer - horizontal single line at bottom */}
          <div 
            data-testid="npc-shop-refresh-timer"
            className="flex items-center justify-center gap-2 mt-4 py-2 text-sm text-muted-foreground border-t border-slate-700/50"
          >
            <Clock className="w-4 h-4" />
            <span>Stock refreshes in {formatTimeUntilReset(timeUntilReset)}</span>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          {!currentRegion 
            ? "Travel to a region to access its shop" 
            : "No items available in this shop"}
        </div>
      )}
    </div>
  );
}
