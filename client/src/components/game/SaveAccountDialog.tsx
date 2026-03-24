import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGame } from "@/context/GameContext";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { t, Language } from "@/lib/i18n";
import { useLanguage } from "@/context/LanguageContext";

interface SaveAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "auth" | "nickname";

export default function SaveAccountDialog({ open, onOpenChange }: SaveAccountDialogProps) {
  const { convertGuestAccount, player } = useGame();
  const { signInWithGoogle, signUp, signIn, user, error: authError, clearError, resendVerificationEmail, emailVerificationSent, pendingVerificationEmail } = useFirebaseAuth();
  const { toast } = useToast();
  const { language } = useLanguage();
  
  const [step, setStep] = useState<Step>("auth");
  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (open) {
      clearError();
      setStep("auth");
      setNicknameError("");
      setPassword("");
      setConfirmPassword("");
      setResendCooldown(0);
      if (pendingVerificationEmail) {
        setEmail(pendingVerificationEmail);
        setAuthMode("login");
      } else {
        setEmail("");
      }
      const currentUsername = player?.username || "";
      const cleanedUsername = currentUsername.replace(/^Guest_?/i, "").trim();
      setNickname(cleanedUsername || "");
    }
  }, [open, player?.username, clearError, pendingVerificationEmail]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (user && step === "auth") {
      setStep("nickname");
    }
  }, [user, step]);

  const validateNickname = (value: string): boolean => {
    if (value.length < 3) {
      setNicknameError(getNicknameTooShort(language));
      return false;
    }
    if (value.length > 20) {
      setNicknameError(getNicknameTooLong(language));
      return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setNicknameError(getNicknameInvalidChars(language));
      return false;
    }
    setNicknameError("");
    return true;
  };

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Google auth failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!email || !password) {
      toast({
        title: t(language, "error"),
        description: getEmailPasswordRequired(language),
        variant: "destructive",
      });
      return;
    }

    if (authMode === "register" && password !== confirmPassword) {
      toast({
        title: t(language, "error"),
        description: getPasswordMismatch(language),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      if (authMode === "register") {
        await signUp(email, password);
        setResendCooldown(60);
        setAuthMode("login");
      } else {
        await signIn(email, password);
      }
    } catch (error) {
      console.error("Email auth failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email || !password || resendCooldown > 0) return;
    setIsLoading(true);
    try {
      await resendVerificationEmail(email, password);
      setResendCooldown(60);
      toast({
        title: getEmailVerificationTitle(language),
        description: getEmailVerificationDesc(language),
        duration: 5000,
      });
    } catch (error) {
      console.error("Resend verification failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateNickname(nickname)) {
      return;
    }

    setIsLoading(true);
    try {
      await convertGuestAccount(nickname);
      toast({
        title: getSuccessTitle(language),
        description: getSuccessDescription(language),
        duration: 3000,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: t(language, "error"),
        description: error.message || getConvertError(language),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-display text-amber-400">
            {getDialogTitle(language)}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {step === "auth" ? getAuthDescription(language) : getNicknameDescription(language)}
          </DialogDescription>
        </DialogHeader>

        {step === "auth" ? (
          <div className="space-y-4">
            <Button
              variant="outline"
              className="w-full border-zinc-700 hover:bg-zinc-800 hover:border-amber-500/50"
              onClick={handleGoogleAuth}
              disabled={isLoading}
              data-testid="button-google-auth"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {getGoogleButtonText(language)}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-zinc-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-zinc-900 px-2 text-zinc-500">{getOrText(language)}</span>
              </div>
            </div>

            {emailVerificationSent && (
              <div className="p-3 rounded-lg bg-green-900/30 border border-green-700/50 space-y-2" data-testid="verification-sent-banner">
                <p className="text-sm text-green-400 font-medium">
                  {getEmailVerificationTitle(language)}
                </p>
                <p className="text-xs text-green-300/80">
                  {getEmailVerificationDesc(language)}
                </p>
                <p className="text-xs text-zinc-400">
                  {getCheckSpamText(language)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-green-700/50 text-green-400 hover:bg-green-900/30"
                  onClick={handleResendVerification}
                  disabled={isLoading || resendCooldown > 0}
                  data-testid="button-resend-verification"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  {resendCooldown > 0 
                    ? `${getResendText(language)} (${resendCooldown}s)` 
                    : getResendText(language)}
                </Button>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  variant={authMode === "register" ? "default" : "outline"}
                  size="sm"
                  className={authMode === "register" ? "bg-amber-600 hover:bg-amber-700" : "border-zinc-700"}
                  onClick={() => setAuthMode("register")}
                  data-testid="button-auth-register"
                >
                  {getRegisterTab(language)}
                </Button>
                <Button
                  variant={authMode === "login" ? "default" : "outline"}
                  size="sm"
                  className={authMode === "login" ? "bg-amber-600 hover:bg-amber-700" : "border-zinc-700"}
                  onClick={() => setAuthMode("login")}
                  data-testid="button-auth-login"
                >
                  {getLoginTab(language)}
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">{getEmailLabel(language)}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="bg-zinc-800 border-zinc-700 focus:border-amber-500"
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-300">{getPasswordLabel(language)}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-zinc-800 border-zinc-700 focus:border-amber-500"
                  data-testid="input-password"
                />
              </div>

              {authMode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-zinc-300">{getConfirmPasswordLabel(language)}</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-zinc-800 border-zinc-700 focus:border-amber-500"
                    data-testid="input-confirm-password"
                  />
                </div>
              )}

              {authError && (
                <p className="text-sm text-red-400">{authError}</p>
              )}

              <Button
                className="w-full bg-amber-600 hover:bg-amber-700"
                onClick={handleEmailAuth}
                disabled={isLoading}
                data-testid="button-email-auth"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                {authMode === "register" ? getRegisterButton(language) : getLoginButton(language)}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nickname" className="text-zinc-300">{getNicknameLabel(language)}</Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  if (nicknameError) validateNickname(e.target.value);
                }}
                placeholder={getNicknamePlaceholder(language)}
                className="bg-zinc-800 border-zinc-700 focus:border-amber-500"
                maxLength={20}
                data-testid="input-nickname"
              />
              {nicknameError && (
                <p className="text-sm text-red-400">{nicknameError}</p>
              )}
              <p className="text-xs text-zinc-500">{getNicknameHint(language)}</p>
            </div>

            <Button
              className="w-full bg-amber-600 hover:bg-amber-700"
              onClick={handleSubmit}
              disabled={isLoading || !nickname}
              data-testid="button-save-account"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {getSaveButton(language)}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getDialogTitle(lang: Language): string {
  const titles: Record<Language, string> = {
    en: "Save Your Account",
    zh: "保存您的帐户",
    hi: "अपना खाता सहेजें",
    es: "Guardar tu cuenta",
    fr: "Sauvegarder votre compte",
    ar: "حفظ حسابك",
    ru: "Сохранить аккаунт",
    tr: "Hesabını Kaydet",
  };
  return titles[lang];
}

function getAuthDescription(lang: Language): string {
  const descriptions: Record<Language, string> = {
    en: "Link your guest account to save your progress permanently. Choose how you want to sign in.",
    zh: "关联您的访客帐户以永久保存您的进度。选择您的登录方式。",
    hi: "अपनी प्रगति को स्थायी रूप से सहेजने के लिए अपना अतिथि खाता लिंक करें।",
    es: "Vincula tu cuenta de invitado para guardar tu progreso permanentemente.",
    fr: "Liez votre compte invité pour sauvegarder votre progression de façon permanente.",
    ar: "اربط حسابك كضيف لحفظ تقدمك بشكل دائم.",
    ru: "Привяжите гостевой аккаунт для постоянного сохранения прогресса.",
    tr: "İlerlemenizi kalıcı olarak kaydetmek için misafir hesabınızı bağlayın.",
  };
  return descriptions[lang];
}

function getNicknameDescription(lang: Language): string {
  const descriptions: Record<Language, string> = {
    en: "Choose a nickname for your account. This will be visible to other players.",
    zh: "为您的帐户选择一个昵称。其他玩家将看到此昵称。",
    hi: "अपने खाते के लिए एक उपनाम चुनें। यह अन्य खिलाड़ियों को दिखाई देगा।",
    es: "Elige un apodo para tu cuenta. Será visible para otros jugadores.",
    fr: "Choisissez un pseudo pour votre compte. Il sera visible par les autres joueurs.",
    ar: "اختر اسمًا مستعارًا لحسابك. سيكون مرئيًا للاعبين الآخرين.",
    ru: "Выберите никнейм для аккаунта. Он будет виден другим игрокам.",
    tr: "Hesabın için bir takma ad seç. Diğer oyuncular bunu görecek.",
  };
  return descriptions[lang];
}

function getGoogleButtonText(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "Continue with Google",
    zh: "使用 Google 继续",
    hi: "Google से जारी रखें",
    es: "Continuar con Google",
    fr: "Continuer avec Google",
    ar: "المتابعة مع Google",
    ru: "Продолжить с Google",
    tr: "Google ile devam et",
  };
  return texts[lang];
}

function getOrText(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "or",
    zh: "或",
    hi: "या",
    es: "o",
    fr: "ou",
    ar: "أو",
    ru: "или",
    tr: "veya",
  };
  return texts[lang];
}

function getRegisterTab(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "Register",
    zh: "注册",
    hi: "पंजीकरण",
    es: "Registrar",
    fr: "S'inscrire",
    ar: "تسجيل",
    ru: "Регистрация",
    tr: "Kayıt Ol",
  };
  return texts[lang];
}

function getLoginTab(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "Login",
    zh: "登录",
    hi: "लॉगिन",
    es: "Iniciar sesión",
    fr: "Connexion",
    ar: "تسجيل الدخول",
    ru: "Вход",
    tr: "Giriş",
  };
  return texts[lang];
}

function getEmailLabel(lang: Language): string {
  const labels: Record<Language, string> = {
    en: "Email",
    zh: "电子邮件",
    hi: "ईमेल",
    es: "Correo electrónico",
    fr: "E-mail",
    ar: "البريد الإلكتروني",
    ru: "Электронная почта",
    tr: "E-posta",
  };
  return labels[lang];
}

function getPasswordLabel(lang: Language): string {
  const labels: Record<Language, string> = {
    en: "Password",
    zh: "密码",
    hi: "पासवर्ड",
    es: "Contraseña",
    fr: "Mot de passe",
    ar: "كلمة المرور",
    ru: "Пароль",
    tr: "Şifre",
  };
  return labels[lang];
}

function getConfirmPasswordLabel(lang: Language): string {
  const labels: Record<Language, string> = {
    en: "Confirm Password",
    zh: "确认密码",
    hi: "पासवर्ड की पुष्टि करें",
    es: "Confirmar contraseña",
    fr: "Confirmer le mot de passe",
    ar: "تأكيد كلمة المرور",
    ru: "Подтвердите пароль",
    tr: "Şifreyi Onayla",
  };
  return labels[lang];
}

function getRegisterButton(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "Create Account",
    zh: "创建帐户",
    hi: "खाता बनाएं",
    es: "Crear cuenta",
    fr: "Créer un compte",
    ar: "إنشاء حساب",
    ru: "Создать аккаунт",
    tr: "Hesap Oluştur",
  };
  return texts[lang];
}

function getLoginButton(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "Sign In",
    zh: "登录",
    hi: "साइन इन करें",
    es: "Iniciar sesión",
    fr: "Se connecter",
    ar: "تسجيل الدخول",
    ru: "Войти",
    tr: "Giriş Yap",
  };
  return texts[lang];
}

function getNicknameLabel(lang: Language): string {
  const labels: Record<Language, string> = {
    en: "Choose Your Nickname",
    zh: "选择您的昵称",
    hi: "अपना उपनाम चुनें",
    es: "Elige tu apodo",
    fr: "Choisissez votre pseudo",
    ar: "اختر اسمك المستعار",
    ru: "Выберите никнейм",
    tr: "Takma Adını Seç",
  };
  return labels[lang];
}

function getNicknamePlaceholder(lang: Language): string {
  const placeholders: Record<Language, string> = {
    en: "Enter nickname",
    zh: "输入昵称",
    hi: "उपनाम दर्ज करें",
    es: "Ingresa apodo",
    fr: "Entrez pseudo",
    ar: "أدخل الاسم المستعار",
    ru: "Введите никнейм",
    tr: "Takma ad gir",
  };
  return placeholders[lang];
}

function getNicknameHint(lang: Language): string {
  const hints: Record<Language, string> = {
    en: "3-20 characters, letters, numbers, and underscores only",
    zh: "3-20个字符，仅限字母、数字和下划线",
    hi: "3-20 अक्षर, केवल अक्षर, संख्या और अंडरस्कोर",
    es: "3-20 caracteres, solo letras, números y guiones bajos",
    fr: "3-20 caractères, lettres, chiffres et underscores uniquement",
    ar: "3-20 حرفًا، أحرف وأرقام وشرطات سفلية فقط",
    ru: "3-20 символов, только буквы, цифры и подчёркивания",
    tr: "3-20 karakter, sadece harf, rakam ve alt çizgi",
  };
  return hints[lang];
}

function getNicknameTooShort(lang: Language): string {
  const errors: Record<Language, string> = {
    en: "Nickname must be at least 3 characters",
    zh: "昵称至少需要3个字符",
    hi: "उपनाम कम से कम 3 अक्षर का होना चाहिए",
    es: "El apodo debe tener al menos 3 caracteres",
    fr: "Le pseudo doit contenir au moins 3 caractères",
    ar: "يجب أن يحتوي الاسم المستعار على 3 أحرف على الأقل",
    ru: "Никнейм должен содержать минимум 3 символа",
    tr: "Takma ad en az 3 karakter olmalı",
  };
  return errors[lang];
}

function getNicknameTooLong(lang: Language): string {
  const errors: Record<Language, string> = {
    en: "Nickname must be 20 characters or less",
    zh: "昵称不能超过20个字符",
    hi: "उपनाम 20 अक्षर या उससे कम होना चाहिए",
    es: "El apodo debe tener 20 caracteres o menos",
    fr: "Le pseudo doit contenir 20 caractères ou moins",
    ar: "يجب أن يحتوي الاسم المستعار على 20 حرفًا أو أقل",
    ru: "Никнейм должен содержать не более 20 символов",
    tr: "Takma ad 20 karakter veya daha az olmalı",
  };
  return errors[lang];
}

function getNicknameInvalidChars(lang: Language): string {
  const errors: Record<Language, string> = {
    en: "Only letters, numbers, and underscores allowed",
    zh: "仅允许字母、数字和下划线",
    hi: "केवल अक्षर, संख्या और अंडरस्कोर की अनुमति है",
    es: "Solo se permiten letras, números y guiones bajos",
    fr: "Seuls les lettres, chiffres et underscores sont autorisés",
    ar: "يُسمح فقط بالأحرف والأرقام والشرطات السفلية",
    ru: "Разрешены только буквы, цифры и подчёркивания",
    tr: "Sadece harf, rakam ve alt çizgi kullanılabilir",
  };
  return errors[lang];
}

function getSaveButton(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "Save Account",
    zh: "保存帐户",
    hi: "खाता सहेजें",
    es: "Guardar cuenta",
    fr: "Sauvegarder le compte",
    ar: "حفظ الحساب",
    ru: "Сохранить аккаунт",
    tr: "Hesabı Kaydet",
  };
  return texts[lang];
}

function getSuccessTitle(lang: Language): string {
  const titles: Record<Language, string> = {
    en: "Account Saved!",
    zh: "帐户已保存！",
    hi: "खाता सहेजा गया!",
    es: "¡Cuenta guardada!",
    fr: "Compte sauvegardé !",
    ar: "تم حفظ الحساب!",
    ru: "Аккаунт сохранён!",
    tr: "Hesap Kaydedildi!",
  };
  return titles[lang];
}

function getSuccessDescription(lang: Language): string {
  const descriptions: Record<Language, string> = {
    en: "Your progress has been saved. You can now log in anytime.",
    zh: "您的进度已保存。您现在可以随时登录。",
    hi: "आपकी प्रगति सहेजी गई है। अब आप कभी भी लॉगिन कर सकते हैं।",
    es: "Tu progreso ha sido guardado. Ahora puedes iniciar sesión en cualquier momento.",
    fr: "Votre progression a été sauvegardée. Vous pouvez vous connecter à tout moment.",
    ar: "تم حفظ تقدمك. يمكنك الآن تسجيل الدخول في أي وقت.",
    ru: "Ваш прогресс сохранён. Теперь вы можете входить в любое время.",
    tr: "İlerlemeniz kaydedildi. Artık istediğiniz zaman giriş yapabilirsiniz.",
  };
  return descriptions[lang];
}

function getConvertError(lang: Language): string {
  const errors: Record<Language, string> = {
    en: "Failed to save account. Please try again.",
    zh: "保存帐户失败。请重试。",
    hi: "खाता सहेजने में विफल। कृपया पुनः प्रयास करें।",
    es: "Error al guardar la cuenta. Por favor, inténtalo de nuevo.",
    fr: "Échec de la sauvegarde du compte. Veuillez réessayer.",
    ar: "فشل في حفظ الحساب. يرجى المحاولة مرة أخرى.",
    ru: "Не удалось сохранить аккаунт. Попробуйте ещё раз.",
    tr: "Hesap kaydedilemedi. Lütfen tekrar deneyin.",
  };
  return errors[lang];
}

function getEmailPasswordRequired(lang: Language): string {
  const messages: Record<Language, string> = {
    en: "Please enter email and password",
    zh: "请输入电子邮件和密码",
    hi: "कृपया ईमेल और पासवर्ड दर्ज करें",
    es: "Por favor ingresa email y contraseña",
    fr: "Veuillez entrer email et mot de passe",
    ar: "يرجى إدخال البريد الإلكتروني وكلمة المرور",
    ru: "Пожалуйста, введите email и пароль",
    tr: "Lütfen e-posta ve şifre girin",
  };
  return messages[lang];
}

function getPasswordMismatch(lang: Language): string {
  const messages: Record<Language, string> = {
    en: "Passwords do not match",
    zh: "密码不匹配",
    hi: "पासवर्ड मेल नहीं खाते",
    es: "Las contraseñas no coinciden",
    fr: "Les mots de passe ne correspondent pas",
    ar: "كلمات المرور غير متطابقة",
    ru: "Пароли не совпадают",
    tr: "Şifreler eşleşmiyor",
  };
  return messages[lang];
}

function getEmailVerificationTitle(lang: Language): string {
  const titles: Record<Language, string> = {
    en: "Verification Email Sent",
    zh: "验证邮件已发送",
    hi: "सत्यापन ईमेल भेजा गया",
    es: "Correo de verificación enviado",
    fr: "Email de vérification envoyé",
    ar: "تم إرسال بريد التحقق",
    ru: "Письмо подтверждения отправлено",
    tr: "Doğrulama E-postası Gönderildi",
  };
  return titles[lang];
}

function getEmailVerificationDesc(lang: Language): string {
  const descriptions: Record<Language, string> = {
    en: "Please check your email and verify your account, then sign in.",
    zh: "请检查您的电子邮件并验证您的帐户，然后登录。",
    hi: "कृपया अपना ईमेल जांचें और अपना खाता सत्यापित करें, फिर साइन इन करें।",
    es: "Por favor revisa tu correo y verifica tu cuenta, luego inicia sesión.",
    fr: "Veuillez vérifier votre email et confirmer votre compte, puis connectez-vous.",
    ar: "يرجى التحقق من بريدك الإلكتروني وتأكيد حسابك، ثم سجل الدخول.",
    ru: "Проверьте почту и подтвердите аккаунт, затем войдите.",
    tr: "Lütfen e-postanızı kontrol edin ve hesabınızı doğrulayın, ardından giriş yapın.",
  };
  return descriptions[lang];
}

function getCheckSpamText(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "Check your spam/junk folder if you don't see the email.",
    zh: "如果没有收到邮件，请检查垃圾邮件文件夹。",
    hi: "अगर ईमेल दिखाई नहीं दे रहा है तो स्पैम/जंक फ़ोल्डर जांचें।",
    es: "Revisa tu carpeta de spam si no ves el correo.",
    fr: "Vérifiez votre dossier spam si vous ne voyez pas l'email.",
    ar: "تحقق من مجلد الرسائل غير المرغوب فيها إذا لم تجد البريد.",
    ru: "Проверьте папку спам, если не видите письмо.",
    tr: "E-postayı göremiyorsanız spam/gereksiz klasörünü kontrol edin.",
  };
  return texts[lang];
}

function getResendText(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "Resend Verification Email",
    zh: "重新发送验证邮件",
    hi: "सत्यापन ईमेल पुनः भेजें",
    es: "Reenviar correo de verificación",
    fr: "Renvoyer l'email de vérification",
    ar: "إعادة إرسال بريد التحقق",
    ru: "Отправить письмо повторно",
    tr: "Doğrulama E-postasını Tekrar Gönder",
  };
  return texts[lang];
}
