import { memo, useState } from "react";
import { Package } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatItemIdAsName } from "@/lib/items";

interface LootItem {
  itemId: string;
  qty: number;
  playerName: string;
}

interface LootLaneProps {
  lootPool: LootItem[];
}

export const LootLane = memo(function LootLane({ lootPool }: LootLaneProps) {
  const [expanded, setExpanded] = useState(false);
  const recent = lootPool.slice(-6);

  return (
    <div data-testid="loot-lane" className="min-h-[60px]">
      <div
        className="flex items-center gap-1.5 mb-1 cursor-pointer select-none"
        onClick={() => lootPool.length > 0 && setExpanded(!expanded)}
        data-testid="loot-lane-toggle"
      >
        <Package className="w-3.5 h-3.5 text-green-400" weight="fill" />
        <span className="text-xs font-semibold text-gray-300">
          Loot {lootPool.length > 0 ? (expanded ? "▾" : "▸") : ""} ({lootPool.length})
        </span>
      </div>

      {lootPool.length === 0 ? (
        <div className="text-[10px] text-gray-500 text-center py-3 border border-dashed border-gray-700/30 rounded bg-black/10">
          No loot yet
        </div>
      ) : !expanded ? (
        <div className="space-y-0.5 overflow-hidden">
          {recent.map((item, i) => (
            <div
              key={`${item.itemId}-${i}`}
              className="flex items-center gap-1.5 text-[10px] py-0.5 px-1.5 rounded bg-black/20 border border-gray-800/40"
              style={{
                animation: `lootSlideIn 0.4s ease-out ${i * 60}ms both`,
              }}
            >
              <span className="text-green-400 font-medium">{item.qty}x</span>
              <span className="text-gray-200 truncate flex-1">
                {formatItemIdAsName(item.itemId)}
              </span>
              <span className="text-gray-500 shrink-0 text-[9px]">{item.playerName}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1 bg-black/20 rounded-lg border border-gray-800/30 p-1.5">
          {lootPool.slice(-20).map((item, i) => (
            <div
              key={`${item.itemId}-${i}`}
              className="flex items-center gap-1.5 text-[10px] py-0.5 px-1.5 rounded bg-black/20 border border-gray-800/40"
            >
              <span className="text-green-400 font-medium">{item.qty}x</span>
              <span className="text-gray-200 truncate flex-1">
                {formatItemIdAsName(item.itemId)}
              </span>
              <span className="text-gray-500 shrink-0 text-[9px]">{item.playerName}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes lootSlideIn {
          0% { opacity: 0; transform: translateX(-10px); }
          100% { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
});
