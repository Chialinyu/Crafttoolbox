import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Footer Component
 * 
 * Displays copyright information at the bottom of the page.
 * 
 * Features:
 * - Bilingual support (Chinese/English)
 * - Dynamic year display
 * - Centered layout
 */
export const Footer: React.FC = () => {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-center text-center">
          <p className="text-sm text-[#A89F91]">
            © {currentYear} Carolyn Yu. {t('allRightsReserved')}
          </p>
        </div>
      </div>
    </footer>
  );
};