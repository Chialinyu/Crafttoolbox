import React, { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp, Grid3x3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Slider } from '../ui/slider';
import { CustomColorPicker } from '../CustomColorPicker';

interface TileSettingsPanelProps {
  tileSize: number;
  tileSpacing: number;
  spacingColor: string;
  showSpacingColorPicker: boolean;
  onTileSizeChange: (value: number) => void;
  onTileSpacingChange: (value: number) => void;
  onSpacingColorChange: (value: string) => void;
  onSpacingColorPickerToggle: (value: boolean) => void;
}

export const TileSettingsPanel: React.FC<TileSettingsPanelProps> = ({
  tileSize,
  tileSpacing,
  spacingColor,
  showSpacingColorPicker,
  onTileSizeChange,
  onTileSpacingChange,
  onSpacingColorChange,
  onSpacingColorPickerToggle,
}) => {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <Card>
      <CardHeader 
        className={`cursor-pointer select-none ${!isExpanded ? 'pb-5' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Grid3x3 className="h-5 w-5" />
            <CardTitle>{t('tileSettings')}</CardTitle>
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
            style={{ overflow: showSpacingColorPicker ? 'visible' : 'hidden' }}
          >
            <CardContent className="space-y-4 pt-0">
              <div>
                <Label>{t('tileSize')}: {tileSize}px</Label>
                <Slider
                  value={[tileSize]}
                  onValueChange={(v) => onTileSizeChange(v[0])}
                  min={10}
                  max={50}
                  step={1}
                  className="mt-2"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <Label>{t('tileSpacing')}: {tileSpacing}px</Label>
                <Slider
                  value={[tileSpacing]}
                  onValueChange={(v) => onTileSpacingChange(v[0])}
                  min={0}
                  max={10}
                  step={1}
                  className="mt-2"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <Label>{t('spacingColor')}</Label>
                <div className="flex gap-2 mt-2 relative">
                  <div className="relative">
                    <div
                      data-color-picker-trigger
                      className="w-16 h-10 rounded border-2 border-border cursor-pointer hover:border-primary transition-colors"
                      style={{ backgroundColor: spacingColor }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSpacingColorPickerToggle(!showSpacingColorPicker);
                      }}
                    />
                    
                    {/* Custom Color Picker */}
                    {showSpacingColorPicker && (
                      <div 
                        data-color-picker-trigger
                        className="absolute left-0 top-full mt-2 z-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CustomColorPicker
                          color={spacingColor}
                          onChange={onSpacingColorChange}
                          onClose={() => onSpacingColorPickerToggle(false)}
                        />
                      </div>
                    )}
                  </div>
                  
                  <Input
                    type="text"
                    value={spacingColor}
                    onChange={(e) => onSpacingColorChange(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1"
                  />
                </div>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};