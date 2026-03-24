import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/gameMath";
import { translateItemName, getItemRarityColor } from "@/lib/items";
import { getItemImage } from "@/lib/itemImages";
import { getAuthHeaders } from "@/context/FirebaseAuthContext";
import {
  MapPin, TrendUp, TrendDown, Minus,
  Package, CurrencyDollarSimple, Storefront,
  ArrowRight,
} from "@phosphor-icons/react";

const REGIONS = [
  { id: "verdant", name: "Verdant Valley", bgClass: "border-green-700/30 bg-green-950/10", badgeClass: "border-green-600/40 bg-green-950/40 text-green-400", selectedRing: "ring-1 ring-green-500/30", dotClass: "bg-green-500" },
  { id: "quarry", name: "Ashen Quarry", bgClass: "border-amber-700/30 bg-amber-950/10", badgeClass: "border-amber-600/40 bg-amber-950/40 text-amber-400", selectedRing: "ring-1 ring-amber-500/30", dotClass: "bg-amber-500" },
  { id: "dunes", name: "Star Dunes", bgClass: "border-yellow-700/30 bg-yellow-950/10", badgeClass: "border-yellow-600/40 bg-yellow-950/40 text-yellow-400", selectedRing: "ring-1 ring-yellow-500/30", dotClass: "bg-yellow-500" },
  { id: "obsidian", name: "Obsidian Keep", bgClass: "border-purple-700/30 bg-purple-950/10", badgeClass: "border-purple-600/40 bg-purple-950/40 text-purple-400", selectedRing: "ring-1 ring-purple-500/30", dotClass: "bg-purple-500" },
  { id: "dragonspire", name: "Dragonspire", bgClass: "border-red-700/30 bg-red-950/10", badgeClass: "border-red-600/40 bg-red-950/40 text-red-400", selectedRing: "ring-1 ring-red-500/30", dotClass: "bg-red-500" },
  { id: "frozen_wastes", name: "Frozen Wastes", bgClass: "border-cyan-700/30 bg-cyan-950/10", badgeClass: "border-cyan-600/40 bg-cyan-950/40 text-cyan-400", selectedRing: "ring-1 ring-cyan-500/30", dotClass: "bg-cyan-500" },
  { id: "void_realm", name: "Void Realm", bgClass: "border-indigo-700/30 bg-indigo-950/10", badgeClass: "border-indigo-600/40 bg-indigo-950/40 text-indigo-400", selectedRing: "ring-1 ring-indigo-500/30", dotClass: "bg-indigo-500" },
] as const;

interface RegionalItem {
  itemId: string;
  listingCount: number;
  totalQuantity: number;
  lowestPrice: number;
  avgPrice: number;
}

export function TradingPostPanel({ language, isMobile, playerRegion }: { language: string; isMobile: boolean; playerRegion: string }) {
  const [selectedRegion, setSelectedRegion] = useState(playerRegion || "verdant");

  const { data: supplyData, isLoading } = useQuery<{ regions: Record<string, RegionalItem[]> }>({
    queryKey: ["/api/market/regional-supply"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/market/regional-supply", { headers });
      return res.json();
    },
    refetchInterval: 60000,
  });

  const regionData = supplyData?.regions || {};
  const currentRegionItems = regionData[selectedRegion] || [];
  const currentRegionInfo = REGIONS.find(r => r.id === selectedRegion)!;
  const isCurrentRegion = selectedRegion === playerRegion;

  const totalListingsPerRegion = Object.fromEntries(
    Object.entries(regionData).map(([r, items]) => [r, (items as RegionalItem[]).reduce((sum, i) => sum + i.totalQuantity, 0)])
  );

  return (
    <div className="space-y-3">
      <div className={cn("flex gap-1.5 flex-wrap", isMobile && "gap-1")}>
        {REGIONS.map((region) => {
          const isSelected = selectedRegion === region.id;
          const isPlayer = playerRegion === region.id;
          const qty = totalListingsPerRegion[region.id] || 0;

          return (
            <Button
              key={region.id}
              variant="outline"
              size="sm"
              onClick={() => setSelectedRegion(region.id)}
              className={cn(
                "text-[10px] px-2 py-1 h-7 transition-all relative",
                isSelected
                  ? `${region.badgeClass} ${region.selectedRing}`
                  : "border-border/20 text-muted-foreground hover:text-foreground",
              )}
              data-testid={`trading-post-region-${region.id}`}
            >
              <div className={cn("w-1.5 h-1.5 rounded-full mr-1", region.dotClass)} />
              <span className={isMobile ? "hidden sm:inline" : ""}>{region.name}</span>
              {isMobile && <span className="sm:hidden">{region.name.split(" ")[0]}</span>}
              {isPlayer && (
                <MapPin className="w-2.5 h-2.5 ml-0.5 text-amber-400" weight="fill" />
              )}
              {qty > 0 && (
                <span className="ml-1 text-[9px] opacity-60">{qty}</span>
              )}
            </Button>
          );
        })}
      </div>

      <div className={cn("rounded-lg p-3 border", currentRegionInfo.bgClass)}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Storefront className="w-5 h-5 text-amber-400" weight="bold" />
            <div>
              <h3 className="text-sm font-bold">{currentRegionInfo.name} Trading Post</h3>
              <p className="text-[10px] text-muted-foreground">
                {currentRegionItems.length} items · {totalListingsPerRegion[selectedRegion] || 0} total listings
              </p>
            </div>
          </div>
          {isCurrentRegion && (
            <Badge variant="outline" className="text-[10px] border-amber-600/40 bg-amber-950/30 text-amber-400">
              <MapPin className="w-3 h-3 mr-0.5" weight="fill" /> Your Region
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Storefront className="w-8 h-8 text-amber-400/50 animate-pulse" />
          </div>
        ) : currentRegionItems.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No items listed in this region</p>
            <p className="text-xs mt-1">Be the first to sell here!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {currentRegionItems.slice(0, 20).map((item) => {
              const displayName = translateItemName(item.itemId, language);
              const itemImg = getItemImage(item.itemId);
              const rarityColor = getItemRarityColor(item.itemId);

              const otherRegionPrices = Object.entries(regionData)
                .filter(([r]) => r !== selectedRegion)
                .map(([r, items]) => {
                  const match = (items as RegionalItem[]).find(i => i.itemId === item.itemId);
                  return match ? { region: r, avgPrice: match.avgPrice } : null;
                })
                .filter(Boolean) as { region: string; avgPrice: number }[];

              const cheaperElsewhere = otherRegionPrices.filter(p => p.avgPrice < item.avgPrice);
              const moreExpensiveElsewhere = otherRegionPrices.filter(p => p.avgPrice > item.avgPrice * 1.1);

              return (
                <div
                  key={item.itemId}
                  className="flex items-center gap-2.5 p-2 rounded-md bg-black/20 border border-border/10 hover:border-border/30 transition-colors"
                  data-testid={`trading-post-item-${item.itemId}`}
                >
                  <div className="w-8 h-8 rounded bg-black/40 border border-border/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {itemImg ? (
                      <img src={itemImg} alt="" className="w-6 h-6 object-contain" style={{ imageRendering: "pixelated" }} />
                    ) : (
                      <Package className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs font-medium truncate", rarityColor || "text-gray-200")}>
                      {displayName}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>{item.listingCount} sellers</span>
                      <span>·</span>
                      <span>x{formatNumber(item.totalQuantity)}</span>
                      {item.totalQuantity > 50 && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 border-green-700/30 text-green-400">
                          High Supply
                        </Badge>
                      )}
                      {item.totalQuantity <= 5 && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 border-red-700/30 text-red-400">
                          Low Supply
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-0.5 justify-end">
                        <span className="text-xs font-bold text-amber-400">{formatNumber(item.lowestPrice)}</span>
                        <CurrencyDollarSimple className="w-3 h-3 text-amber-500" weight="bold" />
                      </div>
                      <p className="text-[9px] text-muted-foreground">lowest</p>
                    </div>
                    {moreExpensiveElsewhere.length > 0 && (
                      <div className="flex items-center gap-0.5 text-green-400" title={`Sells for more in ${moreExpensiveElsewhere.map(p => REGIONS.find(r => r.id === p.region)?.name || p.region).join(", ")}`}>
                        <ArrowRight className="w-3 h-3" />
                        <TrendUp className="w-3 h-3" weight="bold" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
