import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { auth } from "@/lib/firebase";

let sessionExpiredHandled = false;

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function getSessionToken(): string | null {
  try {
    return localStorage.getItem('gameSessionToken');
  } catch {
    return null;
  }
}

async function getFirebaseToken(): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

async function refreshFirebaseToken(): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken(true);
  } catch {
    return null;
  }
}

async function buildHeaders(includeContentType: boolean): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  
  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }
  
  const sessionToken = getSessionToken();
  if (sessionToken) {
    headers["x-session-token"] = sessionToken;
  }
  
  const firebaseToken = await getFirebaseToken();
  if (firebaseToken) {
    headers["Authorization"] = `Bearer ${firebaseToken}`;
  }
  
  return headers;
}

async function retryWithFreshToken(
  method: string,
  url: string,
  body?: string,
  includeContentType?: boolean,
): Promise<Response | null> {
  const freshToken = await refreshFirebaseToken();
  if (!freshToken) return null;
  
  const headers: Record<string, string> = {};
  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }
  const sessionToken = getSessionToken();
  if (sessionToken) {
    headers["x-session-token"] = sessionToken;
  }
  headers["Authorization"] = `Bearer ${freshToken}`;
  
  const res = await fetch(url, {
    method,
    headers,
    body,
    credentials: "include",
  });
  
  return res;
}

function handleSessionExpired() {
  if (sessionExpiredHandled) return;
  sessionExpiredHandled = true;

  try {
    localStorage.removeItem('gameSessionToken');
  } catch {}

  try {
    auth.signOut();
  } catch {}

  queryClient.clear();

  setTimeout(() => {
    sessionExpiredHandled = false;
    window.location.href = "/";
  }, 100);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = await buildHeaders(!!data);
  const bodyStr = data ? JSON.stringify(data) : undefined;
  
  const res = await fetch(url, {
    method,
    headers,
    body: bodyStr,
    credentials: "include",
  });

  if (res.status === 401) {
    const retryRes = await retryWithFreshToken(method, url, bodyStr, !!data);
    if (retryRes && retryRes.ok) {
      return retryRes;
    }
    handleSessionExpired();
    throw new Error("401: Session expired");
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers = await buildHeaders(false);
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (res.status === 401) {
      const retryRes = await retryWithFreshToken("GET", queryKey.join("/") as string);
      if (retryRes && retryRes.ok) {
        return await retryRes.json();
      }
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
      handleSessionExpired();
      throw new Error("401: Session expired");
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
queryClient.invalidateQueries = function(...args: any[]) {
  const instr = (window as any).__networkInstrumentation;
  if (instr?.invalidationCounts) {
    const key = args[0]?.queryKey ? JSON.stringify(args[0].queryKey) : JSON.stringify(args[0] || 'all');
    instr.invalidationCounts[key] = (instr.invalidationCounts[key] || 0) + 1;
  }
  return originalInvalidate(...args);
} as typeof queryClient.invalidateQueries;
