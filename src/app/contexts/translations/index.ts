/**
 * Centralized translations export
 * 
 * This file combines all translation modules into a single object.
 * Benefits:
 * 1. Easy to maintain - each tool has its own translation file
 * 2. Fast editing - only edit the relevant module file
 * 3. Clear organization - translations grouped by feature
 * 4. Scalable - add new tools without bloating a single file
 */

import { commonTranslations } from './common';
import { homeTranslations } from './home';
import { mosaicTranslations } from './mosaic';
import { vectorizerTranslations } from './vectorizer';

export const translations: {
  [key: string]: {
    zh: string;
    en: string;
  };
} = {
  ...commonTranslations,
  ...homeTranslations,
  ...mosaicTranslations,
  ...vectorizerTranslations,
};

export type TranslationKey = keyof typeof translations;
