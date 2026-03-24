import { cn } from "@/lib/utils";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WeaponMasteryType, getMasteryFieldName } from "@shared/masterySystem";
import type { TranslationKeys } from "@/lib/i18n";
import { Info } from "lucide-react";
import { useMobile } from "@/hooks/useMobile";

const MASTERY_TYPES: { type: WeaponMasteryType; abbrev: string }[] = [
  { type: 'dagger', abbrev: 'DA' },
  { type: 'sword_shield', abbrev: 'SS' },
  { type: '2h_sword', abbrev: '2S' },
  { type: '2h_axe', abbrev: '2A' },
  { type: '2h_warhammer', abbrev: 'WH' },
  { type: 'bow', abbrev: 'BO' },
  { type: 'staff', abbrev: 'ST' },
];

function MasteryContent() {
  const { getMasteryLevel } = useGame();
  const { t } = useLanguage();

  return (
    <div className="text-xs">
      <div className="font-semibold mb-2 text-purple-300">{t('weaponMastery')}</div>
      <div className="space-y-1">
        {MASTERY_TYPES.map(({ type }) => {
          const level = getMasteryLevel(type);
          const fieldName = getMasteryFieldName(type);
          return (
            <div key={type} className="flex items-center justify-between gap-4">
              <span className="text-white">{t(fieldName as keyof TranslationKeys)}</span>
              <span className={cn("font-mono font-bold", level > 1 ? "text-emerald-400" : "text-zinc-400")}>
                {level}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MasteryTrigger() {
  const { t } = useLanguage();

  return (
    <div 
      className="flex items-center gap-1.5 cursor-default px-2 py-1 rounded-md border border-purple-500/30 bg-purple-500/10"
      data-testid="mastery-compact-widget"
    >
      <span className="text-xs font-semibold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
        {t('mastery')}
      </span>
      <Info className="w-3.5 h-3.5 text-purple-400/70" />
    </div>
  );
}

export function MasteryCompactWidget() {
  const { isMobile } = useMobile();

  if (isMobile) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <div>
            <MasteryTrigger />
          </div>
        </PopoverTrigger>
        <PopoverContent side="bottom" className="bg-zinc-900 border-zinc-700 p-3 w-auto">
          <MasteryContent />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <MasteryTrigger />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-700 p-3">
          <MasteryContent />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
