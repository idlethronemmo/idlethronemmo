import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StartupPhaseProvider, StartupPhase, useStartupPhase } from "@/context/StartupPhaseContext";
import { FirebaseAuthProvider, useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { DevModeProvider, useDevMode } from "@/context/DevModeContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useEffect, useRef, useState, useCallback } from "react";
import { hideSplash } from "./lib/splash";
import { apiRequest } from "@/lib/queryClient";
import { t, Language } from "@/lib/i18n";

import AuthPage from "@/pages/AuthPage";
import AuthActionPage from "@/pages/AuthActionPage";
import AuthenticatedApp from "./AuthenticatedApp";
import OnboardingPage from "@/pages/OnboardingPage";

function useOrientationLock() {
  useEffect(() => {
    const lockOrientation = async () => {
      const minWidth = 768;
      const minHeight = 600;
      const isLargeScreen = window.innerWidth >= minWidth && window.innerHeight >= minHeight;
      const isLargePhysicalScreen = window.screen.width >= minWidth && window.screen.height >= minHeight;
      
      const isTabletOrDesktop = isLargeScreen || isLargePhysicalScreen;
      
      if (!isTabletOrDesktop) return;
      
      try {
        const screen = window.screen as any;
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape');
        }
      } catch (error) {
      }
    };

    lockOrientation();
    
    window.addEventListener('resize', lockOrientation);
    window.addEventListener('orientationchange', lockOrientation);
    
    return () => {
      window.removeEventListener('resize', lockOrientation);
      window.removeEventListener('orientationchange', lockOrientation);
    };
  }, []);
}

function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem('preferredLanguage');
    if (stored && ['en', 'zh', 'hi', 'es', 'fr', 'ar', 'ru', 'tr'].includes(stored)) {
      return stored as Language;
    }
  } catch {}
  return 'en';
}

function Router() {
  const { user, loading, logout } = useFirebaseAuth();
  const { advanceToPhase } = useStartupPhase();
  const { isDevMode, isDevModeLoading, devLoggedIn, devLogin } = useDevMode();
  const splashHiddenRef = useRef(false);
  const [playerStatus, setPlayerStatus] = useState<'loading' | 'needsOnboarding' | 'ready' | 'error'>('loading');
  const [onboardingData, setOnboardingData] = useState<{ firebaseUid: string; email: string | null; displayName: string | null } | null>(null);
  const [devPlayerExists, setDevPlayerExists] = useState<boolean | null>(null);
  const [isGuestUser, setIsGuestUser] = useState(false);
  const [guestChecked, setGuestChecked] = useState(false);

  // Check for guest session on mount
  useEffect(() => {
    const sessionToken = localStorage.getItem('gameSessionToken');
    if (sessionToken) {
      fetch('/api/players/check-session?validateOnly=true', {
        credentials: 'include',
        headers: { 'x-session-token': sessionToken },
      })
        .then(res => res.json())
        .then(data => {
          if (data.valid) {
            setIsGuestUser(true);
            setPlayerStatus('ready');
          }
          setGuestChecked(true);
        })
        .catch(() => {
          localStorage.removeItem('gameSessionToken');
          setGuestChecked(true);
        });
    } else {
      setGuestChecked(true);
    }
  }, []);

  // DEV MODE: Check if player exists when logged in (lightweight check, no loginFinalization)
  useEffect(() => {
    if (!isDevMode || !devLoggedIn) return;
    
    async function checkDevPlayer() {
      try {
        const response = await fetch('/api/players/dev/check', { credentials: 'include' });
        const data = await response.json();
        
        advanceToPhase(StartupPhase.AUTH);
        hideSplash();
        
        if (data.onboardingRequired) {
          console.warn('[DEV MODE] No player exists. Create one via production or seed the database.');
          setDevPlayerExists(false);
          setOnboardingData({ firebaseUid: 'dev-user', email: 'dev@test.com', displayName: 'Dev User' });
          setPlayerStatus('needsOnboarding');
        } else {
          setDevPlayerExists(true);
          setPlayerStatus('ready');
        }
      } catch (error) {
        console.error('[DEV MODE] Failed to check player:', error);
        advanceToPhase(StartupPhase.AUTH);
        hideSplash();
        setPlayerStatus('ready');
      }
    }
    
    checkDevPlayer();
  }, [isDevMode, devLoggedIn, advanceToPhase]);

  // DEV MODE: Hide splash when showing login screen
  useEffect(() => {
    if (isDevMode && !isDevModeLoading && !devLoggedIn) {
      advanceToPhase(StartupPhase.AUTH);
      hideSplash();
    }
  }, [isDevMode, isDevModeLoading, devLoggedIn, advanceToPhase]);

  useEffect(() => {
    if (isDevMode) return; // Skip in dev mode
    
    if (!loading) {
      advanceToPhase(StartupPhase.AUTH);
      if (!user && !splashHiddenRef.current) {
        splashHiddenRef.current = true;
        hideSplash();
      }
    }
  }, [isDevMode, loading, user, advanceToPhase]);

  useEffect(() => {
    if (isDevMode) return; // Skip in dev mode
    
    async function checkPlayerStatus() {
      if (!user) {
        setPlayerStatus('loading');
        return;
      }

      try {
        const idToken = await user.getIdToken();
        const response = await fetch(`/api/players/firebase/check`, {
          credentials: 'include',
          headers: { "Authorization": `Bearer ${idToken}` },
        });
        
        if (!response.ok) {
          console.error("Server error checking player status:", response.status);
          setPlayerStatus('error');
          return;
        }
        
        const data = await response.json();
        
        if (data.onboardingRequired || !data.exists) {
          setOnboardingData({
            firebaseUid: user.uid,
            email: user.email,
            displayName: user.displayName,
          });
          setPlayerStatus('needsOnboarding');
        } else {
          setPlayerStatus('ready');
        }
      } catch (error) {
        console.error("Error checking player status:", error);
        setPlayerStatus('error');
      }
    }

    if (user) {
      checkPlayerStatus();
    }
  }, [isDevMode, user]);

  // Loading state for dev mode check
  if (isDevModeLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'hsl(230, 25%, 12%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'hsl(220, 15%, 60%)', fontSize: '14px' }}>{t(getStoredLanguage(), 'loading')}</div>
      </div>
    );
  }

  // DEV MODE: Show login screen or game
  if (isDevMode) {
    if (!devLoggedIn) {
      return (
        <div style={{ minHeight: '100vh', background: 'hsl(230, 25%, 12%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px' }}>
          <div style={{ color: 'hsl(45, 80%, 60%)', fontSize: '24px', fontWeight: 'bold' }}>🛠️ DEV MODE</div>
          <div style={{ color: 'hsl(220, 15%, 60%)', fontSize: '14px' }}>Development ortamında çalışıyorsunuz</div>
          <button
            onClick={devLogin}
            style={{
              padding: '12px 32px',
              fontSize: '16px',
              fontWeight: 'bold',
              background: 'hsl(45, 80%, 50%)',
              color: 'hsl(230, 25%, 12%)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Giriş Yap (Otomatik)
          </button>
        </div>
      );
    }
    
    if (playerStatus === 'ready') {
      return <AuthenticatedApp />;
    }
    if (playerStatus === 'needsOnboarding' && onboardingData) {
      return <OnboardingPage onboardingData={onboardingData} onComplete={() => setPlayerStatus('ready')} onBack={() => { logout(); setPlayerStatus('loading'); }} />;
    }
    return (
      <div style={{ minHeight: '100vh', background: 'hsl(230, 25%, 12%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'hsl(220, 15%, 60%)', fontSize: '14px' }}>DEV MODE: Loading...</div>
      </div>
    );
  }

  if (loading || !guestChecked) {
    return (
      <div style={{ minHeight: '100vh', background: 'hsl(230, 25%, 12%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'hsl(220, 15%, 60%)', fontSize: '14px' }}>{t(getStoredLanguage(), 'loading')}</div>
      </div>
    );
  }

  // Check for Firebase auth action (password reset, email verification)
  const urlParams = new URLSearchParams(window.location.search);
  const authMode = urlParams.get('mode');
  if (authMode === 'resetPassword') {
    return <AuthActionPage />;
  }

  // Guest user with valid session - go directly to authenticated app
  if (isGuestUser && playerStatus === 'ready') {
    return <AuthenticatedApp />;
  }

  if (!user) {
    return <AuthPage />;
  }

  if (playerStatus === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: 'hsl(230, 25%, 12%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'hsl(220, 15%, 60%)', fontSize: '14px' }}>{t(getStoredLanguage(), 'playerDataLoading')}</div>
      </div>
    );
  }

  if (playerStatus === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: 'hsl(230, 25%, 12%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <div style={{ color: 'hsl(0, 70%, 60%)', fontSize: '16px', fontWeight: 'bold' }}>Connection Error</div>
        <div style={{ color: 'hsl(220, 15%, 60%)', fontSize: '14px', textAlign: 'center', maxWidth: '300px' }}>Could not connect to the server. Please check your connection and try again.</div>
        <button 
          onClick={() => { window.location.reload(); }}
          style={{ padding: '8px 24px', background: 'hsl(230, 50%, 40%)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (playerStatus === 'needsOnboarding' && onboardingData) {
    return <OnboardingPage onboardingData={onboardingData} onComplete={() => setPlayerStatus('ready')} onBack={() => { logout(); setPlayerStatus('loading'); }} />;
  }

  return <AuthenticatedApp />;
}

function App() {
  useOrientationLock();
  
  return (
    <ErrorBoundary>
      <StartupPhaseProvider>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider>
            <DevModeProvider>
              <FirebaseAuthProvider>
                <TooltipProvider delayDuration={0}>
                  <Toaster />
                  <Router />
                </TooltipProvider>
              </FirebaseAuthProvider>
            </DevModeProvider>
          </LanguageProvider>
        </QueryClientProvider>
      </StartupPhaseProvider>
    </ErrorBoundary>
  );
}

export default App;
