const originalConsole = {
  log: console.log.bind(console),
  debug: console.debug.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let isConsoleRestored = false;

export function isConsoleActive() {
  return isConsoleRestored;
}

export function suppressConsole() {
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
  console.warn = noop;
  console.error = noop;
  isConsoleRestored = false;
}

export function restoreConsoleForAdmin() {
  if (isConsoleRestored) return;
  console.log = originalConsole.log;
  console.debug = originalConsole.debug;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  isConsoleRestored = true;
  console.log('[Console] Restored for admin/staff user');
}
