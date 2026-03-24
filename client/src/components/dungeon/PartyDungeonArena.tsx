import { ReactNode, memo } from "react";
import { cn } from "@/lib/utils";

interface PartyDungeonArenaProps {
  header: ReactNode;
  bossStage: ReactNode;
  vsDivider?: ReactNode;
  partyRow: ReactNode;
  controls: ReactNode;
  combatLog?: ReactNode;
  chat?: ReactNode;
  runSummary: ReactNode;
  lootLane?: ReactNode;
  floorTransition?: ReactNode;
  background?: ReactNode;
  intermission?: ReactNode;
  isIntermission?: boolean;
}

export const PartyDungeonArena = memo(function PartyDungeonArena({
  header,
  bossStage,
  vsDivider,
  partyRow,
  controls,
  combatLog,
  chat,
  runSummary,
  lootLane,
  floorTransition,
  background,
  intermission,
  isIntermission,
}: PartyDungeonArenaProps) {
  return (
    <div className="relative min-h-[60vh]" data-testid="party-dungeon-arena">
      {background}

      {floorTransition}

      <div
        className={cn(
          "relative z-10 flex flex-col gap-2 p-2 max-w-[42rem] mx-auto",
          "lg:grid lg:grid-cols-[1fr_200px] lg:gap-3 lg:p-3 lg:max-w-[52rem]"
        )}
        data-testid="arena-layout"
      >
        <div className="lg:col-span-2 min-w-0">
          {header}
        </div>

        {isIntermission ? (
          <div className="lg:col-span-2 space-y-3 min-w-0">
            {intermission}
          </div>
        ) : (
          <>
            <div className="min-w-0 lg:row-span-1">
              {bossStage}
            </div>

            <div className="hidden lg:block min-w-0 lg:row-span-3 overflow-hidden">
              {lootLane}
            </div>

            {vsDivider && (
              <div className="min-w-0 lg:col-start-1">
                {vsDivider}
              </div>
            )}

            <div className="min-w-0 lg:col-start-1">
              {partyRow}
            </div>
          </>
        )}

        <div className="lg:col-span-2 min-w-0">
          {controls}
        </div>

        <div className="lg:hidden min-w-0">
          {lootLane}
        </div>

        {combatLog && (
          <div className="lg:col-span-2 min-w-0">
            {combatLog}
          </div>
        )}

        {chat && (
          <div className="lg:col-span-2 min-w-0">
            {chat}
          </div>
        )}

        <div className="lg:col-span-2 min-w-0">
          {runSummary}
        </div>
      </div>
    </div>
  );
});
