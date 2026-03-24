import { memo } from "react";
import { Button } from "@/components/ui/button";
import { SignOut, Sword } from "@phosphor-icons/react";

interface EscapeOverlayProps {
  isActive: boolean;
  canExtract: boolean;
  isPending: boolean;
  onExtract: () => void;
  onStay: () => void;
}

export const EscapeOverlay = memo(function EscapeOverlay({
  isActive,
  canExtract,
  isPending,
  onExtract,
  onStay,
}: EscapeOverlayProps) {
  if (!isActive) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      data-testid="escape-overlay"
    >
      <div
        className="max-w-sm w-full mx-4 rounded-xl border border-amber-700/40 bg-[radial-gradient(ellipse_at_center,_#1a1a0d_0%,_#0d0d0a_100%)] p-6 space-y-4"
        style={{ animation: "escapeSlideIn 0.3s ease-out forwards" }}
      >
        <div className="text-center space-y-2">
          <SignOut className="w-10 h-10 text-amber-400 mx-auto" weight="bold" />
          <h3 className="text-lg font-bold text-amber-100">Extract from Dungeon?</h3>
          <p className="text-sm text-gray-400">
            You will keep all secured loot. Unsecured loot from the current set of floors will be lost.
          </p>
        </div>

        {!canExtract && (
          <p className="text-xs text-red-400 text-center font-medium">
            You can only extract during intermission or after death
          </p>
        )}

        <div className="flex gap-3">
          <Button
            onClick={onStay}
            variant="outline"
            className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
            data-testid="btn-stay"
          >
            <Sword className="w-4 h-4 mr-1.5" weight="bold" />
            Stay
          </Button>
          <Button
            onClick={onExtract}
            disabled={!canExtract || isPending}
            className="flex-1 bg-gradient-to-r from-amber-700 to-orange-600 hover:from-amber-600 hover:to-orange-500 text-white font-bold"
            data-testid="btn-escape"
          >
            <SignOut className="w-4 h-4 mr-1.5" weight="bold" />
            {isPending ? "Extracting..." : "Extract"}
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes escapeSlideIn {
          0% { opacity: 0; transform: translateY(20px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
});
