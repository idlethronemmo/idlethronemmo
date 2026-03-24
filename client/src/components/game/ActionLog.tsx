import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

interface LogEntry {
  id: number;
  message: string;
  type: "combat" | "loot" | "info" | "error";
  timestamp: string;
}

const SAMPLE_LOGS: LogEntry[] = [
  { id: 1, message: "You struck the Goblin for 24 damage!", type: "combat", timestamp: "10:42:01" },
  { id: 2, message: "Goblin attacks! You blocked the hit.", type: "combat", timestamp: "10:42:03" },
  { id: 3, message: "You cast Fireball! It's super effective (56 dmg).", type: "combat", timestamp: "10:42:05" },
  { id: 4, message: "Goblin has been defeated!", type: "info", timestamp: "10:42:06" },
  { id: 5, message: "Found: 12 Gold Coins", type: "loot", timestamp: "10:42:06" },
  { id: 6, message: "Found: Rusty Dagger", type: "loot", timestamp: "10:42:06" },
  { id: 7, message: "Started gathering herbs...", type: "info", timestamp: "10:42:10" },
  { id: 8, message: "Found: Healing Herb x2", type: "loot", timestamp: "10:42:15" },
  { id: 9, message: "Inventory is getting full!", type: "error", timestamp: "10:42:15" },
  { id: 10, message: "Engaged new enemy: Forest Wolf (Lvl 5)", type: "combat", timestamp: "10:42:20" },
  { id: 11, message: "Forest Wolf bites you for 12 damage.", type: "combat", timestamp: "10:42:22" },
];

export default function ActionLog() {
  return (
    <div className="bg-card border border-border rounded-lg h-full flex flex-col shadow-sm">
      <div className="p-3 border-b border-border bg-card/50 backdrop-blur-sm">
        <h3 className="font-display font-bold text-sm text-foreground tracking-wide flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Adventure Log
        </h3>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3 font-ui text-sm">
          {SAMPLE_LOGS.map((log) => (
            <div key={log.id} className="flex gap-3 animate-in slide-in-from-left-2 duration-300">
              <span className="text-muted-foreground text-xs font-mono shrink-0 opacity-50">[{log.timestamp}]</span>
              <span className={cn(
                "leading-tight",
                log.type === "combat" && "text-red-300",
                log.type === "loot" && "text-yellow-400 font-medium",
                log.type === "info" && "text-blue-300",
                log.type === "error" && "text-red-500 font-bold",
              )}>
                {log.message}
              </span>
            </div>
          ))}
          {/* Fade out effect at top could go here if needed */}
        </div>
      </ScrollArea>
    </div>
  );
}
