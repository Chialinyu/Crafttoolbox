import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { translations } from './translations';

/**
 * Language Context for bilingual support (Chinese/English)
 */
type Language = 'zh' | 'en';

/**
 * Detect browser language and determine if user prefers Chinese
 * Returns 'zh' if browser language is Chinese-related, otherwise 'en'
 */
function detectBrowserLanguage(): Language {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') return 'en';
  
  // Get browser language (e.g., "zh-CN", "zh-TW", "en-US", "ja-JP")
  const browserLang = navigator.language || (navigator as any).userLanguage;
  
  // Check if language starts with 'zh' (covers zh, zh-CN, zh-TW, zh-HK, etc.)
  if (browserLang && browserLang.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  
  // Default to English for all other languages
  return 'en';
}

/**
 * Get initial language from localStorage or browser detection
 */
function getInitialLanguage(): Language {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') return 'en';
  
  // First, check if user has manually set a preference (stored in localStorage)
  const savedLanguage = localStorage.getItem('preferredLanguage') as Language | null;
  if (savedLanguage === 'zh' || savedLanguage === 'en') {
    return savedLanguage;
  }
  
  // If no saved preference, detect from browser
  return detectBrowserLanguage();
}

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage());

  // Wrapper to save language preference
  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferredLanguage', lang);
    }
  };

  const t = (key: string): string => {
    return translations[key]?.[language] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

LanguageProvider.displayName = 'LanguageProvider';

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    // During hot reload or development, context might be temporarily undefined
    // Return a default implementation instead of throwing to prevent errors
    if (typeof import.meta !== 'undefined' && import.meta.hot) {
      // Silently return default during hot reload (don't spam console)
      return {
        language: 'en' as Language,
        setLanguage: () => {},
        t: (key: string) => key,
      };
    }
    // Only throw in production if genuinely outside provider
    if (typeof window !== 'undefined') {
      throw new Error('useLanguage must be used within a LanguageProvider');
    }
    // SSR fallback
    return {
      language: 'en' as Language,
      setLanguage: () => {},
      t: (key: string) => key,
    };
  }
  return context;
}

// Export LanguageContext for debugging if needed
export { LanguageContext };