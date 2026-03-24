import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, AlertCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Language } from "@/lib/i18n";
import SaveAccountDialog from "./SaveAccountDialog";
import { cn } from "@/lib/utils";

interface GuestRestrictionBannerProps {
  feature?: string;
  variant?: "inline" | "card" | "compact";
  className?: string;
}

export default function GuestRestrictionBanner({ 
  feature, 
  variant = "card",
  className 
}: GuestRestrictionBannerProps) {
  const { language } = useLanguage();
  const [saveAccountOpen, setSaveAccountOpen] = useState(false);

  const message = feature 
    ? getFeatureRestriction(language, feature) 
    : getGenericRestriction(language);

  if (variant === "compact") {
    return (
      <>
        <div className={cn("flex items-center gap-2 text-xs text-amber-400/80", className)}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{message}</span>
          <Button
            variant="link"
            size="sm"
            onClick={() => setSaveAccountOpen(true)}
            className="p-0 h-auto text-amber-400 hover:text-amber-300 underline"
            data-testid="button-register-compact"
          >
            {getRegisterLink(language)}
          </Button>
        </div>
        <SaveAccountDialog open={saveAccountOpen} onOpenChange={setSaveAccountOpen} />
      </>
    );
  }

  if (variant === "inline") {
    return (
      <>
        <div className={cn("flex flex-col items-center gap-2 py-2", className)}>
          <p className="text-xs text-amber-400/80 text-center">{message}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSaveAccountOpen(true)}
            className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
            data-testid="button-register-inline"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {getRegisterButtonText(language)}
          </Button>
        </div>
        <SaveAccountDialog open={saveAccountOpen} onOpenChange={setSaveAccountOpen} />
      </>
    );
  }

  return (
    <>
      <div className={cn(
        "flex flex-col items-center justify-center gap-3 p-6 rounded-lg border border-amber-500/30 bg-amber-500/5",
        className
      )}>
        <AlertCircle className="w-8 h-8 text-amber-400" />
        <p className="text-sm text-amber-400/90 text-center">{message}</p>
        <Button
          onClick={() => setSaveAccountOpen(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white"
          data-testid="button-register-card"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          {getRegisterButtonText(language)}
        </Button>
      </div>
      <SaveAccountDialog open={saveAccountOpen} onOpenChange={setSaveAccountOpen} />
    </>
  );
}

function getGenericRestriction(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "Register to access this feature",
    zh: "注册后才能使用此功能",
    hi: "इस सुविधा का उपयोग करने के लिए पंजीकरण करें",
    es: "Regístrate para acceder a esta función",
    fr: "Inscrivez-vous pour accéder à cette fonctionnalité",
    ar: "سجل للوصول إلى هذه الميزة",
    ru: "Зарегистрируйтесь для доступа к этой функции",
    tr: "Bu özelliğe erişmek için kayıt ol",
  };
  return texts[lang];
}

function getFeatureRestriction(lang: Language, feature: string): string {
  const templates: Record<Language, string> = {
    en: `Register to use ${feature}`,
    zh: `注册后才能使用${feature}`,
    hi: `${feature} का उपयोग करने के लिए पंजीकरण करें`,
    es: `Regístrate para usar ${feature}`,
    fr: `Inscrivez-vous pour utiliser ${feature}`,
    ar: `سجل لاستخدام ${feature}`,
    ru: `Зарегистрируйтесь, чтобы использовать ${feature}`,
    tr: `${feature} kullanmak için kayıt ol`,
  };
  return templates[lang];
}

function getRegisterButtonText(lang: Language): string {
  const texts: Record<Language, string> = {
    en: "Register Now",
    zh: "立即注册",
    hi: "अभी पंजीकरण करें",
    es: "Regístrate ahora",
    fr: "S'inscrire maintenant",
    ar: "سجل الآن",
    ru: "Зарегистрироваться",
    tr: "Şimdi Kayıt Ol",
  };
  return texts[lang];
}

function getRegisterLink(lang: Language): string {
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
