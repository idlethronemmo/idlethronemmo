import { useItemNotification } from "@/context/ItemNotificationContext";
import { Package } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export default function ItemNotificationStack() {
  const { notifications } = useItemNotification();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-1.5 pointer-events-none md:bottom-24">
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg",
            "bg-card/95 border border-primary/30 shadow-lg backdrop-blur-sm",
            "animate-in slide-in-from-bottom-2 fade-in duration-300",
            "text-sm font-medium text-foreground"
          )}
          style={{
            animation: `slideInUp 0.3s ease-out, fadeOut 0.5s ease-in 1.5s forwards`
          }}
          data-testid={`item-notification-${notification.id}`}
        >
          {notification.iconUrl ? (
            <img 
              src={notification.iconUrl} 
              alt={notification.itemName}
              className="w-5 h-5 object-contain"
            />
          ) : (
            <Package className="w-5 h-5 text-primary" weight="fill" />
          )}
          <span className="text-foreground">{notification.itemName}</span>
          <span className="text-primary font-bold">+{notification.quantity}</span>
        </div>
      ))}
    </div>
  );
}
