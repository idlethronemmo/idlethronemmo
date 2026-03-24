import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from "react";

export enum StartupPhase {
  SHELL = 0,
  AUTH = 1,
  PLAYER = 2,
  GAME = 3,
  POST = 4,
}

interface StartupPhaseContextType {
  currentPhase: StartupPhase;
  isPhaseReady: (requiredPhase: StartupPhase) => boolean;
  advanceToPhase: (phase: StartupPhase) => void;
  phaseVersion: number;
}

const StartupPhaseContext = createContext<StartupPhaseContextType | undefined>(undefined);

export function StartupPhaseProvider({ children }: { children: React.ReactNode }) {
  const [currentPhase, setCurrentPhase] = useState<StartupPhase>(StartupPhase.SHELL);
  const [phaseVersion, setPhaseVersion] = useState(0);
  const phaseRef = useRef<StartupPhase>(StartupPhase.SHELL);

  const advanceToPhase = useCallback((phase: StartupPhase) => {
    if (phase > phaseRef.current) {
      phaseRef.current = phase;
      setCurrentPhase(phase);
      setPhaseVersion(v => v + 1);
    }
  }, []);

  const isPhaseReady = useCallback((requiredPhase: StartupPhase) => {
    return phaseRef.current >= requiredPhase;
  }, []);

  const value = useMemo(() => ({
    currentPhase,
    isPhaseReady,
    advanceToPhase,
    phaseVersion,
  }), [currentPhase, isPhaseReady, advanceToPhase, phaseVersion]);

  return (
    <StartupPhaseContext.Provider value={value}>
      {children}
    </StartupPhaseContext.Provider>
  );
}

export function useStartupPhase() {
  const context = useContext(StartupPhaseContext);
  if (!context) {
    throw new Error("useStartupPhase must be used within StartupPhaseProvider");
  }
  return context;
}

export function usePhaseReady(requiredPhase: StartupPhase): boolean {
  const { currentPhase } = useStartupPhase();
  return currentPhase >= requiredPhase;
}
