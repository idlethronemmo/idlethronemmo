import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useLanguage } from "@/context/LanguageContext";
import { t } from "@/lib/i18n";
import { Clock, Play, Timer, ListPlus, Trash, Sword, Axe } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { QueueItem } from "@shared/schema";

export function formatMsToHuman(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

const FIFTEEN_MIN = 15 * 60 * 1000;

interface DurationPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (durationMs: number) => void;
  maxAvailableMs: number;
  title?: string;
  activityName?: string;
  mode?: 'start' | 'queue';
  taskQueue?: QueueItem[];
  onRemoveFromQueue?: (itemId: string) => void;
}

export function DurationPickerDialog({
  open,
  onClose,
  onConfirm,
  maxAvailableMs,
  title,
  activityName,
  mode = 'start',
  taskQueue = [],
  onRemoveFromQueue,
}: DurationPickerDialogProps) {
  const { language } = useLanguage();
  const maxSteps = Math.floor(maxAvailableMs / FIFTEEN_MIN);
  const [sliderValue, setSliderValue] = useState<number>(Math.max(1, Math.min(4, maxSteps)));

  const selectedDurationMs = sliderValue * FIFTEEN_MIN;

  const handleConfirm = () => {
    if (maxSteps < 1) return;
    onConfirm(selectedDurationMs);
    onClose();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
    }
  };

  const budgetHours = formatMsToHuman(maxAvailableMs);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm" data-testid="dialog-duration-picker">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'queue' ? (
              <ListPlus className="w-5 h-5 text-primary" weight="bold" />
            ) : (
              <Timer className="w-5 h-5 text-primary" weight="bold" />
            )}
            {title || t(language, 'chooseDuration')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {activityName && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{activityName}</span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
            <Clock className="w-4 h-4 text-primary" weight="bold" />
            <span className="text-sm font-medium">
              {t(language, 'queueTimeRemaining').replace('{0}', budgetHours)}
            </span>
          </div>

          {maxSteps < 1 ? (
            <div className="text-sm text-destructive font-medium text-center py-2" data-testid="text-time-budget-full">
              {t(language, 'queueTimeFull')}
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="text-center">
                  <span className="text-3xl font-bold text-primary">{formatMsToHuman(selectedDurationMs)}</span>
                </div>

                <div className="px-2">
                  <Slider
                    min={1}
                    max={maxSteps}
                    step={1}
                    value={[sliderValue]}
                    onValueChange={([val]) => setSliderValue(val)}
                    data-testid="slider-duration"
                  />
                  <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                    <span>15m</span>
                    <span>{formatMsToHuman(maxSteps * FIFTEEN_MIN)}</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleConfirm}
                className="w-full"
                data-testid="button-confirm-duration"
              >
                {mode === 'queue' ? (
                  <ListPlus className="w-4 h-4 mr-2" weight="bold" />
                ) : (
                  <Play className="w-4 h-4 mr-2" weight="fill" />
                )}
                {mode === 'queue' ? t(language, 'addToQueue') : t(language, 'startWithDuration')}
                <span className="ml-1 opacity-70">({formatMsToHuman(selectedDurationMs)})</span>
              </Button>
            </>
          )}

          {taskQueue.length > 0 && (
            <div className="space-y-2 border-t border-border/30 pt-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5" weight="bold" />
                  {t(language, 'queueManagement')} ({taskQueue.length})
                </div>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1.5">
                {taskQueue.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md bg-card/50 border border-border/30"
                    data-testid={`duration-picker-queue-item-${idx}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[10px] font-mono text-muted-foreground w-3">{idx + 1}</span>
                      {item.type === 'combat' ? (
                        <Sword className="w-3 h-3 text-red-400 flex-shrink-0" weight="fill" />
                      ) : (
                        <Axe className="w-3 h-3 text-amber-400 flex-shrink-0" weight="fill" />
                      )}
                      <span className="text-xs truncate">{item.name}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {formatMsToHuman(item.durationMs)}
                      </span>
                    </div>
                    {onRemoveFromQueue && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveFromQueue(item.id)}
                        className="h-6 w-6 p-0 text-destructive/60 hover:text-destructive flex-shrink-0"
                        data-testid={`duration-picker-remove-queue-${idx}`}
                      >
                        <Trash className="w-3 h-3" weight="bold" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface InlineDurationPickerProps {
  onConfirm: (durationMs: number) => void;
  onBack?: () => void;
  maxAvailableMs: number;
  activityName?: string;
  mode?: 'start' | 'queue';
}

export function InlineDurationPicker({
  onConfirm,
  onBack,
  maxAvailableMs,
  activityName,
  mode = 'start',
}: InlineDurationPickerProps) {
  const { language } = useLanguage();
  const maxSteps = Math.floor(maxAvailableMs / FIFTEEN_MIN);
  const [sliderValue, setSliderValue] = useState<number>(Math.max(1, Math.min(4, maxSteps)));

  useEffect(() => {
    setSliderValue(Math.max(1, Math.min(4, maxSteps)));
  }, [maxSteps]);

  const selectedDurationMs = sliderValue * FIFTEEN_MIN;
  const budgetHours = formatMsToHuman(maxAvailableMs);

  return (
    <div className="space-y-4" data-testid="inline-duration-picker">
      {activityName && (
        <div className="text-center">
          <span className="font-medium text-foreground text-sm">{activityName}</span>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
        <Clock className="w-4 h-4 text-primary" weight="bold" />
        <span className="text-sm font-medium">
          {t(language, 'queueTimeRemaining').replace('{0}', budgetHours)}
        </span>
      </div>

      {maxSteps < 1 ? (
        <div className="text-sm text-destructive font-medium text-center py-2" data-testid="text-time-budget-full">
          {t(language, 'queueTimeFull')}
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <div className="text-center">
              <span className="text-3xl font-bold text-primary">{formatMsToHuman(selectedDurationMs)}</span>
            </div>
            <div className="px-2">
              <Slider
                min={1}
                max={maxSteps}
                step={1}
                value={[sliderValue]}
                onValueChange={([val]) => setSliderValue(val)}
                data-testid="slider-duration-inline"
              />
              <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                <span>15m</span>
                <span>{formatMsToHuman(maxSteps * FIFTEEN_MIN)}</span>
              </div>
            </div>
          </div>

          <Button
            onClick={() => onConfirm(selectedDurationMs)}
            className="w-full"
            data-testid="button-confirm-duration-inline"
          >
            {mode === 'queue' ? (
              <ListPlus className="w-4 h-4 mr-2" weight="bold" />
            ) : (
              <Play className="w-4 h-4 mr-2" weight="fill" />
            )}
            {mode === 'queue' ? t(language, 'addToQueue') : t(language, 'startWithDuration')}
            <span className="ml-1 opacity-70">({formatMsToHuman(selectedDurationMs)})</span>
          </Button>
        </>
      )}

      {onBack && (
        <Button
          variant="ghost"
          onClick={onBack}
          className="w-full text-muted-foreground"
          data-testid="button-back-from-picker"
        >
          {t(language, 'back')}
        </Button>
      )}
    </div>
  );
}
