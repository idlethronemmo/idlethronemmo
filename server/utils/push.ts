import webpush from "web-push";
import { isPlayerOnline } from "../tradeWs";
import { storage } from "../storage";
import type { PushSubscription } from "@shared/schema";

const subscriptionsCache = new Map<string, webpush.PushSubscription>();
let cacheInitialized = false;

// Cooldown tracking to prevent notification spam
// Map of playerId -> Map of notificationType -> lastSentTimestamp
const notificationCooldowns = new Map<string, Map<string, number>>();
const NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between same notification type

function canSendNotification(playerId: string, notificationType: string): boolean {
  const playerCooldowns = notificationCooldowns.get(playerId);
  if (!playerCooldowns) return true;
  
  const lastSent = playerCooldowns.get(notificationType);
  if (!lastSent) return true;
  
  return Date.now() - lastSent >= NOTIFICATION_COOLDOWN_MS;
}

function recordNotificationSent(playerId: string, notificationType: string): void {
  let playerCooldowns = notificationCooldowns.get(playerId);
  if (!playerCooldowns) {
    playerCooldowns = new Map();
    notificationCooldowns.set(playerId, playerCooldowns);
  }
  playerCooldowns.set(notificationType, Date.now());
}

// Clean up old cooldown entries periodically
setInterval(() => {
  const now = Date.now();
  const playerIds = Array.from(notificationCooldowns.keys());
  for (const playerId of playerIds) {
    const cooldowns = notificationCooldowns.get(playerId)!;
    const types = Array.from(cooldowns.keys());
    for (const type of types) {
      const timestamp = cooldowns.get(type)!;
      if (now - timestamp > NOTIFICATION_COOLDOWN_MS * 2) {
        cooldowns.delete(type);
      }
    }
    if (cooldowns.size === 0) {
      notificationCooldowns.delete(playerId);
    }
  }
}, 10 * 60 * 1000); // Clean every 10 minutes

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@idlethrone.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function ensureCacheLoaded(): Promise<void> {
  if (cacheInitialized) return;
  
  try {
    const allSubs = await storage.getAllPushSubscriptions();
    for (const sub of allSubs) {
      subscriptionsCache.set(sub.playerId, {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dhKey,
          auth: sub.authKey
        }
      });
    }
    cacheInitialized = true;
    console.log(`[Push] Loaded ${allSubs.length} subscriptions from database`);
  } catch (error) {
    console.error("[Push] Failed to load subscriptions from database:", error);
  }
}

export async function saveSubscription(playerId: string, subscription: webpush.PushSubscription): Promise<boolean> {
  try {
    await storage.savePushSubscription({
      playerId,
      endpoint: subscription.endpoint,
      p256dhKey: subscription.keys?.p256dh || '',
      authKey: subscription.keys?.auth || ''
    });
    
    subscriptionsCache.set(playerId, subscription);
    console.log(`[Push] Saved subscription for player ${playerId}`);
    return true;
  } catch (error) {
    console.error("[Push] Failed to save subscription:", error);
    return false;
  }
}

export async function deleteSubscription(playerId: string): Promise<boolean> {
  try {
    await storage.deletePushSubscription(playerId);
    subscriptionsCache.delete(playerId);
    console.log(`[Push] Deleted subscription for player ${playerId}`);
    return true;
  } catch (error) {
    console.error("[Push] Failed to delete subscription:", error);
    return false;
  }
}

export async function getSubscription(playerId: string): Promise<webpush.PushSubscription | undefined> {
  await ensureCacheLoaded();
  return subscriptionsCache.get(playerId);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export async function sendPushNotification(
  playerId: string,
  payload: PushPayload,
  onlyIfOffline: boolean = true,
  notificationType?: string
): Promise<boolean> {
  try {
    // DIAGNOSTIC: Log push notification attempts
    const playerOnline = isPlayerOnline(playerId);
    if (onlyIfOffline && playerOnline) {
      console.log(`[Push] Skipped for ${playerId}: player is online`);
      return false;
    }

    // Check cooldown to prevent notification spam
    const notifType = notificationType || payload.title || 'generic';
    if (!canSendNotification(playerId, notifType)) {
      console.log(`[Push] Skipped for ${playerId}: cooldown active for ${notifType}`);
      return false;
    }

    await ensureCacheLoaded();
    const subscription = subscriptionsCache.get(playerId);
    if (!subscription) {
      console.log(`[Push] No subscription found for player ${playerId}`);
      return false;
    }
    
    console.log(`[Push] Sending notification to ${playerId}: ${payload.title}`);

    const pushPayload = JSON.stringify({
      title: payload.title || 'IdleThrone',
      body: payload.body,
      url: payload.url || '/'
    });

    await webpush.sendNotification(subscription, pushPayload);
    
    // Record that we sent this notification type
    recordNotificationSent(playerId, notifType);
    
    return true;
  } catch (error) {
    console.error("Push notification error:", error);
    if ((error as any).statusCode === 410) {
      await deleteSubscription(playerId);
    }
    return false;
  }
}

export function notifyMarketSale(playerId: string, itemName: string, quantity: number, gold: number): Promise<boolean> {
  return sendPushNotification(playerId, {
    title: 'Pazarda Satış!',
    body: `${itemName} x${quantity} satıldı! +${gold.toLocaleString('tr-TR')} altın kazandın.`,
    url: '/market'
  }, false);
}

export function notifyCombatDeath(playerId: string): Promise<boolean> {
  return sendPushNotification(playerId, {
    title: 'Savaşta Yenildin!',
    body: 'Canın tükendi ve lonca üssüne döndün.',
    url: '/combat'
  });
}

export function notifyIdleTimerExpired(playerId: string, skillName: string): Promise<boolean> {
  return sendPushNotification(playerId, {
    title: 'Idle Süre Doldu',
    body: `${skillName} eylemi 6 saatlik limite ulaştı ve durdu.`,
    url: '/'
  });
}

export function notifyMaterialsDepleted(playerId: string, craftType: 'craft' | 'cooking' | 'study', itemName: string): Promise<boolean> {
  let action: string;
  let url: string;
  let title: string;
  
  if (craftType === 'study') {
    action = 'Öğrenme';
    title = 'Öğrenme Tamamlandı';
    url = '/inventory';
  } else if (craftType === 'cooking') {
    action = 'Pişirme';
    title = 'Malzemeler Tükendi';
    url = '/cooking';
  } else {
    action = 'Üretim';
    title = 'Malzemeler Tükendi';
    url = '/crafting';
  }
  
  const body = craftType === 'study' 
    ? `Tüm ${itemName} öğrenildi.`
    : `${itemName} için malzemen kalmadı, ${action.toLowerCase()} durdu.`;
  
  return sendPushNotification(playerId, {
    title,
    body,
    url
  }, false); // Always send, even if player appears online (might be on different page)
}

export function notifySpecialLoot(playerId: string, itemName: string, monsterName: string): Promise<boolean> {
  return sendPushNotification(playerId, {
    title: 'Özel Bir Şey Buldun!',
    body: `${monsterName} öldürürken nadir bir ${itemName} düşürdü!`,
    url: '/combat'
  }, false);
}

export function notifyMythicCraft(playerId: string, itemName: string): Promise<boolean> {
  return sendPushNotification(playerId, {
    title: 'Efsanevi Üretim!',
    body: `Mythic ${itemName} ürettin! Bu çok nadir bir başarı!`,
    url: '/crafting'
  }, false);
}

export function notifyMythicDrop(playerId: string, itemName: string, monsterName: string): Promise<boolean> {
  return sendPushNotification(playerId, {
    title: 'MYTHIC DÜŞTÜ!',
    body: `${monsterName} öldürürken Mythic ${itemName} düşürdün! Bu inanılmaz nadir!`,
    url: '/combat'
  }, false);
}

export function notifyItemBreak(playerId: string, itemNames: string[]): Promise<boolean> {
  const itemList = itemNames.length === 1 
    ? itemNames[0] 
    : itemNames.slice(0, -1).join(', ') + ' ve ' + itemNames[itemNames.length - 1];
  return sendPushNotification(playerId, {
    title: 'Ekipman Kırıldı!',
    body: `${itemList} savaşta kırıldı ve yok oldu!`,
    url: '/combat'
  });
}

export function notifyDurabilityWarning(playerId: string, itemNames: string[]): Promise<boolean> {
  const itemList = itemNames.length === 1 
    ? itemNames[0] 
    : itemNames.slice(0, -1).join(', ') + ' ve ' + itemNames[itemNames.length - 1];
  return sendPushNotification(playerId, {
    title: 'Ekipman Uyarısı!',
    body: `${itemList} dayanıklılığı %20'ye düştü! Tamir ettirmen önerilir.`,
    url: '/inventory'
  });
}

export function notifyPlayerIdle(playerId: string): Promise<boolean> {
  return sendPushNotification(playerId, {
    title: 'IdleThrone',
    body: 'Karakterin şu anda boşta bekliyor. Yeni bir göreve başlamak ister misin?',
    url: '/'
  });
}

export function notifyFoodDepleted(playerId: string, foodName: string): Promise<boolean> {
  return sendPushNotification(playerId, {
    title: 'Yiyecek Bitti!',
    body: `${foodName} yiyeceğin tükendi. Savaşta yenilmemek için yeni yiyecek seç!`,
    url: '/combat'
  });
}

export function notifyPotionDepleted(playerId: string, potionName: string): Promise<boolean> {
  return sendPushNotification(playerId, {
    title: 'İksir Bitti!',
    body: `${potionName} iksirlerin tükendi. Savaş bonusları için yeni iksir seç!`,
    url: '/combat'
  });
}

export function notifyPlayerWorking(playerId: string, taskName: string, taskType: 'skill' | 'combat'): Promise<boolean> {
  const body = taskType === 'combat' 
    ? `Karakterin ${taskName} ile savaşmaya devam ediyor.`
    : `Karakterin şu anda ${taskName} üzerinde çalışıyor.`;
  
  return sendPushNotification(playerId, {
    title: 'IdleThrone',
    body,
    url: taskType === 'combat' ? '/combat' : '/'
  });
}

export function notifyPartyNudge(playerId: string, leaderName: string, partyName: string): Promise<boolean> {
  return sendPushNotification(playerId, {
    title: 'Parti Çağrısı!',
    body: `${leaderName} seni parti savaşına geri çağırıyor! (${partyName})`,
    url: '/combat'
  }, false); // Send even if online
}

export function notifyTradeOffer(playerId: string, senderName: string): Promise<boolean> {
  return sendPushNotification(playerId, {
    title: 'Takas Teklifi!',
    body: `${senderName} sana bir takas teklifi gönderdi!`,
    url: '/trade'
  }, true, 'trade_offer');
}

export { subscriptionsCache as pushSubscriptions };
