import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Sword, 
  CheckCircle, 
  XCircle,
  Spinner,
  Sparkle,
  User,
  GameController,
  CaretLeft,
  CaretRight,
  Globe,
  Check
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import { LANGUAGES, Language } from "@/lib/i18n";

import avatarKnight from "@/assets/generated_images/pixel_art_knight_portrait.png";
import avatarMage from "@/assets/generated_images/pixel_art_mage_portrait.png";
import avatarArcher from "@/assets/generated_images/pixel_art_archer_portrait.png";
import avatarWarrior from "@/assets/generated_images/pixel_art_warrior_portrait.png";
import avatarRogue from "@/assets/generated_images/pixel_art_rogue_portrait.png";
import avatarHealer from "@/assets/generated_images/pixel_art_healer_portrait.png";
import avatarNecromancer from "@/assets/generated_images/pixel_art_necromancer_portrait.png";
import avatarPaladin from "@/assets/generated_images/pixel_art_paladin_portrait.png";
import avatarBerserker from "@/assets/generated_images/pixel_art_berserker_portrait.png";
import avatarDruid from "@/assets/generated_images/pixel_art_druid_portrait.png";

const AVATAR_DATA = [
  { id: 'knight', nameKey: 'avatarKnight' as const, image: avatarKnight },
  { id: 'mage', nameKey: 'avatarMage' as const, image: avatarMage },
  { id: 'archer', nameKey: 'avatarArcher' as const, image: avatarArcher },
  { id: 'warrior', nameKey: 'avatarWarrior' as const, image: avatarWarrior },
  { id: 'rogue', nameKey: 'avatarRogue' as const, image: avatarRogue },
  { id: 'healer', nameKey: 'avatarHealer' as const, image: avatarHealer },
  { id: 'necromancer', nameKey: 'avatarNecromancer' as const, image: avatarNecromancer },
  { id: 'paladin', nameKey: 'avatarPaladin' as const, image: avatarPaladin },
  { id: 'berserker', nameKey: 'avatarBerserker' as const, image: avatarBerserker },
  { id: 'druid', nameKey: 'avatarDruid' as const, image: avatarDruid },
];

interface OnboardingPageProps {
  onComplete: () => void;
  onBack?: () => void;
  onboardingData?: {
    firebaseUid: string;
    email: string | null;
    displayName: string | null;
  };
}

export default function OnboardingPage({ onComplete, onBack, onboardingData }: OnboardingPageProps) {
  const { t, setLanguage } = useLanguage();
  const [step, setStep] = useState<'character' | 'language'>('character');
  const [username, setUsername] = useState("");
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('en');

  const avatars = useMemo(() => AVATAR_DATA.map(avatar => ({
    ...avatar,
    name: t(avatar.nameKey)
  })), [t]);

  const selectedAvatar = avatars[avatarIndex];

  const prevAvatar = () => {
    setAvatarIndex((prev) => (prev - 1 + avatars.length) % avatars.length);
  };

  const nextAvatar = () => {
    setAvatarIndex((prev) => (prev + 1) % avatars.length);
  };

  const checkUsername = useCallback(async (name: string) => {
    if (name.length < 3) {
      setIsAvailable(null);
      return;
    }

    setIsChecking(true);
    try {
      const response = await fetch(`/api/players/check-username?username=${encodeURIComponent(name)}`, {
        credentials: 'include'
      });
      const data = await response.json();
      setIsAvailable(data.available);
    } catch (err) {
      console.error("Error checking username:", err);
      setIsAvailable(null);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (username.length >= 3) {
        checkUsername(username);
      } else {
        setIsAvailable(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, checkUsername]);

  const handleContinueToLanguage = () => {
    if (!isAvailable || username.length < 3) return;
    setStep('language');
  };

  const handleLanguageSelect = (lang: Language) => {
    setSelectedLanguage(lang);
    setLanguage(lang);
  };

  const handleSubmit = async () => {
    if (!isAvailable || username.length < 3 || isCreating) return;

    setIsCreating(true);
    setError(null);

    try {
      // If we have Firebase onboarding data, use Firebase registration endpoint
      if (onboardingData) {
        // Need to get the current Firebase user's ID token
        const { auth } = await import("@/lib/firebase");
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error(t('sessionNotFound'));
        }
        const idToken = await currentUser.getIdToken();
        
        const response = await fetch("/api/auth/firebase-register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
          credentials: 'include',
          body: JSON.stringify({
            username,
            avatar: selectedAvatar.id,
            language: selectedLanguage
          })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || "Failed to create character");
        }
      } else {
        // Fallback to old Replit Auth endpoint
        const response = await fetch("/api/players", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: 'include',
          body: JSON.stringify({
            username,
            avatar: selectedAvatar.id,
            language: selectedLanguage
          })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create character");
        }
      }

      onComplete();
    } catch (err: any) {
      setError(err.message);
      setIsCreating(false);
    }
  };

  const canContinue = isAvailable && username.length >= 3;

  if (step === 'language') {
    return (
      <div className="min-h-screen bg-background text-foreground overflow-hidden relative flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-600/20 rounded-full blur-3xl animate-pulse delay-1000" />

        <Card className="relative z-10 w-full max-w-lg bg-card/80 backdrop-blur-xl border-border/50 shadow-2xl shadow-black/50">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-gradient-to-br from-primary/30 to-amber-500/20 rounded-xl border border-primary/40">
                <Globe className="w-10 h-10 text-primary" weight="bold" />
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkle className="w-5 h-5 text-primary" weight="fill" />
              <span className="text-xl font-display text-foreground">{t('selectLanguage')}</span>
              <Sparkle className="w-5 h-5 text-primary" weight="fill" />
            </div>
            <p className="text-sm text-muted-foreground font-ui">
              {t('chooseYourLanguage')}
            </p>
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageSelect(lang.code)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    selectedLanguage === lang.code
                      ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                      : "border-border bg-card/50 hover:border-primary/50 hover:bg-primary/5"
                  )}
                  data-testid={`button-language-${lang.code}`}
                >
                  <span className="text-2xl">{lang.flag}</span>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-ui text-foreground">{lang.nativeName}</div>
                    <div className="text-xs text-muted-foreground">{lang.name}</div>
                  </div>
                  {selectedLanguage === lang.code && (
                    <Check className="w-5 h-5 text-primary" weight="bold" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={() => setStep('character')}
                data-testid="button-back-to-character"
              >
                <CaretLeft className="w-5 h-5 mr-2" weight="bold" />
                {t('back')}
              </Button>
              <Button
                className={cn(
                  "flex-1 h-12 font-ui font-semibold transition-all duration-200",
                  "bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 text-primary-foreground shadow-lg shadow-primary/30"
                )}
                onClick={handleSubmit}
                disabled={isCreating}
                data-testid="button-start-game"
              >
                {isCreating ? (
                  <>
                    <Spinner className="w-5 h-5 mr-2 animate-spin" />
                    {t('creating')}
                  </>
                ) : (
                  <>
                    <GameController className="w-5 h-5 mr-2" weight="bold" />
                    {t('startAdventure')}
                  </>
                )}
              </Button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm font-ui">
                {error}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden relative flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-600/20 rounded-full blur-3xl animate-pulse delay-1000" />

      <Card className="relative z-10 w-full max-w-lg bg-card/80 backdrop-blur-xl border-border/50 shadow-2xl shadow-black/50">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-gradient-to-br from-primary/30 to-amber-500/20 rounded-xl border border-primary/40">
              <Sword className="w-10 h-10 text-primary" weight="bold" />
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkle className="w-5 h-5 text-primary" weight="fill" />
            <span className="text-xl font-display text-foreground">{t('createCharacter')}</span>
            <Sparkle className="w-5 h-5 text-primary" weight="fill" />
          </div>
          <p className="text-sm text-muted-foreground font-ui">
            {t('chooseNameAndAvatar')}
          </p>
        </CardHeader>

        <CardContent className="space-y-6 pt-4">
          <div className="flex flex-col items-center space-y-4">
            <div className="flex items-center gap-4">
              <button
                onClick={prevAvatar}
                className="p-3 rounded-full bg-card border border-border hover:border-primary/50 hover:bg-primary/10 transition-all"
                data-testid="button-prev-avatar"
              >
                <CaretLeft className="w-6 h-6 text-foreground" weight="bold" />
              </button>

              <div className="relative">
                <div className="w-32 h-32 rounded-2xl overflow-hidden border-4 border-primary/50 shadow-2xl shadow-primary/20 bg-gradient-to-br from-primary/20 to-violet-600/20">
                  <img 
                    src={selectedAvatar.image} 
                    alt={selectedAvatar.name}
                    className="w-full h-full object-cover"
                    data-testid="img-selected-avatar"
                  />
                </div>
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-card border border-border rounded-full">
                  <span className="text-xs font-ui text-muted-foreground">{selectedAvatar.name}</span>
                </div>
              </div>

              <button
                onClick={nextAvatar}
                className="p-3 rounded-full bg-card border border-border hover:border-primary/50 hover:bg-primary/10 transition-all"
                data-testid="button-next-avatar"
              >
                <CaretRight className="w-6 h-6 text-foreground" weight="bold" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 pt-2">
              {avatars.map((_, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    idx === avatarIndex 
                      ? "bg-primary w-4" 
                      : "bg-muted-foreground/30"
                  )}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground/70 text-center" data-testid="text-avatar-info">
              {t('avatarInfoText')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-ui text-muted-foreground">
              {t('characterName')}
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="username"
                type="text"
                placeholder={t('heroNamePlaceholder')}
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16))}
                maxLength={16}
                className={cn(
                  "pl-10 pr-10 h-12 bg-background border-border focus:border-primary transition-colors",
                  isAvailable === false && "border-red-500 focus:border-red-500",
                  isAvailable === true && "border-emerald-500 focus:border-emerald-500"
                )}
                data-testid="input-nickname"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {isChecking && <Spinner className="w-5 h-5 text-muted-foreground animate-spin" />}
                {!isChecking && isAvailable === true && <CheckCircle className="w-5 h-5 text-emerald-500" weight="fill" />}
                {!isChecking && isAvailable === false && <XCircle className="w-5 h-5 text-red-500" weight="fill" />}
              </div>
            </div>
            {isAvailable === false && (
              <p className="text-xs text-red-500 font-ui">{t('nameTaken')}</p>
            )}
            {isAvailable === true && (
              <p className="text-xs text-emerald-500 font-ui">{t('nameAvailable')}</p>
            )}
            {isAvailable === null && username.length > 0 && username.length < 3 && (
              <p className="text-xs text-amber-500 font-ui">{t('minCharsRequired')}</p>
            )}
            {username.length === 0 && (
              <p className="text-xs text-muted-foreground font-ui">
                {t('usernameRules')}
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm font-ui">
              {error}
            </div>
          )}

          <Button
            className={cn(
              "w-full h-12 font-ui font-semibold transition-all duration-200",
              canContinue
                ? "bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 text-primary-foreground shadow-lg shadow-primary/30"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            onClick={handleContinueToLanguage}
            disabled={!canContinue}
            data-testid="button-continue-to-language"
          >
            <CaretRight className="w-5 h-5 mr-2" weight="bold" />
            {t('continue')}
          </Button>

          {onBack && (
            <Button
              variant="ghost"
              className="w-full h-10 text-muted-foreground hover:text-foreground"
              onClick={onBack}
              data-testid="button-back-to-login"
            >
              <CaretLeft className="w-4 h-4 mr-1" weight="bold" />
              {t('authBackToLogin')}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
