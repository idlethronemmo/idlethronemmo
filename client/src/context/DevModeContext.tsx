import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface DevModeContextType {
  isDevMode: boolean;
  isDevModeLoading: boolean;
  devLoggedIn: boolean;
  devLogin: () => void;
  devLogout: () => void;
}

const DevModeContext = createContext<DevModeContextType>({
  isDevMode: false,
  isDevModeLoading: true,
  devLoggedIn: false,
  devLogin: () => {},
  devLogout: () => {},
});

export function DevModeProvider({ children }: { children: ReactNode }) {
  const [isDevMode, setIsDevMode] = useState(false);
  const [isDevModeLoading, setIsDevModeLoading] = useState(true);
  const [devLoggedIn, setDevLoggedIn] = useState(false);

  useEffect(() => {
    async function checkDevMode() {
      console.log('[DevMode] Starting config check...');
      try {
        const response = await fetch('/api/config');
        console.log('[DevMode] Config response received');
        const data = await response.json();
        console.log('[DevMode] Config data:', data);
        setIsDevMode(data.isDevelopment === true);
        console.log('[DevMode] isDevMode set to:', data.isDevelopment === true);
      } catch (error) {
        console.error('[DevMode] Failed to check dev mode:', error);
        setIsDevMode(false);
      } finally {
        console.log('[DevMode] Setting isDevModeLoading to false');
        setIsDevModeLoading(false);
      }
    }
    checkDevMode();
  }, []);

  const devLogin = () => setDevLoggedIn(true);
  const devLogout = () => setDevLoggedIn(false);

  return (
    <DevModeContext.Provider value={{ isDevMode, isDevModeLoading, devLoggedIn, devLogin, devLogout }}>
      {children}
    </DevModeContext.Provider>
  );
}

export function useDevMode() {
  return useContext(DevModeContext);
}
