import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Language, t, LANGUAGES, getLanguageByCode } from "@/lib/i18n";

const STORAGE_KEY = 'preferredLanguage';

function getStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (stored === 'en' || stored === 'zh' || stored === 'hi' || stored === 'es' || stored === 'fr' || stored === 'ar' || stored === 'ru' || stored === 'tr')) {
      return stored as Language;
    }
  } catch {}
  return null;
}

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: Parameters<typeof t>[1]) => string;
  languages: typeof LANGUAGES;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ 
  children, 
  initialLanguage 
}: { 
  children: ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(() => {
    const storedLang = getStoredLanguage();
    return storedLang ?? initialLanguage ?? 'en';
  });

  useEffect(() => {
    if (initialLanguage && initialLanguage !== language) {
      setLanguageState(initialLanguage);
      try {
        localStorage.setItem(STORAGE_KEY, initialLanguage);
      } catch {}
    }
  }, [initialLanguage]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {}
  }, []);

  const translate = (key: Parameters<typeof t>[1]): string => {
    return t(language, key);
  };

  return (
    <LanguageContext.Provider value={{ 
      language, 
      setLanguage, 
      t: translate,
      languages: LANGUAGES 
    }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
