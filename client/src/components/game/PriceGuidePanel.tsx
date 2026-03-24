import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/gameMath";
import { translateItemName, getItemRarityColor } from "@/lib/items";
import { getItemImage } from "@/lib/itemImages";
import { getAuthHeaders } from "@/context/FirebaseAuthContext";
import {
  TrendUp, TrendDown, Minus, MagnifyingGlass,
  CaretLeft, CaretRight, ChartLine, Clock,
  CurrencyDollarSimple, Package,
} from "@phosphor-icons/react";

interface PriceGuideItem {
  itemId: string;
  avgPrice24h: number;
  volume24h: number;
  sales24h: number;
  avgPriceAllTime: number;
  volumeAllTime: number;
  trend: "rising" | "falling" | "stable";
  lastSale: string;
}

interface PriceHistoryData {
  itemId: string;
  recentSales: { quantity: number; pricePerItem: number; region: string | null; soldAt: string }[];
  stats24h: { avgPrice: number; totalVolume: number; saleCount: number };
  stats7d: { avgPrice: number; totalVolume: number; saleCount: number };
  trend: "rising" | "falling" | "stable";
  suggestedPrice: number | null;
}

const TrendIcon = ({ trend, size = "sm" }: { trend: string; size?: "sm" | "lg" }) => {
  const cls = size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5";
  if (trend === "rising") return <TrendUp className={cn(cls, "text-green-400")} weight="bold" />;
  if (trend === "falling") return <TrendDown className={cn(cls, "text-red-400")} weight="bold" />;
  return <Minus className={cn(cls, "text-gray-500")} weight="bold" />;
};

const TrendBadge = ({ trend }: { trend: string }) => {
  const color = trend === "rising" ? "border-green-600/40 bg-green-950/30 text-green-400"
    : trend === "falling" ? "border-red-600/40 bg-red-950/30 text-red-400"
    : "border-gray-600/40 bg-gray-950/30 text-gray-400";
  const label = trend === "rising" ? "Rising" : trend === "falling" ? "Falling" : "Stable";
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", color)}>
      <TrendIcon trend={trend} />
      <span className="ml-1">{label}</span>
    </Badge>
  );
};

export function PriceGuidePanel({ language, isMobile }: { language: string; isMobile: boolean }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ items: PriceGuideItem[]; total: number; page: number; limit: number }>({
    queryKey: ["/api/market/price-guide", debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/market/price-guide?${params}`, { headers });
      return res.json();
    },
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<PriceHistoryData>({
    queryKey: ["/api/market/price-history", selectedItem],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/market/price-history/${encodeURIComponent(selectedItem!)}`, { headers });
      return res.json();
    },
    enabled: !!selectedItem,
  });

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    setPage(1);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(val), 400);
  }, []);

  const items = data?.items || [];
  const totalPages = Math.ceil((data?.total || 0) / 20);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search items..."
            className="pl-8 h-9 bg-background/60 border-border/30"
            data-testid="price-guide-search"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <ChartLine className="w-8 h-8 text-amber-400 animate-pulse" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <ChartLine className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>No price data available yet</p>
          <p className="text-xs mt-1">Prices will appear as items are traded on the marketplace</p>
        </div>
      ) : (
        <>
          <div className={cn("grid gap-1.5", isMobile ? "grid-cols-1" : "grid-cols-1")}>
            {items.map((item) => {
              const displayName = translateItemName(item.itemId, language);
              const itemImg = getItemImage(item.itemId);
              const rarityColor = getItemRarityColor(item.itemId);

              return (
                <Card
                  key={item.itemId}
                  className="border-border/20 bg-background/40 hover:bg-background/60 cursor-pointer transition-colors"
                  onClick={() => setSelectedItem(item.itemId)}
                  data-testid={`price-guide-item-${item.itemId}`}
                >
                  <CardContent className="p-2.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-black/40 border border-border/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {itemImg ? (
                        <img src={itemImg} alt="" className="w-7 h-7 object-contain" style={{ imageRendering: "pixelated" }} />
                      ) : (
                        <Package className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium truncate", rarityColor || "text-gray-200")}>
                        {displayName}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{item.sales24h} sales (24h)</span>
                        <span>·</span>
                        <span>{formatNumber(item.volumeAllTime)} total traded</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-sm font-bold text-amber-400">{formatNumber(item.avgPrice24h || item.avgPriceAllTime)}</span>
                          <CurrencyDollarSimple className="w-3.5 h-3.5 text-amber-500" weight="bold" />
                        </div>
                        <p className="text-[10px] text-muted-foreground">avg price</p>
                      </div>
                      <TrendIcon trend={item.trend} size="lg" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} data-testid="price-guide-prev">
                <CaretLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} data-testid="price-guide-next">
                <CaretRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className={cn("max-w-md", isMobile && "max-w-[95vw]")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ChartLine className="w-5 h-5 text-amber-400" />
              {selectedItem ? translateItemName(selectedItem, language) : "Price History"}
            </DialogTitle>
          </DialogHeader>

          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <ChartLine className="w-6 h-6 text-amber-400 animate-pulse" />
            </div>
          ) : historyData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-700/20">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">24h Average</p>
                  <p className="text-lg font-bold text-amber-400">{formatNumber(historyData.stats24h.avgPrice)}</p>
                  <p className="text-[10px] text-muted-foreground">{historyData.stats24h.saleCount} sales · {formatNumber(historyData.stats24h.totalVolume)} vol</p>
                </div>
                <div className="p-2.5 rounded-lg bg-blue-950/20 border border-blue-700/20">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">7d Average</p>
                  <p className="text-lg font-bold text-blue-400">{formatNumber(historyData.stats7d.avgPrice)}</p>
                  <p className="text-[10px] text-muted-foreground">{historyData.stats7d.saleCount} sales · {formatNumber(historyData.stats7d.totalVolume)} vol</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Trend:</span>
                  <TrendBadge trend={historyData.trend} />
                </div>
                {historyData.suggestedPrice && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Suggested:</span>
                    <span className="text-sm font-bold text-green-400">{formatNumber(historyData.suggestedPrice)}</span>
                    <CurrencyDollarSimple className="w-3 h-3 text-green-500" weight="bold" />
                  </div>
                )}
              </div>

              {historyData.recentSales.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Recent Sales</p>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-1">
                      {historyData.recentSales.map((sale, i) => (
                        <div key={i} className="flex items-center justify-between p-1.5 rounded bg-background/30 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">x{sale.quantity}</span>
                            {sale.region && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 border-border/30">
                                {sale.region}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-amber-400">{formatNumber(sale.pricePerItem)}</span>
                            <CurrencyDollarSimple className="w-3 h-3 text-amber-500" weight="bold" />
                          </div>
                          <span className="text-muted-foreground flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {new Date(sale.soldAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
