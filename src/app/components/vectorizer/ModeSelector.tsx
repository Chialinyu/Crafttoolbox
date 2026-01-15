import React from 'react';
import { Pen, PaintBucket, Layers, Lightbulb } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { cn } from '../ui/utils';

export type VectorizationMode = 'line' | 'fill' | 'mixed';

interface ModeSelectorProps {
  selectedMode: VectorizationMode;
  onModeChange: (mode: VectorizationMode) => void;
}

interface ModeOption {
  mode: VectorizationMode;
  icon: React.ElementType;
  titleKey: string;
  descKey: string;
  useCaseKey: string;
}

const modeOptions: ModeOption[] = [
  {
    mode: 'line',
    icon: Pen,
    titleKey: 'modeLineTitle',
    descKey: 'modeLineDesc',
    useCaseKey: 'modeLineUseCase',
  },
  {
    mode: 'fill',
    icon: PaintBucket,
    titleKey: 'modeFillTitle',
    descKey: 'modeFillDesc',
    useCaseKey: 'modeFillUseCase',
  },
  {
    mode: 'mixed',
    icon: Layers,
    titleKey: 'modeMixedTitle',
    descKey: 'modeMixedDesc',
    useCaseKey: 'modeMixedUseCase',
  },
];

/**
 * ModeSelector Component
 * 
 * Allows users to choose vectorization mode:
 * - Line: Single-color line art (sketches, logos, text)
 * - Fill: Multi-color filled regions (illustrations, flat designs)
 * - Mixed: Combination of lines and fills (comics, complex illustrations)
 */
export const ModeSelector: React.FC<ModeSelectorProps> = ({
  selectedMode,
  onModeChange,
}) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      {modeOptions.map((option) => {
        const Icon = option.icon;
        const isSelected = selectedMode === option.mode;

        return (
          <button
            key={option.mode}
            onClick={() => onModeChange(option.mode)}
            className={cn(
              'w-full text-left p-4 rounded-lg border-2 transition-all',
              'hover:border-accent hover:bg-accent/5',
              isSelected
                ? 'border-accent bg-accent/10 shadow-sm'
                : 'border-border bg-card'
            )}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  isSelected ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="w-5 h-5" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-foreground">
                    {t(option.titleKey)}
                  </h4>
                  {isSelected && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                      {t('selected')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {t(option.descKey)}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
                  <Lightbulb className="h-3.5 w-3.5" />
                  <span>{t(option.useCaseKey)}</span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

ModeSelector.displayName = 'ModeSelector';