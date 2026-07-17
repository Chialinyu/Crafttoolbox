import { useState, Suspense, useEffect, useCallback } from 'react';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { Header } from './components/Header';
import { HomePage } from './components/HomePage';
import { MosaicGenerator } from './components/MosaicGenerator';
import { VectorizerTool } from './components/VectorizerTool';
import { Footer } from './components/Footer';
import { Toaster } from './components/ui/sonner';
import { initGA, trackPageView } from '@/utils/analytics';

type ToolId = 'mosaic-generator' | 'vectorizer-tool';

const TOOL_FROM_HASH: Record<string, ToolId> = {
  mosaic: 'mosaic-generator',
  'mosaic-generator': 'mosaic-generator',
  vectorizer: 'vectorizer-tool',
  'vectorizer-tool': 'vectorizer-tool',
};

function toolToHash(tool: ToolId | null): string {
  if (tool === 'mosaic-generator') return '#/mosaic';
  if (tool === 'vectorizer-tool') return '#/vectorizer';
  return '#/';
}

function toolFromHash(hash: string): ToolId | null {
  const key = hash.replace(/^#\/?/, '').split('?')[0];
  if (!key) return null;
  return TOOL_FROM_HASH[key] ?? null;
}

/**
 * Main App Component
 * - Wrapped with LanguageProvider for bilingual support (Chinese/English)
 * - Includes Header, Footer, and main content area
 * - Hash routing for deep links without React Router
 * - Google Analytics 4 integration
 */
function AppContent() {
  const { t } = useLanguage();
  const [currentTool, setCurrentTool] = useState<ToolId | null>(() =>
    typeof window !== 'undefined' ? toolFromHash(window.location.hash) : null
  );

  // Initialize Google Analytics
  useEffect(() => {
    initGA();
  }, []);

  // Sync tool -> hash
  useEffect(() => {
    const next = toolToHash(currentTool);
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', next);
    }
  }, [currentTool]);

  // Sync hash -> tool (browser back/forward)
  useEffect(() => {
    const onHashChange = () => {
      setCurrentTool(toolFromHash(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Track page view when tool changes
  useEffect(() => {
    const pagePath = currentTool ? `/tool/${currentTool}` : '/';
    const pageTitle = currentTool
      ? currentTool === 'mosaic-generator'
        ? 'Mosaic Generator'
        : 'Vectorizer Tool'
      : 'Craft ToolBox Home Page';
    trackPageView(pagePath, pageTitle);
  }, [currentTool]);

  const goHome = useCallback(() => setCurrentTool(null), []);

  const renderContent = () => {
    if (currentTool === 'mosaic-generator') {
      return <MosaicGenerator onBack={goHome} />;
    }

    if (currentTool === 'vectorizer-tool') {
      return <VectorizerTool onBack={goHome} />;
    }

    return (
      <HomePage
        onSelectTool={(id) => {
          if (id === 'mosaic-generator' || id === 'vectorizer-tool') {
            setCurrentTool(id);
          }
        }}
      />
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header onHome={goHome} />
      <main className="flex-1">
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-screen" role="status">
              {t('loading')}
            </div>
          }
        >
          {renderContent()}
        </Suspense>
      </main>
      <Footer />
      <Toaster position="bottom-right" richColors />
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

App.displayName = 'App';

export default App;
