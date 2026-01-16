import { useLanguage } from '../contexts/LanguageContext';
import { Sparkles, Globe } from 'lucide-react';
import { Button } from './ui/button';
import { logLanguageChange } from '@/utils/analytics';

/**
 * Header Component
 * 
 * Displays site title and language toggle button.
 * Sticky positioned at the top of the page.
 * 
 * Features:
 * - Bilingual support (Chinese/English)
 * - Responsive design
 * - Backdrop blur effect
 * - Analytics tracking for language changes
 */
export function Header() {
  const { language, setLanguage, t } = useLanguage();

  const handleLanguageToggle = () => {
    const newLanguage = language === 'zh' ? 'en' : 'zh';
    setLanguage(newLanguage);
    logLanguageChange(newLanguage); // Track language change
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-xl sm:text-2xl">{t('siteTitle')}</h1>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLanguageToggle}
            className="flex items-center gap-2"
          >
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">{language === 'zh' ? 'EN' : '中文'}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

Header.displayName = 'Header';