import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Trophy, CaretDown, Sword, Skull } from "@phosphor-icons/react";

export interface CombatLogEntry {
  id: number;
  message: string;
  type: "player_hit" | "player_miss" | "monster_hit" | "monster_miss" | "loot" | "death" | "victory" | "party_attack" | "party_heal" | "party_damaged" | "party_loot";
  timestamp: number;
  epoch: number;
  formula?: string;
}

export interface FormulaLogEntry {
  id: number;
  type: 'player_attack' | 'monster_attack';
  timestamp: number;
  formula: string;
  result: number;
  hit: boolean;
}

interface AdvancedData {
  formulaLog: FormulaLogEntry[];
  formulaPanelTab: "formulas" | "buffs" | "breakdown";
  setFormulaPanelTab: (tab: "formulas" | "buffs" | "breakdown") => void;
  language?: string;
  renderBuffsTab?: () => React.ReactNode;
  renderBreakdownTab?: () => React.ReactNode;
  formulasEmptyText?: string;
}

const LOG_ENTRY_COLORS: Record<CombatLogEntry["type"], string> = {
  player_hit: "text-green-400",
  player_miss: "text-gray-400",
  monster_hit: "text-red-400",
  monster_miss: "text-gray-400",
  loot: "text-amber-400 bg-amber-500/10",
  death: "text-red-500 bg-red-500/10",
  victory: "text-green-500 bg-green-500/10",
  party_attack: "text-blue-400 bg-blue-500/10",
  party_heal: "text-emerald-400 bg-emerald-500/10",
  party_damaged: "text-orange-400 bg-orange-500/10",
  party_loot: "text-emerald-300 bg-emerald-500/10",
};

interface CombatLogPanelProps {
  entries: CombatLogEntry[];
  showAdvanced?: boolean;
  advancedData?: AdvancedData;
  compact?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement>;
  logTitle?: string;
  className?: string;
}

export function CombatLogPanel({
  entries,
  showAdvanced = false,
  advancedData,
  compact = false,
  collapsible = false,
  defaultOpen = false,
  scrollRef,
  logTitle = "Combat Log",
  className,
}: CombatLogPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [showFormulas, setShowFormulas] = useState(false);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const activeScrollRef = scrollRef || internalScrollRef;

  useEffect(() => {
    if (activeScrollRef.current) {
      activeScrollRef.current.scrollTop = 0;
    }
  }, [entries]);

  const fontSize = compact ? "text-[10px]" : "text-[11px]";
  const logHeight = compact ? "h-32" : "h-32";
  const padding = compact ? "py-0.5 px-1" : "py-0.5 px-1.5";

  const renderLogEntries = () => (
    <div ref={activeScrollRef as React.RefObject<HTMLDivElement>} className={cn(logHeight, "overflow-y-auto")} data-testid="combat-log-scroll">
      <div className={cn("space-y-0.5 pr-2 font-mono", fontSize)}>
        {entries.length === 0 ? (
          <div className="text-muted-foreground text-center py-3 text-[10px]" data-testid="combat-log-empty">
            No combat events yet
          </div>
        ) : (
          entries.slice().reverse().map(entry => (
            <div key={entry.id}>
              <div
                className={cn(
                  padding, "rounded",
                  LOG_ENTRY_COLORS[entry.type]
                )}
              >
                {entry.message}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderAdvancedView = () => {
    if (!advancedData) return null;
    const { formulaLog, formulaPanelTab, setFormulaPanelTab, language, renderBuffsTab, renderBreakdownTab, formulasEmptyText } = advancedData;

    return (
      <div>
        <div className={cn("flex gap-1", compact ? "mb-1.5" : "mb-2")}>
          {(["formulas", "buffs", "breakdown"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFormulaPanelTab(tab)}
              className={cn(
                "rounded font-medium transition-all",
                compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]",
                formulaPanelTab === tab
                  ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300"
                  : "bg-muted/20 border border-border/30 text-muted-foreground hover:bg-muted/40"
              )}
            >
              {tab === "formulas" ? (language === 'tr' ? "Formüller" : "Formulas") : tab === "buffs" ? (language === 'tr' ? "Bufflar" : "Buffs") : (language === 'tr' ? "Detaylı" : "Breakdown")}
            </button>
          ))}
        </div>

        {formulaPanelTab === "formulas" && (
          <div className={cn(logHeight, "overflow-y-auto")}>
            <div className={cn("space-y-1 pr-2 font-mono", compact ? "text-[9px]" : "text-[10px]")}>
              {formulaLog.length === 0 ? (
                <div className="text-muted-foreground text-center py-3 text-[10px]">
                  {formulasEmptyText || "Formulas will appear here..."}
                </div>
              ) : (
                formulaLog.map(entry => (
                  <div
                    key={entry.id}
                    className={cn(
                      "rounded border",
                      compact ? "py-1 px-2" : "py-1.5 px-2",
                      entry.type === "player_attack" && entry.hit && "bg-green-500/10 border-green-500/30 text-green-300",
                      entry.type === "player_attack" && !entry.hit && "bg-gray-500/10 border-gray-500/30 text-gray-400",
                      entry.type === "monster_attack" && entry.hit && "bg-red-500/10 border-red-500/30 text-red-300",
                      entry.type === "monster_attack" && !entry.hit && "bg-gray-500/10 border-gray-500/30 text-gray-400"
                    )}
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      {entry.type === "player_attack" ? (
                        <Sword className="w-3 h-3" weight="duotone" />
                      ) : (
                        <Skull className="w-3 h-3" weight="duotone" />
                      )}
                      <span className="font-bold">
                        {entry.hit ? `= ${entry.result}` : "MISS"}
                      </span>
                    </div>
                    <div className={cn("opacity-80 break-all", compact ? "text-[8px]" : "text-[9px]")}>
                      {entry.formula}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {formulaPanelTab === "buffs" && renderBuffsTab?.()}
        {formulaPanelTab === "breakdown" && renderBreakdownTab?.()}
      </div>
    );
  };

  const toggleButton = (
    <button
      onClick={(e) => { e.stopPropagation(); setShowFormulas(prev => !prev); }}
      className={cn(
        "rounded border transition-colors",
        compact ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-1.5 py-0.5",
        showFormulas ? "bg-purple-500/20 border-purple-500/50 text-purple-300" : "bg-muted/20 border-border/50 text-muted-foreground"
      )}
      data-testid="toggle-advanced-combat-log"
    >
      Advanced
    </button>
  );

  const effectiveShowFormulas = showAdvanced || showFormulas;

  const content = (
    <>
      {showAdvanced !== undefined && advancedData && (
        <div className={cn("flex justify-end", compact ? "mb-1" : "mb-1")}>
          {toggleButton}
        </div>
      )}
      {effectiveShowFormulas && advancedData ? renderAdvancedView() : renderLogEntries()}
    </>
  );

  if (collapsible) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className={cn("bg-card/50 border-border/50", className)}>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-2 px-3 cursor-pointer hover:bg-muted/10" data-testid="trigger-combat-log">
              <CardTitle className="text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-yellow-400" weight="duotone" />
                  {logTitle}
                  {entries.length > 0 && (
                    <Badge variant="secondary" className="text-[9px] py-0 px-1">
                      {entries.length}
                    </Badge>
                  )}
                </span>
                <CaretDown className={cn(
                  "w-4 h-4 transition-transform",
                  isOpen && "rotate-180"
                )} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="py-0 px-2 pb-2">
              {content}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }

  return (
    <Card className={cn("bg-card/50 border-border/50", className)}>
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" weight="duotone" />
            {logTitle}
          </span>
          {advancedData && toggleButton}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        {effectiveShowFormulas && advancedData ? renderAdvancedView() : renderLogEntries()}
      </CardContent>
    </Card>
  );
}
