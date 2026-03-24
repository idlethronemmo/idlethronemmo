import { suppressConsole, isConsoleActive } from './lib/consoleGuard';

if (import.meta.env.PROD) {
  suppressConsole();
}

performance.mark('js-start');

(function setupNetworkInstrumentation() {
  const TAB_ID = crypto.randomUUID().slice(0, 8);
  const originalFetch = window.fetch;
  const requestCounts: Record<string, { count: number; methods: Record<string, number> }> = {};
  const optionsCount = { total: 0 };
  const duplicateTracker: Record<string, number> = {};
  let windowStart = Date.now();

  const invalidationCounts: Record<string, number> = {};

  window.fetch = function instrumentedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input as Request).url);
    const method = init?.method || 'GET';

    const endpoint = url.replace(/\/[a-f0-9-]{20,}/g, '/:id').replace(/\/\d+/g, '/:n');

    if (method === 'OPTIONS') {
      optionsCount.total++;
    }

    if (!requestCounts[endpoint]) {
      requestCounts[endpoint] = { count: 0, methods: {} };
    }
    requestCounts[endpoint].count++;
    requestCounts[endpoint].methods[method] = (requestCounts[endpoint].methods[method] || 0) + 1;

    const dupeKey = `${method}:${endpoint}:${Math.floor(Date.now() / 1000)}`;
    duplicateTracker[dupeKey] = (duplicateTracker[dupeKey] || 0) + 1;

    return originalFetch.apply(this, [input, init] as any);
  } as typeof window.fetch;

  setInterval(() => {
    if (!isConsoleActive()) return;

    const elapsed = (Date.now() - windowStart) / 1000;
    if (elapsed < 55) return;

    const sorted = Object.entries(requestCounts)
      .sort((a, b) => b[1].count - a[1].count);

    const total = sorted.reduce((sum, [, v]) => sum + v.count, 0);
    const perMin = Math.round(total / (elapsed / 60));

    const dupes = Object.entries(duplicateTracker)
      .filter(([, count]) => count > 1)
      .length;

    const output = [
      `\n===== NETWORK TRAFFIC REPORT (TAB: ${TAB_ID}) =====`,
      `Period: ${Math.round(elapsed)}s | Total: ${total} requests (${perMin}/min)`,
      `OPTIONS preflights: ${optionsCount.total}`,
      `Duplicate calls (same endpoint+second): ${dupes}`,
      ``,
      `RANKED BY VOLUME:`,
      ...sorted.map(([ep, data], i) =>
        `  ${i + 1}. ${ep} → ${data.count} (${Math.round(data.count / (elapsed / 60))}/min) [${Object.entries(data.methods).map(([m, c]) => `${m}:${c}`).join(', ')}]`
      ),
      ``,
      `INVALIDATION COUNTS:`,
      ...Object.entries(invalidationCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => `  ${key} → ${count} (${Math.round(count / (elapsed / 60))}/min)`),
      `===== END REPORT =====\n`,
    ];

    console.warn(output.join('\n'));

    for (const key of Object.keys(requestCounts)) delete requestCounts[key];
    optionsCount.total = 0;
    for (const key of Object.keys(duplicateTracker)) delete duplicateTracker[key];
    for (const key of Object.keys(invalidationCounts)) delete invalidationCounts[key];
    windowStart = Date.now();
  }, 10000);

  (window as any).__networkInstrumentation = { requestCounts, optionsCount, invalidationCounts, TAB_ID };
})();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { initSplashTimeout } from "./lib/splash";

initSplashTimeout();

performance.mark('react-render-start');
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
performance.mark('react-render-queued');
