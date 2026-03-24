import { useState, useEffect } from "react";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { Timer, Clock, CaretUp, Play, PauseCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getUsedQueueTimeMs } from "@shared/schema";
import { formatMsToHuman } from "./DurationPickerDialog";
import { QueueManagementSheet } from "./QueueDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { getItemImage } from "@/lib/itemImages";
import { getMonsterImage } from "@/lib/monsterImages";
import { RetryImage } from "@/components/ui/retry-image";

function formatRemainingShort(ms: number): string {
  if (ms <= 0) return "0m";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.ceil((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h${minutes > 0 ? minutes + "m" : ""}`;
  return `${minutes}m`;
}

function QueueInterruptDialog() {
  const { queueInterrupted, resumeQueue, dismissQueueInterrupt, taskQueue } = useGame();
  const { language } = useLanguage();
  if (!queueInterrupted || taskQueue.length === 0) return null;
  const next = taskQueue[0];
  return (
    <Dialog open={queueInterrupted} onOpenChange={(o) => { if (!o) dismissQueueInterrupt(); }}>
      <DialogContent className="max-w-sm" data-testid="dialog-queue-interrupt">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="w-5 h-5 text-amber-400" weight="fill" />
            {language === 'tr' ? 'Sıra Duraklatıldı' : 'Queue Paused'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {language === 'tr'
              ? 'Savaş sona erdi. Sıradaki göreve geçilsin mi?'
              : 'Combat ended. Continue to the next task in your queue?'}
          </p>
          {next && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border">
              {(() => {
                const img = next.type === 'combat'
                  ? (next.monsterId ? getMonsterImage(next.monsterId) : undefined)
                  : getItemImage(next.itemId || next.name);
                return img
                  ? <RetryImage src={img} alt={next.name} className="w-7 h-7 object-contain pixelated flex-shrink-0" spinnerClassName="w-4 h-4" />
                  : <span className="text-lg flex-shrink-0">{next.type === 'combat' ? '⚔️' : '🔧'}</span>;
              })()}
              <div>
                <div className="text-sm font-medium">{next.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" weight="bold" />
                  {formatMsToHuman(next.durationMs)}
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => resumeQueue()}
              className="flex-1"
              data-testid="button-queue-resume"
            >
              <Play className="w-4 h-4 mr-1.5" weight="fill" />
              {language === 'tr' ? 'Devam Et' : 'Continue'}
            </Button>
            <Button
              variant="outline"
              onClick={() => dismissQueueInterrupt()}
              className="flex-1"
              data-testid="button-queue-dismiss"
            >
              {language === 'tr' ? 'Hayır' : 'No'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function QueueFAB() {
  const {
    taskQueue, activeTask, activeCombat, isQueueV2, maxQueueTimeMsTotal,
    isQueuePaused,
  } = useGame();
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isQueueV2) return;
    const iv = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(iv);
  }, [isQueueV2]);

  if (!isQueueV2) return null;

  const usedMs = getUsedQueueTimeMs(taskQueue, activeTask, activeCombat);
  const remainingMs = maxQueueTimeMsTotal - usedMs;
  const queueCount = taskQueue.length;
  const hasAnything = queueCount > 0 || !!activeTask || !!activeCombat || isQueuePaused;

  if (!hasAnything) return <QueueInterruptDialog />;

  if (isMobile) {
    return (
      <>
        <QueueInterruptDialog />
        <button
          onClick={() => setMobileSheetOpen(true)}
          className={cn(
            "fixed z-[9998] flex items-center justify-center",
            "w-12 h-12 rounded-full",
            "border-2 transition-all",
            isQueuePaused
              ? "bg-amber-500/20 border-amber-500/70 shadow-[0_0_12px_rgba(245,158,11,0.4)]"
              : "bg-background/95 border-primary/40 shadow-lg",
            "active:scale-95",
            "right-3"
          )}
          style={{
            bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))",
          }}
          data-testid="queue-fab-mobile"
        >
          <div className="relative">
            {isQueuePaused
              ? <PauseCircle className="w-5 h-5 text-amber-400" weight="fill" />
              : <Timer className="w-5 h-5 text-primary" weight="bold" />
            }
          </div>
          {queueCount > 0 && (
            <div className={cn(
              "absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full border-2 border-background",
              isQueuePaused ? "bg-amber-500" : "bg-amber-500"
            )}>
              <span className="text-[9px] font-bold text-white">{queueCount}</span>
            </div>
          )}
          {isQueuePaused && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-amber-500/90 border border-amber-400">
              <span className="text-[8px] font-bold text-white uppercase tracking-wide">
                {language === 'tr' ? 'Duraklatıldı' : 'Paused'}
              </span>
            </div>
          )}
          {!isQueuePaused && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-background border border-border">
              <span className="text-[8px] font-mono text-muted-foreground">
                {formatRemainingShort(remainingMs)}
              </span>
            </div>
          )}
        </button>
        <QueueManagementSheet open={mobileSheetOpen} onClose={() => setMobileSheetOpen(false)} />
      </>
    );
  }

  return (
    <>
      <QueueInterruptDialog />
      <QueueManagementSheet open={desktopOpen} onClose={() => setDesktopOpen(false)} />
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end" data-testid="queue-fab-desktop">
        <button
          onClick={() => setDesktopOpen(!desktopOpen)}
          className={cn(
            "flex items-center justify-center",
            "w-14 h-14 rounded-full",
            "border-2 transition-all",
            desktopOpen
              ? "bg-background border-primary shadow-[0_0_16px_rgba(234,179,8,0.4)]"
              : isQueuePaused
              ? "bg-amber-500/10 border-amber-500/60 shadow-[0_0_14px_rgba(245,158,11,0.35)] hover:border-amber-400"
              : "bg-background border-primary/40 shadow-lg hover:border-primary/70",
            "active:scale-95"
          )}
          data-testid="queue-fab-toggle"
        >
          <div className="relative flex items-center justify-center">
            {desktopOpen ? (
              <CaretUp className="w-6 h-6 text-primary" weight="bold" />
            ) : isQueuePaused ? (
              <PauseCircle className="w-6 h-6 text-amber-400" weight="fill" />
            ) : (
              <Timer className="w-6 h-6 text-primary" weight="bold" />
            )}
          </div>
          {!desktopOpen && queueCount > 0 && (
            <div className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-[20px] px-1 bg-amber-500 rounded-full border-2 border-background">
              <span className="text-[10px] font-bold text-white">{queueCount}</span>
            </div>
          )}
          {!desktopOpen && isQueuePaused && (
            <div className="absolute -bottom-1 px-1.5 py-0.5 rounded-full bg-amber-500/90 border border-amber-400">
              <span className="text-[8px] font-bold text-white uppercase tracking-wide">
                {language === 'tr' ? 'Dur' : 'Paused'}
              </span>
            </div>
          )}
          {!desktopOpen && !isQueuePaused && (
            <div className="absolute -bottom-1 px-1.5 py-0.5 rounded-full bg-background border border-border">
              <span className="text-[8px] font-mono text-muted-foreground">
                {formatRemainingShort(remainingMs)}
              </span>
            </div>
          )}
        </button>
      </div>
    </>
  );
}
