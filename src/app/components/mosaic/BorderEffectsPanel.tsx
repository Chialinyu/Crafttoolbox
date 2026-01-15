import React, { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp, Frame } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { CustomColorPicker } from '../CustomColorPicker';

interface BorderEffectsPanelProps {
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
  showBorderColorPicker: boolean;
  effect3D: boolean;
  tileDepth: number;
  onBorderEnabledChange: (value: boolean) => void;
  onBorderColorChange: (value: string) => void;
  onBorderWidthChange: (value: number) => void;
  onBorderColorPickerToggle: (value: boolean) => void;
  onEffect3DChange: (value: boolean) => void;
  onTileDepthChange: (value: number) => void;
}

export const BorderEffectsPanel: React.FC<BorderEffectsPanelProps> = ({
  borderEnabled,
  borderColor,
  borderWidth,
  showBorderColorPicker,
  effect3D,
  tileDepth,
  onBorderEnabledChange,
  onBorderColorChange,
  onBorderWidthChange,
  onBorderColorPickerToggle,
  onEffect3DChange,
  onTileDepthChange,
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
            <Frame className="h-5 w-5" />
            <CardTitle>{t('borderAndEffects')}</CardTitle>
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
            style={{ overflow: showBorderColorPicker ? 'visible' : 'hidden' }}
          >
            <CardContent className="space-y-4 pt-0">
              <div className="flex items-center justify-between">
                <Label>{t('borderEnabled')}</Label>
                <Switch
                  checked={borderEnabled}
                  onCheckedChange={onBorderEnabledChange}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {borderEnabled && (
                <>
                  <div>
                    <Label>{t('borderWidth')}: {borderWidth}px</Label>
                    <Slider
                      value={[borderWidth]}
                      onValueChange={(v) => onBorderWidthChange(v[0])}
                      min={5}
                      max={50}
                      step={1}
                      className="mt-2"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div>
                    <Label>{t('borderColor')}</Label>
                    <div className="flex gap-2 mt-2 relative">
                      <div className="relative">
                        <div
                          data-color-picker-trigger
                          className="w-16 h-10 rounded border-2 border-border cursor-pointer hover:border-primary transition-colors"
                          style={{ backgroundColor: borderColor }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onBorderColorPickerToggle(!showBorderColorPicker);
                          }}
                        />
                        
                        {/* Custom Color Picker */}
                        {showBorderColorPicker && (
                          <div 
                            data-color-picker-trigger
                            className="absolute left-0 top-full mt-2 z-50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <CustomColorPicker
                              color={borderColor}
                              onChange={onBorderColorChange}
                              onClose={() => onBorderColorPickerToggle(false)}
                            />
                          </div>
                        )}
                      </div>
                      
                      <Input
                        type="text"
                        value={borderColor}
                        onChange={(e) => onBorderColorChange(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between pt-2 border-t">
                <Label>{t('effect3D')}</Label>
                <Switch
                  checked={effect3D}
                  onCheckedChange={onEffect3DChange}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {effect3D && (
                <div>
                  <Label>{t('tileDepth')}: {tileDepth}px</Label>
                  <Slider
                    value={[tileDepth]}
                    onValueChange={(v) => onTileDepthChange(v[0])}
                    min={1}
                    max={10}
                    step={1}
                    className="mt-2"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};