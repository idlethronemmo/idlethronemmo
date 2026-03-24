import { useState, useEffect, useCallback, useMemo } from "react";
import { useTrade } from "@/context/TradeContext";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { useMobile } from "@/hooks/useMobile";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import {
  Handshake,
  Package,
  Check,
  X,
  PaperPlaneTilt,
  MagnifyingGlass,
  ArrowDown,
  ArrowUp,
  Plus,
  CurrencyDollar,
  Chat,
  Timer,
  CheckCircle,
  XCircle,
  ArrowCounterClockwise,
  Spinner,
  User,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { parseItemWithRarity, RARITY_COLORS, RARITY_BG_COLORS, translateItemName, isItemTradable } from "@/lib/items";
import { getItemImage } from "@/lib/itemImages";
import { trackTradeCompleted } from "@/hooks/useAchievementTracker";

import avatarKnight from "@/assets/generated_images/pixel_art_knight_portrait.png";
import avatarMage from "@/assets/generated_images/pixel_art_mage_portrait.png";
import avatarArcher from "@/assets/generated_images/pixel_art_archer_portrait.png";
import avatarWarrior from "@/assets/generated_images/pixel_art_warrior_portrait.png";
import avatarRogue from "@/assets/generated_images/pixel_art_rogue_portrait.png";
import avatarHealer from "@/assets/generated_images/pixel_art_healer_portrait.png";
import avatarNecromancer from "@/assets/generated_images/pixel_art_necromancer_portrait.png";
import avatarPaladin from "@/assets/generated_images/pixel_art_paladin_portrait.png";
import avatarBerserker from "@/assets/generated_images/pixel_art_berserker_portrait.png";
import avatarDruid from "@/assets/generated_images/pixel_art_druid_portrait.png";

const AVATAR_IMAGES: Record<string, string> = {
  knight: avatarKnight,
  mage: avatarMage,
  archer: avatarArcher,
  warrior: avatarWarrior,
  rogue: avatarRogue,
  healer: avatarHealer,
  necromancer: avatarNecromancer,
  paladin: avatarPaladin,
  berserker: avatarBerserker,
  druid: avatarDruid,
};

interface PlayerResult {
  playerId: string;
  username: string;
  isOnline: boolean;
  tradeEnabled: boolean;
  totalLevel: number;
  avatar: string;
}

function ItemDisplay({ itemId, qty, onClick, disabled, showRemove }: {
  itemId: string;
  qty: number;
  onClick?: () => void;
  disabled?: boolean;
  showRemove?: boolean;
}) {
  const { language } = useLanguage();
  const { baseId, rarity } = parseItemWithRarity(itemId);
  const rarityColor = rarity ? RARITY_COLORS[rarity] : "text-gray-300";
  const itemImg = getItemImage(itemId);

  const content = (
    <div className={cn(
      "flex items-center gap-2 px-2 py-1.5 rounded text-xs min-w-[80px]",
      rarity && rarity !== "Common" ? RARITY_BG_COLORS[rarity] : "bg-card border border-border",
      onClick && !disabled ? "hover:brightness-110 cursor-pointer" : "",
      disabled ? "opacity-50 cursor-not-allowed" : "",
      showRemove ? "hover:border-destructive" : ""
    )}>
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

  if (onClick) {
    return <button onClick={onClick} disabled={disabled} data-testid={`item-${itemId}`}>{content}</button>;
  }
  return <div data-testid={`item-${itemId}`}>{content}</div>;
}

function TimeRemaining({ expiresAt }: { expiresAt: string | null }) {
  const { t } = useLanguage();
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining(t("expired")); return; }
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      if (hours > 0) setRemaining(`${hours}h ${mins}m`);
      else if (mins > 0) setRemaining(`${mins}m ${secs}s`);
      else setRemaining(`${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, t]);

  if (!expiresAt) return null;
  const isExpired = new Date(expiresAt).getTime() <= Date.now();

  return (
    <span className={cn("flex items-center gap-1 text-xs", isExpired ? "text-destructive" : "text-muted-foreground")}>
      <Timer className="w-3.5 h-3.5" weight="fill" />
      {remaining}
    </span>
  );
}

export default function TradePage() {
  const { isMobile } = useMobile();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { offers, isLoading, fetchOffers, createOffer, respondToOffer, confirmOffer, cancelOffer } = useTrade();
  const { inventory, gold, player } = useGame();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [counterOfferId, setCounterOfferId] = useState<string | null>(null);
  const [counterItems, setCounterItems] = useState<Record<string, number>>({});
  const [counterGold, setCounterGold] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<PlayerResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null);
  const [createItems, setCreateItems] = useState<Record<string, number>>({});
  const [createGold, setCreateGold] = useState(0);
  const [createMessage, setCreateMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const [quantityDialog, setQuantityDialog] = useState<{ itemId: string; target: "create" | "counter" } | null>(null);
  const [sliderValue, setSliderValue] = useState(1);

  useEffect(() => {
    fetchOffers("all");
    const interval = setInterval(() => fetchOffers("all"), 15000);
    return () => clearInterval(interval);
  }, [fetchOffers]);

  const allOffers = useMemo(() =>
    offers
      .filter(o => o.status !== "completed" && o.status !== "cancelled" && o.status !== "declined")
      .sort((a, b) => {
        const aUrgent = !a.isSender && a.senderConfirmed === 1 && a.receiverConfirmed !== 1 ? 0 : 1;
        const bUrgent = !b.isSender && b.senderConfirmed === 1 && b.receiverConfirmed !== 1 ? 0 : 1;
        return aUrgent - bUrgent;
      }),
    [offers]
  );

  const tradableInventory = useMemo(() => {
    return Object.entries(inventory as Record<string, number>)
      .filter(([id, qty]) => qty > 0 && isItemTradable(id));
  }, [inventory]);

  const currentTargetItems = quantityDialog?.target === "create" ? createItems : counterItems;

  const dialogAvailable = quantityDialog
    ? Math.max(0, ((inventory as Record<string, number>)[quantityDialog.itemId] || 0) - (currentTargetItems[quantityDialog.itemId] || 0))
    : 0;

  useEffect(() => {
    if (quantityDialog && dialogAvailable <= 0) setQuantityDialog(null);
    else if (quantityDialog && dialogAvailable > 0) setSliderValue(prev => Math.min(prev, dialogAvailable));
  }, [dialogAvailable, quantityDialog]);

  const openQuantityDialog = useCallback((itemId: string, target: "create" | "counter") => {
    const items = target === "create" ? createItems : counterItems;
    const available = ((inventory as Record<string, number>)[itemId] || 0) - (items[itemId] || 0);
    if (available > 0) { setQuantityDialog({ itemId, target }); setSliderValue(1); }
  }, [createItems, counterItems, inventory]);

  const handleAddWithQuantity = useCallback(() => {
    if (!quantityDialog) return;
    const { itemId, target } = quantityDialog;
    const items = target === "create" ? createItems : counterItems;
    const setItems = target === "create" ? setCreateItems : setCounterItems;
    const available = ((inventory as Record<string, number>)[itemId] || 0) - (items[itemId] || 0);
    const amount = Math.min(sliderValue, available);
    if (amount > 0) setItems({ ...items, [itemId]: (items[itemId] || 0) + amount });
    setQuantityDialog(null);
  }, [quantityDialog, createItems, counterItems, inventory, sliderValue]);

  const removeItem = useCallback((itemId: string, target: "create" | "counter") => {
    const setter = target === "create" ? setCreateItems : setCounterItems;
    const src = target === "create" ? createItems : counterItems;
    const n = { ...src }; delete n[itemId]; setter(n);
  }, [createItems, counterItems]);

  const handleSearch = useCallback(async () => {
    if (!searchInput.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(`/api/players/search?username=${encodeURIComponent(searchInput.trim())}`);
      const data = await response.json();
      setSearchResults(data.players || []);
      setSearchDone(true);
    } catch {
      setSearchResults([]); setSearchDone(true);
    } finally { setIsSearching(false); }
  }, [searchInput]);

  const resetCreateForm = useCallback(() => {
    setSelectedPlayer(null);
    setCreateItems({});
    setCreateGold(0);
    setCreateMessage("");
    setSearchInput("");
    setSearchResults([]);
    setSearchDone(false);
  }, []);

  const handleCreateOffer = useCallback(async () => {
    if (!selectedPlayer) return;
    if (Object.keys(createItems).length === 0 && createGold <= 0) {
      toast({ title: t("error"), description: t("tradeOfferEmpty"), variant: "destructive" });
      return;
    }
    setIsSending(true);
    const result = await createOffer(selectedPlayer.playerId, createItems, createGold, createMessage || undefined);
    setIsSending(false);
    if (result.success) {
      toast({ title: t("success"), description: t("tradeOfferSent") });
      resetCreateForm();
      setCreateDialogOpen(false);
    } else {
      toast({ title: t("error"), description: result.error || t("tradeOfferFailed"), variant: "destructive" });
    }
  }, [selectedPlayer, createItems, createGold, createMessage, createOffer, toast, t, resetCreateForm]);

  const handleDecline = useCallback(async (tradeId: string) => {
    const result = await respondToOffer(tradeId, "decline");
    if (result.success) toast({ title: t("success"), description: t("tradeOfferDeclined") });
    else toast({ title: t("error"), description: result.error || t("error"), variant: "destructive" });
  }, [respondToOffer, toast, t]);

  const handleSendCounter = useCallback(async (tradeId: string) => {
    if (Object.keys(counterItems).length === 0 && counterGold <= 0) {
      toast({ title: t("error"), description: t("tradeOfferEmpty"), variant: "destructive" });
      return;
    }
    const result = await respondToOffer(tradeId, "counter", counterItems, counterGold);
    if (result.success) {
      toast({ title: t("success"), description: t("tradeCounterSent") });
      setCounterOfferId(null); setCounterItems({}); setCounterGold(0);
    } else {
      toast({ title: t("error"), description: result.error || t("error"), variant: "destructive" });
    }
  }, [counterItems, counterGold, respondToOffer, toast, t]);

  const handleConfirm = useCallback(async (tradeId: string) => {
    const result = await confirmOffer(tradeId);
    if (result.success) {
      if (result.status === "completed") {
        trackTradeCompleted();
        toast({ title: t("success"), description: t("tradeCompleted") });
      } else {
        toast({ title: t("success"), description: t("tradeConfirmedWaiting") });
      }
    } else {
      toast({ title: t("error"), description: result.error || t("error"), variant: "destructive" });
    }
  }, [confirmOffer, toast, t]);

  const handleCancel = useCallback(async (tradeId: string) => {
    const result = await cancelOffer(tradeId);
    if (result.success) toast({ title: t("success"), description: t("tradeCancelled") });
    else toast({ title: t("error"), description: result.error || t("error"), variant: "destructive" });
  }, [cancelOffer, toast, t]);

  const renderItemsSection = (items: Record<string, number>) => {
    const entries = Object.entries(items).filter(([_, qty]) => qty > 0);
    if (entries.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([itemId, qty]) => <ItemDisplay key={itemId} itemId={itemId} qty={qty} />)}
      </div>
    );
  };

  const renderInventorySelector = (target: "create" | "counter", selectedItems: Record<string, number>) => (
    <div>
      <h4 className="text-xs text-muted-foreground mb-2">{t("yourInventory")}</h4>
      {Object.keys(selectedItems).length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground mb-1">{t("selectItemsToOffer")}</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(selectedItems).filter(([_, qty]) => qty > 0).map(([itemId, qty]) => (
              <ItemDisplay key={itemId} itemId={itemId} qty={qty} onClick={() => removeItem(itemId, target)} showRemove />
            ))}
          </div>
        </div>
      )}
      <ScrollArea className="h-[150px]">
        {tradableInventory.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">{t("noItems")}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tradableInventory.map(([itemId, qty]) => {
              const selected = selectedItems[itemId] || 0;
              const available = qty - selected;
              const { baseId, rarity } = parseItemWithRarity(itemId);
              const rarityColor = rarity ? RARITY_COLORS[rarity] : "text-gray-300";
              const itemImg = getItemImage(itemId);
              return (
                <button
                  key={itemId}
                  onClick={() => openQuantityDialog(itemId, target)}
                  disabled={available <= 0}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors min-w-[90px]",
                    available > 0
                      ? (rarity && rarity !== "Common" ? RARITY_BG_COLORS[rarity] + " hover:brightness-110" : "bg-card border border-border hover:border-primary")
                      : "bg-muted/30 text-muted-foreground cursor-not-allowed border border-transparent"
                  )}
                  data-testid={`inventory-item-${itemId}`}
                >
                  <div className="w-7 h-7 rounded bg-black/40 flex items-center justify-center shrink-0">
                    {itemImg ? <img src={itemImg} alt={baseId} className="w-[90%] h-[90%] object-contain pixelated" /> : <Package className="w-[70%] h-[70%] text-muted-foreground" />}
                  </div>
                  <div className="flex flex-col items-start flex-1 min-w-0">
                    <span className={cn("font-medium text-left leading-tight truncate w-full", rarity && rarity !== "Common" ? rarityColor : "")}>
                      {translateItemName(baseId, language)}
                    </span>
                    {rarity && rarity !== "Common" && <span className={cn("text-[10px]", rarityColor)}>{rarity}</span>}
                    <span className="text-muted-foreground text-[10px]">{t("availableLabel")}: {available}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2" data-testid="text-trade-title">
              <Handshake className="w-8 h-8 text-primary" weight="fill" />
              {t("tradePageTitle")}
            </h1>
            <p className="text-muted-foreground text-sm mt-1" data-testid="text-trade-subtitle">
              {t("tradePageSubtitle")}
            </p>
          </div>
          <Button
            onClick={() => { resetCreateForm(); setCreateDialogOpen(true); }}
            className="shrink-0"
            data-testid="button-new-trade"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {t("tradeNewOffer")}
          </Button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Spinner className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground text-sm">{t("loading")}</span>
          </div>
        )}

        {/* Unified offer list */}
        {!isLoading && (
          <div className="space-y-4">
            {allOffers.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground" data-testid="text-no-active">{t("tradeNoActive")}</p>
                </CardContent>
              </Card>
            ) : (
              allOffers.map((offer) => {
                const myConfirmed = offer.isSender ? offer.senderConfirmed === 1 : offer.receiverConfirmed === 1;
                const partnerConfirmed = offer.isSender ? offer.receiverConfirmed === 1 : offer.senderConfirmed === 1;
                const iAmWaiting = myConfirmed && !partnerConfirmed;
                const partnerIsWaiting = partnerConfirmed && !myConfirmed;

                return (
                  <Card key={offer.id} data-testid={`card-offer-${offer.id}`} className={cn(partnerIsWaiting && "border-amber-500/40")}>
                    <CardContent className="py-4 space-y-3">

                      {/* Header row */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {/* Direction badge */}
                          <span className={cn(
                            "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                            offer.isSender
                              ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                              : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          )}>
                            {offer.isSender
                              ? <><ArrowUp className="w-3 h-3" /> {t("tradeOutgoing")}</>
                              : <><ArrowDown className="w-3 h-3" /> {t("tradeIncoming")}</>
                            }
                          </span>
                          {/* Player avatar + name */}
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                            {offer.otherPlayerAvatar && AVATAR_IMAGES[offer.otherPlayerAvatar]
                              ? <img src={AVATAR_IMAGES[offer.otherPlayerAvatar]} alt="" className="w-full h-full rounded-full object-cover" />
                              : <User className="w-4 h-4 text-muted-foreground" />
                            }
                          </div>
                          <div>
                            <p className="font-semibold text-sm leading-none">{offer.otherPlayerName}</p>
                            <p className="text-xs text-muted-foreground">{t("level")} {offer.otherPlayerLevel}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {offer.status === "countered" && (
                            <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded font-medium" data-testid={`badge-status-${offer.id}`}>
                              {t("tradeCountered")}
                            </span>
                          )}
                          {offer.status === "pending" && offer.isSender && (
                            <span className="text-xs bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded font-medium" data-testid={`badge-status-${offer.id}`}>
                              {t("tradePending")}
                            </span>
                          )}
                          <TimeRemaining expiresAt={offer.expiresAt} />
                        </div>
                      </div>

                      {/* Partner waiting — urgent prompt */}
                      {partnerIsWaiting && (
                        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                          <CheckCircle className="w-4 h-4 text-amber-400 shrink-0" weight="fill" />
                          <p className="text-xs text-amber-400 font-medium">
                            {offer.otherPlayerName} {t("tradeConfirmed")} — {t("tradeAcceptConfirm")}?
                          </p>
                          <Button
                            size="sm"
                            className="ml-auto h-7 px-3 text-xs"
                            onClick={() => handleConfirm(offer.id)}
                            data-testid={`button-confirm-urgent-${offer.id}`}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" />
                            {t("tradeAcceptConfirm")}
                          </Button>
                        </div>
                      )}

                      {/* I am waiting */}
                      {iAmWaiting && (
                        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2">
                          <Spinner className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                          <p className="text-xs text-blue-400 font-medium">{t("tradeWaitingPartner")}</p>
                        </div>
                      )}

                      {/* Message */}
                      {offer.message && (
                        <div className="flex items-start gap-2 text-sm bg-muted/50 rounded p-2">
                          <Chat className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-muted-foreground text-xs">{offer.message}</p>
                        </div>
                      )}

                      {/* Offer columns */}
                      <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-2")}>
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            {offer.isSender ? t("yourOffer") : t("theirOffer")}
                          </p>
                          {renderItemsSection(offer.senderItems)}
                          {offer.senderGold > 0 && (
                            <div className="flex items-center gap-1 text-xs">
                              <CurrencyDollar className="w-4 h-4 text-yellow-500" weight="fill" />
                              <span className="text-yellow-500 font-bold">{offer.senderGold.toLocaleString()} {t("gold")}</span>
                            </div>
                          )}
                          {Object.keys(offer.senderItems).length === 0 && offer.senderGold === 0 && (
                            <p className="text-xs text-muted-foreground italic">{t("noItems")}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            {offer.isSender ? t("theyOffer") : t("theyWant")}
                          </p>
                          {renderItemsSection(offer.receiverItems)}
                          {offer.receiverGold > 0 && (
                            <div className="flex items-center gap-1 text-xs">
                              <CurrencyDollar className="w-4 h-4 text-yellow-500" weight="fill" />
                              <span className="text-yellow-500 font-bold">{offer.receiverGold.toLocaleString()} {t("gold")}</span>
                            </div>
                          )}
                          {Object.keys(offer.receiverItems).length === 0 && offer.receiverGold === 0 && (
                            <p className="text-xs text-muted-foreground italic">{t("noItems")}</p>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 flex-wrap">
                        {/* Cancel/Decline */}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => offer.isSender ? handleCancel(offer.id) : handleDecline(offer.id)}
                          data-testid={`button-cancel-${offer.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          {offer.isSender ? t("tradeCancelOffer") : t("tradeDecline")}
                        </Button>

                        {/* Counter (incoming only, not when waiting) */}
                        {!offer.isSender && !iAmWaiting && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (counterOfferId === offer.id) {
                                setCounterOfferId(null); setCounterItems({}); setCounterGold(0);
                              } else {
                                setCounterOfferId(offer.id); setCounterItems({}); setCounterGold(0);
                              }
                            }}
                            data-testid={`button-counter-${offer.id}`}
                          >
                            <ArrowCounterClockwise className="w-4 h-4 mr-1" />
                            {t("tradeCounter")}
                          </Button>
                        )}

                        {/* Confirm (incoming not yet confirmed, or outgoing when receiver confirmed) */}
                        {!iAmWaiting && !partnerIsWaiting && (
                          <>
                            {!offer.isSender && (
                              <Button
                                size="sm"
                                onClick={() => handleConfirm(offer.id)}
                                data-testid={`button-confirm-${offer.id}`}
                              >
                                <Check className="w-4 h-4 mr-1" />
                                {t("tradeAcceptConfirm")}
                              </Button>
                            )}
                            {offer.isSender && (offer.status === "countered" || offer.receiverConfirmed === 1) && (
                              <Button
                                size="sm"
                                onClick={() => handleConfirm(offer.id)}
                                data-testid={`button-confirm-outgoing-${offer.id}`}
                              >
                                <Check className="w-4 h-4 mr-1" />
                                {t("tradeAcceptConfirm")}
                              </Button>
                            )}
                          </>
                        )}
                      </div>

                      {/* Counter form */}
                      {counterOfferId === offer.id && (
                        <Card className="bg-muted/30 border-primary/30">
                          <CardContent className="py-3 space-y-3">
                            <p className="text-sm font-medium">{t("tradeYourCounterOffer")}</p>
                            {renderInventorySelector("counter", counterItems)}
                            <div className="flex items-center gap-2">
                              <CurrencyDollar className="w-5 h-5 text-yellow-500" weight="fill" />
                              <Input
                                type="number" min={0} max={gold} value={counterGold}
                                onChange={(e) => setCounterGold(Math.min(Number(e.target.value) || 0, gold))}
                                className="w-32" placeholder={t("gold")} data-testid="input-counter-gold"
                              />
                              <span className="text-xs text-muted-foreground">/ {gold.toLocaleString()}</span>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleSendCounter(offer.id)} data-testid={`button-send-counter-${offer.id}`}>
                                <PaperPlaneTilt className="w-4 h-4 mr-1" />
                                {t("tradeSendCounter")}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => { setCounterOfferId(null); setCounterItems({}); setCounterGold(0); }} data-testid="button-cancel-counter">
                                {t("cancel")}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Create Trade Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { if (!open) resetCreateForm(); setCreateDialogOpen(open); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="w-5 h-5 text-primary" weight="fill" />
              {t("tradeNewOffer")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!selectedPlayer ? (
              /* Player search */
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("tradeSearchPlayer")}</p>
                <div className="flex gap-2">
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder={t("enterCharacterName")}
                    data-testid="input-search-player"
                  />
                  <Button onClick={handleSearch} disabled={isSearching || !searchInput.trim()} data-testid="button-search-player">
                    {isSearching ? <Spinner className="w-4 h-4 animate-spin" /> : <MagnifyingGlass className="w-4 h-4" />}
                  </Button>
                </div>
                {searchDone && searchResults.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2" data-testid="text-no-results">{t("playerNotFoundSearch")}</p>
                )}
                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    {searchResults.filter(p => p.playerId !== player?.id).map((p) => (
                      <button
                        key={p.playerId}
                        onClick={() => { if (p.tradeEnabled) setSelectedPlayer(p); }}
                        disabled={!p.tradeEnabled}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left",
                          p.tradeEnabled ? "hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed"
                        )}
                        data-testid={`button-select-player-${p.playerId}`}
                      >
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          {p.avatar && AVATAR_IMAGES[p.avatar] ? <img src={AVATAR_IMAGES[p.avatar]} alt="" className="w-full h-full rounded-full object-cover" /> : <User className="w-6 h-6 text-muted-foreground" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-sm">{p.username}</p>
                          <p className="text-xs text-muted-foreground">{t("level")} {p.totalLevel}</p>
                        </div>
                        {!p.tradeEnabled && <span className="text-xs text-muted-foreground">{t("tradeDisabled")}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Offer builder */
              <div className="space-y-4">
                {/* Selected player header */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                      {selectedPlayer.avatar && AVATAR_IMAGES[selectedPlayer.avatar] ? <img src={AVATAR_IMAGES[selectedPlayer.avatar]} alt="" className="w-full h-full rounded-full object-cover" /> : <User className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{selectedPlayer.username}</p>
                      <p className="text-xs text-muted-foreground">{t("level")} {selectedPlayer.totalLevel}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPlayer(null)} data-testid="button-change-player">
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Inventory selector */}
                {renderInventorySelector("create", createItems)}

                {/* Gold */}
                <div className="flex items-center gap-2">
                  <CurrencyDollar className="w-5 h-5 text-yellow-500" weight="fill" />
                  <Input
                    type="number" min={0} max={gold} value={createGold}
                    onChange={(e) => setCreateGold(Math.min(Number(e.target.value) || 0, gold))}
                    className="w-32" placeholder={t("gold")} data-testid="input-create-gold"
                  />
                  <span className="text-xs text-muted-foreground">/ {gold.toLocaleString()}</span>
                </div>

                {/* Message */}
                <Input
                  value={createMessage}
                  onChange={(e) => setCreateMessage(e.target.value)}
                  placeholder={t("tradeMessagePlaceholder")}
                  maxLength={200}
                  data-testid="input-create-message"
                />

                {/* Send */}
                <Button
                  onClick={handleCreateOffer}
                  disabled={isSending || (Object.keys(createItems).length === 0 && createGold <= 0)}
                  className="w-full"
                  data-testid="button-send-offer"
                >
                  {isSending ? <Spinner className="w-4 h-4 animate-spin mr-2" /> : <PaperPlaneTilt className="w-4 h-4 mr-2" />}
                  {t("tradeSendOffer")}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Quantity picker AlertDialog */}
      <AlertDialog open={!!quantityDialog} onOpenChange={(open) => !open && setQuantityDialog(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              {t("selectQuantity")}
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
                  <p className="text-sm text-muted-foreground">{t("availableLabel")}: {dialogAvailable}</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t("quantityLabel")}:</span>
                    <span className="text-lg font-bold text-primary">{sliderValue}</span>
                  </div>
                  <Slider value={[sliderValue]} onValueChange={(v) => setSliderValue(v[0])} min={1} max={dialogAvailable} step={1} className="w-full" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1</span><span>{dialogAvailable}</span>
                  </div>
                </div>
              </div>
            );
          })()}
          <AlertDialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setQuantityDialog(null)}>{t("cancel")}</Button>
            <Button onClick={handleAddWithQuantity} data-testid="button-add-quantity">
              <Check className="w-4 h-4 mr-2" />
              {t("addBtn")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
