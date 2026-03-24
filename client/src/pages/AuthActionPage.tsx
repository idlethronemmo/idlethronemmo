import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { auth, verifyPasswordResetCode, confirmPasswordReset } from "@/lib/firebase";
import { t as translate } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function AuthActionPage() {
  const t = useCallback((key: Parameters<typeof translate>[1]) => translate('en', key), []);
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    const oobCodeParam = urlParams.get('oobCode');

    setMode(modeParam);
    setOobCode(oobCodeParam);

    if (modeParam === 'resetPassword' && oobCodeParam) {
      verifyPasswordResetCode(auth, oobCodeParam)
        .then((userEmail) => {
          setEmail(userEmail);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Invalid or expired reset code:', err);
          setError(t('authResetLinkExpired'));
          setLoading(false);
        });
    } else {
      setError(t('authInvalidAction'));
      setLoading(false);
    }
  }, [t]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword.length < 6) {
      setError(t('authWeakPassword'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('authPasswordMismatch'));
      return;
    }

    if (!oobCode) {
      setError(t('authInvalidAction'));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setSuccess(true);
    } catch (err: any) {
      console.error('Password reset failed:', err);
      if (err.code === 'auth/weak-password') {
        setError(t('authWeakPassword'));
      } else if (err.code === 'auth/expired-action-code') {
        setError(t('authResetLinkExpired'));
      } else {
        setError(t('authResetPasswordFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const goToLogin = () => {
    setLocation('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-zinc-900/80 border-zinc-700">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <p className="text-zinc-400">{t('loading')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !email) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-zinc-900/80 border-zinc-700">
          <CardHeader className="text-center">
            <div className="mx-auto w-20 h-20 mb-4">
              <img src="/idlethrone-logo.png" alt="IdleThrone" className="w-full h-full object-contain" />
            </div>
            <CardTitle className="text-2xl font-bold text-amber-400">IdleThrone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              <XCircle className="w-12 h-12 text-red-400" />
              <p className="text-red-400 text-center">{error}</p>
              <Button 
                onClick={goToLogin}
                className="bg-amber-600 hover:bg-amber-500"
                data-testid="button-back-to-login"
              >
                {t('authBackToLogin')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-zinc-900/80 border-zinc-700">
          <CardHeader className="text-center">
            <div className="mx-auto w-20 h-20 mb-4">
              <img src="/idlethrone-logo.png" alt="IdleThrone" className="w-full h-full object-contain" />
            </div>
            <CardTitle className="text-2xl font-bold text-amber-400">IdleThrone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              <CheckCircle className="w-12 h-12 text-green-400" />
              <p className="text-green-400 text-center font-medium">{t('authPasswordResetSuccess')}</p>
              <p className="text-zinc-400 text-sm text-center">{t('authPasswordResetSuccessDesc')}</p>
              <Button 
                onClick={goToLogin}
                className="bg-amber-600 hover:bg-amber-500"
                data-testid="button-login-after-reset"
              >
                {t('login')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-zinc-900/80 border-zinc-700">
        <CardHeader className="text-center">
          <div className="mx-auto w-20 h-20 mb-4">
            <img src="/idlethrone-logo.png" alt="IdleThrone" className="w-full h-full object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold text-amber-400">IdleThrone</CardTitle>
          <CardDescription className="text-zinc-400">
            {t('authResetPasswordTitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {email && (
            <p className="text-zinc-400 text-sm mb-4 text-center">
              {t('authResettingFor')}: <span className="text-amber-400">{email}</span>
            </p>
          )}
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">{t('authNewPassword')}</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                data-testid="input-new-password"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t('authConfirmPassword')}</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                data-testid="input-confirm-password"
                className="bg-zinc-800 border-zinc-700"
              />
              <p className="text-xs text-zinc-500">{t('passwordHint')}</p>
            </div>
            <Button 
              type="submit" 
              className="w-full bg-amber-600 hover:bg-amber-500"
              disabled={submitting}
              data-testid="button-reset-password"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t('authResetPassword')}
            </Button>
          </form>

          <button
            type="button"
            onClick={goToLogin}
            className="w-full mt-4 text-sm text-zinc-400 hover:text-zinc-300"
            data-testid="button-cancel-reset"
          >
            {t('cancel')}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
