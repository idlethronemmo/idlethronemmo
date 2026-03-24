import { useState, useEffect, useCallback } from 'react';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushState = 'unsupported' | 'denied' | 'default' | 'subscribed' | 'loading';

export function usePushNotifications() {
  const { user: firebaseUser } = useFirebaseAuth();
  
  // Helper to get auth headers with Firebase token
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (firebaseUser) {
      try {
        const token = await firebaseUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {
        console.error('[Push] Failed to get Firebase token:', e);
      }
    }
    return headers;
  }, [firebaseUser]);
  const [state, setState] = useState<PushState>('loading');
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setState('unsupported');
        return;
      }

      const permission = Notification.permission;
      if (permission === 'denied') {
        setState('denied');
        return;
      }

      try {
        const keyResponse = await fetch('/api/push/vapid-public-key');
        const { publicKey } = await keyResponse.json();
        if (!publicKey) {
          setState('unsupported');
          return;
        }
        setVapidKey(publicKey);

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
          setState('subscribed');
        } else {
          setState(permission === 'granted' ? 'default' : 'default');
        }
      } catch (error) {
        console.error('Push init error:', error);
        setState('unsupported');
      }
    }

    init();
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!vapidKey) return false;

    try {
      setState('loading');

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });

      const headers = await getAuthHeaders();
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(subscription.toJSON())
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      setState('subscribed');
      return true;
    } catch (error) {
      console.error('Push subscribe error:', error);
      setState('default');
      return false;
    }
  }, [vapidKey, getAuthHeaders]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    try {
      setState('loading');

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
      }

      const headers = await getAuthHeaders();
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers,
        credentials: 'include'
      });

      setState('default');
      return true;
    } catch (error) {
      console.error('Push unsubscribe error:', error);
      setState('subscribed');
      return false;
    }
  }, [getAuthHeaders]);

  const testNotification = useCallback(async (): Promise<boolean> => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers,
        credentials: 'include'
      });
      return response.ok;
    } catch {
      return false;
    }
  }, [getAuthHeaders]);

  return {
    state,
    isSubscribed: state === 'subscribed',
    isSupported: state !== 'unsupported',
    isDenied: state === 'denied',
    isLoading: state === 'loading',
    subscribe,
    unsubscribe,
    testNotification
  };
}
