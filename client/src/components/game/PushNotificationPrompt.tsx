import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useLanguage } from "@/context/LanguageContext";

const PROMPT_KEY = "gov_push_prompt_shown";

export function PushNotificationPrompt() {
  const [isOpen, setIsOpen] = useState(false);
  const { state, subscribe, isSupported } = usePushNotifications();
  const { t } = useLanguage();

  useEffect(() => {
    if (state === 'loading') return;
    
    const hasShownPrompt = localStorage.getItem(PROMPT_KEY);
    if (hasShownPrompt) return;
    
    if (!isSupported) {
      localStorage.setItem(PROMPT_KEY, "true");
      return;
    }
    
    if (state === 'subscribed' || state === 'denied') {
      localStorage.setItem(PROMPT_KEY, "true");
      return;
    }
    
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [state, isSupported]);

  const handleEnable = async () => {
    localStorage.setItem(PROMPT_KEY, "true");
    await subscribe();
    setIsOpen(false);
  };

  const handleSkip = () => {
    localStorage.setItem(PROMPT_KEY, "true");
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <Bell className="w-8 h-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">{t('enableNotifications')}</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            {t('notificationDescription')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button
            variant="outline"
            onClick={handleSkip}
            className="flex-1"
            data-testid="button-skip-notifications"
          >
            <BellOff className="w-4 h-4 mr-2" />
            {t('skipForNow')}
          </Button>
          <Button
            onClick={handleEnable}
            className="flex-1"
            data-testid="button-enable-notifications"
          >
            <Bell className="w-4 h-4 mr-2" />
            {t('enableNotifications')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
