import { useState, Suspense, useEffect } from 'react';
import { LanguageProvider } from './contexts/LanguageContext';
import { Header } from './components/Header';
import { HomePage } from './components/HomePage';
import { MosaicGenerator } from './components/MosaicGeneratorV2';
import { VectorizerTool } from './components/VectorizerTool';
import { Footer } from './components/Footer';
import { Toaster } from './components/ui/sonner';
import { initGA, trackPageView } from '@/utils/analytics';

/**
 * Main App Component
 * - Wrapped with LanguageProvider for bilingual support (Chinese/English)
 * - Includes Header, Footer, and main content area
 * - Supports tool routing: HomePage, MosaicGenerator, VectorizerTool
 * - Google Analytics 4 integration
 * 
 * Version: 0.2.4 - Added GA4 integration
 */
function App() {
  const [currentTool, setCurrentTool] = useState<string | null>(null);

  // Initialize Google Analytics
  useEffect(() => {
    initGA();
  }, []);

  // Track page view when tool changes
  useEffect(() => {
    const pagePath = currentTool ? `/tool/${currentTool}` : '/';
    const pageTitle = currentTool 
      ? currentTool === 'mosaic-generator' ? 'Mosaic Generator' : 'Vectorizer Tool'
      : 'Craft ToolBox Home Page';
    trackPageView(pagePath, pageTitle);
  }, [currentTool]);

  const renderContent = () => {
    if (currentTool === 'mosaic-generator') {
      return <MosaicGenerator onBack={() => setCurrentTool(null)} />;
    }
    
    if (currentTool === 'vectorizer-tool') {
      return <VectorizerTool onBack={() => setCurrentTool(null)} />;
    }
    
    return <HomePage onSelectTool={setCurrentTool} />;
  };

  return (
    <LanguageProvider>
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1">
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
            {renderContent()}
          </Suspense>
        </main>
        <Footer />
        <Toaster position="bottom-right" richColors />
      </div>
    </LanguageProvider>
  );
}

App.displayName = 'App';

export default App;