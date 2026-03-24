import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useGame } from "@/context/GameContext";
import { useLanguage } from "@/context/LanguageContext";
import { t } from "@/lib/i18n";
import { ALLOWED_QUEUE_DURATIONS, type QueueItem, getUsedQueueTimeMs } from "@shared/schema";
import { Clock, ListPlus, Trash, Timer, Play, Spinner, Warning, ArrowUp, ArrowDown, PauseCircle, PencilSimple, StopCircle } from "@phosphor-icons/react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatMsToHuman } from "@/components/game/DurationPickerDialog";
import { getItemImage } from "@/lib/itemImages";
import { getMonsterImage } from "@/lib/monsterImages";
import { RetryImage } from "@/components/ui/retry-image";

const FIFTEEN_MIN = 15 * 60 * 1000;

const DURATION_LABELS: Record<string, (lang: Parameters<typeof t>[0]) => string> = {
  [String(15 * 60 * 1000)]: (lang) => t(lang, 'duration15m'),
  [String(30 * 60 * 1000)]: (lang) => t(lang, 'duration30m'),
  [String(60 * 60 * 1000)]: (lang) => t(lang, 'duration1h'),
  [String(2 * 60 * 60 * 1000)]: (lang) => t(lang, 'duration2h'),
  [String(3 * 60 * 60 * 1000)]: (lang) => t(lang, 'duration3h'),
  [String(6 * 60 * 60 * 1000)]: (lang) => t(lang, 'duration6h'),
};

export function getDurationLabel(ms: number, lang: Parameters<typeof t>[0]): string {
  const labelFn = DURATION_LABELS[String(ms)];
  return labelFn ? labelFn(lang) : `${Math.round(ms / 60000)}m`;
}

interface AddToQueueDialogProps {
  open: boolean;
  onClose: () => void;
  queueItem: Omit<QueueItem, 'id' | 'addedAt' | 'status' | 'durationMs'>;
}

export function AddToQueueDialog({ open, onClose, queueItem }: AddToQueueDialogProps) {
  const { addToQueue, taskQueue, maxQueueSlotsCount, isQueueV2, maxQueueTimeMsTotal, activeTask, activeCombat } = useGame();
  const { language } = useLanguage();
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);

  const usedMs = isQueueV2 ? getUsedQueueTimeMs(taskQueue, activeTask, activeCombat) : 0;
  const remainingMs = isQueueV2 ? maxQueueTimeMsTotal - usedMs : 0;
  const maxSteps = isQueueV2 ? Math.floor(remainingMs / FIFTEEN_MIN) : 0;

  const [sliderValue, setSliderValue] = useState<number>(Math.max(1, Math.min(4, maxSteps)));

  useEffect(() => {
    if (isQueueV2) {
      setSliderValue(Math.max(1, Math.min(4, maxSteps)));
      setSelectedDuration(null);
    }
  }, [maxSteps, isQueueV2]);

  const handleAdd = async () => {
    const dur = isQueueV2 ? sliderValue * FIFTEEN_MIN : selectedDuration;
    if (!dur) return;
    const success = await addToQueue({ ...queueItem, durationMs: dur });
    if (success) {
      setSelectedDuration(null);
      onClose();
    }
  };

  const isFull = !isQueueV2 && taskQueue.length >= maxQueueSlotsCount;
  const isTimeFull = isQueueV2 && maxSteps < 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm" data-testid="dialog-add-to-queue">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="w-5 h-5 text-primary" weight="bold" />
            {t(language, 'addToQueue')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{queueItem.name}</span>
          </div>

          {isQueueV2 ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t(language, 'timeBudget')}</span>
                <span>{formatMsToHuman(usedMs)} / {formatMsToHuman(maxQueueTimeMsTotal)}</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    (usedMs / maxQueueTimeMsTotal) >= 0.9 ? "bg-red-500" : (usedMs / maxQueueTimeMsTotal) >= 0.7 ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${Math.min(100, (usedMs / maxQueueTimeMsTotal) * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {t(language, 'queueSlots').replace('{0}', String(taskQueue.length)).replace('{1}', String(maxQueueSlotsCount))}
            </div>
          )}

          {(isFull || isTimeFull) ? (
            <div className="text-sm text-destructive font-medium" data-testid="text-queue-full">
              {t(language, 'queueFull')}
            </div>
          ) : isQueueV2 ? (
            <>
              <div className="space-y-4">
                <div className="text-center">
                  <span className="text-3xl font-bold text-primary">{formatMsToHuman(sliderValue * FIFTEEN_MIN)}</span>
                </div>
                <div className="px-2">
                  <Slider
                    min={1}
                    max={maxSteps}
                    step={1}
                    value={[sliderValue]}
                    onValueChange={([val]) => setSliderValue(val)}
                    data-testid="slider-add-queue-duration"
                  />
                  <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                    <span>15m</span>
                    <span>{formatMsToHuman(maxSteps * FIFTEEN_MIN)}</span>
                  </div>
                </div>
              </div>
              <Button
                onClick={handleAdd}
                className="w-full"
                data-testid="button-confirm-add-queue"
              >
                <ListPlus className="w-4 h-4 mr-2" weight="bold" />
                {t(language, 'addToQueue')}
                <span className="ml-1 opacity-70">({formatMsToHuman(sliderValue * FIFTEEN_MIN)})</span>
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <div className="text-sm font-medium">{t(language, 'selectDuration')}</div>
                <div className="grid grid-cols-3 gap-2">
                  {ALLOWED_QUEUE_DURATIONS.map((dur) => (
                    <Button
                      key={dur}
                      variant={selectedDuration === dur ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedDuration(dur)}
                      className="text-xs"
                      data-testid={`button-duration-${dur}`}
                    >
                      <Clock className="w-3 h-3 mr-1" weight="bold" />
                      {getDurationLabel(dur, language)}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleAdd}
                disabled={!selectedDuration}
                className="w-full"
                data-testid="button-confirm-add-queue"
              >
                <ListPlus className="w-4 h-4 mr-2" weight="bold" />
                {t(language, 'addToQueue')}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface QueueManagementSheetProps {
  open: boolean;
  onClose: () => void;
}

function useQueueItemCountdowns(taskQueue: QueueItem[], activeTask: any, activeCombat: any, isV2: boolean) {
  const [now, setNow] = useState(Date.now());
  const active = activeTask || activeCombat;
  useEffect(() => {
    if (!isV2 || (!active && taskQueue.length === 0)) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [isV2, taskQueue.length, !!active]);

  if (!isV2) return null;

  const activeStart = active ? (active.startTime || active.combatStartTime || 0) : 0;
  const activeDur = active ? (active.queueDurationMs || 0) : 0;
  const activeCountdown = (active && activeStart && activeDur)
    ? Math.max(0, activeStart + activeDur - now)
    : null;

  if (!active || !activeStart || !activeDur) {
    return { countdowns: [], activeCountdown: null };
  }

  const activeEnds = activeStart + activeDur;
  const countdowns: number[] = [];
  let cumulativeStart = activeEnds;
  for (let i = 0; i < taskQueue.length; i++) {
    const itemStart = cumulativeStart;
    const remaining = Math.max(0, itemStart + taskQueue[i].durationMs - now);
    countdowns.push(remaining);
    cumulativeStart = itemStart + taskQueue[i].durationMs;
  }
  return { countdowns, activeCountdown };
}

function getQueueItemRoute(item: QueueItem): string {
  if (item.type === 'combat') return '/combat';
  if (item.type === 'skill' && item.skillId) {
    const skillRoutes: Record<string, string> = {
      cooking: '/skill/cooking',
      alchemy: '/alchemy',
      crafting: '/crafting',
    };
    return skillRoutes[item.skillId] || `/skill/${item.skillId}`;
  }
  return '/';
}

export function QueueManagementSheet({ open, onClose }: QueueManagementSheetProps) {
  const { taskQueue, removeFromQueue, clearQueue, reorderQueueItem, updateQueueItemDuration, startQueueFromItem, maxQueueSlotsCount, isQueueV2, maxQueueTimeMsTotal, activeTask, activeCombat, isQueuePaused, resumeQueue, stopTask, stopCombat, pauseQueueOnCancel, setPauseQueueOnCancel } = useGame();
  const { language } = useLanguage();
  const [, setLocation] = useLocation();
  const [editingItem, setEditingItem] = useState<QueueItem | null>(null);
  const [sliderValue, setSliderValue] = useState<number>(1);
  const [editingDuration, setEditingDuration] = useState<number | null>(null);

  const usedMs = isQueueV2 ? getUsedQueueTimeMs(taskQueue, activeTask, activeCombat) : 0;
  const budgetPct = isQueueV2 ? Math.min(100, (usedMs / maxQueueTimeMsTotal) * 100) : 0;
  const queueCountdownResult = useQueueItemCountdowns(taskQueue, activeTask, activeCombat, isQueueV2);
  const countdowns = queueCountdownResult?.countdowns ?? null;
  const activeCountdown = queueCountdownResult?.activeCountdown ?? null;

  const remainingMs = isQueueV2 ? maxQueueTimeMsTotal - usedMs : 0;

  const editMaxSteps = useMemo(() => {
    if (!editingItem || !isQueueV2) return 0;
    const availableMs = remainingMs + editingItem.durationMs;
    return Math.floor(availableMs / FIFTEEN_MIN);
  }, [editingItem, remainingMs, isQueueV2]);

  useEffect(() => {
    if (editingItem) {
      if (isQueueV2) {
        const currentSteps = Math.round(editingItem.durationMs / FIFTEEN_MIN);
        setSliderValue(Math.max(1, Math.min(currentSteps, Math.max(1, editMaxSteps))));
      } else {
        setEditingDuration(editingItem.durationMs);
      }
    }
  }, [editingItem, editMaxSteps, isQueueV2]);

  const cumulativeTimes = useMemo(() => {
    if (!isQueueV2) return [];
    const activeDuration = (activeTask || activeCombat)?.queueDurationMs || 0;
    let cumulative = activeDuration;
    return taskQueue.map((item) => {
      cumulative += item.durationMs;
      return cumulative;
    });
  }, [isQueueV2, taskQueue, activeTask, activeCombat]);

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm" data-testid="dialog-queue-management">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isQueuePaused
              ? <PauseCircle className="w-5 h-5 text-amber-400" weight="fill" />
              : <Timer className="w-5 h-5 text-primary" weight="bold" />
            }
            {t(language, 'queueManagement')}
            {isQueuePaused && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium border border-amber-500/30">
                {language === 'tr' ? 'Duraklatıldı' : 'Paused'}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {isQueueV2 ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t(language, 'timeBudget')}</span>
                <span>{formatMsToHuman(usedMs)} / {formatMsToHuman(maxQueueTimeMsTotal)}</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    budgetPct >= 90 ? "bg-red-500" : budgetPct >= 70 ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {t(language, 'queueSlots').replace('{0}', String(taskQueue.length)).replace('{1}', String(maxQueueSlotsCount))}
            </div>
          )}

          {!activeTask && !activeCombat && taskQueue.length > 0 && (
            <Button
              onClick={() => { resumeQueue(); onClose(); }}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
              data-testid="button-resume-queue-sheet"
            >
              <Play className="w-4 h-4 mr-2" weight="fill" />
              {language === 'tr' ? (isQueuePaused ? 'Sırayı Devam Et' : 'Sırayı Başlat') : (isQueuePaused ? 'Resume Queue' : 'Start Queue')}
            </Button>
          )}

          {(activeTask || activeCombat) && (
            <div
              className="flex items-center justify-between p-2 rounded-lg border bg-emerald-500/10 border-emerald-500/30"
              data-testid="queue-item-active"
            >
              <div
                className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  onClose();
                  if (activeCombat) setLocation('/combat');
                  else if (activeTask?.skillId) {
                    const skillRoutes: Record<string, string> = { cooking: '/cooking', alchemy: '/alchemy', crafting: '/crafting' };
                    setLocation(skillRoutes[activeTask.skillId] || `/skill/${activeTask.skillId}`);
                  }
                }}
              >
                <Spinner className="w-4 h-4 text-emerald-400 animate-spin flex-shrink-0" weight="bold" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate text-emerald-300">
                    {activeTask?.name || activeCombat?.monsterId}
                  </div>
                  <div className="text-xs text-emerald-400/80 flex items-center gap-1">
                    <Clock className="w-3 h-3" weight="bold" />
                    {activeCountdown !== null && activeCountdown > 0
                      ? <span>{formatMsToHuman(activeCountdown)} left</span>
                      : (activeTask || activeCombat)?.queueDurationMs
                        ? <span>{formatMsToHuman((activeTask || activeCombat)!.queueDurationMs!)}</span>
                        : null
                    }
                    <span className="capitalize">• {activeCombat ? 'combat' : activeTask?.skillId || 'skill'}</span>
                    <span className="text-emerald-400 font-medium">• {language === 'tr' ? 'Çalışıyor' : 'Running'}</span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10 flex-shrink-0"
                data-testid="button-stop-active-task"
                title={language === 'tr' ? 'Durdur' : 'Stop'}
                onClick={async () => {
                  if (activeCombat) await stopCombat(true);
                  else if (activeTask) await stopTask();
                }}
              >
                <StopCircle className="w-5 h-5" weight="fill" />
              </Button>
            </div>
          )}

          {taskQueue.length === 0 ? (
            !(activeTask || activeCombat) && (
              <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-queue-empty">
                {t(language, 'queueEmpty')}
              </div>
            )
          ) : (
            <>
              <div className="space-y-2">
                {taskQueue.map((item, idx) => {
                  const isOverLimit = isQueueV2 && cumulativeTimes[idx] > maxQueueTimeMsTotal;
                  const expectedCount = (item.targetQuantity && item.actionDuration && item.actionDuration > 0)
                    ? Math.floor(item.durationMs / item.actionDuration)
                    : null;
                  const willBeCutShort = item.targetQuantity && expectedCount !== null && expectedCount < item.targetQuantity;
                  return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors",
                      isOverLimit ? "bg-destructive/10 border-destructive/40"
                        : willBeCutShort ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-card"
                    )}
                    data-testid={`queue-item-${idx}`}
                    onClick={() => { setEditingItem(item); }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground w-4">{idx + 1}.</span>
                      {(() => {
                        const img = item.type === 'combat'
                          ? (item.monsterId ? getMonsterImage(item.monsterId) : undefined)
                          : getItemImage(item.itemId || item.name);
                        return img
                          ? <RetryImage src={img} alt={item.name} className="w-6 h-6 object-contain pixelated flex-shrink-0" spinnerClassName="w-3 h-3" />
                          : <span className="text-base flex-shrink-0">{item.type === 'combat' ? '⚔️' : '🔧'}</span>;
                      })()}
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{item.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                          <Clock className="w-3 h-3" weight="bold" />
                          {isQueueV2 ? formatMsToHuman(item.durationMs) : getDurationLabel(item.durationMs, language)}
                          <span className="capitalize">• {item.type}</span>
                          {isQueueV2 && idx === 0 && <span className="text-amber-400 font-medium">• Next</span>}
                          {item.targetQuantity && expectedCount !== null && (
                            <span className={cn(
                              "whitespace-nowrap flex items-center gap-0.5",
                              willBeCutShort ? "text-amber-400" : "text-muted-foreground"
                            )}>
                              •{willBeCutShort && <Warning className="w-3 h-3 ml-0.5" weight="fill" />}
                              ({expectedCount}/{item.targetQuantity} items)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex flex-col gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={idx === 0}
                          onClick={(e) => { e.stopPropagation(); reorderQueueItem(item.id, 'up'); }}
                          className="h-5 w-6 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          data-testid={`button-move-up-${idx}`}
                        >
                          <ArrowUp className="w-3 h-3" weight="bold" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={idx === taskQueue.filter(q => q.status === 'pending').length - 1}
                          onClick={(e) => { e.stopPropagation(); reorderQueueItem(item.id, 'down'); }}
                          className="h-5 w-6 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          data-testid={`button-move-down-${idx}`}
                        >
                          <ArrowDown className="w-3 h-3" weight="bold" />
                        </Button>
                      </div>
                      {isQueueV2 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); startQueueFromItem(item.id); onClose(); }}
                          className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-300"
                          data-testid={`button-start-from-${idx}`}
                        >
                          <Play className="w-4 h-4" weight="fill" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); removeFromQueue(item.id); }}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        data-testid={`button-remove-queue-${idx}`}
                      >
                        <Trash className="w-4 h-4" weight="bold" />
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => { clearQueue(); onClose(); }}
                className="w-full text-destructive hover:text-destructive"
                data-testid="button-clear-queue"
              >
                <Trash className="w-4 h-4 mr-2" weight="bold" />
                {t(language, 'clearQueue')}
              </Button>
            </>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">{t(language, 'pauseQueueOnCancel')}</div>
              <div className="text-xs text-muted-foreground">{t(language, 'pauseQueueOnCancelDesc')}</div>
            </div>
            <Switch
              checked={pauseQueueOnCancel}
              onCheckedChange={setPauseQueueOnCancel}
              data-testid="switch-pause-queue-on-cancel-inline"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {editingItem && (
      <Dialog open={!!editingItem} onOpenChange={(o) => { if (!o) setEditingItem(null); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-edit-queue-duration">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilSimple className="w-5 h-5 text-primary" weight="bold" />
              {language === 'tr' ? 'Süreyi Değiştir' : 'Edit Duration'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{editingItem.name}</span>
            </div>

            {isQueueV2 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
                <Clock className="w-4 h-4 text-primary" weight="bold" />
                <span className="text-sm font-medium">
                  {language === 'tr' ? 'Maks' : 'Max'}: {formatMsToHuman(editMaxSteps * FIFTEEN_MIN)}
                </span>
              </div>
            )}

            {isQueueV2 ? (
              editMaxSteps < 1 ? (
                <div className="text-sm text-destructive font-medium text-center py-2">
                  {t(language, 'queueTimeFull')}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center">
                    <span className="text-3xl font-bold text-primary">{formatMsToHuman(sliderValue * FIFTEEN_MIN)}</span>
                    {sliderValue * FIFTEEN_MIN !== editingItem.durationMs && (
                      <span className="ml-2 text-sm text-muted-foreground line-through">
                        {formatMsToHuman(editingItem.durationMs)}
                      </span>
                    )}
                  </div>
                  <div className="px-2">
                    <Slider
                      min={1}
                      max={editMaxSteps}
                      step={1}
                      value={[sliderValue]}
                      onValueChange={([val]) => setSliderValue(val)}
                      data-testid="slider-edit-queue-duration"
                    />
                    <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                      <span>15m</span>
                      <span>{formatMsToHuman(editMaxSteps * FIFTEEN_MIN)}</span>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-2">
                <div className="text-sm font-medium">{t(language, 'selectDuration')}</div>
                <div className="grid grid-cols-3 gap-2">
                  {ALLOWED_QUEUE_DURATIONS.map((dur) => (
                    <Button
                      key={dur}
                      variant={editingDuration === dur ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEditingDuration(dur)}
                      className="text-xs"
                      data-testid={`button-edit-duration-${dur}`}
                    >
                      <Clock className="w-3 h-3 mr-1" weight="bold" />
                      {getDurationLabel(dur, language)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditingItem(null)}
                data-testid="button-cancel-edit-duration"
              >
                {language === 'tr' ? 'İptal' : 'Cancel'}
              </Button>
              <Button
                className="flex-1"
                disabled={
                  isQueueV2
                    ? (sliderValue * FIFTEEN_MIN === editingItem.durationMs || editMaxSteps < 1)
                    : (!editingDuration || editingDuration === editingItem.durationMs)
                }
                onClick={async () => {
                  const newDuration = isQueueV2 ? sliderValue * FIFTEEN_MIN : editingDuration;
                  if (!newDuration) return;
                  await updateQueueItemDuration(editingItem.id, newDuration);
                  setEditingItem(null);
                }}
                data-testid="button-confirm-edit-duration"
              >
                {language === 'tr' ? 'Kaydet' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}
