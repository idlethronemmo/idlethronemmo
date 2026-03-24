// Splash screen management - separated to avoid circular imports

let splashHidden = false;

export function hideSplash() {
  if (splashHidden) return;
  splashHidden = true;
  const splash = document.getElementById('splash-screen');
  if (splash) {
    splash.classList.add('hidden');
    setTimeout(() => splash.remove(), 300);
  }
}

export function isSplashHidden() {
  return splashHidden;
}

// Safety net: Force hide splash after 2 seconds regardless of load state
export function initSplashTimeout() {
  setTimeout(() => {
    if (!splashHidden) {
      console.warn('[Splash] Force hiding after 2s timeout');
      hideSplash();
    }
  }, 2000);
}
