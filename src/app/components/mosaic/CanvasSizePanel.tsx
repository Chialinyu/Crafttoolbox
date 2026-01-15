import React, { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp, Maximize2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { calculateTotalTiles } from '../../../utils/mosaicUtils';

interface CanvasSizePanelProps {
  mosaicWidth: number;
  mosaicHeight: number;
  keepAspectRatio: boolean;
  tileSize: number;
  tileSpacing: number;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onKeepAspectRatioChange: (value: boolean) => void;
  onSizeChange?: (width: number, height: number) => void; // Optional immediate callback
}

export const CanvasSizePanel: React.FC<CanvasSizePanelProps> = ({
  mosaicWidth,
  mosaicHeight,
  keepAspectRatio,
  tileSize,
  tileSpacing,
  onWidthChange,
  onHeightChange,
  onKeepAspectRatioChange,
  onSizeChange,
}) => {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(true);
  const totalTiles = calculateTotalTiles(mosaicWidth, mosaicHeight);

  return (
    <Card>
      <CardHeader 
        className={`cursor-pointer select-none ${!isExpanded ? 'pb-5' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Maximize2 className="h-5 w-5" />
            <CardTitle>{t('canvasSize')}</CardTitle>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <CardContent className="space-y-4 pt-0">
              <div className="flex items-center justify-between">
                <Label>{t('keepAspectRatio')}</Label>
                <Switch
                  checked={keepAspectRatio}
                  onCheckedChange={onKeepAspectRatioChange}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <Label>{t('mosaicWidth')}: {mosaicWidth}</Label>
                <Slider
                  value={[mosaicWidth]}
                  onValueChange={(v) => onWidthChange(v[0])}
                  min={10}
                  max={150}
                  step={1}
                  className="mt-2"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <Label>{t('mosaicHeight')}: {mosaicHeight}</Label>
                <Slider
                  value={[mosaicHeight]}
                  onValueChange={(v) => onHeightChange(v[0])}
                  min={10}
                  max={150}
                  step={1}
                  className="mt-2"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div className="text-sm text-muted-foreground pt-2 border-t select-none">
                {t('totalTiles')}: {totalTiles.toLocaleString()} {t('tiles')}
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};