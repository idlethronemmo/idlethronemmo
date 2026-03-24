import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/gameMath";
import { 
  getBaseItem, 
  hasRarity, 
  parseItemWithRarity, 
  getItemRarityBgColor, 
  getItemRarityColor,
  RARITY_COLORS,
  translateItemName
} from "@/lib/items";
import { useLanguage } from "@/context/LanguageContext";
import { getItemImage } from "@/lib/itemImages";
import { 
  Backpack, 
  Sword, 
  Shield, 
  HardHat, 
  TShirt, 
  Footprints, 
  Hand,
  Axe,
  Fish,
  Fire,
  Bone,
  Feather
} from "@phosphor-icons/react";
import { Pickaxe } from "lucide-react";
import React from "react";
import { useItemInspect } from "@/context/ItemInspectContext";
import { RetryImage } from "@/components/ui/retry-image";
import { DurabilityBarMini } from "./DurabilityBar";

export type ItemSlotSize = "xs" | "sm" | "md" | "lg";

interface ItemSlotProps {
  itemName: string;
  itemId?: string;
  quantity?: number;
  size?: ItemSlotSize;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  showQuantity?: boolean;
  showEquipBadge?: boolean;
  className?: string;
  testId?: string;
  customBorderClass?: string;
  customBgClass?: string;
  customTextClass?: string;
  active?: boolean;
  locked?: boolean;
  lockedOverlay?: React.ReactNode;
  topRightBadge?: React.ReactNode;
  bottomLeftBadge?: React.ReactNode;
  overlay?: React.ReactNode;
  hideGlow?: boolean;
  inspectOnClick?: boolean;
  durability?: number; // 0-100, shows bar when < 100
}

const ITEM_ICON_MAP: Record<string, { icon: any; color: string }> = {
  "Normal Tree": { icon: Axe, color: "text-amber-600" },
  "Oak Tree": { icon: Axe, color: "text-amber-600" },
  "Willow Tree": { icon: Axe, color: "text-amber-600" },
  "Maple Tree": { icon: Axe, color: "text-amber-600" },
  "Yew Tree": { icon: Axe, color: "text-amber-600" },
  "Magic Tree": { icon: Axe, color: "text-amber-600" },
  "Copper Ore": { icon: Pickaxe, color: "text-orange-400" },
  "Tin Ore": { icon: Pickaxe, color: "text-slate-400" },
  "Iron Ore": { icon: Pickaxe, color: "text-slate-500" },
  "Silver Ore": { icon: Pickaxe, color: "text-gray-300" },
  "Coal": { icon: Pickaxe, color: "text-zinc-800" },
  "Gold Ore": { icon: Pickaxe, color: "text-yellow-400" },
  "Mithril Ore": { icon: Pickaxe, color: "text-blue-400" },
  "Adamantite Ore": { icon: Pickaxe, color: "text-green-500" },
  "Runite Ore": { icon: Pickaxe, color: "text-cyan-400" },
  "Raw Shrimp": { icon: Fish, color: "text-pink-400" },
  "Raw Sardine": { icon: Fish, color: "text-blue-300" },
  "Raw Trout": { icon: Fish, color: "text-amber-400" },
  "Raw Salmon": { icon: Fish, color: "text-orange-400" },
  "Raw Lobster": { icon: Fish, color: "text-red-400" },
  "Raw Swordfish": { icon: Fish, color: "text-blue-500" },
  "Raw Shark": { icon: Fish, color: "text-slate-500" },
  "Bones": { icon: Bone, color: "text-gray-300" },
  "Dragon Bone": { icon: Bone, color: "text-amber-400" },
  "Feather": { icon: Feather, color: "text-white" },
  "Bronze Bar": { icon: Fire, color: "text-orange-600" },
  "Iron Bar": { icon: Fire, color: "text-slate-400" },
  "Steel Bar": { icon: Fire, color: "text-slate-300" },
  "Silver Bar": { icon: Fire, color: "text-gray-200" },
  "Gold Bar": { icon: Fire, color: "text-yellow-400" },
  "Mithril Bar": { icon: Fire, color: "text-blue-400" },
  "Adamantite Bar": { icon: Fire, color: "text-green-500" },
  "Runite Bar": { icon: Fire, color: "text-cyan-400" },
};

const getEquipIcon = (slot?: string) => {
  switch (slot) {
    case "weapon": return Sword;
    case "shield": return Shield;
    case "helmet": return HardHat;
    case "body": return TShirt;
    case "legs": return Footprints;
    case "gloves": return Hand;
    case "boots": return Footprints;
    default: return Backpack;
  }
};

const SIZE_CLASSES: Record<ItemSlotSize, { container: string; icon: string; quantity: string; badge: string; iconWrapper: string }> = {
  xs: { 
    container: "w-10 h-10", 
    icon: "w-7 h-7", 
    quantity: "text-[9px]", 
    badge: "text-[7px]",
    iconWrapper: "w-[92%] h-[92%]"
  },
  sm: { 
    container: "w-[52px] h-[52px]", 
    icon: "w-10 h-10", 
    quantity: "text-[10px]", 
    badge: "text-[8px]",
    iconWrapper: "w-[92%] h-[92%]"
  },
  md: { 
    container: "w-16 h-16", 
    icon: "w-12 h-12", 
    quantity: "text-[11px]", 
    badge: "text-[9px]",
    iconWrapper: "w-[92%] h-[92%]"
  },
  lg: { 
    container: "w-[84px] h-[84px]", 
    icon: "w-16 h-16", 
    quantity: "text-[12px]", 
    badge: "text-[10px]",
    iconWrapper: "w-[92%] h-[92%]"
  },
};

const GLOW_COLORS: Record<string, string> = {
  Uncommon: "shadow-[inset_0_0_12px_rgba(52,211,153,0.7)]",
  Rare: "shadow-[inset_0_0_14px_rgba(59,130,246,0.7)]",
  Epic: "shadow-[inset_0_0_16px_rgba(168,85,247,0.75)]",
  Legendary: "shadow-[inset_0_0_18px_rgba(234,179,8,0.8)]",
  Mythic: "shadow-[inset_0_0_20px_rgba(239,68,68,0.85)]",
};

export function ItemSlot({
  itemName,
  itemId,
  quantity = 1,
  size = "md",
  onClick,
  selected = false,
  disabled = false,
  showQuantity = true,
  showEquipBadge = true,
  className,
  testId,
  customBorderClass,
  customBgClass,
  customTextClass,
  active = false,
  locked = false,
  lockedOverlay,
  topRightBadge,
  bottomLeftBadge,
  overlay,
  hideGlow = false,
  inspectOnClick = false,
  durability,
}: ItemSlotProps) {
  const { openInspect } = useItemInspect();
  const { language } = useLanguage();
  const idForLookup = itemId || itemName;
  const translatedName = translateItemName(idForLookup, language);
  const baseItem = getBaseItem(idForLookup);
  const isEquipmentItem = baseItem?.type === "equipment";
  const itemHasRarity = hasRarity(itemName);
  
  let Icon = Backpack;
  let iconColor = customTextClass || "text-muted-foreground";
  let rarityClass = "bg-zinc-800/50 border-zinc-600/50";
  
  if (customBorderClass || customBgClass) {
    rarityClass = cn(customBgClass || "bg-zinc-800/50", customBorderClass || "border-zinc-600/50");
  } else if (isEquipmentItem) {
    if (itemHasRarity) {
      rarityClass = getItemRarityBgColor(itemName);
      iconColor = customTextClass || getItemRarityColor(itemName);
    } else {
      rarityClass = "bg-gray-500/20 border-gray-500/30";
      iconColor = customTextClass || "text-gray-400";
    }
    Icon = getEquipIcon(baseItem?.equipSlot);
  } else if (ITEM_ICON_MAP[itemName]) {
    Icon = ITEM_ICON_MAP[itemName].icon;
    iconColor = customTextClass || ITEM_ICON_MAP[itemName].color;
  }

  const glowOverlay = !hideGlow && itemHasRarity ? GLOW_COLORS[parseItemWithRarity(itemName).rarity || ""] : null;
  const sizeClasses = SIZE_CLASSES[size];
  const itemImg = getItemImage(idForLookup) || getItemImage(itemName);

  const handleClick = () => {
    if (disabled || locked) return;
    if (inspectOnClick) {
      openInspect({ name: itemName, quantity });
    }
    onClick?.();
  };

  return (
    <div 
      onClick={handleClick}
      data-testid={testId || `item-slot-${(itemName || 'unknown').toLowerCase().replace(/\s+/g, '-')}`}
      className={cn(
        "rounded-lg flex items-center justify-center relative transition-all select-none overflow-hidden",
        "border-2 shadow-md",
        sizeClasses.container,
        rarityClass,
        (onClick || inspectOnClick) && !disabled && !locked && "cursor-pointer active:scale-95 hover:brightness-110",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        active && "ring-2 ring-green-500 animate-pulse",
        disabled && "opacity-50 cursor-not-allowed",
        locked && "opacity-40",
        className
      )}
    >
      {showQuantity && quantity > 1 && (
        <div className={cn(
          "absolute top-0.5 left-1 font-bold text-white drop-shadow-md z-20 font-mono",
          sizeClasses.quantity
        )}>
          {formatNumber(quantity)}
        </div>
      )}

      <div className={cn("flex items-center justify-center", sizeClasses.iconWrapper)}>
        {itemImg ? (
          <RetryImage 
            src={itemImg} 
            alt={translatedName} 
            loading="lazy"
            className="w-full h-full object-contain rounded drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] pixelated"
            fallbackIcon={<Icon className={cn(sizeClasses.icon, "drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]", iconColor)} />}
            spinnerClassName={sizeClasses.icon.replace(/w-\d+/, 'w-4').replace(/h-\d+/, 'h-4')}
          />
        ) : (
          <Icon className={cn(sizeClasses.icon, "drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]", iconColor)} />
        )}
      </div>

      {glowOverlay && (
        <div className={cn("absolute inset-0 rounded-lg pointer-events-none z-10", glowOverlay)} />
      )}

      {showEquipBadge && isEquipmentItem && (
        <div className={cn(
          "absolute bottom-0.5 right-1 font-bold text-yellow-400/90 font-mono z-20",
          sizeClasses.badge
        )}>
          EQ
        </div>
      )}

      {topRightBadge && (
        <div className={cn("absolute bottom-0.5 right-0.5 z-20", sizeClasses.badge)}>
          {topRightBadge}
        </div>
      )}

      {bottomLeftBadge && (
        <div className={cn("absolute bottom-0.5 left-0.5 z-20", sizeClasses.badge)}>
          {bottomLeftBadge}
        </div>
      )}

      {locked && lockedOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg z-30">
          {lockedOverlay}
        </div>
      )}

      {overlay && (
        <div className="absolute inset-0 z-25 pointer-events-none">
          {overlay}
        </div>
      )}

      {/* Durability bar for damaged equipment */}
      {durability !== undefined && durability < 100 && (
        <DurabilityBarMini durability={durability} />
      )}
    </div>
  );
}

export default ItemSlot;
