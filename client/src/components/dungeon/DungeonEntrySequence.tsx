import { useState, useEffect, useRef, memo } from "react";
import { cn } from "@/lib/utils";
import { Sword, Shield, Heart, Lightning, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

const ROLE_ICONS: Record<string, any> = {
  tank: Shield,
  dps: Sword,
  healer: Heart,
  hybrid: Lightning,
};

const ROLE_COLORS: Record<string, string> = {
  tank: "text-blue-400",
  dps: "text-red-400",
  healer: "text-green-400",
  hybrid: "text-yellow-400",
};

interface PartyMemberEntry {
  id: string;
  name: string;
  role: string;
  avatar?: string | null;
}

interface DungeonEntrySequenceProps {
  dungeon: { name: string; icon?: string };
  partyMembers: PartyMemberEntry[];
  isLoading: boolean;
  loadError: string | null;
  onReadyToEnter: () => void;
  onCancel: () => void;
}

const MIN_MS = 2200;

const MemberCard = memo(({ member, index, total }: { member: PartyMemberEntry; index: number; total: number }) => {
  const RoleIcon = ROLE_ICONS[member.role] || Sword;
  const roleColor = ROLE_COLORS[member.role] || "text-red-400";

  return (
    <div
      className="flex flex-col items-center gap-1"
      style={{
        animation: `cardWalkIn 0.8s cubic-bezier(0.4, 0, 0.2, 1) ${index * 150}ms both`,
      }}
      data-testid={`entry-member-${member.id}`}
    >
      <div className={cn(
        "w-12 h-12 sm:w-14 sm:h-14 rounded-lg border-2 bg-black/60 flex items-center justify-center overflow-hidden",
        member.role === "tank" ? "border-blue-500/60" :
        member.role === "healer" ? "border-green-500/60" :
        member.role === "hybrid" ? "border-yellow-500/60" :
        "border-red-500/60"
      )}>
        <div className={cn("w-6 h-6 sm:w-7 sm:h-7", roleColor)}>
          <RoleIcon className="w-full h-full" weight="fill" />
        </div>
      </div>
      <span className="text-[9px] sm:text-[10px] text-gray-300 font-medium truncate max-w-[60px] text-center">
        {member.name}
      </span>
    </div>
  );
});
MemberCard.displayName = "MemberCard";

export function DungeonEntrySequence({
  dungeon,
  partyMembers,
  isLoading,
  loadError,
  onReadyToEnter,
  onCancel,
}: DungeonEntrySequenceProps) {
  const [minTimePassed, setMinTimePassed] = useState(false);
  const readyCalled = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimePassed(true), MIN_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (minTimePassed && !isLoading && !loadError && !readyCalled.current) {
      readyCalled.current = true;
      onReadyToEnter();
    }
  }, [minTimePassed, isLoading, loadError, onReadyToEnter]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      data-testid="dungeon-entry-sequence"
    >
      <style>{`
        @keyframes portalPulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes portalRingExpand {
          0% { transform: scale(0.5); opacity: 0; }
          40% { opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes cardWalkIn {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          60% { opacity: 0.8; transform: translateY(-40vh) scale(0.6); }
          100% { opacity: 0; transform: translateY(-45vh) scale(0.3); }
        }
        @keyframes titleFadeIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes vignetteIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes enteringPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>

      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1a0a2e_0%,_#0d0518_40%,_#000000_100%)]"
        style={{ animation: "vignetteIn 0.3s ease-out forwards" }}
      />

      <div className="absolute inset-0" style={{
        background: "radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.8) 100%)",
      }} />

      <div className="absolute top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div
          className="w-[200px] h-[200px] sm:w-[260px] sm:h-[260px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(139,92,246,0.4) 0%, rgba(139,92,246,0.1) 40%, transparent 70%)",
            animation: "portalPulse 2s ease-in-out infinite",
          }}
        />
        <div
          className="absolute inset-0 rounded-full border border-purple-400/30"
          style={{ animation: "portalRingExpand 2s ease-out infinite" }}
        />
        <div
          className="absolute inset-0 rounded-full border border-purple-300/20"
          style={{ animation: "portalRingExpand 2s ease-out 0.5s infinite" }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-md px-4">
        <div
          className="text-center"
          style={{ animation: "titleFadeIn 0.6s ease-out forwards" }}
        >
          <Sword className="w-8 h-8 sm:w-10 sm:h-10 text-purple-400 mx-auto mb-2" weight="bold" />
          <h2 className="text-lg sm:text-xl font-bold text-purple-100 tracking-wider uppercase">
            {dungeon.name || "Dungeon"}
          </h2>
          <div className="h-[2px] w-24 mx-auto mt-2 rounded-full bg-gradient-to-r from-transparent via-purple-500 to-transparent" />
        </div>

        <div className="flex items-end justify-center gap-3 sm:gap-4 mt-8 sm:mt-12">
          {partyMembers.map((member, i) => (
            <MemberCard key={member.id} member={member} index={i} total={partyMembers.length} />
          ))}
        </div>

        <div className="mt-6 text-center min-h-[40px]">
          {loadError ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-red-400">
                <Warning className="w-5 h-5" weight="fill" />
                <span className="text-sm font-medium">{loadError}</span>
              </div>
              <Button
                variant="outline"
                onClick={onCancel}
                className="border-red-700 text-red-400 hover:bg-red-900/30"
                data-testid="entry-error-back"
              >
                Go Back
              </Button>
            </div>
          ) : minTimePassed && isLoading ? (
            <p
              className="text-sm text-purple-300/80 font-semibold tracking-widest uppercase"
              style={{ animation: "enteringPulse 1.5s ease-in-out infinite" }}
            >
              Entering...
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
