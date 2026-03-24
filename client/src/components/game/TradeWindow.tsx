import { useState, useEffect, useCallback } from "react";
import { useTrade } from "@/context/TradeContext";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Handshake, X, Check, CheckCircle, ArrowRight, Package, CurrencyDollar } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { parseItemWithRarity, RARITY_COLORS, RARITY_BG_COLORS, translateItemName } from "@/lib/items";
import { getItemImage } from "@/lib/itemImages";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import type { TradeItems } from "@shared/schema";

export default function TradeWindow() {
  const { activeTrade, updateMyItems, updateMyGold, confirmTrade, unconfirmTrade, cancelTrade } = useTrade();
  const { inventory, gold, refreshPlayer } = useGame();
  const { t, language } = useLanguage();
  const [selectedItems, setSelectedItems] = useState<TradeItems>({});
  const [goldInput, setGoldInput] = useState("");
  const [quantityDialog, setQuantityDialog] = useState<{ itemId: string } | null>(null);
  const [sliderValue, setSliderValue] = useState(1);

  const dialogAvailable = quantityDialog 
    ? Math.max(0, ((inventory as Record<string, number>)[quantityDialog.itemId] || 0) - (selectedItems[quantityDialog.itemId] || 0))
    : 0;

  useEffect(() => {
    if (quantityDialog && dialogAvailable > 0) {
      setSliderValue(prev => Math.min(prev, dialogAvailable));
    } else if (quantityDialog && dialogAvailable <= 0) {
      setQuantityDialog(null);
    }
  }, [dialogAvailable, quantityDialog]);

  useEffect(() => {
    if (activeTrade) {
      setSelectedItems(activeTrade.myItems);
      setGoldInput(activeTrade.myGold > 0 ? String(activeTrade.myGold) : "");
    }
  }, [activeTrade?.tradeId]);

  useEffect(() => {
    if (!activeTrade) {
      setSelectedItems({});
      setGoldInput("");
      refreshPlayer();
    }
  }, [activeTrade]);

  if (!activeTrade) return null;

  const inventoryItems = Object.entries(inventory as Record<string, number>)
    .filter(([_, qty]) => qty > 0);

  const openQuantityDialog = (itemId: string) => {
    const currentInInventory = (inventory as Record<string, number>)[itemId] || 0;
    const currentSelected = selectedItems[itemId] || 0;
    const available = currentInInventory - currentSelected;
    
    if (available > 0) {
      setQuantityDialog({ itemId });
      setSliderValue(1);
    }
  };

  const handleAddWithQuantity = () => {
    if (!quantityDialog) return;
    const { itemId } = quantityDialog;
    const currentInInventory = (inventory as Record<string, number>)[itemId] || 0;
    const currentSelected = selectedItems[itemId] || 0;
    const available = currentInInventory - currentSelected;
    const amountToAdd = Math.min(sliderValue, available);
    if (amountToAdd > 0) {
      const newItems = { ...selectedItems, [itemId]: currentSelected + amountToAdd };
      setSelectedItems(newItems);
      updateMyItems(newItems);
    }
    setQuantityDialog(null);
  };

  const handleRemoveAll = (itemId: string) => {
    const newItems = { ...selectedItems };
    delete newItems[itemId];
    setSelectedItems(newItems);
    updateMyItems(newItems);
  };

  const handleGoldChange = useCallback((value: string) => {
    const numStr = value.replace(/[^0-9]/g, '');
    const num = parseInt(numStr, 10) || 0;
    const clamped = Math.min(num, gold);
    setGoldInput(clamped > 0 ? String(clamped) : numStr === "" ? "" : "0");
    updateMyGold(clamped);
  }, [gold, updateMyGold]);

  const handleConfirm = () => {
    if (activeTrade.myConfirmed) {
      unconfirmTrade();
    } else {
      confirmTrade();
    }
  };

  const mySelectedItems = Object.entries(selectedItems).filter(([_, qty]) => qty > 0);
  const partnerSelectedItems = Object.entries(activeTrade.partnerItems as TradeItems).filter(([_, qty]) => qty > 0);

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="w-6 h-6 text-primary" weight="fill" />
            {t('trade')}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{t('yourOffer')}</h3>
              {activeTrade.myConfirmed && (
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <CheckCircle className="w-4 h-4" weight="fill" />
                  {t('tradeConfirmed')}
                </span>
              )}
            </div>
            
            <div className="min-h-[100px] p-3 rounded-lg bg-muted/50 border border-border">
              {mySelectedItems.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {t('selectItemFromBelow')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {mySelectedItems.map(([itemId, qty]) => {
                    const { baseId, rarity } = parseItemWithRarity(itemId);
                    const rarityColor = rarity ? RARITY_COLORS[rarity] : "text-gray-300";
                    const itemImg = getItemImage(itemId);
                    return (
                      <button
                        key={itemId}
                        onClick={() => handleRemoveAll(itemId)}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:border-destructive transition-colors min-w-[80px]",
                          rarity && rarity !== "Common" ? RARITY_BG_COLORS[rarity] : "bg-card border border-border"
                        )}
                        disabled={activeTrade.myConfirmed}
                        data-testid={`trade-my-item-${itemId}`}
                      >
                        <div className="w-7 h-7 rounded bg-black/40 flex items-center justify-center shrink-0">
                          {itemImg ? (
                            <img src={itemImg} alt={baseId} className="w-[90%] h-[90%] object-contain pixelated" />
                          ) : (
                            <Package className="w-[70%] h-[70%] text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex flex-col items-start flex-1 min-w-0">
                          <span className={cn("font-medium text-left leading-tight truncate w-full", rarity && rarity !== "Common" ? rarityColor : "")}>
                            {translateItemName(baseId, language)}
                          </span>
                          {rarity && rarity !== "Common" && (
                            <span className={cn("text-[10px]", rarityColor)}>{rarity}</span>
                          )}
                        </div>
                        <span className="text-primary font-bold">x{qty}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <CurrencyDollar className="w-4 h-4 text-yellow-500" weight="fill" />
              <Input
                type="text"
                inputMode="numeric"
                value={goldInput}
                onChange={(e) => handleGoldChange(e.target.value)}
                placeholder="0"
                disabled={activeTrade.myConfirmed}
                className="h-8 text-sm w-28"
                data-testid="input-trade-gold"
              />
              <span className="text-xs text-muted-foreground">/ {gold.toLocaleString()}</span>
            </div>

            <div>
              <h4 className="text-xs text-muted-foreground mb-2">{t('yourInventory')} (x{inventoryItems.length})</h4>
              <ScrollArea className="h-[150px]">
                <div className="flex flex-wrap gap-1.5">
                  {inventoryItems.map(([itemId, qty]) => {
                    const selectedQty = selectedItems[itemId] || 0;
                    const available = qty - selectedQty;
                    const { baseId, rarity } = parseItemWithRarity(itemId);
                    const rarityColor = rarity ? RARITY_COLORS[rarity] : "text-gray-300";
                    const itemImg = getItemImage(itemId);
                    return (
                      <button
                        key={itemId}
                        onClick={() => openQuantityDialog(itemId)}
                        disabled={available <= 0 || activeTrade.myConfirmed}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors min-w-[90px]",
                          available > 0 && !activeTrade.myConfirmed
                            ? (rarity && rarity !== "Common" ? RARITY_BG_COLORS[rarity] + " hover:brightness-110" : "bg-card border border-border hover:border-primary")
                            : "bg-muted/30 text-muted-foreground cursor-not-allowed border border-transparent"
                        )}
                        data-testid={`trade-inventory-item-${itemId}`}
                      >
                        <div className="w-7 h-7 rounded bg-black/40 flex items-center justify-center shrink-0">
                          {itemImg ? (
                            <img src={itemImg} alt={baseId} className="w-[90%] h-[90%] object-contain pixelated" />
                          ) : (
                            <Package className="w-[70%] h-[70%] text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex flex-col items-start flex-1 min-w-0">
                          <span className={cn("font-medium text-left leading-tight truncate w-full", rarity && rarity !== "Common" ? rarityColor : "")}>
                            {translateItemName(baseId, language)}
                          </span>
                          {rarity && rarity !== "Common" && (
                            <span className={cn("text-[10px]", rarityColor)}>{rarity}</span>
                          )}
                          <span className="text-muted-foreground text-[10px]">{t('stockLabel')}: {available}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{t('partnerOffer')}</h3>
              {activeTrade.partnerConfirmed && (
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <CheckCircle className="w-4 h-4" weight="fill" />
                  {t('tradeConfirmed')}
                </span>
              )}
            </div>
            
            <div className="min-h-[100px] p-3 rounded-lg bg-muted/50 border border-border">
              {partnerSelectedItems.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {t('partnerNoItemsYet')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {partnerSelectedItems.map(([itemId, qty]) => {
                    const { baseId, rarity } = parseItemWithRarity(itemId);
                    const rarityColor = rarity ? RARITY_COLORS[rarity] : "text-gray-300";
                    const itemImg = getItemImage(itemId);
                    return (
                      <div
                        key={itemId}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded text-xs min-w-[80px]",
                          rarity && rarity !== "Common" ? RARITY_BG_COLORS[rarity] : "bg-card border border-border"
                        )}
                        data-testid={`trade-partner-item-${itemId}`}
                      >
                        <div className="w-7 h-7 rounded bg-black/40 flex items-center justify-center shrink-0">
                          {itemImg ? (
                            <img src={itemImg} alt={baseId} className="w-[90%] h-[90%] object-contain pixelated" />
                          ) : (
                            <Package className="w-[70%] h-[70%] text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex flex-col items-start flex-1 min-w-0">
                          <span className={cn("font-medium text-left leading-tight truncate w-full", rarity && rarity !== "Common" ? rarityColor : "")}>
                            {translateItemName(baseId, language)}
                          </span>
                          {rarity && rarity !== "Common" && (
                            <span className={cn("text-[10px]", rarityColor)}>{rarity}</span>
                          )}
                        </div>
                        <span className="text-primary font-bold">x{qty}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {activeTrade.partnerGold > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <CurrencyDollar className="w-4 h-4 text-yellow-500" weight="fill" />
                <span className="text-sm font-medium text-yellow-500" data-testid="text-partner-gold">
                  {activeTrade.partnerGold.toLocaleString()}
                </span>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 py-4">
              <ArrowRight className="w-8 h-8 text-primary animate-pulse" weight="bold" />
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2 mt-4">
          <Button 
            variant="outline" 
            onClick={cancelTrade}
            data-testid="button-cancel-trade"
          >
            <X className="w-4 h-4 mr-2" />
            {t('cancel')}
          </Button>
          <Button 
            onClick={handleConfirm}
            variant={activeTrade.myConfirmed ? "secondary" : "default"}
            data-testid="button-confirm-trade"
          >
            <Check className="w-4 h-4 mr-2" />
            {activeTrade.myConfirmed ? t('removeConfirmation') : t('confirm')}
          </Button>
        </DialogFooter>

        {activeTrade.myConfirmed && activeTrade.partnerConfirmed && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-lg">
            <div className="text-center">
              <Handshake className="w-12 h-12 text-primary animate-bounce mx-auto" weight="fill" />
              <p className="text-lg font-semibold mt-2">{t('tradeCompleting')}</p>
            </div>
          </div>
        )}
      </DialogContent>

      <AlertDialog open={!!quantityDialog} onOpenChange={(open) => !open && setQuantityDialog(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              {t('selectQuantity')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          {quantityDialog && dialogAvailable > 0 && (() => {
            const { baseId, rarity } = parseItemWithRarity(quantityDialog.itemId);
            const rarityColor = rarity ? RARITY_COLORS[rarity] : "text-gray-300";
            return (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="font-medium">{rarity ? translateItemName(baseId, language) : translateItemName(quantityDialog.itemId, language)}</p>
                  {rarity && <p className={cn("text-sm", rarityColor)}>{rarity}</p>}
                  <p className="text-sm text-muted-foreground">{t('availableLabel')}: {dialogAvailable}</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('quantityLabel')}:</span>
                    <span className="text-lg font-bold text-primary">{sliderValue}</span>
                  </div>
                  <Slider
                    value={[sliderValue]}
                    onValueChange={(v) => setSliderValue(v[0])}
                    min={1}
                    max={dialogAvailable}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1</span>
                    <span>{dialogAvailable}</span>
                  </div>
                </div>
              </div>
            );
          })()}
          <AlertDialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setQuantityDialog(null)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleAddWithQuantity} data-testid="button-add-quantity">
              <Check className="w-4 h-4 mr-2" />
              {t('addBtn')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
