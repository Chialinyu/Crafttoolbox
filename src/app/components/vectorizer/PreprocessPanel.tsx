import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { ChevronRight, Check, Sparkles } from 'lucide-react';
import { ColorPalette } from './ColorPalette';
import { extractColorInfo } from './utils/cvProcessing';
import { LIMITS } from './constants';

interface PreprocessPanelProps {
  blurRadius: number;
  threshold: number;
  useAutoThreshold: boolean;
  autoThresholdValue?: number;
  onBlurRadiusChange: (value: number) => void;
  onThresholdChange: (value: number) => void;
  onAutoThresholdToggle: (value: boolean) => void;
  onApplyPreprocess: () => void;
  isPreviewMode?: boolean;
  showColorClustering?: boolean;
  colorCount?: number;
  onColorCountChange?: (value: number) => void;
  mode?: 'line' | 'fill' | 'mixed';
  isEditMode?: boolean;
  onCancel?: () => void;
  previewImageData?: ImageData | null;
  onColorHighlight?: (index: number | null) => void;
  onMergeColors?: (indices: number[]) => void;
  selectedColorIndices?: number[];
  onColorSelect?: (indices: number[]) => void;
  // ❌ REMOVED: Props for Bezier Curves - now always uses Potrace fallback strategy
}

/**
 * PreprocessPanel Component - Simple version without Card wrapper
 * Designed to be embedded inside a Card in the parent component
 */
export const PreprocessPanel: React.FC<PreprocessPanelProps> = ({
  blurRadius,
  threshold,
  useAutoThreshold,
  onBlurRadiusChange,
  onThresholdChange,
  onAutoThresholdToggle,
  onApplyPreprocess,
  autoThresholdValue,
  isPreviewMode = true,
  showColorClustering = false,
  colorCount = 5,
  onColorCountChange,
  mode = 'line',
  isEditMode = false,
  onCancel,
  previewImageData,
  onColorHighlight,
  onMergeColors,
  selectedColorIndices,
  onColorSelect,
  // ❌ REMOVED: Props for Bezier Curves - now always uses Potrace fallback strategy
}) => {
  const { t } = useLanguage();

  // Determine which parameters to show based on mode
  const showThreshold = mode === 'line' || mode === 'mixed';
  const showColorCount = mode === 'fill' || mode === 'mixed';

  // State to hold extracted colors and selection
  const [extractedColors, setExtractedColors] = useState<Array<{
    color: [number, number, number];
    pixelCount: number;
    percentage: number;
  }>>([]);

  // Effect to extract colors from previewImageData
  useEffect(() => {
    if (previewImageData && showColorClustering) {
      const colors = extractColorInfo(previewImageData);
      setExtractedColors(colors);
    } else {
      setExtractedColors([]);
    }
  }, [previewImageData, showColorClustering]);

  return (
    <div className="space-y-6">
      {/* Blur Radius - Always shown */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label htmlFor="blur-radius">{t('blurRadius')}</Label>
          <span className="text-sm text-muted-foreground">{blurRadius}px</span>
        </div>
        <Slider
          id="blur-radius"
          min={0}
          max={10}
          step={1}
          value={[blurRadius]}
          onValueChange={(values) => onBlurRadiusChange(values[0])}
        />
        <p className="text-xs text-muted-foreground select-none">
          {t('reduceNoiseDesc')}
        </p>
      </div>

      {/* Threshold section - Only for line/mixed mode */}
      {showThreshold && (
        <>
          {/* Auto Threshold Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-threshold" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {t('autoThreshold')}
              </Label>
              <p className="text-xs text-muted-foreground select-none">
                {t('autoThresholdDesc')}
              </p>
            </div>
            <Switch
              id="auto-threshold"
              checked={useAutoThreshold}
              onCheckedChange={onAutoThresholdToggle}
            />
          </div>

          {/* Manual Threshold */}
          {!useAutoThreshold && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="threshold">{t('threshold')}</Label>
                <span className="text-sm text-muted-foreground">{threshold}</span>
              </div>
              <Slider
                id="threshold"
                min={0}
                max={255}
                step={1}
                value={[threshold]}
                onValueChange={(values) => onThresholdChange(values[0])}
              />
              <p className="text-xs text-muted-foreground select-none">
                {t('separateFgBgDesc')}
              </p>
            </div>
          )}

          {/* Show auto threshold value */}
          {useAutoThreshold && autoThresholdValue !== undefined && (
            <div className="p-3 bg-primary/5 rounded-lg">
              <p className="text-sm select-none">
                <span className="text-muted-foreground">{t('threshold')}: </span>
                <span className="font-semibold text-primary">{autoThresholdValue}</span>
              </p>
            </div>
          )}
        </>
      )}

      {/* Color Count - Only for fill/mixed mode */}
      {showColorCount && colorCount !== undefined && onColorCountChange && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="color-count">{t('colorCount')}</Label>
            <span className="text-sm text-muted-foreground">{colorCount}</span>
          </div>
          <Slider
            id="color-count"
            min={LIMITS.COLOR_COUNT_MIN}
            max={LIMITS.COLOR_COUNT_MAX}
            step={1}
            value={[colorCount]}
            onValueChange={(values) => onColorCountChange(values[0])}
          />
          <p className="text-xs text-muted-foreground select-none">
            {t('colorClustersDesc')}
          </p>
        </div>
      )}

      {/* Color Palette - Only for fill/mixed mode */}
      {showColorClustering && extractedColors.length > 0 && (
        <div className="space-y-2">
          <ColorPalette
            colors={extractedColors}
            selectedColorIndices={selectedColorIndices}
            onColorSelect={onColorSelect}
            onMergeColors={onMergeColors}
            onColorHover={onColorHighlight}
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {isEditMode && onCancel && (
          <Button variant="outline" onClick={onCancel} className="flex-1">
            {t('cancel')}
          </Button>
        )}
        <Button 
          onClick={onApplyPreprocess} 
          className="flex-1"
        >
          {isPreviewMode ? (
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              {t('confirmGenerate')}
            </span>
          ) : (
            t('applyThreshold')
          )}
        </Button>
      </div>
    </div>
  );
};

PreprocessPanel.displayName = 'PreprocessPanel';