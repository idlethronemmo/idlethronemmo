import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  Sword, 
  Shield, 
  GoogleLogo,
  DiscordLogo,
  AppleLogo,
  Envelope,
  Lock,
  GameController,
  Sparkle,
  Users,
  Trophy,
  TrendUp
} from "@phosphor-icons/react";
import { t, Language } from "@/lib/i18n";
import { useMemo } from "react";

function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem('preferredLanguage');
    if (stored && ['en', 'zh', 'hi', 'es', 'fr', 'ar', 'ru', 'tr'].includes(stored)) {
      return stored as Language;
    }
  } catch {}
  return 'en';
}

export default function LandingPage() {
  const lang = useMemo(() => getStoredLanguage(), []);

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden relative">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC40Ij48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
      
      {/* Animated glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
      
      <div className="relative z-10 min-h-screen flex">
        {/* Left side - Branding */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12">
          <div className="max-w-lg text-center">
            <div className="inline-flex items-center gap-4 mb-8">
              <div className="p-5 bg-gradient-to-br from-primary/30 to-amber-500/20 rounded-2xl border border-primary/40 shadow-lg shadow-primary/20">
                <Sword className="w-16 h-16 text-primary" weight="bold" />
              </div>
            </div>
            
            <h1 className="text-5xl xl:text-6xl font-display font-bold mb-6 bg-gradient-to-r from-primary via-amber-400 to-primary bg-clip-text text-transparent leading-tight">
              IdleThrone
            </h1>
            
            <p className="text-xl text-muted-foreground font-ui mb-12 leading-relaxed">
              {t(lang, 'landingHeroSubtitle')}
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6">
              <div className="p-4 bg-card/50 rounded-xl border border-border backdrop-blur">
                <Users className="w-8 h-8 text-primary mx-auto mb-2" weight="bold" />
                <div className="text-2xl font-bold text-foreground">1,000+</div>
                <div className="text-sm text-muted-foreground">{t(lang, 'player')}</div>
              </div>
              <div className="p-4 bg-card/50 rounded-xl border border-border backdrop-blur">
                <Trophy className="w-8 h-8 text-amber-500 mx-auto mb-2" weight="bold" />
                <div className="text-2xl font-bold text-foreground">7</div>
                <div className="text-sm text-muted-foreground">{t(lang, 'skills')}</div>
              </div>
              <div className="p-4 bg-card/50 rounded-xl border border-border backdrop-blur">
                <TrendUp className="w-8 h-8 text-emerald-500 mx-auto mb-2" weight="bold" />
                <div className="text-2xl font-bold text-foreground">24/7</div>
                <div className="text-sm text-muted-foreground">{t(lang, 'landingProgress')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Login Form */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 lg:p-12">
          <Card className="w-full max-w-md bg-card/80 backdrop-blur-xl border-border/50 shadow-2xl shadow-black/50">
            <CardHeader className="text-center pb-2">
              {/* Mobile logo */}
              <div className="lg:hidden flex justify-center mb-4">
                <div className="p-4 bg-gradient-to-br from-primary/30 to-amber-500/20 rounded-xl border border-primary/40">
                  <Sword className="w-10 h-10 text-primary" weight="bold" />
                </div>
              </div>
              <h2 className="text-2xl font-display font-bold text-foreground lg:hidden mb-2">
                IdleThrone
              </h2>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkle className="w-5 h-5 text-primary" weight="fill" />
                <span className="text-lg font-display text-foreground">{t(lang, 'landingLoginTitle')}</span>
                <Sparkle className="w-5 h-5 text-primary" weight="fill" />
              </div>
              <p className="text-sm text-muted-foreground font-ui">
                {t(lang, 'landingLoginSubtitle')}
              </p>
            </CardHeader>
            
            <CardContent className="space-y-6 pt-4">
              {/* Social Login Buttons */}
              <div className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full h-12 bg-card hover:bg-muted border-border hover:border-primary/50 transition-all duration-200"
                  onClick={handleLogin}
                  data-testid="button-login-google"
                >
                  <GoogleLogo className="w-5 h-5 mr-3" weight="bold" />
                  <span className="font-ui">{t(lang, 'landingGoogleLogin')}</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full h-12 bg-card hover:bg-muted border-border hover:border-primary/50 transition-all duration-200"
                  onClick={handleLogin}
                  data-testid="button-login-discord"
                >
                  <DiscordLogo className="w-5 h-5 mr-3" weight="bold" />
                  <span className="font-ui">{t(lang, 'landingDiscordLogin')}</span>
                </Button>

                <Button 
                  variant="outline" 
                  className="w-full h-12 bg-card hover:bg-muted border-border hover:border-primary/50 transition-all duration-200"
                  onClick={handleLogin}
                  data-testid="button-login-apple"
                >
                  <AppleLogo className="w-5 h-5 mr-3" weight="bold" />
                  <span className="font-ui">{t(lang, 'landingAppleLogin')}</span>
                </Button>
              </div>

              <div className="relative">
                <Separator className="bg-border" />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-sm text-muted-foreground font-ui">
                  {t(lang, 'or')}
                </span>
              </div>

              {/* Email/Password Form (visual only - redirects to Replit Auth) */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-ui text-muted-foreground">
                    {t(lang, 'email')}
                  </Label>
                  <div className="relative">
                    <Envelope className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input 
                      id="email"
                      type="email" 
                      placeholder="example@email.com"
                      className="pl-10 h-12 bg-background border-border focus:border-primary transition-colors"
                      data-testid="input-email"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-ui text-muted-foreground">
                    {t(lang, 'password')}
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input 
                      id="password"
                      type="password" 
                      placeholder="••••••••"
                      className="pl-10 h-12 bg-background border-border focus:border-primary transition-colors"
                      data-testid="input-password"
                    />
                  </div>
                </div>

                <Button 
                  className="w-full h-12 bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 text-primary-foreground font-ui font-semibold shadow-lg shadow-primary/30 transition-all duration-200"
                  onClick={handleLogin}
                  data-testid="button-login"
                >
                  <GameController className="w-5 h-5 mr-2" weight="bold" />
                  {t(lang, 'landingLoginButton')}
                </Button>
              </div>

              {/* Register link */}
              <div className="text-center pt-2">
                <p className="text-sm text-muted-foreground font-ui">
                  {t(lang, 'landingNoAccount')}{" "}
                  <button 
                    onClick={handleLogin}
                    className="text-primary hover:text-primary/80 font-semibold transition-colors"
                    data-testid="link-register"
                  >
                    {t(lang, 'register')}
                  </button>
                </p>
              </div>

              {/* Security badge */}
              <div className="flex items-center justify-center gap-2 pt-4 border-t border-border">
                <Shield className="w-4 h-4 text-emerald-500" weight="bold" />
                <span className="text-xs text-muted-foreground font-ui">
                  {t(lang, 'landingSecureLogin')}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-muted-foreground font-ui">
            <p>{t(lang, 'landingTermsAccept')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
