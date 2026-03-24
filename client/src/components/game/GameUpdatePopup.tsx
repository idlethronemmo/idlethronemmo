import { useEffect } from "react";
import { useTrade } from "@/context/TradeContext";
import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import { X, ArrowClockwise } from "@phosphor-icons/react";

export function GameUpdatePopup() {
  const { gameUpdateAvailable, clearGameUpdate, playerDataUpdateAvailable, clearPlayerDataUpdate } = useTrade();
  const { t } = useLanguage();

  // Auto-reload when player data is updated by admin
  useEffect(() => {
    if (playerDataUpdateAvailable) {
      console.log('[GameUpdatePopup] Player data updated by admin, reloading...');
      clearPlayerDataUpdate();
      // Reload page to get fresh player data
      window.location.reload();
    }
  }, [playerDataUpdateAvailable, clearPlayerDataUpdate]);

  if (!gameUpdateAvailable) return null;

  const handleUpdate = () => {
    window.location.reload();
  };

  return (
    <div 
      className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg bg-amber-400 text-amber-950"
      data-testid="popup-game-update"
    >
      <span className="font-medium text-sm">{t('gameUpdateAvailable')}</span>
      <Button
        size="sm"
        onClick={handleUpdate}
        className="bg-amber-600 hover:bg-amber-700 text-white"
        data-testid="button-update-game"
      >
        <ArrowClockwise className="w-4 h-4 mr-1" />
        {t('updateNow')}
      </Button>
      <button
        onClick={clearGameUpdate}
        className="p-1 rounded hover:bg-amber-500/50 transition-colors"
        data-testid="button-dismiss-update"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
