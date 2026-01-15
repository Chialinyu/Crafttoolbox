import React, { ReactNode } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { ArrowLeft } from 'lucide-react';
import { Button } from './button';
import { motion } from 'motion/react';

interface ToolAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  variant?: 'ghost' | 'default' | 'outline' | 'secondary';
}

interface ToolPageLayoutProps {
  /**
   * Tool title (translation key or string)
   */
  title: string;
  
  /**
   * Tool description (translation key or string)
   */
  description: string;
  
  /**
   * Callback when back button is clicked
   */
  onBack: () => void;
  
  /**
   * Action buttons to show in the header (e.g., Undo, Redo, Reset, Download)
   */
  actions?: ToolAction[];
  
  /**
   * Main content area
   */
  children: ReactNode;
  
  /**
   * Optional custom back button text (defaults to 'home')
   */
  backButtonText?: string;
}

/**
 * Unified Tool Page Layout Component
 * Provides consistent header and structure for all tools
 */
export const ToolPageLayout: React.FC<ToolPageLayoutProps> = ({
  title,
  description,
  onBack,
  actions = [],
  children,
  backButtonText = 'home',
}) => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          {/* Back Button */}
          <Button type="button" variant="ghost" onClick={onBack} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t(backButtonText)}
          </Button>
          
          {/* Title & Actions Row */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-2">
            <div>
              <h2 className="text-3xl sm:text-4xl mb-2">{t(title)}</h2>
              <p className="text-muted-foreground">{t(description)}</p>
            </div>
            
            {/* Action Buttons */}
            {actions.length > 0 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {actions.map((action, index) => (
                  <Button
                    key={index}
                    type="button"
                    size="sm"
                    variant={action.variant || 'ghost'}
                    onClick={(e) => {
                      e.stopPropagation();
                      action.onClick();
                    }}
                    disabled={action.disabled}
                    title={action.title}
                  >
                    <action.icon className="h-4 w-4 mr-1" />
                    {t(action.label)}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Main Content */}
        {children}
      </div>
    </div>
  );
};

ToolPageLayout.displayName = 'ToolPageLayout';
