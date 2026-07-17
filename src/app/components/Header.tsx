import { useLanguage } from '../contexts/LanguageContext';
import { Sparkles, Globe } from 'lucide-react';
import { Button } from './ui/button';

interface HeaderProps {
  onHome?: () => void;
}

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
 * - Clickable title returns to home when onHome is provided
 */
export function Header({ onHome }: HeaderProps) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <button
            type="button"
            onClick={onHome}
            className={`flex items-center gap-2 rounded-md text-left ${
              onHome
                ? 'cursor-pointer hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                : 'cursor-default'
            }`}
            aria-label={t('backToHome')}
            disabled={!onHome}
          >
            <Sparkles className="h-6 w-6 text-primary" aria-hidden />
            <span className="text-xl sm:text-2xl font-semibold">{t('siteTitle')}</span>
          </button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            className="flex items-center gap-2"
            aria-label={language === 'zh' ? 'Switch to English' : '切換至中文'}
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
