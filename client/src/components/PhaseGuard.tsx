import { ReactNode } from "react";
import { StartupPhase, usePhaseReady } from "@/context/StartupPhaseContext";

interface PhaseGuardProps {
  requiredPhase: StartupPhase;
  children: ReactNode;
  fallback?: ReactNode;
}

function DefaultFallback() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[200px]">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function PhaseGuard({ requiredPhase, children, fallback }: PhaseGuardProps) {
  const isReady = usePhaseReady(requiredPhase);

  if (!isReady) {
    return <>{fallback ?? <DefaultFallback />}</>;
  }

  return <>{children}</>;
}

interface InteractionGuardProps {
  requiredPhase: StartupPhase;
  children: ReactNode;
  disabledClassName?: string;
}

export function InteractionGuard({ requiredPhase, children, disabledClassName = "opacity-50 pointer-events-none" }: InteractionGuardProps) {
  const isReady = usePhaseReady(requiredPhase);

  if (!isReady) {
    return <div className={disabledClassName}>{children}</div>;
  }

  return <>{children}</>;
}
