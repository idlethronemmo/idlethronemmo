import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useGame } from "@/context/GameContext";
import { useFirebaseAuth, getAuthHeaders } from "@/context/FirebaseAuthContext";
import { useDevMode } from "@/context/DevModeContext";
import { LANGUAGES, Language, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { GearSix, Globe, Check, Handshake, Bell, BellSlash, PaperPlaneTilt, SignOut, Trash, Warning, FloppyDisk, DiscordLogo, SpeakerHigh, MusicNote, Waveform } from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMobile } from "@/hooks/useMobile";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAudio } from "@/context/AudioContext";
import SaveAccountDialog from "@/components/game/SaveAccountDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function SettingsPage() {
  const { player, updateLanguage, language, prepareForOffline, isGuest } = useGame();
  const { logout, deleteAccount } = useFirebaseAuth();
  const { isDevMode, devLogout } = useDevMode();
  const { toast } = useToast();
  const { isMobile } = useMobile();
  const {
    settings: audioSettings,
    setMusicEnabled,
    setMusicVolume,
    setAmbientEnabled,
    setAmbientVolume,
    setSfxEnabled,
    setSfxVolume,
  } = useAudio();
  const [saving, setSaving] = useState(false);
  const [tradeEnabled, setTradeEnabled] = useState(true);
  const [savingTrade, setSavingTrade] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [saveAccountOpen, setSaveAccountOpen] = useState(false);
  const { 
    isSubscribed, 
    isSupported, 
    isDenied, 
    isLoading: pushLoading,
    subscribe: subscribePush,
    unsubscribe: unsubscribePush,
    testNotification
  } = usePushNotifications();
  const [testingPush, setTestingPush] = useState(false);

  useEffect(() => {
    if (player) {
      setTradeEnabled((player as any).tradeEnabled === 1);
    }
  }, [player]);

  const handleTradeSettingChange = async (enabled: boolean) => {
    if (!player) return;
    setSavingTrade(true);
    try {
      const authHdrs = await getAuthHeaders();
      const response = await fetch(`/api/players/${player.id}/trade-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHdrs },
        credentials: 'include',
        body: JSON.stringify({ tradeEnabled: enabled }),
      });
      if (!response.ok) throw new Error('Failed to save');
      setTradeEnabled(enabled);
      toast({
        title: enabled ? t(language, 'tradeRequestsEnabled') : t(language, 'tradeRequestsDisabled'),
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: t(language, 'error'),
        description: t(language, 'settingSaveFailed'),
        variant: "destructive",
      });
    } finally {
      setSavingTrade(false);
    }
  };

  const handlePushToggle = async (enabled: boolean) => {
    if (enabled) {
      const success = await subscribePush();
      if (success) {
        toast({
          title: t(language, 'pushNotificationsEnabled'),
          description: t(language, 'pushNotificationsEnabledDesc'),
          duration: 3000,
        });
      } else {
        toast({
          title: t(language, 'permissionDenied'),
          description: t(language, 'allowNotificationsInBrowser'),
          variant: "destructive",
        });
      }
    } else {
      const success = await unsubscribePush();
      if (success) {
        toast({
          title: t(language, 'pushNotificationsDisabled'),
          duration: 2000,
        });
      } else {
        toast({
          title: t(language, 'error'),
          description: t(language, 'notificationsDisableFailed'),
          variant: "destructive",
        });
      }
    }
  };

  const handleTestPush = async () => {
    setTestingPush(true);
    const success = await testNotification();
    if (success) {
      toast({
        title: t(language, 'testNotificationSent'),
        description: t(language, 'testNotificationSentDesc'),
        duration: 3000,
      });
    } else {
      toast({
        title: t(language, 'testFailed'),
        description: t(language, 'notificationSendFailed'),
        variant: "destructive",
      });
    }
    setTestingPush(false);
  };

  const handleLanguageChange = async (lang: Language) => {
    setSaving(true);
    try {
      await updateLanguage(lang);
      toast({
        title: getSuccessMessage(lang),
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save language preference",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      // Always clear guest session token on logout
      localStorage.removeItem('gameSessionToken');
      
      if (isDevMode) {
        await prepareForOffline();
        devLogout();
        // No reload needed - React state update will show login screen
        return;
      }
      
      // For guest users, just redirect (no Firebase logout needed)
      if (isGuest) {
        window.location.href = '/';
        return;
      }
      
      await logout();
      window.location.href = '/';
    } catch (error) {
      toast({
        title: t(language, 'error'),
        description: t(language, 'authLogoutFailed'),
        variant: "destructive",
      });
      setLoggingOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDevMode) {
      toast({
        title: t(language, 'error'),
        description: getDevModeDeleteMessage(language),
        variant: "destructive",
      });
      return;
    }
    
    setDeletingAccount(true);
    try {
      await deleteAccount();
      window.location.href = '/';
    } catch (error) {
      toast({
        title: t(language, 'error'),
        description: getDeleteAccountFailedMessage(language),
        variant: "destructive",
      });
      setDeletingAccount(false);
    }
  };

  return (
      <div className={cn("space-y-6", isMobile ? "pb-24" : "pb-8")}>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-violet-500/20 border border-violet-500/30">
            <GearSix className="w-8 h-8 text-violet-400" weight="bold" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">
              {getSettingsTitle(language)}
            </h1>
            <p className="text-muted-foreground font-ui">
              {getSettingsSubtitle(language)}
            </p>
          </div>
        </div>

        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-lg">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="flex items-center gap-3 text-xl font-display">
              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Globe className="w-5 h-5 text-blue-400" weight="bold" />
              </div>
              {getLanguageTitle(language)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {LANGUAGES.map((lang) => (
                <Button
                  key={lang.code}
                  variant="outline"
                  className={cn(
                    "h-auto py-4 px-4 flex flex-col items-center gap-2 transition-all relative",
                    language === lang.code 
                      ? "border-primary bg-primary/10 ring-2 ring-primary/30" 
                      : "hover:border-primary/50 hover:bg-muted/50"
                  )}
                  onClick={() => handleLanguageChange(lang.code)}
                  disabled={saving}
                  data-testid={`language-option-${lang.code}`}
                >
                  {language === lang.code && (
                    <div className="absolute top-2 right-2">
                      <Check className="w-4 h-4 text-primary" weight="bold" />
                    </div>
                  )}
                  <span className="text-3xl">{lang.flag}</span>
                  <span className="font-display font-bold text-foreground">{lang.nativeName}</span>
                  <span className="text-xs text-muted-foreground">{lang.name}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-lg">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="flex items-center gap-3 text-xl font-display">
              <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                <Handshake className="w-5 h-5 text-violet-400" weight="bold" />
              </div>
              {getTradeTitle(language)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border">
              <div className="space-y-1">
                <div className="font-medium text-foreground">
                  {getTradeSettingLabel(language)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {getTradeSettingDescription(language)}
                </div>
              </div>
              <Switch
                checked={tradeEnabled}
                onCheckedChange={handleTradeSettingChange}
                disabled={savingTrade}
                data-testid="switch-trade-enabled"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-lg">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="flex items-center gap-3 text-xl font-display">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Bell className="w-5 h-5 text-amber-400" weight="bold" />
              </div>
              {getPushTitle(language)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border">
              <div className="space-y-1">
                <div className="font-medium text-foreground flex items-center gap-2">
                  {isSubscribed ? (
                    <Bell className="w-4 h-4 text-green-400" weight="fill" />
                  ) : (
                    <BellSlash className="w-4 h-4 text-muted-foreground" />
                  )}
                  {getPushSettingLabel(language)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {!isSupported 
                    ? getPushUnsupportedMessage(language)
                    : isDenied 
                      ? getPushDeniedMessage(language)
                      : getPushSettingDescription(language)
                  }
                </div>
              </div>
              <Switch
                checked={isSubscribed}
                onCheckedChange={handlePushToggle}
                disabled={pushLoading || isDenied || !isSupported}
                data-testid="switch-push-enabled"
              />
            </div>
            
            {isSubscribed && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestPush}
                disabled={testingPush}
                className="w-full"
                data-testid="button-test-push"
              >
                <PaperPlaneTilt className="w-4 h-4 mr-2" />
                {testingPush ? t(language, 'sending') : t(language, 'sendTestNotification')}
              </Button>
            )}
          </CardContent>
        </Card>

        {isGuest && (
          <Card className="bg-card/80 backdrop-blur-sm border-amber-500/30 shadow-lg ring-2 ring-amber-500/20">
            <CardHeader className="border-b border-amber-500/30 bg-amber-500/10">
              <CardTitle className="flex items-center gap-3 text-xl font-display">
                <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                  <FloppyDisk className="w-5 h-5 text-amber-400" weight="bold" />
                </div>
                {getSaveAccountTitle(language)}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  {getSaveAccountDescription(language)}
                </p>
                <Button
                  size="lg"
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => setSaveAccountOpen(true)}
                  data-testid="button-save-account-settings"
                >
                  <FloppyDisk className="w-5 h-5 mr-2" weight="bold" />
                  {getSaveAccountButton(language)}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <SaveAccountDialog open={saveAccountOpen} onOpenChange={setSaveAccountOpen} />

        <Card className="bg-card/80 backdrop-blur-sm border-emerald-500/30 shadow-lg">
          <CardHeader className="border-b border-emerald-500/30 bg-emerald-500/10">
            <CardTitle className="flex items-center gap-3 text-xl font-display">
              <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                <SpeakerHigh className="w-5 h-5 text-emerald-400" weight="bold" />
              </div>
              Audio
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MusicNote className="w-4 h-4 text-emerald-400" weight="bold" />
                  <span className="font-medium text-foreground text-sm">Music</span>
                </div>
                <Switch
                  checked={audioSettings.musicEnabled}
                  onCheckedChange={setMusicEnabled}
                  data-testid="switch-music-enabled"
                />
              </div>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[audioSettings.musicVolume]}
                onValueChange={([v]) => setMusicVolume(v)}
                disabled={!audioSettings.musicEnabled}
                className="w-full"
                data-testid="slider-music-volume"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SpeakerHigh className="w-4 h-4 text-emerald-400" weight="bold" />
                  <span className="font-medium text-foreground text-sm">Sound Effects</span>
                </div>
                <Switch
                  checked={audioSettings.sfxEnabled}
                  onCheckedChange={setSfxEnabled}
                  data-testid="switch-sfx-enabled"
                />
              </div>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[audioSettings.sfxVolume]}
                onValueChange={([v]) => setSfxVolume(v)}
                disabled={!audioSettings.sfxEnabled}
                className="w-full"
                data-testid="slider-sfx-volume"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm border-indigo-500/30 shadow-lg">
          <CardHeader className="border-b border-indigo-500/30 bg-indigo-500/10">
            <CardTitle className="flex items-center gap-3 text-xl font-display">
              <div className="p-2 rounded-lg bg-indigo-500/20 border border-indigo-500/30">
                <DiscordLogo className="w-5 h-5 text-indigo-400" weight="bold" />
              </div>
              {getDiscordTitle(language)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <p className="text-muted-foreground">
                {getDiscordDescription(language)}
              </p>
              <Button
                size="lg"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => window.open('https://discord.gg/kwk6K4GJrr', '_blank')}
                data-testid="button-discord-join"
              >
                <DiscordLogo className="w-5 h-5 mr-2" weight="bold" />
                {getDiscordButton(language)}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-lg">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="flex items-center gap-3 text-xl font-display">
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <SignOut className="w-5 h-5 text-red-400" weight="bold" />
              </div>
              {getAccountTitle(language)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <Button
              variant="destructive"
              size="lg"
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full"
              data-testid="button-logout"
            >
              <SignOut className="w-5 h-5 mr-2" weight="bold" />
              {loggingOut ? t(language, 'loading') : getLogoutLabel(language)}
            </Button>

            {!isDevMode && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
                    disabled={deletingAccount}
                    data-testid="button-delete-account"
                  >
                    <Trash className="w-5 h-5 mr-2" weight="bold" />
                    {deletingAccount ? t(language, 'loading') : getDeleteAccountLabel(language)}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-red-400">
                      <Warning className="w-5 h-5" weight="fill" />
                      {getDeleteAccountTitle(language)}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                      {getDeleteAccountWarning(language)}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-muted hover:bg-muted/80">
                      {getCancelLabel(language)}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      className="bg-red-600 hover:bg-red-700 text-white"
                      data-testid="button-confirm-delete"
                    >
                      {getConfirmDeleteLabel(language)}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </CardContent>
        </Card>
      </div>
  );
}

function getSettingsTitle(lang: Language): string {
  const titles: Record<Language, string> = {
    en: "Settings",
    zh: "设置",
    hi: "सेटिंग्स",
    es: "Ajustes",
    fr: "Paramètres",
    ar: "الإعدادات",
    ru: "Настройки",
    tr: "Ayarlar",
  };
  return titles[lang];
}

function getSettingsSubtitle(lang: Language): string {
  const subtitles: Record<Language, string> = {
    en: "Customize your experience",
    zh: "自定义您的体验",
    hi: "अपना अनुभव अनुकूलित करें",
    es: "Personaliza tu experiencia",
    fr: "Personnalisez votre expérience",
    ar: "خصص تجربتك",
    ru: "Настройте ваш опыт",
    tr: "Deneyiminizi özelleştirin",
  };
  return subtitles[lang];
}

function getLanguageTitle(lang: Language): string {
  const titles: Record<Language, string> = {
    en: "Language",
    zh: "语言",
    hi: "भाषा",
    es: "Idioma",
    fr: "Langue",
    ar: "اللغة",
    ru: "Язык",
    tr: "Dil",
  };
  return titles[lang];
}

function getSuccessMessage(lang: Language): string {
  const messages: Record<Language, string> = {
    en: "Language changed successfully",
    zh: "语言更改成功",
    hi: "भाषा सफलतापूर्वक बदली गई",
    es: "Idioma cambiado correctamente",
    fr: "Langue changée avec succès",
    ar: "تم تغيير اللغة بنجاح",
    ru: "Язык успешно изменён",
    tr: "Dil başarıyla değiştirildi",
  };
  return messages[lang];
}

function getTradeTitle(lang: Language): string {
  const titles: Record<Language, string> = {
    en: "Trade Settings",
    zh: "交易设置",
    hi: "व्यापार सेटिंग्स",
    es: "Configuración de comercio",
    fr: "Paramètres d'échange",
    ar: "إعدادات التبادل",
    ru: "Настройки обмена",
    tr: "Takas Ayarları",
  };
  return titles[lang];
}

function getTradeSettingLabel(lang: Language): string {
  const labels: Record<Language, string> = {
    en: "Accept trade requests",
    zh: "接受交易请求",
    hi: "व्यापार अनुरोध स्वीकार करें",
    es: "Aceptar solicitudes de comercio",
    fr: "Accepter les demandes d'échange",
    ar: "قبول طلبات التبادل",
    ru: "Принимать запросы на обмен",
    tr: "Takas isteklerini kabul et",
  };
  return labels[lang];
}

function getTradeSettingDescription(lang: Language): string {
  const descriptions: Record<Language, string> = {
    en: "When disabled, other players cannot send you trade requests",
    zh: "关闭后，其他玩家无法向您发送交易请求",
    hi: "अक्षम होने पर, अन्य खिलाड़ी आपको व्यापार अनुरोध नहीं भेज सकते",
    es: "Cuando está desactivado, otros jugadores no pueden enviarte solicitudes de comercio",
    fr: "Lorsque désactivé, les autres joueurs ne peuvent pas vous envoyer de demandes d'échange",
    ar: "عند التعطيل، لا يمكن للاعبين الآخرين إرسال طلبات تبادل إليك",
    ru: "Когда отключено, другие игроки не могут отправлять вам запросы на обмен",
    tr: "Kapatıldığında, diğer oyuncular sana takas isteği gönderemez",
  };
  return descriptions[lang];
}

function getPushTitle(lang: Language): string {
  const titles: Record<Language, string> = {
    en: "Push Notifications",
    zh: "推送通知",
    hi: "पुश सूचनाएं",
    es: "Notificaciones Push",
    fr: "Notifications Push",
    ar: "الإشعارات الفورية",
    ru: "Push-уведомления",
    tr: "Push Bildirimleri",
  };
  return titles[lang];
}

function getPushSettingLabel(lang: Language): string {
  const labels: Record<Language, string> = {
    en: "Enable push notifications",
    zh: "启用推送通知",
    hi: "पुश सूचनाएं सक्षम करें",
    es: "Habilitar notificaciones push",
    fr: "Activer les notifications push",
    ar: "تفعيل الإشعارات الفورية",
    ru: "Включить push-уведомления",
    tr: "Push bildirimlerini aç",
  };
  return labels[lang];
}

function getPushSettingDescription(lang: Language): string {
  const descriptions: Record<Language, string> = {
    en: "Receive notifications for market sales, combat updates, and more",
    zh: "接收市场销售、战斗更新等通知",
    hi: "बाजार की बिक्री, युद्ध अपडेट और अधिक के लिए सूचनाएं प्राप्त करें",
    es: "Recibe notificaciones de ventas del mercado, actualizaciones de combate y más",
    fr: "Recevez des notifications pour les ventes du marché, les mises à jour de combat et plus",
    ar: "تلقي إشعارات لمبيعات السوق وتحديثات القتال والمزيد",
    ru: "Получайте уведомления о продажах на рынке, обновлениях боя и многом другом",
    tr: "Pazar satışları, savaş güncellemeleri ve daha fazlası için bildirim al",
  };
  return descriptions[lang];
}

function getPushDeniedMessage(lang: Language): string {
  const messages: Record<Language, string> = {
    en: "Notifications are blocked. Please enable them in your browser settings.",
    zh: "通知被阻止。请在浏览器设置中启用。",
    hi: "सूचनाएं अवरुद्ध हैं। कृपया अपनी ब्राउज़र सेटिंग्स में सक्षम करें।",
    es: "Las notificaciones están bloqueadas. Por favor, habilítalas en la configuración del navegador.",
    fr: "Les notifications sont bloquées. Veuillez les activer dans les paramètres du navigateur.",
    ar: "الإشعارات محظورة. يرجى تمكينها في إعدادات المتصفح.",
    ru: "Уведомления заблокированы. Пожалуйста, включите их в настройках браузера.",
    tr: "Bildirimler engellendi. Tarayıcı ayarlarından izin verin.",
  };
  return messages[lang];
}

function getPushUnsupportedMessage(lang: Language): string {
  const messages: Record<Language, string> = {
    en: "Push notifications are not supported on this device/browser.",
    zh: "此设备/浏览器不支持推送通知。",
    hi: "इस डिवाइस/ब्राउज़र पर पुश नोटिफिकेशन समर्थित नहीं हैं।",
    es: "Las notificaciones push no son compatibles con este dispositivo/navegador.",
    fr: "Les notifications push ne sont pas prises en charge sur cet appareil/navigateur.",
    ar: "الإشعارات الفورية غير مدعومة على هذا الجهاز/المتصفح.",
    ru: "Push-уведомления не поддерживаются на этом устройстве/браузере.",
    tr: "Bu cihaz/tarayıcıda push bildirimleri desteklenmiyor.",
  };
  return messages[lang];
}

function getAccountTitle(lang: Language): string {
  const titles: Record<Language, string> = {
    en: "Account",
    zh: "账户",
    hi: "खाता",
    es: "Cuenta",
    fr: "Compte",
    ar: "الحساب",
    ru: "Аккаунт",
    tr: "Hesap",
  };
  return titles[lang];
}

function getLogoutLabel(lang: Language): string {
  const labels: Record<Language, string> = {
    en: "Log Out",
    zh: "退出登录",
    hi: "लॉग आउट",
    es: "Cerrar Sesión",
    fr: "Se Déconnecter",
    ar: "تسجيل الخروج",
    ru: "Выйти",
    tr: "Çıkış Yap",
  };
  return labels[lang];
}

function getDeleteAccountLabel(lang: Language): string {
  const labels: Record<Language, string> = {
    en: "Delete Account",
    zh: "删除账户",
    hi: "खाता हटाएं",
    es: "Eliminar Cuenta",
    fr: "Supprimer le Compte",
    ar: "حذف الحساب",
    ru: "Удалить аккаунт",
    tr: "Hesabı Sil",
  };
  return labels[lang];
}

function getDeleteAccountTitle(lang: Language): string {
  const titles: Record<Language, string> = {
    en: "Delete Account?",
    zh: "删除账户？",
    hi: "खाता हटाएं?",
    es: "¿Eliminar Cuenta?",
    fr: "Supprimer le Compte ?",
    ar: "حذف الحساب؟",
    ru: "Удалить аккаунт?",
    tr: "Hesabı Sil?",
  };
  return titles[lang];
}

function getDeleteAccountWarning(lang: Language): string {
  const warnings: Record<Language, string> = {
    en: "This action cannot be undone. All your progress, items, and character data will be permanently deleted.",
    zh: "此操作无法撤销。您的所有进度、物品和角色数据将被永久删除。",
    hi: "इस क्रिया को पूर्ववत नहीं किया जा सकता। आपकी सभी प्रगति, आइटम और चरित्र डेटा स्थायी रूप से हटा दिया जाएगा।",
    es: "Esta acción no se puede deshacer. Todo tu progreso, objetos y datos del personaje se eliminarán permanentemente.",
    fr: "Cette action est irréversible. Toutes vos données de progression, objets et personnage seront définitivement supprimées.",
    ar: "لا يمكن التراجع عن هذا الإجراء. سيتم حذف جميع تقدمك وعناصرك وبيانات شخصيتك بشكل دائم.",
    ru: "Это действие нельзя отменить. Весь ваш прогресс, предметы и данные персонажа будут удалены безвозвратно.",
    tr: "Bu işlem geri alınamaz. Tüm ilerlemeniz, eşyalarınız ve karakter verileriniz kalıcı olarak silinecektir.",
  };
  return warnings[lang];
}

function getCancelLabel(lang: Language): string {
  const labels: Record<Language, string> = {
    en: "Cancel",
    zh: "取消",
    hi: "रद्द करें",
    es: "Cancelar",
    fr: "Annuler",
    ar: "إلغاء",
    ru: "Отмена",
    tr: "İptal",
  };
  return labels[lang];
}

function getConfirmDeleteLabel(lang: Language): string {
  const labels: Record<Language, string> = {
    en: "Delete Forever",
    zh: "永久删除",
    hi: "हमेशा के लिए हटाएं",
    es: "Eliminar para siempre",
    fr: "Supprimer définitivement",
    ar: "حذف نهائي",
    ru: "Удалить навсегда",
    tr: "Kalıcı Olarak Sil",
  };
  return labels[lang];
}

function getDeleteAccountFailedMessage(lang: Language): string {
  const messages: Record<Language, string> = {
    en: "Failed to delete account. Please try again.",
    zh: "删除账户失败。请重试。",
    hi: "खाता हटाने में विफल। कृपया पुनः प्रयास करें।",
    es: "No se pudo eliminar la cuenta. Por favor, inténtelo de nuevo.",
    fr: "Échec de la suppression du compte. Veuillez réessayer.",
    ar: "فشل حذف الحساب. يرجى المحاولة مرة أخرى.",
    ru: "Не удалось удалить аккаунт. Попробуйте ещё раз.",
    tr: "Hesap silinemedi. Lütfen tekrar deneyin.",
  };
  return messages[lang];
}

function getDevModeDeleteMessage(lang: Language): string {
  const messages: Record<Language, string> = {
    en: "Account deletion is not available in development mode.",
    zh: "开发模式下无法删除账户。",
    hi: "विकास मोड में खाता हटाना उपलब्ध नहीं है।",
    es: "La eliminación de cuenta no está disponible en modo de desarrollo.",
    fr: "La suppression de compte n'est pas disponible en mode développement.",
    ar: "حذف الحساب غير متاح في وضع التطوير.",
    ru: "Удаление аккаунта недоступно в режиме разработки.",
    tr: "Geliştirme modunda hesap silme kullanılamaz.",
  };
  return messages[lang];
}

function getSaveAccountTitle(lang: Language): string {
  const titles: Record<Language, string> = {
    en: "Save Your Progress",
    zh: "保存您的进度",
    hi: "अपनी प्रगति सहेजें",
    es: "Guarda tu progreso",
    fr: "Sauvegardez votre progression",
    ar: "احفظ تقدمك",
    ru: "Сохраните прогресс",
    tr: "İlerlemenizi Kaydedin",
  };
  return titles[lang];
}

function getSaveAccountDescription(lang: Language): string {
  const descriptions: Record<Language, string> = {
    en: "You're playing as a guest. Save your account to keep your progress, access trading, and log in from any device.",
    zh: "您正在以访客身份玩游戏。保存您的帐户以保留进度、访问交易功能，并从任何设备登录。",
    hi: "आप एक अतिथि के रूप में खेल रहे हैं। अपनी प्रगति रखने, ट्रेडिंग एक्सेस करने और किसी भी डिवाइस से लॉगिन करने के लिए अपना खाता सहेजें।",
    es: "Estás jugando como invitado. Guarda tu cuenta para conservar tu progreso, acceder al comercio e iniciar sesión desde cualquier dispositivo.",
    fr: "Vous jouez en tant qu'invité. Sauvegardez votre compte pour conserver votre progression, accéder aux échanges et vous connecter depuis n'importe quel appareil.",
    ar: "أنت تلعب كضيف. احفظ حسابك للحفاظ على تقدمك والوصول للتداول وتسجيل الدخول من أي جهاز.",
    ru: "Вы играете как гость. Сохраните аккаунт, чтобы сохранить прогресс, получить доступ к торговле и входить с любого устройства.",
    tr: "Misafir olarak oynuyorsunuz. İlerlemenizi korumak, ticarete erişmek ve herhangi bir cihazdan giriş yapmak için hesabınızı kaydedin.",
  };
  return descriptions[lang];
}

function getSaveAccountButton(lang: Language): string {
  const buttons: Record<Language, string> = {
    en: "Save Account",
    zh: "保存帐户",
    hi: "खाता सहेजें",
    es: "Guardar cuenta",
    fr: "Sauvegarder le compte",
    ar: "حفظ الحساب",
    ru: "Сохранить аккаунт",
    tr: "Hesabı Kaydet",
  };
  return buttons[lang];
}

function getDiscordTitle(lang: Language): string {
  const titles: Record<Language, string> = {
    en: "Community",
    zh: "社区",
    hi: "समुदाय",
    es: "Comunidad",
    fr: "Communauté",
    ar: "المجتمع",
    ru: "Сообщество",
    tr: "Topluluk",
  };
  return titles[lang];
}

function getDiscordDescription(lang: Language): string {
  const descriptions: Record<Language, string> = {
    en: "Join our Discord server to chat with other players, get updates, and share feedback!",
    zh: "加入我们的Discord服务器，与其他玩家交流、获取更新和分享反馈！",
    hi: "अन्य खिलाड़ियों से बात करने, अपडेट प्राप्त करने और फीडबैक साझा करने के लिए हमारे Discord सर्वर से जुड़ें!",
    es: "¡Únete a nuestro servidor de Discord para chatear con otros jugadores, recibir actualizaciones y compartir comentarios!",
    fr: "Rejoignez notre serveur Discord pour discuter avec d'autres joueurs, recevoir des mises à jour et partager vos retours !",
    ar: "انضم إلى خادم Discord الخاص بنا للدردشة مع لاعبين آخرين والحصول على التحديثات ومشاركة ملاحظاتك!",
    ru: "Присоединяйтесь к нашему Discord серверу, чтобы общаться с другими игроками, получать обновления и делиться отзывами!",
    tr: "Diğer oyuncularla sohbet etmek, güncellemeler almak ve geri bildirim paylaşmak için Discord sunucumuza katılın!",
  };
  return descriptions[lang];
}

function getDiscordButton(lang: Language): string {
  const buttons: Record<Language, string> = {
    en: "Join Discord",
    zh: "加入Discord",
    hi: "Discord से जुड़ें",
    es: "Unirse a Discord",
    fr: "Rejoindre Discord",
    ar: "انضم إلى Discord",
    ru: "Присоединиться к Discord",
    tr: "Discord'a Katıl",
  };
  return buttons[lang];
}
