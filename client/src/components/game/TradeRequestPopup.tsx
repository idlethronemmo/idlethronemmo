import { useTrade } from "@/context/TradeContext";
import { useLanguage } from "@/context/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Handshake, X, Check } from "@phosphor-icons/react";

export default function TradeRequestPopup() {
  const { pendingRequest, acceptTradeRequest, declineTradeRequest } = useTrade();
  const { t } = useLanguage();

  if (!pendingRequest) return null;

  return (
    <Dialog open={true} onOpenChange={() => declineTradeRequest()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="w-6 h-6 text-primary" weight="fill" />
            {t('tradeRequestTitle')}
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{pendingRequest.fromPlayerName}</span> {t('wantsToTradeWithYou')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button 
            variant="outline" 
            onClick={declineTradeRequest}
            className="flex-1"
            data-testid="button-decline-trade"
          >
            <X className="w-4 h-4 mr-2" />
            {t('reject')}
          </Button>
          <Button 
            onClick={acceptTradeRequest}
            className="flex-1"
            data-testid="button-accept-trade"
          >
            <Check className="w-4 h-4 mr-2" />
            {t('acceptBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
