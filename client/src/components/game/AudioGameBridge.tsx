import { useEffect, useRef } from "react";
import { useGame } from "@/context/GameContext";
import { useItemNotification } from "@/context/ItemNotificationContext";
import { useAudio } from "@/context/AudioContext";

const CLICK_SOUND_SELECTORS = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[data-click-sound]',
].join(',');

const NO_CLICK_SOUND_ATTR = 'data-no-click-sound';

function shouldPlayClickSound(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const el = target.closest(CLICK_SOUND_SELECTORS) as HTMLElement | null;
  if (!el) return false;
  if (el.hasAttribute(NO_CLICK_SOUND_ATTR)) return false;
  if (el.closest(`[${NO_CLICK_SOUND_ATTR}]`)) return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

export function AudioGameBridge() {
  const { taskQueue, activeTask, notifications: gameNotifications } = useGame();
  const { notifications } = useItemNotification();
  const { playSfx, playThemeMusic } = useAudio();
  const playSfxRef = useRef(playSfx);
  playSfxRef.current = playSfx;

  useEffect(() => {
    playThemeMusic();
  }, [playThemeMusic]);

  useEffect(() => {
    let lastClickTime = 0;
    const handleClick = (e: MouseEvent) => {
      if (!shouldPlayClickSound(e.target)) return;
      const now = performance.now();
      if (now - lastClickTime < 50) return;
      lastClickTime = now;
      playSfxRef.current('ui', 'click');
    };
    document.addEventListener('click', handleClick, { capture: true, passive: true });
    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
    };
  }, []);

  const prevQueueLengthRef = useRef<number>(-1);
  useEffect(() => {
    const prevLength = prevQueueLengthRef.current;
    const currLength = taskQueue.length;
    if (prevLength >= 0 && currLength > prevLength) {
      playSfx('queue', 'add');
    }
    prevQueueLengthRef.current = currLength;
  }, [taskQueue, playSfx]);

  const prevActiveTaskRef = useRef<typeof activeTask>(null);
  useEffect(() => {
    const prevTask = prevActiveTaskRef.current;
    if (prevTask && !activeTask) {
      playSfx('queue', 'complete');
    }
    prevActiveTaskRef.current = activeTask;
  }, [activeTask, playSfx]);

  const prevNotificationCountRef = useRef<number>(-1);
  useEffect(() => {
    const prevCount = prevNotificationCountRef.current;
    const currCount = notifications.length;
    if (prevCount >= 0 && currCount > prevCount) {
      const r = Math.floor(Math.random() * 3) + 1;
      playSfx('loot', `collect_pop_${r}`);
    }
    prevNotificationCountRef.current = currCount;
  }, [notifications, playSfx]);

  const prevGameNotifCountRef = useRef<number>(-1);
  useEffect(() => {
    const prevCount = prevGameNotifCountRef.current;
    const currCount = gameNotifications.length;
    if (prevCount >= 0 && currCount > prevCount) {
      playSfx('ui', 'notification');
    }
    prevGameNotifCountRef.current = currCount;
  }, [gameNotifications, playSfx]);

  return null;
}
