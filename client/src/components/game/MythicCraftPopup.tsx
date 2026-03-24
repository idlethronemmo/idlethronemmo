import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import { 
  getBaseItem, 
  parseItemWithRarity, 
  getItemStatsWithRarity,
  isItemsLoaded,
  translateItemName,
} from "@/lib/items";
import { getItemImage } from "@/lib/itemImages";
import { 
  Sword, 
  Shield, 
  HardHat, 
  Shirt, 
  Footprints, 
  Hand,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function MythicCraftPopup() {
  const { pendingMythicCrafts, clearPendingMythicCrafts } = useGame();
  const { t, language } = useLanguage();
  
  const SLOT_NAMES: Record<string, string> = {
    helmet: t('helmet'),
    amulet: t('amulet'),
    cape: t('cape'),
    weapon: t('weapon'),
    body: t('body'),
    shield: t('shield'),
    legs: t('legs'),
    gloves: t('gloves'),
    boots: t('boots'),
    ring: t('ring')
  };
  
  if (pendingMythicCrafts.length === 0) return null;
  
  const currentCraft = pendingMythicCrafts[0];
  if (!currentCraft?.itemId) return null;
  
  const { baseId } = parseItemWithRarity(currentCraft.itemId);
  const baseItem = isItemsLoaded() ? getBaseItem(currentCraft.itemId) : null;
  const stats = isItemsLoaded() ? getItemStatsWithRarity(currentCraft.itemId) : null;
  const itemImg = getItemImage(baseId);
  
  const handleClose = () => {
    clearPendingMythicCrafts();
  };

  const getItemIcon = () => {
    if (!baseItem) return <Sword className="w-20 h-20 text-red-400" />;
    switch (baseItem.equipSlot) {
      case "weapon": return <Sword className="w-20 h-20 text-red-400" />;
      case "shield": return <Shield className="w-20 h-20 text-red-400" />;
      case "helmet": return <HardHat className="w-20 h-20 text-red-400" />;
      case "body": return <Shirt className="w-20 h-20 text-red-400" />;
      case "legs": return <Footprints className="w-20 h-20 text-red-400" />;
      case "gloves": return <Hand className="w-20 h-20 text-red-400" />;
      case "boots": return <Footprints className="w-20 h-20 text-red-400" />;
      default: return <Sword className="w-20 h-20 text-red-400" />;
    }
  };

  return (
    <AnimatePresence>
      <Dialog open={pendingMythicCrafts.length > 0} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent 
          className="bg-gradient-to-b from-[#1a0a0a] via-[#0f0808] to-[#0a0505] border-2 border-red-500/60 max-w-md overflow-hidden shadow-[0_0_60px_rgba(239,68,68,0.4)]"
          data-testid="mythic-craft-popup"
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(239,68,68,0.15)_0%,_transparent_70%)]" />
            <motion.div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-[200%] h-32 bg-gradient-to-b from-red-500/20 to-transparent"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
          
          <div className="relative z-10 text-center py-4">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, type: "spring" }}
              className="mb-2"
            >
              <div className="flex items-center justify-center gap-2 mb-1">
                <Sparkles className="w-5 h-5 text-red-400" />
                <span className="text-sm font-medium text-red-400/80 uppercase tracking-widest">{t('legendaryCraft')}</span>
                <Sparkles className="w-5 h-5 text-red-400" />
              </div>
              <h2 className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-red-300 to-red-400 drop-shadow-lg">
                {t('mythicTitle')}
              </h2>
            </motion.div>
            
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="relative mx-auto w-fit"
            >
              <motion.div
                className="absolute inset-0 rounded-2xl bg-red-500/30 blur-xl"
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 0.8, 0.5]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <div className="relative p-6 rounded-2xl border-2 border-red-500/50 bg-gradient-to-br from-red-950/80 to-red-900/40 shadow-[inset_0_0_30px_rgba(239,68,68,0.2)]">
                <motion.div
                  animate={{ 
                    filter: ["drop-shadow(0 0 10px rgba(239,68,68,0.5))", "drop-shadow(0 0 25px rgba(239,68,68,0.8))", "drop-shadow(0 0 10px rgba(239,68,68,0.5))"]
                  }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  {itemImg ? (
                    <img 
                      src={itemImg} 
                      alt={baseId} 
                      className="w-24 h-24 object-contain mx-auto pixelated"
                    />
                  ) : (
                    getItemIcon()
                  )}
                </motion.div>
              </div>
            </motion.div>
            
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="mt-6"
            >
              <h3 className="text-xl font-display font-bold text-red-300 mb-1">
                {translateItemName(baseId, language)}
              </h3>
              <p className="text-red-400/60 text-sm mb-4">
                {baseItem?.equipSlot ? SLOT_NAMES[baseItem.equipSlot] || baseItem.equipSlot : t('equipment')}
              </p>
              
              {stats && (
                <div className="bg-black/40 rounded-lg p-4 border border-red-500/20 space-y-2">
                  <div className="text-xs text-red-400/60 uppercase tracking-wider mb-2">{t('itemStatsWithBonus')}</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {stats.attackBonus !== undefined && stats.attackBonus > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">{t('attack')}</span>
                        <span className="text-red-300 font-semibold">+{stats.attackBonus}</span>
                      </div>
                    )}
                    {stats.strengthBonus !== undefined && stats.strengthBonus > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">{t('strength')}</span>
                        <span className="text-red-300 font-semibold">+{stats.strengthBonus}</span>
                      </div>
                    )}
                    {stats.defenceBonus !== undefined && stats.defenceBonus > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">{t('defence')}</span>
                        <span className="text-red-300 font-semibold">+{stats.defenceBonus}</span>
                      </div>
                    )}
                    {stats.accuracyBonus !== undefined && stats.accuracyBonus > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">{t('accuracy')}</span>
                        <span className="text-red-300 font-semibold">+{stats.accuracyBonus}</span>
                      </div>
                    )}
                    {stats.hitpointsBonus !== undefined && stats.hitpointsBonus > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">{t('hitpoints')}</span>
                        <span className="text-red-300 font-semibold">+{stats.hitpointsBonus}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
            
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="mt-6"
            >
              <p className="text-red-400/80 text-sm mb-4">
                {t('mythicCraftSuccess')}
              </p>
              <Button
                onClick={handleClose}
                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold py-3 border border-red-400/30"
                data-testid="button-close-mythic-popup"
              >
                {t('awesome')}
              </Button>
            </motion.div>
          </div>
        </DialogContent>
      </Dialog>
    </AnimatePresence>
  );
}
