import { useState, useEffect, useRef, useCallback } from "react";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { t as translate } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Mail, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
  const { signIn, signUp, signInWithGoogle, loading, error, clearError, emailVerificationSent, pendingVerificationEmail, resendVerificationEmail, sendResetPasswordEmail, passwordResetSent } = useFirebaseAuth();
  const t = useCallback((key: Parameters<typeof translate>[1]) => translate('en', key), []);
  const [guestLoading, setGuestLoading] = useState(false);
  const { toast } = useToast();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [activeTab, setActiveTab] = useState("login");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownTimerRef.current = setTimeout(() => {
        setResendCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, [resendCooldown]);

  useEffect(() => {
    if (emailVerificationSent) {
      setActiveTab("login");
      if (pendingVerificationEmail) {
        setLoginEmail(pendingVerificationEmail);
      }
    }
  }, [emailVerificationSent, pendingVerificationEmail]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(loginEmail, loginPassword);
    } catch (err) {
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signUp(registerEmail, registerPassword);
    } catch (err) {
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
    }
  };

  const handleGuestLogin = async () => {
    setGuestLoading(true);
    try {
      const storedLanguage = localStorage.getItem('preferredLanguage') || 'en';
      const response = await fetch('/api/auth/guest-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ language: storedLanguage }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Guest login failed');
      }

      const result = await response.json();
      
      if (result.sessionToken) {
        localStorage.setItem('gameSessionToken', result.sessionToken);
      }
      
      window.location.href = '/skills';
    } catch (err) {
      toast({
        title: 'Guest login failed',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setGuestLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!pendingVerificationEmail || !registerPassword || resendCooldown > 0) return;
    try {
      await resendVerificationEmail(pendingVerificationEmail, registerPassword);
      setResendCooldown(5);
      toast({
        title: t('emailSent'),
        description: t('verificationEmailSentTo').replace('{email}', pendingVerificationEmail),
        duration: 3000,
      });
    } catch (err) {
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await sendResetPasswordEmail(forgotPasswordEmail);
    } catch (err) {
    }
  };

  const openForgotPassword = () => {
    setForgotPasswordEmail(loginEmail);
    setForgotPasswordOpen(true);
    clearError();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-zinc-900/80 border-zinc-700">
        <CardHeader className="text-center">
          <div className="mx-auto w-20 h-20 mb-4">
            <img src="/throne-logo.png" alt="IdleThrone" className="w-full h-full object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold text-amber-400">IdleThrone</CardTitle>
          <CardDescription className="text-zinc-400">
            {t('welcomeMessage')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); clearError(); }}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="login" data-testid="tab-login">{t('login')}</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">{t('register')}</TabsTrigger>
            </TabsList>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            {emailVerificationSent && pendingVerificationEmail && (
              <div className="bg-amber-500/10 border border-amber-500/50 text-amber-400 px-4 py-3 rounded-lg mb-4 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="w-4 h-4" />
                  <span className="font-medium">{t('authVerificationSent').replace('{email}', pendingVerificationEmail)}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={`mt-2 ${resendCooldown > 0 ? 'border-gray-500/50 text-gray-500 cursor-not-allowed' : 'border-amber-500/50 text-amber-400 hover:bg-amber-500/10'}`}
                  onClick={handleResendVerification}
                  disabled={loading || resendCooldown > 0}
                  data-testid="button-resend-verification"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
                  {resendCooldown > 0 
                    ? `${t('authResendVerification')} (${resendCooldown})` 
                    : t('authResendVerification')}
                </Button>
              </div>
            )}

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="example@email.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    data-testid="input-login-email"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">{t('password')}</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    data-testid="input-login-password"
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <button
                    type="button"
                    onClick={openForgotPassword}
                    className="text-xs text-amber-400 hover:text-amber-300 hover:underline"
                    data-testid="button-forgot-password"
                  >
                    {t('authForgotPassword')}
                  </button>
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-amber-600 hover:bg-amber-500"
                  disabled={loading}
                  data-testid="button-login"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {t('login')}
                </Button>
              </form>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-700"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-zinc-900 px-2 text-zinc-500">{t('or')}</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full border-zinc-700 hover:bg-zinc-800"
                onClick={handleGoogleSignIn}
                disabled={loading || guestLoading}
                data-testid="button-google-signin"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {t('googleSignIn')}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full border-zinc-600 text-zinc-300 hover:bg-zinc-800 mt-2"
                onClick={handleGuestLogin}
                disabled={loading || guestLoading}
                data-testid="button-guest-login"
              >
                {guestLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Users className="w-5 h-5 mr-2" />}
                {t('playAsGuest')}
              </Button>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-email">{t('email')}</Label>
                  <Input
                    id="register-email"
                    type="email"
                    placeholder="example@email.com"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    required
                    data-testid="input-register-email"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">{t('password')}</Label>
                  <Input
                    id="register-password"
                    type="password"
                    placeholder="••••••••"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    required
                    minLength={6}
                    data-testid="input-register-password"
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <p className="text-xs text-zinc-500">{t('passwordHint')}</p>
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-amber-600 hover:bg-amber-500"
                  disabled={loading}
                  data-testid="button-register"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {t('register')}
                </Button>
              </form>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-700"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-zinc-900 px-2 text-zinc-500">{t('or')}</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full border-zinc-700 hover:bg-zinc-800"
                onClick={handleGoogleSignIn}
                disabled={loading}
                data-testid="button-google-register"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {t('googleRegister')}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={forgotPasswordOpen} onOpenChange={(open) => { setForgotPasswordOpen(open); if (!open) clearError(); }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-amber-400">{t('authForgotPassword')}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {t('authForgotPasswordDesc')}
            </DialogDescription>
          </DialogHeader>
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {passwordResetSent ? (
            <div className="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg text-sm">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>{t('authResetEmailSent')}</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="example@email.com"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  required
                  data-testid="input-forgot-email"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-amber-600 hover:bg-amber-500"
                disabled={loading}
                data-testid="button-send-reset"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {t('authSendResetLink')}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
