import { useEffect, useRef } from "react";

export function BuffCountdownText({ expiresAt, className }: { expiresAt: number; className?: string }) {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const update = () => {
      if (!spanRef.current) return;
      const remainingSec = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      spanRef.current.textContent = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return <span ref={spanRef} className={className} />;
}

export function DebuffCountdownText({ expiresAt, prefix, className }: { expiresAt: number; prefix: string; className?: string }) {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const update = () => {
      if (!spanRef.current) return;
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      spanRef.current.textContent = `${prefix} (${remaining}s)`;
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, prefix]);

  return <span ref={spanRef} className={className} />;
}

export function RespawnCountdownText({ startTime, duration, className }: { startTime: number; duration: number; className?: string }) {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const update = () => {
      if (!spanRef.current) return;
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, duration - elapsed);
      spanRef.current.textContent = `${(remaining / 1000).toFixed(1)}s`;
    };
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [startTime, duration]);

  return <span ref={spanRef} className={className} />;
}
